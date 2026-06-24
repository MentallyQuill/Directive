import {
  initializeCampaignRuntimeTracking,
  recordSidecarEvent
} from '../runtime/state-delta-gateway.mjs';
import { allowedRootsForModelRole } from '../generation/model-call-authority-matrix.mjs';
import { parseStateDeltaProposalOutput } from './sidecar-output-contracts.mjs';

const WORKERS = Object.freeze({
  continuity: {
    roleId: 'continuityTracker',
    allowedRoots: allowedRootsForModelRole('continuityTracker')
  },
  relationship: {
    roleId: 'relationshipEvaluator',
    allowedRoots: allowedRootsForModelRole('relationshipEvaluator')
  },
  crew: {
    roleId: 'crewDirector',
    allowedRoots: allowedRootsForModelRole('crewDirector')
  },
  ship: {
    roleId: 'shipDirector',
    allowedRoots: allowedRootsForModelRole('shipDirector')
  },
  commandBearing: {
    roleId: 'commandBearingEvaluator',
    allowedRoots: allowedRootsForModelRole('commandBearingEvaluator')

  }
});

const WORKER_BOUNDARY_NOTES = Object.freeze({
  continuity: [
    'Owns continuity notes and mission known-fact cleanup only.',
    'Do not append or rewrite Command Log entries; committed Director turns and the Command Log summary sidecar own that surface.',
    'Do not write relationships, crew condition, ship condition, or command-bearing state.'
  ],
  relationship: [
    'Owns relationship records and relationship-relevant crew annotations only.',
    'Do not write continuity, mission, command-log, ship, or command-bearing state.'
  ],
  crew: [
    'Owns crew condition, assignments, rosters, casualties, and durable crew annotations only.',
    'Do not write relationship logs, continuity notes, mission state, command-log entries, or ship state.'
  ],
  ship: [
    'Owns ship condition, damage, restrictions, readiness, and technical-debt state only.',
    'Do not write crew, relationships, continuity, mission, command-log, or command-bearing state.'
  ],
  commandBearing: [
    'Owns command-style and command-culture observations only.',
    'Do not write relationships, crew, ship, continuity, mission, or command-log state.'
  ]
});

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function timestamp(now) {
  return typeof now === 'function' ? now() : (now || new Date().toISOString());
}

function parseProposal(value, options = {}) {
  const parsed = parseStateDeltaProposalOutput(value, options);
  return parsed.ok ? parsed.value : null;
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
    turn: cloneJson(turnContext)
  };
}

function sidecarEventContext(turnContext = {}, proposal = {}) {
  const sourceAnchorRange = cloneJson(proposal.sourceAnchorRange || turnContext.sourceAnchorRange || turnContext.anchorRange || null);
  return {
    ingressId: proposal.ingressId || turnContext.ingressId || null,
    turnId: proposal.turnId || turnContext.turnId || null,
    outcomeId: proposal.outcomeId || turnContext.outcomeId || null,
    reconciliationRunId: proposal.reconciliationRunId || turnContext.reconciliationRunId || null,
    sourceAnchorRange,
    anchorRangeHash: proposal.anchorRangeHash || sourceAnchorRange?.rangeHash || null
  };
}

function pathSegments(path) {
  return String(path || '').split('.').map((segment) => segment.trim()).filter(Boolean);
}

