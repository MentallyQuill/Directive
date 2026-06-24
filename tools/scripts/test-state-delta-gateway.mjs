import assert from 'node:assert/strict';

import {
  createCampaignStateSnapshot,
  createStateDeltaGateway,
  initializeCampaignRuntimeTracking,
  recordModelCallEvent,
  recordTurnIngress,
  updateTurnIngress
} from '../../src/runtime/state-delta-gateway.mjs';

let state = initializeCampaignRuntimeTracking({
  campaign: { id: 'campaign-state-gateway', status: 'active' },
  mission: { knownFacts: [] },
  ship: { damage: [], condition: 'Operational' },
  crew: { casualties: [] },
  commandLog: { entries: [] }
}, { historyLimit: 6 });
const persisted = [];
const gateway = createStateDeltaGateway({
  getState: () => state,
  setState: (next) => { state = next; },
  persist: async (next, delta) => persisted.push({ revision: next.runtimeTracking.revision, delta }),
  now: (() => {
    let index = 0;
    return () => `2026-06-22T00:00:0${index++}.000Z`;
  })()
});

state = recordTurnIngress(state, {
  id: 'ingress:one',
  hostMessageId: 'message-1',
  chatId: 'chat-1',
  campaignId: 'campaign-state-gateway',
  textHash: 'abc123',
  textPreview: 'Preserve telemetry.'
});
state = updateTurnIngress(state, 'ingress:one', {
  status: 'invalidated',
  invalidatedAt: '2026-06-22T00:00:00.500Z',
  invalidationType: 'playerMessageDeleted',
  replacementText: null
});
state = recordTurnIngress(state, {
  id: 'ingress:one',
  hostMessageId: 'message-1',
  chatId: 'chat-1',
  campaignId: 'campaign-state-gateway',
  textHash: 'abc123',
  textPreview: 'Preserve telemetry.',
  status: 'classifying'
});
assert.equal(state.runtimeTracking.ingressLedger[0].status, 'classifying');
assert.equal(state.runtimeTracking.ingressLedger[0].invalidationType, null);
assert.equal(state.runtimeTracking.ingressLedger[0].invalidatedAt, null);

const first = await gateway.applyOperations({
  id: 'proposal-1',
  workerId: 'ship',
  baseRevision: 0,
  operations: [
    { op: 'append', path: 'ship.damage', value: { id: 'sensor-pallet', summary: 'Sensor pallet degraded.' } },
    { op: 'set', path: 'ship.condition', value: 'Degraded but operational' }
  ],
  summary: 'Record visible sensor damage.'
}, { allowedRoots: ['ship'] });
assert.equal(first.applied, true);
assert.equal(first.revision, 1);
assert.equal(state.ship.damage.length, 1);
assert.equal(state.runtimeTracking.ingressLedger[0].id, 'ingress:one');
assert.equal(state.runtimeTracking.history.length, 1);
assert.equal(state.runtimeTracking.history[0].snapshot.ship.damage.length, 0);

const second = await gateway.applyOperations({
  id: 'proposal-2',
  workerId: 'continuity',
  baseRevision: 1,
  operations: [
    { op: 'append', path: 'mission.knownFacts', value: 'The port sensor pallet is degraded.' }
  ],
  summary: 'Expose the confirmed system condition.'
}, { allowedRoots: ['mission'] });
assert.equal(second.revision, 2);
assert.equal(state.mission.knownFacts.length, 1);
assert.equal(persisted.length, 2);

state = recordModelCallEvent(state, {
  id: 'model-call.fixture.utility',
  roleId: 'utilityTurnClassifier',
  providerKind: 'utility',
  status: 'ok',
  providerId: 'fixture-provider',
  requestHash: 'abc12345',
  latencyMs: 12
});
assert.equal(state.runtimeTracking.modelCallJournal.length, 1);
assert.equal(state.runtimeTracking.modelCallJournal[0].roleId, 'utilityTurnClassifier');
assert.equal(state.runtimeTracking.modelCallJournal[0].requestHash, 'abc12345');

