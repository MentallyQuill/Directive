import {
  hashStableJson,
  normalizeHostMessageVisibility
} from './architecture-redesign-contracts.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compact(value) {
  return String(value || '').trim();
}

function isObjectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function timestamp(now) {
  return typeof now === 'function' ? now() : (now || new Date().toISOString());
}

function compactReasonEvidence(reason = '') {
  const text = compact(reason);
  return text
    ? {
        reasonLength: text.length,
        reasonHash: hashStableJson({ reason: text.slice(0, 500) })
      }
    : {
        reasonLength: 0,
        reasonHash: null
      };
}

export function buildCorrectAsSwipeLifecycleDecision({
  correctionCase = null,
  caseId = null,
  action = null,
  reason = '',
  now = null
} = {}) {
  const effectiveCaseId = compact(caseId || correctionCase?.id);
  const requestedAction = compact(action);
  const statusBefore = compact(correctionCase?.status);
  const decidedAt = timestamp(now);
  const allowedActions = Array.isArray(correctionCase?.allowedActions)
    ? correctionCase.allowedActions.map(compact).filter(Boolean)
    : [];
  const finalStatusByAction = {
    rejectCorrectionCase: 'rejected',
    expireCorrectionCase: 'expired'
  };
  const statusAfter = finalStatusByAction[requestedAction] || null;
  const reasonEvidence = compactReasonEvidence(reason);
  const base = {
    kind: 'directive.repairCorrectAsSwipeLifecycleDecision.v1',
    caseId: effectiveCaseId || null,
    action: requestedAction || null,
    statusBefore: statusBefore || null,
    statusAfter,
    source: {
      responseId: compact(correctionCase?.responseId) || null,
      hostMessageId: compact(correctionCase?.source?.hostMessageId) || null,
      outcomeId: compact(correctionCase?.source?.outcomeId) || null,
      turnId: compact(correctionCase?.source?.turnId) || null,
      selectedTextHash: compact(correctionCase?.source?.selectedTextHash) || null
    },
    evidenceHash: compact(correctionCase?.evidenceVerdict?.evidenceHash) || null,
    candidateTextHash: compact(correctionCase?.candidate?.textHash) || null,
    normalTurnAllowed: false,
    continuityMutation: 'none-until-selected',
    decidedAt,
    ...reasonEvidence
  };
  if (!effectiveCaseId || !correctionCase) {
    return {
      ...base,
      status: 'blocked',
      blockedReason: 'correction-case-missing',
      allowedActions: ['reviewCorrectionCase']
    };
  }
  if (!statusAfter) {
    return {
      ...base,
      status: 'blocked',
      blockedReason: 'unsupported-correction-case-action',
      allowedActions: cloneJson(allowedActions)
    };
  }
  if (statusBefore === statusAfter) {
    return {
      ...base,
      status: 'alreadyApplied',
      allowedActions: [],
      idempotent: true
    };
  }
  if (!allowedActions.includes(requestedAction)) {
    return {
      ...base,
      status: 'blocked',
      blockedReason: 'correction-case-action-not-allowed',
      allowedActions: cloneJson(allowedActions)
    };
  }
  return {
    ...base,
    status: 'approved',
    allowedActions: []
  };
}

function replacementTextHash(replacementText = null) {
  const text = compact(replacementText);
  return text ? hashStableJson({ text }) : null;
}

function finiteInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function messageTextHash(value = null) {
  const text = compact(value);
  return text ? hashStableJson({ text }) : null;
}

function selectedSwipeMutationFields({
  message = null,
  selectedSwipe = null
} = {}) {
  const raw = message?.raw && typeof message.raw === 'object' ? message.raw : {};
  const swipes = Array.isArray(selectedSwipe?.swipes)
    ? selectedSwipe.swipes
    : (Array.isArray(message?.swipes)
      ? message.swipes
      : (Array.isArray(raw.swipes) ? raw.swipes : []));
  const selectedSwipeIndex = finiteInteger(
    selectedSwipe?.selectedSwipeIndex
    ?? selectedSwipe?.swipeIndex
    ?? selectedSwipe?.swipe_id
    ?? message?.selectedSwipeIndex
    ?? message?.swipeIndex
    ?? message?.swipe_id
    ?? raw.swipe_id
  );
  const swipeCount = finiteInteger(
    selectedSwipe?.swipeCount
    ?? message?.swipeCount
    ?? raw.swipeCount
    ?? (swipes.length || null)
  );
  const selectedText = selectedSwipe?.selectedText
    || selectedSwipe?.text
    || (selectedSwipeIndex !== null ? swipes[selectedSwipeIndex] : null)
    || message?.text
    || message?.mes
    || raw.mes
    || raw.content
    || null;
  const visibleText = message?.text
    || message?.mes
    || raw.mes
    || raw.content
    || null;
  const selectedTextHash = selectedSwipe?.selectedAssistantVariantHash
    || selectedSwipe?.selectedTextHash
    || messageTextHash(selectedText);
  const visibleTextHash = selectedSwipe?.visibleTextHash || messageTextHash(visibleText);
  if (
    selectedSwipeIndex === null
    && swipeCount === null
    && !selectedTextHash
    && !visibleTextHash
  ) {
    return null;
  }
  return {
    kind: 'directive.selectedSwipeMutation.v1',
    selectedSwipeIndex,
    swipeCount,
    selectedTextHash: selectedTextHash || null,
    visibleTextHash: visibleTextHash || null,
    selectedHashMatchesVisible: Boolean(selectedTextHash && visibleTextHash && selectedTextHash === visibleTextHash)
  };
}

function allowedCoreRecoveryActions({ recoveryStatus, sourceKind, autoRollback = false } = {}) {
  if (sourceKind !== 'directiveResponse' && recoveryStatus === 'rollbackPending') {
    return ['rollbackToPreOutcomeRevision', 'reviewSourceMutation'];
  }
  if (sourceKind === 'directiveResponse') {
    return recoveryStatus === 'invalidated'
      ? ['discardStaleResponse']
      : ['reviewResponseMutation', 'retryResponse'];
  }
  return recoveryStatus === 'invalidated'
    ? ['discardStaleIngress', 'reobserveSource']
    : ['reviewSourceMutation', 'rerunFromSource', 'branchFromPriorRevision'];
}

function sourceKindFor({ ingress = null, response = null } = {}) {
  if (response) return 'directiveResponse';
  if (ingress) return 'playerIngress';
  return 'untrackedHostMessage';
}

function sourceRecord({ ingress = null, response = null } = {}) {
  return ingress || response || null;
}

function hasPreOutcomeRevision(value) {
  if (value === null || value === undefined || value === '') return false;
  return Number.isFinite(Number(value));
}

function recoveryStatusForSourceMutation({
  sourceKind,
  sourceMutation = {},
  autoRollback = false
} = {}) {
  const hasCommittedOutcome = Boolean(sourceMutation?.outcomeId);
  if (
    sourceKind !== 'directiveResponse'
    && autoRollback === true
    && hasPreOutcomeRevision(sourceMutation?.preOutcomeRevision)
  ) {
    return 'rollbackPending';
  }
  return hasCommittedOutcome ? 'reviewRequired' : 'invalidated';
}

function legacyProjectionForDecision({
  action,
  recoveryStatus,
  sourceKind,
  sourceMutation = {}
} = {}) {
  const rollback = action === 'rollbackPending' && sourceKind !== 'directiveResponse';
  const invalidated = recoveryStatus === 'invalidated';
  return {
    kind: 'directive.repairLegacyProjection.v1',
    sourceProjectionStatus: invalidated ? 'invalidated' : 'recoveryRequired',
    responseProjectionStatus: invalidated ? 'invalidated' : 'recoveryRequired',
    recoveryJournalStatus: recoveryStatus || (invalidated ? 'invalidated' : 'reviewRequired'),
    returnedAction: rollback ? 'rolledBack' : (invalidated ? 'invalidated' : 'reviewRequired'),
    shouldRestoreRevision: rollback && hasPreOutcomeRevision(sourceMutation?.preOutcomeRevision),
    restoreRevision: rollback && hasPreOutcomeRevision(sourceMutation?.preOutcomeRevision)
      ? Number(sourceMutation.preOutcomeRevision)
      : null
  };
}

