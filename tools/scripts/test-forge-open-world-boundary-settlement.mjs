import assert from 'node:assert/strict';

import {
  createForgeCoordinator
} from '../../src/jobs/forge-coordinator.mjs';
import {
  createOpenWorldBoundarySettlementWorkerResult
} from '../../src/jobs/forge-open-world-boundary-settlement.mjs';
import {
  compactOpenWorldReducerBundleRef
} from '../../src/directors/open-world-event-reducers.mjs';
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
  campaignId: 'campaign-forge-open-world',
  saveId: 'save-forge-open-world',
  now: () => `2026-06-30T15:00:${String(tick++).padStart(2, '0')}.000Z`
});
const sourceFrame = createTurnSourceFrameContract({
  id: 'frame:open-world-source-1',
  campaignId: 'campaign-forge-open-world',
  saveId: 'save-forge-open-world',
  chatId: 'ashes-chat',
  hostMessageId: 'player-open-world-source-1',
  textHash: hashStableJson({ text: 'Sam crosses the bridge boundary and accepts the convoy thread.' }),
  createdAt: '2026-06-30T15:00:00.000Z'
});
const sourceFrameRef = createTurnSourceFrameRef(sourceFrame);
const transaction = await coreStore.beginTurn(sourceFrame, {
  transactionId: 'txn-open-world-1',
  ingressId: 'ingress-open-world-1',
  idempotencyKey: 'begin-open-world-1'
});
await coreStore.advanceTurn(transaction.id, {
  phase: 'routePending',
  route: 'directivePosted',
  idempotencyKey: 'route-open-world-1'
});

const reducerBundle = {
  kind: 'directive.openWorldReducerBundle.v1',
  sourceOutcomeId: 'outcome-open-world-1',
  sourceEventIds: ['event-open-world-1', 'event-open-world-2'],
  sourceAnchorRange: {
    rangeHash: 'range-hash-open-world-1',
    hostMessageIds: ['RAW_OPEN_WORLD_HOST_RANGE']
  },
  operations: [{
    type: 'value.set',
    path: ['worldState', 'currentLocationId'],
    value: 'RAW_OPEN_WORLD_LOCATION_VALUE'
  }, {
    type: 'collection.mergeById',
    path: ['questLedger', 'instances'],
    upsert: [{
      id: 'quest-open-world-1',
      title: 'RAW_OPEN_WORLD_QUEST_TITLE'
    }],
    remove: []
  }, {
    type: 'value.set',
    path: ['timeLedger', 'currentPeriod'],
    value: 'RAW_OPEN_WORLD_TIME_VALUE'
  }],
  diagnostics: {
    operationCount: 3,
    changedRoots: ['worldState', 'questLedger', 'timeLedger'],
    boundaryType: 'locationTransition',
    eventCount: 2,
    reactionCount: 1,
    checkpointRequired: true
  }
};
const reducerRef = compactOpenWorldReducerBundleRef(reducerBundle, {
  outcomeId: 'outcome-open-world-1'
});
assert.equal(reducerRef.operationCount, 3);
assert.deepEqual(reducerRef.changedRoots, ['questLedger', 'timeLedger', 'worldState']);
assert.equal(reducerRef.sourceAnchorRangeHash, 'range-hash-open-world-1');
assert.equal(JSON.stringify(reducerRef).includes('RAW_OPEN_WORLD'), false);
assert.equal(JSON.stringify(reducerRef).includes('hostMessageIds'), false);

