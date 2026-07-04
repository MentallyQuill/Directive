import {
  initializeCampaignRuntimeTracking,
  recordDirectiveResponse,
  resolveRecoveryEvent,
  updateDirectiveResponse,
  updateTurnIngress
} from './state-delta-gateway.mjs';
import { prefixCampaignReplyHeader } from '../time/campaign-time-header.mjs';
import { hashContinuityText } from '../continuity/fact-schema.mjs';
import { normalizeContinuityState } from '../continuity/state.mjs';
import {
  createTurnLatencyMetrics,
  hashStableJson
} from './architecture-redesign-contracts.mjs';
import { createRepairCommandBoundary } from './repair-command-boundary.mjs';
import {
  __sourceReviewWorkerTestHooks,
  createSourceReviewWorker
} from './source-review-worker.mjs';
import {
  createRuntimeLedgerViewAsync,
  findLedgerIngressAsync,
  findLedgerRecoveryAsync,
  findLedgerResponseAsync
} from './runtime-ledger-view.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compact(value) {
  return String(value || '').trim();
}

function ingressCoreTransactionId(ingress = null) {
  return compact(
    ingress?.coreTransactionId
    || ingress?.transactionId
    || ingress?.coreProjection?.transactionId
    || ingress?.coreProjection?.coreTransactionId
    || ''
  ) || null;
}

function compactText(value = '', maxLength = 240) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function timestamp(now) {
  return typeof now === 'function' ? now() : (now || new Date().toISOString());
}

function compactError(error, fallbackCode = 'DIRECTIVE_CORE_HOST_CONTINUE_RELEASE_FAILED') {
  return {
    code: error?.code || fallbackCode,
    message: error?.message || String(error)
  };
}

function compactRecoveryWriterErrorRef(error, fallbackCode = 'DIRECTIVE_CORE_HOST_NATIVE_CONTRADICTION_RECOVERY_FAILED') {
  const message = String(error?.message || error || '');
  const rawCode = String(error?.code || '');
  return {
    code: fallbackCode,
    codeHash: rawCode ? hashStableJson({ code: rawCode.slice(0, 240) }) : undefined,
    messageLength: message.length,
    messageHash: hashStableJson({ message: message.slice(0, 900) })
  };
}

function isObjectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

const COMPATIBILITY_RAW_TEXT_KEYS = new Set([
  'text',
  'rawtext',
  'rawsummary',
  'rawprompt',
  'body',
  'content',
  'message',
  'prompt',
  'provideroutput',
  'assistanttext',
  'playertext',
  'observedtext',
  'replacementtext',
  'verbatim'
]);

function compatibilityProjectionHasUnsafeRawText(value, seen = new Set()) {
  if (!value || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.some((item) => compatibilityProjectionHasUnsafeRawText(item, seen));
  }
  for (const [rawKey, item] of Object.entries(value)) {
    const key = String(rawKey || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (COMPATIBILITY_RAW_TEXT_KEYS.has(key)) {
      if (typeof item === 'string' && compact(item)) return true;
      if (item && typeof item === 'object') return true;
    }
    if (compatibilityProjectionHasUnsafeRawText(item, seen)) return true;
  }
  return false;
}

function appendCompatibilityRecords(existing = [], additions = []) {
  const byId = new Map((Array.isArray(existing) ? existing : [])
    .filter(isObjectRecord)
    .map((entry) => [compact(entry.id), cloneJson(entry)])
    .filter(([id]) => id));
  for (const rawEntry of Array.isArray(additions) ? additions : []) {
    if (!isObjectRecord(rawEntry)) continue;
    const entry = cloneJson(rawEntry);
    const id = compact(entry.id);
    if (!id) continue;
    entry.id = id;
    byId.set(id, entry);
  }
  return [...byId.values()];
}

function mergeCompatibilityFactUseStats(existing = {}, additions = {}) {
  const next = isObjectRecord(existing) ? cloneJson(existing) : {};
  if (!isObjectRecord(additions)) return next;
  for (const [rawFactId, rawStats] of Object.entries(additions)) {
    if (!isObjectRecord(rawStats)) continue;
    const factId = compact(rawStats.factId || rawFactId);
    if (!factId) continue;
    const stats = cloneJson(rawStats);
    stats.factId = compact(stats.factId) || factId;
    next[factId] = stats;
  }
  return next;
}

function compatibilityProjectionRecoveryId(projection = null) {
  if (!isObjectRecord(projection)) return null;
  return compact(projection.recoveryEvent?.id)
    || compact(projection.ingressPatch?.recoveryId)
    || null;
}

function compatibilityProjectionIsComplete(projection = null) {
  if (!isObjectRecord(projection)) return false;
  const recoveryEvent = projection.recoveryEvent;
  const ingressPatch = projection.ingressPatch;
  if (!isObjectRecord(recoveryEvent) || !isObjectRecord(ingressPatch)) return false;
  const recoveryEventId = compact(recoveryEvent.id);
  const ingressRecoveryId = compact(ingressPatch.recoveryId);
  if (!recoveryEventId || !ingressRecoveryId || recoveryEventId !== ingressRecoveryId) return false;
  if (compact(recoveryEvent.type) !== 'hostNativeContinuityContradiction') return false;
  if (compact(ingressPatch.status) !== 'recoveryRequired') return false;
  const rejectedClaims = Array.isArray(projection.rejectedClaims) ? projection.rejectedClaims : [];
  const projectionHints = Array.isArray(projection.projectionHints) ? projection.projectionHints : [];
  const factUseStats = isObjectRecord(projection.factUseStats) ? projection.factUseStats : {};
  return !compatibilityProjectionHasUnsafeRawText({
    rejectedClaims,
    projectionHints,
    factUseStats
  });
}

function ingressHostNativeContinuityProjection({
  coreRecovery = null,
  ingressId = null,
  recoveryId = null,
  status = null
} = {}) {
  const transactionId = compact(coreRecovery?.transactionId || coreRecovery?.coreTransactionId);
  const recoveryCaseId = compact(recoveryId || coreRecovery?.recoveryCaseId || coreRecovery?.id || coreRecovery?.recoveryId);
  if (!transactionId && !recoveryCaseId) return null;
  return {
    kind: 'directive.coreIngressHostNativeContinuityProjectionRef.v1',
    transactionId: transactionId || null,
    ingressId: compact(ingressId) || null,
    recoveryCaseId: recoveryCaseId || null,
    status: compact(status || coreRecovery?.phase || coreRecovery?.status) || null,
    eventType: 'hostNativeContinuityContradiction',
    sourceKind: 'playerIngress'
  };
}

function hostNativeContinuityReviewSourceRef(review = null) {
  const source = review?.sreReview?.source || {};
  return {
    responseId: compact(source.responseId) || null,
    ingressId: compact(source.ingressId) || null,
    outcomeId: compact(source.outcomeId) || null,
    turnId: compact(source.turnId) || null,
    hostMessageId: compact(source.hostMessageId) || null,
    textHash: compact(source.textHash || review?.observedTextHash || review?.sourceTextHash) || null
  };
}

function compactContinuityFindingRefs(review = null) {
  return (Array.isArray(review?.findings) ? review.findings : [])
    .map((finding) => {
      if (!isObjectRecord(finding)) return null;
      const kind = compact(finding.kind);
      const factId = compact(finding.factId);
      const severity = compact(finding.severity);
      if (!kind && !factId && !severity) return null;
      return {
        kind: kind || null,
        factId: factId || null,
        severity: severity || null
      };
    })
    .filter(Boolean);
}

function sanitizedHostNativeContinuityCompatibilityProjection({
  recoveryId = null,
  responseId = null,
  ingressId = null,
  outcomeId = null,
  turnId = null,
  hostMessageId = null,
  observedTextHash = null,
  observedAt = null,
  review = null,
  repairDecision = null,
  coreRecovery = null,
  coreRecoveryError = null,
  campaignState = null,
  reason = 'sanitizedCompatibilityProjection'
} = {}) {
  const reviewSource = hostNativeContinuityReviewSourceRef(review);
  const baseRecoveryId = compact(recoveryId) || `recovery:continuity:${responseId || ingressId || 'host-native'}`;
  const projectionRecoveryId = `recovery:continuity-projection:${hashStableJson({
    baseRecoveryId,
    responseId,
    ingressId,
    reason
  }).slice(0, 24)}`;
  const at = observedAt || timestamp(null);
  const findings = compactContinuityFindingRefs(review);
  const factIds = [...new Set(findings.map((finding) => compact(finding.factId)).filter(Boolean))];
  const findingKinds = [...new Set(findings.map((finding) => compact(finding.kind)).filter(Boolean))];
  const source = {
    kind: 'hostNativeGeneration',
    responseId: responseId || reviewSource.responseId,
    ingressId: ingressId || reviewSource.ingressId,
    outcomeId: outcomeId || reviewSource.outcomeId,
    turnId: turnId || reviewSource.turnId,
    hostMessageId: hostMessageId || reviewSource.hostMessageId,
    textHash: compact(observedTextHash) || reviewSource.textHash
  };
  const claimSource = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== null && value !== undefined && value !== ''));
  const currentRevision = Number(campaignState?.runtimeTracking?.revision ?? 0) || 0;
  const rejectedClaims = factIds.length ? [{
    schemaVersion: 1,
    id: `generated-claim.${hashStableJson({ recoveryId: projectionRecoveryId, factIds, textHash: source.textHash || null })}`,
    status: 'rejected',
    categories: ['continuity'],
    textHash: source.textHash || hashStableJson({ recoveryId: projectionRecoveryId, factIds }),
    source: claimSource,
    sourceHash: hashStableJson(claimSource),
    extractedAt: at,
    authority: 'generatedClaim',
    accepted: false,
    findingFactIds: factIds,
    findingKinds,
    review: {
      kind: review?.kind || 'directive.sreHostNativeContinuityReview.v1',
      ok: false,
      checkedFactCount: Number(review?.checkedFactCount || 0),
      findingCount: findings.length
    }
  }] : [];
  const priorStats = isObjectRecord(campaignState?.continuity?.factUseStats)
    ? campaignState.continuity.factUseStats
    : {};
  const factUseStats = Object.fromEntries(factIds.map((factId) => {
    const prior = isObjectRecord(priorStats[factId]) ? priorStats[factId] : {};
    return [factId, {
      factId,
      selectedCount: Number(prior.selectedCount || 0),
      guardedCount: Number(prior.guardedCount || 0),
      violationCount: Number(prior.violationCount || 0) + 1,
      lastSelectedRevision: prior.lastSelectedRevision ?? null,
      lastGuardedRevision: prior.lastGuardedRevision ?? null,
      lastViolationRevision: currentRevision,
      lastLane: prior.lastLane || 'directive.continuity.invariants',
      updatedAt: at
    }];
  }));
  const projectionHints = factIds.map((factId) => {
    const finding = findings.find((entry) => entry.factId === factId) || {};
    return {
      id: `hint.violation.${hashStableJson({ recoveryId: projectionRecoveryId, factId, kind: finding.kind || null, revision: currentRevision })}`,
      factId,
      mode: 'guard',
      force: 'guard',
      minimumLane: 'directive.continuity.invariants',
      reason: 'Recent continuity contradiction.',
      owner: 'repair',
      source: {
        kind: 'hostNativeContinuityContradiction',
        recoveryId: projectionRecoveryId,
        findingKind: finding.kind || null
      },
      createdRevision: currentRevision,
      expiresRevision: currentRevision + 4,
      createdAt: at
    };
  });
  const ingressProjection = ingressHostNativeContinuityProjection({
    coreRecovery,
    ingressId,
    recoveryId: projectionRecoveryId,
    status: 'recoveryRequired'
  });
  return {
    rejectedClaims,
    projectionHints,
    factUseStats,
    recoveryEvent: {
      id: projectionRecoveryId,
      type: 'hostNativeContinuityContradiction',
      status: 'open',
      hostMessageId: source.hostMessageId || null,
      ingressId: ingressId || null,
      outcomeId: outcomeId || null,
      recordedAt: at,
      details: {
        responseId: responseId || null,
        hostMessageId: source.hostMessageId || null,
        findings,
        coreRecovery: coreRecovery ? {
          status: coreRecovery.status || null,
          transactionId: coreRecovery.transactionId || null,
          recoveryCaseId: coreRecovery.recoveryCaseId || null,
          phase: coreRecovery.phase || null,
          reason: coreRecovery.reason || null
        } : null,
        coreRecoveryError: cloneJson(coreRecoveryError || null),
        repairDecision: cloneJson(repairDecision || null),
        recoveryPolicy: {
          action: repairDecision?.recoveryAction || 'reviewHostNativeContinuityContradiction',
          reason: repairDecision?.recoverySummary || 'Host-native generation contradicted protected continuity facts and cannot be accepted unchanged.',
          hostRepairAvailable: false,
          retryHostGeneration: repairDecision?.retryHostGeneration === true,
          reobserveHostAssistantRows: repairDecision?.reobserveHostAssistantRows === true,
          preferredFirstAction: repairDecision?.preferredFirstAction || 'reviewHostNativeContinuityContradiction',
          allowedActions: cloneJson(repairDecision?.allowedActions || ['reviewHostNativeContinuityContradiction'])
        },
        projectionFallbackReason: reason
      }
    },
    ingressPatch: {
      status: 'recoveryRequired',
      responseStrategy: 'injectAndContinue',
      turnId,
      outcomeId,
      recoveryId: projectionRecoveryId,
      ...(ingressProjection ? {
        authority: 'compatibilityProjection',
        projectionSource: 'coreStoreV2',
        coreProjection: ingressProjection
      } : {}),
      error: {
        code: 'DIRECTIVE_HOST_NATIVE_CONTINUITY_CONTRADICTION',
        message: 'Host-native generation contradicted protected continuity facts and requires recovery.'
      },
      failedAt: at
    }
  };
}

