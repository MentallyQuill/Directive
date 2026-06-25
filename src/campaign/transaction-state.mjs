import {
  applyCommandMarkAwards,
  migrateCommandBearingState,
  refreshCommandBearing,
  validateCommandBearingEvidenceProposal,
  validateCommandBearingReviewProposal
} from '../command/command-bearing.mjs';
import { createCompetenceLedgerRecords } from '../competence/competence-journal.mjs';
import { applyPressureLedgerDelta } from '../pressures/pressure-ledger.mjs';
import { applyRelationshipMemoryFromTurn } from '../simulation/crew-bplots.mjs';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

const DEFAULT_TURN_SAVE_HISTORY_LIMIT = 20;
const MIN_TURN_SAVE_HISTORY_LIMIT = 2;
const MAX_TURN_SAVE_HISTORY_LIMIT = 60;
const FULL_TURN_PACKET_RETENTION_LIMIT = 2;

function normalizeTurnSaveHistoryLimit(value, fallback = DEFAULT_TURN_SAVE_HISTORY_LIMIT) {
  const numeric = Math.round(Number(value));
  const fallbackNumeric = Math.round(Number(fallback));
  const candidate = Number.isFinite(numeric)
    ? numeric
    : (Number.isFinite(fallbackNumeric) ? fallbackNumeric : DEFAULT_TURN_SAVE_HISTORY_LIMIT);
  return Math.max(
    MIN_TURN_SAVE_HISTORY_LIMIT,
    Math.min(MAX_TURN_SAVE_HISTORY_LIMIT, candidate)
  );
}

function compactSceneReconciliationSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return {
    ...value,
    runs: [],
    pending: [],
    applied: [],
    rejected: [],
    recalculationPreviews: [],
    chunkCache: [],
    invalidations: []
  };
}

function compactRuntimeTrackingSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return {
    ...value,
    history: [],
    historyIndex: -1,
    ingressLedger: [],
    responseLedger: [],
    recoveryJournal: [],
    sidecarJournal: [],
    modelCallJournal: [],
    pendingInteractions: [],
    activeIngressId: null,
    sceneReconciliation: compactSceneReconciliationSnapshot(value.sceneReconciliation)
  };
}

function compactTurnLedgerEntrySnapshot(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
  const compactEntry = {
    ...entry,
    snapshotBefore: null
  };
  delete compactEntry.stateDelta;
  delete compactEntry.competencePacket;
  compactEntry.narration = entry.narration ? {
    sourceOutcomeId: entry.narration.sourceOutcomeId || null,
    providerId: entry.narration.providerId || null,
    generatedAt: entry.narration.generatedAt || null
  } : null;
  compactEntry.narrationFailureCount = Array.isArray(entry.narrationFailures)
    ? entry.narrationFailures.length
    : 0;
  compactEntry.narrationRevisionCount = Array.isArray(entry.narrationRevisions)
    ? entry.narrationRevisions.length
    : 0;
  compactEntry.narrationFailures = [];
  compactEntry.narrationRevisions = [];
  return compactEntry;
}

function compactTurnLedgerEntryPacket(entry) {
  const snapshotBefore = entry?.snapshotBefore || null;
  return {
    ...compactTurnLedgerEntrySnapshot(entry),
    snapshotBefore
  };
}

function cloneRollbackSnapshot(value) {
  const snapshot = cloneJson(value);
  if (snapshot?.runtimeTracking) {
    snapshot.runtimeTracking = compactRuntimeTrackingSnapshot(snapshot.runtimeTracking);
  }
  if (Array.isArray(snapshot?.turnLedger?.entries)) {
    snapshot.turnLedger.entries = snapshot.turnLedger.entries.map(compactTurnLedgerEntrySnapshot);
  }
  return snapshot;
}

function pruneTurnLedgerSnapshots(state, value = null) {
  const entries = state?.turnLedger?.entries;
  if (!Array.isArray(entries)) return state;
  const limit = normalizeTurnSaveHistoryLimit(value ?? state.settings?.maxTurnSaveHistory);
  const firstRetainedIndex = Math.max(0, entries.length - limit);
  for (let index = 0; index < firstRetainedIndex; index += 1) {
    entries[index] = {
      ...entries[index],
      snapshotBefore: null
    };
  }
  const firstFullPacketIndex = Math.max(0, entries.length - FULL_TURN_PACKET_RETENTION_LIMIT);
  for (let index = 0; index < firstFullPacketIndex; index += 1) {
    entries[index] = compactTurnLedgerEntryPacket(entries[index]);
  }
  state.settings = {
    ...(state.settings || {}),
    maxTurnSaveHistory: limit
  };
  state.turnLedger.snapshotRetentionLimit = limit;
  state.turnLedger.fullPacketRetentionLimit = FULL_TURN_PACKET_RETENTION_LIMIT;
  return state;
}

