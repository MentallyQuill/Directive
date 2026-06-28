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

const fakeStorage = createFakeJsonStorage();
const fakeAdapter = createLogicalStorageAdapter({
  storage: fakeStorage,
  hostId: 'fake'
});
await fakeAdapter.writeJson('jobs/campaign-1/job-1.v1.json', {
  status: 'complete'
});
assert.deepEqual(fakeStorage.snapshot()['jobs/campaign-1/job-1.v1.json'], {
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

const progressStorage = createFakeJsonStorage();
const progressEvents = [];
const progressAdapter = createLogicalStorageAdapter({
  storage: progressStorage,
  hostId: 'sillytavern',
  onProgress(event) {
    progressEvents.push(event);
  }
});

await progressAdapter.writeJson('saves/save-progress.v1.json', {
  ok: true
});
assert.deepEqual(progressEvents.map((event) => event.phase), [
  'storageWriteStarted',
  'storageWriteComplete'
]);
assert.equal(progressEvents[0].kind, 'directive.storageProgress');
assert.equal(progressEvents[0].logicalKey, 'saves/save-progress.v1.json');
assert.equal(progressEvents[0].path, '/user/files/directive-saves-save-progress.v1.json');
assert.equal(progressEvents[0].operation, 'writeJson');
assert.equal(progressEvents[1].operationId, progressEvents[0].operationId);

progressEvents.length = 0;
await progressAdapter.deleteJsonFile('saves/save-progress.v1.json');
assert.deepEqual(progressEvents.map((event) => event.phase), [
  'storageDeleteStarted',
  'storageDeleteComplete'
]);
assert.equal(progressEvents[0].operation, 'deleteJsonFile');
assert.equal(progressEvents[1].operationId, progressEvents[0].operationId);

const failedProgressEvents = [];
const failingAdapter = createLogicalStorageAdapter({
  storage: {
    async readJson() {
      return {};
    },
    async writeJson() {
      const error = new Error('write failed');
      error.code = 'EWRITE';
      throw error;
    }
  },
  hostId: 'fake',
  onProgress(event) {
    failedProgressEvents.push(event);
  }
});
await assert.rejects(
  () => failingAdapter.writeJson('saves/save-fail.v1.json', { ok: false }),
  /write failed/
);
assert.deepEqual(failedProgressEvents.map((event) => event.phase), [
  'storageWriteStarted',
  'storageWriteFailed'
]);
assert.equal(failedProgressEvents[1].error.code, 'EWRITE');

console.log('Logical storage adapter tests passed.');
