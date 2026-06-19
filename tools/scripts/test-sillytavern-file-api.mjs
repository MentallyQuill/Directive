import assert from 'node:assert/strict';
import {
  assertDirectiveStorageFileName,
  assertDirectiveUserFilesPath,
  buildDirectiveIndexStorageFileName,
  buildDirectiveJsonStorageFileName,
  getDirectiveUserFilesFileName,
  toDirectiveUserFilesPath,
  validateDirectiveStorageFileName,
  validateDirectiveUserFilesPath
} from '../../src/storage/directive-storage-filenames.mjs';
import {
  __sillyTavernFileApiTestHooks,
  createSillyTavernFileApi,
  createSillyTavernFileStorageAdapter
} from '../../src/hosts/sillytavern/file-api.mjs';
import {
  diagnoseDirectiveStorage,
  initializeDirectiveStorage
} from '../../src/storage/directive-storage-repository.mjs';
import { createSillyTavernStorageAdapter } from '../../src/hosts/sillytavern/storage-adapter.mjs';

assert.equal(buildDirectiveIndexStorageFileName('save'), 'directive-save-index.v1.json');
assert.equal(buildDirectiveJsonStorageFileName('save', 'Ren Okada'), 'directive-save-ren-okada.v1.json');
assert.equal(
  buildDirectiveJsonStorageFileName('character creator draft', 'Commander/XO Draft'),
  'directive-character-creator-draft-commander-xo-draft.v1.json'
);
assert.equal(toDirectiveUserFilesPath('directive-save-index.v1.json'), '/user/files/directive-save-index.v1.json');
assert.equal(getDirectiveUserFilesFileName('/user/files/directive-save-index.v1.json'), 'directive-save-index.v1.json');
assert.equal(assertDirectiveStorageFileName('directive-storage-index.v1.json'), 'directive-storage-index.v1.json');
assert.equal(assertDirectiveUserFilesPath('/user/files/directive-storage-index.v1.json'), '/user/files/directive-storage-index.v1.json');
assert.equal(validateDirectiveStorageFileName('directive-save-index.v1.json').ok, true);
assert.equal(validateDirectiveStorageFileName('save-index.v1.json').ok, false, 'filenames must be directive-prefixed');
assert.equal(validateDirectiveStorageFileName('directive/save-index.v1.json').ok, false, 'filenames must be flat');
assert.equal(validateDirectiveStorageFileName('.directive-save-index.v1.json').ok, false, 'filenames cannot start with dot');
assert.equal(validateDirectiveStorageFileName('directive-save-index.v1.js').ok, false, 'active extensions are blocked');
assert.equal(validateDirectiveStorageFileName('directive-map.svg').ok, false, 'scriptable svg is blocked');
assert.equal(validateDirectiveUserFilesPath('/img/directive-save-index.v1.json').ok, false, 'paths must be under /user/files');

const roundTripText = 'Directive storage round trip';
const encoded = __sillyTavernFileApiTestHooks.utf8ToBase64(roundTripText);
assert.equal(__sillyTavernFileApiTestHooks.base64ToUtf8(encoded), roundTripText);

const calls = [];
const stored = new Map();

function response(ok, status, body = '') {
  return {
    ok,
    status,
    async text() {
      return body;
    }
  };
}

const fileApi = createSillyTavernFileApi({
  getRequestHeaders: () => ({ 'X-CSRF-Token': 'directive-test-token' }),
  fetchImpl: async (url, init = {}) => {
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, method, headers: init.headers || {}, body });

    if (url === '/api/files/upload' && method === 'POST') {
      if (body.name === 'directive-fail.v1.json') {
        return response(false, 500, JSON.stringify({ message: 'upload failed' }));
      }
      stored.set(`/user/files/${body.name}`, __sillyTavernFileApiTestHooks.base64ToUtf8(body.data));
      return response(true, 200, JSON.stringify({ path: `/user/files/${body.name}` }));
    }

    if (url === '/api/files/verify' && method === 'POST') {
      const result = {};
      for (const filePath of body.urls || []) {
        result[filePath] = stored.has(filePath);
      }
      return response(true, 200, JSON.stringify(result));
    }

    if (url === '/api/files/delete' && method === 'POST') {
      stored.delete(body.path);
      return response(true, 200, '');
    }

    if (method === 'GET') {
      if (!stored.has(url)) {
        return response(false, 404, 'missing');
      }
      return response(true, 200, stored.get(url));
    }

    return response(false, 404, 'unexpected request');
  }
});