export function pruneTurnSaveHistory(campaignState, value = null) {
  return pruneTurnLedgerSnapshots(cloneJson(campaignState), value);
}

function ensureArrayOwner(object, key) {
  if (!Array.isArray(object[key])) {
    object[key] = [];
  }
  return object[key];
}

function mergeUnique(existing = [], additions = []) {
  return [...new Set([...existing, ...additions])];
}

function upsertOutcomeFlags(state, flags = []) {
  if (!state.mission) {
    state.mission = {};
  }
  const existing = Array.isArray(state.mission.outcomeFlags) ? state.mission.outcomeFlags : [];
  const byId = new Map(existing.map((flag) => [flag.id, { ...flag }]));
  for (const flag of flags) {
    const previous = byId.get(flag.id) || { id: flag.id };
    byId.set(flag.id, { ...previous, value: flag.value });
  }
  state.mission.outcomeFlags = [...byId.values()];
}

function applyClockDeltas(state, clockDeltas = []) {
  const owner = state.worldState && typeof state.worldState === 'object'
    ? state.worldState
    : state;
  const clocks = ensureArrayOwner(owner, 'clocks');
  const byId = new Map(clocks.map((clock) => [clock.id, clock]));
  for (const delta of clockDeltas) {
    const clock = byId.get(delta.id);
    if (clock) {
      clock.value = delta.to;
      clock.lastReason = delta.reason;
      clock.history = [
        ...(clock.history || []),
        { from: delta.from ?? null, to: delta.to, reason: delta.reason || 'mission-delta' }
      ];
    } else {
      clocks.push({ id: delta.id, value: delta.to, lastReason: delta.reason, history: [] });
    }
  }
}

function idsFromRecords(records = []) {
  return [...new Set((Array.isArray(records) ? records : []).map((record) => record?.id).filter(Boolean))];
}

function validateCommandBearingEvidenceForCommit(state, delta, turnPacket) {
  const records = Array.isArray(delta.evidenceRecordsAdd) ? delta.evidenceRecordsAdd : [];
  if (records.length === 0) return [];
  const validation = validateCommandBearingEvidenceProposal({
    evidence: records
  }, {
    sourceOutcomeId: turnPacket?.outcomePacket?.id || delta.outcomeId || null,
    sourceTurnId: turnPacket?.turnId || null,
    suppliedQuestIds: idsFromRecords(state.questLedger?.activeQuests || state.questLedger?.records || []),
    suppliedThreadIds: idsFromRecords(state.threadLedger?.records || []),
    suppliedArcIds: idsFromRecords(state.storyArcLedger?.arcs || state.storyArcLedger?.records || [])
  });
  if (!validation.accepted) {
    const error = new Error('Command Bearing evidence delta failed deterministic validation.');
    error.code = 'DIRECTIVE_COMMAND_BEARING_EVIDENCE_INVALID';
    error.details = validation.rejections;
    throw error;
  }
  return validation.records;
}

function validateCommandBearingReviewsForCommit(commandBearing, delta, acceptedEvidenceRecords) {
  const records = Array.isArray(delta.reviewRecordsAdd) ? delta.reviewRecordsAdd : [];
  if (records.length === 0) return [];
  const suppliedEvidenceIds = [
    ...idsFromRecords(commandBearing.evidenceLedger?.records || []),
    ...idsFromRecords(acceptedEvidenceRecords)
  ];
  const accepted = [];
  for (const record of records) {
    const validation = validateCommandBearingReviewProposal(record, {
      closureId: record?.closureId,
      suppliedEvidenceIds,
      commandBearing
    });
    if (!validation.accepted) {
      const error = new Error('Command Bearing review delta failed deterministic validation.');
      error.code = 'DIRECTIVE_COMMAND_BEARING_REVIEW_INVALID';
      error.details = validation.rejections;
      throw error;
    }
    accepted.push(...validation.records);
  }
  return accepted;
}

