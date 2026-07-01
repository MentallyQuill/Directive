import assert from 'node:assert/strict';

import {
  createForgeCoordinator
} from '../../src/jobs/forge-coordinator.mjs';
import {
  createForgeBatchCommit,
  normalizeForgeWorkerResult
} from '../../src/jobs/forge-contracts.mjs';
import {
  createRecallEntryFromScenePhaseSeal,
  createScenePhaseSealWorkerResult,
  normalizeScenePhaseSeal
} from '../../src/jobs/forge-scene-phase-seal.mjs';
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
  campaignId: 'campaign-forge-scene-seal',
  saveId: 'save-forge-scene-seal',
  now: () => `2026-06-30T14:00:${String(tick++).padStart(2, '0')}.000Z`
});
const sourceFrame = createTurnSourceFrameContract({
  id: 'frame:seal-source-1',
  campaignId: 'campaign-forge-scene-seal',
  saveId: 'save-forge-scene-seal',
  chatId: 'ashes-chat',
  hostMessageId: 'player-seal-source-1',
  textHash: hashStableJson({ text: 'Sam takes the bridge handoff and closes the scene.' }),
  createdAt: '2026-06-30T14:00:00.000Z'
});
const sourceFrameRef = createTurnSourceFrameRef(sourceFrame);
const transaction = await coreStore.beginTurn(sourceFrame, {
  transactionId: 'txn-scene-seal-1',
  ingressId: 'ingress-scene-seal-1',
  idempotencyKey: 'begin-scene-seal-1'
});
await coreStore.advanceTurn(transaction.id, {
  phase: 'routePending',
  route: 'hostContinue',
  idempotencyKey: 'route-scene-seal-1'
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
  clock: () => `2026-06-30T14:01:${String(sourceChecks.length).padStart(2, '0')}.000Z`
});

const sealInput = {
  id: 'scene-seal-bridge-handoff',
  campaignId: 'campaign-forge-scene-seal',
  saveId: 'save-forge-scene-seal',
  transactionId: transaction.id,
  outcomeId: 'outcome-scene-seal-1',
  sourceFrameRef,
  chapterId: 'chapter-1',
  phaseId: 'prelude-handoff',
  sceneId: 'bridge-handoff',
  locationId: 'breckenridge-bridge',
  actorIds: ['sam-vickers', 'mara-whitaker'],
  subjectIds: ['command-network', 'convoy-handoff'],
  threadIds: ['thread-cross-handoff'],
  missionIds: ['mission-empty-convoy'],
  tags: ['handoff', 'command'],
  keywords: ['Bridge', 'Handoff', 'Convoy'],
  summary: 'RAW_PROVIDER_SCENE_SUMMARY: Sam accepts the bridge handoff and the room settles.',
  eventRefs: [{
    kind: 'directive.sceneEventRef.v1',
    id: 'scene-event-1',
    transcriptBody: 'RAW_TRANSCRIPT_BODY'
  }],
  witnessFactRefs: [{
    id: 'witness-fact-1',
    subjectId: 'sam-vickers',
    knownBy: ['mara-whitaker'],
    rawFactText: 'RAW_WITNESS_FACT'
  }],
  correctionCandidateRefs: [{
    id: 'correction-candidate-1',
    providerOutput: 'RAW_CORRECTION_PROVIDER_OUTPUT'
  }]
};

const workerPreview = createScenePhaseSealWorkerResult({ seal: sealInput });
assert.equal(workerPreview.effectRefs.some((ref) => ref.kind === 'directive.scenePhaseSealRef.v1'), true);
assert.equal(workerPreview.effectRefs.some((ref) => ref.kind === 'directive.recallIndexEntryRef.v1'), true);
const normalizedGenericWorker = normalizeForgeWorkerResult({
  id: 'scenePhaseSeal',
  allowedRoots: []
}, {
  effectRefs: workerPreview.effectRefs,
  promptDirtyDomains: workerPreview.promptDirtyDomains,
  providerOutput: 'RAW_GENERIC_FORGE_PROVIDER_OUTPUT',
  diagnostics: {
    providerOutput: 'RAW_GENERIC_FORGE_PROVIDER_OUTPUT'
  }
});
assert.equal(normalizedGenericWorker.effectRefs.find((ref) => ref.kind === 'directive.scenePhaseSealRef.v1').phaseId, 'prelude-handoff');
assert.equal(JSON.stringify(normalizedGenericWorker).includes('RAW_GENERIC_FORGE_PROVIDER_OUTPUT'), false);
const genericBatch = createForgeBatchCommit({
  transactionId: transaction.id,
  sourceFrame,
  workerResults: [normalizedGenericWorker],
  idempotencyKey: 'generic-scene-phase-seal-batch'
});
assert.equal(genericBatch.scenePhaseSealRefs.length, 1);
assert.equal(genericBatch.recallIndexEntryRefs.length, 1);
assert.equal(genericBatch.recallRevisions.recallIndexRevision, hashStableJson(genericBatch.recallIndexEntryRefs.map((ref) => ({
  id: ref.id || null,
  hash: ref.hash || null,
  sourceFrameId: ref.sourceFrameId || null,
  sceneSealId: ref.sceneSealId || null,
  pressureArcDigestId: ref.pressureArcDigestId || null
}))));

