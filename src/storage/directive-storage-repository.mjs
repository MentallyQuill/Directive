import { createSaveListEntry } from './save-records.mjs';
import {
  campaignSaveLogicalKey,
  characterCreatorDraftLogicalKey,
  campaignPackageImportLogicalKey,
  DIRECTIVE_LOGICAL_STORAGE_KEYS
} from './logical-storage-paths.mjs';
import {
  assertDirectiveUserFilesPath,
  DIRECTIVE_STORAGE_IMAGE_EXTENSIONS
} from './directive-storage-filenames.mjs';

export const DIRECTIVE_STORAGE_PATHS = {
  storageIndex: DIRECTIVE_LOGICAL_STORAGE_KEYS.storageIndex,
  creatorDraftIndex: DIRECTIVE_LOGICAL_STORAGE_KEYS.creatorDraftIndex,
  campaignPackageImportIndex: DIRECTIVE_LOGICAL_STORAGE_KEYS.campaignPackageImportIndex,
  saveIndex: DIRECTIVE_LOGICAL_STORAGE_KEYS.saveIndex
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

export function characterCreatorDraftPath(draftId) {
  return characterCreatorDraftLogicalKey(requireNonEmptyString(draftId, 'draftId'));
}

export function campaignPackageImportPath(importId) {
  return campaignPackageImportLogicalKey(requireNonEmptyString(importId, 'importId'));
}

export function campaignSavePath(saveId) {
  return campaignSaveLogicalKey(requireNonEmptyString(saveId, 'saveId'));
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

async function deleteFileIfSupported(adapter, filePath, options = {}) {
  try {
    if (typeof adapter.deleteFile === 'function') {
      await adapter.deleteFile(filePath, options);
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
      campaignPackageImports: DIRECTIVE_STORAGE_PATHS.campaignPackageImportIndex,
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

function createCampaignPackageImportIndex(createdAt) {
  return {
    kind: 'directive.campaignPackageImportIndex',
    schemaVersion: 1,
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    imports: {}
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
  const index = await readOrCreateIndex(adapter, DIRECTIVE_STORAGE_PATHS.storageIndex, createStorageIndex, options);
  if (!index.indexes) index.indexes = {};
  if (!index.indexes.creatorDrafts) index.indexes.creatorDrafts = DIRECTIVE_STORAGE_PATHS.creatorDraftIndex;
  if (!index.indexes.campaignPackageImports) index.indexes.campaignPackageImports = DIRECTIVE_STORAGE_PATHS.campaignPackageImportIndex;
  if (!index.indexes.saves) index.indexes.saves = DIRECTIVE_STORAGE_PATHS.saveIndex;
  return index;
}

async function readCreatorDraftIndex(adapter, options = {}) {
  return readOrCreateIndex(adapter, DIRECTIVE_STORAGE_PATHS.creatorDraftIndex, createCreatorDraftIndex, options);
}

async function readCampaignPackageImportIndex(adapter, options = {}) {
  return readOrCreateIndex(adapter, DIRECTIVE_STORAGE_PATHS.campaignPackageImportIndex, createCampaignPackageImportIndex, options);
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

function campaignPackageImportListEntry(importRecord, filePath) {
  return {
    id: importRecord.id,
    path: filePath,
    packageId: importRecord.packageId,
    packageVersion: importRecord.packageVersion,
    packageTitle: importRecord.packageData?.manifest?.title || importRecord.packageId,
    shipName: importRecord.packageData?.ship?.name || null,
    campaignTitle: importRecord.packageData?.mainCampaign?.title || null,
    sourceFileName: importRecord.sourceFileName || null,
    importedAt: importRecord.importedAt,
    updatedAt: importRecord.updatedAt || importRecord.importedAt,
    diagnostics: cloneJson(importRecord.diagnostics || null)
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
  const campaignPackageImportIndex = await readCampaignPackageImportIndex(adapter, options);
  const saveIndex = await readSaveIndex(adapter, options);
  return {
    storageIndex,
    creatorDraftIndex,
    campaignPackageImportIndex,
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

export async function storePlayerPortraitAsset(adapter, portraitUpload, options = {}) {
  requireObject(portraitUpload, 'portraitUpload');
  requireObject(portraitUpload.descriptor, 'portraitUpload.descriptor');
  if (typeof adapter.writeBase64File !== 'function') {
    const error = new Error('This Directive host does not support player portrait uploads.');
    error.code = 'DIRECTIVE_PLAYER_PORTRAIT_UNSUPPORTED';
    throw error;
  }
  const ownerKind = requireNonEmptyString(options.ownerKind || portraitUpload.descriptor.owner?.kind, 'ownerKind');
  const ownerId = requireNonEmptyString(options.ownerId || portraitUpload.descriptor.owner?.id, 'ownerId');
  const uploaded = await adapter.writeBase64File(portraitUpload.fileName, portraitUpload.base64Data, {
    allowedExtensions: DIRECTIVE_STORAGE_IMAGE_EXTENSIONS
  });
  const path = assertDirectiveUserFilesPath(uploaded.path, {
    allowedExtensions: DIRECTIVE_STORAGE_IMAGE_EXTENSIONS
  });
  const updatedAt = timestamp(options);
  const descriptor = {
    ...cloneJson(portraitUpload.descriptor),
    owner: {
      kind: ownerKind,
      id: ownerId
    },
    asset: {
      ...cloneJson(portraitUpload.descriptor.asset),
      path,
      fileName: uploaded.fileName || portraitUpload.fileName,
      updatedAt
    }
  };
  await upsertStorageFileEntry(adapter, path, {
    kind: 'directive.playerPortraitAsset',
    ownerKind,
    ownerId,
    mimeType: descriptor.asset.mimeType,
    indexPath: DIRECTIVE_STORAGE_PATHS.storageIndex
  }, { now: updatedAt });
  return descriptor;
}

export async function deletePlayerPortraitAsset(adapter, portrait, options = {}) {
  const path = portrait?.asset?.path || portrait?.path || '';
  if (!path) {
    return {
      kind: 'directive.playerPortraitDeleteResult',
      path: null,
      deleted: false,
      indexed: false
    };
  }
  const safePath = assertDirectiveUserFilesPath(path, {
    allowedExtensions: DIRECTIVE_STORAGE_IMAGE_EXTENSIONS
  });
  const updatedAt = timestamp(options);
  const storageIndex = touchIndex(await readStorageIndex(adapter, { now: updatedAt }), updatedAt);
  const indexed = Boolean(storageIndex.files?.[safePath]);
  delete storageIndex.files[safePath];
  const deleted = await deleteFileIfSupported(adapter, safePath, {
    allowedExtensions: DIRECTIVE_STORAGE_IMAGE_EXTENSIONS
  });
  await writeJson(adapter, DIRECTIVE_STORAGE_PATHS.storageIndex, storageIndex);
  return {
    kind: 'directive.playerPortraitDeleteResult',
    path: safePath,
    deleted,
    indexed
  };
}

export async function deleteCharacterCreatorDraftFromStorage(adapter, draftId, options = {}) {
  const id = requireNonEmptyString(draftId, 'draftId');
  const updatedAt = timestamp(options);
  const draftIndex = touchIndex(await readCreatorDraftIndex(adapter, { now: updatedAt }), updatedAt);
  const entry = draftIndex.drafts[id] || null;
  if (!entry) {
    return {
      kind: 'directive.characterCreatorDraftDeleteResult',
      draftId: id,
      path: null,
      deleted: false,
      indexed: false
    };
  }

  delete draftIndex.drafts[id];
  const storageIndex = touchIndex(await readStorageIndex(adapter, { now: updatedAt }), updatedAt);
  if (entry.path) delete storageIndex.files[entry.path];
  const deleted = entry.path ? await deleteJsonIfSupported(adapter, entry.path) : false;
  const removedAssets = [];
  for (const [filePath, fileEntry] of Object.entries(storageIndex.files || {})) {
    if (fileEntry?.kind !== 'directive.playerPortraitAsset' || fileEntry.ownerId !== id || fileEntry.ownerKind !== 'creatorDraft') {
      continue;
    }
    delete storageIndex.files[filePath];
    removedAssets.push({
      path: filePath,
      deleted: await deleteFileIfSupported(adapter, filePath, {
        allowedExtensions: DIRECTIVE_STORAGE_IMAGE_EXTENSIONS
      })
    });
  }

  await writeJson(adapter, DIRECTIVE_STORAGE_PATHS.creatorDraftIndex, draftIndex);
  await writeJson(adapter, DIRECTIVE_STORAGE_PATHS.storageIndex, storageIndex);

  return {
    kind: 'directive.characterCreatorDraftDeleteResult',
    draftId: id,
    path: entry.path || null,
    deleted,
    removedAssets,
    indexed: true
  };
}

export async function listCharacterCreatorDrafts(adapter) {
  const index = await readCreatorDraftIndex(adapter);
  return sortByUpdatedDesc(Object.values(index.drafts || {}).map(cloneJson));
}

export async function storeImportedCampaignPackageRecord(adapter, importRecord, options = {}) {
  requireObject(importRecord, 'importRecord');
  if (importRecord.kind !== 'directive.importedCampaignPackageRecord') {
    throw new Error('importRecord must be a directive.importedCampaignPackageRecord record');
  }

  const id = requireNonEmptyString(importRecord.id, 'importRecord.id');
  const filePath = campaignPackageImportPath(id);
  const updatedAt = importRecord.updatedAt || importRecord.importedAt || timestamp(options);
  const record = {
    ...cloneJson(importRecord),
    updatedAt
  };
  await writeJson(adapter, filePath, record);

  const index = touchIndex(await readCampaignPackageImportIndex(adapter, { now: updatedAt }), updatedAt);
  index.imports[id] = campaignPackageImportListEntry(record, filePath);
  await writeJson(adapter, DIRECTIVE_STORAGE_PATHS.campaignPackageImportIndex, index);

  await upsertStorageFileEntry(adapter, filePath, {
    kind: record.kind,
    ownerId: id,
    packageId: record.packageId,
    indexPath: DIRECTIVE_STORAGE_PATHS.campaignPackageImportIndex
  }, { now: updatedAt });

  return cloneJson(record);
}

export async function loadImportedCampaignPackageRecord(adapter, importId) {
  const id = requireNonEmptyString(importId, 'importId');
  const index = await readCampaignPackageImportIndex(adapter);
  const entry = index.imports[id];
  if (!entry) {
    throw new Error(`Campaign package import "${id}" is not indexed`);
  }
  const record = await readRequiredPayload(adapter, entry.path, 'Campaign package import');
  return cloneJson(record);
}

export async function listImportedCampaignPackageRecords(adapter) {
  const index = await readCampaignPackageImportIndex(adapter);
  const entries = sortByUpdatedDesc(Object.values(index.imports || {}).map(cloneJson));
  const records = [];
  for (const entry of entries) {
    try {
      const record = await readRequiredPayload(adapter, entry.path, 'Campaign package import');
      records.push(cloneJson(record));
    } catch (error) {
      records.push({
        kind: 'directive.importedCampaignPackageRecord',
        id: entry.id,
        packageId: entry.packageId,
        packageVersion: entry.packageVersion,
        sourceFileName: entry.sourceFileName,
        importedAt: entry.importedAt,
        updatedAt: entry.updatedAt,
        packageData: null,
        jsonPayloads: {},
        assetPaths: [],
        diagnostics: {
          kind: 'directive.campaignPackageImportDiagnostics',
          sourceFileName: entry.sourceFileName || null,
          status: 'error',
          issues: [{
            severity: 'error',
            code: 'import-payload-unreadable',
            message: error?.message || String(error)
          }]
        }
      });
    }
  }
  return records;
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
    .map((entry, insertionOrder) => ({ entry, insertionOrder }))
    .filter(({ entry }) => entry.slotType === 'autosave' && entry.metadata?.campaignId === id)
    .sort((left, right) => {
      const timestampOrder = String(right.entry.updatedAt || '').localeCompare(String(left.entry.updatedAt || ''));
      if (timestampOrder !== 0) return timestampOrder;
      // Host clocks can have coarse precision and tests may use a fixed timestamp. In that
      // case the most recently inserted autosave is still the newest record.
      return right.insertionOrder - left.insertionOrder;
    })
    .map(({ entry }) => entry);
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

function payloadEntriesFromIndexes({ creatorDraftIndex, campaignPackageImportIndex, saveIndex }) {
  const draftEntries = Object.values(creatorDraftIndex.drafts || {});
  const importEntries = Object.values(campaignPackageImportIndex.imports || {});
  const saveEntries = Object.values(saveIndex.saves || {});
  return [
    ...draftEntries.map((entry) => ({ ...entry, kind: 'directive.characterCreatorDraft', indexKind: 'creatorDraftIndex' })),
    ...importEntries.map((entry) => ({ ...entry, kind: 'directive.importedCampaignPackageRecord', indexKind: 'campaignPackageImportIndex' })),
    ...saveEntries.map((entry) => ({ ...entry, kind: 'directive.campaignSave', indexKind: 'saveIndex' }))
  ];
}

export async function getDirectiveStorageIndexes(adapter) {
  return {
    storageIndex: await readStorageIndex(adapter),
    creatorDraftIndex: await readCreatorDraftIndex(adapter),
    campaignPackageImportIndex: await readCampaignPackageImportIndex(adapter),
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
        campaignPackageImports: 0,
        saves: 0,
        files: 0
      }
    };
  }

  const { storageIndex, creatorDraftIndex, campaignPackageImportIndex, saveIndex } = indexes;
  const draftEntries = Object.values(creatorDraftIndex.drafts || {});
  const importEntries = Object.values(campaignPackageImportIndex.imports || {});
  const saveEntries = Object.values(saveIndex.saves || {});
  const payloadEntries = payloadEntriesFromIndexes(indexes);
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
      campaignPackageImports: importEntries.length,
      saves: saveEntries.length,
      files: Object.keys(storageIndex.files || {}).length,
      payloadsChecked: payloadPaths.length
    },
    activeSaveId: saveIndex.activeSaveId || null
  };
}

function removePayloadEntryFromIndexes({ indexes, entry, removed }) {
  const { storageIndex, creatorDraftIndex, campaignPackageImportIndex, saveIndex } = indexes;
  if (entry.indexKind === 'creatorDraftIndex') {
    delete creatorDraftIndex.drafts[entry.id];
  } else if (entry.indexKind === 'campaignPackageImportIndex') {
    delete campaignPackageImportIndex.imports[entry.id];
  } else if (entry.indexKind === 'saveIndex') {
    delete saveIndex.saves[entry.id];
    if (saveIndex.activeSaveId === entry.id) saveIndex.activeSaveId = null;
  }
  if (entry.path) delete storageIndex.files[entry.path];
  removed.push({
    id: entry.id,
    path: entry.path || null,
    kind: entry.kind
  });
}

export async function cleanMissingStorageIndexRecords(adapter, options = {}) {
  const checkedAt = timestamp(options);
  const indexes = await initializeDirectiveStorage(adapter, { now: checkedAt });
  const { storageIndex, creatorDraftIndex, campaignPackageImportIndex, saveIndex } = indexes;
  const removed = [];
  const retainedIssues = [];

  for (const entry of payloadEntriesFromIndexes(indexes)) {
    if (!entry.path) {
      removePayloadEntryFromIndexes({ indexes, entry, removed });
      continue;
    }
    const result = await readJsonDiagnostic(adapter, entry.path);
    if (result.status === 'missing') {
      removePayloadEntryFromIndexes({ indexes, entry, removed });
    } else if (result.status === 'unreadable') {
      retainedIssues.push(createStorageIssue({
        severity: 'error',
        code: 'payload-unreadable',
        message: `Indexed ${entry.kind} payload is unreadable at ${entry.path}: ${result.error?.message || result.error}`,
        path: entry.path,
        ownerId: entry.id,
        kind: entry.kind
      }));
    }
  }

  for (const [filePath, fileEntry] of Object.entries(storageIndex.files || {})) {
    if (!filePath) continue;
    const stillIndexed = payloadEntriesFromIndexes(indexes).some((entry) => entry.path === filePath);
    if (stillIndexed) continue;
    const result = await readJsonDiagnostic(adapter, filePath);
    if (result.status === 'missing') {
      delete storageIndex.files[filePath];
      removed.push({
        id: fileEntry?.ownerId || filePath,
        path: filePath,
        kind: fileEntry?.kind || 'directive.storageFile'
      });
    } else if (result.status === 'unreadable') {
      retainedIssues.push(createStorageIssue({
        severity: 'error',
        code: 'storage-file-unreadable',
        message: `Tracked storage file is unreadable at ${filePath}: ${result.error?.message || result.error}`,
        path: filePath,
        ownerId: fileEntry?.ownerId || null,
        kind: fileEntry?.kind || null
      }));
    }
  }

  if (removed.length > 0) {
    const updatedAt = checkedAt;
    await writeJson(adapter, DIRECTIVE_STORAGE_PATHS.storageIndex, touchIndex(storageIndex, updatedAt));
    await writeJson(adapter, DIRECTIVE_STORAGE_PATHS.creatorDraftIndex, touchIndex(creatorDraftIndex, updatedAt));
    await writeJson(adapter, DIRECTIVE_STORAGE_PATHS.campaignPackageImportIndex, touchIndex(campaignPackageImportIndex, updatedAt));
    await writeJson(adapter, DIRECTIVE_STORAGE_PATHS.saveIndex, touchIndex(saveIndex, updatedAt));
  }

  return {
    kind: 'directive.storageCleanupResult',
    checkedAt,
    status: removed.length > 0 ? 'cleaned' : 'unchanged',
    removed,
    retainedIssues,
    ok: retainedIssues.every((issue) => issue.severity !== 'error')
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
