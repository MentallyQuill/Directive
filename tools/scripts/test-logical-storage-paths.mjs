import assert from 'node:assert/strict';

import {
  assertDirectiveLogicalStorageKey,
  campaignSaveLogicalKey,
  campaignManifestV2LogicalKey,
  characterCreatorDraftLogicalKey,
  checkpointV2LogicalKey,
  coreCampaignManifestV2LogicalKey,
  coreCheckpointV2LogicalKey,
  coreDiagnosticsSegmentV2LogicalKey,
  coreEventSegmentV2LogicalKey,
  coreHostMapV2LogicalKey,
  coreMaterializedHeadV2LogicalKey,
  corePromptCacheV2LogicalKey,
  coreSaveManifestV2LogicalKey,
  coreTurnSegmentV2LogicalKey,
  createLogicalStorageMapper,
  diagnosticsSegmentV2LogicalKey,
  DIRECTIVE_LOGICAL_STORAGE_KEYS,
  eventSegmentV2LogicalKey,
  hostMapV2LogicalKey,
  materializedHeadV2LogicalKey,
  promptCacheV2LogicalKey,
  saveManifestV2LogicalKey,
  sidecarJobLogicalKey,
  campaignPackageImportLogicalKey,
  turnSegmentV2LogicalKey,
  toDirectStorageKey,
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
assert.equal(campaignManifestV2LogicalKey('campaign-1'), 'campaigns/campaign-1/campaign-manifest.v2.json');
assert.equal(saveManifestV2LogicalKey({ campaignId: 'campaign-1', saveId: 'save-1' }), 'campaigns/campaign-1/saves/save-1/save-manifest.v2.json');
assert.equal(materializedHeadV2LogicalKey({ campaignId: 'campaign-1', saveId: 'save-1' }), 'campaigns/campaign-1/saves/save-1/head.v2.json');
assert.equal(hostMapV2LogicalKey({ campaignId: 'campaign-1', saveId: 'save-1' }), 'campaigns/campaign-1/saves/save-1/host-map.v2.json');
assert.equal(promptCacheV2LogicalKey({ campaignId: 'campaign-1', saveId: 'save-1' }), 'campaigns/campaign-1/saves/save-1/prompt-cache.v2.json');
assert.equal(eventSegmentV2LogicalKey({ campaignId: 'campaign-1', saveId: 'save-1', segmentId: '0000' }), 'campaigns/campaign-1/saves/save-1/events/0000.v2.json');
assert.equal(turnSegmentV2LogicalKey({ campaignId: 'campaign-1', saveId: 'save-1', segmentId: '0000' }), 'campaigns/campaign-1/saves/save-1/turns/0000.v2.json');
assert.equal(diagnosticsSegmentV2LogicalKey({ campaignId: 'campaign-1', saveId: 'save-1', segmentId: '0000' }), 'campaigns/campaign-1/saves/save-1/diagnostics/0000.v2.json');
assert.equal(checkpointV2LogicalKey({ campaignId: 'campaign-1', saveId: 'save-1', checkpointId: 'checkpoint-1' }), 'campaigns/campaign-1/saves/save-1/checkpoints/checkpoint-1.v2.json');
assert.equal(coreCampaignManifestV2LogicalKey('campaign-1'), 'campaigns/campaign-1/core/campaign-manifest.v2.json');
assert.equal(coreSaveManifestV2LogicalKey({ campaignId: 'campaign-1', saveId: 'save-1' }), 'campaigns/campaign-1/saves/save-1/core/save-manifest.v2.json');
assert.equal(coreMaterializedHeadV2LogicalKey({ campaignId: 'campaign-1', saveId: 'save-1' }), 'campaigns/campaign-1/saves/save-1/core/head.v2.json');
assert.equal(coreHostMapV2LogicalKey({ campaignId: 'campaign-1', saveId: 'save-1' }), 'campaigns/campaign-1/saves/save-1/core/host-map.v2.json');
assert.equal(corePromptCacheV2LogicalKey({ campaignId: 'campaign-1', saveId: 'save-1' }), 'campaigns/campaign-1/saves/save-1/core/prompt-cache.v2.json');
assert.equal(coreEventSegmentV2LogicalKey({ campaignId: 'campaign-1', saveId: 'save-1', segmentId: '0000' }), 'campaigns/campaign-1/saves/save-1/core/events/0000.v2.json');
assert.equal(coreTurnSegmentV2LogicalKey({ campaignId: 'campaign-1', saveId: 'save-1', segmentId: '0000' }), 'campaigns/campaign-1/saves/save-1/core/turns/0000.v2.json');
assert.equal(coreDiagnosticsSegmentV2LogicalKey({ campaignId: 'campaign-1', saveId: 'save-1', segmentId: '0000' }), 'campaigns/campaign-1/saves/save-1/core/diagnostics/0000.v2.json');
assert.equal(coreCheckpointV2LogicalKey({ campaignId: 'campaign-1', saveId: 'save-1', checkpointId: 'checkpoint-1' }), 'campaigns/campaign-1/saves/save-1/core/checkpoints/checkpoint-1.v2.json');
assert.notEqual(
  coreMaterializedHeadV2LogicalKey({ campaignId: 'campaign-1', saveId: 'save-1' }),
  materializedHeadV2LogicalKey({ campaignId: 'campaign-1', saveId: 'save-1' }),
  'CORE head path must not clobber active-save head path'
);
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
  toDirectStorageKey('jobs/campaign-1/job-2.v1.json'),
  'jobs/campaign-1/job-2.v1.json'
);

const stMapper = createLogicalStorageMapper('sillytavern');
assert.equal(stMapper.toPath('system/storage-index.v1.json'), '/user/files/directive-system-storage-index.v1.json');
assert.equal(stMapper.toFileName('system/storage-index.v1.json'), 'directive-system-storage-index.v1.json');

const fakeMapper = createLogicalStorageMapper('fake');
assert.equal(fakeMapper.toPath('system/storage-index.v1.json'), 'system/storage-index.v1.json');

assert.throws(() => assertDirectiveLogicalStorageKey('../bad.json'), /Unsafe logical storage key/);
assert.throws(() => assertDirectiveLogicalStorageKey('/bad.json'), /Unsafe logical storage key/);
assert.throws(() => assertDirectiveLogicalStorageKey('saves/{saveId}.v1.json'), /Invalid logical storage key/);
assert.throws(() => campaignSaveLogicalKey('../bad'), /unsafe characters/);
assert.throws(() => eventSegmentV2LogicalKey({ campaignId: 'campaign-1', saveId: 'save-1', segmentId: '../bad' }), /unsafe characters/);
assert.throws(() => createLogicalStorageMapper('unknown'), /Unknown storage host/);

console.log('Logical storage path tests passed.');
