import assert from 'node:assert/strict';
import {
  V1_STORAGE_PATHS,
  V1_CREATOR_DRAFT_KIND,
  V1_MONOLITHIC_RECOVERY_KIND,
  beginV1CampaignDeletion,
  completeV1CampaignDeletion,
  createV1CampaignSave,
  deleteV1CampaignSave,
  initializeV1Storage,
  listV1CampaignSaves,
  loadActiveV1CampaignSave,
  loadV1CampaignDeletionResumeTarget,
  loadV1CampaignSave,
  migrateMonolithicV1CampaignSaves,
  storeV1CampaignSave,
  storeV1CreatorDraft,
  verifyV1Storage,
} from '../../src/storage/v1-storage-repository.mjs';
import { sha256Json } from '../../src/storage/v1-state-delta-codec.mjs';
import { createAshesInitialState } from './v1-test-fixtures.mjs';

async function countWholeObjectEncodes(action) {
  const originalTextEncoder = globalThis.TextEncoder;
  const originalStructuredClone = globalThis.structuredClone;
  let count = 0;
  let fullStateCloneCount = 0;
  globalThis.TextEncoder = class CountingTextEncoder extends originalTextEncoder {
    encode(...args) {
      count += 1;
      return super.encode(...args);
    }
  };
  globalThis.structuredClone = (value, ...args) => {
    if (value?.campaign && value?.stateCustody) fullStateCloneCount += 1;
    return originalStructuredClone(value, ...args);
  };
  try {
    const value = await action();
    return { count, fullStateCloneCount, value };
  } finally {
    globalThis.TextEncoder = originalTextEncoder;
    globalThis.structuredClone = originalStructuredClone;
  }
}

function memoryAdapter(seed = {}) {
  const files = new Map(Object.entries(structuredClone(seed)));
  let nextWriteFailure = null;
  let nextDeleteFailure = null;
  let nextReadMutation = null;
  return {
    async readJson(key) {
      if (!files.has(key)) {
        const error = new Error(`not found: ${key}`);
        error.code = 'ENOENT';
        throw error;
      }
      const value = structuredClone(files.get(key));
      if (nextReadMutation?.matches(key)) {
        const mutation = nextReadMutation;
        nextReadMutation = null;
        return mutation.mutate(value);
      }
      return value;
    },
    async writeJson(key, value) {
      if (nextWriteFailure?.matches(key)) {
        const failure = nextWriteFailure;
        nextWriteFailure = null;
        throw failure.error;
      }
      files.set(key, structuredClone(value));
    },
    async deleteJsonFile(key) {
      if (nextDeleteFailure?.matches(key)) {
        const failure = nextDeleteFailure;
        nextDeleteFailure = null;
        throw failure.error;
      }
      files.delete(key);
    },
    snapshot: () => Object.fromEntries(files),
    failNextWriteFor(match, code = 'TEST_WRITE_FAILED') {
      const error = new Error(`injected write failure: ${match}`);
      error.code = code;
      nextWriteFailure = { matches: (key) => key.includes(match), error };
    },
    failNextDeleteFor(match, code = 'TEST_DELETE_FAILED') {
      const error = new Error(`injected delete failure: ${match}`);
      error.code = code;
      nextDeleteFailure = { matches: (key) => key.includes(match), error };
    },
    mutateNextReadFor(match, mutate) {
      nextReadMutation = { matches: (key) => key.includes(match), mutate };
    },
    setFile(key, value) { files.set(key, structuredClone(value)); },
  };
}

function state() {
  const value = createAshesInitialState({
    campaignId: 'campaign.one',
    saveId: 'save.one',
    chatId: 'chat.one',
  });
  return value;
}

function reviseSave(save, revision, updatedAt) {
  const nextState = structuredClone(save.state);
  nextState.worldState.visitedLocationIds.push(`test-location-${revision}`);
  nextState.stateCustody.revision += 1;
  nextState.stateCustody.recentCommitIds = [
    ...nextState.stateCustody.recentCommitIds,
    `test.storage-revision-${revision}`,
  ].slice(-64);
  return createV1CampaignSave({
    id: save.id,
    name: save.name,
    state: nextState,
    createdAt: save.createdAt,
    updatedAt,
  });
}