await assert.rejects(
  gateway.applyOperations({
    baseRevision: 1,
    operations: [{ op: 'set', path: 'ship.condition', value: 'Destroyed' }]
  }, { allowedRoots: ['ship'] }),
  (error) => error.code === 'DIRECTIVE_STATE_REVISION_CONFLICT'
);

await assert.rejects(
  gateway.applyOperations({
    baseRevision: 2,
    operations: [{ op: 'set', path: 'relationships.seniorCrew', value: [] }]
  }, { allowedRoots: ['ship'] }),
  (error) => error.code === 'DIRECTIVE_STATE_ROOT_FORBIDDEN'
);

await assert.rejects(
  gateway.applyOperations({
    baseRevision: 2,
    operations: [{ op: 'set', path: 'ship.__proto__.polluted', value: true }]
  }, { allowedRoots: ['ship'] }),
  (error) => error.code === 'DIRECTIVE_STATE_PATH_FORBIDDEN'
);

await assert.rejects(
  gateway.applyOperations({
    baseRevision: 2,
    operations: [{ op: 'merge', path: 'mission.knownFacts', value: { 0: 'Array-like model output must not turn knownFacts into an object.' } }]
  }, { allowedRoots: ['mission'] }),
  (error) => error.code === 'DIRECTIVE_STATE_ARRAY_MERGE_FORBIDDEN'
);
assert.equal(Array.isArray(state.mission.knownFacts), true);

const restored = await gateway.restore(1, { reason: 'Restore before continuity update.' });
assert.equal(restored.runtimeTracking.revision, 1);
assert.equal(restored.ship.damage.length, 1);
assert.equal(restored.mission.knownFacts.length, 0);
assert.equal(restored.runtimeTracking.ingressLedger[0].id, 'ingress:one');
assert.equal(restored.runtimeTracking.modelCallJournal[0].id, 'model-call.fixture.utility');
assert.equal(restored.runtimeTracking.recoveryJournal.at(-1).type, 'restoreRevision');

const compactSnapshot = createCampaignStateSnapshot({
  campaign: { id: 'snapshot-compact' },
  turnLedger: {
    entries: [
      {
        turnId: 'turn-heavy',
        outcomeId: 'outcome-heavy',
        resultBand: 'Success',
        stateDelta: { mission: { knownFactsAdd: Array.from({ length: 20 }, (_, index) => `fact-${index}`) } },
        competencePacket: { hidden: 'not needed in history snapshots' },
        snapshotBefore: { campaign: { id: 'prior-heavy-state' } },
        narrationStatus: 'complete',
        narration: { sourceOutcomeId: 'outcome-heavy', providerId: 'fixture', generatedAt: '2026-06-22T00:00:00.000Z', text: 'Heavy narration text.' },
        narrationFailures: [{ message: 'old failure' }],
        narrationRevisions: [{ text: 'old revision' }]
      }
    ],
    lastCommittedOutcomeId: 'outcome-heavy'
  },
  runtimeTracking: {
    history: [{ snapshot: { heavy: true } }],
    ingressLedger: [{ id: 'ingress-heavy' }],
    modelCallJournal: [{ id: 'model-heavy' }]
  }
});
assert.equal(compactSnapshot.turnLedger.entries[0].stateDelta, undefined);
assert.equal(compactSnapshot.turnLedger.entries[0].competencePacket, undefined);
assert.equal(compactSnapshot.turnLedger.entries[0].snapshotBefore, null);
assert.equal(compactSnapshot.turnLedger.entries[0].narration?.text, undefined);
assert.equal(compactSnapshot.turnLedger.entries[0].narrationFailureCount, 1);
assert.equal(compactSnapshot.turnLedger.entries[0].narrationRevisionCount, 1);
assert.equal(compactSnapshot.runtimeTracking.history.length, 0);
assert.equal(compactSnapshot.runtimeTracking.modelCallJournal.length, 0);

console.log('State delta gateway tests passed: revision checks, root authorization, bounded snapshots, ingress preservation, and recovery');
