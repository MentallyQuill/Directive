import assert from 'node:assert/strict';

import {
  createForgeCoordinator
} from '../../src/jobs/forge-coordinator.mjs';
import {
  createForgeBatchCommit,
  normalizeForgeWorkerResult
} from '../../src/jobs/forge-contracts.mjs';
import {
  createPressureArcDigestWorkerResult,
  createRecallEntryFromPressureArcDigest,
  normalizePressureArcDigest
} from '../../src/jobs/forge-pressure-arc-digest.mjs';
import {
  queryRecallIndex
} from '../../src/retrieval/recall-index.mjs';
import {
  createTurnSourceFrameContract,
  createTurnSourceFrameRef,
  hashStableJson
} from '../../src/runtime/architecture-redesign-contracts.mjs';
import {
  createLensPromptBudgetTrace
} from '../../src/runtime/lens-prompt-budget-trace.mjs';
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
  campaignId: 'campaign-forge-pressure-arc',
  saveId: 'save-forge-pressure-arc',
  now: () => `2026-06-30T15:00:${String(tick++).padStart(2, '0')}.000Z`
});
const sourceFrame = createTurnSourceFrameContract({
  id: 'frame:pressure-arc-source-1',
  campaignId: 'campaign-forge-pressure-arc',
  saveId: 'save-forge-pressure-arc',
  chatId: 'ashes-chat',
  hostMessageId: 'player-pressure-arc-source-1',
  textHash: hashStableJson({ text: 'Sam accepts a tighter command burden and keeps the convoy thread moving.' }),
  createdAt: '2026-06-30T15:00:00.000Z'
});
const sourceFrameRef = createTurnSourceFrameRef(sourceFrame);
const transaction = await coreStore.beginTurn(sourceFrame, {
  transactionId: 'txn-pressure-arc-1',
  ingressId: 'ingress-pressure-arc-1',
  idempotencyKey: 'begin-pressure-arc-1'
});
await coreStore.advanceTurn(transaction.id, {
  phase: 'routePending',
  route: 'directiveCommit',
  idempotencyKey: 'route-pressure-arc-1'
});