const adapter = memoryAdapter({
  'indexes/saves.v1.json': {
    kind: 'directive.saveIndex',
    saves: { incompatible: { id: 'incompatible' } }
  }
});
await initializeV1Storage(adapter, { now: '2026-08-10T00:00:00.000Z' });
assert.equal(Object.hasOwn(adapter.snapshot(), 'indexes/saves.v1.json'), true);
assert.deepEqual(await listV1CampaignSaves(adapter), []);

const draft = {
  kind: V1_CREATOR_DRAFT_KIND,
  schemaVersion: 1,
  id: 'draft.one',
  package: { id: 'package.ashes', title: 'Ashes of Peace' },
  campaign: { id: 'ashes', title: 'Ashes of Peace' },
  status: 'inProgress',
  revision: 1,
  activeStep: 'identity',
  progress: {},
  updatedAt: '2026-08-10T00:01:00.000Z'
};
await storeV1CreatorDraft(adapter, draft);
assert.equal(adapter.snapshot()[V1_STORAGE_PATHS.index].drafts['draft.one'].kind, V1_CREATOR_DRAFT_KIND);

const active = createV1CampaignSave({
  id: 'save.one',
  name: 'Ren - Ashes',
  state: state(),
  createdAt: '2026-08-10T00:02:00.000Z'
});
await storeV1CampaignSave(adapter, active);
const firstSaveFiles = adapter.snapshot();
assert.equal(
  Object.hasOwn(firstSaveFiles[V1_STORAGE_PATHS.save('save.one')], 'state'),
  false,
  'the save entry must be a state-free manifest',
);
assert.equal(firstSaveFiles[V1_STORAGE_PATHS.save('save.one')].kind, 'directive.campaignSaveManifest.v1');
assert.equal(firstSaveFiles['v1/saves/save.one.base.v1.json'].kind, 'directive.campaignSaveBase.v1');
assert.equal((await loadActiveV1CampaignSave(adapter)).id, 'save.one');
assert.deepEqual(await loadV1CampaignSave(adapter, 'save.one'), active);

const revisedState = structuredClone(active.state);
revisedState.worldState.visitedLocationIds.push('hesperus-orbit');
revisedState.stateCustody.revision += 1;
revisedState.stateCustody.recentCommitIds.push('test.storage-revision');
const revisedActive = createV1CampaignSave({
  id: active.id,
  name: active.name,
  state: revisedState,
  createdAt: active.createdAt,
  updatedAt: '2026-08-10T00:02:30.000Z',
});
await storeV1CampaignSave(adapter, revisedActive, { previousSave: active });
const revisedFiles = adapter.snapshot();
const revisedManifest = revisedFiles[V1_STORAGE_PATHS.save('save.one')];
assert.equal(Object.hasOwn(revisedManifest, 'state'), false);
assert.equal(revisedManifest.segments.length, 1);
assert.equal(revisedManifest.segments[0].deltaCount, 1);
assert.equal(revisedFiles[revisedManifest.segments[0].path].kind, 'directive.campaignSaveSegment.v1');
assert.deepEqual(await loadV1CampaignSave(adapter, 'save.one'), revisedActive);

const segmentFailureAdapter = memoryAdapter();
await storeV1CampaignSave(segmentFailureAdapter, active);
segmentFailureAdapter.failNextWriteFor('.segment-');
await assert.rejects(
  storeV1CampaignSave(segmentFailureAdapter, revisedActive, { previousSave: active }),
  (error) => error?.code === 'DIRECTIVE_V1_SAVE_SEGMENT_WRITE_FAILED',
);
assert.deepEqual(await loadV1CampaignSave(segmentFailureAdapter, active.id), active);

const verificationFailureAdapter = memoryAdapter();
await storeV1CampaignSave(verificationFailureAdapter, active);
verificationFailureAdapter.mutateNextReadFor('.segment-', (segment) => ({
  ...segment,
  generation: segment.generation + 1,
}));
await assert.rejects(
  storeV1CampaignSave(verificationFailureAdapter, revisedActive, { previousSave: active }),
  (error) => error?.code === 'DIRECTIVE_V1_SAVE_SEGMENT_WRITE_VERIFICATION_FAILED',
);
assert.deepEqual(await loadV1CampaignSave(verificationFailureAdapter, active.id), active);