function sourceMutationVisibilityFields({
  message = null,
  index = null,
  chatMetadata = null,
  visibilityMap = null
} = {}) {
  if (!message && !chatMetadata && !visibilityMap && index === null && index === undefined) {
    return null;
  }
  return normalizeHostMessageVisibility(message || {}, {
    index,
    chatMetadata,
    visibilityMap
  });
}

function buildRepairDecision({
  eventType,
  recoveryStatus,
  sourceKind,
  transactionId,
  sourceMutation,
  autoRollback = false,
  dependentInvalidation = null
} = {}) {
  const hasDependent = Boolean(sourceMutation?.outcomeId || sourceMutation?.responseId);
  const uncommitted = recoveryStatus === 'invalidated';
  const action = recoveryStatus === 'rollbackPending' && sourceKind !== 'directiveResponse'
    ? 'rollbackPending'
    : (uncommitted ? 'invalidateProjection' : 'reviewRequired');
  const legacyProjection = legacyProjectionForDecision({
    action,
    recoveryStatus,
    sourceKind,
    sourceMutation
  });
  return {
    kind: 'directive.repairDecision.v1',
    eventType,
    sourceKind,
    transactionId: compact(transactionId) || null,
    sourceMutation: true,
    hasDependent,
    uncommitted,
    action,
    normalTurnAllowed: false,
    legacyProjection,
    dependentInvalidation: dependentInvalidation ? cloneJson(dependentInvalidation) : undefined
  };
}

function buildVisibilityDecision({
  eventType,
  sourceKind,
  transactionId,
  visibility = null
} = {}) {
  const sourceMutation = visibility?.sourceMutation === true;
  const visibilityMutationOnly = visibility?.visibilityMutationOnly === true;
  return {
    kind: 'directive.repairVisibilityDecision.v1',
    eventType,
    sourceKind,
    transactionId: compact(transactionId) || null,
    sourceRowExists: visibility?.sourceRowExists !== false,
    visibilityMutationOnly,
    sourceMutation,
    action: sourceMutation
      ? 'sourceMutationDetected'
      : (visibilityMutationOnly ? 'visibilityOnlySourceRow' : 'sourceRowContinues'),
    normalTurnAllowed: false,
    recoveryRequired: sourceMutation,
    visibility: visibility ? cloneJson(visibility) : null
  };
}

const STALE_REOBSERVE_STATUSES = new Set([
  'invalidated',
  'edited',
  'deleted',
  'recoveryRequired',
  'canceled',
  'awaitingRevision'
]);

function buildSourceReobserveDecision({
  eventType = 'playerMessageReobserved',
  stage = null,
  ingress = null,
  hasDependentResponse = false,
  hasDependentAssistant = false,
  hasCommittedOutcome = false,
  isLatestActionablePlayerRow = false,
  priorRecovery = null,
  observedHostMessageId = null,
  observedTextHash = null
} = {}) {
  const expectedHostMessageId = compact(observedHostMessageId);
  const expectedTextHash = compact(observedTextHash);
  const currentHostMessageId = compact(ingress?.hostMessageId);
  const currentTextHash = compact(ingress?.textHash);
  const reasons = [];
  if (!ingress) reasons.push('missing-ingress');
  if (ingress && STALE_REOBSERVE_STATUSES.has(String(ingress.status || ''))) reasons.push(`status:${ingress.status}`);
  if (ingress?.invalidatedAt || ingress?.invalidationType) reasons.push('invalidated');
  if (ingress && expectedHostMessageId && currentHostMessageId && currentHostMessageId !== expectedHostMessageId) {
    reasons.push('host-message-changed');
  }
  if (ingress && expectedTextHash && currentTextHash && currentTextHash !== expectedTextHash) {
    reasons.push('text-hash-changed');
  }
  const dependent = hasDependentResponse === true || hasDependentAssistant === true || hasCommittedOutcome === true;
  if (dependent) reasons.unshift('dependent-response');
  const uniqueReasons = [...new Set(reasons)];
  const hasStaleSignal = uniqueReasons.length > 0;
  const latestBoundaryRestart = (
    hasStaleSignal
    && isLatestActionablePlayerRow === true
    && !dependent
    && ingress
  );
  const action = dependent
    ? 'blockDependentSourceReobserve'
    : (latestBoundaryRestart ? 'restartLatestSource' : (hasStaleSignal ? 'blockStaleSourceReobserve' : 'allowSourceReobserve'));
  return {
    kind: 'directive.repairSourceReobserveDecision.v1',
    eventType,
    stage: compact(stage) || null,
    sourceKind: 'playerIngress',
    ingressId: ingress?.id || null,
    hostMessageId: currentHostMessageId || expectedHostMessageId || null,
    sourceFrameId: ingress?.sourceFrameId || null,
    transactionId: compact(ingress?.coreTransactionId) || null,
    hasDependentResponse: dependent,
    hasDependentAssistant: hasDependentAssistant === true,
    hasCommittedOutcome: hasCommittedOutcome === true,
    isLatestActionablePlayerRow: isLatestActionablePlayerRow === true,
    action,
    normalTurnAllowed: action === 'allowSourceReobserve' || action === 'restartLatestSource',
    recoveryRequired: action !== 'allowSourceReobserve' && action !== 'restartLatestSource',
    reasons: uniqueReasons,
    recoveryResolution: action === 'restartLatestSource' ? {
      allowed: true,
      resolvePriorRecovery: Boolean(priorRecovery?.id),
      priorRecoveryId: priorRecovery?.id || null,
      reason: 'latest-source-reobserved'
    } : null,
    observedTextHash: expectedTextHash || null,
    currentTextHash: currentTextHash || null,
    priorStatus: ingress?.status || null
  };
}

function errorDigest(error = null) {
  if (!error) return null;
  return hashStableJson({
    code: error?.code || null,
    message: compact(error?.message || error)
  });
}

function normalizeResponseRecoveryEvent({ eventType = null, observationStatus = null, reason = null } = {}) {
  const value = compact(eventType || reason || observationStatus || 'responseRecoveryRequired');
  if (value === 'failed' || value === 'hostNativeGenerationFailed') return 'hostNativeGenerationFailed';
  if (
    value === 'unavailable'
    || value === 'completed'
    || value === 'hostNativeAssistantUnavailable'
  ) return 'hostNativeAssistantUnavailable';
  if (value === 'provider-failure-after-mechanics-commit' || value === 'providerFailureAfterMechanicsCommit') {
    return 'providerFailureAfterMechanicsCommit';
  }
  if (
    value === 'hostNativeContinuityContradiction'
    || value === 'host-native-continuity-contradiction'
    || value === 'continuityContradiction'
  ) return 'hostNativeContinuityContradiction';
  if (value === 'host-response-post-failure' || value === 'hostResponsePostFailure') return 'hostResponsePostFailure';
  return value;
}

