// A bounded sample of native persistable row data, not a chronology receipt.
export const HOST_TRANSCRIPT_SNAPSHOT_LIMITS = Object.freeze({
  rows: 20000, rowBytes: 1024 * 1024, totalBytes: 64 * 1024 * 1024,
  depth: 64, slots: 2000000,
});

const UNSUPPORTED = 'DIRECTIVE_HOST_TRANSCRIPT_UNSUPPORTED';
const LIMIT = 'DIRECTIVE_HOST_TRANSCRIPT_LIMIT_EXCEEDED';
const encoder = new TextEncoder();
const dateTime = Date.prototype.getTime;
const dateIso = Date.prototype.toISOString;
class SnapshotError extends Error {
  constructor(reasonCode, detail) { super(detail); this.reasonCode = reasonCode; }
}
function fail(detail, reasonCode = UNSUPPORTED) { throw new SnapshotError(reasonCode, detail); }

export function unsupportedTranscriptSnapshot(error = null) {
  return Object.freeze({ status: 'unsupported',
    reasonCode: error instanceof SnapshotError ? error.reasonCode : UNSUPPORTED,
    detail: error instanceof SnapshotError ? error.message : 'The native transcript cannot be sampled safely.',
  });
}

// Read only own data from native context/selection records; never call a getter.
export function readTranscriptSnapshotDataProperty(object, key) {
  if (!object || typeof object !== 'object'
    || ![Object.prototype, null].includes(Object.getPrototypeOf(object))) fail('Native context data is unavailable.');
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor) return undefined;
  if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) fail('Native context contains an unsupported property.');
  return descriptor.value;
}

function validIdentity(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 && value.trim() === value;
}
function isTimestamp(path) {
  return path[0] === 'rows'
    && ['gen_started', 'gen_finished'].includes(path.at(-1))
    && (path.length === 3 || (path.length === 5 && path[2] === 'swipe_info' && Number.isInteger(path[3])));
}
function isNativeMediaAlias(path, key, descriptor) {
  // Native ensureMessageMediaIsArray installs these non-persisted compatibility
  // aliases. Keep files/media backing data; never invoke or broadly omit getters.
  return path.length === 3 && path[0] === 'rows' && path[2] === 'extra'
    && ['file', 'image', 'video'].includes(key)
    && descriptor.enumerable === false && descriptor.configurable === false
    && typeof descriptor.get === 'function' && typeof descriptor.set === 'function';
}

