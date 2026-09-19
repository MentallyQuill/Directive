import { detachInheritanceJson, inheritanceAssert, verifyV1HistoryInheritance } from './v1-captured-history-inheritance.mjs';
import { V1_BRANCH_HISTORY_LIMITS, assertAuthorityCapture, captureAssert, captureBytes, captureError, captureLimit } from './v1-branch-history-contracts.mjs';
import { prepareBranchHistory, readVerifiedBranchHistory } from './v1-branch-history-storage.mjs';
import { assertV1CampaignState } from '../runtime/v1-campaign-state.mjs';
import {
  applyV1StateDelta,
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
  publicationIntent: (saveId) => `v1/operations/${safeId(saveId, 'saveId')}.publication.v1.json`,
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

async function readVerifiedSaveChain(adapter, manifestRecord, saveId) {
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
  return { manifest, base, deltas };
}

async function hydrateManifest(adapter, manifestRecord, saveId) {
  const { manifest, base, deltas } = await readVerifiedSaveChain(adapter, manifestRecord, saveId);
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

function assertCaptureEntity(origin, binding) {
  for (const field of ['entityType', 'entityId']) {
    if (binding?.[field] !== undefined) captureAssert(origin[field] === binding[field],
      `Capture ${field} differs from the saved native binding.`);
  }
}

function reconstructCapturedPayload(history) {
  const latest = history.records.at(-1).capture;
  const { head, ...transcript } = latest.transcript;
  return { ...latest, transcript: { ...transcript, rowHashes: history.rows } };
}

function immutableSaveMetadata(metadata) {
  const { name, updatedAt, ...immutable } = metadata;
  return immutable;
}

// Capture verification is deliberately stricter than ordinary latest-save load:
// every state boundary and the complete immutable history graph are verified.
async function verifyCapturedSaveHead(adapter, manifest, { verifyCurrentHead = true } = {}) {
  const id = manifest.saveId;
  assertV1CampaignSaveManifest(manifest, { saveId: id });
  const limit = V1_BRANCH_HISTORY_LIMITS;
  captureLimit(manifest.segments.length <= limit.segments
    && manifest.segments.reduce((sum, ref) => sum + ref.deltaCount, 0) <= limit.deltas
    && manifest.segments.reduce((sum, ref) => sum + ref.byteLength, 0) <= limit.segmentBytes,
  'Captured state chain exceeds verification bounds.');
  captureAssert(Number.isSafeInteger(manifest.base.revision) && Number.isSafeInteger(manifest.currentRevision), 'Unsafe captured state revision.');
  const { base, deltas } = await readVerifiedSaveChain(adapter, manifest, id);
  captureLimit(captureBytes(base.state) <= limit.baseBytes, 'Captured state base exceeds byte limit.');
  let state = base.state;
  const boundaries = new Map([[base.revision, base.stateHash]]);
  for (const delta of deltas) {
    captureAssert(Number.isSafeInteger(delta.beforeRevision) && Number.isSafeInteger(delta.afterRevision)
      && delta.afterRevision > delta.beforeRevision, 'Unsafe captured delta revision.');
    state = await applyV1StateDelta({ saveId: id, state, delta });
    boundaries.set(delta.afterRevision, delta.afterHash);
  }
  captureAssert(state.stateCustody.revision === manifest.currentRevision
    && await sha256Json(state) === manifest.currentStateHash, 'Captured save state hash differs.');
  const save = assertV1CampaignSave({ ...manifest.saveMetadata, state });
  const history = manifest.branchHistory ? await readVerifiedBranchHistory(adapter, manifest, boundaries) : null;
  if (history) {
    const origin = history.records.at(-1).capture.origin;
    captureAssert(origin.saveId === state.campaignChatBinding?.saveId && origin.campaignId === save.campaignId
      && origin.chatId === state.campaignChatBinding?.chatId, 'Captured origin differs from saved binding.');
    assertCaptureEntity(origin, state.campaignChatBinding);
    const latest = history.records.at(-1);
    const originalSave = assertV1CampaignSave({ ...latest.saveMetadata, state });
    captureAssert(canonicalJson(immutableSaveMetadata(latest.saveMetadata))
      === canonicalJson(immutableSaveMetadata(manifest.saveMetadata)), 'Captured candidate metadata differs from saved ownership.');
    captureAssert(await sha256Json({ expectedManifestHash: latest.expectedManifestHash,
      save: originalSave, capture: reconstructCapturedPayload(history) }) === latest.requestHash,
    'Persisted capture does not match its exact request identity.');
  }
  if (verifyCurrentHead) captureAssert(canonicalJson(await adapter.readJson(V1_STORAGE_PATHS.save(id))) === canonicalJson(manifest),
    'Captured save changed during verification.', 'DIRECTIVE_V1_CAPTURE_HEAD_CHANGED');
  return { save, history, boundaries };
}

/**
 * Read-only recovery under the caller's existing campaign lease. Exact detached
 * publication identities are required; the attempt must have settled with no
 * outstanding writes. This does not retry or repair a write.
 */
export async function resolveV1CapturedPublication(adapter, options = {}) {
  let expected = null, attempted = null, expectedActiveSaveId, operationId;
  try {
    // Preserve malformed but cloneable evidence too, before validation or awaits.
    expected = structuredClone(options.expectedManifest);
    attempted = structuredClone(options.attemptedManifest);
    expectedActiveSaveId = structuredClone(options.expectedActiveSaveId);
    operationId = structuredClone(options.operationId);
    requireAdapter(adapter);
    assertV1CampaignSaveManifest(expected);
    const id = expected.saveId;
    captureAssert(expectedActiveSaveId === null || (typeof expectedActiveSaveId === 'string'
      && safeId(expectedActiveSaveId, 'expectedActiveSaveId') === expectedActiveSaveId),
    'Captured recovery requires an explicit active save identity.');
    captureAssert(typeof operationId === 'string' && operationId.length > 0 && operationId.length <= 180
      && operationId.trim() === operationId, 'Captured recovery requires an exact operation identity.');
    if (attempted !== null) {
      assertV1CampaignSaveManifest(attempted, { saveId: id });
      captureAssert(canonicalJson(expected) !== canonicalJson(attempted),
        'Captured recovery prior and attempted heads must differ.');
    }
    async function assertPointer() {
      const index = await loadIndex(adapter, { create: false });
      const summary = index?.saves?.[id];
      captureAssert(index && Object.hasOwn(index.saves, id) && object(summary)
        && ['id', 'kind', 'slotType', 'campaignId', 'packageId', 'packageVersion', 'parentSaveId', 'createdAt']
          .every(key => summary[key] === expected.saveMetadata[key])
        && index.activeSaveId === expectedActiveSaveId,
      'Captured recovery index ownership changed.', 'DIRECTIVE_V1_CAPTURE_HEAD_CHANGED');
    }
    await assertPointer();
    const current = clone(assertV1CampaignSaveManifest(await adapter.readJson(V1_STORAGE_PATHS.save(id)), { saveId: id }));
    const isAttempted = attempted !== null && canonicalJson(current) === canonicalJson(attempted);
    captureAssert(isAttempted || canonicalJson(current) === canonicalJson(expected),
      'Captured recovery found an unrelated head.', 'DIRECTIVE_V1_CAPTURE_HEAD_CHANGED');
    const verified = await verifyCapturedSaveHead(adapter, current);
    if (isAttempted) {
      const latest = verified.history?.records.at(-1);
      captureAssert(latest && latest.capture.operationId === operationId
        && latest.expectedManifestHash === await sha256Json(expected),
      'Captured recovery operation provenance differs.');
    }
    await assertPointer();
    // The pointer read is asynchronous: the exact manifest read must be last.
    captureAssert(canonicalJson(await adapter.readJson(V1_STORAGE_PATHS.save(id))) === canonicalJson(current),
      'Captured recovery head changed after verification.', 'DIRECTIVE_V1_CAPTURE_HEAD_CHANGED');
    return { publication: isAttempted ? 'committed' : 'not-committed', operationId,
      save: verified.save, manifest: current, ...(isAttempted ? { captureHead: current.branchHistory } : {}) };
  } catch (error) {
    return { publication: 'uncertain', expectedManifest: expected, attemptedManifest: attempted,
      expectedActiveSaveId, operationId,
      error: { code: error?.code || 'DIRECTIVE_V1_CAPTURE_STORAGE_FAILED', message: error?.message || String(error) } };
  }
}

/**
 * Disabled preparation API: callers must own the campaign lease and supply an
 * already detached logical-application anchor. No runtime/host capture or
 * activation occurs here. The result union must not feed legacy void persist.
 */
export async function storeV1CampaignSaveWithCapture(adapter, save, options = {}) {
  let record, expected, capture, activePointer, attempted = null, intent = null, ticketAnchor = null, existingIntent = null;
  const diagnostic = error => ({ code: error?.code || 'DIRECTIVE_V1_CAPTURE_STORAGE_FAILED', message: error?.message || String(error) });
  async function assertPointer() {
    const index = await loadIndex(adapter, { create: false });
    const summary = index?.saves?.[record.id];
    captureAssert(index && Object.hasOwn(index.saves, record.id) && object(summary) && index.activeSaveId === activePointer
      && ['id', 'kind', 'slotType', 'campaignId', 'packageId', 'packageVersion', 'parentSaveId', 'createdAt']
        .every(key => summary[key] === expected.saveMetadata[key]),
      'Captured publication index ownership changed.', 'DIRECTIVE_V1_CAPTURE_HEAD_CHANGED');
    return index;
  }
  async function assertHead(manifest) {
    await assertPointer();
    captureAssert(canonicalJson(await readPublicationIntent(adapter, record.id)) === canonicalJson(ticketAnchor),
      'Captured publication intent ownership changed.');
    captureAssert(canonicalJson(await adapter.readJson(V1_STORAGE_PATHS.save(record.id))) === canonicalJson(manifest),
      'Captured publication head changed.', 'DIRECTIVE_V1_CAPTURE_HEAD_CHANGED');
  }
  async function verified(manifest) {
    const result = await verifyCapturedSaveHead(adapter, manifest);
    await assertHead(manifest);
    return result;
  }
  try {
    requireAdapter(adapter);
    record = clone(assertV1CampaignSave(save));
    expected = clone(assertV1CampaignSaveManifest(options.expectedManifest, { saveId: record.id }));
    capture = structuredClone(options.capture);
    const previousSave = options.previousSave === undefined ? null : clone(assertV1CampaignSave(options.previousSave));
    const suppliedPointer = structuredClone(options.expectedActiveSaveId);
    const index = await loadIndex(adapter, { create: false });
    captureAssert(index && Object.hasOwn(index.saves, record.id), 'Captured publication requires an existing indexed save.');
    activePointer = index.activeSaveId;
    captureAssert(suppliedPointer === undefined || suppliedPointer === activePointer, 'Captured publication active pointer differs.');
    existingIntent = await loadV1CampaignSavePublication(adapter, record.id);
    if (existingIntent) {
      intent = existingIntent;
      assertAuthorityCapture(capture);
      const expectedManifestHash = await sha256Json(expected);
      captureAssert(existingIntent.kind === CAPTURED_PUBLICATION_KIND
        && existingIntent.expectedActiveSaveId === activePointer
        && canonicalJson(existingIntent.expectedManifest) === canonicalJson(expected)
        && existingIntent.operationId === capture.operationId
        && existingIntent.capturedRequestHash === await sha256Json({ expectedManifestHash, save: record, capture }),
      'An unresolved differing publication blocks this captured write.');
      return resolveV1CampaignSavePublication(adapter, { saveId: record.id, requestHash: existingIntent.requestHash });
    }
    const current = clone(assertV1CampaignSaveManifest(await adapter.readJson(V1_STORAGE_PATHS.save(record.id)), { saveId: record.id }));
    const prior = await verified(current);
    assertAuthorityCapture(capture);
    captureAssert(canonicalJson(record) === canonicalJson({ ...campaignSaveMetadata(record), state: record.state }),
      'Captured candidate has unpersisted save fields.');
    const expectedManifestHash = await sha256Json(expected);
    const requestHash = await sha256Json({ expectedManifestHash, save: record, capture });
    if (canonicalJson(current) !== canonicalJson(expected)) {
      const latest = prior.history?.records.at(-1);
      captureAssert(latest && latest.capture.operationId === capture.operationId && latest.requestHash === requestHash
        && latest.expectedManifestHash === expectedManifestHash
        && canonicalJson(reconstructCapturedPayload(prior.history)) === canonicalJson(capture)
        && canonicalJson(prior.save) === canonicalJson(record), 'Captured retry does not match the exact latest operation.', 'DIRECTIVE_V1_CAPTURE_HEAD_CHANGED');
      await verified(current);
      return { publication: 'committed', save: record, manifest: current, captureHead: current.branchHistory, intent: null, acknowledgement: null };
    }
    if (previousSave) captureAssert(canonicalJson(previousSave) === canonicalJson(prior.save), 'Previous save differs from exact captured head.');
    assertCaptureEntity(capture.origin, record.state.campaignChatBinding);
    captureAssert(capture.origin.saveId === record.state.campaignChatBinding?.saveId && capture.origin.campaignId === record.campaignId
      && capture.origin.chatId === record.state.campaignChatBinding?.chatId
      && canonicalJson(record.state.campaignChatBinding) === canonicalJson(prior.save.state.campaignChatBinding)
      && record.campaignId === prior.save.campaignId && record.packageId === prior.save.packageId
      && record.packageVersion === prior.save.packageVersion && record.slotType === prior.save.slotType
      && record.parentSaveId === prior.save.parentSaveId, 'Capture origin/save ownership differs.');
    captureAssert(capture.before.revision === current.currentRevision && capture.before.stateHash === current.currentStateHash
      && capture.after.revision === record.state.stateCustody.revision && capture.after.stateHash === await sha256Json(record.state),
    'Capture does not describe the exact state update.');
    const historyPlan = await prepareBranchHistory({ manifest: current, capture, requestHash, expectedManifestHash, verifiedHistory: prior.history, saveMetadata: campaignSaveMetadata(record) });
    const statePlan = await prepareSaveStateUpdate(adapter, record, current, prior.save);
    for (const item of historyPlan.writes) {
      const existingObject = await readOrNull(adapter, item.ref.path);
      captureAssert(existingObject === null || canonicalJson(existingObject) === canonicalJson(item.value),
        'An immutable history path already contains different bytes.', 'DIRECTIVE_V1_CAPTURE_IMMUTABLE_CONFLICT');
    }
    attempted = { ...statePlan.nextManifest, branchHistory: historyPlan.head };
    assertV1CampaignSaveManifest(attempted, { saveId: record.id });
    const identity = { kind: CAPTURED_PUBLICATION_KIND, version: 1, saveId: record.id,
      expectedActiveSaveId: activePointer, expectedManifest: expected, attemptedManifest: attempted,
      operationId: capture.operationId, capturedRequestHash: requestHash };
    intent = { ...identity, requestHash: await sha256Json(identity) };
    await assertCapturedPublicationIntent(intent, record.id);
    await assertHead(expected);
    await verifiedWrite(adapter, V1_STORAGE_PATHS.publicationIntent(record.id), intent, value => value);
    ticketAnchor = intent;
    await assertHead(expected);
    for (const item of historyPlan.writes) {
      const existingObject = await readOrNull(adapter, item.ref.path);
      if (existingObject !== null) {
        captureAssert(canonicalJson(existingObject) === canonicalJson(item.value),
          'An immutable history path already contains different bytes.', 'DIRECTIVE_V1_CAPTURE_IMMUTABLE_CONFLICT');
      } else {
        await assertHead(expected);
        await verifiedWrite(adapter, item.ref.path, item.value, value => value);
      }
    }
    await assertHead(expected);
    await writePreparedSegments(adapter, statePlan.writes, record.id);
    await assertHead(expected);
    await verifiedWrite(adapter, V1_STORAGE_PATHS.save(record.id), attempted,
      value => assertV1CampaignSaveManifest(value, { saveId: record.id }));
    await verified(attempted);
    let acknowledgement = null;
    const latestIndex = await assertPointer();
    try {
      latestIndex.saves[record.id] = saveSummary(record);
      await writeIndex(adapter, latestIndex, record.updatedAt);
    } catch (error) { acknowledgement = diagnostic(error); }
    await assertHead(attempted);
    return { publication: 'committed', save: record, manifest: attempted, captureHead: attempted.branchHistory, intent, acknowledgement };
  } catch (error) {
    try {
      if (!record || !expected || activePointer === undefined || existingIntent) throw error;
      const storedIntent = await readPublicationIntent(adapter, record.id);
      if (storedIntent !== null) {
        captureAssert(intent && canonicalJson(storedIntent) === canonicalJson(intent), 'Captured recovery intent differs.');
        const resolved = await resolveV1CampaignSavePublication(adapter, { saveId: record.id, requestHash: intent.requestHash });
        if (['committed', 'not-committed'].includes(resolved.publication)) return { ...resolved, acknowledgement: diagnostic(error), error: diagnostic(error) };
        throw error;
      }
      ticketAnchor = null;
      const current = await adapter.readJson(V1_STORAGE_PATHS.save(record.id));
      if (attempted && canonicalJson(current) === canonicalJson(attempted)) {
        await verified(attempted);
        // A durable captured ticket must precede any attempted-head publication.
        throw error;
      }
      if (canonicalJson(current) === canonicalJson(expected)) {
        const prior = await verified(expected);
        return { publication: 'not-committed', save: prior.save, manifest: expected, expectedManifest: expected, intent: null, error: diagnostic(error) };
      }
    } catch { /* Preserve ambiguous publication evidence; never repair or guess. */ }
    return { publication: 'uncertain', expectedManifest: expected || null, attemptedManifest: attempted, intent, error: diagnostic(error) };
  }
}

async function prepareSaveStateUpdate(adapter, record, manifest, previous) {
  const writes = [];
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
    writes.push({ path: segmentPath, value: segment });
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

  return { nextManifest, writes };
}

const ACTIVE_PUBLICATION_KIND = 'directive.activeSavePublication.v1';
const CAPTURED_PUBLICATION_KIND = 'directive.capturedSavePublication.v1';
const publicationDiagnostic = error => ({ code: error?.code || 'DIRECTIVE_V1_SAVE_PUBLICATION_FAILED', message: error?.message || String(error),
  ...(error?.publicationIntentReadFailed === true ? { publicationIntentReadFailed: true } : {}) });

async function readPublicationIntent(adapter, saveId) {
  let value;
  try {
    value = await adapter.readJson(V1_STORAGE_PATHS.publicationIntent(saveId));
  } catch (error) {
    if (missing(error)) return null;
    throw Object.assign(new Error(error?.message || String(error)), {
      code: error?.code || 'DIRECTIVE_V1_SAVE_PUBLICATION_FAILED', publicationIntentReadFailed: true,
    });
  }
  captureAssert(value !== null && value !== undefined, 'Invalid empty active-save publication intent.');
  return structuredClone(value);
}

async function assertNoActivePublication(adapter, saveId) {
  if (await readPublicationIntent(adapter, saveId) !== null) {
    throw saveStorageError('DIRECTIVE_V1_STATE_PERSISTENCE_UNCERTAIN', 'An active-save publication must be recovered before this save can be changed.');
  }
}

async function assertActivePublicationIntent(intent, saveId) {
  const fields = ['kind', 'version', 'saveId', 'requestHash', 'expectedActiveSaveId', 'expectedManifest', 'attemptedManifest'];
  captureAssert(object(intent) && Object.keys(intent).length === fields.length && fields.every(key => Object.hasOwn(intent, key))
    && intent.kind === ACTIVE_PUBLICATION_KIND && intent.version === 1 && intent.saveId === saveId
    && typeof saveId === 'string' && safeId(saveId, 'saveId') === saveId && intent.expectedActiveSaveId === saveId,
  'Invalid active-save publication intent.');
  const before = assertV1CampaignSaveManifest(intent.expectedManifest, { saveId });
  const after = assertV1CampaignSaveManifest(intent.attemptedManifest, { saveId });
  captureAssert(!before.branchHistory && !after.branchHistory && before.saveMetadata.slotType === 'active'
    && canonicalJson(immutableSaveMetadata(before.saveMetadata)) === canonicalJson(immutableSaveMetadata(after.saveMetadata))
    && canonicalJson(before.base) === canonicalJson(after.base)
    && canonicalJson(before.historyInheritance ?? null) === canonicalJson(after.historyInheritance ?? null)
    && canonicalJson(before) !== canonicalJson(after)
    && ((before.currentStateHash === after.currentStateHash && before.currentRevision === after.currentRevision)
      || (before.currentStateHash !== after.currentStateHash && after.currentRevision === before.currentRevision + 1)),
  'Active-save publication ownership or revision differs.');
  if (before.currentStateHash === after.currentStateHash) {
    captureAssert(canonicalJson({ ...before, saveMetadata: after.saveMetadata, updatedAt: after.updatedAt }) === canonicalJson(after),
      'An unchanged-state publication may only update metadata.');
  }
  const { requestHash, ...identity } = intent;
  captureAssert(typeof requestHash === 'string' && SHA256.test(requestHash) && await sha256Json(identity) === requestHash,
    'Active-save publication request hash differs.');
  return intent;
}

export async function loadV1ActiveCampaignSavePublication(adapter, saveId) {
  requireAdapter(adapter);
  const id = safeId(saveId, 'saveId');
  const intent = await readPublicationIntent(adapter, id);
  return intent === null ? null : assertActivePublicationIntent(intent, id);
}

async function assertCapturedPublicationIntent(intent, saveId) {
  const fields = ['kind', 'version', 'saveId', 'requestHash', 'expectedActiveSaveId', 'expectedManifest', 'attemptedManifest', 'operationId', 'capturedRequestHash'];
  captureAssert(object(intent) && Object.keys(intent).length === fields.length && fields.every(key => Object.hasOwn(intent, key))
    && intent.kind === CAPTURED_PUBLICATION_KIND && intent.version === 1 && intent.saveId === saveId
    && typeof saveId === 'string' && safeId(saveId, 'saveId') === saveId
    && (intent.expectedActiveSaveId === null || (typeof intent.expectedActiveSaveId === 'string'
      && safeId(intent.expectedActiveSaveId, 'expectedActiveSaveId') === intent.expectedActiveSaveId))
    && typeof intent.operationId === 'string' && intent.operationId.length > 0 && intent.operationId.length <= 180
    && intent.operationId.trim() === intent.operationId && typeof intent.capturedRequestHash === 'string'
    && SHA256.test(intent.capturedRequestHash), 'Invalid captured publication intent.');
  const before = assertV1CampaignSaveManifest(intent.expectedManifest, { saveId });
  const after = assertV1CampaignSaveManifest(intent.attemptedManifest, { saveId });
  captureLimit(before.segments.length <= V1_BRANCH_HISTORY_LIMITS.segments && after.segments.length <= V1_BRANCH_HISTORY_LIMITS.segments
    && captureBytes(intent) <= 16 * 1024 * 1024, 'Captured publication intent exceeds verification bounds.');
  captureAssert(after.branchHistory && canonicalJson(before.base) === canonicalJson(after.base)
    && canonicalJson(before.historyInheritance ?? null) === canonicalJson(after.historyInheritance ?? null)
    && canonicalJson(immutableSaveMetadata(before.saveMetadata)) === canonicalJson(immutableSaveMetadata(after.saveMetadata))
    && after.branchHistory.recordCount === (before.branchHistory?.recordCount || 0) + 1,
  'Captured publication intent ownership or history differs.');
  if (before.branchHistory) {
    captureAssert(after.currentRevision === before.currentRevision + 1
      && after.branchHistory.floorRevision === before.branchHistory.floorRevision
      && after.branchHistory.floorStateHash === before.branchHistory.floorStateHash,
    'Captured publication intent does not extend the existing history.');
  } else {
    captureAssert(canonicalJson({ ...before, saveMetadata: after.saveMetadata, updatedAt: after.updatedAt, branchHistory: after.branchHistory }) === canonicalJson(after),
      'Captured baseline must preserve the exact state chain.');
  }
  const { requestHash, ...identity } = intent;
  captureAssert(typeof requestHash === 'string' && SHA256.test(requestHash) && await sha256Json(identity) === requestHash,
    'Captured publication intent request hash differs.');
  return intent;
}

/** Read-only tagged publication lookup; both protocols share one ownership path. */
export async function loadV1CampaignSavePublication(adapter, saveId) {
  requireAdapter(adapter);
  const id = safeId(saveId, 'saveId');
  const intent = await readPublicationIntent(adapter, id);
  if (intent === null) return null;
  return intent.kind === CAPTURED_PUBLICATION_KIND
    ? assertCapturedPublicationIntent(intent, id) : assertActivePublicationIntent(intent, id);
}

async function assertCapturedIntentHead(adapter, intent, manifest) {
  const index = await loadIndex(adapter, { create: false });
  const summary = index?.saves?.[intent.saveId];
  captureAssert(index && Object.hasOwn(index.saves, intent.saveId) && object(summary)
    && index.activeSaveId === intent.expectedActiveSaveId
    && ['id', 'kind', 'slotType', 'campaignId', 'packageId', 'packageVersion', 'parentSaveId', 'createdAt']
      .every(key => summary[key] === intent.expectedManifest.saveMetadata[key]), 'Captured intent index ownership changed.');
  captureAssert(canonicalJson(await readPublicationIntent(adapter, intent.saveId)) === canonicalJson(intent), 'Captured intent ownership changed.');
  captureAssert(canonicalJson(await adapter.readJson(V1_STORAGE_PATHS.save(intent.saveId))) === canonicalJson(manifest),
    'Captured intent manifest changed.');
}

/** Read-only restart resolution under a caller-owned lease after writes settle. */
export async function resolveV1CampaignSavePublication(adapter, options = {}) {
  let intent = null;
  try {
    const { saveId, requestHash } = structuredClone(options);
    captureAssert(typeof saveId === 'string' && safeId(saveId, 'saveId') === saveId
      && typeof requestHash === 'string' && SHA256.test(requestHash), 'Invalid publication recovery identity.');
    requireAdapter(adapter);
    intent = await readPublicationIntent(adapter, saveId);
    if (intent === null) return { publication: 'none', intent: null };
    if (intent.kind === CAPTURED_PUBLICATION_KIND) await assertCapturedPublicationIntent(intent, saveId);
    else await assertActivePublicationIntent(intent, saveId);
    captureAssert(intent.requestHash === requestHash, 'Another publication owns this intent.');
    if (intent.kind === ACTIVE_PUBLICATION_KIND) return resolveV1ActiveCampaignSavePublication(adapter, { saveId, requestHash });
    const result = await resolveV1CapturedPublication(adapter, intent);
    if (result.publication === 'uncertain') return { ...result, intent };
    if (result.publication === 'committed') {
      const verified = await verifyCapturedSaveHead(adapter, result.manifest);
      const latest = verified.history.records.at(-1);
      captureAssert(latest.requestHash === intent.capturedRequestHash
        && canonicalJson(latest.saveMetadata) === canonicalJson(intent.attemptedManifest.saveMetadata)
        && latest.capture.before.revision === intent.expectedManifest.currentRevision
        && latest.capture.before.stateHash === intent.expectedManifest.currentStateHash,
      'Captured intent request or prior boundary differs.');
      // A pending ticket protects the prior chain too. Verify it independently,
      // then reproduce the exact state/history plans without publishing anything.
      const priorVerified = await verifyCapturedSaveHead(adapter, intent.expectedManifest, { verifyCurrentHead: false });
      const prior = priorVerified.history;
      captureAssert(canonicalJson(verified.history.records.slice(0, -1)) === canonicalJson(prior?.records || []),
        'Captured intent history prefix differs.');
      const plan = await prepareBranchHistory({ manifest: intent.expectedManifest, capture: reconstructCapturedPayload(verified.history),
        requestHash: latest.requestHash, expectedManifestHash: latest.expectedManifestHash, verifiedHistory: prior, saveMetadata: latest.saveMetadata });
      captureAssert(canonicalJson(plan.head) === canonicalJson(intent.attemptedManifest.branchHistory), 'Captured intent history linkage differs.');
      const statePlan = await prepareSaveStateUpdate(adapter, verified.save, intent.expectedManifest, priorVerified.save);
      captureAssert(canonicalJson({ ...statePlan.nextManifest, branchHistory: plan.head }) === canonicalJson(intent.attemptedManifest),
        'Captured intent state chain does not extend its exact prior manifest.');
    }
    await assertCapturedIntentHead(adapter, intent, result.manifest);
    return { ...result, intent, acknowledgement: null };
  } catch (error) {
    return { publication: 'uncertain', intent, expectedManifest: intent?.expectedManifest || null,
      attemptedManifest: intent?.attemptedManifest || null, error: publicationDiagnostic(error) };
  }
}

/** Acknowledge a tagged exact verified outcome, deleting only its own ticket. */
export async function acknowledgeV1CampaignSavePublication(adapter, options = {}) {
  const identity = structuredClone(options);
  let result = await resolveV1CampaignSavePublication(adapter, identity);
  if (!['committed', 'not-committed'].includes(result.publication)) return { ...result, acknowledged: false };
  if (result.intent.kind === ACTIVE_PUBLICATION_KIND) return acknowledgeV1ActiveCampaignSavePublication(adapter, identity);
  const verifiedAgain = await resolveV1CampaignSavePublication(adapter, identity);
  if (!['committed', 'not-committed'].includes(verifiedAgain.publication)
    || canonicalJson(verifiedAgain.intent) !== canonicalJson(result.intent) || canonicalJson(verifiedAgain.manifest) !== canonicalJson(result.manifest)) {
    return { publication: 'uncertain', intent: result.intent, acknowledged: false, error: publicationDiagnostic(new Error('Captured acknowledgement ownership changed.')) };
  }
  result = verifiedAgain;
  try {
    await remove(adapter, V1_STORAGE_PATHS.publicationIntent(identity.saveId));
    captureAssert(await readPublicationIntent(adapter, identity.saveId) === null, 'Captured intent deletion was not acknowledged.');
    return { ...result, acknowledged: true };
  } catch (error) {
    try {
      if (await readPublicationIntent(adapter, identity.saveId) === null) return { ...result, acknowledged: true, acknowledgement: publicationDiagnostic(error) };
    } catch { /* An unreadable ticket cannot confirm removal. */ }
    return { ...result, acknowledged: false, acknowledgement: publicationDiagnostic(error) };
  }
}

async function assertActivePublicationPointer(adapter, manifest) {
  const index = await loadIndex(adapter, { create: false });
  const summary = index?.saves?.[manifest.saveId];
  captureAssert(index && Object.hasOwn(index.saves, manifest.saveId) && object(summary)
    && index.activeSaveId === manifest.saveId
    && ['id', 'kind', 'slotType', 'campaignId', 'packageId', 'packageVersion', 'parentSaveId', 'createdAt']
      .every(key => summary[key] === manifest.saveMetadata[key]),
  'Active-save publication index ownership changed.', 'DIRECTIVE_V1_SAVE_CONCURRENT_UPDATE');
  return index;
}

async function verifyActivePublicationHead(adapter, manifest, intent) {
  await assertActivePublicationPointer(adapter, manifest);
  const verified = await verifyCapturedSaveHead(adapter, manifest);
  if (intent && canonicalJson(manifest) === canonicalJson(intent.attemptedManifest)) {
    captureAssert(verified.boundaries.get(intent.expectedManifest.currentRevision) === intent.expectedManifest.currentStateHash,
      'Active-save publication does not extend the expected state boundary.');
  }
  await assertActivePublicationPointer(adapter, manifest);
  captureAssert(canonicalJson(await readPublicationIntent(adapter, manifest.saveId)) === canonicalJson(intent),
    'Active-save publication intent changed.', 'DIRECTIVE_V1_SAVE_CONCURRENT_UPDATE');
  captureAssert(canonicalJson(await adapter.readJson(V1_STORAGE_PATHS.save(manifest.saveId))) === canonicalJson(manifest),
    'Active-save publication head changed.', 'DIRECTIVE_V1_SAVE_CONCURRENT_UPDATE');
  return verified.save;
}

/** Read-only authority inspection under the caller's existing campaign lease. */
export async function loadVerifiedV1ActiveCampaignAuthority(adapter, options = {}) {
  const { saveId, expectedSave = null, expectedManifest = null } = structuredClone(options);
  requireAdapter(adapter);
  captureAssert(typeof saveId === 'string' && safeId(saveId, 'saveId') === saveId,
    'Verified active-save authority requires an exact save identity.');
  await assertNoActivePublication(adapter, saveId);
  const manifest = clone(assertV1CampaignSaveManifest(await adapter.readJson(V1_STORAGE_PATHS.save(saveId)), { saveId }));
  captureAssert(manifest.saveMetadata.slotType === 'active', 'Verified authority requires an active save.');
  if (expectedManifest !== null) {
    assertV1CampaignSaveManifest(expectedManifest, { saveId });
    captureAssert(canonicalJson(expectedManifest) === canonicalJson(manifest), 'Verified authority manifest differs from the expected head.');
  }
  const save = await verifyActivePublicationHead(adapter, manifest, null);
  if (expectedSave !== null) {
    assertV1CampaignSave(expectedSave);
    captureAssert(canonicalJson(expectedSave) === canonicalJson(save), 'Verified authority save differs from the expected record.');
  }
  return { save, manifest };
}

/** Read-only; caller owns the campaign lease and all prior writes have settled. */
export async function resolveV1ActiveCampaignSavePublication(adapter, options = {}) {
  let intent = null;
  try {
    const { saveId, requestHash } = structuredClone(options);
    requireAdapter(adapter);
    captureAssert(typeof saveId === 'string' && safeId(saveId, 'saveId') === saveId
      && typeof requestHash === 'string' && SHA256.test(requestHash), 'Invalid active-save recovery identity.');
    intent = await readPublicationIntent(adapter, saveId);
    if (intent === null) return { publication: 'none', intent: null };
    await assertActivePublicationIntent(intent, saveId);
    captureAssert(intent.requestHash === requestHash, 'Another active-save publication owns this intent.');
    const current = clone(await adapter.readJson(V1_STORAGE_PATHS.save(saveId)));
    const committed = canonicalJson(current) === canonicalJson(intent.attemptedManifest);
    captureAssert(committed || canonicalJson(current) === canonicalJson(intent.expectedManifest), 'Active-save publication found an unrelated head.');
    const save = await verifyActivePublicationHead(adapter, current, intent);
    return { publication: committed ? 'committed' : 'not-committed', save, manifest: current, intent, acknowledgement: null };
  } catch (error) {
    return { publication: 'uncertain', intent, expectedManifest: intent?.expectedManifest || null,
      attemptedManifest: intent?.attemptedManifest || null, error: publicationDiagnostic(error) };
  }
}

/** Remove only the exact verified intent, never campaign or state objects. */
export async function acknowledgeV1ActiveCampaignSavePublication(adapter, options = {}) {
  const identity = structuredClone(options);
  const result = await resolveV1ActiveCampaignSavePublication(adapter, identity);
  if (!['committed', 'not-committed'].includes(result.publication)) return { ...result, acknowledged: false };
  try {
    await verifyActivePublicationHead(adapter, result.manifest, result.intent);
  } catch (error) {
    return { publication: 'uncertain', intent: result.intent, acknowledged: false, error: publicationDiagnostic(error) };
  }
  try {
    await remove(adapter, V1_STORAGE_PATHS.publicationIntent(identity.saveId));
    captureAssert(await readPublicationIntent(adapter, identity.saveId) === null, 'Active-save publication intent deletion was not acknowledged.');
    return { ...result, acknowledged: true };
  } catch (error) {
    try {
      if (await readPublicationIntent(adapter, identity.saveId) === null) {
        return { ...result, acknowledged: true, acknowledgement: publicationDiagnostic(error) };
      }
    } catch { /* A failed read cannot acknowledge intent removal. */ }
    return { ...result, acknowledged: false, acknowledgement: publicationDiagnostic(error) };
  }
}

/** Existing ordinary active saves only. Caller owns the campaign lease. */
export async function storeV1ActiveCampaignSaveWithOutcome(adapter, save, options = {}) {
  let intent = null, expected = null, attempted = null, record = null, priorVerified = false;
  try {
    record = structuredClone(save);
    const detached = structuredClone(options);
    expected = detached.expectedManifest;
    requireAdapter(adapter);
    assertV1CampaignSave(record);
    captureAssert(canonicalJson(record) === canonicalJson({ ...campaignSaveMetadata(record), state: record.state }),
      'Active-save candidate contains unpersisted fields.');
    assertV1CampaignSaveManifest(expected, { saveId: record.id });
    const previous = assertV1CampaignSave(detached.previousSave);
    captureAssert(record.slotType === 'active' && detached.expectedActiveSaveId === record.id && !expected.branchHistory
      && canonicalJson(immutableSaveMetadata(campaignSaveMetadata(record))) === canonicalJson(immutableSaveMetadata(expected.saveMetadata))
      && canonicalJson(campaignSaveMetadata(previous)) === canonicalJson(expected.saveMetadata)
      && previous.state.stateCustody.revision === expected.currentRevision && await sha256Json(previous.state) === expected.currentStateHash,
    'Active-save publication requires the exact ordinary prior active save.');
    const existing = await loadV1ActiveCampaignSavePublication(adapter, record.id);
    if (existing) {
      intent = existing;
      captureAssert(canonicalJson(existing.expectedManifest) === canonicalJson(expected)
        && canonicalJson(existing.attemptedManifest.saveMetadata) === canonicalJson(campaignSaveMetadata(record))
        && existing.attemptedManifest.currentStateHash === await sha256Json(record.state)
        && existing.attemptedManifest.currentRevision === record.state.stateCustody.revision,
      'An unresolved differing active-save publication blocks this write.');
      return resolveV1ActiveCampaignSavePublication(adapter, { saveId: record.id, requestHash: existing.requestHash });
    }
    await verifyActivePublicationHead(adapter, expected, null);
    priorVerified = true;
    const plan = await prepareSaveStateUpdate(adapter, record, expected, previous);
    attempted = plan.nextManifest;
    if (canonicalJson(expected) === canonicalJson(attempted)) {
      const verifiedSave = await verifyActivePublicationHead(adapter, expected, null);
      return { publication: 'committed', save: verifiedSave, manifest: expected, intent: null, acknowledgement: null };
    }
    const identity = { kind: ACTIVE_PUBLICATION_KIND, version: 1, saveId: record.id,
      expectedActiveSaveId: record.id, expectedManifest: expected, attemptedManifest: attempted };
    intent = { ...identity, requestHash: await sha256Json(identity) };
    await assertActivePublicationIntent(intent, record.id);
    await verifyActivePublicationHead(adapter, expected, null);
    await verifiedWrite(adapter, V1_STORAGE_PATHS.publicationIntent(record.id), intent, value => value);
    await verifyActivePublicationHead(adapter, expected, intent);
    await writePreparedSegments(adapter, plan.writes, record.id);
    await verifyActivePublicationHead(adapter, expected, intent);
    await verifiedWrite(adapter, V1_STORAGE_PATHS.save(record.id), attempted, value => assertV1CampaignSaveManifest(value, { saveId: record.id }));
    const verifiedSave = await verifyActivePublicationHead(adapter, attempted, intent);
    let acknowledgement = null;
    try {
      const index = await assertActivePublicationPointer(adapter, attempted);
      index.saves[record.id] = saveSummary(verifiedSave);
      await writeIndex(adapter, index, record.updatedAt);
    } catch (error) { acknowledgement = publicationDiagnostic(error); }
    await verifyActivePublicationHead(adapter, attempted, intent);
    return { publication: 'committed', save: verifiedSave, manifest: attempted, intent, acknowledgement };
  } catch (error) {
    if (priorVerified && record && expected) {
      try {
        const persisted = await readPublicationIntent(adapter, record.id);
        if (intent && canonicalJson(persisted) === canonicalJson(intent)) {
          const resolved = await resolveV1ActiveCampaignSavePublication(adapter, { saveId: record.id, requestHash: intent.requestHash });
          if (['committed', 'not-committed'].includes(resolved.publication)) return { ...resolved, acknowledgement: publicationDiagnostic(error) };
        } else if (persisted === null) {
          const verifiedSave = await verifyActivePublicationHead(adapter, expected, null);
          return { publication: 'not-committed', save: verifiedSave, manifest: expected, intent: null, acknowledgement: publicationDiagnostic(error) };
        }
      } catch { /* Unverifiable authority stays uncertain. */ }
    }
    return { publication: 'uncertain', intent, expectedManifest: expected, attemptedManifest: attempted, error: publicationDiagnostic(error) };
  }
}

async function writePreparedSegments(adapter, writes, saveId) {
  for (const item of writes) await verifiedWrite(adapter, item.path, item.value,
    value => assertV1CampaignSaveSegment(value, { saveId }),
    'DIRECTIVE_V1_SAVE_SEGMENT_WRITE_VERIFICATION_FAILED', 'DIRECTIVE_V1_SAVE_SEGMENT_WRITE_FAILED');
}

/** Creation only: the caller owns the campaign lease and its durable timeline journal.
 * Authority commitment and index discoverability are deliberately separate outcomes.
 * Every partial object is retained for an exact retry; this function never activates.
 */
export async function storeV1CampaignSaveWithInheritance(adapter, save, options = {}) {
  requireAdapter(adapter);
  const record = detachInheritanceJson(save);
  const detachedOptions = detachInheritanceJson(options, 0, true);
  const inheritance = detachedOptions.inheritance;
  const expectedActiveSaveId = detachedOptions.expectedActiveSaveId;
  const runtimeAssets = detachedOptions.runtimeAssets;
  assertV1CampaignSave(record);
  inheritanceAssert(canonicalJson(record) === canonicalJson({ ...campaignSaveMetadata(record), state: record.state }), 'Inherited candidate contains unpersisted fields.');
  inheritanceAssert(expectedActiveSaveId === null || (typeof expectedActiveSaveId === 'string'
    && safeId(expectedActiveSaveId, 'expectedActiveSaveId') === expectedActiveSaveId), 'An exact expected active pointer is required.');
  inheritanceAssert(record.id !== expectedActiveSaveId, 'Inheritance creates only inactive targets.');
  const manifestPath = V1_STORAGE_PATHS.save(record.id), basePath = V1_STORAGE_PATHS.saveBase(record.id);
  const MISSING = Symbol('missing inherited target');
  async function optional(path) {
    try { return await adapter.readJson(path); }
    catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'DIRECTIVE_FAKE_HOST_FILE_MISSING'
        || error?.name === 'NotFoundError' || error?.status === 404) return MISSING;
      throw error;
    }
  }
  async function pointer() {
    await assertNoActivePublication(adapter, record.id);
    if (expectedActiveSaveId !== null) await assertNoActivePublication(adapter, expectedActiveSaveId);
    const index = assertV1StorageIndex(await adapter.readJson(V1_STORAGE_PATHS.index));
    inheritanceAssert(index.activeSaveId === expectedActiveSaveId, 'Active pointer changed during inherited creation.');
    if (Object.hasOwn(index.saves, record.id)) {
      const row = index.saves[record.id];
      inheritanceAssert(row && ['id','kind','slotType','campaignId','packageId','packageVersion','parentSaveId','createdAt']
        .every(key => row[key] === record[key]), 'Existing index membership conflicts with inherited target.');
    }
    return index;
  }
  await pointer();
  await verifyV1HistoryInheritance(adapter, record, inheritance, runtimeAssets, detachedOptions.sourceSnapshot);
  const stateHash = await sha256Json(record.state);
  const base = createV1CampaignSaveBase({ saveId: record.id, state: record.state, stateHash });
  const attemptedManifest = { ...createV1CampaignSaveManifest({ save: record, stateHash }), historyInheritance: inheritance };
  assertV1CampaignSaveManifest(attemptedManifest, { saveId: record.id });
  const same = (a, b) => a !== MISSING && b !== MISSING && canonicalJson(a) === canonicalJson(b);
  async function objects() {
    const currentBase = await optional(basePath), currentManifest = await optional(manifestPath);
    inheritanceAssert(currentBase === MISSING || same(currentBase, base), 'Existing target base conflicts with inherited creation.');
    inheritanceAssert(currentManifest === MISSING || same(currentManifest, attemptedManifest), 'Existing target manifest conflicts with inherited creation.');
    inheritanceAssert(currentManifest === MISSING || currentBase !== MISSING, 'Existing target manifest has no verified base.');
    return { currentBase, currentManifest };
  }
  const initialObjects = await objects();
  const initialIndex = await pointer();
  inheritanceAssert(initialObjects.currentManifest !== MISSING || !Object.hasOwn(initialIndex.saves, record.id), 'Indexed target has no verified manifest.');
  let phase = 'base', error = null;
  try {
    let existing = await objects();
    if (existing.currentBase === MISSING) {
      await pointer();
      await adapter.writeJson(basePath, base);
    }
    inheritanceAssert(same(await adapter.readJson(basePath), base), 'Inherited base readback differs.');
    phase = 'manifest';
    existing = await objects();
    await pointer();
    if (existing.currentManifest === MISSING) await adapter.writeJson(manifestPath, attemptedManifest);
    inheritanceAssert(same(await adapter.readJson(manifestPath), attemptedManifest), 'Inherited manifest readback differs.');
    phase = 'index';
    const index = await pointer();
    inheritanceAssert(same(await adapter.readJson(basePath), base)
      && same(await adapter.readJson(manifestPath), attemptedManifest), 'Inherited authority changed before index publication.');
    const summary = saveSummary(record);
    if (!Object.hasOwn(index.saves, record.id) || !same(index.saves[record.id], summary)) {
      index.saves[record.id] = summary;
      // Refresh pointer at the last asynchronous boundary before index dispatch.
      const fresh = await pointer();
      inheritanceAssert(same({ ...fresh, saves: { ...fresh.saves, [record.id]: summary } }, index), 'Index changed during inherited creation.');
      await writeIndex(adapter, index, record.updatedAt);
    }
  } catch (caught) { error = caught; }
  const evidence = { attemptedManifest: clone(attemptedManifest), inheritance: clone(inheritance), phase, ...(error ? { error } : {}) };
  try {
    const currentBase = await optional(basePath), currentManifest = await optional(manifestPath);
    if (currentManifest === MISSING) return { ...evidence, publication: 'not-committed', indexPending: true };
    if (!same(currentManifest, attemptedManifest) || !same(currentBase, base)) return { ...evidence, publication: 'uncertain', indexPending: true };
    let indexPending = true;
    try {
      const index = assertV1StorageIndex(await adapter.readJson(V1_STORAGE_PATHS.index));
      indexPending = index.activeSaveId !== expectedActiveSaveId || !Object.hasOwn(index.saves, record.id) || !same(index.saves[record.id], saveSummary(record));
    } catch (caught) { if (!error) evidence.error = caught; }
    inheritanceAssert(same(await adapter.readJson(manifestPath), attemptedManifest), 'Inherited head changed during outcome verification.');
    return { ...evidence, publication: 'committed', indexPending, save: clone(record) };
  } catch (caught) {
    return { ...evidence, publication: 'uncertain', indexPending: true, error: error || caught };
  }
}

