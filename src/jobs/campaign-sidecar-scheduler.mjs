import {
  initializeCampaignRuntimeTracking,
  recordSidecarEvent
} from '../runtime/state-delta-gateway.mjs';
import { allowedRootsForModelRole } from '../generation/model-call-authority-matrix.mjs';
import { parseStateDeltaProposalOutput } from './sidecar-output-contracts.mjs';
import { planCommandBearingStateClosureReviews } from '../command/command-bearing.mjs';
import { runCommandBearingClosureReviews } from '../command/command-bearing-review.mjs';
import { commitCommandBearingReviewRecords } from '../campaign/transaction-state.mjs';

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
    'Owns Command Bearing evidence/review proposals and command-culture observations only.',
    'Evidence is not a Mark; Mark awards require deterministic closure proof and validation.',
    'Generic sidecar operations may only append or upsert validated evidence at commandBearing.evidenceLedger.records; do not write review ledgers, tracks, points, reserve, readied state, spends, or recovery.',
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
        inspiration: campaignState.commandBearing?.tracks?.inspiration || campaignState.commandStyle?.inspiration
          ? {
              rank: campaignState.commandBearing?.tracks?.inspiration?.rank || campaignState.commandStyle?.inspiration?.rank,
              marks: campaignState.commandBearing?.tracks?.inspiration?.marks || campaignState.commandStyle?.inspiration?.marks,
              points: campaignState.commandBearing?.tracks?.inspiration?.points || campaignState.commandStyle?.inspiration?.points
            }
          : null,
        resolve: campaignState.commandBearing?.tracks?.resolve || campaignState.commandStyle?.resolve
          ? {
              rank: campaignState.commandBearing?.tracks?.resolve?.rank || campaignState.commandStyle?.resolve?.rank,
              marks: campaignState.commandBearing?.tracks?.resolve?.marks || campaignState.commandStyle?.resolve?.marks,
              points: campaignState.commandBearing?.tracks?.resolve?.points || campaignState.commandStyle?.resolve?.points
            }
          : null
      }
    },
    crew: cloneJson(campaignState.crew || {}),
    relationships: cloneJson(campaignState.relationships || {}),
    ship: cloneJson(campaignState.ship || {}),
    pressureLedger: cloneJson(campaignState.pressureLedger || {}),
    narrativeRoots: commandBearingNarrativeRoots(campaignState),
    turn: cloneJson(turnContext)
  };
}

