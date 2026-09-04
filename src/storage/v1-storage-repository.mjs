import { assertV1CampaignState } from '../runtime/v1-campaign-state.mjs';
import {
  applyV1StateDeltaChain,
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
export const V1_MONOLITHIC_RECOVERY_KIND = 'directive.monolithicSaveRecovery.v1';
export const V1_MONOLITHIC_RECOVERY_REFERENCE_KIND = 'directive.monolithicSaveRecoveryReference.v1';
export const V1_CAMPAIGN_DELETION_KIND = 'directive.campaignDeletion.v1';

export const V1_STORAGE_PATHS = Object.freeze({
  index: 'v1/index.v1.json',
  draft: (draftId) => `v1/drafts/${safeId(draftId, 'draftId')}.v1.json`,
  save: (saveId) => `v1/saves/${safeId(saveId, 'saveId')}.v1.json`,
  saveBase: V1_SEGMENTED_SAVE_PATHS.base,
  saveSegment: V1_SEGMENTED_SAVE_PATHS.segment,
  monolithicRecovery: (saveId) => `v1/recovery/${safeId(saveId, 'saveId')}.monolithic.v1.json`,
  timelineOperation: (campaignId) => `v1/operations/${safeId(campaignId, 'campaignId')}.timeline.v1.json`
});

const SAFE_ID = /^[a-zA-Z0-9_.-]+$/;
const SHA256 = /^[a-f0-9]{64}$/;

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
    recoveryCopies: {},
    campaignDeletions: {},
    updatedAt: time(now)
  };
}

