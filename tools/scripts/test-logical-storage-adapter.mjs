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
  adapter.toPath('v1/saves/save-1.v1.json'),
  '/user/files/directive-v1-saves-save-1.v1.json'
);

await adapter.writeJson('v1/saves/save-1.v1.json', {
  ok: true,
  nested: {
    count: 1
  }
});

const snapshot = storage.snapshot();
assert.deepEqual(snapshot['/user/files/directive-v1-saves-save-1.v1.json'], {
  ok: true,
  nested: {
    count: 1
  }
});

const loaded = await adapter.readJson('v1/saves/save-1.v1.json');
assert.deepEqual(loaded, {
  ok: true,
  nested: {
    count: 1
  }
});
loaded.nested.count = 99;
assert.equal((await adapter.readJson('v1/saves/save-1.v1.json')).nested.count, 1);

const verified = await adapter.verifyJsonFiles([
  'v1/saves/save-1.v1.json',
  'v1/saves/missing.v1.json'
]);
assert.deepEqual(verified, {
  'v1/saves/save-1.v1.json': true,
  'v1/saves/missing.v1.json': false
});

const deleted = await adapter.deleteJsonFile('v1/saves/save-1.v1.json');
assert.deepEqual(deleted, {
  ok: true,
  path: '/user/files/directive-v1-saves-save-1.v1.json'
});
assert.equal((await adapter.verifyJsonFiles(['v1/saves/save-1.v1.json']))['v1/saves/save-1.v1.json'], false);

const fakeStorage = createFakeJsonStorage();
const fakeAdapter = createLogicalStorageAdapter({
  storage: fakeStorage,
  hostId: 'fake'
});
await fakeAdapter.writeJson('v1/saves/save-2.v1.json', {
  status: 'complete'
});
assert.deepEqual(fakeStorage.snapshot()['v1/saves/save-2.v1.json'], {
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
  () => minimalAdapter.verifyJsonFiles(['v1/index.v1.json']),
  /does not support verifyJsonFiles/
);
await assert.rejects(
  () => minimalAdapter.deleteJsonFile('v1/index.v1.json'),
  /does not support deleteJsonFile/
);

assert.throws(
  () => adapter.toPath('../bad.json'),
  /Unsafe logical storage key/
);

console.log('Logical storage adapter tests passed.');
