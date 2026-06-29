import assert from 'node:assert/strict';

import { hashStableJson } from '../../src/runtime/architecture-redesign-contracts.mjs';
import { createTurnCommitCoordinator } from '../../src/runtime/turn-commit-coordinator.mjs';
import { initializeCampaignRuntimeTracking } from '../../src/runtime/state-delta-gateway.mjs';
import { createCoreStoreV2 } from '../../src/storage/core-store-v2.mjs';
import { createLogicalStorageAdapter } from '../../src/storage/logical-storage-adapter.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createMemoryStorage() {
  const files = new Map();
  return {
    async readJson(filePath) {
      if (!files.has(filePath)) {
        const error = new Error(`not found: ${filePath}`);
        error.code = 'ENOENT';
        throw error;
      }
      return cloneJson(files.get(filePath));
    },
    async writeJson(filePath, value) {
      files.set(filePath, cloneJson(value));
      return { ok: true, path: filePath };
    },
    async verifyJsonFiles(paths) {
      return Object.fromEntries(paths.map((filePath) => [filePath, files.has(filePath)]));
    }
  };
}

function baseState() {
  return initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-core-mechanics-order', status: 'active' },
    campaignChatBinding: {
      hostId: 'fake',
      chatId: 'ashes-chat',
      campaignId: 'campaign-core-mechanics-order',
      saveId: 'save-core-mechanics-order'
    },
    mission: { activePhaseId: 'before-commit' },
    worldState: { currentLocationId: 'before-location' },
    commandLog: { entries: [] },
    turnLedger: { entries: [] },
    runtimeTracking: {
      ingressLedger: [{
        id: 'ingress-core-mechanics-order',
        coreTransactionId: 'txn-core-mechanics-order',
        status: 'classified'
      }]
    }
  });
}

function committedState() {
  return {
    ...baseState(),
    mission: { activePhaseId: 'after-commit' },
    worldState: { currentLocationId: 'after-location' }
  };
}

const turnPacket = {
  turnId: 'turn-core-mechanics-order',
  outcomePacket: {
    id: 'outcome-core-mechanics-order',
    resultBand: 'Success'
  },
  stateDelta: {
    openWorld: {
      reducerBundle: {
        kind: 'directive.openWorldReducerBundle.v1',
        sourceOutcomeId: 'outcome-core-mechanics-order',
        sourceEventIds: ['event-core-mechanics-order'],
        sourceAnchorRange: {
          rangeHash: 'range-core-mechanics-order',
          hostMessageIds: ['player-core-mechanics-order']
        },
        operations: [{
          type: 'value.set',
          path: ['worldState', 'currentLocationId'],
          value: 'RAW_OPEN_WORLD_REDUCER_VALUE'
        }],
        diagnostics: {
          operationCount: 1,
          changedRoots: ['worldState'],
          boundaryType: 'turn',
          eventCount: 1,
          reactionCount: 0
        }
      }
    }
  },
  provenance: {
    continuityProjection: { source: 'fixture' }
  }
};