const manifestFailureAdapter = memoryAdapter();
await storeV1CampaignSave(manifestFailureAdapter, active);
manifestFailureAdapter.failNextWriteFor(V1_STORAGE_PATHS.save(active.id));
await assert.rejects(
  storeV1CampaignSave(manifestFailureAdapter, revisedActive, { previousSave: active }),
  (error) => error?.code === 'DIRECTIVE_V1_SAVE_MANIFEST_WRITE_FAILED',
);
assert.deepEqual(await loadV1CampaignSave(manifestFailureAdapter, active.id), active);

const indexRefreshFailureAdapter = memoryAdapter();
await storeV1CampaignSave(indexRefreshFailureAdapter, active);
indexRefreshFailureAdapter.failNextWriteFor(V1_STORAGE_PATHS.index);
await assert.doesNotReject(
  storeV1CampaignSave(indexRefreshFailureAdapter, revisedActive, { previousSave: active }),
  'an already-published manifest commit must not be rolled back by a stale summary cache',
);
assert.equal(
  indexRefreshFailureAdapter.snapshot()[V1_STORAGE_PATHS.index].saves[active.id].updatedAt,
  active.updatedAt,
  'an interrupted index refresh must leave the prior summary intact',
);
assert.deepEqual(
  await loadV1CampaignSave(indexRefreshFailureAdapter, active.id),
  revisedActive,
  'the committed manifest head must remain loadable after an index-refresh failure',
);
assert.equal(
  indexRefreshFailureAdapter.snapshot()[V1_STORAGE_PATHS.index].saves[active.id].updatedAt,
  revisedActive.updatedAt,
  'loading a committed manifest must repair its stale index summary',
);

const newPublicationFailureAdapter = memoryAdapter();
newPublicationFailureAdapter.failNextWriteFor(V1_STORAGE_PATHS.index);
await assert.rejects(
  storeV1CampaignSave(newPublicationFailureAdapter, active),
  /injected write failure/,
  'a new manifest must not report success until its index publication commits',
);

const pointerChangeFailureAdapter = memoryAdapter();
await storeV1CampaignSave(pointerChangeFailureAdapter, active);
const pointerCheckpoint = createV1CampaignSave({
  id: 'checkpoint.pointer-change',
  name: 'Pointer Change Checkpoint',
  slotType: 'checkpoint',
  parentSaveId: active.id,
  state: active.state,
  createdAt: '2026-08-10T00:02:40.000Z',
});
await storeV1CampaignSave(pointerChangeFailureAdapter, pointerCheckpoint, { makeActive: false });
const renamedPointerCheckpoint = createV1CampaignSave({
  ...pointerCheckpoint,
  name: 'Renamed Pointer Change Checkpoint',
  updatedAt: '2026-08-10T00:02:41.000Z',
});
pointerChangeFailureAdapter.failNextWriteFor(V1_STORAGE_PATHS.index);
await assert.rejects(
  storeV1CampaignSave(pointerChangeFailureAdapter, renamedPointerCheckpoint, {
    makeActive: true,
    previousSave: pointerCheckpoint,
  }),
  /injected write failure/,
  'an active-pointer move must not report success until the index commits',
);
assert.equal(
  pointerChangeFailureAdapter.snapshot()[V1_STORAGE_PATHS.index].activeSaveId,
  active.id,
  'a failed active-pointer move must leave the published pointer unchanged',
);

const corruptionAdapter = memoryAdapter();
await storeV1CampaignSave(corruptionAdapter, active);
await storeV1CampaignSave(corruptionAdapter, revisedActive, { previousSave: active });
const corruptionManifest = corruptionAdapter.snapshot()[V1_STORAGE_PATHS.save(active.id)];
const corruptionSegmentPath = corruptionManifest.segments[0].path;
const corruptedSegment = corruptionAdapter.snapshot()[corruptionSegmentPath];
corruptedSegment.deltas[0].source = 'corrupted-after-write';
corruptionAdapter.setFile(corruptionSegmentPath, corruptedSegment);
await assert.rejects(
  loadV1CampaignSave(corruptionAdapter, active.id),
  (error) => error?.code === 'DIRECTIVE_V1_SAVE_SEGMENT_INTEGRITY_FAILED',
);