function applyCommandBearingDelta(state, commandBearingDelta = {}, turnPacket = null) {
  const delta = commandBearingDelta || {};
  let commandBearing = migrateCommandBearingState(state);
  const earnedRecords = delta.earnedRecordsAdd || delta.commandMarksAdd || [];
  if (earnedRecords.length > 0) {
    commandBearing = applyCommandMarkAwards(commandBearing, earnedRecords);
  }

  const evidenceRecords = validateCommandBearingEvidenceForCommit(state, delta, turnPacket);
  if (evidenceRecords.length > 0) {
    commandBearing.evidenceLedger.records = [
      ...(commandBearing.evidenceLedger.records || []),
      ...evidenceRecords
    ];
    for (const evidence of evidenceRecords) {
      if (evidence?.sourceOutcomeId) {
        commandBearing.evidenceLedger.bySourceOutcomeId[evidence.sourceOutcomeId] = mergeUnique(commandBearing.evidenceLedger.bySourceOutcomeId[evidence.sourceOutcomeId] || [], [evidence.id]);
      }
      if (evidence?.arcId) {
        commandBearing.evidenceLedger.byArcId[evidence.arcId] = mergeUnique(commandBearing.evidenceLedger.byArcId[evidence.arcId] || [], [evidence.id]);
      }
      if (evidence?.threadId) {
        commandBearing.evidenceLedger.byThreadId[evidence.threadId] = mergeUnique(commandBearing.evidenceLedger.byThreadId[evidence.threadId] || [], [evidence.id]);
      }
      if (evidence?.questId) {
        commandBearing.evidenceLedger.byQuestId[evidence.questId] = mergeUnique(commandBearing.evidenceLedger.byQuestId[evidence.questId] || [], [evidence.id]);
      }
    }
  }

  const reviewRecords = validateCommandBearingReviewsForCommit(commandBearing, delta, evidenceRecords);
  if (reviewRecords.length > 0) {
    commandBearing.reviewLedger.records = [
      ...(commandBearing.reviewLedger.records || []),
      ...reviewRecords
    ];
    for (const review of reviewRecords) {
      if (review?.closureId) {
        commandBearing.reviewLedger.reviewedClosureIds[review.closureId] = true;
      }
    }
    const markAwards = reviewRecords
      .filter((review) => review?.markAwarded === true && review.awardedTrack)
      .map((review) => ({
        id: review.id,
        closureId: review.closureId,
        sourceId: review.closureId || review.id,
        decisionId: review.closureId || review.id,
        track: review.awardedTrack,
        outcomeId: review.sourceOutcomeId || null,
        summary: review.awardSummary || ''
      }));
    if (markAwards.length > 0) {
      commandBearing = applyCommandMarkAwards(commandBearing, markAwards);
    }
  }

  if (delta.readied !== undefined) {
    commandBearing.readied = cloneJson(delta.readied);
  }

  state.commandBearing = refreshCommandBearing(commandBearing);
  // Transitional mirror for current pre-alpha callers. New code should read state.commandBearing.
  state.commandStyle = state.commandBearing;
}

export function commitCommandBearingReviewRecords(campaignState, reviewRecords = []) {
  const nextState = cloneJson(campaignState || {});
  applyCommandBearingDelta(nextState, {
    reviewRecordsAdd: Array.isArray(reviewRecords) ? reviewRecords : []
  });
  return nextState;
}

function applyRelationshipDelta(state, relationships = {}) {
  if (!state.relationships) {
    state.relationships = { rawValuesHidden: true };
  }
  const descriptiveLog = ensureArrayOwner(state.relationships, 'descriptiveLog');
  for (const change of relationships.descriptiveChanges || []) {
    descriptiveLog.push(change);
  }
  const perceptionRecords = [
    ...(Array.isArray(relationships.perceptionRecordsAdd) ? relationships.perceptionRecordsAdd : []),
    ...(Array.isArray(relationships.playerPerceptionsAdd) ? relationships.playerPerceptionsAdd : [])
  ];
  if (perceptionRecords.length > 0) {
    const perceptionLedger = ensureArrayOwner(state.relationships, 'perceptionLedger');
    const existingIds = new Set(perceptionLedger.map((record) => record?.id).filter(Boolean));
    for (const record of perceptionRecords) {
      if (record?.id && existingIds.has(record.id)) continue;
      perceptionLedger.push(cloneJson(record));
      if (record?.id) existingIds.add(record.id);
    }
  }
  state.relationships.rawValuesHidden = true;
}