export function captureHostTranscriptSnapshot(input = {}) {
  try {
    const hostId = readTranscriptSnapshotDataProperty(input, 'hostId');
    const nativeIdentity = readTranscriptSnapshotDataProperty(input, 'nativeIdentity');
    const directiveBinding = readTranscriptSnapshotDataProperty(input, 'directiveBinding') ?? null;
    const rows = readTranscriptSnapshotDataProperty(input, 'rows');
    if (!Array.isArray(rows)) fail('The native transcript is not an array.');
    if (rows.length > HOST_TRANSCRIPT_SNAPSHOT_LIMITS.rows) fail('The native transcript row limit was exceeded.', LIMIT);
    const budget = { bytes: 0, rowBytes: null, slots: 0 };
    const ancestors = new Set();
    function slot(count = 1) {
      budget.slots += count;
      if (budget.slots > HOST_TRANSCRIPT_SNAPSHOT_LIMITS.slots) fail('The native transcript traversal limit was exceeded.', LIMIT);
    }
    function bytes(count) {
      budget.bytes += count;
      if (budget.rowBytes !== null) budget.rowBytes += count;
      if (budget.bytes > HOST_TRANSCRIPT_SNAPSHOT_LIMITS.totalBytes
        || budget.rowBytes > HOST_TRANSCRIPT_SNAPSHOT_LIMITS.rowBytes) fail('The native transcript byte limit was exceeded.', LIMIT);
    }
    function scalar(value) {
      // Only primitives reach JSON.stringify; it cannot invoke native getters/toJSON.
      const remaining = Math.min(HOST_TRANSCRIPT_SNAPSHOT_LIMITS.totalBytes - budget.bytes,
        budget.rowBytes === null ? Infinity : HOST_TRANSCRIPT_SNAPSHOT_LIMITS.rowBytes - budget.rowBytes);
      if (typeof value === 'string' && value.length + 2 > remaining) fail('The native transcript byte limit was exceeded.', LIMIT);
      bytes(encoder.encode(JSON.stringify(value)).byteLength);
      return value;
    }
    function copy(value, path = [], depth = 0) {
      slot();
      if (depth > HOST_TRANSCRIPT_SNAPSHOT_LIMITS.depth) fail('The native transcript nesting limit was exceeded.', LIMIT);
      const row = path.length === 2 && path[0] === 'rows';
      if (row) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) fail('A native transcript row is not an object.');
        budget.rowBytes = 0;
      }
      let result;
      if (value === null || typeof value === 'string' || typeof value === 'boolean') result = scalar(value);
      else if (typeof value === 'number' && Number.isFinite(value)) result = scalar(value);
      else {
        if (!value || typeof value !== 'object') fail('The native transcript contains a non-persistable value.');
        const prototype = Object.getPrototypeOf(value);
        if (prototype === Date.prototype && isTimestamp(path)) {
          // Fresh native generation uses Dates; saved/reloaded rows use ISO text.
          // Only these timestamp paths may normalize through trusted intrinsics.
          if (Reflect.ownKeys(value).length) fail('A native generation timestamp is unsupported.');
          // Continue can subtract reloaded ISO strings and produce an invalid
          // Date. Match native JSON persistence (null), without invoking toJSON.
          result = scalar(Number.isFinite(dateTime.call(value)) ? dateIso.call(value) : null);
        } else {
          const array = Array.isArray(value);
          if (array ? prototype !== Array.prototype : ![Object.prototype, null].includes(prototype)) fail('The native transcript contains a custom object.');
          if (ancestors.has(value)) fail('The native transcript contains a cycle.');
          const keys = Reflect.ownKeys(value);
          if (keys.length > HOST_TRANSCRIPT_SNAPSHOT_LIMITS.slots - budget.slots) fail('The native transcript traversal limit was exceeded.', LIMIT);
          if (array && keys.length !== value.length + 1) fail('The native transcript contains a sparse or extended array.');
          ancestors.add(value);
          result = array ? [] : {};
          bytes(2); // container delimiters
          let count = 0;
          for (const key of keys) {
            if (array && key === 'length') continue;
            slot();
            if (typeof key !== 'string') fail('The native transcript contains a symbol property.');
            const descriptor = Object.getOwnPropertyDescriptor(value, key);
            if (isNativeMediaAlias(path, key, descriptor)) continue;
            if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail('The native transcript contains an unsupported accessor or hidden property.');
            if (array && key !== String(count)) fail('The native transcript array is not contiguous.');
            if (count++) bytes(1);
            if (!array) { scalar(key); bytes(1); }
            const next = copy(descriptor.value, [...path, array ? Number(key) : key], depth + 1);
            Object.defineProperty(result, key, { value: next, enumerable: true, writable: true, configurable: true });
          }
          ancestors.delete(value);
          Object.freeze(result);
        }
      }
      if (row) budget.rowBytes = null;
      return result;
    }
    const snapshot = copy({ kind: 'directive.hostTranscriptSnapshot.v1', version: 1,
      representation: 'sillytavern.persistable-row-data.v1', hostId, nativeIdentity,
      directiveBinding, rowCount: rows.length, rows });
    if (!['sillytavern', 'fake'].includes(snapshot.hostId)
      || !snapshot.nativeIdentity || !['character', 'group'].includes(snapshot.nativeIdentity.entityType)
      || !validIdentity(snapshot.nativeIdentity.entityId) || !validIdentity(snapshot.nativeIdentity.chatId)) fail('Native chat/entity identity is unavailable.');
    if (snapshot.directiveBinding !== null) {
      if (!snapshot.directiveBinding || typeof snapshot.directiveBinding !== 'object' || Array.isArray(snapshot.directiveBinding)) fail('The declared Directive binding is unsupported.');
      for (const [key, expected] of Object.entries({ hostId: snapshot.hostId, ...snapshot.nativeIdentity })) {
        const declared = snapshot.directiveBinding[key];
        if (declared !== undefined && declared !== null && String(declared) !== expected) fail('The declared Directive binding conflicts with native selection.');
      }
    }
    return Object.freeze({ status: 'captured', snapshot });
  } catch (error) { return unsupportedTranscriptSnapshot(error); }
}
