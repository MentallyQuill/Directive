import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  commitV1DirectorCustodyTurn,
  createV1DirectorCustodyTurnPacket
} from '../../src/campaign/transaction-state.mjs';
import { commitProvisionalDirectorTurnRuntime } from '../../src/runtime/director-turn-runtime.mjs';

const semanticRoots = [
  'campaign',
  'ship',
  'mission',
  'worldState',
  'storyArcLedger',
  'questLedger',
  'dynamicQuestCatalog',
  'knowledgeLedger',
  'threadLedger',
  'eventLedger',
  'attentionState',
  'pressureLedger',
  'relationships',
  'commandCulture',
  'commandAuthority',
  'commandBearing',
  'commandCompetence',
  'values',
  'captainState'
];

const before = {
  campaign: { id: 'campaign-v1', currentStardate: 49001.2 },
  ship: { operationalCondition: { summary: 'Ready' }, technicalDebt: [] },
  mission: { activeMissionGraphId: 'mission.v1', v1: { runId: 'run-1' } },
  worldState: { clocks: { old: 1 }, actors: {}, fronts: {} },
  storyArcLedger: { arcs: [] },
  questLedger: { quests: [] },
  dynamicQuestCatalog: { quests: [] },
  knowledgeLedger: { records: [] },
  threadLedger: { threads: [] },
  eventLedger: { events: [] },
  attentionState: { records: [] },
  pressureLedger: { records: [] },
  relationships: { descriptiveLog: [], perceptionLedger: [], memoryLedger: [] },
  commandCulture: { records: [] },
  commandAuthority: { records: [] },
  commandBearing: { reserve: 1 },
  commandCompetence: { records: [] },
  values: { records: [] },
  captainState: { posture: 'watchful' },
  commandLog: { entries: [] },
  turnLedger: { entries: [], swipeRerollForbidden: true }
};

const proposedTurnPacket = {
  turnId: 'turn-v1-1',
  outcomePacket: {
    id: 'outcome-v1-1',
    resultBand: 'Partial Success',
    summary: 'The provisional Director proposes several legacy mutations.',
    commandDecisionAwards: [{ track: 'resolve', id: 'legacy-award' }]
  },
  stateDelta: {
    mission: { setFlags: [{ id: 'legacyMissionFlag', value: true }] },
    clocks: [{ id: 'old', delta: 4 }],
    commandBearing: { earnedDecisionIds: ['legacy-award'] },
    commandCulture: { recordsAdd: [{ id: 'legacy-culture' }] },
    relationships: {
      affectedCrewIds: ['mara-whitaker'],
      descriptiveChanges: [{ id: 'legacy-relationship' }]
    },
    pressureLedger: { upsertRecords: [{ id: 'legacy-pressure', title: 'Flickering light' }] },
    terminalState: { shipPatch: { status: 'damaged' } },
    actors: { upsertPostures: [{ id: 'legacy-actor' }] },
    fronts: { upsertRecords: [{ id: 'legacy-front' }] },
    openWorld: {
      modelStoryDeltaPlan: {
        eventDrafts: [{ id: 'legacy-event', summary: 'A small mention becomes an event.' }]
      }
    }
  },
  competencePacket: { kind: 'directive.commandCompetencePacket', records: [{ id: 'legacy-competence' }] },
  provenance: { sourceFrameRef: { id: 'frame-1' } },
  sceneSnapshot: { presentCharacters: ['player-commander', 'mara-whitaker'] },
  narratorPacket: { sourceOutcomeId: 'outcome-v1-1' },
  commandLogPacket: {
    sourceOutcomeId: 'outcome-v1-1',
    summaryInputs: ['The player issued a cautious order.'],
    visibleConsequences: ['Whitaker acknowledges the order.']
  }
};

const custodyPacket = createV1DirectorCustodyTurnPacket(proposedTurnPacket);
assert.deepEqual(custodyPacket.stateDelta, {});
assert.equal(custodyPacket.competencePacket, null);
assert.deepEqual(custodyPacket.outcomePacket.commandDecisionAwards, []);
assert.equal(custodyPacket.semanticAuthority, 'storySettlement');
assert.equal(custodyPacket.semanticStateDeltaApplied, false);
assert.deepEqual(proposedTurnPacket.stateDelta.mission, {
  setFlags: [{ id: 'legacyMissionFlag', value: true }]
}, 'Custody sanitization must not mutate the narration packet.');

const committed = commitV1DirectorCustodyTurn(before, custodyPacket);
for (const root of semanticRoots) {
  assert.deepEqual(committed[root], before[root], `V1 custody commit must preserve ${root}.`);
}
assert.equal(committed.commandLog.entries.length, 1);
assert.deepEqual(committed.commandLog.entries[0].visibleConsequences, ['Whitaker acknowledges the order.']);
assert.equal(committed.turnLedger.entries.length, 1);
assert.equal(committed.turnLedger.entries[0].semanticAuthority, 'storySettlement');
assert.equal(committed.turnLedger.entries[0].semanticStateDeltaApplied, false);
assert.equal(committed.turnLedger.entries[0].stateDelta, undefined);
assert.equal(committed.turnLedger.entries[0].competencePacket, null);

const runtimeCommit = commitProvisionalDirectorTurnRuntime({
  campaignState: before,
  turnPacket: proposedTurnPacket
});
for (const root of semanticRoots) {
  assert.deepEqual(runtimeCommit.campaignState[root], before[root], `V1 runtime commit must preserve ${root}.`);
}
assert.equal(runtimeCommit.mechanicsTurnPacket.semanticStateDeltaApplied, false);
assert.deepEqual(runtimeCommit.mechanicsTurnPacket.stateDelta, {});
assert.deepEqual(runtimeCommit.turnPacket.stateDelta, proposedTurnPacket.stateDelta,
  'The narrator may consume the provisional proposal without granting it state authority.');

const orchestratorSource = fs.readFileSync('src/runtime/chat-turn-orchestrator.mjs', 'utf8');
for (const forbidden of [
  'settleSceneHandshake(',
  'createLatestPairSourceSettlementProvider',
  'settleLatestPairSource',
  'scheduleTurnSidecars',
  'scheduleScenePhaseSealForCommittedTurn',
  'schedulePressureArcDigestForCommittedTurn',
  'scheduleOpenWorldBoundaryForCommittedTurn',
  'schedulePostCommitConversationProcessor',
  'postCommitConversationProcessor',
  'scheduleAdvisoryEnrichmentProcessor'
]) {
  assert.equal(orchestratorSource.includes(forbidden), false,
    `V1-only orchestrator must not retain ${forbidden}.`);
}

const runtimeAppSource = fs.readFileSync('src/runtime/runtime-app.mjs', 'utf8');
assert.match(runtimeAppSource, /turnPacket: result\.mechanicsTurnPacket \|\| result\.turnPacket/,
  'CORE must receive the sanitized V1 custody packet rather than provisional semantic deltas.');
assert.equal(runtimeAppSource.includes("semanticAuthority.mode === 'legacy'"), false,
  'The production runtime must not retain an alternate terminal-evaluation branch.');

const directorRuntimeSource = fs.readFileSync('src/runtime/director-turn-runtime.mjs', 'utf8');
assert.equal(directorRuntimeSource.includes('commitDirectorTurn('), false,
  'The production Director runtime must only commit the V1 custody envelope.');

console.log('V1 semantic writer gate tests passed.');