const revisionGapState = structuredClone(revisedActive.state);
revisionGapState.worldState.visitedLocationIds.push('revision-gap');
revisionGapState.stateCustody.revision += 2;
revisionGapState.stateCustody.recentCommitIds.push('test.revision-gap');
const revisionGapSave = createV1CampaignSave({
  id: active.id,
  name: active.name,
  state: revisionGapState,
  createdAt: active.createdAt,
  updatedAt: '2026-08-10T00:02:45.000Z',
});
await assert.rejects(
  storeV1CampaignSave(memoryAdapter(adapter.snapshot()), revisionGapSave, { previousSave: revisedActive }),
  (error) => error?.code === 'DIRECTIVE_V1_SAVE_REVISION_DISCONTINUITY',
);

const rolloverAdapter = memoryAdapter();
await storeV1CampaignSave(rolloverAdapter, active);
let rolloverSave = active;
for (let revision = 1; revision <= 65; revision += 1) {
  const next = reviseSave(
    rolloverSave,
    revision,
    new Date(Date.parse('2026-08-10T01:00:00.000Z') + revision * 1000).toISOString(),
  );
  await storeV1CampaignSave(rolloverAdapter, next, { previousSave: rolloverSave });
  rolloverSave = next;
}
const rolloverManifest = rolloverAdapter.snapshot()[V1_STORAGE_PATHS.save(active.id)];
assert.deepEqual(rolloverManifest.segments.map((entry) => entry.deltaCount), [64, 1]);
assert.deepEqual(rolloverManifest.segments.map((entry) => entry.sealed), [true, false]);
assert.ok(rolloverManifest.segments.every((entry) => entry.byteLength <= 512 * 1024));
const measuredHydration = await countWholeObjectEncodes(() => loadV1CampaignSave(rolloverAdapter, active.id));
assert.deepEqual(measuredHydration.value, rolloverSave);
assert.equal(measuredHydration.count, 6,
  '65-delta hydration must encode only two segment lengths plus the base, two segments, and manifest-head hashes');
assert.ok(measuredHydration.fullStateCloneCount <= 1,
  'verified hydration must clone accumulated state at most once for the complete delta chain');
assert.equal((await verifyV1Storage(rolloverAdapter)).ok, true);
const missingSegmentAdapter = memoryAdapter(rolloverAdapter.snapshot());
const missingSegmentPath = rolloverManifest.segments[0].path;
await missingSegmentAdapter.deleteJsonFile(missingSegmentPath);
assert.deepEqual(await verifyV1Storage(missingSegmentAdapter), {
  ok: false,
  initialized: true,
  missingKey: missingSegmentPath,
});
const deleteIndexFailureAdapter = memoryAdapter(rolloverAdapter.snapshot());
const beforeDeleteIndexFailure = deleteIndexFailureAdapter.snapshot();
deleteIndexFailureAdapter.failNextWriteFor(V1_STORAGE_PATHS.index);
await assert.rejects(
  deleteV1CampaignSave(deleteIndexFailureAdapter, active.id, { now: '2026-08-10T01:59:00.000Z' }),
  /injected write failure/,
);
assert.deepEqual(
  deleteIndexFailureAdapter.snapshot(),
  beforeDeleteIndexFailure,
  'an index unpublication failure must not delete any save artifact',
);
const cleanupFailureAdapter = memoryAdapter(rolloverAdapter.snapshot());
const failedCleanupPath = V1_STORAGE_PATHS.saveBase(active.id);
cleanupFailureAdapter.failNextDeleteFor(failedCleanupPath);
const cleanupFailureResult = await deleteV1CampaignSave(cleanupFailureAdapter, active.id, {
  now: '2026-08-10T01:59:30.000Z',
});
assert.deepEqual(cleanupFailureResult.cleanupFailures, [failedCleanupPath]);
assert.deepEqual(await listV1CampaignSaves(cleanupFailureAdapter), []);
assert.equal(Object.hasOwn(cleanupFailureAdapter.snapshot(), failedCleanupPath), true);
assert.equal(
  Object.hasOwn(cleanupFailureAdapter.snapshot(), V1_STORAGE_PATHS.save(active.id)),
  false,
  'post-unpublication cleanup must continue after one artifact delete fails',
);
await deleteV1CampaignSave(rolloverAdapter, active.id, { now: '2026-08-10T02:00:00.000Z' });
const deletedRolloverFiles = rolloverAdapter.snapshot();
assert.equal(Object.hasOwn(deletedRolloverFiles, V1_STORAGE_PATHS.save(active.id)), false);
assert.equal(Object.hasOwn(deletedRolloverFiles, V1_STORAGE_PATHS.saveBase(active.id)), false);
for (const sequence of [1, 2]) {
  for (const slot of ['a', 'b']) {
    assert.equal(
      Object.hasOwn(deletedRolloverFiles, V1_STORAGE_PATHS.saveSegment(active.id, sequence, slot)),
      false,
    );
  }
}

