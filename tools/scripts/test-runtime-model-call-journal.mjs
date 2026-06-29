import assert from 'node:assert/strict';

import {
  createRuntimeModelCallJournal,
  gameplayStateFingerprint,
  maxModelCallEventSequence
} from '../../src/runtime/model-call-journal.mjs';
import { initializeCampaignRuntimeTracking } from '../../src/runtime/state-delta-gateway.mjs';

function trackedState(id = 'campaign-model-journal') {
  return initializeCampaignRuntimeTracking({
    campaign: { id, status: 'active' },
    mission: { knownFacts: [] },
    ship: { damage: [], condition: 'Operational' },
    crew: { casualties: [] },
    commandLog: { entries: [] }
  });
}

let state = null;
let tick = 0;
const service = createRuntimeModelCallJournal({
  now: () => `2026-06-26T00:00:0${tick++}.000Z`,
  getCampaignState: () => state,
  setCampaignState: (next) => {
    state = next;
  }
});

const pending = service.record({
  roleId: 'utilityTurnClassifier',
  providerKind: 'utility',
  requestHash: 'abc123'
});
assert.match(pending.id, /^model-call:1:utilityTurnClassifier$/);
assert.equal(state, null, 'recording without state should keep a pending event');

state = trackedState();
state = service.applyPending(state);
assert.equal(state.runtimeTracking.modelCallJournal.length, 1);
assert.equal(state.runtimeTracking.modelCallJournal[0].id, pending.id);
assert.equal(state.runtimeTracking.modelCallJournal[0].recordedAt, '2026-06-26T00:00:00.000Z');

const deduped = service.applyPending(state);
assert.equal(deduped.runtimeTracking.modelCallJournal.length, 1, 'pending replay deduplicates by id');

state.runtimeTracking.modelCallJournal.push({
  id: 'model-call:17:existing',
  roleId: 'existing',
  recordedAt: '2026-06-26T00:00:10.000Z'
});
assert.equal(maxModelCallEventSequence(state), 17);

const next = service.record({
  roleId: 'directiveAssist',
  providerKind: 'reasoning',
  requestHash: 'def456'
});
assert.match(next.id, /^model-call:18:directiveAssist$/);
assert.equal(state.runtimeTracking.modelCallJournal.at(-1).id, next.id);
assert.equal(state.runtimeTracking.modelCallJournal.at(-1).recordedAt, '2026-06-26T00:00:01.000Z');

const withDifferentJournal = {
  ...state,
  runtimeTracking: {
    ...state.runtimeTracking,
    modelCallJournal: [{ id: 'model-call:99:other' }]
  }
};
assert.equal(
  gameplayStateFingerprint(state),
  gameplayStateFingerprint(withDifferentJournal),
  'gameplay fingerprint ignores model-call journal churn'
);

const withGameplayChange = {
  ...state,
  ship: { ...state.ship, condition: 'Damaged' }
};
assert.notEqual(
  gameplayStateFingerprint(state),
  gameplayStateFingerprint(withGameplayChange),
  'gameplay fingerprint still detects actual state changes'
);

const coreDiagnostics = [];
const coreService = createRuntimeModelCallJournal({
  now: () => '2026-06-26T00:01:00.000Z',
  getCampaignState: () => trackedState('campaign-core-diagnostics'),
  setCampaignState() {},
  resolveCoreDiagnosticTarget: () => ({
    transactionId: 'txn:frame:ingress-core',
    ingressId: 'ingress-core',
    sourceFrameId: 'frame:ingress-core',
    hostMessageId: 'host-message-core'
  }),
  appendCoreDiagnostic: async (transactionId, event) => {
    coreDiagnostics.push({ transactionId, event });
  }
});

const coreEvent = coreService.record({
  roleId: 'utilityTurnClassifier',
  providerKind: 'utility',
  requestHash: 'core123',
  latencyMs: 42
});
await coreService.flushCoreDiagnostics();
assert.equal(coreDiagnostics.length, 1);
assert.equal(coreDiagnostics[0].transactionId, 'txn:frame:ingress-core');
assert.equal(coreDiagnostics[0].event.type, 'modelCall');
assert.equal(coreDiagnostics[0].event.modelCallId, coreEvent.id);
assert.equal(coreDiagnostics[0].event.requestHash, 'core123');
assert.equal(coreDiagnostics[0].event.hostMessageId, 'host-message-core');

const skippedDiagnostics = [];
const skipService = createRuntimeModelCallJournal({
  now: () => '2026-06-26T00:02:00.000Z',
  getCampaignState: () => trackedState('campaign-core-diagnostics-skip'),
  setCampaignState() {},
  resolveCoreDiagnosticTarget: () => null,
  appendCoreDiagnostic: async (transactionId, event) => {
    skippedDiagnostics.push({ transactionId, event });
  }
});
skipService.record({
  roleId: 'utilityTurnClassifier',
  providerKind: 'utility',
  requestHash: 'skip123'
});
await skipService.flushCoreDiagnostics();
assert.equal(skippedDiagnostics.length, 0, 'missing CORE transaction should skip diagnostic mirror');

let failureState = trackedState('campaign-core-diagnostics-failure');
const failingCoreService = createRuntimeModelCallJournal({
  now: () => '2026-06-26T00:03:00.000Z',
  getCampaignState: () => failureState,
  setCampaignState(next) {
    failureState = next;
  },
  resolveCoreDiagnosticTarget: () => ({
    transactionId: 'txn:frame:ingress-failure',
    ingressId: 'ingress-failure',
    sourceFrameId: 'frame:ingress-failure',
    hostMessageId: 'host-message-failure'
  }),
  appendCoreDiagnostic: async () => {
    throw new Error('simulated CORE diagnostics failure');
  }
});
const failingEvent = failingCoreService.record({
  roleId: 'utilityTurnClassifier',
  providerKind: 'utility',
  requestHash: 'failure123'
});
await failingCoreService.flushCoreDiagnostics();
assert.equal(failureState.runtimeTracking.modelCallJournal.at(-1).id, failingEvent.id);
assert.equal(
  failureState.runtimeTracking.modelCallJournal.at(-1).requestHash,
  'failure123',
  'CORE diagnostic failures must not suppress the legacy model-call journal'
);
