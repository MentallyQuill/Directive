import fs from 'node:fs';
import path from 'node:path';
import {
  commitDirectorTurn,
  deleteCommittedOutcome,
  editCommittedOutcome,
  recordNarrationFailure,
  recordNarrationSuccess,
  recordNarrationSwipe,
  restoreCampaignSnapshot
} from '../../src/campaign/transaction-state.mjs';
import { runMissionDirectorTurn } from '../../src/mission/director.mjs';

const root = process.cwd();
const errors = [];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

function stable(value) {
  return JSON.stringify(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function at(location, message) {
  errors.push(`${location}: ${message}`);
}

function requireEqual(actual, expected, location) {
  if (stable(actual) !== stable(expected)) {
    at(location, `got ${stable(actual)}, expected ${stable(expected)}`);
  }
}

function requireIncludes(values, expected, location) {
  if (!Array.isArray(values) || !values.includes(expected)) {
    at(location, `missing "${expected}"`);
  }
}

function requireThrows(fn, expectedMessage, location) {
  try {
    fn();
  } catch (error) {
    if (expectedMessage.test(String(error?.message || error))) {
      return;
    }
    at(location, `unexpected error "${String(error?.message || error)}"`);
    return;
  }
  at(location, 'expected an error');
}

function clockLedger(state) {
  return state.worldState?.clocks || state.clocks || [];
}

function clockValue(state, id) {
  return clockLedger(state).find((clock) => clock.id === id)?.value;
}

function outcomeFlagValue(state, id) {
  return (state.mission?.outcomeFlags || []).find((flag) => flag.id === id)?.value;
}

function buildTurn(loopFixturePath) {
  const fixture = readJson(loopFixturePath);
  const graph = readJson(fixture.graphPath);
  const projection = readJson(fixture.projectionPath);
  const crewDataset = readJson(fixture.crewDatasetPath);
  return {
    fixture,
    turn: runMissionDirectorTurn({
      turnId: fixture.input.turnId,
      graphPath: fixture.graphPath,
      projectionPath: fixture.projectionPath,
      graph,
      projection,
      crewDataset,
      sceneSnapshot: fixture.input.sceneSnapshot,
      campaignState: fixture.input.campaignState
    })
  };
}

function stateForFixture(projection, fixture) {
  const state = cloneJson(projection.initialState);
  state.mission.activePhaseId = fixture.input.sceneSnapshot.activePhaseId;
  state.mission.phase = fixture.input.sceneSnapshot.activePhaseId;
  state.mission.availableDecisionPointIds = [...fixture.input.sceneSnapshot.activeDecisionPointIds];
  state.mission.knownFacts = [...fixture.input.sceneSnapshot.knownFactIds];
  for (const fixtureClock of fixture.input.campaignState.clocks || []) {
    const clock = clockLedger(state).find((item) => item.id === fixtureClock.id);
    if (clock) {
      clock.value = fixtureClock.value;
    }
  }
  state.commandStyle = cloneJson(fixture.input.campaignState.commandStyle);
  return state;
}

const graph = readJson('packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json');
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
if (!graph.manifest?.id || !projection.initialState) {
  at('setup', 'graph and projection must load');
}

const { fixture: hesperusFixture, turn: hesperusTurn } = buildTurn('tests/fixtures/mission/prelude-hesperus-fraud-director-loop.fixture.json');
const { turn: refusalTurn } = buildTurn('tests/fixtures/mission/prelude-leave-mission-area-director-loop.fixture.json');

const initialState = stateForFixture(projection, hesperusFixture);
const initialSnapshot = stable(initialState);
const committed = commitDirectorTurn(initialState, hesperusTurn);

requireEqual(stable(initialState), initialSnapshot, 'commit immutability');
requireEqual(committed.mission.activePhaseId, 'hesperus-aftermath', 'commit mission.activePhaseId');
requireIncludes(committed.mission.knownFacts, 'hesperus.inspection-fraud', 'commit mission.knownFacts');
requireEqual(outcomeFlagValue(committed, 'prelude.command-decision-hesperus-fraud'), 'resolve-awarded', 'commit command decision flag');
requireEqual(clockValue(committed, 'arrival-schedule-margin'), 1, 'commit arrival-schedule-margin');
requireEqual(clockValue(committed, 'hesperus-medical-risk'), 0, 'commit hesperus-medical-risk');
requireIncludes(committed.commandStyle.resolve.awardedDecisionIds, 'command.hesperus-fraud-accountability', 'commit resolve.awardedDecisionIds');
requireEqual(committed.commandStyle.resolve.marks, 1, 'commit resolve.marks');
requireIncludes(
  (committed.relationships.memoryLedger || []).map((entry) => entry.crewId),
  'imani-cross',
  'commit relationship memory ledger'
);
requireEqual(committed.commandLog.entries.at(-1).sourceOutcomeId, hesperusTurn.outcomePacket.id, 'commit commandLog source');
requireEqual(committed.turnLedger.entries.length, 1, 'commit ledger length');
requireEqual(stable(committed.turnLedger.entries[0].snapshotBefore), initialSnapshot, 'commit snapshotBefore');

const legacyCommandLogState = cloneJson(initialState);
legacyCommandLogState.commandLog = [
  {
    turnId: 'legacy.turn',
    classification: 'consequentialCommand',
    playerText: 'Legacy visible order.',
    resultBand: 'Partial Success',
    visibleConsequences: ['Legacy visible consequence.']
  },
  {
    turnId: 'legacy.routine',
    classification: 'routineCommand',
    order: 'Pursue freighter while maintaining passive sensor coverage on convoy',
    summaryInputs: [],
    visibleConsequences: []
  },
  {
    turnId: 'legacy.open-world',
    classification: 'consequentialCommand',
    action: 'Stabilize the transfer corridor',
    consequences: ['Engineering begins transfer-corridor stabilization.'],
    summaryInputs: [],
    visibleConsequences: []
  }
];
const normalizedCommandLogCommit = commitDirectorTurn(legacyCommandLogState, hesperusTurn);
requireEqual(Array.isArray(normalizedCommandLogCommit.commandLog), false, 'legacy commandLog normalized owner');
requireEqual(normalizedCommandLogCommit.commandLog.entries.length, 4, 'legacy commandLog preserves and appends entries');
requireEqual(normalizedCommandLogCommit.commandLog.entries[0].summaryInputs, ['Legacy visible order.'], 'legacy commandLog summaryInputs normalized');
requireEqual(normalizedCommandLogCommit.commandLog.entries[1].summaryInputs, ['Pursue freighter while maintaining passive sensor coverage on convoy'], 'legacy commandLog empty summaryInputs fall back to order');
requireEqual(normalizedCommandLogCommit.commandLog.entries[2].summaryInputs, ['Stabilize the transfer corridor'], 'legacy commandLog empty summaryInputs fall back to action');
requireEqual(normalizedCommandLogCommit.commandLog.entries[2].visibleConsequences, ['Engineering begins transfer-corridor stabilization.'], 'legacy commandLog visibleConsequences fall back to consequences');
requireEqual(normalizedCommandLogCommit.commandLog.entries.at(-1).sourceOutcomeId, hesperusTurn.outcomePacket.id, 'legacy commandLog appended committed source');

const mechanicalStateBeforeSwipe = {
  mission: committed.mission,
  clocks: clockLedger(committed),
  commandStyle: committed.commandStyle,
  relationships: committed.relationships,
  commandLog: committed.commandLog
};
const swiped = recordNarrationSwipe(committed, hesperusTurn.outcomePacket.id, {
  ...hesperusTurn.narratorPacket,
  constraints: [...hesperusTurn.narratorPacket.constraints, 'Swipe rewrite only; preserve committed state.']
});
const mechanicalStateAfterSwipe = {
  mission: swiped.mission,
  clocks: clockLedger(swiped),
  commandStyle: swiped.commandStyle,
  relationships: swiped.relationships,
  commandLog: swiped.commandLog
};
requireEqual(mechanicalStateAfterSwipe, mechanicalStateBeforeSwipe, 'swipe preserves committed mechanics');
requireEqual(swiped.turnLedger.entries[0].narrationRevisions.length, 1, 'swipe narration revision count');

const narrated = recordNarrationSuccess(committed, hesperusTurn.outcomePacket.id, {
  sourceOutcomeId: hesperusTurn.outcomePacket.id,
  providerId: 'test-provider',
  generatedAt: '2026-06-18T23:30:00.000Z',
  text: 'The Breckenridge takes the delay and protects the passengers.'
});
requireEqual(narrated.turnLedger.entries[0].narrationStatus, 'complete', 'narration success status');
requireEqual(narrated.turnLedger.entries[0].narration.text, 'The Breckenridge takes the delay and protects the passengers.', 'narration success text');
requireEqual(narrated.turnLedger.lastNarratedOutcomeId, hesperusTurn.outcomePacket.id, 'narration success last outcome');

const failedNarration = recordNarrationFailure(committed, hesperusTurn.outcomePacket.id, {
  providerId: 'test-provider',
  failedAt: '2026-06-18T23:31:00.000Z',
  message: 'provider unavailable'
});
requireEqual(failedNarration.turnLedger.entries[0].narrationStatus, 'failed', 'narration failure status');
requireEqual(failedNarration.turnLedger.entries[0].narrationFailures.length, 1, 'narration failure count');
requireEqual(failedNarration.turnLedger.pendingNarrationRecovery.outcomeId, hesperusTurn.outcomePacket.id, 'narration failure pending recovery');
requireEqual(failedNarration.turnLedger.lastCommittedOutcomeId, committed.turnLedger.lastCommittedOutcomeId, 'narration failure preserves committed outcome');

const edited = editCommittedOutcome(swiped, hesperusTurn.outcomePacket.id, refusalTurn);
requireEqual(edited.mission.activePhaseId, 'hesperus-diversion', 'edit restores original phase before replacement');
requireEqual(outcomeFlagValue(edited, 'prelude.command-decision-hesperus-fraud'), 'unawarded', 'edit removes original command decision flag');
requireEqual((edited.commandStyle.resolve.awardedDecisionIds || []).length, 0, 'edit removes original command decision award');
requireEqual(edited.turnLedger.entries.length, 1, 'edit replacement ledger length');
requireEqual(edited.turnLedger.entries[0].outcomeId, refusalTurn.outcomePacket.id, 'edit replacement outcome');

const deleted = deleteCommittedOutcome(swiped, hesperusTurn.outcomePacket.id);
requireEqual(stable(deleted), initialSnapshot, 'delete restores pre-outcome snapshot');

const auditHeavyState = cloneJson(initialState);
auditHeavyState.runtimeTracking = {
  ...(auditHeavyState.runtimeTracking || {}),
  history: [{ revision: 1, snapshot: cloneJson(committed) }],
  historyIndex: 0,
  ingressLedger: [{ id: 'ingress-heavy' }],
  responseLedger: [{ id: 'response-heavy' }],
  recoveryJournal: [{ id: 'recovery-heavy' }],
  sidecarJournal: [{ id: 'sidecar-heavy' }],
  modelCallJournal: [{ id: 'model-heavy' }],
  pendingInteractions: [{ id: 'interaction-heavy' }],
  activeIngressId: 'ingress-heavy',
  sceneReconciliation: {
    schemaVersion: 2,
    markers: { start: null, end: null },
    runs: [{ id: 'run-heavy' }],
    pending: [{ id: 'pending-heavy' }],
    applied: [{ id: 'applied-heavy' }],
    rejected: [{ id: 'rejected-heavy' }],
    recalculationPreviews: [{ id: 'preview-heavy' }],
    chunkCache: [{ id: 'chunk-heavy' }],
    invalidations: [{ id: 'invalidation-heavy' }]
  }
};
const auditHeavyCommit = commitDirectorTurn(auditHeavyState, hesperusTurn);
const auditSnapshot = auditHeavyCommit.turnLedger.entries.at(-1).snapshotBefore;
requireEqual(auditSnapshot.runtimeTracking.history.length, 0, 'snapshot strips runtime history');
requireEqual(auditSnapshot.runtimeTracking.ingressLedger.length, 0, 'snapshot strips ingress ledger');
requireEqual(auditSnapshot.runtimeTracking.responseLedger.length, 0, 'snapshot strips response ledger');
requireEqual(auditSnapshot.runtimeTracking.sidecarJournal.length, 0, 'snapshot strips sidecar journal');
requireEqual(auditSnapshot.runtimeTracking.modelCallJournal.length, 0, 'snapshot strips model-call journal');
requireEqual(auditSnapshot.runtimeTracking.pendingInteractions.length, 0, 'snapshot strips pending interactions');
requireEqual(auditSnapshot.runtimeTracking.activeIngressId, null, 'snapshot clears active ingress');
requireEqual(auditSnapshot.runtimeTracking.sceneReconciliation.runs.length, 0, 'snapshot strips reconciliation runs');

let cappedHistoryState = cloneJson(initialState);
cappedHistoryState.settings = {
  ...(cappedHistoryState.settings || {}),
  maxTurnSaveHistory: 2
};
for (let index = 1; index <= 5; index += 1) {
  const turn = cloneJson(hesperusTurn);
  turn.turnId = `turn.history-cap.${index}`;
  turn.outcomePacket.id = `outcome.history-cap.${index}`;
  turn.narratorPacket.sourceOutcomeId = turn.outcomePacket.id;
  turn.commandLogPacket.sourceOutcomeId = turn.outcomePacket.id;
  cappedHistoryState = commitDirectorTurn(cappedHistoryState, turn);
}
requireEqual(cappedHistoryState.turnLedger.entries.length, 5, 'history cap keeps ledger entries');
requireEqual(cappedHistoryState.turnLedger.snapshotRetentionLimit, 2, 'history cap records retention limit');
requireEqual(cappedHistoryState.turnLedger.fullPacketRetentionLimit, 2, 'history cap records full packet retention limit');
requireEqual(cappedHistoryState.turnLedger.entries[0].snapshotBefore, null, 'history cap prunes oldest snapshot');
requireEqual(cappedHistoryState.turnLedger.entries[2].snapshotBefore, null, 'history cap prunes snapshots outside window');
requireEqual(cappedHistoryState.turnLedger.entries[2].stateDelta, undefined, 'history cap compacts old active turn packets');
requireEqual(Boolean(cappedHistoryState.turnLedger.entries[3].snapshotBefore), true, 'history cap retains penultimate snapshot');
requireEqual(Boolean(cappedHistoryState.turnLedger.entries[4].snapshotBefore), true, 'history cap retains latest snapshot');
requireEqual(Boolean(cappedHistoryState.turnLedger.entries[3].stateDelta), true, 'history cap retains penultimate full turn packet');
requireEqual(Boolean(cappedHistoryState.turnLedger.entries[4].stateDelta), true, 'history cap keeps active ledger turn packet');
requireEqual(
  cappedHistoryState.turnLedger.entries[4].snapshotBefore.turnLedger.entries[0].stateDelta,
  undefined,
  'history cap compacts nested snapshot ledger packets'
);
requireThrows(
  () => deleteCommittedOutcome(cappedHistoryState, 'outcome.history-cap.1'),
  /snapshot is no longer retained/,
  'history cap delete expired outcome'
);
requireThrows(
  () => editCommittedOutcome(cappedHistoryState, 'outcome.history-cap.1', refusalTurn),
  /snapshot is no longer retained/,
  'history cap edit expired outcome'
);

const restored = restoreCampaignSnapshot(initialState);
restored.mission.knownFacts.push('mutation.test');
if (initialState.mission.knownFacts.includes('mutation.test')) {
  at('restore clone isolation', 'restored snapshot must not share arrays with source');
}

if (errors.length > 0) {
  console.error('Transaction state test failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Transaction state tests passed: commit, swipe, edit, delete, restore');
