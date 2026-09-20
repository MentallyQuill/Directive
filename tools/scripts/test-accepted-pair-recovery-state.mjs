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
assert.equal(budget.entryCount(), 0);
assert.equal(budget.reserve('pair.fingerprint.one', 'automatic'), true);
assert.equal(budget.reserve('pair.fingerprint.one', 'automatic'), false);
assert.equal(budget.reserve('pair.fingerprint.one', 'manual'), true);
assert.equal(budget.reserve('pair.fingerprint.one', 'manual'), false);
assert.deepEqual(budget.inspect('pair.fingerprint.one'), { automatic: 1, manual: 1 });
budget.release('pair.fingerprint.one', 'manual');
assert.equal(budget.reserve('pair.fingerprint.one', 'manual'), true);
assert.equal(budget.entryCount(), 1);
budget.clear('pair.fingerprint.one');
assert.equal(budget.entryCount(), 0);

console.log('Accepted-pair recovery state passed.');

const { acceptedPairCallBudgetKey } = await import('../../src/runtime/accepted-pair-recovery-state.mjs');
const ownedSnapshot = { ...snapshot, envelope: { campaignId: 'campaign.a', saveId: 'save.a', chatId: 'chat.a', packageId: 'package.a', packageVersion: '1' } };
const otherOwner = { ...ownedSnapshot, envelope: { ...ownedSnapshot.envelope, saveId: 'save.b', chatId: 'chat.b' } };
const keyA = acceptedPairCallBudgetKey(ownedSnapshot);
const keyB = acceptedPairCallBudgetKey(otherOwner);
assert.notEqual(keyA, keyB, 'cloned source text in a different save/chat must not inherit failed attempts');
assert.equal(keyA, acceptedPairCallBudgetKey({ ...ownedSnapshot, envelope: { ...ownedSnapshot.envelope, ingressId: 'another-gesture' } }), 'new gesture cannot reset same-owner automatic budget');
const scopedBudget = createAcceptedPairCallBudget();
assert.equal(scopedBudget.reserve(keyA), true);
assert.equal(scopedBudget.reserve(keyA), false);
assert.equal(scopedBudget.reserve(keyB), true);
assert.equal(scopedBudget.reserve(keyB), false);
assert.equal(scopedBudget.reserve(keyA, 'manual'), true);
assert.equal(scopedBudget.reserve(keyA, 'manual'), false);
// A late completion/release from A cannot release B's outstanding reservation.
scopedBudget.clear(keyA);
assert.equal(scopedBudget.reserve(keyB), false);
assert.equal(scopedBudget.reserve(keyB, 'manual'), true);
scopedBudget.release(keyA, 'manual');
assert.equal(scopedBudget.reserve(keyB, 'manual'), false);
for (const field of ['saveId', 'chatId', 'campaignId', 'packageId', 'packageVersion']) {
  assert.notEqual(keyA, acceptedPairCallBudgetKey({ ...ownedSnapshot, envelope: { ...ownedSnapshot.envelope, [field]: 'other' } }));
}
assert.equal(acceptedPairCallBudgetKey({ source: {} }), null);
assert.equal(acceptedPairFingerprint(ownedSnapshot), snapshot.source.sourceRangeHash, 'receipt/source identity remains unchanged');
console.log('PASS cloned-source budgets retain exact owner isolation and same-owner attempt limits');
