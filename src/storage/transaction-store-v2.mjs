import {
  hashStableJson,
  redactExternalDiagnostic,
  stableJsonByteLength
} from '../runtime/architecture-redesign-contracts.mjs';
import {
  campaignManifestV2LogicalKey,
  checkpointV2LogicalKey,
  coreCampaignManifestV2LogicalKey,
  coreCheckpointV2LogicalKey,
  coreDiagnosticsSegmentV2LogicalKey,
  coreEventSegmentV2LogicalKey,
  coreHostMapV2LogicalKey,
  coreMaterializedHeadV2LogicalKey,
  corePromptCacheV2LogicalKey,
  coreSaveManifestV2LogicalKey,
  coreTurnSegmentV2LogicalKey,
  diagnosticsSegmentV2LogicalKey,
  eventSegmentV2LogicalKey,
  hostMapV2LogicalKey,
  materializedHeadV2LogicalKey,
  promptCacheV2LogicalKey,
  saveManifestV2LogicalKey,
  turnSegmentV2LogicalKey
} from './logical-storage-paths.mjs';

export const TRANSACTION_STORE_V2_LIMITS = Object.freeze({
  eventSegmentBytes: 2 * 1024 * 1024,
  turnSegmentBytes: 2 * 1024 * 1024,
  diagnosticsSegmentBytes: 5 * 1024 * 1024
});

