export const V1_CAMPAIGN_STATE_DELTA_KIND = 'directive.campaignStateDelta.v1';

const BLOCKED_PATH_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const OPERATION_KINDS = new Set(['set', 'delete', 'splice']);
const DELTA_FIELDS = new Set([
  'kind',
  'saveId',
  'beforeRevision',
  'afterRevision',
  'beforeHash',
  'afterHash',
  'changedRoots',
  'operations',
  'createdAt',
  'source',
]);

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function object(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizedJson(value) {
  const text = JSON.stringify(value);
  if (text === undefined) throw deltaError('DIRECTIVE_V1_STATE_DELTA_VALUE_INVALID', 'State delta values must be JSON serializable.');
  return JSON.parse(text);
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(normalizedJson(value)));
}

export async function sha256Json(value) {
  if (!globalThis.crypto?.subtle) {
    throw deltaError('DIRECTIVE_V1_STATE_DELTA_CRYPTO_UNAVAILABLE', 'SHA-256 is unavailable in this runtime.');
  }
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function deltaError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = clone(details);
  return error;
}

function equal(left, right) {
  if (left === undefined || right === undefined) return left === right;
  return canonicalJson(left) === canonicalJson(right);
}

function validPath(path) {
  return Array.isArray(path)
    && path.length > 0
    && path.every((part) => (
      (typeof part === 'string' && part.length > 0 && !BLOCKED_PATH_KEYS.has(part))
      || (Number.isInteger(part) && part >= 0)
    ));
}

function assertPath(path) {
  if (!validPath(path)) {
    throw deltaError('DIRECTIVE_V1_STATE_DELTA_PATH_INVALID', 'State delta operation path is unsafe or empty.', { path });
  }
}

function diffValue(before, after, path, operations) {
  if (equal(before, after)) return;
  if (Array.isArray(before) && Array.isArray(after)) {
    if (before.length === after.length && before.length > 1) {
      const maximumShift = Math.min(8, before.length - 1);
      for (let shift = 1; shift <= maximumShift; shift += 1) {
        if (before.slice(shift).every((value, index) => equal(value, after[index]))) {
          operations.push({ op: 'splice', path: clone(path), start: 0, deleteCount: shift, items: [] });
          operations.push({
            op: 'splice',
            path: clone(path),
            start: after.length - shift,
            deleteCount: 0,
            items: clone(after.slice(after.length - shift)),
          });
          return;
        }
        if (before.slice(0, before.length - shift).every((value, index) => equal(value, after[index + shift]))) {
          operations.push({
            op: 'splice',
            path: clone(path),
            start: before.length - shift,
            deleteCount: shift,
            items: [],
          });
          operations.push({
            op: 'splice',
            path: clone(path),
            start: 0,
            deleteCount: 0,
            items: clone(after.slice(0, shift)),
          });
          return;
        }
      }
    }
    let prefix = 0;
    while (prefix < before.length && prefix < after.length && equal(before[prefix], after[prefix])) prefix += 1;
    let suffix = 0;
    while (suffix < before.length - prefix
      && suffix < after.length - prefix
      && equal(before[before.length - 1 - suffix], after[after.length - 1 - suffix])) suffix += 1;
    const beforeMiddleLength = before.length - prefix - suffix;
    const afterMiddleLength = after.length - prefix - suffix;
    if (beforeMiddleLength === afterMiddleLength) {
      for (let index = 0; index < beforeMiddleLength; index += 1) {
        diffValue(before[prefix + index], after[prefix + index], [...path, prefix + index], operations);
      }
      return;
    }
    operations.push({
      op: 'splice',
      path: clone(path),
      start: prefix,
      deleteCount: beforeMiddleLength,
      items: clone(after.slice(prefix, prefix + afterMiddleLength)),
    });
    return;
  }
  if (object(before) && object(after)) {
    for (const key of Object.keys(before).sort()) {
      if (!Object.hasOwn(after, key)) operations.push({ op: 'delete', path: [...path, key] });
    }
    for (const key of Object.keys(after).sort()) {
      if (!Object.hasOwn(before, key)) operations.push({ op: 'set', path: [...path, key], value: clone(after[key]) });
      else diffValue(before[key], after[key], [...path, key], operations);
    }
    return;
  }
  operations.push({ op: 'set', path: clone(path), value: clone(after) });
}

function revisionOf(state) {
  const revision = state?.stateCustody?.revision;
  if (!Number.isInteger(revision) || revision < 0) {
    throw deltaError('DIRECTIVE_V1_STATE_DELTA_REVISION_INVALID', 'State delta requires a nonnegative state-custody revision.');
  }
  return revision;
}