const callOrder = [];
const persisted = [];
const coordinator = createTurnCommitCoordinator({
  now: () => '2026-06-29T01:00:00.000Z',
  persist: async (next, summary) => {
    callOrder.push('persist');
    persisted.push({ state: cloneJson(next), summary });
    return { id: `save-${persisted.length}` };
  },
  coreTurnStore: {
    async getTransaction(transactionId) {
      return {
        id: transactionId,
        revisions: { mechanics: 0, runtime: 1, diagnostic: 0, prompt: 0 }
      };
    },
    async getRevisions() {
      return { mechanics: 0, runtime: 1, diagnostic: 0, prompt: 0 };
    },
    async advanceTurn(transactionId, patch) {
      callOrder.push('core-advance');
      assert.equal(transactionId, 'txn-core-mechanics-order');
      assert.equal(patch.phase, 'routePending');
      return { id: transactionId, phase: patch.phase };
    },
    async commitMechanics(transactionId, bundle) {
      callOrder.push('core-mechanics');
      assert.equal(transactionId, 'txn-core-mechanics-order');
      assert.equal(bundle.outcomeId, 'outcome-core-mechanics-order');
      assert.equal(bundle.phaseAfter, 'mechanicsPending');
      assert.equal(bundle.baseMechanicsRevision, 0);
      assert.equal(
        bundle.operations.some((operation) => operation.domain === 'mission'),
        true,
        'CORE mechanics bundle should record the changed mechanics domain'
      );
      assert.equal(
        bundle.operations.some((operation) => operation.domain === 'worldState' && operation.op === 'domainCommitted'),
        false,
        'reducer-owned roots should not also be recorded as broad domain commits'
      );
      const reducerOperation = bundle.operations.find((operation) => operation.op === 'reducerBundleCommitted');
      assert.ok(reducerOperation, 'CORE mechanics bundle should include open-world reducer source evidence');
      assert.equal(reducerOperation.domain, 'openWorld');
      assert.equal(reducerOperation.sourceKind, 'directive.openWorldReducerBundle.v1');
      assert.equal(reducerOperation.operationCount, 1);
      assert.deepEqual(reducerOperation.changedRoots, ['worldState']);
      assert.ok(reducerOperation.sourceHash, 'reducer source evidence should include a stable source hash');
      assert.ok(reducerOperation.valueHash, 'reducer source evidence should include an operation hash');
      assert.equal(JSON.stringify(bundle).includes('RAW_OPEN_WORLD_REDUCER_VALUE'), false);
      return {
        turnId: 'core-turn-1',
        outcomeId: bundle.outcomeId,
        operationHash: 'core-operation-hash'
      };
    }
  }
});

const success = await coordinator.checkpointMechanics({
  beforeCampaignState: baseState(),
  campaignState: committedState(),
  turnPacket,
  ingressId: 'ingress-core-mechanics-order'
});

assert.deepEqual(callOrder, ['core-advance', 'core-mechanics', 'persist']);
assert.equal(success.coreMechanics.status, 'committed');
assert.equal(success.coreMechanics.operationHash, 'core-operation-hash');
assert.equal(persisted.length, 1);
assert.equal(persisted[0].state.runtimeTracking.lastCommittedTurn.outcomeId, 'outcome-core-mechanics-order');

const failedPersisted = [];
const failingCoordinator = createTurnCommitCoordinator({
  now: () => '2026-06-29T01:01:00.000Z',
  persist: async (next, summary) => {
    failedPersisted.push({ state: cloneJson(next), summary });
    return { id: `save-failed-${failedPersisted.length}` };
  },
  coreTurnStore: {
    async getTransaction(transactionId) {
      return {
        id: transactionId,
        revisions: { mechanics: 0, runtime: 1, diagnostic: 0, prompt: 0 }
      };
    },
    async getRevisions() {
      return { mechanics: 0, runtime: 1, diagnostic: 0, prompt: 0 };
    },
    async advanceTurn() {
      return { id: 'txn-core-mechanics-order', phase: 'routePending' };
    },
    async commitMechanics() {
      const error = new Error('simulated CORE mechanics failure');
      error.code = 'DIRECTIVE_CORE_MECHANICS_COMMIT_FAILED';
      throw error;
    }
  }
});

await assert.rejects(
  () => failingCoordinator.checkpointMechanics({
    beforeCampaignState: baseState(),
    campaignState: committedState(),
    turnPacket,
    ingressId: 'ingress-core-mechanics-order'
  }),
  (error) => {
    assert.equal(error.code, 'DIRECTIVE_CORE_MECHANICS_COMMIT_FAILED');
    assert.equal(error.details?.status, 'error');
    return true;
  }
);
assert.equal(failedPersisted.length, 0, 'v1 checkpoint must not persist when CORE mechanics fails first');

const malformedReducerPacket = cloneJson(turnPacket);
malformedReducerPacket.stateDelta.openWorld.reducerBundle.diagnostics.operationCount = 2;
const malformedCalls = [];
const malformedPersisted = [];
const malformedCoordinator = createTurnCommitCoordinator({
  now: () => '2026-06-29T01:02:00.000Z',
  persist: async (next, summary) => {
    malformedCalls.push('persist');
    malformedPersisted.push({ state: cloneJson(next), summary });
    return { id: `save-malformed-${malformedPersisted.length}` };
  },
  coreTurnStore: {
    async advanceTurn() {
      malformedCalls.push('core-advance');
      return { id: 'txn-core-mechanics-order', phase: 'routePending' };
    },
    async commitMechanics() {
      malformedCalls.push('core-mechanics');
      return { turnId: 'should-not-commit' };
    }
  }
});

