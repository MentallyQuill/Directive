import { assertV1CampaignState } from '../runtime/v1-campaign-state.mjs';
import {
  applyV1StateDelta,
  canonicalJson,
  encodeV1StateDelta,
  sha256Json,
} from './v1-state-delta-codec.mjs';
import {
  V1_CAMPAIGN_SAVE_MANIFEST_KIND,
  V1_CAMPAIGN_SAVE_SEGMENT_KIND,
  V1_CAMPAIGN_SAVE_SEGMENT_MAX_BYTES,
  V1_CAMPAIGN_SAVE_SEGMENT_MAX_DELTAS,
  V1_SEGMENTED_SAVE_PATHS,
  assertV1CampaignSaveBase,
  assertV1CampaignSaveManifest,
  assertV1CampaignSaveSegment,
  campaignSaveMetadata,
  createV1CampaignSaveBase,
  createV1CampaignSaveManifest,
} from './v1-segmented-save-contracts.mjs';

export const V1_STORAGE_INDEX_KIND = 'directive.storageIndex.v1';
export const V1_CAMPAIGN_SAVE_KIND = 'directive.campaignSave.v1';
export const V1_CREATOR_DRAFT_KIND = 'directive.characterCreatorDraft.v1';

export const V1_STORAGE_PATHS = Object.freeze({
  index: 'v1/index.v1.json',
  draft: (draftId) => `v1/drafts/${safeId(draftId, 'draftId')}.v1.json`,
  save: (saveId) => `v1/saves/${safeId(saveId, 'saveId')}.v1.json`,
  saveBase: V1_SEGMENTED_SAVE_PATHS.base,
  saveSegment: V1_SEGMENTED_SAVE_PATHS.segment,
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

function byteLength(value) {
  return new TextEncoder().encode(canonicalJson(value)).byteLength;
}

function changedStateRoots(before, after) {
  return [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])]
    .filter((root) => {
      const beforeValue = before?.[root];
      const afterValue = after?.[root];
      if (beforeValue === undefined || afterValue === undefined) return beforeValue !== afterValue;
      return canonicalJson(beforeValue) !== canonicalJson(afterValue);
    })
    .sort();
}

function saveStorageError(code, message, details = undefined) {
  const error = new Error(message);
  error.code = code;
  if (details) error.details = clone(details);
  return error;
}

async function readVerifiedSegment(adapter, manifest, reference) {
  const segment = assertV1CampaignSaveSegment(await adapter.readJson(reference.path), {
    saveId: manifest.saveId,
    reference,
  });
  if (byteLength(segment) !== reference.byteLength || await sha256Json(segment) !== reference.contentHash) {
    throw saveStorageError(
      'DIRECTIVE_V1_SAVE_SEGMENT_INTEGRITY_FAILED',
      'Directive V1 campaign-save segment failed integrity verification.',
      { path: reference.path },
    );
  }
  return segment;
}

async function hydrateManifest(adapter, manifestRecord, saveId) {
  const manifest = assertV1CampaignSaveManifest(manifestRecord, { saveId });
  const base = assertV1CampaignSaveBase(await adapter.readJson(manifest.base.path), { saveId });
  if (base.revision !== manifest.base.revision
    || base.stateHash !== manifest.base.stateHash
    || await sha256Json(base.state) !== base.stateHash) {
    throw saveStorageError(
      'DIRECTIVE_V1_SAVE_BASE_INTEGRITY_FAILED',
      'Directive V1 campaign-save base failed integrity verification.',
    );
  }
  let state = clone(base.state);
  for (const reference of manifest.segments) {
    const segment = await readVerifiedSegment(adapter, manifest, reference);
    for (const delta of segment.deltas) {
      state = await applyV1StateDelta({ saveId, state, delta });
    }
    if (state.stateCustody.revision !== reference.afterRevision) {
      throw saveStorageError(
        'DIRECTIVE_V1_SAVE_REVISION_DISCONTINUITY',
        'Directive V1 campaign-save segment did not reach its declared revision.',
      );
    }
  }
  if (state.stateCustody.revision !== manifest.currentRevision
    || await sha256Json(state) !== manifest.currentStateHash) {
    throw saveStorageError(
      'DIRECTIVE_V1_SAVE_MANIFEST_INTEGRITY_FAILED',
      'Directive V1 campaign-save state does not match its manifest head.',
    );
  }
  return {
    manifest,
    save: clone(assertV1CampaignSave({ ...manifest.saveMetadata, state })),
  };
}