function responseRecoveryPolicyFields(eventType, observationStatus = null) {
  if (eventType === 'hostNativeGenerationFailed') {
    return {
      reason: 'hostNativeGenerationFailed',
      responseStatus: 'responseRetryRequired',
      responseRetry: true,
      phaseAfter: 'responseRetryRequired',
      allowedActions: ['reobserveHostAssistantRows', 'retryHostGeneration', 'fallbackDirectiveResponse', 'reviewHostGenerationFailure'],
      recoveryType: 'hostNativeGenerationFailed',
      recoveryAction: 'retryHostNativeGeneration',
      recoverySummary: 'Host generation failed after Directive released the host continuation.',
      retryHostGeneration: true,
      retryDirectiveResponse: false,
      reobserveHostAssistantRows: true,
      preferredFirstAction: 'reobserveHostAssistantRows',
      errorCode: 'DIRECTIVE_HOST_NATIVE_GENERATION_FAILED'
    };
  }
  if (eventType === 'hostNativeAssistantUnavailable') {
    return {
      reason: 'hostNativeAssistantUnavailable',
      responseStatus: 'unavailable',
      responseRetry: false,
      phaseAfter: 'recoveryRequired',
      allowedActions: ['reobserveHostAssistantRows', 'reviewHostNativeAvailability'],
      recoveryType: 'hostNativeAssistantUnavailable',
      recoveryAction: 'reobserveHostNativeResponse',
      recoverySummary: observationStatus === 'completed'
        ? 'Host generation completed but no assistant row was observed.'
        : 'Host generation observation is unavailable; Directive cannot confirm the terminal assistant row.',
      retryHostGeneration: false,
      retryDirectiveResponse: false,
      reobserveHostAssistantRows: true,
      preferredFirstAction: 'reobserveHostAssistantRows',
      errorCode: 'DIRECTIVE_HOST_NATIVE_ASSISTANT_UNAVAILABLE'
    };
  }
  if (eventType === 'hostNativeContinuityContradiction') {
    return {
      reason: 'hostNativeContinuityContradiction',
      responseStatus: 'recoveryRequired',
      responseRetry: false,
      phaseAfter: 'recoveryRequired',
      allowedActions: ['reviewHostNativeContinuityContradiction', 'fallbackDirectiveResponse', 'branchFromPriorRevision'],
      recoveryType: 'hostNativeContinuityContradiction',
      recoveryAction: 'reviewHostNativeContinuityContradiction',
      recoverySummary: 'Host-native generation contradicted protected continuity facts and cannot be accepted unchanged.',
      retryHostGeneration: false,
      retryDirectiveResponse: false,
      reobserveHostAssistantRows: false,
      preferredFirstAction: 'reviewHostNativeContinuityContradiction',
      sreReviewRequired: true,
      errorCode: 'DIRECTIVE_HOST_NATIVE_CONTINUITY_CONTRADICTION'
    };
  }
  return {
    reason: eventType === 'providerFailureAfterMechanicsCommit'
      ? 'provider-failure-after-mechanics-commit'
      : 'host-response-post-failure',
    responseStatus: 'responseRetryRequired',
    responseRetry: true,
    phaseAfter: 'responseRetryRequired',
    allowedActions: ['retryResponse'],
    recoveryType: eventType === 'providerFailureAfterMechanicsCommit'
      ? 'providerFailureAfterMechanicsCommit'
      : 'hostResponsePostFailure',
    recoveryAction: 'retryDirectiveResponse',
    recoverySummary: eventType === 'providerFailureAfterMechanicsCommit'
      ? 'Narration provider failed after mechanics committed; retry the visible response without rerunning mechanics.'
      : 'Directive could not post the visible response; retry the visible response without rerunning mechanics.',
    retryHostGeneration: false,
    retryDirectiveResponse: true,
    reobserveHostAssistantRows: false,
    preferredFirstAction: 'retryResponse',
    errorCode: eventType === 'providerFailureAfterMechanicsCommit'
      ? 'DIRECTIVE_PROVIDER_FAILURE_AFTER_MECHANICS_COMMIT'
      : 'DIRECTIVE_HOST_RESPONSE_POST_FAILURE'
  };
}

function buildResponseRecoveryDecision({
  eventType = null,
  observationStatus = null,
  reason = null,
  ingress = null,
  transactionId = null,
  responseId = null,
  outcomeId = null,
  turnId = null,
  sourceFrameId = null,
  error = null
} = {}) {
  const normalizedEventType = normalizeResponseRecoveryEvent({ eventType, observationStatus, reason });
  const policy = responseRecoveryPolicyFields(normalizedEventType, observationStatus);
  return {
    kind: 'directive.repairResponseRecoveryDecision.v1',
    eventType: normalizedEventType,
    reason: policy.reason,
    sourceKind: 'directiveResponse',
    ingressId: ingress?.id || null,
    responseId: compact(responseId) || null,
    outcomeId: outcomeId || ingress?.outcomeId || null,
    turnId: turnId || null,
    sourceFrameId: sourceFrameId || ingress?.sourceFrameId || null,
    transactionId: compact(transactionId || ingress?.coreTransactionId) || null,
    action: policy.recoveryAction,
    responseStatus: policy.responseStatus,
    responseRetry: policy.responseRetry,
    phaseAfter: policy.phaseAfter,
    allowedActions: cloneJson(policy.allowedActions),
    recoveryType: policy.recoveryType,
    recoveryAction: policy.recoveryAction,
    recoverySummary: policy.recoverySummary,
    retryHostGeneration: policy.retryHostGeneration,
    retryDirectiveResponse: policy.retryDirectiveResponse,
    reobserveHostAssistantRows: policy.reobserveHostAssistantRows,
    preferredFirstAction: policy.preferredFirstAction,
    sreReviewRequired: policy.sreReviewRequired === true,
    normalTurnAllowed: false,
    recoveryRequired: true,
    observationStatus: compact(observationStatus) || null,
    errorCode: error?.code || policy.errorCode,
    errorHash: errorDigest(error)
  };
}

function compactContinuityFindingRef(finding = {}) {
  if (!isObjectRecord(finding)) return null;
  const factId = compact(finding.factId);
  const kind = compact(finding.kind);
  const severity = compact(finding.severity);
  if (!factId && !kind && !severity) return null;
  return {
    kind: kind || null,
    factId: factId || null,
    severity: severity || null
  };
}

function continuityReviewSourceRef(continuityReview = null) {
  const source = continuityReview?.sreReview?.source || {};
  return {
    responseId: compact(source.responseId) || null,
    ingressId: compact(source.ingressId) || null,
    outcomeId: compact(source.outcomeId) || null,
    turnId: compact(source.turnId) || null,
    hostMessageId: compact(source.hostMessageId) || null,
    textHash: compact(source.textHash || continuityReview?.observedTextHash || continuityReview?.sourceTextHash) || null
  };
}

function continuityFactUseStatsProjection({ campaignState = null, factIds = [], currentRevision = 0, observedAt = null } = {}) {
  const priorStats = isObjectRecord(campaignState?.continuity?.factUseStats)
    ? campaignState.continuity.factUseStats
    : {};
  return Object.fromEntries(factIds.map((factId) => {
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
      updatedAt: observedAt
    }];
  }));
}