const checkpoint = createV1CampaignSave({
  id: 'checkpoint.one',
  name: 'Before Hesperus',
  slotType: 'checkpoint',
  parentSaveId: 'save.one',
  state: state(),
  createdAt: '2026-08-10T00:03:00.000Z'
});
await storeV1CampaignSave(adapter, checkpoint, { makeActive: false });
assert.deepEqual((await listV1CampaignSaves(adapter)).map((entry) => entry.id), ['checkpoint.one', 'save.one']);

assert.throws(() => createV1CampaignSave({
  id: 'save.with-parent',
  parentSaveId: 'save.one',
  state: state(),
  createdAt: '2026-08-10T00:03:00.000Z'
}), (error) => error?.code === 'DIRECTIVE_V1_SAVE_SLOT_RELATION_INVALID');
assert.throws(() => createV1CampaignSave({
  id: 'checkpoint.without-parent',
  slotType: 'checkpoint',
  state: state(),
  createdAt: '2026-08-10T00:03:00.000Z'
}), (error) => error?.code === 'DIRECTIVE_V1_SAVE_SLOT_RELATION_INVALID');
assert.throws(() => createV1CampaignSave({
  id: 'save.wrong-branch',
  state: state(),
  createdAt: '2026-08-10T00:03:00.000Z'
}), (error) => error?.code === 'DIRECTIVE_V1_SAVE_BRANCH_MISMATCH');
assert.throws(() => createV1CampaignSave({
  id: 'checkpoint.wrong-parent',
  slotType: 'checkpoint',
  parentSaveId: 'save.other',
  state: state(),
  createdAt: '2026-08-10T00:03:00.000Z'
}), (error) => error?.code === 'DIRECTIVE_V1_SAVE_BRANCH_MISMATCH');

await deleteV1CampaignSave(adapter, 'checkpoint.one', { now: '2026-08-10T00:04:00.000Z' });
assert.deepEqual((await listV1CampaignSaves(adapter)).map((entry) => entry.id), ['save.one']);

