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
  [],
  'Runtime ledger view must reject nested runtimeTracking directiveRuntimeEvidence as CORE ingress authority.'
);
assert.deepEqual(
  nestedProjectionView.responseLedger.map((entry) => entry.id),
  [],
  'Runtime ledger view must reject nested runtimeTracking directiveRuntimeEvidence as CORE response authority.'
);
assert.deepEqual(
  nestedProjectionView.recoveryJournal.map((entry) => entry.id),
  [],
  'Runtime ledger view must reject nested runtimeTracking directiveRuntimeEvidence as CORE recovery authority.'
);
assert.equal(
  findLedgerIngress(nestedProjectionState, { hostMessageId: 'nested-player' }),
  null,
  'Nested runtimeTracking directiveRuntimeEvidence must not drive ingress lookup.'
);
assert.equal(
  findLedgerResponse(nestedProjectionState, { hostMessageId: 'nested-assistant' }),
  null,
  'Nested runtimeTracking directiveRuntimeEvidence must not drive response lookup.'
);
assert.equal(
  findLedgerRecovery(nestedProjectionState, { transactionId: 'txn-nested' }),
  null,
  'Nested runtimeTracking directiveRuntimeEvidence must not drive recovery lookup.'
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
  findLedgerIngress(duplicateHostState, { hostMessageId: '12' }),
  null,
  'Default ingress lookup must not surface legacy compatibility rows.'
);
assert.equal(
  findLedgerResponse(duplicateHostState, { hostMessageId: '13' }),
  null,
  'Default response lookup must not surface legacy compatibility rows.'
);
assert.equal(
  await findLedgerIngressAsync(duplicateHostState, { hostMessageId: '12' }),
  null,
  'Async ingress lookup must not revive old ingress runtime rows.'
);
assert.equal(
  await findLedgerResponseAsync(duplicateHostState, { hostMessageId: '13' }),
  null,
  'Async response lookup must not revive old response runtime rows.'
);

const duplicateCoreHostState = {
  directiveRuntimeEvidence: {
    coreStoreReadProjections: {
      kind: 'directive.coreStoreReadProjections.v1',
      runtimeAuthority: 'coreStoreV2',
      ingressLedger: [
        { id: 'core-ingress-reused-old', hostMessageId: '5', transactionId: 'txn-core-ingress-old', sourceFrameId: 'frame-old' },
        { id: 'core-ingress-reused-new', hostMessageId: '5', transactionId: 'txn-core-ingress-new', sourceFrameId: 'frame-new' }
      ],
      responses: [
        { id: 'core-response-reused-old', hostMessageId: '6', transactionId: 'txn-core-response-old', responseKind: 'committedOutcome' },
        { id: 'core-response-reused-new', hostMessageId: '6', transactionId: 'txn-core-response-new', responseKind: 'committedOutcome' }
      ]
    }
  }
};
assert.equal(
  findLedgerIngress(duplicateCoreHostState, { hostMessageId: '5' }),
  null,
  'CORE ingress lookup must fail closed when hostMessageId is reused.'
);
assert.equal(
  findLedgerResponse(duplicateCoreHostState, { hostMessageId: '6' }),
  null,
  'CORE response lookup must fail closed when hostMessageId is reused.'
);
assert.equal(
  await findLedgerIngressAsync(duplicateCoreHostState, { hostMessageId: '5' }),
  null,
  'Async CORE ingress lookup must fail closed when hostMessageId is reused.'
);
assert.equal(
  await findLedgerResponseAsync(duplicateCoreHostState, { hostMessageId: '6' }),
  null,
  'Async CORE response lookup must fail closed when hostMessageId is reused.'
);
assert.equal(
  findLedgerIngress(duplicateCoreHostState, { id: 'core-ingress-reused-old' })?.transactionId,
  'txn-core-ingress-old',
  'Stable CORE ingress id lookup must still work when hostMessageId is reused.'
);
assert.equal(
  findLedgerIngress(duplicateCoreHostState, { transactionId: 'txn-core-ingress-new' })?.id,
  'core-ingress-reused-new',
  'Stable CORE ingress transaction lookup must still work when hostMessageId is reused.'
);
assert.equal(
  findLedgerResponse(duplicateCoreHostState, { id: 'core-response-reused-old' })?.transactionId,
  'txn-core-response-old',
  'Stable CORE response id lookup must still work when hostMessageId is reused.'
);
assert.equal(
  findLedgerResponse(duplicateCoreHostState, { transactionId: 'txn-core-response-new' })?.id,
  'core-response-reused-new',
  'Stable CORE response transaction lookup must still work when hostMessageId is reused.'
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
  ['ingress-host-21-stale-core'],
  'Default CORE/legacy view must not surface legacy ingress rows as authority.'
);
assert.deepEqual(
  createRuntimeLedgerView(duplicateHostCoreMergeState).responseLedger.map((entry) => entry.id),
  ['response-host-22-stale-core'],
  'Default CORE/legacy view must not surface legacy response rows as authority.'
);
assert.equal(
  findLedgerIngress(duplicateHostCoreMergeState, { hostMessageId: '21' }).id,
  'ingress-host-21-stale-core',
  'Default ingress host-id lookup must select CORE projection, not current legacy mirror.'
);
assert.equal(
  findLedgerResponse(duplicateHostCoreMergeState, { hostMessageId: '22' }).id,
  'response-host-22-stale-core',
  'Default response host-id lookup must select CORE projection, not current legacy mirror.'
);
assert.deepEqual(
  createRuntimeLedgerView(duplicateHostCoreMergeState).ingressLedger.map((entry) => entry.id),
  ['ingress-host-21-stale-core'],
  'CORE ingress projections must remain the only runtime ledger authority.'
);
assert.deepEqual(
  createRuntimeLedgerView(duplicateHostCoreMergeState).responseLedger.map((entry) => entry.id),
  ['response-host-22-stale-core'],
  'CORE response projections must remain the only runtime ledger authority.'
);

