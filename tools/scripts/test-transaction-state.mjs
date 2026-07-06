import assert from 'node:assert/strict';
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
  state.commandBearing = cloneJson(fixture.input.campaignState.commandBearing);
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
requireIncludes(committed.commandBearing.resolve.awardedDecisionIds, 'command.hesperus-fraud-accountability', 'commit resolve.awardedDecisionIds');
requireEqual(committed.commandBearing.resolve.marks, 1, 'commit resolve.marks');
requireIncludes(committed.commandBearing.tracks.resolve.awardedSourceIds, 'command.hesperus-fraud-accountability', 'commit commandBearing resolve.awardedSourceIds');
requireEqual(committed.commandBearing.tracks.resolve.marks, 1, 'commit commandBearing resolve.marks');
requireEqual(committed.commandBearing.evidenceLedger.records.length, 0, 'commit commandBearing evidence ledger initialized');
requireEqual(committed.commandBearing.reviewLedger.records.length, 0, 'commit commandBearing review ledger initialized');
requireIncludes(
  (committed.relationships.memoryLedger || []).map((entry) => entry.crewId),
  'imani-cross',
  'commit relationship memory ledger'
);
requireEqual(committed.commandLog.entries.at(-1).sourceOutcomeId, hesperusTurn.outcomePacket.id, 'commit commandLog source');
requireEqual(committed.turnLedger.entries.length, 1, 'commit ledger length');
requireEqual(committed.turnLedger.entries[0].snapshotBeforeRetained, false, 'commit does not claim retained snapshot without CORE checkpoint');
requireEqual(
  Object.prototype.hasOwnProperty.call(committed.turnLedger.entries[0], 'snapshotBefore'),
  false,
  'commit does not store raw snapshotBefore in turn ledger'
);

const bearingReviewTurn = cloneJson(refusalTurn);
bearingReviewTurn.outcomePacket.id = 'outcome.command-bearing.review.fixture';
bearingReviewTurn.stateDelta.outcomeId = bearingReviewTurn.outcomePacket.id;
bearingReviewTurn.narratorPacket.sourceOutcomeId = bearingReviewTurn.outcomePacket.id;
bearingReviewTurn.commandLogPacket.sourceOutcomeId = bearingReviewTurn.outcomePacket.id;
bearingReviewTurn.stateDelta.commandBearing = {};
bearingReviewTurn.stateDelta.commandBearing = {
  evidenceRecordsAdd: [{
    id: 'bearing-evidence.fixture.001',
    sourceOutcomeId: bearingReviewTurn.outcomePacket.id,
    sourceTurnId: bearingReviewTurn.turnId,
    threadId: 'thread.fixture.command-bearing',
    primarySignal: 'resolve',
    trackSignals: ['resolve'],
    strength: 'strong',
    criteria: { agency: true, commitment: true, causality: true },
    actionSummary: 'Held the line during the fixture review.',
    consequenceSummary: 'The ship accepted a cost but preserved the operational boundary.',
    playerFacingSummary: 'This showed Resolve through credible boundaries and accepted responsibility.',
    visible: true,
    status: 'open'
  }],
  reviewRecordsAdd: [{
    id: 'bearing-review.fixture.001',
    closureId: 'closure.thread.fixture.command-bearing.1',
    sourceOutcomeId: bearingReviewTurn.outcomePacket.id,
    markAwarded: true,
    awardedTrack: 'resolve',
    evidenceIds: ['bearing-evidence.fixture.001'],
    criteriaSatisfied: { agency: true, commitment: true, causality: true },
    awardSummary: 'The commander repeatedly held a credible operational boundary.'
  }]
};
bearingReviewTurn.stateDelta.relationships = {
  ...(bearingReviewTurn.stateDelta.relationships || {}),
  perceptionRecordsAdd: [{
    id: 'relationship-perception.fixture.001',
    crewId: 'jalen-orr',
    playerFacingImpact: 'Slight Improvement',
    perceivedByCharacter: {
      clarity: 'clear',
      cue: 'Jalen stopped pressing once the accountable boundary was named.',
      summary: 'The player character can perceive Jalen treating the decision as more grounded.'
    },
    sourceOutcomeId: bearingReviewTurn.outcomePacket.id,
    visible: true
  }]
};
const bearingReviewInitialState = cloneJson(initialState);
bearingReviewInitialState.threadLedger = bearingReviewInitialState.threadLedger || { schemaVersion: 2, records: [] };
bearingReviewInitialState.threadLedger.records = [
  ...(bearingReviewInitialState.threadLedger.records || []),
  {
    id: 'thread.fixture.command-bearing',
    status: 'resolved',
    playerSummary: 'The fixture thread reached a visible command-bearing closure.'
  }
];
const bearingReviewed = commitDirectorTurn(bearingReviewInitialState, bearingReviewTurn);
requireEqual(bearingReviewed.commandBearing.evidenceLedger.records.length, 1, 'commandBearing evidence record committed');
requireIncludes(
  bearingReviewed.commandBearing.evidenceLedger.byThreadId['thread.fixture.command-bearing'],
  'bearing-evidence.fixture.001',
  'commandBearing evidence indexed by thread'
);
requireEqual(bearingReviewed.commandBearing.reviewLedger.records.length, 1, 'commandBearing review record committed');
requireEqual(bearingReviewed.commandBearing.reviewLedger.reviewedClosureIds['closure.thread.fixture.command-bearing.1'], true, 'commandBearing closure reviewed');
requireEqual(bearingReviewed.commandBearing.tracks.resolve.marks, 1, 'commandBearing review applies mark');
requireIncludes(
  bearingReviewed.commandBearing.tracks.resolve.awardedSourceIds,
  'closure.thread.fixture.command-bearing.1',
  'commandBearing review award source tracked'
);
requireEqual(bearingReviewed.relationships.perceptionLedger.length, 1, 'relationship perception committed');
requireEqual(
  bearingReviewed.relationships.perceptionLedger[0].perceivedByCharacter.summary,
  'The player character can perceive Jalen treating the decision as more grounded.',
  'relationship perception summary committed'
);

