const LOGICAL_KEY_PATTERN = /^[a-z0-9][a-z0-9/_.-]*\.json$/;
const SAFE_SEGMENT_PATTERN = /^[a-zA-Z0-9_.-]+$/;

export const DIRECTIVE_LOGICAL_STORAGE_KEYS = Object.freeze({
  storageIndex: 'system/storage-index.v1.json',
  creatorDraftIndex: 'indexes/character-creator-drafts.v1.json',
  saveIndex: 'indexes/saves.v1.json',
  campaignSave: 'saves/{saveId}.v1.json',
  characterCreatorDraft: 'drafts/character-creator/{draftId}.v1.json',
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

export function characterCreatorDraftLogicalKey(draftId) {
  return fillTemplate(DIRECTIVE_LOGICAL_STORAGE_KEYS.characterCreatorDraft, { draftId });
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

export function toLumiverseStorageKey(logicalKey) {
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
  if (host === 'lumiverse' || host === 'fake') {
    return {
      hostId: host,
      toPath: toLumiverseStorageKey,
      toFileName: toLumiverseStorageKey
    };
  }
  throw new Error(`Unknown storage host "${hostId}"`);
}
