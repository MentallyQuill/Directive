import { assertV1CampaignState } from '../runtime/v1-campaign-state.mjs';

export const V1_STORAGE_INDEX_KIND = 'directive.storageIndex.v1';
export const V1_CAMPAIGN_SAVE_KIND = 'directive.campaignSave.v1';
export const V1_CREATOR_DRAFT_KIND = 'directive.characterCreatorDraft.v1';

export const V1_STORAGE_PATHS = Object.freeze({
  index: 'v1/index.v1.json',
  draft: (draftId) => `v1/drafts/${safeId(draftId, 'draftId')}.v1.json`,
  save: (saveId) => `v1/saves/${safeId(saveId, 'saveId')}.v1.json`,
  timelineOperation: (campaignId) => `v1/operations/${safeId(campaignId, 'campaignId')}.timeline.v1.json`
});

const SAFE_ID = /^[a-zA-Z0-9_.-]+$/;

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function object(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeId(value, label) {
  const id = String(value ?? '').trim();
  if (!id || !SAFE_ID.test(id)) throw new Error(`${label} must be a safe non-empty id`);
  return id;
}

function time(value, label = 'timestamp') {
  const timestamp = String(value ?? '').trim();
  if (!timestamp || Number.isNaN(Date.parse(timestamp))) {
    throw new Error(`${label} must be an ISO timestamp`);
  }
  return timestamp;
}

function missing(error) {
  return error?.code === 'ENOENT'
    || error?.name === 'NotFoundError'
    || /not found|missing/i.test(String(error?.message || ''));
}

function requireAdapter(adapter) {
  if (!object(adapter) || typeof adapter.readJson !== 'function' || typeof adapter.writeJson !== 'function') {
    throw new Error('V1 storage requires an adapter with readJson and writeJson');
  }
  return adapter;
}

async function readOrNull(adapter, key) {
  try {
    const value = await adapter.readJson(key);
    return value == null ? null : clone(value);
  } catch (error) {
    if (missing(error)) return null;
    throw error;
  }
}

async function remove(adapter, key) {
  const deleter = adapter.deleteJsonFile || adapter.deleteJson;
  if (typeof deleter !== 'function') throw new Error('V1 storage adapter does not support deletion');
  try {
    await deleter.call(adapter, key);
    return true;
  } catch (error) {
    if (missing(error)) return false;
    throw error;
  }
}

function emptyIndex(now) {
  return {
    kind: V1_STORAGE_INDEX_KIND,
    version: 1,
    activeSaveId: null,
    drafts: {},
    saves: {},
    updatedAt: time(now)
  };
}

export function assertV1StorageIndex(index) {
  if (!object(index)
    || index.kind !== V1_STORAGE_INDEX_KIND
    || index.version !== 1
    || !object(index.drafts)
    || !object(index.saves)) {
    const error = new Error('Directive V1 rejects storage without an exact V1 index.');
    error.code = 'DIRECTIVE_V1_STORAGE_INDEX_REJECTED';
    throw error;
  }
  return index;
}

function assertDraft(draft) {
  if (!object(draft) || draft.kind !== V1_CREATOR_DRAFT_KIND || draft.schemaVersion !== 1) {
    const error = new Error('Directive V1 rejects a non-V1 Character Creator draft.');
    error.code = 'DIRECTIVE_V1_DRAFT_REJECTED';
    throw error;
  }
  safeId(draft.id, 'draft.id');
  return draft;
}

export function assertV1CampaignSave(save) {
  if (!object(save) || save.kind !== V1_CAMPAIGN_SAVE_KIND || save.version !== 1) {
    const error = new Error('Directive V1 rejects a non-V1 campaign save.');
    error.code = 'DIRECTIVE_V1_SAVE_REJECTED';
    throw error;
  }
  safeId(save.id, 'save.id');
  if (!['active', 'checkpoint'].includes(save.slotType)) {
    throw new Error('V1 campaign save slotType must be active or checkpoint');
  }
  const activeSlot = save.slotType === 'active';
  const validSlotRelation = activeSlot
    ? save.parentSaveId === null
    : typeof save.parentSaveId === 'string' && Boolean(save.parentSaveId.trim()) && SAFE_ID.test(save.parentSaveId);
  if (!validSlotRelation) {
    const error = new Error('Directive V1 save slot and parent relationship is invalid.');
    error.code = 'DIRECTIVE_V1_SAVE_SLOT_RELATION_INVALID';
    throw error;
  }
  assertV1CampaignState(save.state);
  const expectedBranchId = activeSlot ? save.id : save.parentSaveId;
  if (save.state.mission?.v1?.branchId !== expectedBranchId) {
    const error = new Error('Directive V1 save slot does not match its authoritative state branch.');
    error.code = 'DIRECTIVE_V1_SAVE_BRANCH_MISMATCH';
    throw error;
  }
  if (save.campaignId !== save.state.campaign.id
    || save.packageId !== save.state.activeCampaignPackage.packageId
    || save.packageVersion !== save.state.activeCampaignPackage.packageVersion) {
    const error = new Error('V1 campaign save metadata does not match its state.');
    error.code = 'DIRECTIVE_V1_SAVE_BINDING_MISMATCH';
    throw error;
  }
  return save;
}

function draftSummary(draft) {
  return {
    id: draft.id,
    kind: draft.kind,
    packageId: draft.package?.id || null,
    packageTitle: draft.package?.title || null,
    campaignId: draft.campaign?.id || null,
    campaignTitle: draft.campaign?.title || null,
    status: draft.status,
    revision: draft.revision,
    activeStep: draft.activeStep,
    progress: clone(draft.progress || {}),
    updatedAt: draft.updatedAt,
    acceptedAt: draft.acceptedAt || null
  };
}

function saveSummary(save) {
  return {
    id: save.id,
    kind: save.kind,
    name: save.name,
    slotType: save.slotType,
    campaignId: save.campaignId,
    packageId: save.packageId,
    packageVersion: save.packageVersion,
    parentSaveId: save.parentSaveId || null,
    createdAt: save.createdAt,
    updatedAt: save.updatedAt,
    playerName: save.state.player?.name || null,
    playerRole: save.state.player?.role || save.state.player?.billet || null,
    campaignTitle: save.state.campaign?.title || null,
    shipName: save.state.ship?.name || null,
    chapter: save.state.mission?.activeMissionId || null,
    stardate: save.state.campaign?.currentStardate || null,
    chatId: save.state.campaignChatBinding?.chatId || null
  };
}

async function loadIndex(adapter, { create = false, now = null } = {}) {
  requireAdapter(adapter);
  const found = await readOrNull(adapter, V1_STORAGE_PATHS.index);
  if (found) return assertV1StorageIndex(found);
  if (!create) return null;
  const index = emptyIndex(now || new Date().toISOString());
  await adapter.writeJson(V1_STORAGE_PATHS.index, index);
  return clone(index);
}

async function writeIndex(adapter, index, now) {
  const next = clone(assertV1StorageIndex(index));
  next.updatedAt = time(now);
  await adapter.writeJson(V1_STORAGE_PATHS.index, next);
  return next;
}

export async function initializeV1Storage(adapter, { now = new Date().toISOString() } = {}) {
  return loadIndex(adapter, { create: true, now });
}

export async function getV1StorageIndex(adapter) {
  return clone(await loadIndex(adapter, { create: false }));
}

export async function storeV1CreatorDraft(adapter, draft, { now = draft?.updatedAt } = {}) {
  requireAdapter(adapter);
  const record = clone(assertDraft(draft));
  const index = await loadIndex(adapter, { create: true, now });
  await adapter.writeJson(V1_STORAGE_PATHS.draft(record.id), record);
  index.drafts[record.id] = draftSummary(record);
  await writeIndex(adapter, index, now);
  return clone(record);
}

export async function loadV1CreatorDraft(adapter, draftId) {
  const id = safeId(draftId, 'draftId');
  const record = await readOrNull(requireAdapter(adapter), V1_STORAGE_PATHS.draft(id));
  if (!record) throw new Error(`V1 Character Creator draft "${id}" was not found.`);
  return clone(assertDraft(record));
}

export async function listV1CreatorDrafts(adapter) {
  const index = await loadIndex(adapter, { create: false });
  if (!index) return [];
  return Object.values(index.drafts).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).map(clone);
}

