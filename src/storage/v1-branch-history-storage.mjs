import { canonicalJson, sha256Json } from './v1-state-delta-codec.mjs';
import {
  V1_BRANCH_HISTORY_LIMITS as LIMIT, assertAuthorityCapture, assertBranchHistoryHead,
  assertHistoryObject, assertHistoryRef, captureAssert, captureBytes, captureLimit, historyObjectPath,
} from './v1-branch-history-contracts.mjs';

const equal = (a, b) => canonicalJson(a) === canonicalJson(b);
export async function readVerifiedBranchHistory(adapter, manifest, boundaries) {
  const head = assertBranchHistoryHead(manifest.branchHistory, manifest);
  let bytes = 0;
  const seenPages = new Set(), vectorObjects = new Map();
  async function read(ref, type) {
    assertHistoryRef(ref, head.ownerSaveId, type);
    const value = assertHistoryObject(await adapter.readJson(ref.path), head.ownerSaveId, type);
    bytes += captureBytes(value);
    captureLimit(bytes <= LIMIT.historyBytes, 'History verification byte limit exceeded.');
    captureAssert(await sha256Json(value) === ref.contentHash, 'History object hash differs.');
    return value;
  }
  const pages = [];
  for (let ref = head.page; ref !== null;) {
    captureAssert(!seenPages.has(ref.path), 'History catalog cycle/repeated page.');
    seenPages.add(ref.path);
    captureLimit(seenPages.size <= LIMIT.pages, 'History page traversal limit exceeded.');
    const page = await read(ref, 'page');
    if (pages.length) captureAssert(page.records.length === LIMIT.pageRecords, 'Earlier catalog pages must be full.');
    pages.push(page); ref = page.previous;
  }
  const records = [...pages].reverse().flatMap(page => page.records);
  captureAssert(records.length === head.recordCount, 'Catalog record count differs from head.');
  captureLimit(records.length <= LIMIT.records, 'History record traversal limit exceeded.');
  const operations = new Set(), rows = [];
  let vectorHead = null, previous = null;
  for (const record of records) {
    const capture = record.capture;
    captureAssert(!operations.has(capture.operationId), 'Duplicate history operation identity.');
    operations.add(capture.operationId);
    captureAssert(boundaries.get(capture.before.revision) === capture.before.stateHash
      && boundaries.get(capture.after.revision) === capture.after.stateHash, 'Capture references an unavailable state boundary.');
    if (previous) {
      captureAssert(capture.mode === 'commit' && equal(capture.before, previous.after)
        && equal(capture.origin, previous.origin) && capture.packageFingerprint === previous.packageFingerprint,
      'Capture chronology/origin is discontinuous.');
    } else {
      captureAssert(capture.mode === 'baseline' && capture.after.revision === head.floorRevision
        && capture.after.stateHash === head.floorStateHash, 'Capture baseline floor differs.');
    }
    const chunks = [], walk = new Set();
    let ref = capture.transcript.head;
    while (!equal(ref, vectorHead)) {
      captureAssert(ref !== null && !walk.has(ref.path), 'Vector prefix/cycle is invalid.');
      walk.add(ref.path);
      let chunk = vectorObjects.get(ref.path);
      if (!chunk) {
        captureLimit(vectorObjects.size < LIMIT.chunks, 'Vector traversal limit exceeded.');
        chunk = await read(ref, 'vector'); vectorObjects.set(ref.path, chunk);
      }
      chunks.push(chunk); ref = chunk.previous;
      captureLimit(walk.size <= LIMIT.chunks, 'Vector traversal limit exceeded.');
    }
    for (const chunk of chunks.reverse()) {
      captureAssert(chunk.rowCount === rows.length + chunk.rows.length, 'Vector chunk count/prefix differs.');
      rows.push(...chunk.rows);
      captureLimit(rows.length <= LIMIT.rows, 'Vector row limit exceeded.');
    }
    captureAssert(capture.transcript.rowCount === rows.length && await sha256Json(rows) === capture.transcript.vectorHash,
      'Transcript vector count/hash differs.');
    vectorHead = capture.transcript.head; previous = capture;
  }
  captureAssert(previous.after.revision === head.headRevision && previous.after.stateHash === head.headStateHash,
    'Catalog does not reach the published head.');
  return { records, rows, vectorHead, headPage: pages[0], objectBytes: bytes, chunks: vectorObjects.size };
}

