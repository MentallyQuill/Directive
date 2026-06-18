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

async function writeJson(adapter, filePath, value) {
  requireObject(adapter, 'storage adapter');
  if (typeof adapter.writeJson !== 'function') {
    throw new Error('storage adapter must provide writeJson(path, value)');
  }
  await adapter.writeJson(filePath, cloneJson(value));
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
  const record = await readJsonOrNull(adapter, entry.path);
  if (!record) {
    throw new Error(`Character Creator draft payload missing at ${entry.path}`);
  }
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

export async function loadCampaignSaveFromStorage(adapter, saveId, options = {}) {
  const id = requireNonEmptyString(saveId, 'saveId');
  const index = await readSaveIndex(adapter);
  const entry = index.saves[id];
  if (!entry) {
    throw new Error(`Campaign save "${id}" is not indexed`);
  }

  const record = await readJsonOrNull(adapter, entry.path);
  if (!record) {
    throw new Error(`Campaign save payload missing at ${entry.path}`);
  }

  if (options.markActive !== false) {
    const updatedAt = timestamp(options);
    const nextIndex = touchIndex(index, updatedAt);
    for (const save of Object.values(nextIndex.saves || {})) {
      save.current = save.id === id;
    }
    nextIndex.activeSaveId = id;
    await writeJson(adapter, DIRECTIVE_STORAGE_PATHS.saveIndex, nextIndex);
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

  const record = await readJsonOrNull(adapter, entry.path);
  if (!record) {
    throw new Error(`Campaign save payload missing at ${entry.path}`);
  }
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