const settled = await forge.settleScenePhaseSeal({
  transactionId: transaction.id,
  sourceToken: 'source-token-scene-seal-1',
  sourceFrame,
  sourceFrameRef,
  outcomeId: 'outcome-scene-seal-1',
  seal: sealInput,
  flushLens: true,
  idempotencyKey: 'scene-phase-seal-1'
});
assert.equal(settled.status, 'settled');
assert.equal(settled.applied, true);
assert.equal(settled.providerCallAttempted, false);
assert.equal(settled.lensResult.status, 'installed');
assert.equal(lensDirtyCalls.length, 1);
assert.equal(lensDirtyCalls[0].lane, 'background');
assert.deepEqual(lensFlushCalls[0].cacheInputs, settled.batch.recallRevisions);
assert.equal(lensFlushCalls[0].cacheInputs.recallIndexRevision, settled.batch.recallRevisions.recallIndexRevision);
assert.equal(lensFlushCalls[0].cacheInputs.sceneSealRevision, settled.batch.recallRevisions.sceneSealRevision);
assert.equal(settled.batch.scenePhaseSealRefs.length, 1);
assert.equal(settled.batch.recallIndexEntryRefs.length, 1);
assert.equal(typeof settled.batch.recallRevisions.recallIndexRevision, 'string');
assert.deepEqual(sourceChecks.map((entry) => entry.phase), ['beforeBackgroundCommit']);
assert.equal(coreStore.state.events.filter((event) => event.type === 'backgroundBatchCommitted').length, 1);
assert.deepEqual(coreStore.state.promptDirtyDomains, ['continuity', 'missionQuestThread', 'sourceBinding', 'crewShipRelationship']);

const projections = coreStore.readProjections();
assert.equal(projections.sceneSealRefs.length, 1);
assert.equal(projections.sceneSealRefs[0].id, 'scene-seal-bridge-handoff');
assert.equal(projections.sceneSealRefs[0].sourceFrameId, sourceFrame.id);
assert.equal(projections.sceneSealRevision, settled.batch.recallRevisions.sceneSealRevision);
assert.equal(projections.recallIndex.entryRefs.length, 1);
assert.equal(projections.recallIndex.entryRefs[0].sceneSealId, 'scene-seal-bridge-handoff');
assert.equal(typeof projections.recallIndex.revision, 'string');
assert.equal(projections.backgroundBatches.at(-1).effectCount, 4);
assert.deepEqual(projections.backgroundBatches.at(-1).dirtyDomains, ['continuity', 'missionQuestThread', 'sourceBinding', 'crewShipRelationship']);

const normalizedSeal = normalizeScenePhaseSeal(sealInput);
const recallEntry = createRecallEntryFromScenePhaseSeal(normalizedSeal);
const recallResult = queryRecallIndex({
  entries: [recallEntry],
  query: {
    campaignId: 'campaign-forge-scene-seal',
    saveId: 'save-forge-scene-seal',
    actorIds: ['sam-vickers'],
    locationId: 'breckenridge-bridge',
    keywords: ['handoff'],
    limit: 4
  }
});
assert.equal(recallResult.includedRefs.length, 1);
assert.equal(recallResult.includedRefs[0].sceneSealRef.id, 'scene-seal-bridge-handoff');