const SEGMENT_TYPES = new Set(['event', 'turn', 'diagnostics']);
const V2_LAYOUTS = new Set(['active', 'core']);

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireObject(value, label) {
  if (!isObject(value)) throw new Error(`${label} must be an object`);
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function isoNow() {
  return new Date().toISOString();
}

function compact(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function normalizeV2Layout(layout = 'active') {
  const value = String(layout || 'active').trim();
  if (!V2_LAYOUTS.has(value)) throw new Error(`Unknown v2 storage layout "${value}"`);
  return value;
}

function withArtifactMetadata(record) {
  const base = cloneJson(record);
  delete base.hash;
  delete base.byteLength;
  const withHash = {
    ...record,
    hash: hashStableJson(base)
  };
  return {
    ...withHash,
    byteLength: stableJsonByteLength(withHash)
  };
}

export function hashV2ArtifactRecord(record = {}) {
  const base = cloneJson(record);
  delete base.hash;
  delete base.byteLength;
  return hashStableJson(base);
}

function artifactRef({ logicalKey, record }) {
  return compact({
    logicalKey,
    hash: record.hash || hashStableJson(record),
    byteLength: record.byteLength || stableJsonByteLength(record),
    entryCount: Number.isFinite(Number(record.entryCount)) ? Number(record.entryCount) : undefined,
    kind: record.kind || undefined
  });
}

export function verifyV2ArtifactRecord(record, ref = {}) {
  requireObject(record, 'artifact record');
  requireObject(ref, 'artifact ref');
  if (ref.kind && record.kind !== ref.kind) {
    const error = new Error(`Artifact kind mismatch for ${ref.logicalKey || 'unknown artifact'}`);
    error.code = 'DIRECTIVE_V2_ARTIFACT_KIND_MISMATCH';
    error.details = { expected: ref.kind, actual: record.kind, logicalKey: ref.logicalKey || null };
    throw error;
  }
  const actualHash = hashV2ArtifactRecord(record);
  if (ref.hash && actualHash !== ref.hash) {
    const error = new Error(`Artifact hash mismatch for ${ref.logicalKey || 'unknown artifact'}`);
    error.code = 'DIRECTIVE_V2_ARTIFACT_HASH_MISMATCH';
    error.details = { expected: ref.hash, actual: actualHash, logicalKey: ref.logicalKey || null };
    throw error;
  }
  if (record.hash && record.hash !== actualHash) {
    const error = new Error(`Artifact self-hash mismatch for ${ref.logicalKey || 'unknown artifact'}`);
    error.code = 'DIRECTIVE_V2_ARTIFACT_SELF_HASH_MISMATCH';
    error.details = { expected: record.hash, actual: actualHash, logicalKey: ref.logicalKey || null };
    throw error;
  }
  return true;
}

function segmentKind(segmentType) {
  if (segmentType === 'event') return 'directive.eventSegment.v2';
  if (segmentType === 'turn') return 'directive.turnSegment.v2';
  if (segmentType === 'diagnostics') return 'directive.diagnosticsSegment.v2';
  throw new Error(`Unknown v2 segment type "${segmentType}"`);
}

function segmentLimit(segmentType) {
  if (segmentType === 'diagnostics') return TRANSACTION_STORE_V2_LIMITS.diagnosticsSegmentBytes;
  if (segmentType === 'turn') return TRANSACTION_STORE_V2_LIMITS.turnSegmentBytes;
  return TRANSACTION_STORE_V2_LIMITS.eventSegmentBytes;
}

function segmentLogicalKey({ segmentType, campaignId, saveId, segmentId, layout = 'active' }) {
  const storageLayout = normalizeV2Layout(layout);
  if (segmentType === 'event') {
    return storageLayout === 'core'
      ? coreEventSegmentV2LogicalKey({ campaignId, saveId, segmentId })
      : eventSegmentV2LogicalKey({ campaignId, saveId, segmentId });
  }
  if (segmentType === 'turn') {
    return storageLayout === 'core'
      ? coreTurnSegmentV2LogicalKey({ campaignId, saveId, segmentId })
      : turnSegmentV2LogicalKey({ campaignId, saveId, segmentId });
  }
  if (segmentType === 'diagnostics') {
    return storageLayout === 'core'
      ? coreDiagnosticsSegmentV2LogicalKey({ campaignId, saveId, segmentId })
      : diagnosticsSegmentV2LogicalKey({ campaignId, saveId, segmentId });
  }
  throw new Error(`Unknown v2 segment type "${segmentType}"`);
}

function checkpointLogicalKey({ campaignId, saveId, checkpointId, layout = 'active' }) {
  return normalizeV2Layout(layout) === 'core'
    ? coreCheckpointV2LogicalKey({ campaignId, saveId, checkpointId })
    : checkpointV2LogicalKey({ campaignId, saveId, checkpointId });
}

function materializedHeadLogicalKey({ campaignId, saveId, layout = 'active' }) {
  return normalizeV2Layout(layout) === 'core'
    ? coreMaterializedHeadV2LogicalKey({ campaignId, saveId })
    : materializedHeadV2LogicalKey({ campaignId, saveId });
}

function hostMapLogicalKey({ campaignId, saveId, layout = 'active' }) {
  return normalizeV2Layout(layout) === 'core'
    ? coreHostMapV2LogicalKey({ campaignId, saveId })
    : hostMapV2LogicalKey({ campaignId, saveId });
}

function promptCacheLogicalKey({ campaignId, saveId, layout = 'active' }) {
  return normalizeV2Layout(layout) === 'core'
    ? corePromptCacheV2LogicalKey({ campaignId, saveId })
    : promptCacheV2LogicalKey({ campaignId, saveId });
}

function saveManifestLogicalKey({ campaignId, saveId, layout = 'active' }) {
  return normalizeV2Layout(layout) === 'core'
    ? coreSaveManifestV2LogicalKey({ campaignId, saveId })
    : saveManifestV2LogicalKey({ campaignId, saveId });
}

function campaignManifestLogicalKey({ campaignId, layout = 'active' }) {
  return normalizeV2Layout(layout) === 'core'
    ? coreCampaignManifestV2LogicalKey(campaignId)
    : campaignManifestV2LogicalKey(campaignId);
}

export function createV2SegmentRecord({
  segmentType,
  campaignId,
  saveId,
  segmentId,
  entries = [],
  createdAt = null,
  source = null
} = {}) {
  const type = requireNonEmptyString(segmentType, 'segmentType');
  if (!SEGMENT_TYPES.has(type)) throw new Error(`Unknown v2 segment type "${type}"`);
  const normalizedEntries = requireArray(entries, 'entries').map(cloneJson);
  return withArtifactMetadata(compact({
    kind: segmentKind(type),
    schemaVersion: 2,
    campaignId: requireNonEmptyString(campaignId, 'campaignId'),
    saveId: requireNonEmptyString(saveId, 'saveId'),
    segmentId: requireNonEmptyString(segmentId, 'segmentId'),
    entryCount: normalizedEntries.length,
    createdAt: createdAt || isoNow(),
    source: source ? cloneJson(source) : undefined,
    entries: normalizedEntries
  }));
}

function normalizeEntryGroups(groups = []) {
  if (!Array.isArray(groups)) return [];
  return groups.flatMap((group) => Array.isArray(group) ? group : [group]).map(cloneJson);
}

export function chunkV2SegmentEntries({
  segmentType,
  campaignId,
  saveId,
  entries = [],
  maxBytes = null,
  createdAt = null,
  source = null
} = {}) {
  const type = requireNonEmptyString(segmentType, 'segmentType');
  const limit = Number(maxBytes || segmentLimit(type));
  const allEntries = normalizeEntryGroups(entries);
  const chunks = [];
  let current = [];
  for (const entry of allEntries) {
    const next = [...current, entry];
    const candidate = createV2SegmentRecord({
      segmentType: type,
      campaignId,
      saveId,
      segmentId: String(chunks.length).padStart(4, '0'),
      entries: next,
      createdAt,
      source
    });
    if (candidate.byteLength <= limit) {
      current = next;
      continue;
    }
    if (current.length === 0) {
      const error = new Error(`${type} segment entry exceeds ${limit} bytes`);
      error.code = 'DIRECTIVE_V2_SEGMENT_ENTRY_TOO_LARGE';
      error.details = { segmentType: type, byteLength: candidate.byteLength, maxBytes: limit };
      throw error;
    }
    chunks.push(current);
    current = [entry];
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

async function writeJson(adapter, logicalKey, value) {
  requireObject(adapter, 'storage adapter');
  if (typeof adapter.writeJson !== 'function') throw new Error('storage adapter must provide writeJson(path, value)');
  await adapter.writeJson(logicalKey, cloneJson(value));
}

async function readJson(adapter, logicalKey) {
  requireObject(adapter, 'storage adapter');
  if (typeof adapter.readJson !== 'function') throw new Error('storage adapter must provide readJson(path)');
  return cloneJson(await adapter.readJson(logicalKey));
}

async function verifyJsonFiles(adapter, logicalKeys) {
  if (typeof adapter.verifyJsonFiles !== 'function') return null;
  return adapter.verifyJsonFiles(logicalKeys);
}

export async function readV2ArtifactRef(adapter, ref = {}) {
  requireObject(ref, 'artifact ref');
  const logicalKey = requireNonEmptyString(ref.logicalKey, 'artifact ref logicalKey');
  const record = await readJson(adapter, logicalKey);
  verifyV2ArtifactRecord(record, ref);
  return record;
}

async function verifyV2ArtifactRefs(adapter, refs = []) {
  for (const ref of refs.filter(Boolean)) {
    await readV2ArtifactRef(adapter, ref);
  }
  return true;
}

export async function writeV2Segment(adapter, options = {}) {
  const record = createV2SegmentRecord(options);
  const maxBytes = Number(options.maxBytes || segmentLimit(options.segmentType));
  if (record.byteLength > maxBytes) {
    const error = new Error(`${options.segmentType} segment ${record.segmentId} exceeds ${maxBytes} bytes`);
    error.code = 'DIRECTIVE_V2_SEGMENT_TOO_LARGE';
    error.details = { segmentType: options.segmentType, segmentId: record.segmentId, byteLength: record.byteLength, maxBytes };
    throw error;
  }
  const logicalKey = segmentLogicalKey({
    segmentType: options.segmentType,
    campaignId: record.campaignId,
    saveId: record.saveId,
    segmentId: record.segmentId,
    layout: options.layout
  });
  await writeJson(adapter, logicalKey, record);
  return {
    record,
    ref: artifactRef({ logicalKey, record })
  };
}

export async function readV2Segment(adapter, {
  segmentType,
  campaignId,
  saveId,
  segmentId,
  layout = 'active'
} = {}) {
  return readJson(adapter, segmentLogicalKey({
    segmentType: requireNonEmptyString(segmentType, 'segmentType'),
    campaignId: requireNonEmptyString(campaignId, 'campaignId'),
    saveId: requireNonEmptyString(saveId, 'saveId'),
    segmentId: requireNonEmptyString(segmentId, 'segmentId'),
    layout
  }));
}

export async function writeV2Checkpoint(adapter, {
  campaignId,
  saveId,
  checkpointId,
  checkpoint,
  createdAt = null,
  layout = 'active'
} = {}) {
  const record = withArtifactMetadata({
    kind: 'directive.checkpoint.v2',
    schemaVersion: 2,
    campaignId: requireNonEmptyString(campaignId, 'campaignId'),
    saveId: requireNonEmptyString(saveId, 'saveId'),
    checkpointId: requireNonEmptyString(checkpointId, 'checkpointId'),
    createdAt: createdAt || isoNow(),
    checkpoint: cloneJson(checkpoint || {})
  });
  const logicalKey = checkpointLogicalKey({ campaignId: record.campaignId, saveId: record.saveId, checkpointId: record.checkpointId, layout });
  await writeJson(adapter, logicalKey, record);
  return {
    record,
    ref: artifactRef({ logicalKey, record })
  };
}

export async function loadV2Checkpoint(adapter, {
  campaignId,
  saveId,
  checkpointId,
  layout = 'active'
} = {}) {
  return readJson(adapter, checkpointLogicalKey({
    campaignId: requireNonEmptyString(campaignId, 'campaignId'),
    saveId: requireNonEmptyString(saveId, 'saveId'),
    checkpointId: requireNonEmptyString(checkpointId, 'checkpointId'),
    layout
  }));
}

async function writeArtifact(adapter, logicalKey, value) {
  const record = withArtifactMetadata(value);
  await writeJson(adapter, logicalKey, record);
  return {
    record,
    ref: artifactRef({ logicalKey, record })
  };
}

export function createV2SaveManifest({
  campaignId,
  saveId,
  branchId = 'main',
  headRef,
  hostMapRef = null,
  promptCacheRef = null,
  eventSegmentRefs = [],
  turnSegmentRefs = [],
  diagnosticsSegmentRefs = [],
  checkpointRefs = [],
  createdAt = null,
  updatedAt = null,
  importedFrom = null,
  current = true,
  metadata = null,
  layout = 'active'
} = {}) {
  const storageLayout = normalizeV2Layout(layout);
  return withArtifactMetadata(compact({
    kind: 'directive.saveManifest.v2',
    schemaVersion: 2,
    layout: storageLayout,
    campaignId: requireNonEmptyString(campaignId, 'campaignId'),
    saveId: requireNonEmptyString(saveId, 'saveId'),
    branchId: requireNonEmptyString(branchId, 'branchId'),
    current: current === true,
    createdAt: createdAt || isoNow(),
    updatedAt: updatedAt || createdAt || isoNow(),
    metadata: metadata ? cloneJson(metadata) : undefined,
    head: cloneJson(headRef),
    hostMap: hostMapRef ? cloneJson(hostMapRef) : undefined,
    promptCache: promptCacheRef ? cloneJson(promptCacheRef) : undefined,
    eventSegments: eventSegmentRefs.map(cloneJson),
    turnSegments: turnSegmentRefs.map(cloneJson),
    diagnosticsSegments: diagnosticsSegmentRefs.map(cloneJson),
    checkpoints: checkpointRefs.map(cloneJson),
    importedFrom: importedFrom ? cloneJson(importedFrom) : undefined
  }));
}

export function createV2CampaignManifest({
  campaignId,
  activeSaveId,
  saveManifestRef,
  saves = {},
  createdAt = null,
  updatedAt = null,
  layout = 'active'
} = {}) {
  const id = requireNonEmptyString(campaignId, 'campaignId');
  const saveId = requireNonEmptyString(activeSaveId, 'activeSaveId');
  const storageLayout = normalizeV2Layout(layout);
  return withArtifactMetadata({
    kind: 'directive.campaignManifest.v2',
    schemaVersion: 2,
    layout: storageLayout,
    campaignId: id,
    activeSaveId: saveId,
    createdAt: createdAt || isoNow(),
    updatedAt: updatedAt || createdAt || isoNow(),
    saves: {
      ...cloneJson(saves),
      [saveId]: {
        saveId,
        manifest: cloneJson(saveManifestRef)
      }
    }
  });
}

export async function commitV2SaveLayout(adapter, {
  campaignId,
  saveId,
  branchId = 'main',
  head,
  hostMap = null,
  promptCache = null,
  eventSegments = [],
  turnSegments = [],
  diagnosticsSegments = [],
  checkpoints = [],
  importedFrom = null,
  current = true,
  metadata = null,
  now = null,
  layout = 'active'
} = {}) {
  const id = requireNonEmptyString(campaignId, 'campaignId');
  const save = requireNonEmptyString(saveId, 'saveId');
  const timestamp = now || isoNow();
  const storageLayout = normalizeV2Layout(layout);

  const eventSegmentRefs = [];
  const eventChunks = chunkV2SegmentEntries({
    segmentType: 'event',
    campaignId: id,
    saveId: save,
    entries: eventSegments,
    createdAt: timestamp
  });
  for (const [index, entries] of eventChunks.entries()) {
    eventSegmentRefs.push((await writeV2Segment(adapter, {
      segmentType: 'event',
      campaignId: id,
      saveId: save,
      segmentId: String(index).padStart(4, '0'),
      entries,
      createdAt: timestamp,
      layout: storageLayout
    })).ref);
  }

  const turnSegmentRefs = [];
  const turnChunks = chunkV2SegmentEntries({
    segmentType: 'turn',
    campaignId: id,
    saveId: save,
    entries: turnSegments,
    createdAt: timestamp
  });
  for (const [index, entries] of turnChunks.entries()) {
    turnSegmentRefs.push((await writeV2Segment(adapter, {
      segmentType: 'turn',
      campaignId: id,
      saveId: save,
      segmentId: String(index).padStart(4, '0'),
      entries,
      createdAt: timestamp,
      layout: storageLayout
    })).ref);
  }

  const diagnosticsSegmentRefs = [];
  const diagnosticsChunks = chunkV2SegmentEntries({
    segmentType: 'diagnostics',
    campaignId: id,
    saveId: save,
    entries: diagnosticsSegments,
    createdAt: timestamp
  });
  for (const [index, entries] of diagnosticsChunks.entries()) {
    diagnosticsSegmentRefs.push((await writeV2Segment(adapter, {
      segmentType: 'diagnostics',
      campaignId: id,
      saveId: save,
      segmentId: String(index).padStart(4, '0'),
      entries,
      createdAt: timestamp,
      layout: storageLayout
    })).ref);
  }

  const checkpointRefs = [];
  for (const checkpoint of checkpoints) {
    checkpointRefs.push((await writeV2Checkpoint(adapter, {
      campaignId: id,
      saveId: save,
      checkpointId: checkpoint.checkpointId || checkpoint.id,
      checkpoint,
      createdAt: timestamp,
      layout: storageLayout
    })).ref);
  }

  const headWrite = await writeArtifact(adapter, materializedHeadLogicalKey({ campaignId: id, saveId: save, layout: storageLayout }), {
    ...cloneJson(head || {}),
    kind: 'directive.materializedCampaignHead.v2',
    schemaVersion: 2,
    layout: storageLayout,
    campaignId: id,
    saveId: save,
    branchId,
    updatedAt: timestamp
  });
  const hostMapWrite = hostMap ? await writeArtifact(adapter, hostMapLogicalKey({ campaignId: id, saveId: save, layout: storageLayout }), {
    ...cloneJson(hostMap),
    kind: 'directive.hostMessageMap.v2',
    schemaVersion: 2,
    layout: storageLayout,
    campaignId: id,
    saveId: save,
    updatedAt: timestamp
  }) : null;
  const promptCacheWrite = promptCache ? await writeArtifact(adapter, promptCacheLogicalKey({ campaignId: id, saveId: save, layout: storageLayout }), {
    ...cloneJson(promptCache),
    kind: 'directive.promptCache.v2',
    schemaVersion: 2,
    layout: storageLayout,
    campaignId: id,
    saveId: save,
    updatedAt: timestamp
  }) : null;

  await verifyV2ArtifactRefs(adapter, [
    ...eventSegmentRefs,
    ...turnSegmentRefs,
    ...diagnosticsSegmentRefs,
    ...checkpointRefs,
    headWrite.ref,
    hostMapWrite?.ref || null,
    promptCacheWrite?.ref || null
  ]);

  const saveManifest = createV2SaveManifest({
    campaignId: id,
    saveId: save,
    branchId,
    headRef: headWrite.ref,
    hostMapRef: hostMapWrite?.ref || null,
    promptCacheRef: promptCacheWrite?.ref || null,
    eventSegmentRefs,
    turnSegmentRefs,
    diagnosticsSegmentRefs,
    checkpointRefs,
    importedFrom,
    current,
    metadata,
    layout: storageLayout,
    createdAt: timestamp,
    updatedAt: timestamp
  });
  const saveManifestKey = saveManifestLogicalKey({ campaignId: id, saveId: save, layout: storageLayout });
  await writeJson(adapter, saveManifestKey, saveManifest);
  const saveManifestRef = artifactRef({ logicalKey: saveManifestKey, record: saveManifest });

  const campaignManifest = createV2CampaignManifest({
    campaignId: id,
    activeSaveId: save,
    saveManifestRef,
    layout: storageLayout,
    createdAt: timestamp,
    updatedAt: timestamp
  });
  const campaignManifestKey = campaignManifestLogicalKey({ campaignId: id, layout: storageLayout });
  await writeJson(adapter, campaignManifestKey, campaignManifest);

  const verification = await verifyJsonFiles(adapter, [
    ...eventSegmentRefs.map((ref) => ref.logicalKey),
    ...turnSegmentRefs.map((ref) => ref.logicalKey),
    ...diagnosticsSegmentRefs.map((ref) => ref.logicalKey),
    ...checkpointRefs.map((ref) => ref.logicalKey),
    headWrite.ref.logicalKey,
    ...(hostMapWrite ? [hostMapWrite.ref.logicalKey] : []),
    ...(promptCacheWrite ? [promptCacheWrite.ref.logicalKey] : []),
    saveManifestKey,
    campaignManifestKey
  ]);

  return {
    campaignManifest,
    campaignManifestRef: artifactRef({ logicalKey: campaignManifestKey, record: campaignManifest }),
    saveManifest,
    saveManifestRef,
    refs: {
      head: headWrite.ref,
      hostMap: hostMapWrite?.ref || null,
      promptCache: promptCacheWrite?.ref || null,
      eventSegments: eventSegmentRefs,
      turnSegments: turnSegmentRefs,
      diagnosticsSegments: diagnosticsSegmentRefs,
      checkpoints: checkpointRefs
    },
    verification
  };
}

export async function commitV2DiagnosticsSegments(adapter, {
  campaignId,
  saveId,
  diagnosticsSegments = [],
  metadata = null,
  now = null,
  layout = 'active'
} = {}) {
  const id = requireNonEmptyString(campaignId, 'campaignId');
  const save = requireNonEmptyString(saveId, 'saveId');
  const timestamp = now || isoNow();
  const storageLayout = normalizeV2Layout(layout);
  const currentManifest = await loadV2SaveManifest(adapter, { campaignId: id, saveId: save, layout: storageLayout });
  let currentCampaignManifest = null;
  try {
    currentCampaignManifest = await loadV2CampaignManifest(adapter, id, { layout: storageLayout });
  } catch {
    currentCampaignManifest = null;
  }

  const diagnosticsSegmentRefs = [];
  const diagnosticsChunks = chunkV2SegmentEntries({
    segmentType: 'diagnostics',
    campaignId: id,
    saveId: save,
    entries: diagnosticsSegments,
    createdAt: timestamp
  });
  const segmentStartIndex = (currentManifest.diagnosticsSegments || []).length;
  for (const [index, entries] of diagnosticsChunks.entries()) {
    diagnosticsSegmentRefs.push((await writeV2Segment(adapter, {
      segmentType: 'diagnostics',
      campaignId: id,
      saveId: save,
      segmentId: String(segmentStartIndex + index).padStart(4, '0'),
      entries,
      createdAt: timestamp,
      layout: storageLayout
    })).ref);
  }

  await verifyV2ArtifactRefs(adapter, [
    currentManifest.head,
    currentManifest.hostMap || null,
    currentManifest.promptCache || null,
    ...(currentManifest.eventSegments || []),
    ...(currentManifest.turnSegments || []),
    ...(currentManifest.diagnosticsSegments || []),
    ...diagnosticsSegmentRefs,
    ...(currentManifest.checkpoints || [])
  ]);

  const saveManifest = createV2SaveManifest({
    campaignId: id,
    saveId: save,
    branchId: currentManifest.branchId || 'main',
    headRef: currentManifest.head,
    hostMapRef: currentManifest.hostMap || null,
    promptCacheRef: currentManifest.promptCache || null,
    eventSegmentRefs: currentManifest.eventSegments || [],
    turnSegmentRefs: currentManifest.turnSegments || [],
    diagnosticsSegmentRefs: [
      ...(currentManifest.diagnosticsSegments || []),
      ...diagnosticsSegmentRefs
    ],
    checkpointRefs: currentManifest.checkpoints || [],
    importedFrom: currentManifest.importedFrom || null,
    current: currentManifest.current !== false,
    metadata: metadata || currentManifest.metadata || null,
    layout: storageLayout,
    createdAt: currentManifest.createdAt || timestamp,
    updatedAt: timestamp
  });
  const saveManifestKey = saveManifestLogicalKey({ campaignId: id, saveId: save, layout: storageLayout });
  await writeJson(adapter, saveManifestKey, saveManifest);
  const saveManifestRef = artifactRef({ logicalKey: saveManifestKey, record: saveManifest });

  const campaignManifest = createV2CampaignManifest({
    campaignId: id,
    activeSaveId: save,
    saveManifestRef,
    saves: currentCampaignManifest?.saves || {},
    layout: storageLayout,
    createdAt: currentCampaignManifest?.createdAt || timestamp,
    updatedAt: timestamp
  });
  const campaignManifestKey = campaignManifestLogicalKey({ campaignId: id, layout: storageLayout });
  await writeJson(adapter, campaignManifestKey, campaignManifest);

  const verification = await verifyJsonFiles(adapter, [
    ...diagnosticsSegmentRefs.map((ref) => ref.logicalKey),
    saveManifestKey,
    campaignManifestKey
  ]);

  return {
    campaignManifest,
    campaignManifestRef: artifactRef({ logicalKey: campaignManifestKey, record: campaignManifest }),
    saveManifest,
    saveManifestRef,
    refs: {
      head: currentManifest.head,
      hostMap: currentManifest.hostMap || null,
      promptCache: currentManifest.promptCache || null,
      eventSegments: currentManifest.eventSegments || [],
      turnSegments: currentManifest.turnSegments || [],
      diagnosticsSegments: [
        ...(currentManifest.diagnosticsSegments || []),
        ...diagnosticsSegmentRefs
      ],
      checkpoints: currentManifest.checkpoints || []
    },
    verification
  };
}

export async function loadV2SaveManifest(adapter, {
  campaignId,
  saveId,
  layout = 'active'
} = {}) {
  return readJson(adapter, saveManifestLogicalKey({
    campaignId: requireNonEmptyString(campaignId, 'campaignId'),
    saveId: requireNonEmptyString(saveId, 'saveId'),
    layout
  }));
}

export async function loadV2CampaignManifest(adapter, campaignId, {
  layout = 'active'
} = {}) {
  return readJson(adapter, campaignManifestLogicalKey({
    campaignId: requireNonEmptyString(campaignId, 'campaignId'),
    layout
  }));
}

export async function loadV2MaterializedHead(adapter, {
  campaignId,
  saveId,
  layout = 'active'
} = {}) {
  return readJson(adapter, materializedHeadLogicalKey({
    campaignId: requireNonEmptyString(campaignId, 'campaignId'),
    saveId: requireNonEmptyString(saveId, 'saveId'),
    layout
  }));
}

function summarizeLegacyRuntime(campaignState = {}) {
  const runtimeTracking = campaignState.runtimeTracking || {};
  const turnLedger = campaignState.turnLedger || {};
  const modelCalls = Array.isArray(runtimeTracking.modelCallJournal)
    ? runtimeTracking.modelCallJournal
    : (Array.isArray(campaignState.modelCallJournal) ? campaignState.modelCallJournal : []);
  const sidecars = Array.isArray(runtimeTracking.sidecarJournal)
    ? runtimeTracking.sidecarJournal
    : (Array.isArray(campaignState.sidecarJournal) ? campaignState.sidecarJournal : []);
  return {
    ingressCount: Array.isArray(runtimeTracking.ingressLedger) ? runtimeTracking.ingressLedger.length : 0,
    responseCount: Array.isArray(runtimeTracking.responseLedger) ? runtimeTracking.responseLedger.length : 0,
    recoveryCount: Array.isArray(runtimeTracking.recoveryJournal) ? runtimeTracking.recoveryJournal.length : 0,
    historyCount: Array.isArray(runtimeTracking.history) ? runtimeTracking.history.length : 0,
    turnCount: Array.isArray(turnLedger.entries) ? turnLedger.entries.length : 0,
    lastCommittedOutcomeId: turnLedger.lastCommittedOutcomeId || null,
    modelCallCount: modelCalls.length,
    sidecarCount: sidecars.length
  };
}

function legacyHeadState(campaignState = {}) {
  const {
    runtimeTracking,
    turnLedger,
    modelCallJournal,
    sidecarJournal,
    ...headState
  } = campaignState || {};
  return redactExternalDiagnostic(cloneJson(headState));
}

function legacyHostRows(campaignState = {}) {
  const runtimeTracking = campaignState.runtimeTracking || {};
  const ingressRows = Array.isArray(runtimeTracking.ingressLedger) ? runtimeTracking.ingressLedger : [];
  const responseRows = Array.isArray(runtimeTracking.responseLedger) ? runtimeTracking.responseLedger : [];
  return [
    ...ingressRows.map((entry) => compact({
      hostMessageId: entry.hostMessageId || null,
      role: 'player',
      ingressId: entry.id || null,
      turnId: entry.turnId || null,
      outcomeId: entry.outcomeId || null,
      textHash: entry.textHash || null,
      status: entry.status || null
    })),
    ...responseRows.map((entry) => compact({
      hostMessageId: entry.hostMessageId || null,
      role: 'assistant',
      responseId: entry.id || null,
      turnId: entry.turnId || null,
      outcomeId: entry.outcomeId || null,
      status: entry.status || null
    }))
  ];
}

function legacyEvents(campaignState = {}) {
  const runtimeTracking = campaignState.runtimeTracking || {};
  const turnLedger = campaignState.turnLedger || {};
  const ingressRows = Array.isArray(runtimeTracking.ingressLedger) ? runtimeTracking.ingressLedger : [];
  const responseRows = Array.isArray(runtimeTracking.responseLedger) ? runtimeTracking.responseLedger : [];
  const turns = Array.isArray(turnLedger.entries) ? turnLedger.entries : [];
  return [
    ...ingressRows.map((entry, index) => compact({
      id: `legacy-ingress-${index + 1}`,
      type: 'legacyIngressImported',
      ingressId: entry.id || null,
      hostMessageId: entry.hostMessageId || null,
      turnId: entry.turnId || null,
      outcomeId: entry.outcomeId || null,
      textHash: entry.textHash || null,
      status: entry.status || null
    })),
    ...responseRows.map((entry, index) => compact({
      id: `legacy-response-${index + 1}`,
      type: 'legacyResponseImported',
      responseId: entry.id || null,
      hostMessageId: entry.hostMessageId || null,
      turnId: entry.turnId || null,
      outcomeId: entry.outcomeId || null,
      status: entry.status || null
    })),
    ...turns.map((entry, index) => compact({
      id: `legacy-turn-${index + 1}`,
      type: 'legacyTurnImported',
      turnId: entry.turnId || entry.id || null,
      outcomeId: entry.outcomeId || null,
      stateDeltaHash: entry.stateDelta ? hashStableJson(entry.stateDelta) : null,
      retainedPacketHash: entry.retainedPacket ? hashStableJson(entry.retainedPacket) : null,
      snapshotBeforeHash: entry.snapshotBefore ? hashStableJson(entry.snapshotBefore) : null
    }))
  ];
}

function legacyTurnEntries(campaignState = {}) {
  const turns = Array.isArray(campaignState.turnLedger?.entries) ? campaignState.turnLedger.entries : [];
  return turns.map((entry, index) => compact({
    id: `legacy-turn-entry-${index + 1}`,
    turnId: entry.turnId || entry.id || null,
    outcomeId: entry.outcomeId || null,
    phase: 'imported',
    sourceHash: hashStableJson({
      turnId: entry.turnId || entry.id || null,
      outcomeId: entry.outcomeId || null,
      stateDelta: entry.stateDelta || null
    }),
    snapshotAvailableInLegacySave: Boolean(entry.snapshotBefore),
    retainedPacketAvailableInLegacySave: Boolean(entry.retainedPacket)
  }));
}

function legacyDiagnostics(campaignState = {}) {
  const runtimeTracking = campaignState.runtimeTracking || {};
  const modelCalls = Array.isArray(runtimeTracking.modelCallJournal)
    ? runtimeTracking.modelCallJournal
    : (Array.isArray(campaignState.modelCallJournal) ? campaignState.modelCallJournal : []);
  const sidecars = Array.isArray(runtimeTracking.sidecarJournal)
    ? runtimeTracking.sidecarJournal
    : (Array.isArray(campaignState.sidecarJournal) ? campaignState.sidecarJournal : []);
  return [
    ...modelCalls.map((entry, index) => ({
      id: `legacy-model-call-${index + 1}`,
      type: 'legacyModelCallImported',
      sourceHash: hashStableJson(entry),
      status: entry.status || null
    })),
    ...sidecars.map((entry, index) => ({
      id: `legacy-sidecar-${index + 1}`,
      type: 'legacySidecarImported',
      worker: entry.worker || null,
      sourceHash: hashStableJson(entry),
      status: entry.status || null
    }))
  ];
}

function legacyImportCheckpoints(campaignState = {}, legacyHash, summary) {
  const turns = Array.isArray(campaignState.turnLedger?.entries) ? campaignState.turnLedger.entries : [];
  const retained = turns
    .filter((entry) => entry?.snapshotBefore)
    .slice(-20)
    .map((entry, index) => ({
      checkpointId: `legacy-turn-${String(index + 1).padStart(4, '0')}`,
      type: 'legacyTurnCheckpoint',
      turnId: entry.turnId || entry.id || null,
      outcomeId: entry.outcomeId || null,
      source: 'turnLedger.snapshotBefore',
      retained: true,
      snapshotHash: hashStableJson(entry.snapshotBefore),
      legacyFullSaveHash: legacyHash
    }));
  return [
    {
      checkpointId: 'legacy-import',
      type: 'legacyImportCheckpoint',
      legacyFullSaveHash: legacyHash,
      summary
    },
    ...retained
  ];
}

export async function importCampaignSaveRecordToV2(adapter, saveRecord, {
  now = null,
  branchId = 'main'
} = {}) {
  requireObject(saveRecord, 'saveRecord');
  if (saveRecord.kind !== 'directive.campaignSave') throw new Error('saveRecord must be a directive.campaignSave record');
  const campaignState = saveRecord.payload?.campaignState;
  requireObject(campaignState, 'saveRecord.payload.campaignState');
  const campaignId = requireNonEmptyString(campaignState.campaign?.id || saveRecord.metadata?.campaignId, 'campaignId');
  const saveId = requireNonEmptyString(saveRecord.id, 'saveId');
  const timestamp = now || saveRecord.updatedAt || isoNow();
  const legacyHash = hashStableJson(saveRecord);
  const summary = summarizeLegacyRuntime(campaignState);

  return commitV2SaveLayout(adapter, {
    campaignId,
    saveId,
    branchId,
    now: timestamp,
    importedFrom: {
      kind: saveRecord.kind,
      schemaVersion: saveRecord.schemaVersion || null,
      saveId,
      slotType: saveRecord.slotType || null,
      current: saveRecord.current === true,
      revision: saveRecord.revision || null,
      updatedAt: saveRecord.updatedAt || null,
      metadata: cloneJson(saveRecord.metadata || null),
      legacyFullSaveHash: legacyHash,
      summary
    },
    current: saveRecord.current === true,
    metadata: saveRecord.metadata || null,
    head: {
      importedFromLegacySave: true,
      legacyFullSaveHash: legacyHash,
      state: legacyHeadState(campaignState),
      legacyRuntimeSummary: summary
    },
    hostMap: {
      excludesRawChatText: true,
      rows: legacyHostRows(campaignState)
    },
    promptCache: {
      directiveOwnedRevision: campaignState.campaignChatBinding?.promptContextRevision || null,
      importedFromLegacySave: true,
      externalPromptEnvironmentRef: null,
      blocks: []
    },
    eventSegments: [legacyEvents(campaignState)],
    turnSegments: [legacyTurnEntries(campaignState)],
    diagnosticsSegments: [legacyDiagnostics(campaignState)],
    checkpoints: legacyImportCheckpoints(campaignState, legacyHash, summary)
  });
}
