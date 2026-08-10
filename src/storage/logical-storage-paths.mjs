const LOGICAL_KEY_PATTERN = /^[a-z0-9][a-z0-9/_.-]*\.json$/;

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
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