export async function storeV1CampaignSave(adapter, save, {
  makeActive = save?.slotType === 'active',
  previousSave = null,
} = {}) {
  requireAdapter(adapter);
  const record = clone(assertV1CampaignSave(save));
  await assertNoActivePublication(adapter, record.id);
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
    if (manifest.branchHistory) {
      if (canonicalJson(record.state) !== canonicalJson(previous.state)) {
        throw captureError('DIRECTIVE_V1_CAPTURE_REQUIRED', 'A captured save requires explicit captured state publication.');
      }
      await verifyCapturedSaveHead(adapter, manifest);
      captureAssert(canonicalJson(immutableSaveMetadata(campaignSaveMetadata(record)))
        === canonicalJson(immutableSaveMetadata(manifest.saveMetadata)), 'Captured metadata updates may only rename or update acknowledgement time.');
    }
    const { nextManifest, writes } = await prepareSaveStateUpdate(adapter, record, manifest, previous);
    assertV1CampaignSaveManifest(nextManifest, { saveId: record.id });
    await writePreparedSegments(adapter, writes, record.id);
    if (manifest.branchHistory) {
      const currentIndex = await loadIndex(adapter, { create: false });
      captureAssert(currentIndex && currentIndex.activeSaveId === index.activeSaveId
        && canonicalJson(await adapter.readJson(manifestPath)) === canonicalJson(manifest),
      'Captured metadata ownership changed before publication.', 'DIRECTIVE_V1_CAPTURE_HEAD_CHANGED');
    }
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

export async function loadV1CampaignSave(adapter, saveId, { makeActive = false, now = null, expectedSave = null, expectedManifest = null } = {}) {
  const expected = expectedSave === null ? null : clone(assertV1CampaignSave(expectedSave));
  const expectedHead = expectedManifest === null ? null : clone(expectedManifest);
  const id = safeId(saveId, 'saveId');
  const manifestRecord = await readOrNull(requireAdapter(adapter), V1_STORAGE_PATHS.save(id));
  if (!manifestRecord) throw new Error(`V1 campaign save "${id}" was not found.`);
  if (manifestRecord.kind !== V1_CAMPAIGN_SAVE_MANIFEST_KIND) {
    const error = new Error('Directive V1 rejects monolithic or unsupported campaign-save layouts.');
    error.code = 'DIRECTIVE_V1_SAVE_LAYOUT_UNSUPPORTED';
    throw error;
  }
  const { save } = await hydrateManifest(adapter, manifestRecord, id);
  if ((expected && canonicalJson(save) !== canonicalJson(expected))
    || (expectedHead && canonicalJson(manifestRecord) !== canonicalJson(expectedHead))) {
    throw saveStorageError('DIRECTIVE_V1_STATE_PERSISTENCE_CONFLICT', 'The selected target changed before activation.');
  }
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
    if ((expected || expectedHead) && canonicalJson(await adapter.readJson(V1_STORAGE_PATHS.save(id))) !== canonicalJson(manifestRecord)) {
      throw saveStorageError('DIRECTIVE_V1_STATE_PERSISTENCE_CONFLICT', 'The selected target changed during activation.');
    }
    await writeIndex(adapter, index, now || save.updatedAt);
  }
  return save;
}

