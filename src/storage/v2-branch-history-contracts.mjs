import { canonicalJson } from './v1-state-delta-codec.mjs';
import { V1_BRANCH_HISTORY_LIMITS } from './v1-branch-history-contracts.mjs';

export const V2_BRANCH_HISTORY_LIMITS = V1_BRANCH_HISTORY_LIMITS;
const LIMIT = V2_BRANCH_HISTORY_LIMITS;
const CAUSES = new Set([
  'reply-finalization', 'edit', 'delete', 'swipe', 'continue', 'visibility',
  'metadata-reconciliation', 'authority', 'format-upgrade',
]);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const text = (value, max = 180) => typeof value === 'string'
  && value.length > 0 && value.length <= max && value.trim() === value;
const plainObject = value => value !== null && typeof value === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const equal = (left, right) => canonicalJson(left) === canonicalJson(right);

export function v2Assert(ok, message, code = 'DIRECTIVE_V2_HISTORY_INVALID') {
  if (!ok) throw Object.assign(new Error(message), { code });
}

export const v2Hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const v2Owner = value => typeof value === 'string' && /^[a-zA-Z0-9_.-]{1,180}$/.test(value);
export const v2Bytes = value => new TextEncoder().encode(canonicalJson(value)).byteLength;

export function v2Fields(value, fields) {
  return plainObject(value) && Reflect.ownKeys(value).length === fields.length
    && fields.every(key => {
      const property = Object.getOwnPropertyDescriptor(value, key);
      return property?.enumerable && Object.hasOwn(property, 'value');
    });
}

// Check descriptors before iteration so public validators never invoke getters.
function dataArray(value, maxLength) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
    || value.length > maxLength || Reflect.ownKeys(value).length !== value.length + 1) return false;
  for (let index = 0; index < value.length; index++) {
    const property = Object.getOwnPropertyDescriptor(value, String(index));
    if (!property?.enumerable || !Object.hasOwn(property, 'value')) return false;
  }
  return true;
}

/** Detach bounded JSON before hashing awaits. Not an authority validator. */
export function detachV2History(value) {
  // A request can include two vectors plus the complete unique history graph.
  const maxBytes = LIMIT.historyBytes * 2 + LIMIT.rows * 140;
  const encoder = new TextEncoder();
  let bytes = 0;
  let slots = 0;
  const ancestors = new Set();
  function account(serialized) {
    v2Assert(serialized.length <= maxBytes - bytes, 'History input size limit exceeded.');
    bytes += encoder.encode(serialized).byteLength;
    v2Assert(bytes <= maxBytes, 'History input size limit exceeded.');
  }
  function copy(input, depth) {
    v2Assert(depth <= 64 && ++slots <= 2_000_000, 'History input traversal limit exceeded.');
    if (input === null || typeof input === 'boolean' || typeof input === 'string'
      || (typeof input === 'number' && Number.isFinite(input))) {
      if (typeof input === 'string') v2Assert(input.length <= maxBytes - bytes, 'History input size limit exceeded.');
      account(JSON.stringify(input));
      return input;
    }
    const array = Array.isArray(input);
    v2Assert(array ? dataArray(input, 2_000_000) : plainObject(input), 'History input must be plain JSON.');
    v2Assert(!ancestors.has(input), 'History input contains a cycle.');
    ancestors.add(input);
    const keys = Reflect.ownKeys(input);
    const result = array ? [] : {};
    account(array ? '[]' : '{}');
    let index = 0;
    for (const key of keys) {
      if (array && key === 'length') continue;
      const property = Object.getOwnPropertyDescriptor(input, key);
      v2Assert(typeof key === 'string' && property.enumerable && Object.hasOwn(property, 'value'),
        'History input contains unsupported properties.');
      if (index++) account(',');
      if (!array) { account(JSON.stringify(key)); account(':'); }
      Object.defineProperty(result, key, {
        value: copy(property.value, depth + 1), enumerable: true, writable: true, configurable: true,
      });
    }
    ancestors.delete(input);
    return result;
  }
  return copy(value, 0);
}

export function v2HistoryObjectPath(owner, type, hash) {
  v2Assert(v2Owner(owner) && ['vector', 'page'].includes(type) && v2Hash(hash), 'Invalid history object coordinates.');
  return `v1/saves/${owner}.history-${type}-${hash}.v2.json`;
}

export function assertV2HistoryRef(ref, owner, type) {
  v2Assert(v2Fields(ref, ['path', 'contentHash']) && v2Hash(ref.contentHash)
    && ref.path === v2HistoryObjectPath(owner, type, ref.contentHash), 'Invalid history reference.');
  return ref;
}