const budgetTrace = createLensPromptBudgetTrace({
  packetId: 'packet-scene-seal-1',
  promptRevision: 7,
  cacheKey: 'cache-scene-seal-1',
  lanes: [{
    id: 'recall',
    budgetTokens: 48,
    refs: projections.recallIndex.entryRefs.map((ref) => ({
      ...ref,
      estimatedTokens: 20
    }))
  }, {
    id: 'activeScene',
    budgetTokens: 24,
    refs: projections.sceneSealRefs.map((ref) => ({
      ...ref,
      estimatedTokens: 18
    }))
  }],
  cacheInputs: {
    mechanicsRevision: coreStore.state.revisions.mechanics,
    promptDomainVector: coreStore.state.promptDirtyDomains,
    recallIndexRevision: projections.recallIndex.revision,
    sceneSealRevision: projections.sceneSealRevision
  }
});
assert.equal(budgetTrace.lanes.find((lane) => lane.id === 'recall').includedRefs.length, 1);
assert.equal(budgetTrace.cacheInputs.recallIndexRevision, projections.recallIndex.revision);
assert.equal(budgetTrace.cacheInputs.sceneSealRevision, projections.sceneSealRevision);

const hydrated = await loadCoreStoreStateV2(adapter, {
  campaignId: 'campaign-forge-scene-seal',
  saveId: 'save-forge-scene-seal'
});
assert.deepEqual(hydrated.promptDirtyDomains, coreStore.state.promptDirtyDomains);
const hydratedProjections = await readCoreStoreProjectionsV2(adapter, {
  campaignId: 'campaign-forge-scene-seal',
  saveId: 'save-forge-scene-seal'
});
assert.equal(hydratedProjections.sceneSealRefs.length, 1);
assert.equal(hydratedProjections.sceneSealRevision, projections.sceneSealRevision);
assert.equal(hydratedProjections.recallIndex.entryRefs.length, 1);
assert.equal(hydratedProjections.recallIndex.revision, projections.recallIndex.revision);

const beforeReplayEvents = coreStore.state.events.length;
const replayed = await forge.settleScenePhaseSeal({
  transactionId: transaction.id,
  sourceToken: 'source-token-scene-seal-1',
  sourceFrame,
  sourceFrameRef,
  outcomeId: 'outcome-scene-seal-1',
  seal: sealInput,
  idempotencyKey: 'scene-phase-seal-1'
});
assert.equal(replayed.status, 'replayed');
assert.equal(coreStore.state.events.length, beforeReplayEvents);
assert.equal(lensFlushCalls.length, 1);

const staleFrame = createTurnSourceFrameContract({
  id: 'frame:seal-source-stale',
  campaignId: 'campaign-forge-scene-seal',
  saveId: 'save-forge-scene-seal',
  chatId: 'ashes-chat',
  hostMessageId: 'player-seal-source-stale',
  textHash: hashStableJson({ text: 'Stale source should not settle.' }),
  createdAt: '2026-06-30T14:02:00.000Z'
});
const staleTransaction = await coreStore.beginTurn(staleFrame, {
  transactionId: 'txn-scene-seal-stale',
  ingressId: 'ingress-scene-seal-stale',
  idempotencyKey: 'begin-scene-seal-stale'
});
await coreStore.advanceTurn(staleTransaction.id, {
  phase: 'routePending',
  route: 'hostContinue',
  idempotencyKey: 'route-scene-seal-stale'
});
const staleForge = createForgeCoordinator({
  coreStore,
  isSourceCurrent: async () => ({ ok: false, reason: 'source-edited-before-seal' }),
  clock: () => '2026-06-30T14:03:00.000Z'
});
const backgroundBeforeStale = coreStore.state.events.filter((event) => event.type === 'backgroundBatchCommitted').length;
const dirtyBeforeStale = [...coreStore.state.promptDirtyDomains];
const stale = await staleForge.settleScenePhaseSeal({
  transactionId: staleTransaction.id,
  sourceToken: 'source-token-scene-seal-stale',
  sourceFrame: staleFrame,
  sourceFrameRef: createTurnSourceFrameRef(staleFrame),
  seal: {
    ...sealInput,
    id: 'scene-seal-stale',
    transactionId: staleTransaction.id,
    sourceFrameRef: createTurnSourceFrameRef(staleFrame)
  },
  idempotencyKey: 'scene-phase-seal-stale'
});
assert.equal(stale.status, 'staleBeforeBackgroundCommit');
assert.equal(coreStore.state.events.filter((event) => event.type === 'backgroundBatchCommitted').length, backgroundBeforeStale);
assert.deepEqual(coreStore.state.promptDirtyDomains, dirtyBeforeStale);

const serialized = serializedStorage(storage);
for (const marker of [
  'RAW_PROVIDER_SCENE_SUMMARY',
  'RAW_TRANSCRIPT_BODY',
  'RAW_WITNESS_FACT',
  'RAW_CORRECTION_PROVIDER_OUTPUT'
]) {
  assert.equal(serialized.includes(marker), false, `scene seal artifacts must not contain ${marker}`);
}

console.log('FORGE scene/phase seal tests passed.');
