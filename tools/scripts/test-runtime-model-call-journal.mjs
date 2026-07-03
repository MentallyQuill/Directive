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

const projectedSequenceState = {
  ...trackedState('campaign-projected-model-calls'),
  directiveRuntimeEvidence: {
    coreStoreReadProjections: {
      modelCallDiagnostics: [{
        id: 'model-call:33:projected',
        roleId: 'projected',
        status: 'ok',
        requestHash: 'projected-hash'
      }]
    }
  }
};
assert.equal(maxModelCallEventSequence(projectedSequenceState), 33, 'CORE model-call diagnostics advance the resume sequence view.');

let projectedDedupeState = {
  ...trackedState('campaign-projected-dedupe'),
  directiveRuntimeEvidence: {
    coreStoreReadProjections: {
      modelCallDiagnostics: [{
        id: 'model-call:1:utilityTurnClassifier',
        roleId: 'utilityTurnClassifier',
        status: 'ok',
        requestHash: 'projected-dedupe-hash'
      }]
    }
  }
};
const projectedDedupeService = createRuntimeModelCallJournal({
  now: () => '2026-06-26T00:00:30.000Z',
  getCampaignState: () => null,
  setCampaignState: (next) => {
    projectedDedupeState = next;
  }
});
projectedDedupeService.record({
  roleId: 'utilityTurnClassifier',
  providerKind: 'utility',
  requestHash: 'projected-dedupe-hash'
});
projectedDedupeState = projectedDedupeService.applyPending(projectedDedupeState);
assert.equal(
  projectedDedupeState.runtimeTracking.modelCallJournal.length,
  0,
  'Pending legacy fallback replay must dedupe against CORE model-call diagnostics.'
);

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
let coreState = trackedState('campaign-core-diagnostics');
const coreService = createRuntimeModelCallJournal({
  now: () => '2026-06-26T00:01:00.000Z',
  getCampaignState: () => coreState,
  setCampaignState(next) {
    coreState = next;
  },
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
assert.equal(coreState.runtimeTracking.modelCallJournal.length, 0, 'CORE-targeted model calls must not grow old modelCallJournal.');
assert.equal(coreState.runtimeResume.modelCallEventSequence, 1, 'CORE-targeted model calls keep only compact resume cursor in runtime state.');

const skippedDiagnostics = [];
let skipState = trackedState('campaign-core-diagnostics-skip');
const skipService = createRuntimeModelCallJournal({
  now: () => '2026-06-26T00:02:00.000Z',
  getCampaignState: () => skipState,
  setCampaignState(next) {
    skipState = next;
  },
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
assert.equal(skipState.runtimeTracking.modelCallJournal.length, 1, 'missing CORE transaction keeps compact legacy model-call journal fallback.');

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
assert.equal(failureState.runtimeTracking.modelCallJournal.length, 0, 'CORE-targeted diagnostic failures must not grow old modelCallJournal.');
assert.equal(failureState.runtimeResume.modelCallEventSequence, 1, 'CORE-targeted diagnostic failures still preserve compact resume cursor.');
assert.equal(failingEvent.id, 'model-call:1:utilityTurnClassifier');
