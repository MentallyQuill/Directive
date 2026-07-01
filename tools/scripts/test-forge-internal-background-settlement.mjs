import assert from 'node:assert/strict';

import {
  createForgeCoordinator
} from '../../src/jobs/forge-coordinator.mjs';
import {
  createTurnSourceFrameContract,
  createTurnSourceFrameRef,
  hashStableJson
} from '../../src/runtime/architecture-redesign-contracts.mjs';
import {
  createCoreStoreV2,
  loadCoreStoreStateV2,
  readCoreStoreProjectionsV2
} from '../../src/storage/core-store-v2.mjs';
import { createLogicalStorageAdapter } from '../../src/storage/logical-storage-adapter.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createMemoryStorage() {
  const files = new Map();
  return {
    files,
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

function serializedStorage(storage) {
  return JSON.stringify([...storage.files.entries()]);
}

let tick = 0;
const storage = createMemoryStorage();
const adapter = createLogicalStorageAdapter({ storage, hostId: 'fake' });
const coreStore = createCoreStoreV2({
  adapter,
  campaignId: 'campaign-forge-internal',
  saveId: 'save-forge-internal',
  now: () => `2026-06-30T15:00:${String(tick++).padStart(2, '0')}.000Z`
});
const sourceFrame = createTurnSourceFrameContract({
  id: 'frame:internal-source-1',
  campaignId: 'campaign-forge-internal',
  saveId: 'save-forge-internal',
  chatId: 'ashes-chat',
  hostMessageId: 'player-internal-source-1',
  textHash: hashStableJson({ text: 'Sam takes the bridge handoff and lets the room breathe.' }),
  createdAt: '2026-06-30T15:00:00.000Z'
});
const sourceFrameRef = createTurnSourceFrameRef(sourceFrame);
const transaction = await coreStore.beginTurn(sourceFrame, {
  transactionId: 'txn-internal-1',
  ingressId: 'ingress-internal-1',
  idempotencyKey: 'begin-internal-1'
});
await coreStore.advanceTurn(transaction.id, {
  phase: 'routePending',
  route: 'directivePosted',
  idempotencyKey: 'route-internal-1'
});

const sourceChecks = [];
const lensDirtyCalls = [];
const lensFlushCalls = [];
const lens = {
  markDirty(payload = {}) {
    lensDirtyCalls.push(cloneJson(payload));
    return { accepted: true };
  },
  async flushBackground(payload = {}) {
    lensFlushCalls.push(cloneJson(payload));
    return {
      status: 'installed',
      cacheInputs: cloneJson(payload.cacheInputs || {})
    };
  }
};
const forge = createForgeCoordinator({
  coreStore,
  lens,
  isSourceCurrent: async (payload) => {
    sourceChecks.push(cloneJson(payload));
    return { ok: true };
  },
  clock: () => `2026-06-30T15:01:${String(sourceChecks.length).padStart(2, '0')}.000Z`
});

const internalBundle = {
  idempotencyKey: 'internal-narrative-thread-1',
  batchId: 'narrative-thread:txn-internal-1:outcome-internal-1',
  phaseAfter: 'backgroundSettling',
  outcomeId: 'outcome-internal-1',
  promptDirtyDomains: ['threadLedger', 'questLedger', 'commandBearing'],
  backgroundEffectRefs: [{
    effect: 'narrativeThreadExtraction',
    status: 'applied',
    outcomeId: 'outcome-internal-1',
    ingressId: 'ingress-internal-1',
    sourceFrameId: sourceFrame.id,
    resultHash: hashStableJson({ createdThreadCount: 1 }),
    rawPromptBody: 'RAW_INTERNAL_PROMPT_BODY',
    providerOutput: 'RAW_INTERNAL_PROVIDER_OUTPUT'
  }],
  workers: [{
    worker: 'narrativeThreadDirector',
    workerId: 'narrativeThreadDirector',
    sidecarType: 'narrativeThreadExtraction',
    roleId: 'narrativeThreadDirector',
    status: 'applied',
    resultHash: hashStableJson({ createdThreadCount: 1 }),
    rawProviderOutput: 'RAW_INTERNAL_WORKER_PROVIDER_OUTPUT'
  }]
};

const settled = await forge.settleInternalBackgroundBatch({
  transactionId: transaction.id,
  sourceToken: 'source-token-internal-1',
  sourceFrame,
  sourceFrameRef,
  internalOwner: 'narrativeThreadDirector',
  bundle: internalBundle,
  flushLens: true,
  cacheInputs: {
    recallIndexRevision: 'recall-revision-internal-1'
  }
});
assert.equal(settled.status, 'internalSettled');
assert.equal(settled.applied, true);
assert.equal(settled.providerCallAttempted, false);
assert.equal(settled.internalOwner, 'narrativeThreadDirector');
assert.equal(settled.operationCount, 0);
assert.equal(settled.effectCount, 1);
assert.equal(settled.workerCount, 1);
assert.equal(JSON.stringify(settled).includes('RAW_INTERNAL'), false);
assert.deepEqual(sourceChecks.map((entry) => entry.phase), ['beforeInternalBackgroundCommit']);
assert.equal(coreStore.state.events.filter((event) => event.type === 'backgroundBatchCommitted').length, 1);
assert.deepEqual(coreStore.state.promptDirtyDomains, ['threadLedger', 'questLedger', 'commandBearing']);
assert.equal(lensDirtyCalls.length, 1);
assert.deepEqual(lensDirtyCalls[0].dirtyDomains, ['threadLedger', 'questLedger', 'commandBearing']);
assert.equal(lensFlushCalls.length, 1);
assert.deepEqual(lensFlushCalls[0].cacheInputs, { recallIndexRevision: 'recall-revision-internal-1' });

const projections = coreStore.readProjections();
const background = projections.backgroundBatches.find((entry) => entry.batchId === internalBundle.batchId);
assert.ok(background, 'CORE projections should expose the internal FORGE background batch.');
assert.equal(background.effectCount, 1);
assert.equal(background.workerCount, 1);
assert.deepEqual(background.dirtyDomains, ['threadLedger', 'questLedger', 'commandBearing']);

const persistedProjections = await readCoreStoreProjectionsV2(adapter, {
  campaignId: 'campaign-forge-internal',
  saveId: 'save-forge-internal'
});
assert.equal(
  persistedProjections.backgroundBatches.some((entry) => entry.batchId === internalBundle.batchId),
  true,
  'Persisted CORE projections should derive the internal FORGE background batch from event segments.'
);
const hydrated = await loadCoreStoreStateV2(adapter, {
  campaignId: 'campaign-forge-internal',
  saveId: 'save-forge-internal'
});
assert.equal(
  hydrated.transactions[transaction.id].backgroundBatchIds.includes(internalBundle.batchId),
  true,
  'Hydrated CORE state should preserve internal FORGE batch ids.'
);

const replayed = await forge.settleInternalBackgroundBatch({
  transactionId: transaction.id,
  sourceToken: 'source-token-internal-1',
  sourceFrame,
  sourceFrameRef,
  internalOwner: 'narrativeThreadDirector',
  bundle: internalBundle,
  flushLens: true
});
assert.equal(replayed.status, 'replayed');
assert.equal(coreStore.state.events.filter((event) => event.type === 'backgroundBatchCommitted').length, 1);
assert.equal(lensFlushCalls.length, 1, 'Internal FORGE replay should not flush LENS again.');

const staleStorage = createMemoryStorage();
const staleAdapter = createLogicalStorageAdapter({ storage: staleStorage, hostId: 'fake' });
const staleCoreStore = createCoreStoreV2({
  adapter: staleAdapter,
  campaignId: 'campaign-forge-internal',
  saveId: 'save-forge-internal-stale',
  now: () => `2026-06-30T15:10:${String(tick++).padStart(2, '0')}.000Z`
});
const staleFrame = createTurnSourceFrameContract({
  id: 'frame:internal-stale',
  campaignId: 'campaign-forge-internal',
  saveId: 'save-forge-internal-stale',
  chatId: 'ashes-chat',
  hostMessageId: 'player-internal-stale',
  textHash: hashStableJson({ text: 'A stale source should not settle.' }),
  createdAt: '2026-06-30T15:10:00.000Z'
});
const staleTransaction = await staleCoreStore.beginTurn(staleFrame, {
  transactionId: 'txn-internal-stale',
  ingressId: 'ingress-internal-stale',
  idempotencyKey: 'begin-internal-stale'
});
await staleCoreStore.advanceTurn(staleTransaction.id, {
  phase: 'routePending',
  route: 'directivePosted',
  idempotencyKey: 'route-internal-stale'
});
const staleForge = createForgeCoordinator({
  coreStore: staleCoreStore,
  isSourceCurrent: async () => ({ ok: false, reason: 'source-edited-before-settlement' }),
  clock: () => '2026-06-30T15:11:00.000Z'
});
const stale = await staleForge.settleInternalBackgroundBatch({
  transactionId: staleTransaction.id,
  sourceFrameRef: createTurnSourceFrameRef(staleFrame),
  internalOwner: 'commandLogSummary',
  bundle: {
    ...internalBundle,
    idempotencyKey: 'internal-stale-command-log',
    batchId: 'command-log-summary:txn-internal-stale:outcome-stale',
    backgroundEffectRefs: [{
      effect: 'commandLogAssistedSummary',
      rawSummary: 'RAW_STALE_ASSISTED_SUMMARY'
    }]
  }
});
assert.equal(stale.status, 'staleBeforeInternalBackgroundCommit');
assert.equal(stale.applied, false);
assert.equal(stale.providerCallAttempted, false);
assert.equal(staleCoreStore.state.events.filter((event) => event.type === 'backgroundBatchCommitted').length, 0);

const allPersisted = serializedStorage(storage) + serializedStorage(staleStorage);
for (const canary of [
  'RAW_INTERNAL_PROMPT_BODY',
  'RAW_INTERNAL_PROVIDER_OUTPUT',
  'RAW_INTERNAL_WORKER_PROVIDER_OUTPUT',
  'RAW_STALE_ASSISTED_SUMMARY'
]) {
  assert.equal(allPersisted.includes(canary), false, `${canary} must not be persisted.`);
}

console.log('FORGE internal background settlement tests passed.');