function buildHostNativeContinuityCompatibilityProjection({
  decision = null,
  recoveryCase = null,
  recoveryId = null,
  continuityReview = null,
  campaignState = null,
  eventTime = null
} = {}) {
  if (decision?.eventType !== 'hostNativeContinuityContradiction') return null;
  const id = compact(recoveryId) || `recovery:continuity:${decision.responseId || decision.ingressId || decision.transactionId || 'host-native'}`;
  const observedAt = eventTime || new Date().toISOString();
  const currentRevision = Number(campaignState?.runtimeTracking?.revision ?? 0) || 0;
  const findings = (Array.isArray(continuityReview?.findings) ? continuityReview.findings : [])
    .map(compactContinuityFindingRef)
    .filter(Boolean);
  const factIds = [...new Set(findings.map((finding) => compact(finding.factId)).filter(Boolean))];
  const findingKinds = [...new Set(findings.map((finding) => compact(finding.kind)).filter(Boolean))];
  const source = {
    kind: 'hostNativeGeneration',
    responseId: decision.responseId || continuityReviewSourceRef(continuityReview).responseId,
    ingressId: decision.ingressId || continuityReviewSourceRef(continuityReview).ingressId,
    outcomeId: decision.outcomeId || continuityReviewSourceRef(continuityReview).outcomeId,
    turnId: decision.turnId || continuityReviewSourceRef(continuityReview).turnId,
    hostMessageId: continuityReviewSourceRef(continuityReview).hostMessageId,
    textHash: continuityReviewSourceRef(continuityReview).textHash
  };
  const claimSource = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== null && value !== undefined && value !== ''));
  const rejectedClaims = factIds.length ? [{
    schemaVersion: 1,
    id: `generated-claim.${hashStableJson({ recoveryId: id, factIds, textHash: source.textHash || null })}`,
    status: 'rejected',
    categories: ['continuity'],
    textHash: source.textHash || hashStableJson({ recoveryId: id, factIds }),
    source: claimSource,
    sourceHash: hashStableJson(claimSource),
    extractedAt: observedAt,
    authority: 'generatedClaim',
    accepted: false,
    findingFactIds: factIds,
    findingKinds,
    review: {
      kind: continuityReview?.kind || 'directive.sreHostNativeContinuityReview.v1',
      ok: false,
      checkedFactCount: Number(continuityReview?.checkedFactCount || 0),
      findingCount: findings.length
    }
  }] : [];
  const projectionHints = factIds.map((factId) => {
    const finding = findings.find((entry) => entry.factId === factId) || {};
    return {
      id: `hint.violation.${hashStableJson({ recoveryId: id, factId, kind: finding.kind || null, revision: currentRevision })}`,
      factId,
      mode: 'guard',
      force: 'guard',
      minimumLane: 'directive.continuity.invariants',
      reason: 'Recent continuity contradiction.',
      owner: 'repair',
      source: {
        kind: 'hostNativeContinuityContradiction',
        recoveryId: id,
        findingKind: finding.kind || null
      },
      createdRevision: currentRevision,
      expiresRevision: currentRevision + 4,
      createdAt: observedAt
    };
  });
  return {
    rejectedClaims,
    projectionHints,
    factUseStats: continuityFactUseStatsProjection({
      campaignState,
      factIds,
      currentRevision,
      observedAt
    }),
    recoveryEvent: {
      id,
      type: 'hostNativeContinuityContradiction',
      status: 'open',
      hostMessageId: source.hostMessageId || null,
      ingressId: decision.ingressId || null,
      outcomeId: decision.outcomeId || null,
      recordedAt: observedAt,
      details: {
        responseId: decision.responseId || null,
        hostMessageId: source.hostMessageId || null,
        findings,
        coreRecovery: {
          status: recoveryCase ? 'recorded' : 'notRecorded',
          transactionId: decision.transactionId || null,
          recoveryCaseId: recoveryCase?.id || id,
          phase: recoveryCase?.phase || decision.phaseAfter || null,
          reason: recoveryCase?.reason || decision.reason || null
        },
        coreRecoveryError: null,
        repairDecision: cloneJson(decision),
        recoveryPolicy: {
          action: decision.recoveryAction || 'reviewHostNativeContinuityContradiction',
          reason: decision.recoverySummary || 'Host-native generation contradicted protected continuity facts and cannot be accepted unchanged.',
          hostRepairAvailable: false,
          retryHostGeneration: decision.retryHostGeneration === true,
          reobserveHostAssistantRows: decision.reobserveHostAssistantRows === true,
          preferredFirstAction: decision.preferredFirstAction || 'reviewHostNativeContinuityContradiction',
          allowedActions: cloneJson(decision.allowedActions || ['reviewHostNativeContinuityContradiction'])
        }
      }
    },
    ingressPatch: {
      status: 'recoveryRequired',
      responseStrategy: 'injectAndContinue',
      turnId: decision.turnId || null,
      outcomeId: decision.outcomeId || null,
      recoveryId: id,
      error: {
        code: decision.errorCode || 'DIRECTIVE_HOST_NATIVE_CONTINUITY_CONTRADICTION',
        message: 'Host-native generation contradicted protected continuity facts and requires recovery.'
      },
      failedAt: observedAt
    }
  };
}

function coreContinuityProjectionFromCompatibility(projection = null) {
  if (!isObjectRecord(projection)) return null;
  return {
    rejectedClaims: Array.isArray(projection.rejectedClaims) ? cloneJson(projection.rejectedClaims) : [],
    projectionHints: Array.isArray(projection.projectionHints) ? cloneJson(projection.projectionHints) : [],
    factUseStats: isObjectRecord(projection.factUseStats) ? cloneJson(projection.factUseStats) : {}
  };
}

function continuityProjectionHasEvidence(projection = null) {
  if (!isObjectRecord(projection)) return false;
  return Boolean(
    (Array.isArray(projection.rejectedClaims) && projection.rejectedClaims.length)
    || (Array.isArray(projection.projectionHints) && projection.projectionHints.length)
    || (isObjectRecord(projection.factUseStats) && Object.keys(projection.factUseStats).length)
  );
}

function responseRecoveryEventTypeFrom({ recoveryDecision = null, response = null, recovery = null } = {}) {
  return normalizeResponseRecoveryEvent({
    eventType: recoveryDecision?.eventType
      || response?.coreRecovery?.reason
      || recovery?.details?.repairDecision?.eventType
      || recovery?.type
      || null,
    observationStatus: response?.hostObservationStatus || null,
    reason: recoveryDecision?.reason
      || response?.coreRecovery?.reason
      || recovery?.details?.repairDecision?.reason
      || recovery?.type
      || null
  });
}

function buildResponseReobserveClosureDecision({
  response = null,
  recovery = null,
  recoveryDecision = null,
  transaction = null,
  transactionId = null,
  observedHostMessageId = null,
  textHash = null,
  eventTime = null
} = {}) {
  const sourceDecision = recoveryDecision || recovery?.details?.repairDecision || {};
  const eventType = responseRecoveryEventTypeFrom({ recoveryDecision: sourceDecision, response, recovery });
  const allowedActions = Array.isArray(sourceDecision.allowedActions)
    ? [...sourceDecision.allowedActions]
    : (Array.isArray(recovery?.details?.recoveryPolicy?.allowedActions)
      ? [...recovery.details.recoveryPolicy.allowedActions]
      : []);
  const canReobserve = (
    (eventType === 'hostNativeGenerationFailed' || eventType === 'hostNativeAssistantUnavailable')
    && allowedActions.includes('reobserveHostAssistantRows')
    && Boolean(compact(observedHostMessageId))
    && Boolean(compact(textHash))
  );
  return {
    kind: 'directive.repairResponseReobserveClosureDecision.v1',
    authorized: canReobserve,
    action: canReobserve ? 'recordVisibleResponse' : 'blockReobserveClosure',
    reason: canReobserve ? 'host-native-response-reobserved' : 'response-reobserve-closure-not-authorized',
    eventType,
    responseId: response?.id || sourceDecision.responseId || recovery?.details?.responseId || null,
    ingressId: response?.ingressId || sourceDecision.ingressId || recovery?.ingressId || null,
    outcomeId: response?.outcomeId || sourceDecision.outcomeId || recovery?.outcomeId || null,
    turnId: response?.turnId || sourceDecision.turnId || recovery?.details?.turnId || null,
    transactionId: compact(transactionId || transaction?.id || sourceDecision.transactionId || recovery?.details?.coreTransactionId) || null,
    recoveryCaseId: transaction?.recoveryCaseId || response?.coreRecovery?.id || recovery?.details?.coreRecovery?.id || recovery?.id || null,
    recoveryId: response?.recoveryId || recovery?.id || null,
    allowedActions,
    observedHostMessageId: compact(observedHostMessageId) || null,
    textHash: compact(textHash) || null,
    phaseBefore: transaction?.phase || sourceDecision.phaseAfter || response?.coreRecovery?.phase || null,
    phaseAfter: canReobserve ? 'visibleResponsePosted' : (transaction?.phase || null),
    normalTurnAllowed: false,
    recoveryResolved: canReobserve,
    observedAt: eventTime || null
  };
}

