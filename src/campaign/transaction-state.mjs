import { applyCommandMarkAwards } from '../command/command-bearing.mjs';
import { createCompetenceLedgerRecords } from '../competence/competence-journal.mjs';
import { applyPressureLedgerDelta } from '../pressures/pressure-ledger.mjs';
import { applyRelationshipMemoryFromTurn } from '../simulation/crew-bplots.mjs';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function cloneRollbackSnapshot(value) {
  const snapshot = cloneJson(value);
  if (Array.isArray(snapshot?.turnLedger?.entries)) {
    snapshot.turnLedger.entries = snapshot.turnLedger.entries.map((entry) => ({
      ...entry,
      snapshotBefore: null
    }));
  }
  return snapshot;
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

function applyCommandStyleDelta(state, commandStyleDelta = {}) {
  if (!state.commandStyle) {
    state.commandStyle = {
      inspiration: { earnedRecords: [], awardedDecisionIds: [] },
      resolve: { earnedRecords: [], awardedDecisionIds: [] },
      noMoralityScore: true
    };
  }

  for (const record of commandStyleDelta.earnedRecordsAdd || []) {
    const key = String(record.track || '').toLowerCase();
    if (!['inspiration', 'resolve'].includes(key)) {
      continue;
    }
    if (!state.commandStyle[key]) {
      state.commandStyle[key] = { earnedRecords: [], awardedDecisionIds: [] };
    }
    state.commandStyle[key].earnedRecords = [
      ...(state.commandStyle[key].earnedRecords || []),
      cloneJson(record)
    ];
  }

  for (const decisionId of commandStyleDelta.awardedDecisionIdsAdd || []) {
    for (const key of ['inspiration', 'resolve']) {
      if (!state.commandStyle[key]) {
        state.commandStyle[key] = { earnedRecords: [], awardedDecisionIds: [] };
      }
    }
    const matchingRecords = (commandStyleDelta.earnedRecordsAdd || []).filter((record) => record.decisionId === decisionId);
    const tracks = matchingRecords.length > 0 ? matchingRecords.map((record) => String(record.track || '').toLowerCase()) : ['resolve'];
    for (const track of tracks) {
      if (['inspiration', 'resolve'].includes(track)) {
        state.commandStyle[track].awardedDecisionIds = mergeUnique(state.commandStyle[track].awardedDecisionIds || [], [decisionId]);
      }
    }
  }

  state.commandStyle = applyCommandMarkAwards(state.commandStyle, commandStyleDelta.earnedRecordsAdd || []);
}

function applyRelationshipDelta(state, relationships = {}) {
  if (!state.relationships) {
    state.relationships = { rawValuesHidden: true };
  }
  const descriptiveLog = ensureArrayOwner(state.relationships, 'descriptiveLog');
  for (const change of relationships.descriptiveChanges || []) {
    descriptiveLog.push(change);
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

function appendCommandLog(state, turnPacket) {
  const commandLogPacket = turnPacket.commandLogPacket;
  if (!state.commandLog) {
    state.commandLog = { entries: [], summariesGeneratedFromCommittedStateOnly: true };
  }
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
  let nextState = cloneRollbackSnapshot(campaignState);

  applyOpenWorldDelta(nextState, turnPacket.stateDelta?.openWorld || {});
  applyMissionDelta(nextState, turnPacket.stateDelta?.mission || {});
  applyClockDeltas(nextState, turnPacket.stateDelta?.clocks || []);
  applyCommandStyleDelta(nextState, turnPacket.stateDelta?.commandStyle || {});
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
  return commitDirectorTurn(entry.snapshotBefore, replacementTurnPacket);
}

export function deleteCommittedOutcome(campaignState, outcomeId) {
  const entry = (campaignState.turnLedger?.entries || []).find((item) => item.outcomeId === outcomeId);
  if (!entry) {
    throw new Error(`Cannot delete unknown outcome "${outcomeId}"`);
  }
  return restoreCampaignSnapshot(entry.snapshotBefore);
}

export function restoreCampaignSnapshot(snapshot) {
  return cloneJson(snapshot);
}
