import assert from 'node:assert/strict';

import { createFakeJsonStorage } from '../../src/hosts/fake/fake-host.mjs';
import { createLogicalStorageAdapter } from '../../src/storage/logical-storage-adapter.mjs';

const storage = createFakeJsonStorage();
const adapter = createLogicalStorageAdapter({
  storage,
  hostId: 'sillytavern'
});

assert.equal(adapter.hostId, 'sillytavern');
assert.equal(
  adapter.toPath('saves/save-1.v1.json'),
  '/user/files/directive-saves-save-1.v1.json'
);

await adapter.writeJson('saves/save-1.v1.json', {
  ok: true,
  nested: {
    count: 1
  }
});

const snapshot = storage.snapshot();
assert.deepEqual(snapshot['/user/files/directive-saves-save-1.v1.json'], {
  ok: true,
  nested: {
    count: 1
  }
});

const loaded = await adapter.readJson('saves/save-1.v1.json');
assert.deepEqual(loaded, {
  ok: true,
  nested: {
    count: 1
  }
});
loaded.nested.count = 99;
assert.equal((await adapter.readJson('saves/save-1.v1.json')).nested.count, 1);

const verified = await adapter.verifyJsonFiles([
  'saves/save-1.v1.json',
  'saves/missing.v1.json'
]);
assert.deepEqual(verified, {
  'saves/save-1.v1.json': true,
  'saves/missing.v1.json': false
});

const deleted = await adapter.deleteJsonFile('saves/save-1.v1.json');
assert.deepEqual(deleted, {
  ok: true,
  path: '/user/files/directive-saves-save-1.v1.json'
});
assert.equal((await adapter.verifyJsonFiles(['saves/save-1.v1.json']))['saves/save-1.v1.json'], false);

const lumiverseStorage = createFakeJsonStorage();
const lumiverseAdapter = createLogicalStorageAdapter({
  storage: lumiverseStorage,
  hostId: 'lumiverse'
});
await lumiverseAdapter.writeJson('jobs/campaign-1/job-1.v1.json', {
  status: 'complete'
});
assert.deepEqual(lumiverseStorage.snapshot()['jobs/campaign-1/job-1.v1.json'], {
  status: 'complete'
});

const minimalAdapter = createLogicalStorageAdapter({
  storage: {
    async readJson() {
      return {};
    },
    async writeJson() {
      return { ok: true };
    }
  },
  hostId: 'fake'
});
await assert.rejects(
  () => minimalAdapter.verifyJsonFiles(['system/storage-index.v1.json']),
  /does not support verifyJsonFiles/
);
await assert.rejects(
  () => minimalAdapter.deleteJsonFile('system/storage-index.v1.json'),
  /does not support deleteJsonFile/
);

assert.throws(
  () => adapter.toPath('../bad.json'),
  /Unsafe logical storage key/
);

console.log('Logical storage adapter tests passed.');
