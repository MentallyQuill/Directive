import {
  initializeCampaignRuntimeTracking,
  recordSidecarEvent
} from '../runtime/state-delta-gateway.mjs';
import { allowedRootsForModelRole } from '../generation/model-call-authority-matrix.mjs';
import { parseStateDeltaProposalOutput } from './sidecar-output-contracts.mjs';
import { runSidecarJobs } from './sidecar-job-runner.mjs';
import { planCommandBearingStateClosureReviews } from '../command/command-bearing.mjs';
import { runCommandBearingClosureReviews } from '../command/command-bearing-review.mjs';
import { commitCommandBearingReviewRecords } from '../campaign/transaction-state.mjs';
import { missionComponentsState } from '../runtime/mission-components.mjs';
import { createTurnSourceFrameRef } from '../runtime/architecture-redesign-contracts.mjs';

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
  return (campaignState?.runtimeTracking?.ingressLedger || []).find((entry) => entry.id === ingressId) || null;
}

function sourceIngressSnapshot(campaignState, ingressId) {
  const ingress = ingressById(campaignState, ingressId);
  if (!ingress) return null;
  const sourceFrameRef = createTurnSourceFrameRef(ingress.sourceFrame || {
    id: ingress.sourceFrameId,
    campaignId: ingress.campaignId,
    saveId: campaignState?.campaignChatBinding?.saveId,
    chatId: ingress.chatId,
    hostMessageId: ingress.hostMessageId,
    textHash: ingress.textHash
  });
  const sourceToken = sourceFrameRef?.id
    ? `turnSourceFrame:${sourceFrameRef.id}`
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
    coreTransactionId: ingress.coreTransactionId || null
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
  commitCoreBackgroundBatch = null,
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
  let diagnosticQueue = Promise.resolve();

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

  async function journalBatch(events = [], summary = 'Recorded sidecar batch events.') {
    if (!events.length) return initializeCampaignRuntimeTracking(getCampaignState());
    let next = initializeCampaignRuntimeTracking(getCampaignState());
    for (const event of events) {
      next = recordSidecarEvent(next, {
        recordedAt: timestamp(now),
        ...event
      });
    }
    setCampaignState(next);
    await persistCampaignState(next, summary);
    return next;
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
    if (typeof appendCoreDiagnostic !== 'function') return null;
    const event = sidecarCoreDiagnosticEvent(job, status, details);
    if (!event) return null;
    if (!event.coreTransactionId) return null;
    diagnosticQueue = diagnosticQueue
      .catch(() => null)
      .then(() => appendCoreDiagnostic(cloneJson(event)))
      .catch(() => null);
    return cloneJson(event);
  }

  function createWorkerJob(workerKey, state, turnContext, index, batchSize, activityReporter = null) {
    const worker = WORKERS[workerKey];
    if (!worker) return { workerKey, status: 'skipped', reason: 'unknown-worker' };
    const baseRevision = state.runtimeTracking.revision;
    const baseEventContext = sidecarEventContext(turnContext);
    const sourceIngress = sourceIngressSnapshot(state, baseEventContext.ingressId);
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

  async function generateWorkers(jobs) {
    const batch = await runSidecarJobs({
      jobs,
      generationRouter,
      concurrent: jobs.length > 1,
      now
    });
    return batch.results.map((result) => {
      if (result.status !== 'complete') {
        return {
          ok: false,
          error: result.error || {
            code: `DIRECTIVE_SIDECAR_${String(result.status || 'failed').toUpperCase()}`,
            message: `Sidecar job ${result.status || 'failed'}.`
          },
          diagnostics: cloneJson(result.diagnostics || null)
        };
      }
      return {
        ok: true,
        response: {
          text: typeof result.packet === 'string' ? result.packet : JSON.stringify(result.packet ?? null)
        },
        diagnostics: cloneJson(result.diagnostics || null)
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
      queueCoreDiagnostic(job, diagnosticStatusForWorkerResult(result.status, error), { result, error });
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
            status: 'noChange',
            missionComponents: cloneJson(missionComponentProvenance)
          },
          apply: {
            ok: true,
            skipped: true
          }
        }
      }, `${workerKey} sidecar completed with no durable change.`);
      batchState.currentState = cloneJson(journaled);
      const result = { workerKey, status: 'noChange', proposal: cloneJson(proposal) };
      queueCoreDiagnostic(job, 'noChange', { result });
      return result;
    }

    const currentState = freshestBatchState();
    const currentRevision = currentState.runtimeTracking.revision;
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

  async function applyAcceptedWorkerBatch(pendingResults = [], turnContext = {}, batchState = {}) {
    const accepted = pendingResults.filter((result) => result.status === 'pendingApply');
    if (!accepted.length) return pendingResults;
    const operations = accepted.flatMap((result) => result.applyProposal?.operations || []);
    const allowedRoots = [...new Set(accepted.flatMap((result) => result.allowedRoots || []))];
    const workerKeys = accepted.map((result) => result.workerKey);
    const promptWorkerKey = workerKeys.length === 1 ? workerKeys[0] : 'campaignSidecarBatch';
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
    let commandBearingReviews = new Map();
    const beforeApplyState = cloneJson(batchState.currentState || getCampaignState());
    try {
      setCampaignState(beforeApplyState);
      applied = await stateDeltaGateway.applyOperations(combinedProposal, { allowedRoots });
      batchState.expectedRevision = applied.revision;
      setCampaignState(applied.campaignState);
      batchState.currentState = cloneJson(applied.campaignState);
      if (typeof commitCoreBackgroundBatch === 'function') {
        const transactionIds = [...new Set(accepted.map((result) => result.job?.sourceIngress?.coreTransactionId).filter(Boolean))];
        if (transactionIds.length === 1) {
          const sourceFrameRefs = [...new Map(accepted
            .map((result) => result.job?.sourceIngress?.sourceFrameRef || result.job?.source?.sourceFrameRef || null)
            .filter(Boolean)
            .map((ref) => [ref.id || JSON.stringify(ref), ref])).values()];
          const sourceTokens = [...new Set(accepted
            .map((result) => result.job?.sourceIngress?.sourceToken || result.job?.source?.sourceToken)
            .filter(Boolean))];
          try {
            await commitCoreBackgroundBatch(transactionIds[0], {
              idempotencyKey: `campaign-sidecar:${transactionIds[0]}:${turnContext.outcomeId || turnContext.ingressId || baseRevision}`,
              batchId: `campaign-sidecar:${transactionIds[0]}:${turnContext.outcomeId || turnContext.ingressId || baseRevision}`,
              phaseAfter: 'backgroundSettling',
              outcomeId: turnContext.outcomeId || null,
              sourceFrameRef: sourceFrameRefs.length === 1 ? cloneJson(sourceFrameRefs[0]) : undefined,
              sourceToken: sourceTokens.length === 1 ? sourceTokens[0] : undefined,
              operations,
              promptDirtyDomains: allowedRoots,
              workers: accepted.map((result) => ({
                workerId: result.workerKey,
                status: 'applied',
                operationCount: result.proposal?.operations?.length || 0
              }))
            });
          } catch {
            // CORE background ownership is best-effort during the v1/v2 bridge.
          }
        }
      }
      if (typeof syncPromptContext === 'function') {
        synchronized = await syncPromptContext(applied.campaignState, {
          workerKey: promptWorkerKey,
          workerKeys,
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
            source: 'campaignSidecarScheduler'
          }
        });
        if (synchronized) {
          applied.campaignState = synchronized;
          setCampaignState(synchronized);
          batchState.currentState = cloneJson(synchronized);
          await persistCampaignState(synchronized, 'Campaign sidecar batch prompt context synchronized.');
        }
      }
      const commandBearingResult = accepted.find((result) => result.workerKey === 'commandBearing');
      if (commandBearingResult) {
        let commandBearingReview = await runCommandBearingEvidenceClosureReview({
          beforeState: beforeApplyState,
          currentState: batchState.currentState,
          proposal: commandBearingResult.proposal,
          proposalEventContext: commandBearingResult.proposalEventContext,
          parsedDiagnostics: commandBearingResult.parsedDiagnostics
        });
        if (commandBearingReview.campaignState) {
          applied.campaignState = commandBearingReview.campaignState;
          applied.revision = commandBearingReview.campaignState.runtimeTracking?.revision || applied.revision;
          setCampaignState(commandBearingReview.campaignState);
          batchState.currentState = cloneJson(commandBearingReview.campaignState);
          batchState.expectedRevision = applied.revision;
          if (typeof syncPromptContext === 'function') {
            const synchronizedReview = await syncPromptContext(commandBearingReview.campaignState, {
              workerKey: 'commandBearing',
              proposal: cloneJson(commandBearingResult.applyProposal),
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
                source: 'campaignSidecarScheduler'
              }
            });
            if (synchronizedReview) {
              applied.campaignState = synchronizedReview;
              applied.revision = synchronizedReview.runtimeTracking?.revision || applied.revision;
              setCampaignState(synchronizedReview);
              batchState.currentState = cloneJson(synchronizedReview);
              batchState.expectedRevision = applied.revision;
              await persistCampaignState(synchronizedReview, 'Command Bearing sidecar closure review prompt context synchronized.');
            }
          }
        }
        commandBearingReviews = new Map([[commandBearingResult.workerKey, commandBearingReview]]);
      }
      const journalEvents = accepted.map((result) => {
        const commandBearingReview = commandBearingReviews.get(result.workerKey) || { attempted: false, reason: 'not-command-bearing-worker' };
        return {
          id: result.proposal?.id || `sidecar:${result.workerKey}:${result.baseRevision}:${applied.revision}`,
          workerId: result.workerKey,
          roleId: result.roleId,
          status: 'applied',
          baseRevision: result.baseRevision,
          appliedRevision: applied.revision,
          summary: result.proposal?.summary || `${result.proposal?.operations?.length || 0} operation(s) applied.`,
          ...result.proposalEventContext,
          diagnostics: {
            ...cloneJson(result.parsedDiagnostics || {}),
            ...batchDiagnostics(result.job, {
              applyBaseRevision: baseRevision,
              aggregateBatch: true,
              aggregateWorkerCount: accepted.length,
              aggregateOperationCount: operations.length,
              rebased: baseRevision !== result.baseRevision
            }),
            feature: {
              ok: true,
              status: 'applied',
              commandBearingReview: commandBearingReviewDiagnostics(commandBearingReview),
              missionComponents: cloneJson(result.missionComponentProvenance)
            },
            apply: {
              ok: true,
              revision: applied.revision,
              domains: cloneJson(applied.domains || [])
            }
          }
        };
      });
      const journaled = await journalBatch(journalEvents, 'Recorded accepted campaign sidecar batch results.');
      batchState.currentState = cloneJson(journaled);
      return pendingResults.map((result) => {
        if (result.status !== 'pendingApply') return result;
        const final = {
          workerKey: result.workerKey,
          status: 'applied',
          proposal: cloneJson(result.proposal),
          revision: applied.revision,
          domains: applied.domains
        };
        queueCoreDiagnostic(result.job, 'applied', { result: final });
        return final;
      });
    } catch (error) {
      const failure = {
        code: error?.code || 'DIRECTIVE_SIDECAR_BATCH_REJECTED',
        message: error?.message || String(error),
        details: cloneJson(error?.details || null)
      };
      const journalEvents = accepted.map((result) => ({
        id: result.proposal?.id || `sidecar:${result.workerKey}:${result.baseRevision}:rejected`,
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
            aggregateBatch: true
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
      const journaled = await journalBatch(journalEvents, 'Rejected campaign sidecar batch results.');
      batchState.currentState = cloneJson(journaled);
      return pendingResults.map((result) => {
        if (result.status !== 'pendingApply') return result;
        const final = { workerKey: result.workerKey, status: 'rejected', error: failure };
        queueCoreDiagnostic(result.job, 'rejected', { result: final, error: failure });
        return final;
      });
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
      const jobs = requested.map((workerKey, index) => createWorkerJob(
        workerKey,
        state,
        turnContext,
        index,
        requested.length,
        activityReporter
      ));
      for (const workerJob of jobs) {
        queueCoreDiagnostic(workerJob, 'queued');
        queueCoreDiagnostic(workerJob, 'running');
      }
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
        for (const workerJob of jobs) {
          const failure = {
            code: error?.code || 'DIRECTIVE_SIDECAR_BATCH_FAILED',
            message: error?.message || String(error)
          };
          queueCoreDiagnostic(workerJob, 'failed', {
            result: { workerKey: workerJob.workerKey, status: 'failed', error: failure },
            error: failure
          });
        }
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
      }
      const finalResults = await applyAcceptedWorkerBatch(results, turnContext, batchState);
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
  proposalPrompt
});
