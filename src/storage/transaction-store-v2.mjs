import {
  hashStableJson,
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
  coreMaterializedHeadRootV2LogicalKey,
  coreMaterializedHeadV2LogicalKey,
  corePromptCacheV2LogicalKey,
  coreSaveManifestV2LogicalKey,
  coreTurnSegmentV2LogicalKey,
  diagnosticsSegmentV2LogicalKey,
  eventSegmentV2LogicalKey,
  hostMapV2LogicalKey,
  materializedHeadRootV2LogicalKey,
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

function segmentMaxBytesFor(segmentType, segmentMaxBytes = null) {
  if (Number.isFinite(Number(segmentMaxBytes))) return Number(segmentMaxBytes);
  if (!isObject(segmentMaxBytes)) return segmentLimit(segmentType);
  const direct = segmentMaxBytes[segmentType];
  const named = segmentMaxBytes[`${segmentType}SegmentBytes`];
  const value = Number(direct ?? named);
  return Number.isFinite(value) ? value : segmentLimit(segmentType);
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

function segmentLogicalKeyBelongsTo({ logicalKey, segmentType, campaignId, saveId, layout = 'active' }) {
  const storageLayout = normalizeV2Layout(layout);
  const folder = segmentType === 'event'
    ? 'events'
    : (segmentType === 'turn' ? 'turns' : 'diagnostics');
  const prefix = storageLayout === 'core'
    ? `campaigns/${campaignId}/saves/${saveId}/core/${folder}/`
    : `campaigns/${campaignId}/saves/${saveId}/${folder}/`;
  return String(logicalKey || '').startsWith(prefix) && String(logicalKey || '').endsWith('.v2.json');
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

function materializedHeadRootLogicalKey({ campaignId, saveId, root, layout = 'active' }) {
  return normalizeV2Layout(layout) === 'core'
    ? coreMaterializedHeadRootV2LogicalKey({ campaignId, saveId, root })
    : materializedHeadRootV2LogicalKey({ campaignId, saveId, root });
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
  let start = 0;
  while (start < allEntries.length) {
    const segmentId = String(chunks.length).padStart(4, '0');
    const firstCandidate = createV2SegmentRecord({
      segmentType: type,
      campaignId,
      saveId,
      segmentId,
      entries: allEntries.slice(start, start + 1),
      createdAt,
      source
    });
    if (firstCandidate.byteLength > limit) {
      const error = new Error(`${type} segment entry exceeds ${limit} bytes`);
      error.code = 'DIRECTIVE_V2_SEGMENT_ENTRY_TOO_LARGE';
      error.details = { segmentType: type, byteLength: firstCandidate.byteLength, maxBytes: limit };
      throw error;
    }

    let bestEnd = start + 1;
    let low = start + 2;
    let high = allEntries.length;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = createV2SegmentRecord({
        segmentType: type,
        campaignId,
        saveId,
        segmentId,
        entries: allEntries.slice(start, mid),
        createdAt,
        source
      });
      if (candidate.byteLength <= limit) {
        bestEnd = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    chunks.push(allEntries.slice(start, bestEnd));
    start = bestEnd;
  }
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

async function deleteJsonFileIfSupported(adapter, logicalKey) {
  if (!logicalKey || typeof adapter.deleteJsonFile !== 'function') return false;
  try {
    await adapter.deleteJsonFile(logicalKey);
    return true;
  } catch {
    return false;
  }
}

async function cleanupReplacedSegmentRefs(adapter, {
  beforeRefs = [],
  afterRefs = [],
  segmentType,
  campaignId,
  saveId,
  layout = 'active'
} = {}) {
  const afterKeys = new Set((afterRefs || []).map((ref) => ref?.logicalKey).filter(Boolean));
  let deleted = 0;
  for (const ref of beforeRefs || []) {
    if (!ref?.logicalKey || afterKeys.has(ref.logicalKey)) continue;
    if (!segmentLogicalKeyBelongsTo({ logicalKey: ref.logicalKey, segmentType, campaignId, saveId, layout })) continue;
    if (await deleteJsonFileIfSupported(adapter, ref.logicalKey)) deleted += 1;
  }
  return { deleted };
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

function isMissingV2ManifestError(error) {
  return error?.code === 'ENOENT'
    || error?.code === 'DIRECTIVE_FAKE_HOST_FILE_MISSING'
    || /not found/i.test(String(error?.message || ''));
}

async function loadExistingManifestForReuse(adapter, {
  campaignId,
  saveId,
  layout
} = {}) {
  try {
    return await loadV2SaveManifest(adapter, { campaignId, saveId, layout });
  } catch (error) {
    if (isMissingV2ManifestError(error)) return null;
    throw error;
  }
}

async function loadReusableSegment(adapter, ref = null) {
  if (!ref?.logicalKey) return null;
  try {
    const record = await readV2ArtifactRef(adapter, ref);
    return { ref: cloneJson(ref), record };
  } catch {
    // A broken existing ref should not block a full rewrite of that segment.
    return null;
  }
}

function canReusePublishedSegmentRef({
  ref,
  segmentType,
  campaignId,
  saveId,
  segmentId,
  entries = [],
  layout = 'active'
} = {}) {
  if (!ref?.logicalKey) return false;
  return segmentLogicalKeyBelongsTo({ logicalKey: ref.logicalKey, segmentType, campaignId, saveId, layout })
    && typeof ref.hash === 'string'
    && ref.hash.length > 0
    && Number.isFinite(Number(ref.byteLength))
    && ref.kind === segmentKind(segmentType)
    && Number(ref.entryCount) === entries.length;
}

function refsEqual(left = [], right = []) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  return left.every((ref, index) => (
    ref?.logicalKey === right[index]?.logicalKey
    && ref?.hash === right[index]?.hash
    && ref?.byteLength === right[index]?.byteLength
    && ref?.entryCount === right[index]?.entryCount
  ));
}

function segmentEntriesEqual(left = {}, right = {}) {
  return left?.kind === right?.kind
    && left?.schemaVersion === right?.schemaVersion
    && left?.campaignId === right?.campaignId
    && left?.saveId === right?.saveId
    && Number(left?.entryCount) === Number(right?.entryCount)
    && hashStableJson(left?.entries || []) === hashStableJson(right?.entries || []);
}

function mergeArtifactRefs(...groups) {
  const merged = [];
  const seen = new Set();
  for (const group of groups) {
    for (const ref of group || []) {
      if (!ref?.logicalKey) continue;
      const key = `${ref.logicalKey}:${ref.hash || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(cloneJson(ref));
    }
  }
  return merged;
}

function refsAfterAppend({ baseRefs = [], latestRefs = [], appendedRefs = [] } = {}) {
  const base = (baseRefs || []).map(cloneJson);
  const latest = (latestRefs || []).map(cloneJson);
  const appended = (appendedRefs || []).map(cloneJson);
  if (refsEqual(latest, base)) return appended;
  if (refsEqual(appended, base)) return latest;
  return mergeArtifactRefs(latest, appended);
}

async function readRecentSegmentEntryIds(adapter, refs = [], maxSegments = 3) {
  const ids = new Set();
  const tailRefs = (refs || []).slice(-Math.max(1, Number(maxSegments) || 1));
  for (const ref of tailRefs) {
    try {
      const segment = await readV2ArtifactRef(adapter, ref);
      for (const entry of segment.entries || []) {
        if (entry?.id) ids.add(entry.id);
      }
    } catch {
      // Missing or corrupt old diagnostic tails are handled by appending the recent window below.
    }
  }
  return ids;
}

function diagnosticsEntryGroupsWithRecentRepair({
  persistedIds = new Set(),
  diagnosticsSegments = [],
  recentDiagnostics = []
} = {}) {
  const nextEntries = normalizeEntryGroups(diagnosticsSegments);
  const nextIds = new Set(nextEntries.map((entry) => entry?.id).filter(Boolean));
  const repairEntries = [];
  for (const entry of recentDiagnostics || []) {
    if (!entry?.id || persistedIds.has(entry.id) || nextIds.has(entry.id)) continue;
    repairEntries.push(cloneJson(entry));
    nextIds.add(entry.id);
  }
  if (!repairEntries.length) return diagnosticsSegments;
  return [[...repairEntries, ...nextEntries]];
}

const v2AppendCommitQueues = new Map();

async function enqueueV2AppendCommit({ campaignId, saveId, layout = 'active' } = {}, task) {
  const key = `${normalizeV2Layout(layout)}:${requireNonEmptyString(campaignId, 'campaignId')}:${requireNonEmptyString(saveId, 'saveId')}`;
  const prior = v2AppendCommitQueues.get(key) || Promise.resolve();
  const run = prior.then(task, task);
  const settled = run.then(() => null, () => null);
  v2AppendCommitQueues.set(key, settled);
  try {
    return await run;
  } finally {
    if (v2AppendCommitQueues.get(key) === settled) v2AppendCommitQueues.delete(key);
  }
}

function versionedSegmentIdForWrite(options = {}) {
  const base = requireNonEmptyString(options.segmentId, 'segmentId');
  const fingerprint = hashStableJson({
    segmentType: options.segmentType || null,
    entries: options.entries || [],
    createdAt: options.createdAt || null,
    source: options.source || null
  }).slice(0, 12);
  return `${base}-${fingerprint}`;
}

async function writeV2SegmentMaybeReuse(adapter, options = {}, existingSegment = null, {
  avoidOverwriteExistingRef = false
} = {}) {
  const logicalKey = segmentLogicalKey({
    segmentType: options.segmentType,
    campaignId: options.campaignId,
    saveId: options.saveId,
    segmentId: options.segmentId,
    layout: options.layout
  });
  const existing = existingSegment?.ref?.logicalKey === logicalKey
    || segmentLogicalKeyBelongsTo({
      logicalKey: existingSegment?.ref?.logicalKey,
      segmentType: options.segmentType,
      campaignId: options.campaignId,
      saveId: options.saveId,
      layout: options.layout
    })
    ? existingSegment
    : null;
  const record = createV2SegmentRecord({
    ...options,
    createdAt: existing?.record?.createdAt || options.createdAt,
    source: existing?.record?.source || options.source
  });
  const maxBytes = Number(options.maxBytes || segmentLimit(options.segmentType));
  if (record.byteLength > maxBytes) {
    const error = new Error(`${options.segmentType} segment ${record.segmentId} exceeds ${maxBytes} bytes`);
    error.code = 'DIRECTIVE_V2_SEGMENT_TOO_LARGE';
    error.details = { segmentType: options.segmentType, segmentId: record.segmentId, byteLength: record.byteLength, maxBytes };
    throw error;
  }
  const normalizedLogicalKey = segmentLogicalKey({
    segmentType: options.segmentType,
    campaignId: record.campaignId,
    saveId: record.saveId,
    segmentId: record.segmentId,
    layout: options.layout
  });
  const nextRef = artifactRef({ logicalKey: normalizedLogicalKey, record });
  if (existing?.ref?.logicalKey && segmentEntriesEqual(existing.record, record)) {
    return {
      record: existing.record,
      ref: cloneJson(existing.ref),
      reused: true,
      wrote: false
    };
  }
  if (existing?.ref?.hash === nextRef.hash && existing.ref.byteLength === nextRef.byteLength) {
    return {
      record: existing.record,
      ref: cloneJson(existing.ref),
      reused: true,
      wrote: false
    };
  }
  let recordToWrite = record;
  let logicalKeyToWrite = normalizedLogicalKey;
  let refToWrite = nextRef;
  if (avoidOverwriteExistingRef && existing?.ref?.logicalKey) {
    const versionedSegmentId = versionedSegmentIdForWrite(options);
    const segmentCreatedAt = existing?.record?.createdAt || options.createdAt;
    const segmentSource = existing?.record?.source || options.source;
    recordToWrite = createV2SegmentRecord({
      ...options,
      segmentId: versionedSegmentId,
      createdAt: segmentCreatedAt,
      source: segmentSource
    });
    if (recordToWrite.byteLength > maxBytes) {
      const error = new Error(`${options.segmentType} segment ${recordToWrite.segmentId} exceeds ${maxBytes} bytes`);
      error.code = 'DIRECTIVE_V2_SEGMENT_TOO_LARGE';
      error.details = { segmentType: options.segmentType, segmentId: recordToWrite.segmentId, byteLength: recordToWrite.byteLength, maxBytes };
      throw error;
    }
    logicalKeyToWrite = segmentLogicalKey({
      segmentType: options.segmentType,
      campaignId: recordToWrite.campaignId,
      saveId: recordToWrite.saveId,
      segmentId: recordToWrite.segmentId,
      layout: options.layout
    });
    refToWrite = artifactRef({ logicalKey: logicalKeyToWrite, record: recordToWrite });
  }
  await writeJson(adapter, logicalKeyToWrite, recordToWrite);
  return {
    record: recordToWrite,
    ref: refToWrite,
    reused: false,
    wrote: true
  };
}

async function writeV2SegmentForCommit(adapter, options = {}, {
  existingRef = null,
  reusePublishedRef = false
} = {}) {
  if (reusePublishedRef && canReusePublishedSegmentRef({ ref: existingRef, ...options })) {
    return {
      record: null,
      ref: cloneJson(existingRef),
      reused: true,
      wrote: false,
      trustedPublishedRef: true
    };
  }
  return writeV2SegmentMaybeReuse(adapter, options, await loadReusableSegment(adapter, existingRef), {
    avoidOverwriteExistingRef: Boolean(existingRef?.logicalKey)
  });
}

async function appendV2SegmentEntriesForCommit(adapter, {
  segmentType,
  campaignId,
  saveId,
  currentRefs = [],
  entryGroups = [],
  createdAt = null,
  layout = 'active',
  maxBytes = null,
  appendToTail = true
} = {}) {
  const type = requireNonEmptyString(segmentType, 'segmentType');
  const refs = currentRefs.map(cloneJson);
  const newEntries = normalizeEntryGroups(entryGroups);
  const refsToVerify = [];
  const verificationLogicalKeys = [];
  if (newEntries.length === 0) {
    return { refs, refsToVerify, verificationLogicalKeys };
  }

  const limit = Number(maxBytes || segmentLimit(type));
  let remaining = [...newEntries];
  if (appendToTail !== false && refs.length > 0) {
    const tailIndex = refs.length - 1;
    const tailRef = refs[tailIndex];
    const tailRecord = await readV2ArtifactRef(adapter, tailRef);
    const tailEntries = Array.isArray(tailRecord.entries) ? tailRecord.entries.map(cloneJson) : [];
    const appendedTailEntries = [...tailEntries];
    while (remaining.length > 0) {
      const candidateEntries = [...appendedTailEntries, remaining[0]];
      const candidate = createV2SegmentRecord({
        segmentType: type,
        campaignId,
        saveId,
        segmentId: String(tailIndex).padStart(4, '0'),
        entries: candidateEntries,
        createdAt: tailRecord.createdAt || createdAt,
        source: tailRecord.source || null
      });
      if (candidate.byteLength > limit) break;
      appendedTailEntries.push(remaining.shift());
    }
    if (appendedTailEntries.length > tailEntries.length) {
      const result = await writeV2SegmentMaybeReuse(adapter, {
        segmentType: type,
        campaignId,
        saveId,
        segmentId: String(tailIndex).padStart(4, '0'),
        entries: appendedTailEntries,
        createdAt,
        layout,
        maxBytes: limit
      }, {
        ref: cloneJson(tailRef),
        record: tailRecord
      }, {
        avoidOverwriteExistingRef: true
      });
      refs[tailIndex] = result.ref;
      if (result.wrote) {
        refsToVerify.push(result.ref);
        verificationLogicalKeys.push(result.ref.logicalKey);
      }
    }
  }

  if (remaining.length > 0) {
    const chunks = chunkV2SegmentEntries({
      segmentType: type,
      campaignId,
      saveId,
      entries: remaining,
      createdAt,
      maxBytes: limit
    });
    for (const [index, entries] of chunks.entries()) {
      const result = await writeV2SegmentForCommit(adapter, {
        segmentType: type,
        campaignId,
        saveId,
        segmentId: String(refs.length + index).padStart(4, '0'),
        entries,
        createdAt,
        layout,
        maxBytes: limit
      });
      refs.push(result.ref);
      if (result.wrote) {
        refsToVerify.push(result.ref);
        verificationLogicalKeys.push(result.ref.logicalKey);
      }
    }
  }

  return { refs, refsToVerify, verificationLogicalKeys };
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
  layout = 'active',
  existingRef = null,
  reuseIfEquivalent = false
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
  if (reuseIfEquivalent === true && existingRef?.logicalKey === logicalKey) {
    try {
      const existing = await readV2ArtifactRef(adapter, existingRef);
      const comparableExisting = stripVolatileArtifactFields(existing);
      const comparableRecord = stripVolatileArtifactFields(record);
      delete comparableExisting.createdAt;
      delete comparableRecord.createdAt;
      if (isObject(comparableExisting.checkpoint)) delete comparableExisting.checkpoint.reason;
      if (isObject(comparableRecord.checkpoint)) delete comparableRecord.checkpoint.reason;
      if (hashStableJson(comparableExisting) === hashStableJson(comparableRecord)) {
        return {
          record: existing,
          ref: cloneJson(existingRef),
          reused: true,
          wrote: false
        };
      }
    } catch {
      // Broken refs are repaired by writing the candidate checkpoint below.
    }
  }
  await writeJson(adapter, logicalKey, record);
  return {
    record,
    ref: artifactRef({ logicalKey, record }),
    reused: false,
    wrote: true
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

function contentAddressedArtifactLogicalKey(logicalKey, hash) {
  const text = requireNonEmptyString(logicalKey, 'logicalKey');
  const digest = requireNonEmptyString(hash, 'artifact hash');
  if (text.endsWith('.v2.json')) return text.replace(/\.v2\.json$/, `.${digest}.v2.json`);
  if (text.endsWith('.json')) return text.replace(/\.json$/, `.${digest}.json`);
  return `${text}.${digest}`;
}

async function writeContentAddressedArtifact(adapter, logicalKey, value) {
  const record = withArtifactMetadata(value);
  const contentKey = contentAddressedArtifactLogicalKey(logicalKey, record.hash);
  const ref = artifactRef({ logicalKey: contentKey, record });
  try {
    await readV2ArtifactRef(adapter, ref);
    return {
      record,
      ref,
      reused: true,
      wrote: false
    };
  } catch {
    await writeJson(adapter, contentKey, record);
    return {
      record,
      ref,
      reused: false,
      wrote: true
    };
  }
}

function stripVolatileArtifactFields(record = {}) {
  const stripped = cloneJson(record || {});
  delete stripped.hash;
  delete stripped.byteLength;
  delete stripped.updatedAt;
  return stripped;
}

function stripRuntimeProjectionOnlyHeadFields(record = {}) {
  const stripped = stripVolatileArtifactFields(record);
  delete stripped.runtimeSummary;
  delete stripped.runtimeHeadBudget;
  delete stripped.materializedHeadStateHash;
  delete stripped.runtimeProjectionState;
  if (isObject(stripped.state)) {
    delete stripped.state.runtimeResume;
  }
  return stripped;
}

function reusableHeadWriteForRuntimeProjectionOnly(existingHead = null, existingRef = null, nextHead = null) {
  if (!isObject(existingHead) || !existingRef?.logicalKey || !isObject(nextHead)) return null;
  if (
    hashStableJson(stripRuntimeProjectionOnlyHeadFields(existingHead))
    !== hashStableJson(stripRuntimeProjectionOnlyHeadFields(nextHead))
  ) {
    return null;
  }
  return {
    record: cloneJson(existingHead),
    ref: cloneJson(existingRef),
    reused: true,
    wrote: false,
    ignoredRuntimeProjectionOnlyChange: true
  };
}

function reusableContentWriteForUpdatedAtOnly(existingRecord = null, existingRef = null, nextRecord = null) {
  if (!isObject(existingRecord) || !existingRef?.logicalKey || !isObject(nextRecord)) return null;
  if (hashStableJson(stripVolatileArtifactFields(existingRecord)) !== hashStableJson(stripVolatileArtifactFields(nextRecord))) {
    return null;
  }
  return {
    record: cloneJson(existingRecord),
    ref: cloneJson(existingRef),
    reused: true,
    wrote: false,
    ignoredVolatileOnlyChange: true
  };
}

async function writeArtifactMaybeReuse(adapter, logicalKey, value, existingRef = null, {
  ignoreUpdatedAtOnly = false,
  ignoreRuntimeProjectionOnly = false
} = {}) {
  const record = withArtifactMetadata(value);
  if (existingRef?.logicalKey === logicalKey) {
    try {
      const existing = await readV2ArtifactRef(adapter, existingRef);
      const existingRefVerified = artifactRef({ logicalKey, record: existing });
      if (
        existingRefVerified.hash === record.hash
        && existingRefVerified.byteLength === record.byteLength
      ) {
        return {
          record: existing,
          ref: cloneJson(existingRef),
          reused: true,
          wrote: false
        };
      }
      if (
        ignoreUpdatedAtOnly
        && hashStableJson(stripVolatileArtifactFields(existing)) === hashStableJson(stripVolatileArtifactFields(record))
      ) {
        return {
          record: existing,
          ref: cloneJson(existingRef),
          reused: true,
          wrote: false,
          ignoredVolatileOnlyChange: true
        };
      }
      if (
        ignoreRuntimeProjectionOnly
        && hashStableJson(stripRuntimeProjectionOnlyHeadFields(existing)) === hashStableJson(stripRuntimeProjectionOnlyHeadFields(record))
      ) {
        return {
          record: existing,
          ref: cloneJson(existingRef),
          reused: true,
          wrote: false,
          ignoredRuntimeProjectionOnlyChange: true
        };
      }
    } catch {
      // Broken refs are repaired by writing the candidate artifact below.
    }
  }
  await writeJson(adapter, logicalKey, record);
  return {
    record,
    ref: artifactRef({ logicalKey, record }),
    reused: false,
    wrote: true
  };
}

function materializedHeadRootSegment(root) {
  const text = requireNonEmptyString(root, 'materialized head root');
  const slug = text
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'root';
  return `${slug}-${hashStableJson(text).slice(0, 12)}`;
}

function createMaterializedHeadRootRecord({
  campaignId,
  saveId,
  branchId = 'main',
  root,
  value,
  updatedAt,
  layout = 'active'
} = {}) {
  return {
    kind: 'directive.materializedCampaignHeadRoot.v2',
    schemaVersion: 2,
    layout: normalizeV2Layout(layout),
    campaignId: requireNonEmptyString(campaignId, 'campaignId'),
    saveId: requireNonEmptyString(saveId, 'saveId'),
    branchId,
    root: requireNonEmptyString(root, 'materialized head root'),
    updatedAt: updatedAt || isoNow(),
    value: cloneJson(value)
  };
}

async function readReusableArtifact(adapter, ref = null) {
  if (!ref?.logicalKey) return null;
  try {
    return await readV2ArtifactRef(adapter, ref);
  } catch {
    return null;
  }
}

async function prepareMaterializedHeadForCommit(adapter, {
  campaignId,
  saveId,
  branchId = 'main',
  head = {},
  updatedAt,
  layout = 'active',
  existingHead = null
} = {}) {
  const storageLayout = normalizeV2Layout(layout);
  const baseHead = {
    ...cloneJson(head || {}),
    kind: 'directive.materializedCampaignHead.v2',
    schemaVersion: 2,
    layout: storageLayout,
    campaignId,
    saveId,
    branchId,
    updatedAt: updatedAt || isoNow()
  };
  if (storageLayout !== 'active' || !isObject(baseHead.state)) {
    return {
      record: baseHead,
      refsToVerify: []
    };
  }

  const existingRootRefs = isObject(existingHead?.stateRootRefs) ? existingHead.stateRootRefs : {};
  const stateRootRefs = {};
  const runtimeProjectionState = {};
  const refsToVerify = [];
  for (const [root, value] of Object.entries(baseHead.state).sort(([left], [right]) => left.localeCompare(right))) {
    if (root === 'runtimeResume') {
      runtimeProjectionState[root] = cloneJson(value);
      continue;
    }
    const rootKey = materializedHeadRootLogicalKey({
      campaignId,
      saveId,
      root: materializedHeadRootSegment(root),
      layout: storageLayout
    });
    const rootRecord = createMaterializedHeadRootRecord({
      campaignId,
      saveId,
      branchId,
      root,
      value,
      updatedAt,
      layout: storageLayout
    });
    const existingRootRef = existingRootRefs[root] || null;
    const existingRoot = await readReusableArtifact(adapter, existingRootRef);
    const rootWrite = reusableContentWriteForUpdatedAtOnly(
      existingRoot,
      existingRootRef,
      withArtifactMetadata(rootRecord)
    ) || await writeContentAddressedArtifact(adapter, rootKey, rootRecord);
    stateRootRefs[root] = rootWrite.ref;
    if (rootWrite.wrote) refsToVerify.push(rootWrite.ref);
  }

  const { state, ...headWithoutState } = baseHead;
  return {
    record: compact({
      ...headWithoutState,
      stateStorage: 'rootRefs',
      stateRootCount: Object.keys(stateRootRefs).length,
      stateRootRefs,
      runtimeProjectionState: Object.keys(runtimeProjectionState).length ? runtimeProjectionState : undefined
    }),
    refsToVerify
  };
}

async function hydrateMaterializedHeadState(adapter, head = {}) {
  if (isObject(head.state) || !isObject(head.stateRootRefs)) return head;
  const state = {};
  for (const [root, ref] of Object.entries(head.stateRootRefs)) {
    const rootRecord = await readV2ArtifactRef(adapter, ref);
    if (rootRecord.root && rootRecord.root !== root) {
      const error = new Error(`Materialized head root mismatch for ${root}`);
      error.code = 'DIRECTIVE_V2_HEAD_ROOT_MISMATCH';
      error.details = { expected: root, actual: rootRecord.root, logicalKey: ref.logicalKey || null };
      throw error;
    }
    state[root] = cloneJson(rootRecord.value);
  }
  if (isObject(head.runtimeProjectionState)) {
    Object.assign(state, cloneJson(head.runtimeProjectionState));
  }
  return {
    ...head,
    state,
    hydratedStateRootCount: Object.keys(state).length
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
  layout = 'active',
  reuseExistingSegmentRefs = false,
  segmentMaxBytes = null
} = {}) {
  const id = requireNonEmptyString(campaignId, 'campaignId');
  const save = requireNonEmptyString(saveId, 'saveId');
  const timestamp = now || isoNow();
  const storageLayout = normalizeV2Layout(layout);
  return enqueueV2AppendCommit({ campaignId: id, saveId: save, layout: storageLayout }, async () => {
  const existingManifest = reuseExistingSegmentRefs === true
    ? await loadExistingManifestForReuse(adapter, { campaignId: id, saveId: save, layout: storageLayout })
    : null;
  const existingEventSegmentRefs = existingManifest?.eventSegments || [];
  const existingTurnSegmentRefs = existingManifest?.turnSegments || [];
  const existingDiagnosticsSegmentRefs = existingManifest?.diagnosticsSegments || [];
  const segmentRefsToVerify = [];
  const verificationLogicalKeys = [];
  const eventSegmentMaxBytes = segmentMaxBytesFor('event', segmentMaxBytes);
  const turnSegmentMaxBytes = segmentMaxBytesFor('turn', segmentMaxBytes);
  const diagnosticsSegmentMaxBytes = segmentMaxBytesFor('diagnostics', segmentMaxBytes);

  const eventSegmentRefs = [];
  const eventChunks = chunkV2SegmentEntries({
    segmentType: 'event',
    campaignId: id,
    saveId: save,
    entries: eventSegments,
    createdAt: timestamp,
    maxBytes: eventSegmentMaxBytes
  });
  for (const [index, entries] of eventChunks.entries()) {
    const result = await writeV2SegmentForCommit(adapter, {
      segmentType: 'event',
      campaignId: id,
      saveId: save,
      segmentId: String(index).padStart(4, '0'),
      entries,
      createdAt: timestamp,
      layout: storageLayout,
      maxBytes: eventSegmentMaxBytes
    }, {
      existingRef: existingEventSegmentRefs[index] || null,
      reusePublishedRef: Boolean(existingManifest)
        && index < existingEventSegmentRefs.length - 1
        && index < eventChunks.length - 1
    });
    eventSegmentRefs.push(result.ref);
    if (result.wrote) {
      segmentRefsToVerify.push(result.ref);
      verificationLogicalKeys.push(result.ref.logicalKey);
    }
  }

  const turnSegmentRefs = [];
  const turnChunks = chunkV2SegmentEntries({
    segmentType: 'turn',
    campaignId: id,
    saveId: save,
    entries: turnSegments,
    createdAt: timestamp,
    maxBytes: turnSegmentMaxBytes
  });
  for (const [index, entries] of turnChunks.entries()) {
    const result = await writeV2SegmentForCommit(adapter, {
      segmentType: 'turn',
      campaignId: id,
      saveId: save,
      segmentId: String(index).padStart(4, '0'),
      entries,
      createdAt: timestamp,
      layout: storageLayout,
      maxBytes: turnSegmentMaxBytes
    }, {
      existingRef: existingTurnSegmentRefs[index] || null,
      reusePublishedRef: Boolean(existingManifest)
        && index < existingTurnSegmentRefs.length - 1
        && index < turnChunks.length - 1
    });
    turnSegmentRefs.push(result.ref);
    if (result.wrote) {
      segmentRefsToVerify.push(result.ref);
      verificationLogicalKeys.push(result.ref.logicalKey);
    }
  }

  const diagnosticsSegmentRefs = [];
  const diagnosticsChunks = chunkV2SegmentEntries({
    segmentType: 'diagnostics',
    campaignId: id,
    saveId: save,
    entries: diagnosticsSegments,
    createdAt: timestamp,
    maxBytes: diagnosticsSegmentMaxBytes
  });
  for (const [index, entries] of diagnosticsChunks.entries()) {
    const result = await writeV2SegmentForCommit(adapter, {
      segmentType: 'diagnostics',
      campaignId: id,
      saveId: save,
      segmentId: String(index).padStart(4, '0'),
      entries,
      createdAt: timestamp,
      layout: storageLayout,
      maxBytes: diagnosticsSegmentMaxBytes
    }, {
      existingRef: existingDiagnosticsSegmentRefs[index] || null,
      reusePublishedRef: Boolean(existingManifest)
        && index < existingDiagnosticsSegmentRefs.length - 1
        && index < diagnosticsChunks.length - 1
    });
    diagnosticsSegmentRefs.push(result.ref);
    if (result.wrote) {
      segmentRefsToVerify.push(result.ref);
      verificationLogicalKeys.push(result.ref.logicalKey);
    }
  }

  const checkpointRefs = [];
  for (const [index, checkpoint] of checkpoints.entries()) {
    const checkpointWrite = await writeV2Checkpoint(adapter, {
      campaignId: id,
      saveId: save,
      checkpointId: checkpoint.checkpointId || checkpoint.id,
      checkpoint,
      createdAt: timestamp,
      layout: storageLayout,
      existingRef: existingManifest?.checkpoints?.[index] || null,
      reuseIfEquivalent: true
    });
    checkpointRefs.push(checkpointWrite.ref);
  }

  const existingHead = await readReusableArtifact(adapter, existingManifest?.head || null);
  const preparedHead = await prepareMaterializedHeadForCommit(adapter, {
    campaignId: id,
    saveId: save,
    branchId,
    head,
    updatedAt: timestamp,
    layout: storageLayout,
    existingHead
  });
  const headKey = materializedHeadLogicalKey({ campaignId: id, saveId: save, layout: storageLayout });
  const headWrite = reusableHeadWriteForRuntimeProjectionOnly(
    existingHead,
    existingManifest?.head || null,
    withArtifactMetadata(preparedHead.record)
  ) || await writeContentAddressedArtifact(adapter, headKey, preparedHead.record);
  const hostMapKey = hostMapLogicalKey({ campaignId: id, saveId: save, layout: storageLayout });
  const hostMapWrite = hostMap ? await writeArtifactMaybeReuse(adapter, hostMapKey, {
    ...cloneJson(hostMap),
    kind: 'directive.hostMessageMap.v2',
    schemaVersion: 2,
    layout: storageLayout,
    campaignId: id,
    saveId: save,
    updatedAt: timestamp
  }, existingManifest?.hostMap || null, {
    ignoreUpdatedAtOnly: true
  }) : null;
  const promptCacheKey = promptCacheLogicalKey({ campaignId: id, saveId: save, layout: storageLayout });
  const promptCacheWrite = promptCache ? await writeArtifactMaybeReuse(adapter, promptCacheKey, {
    ...cloneJson(promptCache),
    kind: 'directive.promptCache.v2',
    schemaVersion: 2,
    layout: storageLayout,
    campaignId: id,
    saveId: save,
    updatedAt: timestamp
  }, existingManifest?.promptCache || null, {
    ignoreUpdatedAtOnly: true
  }) : null;

  await verifyV2ArtifactRefs(adapter, [
    ...preparedHead.refsToVerify,
    ...segmentRefsToVerify,
    ...checkpointRefs,
    headWrite.wrote ? headWrite.ref : null,
    hostMapWrite?.wrote ? hostMapWrite.ref : null,
    promptCacheWrite?.wrote ? promptCacheWrite.ref : null
  ]);

  const latestManifest = reuseExistingSegmentRefs === true
    ? await loadExistingManifestForReuse(adapter, { campaignId: id, saveId: save, layout: storageLayout })
    : null;
  const finalEventSegmentRefs = latestManifest
    ? refsAfterAppend({
        baseRefs: existingEventSegmentRefs,
        latestRefs: latestManifest.eventSegments || [],
        appendedRefs: eventSegmentRefs
      })
    : eventSegmentRefs;
  const finalTurnSegmentRefs = latestManifest
    ? refsAfterAppend({
        baseRefs: existingTurnSegmentRefs,
        latestRefs: latestManifest.turnSegments || [],
        appendedRefs: turnSegmentRefs
      })
    : turnSegmentRefs;
  const finalDiagnosticsSegmentRefs = latestManifest
    ? refsAfterAppend({
        baseRefs: existingDiagnosticsSegmentRefs,
        latestRefs: latestManifest.diagnosticsSegments || [],
        appendedRefs: diagnosticsSegmentRefs
      })
    : diagnosticsSegmentRefs;
  const finalCheckpointRefs = checkpointRefs.length > 0
    ? checkpointRefs
    : (latestManifest?.checkpoints || existingManifest?.checkpoints || []);
  const saveManifest = createV2SaveManifest({
    campaignId: id,
    saveId: save,
    branchId,
    headRef: headWrite.ref,
    hostMapRef: hostMapWrite?.ref || null,
    promptCacheRef: promptCacheWrite?.ref || null,
    eventSegmentRefs: finalEventSegmentRefs,
    turnSegmentRefs: finalTurnSegmentRefs,
    diagnosticsSegmentRefs: finalDiagnosticsSegmentRefs,
    checkpointRefs: finalCheckpointRefs,
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
  await writeArtifactMaybeReuse(adapter, headKey, preparedHead.record, { logicalKey: headKey }, {
    ignoreUpdatedAtOnly: true,
    ignoreRuntimeProjectionOnly: true
  });

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
    ...new Set(verificationLogicalKeys),
    ...preparedHead.refsToVerify.map((ref) => ref.logicalKey),
    ...checkpointRefs.map((ref) => ref.logicalKey),
    ...(headWrite.wrote ? [headWrite.ref.logicalKey] : []),
    ...(hostMapWrite?.wrote ? [hostMapWrite.ref.logicalKey] : []),
    ...(promptCacheWrite?.wrote ? [promptCacheWrite.ref.logicalKey] : []),
    saveManifestKey,
    campaignManifestKey
  ]);

  const cleanup = {
    replacedDiagnostics: await cleanupReplacedSegmentRefs(adapter, {
      beforeRefs: existingDiagnosticsSegmentRefs,
      afterRefs: finalDiagnosticsSegmentRefs,
      segmentType: 'diagnostics',
      campaignId: id,
      saveId: save,
      layout: storageLayout
    })
  };

  return {
    campaignManifest,
    campaignManifestRef: artifactRef({ logicalKey: campaignManifestKey, record: campaignManifest }),
    saveManifest,
    saveManifestRef,
    refs: {
      head: headWrite.ref,
      hostMap: hostMapWrite?.ref || null,
      promptCache: promptCacheWrite?.ref || null,
      eventSegments: finalEventSegmentRefs,
      turnSegments: finalTurnSegmentRefs,
      diagnosticsSegments: finalDiagnosticsSegmentRefs,
      checkpoints: finalCheckpointRefs
    },
    verification,
    cleanup
  };
  });
}

export async function commitV2DiagnosticsSegments(adapter, {
  campaignId,
  saveId,
  diagnosticsSegments = [],
  recentDiagnostics = [],
  metadata = null,
  now = null,
  layout = 'active'
} = {}) {
  const id = requireNonEmptyString(campaignId, 'campaignId');
  const save = requireNonEmptyString(saveId, 'saveId');
  const timestamp = now || isoNow();
  const storageLayout = normalizeV2Layout(layout);
  return enqueueV2AppendCommit({ campaignId: id, saveId: save, layout: storageLayout }, async () => {
  const currentManifest = await loadV2SaveManifest(adapter, { campaignId: id, saveId: save, layout: storageLayout });
  let currentCampaignManifest = null;
  try {
    currentCampaignManifest = await loadV2CampaignManifest(adapter, id, { layout: storageLayout });
  } catch {
    currentCampaignManifest = null;
  }

  const persistedRecentDiagnosticIds = Array.isArray(recentDiagnostics) && recentDiagnostics.length > 0
    ? await readRecentSegmentEntryIds(adapter, currentManifest.diagnosticsSegments || [])
    : new Set();
  const diagnosticsEntryGroups = diagnosticsEntryGroupsWithRecentRepair({
    persistedIds: persistedRecentDiagnosticIds,
    diagnosticsSegments,
    recentDiagnostics
  });
  const diagnosticsAppend = await appendV2SegmentEntriesForCommit(adapter, {
    segmentType: 'diagnostics',
    campaignId: id,
    saveId: save,
    currentRefs: currentManifest.diagnosticsSegments || [],
    entryGroups: diagnosticsEntryGroups,
    createdAt: timestamp,
    layout: storageLayout,
    maxBytes: segmentMaxBytesFor('diagnostics'),
    appendToTail: false
  });

  await verifyV2ArtifactRefs(adapter, [
    ...diagnosticsAppend.refsToVerify
  ]);

  const latestManifest = await loadV2SaveManifest(adapter, { campaignId: id, saveId: save, layout: storageLayout });
  let latestCampaignManifest = currentCampaignManifest;
  try {
    latestCampaignManifest = await loadV2CampaignManifest(adapter, id, { layout: storageLayout });
  } catch {
    latestCampaignManifest = currentCampaignManifest;
  }
  const diagnosticsSegmentRefs = refsAfterAppend({
    baseRefs: currentManifest.diagnosticsSegments || [],
    latestRefs: latestManifest.diagnosticsSegments || [],
    appendedRefs: diagnosticsAppend.refs
  });
  const saveManifest = createV2SaveManifest({
    campaignId: id,
    saveId: save,
    branchId: latestManifest.branchId || currentManifest.branchId || 'main',
    headRef: latestManifest.head || currentManifest.head,
    hostMapRef: latestManifest.hostMap || currentManifest.hostMap || null,
    promptCacheRef: latestManifest.promptCache || currentManifest.promptCache || null,
    eventSegmentRefs: latestManifest.eventSegments || currentManifest.eventSegments || [],
    turnSegmentRefs: latestManifest.turnSegments || currentManifest.turnSegments || [],
    diagnosticsSegmentRefs,
    checkpointRefs: latestManifest.checkpoints || currentManifest.checkpoints || [],
    importedFrom: latestManifest.importedFrom || currentManifest.importedFrom || null,
    current: latestManifest.current !== false && currentManifest.current !== false,
    metadata: metadata || latestManifest.metadata || currentManifest.metadata || null,
    layout: storageLayout,
    createdAt: latestManifest.createdAt || currentManifest.createdAt || timestamp,
    updatedAt: timestamp
  });
  const saveManifestKey = saveManifestLogicalKey({ campaignId: id, saveId: save, layout: storageLayout });
  await writeJson(adapter, saveManifestKey, saveManifest);
  const saveManifestRef = artifactRef({ logicalKey: saveManifestKey, record: saveManifest });

  const campaignManifest = createV2CampaignManifest({
    campaignId: id,
    activeSaveId: save,
    saveManifestRef,
    saves: latestCampaignManifest?.saves || currentCampaignManifest?.saves || {},
    layout: storageLayout,
    createdAt: latestCampaignManifest?.createdAt || currentCampaignManifest?.createdAt || timestamp,
    updatedAt: timestamp
  });
  const campaignManifestKey = campaignManifestLogicalKey({ campaignId: id, layout: storageLayout });
  await writeJson(adapter, campaignManifestKey, campaignManifest);

  const verification = await verifyJsonFiles(adapter, [
    ...diagnosticsAppend.verificationLogicalKeys,
    saveManifestKey,
    campaignManifestKey
  ]);

  return {
    campaignManifest,
    campaignManifestRef: artifactRef({ logicalKey: campaignManifestKey, record: campaignManifest }),
    saveManifest,
    saveManifestRef,
    refs: {
      head: latestManifest.head || currentManifest.head,
      hostMap: latestManifest.hostMap || currentManifest.hostMap || null,
      promptCache: latestManifest.promptCache || currentManifest.promptCache || null,
      eventSegments: latestManifest.eventSegments || currentManifest.eventSegments || [],
      turnSegments: latestManifest.turnSegments || currentManifest.turnSegments || [],
      diagnosticsSegments: diagnosticsSegmentRefs,
      checkpoints: latestManifest.checkpoints || currentManifest.checkpoints || []
    },
    verification
  };
  });
}

export async function commitV2EventTurnSegments(adapter, {
  campaignId,
  saveId,
  eventSegments = [],
  turnSegments = [],
  checkpoints = [],
  metadata = null,
  now = null,
  layout = 'active',
  segmentMaxBytes = null
} = {}) {
  const id = requireNonEmptyString(campaignId, 'campaignId');
  const save = requireNonEmptyString(saveId, 'saveId');
  const timestamp = now || isoNow();
  const storageLayout = normalizeV2Layout(layout);
  return enqueueV2AppendCommit({ campaignId: id, saveId: save, layout: storageLayout }, async () => {
  const currentManifest = await loadV2SaveManifest(adapter, { campaignId: id, saveId: save, layout: storageLayout });
  let currentCampaignManifest = null;
  try {
    currentCampaignManifest = await loadV2CampaignManifest(adapter, id, { layout: storageLayout });
  } catch {
    currentCampaignManifest = null;
  }

  const eventAppend = await appendV2SegmentEntriesForCommit(adapter, {
    segmentType: 'event',
    campaignId: id,
    saveId: save,
    currentRefs: currentManifest.eventSegments || [],
    entryGroups: eventSegments,
    createdAt: timestamp,
    layout: storageLayout,
    maxBytes: segmentMaxBytesFor('event', segmentMaxBytes)
  });
  const turnAppend = await appendV2SegmentEntriesForCommit(adapter, {
    segmentType: 'turn',
    campaignId: id,
    saveId: save,
    currentRefs: currentManifest.turnSegments || [],
    entryGroups: turnSegments,
    createdAt: timestamp,
    layout: storageLayout,
    maxBytes: segmentMaxBytesFor('turn', segmentMaxBytes)
  });

  const refsToVerify = [
    ...eventAppend.refsToVerify,
    ...turnAppend.refsToVerify
  ];
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
  refsToVerify.push(...checkpointRefs);
  await verifyV2ArtifactRefs(adapter, refsToVerify);

  const latestManifest = await loadV2SaveManifest(adapter, { campaignId: id, saveId: save, layout: storageLayout });
  let latestCampaignManifest = currentCampaignManifest;
  try {
    latestCampaignManifest = await loadV2CampaignManifest(adapter, id, { layout: storageLayout });
  } catch {
    latestCampaignManifest = currentCampaignManifest;
  }
  const eventSegmentRefs = refsAfterAppend({
    baseRefs: currentManifest.eventSegments || [],
    latestRefs: latestManifest.eventSegments || [],
    appendedRefs: eventAppend.refs
  });
  const turnSegmentRefs = refsAfterAppend({
    baseRefs: currentManifest.turnSegments || [],
    latestRefs: latestManifest.turnSegments || [],
    appendedRefs: turnAppend.refs
  });
  const diagnosticsSegmentRefs = latestManifest.diagnosticsSegments || currentManifest.diagnosticsSegments || [];
  const finalCheckpointRefs = checkpointRefs.length
    ? [
        ...(latestManifest.checkpoints || currentManifest.checkpoints || []),
        ...checkpointRefs
      ]
    : (latestManifest.checkpoints || currentManifest.checkpoints || []);
  const saveManifest = createV2SaveManifest({
    campaignId: id,
    saveId: save,
    branchId: latestManifest.branchId || currentManifest.branchId || 'main',
    headRef: latestManifest.head || currentManifest.head,
    hostMapRef: latestManifest.hostMap || currentManifest.hostMap || null,
    promptCacheRef: latestManifest.promptCache || currentManifest.promptCache || null,
    eventSegmentRefs,
    turnSegmentRefs,
    diagnosticsSegmentRefs,
    checkpointRefs: finalCheckpointRefs,
    importedFrom: latestManifest.importedFrom || currentManifest.importedFrom || null,
    current: latestManifest.current !== false && currentManifest.current !== false,
    metadata: metadata || latestManifest.metadata || currentManifest.metadata || null,
    layout: storageLayout,
    createdAt: latestManifest.createdAt || currentManifest.createdAt || timestamp,
    updatedAt: timestamp
  });
  const saveManifestKey = saveManifestLogicalKey({ campaignId: id, saveId: save, layout: storageLayout });
  await writeJson(adapter, saveManifestKey, saveManifest);
  const saveManifestRef = artifactRef({ logicalKey: saveManifestKey, record: saveManifest });

  const campaignManifest = createV2CampaignManifest({
    campaignId: id,
    activeSaveId: save,
    saveManifestRef,
    saves: latestCampaignManifest?.saves || currentCampaignManifest?.saves || {},
    layout: storageLayout,
    createdAt: latestCampaignManifest?.createdAt || currentCampaignManifest?.createdAt || timestamp,
    updatedAt: timestamp
  });
  const campaignManifestKey = campaignManifestLogicalKey({ campaignId: id, layout: storageLayout });
  await writeJson(adapter, campaignManifestKey, campaignManifest);

  const verification = await verifyJsonFiles(adapter, [
    ...new Set([
      ...eventAppend.verificationLogicalKeys,
      ...turnAppend.verificationLogicalKeys,
      ...checkpointRefs.map((ref) => ref.logicalKey)
    ]),
    saveManifestKey,
    campaignManifestKey
  ]);

  return {
    campaignManifest,
    campaignManifestRef: artifactRef({ logicalKey: campaignManifestKey, record: campaignManifest }),
    saveManifest,
    saveManifestRef,
    refs: {
      head: latestManifest.head || currentManifest.head,
      hostMap: latestManifest.hostMap || currentManifest.hostMap || null,
      promptCache: latestManifest.promptCache || currentManifest.promptCache || null,
      eventSegments: eventSegmentRefs,
      turnSegments: turnSegmentRefs,
      diagnosticsSegments: diagnosticsSegmentRefs,
      checkpoints: finalCheckpointRefs
    },
    verification
  };
  });
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
  layout = 'active',
  headRef = null
} = {}) {
  const id = requireNonEmptyString(campaignId, 'campaignId');
  const save = requireNonEmptyString(saveId, 'saveId');
  const expectedLogicalKey = materializedHeadLogicalKey({ campaignId: id, saveId: save, layout });
  const head = headRef?.logicalKey
    ? await readV2ArtifactRef(adapter, headRef)
    : await readJson(adapter, expectedLogicalKey);
  return hydrateMaterializedHeadState(adapter, head);
}