/**
 * Read an exact storage/stateCustody revision from a captured save manifest.
 * This is revision coverage only: it provides no transcript chronology, ancestry
 * retention, or branch authorization. The captured manifest must still be current
 * before and after verification; its mutable active segment is not an archive.
 * No index lookup, repair, activation, or storage write occurs.
 */
export async function loadV1CampaignStateAtRevision(adapter, saveId, { expectedManifest, revision } = {}) {
  const id = safeId(saveId, 'saveId');
  if (!adapter || typeof adapter.readJson !== 'function'
    || !Number.isInteger(revision) || revision < 0) {
    throw saveStorageError('DIRECTIVE_V1_HISTORY_REQUEST_INVALID',
      'Historical state requires a readable adapter and a nonnegative state-custody revision.');
  }
  const capturedManifest = clone(assertV1CampaignSaveManifest(expectedManifest, { saveId: id }));
  const capturedJson = canonicalJson(capturedManifest);
  async function assertCapturedHead() {
    const current = await readOrNull(adapter, V1_STORAGE_PATHS.save(id));
    if (!current || canonicalJson(current) !== capturedJson) {
      throw saveStorageError('DIRECTIVE_V1_HISTORY_HEAD_CHANGED',
        'The captured campaign-save head is no longer current.', { saveId: id });
    }
  }
  await assertCapturedHead();
  const { manifest, base, deltas } = await readVerifiedSaveChain(adapter, capturedManifest, id);
  let state = base.state;
  let selectedState = revision === base.revision ? clone(state) : null;
  let selectedHash = selectedState ? base.stateHash : null;
  const availableRevisions = [base.revision];
  for (const delta of deltas) {
    if (!Number.isInteger(delta.afterRevision) || delta.afterRevision <= delta.beforeRevision) {
      throw saveStorageError('DIRECTIVE_V1_SAVE_REVISION_DISCONTINUITY',
        'Historical state deltas must advance to a later revision.');
    }
    // Verify every intermediate state, including the suffix after the requested
    // boundary. A later overwriting delta must not hide an earlier corrupt state.
    state = await applyV1StateDelta({ saveId: id, state, delta });
    availableRevisions.push(delta.afterRevision);
    if (delta.afterRevision === revision) {
      selectedState = clone(state);
      selectedHash = delta.afterHash;
    }
  }
  if (state.stateCustody.revision !== manifest.currentRevision
    || await sha256Json(state) !== manifest.currentStateHash) {
    throw saveStorageError('DIRECTIVE_V1_SAVE_MANIFEST_INTEGRITY_FAILED',
      'Historical state verification did not reach the captured campaign-save head.');
  }
  assertV1CampaignSave({ ...manifest.saveMetadata, state });
  const manifestHash = await sha256Json(manifest);
  await assertCapturedHead();
  if (!selectedState) {
    throw saveStorageError('DIRECTIVE_V1_HISTORY_REVISION_UNAVAILABLE',
      'The requested state-custody revision is not a saved base or delta boundary.',
      { revision, baseRevision: base.revision, headRevision: manifest.currentRevision });
  }
  assertV1CampaignState(selectedState);
  return {
    state: selectedState,
    stateHash: selectedHash,
    revision,
    origin: {
      saveId: id,
      campaignId: selectedState.campaign.id,
      packageId: selectedState.activeCampaignPackage.packageId,
      packageVersion: selectedState.activeCampaignPackage.packageVersion,
      slotType: manifest.saveMetadata.slotType,
      parentSaveId: manifest.saveMetadata.parentSaveId,
      branchId: selectedState.mission.v1.branchId,
    },
    coverage: { baseRevision: base.revision, headRevision: manifest.currentRevision, availableRevisions },
    provenance: {
      manifestHash,
      headStateHash: manifest.currentStateHash,
      base: clone(manifest.base),
      segments: clone(manifest.segments),
    },
  };
}