const legacyMonolithicSave = createV1CampaignSave({
  id: 'save.legacy',
  name: 'Legacy Ashes',
  state: createAshesInitialState({
    campaignId: 'campaign.legacy',
    saveId: 'save.legacy',
    chatId: 'chat.legacy',
  }),
  createdAt: '2026-08-10T00:00:00.000Z',
  updatedAt: '2026-08-10T00:05:00.000Z',
});
const legacyIndex = {
  kind: 'directive.storageIndex.v1',
  version: 1,
  activeSaveId: legacyMonolithicSave.id,
  drafts: {},
  saves: { [legacyMonolithicSave.id]: { id: legacyMonolithicSave.id } },
  updatedAt: '2026-08-10T00:05:00.000Z',
};
const legacyAdapter = memoryAdapter({
  [V1_STORAGE_PATHS.index]: legacyIndex,
  [V1_STORAGE_PATHS.save(legacyMonolithicSave.id)]: legacyMonolithicSave,
});
const migratedLegacy = await migrateMonolithicV1CampaignSaves(legacyAdapter, {
  now: '2026-08-10T00:06:00.000Z',
});
assert.deepEqual(migratedLegacy, {
  ok: true,
  scannedSaveCount: 1,
  migratedSaveCount: 1,
  migratedSaveIds: ['save.legacy'],
  recoveryCopyCount: 1,
});
const migratedLegacyFiles = legacyAdapter.snapshot();
const legacyRecoveryEnvelope = migratedLegacyFiles[
  V1_STORAGE_PATHS.monolithicRecovery(legacyMonolithicSave.id)
];
assert.equal(legacyRecoveryEnvelope.kind, V1_MONOLITHIC_RECOVERY_KIND);
assert.deepEqual(
  legacyRecoveryEnvelope.save,
  legacyMonolithicSave,
  'the exact legacy record must be preserved before its live path changes',
);
assert.equal(legacyRecoveryEnvelope.sourceHash, await sha256Json(legacyMonolithicSave));
assert.equal(
  migratedLegacyFiles[V1_STORAGE_PATHS.index].recoveryCopies[legacyMonolithicSave.id].sourceHash,
  legacyRecoveryEnvelope.sourceHash,
  'the authoritative index must retain independent recovery provenance',
);
assert.equal(
  migratedLegacyFiles[V1_STORAGE_PATHS.save(legacyMonolithicSave.id)].kind,
  'directive.campaignSaveManifest.v1',
);
assert.equal(
  migratedLegacyFiles[V1_STORAGE_PATHS.saveBase(legacyMonolithicSave.id)].kind,
  'directive.campaignSaveBase.v1',
);
assert.deepEqual(await loadV1CampaignSave(legacyAdapter, legacyMonolithicSave.id), legacyMonolithicSave);
assert.equal((await verifyV1Storage(legacyAdapter)).recoveryCopyCount, 1);
assert.deepEqual(await migrateMonolithicV1CampaignSaves(legacyAdapter), {
  ok: true,
  scannedSaveCount: 1,
  migratedSaveCount: 0,
  migratedSaveIds: [],
  recoveryCopyCount: 1,
});
const damagedNonAuthoritativeRecoveryAdapter = memoryAdapter(legacyAdapter.snapshot());
const differentValidRecoverySave = { ...legacyMonolithicSave, name: 'Different valid recovery state' };
damagedNonAuthoritativeRecoveryAdapter.setFile(
  V1_STORAGE_PATHS.monolithicRecovery(legacyMonolithicSave.id),
  {
    kind: V1_MONOLITHIC_RECOVERY_KIND,
    version: 1,
    saveId: legacyMonolithicSave.id,
    sourceHash: await sha256Json(differentValidRecoverySave),
    save: differentValidRecoverySave,
  },
);
assert.equal(
  (await migrateMonolithicV1CampaignSaves(damagedNonAuthoritativeRecoveryAdapter)).migratedSaveCount,
  0,
  'a damaged recovery copy must not block an already-valid current manifest',
);
assert.deepEqual(await verifyV1Storage(damagedNonAuthoritativeRecoveryAdapter), {
  ok: false,
  initialized: true,
  invalidRecoverySaveId: legacyMonolithicSave.id,
  errorCode: 'DIRECTIVE_V1_MONOLITHIC_RECOVERY_PROVENANCE_MISMATCH',
});
const recoveryDeleteFailureAdapter = memoryAdapter(legacyAdapter.snapshot());
recoveryDeleteFailureAdapter.failNextDeleteFor(
  V1_STORAGE_PATHS.monolithicRecovery(legacyMonolithicSave.id),
);
await assert.rejects(
  deleteV1CampaignSave(recoveryDeleteFailureAdapter, legacyMonolithicSave.id),
  (error) => error?.code === 'DIRECTIVE_V1_MONOLITHIC_RECOVERY_DELETE_FAILED'
    && error?.details?.indexRestored === true,
);
const recoveryDeleteFailureFiles = recoveryDeleteFailureAdapter.snapshot();
assert.equal(
  recoveryDeleteFailureFiles[V1_STORAGE_PATHS.index].activeSaveId,
  legacyMonolithicSave.id,
  'a recovery-delete failure must restore the active index pointer',
);
assert.equal(
  Object.hasOwn(recoveryDeleteFailureFiles[V1_STORAGE_PATHS.index].saves, legacyMonolithicSave.id),
  true,
);
assert.equal(
  Object.hasOwn(recoveryDeleteFailureFiles[V1_STORAGE_PATHS.index].recoveryCopies, legacyMonolithicSave.id),
  true,
);
assert.deepEqual(
  recoveryDeleteFailureFiles[V1_STORAGE_PATHS.monolithicRecovery(legacyMonolithicSave.id)],
  legacyRecoveryEnvelope,
);

