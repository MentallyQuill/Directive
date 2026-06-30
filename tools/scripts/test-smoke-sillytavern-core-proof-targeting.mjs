import assert from 'node:assert/strict';

import {
  corePlayerIngressProof,
  generationTimingProofFromCoreProjections,
  hostNativeCompletionProofFromCoreProjections,
  transactionIdsForCoreTarget
} from './lib/sillytavern-core-proof-policy.mjs';

const staleRuntimeBefore = {
  tracking: {
    ingressCount: 2,
    responseCount: 2
  },
  recentIngressLedger: [],
  recentResponseLedger: []
};
const staleRuntimeAfter = {
  tracking: {
    ingressCount: 2,
    responseCount: 2
  },
  recentIngressLedger: [],
  recentResponseLedger: []
};

const projections = {
  hostMapRows: [
    {
      role: 'player',
      hostMessageId: '1',
      transactionId: 'txn:old',
      sourceFrameId: 'frame:old',
      textHash: 'old-player-hash'
    },
    {
      role: 'assistant',
      hostMessageId: '2',
      transactionId: 'txn:old',
      responseKind: 'hostContinue'
    },
    {
      role: 'player',
      hostMessageId: '5',
      transactionId: 'txn:target',
      sourceFrameId: 'frame:target',
      textHash: 'target-player-hash'
    },
    {
      role: 'assistant',
      hostMessageId: '6',
      transactionId: 'txn:target',
      responseKind: 'hostContinue'
    }
  ],
  ingressLedger: [],
  turnTiming: [
    {
      transactionId: 'txn:old',
      sourceFrameId: 'frame:old',
      hostMessageId: '1',
      route: 'hostContinue',
      responseKind: 'hostContinue',
      turnTiming: {
        kind: 'hostContinue',
        playerSubmittedAt: 1000,
        routeDecidedAt: 1500,
        hostGenerationReleasedAt: 1600,
        visibleResponsePostedAt: null,
        generationStartedAt: 1600,
        generationStartLatencyMs: 600,
        architectureWithin60s: true
      }
    },
    {
      transactionId: 'txn:target',
      sourceFrameId: 'frame:target',
      hostMessageId: '5',
      route: 'hostContinue',
      responseKind: 'hostContinue',
      turnTiming: {
        kind: 'hostContinue',
        playerSubmittedAt: 2000,
        routeDecidedAt: 2300,
        hostGenerationReleasedAt: 2400,
        visibleResponsePostedAt: 5000,
        generationStartedAt: 2400,
        generationStartLatencyMs: 400,
        providerCompletionLatencyMs: 2600,
        architectureWithin60s: true
      }
    }
  ],
  responseLedger: [
    {
      id: 'response:old',
      transactionId: 'txn:old',
      responseKind: 'hostContinue',
      hostMessageId: null,
      textHash: null
    },
    {
      id: 'response:target',
      transactionId: 'txn:target',
      responseKind: 'hostContinue',
      hostMessageId: '6',
      textHash: 'a'.repeat(64)
    }
  ]
};

const ingressProof = corePlayerIngressProof({
  projections,
  targetPlayerHostMessageIds: ['5']
});
assert.equal(ingressProof.status, 'pass');
assert.equal(ingressProof.rows[0].source, 'coreHostMap');
assert.equal(ingressProof.matchedPlayerHostMessageIds[0], '5');
assert.deepEqual(ingressProof.missingPlayerHostMessageIds, []);

const targetTransactions = transactionIdsForCoreTarget({
  projections,
  beforeSnapshot: staleRuntimeBefore,
  afterSnapshot: staleRuntimeAfter,
  targetPlayerHostMessageIds: ['5']
});
assert.deepEqual([...targetTransactions], ['txn:target']);

const timingProof = generationTimingProofFromCoreProjections({
  projections,
  beforeSnapshot: staleRuntimeBefore,
  afterSnapshot: staleRuntimeAfter,
  targetPlayerHostMessageIds: ['5']
});
assert.equal(timingProof.status, 'pass');
assert.equal(timingProof.targetTransactionCount, 1);
assert.deepEqual(timingProof.targetTransactionIds, ['txn:target']);
assert.equal(timingProof.checkedTurnCount, 1);
assert.equal(timingProof.entries[0].coreTransactionId, 'txn:target');
assert.equal(timingProof.maxGenerationStartLatencyMs, 400);

const hostCompletionProof = hostNativeCompletionProofFromCoreProjections({
  projections,
  beforeSnapshot: staleRuntimeBefore,
  afterSnapshot: staleRuntimeAfter,
  targetPlayerHostMessageIds: ['5']
});
assert.equal(hostCompletionProof.status, 'pass');
assert.equal(hostCompletionProof.targetTransactionCount, 1);
assert.deepEqual(hostCompletionProof.targetTransactionIds, ['txn:target']);
assert.equal(hostCompletionProof.completedHostContinueCount, 1);
assert.equal(hostCompletionProof.failedHostContinueCount, 0);
assert.equal(hostCompletionProof.entries[0].transactionId, 'txn:target');

const unfilteredHostCompletionProof = hostNativeCompletionProofFromCoreProjections({
  projections,
  beforeSnapshot: null,
  afterSnapshot: null
});
assert.equal(unfilteredHostCompletionProof.status, 'fail');
assert.equal(unfilteredHostCompletionProof.failedHostContinueCount, 1);

console.log('test-smoke-sillytavern-core-proof-targeting: ok');