const invalidBearingReviewTurn = cloneJson(bearingReviewTurn);
invalidBearingReviewTurn.stateDelta.commandBearing.reviewRecordsAdd[0].evidenceIds = ['bearing-evidence.fixture.missing'];
assert.throws(
  () => commitDirectorTurn(bearingReviewInitialState, invalidBearingReviewTurn),
  /Command Bearing review delta failed deterministic validation/,
  'unsupported review evidence must not award a Mark'
);

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
  commandBearing: committed.commandBearing,
  commandBearing: committed.commandBearing,
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
  commandBearing: swiped.commandBearing,
  commandBearing: swiped.commandBearing,
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

const narrationContinuityInput = cloneJson(committed);
narrationContinuityInput.continuity = {
  ...(narrationContinuityInput.continuity || {}),
  candidateClaims: [],
  rejectedClaims: [],
  projectionHints: [],
  factUseStats: {}
};
const narrationContinuityReviewed = recordNarrationSuccess(narrationContinuityInput, hesperusTurn.outcomePacket.id, {
  sourceOutcomeId: hesperusTurn.outcomePacket.id,
  providerId: 'test-provider',
  generatedAt: '2026-06-18T23:30:30.000Z',
  text: 'The Breckenridge states a continuity-sensitive rejected claim.',
  continuityReview: {
    ok: false,
    findings: [{
      factId: 'fact.narration-old-continuity-blocked',
      severity: 'critical',
      explanation: 'Old continuity roots must not be updated from narration commit.'
    }]
  }
});
requireEqual(
  narrationContinuityReviewed.continuity,
  narrationContinuityInput.continuity,
  'narration success must not write old continuity candidate/rejected/hint/fact-use roots'
);

const failedNarration = recordNarrationFailure(committed, hesperusTurn.outcomePacket.id, {
  providerId: 'test-provider',
  failedAt: '2026-06-18T23:31:00.000Z',
  message: 'provider unavailable'
});
requireEqual(failedNarration.turnLedger.entries[0].narrationStatus, 'failed', 'narration failure status');
requireEqual(failedNarration.turnLedger.entries[0].narrationFailures.length, 1, 'narration failure count');
requireEqual(failedNarration.turnLedger.pendingNarrationRecovery.outcomeId, hesperusTurn.outcomePacket.id, 'narration failure pending recovery');
requireEqual(failedNarration.turnLedger.lastCommittedOutcomeId, committed.turnLedger.lastCommittedOutcomeId, 'narration failure preserves committed outcome');

requireThrows(
  () => editCommittedOutcome(swiped, hesperusTurn.outcomePacket.id, refusalTurn),
  /CORE checkpoint/i,
  'edit requires CORE checkpoint path'
);
requireThrows(
  () => deleteCommittedOutcome(swiped, hesperusTurn.outcomePacket.id),
  /CORE checkpoint/i,
  'delete requires CORE checkpoint path'
);

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
const auditEntry = auditHeavyCommit.turnLedger.entries.at(-1);
requireEqual(auditEntry.snapshotBeforeRetained, false, 'audit-heavy commit does not claim retained snapshot without CORE checkpoint');
requireEqual(
  Object.prototype.hasOwnProperty.call(auditEntry, 'snapshotBefore'),
  false,
  'audit-heavy commit does not store raw snapshotBefore'
);
requireEqual(
  stable(auditHeavyCommit.turnLedger).includes('ingress-heavy'),
  false,
  'turn ledger must not retain old ingress ledger through raw snapshot'
);
requireEqual(
  stable(auditHeavyCommit.turnLedger).includes('recovery-heavy'),
  false,
  'turn ledger must not retain old recovery ledger through raw snapshot'
);

