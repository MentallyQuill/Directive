import assert from 'node:assert/strict';

import {
  assertDirectiveLogicalStorageKey,
  campaignSaveLogicalKey,
  characterCreatorDraftLogicalKey,
  createLogicalStorageMapper,
  DIRECTIVE_LOGICAL_STORAGE_KEYS,
  sidecarJobLogicalKey,
  campaignPackageImportLogicalKey,
  toLumiverseStorageKey,
  toSillyTavernStorageFileName,
  toSillyTavernUserFilesPath
} from '../../src/storage/logical-storage-paths.mjs';

assert.equal(
  assertDirectiveLogicalStorageKey(DIRECTIVE_LOGICAL_STORAGE_KEYS.storageIndex),
  'system/storage-index.v1.json'
);
assert.equal(campaignSaveLogicalKey('save-abc_123'), 'saves/save-abc_123.v1.json');
assert.equal(characterCreatorDraftLogicalKey('draft.1'), 'drafts/character-creator/draft.1.v1.json');
assert.equal(campaignPackageImportLogicalKey('package-import.1'), 'packages/imports/package-import.1.v1.json');
assert.equal(
  sidecarJobLogicalKey({
    campaignId: 'campaign-1',
    jobId: 'job-2'
  }),
  'jobs/campaign-1/job-2.v1.json'
);

assert.equal(
  toSillyTavernStorageFileName('saves/save-abc_123.v1.json'),
  'directive-saves-save-abc_123.v1.json'
);
assert.equal(
  toSillyTavernUserFilesPath('indexes/saves.v1.json'),
  '/user/files/directive-indexes-saves.v1.json'
);
assert.equal(
  toSillyTavernUserFilesPath(DIRECTIVE_LOGICAL_STORAGE_KEYS.campaignPackageImportIndex),
  '/user/files/directive-indexes-campaign-package-imports.v1.json'
);
assert.equal(
  toLumiverseStorageKey('jobs/campaign-1/job-2.v1.json'),
  'jobs/campaign-1/job-2.v1.json'
);

const stMapper = createLogicalStorageMapper('sillytavern');
assert.equal(stMapper.toPath('system/storage-index.v1.json'), '/user/files/directive-system-storage-index.v1.json');
assert.equal(stMapper.toFileName('system/storage-index.v1.json'), 'directive-system-storage-index.v1.json');

const lumiverseMapper = createLogicalStorageMapper('lumiverse');
assert.equal(lumiverseMapper.toPath('system/storage-index.v1.json'), 'system/storage-index.v1.json');

assert.throws(() => assertDirectiveLogicalStorageKey('../bad.json'), /Unsafe logical storage key/);
assert.throws(() => assertDirectiveLogicalStorageKey('/bad.json'), /Unsafe logical storage key/);
assert.throws(() => assertDirectiveLogicalStorageKey('saves/{saveId}.v1.json'), /Invalid logical storage key/);
assert.throws(() => campaignSaveLogicalKey('../bad'), /unsafe characters/);
assert.throws(() => createLogicalStorageMapper('unknown'), /Unknown storage host/);

console.log('Logical storage path tests passed.');
