import assert from 'node:assert/strict';

import {
  createRuntimeLedgerViewAsync,
  createRuntimeLedgerView,
  findLedgerIngress,
  findLedgerRecovery,
  findLedgerResponse
} from '../../src/runtime/runtime-ledger-view.mjs';

const state = {
  runtimeTracking: {
    ingressLedger: [
      { id: 'ingress-shared-old', hostMessageId: '10', coreTransactionId: 'txn-shared', status: 'stale-old' },
      { id: 'ingress-legacy-only', hostMessageId: '11', status: 'legacy-only' }
    ],
    responseLedger: [
      { id: 'response-shared-old', hostMessageId: '12', coreTransactionId: 'txn-response', status: 'stale-old' },
      { id: 'response-legacy-only', hostMessageId: '13', status: 'legacy-only' }
    ],
    recoveryJournal: [
      { id: 'recovery-legacy-old', transactionId: 'txn-legacy', status: 'open' },
      { id: 'recovery-shared-old', transactionId: 'txn-recovery', status: 'open' }
    ]
  },
  directiveRuntimeEvidence: {
    coreStoreReadProjections: {
      kind: 'directive.coreStoreReadProjections.v1',
      ingressLedger: [
        { id: 'ingress-shared-core', hostMessageId: '10', transactionId: 'txn-shared', status: 'core' }
      ],
      responseLedger: [
        { id: 'response-shared-core', hostMessageId: '12', transactionId: 'txn-response', status: 'core' }
      ],
      recoveryJournal: [
        { id: 'recovery-shared-core', transactionId: 'txn-recovery', status: 'open' }
      ]
    }
  }
};

const view = createRuntimeLedgerView(state);
assert.deepEqual(
  view.ingressLedger.map((entry) => entry.id),
  ['ingress-shared-core', 'ingress-legacy-only'],
  'CORE ingress projection must replace matching old rows while keeping explicit legacy fallback rows.'
);
assert.deepEqual(
  view.responseLedger.map((entry) => entry.id),
  ['response-shared-core', 'response-legacy-only'],
  'CORE response projection must replace matching old rows while keeping explicit legacy fallback rows.'
);
assert.deepEqual(
  view.recoveryJournal.map((entry) => entry.id),
  ['recovery-shared-core'],
  'CORE recovery projection must suppress old recoveryJournal rows instead of merging legacy recovery authority.'
);
assert.equal(findLedgerIngress(state, { hostMessageId: '10' }).id, 'ingress-shared-core');
assert.equal(findLedgerResponse(state, { hostMessageId: '12' }).id, 'response-shared-core');
assert.equal(findLedgerRecovery(state, { transactionId: 'txn-recovery' }).id, 'recovery-shared-core');
assert.equal(findLedgerRecovery(state, { id: 'recovery-legacy-old' }), null);

const authoritative = structuredClone(state);
authoritative.directiveRuntimeEvidence.coreStoreReadProjections.runtimeAuthority = 'coreStoreV2';
const authoritativeView = createRuntimeLedgerView(authoritative);
assert.deepEqual(
  authoritativeView.ingressLedger.map((entry) => entry.id),
  ['ingress-shared-core'],
  'Authoritative CORE runtime view must drop unmatched legacy ingress rows.'
);
assert.deepEqual(
  authoritativeView.responseLedger.map((entry) => entry.id),
  ['response-shared-core'],
  'Authoritative CORE runtime view must drop unmatched legacy response rows.'
);
assert.deepEqual(
  authoritativeView.recoveryJournal.map((entry) => entry.id),
  ['recovery-shared-core'],
  'Authoritative CORE runtime view must remain CORE-only for recovery rows.'
);

const coreStoreView = createRuntimeLedgerView({
  runtimeTracking: {
    responseLedger: [{ id: 'response-old-store', status: 'stale-old' }]
  }
}, {
  coreTurnStore: {
    readProjections() {
      return {
        responseLedger: [{ id: 'response-core-store', status: 'core-store' }],
        recoveryJournal: []
      };
    }
  }
});
assert.equal(coreStoreView.responseLedger[0].id, 'response-core-store');

const asyncCoreStoreView = await createRuntimeLedgerViewAsync({
  runtimeTracking: {
    responseLedger: [{ id: 'response-old-async-store', status: 'stale-old' }],
    recoveryJournal: [{ id: 'recovery-old-async-store', transactionId: 'txn-old-async' }]
  }
}, {
  coreTurnStore: {
    async readProjections() {
      return {
        responseLedger: [{ id: 'response-core-async-store', status: 'core-async-store' }],
        recoveryJournal: [{ id: 'recovery-core-async-store', transactionId: 'txn-core-async' }]
      };
    }
  }
});
assert.equal(asyncCoreStoreView.responseLedger[0].id, 'response-core-async-store');
assert.deepEqual(
  asyncCoreStoreView.recoveryJournal.map((entry) => entry.id),
  ['recovery-core-async-store'],
  'Async CORE projection reads must not fall back to stale old recovery rows.'
);

console.log('Runtime ledger view tests passed.');
