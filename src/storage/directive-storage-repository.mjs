import { createSaveListEntry } from './save-records.mjs';
import {
  buildDirectiveJsonStorageFileName,
  toDirectiveUserFilesPath
} from './directive-storage-filenames.mjs';

export const DIRECTIVE_STORAGE_PATHS = {
  storageIndex: '/user/files/directive-storage-index.v1.json',
  creatorDraftIndex: '/user/files/directive-character-creator-draft-index.v1.json',
  saveIndex: '/user/files/directive-save-index.v1.json'
};

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireObject(value, label) {
  if (!isObject(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function isoNow() {
  return new Date().toISOString();
}

function timestamp(options = {}) {
  return options.now || options.savedAt || isoNow();
}

function safeFileId(id) {
  return encodeURIComponent(requireNonEmptyString(id, 'id'));
}

export function characterCreatorDraftPath(draftId) {
  return toDirectiveUserFilesPath(buildDirectiveJsonStorageFileName('character-creator-draft', safeFileId(draftId)));
}

export function campaignSavePath(saveId) {
  return toDirectiveUserFilesPath(buildDirectiveJsonStorageFileName('save', safeFileId(saveId)));
}

function isMissingRead(error) {
  return error?.code === 'ENOENT'
    || error?.name === 'NotFoundError'
    || /not found|missing/i.test(String(error?.message || ''));
}

function createStorageReadError({ code, message, filePath, cause = null }) {
  const error = new Error(message);
  error.code = code;
  error.filePath = filePath;
  if (cause) error.cause = cause;
  return error;
}

function createStorageIssue({
  severity = 'warning',
  code,
  message,
  path = null,
  ownerId = null,
  kind = null
}) {
  return {
    severity,
    code,
    message,
    path,
    ownerId,
    kind
  };
}

async function readJsonOrNull(adapter, filePath) {
  requireObject(adapter, 'storage adapter');
  if (typeof adapter.readJson !== 'function') {
    throw new Error('storage adapter must provide readJson(path)');
  }
  try {
    const value = await adapter.readJson(filePath);
    return value == null ? null : cloneJson(value);
  } catch (error) {
    if (isMissingRead(error)) {
      return null;
    }
    throw error;
  }
}

async function readJsonDiagnostic(adapter, filePath) {
  requireObject(adapter, 'storage adapter');
  if (typeof adapter.readJson !== 'function') {
    throw new Error('storage adapter must provide readJson(path)');
  }
  try {
    const value = await adapter.readJson(filePath);
    return {
      status: value == null ? 'missing' : 'ok',
      value: value == null ? null : cloneJson(value),
      error: null
    };
  } catch (error) {
    if (isMissingRead(error)) {
      return {
        status: 'missing',
        value: null,
        error
      };
    }
    return {
      status: 'unreadable',
      value: null,
      error
    };
  }
}

async function readRequiredPayload(adapter, filePath, label) {
  const result = await readJsonDiagnostic(adapter, filePath);
  if (result.status === 'ok') {
    return result.value;
  }
  if (result.status === 'missing') {
    throw createStorageReadError({
      code: 'DIRECTIVE_STORAGE_PAYLOAD_MISSING',
      message: `${label} payload missing at ${filePath}`,
      filePath,
      cause: result.error
    });
  }
  throw createStorageReadError({
    code: 'DIRECTIVE_STORAGE_PAYLOAD_UNREADABLE',
    message: `${label} payload unreadable at ${filePath}: ${result.error?.message || result.error}`,
    filePath,
    cause: result.error
  });
}

async function writeJson(adapter, filePath, value) {
  requireObject(adapter, 'storage adapter');
  if (typeof adapter.writeJson !== 'function') {
    throw new Error('storage adapter must provide writeJson(path, value)');
  }
  await adapter.writeJson(filePath, cloneJson(value));
}

async function deleteJsonIfSupported(adapter, filePath) {
  try {
    if (typeof adapter.deleteJsonFile === 'function') {
      await adapter.deleteJsonFile(filePath);
      return true;
    }
    if (typeof adapter.deleteJson === 'function') {
      await adapter.deleteJson(filePath);
      return true;
    }
  } catch (error) {
    if (isMissingRead(error)) {
      return false;
    }
    throw error;
  }
  return false;
}

function createStorageIndex(createdAt) {
  return {
    kind: 'directive.storageIndex',
    schemaVersion: 1,
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    indexes: {
      creatorDrafts: DIRECTIVE_STORAGE_PATHS.creatorDraftIndex,
      saves: DIRECTIVE_STORAGE_PATHS.saveIndex
    },
    files: {}
  };
}

function createCreatorDraftIndex(createdAt) {
  return {
    kind: 'directive.characterCreatorDraftIndex',
    schemaVersion: 1,
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    drafts: {}
  };
}

function createSaveIndex(createdAt) {
  return {
    kind: 'directive.saveIndex',
    schemaVersion: 1,
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    activeSaveId: null,
    saves: {}
  };
}

async function readOrCreateIndex(adapter, filePath, createIndex, options = {}) {
  const existing = await readJsonOrNull(adapter, filePath);
  if (existing) {
    return existing;
  }

  const created = createIndex(timestamp(options));
  await writeJson(adapter, filePath, created);
  return created;
}

async function readStorageIndex(adapter, options = {}) {
  return readOrCreateIndex(adapter, DIRECTIVE_STORAGE_PATHS.storageIndex, createStorageIndex, options);
}

async function readCreatorDraftIndex(adapter, options = {}) {
  return readOrCreateIndex(adapter, DIRECTIVE_STORAGE_PATHS.creatorDraftIndex, createCreatorDraftIndex, options);
}

async function readSaveIndex(adapter, options = {}) {
  return readOrCreateIndex(adapter, DIRECTIVE_STORAGE_PATHS.saveIndex, createSaveIndex, options);
}

function touchIndex(index, updatedAt) {
  return {
    ...cloneJson(index),
    revision: Number(index.revision || 0) + 1,
    updatedAt
  };
}

async function upsertStorageFileEntry(adapter, filePath, entry, options = {}) {
  const updatedAt = timestamp(options);
  const index = touchIndex(await readStorageIndex(adapter, options), updatedAt);
  index.files[filePath] = {
    path: filePath,
    ...cloneJson(entry),
    updatedAt
  };
  await writeJson(adapter, DIRECTIVE_STORAGE_PATHS.storageIndex, index);
  return index;
}

function creatorDraftListEntry(draftRecord, filePath) {
  return {
    id: draftRecord.id,
    path: filePath,
    status: draftRecord.status,
    revision: draftRecord.revision,
    packageId: draftRecord.package?.id,
    packageTitle: draftRecord.package?.title,
    campaignId: draftRecord.campaign?.id,
    campaignTitle: draftRecord.campaign?.title,
    shipId: draftRecord.ship?.id,
    shipName: draftRecord.ship?.name,
    roleLabel: draftRecord.lockedRole?.roleLabel || draftRecord.lockedRole?.billet || '',
    activeStep: draftRecord.activeStep,
    progress: cloneJson(draftRecord.progress),
    createdAt: draftRecord.createdAt,
    updatedAt: draftRecord.updatedAt,
    acceptedAt: draftRecord.acceptedAt || null
  };
}

function sortByUpdatedDesc(entries) {
  return [...entries].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

function diagnosticStatus(issues) {
  if (issues.some((issue) => issue.severity === 'error')) return 'error';
  if (issues.length > 0) return 'warning';
  return 'ok';
}

function uniqueEntriesById(entries) {
  const seen = new Set();
  const result = [];
  for (const entry of entries || []) {
    if (!entry?.id || seen.has(entry.id)) continue;
    seen.add(entry.id);
    result.push(entry);
  }
  return result;
}

async function markCampaignSaveActiveInIndex(adapter, saveIndex, saveId, options = {}) {
  const updatedAt = timestamp(options);
  const nextIndex = touchIndex(saveIndex, updatedAt);
  for (const save of Object.values(nextIndex.saves || {})) {
    save.current = save.id === saveId;
  }
  nextIndex.activeSaveId = saveId;
  await writeJson(adapter, DIRECTIVE_STORAGE_PATHS.saveIndex, nextIndex);
  return nextIndex;
}

export async function initializeDirectiveStorage(adapter, options = {}) {
  const storageIndex = await readStorageIndex(adapter, options);
  const creatorDraftIndex = await readCreatorDraftIndex(adapter, options);
  const saveIndex = await readSaveIndex(adapter, options);
  return {
    storageIndex,
    creatorDraftIndex,
    saveIndex
  };
}

export async function storeCharacterCreatorDraft(adapter, draftRecord, options = {}) {
  requireObject(draftRecord, 'draftRecord');
  if (draftRecord.kind !== 'directive.characterCreatorDraft') {
    throw new Error('draftRecord must be a directive.characterCreatorDraft record');
  }

  const filePath = characterCreatorDraftPath(draftRecord.id);
  await writeJson(adapter, filePath, draftRecord);

  const updatedAt = draftRecord.updatedAt || timestamp(options);
  const index = touchIndex(await readCreatorDraftIndex(adapter, { now: updatedAt }), updatedAt);
  index.drafts[draftRecord.id] = creatorDraftListEntry(draftRecord, filePath);
  await writeJson(adapter, DIRECTIVE_STORAGE_PATHS.creatorDraftIndex, index);

  await upsertStorageFileEntry(adapter, filePath, {
    kind: draftRecord.kind,
    ownerId: draftRecord.id,
    indexPath: DIRECTIVE_STORAGE_PATHS.creatorDraftIndex
  }, { now: updatedAt });

  return cloneJson(draftRecord);
}

export async function loadCharacterCreatorDraftFromStorage(adapter, draftId) {
  const id = requireNonEmptyString(draftId, 'draftId');
  const index = await readCreatorDraftIndex(adapter);
  const entry = index.drafts[id];
  if (!entry) {
    throw new Error(`Character Creator draft "${id}" is not indexed`);
  }
  const record = await readRequiredPayload(adapter, entry.path, 'Character Creator draft');
  return cloneJson(record);
}

export async function listCharacterCreatorDrafts(adapter) {
  const index = await readCreatorDraftIndex(adapter);
  return sortByUpdatedDesc(Object.values(index.drafts || {}).map(cloneJson));
}

export async function storeCampaignSave(adapter, saveRecord, options = {}) {
  requireObject(saveRecord, 'saveRecord');
  if (saveRecord.kind !== 'directive.campaignSave') {
    throw new Error('saveRecord must be a directive.campaignSave record');
  }

  const filePath = campaignSavePath(saveRecord.id);
  await writeJson(adapter, filePath, saveRecord);

  const updatedAt = saveRecord.updatedAt || timestamp(options);
  const index = touchIndex(await readSaveIndex(adapter, { now: updatedAt }), updatedAt);
  const entry = {
    ...createSaveListEntry(saveRecord),
    path: filePath,
    current: saveRecord.current === true
  };

  if (entry.current) {
    for (const save of Object.values(index.saves || {})) {
      save.current = false;
    }
    index.activeSaveId = saveRecord.id;
  }

  index.saves[saveRecord.id] = entry;
  await writeJson(adapter, DIRECTIVE_STORAGE_PATHS.saveIndex, index);

  await upsertStorageFileEntry(adapter, filePath, {
    kind: saveRecord.kind,
    ownerId: saveRecord.id,
    campaignId: saveRecord.metadata?.campaignId,
    indexPath: DIRECTIVE_STORAGE_PATHS.saveIndex
  }, { now: updatedAt });

  return cloneJson(saveRecord);
}

export async function pruneCampaignAutosaves(adapter, {
  campaignId,
  keep = 3,
  now = null
} = {}) {
  const id = requireNonEmptyString(campaignId, 'campaignId');
  const limit = Math.max(0, Number.isInteger(keep) ? keep : 3);
  const updatedAt = now || isoNow();
  const saveIndex = await readSaveIndex(adapter, { now: updatedAt });
  const autosaves = Object.values(saveIndex.saves || {})
    .filter((entry) => entry.slotType === 'autosave' && entry.metadata?.campaignId === id)
    .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));
  const removed = autosaves.slice(limit);
  if (removed.length === 0) {
    return {
      removed: [],
      kept: autosaves.slice(0, limit).map((entry) => entry.id)
    };
  }

  const nextSaveIndex = touchIndex(saveIndex, updatedAt);
  const storageIndex = touchIndex(await readStorageIndex(adapter, { now: updatedAt }), updatedAt);
  const removedRecords = [];
  for (const entry of removed) {
    delete nextSaveIndex.saves[entry.id];
    if (nextSaveIndex.activeSaveId === entry.id) {
      nextSaveIndex.activeSaveId = null;
    }
    if (entry.path) {
      delete storageIndex.files[entry.path];
      await deleteJsonIfSupported(adapter, entry.path);
    }
    removedRecords.push({
      id: entry.id,
      path: entry.path || null
    });
  }

  await writeJson(adapter, DIRECTIVE_STORAGE_PATHS.saveIndex, nextSaveIndex);
  await writeJson(adapter, DIRECTIVE_STORAGE_PATHS.storageIndex, storageIndex);
  return {
    removed: removedRecords,
    kept: autosaves.slice(0, limit).map((entry) => entry.id)
  };
}

export async function loadCampaignSaveFromStorage(adapter, saveId, options = {}) {
  const id = requireNonEmptyString(saveId, 'saveId');
  const index = await readSaveIndex(adapter);
  const entry = index.saves[id];
  if (!entry) {
    throw new Error(`Campaign save "${id}" is not indexed`);
  }

  const record = await readRequiredPayload(adapter, entry.path, 'Campaign save');

  if (options.markActive !== false) {
    await markCampaignSaveActiveInIndex(adapter, index, id, options);
  }

  return cloneJson(record.payload?.campaignState);
}

export async function loadCampaignSaveRecordFromStorage(adapter, saveId) {
  const id = requireNonEmptyString(saveId, 'saveId');
  const index = await readSaveIndex(adapter);
  const entry = index.saves[id];
  if (!entry) {
    throw new Error(`Campaign save "${id}" is not indexed`);
  }

  const record = await readRequiredPayload(adapter, entry.path, 'Campaign save');
  return cloneJson(record);
}

export async function listCampaignSaves(adapter) {
  const index = await readSaveIndex(adapter);
  return sortByUpdatedDesc(Object.values(index.saves || {}).map(cloneJson));
}

export async function getDirectiveStorageIndexes(adapter) {
  return {
    storageIndex: await readStorageIndex(adapter),
    creatorDraftIndex: await readCreatorDraftIndex(adapter),
    saveIndex: await readSaveIndex(adapter)
  };
}

export async function diagnoseDirectiveStorage(adapter, options = {}) {
  const checkedAt = timestamp(options);
  const issues = [];
  let indexes;
  try {
    indexes = await initializeDirectiveStorage(adapter, options);
  } catch (error) {
    issues.push(createStorageIssue({
      severity: 'error',
      code: 'index-unreadable',
      message: `Storage indexes could not be initialized: ${error?.message || error}`
    }));
    return {
      kind: 'directive.storageDiagnostics',
      schemaVersion: 1,
      checkedAt,
      status: diagnosticStatus(issues),
      ok: false,
      issues,
      counts: {
        creatorDrafts: 0,
        saves: 0,
        files: 0
      }
    };
  }

  const { storageIndex, creatorDraftIndex, saveIndex } = indexes;
  const draftEntries = Object.values(creatorDraftIndex.drafts || {});
  const saveEntries = Object.values(saveIndex.saves || {});
  const payloadEntries = [
    ...draftEntries.map((entry) => ({ ...entry, kind: 'directive.characterCreatorDraft' })),
    ...saveEntries.map((entry) => ({ ...entry, kind: 'directive.campaignSave' }))
  ];
  const payloadPaths = [...new Set(payloadEntries.map((entry) => entry.path).filter(Boolean))];

  if (typeof adapter.verifyJsonFiles === 'function' && payloadPaths.length > 0) {
    try {
      const verified = await adapter.verifyJsonFiles(payloadPaths);
      for (const entry of payloadEntries) {
        if (entry.path && verified[entry.path] === false) {
          issues.push(createStorageIssue({
            severity: 'warning',
            code: 'payload-missing',
            message: `Indexed ${entry.kind} payload is missing at ${entry.path}`,
            path: entry.path,
            ownerId: entry.id,
            kind: entry.kind
          }));
        }
      }
    } catch (error) {
      issues.push(createStorageIssue({
        severity: 'warning',
        code: 'verify-failed',
        message: `Storage verification failed: ${error?.message || error}`
      }));
    }
  }

  for (const entry of payloadEntries) {
    if (!entry.path) {
      issues.push(createStorageIssue({
        severity: 'error',
        code: 'payload-path-missing',
        message: `Indexed ${entry.kind} "${entry.id}" has no payload path.`,
        ownerId: entry.id,
        kind: entry.kind
      }));
      continue;
    }

    const result = await readJsonDiagnostic(adapter, entry.path);
    if (result.status === 'missing') {
      issues.push(createStorageIssue({
        severity: 'warning',
        code: 'payload-missing',
        message: `Indexed ${entry.kind} payload is missing at ${entry.path}`,
        path: entry.path,
        ownerId: entry.id,
        kind: entry.kind
      }));
      continue;
    }
    if (result.status === 'unreadable') {
      issues.push(createStorageIssue({
        severity: 'error',
        code: 'payload-unreadable',
        message: `Indexed ${entry.kind} payload is unreadable at ${entry.path}: ${result.error?.message || result.error}`,
        path: entry.path,
        ownerId: entry.id,
        kind: entry.kind
      }));
      continue;
    }
    if (result.value?.kind !== entry.kind) {
      issues.push(createStorageIssue({
        severity: 'error',
        code: 'payload-kind-mismatch',
        message: `Indexed payload at ${entry.path} has kind "${result.value?.kind || 'unknown'}" instead of "${entry.kind}".`,
        path: entry.path,
        ownerId: entry.id,
        kind: entry.kind
      }));
    }
  }

  if (saveIndex.activeSaveId && !saveIndex.saves?.[saveIndex.activeSaveId]) {
    issues.push(createStorageIssue({
      severity: 'warning',
      code: 'active-save-not-indexed',
      message: `Active save "${saveIndex.activeSaveId}" is not present in the save index.`,
      ownerId: saveIndex.activeSaveId,
      kind: 'directive.campaignSave'
    }));
  }

  const currentEntries = saveEntries.filter((entry) => entry.current === true);
  if (currentEntries.length > 1) {
    issues.push(createStorageIssue({
      severity: 'warning',
      code: 'multiple-current-saves',
      message: 'Multiple campaign saves are marked current in the save index.',
      kind: 'directive.campaignSave'
    }));
  }

  return {
    kind: 'directive.storageDiagnostics',
    schemaVersion: 1,
    checkedAt,
    status: diagnosticStatus(issues),
    ok: issues.every((issue) => issue.severity !== 'error'),
    issues,
    counts: {
      creatorDrafts: draftEntries.length,
      saves: saveEntries.length,
      files: Object.keys(storageIndex.files || {}).length,
      payloadsChecked: payloadPaths.length
    },
    activeSaveId: saveIndex.activeSaveId || null
  };
}

export async function recoverActiveCampaignSave(adapter, options = {}) {
  const checkedAt = timestamp(options);
  const issues = [];
  let index;
  try {
    index = await readSaveIndex(adapter, options);
  } catch (error) {
    issues.push(createStorageIssue({
      severity: 'error',
      code: 'save-index-unreadable',
      message: `Save index could not be read: ${error?.message || error}`,
      kind: 'directive.saveIndex'
    }));
    return {
      kind: 'directive.activeSaveRecovery',
      checkedAt,
      recovered: false,
      activeSaveId: null,
      saveRecord: null,
      campaignState: null,
      diagnostics: {
        status: diagnosticStatus(issues),
        ok: false,
        issues
      }
    };
  }

  const saves = Object.values(index.saves || {});
  const activeEntry = index.activeSaveId ? index.saves?.[index.activeSaveId] : null;
  const currentEntries = saves.filter((entry) => entry.current === true);
  const fallbackEntries = sortByUpdatedDesc(saves);
  const candidates = uniqueEntriesById([
    activeEntry,
    ...currentEntries,
    ...fallbackEntries
  ].filter(Boolean));

  for (const entry of candidates) {
    const result = await readJsonDiagnostic(adapter, entry.path);
    if (result.status === 'ok' && result.value?.kind === 'directive.campaignSave' && isObject(result.value?.payload?.campaignState)) {
      const needsIndexRepair = index.activeSaveId !== entry.id || entry.current !== true || currentEntries.length > 1;
      if (needsIndexRepair) {
        await markCampaignSaveActiveInIndex(adapter, index, entry.id, options);
      }
      return {
        kind: 'directive.activeSaveRecovery',
        checkedAt,
        recovered: needsIndexRepair || issues.length > 0,
        activeSaveId: entry.id,
        saveRecord: cloneJson(result.value),
        campaignState: cloneJson(result.value.payload.campaignState),
        diagnostics: {
          status: diagnosticStatus(issues),
          ok: issues.every((issue) => issue.severity !== 'error'),
          issues
        }
      };
    }

    const code = result.status === 'missing'
      ? 'active-save-payload-missing'
      : result.status === 'unreadable'
        ? 'active-save-payload-unreadable'
        : 'active-save-payload-invalid';
    issues.push(createStorageIssue({
      severity: result.status === 'missing' ? 'warning' : 'error',
      code,
      message: `Campaign save "${entry.id}" could not be recovered from ${entry.path}.`,
      path: entry.path,
      ownerId: entry.id,
      kind: 'directive.campaignSave'
    }));
  }

  return {
    kind: 'directive.activeSaveRecovery',
    checkedAt,
    recovered: false,
    activeSaveId: null,
    saveRecord: null,
    campaignState: null,
    diagnostics: {
      status: diagnosticStatus(issues),
      ok: issues.every((issue) => issue.severity !== 'error'),
      issues
    }
  };
}
