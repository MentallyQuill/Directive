import { canonicalJson } from './v1-state-delta-codec.mjs';

export const V1_BRANCH_HISTORY_LIMITS = Object.freeze({
  rows: 20000, chunkRows: 256, chunkBytes: 64 * 1024, pageRecords: 64,
  pageBytes: 256 * 1024, recordBytes: 4096, records: 16384, pages: 256,
  chunks: 20000, historyBytes: 64 * 1024 * 1024,
  deltas: 65536, segments: 16384, segmentBytes: 1024 * 1024 * 1024, baseBytes: 64 * 1024 * 1024,
});
export function captureError(code, message) { return Object.assign(new Error(message), { code }); }
export function captureAssert(condition, message, code = 'DIRECTIVE_V1_CAPTURE_INVALID') {
  if (!condition) throw captureError(code, message);
}
export function captureBytes(value) { return new TextEncoder().encode(canonicalJson(value)).byteLength; }
export function captureLimit(condition, message) { captureAssert(condition, message, 'DIRECTIVE_V1_CAPTURE_LIMIT_EXCEEDED'); }
export function exactCaptureFields(value, fields) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key));
}
export function captureHash(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
export function captureInteger(value) { return Number.isSafeInteger(value) && value >= 0; }
function text(value, max = 180) { return typeof value === 'string' && value.length > 0 && value.length <= max && value.trim() === value; }
export function captureOwner(value) { return text(value) && /^[a-zA-Z0-9_.-]+$/.test(value); }
export function historyObjectPath(ownerSaveId, type, hash) {
  captureAssert(captureOwner(ownerSaveId) && ['vector', 'page'].includes(type) && captureHash(hash), 'Invalid history object coordinates.');
  return `v1/saves/${ownerSaveId}.history-${type}-${hash}.v1.json`;
}
export function assertHistoryRef(ref, owner, type) {
  captureAssert(exactCaptureFields(ref, ['path', 'contentHash']) && captureHash(ref.contentHash)
    && ref.path === historyObjectPath(owner, type, ref.contentHash), 'History reference is not exact owner/hash scoped.');
  return ref;
}
export function assertCaptureBoundary(value) {
  captureAssert(exactCaptureFields(value, ['revision', 'stateHash']) && captureInteger(value.revision) && captureHash(value.stateHash), 'Invalid state-custody boundary.');
}
export function assertAuthorityCapture(capture, { persisted = false, ownerSaveId = null } = {}) {
  captureAssert(exactCaptureFields(capture, ['kind', 'version', 'mode', 'operationId', 'writerKind', 'origin', 'packageFingerprint', 'before', 'after', 'transcript'])
    && capture.kind === 'directive.authorityBoundaryCapture.v1' && capture.version === 1
    && ['baseline', 'commit'].includes(capture.mode) && text(capture.operationId) && text(capture.writerKind, 96), 'Invalid authority boundary capture.');
  const origin = capture.origin;
  captureAssert(exactCaptureFields(origin, ['campaignId', 'saveId', 'chatId', 'entityType', 'entityId'])
    && text(origin.campaignId) && captureOwner(origin.saveId) && text(origin.chatId, 512)
    && ['character', 'group'].includes(origin.entityType) && text(origin.entityId, 512), 'Invalid capture origin.');
  captureAssert(captureHash(capture.packageFingerprint), 'Invalid package fingerprint.');
  assertCaptureBoundary(capture.before); assertCaptureBoundary(capture.after);
  captureAssert(capture.mode === 'baseline'
    ? canonicalJson(capture.before) === canonicalJson(capture.after)
    : capture.after.revision === capture.before.revision + 1, 'Capture state revisions are discontinuous.');
  const transcript = capture.transcript;
  captureAssert(exactCaptureFields(transcript, ['projectionVersion', 'rowCount', 'vectorHash', persisted ? 'head' : 'rowHashes'])
    && transcript.projectionVersion === 1 && captureInteger(transcript.rowCount) && captureHash(transcript.vectorHash), 'Invalid transcript vector.');
  captureLimit(transcript.rowCount <= V1_BRANCH_HISTORY_LIMITS.rows, 'Transcript row limit exceeded.');
  if (persisted) {
    if (transcript.rowCount === 0) captureAssert(transcript.head === null, 'Empty vector must have no head.');
    else assertHistoryRef(transcript.head, ownerSaveId, 'vector');
  } else {
    captureAssert(Array.isArray(transcript.rowHashes) && transcript.rowHashes.length === transcript.rowCount
      && transcript.rowHashes.every(captureHash), 'Transcript hashes/count are inconsistent.');
  }
  return capture;
}
export function assertBranchHistoryHead(head, manifest) {
  captureAssert(exactCaptureFields(head, ['kind', 'version', 'ownerSaveId', 'floorRevision', 'floorStateHash', 'headRevision', 'headStateHash', 'recordCount', 'page'])
    && head.kind === 'directive.branchHistoryHead.v1' && head.version === 1 && captureOwner(head.ownerSaveId)
    && head.ownerSaveId === manifest.saveId && captureInteger(head.floorRevision) && captureHash(head.floorStateHash)
    && captureInteger(head.headRevision) && captureHash(head.headStateHash) && captureInteger(head.recordCount)
    && head.recordCount > 0 && head.headRevision === manifest.currentRevision && head.headStateHash === manifest.currentStateHash
    && head.floorRevision <= head.headRevision && head.headRevision - head.floorRevision === head.recordCount - 1,
  'Capture head does not match the exact save state/floor.');
  captureLimit(head.recordCount <= V1_BRANCH_HISTORY_LIMITS.records, 'Capture boundary count limit exceeded.');
  assertHistoryRef(head.page, head.ownerSaveId, 'page');
  return head;
}
export function assertHistoryObject(value, owner, type) {
  const fields = type === 'vector' ? ['kind', 'version', 'ownerSaveId', 'previous', 'rowCount', 'rows']
    : ['kind', 'version', 'ownerSaveId', 'previous', 'records'];
  captureAssert(exactCaptureFields(value, fields) && value.kind === `directive.branchHistory${type === 'vector' ? 'Vector' : 'Page'}.v1`
    && value.version === 1 && value.ownerSaveId === owner, 'Invalid history object/owner.');
  if (value.previous !== null) assertHistoryRef(value.previous, owner, type);
  if (type === 'vector') {
    captureAssert(captureInteger(value.rowCount) && Array.isArray(value.rows) && value.rows.length > 0
      && value.rows.every(captureHash) && value.rowCount >= value.rows.length, 'Invalid history vector chunk.');
    captureLimit(value.rows.length <= V1_BRANCH_HISTORY_LIMITS.chunkRows && value.rowCount <= V1_BRANCH_HISTORY_LIMITS.rows
      && captureBytes(value) <= V1_BRANCH_HISTORY_LIMITS.chunkBytes, 'History vector chunk limit exceeded.');
  } else {
    captureAssert(Array.isArray(value.records) && value.records.length > 0, 'Invalid history catalog page.');
    captureLimit(value.records.length <= V1_BRANCH_HISTORY_LIMITS.pageRecords && captureBytes(value) <= V1_BRANCH_HISTORY_LIMITS.pageBytes, 'History page limit exceeded.');
    for (const record of value.records) {
      captureAssert(exactCaptureFields(record, ['requestHash', 'expectedManifestHash', 'saveMetadata', 'capture'])
        && captureHash(record.requestHash) && captureHash(record.expectedManifestHash), 'Invalid history record.');
      assertAuthorityCapture(record.capture, { persisted: true, ownerSaveId: owner });
      const metadata = record.saveMetadata;
      captureAssert(exactCaptureFields(metadata, ['kind', 'version', 'id', 'name', 'slotType', 'campaignId', 'packageId', 'packageVersion', 'parentSaveId', 'createdAt', 'updatedAt'])
        && metadata.kind === 'directive.campaignSave.v1' && metadata.version === 1 && metadata.id === owner
        && typeof metadata.name === 'string' && metadata.name.length > 0
        && metadata.campaignId === record.capture.origin.campaignId && text(metadata.packageId) && text(metadata.packageVersion)
        && ['active', 'checkpoint'].includes(metadata.slotType)
        && (metadata.slotType === 'active' ? metadata.parentSaveId === null && owner === record.capture.origin.saveId
          : metadata.parentSaveId === record.capture.origin.saveId)
        && text(metadata.createdAt) && Number.isFinite(Date.parse(metadata.createdAt))
        && text(metadata.updatedAt) && Number.isFinite(Date.parse(metadata.updatedAt)), 'Invalid captured candidate metadata.');
      captureLimit(captureBytes(record) <= V1_BRANCH_HISTORY_LIMITS.recordBytes, 'History record limit exceeded.');
    }
  }
  return value;
}