const rejectedOpenWorldTurn = cloneJson(hesperusTurn);
rejectedOpenWorldTurn.turnId = 'turn.open-world.roots-set.rejected';
rejectedOpenWorldTurn.outcomePacket.id = 'outcome.open-world.roots-set.rejected';
rejectedOpenWorldTurn.stateDelta.outcomeId = rejectedOpenWorldTurn.outcomePacket.id;
rejectedOpenWorldTurn.narratorPacket.sourceOutcomeId = rejectedOpenWorldTurn.outcomePacket.id;
rejectedOpenWorldTurn.commandLogPacket.sourceOutcomeId = rejectedOpenWorldTurn.outcomePacket.id;
rejectedOpenWorldTurn.stateDelta.openWorld = {
  ...(rejectedOpenWorldTurn.stateDelta.openWorld || {}),
  rootsSet: {
    runtimeTracking: cloneJson(auditHeavyState.runtimeTracking)
  }
};
requireThrows(
  () => commitDirectorTurn(initialState, rejectedOpenWorldTurn),
  /rootsSet replacement is no longer supported/,
  'open-world rootsSet replacement is rejected'
);

const retainedPacketMigrationState = cloneJson(initialState);
retainedPacketMigrationState.turnLedger = {
  ...(retainedPacketMigrationState.turnLedger || {}),
  entries: [
    {
      turnId: 'turn.open-world.runtime-tracking.legacy-retained',
      outcomeId: 'outcome.open-world.runtime-tracking.legacy-retained',
      stateDelta: {
        openWorld: {
          rootsSet: {
            runtimeTracking: cloneJson(auditHeavyState.runtimeTracking)
          }
        }
      },
      snapshotBefore: cloneJson(initialState),
      narrationStatus: 'pending',
      narration: null,
      narrationFailures: [],
      narrationRevisions: []
    }
  ]
};
const retainedPacketMigrationTurn = cloneJson(refusalTurn);
retainedPacketMigrationTurn.turnId = 'turn.open-world.runtime-tracking.retained-migration';
retainedPacketMigrationTurn.outcomePacket.id = 'outcome.open-world.runtime-tracking.retained-migration';
retainedPacketMigrationTurn.stateDelta.outcomeId = retainedPacketMigrationTurn.outcomePacket.id;
retainedPacketMigrationTurn.narratorPacket.sourceOutcomeId = retainedPacketMigrationTurn.outcomePacket.id;
retainedPacketMigrationTurn.commandLogPacket.sourceOutcomeId = retainedPacketMigrationTurn.outcomePacket.id;
const retainedPacketMigrationCommit = commitDirectorTurn(retainedPacketMigrationState, retainedPacketMigrationTurn);
const migratedRetainedRuntimeTracking =
  retainedPacketMigrationCommit.turnLedger.entries[0].stateDelta.openWorld.rootsSet.runtimeTracking;
requireEqual(migratedRetainedRuntimeTracking.history.length, 0, 'prune sanitizes existing retained open-world runtime history');
requireEqual(
  migratedRetainedRuntimeTracking.modelCallJournal.length,
  0,
  'prune sanitizes existing retained open-world model-call journal'
);

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
requireEqual(
  Object.prototype.hasOwnProperty.call(cappedHistoryState.turnLedger.entries[0], 'snapshotBefore'),
  false,
  'history cap has no oldest raw snapshot'
);
requireEqual(
  Object.prototype.hasOwnProperty.call(cappedHistoryState.turnLedger.entries[2], 'snapshotBefore'),
  false,
  'history cap has no raw snapshot outside window'
);
requireEqual(cappedHistoryState.turnLedger.entries[2].stateDelta, undefined, 'history cap compacts old active turn packets');
requireEqual(cappedHistoryState.turnLedger.entries[3].snapshotBeforeRetained, false, 'history cap does not retain penultimate raw snapshot');
requireEqual(cappedHistoryState.turnLedger.entries[4].snapshotBeforeRetained, false, 'history cap does not retain latest raw snapshot');
requireEqual(Boolean(cappedHistoryState.turnLedger.entries[3].stateDelta), true, 'history cap retains penultimate full turn packet');
requireEqual(Boolean(cappedHistoryState.turnLedger.entries[4].stateDelta), true, 'history cap keeps active ledger turn packet');
requireEqual(
  stable(cappedHistoryState.turnLedger).includes('"snapshotBefore"'),
  false,
  'history cap does not retain nested raw snapshots'
);
requireThrows(
  () => deleteCommittedOutcome(cappedHistoryState, 'outcome.history-cap.1'),
  /CORE checkpoint/i,
  'history cap delete expired outcome'
);
requireThrows(
  () => editCommittedOutcome(cappedHistoryState, 'outcome.history-cap.1', refusalTurn),
  /CORE checkpoint/i,
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