export async function prepareBranchHistory({ manifest, capture, requestHash, expectedManifestHash, verifiedHistory = null, saveMetadata }) {
  assertAuthorityCapture(capture);
  captureAssert(await sha256Json(capture.transcript.rowHashes) === capture.transcript.vectorHash, 'Supplied vector hash differs.');
  const owner = manifest.saveId, prior = verifiedHistory;
  const existingRows = prior?.rows || [];
  if (prior) {
    const previous = prior.records.at(-1).capture;
    captureAssert(capture.mode === 'commit' && equal(capture.before, previous.after)
      && equal(capture.origin, previous.origin) && capture.packageFingerprint === previous.packageFingerprint, 'Capture does not extend the same origin/head.');
    captureAssert(!prior.records.some(record => record.capture.operationId === capture.operationId), 'Operation ID was already used.');
    captureAssert(capture.transcript.rowHashes.length >= existingRows.length
      && existingRows.every((hash, index) => capture.transcript.rowHashes[index] === hash),
    'Transcript is not the same vector or an append.', 'DIRECTIVE_V1_CAPTURE_TRANSCRIPT_NONPREFIX');
  } else captureAssert(capture.mode === 'baseline', 'First capture must establish a baseline.');
  captureLimit((prior?.records.length || 0) < LIMIT.records, 'History boundary count limit exceeded.');
  const writes = [];
  async function objectRef(type, value) {
    assertHistoryObject(value, owner, type);
    const contentHash = await sha256Json(value);
    const ref = { path: historyObjectPath(owner, type, contentHash), contentHash };
    writes.push({ ref, value }); return ref;
  }
  let vectorHead = prior?.vectorHead || null;
  const appended = capture.transcript.rowHashes.slice(existingRows.length);
  captureLimit((prior?.chunks || 0) + Math.ceil(appended.length / LIMIT.chunkRows) <= LIMIT.chunks, 'Vector chunk count limit exceeded.');
  for (let offset = 0; offset < appended.length; offset += LIMIT.chunkRows) {
    const rows = appended.slice(offset, offset + LIMIT.chunkRows);
    vectorHead = await objectRef('vector', { kind: 'directive.branchHistoryVector.v1', version: 1,
      ownerSaveId: owner, previous: vectorHead, rowCount: existingRows.length + offset + rows.length, rows });
  }
  const { rowHashes, ...transcript } = capture.transcript;
  const record = { requestHash, expectedManifestHash, saveMetadata: structuredClone(saveMetadata),
    capture: { ...structuredClone(capture), transcript: { ...transcript, head: vectorHead } } };
  let records = [record], previousPage = manifest.branchHistory?.page || null;
  if (prior && prior.headPage.records.length < LIMIT.pageRecords) {
    records = [...prior.headPage.records, record]; previousPage = prior.headPage.previous;
  }
  const page = await objectRef('page', { kind: 'directive.branchHistoryPage.v1', version: 1,
    ownerSaveId: owner, previous: previousPage, records });
  captureLimit((prior?.objectBytes || 0) + writes.reduce((sum, item) => sum + captureBytes(item.value), 0) <= LIMIT.historyBytes,
    'History publication byte limit exceeded.');
  return { writes, head: { kind: 'directive.branchHistoryHead.v1', version: 1, ownerSaveId: owner,
    floorRevision: manifest.branchHistory?.floorRevision ?? capture.after.revision,
    floorStateHash: manifest.branchHistory?.floorStateHash ?? capture.after.stateHash,
    headRevision: capture.after.revision, headStateHash: capture.after.stateHash,
    recordCount: (prior?.records.length || 0) + 1, page } };
}