function buildResponseRetryActuationDecision({
  response = null,
  recovery = null,
  recoveryDecision = null,
  transaction = null,
  transactionId = null,
  responseId = null,
  outcomeId = null,
  turnId = null,
  sourceFrameId = null,
  eventTime = null
} = {}) {
  const sourceDecision = recoveryDecision || recovery?.details?.repairDecision || response?.coreRecovery?.decision || {};
  const eventType = responseRecoveryEventTypeFrom({ recoveryDecision: sourceDecision, response, recovery });
  const allowedActions = Array.isArray(sourceDecision.allowedActions)
    ? sourceDecision.allowedActions
    : (Array.isArray(recovery?.details?.allowedActions) ? recovery.details.allowedActions : []);
  const retryAllowed = allowedActions.includes('retryResponse');
  const retryEventType = eventType === 'hostResponsePostFailure' || eventType === 'providerFailureAfterMechanicsCommit';
  const effectiveTransactionId = compact(
    transactionId
      || transaction?.id
      || sourceDecision.transactionId
      || response?.coreTransactionId
      || recovery?.details?.coreTransactionId
      || ''
  ) || null;
  const effectiveResponseId = compact(responseId || response?.id || recovery?.details?.responseId || sourceDecision.responseId || '') || null;
  const effectiveRecoveryId = compact(recovery?.id || sourceDecision.recoveryId || sourceDecision.recoveryCaseId || '') || null;
  const transactionPhase = transaction?.phase || null;
  const authorized = retryAllowed
    && retryEventType
    && Boolean(effectiveTransactionId)
    && (!transactionPhase || transactionPhase === 'responseRetryRequired');
  const deniedReason = authorized
    ? null
    : !retryEventType
      ? 'response-retry-event-type-not-eligible'
      : !retryAllowed
        ? 'response-retry-action-not-allowed'
        : !effectiveTransactionId
          ? 'response-retry-transaction-missing'
          : 'response-retry-transaction-not-retryable';
  return {
    kind: 'directive.repairResponseRetryActuationDecision.v1',
    eventType,
    sourceKind: 'directiveResponse',
    action: 'recordVisibleResponse',
    authorized,
    deniedReason,
    recoveryResolved: authorized,
    reason: authorized ? 'directive-response-retry-posted' : deniedReason,
    transactionId: effectiveTransactionId,
    transactionPhase,
    recoveryId: effectiveRecoveryId,
    recoveryCaseId: transaction?.recoveryCaseId || effectiveRecoveryId || null,
    responseId: effectiveResponseId,
    outcomeId: outcomeId || response?.outcomeId || recovery?.outcomeId || sourceDecision.outcomeId || null,
    turnId: turnId || response?.turnId || recovery?.details?.turnId || sourceDecision.turnId || null,
    sourceFrameId: sourceFrameId || response?.sourceFrameId || recovery?.details?.sourceFrameId || sourceDecision.sourceFrameId || null,
    allowedActions: cloneJson(allowedActions),
    retryDirectiveResponse: authorized,
    retryHostGeneration: false,
    normalTurnAllowed: false,
    observedAt: eventTime || null
  };
}

function buildOutcomeRerunActuationDecision({
  ledgerEntry = null,
  outcomeId = null,
  requestedType = 'rerunOutcome',
  eventTime = null
} = {}) {
  const effectiveOutcomeId = compact(outcomeId || ledgerEntry?.outcomeId || '');
  const replacementTransactionId = compact(ledgerEntry?.replacementTransactionId) || null;
  const replacedTransactionId = compact(ledgerEntry?.replacedTransactionId || ledgerEntry?.transactionId || ledgerEntry?.coreTransactionId) || null;
  const snapshotBeforeRetained = ledgerEntry?.snapshotBeforeRetained === true;
  const snapshotPresent = ledgerEntry?.snapshotPresent === true;
  const supportedType = ['rerunOutcome', 'recalculateFromHere'].includes(String(requestedType || ''));
  const hasCoreTransaction = Boolean(replacedTransactionId || replacementTransactionId);
  const authorized = Boolean(effectiveOutcomeId && ledgerEntry && snapshotBeforeRetained && snapshotPresent && supportedType && hasCoreTransaction);
  const deniedReason = authorized
    ? null
    : !ledgerEntry
      ? 'outcome-rerun-ledger-entry-missing'
      : !snapshotBeforeRetained
        ? 'outcome-rerun-snapshot-missing'
        : !snapshotPresent
          ? 'outcome-rerun-snapshot-evidence-missing'
          : !supportedType
            ? 'outcome-rerun-type-not-supported'
            : !hasCoreTransaction
              ? 'outcome-rerun-core-transaction-missing'
              : 'outcome-rerun-not-authorized';
  return {
    kind: 'directive.repairOutcomeRerunActuationDecision.v1',
    eventType: 'outcomeRerunRequested',
    sourceKind: 'committedOutcome',
    authorized,
    action: authorized ? 'createRerunBranchCandidate' : 'blockOutcomeRerun',
    reason: authorized
      ? 'outcome-rerun-branch-candidate'
      : deniedReason,
    deniedReason,
    transactionId: replacementTransactionId,
    replacedTransactionId,
    outcomeId: effectiveOutcomeId || null,
    turnId: ledgerEntry?.turnId || null,
    resultBand: ledgerEntry?.resultBand || null,
    replacementType: requestedType || 'rerunOutcome',
    narrationStatus: ledgerEntry?.narrationStatus || null,
    responseStatus: ledgerEntry?.responseStatus || null,
    snapshotBeforeRetained,
    snapshotPresent,
    allowedActions: authorized ? ['previewRerunBranchCandidate', 'commitRerunBranchCandidate'] : ['reviewOutcomeRerunRequest'],
    branchCandidateRequired: true,
    mechanicsRerunAuthorized: authorized,
    replacementTransactionRequired: Boolean(replacedTransactionId && !replacementTransactionId),
    coreTransactionRequired: true,
    normalTurnAllowed: false,
    observedAt: eventTime || null
  };
}

function buildTerminalCheckpointReplayActuationDecision({
  decisionId = null,
  interactionId = null,
  conditionId = null,
  turnId = null,
  outcomeId = null,
  action = 'restoreTerminalCheckpointSnapshot',
  snapshotSourceKind = null,
  snapshotPresent = false,
  snapshotHash = null,
  runtimeRevision = null,
  ledgerRevision = null,
  eventTime = null
} = {}) {
  const effectiveDecisionId = compact(decisionId || interactionId);
  const effectiveInteractionId = compact(interactionId || decisionId);
  const effectiveAction = compact(action) || 'restoreTerminalCheckpointSnapshot';
  const effectiveSnapshotHash = compact(snapshotHash);
  const hasReplayRef = Boolean(
    effectiveDecisionId
    || effectiveInteractionId
    || compact(conditionId)
    || compact(outcomeId)
  );
  const hasSnapshotEvidence = snapshotPresent === true && Boolean(effectiveSnapshotHash);
  const supportedAction = effectiveAction === 'restoreTerminalCheckpointSnapshot';
  const authorized = Boolean(hasReplayRef && hasSnapshotEvidence && supportedAction);
  const deniedReason = authorized
    ? null
    : !hasReplayRef
      ? 'terminal-checkpoint-replay-ref-missing'
      : !hasSnapshotEvidence
        ? 'terminal-checkpoint-replay-snapshot-evidence-missing'
        : !supportedAction
          ? 'terminal-checkpoint-replay-action-not-supported'
          : 'terminal-checkpoint-replay-not-authorized';
  return {
    kind: 'directive.repairTerminalCheckpointReplayActuationDecision.v1',
    eventType: 'terminalCheckpointReplayRequested',
    sourceKind: 'terminalOutcomeCheckpoint',
    authorized,
    action: authorized ? 'restoreTerminalCheckpointSnapshot' : 'blockTerminalCheckpointReplay',
    requestedAction: effectiveAction,
    reason: authorized ? 'terminal-checkpoint-replay-authorized' : deniedReason,
    deniedReason,
    decisionId: effectiveDecisionId || null,
    interactionId: effectiveInteractionId || null,
    conditionId: compact(conditionId) || null,
    turnId: compact(turnId) || null,
    outcomeId: compact(outcomeId) || null,
    snapshotSourceKind: compact(snapshotSourceKind) || null,
    snapshotPresent: snapshotPresent === true,
    snapshotHash: effectiveSnapshotHash || null,
    runtimeRevision: finiteInteger(runtimeRevision),
    ledgerRevision: finiteInteger(ledgerRevision),
    allowedActions: authorized ? ['restoreTerminalCheckpointSnapshot'] : ['reviewTerminalCheckpointReplayRequest'],
    normalTurnAllowed: false,
    observedAt: eventTime || null
  };
}

