import {
  initializeCampaignRuntimeTracking
} from '../runtime/state-delta-gateway.mjs';
import { allowedRootsForModelRole } from '../generation/model-call-authority-matrix.mjs';
import { parseStateDeltaProposalOutput } from './sidecar-output-contracts.mjs';
import { runSidecarJobs } from './sidecar-job-runner.mjs';
import {
  normalizeForgeWorkerResult
} from './forge-contracts.mjs';
import { planCommandBearingStateClosureReviews } from '../command/command-bearing.mjs';
import { runCommandBearingClosureReviews } from '../command/command-bearing-review.mjs';
import { commitCommandBearingReviewRecords } from '../campaign/transaction-state.mjs';
import { missionComponentsState } from '../runtime/mission-components.mjs';
import {
  createSourceToken,
  createTurnSourceFrameRef
} from '../runtime/frame-contracts.mjs';
import {
  createRuntimeLedgerView,
  readRuntimeCoreProjections
} from '../runtime/runtime-ledger-view.mjs';
import { normalizePromptDirtyDomains } from '../runtime/lens-prompt-scheduler.mjs';
import { hashStableJson } from '../runtime/architecture-redesign-contracts.mjs';

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

const SIDECAR_PROPOSAL_MAX_OPERATIONS = 3;
const SIDECAR_PROPOSAL_MAX_TOKENS = 2200;
const SIDECAR_REPAIR_MAX_TOKENS = 1400;

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function activeCoreRevisionState(campaignState = {}) {
  const projections = readRuntimeCoreProjections(campaignState);
  const revisions = isObject(projections?.revisions) ? projections.revisions : {};
  if (String(projections?.runtimeAuthority || '').trim() === 'coreStoreV2') {
    return {
      runtime: Math.max(0, Number(revisions.runtime) || 0),
      mechanics: Math.max(0, Number(revisions.mechanics) || 0),
      authority: 'coreStoreV2'
    };
  }
  return {
    runtime: Math.max(0, Number(campaignState?.runtimeTracking?.revision) || 0),
    mechanics: Math.max(0, Number(campaignState?.runtimeTracking?.mechanicsRevision) || 0),
    authority: 'runtimeTracking'
  };
}

function activeRuntimeRevision(campaignState = {}) {
  return activeCoreRevisionState(campaignState).runtime;
}

function compactText(value = '', maxLength = 240) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function compactDiagnosticText(value = '', maxLength = 1000) {
  return compactText(value, maxLength);
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function uniqueStrings(values = [], limit = 24, maxLength = 180) {
  const seen = new Set();
  const output = [];
  for (const value of asArray(values)) {
    const text = compactText(value, maxLength);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    output.push(text);
    if (output.length >= limit) break;
  }
  return output;
}

const WORKER_DIRECTOR_AUDIENCES = Object.freeze({
  continuity: ['missionDirector'],
  relationship: ['crewDirector'],
  crew: ['crewDirector'],
  ship: ['shipDirector'],
  commandBearing: ['commandDirector']
});

function timestamp(now) {
  return typeof now === 'function' ? now() : (now || new Date().toISOString());
}

function missionComponentSidecarContext(campaignState = {}) {
  const records = missionComponentsState(campaignState).records
    .filter((record) => record?.id && record.status !== 'archived' && record.lifecycle?.reviewed !== false)
    .slice(-24)
    .map((record) => ({
      id: record.id,
      title: record.title || null,
      type: record.type || null,
      status: record.status || null,
      summary: compactText(record.summary, 260),
      sourceAuthority: record.sourceAuthority || null,
      sourceStatus: record.source?.sourceStatus || 'active',
      links: cloneJson(record.links || {}),
      source: {
        chatId: record.source?.chatId || null,
        hostMessageId: record.source?.hostMessageId || null,
        messageRole: record.source?.messageRole || null,
        ingressId: record.source?.ingressId || null,
        outcomeId: record.source?.outcomeId || null,
        selectionStart: Number.isInteger(record.source?.selectionStart) ? record.source.selectionStart : null,
        selectionEnd: Number.isInteger(record.source?.selectionEnd) ? record.source.selectionEnd : null
      }
    }));
  return {
    schemaVersion: 1,
    records
  };
}

function knownMissionComponentIds(campaignState = {}) {
  return new Set(missionComponentsState(campaignState).records
    .filter((record) => record?.id && record.status !== 'archived' && record.lifecycle?.reviewed !== false)
    .map((record) => record.id));
}

function restrictMissionComponentIds(values = [], knownIds = new Set()) {
  return uniqueStrings(values, 24, 180).filter((id) => knownIds.has(id));
}

function sourceHostMessageIds(turnContext = {}) {
  return new Set([
    turnContext.hostMessageId,
    turnContext.sourceMessageId,
    turnContext.responseMessageId,
    turnContext.playerMessageId,
    turnContext.currentPlayerHostMessageId,
    turnContext.priorPlayerMessageId
  ].map((value) => compactText(value)).filter(Boolean));
}

function missionComponentIdsForTurnSource(campaignState = {}, turnContext = {}) {
  const ingressId = compactText(turnContext.ingressId);
  const outcomeId = compactText(turnContext.outcomeId);
  const hostMessageIds = sourceHostMessageIds(turnContext);
  if (!ingressId && !outcomeId && !hostMessageIds.size) return [];
  const ids = [];
  for (const record of missionComponentsState(campaignState).records) {
    if (!record?.id || record.status === 'archived' || record.lifecycle?.reviewed === false) continue;
    if (record.source?.sourceStatus && record.source.sourceStatus !== 'active') continue;
    const source = record.source || {};
    if (ingressId && source.ingressId === ingressId) {
      ids.push(record.id);
      continue;
    }
    if (outcomeId && source.outcomeId === outcomeId) {
      ids.push(record.id);
      continue;
    }
    if (source.hostMessageId && hostMessageIds.has(String(source.hostMessageId))) {
      ids.push(record.id);
    }
  }
  return uniqueStrings(ids, 24, 180);
}

function componentIdsFromValue(value = {}) {
  if (!isObject(value)) return [];
  return uniqueStrings([
    ...asArray(value.sourceComponentIds),
    ...asArray(value.derivedFromComponentIds),
    ...asArray(value.metadata?.sourceComponentIds),
    ...asArray(value.metadata?.derivedFromComponentIds),
    ...asArray(value.links?.componentIds)
  ], 24, 180);
}

function componentIdsFromOperation(operation = {}) {
  return uniqueStrings([
    ...asArray(operation.sourceComponentIds),
    ...asArray(operation.derivedFromComponentIds),
    ...componentIdsFromValue(operation.value)
  ], 24, 180);
}

function componentIdsFromProposal(proposal = {}) {
  return uniqueStrings([
    ...asArray(proposal.sourceComponentIds),
    ...asArray(proposal.derivedFromComponentIds),
    ...asArray(proposal.metadata?.sourceComponentIds),
    ...asArray(proposal.metadata?.derivedFromComponentIds)
  ], 24, 180);
}

function canAttachMissionComponentProvenance(operation = {}) {
  const path = compactText(operation.path);
  if (!path || path.startsWith('commandBearing.')) return false;
  if (!isObject(operation.value) && !Array.isArray(operation.value)) return false;
  const eligiblePrefixes = [
    'continuity.notes',
    'mission.knownFacts',
    'mission.openAssignments',
    'knowledgeLedger.facts',
    'threadLedger.records',
    'commandLog.entries',
    'ship.damage',
    'ship.technicalDebt',
    'ship.restrictions',
    'crew.casualties',
    'crew.reassignments',
    'crew.assignments',
    'crew.pressures',
    'relationships.seniorCrew',
    'relationships.descriptiveLog',
    'relationships.perceptionLedger',
    'relationships.memoryLedger',
    'pressureLedger.records'
  ];
  return eligiblePrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}.`));
}

function attachSourceComponentIds(value, ids = []) {
  const sourceIds = uniqueStrings(ids, 24, 180);
  if (!sourceIds.length) return { value, changed: false };
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const stamped = attachSourceComponentIds(item, sourceIds);
      if (stamped.changed) changed = true;
      return stamped.value;
    });
    return { value: next, changed };
  }
  if (!isObject(value)) return { value, changed: false };
  const merged = uniqueStrings([
    ...asArray(value.sourceComponentIds),
    ...asArray(value.derivedFromComponentIds),
    ...sourceIds
  ], 24, 180);
  if (!merged.length) return { value, changed: false };
  if (JSON.stringify(uniqueStrings(value.sourceComponentIds, 24, 180)) === JSON.stringify(merged)) {
    return { value, changed: false };
  }
  return {
    value: {
      ...cloneJson(value),
      sourceComponentIds: merged
    },
    changed: true
  };
}

function applyMissionComponentProvenance(proposal = {}, campaignState = {}, turnContext = {}) {
  const knownIds = knownMissionComponentIds(campaignState);
  const matchedSourceComponentIds = restrictMissionComponentIds(
    missionComponentIdsForTurnSource(campaignState, turnContext),
    knownIds
  );
  const proposalComponentIds = restrictMissionComponentIds(componentIdsFromProposal(proposal), knownIds);
  const defaultComponentIds = uniqueStrings([
    ...proposalComponentIds,
    ...matchedSourceComponentIds
  ], 24, 180);
  const operationComponentIds = [];
  let stampedOperationCount = 0;
  const operations = (Array.isArray(proposal.operations) ? proposal.operations : []).map((operation) => {
    const explicitOperationIds = restrictMissionComponentIds(componentIdsFromOperation(operation), knownIds);
    const ids = explicitOperationIds.length ? explicitOperationIds : defaultComponentIds;
    if (!ids.length) return operation;
    operationComponentIds.push(...ids);
    if (!canAttachMissionComponentProvenance(operation)) return operation;
    const stamped = attachSourceComponentIds(operation.value, ids);
    if (!stamped.changed) return operation;
    stampedOperationCount += 1;
    return {
      ...operation,
      value: stamped.value
    };
  });
  const derivedFromComponentIds = uniqueStrings([
    ...defaultComponentIds,
    ...operationComponentIds
  ], 24, 180);
  const metadata = derivedFromComponentIds.length
    ? {
        ...(proposal.metadata || {}),
        derivedFromComponentIds
      }
    : proposal.metadata;
  return {
    proposal: {
      ...proposal,
      operations,
      ...(derivedFromComponentIds.length ? { derivedFromComponentIds } : {}),
      ...(metadata ? { metadata } : {})
    },
    diagnostics: {
      knownComponentCount: knownIds.size,
      matchedSourceComponentIds,
      proposalComponentIds,
      derivedFromComponentIds,
      stampedOperationCount
    }
  };
}

function parseProposal(value, options = {}) {
  const parsed = parseStateDeltaProposalOutput(value, options);
  return parsed.ok ? parsed.value : null;
}

function compactTurnContext(turnContext = {}) {
  const next = cloneJson(turnContext || {});
  delete next.directorPackets;
  if (turnContext.directorPackets) {
    next.directorRetrieval = {
      audiences: Object.fromEntries(Object.entries(turnContext.directorPackets)
        .map(([audience, packet]) => [audience, {
          runId: packet?.runId || null,
          cardIds: uniqueStrings(packet?.cardIds || [], 12, 180),
          hydratedCardCount: Array.isArray(packet?.hydratedCards) ? packet.hydratedCards.length : 0,
          omittedHydrationCardIds: uniqueStrings(packet?.omittedHydrationCardIds || [], 12, 180)
        }]))
    };
  }
  return next;
}

function directorCardHydrationForWorker(workerKey, turnContext = {}) {
  const audiences = WORKER_DIRECTOR_AUDIENCES[workerKey] || [];
  const packets = turnContext.directorPackets || {};
  const selected = [];
  const cardIds = [];
  const runIds = [];
  for (const audience of audiences) {
    const packet = packets[audience] || null;
    if (!packet) continue;
    runIds.push(packet.runId);
    cardIds.push(...asArray(packet.cardIds));
    for (const card of asArray(packet.hydratedCards)) {
      if (!card?.id) continue;
      selected.push({
        audience,
        ...cloneJson(card)
      });
    }
  }
  if (!selected.length && !cardIds.length) return null;
  return {
    kind: 'directive.sidecarDirectorCardHydration.v1',
    workerKey,
    sourceRunIds: uniqueStrings(runIds, 4, 180),
    sourceCardIds: uniqueStrings(cardIds, 16, 180),
    cards: selected.slice(0, 8),
    usage: [
      'Use these hydrated cards as internal state guidance only.',
      'Do not expose director-only, locked, hidden, or reveal-gated details in player-facing summaries.',
      'Example line shapes describe voice texture; do not copy them as catchphrases.'
    ]
  };
}

function sidecarContext(campaignState, turnContext, workerKey = null) {
  const directorCardHydration = directorCardHydrationForWorker(workerKey, turnContext);
  return {
    campaignId: campaignState.campaign?.id,
    revision: activeRuntimeRevision(campaignState),
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
        inspiration: campaignState.commandBearing?.tracks?.inspiration
          ? {
              rank: campaignState.commandBearing?.tracks?.inspiration?.rank,
              marks: campaignState.commandBearing?.tracks?.inspiration?.marks,
              points: campaignState.commandBearing?.tracks?.inspiration?.points
            }
          : null,
        resolve: campaignState.commandBearing?.tracks?.resolve
          ? {
              rank: campaignState.commandBearing?.tracks?.resolve?.rank,
              marks: campaignState.commandBearing?.tracks?.resolve?.marks,
              points: campaignState.commandBearing?.tracks?.resolve?.points
            }
          : null
      }
    },
    crew: cloneJson(campaignState.crew || {}),
    relationships: cloneJson(campaignState.relationships || {}),
    ship: cloneJson(campaignState.ship || {}),
    pressureLedger: cloneJson(campaignState.pressureLedger || {}),
    missionComponents: missionComponentSidecarContext(campaignState),
    narrativeRoots: commandBearingNarrativeRoots(campaignState),
    ...(directorCardHydration ? { directorCardHydration } : {}),
    continuityProjection: cloneJson(turnContext.continuityProjection || null),
    turn: compactTurnContext(turnContext)
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

function compactCommandBearingRefId(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  const normalized = String(value).replace(/[^A-Za-z0-9_.:-]/g, '-').slice(0, 96);
  if (!/^[A-Za-z0-9_.:-]{1,96}$/.test(normalized)) return fallback;
  if (/(RAW|PROMPT|PROVIDER|MESSAGE|TEXT|SECRET|PRIVATE)/.test(normalized)) return fallback;
  return normalized;
}

function compactCommandBearingTextHash(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? hashStableJson(text).slice(0, 16) : null;
}

function commandBearingEvidenceHashInput(record = {}) {
  return {
    id: compactCommandBearingRefId(record.id || null, null),
    sourceOutcomeId: compactCommandBearingRefId(record.sourceOutcomeId || record.outcomeId || null, null),
    sourceTurnId: compactCommandBearingRefId(record.sourceTurnId || record.turnId || null, null),
    primarySignal: compactCommandBearingRefId(record.primarySignal || null, null),
    trackSignals: Array.isArray(record.trackSignals)
      ? record.trackSignals.map((signal) => compactCommandBearingRefId(signal, null)).filter(Boolean).sort()
      : [],
    strength: compactCommandBearingRefId(record.strength || null, null),
    status: compactCommandBearingRefId(record.status || null, null),
    visible: record.visible === true,
    criteria: {
      agency: record.criteria?.agency === true,
      commitment: record.criteria?.commitment === true,
      causality: record.criteria?.causality === true
    },
    actionSummaryHash: compactCommandBearingTextHash(record.actionSummary),
    consequenceSummaryHash: compactCommandBearingTextHash(record.consequenceSummary),
    playerFacingSummaryHash: compactCommandBearingTextHash(record.playerFacingSummary)
  };
}

function commandBearingEvidenceEffectRefsForOperations(operations = []) {
  return commandBearingEvidenceValues(operations).map((record, index) => {
    const evidenceHash = hashStableJson(commandBearingEvidenceHashInput(record));
    const id = compactCommandBearingRefId(record.id || null, `command-bearing-evidence:${evidenceHash.slice(0, 16)}`);
    return {
      kind: 'directive.commandBearingEvidence.v1',
      id,
      evidenceHash,
      sourceOutcomeId: compactCommandBearingRefId(record.sourceOutcomeId || record.outcomeId || null, null),
      sourceTurnId: compactCommandBearingRefId(record.sourceTurnId || record.turnId || null, null),
      primarySignal: compactCommandBearingRefId(record.primarySignal || null, null),
      trackSignals: Array.isArray(record.trackSignals)
        ? record.trackSignals.map((signal) => compactCommandBearingRefId(signal, null)).filter(Boolean)
        : [],
      strength: compactCommandBearingRefId(record.strength || null, null),
      status: compactCommandBearingRefId(record.status || null, null),
      ordinal: index
    };
  });
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
    appliedRevision: activeRuntimeRevision(review.campaignState || {})
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
      'Do not use merge at commandBearing.evidenceLedger.records; it is an array/list field.',
      'Allowed commandCulture operations, if any are truly warranted: set, append, merge, remove under commandCulture only.',
      'Do not use set, merge, or remove under commandBearing.'
    ];
  }
  return [
    'Allowed operations: set, append, upsert, merge, remove. Paths use dot notation and must begin with an authorized root.',
    'Array/list fields must use append or upsert, never merge. Use upsert only when each item has a stable id; include identityKey only when the id field is not named "id".',
    'Known array/list paths include mission.knownFacts, continuity.notes, relationships.seniorCrew, relationships.descriptiveLog, relationships.perceptionLedger, relationships.memoryLedger, crew.casualties, crew.reassignments, crew.assignments, crew.pressures, crew.relationshipModel.dimensions, ship.damage, ship.technicalDebt, ship.restrictions, pressureLedger.records, and commandLog.entries.'
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
  return (createRuntimeLedgerView(campaignState || {}).ingressLedger || [])
    .find((entry) => entry.id === ingressId) || null;
}

function sourceIngressSnapshot(campaignState, ingressId, turnContext = {}) {
  const ingress = ingressById(campaignState, ingressId);
  if (!ingress) {
    return null;
  }
  const sourceFrameRef = createTurnSourceFrameRef(ingress.sourceFrame || {
    id: ingress.sourceFrameId,
    campaignId: ingress.campaignId,
    saveId: campaignState?.campaignChatBinding?.saveId,
    chatId: ingress.chatId,
    hostMessageId: ingress.hostMessageId,
    textHash: ingress.textHash
  });
  const sourceToken = sourceFrameRef
    ? createSourceToken(sourceFrameRef)
    : ingress.id
      ? `ingress:${ingress.id}`
      : null;
  return {
    id: ingress.id,
    hostMessageId: ingress.hostMessageId || null,
    textHash: ingress.textHash || null,
    status: ingress.status || null,
    outcomeId: ingress.outcomeId || null,
    sourceFrameId: sourceFrameRef?.id || ingress.sourceFrameId || ingress.sourceFrame?.id || null,
    sourceFrameRef,
    sourceToken,
    coreTransactionId: ingress.coreTransactionId || ingress.transactionId || null
  };
}

function sourceTokenForJob(job = {}) {
  return job?.sourceIngress?.sourceToken
    || job?.source?.sourceToken
    || (job?.sourceIngress?.sourceFrameRef ? createSourceToken(job.sourceIngress.sourceFrameRef) : null)
    || (job?.source?.sourceFrameRef ? createSourceToken(job.source.sourceFrameRef) : null)
    || null;
}

function forgeWorkerResultForAcceptedSidecar(result = {}) {
  const workerKey = result.workerKey;
  const worker = WORKERS[workerKey] || {};
  const operations = result.proposal?.operations || result.applyProposal?.operations || [];
  return normalizeForgeWorkerResult({
    id: workerKey,
    workerId: workerKey,
    roleId: worker.roleId || workerKey,
    lane: 'campaignSidecar',
    allowedRoots: worker.allowedRoots || []
  }, {
    status: 'accepted',
    operations,
    effectRefs: workerKey === 'commandBearing'
      ? commandBearingEvidenceEffectRefsForOperations(operations)
      : [],
    promptDirtyDomains: normalizePromptDirtyDomains(worker.allowedRoots || []),
    diagnostics: {
      proposalId: result.applyProposal?.id || result.proposal?.id || null,
      workerKey,
      proposalStatus: result.proposal?.status || null
    }
  });
}

function promptDirtyDomainsForAcceptedSidecars(accepted = [], allowedRoots = []) {
  return normalizePromptDirtyDomains([
    ...allowedRoots,
    ...accepted.flatMap((result) => result.applyProposal?.operations || result.proposal?.operations || [])
      .map((operation) => operation?.domain || String(operation?.path || '').split('.')[0])
      .filter(Boolean),
    ...accepted.flatMap((result) => result.workerKey || [])
  ]);
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
  if (!current && source.coreTransactionId && source.sourceFrameId) return null;
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
  const revision = activeRuntimeRevision(campaignState);
  const boundaryNotes = WORKER_BOUNDARY_NOTES[workerKey] || [];
  return [
    `You are Directive's ${workerKey} support worker.`,
    'Analyze the committed turn and propose only durable state changes supported by evidence in the supplied context.',
    'Return one JSON object only. Do not narrate. Do not expose internal reasoning.',
    `Authorized top-level roots: ${worker.allowedRoots.join(', ')}.`,
    ...workerOperationRules(workerKey),
    'String values must be strict JSON-safe. Do not copy raw dialogue with double quotes into evidence fields; paraphrase quoted speech or escape every quote.',
    `Keep the proposal compact: at most ${SIDECAR_PROPOSAL_MAX_OPERATIONS} operations, concise object values, and a summary under 180 characters. Prefer an empty operations array over exhaustive bookkeeping.`,
    'Mission Components in Context are player-reviewed source records. If an operation is derived from one, include its id in sourceComponentIds on the promoted record value. Do not overwrite or paraphrase component verbatim source text.',
    'If an observation belongs to another root, do not write it for this worker; mention the boundary in summary and return an empty operations array if needed.',
    ...boundaryNotes.map((note) => `Boundary: ${note}`),
    'Use an empty operations array when no durable change is warranted.',
    '',
    workerRequiredShape(workerKey, worker, revision, turnContext),
    '',
    `Context:\n${JSON.stringify(sidecarContext(campaignState, turnContext, workerKey), null, 2)}`
  ].join('\n');
}