function applyHostNativeContinuityCompatibilityProjection(campaignState, projection = null, {
  ingressId = null,
  applyContinuityProjection = true,
  applyRecoveryEvent = true,
  applyIngressPatch = true
} = {}) {
  if (!isObjectRecord(projection)) {
    return { applied: false, campaignState, recoveryId: null };
  }
  let next = cloneJson(campaignState);
  let applied = false;
  const rejectedClaims = Array.isArray(projection.rejectedClaims) ? projection.rejectedClaims : [];
  const projectionHints = Array.isArray(projection.projectionHints) ? projection.projectionHints : [];
  const factUseStats = isObjectRecord(projection.factUseStats) ? projection.factUseStats : null;
  if (applyContinuityProjection && (rejectedClaims.length || projectionHints.length || factUseStats)) {
    const continuity = normalizeContinuityState(next.continuity);
    next.continuity = normalizeContinuityState({
      ...continuity,
      rejectedClaims: appendCompatibilityRecords(continuity.rejectedClaims, rejectedClaims),
      projectionHints: appendCompatibilityRecords(continuity.projectionHints, projectionHints),
      factUseStats: mergeCompatibilityFactUseStats(continuity.factUseStats, factUseStats)
    });
    applied = true;
  } else if (!applyContinuityProjection && (rejectedClaims.length || projectionHints.length || factUseStats)) {
    applied = true;
  }
  if (isObjectRecord(projection.recoveryEvent)) {
    applied = true;
  }
  if (applyIngressPatch && ingressId && isObjectRecord(projection.ingressPatch)) {
    next = updateTurnIngress(next, ingressId, projection.ingressPatch, {
      missingCoreWriteMode: 'reject'
    });
    applied = true;
  } else if (!applyIngressPatch && ingressId && isObjectRecord(projection.ingressPatch)) {
    applied = true;
  }
  return {
    applied,
    campaignState: next,
    recoveryId: compatibilityProjectionRecoveryId(projection)
  };
}

export function composePauseResponse(type, context = {}) {
  if (type === 'clarificationNeeded') {
    return context.question || 'The officer at the relevant station pauses. "I can carry that out, Commander, but I need the target and the intended method before I proceed."';
  }
  if (type === 'riskConfirmationNeeded') {
    const warnings = (context.warnings || []).filter(Boolean);
    return warnings.length
      ? `A department head raises an immediate concern. ${warnings.join(' ')} "Do you still want us to proceed?"`
      : 'A department head flags a serious foreseeable risk before the order is carried out. "Do you still want us to proceed, Commander?"';
  }
  if (type === 'commandBearing') {
    return context.text || 'The moment hangs before the order becomes final. Directive has identified an eligible Command Bearing intervention; accept the result or choose the available intervention.';
  }
  if (type === 'counselRequest') {
    return 'Directive files a player-safe advisory note for Mission, Log, and Crew context, then hands the scene back to chat.';
  }
  return context.text || 'The bridge waits for the missing decision before the scene can proceed.';
}

export const __responseDispatcherTestHooks = Object.freeze({
  providedHostNativeReviewMatchesSource: __sourceReviewWorkerTestHooks.providedHostNativeReviewMatchesSource
});

