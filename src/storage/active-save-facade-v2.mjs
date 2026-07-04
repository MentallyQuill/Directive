import {
  createCampaignSaveMetadata
} from './save-records.mjs';
import {
  commitV2SaveLayout,
  loadV2SaveManifest,
  readV2ArtifactRef
} from './transaction-store-v2.mjs';
import {
  hashStableJson,
  stableJsonByteLength
} from '../runtime/architecture-redesign-contracts.mjs';
import {
  markCampaignSaveRuntimeV2State,
  storeCampaignV2SaveManifestIndexEntry
} from './directive-storage-repository.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export const ACTIVE_RUNTIME_HEAD_MAX_BYTES = 384 * 1024;
const ACTIVE_HEAD_COMMAND_LOG_RECENT_LIMIT = 32;
const ACTIVE_HEAD_TEXT_PREVIEW_LIMIT = 240;
const ACTIVE_HEAD_LIST_PREVIEW_LIMIT = 4;

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

function compactString(value = null) {
  const text = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  return text || null;
}

function projectionKeySet(entry = {}, keys = []) {
  return new Set(keys
    .flatMap((key) => {
      if (Array.isArray(key)) {
        const parts = key.map((part) => compactString(entry?.[part])).filter(Boolean);
        return parts.length === key.length ? [parts.join(':')] : [];
      }
      return [compactString(entry?.[key])].filter(Boolean);
    }));
}

function isTaggedCompatibilityProjectionRow(row = {}) {
  const authority = compactString(row.authority);
  if (!authority) return false;
  if (authority === 'compatibilityProjectionUnavailable') return false;
  return Boolean(row.compatibilityMirror || compactString(row.projectionSource) === 'coreStoreV2');
}

function corePreferredRows(coreRows = null, legacyRows = [], keys = [], {
  authoritative = false,
  requireTaggedLegacyWithCore = false
} = {}) {
  if (!Array.isArray(coreRows)) return legacyRows;
  if (authoritative) return coreRows;
  const fallbackRows = requireTaggedLegacyWithCore
    ? legacyRows.filter((legacyRow) => isTaggedCompatibilityProjectionRow(legacyRow))
    : legacyRows;
  const coreKeySets = coreRows.map((row) => projectionKeySet(row, keys));
  const usedCoreIndexes = new Set();
  const merged = fallbackRows.map((legacyRow) => {
    const legacyKeys = projectionKeySet(legacyRow, keys);
    const matchingCoreIndex = coreKeySets.findIndex((coreKeys, index) => (
      !usedCoreIndexes.has(index)
      && [...legacyKeys].some((key) => coreKeys.has(key))
    ));
    if (matchingCoreIndex < 0) return legacyRow;
    usedCoreIndexes.add(matchingCoreIndex);
    return coreRows[matchingCoreIndex];
  });
  coreRows.forEach((row, index) => {
    if (!usedCoreIndexes.has(index)) merged.push(row);
  });
  return merged;
}

function transactionEvidence(entry = {}) {
  const transactionId = compactString(entry.transactionId || entry.coreTransactionId);
  const coreTransactionId = compactString(entry.coreTransactionId || entry.transactionId);
  return compact({
    transactionId,
    coreTransactionId,
    sourceFrameId: compactString(entry.sourceFrameId)
  });
}

function runtimeBridgeProjectionSource(entry = {}) {
  return compactString(entry.projectionSource)
    || (compactString(entry.coreTransactionId || entry.transactionId)
      ? 'coreStoreV2'
      : 'runtimeBridgeV2');
}

