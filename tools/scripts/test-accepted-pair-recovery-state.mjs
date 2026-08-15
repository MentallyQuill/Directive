import assert from 'node:assert/strict';

import {
  acceptedPairFingerprint,
  assertAcceptedPairRecovery,
  createAcceptedPairCallBudget,
  noAcceptedPairRecovery,
  pairRetryRecovery,
  reconcileRequiredRecovery,
} from '../../src/runtime/accepted-pair-recovery-state.mjs';

const snapshot = {
  kind: 'directive.acceptedPairSnapshot.v1',
  source: { sourceRangeHash: 'pair.fingerprint.one' },
};

assert.equal(acceptedPairFingerprint(snapshot), 'pair.fingerprint.one');
assert.equal(assertAcceptedPairRecovery(noAcceptedPairRecovery()).mode, 'none');
assert.equal(assertAcceptedPairRecovery(reconcileRequiredRecovery('edited')).mode, 'reconcile-required');
const retry = assertAcceptedPairRecovery(pairRetryRecovery({
  snapshot,
  ingressId: 'ingress.one',
  reasonCode: 'provider-aborted',
  persistenceAttempts: 1,
}));
assert.equal(retry.mode, 'pair-retry');
assert.equal(retry.pair.fingerprint, 'pair.fingerprint.one');
assert.notEqual(retry.pair.snapshot, snapshot);

const budget = createAcceptedPairCallBudget();
assert.equal(budget.reserve('pair.fingerprint.one', 'automatic'), true);
assert.equal(budget.reserve('pair.fingerprint.one', 'automatic'), false);
assert.equal(budget.reserve('pair.fingerprint.one', 'manual'), true);
assert.equal(budget.reserve('pair.fingerprint.one', 'manual'), false);
assert.deepEqual(budget.inspect('pair.fingerprint.one'), { automatic: 1, manual: 1 });
budget.release('pair.fingerprint.one', 'manual');
assert.equal(budget.reserve('pair.fingerprint.one', 'manual'), true);

console.log('Accepted-pair recovery state passed.');