function applyCommandCultureDelta(state, commandCultureDelta = {}) {
  if (!state.commandCulture) {
    state.commandCulture = { tendencies: [], rawValuesHidden: true };
  }
  state.commandCulture.tendencies = [
    ...(state.commandCulture.tendencies || []),
    ...cloneJson(commandCultureDelta.tendenciesAdd || [])
  ];
  state.commandCulture.rawValuesHidden = true;
}

function appendHistory(previous = {}, record = {}) {
  return [
    ...(previous.history || []),
    ...(record.history || [])
  ];
}

function applyActorDelta(state, actorDelta = {}) {
  const records = actorDelta.upsertPostures || [];
  if (records.length === 0) return;
  if (state.worldState && typeof state.worldState === 'object') {
    const actors = ensureArrayOwner(state.worldState, 'actors');
    const byActorId = new Map(actors.map((record) => [record.id || record.actorId, record]));
    for (const record of records) {
      const actorId = record?.actorId || record?.id;
      if (!actorId) continue;
      const previous = byActorId.get(actorId) || { id: actorId };
      const nextRecord = {
        ...cloneJson(previous),
        ...cloneJson(record),
        id: actorId,
        history: appendHistory(previous, record)
      };
      delete nextRecord.actorId;
      byActorId.set(actorId, nextRecord);
    }
    state.worldState.actors = [...byActorId.values()];
    return;
  }
  if (!state.actors || typeof state.actors !== 'object' || Array.isArray(state.actors)) {
    state.actors = {};
  }
  const postures = ensureArrayOwner(state.actors, 'postures');
  const byActorId = new Map(postures.map((record) => [record.actorId, record]));
  for (const record of records) {
    if (!record?.actorId) continue;
    const previous = byActorId.get(record.actorId) || {};
    byActorId.set(record.actorId, {
      ...cloneJson(previous),
      ...cloneJson(record),
      history: appendHistory(previous, record)
    });
  }
  state.actors.postures = [...byActorId.values()];
  state.actors.rawValuesHidden = true;
}

function applyFrontDelta(state, frontDelta = {}) {
  const records = frontDelta.upsertRecords || [];
  if (records.length === 0) return;
  const owner = state.worldState && typeof state.worldState === 'object'
    ? state.worldState
    : state;
  const fronts = ensureArrayOwner(owner, 'fronts');
  const byId = new Map(fronts.map((record) => [record.id, record]));
  for (const record of records) {
    if (!record?.id) continue;
    const previous = byId.get(record.id) || {};
    byId.set(record.id, {
      ...cloneJson(previous),
      ...cloneJson(record),
      history: appendHistory(previous, record)
    });
  }
  owner.fronts = [...byId.values()];
}

function ensureCommandCompetenceState(state) {
  if (!state.commandCompetence) {
    state.commandCompetence = {};
  }
  for (const key of [
    'standingOrders',
    'assumedActionsLedger',
    'warningLedger',
    'acceptedRiskLedger',
    'authorityNotesLedger',
    'counselRequestLedger',
    'retroactiveCompetenceLedger'
  ]) {
    ensureArrayOwner(state.commandCompetence, key);
  }
  return state.commandCompetence;
}

function applyCommandCompetenceRecords(state, turnPacket, { confirmedWarningIds = [] } = {}) {
  if (!turnPacket.competencePacket) {
    return;
  }
  const commandCompetence = ensureCommandCompetenceState(state);
  const records = createCompetenceLedgerRecords({
    competencePacket: turnPacket.competencePacket,
    outcomeId: turnPacket.outcomePacket?.id || null,
    confirmedWarningIds
  });
  commandCompetence.assumedActionsLedger.push(...cloneJson(records.assumedActionsLedgerAdd || []));
  commandCompetence.warningLedger.push(...cloneJson(records.warningLedgerAdd || []));
  commandCompetence.acceptedRiskLedger.push(...cloneJson(records.acceptedRiskLedgerAdd || []));
  commandCompetence.authorityNotesLedger.push(...cloneJson(records.authorityNotesLedgerAdd || []));
  commandCompetence.counselRequestLedger.push(...cloneJson(records.counselRequestLedgerAdd || []));
}

