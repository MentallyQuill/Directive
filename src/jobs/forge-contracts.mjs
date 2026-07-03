import {
  createTurnSourceFrameRef
} from '../runtime/architecture-redesign-contracts.mjs';
import {
  hashStableJson,
  redactExternalDiagnostic
} from '../runtime/architecture-redesign-contracts.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compactObject(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function asString(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function asInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const out = [];
  for (const value of Array.isArray(values) ? values : [values]) {
    const text = asString(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

const RAW_KEY_PATTERN = /(?:raw|body|prompt|provider|transcript|summaryception|memoryBook|vectorPayload|embedding|secret|api[_-]?key|password|token|qdrant)/i;

function rootOf(path = '') {
  return String(path || '').split('.')[0] || null;
}

function sanitizeDiagnostic(value = {}) {
  const redactions = [];
  const payload = redactExternalDiagnostic(value, redactions);
  return { payload, redactions };
}

function safeEffectRef(value = null) {
  if (!value || typeof value !== 'object') return null;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (RAW_KEY_PATTERN.test(key)) continue;
    if (item === undefined) continue;
    if (Array.isArray(item)) out[key] = uniqueStrings(item);
    else if (item && typeof item === 'object') out[key] = safeEffectRef(item) || undefined;
    else out[key] = item;
  }
  const safe = compactObject(out);
  const kind = asString(safe.kind || safe.type, 'directive.forgeEffectRef.v1');
  const hash = asString(safe.hash) || hashStableJson(safe);
  return compactObject({
    ...safe,
    kind,
    status: asString(safe.status),
    hash
  });
}

function deriveScenePhaseSealRefs(effectRefs = []) {
  return effectRefs.filter((ref) => asString(ref.kind || ref.type, '').includes('scenePhaseSealRef'));
}

function deriveRecallEntryRefs(effectRefs = []) {
  return effectRefs.filter((ref) => asString(ref.kind || ref.type, '').includes('recallIndexEntryRef'));
}

function derivePressureArcDigestRefs(effectRefs = []) {
  return effectRefs.filter((ref) => asString(ref.kind || ref.type, '').includes('pressureArcDigestRef'));
}

function sceneSealRevision(refs = []) {
  return refs.length ? hashStableJson(refs.map((ref) => ({
    id: ref.id || null,
    hash: ref.hash || null,
    sourceFrameId: ref.sourceFrameId || null,
    sceneSealId: ref.sceneSealId || null
  }))) : null;
}

function pressureArcDigestRevision(refs = []) {
  return refs.length ? hashStableJson(refs.map((ref) => ({
    id: ref.id || null,
    hash: ref.hash || null,
    sourceFrameId: ref.sourceFrameId || null,
    pressureArcDigestId: ref.pressureArcDigestId || null
  }))) : null;
}

function recallIndexRevision(refs = []) {
  return refs.length ? hashStableJson(refs.map((ref) => ({
    id: ref.id || null,
    hash: ref.hash || null,
    sceneSealId: ref.sceneSealId || null,
    pressureArcDigestId: ref.pressureArcDigestId || null,
    sourceFrameId: ref.sourceFrameId || null
  }))) : null;
}

export function normalizeForgeWorkerDescriptor(worker = {}) {
  const workerId = asString(worker.workerId || worker.id);
  return compactObject({
    kind: 'directive.forgeWorkerDescriptor.v1',
    schemaVersion: 1,
    workerId,
    roleId: asString(worker.roleId || worker.role || workerId),
    lane: asString(worker.lane, 'background'),
    timeoutMs: asInteger(worker.timeoutMs, 0),
    allowedRoots: uniqueStrings(worker.allowedRoots),
    mayProposeState: worker.mayProposeState !== false,
    diagnosticsOnly: worker.diagnosticsOnly === true
  });
}

export function normalizeForgeRunRequest(input = {}) {
  const sourceFrameRef = input.sourceFrameRef
    || createTurnSourceFrameRef(input.sourceFrame || {});
  const workerPlan = (Array.isArray(input.workerPlan) ? input.workerPlan : input.workers || [])
    .map(normalizeForgeWorkerDescriptor);
  const transactionId = asString(input.transactionId);
  return compactObject({
    kind: 'directive.forgeRunRequest.v1',
    schemaVersion: 1,
    transactionId,
    sourceToken: asString(input.sourceToken || input.sourceFrame?.sourceToken),
    sourceFrameRef,
    committedOutcomeId: asString(input.committedOutcomeId),
    hostContinuationId: asString(input.hostContinuationId),
    baseRevisions: cloneJson(input.baseRevisions || {}),
    idempotencyKey: asString(input.idempotencyKey) || `forge:${transactionId || 'no-transaction'}:${asString(input.sourceToken || sourceFrameRef?.id, 'source')}`,
    workerPlan
  });
}

function normalizeOperation(operation = {}, worker = {}) {
  const path = asString(operation.path);
  const domain = asString(operation.domain || operation.root || rootOf(path));
  const op = asString(operation.op || operation.operation);
  if (!path || !domain || !op) return null;
  const allowedRoots = Array.isArray(worker.allowedRoots) ? worker.allowedRoots : [];
  if (allowedRoots.length && !allowedRoots.includes(domain)) {
    return {
      rejected: true,
      reason: 'forbidden-root',
      path,
      domain,
      workerId: worker.workerId || worker.id || null
    };
  }
  return compactObject({
    domain,
    op,
    path,
    summary: asString(operation.summary),
    valueHash: operation.value === undefined ? asString(operation.valueHash) : hashStableJson(operation.value),
    workerId: asString(worker.workerId || worker.id)
  });
}

export function normalizeForgeWorkerResult(worker = {}, result = {}) {
  const descriptor = normalizeForgeWorkerDescriptor(worker);
  const operations = [];
  const rejectedOperations = [];
  for (const operation of Array.isArray(result.operations) ? result.operations : []) {
    const normalized = normalizeOperation(operation, descriptor);
    if (!normalized) continue;
    if (normalized.rejected) rejectedOperations.push(normalized);
    else operations.push(normalized);
  }
  const effectRefs = (Array.isArray(result.effectRefs) ? result.effectRefs : [])
    .map(safeEffectRef)
    .filter((effect) => effect?.id || effect?.hash);
  const diagnostics = sanitizeDiagnostic({
    ...(result.diagnostics || {}),
    rawPrompt: result.rawPrompt,
    rawResponse: result.rawResponse,
    rawPromptBody: result.rawPromptBody,
    rawProviderOutput: result.providerOutput,
    externalContextOutputs: result.externalContextOutputs
  });
  return {
    kind: 'directive.forgeWorkerResult.v1',
    schemaVersion: 1,
    workerId: descriptor.workerId,
    roleId: descriptor.roleId,
    lane: descriptor.lane,
    status: asString(result.status, rejectedOperations.length ? 'partial' : 'accepted'),
    operations,
    rejectedOperations,
    effectRefs,
    promptDirtyDomains: uniqueStrings(result.promptDirtyDomains || operations.map((operation) => operation.domain)),
    inputHash: asString(result.inputHash),
    outputHash: asString(result.outputHash) || hashStableJson({
      operations,
      effectRefs,
      status: result.status || null
    }),
    diagnostics: diagnostics.payload,
    redactions: diagnostics.redactions
  };
}

export function findForgePathConflict(workerResults = []) {
  const seen = new Map();
  for (const result of Array.isArray(workerResults) ? workerResults : []) {
    for (const operation of result.operations || []) {
      const path = operation.path;
      if (!path) continue;
      if (seen.has(path)) {
        return {
          path,
          firstWorkerId: seen.get(path),
          secondWorkerId: result.workerId
        };
      }
      seen.set(path, result.workerId);
    }
  }
  return null;
}

export function createForgeBatchCommit(input = {}) {
  const workerResults = Array.isArray(input.workerResults) ? input.workerResults : [];
  const operations = workerResults.flatMap((result) => result.operations || []);
  const effectRefs = workerResults
    .flatMap((result) => result.effectRefs || [])
    .map(safeEffectRef)
    .filter((effect) => effect?.id || effect?.hash);
  const scenePhaseSealRefs = deriveScenePhaseSealRefs(effectRefs);
  const recallIndexEntryRefs = deriveRecallEntryRefs(effectRefs);
  const recallEntries = workerResults.flatMap((result) => Array.isArray(result.recallEntries) ? result.recallEntries : []);
  const pressureArcDigestRefs = derivePressureArcDigestRefs(effectRefs);
  const recallRevisions = compactObject({
    recallIndexRevision: asString(input.recallRevisions?.recallIndexRevision) || recallIndexRevision(recallIndexEntryRefs),
    sceneSealRevision: asString(input.recallRevisions?.sceneSealRevision) || sceneSealRevision(scenePhaseSealRefs),
    pressureArcDigestRevision: asString(input.recallRevisions?.pressureArcDigestRevision) || pressureArcDigestRevision(pressureArcDigestRefs)
  });
  const promptDirtyDomains = uniqueStrings([
    ...(input.promptDirtyDomains || []),
    ...workerResults.flatMap((result) => result.promptDirtyDomains || [])
  ]);
  const sourceFrameRef = input.sourceFrameRef || createTurnSourceFrameRef(input.sourceFrame || {});
  const computedAcceptedBatchHash = workerResults.length ? hashStableJson(workerResults) : null;
  const suppliedAcceptedBatchHash = asString(input.acceptedBatchHash || input.workerResultsHash);
  if (computedAcceptedBatchHash && suppliedAcceptedBatchHash && computedAcceptedBatchHash !== suppliedAcceptedBatchHash) {
    const error = new Error('FORGE accepted batch hash does not match worker results.');
    error.code = 'DIRECTIVE_FORGE_ACCEPTED_BATCH_HASH_MISMATCH';
    error.details = {
      suppliedAcceptedBatchHash,
      computedAcceptedBatchHash
    };
    throw error;
  }
  const acceptedBatchHash = computedAcceptedBatchHash || suppliedAcceptedBatchHash;
  return compactObject({
    kind: 'directive.forgeBatchCommit.v1',
    schemaVersion: 1,
    batchId: asString(input.batchId) || `forge:${asString(input.transactionId, 'no-transaction')}`,
    transactionId: asString(input.transactionId),
    idempotencyKey: asString(input.idempotencyKey),
    acceptedBatchHash,
    sourceToken: asString(input.sourceToken || input.sourceFrame?.sourceToken),
    sourceFrameRef,
    baseMechanicsRevision: input.baseRevisions?.mechanics ?? input.baseMechanicsRevision,
    operations,
    effectRefs,
    backgroundEffectRefs: effectRefs,
    scenePhaseSealRefs,
    pressureArcDigestRefs,
    recallIndexEntryRefs,
    recallEntries,
    recallRevisions,
    promptDirtyDomains,
    workers: workerResults.map((result) => ({
      workerId: result.workerId,
      status: result.status,
      operationCount: (result.operations || []).length,
      effectCount: (result.effectRefs || []).length,
      rejectedOperationCount: (result.rejectedOperations || []).length
    })),
    operationBundleHash: hashStableJson({
      operations,
      effectRefs,
      recallRevisions,
      promptDirtyDomains,
      sourceFrameRef,
      acceptedBatchHash
    })
  });
}
