import {
  createCampaignSaveMetadata,
  createSaveListEntry,
  deriveDefaultCampaignSaveName
} from './save-records.mjs';
import {
  campaignSaveLogicalKey,
  characterCreatorDraftLogicalKey,
  campaignPackageImportLogicalKey,
  DIRECTIVE_LOGICAL_STORAGE_KEYS,
  saveManifestV2LogicalKey
} from './logical-storage-paths.mjs';
import {
  loadV2MaterializedHead,
  readV2ArtifactRef
} from './transaction-store-v2.mjs';
import {
  loadActiveCampaignStateV2
} from './active-save-facade-v2.mjs';
import {
  assertDirectiveUserFilesPath,
  DIRECTIVE_STORAGE_IMAGE_EXTENSIONS
} from './directive-storage-filenames.mjs';

export const DIRECTIVE_STORAGE_PATHS = {
  storageIndex: DIRECTIVE_LOGICAL_STORAGE_KEYS.storageIndex,
  creatorDraftIndex: DIRECTIVE_LOGICAL_STORAGE_KEYS.creatorDraftIndex,
  campaignPackageImportIndex: DIRECTIVE_LOGICAL_STORAGE_KEYS.campaignPackageImportIndex,
  saveIndex: DIRECTIVE_LOGICAL_STORAGE_KEYS.saveIndex,
  uiPreferences: DIRECTIVE_LOGICAL_STORAGE_KEYS.uiPreferences
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

function compact(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function compactString(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function runtimeBridgeProjectionSource(entry = {}) {
  return compactString(entry.projectionSource)
    || (compactString(entry.coreTransactionId || entry.transactionId || entry.coreProjection?.transactionId)
      ? 'coreStoreV2'
      : 'coreStoreV2');
}

function runtimeBridgeAuthorityFields(kind, entry = {}) {
  const projectionSource = runtimeBridgeProjectionSource(entry);
  const authority = compactString(entry.authority)
    || (projectionSource === 'coreStoreV2' ? 'compatibilityProjection' : 'compatibilityProjectionUnavailable');
  const rowKind = kind === 'ingress'
    ? 'directive.coreIngressCompatibilityMirror.v1'
    : 'directive.coreResponseCompatibilityMirror.v1';
  return {
    authority,
    projectionSource,
    compatibilityMirror: entry.compatibilityMirror
      ? cloneJson(entry.compatibilityMirror)
      : compact({
          kind: rowKind,
          status: authority === 'compatibilityProjectionUnavailable' ? 'runtimeBridgeProjection' : 'coreProjection',
          transactionId: entry.transactionId || entry.coreTransactionId || entry.coreProjection?.transactionId || null,
          ingressId: kind === 'ingress' ? (entry.ingressId || entry.id || null) : undefined,
          responseId: kind === 'response' ? (entry.responseId || entry.id || null) : undefined,
          projectionSource
        })
  };
}

function projectionArray(rows = []) {
  return Array.isArray(rows) && rows.length ? cloneJson(rows) : undefined;
}

function coreStoreReadProjectionsFromLoadedV2({
  ingressLedger = [],
  responses = [],
  responseLedger = [],
  turnLedger = null
} = {}) {
  const responseRows = Array.isArray(responses) && responses.length ? responses : responseLedger;
  return compact({
    kind: 'directive.coreStoreReadProjections.v1',
    runtimeAuthority: 'coreStoreV2',
    ingressLedger: projectionArray(ingressLedger),
    responses: projectionArray(responseRows),
    recoveryJournal: [],
    turnLedger: turnLedger ? cloneJson(turnLedger) : undefined
  });
}

function hasCoreStoreReadProjectionEvidence(projections = {}) {
  return Boolean(
    projections?.runtimeAuthority === 'coreStoreV2'
    || (Array.isArray(projections?.ingressLedger) && projections.ingressLedger.length)
    || (Array.isArray(projections?.responses) && projections.responses.length)
    || (Array.isArray(projections?.responseLedger) && projections.responseLedger.length)
    || (isObject(projections?.turnLedger) && Array.isArray(projections.turnLedger.entries) && projections.turnLedger.entries.length)
  );
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
      saves: DIRECTIVE_STORAGE_PATHS.saveIndex,
      uiPreferences: DIRECTIVE_STORAGE_PATHS.uiPreferences
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

function createUiPreferences(createdAt) {
  return {
    kind: 'directive.uiPreferences',
    schemaVersion: 1,
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    hiddenCampaignSessionKeys: []
  };
}

function normalizeUiPreferences(value, fallbackTimestamp) {
  const base = isObject(value) ? value : createUiPreferences(fallbackTimestamp);
  const hiddenCampaignSessionKeys = [...new Set(
    (Array.isArray(base.hiddenCampaignSessionKeys) ? base.hiddenCampaignSessionKeys : [])
      .map((key) => String(key || '').trim())
      .filter(Boolean)
  )];
  return {
    kind: 'directive.uiPreferences',
    schemaVersion: 1,
    revision: Number(base.revision || 1),
    createdAt: base.createdAt || fallbackTimestamp,
    updatedAt: base.updatedAt || fallbackTimestamp,
    hiddenCampaignSessionKeys
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
  if (!index.indexes.uiPreferences) index.indexes.uiPreferences = DIRECTIVE_STORAGE_PATHS.uiPreferences;
  return index;
}

export async function loadDirectiveUiPreferences(adapter, options = {}) {
  const checkedAt = timestamp(options);
  const existing = await readJsonOrNull(adapter, DIRECTIVE_STORAGE_PATHS.uiPreferences);
  if (existing) return normalizeUiPreferences(existing, checkedAt);
  const created = createUiPreferences(checkedAt);
  await writeJson(adapter, DIRECTIVE_STORAGE_PATHS.uiPreferences, created);
  return created;
}

export async function saveDirectiveUiPreferences(adapter, preferences, options = {}) {
  const updatedAt = timestamp(options);
  const existing = await readJsonOrNull(adapter, DIRECTIVE_STORAGE_PATHS.uiPreferences);
  const prior = normalizeUiPreferences(existing, updatedAt);
  const next = normalizeUiPreferences(preferences, updatedAt);
  next.createdAt = prior.createdAt || next.createdAt;
  next.updatedAt = updatedAt;
  next.revision = Math.max(1, Number(prior.revision || 0) + 1);
  await writeJson(adapter, DIRECTIVE_STORAGE_PATHS.uiPreferences, next);
  return cloneJson(next);
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

function withoutUpdatedAt(value = {}) {
  const clone = cloneJson(value || {});
  delete clone.updatedAt;
  return clone;
}

function storageFileEntryMatches(existing = null, next = null) {
  if (!existing || !next) return false;
  return JSON.stringify(withoutUpdatedAt(existing)) === JSON.stringify(withoutUpdatedAt(next));
}

async function upsertStorageFileEntry(adapter, filePath, entry, options = {}) {
  const updatedAt = timestamp(options);
  const existingIndex = await readStorageIndex(adapter, options);
  const nextEntry = {
    path: filePath,
    ...cloneJson(entry),
    updatedAt
  };
  if (storageFileEntryMatches(existingIndex.files?.[filePath], nextEntry)) {
    return cloneJson(existingIndex);
  }
  const index = touchIndex(existingIndex, updatedAt);
  index.files[filePath] = nextEntry;
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
    campaignTitle: importRecord.packageData?.storyArcs?.campaign?.title
      || importRecord.packageData?.manifest?.title
      || null,
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

function payloadKindForSaveEntry(entry = {}) {
  return entry.payloadKind || entry.kind || 'directive.campaignSave';
}

function isV2SaveIndexEntry(entry = {}) {
  return entry.storageFormat === 'v2'
    || entry.payloadKind === 'directive.saveManifest.v2'
    || entry.kind === 'directive.saveManifest.v2';
}

function isV2AuthoritySaveEntry(entry = {}, record = null) {
  return entry.runtimeStorageFormat === 'v2'
    || isRuntimeV2BridgeEntry(entry)
    || isV2SaveIndexEntry(entry)
    || Boolean(entry.v2ManifestRef?.logicalKey)
    || Boolean(entry.manifestRef?.logicalKey && (entry.payloadKind === 'directive.saveManifest.v2' || entry.kind === 'directive.saveManifest.v2'))
    || record?.kind === 'directive.saveManifest.v2';
}

function createV2SaveStateUnavailableError(entry = {}, reason = 'v2-state-unavailable', cause = null) {
  const error = new Error(`Campaign save "${entry.id || 'unknown'}" is v2-owned but its v2 state could not be loaded.`);
  error.code = 'DIRECTIVE_V2_SAVE_STATE_UNAVAILABLE';
  error.details = compact({
    saveId: entry.id || null,
    path: entry.path || null,
    reason,
    causeCode: cause?.code || null,
    causeMessage: cause?.message || (cause ? String(cause) : null)
  });
  return error;
}

function createV2SaveRequiredError(entry = {}, record = null) {
  const error = new Error(`Campaign save "${entry.id || record?.id || 'unknown'}" has no CORE/v2 manifest authority.`);
  error.code = 'DIRECTIVE_V2_SAVE_REQUIRED';
  error.details = compact({
    saveId: entry.id || record?.id || null,
    path: entry.path || null,
    payloadKind: payloadKindForSaveEntry(entry),
    retiredAuthority: 'directive.campaignSave.payload.campaignState',
    requiredAuthority: 'directive.saveManifest.v2'
  });
  return error;
}

function v2ManifestRefForSaveEntry(entry = {}, record = null, { includeRuntimeBridge = false } = {}) {
  if (includeRuntimeBridge && entry.v2ManifestRef?.logicalKey) return cloneJson(entry.v2ManifestRef);
  if (record?.kind === 'directive.saveManifest.v2') {
    return {
      logicalKey: entry.path,
      hash: record.hash || null,
      byteLength: record.byteLength || null,
      kind: record.kind
    };
  }
  if (entry.manifestRef?.logicalKey && (entry.payloadKind === 'directive.saveManifest.v2' || entry.kind === 'directive.saveManifest.v2')) {
    return cloneJson(entry.manifestRef);
  }
  return null;
}

function isRuntimeV2BridgeEntry(entry = {}) {
  return entry.runtimeStorageFormat === 'v2' && Boolean(entry.v2ManifestRef?.logicalKey);
}

async function readIndexedV2ArtifactRef(adapter, ref = {}) {
  try {
    return await readV2ArtifactRef(adapter, ref);
  } catch (error) {
    if (error?.code !== 'DIRECTIVE_V2_ARTIFACT_HASH_MISMATCH' || !ref?.logicalKey) {
      throw error;
    }
    return readV2ArtifactRef(adapter, {
      logicalKey: ref.logicalKey,
      kind: ref.kind || undefined
    });
  }
}

async function loadRuntimeBridgeCampaignStateV2(adapter, {
  entry = null,
  saveRecord = null
} = {}) {
  if (!isRuntimeV2BridgeEntry(entry)) return { found: false, skipped: true };
  const v2ManifestRef = v2ManifestRefForSaveEntry(entry, saveRecord, { includeRuntimeBridge: true });
  if (!v2ManifestRef?.logicalKey) return { found: false, skipped: true };
  if (saveRecord?.kind !== 'directive.campaignSave') {
    return { found: false, skipped: true, reason: 'runtime-v2-bridge-requires-v1-checkpoint' };
  }
  try {
    await readIndexedV2ArtifactRef(adapter, v2ManifestRef);
  } catch (error) {
    return {
      found: false,
      skipped: false,
      reason: 'runtime-v2-bridge-ref-unreadable',
      error,
      v2ManifestRef
    };
  }
  const loaded = await loadActiveCampaignStateV2(adapter, {
    saveRecord,
    fallbackCampaignState: saveRecord.payload?.campaignState || null
  });
  return loaded?.found && isObject(loaded.campaignState)
    ? {
        ...loaded,
        v2ManifestRef
      }
    : {
        ...loaded,
        found: false,
        v2ManifestRef
      };
}

async function loadV2CampaignStateFromSaveManifest(adapter, manifest) {
  requireObject(manifest, 'v2 save manifest');
  if (manifest.kind !== 'directive.saveManifest.v2') {
    throw new Error('v2 save manifest must have kind directive.saveManifest.v2');
  }
  if (manifest.layout && manifest.layout !== 'active') {
    const error = new Error(`v2 active campaign load cannot use ${manifest.layout} manifest layout`);
    error.code = 'DIRECTIVE_V2_ACTIVE_SAVE_LAYOUT_MISMATCH';
    error.details = { layout: manifest.layout, campaignId: manifest.campaignId || null, saveId: manifest.saveId || null };
    throw error;
  }
  const head = await loadV2MaterializedHead(adapter, {
    campaignId: manifest.campaignId,
    saveId: manifest.saveId,
    layout: manifest.layout || 'active',
    headRef: manifest.head
  });
  const headState = isObject(head.state)
    ? head.state
    : (head.kind === 'directive.materializedCampaignHead.v2' || isObject(head.campaign))
      ? head
      : null;
  if (!isObject(headState)) {
    const error = new Error('v2 active campaign head is missing materialized state');
    error.code = 'DIRECTIVE_V2_ACTIVE_HEAD_STATE_MISSING';
    error.details = { layout: head.layout || manifest.layout || null, campaignId: manifest.campaignId || null, saveId: manifest.saveId || null };
    throw error;
  }
  const eventSegments = [];
  const latestEventRef = (manifest.eventSegments || []).at(-1);
  if (latestEventRef) {
    eventSegments.push(await readV2ArtifactRef(adapter, latestEventRef));
  }
  const turnSegments = [];
  const latestTurnRef = (manifest.turnSegments || []).at(-1);
  if (latestTurnRef) {
    turnSegments.push(await readV2ArtifactRef(adapter, latestTurnRef));
  }
  const campaignState = cloneJson(headState);
  const eventEntries = eventSegments.flatMap((segment) => (Array.isArray(segment?.entries) ? segment.entries : []));
  const turnEntries = turnSegments.flatMap((segment) => (Array.isArray(segment?.entries) ? segment.entries : []));
  const ingressLedger = eventEntries
    .filter((entry) => entry?.type === 'runtimeIngressProjected' || entry?.type === 'playerIngressObserved' || entry?.type === 'turnObserved')
    .map((entry) => compact({
      id: entry.ingressId || entry.source?.hostMessageId || entry.hostMessageId || entry.id || null,
      hostMessageId: entry.hostMessageId || entry.source?.hostMessageId || null,
      turnId: entry.turnId || null,
      outcomeId: entry.outcomeId || null,
      textHash: entry.textHash || entry.source?.textHash || null,
      status: entry.status || entry.phase || 'observed',
      ...runtimeBridgeAuthorityFields('ingress', entry)
    }));
  const responseLedger = eventEntries
    .filter((entry) => entry?.type === 'runtimeResponseProjected' || entry?.type === 'visibleResponseRecorded')
    .map((entry) => compact({
      id: entry.responseId || entry.source?.hostMessageId || entry.hostMessageId || entry.id || null,
      hostMessageId: entry.hostMessageId || entry.source?.hostMessageId || null,
      turnId: entry.turnId || null,
      outcomeId: entry.outcomeId || null,
      status: entry.status || 'posted',
      responseKind: entry.responseKind || entry.kind || null,
      replacementTextPresent: entry.replacementTextPresent,
      replacementTextHash: entry.replacementTextHash,
      replacementTextLength: entry.replacementTextLength,
      outcomeIntegrity: entry.outcomeIntegrity ? cloneJson(entry.outcomeIntegrity) : undefined,
      ...runtimeBridgeAuthorityFields('response', entry)
    }));
  if (ingressLedger.length > 0 || responseLedger.length > 0) {
    campaignState.runtimeTracking = compact({
      ...(campaignState.runtimeTracking || {}),
      schemaVersion: 2,
      ingressLedger: [],
      responseLedger: [],
      recoveryJournal: [],
      sidecarJournal: [],
      modelCallJournal: [],
      pendingInteractions: []
    });
  }
  const projectedTurnLedger = turnEntries.length > 0
    ? {
      ...(campaignState.turnLedger || {}),
      entries: turnEntries.map((entry) => compact({
        id: entry.id || entry.turnId || null,
        turnId: entry.turnId || entry.id || null,
        outcomeId: entry.outcomeId || null,
        phase: entry.phase || null
      }))
    }
    : null;
  if (projectedTurnLedger) {
    campaignState.turnLedger = projectedTurnLedger;
  }
  const coreStoreReadProjections = coreStoreReadProjectionsFromLoadedV2({
    ingressLedger,
    responses: responseLedger,
    turnLedger: projectedTurnLedger
  });
  if (hasCoreStoreReadProjectionEvidence(coreStoreReadProjections)) {
    campaignState.directiveRuntimeEvidence = compact({
      ...(isObject(campaignState.directiveRuntimeEvidence) ? campaignState.directiveRuntimeEvidence : {}),
      coreStoreReadProjections
    });
  }
  return campaignState;
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

export async function deleteCampaignSaveFromStorage(adapter, saveId, options = {}) {
  const id = requireNonEmptyString(saveId, 'saveId');
  const updatedAt = timestamp(options);
  const saveIndex = touchIndex(await readSaveIndex(adapter, { now: updatedAt }), updatedAt);
  const entry = saveIndex.saves[id] || null;
  if (!entry) {
    return {
      kind: 'directive.campaignSaveDeleteResult',
      saveId: id,
      path: null,
      deleted: false,
      indexed: false,
      deletedActive: false
    };
  }

  const deletedActive = saveIndex.activeSaveId === id || entry.current === true;
  delete saveIndex.saves[id];
  if (saveIndex.activeSaveId === id) {
    saveIndex.activeSaveId = null;
  }

  const storageIndex = touchIndex(await readStorageIndex(adapter, { now: updatedAt }), updatedAt);
  if (entry.path) delete storageIndex.files[entry.path];
  const deleted = entry.path ? await deleteJsonIfSupported(adapter, entry.path) : false;

  await writeJson(adapter, DIRECTIVE_STORAGE_PATHS.saveIndex, saveIndex);
  await writeJson(adapter, DIRECTIVE_STORAGE_PATHS.storageIndex, storageIndex);

  return {
    kind: 'directive.campaignSaveDeleteResult',
    saveId: id,
    path: entry.path || null,
    deleted,
    indexed: true,
    deletedActive,
    name: entry.name || null,
    slotType: entry.slotType || null,
    metadata: cloneJson(entry.metadata || {})
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

export async function markCampaignSaveRuntimeV2State(adapter, {
  saveId,
  saveManifest,
  saveManifestRef,
  metadata = null,
  current = true,
  now = null
} = {}) {
  requireObject(saveManifest, 'saveManifest');
  if (saveManifest.kind !== 'directive.saveManifest.v2') {
    throw new Error('saveManifest must be a directive.saveManifest.v2 record');
  }
  const id = requireNonEmptyString(saveId || saveManifest.saveId, 'saveId');
  const updatedAt = timestamp({ now: now || saveManifest.updatedAt || null });
  const manifestRef = saveManifestRef ? cloneJson(saveManifestRef) : {
    logicalKey: saveManifestV2LogicalKey({ campaignId: saveManifest.campaignId, saveId: id }),
    hash: saveManifest.hash || null,
    byteLength: saveManifest.byteLength || null,
    kind: saveManifest.kind
  };
  const index = touchIndex(await readSaveIndex(adapter, { now: updatedAt }), updatedAt);
  const existing = index.saves?.[id];
  if (!existing) {
    throw new Error(`Campaign save "${id}" is not indexed`);
  }
  if (current === true) {
    for (const save of Object.values(index.saves || {})) {
      save.current = false;
    }
    index.activeSaveId = id;
  }
  const nextMetadata = metadata ? cloneJson(metadata) : cloneJson(existing.metadata || {});
  nextMetadata.lastUpdatedAt = nextMetadata.lastUpdatedAt || updatedAt;
  const manifestOwnedSave = existing.storageFormat === 'v2'
    || existing.payloadKind === 'directive.saveManifest.v2'
    || existing.kind === 'directive.saveManifest.v2'
    || Boolean(existing.manifestRef?.logicalKey);
  index.saves[id] = {
    ...cloneJson(existing),
    current: current === true ? true : existing.current === true,
    updatedAt,
    metadata: nextMetadata,
    path: manifestOwnedSave ? manifestRef.logicalKey : existing.path,
    storageFormat: manifestOwnedSave ? 'v2' : existing.storageFormat,
    payloadKind: manifestOwnedSave ? 'directive.saveManifest.v2' : existing.payloadKind,
    manifestRef: manifestOwnedSave ? manifestRef : existing.manifestRef,
    runtimeStorageFormat: 'v2',
    v2RuntimePersistedAt: updatedAt,
    v2ManifestRef: manifestRef
  };
  await writeJson(adapter, DIRECTIVE_STORAGE_PATHS.saveIndex, index);
  await upsertStorageFileEntry(adapter, manifestRef.logicalKey, {
    kind: saveManifest.kind,
    ownerId: id,
    campaignId: saveManifest.campaignId,
    indexPath: DIRECTIVE_STORAGE_PATHS.saveIndex,
    storageFormat: 'v2'
  }, { now: updatedAt });
  return cloneJson(index.saves[id]);
}

export async function storeCampaignV2SaveManifestIndexEntry(adapter, {
  saveManifest,
  saveManifestRef = null,
  campaignState = null,
  packageData = null,
  name = null,
  slotType = 'manual',
  summary = null,
  now = null
} = {}) {
  requireObject(saveManifest, 'saveManifest');
  if (saveManifest.kind !== 'directive.saveManifest.v2') {
    throw new Error('saveManifest must be a directive.saveManifest.v2 record');
  }
  const updatedAt = timestamp({ now: now || saveManifest.updatedAt || null });
  const saveId = requireNonEmptyString(saveManifest.saveId, 'saveManifest.saveId');
  const campaignId = requireNonEmptyString(saveManifest.campaignId, 'saveManifest.campaignId');
  const manifestPath = saveManifestRef?.logicalKey || saveManifestV2LogicalKey({ campaignId, saveId });
  const metadata = isObject(saveManifest.metadata)
    ? cloneJson(saveManifest.metadata)
    : campaignState && packageData
      ? createCampaignSaveMetadata({
          campaignState,
          packageData,
          savedAt: updatedAt,
          summary
        })
      : {
          campaignId,
          campaignTitle: null,
          packageId: null,
          packageTitle: null,
          packageVersion: null,
          lastUpdatedAt: updatedAt,
          summary: summary || null
        };
  metadata.lastUpdatedAt = metadata.lastUpdatedAt || updatedAt;
  if (summary && !metadata.summary) metadata.summary = summary;

  const entry = {
    id: saveId,
    name: name?.trim()
      || (campaignState ? deriveDefaultCampaignSaveName(campaignState) : null)
      || metadata.summary
      || saveId,
    slotType,
    revision: Number(saveManifest.revision || metadata.revision || 1),
    updatedAt,
    metadata,
    path: manifestPath,
    current: saveManifest.current === true,
    storageFormat: 'v2',
    payloadKind: 'directive.saveManifest.v2',
    campaignId,
    branchId: saveManifest.branchId || 'main',
    manifestRef: saveManifestRef ? cloneJson(saveManifestRef) : {
      logicalKey: manifestPath,
      hash: saveManifest.hash || null,
      byteLength: saveManifest.byteLength || null,
      kind: saveManifest.kind
    }
  };

  const index = touchIndex(await readSaveIndex(adapter, { now: updatedAt }), updatedAt);
  if (entry.current) {
    for (const save of Object.values(index.saves || {})) {
      save.current = false;
    }
    index.activeSaveId = saveId;
  }
  index.saves[saveId] = cloneJson(entry);
  await writeJson(adapter, DIRECTIVE_STORAGE_PATHS.saveIndex, index);

  await upsertStorageFileEntry(adapter, manifestPath, {
    kind: saveManifest.kind,
    ownerId: saveId,
    campaignId,
    indexPath: DIRECTIVE_STORAGE_PATHS.saveIndex,
    storageFormat: 'v2'
  }, { now: updatedAt });

  return cloneJson(entry);
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

  const runtimeBridge = await loadRuntimeBridgeCampaignStateV2(adapter, {
    entry,
    saveRecord: record
  });
  if (runtimeBridge.found && isObject(runtimeBridge.campaignState)) {
    return cloneJson(runtimeBridge.campaignState);
  }

  const v2ManifestRef = v2ManifestRefForSaveEntry(entry, record);
  const v2Authority = isV2AuthoritySaveEntry(entry, record);
  if (v2ManifestRef) {
    try {
      const manifest = await readIndexedV2ArtifactRef(adapter, v2ManifestRef);
      return loadV2CampaignStateFromSaveManifest(adapter, manifest);
    } catch (error) {
      throw error;
    }
  }
  if (v2Authority) {
    throw createV2SaveStateUnavailableError(entry, runtimeBridge?.reason || 'v2-state-unavailable', runtimeBridge?.error || null);
  }
  throw createV2SaveRequiredError(entry, record);
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
    ...saveEntries.map((entry) => ({ ...entry, kind: payloadKindForSaveEntry(entry), indexKind: 'saveIndex' }))
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
  const deepPayloadCheck = options.deepPayloadCheck === true;
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

    if (!deepPayloadCheck) {
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
      payloadsChecked: deepPayloadCheck ? payloadPaths.length : 0,
      payloadPathsVerified: typeof adapter.verifyJsonFiles === 'function' ? payloadPaths.length : 0
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
    if (result.status === 'ok') {
      const runtimeBridge = await loadRuntimeBridgeCampaignStateV2(adapter, {
        entry,
        saveRecord: result.value
      });
      if (runtimeBridge.found && isObject(runtimeBridge.campaignState)) {
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
          campaignState: cloneJson(runtimeBridge.campaignState),
          storageFormat: 'v2',
          diagnostics: {
            status: diagnosticStatus(issues),
            ok: issues.every((issue) => issue.severity !== 'error'),
            issues
          }
        };
      }
    }
    const v2ManifestRef = v2ManifestRefForSaveEntry(entry, result.value);
    const v2Authority = isV2AuthoritySaveEntry(entry, result.value);
    if (v2ManifestRef) {
      try {
        const manifest = await readIndexedV2ArtifactRef(adapter, v2ManifestRef);
        const campaignState = await loadV2CampaignStateFromSaveManifest(adapter, manifest);
        const needsIndexRepair = index.activeSaveId !== entry.id || entry.current !== true || currentEntries.length > 1;
        if (needsIndexRepair) {
          await markCampaignSaveActiveInIndex(adapter, index, entry.id, options);
        }
        return {
          kind: 'directive.activeSaveRecovery',
          checkedAt,
          recovered: needsIndexRepair || issues.length > 0,
          activeSaveId: entry.id,
          saveRecord: result.status === 'ok' ? cloneJson(result.value) : cloneJson(manifest),
          campaignState,
          storageFormat: 'v2',
          diagnostics: {
            status: diagnosticStatus(issues),
            ok: issues.every((issue) => issue.severity !== 'error'),
            issues
          }
        };
      } catch (error) {
        issues.push(createStorageIssue({
          severity: 'error',
          code: error?.code || 'active-save-v2-head-unreadable',
          message: `Campaign v2 save "${entry.id}" could not recover its materialized head: ${error?.message || error}`,
          path: v2ManifestRef.logicalKey || entry.path,
          ownerId: entry.id,
          kind: 'directive.saveManifest.v2'
        }));
      }
    }
    if (v2Authority) {
      issues.push(createStorageIssue({
        severity: 'error',
        code: 'active-save-v2-state-unavailable',
        message: `Campaign save "${entry.id}" is v2-owned and cannot fall back to its stale v1 checkpoint payload.`,
        path: entry.path,
        ownerId: entry.id,
        kind: 'directive.campaignSave'
      }));
      continue;
    }
    if (result.status === 'ok' && result.value?.kind === 'directive.campaignSave' && isObject(result.value?.payload?.campaignState)) {
      issues.push(createStorageIssue({
        severity: 'error',
        code: 'active-save-v2-manifest-required',
        message: `Campaign save "${entry.id}" has only retired v1 payload state and cannot become active runtime authority.`,
        path: entry.path,
        ownerId: entry.id,
        kind: 'directive.campaignSave'
      }));
      continue;
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