function buildRollbackActuationDecision({
  coreRecovery = null,
  decision = null,
  legacyProjection = null,
  sourceMutation = null,
  eventType = null,
  eventTime = null
} = {}) {
  const repairDecision = decision || coreRecovery?.decision || coreRecovery?.repairDecision || {};
  const mutation = sourceMutation || coreRecovery?.sourceMutation || repairDecision?.sourceMutation || {};
  const projection = legacyProjection || repairDecision?.legacyProjection || {};
  const sourceKind = compact(repairDecision?.sourceKind || mutation?.sourceKind || '');
  const restoreCandidate = projection?.restoreRevision ?? mutation?.preOutcomeRevision;
  const restoreRevision = hasPreOutcomeRevision(restoreCandidate) ? Number(restoreCandidate) : null;
  const authorized = (
    sourceKind !== 'directiveResponse'
    && repairDecision?.action === 'rollbackPending'
    && projection?.shouldRestoreRevision === true
    && restoreRevision !== null
  );
  return {
    kind: 'directive.repairRollbackActuationDecision.v1',
    authorized,
    action: authorized ? 'restorePreOutcomeRevision' : 'blockRollbackActuation',
    reason: authorized ? 'repair-authorized-rollback' : 'repair-rollback-not-authorized',
    eventType: repairDecision?.eventType || eventType || null,
    sourceKind: sourceKind || null,
    ingressId: mutation?.ingressId || repairDecision?.ingressId || null,
    responseId: mutation?.responseId || repairDecision?.responseId || null,
    outcomeId: mutation?.outcomeId || repairDecision?.outcomeId || null,
    sourceFrameId: mutation?.sourceFrameId || repairDecision?.sourceFrameId || null,
    transactionId: repairDecision?.transactionId || coreRecovery?.transactionId || null,
    recoveryCaseId: coreRecovery?.recoveryCaseId || null,
    restoreRevision,
    recoveryStatus: projection?.recoveryJournalStatus || null,
    observedAt: eventTime || null
  };
}

function buildCommittedOutcomeDeleteRollbackActuationDecision({
  coreRecovery = null,
  decision = null,
  ledgerEntry = null,
  legacyProjection = null,
  sourceMutation = null,
  eventTime = null
} = {}) {
  const transactionId = compact(
    decision?.transactionId
    || coreRecovery?.transactionId
    || ledgerEntry?.coreTransactionId
    || ledgerEntry?.transactionId
  ) || null;
  const outcomeId = compact(
    decision?.outcomeId
    || sourceMutation?.outcomeId
    || ledgerEntry?.outcomeId
  ) || null;
  const restoreCandidate = legacyProjection?.restoreRevision
    ?? sourceMutation?.preOutcomeRevision
    ?? ledgerEntry?.snapshotBefore?.runtimeTracking?.revision;
  const restoreRevision = hasPreOutcomeRevision(restoreCandidate) ? Number(restoreCandidate) : null;
  const deleteMutation = {
    ...(sourceMutation && typeof sourceMutation === 'object' ? cloneJson(sourceMutation) : {}),
    kind: 'directive.sourceMutation.v1',
    sourceKind: 'committedOutcome',
    eventType: 'committedOutcomeDeleted',
    transactionId,
    outcomeId,
    turnId: compact(sourceMutation?.turnId || decision?.turnId || ledgerEntry?.turnId) || null,
    sourceFrameId: compact(sourceMutation?.sourceFrameId || decision?.sourceFrameId || ledgerEntry?.sourceFrameId) || null,
    preOutcomeRevision: restoreRevision
  };
  const deleteDecision = {
    ...(decision && typeof decision === 'object' ? cloneJson(decision) : {}),
    kind: 'directive.repairDecision.v1',
    eventType: 'committedOutcomeDeleted',
    sourceKind: 'committedOutcome',
    action: 'rollbackPending',
    reason: decision?.reason || 'committed-outcome-delete-rollback-required',
    transactionId,
    outcomeId,
    turnId: deleteMutation.turnId,
    sourceFrameId: deleteMutation.sourceFrameId,
    sourceMutation: deleteMutation,
    allowedActions: Array.isArray(decision?.allowedActions)
      ? cloneJson(decision.allowedActions)
      : ['rollbackToPreOutcomeRevision', 'reviewCommittedOutcomeDelete'],
    normalTurnAllowed: false
  };
  return buildRollbackActuationDecision({
    coreRecovery: {
      ...(coreRecovery && typeof coreRecovery === 'object' ? cloneJson(coreRecovery) : {}),
      transactionId,
      recoveryCaseId: coreRecovery?.recoveryCaseId || coreRecovery?.id || null,
      decision: deleteDecision,
      repairDecision: deleteDecision,
      sourceMutation: deleteMutation
    },
    decision: deleteDecision,
    legacyProjection: {
      ...(legacyProjection && typeof legacyProjection === 'object' ? cloneJson(legacyProjection) : {}),
      shouldRestoreRevision: true,
      restoreRevision
    },
    sourceMutation: deleteMutation,
    eventType: 'committedOutcomeDeleted',
    eventTime
  });
}

function compactRollbackActuationRecord({
  coreRecovery = null,
  rollbackActuation = null,
  legacyProjection = null,
  eventType = null,
  eventTime = null
} = {}) {
  const decision = coreRecovery?.decision || coreRecovery?.repairDecision || {};
  const mutation = coreRecovery?.sourceMutation || decision?.sourceMutation || {};
  return {
    kind: 'directive.repairRollbackActuationRecord.v1',
    status: 'recorded',
    eventType: eventType || rollbackActuation?.eventType || decision?.eventType || null,
    recoveryCaseId: coreRecovery?.recoveryCaseId || rollbackActuation?.recoveryCaseId || null,
    transactionId: coreRecovery?.transactionId || rollbackActuation?.transactionId || decision?.transactionId || null,
    sourceMutation: cloneJson(mutation),
    repairDecision: cloneJson(decision),
    legacyProjection: cloneJson(legacyProjection || decision?.legacyProjection || {}),
    rollbackActuation: cloneJson(rollbackActuation || {}),
    observedAt: eventTime || rollbackActuation?.observedAt || null
  };
}

function sceneHandshakeCollections(campaignState = {}) {
  const ledger = campaignState?.runtimeTracking?.sceneHandshake || {};
  return [
    Array.isArray(ledger.settled) ? ledger.settled : [],
    Array.isArray(ledger.pendingInternalReview) ? ledger.pendingInternalReview : [],
    Array.isArray(ledger.deferred) ? ledger.deferred : [],
    Array.isArray(ledger.operatorRecovery) ? ledger.operatorRecovery : [],
    Array.isArray(ledger.rejected) ? ledger.rejected : [],
    ledger.lastResult ? [ledger.lastResult] : []
  ];
}

function sceneHandshakeRecordMatchesMessage(record = {}, hostMessageId = '') {
  const id = compact(hostMessageId);
  if (!id) return false;
  return record.previousAssistantHostMessageId === id
    || record.currentPlayerHostMessageId === id
    || (Array.isArray(record.sourceMessageIds) && record.sourceMessageIds.includes(id))
    || (Array.isArray(record.sourceAnchorRange?.sourceMessageIds) && record.sourceAnchorRange.sourceMessageIds.includes(id));
}

function sceneHandshakeRecordAlreadyInactive(record = {}) {
  return Boolean(
    record.invalidatedAt
    || record.sourceStale === true
    || ['invalidated', 'source-stale', 'superseded'].includes(String(record.status || '').toLowerCase())
  );
}

function discoverSceneHandshakeDependentInvalidation(campaignState = {}, hostMessageId = '') {
  const settlementIds = [];
  for (const records of sceneHandshakeCollections(campaignState)) {
    for (const record of records) {
      if (!sceneHandshakeRecordMatchesMessage(record, hostMessageId) || sceneHandshakeRecordAlreadyInactive(record)) continue;
      const id = compact(record.id);
      if (id) settlementIds.push(id);
    }
  }
  return [...new Set(settlementIds)];
}

function discoverMissionComponentDependentInvalidation(campaignState = {}, hostMessageId = '') {
  const id = compact(hostMessageId);
  if (!id) return [];
  const records = campaignState?.knowledgeLedger?.components?.records;
  if (!Array.isArray(records)) return [];
  return [...new Set(records
    .filter((record) => record?.source?.hostMessageId === id)
    .map((record) => compact(record.id))
    .filter(Boolean))];
}

