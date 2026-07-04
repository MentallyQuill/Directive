import assert from 'node:assert/strict';

import {
  createRuntimeLedgerViewAsync,
  createRuntimeLedgerView,
  findLedgerIngress,
  findLedgerIngressAsync,
  findLedgerRecovery,
  findLedgerResponse,
  findLedgerResponseAsync
} from '../../src/runtime/runtime-ledger-view.mjs';

const state = {
  runtimeTracking: {
    ingressLedger: [
      { id: 'ingress-shared-old', hostMessageId: '10', coreTransactionId: 'txn-shared', status: 'stale-old' },
      { id: 'ingress-silent-legacy-only', hostMessageId: '11', status: 'legacy-only' },
      {
        id: 'ingress-legacy-projection-only',
        hostMessageId: '14',
        status: 'legacy-projection-only',
        authority: 'compatibilityProjectionUnavailable',
        projectionSource: 'runtimeTrackingLegacy',
        compatibilityMirror: { kind: 'directive.coreIngressCompatibilityMirror.v1', status: 'missingCoreProjection' }
      }
    ],
    responseLedger: [
      { id: 'response-shared-old', hostMessageId: '12', coreTransactionId: 'txn-response', status: 'stale-old' },
      { id: 'response-silent-legacy-only', hostMessageId: '13', status: 'legacy-only' },
      {
        id: 'response-legacy-projection-only',
        hostMessageId: '15',
        status: 'legacy-projection-only',
        authority: 'compatibilityProjectionUnavailable',
        projectionSource: 'runtimeTrackingLegacy',
        compatibilityMirror: { kind: 'directive.coreResponseCompatibilityMirror.v1', status: 'missingCoreProjection' }
      }
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
  ['ingress-shared-core'],
  'CORE ingress projection must replace matching old rows while suppressing missing-CORE compatibility projection rows.'
);
assert.deepEqual(
  view.responseLedger.map((entry) => entry.id),
  ['response-shared-core'],
  'CORE response projection must replace matching old rows while suppressing missing-CORE compatibility projection rows.'
);
assert.deepEqual(
  view.recoveryJournal.map((entry) => entry.id),
  ['recovery-shared-core'],
  'CORE recovery projection must suppress old recoveryJournal rows instead of merging legacy recovery authority.'
);
assert.equal(findLedgerIngress(state, { hostMessageId: '10' }).id, 'ingress-shared-core');
assert.equal(findLedgerResponse(state, { hostMessageId: '12' }).id, 'response-shared-core');
assert.equal(findLedgerIngress(state, { hostMessageId: '11' }), null);
assert.equal(findLedgerResponse(state, { hostMessageId: '13' }), null);
assert.equal(findLedgerIngress(state, { hostMessageId: '14' }), null);
assert.equal(findLedgerResponse(state, { hostMessageId: '15' }), null);
assert.equal(findLedgerRecovery(state, { transactionId: 'txn-recovery' }).id, 'recovery-shared-core');
assert.equal(findLedgerRecovery(state, { id: 'recovery-legacy-old' }), null);

const nestedProjectionState = {
  runtimeTracking: {
    directiveRuntimeEvidence: {
      coreStoreReadProjections: {
        ingressLedger: [{ id: 'nested-core-ingress', hostMessageId: 'nested-player', status: 'core' }],
        responseLedger: [{ id: 'nested-core-response', hostMessageId: 'nested-assistant', status: 'posted' }],
        recoveryJournal: [{ id: 'nested-core-recovery', transactionId: 'txn-nested', status: 'resolved' }]
      }
    },
    ingressLedger: [{ id: 'nested-silent-ingress', hostMessageId: 'nested-silent-player', status: 'old' }],
    responseLedger: [{ id: 'nested-silent-response', hostMessageId: 'nested-silent-assistant', status: 'old' }],
    recoveryJournal: [{ id: 'nested-silent-recovery', transactionId: 'txn-nested-old', status: 'old' }]
  }
};
const nestedProjectionView = createRuntimeLedgerView(nestedProjectionState);
assert.deepEqual(
  nestedProjectionView.ingressLedger.map((entry) => entry.id),
  ['nested-core-ingress'],
  'Runtime ledger view must accept nested runtimeTracking directiveRuntimeEvidence projections for ingress demotion.'
);
assert.deepEqual(
  nestedProjectionView.responseLedger.map((entry) => entry.id),
  ['nested-core-response'],
  'Runtime ledger view must accept nested runtimeTracking directiveRuntimeEvidence projections for response demotion.'
);
assert.deepEqual(
  nestedProjectionView.recoveryJournal.map((entry) => entry.id),
  ['nested-core-recovery'],
  'Runtime ledger view must accept nested runtimeTracking directiveRuntimeEvidence projections for recovery demotion.'
);

const duplicateHostState = {
  runtimeTracking: {
    ingressLedger: [
      {
        id: 'ingress-host-12-old',
        hostMessageId: '12',
        coreTransactionId: 'txn-old-ingress',
        authority: 'coreIngressProjection',
        projectionSource: 'coreStoreV2',
        compatibilityMirror: { kind: 'directive.coreIngressCompatibilityMirror.v1', status: 'sourceObserved' }
      },
      {
        id: 'ingress-host-12-latest',
        hostMessageId: '12',
        coreTransactionId: 'txn-latest-ingress',
        authority: 'coreIngressProjection',
        projectionSource: 'coreStoreV2',
        compatibilityMirror: { kind: 'directive.coreIngressCompatibilityMirror.v1', status: 'sourceObserved' }
      }
    ],
    responseLedger: [
      {
        id: 'response-host-13-old',
        hostMessageId: '13',
        coreTransactionId: 'txn-old-response',
        authority: 'compatibilityProjection',
        projectionSource: 'coreStoreV2',
        compatibilityMirror: { kind: 'directive.coreResponseCompatibilityMirror.v1', status: 'coreResponseProjection' }
      },
      {
        id: 'response-host-13-latest',
        hostMessageId: '13',
        coreTransactionId: 'txn-latest-response',
        authority: 'compatibilityProjection',
        projectionSource: 'coreStoreV2',
        compatibilityMirror: { kind: 'directive.coreResponseCompatibilityMirror.v1', status: 'coreResponseProjection' }
      }
    ]
  }
};
assert.equal(
  findLedgerIngress(duplicateHostState, { hostMessageId: '12' }).id,
  'ingress-host-12-latest',
  'Positional host message ids can be reused after SillyTavern deletes/reindexes rows; ingress lookup must prefer newest matching host id.'
);
assert.equal(
  findLedgerResponse(duplicateHostState, { hostMessageId: '13' }).id,
  'response-host-13-latest',
  'Positional host message ids can be reused after SillyTavern deletes/reindexes rows; response lookup must prefer newest matching host id.'
);
assert.equal(
  (await findLedgerIngressAsync(duplicateHostState, { hostMessageId: '12' })).id,
  'ingress-host-12-latest',
  'Async ingress lookup must prefer newest duplicate host id.'
);
assert.equal(
  (await findLedgerResponseAsync(duplicateHostState, { hostMessageId: '13' })).id,
  'response-host-13-latest',
  'Async response lookup must prefer newest duplicate host id.'
);

const legacyOnlyRecoveryState = {
  runtimeTracking: {
    ingressLedger: [{ id: 'legacy-only-ingress', hostMessageId: 'legacy-player' }],
    responseLedger: [{ id: 'legacy-only-response', hostMessageId: 'legacy-assistant' }],
    recoveryJournal: [{ id: 'legacy-only-recovery', transactionId: 'txn-legacy-recovery', status: 'open' }]
  }
};
const legacyOnlyRecoveryView = createRuntimeLedgerView(legacyOnlyRecoveryState);
assert.equal(
  legacyOnlyRecoveryView.ingressLedger.length,
  0,
  'Legacy ingress fallback must not surface silent old rows even when no CORE projection exists.'
);
assert.equal(
  legacyOnlyRecoveryView.responseLedger.length,
  0,
  'Legacy response fallback must not surface silent old rows even when no CORE projection exists.'
);
assert.deepEqual(
  legacyOnlyRecoveryView.recoveryJournal,
  [],
  'Runtime recovery view must be CORE-only even when no CORE projection exists.'
);
assert.equal(
  findLedgerRecovery(legacyOnlyRecoveryState, { id: 'legacy-only-recovery' }),
  null,
  'Recovery lookup must not surface old runtimeTracking.recoveryJournal rows as authority.'
);

const duplicateHostCoreMergeState = {
  runtimeTracking: {
    ingressLedger: [
      {
        id: 'ingress-host-21-current',
        hostMessageId: '21',
        coreTransactionId: 'txn-current-ingress',
        status: 'legacy-current',
        authority: 'coreIngressProjection',
        projectionSource: 'coreStoreV2',
        compatibilityMirror: { kind: 'directive.coreIngressCompatibilityMirror.v1', status: 'sourceObserved' }
      }
    ],
    responseLedger: [
      {
        id: 'response-host-22-current',
        hostMessageId: '22',
        coreTransactionId: 'txn-current-response',
        status: 'legacy-current',
        authority: 'compatibilityProjection',
        projectionSource: 'coreStoreV2',
        compatibilityMirror: { kind: 'directive.coreResponseCompatibilityMirror.v1', status: 'coreResponseProjection' }
      }
    ]
  },
  directiveRuntimeEvidence: {
    coreStoreReadProjections: {
      ingressLedger: [
        { id: 'ingress-host-21-stale-core', hostMessageId: '21', transactionId: 'txn-stale-ingress', status: 'core-stale' }
      ],
      responseLedger: [
        { id: 'response-host-22-stale-core', hostMessageId: '22', transactionId: 'txn-stale-response', status: 'core-stale' }
      ],
      recoveryJournal: []
    }
  }
};
assert.deepEqual(
  createRuntimeLedgerView(duplicateHostCoreMergeState).ingressLedger.map((entry) => entry.id),
  ['ingress-host-21-stale-core', 'ingress-host-21-current'],
  'CORE/legacy merge must not collapse different ingress transactions just because SillyTavern reused the same visible host message id.'
);
assert.deepEqual(
  createRuntimeLedgerView(duplicateHostCoreMergeState).responseLedger.map((entry) => entry.id),
  ['response-host-22-stale-core', 'response-host-22-current'],
  'CORE/legacy merge must not collapse different response transactions just because SillyTavern reused the same visible host message id.'
);
assert.equal(
  findLedgerIngress(duplicateHostCoreMergeState, { hostMessageId: '21' }).id,
  'ingress-host-21-current',
  'Ingress host-id lookup must select current legacy row when stale CORE projection shares only the positional host id.'
);
assert.equal(
  findLedgerResponse(duplicateHostCoreMergeState, { hostMessageId: '22' }).id,
  'response-host-22-current',
  'Response host-id lookup must select current legacy row when stale CORE projection shares only the positional host id.'
);

const authoritativeOverlayState = {
  runtimeTracking: {
    ingressLedger: [{
      id: 'hot-ingress-overlay',
      hostMessageId: 'hot-player',
      coreTransactionId: 'txn-hot-ingress',
      status: 'classifying',
      authority: 'coreIngressProjection',
      projectionSource: 'coreStoreV2',
      compatibilityMirror: { kind: 'directive.coreIngressCompatibilityMirror.v1', status: 'sourceObserved' }
    }, {
      id: 'missing-core-overlay',
      hostMessageId: 'missing-core-player',
      authority: 'compatibilityProjectionUnavailable',
      projectionSource: 'runtimeBridgeV2',
      compatibilityMirror: { kind: 'directive.coreIngressCompatibilityMirror.v1', status: 'runtimeBridgeProjection' }
    }],
    responseLedger: [{
      id: 'hot-response-overlay',
      hostMessageId: 'hot-assistant',
      coreTransactionId: 'txn-hot-response',
      status: 'posted',
      authority: 'compatibilityProjection',
      projectionSource: 'coreStoreV2',
      compatibilityMirror: { kind: 'directive.coreResponseCompatibilityMirror.v1', status: 'coreResponseProjection' }
    }]
  },
  directiveRuntimeEvidence: {
    coreStoreReadProjections: {
      runtimeAuthority: 'coreStoreV2',
      ingressLedger: [{ id: 'authoritative-core-ingress', hostMessageId: 'core-player', transactionId: 'txn-core-ingress' }],
      responseLedger: [{ id: 'authoritative-core-response', hostMessageId: 'core-assistant', transactionId: 'txn-core-response' }]
    }
  }
};
assert.deepEqual(
  createRuntimeLedgerView(authoritativeOverlayState).ingressLedger.map((entry) => entry.id),
  ['authoritative-core-ingress'],
  'Authoritative CORE runtime view remains strict by default.'
);
assert.deepEqual(
  createRuntimeLedgerView(authoritativeOverlayState, { runtimeOverlay: true }).ingressLedger.map((entry) => entry.id),
  ['authoritative-core-ingress', 'hot-ingress-overlay'],
  'Explicit runtime overlay lets hot CORE-tagged ingress rows surface before read projections refresh.'
);
assert.deepEqual(
  createRuntimeLedgerView(authoritativeOverlayState, { runtimeOverlay: true }).responseLedger.map((entry) => entry.id),
  ['authoritative-core-response', 'hot-response-overlay'],
  'Explicit runtime overlay lets hot CORE-tagged response rows surface before read projections refresh.'
);
assert.equal(
  createRuntimeLedgerView(authoritativeOverlayState, { runtimeOverlay: true }).ingressLedger.some((entry) => entry.id === 'missing-core-overlay'),
  false,
  'Runtime overlay must not surface missing-CORE compatibility rows.'
);

const incompleteTupleMergeState = {
  runtimeTracking: {
    responseLedger: [
      {
        id: 'response-unrelated-host-generation',
        ingressId: 'ingress-unrelated',
        responseKind: 'hostGeneration',
        coreTransactionId: 'txn-unrelated-host-generation',
        status: 'responseRetryRequired',
        authority: 'compatibilityProjection',
        projectionSource: 'coreStoreV2',
        compatibilityMirror: { kind: 'directive.coreResponseCompatibilityMirror.v1', status: 'coreResponseProjection' }
      }
    ]
  },
  directiveRuntimeEvidence: {
    coreStoreReadProjections: {
      responseLedger: [
        {
          id: 'response-core-host-generation',
          responseKind: 'hostGeneration',
          transactionId: 'txn-core-host-generation',
          status: 'posted'
        }
      ],
      recoveryJournal: []
    }
  }
};
assert.deepEqual(
  createRuntimeLedgerView(incompleteTupleMergeState).responseLedger.map((entry) => entry.id),
  ['response-core-host-generation', 'response-unrelated-host-generation'],
  'CORE/legacy merge must not collapse unrelated response rows when only responseKind is shared and turn/outcome ids are absent.'
);
assert.equal(
  findLedgerResponse(incompleteTupleMergeState, { id: 'response-core-host-generation' }).ingressId,
  undefined,
  'Incomplete tuple matches must not leak unrelated legacy ingress/recovery context onto a CORE response projection.'
);

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
