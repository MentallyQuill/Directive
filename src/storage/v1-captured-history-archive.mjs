import { canonicalJson, sha256Json } from './v1-state-delta-codec.mjs';
import { loadV1CampaignStateAtTranscriptCut, V1_STORAGE_PATHS } from './v1-storage-repository.mjs';
import { assertV1CampaignSaveManifest } from './v1-segmented-save-contracts.mjs';

const KIND = 'directive.capturedHistoryArchive.v1';
const LIMIT = Object.freeze({ entries: 36642, bytes: 1216 * 1024 * 1024, descriptor: 16 * 1024 * 1024 });
const HASH = /^[a-f0-9]{64}$/;
const encoder = new TextEncoder();
const blobPath = hash => `v1/history-archives/object-${hash}.json`;
const descriptorPath = hash => `v1/history-archives/archive-${hash}.json`;
function check(ok, message, code = 'DIRECTIVE_V1_ARCHIVE_INVALID') {
  if (!ok) throw Object.assign(new Error(message), { code });
}
function fields(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function bounded(ok) { check(ok, 'Captured archive exceeds bounds.', 'DIRECTIVE_V1_ARCHIVE_LIMIT_EXCEEDED'); }

// Descriptor-safe, detached JSON with an incremental byte budget before allocation.
function detach(input, maxBytes = LIMIT.bytes) {
  let bytes = 0;
  const ancestors = new Set();
  const count = text => { bounded(text.length <= maxBytes - bytes); bytes += encoder.encode(text).byteLength; bounded(bytes <= maxBytes); };
  function copy(value, depth = 0) {
    bounded(depth <= 128);
    if (value === null || typeof value === 'boolean' || typeof value === 'string'
      || (typeof value === 'number' && Number.isFinite(value))) {
      if (typeof value === 'string') bounded(value.length <= maxBytes - bytes);
      count(JSON.stringify(value)); return value;
    }
    check(value && typeof value === 'object', 'Archive data must be JSON.');
    const array = Array.isArray(value);
    check(array ? Object.getPrototypeOf(value) === Array.prototype : [Object.prototype, null].includes(Object.getPrototypeOf(value)), 'Unsupported archive data prototype.');
    check(!ancestors.has(value), 'Cyclic archive data.');
    const keys = Reflect.ownKeys(value);
    bounded(keys.length <= maxBytes - bytes);
    check(!array || keys.length === value.length + 1, 'Sparse archive array.');
    ancestors.add(value); count('[]');
    const result = array ? [] : {};
    let index = 0;
    for (const key of keys) {
      if (array && key === 'length') continue;
      const property = Object.getOwnPropertyDescriptor(value, key);
      check(typeof key === 'string' && property.enumerable && Object.hasOwn(property, 'value'), 'Unsupported archive data property.');
      check(!array || key === String(index), 'Extended archive array.');
      if (index++) count(',');
      if (!array) { count(JSON.stringify(key)); count(':'); }
      Object.defineProperty(result, key, { value: copy(property.value, depth + 1), enumerable: true, writable: true, configurable: true });
    }
    ancestors.delete(value); return result;
  }
  return copy(input);
}
const equal = (a,b) => canonicalJson(a) === canonicalJson(b);
async function identity(value) {
  const byteLength = encoder.encode(canonicalJson(value)).byteLength;
  bounded(byteLength <= LIMIT.bytes);
  return { contentHash: await sha256Json(value), byteLength };
}
function reference(value) {
  check(fields(value, ['path','contentHash']) && HASH.test(value.contentHash)
    && value.path === descriptorPath(value.contentHash), 'Invalid archive reference.');
  return value;
}
function pathValidator(saveId, manifest) {
  const statePaths = new Set([V1_STORAGE_PATHS.save(saveId), manifest.base.path, ...manifest.segments.map(ref => ref.path)]);
  return path => statePaths.has(path) || ['page','vector'].some(type => {
    const prefix = `v1/saves/${saveId}.history-${type}-`;
    return typeof path === 'string' && path.startsWith(prefix) && path.endsWith('.v1.json') && HASH.test(path.slice(prefix.length, -8));
  });
}
function budget() {
  const unique = new Map(); let total = 0;
  return entry => {
    if (unique.has(entry.contentHash)) check(unique.get(entry.contentHash) === entry.byteLength, 'Inconsistent blob length.');
    else { unique.set(entry.contentHash, entry.byteLength); total += entry.byteLength; }
    bounded(unique.size <= LIMIT.entries && total <= LIMIT.bytes);
  };
}
async function readOptional(adapter, path) {
  try { return { exists: true, value: await adapter.readJson(path) }; }
  catch (error) {
    if (['ENOENT', 'DIRECTIVE_FAKE_HOST_FILE_MISSING'].includes(error?.code) || error?.name === 'NotFoundError' || error?.status === 404) return { exists: false };
    throw error;
  }
}
async function storeImmutable(adapter, path, value, expectedHash) {
  const existing = await readOptional(adapter, path);
  if (existing.exists) check(await sha256Json(detach(existing.value)) === expectedHash, 'Content-addressed destination conflict.');
  else await adapter.writeJson(path, value);
  check(await sha256Json(detach(await adapter.readJson(path))) === expectedHash, 'Immutable archive readback differs.');
}
function detachDescriptor(value) {
  const entries = value && Object.getOwnPropertyDescriptor(value, 'entries');
  check(entries && Object.hasOwn(entries, 'value') && Array.isArray(entries.value), 'Archive entries required.');
  bounded(entries.value.length <= LIMIT.entries);
  return detach(value, LIMIT.descriptor);
}
async function verifyDescriptor(adapter, descriptor) {
  check(fields(descriptor, ['kind','version','source','manifestHash','transcript','entries','coverage','capture'])
    && descriptor.kind === KIND && descriptor.version === 1 && HASH.test(descriptor.manifestHash), 'Invalid archive descriptor.');
  check(fields(descriptor.source, ['saveId','campaignId','packageId','packageVersion','slotType','parentSaveId','branchId']), 'Invalid archive source.');
  const id = descriptor.source.saveId;
  check(typeof id === 'string' && /^[a-zA-Z0-9_.-]{1,180}$/.test(id), 'Invalid archive owner.');
  check(Array.isArray(descriptor.entries), 'Archive entries required.');
  bounded(descriptor.entries.length > 0 && descriptor.entries.length <= LIMIT.entries);
  const entries = new Map(), account = budget();
  let previous = null;
  for (const entry of descriptor.entries) {
    check(fields(entry, ['path','contentHash','byteLength']) && typeof entry.path === 'string'
      && HASH.test(entry.contentHash) && Number.isSafeInteger(entry.byteLength) && entry.byteLength > 0
      && (previous === null || previous < entry.path), 'Invalid, repeated or unsorted archive mapping.');
    previous = entry.path; account(entry); entries.set(entry.path, entry);
  }
  const visited = new Set();
  const virtual = Object.freeze({ async readJson(path) {
    const entry = entries.get(path);
    check(entry, 'Archive graph attempted an unmapped read.');
    const value = detach(await adapter.readJson(blobPath(entry.contentHash)), entry.byteLength);
    check(equal(await identity(value), { contentHash: entry.contentHash, byteLength: entry.byteLength }), 'Archive blob identity differs.');
    visited.add(path); return value;
  } });
  const expectedManifest = await virtual.readJson(V1_STORAGE_PATHS.save(id));
  assertV1CampaignSaveManifest(expectedManifest, { saveId: id });
  check(await sha256Json(expectedManifest) === descriptor.manifestHash, 'Archive manifest identity differs.');
  const allowedPath = pathValidator(id, expectedManifest);
  for (const path of entries.keys()) check(allowedPath(path), 'Unexpected archive namespace or owner.');
  const verified = await loadV1CampaignStateAtTranscriptCut(virtual, id, { expectedManifest,
    transcript: descriptor.transcript, retainedRowCount: descriptor.transcript?.rowCount });
  check(visited.size === entries.size && [...entries.keys()].every(path => visited.has(path)), 'Archive contains unvisited graph objects.');
  check(equal(descriptor.source, verified.origin) && equal(descriptor.coverage, verified.coverage)
    && equal(descriptor.capture, verified.capture), 'Archive claims differ from verified graph.');
  return { adapter: virtual, expectedManifest: detach(expectedManifest), transcript: detach(descriptor.transcript),
    source: detach(verified.origin), coverage: detach(verified.coverage), capture: detach(verified.capture) };
}

export async function loadV1CapturedHistoryArchive(adapter, inputReference) {
  const ref = reference(detach(inputReference, LIMIT.descriptor));
  check(adapter && typeof adapter.readJson === 'function', 'Archive reader required.');
  const descriptor = detachDescriptor(await adapter.readJson(ref.path));
  check(await sha256Json(descriptor) === ref.contentHash, 'Archive descriptor identity differs.');
  return { ...await verifyDescriptor(adapter, descriptor), reference: detach(ref) };
}

export async function createV1CapturedHistoryArchive(adapter, saveId, options) {
  let phase = 'verify', attemptedReference;
  try {
    const request = detach(options);
    check(fields(request, ['expectedManifest','transcript']), 'Archive creation requires exact manifest and transcript.');
    check(typeof saveId === 'string' && /^[a-zA-Z0-9_.-]{1,180}$/.test(saveId), 'Invalid archive owner.');
    check(adapter && typeof adapter.readJson === 'function' && typeof adapter.writeJson === 'function', 'Archive storage required.');
    const { expectedManifest, transcript } = request;
    assertV1CampaignSaveManifest(expectedManifest, { saveId });
    const allowedPath = pathValidator(saveId, expectedManifest);
    const entries = new Map(), account = budget();
    const manifestHash = await sha256Json(expectedManifest);
    const assertHead = async () => check(await sha256Json(detach(await adapter.readJson(V1_STORAGE_PATHS.save(saveId)))) === manifestHash,
      'Live captured archive head changed.', 'DIRECTIVE_V1_ARCHIVE_HEAD_CHANGED');
    const collector = { async readJson(path) {
      check(allowedPath(path), 'Verifier reached an unexpected archive path.');
      const value = detach(await adapter.readJson(path));
      const entry = { path, ...await identity(value) };
      if (entries.has(path)) check(equal(entries.get(path), entry), 'Repeated source path changed during verification.');
      else { bounded(entries.size < LIMIT.entries); account(entry); entries.set(path, entry); }
      return value;
    } };
    const verified = await loadV1CampaignStateAtTranscriptCut(collector, saveId,
      { expectedManifest, transcript, retainedRowCount: transcript?.rowCount });
    phase = 'head-check'; await assertHead();
    const descriptor = detach({ kind: KIND, version: 1, source: verified.origin, manifestHash, transcript,
      entries: [...entries.values()].sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
      coverage: verified.coverage, capture: verified.capture }, LIMIT.descriptor);
    const contentHash = await sha256Json(descriptor);
    attemptedReference = { path: descriptorPath(contentHash), contentHash };
    phase = 'copy';
    for (const entry of descriptor.entries) {
      const value = detach(await adapter.readJson(entry.path), entry.byteLength);
      check(equal(await identity(value), { contentHash: entry.contentHash, byteLength: entry.byteLength }), 'Source changed during archive copy.');
      await storeImmutable(adapter, blobPath(entry.contentHash), value, entry.contentHash);
    }
    phase = 'head-check'; await assertHead();
    phase = 'verify'; const archived = await verifyDescriptor(adapter, descriptor);
    phase = 'head-check'; await assertHead();
    phase = 'publish';
    const existing = await readOptional(adapter, attemptedReference.path);
    if (existing.exists) check(await sha256Json(detachDescriptor(existing.value)) === contentHash, 'Content-addressed descriptor conflict.');
    else await adapter.writeJson(attemptedReference.path, descriptor);
    phase = 'readback';
    check(await sha256Json(detachDescriptor(await adapter.readJson(attemptedReference.path))) === contentHash, 'Archive descriptor readback differs.');
    phase = 'head-check'; await assertHead();
    return { ...archived, reference: detach(attemptedReference) };
  } catch (error) {
    if (!error || typeof error !== 'object') error = Object.assign(new Error(String(error)), { code: 'DIRECTIVE_V1_ARCHIVE_STORAGE_FAILED' });
    error.phase = phase;
    if (attemptedReference) error.attemptedReference = detach(attemptedReference);
    throw error;
  }
}