function buildDependentInvalidationProjection({
  campaignState = null,
  hostMessageId = null,
  eventType = null
} = {}) {
  const sceneHandshakeSettlementIds = discoverSceneHandshakeDependentInvalidation(campaignState, hostMessageId);
  const sourceStatus = /deleted/i.test(String(eventType || '')) ? 'deleted' : 'stale';
  const missionComponentIds = discoverMissionComponentDependentInvalidation(campaignState, hostMessageId)
    .filter((componentId) => {
      if (sourceStatus === 'deleted') return true;
      const component = (campaignState?.knowledgeLedger?.components?.records || [])
        .find((record) => compact(record?.id) === componentId);
      return component?.source?.sourceStatus !== 'deleted';
    });
  const promptDirtyDomains = [];
  if (sceneHandshakeSettlementIds.length) promptDirtyDomains.push('sceneHandshake');
  if (missionComponentIds.length) promptDirtyDomains.push('missionComponents');
  if (!sceneHandshakeSettlementIds.length && !missionComponentIds.length) return null;
  return {
    kind: 'directive.repairDependentInvalidation.v1',
    sceneHandshake: sceneHandshakeSettlementIds.length ? {
      settlementIds: sceneHandshakeSettlementIds,
      invalidatedCount: sceneHandshakeSettlementIds.length
    } : null,
    missionComponents: missionComponentIds.length ? {
      componentIds: missionComponentIds,
      markedCount: missionComponentIds.length,
      sourceStatus
    } : null,
    promptDirtyDomains
  };
}

function buildSourceMutation({
  eventType,
  eventTime,
  hostMessageId,
  replacementText = null,
  ingress = null,
  response = null,
  revision = null,
  autoRollback = false,
  visibility = null,
  selectedSwipe = null,
  message = null
} = {}) {
  const source = sourceRecord({ ingress, response });
  const sourceKind = sourceKindFor({ ingress, response });
  const selectedSwipeMutation = /swipe/i.test(String(eventType || ''))
    ? selectedSwipeMutationFields({ message, selectedSwipe })
    : null;
  return {
    kind: 'directive.sourceMutation.v1',
    sourceKind,
    eventType,
    hostMessageId: compact(hostMessageId) || null,
    ingressId: ingress?.id || response?.ingressId || null,
    responseId: response?.id || null,
    outcomeId: ingress?.outcomeId || response?.outcomeId || null,
    sourceFrameId: ingress?.sourceFrameId || response?.sourceFrameId || null,
    replacementTextHash: replacementTextHash(replacementText),
    replacementTextPresent: Boolean(compact(replacementText)),
    preOutcomeRevision: hasPreOutcomeRevision(revision) ? Number(revision) : null,
    autoRollback: autoRollback === true,
    visibility: visibility ? cloneJson(visibility) : undefined,
    selectedSwipe: selectedSwipeMutation ? cloneJson(selectedSwipeMutation) : undefined,
    observedAt: eventTime,
    priorStatus: source?.status || null
  };
}

