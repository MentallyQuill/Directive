import { hashStableJson, stableJsonByteLength } from '../runtime/architecture-redesign-contracts.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stable(value) {
  return JSON.stringify(value);
}

function sortedStrings(values = []) {
  return [...new Set(asArray(values).map((value) => String(value || '').trim()).filter(Boolean))].sort();
}

function equal(a, b) {
  return stable(a) === stable(b);
}

function token(value) {
  return String(value ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

export const OPEN_WORLD_REDUCER_ROOTS = Object.freeze([
  'worldState',
  'timeLedger',
  'eventLedger',
  'questLedger',
  'dynamicQuestCatalog',
  'knowledgeLedger',
  'threadLedger',
  'storyArcLedger',
  'attentionState',
  'mission',
  'campaign',
  'runtimeTracking'
]);

const WORLD_COLLECTIONS = Object.freeze(['locations', 'factions', 'actors', 'fronts', 'clocks', 'tracks']);
const EVENT_COLLECTIONS = Object.freeze(['committedEvents', 'pendingReactions', 'reactionHistory']);
const QUEST_COLLECTIONS = Object.freeze(['instances']);
const DYNAMIC_COLLECTIONS = Object.freeze(['templates', 'proposalJournal', 'semanticIndex']);
const KNOWLEDGE_COLLECTIONS = Object.freeze(['facts', 'rumors', 'contradictions']);
const THREAD_COLLECTIONS = Object.freeze(['records', 'activationReviews', 'closureReviews', 'promotionReviews', 'history']);
const STORY_COLLECTIONS = Object.freeze(['arcs', 'milestones', 'endingAxes']);
const TIME_COLLECTIONS = Object.freeze(['entries']);

const RUNTIME_ALLOWED_FIELDS = new Set([
  'schemaVersion',
  'revision',
  'lastWorldBoundary',
  'sceneReconciliation',
  'timeNormalization'
]);

function hasOpenWorldBoundaryProjection(value) {
  return isObject(value)
    && value.authority === 'openWorldBoundaryProjection'
    && value.projectionSource === 'directorCoordinator'
    && value.compatibilityMirror?.kind === 'directive.openWorldBoundaryProjectionRef.v1';
}

function hasTimeNormalizationProjection(value) {
  return isObject(value)
    && value.authority === 'timeNormalizationProjection'
    && value.projectionSource === 'campaignTimeState'
    && value.compatibilityMirror?.kind === 'directive.timeNormalizationProjectionRef.v1';
}

const FORBIDDEN_KEYS = new Set([
  'rootsSet',
  'snapshotBefore',
  'campaignState',
  'payload.campaignState',
  'ingressLedger',
  'responseLedger',
  'sidecarJournal',
  'modelCallJournal',
  'pendingInteractions'
]);

function validateNoForbiddenKeys(value, path = []) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateNoForbiddenKeys(item, [...path, String(index)]));
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    const dotted = [...path, key].join('.');
    if (FORBIDDEN_KEYS.has(key) || FORBIDDEN_KEYS.has(dotted)) {
      throw new Error(`Open-world reducer bundle cannot retain forbidden key "${dotted}".`);
    }
    validateNoForbiddenKeys(item, [...path, key]);
  }
}

export function validateOpenWorldReducerBundle(bundle) {
  if (bundle?.kind !== 'directive.openWorldReducerBundle.v1') {
    throw new Error('Expected directive.openWorldReducerBundle.v1.');
  }
  validateNoForbiddenKeys(bundle);
  const operations = asArray(bundle.operations);
  const actualChangedRoots = [];
  for (const [index, operation] of operations.entries()) {
    if (!isObject(operation)) {
      throw new Error(`Open-world reducer operation ${index} must be an object.`);
    }
    if (!['value.set', 'collection.mergeById'].includes(operation.type)) {
      throw new Error(`Unknown open-world reducer operation "${operation.type}".`);
    }
    if (!Array.isArray(operation.path) || operation.path.length === 0 || operation.path.some((segment) => typeof segment !== 'string' || segment.trim() === '')) {
      throw new Error(`Open-world reducer operation ${index} must have a non-empty path.`);
    }
    const rootName = operation.path[0];
    if (!OPEN_WORLD_REDUCER_ROOTS.includes(rootName)) {
      throw new Error(`Open-world reducer operation ${index} has invalid root "${rootName}".`);
    }
    if (rootName === 'runtimeTracking') {
      const field = operation.path[1];
      if (!RUNTIME_ALLOWED_FIELDS.has(field)) {
        throw new Error(`Open-world reducer cannot write runtimeTracking.${field}; route runtime journals through CORE diagnostics.`);
      }
      if (field === 'lastWorldBoundary' && !hasOpenWorldBoundaryProjection(operation.value)) {
        throw new Error('Open-world reducer requires openWorldBoundaryProjection evidence for runtimeTracking.lastWorldBoundary.');
      }
      if (field === 'timeNormalization' && !hasTimeNormalizationProjection(operation.value)) {
        throw new Error('Open-world reducer requires timeNormalizationProjection evidence for runtimeTracking.timeNormalization.');
      }
    }
    if (operation.type === 'collection.mergeById' && operation.path.length < 2) {
      throw new Error(`Open-world reducer collection operation ${index} must target a collection path.`);
    }
    actualChangedRoots.push(rootName);
  }
  const expectedOperationCount = Number(bundle.diagnostics?.operationCount);
  if (Number.isFinite(expectedOperationCount) && expectedOperationCount !== operations.length) {
    throw new Error(`Open-world reducer diagnostics operationCount mismatch: expected ${expectedOperationCount}, actual ${operations.length}.`);
  }
  if (bundle.diagnostics?.changedRoots !== undefined) {
    if (!Array.isArray(bundle.diagnostics.changedRoots)) {
      throw new Error('Open-world reducer diagnostics changedRoots must be an array.');
    }
    const expectedRoots = sortedStrings(bundle.diagnostics.changedRoots);
    const actualRoots = sortedStrings(actualChangedRoots);
    if (!equal(expectedRoots, actualRoots)) {
      throw new Error(`Open-world reducer diagnostics changedRoots mismatch: expected ${expectedRoots.join(',')}, actual ${actualRoots.join(',')}.`);
    }
  }
  return {
    operationCount: operations.length,
    changedRoots: sortedStrings(actualChangedRoots)
  };
}