function applyMissionDelta(state, missionDelta = {}) {
  if (!state.mission) {
    state.mission = {};
  }
  state.mission.knownFacts = mergeUnique(state.mission.knownFacts || [], missionDelta.knownFactIdsAdd || []);
  upsertOutcomeFlags(state, missionDelta.outcomeFlagsSet || []);

  if (missionDelta.activePhaseIdSet) {
    state.mission.activePhaseId = missionDelta.activePhaseIdSet;
  }
  if (missionDelta.phaseSet) {
    state.mission.phase = missionDelta.phaseSet;
  }
  if (Array.isArray(missionDelta.availableDecisionPointIdsSet)) {
    state.mission.availableDecisionPointIds = [...missionDelta.availableDecisionPointIdsSet];
  }
  if (missionDelta.phaseAdvance) {
    state.mission.phaseHistory = [
      ...(state.mission.phaseHistory || []),
      cloneJson(missionDelta.phaseAdvance)
    ];
  }
  if (Array.isArray(missionDelta.followUpsAdd) && missionDelta.followUpsAdd.length > 0) {
    state.mission.followUps = [
      ...(state.mission.followUps || []),
      ...cloneJson(missionDelta.followUpsAdd)
    ];
  }
  for (const [deltaKey, stateKey] of [
    ['activeMissionIdSet', 'activeMissionId'],
    ['activeMissionGraphIdSet', 'activeMissionGraphId'],
    ['activeMissionGraphPathSet', 'activeMissionGraphPath'],
    ['endStateSet', 'endState'],
    ['arrivalPostureSet', 'arrivalPosture'],
    ['completedMissionIdSet', 'completedMissionId'],
    ['nextMissionIdSet', 'nextMissionId'],
    ['transitionStatusSet', 'transitionStatus']
  ]) {
    if (missionDelta[deltaKey]) {
      state.mission[stateKey] = missionDelta[deltaKey];
    }
  }
}

function applyTerminalStateDelta(state, terminalStateDelta = {}) {
  if (!terminalStateDelta || typeof terminalStateDelta !== 'object' || Array.isArray(terminalStateDelta)) {
    return;
  }
  if (terminalStateDelta.shipPatch && typeof terminalStateDelta.shipPatch === 'object' && !Array.isArray(terminalStateDelta.shipPatch)) {
    state.ship = {
      ...(state.ship || {}),
      ...cloneJson(terminalStateDelta.shipPatch)
    };
  }
  if (terminalStateDelta.playerPatch && typeof terminalStateDelta.playerPatch === 'object' && !Array.isArray(terminalStateDelta.playerPatch)) {
    state.player = {
      ...(state.player || {}),
      ...cloneJson(terminalStateDelta.playerPatch)
    };
  }
  if (Array.isArray(terminalStateDelta.flagsSet) && terminalStateDelta.flagsSet.length > 0) {
    state.flags = state.flags && typeof state.flags === 'object' && !Array.isArray(state.flags)
      ? { ...state.flags }
      : {};
    for (const flag of terminalStateDelta.flagsSet) {
      if (!flag?.id) continue;
      state.flags[flag.id] = cloneJson(flag.value);
    }
  }
}

const OPEN_WORLD_REPLACEABLE_ROOTS = new Set([
  'worldState',
  'storyArcLedger',
  'questLedger',
  'dynamicQuestCatalog',
  'knowledgeLedger',
  'threadLedger',
  'eventLedger',
  'attentionState',
  'runtimeTracking',
  'campaignTracks',
  'campaignAssets',
  'mission'
]);

function applyOpenWorldDelta(state, openWorldDelta = {}) {
  const roots = openWorldDelta.rootsSet || {};
  for (const [key, value] of Object.entries(roots)) {
    if (!OPEN_WORLD_REPLACEABLE_ROOTS.has(key)) {
      throw new Error(`Open-world turn cannot replace unauthorized root "${key}".`);
    }
    state[key] = cloneJson(value);
  }
}