const writeResult = await fileApi.writeJsonFile('directive-save-index.v1.json', {
  schemaVersion: 1,
  kind: 'directive.saveIndex'
});
assert.deepEqual(writeResult, {
  path: '/user/files/directive-save-index.v1.json',
  fileName: 'directive-save-index.v1.json'
});
assert.equal(calls[0].url, '/api/files/upload');
assert.equal(calls[0].headers['X-CSRF-Token'], 'directive-test-token');
assert.equal(calls[0].headers['Content-Type'], 'application/json');
assert.equal(JSON.parse(stored.get('/user/files/directive-save-index.v1.json')).kind, 'directive.saveIndex');

const loaded = await fileApi.readJsonFile('/user/files/directive-save-index.v1.json');
assert.equal(loaded.schemaVersion, 1);
assert.equal(loaded.kind, 'directive.saveIndex');

const verified = await fileApi.verifyFiles([
  '/user/files/directive-save-index.v1.json',
  '/user/files/directive-save-index.v1.json'
]);
assert.equal(verified['/user/files/directive-save-index.v1.json'], true);
const verifyCall = calls.find((call) => call.url === '/api/files/verify');
assert.equal(verifyCall.body.urls.length, 1, 'verify should dedupe paths');

await fileApi.deleteFile('/user/files/directive-save-index.v1.json');
const verifiedAfterDelete = await fileApi.verifyFiles(['/user/files/directive-save-index.v1.json']);
assert.equal(verifiedAfterDelete['/user/files/directive-save-index.v1.json'], false);

await assert.rejects(() => fileApi.writeJsonFile('directive/save-index.v1.json', {}), /flat/);
await assert.rejects(() => fileApi.readJsonFile('/img/directive-save-index.v1.json'), /under \/user\/files/);
await assert.rejects(async () => {
  await fileApi.writeJsonFile('directive-fail.v1.json', {});
}, (error) => {
  assert.equal(error.status, 500);
  assert.equal(error.message, 'upload failed');
  return true;
});

const adapter = createSillyTavernFileStorageAdapter({ fileApi });
await adapter.writeJson('/user/files/directive-save-adapter.v1.json', { ok: true });
const adapterLoaded = await adapter.readJson('/user/files/directive-save-adapter.v1.json');
assert.equal(adapterLoaded.ok, true);
const adapterVerify = await adapter.verifyJsonFiles([
  '/user/files/directive-save-adapter.v1.json',
  '/user/files/directive-missing-adapter.v1.json'
]);
assert.equal(adapterVerify['/user/files/directive-save-adapter.v1.json'], true);
assert.equal(adapterVerify['/user/files/directive-missing-adapter.v1.json'], false);

const logicalAdapter = createSillyTavernStorageAdapter({ storage: adapter });
await initializeDirectiveStorage(logicalAdapter, { now: '2026-06-18T21:00:00.000Z' });
assert.equal(JSON.parse(stored.get('/user/files/directive-system-storage-index.v1.json')).kind, 'directive.storageIndex');
assert.equal(JSON.parse(stored.get('/user/files/directive-indexes-character-creator-drafts.v1.json')).kind, 'directive.characterCreatorDraftIndex');
assert.equal(JSON.parse(stored.get('/user/files/directive-indexes-saves.v1.json')).kind, 'directive.saveIndex');
const storageDiagnostics = await diagnoseDirectiveStorage(logicalAdapter, { now: '2026-06-18T21:01:00.000Z' });
assert.equal(storageDiagnostics.status, 'ok');
assert.equal(storageDiagnostics.counts.creatorDrafts, 0);
assert.equal(storageDiagnostics.counts.saves, 0);

console.log('SillyTavern file API tests passed.');