function boundary(value) {
  v2Assert(v2Fields(value, ['revision', 'stateHash']) && integer(value.revision)
    && v2Hash(value.stateHash), 'Invalid authority boundary.');
}

function vector(value, owner, persisted) {
  v2Assert(v2Fields(value, ['projectionVersion', 'rowCount', 'vectorHash', persisted ? 'head' : 'rowHashes'])
    && value.projectionVersion === 1 && integer(value.rowCount) && value.rowCount <= LIMIT.rows
    && v2Hash(value.vectorHash), 'Invalid transcript vector.');
  if (persisted) {
    if (value.rowCount === 0) v2Assert(value.head === null, 'Empty vector has a head.');
    else assertV2HistoryRef(value.head, owner, 'vector');
  } else {
    v2Assert(dataArray(value.rowHashes, LIMIT.rows) && value.rowHashes.length === value.rowCount
      && value.rowHashes.every(v2Hash), 'Invalid vector rows.');
  }
}

/** Structural validation only: the verifier must recompute hashes and replay state. */
export function assertV2BranchHistoryTransition(value, { persisted = false, ownerSaveId = null } = {}) {
  v2Assert(v2Fields(value, [
    'kind', 'version', 'sequence', 'mode', 'operationId', 'writerKind', 'origin', 'packageFingerprint',
    'cause', 'before', 'after', 'beforeTranscript', 'afterTranscript',
  ]) && value.kind === 'directive.historyTransition.v2' && value.version === 2
    && integer(value.sequence) && value.sequence < LIMIT.records
    && ['upgrade', 'authority', 'transcript'].includes(value.mode)
    && text(value.operationId) && text(value.writerKind, 96) && v2Hash(value.packageFingerprint),
  'Invalid history transition.');
  const origin = value.origin;
  v2Assert(v2Fields(origin, ['campaignId', 'saveId', 'chatId', 'entityType', 'entityId'])
    && text(origin.campaignId) && v2Owner(origin.saveId) && text(origin.chatId, 512)
    && ['character', 'group'].includes(origin.entityType) && text(origin.entityId, 512)
    && (ownerSaveId === null || origin.saveId === ownerSaveId), 'Invalid transition origin.');
  const cause = value.cause;
  v2Assert(v2Fields(cause, ['type', 'proof']) && CAUSES.has(cause.type)
    && v2Fields(cause.proof, ['path', 'contentHash']) && v2Hash(cause.proof.contentHash)
    && text(cause.proof.path, 512)
    && /^(?:[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\/)*[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(cause.proof.path),
  'Invalid transition cause proof.');
  // A safe relative path and hash prove data identity, never permission or custody.
  boundary(value.before);
  boundary(value.after);
  vector(value.beforeTranscript, origin.saveId, persisted);
  vector(value.afterTranscript, origin.saveId, persisted);
  if (value.mode === 'authority') {
    v2Assert(value.sequence > 0 && value.after.revision === value.before.revision + 1,
      'Authority must advance exactly once.');
  } else {
    v2Assert(equal(value.before, value.after), 'Transcript transition changed authority.');
  }
  if (value.mode === 'upgrade') {
    v2Assert(value.sequence === 0 && cause.type === 'format-upgrade'
      && equal(value.beforeTranscript, value.afterTranscript), 'Upgrade must preserve state and vector.');
  } else {
    v2Assert(value.sequence > 0 && cause.type !== 'format-upgrade', 'Invalid transition sequence or cause.');
  }
  return value;
}

/** Adjacent continuity only; the full verifier must reject IDs duplicated anywhere in history. */
export function assertV2HistoryTransitionLink(previous, next, options = {}) {
  assertV2BranchHistoryTransition(previous, options);
  assertV2BranchHistoryTransition(next, options);
  v2Assert(next.sequence === previous.sequence + 1 && next.mode !== 'upgrade'
    && next.operationId !== previous.operationId && equal(next.origin, previous.origin)
    && next.packageFingerprint === previous.packageFingerprint && equal(next.before, previous.after)
    && equal(next.beforeTranscript, previous.afterTranscript), 'Discontinuous V2 transition.');
  return next;
}

/** Metadata is hash-bound to keep persisted records within the 4 KiB cap.
 * The future publisher/verifier must retain and verify the canonical metadata preimage.
 */
export function assertV2HistoryRecord(record, owner) {
  v2Assert(v2Fields(record, ['requestHash', 'expectedManifestHash', 'saveMetadataHash', 'transition'])
    && [record.requestHash, record.expectedManifestHash, record.saveMetadataHash].every(v2Hash),
  'Invalid history record.');
  assertV2BranchHistoryTransition(record.transition, { persisted: true, ownerSaveId: owner });
  v2Assert(v2Bytes(record) <= LIMIT.recordBytes, 'History record exceeds byte limit.');
  return record;
}

export function assertV2HistoryObject(value, owner, type) {
  v2Assert(['vector', 'page'].includes(type), 'Unknown history object type.');
  const isVector = type === 'vector';
  v2Assert(v2Fields(value, isVector
    ? ['kind', 'version', 'ownerSaveId', 'previous', 'rowCount', 'rows']
    : ['kind', 'version', 'ownerSaveId', 'previous', 'records'])
    && value.kind === `directive.branchHistory${isVector ? 'Vector' : 'Page'}.v2`
    && value.version === 2 && value.ownerSaveId === owner && v2Owner(owner), 'Invalid V2 object.');
  if (value.previous !== null) assertV2HistoryRef(value.previous, owner, type);
  if (isVector) {
    v2Assert(integer(value.rowCount) && value.rowCount <= LIMIT.rows
      && dataArray(value.rows, LIMIT.chunkRows) && value.rows.length > 0
      && value.rows.length <= value.rowCount && value.rows.every(v2Hash), 'Invalid vector chunk.');
    v2Assert(v2Bytes(value) <= LIMIT.chunkBytes, 'Vector chunk exceeds byte limit.');
  } else {
    v2Assert(dataArray(value.records, LIMIT.pageRecords) && value.records.length > 0, 'Invalid history page.');
    for (let index = 0; index < value.records.length; index++) {
      assertV2HistoryRecord(value.records[index], owner);
      if (index > 0) assertV2HistoryTransitionLink(value.records[index - 1].transition,
        value.records[index].transition, { persisted: true, ownerSaveId: owner });
    }
    v2Assert(value.previous !== null || value.records[0].transition.sequence === 0,
      'First history page must begin with upgrade.');
    v2Assert(value.previous === null || value.records[0].transition.sequence > 0,
      'Upgrade cannot have a prior page.');
    v2Assert(v2Bytes(value) <= LIMIT.pageBytes, 'History page exceeds byte limit.');
  }
  return value;
}

/** Local head plus a single immutable V1 archive reference. Archive closure,
 * predecessor ownership and cumulative counts require verification. floor is the
 * local sequence-zero upgrade boundary, not the predecessor historical floor.
 */
export function assertV2BranchHistoryHead(head, manifest = null) {
  v2Assert(v2Fields(head, [
    'kind', 'version', 'ownerSaveId', 'predecessor', 'floor', 'head', 'sequence', 'recordCount', 'page',
  ]) && head.kind === 'directive.branchHistoryHead.v2' && head.version === 2 && v2Owner(head.ownerSaveId)
    && integer(head.sequence) && head.sequence < LIMIT.records
    && head.recordCount === head.sequence + 1, 'Invalid V2 history head.');
  const ref = head.predecessor;
  v2Assert(v2Fields(ref, ['path', 'contentHash']) && v2Hash(ref.contentHash)
    && ref.path === `v1/history-archives/archive-${ref.contentHash}.json`, 'Invalid V1 predecessor reference.');
  boundary(head.floor);
  boundary(head.head);
  v2Assert(head.head.revision >= head.floor.revision
    && head.head.revision - head.floor.revision <= head.sequence
    && (head.head.revision !== head.floor.revision || head.head.stateHash === head.floor.stateHash),
  'History head differs from its local upgrade floor.');
  assertV2HistoryRef(head.page, head.ownerSaveId, 'page');
  if (manifest !== null) {
    const detached = detachV2History(manifest);
    v2Assert(detached.saveId === head.ownerSaveId && detached.currentRevision === head.head.revision
      && detached.currentStateHash === head.head.stateHash, 'History head differs from manifest.');
  }
  return head;
}

export function assertV2HistoryBudget(value) {
  v2Assert(v2Fields(value, ['records', 'pages', 'chunks', 'historyBytes']) && Object.values(value).every(integer)
    && value.records <= LIMIT.records && value.pages <= LIMIT.pages && value.chunks <= LIMIT.chunks
    && value.historyBytes <= LIMIT.historyBytes, 'History cumulative limit exceeded.', 'DIRECTIVE_V2_HISTORY_LIMIT_EXCEEDED');
  return value;
}