async function verifiedWrite(
  adapter,
  path,
  value,
  assertWritten,
  verificationCode = 'DIRECTIVE_V1_SAVE_WRITE_VERIFICATION_FAILED',
  writeCode = 'DIRECTIVE_V1_SAVE_WRITE_FAILED',
) {
  try {
    await adapter.writeJson(path, value);
  } catch (cause) {
    throw saveStorageError(writeCode, `Directive V1 could not write "${path}".`, {
      path,
      cause: cause?.message || String(cause),
    });
  }
  try {
    const written = assertWritten(await adapter.readJson(path));
    if (canonicalJson(written) !== canonicalJson(value)) throw new Error('read-back content differs');
    return written;
  } catch (cause) {
    throw saveStorageError(verificationCode, `Directive V1 could not verify storage write "${path}".`, {
      path,
      cause: cause?.message || String(cause),
    });
  }
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

export async function storeV1CampaignSave(adapter, save, {
  makeActive = save?.slotType === 'active',
  previousSave = null,
} = {}) {
  requireAdapter(adapter);
  const record = clone(assertV1CampaignSave(save));
  const index = await loadIndex(adapter, { create: true, now: record.updatedAt });
  const manifestPath = V1_STORAGE_PATHS.save(record.id);
  const existing = await readOrNull(adapter, manifestPath);
  if (existing) {
    if (existing.kind !== V1_CAMPAIGN_SAVE_MANIFEST_KIND) {
      const error = new Error('Directive V1 rejects monolithic or unsupported campaign-save layouts.');
      error.code = 'DIRECTIVE_V1_SAVE_LAYOUT_UNSUPPORTED';
      throw error;
    }
    const manifest = assertV1CampaignSaveManifest(existing, { saveId: record.id });
    const previous = previousSave
      ? clone(assertV1CampaignSave(previousSave))
      : (await hydrateManifest(adapter, manifest, record.id)).save;
    if (previous.id !== record.id) {
      throw saveStorageError('DIRECTIVE_V1_SAVE_PREVIOUS_MISMATCH', 'Previous campaign save belongs to another save.');
    }
    const previousHash = await sha256Json(previous.state);
    const nextHash = await sha256Json(record.state);
    if (previous.state.stateCustody.revision !== manifest.currentRevision
      || previousHash !== manifest.currentStateHash) {
      throw saveStorageError(
        'DIRECTIVE_V1_SAVE_CONCURRENT_UPDATE',
        'Campaign save changed before this update could be persisted.',
      );
    }
    let nextManifest = {
      ...clone(manifest),
      saveMetadata: campaignSaveMetadata(record),
      updatedAt: record.updatedAt,
    };
    if (nextHash !== previousHash) {
      const beforeRevision = previous.state.stateCustody.revision;
      const afterRevision = record.state.stateCustody.revision;
      if (afterRevision !== beforeRevision + 1) {
        throw saveStorageError(
          'DIRECTIVE_V1_SAVE_REVISION_DISCONTINUITY',
          'Campaign-save updates must advance exactly one state revision.',
          { beforeRevision, afterRevision },
        );
      }
      const delta = await encodeV1StateDelta({
        saveId: record.id,
        before: previous.state,
        after: record.state,
        changedRoots: changedStateRoots(previous.state, record.state),
        createdAt: record.updatedAt,
        source: 'v1-storage-repository',
      });
      const currentReference = manifest.segments.at(-1) || null;
      let sequence = currentReference?.sequence || 1;
      let generation = currentReference ? currentReference.generation + 1 : 1;
      let slot = currentReference ? (currentReference.slot === 'a' ? 'b' : 'a') : 'a';
      let deltas = currentReference
        ? [...(await readVerifiedSegment(adapter, manifest, currentReference)).deltas, delta]
        : [delta];
      let segment = {
        kind: V1_CAMPAIGN_SAVE_SEGMENT_KIND,
        version: 1,
        saveId: record.id,
        sequence,
        generation,
        slot,
        deltas,
      };
      if (deltas.length > V1_CAMPAIGN_SAVE_SEGMENT_MAX_DELTAS
        || byteLength(segment) > V1_CAMPAIGN_SAVE_SEGMENT_MAX_BYTES) {
        sequence += 1;
        generation = 1;
        slot = 'a';
        deltas = [delta];
        segment = { ...segment, sequence, generation, slot, deltas };
      }
      const segmentBytes = byteLength(segment);
      if (segmentBytes > V1_CAMPAIGN_SAVE_SEGMENT_MAX_BYTES) {
        throw saveStorageError(
          'DIRECTIVE_V1_SAVE_DELTA_TOO_LARGE',
          'A single campaign-state delta exceeds the active-segment byte limit.',
          { byteLength: segmentBytes, limit: V1_CAMPAIGN_SAVE_SEGMENT_MAX_BYTES },
        );
      }
      const segmentPath = V1_STORAGE_PATHS.saveSegment(record.id, sequence, slot);
      await verifiedWrite(
        adapter,
        segmentPath,
        segment,
        (value) => assertV1CampaignSaveSegment(value, { saveId: record.id }),
        'DIRECTIVE_V1_SAVE_SEGMENT_WRITE_VERIFICATION_FAILED',
        'DIRECTIVE_V1_SAVE_SEGMENT_WRITE_FAILED',
      );
      const reference = {
        path: segmentPath,
        sequence,
        generation,
        slot,
        beforeRevision: deltas[0].beforeRevision,
        afterRevision: deltas.at(-1).afterRevision,
        deltaCount: deltas.length,
        byteLength: segmentBytes,
        contentHash: await sha256Json(segment),
        sealed: false,
      };
      const rolledOver = currentReference && sequence !== currentReference.sequence;
      const earlier = currentReference
        ? manifest.segments.slice(0, -1)
        : [];
      nextManifest = {
        ...nextManifest,
        segments: currentReference
          ? rolledOver
            ? [...earlier, { ...currentReference, sealed: true }, reference]
            : [...earlier, reference]
          : [reference],
        currentRevision: afterRevision,
        currentStateHash: nextHash,
      };
    } else if (record.state.stateCustody.revision !== previous.state.stateCustody.revision) {
      throw saveStorageError(
        'DIRECTIVE_V1_SAVE_REVISION_DISCONTINUITY',
        'Campaign-save revision changed without a corresponding state change.',
      );
    }
    assertV1CampaignSaveManifest(nextManifest, { saveId: record.id });
    await verifiedWrite(
      adapter,
      manifestPath,
      nextManifest,
      (value) => assertV1CampaignSaveManifest(value, { saveId: record.id }),
      'DIRECTIVE_V1_SAVE_MANIFEST_WRITE_VERIFICATION_FAILED',
      'DIRECTIVE_V1_SAVE_MANIFEST_WRITE_FAILED',
    );
    index.saves[record.id] = saveSummary(record);
    if (makeActive) index.activeSaveId = record.id;
    await writeIndex(adapter, index, record.updatedAt);
    return clone(record);
  }
  const stateHash = await sha256Json(record.state);
  const base = createV1CampaignSaveBase({ saveId: record.id, state: record.state, stateHash });
  const manifest = createV1CampaignSaveManifest({ save: record, stateHash });
  const verifiedBase = await verifiedWrite(
    adapter,
    V1_STORAGE_PATHS.saveBase(record.id),
    base,
    (value) => assertV1CampaignSaveBase(value, { saveId: record.id }),
    'DIRECTIVE_V1_SAVE_BASE_WRITE_VERIFICATION_FAILED',
    'DIRECTIVE_V1_SAVE_BASE_WRITE_FAILED',
  );
  if (await sha256Json(verifiedBase.state) !== stateHash || canonicalJson(verifiedBase) !== canonicalJson(base)) {
    const error = new Error('Directive V1 could not verify the campaign-save base write.');
    error.code = 'DIRECTIVE_V1_SAVE_WRITE_VERIFICATION_FAILED';
    throw error;
  }
  await verifiedWrite(
    adapter,
    manifestPath,
    manifest,
    (value) => assertV1CampaignSaveManifest(value, { saveId: record.id }),
    'DIRECTIVE_V1_SAVE_MANIFEST_WRITE_VERIFICATION_FAILED',
    'DIRECTIVE_V1_SAVE_MANIFEST_WRITE_FAILED',
  );
  index.saves[record.id] = saveSummary(record);
  if (makeActive) index.activeSaveId = record.id;
  await writeIndex(adapter, index, record.updatedAt);
  return clone(record);
}

export async function loadV1CampaignSave(adapter, saveId, { makeActive = false, now = null } = {}) {
  const id = safeId(saveId, 'saveId');
  const manifestRecord = await readOrNull(requireAdapter(adapter), V1_STORAGE_PATHS.save(id));
  if (!manifestRecord) throw new Error(`V1 campaign save "${id}" was not found.`);
  if (manifestRecord.kind !== V1_CAMPAIGN_SAVE_MANIFEST_KIND) {
    const error = new Error('Directive V1 rejects monolithic or unsupported campaign-save layouts.');
    error.code = 'DIRECTIVE_V1_SAVE_LAYOUT_UNSUPPORTED';
    throw error;
  }
  const { save } = await hydrateManifest(adapter, manifestRecord, id);
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
  const manifestPath = V1_STORAGE_PATHS.save(id);
  const manifestRecord = await readOrNull(adapter, manifestPath);
  const manifest = manifestRecord?.kind === V1_CAMPAIGN_SAVE_MANIFEST_KIND
    ? assertV1CampaignSaveManifest(manifestRecord, { saveId: id })
    : null;
  if (manifest) {
    for (const reference of manifest.segments) {
      await remove(adapter, V1_STORAGE_PATHS.saveSegment(id, reference.sequence, 'a'));
      await remove(adapter, V1_STORAGE_PATHS.saveSegment(id, reference.sequence, 'b'));
    }
  }
  await remove(adapter, V1_STORAGE_PATHS.saveBase(id));
  const deleted = await remove(adapter, manifestPath);
  const deletedActive = index.activeSaveId === id;
  delete index.saves[id];
  if (index.activeSaveId === id) index.activeSaveId = null;
  await writeIndex(adapter, index, now);
  return { deleted, deletedActive, id };
}

export async function verifyV1Storage(adapter) {
  const index = await loadIndex(adapter, { create: false });
  if (!index) return { ok: true, initialized: false, saveCount: 0, draftCount: 0 };
  const manifests = [];
  for (const saveId of Object.keys(index.saves)) {
    const manifestPath = V1_STORAGE_PATHS.save(saveId);
    const manifestRecord = await readOrNull(adapter, manifestPath);
    if (!manifestRecord) return { ok: false, initialized: true, missingKey: manifestPath };
    try {
      manifests.push(assertV1CampaignSaveManifest(manifestRecord, { saveId }));
    } catch (error) {
      return {
        ok: false,
        initialized: true,
        invalidSaveId: saveId,
        errorCode: error?.code || 'DIRECTIVE_V1_SAVE_MANIFEST_REJECTED',
      };
    }
  }
  const keys = [
    V1_STORAGE_PATHS.index,
    ...Object.keys(index.drafts).map(V1_STORAGE_PATHS.draft),
    ...manifests.flatMap((manifest) => [
      V1_STORAGE_PATHS.save(manifest.saveId),
      manifest.base.path,
      ...manifest.segments.map((reference) => reference.path),
    ]),
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
  for (const manifest of manifests) {
    try {
      await hydrateManifest(adapter, manifest, manifest.saveId);
    } catch (error) {
      return {
        ok: false,
        initialized: true,
        invalidSaveId: manifest.saveId,
        errorCode: error?.code || 'DIRECTIVE_V1_SAVE_INTEGRITY_FAILED',
      };
    }
  }
  return {
    ok: true,
    initialized: true,
    saveCount: Object.keys(index.saves).length,
    draftCount: Object.keys(index.drafts).length
  };
}