const workerPreview = createOpenWorldBoundarySettlementWorkerResult({
  transactionId: transaction.id,
  outcomeId: 'outcome-open-world-1',
  sourceFrameRef,
  reducerBundle,
  boundaryType: 'locationTransition',
  sceneId: 'scene-open-world-1',
  phaseId: 'phase-open-world-1',
  locationId: 'breckenridge-bridge',
  tags: ['open-world-boundary'],
  keywords: ['Bridge', 'Boundary']
});
assert.equal(workerPreview.operations.length, 0);
assert.equal(workerPreview.effectRefs.length, 1);
assert.equal(workerPreview.effectRefs[0].kind, 'directive.openWorldBoundarySettlementRef.v1');
assert.equal(workerPreview.effectRefs[0].operationCount, 3);
assert.deepEqual(workerPreview.effectRefs[0].changedRoots, ['questLedger', 'timeLedger', 'worldState']);
assert.deepEqual(workerPreview.promptDirtyDomains, ['missionQuestThread', 'sceneTime', 'continuity', 'sourceBinding']);
assert.equal(JSON.stringify(workerPreview).includes('RAW_OPEN_WORLD'), false);
assert.equal(JSON.stringify(workerPreview).includes('hostMessageIds'), false);

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
const mechanicsRevisionBefore = coreStore.state.revisions.mechanics;
const settled = await forge.settleOpenWorldBoundary({
  transactionId: transaction.id,
  sourceToken: 'source-token-open-world-1',
  sourceFrame,
  sourceFrameRef,
  outcomeId: 'outcome-open-world-1',
  reducerBundle,
  boundaryType: 'locationTransition',
  sceneId: 'scene-open-world-1',
  phaseId: 'phase-open-world-1',
  locationId: 'breckenridge-bridge',
  flushLens: true,
  idempotencyKey: 'open-world-boundary-1'
});
assert.equal(settled.status, 'settled');
assert.equal(settled.applied, true);
assert.equal(settled.providerCallAttempted, false);
assert.equal(settled.batch.operations.length, 0);
assert.equal(settled.batch.effectRefs.length, 1);
assert.equal(settled.batch.backgroundEffectRefs.length, 1);
assert.equal(settled.workerResults[0].operations.length, 0);
assert.equal(settled.workerResults[0].effectRefs[0].kind, 'directive.openWorldBoundarySettlementRef.v1');
assert.deepEqual(settled.batch.promptDirtyDomains, ['missionQuestThread', 'sceneTime', 'continuity', 'sourceBinding']);
assert.equal(coreStore.state.revisions.mechanics, mechanicsRevisionBefore);
assert.deepEqual(sourceChecks.map((entry) => entry.phase), ['beforeBackgroundCommit']);
assert.equal(coreStore.state.events.filter((event) => event.type === 'backgroundBatchCommitted').length, 1);
assert.deepEqual(coreStore.state.promptDirtyDomains, ['missionQuestThread', 'sceneTime', 'continuity', 'sourceBinding']);
assert.equal(lensDirtyCalls.length, 1);
assert.deepEqual(lensDirtyCalls[0].dirtyDomains, ['missionQuestThread', 'sceneTime', 'continuity', 'sourceBinding']);
assert.equal(lensFlushCalls.length, 1);
assert.deepEqual(lensFlushCalls[0].cacheInputs, {
  recallIndexRevision: null,
  sceneSealRevision: null,
  pressureArcDigestRevision: null
});

const projections = coreStore.readProjections();
assert.equal(projections.backgroundBatches.at(-1).effectCount, 1);
assert.equal(projections.backgroundBatches.at(-1).operationCount, 0);
assert.equal(projections.backgroundEffectRefs.at(-1).kind, 'directive.openWorldBoundarySettlementRef.v1');
assert.equal(projections.backgroundEffectRefs.at(-1).operationCount, 3);
assert.deepEqual(projections.backgroundEffectRefs.at(-1).changedRoots, ['questLedger', 'timeLedger', 'worldState']);

const persistedProjections = await readCoreStoreProjectionsV2(adapter, {
  campaignId: 'campaign-forge-open-world',
  saveId: 'save-forge-open-world'
});
assert.equal(
  persistedProjections.backgroundEffectRefs.some((ref) => ref.kind === 'directive.openWorldBoundarySettlementRef.v1'),
  true,
  'Persisted CORE projections should derive open-world boundary refs from background batch events.'
);
const hydrated = await loadCoreStoreStateV2(adapter, {
  campaignId: 'campaign-forge-open-world',
  saveId: 'save-forge-open-world'
});
assert.equal(
  hydrated.transactions[transaction.id].backgroundBatchIds.includes(settled.batch.batchId),
  true,
  'Hydrated CORE state should preserve the open-world boundary batch id.'
);

