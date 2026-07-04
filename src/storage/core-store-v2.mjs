import {
  createTurnLatencyMetrics,
  createTurnSourceFrameRef,
  hashStableJson,
  redactExternalDiagnostic,
  stableJsonByteLength
} from '../runtime/architecture-redesign-contracts.mjs';
import {
  commitV2DiagnosticsSegments,
  commitV2EventTurnSegments,
  commitV2SaveLayout,
  loadV2Checkpoint,
  loadV2MaterializedHead,
  loadV2SaveManifest,
  readV2ArtifactRef
} from './transaction-store-v2.mjs';
import {
  applyRecallSourceMutation,
  createRecallSourceMutation,
  normalizeRecallIndexEntry
} from '../retrieval/recall-index.mjs';

const RECALL_INDEX_AUXILIARY_SEGMENT_KIND = 'directive.recallIndexSegment.v1';
const RECALL_INDEX_AUXILIARY_SEGMENT_MAX_BYTES = 5 * 1024 * 1024;

const PHASES = new Set([
  'observed',
  'routePending',
  'hostContinueReleased',
  'mechanicsPending',
  'narrationStarted',
  'visibleResponsePosted',
  'backgroundSettling',
  'responseRetryRequired',
  'recoveryRequired',
  'restartSuperseded',
  'settled',
  'canceled'
]);

const PHASE_TRANSITIONS = Object.freeze({
  observed: new Set(['routePending', 'recoveryRequired', 'restartSuperseded', 'canceled']),
  routePending: new Set(['hostContinueReleased', 'mechanicsPending', 'narrationStarted', 'visibleResponsePosted', 'backgroundSettling', 'responseRetryRequired', 'recoveryRequired', 'restartSuperseded', 'canceled', 'settled']),
  hostContinueReleased: new Set(['visibleResponsePosted', 'backgroundSettling', 'responseRetryRequired', 'recoveryRequired', 'canceled', 'settled']),
  mechanicsPending: new Set(['narrationStarted', 'visibleResponsePosted', 'backgroundSettling', 'responseRetryRequired', 'recoveryRequired', 'canceled', 'settled']),
  narrationStarted: new Set(['visibleResponsePosted', 'responseRetryRequired', 'recoveryRequired', 'canceled']),
  visibleResponsePosted: new Set(['backgroundSettling', 'responseRetryRequired', 'recoveryRequired', 'canceled', 'settled']),
  backgroundSettling: new Set(['visibleResponsePosted', 'settled', 'recoveryRequired', 'canceled']),
  responseRetryRequired: new Set(['visibleResponsePosted', 'recoveryRequired', 'canceled', 'settled']),
  recoveryRequired: new Set(['restartSuperseded', 'canceled', 'settled']),
  restartSuperseded: new Set([]),
  settled: new Set(['recoveryRequired']),
  canceled: new Set([])
});

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

function isoNow() {
  return new Date().toISOString();
}