const sourceChecks = [];
const lensDirtyCalls = [];
const lensFlushCalls = [];
const lens = {
  markDirty(payload = {}) {
    lensDirtyCalls.push(cloneJson(payload));
    return { accepted: true, dirtyDomains: payload.dirtyDomains || [] };
  },
  async flushBackground(payload = {}) {
    lensFlushCalls.push(cloneJson(payload));
    return {
      status: 'installed',
      lane: payload.lane || 'background',
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

const digestInput = {
  id: 'pressure-arc-digest-bridge-handoff',
  campaignId: 'campaign-forge-pressure-arc',
  saveId: 'save-forge-pressure-arc',
  transactionId: transaction.id,
  outcomeId: 'outcome-pressure-arc-1',
  sourceFrameRef,
  chapterId: 'chapter-1',
  phaseId: 'prelude-handoff',
  sceneId: 'bridge-handoff',
  locationId: 'breckenridge-bridge',
  pressureIds: ['pressure-cross-escort'],
  arcIds: ['arc-command-burden'],
  threadIds: ['thread-cross-handoff'],
  missionIds: ['mission-empty-convoy'],
  actorIds: ['sam-vickers', 'mara-whitaker'],
  subjectIds: ['convoy-handoff', 'command-network'],
  tags: ['pressure', 'handoff'],
  keywords: ['Pressure', 'Arc', 'Command'],
  summary: 'RAW_PROVIDER_PRESSURE_ARC_SUMMARY: pressure closes around the handoff.',
  pressureRefs: [{
    kind: 'directive.pressureRef.v1',
    id: 'pressure-cross-escort',
    rawPressureBody: 'RAW_PRESSURE_BODY'
  }],
  arcRefs: [{
    kind: 'directive.storyArcRef.v1',
    id: 'arc-command-burden',
    rawArcText: 'RAW_ARC_TEXT'
  }],
  openThreadRefs: [{
    kind: 'directive.openThreadRef.v1',
    id: 'thread-cross-handoff',
    promptBody: 'RAW_THREAD_PROMPT_BODY'
  }],
  callbackRefs: [{
    kind: 'directive.callbackRef.v1',
    id: 'callback-bridge-look',
    providerOutput: 'RAW_CALLBACK_PROVIDER_OUTPUT'
  }]
};

const workerPreview = createPressureArcDigestWorkerResult({ digest: digestInput });
assert.equal(workerPreview.effectRefs.some((ref) => ref.kind === 'directive.pressureArcDigestRef.v1'), true);
assert.equal(workerPreview.effectRefs.some((ref) => ref.kind === 'directive.recallIndexEntryRef.v1'), true);
const normalizedGenericWorker = normalizeForgeWorkerResult({
  id: 'pressureArcDigest',
  allowedRoots: []
}, {
  effectRefs: workerPreview.effectRefs,
  promptDirtyDomains: workerPreview.promptDirtyDomains,
  providerOutput: 'RAW_GENERIC_PRESSURE_PROVIDER_OUTPUT',
  diagnostics: {
    providerOutput: 'RAW_GENERIC_PRESSURE_PROVIDER_OUTPUT'
  }
});
assert.equal(normalizedGenericWorker.effectRefs.find((ref) => ref.kind === 'directive.pressureArcDigestRef.v1').phaseId, 'prelude-handoff');
assert.equal(JSON.stringify(normalizedGenericWorker).includes('RAW_GENERIC_PRESSURE_PROVIDER_OUTPUT'), false);
const genericBatch = createForgeBatchCommit({
  transactionId: transaction.id,
  sourceFrame,
  workerResults: [normalizedGenericWorker],
  idempotencyKey: 'generic-pressure-arc-digest-batch'
});
assert.equal(genericBatch.pressureArcDigestRefs.length, 1);
assert.equal(genericBatch.recallIndexEntryRefs.length, 1);
assert.equal(typeof genericBatch.recallRevisions.pressureArcDigestRevision, 'string');

const settled = await forge.settlePressureArcDigest({
  transactionId: transaction.id,
  sourceToken: 'source-token-pressure-arc-1',
  sourceFrame,
  sourceFrameRef,
  outcomeId: 'outcome-pressure-arc-1',
  digest: digestInput,
  flushLens: true,
  idempotencyKey: 'pressure-arc-digest-1'
});
assert.equal(settled.status, 'settled');
assert.equal(settled.applied, true);
assert.equal(settled.providerCallAttempted, false);
assert.equal(settled.lensResult.status, 'installed');
assert.equal(lensDirtyCalls.length, 1);
assert.equal(lensDirtyCalls[0].lane, 'background');
assert.deepEqual(lensFlushCalls[0].cacheInputs, settled.batch.recallRevisions);
assert.equal(lensFlushCalls[0].cacheInputs.pressureArcDigestRevision, settled.batch.recallRevisions.pressureArcDigestRevision);
assert.equal(settled.batch.pressureArcDigestRefs.length, 1);
assert.equal(settled.batch.recallIndexEntryRefs.length, 1);
assert.deepEqual(sourceChecks.map((entry) => entry.phase), ['beforeBackgroundCommit']);
assert.equal(coreStore.state.events.filter((event) => event.type === 'backgroundBatchCommitted').length, 1);
assert.deepEqual(coreStore.state.promptDirtyDomains, ['missionQuestThread', 'command', 'sourceBinding', 'crewShipRelationship']);

const projections = coreStore.readProjections();
assert.equal(projections.pressureArcDigestRefs.length, 1);
assert.equal(projections.pressureArcDigestRefs[0].id, 'pressure-arc-digest-bridge-handoff');
assert.equal(projections.pressureArcDigestRefs[0].sourceFrameId, sourceFrame.id);
assert.equal(projections.pressureArcDigestRevision, settled.batch.recallRevisions.pressureArcDigestRevision);
assert.equal(projections.recallIndex.entryRefs.length, 1);
assert.equal(projections.recallIndex.entryRefs[0].pressureArcDigestId, 'pressure-arc-digest-bridge-handoff');
assert.equal(typeof projections.recallIndex.revision, 'string');
assert.equal(projections.backgroundBatches.at(-1).effectCount, 2);
assert.deepEqual(projections.backgroundBatches.at(-1).dirtyDomains, ['missionQuestThread', 'command', 'sourceBinding', 'crewShipRelationship']);

const normalizedDigest = normalizePressureArcDigest(digestInput);
const recallEntry = createRecallEntryFromPressureArcDigest(normalizedDigest);
const recallResult = queryRecallIndex({
  entries: [recallEntry],
  query: {
    campaignId: 'campaign-forge-pressure-arc',
    saveId: 'save-forge-pressure-arc',
    missionIds: ['mission-empty-convoy'],
    threadIds: ['thread-cross-handoff'],
    keywords: ['pressure'],
    limit: 4
  }
});
assert.equal(recallResult.includedRefs.length, 1);
assert.equal(recallResult.includedRefs[0].id, 'recall:pressure-arc-digest-bridge-handoff');

const budgetTrace = createLensPromptBudgetTrace({
  packetId: 'packet-pressure-arc-1',
  promptRevision: 8,
  cacheKey: 'cache-pressure-arc-1',
  lanes: [{
    id: 'missionPressure',
    budgetTokens: 32,
    refs: projections.pressureArcDigestRefs.map((ref) => ({
      ...ref,
      estimatedTokens: 18
    }))
  }],
  cacheInputs: {
    mechanicsRevision: coreStore.state.revisions.mechanics,
    promptDomainVector: coreStore.state.promptDirtyDomains,
    recallIndexRevision: projections.recallIndex.revision,
    sceneSealRevision: projections.sceneSealRevision,
    pressureArcDigestRevision: projections.pressureArcDigestRevision
  }
});
assert.equal(budgetTrace.lanes.find((lane) => lane.id === 'missionPressure').includedRefs.length, 1);
assert.equal(budgetTrace.cacheInputs.pressureArcDigestRevision, projections.pressureArcDigestRevision);

const hydrated = await loadCoreStoreStateV2(adapter, {
  campaignId: 'campaign-forge-pressure-arc',
  saveId: 'save-forge-pressure-arc'
});
assert.deepEqual(hydrated.promptDirtyDomains, coreStore.state.promptDirtyDomains);
const hydratedProjections = await readCoreStoreProjectionsV2(adapter, {
  campaignId: 'campaign-forge-pressure-arc',
  saveId: 'save-forge-pressure-arc'
});
assert.equal(hydratedProjections.pressureArcDigestRefs.length, 1);
assert.equal(hydratedProjections.pressureArcDigestRevision, projections.pressureArcDigestRevision);
assert.equal(hydratedProjections.recallIndex.entryRefs.length, 1);
assert.equal(hydratedProjections.recallIndex.revision, projections.recallIndex.revision);

const beforeReplayEvents = coreStore.state.events.length;
const replayed = await forge.settlePressureArcDigest({
  transactionId: transaction.id,
  sourceToken: 'source-token-pressure-arc-1',
  sourceFrame,
  sourceFrameRef,
  outcomeId: 'outcome-pressure-arc-1',
  digest: digestInput,
  idempotencyKey: 'pressure-arc-digest-1'
});
assert.equal(replayed.status, 'replayed');
assert.equal(coreStore.state.events.length, beforeReplayEvents);
assert.equal(lensFlushCalls.length, 1);

const staleFrame = createTurnSourceFrameContract({
  id: 'frame:pressure-arc-source-stale',
  campaignId: 'campaign-forge-pressure-arc',
  saveId: 'save-forge-pressure-arc',
  chatId: 'ashes-chat',
  hostMessageId: 'player-pressure-arc-source-stale',
  textHash: hashStableJson({ text: 'Stale source should not settle pressure digest.' }),
  createdAt: '2026-06-30T15:02:00.000Z'
});
const staleTransaction = await coreStore.beginTurn(staleFrame, {
  transactionId: 'txn-pressure-arc-stale',
  ingressId: 'ingress-pressure-arc-stale',
  idempotencyKey: 'begin-pressure-arc-stale'
});
await coreStore.advanceTurn(staleTransaction.id, {
  phase: 'routePending',
  route: 'directiveCommit',
  idempotencyKey: 'route-pressure-arc-stale'
});
const staleForge = createForgeCoordinator({
  coreStore,
  isSourceCurrent: async () => ({ ok: false, reason: 'source-edited-before-digest' }),
  clock: () => '2026-06-30T15:03:00.000Z'
});
const backgroundBeforeStale = coreStore.state.events.filter((event) => event.type === 'backgroundBatchCommitted').length;
const dirtyBeforeStale = [...coreStore.state.promptDirtyDomains];
const stale = await staleForge.settlePressureArcDigest({
  transactionId: staleTransaction.id,
  sourceToken: 'source-token-pressure-arc-stale',
  sourceFrame: staleFrame,
  sourceFrameRef: createTurnSourceFrameRef(staleFrame),
  digest: {
    ...digestInput,
    id: 'pressure-arc-digest-stale',
    transactionId: staleTransaction.id,
    sourceFrameRef: createTurnSourceFrameRef(staleFrame)
  },
  idempotencyKey: 'pressure-arc-digest-stale'
});
assert.equal(stale.status, 'staleBeforeBackgroundCommit');
assert.equal(coreStore.state.events.filter((event) => event.type === 'backgroundBatchCommitted').length, backgroundBeforeStale);
assert.deepEqual(coreStore.state.promptDirtyDomains, dirtyBeforeStale);

const serialized = serializedStorage(storage);
for (const marker of [
  'RAW_PROVIDER_PRESSURE_ARC_SUMMARY',
  'RAW_PRESSURE_BODY',
  'RAW_ARC_TEXT',
  'RAW_THREAD_PROMPT_BODY',
  'RAW_CALLBACK_PROVIDER_OUTPUT'
]) {
  assert.equal(serialized.includes(marker), false, `pressure/arc digest artifacts must not contain ${marker}`);
}

console.log('FORGE pressure/arc digest tests passed.');