const authoritativeCoreOnlyState = {
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
  createRuntimeLedgerView(authoritativeCoreOnlyState).ingressLedger.map((entry) => entry.id),
  ['authoritative-core-ingress'],
  'Authoritative CORE runtime view remains strict by default.'
);
assert.deepEqual(
  createRuntimeLedgerView(authoritativeCoreOnlyState).ingressLedger.map((entry) => entry.id),
  ['authoritative-core-ingress'],
  'CORE ingress rows remain authority even when old hot rows are present.'
);
assert.deepEqual(
  createRuntimeLedgerView(authoritativeCoreOnlyState).responseLedger.map((entry) => entry.id),
  ['authoritative-core-response'],
  'CORE response rows remain authority even when old hot rows are present.'
);
assert.equal(
  createRuntimeLedgerView(authoritativeCoreOnlyState).ingressLedger.some((entry) => entry.id === 'missing-core-overlay'),
  false,
  'Runtime ledger view must not surface missing-CORE compatibility rows.'
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
  ['response-core-host-generation'],
  'Default response view must not surface unrelated legacy response rows when only responseKind is shared and turn/outcome ids are absent.'
);
assert.equal(
  findLedgerResponse(incompleteTupleMergeState, { id: 'response-core-host-generation' }).ingressId,
  undefined,
  'Incomplete tuple matches must not leak unrelated legacy ingress/recovery context onto a CORE response projection.'
);
assert.deepEqual(
  createRuntimeLedgerView(incompleteTupleMergeState).responseLedger.map((entry) => entry.id),
  ['response-core-host-generation'],
  'Runtime ledger view must not add unrelated old response rows.'
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

const staleStateProjectionWithLiveStore = {
  directiveRuntimeEvidence: {
    coreStoreReadProjections: {
      kind: 'directive.coreStoreReadProjections.v1',
      runtimeAuthority: 'coreStoreV2',
      ingressLedger: [{ id: 'state-stale-ingress', hostMessageId: 'state-player', transactionId: 'txn-state-ingress' }],
      responseLedger: [{ id: 'state-stale-response', hostMessageId: 'state-assistant', transactionId: 'txn-state-response' }],
      recoveryJournal: [{ id: 'state-stale-recovery', transactionId: 'txn-state-recovery' }]
    }
  }
};

const emptyLiveCoreStoreView = createRuntimeLedgerView(staleStateProjectionWithLiveStore, {
  coreTurnStore: {
    readProjections() {
      return {
        kind: 'directive.coreStoreReadProjections.v1',
        runtimeAuthority: 'coreStoreV2',
        ingressLedger: [],
        responses: [],
        recoveryJournal: []
      };
    }
  }
});
assert.deepEqual(
  emptyLiveCoreStoreView.ingressLedger,
  [],
  'Live CORE store reads must not fall back to stale state-carried ingress projections.'
);
assert.deepEqual(
  emptyLiveCoreStoreView.responseLedger,
  [],
  'Live CORE store reads must not fall back to stale state-carried response projections.'
);
assert.deepEqual(
  emptyLiveCoreStoreView.recoveryJournal,
  [],
  'Live CORE store reads must not fall back to stale state-carried recovery projections.'
);
assert.equal(
  emptyLiveCoreStoreView.authoritative,
  true,
  'An empty live CORE store authority marker remains authoritative without borrowing state rows.'
);

const liveCoreStoreView = createRuntimeLedgerView(staleStateProjectionWithLiveStore, {
  coreTurnStore: {
    readProjections() {
      return {
        kind: 'directive.coreStoreReadProjections.v1',
        runtimeAuthority: 'coreStoreV2',
        ingressLedger: [{ id: 'live-store-ingress', hostMessageId: 'live-player', transactionId: 'txn-live-ingress' }],
        responses: [{ id: 'live-store-response', hostMessageId: 'live-assistant', transactionId: 'txn-live-response' }],
        recoveryJournal: [{ id: 'live-store-recovery', transactionId: 'txn-live-recovery' }]
      };
    }
  }
});
assert.deepEqual(
  liveCoreStoreView.ingressLedger.map((entry) => entry.id),
  ['live-store-ingress'],
  'Live CORE ingress projections must not be augmented by stale state-carried rows.'
);
assert.deepEqual(
  liveCoreStoreView.responseLedger.map((entry) => entry.id),
  ['live-store-response'],
  'Live CORE response projections must not be augmented by stale state-carried rows.'
);
assert.deepEqual(
  liveCoreStoreView.recoveryJournal.map((entry) => entry.id),
  ['live-store-recovery'],
  'Live CORE recovery projections must not be augmented by stale state-carried rows.'
);

const syncViewAgainstAsyncStore = createRuntimeLedgerView(staleStateProjectionWithLiveStore, {
  coreTurnStore: {
    async readProjections() {
      return {
        kind: 'directive.coreStoreReadProjections.v1',
        runtimeAuthority: 'coreStoreV2',
        ingressLedger: [{ id: 'async-store-ingress', hostMessageId: 'async-player', transactionId: 'txn-async-ingress' }]
      };
    }
  }
});
assert.deepEqual(
  syncViewAgainstAsyncStore.ingressLedger,
  [],
  'Sync runtime ledger view must fail closed instead of using stale state projections when the live CORE store is async.'
);

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

const asyncLiveCoreStoreView = await createRuntimeLedgerViewAsync(staleStateProjectionWithLiveStore, {
  coreTurnStore: {
    async readProjections() {
      return {
        kind: 'directive.coreStoreReadProjections.v1',
        runtimeAuthority: 'coreStoreV2',
        ingressLedger: [{ id: 'async-live-store-ingress', hostMessageId: 'async-live-player', transactionId: 'txn-async-live-ingress' }],
        responses: [{ id: 'async-live-store-response', hostMessageId: 'async-live-assistant', transactionId: 'txn-async-live-response' }],
        recoveryJournal: [{ id: 'async-live-store-recovery', transactionId: 'txn-async-live-recovery' }]
      };
    }
  }
});
assert.deepEqual(
  asyncLiveCoreStoreView.ingressLedger.map((entry) => entry.id),
  ['async-live-store-ingress'],
  'Async live CORE ingress reads must not merge stale state projections.'
);
assert.deepEqual(
  asyncLiveCoreStoreView.responseLedger.map((entry) => entry.id),
  ['async-live-store-response'],
  'Async live CORE response reads must not merge stale state projections.'
);
assert.deepEqual(
  asyncLiveCoreStoreView.recoveryJournal.map((entry) => entry.id),
  ['async-live-store-recovery'],
  'Async live CORE recovery reads must not merge stale state projections.'
);

console.log('Runtime ledger view tests passed.');
