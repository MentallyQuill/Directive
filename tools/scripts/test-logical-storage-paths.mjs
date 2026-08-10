import assert from 'node:assert/strict';

import {
  assertDirectiveLogicalStorageKey,
  createLogicalStorageMapper,
  toDirectStorageKey,
  toSillyTavernStorageFileName,
  toSillyTavernUserFilesPath
} from '../../src/storage/logical-storage-paths.mjs';

const v1SaveKey = 'v1/saves/save-abc_123.v1.json';

assert.equal(assertDirectiveLogicalStorageKey(v1SaveKey), v1SaveKey);
assert.equal(
  toSillyTavernStorageFileName(v1SaveKey),
  'directive-v1-saves-save-abc_123.v1.json'
);
assert.equal(
  toSillyTavernUserFilesPath('v1/index.v1.json'),
  '/user/files/directive-v1-index.v1.json'
);
assert.equal(toDirectStorageKey(v1SaveKey), v1SaveKey);

const stMapper = createLogicalStorageMapper('sillytavern');
assert.equal(stMapper.toPath('v1/index.v1.json'), '/user/files/directive-v1-index.v1.json');
assert.equal(stMapper.toFileName('v1/index.v1.json'), 'directive-v1-index.v1.json');

const fakeMapper = createLogicalStorageMapper('fake');
assert.equal(fakeMapper.toPath(v1SaveKey), v1SaveKey);

assert.throws(() => assertDirectiveLogicalStorageKey('../bad.json'), /Unsafe logical storage key/);
assert.throws(() => assertDirectiveLogicalStorageKey('/bad.json'), /Unsafe logical storage key/);
assert.throws(() => assertDirectiveLogicalStorageKey('v1/{saveId}.json'), /Invalid logical storage key/);
assert.throws(() => assertDirectiveLogicalStorageKey('v1/save.txt'), /Invalid logical storage key/);
assert.throws(() => createLogicalStorageMapper('unknown'), /Unknown storage host/);

console.log('Logical storage path tests passed.');