const replayed = await forge.settleOpenWorldBoundary({
  transactionId: transaction.id,
  sourceToken: 'source-token-open-world-1',
  sourceFrame,
  sourceFrameRef,
  outcomeId: 'outcome-open-world-1',
  reducerBundle,
  boundaryType: 'locationTransition',
  sceneId: 'scene-open-world-1',
  phaseId: 'phase-open-world-1',
  locationId: 'breckenridge-bridge',
  flushLens: true,
  idempotencyKey: 'open-world-boundary-1'
});
assert.equal(replayed.status, 'replayed');
assert.equal(coreStore.state.events.filter((event) => event.type === 'backgroundBatchCommitted').length, 1);
assert.equal(lensFlushCalls.length, 1, 'Open-world boundary replay should not flush LENS again.');

const mismatchedReplay = await forge.settleOpenWorldBoundary({
  transactionId: transaction.id,
  sourceToken: 'source-token-open-world-1',
  sourceFrame,
  sourceFrameRef,
  outcomeId: 'outcome-open-world-1',
  reducerBundle,
  boundaryType: 'locationTransition',
  flushLens: true,
  idempotencyKey: 'open-world-boundary-1'
});
assert.equal(mismatchedReplay.status, 'rejected');
assert.equal(mismatchedReplay.reason, 'accepted-batch-replay-mismatch');
assert.equal(coreStore.state.events.filter((event) => event.type === 'backgroundBatchCommitted').length, 1);
assert.equal(lensFlushCalls.length, 1, 'Mismatched open-world boundary replay should not flush LENS.');

const staleStorage = createMemoryStorage();
const staleAdapter = createLogicalStorageAdapter({ storage: staleStorage, hostId: 'fake' });
const staleCoreStore = createCoreStoreV2({
  adapter: staleAdapter,
  campaignId: 'campaign-forge-open-world',
  saveId: 'save-forge-open-world-stale',
  now: () => `2026-06-30T15:10:${String(tick++).padStart(2, '0')}.000Z`
});
const staleFrame = createTurnSourceFrameContract({
  id: 'frame:open-world-stale',
  campaignId: 'campaign-forge-open-world',
  saveId: 'save-forge-open-world-stale',
  chatId: 'ashes-chat',
  hostMessageId: 'player-open-world-stale',
  textHash: hashStableJson({ text: 'A stale open-world boundary should not settle.' }),
  createdAt: '2026-06-30T15:10:00.000Z'
});
const staleTransaction = await staleCoreStore.beginTurn(staleFrame, {
  transactionId: 'txn-open-world-stale',
  ingressId: 'ingress-open-world-stale',
  idempotencyKey: 'begin-open-world-stale'
});
await staleCoreStore.advanceTurn(staleTransaction.id, {
  phase: 'routePending',
  route: 'directivePosted',
  idempotencyKey: 'route-open-world-stale'
});
const staleForge = createForgeCoordinator({
  coreStore: staleCoreStore,
  isSourceCurrent: async () => ({ ok: false, reason: 'source-edited-before-boundary-settlement' }),
  clock: () => '2026-06-30T15:11:00.000Z'
});
const stale = await staleForge.settleOpenWorldBoundary({
  transactionId: staleTransaction.id,
  sourceFrame: staleFrame,
  sourceFrameRef: createTurnSourceFrameRef(staleFrame),
  outcomeId: 'outcome-open-world-stale',
  reducerBundle: {
    ...reducerBundle,
    sourceOutcomeId: 'outcome-open-world-stale'
  },
  boundaryType: 'locationTransition',
  idempotencyKey: 'open-world-boundary-stale'
});
assert.equal(stale.status, 'staleBeforeBackgroundCommit');
assert.equal(stale.applied, false);
assert.equal(stale.providerCallAttempted, false);
assert.equal(staleCoreStore.state.events.filter((event) => event.type === 'backgroundBatchCommitted').length, 0);

const allOutput = [
  JSON.stringify(workerPreview),
  JSON.stringify(settled),
  serializedStorage(storage),
  serializedStorage(staleStorage)
].join('\n');
for (const canary of [
  'RAW_OPEN_WORLD_LOCATION_VALUE',
  'RAW_OPEN_WORLD_QUEST_TITLE',
  'RAW_OPEN_WORLD_TIME_VALUE',
  'RAW_OPEN_WORLD_HOST_RANGE'
]) {
  assert.equal(allOutput.includes(canary), false, `${canary} must not be persisted or returned.`);
}

console.log('FORGE open-world boundary settlement tests passed.');