export function assertV1StorageIndex(index) {
  if (!object(index)
    || index.kind !== V1_STORAGE_INDEX_KIND
    || index.version !== 1
    || !object(index.drafts)
    || !object(index.saves)
    || (index.recoveryCopies !== undefined && !object(index.recoveryCopies))
    || (index.campaignDeletions !== undefined && !object(index.campaignDeletions))) {
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
  const deltas = [];
  for (const reference of manifest.segments) {
    const segment = await readVerifiedSegment(adapter, manifest, reference);
    if (segment.deltas[0].beforeRevision !== reference.beforeRevision
      || segment.deltas.at(-1).afterRevision !== reference.afterRevision) {
      throw saveStorageError(
        'DIRECTIVE_V1_SAVE_REVISION_DISCONTINUITY',
        'Directive V1 campaign-save segment did not reach its declared revision.',
      );
    }
    deltas.push(...segment.deltas);
  }
  const applied = await applyV1StateDeltaChain({
    saveId,
    state: base.state,
    deltas,
    expectedBeforeHash: base.stateHash,
  });
  const { state, stateHash } = applied;
  if (state.stateCustody.revision !== manifest.currentRevision
    || stateHash !== manifest.currentStateHash
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

async function writeIndexVerified(adapter, index, now, code) {
  const next = clone(assertV1StorageIndex(index));
  next.updatedAt = time(now);
  return verifiedWrite(
    adapter,
    V1_STORAGE_PATHS.index,
    next,
    assertV1StorageIndex,
    `${code}_VERIFICATION_FAILED`,
    `${code}_WRITE_FAILED`,
  );
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

function assertMonolithicV1CampaignSave(record, saveId) {
  const save = clone(assertV1CampaignSave(record));
  if (save.id !== saveId) {
    throw saveStorageError(
      'DIRECTIVE_V1_MONOLITHIC_SAVE_ID_MISMATCH',
      'The older Directive save does not match its indexed save ID.',
    );
  }
  return save;
}

function assertMonolithicRecoveryEnvelope(value, saveId) {
  const fields = Object.keys(value || {}).sort();
  const expectedFields = ['kind', 'save', 'saveId', 'sourceHash', 'version'];
  if (!object(value)
    || canonicalJson(fields) !== canonicalJson(expectedFields)
    || value.kind !== V1_MONOLITHIC_RECOVERY_KIND
    || value.version !== 1
    || value.saveId !== saveId
    || !SHA256.test(String(value.sourceHash || ''))) {
    throw saveStorageError(
      'DIRECTIVE_V1_MONOLITHIC_RECOVERY_INVALID',
      'The preserved older Directive save has invalid recovery metadata.',
    );
  }
  assertMonolithicV1CampaignSave(value.save, saveId);
  return value;
}

async function verifyMonolithicRecoveryEnvelope(value, saveId) {
  const envelope = assertMonolithicRecoveryEnvelope(value, saveId);
  if (await sha256Json(envelope.save) !== envelope.sourceHash) {
    throw saveStorageError(
      'DIRECTIVE_V1_MONOLITHIC_RECOVERY_INTEGRITY_FAILED',
      'The preserved older Directive save failed integrity verification.',
    );
  }
  return clone(envelope);
}

function createMonolithicRecoveryReference(saveId, sourceHash) {
  return {
    kind: V1_MONOLITHIC_RECOVERY_REFERENCE_KIND,
    version: 1,
    saveId,
    path: V1_STORAGE_PATHS.monolithicRecovery(saveId),
    sourceHash,
  };
}

function assertMonolithicRecoveryReference(value, saveId) {
  const fields = Object.keys(value || {}).sort();
  const expectedFields = ['kind', 'path', 'saveId', 'sourceHash', 'version'];
  if (!object(value)
    || canonicalJson(fields) !== canonicalJson(expectedFields)
    || value.kind !== V1_MONOLITHIC_RECOVERY_REFERENCE_KIND
    || value.version !== 1
    || value.saveId !== saveId
    || value.path !== V1_STORAGE_PATHS.monolithicRecovery(saveId)
    || !SHA256.test(String(value.sourceHash || ''))) {
    throw saveStorageError(
      'DIRECTIVE_V1_MONOLITHIC_RECOVERY_REFERENCE_INVALID',
      'The older Directive save recovery reference is invalid.',
    );
  }
  return value;
}

async function restoreMonolithicSave(adapter, path, save) {
  try {
    await adapter.writeJson(path, save);
    const restored = assertMonolithicV1CampaignSave(await adapter.readJson(path), save.id);
    return canonicalJson(restored) === canonicalJson(save);
  } catch {
    return false;
  }
}

export async function migrateMonolithicV1CampaignSaves(adapter) {
  requireAdapter(adapter);
  const index = await loadIndex(adapter, { create: false });
  if (!index) {
    return {
      ok: true,
      scannedSaveCount: 0,
      migratedSaveCount: 0,
      migratedSaveIds: [],
      recoveryCopyCount: 0,
    };
  }
  const saveIds = Object.keys(index.saves).sort();
  index.recoveryCopies = object(index.recoveryCopies) ? clone(index.recoveryCopies) : {};
  const migratedSaveIds = [];
  let recoveryCopyCount = 0;
  let recoveryReferencesChanged = false;
  for (const saveId of saveIds) {
    const manifestPath = V1_STORAGE_PATHS.save(saveId);
    const record = await readOrNull(adapter, manifestPath);
    if (!record) continue;
    const recoveryPath = V1_STORAGE_PATHS.monolithicRecovery(saveId);
    const existingRecovery = await readOrNull(adapter, recoveryPath);
    if (record.kind === V1_CAMPAIGN_SAVE_MANIFEST_KIND) {
      if (existingRecovery) {
        try {
          const envelope = await verifyMonolithicRecoveryEnvelope(existingRecovery, saveId);
          const expectedReference = createMonolithicRecoveryReference(saveId, envelope.sourceHash);
          const publishedReference = index.recoveryCopies[saveId] || null;
          if (publishedReference) {
            assertMonolithicRecoveryReference(publishedReference, saveId);
            if (canonicalJson(publishedReference) !== canonicalJson(expectedReference)) {
              throw saveStorageError(
                'DIRECTIVE_V1_MONOLITHIC_RECOVERY_PROVENANCE_MISMATCH',
                'The older Directive save recovery copy does not match its published provenance.',
              );
            }
          } else {
            index.recoveryCopies[saveId] = expectedReference;
            recoveryReferencesChanged = true;
          }
          recoveryCopyCount += 1;
        } catch {
          // The current manifest remains authoritative. Storage diagnostics report
          // the damaged non-authoritative recovery copy without blocking startup.
        }
      }
      continue;
    }

    let legacySave;
    try {
      legacySave = assertMonolithicV1CampaignSave(record, saveId);
    } catch (cause) {
      throw saveStorageError(
        'DIRECTIVE_V1_MONOLITHIC_SAVE_UNRECOVERABLE',
        'An older Directive save could not be upgraded safely. It was left unchanged.',
        { saveId, recoveryPath, causeCode: cause?.code || null },
      );
    }

    const sourceHash = await sha256Json(legacySave);
    const recoveryEnvelope = {
      kind: V1_MONOLITHIC_RECOVERY_KIND,
      version: 1,
      saveId,
      sourceHash,
      save: clone(legacySave),
    };
    const recoveryReference = createMonolithicRecoveryReference(saveId, sourceHash);
    const publishedReference = index.recoveryCopies[saveId] || null;
    if (publishedReference) {
      try {
        assertMonolithicRecoveryReference(publishedReference, saveId);
      } catch (cause) {
        throw saveStorageError(
          'DIRECTIVE_V1_MONOLITHIC_RECOVERY_CONFLICT',
          'The recovery provenance for this older Directive save is invalid. The live save was left unchanged.',
          { saveId, recoveryPath, causeCode: cause?.code || null },
        );
      }
      if (canonicalJson(publishedReference) !== canonicalJson(recoveryReference)) {
        throw saveStorageError(
          'DIRECTIVE_V1_MONOLITHIC_RECOVERY_CONFLICT',
          'Different recovery provenance already exists for this older Directive save. The live save was left unchanged.',
          { saveId, recoveryPath },
        );
      }
    }

    if (existingRecovery) {
      try {
        const verifiedRecovery = await verifyMonolithicRecoveryEnvelope(existingRecovery, saveId);
        if (canonicalJson(verifiedRecovery) !== canonicalJson(recoveryEnvelope)) {
          throw new Error('recovery content differs');
        }
      } catch (cause) {
        throw saveStorageError(
          'DIRECTIVE_V1_MONOLITHIC_RECOVERY_CONFLICT',
          'A different recovery copy already exists for this older Directive save. The live save was left unchanged.',
          { saveId, recoveryPath, causeCode: cause?.code || null },
        );
      }
    } else {
      await verifiedWrite(
        adapter,
        recoveryPath,
        recoveryEnvelope,
        (value) => assertMonolithicRecoveryEnvelope(value, saveId),
        'DIRECTIVE_V1_MONOLITHIC_RECOVERY_WRITE_VERIFICATION_FAILED',
        'DIRECTIVE_V1_MONOLITHIC_RECOVERY_WRITE_FAILED',
      );
      await verifyMonolithicRecoveryEnvelope(await adapter.readJson(recoveryPath), saveId);
    }
    index.recoveryCopies[saveId] = recoveryReference;
    recoveryReferencesChanged = true;
    recoveryCopyCount += 1;

    try {
      const stateHash = await sha256Json(legacySave.state);
      const base = createV1CampaignSaveBase({ saveId, state: legacySave.state, stateHash });
      const manifest = createV1CampaignSaveManifest({ save: legacySave, stateHash });
      await verifiedWrite(
        adapter,
        V1_STORAGE_PATHS.saveBase(saveId),
        base,
        (value) => assertV1CampaignSaveBase(value, { saveId }),
        'DIRECTIVE_V1_MONOLITHIC_BASE_WRITE_VERIFICATION_FAILED',
        'DIRECTIVE_V1_MONOLITHIC_BASE_WRITE_FAILED',
      );
      await verifiedWrite(
        adapter,
        manifestPath,
        manifest,
        (value) => assertV1CampaignSaveManifest(value, { saveId }),
        'DIRECTIVE_V1_MONOLITHIC_MANIFEST_WRITE_VERIFICATION_FAILED',
        'DIRECTIVE_V1_MONOLITHIC_MANIFEST_WRITE_FAILED',
      );
      const hydrated = await hydrateManifest(adapter, manifest, saveId);
      if (canonicalJson(hydrated.save) !== canonicalJson(legacySave)) {
        throw saveStorageError(
          'DIRECTIVE_V1_MONOLITHIC_SAVE_ROUND_TRIP_FAILED',
          'The upgraded Directive save did not reproduce the original state.',
        );
      }
    } catch (cause) {
      const restored = await restoreMonolithicSave(adapter, manifestPath, legacySave);
      throw saveStorageError(
        'DIRECTIVE_V1_MONOLITHIC_SAVE_MIGRATION_FAILED',
        restored
          ? 'Directive could not upgrade an older save. The original live save and its recovery copy were retained.'
          : 'Directive could not upgrade or restore an older save. Use the preserved recovery copy before continuing.',
        {
          saveId,
          recoveryPath,
          originalRestored: restored,
          causeCode: cause?.code || null,
        },
      );
    }
    migratedSaveIds.push(saveId);
  }
  if (recoveryReferencesChanged) {
    try {
      await writeIndex(adapter, index, index.updatedAt);
    } catch (cause) {
      throw saveStorageError(
        'DIRECTIVE_V1_MONOLITHIC_RECOVERY_INDEX_WRITE_FAILED',
        'Directive upgraded the older save but could not publish its recovery provenance. Reload to retry safely.',
        { causeCode: cause?.code || null },
      );
    }
  }
  return {
    ok: true,
    scannedSaveCount: saveIds.length,
    migratedSaveCount: migratedSaveIds.length,
    migratedSaveIds,
    recoveryCopyCount,
  };
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
    const alreadyPublished = Object.hasOwn(index.saves, record.id);
    const activePointerStable = !makeActive || index.activeSaveId === record.id;
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
    try {
      await writeIndex(adapter, index, record.updatedAt);
    } catch (error) {
      if (!alreadyPublished || !activePointerStable) throw error;
    }
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
  const index = await loadIndex(adapter, { create: true, now: now || save.updatedAt });
  const summary = saveSummary(save);
  const publishedSummary = index.saves[id] ?? null;
  const summaryStale = publishedSummary !== null
    && canonicalJson(publishedSummary) !== canonicalJson(summary);
  if (summaryStale || makeActive) index.saves[id] = summary;
  if (makeActive) {
    index.activeSaveId = id;
  }
  if (summaryStale || makeActive) {
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

function assertCampaignDeletionTombstone(value, campaignId = null) {
  const expectedCampaignId = campaignId ? safeId(campaignId, 'campaignId') : null;
  const expectedFields = [
    'activeSaveId', 'campaignChatBindingHash', 'campaignId', 'cleanupFailures',
    'hostDeletedAt', 'kind', 'recoveryCopies', 'requestedAt', 'saveId',
    'saveIds', 'saveSummaries', 'status', 'version',
  ];
  if (!object(value)
    || canonicalJson(Object.keys(value).sort()) !== canonicalJson(expectedFields)
    || value.kind !== V1_CAMPAIGN_DELETION_KIND
    || value.version !== 1
    || !['prepared', 'host-deleted', 'cleanup-pending'].includes(value.status)
    || !Array.isArray(value.saveIds)
    || value.saveIds.length === 0
    || !object(value.saveSummaries)
    || !object(value.recoveryCopies)
    || !SHA256.test(String(value.campaignChatBindingHash || ''))
    || !Array.isArray(value.cleanupFailures)) {
    throw saveStorageError(
      'DIRECTIVE_V1_CAMPAIGN_DELETION_TOMBSTONE_INVALID',
      'A pending Directive campaign deletion record is invalid.',
    );
  }
  const actualCampaignId = safeId(value.campaignId, 'campaignDeletion.campaignId');
  const activeSaveId = safeId(value.saveId, 'campaignDeletion.saveId');
  const saveIds = [...new Set(value.saveIds.map((id) => safeId(id, 'campaignDeletion.saveIds[]')))].sort();
  const summaryIds = Object.keys(value.saveSummaries).sort();
  if (canonicalJson(value.saveIds) !== canonicalJson(saveIds)
    || canonicalJson(summaryIds) !== canonicalJson(saveIds)
    || !saveIds.includes(activeSaveId)
    || value.activeSaveId !== activeSaveId
    || !value.cleanupFailures.every((path) => typeof path === 'string' && path.trim())) {
    throw saveStorageError(
      'DIRECTIVE_V1_CAMPAIGN_DELETION_TOMBSTONE_INVALID',
      'A pending Directive campaign deletion record has inconsistent save custody.',
    );
  }
  for (const id of saveIds) {
    const summary = value.saveSummaries[id];
    if (!object(summary) || summary.id !== id || summary.campaignId !== actualCampaignId) {
      throw saveStorageError(
        'DIRECTIVE_V1_CAMPAIGN_DELETION_TOMBSTONE_INVALID',
        'A pending Directive campaign deletion record has invalid save metadata.',
      );
    }
  }
  for (const [id, reference] of Object.entries(value.recoveryCopies)) {
    if (!saveIds.includes(id)) {
      throw saveStorageError(
        'DIRECTIVE_V1_CAMPAIGN_DELETION_TOMBSTONE_INVALID',
        'A pending Directive campaign deletion record has unrelated recovery metadata.',
      );
    }
    assertMonolithicRecoveryReference(reference, id);
  }
  time(value.requestedAt, 'campaignDeletion.requestedAt');
  if (value.status === 'prepared') {
    if (value.hostDeletedAt !== null) {
      throw saveStorageError(
        'DIRECTIVE_V1_CAMPAIGN_DELETION_TOMBSTONE_INVALID',
        'A prepared Directive campaign deletion cannot claim completed host deletion.',
      );
    }
  } else {
    time(value.hostDeletedAt, 'campaignDeletion.hostDeletedAt');
  }
  if (expectedCampaignId && value.campaignId !== expectedCampaignId) {
    throw saveStorageError(
      'DIRECTIVE_V1_CAMPAIGN_DELETION_TOMBSTONE_MISMATCH',
      'A pending Directive campaign deletion record does not match the requested campaign.',
    );
  }
  return value;
}

async function validatedCampaignDeletionSave(adapter, tombstone, saveId) {
  let save;
  try {
    save = await loadV1CampaignSave(adapter, saveId);
  } catch (cause) {
    throw saveStorageError(
      'DIRECTIVE_V1_CAMPAIGN_DELETION_RESUME_TARGET_INVALID',
      'Directive could not verify the retained save for a pending campaign deletion.',
      { campaignId: tombstone.campaignId, saveId, causeCode: cause?.code || null },
    );
  }
  if (save.campaignId !== tombstone.campaignId
    || canonicalJson(saveSummary(save)) !== canonicalJson(tombstone.saveSummaries[saveId])) {
    throw saveStorageError(
      'DIRECTIVE_V1_CAMPAIGN_DELETION_RESUME_TARGET_INVALID',
      'A retained Directive save does not match its pending campaign deletion record.',
      { campaignId: tombstone.campaignId, saveId },
    );
  }
  return save;
}

export async function beginV1CampaignDeletion(adapter, {
  campaignId,
  saveId,
  saveIds,
} = {}, { now = new Date().toISOString() } = {}) {
  const expectedCampaignId = safeId(campaignId, 'campaignId');
  const expectedSaveId = safeId(saveId, 'saveId');
  const expectedSaveIds = [...new Set((saveIds || []).map((id) => safeId(id, 'saveIds[]')))].sort();
  if (!expectedSaveIds.includes(expectedSaveId)) {
    throw saveStorageError(
      'DIRECTIVE_V1_CAMPAIGN_DELETION_TARGET_INVALID',
      'The active campaign save is missing from its deletion set.',
    );
  }
  const index = await loadIndex(adapter, { create: true, now });
  index.recoveryCopies = object(index.recoveryCopies) ? clone(index.recoveryCopies) : {};
  index.campaignDeletions = object(index.campaignDeletions) ? clone(index.campaignDeletions) : {};
  const existing = index.campaignDeletions[expectedCampaignId];
  if (existing) return clone(assertCampaignDeletionTombstone(existing, expectedCampaignId));

  const saveSummaries = {};
  const recoveryCopies = {};
  let activeDeletionSave = null;
  for (const id of expectedSaveIds) {
    const summary = index.saves[id];
    if (!summary || summary.campaignId !== expectedCampaignId) {
      throw saveStorageError(
        'DIRECTIVE_V1_CAMPAIGN_DELETION_TARGET_INVALID',
        'Directive could not atomically prepare every save in the selected campaign for deletion.',
        { campaignId: expectedCampaignId, saveId: id },
      );
    }
    saveSummaries[id] = clone(summary);
    const retainedSave = await loadV1CampaignSave(adapter, id);
    if (retainedSave.campaignId !== expectedCampaignId
      || canonicalJson(saveSummary(retainedSave)) !== canonicalJson(summary)) {
      throw saveStorageError(
        'DIRECTIVE_V1_CAMPAIGN_DELETION_TARGET_INVALID',
        'Directive could not verify every retained save before preparing campaign deletion.',
        { campaignId: expectedCampaignId, saveId: id },
      );
    }
    if (id === expectedSaveId) activeDeletionSave = retainedSave;
    if (index.recoveryCopies[id]) {
      recoveryCopies[id] = clone(assertMonolithicRecoveryReference(index.recoveryCopies[id], id));
    }
  }
  const tombstone = assertCampaignDeletionTombstone({
    kind: V1_CAMPAIGN_DELETION_KIND,
    version: 1,
    status: 'prepared',
    campaignId: expectedCampaignId,
    saveId: expectedSaveId,
    saveIds: expectedSaveIds,
    activeSaveId: expectedSaveIds.includes(index.activeSaveId) ? index.activeSaveId : null,
    campaignChatBindingHash: await sha256Json(activeDeletionSave?.state?.campaignChatBinding || null),
    saveSummaries,
    recoveryCopies,
    cleanupFailures: [],
    requestedAt: time(now),
    hostDeletedAt: null,
  }, expectedCampaignId);
  index.campaignDeletions[expectedCampaignId] = clone(tombstone);
  for (const id of expectedSaveIds) {
    delete index.saves[id];
    delete index.recoveryCopies[id];
  }
  if (expectedSaveIds.includes(index.activeSaveId)) index.activeSaveId = null;
  await writeIndexVerified(adapter, index, now, 'DIRECTIVE_V1_CAMPAIGN_DELETION_PREPARE');
  return clone(tombstone);
}

export async function loadV1CampaignDeletionResumeTarget(adapter, campaignId) {
  const expectedCampaignId = safeId(campaignId, 'campaignId');
  const index = await loadIndex(adapter, { create: false });
  const tombstone = index?.campaignDeletions?.[expectedCampaignId];
  if (!tombstone) {
    throw saveStorageError(
      'DIRECTIVE_V1_CAMPAIGN_DELETION_NOT_PENDING',
      'The requested Directive campaign deletion is not pending.',
    );
  }
  assertCampaignDeletionTombstone(tombstone, expectedCampaignId);
  if (tombstone.status !== 'prepared') {
    return { tombstone: clone(tombstone), campaignChatBinding: null };
  }
  const save = await validatedCampaignDeletionSave(adapter, tombstone, tombstone.saveId);
  const campaignChatBinding = clone(save.state?.campaignChatBinding || null);
  if (await sha256Json(campaignChatBinding) !== tombstone.campaignChatBindingHash) {
    throw saveStorageError(
      'DIRECTIVE_V1_CAMPAIGN_DELETION_RESUME_TARGET_INVALID',
      'The retained SillyTavern character binding changed after campaign deletion was prepared.',
      { campaignId: tombstone.campaignId, saveId: tombstone.saveId },
    );
  }
  return {
    tombstone: clone(tombstone),
    campaignChatBinding,
  };
}

export async function cancelV1CampaignDeletion(adapter, campaignId, {
  now = new Date().toISOString(),
} = {}) {
  const expectedCampaignId = safeId(campaignId, 'campaignId');
  const index = await loadIndex(adapter, { create: true, now });
  index.recoveryCopies = object(index.recoveryCopies) ? clone(index.recoveryCopies) : {};
  index.campaignDeletions = object(index.campaignDeletions) ? clone(index.campaignDeletions) : {};
  const tombstone = index.campaignDeletions[expectedCampaignId];
  if (!tombstone) return { canceled: false, reason: 'not-pending', campaignId: expectedCampaignId };
  assertCampaignDeletionTombstone(tombstone, expectedCampaignId);
  if (tombstone.status !== 'prepared') {
    throw saveStorageError(
      'DIRECTIVE_V1_CAMPAIGN_DELETION_ALREADY_COMMITTED',
      'Directive cannot restore a campaign after its SillyTavern character was deleted.',
      { campaignId: expectedCampaignId, status: tombstone.status },
    );
  }
  for (const id of tombstone.saveIds) {
    if (index.saves[id] && canonicalJson(index.saves[id]) !== canonicalJson(tombstone.saveSummaries[id])) {
      throw saveStorageError(
        'DIRECTIVE_V1_CAMPAIGN_DELETION_CANCEL_CONFLICT',
        'Directive could not safely cancel campaign deletion because its save index changed.',
        { campaignId: expectedCampaignId, saveId: id },
      );
    }
    index.saves[id] = clone(tombstone.saveSummaries[id]);
    if (tombstone.recoveryCopies[id]) {
      index.recoveryCopies[id] = clone(tombstone.recoveryCopies[id]);
    }
  }
  if (tombstone.activeSaveId) index.activeSaveId = tombstone.activeSaveId;
  delete index.campaignDeletions[expectedCampaignId];
  await writeIndex(adapter, index, now);
  return { canceled: true, campaignId: expectedCampaignId };
}

export async function completeV1CampaignDeletion(adapter, campaignId, {
  now = new Date().toISOString(),
} = {}) {
  const expectedCampaignId = safeId(campaignId, 'campaignId');
  const index = await loadIndex(adapter, { create: true, now });
  index.campaignDeletions = object(index.campaignDeletions) ? clone(index.campaignDeletions) : {};
  const tombstone = index.campaignDeletions[expectedCampaignId];
  if (!tombstone) {
    return { deleted: true, campaignId: expectedCampaignId, cleanupPending: false, cleanupFailures: [] };
  }
  assertCampaignDeletionTombstone(tombstone, expectedCampaignId);
  const cleanupFailures = [];
  tombstone.status = 'host-deleted';
  tombstone.hostDeletedAt = tombstone.hostDeletedAt || time(now);
  tombstone.cleanupFailures = [];
  try {
    await writeIndexVerified(adapter, index, now, 'DIRECTIVE_V1_CAMPAIGN_DELETION_HOST_DELETED');
  } catch {
    return {
      deleted: true,
      campaignId: expectedCampaignId,
      saveId: tombstone.saveId,
      saveIds: clone(tombstone.saveIds),
      cleanupPending: true,
      cleanupFailures: [V1_STORAGE_PATHS.index],
    };
  }

  const orderedSaveIds = [
    ...tombstone.saveIds.filter((id) => id !== tombstone.saveId),
    tombstone.saveId,
  ];
  cleanup: for (const id of orderedSaveIds) {
    const manifestPath = V1_STORAGE_PATHS.save(id);
    const manifestRecord = await readOrNull(adapter, manifestPath);
    if (!manifestRecord) continue;
    let manifest;
    try {
      manifest = assertV1CampaignSaveManifest(manifestRecord, { saveId: id });
      if (manifest.saveMetadata?.campaignId !== expectedCampaignId) {
        throw new Error('manifest campaign mismatch');
      }
    } catch {
      cleanupFailures.push(manifestPath);
      break;
    }
    const paths = [
      V1_STORAGE_PATHS.monolithicRecovery(id),
      ...manifest.segments.flatMap((reference) => [
        V1_STORAGE_PATHS.saveSegment(id, reference.sequence, 'a'),
        V1_STORAGE_PATHS.saveSegment(id, reference.sequence, 'b'),
      ]),
      V1_STORAGE_PATHS.saveBase(id),
      manifestPath,
    ];
    for (const path of paths) {
      try {
        await remove(adapter, path);
      } catch {
        cleanupFailures.push(path);
        break cleanup;
      }
    }
  }
  if (cleanupFailures.length === 0) {
    delete index.campaignDeletions[expectedCampaignId];
    try {
      await writeIndex(adapter, index, now);
    } catch {
      cleanupFailures.push(V1_STORAGE_PATHS.index);
    }
  }
  if (cleanupFailures.length > 0) {
    tombstone.status = 'cleanup-pending';
    tombstone.cleanupFailures = [...new Set(cleanupFailures)].sort();
    index.campaignDeletions[expectedCampaignId] = tombstone;
    try {
      await writeIndex(adapter, index, now);
    } catch {
      // The verified host-deleted tombstone still keeps the campaign hidden and
      // makes storage cleanup safe to retry on the next startup.
    }
  }
  return {
    deleted: true,
    campaignId: expectedCampaignId,
    saveId: tombstone.saveId,
    saveIds: clone(tombstone.saveIds),
    cleanupPending: cleanupFailures.length > 0,
    cleanupFailures: [...new Set(cleanupFailures)].sort(),
  };
}

export async function listPendingV1CampaignDeletions(adapter) {
  const index = await loadIndex(adapter, { create: false });
  if (!index) return [];
  return Object.values(object(index.campaignDeletions) ? index.campaignDeletions : {})
    .map((entry) => clone(assertCampaignDeletionTombstone(entry)))
    .sort((a, b) => String(a.requestedAt).localeCompare(String(b.requestedAt)));
}

export async function deleteV1CampaignSave(adapter, saveId, { now = new Date().toISOString() } = {}) {
  const id = safeId(saveId, 'saveId');
  const index = await loadIndex(adapter, { create: true, now });
  const previousIndex = clone(index);
  const manifestPath = V1_STORAGE_PATHS.save(id);
  const recoveryPath = V1_STORAGE_PATHS.monolithicRecovery(id);
  const manifestRecord = await readOrNull(adapter, manifestPath);
  const manifest = manifestRecord?.kind === V1_CAMPAIGN_SAVE_MANIFEST_KIND
    ? assertV1CampaignSaveManifest(manifestRecord, { saveId: id })
    : null;
  const deletedActive = index.activeSaveId === id;
  delete index.saves[id];
  if (object(index.recoveryCopies)) delete index.recoveryCopies[id];
  if (deletedActive) index.activeSaveId = null;
  await writeIndex(adapter, index, now);
  try {
    await remove(adapter, recoveryPath);
  } catch (cause) {
    let indexRestored = false;
    try {
      await verifiedWrite(
        adapter,
        V1_STORAGE_PATHS.index,
        previousIndex,
        assertV1StorageIndex,
        'DIRECTIVE_V1_MONOLITHIC_RECOVERY_DELETE_INDEX_RESTORE_VERIFICATION_FAILED',
        'DIRECTIVE_V1_MONOLITHIC_RECOVERY_DELETE_INDEX_RESTORE_FAILED',
      );
      indexRestored = true;
    } catch {
      // The surfaced error reports whether a safe retry remains indexed.
    }
    throw saveStorageError(
      'DIRECTIVE_V1_MONOLITHIC_RECOVERY_DELETE_FAILED',
      indexRestored
        ? 'Directive could not delete the older-save recovery copy, so campaign deletion was cancelled.'
        : 'Directive could not delete the older-save recovery copy or restore its campaign index. Recovery is required.',
      { saveId: id, recoveryPath, indexRestored, causeCode: cause?.code || null },
    );
  }
  const cleanupFailures = [];
  const cleanup = async (path) => {
    try {
      return await remove(adapter, path);
    } catch {
      cleanupFailures.push(path);
      return false;
    }
  };
  const deleted = await cleanup(manifestPath);
  await cleanup(V1_STORAGE_PATHS.saveBase(id));
  if (manifest) {
    for (const reference of manifest.segments) {
      await cleanup(V1_STORAGE_PATHS.saveSegment(id, reference.sequence, 'a'));
      await cleanup(V1_STORAGE_PATHS.saveSegment(id, reference.sequence, 'b'));
    }
  }
  return { deleted, deletedActive, id, cleanupFailures };
}

export async function verifyV1Storage(adapter) {
  const index = await loadIndex(adapter, { create: false });
  if (!index) return { ok: true, initialized: false, saveCount: 0, draftCount: 0 };
  const pendingCampaignDeletions = Object.values(
    object(index.campaignDeletions) ? index.campaignDeletions : {},
  );
  try {
    pendingCampaignDeletions.forEach((entry) => assertCampaignDeletionTombstone(entry));
  } catch (error) {
    return {
      ok: false,
      initialized: true,
      errorCode: error?.code || 'DIRECTIVE_V1_CAMPAIGN_DELETION_TOMBSTONE_INVALID',
    };
  }
  if (pendingCampaignDeletions.length > 0) {
    return {
      ok: false,
      initialized: true,
      pendingCampaignDeletionCount: pendingCampaignDeletions.length,
      errorCode: 'DIRECTIVE_V1_CAMPAIGN_DELETION_CLEANUP_PENDING',
    };
  }
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
  let recoveryCopyCount = 0;
  const recoveryCopies = object(index.recoveryCopies) ? index.recoveryCopies : {};
  const orphanedRecoverySaveId = Object.keys(recoveryCopies)
    .find((saveId) => !Object.hasOwn(index.saves, saveId));
  if (orphanedRecoverySaveId) {
    return {
      ok: false,
      initialized: true,
      invalidRecoverySaveId: orphanedRecoverySaveId,
      errorCode: 'DIRECTIVE_V1_MONOLITHIC_RECOVERY_ORPHANED',
    };
  }
  for (const saveId of Object.keys(index.saves)) {
    const recoveryPath = V1_STORAGE_PATHS.monolithicRecovery(saveId);
    const recovery = await readOrNull(adapter, recoveryPath);
    const reference = recoveryCopies[saveId] || null;
    if (!recovery && !reference) continue;
    if (!recovery || !reference) {
      return {
        ok: false,
        initialized: true,
        invalidRecoverySaveId: saveId,
        errorCode: !recovery
          ? 'DIRECTIVE_V1_MONOLITHIC_RECOVERY_MISSING'
          : 'DIRECTIVE_V1_MONOLITHIC_RECOVERY_UNREFERENCED',
      };
    }
    try {
      const verified = await verifyMonolithicRecoveryEnvelope(recovery, saveId);
      const verifiedReference = assertMonolithicRecoveryReference(reference, saveId);
      if (verified.sourceHash !== verifiedReference.sourceHash) {
        throw saveStorageError(
          'DIRECTIVE_V1_MONOLITHIC_RECOVERY_PROVENANCE_MISMATCH',
          'The older Directive save recovery copy does not match its published provenance.',
        );
      }
      recoveryCopyCount += 1;
    } catch (error) {
      return {
        ok: false,
        initialized: true,
        invalidRecoverySaveId: saveId,
        errorCode: error?.code || 'DIRECTIVE_V1_MONOLITHIC_RECOVERY_INVALID',
      };
    }
  }
  return {
    ok: true,
    initialized: true,
    saveCount: Object.keys(index.saves).length,
    draftCount: Object.keys(index.drafts).length,
    recoveryCopyCount,
  };
}