const deletionTarget = {
  campaignId: legacyMonolithicSave.campaignId,
  saveId: legacyMonolithicSave.id,
  saveIds: [legacyMonolithicSave.id],
};
const tamperedDeletionPathAdapter = memoryAdapter(legacyAdapter.snapshot());
await beginV1CampaignDeletion(tamperedDeletionPathAdapter, deletionTarget);
const tamperedDeletionIndex = tamperedDeletionPathAdapter.snapshot()[V1_STORAGE_PATHS.index];
tamperedDeletionIndex.campaignDeletions[legacyMonolithicSave.campaignId].artifactPaths = [
  'v1/saves/save.victim.v1.json',
];
tamperedDeletionPathAdapter.setFile(V1_STORAGE_PATHS.index, tamperedDeletionIndex);
tamperedDeletionPathAdapter.setFile('v1/saves/save.victim.v1.json', { mustRemain: true });
await assert.rejects(
  completeV1CampaignDeletion(tamperedDeletionPathAdapter, legacyMonolithicSave.campaignId),
  (error) => error?.code === 'DIRECTIVE_V1_CAMPAIGN_DELETION_TOMBSTONE_INVALID',
);
assert.deepEqual(
  tamperedDeletionPathAdapter.snapshot()['v1/saves/save.victim.v1.json'],
  { mustRemain: true },
  'a persisted cleanup-path injection must be rejected without touching the target',
);

const tamperedDeletionBindingAdapter = memoryAdapter(legacyAdapter.snapshot());
await beginV1CampaignDeletion(tamperedDeletionBindingAdapter, deletionTarget);
const tamperedBasePath = V1_STORAGE_PATHS.saveBase(legacyMonolithicSave.id);
const tamperedManifestPath = V1_STORAGE_PATHS.save(legacyMonolithicSave.id);
const tamperedBase = tamperedDeletionBindingAdapter.snapshot()[tamperedBasePath];
tamperedBase.state.campaignChatBinding = {
  ...tamperedBase.state.campaignChatBinding,
  entityId: 'victim-character-id',
  entityName: 'Unrelated Character',
};
tamperedBase.stateHash = await sha256Json(tamperedBase.state);
tamperedDeletionBindingAdapter.setFile(tamperedBasePath, tamperedBase);
const tamperedManifest = tamperedDeletionBindingAdapter.snapshot()[tamperedManifestPath];
tamperedManifest.base.stateHash = tamperedBase.stateHash;
tamperedManifest.currentStateHash = tamperedBase.stateHash;
tamperedDeletionBindingAdapter.setFile(tamperedManifestPath, tamperedManifest);
await assert.rejects(
  loadV1CampaignDeletionResumeTarget(tamperedDeletionBindingAdapter, legacyMonolithicSave.campaignId),
  (error) => error?.code === 'DIRECTIVE_V1_CAMPAIGN_DELETION_RESUME_TARGET_INVALID',
  'startup must reject a changed character binding even when the retained save hashes are internally consistent',
);

const migratedDeletionAdapter = memoryAdapter(legacyAdapter.snapshot());
await deleteV1CampaignSave(migratedDeletionAdapter, legacyMonolithicSave.id);
assert.equal(
  Object.hasOwn(
    migratedDeletionAdapter.snapshot(),
    V1_STORAGE_PATHS.monolithicRecovery(legacyMonolithicSave.id),
  ),
  false,
  'deleting a migrated campaign must delete its legacy recovery copy too',
);

const invalidLegacyRecord = { kind: 'directive.campaignSave.v1', version: 1, id: 'save.invalid' };
const invalidLegacyAdapter = memoryAdapter({
  [V1_STORAGE_PATHS.index]: {
    ...legacyIndex,
    activeSaveId: 'save.invalid',
    saves: { 'save.invalid': { id: 'save.invalid' } },
  },
  [V1_STORAGE_PATHS.save('save.invalid')]: invalidLegacyRecord,
});
await assert.rejects(
  migrateMonolithicV1CampaignSaves(invalidLegacyAdapter),
  (error) => error?.code === 'DIRECTIVE_V1_MONOLITHIC_SAVE_UNRECOVERABLE'
    && error?.details?.saveId === 'save.invalid',
);
assert.deepEqual(
  invalidLegacyAdapter.snapshot()[V1_STORAGE_PATHS.save('save.invalid')],
  invalidLegacyRecord,
  'an unvalidated legacy record must remain untouched',
);
assert.equal(
  Object.hasOwn(invalidLegacyAdapter.snapshot(), V1_STORAGE_PATHS.monolithicRecovery('save.invalid')),
  false,
);