function pathsOverlap(leftPath, rightPath) {
  const left = pathSegments(leftPath);
  const right = pathSegments(rightPath);
  if (!left.length || !right.length) return false;
  const limit = Math.min(left.length, right.length);
  for (let index = 0; index < limit; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function firstOperationPathConflict(operations = [], appliedPaths = []) {
  for (const operation of operations) {
    for (const applied of appliedPaths) {
      if (pathsOverlap(operation.path, applied.path)) {
        return {
          path: operation.path,
          conflictsWith: applied.path,
          workerKey: applied.workerKey
        };
      }
    }
  }
  return null;
}

function ingressById(campaignState, ingressId) {
  if (!ingressId) return null;
  return (campaignState?.runtimeTracking?.ingressLedger || []).find((entry) => entry.id === ingressId) || null;
}

function sourceIngressSnapshot(campaignState, ingressId) {
  const ingress = ingressById(campaignState, ingressId);
  if (!ingress) return null;
  return {
    id: ingress.id,
    hostMessageId: ingress.hostMessageId || null,
    textHash: ingress.textHash || null,
    status: ingress.status || null,
    outcomeId: ingress.outcomeId || null
  };
}

function staleSourceIngressFailure(job, currentState) {
  const source = job.sourceIngress || null;
  if (!job.baseEventContext?.ingressId) return null;
  if (!source?.id) {
    return {
      code: 'DIRECTIVE_SIDECAR_SOURCE_INGRESS_MISSING',
      message: 'Sidecar source ingress was missing when the worker was scheduled.',
      details: {
        ingressId: job.baseEventContext.ingressId
      }
    };
  }
  const current = ingressById(currentState, source.id);
  if (!current) {
    return {
      code: 'DIRECTIVE_SIDECAR_SOURCE_INGRESS_MISSING',
      message: 'Sidecar source ingress is no longer present.',
      details: {
        ingressId: source.id
      }
    };
  }
  const staleStatuses = new Set(['invalidated', 'edited', 'deleted', 'recoveryRequired']);
  const reasons = [];
  if (staleStatuses.has(current.status)) reasons.push(`status:${current.status}`);
  if (current.invalidatedAt || current.invalidationType) reasons.push('invalidated');
  if (source.hostMessageId && current.hostMessageId !== source.hostMessageId) reasons.push('host-message-changed');
  if (source.textHash && current.textHash !== source.textHash) reasons.push('text-hash-changed');
  if (job.baseEventContext.outcomeId && current.outcomeId && current.outcomeId !== job.baseEventContext.outcomeId) {
    reasons.push('outcome-changed');
  }
  if (!reasons.length) return null;
  return {
    code: 'DIRECTIVE_SIDECAR_SOURCE_STALE',
    message: 'Sidecar result targets a player message that was edited, deleted, or superseded.',
    details: {
      ingressId: source.id,
      reasons,
      source: cloneJson(source),
      current: {
        hostMessageId: current.hostMessageId || null,
        textHash: current.textHash || null,
        status: current.status || null,
        invalidatedAt: current.invalidatedAt || null,
        invalidationType: current.invalidationType || null,
        outcomeId: current.outcomeId || null
      }
    }
  };
}

function proposalPrompt(workerKey, worker, campaignState, turnContext) {
  const revision = campaignState.runtimeTracking?.revision || 0;
  const boundaryNotes = WORKER_BOUNDARY_NOTES[workerKey] || [];
  return [
    `You are Directive's ${workerKey} support worker.`,
    'Analyze the committed turn and propose only durable state changes supported by evidence in the supplied context.',
    'Return one JSON object only. Do not narrate. Do not expose internal reasoning.',
    `Authorized top-level roots: ${worker.allowedRoots.join(', ')}.`,
    'Allowed operations: set, append, merge, remove. Paths use dot notation and must begin with an authorized root.',
    'If an observation belongs to another root, do not write it for this worker; mention the boundary in summary and return an empty operations array if needed.',
    ...boundaryNotes.map((note) => `Boundary: ${note}`),
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
  now = null,
  dropForbiddenSidecarOperations = true
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

  function createWorkerJob(workerKey, state, turnContext, index, batchSize) {
    const worker = WORKERS[workerKey];
    if (!worker) return { workerKey, status: 'skipped', reason: 'unknown-worker' };
    const baseRevision = state.runtimeTracking.revision;
    const baseEventContext = sidecarEventContext(turnContext);
    return {
      workerKey,
      worker,
      baseRevision,
      baseEventContext,
      sourceIngress: sourceIngressSnapshot(state, baseEventContext.ingressId),
      index,
      batchSize,
      request: {
        systemPrompt: 'Return one strict JSON state-delta proposal. No markdown, prose, or private reasoning.',
        prompt: proposalPrompt(workerKey, worker, state, turnContext),
        maxTokens: 1800
      }
    };
  }

  function batchDiagnostics(job, extra = {}) {
    return {
      sidecarGeneration: {
        concurrent: job.batchSize > 1,
        batchSize: job.batchSize,
        index: job.index,
        baseRevision: job.baseRevision,
        ...extra
      }
    };
  }

  async function generateWorkers(jobs) {
    if (jobs.length > 1 && typeof generationRouter.batch === 'function') {
      return generationRouter.batch(jobs.map((job) => ({
        roleId: job.worker.roleId,
        request: cloneJson(job.request)
      })), {
        concurrent: true
      });
    }
    return Promise.all(jobs.map((job) => generationRouter.generate(job.worker.roleId, cloneJson(job.request))));
  }

  async function handleWorkerResponse(job, response, turnContext, batchState) {
    const { workerKey, worker, baseRevision, baseEventContext } = job;
    if (!response.ok) {
      const error = cloneJson(response.error);
      await journal({
        id: `sidecar:${workerKey}:${baseRevision}:${Date.now()}`,
        workerId: workerKey,
        roleId: worker.roleId,
        status: 'failed',
        baseRevision,
        ...baseEventContext,
        error,
        diagnostics: {
          ...batchDiagnostics(job),
          transport: {
            ok: false
          },
          provider: cloneJson(response.diagnostics || null),
          sourceAnchorRange: cloneJson(baseEventContext.sourceAnchorRange)
        }
      }, `${workerKey} sidecar failed without mutating campaign state.`);
      return { workerKey, status: 'failed', error };
    }
    const parsed = parseStateDeltaProposalOutput(
      response.response?.text ?? response.response?.content ?? response.response,
      {
        workerKey,
        allowedRoots: worker.allowedRoots,
        baseRevision,
        forbiddenPathPolicy: dropForbiddenSidecarOperations ? 'drop' : 'reject'
      }
    );
    if (!parsed.ok) {
      const error = parsed.error || {
        code: 'DIRECTIVE_SIDECAR_INVALID_PROPOSAL',
        message: 'Worker did not return a valid state-delta proposal.'
      };
      await journal({
        id: `sidecar:${workerKey}:${baseRevision}:rejected`,
        workerId: workerKey,
        roleId: worker.roleId,
        status: 'rejected',
        baseRevision,
        ...baseEventContext,
        error,
        diagnostics: {
          ...cloneJson(parsed.diagnostics || {}),
          ...batchDiagnostics(job)
        }
      }, `${workerKey} sidecar proposal was rejected.`);
      return { workerKey, status: 'rejected', error };
    }
    const proposal = parsed.value;

    proposal.workerId = workerKey;
    proposal.source = `sidecar:${workerKey}`;
    proposal.baseRevision = baseRevision;
    proposal.ingressId = turnContext.ingressId || null;
    proposal.turnId = turnContext.turnId || null;
    proposal.outcomeId = turnContext.outcomeId || null;
    proposal.sourceAnchorRange = cloneJson(turnContext.sourceAnchorRange || turnContext.anchorRange || null);
    proposal.anchorRangeHash = proposal.sourceAnchorRange?.rangeHash || null;
    proposal.reconciliationRunId = turnContext.reconciliationRunId || null;
    proposal.metadata = {
      ...(proposal.metadata || {}),
      sourceAnchorRange: cloneJson(proposal.sourceAnchorRange),
      reconciliationRunId: proposal.reconciliationRunId
    };
    const proposalEventContext = sidecarEventContext(turnContext, proposal);
    const staleSource = staleSourceIngressFailure(job, initializeCampaignRuntimeTracking(getCampaignState()));
    if (staleSource) {
      await journal({
        id: proposal.id || `sidecar:${workerKey}:${baseRevision}:stale-source`,
        workerId: workerKey,
        roleId: worker.roleId,
        status: 'rejected',
        baseRevision,
        summary: proposal.summary || null,
        ...proposalEventContext,
        error: staleSource,
        diagnostics: {
          ...cloneJson(parsed.diagnostics || {}),
          ...batchDiagnostics(job, {
            staleSource: true,
            sourceIngress: cloneJson(job.sourceIngress || null)
          }),
          feature: {
            ok: false,
            status: 'rejected'
          },
          apply: {
            ok: false,
            error: staleSource
          }
        }
      }, `${workerKey} sidecar proposal was rejected because its source player message changed.`);
      return { workerKey, status: 'rejected', error: staleSource };
    }

    if (proposal.operations.length === 0) {
      const droppedCount = Number(parsed.diagnostics?.schema?.droppedForbiddenOperationCount || 0);
      const summary = droppedCount > 0
        ? `${workerKey} proposed ${droppedCount} out-of-scope operation(s); no mutation applied.`
        : proposal.summary || 'No durable state change proposed.';
      await journal({
        id: proposal.id || `sidecar:${workerKey}:${baseRevision}:no-change`,
        workerId: workerKey,
        roleId: worker.roleId,
        status: 'noChange',
        baseRevision,
        summary,
        ...proposalEventContext,
        diagnostics: {
          ...cloneJson(parsed.diagnostics || {}),
          ...batchDiagnostics(job),
          feature: {
            ok: true,
            status: 'noChange'
          },
          apply: {
            ok: true,
            skipped: true
          }
        }
      }, `${workerKey} sidecar completed with no durable change.`);
      return { workerKey, status: 'noChange', proposal: cloneJson(proposal) };
    }

    const currentRevision = initializeCampaignRuntimeTracking(getCampaignState()).runtimeTracking.revision;
    if (currentRevision !== batchState.expectedRevision) {
      const failure = {
        code: 'DIRECTIVE_STATE_REVISION_CONFLICT',
        message: `State delta revision conflict: expected ${batchState.expectedRevision}, current revision is ${currentRevision}.`,
        details: {
          expectedRevision: batchState.expectedRevision,
          currentRevision,
          batchBaseRevision: batchState.baseRevision
        }
      };
      await journal({
        id: proposal.id || `sidecar:${workerKey}:${baseRevision}:rejected`,
        workerId: workerKey,
        roleId: worker.roleId,
        status: 'rejected',
        baseRevision,
        summary: proposal.summary || null,
        ...proposalEventContext,
        error: failure,
        diagnostics: {
          ...cloneJson(parsed.diagnostics || {}),
          ...batchDiagnostics(job, {
            applyBaseRevision: currentRevision,
            expectedRevision: batchState.expectedRevision,
            stale: true
          }),
          feature: {
            ok: false,
            status: 'rejected'
          },
          apply: {
            ok: false,
            error: failure
          }
        }
      }, `${workerKey} sidecar proposal was rejected by the state gateway.`);
      return { workerKey, status: 'rejected', error: failure };
    }

    const pathConflict = firstOperationPathConflict(proposal.operations, batchState.appliedPaths);
    if (pathConflict) {
      const failure = {
        code: 'DIRECTIVE_SIDECAR_BATCH_PATH_CONFLICT',
        message: `Sidecar batch path conflict at "${pathConflict.path}".`,
        details: pathConflict
      };
      await journal({
        id: proposal.id || `sidecar:${workerKey}:${baseRevision}:conflict`,
        workerId: workerKey,
        roleId: worker.roleId,
        status: 'rejected',
        baseRevision,
        summary: proposal.summary || null,
        ...proposalEventContext,
        error: failure,
        diagnostics: {
          ...cloneJson(parsed.diagnostics || {}),
          ...batchDiagnostics(job, {
            applyBaseRevision: currentRevision,
            conflict: cloneJson(pathConflict)
          }),
          feature: {
            ok: false,
            status: 'rejected'
          },
          apply: {
            ok: false,
            error: failure
          }
        }
      }, `${workerKey} sidecar proposal conflicted with an earlier sidecar in the same batch.`);
      return { workerKey, status: 'rejected', error: failure };
    }

    try {
      const applyProposal = {
        ...proposal,
        baseRevision: currentRevision,
        metadata: {
          ...(proposal.metadata || {}),
          sidecarGeneration: {
            concurrent: job.batchSize > 1,
            batchSize: job.batchSize,
            index: job.index,
            baseRevision,
            applyBaseRevision: currentRevision,
            rebased: currentRevision !== baseRevision
          }
        }
      };
      const applied = await stateDeltaGateway.applyOperations(applyProposal, {
        allowedRoots: worker.allowedRoots
      });
      batchState.expectedRevision = applied.revision;
      batchState.appliedPaths.push(...proposal.operations.map((operation) => ({
        workerKey,
        path: operation.path
      })));
      setCampaignState(applied.campaignState);
      if (typeof syncPromptContext === 'function') {
        const synchronized = await syncPromptContext(applied.campaignState, {
          workerKey,
          proposal: cloneJson(applyProposal)
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
        summary: proposal.summary || `${proposal.operations.length} operation(s) applied.`,
        ...proposalEventContext,
        diagnostics: {
          ...cloneJson(parsed.diagnostics || {}),
          ...batchDiagnostics(job, {
            applyBaseRevision: currentRevision,
            rebased: currentRevision !== baseRevision
          }),
          feature: {
            ok: true,
            status: 'applied'
          },
          apply: {
            ok: true,
            revision: applied.revision,
            domains: cloneJson(applied.domains || [])
          }
        }
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
        ...proposalEventContext,
        error: failure,
        diagnostics: {
          ...cloneJson(parsed.diagnostics || {}),
          ...batchDiagnostics(job, {
            applyBaseRevision: currentRevision
          }),
          feature: {
            ok: false,
            status: 'rejected'
          },
          apply: {
            ok: false,
            error: failure
          }
        }
      }, `${workerKey} sidecar proposal was rejected by the state gateway.`);
      return { workerKey, status: 'rejected', error: failure };
    }
  }

  function schedule({ workerPlan = {}, turnContext = {} } = {}) {
    const requested = Object.keys(WORKERS).filter((key) => workerPlan[key] === true);
    const job = async () => {
      const state = initializeCampaignRuntimeTracking(getCampaignState());
      const baseRevision = state.runtimeTracking.revision;
      const jobs = requested.map((workerKey, index) => createWorkerJob(workerKey, state, turnContext, index, requested.length));
      const responses = await generateWorkers(jobs);
      const batchState = {
        baseRevision,
        expectedRevision: baseRevision,
        appliedPaths: []
      };
      const results = [];
      for (const [index, workerJob] of jobs.entries()) {
        results.push(await handleWorkerResponse(workerJob, responses[index] || {
          ok: false,
          error: {
            code: 'DIRECTIVE_SIDECAR_BATCH_RESPONSE_MISSING',
            message: 'Sidecar batch did not return a response for this worker.'
          }
        }, turnContext, batchState));
      }
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
