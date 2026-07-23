const LOGICAL_KEY_PATTERN = /^[a-z0-9][a-z0-9/_.-]*\.json$/;
const SAFE_SEGMENT_PATTERN = /^[a-zA-Z0-9_.-]+$/;

export const DIRECTIVE_LOGICAL_STORAGE_KEYS = Object.freeze({
  storageIndex: 'system/storage-index.v1.json',
  creatorDraftIndex: 'indexes/character-creator-drafts.v1.json',
  campaignPackageImportIndex: 'indexes/campaign-package-imports.v1.json',
  saveIndex: 'indexes/saves.v1.json',
  uiPreferences: 'system/ui-preferences.v1.json',
  manualCheckpointIndex: 'campaigns/{campaignId}/manual-checkpoints/index.v1.json',
  manualCheckpoint: 'campaigns/{campaignId}/manual-checkpoints/{checkpointId}.v1.json',
  checkpointOperation: 'campaigns/{campaignId}/checkpoint-operations/{operationId}.v1.json',
  campaignSave: 'saves/{saveId}.v1.json',
  campaignManifestV2: 'campaigns/{campaignId}/campaign-manifest.v2.json',
  saveManifestV2: 'campaigns/{campaignId}/saves/{saveId}/save-manifest.v2.json',
  materializedHeadV2: 'campaigns/{campaignId}/saves/{saveId}/head.v2.json',
  materializedHeadRootV2: 'campaigns/{campaignId}/saves/{saveId}/head-roots/{root}.v2.json',
  hostMapV2: 'campaigns/{campaignId}/saves/{saveId}/host-map.v2.json',
  promptCacheV2: 'campaigns/{campaignId}/saves/{saveId}/prompt-cache.v2.json',
  eventSegmentV2: 'campaigns/{campaignId}/saves/{saveId}/events/{segmentId}.v2.json',
  turnSegmentV2: 'campaigns/{campaignId}/saves/{saveId}/turns/{segmentId}.v2.json',
  diagnosticsSegmentV2: 'campaigns/{campaignId}/saves/{saveId}/diagnostics/{segmentId}.v2.json',
  checkpointV2: 'campaigns/{campaignId}/saves/{saveId}/checkpoints/{checkpointId}.v2.json',
  coreCampaignManifestV2: 'campaigns/{campaignId}/core/campaign-manifest.v2.json',
  coreSaveManifestV2: 'campaigns/{campaignId}/saves/{saveId}/core/save-manifest.v2.json',
  coreMaterializedHeadV2: 'campaigns/{campaignId}/saves/{saveId}/core/head.v2.json',
  coreMaterializedHeadRootV2: 'campaigns/{campaignId}/saves/{saveId}/core/head-roots/{root}.v2.json',
  coreHostMapV2: 'campaigns/{campaignId}/saves/{saveId}/core/host-map.v2.json',
  corePromptCacheV2: 'campaigns/{campaignId}/saves/{saveId}/core/prompt-cache.v2.json',
  coreEventSegmentV2: 'campaigns/{campaignId}/saves/{saveId}/core/events/{segmentId}.v2.json',
  coreTurnSegmentV2: 'campaigns/{campaignId}/saves/{saveId}/core/turns/{segmentId}.v2.json',
  coreDiagnosticsSegmentV2: 'campaigns/{campaignId}/saves/{saveId}/core/diagnostics/{segmentId}.v2.json',
  coreCheckpointV2: 'campaigns/{campaignId}/saves/{saveId}/core/checkpoints/{checkpointId}.v2.json',
  characterCreatorDraft: 'drafts/character-creator/{draftId}.v1.json',
  campaignPackageImport: 'packages/imports/{importId}.v1.json',
  sidecarJob: 'jobs/{campaignId}/{jobId}.v1.json'
});

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function requireSafeSegment(value, label) {
  const segment = requireNonEmptyString(value, label);
  if (!SAFE_SEGMENT_PATTERN.test(segment)) {
    throw new Error(`${label} contains unsafe characters`);
  }
  return segment;
}