const conflictingRecoveryAdapter = memoryAdapter({
  [V1_STORAGE_PATHS.index]: legacyIndex,
  [V1_STORAGE_PATHS.save(legacyMonolithicSave.id)]: legacyMonolithicSave,
  [V1_STORAGE_PATHS.monolithicRecovery(legacyMonolithicSave.id)]: {
    kind: V1_MONOLITHIC_RECOVERY_KIND,
    version: 1,
    saveId: legacyMonolithicSave.id,
    sourceHash: await sha256Json(differentValidRecoverySave),
    save: differentValidRecoverySave,
  },
});
await assert.rejects(
  migrateMonolithicV1CampaignSaves(conflictingRecoveryAdapter),
  (error) => error?.code === 'DIRECTIVE_V1_MONOLITHIC_RECOVERY_CONFLICT',
);
assert.deepEqual(
  conflictingRecoveryAdapter.snapshot()[V1_STORAGE_PATHS.save(legacyMonolithicSave.id)],
  legacyMonolithicSave,
);

const interruptedMigrationAdapter = memoryAdapter({
  [V1_STORAGE_PATHS.index]: legacyIndex,
  [V1_STORAGE_PATHS.save(legacyMonolithicSave.id)]: legacyMonolithicSave,
});
interruptedMigrationAdapter.failNextWriteFor('.base.v1.json');
await assert.rejects(
  migrateMonolithicV1CampaignSaves(interruptedMigrationAdapter),
  (error) => error?.code === 'DIRECTIVE_V1_MONOLITHIC_SAVE_MIGRATION_FAILED',
);
assert.deepEqual(
  interruptedMigrationAdapter.snapshot()[V1_STORAGE_PATHS.save(legacyMonolithicSave.id)],
  legacyMonolithicSave,
  'a failed pre-commit migration must leave the live monolithic save intact',
);
assert.deepEqual(
  interruptedMigrationAdapter.snapshot()[V1_STORAGE_PATHS.monolithicRecovery(legacyMonolithicSave.id)].save,
  legacyMonolithicSave,
  'a failed migration must still retain the verified recovery copy',
);
const legacyManifestFailureAdapter = memoryAdapter({
  [V1_STORAGE_PATHS.index]: legacyIndex,
  [V1_STORAGE_PATHS.save(legacyMonolithicSave.id)]: legacyMonolithicSave,
});
legacyManifestFailureAdapter.failNextWriteFor(V1_STORAGE_PATHS.save(legacyMonolithicSave.id));
await assert.rejects(
  migrateMonolithicV1CampaignSaves(legacyManifestFailureAdapter),
  (error) => error?.code === 'DIRECTIVE_V1_MONOLITHIC_SAVE_MIGRATION_FAILED'
    && error?.details?.originalRestored === true,
);
assert.deepEqual(
  legacyManifestFailureAdapter.snapshot()[V1_STORAGE_PATHS.save(legacyMonolithicSave.id)],
  legacyMonolithicSave,
  'a manifest-publication failure must restore the live monolithic save',
);
assert.deepEqual(
  legacyManifestFailureAdapter.snapshot()[V1_STORAGE_PATHS.monolithicRecovery(legacyMonolithicSave.id)].save,
  legacyMonolithicSave,
);

const recoveryWriteFailureAdapter = memoryAdapter({
  [V1_STORAGE_PATHS.index]: legacyIndex,
  [V1_STORAGE_PATHS.save(legacyMonolithicSave.id)]: legacyMonolithicSave,
});
recoveryWriteFailureAdapter.failNextWriteFor(V1_STORAGE_PATHS.monolithicRecovery(legacyMonolithicSave.id));
await assert.rejects(
  migrateMonolithicV1CampaignSaves(recoveryWriteFailureAdapter),
  (error) => error?.code === 'DIRECTIVE_V1_MONOLITHIC_RECOVERY_WRITE_FAILED',
);
assert.deepEqual(
  recoveryWriteFailureAdapter.snapshot()[V1_STORAGE_PATHS.save(legacyMonolithicSave.id)],
  legacyMonolithicSave,
  'a recovery-copy failure must not mutate the live save path',
);

await assert.rejects(
  loadV1CampaignSave(memoryAdapter({
    [V1_STORAGE_PATHS.index]: {
      kind: 'directive.storageIndex.v1', version: 1, activeSaveId: 'invalid', drafts: {},
      saves: { invalid: { id: 'invalid' } }, updatedAt: '2026-08-10T00:00:00.000Z'
    },
    [V1_STORAGE_PATHS.save('invalid')]: { kind: 'directive.unsupportedSave', id: 'invalid' }
  }), 'invalid'),
  (error) => error?.code === 'DIRECTIVE_V1_SAVE_LAYOUT_UNSUPPORTED'
);

console.log('PASS V1 storage repository');