export async function deleteV1CreatorDraft(adapter, draftId, { now = new Date().toISOString() } = {}) {
  const id = safeId(draftId, 'draftId');
  const index = await loadIndex(adapter, { create: true, now });
  const deleted = await remove(adapter, V1_STORAGE_PATHS.draft(id));
  delete index.drafts[id];
  await writeIndex(adapter, index, now);
  return { deleted, id };
}

export function createV1CampaignSave({
  id,
  name,
  slotType = 'active',
  state,
  createdAt,
  updatedAt = createdAt,
  parentSaveId = null
}) {
  assertV1CampaignState(state);
  const record = {
    kind: V1_CAMPAIGN_SAVE_KIND,
    version: 1,
    id: safeId(id, 'save.id'),
    name: String(name || state.campaign?.title || id).trim(),
    slotType,
    campaignId: state.campaign.id,
    packageId: state.activeCampaignPackage.packageId,
    packageVersion: state.activeCampaignPackage.packageVersion,
    parentSaveId: parentSaveId ? safeId(parentSaveId, 'parentSaveId') : null,
    createdAt: time(createdAt, 'createdAt'),
    updatedAt: time(updatedAt, 'updatedAt'),
    state: clone(state)
  };
  return assertV1CampaignSave(record);
}

export async function storeV1CampaignSave(adapter, save, { makeActive = save?.slotType === 'active' } = {}) {
  requireAdapter(adapter);
  const record = clone(assertV1CampaignSave(save));
  const index = await loadIndex(adapter, { create: true, now: record.updatedAt });
  await adapter.writeJson(V1_STORAGE_PATHS.save(record.id), record);
  index.saves[record.id] = saveSummary(record);
  if (makeActive) index.activeSaveId = record.id;
  await writeIndex(adapter, index, record.updatedAt);
  return clone(record);
}

