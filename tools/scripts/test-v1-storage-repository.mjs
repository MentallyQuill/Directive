import assert from 'node:assert/strict';
import {
  V1_STORAGE_PATHS,
  V1_CREATOR_DRAFT_KIND,
  createV1CampaignSave,
  deleteV1CampaignSave,
  initializeV1Storage,
  listV1CampaignSaves,
  loadActiveV1CampaignSave,
  loadV1CampaignSave,
  storeV1CampaignSave,
  storeV1CreatorDraft,
  verifyV1Storage,
} from '../../src/storage/v1-storage-repository.mjs';
import { createAshesInitialState } from './v1-test-fixtures.mjs';

function memoryAdapter(seed = {}) {
  const files = new Map(Object.entries(structuredClone(seed)));
  let nextWriteFailure = null;
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
    async deleteJsonFile(key) { files.delete(key); },
    snapshot: () => Object.fromEntries(files),
    failNextWriteFor(match, code = 'TEST_WRITE_FAILED') {
      const error = new Error(`injected write failure: ${match}`);
      error.code = code;
      nextWriteFailure = { matches: (key) => key.includes(match), error };
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
await assert.rejects(
  storeV1CampaignSave(indexRefreshFailureAdapter, revisedActive, { previousSave: active }),
  /injected write failure/,
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
assert.deepEqual(await loadV1CampaignSave(rolloverAdapter, active.id), rolloverSave);
assert.equal((await verifyV1Storage(rolloverAdapter)).ok, true);
const missingSegmentAdapter = memoryAdapter(rolloverAdapter.snapshot());
const missingSegmentPath = rolloverManifest.segments[0].path;
await missingSegmentAdapter.deleteJsonFile(missingSegmentPath);
assert.deepEqual(await verifyV1Storage(missingSegmentAdapter), {
  ok: false,
  initialized: true,
  missingKey: missingSegmentPath,
});
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