export function assertDirectiveLogicalStorageKey(key) {
  const value = requireNonEmptyString(key, 'logical storage key');
  if (value.includes('..') || value.startsWith('/') || value.includes('\\')) {
    throw new Error(`Unsafe logical storage key "${value}"`);
  }
  if (!LOGICAL_KEY_PATTERN.test(value)) {
    throw new Error(`Invalid logical storage key "${value}"`);
  }
  return value;
}

function fillTemplate(template, values = {}) {
  return assertDirectiveLogicalStorageKey(template.replace(/\{([^}]+)\}/g, (_, key) => {
    return requireSafeSegment(values[key], key);
  }));
}

export function campaignSaveLogicalKey(saveId) {
  return fillTemplate(DIRECTIVE_LOGICAL_STORAGE_KEYS.campaignSave, { saveId });
}

export function manualCheckpointIndexLogicalKey(campaignId) {
  return fillTemplate(DIRECTIVE_LOGICAL_STORAGE_KEYS.manualCheckpointIndex, { campaignId });
}

export function manualCheckpointLogicalKey({ campaignId, checkpointId } = {}) {
  return fillTemplate(DIRECTIVE_LOGICAL_STORAGE_KEYS.manualCheckpoint, { campaignId, checkpointId });
}

export function checkpointOperationLogicalKey({ campaignId, operationId } = {}) {
  return fillTemplate(DIRECTIVE_LOGICAL_STORAGE_KEYS.checkpointOperation, { campaignId, operationId });
}

export function campaignManifestV2LogicalKey(campaignId) {
  return fillTemplate(DIRECTIVE_LOGICAL_STORAGE_KEYS.campaignManifestV2, { campaignId });
}

export function saveManifestV2LogicalKey({ campaignId, saveId } = {}) {
  return fillTemplate(DIRECTIVE_LOGICAL_STORAGE_KEYS.saveManifestV2, { campaignId, saveId });
}

export function materializedHeadV2LogicalKey({ campaignId, saveId } = {}) {
  return fillTemplate(DIRECTIVE_LOGICAL_STORAGE_KEYS.materializedHeadV2, { campaignId, saveId });
}

export function materializedHeadRootV2LogicalKey({ campaignId, saveId, root } = {}) {
  return fillTemplate(DIRECTIVE_LOGICAL_STORAGE_KEYS.materializedHeadRootV2, { campaignId, saveId, root });
}

export function hostMapV2LogicalKey({ campaignId, saveId } = {}) {
  return fillTemplate(DIRECTIVE_LOGICAL_STORAGE_KEYS.hostMapV2, { campaignId, saveId });
}

export function promptCacheV2LogicalKey({ campaignId, saveId } = {}) {
  return fillTemplate(DIRECTIVE_LOGICAL_STORAGE_KEYS.promptCacheV2, { campaignId, saveId });
}

export function eventSegmentV2LogicalKey({ campaignId, saveId, segmentId } = {}) {
  return fillTemplate(DIRECTIVE_LOGICAL_STORAGE_KEYS.eventSegmentV2, { campaignId, saveId, segmentId });
}

export function turnSegmentV2LogicalKey({ campaignId, saveId, segmentId } = {}) {
  return fillTemplate(DIRECTIVE_LOGICAL_STORAGE_KEYS.turnSegmentV2, { campaignId, saveId, segmentId });
}

export function diagnosticsSegmentV2LogicalKey({ campaignId, saveId, segmentId } = {}) {
  return fillTemplate(DIRECTIVE_LOGICAL_STORAGE_KEYS.diagnosticsSegmentV2, { campaignId, saveId, segmentId });
}

export function checkpointV2LogicalKey({ campaignId, saveId, checkpointId } = {}) {
  return fillTemplate(DIRECTIVE_LOGICAL_STORAGE_KEYS.checkpointV2, { campaignId, saveId, checkpointId });
}

export function coreCampaignManifestV2LogicalKey(campaignId) {
  return fillTemplate(DIRECTIVE_LOGICAL_STORAGE_KEYS.coreCampaignManifestV2, { campaignId });
}