function normalizedRoots(changedRoots) {
  if (!Array.isArray(changedRoots)) {
    throw deltaError('DIRECTIVE_V1_STATE_DELTA_ROOTS_INVALID', 'State delta changedRoots must be an array.');
  }
  const roots = [...new Set(changedRoots.map((root) => String(root ?? '').trim()).filter(Boolean))].sort();
  if (roots.some((root) => BLOCKED_PATH_KEYS.has(root))) {
    throw deltaError('DIRECTIVE_V1_STATE_DELTA_ROOTS_INVALID', 'State delta contains an unsafe changed root.');
  }
  return roots;
}

function assertTimestamp(value) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw deltaError('DIRECTIVE_V1_STATE_DELTA_TIMESTAMP_INVALID', 'State delta createdAt must be an ISO timestamp.');
  }
  return value;
}

export async function encodeV1StateDelta({
  saveId,
  before,
  after,
  changedRoots = [],
  createdAt,
  source = 'stateDeltaGateway',
} = {}) {
  const id = String(saveId ?? '').trim();
  if (!id) throw deltaError('DIRECTIVE_V1_STATE_DELTA_SAVE_INVALID', 'State delta requires a save ID.');
  const roots = normalizedRoots(changedRoots);
  const beforeRevision = revisionOf(before);
  const afterRevision = revisionOf(after);
  if (afterRevision <= beforeRevision) {
    throw deltaError('DIRECTIVE_V1_STATE_DELTA_REVISION_INVALID', 'State delta revision must advance.');
  }
  const operations = [];
  for (const root of roots) diffValue(before?.[root], after?.[root], [root], operations);
  const delta = {
    kind: V1_CAMPAIGN_STATE_DELTA_KIND,
    saveId: id,
    beforeRevision,
    afterRevision,
    beforeHash: await sha256Json(before),
    afterHash: await sha256Json(after),
    changedRoots: roots,
    operations,
    createdAt: assertTimestamp(createdAt),
    source: String(source ?? '').trim() || 'stateDeltaGateway',
  };
  const replayed = await applyV1StateDelta({ saveId: id, state: before, delta });
  if (canonicalJson(replayed) !== canonicalJson(after)) {
    throw deltaError('DIRECTIVE_V1_STATE_DELTA_INCOMPLETE', 'State delta changedRoots do not reproduce the proposed state.');
  }
  return delta;
}

function assertOperation(operation, changedRoots) {
  if (!object(operation) || !OPERATION_KINDS.has(operation.op)) {
    throw deltaError('DIRECTIVE_V1_STATE_DELTA_OPERATION_INVALID', 'State delta operation is unsupported.');
  }
  assertPath(operation.path);
  if (!changedRoots.has(operation.path[0])) {
    throw deltaError('DIRECTIVE_V1_STATE_DELTA_OPERATION_UNAUTHORIZED', 'State delta operation is outside its changed roots.');
  }
  const allowed = operation.op === 'set'
    ? new Set(['op', 'path', 'value'])
    : operation.op === 'delete'
      ? new Set(['op', 'path'])
      : new Set(['op', 'path', 'start', 'deleteCount', 'items']);
  if (Object.keys(operation).some((key) => !allowed.has(key))) {
    throw deltaError('DIRECTIVE_V1_STATE_DELTA_OPERATION_INVALID', 'State delta operation contains unknown fields.');
  }
  if (operation.op === 'set' && !Object.hasOwn(operation, 'value')) {
    throw deltaError('DIRECTIVE_V1_STATE_DELTA_OPERATION_INVALID', 'State delta set operation requires a value.');
  }
  if (operation.op === 'splice' && (
    !Number.isInteger(operation.start) || operation.start < 0
    || !Number.isInteger(operation.deleteCount) || operation.deleteCount < 0
    || !Array.isArray(operation.items)
  )) {
    throw deltaError('DIRECTIVE_V1_STATE_DELTA_OPERATION_INVALID', 'State delta splice operation is invalid.');
  }
}

function parentFor(root, path) {
  let parent = root;
  for (const part of path.slice(0, -1)) {
    if ((!object(parent) && !Array.isArray(parent)) || !Object.hasOwn(parent, part)) {
      throw deltaError('DIRECTIVE_V1_STATE_DELTA_PATH_MISSING', 'State delta operation path does not exist.', { path });
    }
    parent = parent[part];
  }
  return { parent, key: path.at(-1) };
}