function runtimeBridgeAuthorityFields(kind, entry = {}) {
  const projectionSource = runtimeBridgeProjectionSource(entry);
  const authority = compactString(entry.authority)
    || (projectionSource === 'coreStoreV2' ? 'compatibilityProjection' : 'compatibilityProjectionUnavailable');
  const rowKind = kind === 'ingress'
    ? 'directive.coreIngressCompatibilityMirror.v1'
    : (kind === 'recovery'
        ? 'directive.coreRecoveryCompatibilityMirror.v1'
        : 'directive.coreResponseCompatibilityMirror.v1');
  return {
    authority,
    projectionSource,
    compatibilityMirror: entry.compatibilityMirror
      ? cloneJson(entry.compatibilityMirror)
      : compact({
          kind: rowKind,
          status: authority === 'compatibilityProjectionUnavailable' ? 'runtimeBridgeProjection' : 'coreProjection',
          transactionId: entry.transactionId || entry.coreTransactionId || null,
          ingressId: kind === 'ingress' ? (entry.ingressId || entry.id || null) : undefined,
          responseId: kind === 'response' ? (entry.responseId || entry.id || null) : undefined,
          recoveryId: kind === 'recovery' ? (entry.recoveryId || entry.id || null) : undefined,
          projectionSource
        })
  };
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
        createdAt: revision?.createdAt || null
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

function responseProjectionKeys(entry = {}) {
  const tuple = [entry.turnId, entry.outcomeId, entry.responseKind]
    .map(compactString)
    .filter(Boolean);
  return [
    compactString(entry.transactionId || entry.coreTransactionId),
    tuple.length === 3 ? tuple.join(':') : null,
    compactString(entry.id || entry.responseId)
  ].filter(Boolean);
}

function compactRecoveryEvidence(entry = {}) {
  return compact({
    kind: 'directive.coreEvent.v1',
    schemaVersion: 1,
    type: 'runtimeRecoveryProjected',
    recoveryId: entry.id || entry.recoveryId || null,
    hostMessageId: entry.hostMessageId || null,
    turnId: entry.turnId || null,
    outcomeId: entry.outcomeId || null,
    status: entry.status || null,
    recoveryKind: entry.recoveryKind || entry.kind || null,
    reasonCode: entry.reasonCode || entry.code || null,
    ...transactionEvidence(entry)
  });
}

function compactOutcomeRerunRepairDecision(value = {}) {
  if (!isObject(value)) return undefined;
  return compact({
    kind: value.kind || 'directive.repairOutcomeRerunActuationDecision.v1',
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
    branchCandidateRequired: value.branchCandidateRequired === true,
    mechanicsRerunAuthorized: value.mechanicsRerunAuthorized === true,
    replacementTransactionRequired: value.replacementTransactionRequired === true,
    coreTransactionRequired: value.coreTransactionRequired === true,
    normalTurnAllowed: value.normalTurnAllowed === true,
    observedAt: value.observedAt || null
  });
}

function compactOutcomeReplacementRef(value = {}) {
  if (!isObject(value)) return undefined;
  return compact({
    kind: value.kind || 'directive.coreOutcomeReplacementRef.v1',
    schemaVersion: value.schemaVersion || 1,
    transactionId: value.transactionId || value.coreTransactionId || null,
    replacedTransactionId: value.replacedTransactionId || null,
    replacementTransactionId: value.replacementTransactionId || value.transactionId || value.coreTransactionId || null,
    type: value.type || value.replacementType || 'rerunOutcome',
    replacedOutcomeId: value.replacedOutcomeId || value.outcomeId || null,
    replacementOutcomeId: value.replacementOutcomeId || null,
    replacedTurnId: value.replacedTurnId || null,
    replacementTurnId: value.replacementTurnId || null,
    idempotencyKey: value.idempotencyKey || null,
    acceptedAt: value.acceptedAt || value.occurredAt || null,
    repairDecision: compactOutcomeRerunRepairDecision(value.repairDecision)
  });
}

function runtimeRecoveryLedgerFromEvents(entries = []) {
  return entries
    .filter((entry) => entry?.type === 'runtimeRecoveryProjected')
    .map((entry) => compact({
      id: entry.recoveryId || null,
      hostMessageId: entry.hostMessageId || null,
      turnId: entry.turnId || null,
      outcomeId: entry.outcomeId || null,
      status: entry.status || null,
      recoveryKind: entry.recoveryKind || null,
      reasonCode: entry.reasonCode || null,
      ...transactionEvidence(entry),
      ...runtimeBridgeAuthorityFields('recovery', entry)
    }));
}

function modelCallJournalFromDiagnosticsSegments(diagnosticsSegments = []) {
  const entries = diagnosticsSegments.flatMap((segment) => (
    Array.isArray(segment?.entries) ? segment.entries : []
  ));
  const rows = entries
    .filter((entry) => entry?.type === 'runtimeModelCallProjected')
    .map((entry) => compact({
      id: entry.modelCallId || null,
      roleId: entry.roleId || null,
      providerKind: entry.providerKind || null,
      providerId: entry.providerId || null,
      model: entry.model || null,
      status: entry.status || null,
      requestHash: entry.requestHash || null,
      parseStatus: entry.parseStatus || null,
      validationStatus: entry.validationStatus || null,
      appliedStatus: entry.appliedStatus || null,
      latencyMs: entry.latencyMs ?? undefined,
      retryable: entry.retryable === true ? true : undefined,
      errorCode: entry.errorCode || null,
      recordedAt: entry.recordedAt || null,
      campaignRevision: Number.isFinite(Number(entry.campaignRevision)) ? Number(entry.campaignRevision) : undefined,
      ...transactionEvidence(entry)
    }));
  const order = [];
  const byId = new Map();
  for (const row of rows) {
    if (!row.id) {
      order.push(row);
      continue;
    }
    if (!byId.has(row.id)) order.push(row.id);
    byId.set(row.id, row);
  }
  return order.map((item) => (typeof item === 'string' ? byId.get(item) : item));
}

function sidecarJournalProjectionKey(row = {}) {
  if (row.type === 'coreBackgroundBatch') {
    const key = row.backgroundBatchId || row.batchId || row.acceptedBatchHash || row.id;
    return key ? `background:${key}` : null;
  }
  const key = row.id
    || [row.transactionId, row.workerKey, row.acceptedBatchHash].map(compactString).filter(Boolean).join(':');
  return key ? `sidecar:${key}` : null;
}

function sidecarJournalFromDiagnosticsSegments(diagnosticsSegments = []) {
  const entries = diagnosticsSegments.flatMap((segment) => (
    Array.isArray(segment?.entries) ? segment.entries : []
  ));
  const rows = [
    ...entries
      .filter((entry) => entry?.type === 'runtimeSidecarDiagnosticProjected')
      .map((entry) => compact({
        id: entry.sidecarId || null,
        type: 'coreSidecarDiagnostic',
        projectionType: entry.type,
        workerKey: entry.workerKey || null,
        workerId: entry.workerId || null,
        roleId: entry.roleId || null,
        providerOwner: entry.providerOwner || null,
        providerKind: entry.providerKind || null,
        model: entry.model || null,
        status: entry.status || null,
        batchId: entry.batchId || null,
        acceptedBatchHash: entry.acceptedBatchHash || null,
        operationCount: compactNumber(entry.operationCount),
        effectCount: compactNumber(entry.effectCount),
        workerCount: compactNumber(entry.workerCount),
        workerKeys: Array.isArray(entry.workerKeys) ? cloneJson(entry.workerKeys) : undefined,
        dirtyDomains: Array.isArray(entry.dirtyDomains) ? cloneJson(entry.dirtyDomains) : undefined,
        observedAt: entry.observedAt || null,
        recordedAt: entry.recordedAt || null,
        sourceTokenHash: entry.sourceTokenHash || null,
        ...transactionEvidence(entry)
      })),
    ...entries
      .filter((entry) => entry?.type === 'runtimeBackgroundBatchProjected')
      .map((entry) => compact({
        id: entry.backgroundBatchId || entry.batchId || null,
        type: 'coreBackgroundBatch',
        projectionType: entry.type,
        backgroundBatchId: entry.backgroundBatchId || null,
        batchId: entry.batchId || null,
        idempotencyKey: entry.idempotencyKey || null,
        outcomeId: entry.outcomeId || null,
        status: entry.status || null,
        acceptedBatchHash: entry.acceptedBatchHash || null,
        reviewHash: entry.reviewHash || null,
        operationCount: compactNumber(entry.operationCount),
        effectCount: compactNumber(entry.effectCount),
        workerCount: compactNumber(entry.workerCount),
        workerKeys: Array.isArray(entry.workerKeys) ? cloneJson(entry.workerKeys) : undefined,
        dirtyDomains: Array.isArray(entry.dirtyDomains) ? cloneJson(entry.dirtyDomains) : undefined,
        occurredAt: entry.occurredAt || null,
        forgeBatchRef: compactForgeBatchEvidence(entry.forgeBatchRef),
        ...transactionEvidence(entry)
      }))
  ];
  const order = [];
  const byKey = new Map();
  for (const row of rows) {
    const key = sidecarJournalProjectionKey(row);
    if (!key) {
      order.push(row);
      continue;
    }
    if (!byKey.has(key)) order.push(key);
    byKey.set(key, row);
  }
  return order.map((item) => (typeof item === 'string' ? byKey.get(item) : item));
}

function commandBearingEvidenceFromDiagnosticsSegments(diagnosticsSegments = []) {
  const entries = diagnosticsSegments.flatMap((segment) => (
    Array.isArray(segment?.entries) ? segment.entries : []
  ));
  return entries
    .filter((entry) => entry?.type === 'runtimeCommandBearingEvidenceProjected')
    .map((entry) => compact({
      kind: 'directive.commandBearingEvidenceProjection.v1',
      evidenceId: entry.evidenceId || null,
      transactionId: entry.transactionId || null,
      batchId: entry.batchId || null,
      sourceFrameId: entry.sourceFrameId || null,
      sourceOutcomeId: entry.sourceOutcomeId || null,
      primarySignal: entry.primarySignal || null,
      trackSignals: Array.isArray(entry.trackSignals) ? cloneJson(entry.trackSignals) : undefined,
      strength: entry.strength || null,
      status: entry.status || null,
      evidenceHash: entry.evidenceHash || null,
      acceptedBatchHash: entry.acceptedBatchHash || null,
      occurredAt: entry.occurredAt || null
    }));
}

function mergeResponseProjectionRows(rows = []) {
  const merged = [];
  const byKey = new Map();
  for (const row of rows) {
    const keysForRow = responseProjectionKeys(row);
    const existingIndex = keysForRow
      .map((key) => byKey.get(key))
      .find((index) => Number.isInteger(index));
    if (!Number.isInteger(existingIndex)) {
      const nextIndex = merged.length;
      merged.push(row);
      for (const key of keysForRow) byKey.set(key, nextIndex);
      continue;
    }
    const prior = merged[existingIndex];
    const priorRank = outcomeIntegrityRank(prior);
    const nextRank = outcomeIntegrityRank(row);
    merged[existingIndex] = compact({
      ...prior,
      ...row,
      outcomeIntegrity: nextRank >= priorRank
        ? compactOutcomeIntegrityEvidence(row.outcomeIntegrity || prior.outcomeIntegrity)
        : compactOutcomeIntegrityEvidence(prior.outcomeIntegrity || row.outcomeIntegrity)
    });
    for (const key of responseProjectionKeys(merged[existingIndex])) byKey.set(key, existingIndex);
  }
  return merged;
}

function compactText(value = '', limit = ACTIVE_HEAD_TEXT_PREVIEW_LIMIT) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return text.length > limit ? `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}...` : text;
}