await assert.rejects(
  () => malformedCoordinator.checkpointMechanics({
    beforeCampaignState: baseState(),
    campaignState: committedState(),
    turnPacket: malformedReducerPacket,
    ingressId: 'ingress-core-mechanics-order'
  }),
  /operationCount mismatch/
);
assert.deepEqual(malformedCalls, [], 'malformed reducer bundles must fail before CORE writes or v1 persistence');
assert.equal(malformedPersisted.length, 0);

const storage = createMemoryStorage();
const adapter = createLogicalStorageAdapter({ storage, hostId: 'fake' });
const staleCoreStore = createCoreStoreV2({
  adapter,
  campaignId: 'campaign-core-mechanics-order',
  saveId: 'save-core-mechanics-order',
  now: () => '2026-06-29T01:03:00.000Z'
});
const staleSourceFrame = {
  id: 'frame-stale-core-mechanics',
  campaignId: 'campaign-core-mechanics-order',
  saveId: 'save-core-mechanics-order',
  chatId: 'ashes-chat',
  hostMessageId: 'player-stale-core-mechanics',
  textHash: hashStableJson({ text: 'stale mechanics source' }),
  sourceRevision: 0
};
await staleCoreStore.beginTurn(staleSourceFrame, {
  transactionId: 'txn-stale-core-mechanics',
  ingressId: 'ingress-core-mechanics-order',
  idempotencyKey: 'begin-stale-core-mechanics'
});
const concurrentSourceFrame = {
  ...staleSourceFrame,
  id: 'frame-concurrent-core-mechanics',
  hostMessageId: 'player-concurrent-core-mechanics',
  textHash: hashStableJson({ text: 'concurrent mechanics source' })
};
await staleCoreStore.beginTurn(concurrentSourceFrame, {
  transactionId: 'txn-concurrent-core-mechanics',
  ingressId: 'ingress-concurrent-core-mechanics',
  idempotencyKey: 'begin-concurrent-core-mechanics'
});
await staleCoreStore.advanceTurn('txn-concurrent-core-mechanics', {
  phase: 'routePending',
  route: 'directivePosted',
  idempotencyKey: 'route-concurrent-core-mechanics'
});
await staleCoreStore.commitMechanics('txn-concurrent-core-mechanics', {
  baseMechanicsRevision: 0,
  idempotencyKey: 'mechanics-concurrent-core-mechanics',
  turnId: 'turn-concurrent-core-mechanics',
  outcomeId: 'outcome-concurrent-core-mechanics',
  summary: 'Concurrent mechanics commit.',
  operations: [{ domain: 'mission', op: 'domainCommitted', valueHash: 'concurrent' }],
  committedRoots: ['mission'],
  phaseAfter: 'mechanicsPending'
});
const staleState = baseState();
staleState.runtimeTracking.ingressLedger[0].coreTransactionId = 'txn-stale-core-mechanics';
const stalePersisted = [];
const staleCoordinator = createTurnCommitCoordinator({
  now: () => '2026-06-29T01:04:00.000Z',
  persist: async (next, summary) => {
    stalePersisted.push({ state: cloneJson(next), summary });
    return { id: `save-stale-${stalePersisted.length}` };
  },
  coreTurnStore: staleCoreStore
});
const staleEventsBefore = staleCoreStore.state.events.length;
await assert.rejects(
  () => staleCoordinator.checkpointMechanics({
    beforeCampaignState: staleState,
    campaignState: {
      ...committedState(),
      runtimeTracking: staleState.runtimeTracking
    },
    turnPacket,
    ingressId: 'ingress-core-mechanics-order'
  }),
  (error) => {
    assert.equal(error.code, 'DIRECTIVE_CORE_STALE_MECHANICS_REVISION');
    assert.equal(error.details?.status, 'error');
    return true;
  }
);
assert.equal(stalePersisted.length, 0, 'stale CORE mechanics must not persist the v1 checkpoint');
assert.equal(staleCoreStore.state.events.length, staleEventsBefore, 'stale CORE mechanics must fail before route advance');
assert.equal(staleCoreStore.state.transactions['txn-stale-core-mechanics'].phase, 'observed');

console.log('Turn commit coordinator CORE mechanics ordering tests passed.');