function valueAt(root, path) {
  let value = root;
  for (const part of path) {
    if ((!object(value) && !Array.isArray(value)) || !Object.hasOwn(value, part)) {
      throw deltaError('DIRECTIVE_V1_STATE_DELTA_PATH_MISSING', 'State delta operation path does not exist.', { path });
    }
    value = value[part];
  }
  return value;
}

function applyOperation(state, operation) {
  if (operation.op === 'splice') {
    const target = valueAt(state, operation.path);
    if (!Array.isArray(target) || operation.start > target.length || operation.start + operation.deleteCount > target.length) {
      throw deltaError('DIRECTIVE_V1_STATE_DELTA_SPLICE_INVALID', 'State delta splice is outside the target array.');
    }
    target.splice(operation.start, operation.deleteCount, ...clone(operation.items));
    return;
  }
  const { parent, key } = parentFor(state, operation.path);
  if (!object(parent) && !Array.isArray(parent)) {
    throw deltaError('DIRECTIVE_V1_STATE_DELTA_PATH_MISSING', 'State delta operation parent does not exist.');
  }
  if (operation.op === 'set') {
    if (Array.isArray(parent)
      && (!Number.isInteger(key) || key < 0 || key >= parent.length)) {
      throw deltaError(
        'DIRECTIVE_V1_STATE_DELTA_SET_INVALID',
        'State delta array updates require an existing numeric index; use splice for structural changes.',
      );
    }
    parent[key] = clone(operation.value);
    return;
  }
  if (!Object.hasOwn(parent, key) || Array.isArray(parent)) {
    throw deltaError('DIRECTIVE_V1_STATE_DELTA_DELETE_INVALID', 'State delta delete requires an existing object field.');
  }
  delete parent[key];
}

function validateV1StateDelta({ saveId, state, delta }) {
  const id = String(saveId ?? '').trim();
  if (!object(delta) || delta.kind !== V1_CAMPAIGN_STATE_DELTA_KIND) {
    throw deltaError('DIRECTIVE_V1_STATE_DELTA_REJECTED', 'State delta kind is invalid.');
  }
  if (Object.keys(delta).length !== DELTA_FIELDS.size
    || Object.keys(delta).some((key) => !DELTA_FIELDS.has(key))) {
    throw deltaError('DIRECTIVE_V1_STATE_DELTA_REJECTED', 'State delta fields are incomplete or unsupported.');
  }
  if (!id || delta.saveId !== id) {
    throw deltaError('DIRECTIVE_V1_STATE_DELTA_SAVE_MISMATCH', 'State delta belongs to a different save.');
  }
  const roots = new Set(normalizedRoots(delta.changedRoots));
  if (revisionOf(state) !== delta.beforeRevision) {
    throw deltaError('DIRECTIVE_V1_STATE_DELTA_REVISION_GAP', 'State delta before revision does not match current state.');
  }
  if (!Array.isArray(delta.operations)) {
    throw deltaError('DIRECTIVE_V1_STATE_DELTA_OPERATION_INVALID', 'State delta operations must be an array.');
  }
  return roots;
}

function replayV1StateDelta({ state, delta, roots, expectedBeforeHash }) {
  if (expectedBeforeHash !== delta.beforeHash) {
    throw deltaError('DIRECTIVE_V1_STATE_DELTA_BEFORE_HASH_MISMATCH', 'State delta before hash does not match current state.');
  }
  const next = clone(state);
  for (const operation of delta.operations) {
    assertOperation(operation, roots);
    applyOperation(next, operation);
  }
  if (revisionOf(next) !== delta.afterRevision) {
    throw deltaError('DIRECTIVE_V1_STATE_DELTA_REVISION_INVALID', 'Applied state delta does not reach its after revision.');
  }
  return next;
}

export async function applyV1StateDeltaChainStep({ saveId, state, delta, expectedBeforeHash } = {}) {
  const roots = validateV1StateDelta({ saveId, state, delta });
  const next = replayV1StateDelta({ state, delta, roots, expectedBeforeHash });
  return { state: next, stateHash: delta.afterHash };
}

export async function applyV1StateDelta({ saveId, state, delta } = {}) {
  const roots = validateV1StateDelta({ saveId, state, delta });
  const next = replayV1StateDelta({
    state,
    delta,
    roots,
    expectedBeforeHash: await sha256Json(state),
  });
  if (await sha256Json(next) !== delta.afterHash) {
    throw deltaError('DIRECTIVE_V1_STATE_DELTA_AFTER_HASH_MISMATCH', 'Applied state delta does not match its after hash.');
  }
  return next;
}