// Detach request data without invoking accessors, toJSON, or caller prototypes.
// The request contains only a manifest and a bounded transcript hash vector.
function detachTranscriptCutRequest(value, depth = 0, budget = { slots: 0, chars: 0 }) {
  captureLimit(depth <= 64 && ++budget.slots <= V1_BRANCH_HISTORY_LIMITS.segments * 32 + V1_BRANCH_HISTORY_LIMITS.rows,
    'Transcript cut request exceeds traversal bounds.');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    budget.chars += value.length;
    captureLimit(budget.chars <= V1_BRANCH_HISTORY_LIMITS.historyBytes, 'Transcript cut request exceeds byte bounds.');
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const array = Array.isArray(value);
  captureAssert(value && typeof value === 'object'
    && (array ? Object.getPrototypeOf(value) === Array.prototype
      : [Object.prototype, null].includes(Object.getPrototypeOf(value))),
  'Transcript cut request must contain plain JSON data.', 'DIRECTIVE_V1_HISTORY_REQUEST_INVALID');
  const copy = array ? [] : {}, keys = Reflect.ownKeys(value);
  captureAssert(!array || keys.length === value.length + 1, 'Transcript cut arrays must be contiguous.', 'DIRECTIVE_V1_HISTORY_REQUEST_INVALID');
  let index = 0;
  for (const key of keys) {
    if (array && key === 'length') continue;
    const property = Object.getOwnPropertyDescriptor(value, key);
    captureAssert(typeof key === 'string' && property.enumerable && Object.hasOwn(property, 'value')
      && (!array || key === String(index++)), 'Transcript cut request contains an unsupported property.', 'DIRECTIVE_V1_HISTORY_REQUEST_INVALID');
    Object.defineProperty(copy, key, { value: detachTranscriptCutRequest(property.value, depth + 1, budget), enumerable: true });
  }
  return copy;
}

