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
