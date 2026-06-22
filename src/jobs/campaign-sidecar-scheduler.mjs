import {
  initializeCampaignRuntimeTracking,
  recordSidecarEvent
} from '../runtime/state-delta-gateway.mjs';

const WORKERS = Object.freeze({
  continuity: {
    roleId: 'continuityTracker',
    allowedRoots: ['continuity', 'mission', 'commandLog']
  },
  relationship: {
    roleId: 'relationshipEvaluator',
    allowedRoots: ['relationships', 'crew']
  },
  crew: {
    roleId: 'crewDirector',
    allowedRoots: ['crew']
  },
  ship: {
    roleId: 'shipDirector',
    allowedRoots: ['ship']
  },
  commandBearing: {
    roleId: 'commandBearingEvaluator',
    allowedRoots: ['commandStyle', 'commandCulture']
  },
  sideMission: {
    roleId: 'sideMissionSignalDetector',
    allowedRoots: ['sideMissions', 'pressureLedger']
  }
});

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function timestamp(now) {
  return typeof now === 'function' ? now() : (now || new Date().toISOString());
}

function parseProposal(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  const text = String(value || '').trim();
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = fenced || text.match(/\{[\s\S]*\}/)?.[0] || '';
  try { return JSON.parse(source); } catch { return null; }
}

function sidecarContext(campaignState, turnContext) {
  return {
    campaignId: campaignState.campaign?.id,
    revision: campaignState.runtimeTracking?.revision || 0,
    mission: {
      activeMissionId: campaignState.mission?.activeMissionId,
      activePhaseId: campaignState.mission?.activePhaseId,
      knownFacts: campaignState.mission?.knownFacts,
      formalObjectives: campaignState.mission?.formalObjectives,
      activeDecisionPoints: campaignState.mission?.activeDecisionPoints
    },
    player: {
      name: campaignState.player?.name,
      rank: campaignState.player?.rank,
      billet: campaignState.player?.billet,
      commandBearing: {
        inspiration: campaignState.commandStyle?.inspiration
          ? {
              rank: campaignState.commandStyle.inspiration.rank,
              marks: campaignState.commandStyle.inspiration.marks,
              points: campaignState.commandStyle.inspiration.points
            }
          : null,
        resolve: campaignState.commandStyle?.resolve
          ? {
              rank: campaignState.commandStyle.resolve.rank,
              marks: campaignState.commandStyle.resolve.marks,
              points: campaignState.commandStyle.resolve.points
            }
          : null
      }
    },
    crew: cloneJson(campaignState.crew || {}),
    relationships: cloneJson(campaignState.relationships || {}),
    ship: cloneJson(campaignState.ship || {}),
    pressureLedger: cloneJson(campaignState.pressureLedger || {}),
    sideMissions: cloneJson(campaignState.sideMissions || {}),
    turn: cloneJson(turnContext)
  };
}

function proposalPrompt(workerKey, worker, campaignState, turnContext) {
  const revision = campaignState.runtimeTracking?.revision || 0;
  return [
    `You are Directive's ${workerKey} support worker.`,
    'Analyze the committed turn and propose only durable state changes supported by evidence in the supplied context.',
    'Return one JSON object only. Do not narrate. Do not expose internal reasoning.',
    `Authorized top-level roots: ${worker.allowedRoots.join(', ')}.`,
    'Allowed operations: set, append, merge, remove. Paths use dot notation and must begin with an authorized root.',
    'Use an empty operations array when no durable change is warranted.',
    '',
    `Required shape: {"id":"...","workerId":"${workerKey}","baseRevision":${revision},"operations":[{"op":"set","path":"${worker.allowedRoots[0]}.example","value":null}],"summary":"..."}`,
    '',
    `Context:\n${JSON.stringify(sidecarContext(campaignState, turnContext), null, 2)}`
  ].join('\n');
}