export async function loadV1CampaignSave(adapter, saveId, { makeActive = false, now = null } = {}) {
  const id = safeId(saveId, 'saveId');
  const record = await readOrNull(requireAdapter(adapter), V1_STORAGE_PATHS.save(id));
  if (!record) throw new Error(`V1 campaign save "${id}" was not found.`);
  const save = clone(assertV1CampaignSave(record));
  if (makeActive) {
    const index = await loadIndex(adapter, { create: true, now: now || save.updatedAt });
    index.activeSaveId = id;
    await writeIndex(adapter, index, now || save.updatedAt);
  }
  return save;
}

export async function listV1CampaignSaves(adapter) {
  const index = await loadIndex(adapter, { create: false });
  if (!index) return [];
  return Object.values(index.saves).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).map(clone);
}

export async function loadActiveV1CampaignSave(adapter) {
  const index = await loadIndex(adapter, { create: false });
  if (!index?.activeSaveId) return null;
  return loadV1CampaignSave(adapter, index.activeSaveId);
}

export async function compareAndSwapActiveV1CampaignSave(adapter, {
  expectedSaveId,
  nextSaveId,
  now = new Date().toISOString()
} = {}) {
  const expectedId = safeId(expectedSaveId, 'expectedSaveId');
  const nextId = safeId(nextSaveId, 'nextSaveId');
  const index = await loadIndex(requireAdapter(adapter), { create: true, now });
  if (index.activeSaveId !== expectedId) {
    const error = new Error(`The active V1 save changed from "${expectedId}" before the timeline could be activated.`);
    error.code = 'DIRECTIVE_V1_ACTIVE_SAVE_CAS_MISMATCH';
    error.details = { expectedSaveId: expectedId, actualSaveId: index.activeSaveId, nextSaveId: nextId };
    throw error;
  }
  const [expected, next] = await Promise.all([
    loadV1CampaignSave(adapter, expectedId),
    loadV1CampaignSave(adapter, nextId)
  ]);
  if (expected.slotType !== 'active' || next.slotType !== 'active' || expected.campaignId !== next.campaignId) {
    const error = new Error('The timeline activation records are not compatible active saves from one campaign.');
    error.code = 'DIRECTIVE_V1_ACTIVE_SAVE_CAS_TARGET_INVALID';
    throw error;
  }
  index.activeSaveId = nextId;
  await writeIndex(adapter, index, now);
  return { swapped: true, expectedSaveId: expectedId, activeSaveId: nextId };
}

export async function deleteV1CampaignSave(adapter, saveId, { now = new Date().toISOString() } = {}) {
  const id = safeId(saveId, 'saveId');
  const index = await loadIndex(adapter, { create: true, now });
  const deleted = await remove(adapter, V1_STORAGE_PATHS.save(id));
  delete index.saves[id];
  if (index.activeSaveId === id) index.activeSaveId = null;
  await writeIndex(adapter, index, now);
  return { deleted, deletedActive: index.activeSaveId === null, id };
}

export async function verifyV1Storage(adapter) {
  const index = await loadIndex(adapter, { create: false });
  if (!index) return { ok: true, initialized: false, saveCount: 0, draftCount: 0 };
  const keys = [
    V1_STORAGE_PATHS.index,
    ...Object.keys(index.drafts).map(V1_STORAGE_PATHS.draft),
    ...Object.keys(index.saves).map(V1_STORAGE_PATHS.save)
  ];
  if (typeof adapter.verifyJsonFiles !== 'function') {
    for (const key of keys) {
      if (!await readOrNull(adapter, key)) return { ok: false, initialized: true, missingKey: key };
    }
  } else {
    const verified = await adapter.verifyJsonFiles(keys);
    const missingKey = keys.find((key) => verified?.[key] !== true);
    if (missingKey) return { ok: false, initialized: true, missingKey };
  }
  return {
    ok: true,
    initialized: true,
    saveCount: Object.keys(index.saves).length,
    draftCount: Object.keys(index.drafts).length
  };
}