export function coreSaveManifestV2LogicalKey({ campaignId, saveId } = {}) {
  return fillTemplate(DIRECTIVE_LOGICAL_STORAGE_KEYS.coreSaveManifestV2, { campaignId, saveId });
}

export function coreMaterializedHeadV2LogicalKey({ campaignId, saveId } = {}) {
  return fillTemplate(DIRECTIVE_LOGICAL_STORAGE_KEYS.coreMaterializedHeadV2, { campaignId, saveId });
}

export function coreMaterializedHeadRootV2LogicalKey({ campaignId, saveId, root } = {}) {
  return fillTemplate(DIRECTIVE_LOGICAL_STORAGE_KEYS.coreMaterializedHeadRootV2, { campaignId, saveId, root });
}

export function coreHostMapV2LogicalKey({ campaignId, saveId } = {}) {
  return fillTemplate(DIRECTIVE_LOGICAL_STORAGE_KEYS.coreHostMapV2, { campaignId, saveId });
}

export function corePromptCacheV2LogicalKey({ campaignId, saveId } = {}) {
  return fillTemplate(DIRECTIVE_LOGICAL_STORAGE_KEYS.corePromptCacheV2, { campaignId, saveId });
}

export function coreEventSegmentV2LogicalKey({ campaignId, saveId, segmentId } = {}) {
  return fillTemplate(DIRECTIVE_LOGICAL_STORAGE_KEYS.coreEventSegmentV2, { campaignId, saveId, segmentId });
}

export function coreTurnSegmentV2LogicalKey({ campaignId, saveId, segmentId } = {}) {
  return fillTemplate(DIRECTIVE_LOGICAL_STORAGE_KEYS.coreTurnSegmentV2, { campaignId, saveId, segmentId });
}

export function coreDiagnosticsSegmentV2LogicalKey({ campaignId, saveId, segmentId } = {}) {
  return fillTemplate(DIRECTIVE_LOGICAL_STORAGE_KEYS.coreDiagnosticsSegmentV2, { campaignId, saveId, segmentId });
}

export function coreCheckpointV2LogicalKey({ campaignId, saveId, checkpointId } = {}) {
  return fillTemplate(DIRECTIVE_LOGICAL_STORAGE_KEYS.coreCheckpointV2, { campaignId, saveId, checkpointId });
}

export function characterCreatorDraftLogicalKey(draftId) {
  return fillTemplate(DIRECTIVE_LOGICAL_STORAGE_KEYS.characterCreatorDraft, { draftId });
}

export function campaignPackageImportLogicalKey(importId) {
  return fillTemplate(DIRECTIVE_LOGICAL_STORAGE_KEYS.campaignPackageImport, { importId });
}

export function sidecarJobLogicalKey({ campaignId, jobId } = {}) {
  return fillTemplate(DIRECTIVE_LOGICAL_STORAGE_KEYS.sidecarJob, { campaignId, jobId });
}

export function toSillyTavernStorageFileName(logicalKey) {
  const key = assertDirectiveLogicalStorageKey(logicalKey);
  const base = key
    .replace(/\.json$/u, '')
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `directive-${base}.json`;
}

export function toSillyTavernUserFilesPath(logicalKey) {
  return `/user/files/${toSillyTavernStorageFileName(logicalKey)}`;
}

export function toDirectStorageKey(logicalKey) {
  return assertDirectiveLogicalStorageKey(logicalKey);
}

export function createLogicalStorageMapper(hostId) {
  const host = requireNonEmptyString(hostId, 'hostId').toLowerCase();
  if (host === 'sillytavern') {
    return {
      hostId: host,
      toPath: toSillyTavernUserFilesPath,
      toFileName: toSillyTavernStorageFileName
    };
  }
  if (host === 'fake') {
    return {
      hostId: host,
      toPath: toDirectStorageKey,
      toFileName: toDirectStorageKey
    };
  }
  throw new Error(`Unknown storage host "${hostId}"`);
}