export function createRepairRuntime({
  coreTurnStore = null,
  now = null
} = {}) {
  const recordedVisibilityDiagnostics = new Set();

  async function recordSourceMutationRecovery({
    eventType,
    eventTime = null,
    hostMessageId,
    replacementText = null,
    ingress = null,
    response = null,
    preOutcomeRevision: revision = null,
    autoRollback = false,
    message = null,
    index = null,
    chatMetadata = null,
    visibilityMap = null,
    selectedSwipe = null,
    state = null,
    campaignState = null
  } = {}) {
    const source = sourceRecord({ ingress, response });
    const transactionId = compact(ingress?.coreTransactionId || response?.coreTransactionId);
    const observedAt = eventTime || timestamp(now);
    const effectiveCampaignState = campaignState || state || null;
    const dependentInvalidation = buildDependentInvalidationProjection({
      campaignState: effectiveCampaignState,
      hostMessageId,
      eventType
    });
    if (!transactionId) {
      const sourceKind = sourceKindFor({ ingress, response });
      const sourceMutation = buildSourceMutation({
        eventType,
        eventTime: observedAt,
        hostMessageId,
        replacementText,
        ingress,
        response,
        revision,
        autoRollback,
        selectedSwipe,
        message
      });
      const effectiveRecoveryStatus = recoveryStatusForSourceMutation({
        sourceKind,
        sourceMutation,
        autoRollback
      });
      return {
        status: 'notRecorded',
        reason: 'no-core-transaction',
        sourceMutation,
        decision: buildRepairDecision({
          eventType,
          recoveryStatus: effectiveRecoveryStatus,
          sourceKind,
          transactionId: null,
          sourceMutation,
          autoRollback,
          dependentInvalidation
        })
      };
    }
    if (typeof coreTurnStore?.markRecoveryRequired !== 'function') {
      const error = new Error(`CORE recovery writer unavailable for source mutation on transaction "${transactionId}".`);
      error.code = 'DIRECTIVE_CORE_RECOVERY_WRITER_UNAVAILABLE';
      error.details = { transactionId, eventType };
      throw error;
    }

    const visibility = sourceMutationVisibilityFields({
      message,
      index,
      chatMetadata,
      visibilityMap
    });
    const sourceMutation = buildSourceMutation({
      eventType,
      eventTime: observedAt,
      hostMessageId,
      replacementText,
      ingress,
      response,
      revision,
      autoRollback,
      visibility,
      selectedSwipe,
      message
    });
    const sourceKind = sourceKindFor({ ingress, response });
    const effectiveRecoveryStatus = recoveryStatusForSourceMutation({
      sourceKind,
      sourceMutation,
      autoRollback
    });
    const decision = buildRepairDecision({
      eventType,
      recoveryStatus: effectiveRecoveryStatus,
      sourceKind,
      transactionId,
      sourceMutation,
      autoRollback,
      dependentInvalidation
    });
    const recoveryId = `recovery:source-mutation:${transactionId}:${eventType}`;
    const recoveryCase = await coreTurnStore.markRecoveryRequired(transactionId, {
      id: recoveryId,
      reason: eventType,
      status: 'required',
      sourceMutation,
      repairDecision: decision,
      dependentOutcomeId: sourceMutation.outcomeId || null,
      dependentResponseId: response?.id || null,
      allowedActions: allowedCoreRecoveryActions({ recoveryStatus: effectiveRecoveryStatus, sourceKind, autoRollback }),
      idempotencyKey: `core-source-mutation:${transactionId}:${eventType}`
    });
    return {
      status: 'recorded',
      transactionId,
      recoveryCaseId: recoveryCase?.id || recoveryId,
      phase: recoveryCase?.phase || 'recoveryRequired',
      reason: recoveryCase?.reason || eventType,
      decision,
      sourceMutation
    };
  }

  async function recordVisibilityMutation({
    eventType = 'hostMessageVisibilityChanged',
    eventTime = null,
    hostMessageId,
    ingress = null,
    response = null,
    message = null,
    index = null,
    chatMetadata = null,
    visibilityMap = null
  } = {}) {
    const sourceKind = sourceKindFor({ ingress, response });
    const transactionId = compact(ingress?.coreTransactionId || response?.coreTransactionId);
    const observedAt = eventTime || timestamp(now);
    const visibility = sourceMutationVisibilityFields({
      message,
      index,
      chatMetadata,
      visibilityMap
    });
    const decision = buildVisibilityDecision({
      eventType,
      sourceKind,
      transactionId,
      visibility
    });
    if (decision.sourceMutation) {
      return {
        status: 'sourceMutationDetected',
        reason: 'visibility-indicates-source-mutation',
        transactionId: transactionId || null,
        decision,
        visibility
      };
    }
    if (!decision.visibilityMutationOnly) {
      return {
        status: 'notRecorded',
        reason: 'no-visibility-mutation',
        transactionId: transactionId || null,
        decision,
        visibility
      };
    }
    if (!transactionId || typeof coreTurnStore?.appendDiagnostics !== 'function') {
      return {
        status: 'notRecorded',
        reason: transactionId ? 'core-diagnostics-unavailable' : 'no-core-transaction',
        transactionId: transactionId || null,
        decision,
        visibility
      };
    }
    const visibilityDigest = hashStableJson({
      eventType,
      hostMessageId: compact(hostMessageId) || null,
      sourceKind,
      visibility
    });
    const idempotencyKey = `core-visibility-mutation:${transactionId}:${visibilityDigest}`;
    if (recordedVisibilityDiagnostics.has(idempotencyKey)) {
      return {
        status: 'duplicate',
        transactionId,
        decision,
        visibility
      };
    }
    const diagnostic = await coreTurnStore.appendDiagnostics(transactionId, {
      id: `diagnostic:visibility:${transactionId}:${eventType}:${compact(hostMessageId) || 'host-message'}`,
      type: 'sourceVisibilityMutation',
      status: 'observed',
      severity: 'info',
      eventType,
      hostMessageId: compact(hostMessageId) || null,
      sourceKind,
      sourceFrameId: ingress?.sourceFrameId || response?.sourceFrameId || null,
      decision,
      visibility,
      observedAt,
      idempotencyKey
    });
    recordedVisibilityDiagnostics.add(idempotencyKey);
    return {
      status: 'recorded',
      transactionId,
      diagnosticId: diagnostic?.id || null,
      decision,
      visibility
    };
  }

  async function recordResponseRecovery({
    eventType = null,
    eventTime = null,
    observationStatus = null,
    reason = null,
    ingress = null,
    transactionId = null,
    responseId = null,
    outcomeId = null,
    turnId = null,
    sourceFrameId = null,
    recoveryId = null,
    error = null,
    campaignState = null,
    continuityReview = null,
    responseRetryPlan = null
  } = {}) {
    const decision = buildResponseRecoveryDecision({
      eventType,
      observationStatus,
      reason,
      ingress,
      transactionId,
      responseId,
      outcomeId,
      turnId,
      sourceFrameId,
      error
    });
    const effectiveTransactionId = decision.transactionId;
    const id = recoveryId || `recovery:response:${decision.responseId || decision.ingressId || decision.outcomeId || decision.turnId || effectiveTransactionId || 'untracked'}`;
    const observedAt = eventTime || timestamp(now);
    if (!effectiveTransactionId || typeof coreTurnStore?.markRecoveryRequired !== 'function') {
      return {
        status: 'notRecorded',
        reason: effectiveTransactionId ? 'core-recovery-writer-unavailable' : 'no-core-transaction',
        transactionId: effectiveTransactionId || null,
        decision,
        compatibilityProjection: buildHostNativeContinuityCompatibilityProjection({
          decision,
          recoveryId: id,
          continuityReview,
          campaignState,
          eventTime: observedAt
        })
      };
    }
    const pendingCompatibilityProjection = buildHostNativeContinuityCompatibilityProjection({
      decision,
      recoveryId: id,
      continuityReview,
      campaignState,
      eventTime: observedAt
    });
    const coreContinuityProjection = coreContinuityProjectionFromCompatibility(pendingCompatibilityProjection);
    const recoveryCase = await coreTurnStore.markRecoveryRequired(effectiveTransactionId, {
      id,
      reason: decision.reason,
      status: 'required',
      responseRetry: decision.responseRetry,
      phaseAfter: decision.phaseAfter,
      ingressId: decision.ingressId,
      responseId: decision.responseId,
      outcomeId: decision.outcomeId,
      turnId: decision.turnId,
      sourceFrameId: decision.sourceFrameId,
      dependentOutcomeId: decision.outcomeId,
      dependentResponseId: decision.responseId,
      errorCode: decision.errorCode || null,
      errorHash: decision.errorHash || null,
      repairDecision: decision,
      responseRetryPlan: cloneJson(responseRetryPlan || null),
      continuityProjection: coreContinuityProjection,
      allowedActions: decision.allowedActions,
      observedAt,
      idempotencyKey: `core-response-recovery:${effectiveTransactionId}:${id}:${decision.reason}`
    });
    return {
      status: 'recorded',
      transactionId: effectiveTransactionId,
      recoveryCaseId: recoveryCase?.id || id,
      phase: recoveryCase?.phase || decision.phaseAfter,
      reason: recoveryCase?.reason || decision.reason,
      decision,
      continuityProjectionRecorded: continuityProjectionHasEvidence(coreContinuityProjection),
      compatibilityProjection: buildHostNativeContinuityCompatibilityProjection({
        decision,
        recoveryCase,
        recoveryId: id,
        continuityReview,
        campaignState,
        eventTime: observedAt
      })
    };
  }

  async function recordRollbackActuation({
    coreRecovery = null,
    rollbackActuation = null,
    legacyProjection = null,
    eventType = null,
    eventTime = null
  } = {}) {
    const transactionId = compact(
      coreRecovery?.transactionId
      || rollbackActuation?.transactionId
      || coreRecovery?.decision?.transactionId
      || coreRecovery?.repairDecision?.transactionId
    );
    if (!transactionId || typeof coreTurnStore?.recordRollbackActuation !== 'function') {
      return {
        status: 'notRecorded',
        reason: transactionId ? 'core-rollback-writer-unavailable' : 'no-core-transaction',
        transactionId: transactionId || null,
        rollback: compactRollbackActuationRecord({
          coreRecovery,
          rollbackActuation,
          legacyProjection,
          eventType,
          eventTime
        })
      };
    }
    const rollback = compactRollbackActuationRecord({
      coreRecovery,
      rollbackActuation,
      legacyProjection,
      eventType,
      eventTime
    });
    const recorded = await coreTurnStore.recordRollbackActuation(transactionId, {
      ...rollback,
      idempotencyKey: `core-rollback-actuation:${transactionId}:${rollback.recoveryCaseId || rollback.eventType || 'rollback'}`
    });
    if (recorded?.status && recorded.status !== 'recorded') {
      return {
        status: recorded.status,
        reason: recorded.reason || 'core-rollback-actuation-not-recorded',
        transactionId,
        rollback
      };
    }
    return {
      status: 'recorded',
      transactionId,
      rollback: recorded?.rollback || rollback,
      recordId: recorded?.id || null
    };
  }

  return {
    recordSourceMutationRecovery,
    recordVisibilityMutation,
    recordResponseRecovery,
    recordRollbackActuation,
    evaluateResponseRecovery(options = {}) {
      return buildResponseRecoveryDecision(options);
    },
    evaluateResponseReobserveClosure(options = {}) {
      return buildResponseReobserveClosureDecision(options);
    },
    evaluateResponseRetryActuation(options = {}) {
      return buildResponseRetryActuationDecision(options);
    },
    evaluateOutcomeRerunActuation(options = {}) {
      return buildOutcomeRerunActuationDecision(options);
    },
    evaluateTerminalCheckpointReplayActuation(options = {}) {
      return buildTerminalCheckpointReplayActuationDecision(options);
    },
    evaluateCommittedOutcomeDeleteRollbackActuation(options = {}) {
      return buildCommittedOutcomeDeleteRollbackActuationDecision(options);
    },
    evaluateRollbackActuation(options = {}) {
      return buildRollbackActuationDecision(options);
    },
    evaluateSourceReobserve(options = {}) {
      return buildSourceReobserveDecision(options);
    },
    evaluateCorrectAsSwipeLifecycle(options = {}) {
      return buildCorrectAsSwipeLifecycleDecision(options);
    }
  };
}

export const __repairRuntimeTestHooks = Object.freeze({
  allowedCoreRecoveryActions,
  buildRepairDecision,
  buildOutcomeRerunActuationDecision,
  buildTerminalCheckpointReplayActuationDecision,
  buildRollbackActuationDecision,
  buildCommittedOutcomeDeleteRollbackActuationDecision,
  buildResponseRecoveryDecision,
  buildResponseReobserveClosureDecision,
  buildCorrectAsSwipeLifecycleDecision,
  buildSourceReobserveDecision,
  buildVisibilityDecision,
  buildSourceMutation,
  legacyProjectionForDecision,
  replacementTextHash
});
