import assert from 'node:assert/strict';
import {
  V1_STORAGE_PATHS,
  V1_CREATOR_DRAFT_KIND,
  createV1CampaignSave,
  deleteV1CampaignSave,
  getV1StorageIndex,
  initializeV1Storage,
  listV1CampaignSaves,
  loadActiveV1CampaignSave,
  loadV1CampaignSave,
  storeV1CampaignSave,
  storeV1CreatorDraft
} from '../../src/storage/v1-storage-repository.mjs';
import { createAshesInitialState } from './v1-test-fixtures.mjs';

function memoryAdapter(seed = {}) {
  const files = new Map(Object.entries(structuredClone(seed)));
  return {
    async readJson(key) {
      if (!files.has(key)) {
        const error = new Error(`not found: ${key}`);
        error.code = 'ENOENT';
        throw error;
      }
      return structuredClone(files.get(key));
    },
    async writeJson(key, value) { files.set(key, structuredClone(value)); },
    async deleteJsonFile(key) { files.delete(key); },
    snapshot: () => Object.fromEntries(files)
  };
}

function state(saveId = 'save.one') {
  const value = createAshesInitialState({
    campaignId: 'campaign.one',
    saveId,
    chatId: 'chat.one',
  });
  return value;
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
assert.equal((await loadActiveV1CampaignSave(adapter)).id, 'save.one');
assert.equal((await loadV1CampaignSave(adapter, 'save.one')).kind, 'directive.campaignSave.v1');

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

const checkpointDeletion = await deleteV1CampaignSave(adapter, 'checkpoint.one', { now: '2026-08-10T00:04:00.000Z' });
assert.equal(checkpointDeletion.deletedActive, false);
assert.deepEqual((await listV1CampaignSaves(adapter)).map((entry) => entry.id), ['save.one']);

const concurrentAdapter = memoryAdapter();
const concurrentSaves = ['save.concurrent-a', 'save.concurrent-b'].map((id) => createV1CampaignSave({
  id,
  name: id,
  state: state(id),
  createdAt: '2026-08-10T00:05:00.000Z'
}));
await Promise.all(concurrentSaves.map((save) => storeV1CampaignSave(concurrentAdapter, save, { makeActive: false })));
assert.deepEqual(Object.keys((await getV1StorageIndex(concurrentAdapter)).saves).sort(), [
  'save.concurrent-a',
  'save.concurrent-b'
]);

const activationRaceAdapter = memoryAdapter();
const activationRaceSave = createV1CampaignSave({
  id: 'save.activation-race',
  name: 'Activation race',
  state: state('save.activation-race'),
  createdAt: '2026-08-10T00:05:30.000Z'
});
await storeV1CampaignSave(activationRaceAdapter, activationRaceSave, { makeActive: false });
const readBeforeActivationRace = activationRaceAdapter.readJson;
let reportActivationRead;
let releaseActivationRead;
const activationReadStarted = new Promise((resolve) => { reportActivationRead = resolve; });
const activationReadRelease = new Promise((resolve) => { releaseActivationRead = resolve; });
activationRaceAdapter.readJson = async (key) => {
  const value = await readBeforeActivationRace(key);
  if (key === V1_STORAGE_PATHS.save(activationRaceSave.id)) {
    reportActivationRead();
    await activationReadRelease;
  }
  return value;
};
const activation = loadV1CampaignSave(activationRaceAdapter, activationRaceSave.id, { makeActive: true });
await activationReadStarted;
let deletionResolved = false;
const deletion = deleteV1CampaignSave(activationRaceAdapter, activationRaceSave.id).then((result) => {
  deletionResolved = true;
  return result;
});
await new Promise((resolve) => setImmediate(resolve));
assert.equal(deletionResolved, false, 'deletion must wait for an in-flight activation read');
releaseActivationRead();
await Promise.all([activation, deletion]);
assert.equal((await getV1StorageIndex(activationRaceAdapter)).activeSaveId, null);

await assert.rejects(
  storeV1CreatorDraft(adapter, { ...draft, id: '__proto__' }),
  /safe non-empty id/
);

const authorizationError = new Error('authorization context not found');
authorizationError.status = 403;
await assert.rejects(
  initializeV1Storage({
    async readJson() { throw authorizationError; },
    async writeJson() { throw new Error('must not write after an authorization failure'); }
  }),
  (error) => error === authorizationError
);

const status404Adapter = memoryAdapter();
status404Adapter.readJson = async () => {
  const error = new Error('absent');
  error.status = 404;
  throw error;
};
let initializedFrom404 = null;
status404Adapter.writeJson = async (key, value) => { initializedFrom404 = { key, value }; };
await initializeV1Storage(status404Adapter, { now: '2026-08-10T00:06:00.000Z' });
assert.equal(initializedFrom404.key, V1_STORAGE_PATHS.index);

const blockedAdapter = {
  async readJson() { return new Promise(() => {}); },
  async writeJson() {}
};
void initializeV1Storage(blockedAdapter);
const independentAdapter = memoryAdapter();
await initializeV1Storage(independentAdapter, { now: '2026-08-10T00:07:00.000Z' });
assert.equal((await getV1StorageIndex(independentAdapter)).kind, 'directive.storageIndex.v1');

await assert.rejects(
  loadV1CampaignSave(memoryAdapter({
    [V1_STORAGE_PATHS.index]: {
      kind: 'directive.storageIndex.v1', version: 1, activeSaveId: 'invalid', drafts: {},
      saves: { invalid: { id: 'invalid' } }, updatedAt: '2026-08-10T00:00:00.000Z'
    },
    [V1_STORAGE_PATHS.save('invalid')]: { kind: 'directive.unsupportedSave', id: 'invalid' }
  }), 'invalid'),
  (error) => error?.code === 'DIRECTIVE_V1_SAVE_REJECTED'
);

console.log('PASS V1 storage repository');
