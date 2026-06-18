function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
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
  const clocks = ensureArrayOwner(state, 'clocks');
  const byId = new Map(clocks.map((clock) => [clock.id, clock]));
  for (const delta of clockDeltas) {
    const clock = byId.get(delta.id);
    if (clock) {
      clock.value = delta.to;
      clock.lastReason = delta.reason;
    } else {
      clocks.push({ id: delta.id, value: delta.to, lastReason: delta.reason });
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
}

function appendCommandLog(state, commandLogPacket) {
  if (!state.commandLog) {
    state.commandLog = { entries: [], summariesGeneratedFromCommittedStateOnly: true };
  }
  const entries = ensureArrayOwner(state.commandLog, 'entries');
  entries.push({
    sourceOutcomeId: commandLogPacket.sourceOutcomeId,
    summaryInputs: cloneJson(commandLogPacket.summaryInputs || []),
    visibleConsequences: cloneJson(commandLogPacket.visibleConsequences || [])
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
    narratorSourceOutcomeId: turnPacket.narratorPacket.sourceOutcomeId,
    commandLogSourceOutcomeId: turnPacket.commandLogPacket.sourceOutcomeId,
    snapshotBefore,
    narrationRevisions: []
  });
  state.turnLedger.lastCommittedOutcomeId = turnPacket.outcomePacket.id;
  state.turnLedger.swipeRerollForbidden = true;
}

export function commitDirectorTurn(campaignState, turnPacket) {
  const snapshotBefore = cloneJson(campaignState);
  const nextState = cloneJson(campaignState);

  applyMissionDelta(nextState, turnPacket.stateDelta?.mission || {});
  applyClockDeltas(nextState, turnPacket.stateDelta?.clocks || []);
  applyCommandStyleDelta(nextState, turnPacket.stateDelta?.commandStyle || {});
  applyRelationshipDelta(nextState, turnPacket.stateDelta?.relationships || {});
  appendCommandLog(nextState, turnPacket.commandLogPacket);
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