export function compactOpenWorldReducerBundleRef(bundle, { outcomeId = null } = {}) {
  const validation = validateOpenWorldReducerBundle(bundle);
  const ref = {
    sourceKind: bundle.kind,
    sourceOutcomeId: bundle.sourceOutcomeId || outcomeId || null,
    sourceEventIds: sortedStrings(bundle.sourceEventIds),
    sourceAnchorRangeHash: bundle.sourceAnchorRange?.rangeHash || null,
    sourceHash: hashStableJson(bundle),
    operationCount: validation.operationCount,
    changedRoots: validation.changedRoots,
    diagnostics: {
      operationCount: bundle.diagnostics?.operationCount ?? validation.operationCount,
      changedRoots: validation.changedRoots,
      boundaryType: bundle.diagnostics?.boundaryType || null,
      eventCount: bundle.diagnostics?.eventCount ?? null,
      reactionCount: bundle.diagnostics?.reactionCount ?? null,
      checkpointRequired: bundle.diagnostics?.checkpointRequired === true
    },
    factHash: null,
    operationHash: hashStableJson(asArray(bundle.operations))
  };
  ref.factHash = hashStableJson({
    sourceOutcomeId: ref.sourceOutcomeId,
    sourceEventIds: ref.sourceEventIds,
    sourceAnchorRangeHash: ref.sourceAnchorRangeHash,
    diagnostics: ref.diagnostics
  });
  return ref;
}

function getAtPath(root, path) {
  let cursor = root;
  for (const segment of path) {
    if (!isObject(cursor) && !Array.isArray(cursor)) return undefined;
    cursor = cursor?.[segment];
  }
  return cursor;
}

function ensureParent(root, path) {
  let cursor = root;
  for (const segment of path.slice(0, -1)) {
    if (!isObject(cursor[segment]) && !Array.isArray(cursor[segment])) {
      cursor[segment] = {};
    }
    cursor = cursor[segment];
  }
  return cursor;
}

function setAtPath(root, path, value) {
  const parent = ensureParent(root, path);
  parent[path.at(-1)] = cloneJson(value);
}

function idOf(record, index = 0) {
  if (record && typeof record === 'object') {
    return record.id
      || record.uid
      || record.templateId
      || record.threadId
      || record.questId
      || `record.${index}.${token(stable(record))}`;
  }
  return `value.${index}.${token(record)}`;
}

function keyedRecords(values = []) {
  const map = new Map();
  asArray(values).forEach((item, index) => {
    map.set(idOf(item, index), item);
  });
  return map;
}

function diffObjectFields(operations, rootName, beforeRoot = {}, afterRoot = {}, excludedFields = []) {
  const excluded = new Set(excludedFields);
  for (const [field, value] of Object.entries(afterRoot || {})) {
    if (excluded.has(field)) continue;
    if (!equal(beforeRoot?.[field], value)) {
      operations.push({
        type: 'value.set',
        path: [rootName, field],
        value: cloneJson(value)
      });
    }
  }
}

function diffKeyedCollection(operations, path, beforeValues = [], afterValues = []) {
  const before = keyedRecords(beforeValues);
  const after = keyedRecords(afterValues);
  const upsert = [];
  const remove = [];

  for (const [id, record] of after.entries()) {
    if (!before.has(id) || !equal(before.get(id), record)) {
      upsert.push(cloneJson(record));
    }
  }
  for (const id of before.keys()) {
    if (!after.has(id)) remove.push(id);
  }
  if (upsert.length || remove.length) {
    operations.push({
      type: 'collection.mergeById',
      path,
      upsert,
      remove
    });
  }
}