export function createResponseDispatcher({
  host,
  coreTurnStore = null,
  repairRuntime = null,
  sourceReconciliationEngine = null,
  sourceReviewWorker = null,
  getCampaignState = null,
  setCampaignState = null,
  persist = null,
  now = null
} = {}) {
  if (!host?.chat?.postAssistantMessage) {
    throw new Error('ResponseDispatcher requires host.chat.postAssistantMessage.');
  }

  const repair = repairRuntime || createRepairCommandBoundary({ coreTurnStore, now });
  const sourceReview = sourceReviewWorker || createSourceReviewWorker({ sourceReconciliationEngine, now });

  function resolveState(campaignState) {
    const source = campaignState || getCampaignState?.();
    if (!source) throw new Error('ResponseDispatcher requires campaign state.');
    return initializeCampaignRuntimeTracking(source);
  }

  async function findExisting(campaignState, idempotencyKey) {
    const view = await createRuntimeLedgerViewAsync(campaignState, { coreTurnStore, runtimeOverlay: true });
    const response = (view.responseLedger || []).find((entry) => (
      idempotencyKey && entry.id === idempotencyKey
    )) || null;
    if (response) return response;
    if (!idempotencyKey || typeof coreTurnStore?.readProjections !== 'function') return null;
    const projections = await coreTurnStore.readProjections() || {};
    const diagnostic = (Array.isArray(projections.sidecarDiagnostics) ? projections.sidecarDiagnostics : []).find((entry) => (
      ['hostNativeContinuityRecovery', 'hostNativeCompletionRecord', 'hostContinueReleaseRecord', 'visibleResponseRecord'].includes(compact(entry.worker))
      && compact(entry.status) === 'failed'
      && compact(entry.responseId) === compact(idempotencyKey)
    )) || null;
    if (!diagnostic) return null;
    return {
      id: compact(idempotencyKey),
      responseId: compact(idempotencyKey),
      coreTransactionId: compact(diagnostic.transactionId || diagnostic.coreTransactionId) || null,
      transactionId: compact(diagnostic.transactionId || diagnostic.coreTransactionId) || null,
      status: 'coreRecoveryDiagnosticProjected',
      projectionSource: 'coreStoreV2',
      authority: 'coreDiagnosticProjection',
      coreDiagnosticProjection: cloneJson(diagnostic)
    };
  }

  async function projectedCoreRecoveryForResponse(response = null) {
    if (!response || typeof coreTurnStore?.readProjections !== 'function') return null;
    const transactionId = compact(response.coreTransactionId || response.transactionId);
    if (!transactionId) return null;
    const projections = await coreTurnStore.readProjections() || {};
    return (Array.isArray(projections.recoveryJournal) ? projections.recoveryJournal : []).find((entry) => (
      compact(entry.transactionId || entry.coreTransactionId) === transactionId
      && compact(entry.status || entry.recoveryStatus) !== 'resolved'
    )) || null;
  }

  async function projectedCoreDiagnosticForResponse(response = null) {
    if (!response || typeof coreTurnStore?.readProjections !== 'function') return null;
    const transactionId = compact(response.coreTransactionId || response.transactionId);
    const responseId = compact(response.id || response.responseId);
    if (!transactionId && !responseId) return null;
    const projections = await coreTurnStore.readProjections() || {};
    return (Array.isArray(projections.sidecarDiagnostics) ? projections.sidecarDiagnostics : []).find((entry) => (
      ['hostNativeContinuityRecovery', 'hostNativeCompletionRecord', 'hostContinueReleaseRecord', 'visibleResponseRecord'].includes(compact(entry.worker))
      && compact(entry.status) === 'failed'
      && (
        (transactionId && compact(entry.transactionId) === transactionId)
        || (responseId && compact(entry.responseId) === responseId)
      )
    )) || null;
  }

  function recoveryIdForCoreDiagnostic(diagnostic = null, response = null) {
    const responseId = compact(response?.id || response?.responseId || diagnostic?.responseId);
    if (!responseId) return null;
    if (compact(diagnostic?.worker) === 'hostNativeCompletionRecord') {
      return `recovery:core-host-native-completion:${responseId}`;
    }
    if (compact(diagnostic?.worker) === 'hostContinueReleaseRecord') {
      return `recovery:core-host-continue:${responseId}`;
    }
    if (compact(diagnostic?.worker) === 'visibleResponseRecord') {
      return `recovery:core-visible-response:${responseId}`;
    }
    return `recovery:continuity:${responseId}`;
  }

  async function existingResponseDispatchResult(existing, state) {
    const entry = cloneJson(existing);
    const projectedCoreRecovery = await projectedCoreRecoveryForResponse(existing);
    if (projectedCoreRecovery) {
      const recoveryStatus = compact(projectedCoreRecovery.phase || projectedCoreRecovery.status);
      return {
        ok: false,
        duplicate: true,
        recoveryRequired: recoveryStatus !== 'responseRetryRequired',
        responseRetryRequired: recoveryStatus === 'responseRetryRequired',
        entry,
        recoveryId: projectedCoreRecovery.id || projectedCoreRecovery.recoveryId || null,
        coreRecovery: cloneJson(projectedCoreRecovery),
        campaignState: state
      };
    }
    const projectedCoreDiagnostic = await projectedCoreDiagnosticForResponse(existing);
    if (projectedCoreDiagnostic) {
      return {
        ok: false,
        duplicate: true,
        recoveryRequired: true,
        responseRetryRequired: false,
        entry,
        recoveryId: recoveryIdForCoreDiagnostic(projectedCoreDiagnostic, existing),
        coreDiagnostic: cloneJson(projectedCoreDiagnostic),
        campaignState: state
      };
    }
    if (
      existing?.status === 'recoveryRequired'
      || existing?.status === 'responseRetryRequired'
      || existing?.recoveryRequired === true
    ) {
      return {
        ok: false,
        duplicate: true,
        recoveryRequired: existing?.status !== 'responseRetryRequired',
        responseRetryRequired: existing?.status === 'responseRetryRequired',
        entry,
        recoveryId: existing.recoveryId || null,
        coreReleaseError: cloneJson(existing.coreReleaseError || null),
        coreRecoveryError: cloneJson(existing.coreRecoveryError || null),
        campaignState: state
      };
    }
    return { ok: true, duplicate: true, entry, campaignState: state };
  }

  async function findIngress(campaignState, ingressId) {
    if (!ingressId) return null;
    return findLedgerIngressAsync(campaignState, { id: ingressId }, { coreTurnStore, runtimeOverlay: true });
  }

  async function findResponse(campaignState, responseId) {
    if (!responseId) return null;
    return findLedgerResponseAsync(campaignState, { id: responseId }, { coreTurnStore, runtimeOverlay: true });
  }

  async function readCoreResponseProjectionFor(entry = null) {
    const responseId = compact(entry.id || entry.responseId);
    const transactionId = compact(entry.coreTransactionId || entry.transactionId || entry.coreRelease?.transactionId);
    const hostId = compact(entry.hostMessageId || entry.hostObservation?.hostMessageId);
    if (entry && typeof coreTurnStore?.readProjections === 'function') {
      const projections = await coreTurnStore.readProjections();
      const responses = Array.isArray(projections?.responseLedger) ? projections.responseLedger : [];
      const projection = responses.find((response) => (
        (responseId && compact(response.id || response.responseId) === responseId)
        || (transactionId && compact(response.transactionId || response.coreTransactionId) === transactionId)
        || (hostId && compact(response.hostMessageId) === hostId)
      )) || null;
      if (projection) return projection;
    }
    if (!entry) return null;
    const releasePhase = compact(entry.coreRelease?.phase);
    const completionPhase = compact(entry.coreCompletion?.phase);
    const diagnosticStatus = compact(entry.coreRecoveryDiagnostic?.status || entry.coreReleaseDiagnostic?.status);
    const recoveryStatus = compact(entry.coreRecovery?.status || entry.coreRecovery?.phase);
    if (!releasePhase && !completionPhase && !diagnosticStatus && !recoveryStatus) return null;
    return {
      id: responseId || null,
      responseId: responseId || null,
      transactionId: transactionId || compact(entry.coreCompletion?.transactionId || entry.coreRecovery?.transactionId) || null,
      coreTransactionId: transactionId || compact(entry.coreCompletion?.transactionId || entry.coreRecovery?.transactionId) || null,
      hostMessageId: hostId || null,
      outcomeId: compact(entry.outcomeId) || null,
      responseKind: compact(entry.responseKind) || null,
      generationStartedAt: entry.generationStartedAt || null,
      turnTiming: cloneJson(entry.turnLatency || null),
      status: completionPhase === 'visibleResponsePosted'
        ? 'posted'
        : (releasePhase === 'hostContinueReleased' ? 'hostContinueReleased' : (diagnosticStatus || recoveryStatus))
    };
  }

  function statusFromCoreResponseProjection(projection = null, fallbackStatus = null) {
    const fallback = compact(fallbackStatus);
    if ([
      'recoveryRequired',
      'responseRetryRequired',
      'coreRecoveryProjected',
      'coreRecoveryDiagnosticProjected',
      'unavailable',
      'failed'
    ].includes(fallback)) return fallback;
    const status = compact(projection?.status);
    if (status === 'hostContinueReleased') return 'released';
    if (status === 'posted') return fallback === 'complete' ? 'complete' : 'posted';
    return fallback || status || 'posted';
  }

  function coreResponseCompatibilityMirror(projection = null, {
    mirroredOperation = 'responseProjection'
  } = {}) {
    if (projection) {
      return {
        kind: 'directive.coreResponseCompatibilityMirror.v1',
        source: 'coreStoreV2',
        mirroredOperation,
        responseId: projection.responseId || projection.id || null,
        transactionId: projection.transactionId || projection.coreTransactionId || null,
        status: projection.status || null
      };
    }
    return null;
  }

  function requireCoreResponseProjection(entry = {}, {
    mirroredOperation = 'responseProjection'
  } = {}) {
    const responseId = compact(entry.id || entry.responseId || entry.idempotencyKey);
    const transactionId = compact(entry.coreTransactionId || entry.transactionId || entry.coreRelease?.transactionId);
    const error = new Error(`Response compatibility write ${responseId || transactionId || mirroredOperation} requires CORE response projection evidence.`);
    error.code = 'DIRECTIVE_CORE_RESPONSE_PROJECTION_REQUIRED';
    error.details = {
      responseId: responseId || null,
      transactionId: transactionId || null,
      mirroredOperation
    };
    throw error;
  }

  async function recordDirectiveResponseCompatibility(campaignState, entry = {}, {
    coreDiagnostic = null,
    mirroredOperation = 'responseProjection'
  } = {}) {
    const projection = await readCoreResponseProjectionFor(entry);
    if (projection) {
      return recordDirectiveResponse(campaignState, {
        ...entry,
        id: entry.id || compact(projection.id || projection.responseId) || null,
        hostMessageId: compact(projection.hostMessageId) || entry.hostMessageId || null,
        outcomeId: compact(projection.outcomeId) || entry.outcomeId || null,
        responseKind: entry.responseKind || compact(projection.responseKind) || null,
        generationStartedAt: entry.generationStartedAt || projection.generationStartedAt || null,
        turnLatency: cloneJson(entry.turnLatency || projection.turnTiming || null),
        coreTransactionId: compact(projection.transactionId || projection.coreTransactionId) || entry.coreTransactionId || null,
        status: statusFromCoreResponseProjection(projection, entry.status),
        projectionSource: 'coreStoreV2',
        authority: 'compatibilityProjection',
        compatibilityMirror: coreResponseCompatibilityMirror(projection, { mirroredOperation }),
        coreProjection: {
          kind: 'directive.coreResponseProjectionRef.v1',
          id: projection.id || projection.responseId || null,
          responseId: projection.responseId || projection.id || null,
          transactionId: projection.transactionId || projection.coreTransactionId || null,
          status: projection.status || null
        }
      }, {
        missingCoreWriteMode: 'reject'
      });
    }
    if (coreDiagnostic) return campaignState;
    requireCoreResponseProjection(entry, { mirroredOperation });
  }

  async function updateDirectiveResponseCompatibility(campaignState, responseId, patch = {}, {
    coreDiagnostic = null,
    mirroredOperation = 'responseProjection'
  } = {}) {
    const existing = await findResponse(campaignState, responseId) || {};
    const stableResponseId = compact(existing.id || existing.responseId || patch.id || patch.responseId || responseId);
    const entry = {
      ...existing,
      ...patch,
      id: stableResponseId || compact(responseId) || null
    };
    const projection = await readCoreResponseProjectionFor(entry);
    if (projection) {
      const projectionResponseId = compact(projection.id || projection.responseId);
      const updateId = stableResponseId || projectionResponseId;
      if (!updateId) return campaignState;
      return updateDirectiveResponse(campaignState, updateId, {
        ...patch,
        hostMessageId: compact(projection.hostMessageId) || patch.hostMessageId || existing.hostMessageId || null,
        outcomeId: compact(projection.outcomeId) || patch.outcomeId || existing.outcomeId || null,
        responseKind: patch.responseKind || existing.responseKind || compact(projection.responseKind) || null,
        generationStartedAt: patch.generationStartedAt || existing.generationStartedAt || projection.generationStartedAt || null,
        turnLatency: cloneJson(patch.turnLatency || existing.turnLatency || projection.turnTiming || null),
        coreTransactionId: compact(projection.transactionId || projection.coreTransactionId) || patch.coreTransactionId || existing.coreTransactionId || null,
        status: statusFromCoreResponseProjection(projection, patch.status || existing.status),
        projectionSource: 'coreStoreV2',
        authority: 'compatibilityProjection',
        compatibilityMirror: coreResponseCompatibilityMirror(projection, { mirroredOperation }),
        coreProjection: {
          kind: 'directive.coreResponseProjectionRef.v1',
          id: projection.id || projection.responseId || null,
          responseId: projection.responseId || projection.id || null,
          transactionId: projection.transactionId || projection.coreTransactionId || null,
          status: projection.status || null
        }
      }, {
        missingCoreWriteMode: 'reject'
      });
    }
    if (coreDiagnostic) return campaignState;
    requireCoreResponseProjection(entry, { mirroredOperation });
  }

  function hostMessageId(message = {}, index = null) {
    return compact(
      message.hostMessageId
      || message.id
      || message.messageId
      || message.message_id
      || (Number.isInteger(message.index) ? message.index : null)
      || (Number.isInteger(index) ? index : null)
    );
  }

  function hostMessageText(message = {}) {
    return compact(message.text || message.mes || message.content || '');
  }

  function hostMessageTextHash(message = {}, text = null) {
    const sourceText = text === null || text === undefined ? hostMessageText(message) : compact(text);
    if (sourceText) return hashStableJson({ text: sourceText });
    const existing = compact(message?.textHash);
    return existing || null;
  }

  function isUserHostMessage(message = {}) {
    return message.isUser === true || message.is_user === true || message.role === 'user';
  }

  function isSystemHostMessage(message = {}) {
    return message.isSystem === true || message.is_system === true || message.role === 'system';
  }

  function isDirectiveOwnedHostMessage(message = {}) {
    return message.isDirectiveOwned === true || message.directiveOwned === true || Boolean(message.metadata?.directive);
  }

  function hostMessageDiagnosticRef(message = {}, index = null) {
    const text = hostMessageText(message);
    return {
      hostMessageId: hostMessageId(message, index) || null,
      index: Number.isInteger(message?.index) ? message.index : (Number.isInteger(index) ? index : null),
      isUser: isUserHostMessage(message),
      isSystem: isSystemHostMessage(message),
      isDirectiveOwned: isDirectiveOwnedHostMessage(message),
      textHash: hostMessageTextHash(message, text),
      textLength: text.length,
      visibilityReason: message?.visibility?.reason || message?.visibilityReason || null
    };
  }

  function safeHostContinuationRef(hostContinuation = null) {
    if (!hostContinuation || typeof hostContinuation !== 'object') return cloneJson(hostContinuation);
    const result = cloneJson(hostContinuation);
    const observedMessage = hostContinuation.observedMessage || hostContinuation.message || null;
    delete result.observedMessage;
    delete result.message;
    if (observedMessage) {
      result.observedMessage = hostMessageDiagnosticRef(observedMessage, observedMessage.index ?? null);
    }
    return result;
  }

  function recentWindowAfterPlayer(recent = [], playerIndex = -1, { limit = 8 } = {}) {
    if (!Array.isArray(recent) || playerIndex < 0) return [];
    return recent
      .slice(playerIndex + 1, playerIndex + 1 + Math.max(1, Number(limit) || 8))
      .map((message, offset) => hostMessageDiagnosticRef(message, playerIndex + 1 + offset));
  }

  async function acceptState(next, summary) {
    setCampaignState?.(next);
    if (typeof persist === 'function') await persist(next, summary);
    return next;
  }

  async function recordCoreHostContinueRelease({
    ingress = null,
    responseId = null,
    hostContinuation = null,
    turnLatency = null,
    directivePromptRevisionUsed = null
  } = {}) {
    if (typeof coreTurnStore?.advanceTurn !== 'function') return null;
    const transactionId = ingressCoreTransactionId(ingress);
    if (!transactionId || hostContinuation?.released !== true) return null;
    const routePendingIdempotencyKey = `route-pending:${transactionId}`;
    await coreTurnStore.advanceTurn(transactionId, {
      phase: 'routePending',
      route: null,
      reason: 'host-continue-release-bridge',
      idempotencyKey: routePendingIdempotencyKey,
      directivePromptRevisionUsed,
      timing: {
        playerSubmittedAt: ingress.playerSubmittedAt || ingress.receivedAt || null,
        turnObservedAt: ingress.receivedAt || null
      }
    });
    return coreTurnStore.advanceTurn(transactionId, {
      phase: 'hostContinueReleased',
      route: 'hostContinue',
      reason: 'directive-inject-and-continue',
      idempotencyKey: `host-continue-release:${responseId || transactionId}`,
      responseId,
      responseKind: 'hostContinue',
      outcomeId: ingress?.outcomeId || null,
      directivePromptRevisionUsed,
      timing: {
        playerSubmittedAt: ingress.playerSubmittedAt || ingress.receivedAt || null,
        turnObservedAt: ingress.receivedAt || null,
        routeDecidedAt: hostContinuation.hostGenerationReleasedAt || hostContinuation.generationStartedAt || null,
        hostGenerationReleasedAt: hostContinuation.hostGenerationReleasedAt || hostContinuation.generationStartedAt || null,
        generationStartLatencyMs: turnLatency?.generationStartLatencyMs ?? null,
        architectureWithin60s: turnLatency?.architectureWithin60s ?? null,
        externalPromptMayIncludeHostMaterial: true
      }
    });
  }

  async function appendCoreHostContinueReleaseDiagnostic({
    ingress = null,
    responseId = null,
    outcomeId = null,
    turnId = null,
    hostContinuation = null,
    hostGenerationReleasedAt = null,
    turnLatency = null,
    error = null
  } = {}) {
    if (typeof coreTurnStore?.appendDiagnostics !== 'function') return null;
    const transactionId = ingressCoreTransactionId(ingress);
    if (!transactionId || !responseId) return null;
    return coreTurnStore.appendDiagnostics(transactionId, {
      type: 'sidecar',
      worker: 'hostContinueReleaseRecord',
      status: 'failed',
      severity: 'error',
      eventType: 'coreHostContinueReleaseFailure',
      responseId,
      ingressId: ingress.id || null,
      outcomeId: outcomeId || null,
      turnId: turnId || null,
      transactionId,
      sourceFrameId: ingress.sourceFrameId || ingress.sourceFrame?.id || null,
      hostGenerationReleasedAt: hostGenerationReleasedAt || null,
      hostContinuation: safeHostContinuationRef(hostContinuation),
      turnLatency: cloneJson(turnLatency || null),
      error: compactRecoveryWriterErrorRef(error, 'DIRECTIVE_CORE_HOST_CONTINUE_RELEASE_FAILED'),
      repairPolicy: {
        action: 'repairCoreHostContinueRelease',
        hostRepairAvailable: false
      }
    });
  }

  async function recordCoreVisibleResponse({
    ingress = null,
    entry = null,
    responseText = '',
    directivePromptRevisionUsed = null,
    repairDecision = null
  } = {}) {
    if (typeof coreTurnStore?.advanceTurn !== 'function' || typeof coreTurnStore?.recordVisibleResponse !== 'function') return null;
    const transactionId = ingressCoreTransactionId(ingress);
    if (!transactionId || !entry?.hostMessageId) return null;
    try {
      await coreTurnStore.advanceTurn(transactionId, {
        phase: 'routePending',
        route: 'directivePosted',
        reason: 'directive-visible-response-bridge',
        idempotencyKey: `route-pending:${transactionId}`,
        directivePromptRevisionUsed
      });
    } catch (error) {
      const isAlreadyPastRoutePending = error?.code === 'DIRECTIVE_CORE_INVALID_PHASE_TRANSITION'
        && /-> routePending/.test(error?.message || '');
      if (!isAlreadyPastRoutePending) throw error;
    }
    return coreTurnStore.recordVisibleResponse(transactionId, {
      kind: entry.responseKind || 'narration',
      responseId: entry.id || null,
      hostMessageId: entry.hostMessageId || null,
      outcomeId: entry.outcomeId || null,
      postedAt: entry.postedAt || null,
      directiveGenerationStartedAt: entry.directiveGenerationStartedAt || null,
      generationStartedAt: entry.directiveGenerationStartedAt || entry.generationStartedAt || null,
      turnLatency: entry.turnLatency || null,
      textHash: responseText ? hashContinuityText(responseText) : null,
      repairDecision: repairDecision || undefined,
      idempotencyKey: `visible-response:${entry.id || transactionId}`
    });
  }

  async function recordCoreHostNativeCompletion({
    ingress = null,
    responseId = null,
    outcomeId = null,
    observedMessage = null,
    observedText = '',
    completedAt = null,
    hostGenerationReleasedAt = null,
    generationStartedAt = null,
    turnLatency = null,
    repairDecision = null
  } = {}) {
    if (typeof coreTurnStore?.recordVisibleResponse !== 'function') return null;
    const transactionId = ingressCoreTransactionId(ingress);
    if (!transactionId || !observedMessage || !responseId) return null;
    const observedHostMessageId = observedMessage.hostMessageId || observedMessage.id || null;
    if (!observedHostMessageId) return null;
    return coreTurnStore.recordVisibleResponse(transactionId, {
      kind: 'hostContinue',
      responseId,
      hostMessageId: observedHostMessageId,
      outcomeId,
      postedAt: completedAt,
      hostGenerationReleasedAt,
      generationStartedAt: generationStartedAt || hostGenerationReleasedAt || null,
      turnLatency,
      textHash: hostMessageTextHash(observedMessage, observedText),
      repairDecision: repairDecision || undefined,
      idempotencyKey: `host-native-visible:${responseId}`
    });
  }

  async function appendCoreVisibleResponseRecordDiagnostic({
    ingress = null,
    responseId = null,
    outcomeId = null,
    turnId = null,
    hostMessageId = null,
    visibleResponsePostedAt = null,
    turnLatency = null,
    error = null
  } = {}) {
    if (typeof coreTurnStore?.appendDiagnostics !== 'function') return null;
    const transactionId = ingressCoreTransactionId(ingress);
    if (!transactionId || !responseId) return null;
    return coreTurnStore.appendDiagnostics(transactionId, {
      type: 'sidecar',
      worker: 'visibleResponseRecord',
      status: 'failed',
      severity: 'error',
      eventType: 'coreVisibleResponseRecordFailure',
      responseId,
      ingressId: ingress.id || null,
      outcomeId: outcomeId || null,
      turnId: turnId || null,
      transactionId,
      sourceFrameId: ingress.sourceFrameId || ingress.sourceFrame?.id || null,
      hostMessageId: hostMessageId || null,
      visibleResponsePostedAt: visibleResponsePostedAt || null,
      turnLatency: cloneJson(turnLatency || null),
      error: compactRecoveryWriterErrorRef(error, 'DIRECTIVE_CORE_VISIBLE_RESPONSE_RECORD_FAILED'),
      repairPolicy: {
        action: 'repairCoreVisibleResponseRecord',
        repostVisibleResponse: false
      }
    });
  }

  async function appendCoreHostNativeCompletionDiagnostic({
    ingress = null,
    responseId = null,
    outcomeId = null,
    turnId = null,
    observedHostMessageId = null,
    hostGenerationReleasedAt = null,
    turnLatency = null,
    error = null
  } = {}) {
    if (typeof coreTurnStore?.appendDiagnostics !== 'function') return null;
    const transactionId = ingressCoreTransactionId(ingress);
    if (!transactionId || !responseId) return null;
    return coreTurnStore.appendDiagnostics(transactionId, {
      type: 'sidecar',
      worker: 'hostNativeCompletionRecord',
      status: 'failed',
      severity: 'error',
      eventType: 'coreHostNativeCompletionFailure',
      responseId,
      ingressId: ingress.id || null,
      outcomeId: outcomeId || null,
      turnId: turnId || null,
      transactionId,
      sourceFrameId: ingress.sourceFrameId || ingress.sourceFrame?.id || null,
      observedMessage: {
        hostMessageId: observedHostMessageId || null
      },
      hostGenerationReleasedAt: hostGenerationReleasedAt || null,
      turnLatency: cloneJson(turnLatency || null),
      error: compactRecoveryWriterErrorRef(error, 'DIRECTIVE_CORE_HOST_NATIVE_COMPLETION_FAILED'),
      repairPolicy: {
        action: 'repairCoreHostNativeCompletion',
        retryHostGeneration: false
      }
    });
  }

  async function markCoreHostNativeFailure({
    ingress = null,
    responseId = null,
    outcomeId = null,
    turnId = null,
    decision = null,
    eventType = null,
    observationStatus = null,
    error = null,
  } = {}) {
    if (!responseId) return null;
    const handleResponseFailure = repair.handleResponseFailure || repair.recordResponseRecovery;
    return handleResponseFailure.call(repair, {
      eventType: eventType || decision?.eventType || null,
      observationStatus,
      reason: decision?.reason || null,
      ingress,
      responseId,
      outcomeId,
      turnId,
      recoveryId: `recovery:host-native:${responseId}`,
      error
    });
  }

  async function markCoreHostNativeContradiction({
    campaignState = null,
    ingress = null,
    responseId = null,
    outcomeId = null,
    turnId = null,
    error = null,
    continuityReview = null,
    eventTime = null
  } = {}) {
    if (!responseId) return null;
    const recoveryId = `recovery:continuity:${responseId}`;
    const handleContinuityContradiction = repair.handleHostNativeContinuityContradiction
      || repair.recordHostNativeContinuityContradiction;
    if (typeof handleContinuityContradiction === 'function') {
      return handleContinuityContradiction.call(repair, {
        campaignState,
        ingress,
        responseId,
        outcomeId,
        turnId,
        recoveryId,
        error,
        continuityReview: cloneJson(continuityReview || null),
        eventTime
      });
    }
    const handleResponseFailure = repair.handleResponseFailure || repair.recordResponseRecovery;
    return handleResponseFailure.call(repair, {
      eventType: 'hostNativeContinuityContradiction',
      observationStatus: 'completed',
      reason: 'hostNativeContinuityContradiction',
      campaignState,
      ingress,
      responseId,
      outcomeId,
      turnId,
      recoveryId,
      error,
      continuityReview: cloneJson(continuityReview || null),
      eventTime
    });
  }

  function hostNativeFailurePolicy(status, {
    ingress = null,
    responseId = null,
    outcomeId = null,
    turnId = null,
    error = null
  } = {}) {
    return repair.evaluateResponseRecovery({
      eventType: status === 'failed' ? 'hostNativeGenerationFailed' : 'hostNativeAssistantUnavailable',
      observationStatus: status,
      ingress,
      responseId,
      outcomeId,
      turnId,
      error
    });
  }

  async function findResponseRecovery(campaignState, response = null) {
    if (!response) return null;
    const projectedCoreRecovery = await projectedCoreRecoveryForResponse(response);
    if (projectedCoreRecovery) {
      return {
        id: projectedCoreRecovery.id || projectedCoreRecovery.recoveryId || null,
        type: projectedCoreRecovery.repairDecision?.eventType || projectedCoreRecovery.reason || null,
        status: projectedCoreRecovery.status || null,
        ingressId: response.ingressId || null,
        outcomeId: projectedCoreRecovery.dependentOutcomeId || response.outcomeId || null,
        details: {
          responseId: projectedCoreRecovery.dependentResponseId || response.id || null,
          turnId: response.turnId || null,
          coreTransactionId: projectedCoreRecovery.transactionId || response.coreTransactionId || null,
          coreRecovery: {
            id: projectedCoreRecovery.id || projectedCoreRecovery.recoveryId || null,
            phase: projectedCoreRecovery.phase || null,
            reason: projectedCoreRecovery.reason || null,
            status: projectedCoreRecovery.status || null
          },
          repairDecision: cloneJson(projectedCoreRecovery.repairDecision || null),
          recoveryPolicy: {
            allowedActions: cloneJson(projectedCoreRecovery.allowedActions || [])
          }
        }
      };
    }
    const recoveryIds = [
      response.recoveryId,
      `recovery:host-native:${response.id}`,
      `recovery:continuity:${response.id}`,
      `recovery:core-host-native-completion:${response.id}`
    ].map(compact).filter(Boolean);
    for (const recoveryId of recoveryIds) {
      const recovery = await findLedgerRecoveryAsync(campaignState, { id: recoveryId }, { coreTurnStore });
      if (recovery) return recovery;
    }
    return null;
  }

  async function evaluateResponseReobserveClosure({
    campaignState,
    response = null,
    transaction = null,
    observedHostMessageId = null,
    textHash = null,
    eventTime = null
  } = {}) {
    const authorizeReobserveClosure = repair?.authorizeReobserveClosure || repair?.evaluateResponseReobserveClosure;
    if (!response || typeof authorizeReobserveClosure !== 'function') return null;
    const recovery = await findResponseRecovery(campaignState, response);
    return authorizeReobserveClosure.call(repair, {
      response,
      recovery,
      recoveryDecision: recovery?.details?.repairDecision || null,
      transaction,
      transactionId: transaction?.id || response.coreTransactionId || response.coreRelease?.transactionId || null,
      observedHostMessageId,
      textHash,
      eventTime
    });
  }

  async function closeResponseReobserveProjection({
    campaignState,
    response = null,
    observedHostMessageId = null,
    observedIndex = null,
    textHash = null,
    eventTime = null,
    turnLatency = null,
    coreCompletion = null,
    repairDecision = null
  } = {}) {
    if (!response?.id) return campaignState;
    const recovery = await findResponseRecovery(campaignState, response);
    let next = await updateDirectiveResponseCompatibility(campaignState, response.id, {
      status: 'complete',
      hostMessageId: observedHostMessageId,
      hostCompletedAt: eventTime,
      turnLatency,
      hostObservationStatus: 'completed',
      hostObservation: {
        hostMessageId: observedHostMessageId,
        index: Number.isInteger(observedIndex) ? observedIndex : null,
        textHash
      },
      coreCompletion: coreCompletion ? {
        transactionId: coreCompletion.id || response.coreTransactionId || response.coreRelease?.transactionId || null,
        phase: coreCompletion.phase || null,
        route: coreCompletion.route || null
      } : null,
      reobserveClosure: repairDecision ? {
        kind: repairDecision.kind || null,
        authorized: repairDecision.authorized === true,
        reason: repairDecision.reason || null,
        eventType: repairDecision.eventType || null,
        recoveryCaseId: repairDecision.recoveryCaseId || null
      } : null
    }, {
      mirroredOperation: 'hostNativeReobserveClosure'
    });
    if (recovery?.id) {
      next = resolveRecoveryEvent(next, recovery.id, {
        status: 'resolved',
        reason: repairDecision?.reason || 'host-native-response-reobserved',
        resolvedAt: eventTime || timestamp(now),
        responseId: response.id,
        hostMessageId: observedHostMessageId,
        textHash,
        repairDecision: cloneJson(repairDecision || null)
      });
    }
    return next;
  }

  async function settleHostNativeContinuityContradiction(input = {}) {
    const {
      campaignState,
      ingress = null,
      response = null,
      responseId = null,
      ingressId = null,
      outcomeId = null,
      turnId = null,
      observedMessage = null,
      observedText = '',
      observedTextHash = null,
      eventTime = null,
      turnLatency = null,
      coreCompletion = null,
      packageData = null,
      crewDataset = null,
      shipDataset = null,
      campaignProjection = null,
      continuityReview = undefined
    } = input;
    const text = compact(observedText);
    if (!text) {
      return { ok: true, recoveryRequired: false, campaignState, continuityReview: null };
    }
    const review = await sourceReview.reviewHostNativeContinuity({
      mode: 'hostNativeCompletion',
      text,
      campaignState,
      packageData,
      crewDataset,
      shipDataset,
      campaignProjection,
      responseId: responseId || response?.id || null,
      ingressId,
      outcomeId,
      turnId,
      observedMessage,
      observedTextHash,
      continuityReview: Object.prototype.hasOwnProperty.call(input, 'continuityReview')
        ? continuityReview
        : undefined
    });
    if (review?.ok !== false) {
      return { ok: true, recoveryRequired: false, campaignState, continuityReview: cloneJson(review) };
    }
    const id = responseId || response?.id || null;
    const recoveryId = `recovery:continuity:${id || ingress?.coreTransactionId || 'host-native'}`;
    const hostId = observedMessage?.hostMessageId || observedMessage?.id || null;
    const observedAt = eventTime || timestamp(now);
    const continuityError = {
      code: 'DIRECTIVE_HOST_NATIVE_CONTINUITY_CONTRADICTION',
      message: 'Host-native generation contradicted protected continuity facts and requires recovery.'
    };
    let coreRecovery = null;
    let coreRecoveryError = null;
    let coreRecoveryDiagnosticRecorded = false;
    let repairDecision = null;
    try {
      coreRecovery = await markCoreHostNativeContradiction({
        campaignState,
        ingress,
        responseId: id,
        outcomeId,
        turnId,
        error: continuityError,
        continuityReview: review,
        eventTime: observedAt
      });
      repairDecision = coreRecovery?.decision || null;
    } catch (error) {
      coreRecoveryError = compactRecoveryWriterErrorRef(error, 'DIRECTIVE_CORE_HOST_NATIVE_CONTRADICTION_RECOVERY_FAILED');
      repairDecision = repair.evaluateResponseRecovery({
        eventType: 'hostNativeContinuityContradiction',
        observationStatus: 'completed',
        campaignState,
        ingress,
        responseId: id,
        outcomeId,
        turnId,
        error: continuityError
      });
      if (typeof coreTurnStore?.appendDiagnostics === 'function' && ingress?.coreTransactionId) {
        try {
          await coreTurnStore.appendDiagnostics(ingress.coreTransactionId, {
            type: 'sidecar',
            worker: 'hostNativeContinuityRecovery',
            status: 'failed',
            severity: 'error',
            eventType: 'hostNativeContinuityContradiction',
            responseId: id || null,
            ingressId: ingressId || null,
            outcomeId: outcomeId || null,
            turnId: turnId || null,
            transactionId: ingress.coreTransactionId,
            sourceFrameId: ingress.sourceFrameId || ingress.sourceFrame?.id || null,
            observedMessage: {
              hostMessageId: hostId || null,
              textHash: observedTextHash || hostMessageTextHash(observedMessage || {}, text)
            },
            error: coreRecoveryError,
            repairPolicy: {
              policySource: repairDecision?.policySource || null,
              action: repairDecision?.recoveryAction || repairDecision?.action || null,
              preferredFirstAction: repairDecision?.preferredFirstAction || null
            }
          });
          coreRecoveryDiagnosticRecorded = true;
        } catch {
          // Best-effort diagnostic only; sanitized compatibility bridge still carries failure state.
        }
      }
    }
    const coreProjectionSupplied = coreRecovery && Object.prototype.hasOwnProperty.call(coreRecovery, 'compatibilityProjection');
    const decisionProjectionSupplied = repairDecision && Object.prototype.hasOwnProperty.call(repairDecision, 'compatibilityProjection');
    const suppliedCompatibilityProjection = coreProjectionSupplied
      ? coreRecovery.compatibilityProjection
      : (decisionProjectionSupplied ? repairDecision.compatibilityProjection : null);
    const suppliedProjectionValid = compatibilityProjectionIsComplete(suppliedCompatibilityProjection);
    const compatibilityProjection = suppliedProjectionValid
      ? suppliedCompatibilityProjection
      : sanitizedHostNativeContinuityCompatibilityProjection({
        recoveryId,
        responseId: id,
        ingressId,
        outcomeId,
        turnId,
        hostMessageId: hostId,
        observedTextHash: observedTextHash || hostMessageTextHash(observedMessage || {}, text),
        observedAt,
        review,
        repairDecision,
        coreRecovery,
        coreRecoveryError,
        campaignState,
        reason: coreRecoveryError
          ? 'repairWriterFailure'
          : ((coreProjectionSupplied || decisionProjectionSupplied)
            ? 'invalidRepairCompatibilityProjection'
            : 'missingRepairCompatibilityProjection')
      });
    const coreBackedRecoveryRecorded = coreRecovery?.status === 'recorded' && !coreRecoveryError;
    const projectionRecoveryId = compatibilityProjectionRecoveryId(compatibilityProjection);
    const coreRecoveryId = compact(coreRecovery?.recoveryCaseId || coreRecovery?.id || coreRecovery?.recoveryId);
    const coreDiagnosticBackedRecoveryFailure = Boolean(coreRecoveryError && coreRecoveryDiagnosticRecorded);
    const effectiveRecoveryId = coreBackedRecoveryRecorded
      ? (coreRecoveryId || recoveryId)
      : (coreDiagnosticBackedRecoveryFailure ? recoveryId : (projectionRecoveryId || recoveryId));

    let next = campaignState;
    if (id && await findResponse(next, id)) {
      const baseRecoveryPatch = {
        hostCompletedAt: observedAt,
        turnLatency,
        hostObservationStatus: 'completed',
        hostObservation: {
          hostMessageId: hostId,
          index: observedMessage?.index ?? null,
          textHash: observedTextHash || hostMessageTextHash(observedMessage || {}, text)
        },
        coreCompletion: coreCompletion ? {
          transactionId: coreCompletion.id || ingress?.coreTransactionId || null,
          phase: coreCompletion.phase || null,
          route: coreCompletion.route || null
        } : null,
      };
      next = await updateDirectiveResponseCompatibility(next, id, coreBackedRecoveryRecorded
        ? {
            ...baseRecoveryPatch,
            status: 'coreRecoveryProjected',
            recoveryId: null,
            coreRecovery: null,
            coreRecoveryError: null,
            continuityReview: null
          }
        : (coreDiagnosticBackedRecoveryFailure ? {
            ...baseRecoveryPatch,
            status: 'coreRecoveryDiagnosticProjected',
            recoveryId: null,
            coreRecovery: null,
            coreRecoveryError: null,
            continuityReview: null
          }
        : {
            ...baseRecoveryPatch,
            status: 'recoveryRequired',
            recoveryId: effectiveRecoveryId,
            coreRecovery: coreRecovery ? {
              id: coreRecovery.recoveryCaseId || null,
              status: coreRecovery.status || null,
              phase: coreRecovery.phase || null,
              reason: coreRecovery.reason || null
            } : null,
            coreRecoveryError,
            continuityReview: cloneJson(review)
          }), {
            mirroredOperation: 'hostNativeContinuityRecovery'
          });
    }
    const projectionApplication = applyHostNativeContinuityCompatibilityProjection(next, compatibilityProjection, {
      ingressId,
      applyContinuityProjection: !coreBackedRecoveryRecorded,
      applyRecoveryEvent: !(coreBackedRecoveryRecorded || coreDiagnosticBackedRecoveryFailure),
      applyIngressPatch: !(coreBackedRecoveryRecorded || coreDiagnosticBackedRecoveryFailure)
    });
    if (projectionApplication.applied) {
      next = projectionApplication.campaignState;
    } else if (coreDiagnosticBackedRecoveryFailure) {
      next = cloneJson(next);
    } else {
      next = cloneJson(next);
    }
    return {
      ok: false,
      recoveryRequired: true,
      status: 'recoveryRequired',
      recoveryId: coreBackedRecoveryRecorded
        ? effectiveRecoveryId
        : (coreDiagnosticBackedRecoveryFailure ? effectiveRecoveryId : (projectionApplication.recoveryId || effectiveRecoveryId)),
      campaignState: cloneJson(next),
      continuityReview: cloneJson(review),
      coreRecovery: cloneJson(coreRecovery || null),
      coreRecoveryError,
      coreDiagnosticBackedRecoveryFailure,
      repairDecision: cloneJson(repairDecision || null),
      compatibilityProjection: projectionApplication.applied ? cloneJson(compatibilityProjection) : null
    };
  }

  async function readCoreTerminalSettlement(ingress = null, {
    settlementStatus = null,
    hasObservedMessage = false,
    response = null,
    observedHostMessageId = null,
    observedTextHash = null,
    eventTime = null,
    campaignState = null
  } = {}) {
    if (typeof coreTurnStore?.getTransaction !== 'function') return null;
    const transactionId = ingressCoreTransactionId(ingress);
    if (!transactionId) return null;
    const transaction = await coreTurnStore.getTransaction(transactionId);
    if (transaction?.visibleResponseRef) {
      return { status: 'visibleResponseRecorded', transaction };
    }
    if (transaction?.recoveryCaseId) {
      if (settlementStatus === 'completed' && hasObservedMessage) {
        const closure = await evaluateResponseReobserveClosure({
          campaignState,
          response,
          transaction,
          observedHostMessageId,
          textHash: observedTextHash,
          eventTime
        });
        if (closure?.authorized === true) {
          return null;
        }
      }
      if (transaction.phase === 'responseRetryRequired' && settlementStatus === 'completed' && hasObservedMessage) {
        return null;
      }
      return { status: transaction.phase || 'recoveryRequired', transaction };
    }
    return null;
  }

  async function handleHostGenerationSettled({
    settlement = null,
    responseId = null,
    ingressId = null,
    outcomeId = null,
    turnId = null,
    packageData = null,
    crewDataset = null,
    shipDataset = null,
    campaignProjection = null
  } = {}) {
    try {
      const current = resolveState();
      const response = await findResponse(current, responseId);
      if (!response) return null;
      const ingress = await findIngress(current, ingressId);
      const status = settlement?.status || (settlement?.ok === false ? 'failed' : 'completed');
      const eventTime = settlement?.completedAt || settlement?.failedAt || timestamp(now);
      const hostGenerationReleasedAt = settlement?.hostGenerationReleasedAt
        || settlement?.generationStartedAt
        || response.hostGenerationReleasedAt
        || response.generationStartedAt
        || null;
      const observedMessage = settlement?.observedMessage || settlement?.message || null;
      const observedHostMessageId = observedMessage?.hostMessageId || observedMessage?.id || null;
      const observedText = compact(observedMessage?.text || observedMessage?.content || observedMessage?.mes || '');
      const observedTextHash = hostMessageTextHash(observedMessage || {}, observedText);
      const terminalSettlement = await readCoreTerminalSettlement(ingress, {
        settlementStatus: status,
        hasObservedMessage: Boolean(observedMessage && observedHostMessageId),
        response,
        observedHostMessageId,
        observedTextHash,
        eventTime,
        campaignState: current
      });
      if (terminalSettlement) {
        const visibleRef = terminalSettlement.transaction?.visibleResponseRef || null;
        const visibleHostMessageId = compact(visibleRef?.hostMessageId);
        const effectiveObservedHostMessageId = compact(observedHostMessageId) || visibleHostMessageId;
        const effectiveTextHash = observedTextHash || compact(visibleRef?.textHash);
        const visiblePostedAt = visibleRef?.postedAt || eventTime;
        const terminalTurnLatency = createTurnLatencyMetrics({
          playerSubmittedAt: ingress?.playerSubmittedAt || ingress?.receivedAt || null,
          turnObservedAt: ingress?.receivedAt || null,
          routeDecidedAt: hostGenerationReleasedAt,
          hostGenerationReleasedAt,
          visibleResponsePostedAt: visiblePostedAt
        });
        const repairRuntimeProjection = async (coreCompletion = terminalSettlement.transaction) => {
          if (!effectiveObservedHostMessageId || !effectiveTextHash) return false;
          const needsRuntimeProjectionRepair = !compact(response.hostMessageId)
            || !compact(response.hostObservation?.hostMessageId)
            || !compact(response.hostObservation?.textHash);
          if (!needsRuntimeProjectionRepair) return false;
          const next = await closeResponseReobserveProjection({
            campaignState: current,
            response,
            observedHostMessageId: effectiveObservedHostMessageId,
            observedIndex: observedMessage?.index ?? null,
            textHash: effectiveTextHash,
            eventTime: visiblePostedAt,
            turnLatency: terminalTurnLatency,
            coreCompletion,
            repairDecision: null
          });
          await acceptState(next, `Repaired host-native runtime projection for ${responseId || ingressId}.`);
          return true;
        };
        const canRepairMissingHash = terminalSettlement.status === 'visibleResponseRecorded'
          && typeof coreTurnStore?.repairVisibleResponseRef === 'function'
          && observedTextHash
          && visibleRef
          && !visibleRef.textHash
          && (!visibleHostMessageId || visibleHostMessageId === compact(observedHostMessageId));
        if (canRepairMissingHash) {
          const repaired = await coreTurnStore.repairVisibleResponseRef(ingress.coreTransactionId, {
            hostMessageId: observedHostMessageId,
            textHash: observedTextHash,
            reason: 'host-native-completion-reobserved-missing-hash',
            idempotencyKey: `visible-response-hash-repair:${responseId}`
          });
          await repairRuntimeProjection(repaired);
          return {
            ok: true,
            status: 'complete',
            repaired: true,
            terminalSettlement: {
              status: 'visibleResponseHashRepaired',
              transaction: repaired
            }
          };
        }
        const runtimeProjectionRepaired = await repairRuntimeProjection(terminalSettlement.transaction);
        return { ok: true, status: 'alreadySettled', runtimeProjectionRepaired, terminalSettlement };
      }
      const turnLatency = createTurnLatencyMetrics({
        playerSubmittedAt: ingress?.playerSubmittedAt || ingress?.receivedAt || null,
        turnObservedAt: ingress?.receivedAt || null,
        routeDecidedAt: hostGenerationReleasedAt,
        hostGenerationReleasedAt,
        visibleResponsePostedAt: status === 'completed' && observedMessage && observedHostMessageId ? eventTime : null
      });
      if (status === 'completed' && observedMessage && observedHostMessageId) {
        let repairClosure = null;
        if (response?.recoveryId || response?.coreRecovery) {
          const transactionId = ingressCoreTransactionId(ingress);
          const transaction = typeof coreTurnStore?.getTransaction === 'function' && transactionId
            ? await coreTurnStore.getTransaction(transactionId)
            : null;
          repairClosure = await evaluateResponseReobserveClosure({
            campaignState: current,
            response,
            transaction,
            observedHostMessageId,
            textHash: observedTextHash,
            eventTime
          });
        }
        let coreCompletion = null;
        let coreCompletionError = null;
        try {
          coreCompletion = await recordCoreHostNativeCompletion({
            ingress,
            responseId,
            outcomeId,
            observedMessage,
            observedText,
            completedAt: eventTime,
            hostGenerationReleasedAt,
            generationStartedAt: settlement?.generationStartedAt || hostGenerationReleasedAt,
            turnLatency,
            repairDecision: repairClosure
          });
        } catch (error) {
          coreCompletionError = compactError(error, 'DIRECTIVE_CORE_HOST_NATIVE_COMPLETION_FAILED');
        }
        let coreCompletionDiagnostic = null;
        if (coreCompletionError) {
          try {
            coreCompletionDiagnostic = await appendCoreHostNativeCompletionDiagnostic({
              ingress,
              responseId,
              outcomeId,
              turnId,
              observedHostMessageId,
              hostGenerationReleasedAt,
              turnLatency,
              error: coreCompletionError
            });
          } catch {
            // Fall through to the old sanitized recovery bridge below.
          }
        }
        const coreCompletionDiagnosticRecorded = Boolean(coreCompletionDiagnostic);
        const completionRecoveryId = `recovery:core-host-native-completion:${responseId}`;
        let next = await updateDirectiveResponseCompatibility(current, responseId, {
          status: coreCompletionError
            ? (coreCompletionDiagnosticRecorded ? 'coreRecoveryDiagnosticProjected' : 'recoveryRequired')
            : 'complete',
          hostMessageId: observedHostMessageId,
          recoveryId: coreCompletionError && !coreCompletionDiagnosticRecorded ? completionRecoveryId : null,
          hostCompletedAt: eventTime,
          turnLatency,
          hostObservation: {
            hostMessageId: observedHostMessageId,
            index: observedMessage.index ?? null,
            textHash: observedTextHash
          },
          coreCompletion: coreCompletion ? {
            transactionId: coreCompletion.id || ingress?.coreTransactionId || null,
            phase: coreCompletion.phase || null,
            route: coreCompletion.route || null
          } : null,
          reobserveClosure: repairClosure ? {
            kind: repairClosure.kind || null,
            authorized: repairClosure.authorized === true,
            reason: repairClosure.reason || null,
            eventType: repairClosure.eventType || null,
            recoveryCaseId: repairClosure.recoveryCaseId || null
          } : null,
          coreCompletionError: coreCompletionDiagnosticRecorded ? null : coreCompletionError,
          coreCompletionDiagnostic: coreCompletionDiagnosticRecorded ? {
            id: coreCompletionDiagnostic.id || null,
            worker: coreCompletionDiagnostic.payload?.worker || coreCompletionDiagnostic.worker || 'hostNativeCompletionRecord',
            status: coreCompletionDiagnostic.payload?.status || coreCompletionDiagnostic.status || 'failed'
          } : null
        }, {
          coreDiagnostic: coreCompletionDiagnostic || null,
          mirroredOperation: 'hostNativeCompletion'
        });
        if (!coreCompletionError && repairClosure?.recoveryResolved === true) {
          next = await closeResponseReobserveProjection({
            campaignState: next,
            response,
            observedHostMessageId,
            observedIndex: observedMessage.index ?? null,
            textHash: observedTextHash,
            eventTime,
            turnLatency,
            coreCompletion,
            repairDecision: repairClosure
          });
        }
        if (!coreCompletionError) {
          const contradictionSettlement = await settleHostNativeContinuityContradiction({
            campaignState: next,
            ingress,
            response,
            responseId,
            ingressId,
            outcomeId,
            turnId,
            observedMessage,
            observedText,
            observedTextHash,
            eventTime,
            turnLatency,
            coreCompletion,
            packageData,
            crewDataset,
            shipDataset,
            campaignProjection
          });
          if (contradictionSettlement.recoveryRequired === true) {
            await acceptState(contradictionSettlement.campaignState, `Recorded host-native continuity contradiction for ${ingressId || responseId}.`);
            return {
              ok: false,
              status: 'recoveryRequired',
              recoveryRequired: true,
              recoveryId: contradictionSettlement.recoveryId,
              continuityReview: cloneJson(contradictionSettlement.continuityReview)
            };
          }
        }
        await acceptState(next, `Recorded host-native completion for ${ingressId || responseId}.`);
        if (coreCompletionError) {
          return {
            ok: false,
            status: coreCompletionDiagnosticRecorded ? 'coreRecoveryDiagnosticProjected' : 'recoveryRequired',
            recoveryRequired: true,
            recoveryId: completionRecoveryId,
            coreDiagnostic: cloneJson(coreCompletionDiagnostic || null)
          };
        }
        return { ok: true, status: 'complete' };
      }

      const failurePolicy = hostNativeFailurePolicy(status, {
        ingress,
        responseId,
        outcomeId,
        turnId,
        error: settlement?.error || null
      });
      let coreRecovery = null;
      let coreRecoveryError = null;
      try {
        coreRecovery = await markCoreHostNativeFailure({
          ingress,
          responseId,
          outcomeId,
          turnId,
          decision: failurePolicy,
          eventType: failurePolicy.eventType,
          observationStatus: status,
          error: settlement?.error || null
        });
      } catch (error) {
        coreRecoveryError = compactError(error, 'DIRECTIVE_CORE_HOST_NATIVE_RECOVERY_FAILED');
      }
      const coreBackedRecoveryRecorded = coreRecovery?.status === 'recorded' && !coreRecoveryError;
      const recoveryId = `recovery:host-native:${responseId}`;
      let next = await updateDirectiveResponseCompatibility(current, responseId, {
        status: failurePolicy.responseStatus,
        recoveryId,
        hostCompletedAt: status === 'completed' ? eventTime : null,
        hostFailedAt: status === 'failed' ? eventTime : null,
        hostObservationStatus: status,
        hostObservationUnavailableAt: status === 'unavailable' || status === 'completed' ? eventTime : null,
        turnLatency,
        coreRecovery: coreRecovery ? {
          id: coreRecovery.id || null,
          status: coreRecovery.status || null,
          phase: coreRecovery.phase || null,
          reason: coreRecovery.reason || null
        } : null,
        coreRecoveryError,
        error: settlement?.error ? compactError(settlement.error, failurePolicy.errorCode) : null
      }, {
        mirroredOperation: 'hostNativeFailureRecovery'
      });
      await acceptState(next, `Recorded host-native ${failurePolicy.reason} for ${ingressId || responseId}.`);
      return { ok: false, status: failurePolicy.responseStatus, recoveryId };
    } catch {
      return null;
    }
  }

  async function reobserveHostGenerationCompletions({
    campaignState = null,
    limit = 500,
    packageData = null,
    crewDataset = null,
    shipDataset = null,
    campaignProjection = null
  } = {}) {
    if (typeof host?.chat?.getRecentMessages !== 'function') {
      return { ok: false, skipped: true, reason: 'host-recent-messages-unavailable' };
    }
    const state = resolveState(campaignState);
    const runtimeLedgerView = await createRuntimeLedgerViewAsync(state, { coreTurnStore, runtimeOverlay: true });
    const responseLedger = runtimeLedgerView.responseLedger || [];
    const responseNeedsHostReobserve = (entry = {}) => (
      entry?.strategy === 'injectAndContinue'
      && ['hostGeneration', 'hostContinue'].includes(compact(entry?.responseKind))
      && ['released', 'complete', 'hostContinueReleased'].includes(compact(entry?.status))
      && !compact(entry.hostMessageId)
      && !entry.hostObservation?.hostMessageId
    );
    const responsesById = new Map();
    for (const entry of responseLedger.filter(responseNeedsHostReobserve)) {
      responsesById.set(compact(entry.id || entry.responseId), entry);
    }
    const responses = [...responsesById.values()];
    let refreshResult = null;
    if (typeof host.chat.refreshCurrentChat === 'function') {
      try {
        refreshResult = await host.chat.refreshCurrentChat({
          reason: 'directive-reobserve-host-generation-completions'
        });
      } catch (error) {
        refreshResult = {
          ok: false,
          refreshed: false,
          error: compactError(error, 'DIRECTIVE_HOST_CHAT_REFRESH_FAILED')
        };
      }
    }
    const messages = await host.chat.getRecentMessages({ limit, playerSafeOnly: false });
    const recent = Array.isArray(messages) ? messages.filter(Boolean) : [];
    const usedAssistantIds = new Set(responseLedger
      .map((entry) => compact(entry.hostMessageId || entry.hostObservation?.hostMessageId))
      .filter(Boolean));
    const responseTransactionId = (entry = {}) => compact(entry.coreTransactionId || entry.transactionId || entry.coreRelease?.transactionId);
    const responsesByTransaction = new Map(responseLedger
      .map((entry) => [responseTransactionId(entry), entry])
      .filter(([transactionId]) => Boolean(transactionId)));
    const hostMessageClaims = new Map();
    for (const entry of responseLedger) {
      const claimedHostMessageId = compact(entry.hostMessageId || entry.hostObservation?.hostMessageId);
      if (!claimedHostMessageId) continue;
      hostMessageClaims.set(claimedHostMessageId, {
        transactionId: responseTransactionId(entry),
        responseId: entry.id || null
      });
    }
    const results = [];
    const processedTransactionIds = new Set();
    for (const response of responses) {
      const ingress = await findIngress(state, response.ingressId);
      const playerHostMessageId = compact(ingress?.hostMessageId);
      const playerIndex = recent.findIndex((message, index) => (
        playerHostMessageId && hostMessageId(message, index) === playerHostMessageId
      ));
      if (playerIndex < 0) {
        results.push({
          responseId: response.id,
          status: 'skipped',
          reason: 'player-ingress-message-not-found',
          playerHostMessageId: playerHostMessageId || null,
          recentMessageCount: recent.length,
          recentTail: recent.slice(-8).map((message, offset) => (
            hostMessageDiagnosticRef(message, recent.length - Math.min(recent.length, 8) + offset)
          ))
        });
        continue;
      }
      let candidate = null;
      let candidateIndex = -1;
      for (let index = playerIndex + 1; index < recent.length; index += 1) {
        const message = recent[index];
        const id = hostMessageId(message, index);
        if (!id) continue;
        const claim = hostMessageClaims.get(id) || null;
        const sameResponseClaim = Boolean(claim && (
          (claim.responseId && response.id && claim.responseId === response.id)
          || (claim.transactionId && responseTransactionId(response) && claim.transactionId === responseTransactionId(response))
        ));
        if (usedAssistantIds.has(id) && !sameResponseClaim) continue;
        if (isUserHostMessage(message) || isSystemHostMessage(message)) continue;
        candidate = message;
        candidateIndex = index;
        break;
      }
      if (!candidate) {
        results.push({
          responseId: response.id,
          status: 'skipped',
          reason: 'no-unclaimed-host-assistant-after-player',
          playerHostMessageId,
          playerIndex,
          recentMessageCount: recent.length,
          recentWindowAfterPlayer: recentWindowAfterPlayer(recent, playerIndex)
        });
        continue;
      }
      const observedText = hostMessageText(candidate);
      const observedHostMessageId = hostMessageId(candidate, candidateIndex);
        const settlementResult = await handleHostGenerationSettled({
        settlement: {
          kind: 'directive.hostGenerationObservation.v1',
          observationId: `reobserve:${response.id}`,
          ingressId: response.ingressId || null,
          status: 'completed',
          ok: true,
          released: true,
          waitForCompletion: false,
          generationStartedAt: response.generationStartedAt || response.hostGenerationReleasedAt || null,
          hostGenerationReleasedAt: response.hostGenerationReleasedAt || response.generationStartedAt || null,
          completedAt: timestamp(now),
          observedMessage: {
            hostMessageId: observedHostMessageId,
            index: candidate.index ?? candidateIndex,
            chatId: candidate.chatId || ingress?.chatId || null,
            text: observedText,
            textHash: hostMessageTextHash(candidate, observedText),
            textLength: observedText.length
          }
        },
        responseId: response.id,
        ingressId: response.ingressId,
        outcomeId: response.outcomeId || ingress?.outcomeId || null,
        turnId: response.turnId || ingress?.turnId || null,
        packageData,
        crewDataset,
        shipDataset,
        campaignProjection
      });
      usedAssistantIds.add(observedHostMessageId);
      results.push({
        responseId: response.id,
        status: settlementResult?.status || 'unknown',
        ok: settlementResult?.ok === true,
        hostMessageId: observedHostMessageId,
        index: candidate.index ?? candidateIndex,
        textHash: hostMessageTextHash(candidate, observedText)
      });
      const transactionId = responseTransactionId(response);
      if (transactionId) processedTransactionIds.add(transactionId);
    }
    const projectionResults = [];
    if (typeof coreTurnStore?.readProjections === 'function' && typeof coreTurnStore?.recordVisibleResponse === 'function') {
      const projections = await coreTurnStore.readProjections();
      const projectionResponses = Array.isArray(projections?.responseLedger) ? projections.responseLedger : [];
      const projectedVisibleResponseTransactions = new Set(projectionResponses
        .filter((entry) => entry?.status === 'posted')
        .map((entry) => entry.transactionId)
        .filter(Boolean));
      const hashlessHostContinueResponsesByTransaction = new Map(projectionResponses
        .filter((entry) => (
          entry?.transactionId
          && entry.responseKind === 'hostContinue'
          && compact(entry.hostMessageId)
          && !compact(entry.textHash)
        ))
        .map((entry) => [entry.transactionId, entry]));
      const postedHostContinueResponsesByTransaction = new Map(projectionResponses
        .filter((entry) => (
          entry?.transactionId
          && entry.responseKind === 'hostContinue'
          && entry.status === 'posted'
          && compact(entry.hostMessageId)
          && compact(entry.textHash)
        ))
        .map((entry) => [entry.transactionId, entry]));
      const hostContinueTimings = (projections?.turnTiming || []).filter((entry) => (
        entry?.transactionId
        && entry.route === 'hostContinue'
        && !processedTransactionIds.has(entry.transactionId)
        && (
          !projectedVisibleResponseTransactions.has(entry.transactionId)
          || hashlessHostContinueResponsesByTransaction.has(entry.transactionId)
          || postedHostContinueResponsesByTransaction.has(entry.transactionId)
        )
      ));
      for (const timing of hostContinueTimings) {
        const playerHostMessageId = compact(timing.hostMessageId);
        const playerIndex = recent.findIndex((message, index) => (
          playerHostMessageId && hostMessageId(message, index) === playerHostMessageId
        ));
        if (playerIndex < 0) {
          projectionResults.push({
            transactionId: timing.transactionId,
            status: 'skipped',
            reason: 'core-player-ingress-message-not-found',
            playerHostMessageId: playerHostMessageId || null,
            recentMessageCount: recent.length,
            recentTail: recent.slice(-8).map((message, offset) => (
              hostMessageDiagnosticRef(message, recent.length - Math.min(recent.length, 8) + offset)
            ))
          });
          continue;
        }
        let candidate = null;
        let candidateIndex = -1;
        const runtimeResponse = responsesByTransaction.get(timing.transactionId) || null;
        const ingress = runtimeResponse?.ingressId
          ? await findIngress(state, runtimeResponse.ingressId)
          : null;
        const runtimeHostObservation = runtimeResponse?.hostObservation || null;
        const hashlessProjectionResponse = hashlessHostContinueResponsesByTransaction.get(timing.transactionId) || null;
        const postedProjectionResponse = postedHostContinueResponsesByTransaction.get(timing.transactionId) || null;
        const projectedHostMessageId = compact(hashlessProjectionResponse?.hostMessageId || postedProjectionResponse?.hostMessageId);
        let coreTransaction = null;
        if (typeof coreTurnStore?.getTransaction === 'function') {
          try {
            coreTransaction = await coreTurnStore.getTransaction(timing.transactionId);
          } catch {
            coreTransaction = null;
          }
        }
        if (projectedHostMessageId) {
          const projectedIndex = recent.findIndex((message, index) => (
            hostMessageId(message, index) === projectedHostMessageId
          ));
          if (projectedIndex >= 0) {
            candidate = recent[projectedIndex];
            candidateIndex = projectedIndex;
          } else {
            projectionResults.push({
              transactionId: timing.transactionId,
              status: 'skipped',
              reason: 'core-hashless-host-assistant-message-not-found',
              hostMessageId: projectedHostMessageId,
              playerHostMessageId,
              playerIndex,
              recentMessageCount: recent.length,
              recentWindowAfterPlayer: recentWindowAfterPlayer(recent, playerIndex)
            });
            continue;
          }
        }
        if (runtimeHostObservation?.hostMessageId) {
          const observedIndex = recent.findIndex((message, index) => (
            hostMessageId(message, index) === compact(runtimeHostObservation.hostMessageId)
          ));
          if (observedIndex >= 0) {
            candidate = recent[observedIndex];
            candidateIndex = observedIndex;
          } else if (runtimeHostObservation.textHash) {
            const postedAt = timestamp(now);
            try {
              const repairClosure = await evaluateResponseReobserveClosure({
                campaignState: resolveState(),
                response: runtimeResponse,
                transaction: coreTransaction,
                observedHostMessageId: compact(runtimeHostObservation.hostMessageId),
                textHash: runtimeHostObservation.textHash,
                eventTime: postedAt
              });
              const recorded = await coreTurnStore.recordVisibleResponse(timing.transactionId, {
                kind: 'hostContinue',
                responseId: `core-reobserve:${timing.transactionId}`,
                hostMessageId: compact(runtimeHostObservation.hostMessageId),
                outcomeId: timing.outcomeId || runtimeResponse?.outcomeId || null,
                postedAt,
                hostGenerationReleasedAt: timing.turnTiming?.hostGenerationReleasedAt || null,
                generationStartedAt: timing.turnTiming?.generationStartedAt || timing.turnTiming?.hostGenerationReleasedAt || null,
                turnLatency: {
                  ...(timing.turnTiming || {}),
                  visibleResponsePostedAt: postedAt
                },
                textHash: runtimeHostObservation.textHash,
                repairDecision: repairClosure || undefined,
                idempotencyKey: `core-reobserve-host-native-visible:${timing.transactionId}`
              });
              if (recorded?.phase === 'visibleResponsePosted' && runtimeResponse) {
                const latestState = resolveState();
                const latestResponse = (await findResponse(latestState, runtimeResponse.id)) || runtimeResponse;
                let next = await closeResponseReobserveProjection({
                  campaignState: latestState,
                  response: latestResponse,
                  observedHostMessageId: compact(runtimeHostObservation.hostMessageId),
                  observedIndex: runtimeHostObservation.index ?? null,
                  textHash: runtimeHostObservation.textHash,
                  eventTime: postedAt,
                  turnLatency: {
                    ...(timing.turnTiming || {}),
                    visibleResponsePostedAt: postedAt
                  },
                  coreCompletion: recorded,
                  repairDecision: repairClosure
                });
                const contradictionSettlement = await settleHostNativeContinuityContradiction({
                  campaignState: next,
                  ingress,
                  response: latestResponse,
                  responseId: latestResponse.id,
                  ingressId: latestResponse.ingressId || ingress?.id || null,
                  outcomeId: latestResponse.outcomeId || timing.outcomeId || ingress?.outcomeId || null,
                  turnId: latestResponse.turnId || ingress?.turnId || null,
                  observedMessage: {
                    hostMessageId: compact(runtimeHostObservation.hostMessageId),
                    index: runtimeHostObservation.index ?? null,
                    textHash: runtimeHostObservation.textHash
                  },
                  observedText: '',
                  observedTextHash: runtimeHostObservation.textHash,
                  eventTime: postedAt,
                  turnLatency: {
                    ...(timing.turnTiming || {}),
                    visibleResponsePostedAt: postedAt
                  },
                  coreCompletion: recorded,
                  packageData,
                  crewDataset,
                  shipDataset,
                  campaignProjection
                });
                if (contradictionSettlement.recoveryRequired === true) {
                  next = contradictionSettlement.campaignState;
                }
                await acceptState(next, `Resolved host-native reobserve recovery for ${latestResponse.id}.`);
              }
              usedAssistantIds.add(compact(runtimeHostObservation.hostMessageId));
              projectionResults.push({
                transactionId: timing.transactionId,
                status: recorded?.phase === 'visibleResponsePosted' ? 'complete' : (recorded?.phase || 'unknown'),
                ok: recorded?.phase === 'visibleResponsePosted',
                hostMessageId: compact(runtimeHostObservation.hostMessageId),
                index: runtimeHostObservation.index ?? null,
                textHash: runtimeHostObservation.textHash,
                source: 'runtimeResponseHostObservation',
                recentMessageCount: recent.length,
                recentWindowAfterPlayer: recentWindowAfterPlayer(recent, playerIndex)
              });
            } catch (error) {
              projectionResults.push({
                transactionId: timing.transactionId,
                status: 'failed',
                ok: false,
                hostMessageId: compact(runtimeHostObservation.hostMessageId),
                index: runtimeHostObservation.index ?? null,
                textHash: runtimeHostObservation.textHash,
                source: 'runtimeResponseHostObservation',
                recentMessageCount: recent.length,
                recentWindowAfterPlayer: recentWindowAfterPlayer(recent, playerIndex),
                error: compactError(error, 'DIRECTIVE_CORE_REOBSERVE_VISIBLE_RESPONSE_FAILED')
              });
            }
            continue;
          }
        }
        if (!candidate) {
          for (let index = playerIndex + 1; index < recent.length; index += 1) {
            const message = recent[index];
            const id = hostMessageId(message, index);
            if (!id) continue;
            const claim = hostMessageClaims.get(id) || null;
            if (claim && claim.transactionId !== timing.transactionId) continue;
            if (isUserHostMessage(message) || isSystemHostMessage(message)) continue;
            candidate = message;
            candidateIndex = index;
            break;
          }
        }
        if (!candidate) {
          projectionResults.push({
            transactionId: timing.transactionId,
            status: 'skipped',
            reason: 'core-no-unclaimed-host-assistant-after-player',
            playerHostMessageId,
            playerIndex,
            recentMessageCount: recent.length,
            recentWindowAfterPlayer: recentWindowAfterPlayer(recent, playerIndex)
          });
          continue;
        }
        const observedText = hostMessageText(candidate);
        const observedHostMessageId = hostMessageId(candidate, candidateIndex);
        const textHash = hostMessageTextHash(candidate, observedText);
        const postedAt = timestamp(now);
        if (postedProjectionResponse && !hashlessProjectionResponse) {
          const projectedTextHash = compact(postedProjectionResponse.textHash);
          if (projectedTextHash && textHash !== projectedTextHash) {
            projectionResults.push({
              transactionId: timing.transactionId,
              status: 'skipped',
              reason: 'core-posted-host-assistant-hash-mismatch',
              hostMessageId: observedHostMessageId,
              index: candidate.index ?? candidateIndex,
              textHash,
              projectedTextHash,
              source: 'coreProjectionAlreadySettled'
            });
            continue;
          }
          const latestState = resolveState();
          const latestResponse = (runtimeResponse?.id
            ? ((await findResponse(latestState, runtimeResponse.id)) || runtimeResponse)
            : null) || postedProjectionResponse;
          if (latestResponse?.id) {
            const next = await closeResponseReobserveProjection({
              campaignState: latestState,
              response: latestResponse,
              observedHostMessageId,
              observedIndex: candidate.index ?? candidateIndex,
              textHash,
              eventTime: postedProjectionResponse.postedAt || postedAt,
              turnLatency: {
                ...(timing.turnTiming || {}),
                visibleResponsePostedAt: postedProjectionResponse.postedAt || postedAt
              },
              coreCompletion: {
                id: timing.transactionId,
                phase: 'visibleResponsePosted',
                route: 'hostContinue'
              }
            });
            await acceptState(next, `Confirmed host-native reobserve completion for ${latestResponse.id}.`);
          }
          usedAssistantIds.add(observedHostMessageId);
          projectionResults.push({
            transactionId: timing.transactionId,
            status: 'alreadySettled',
            ok: true,
            hostMessageId: observedHostMessageId,
            index: candidate.index ?? candidateIndex,
            textHash,
            source: 'coreProjectionAlreadySettled'
          });
          continue;
        }
        try {
          const repairClosure = await evaluateResponseReobserveClosure({
            campaignState: resolveState(),
            response: runtimeResponse,
            transaction: coreTransaction,
            observedHostMessageId,
            textHash,
            eventTime: postedAt
          });
          const recorded = hashlessProjectionResponse && typeof coreTurnStore?.repairVisibleResponseRef === 'function'
            ? await coreTurnStore.repairVisibleResponseRef(timing.transactionId, {
              hostMessageId: observedHostMessageId,
              textHash,
              reason: 'host-native-completion-reobserved-missing-hash',
              idempotencyKey: `core-reobserve-host-native-visible-hash:${timing.transactionId}`
            })
            : await coreTurnStore.recordVisibleResponse(timing.transactionId, {
              kind: 'hostContinue',
              responseId: `core-reobserve:${timing.transactionId}`,
              hostMessageId: observedHostMessageId,
              outcomeId: timing.outcomeId || null,
              postedAt,
              hostGenerationReleasedAt: timing.turnTiming?.hostGenerationReleasedAt || null,
              generationStartedAt: timing.turnTiming?.generationStartedAt || timing.turnTiming?.hostGenerationReleasedAt || null,
              turnLatency: {
                ...(timing.turnTiming || {}),
                visibleResponsePostedAt: postedAt
              },
              textHash,
              repairDecision: repairClosure || undefined,
              idempotencyKey: `core-reobserve-host-native-visible:${timing.transactionId}`
            });
          let runtimeContradiction = null;
          if (recorded?.phase === 'visibleResponsePosted' && runtimeResponse && !hashlessProjectionResponse) {
            const latestState = resolveState();
            const latestResponse = (await findResponse(latestState, runtimeResponse.id)) || runtimeResponse;
            let next = await closeResponseReobserveProjection({
              campaignState: latestState,
              response: latestResponse,
              observedHostMessageId,
              observedIndex: candidate.index ?? candidateIndex,
              textHash,
              eventTime: postedAt,
              turnLatency: {
                ...(timing.turnTiming || {}),
                visibleResponsePostedAt: postedAt
              },
              coreCompletion: recorded,
              repairDecision: repairClosure
            });
            const contradictionSettlement = await settleHostNativeContinuityContradiction({
              campaignState: next,
              ingress,
              response: latestResponse,
              responseId: latestResponse.id,
              ingressId: latestResponse.ingressId || ingress?.id || null,
              outcomeId: latestResponse.outcomeId || timing.outcomeId || ingress?.outcomeId || null,
              turnId: latestResponse.turnId || ingress?.turnId || null,
              observedMessage: candidate,
              observedText,
              observedTextHash: textHash,
              eventTime: postedAt,
              turnLatency: {
                ...(timing.turnTiming || {}),
                visibleResponsePostedAt: postedAt
              },
              coreCompletion: recorded,
              packageData,
              crewDataset,
              shipDataset,
              campaignProjection
            });
            runtimeContradiction = contradictionSettlement?.recoveryRequired === true ? contradictionSettlement : null;
            if (runtimeContradiction) next = runtimeContradiction.campaignState;
            await acceptState(next, `Resolved host-native reobserve recovery for ${latestResponse.id}.`);
          }
          const projectionContradiction = !runtimeResponse && recorded?.phase === 'visibleResponsePosted'
            ? await settleHostNativeContinuityContradiction({
              campaignState: resolveState(),
              ingress,
              response: null,
              responseId: hashlessProjectionResponse?.responseId || `core-reobserve:${timing.transactionId}`,
              ingressId: ingress?.id || timing.ingressId || null,
              outcomeId: timing.outcomeId || ingress?.outcomeId || null,
              turnId: ingress?.turnId || null,
              observedMessage: candidate,
              observedText,
              observedTextHash: textHash,
              eventTime: postedAt,
              turnLatency: {
                ...(timing.turnTiming || {}),
                visibleResponsePostedAt: postedAt
              },
              coreCompletion: recorded,
              packageData,
              crewDataset,
              shipDataset,
              campaignProjection
            })
            : null;
          if (projectionContradiction?.recoveryRequired === true) {
            await acceptState(projectionContradiction.campaignState, `Recorded host-native continuity contradiction for ${timing.transactionId}.`);
          }
          usedAssistantIds.add(observedHostMessageId);
          projectionResults.push({
            transactionId: timing.transactionId,
            status: runtimeContradiction?.recoveryRequired === true || projectionContradiction?.recoveryRequired === true
              ? 'recoveryRequired'
              : (recorded?.phase === 'visibleResponsePosted' ? 'complete' : (recorded?.phase || 'unknown')),
            ok: recorded?.phase === 'visibleResponsePosted'
              && runtimeContradiction?.recoveryRequired !== true
              && projectionContradiction?.recoveryRequired !== true,
            hostMessageId: observedHostMessageId,
            index: candidate.index ?? candidateIndex,
            textHash,
            source: hashlessProjectionResponse
              ? 'coreProjectionHashRepair'
              : runtimeHostObservation?.hostMessageId === observedHostMessageId
              ? 'runtimeResponseHostObservation'
              : 'recentMessages'
          });
        } catch (error) {
          projectionResults.push({
            transactionId: timing.transactionId,
            status: 'failed',
            ok: false,
            hostMessageId: observedHostMessageId,
            index: candidate.index ?? candidateIndex,
            textHash,
            source: hashlessProjectionResponse
              ? 'coreProjectionHashRepair'
              : runtimeHostObservation?.hostMessageId === observedHostMessageId
              ? 'runtimeResponseHostObservation'
              : 'recentMessages',
            error: compactError(error, 'DIRECTIVE_CORE_REOBSERVE_VISIBLE_RESPONSE_FAILED')
          });
        }
      }
    }
    const completedCount = [
      ...results,
      ...projectionResults
    ].filter((entry) => entry.status === 'complete' || entry.status === 'alreadySettled').length;
    return {
      ok: completedCount > 0,
      skipped: responses.length === 0 && projectionResults.length === 0,
      reason: responses.length === 0 && projectionResults.length === 0 ? 'no-released-host-generation-responses' : null,
      checkedResponseCount: responses.length,
      checkedCoreProjectionCount: projectionResults.length,
      completedCount,
      refreshResult,
      results,
      coreProjectionResults: projectionResults
    };
  }

  async function delegate({
    campaignState = null,
    ingressId,
    turnId = null,
    outcomeId = null,
    responseType = 'hostGeneration',
    idempotencyKey = null,
    packageData = null,
    crewDataset = null,
    shipDataset = null,
    campaignProjection = null
  } = {}) {
    const state = resolveState(campaignState);
    const key = idempotencyKey || `directive-response:${state.campaign?.id || 'campaign'}:${ingressId || turnId || 'turn'}:host`;
    const existing = await findExisting(state, key);
    if (existing) return await existingResponseDispatchResult(existing, state);
    const ingress = await findIngress(state, ingressId);
    let hostContinuation = null;
    let releasePersistedResolve = null;
    const releasePersistedPromise = new Promise((resolve) => {
      releasePersistedResolve = resolve;
    });
    const observeHostGenerationSettled = async (settlement) => {
      await releasePersistedPromise;
      return handleHostGenerationSettled({
        settlement,
        responseId: key,
        ingressId,
        outcomeId,
        turnId,
        packageData,
        crewDataset,
        shipDataset,
        campaignProjection
      });
    };
    if (responseType === 'hostGeneration' && typeof host.chat.continueHostGeneration === 'function') {
      hostContinuation = await host.chat.continueHostGeneration({
        ingressId,
        turnId,
        outcomeId,
        reason: 'directive-inject-and-continue',
        waitForCompletion: false,
        onHostGenerationObserved: observeHostGenerationSettled
      });
    }
    const hostGenerationReleasedAt = hostContinuation?.hostGenerationReleasedAt
      || hostContinuation?.generationStartedAt
      || null;
    const turnLatency = createTurnLatencyMetrics({
      playerSubmittedAt: ingress?.playerSubmittedAt || ingress?.receivedAt || null,
      turnObservedAt: ingress?.receivedAt || null,
      routeDecidedAt: hostGenerationReleasedAt,
      hostGenerationReleasedAt
    });
    let coreRelease = null;
    let coreReleaseError = null;
    try {
      coreRelease = await recordCoreHostContinueRelease({
        ingress,
        responseId: key,
        hostContinuation,
        turnLatency,
        directivePromptRevisionUsed: state.campaignChatBinding?.promptContextRevision ?? null
      });
    } catch (error) {
      coreReleaseError = compactError(error);
    }
    const observedMessage = hostContinuation?.observedMessage || hostContinuation?.message || null;
    const observedText = compact(observedMessage?.text || observedMessage?.content || observedMessage?.mes || '');
    const observedMessageTextHash = observedText
      ? hashStableJson({ text: observedText })
      : hostMessageTextHash(observedMessage || {}, observedText);
    const continuityReview = observedText ? await sourceReview.reviewHostNativeContinuity({
      mode: 'hostNativeCompletion',
      text: observedText,
      campaignState: state,
      packageData,
      crewDataset,
      shipDataset,
      campaignProjection,
      responseId: key,
      ingressId,
      outcomeId,
      turnId,
      observedMessage,
      observedTextHash: observedMessageTextHash
    }) : null;
    const continuityRecoveryId = continuityReview?.ok === false
      ? `recovery:continuity:${key}`
      : null;
    const coreReleaseRecoveryId = coreReleaseError
      ? `recovery:core-host-continue:${key}`
      : null;
    let recoveryId = continuityRecoveryId || coreReleaseRecoveryId;
    let coreReleaseDiagnostic = null;
    if (coreReleaseError) {
      try {
        coreReleaseDiagnostic = await appendCoreHostContinueReleaseDiagnostic({
          ingress,
          responseId: key,
          outcomeId,
          turnId,
          hostContinuation,
          hostGenerationReleasedAt,
          turnLatency,
          error: coreReleaseError
        });
      } catch {
        // Fall through to the old sanitized recovery bridge below.
      }
    }
    const coreReleaseDiagnosticRecorded = Boolean(coreReleaseDiagnostic);
    let continuityCoreRecovery = null;
    let continuityCoreRecoveryError = null;
    const entry = {
      id: key,
      ingressId,
      turnId,
      outcomeId,
      strategy: 'injectAndContinue',
      responseKind: responseType,
      postedAt: timestamp(now),
      status: continuityReview?.ok === false
        ? 'recoveryRequired'
        : (coreReleaseError
            ? (coreReleaseDiagnosticRecorded ? 'coreRecoveryDiagnosticProjected' : 'recoveryRequired')
            : (hostContinuation?.released === true ? 'released' : 'delegated')),
      sourceFrameId: ingress?.sourceFrameId || ingress?.sourceFrame?.id || null,
      hostGenerationReleasedAt,
      generationStartedAt: hostGenerationReleasedAt,
      hostGenerationReleaseMode: hostContinuation?.waitForCompletion === false ? 'nonblocking' : 'blocking-or-unknown',
      turnLatency,
      coreTransactionId: ingressCoreTransactionId(ingress),
      coreRelease: coreRelease ? {
        transactionId: coreRelease.id || ingressCoreTransactionId(ingress),
        phase: coreRelease.phase || null,
        route: coreRelease.route || null
      } : null,
      coreReleaseError: coreReleaseDiagnosticRecorded ? null : coreReleaseError,
      coreReleaseDiagnostic: coreReleaseDiagnosticRecorded ? {
        id: coreReleaseDiagnostic.id || null,
        worker: coreReleaseDiagnostic.payload?.worker || coreReleaseDiagnostic.worker || 'hostContinueReleaseRecord',
        status: coreReleaseDiagnostic.payload?.status || coreReleaseDiagnostic.status || 'failed'
      } : null,
      coreRecovery: continuityCoreRecovery ? {
        id: continuityCoreRecovery.recoveryCaseId || null,
        status: continuityCoreRecovery.status || null,
        phase: continuityCoreRecovery.phase || null,
        reason: continuityCoreRecovery.reason || null
      } : null,
      coreRecoveryError: continuityCoreRecoveryError,
      recoveryId: coreReleaseError && coreReleaseDiagnosticRecorded ? null : recoveryId,
      hostContinuation: safeHostContinuationRef(hostContinuation),
      hostObservation: observedMessage ? {
        hostMessageId: observedMessage.hostMessageId || observedMessage.id || null,
        index: observedMessage.index ?? null,
        textHash: observedMessageTextHash
      } : null,
      continuityReview: cloneJson(continuityReview)
    };
    let next = state;
    if (continuityReview?.ok === false) {
      const contradictionSettlement = await settleHostNativeContinuityContradiction({
        campaignState: next,
        ingress,
        response: entry,
        responseId: key,
        ingressId,
        outcomeId,
        turnId,
        observedMessage,
        observedText,
        observedTextHash: observedMessageTextHash,
        eventTime: entry.postedAt,
        turnLatency,
        coreCompletion: coreRelease,
        packageData,
        crewDataset,
        shipDataset,
        campaignProjection,
        continuityReview
      });
      if (contradictionSettlement?.campaignState) {
        next = contradictionSettlement.campaignState;
      }
      if (contradictionSettlement?.recoveryRequired === true) {
        recoveryId = contradictionSettlement.recoveryId || recoveryId;
        continuityCoreRecovery = contradictionSettlement.coreRecovery || null;
        continuityCoreRecoveryError = contradictionSettlement.coreRecoveryError || null;
        if (
          continuityCoreRecovery?.status === 'recorded'
          && !continuityCoreRecoveryError
        ) {
          entry.status = 'coreRecoveryProjected';
          entry.recoveryId = null;
          entry.coreRecovery = null;
          entry.coreRecoveryError = null;
          entry.continuityReview = null;
        } else if (contradictionSettlement.coreDiagnosticBackedRecoveryFailure === true) {
          entry.status = 'coreRecoveryDiagnosticProjected';
          entry.recoveryId = null;
          entry.coreRecovery = null;
          entry.coreRecoveryError = null;
          entry.continuityReview = null;
        } else {
          entry.recoveryId = recoveryId;
          entry.coreRecovery = continuityCoreRecovery ? {
            id: continuityCoreRecovery.recoveryCaseId || null,
            status: continuityCoreRecovery.status || null,
            phase: continuityCoreRecovery.phase || null,
            reason: continuityCoreRecovery.reason || null
          } : null;
          entry.coreRecoveryError = continuityCoreRecoveryError;
        }
      }
    }
    try {
      next = await recordDirectiveResponseCompatibility(next, entry, {
        coreDiagnostic: coreReleaseDiagnostic || null,
        mirroredOperation: 'hostContinueRelease'
      });
      await acceptState(next, `Delegated response for ${ingressId || turnId || 'campaign turn'} to host generation.`);
    } finally {
      releasePersistedResolve?.();
    }
    if (continuityReview?.ok === false || coreReleaseError) {
      return {
        ok: false,
        recoveryRequired: true,
        duplicate: false,
        entry: cloneJson(entry),
        hostContinuation: safeHostContinuationRef(hostContinuation),
        continuityReview: cloneJson(continuityReview),
        coreReleaseError: coreReleaseDiagnosticRecorded ? null : cloneJson(coreReleaseError),
        coreDiagnostic: cloneJson(coreReleaseDiagnostic || null),
        recoveryId,
        campaignState: cloneJson(next)
      };
    }
    return {
      ok: true,
      duplicate: false,
      entry: cloneJson(entry),
      hostContinuation: safeHostContinuationRef(hostContinuation),
      campaignState: cloneJson(next)
    };
  }

  async function post({
    campaignState = null,
    text,
    ingressId = null,
    turnId = null,
    outcomeId = null,
    responseType = 'narration',
    strategy = 'directivePosted',
    idempotencyKey = null,
    metadata = {}
  } = {}) {
    const state = resolveState(campaignState);
    const responseText = compact(prefixCampaignReplyHeader(text, state));
    if (!responseText) {
      const error = new Error('Directive-posted response requires non-empty text.');
      error.code = 'DIRECTIVE_RESPONSE_TEXT_REQUIRED';
      throw error;
    }
    const key = idempotencyKey || `directive-response:${state.campaign?.id || 'campaign'}:${ingressId || outcomeId || turnId || 'turn'}:${responseType}`;
    const existing = await findExisting(state, key);
    if (existing) {
      return await existingResponseDispatchResult(existing, state);
    }
    const ingress = await findIngress(state, ingressId);
    const directiveGenerationStartedAt = metadata?.directiveGenerationStartedAt
      || metadata?.turnTiming?.directiveGenerationStartedAt
      || null;
    const repairResponseRetryActuationDecision = metadata?.repairResponseRetryActuationDecision || null;
    const suppressCoreVisibleResponse = metadata?.providerFailureAfterMechanicsCommit === true
      && metadata?.fallbackResponsePosted === true;
    const providerFailureRecoveryId = suppressCoreVisibleResponse
      ? (metadata?.providerFailureRecoveryId || `recovery:provider-failure:${key}`)
      : null;
    const providerFailureCoreRecovery = suppressCoreVisibleResponse && metadata?.providerFailureCoreRecovery
      ? metadata.providerFailureCoreRecovery
      : null;
    const posted = await host.chat.postAssistantMessage({
      text: responseText,
      campaignId: state.campaign?.id || null,
      turnId,
      outcomeId,
      responseKind: responseType,
      idempotencyKey: key,
      extra: { runtimeMetadata: cloneJson(metadata) }
    });
    const postedAt = timestamp(now);
    const turnLatency = directiveGenerationStartedAt ? createTurnLatencyMetrics({
      playerSubmittedAt: ingress?.playerSubmittedAt || ingress?.receivedAt || null,
      turnObservedAt: ingress?.receivedAt || null,
      routeDecidedAt: directiveGenerationStartedAt,
      directiveGenerationStartedAt,
      visibleResponsePostedAt: postedAt
    }) : null;
    const entry = {
      id: key,
      ingressId,
      turnId,
      outcomeId,
      hostMessageId: posted?.hostMessageId || posted?.message?.id || null,
      strategy: strategy === 'pause' ? 'pause' : 'directivePosted',
      responseKind: responseType,
      postedAt,
      status: suppressCoreVisibleResponse
        ? 'responseRetryRequired'
        : (posted?.duplicate ? 'alreadyPosted' : 'posted'),
      recoveryId: providerFailureRecoveryId,
      providerFallback: suppressCoreVisibleResponse ? {
        kind: 'directive.providerFailureFallback.v1',
        reason: 'provider-failure-after-mechanics-commit',
        retryPath: 'assistantSwipe'
      } : null,
      directiveGenerationStartedAt,
      generationStartedAt: directiveGenerationStartedAt,
      turnLatency,
      coreTransactionId: ingressCoreTransactionId(ingress),
      coreRecovery: providerFailureCoreRecovery
    };
    let coreRelease = null;
    let coreReleaseError = null;
    if (!suppressCoreVisibleResponse) {
      try {
        coreRelease = await recordCoreVisibleResponse({
          ingress,
          entry,
          responseText,
          directivePromptRevisionUsed: state.campaignChatBinding?.promptContextRevision ?? null,
          repairDecision: repairResponseRetryActuationDecision
        });
      } catch (error) {
        coreReleaseError = compactError(error, 'DIRECTIVE_CORE_VISIBLE_RESPONSE_RECORD_FAILED');
      }
    }
    let coreReleaseDiagnostic = null;
    if (coreReleaseError) {
      try {
        coreReleaseDiagnostic = await appendCoreVisibleResponseRecordDiagnostic({
          ingress,
          responseId: key,
          outcomeId,
          turnId,
          hostMessageId: entry.hostMessageId || null,
          visibleResponsePostedAt: postedAt,
          turnLatency,
          error: coreReleaseError
        });
      } catch {
        // Fall through to the old sanitized recovery bridge below.
      }
    }
    const coreReleaseDiagnosticRecorded = Boolean(coreReleaseDiagnostic);
    entry.coreRelease = coreRelease ? {
      transactionId: coreRelease.id || ingressCoreTransactionId(ingress),
      phase: coreRelease.phase || null,
      route: coreRelease.route || null
    } : null;
    entry.coreReleaseError = coreReleaseDiagnosticRecorded ? null : coreReleaseError;
    entry.coreReleaseDiagnostic = coreReleaseDiagnosticRecorded ? {
      id: coreReleaseDiagnostic.id || null,
      worker: coreReleaseDiagnostic.payload?.worker || coreReleaseDiagnostic.worker || 'visibleResponseRecord',
      status: coreReleaseDiagnostic.payload?.status || coreReleaseDiagnostic.status || 'failed'
    } : null;
    if (coreReleaseError) {
      entry.status = coreReleaseDiagnosticRecorded ? 'coreRecoveryDiagnosticProjected' : 'recoveryRequired';
      entry.recoveryId = coreReleaseDiagnosticRecorded ? null : `recovery:core-visible-response:${key}`;
    }
    let next = await recordDirectiveResponseCompatibility(state, entry, {
      coreDiagnostic: coreReleaseDiagnostic || null,
      mirroredOperation: 'directiveVisibleResponse'
    });
    await acceptState(next, `Posted Directive ${responseType} response for ${ingressId || outcomeId || turnId || 'campaign turn'}.`);
    if (entry.status === 'responseRetryRequired') {
      return {
        ok: false,
        responseRetryRequired: true,
        duplicate: posted?.duplicate === true,
        posted: cloneJson(posted),
        response: cloneJson(posted),
        entry: cloneJson(entry),
        recoveryId: entry.recoveryId || null,
        campaignState: cloneJson(next)
      };
    }
    return {
      ok: coreReleaseError ? false : true,
      recoveryRequired: coreReleaseError ? true : undefined,
      duplicate: posted?.duplicate === true,
      posted: cloneJson(posted),
      response: cloneJson(posted),
      entry: cloneJson(entry),
      coreReleaseError: coreReleaseDiagnosticRecorded ? null : cloneJson(coreReleaseError),
      coreDiagnostic: cloneJson(coreReleaseDiagnostic || null),
      recoveryId: entry.recoveryId || null,
      campaignState: cloneJson(next)
    };
  }

  async function dispatch(options = {}) {
    return options.strategy === 'injectAndContinue'
      ? delegate(options)
      : post({ ...options, responseType: options.responseKind || options.responseType });
  }

  return { post, delegate, dispatch, reobserveHostGenerationCompletions };
}