/**
 * Restore the latest captured authority whose entire observed vector existed at
 * this cut. Same-vector corrections select the latest record. This read-only
 * dependency proves stored state/vector identity, not host lineage or admission.
 */
export async function loadV1CampaignStateAtTranscriptCut(adapter, saveId, options = {}) {
  const request = detachTranscriptCutRequest(options);
  captureLimit(captureBytes(request) <= V1_BRANCH_HISTORY_LIMITS.historyBytes, 'Transcript cut request exceeds byte bounds.');
  captureAssert(typeof saveId === 'string' && safeId(saveId, 'saveId') === saveId
    && adapter && typeof adapter.readJson === 'function'
    && Object.keys(request).length === 3 && ['expectedManifest', 'transcript', 'retainedRowCount'].every(key => Object.hasOwn(request, key)),
  'Transcript cut requires exact save, manifest, vector and count.', 'DIRECTIVE_V1_HISTORY_REQUEST_INVALID');
  const id = saveId, { transcript, retainedRowCount } = request;
  captureAssert(object(transcript) && Object.keys(transcript).length === 4
    && ['projectionVersion', 'rowCount', 'rowHashes', 'vectorHash'].every(key => Object.hasOwn(transcript, key))
    && transcript.projectionVersion === 1 && Number.isSafeInteger(transcript.rowCount) && transcript.rowCount >= 0
    && Array.isArray(transcript.rowHashes) && transcript.rowHashes.length === transcript.rowCount
    && transcript.rowHashes.every(hash => typeof hash === 'string' && SHA256.test(hash))
    && typeof transcript.vectorHash === 'string' && SHA256.test(transcript.vectorHash)
    && Number.isSafeInteger(retainedRowCount) && retainedRowCount >= 0 && retainedRowCount <= transcript.rowCount,
  'Transcript cut projection/count is invalid.', 'DIRECTIVE_V1_HISTORY_REQUEST_INVALID');
  const limit = V1_BRANCH_HISTORY_LIMITS;
  captureLimit(transcript.rowCount <= limit.rows, 'Transcript cut row limit exceeded.');
  const manifest = assertV1CampaignSaveManifest(request.expectedManifest, { saveId: id });
  captureAssert(manifest.branchHistory, 'This save has no captured transcript history.', 'DIRECTIVE_V1_HISTORY_CAPTURE_UNAVAILABLE');
  captureLimit(manifest.segments.length <= limit.segments
    && manifest.segments.reduce((sum, ref) => sum + ref.deltaCount, 0) <= limit.deltas
    && manifest.segments.reduce((sum, ref) => sum + ref.byteLength, 0) <= limit.segmentBytes,
  'Captured state chain exceeds verification bounds.');
  captureAssert(Number.isSafeInteger(manifest.base.revision) && Number.isSafeInteger(manifest.currentRevision), 'Unsafe captured state revision.');
  const expectedJson = canonicalJson(manifest);
  async function assertHead() {
    captureAssert(canonicalJson(await readOrNull(adapter, V1_STORAGE_PATHS.save(id))) === expectedJson,
      'Captured transcript-cut head changed.', 'DIRECTIVE_V1_HISTORY_HEAD_CHANGED');
  }
  await assertHead();
  captureAssert(await sha256Json(transcript.rowHashes) === transcript.vectorHash,
    'Supplied transcript vector hash differs.', 'DIRECTIVE_V1_HISTORY_REQUEST_INVALID');
  const { base, deltas } = await readVerifiedSaveChain(adapter, manifest, id);
  captureLimit(captureBytes(base.state) <= limit.baseBytes, 'Captured state base exceeds byte limit.');
  const boundaries = new Map([[base.revision, base.stateHash]]);
  for (const delta of deltas) {
    captureAssert(Number.isSafeInteger(delta.beforeRevision) && Number.isSafeInteger(delta.afterRevision)
      && delta.afterRevision > delta.beforeRevision, 'Unsafe captured delta revision.');
    boundaries.set(delta.afterRevision, delta.afterHash);
  }
  await assertHead();
  const history = await readVerifiedBranchHistory(adapter, manifest, boundaries);
  await assertHead();
  captureAssert(transcript.rowCount >= history.rows.length
    && history.rows.every((hash, index) => transcript.rowHashes[index] === hash),
  'The complete parent transcript does not extend captured history.', 'DIRECTIVE_V1_CAPTURE_TRANSCRIPT_NONPREFIX');
  let selectedIndex = -1;
  history.records.forEach((record, index) => { if (record.capture.transcript.rowCount <= retainedRowCount) selectedIndex = index; });
  let state = base.state, selectedState = null, recordIndex = 0;
  async function verifyBoundary() {
    const record = history.records[recordIndex];
    if (!record || record.capture.after.revision !== state.stateCustody.revision) return;
    const { capture } = record;
    const originalSave = assertV1CampaignSave({ ...record.saveMetadata, state });
    captureAssert(canonicalJson(immutableSaveMetadata(record.saveMetadata)) === canonicalJson(immutableSaveMetadata(manifest.saveMetadata))
      && capture.origin.saveId === state.campaignChatBinding?.saveId && capture.origin.campaignId === state.campaign.id
      && capture.origin.chatId === state.campaignChatBinding?.chatId, 'Historical capture ownership differs from its saved state.');
    assertCaptureEntity(capture.origin, state.campaignChatBinding);
    const { head, ...projected } = capture.transcript;
    const payload = { ...capture, transcript: { ...projected, rowHashes: history.rows.slice(0, projected.rowCount) } };
    captureAssert(await sha256Json({ expectedManifestHash: record.expectedManifestHash, save: originalSave, capture: payload }) === record.requestHash,
      'Historical capture does not match its exact request identity.');
    if (recordIndex === selectedIndex) selectedState = clone(state);
    recordIndex++;
  }
  await verifyBoundary();
  for (const delta of deltas) {
    state = await applyV1StateDelta({ saveId: id, state, delta });
    await verifyBoundary();
  }
  captureAssert(recordIndex === history.records.length && state.stateCustody.revision === manifest.currentRevision
    && await sha256Json(state) === manifest.currentStateHash, 'Captured transcript-cut verification did not reach the complete head.');
  assertV1CampaignSave({ ...manifest.saveMetadata, state });
  const manifestHash = await sha256Json(manifest);
  const cutHash = await sha256Json(transcript.rowHashes.slice(0, retainedRowCount));
  await assertHead();
  captureAssert(selectedState, 'The retained transcript predates the captured coverage floor.', 'DIRECTIVE_V1_HISTORY_CUT_UNAVAILABLE');
  const selected = history.records[selectedIndex].capture, floor = history.records[0].capture;
  return {
    state: selectedState, stateHash: selected.after.stateHash, revision: selected.after.revision,
    packageFingerprint: selected.packageFingerprint,
    origin: { saveId: id, campaignId: selectedState.campaign.id,
      packageId: selectedState.activeCampaignPackage.packageId, packageVersion: selectedState.activeCampaignPackage.packageVersion,
      slotType: manifest.saveMetadata.slotType, parentSaveId: manifest.saveMetadata.parentSaveId, branchId: selectedState.mission.v1.branchId },
    coverage: { baseRevision: base.revision, headRevision: manifest.currentRevision, availableRevisions: [...boundaries.keys()] },
    provenance: { manifestHash, headStateHash: manifest.currentStateHash, base: clone(manifest.base), segments: clone(manifest.segments) },
    capture: { floor: { ...floor.after, rowCount: floor.transcript.rowCount, vectorHash: floor.transcript.vectorHash },
      selected: { index: selectedIndex, operationId: selected.operationId, writerKind: selected.writerKind,
        rowCount: selected.transcript.rowCount, vectorHash: selected.transcript.vectorHash },
      parent: { rowCount: transcript.rowCount, vectorHash: transcript.vectorHash }, cut: { rowCount: retainedRowCount, vectorHash: cutHash } },
  };
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
  now = new Date().toISOString(),
  expectedTargetSave = null,
  expectedTargetManifest = null,
} = {}) {
  const expectedTarget = expectedTargetSave === null ? null : clone(assertV1CampaignSave(expectedTargetSave));
  const expectedHead = expectedTargetManifest === null ? null : clone(expectedTargetManifest);
  const expectedId = safeId(expectedSaveId, 'expectedSaveId');
  const nextId = safeId(nextSaveId, 'nextSaveId');
  let index = await loadIndex(requireAdapter(adapter), { create: true, now });
  if (index.activeSaveId !== expectedId) {
    const error = new Error(`The active V1 save changed from "${expectedId}" before the timeline could be activated.`);
    error.code = 'DIRECTIVE_V1_ACTIVE_SAVE_CAS_MISMATCH';
    error.details = { expectedSaveId: expectedId, actualSaveId: index.activeSaveId, nextSaveId: nextId };
    throw error;
  }
  const [expected, next] = await Promise.all([
    loadV1CampaignSave(adapter, expectedId),
    loadV1CampaignSave(adapter, nextId, { expectedSave: expectedTarget, expectedManifest: expectedHead })
  ]);
  if (expected.slotType !== 'active' || next.slotType !== 'active' || expected.campaignId !== next.campaignId) {
    const error = new Error('The timeline activation records are not compatible active saves from one campaign.');
    error.code = 'DIRECTIVE_V1_ACTIVE_SAVE_CAS_TARGET_INVALID';
    throw error;
  }
  if (expectedTarget || expectedHead) {
    const currentHead = await adapter.readJson(V1_STORAGE_PATHS.save(nextId));
    if (expectedHead && canonicalJson(currentHead) !== canonicalJson(expectedHead)) {
      throw saveStorageError('DIRECTIVE_V1_STATE_PERSISTENCE_CONFLICT', 'The timeline target changed before activation.');
    }
    if (expectedTarget && canonicalJson((await hydrateManifest(adapter, currentHead, nextId)).save) !== canonicalJson(expectedTarget)) {
      throw saveStorageError('DIRECTIVE_V1_STATE_PERSISTENCE_CONFLICT', 'The timeline target state changed before activation.');
    }
    if (canonicalJson(await adapter.readJson(V1_STORAGE_PATHS.save(nextId))) !== canonicalJson(currentHead)) {
      throw saveStorageError('DIRECTIVE_V1_STATE_PERSISTENCE_CONFLICT', 'The timeline target changed during activation.');
    }
    // Target verification yields; preserve any newer selection and unrelated index entries.
    index = await loadIndex(adapter, { create: true, now });
    if (index.activeSaveId !== expectedId) {
      const error = new Error(`The active V1 save changed from "${expectedId}" during timeline verification.`);
      error.code = 'DIRECTIVE_V1_ACTIVE_SAVE_CAS_MISMATCH';
      error.details = { expectedSaveId: expectedId, actualSaveId: index.activeSaveId, nextSaveId: nextId };
      throw error;
    }
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