function commandBearingNarrativeRoots(campaignState = {}) {
  const questInstances = Array.isArray(campaignState.questLedger?.instances)
    ? campaignState.questLedger.instances
    : [];
  const threadRecords = Array.isArray(campaignState.threadLedger?.records)
    ? campaignState.threadLedger.records
    : Array.isArray(campaignState.threadLedger?.threads)
      ? campaignState.threadLedger.threads
      : [];
  const storyArcs = Array.isArray(campaignState.storyArcLedger?.arcs)
    ? campaignState.storyArcLedger.arcs
    : Array.isArray(campaignState.storyArcLedger?.records)
      ? campaignState.storyArcLedger.records
      : [];
  const milestones = Array.isArray(campaignState.storyArcLedger?.milestones)
    ? campaignState.storyArcLedger.milestones
    : storyArcs.flatMap((arc) => Array.isArray(arc.milestoneStates)
      ? arc.milestoneStates.map((milestone) => ({ ...milestone, arcId: milestone.arcId || arc.id }))
      : []);
  return {
    foregroundQuestId: campaignState.questLedger?.foregroundQuestId || campaignState.attentionState?.foregroundQuestId || null,
    quests: questInstances
      .filter((quest) => ['active', 'accepted', 'offered', 'available', 'resolved', 'failed', 'abandoned', 'transformed'].includes(quest?.status))
      .slice(0, 12)
      .map((quest) => ({
        id: quest.id,
        templateId: quest.templateId || null,
        kind: quest.kind || null,
        title: quest.title || null,
        status: quest.status || null,
        foreground: quest.foreground === true || campaignState.questLedger?.foregroundQuestId === quest.id
      })),
    threads: threadRecords
      .filter((thread) => ['engaged', 'active', 'available', 'watchlisted', 'resolved', 'transformed', 'dormant'].includes(thread?.status))
      .slice(0, 16)
      .map((thread) => ({
        id: thread.id,
        type: thread.type || null,
        status: thread.status || null,
        summary: thread.summary || thread.title || null,
        participants: Array.isArray(thread.participantIds) ? thread.participantIds.slice(0, 8) : []
      })),
    storyArcs: storyArcs.slice(0, 8).map((arc) => ({
      id: arc.id,
      status: arc.status || null,
      stageId: arc.stageId || null,
      completedMilestoneIds: Array.isArray(arc.completedMilestoneIds) ? arc.completedMilestoneIds.slice(0, 20) : []
    })),
    milestones: milestones
      .filter((milestone) => ['available', 'active', 'complete'].includes(milestone?.status))
      .slice(0, 24)
      .map((milestone) => ({
        id: milestone.id,
        arcId: milestone.arcId || null,
        status: milestone.status || null
      }))
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

function commandBearingEvidenceValues(operations = []) {
  const values = [];
  for (const operation of operations) {
    if (operation?.path !== 'commandBearing.evidenceLedger.records') continue;
    if (!['append', 'upsert'].includes(String(operation.op || '').trim().toLowerCase())) continue;
    values.push(...(Array.isArray(operation.value) ? operation.value : [operation.value]));
  }
  return values.filter(Boolean);
}

function commandBearingEvidenceSourceOutcomeIds(operations = []) {
  return [...new Set(commandBearingEvidenceValues(operations)
    .flatMap((record) => [record?.sourceOutcomeId, record?.outcomeId, record?.sourceTurnId, record?.turnId])
    .filter(Boolean))];
}

function commandBearingReviewDiagnostics(review = {}) {
  if (!review || review.attempted === false) {
    return {
      attempted: review?.attempted === true,
      reason: review?.reason || null
    };
  }
  return {
    attempted: true,
    status: review.status || null,
    sourceOutcomeIds: cloneJson(review.sourceOutcomeIds || []),
    reviewPlan: cloneJson(review.reviewPlan || null),
    review: cloneJson(review.review || null),
    appliedRevision: review.campaignState?.runtimeTracking?.revision || null
  };
}

function commandBearingEvidenceExample(revision, turnContext = {}, track = 'inspiration') {
  const key = track === 'resolve' ? 'resolve' : 'inspiration';
  const isResolve = key === 'resolve';
  return {
    id: `command-bearing-${key}-evidence-proposal`,
    workerId: 'commandBearing',
    baseRevision: revision,
    operations: [{
      op: 'append',
      path: 'commandBearing.evidenceLedger.records',
      value: {
        id: `bearing-evidence.${turnContext.outcomeId || 'outcome-id'}.${key}`,
        sourceOutcomeId: turnContext.outcomeId || 'outcome-id',
        sourceTurnId: turnContext.turnId || 'turn-id',
        primarySignal: key,
        trackSignals: [key],
        strength: 'moderate',
        criteria: {
          agency: true,
          commitment: true,
          causality: true
        },
        actionSummary: isResolve
          ? 'Player-character used lawful authority, a credible boundary, or accepted responsibility to constrain action.'
          : 'Player-character used trust, transparency, dignity, or voluntary cooperation to shape the outcome.',
        consequenceSummary: isResolve
          ? 'Visible consequence or durable follow-through came from the boundary, deadline, custody rule, or accepted cost.'
          : 'Visible consequence or durable follow-through came from cooperation, shared purpose, or preserved dignity.',
        playerFacingSummary: isResolve
          ? 'This may support Resolve because the command relied on lawful authority, discipline, credible boundaries, preparation, or accepted responsibility.'
          : 'This may support Inspiration because the command relied on trust, shared purpose, transparency, dignity, mentorship, or voluntary cooperation.',
        visible: true,
        status: 'open'
      }
    }],
    summary: 'Propose one validated Command Bearing evidence record.'
  };
}

function commandBearingTrackGuidance() {
  return [
    'Command Bearing track definitions:',
    '- Inspiration: leadership through trust, shared purpose, transparency, dignity, mentorship, and voluntary cooperation.',
    '- Resolve: leadership through lawful authority, preparation, credible boundaries, discipline, deterrence, and accepted responsibility.',
    'Primary-signal rule:',
    '- Choose the primarySignal by the causal mechanism that changed the committed outcome, not by friendly tone, inclusive wording, or the presence of multiple officers.',
    '- Choose Resolve when the outcome materially depends on a lawful refusal, custody requirement, deadline, readiness hold, restricted release, prepared contingency, credible consequence, disciplined restraint, or the commander accepting personal responsibility for cost.',
    '- Do not convert Resolve into Inspiration merely because the boundary is explained transparently, applied publicly, or delegated to named owners.',
    '- Choose Inspiration when the outcome materially depends on trust, voluntary cooperation, dignity, mentorship, shared purpose, or inviting dissent.',
    '- For mixed turns, pick one primarySignal unless two distinct consequential decisions are present; include both tracks in trackSignals only when both mechanisms materially matter.'
  ].join('\n');
}

function workerOperationRules(workerKey) {
  if (workerKey === 'commandBearing') {
    return [
      'Allowed operations for commandBearing: append or upsert only at commandBearing.evidenceLedger.records.',
      'Allowed commandCulture operations, if any are truly warranted: set, append, merge, remove under commandCulture only.',
      'Do not use set, merge, or remove under commandBearing.'
    ];
  }
  return [
    'Allowed operations: set, append, merge, remove. Paths use dot notation and must begin with an authorized root.'
  ];
}

function workerRequiredShape(workerKey, worker, revision, turnContext = {}) {
  if (workerKey === 'commandBearing') {
    return [
      'Command Bearing evidence append shape:',
      'Inspiration example:',
      JSON.stringify(commandBearingEvidenceExample(revision, turnContext, 'inspiration'), null, 2),
      '',
      'Resolve example:',
      JSON.stringify(commandBearingEvidenceExample(revision, turnContext, 'resolve'), null, 2),
      '',
      commandBearingTrackGuidance(),
      '',
      'Evidence field contract:',
      '- primarySignal must be exactly "inspiration" or "resolve".',
      '- trackSignals must contain at least one of "inspiration" or "resolve".',
      '- strength must be exactly "weak", "moderate", "strong", or "defining".',
      '- criteria.agency, criteria.commitment, and criteria.causality must be booleans.',
      '- actionSummary and playerFacingSummary are required player-safe summaries.',
      '- sourceOutcomeId must match the committed outcome id from Context.turn.outcomeId.',
      '- sourceTurnId should match Context.turn.turnId when present.',
      '- questId, threadId, arcId, chapterId, and commandCrucibleId are optional; include them only when the supplied context proves the id.',
      '- Context.narrativeRoots lists the only current quest, thread, story arc, and milestone ids you may cite. Use exact ids from that list when the evidence is causally tied to that root.',
      '- If the evidence belongs to the active foreground quest or a listed milestone/thread, include the relevant questId, chapterId, arcId, or threadId so deterministic closure review can find it later.',
      'Return {"operations":[]} when the committed outcome is routine, merely polite, keyword-only, Assist-only, lacks visible consequence, or cannot satisfy every required field.'
    ].join('\n');
  }
  return `Required shape: {"id":"...","workerId":"${workerKey}","baseRevision":${revision},"operations":[{"op":"set","path":"${worker.allowedRoots[0]}.example","value":null}],"summary":"..."}`;
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
    ...workerOperationRules(workerKey),
    'String values must be strict JSON-safe. Do not copy raw dialogue with double quotes into evidence fields; paraphrase quoted speech or escape every quote.',
    'If an observation belongs to another root, do not write it for this worker; mention the boundary in summary and return an empty operations array if needed.',
    ...boundaryNotes.map((note) => `Boundary: ${note}`),
    'Use an empty operations array when no durable change is warranted.',
    '',
    workerRequiredShape(workerKey, worker, revision, turnContext),
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
  dropForbiddenSidecarOperations = true,
  reportActivity = null
} = {}) {
  if (!generationRouter?.generate) throw new Error('CampaignSidecarScheduler requires generationRouter.generate.');
  if (!stateDeltaGateway?.applyOperations) throw new Error('CampaignSidecarScheduler requires stateDeltaGateway.applyOperations.');
  if (typeof getCampaignState !== 'function' || typeof setCampaignState !== 'function') {
    throw new Error('CampaignSidecarScheduler requires campaign state callbacks.');
  }
  if (typeof persistCampaignState !== 'function') throw new Error('CampaignSidecarScheduler requires persistCampaignState.');

  let queue = Promise.resolve();

  function emitActivity(activityReporter, event = {}) {
    const reporter = typeof activityReporter === 'function' ? activityReporter : reportActivity;
    if (typeof reporter !== 'function') return;
    try {
      reporter({
        kind: 'directive.turnActivity',
        source: 'campaignSidecarScheduler',
        recordedAt: timestamp(now),
        ...event
      });
    } catch (error) {
      console.warn('[Directive] Failed to report sidecar activity:', error);
    }
  }

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

  async function runCommandBearingEvidenceClosureReview({
    beforeState,
    currentState,
    proposal,
    proposalEventContext,
    parsedDiagnostics = null
  } = {}) {
    const sourceOutcomeIds = commandBearingEvidenceSourceOutcomeIds(proposal.operations);
    if (!sourceOutcomeIds.length) {
      return {
        attempted: false,
        reason: 'no-evidence-source-outcome'
      };
    }
    const reviewPlan = planCommandBearingStateClosureReviews({
      commandBearing: currentState.commandBearing || currentState.commandStyle,
      previousState: beforeState,
      currentState,
      sourceOutcomeIds
    });
    if (!reviewPlan.reviewQueue.length) {
      return {
        attempted: true,
        status: 'noQueue',
        sourceOutcomeIds,
        reviewPlan
      };
    }
    const review = await runCommandBearingClosureReviews({
      generationRouter,
      campaignState: currentState,
      reviewQueue: reviewPlan.reviewQueue,
      maxReviews: 3
    });
    if (!review.records.length) {
      return {
        attempted: true,
        status: 'noAcceptedReviews',
        sourceOutcomeIds,
        reviewPlan,
        review
      };
    }
    const reviewedState = commitCommandBearingReviewRecords(currentState, review.records);
    const committed = await stateDeltaGateway.commit(reviewedState, {
      source: 'campaignSidecarScheduler',
      reason: 'Command Bearing closure review updated character progression after evidence sidecar.',
      summary: 'Command Bearing closure review updated character progression after evidence sidecar.',
      domains: ['commandBearing', 'commandStyle'],
      outcomeId: proposalEventContext.outcomeId || null,
      reconciliationRunId: proposalEventContext.reconciliationRunId || null,
      metadata: {
        sourceOutcomeIds,
        reviewClosureIds: review.records.map((record) => record.closureId),
        sidecarWorkerId: 'commandBearing',
        parsedDiagnostics: cloneJson(parsedDiagnostics || null)
      }
    });
    return {
      attempted: true,
      status: 'appliedReviews',
      sourceOutcomeIds,
      reviewPlan,
      review,
      campaignState: committed
    };
  }

  async function handleWorkerResponse(job, response, turnContext, batchState) {
    const { workerKey, worker, baseRevision, baseEventContext } = job;
    const freshestBatchState = () => {
      const local = initializeCampaignRuntimeTracking(batchState.currentState || getCampaignState());
      const external = initializeCampaignRuntimeTracking(getCampaignState());
      return Number(external.runtimeTracking?.revision || 0) >= Number(local.runtimeTracking?.revision || 0)
        ? external
        : local;
    };
    if (!response.ok) {
      const error = cloneJson(response.error);
      const journaled = await journal({
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
      batchState.currentState = cloneJson(journaled);
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
      const journaled = await journal({
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
      batchState.currentState = cloneJson(journaled);
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
    const staleSource = staleSourceIngressFailure(
      job,
      freshestBatchState()
    );
    if (staleSource) {
      const journaled = await journal({
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
      batchState.currentState = cloneJson(journaled);
      return { workerKey, status: 'rejected', error: staleSource };
    }

    if (proposal.operations.length === 0) {
      const droppedCount = Number(parsed.diagnostics?.schema?.droppedForbiddenOperationCount || 0);
      const summary = droppedCount > 0
        ? `${workerKey} proposed ${droppedCount} out-of-scope operation(s); no mutation applied.`
        : proposal.summary || 'No durable state change proposed.';
      const journaled = await journal({
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
      batchState.currentState = cloneJson(journaled);
      return { workerKey, status: 'noChange', proposal: cloneJson(proposal) };
    }

    const currentState = freshestBatchState();
    const currentRevision = currentState.runtimeTracking.revision;
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
      const journaled = await journal({
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
      batchState.currentState = cloneJson(journaled);
      return { workerKey, status: 'rejected', error: failure };
    }

    const pathConflict = firstOperationPathConflict(proposal.operations, batchState.appliedPaths);
    if (pathConflict) {
      const failure = {
        code: 'DIRECTIVE_SIDECAR_BATCH_PATH_CONFLICT',
        message: `Sidecar batch path conflict at "${pathConflict.path}".`,
        details: pathConflict
      };
      const journaled = await journal({
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
      batchState.currentState = cloneJson(journaled);
      return { workerKey, status: 'rejected', error: failure };
    }

    try {
      setCampaignState(currentState);
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
      batchState.currentState = cloneJson(applied.campaignState);
      if (typeof syncPromptContext === 'function') {
        const synchronized = await syncPromptContext(applied.campaignState, {
          workerKey,
          proposal: cloneJson(applyProposal)
        });
        if (synchronized) {
          applied.campaignState = synchronized;
          setCampaignState(synchronized);
          batchState.currentState = cloneJson(synchronized);
          await persistCampaignState(synchronized, `${workerKey} sidecar prompt context synchronized.`);
        }
      }
      let commandBearingReview = { attempted: false, reason: 'not-command-bearing-worker' };
      if (workerKey === 'commandBearing') {
        commandBearingReview = await runCommandBearingEvidenceClosureReview({
          beforeState: currentState,
          currentState: batchState.currentState,
          proposal,
          proposalEventContext,
          parsedDiagnostics: parsed.diagnostics
        });
        if (commandBearingReview.campaignState) {
          applied.campaignState = commandBearingReview.campaignState;
          applied.revision = commandBearingReview.campaignState.runtimeTracking?.revision || applied.revision;
          setCampaignState(commandBearingReview.campaignState);
          batchState.currentState = cloneJson(commandBearingReview.campaignState);
          batchState.expectedRevision = applied.revision;
          if (typeof syncPromptContext === 'function') {
            const synchronizedReview = await syncPromptContext(commandBearingReview.campaignState, {
              workerKey,
              proposal: cloneJson(applyProposal),
              commandBearingReview: true
            });
            if (synchronizedReview) {
              applied.campaignState = synchronizedReview;
              applied.revision = synchronizedReview.runtimeTracking?.revision || applied.revision;
              setCampaignState(synchronizedReview);
              batchState.currentState = cloneJson(synchronizedReview);
              batchState.expectedRevision = applied.revision;
              await persistCampaignState(synchronizedReview, `${workerKey} sidecar closure review prompt context synchronized.`);
            }
          }
        }
      }
      const journaled = await journal({
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
            status: 'applied',
            commandBearingReview: commandBearingReviewDiagnostics(commandBearingReview)
          },
          apply: {
            ok: true,
            revision: applied.revision,
            domains: cloneJson(applied.domains || [])
          }
        }
      }, `Applied ${workerKey} sidecar update.`);
      batchState.currentState = cloneJson(journaled);
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
      const journaled = await journal({
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
      batchState.currentState = cloneJson(journaled);
      return { workerKey, status: 'rejected', error: failure };
    }
  }

  function schedule({ workerPlan = {}, turnContext = {}, activityReporter = null } = {}) {
    const requested = Object.keys(WORKERS).filter((key) => workerPlan[key] === true);
    if (requested.length > 0) {
      emitActivity(activityReporter, {
        phase: 'sidecarsQueued',
        mode: 'background',
        requested,
        classification: turnContext.classification || null,
        ingressId: turnContext.ingressId || null,
        turnId: turnContext.turnId || null,
        outcomeId: turnContext.outcomeId || null
      });
    }
    const job = async () => {
      if (requested.length > 0) {
        emitActivity(activityReporter, {
          phase: 'sidecarsRunning',
          mode: 'background',
          requested,
          classification: turnContext.classification || null,
          ingressId: turnContext.ingressId || null,
          turnId: turnContext.turnId || null,
          outcomeId: turnContext.outcomeId || null
        });
        for (const workerKey of requested) {
          emitActivity(activityReporter, {
            phase: 'sidecarWorker',
            mode: 'background',
            workerKey,
            status: 'running',
            classification: turnContext.classification || null
          });
        }
      }
      const state = initializeCampaignRuntimeTracking(getCampaignState());
      const baseRevision = state.runtimeTracking.revision;
      const jobs = requested.map((workerKey, index) => createWorkerJob(workerKey, state, turnContext, index, requested.length));
      let responses;
      try {
        responses = await generateWorkers(jobs);
      } catch (error) {
        for (const workerKey of requested) {
          emitActivity(activityReporter, {
            phase: 'sidecarWorker',
            mode: 'review',
            workerKey,
            status: 'failed',
            classification: turnContext.classification || null
          });
        }
        emitActivity(activityReporter, {
          phase: 'sidecarsSettled',
          mode: 'review',
          requested,
          classification: turnContext.classification || null,
          error: {
            message: error?.message || String(error)
          }
        });
        throw error;
      }
      const batchState = {
        baseRevision,
        expectedRevision: baseRevision,
        currentState: cloneJson(state),
        appliedPaths: []
      };
      const results = [];
      for (const [index, workerJob] of jobs.entries()) {
        const result = await handleWorkerResponse(workerJob, responses[index] || {
          ok: false,
          error: {
            code: 'DIRECTIVE_SIDECAR_BATCH_RESPONSE_MISSING',
            message: 'Sidecar batch did not return a response for this worker.'
          }
        }, turnContext, batchState);
        results.push(result);
        emitActivity(activityReporter, {
          phase: 'sidecarWorker',
          mode: ['failed', 'rejected'].includes(result.status) ? 'review' : 'background',
          workerKey: result.workerKey || workerJob.workerKey,
          status: result.status || 'complete',
          classification: turnContext.classification || null
        });
      }
      if (requested.length > 0) {
        emitActivity(activityReporter, {
          phase: 'sidecarsSettled',
          mode: results.some((result) => ['failed', 'rejected'].includes(result.status)) ? 'review' : 'background',
          requested,
          results: cloneJson(results),
          classification: turnContext.classification || null,
          ingressId: turnContext.ingressId || null,
          turnId: turnContext.turnId || null,
          outcomeId: turnContext.outcomeId || null
        });
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