function compact(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function assertPhase(phase) {
  const value = requireNonEmptyString(phase, 'phase');
  if (!PHASES.has(value)) throw new Error(`Unknown CORE transaction phase "${value}"`);
  return value;
}

function assertPhaseTransition(fromPhase, toPhase) {
  const from = assertPhase(fromPhase);
  const to = assertPhase(toPhase);
  if (from === to) return to;
  const allowed = PHASE_TRANSITIONS[from] || new Set();
  if (!allowed.has(to)) {
    const error = new Error(`Invalid CORE transaction phase transition ${from} -> ${to}`);
    error.code = 'DIRECTIVE_CORE_INVALID_PHASE_TRANSITION';
    error.details = { fromPhase: from, toPhase: to };
    throw error;
  }
  return to;
}

function createRevisions(base = {}) {
  return {
    mechanics: Math.max(0, Number(base.mechanics || 0)),
    runtime: Math.max(0, Number(base.runtime || 0)),
    diagnostic: Math.max(0, Number(base.diagnostic || 0)),
    prompt: Math.max(0, Number(base.prompt || 0))
  };
}

function nextRevisions(base, patch = {}) {
  const next = createRevisions(base);
  for (const key of ['mechanics', 'runtime', 'diagnostic', 'prompt']) {
    next[key] += Math.max(0, Number(patch[key] || 0));
  }
  return next;
}

function maxRevisions(...values) {
  const next = createRevisions();
  for (const value of values) {
    const revisions = createRevisions(value || {});
    for (const key of ['mechanics', 'runtime', 'diagnostic', 'prompt']) {
      next[key] = Math.max(next[key], revisions[key]);
    }
  }
  return next;
}

function sanitizeDiagnostic(value = {}) {
  return redactExternalDiagnostic(cloneJson(value));
}

function safeLogicalSegment(value, fallback = 'segment') {
  const raw = String(value || fallback).trim() || fallback;
  return raw.replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
}

function recallAuxiliarySegmentLogicalKey({ campaignId, saveId, segmentId }) {
  return `campaigns/${safeLogicalSegment(campaignId, 'campaign')}/saves/${safeLogicalSegment(saveId, 'save')}/core/recall-index/${safeLogicalSegment(segmentId, 'segment')}.v1.json`;
}

function artifactRefForRecord({ logicalKey, record }) {
  return compact({
    logicalKey,
    kind: record.kind || undefined,
    hash: record.hash || hashStableJson(record),
    byteLength: record.byteLength || stableJsonByteLength(record),
    entryCount: Number.isFinite(Number(record.entryCount)) ? Number(record.entryCount) : undefined
  });
}

function withRecordHashAndSize(record = {}) {
  const base = cloneJson(record);
  delete base.hash;
  delete base.byteLength;
  const withHash = {
    ...base,
    hash: hashStableJson(base)
  };
  return {
    ...withHash,
    byteLength: stableJsonByteLength(withHash)
  };
}

function chunkRecallAuxiliaryEntries(entries = [], maxBytes = RECALL_INDEX_AUXILIARY_SEGMENT_MAX_BYTES) {
  const chunks = [];
  let current = [];
  for (const entry of entries || []) {
    const candidate = [...current, entry];
    const candidateRecord = {
      kind: RECALL_INDEX_AUXILIARY_SEGMENT_KIND,
      schemaVersion: 1,
      entries: candidate,
      entryCount: candidate.length
    };
    if (current.length > 0 && stableJsonByteLength(candidateRecord) > maxBytes) {
      chunks.push(current);
      current = [entry];
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function collectRecallEntriesFromOperationBundle(operationBundle = {}) {
  return (Array.isArray(operationBundle.recallEntries) ? operationBundle.recallEntries : [])
    .map((entry) => normalizeRecallIndexEntry(sanitizeDiagnostic(entry)))
    .filter((entry) => entry && typeof entry === 'object');
}

export async function writeCoreRecallIndexAuxiliarySegments(adapter, {
  campaignId,
  saveId,
  branchId = null,
  transactionId = null,
  batchId = null,
  entries = [],
  createdAt = null,
  source = 'core-background-batch'
} = {}) {
  const id = requireNonEmptyString(campaignId, 'campaignId');
  const save = requireNonEmptyString(saveId, 'saveId');
  const cleanEntries = (Array.isArray(entries) ? entries : [])
    .map((entry) => normalizeRecallIndexEntry(sanitizeDiagnostic(entry)))
    .filter((entry) => entry && typeof entry === 'object');
  if (cleanEntries.length === 0) return [];
  const timestamp = createdAt || isoNow();
  const refs = [];
  const segmentBase = `${safeLogicalSegment(batchId || transactionId || hashStableJson(cleanEntries).slice(0, 12), 'recall')}`;
  for (const [index, segmentEntries] of chunkRecallAuxiliaryEntries(cleanEntries).entries()) {
    const segmentId = `${segmentBase}-${String(index).padStart(4, '0')}`;
    const logicalKey = recallAuxiliarySegmentLogicalKey({ campaignId: id, saveId: save, segmentId });
    const record = withRecordHashAndSize({
      kind: RECALL_INDEX_AUXILIARY_SEGMENT_KIND,
      schemaVersion: 1,
      campaignId: id,
      saveId: save,
      branchId: branchId || save,
      transactionId,
      batchId,
      segmentId,
      source,
      excludesRawContent: true,
      createdAt: timestamp,
      entries: segmentEntries,
      entryCount: segmentEntries.length
    });
    await adapter.writeJson(logicalKey, record);
    refs.push(artifactRefForRecord({ logicalKey, record }));
  }
  return refs;
}

export async function readCoreRecallIndexAuxiliaryEntries(adapter, refs = []) {
  const entries = [];
  const seen = new Set();
  for (const ref of refs || []) {
    if (!ref?.logicalKey || seen.has(ref.logicalKey)) continue;
    seen.add(ref.logicalKey);
    const segment = await readV2ArtifactRef(adapter, ref);
    if (Array.isArray(segment.entries)) {
      entries.push(...segment.entries.map((entry) => normalizeRecallIndexEntry(sanitizeDiagnostic(entry))));
    }
  }
  return entries;
}

function recallAuxiliaryRefsFromEvents(events = []) {
  let refs = [];
  const seen = new Set();
  const addRefs = (values = []) => {
    for (const ref of values || []) {
      if (!ref?.logicalKey || seen.has(ref.logicalKey)) continue;
      seen.add(ref.logicalKey);
      refs.push(cloneJson(ref));
    }
  };
  for (const event of events || []) {
    const payload = eventPayload(event);
    const bundle = payload.operationBundle || {};
    if (payload.recallAuxiliaryRewrite?.mode === 'snapshot') {
      refs = [];
      seen.clear();
    }
    addRefs(bundle.recallAuxiliaryRefs || []);
    addRefs(payload.recallAuxiliaryRefs || []);
  }
  return refs;
}

function replaceRecallAuxiliaryRefs(value, refs = []) {
  if (Array.isArray(value)) return value.map((entry) => replaceRecallAuxiliaryRefs(entry, refs));
  if (!value || typeof value !== 'object') return cloneJson(value);
  const next = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'recallAuxiliaryRefs' && Array.isArray(entry)) {
      next[key] = refs.map(cloneJson);
    } else {
      next[key] = replaceRecallAuxiliaryRefs(entry, refs);
    }
  }
  return next;
}

async function forkRecallAuxiliaryArtifactsForSaveBranch(adapter, {
  sourceState,
  mutation,
  targetSaveId,
  targetBranchId,
  now = null
} = {}) {
  const sourceRefs = recallAuxiliaryRefsFromEvents(sourceState?.events || []);
  if (sourceRefs.length === 0) {
    return {
      sourceRefs: [],
      targetRefs: [],
      trace: {
        inputCount: 0,
        outputCount: 0,
        forkedCount: 0
      }
    };
  }
  const sourceEntries = await readCoreRecallIndexAuxiliaryEntries(adapter, sourceRefs);
  const result = applyRecallSourceMutation({ entries: sourceEntries, mutation });
  const targetEntries = (result.entries || [])
    .filter((entry) => entry.saveId === targetSaveId && entry.branchId === targetBranchId)
    .map(cloneJson);
  const targetRefs = await writeCoreRecallIndexAuxiliarySegments(adapter, {
    campaignId: sourceState.campaignId,
    saveId: targetSaveId,
    branchId: targetBranchId,
    transactionId: 'save-as',
    batchId: `save-as-${hashStableJson({ sourceSaveId: sourceState.saveId }).slice(0, 12)}`,
    entries: targetEntries,
    createdAt: typeof now === 'function' ? now() : now,
    source: 'save-as-recall-fork'
  });
  return {
    sourceRefs,
    targetRefs,
    trace: {
      ...cloneJson(result.trace || {}),
      targetEntryCount: targetEntries.length,
      sourceRefCount: sourceRefs.length,
      targetRefCount: targetRefs.length
    }
  };
}

async function rewriteRecallAuxiliaryArtifactsForSourceMutation(adapter, {
  state,
  mutation,
  transactionId = null,
  recoveryCaseId = null,
  now = null
} = {}) {
  if (!mutation?.kind) return null;
  const sourceRefs = recallAuxiliaryRefsFromEvents(state?.events || []);
  if (sourceRefs.length === 0) {
    return {
      kind: 'directive.recallAuxiliaryRewrite.v1',
      mode: 'snapshot',
      sourceRefs: [],
      targetRefs: [],
      trace: {
        inputCount: 0,
        outputCount: 0,
        invalidatedCount: 0,
        forkedCount: 0,
        sourceRefCount: 0,
        targetRefCount: 0
      }
    };
  }
  const sourceEntries = await readCoreRecallIndexAuxiliaryEntries(adapter, sourceRefs);
  const result = applyRecallSourceMutation({ entries: sourceEntries, mutation });
  const targetRefs = await writeCoreRecallIndexAuxiliarySegments(adapter, {
    campaignId: state.campaignId,
    saveId: state.saveId,
    branchId: state.branchId,
    transactionId,
    batchId: `source-mutation-${hashStableJson({
      transactionId,
      recoveryCaseId,
      mutationHash: mutation.hash
    }).slice(0, 12)}`,
    entries: result.entries || [],
    createdAt: typeof now === 'function' ? now() : now,
    source: 'repair-source-mutation-recall-rewrite'
  });
  return {
    kind: 'directive.recallAuxiliaryRewrite.v1',
    mode: 'snapshot',
    sourceRefs,
    targetRefs,
    trace: {
      ...cloneJson(result.trace || {}),
      sourceRefCount: sourceRefs.length,
      targetRefCount: targetRefs.length
    }
  };
}

function sanitizeRecoverySourceMutation(value = {}) {
  const source = isObject(value) ? value : {};
  const sanitized = sanitizeDiagnostic(source);
  if (Object.prototype.hasOwnProperty.call(sanitized, 'replacementText')) {
    const rawReplacementText = String(source.replacementText || '').trim();
    if (!sanitized.replacementTextHash && rawReplacementText) {
      sanitized.replacementTextHash = hashStableJson({ text: rawReplacementText });
    }
    if (sanitized.replacementTextPresent === undefined) {
      sanitized.replacementTextPresent = Boolean(rawReplacementText);
    }
    delete sanitized.replacementText;
  }
  for (const key of Object.keys(sanitized)) {
    if (/^raw/i.test(key)) delete sanitized[key];
  }
  return sanitized;
}

function compactResponseRetryPlan(value = {}) {
  if (!isObject(value)) return null;
  const stripRawTextKeys = (input) => {
    if (Array.isArray(input)) return input.map(stripRawTextKeys);
    if (!isObject(input)) return input;
    const output = {};
    for (const [key, item] of Object.entries(input)) {
      if (/^raw/i.test(key) || /(?:^|_)(?:text|prompt|payload|content|output)$/i.test(key)) continue;
      output[key] = stripRawTextKeys(item);
    }
    return output;
  };
  const sanitized = stripRawTextKeys(sanitizeDiagnostic(value));
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

const CONTINUITY_PROJECTION_RAW_FIELD_KEYS = new Set([
  'text',
  'rawtext',
  'message',
  'content',
  'body',
  'prompt',
  'provideroutput',
  'assistanttext',
  'playertext',
  'observedtext',
  'replacementtext',
  'verbatim',
  'summary'
]);

function normalizedContinuityProjectionFieldKey(key) {
  return String(key || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function stripContinuityProjectionRawFields(value) {
  if (Array.isArray(value)) return value.map(stripContinuityProjectionRawFields);
  if (!isObject(value)) return value;
  const next = {};
  for (const [key, item] of Object.entries(value)) {
    const normalizedKey = normalizedContinuityProjectionFieldKey(key);
    if (
      CONTINUITY_PROJECTION_RAW_FIELD_KEYS.has(normalizedKey)
      || (normalizedKey.startsWith('raw') && !normalizedKey.endsWith('hash'))
    ) {
      continue;
    }
    next[key] = stripContinuityProjectionRawFields(item);
  }
  return next;
}

function compactContinuityRecoveryProjection(value = {}) {
  const projection = isObject(value) ? value : {};
  const rejectedClaims = Array.isArray(projection.rejectedClaims)
    ? projection.rejectedClaims
      .map((entry) => stripContinuityProjectionRawFields(sanitizeDiagnostic(entry)))
      .filter((entry) => isObject(entry) && String(entry.id || '').trim())
    : [];
  const projectionHints = Array.isArray(projection.projectionHints)
    ? projection.projectionHints
      .map((entry) => stripContinuityProjectionRawFields(sanitizeDiagnostic(entry)))
      .filter((entry) => isObject(entry) && String(entry.id || '').trim())
    : [];
  const factUseStats = {};
  if (isObject(projection.factUseStats)) {
    for (const [rawFactId, rawStats] of Object.entries(projection.factUseStats)) {
      if (!isObject(rawStats)) continue;
      const stats = stripContinuityProjectionRawFields(sanitizeDiagnostic(rawStats));
      const factId = String(stats.factId || rawFactId || '').trim();
      if (!factId) continue;
      factUseStats[factId] = { ...stats, factId };
    }
  }
  return compact({
    rejectedClaims: rejectedClaims.length ? rejectedClaims : undefined,
    projectionHints: projectionHints.length ? projectionHints : undefined,
    factUseStats: Object.keys(factUseStats).length ? factUseStats : undefined
  });
}

function sourceFrameRef(sourceFrame = {}) {
  return createTurnSourceFrameRef(sourceFrame);
}

function assertSourceFrameScope(sourceFrame = {}, { campaignId, saveId } = {}) {
  const sourceCampaignId = String(sourceFrame.campaignId || '').trim();
  const sourceSaveId = String(sourceFrame.saveId || '').trim();
  const expectedCampaignId = String(campaignId || '').trim();
  const expectedSaveId = String(saveId || '').trim();
  if (
    (sourceCampaignId && expectedCampaignId && sourceCampaignId !== expectedCampaignId)
    || (sourceSaveId && expectedSaveId && sourceSaveId !== expectedSaveId)
  ) {
    const error = new Error('CORE source frame scope mismatch');
    error.code = 'DIRECTIVE_CORE_SOURCE_FRAME_SCOPE_MISMATCH';
    error.details = {
      campaignId: expectedCampaignId || null,
      saveId: expectedSaveId || null,
      sourceCampaignId: sourceCampaignId || null,
      sourceSaveId: sourceSaveId || null
    };
    throw error;
  }
}

function sourceRestartRef({
  priorTransaction = null,
  transaction = null,
  sourceFrame = null,
  options = {},
  occurredAt = null
} = {}) {
  return compact({
    kind: 'directive.coreSourceRestart.v1',
    schemaVersion: 1,
    priorTransactionId: priorTransaction?.id || options.priorTransactionId || null,
    priorIngressId: priorTransaction?.ingressId || options.priorIngressId || null,
    priorSourceFrameId: priorTransaction?.sourceFrameId || options.priorSourceFrameId || null,
    newTransactionId: transaction?.id || options.transactionId || null,
    newIngressId: transaction?.ingressId || options.ingressId || null,
    newSourceFrameId: transaction?.sourceFrameId || sourceFrame?.id || null,
    hostMessageId: sourceFrame?.hostMessageId || priorTransaction?.sourceFrame?.hostMessageId || null,
    observedTextHash: sourceFrame?.textHash || options.observedTextHash || null,
    recoveryId: options.recoveryId || options.priorRecoveryId || null,
    reason: options.reason || 'latest-source-reobserved',
    idempotencyKey: options.idempotencyKey || null,
    occurredAt,
    repairDecision: options.repairDecision ? sanitizeDiagnostic(options.repairDecision) : undefined
  });
}

function compactOperation(operation = {}) {
  return sanitizeDiagnostic(compact({
    domain: operation.domain || null,
    op: operation.op || operation.operation || null,
    summary: operation.summary || null,
    path: operation.path || null,
    targetId: operation.targetId || operation.id || null,
    sourceKind: operation.sourceKind || null,
    sourceHash: operation.sourceHash || null,
    sourceOutcomeId: operation.sourceOutcomeId || null,
    sourceTurnId: operation.sourceTurnId || null,
    sourceEventIds: Array.isArray(operation.sourceEventIds) ? operation.sourceEventIds.map((id) => String(id || '').trim()).filter(Boolean) : undefined,
    sourceAnchorRangeHash: operation.sourceAnchorRangeHash || null,
    operationCount: Number.isFinite(Number(operation.operationCount)) ? Number(operation.operationCount) : undefined,
    changedRoots: Array.isArray(operation.changedRoots) ? operation.changedRoots.map((root) => String(root || '').trim()).filter(Boolean) : undefined,
    factHash: operation.factHash || null,
    valueHash: operation.value === undefined ? operation.valueHash || null : hashStableJson(operation.value)
  }));
}

const FORBIDDEN_MECHANICS_OPERATION_KEY = /^(?:value|payload|campaignState|rootsSet|snapshotBefore|snapshotAfter|before|after)$/i;
const FORBIDDEN_MECHANICS_OPERATION_CONTENT_KEY = /(?:raw|prompt|provider|vector|embedding|secret|api[_-]?key|password|credential|authorization|transcript)/i;

function findForbiddenMechanicsOperationKey(value, path = []) {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findForbiddenMechanicsOperationKey(value[index], [...path, String(index)]);
      if (found) return found;
    }
    return null;
  }
  for (const [key, item] of Object.entries(value)) {
    if (
      FORBIDDEN_MECHANICS_OPERATION_KEY.test(key)
      || FORBIDDEN_MECHANICS_OPERATION_CONTENT_KEY.test(key)
    ) {
      return [...path, key].join('.');
    }
    const found = findForbiddenMechanicsOperationKey(item, [...path, key]);
    if (found) return found;
  }
  return null;
}

function assertBoundedMechanicsOperations(bundle = {}) {
  if (!Array.isArray(bundle.operations)) return;
  for (const [index, operation] of bundle.operations.entries()) {
    if (!operation || typeof operation !== 'object' || Array.isArray(operation)) {
      const error = new Error(`CORE mechanics operation ${index} must be a bounded object`);
      error.code = 'DIRECTIVE_CORE_UNBOUNDED_MECHANICS_OPERATION';
      throw error;
    }
    const forbiddenPath = findForbiddenMechanicsOperationKey(operation, [`operations.${index}`]);
    if (forbiddenPath) {
      const error = new Error(`CORE mechanics operation contains unbounded field "${forbiddenPath}"`);
      error.code = 'DIRECTIVE_CORE_UNBOUNDED_MECHANICS_OPERATION';
      error.details = { path: forbiddenPath };
      throw error;
    }
    if (!operation.domain || !(operation.op || operation.operation)) {
      const error = new Error(`CORE mechanics operation ${index} requires domain and op`);
      error.code = 'DIRECTIVE_CORE_UNBOUNDED_MECHANICS_OPERATION';
      throw error;
    }
  }
}

function compactBackgroundEffectRef(ref = {}) {
  return compact({
    kind: ref.kind || ref.effectKind || null,
    effect: ref.effect || null,
    id: ref.id || ref.hash || null,
    hash: ref.hash || null,
    status: ref.status || null,
    authority: ref.authority || null,
    outcomeId: ref.outcomeId || null,
    sourceOutcomeId: ref.sourceOutcomeId || null,
    turnId: ref.turnId || null,
    ingressId: ref.ingressId || null,
    sourceFrameId: ref.sourceFrameId || null,
    sceneSealId: ref.sceneSealId || null,
    pressureArcDigestId: ref.pressureArcDigestId || null,
    openWorldBoundarySettlementId: ref.openWorldBoundarySettlementId || null,
    operationCount: Number.isFinite(Number(ref.operationCount)) ? Number(ref.operationCount) : undefined,
    changedRoots: Array.isArray(ref.changedRoots) ? ref.changedRoots.map((root) => String(root || '').trim()).filter(Boolean) : undefined,
    boundaryType: ref.boundaryType || null,
    sceneId: ref.sceneId || null,
    phaseId: ref.phaseId || null,
    locationId: ref.locationId || null,
    actorIds: Array.isArray(ref.actorIds) ? ref.actorIds.map((id) => String(id || '').trim()).filter(Boolean) : undefined,
    subjectIds: Array.isArray(ref.subjectIds) ? ref.subjectIds.map((id) => String(id || '').trim()).filter(Boolean) : undefined,
    threadIds: Array.isArray(ref.threadIds) ? ref.threadIds.map((id) => String(id || '').trim()).filter(Boolean) : undefined,
    missionIds: Array.isArray(ref.missionIds) ? ref.missionIds.map((id) => String(id || '').trim()).filter(Boolean) : undefined,
    pressureIds: Array.isArray(ref.pressureIds) ? ref.pressureIds.map((id) => String(id || '').trim()).filter(Boolean) : undefined,
    arcIds: Array.isArray(ref.arcIds) ? ref.arcIds.map((id) => String(id || '').trim()).filter(Boolean) : undefined,
    tags: Array.isArray(ref.tags) ? ref.tags.map((tag) => String(tag || '').trim()).filter(Boolean) : undefined,
    keywords: Array.isArray(ref.keywords) ? ref.keywords.map((keyword) => String(keyword || '').trim()).filter(Boolean) : undefined,
    primarySignal: ref.primarySignal || null,
    trackSignals: Array.isArray(ref.trackSignals) ? ref.trackSignals.map((signal) => String(signal || '').trim()).filter(Boolean) : undefined,
    strength: ref.strength || null,
    evidenceHash: ref.evidenceHash || null,
    reviewHash: ref.reviewHash || null,
    acceptedBatchHash: ref.acceptedBatchHash || null
  });
}

function compactForgeBatchRef(ref = {}) {
  return compact({
    kind: ref.kind || null,
    batchId: ref.batchId || null,
    operationBundleHash: ref.operationBundleHash || null,
    acceptedBatchHash: ref.acceptedBatchHash || null,
    reviewHash: ref.reviewHash || null,
    workerCount: Number.isFinite(Number(ref.workerCount)) ? Number(ref.workerCount) : undefined,
    operationCount: Number.isFinite(Number(ref.operationCount)) ? Number(ref.operationCount) : undefined,
    reviewCount: Number.isFinite(Number(ref.reviewCount)) ? Number(ref.reviewCount) : undefined,
    stateRevision: Number.isFinite(Number(ref.stateRevision)) ? Number(ref.stateRevision) : undefined
  });
}

function safeCheckpointId(value, fallback) {
  const raw = String(value || fallback || 'core-mechanics-checkpoint').trim();
  const safe = raw
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return safe || String(fallback || 'core-mechanics-checkpoint');
}

function mechanicsCheckpointInput(bundle = {}) {
  const candidate = bundle.checkpointBefore || bundle.coreCheckpoint || null;
  if (!isObject(candidate) || !isObject(candidate.campaignState)) return null;
  return candidate;
}

function mechanicsCheckpointRef(transaction, bundle = {}) {
  const input = mechanicsCheckpointInput(bundle);
  if (!input) return null;
  const fallback = `core-mechanics-${bundle.outcomeId || bundle.turnId || transaction.id}`;
  const sourceRevision = Number(input.sourceRevision);
  return compact({
    kind: 'directive.coreMechanicsCheckpointRef.v1',
    campaignId: transaction.campaignId,
    saveId: transaction.saveId,
    checkpointId: safeCheckpointId(input.checkpointId, fallback),
    layout: 'core',
    sourceKind: input.sourceKind || 'coreStoreV2.commitMechanics',
    sourceRevision: Number.isFinite(sourceRevision) ? sourceRevision : undefined
  });
}

function mechanicsCheckpointArtifact(transaction, bundle = {}, ref = null, revisionsBefore = null) {
  const input = mechanicsCheckpointInput(bundle);
  if (!input || !ref) return null;
  return compact({
    kind: 'directive.coreMechanicsCheckpoint.v1',
    schemaVersion: 1,
    type: 'coreMechanicsPreOutcome',
    campaignId: transaction.campaignId,
    saveId: transaction.saveId,
    checkpointId: ref.checkpointId,
    transactionId: transaction.id,
    turnId: bundle.turnId || transaction.turnId || transaction.id,
    outcomeId: bundle.outcomeId || null,
    sourceKind: ref.sourceKind,
    sourceRevision: ref.sourceRevision,
    revisionsBefore: revisionsBefore ? cloneJson(revisionsBefore) : undefined,
    snapshotHash: hashStableJson(input.campaignState),
    campaignState: cloneJson(input.campaignState)
  });
}

function operationBundleRef(bundle = {}) {
  const operations = Array.isArray(bundle.operations) ? bundle.operations.map(compactOperation) : [];
  const backgroundEffectRefs = Array.isArray(bundle.backgroundEffectRefs)
    ? bundle.backgroundEffectRefs.map(compactBackgroundEffectRef).filter((ref) => Object.keys(ref).length > 0)
    : undefined;
  const forgeBatchRef = bundle.forgeBatchRef ? compactForgeBatchRef(bundle.forgeBatchRef) : undefined;
  return compact({
    batchId: bundle.batchId || null,
    outcomeId: bundle.outcomeId || null,
    sourceToken: bundle.sourceToken || null,
    sourceFrameRef: bundle.sourceFrameRef ? sanitizeDiagnostic(bundle.sourceFrameRef) : undefined,
    baseMechanicsRevision: Number.isFinite(Number(bundle.baseMechanicsRevision)) ? Number(bundle.baseMechanicsRevision) : undefined,
    operationCount: operations.length,
    operations,
    operationBundleHash: hashStableJson(bundle),
    dirtyDomains: Array.isArray(bundle.promptDirtyDomains) ? [...bundle.promptDirtyDomains] : [],
    coreCheckpointRef: bundle.coreCheckpointRef ? sanitizeDiagnostic(bundle.coreCheckpointRef) : undefined,
    backgroundEffectRefs,
    scenePhaseSealRefs: Array.isArray(bundle.scenePhaseSealRefs) ? bundle.scenePhaseSealRefs.map(sanitizeDiagnostic) : undefined,
    pressureArcDigestRefs: Array.isArray(bundle.pressureArcDigestRefs) ? bundle.pressureArcDigestRefs.map(sanitizeDiagnostic) : undefined,
    recallEntryRefs: Array.isArray(bundle.recallEntryRefs) ? bundle.recallEntryRefs.map(sanitizeDiagnostic) : undefined,
    recallAuxiliaryRefs: Array.isArray(bundle.recallAuxiliaryRefs) ? bundle.recallAuxiliaryRefs.map(sanitizeDiagnostic) : undefined,
    recallRevisions: bundle.recallRevisions ? sanitizeDiagnostic(bundle.recallRevisions) : undefined,
    forgeBatchRef,
    rejectedRefs: Array.isArray(bundle.rejectedRefs) ? bundle.rejectedRefs.map(sanitizeDiagnostic) : undefined,
    staleResultRefs: Array.isArray(bundle.staleResultRefs) ? bundle.staleResultRefs.map(sanitizeDiagnostic) : undefined,
    workers: Array.isArray(bundle.workers) ? bundle.workers.map(sanitizeDiagnostic) : undefined,
    phaseAfter: bundle.phaseAfter || undefined
  });
}

function backgroundBatchRefFromBundle(bundle = {}, { idempotencyKey = null, occurredAt = null } = {}) {
  const effectRefs = Array.isArray(bundle.backgroundEffectRefs)
    ? bundle.backgroundEffectRefs.map(compactBackgroundEffectRef).filter((ref) => Object.keys(ref).length > 0)
    : [];
  const forgeBatchRef = bundle.forgeBatchRef ? compactForgeBatchRef(bundle.forgeBatchRef) : undefined;
  return compact({
    batchId: bundle.batchId || null,
    idempotencyKey,
    outcomeId: bundle.outcomeId || null,
    operationCount: Number.isFinite(Number(bundle.operationCount)) ? Number(bundle.operationCount) : 0,
    dirtyDomains: Array.isArray(bundle.dirtyDomains) ? cloneJson(bundle.dirtyDomains) : [],
    effectCount: effectRefs.length,
    workerCount: Array.isArray(bundle.workers) ? bundle.workers.length : 0,
    occurredAt,
    forgeBatchRef,
    backgroundEffectRefs: effectRefs.length ? effectRefs : undefined,
    acceptedBatchHash: forgeBatchRef?.acceptedBatchHash || undefined,
    reviewHash: forgeBatchRef?.reviewHash || effectRefs.find((ref) => ref?.reviewHash)?.reviewHash || undefined
  });
}

function compactResponseRef(value = {}) {
  const turnLatency = compactTurnTiming(value.turnLatency || value.timing || {});
  return compact({
    kind: value.kind || value.responseKind || null,
    responseId: value.responseId || null,
    hostMessageId: value.hostMessageId || null,
    outcomeId: value.outcomeId || null,
    idempotencyKey: value.idempotencyKey || null,
    directiveGenerationStartedAt: value.directiveGenerationStartedAt || null,
    hostGenerationReleasedAt: value.hostGenerationReleasedAt || null,
    generationStartedAt: value.generationStartedAt || null,
    postedAt: value.postedAt || null,
    turnLatency: turnLatency ? sanitizeDiagnostic(turnLatency) : undefined,
    textHash: value.textHash || null,
    outcomeIntegrity: compactOutcomeIntegrityEvidence(value.outcomeIntegrity),
    repairDecision: value.repairDecision ? sanitizeDiagnostic(value.repairDecision) : undefined
  });
}

function compactOutcomeIntegrityEvidence(integrity = null) {
  if (!isObject(integrity)) return undefined;
  const revisions = Array.isArray(integrity.revisions)
    ? integrity.revisions.map((revision) => compact({
        id: revision?.id || revision?.revisionId || null,
        revisionId: revision?.revisionId || revision?.id || null,
        status: revision?.status || null,
        selected: revision?.selected === true || undefined,
        textHash: revision?.textHash || revision?.hash || null,
        editedAt: revision?.editedAt || null,
        reviewProviderKind: revision?.reviewProviderKind || null,
        reviewVerdict: revision?.reviewVerdict || null
      })).filter((revision) => Object.keys(revision).length > 0)
    : [];
  return compact({
    selectedRevisionId: integrity.selectedRevisionId || null,
    selectedRevisionHash: integrity.selectedRevisionHash || null,
    reviewCount: Number.isFinite(Number(integrity.reviewCount)) ? Number(integrity.reviewCount) : undefined,
    lastReviewStatus: integrity.lastReview?.status || integrity.lastReviewStatus || null,
    lastReviewId: integrity.lastReview?.id || integrity.lastReviewId || null,
    revisions: revisions.length ? revisions : undefined
  });
}

function compactOutcomeRerunRepairDecision(value = null) {
  if (!isObject(value)) return undefined;
  return compact({
    kind: value.kind || null,
    eventType: value.eventType || null,
    sourceKind: value.sourceKind || null,
    transactionId: value.transactionId || null,
    replacedTransactionId: value.replacedTransactionId || null,
    authorized: value.authorized === true,
    action: value.action || null,
    reason: value.reason || null,
    deniedReason: value.deniedReason || null,
    outcomeId: value.outcomeId || null,
    turnId: value.turnId || null,
    resultBand: value.resultBand || null,
    replacementType: value.replacementType || null,
    allowedActions: Array.isArray(value.allowedActions) ? [...value.allowedActions] : undefined,
    branchCandidateRequired: value.branchCandidateRequired === true,
    mechanicsRerunAuthorized: value.mechanicsRerunAuthorized === true,
    replacementTransactionRequired: value.replacementTransactionRequired === true,
    coreTransactionRequired: value.coreTransactionRequired === true,
    normalTurnAllowed: value.normalTurnAllowed === true,
    observedAt: value.observedAt || null
  });
}

function compactOutcomeReplacementRef(value = {}, { transaction = null, idempotencyKey = null, occurredAt = null } = {}) {
  const source = isObject(value) ? value : {};
  const replacementText = typeof source.replacementText === 'string' ? source.replacementText.trim() : '';
  return compact({
    kind: 'directive.coreOutcomeReplacementRef.v1',
    schemaVersion: 1,
    transactionId: transaction?.id || source.transactionId || null,
    replacedTransactionId: source.replacedTransactionId || null,
    replacementTransactionId: transaction?.id || source.replacementTransactionId || source.transactionId || null,
    type: source.type || source.replacementType || 'rerunOutcome',
    replacedOutcomeId: source.replacedOutcomeId || source.outcomeId || null,
    replacementOutcomeId: source.replacementOutcomeId || null,
    replacedTurnId: source.replacedTurnId || null,
    replacementTurnId: source.replacementTurnId || null,
    idempotencyKey: idempotencyKey || source.idempotencyKey || null,
    acceptedAt: source.acceptedAt || occurredAt || null,
    repairDecision: compactOutcomeRerunRepairDecision(source.repairDecision),
    replacementTextPresent: replacementText ? true : undefined,
    replacementTextHash: replacementText ? hashStableJson({ text: replacementText }) : undefined
  });
}

function assertOutcomeReplacementReplayMatch(existingRef = {}, replacement = {}, transaction = {}) {
  const checks = [
    ['replacedOutcomeId', replacement.replacedOutcomeId || replacement.outcomeId, existingRef.replacedOutcomeId],
    ['replacementOutcomeId', replacement.replacementOutcomeId, existingRef.replacementOutcomeId],
    ['replacedTransactionId', replacement.replacedTransactionId, existingRef.replacedTransactionId],
    ['replacementTransactionId', replacement.replacementTransactionId || transaction.id, existingRef.replacementTransactionId || transaction.id]
  ];
  for (const [field, requestedValue, existingValue] of checks) {
    const requested = typeof requestedValue === 'string' ? requestedValue.trim() : '';
    const existing = typeof existingValue === 'string' ? existingValue.trim() : '';
    if (requested && existing && requested !== existing) {
      const error = new Error(`CORE outcome replacement idempotency replay mismatch for ${field}`);
      error.code = 'DIRECTIVE_CORE_OUTCOME_REPLACEMENT_REPLAY_MISMATCH';
      error.details = { field, requested, existing, transactionId: transaction.id || null };
      throw error;
    }
  }
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function recoveryResolutionMatches(resolution = {}, recovery = {}) {
  const recoveryId = nonEmptyString(recovery.id);
  if (!recoveryId) return false;
  return [
    resolution.id,
    resolution.recoveryId,
    resolution.recoveryCaseId
  ].some((value) => nonEmptyString(value) === recoveryId);
}

function recoveryReplayResolutionFromEvents(events = [], { transactionId, recovery } = {}) {
  const id = nonEmptyString(transactionId);
  if (!id || !recovery?.id) return null;
  for (const event of [...(events || [])].reverse()) {
    if (legacyTransactionId(event) !== id) continue;
    const payload = eventPayload(event);
    if (event.type === 'visibleResponseRecorded' && recoveryResolutionMatches(payload.recoveryResolution || {}, recovery)) {
      const resolution = payload.recoveryResolution || {};
      return {
        id: recovery.id,
        status: 'resolved',
        phase: 'visibleResponsePosted',
        reason: resolution.reason || recovery.reason || null
      };
    }
    if ((event.type === 'latestSourceRestarted' || event.type === 'sourceRestarted') && recoveryResolutionMatches(payload.recoveryResolution || {}, recovery)) {
      const resolution = payload.recoveryResolution || {};
      return {
        id: recovery.id,
        status: 'resolved',
        phase: payload.phaseAfter || 'restartSuperseded',
        reason: resolution.reason || recovery.reason || null
      };
    }
    if (event.type === 'rollbackActuationRecorded') {
      const rollback = payload.rollbackActuationRef || {};
      if (nonEmptyString(rollback.recoveryCaseId) === nonEmptyString(recovery.id)) {
        return {
          id: recovery.id,
          status: 'resolved',
          phase: payload.phaseAfter || 'settled',
          reason: recovery.reason || null
        };
      }
    }
  }
  return null;
}

function compactRollbackActuationRef(value = {}, { transaction = null, idempotencyKey = null, occurredAt = null } = {}) {
  const source = isObject(value) ? value : {};
  const stripRawKeys = (input = {}) => {
    const output = sanitizeDiagnostic(input || {});
    for (const key of Object.keys(output)) {
      if (/^raw/i.test(key) || key === 'replacementText') delete output[key];
    }
    return output;
  };
  const rollbackActuation = stripRawKeys(source.rollbackActuation || {});
  const sourceMutation = sanitizeRecoverySourceMutation(source.sourceMutation || {});
  for (const key of Object.keys(sourceMutation)) {
    if (/^raw/i.test(key)) delete sourceMutation[key];
  }
  return sanitizeDiagnostic(compact({
    kind: 'directive.repairRollbackActuationRecord.v1',
    schemaVersion: 1,
    id: source.id || `rollback:${transaction?.id || source.transactionId || 'transaction'}`,
    transactionId: transaction?.id || source.transactionId || rollbackActuation.transactionId || null,
    recoveryCaseId: source.recoveryCaseId || rollbackActuation.recoveryCaseId || null,
    eventType: source.eventType || rollbackActuation.eventType || sourceMutation.eventType || null,
    sourceFrameId: source.sourceFrameId || sourceMutation.sourceFrameId || transaction?.sourceFrameId || null,
    outcomeId: source.outcomeId || sourceMutation.outcomeId || rollbackActuation.outcomeId || transaction?.outcomeId || null,
    restoreRevision: Number.isFinite(Number(source.restoreRevision ?? rollbackActuation.restoreRevision))
      ? Number(source.restoreRevision ?? rollbackActuation.restoreRevision)
      : null,
    sourceMutation,
    repairDecision: stripRawKeys(source.repairDecision || {}),
    legacyProjection: stripRawKeys(source.legacyProjection || {}),
    rollbackActuation,
    idempotencyKey: idempotencyKey || source.idempotencyKey || null,
    occurredAt: source.occurredAt || occurredAt || null,
    observedAt: source.observedAt || occurredAt || null,
    status: source.status || 'recorded'
  }));
}

function responseRefAuthorizesRecoveryClosure(ref = {}) {
  const decision = ref.repairDecision || {};
  if (decision.kind === 'directive.repairResponseRetryActuationDecision.v1') {
    return decision.authorized === true
      && decision.recoveryResolved === true
      && decision.action === 'recordVisibleResponse'
      && (decision.eventType === 'hostResponsePostFailure' || decision.eventType === 'providerFailureAfterMechanicsCommit')
      && Array.isArray(decision.allowedActions)
      && decision.allowedActions.includes('retryResponse');
  }
  return decision.kind === 'directive.repairResponseReobserveClosureDecision.v1'
    && decision.authorized === true
    && decision.recoveryResolved === true
    && decision.action === 'recordVisibleResponse'
    && (decision.eventType === 'hostNativeGenerationFailed' || decision.eventType === 'hostNativeAssistantUnavailable')
    && Array.isArray(decision.allowedActions)
    && decision.allowedActions.includes('reobserveHostAssistantRows');
}

function numericOrNull(value) {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function compactTurnTiming(value = {}) {
  if (!isObject(value)) return null;
  const normalizedInput = Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null && item !== undefined));
  const computed = createTurnLatencyMetrics(normalizedInput);
  const generationStartLatencyMs = computed.generationStartLatencyMs ?? numericOrNull(value.generationStartLatencyMs);
  const providerCompletionLatencyMs = computed.providerCompletionLatencyMs ?? numericOrNull(value.providerCompletionLatencyMs);
  const architectureWithin60s = computed.architectureWithin60s ?? (
    typeof value.architectureWithin60s === 'boolean' ? value.architectureWithin60s : null
  );
  const timing = compact({
    kind: computed.kind,
    playerSubmittedAt: computed.playerSubmittedAt,
    turnObservedAt: computed.turnObservedAt,
    routeDecidedAt: computed.routeDecidedAt,
    hostGenerationReleasedAt: computed.hostGenerationReleasedAt,
    directiveGenerationStartedAt: computed.directiveGenerationStartedAt,
    visibleResponsePostedAt: computed.visibleResponsePostedAt,
    backgroundSettledAt: computed.backgroundSettledAt,
    generationStartedAt: computed.generationStartedAt,
    generationStartLatencyMs,
    providerCompletionLatencyMs,
    architectureWithin60s,
    externalPromptMayIncludeHostMaterial: typeof value.externalPromptMayIncludeHostMaterial === 'boolean'
      ? value.externalPromptMayIncludeHostMaterial
      : undefined
  });
  const hasProofField = [
    'playerSubmittedAt',
    'turnObservedAt',
    'routeDecidedAt',
    'hostGenerationReleasedAt',
    'directiveGenerationStartedAt',
    'visibleResponsePostedAt',
    'generationStartedAt',
    'generationStartLatencyMs',
    'architectureWithin60s'
  ].some((key) => timing[key] !== null && timing[key] !== undefined);
  return hasProofField ? timing : null;
}

function mergeTiming(base = {}, patch = {}) {
  const next = { ...(isObject(base) ? base : {}) };
  for (const [key, value] of Object.entries(isObject(patch) ? patch : {})) {
    if (value !== undefined && value !== null) next[key] = value;
  }
  return next;
}

function eventRecord({
  id,
  type,
  txnId,
  campaignId,
  saveId,
  chatId,
  sourceFrameId,
  sequence,
  occurredAt,
  idempotencyKey = null,
  payload = null,
  revisionsBefore = null,
  revisionsAfter = null
} = {}) {
  return compact({
    kind: 'directive.coreEvent.v1',
    schemaVersion: 1,
    id,
    txnId,
    campaignId,
    saveId,
    chatId,
    sourceFrameId,
    sequence,
    type,
    occurredAt,
    idempotencyKey,
    revisionsBefore: revisionsBefore ? cloneJson(revisionsBefore) : undefined,
    revisionsAfter: revisionsAfter ? cloneJson(revisionsAfter) : undefined,
    payload: payload ? sanitizeDiagnostic(payload) : undefined
  });
}

function diagnosticRecord({
  id,
  type,
  transaction,
  campaignId,
  saveId,
  chatId,
  observedAt,
  payload,
  revisions
} = {}) {
  const redactedPayload = sanitizeDiagnostic(payload || {});
  return compact({
    kind: 'directive.coreDiagnostic.v1',
    schemaVersion: 1,
    id,
    txnId: transaction.id,
    sourceFrameId: transaction.sourceFrameId,
    diagnosticRevision: revisions?.diagnostic || 0,
    type,
    status: redactedPayload.status || null,
    severity: redactedPayload.severity || null,
    campaignId,
    saveId,
    chatId,
    observedAt,
    redactedPayload,
    sourceHash: hashStableJson(redactedPayload),
    revisions: cloneJson(revisions)
  });
}

function legacyTransactionId(event = {}) {
  return event.txnId || event.transactionId || null;
}

function eventRevisions(event = {}) {
  return event.revisionsAfter || event.revisions || null;
}

function eventPayload(event = {}) {
  return event.payload || {};
}

function diagnosticPayload(entry = {}) {
  return cloneJson(entry.redactedPayload || entry.payload || {});
}

function compactPendingInteractionRef(value = {}, transaction = null, statusOverride = null) {
  const id = String(value.id || value.interactionId || '').trim();
  const txnId = transaction?.id || value.transactionId || value.coreTransactionId || null;
  const ingressId = value.ingressId || transaction?.ingressId || null;
  return compact({
    schemaVersion: 1,
    id: id || undefined,
    kind: value.kind || value.interactionKind || 'decision',
    status: statusOverride || value.status || 'pending',
    ingressId,
    turnId: value.turnId || null,
    outcomeId: value.outcomeId || transaction?.outcomeId || null,
    coreTransactionId: txnId,
    authority: 'corePendingInteractionProjection',
    projectionSource: 'coreStoreV2',
    compatibilityMirror: {
      kind: 'directive.pendingInteractionCompatibilityMirror.v1',
      status: statusOverride || value.status || 'pending',
      interactionId: id || null,
      ingressId,
      turnId: value.turnId || null,
      outcomeId: value.outcomeId || transaction?.outcomeId || null,
      transactionId: txnId,
      projectionSource: 'coreStoreV2'
    },
    coreProjection: {
      kind: 'directive.corePendingInteractionProjectionRef.v1',
      status: statusOverride || value.status || 'pending',
      interactionId: id || null,
      transactionId: txnId,
      ingressId,
      sourceFrameId: transaction?.sourceFrameId || value.sourceFrameId || null
    },
    interactionId: id || undefined,
    sourceFrameId: transaction?.sourceFrameId || value.sourceFrameId || null,
    prompt: value.prompt || null,
    optionCount: Array.isArray(value.options) ? value.options.length : undefined,
    options: Array.isArray(value.options) ? value.options.map((option) => compact({
      id: option.id || option.action || null,
      action: option.action || option.id || null,
      label: option.label || option.action || option.id || null
    })) : undefined,
    resolution: value.resolution ? sanitizeDiagnostic(value.resolution) : undefined,
    createdAt: value.createdAt || value.recordedAt || null,
    resolvedAt: value.resolvedAt || null
  });
}

function buildPendingInteractionProjections(events = [], transactionMap = {}) {
  const rows = new Map();
  for (const event of events || []) {
    if (event.type !== 'pendingInteractionRecorded' && event.type !== 'pendingInteractionResolved') continue;
    const payload = eventPayload(event);
    const transactionId = legacyTransactionId(event) || payload.transactionId || payload.pendingInteraction?.transactionId || null;
    const transaction = transactionId ? transactionMap?.[transactionId] : null;
    if (event.type === 'pendingInteractionRecorded') {
      const row = compactPendingInteractionRef({
        ...(payload.pendingInteraction || {}),
        transactionId,
        recordedAt: event.occurredAt || null
      }, transaction, 'pending');
      if (row.id) rows.set(row.id, row);
      continue;
    }
    const interactionId = String(payload.interactionId || payload.pendingInteraction?.id || '').trim();
    if (!interactionId) continue;
    const prior = rows.get(interactionId) || compactPendingInteractionRef({
      id: interactionId,
      transactionId
    }, transaction, 'pending');
    const status = payload.status || payload.resolution?.status || 'resolved';
    rows.set(interactionId, compact({
      ...prior,
      status,
      compatibilityMirror: prior.compatibilityMirror ? {
        ...cloneJson(prior.compatibilityMirror),
        status
      } : undefined,
      coreProjection: prior.coreProjection ? {
        ...cloneJson(prior.coreProjection),
        status
      } : undefined,
      resolvedAt: payload.resolvedAt || event.occurredAt || null,
      resolution: sanitizeDiagnostic(payload.resolution || {})
    }));
  }
  return [...rows.values()];
}

function turnRecord({
  id,
  transaction,
  operationBundle,
  createdAt,
  revisions
} = {}) {
  const bundle = cloneJson(operationBundle || {});
  return compact({
    kind: 'directive.coreStoreTurnRecord.v1',
    schemaVersion: 1,
    id,
    transactionId: transaction.id,
    turnId: bundle.turnId || transaction.turnId || transaction.id,
    outcomeId: bundle.outcomeId || null,
    campaignId: transaction.campaignId,
    saveId: transaction.saveId,
    chatId: transaction.chatId,
    createdAt,
    operationSummary: bundle.summary || null,
    operationCount: Array.isArray(bundle.operations) ? bundle.operations.length : 0,
    operationHash: hashStableJson(bundle),
    committedRoots: Array.isArray(bundle.committedRoots) ? [...bundle.committedRoots] : [],
    promptDirtyDomains: Array.isArray(bundle.promptDirtyDomains) ? [...bundle.promptDirtyDomains] : [],
    snapshotBeforeRetained: bundle.snapshotBeforeRetained === true || undefined,
    coreCheckpointRef: bundle.coreCheckpointRef ? sanitizeDiagnostic(bundle.coreCheckpointRef) : undefined,
    revisions: cloneJson(revisions)
  });
}

function createInitialState({ campaignId, saveId, branchId, now }) {
  return {
    kind: 'directive.coreStore.v2',
    schemaVersion: 1,
    campaignId,
    saveId,
    branchId,
    createdAt: now,
    updatedAt: now,
    revisions: createRevisions(),
    transactions: {},
    events: [],
    turns: [],
    diagnostics: [],
    hostMapRows: [],
    promptDirtyDomains: [],
    counters: {
      transactions: 0,
      events: 0,
      turns: 0,
      diagnostics: 0,
      backgrounds: 0,
      recoveries: 0
    }
  };
}

function transactionHeadEntry(transaction) {
  return {
    id: transaction.id,
    phase: transaction.phase,
    route: transaction.route || null,
    sourceFrameId: transaction.sourceFrameId,
    chatId: transaction.chatId,
    updatedAt: transaction.updatedAt || transaction.createdAt,
    revisions: cloneJson(transaction.revisions)
  };
}

function buildHead(state) {
  return {
    coreStore: {
      kind: 'directive.coreStoreHead.v2',
      schemaVersion: 1,
      campaignId: state.campaignId,
      saveId: state.saveId,
      branchId: state.branchId,
      updatedAt: state.updatedAt,
      revisions: cloneJson(state.revisions),
      counters: cloneJson(state.counters),
      activeTransactionIds: Object.values(state.transactions)
        .filter((transaction) => !['settled', 'canceled', 'restartSuperseded'].includes(transaction.phase))
        .map((transaction) => transaction.id),
      transactions: Object.fromEntries(Object.values(state.transactions).map((transaction) => [
        transaction.id,
        transactionHeadEntry(transaction)
      ])),
      promptDirtyDomains: [...new Set(state.promptDirtyDomains)]
    }
  };
}

function retargetCoreValueForSaveBranch(value, {
  campaignId = null,
  sourceSaveId = null,
  targetSaveId = null,
  branchId = null,
  sourceChatId = null,
  targetChatId = null
} = {}) {
  if (Array.isArray(value)) {
    return value.map((entry) => retargetCoreValueForSaveBranch(entry, {
      campaignId,
      sourceSaveId,
      targetSaveId,
      branchId,
      sourceChatId,
      targetChatId
    }));
  }
  if (!value || typeof value !== 'object') return cloneJson(value);
  const next = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'campaignId' && campaignId) {
      next[key] = campaignId;
    } else if (key === 'saveId' && targetSaveId && (!sourceSaveId || String(entry || '').trim() === sourceSaveId)) {
      next[key] = targetSaveId;
    } else if (key === 'branchId' && branchId) {
      next[key] = branchId;
    } else if ((key === 'chatId' || key === 'currentChatId' || key === 'chat_id') && targetChatId && String(entry || '').trim() === String(sourceChatId || '').trim()) {
      next[key] = targetChatId;
    } else {
      next[key] = retargetCoreValueForSaveBranch(entry, {
        campaignId,
        sourceSaveId,
        targetSaveId,
        branchId,
        sourceChatId,
        targetChatId
      });
    }
  }
  return next;
}

function compactCheckpointRef(value = null) {
  if (!value || typeof value !== 'object') return null;
  const checkpointId = String(value.checkpointId || value.id || '').trim();
  if (!checkpointId) return null;
  return {
    checkpointId,
    layout: String(value.layout || 'core').trim() || 'core'
  };
}

async function branchCheckpointArtifacts(adapter, sourceState, options = {}) {
  const refs = new Map();
  for (const turn of sourceState.turns || []) {
    const ref = compactCheckpointRef(turn?.coreCheckpointRef);
    if (ref) refs.set(ref.checkpointId, ref);
  }
  const checkpoints = [];
  for (const ref of refs.values()) {
    try {
      const record = await loadV2Checkpoint(adapter, {
        campaignId: sourceState.campaignId,
        saveId: sourceState.saveId,
        checkpointId: ref.checkpointId,
        layout: ref.layout || 'core'
      });
      checkpoints.push({
        ...retargetCoreValueForSaveBranch(record.checkpoint || {}, options),
        checkpointId: ref.checkpointId
      });
    } catch {
      // Missing source checkpoint artifacts remain fail-closed after branching.
    }
  }
  return checkpoints;
}

function buildHostMap(state) {
  return {
    excludesRawChatText: true,
    rows: state.hostMapRows.map(cloneJson)
  };
}

function buildPromptCache(state) {
  return {
    directiveOwnedRevision: state.revisions.prompt,
    dirtyDomains: [...new Set(state.promptDirtyDomains)],
    blocks: []
  };
}

function buildPersistPayload(state) {
  return {
    campaignId: state.campaignId,
    saveId: state.saveId,
    branchId: state.branchId,
    head: buildHead(state),
    hostMap: buildHostMap(state),
    promptCache: buildPromptCache(state),
    eventSegments: [state.events],
    turnSegments: [state.turns],
    diagnosticsSegments: [state.diagnostics],
    checkpoints: [],
    now: state.updatedAt,
    metadata: {
      source: 'core-store-v2',
      eventCount: state.events.length,
      turnCount: state.turns.length,
      diagnosticCount: state.diagnostics.length
    }
  };
}

function projectionStatusForPhase(phase) {
  if (phase === 'responseRetryRequired') return 'responseRetryRequired';
  if (phase === 'recoveryRequired') return 'recoveryRequired';
  if (phase === 'restartSuperseded') return 'restartSuperseded';
  if (phase === 'canceled') return 'canceled';
  if (phase === 'settled') return 'settled';
  if (phase === 'backgroundSettling') return 'complete';
  if (phase === 'visibleResponsePosted') return 'complete';
  if (phase === 'hostContinueReleased') return 'hostContinueReleased';
  return 'pending';
}

function buildTurnTimingProjections(events = [], transactionMap = {}) {
  const timingByTransaction = new Map();
  const eventIdsByTransaction = new Map();
  const responseRefByTransaction = new Map();

  for (const event of events || []) {
    const txnId = legacyTransactionId(event);
    if (!txnId) continue;
    const payload = eventPayload(event);
    const prior = timingByTransaction.get(txnId) || {};
    if (event.type === 'phaseAdvanced') {
      timingByTransaction.set(txnId, mergeTiming(prior, {
        ...(payload.timing || {}),
        directivePromptRevisionUsed: payload.directivePromptRevisionUsed ?? prior.directivePromptRevisionUsed ?? null
      }));
      eventIdsByTransaction.set(txnId, [
        ...(eventIdsByTransaction.get(txnId) || []),
        event.id
      ]);
    }
    if (event.type === 'visibleResponseRecorded') {
      const responseRef = payload.responseRef || {};
      responseRefByTransaction.set(txnId, responseRef);
      const responseTiming = mergeTiming(responseRef.turnLatency || {}, {
        hostGenerationReleasedAt: responseRef.hostGenerationReleasedAt,
        directiveGenerationStartedAt: responseRef.directiveGenerationStartedAt,
        visibleResponsePostedAt: responseRef.postedAt || event.occurredAt,
        generationStartedAt: responseRef.generationStartedAt
      });
      timingByTransaction.set(txnId, mergeTiming(prior, responseTiming));
      eventIdsByTransaction.set(txnId, [
        ...(eventIdsByTransaction.get(txnId) || []),
        event.id
      ]);
    }
    if (event.type === 'visibleResponseRefRepaired') {
      const responseRef = responseRefByTransaction.get(txnId) || {};
      responseRefByTransaction.set(txnId, {
        ...responseRef,
        ...(payload.responseRefPatch || {})
      });
      eventIdsByTransaction.set(txnId, [
        ...(eventIdsByTransaction.get(txnId) || []),
        event.id
      ]);
    }
  }

  return [...timingByTransaction.entries()]
    .map(([transactionId, rawTiming]) => {
      const turnTiming = compactTurnTiming(rawTiming);
      if (!turnTiming) return null;
      const transaction = transactionMap?.[transactionId] || {};
      const responseRef = responseRefByTransaction.get(transactionId) || {};
      return compact({
        id: `turn-timing:${transactionId}`,
        transactionId,
        sourceFrameId: transaction.sourceFrameId || null,
        hostMessageId: transaction.sourceFrame?.hostMessageId || null,
        responseHostMessageId: responseRef.hostMessageId || null,
        chatId: transaction.chatId || null,
        route: transaction.route || null,
        status: projectionStatusForPhase(transaction.phase),
        responseKind: responseRef.kind || responseRef.responseKind || null,
        directivePromptRevisionUsed: rawTiming.directivePromptRevisionUsed ?? null,
        eventIds: eventIdsByTransaction.get(transactionId) || [],
        turnTiming
      });
    })
    .filter(Boolean);
}

function buildActiveRecoveryProjectionByTransaction(events = []) {
  const byTransaction = new Map();
  for (const event of events || []) {
    if (event?.type !== 'recoveryRequired') continue;
    const transactionId = legacyTransactionId(event);
    if (!transactionId) continue;
    const payload = eventPayload(event);
    const recoveryCase = payload.recoveryCase || {};
    byTransaction.set(transactionId, compact({
      recoveryId: recoveryCase.id || null,
      recoveryStatus: recoveryCase.status || null,
      recoveryReason: recoveryCase.reason || null,
      recoveryPhase: payload.phaseAfter || recoveryCase.phase || null,
      allowedActions: Array.isArray(payload.allowedActions) ? [...payload.allowedActions] : undefined
    }));
  }
  return byTransaction;
}

function buildContinuityRecoveryProjection(events = []) {
  const rejectedById = new Map();
  const hintsById = new Map();
  const factUseStats = {};
  for (const event of events || []) {
    if (event?.type !== 'recoveryRequired') continue;
    const projection = compactContinuityRecoveryProjection(eventPayload(event).continuityProjection || {});
    for (const claim of projection.rejectedClaims || []) {
      rejectedById.set(claim.id, claim);
    }
    for (const hint of projection.projectionHints || []) {
      hintsById.set(hint.id, hint);
    }
    for (const [factId, stats] of Object.entries(projection.factUseStats || {})) {
      factUseStats[factId] = stats;
    }
  }
  return {
    rejectedClaims: [...rejectedById.values()],
    projectionHints: [...hintsById.values()],
    factUseStats
  };
}

function reconstructTransactionsFromEvents(events = []) {
  const transactions = {};
  for (const event of events || []) {
    const txnId = legacyTransactionId(event);
    if (!txnId) continue;
    const payload = eventPayload(event);
    const transaction = transactions[txnId] || {
      id: txnId,
      sourceFrameId: event.sourceFrameId || null,
      chatId: event.chatId || null,
      campaignId: event.campaignId || null,
      saveId: event.saveId || null,
      createdAt: event.occurredAt || null,
      updatedAt: event.occurredAt || null,
      phase: 'observed',
      route: null,
      outcomeId: null,
      visibleResponseRef: null,
      recoveryCaseId: null,
      revisions: eventRevisions(event),
      sourceFrame: null,
      ingressId: `ingress:${txnId}`,
      phaseAdvanceIdempotencyKeys: []
    };
    if (event.type === 'turnObserved') {
      transaction.phase = 'observed';
      transaction.sourceFrame = cloneJson(payload.sourceFrameRef || payload.sourceFrame || {});
      transaction.sourceFrameId = event.sourceFrameId || transaction.sourceFrame?.id || transaction.sourceFrameId;
      transaction.chatId = event.chatId || transaction.sourceFrame?.chatId || transaction.chatId;
      transaction.ingressId = payload.ingressId || transaction.ingressId;
      transaction.beginIdempotencyKey = event.idempotencyKey || transaction.beginIdempotencyKey || null;
      transaction.sourceRestart = payload.sourceRestart ? cloneJson(payload.sourceRestart) : transaction.sourceRestart || null;
      transaction.restartedFromTransactionId = payload.sourceRestart?.priorTransactionId || transaction.restartedFromTransactionId || null;
      transaction.restartedFromIngressId = payload.sourceRestart?.priorIngressId || transaction.restartedFromIngressId || null;
    }
    if (event.type === 'phaseAdvanced') {
      transaction.phase = payload.toPhase || payload.phasePatch?.phase || transaction.phase;
      transaction.route = payload.route === undefined ? transaction.route : payload.route;
      if (event.idempotencyKey) {
        transaction.phaseAdvanceIdempotencyKeys = [
          ...new Set([...(transaction.phaseAdvanceIdempotencyKeys || []), event.idempotencyKey])
        ];
      }
    }
    if (event.type === 'sourceRestarted' || event.type === 'latestSourceRestarted') {
      const restart = payload.sourceRestart || {};
      transaction.phase = payload.phaseAfter || restart.phaseAfter || 'restartSuperseded';
      transaction.sourceRestart = cloneJson(restart);
      transaction.restartedByTransactionId = restart.newTransactionId || transaction.restartedByTransactionId || null;
      transaction.restartedByIngressId = restart.newIngressId || transaction.restartedByIngressId || null;
      transaction.restartedBySourceFrameId = restart.newSourceFrameId || transaction.restartedBySourceFrameId || null;
      transaction.restartReason = restart.reason || transaction.restartReason || null;
      transaction.sourceRestartIdempotencyKey = event.idempotencyKey || transaction.sourceRestartIdempotencyKey || null;
      if (payload.recoveryResolution) {
        transaction.recoveryCaseId = null;
        transaction.recoveryReason = null;
      }
      if (restart.newTransactionId) {
        const replacement = transactions[restart.newTransactionId] || {
          id: restart.newTransactionId,
          sourceFrameId: restart.newSourceFrameId || null,
          chatId: transaction.chatId || null,
          campaignId: transaction.campaignId || null,
          saveId: transaction.saveId || null,
          createdAt: event.occurredAt || null,
          updatedAt: event.occurredAt || null,
          phase: 'observed',
          route: null,
          outcomeId: null,
          visibleResponseRef: null,
          recoveryCaseId: null,
          revisions: eventRevisions(event),
          sourceFrame: null,
          ingressId: restart.newIngressId || `ingress:${restart.newTransactionId}`,
          phaseAdvanceIdempotencyKeys: []
        };
        replacement.sourceRestart = cloneJson(restart);
        replacement.restartedFromTransactionId = restart.priorTransactionId || transaction.id || null;
        replacement.restartedFromIngressId = restart.priorIngressId || null;
        replacement.updatedAt = event.occurredAt || replacement.updatedAt || replacement.createdAt;
        transactions[restart.newTransactionId] = replacement;
      }
    }
    if (event.type === 'mechanicsCommitted') {
      transaction.turnId = payload.turnRef?.turnId || transaction.turnId || null;
      transaction.outcomeId = payload.turnRef?.outcomeId || payload.outcomeId || transaction.outcomeId || null;
      transaction.phase = payload.phaseAfter || transaction.phase;
      transaction.mechanicsIdempotencyKey = event.idempotencyKey || transaction.mechanicsIdempotencyKey || null;
    }
    if (event.type === 'visibleResponseRecorded') {
      transaction.phase = 'visibleResponsePosted';
      transaction.visibleResponseRef = cloneJson(payload.responseRef || {});
      transaction.outcomeId = transaction.visibleResponseRef?.outcomeId || transaction.outcomeId || null;
      transaction.visibleResponseIdempotencyKey = event.idempotencyKey || transaction.visibleResponseIdempotencyKey || null;
      if (payload.recoveryResolution) {
        transaction.recoveryCaseId = null;
        transaction.recoveryReason = null;
      }
    }
    if (event.type === 'visibleResponseRefRepaired') {
      transaction.visibleResponseRef = compact({
        ...(transaction.visibleResponseRef || {}),
        ...(payload.responseRefPatch || {})
      });
      transaction.phase = transaction.visibleResponseRef ? 'visibleResponsePosted' : transaction.phase;
    }
    if (event.type === 'outcomeReplacementRecorded') {
      const replacementRef = payload.outcomeReplacementRef || {};
      transaction.outcomeReplacements = [
        ...(transaction.outcomeReplacements || []),
        cloneJson(replacementRef)
      ];
      transaction.outcomeReplacementIdempotencyKeys = uniqueStrings([
        ...(transaction.outcomeReplacementIdempotencyKeys || []),
        event.idempotencyKey
      ]);
    }
    if (event.type === 'backgroundBatchCommitted') {
      const bundle = payload.operationBundle || {};
      const batchId = bundle.batchId || `background:${transaction.id}`;
      const backgroundRef = backgroundBatchRefFromBundle({ ...bundle, batchId }, {
        idempotencyKey: event.idempotencyKey || null,
        occurredAt: event.occurredAt || null
      });
      transaction.phase = payload.phaseAfter || bundle.phaseAfter || 'backgroundSettling';
      transaction.backgroundBatchId = transaction.backgroundBatchId || batchId;
      transaction.backgroundBatchIds = uniqueStrings([
        ...(transaction.backgroundBatchIds || []),
        batchId
      ]);
      transaction.backgroundBatches = [
        ...(transaction.backgroundBatches || []),
        backgroundRef
      ];
      transaction.backgroundIdempotencyKey = event.idempotencyKey || transaction.backgroundIdempotencyKey || null;
      transaction.backgroundIdempotencyKeys = uniqueStrings([
        ...(transaction.backgroundIdempotencyKeys || []),
        event.idempotencyKey
      ]);
    }
    if (event.type === 'recoveryRequired') {
      transaction.phase = payload.phaseAfter || payload.recoveryCase?.phase || 'recoveryRequired';
      transaction.recoveryCaseId = payload.recoveryCase?.id || null;
      transaction.recoveryReason = payload.recoveryCase?.reason || null;
      transaction.recoveryIdempotencyKey = event.idempotencyKey || transaction.recoveryIdempotencyKey || null;
    }
    if (event.type === 'rollbackActuationRecorded') {
      const rollback = payload.rollbackActuationRef || {};
      transaction.phase = payload.phaseAfter || 'settled';
      transaction.recoveryCaseId = null;
      transaction.recoveryReason = null;
      transaction.rollbackActuations = [
        ...(transaction.rollbackActuations || []),
        cloneJson(rollback)
      ];
      transaction.rollbackActuationIdempotencyKeys = uniqueStrings([
        ...(transaction.rollbackActuationIdempotencyKeys || []),
        event.idempotencyKey
      ]);
    }
    transaction.revisions = eventRevisions(event) || transaction.revisions;
    transaction.updatedAt = event.occurredAt || transaction.updatedAt || transaction.createdAt;
    transactions[txnId] = transaction;
  }
  return transactions;
}

export function buildCoreStoreReadProjections(state = {}) {
  const transactionMap = Object.keys(state.transactions || {}).length > 0
    ? state.transactions
    : reconstructTransactionsFromEvents(state.events || []);
  const transactions = Object.values(transactionMap || {});
  const hostMapRows = mergeHostMapRows(
    Array.isArray(state.hostMapRows) ? state.hostMapRows.map(cloneJson) : [],
    deriveHostMapRowsFromEvents(state.events || [])
  );
  const responseEvents = (state.events || []).filter((event) => event.type === 'visibleResponseRecorded');
  const visibleResponseTransactionIds = new Set(responseEvents.map(legacyTransactionId).filter(Boolean));
  const visibleResponseRepairsByTransaction = new Map();
  for (const event of state.events || []) {
    if (event?.type !== 'visibleResponseRefRepaired') continue;
    const transactionId = legacyTransactionId(event);
    if (!transactionId) continue;
    visibleResponseRepairsByTransaction.set(transactionId, {
      ...(visibleResponseRepairsByTransaction.get(transactionId) || {}),
      ...(eventPayload(event).responseRefPatch || {})
    });
  }
  const recoveryEvents = (state.events || []).filter((event) => event.type === 'recoveryRequired');
  const responseRecoveryEvents = recoveryEvents.filter((event) => {
    const payload = eventPayload(event);
    const decision = payload.repairDecision || {};
    return Boolean(
      decision.responseStatus
      || decision.recoveryType
      || [
        'hostResponsePostFailure',
        'providerFailureAfterMechanicsCommit',
        'hostNativeGenerationUnavailable',
        'hostNativeGenerationFailed',
        'hostNativeContinuityContradiction'
      ].includes(decision.eventType)
    );
  });
  const responseRecoveryTransactionIds = new Set(responseRecoveryEvents.map(legacyTransactionId).filter(Boolean));
  const activeRecoveryByTransaction = buildActiveRecoveryProjectionByTransaction(recoveryEvents);
  const continuityRecoveryProjection = buildContinuityRecoveryProjection(recoveryEvents);
  const responseRecoveryResolutionEvents = (state.events || []).filter((event) => (
    event.type === 'visibleResponseRecorded'
    && Boolean(eventPayload(event).recoveryResolution)
  ));
  const restartRecoveryEvents = (state.events || []).filter((event) => {
    if (event.type !== 'latestSourceRestarted' && event.type !== 'sourceRestarted') return false;
    return Boolean(eventPayload(event).recoveryResolution);
  });
  const rollbackEvents = (state.events || []).filter((event) => event.type === 'rollbackActuationRecorded');
  const backgroundEvents = (state.events || []).filter((event) => event.type === 'backgroundBatchCommitted');
  const outcomeReplacementEvents = (state.events || []).filter((event) => event.type === 'outcomeReplacementRecorded');
  const backgroundEffectRefs = backgroundEffectRefsFromEvents(backgroundEvents);
  const sceneSealRefs = sceneSealRefsFromEffectRefs(backgroundEffectRefs);
  const pressureArcDigestRefs = pressureArcDigestRefsFromEffectRefs(backgroundEffectRefs);
  const recallEntryRefs = recallEntryRefsFromEffectRefs(backgroundEffectRefs);
  const backgroundBatches = backgroundEvents.map((event) => compact({
    id: event.id,
    transactionId: legacyTransactionId(event),
    sourceFrameId: event.sourceFrameId || null,
    ...backgroundBatchRefFromBundle(eventPayload(event).operationBundle || {}, {
      idempotencyKey: event.idempotencyKey || null,
      occurredAt: event.occurredAt || null
    })
  }));
  const commandBearingEvidence = commandBearingEvidenceFromEffectRefs(backgroundEffectRefs, backgroundBatches);
  const commandBearingReviewClosures = commandBearingReviewClosuresFromEffectRefs(backgroundEffectRefs, backgroundBatches);
  const diagnostics = state.diagnostics || [];
  const turnTiming = buildTurnTimingProjections(state.events || [], transactionMap);
  const pendingInteractions = buildPendingInteractionProjections(state.events || [], transactionMap);
  return {
    kind: 'directive.coreStoreReadProjections.v1',
    schemaVersion: 1,
    hostMapRows,
    hostMap: {
      rows: hostMapRows.map(cloneJson)
    },
    ingressLedger: transactions.map((transaction) => {
      const recovery = transaction.recoveryCaseId
        ? (activeRecoveryByTransaction.get(transaction.id) || {})
        : {};
      return compact({
        id: transaction.ingressId || `ingress:${transaction.id}`,
        transactionId: transaction.id,
        sourceFrameId: transaction.sourceFrameId,
        hostMessageId: transaction.sourceFrame?.hostMessageId || null,
        chatId: transaction.chatId,
        textHash: transaction.sourceFrame?.textHash || null,
        status: projectionStatusForPhase(transaction.phase),
        route: transaction.route || null,
        outcomeId: transaction.outcomeId || null,
        recoveryId: recovery.recoveryId || transaction.recoveryCaseId || null,
        recoveryStatus: recovery.recoveryStatus || (transaction.recoveryCaseId ? 'required' : null),
        recoveryReason: recovery.recoveryReason || transaction.recoveryReason || null,
        recoveryPhase: recovery.recoveryPhase || (transaction.recoveryCaseId ? transaction.phase : null),
        allowedActions: recovery.allowedActions,
        sourceRestart: transaction.sourceRestart ? cloneJson(transaction.sourceRestart) : undefined,
        restartedByTransactionId: transaction.restartedByTransactionId || null,
        restartedFromTransactionId: transaction.restartedFromTransactionId || null
      });
    }),
    responseLedger: (state.events || [])
      .filter((event) => (
        event.type === 'visibleResponseRecorded'
        || (
          event.type === 'phaseAdvanced'
          && eventPayload(event).toPhase === 'hostContinueReleased'
          && !visibleResponseTransactionIds.has(legacyTransactionId(event))
          && !responseRecoveryTransactionIds.has(legacyTransactionId(event))
        )
        || (
          event.type === 'recoveryRequired'
          && responseRecoveryTransactionIds.has(legacyTransactionId(event))
          && !visibleResponseTransactionIds.has(legacyTransactionId(event))
        )
      ))
      .map((event) => {
        const transactionId = legacyTransactionId(event);
        if (event.type === 'phaseAdvanced') {
          const payload = eventPayload(event);
          const timing = compactTurnTiming(payload.timing || {});
          return compact({
            id: payload.responseId || `response-release:${transactionId}`,
            responseId: payload.responseId || null,
            transactionId,
            hostMessageId: null,
            outcomeId: payload.outcomeId || transactionMap?.[transactionId]?.outcomeId || null,
            responseKind: payload.responseKind || 'hostContinue',
            generationStartedAt: timing?.hostGenerationReleasedAt || event.occurredAt || null,
            textHash: null,
            turnTiming: timing || undefined,
            status: 'hostContinueReleased'
          });
        }
        if (event.type === 'recoveryRequired') {
          const payload = eventPayload(event);
          const decision = payload.repairDecision || {};
          const phase = payload.phaseAfter || payload.recoveryCase?.phase || decision.responseStatus || 'recoveryRequired';
          return compact({
            id: payload.dependentResponseId || `response-recovery:${transactionId}:${payload.recoveryCase?.id || event.id}`,
            transactionId,
            hostMessageId: decision.hostMessageId || null,
            outcomeId: payload.dependentOutcomeId || transactionMap?.[transactionId]?.outcomeId || null,
            responseKind: decision.responseKind || (
              decision.eventType && String(decision.eventType).startsWith('hostNative')
                ? 'hostContinue'
                : null
            ),
            generationStartedAt: null,
            textHash: null,
            recoveryId: payload.recoveryCase?.id || null,
            repairDecision: sanitizeDiagnostic(decision),
            status: phase
          });
        }
        const responseRef = {
          ...(eventPayload(event).responseRef || {}),
          ...(visibleResponseRepairsByTransaction.get(transactionId) || {})
        };
        const timingProjection = turnTiming.find((entry) => entry.transactionId === transactionId) || null;
        const responseTurnTiming = responseRef.turnLatency
          ? cloneJson(responseRef.turnLatency)
          : cloneJson(timingProjection?.turnTiming || null);
        return compact({
          id: responseRef.responseId || `response:${transactionId}`,
          transactionId,
          hostMessageId: responseRef.hostMessageId || null,
          outcomeId: responseRef.outcomeId || null,
          responseKind: responseRef.kind || responseRef.responseKind || null,
          generationStartedAt: responseRef.generationStartedAt
            || responseTurnTiming?.generationStartedAt
            || responseTurnTiming?.directiveGenerationStartedAt
            || null,
          textHash: responseRef.textHash || null,
          turnTiming: responseTurnTiming || undefined,
          outcomeIntegrity: compactOutcomeIntegrityEvidence(responseRef.outcomeIntegrity),
          status: 'posted'
        });
      }),
    turnTiming,
    turnLedger: {
      entries: (state.turns || []).map((turn) => compact({
        id: turn.id,
        transactionId: turn.transactionId,
        turnId: turn.turnId,
        outcomeId: turn.outcomeId,
        status: 'committed',
        operationHash: turn.operationHash,
        operationSummary: turn.operationSummary,
        committedRoots: turn.committedRoots,
        snapshotBeforeRetained: turn.snapshotBeforeRetained === true || undefined,
        coreCheckpointRef: turn.coreCheckpointRef ? cloneJson(turn.coreCheckpointRef) : undefined,
        revisions: cloneJson(turn.revisions)
      })),
      lastCommittedOutcomeId: [...(state.turns || [])].reverse().find((turn) => turn.outcomeId)?.outcomeId || null,
      replacementHistory: outcomeReplacementEvents.map((event) => compact({
        ...(eventPayload(event).outcomeReplacementRef || {}),
        transactionId: legacyTransactionId(event),
        eventId: event.id,
        occurredAt: event.occurredAt || null
      })),
      lastReplacedOutcomeId: [...outcomeReplacementEvents].reverse()
        .map((event) => eventPayload(event).outcomeReplacementRef?.replacedOutcomeId)
        .find(Boolean) || null
    },
    recoveryJournal: [
      ...recoveryEvents.map((event) => {
        const payload = eventPayload(event);
        const transactionId = legacyTransactionId(event);
        return compact({
          id: payload.recoveryCase?.id || `recovery:${transactionId}`,
          transactionId,
          status: payload.recoveryCase?.status || 'required',
          phase: payload.phaseAfter || payload.recoveryCase?.phase || null,
          reason: payload.recoveryCase?.reason || null,
          sourceFrameId: transactionMap?.[transactionId]?.sourceFrameId || event.sourceFrameId || null,
          sourceMutation: cloneJson(payload.sourceMutation || null),
          recallAuxiliaryRefs: Array.isArray(payload.recallAuxiliaryRefs) ? payload.recallAuxiliaryRefs.map(cloneJson) : undefined,
          recallAuxiliaryRewrite: payload.recallAuxiliaryRewrite ? cloneJson(payload.recallAuxiliaryRewrite) : undefined,
          repairDecision: cloneJson(payload.repairDecision || null),
          responseRetryPlan: cloneJson(payload.responseRetryPlan || null),
          dependentOutcomeId: payload.dependentOutcomeId || null,
          dependentResponseId: payload.dependentResponseId || null,
          allowedActions: Array.isArray(payload.allowedActions) ? [...payload.allowedActions] : []
        });
      }),
      ...responseRecoveryResolutionEvents.map((event) => {
        const payload = eventPayload(event);
        const transactionId = legacyTransactionId(event);
        const resolution = payload.recoveryResolution || {};
        return compact({
          id: resolution.id || resolution.recoveryId || `recovery:${transactionId}:response-reobserve`,
          transactionId,
          status: resolution.status || 'resolved',
          phase: 'visibleResponsePosted',
          reason: resolution.reason || 'host-native-response-reobserved',
          sourceFrameId: transactionMap?.[transactionId]?.sourceFrameId || event.sourceFrameId || null,
          repairDecision: cloneJson(resolution.repairDecision || payload.responseRef?.repairDecision || null),
          dependentOutcomeId: payload.responseRef?.outcomeId || null,
          dependentResponseId: payload.responseRef?.responseId || null,
          hostMessageId: payload.responseRef?.hostMessageId || null,
          textHash: payload.responseRef?.textHash || null
        });
      }),
      ...restartRecoveryEvents.map((event) => {
        const payload = eventPayload(event);
        const transactionId = legacyTransactionId(event);
        const restart = payload.sourceRestart || payload.restartRef || {};
        const resolution = payload.recoveryResolution || {};
        return compact({
          id: resolution.id || restart.recoveryId || `recovery:${transactionId}:restart`,
          transactionId,
          status: resolution.status || 'resolved',
          phase: payload.phaseAfter || 'restartSuperseded',
          reason: resolution.reason || restart.reason || 'latest-source-reobserved',
          sourceFrameId: transactionMap?.[transactionId]?.sourceFrameId || event.sourceFrameId || null,
          sourceMutation: cloneJson(payload.sourceMutation || null),
          repairDecision: cloneJson(payload.repairDecision || null),
          replacementTransactionId: resolution.replacementTransactionId || restart.newTransactionId || null,
          replacementIngressId: resolution.replacementIngressId || restart.newIngressId || null,
          replacementSourceFrameId: resolution.replacementSourceFrameId || restart.newSourceFrameId || null
        });
      }),
      ...rollbackEvents.map((event) => {
        const payload = eventPayload(event);
        const transactionId = legacyTransactionId(event);
        const rollback = payload.rollbackActuationRef || {};
        return compact({
          id: rollback.recoveryCaseId || `recovery:${transactionId}:rollback`,
          transactionId,
          status: 'resolved',
          phase: payload.phaseAfter || 'settled',
          reason: 'rollback-actuated',
          sourceFrameId: rollback.sourceFrameId || transactionMap?.[transactionId]?.sourceFrameId || event.sourceFrameId || null,
          sourceMutation: cloneJson(rollback.sourceMutation || null),
          repairDecision: cloneJson(rollback.repairDecision || null),
          rollbackActuation: cloneJson(rollback.rollbackActuation || null),
          restoreRevision: rollback.restoreRevision ?? null,
          dependentOutcomeId: rollback.outcomeId || null
        });
      })
    ],
    pendingInteractions,
    continuityRecoveryProjection,
    rollbackActuations: rollbackEvents.map((event) => {
      const payload = eventPayload(event);
      return compact({
        ...(payload.rollbackActuationRef || {}),
        transactionId: legacyTransactionId(event),
        eventId: event.id,
        occurredAt: event.occurredAt || payload.rollbackActuationRef?.occurredAt || null
      });
    }),
    modelCallDiagnostics: diagnostics
      .filter((entry) => entry.type === 'modelCall')
      .map(diagnosticPayload),
    sidecarDiagnostics: [
      ...diagnostics
        .filter((entry) => entry.type === 'sidecar')
        .map(diagnosticPayload),
      ...backgroundEvents.flatMap((event) => Array.isArray(eventPayload(event).operationBundle?.workers)
        ? eventPayload(event).operationBundle.workers.map((worker) => cloneJson(worker))
        : [])
    ],
    backgroundBatches,
    backgroundEffectRefs,
    commandBearingEvidence,
    commandBearingReviewClosures,
    sceneSealRefs,
    sceneSealRevision: sceneSealRevisionFromRefs(sceneSealRefs),
    pressureArcDigestRefs,
    pressureArcDigestRevision: pressureArcDigestRevisionFromRefs(pressureArcDigestRefs),
    recallIndex: {
      revision: recallRevisionFromEntryRefs(recallEntryRefs),
      entryRefs: recallEntryRefs,
      auxiliaryRefs: recallAuxiliaryRefsFromEvents(state.events || [])
    }
  };
}

async function readSegmentEntries(adapter, refs = []) {
  const entries = [];
  for (const ref of refs || []) {
    const segment = await readV2ArtifactRef(adapter, ref);
    if (Array.isArray(segment.entries)) entries.push(...segment.entries.map(cloneJson));
  }
  return entries;
}

function uniqueStrings(values = []) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function hostMapRowKey(row = {}) {
  const role = row.role || 'unknown';
  const transactionId = row.transactionId || '';
  if (transactionId) return `${role}|${transactionId}`;
  return [
    role,
    row.hostMessageId || '',
    row.sourceFrameId || '',
    row.outcomeId || ''
  ].join('|');
}

function mergeHostMapRows(...groups) {
  const rows = new Map();
  for (const group of groups) {
    for (const row of group || []) {
      if (!isObject(row)) continue;
      const cleanRow = compact(cloneJson(row));
      const key = hostMapRowKey(cleanRow);
      rows.set(key, compact({
        ...(rows.get(key) || {}),
        ...cleanRow
      }));
    }
  }
  return [...rows.values()];
}

function deriveHostMapRowsFromEvents(events = []) {
  const rows = [];
  for (const event of events || []) {
    const transactionId = legacyTransactionId(event);
    if (!transactionId) continue;
    const payload = eventPayload(event);
    if (event.type === 'turnObserved') {
      const sourceRef = payload.sourceFrameRef || payload.sourceFrame || {};
      rows.push(compact({
        hostMessageId: sourceRef.hostMessageId || null,
        role: 'player',
        transactionId,
        sourceFrameId: event.sourceFrameId || sourceRef.id || null,
        chatId: event.chatId || sourceRef.chatId || null,
        textHash: sourceRef.textHash || null,
        visibility: sourceRef.visibility || null
      }));
    }
    if (event.type === 'visibleResponseRecorded') {
      const ref = payload.responseRef || {};
      rows.push(compact({
        hostMessageId: ref.hostMessageId || null,
        role: 'assistant',
        transactionId,
        outcomeId: ref.outcomeId || null,
        chatId: event.chatId || null,
        responseKind: ref.kind || ref.responseKind || null,
        textHash: ref.textHash || null
      }));
    }
    if (event.type === 'visibleResponseRefRepaired') {
      const patch = payload.responseRefPatch || {};
      rows.push(compact({
        hostMessageId: patch.hostMessageId || null,
        role: 'assistant',
        transactionId,
        textHash: patch.textHash || null
      }));
    }
    if (event.type === 'latestSourceRestarted' || event.type === 'sourceRestarted') {
      const restart = payload.sourceRestart || payload.restartRef || {};
      const resolution = payload.recoveryResolution || {};
      rows.push(compact({
        role: 'player',
        transactionId,
        status: payload.phaseAfter || restart.phaseAfter || 'restartSuperseded',
        sourceRestart: restart,
        replacementTransactionId: resolution.replacementTransactionId || restart.newTransactionId || null,
        replacementSourceFrameId: resolution.replacementSourceFrameId || restart.newSourceFrameId || null,
        replacementIngressId: resolution.replacementIngressId || restart.newIngressId || null
      }));
    }
  }
  return mergeHostMapRows(rows);
}

function derivePromptDirtyDomainsFromEvents(events = []) {
  return uniqueStrings((events || []).flatMap((event) => {
    if (event?.type !== 'backgroundBatchCommitted') return [];
    const bundle = eventPayload(event).operationBundle || {};
    return [
      ...(Array.isArray(bundle.dirtyDomains) ? bundle.dirtyDomains : []),
      ...(Array.isArray(bundle.promptDirtyDomains) ? bundle.promptDirtyDomains : [])
    ];
  }));
}

function backgroundEffectRefsFromEvents(events = []) {
  return (events || []).flatMap((event) => {
    if (event?.type !== 'backgroundBatchCommitted') return [];
    const transactionId = legacyTransactionId(event);
    const bundle = eventPayload(event).operationBundle || {};
    const refs = Array.isArray(bundle.backgroundEffectRefs)
      ? bundle.backgroundEffectRefs
      : [
        ...(Array.isArray(bundle.scenePhaseSealRefs) ? bundle.scenePhaseSealRefs : []),
        ...(Array.isArray(bundle.pressureArcDigestRefs) ? bundle.pressureArcDigestRefs : []),
        ...(Array.isArray(bundle.recallEntryRefs) ? bundle.recallEntryRefs : []),
        ...(Array.isArray(bundle.effectRefs) ? bundle.effectRefs : [])
      ];
    return refs.map((ref) => compact({
      ...cloneJson(ref),
      transactionId: ref.transactionId || transactionId || null,
      backgroundBatchId: bundle.batchId || null,
      sourceFrameId: ref.sourceFrameId || event.sourceFrameId || bundle.sourceFrameRef?.id || null,
      occurredAt: event.occurredAt || null
    }));
  });
}

function sceneSealRefsFromEffectRefs(effectRefs = []) {
  return effectRefs
    .filter((ref) => String(ref.kind || ref.type || '').includes('scenePhaseSealRef'))
    .map((ref) => sanitizeDiagnostic(ref));
}

function recallEntryRefsFromEffectRefs(effectRefs = []) {
  return effectRefs
    .filter((ref) => String(ref.kind || ref.type || '').includes('recallIndexEntryRef'))
    .map((ref) => sanitizeDiagnostic(ref));
}

function pressureArcDigestRefsFromEffectRefs(effectRefs = []) {
  return effectRefs
    .filter((ref) => String(ref.kind || ref.type || '').includes('pressureArcDigestRef'))
    .map((ref) => sanitizeDiagnostic(ref));
}

function commandBearingEvidenceFromEffectRefs(effectRefs = [], backgroundBatches = []) {
  const batchesById = new Map(
    (backgroundBatches || [])
      .filter((batch) => batch?.batchId)
      .map((batch) => [batch.batchId, batch])
  );
  return (effectRefs || [])
    .filter((ref) => ref.kind === 'directive.commandBearingEvidence.v1')
    .map((ref) => {
      const batch = batchesById.get(ref.backgroundBatchId) || {};
      return compact({
        kind: 'directive.commandBearingEvidenceProjection.v1',
        evidenceId: ref.id || null,
        transactionId: ref.transactionId || batch.transactionId || null,
        batchId: ref.backgroundBatchId || batch.batchId || null,
        sourceFrameId: ref.sourceFrameId || batch.sourceFrameId || null,
        sourceOutcomeId: ref.sourceOutcomeId || ref.outcomeId || batch.outcomeId || null,
        occurredAt: ref.occurredAt || batch.occurredAt || null,
        primarySignal: ref.primarySignal || null,
        trackSignals: Array.isArray(ref.trackSignals) ? [...ref.trackSignals] : undefined,
        strength: ref.strength || null,
        status: ref.status || null,
        evidenceHash: ref.evidenceHash || ref.hash || null,
        acceptedBatchHash: ref.acceptedBatchHash || batch.acceptedBatchHash || batch.forgeBatchRef?.acceptedBatchHash || null,
        forgeBatchRef: batch.forgeBatchRef ? cloneJson(batch.forgeBatchRef) : undefined
      });
    });
}

function commandBearingReviewClosuresFromEffectRefs(effectRefs = [], backgroundBatches = []) {
  const batchesById = new Map(
    (backgroundBatches || [])
      .filter((batch) => batch?.batchId)
      .map((batch) => [batch.batchId, batch])
  );
  return (effectRefs || [])
    .filter((ref) => ref.kind === 'directive.commandBearingReviewClosure.v1')
    .map((ref) => {
      const batch = batchesById.get(ref.backgroundBatchId) || {};
      return compact({
        kind: 'directive.commandBearingReviewClosureProjection.v1',
        closureId: ref.id || null,
        transactionId: ref.transactionId || batch.transactionId || null,
        batchId: ref.backgroundBatchId || batch.batchId || null,
        sourceFrameId: ref.sourceFrameId || batch.sourceFrameId || null,
        occurredAt: ref.occurredAt || batch.occurredAt || null,
        reviewHash: ref.reviewHash || batch.reviewHash || batch.forgeBatchRef?.reviewHash || null,
        forgeBatchRef: batch.forgeBatchRef ? cloneJson(batch.forgeBatchRef) : undefined
      });
    });
}

function recallRevisionFromEntryRefs(entryRefs = []) {
  return entryRefs.length ? hashStableJson(entryRefs.map((ref) => ({
    id: ref.id || null,
    hash: ref.hash || null,
    sceneSealId: ref.sceneSealId || null,
    pressureArcDigestId: ref.pressureArcDigestId || null,
    sourceFrameId: ref.sourceFrameId || null
  }))) : null;
}

function sceneSealRevisionFromRefs(sceneSealRefs = []) {
  return sceneSealRefs.length ? hashStableJson(sceneSealRefs.map((ref) => ({
    id: ref.id || null,
    hash: ref.hash || null,
    sourceFrameId: ref.sourceFrameId || null,
    sceneSealId: ref.sceneSealId || null
  }))) : null;
}

function pressureArcDigestRevisionFromRefs(pressureArcDigestRefs = []) {
  return pressureArcDigestRefs.length ? hashStableJson(pressureArcDigestRefs.map((ref) => ({
    id: ref.id || null,
    hash: ref.hash || null,
    sourceFrameId: ref.sourceFrameId || null,
    pressureArcDigestId: ref.pressureArcDigestId || null
  }))) : null;
}

function latestTimestamp(...values) {
  const candidates = values
    .map((value) => typeof value === 'function' ? value() : value)
    .filter((value) => typeof value === 'string' && value.trim() !== '');
  if (candidates.length === 0) return isoNow();
  const sorted = candidates.sort();
  return sorted[sorted.length - 1];
}

function coreStoreCounters({ transactions = {}, events = [], turns = [], diagnostics = [] } = {}) {
  return {
    transactions: Object.keys(transactions || {}).length,
    events: Array.isArray(events) ? events.length : 0,
    turns: Array.isArray(turns) ? turns.length : 0,
    diagnostics: Array.isArray(diagnostics) ? diagnostics.length : 0,
    backgrounds: (events || []).filter((event) => event?.type === 'backgroundBatchCommitted').length,
    recoveries: (events || []).filter((event) => event?.type === 'recoveryRequired').length
  };
}

function normalizeHydratedTransaction(transaction = {}, { campaignId, saveId, updatedAt } = {}) {
  return {
    ...cloneJson(transaction),
    campaignId: transaction.campaignId || campaignId,
    saveId: transaction.saveId || saveId,
    createdAt: transaction.createdAt || transaction.updatedAt || updatedAt,
    updatedAt: transaction.updatedAt || transaction.createdAt || updatedAt,
    revisions: createRevisions(transaction.revisions || {}),
    phaseAdvanceIdempotencyKeys: Array.isArray(transaction.phaseAdvanceIdempotencyKeys)
      ? [...transaction.phaseAdvanceIdempotencyKeys]
      : []
  };
}

export async function loadCoreStoreStateV2(adapter, {
  campaignId,
  saveId,
  branchId = 'main',
  now = null,
  missingOk = false
} = {}) {
  const id = requireNonEmptyString(campaignId, 'campaignId');
  const save = requireNonEmptyString(saveId, 'saveId');
  let manifest;
  try {
    manifest = await loadV2SaveManifest(adapter, {
      campaignId: id,
      saveId: save,
      layout: 'core'
    });
  } catch (error) {
    if (missingOk === true && (error?.code === 'ENOENT' || /not found/i.test(error?.message || ''))) return null;
    throw error;
  }

  const [head, hostMap, promptCache, events, turns, diagnostics] = await Promise.all([
    manifest.head ? readV2ArtifactRef(adapter, manifest.head) : null,
    manifest.hostMap ? readV2ArtifactRef(adapter, manifest.hostMap) : null,
    manifest.promptCache ? readV2ArtifactRef(adapter, manifest.promptCache) : null,
    readSegmentEntries(adapter, manifest.eventSegments || []),
    readSegmentEntries(adapter, manifest.turnSegments || []),
    readSegmentEntries(adapter, manifest.diagnosticsSegments || [])
  ]);
  const coreHead = head?.coreStore || {};
  const timestamp = latestTimestamp(coreHead.updatedAt, manifest.updatedAt, now);
  const transactions = Object.fromEntries(Object.entries(reconstructTransactionsFromEvents(events)).map(([key, transaction]) => [
    key,
    normalizeHydratedTransaction(transaction, {
      campaignId: id,
      saveId: save,
      updatedAt: timestamp
    })
  ]));
  const revisions = maxRevisions(
    coreHead.revisions || {},
    ...events.map((event) => event.revisionsAfter || event.revisions || {}),
    ...turns.map((turn) => turn.revisions || {}),
    ...diagnostics.map((diagnostic) => diagnostic.revisions || {})
  );
  return {
    kind: 'directive.coreStore.v2',
    schemaVersion: 1,
    campaignId: id,
    saveId: save,
    branchId: manifest.branchId || branchId,
    createdAt: manifest.createdAt || timestamp,
    updatedAt: timestamp,
    revisions,
    transactions,
    events: events.map(cloneJson),
    turns: turns.map(cloneJson),
    diagnostics: diagnostics.map(cloneJson),
    hostMapRows: mergeHostMapRows(
      Array.isArray(hostMap?.rows) ? hostMap.rows.map(cloneJson) : [],
      deriveHostMapRowsFromEvents(events)
    ),
    promptDirtyDomains: uniqueStrings([
      ...(Array.isArray(coreHead.promptDirtyDomains) ? coreHead.promptDirtyDomains : []),
      ...(Array.isArray(promptCache?.dirtyDomains) ? promptCache.dirtyDomains : []),
      ...turns.flatMap((turn) => Array.isArray(turn?.promptDirtyDomains) ? turn.promptDirtyDomains : []),
      ...derivePromptDirtyDomainsFromEvents(events)
    ]),
    counters: coreStoreCounters({ transactions, events, turns, diagnostics })
  };
}

export async function copyCoreStoreStateV2ForSaveBranch(adapter, {
  campaignId,
  sourceSaveId,
  targetSaveId,
  branchId = null,
  sourceChatId = null,
  targetChatId = null,
  now = null
} = {}) {
  const id = requireNonEmptyString(campaignId, 'campaignId');
  const sourceSave = requireNonEmptyString(sourceSaveId, 'sourceSaveId');
  const targetSave = requireNonEmptyString(targetSaveId, 'targetSaveId');
  const targetBranch = requireNonEmptyString(branchId || targetSave, 'branchId');
  const sourceState = await loadCoreStoreStateV2(adapter, {
    campaignId: id,
    saveId: sourceSave,
    missingOk: true,
    now
  });
  const timestamp = typeof now === 'function' ? now() : (now || isoNow());
  const recallSourceMutation = createRecallSourceMutation({
    action: 'save-as',
    campaignId: id,
    saveId: sourceSave,
    branchId: sourceState?.branchId || sourceSave,
    targetSaveId: targetSave,
    targetBranchId: targetBranch,
    reason: sourceState ? 'save-as-core-branch-clone' : 'save-as-core-branch-clone-source-missing',
    occurredAt: timestamp
  });
  if (!sourceState) {
    return {
      state: null,
      checkpointCount: 0,
      skipped: true,
      reason: 'source-core-state-missing',
      recallSourceMutation,
      saveManifestRef: null
    };
  }
  const retargetOptions = {
    campaignId: id,
    sourceSaveId: sourceSave,
    targetSaveId: targetSave,
    branchId: targetBranch,
    sourceChatId,
    targetChatId
  };
  const recallAuxiliaryRewrite = await forkRecallAuxiliaryArtifactsForSaveBranch(adapter, {
    sourceState,
    mutation: recallSourceMutation,
    targetSaveId: targetSave,
    targetBranchId: targetBranch,
    now: timestamp
  });
  const targetState = {
    ...replaceRecallAuxiliaryRefs(
      retargetCoreValueForSaveBranch(sourceState, retargetOptions),
      recallAuxiliaryRewrite.targetRefs
    ),
    campaignId: id,
    saveId: targetSave,
    branchId: targetBranch,
    updatedAt: timestamp
  };
  const checkpoints = await branchCheckpointArtifacts(adapter, sourceState, retargetOptions);
  const commit = await commitV2SaveLayout(adapter, {
    campaignId: id,
    saveId: targetSave,
    branchId: targetBranch,
    head: buildHead(targetState),
    hostMap: {
      excludesRawChatText: true,
      rows: cloneJson(targetState.hostMapRows || [])
    },
    promptCache: {
      directiveOwnedRevision: Number(targetState.revisions?.prompt || 0),
      dirtyDomains: uniqueStrings(targetState.promptDirtyDomains || []),
      blocks: []
    },
    eventSegments: [cloneJson(targetState.events || [])],
    turnSegments: [cloneJson(targetState.turns || [])],
    diagnosticsSegments: [cloneJson(targetState.diagnostics || [])],
    checkpoints,
    metadata: {
      source: 'save-as-core-branch-clone',
      parentSaveId: sourceSave,
      targetSaveId: targetSave,
      checkpointCount: checkpoints.length,
      recallSourceMutation,
      recallAuxiliaryRewrite
    },
    importedFrom: {
      campaignId: id,
      saveId: sourceSave,
      layout: 'core'
    },
    now: timestamp,
    layout: 'core'
  });
  return {
    state: cloneJson(targetState),
    checkpointCount: checkpoints.length,
    skipped: false,
    recallSourceMutation: cloneJson(recallSourceMutation),
    recallAuxiliaryRewrite: cloneJson(recallAuxiliaryRewrite),
    saveManifestRef: cloneJson(commit.saveManifestRef || null)
  };
}

export async function readCoreStoreProjectionsV2(adapter, {
  campaignId,
  saveId,
  layout = 'core'
} = {}) {
  const manifest = await loadV2SaveManifest(adapter, {
    campaignId: requireNonEmptyString(campaignId, 'campaignId'),
    saveId: requireNonEmptyString(saveId, 'saveId'),
    layout
  });
  const [events, turns, diagnostics] = await Promise.all([
    readSegmentEntries(adapter, manifest.eventSegments || []),
    readSegmentEntries(adapter, manifest.turnSegments || []),
    readSegmentEntries(adapter, manifest.diagnosticsSegments || [])
  ]);
  return buildCoreStoreReadProjections({
    events,
    turns,
    diagnostics,
    transactions: reconstructTransactionsFromEvents(events)
  });
}

export function createCoreStoreV2({
  adapter,
  campaignId,
  saveId,
  branchId = 'main',
  now = null,
  initialState = null,
  segmentMaxBytes = null
} = {}) {
  requireObject(adapter, 'storage adapter');
  const id = requireNonEmptyString(campaignId, 'campaignId');
  const save = requireNonEmptyString(saveId, 'saveId');
  const clock = typeof now === 'function' ? now : () => now || isoNow();
  const state = initialState
    ? {
        ...cloneJson(initialState),
        campaignId: id,
        saveId: save,
        branchId: initialState.branchId || requireNonEmptyString(branchId, 'branchId'),
        revisions: createRevisions(initialState.revisions || {}),
        transactions: cloneJson(initialState.transactions || {}),
        events: Array.isArray(initialState.events) ? initialState.events.map(cloneJson) : [],
        turns: Array.isArray(initialState.turns) ? initialState.turns.map(cloneJson) : [],
        diagnostics: Array.isArray(initialState.diagnostics) ? initialState.diagnostics.map(cloneJson) : [],
        hostMapRows: Array.isArray(initialState.hostMapRows) ? initialState.hostMapRows.map(cloneJson) : [],
        promptDirtyDomains: uniqueStrings(initialState.promptDirtyDomains || []),
        counters: coreStoreCounters({
          transactions: initialState.transactions || {},
          events: initialState.events || [],
          turns: initialState.turns || [],
          diagnostics: initialState.diagnostics || []
        })
      }
    : createInitialState({
        campaignId: id,
        saveId: save,
      branchId: requireNonEmptyString(branchId, 'branchId'),
      now: clock()
    });
  let lastCommit = null;
  let writeQueue = Promise.resolve();
  let hasPublishedLayout = Boolean(initialState);

  function timestamp() {
    return clock();
  }

  function eventId(type) {
    return `core-event-${String(state.events.length + 1).padStart(6, '0')}:${type}`;
  }

  function diagnosticId(type) {
    return `core-diagnostic-${String(state.diagnostics.length + 1).padStart(6, '0')}:${type}`;
  }

  function turnId() {
    return `core-turn-${String(state.turns.length + 1).padStart(6, '0')}`;
  }

  function requireTransaction(transactionId) {
    const transaction = state.transactions[requireNonEmptyString(transactionId, 'transactionId')];
    if (!transaction) throw new Error(`Unknown CORE transaction "${transactionId}"`);
    return transaction;
  }

  async function appendDiagnosticsBatchImpl(transactionId, diagnosticsEvents = []) {
    return enqueueWrite(async () => {
      const transaction = requireTransaction(transactionId);
      const events = (Array.isArray(diagnosticsEvents) ? diagnosticsEvents : [diagnosticsEvents])
        .filter((event) => event && typeof event === 'object' && !Array.isArray(event));
      if (!events.length) return [];
      state.updatedAt = timestamp();
      const diagnostics = [];
      for (const diagnosticsEvent of events) {
        state.revisions = nextRevisions(state.revisions, { diagnostic: 1 });
        const type = diagnosticsEvent.type || diagnosticsEvent.category || 'diagnostic';
        const diagnostic = diagnosticRecord({
          id: diagnosticsEvent.id || diagnosticId(type),
          type,
          transaction,
          campaignId: state.campaignId,
          saveId: state.saveId,
          chatId: transaction.chatId,
          observedAt: state.updatedAt,
          payload: diagnosticsEvent,
          revisions: state.revisions
        });
        state.diagnostics.push(diagnostic);
        diagnostics.push(diagnostic);
      }
      state.counters.diagnostics = state.diagnostics.length;
      lastCommit = await commitV2DiagnosticsSegments(adapter, {
        campaignId: state.campaignId,
        saveId: state.saveId,
        diagnosticsSegments: diagnostics,
        recentDiagnostics: state.diagnostics.slice(-8),
        metadata: {
          source: 'core-store-v2-diagnostics',
          diagnosticCount: state.diagnostics.length,
          batchCount: diagnostics.length
        },
        now: state.updatedAt,
        layout: 'core'
      });
      return diagnostics.map(cloneJson);
    });
  }

  function enqueueWrite(task) {
    const run = writeQueue.then(task, task);
    writeQueue = run.then(() => null, () => null);
    return run;
  }

  function restoreState(snapshot = {}) {
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, cloneJson(snapshot));
  }

  function eventTurnDeltaCursor() {
    return {
      eventStart: state.events.length,
      turnStart: state.turns.length
    };
  }

  async function persist() {
    state.updatedAt = timestamp();
    const snapshot = cloneJson(state);
    return enqueueWrite(async () => {
      lastCommit = await commitV2SaveLayout(adapter, {
        ...buildPersistPayload(snapshot),
        layout: 'core',
        reuseExistingSegmentRefs: true,
        segmentMaxBytes
      });
      hasPublishedLayout = true;
      return lastCommit;
    });
  }

  async function persistEventTurnDelta(cursor, metadata = {}, options = {}) {
    const eventStart = Number(cursor?.eventStart ?? state.events.length);
    const turnStart = Number(cursor?.turnStart ?? state.turns.length);
    const events = state.events.slice(eventStart).map(cloneJson);
    const turns = state.turns.slice(turnStart).map(cloneJson);
    const checkpoints = Array.isArray(options.checkpoints) ? options.checkpoints.map(cloneJson) : [];
    const committedAt = state.updatedAt;
    const eventCount = state.events.length;
    const turnCount = state.turns.length;
    return enqueueWrite(async () => {
      lastCommit = await commitV2EventTurnSegments(adapter, {
        campaignId: state.campaignId,
        saveId: state.saveId,
        eventSegments: events.length > 0 ? [events] : [],
        turnSegments: turns.length > 0 ? [turns] : [],
        checkpoints,
        metadata: {
          source: 'core-store-v2-event-turn-delta',
          eventCount,
          turnCount,
          deltaEventCount: events.length,
          deltaTurnCount: turns.length,
          ...cloneJson(metadata)
        },
        now: committedAt,
        layout: 'core',
        segmentMaxBytes
      });
      hasPublishedLayout = true;
      return lastCommit;
    });
  }

  function appendEvent(type, transaction, {
    payload = {},
    revisionsBefore = null,
    revisionsAfter = null,
    idempotencyKey = null,
    occurredAt = state.updatedAt
  } = {}) {
    const sequence = state.events.length + 1;
    const event = eventRecord({
      id: eventId(type),
      type,
      txnId: transaction.id,
      campaignId: state.campaignId,
      saveId: state.saveId,
      chatId: transaction.chatId,
      sourceFrameId: transaction.sourceFrameId,
      sequence,
      occurredAt,
      idempotencyKey,
      payload,
      revisionsBefore,
      revisionsAfter
    });
    state.events.push(event);
    state.counters.events = state.events.length;
    return event;
  }

  function touchTransaction(transaction, patch = {}) {
    Object.assign(transaction, patch, {
      updatedAt: state.updatedAt,
      revisions: cloneJson(state.revisions)
    });
    return transaction;
  }

  return {
    get state() {
      return cloneJson(state);
    },
    get lastCommit() {
      return cloneJson(lastCommit);
    },
    readProjections() {
      return buildCoreStoreReadProjections(state);
    },
    getTransaction(transactionId) {
      return cloneJson(requireTransaction(transactionId));
    },
    getRevisions() {
      return cloneJson(state.revisions);
    },
    async loadHead() {
      return loadV2MaterializedHead(adapter, { campaignId: state.campaignId, saveId: state.saveId, layout: 'core' });
    },
    async supersedeLatestSourceTransaction(priorTransactionId, replacementTransactionId, options = {}) {
      const idempotencyKey = requireNonEmptyString(options.idempotencyKey, 'idempotencyKey');
      const priorTransaction = requireTransaction(priorTransactionId);
      const replacementTransaction = requireTransaction(replacementTransactionId);
      if (priorTransaction.id === replacementTransaction.id) {
        const error = new Error('CORE source restart requires distinct prior and replacement transactions');
        error.code = 'DIRECTIVE_CORE_SOURCE_RESTART_SAME_TRANSACTION';
        throw error;
      }
      if (priorTransaction.sourceRestart) {
        if (
          priorTransaction.sourceRestart.idempotencyKey === idempotencyKey
          && priorTransaction.sourceRestart.newTransactionId === replacementTransaction.id
        ) {
          return cloneJson({
            kind: 'directive.coreSourceRestartResult.v1',
            status: 'recorded',
            sourceRestart: priorTransaction.sourceRestart,
            priorTransaction,
            transaction: replacementTransaction
          });
        }
        const error = new Error(`CORE transaction "${priorTransaction.id}" already has a source restart`);
        error.code = 'DIRECTIVE_CORE_SOURCE_ALREADY_RESTARTED';
        throw error;
      }
      if (replacementTransaction.restartedFromTransactionId || replacementTransaction.sourceRestart) {
        const error = new Error(`CORE transaction "${replacementTransaction.id}" is already a replacement source restart`);
        error.code = 'DIRECTIVE_CORE_REPLACEMENT_ALREADY_RESTARTED';
        throw error;
      }
      if (priorTransaction.turnId || priorTransaction.outcomeId || priorTransaction.visibleResponseRef) {
        const error = new Error(`CORE transaction "${priorTransaction.id}" cannot restart after mechanics or visible response`);
        error.code = 'DIRECTIVE_CORE_SOURCE_RESTART_HAS_DEPENDENTS';
        throw error;
      }
      if (priorTransaction.backgroundBatchId || (priorTransaction.backgroundBatchIds || []).length > 0) {
        const error = new Error(`CORE transaction "${priorTransaction.id}" cannot restart after background settlement`);
        error.code = 'DIRECTIVE_CORE_SOURCE_RESTART_HAS_DEPENDENTS';
        throw error;
      }
      if (
        replacementTransaction.turnId
        || replacementTransaction.outcomeId
        || replacementTransaction.visibleResponseRef
        || replacementTransaction.recoveryCaseId
        || replacementTransaction.backgroundBatchId
        || (replacementTransaction.backgroundBatchIds || []).length > 0
      ) {
        const error = new Error(`CORE replacement transaction "${replacementTransaction.id}" is not restartable`);
        error.code = 'DIRECTIVE_CORE_REPLACEMENT_NOT_RESTARTABLE';
        throw error;
      }
      if (priorTransaction.campaignId !== replacementTransaction.campaignId || priorTransaction.saveId !== replacementTransaction.saveId) {
        const error = new Error('CORE source restart transactions must belong to the same campaign save');
        error.code = 'DIRECTIVE_CORE_SOURCE_RESTART_SCOPE_MISMATCH';
        throw error;
      }
      if (priorTransaction.chatId && replacementTransaction.chatId && priorTransaction.chatId !== replacementTransaction.chatId) {
        const error = new Error('CORE source restart transactions must belong to the same chat');
        error.code = 'DIRECTIVE_CORE_SOURCE_RESTART_CHAT_MISMATCH';
        throw error;
      }
      const priorHostMessageId = priorTransaction.sourceFrame?.hostMessageId || null;
      const replacementHostMessageId = replacementTransaction.sourceFrame?.hostMessageId || null;
      if (priorHostMessageId && replacementHostMessageId && priorHostMessageId !== replacementHostMessageId) {
        const error = new Error('CORE source restart host message ids must match');
        error.code = 'DIRECTIVE_CORE_SOURCE_RESTART_HOST_MISMATCH';
        throw error;
      }
      const phaseAfter = 'restartSuperseded';
      assertPhaseTransition(priorTransaction.phase, phaseAfter);
      const stateBefore = cloneJson(state);
      const deltaCursor = eventTurnDeltaCursor();
      const createdAt = timestamp();
      const revisionsBefore = cloneJson(state.revisions);
      state.updatedAt = createdAt;
      state.revisions = nextRevisions(state.revisions, { runtime: 1 });
      const restart = sourceRestartRef({
        priorTransaction,
        transaction: replacementTransaction,
        sourceFrame: replacementTransaction.sourceFrame,
        options: {
          ...options,
          transactionId: replacementTransaction.id,
          ingressId: replacementTransaction.ingressId,
          priorTransactionId: priorTransaction.id,
          priorIngressId: priorTransaction.ingressId,
          priorSourceFrameId: priorTransaction.sourceFrameId,
          observedTextHash: replacementTransaction.sourceFrame?.textHash || options.observedTextHash || null,
          idempotencyKey
        },
        occurredAt: createdAt
      });
      touchTransaction(priorTransaction, {
        phase: phaseAfter,
        sourceRestart: restart,
        restartedByTransactionId: replacementTransaction.id,
        restartedByIngressId: replacementTransaction.ingressId || null,
        restartedBySourceFrameId: replacementTransaction.sourceFrameId,
        restartReason: restart.reason || null,
        sourceRestartIdempotencyKey: idempotencyKey,
        recoveryCaseId: (options.recoveryId || options.priorRecoveryId) ? null : priorTransaction.recoveryCaseId,
        recoveryReason: (options.recoveryId || options.priorRecoveryId) ? null : priorTransaction.recoveryReason
      });
      touchTransaction(replacementTransaction, {
        sourceRestart: restart,
        restartedFromTransactionId: priorTransaction.id,
        restartedFromIngressId: priorTransaction.ingressId || null
      });
      state.hostMapRows = state.hostMapRows.map((row) => row?.transactionId === priorTransaction.id
        ? {
            ...row,
            status: 'restartSuperseded',
            sourceRestart: restart,
            replacementTransactionId: replacementTransaction.id,
            replacementSourceFrameId: replacementTransaction.sourceFrameId,
            replacementIngressId: replacementTransaction.ingressId || null
          }
        : row);
      appendEvent('latestSourceRestarted', priorTransaction, {
        payload: {
          phaseAfter,
          sourceRestart: restart,
          restartRef: restart,
          recoveryResolution: (options.recoveryId || options.priorRecoveryId) ? {
            id: options.recoveryId || options.priorRecoveryId,
            status: 'resolved',
            reason: restart.reason || 'latest-source-reobserved',
            replacementTransactionId: replacementTransaction.id,
            replacementIngressId: replacementTransaction.ingressId || null,
            replacementSourceFrameId: replacementTransaction.sourceFrameId
          } : undefined,
          repairDecision: sanitizeDiagnostic(options.repairDecision || {}),
          sourceMutation: sanitizeRecoverySourceMutation(options.sourceMutation || {})
        },
        revisionsBefore,
        revisionsAfter: state.revisions,
        idempotencyKey,
        occurredAt: createdAt
      });
      try {
        await persistEventTurnDelta(deltaCursor, {
          operation: 'supersedeLatestSourceTransaction',
          transactionId: priorTransaction.id,
          replacementTransactionId: replacementTransaction.id
        });
      } catch (error) {
        restoreState(stateBefore);
        throw error;
      }
      return cloneJson({
        kind: 'directive.coreSourceRestartResult.v1',
        status: 'recorded',
        sourceRestart: restart,
        priorTransaction,
        transaction: replacementTransaction
      });
    },
    async beginTurn(sourceFrame, options = {}) {
      requireObject(sourceFrame, 'sourceFrame');
      assertSourceFrameScope(sourceFrame, {
        campaignId: state.campaignId,
        saveId: state.saveId
      });
      const deltaCursor = eventTurnDeltaCursor();
      const createdAt = timestamp();
      const transactionId = options.transactionId || `txn:${sourceFrame.id || sourceFrame.hostMessageId || state.counters.transactions + 1}`;
      const existing = state.transactions[transactionId];
      if (existing) {
        if (options.idempotencyKey && existing.beginIdempotencyKey === options.idempotencyKey) return cloneJson(existing);
        const error = new Error(`CORE transaction "${transactionId}" already exists`);
        error.code = 'DIRECTIVE_CORE_DUPLICATE_TRANSACTION';
        throw error;
      }
      const revisionsBefore = cloneJson(state.revisions);
      state.updatedAt = createdAt;
      state.revisions = nextRevisions(state.revisions, { runtime: 1 });
      const sourceRef = sourceFrameRef(sourceFrame);
      const transaction = {
        kind: 'directive.turnTransaction.v1',
        schemaVersion: 1,
        id: requireNonEmptyString(transactionId, 'transactionId'),
        phase: 'observed',
        sourceFrameId: requireNonEmptyString(sourceFrame.id, 'sourceFrame.id'),
        campaignId: state.campaignId,
        saveId: state.saveId,
        chatId: requireNonEmptyString(sourceFrame.chatId || options.chatId, 'chatId'),
        createdAt,
        updatedAt: createdAt,
        route: null,
        visibleResponseRef: null,
        recoveryCaseId: null,
        revisions: cloneJson(state.revisions),
        sourceFrame: sourceRef,
        ingressId: options.ingressId || `ingress:${transactionId}`,
        beginIdempotencyKey: options.idempotencyKey || null
      };
      state.transactions[transaction.id] = transaction;
      state.counters.transactions = Object.keys(state.transactions).length;
      state.hostMapRows.push(compact({
        hostMessageId: sourceFrame.hostMessageId || null,
        role: 'player',
        transactionId: transaction.id,
        sourceFrameId: transaction.sourceFrameId,
        chatId: transaction.chatId,
        textHash: sourceFrame.textHash || null,
        visibility: sourceFrame.visibility || null
      }));
      appendEvent('turnObserved', transaction, {
        payload: { sourceFrameRef: sourceRef, ingressId: transaction.ingressId },
        revisionsBefore,
        revisionsAfter: state.revisions,
        idempotencyKey: options.idempotencyKey || null,
        occurredAt: createdAt
      });
      if (hasPublishedLayout) {
        await persistEventTurnDelta(deltaCursor, {
          operation: 'beginTurn',
          transactionId: transaction.id
        });
      } else {
        await persist();
      }
      return cloneJson(transaction);
    },
    async advanceTurn(transactionId, phasePatch = {}) {
      const transaction = requireTransaction(transactionId);
      if (
        phasePatch.idempotencyKey
        && Array.isArray(transaction.phaseAdvanceIdempotencyKeys)
        && transaction.phaseAdvanceIdempotencyKeys.includes(phasePatch.idempotencyKey)
      ) {
        return cloneJson(transaction);
      }
      const fromPhase = transaction.phase;
      const phase = phasePatch.phase ? assertPhaseTransition(fromPhase, phasePatch.phase) : transaction.phase;
      const deltaCursor = eventTurnDeltaCursor();
      const revisionsBefore = cloneJson(state.revisions);
      state.updatedAt = timestamp();
      state.revisions = nextRevisions(state.revisions, { runtime: 1 });
      touchTransaction(transaction, {
        phase,
        route: phasePatch.route === undefined ? transaction.route : phasePatch.route,
        routeReason: phasePatch.reason || transaction.routeReason || null,
        phaseAdvanceIdempotencyKeys: phasePatch.idempotencyKey
          ? [...new Set([...(transaction.phaseAdvanceIdempotencyKeys || []), phasePatch.idempotencyKey])]
          : transaction.phaseAdvanceIdempotencyKeys || []
      });
      appendEvent('phaseAdvanced', transaction, {
        payload: {
          fromPhase,
          toPhase: phase,
          route: phasePatch.route === undefined ? transaction.route : phasePatch.route,
          timing: sanitizeDiagnostic(phasePatch.timing || {}),
          directivePromptRevisionUsed: phasePatch.directivePromptRevisionUsed ?? null,
          responseId: phasePatch.responseId || null,
          responseKind: phasePatch.responseKind || null,
          outcomeId: phasePatch.outcomeId || null
        },
        revisionsBefore,
        revisionsAfter: state.revisions,
        idempotencyKey: phasePatch.idempotencyKey || null
      });
      await persistEventTurnDelta(deltaCursor, {
        operation: 'advanceTurn',
        transactionId: transaction.id
      });
      return cloneJson(transaction);
    },
    async recordPendingInteraction(transactionId, interaction = {}) {
      const transaction = requireTransaction(transactionId);
      const interactionRef = compactPendingInteractionRef(interaction, transaction, 'pending');
      if (!interactionRef.id) {
        const error = new Error('CORE pending interaction requires interaction id');
        error.code = 'DIRECTIVE_CORE_PENDING_INTERACTION_ID_REQUIRED';
        throw error;
      }
      if (
        interaction.idempotencyKey
        && state.events.some((event) => (
          event.type === 'pendingInteractionRecorded'
          && event.idempotencyKey === interaction.idempotencyKey
        ))
      ) {
        return cloneJson(buildPendingInteractionProjections(state.events, state.transactions)
          .find((entry) => entry.id === interactionRef.id) || interactionRef);
      }
      const deltaCursor = eventTurnDeltaCursor();
      const revisionsBefore = cloneJson(state.revisions);
      state.updatedAt = timestamp();
      state.revisions = nextRevisions(state.revisions, { runtime: 1 });
      appendEvent('pendingInteractionRecorded', transaction, {
        payload: {
          pendingInteraction: interactionRef
        },
        revisionsBefore,
        revisionsAfter: state.revisions,
        idempotencyKey: interaction.idempotencyKey || `pending-interaction:${interactionRef.id}`,
        occurredAt: state.updatedAt
      });
      await persistEventTurnDelta(deltaCursor, {
        operation: 'recordPendingInteraction',
        transactionId: transaction.id,
        interactionId: interactionRef.id
      });
      return cloneJson(interactionRef);
    },
    async resolvePendingInteraction(transactionId, interactionId, resolution = {}) {
      const transaction = requireTransaction(transactionId);
      const id = requireNonEmptyString(interactionId, 'interactionId');
      if (
        resolution.idempotencyKey
        && state.events.some((event) => (
          event.type === 'pendingInteractionResolved'
          && event.idempotencyKey === resolution.idempotencyKey
        ))
      ) {
        return cloneJson(buildPendingInteractionProjections(state.events, state.transactions)
          .find((entry) => entry.id === id) || null);
      }
      const deltaCursor = eventTurnDeltaCursor();
      const revisionsBefore = cloneJson(state.revisions);
      state.updatedAt = timestamp();
      state.revisions = nextRevisions(state.revisions, { runtime: 1 });
      const cleanResolution = sanitizeDiagnostic(resolution || {});
      appendEvent('pendingInteractionResolved', transaction, {
        payload: {
          interactionId: id,
          status: cleanResolution.status || 'resolved',
          resolvedAt: cleanResolution.resolvedAt || state.updatedAt,
          resolution: cleanResolution
        },
        revisionsBefore,
        revisionsAfter: state.revisions,
        idempotencyKey: resolution.idempotencyKey || `pending-interaction-resolved:${id}:${cleanResolution.status || 'resolved'}`,
        occurredAt: state.updatedAt
      });
      await persistEventTurnDelta(deltaCursor, {
        operation: 'resolvePendingInteraction',
        transactionId: transaction.id,
        interactionId: id
      });
      return cloneJson(buildPendingInteractionProjections(state.events, state.transactions)
        .find((entry) => entry.id === id) || null);
    },
    async commitMechanics(transactionId, operationBundle = {}) {
      const transaction = requireTransaction(transactionId);
      const bundle = cloneJson(operationBundle);
      assertBoundedMechanicsOperations(bundle);
      if (transaction.turnId) {
        if (bundle.idempotencyKey && transaction.mechanicsIdempotencyKey === bundle.idempotencyKey) {
          return cloneJson(state.turns.find((turn) => turn.transactionId === transaction.id));
        }
        const error = new Error(`CORE transaction "${transaction.id}" already has committed mechanics`);
        error.code = 'DIRECTIVE_CORE_MECHANICS_ALREADY_COMMITTED';
        throw error;
      }
      if (Number.isFinite(Number(bundle.baseMechanicsRevision)) && Number(bundle.baseMechanicsRevision) !== state.revisions.mechanics) {
        const error = new Error(`Stale CORE mechanics base revision for "${transaction.id}"`);
        error.code = 'DIRECTIVE_CORE_STALE_MECHANICS_REVISION';
        error.details = { expected: state.revisions.mechanics, actual: Number(bundle.baseMechanicsRevision) };
        throw error;
      }
      const deltaCursor = eventTurnDeltaCursor();
      const phaseAfter = bundle.phaseAfter ? assertPhaseTransition(transaction.phase, bundle.phaseAfter) : transaction.phase;
      const revisionsBefore = cloneJson(state.revisions);
      state.updatedAt = timestamp();
      state.revisions = nextRevisions(state.revisions, { mechanics: 1, runtime: 1 });
      const coreCheckpointRef = mechanicsCheckpointRef(transaction, bundle);
      if (coreCheckpointRef) bundle.coreCheckpointRef = coreCheckpointRef;
      const coreCheckpoint = mechanicsCheckpointArtifact(transaction, bundle, coreCheckpointRef, revisionsBefore);
      const turn = turnRecord({
        id: turnId(),
        transaction,
        operationBundle: bundle,
        createdAt: state.updatedAt,
        revisions: state.revisions
      });
      state.turns.push(turn);
      state.counters.turns = state.turns.length;
      if (Array.isArray(bundle.promptDirtyDomains)) {
        state.promptDirtyDomains.push(...bundle.promptDirtyDomains);
      }
      touchTransaction(transaction, {
        phase: phaseAfter,
        turnId: turn.turnId,
        outcomeId: turn.outcomeId,
        mechanicsIdempotencyKey: bundle.idempotencyKey || null
      });
      appendEvent('mechanicsCommitted', transaction, {
        payload: {
          operationBundle: operationBundleRef(bundle),
          turnRef: { id: turn.id, turnId: turn.turnId, outcomeId: turn.outcomeId },
          phaseAfter
        },
        revisionsBefore,
        revisionsAfter: state.revisions,
        idempotencyKey: bundle.idempotencyKey || null
      });
      await persistEventTurnDelta(deltaCursor, {
        operation: 'commitMechanics',
        transactionId: transaction.id
      }, {
        checkpoints: coreCheckpoint ? [coreCheckpoint] : []
      });
      return cloneJson(turn);
    },
    async recordVisibleResponse(transactionId, responseRef = {}) {
      const transaction = requireTransaction(transactionId);
      const ref = compactResponseRef(responseRef);
      const closingRecovery = Boolean(transaction.recoveryCaseId) && responseRefAuthorizesRecoveryClosure(ref);
      if (transaction.phase === 'responseRetryRequired' && transaction.recoveryCaseId && !closingRecovery) {
        const error = new Error(`CORE transaction "${transaction.id}" response retry cannot be closed by visible response without REPAIR authorization`);
        error.code = 'DIRECTIVE_CORE_RESPONSE_RETRY_VISIBLE_RESPONSE_UNAUTHORIZED';
        throw error;
      }
      if (transaction.phase === 'recoveryRequired' && !closingRecovery) {
        const error = new Error(`CORE transaction "${transaction.id}" recovery cannot be closed by visible response without REPAIR authorization`);
        error.code = 'DIRECTIVE_CORE_RECOVERY_VISIBLE_RESPONSE_UNAUTHORIZED';
        throw error;
      }
      if (transaction.visibleResponseRef) {
        if (ref.idempotencyKey && transaction.visibleResponseIdempotencyKey === ref.idempotencyKey) return cloneJson(transaction);
        const error = new Error(`CORE transaction "${transaction.id}" already has a visible response`);
        error.code = 'DIRECTIVE_CORE_VISIBLE_RESPONSE_ALREADY_RECORDED';
        throw error;
      }
      if (!(['recoveryRequired', 'responseRetryRequired'].includes(transaction.phase) && closingRecovery)) {
        assertPhaseTransition(transaction.phase, 'visibleResponsePosted');
      }
      const deltaCursor = eventTurnDeltaCursor();
      const revisionsBefore = cloneJson(state.revisions);
      state.updatedAt = timestamp();
      state.revisions = nextRevisions(state.revisions, { runtime: 1 });
      touchTransaction(transaction, {
        phase: 'visibleResponsePosted',
        visibleResponseRef: ref,
        outcomeId: ref.outcomeId || transaction.outcomeId || null,
        visibleResponseIdempotencyKey: ref.idempotencyKey || null,
        recoveryCaseId: closingRecovery ? null : transaction.recoveryCaseId,
        recoveryReason: closingRecovery ? null : transaction.recoveryReason
      });
      state.hostMapRows.push(compact({
        hostMessageId: ref.hostMessageId || null,
        role: 'assistant',
        transactionId: transaction.id,
        outcomeId: ref.outcomeId || transaction.outcomeId || null,
        chatId: transaction.chatId,
        responseKind: ref.kind || null
      }));
      appendEvent('visibleResponseRecorded', transaction, {
        payload: {
          responseRef: ref,
          recoveryResolution: closingRecovery ? compact({
            id: ref.repairDecision?.recoveryCaseId || null,
            recoveryId: ref.repairDecision?.recoveryId || null,
            status: 'resolved',
            reason: ref.repairDecision?.reason || (
              ref.repairDecision?.kind === 'directive.repairResponseRetryActuationDecision.v1'
                ? 'directive-response-retry-posted'
                : 'host-native-response-reobserved'
            ),
            repairDecision: ref.repairDecision ? sanitizeDiagnostic(ref.repairDecision) : undefined
          }) : undefined
        },
        revisionsBefore,
        revisionsAfter: state.revisions,
        idempotencyKey: ref.idempotencyKey || null
      });
      await persistEventTurnDelta(deltaCursor, {
        operation: 'recordVisibleResponse',
        transactionId: transaction.id
      });
      return cloneJson(transaction);
    },
    async recordOutcomeReplacement(transactionId, replacement = {}) {
      const transaction = requireTransaction(transactionId);
      const idempotencyKey = requireNonEmptyString(replacement.idempotencyKey, 'idempotencyKey');
      const existingEvent = (state.events || []).find((event) => (
        event?.type === 'outcomeReplacementRecorded'
        && legacyTransactionId(event) === transaction.id
        && event.idempotencyKey === idempotencyKey
      ));
      if (existingEvent) {
        const existingRef = eventPayload(existingEvent).outcomeReplacementRef || null;
        assertOutcomeReplacementReplayMatch(existingRef || {}, replacement, transaction);
        return cloneJson(existingRef);
      }
      requireNonEmptyString(replacement.replacedOutcomeId || replacement.outcomeId, 'replacedOutcomeId');
      requireNonEmptyString(replacement.replacementOutcomeId, 'replacementOutcomeId');
      const stateBefore = cloneJson(state);
      const deltaCursor = eventTurnDeltaCursor();
      const revisionsBefore = cloneJson(state.revisions);
      state.updatedAt = timestamp();
      state.revisions = nextRevisions(state.revisions, { runtime: 1 });
      const outcomeReplacementRef = compactOutcomeReplacementRef(replacement, {
        transaction,
        idempotencyKey,
        occurredAt: state.updatedAt
      });
      touchTransaction(transaction, {
        outcomeReplacements: [
          ...(transaction.outcomeReplacements || []),
          outcomeReplacementRef
        ],
        outcomeReplacementIdempotencyKeys: uniqueStrings([
          ...(transaction.outcomeReplacementIdempotencyKeys || []),
          idempotencyKey
        ])
      });
      appendEvent('outcomeReplacementRecorded', transaction, {
        payload: {
          outcomeReplacementRef
        },
        revisionsBefore,
        revisionsAfter: state.revisions,
        idempotencyKey
      });
      try {
        await persistEventTurnDelta(deltaCursor, {
          operation: 'recordOutcomeReplacement',
          transactionId: transaction.id
        });
      } catch (error) {
        restoreState(stateBefore);
        throw error;
      }
      return cloneJson(outcomeReplacementRef);
    },
    async repairVisibleResponseRef(transactionId, responseRefPatch = {}) {
      const transaction = requireTransaction(transactionId);
      if (!transaction.visibleResponseRef) {
        const error = new Error(`CORE transaction "${transaction.id}" has no visible response to repair`);
        error.code = 'DIRECTIVE_CORE_VISIBLE_RESPONSE_REPAIR_UNAVAILABLE';
        throw error;
      }
      const patch = compact({
        hostMessageId: responseRefPatch.hostMessageId || null,
        textHash: responseRefPatch.textHash || null,
        outcomeIntegrity: compactOutcomeIntegrityEvidence(responseRefPatch.outcomeIntegrity)
      });
      if (patch.hostMessageId && transaction.visibleResponseRef.hostMessageId && patch.hostMessageId !== transaction.visibleResponseRef.hostMessageId) {
        const error = new Error(`CORE transaction "${transaction.id}" visible response host id does not match repair patch`);
        error.code = 'DIRECTIVE_CORE_VISIBLE_RESPONSE_REPAIR_HOST_MISMATCH';
        throw error;
      }
      const nextRef = compact({
        ...transaction.visibleResponseRef,
        hostMessageId: transaction.visibleResponseRef.hostMessageId || patch.hostMessageId || null,
        textHash: transaction.visibleResponseRef.textHash || patch.textHash || null,
        outcomeIntegrity: patch.outcomeIntegrity || transaction.visibleResponseRef.outcomeIntegrity || undefined
      });
      const changed = JSON.stringify(nextRef) !== JSON.stringify(transaction.visibleResponseRef);
      if (!changed) return cloneJson(transaction);
      const deltaCursor = eventTurnDeltaCursor();
      const revisionsBefore = cloneJson(state.revisions);
      state.updatedAt = timestamp();
      state.revisions = nextRevisions(state.revisions, { runtime: 1 });
      touchTransaction(transaction, {
        phase: 'visibleResponsePosted',
        visibleResponseRef: nextRef
      });
      appendEvent('visibleResponseRefRepaired', transaction, {
        payload: {
          responseRefPatch: compact({
            hostMessageId: nextRef.hostMessageId || null,
            textHash: nextRef.textHash || null,
            outcomeIntegrity: compactOutcomeIntegrityEvidence(nextRef.outcomeIntegrity)
          }),
          reason: responseRefPatch.reason || 'missing-visible-response-ref-field'
        },
        revisionsBefore,
        revisionsAfter: state.revisions,
        idempotencyKey: responseRefPatch.idempotencyKey || null
      });
      await persistEventTurnDelta(deltaCursor, {
        operation: 'repairVisibleResponseRef',
        transactionId: transaction.id
      });
      return cloneJson(transaction);
    },
    async markRecoveryRequired(transactionId, recoveryBundle = {}) {
      const transaction = requireTransaction(transactionId);
      const existingRecoveryEvent = recoveryBundle.idempotencyKey
        ? (state.events || []).find((event) => (
            event?.type === 'recoveryRequired'
            && legacyTransactionId(event) === transaction.id
            && event.idempotencyKey === recoveryBundle.idempotencyKey
          ))
        : null;
      if (existingRecoveryEvent && !transaction.recoveryCaseId) {
        const existingRecovery = eventPayload(existingRecoveryEvent).recoveryCase || {};
        const priorResolution = recoveryReplayResolutionFromEvents(state.events || [], {
          transactionId: transaction.id,
          recovery: existingRecovery
        });
        if (priorResolution) return cloneJson(priorResolution);
      }
      if (transaction.recoveryCaseId) {
        if (recoveryBundle.idempotencyKey && transaction.recoveryIdempotencyKey === recoveryBundle.idempotencyKey) {
          return cloneJson({ id: transaction.recoveryCaseId, status: 'required', reason: transaction.recoveryReason || null });
        }
        const error = new Error(`CORE transaction "${transaction.id}" already has a recovery case`);
        error.code = 'DIRECTIVE_CORE_RECOVERY_ALREADY_REQUIRED';
        throw error;
      }
      const phaseAfter = recoveryBundle.phaseAfter
        || recoveryBundle.phase
        || (recoveryBundle.responseRetry === true || recoveryBundle.retryableResponse === true
          ? 'responseRetryRequired'
          : 'recoveryRequired');
      assertPhaseTransition(transaction.phase, phaseAfter);
      const recoveryCase = {
        id: recoveryBundle.id || `recovery:${transaction.id}`,
        status: recoveryBundle.status || 'required',
        phase: phaseAfter,
        reason: recoveryBundle.reason || null,
        detailsHash: hashStableJson(recoveryBundle)
      };
      const sourceMutation = sanitizeRecoverySourceMutation(recoveryBundle.sourceMutation || {});
      const recallAuxiliaryRewrite = await rewriteRecallAuxiliaryArtifactsForSourceMutation(adapter, {
        state,
        mutation: sourceMutation.recallSourceMutation || null,
        transactionId: transaction.id,
        recoveryCaseId: recoveryCase.id,
        now: timestamp()
      });
      const stateBefore = cloneJson(state);
      const deltaCursor = eventTurnDeltaCursor();
      const revisionsBefore = cloneJson(state.revisions);
      state.updatedAt = timestamp();
      state.revisions = nextRevisions(state.revisions, { runtime: 1 });
      state.counters.recoveries += 1;
      touchTransaction(transaction, {
        phase: phaseAfter,
        recoveryCaseId: recoveryCase.id,
        recoveryReason: recoveryCase.reason || null,
        recoveryIdempotencyKey: recoveryBundle.idempotencyKey || null
      });
      appendEvent('recoveryRequired', transaction, {
        payload: {
          recoveryCase,
          phaseAfter,
          sourceMutation,
          recallAuxiliaryRefs: recallAuxiliaryRewrite?.targetRefs?.length
            ? recallAuxiliaryRewrite.targetRefs.map(sanitizeDiagnostic)
            : undefined,
          recallAuxiliaryRewrite: recallAuxiliaryRewrite
            ? sanitizeDiagnostic(recallAuxiliaryRewrite)
            : undefined,
          repairDecision: sanitizeDiagnostic(recoveryBundle.repairDecision || {}),
          responseRetryPlan: compactResponseRetryPlan(recoveryBundle.responseRetryPlan || {}),
          continuityProjection: compactContinuityRecoveryProjection(recoveryBundle.continuityProjection || {}),
          dependentOutcomeId: recoveryBundle.dependentOutcomeId || null,
          dependentResponseId: recoveryBundle.dependentResponseId || null,
          allowedActions: Array.isArray(recoveryBundle.allowedActions) ? [...recoveryBundle.allowedActions] : []
        },
        revisionsBefore,
        revisionsAfter: state.revisions,
        idempotencyKey: recoveryBundle.idempotencyKey || null
      });
      try {
        await persistEventTurnDelta(deltaCursor, {
          operation: 'markRecoveryRequired',
          transactionId: transaction.id
        });
      } catch (error) {
        restoreState(stateBefore);
        throw error;
      }
      return cloneJson(recoveryCase);
    },
    async recordRollbackActuation(transactionId, rollback = {}) {
      const transaction = requireTransaction(transactionId);
      const idempotencyKey = requireNonEmptyString(rollback.idempotencyKey, 'idempotencyKey');
      const rollbackDecision = rollback.rollbackActuation || {};
      const decisionTransactionId = rollbackDecision.transactionId || rollback.transactionId || null;
      if (!decisionTransactionId) {
        const error = new Error(`CORE rollback actuation transaction id is required for "${transaction.id}"`);
        error.code = 'DIRECTIVE_CORE_ROLLBACK_TRANSACTION_REQUIRED';
        throw error;
      }
      if (decisionTransactionId !== transaction.id) {
        const error = new Error(`CORE rollback actuation transaction mismatch for "${transaction.id}"`);
        error.code = 'DIRECTIVE_CORE_ROLLBACK_TRANSACTION_MISMATCH';
        throw error;
      }
      if (rollbackDecision.authorized !== true || !Number.isFinite(Number(rollbackDecision.restoreRevision))) {
        const error = new Error(`CORE rollback actuation for "${transaction.id}" is not REPAIR-authorized`);
        error.code = 'DIRECTIVE_CORE_ROLLBACK_ACTUATION_UNAUTHORIZED';
        throw error;
      }
      const existingEvent = (state.events || []).find((event) => (
        event?.type === 'rollbackActuationRecorded'
        && legacyTransactionId(event) === transaction.id
        && event.idempotencyKey === idempotencyKey
      ));
      if (existingEvent) {
        const existingRef = eventPayload(existingEvent).rollbackActuationRef || {};
        const requestedRecoveryId = rollback.recoveryCaseId || rollbackDecision.recoveryCaseId || null;
        if (requestedRecoveryId && existingRef.recoveryCaseId && requestedRecoveryId !== existingRef.recoveryCaseId) {
          const error = new Error(`CORE rollback actuation recovery mismatch for "${transaction.id}"`);
          error.code = 'DIRECTIVE_CORE_ROLLBACK_RECOVERY_MISMATCH';
          throw error;
        }
        if (transaction.recoveryCaseId) {
          const error = new Error(`CORE transaction "${transaction.id}" has an active recovery after rollback actuation replay`);
          error.code = 'DIRECTIVE_CORE_ROLLBACK_REPLAY_ACTIVE_RECOVERY';
          throw error;
        }
        return cloneJson({
          id: existingRef.id || `rollback:${transaction.id}`,
          status: 'recorded',
          rollback: existingRef || null
        });
      }
      if (!transaction.recoveryCaseId || transaction.phase !== 'recoveryRequired') {
        const error = new Error(`CORE transaction "${transaction.id}" has no recovery case for rollback actuation`);
        error.code = 'DIRECTIVE_CORE_ROLLBACK_RECOVERY_REQUIRED';
        throw error;
      }
      const requestedRecoveryId = rollback.recoveryCaseId || rollbackDecision.recoveryCaseId || null;
      if (!requestedRecoveryId) {
        const error = new Error(`CORE rollback actuation recovery id is required for "${transaction.id}"`);
        error.code = 'DIRECTIVE_CORE_ROLLBACK_RECOVERY_ID_REQUIRED';
        throw error;
      }
      if (requestedRecoveryId !== transaction.recoveryCaseId) {
        const error = new Error(`CORE rollback actuation recovery mismatch for "${transaction.id}"`);
        error.code = 'DIRECTIVE_CORE_ROLLBACK_RECOVERY_MISMATCH';
        throw error;
      }
      const phaseAfter = assertPhaseTransition(transaction.phase, rollback.phaseAfter || 'settled');
      const stateBefore = cloneJson(state);
      const deltaCursor = eventTurnDeltaCursor();
      const revisionsBefore = cloneJson(state.revisions);
      state.updatedAt = timestamp();
      state.revisions = nextRevisions(state.revisions, { runtime: 1 });
      const rollbackActuationRef = compactRollbackActuationRef({
        ...rollback,
        recoveryCaseId: rollback.recoveryCaseId || transaction.recoveryCaseId || null
      }, {
        transaction,
        idempotencyKey,
        occurredAt: state.updatedAt
      });
      touchTransaction(transaction, {
        phase: phaseAfter,
        recoveryCaseId: null,
        recoveryReason: null,
        rollbackActuations: [
          ...(transaction.rollbackActuations || []),
          rollbackActuationRef
        ],
        rollbackActuationIdempotencyKeys: uniqueStrings([
          ...(transaction.rollbackActuationIdempotencyKeys || []),
          idempotencyKey
        ])
      });
      appendEvent('rollbackActuationRecorded', transaction, {
        payload: {
          rollbackActuationRef,
          phaseAfter
        },
        revisionsBefore,
        revisionsAfter: state.revisions,
        idempotencyKey
      });
      try {
        await persistEventTurnDelta(deltaCursor, {
          operation: 'recordRollbackActuation',
          transactionId: transaction.id
        });
      } catch (error) {
        restoreState(stateBefore);
        throw error;
      }
      return cloneJson({
        id: rollbackActuationRef.id || `rollback:${transaction.id}`,
        status: 'recorded',
        rollback: rollbackActuationRef
      });
    },
    async commitBackgroundBatch(transactionId, operationBundle = {}) {
      const transaction = requireTransaction(transactionId);
      const batchId = operationBundle.batchId || `background:${transaction.id}`;
      const idempotencyKey = operationBundle.idempotencyKey || null;
      const existingBackgroundEvent = (state.events || []).find((event) => {
        if (event?.type !== 'backgroundBatchCommitted') return false;
        if (legacyTransactionId(event) !== transaction.id) return false;
        const bundle = eventPayload(event).operationBundle || {};
        if (idempotencyKey && event.idempotencyKey === idempotencyKey) return true;
        return batchId && bundle.batchId === batchId;
      });
      if (existingBackgroundEvent) {
        if (idempotencyKey && existingBackgroundEvent.idempotencyKey === idempotencyKey) return cloneJson(transaction);
        const error = new Error(`CORE transaction "${transaction.id}" already has background batch "${batchId}"`);
        error.code = 'DIRECTIVE_CORE_BACKGROUND_BATCH_DUPLICATE';
        throw error;
      }
      if (Number.isFinite(Number(operationBundle.baseMechanicsRevision)) && Number(operationBundle.baseMechanicsRevision) !== state.revisions.mechanics) {
        const error = new Error(`Stale CORE background base revision for "${transaction.id}"`);
        error.code = 'DIRECTIVE_CORE_STALE_MECHANICS_REVISION';
        error.details = { expected: state.revisions.mechanics, actual: Number(operationBundle.baseMechanicsRevision) };
        throw error;
      }
      const hasOperations = Array.isArray(operationBundle.operations) && operationBundle.operations.length > 0;
      const hasPromptDirty = Array.isArray(operationBundle.promptDirtyDomains) && operationBundle.promptDirtyDomains.length > 0;
      const phaseAfter = operationBundle.phaseAfter
        ? assertPhaseTransition(transaction.phase, operationBundle.phaseAfter)
        : assertPhaseTransition(transaction.phase, 'backgroundSettling');
      const recallEntries = collectRecallEntriesFromOperationBundle(operationBundle);
      const recallAuxiliaryRefs = await writeCoreRecallIndexAuxiliarySegments(adapter, {
        campaignId: state.campaignId,
        saveId: state.saveId,
        branchId: state.branchId,
        transactionId: transaction.id,
        batchId,
        entries: recallEntries,
        createdAt: timestamp(),
        source: 'core-background-batch'
      });
      const operationBundleForEvent = {
        ...operationBundle,
        recallEntries: undefined,
        recallAuxiliaryRefs: recallAuxiliaryRefs.length > 0
          ? [
            ...(Array.isArray(operationBundle.recallAuxiliaryRefs) ? operationBundle.recallAuxiliaryRefs : []),
            ...recallAuxiliaryRefs
          ]
          : operationBundle.recallAuxiliaryRefs
      };
      const deltaCursor = eventTurnDeltaCursor();
      const revisionsBefore = cloneJson(state.revisions);
      state.updatedAt = timestamp();
      state.revisions = nextRevisions(state.revisions, {
        mechanics: hasOperations ? 1 : 0,
        runtime: 1
      });
      if (hasPromptDirty) state.promptDirtyDomains.push(...operationBundle.promptDirtyDomains);
      state.counters.backgrounds += 1;
      const bundleRef = operationBundleRef({
        ...operationBundleForEvent,
        batchId
      });
      const backgroundRef = backgroundBatchRefFromBundle(bundleRef, {
        idempotencyKey,
        occurredAt: state.updatedAt
      });
      touchTransaction(transaction, {
        phase: phaseAfter,
        backgroundBatchId: transaction.backgroundBatchId || batchId,
        backgroundBatchIds: uniqueStrings([
          ...(transaction.backgroundBatchIds || []),
          batchId
        ]),
        backgroundBatches: [
          ...(transaction.backgroundBatches || []),
          backgroundRef
        ],
        backgroundIdempotencyKey: idempotencyKey || transaction.backgroundIdempotencyKey || null,
        backgroundIdempotencyKeys: uniqueStrings([
          ...(transaction.backgroundIdempotencyKeys || []),
          idempotencyKey
        ])
      });
      appendEvent('backgroundBatchCommitted', transaction, {
        payload: {
          operationBundle: bundleRef,
          phaseAfter
        },
        revisionsBefore,
        revisionsAfter: state.revisions,
        idempotencyKey
      });
      await persistEventTurnDelta(deltaCursor, {
        operation: 'commitBackgroundBatch',
        transactionId: transaction.id,
        batchId
      });
      return cloneJson(transaction);
    },
    async appendDiagnostics(transactionId, diagnosticsEvent = {}) {
      const diagnostics = await appendDiagnosticsBatchImpl(transactionId, [diagnosticsEvent]);
      return cloneJson(diagnostics[0] || null);
    },
    async appendDiagnosticsBatch(transactionId, diagnosticsEvents = []) {
      return appendDiagnosticsBatchImpl(transactionId, diagnosticsEvents);
    },
    estimateSize() {
      return stableJsonByteLength(buildHead(state));
    }
  };
}