function compactTextList(values = [], limit = ACTIVE_HEAD_LIST_PREVIEW_LIMIT) {
  const source = Array.isArray(values) ? values : [values];
  return source
    .slice(0, limit)
    .map((value) => compactText(value))
    .filter(Boolean);
}

function compactReplacementTextEvidence(entry = {}) {
  const hasRawReplacementText = Object.prototype.hasOwnProperty.call(entry, 'replacementText');
  const rawReplacementText = hasRawReplacementText ? String(entry.replacementText ?? '') : '';
  return compact({
    replacementTextPresent: entry.replacementTextPresent ?? (hasRawReplacementText ? Boolean(rawReplacementText) : undefined),
    replacementTextHash: entry.replacementTextHash ?? (rawReplacementText ? hashStableJson({ text: rawReplacementText }) : undefined),
    replacementTextLength: entry.replacementTextLength ?? (hasRawReplacementText ? rawReplacementText.length : undefined)
  });
}

function modelCallRows(campaignState = {}) {
  const coreRows = projectedCoreArray(campaignState, 'modelCallDiagnostics');
  if (Array.isArray(coreRows)) return coreRows;
  return runtimeCollection(campaignState, 'modelCallJournal');
}

function compactNumber(value) {
  if (value === null || value === undefined || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function compactIdentifierList(values = [], limit = 12) {
  const source = Array.isArray(values) ? values : [values];
  const unique = [];
  const seen = new Set();
  for (const value of source) {
    const text = compactString(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    unique.push(text);
    if (unique.length >= limit) break;
  }
  return unique;
}

function compactSidecarWorkerAlias(entry = {}) {
  const direct = compactString(entry.workerKey || entry.sidecarType || entry.workerType || entry.workerRole);
  if (direct) return direct;
  if (typeof entry.worker === 'string') return compactString(entry.worker);
  if (isObject(entry.worker)) {
    return compactString(entry.worker.workerKey || entry.worker.key || entry.worker.id || entry.worker.type || entry.worker.name);
  }
  return compactString(entry.roleId);
}

function compactSidecarWorkerId(entry = {}) {
  const direct = compactString(entry.workerId);
  if (direct) return direct;
  if (isObject(entry.worker)) return compactString(entry.worker.id || entry.worker.workerId);
  return null;
}

function compactModelCallEvidence(entry = {}, index = 0) {
  return compact({
    kind: 'directive.coreDiagnostic.v1',
    schemaVersion: 1,
    id: `runtime-model-call-${index + 1}`,
    type: 'runtimeModelCallProjected',
    modelCallId: entry.id || null,
    roleId: entry.roleId || null,
    providerKind: entry.providerKind || null,
    providerId: entry.providerId || null,
    model: entry.model || null,
    status: entry.status || null,
    requestHash: entry.requestHash || null,
    parseStatus: entry.parseStatus || null,
    validationStatus: entry.validationStatus || null,
    appliedStatus: entry.appliedStatus || null,
    latencyMs: entry.latencyMs ?? undefined,
    retryable: entry.retryable === true ? true : undefined,
    errorCode: entry.errorCode || null,
    recordedAt: entry.recordedAt || null,
    campaignRevision: Number.isFinite(Number(entry.campaignRevision)) ? Number(entry.campaignRevision) : undefined,
    ...transactionEvidence(entry)
  });
}

function compactForgeBatchEvidence(ref = null) {
  if (!isObject(ref)) return undefined;
  return compact({
    kind: ref.kind || null,
    batchId: ref.batchId || null,
    operationBundleHash: ref.operationBundleHash || null,
    acceptedBatchHash: ref.acceptedBatchHash || null,
    reviewHash: ref.reviewHash || null,
    workerCount: compactNumber(ref.workerCount),
    operationCount: compactNumber(ref.operationCount),
    reviewCount: compactNumber(ref.reviewCount),
    stateRevision: compactNumber(ref.stateRevision)
  });
}

function compactSidecarDiagnosticEvidence(entry = {}, index = 0) {
  const workerKey = compactSidecarWorkerAlias(entry);
  const workerId = compactSidecarWorkerId(entry);
  const dirtyDomains = compactIdentifierList(entry.dirtyDomains || entry.promptDirtyDomains || []);
  const workerKeys = compactIdentifierList(entry.workerKeys || (workerKey ? [workerKey] : []));
  const acceptedBatchHash = entry.acceptedBatchHash
    || entry.forgeSettlement?.acceptedBatchHash
    || entry.forgeBatchRef?.acceptedBatchHash
    || null;
  return compact({
    kind: 'directive.coreDiagnostic.v1',
    schemaVersion: 1,
    id: `runtime-sidecar-${index + 1}`,
    type: 'runtimeSidecarDiagnosticProjected',
    sidecarId: entry.sidecarId || entry.id || null,
    workerKey,
    workerId,
    roleId: entry.roleId || null,
    providerOwner: entry.providerOwner || null,
    providerKind: entry.providerKind || null,
    model: entry.model || null,
    status: entry.status || null,
    batchId: entry.batchId || entry.forgeBatchRef?.batchId || null,
    acceptedBatchHash,
    operationCount: compactNumber(entry.operationCount),
    effectCount: compactNumber(entry.effectCount),
    workerCount: compactNumber(entry.workerCount),
    workerKeys: workerKeys.length ? workerKeys : undefined,
    dirtyDomains: dirtyDomains.length ? dirtyDomains : undefined,
    observedAt: entry.observedAt || null,
    recordedAt: entry.recordedAt || entry.observedAt || entry.createdAt || null,
    sourceTokenHash: entry.sourceToken ? hashStableJson(String(entry.sourceToken)).slice(0, 16) : undefined,
    ...transactionEvidence(entry)
  });
}

function compactBackgroundBatchEvidence(entry = {}, index = 0) {
  const forgeBatchRef = compactForgeBatchEvidence(entry.forgeBatchRef || entry.batchRef || null);
  const dirtyDomains = compactIdentifierList(entry.dirtyDomains || entry.promptDirtyDomains || []);
  const workerKeys = compactIdentifierList(entry.workerKeys || []);
  const acceptedBatchHash = entry.acceptedBatchHash
    || forgeBatchRef?.acceptedBatchHash
    || entry.batchRef?.acceptedBatchHash
    || null;
  return compact({
    kind: 'directive.coreDiagnostic.v1',
    schemaVersion: 1,
    id: `runtime-background-batch-${index + 1}`,
    type: 'runtimeBackgroundBatchProjected',
    backgroundBatchId: entry.backgroundBatchId || entry.id || null,
    batchId: entry.batchId || forgeBatchRef?.batchId || null,
    idempotencyKey: entry.idempotencyKey || null,
    outcomeId: entry.outcomeId || null,
    status: entry.status || (acceptedBatchHash ? 'accepted' : null),
    acceptedBatchHash,
    reviewHash: entry.reviewHash || forgeBatchRef?.reviewHash || null,
    operationCount: compactNumber(entry.operationCount ?? forgeBatchRef?.operationCount),
    effectCount: compactNumber(entry.effectCount ?? entry.backgroundEffectRefs?.length ?? entry.effectRefs?.length),
    workerCount: compactNumber(entry.workerCount ?? forgeBatchRef?.workerCount),
    workerKeys: workerKeys.length ? workerKeys : undefined,
    dirtyDomains: dirtyDomains.length ? dirtyDomains : undefined,
    occurredAt: entry.occurredAt || null,
    forgeBatchRef,
    ...transactionEvidence(entry)
  });
}

function compactCommandBearingEvidence(entry = {}, index = 0) {
  return compact({
    kind: 'directive.coreDiagnostic.v1',
    schemaVersion: 1,
    id: `runtime-command-bearing-evidence-${index + 1}`,
    type: 'runtimeCommandBearingEvidenceProjected',
    evidenceId: entry.evidenceId || entry.id || null,
    transactionId: entry.transactionId || null,
    batchId: entry.batchId || entry.backgroundBatchId || null,
    sourceFrameId: entry.sourceFrameId || null,
    sourceOutcomeId: entry.sourceOutcomeId || entry.outcomeId || null,
    primarySignal: entry.primarySignal || null,
    trackSignals: compactIdentifierList(entry.trackSignals || []),
    strength: entry.strength || null,
    status: entry.status || null,
    evidenceHash: entry.evidenceHash || entry.hash || null,
    acceptedBatchHash: entry.acceptedBatchHash || entry.forgeBatchRef?.acceptedBatchHash || null,
    occurredAt: entry.occurredAt || null
  });
}

function compactPromptCacheResumeEvidence(promptCache = null) {
  if (!isObject(promptCache)) return null;
  const blocks = Array.isArray(promptCache.blocks) ? promptCache.blocks : [];
  const blockKeys = compactIdentifierList(blocks.map((block) => block?.key || block?.id || block?.name), 24);
  return compact({
    kind: 'directive.promptCacheResumeEvidence.v1',
    directiveOwnedRevision: compactNumber(promptCache.directiveOwnedRevision),
    externalPromptEnvironmentRef: isObject(promptCache.externalPromptEnvironmentRef)
      ? cloneJson(promptCache.externalPromptEnvironmentRef)
      : undefined,
    blockCount: blocks.length,
    blockKeys: blockKeys.length ? blockKeys : undefined,
    updatedAt: promptCache.updatedAt || null
  });
}

function applyPromptCacheResumeEvidence(campaignState = null, promptCacheEvidence = null) {
  if (!campaignState || !isObject(promptCacheEvidence)) return campaignState;
  const next = cloneJson(campaignState);
  const currentRevision = Math.max(0, Number(next.campaignChatBinding?.promptContextRevision) || 0);
  const promptRevision = Math.max(0, Number(promptCacheEvidence.directiveOwnedRevision) || 0);
  if (!next.campaignChatBinding) next.campaignChatBinding = {};
  if (promptRevision > currentRevision) {
    next.campaignChatBinding.promptContextRevision = promptRevision;
    if (isObject(next.runtimeResume)) {
      next.runtimeResume.promptContextRevision = promptRevision;
    }
  }
  if (isObject(promptCacheEvidence.externalPromptEnvironmentRef)) {
    const currentExternalRevision = Math.max(0, Number(next.campaignChatBinding.externalPromptEnvironmentRef?.revision) || 0);
    const promptExternalRevision = Math.max(0, Number(promptCacheEvidence.externalPromptEnvironmentRef.revision) || 0);
    if (promptExternalRevision >= currentExternalRevision) {
      next.campaignChatBinding.externalPromptEnvironmentRef = cloneJson(promptCacheEvidence.externalPromptEnvironmentRef);
    }
  }
  return next;
}

function runtimeCollection(campaignState = {}, key) {
  const runtimeTracking = campaignState.runtimeTracking || {};
  if (Array.isArray(runtimeTracking[key])) return runtimeTracking[key];
  if (Array.isArray(campaignState[key])) return campaignState[key];
  return [];
}

function coreRuntimeProjection(campaignState = {}) {
  return campaignState?.directiveRuntimeEvidence?.coreStoreReadProjections
    || campaignState?.runtimeTracking?.directiveRuntimeEvidence?.coreStoreReadProjections
    || null;
}

function hasAuthoritativeCoreRuntimeProjection(campaignState = {}) {
  const projection = coreRuntimeProjection(campaignState);
  return projection?.runtimeAuthority === 'coreStoreV2';
}

function projectedCoreArray(campaignState = {}, key) {
  const projection = coreRuntimeProjection(campaignState);
  return Array.isArray(projection?.[key]) ? projection[key] : null;
}

function isBackgroundBatchProjection(entry = {}) {
  return entry?.projectionType === 'runtimeBackgroundBatchProjected'
    || entry?.type === 'coreBackgroundBatch'
    || Boolean(entry?.backgroundBatchId)
    || Boolean(entry?.forgeBatchRef?.acceptedBatchHash)
    || Boolean(entry?.batchRef?.acceptedBatchHash)
    || (Boolean(entry?.acceptedBatchHash) && Boolean(entry?.batchId));
}

function sidecarDiagnosticRows(campaignState = {}) {
  const coreRows = projectedCoreArray(campaignState, 'sidecarDiagnostics');
  return Array.isArray(coreRows) ? coreRows : [];
}

function backgroundBatchRows(campaignState = {}) {
  const projection = coreRuntimeProjection(campaignState);
  return Array.isArray(projection?.backgroundBatches) ? projection.backgroundBatches : [];
}

function commandBearingEvidenceRows(campaignState = {}) {
  const coreRows = projectedCoreArray(campaignState, 'commandBearingEvidence');
  return Array.isArray(coreRows) ? coreRows : [];
}

function projectedIngressRows(campaignState = {}) {
  const coreRows = projectedCoreArray(campaignState, 'ingressLedger');
  return Array.isArray(coreRows) ? cloneJson(coreRows) : [];
}

function projectedResponseRows(campaignState = {}) {
  const coreRows = projectedCoreArray(campaignState, 'responseLedger');
  return Array.isArray(coreRows) ? cloneJson(coreRows) : [];
}

function projectedRecoveryRows(campaignState = {}) {
  const coreRows = projectedCoreArray(campaignState, 'recoveryJournal');
  return Array.isArray(coreRows) ? coreRows : [];
}

function projectedTurnLedger(campaignState = {}) {
  const projection = coreRuntimeProjection(campaignState);
  return isObject(projection?.turnLedger) ? projection.turnLedger : null;
}

function projectedOutcomeReplacementRows(campaignState = {}) {
  const coreTurnLedger = projectedTurnLedger(campaignState);
  const coreRows = Array.isArray(coreTurnLedger?.replacementHistory) ? coreTurnLedger.replacementHistory : null;
  const legacyRows = Array.isArray(campaignState.turnLedger?.replacementHistory) ? campaignState.turnLedger.replacementHistory : [];
  return corePreferredRows(coreRows, legacyRows, [
    'id',
    'eventId',
    'transactionId',
    'coreTransactionId',
    'replacedTransactionId',
    'replacementTransactionId',
    ['replacedOutcomeId', 'replacementOutcomeId'],
    ['replacedTurnId', 'replacementTurnId']
  ], { authoritative: hasAuthoritativeCoreRuntimeProjection(campaignState) });
}

function projectedTurnRows(campaignState = {}) {
  const legacyRows = Array.isArray(campaignState.turnLedger?.entries) ? campaignState.turnLedger.entries : [];
  const coreTurnLedger = projectedTurnLedger(campaignState);
  if (Array.isArray(coreTurnLedger?.entries)) {
    return corePreferredRows(coreTurnLedger.entries, legacyRows, [
      'id',
      'turnId',
      'transactionId',
      'coreTransactionId'
    ], { authoritative: hasAuthoritativeCoreRuntimeProjection(campaignState) });
  }
  const projection = coreRuntimeProjection(campaignState);
  if (Array.isArray(projection?.turnRecords)) {
    return corePreferredRows(projection.turnRecords, legacyRows, [
      'id',
      'turnId',
      'transactionId',
      'coreTransactionId'
    ], { authoritative: hasAuthoritativeCoreRuntimeProjection(campaignState) });
  }
  if (Array.isArray(projection?.turns)) {
    return corePreferredRows(projection.turns, legacyRows, [
      'id',
      'turnId',
      'transactionId',
      'coreTransactionId'
    ], { authoritative: hasAuthoritativeCoreRuntimeProjection(campaignState) });
  }
  return legacyRows;
}

function projectedLastCommittedOutcomeId(campaignState = {}) {
  const coreTurnLedger = projectedTurnLedger(campaignState);
  if (coreTurnLedger && Object.prototype.hasOwnProperty.call(coreTurnLedger, 'lastCommittedOutcomeId')) {
    return coreTurnLedger.lastCommittedOutcomeId || null;
  }
  const turns = projectedTurnRows(campaignState);
  return campaignState.turnLedger?.lastCommittedOutcomeId
    || turns.at(-1)?.outcomeId
    || null;
}

function coreSidecarDiagnosticCount(campaignState = {}) {
  const projection = coreRuntimeProjection(campaignState);
  return Array.isArray(projection?.sidecarDiagnostics)
    ? projection.sidecarDiagnostics.length
    : 0;
}

function coreAcceptedBackgroundWorkerCount(campaignState = {}) {
  const projection = coreRuntimeProjection(campaignState);
  const batches = Array.isArray(projection?.backgroundBatches) ? projection.backgroundBatches : [];
  return batches.reduce((sum, batch) => {
    if (!batch?.acceptedBatchHash && !batch?.forgeBatchRef?.acceptedBatchHash) return sum;
    const workerCount = Number(batch.workerCount ?? batch.forgeBatchRef?.workerCount);
    return sum + (Number.isFinite(workerCount) && workerCount > 0 ? workerCount : 1);
  }, 0);
}

function sidecarResumeCount(campaignState = {}) {
  return Math.max(
    Number(campaignState?.runtimeResume?.sidecarCount) || 0,
    coreSidecarDiagnosticCount(campaignState),
    coreAcceptedBackgroundWorkerCount(campaignState)
  );
}

function maxModelCallEventSequence(campaignState = {}) {
  return modelCallRows(campaignState).reduce((max, entry) => {
    const match = /^model-call:(\d+):/.exec(String(entry?.id || ''));
    const sequence = match ? Number(match[1]) : 0;
    return Number.isFinite(sequence) && sequence > max ? sequence : max;
  }, 0);
}

function runtimeSummary(campaignState = {}) {
  const runtimeTracking = campaignState.runtimeTracking || {};
  const projection = coreRuntimeProjection(campaignState);
  const modelCalls = modelCallRows(campaignState);
  const ingressRows = projectedIngressRows(campaignState);
  const responseRows = projectedResponseRows(campaignState);
  const recoveryRows = projectedRecoveryRows(campaignState);
  const turns = projectedTurnRows(campaignState);
  return {
    ingressCount: ingressRows.length,
    responseCount: responseRows.length,
    responseLedgerRevision: Math.max(0, Number(projection?.responseLedgerRevision) || 0),
    recoveryCount: recoveryRows.length,
    historyCount: Array.isArray(runtimeTracking.history) ? runtimeTracking.history.length : 0,
    turnCount: turns.length,
    lastCommittedOutcomeId: projectedLastCommittedOutcomeId(campaignState),
    modelCallCount: modelCalls.length,
    modelCallEventSequence: maxModelCallEventSequence(campaignState),
    sidecarCount: sidecarResumeCount(campaignState)
  };
}

function runtimeResumeCursor(campaignState = {}) {
  const runtimeTracking = campaignState.runtimeTracking || {};
  const projection = coreRuntimeProjection(campaignState);
  const modelCalls = modelCallRows(campaignState);
  return compact({
    kind: 'directive.runtimeResumeCursor.v1',
    runtimeRevision: runtimeTracking.revision || 0,
    mechanicsRevision: runtimeTracking.mechanicsRevision || 0,
    responseLedgerRevision: Math.max(0, Number(projection?.responseLedgerRevision) || 0),
    promptContextRevision: campaignState.campaignChatBinding?.promptContextRevision || null,
    modelCallCount: modelCalls.length,
    modelCallEventSequence: maxModelCallEventSequence(campaignState),
    sidecarCount: sidecarResumeCount(campaignState)
  });
}

function compactAssistedCommandLogSummaryForHead(assistedSummary = null) {
  if (!isObject(assistedSummary)) return undefined;
  const highlights = compactTextList(assistedSummary.highlights || []);
  const title = compactText(assistedSummary.title || '');
  const summary = compactText(assistedSummary.summary || '');
  const compacted = compact({
    kind: assistedSummary.kind === 'directive.commandLogAssistedSummary' ? assistedSummary.kind : undefined,
    status: compactString(assistedSummary.status) || undefined,
    sourceOutcomeId: compactString(assistedSummary.sourceOutcomeId) || undefined,
    roleId: compactString(assistedSummary.roleId) || undefined,
    providerId: compactString(assistedSummary.providerId) || undefined,
    title: title || undefined,
    summary: summary || undefined,
    highlights: highlights.length ? highlights : undefined
  });
  return Object.keys(compacted).length ? compacted : undefined;
}

function compactCommandLogEntryForHead(entry = {}) {
  const visibleConsequences = compactTextList(entry.visibleConsequences || entry.consequences || []);
  const summaryInputs = Array.isArray(entry.summaryInputs) ? entry.summaryInputs : [];
  const assistedSummary = isObject(entry.assistedSummary) ? entry.assistedSummary : null;
  return compact({
    id: entry.id || null,
    type: compactString(entry.type) || undefined,
    sourceOutcomeId: entry.sourceOutcomeId || entry.outcomeId || null,
    turnId: entry.turnId || null,
    createdAt: entry.createdAt || entry.timestamp || null,
    summary: compactText(entry.summary || entry.order || entry.action || ''),
    visibleConsequences: visibleConsequences.length ? visibleConsequences : undefined,
    summaryInputCount: summaryInputs.length || undefined,
    summaryInputsHash: summaryInputs.length ? hashStableJson(summaryInputs) : undefined,
    assistedSummary: compactAssistedCommandLogSummaryForHead(assistedSummary),
    assistedSummaryRef: assistedSummary ? {
      hash: hashStableJson(assistedSummary),
      present: true
    } : undefined
  });
}

function compactCommandLogForHead(commandLog = null) {
  const entries = Array.isArray(commandLog?.entries)
    ? commandLog.entries
    : (Array.isArray(commandLog) ? commandLog : []);
  const recent = entries.slice(-ACTIVE_HEAD_COMMAND_LOG_RECENT_LIMIT).map(compactCommandLogEntryForHead);
  return compact({
    schemaVersion: commandLog?.schemaVersion || 1,
    entries: recent,
    totalEntryCount: entries.length,
    omittedEntryCount: Math.max(0, entries.length - recent.length),
    compactedForRuntimeHead: true
  });
}

function materializedHeadState(campaignState = {}) {
  const {
    runtimeTracking,
    turnLedger,
    modelCallJournal,
    sidecarJournal,
    directiveRuntimeEvidence,
    commandLog,
    ...headState
  } = campaignState || {};
  return cloneJson({
    ...headState,
    commandLog: compactCommandLogForHead(commandLog),
    runtimeResume: runtimeResumeCursor(campaignState)
  });
}

function runtimeHeadBudget(headState = {}) {
  const roots = Object.entries(headState || {})
    .map(([root, value]) => ({
      root,
      byteLength: stableJsonByteLength(value)
    }))
    .sort((left, right) => right.byteLength - left.byteLength);
  const byteLength = stableJsonByteLength(headState);
  return {
    kind: 'directive.runtimeActiveHeadBudget.v1',
    maxBytes: ACTIVE_RUNTIME_HEAD_MAX_BYTES,
    byteLength,
    status: byteLength <= ACTIVE_RUNTIME_HEAD_MAX_BYTES ? 'pass' : 'warning',
    roots: roots.slice(0, 12)
  };
}

function hostRowsFromRuntime(campaignState = {}) {
  const ingressRows = projectedIngressRows(campaignState);
  const responseRows = projectedResponseRows(campaignState);
  return [
    ...ingressRows.map((entry) => compact({
      hostMessageId: entry.hostMessageId || null,
      role: 'player',
      ingressId: entry.id || null,
      turnId: entry.turnId || null,
      outcomeId: entry.outcomeId || null,
      textHash: entry.textHash || null,
      status: entry.status || null,
      ...transactionEvidence(entry)
    })),
    ...responseRows.map((entry) => compact({
      hostMessageId: entry.hostMessageId || null,
      role: 'assistant',
      responseId: entry.id || null,
      turnId: entry.turnId || null,
      outcomeId: entry.outcomeId || null,
      status: entry.status || null,
      ...transactionEvidence(entry),
      outcomeIntegrity: compactOutcomeIntegrityEvidence(entry.outcomeIntegrity)
    }))
  ];
}

function runtimeEvents(campaignState = {}) {
  const ingressRows = projectedIngressRows(campaignState);
  const responseRows = projectedResponseRows(campaignState);
  const recoveryRows = projectedRecoveryRows(campaignState);
  const replacementRows = projectedOutcomeReplacementRows(campaignState);
  return [
    ...ingressRows.map((entry, index) => compact({
      kind: 'directive.coreEvent.v1',
      schemaVersion: 1,
      id: `runtime-ingress-${index + 1}`,
      type: 'runtimeIngressProjected',
      ingressId: entry.id || null,
      hostMessageId: entry.hostMessageId || null,
      turnId: entry.turnId || null,
      outcomeId: entry.outcomeId || null,
      textHash: entry.textHash || null,
      status: entry.status || null,
      ...transactionEvidence(entry)
    })),
    ...responseRows.map((entry, index) => compact({
      kind: 'directive.coreEvent.v1',
      schemaVersion: 1,
      id: `runtime-response-${index + 1}`,
      type: 'runtimeResponseProjected',
      responseId: entry.id || null,
      hostMessageId: entry.hostMessageId || null,
      turnId: entry.turnId || null,
      outcomeId: entry.outcomeId || null,
      status: entry.status || null,
      responseKind: entry.responseKind || null,
      editedAt: entry.editedAt || null,
      deletedAt: entry.deletedAt || null,
      ...compactReplacementTextEvidence(entry),
      ...transactionEvidence(entry),
      outcomeIntegrity: compactOutcomeIntegrityEvidence(entry.outcomeIntegrity)
    })),
    ...recoveryRows.map((entry, index) => compact({
      ...compactRecoveryEvidence(entry),
      id: `runtime-recovery-${index + 1}`
    })),
    ...replacementRows.map((entry, index) => compact({
      kind: 'directive.coreEvent.v1',
      schemaVersion: 1,
      id: entry.eventId || `runtime-outcome-replacement-${index + 1}`,
      type: 'outcomeReplacementRecorded',
      txnId: entry.transactionId || entry.coreTransactionId || null,
      occurredAt: entry.acceptedAt || entry.occurredAt || null,
      payload: {
        outcomeReplacementRef: compactOutcomeReplacementRef(entry)
      }
    }))
  ];
}

function outcomeIntegrityRank(entry = {}) {
  const integrity = entry.outcomeIntegrity || {};
  if (integrity.selectedRevisionId) return 3;
  if (Array.isArray(integrity.revisions) && integrity.revisions.length > 0) return 2;
  if (integrity.reviewCount || integrity.lastReview) return 1;
  return 0;
}

function coalesceRuntimeResponseLedger(rows = []) {
  return mergeResponseProjectionRows(rows);
}

function runtimeProjectionsFromEventSegments(eventSegments = []) {
  const entries = eventSegments.flatMap((segment) => (
    Array.isArray(segment?.entries) ? segment.entries : []
  ));
  const ingressLedger = entries
    .filter((entry) => entry?.type === 'runtimeIngressProjected')
    .map((entry) => compact({
      id: entry.ingressId || null,
      hostMessageId: entry.hostMessageId || null,
      turnId: entry.turnId || null,
      outcomeId: entry.outcomeId || null,
      textHash: entry.textHash || null,
      status: entry.status || null,
      ...transactionEvidence(entry),
      ...runtimeBridgeAuthorityFields('ingress', entry)
    }));
  const responseLedger = coalesceRuntimeResponseLedger(entries
    .filter((entry) => entry?.type === 'runtimeResponseProjected')
    .map((entry) => compact({
      id: entry.responseId || null,
      hostMessageId: entry.hostMessageId || null,
      turnId: entry.turnId || null,
      outcomeId: entry.outcomeId || null,
      status: entry.status || null,
      responseKind: entry.responseKind || null,
      editedAt: entry.editedAt || null,
      deletedAt: entry.deletedAt || null,
      replacementTextPresent: entry.replacementTextPresent,
      replacementTextHash: entry.replacementTextHash,
      replacementTextLength: entry.replacementTextLength,
      ...transactionEvidence(entry),
      ...runtimeBridgeAuthorityFields('response', entry),
      outcomeIntegrity: compactOutcomeIntegrityEvidence(entry.outcomeIntegrity)
    })));
  const recoveryJournal = runtimeRecoveryLedgerFromEvents(entries);
  return {
    ingressLedger,
    responseLedger,
    recoveryJournal
  };
}

function runtimeTrackingFromEventSegments(eventSegments = [], headState = {}) {
  const resume = headState?.runtimeResume || {};
  return compact({
    schemaVersion: 2,
    revision: Math.max(0, Number(resume.runtimeRevision) || 0),
    mechanicsRevision: Math.max(0, Number(resume.mechanicsRevision) || 0),
    responseLedgerRevision: Math.max(0, Number(resume.responseLedgerRevision) || 0),
    ingressLedger: [],
    responseLedger: [],
    recoveryJournal: [],
    sidecarJournal: [],
    modelCallJournal: [],
    pendingInteractions: []
  });
}

function outcomeReplacementHistoryFromEventSegments(eventSegments = []) {
  return eventSegments.flatMap((segment) => (
    Array.isArray(segment?.entries) ? segment.entries : []
  ))
    .filter((event) => event?.type === 'outcomeReplacementRecorded')
    .map((event) => {
      const ref = compactOutcomeReplacementRef(event.payload?.outcomeReplacementRef || {});
      return compact({
        ...ref,
        transactionId: ref.transactionId || event.txnId || event.transactionId || null,
        eventId: event.id || null,
        occurredAt: event.occurredAt || ref.acceptedAt || null
      });
    });
}

function turnLedgerFromTurnSegments(turnSegments = [], eventSegments = []) {
  const entries = turnSegments.flatMap((segment) => (
    Array.isArray(segment?.entries) ? segment.entries : []
  ));
  const turnEntries = entries.map((entry) => compact({
    id: entry.id || null,
    turnId: entry.turnId || null,
    outcomeId: entry.outcomeId || null,
    phase: entry.phase || null,
    transactionId: entry.transactionId || null,
    sourceFrameId: entry.sourceFrameId || null,
    stateDeltaHash: entry.stateDeltaHash || null,
    retainedPacketHash: entry.retainedPacketHash || null,
    snapshotBeforeHash: entry.snapshotBeforeHash || null,
    snapshotBeforeRetained: entry.snapshotBeforeRetained === true || undefined
  }));
  const replacementHistory = outcomeReplacementHistoryFromEventSegments(eventSegments);
  if (turnEntries.length === 0 && replacementHistory.length === 0) return null;
  return compact({
    schemaVersion: 2,
    entries: turnEntries,
    lastCommittedOutcomeId: turnEntries.at(-1)?.outcomeId || null,
    replacementHistory: replacementHistory.length ? replacementHistory : undefined,
    lastReplacedOutcomeId: [...replacementHistory].reverse().find((entry) => entry.replacedOutcomeId)?.replacedOutcomeId || undefined
  });
}

function projectionArray(rows = []) {
  return Array.isArray(rows) && rows.length ? cloneJson(rows) : undefined;
}

function coreStoreProjectionRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).filter((entry) => (
    compactString(entry?.projectionSource) === 'coreStoreV2'
    && compactString(entry?.authority) !== 'compatibilityProjectionUnavailable'
  ));
}

function coreStoreReadProjectionsFromLoadedArtifacts({
  runtimeProjections = {},
  turnLedger = null,
  diagnosticsSegments = []
} = {}) {
  const modelCallDiagnostics = modelCallJournalFromDiagnosticsSegments(diagnosticsSegments);
  const sidecarRows = sidecarJournalFromDiagnosticsSegments(diagnosticsSegments);
  const sidecarDiagnostics = sidecarRows.filter((entry) => !isBackgroundBatchProjection(entry));
  const backgroundBatches = sidecarRows.filter((entry) => isBackgroundBatchProjection(entry));
  const commandBearingEvidence = commandBearingEvidenceFromDiagnosticsSegments(diagnosticsSegments);
  return compact({
    kind: 'directive.coreStoreReadProjections.v1',
    runtimeAuthority: 'coreStoreV2',
    ingressLedger: projectionArray(coreStoreProjectionRows(runtimeProjections.ingressLedger)),
    responseLedger: projectionArray(coreStoreProjectionRows(runtimeProjections.responseLedger)),
    recoveryJournal: projectionArray(coreStoreProjectionRows(runtimeProjections.recoveryJournal)),
    turnLedger: turnLedger ? cloneJson(turnLedger) : undefined,
    modelCallDiagnostics: projectionArray(modelCallDiagnostics),
    sidecarDiagnostics: projectionArray(sidecarDiagnostics),
    backgroundBatches: projectionArray(backgroundBatches),
    commandBearingEvidence: projectionArray(commandBearingEvidence)
  });
}

function hasCoreStoreReadProjectionEvidence(projection = {}) {
  return [
    projection.ingressLedger,
    projection.responseLedger,
    projection.recoveryJournal,
    projection.sidecarDiagnostics,
    projection.backgroundBatches,
    projection.commandBearingEvidence
  ].some((rows) => Array.isArray(rows) && rows.length)
    || (isObject(projection.turnLedger) && Array.isArray(projection.turnLedger.entries) && projection.turnLedger.entries.length)
    || (isObject(projection.turnLedger) && Array.isArray(projection.turnLedger.replacementHistory) && projection.turnLedger.replacementHistory.length);
}

function turnRecords(campaignState = {}) {
  const turns = projectedTurnRows(campaignState);
  return turns.map((entry, index) => compact({
    kind: 'directive.coreStoreTurnRecord.v1',
    schemaVersion: 1,
    id: entry.id || `runtime-turn-${index + 1}`,
    turnId: entry.turnId || entry.id || null,
    outcomeId: entry.outcomeId || null,
    phase: entry.phase || 'runtimeProjected',
    transactionId: entry.transactionId || null,
    sourceFrameId: entry.sourceFrameId || null,
    stateDeltaHash: entry.stateDeltaHash || (entry.stateDelta ? hashStableJson(entry.stateDelta) : null),
    retainedPacketHash: entry.retainedPacketHash || (entry.retainedPacket ? hashStableJson(entry.retainedPacket) : null),
    snapshotBeforeHash: entry.snapshotBeforeHash || (entry.snapshotBefore ? hashStableJson(entry.snapshotBefore) : null),
    snapshotBeforeRetained: entry.snapshotBeforeRetained === true || Boolean(entry.snapshotBefore) || undefined
  }));
}

function diagnostics(campaignState = {}, { reason = null, headBudget = null } = {}) {
  const summary = runtimeSummary(campaignState);
  return [
    compact({
      kind: 'directive.coreDiagnostic.v1',
      schemaVersion: 1,
      id: 'runtime-persistence-summary',
      type: 'runtimePersistenceSummary',
      status: 'ok',
      reason,
      runtimeSummary: summary,
      runtimeHeadBudget: headBudget ? cloneJson(headBudget) : undefined
    }),
    ...modelCallRows(campaignState).map(compactModelCallEvidence),
    ...sidecarDiagnosticRows(campaignState).map(compactSidecarDiagnosticEvidence),
    ...backgroundBatchRows(campaignState).map(compactBackgroundBatchEvidence),
    ...commandBearingEvidenceRows(campaignState).map(compactCommandBearingEvidence)
  ];
}

function metadataFor({ saveRecord, campaignState, packageData, savedAt, summary }) {
  if (campaignState && packageData) {
    const metadata = createCampaignSaveMetadata({
      campaignState,
      packageData,
      savedAt,
      summary
    });
    if (saveRecord.metadata?.branch) {
      metadata.branch = cloneJson(saveRecord.metadata.branch);
    }
    return metadata;
  }
  return cloneJson(saveRecord.metadata || {
    campaignId: campaignState?.campaign?.id || null,
    lastUpdatedAt: savedAt,
    summary: summary || null
  });
}

function campaignIdFor(saveRecord, campaignState) {
  return requireNonEmptyString(campaignState?.campaign?.id || saveRecord.metadata?.campaignId, 'campaignId');
}

function saveIdFor(saveRecord) {
  return requireNonEmptyString(saveRecord.id || saveRecord.saveId, 'saveRecord.id');
}

export async function persistActiveCampaignStateV2(adapter, {
  saveRecord,
  campaignState,
  packageData = null,
  summary = null,
  reason = 'runtimePersist',
  current = null,
  createIndexEntry = false,
  name = null,
  slotType = 'manual',
  now = null
} = {}) {
  requireObject(saveRecord, 'saveRecord');
  if (saveRecord.kind !== 'directive.campaignSave' && saveRecord.kind !== 'directive.saveManifest.v2') {
    throw new Error('saveRecord must be a directive.campaignSave record or directive.saveManifest.v2 descriptor');
  }
  requireObject(campaignState, 'campaignState');
  const savedAt = now || isoNow();
  const campaignId = campaignIdFor(saveRecord, campaignState);
  const saveId = saveIdFor(saveRecord);
  const headState = materializedHeadState(campaignState);
  const headBudget = runtimeHeadBudget(headState);
  const metadata = metadataFor({ saveRecord, campaignState, packageData, savedAt, summary });

  const commit = await commitV2SaveLayout(adapter, {
    campaignId,
    saveId,
    branchId: saveRecord.branchId || saveRecord.metadata?.branch?.branchId || 'main',
    now: savedAt,
    current: current === null ? saveRecord.current === true : current === true,
    metadata,
    importedFrom: {
      kind: saveRecord.kind,
      saveId,
      revision: saveRecord.revision || null,
      updatedAt: saveRecord.updatedAt || null,
      summary: 'v1 manual checkpoint remains available; v2 active state is runtime-current.'
    },
    head: {
      source: 'active-save-facade-v2',
      state: headState,
      runtimeSummary: runtimeSummary(campaignState),
      runtimeHeadBudget: headBudget,
      materializedHeadStateHash: hashStableJson(headState),
      excludesRuntimeJournals: true
    },
    hostMap: {
      excludesRawChatText: true,
      rows: hostRowsFromRuntime(campaignState)
    },
    promptCache: {
      directiveOwnedRevision: campaignState.campaignChatBinding?.promptContextRevision || null,
      externalPromptEnvironmentRef: campaignState.campaignChatBinding?.externalPromptEnvironmentRef || null,
      blocks: []
    },
    eventSegments: [runtimeEvents(campaignState)],
    turnSegments: [turnRecords(campaignState)],
    diagnosticsSegments: [diagnostics(campaignState, { reason, headBudget })],
    checkpoints: [{
      checkpointId: 'runtime-active-head',
      type: 'runtimeActiveHead',
      stateHash: hashStableJson(headState),
      reason
    }]
  });

  const saveIndexEntry = createIndexEntry
    ? await storeCampaignV2SaveManifestIndexEntry(adapter, {
        saveManifest: commit.saveManifest,
        saveManifestRef: commit.saveManifestRef,
        campaignState,
        packageData,
        name,
        slotType,
        summary,
        now: savedAt
      })
    : await markCampaignSaveRuntimeV2State(adapter, {
        saveId,
        saveManifest: commit.saveManifest,
        saveManifestRef: commit.saveManifestRef,
        metadata,
        current: current === null ? saveRecord.current === true : current === true,
        now: savedAt
      });

  return {
    kind: 'directive.activeCampaignStatePersist.v2',
    storageFormat: 'v2',
    campaignId,
    saveId,
    id: saveId,
    name: saveIndexEntry?.name || name || saveRecord.name || saveId,
    current: saveIndexEntry?.current === true,
    updatedAt: savedAt,
    wroteV1Payload: false,
    saveManifestRef: commit.saveManifestRef,
    campaignManifestRef: commit.campaignManifestRef,
    refs: cloneJson(commit.refs),
    saveIndexEntry,
    runtimeHeadBudget: headBudget
  };
}

export async function hasActiveCampaignStateV2(adapter, {
  campaignId,
  saveId
} = {}) {
  try {
    await loadV2SaveManifest(adapter, {
      campaignId: requireNonEmptyString(campaignId, 'campaignId'),
      saveId: requireNonEmptyString(saveId, 'saveId')
    });
    return true;
  } catch {
    return false;
  }
}

export async function loadActiveCampaignStateV2(adapter, {
  saveRecord,
  fallbackCampaignState = null
} = {}) {
  requireObject(saveRecord, 'saveRecord');
  const campaignId = campaignIdFor(saveRecord, fallbackCampaignState || {});
  const saveId = saveIdFor(saveRecord);
  try {
    const saveManifest = await loadV2SaveManifest(adapter, { campaignId, saveId });
    const head = await readV2ArtifactRef(adapter, saveManifest.head);
    const eventSegments = [];
    for (const ref of saveManifest.eventSegments || []) {
      eventSegments.push(await readV2ArtifactRef(adapter, ref));
    }
    const turnSegments = [];
    for (const ref of saveManifest.turnSegments || []) {
      turnSegments.push(await readV2ArtifactRef(adapter, ref));
    }
    const diagnosticsSegments = [];
    for (const ref of saveManifest.diagnosticsSegments || []) {
      diagnosticsSegments.push(await readV2ArtifactRef(adapter, ref));
    }
    const promptCache = saveManifest.promptCache
      ? compactPromptCacheResumeEvidence(await readV2ArtifactRef(adapter, saveManifest.promptCache))
      : null;
    const campaignState = applyPromptCacheResumeEvidence(cloneJson(head.state || null), promptCache);
    if (campaignState) {
      const runtimeProjections = runtimeProjectionsFromEventSegments(eventSegments);
      campaignState.runtimeTracking = runtimeTrackingFromEventSegments(eventSegments, campaignState);
      const turnLedger = turnLedgerFromTurnSegments(turnSegments, eventSegments);
      if (turnLedger) campaignState.turnLedger = turnLedger;
      const coreStoreReadProjections = coreStoreReadProjectionsFromLoadedArtifacts({
        runtimeProjections,
        turnLedger,
        diagnosticsSegments
      });
      if (hasCoreStoreReadProjectionEvidence(coreStoreReadProjections)) {
        campaignState.directiveRuntimeEvidence = compact({
          ...(isObject(campaignState.directiveRuntimeEvidence) ? campaignState.directiveRuntimeEvidence : {}),
          coreStoreReadProjections
        });
      }
    }
    return {
      kind: 'directive.activeCampaignStateLoad.v2',
      storageFormat: 'v2',
      found: true,
      campaignId,
      saveId,
      saveManifest,
      campaignState,
      head: {
        ...head,
        eventSegments,
        turnSegments,
        diagnosticsSegments,
        promptCache
      }
    };
  } catch (error) {
    return {
      kind: 'directive.activeCampaignStateLoad.v2',
      storageFormat: 'v2',
      found: false,
      campaignId,
      saveId,
      campaignState: cloneJson(fallbackCampaignState),
      error: {
        message: error?.message || String(error),
        code: error?.code || null
      }
    };
  }
}