export function createCampaignSidecarScheduler({
  generationRouter,
  stateDeltaGateway,
  getCampaignState,
  setCampaignState,
  persistCampaignState,
  syncPromptContext = null,
  appendCoreDiagnostic = null,
  appendCoreDiagnosticsBatch = null,
  commitCoreBackgroundBatch = null,
  forgeCoordinator = null,
  now = null,
  dropForbiddenSidecarOperations = true,
  reportActivity = null
} = {}) {
  if (!generationRouter?.generate) throw new Error('CampaignSidecarScheduler requires generationRouter.generate.');
  if (!stateDeltaGateway?.validateOperations) throw new Error('CampaignSidecarScheduler requires stateDeltaGateway.validateOperations.');
  if (typeof getCampaignState !== 'function' || typeof setCampaignState !== 'function') {
    throw new Error('CampaignSidecarScheduler requires campaign state callbacks.');
  }
  if (typeof persistCampaignState !== 'function') throw new Error('CampaignSidecarScheduler requires persistCampaignState.');

  let queue = Promise.resolve();
  let diagnosticQueue = Promise.resolve();
  let activeDiagnosticBatch = null;
  const completedProviderBatches = new Map();

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
    return initializeCampaignRuntimeTracking(getCampaignState());
  }

  async function journalBatch(events = [], summary = 'Recorded sidecar batch events.') {
    if (!events.length) return initializeCampaignRuntimeTracking(getCampaignState());
    return initializeCampaignRuntimeTracking(getCampaignState());
  }

  function diagnosticStatusForWorkerResult(status = null, error = null) {
    const code = error?.code || error?.details?.code || null;
    if (code === 'DIRECTIVE_SIDECAR_SOURCE_STALE') return 'stale';
    return status || 'settled';
  }

  function sidecarCoreDiagnosticEvent(job, status, details = {}) {
    if (!job) return null;
    const error = details.error || null;
    const result = details.result || null;
    return {
      type: 'sidecar',
      worker: job.workerKey,
      sidecarType: job.workerKey,
      roleId: job.roleId || job.worker?.roleId || null,
      status,
      resultStatus: result?.status || details.resultStatus || null,
      source: 'campaignSidecarScheduler',
      severity: ['failed', 'rejected', 'stale'].includes(status) ? 'warning' : 'info',
      classification: job.snapshot?.turnContext?.classification || null,
      campaignId: job.source?.campaignId || null,
      saveId: job.source?.saveId || null,
      chatId: job.source?.chatId || null,
      ingressId: job.baseEventContext?.ingressId || job.source?.ingressId || job.sourceIngress?.id || null,
      turnId: job.baseEventContext?.turnId || job.source?.turnId || null,
      outcomeId: job.baseEventContext?.outcomeId || job.source?.outcomeId || job.sourceIngress?.outcomeId || null,
      hostMessageId: job.sourceIngress?.hostMessageId || null,
      sourceFrameId: job.sourceIngress?.sourceFrameId || null,
      sourceFrameRef: cloneJson(job.sourceIngress?.sourceFrameRef || null),
      sourceToken: job.sourceIngress?.sourceToken || null,
      coreTransactionId: job.sourceIngress?.coreTransactionId || null,
      sourceStatus: job.sourceIngress?.status || null,
      baseRevision: job.baseRevision,
      appliedRevision: result?.revision || null,
      operationCount: Array.isArray(result?.proposal?.operations) ? result.proposal.operations.length : null,
      domains: Array.isArray(result?.domains) ? cloneJson(result.domains) : undefined,
      anchorRangeHash: job.baseEventContext?.anchorRangeHash || null,
      reconciliationRunId: job.baseEventContext?.reconciliationRunId || null,
      staleReasons: error?.details?.reasons ? cloneJson(error.details.reasons) : undefined,
      forgeSettlement: result?.forgeSettlement ? cloneJson(result.forgeSettlement) : undefined,
      postSettlementWarnings: Array.isArray(result?.postSettlementWarnings)
        ? cloneJson(result.postSettlementWarnings)
        : (Array.isArray(details.postSettlementWarnings) ? cloneJson(details.postSettlementWarnings) : undefined),
      replayed: result?.replayed === true || details.replayed === true ? true : undefined,
      bridgeReason: error?.details?.reason || undefined,
      bridgeStatus: error?.details?.status || undefined,
      bridgeEffectiveStatus: error?.details?.effectiveStatus || undefined,
      parse: details.parsedDiagnostics?.parse ? cloneJson(details.parsedDiagnostics.parse) : undefined,
      batch: {
        concurrent: job.batchSize > 1,
        batchSize: job.batchSize,
        index: job.index
      },
      errorCode: error?.code || null,
      observedAt: timestamp(now)
    };
  }

  function queueCoreDiagnostic(job, status, details = {}) {
    if (typeof appendCoreDiagnostic !== 'function' && typeof appendCoreDiagnosticsBatch !== 'function') return null;
    const event = sidecarCoreDiagnosticEvent(job, status, details);
    if (!event) return null;
    if (!event.coreTransactionId) return null;
    queueCoreDiagnosticEvent(event);
    return cloneJson(event);
  }

  function queueCoreDiagnosticEvent(event = {}) {
    if (!event || typeof event !== 'object' || !event.coreTransactionId) return null;
    if (Array.isArray(activeDiagnosticBatch)) {
      activeDiagnosticBatch.push(cloneJson(event));
    } else {
      flushCoreDiagnostics([event]);
    }
    return cloneJson(event);
  }

  function flushCoreDiagnostics(events = []) {
    const diagnostics = (Array.isArray(events) ? events : [events])
      .filter((event) => event && typeof event === 'object' && !Array.isArray(event));
    if (!diagnostics.length) return diagnosticQueue;
    diagnosticQueue = diagnosticQueue
      .catch(() => null)
      .then(async () => {
        if (typeof appendCoreDiagnosticsBatch === 'function') {
          return appendCoreDiagnosticsBatch(cloneJson(diagnostics));
        }
        if (typeof appendCoreDiagnostic !== 'function') return null;
        for (const event of diagnostics) {
          await appendCoreDiagnostic(cloneJson(event));
        }
        return null;
      })
      .catch(() => null);
    return diagnosticQueue;
  }

  function createWorkerJob(workerKey, state, turnContext, index, batchSize, activityReporter = null) {
    const worker = WORKERS[workerKey];
    if (!worker) return { workerKey, status: 'skipped', reason: 'unknown-worker' };
    const baseRevision = activeRuntimeRevision(state);
    const baseEventContext = sidecarEventContext(turnContext);
    const sourceIngress = sourceIngressSnapshot(state, baseEventContext.ingressId, turnContext);
    const source = {
      campaignId: state.campaign?.id || null,
      saveId: state.campaignChatBinding?.saveId || null,
      chatId: state.campaignChatBinding?.chatId || null,
      turnId: turnContext.turnId || null,
      outcomeId: turnContext.outcomeId || null,
      ingressId: turnContext.ingressId || null,
      sourceFrameRef: cloneJson(sourceIngress?.sourceFrameRef || null),
      sourceToken: sourceIngress?.sourceToken || null,
      revision: baseRevision,
      continuityProjection: cloneJson(turnContext.continuityProjection || null)
    };
    return {
      id: `campaign-sidecar:${workerKey}:${baseRevision}:${index}`,
      type: workerKey,
      roleId: worker.roleId,
      source,
      snapshot: {
        campaignState: cloneJson(state),
        turnContext: cloneJson(turnContext),
        continuityProjection: cloneJson(turnContext.continuityProjection || null)
      },
      policy: {
        timeoutMs: 45000,
        mayProposeState: true,
        mayInjectPrompt: false,
        blocking: false
      },
      workerKey,
      worker,
      activityReporter,
      baseRevision,
      baseEventContext,
      sourceIngress,
      index,
      batchSize,
      request: {
        systemPrompt: 'Return one strict JSON state-delta proposal. No markdown, prose, or private reasoning.',
        prompt: proposalPrompt(workerKey, worker, state, turnContext),
        maxTokens: SIDECAR_PROPOSAL_MAX_TOKENS
      }
    };
  }

  function acceptedBatchSettlementForForge({
    accepted = [],
    allowedRoots = [],
    turnContext = {},
    baseRevision = null
  } = {}) {
    const transactionIds = [...new Set(accepted.map((result) => result.job?.sourceIngress?.coreTransactionId).filter(Boolean))];
    if (transactionIds.length !== 1) return null;
    const transactionId = transactionIds[0];
    const sourceFrameRefs = [...new Map(accepted
      .map((result) => result.job?.sourceIngress?.sourceFrameRef || result.job?.source?.sourceFrameRef || null)
      .filter(Boolean)
      .map((ref) => [ref.id || JSON.stringify(ref), ref])).values()];
    const sourceTokens = [...new Set(accepted
      .map((result) => result.job?.sourceIngress?.sourceToken || result.job?.source?.sourceToken)
      .filter(Boolean))];
    const workerResults = accepted.map(forgeWorkerResultForAcceptedSidecar);
    const acceptedBatchHash = hashStableJson(workerResults);
    const idempotencyKey = `campaign-sidecar:${transactionId}:${turnContext.outcomeId || turnContext.ingressId || baseRevision}`;
    const batchId = `campaign-sidecar:${transactionId}:${turnContext.outcomeId || turnContext.ingressId || baseRevision}`;
    const settlement = {
      transactionId,
      idempotencyKey,
      batchId,
      acceptedBatchHash,
      providerOwner: 'campaignSidecarScheduler',
      phaseAfter: 'backgroundSettling',
      outcomeId: turnContext.outcomeId || null,
      sourceFrameRef: sourceFrameRefs.length === 1 ? cloneJson(sourceFrameRefs[0]) : undefined,
      sourceToken: sourceTokens.length === 1 ? sourceTokens[0] : undefined,
      baseMechanicsRevision: null,
      promptDirtyDomains: normalizePromptDirtyDomains(allowedRoots),
      workerResults,
      observedAt: timestamp(now)
    };
    return settlement;
  }

  function forgeBridgeFailureFromResult(result, phase) {
    const replayResult = result?.status === 'replayed' ? result.result : null;
    const status = compactSafeIdentifier(result?.status || 'unknown', { fallback: 'unknown' });
    const effectiveStatus = compactSafeIdentifier(replayResult?.status || result?.status || 'unknown', { fallback: 'unknown' });
    const reason = result?.reason || replayResult?.reason || result?.diagnostic?.diagnostic?.reason || result?.diagnostic?.reason || replayResult?.diagnostic?.diagnostic?.reason || replayResult?.diagnostic?.reason || null;
    const error = new Error(`CORE/FORGE accepted sidecar bridge ${phase} did not settle safely.`);
    error.code = phase === 'preflight'
      ? 'DIRECTIVE_FORGE_PREFLIGHT_FAILED'
      : 'DIRECTIVE_FORGE_FINAL_SETTLEMENT_FAILED';
    error.details = {
      phase,
      status,
      effectiveStatus,
      replayed: result?.status === 'replayed',
      reason,
      providerOwner: compactSafeIdentifier(result?.providerOwner || null, { fallback: null }),
      diagnosticId: compactSafeIdentifier(result?.diagnostic?.id || null, { fallback: null })
    };
    return error;
  }

  function forgeEffectiveResult(result) {
    return result?.status === 'replayed' ? result.result : result;
  }

  function compactSourceFrameRefForAcceptedBatch(ref = null) {
    if (!ref || typeof ref !== 'object') return null;
    const externalRef = ref.externalPromptEnvironmentRef && typeof ref.externalPromptEnvironmentRef === 'object'
      ? {
        kind: ref.externalPromptEnvironmentRef.kind || null,
        schemaVersion: ref.externalPromptEnvironmentRef.schemaVersion || null,
        hash: ref.externalPromptEnvironmentRef.hash || null,
        byteLength: Number.isFinite(Number(ref.externalPromptEnvironmentRef.byteLength))
          ? Number(ref.externalPromptEnvironmentRef.byteLength)
          : null,
        status: ref.externalPromptEnvironmentRef.status || null,
        observedAt: ref.externalPromptEnvironmentRef.observedAt || null,
        knownExternalPromptKeys: Array.isArray(ref.externalPromptEnvironmentRef.knownExternalPromptKeys)
          ? [...ref.externalPromptEnvironmentRef.knownExternalPromptKeys]
          : []
      }
      : null;
    return {
      kind: ref.kind || 'directive.turnSourceFrameRef.v1',
      schemaVersion: ref.schemaVersion || 1,
      id: ref.id || null,
      campaignId: ref.campaignId || null,
      saveId: ref.saveId || null,
      chatId: ref.chatId || null,
      hostMessageId: ref.hostMessageId || null,
      textHash: ref.textHash || null,
      selectedAssistantVariantHash: ref.selectedAssistantVariantHash || null,
      ...(externalRef ? { externalPromptEnvironmentRef: externalRef } : {})
    };
  }

  function coreAcceptedBatchProjectionForPrompt({
    settlement = null,
    forgeSettlement = null,
    workerKeys = [],
    promptDirtyDomains = []
  } = {}) {
    if (!settlement) return null;
    const effective = forgeEffectiveResult(forgeSettlement) || {};
    const background = effective.background || {};
    const workerResults = Array.isArray(settlement.workerResults) ? settlement.workerResults : [];
    const operationCount = workerResults.reduce((count, result) => (
      count + (Array.isArray(result.operations) ? result.operations.length : 0)
    ), 0);
    const commandBearingEvidence = workerResults
      .flatMap((result) => Array.isArray(result.effectRefs) ? result.effectRefs : [])
      .filter((ref) => ref?.kind === 'directive.commandBearingEvidence.v1')
      .map((ref) => ({
        kind: 'directive.commandBearingEvidenceProjection.v1',
        evidenceId: ref.id || null,
        transactionId: settlement.transactionId || null,
        batchId: settlement.batchId || null,
        sourceFrameId: settlement.sourceFrameRef?.id || null,
        sourceOutcomeId: ref.sourceOutcomeId || ref.outcomeId || settlement.outcomeId || null,
        primarySignal: ref.primarySignal || null,
        trackSignals: Array.isArray(ref.trackSignals) ? [...ref.trackSignals] : [],
        strength: ref.strength || null,
        status: ref.status || null,
        evidenceHash: ref.evidenceHash || ref.hash || null,
        acceptedBatchHash: effective.acceptedBatchHash || settlement.acceptedBatchHash || null
      }));
    const backgroundBatchIds = [
      background.backgroundBatchId,
      ...(Array.isArray(background.backgroundBatchIds) ? background.backgroundBatchIds : []),
      ...(Array.isArray(background.backgroundBatches) ? background.backgroundBatches.map((batch) => batch?.batchId) : [])
    ].filter(Boolean);
    return {
      kind: 'directive.coreAcceptedSidecarBatchProjection.v1',
      schemaVersion: 1,
      transactionId: settlement.transactionId || null,
      batchId: settlement.batchId || null,
      idempotencyKey: settlement.idempotencyKey || null,
      acceptedBatchHash: effective.acceptedBatchHash || settlement.acceptedBatchHash || null,
      outcomeId: settlement.outcomeId || null,
      providerOwner: settlement.providerOwner || 'campaignSidecarScheduler',
      workerKey: 'campaignSidecarBatch',
      workerKeys: [...workerKeys],
      dirtyDomains: [...promptDirtyDomains],
      operationCount,
      workerCount: workerResults.length,
      commandBearingEvidence,
      sourceFrameRef: compactSourceFrameRefForAcceptedBatch(settlement.sourceFrameRef || null),
      sourceToken: settlement.sourceToken || null,
      background: {
        status: effective.status || null,
        transactionId: background.id || background.transactionId || background.coreTransactionId || settlement.transactionId || null,
        backgroundBatchIds,
        warningCount: Array.isArray(effective.warnings) ? effective.warnings.length : 0
      }
    };
  }

  function isSuccessfulForgeAcceptedSettlement(result) {
    const effective = forgeEffectiveResult(result);
    return effective?.status === 'settled' || effective?.status === 'noChange';
  }

  function compactDiagnosticHash(value) {
    if (value === null || value === undefined) return null;
    return hashStableJson(String(value)).slice(0, 16);
  }

  function compactTextEvidenceHash(value) {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text ? hashStableJson(text).slice(0, 16) : null;
  }

  function compactSafeIdentifier(value, { fallback = null, allowed = null, rejectPattern = /(RAW|PROMPT|PROVIDER|MESSAGE|TEXT|SECRET|PRIVATE)/ } = {}) {
    if (value === null || value === undefined) return fallback;
    const normalized = String(value).replace(/[^A-Za-z0-9_.:-]/g, '-').slice(0, 96);
    if (allowed && allowed.has(normalized)) return normalized;
    if (!/^[A-Za-z0-9_.:-]{1,96}$/.test(normalized)) return fallback;
    if (rejectPattern && rejectPattern.test(normalized.toUpperCase())) return fallback;
    return normalized || fallback;
  }

  function compactSafeCode(value, fallback = 'DIRECTIVE_SIDECAR_BATCH_REJECTED') {
    const raw = String(value || '');
    const knownNonDirectiveCodes = new Set(['SIMULATED_FAILURE']);
    if (knownNonDirectiveCodes.has(raw)) return raw;
    if (/^DIRECTIVE_[A-Z0-9_:-]{1,80}$/.test(raw) && !/(RAW|PROMPT|PROVIDER|MESSAGE|TEXT|SECRET|PRIVATE)/.test(raw)) {
      return raw;
    }
    return fallback;
  }

  function compactSafeReason(value) {
    if (value === null || value === undefined) return null;
    const normalized = String(value).replace(/[^A-Za-z0-9_.:-]/g, '-').slice(0, 96);
    const known = new Set([
      'path-conflict',
      'accepted-batch-replay-mismatch',
      'source-token-stale',
      'source-stale',
      'revision-mismatch',
      'bridge-failed-before-old-mutation',
      'DIRECTIVE_SIDECAR_SOURCE_STALE',
      'DIRECTIVE_SIDECAR_SOURCE_INGRESS_MISSING',
      'DIRECTIVE_STATE_REVISION_CONFLICT'
    ]);
    if (known.has(normalized)) return normalized;
    return 'unsafe-reason-redacted';
  }

  function backgroundMatchesTransaction(background = null, transactionId = null) {
    if (!background || typeof background !== 'object') return false;
    if (background.ok === false) return false;
    const backgroundTransactionId = background.id || background.transactionId || background.coreTransactionId || null;
    if (!transactionId || !backgroundTransactionId || backgroundTransactionId !== transactionId) return false;
    return true;
  }

  function backgroundMatchesBatch(background = null, { expectedBatchId = null, expectedIdempotencyKey = null } = {}) {
    if (!background || typeof background !== 'object') return false;
    const batchIds = [
      background.backgroundBatchId,
      ...(Array.isArray(background.backgroundBatchIds) ? background.backgroundBatchIds : []),
      ...(Array.isArray(background.backgroundBatches) ? background.backgroundBatches.map((batch) => batch?.batchId) : [])
    ].filter(Boolean);
    if (!expectedBatchId || !batchIds.includes(expectedBatchId)) return false;
    if (!expectedIdempotencyKey) return true;
    const idempotencyKeys = [
      background.backgroundIdempotencyKey,
      ...(Array.isArray(background.backgroundIdempotencyKeys) ? background.backgroundIdempotencyKeys : []),
      ...(Array.isArray(background.backgroundBatches) ? background.backgroundBatches.map((batch) => batch?.idempotencyKey) : [])
    ].filter(Boolean);
    return idempotencyKeys.includes(expectedIdempotencyKey);
  }

  function backgroundMatchesReviewHash(background = null, expectedReviewHash = null) {
    if (!expectedReviewHash || !background || typeof background !== 'object') return false;
    const hashes = [
      background.reviewHash,
      background.forgeBatchRef?.reviewHash,
      ...(Array.isArray(background.backgroundBatches)
        ? background.backgroundBatches.flatMap((batch) => [
            batch?.reviewHash,
            batch?.forgeBatchRef?.reviewHash,
            batch?.batchRef?.reviewHash
          ])
        : []),
      ...(Array.isArray(background.backgroundEffectRefs)
        ? background.backgroundEffectRefs.flatMap((effect) => [
            effect?.reviewHash,
            effect?.forgeBatchRef?.reviewHash
          ])
        : [])
    ].filter(Boolean);
    return hashes.includes(expectedReviewHash);
  }

  function commandBearingReviewRecordHashInput(record = {}) {
    return {
      id: compactSafeIdentifier(record.id || null, { fallback: null }),
      closureId: compactSafeIdentifier(record.closureId || null, { fallback: null }),
      markAwarded: record.markAwarded === true,
      awardedTrack: compactSafeIdentifier(record.awardedTrack || null, {
        fallback: null,
        allowed: new Set(['inspiration', 'resolve'])
      }),
      criteriaSatisfied: {
        agency: record.criteriaSatisfied?.agency === true,
        commitment: record.criteriaSatisfied?.commitment === true,
        causality: record.criteriaSatisfied?.causality === true
      },
      evidenceIdHashes: Array.isArray(record.evidenceIds)
        ? record.evidenceIds.map((id) => compactTextEvidenceHash(id)).filter(Boolean).sort()
        : [],
      awardSummaryHash: compactTextEvidenceHash(record.awardSummary),
      noAwardReasonHash: compactTextEvidenceHash(record.noAwardReason)
    };
  }

  function commandBearingReviewHashInput(review = {}) {
    const records = Array.isArray(review.review?.records)
      ? review.review.records.map(commandBearingReviewRecordHashInput)
      : [];
    records.sort((left, right) => String(left.closureId || left.id || '').localeCompare(String(right.closureId || right.id || '')));
    return {
      status: compactSafeIdentifier(review.status || null, { fallback: null }),
      sourceOutcomeIdHashes: Array.isArray(review.sourceOutcomeIds)
        ? review.sourceOutcomeIds.map((id) => compactTextEvidenceHash(id)).filter(Boolean).sort()
        : [],
      stateRevision: activeRuntimeRevision(review.campaignState || {}),
      records
    };
  }

  function backgroundMatchesAcceptedBatchHash(background = null, expectedAcceptedBatchHash = null) {
    if (!expectedAcceptedBatchHash || !background || typeof background !== 'object') return false;
    const hashes = [
      background.acceptedBatchHash,
      background.forgeBatchRef?.acceptedBatchHash,
      ...(Array.isArray(background.backgroundBatches)
        ? background.backgroundBatches.flatMap((batch) => [
            batch?.acceptedBatchHash,
            batch?.forgeBatchRef?.acceptedBatchHash,
            batch?.batchRef?.acceptedBatchHash
          ])
        : []),
      ...(Array.isArray(background.backgroundEffectRefs)
        ? background.backgroundEffectRefs.flatMap((effect) => [
            effect?.acceptedBatchHash,
            effect?.forgeBatchRef?.acceptedBatchHash
          ])
        : [])
    ].filter(Boolean);
    return hashes.includes(expectedAcceptedBatchHash);
  }

  function acceptedBatchHashMatches(result, expectedAcceptedBatchHash = null) {
    if (!expectedAcceptedBatchHash) return true;
    const effective = forgeEffectiveResult(result);
    return effective?.acceptedBatchHash === expectedAcceptedBatchHash;
  }

  function hasDurableAcceptedSettlement(result, {
    effectful = false,
    expectedTransactionId = null,
    expectedBatchId = null,
    expectedIdempotencyKey = null,
    expectedAcceptedBatchHash = null
  } = {}) {
    if (!effectful) return true;
    const effective = forgeEffectiveResult(result);
    if (!effective) return false;
    if (!acceptedBatchHashMatches(result, expectedAcceptedBatchHash)) return false;
    const hasDurableBackground = backgroundMatchesTransaction(effective.background, expectedTransactionId)
      && backgroundMatchesBatch(effective.background, { expectedBatchId, expectedIdempotencyKey })
      && backgroundMatchesAcceptedBatchHash(effective.background, expectedAcceptedBatchHash);
    if (hasDurableBackground) return true;
    return false;
  }

  function assertForgeBridgeResultSafe(result, phase, options = {}) {
    if (!result) return;
    if (result.status === 'replayed') {
      if (!isSuccessfulForgeAcceptedSettlement(result) || !hasDurableAcceptedSettlement(result, options)) {
        throw forgeBridgeFailureFromResult(result, phase);
      }
      return;
    }
    const safeStatuses = phase === 'preflight'
      ? new Set(['prepared'])
      : new Set(['settled', 'noChange']);
    if (!safeStatuses.has(result.status)) {
      throw forgeBridgeFailureFromResult(result, phase);
    }
    if (phase === 'finalSettlement' && !hasDurableAcceptedSettlement(result, options)) {
      throw forgeBridgeFailureFromResult(result, phase);
    }
  }

  function compactForgeSettlementWarning(warning = null) {
    if (!warning || typeof warning !== 'object') return null;
    const knownStages = new Set(['diagnostics', 'lens', 'promptSync', 'commandBearingReview', 'acceptedJournal']);
    const knownStatuses = new Set(['ok', 'warning', 'failed', 'skipped']);
    const stage = knownStages.has(warning.stage) ? warning.stage : 'unknown';
    const code = /^DIRECTIVE_[A-Z0-9_:-]{1,80}$/.test(String(warning.code || ''))
      && !/(RAW|PROMPT|PROVIDER|MESSAGE|TEXT|SECRET|PRIVATE)/.test(String(warning.code || ''))
      ? String(warning.code)
      : 'DIRECTIVE_FORGE_SETTLEMENT_WARNING';
    const status = knownStatuses.has(warning.status) ? warning.status : null;
    return {
      stage,
      code,
      ...(status ? { status } : {}),
      ...(stage === 'unknown' || code === 'DIRECTIVE_FORGE_SETTLEMENT_WARNING' ? { diagnosticHash: compactDiagnosticHash(warning) } : {})
    };
  }

  function compactForgeSettlementDiagnostics(result) {
    if (!result) return null;
    const effective = forgeEffectiveResult(result) || result;
    return {
      status: effective.status || null,
      applied: effective.applied === true,
      transactionId: effective.transactionId || result.transactionId || null,
      acceptedBatchHash: effective.acceptedBatchHash || null,
      replayed: result.status === 'replayed' || result.replayed === true || effective.replayed === true,
      warning: compactForgeSettlementWarning(effective.warning),
      warningCount: Array.isArray(effective.warnings) ? effective.warnings.length : 0
    };
  }

  function compactPostSettlementWarning(stage, error) {
    const warning = {
      stage,
      code: error?.code || 'DIRECTIVE_SIDECAR_POST_SETTLEMENT_WARNING'
    };
    const knownStages = new Set(['lens', 'promptSync', 'commandBearingReview', 'acceptedJournal']);
    const safeStage = knownStages.has(warning.stage) ? warning.stage : 'unknown';
    const rawCode = String(warning.code || '');
    const safeCode = /^DIRECTIVE_[A-Z0-9_:-]{1,80}$/.test(rawCode)
      && !/(RAW|PROMPT|PROVIDER|MESSAGE|TEXT|SECRET|PRIVATE)/.test(rawCode)
      ? rawCode
      : 'DIRECTIVE_SIDECAR_POST_SETTLEMENT_WARNING';
    return {
      stage: safeStage,
      code: safeCode,
      ...(safeStage === 'unknown' || safeCode === 'DIRECTIVE_SIDECAR_POST_SETTLEMENT_WARNING' ? { diagnosticHash: compactDiagnosticHash(warning) } : {})
    };
  }

  function compactBridgeFailureDetails(error, compensation) {
    const details = error?.details || {};
    return {
      phase: compactSafeIdentifier(details.phase || null, { fallback: null }),
      status: compactSafeIdentifier(details.status || null, { fallback: null }),
      effectiveStatus: compactSafeIdentifier(details.effectiveStatus || null, { fallback: null }),
      replayed: details.replayed === true,
      reason: compactSafeReason(details.reason),
      providerOwner: compactSafeIdentifier(details.providerOwner || null, { fallback: null }),
      diagnosticId: compactSafeIdentifier(details.diagnosticId || null, { fallback: null }),
      compensation: cloneJson(compensation)
    };
  }

  function genericBridgeFailureMessage(code) {
    return `Campaign sidecar bridge rejected before accepted settlement (${code || 'DIRECTIVE_SIDECAR_BATCH_REJECTED'}).`;
  }

  function compactProviderBatchFailure(error) {
    const code = compactSafeCode(error?.code || 'DIRECTIVE_SIDECAR_BATCH_FAILED', 'DIRECTIVE_SIDECAR_BATCH_FAILED');
    return {
      code,
      message: `Campaign sidecar provider batch failed (${code}).`
    };
  }

  function compactWorkerFailureError(error) {
    const code = compactSafeCode(error?.code || 'DIRECTIVE_SIDECAR_WORKER_FAILED', 'DIRECTIVE_SIDECAR_WORKER_FAILED');
    return {
      code,
      message: `Campaign sidecar worker failed (${code}).`
    };
  }

  function compactProviderDiagnostics(diagnostics = null) {
    if (!diagnostics || typeof diagnostics !== 'object') return null;
    return {
      providerId: compactSafeIdentifier(diagnostics.providerId || null, { fallback: null }),
      providerKind: compactSafeIdentifier(diagnostics.providerKind || null, { fallback: null }),
      model: compactSafeIdentifier(diagnostics.model || null, { fallback: null }),
      latencyMs: Number.isFinite(Number(diagnostics.latencyMs)) ? Number(diagnostics.latencyMs) : null,
      transportStatus: Number.isFinite(Number(diagnostics.transport?.status)) ? Number(diagnostics.transport.status) : null,
      featureStatus: compactSafeIdentifier(diagnostics.feature?.status || null, { fallback: null }),
      diagnosticHash: compactDiagnosticHash(diagnostics)
    };
  }

  function isForgeAcceptedReplay(result) {
    return result?.status === 'replayed' && isSuccessfulForgeAcceptedSettlement(result);
  }

  function forgeOwnsAcceptedPromptFlush() {
    return typeof forgeCoordinator?.flushAcceptedBatchPrompt === 'function'
      || typeof forgeCoordinator?.settleAcceptedBatch === 'function'
      || typeof forgeCoordinator?.prepareAcceptedBatch === 'function';
  }

  function acceptedPromptFlushUnavailableWarning() {
    return compactPostSettlementWarning('lens', {
      code: 'DIRECTIVE_SIDECAR_POST_SETTLEMENT_LENS_FLUSH_UNAVAILABLE'
    });
  }

  function appliedReplayResults(pendingResults = [], accepted = [], replayResult = null, {
    postSettlementWarnings: replayPostSettlementWarnings = []
  } = {}) {
    const currentRevision = activeRuntimeRevision(getCampaignState());
    const diagnostics = compactForgeSettlementDiagnostics(replayResult);
    const warnings = Array.isArray(replayPostSettlementWarnings) ? cloneJson(replayPostSettlementWarnings) : [];
    return pendingResults.map((result) => {
      if (result.status !== 'pendingApply') return result;
      const final = {
        workerKey: result.workerKey,
        status: 'applied',
        replayed: true,
        proposal: cloneJson(result.proposal),
        revision: currentRevision,
        domains: [],
        forgeSettlement: diagnostics,
        ...(warnings.length ? { postSettlementWarnings: cloneJson(warnings) } : {})
      };
      queueCoreDiagnostic(result.job, 'applied', { result: final, replayed: true });
      return final;
    });
  }

  async function prepareAcceptedWorkerBatchWithForge(options = {}) {
    const settlement = options.settlement || acceptedBatchSettlementForForge(options);
    if (!settlement) return null;
    const effectful = settlement.workerResults.some((result) => (result.operations || []).length > 0);
    if (typeof forgeCoordinator?.prepareAcceptedBatch === 'function') {
      const result = await forgeCoordinator.prepareAcceptedBatch(settlement);
      assertForgeBridgeResultSafe(result, 'preflight', {
        effectful,
        expectedTransactionId: settlement.transactionId,
        expectedBatchId: settlement.batchId,
        expectedIdempotencyKey: settlement.idempotencyKey,
        expectedAcceptedBatchHash: settlement.acceptedBatchHash
      });
      return result;
    }
    return null;
  }

  async function settleAcceptedWorkerBatchWithForge(options = {}) {
    const settlement = options.settlement || acceptedBatchSettlementForForge(options);
    if (!settlement) return null;
    const effectful = settlement.workerResults.some((result) => (result.operations || []).length > 0);
    if (typeof forgeCoordinator?.settleAcceptedBatch === 'function') {
      const canBatchSettlementDiagnostics = typeof appendCoreDiagnostic === 'function' || typeof appendCoreDiagnosticsBatch === 'function';
      const settlementInput = canBatchSettlementDiagnostics
        ? {
            ...settlement,
            appendDiagnostic: (transactionId, diagnostic) => queueCoreDiagnosticEvent({
              ...cloneJson(diagnostic || {}),
              coreTransactionId: transactionId
            })
          }
        : settlement;
      const result = await forgeCoordinator.settleAcceptedBatch(settlementInput);
      assertForgeBridgeResultSafe(result, 'finalSettlement', {
        effectful,
        expectedTransactionId: settlement.transactionId,
        expectedBatchId: settlement.batchId,
        expectedIdempotencyKey: settlement.idempotencyKey,
        expectedAcceptedBatchHash: settlement.acceptedBatchHash
      });
      return result;
    }
    return null;
  }

  function campaignContextForForgePromptFlush(campaignState = {}) {
    const binding = campaignState?.campaignChatBinding || {};
    const activeRevisions = activeCoreRevisionState(campaignState);
    return {
      campaignId: campaignState?.campaign?.id || binding.campaignId || null,
      saveId: binding.saveId || null,
      branchId: binding.branchId || 'main',
      chatId: binding.chatId || null,
      mechanicsRevision: activeRevisions.mechanics,
      runtimeRevision: activeRevisions.runtime
    };
  }

  function promptFlushStateFingerprint(campaignState = {}) {
    const binding = campaignState?.campaignChatBinding || {};
    const activeRevisions = activeCoreRevisionState(campaignState);
    return {
      campaignId: campaignState?.campaign?.id || binding.campaignId || null,
      saveId: binding.saveId || null,
      branchId: binding.branchId || 'main',
      chatId: binding.chatId || null,
      revision: activeRevisions.runtime,
      mechanicsRevision: activeRevisions.mechanics,
      revisionAuthority: activeRevisions.authority
    };
  }

  function promptFlushInputStillCurrent(inputState = {}, currentState = {}) {
    return hashStableJson(promptFlushStateFingerprint(inputState)) === hashStableJson(promptFlushStateFingerprint(currentState));
  }

  function promptInstallFreshnessGuard(inputState = {}) {
    const inputFingerprint = promptFlushStateFingerprint(inputState);
    return () => {
      const currentState = initializeCampaignRuntimeTracking(getCampaignState());
      if (hashStableJson(inputFingerprint) === hashStableJson(promptFlushStateFingerprint(currentState))) return true;
      return {
        ok: false,
        status: 'stale-source',
        code: 'DIRECTIVE_SIDECAR_POST_SETTLEMENT_STATE_STALE',
        reason: 'prompt-source-state-changed-before-install'
      };
    };
  }

  function promptInstallSkippedByFreshnessGuard(result = {}) {
    return result?.promptInstallSkipped === true
      || result?.status === 'installSkippedStale'
      || result?.lens?.status === 'installSkippedStale';
  }

  function promptOnlyCampaignState(currentState = {}, promptState = {}) {
    const current = initializeCampaignRuntimeTracking(currentState);
    const prompt = initializeCampaignRuntimeTracking(promptState);
    const next = cloneJson(current);
    if (prompt.campaignChatBinding && typeof prompt.campaignChatBinding === 'object') {
      next.campaignChatBinding = {
        ...(next.campaignChatBinding || {}),
        ...cloneJson(prompt.campaignChatBinding)
      };
    }
    if (prompt.runtimeResume && typeof prompt.runtimeResume === 'object') {
      next.runtimeResume = {
        ...(next.runtimeResume || {}),
        promptContextRevision: prompt.runtimeResume.promptContextRevision ?? next.runtimeResume?.promptContextRevision ?? null,
        externalPromptEnvironmentRef: cloneJson(prompt.runtimeResume.externalPromptEnvironmentRef || next.runtimeResume?.externalPromptEnvironmentRef || null)
      };
    }
    if (prompt.directiveRuntimeEvidence?.lensPromptRevisionRecord) {
      next.directiveRuntimeEvidence = {
        ...(next.directiveRuntimeEvidence || {}),
        lensPromptRevisionRecord: cloneJson(prompt.directiveRuntimeEvidence.lensPromptRevisionRecord)
      };
    }
    return next;
  }

  function commandBearingCompatibilityState(currentState = {}, projectedState = {}) {
    const current = initializeCampaignRuntimeTracking(currentState);
    const projected = initializeCampaignRuntimeTracking(projectedState);
    const next = cloneJson(current);
    for (const root of ['commandBearing', 'commandCulture']) {
      if (projected[root] && typeof projected[root] === 'object') {
        next[root] = cloneJson(projected[root]);
      }
    }
    const lastDelta = projected.runtimeTracking?.lastDelta
      ? {
        ...cloneJson(projected.runtimeTracking.lastDelta),
        domains: (projected.runtimeTracking.lastDelta.domains || [])
          .filter((domain) => ['commandBearing', 'commandCulture'].includes(domain))
      }
      : cloneJson(current.runtimeTracking?.lastDelta || null);
    next.runtimeTracking = {
      ...initializeCampaignRuntimeTracking(next).runtimeTracking,
      revision: Math.max(
        activeCoreRevisionState(current).runtime,
        activeCoreRevisionState(projected).runtime
      ),
      mechanicsRevision: Math.max(
        activeCoreRevisionState(current).mechanics,
        activeCoreRevisionState(projected).mechanics
      ),
      lastDelta,
      activeIngressId: projected.runtimeTracking?.activeIngressId || current.runtimeTracking?.activeIngressId || null,
      lastStableRevision: Math.max(
        Number(current.runtimeTracking?.lastStableRevision) || 0,
        Number(projected.runtimeTracking?.lastStableRevision) || 0
      )
    };
    return next;
  }

  function finalSettlementUnavailableError() {
    const error = new Error('Accepted sidecar batch has no durable FORGE/CORE settlement path.');
    error.code = 'DIRECTIVE_FORGE_FINAL_SETTLEMENT_FAILED';
    error.details = {
      phase: 'finalSettlement',
      status: 'missingBridge',
      effectiveStatus: 'missingBridge',
      reason: 'bridge-failed-before-old-mutation'
    };
    return error;
  }

  function batchDiagnostics(job, extra = {}) {
    return {
      continuityProjection: cloneJson(job.source?.continuityProjection || null),
      source: {
        ingressId: job.baseEventContext?.ingressId || job.source?.ingressId || job.sourceIngress?.id || null,
        sourceFrameId: job.sourceIngress?.sourceFrameId || job.source?.sourceFrameRef?.id || null,
        sourceFrameRef: cloneJson(job.sourceIngress?.sourceFrameRef || job.source?.sourceFrameRef || null),
        sourceToken: job.sourceIngress?.sourceToken || job.source?.sourceToken || null,
        coreTransactionId: job.sourceIngress?.coreTransactionId || null
      },
      sidecarGeneration: {
        concurrent: job.batchSize > 1,
        batchSize: job.batchSize,
        index: job.index,
        baseRevision: job.baseRevision,
        ...extra
      }
    };
  }

  function providerBatchContextForJobs(jobs = []) {
    const transactionIds = [...new Set(jobs.map((job) => job?.sourceIngress?.coreTransactionId).filter(Boolean))];
    const sourceTokens = [...new Set(jobs.map((job) => job?.sourceIngress?.sourceToken || job?.source?.sourceToken).filter(Boolean))];
    const sourceFrameRefs = [...new Map(jobs
      .map((job) => job?.sourceIngress?.sourceFrameRef || job?.source?.sourceFrameRef || null)
      .filter(Boolean)
      .map((ref) => [ref.id || JSON.stringify(ref), ref])).values()];
    const transactionId = transactionIds.length === 1 ? transactionIds[0] : null;
    const boundaryIds = [...new Set(jobs.flatMap((job) => [
      job?.source?.outcomeId,
      job?.baseEventContext?.outcomeId,
      job?.source?.ingressId,
      job?.baseEventContext?.ingressId,
      job?.source?.turnId,
      job?.baseEventContext?.turnId
    ]).filter(Boolean))];
    const boundaryId = boundaryIds.length === 1 ? boundaryIds[0] : 'no-source-boundary';
    const sourceIdentity = sourceTokens.length === 1
      ? sourceTokens[0]
      : sourceFrameRefs.length === 1
        ? sourceFrameRefs[0].id || hashStableJson(sourceFrameRefs[0]).slice(0, 16)
        : hashStableJson(jobs.map((job) => ({
          campaignId: job?.source?.campaignId || null,
          saveId: job?.source?.saveId || null,
          chatId: job?.source?.chatId || null,
          ingressId: job?.source?.ingressId || null,
          outcomeId: job?.source?.outcomeId || null,
          sourceFrameId: job?.source?.sourceFrameId || null
        }))).slice(0, 16);
    const requestHash = hashStableJson(jobs.map((job) => ({
      id: job?.id || null,
      workerKey: job?.workerKey || null,
      roleId: job?.roleId || null,
      requestHash: hashStableJson({
        systemPrompt: job?.request?.systemPrompt || '',
        prompt: job?.request?.prompt || '',
        maxTokens: job?.request?.maxTokens || null
      })
    }))).slice(0, 16);
    const workerKey = jobs.map((job) => job?.workerKey || job?.type || job?.id).filter(Boolean).join('|') || 'no-workers';
    const batchId = `campaign-sidecar-provider:${transactionId || 'no-core-transaction'}:${sourceIdentity}:${boundaryId}:${workerKey}`;
    return {
      transactionId,
      batchId,
      idempotencyKey: `${batchId}:${requestHash}`,
      sourceToken: sourceTokens.length === 1 ? sourceTokens[0] : null,
      sourceFrameRef: sourceFrameRefs.length === 1 ? cloneJson(sourceFrameRefs[0]) : null
    };
  }

  function providerBatchSourceFingerprint(job = {}) {
    const source = job.sourceIngress || {};
    return {
      workerKey: job.workerKey || null,
      roleId: job.roleId || null,
      ingressId: source.id || job.baseEventContext?.ingressId || job.source?.ingressId || null,
      hostMessageId: source.hostMessageId || null,
      textHash: source.textHash || null,
      status: source.status || null,
      outcomeId: source.outcomeId || job.baseEventContext?.outcomeId || job.source?.outcomeId || null,
      sourceFrameId: source.sourceFrameId || source.sourceFrameRef?.id || job.source?.sourceFrameRef?.id || null,
      sourceToken: source.sourceToken || job.source?.sourceToken || null,
      coreTransactionId: source.coreTransactionId || null
    };
  }

  function providerBatchSourceFingerprints(jobs = []) {
    return jobs.map(providerBatchSourceFingerprint);
  }

  function providerReplaySourceMismatchFailure(job = {}, cachedFingerprint = null) {
    if (!cachedFingerprint || typeof cachedFingerprint !== 'object') return null;
    const current = providerBatchSourceFingerprint(job);
    const reasons = [];
    for (const key of ['ingressId', 'hostMessageId', 'textHash', 'status', 'outcomeId', 'sourceFrameId', 'sourceToken', 'coreTransactionId']) {
      const cachedValue = cachedFingerprint[key] ?? null;
      const currentValue = current[key] ?? null;
      if (cachedValue !== currentValue) {
        reasons.push(`${key}-changed`);
      }
    }
    if (!reasons.length) return null;
    return {
      code: 'DIRECTIVE_SIDECAR_SOURCE_STALE',
      message: 'Cached sidecar result targets a player message whose source identity changed.',
      details: {
        ingressId: cachedFingerprint.ingressId || current.ingressId || null,
        reasons,
        source: cloneJson(cachedFingerprint),
        current: cloneJson(current)
      }
    };
  }

  function isProviderBatchCompletionCacheable(finalResults = []) {
    return Array.isArray(finalResults)
      && finalResults.length > 0
      && finalResults.every((result) => {
        if (result?.status !== 'applied') return false;
        if (result?.recoveryRequired) return false;
        if (result?.error) return false;
        if (Array.isArray(result?.postSettlementWarnings) && result.postSettlementWarnings.length > 0) return false;
        const forgeStatus = result?.forgeSettlement?.status || null;
        if (forgeStatus && !['settled', 'noChange'].includes(forgeStatus)) return false;
        return true;
      });
  }

  async function generateWorkers(jobs, providerBatchContext = null) {
    const context = providerBatchContext || providerBatchContextForJobs(jobs);
    let providerResult = null;
    const batch = typeof forgeCoordinator?.runProviderBatch === 'function'
      ? ((providerResult = await forgeCoordinator.runProviderBatch({
        jobs,
        concurrent: jobs.length > 1,
        transactionId: context.transactionId,
        idempotencyKey: context.idempotencyKey,
        sourceToken: context.sourceToken,
        sourceFrameRef: context.sourceFrameRef,
        upstreamOwner: 'campaignSidecarScheduler',
        now,
        appendDiagnostic: (transactionId, diagnostic) => queueCoreDiagnosticEvent({
          ...cloneJson(diagnostic || {}),
          coreTransactionId: transactionId
        }),
        runProviderBatch: () => runSidecarJobs({
          jobs,
          generationRouter,
          concurrent: jobs.length > 1,
          now
        })
      })).batch)
      : await runSidecarJobs({
        jobs,
        generationRouter,
        concurrent: jobs.length > 1,
        now
      });
    if (!batch || !Array.isArray(batch.results)) {
      const error = new Error(providerResult?.error?.message || 'FORGE provider batch did not return sidecar results.');
      error.code = providerResult?.error?.code || 'DIRECTIVE_FORGE_PROVIDER_BATCH_MISSING_RESULTS';
      error.providerBatchStatus = providerResult?.status || null;
      error.providerBatchOriginalStatus = providerResult?.originalStatus || null;
      throw error;
    }
    return batch.results.map((result) => {
      if (result.status !== 'complete') {
        const error = compactWorkerFailureError(result.error || {
          code: `DIRECTIVE_SIDECAR_${String(result.status || 'failed').toUpperCase()}`
        });
      return {
        ok: false,
        error,
        diagnostics: compactProviderDiagnostics(result.diagnostics || null)
      };
      }
      return {
        ok: true,
        response: {
          text: typeof result.packet === 'string' ? result.packet : JSON.stringify(result.packet ?? null)
        },
        diagnostics: compactProviderDiagnostics(result.diagnostics || null)
      };
    });
  }

  function workerResponseText(response = {}) {
    return response.response?.text ?? response.response?.content ?? response.response ?? '';
  }

  function parsePositionNearEnd(message = '', text = '') {
    const match = String(message || '').match(/\bposition\s+(\d+)/i);
    if (!match) return false;
    const position = Number(match[1]);
    return Number.isFinite(position) && position >= Math.max(0, String(text || '').length - 8);
  }

  function shouldAttemptTruncatedJsonRepair(text = '', parsed = {}) {
    const source = String(text || '').trim();
    if (!source.includes('{')) return false;
    if (source.length < 80) return false;
    if (!source.endsWith('}')) return true;
    const message = parsed.error?.message || parsed.diagnostics?.parse?.diagnostic?.message || '';
    return /\b(unexpected end|unterminated|after property value)\b/i.test(message) && parsePositionNearEnd(message, source);
  }

  function sanitizedParseDiagnostic(parsed = {}) {
    const diagnostic = parsed.diagnostics?.parse?.diagnostic || parsed.error?.details || {};
    return {
      ok: parsed.ok === true,
      code: parsed.error?.code || diagnostic.code || null,
      message: compactDiagnosticText(parsed.error?.message || diagnostic.message || null, 500),
      visibleContentLength: Number.isFinite(Number(diagnostic.visibleContentLength)) ? Number(diagnostic.visibleContentLength) : null
    };
  }

  function repairGenerationDiagnostic(generation = {}) {
    return {
      ok: generation.ok === true,
      errorCode: generation.error?.code || null,
      latencyMs: Number.isFinite(Number(generation.diagnostics?.latencyMs)) ? Number(generation.diagnostics.latencyMs) : null,
      providerId: generation.diagnostics?.providerId || null,
      providerKind: generation.diagnostics?.providerKind || null,
      model: generation.diagnostics?.model || null
    };
  }

  function proposalRepairPrompt(job, originalText, parsed) {
    const workerKey = job.workerKey;
    const worker = job.worker || WORKERS[workerKey] || {};
    return [
      `Repair Directive's ${workerKey} sidecar output into one valid JSON object only.`,
      'The prior output appears truncated or malformed. Do not continue the truncated text.',
      'Rebuild a compact proposal from the supplied context and the salvageable intent in the malformed output.',
      'If the durable state change is uncertain, return an empty operations array.',
      `Required workerId: "${workerKey}". Required baseRevision: ${job.baseRevision}.`,
      `Authorized top-level roots: ${(worker.allowedRoots || []).join(', ')}.`,
      ...workerOperationRules(workerKey),
      `Hard limits: at most ${SIDECAR_PROPOSAL_MAX_OPERATIONS} operations; each string value under 180 characters; summary under 180 characters.`,
      'Return exactly one JSON object shaped as {"id":"...","workerId":"...","baseRevision":0,"operations":[],"summary":"..."}.',
      '',
      `Initial parse failure: ${compactDiagnosticText(parsed.error?.message || 'Invalid JSON.', 500)}`,
      `Malformed output excerpt:\n${compactDiagnosticText(originalText, 5000)}`,
      '',
      `Context:\n${JSON.stringify(sidecarContext(job.snapshot?.campaignState || {}, job.snapshot?.turnContext || {}, workerKey), null, 2)}`
    ].join('\n');
  }

  async function attemptTruncatedJsonRepair(job, originalText, initialParsed) {
    const generation = await generationRouter.generate(job.roleId || job.worker?.roleId, {
      systemPrompt: 'Repair a Directive sidecar state-delta proposal. Return strict JSON only. No markdown, prose, or reasoning.',
      prompt: proposalRepairPrompt(job, originalText, initialParsed),
      maxTokens: SIDECAR_REPAIR_MAX_TOKENS,
      metadata: {
        sidecarRepair: true,
        workerKey: job.workerKey,
        baseRevision: job.baseRevision
      }
    }, {
      timeoutMs: Math.min(Number(job.policy?.timeoutMs || 45000) || 45000, 45000)
    });
    const diagnostics = {
      attempted: true,
      reason: 'likely-truncated-json',
      initial: sanitizedParseDiagnostic(initialParsed),
      generation: repairGenerationDiagnostic(generation)
    };
    if (!generation.ok) {
      return {
        ok: false,
        parsed: initialParsed,
        diagnostics: {
          ...diagnostics,
          status: 'failed',
          errorCode: generation.error?.code || 'DIRECTIVE_SIDECAR_REPAIR_FAILED'
        }
      };
    }
    const repairText = generation.response?.text ?? generation.response?.content ?? generation.response;
    const repaired = parseStateDeltaProposalOutput(repairText, {
      workerKey: job.workerKey,
      allowedRoots: job.worker?.allowedRoots || [],
      baseRevision: job.baseRevision,
      forbiddenPathPolicy: dropForbiddenSidecarOperations ? 'drop' : 'reject'
    });
    if (!repaired.ok) {
      return {
        ok: false,
        parsed: initialParsed,
        diagnostics: {
          ...diagnostics,
          status: 'rejected',
          repairedParse: sanitizedParseDiagnostic(repaired)
        }
      };
    }
    return {
      ok: true,
      parsed: {
        ...repaired,
        diagnostics: {
          ...cloneJson(repaired.diagnostics || {}),
          repair: {
            ...diagnostics,
            status: 'accepted',
            repairedParse: sanitizedParseDiagnostic(repaired)
          }
        }
      },
      diagnostics: {
        ...diagnostics,
        status: 'accepted',
        repairedParse: sanitizedParseDiagnostic(repaired)
      }
    };
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
      commandBearing: currentState.commandBearing,
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
      domains: ['commandBearing'],
      outcomeId: proposalEventContext.outcomeId || null,
      reconciliationRunId: proposalEventContext.reconciliationRunId || null,
      metadata: {
        sourceOutcomeIds,
        reviewClosureIds: review.records.map((record) => record.closureId),
        sidecarWorkerId: 'commandBearing',
        parsedDiagnostics: cloneJson(parsedDiagnostics || null)
      }
    }, { persist: false });
    return {
      attempted: true,
      status: 'appliedReviews',
      sourceOutcomeIds,
      reviewPlan,
      review,
      campaignState: committed
    };
  }

  async function settleCommandBearingReviewMutation({
    transactionId,
    turnContext = {},
    review = {},
    workerResult = null
  } = {}) {
    if (!review?.campaignState) return null;
    if (!transactionId || typeof commitCoreBackgroundBatch !== 'function') {
      const error = new Error('Command Bearing closure review mutation has no durable CORE settlement path.');
      error.code = 'DIRECTIVE_COMMAND_BEARING_REVIEW_SETTLEMENT_FAILED';
      throw error;
    }
    const sourceId = turnContext.outcomeId || turnContext.ingressId || workerResult?.baseRevision || 'unknown';
    const reviewIds = Array.isArray(review.review?.records)
      ? review.review.records.map((record) => record?.closureId).filter(Boolean)
      : [];
    const batchId = `command-bearing-review:${transactionId}:${sourceId}`;
    const idempotencyKey = `${batchId}:settle`;
    const reviewHash = hashStableJson(commandBearingReviewHashInput(review)).slice(0, 16);
    const background = await commitCoreBackgroundBatch(transactionId, {
      idempotencyKey,
      batchId,
      phaseAfter: 'commandBearingReview',
      outcomeId: turnContext.outcomeId || null,
      sourceFrameRef: cloneJson(workerResult?.job?.sourceIngress?.sourceFrameRef || null),
      sourceToken: sourceTokenForJob(workerResult?.job),
      operations: [],
      promptDirtyDomains: normalizePromptDirtyDomains(['commandBearing']),
      backgroundEffectRefs: reviewIds.map((id) => ({
        kind: 'directive.commandBearingReviewClosure.v1',
        id,
        reviewHash
      })),
      workers: ['commandBearing'],
      forgeBatchRef: {
        kind: 'directive.commandBearingReviewCommitRef.v1',
        batchId,
        reviewCount: reviewIds.length,
        stateRevision: activeRuntimeRevision(review.campaignState || {}),
        reviewHash
      }
    });
    if (
      !backgroundMatchesTransaction(background, transactionId)
      || !backgroundMatchesBatch(background, { expectedBatchId: batchId, expectedIdempotencyKey: idempotencyKey })
      || !backgroundMatchesReviewHash(background, reviewHash)
    ) {
      const error = new Error('Command Bearing closure review CORE settlement receipt was not durable.');
      error.code = 'DIRECTIVE_COMMAND_BEARING_REVIEW_SETTLEMENT_FAILED';
      throw error;
    }
    return {
      background,
      reviewHash,
      batchId,
      idempotencyKey
    };
  }

  function coreCommandBearingReviewProjectionForPrompt({
    settlement = {},
    review = {},
    workerResult = null,
    transactionId = null
  } = {}) {
    const backgroundBatch = Array.isArray(settlement.background?.backgroundBatches)
      ? settlement.background.backgroundBatches.find((entry) => entry?.batchId === settlement.batchId) || null
      : null;
    const sourceFrameRef = workerResult?.job?.sourceIngress?.sourceFrameRef || null;
    const records = Array.isArray(review.review?.records) ? review.review.records : [];
    return {
      kind: 'directive.coreCommandBearingReviewProjection.v1',
      schemaVersion: 1,
      transactionId: transactionId || null,
      batchId: settlement.batchId || backgroundBatch?.batchId || null,
      idempotencyKey: settlement.idempotencyKey || backgroundBatch?.idempotencyKey || null,
      reviewHash: settlement.reviewHash || backgroundBatch?.reviewHash || backgroundBatch?.forgeBatchRef?.reviewHash || null,
      sourceFrameRef: sourceFrameRef ? cloneJson(sourceFrameRef) : null,
      sourceToken: sourceTokenForJob(workerResult?.job) || null,
      forgeBatchRef: backgroundBatch?.forgeBatchRef ? cloneJson(backgroundBatch.forgeBatchRef) : null,
      closures: records.map((record) => ({
        kind: 'directive.commandBearingReviewClosure.v1',
        closureId: record?.closureId || null,
        awardedTrack: record?.awardedTrack || null,
        markAwarded: record?.markAwarded === true,
        reviewHash: settlement.reviewHash || backgroundBatch?.reviewHash || null
      })).filter((record) => record.closureId)
    };
  }

  async function handleWorkerResponse(job, response, turnContext, batchState) {
    const { workerKey, worker, baseRevision, baseEventContext } = job;
    const freshestBatchState = () => {
      const local = initializeCampaignRuntimeTracking(batchState.currentState || getCampaignState());
      const external = initializeCampaignRuntimeTracking(getCampaignState());
      return activeRuntimeRevision(external) >= activeRuntimeRevision(local)
        ? external
        : local;
    };
    if (!response.ok) {
      const error = compactWorkerFailureError(response.error);
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
          provider: compactProviderDiagnostics(response.diagnostics || null),
          sourceAnchorRange: cloneJson(baseEventContext.sourceAnchorRange)
        }
      }, `${workerKey} sidecar failed without mutating campaign state.`);
      batchState.currentState = cloneJson(journaled);
      const result = { workerKey, status: 'failed', error };
      queueCoreDiagnostic(job, 'failed', { result, error });
      return result;
    }
    const originalResponseText = workerResponseText(response);
    let parsed = parseStateDeltaProposalOutput(
      originalResponseText,
      {
        workerKey,
        allowedRoots: worker.allowedRoots,
        baseRevision,
        forbiddenPathPolicy: dropForbiddenSidecarOperations ? 'drop' : 'reject'
      }
    );
    if (!parsed.ok && shouldAttemptTruncatedJsonRepair(originalResponseText, parsed)) {
      const repair = await attemptTruncatedJsonRepair(job, originalResponseText, parsed);
      if (repair.ok) {
        parsed = repair.parsed;
      } else {
        parsed = {
          ...parsed,
          diagnostics: {
            ...cloneJson(parsed.diagnostics || {}),
            repair: cloneJson(repair.diagnostics || null)
          }
        };
      }
    }
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
      const result = { workerKey, status: 'rejected', error };
      queueCoreDiagnostic(job, diagnosticStatusForWorkerResult(result.status, error), {
        result,
        error,
        parsedDiagnostics: parsed.diagnostics || null
      });
      return result;
    }
    let proposal = parsed.value;
    let missionComponentProvenance = {
      knownComponentCount: 0,
      matchedSourceComponentIds: [],
      proposalComponentIds: [],
      derivedFromComponentIds: [],
      stampedOperationCount: 0
    };

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
      const result = { workerKey, status: 'rejected', error: staleSource };
      queueCoreDiagnostic(job, 'stale', { result, error: staleSource });
      return result;
    }

    const sourced = applyMissionComponentProvenance(proposal, freshestBatchState(), turnContext);
    proposal = sourced.proposal;
    missionComponentProvenance = sourced.diagnostics;

    if (proposal.operations.length === 0) {
      const droppedCount = Number(parsed.diagnostics?.schema?.droppedForbiddenOperationCount || 0);
      const result = {
        workerKey,
        status: 'noChange',
        proposal: cloneJson(proposal),
        diagnostics: {
          droppedForbiddenOperationCount: droppedCount,
          skipped: true
        }
      };
      queueCoreDiagnostic(job, 'noChange', { result });
      return result;
    }

    const currentState = freshestBatchState();
    const currentRevision = activeRuntimeRevision(currentState);
    if (currentRevision !== batchState.expectedRevision) {
      if (currentRevision > batchState.expectedRevision) {
        batchState.expectedRevision = currentRevision;
        batchState.currentState = cloneJson(currentState);
      } else {
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
              status: 'rejected',
              missionComponents: cloneJson(missionComponentProvenance)
            },
            apply: {
              ok: false,
              error: failure
            }
          }
        }, `${workerKey} sidecar proposal was rejected by the state gateway.`);
        batchState.currentState = cloneJson(journaled);
        const result = { workerKey, status: 'rejected', error: failure };
        queueCoreDiagnostic(job, 'rejected', { result, error: failure });
        return result;
      }
    }

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
          rebased: currentRevision !== baseRevision,
          aggregateBatch: true
        }
      }
    };
    batchState.appliedPaths.push(...proposal.operations.map((operation) => ({
      workerKey,
      path: operation.path
    })));
    return {
      workerKey,
      status: 'pendingApply',
      proposal: cloneJson(proposal),
      applyProposal: cloneJson(applyProposal),
      allowedRoots: cloneJson(worker.allowedRoots),
      roleId: worker.roleId,
      baseRevision,
      currentRevision,
      proposalEventContext: cloneJson(proposalEventContext),
      parsedDiagnostics: cloneJson(parsed.diagnostics || {}),
      missionComponentProvenance: cloneJson(missionComponentProvenance),
      job
    };
  }

  async function applyAcceptedWorkerBatch(pendingResults = [], turnContext = {}, batchState = {}, providerBatchContext = null) {
    const accepted = pendingResults.filter((result) => result.status === 'pendingApply');
    if (!accepted.length) return pendingResults;
    const operations = accepted.flatMap((result) => result.applyProposal?.operations || []);
    const allowedRoots = [...new Set(accepted.flatMap((result) => result.allowedRoots || []))];
    const workerKeys = accepted.map((result) => result.workerKey);
    const promptWorkerKey = workerKeys.length === 1 ? workerKeys[0] : 'campaignSidecarBatch';
    const promptDirtyDomains = promptDirtyDomainsForAcceptedSidecars(accepted, allowedRoots);
    const promptSyncBaseId = providerBatchContext?.idempotencyKey
      || providerBatchContext?.batchId
      || `campaign-sidecar:${turnContext.outcomeId || turnContext.ingressId || batchState.baseRevision || 'unknown'}`;
    const promptAcceptedBatchHash = hashStableJson(accepted.map(forgeWorkerResultForAcceptedSidecar));
    const promptSyncIdempotencyKey = `${promptSyncBaseId}:prompt-sync:accepted:${promptAcceptedBatchHash}`;
    const baseRevision = batchState.expectedRevision ?? batchState.baseRevision;
    const conflictPaths = [];
    const seenPaths = [];
    for (const result of accepted) {
      const conflict = firstOperationPathConflict(result.proposal?.operations || [], seenPaths);
      if (conflict) conflictPaths.push({ workerKey: result.workerKey, ...conflict });
      for (const operation of result.proposal?.operations || []) {
        seenPaths.push({ workerKey: result.workerKey, path: operation.path });
      }
    }
    if (conflictPaths.length) {
      const failure = {
        code: 'DIRECTIVE_SIDECAR_BATCH_PATH_CONFLICT',
        message: 'Sidecar batch path conflict detected before state mutation.',
        details: { conflicts: cloneJson(conflictPaths) }
      };
      const journalEvents = accepted.map((result) => ({
        id: result.proposal?.id || `sidecar:${result.workerKey}:${result.baseRevision}:conflict`,
        workerId: result.workerKey,
        roleId: result.roleId,
        status: 'rejected',
        baseRevision: result.baseRevision,
        summary: result.proposal?.summary || null,
        ...result.proposalEventContext,
        error: failure,
        diagnostics: {
          ...cloneJson(result.parsedDiagnostics || {}),
          ...batchDiagnostics(result.job, {
            applyBaseRevision: baseRevision,
            aggregateBatch: true,
            conflict: cloneJson(conflictPaths)
          }),
          feature: {
            ok: false,
            status: 'rejected',
            missionComponents: cloneJson(result.missionComponentProvenance)
          },
          apply: {
            ok: false,
            error: failure
          }
        }
      }));
      const journaled = await journalBatch(journalEvents, 'Rejected conflicting campaign sidecar batch results.');
      batchState.currentState = cloneJson(journaled);
      return pendingResults.map((result) => {
        if (result.status !== 'pendingApply') return result;
        const final = { workerKey: result.workerKey, status: 'rejected', error: failure };
        queueCoreDiagnostic(result.job, 'rejected', { result: final, error: failure });
        return final;
      });
    }
    const combinedProposal = {
      id: `campaign-sidecar-batch:${baseRevision}:${Date.now()}`,
      workerId: 'campaignSidecarBatch',
      source: 'campaignSidecarScheduler',
      baseRevision,
      ingressId: turnContext.ingressId || null,
      turnId: turnContext.turnId || null,
      outcomeId: turnContext.outcomeId || null,
      sourceAnchorRange: cloneJson(turnContext.sourceAnchorRange || turnContext.anchorRange || null),
      anchorRangeHash: turnContext.sourceAnchorRange?.rangeHash || turnContext.anchorRange?.rangeHash || null,
      reconciliationRunId: turnContext.reconciliationRunId || null,
      operations,
      allowedRoots,
      metadata: {
        sidecarGeneration: {
          aggregateBatch: true,
          batchSize: accepted.length,
          workerKeys,
          baseRevision,
          applyBaseRevision: baseRevision
        },
        workerProposalIds: accepted.map((result) => result.applyProposal?.id || result.proposal?.id || null).filter(Boolean),
        sourceAnchorRange: cloneJson(turnContext.sourceAnchorRange || turnContext.anchorRange || null),
        reconciliationRunId: turnContext.reconciliationRunId || null
      },
      summary: `Applied ${accepted.length} campaign sidecar proposal(s) as one batch.`
    };
    let applied;
    let synchronized = null;
    let forgeSettlement = null;
    let commandBearingReviews = new Map();
    const beforeApplyState = cloneJson(batchState.currentState || getCampaignState());
    const postSettlementWarnings = [];
    let compatibilityProjection = null;
    const commandBearingAccepted = workerKeys.includes('commandBearing');
    let commandBearingReviewInputState = null;
    try {
      const acceptedSettlement = acceptedBatchSettlementForForge({ accepted, allowedRoots, turnContext, baseRevision });
      if (!acceptedSettlement || typeof forgeCoordinator?.settleAcceptedBatch !== 'function') {
        throw finalSettlementUnavailableError();
      }
      setCampaignState(beforeApplyState);
      const forgePreflight = await prepareAcceptedWorkerBatchWithForge({
        settlement: acceptedSettlement,
        accepted,
        allowedRoots,
        turnContext,
        baseRevision
      });
      if (isForgeAcceptedReplay(forgePreflight)) {
        return appliedReplayResults(pendingResults, accepted, forgePreflight, {
          postSettlementWarnings: forgeOwnsAcceptedPromptFlush()
            ? [acceptedPromptFlushUnavailableWarning()]
            : []
        });
      }
      compatibilityProjection = await stateDeltaGateway.validateOperations(combinedProposal, { allowedRoots });
      forgeSettlement = await settleAcceptedWorkerBatchWithForge({
        settlement: acceptedSettlement,
        accepted,
        allowedRoots,
        turnContext,
        baseRevision
      });
      if (!forgeSettlement && operations.length > 0) throw finalSettlementUnavailableError();
      if (commandBearingAccepted) {
        commandBearingReviewInputState = commandBearingCompatibilityState(beforeApplyState, compatibilityProjection.campaignState);
      }
      applied = {
        revision: activeRuntimeRevision(beforeApplyState) || batchState.baseRevision || 0,
        domains: compatibilityProjection.domains || [],
        campaignState: cloneJson(beforeApplyState),
        compatibilityProjection: {
          revision: compatibilityProjection.revision,
          domains: cloneJson(compatibilityProjection.domains || [])
        }
      };
      batchState.expectedRevision = applied.revision;
      batchState.currentState = cloneJson(beforeApplyState);
    } catch (error) {
      const compensation = {
        attempted: false,
        restored: false,
        reason: 'bridge-failed-before-old-mutation'
      };
      const failure = {
        code: compactSafeCode(error?.code || 'DIRECTIVE_SIDECAR_BATCH_REJECTED'),
        message: genericBridgeFailureMessage(compactSafeCode(error?.code || 'DIRECTIVE_SIDECAR_BATCH_REJECTED')),
        details: compactBridgeFailureDetails(error, compensation)
      };
      batchState.currentState = cloneJson(initializeCampaignRuntimeTracking(getCampaignState()));
      return pendingResults.map((result) => {
        if (result.status !== 'pendingApply') return result;
        const final = { workerKey: result.workerKey, status: 'rejected', error: failure };
        queueCoreDiagnostic(result.job, 'rejected', { result: final, error: failure });
        return final;
      });
    }

    let forgePromptFlushAttempted = false;
    const promptSettlement = acceptedBatchSettlementForForge({ accepted, allowedRoots, turnContext, baseRevision });
    const forgeOwnsPromptFlush = forgeOwnsAcceptedPromptFlush();
    if (typeof forgeCoordinator?.flushAcceptedBatchPrompt === 'function' && promptSettlement) {
      try {
        forgePromptFlushAttempted = true;
        const effectiveForgeSettlement = forgeEffectiveResult(forgeSettlement) || {};
        const acceptedPromptInputState = cloneJson(applied.campaignState);
        const acceptedPromptFreshnessState = cloneJson(applied.campaignState);
        const coreAcceptedBatchProjection = coreAcceptedBatchProjectionForPrompt({
          settlement: promptSettlement,
          forgeSettlement,
          workerKeys,
          promptDirtyDomains
        });
        const forgePromptFlush = await forgeCoordinator.flushAcceptedBatchPrompt({
          transactionId: promptSettlement.transactionId,
          campaignState: cloneJson(acceptedPromptInputState),
          coreAcceptedBatchProjection,
          promptDirtyDomains,
          promptSyncIdempotencyKey,
          idempotencyKey: promptSyncIdempotencyKey,
          workerKey: promptWorkerKey,
          workerKeys,
          aggregateBatch: true,
          binding: cloneJson(acceptedPromptInputState?.campaignChatBinding || {}),
          campaignContext: campaignContextForForgePromptFlush(acceptedPromptInputState),
          sourceFrameRef: cloneJson(promptSettlement.sourceFrameRef || null),
          sourceToken: promptSettlement.sourceToken || null,
          cacheInputs: cloneJson(effectiveForgeSettlement.batch?.recallRevisions || {}),
          commitRuntimeState: false,
          beforeInstallPrompt: promptInstallFreshnessGuard(acceptedPromptFreshnessState),
          promptFrame: {
            workerKey: promptWorkerKey,
            workerKeys,
            promptDirtyDomains,
            aggregateBatch: true
          },
          activityReporter: accepted[0]?.job?.activityReporter || null,
          activitySource: 'sidecarPromptSync',
          activityMode: 'background',
          activityContext: {
            workerKey: promptWorkerKey,
            workerKeys,
            classification: turnContext.classification || null,
            ingressId: turnContext.ingressId || null,
            turnId: turnContext.turnId || null,
            outcomeId: turnContext.outcomeId || null,
            transactionId: promptSettlement.transactionId,
            coreTransactionId: promptSettlement.transactionId,
            aggregateBatch: true,
            promptDirtyDomains,
            promptSyncIdempotencyKey,
            source: 'campaignSidecarScheduler'
          }
        });
        if (promptInstallSkippedByFreshnessGuard(forgePromptFlush)) {
          const currentPromptState = initializeCampaignRuntimeTracking(getCampaignState());
          applied.campaignState = cloneJson(currentPromptState);
          applied.revision = activeRuntimeRevision(currentPromptState) || applied.revision;
          batchState.currentState = cloneJson(currentPromptState);
          batchState.expectedRevision = applied.revision;
          postSettlementWarnings.push(compactPostSettlementWarning('lens', {
            code: 'DIRECTIVE_SIDECAR_POST_SETTLEMENT_STATE_STALE'
          }));
        } else if (!forgePromptFlush) {
          postSettlementWarnings.push(acceptedPromptFlushUnavailableWarning());
        } else if (forgePromptFlush?.campaignState) {
          synchronized = promptOnlyCampaignState(getCampaignState(), forgePromptFlush.campaignState);
          applied.campaignState = synchronized;
          setCampaignState(synchronized);
          batchState.currentState = cloneJson(synchronized);
          await persistCampaignState(synchronized, 'Campaign sidecar batch prompt context synchronized.');
        }
      } catch (error) {
        forgePromptFlushAttempted = true;
        postSettlementWarnings.push(compactPostSettlementWarning('lens', {
          code: error?.code || 'DIRECTIVE_SIDECAR_POST_SETTLEMENT_LENS_FLUSH_FAILED'
        }));
      }
    } else if (forgeOwnsPromptFlush) {
      forgePromptFlushAttempted = true;
      postSettlementWarnings.push(acceptedPromptFlushUnavailableWarning());
    }

    if (
      !forgePromptFlushAttempted
      && typeof syncPromptContext === 'function'
      && !forgeOwnsPromptFlush
    ) {
      try {
        synchronized = await syncPromptContext(applied.campaignState, {
          workerKey: promptWorkerKey,
          workerKeys,
          promptDirtyDomains,
          aggregateBatch: true,
          proposals: accepted.map((result) => cloneJson(result.applyProposal))
        }, {
          activityReporter: accepted[0]?.job?.activityReporter || null,
          activitySource: 'sidecarPromptSync',
          activityMode: 'background',
          activityContext: {
            workerKey: promptWorkerKey,
            workerKeys,
            classification: turnContext.classification || null,
            ingressId: turnContext.ingressId || null,
            turnId: turnContext.turnId || null,
            outcomeId: turnContext.outcomeId || null,
            aggregateBatch: true,
            promptDirtyDomains,
            promptSyncIdempotencyKey,
            source: 'campaignSidecarScheduler'
          }
        });
        if (synchronized) {
          applied.campaignState = synchronized;
          setCampaignState(synchronized);
          batchState.currentState = cloneJson(synchronized);
          await persistCampaignState(synchronized, 'Campaign sidecar batch prompt context synchronized.');
        }
      } catch (error) {
        postSettlementWarnings.push(compactPostSettlementWarning('promptSync', {
          code: error?.code || 'DIRECTIVE_SIDECAR_POST_SETTLEMENT_PROMPT_SYNC_FAILED'
        }));
      }
    }
    const commandBearingResult = accepted.find((result) => result.workerKey === 'commandBearing');
    if (commandBearingResult) {
      const beforeCommandBearingReviewState = cloneJson(batchState.currentState);
      const commandBearingReviewCurrentState = commandBearingReviewInputState
        ? promptOnlyCampaignState(commandBearingReviewInputState, batchState.currentState)
        : batchState.currentState;
      let commandBearingReviewMutated = false;
      try {
        let commandBearingReview = await runCommandBearingEvidenceClosureReview({
          beforeState: beforeApplyState,
          currentState: commandBearingReviewCurrentState,
          proposal: commandBearingResult.proposal,
          proposalEventContext: commandBearingResult.proposalEventContext,
          parsedDiagnostics: commandBearingResult.parsedDiagnostics
        });
        if (commandBearingReview.campaignState) {
          commandBearingReviewMutated = true;
          applied.campaignState = commandBearingReview.campaignState;
          applied.revision = activeRuntimeRevision(commandBearingReview.campaignState) || applied.revision;
          setCampaignState(commandBearingReview.campaignState);
          batchState.currentState = cloneJson(commandBearingReview.campaignState);
          batchState.expectedRevision = applied.revision;
          const commandBearingReviewSettlement = await settleCommandBearingReviewMutation({
            transactionId: commandBearingResult.job?.sourceIngress?.coreTransactionId || null,
            turnContext,
            review: commandBearingReview,
            workerResult: commandBearingResult
          });
          const commandBearingReviewHash = commandBearingReviewSettlement?.reviewHash || null;
          const commandBearingReviewPromptSyncIdempotencyKey = `${promptSyncBaseId}:prompt-sync:command-bearing-review:${commandBearingReviewHash || 'unknown-review'}`;
          const commandBearingReviewPromptDirtyDomains = ['commandBearing'];
          const commandBearingReviewSourceToken = sourceTokenForJob(commandBearingResult.job);
          const commandBearingReviewPersistentBaseState = cloneJson(beforeCommandBearingReviewState);
          const coreCommandBearingReviewProjection = coreCommandBearingReviewProjectionForPrompt({
            settlement: commandBearingReviewSettlement,
            review: commandBearingReview,
            workerResult: commandBearingResult,
            transactionId: commandBearingResult.job?.sourceIngress?.coreTransactionId || null
          });
          const commandBearingReviewPersistentBaseTracking = cloneJson(
            initializeCampaignRuntimeTracking(commandBearingReviewPersistentBaseState).runtimeTracking
          );
          const commandBearingReviewTransientTracking = cloneJson(
            initializeCampaignRuntimeTracking(commandBearingReview.campaignState).runtimeTracking
          );
          const restoreCommandBearingReviewTracking = (tracking = {}) => {
            const currentTracking = cloneJson(tracking || {});
            const baseTracking = commandBearingReviewPersistentBaseTracking;
            const reviewTracking = commandBearingReviewTransientTracking;
            const reviewLastDeltaHash = reviewTracking.lastDelta ? hashStableJson(reviewTracking.lastDelta) : null;
            const currentLastDeltaMatchesReview = Boolean(
              reviewLastDeltaHash
              && currentTracking.lastDelta
              && hashStableJson(currentTracking.lastDelta) === reviewLastDeltaHash
            );
            const hasIndependentTrackingAdvance = Boolean(
              currentTracking.lastDelta
              && !currentLastDeltaMatchesReview
              && (Number(currentTracking.revision) || 0) > (Number(reviewTracking.revision) || 0)
            );
            if (hasIndependentTrackingAdvance) {
              return {
                ...currentTracking,
                history: [],
                historyIndex: -1
              };
            }
            return {
              ...currentTracking,
              revision: Number(baseTracking.revision) || 0,
              mechanicsRevision: Number(baseTracking.mechanicsRevision) || 0,
              history: [],
              historyIndex: -1,
              lastDelta: cloneJson(baseTracking.lastDelta || null),
              activeIngressId: baseTracking.activeIngressId || null,
              lastStableRevision: Number(baseTracking.lastStableRevision) || 0
            };
          };
          const commandBearingReviewCompatibilityState = (state = getCampaignState()) => {
            const restored = cloneJson(initializeCampaignRuntimeTracking(state));
            if (commandBearingReviewPersistentBaseState.commandBearing !== undefined) {
              restored.commandBearing = cloneJson(commandBearingReviewPersistentBaseState.commandBearing);
            } else {
              delete restored.commandBearing;
            }
            if (commandBearingReviewPersistentBaseState.commandCulture !== undefined) {
              restored.commandCulture = cloneJson(commandBearingReviewPersistentBaseState.commandCulture);
            } else {
              delete restored.commandCulture;
            }
            restored.runtimeTracking = restoreCommandBearingReviewTracking(restored.runtimeTracking);
            return restored;
          };
          const restoreCommandBearingReviewCompatibilityState = () => {
            const restored = commandBearingReviewCompatibilityState(getCampaignState());
            applied.campaignState = restored;
            applied.revision = activeRuntimeRevision(restored) || applied.revision;
            setCampaignState(restored);
            batchState.currentState = cloneJson(restored);
            batchState.expectedRevision = applied.revision;
          };
          const commandBearingReviewPromptFrame = {
            workerKey: 'commandBearing',
            promptDirtyDomains: commandBearingReviewPromptDirtyDomains,
            commandBearingReview: true,
            sourceFrameRef: cloneJson(commandBearingResult.job?.sourceIngress?.sourceFrameRef || null),
            sourceToken: commandBearingReviewSourceToken
          };
          if (typeof forgeCoordinator?.flushCommandBearingReviewPrompt === 'function') {
            try {
              const commandBearingReviewPromptInputState = cloneJson(commandBearingReview.campaignState);
              const forgeReviewPromptFlush = await forgeCoordinator.flushCommandBearingReviewPrompt({
                transactionId: commandBearingResult.job?.sourceIngress?.coreTransactionId || null,
                campaignState: cloneJson(commandBearingReviewPromptInputState),
                promptDirtyDomains: commandBearingReviewPromptDirtyDomains,
                promptSyncIdempotencyKey: commandBearingReviewPromptSyncIdempotencyKey,
                idempotencyKey: commandBearingReviewPromptSyncIdempotencyKey,
                workerKey: 'commandBearing',
                commandBearingReview: true,
                binding: cloneJson(commandBearingReview.campaignState?.campaignChatBinding || {}),
                campaignContext: campaignContextForForgePromptFlush(commandBearingReview.campaignState),
                sourceFrameRef: cloneJson(commandBearingResult.job?.sourceIngress?.sourceFrameRef || null),
                sourceFrame: cloneJson(commandBearingResult.job?.sourceIngress?.sourceFrameRef || null),
                sourceToken: commandBearingReviewSourceToken,
                coreCommandBearingReviewProjection,
                cacheInputs: {},
                commitRuntimeState: false,
                beforeInstallPrompt: promptInstallFreshnessGuard(commandBearingReviewPromptInputState),
                promptFrame: commandBearingReviewPromptFrame,
                activityReporter: commandBearingResult.job?.activityReporter || null,
                activitySource: 'sidecarPromptSync',
                activityMode: 'background',
                activityContext: {
                  workerKey: 'commandBearing',
                  classification: turnContext.classification || null,
                  ingressId: turnContext.ingressId || null,
                  turnId: turnContext.turnId || null,
                  outcomeId: turnContext.outcomeId || null,
                  transactionId: commandBearingResult.job?.sourceIngress?.coreTransactionId || null,
                  coreTransactionId: commandBearingResult.job?.sourceIngress?.coreTransactionId || null,
                  commandBearingReview: true,
                  promptDirtyDomains: commandBearingReviewPromptDirtyDomains,
                  promptSyncIdempotencyKey: commandBearingReviewPromptSyncIdempotencyKey,
                  source: 'campaignSidecarScheduler'
                }
              });
              if (promptInstallSkippedByFreshnessGuard(forgeReviewPromptFlush)) {
                restoreCommandBearingReviewCompatibilityState();
                postSettlementWarnings.push(compactPostSettlementWarning('lens', {
                  code: 'DIRECTIVE_SIDECAR_POST_SETTLEMENT_STATE_STALE'
                }));
              } else if (!forgeReviewPromptFlush?.campaignState) {
                restoreCommandBearingReviewCompatibilityState();
                postSettlementWarnings.push(compactPostSettlementWarning('lens', {
                  code: 'DIRECTIVE_SIDECAR_POST_SETTLEMENT_LENS_FLUSH_NO_STATE'
                }));
              } else if (forgeReviewPromptFlush?.campaignState) {
                const currentPromptState = initializeCampaignRuntimeTracking(getCampaignState());
                if (promptFlushInputStillCurrent(commandBearingReviewPromptInputState, currentPromptState)) {
                  const synchronizedReview = promptOnlyCampaignState(commandBearingReviewPersistentBaseState, forgeReviewPromptFlush.campaignState);
                  applied.campaignState = synchronizedReview;
                  applied.revision = activeRuntimeRevision(synchronizedReview) || applied.revision;
                  setCampaignState(synchronizedReview);
                  batchState.currentState = cloneJson(synchronizedReview);
                  batchState.expectedRevision = applied.revision;
                  await persistCampaignState(synchronizedReview, 'Command Bearing sidecar closure review prompt context synchronized.');
                } else {
                  restoreCommandBearingReviewCompatibilityState();
                  postSettlementWarnings.push(compactPostSettlementWarning('lens', {
                    code: 'DIRECTIVE_SIDECAR_POST_SETTLEMENT_STATE_STALE'
                  }));
                }
              }
            } catch (error) {
              restoreCommandBearingReviewCompatibilityState();
              postSettlementWarnings.push(compactPostSettlementWarning('lens', {
                code: error?.code || 'DIRECTIVE_SIDECAR_POST_SETTLEMENT_LENS_FLUSH_FAILED'
              }));
            }
          } else if (typeof syncPromptContext === 'function') {
            const synchronizedReview = await syncPromptContext(commandBearingReview.campaignState, {
              workerKey: 'commandBearing',
              promptDirtyDomains: commandBearingReviewPromptDirtyDomains,
              commandBearingReview: true
            }, {
              activityReporter: commandBearingResult.job?.activityReporter || null,
              activitySource: 'sidecarPromptSync',
              activityMode: 'background',
              activityContext: {
                workerKey: 'commandBearing',
                classification: turnContext.classification || null,
                ingressId: turnContext.ingressId || null,
                turnId: turnContext.turnId || null,
                outcomeId: turnContext.outcomeId || null,
                commandBearingReview: true,
                promptDirtyDomains: commandBearingReviewPromptDirtyDomains,
                promptSyncIdempotencyKey: commandBearingReviewPromptSyncIdempotencyKey,
                source: 'campaignSidecarScheduler'
              }
            });
            if (synchronizedReview) {
              const promptOnlyReview = promptOnlyCampaignState(commandBearingReviewPersistentBaseState, synchronizedReview);
              applied.campaignState = promptOnlyReview;
              applied.revision = activeRuntimeRevision(promptOnlyReview) || applied.revision;
              setCampaignState(promptOnlyReview);
              batchState.currentState = cloneJson(promptOnlyReview);
              batchState.expectedRevision = applied.revision;
              await persistCampaignState(promptOnlyReview, 'Command Bearing sidecar closure review prompt context synchronized.');
            } else {
              restoreCommandBearingReviewCompatibilityState();
              postSettlementWarnings.push(compactPostSettlementWarning('promptSync', {
                code: 'DIRECTIVE_SIDECAR_POST_SETTLEMENT_REVIEW_SYNC_NO_STATE'
              }));
            }
          } else {
            restoreCommandBearingReviewCompatibilityState();
          }
        }
        commandBearingReviews = new Map([[commandBearingResult.workerKey, commandBearingReview]]);
      } catch (error) {
        if (commandBearingReviewMutated) {
          applied.campaignState = cloneJson(beforeCommandBearingReviewState);
          applied.revision = activeRuntimeRevision(beforeCommandBearingReviewState) || applied.revision;
          setCampaignState(beforeCommandBearingReviewState);
          batchState.currentState = cloneJson(beforeCommandBearingReviewState);
          batchState.expectedRevision = applied.revision;
          await persistCampaignState(beforeCommandBearingReviewState, 'Reverted Command Bearing sidecar closure review without durable settlement.');
        }
        postSettlementWarnings.push(compactPostSettlementWarning('commandBearingReview', {
          code: error?.code || 'DIRECTIVE_SIDECAR_POST_SETTLEMENT_COMMAND_BEARING_FAILED'
        }));
      }
    }
    return pendingResults.map((result) => {
      if (result.status !== 'pendingApply') return result;
      const final = {
        workerKey: result.workerKey,
        status: 'applied',
        proposal: cloneJson(result.proposal),
        revision: applied.revision,
        domains: applied.domains,
        forgeSettlement: compactForgeSettlementDiagnostics(forgeSettlement),
        postSettlementWarnings: cloneJson(postSettlementWarnings),
        recoveryRequired: null
      };
      queueCoreDiagnostic(result.job, 'applied', { result: final, postSettlementWarnings: cloneJson(postSettlementWarnings) });
      return final;
    });
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
      const priorDiagnosticBatch = activeDiagnosticBatch;
      const diagnosticBatch = [];
      activeDiagnosticBatch = diagnosticBatch;
      try {
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
      const baseRevision = activeRuntimeRevision(state);
      const jobs = requested.map((workerKey, index) => createWorkerJob(
        workerKey,
        state,
        turnContext,
        index,
        requested.length,
        activityReporter
      ));
      const providerBatchContext = providerBatchContextForJobs(jobs);
      const providerReplayKey = providerBatchContext.idempotencyKey || providerBatchContext.batchId;
      if (completedProviderBatches.has(providerReplayKey)) {
        const replay = cloneJson(completedProviderBatches.get(providerReplayKey));
        const replayState = initializeCampaignRuntimeTracking(getCampaignState());
        const cachedSourceFingerprints = Array.isArray(replay.sourceFingerprints) ? replay.sourceFingerprints : [];
        const replaySourceFailures = jobs.map((workerJob, index) => (
          staleSourceIngressFailure(workerJob, replayState)
          || providerReplaySourceMismatchFailure(workerJob, cachedSourceFingerprints[index])
        ));
        if (replaySourceFailures.some(Boolean)) {
          const firstFailure = replaySourceFailures.find(Boolean);
          const staleResults = jobs.map((workerJob, index) => {
            const error = cloneJson(replaySourceFailures[index] || firstFailure);
            const result = {
              workerKey: workerJob.workerKey,
              status: 'rejected',
              error
            };
            queueCoreDiagnostic(workerJob, 'stale', { result, error });
            emitActivity(activityReporter, {
              phase: 'sidecarWorker',
              mode: 'review',
              workerKey: workerJob.workerKey,
              status: 'rejected',
              classification: turnContext.classification || null
            });
            return result;
          });
          emitActivity(activityReporter, {
            phase: 'sidecarsSettled',
            mode: 'review',
            requested,
            results: cloneJson(staleResults),
            replayed: false,
            rejectedReplay: true,
            classification: turnContext.classification || null,
            ingressId: turnContext.ingressId || null,
            turnId: turnContext.turnId || null,
            outcomeId: turnContext.outcomeId || null
          });
          return staleResults;
        }
        emitActivity(activityReporter, {
          phase: 'sidecarsSettled',
          mode: 'background',
          requested,
          results: cloneJson(replay.finalResults || []),
          replayed: true,
          classification: turnContext.classification || null,
          ingressId: turnContext.ingressId || null,
          turnId: turnContext.turnId || null,
          outcomeId: turnContext.outcomeId || null
        });
        return replay.finalResults || [];
      }
      for (const workerJob of jobs) {
        queueCoreDiagnostic(workerJob, 'queued');
        queueCoreDiagnostic(workerJob, 'running');
      }
      let responses;
      try {
        responses = await generateWorkers(jobs, providerBatchContext);
      } catch (error) {
        const failure = compactProviderBatchFailure(error);
        const failedResults = jobs.map((workerJob) => ({
          workerKey: workerJob.workerKey,
          status: 'failed',
          error: cloneJson(failure)
        }));
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
          error: cloneJson(failure)
        });
        for (const workerJob of jobs) {
          queueCoreDiagnostic(workerJob, 'failed', {
            result: { workerKey: workerJob.workerKey, status: 'failed', error: failure },
            error: failure
          });
        }
        return failedResults;
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
      }
      const finalResults = await applyAcceptedWorkerBatch(results, turnContext, batchState, providerBatchContext);
      if (providerReplayKey && isProviderBatchCompletionCacheable(finalResults)) {
        completedProviderBatches.set(providerReplayKey, {
          completedAt: timestamp(now),
          finalResults: cloneJson(finalResults),
          sourceFingerprints: providerBatchSourceFingerprints(jobs)
        });
      }
      for (const [index, result] of finalResults.entries()) {
        const workerJob = jobs[index] || {};
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
          mode: finalResults.some((result) => ['failed', 'rejected'].includes(result.status)) ? 'review' : 'background',
          requested,
          results: cloneJson(finalResults),
          classification: turnContext.classification || null,
          ingressId: turnContext.ingressId || null,
          turnId: turnContext.turnId || null,
          outcomeId: turnContext.outcomeId || null
        });
      }
      return finalResults;
      } finally {
        activeDiagnosticBatch = priorDiagnosticBatch;
        await flushCoreDiagnostics(diagnosticBatch);
      }
    };
    queue = queue.then(job, job);
    return queue;
  }

  return {
    schedule,
    pending: async () => {
      const result = await queue;
      await diagnosticQueue;
      return result;
    }
  };
}

export const __campaignSidecarSchedulerTestHooks = Object.freeze({
  WORKERS,
  parseProposal,
  sidecarContext,
  sourceIngressSnapshot,
  proposalPrompt
});