export function createCampaignSidecarScheduler({
  generationRouter,
  stateDeltaGateway,
  getCampaignState,
  setCampaignState,
  persistCampaignState,
  syncPromptContext = null,
  now = null
} = {}) {
  if (!generationRouter?.generate) throw new Error('CampaignSidecarScheduler requires generationRouter.generate.');
  if (!stateDeltaGateway?.applyOperations) throw new Error('CampaignSidecarScheduler requires stateDeltaGateway.applyOperations.');
  if (typeof getCampaignState !== 'function' || typeof setCampaignState !== 'function') {
    throw new Error('CampaignSidecarScheduler requires campaign state callbacks.');
  }
  if (typeof persistCampaignState !== 'function') throw new Error('CampaignSidecarScheduler requires persistCampaignState.');

  let queue = Promise.resolve();

  async function journal(event, summary) {
    const next = recordSidecarEvent(initializeCampaignRuntimeTracking(getCampaignState()), {
      recordedAt: timestamp(now),
      ...event
    });
    setCampaignState(next);
    await persistCampaignState(next, summary || `Recorded ${event.workerId || 'sidecar'} ${event.status || 'event'}.`);
    return next;
  }

  async function runWorker(workerKey, turnContext) {
    const worker = WORKERS[workerKey];
    if (!worker) return { workerKey, status: 'skipped', reason: 'unknown-worker' };
    const state = initializeCampaignRuntimeTracking(getCampaignState());
    const baseRevision = state.runtimeTracking.revision;
    const response = await generationRouter.generate(worker.roleId, {
      systemPrompt: 'Return one strict JSON state-delta proposal. No markdown, prose, or private reasoning.',
      prompt: proposalPrompt(workerKey, worker, state, turnContext),
      maxTokens: 1800
    });
    if (!response.ok) {
      const error = cloneJson(response.error);
      await journal({
        id: `sidecar:${workerKey}:${baseRevision}:${Date.now()}`,
        workerId: workerKey,
        roleId: worker.roleId,
        status: 'failed',
        baseRevision,
        error
      }, `${workerKey} sidecar failed without mutating campaign state.`);
      return { workerKey, status: 'failed', error };
    }
    const proposal = parseProposal(response.response?.text ?? response.response?.content ?? response.response);
    if (!proposal || !Array.isArray(proposal.operations)) {
      const error = {
        code: 'DIRECTIVE_SIDECAR_INVALID_PROPOSAL',
        message: 'Worker did not return a valid state-delta proposal.'
      };
      await journal({
        id: `sidecar:${workerKey}:${baseRevision}:${Date.now()}`,
        workerId: workerKey,
        roleId: worker.roleId,
        status: 'rejected',
        baseRevision,
        error
      }, `${workerKey} sidecar proposal was rejected.`);
      return { workerKey, status: 'rejected', error };
    }

    proposal.workerId = workerKey;
    proposal.source = `sidecar:${workerKey}`;
    proposal.baseRevision = baseRevision;
    proposal.ingressId = turnContext.ingressId || null;
    proposal.turnId = turnContext.turnId || null;
    proposal.outcomeId = turnContext.outcomeId || null;

    if (proposal.operations.length === 0) {
      await journal({
        id: proposal.id || `sidecar:${workerKey}:${baseRevision}:no-change`,
        workerId: workerKey,
        roleId: worker.roleId,
        status: 'noChange',
        baseRevision,
        summary: proposal.summary || 'No durable state change proposed.'
      }, `${workerKey} sidecar completed with no durable change.`);
      return { workerKey, status: 'noChange', proposal: cloneJson(proposal) };
    }

    try {
      const applied = await stateDeltaGateway.applyOperations(proposal, {
        allowedRoots: worker.allowedRoots
      });
      setCampaignState(applied.campaignState);
      if (typeof syncPromptContext === 'function') {
        const synchronized = await syncPromptContext(applied.campaignState, {
          workerKey,
          proposal: cloneJson(proposal)
        });
        if (synchronized) {
          applied.campaignState = synchronized;
          setCampaignState(synchronized);
          await persistCampaignState(synchronized, `${workerKey} sidecar prompt context synchronized.`);
        }
      }
      await journal({
        id: proposal.id || `sidecar:${workerKey}:${baseRevision}:${applied.revision}`,
        workerId: workerKey,
        roleId: worker.roleId,
        status: 'applied',
        baseRevision,
        appliedRevision: applied.revision,
        summary: proposal.summary || `${proposal.operations.length} operation(s) applied.`
      }, `Applied ${workerKey} sidecar update.`);
      return {
        workerKey,
        status: 'applied',
        proposal: cloneJson(proposal),
        revision: applied.revision,
        domains: applied.domains
      };
    } catch (error) {
      const failure = {
        code: error?.code || 'DIRECTIVE_SIDECAR_REJECTED',
        message: error?.message || String(error),
        details: cloneJson(error?.details || null)
      };
      await journal({
        id: proposal.id || `sidecar:${workerKey}:${baseRevision}:rejected`,
        workerId: workerKey,
        roleId: worker.roleId,
        status: 'rejected',
        baseRevision,
        summary: proposal.summary || null,
        error: failure
      }, `${workerKey} sidecar proposal was rejected by the state gateway.`);
      return { workerKey, status: 'rejected', error: failure };
    }
  }

  function schedule({ workerPlan = {}, turnContext = {} } = {}) {
    const requested = Object.keys(WORKERS).filter((key) => workerPlan[key] === true);
    const job = async () => {
      const results = [];
      for (const workerKey of requested) results.push(await runWorker(workerKey, turnContext));
      return results;
    };
    queue = queue.then(job, job);
    return queue;
  }

  return {
    schedule,
    pending: () => queue
  };
}

export const __campaignSidecarSchedulerTestHooks = Object.freeze({
  WORKERS,
  parseProposal,
  sidecarContext,
  proposalPrompt
});
