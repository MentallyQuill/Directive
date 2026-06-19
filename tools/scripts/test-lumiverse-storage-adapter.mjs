import assert from 'node:assert/strict';

import { createLumiverseStorageAdapter } from '../../src/hosts/lumiverse/storage-adapter.mjs';

function createFakeJsonStorageApi() {
  const files = new Map();
  const calls = [];
  return {
    calls,
    files,
    async getJson(filePath, options = {}) {
      calls.push({ method: 'getJson', filePath, options });
      return files.has(filePath) ? JSON.parse(JSON.stringify(files.get(filePath))) : options.fallback;
    },
    async setJson(filePath, value, options = {}) {
      calls.push({ method: 'setJson', filePath, value, options });
      files.set(filePath, JSON.parse(JSON.stringify(value)));
    },
    async exists(filePath, userId = undefined) {
      calls.push({ method: 'exists', filePath, userId });
      return files.has(filePath);
    },
    async list(prefix = '', userId = undefined) {
      calls.push({ method: 'list', prefix, userId });
      return [...files.keys()].filter((filePath) => filePath.startsWith(prefix));
    },
    async delete(filePath, userId = undefined) {
      calls.push({ method: 'delete', filePath, userId });
      files.delete(filePath);
    }
  };
}

const userStorage = createFakeJsonStorageApi();
const adapter = createLumiverseStorageAdapter({
  spindle: {
    userStorage
  },
  userId: 'operator-user-1'
});

await adapter.writeJson('saves/save-1.v1.json', {
  ok: true
});
assert.deepEqual(userStorage.files.get('saves/save-1.v1.json'), {
  ok: true
});
assert.equal(userStorage.calls[0].method, 'setJson');
assert.equal(userStorage.calls[0].options.userId, 'operator-user-1');
assert.equal(userStorage.calls[0].options.indent, 2);

assert.deepEqual(await adapter.readJson('saves/save-1.v1.json'), {
  ok: true
});
assert.equal(userStorage.calls[1].options.userId, 'operator-user-1');

const verified = await adapter.verifyJsonFiles([
  'saves/save-1.v1.json',
  'saves/missing.v1.json'
]);
assert.deepEqual(verified, {
  'saves/save-1.v1.json': true,
  'saves/missing.v1.json': false
});
assert.equal(userStorage.calls.find((call) => call.method === 'exists').userId, 'operator-user-1');

assert.deepEqual(await adapter.listJsonFiles('saves/'), ['saves/save-1.v1.json']);
assert.equal(userStorage.calls.find((call) => call.method === 'list').userId, 'operator-user-1');

assert.deepEqual(await adapter.deleteJsonFile('saves/save-1.v1.json'), {
  ok: true,
  path: 'saves/save-1.v1.json'
});
assert.equal(userStorage.files.has('saves/save-1.v1.json'), false);

const sharedStorage = createFakeJsonStorageApi();
const sharedAdapter = createLumiverseStorageAdapter({
  spindle: {
    storage: sharedStorage
  },
  scope: 'shared',
  userId: 'should-not-pass'
});
await sharedAdapter.writeJson('system/storage-index.v1.json', {
  kind: 'directive.storageIndex'
});
assert.equal(sharedStorage.calls[0].options.userId, undefined);

const textStorageCalls = [];
const textAdapter = createLumiverseStorageAdapter({
  spindle: {
    storage: {
      async read(filePath) {
        textStorageCalls.push({ method: 'read', filePath });
        return '{"ok":true}';
      },
      async write(filePath, text) {
        textStorageCalls.push({ method: 'write', filePath, text });
      },
      async exists() {
        return true;
      },
      async list() {
        return [];
      },
      async delete() {}
    }
  },
  scope: 'shared',
  indent: 0
});
assert.deepEqual(await textAdapter.readJson('system/storage-index.v1.json'), {
  ok: true
});
await textAdapter.writeJson('system/storage-index.v1.json', {
  ok: true
});
assert.match(textStorageCalls.find((call) => call.method === 'write').text, /^\{"ok":true\}\n$/);

assert.throws(
  () => createLumiverseStorageAdapter({ spindle: {} }),
  /spindle\.userStorage/
);
await assert.rejects(
  () => adapter.listJsonFiles('../bad'),
  /Unsafe Lumiverse storage prefix/
);
await assert.rejects(
  () => adapter.writeJson('../bad.json', {}),
  /Unsafe logical storage key/
);

console.log('Lumiverse storage adapter tests passed.');