function diffRoot({ operations, rootName, beforeState, afterState, collections = [], excludedFields = [] }) {
  const beforeRoot = beforeState?.[rootName];
  const afterRoot = afterState?.[rootName];
  if (afterRoot === undefined) return;
  diffObjectFields(operations, rootName, beforeRoot || {}, afterRoot || {}, collections.concat(excludedFields));
  for (const collectionName of collections) {
    diffKeyedCollection(
      operations,
      [rootName, collectionName],
      beforeRoot?.[collectionName],
      afterRoot?.[collectionName]
    );
  }
}

function diffRuntimeTracking(operations, beforeState, afterState) {
  const beforeRoot = beforeState?.runtimeTracking || {};
  const afterRoot = afterState?.runtimeTracking || {};
  const changedKeys = Object.keys(afterRoot).filter((key) => !equal(beforeRoot[key], afterRoot[key]));
  for (const key of changedKeys) {
    if (!RUNTIME_ALLOWED_FIELDS.has(key)) {
      throw new Error(`Open-world reducer cannot write runtimeTracking.${key}; route runtime journals through CORE diagnostics.`);
    }
    operations.push({
      type: 'value.set',
      path: ['runtimeTracking', key],
      value: cloneJson(afterRoot[key])
    });
  }
}

function applyCollectionMerge(state, operation) {
  const current = asArray(getAtPath(state, operation.path));
  const byId = keyedRecords(current);
  for (const id of asArray(operation.remove)) byId.delete(id);
  for (const record of asArray(operation.upsert)) byId.set(idOf(record), cloneJson(record));
  setAtPath(state, operation.path, [...byId.values()]);
}

export function createOpenWorldReducerBundle({
  beforeState,
  afterState,
  boundaryResult = null,
  sourceOutcomeId = null,
  sourceAnchorRange = null,
  now = null
} = {}) {
  if (!beforeState || !afterState) {
    throw new Error('beforeState and afterState are required.');
  }
  const operations = [];

  diffRoot({ operations, rootName: 'worldState', beforeState, afterState, collections: WORLD_COLLECTIONS });
  diffRoot({ operations, rootName: 'timeLedger', beforeState, afterState, collections: TIME_COLLECTIONS });
  diffRoot({ operations, rootName: 'eventLedger', beforeState, afterState, collections: EVENT_COLLECTIONS });
  diffRoot({ operations, rootName: 'questLedger', beforeState, afterState, collections: QUEST_COLLECTIONS });
  diffRoot({ operations, rootName: 'dynamicQuestCatalog', beforeState, afterState, collections: DYNAMIC_COLLECTIONS });
  diffRoot({ operations, rootName: 'knowledgeLedger', beforeState, afterState, collections: KNOWLEDGE_COLLECTIONS });
  diffRoot({ operations, rootName: 'threadLedger', beforeState, afterState, collections: THREAD_COLLECTIONS });
  diffRoot({ operations, rootName: 'storyArcLedger', beforeState, afterState, collections: STORY_COLLECTIONS });
  diffRoot({ operations, rootName: 'attentionState', beforeState, afterState });
  diffRoot({ operations, rootName: 'mission', beforeState, afterState });
  diffRoot({ operations, rootName: 'campaign', beforeState, afterState });
  diffRuntimeTracking(operations, beforeState, afterState);

  const bundle = {
    kind: 'directive.openWorldReducerBundle.v1',
    sourceOutcomeId: sourceOutcomeId || boundaryResult?.event?.sourceOutcomeId || null,
    sourceEventIds: asArray(boundaryResult?.events || (boundaryResult?.event ? [boundaryResult.event] : []))
      .map((event) => event?.id)
      .filter(Boolean),
    sourceAnchorRange: cloneJson(sourceAnchorRange || boundaryResult?.event?.sourceAnchorRange || null),
    createdAt: typeof now === 'function' ? now() : (now || new Date().toISOString()),
    operations,
    diagnostics: {
      operationCount: operations.length,
      changedRoots: [...new Set(operations.map((operation) => operation.path?.[0]).filter(Boolean))],
      boundaryType: boundaryResult?.diagnostics?.boundaryType || boundaryResult?.event?.boundaryType || null,
      eventCount: asArray(boundaryResult?.events || (boundaryResult?.event ? [boundaryResult.event] : [])).length,
      reactionCount: asArray(boundaryResult?.reactions).length,
      checkpointRequired: false
    }
  };
  validateNoForbiddenKeys(bundle);
  bundle.diagnostics.byteLength = stableJsonByteLength(bundle);
  return bundle;
}

export function applyOpenWorldReducerBundle(campaignState, bundle) {
  validateOpenWorldReducerBundle(bundle);
  const next = cloneJson(campaignState || {});
  for (const operation of asArray(bundle.operations)) {
    if (operation.type === 'value.set') {
      setAtPath(next, operation.path, operation.value);
    } else if (operation.type === 'collection.mergeById') {
      applyCollectionMerge(next, operation);
    } else {
      throw new Error(`Unknown open-world reducer operation "${operation.type}".`);
    }
  }
  return next;
}

export function pickOpenWorldReducerState(state = {}) {
  const out = {};
  for (const rootName of OPEN_WORLD_REDUCER_ROOTS) {
    if (state[rootName] !== undefined) out[rootName] = cloneJson(state[rootName]);
  }
  return out;
}