function pressureLogConsequences(stateDelta = {}) {
  return (stateDelta.pressureLedger?.upsertRecords || [])
    .map((record) => `Pressure recorded: ${record.playerSummary || record.title}`)
    .filter(Boolean);
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function commandLogText(value) {
  if (typeof value === 'string') return value.trim();
  if (!isObject(value)) return '';
  return String(value.summary || value.label || value.description || value.title || value.id || '').trim();
}

function commandLogTexts(values = []) {
  const array = Array.isArray(values) ? values : [values];
  return array.map(commandLogText).filter(Boolean);
}

function normalizeCommandLogEntry(entry = {}) {
  if (!isObject(entry)) {
    return {
      summaryInputs: [String(entry || '').trim()].filter(Boolean),
      visibleConsequences: []
    };
  }
  const summaryInputs = Array.isArray(entry.summaryInputs) && entry.summaryInputs.length > 0
    ? entry.summaryInputs
    : commandLogTexts([
        entry.summary,
        entry.playerText,
        entry.order,
        entry.action,
        entry.decision,
        entry.objectiveRef,
        entry.type,
        entry.id
      ]);
  const visibleConsequences = Array.isArray(entry.visibleConsequences) && entry.visibleConsequences.length > 0
    ? entry.visibleConsequences
    : commandLogTexts(entry.consequences || []);
  return {
    ...cloneJson(entry),
    summaryInputs: cloneJson(summaryInputs),
    visibleConsequences: cloneJson(visibleConsequences)
  };
}

function normalizeCommandLogOwner(value) {
  const existingEntries = Array.isArray(value)
    ? value
    : (Array.isArray(value?.entries) ? value.entries : []);
  return {
    ...(isObject(value) ? value : {}),
    entries: existingEntries.map(normalizeCommandLogEntry),
    summariesGeneratedFromCommittedStateOnly: value?.summariesGeneratedFromCommittedStateOnly !== false
  };
}

function appendCommandLog(state, turnPacket) {
  const commandLogPacket = turnPacket.commandLogPacket;
  state.commandLog = normalizeCommandLogOwner(state.commandLog);
  const entries = ensureArrayOwner(state.commandLog, 'entries');
  entries.push({
    sourceOutcomeId: commandLogPacket.sourceOutcomeId,
    summaryInputs: cloneJson(commandLogPacket.summaryInputs || []),
    visibleConsequences: cloneJson([
      ...(commandLogPacket.visibleConsequences || []),
      ...pressureLogConsequences(turnPacket.stateDelta)
    ])
  });
}

function appendLedgerEntry(state, turnPacket, snapshotBefore) {
  if (!state.turnLedger) {
    state.turnLedger = { entries: [], swipeRerollForbidden: true };
  }
  const entries = ensureArrayOwner(state.turnLedger, 'entries');
  entries.push({
    turnId: turnPacket.turnId,
    outcomeId: turnPacket.outcomePacket.id,
    resultBand: turnPacket.outcomePacket.resultBand,
    stateDelta: cloneJson(turnPacket.stateDelta),
    competencePacket: cloneJson(turnPacket.competencePacket || null),
    narratorSourceOutcomeId: turnPacket.narratorPacket.sourceOutcomeId,
    commandLogSourceOutcomeId: turnPacket.commandLogPacket.sourceOutcomeId,
    snapshotBefore,
    narrationStatus: 'pending',
    narration: null,
    narrationFailures: [],
    narrationRevisions: []
  });
  state.turnLedger.lastCommittedOutcomeId = turnPacket.outcomePacket.id;
  state.turnLedger.swipeRerollForbidden = true;
}

export function commitDirectorTurn(campaignState, turnPacket, { confirmedWarningIds = [] } = {}) {
  const snapshotBefore = cloneRollbackSnapshot(campaignState);
  let nextState = cloneJson(campaignState);

  applyOpenWorldDelta(nextState, turnPacket.stateDelta?.openWorld || {});
  applyMissionDelta(nextState, turnPacket.stateDelta?.mission || {});
  applyTerminalStateDelta(nextState, turnPacket.stateDelta?.terminalState || {});
  applyClockDeltas(nextState, turnPacket.stateDelta?.clocks || []);
  applyCommandBearingDelta(nextState, turnPacket.stateDelta?.commandBearing || turnPacket.stateDelta?.commandStyle || {}, turnPacket);
  applyCommandCultureDelta(nextState, turnPacket.stateDelta?.commandCulture || {});
  applyRelationshipDelta(nextState, turnPacket.stateDelta?.relationships || {});
  applyPressureLedgerDelta(nextState, turnPacket.stateDelta?.pressureLedger || {});
  applyActorDelta(nextState, turnPacket.stateDelta?.actors || {});
  applyFrontDelta(nextState, turnPacket.stateDelta?.fronts || {});
  applyCommandCompetenceRecords(nextState, turnPacket, { confirmedWarningIds });
  nextState = applyRelationshipMemoryFromTurn(nextState, turnPacket, {
    crewIds: turnPacket.stateDelta?.relationships?.affectedCrewIds || null
  });
  appendCommandLog(nextState, turnPacket);
  appendLedgerEntry(nextState, turnPacket, snapshotBefore);
  pruneTurnLedgerSnapshots(nextState);

  return nextState;
}

export function recordNarrationSwipe(campaignState, outcomeId, narratorPacket) {
  const nextState = cloneJson(campaignState);
  const entry = (nextState.turnLedger?.entries || []).find((item) => item.outcomeId === outcomeId);
  if (!entry) {
    throw new Error(`Cannot record narration swipe for unknown outcome "${outcomeId}"`);
  }
  if (narratorPacket.sourceOutcomeId !== outcomeId) {
    throw new Error(`Narrator packet source outcome "${narratorPacket.sourceOutcomeId}" does not match "${outcomeId}"`);
  }
  entry.narrationRevisions = [
    ...(entry.narrationRevisions || []),
    cloneJson(narratorPacket)
  ];
  nextState.turnLedger.lastNarrationSwipeOutcomeId = outcomeId;
  return nextState;
}

export function recordNarrationSuccess(campaignState, outcomeId, narrationResult) {
  const nextState = cloneJson(campaignState);
  const entry = (nextState.turnLedger?.entries || []).find((item) => item.outcomeId === outcomeId);
  if (!entry) {
    throw new Error(`Cannot record narration for unknown outcome "${outcomeId}"`);
  }
  entry.narrationStatus = 'complete';
  entry.narration = cloneJson(narrationResult);
  entry.narrationFailures = entry.narrationFailures || [];
  nextState.turnLedger.lastNarratedOutcomeId = outcomeId;
  if (nextState.turnLedger.pendingNarrationRecovery?.outcomeId === outcomeId) {
    nextState.turnLedger.pendingNarrationRecovery = null;
  }
  return nextState;
}

export function recordNarrationFailure(campaignState, outcomeId, failure) {
  const nextState = cloneJson(campaignState);
  const entry = (nextState.turnLedger?.entries || []).find((item) => item.outcomeId === outcomeId);
  if (!entry) {
    throw new Error(`Cannot record narration failure for unknown outcome "${outcomeId}"`);
  }
  const failureRecord = {
    outcomeId,
    failedAt: failure?.failedAt || new Date().toISOString(),
    providerId: failure?.providerId || null,
    message: failure?.message || String(failure || 'Narration failed.'),
    retryable: failure?.retryable !== false
  };
  if (entry.narrationStatus !== 'complete') {
    entry.narrationStatus = 'failed';
  }
  entry.narrationFailures = [
    ...(entry.narrationFailures || []),
    failureRecord
  ];
  nextState.turnLedger.pendingNarrationRecovery = failureRecord;
  return nextState;
}

export function editCommittedOutcome(campaignState, outcomeId, replacementTurnPacket) {
  const entry = (campaignState.turnLedger?.entries || []).find((item) => item.outcomeId === outcomeId);
  if (!entry) {
    throw new Error(`Cannot edit unknown outcome "${outcomeId}"`);
  }
  if (!entry.snapshotBefore) {
    throw new Error(`Cannot edit outcome "${outcomeId}" because its turn save history snapshot is no longer retained.`);
  }
  return commitDirectorTurn(entry.snapshotBefore, replacementTurnPacket);
}

export function deleteCommittedOutcome(campaignState, outcomeId) {
  const entry = (campaignState.turnLedger?.entries || []).find((item) => item.outcomeId === outcomeId);
  if (!entry) {
    throw new Error(`Cannot delete unknown outcome "${outcomeId}"`);
  }
  if (!entry.snapshotBefore) {
    throw new Error(`Cannot delete outcome "${outcomeId}" because its turn save history snapshot is no longer retained.`);
  }
  return restoreCampaignSnapshot(entry.snapshotBefore);
}

export function restoreCampaignSnapshot(snapshot) {
  return cloneJson(snapshot);
}
