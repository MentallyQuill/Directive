import {
  initializeCampaignRuntimeTracking,
  recordDirectiveResponse,
  recordRecoveryEvent,
  resolveRecoveryEvent,
  updateDirectiveResponse,
  updateTurnIngress
} from './state-delta-gateway.mjs';
import { prefixCampaignReplyHeader } from '../time/campaign-time-header.mjs';
import { reviewContinuityContradictions } from '../continuity/contradiction-guard.mjs';
import { quarantineGeneratedClaims } from '../continuity/claim-quarantine.mjs';
import { hashContinuityText } from '../continuity/fact-schema.mjs';
import {
  addContinuityProjectionHints,
  continuityHintsFromContradictionReview,
  recordContinuityFactUseStats
} from '../continuity/projection-hints.mjs';
import {
  createTurnLatencyMetrics,
  hashStableJson
} from './architecture-redesign-contracts.mjs';
import { createRepairRuntime } from './repair-runtime.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compact(value) {
  return String(value || '').trim();
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

export function createResponseDispatcher({
  host,
  coreTurnStore = null,
  repairRuntime = null,
  getCampaignState = null,
  setCampaignState = null,
  persist = null,
  now = null
} = {}) {
  if (!host?.chat?.postAssistantMessage) {
    throw new Error('ResponseDispatcher requires host.chat.postAssistantMessage.');
  }

  const repair = repairRuntime || createRepairRuntime({ coreTurnStore, now });

  function resolveState(campaignState) {
    const source = campaignState || getCampaignState?.();
    if (!source) throw new Error('ResponseDispatcher requires campaign state.');
    return initializeCampaignRuntimeTracking(source);
  }

  function findExisting(campaignState, idempotencyKey) {
    const state = initializeCampaignRuntimeTracking(campaignState);
    return (state.runtimeTracking.responseLedger || []).find((entry) => (
      idempotencyKey && entry.id === idempotencyKey
    )) || null;
  }

  function findIngress(campaignState, ingressId) {
    if (!ingressId) return null;
    const state = initializeCampaignRuntimeTracking(campaignState);
    return (state.runtimeTracking.ingressLedger || []).find((entry) => entry.id === ingressId) || null;
  }

  function findResponse(campaignState, responseId) {
    if (!responseId) return null;
    const state = initializeCampaignRuntimeTracking(campaignState);
    return (state.runtimeTracking.responseLedger || []).find((entry) => entry.id === responseId) || null;
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
    const existing = compact(message?.textHash);
    if (existing) return existing;
    const sourceText = text === null || text === undefined ? hostMessageText(message) : compact(text);
    return sourceText ? hashStableJson({ text: sourceText }) : null;
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
    if (!ingress?.coreTransactionId || hostContinuation?.released !== true) return null;
    const transactionId = ingress.coreTransactionId;
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

  async function recordCoreVisibleResponse({
    ingress = null,
    entry = null,
    responseText = '',
    directivePromptRevisionUsed = null
  } = {}) {
    if (typeof coreTurnStore?.advanceTurn !== 'function' || typeof coreTurnStore?.recordVisibleResponse !== 'function') return null;
    if (!ingress?.coreTransactionId || !entry?.hostMessageId) return null;
    const transactionId = ingress.coreTransactionId;
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
    if (!ingress?.coreTransactionId || !observedMessage || !responseId) return null;
    const observedHostMessageId = observedMessage.hostMessageId || observedMessage.id || null;
    if (!observedHostMessageId) return null;
    return coreTurnStore.recordVisibleResponse(ingress.coreTransactionId, {
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
    return repair.recordResponseRecovery({
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
    ingress = null,
    responseId = null,
    outcomeId = null,
    turnId = null,
    error = null
  } = {}) {
    if (!responseId) return null;
    return repair.recordResponseRecovery({
      eventType: 'hostNativeContinuityContradiction',
      observationStatus: 'completed',
      reason: 'hostNativeContinuityContradiction',
      ingress,
      responseId,
      outcomeId,
      turnId,
      recoveryId: `recovery:continuity:${responseId}`,
      error
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

  function findResponseRecovery(campaignState, response = null) {
    if (!response) return null;
    const state = initializeCampaignRuntimeTracking(campaignState);
    const recoveryIds = [
      response.recoveryId,
      `recovery:host-native:${response.id}`,
      `recovery:continuity:${response.id}`,
      `recovery:core-host-native-completion:${response.id}`
    ].map(compact).filter(Boolean);
    return (state.runtimeTracking?.recoveryJournal || []).find((entry) => (
      recoveryIds.includes(compact(entry.id))
    )) || null;
  }

  function evaluateResponseReobserveClosure({
    campaignState,
    response = null,
    transaction = null,
    observedHostMessageId = null,
    textHash = null,
    eventTime = null
  } = {}) {
    if (!response || typeof repair?.evaluateResponseReobserveClosure !== 'function') return null;
    const recovery = findResponseRecovery(campaignState, response);
    return repair.evaluateResponseReobserveClosure({
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

  function closeResponseReobserveProjection({
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
    const recovery = findResponseRecovery(campaignState, response);
    let next = updateDirectiveResponse(campaignState, response.id, {
      status: 'complete',
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

  async function settleHostNativeContinuityContradiction({
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
    campaignProjection = null
  } = {}) {
    const text = compact(observedText);
    if (!text) {
      return { ok: true, recoveryRequired: false, campaignState, continuityReview: null };
    }
    const review = reviewContinuityContradictions({
      text,
      campaignState,
      packageData,
      crewDataset,
      shipDataset,
      campaignProjection
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
    let repairDecision = null;
    try {
      coreRecovery = await markCoreHostNativeContradiction({
        ingress,
        responseId: id,
        outcomeId,
        turnId,
        error: continuityError
      });
      repairDecision = coreRecovery?.decision || null;
    } catch (error) {
      coreRecoveryError = compactError(error, 'DIRECTIVE_CORE_HOST_NATIVE_CONTRADICTION_RECOVERY_FAILED');
      repairDecision = repair.evaluateResponseRecovery({
        eventType: 'hostNativeContinuityContradiction',
        observationStatus: 'completed',
        ingress,
        responseId: id,
        outcomeId,
        turnId,
        error: continuityError
      });
    }

    let next = campaignState;
    if (id && findResponse(next, id)) {
      next = updateDirectiveResponse(next, id, {
        status: 'recoveryRequired',
        recoveryId,
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
        coreRecovery: coreRecovery ? {
          id: coreRecovery.recoveryCaseId || null,
          status: coreRecovery.status || null,
          phase: coreRecovery.phase || null,
          reason: coreRecovery.reason || null
        } : null,
        coreRecoveryError,
        continuityReview: cloneJson(review)
      });
    }
    next = quarantineGeneratedClaims(next, {
      text,
      source: {
        kind: 'hostNativeGeneration',
        responseId: id,
        ingressId,
        outcomeId,
        hostMessageId: hostId
      },
      review,
      status: 'rejected',
      now: observedAt
    }).campaignState;
    const violationFactIds = [...new Set((review.findings || [])
      .map((finding) => compact(finding?.factId))
      .filter(Boolean))];
    next = addContinuityProjectionHints(next, continuityHintsFromContradictionReview(review, {
      campaignState: next,
      now: observedAt
    }), {
      now: observedAt
    });
    next = recordContinuityFactUseStats(next, {
      violationFactIds,
      now: observedAt
    });
    next = recordRecoveryEvent(next, {
      id: recoveryId,
      type: 'hostNativeContinuityContradiction',
      status: 'open',
      hostMessageId: hostId,
      ingressId,
      outcomeId,
      recordedAt: observedAt,
      details: {
        responseId: id,
        hostMessageId: hostId,
        findings: cloneJson(review.findings || []),
        coreRecovery: cloneJson(coreRecovery || null),
        coreRecoveryError,
        repairDecision: cloneJson(repairDecision || null),
        recoveryPolicy: {
          action: repairDecision?.recoveryAction || 'reviewHostNativeContinuityContradiction',
          reason: repairDecision?.recoverySummary || 'Host-native generation contradicted protected continuity facts and cannot be accepted unchanged.',
          hostRepairAvailable: false,
          retryHostGeneration: repairDecision?.retryHostGeneration === true,
          reobserveHostAssistantRows: repairDecision?.reobserveHostAssistantRows === true,
          preferredFirstAction: repairDecision?.preferredFirstAction || 'reviewHostNativeContinuityContradiction',
          allowedActions: cloneJson(repairDecision?.allowedActions || ['reviewHostNativeContinuityContradiction'])
        }
      }
    });
    if (ingressId) {
      next = updateTurnIngress(next, ingressId, {
        status: 'recoveryRequired',
        responseStrategy: 'injectAndContinue',
        turnId,
        outcomeId,
        recoveryId,
        error: continuityError,
        failedAt: observedAt
      });
    }
    return {
      ok: false,
      recoveryRequired: true,
      status: 'recoveryRequired',
      recoveryId,
      campaignState: cloneJson(next),
      continuityReview: cloneJson(review),
      coreRecovery: cloneJson(coreRecovery || null),
      coreRecoveryError,
      repairDecision: cloneJson(repairDecision || null)
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
    if (!ingress?.coreTransactionId) return null;
    const transaction = await coreTurnStore.getTransaction(ingress.coreTransactionId);
    if (transaction?.visibleResponseRef) {
      return { status: 'visibleResponseRecorded', transaction };
    }
    if (transaction?.recoveryCaseId) {
      if (settlementStatus === 'completed' && hasObservedMessage) {
        const closure = evaluateResponseReobserveClosure({
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
      const response = findResponse(current, responseId);
      if (!response) return null;
      const ingress = findIngress(current, ingressId);
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
        return { ok: true, status: 'alreadySettled', terminalSettlement };
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
          const transaction = typeof coreTurnStore?.getTransaction === 'function' && ingress?.coreTransactionId
            ? await coreTurnStore.getTransaction(ingress.coreTransactionId)
            : null;
          repairClosure = evaluateResponseReobserveClosure({
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
        let next = updateDirectiveResponse(current, responseId, {
          status: coreCompletionError ? 'recoveryRequired' : 'complete',
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
          coreCompletionError
        });
        if (!coreCompletionError && repairClosure?.recoveryResolved === true) {
          next = closeResponseReobserveProjection({
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
        if (coreCompletionError) {
          const recoveryId = `recovery:core-host-native-completion:${responseId}`;
          next = recordRecoveryEvent(next, {
            id: recoveryId,
            type: 'coreHostNativeCompletionFailure',
            status: 'open',
            ingressId,
            outcomeId,
            recordedAt: eventTime,
            details: {
              responseId,
              turnId,
              coreTransactionId: ingress?.coreTransactionId || null,
              sourceFrameId: ingress?.sourceFrameId || ingress?.sourceFrame?.id || null,
              hostMessageId: observedHostMessageId,
              hostGenerationReleasedAt,
              turnLatency: cloneJson(turnLatency),
              error: coreCompletionError,
              recoveryPolicy: {
                action: 'repairCoreHostNativeCompletion',
                reason: 'Host-native generation completed, but CORE could not record the visible response.',
                retryHostGeneration: false
              }
            }
          });
        }
        await acceptState(next, `Recorded host-native completion for ${ingressId || responseId}.`);
        return { ok: coreCompletionError ? false : true, status: coreCompletionError ? 'recoveryRequired' : 'complete' };
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
      const recoveryId = `recovery:host-native:${responseId}`;
      let next = updateDirectiveResponse(current, responseId, {
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
      });
      next = recordRecoveryEvent(next, {
        id: recoveryId,
        type: failurePolicy.recoveryType,
        status: 'open',
        ingressId,
        outcomeId,
        recordedAt: eventTime,
        details: {
          responseId,
          turnId,
          coreTransactionId: ingress?.coreTransactionId || null,
          sourceFrameId: ingress?.sourceFrameId || ingress?.sourceFrame?.id || null,
          hostGenerationReleasedAt,
          turnLatency: cloneJson(turnLatency),
          observationStatus: status,
          error: settlement?.error ? compactError(settlement.error, failurePolicy.errorCode) : null,
          coreRecovery: cloneJson(coreRecovery || null),
          coreRecoveryError,
          repairDecision: cloneJson(failurePolicy),
          recoveryPolicy: {
            action: failurePolicy.recoveryAction,
            reason: failurePolicy.recoverySummary,
            retryHostGeneration: failurePolicy.retryHostGeneration,
            reobserveHostAssistantRows: failurePolicy.reobserveHostAssistantRows,
            preferredFirstAction: failurePolicy.preferredFirstAction,
            allowedActions: cloneJson(failurePolicy.allowedActions)
          }
        }
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
    const tracking = state.runtimeTracking || {};
    const responses = (tracking.responseLedger || []).filter((entry) => (
      entry?.strategy === 'injectAndContinue'
      && entry?.responseKind === 'hostGeneration'
      && entry?.status === 'released'
      && !entry.hostObservation?.hostMessageId
    ));
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
    const usedAssistantIds = new Set((tracking.responseLedger || [])
      .map((entry) => compact(entry.hostMessageId || entry.hostObservation?.hostMessageId))
      .filter(Boolean));
    const responseTransactionId = (entry = {}) => compact(entry.coreTransactionId || entry.coreRelease?.transactionId);
    const responsesByTransaction = new Map((tracking.responseLedger || [])
      .map((entry) => [responseTransactionId(entry), entry])
      .filter(([transactionId]) => Boolean(transactionId)));
    const hostMessageClaims = new Map();
    for (const entry of tracking.responseLedger || []) {
      const claimedHostMessageId = compact(entry.hostMessageId || entry.hostObservation?.hostMessageId);
      if (!claimedHostMessageId) continue;
      hostMessageClaims.set(claimedHostMessageId, {
        transactionId: responseTransactionId(entry),
        responseId: entry.id || null
      });
    }
    const results = [];
    for (const response of responses) {
      const ingress = findIngress(state, response.ingressId);
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
        if (!id || usedAssistantIds.has(id)) continue;
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
    }
    const projectionResults = [];
    if (typeof coreTurnStore?.readProjections === 'function' && typeof coreTurnStore?.recordVisibleResponse === 'function') {
      const projections = await coreTurnStore.readProjections();
      const projectionResponses = Array.isArray(projections?.responseLedger) ? projections.responseLedger : [];
      const projectedResponseTransactions = new Set(projectionResponses
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
      const hostContinueTimings = (projections?.turnTiming || []).filter((entry) => (
        entry?.transactionId
        && entry.route === 'hostContinue'
        && (
          !projectedResponseTransactions.has(entry.transactionId)
          || hashlessHostContinueResponsesByTransaction.has(entry.transactionId)
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
          ? findIngress(state, runtimeResponse.ingressId)
          : null;
        const runtimeHostObservation = runtimeResponse?.hostObservation || null;
        const hashlessProjectionResponse = hashlessHostContinueResponsesByTransaction.get(timing.transactionId) || null;
        const projectedHostMessageId = compact(hashlessProjectionResponse?.hostMessageId);
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
              const repairClosure = evaluateResponseReobserveClosure({
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
                const latestResponse = findResponse(latestState, runtimeResponse.id) || runtimeResponse;
                let next = closeResponseReobserveProjection({
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
        try {
          const repairClosure = evaluateResponseReobserveClosure({
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
            const latestResponse = findResponse(latestState, runtimeResponse.id) || runtimeResponse;
            let next = closeResponseReobserveProjection({
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
    const existing = findExisting(state, key);
    if (existing) return { ok: true, duplicate: true, entry: cloneJson(existing), campaignState: state };
    const ingress = findIngress(state, ingressId);
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
    const continuityReview = observedText ? reviewContinuityContradictions({
      text: observedText,
      campaignState: state,
      packageData,
      crewDataset,
      shipDataset,
      campaignProjection
    }) : null;
    const recoveryId = continuityReview?.ok === false
      ? `recovery:continuity:${key}`
      : (coreReleaseError ? `recovery:core-host-continue:${key}` : null);
    let continuityCoreRecovery = null;
    let continuityCoreRecoveryError = null;
    let continuityRepairDecision = null;
    if (continuityReview?.ok === false) {
      const continuityError = {
        code: 'DIRECTIVE_HOST_NATIVE_CONTINUITY_CONTRADICTION',
        message: 'Host-native generation contradicted protected continuity facts and requires recovery.'
      };
      try {
        continuityCoreRecovery = await markCoreHostNativeContradiction({
          ingress,
          responseId: key,
          outcomeId,
          turnId,
          error: continuityError
        });
        continuityRepairDecision = continuityCoreRecovery?.decision || null;
      } catch (error) {
        continuityCoreRecoveryError = compactError(error, 'DIRECTIVE_CORE_HOST_NATIVE_CONTRADICTION_RECOVERY_FAILED');
        continuityRepairDecision = repair.evaluateResponseRecovery({
          eventType: 'hostNativeContinuityContradiction',
          observationStatus: 'completed',
          ingress,
          responseId: key,
          outcomeId,
          turnId,
          error: continuityError
        });
      }
    }
    const entry = {
      id: key,
      ingressId,
      turnId,
      outcomeId,
      strategy: 'injectAndContinue',
      responseKind: responseType,
      postedAt: timestamp(now),
      status: (continuityReview?.ok === false || coreReleaseError)
        ? 'recoveryRequired'
        : (hostContinuation?.released === true ? 'released' : 'delegated'),
      sourceFrameId: ingress?.sourceFrameId || ingress?.sourceFrame?.id || null,
      hostGenerationReleasedAt,
      generationStartedAt: hostGenerationReleasedAt,
      hostGenerationReleaseMode: hostContinuation?.waitForCompletion === false ? 'nonblocking' : 'blocking-or-unknown',
      turnLatency,
      coreTransactionId: ingress?.coreTransactionId || null,
      coreRelease: coreRelease ? {
        transactionId: coreRelease.id || ingress?.coreTransactionId || null,
        phase: coreRelease.phase || null,
        route: coreRelease.route || null
      } : null,
      coreReleaseError,
      coreRecovery: continuityCoreRecovery ? {
        id: continuityCoreRecovery.recoveryCaseId || null,
        status: continuityCoreRecovery.status || null,
        phase: continuityCoreRecovery.phase || null,
        reason: continuityCoreRecovery.reason || null
      } : null,
      coreRecoveryError: continuityCoreRecoveryError,
      recoveryId,
      hostContinuation: safeHostContinuationRef(hostContinuation),
      hostObservation: observedMessage ? {
        hostMessageId: observedMessage.hostMessageId || observedMessage.id || null,
        index: observedMessage.index ?? null,
        textHash: hostMessageTextHash(observedMessage, observedText)
      } : null,
      continuityReview: cloneJson(continuityReview)
    };
    let next = recordDirectiveResponse(state, entry);
    if (observedText) {
      next = quarantineGeneratedClaims(next, {
        text: observedText,
        source: {
          kind: 'hostNativeGeneration',
          responseId: key,
          ingressId,
          outcomeId,
          hostMessageId: observedMessage?.hostMessageId || observedMessage?.id || null
        },
        review: continuityReview,
        status: continuityReview?.ok === false ? 'rejected' : 'candidate',
        now: entry.postedAt
      }).campaignState;
    }
    if (continuityReview?.ok === false) {
      const violationFactIds = [...new Set((continuityReview.findings || [])
        .map((finding) => compact(finding?.factId))
        .filter(Boolean))];
      next = addContinuityProjectionHints(next, continuityHintsFromContradictionReview(continuityReview, {
        campaignState: next,
        now: entry.postedAt
      }), {
        now: entry.postedAt
      });
      next = recordContinuityFactUseStats(next, {
        violationFactIds,
        now: entry.postedAt
      });
      next = recordRecoveryEvent(next, {
        id: recoveryId,
        type: 'hostNativeContinuityContradiction',
        status: 'open',
        ingressId,
        outcomeId,
        recordedAt: timestamp(now),
        details: {
          responseId: key,
          hostMessageId: observedMessage?.hostMessageId || observedMessage?.id || null,
          findings: cloneJson(continuityReview.findings || []),
          coreRecovery: cloneJson(continuityCoreRecovery || null),
          coreRecoveryError: continuityCoreRecoveryError,
          repairDecision: cloneJson(continuityRepairDecision || null),
          recoveryPolicy: {
            action: continuityRepairDecision?.recoveryAction || 'reviewHostNativeContinuityContradiction',
            reason: continuityRepairDecision?.recoverySummary || 'Host-native generation contradicted protected continuity facts and cannot be accepted unchanged.',
            hostRepairAvailable: false,
            retryHostGeneration: continuityRepairDecision?.retryHostGeneration === true,
            reobserveHostAssistantRows: continuityRepairDecision?.reobserveHostAssistantRows === true,
            preferredFirstAction: continuityRepairDecision?.preferredFirstAction || 'reviewHostNativeContinuityContradiction',
            allowedActions: cloneJson(continuityRepairDecision?.allowedActions || ['reviewHostNativeContinuityContradiction'])
          }
        }
      });
      if (ingressId) {
        next = updateTurnIngress(next, ingressId, {
          status: 'recoveryRequired',
          responseStrategy: 'injectAndContinue',
          turnId,
          outcomeId,
          recoveryId,
          error: {
            code: 'DIRECTIVE_HOST_NATIVE_CONTINUITY_CONTRADICTION',
            message: 'Host-native generation contradicted protected continuity facts and requires recovery.'
          },
          failedAt: entry.postedAt
        });
      }
    }
    if (coreReleaseError) {
      next = recordRecoveryEvent(next, {
        id: recoveryId,
        type: 'coreHostContinueReleaseFailure',
        status: 'open',
        ingressId,
        outcomeId,
        recordedAt: timestamp(now),
        details: {
          responseId: key,
          coreTransactionId: ingress?.coreTransactionId || null,
          sourceFrameId: ingress?.sourceFrameId || ingress?.sourceFrame?.id || null,
          hostGenerationReleasedAt,
          hostContinuation: safeHostContinuationRef(hostContinuation),
          turnLatency: cloneJson(turnLatency),
          error: coreReleaseError,
          recoveryPolicy: {
            action: 'recoveryRequired',
            reason: 'Host generation was released but CORE could not record the hostContinueReleased phase.',
            hostRepairAvailable: false
          }
        }
      });
      if (ingressId) {
        next = updateTurnIngress(next, ingressId, {
          status: 'recoveryRequired',
          responseStrategy: 'injectAndContinue',
          turnId,
          outcomeId,
          recoveryId,
          error: coreReleaseError,
          failedAt: entry.postedAt
        });
      }
    }
    await acceptState(next, `Delegated response for ${ingressId || turnId || 'campaign turn'} to host generation.`);
    releasePersistedResolve?.();
    if (continuityReview?.ok === false || coreReleaseError) {
      return {
        ok: false,
        recoveryRequired: true,
        duplicate: false,
        entry: cloneJson(entry),
        hostContinuation: safeHostContinuationRef(hostContinuation),
        continuityReview: cloneJson(continuityReview),
        coreReleaseError: cloneJson(coreReleaseError),
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
    const existing = findExisting(state, key);
    if (existing) {
      return { ok: true, duplicate: true, entry: cloneJson(existing), campaignState: state };
    }
    const ingress = findIngress(state, ingressId);
    const directiveGenerationStartedAt = metadata?.directiveGenerationStartedAt
      || metadata?.turnTiming?.directiveGenerationStartedAt
      || null;
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
      status: posted?.duplicate ? 'alreadyPosted' : 'posted',
      directiveGenerationStartedAt,
      generationStartedAt: directiveGenerationStartedAt,
      turnLatency,
      coreTransactionId: ingress?.coreTransactionId || null
    };
    let coreRelease = null;
    let coreReleaseError = null;
    try {
      coreRelease = await recordCoreVisibleResponse({
        ingress,
        entry,
        responseText,
        directivePromptRevisionUsed: state.campaignChatBinding?.promptContextRevision ?? null
      });
    } catch (error) {
      coreReleaseError = compactError(error, 'DIRECTIVE_CORE_VISIBLE_RESPONSE_RECORD_FAILED');
    }
    entry.coreRelease = coreRelease ? {
      transactionId: coreRelease.id || ingress?.coreTransactionId || null,
      phase: coreRelease.phase || null,
      route: coreRelease.route || null
    } : null;
    entry.coreReleaseError = coreReleaseError;
    if (coreReleaseError) {
      entry.status = 'recoveryRequired';
      entry.recoveryId = `recovery:core-visible-response:${key}`;
    }
    let next = recordDirectiveResponse(state, entry);
    if (coreReleaseError) {
      next = recordRecoveryEvent(next, {
        id: entry.recoveryId,
        type: 'coreVisibleResponseRecordFailure',
        status: 'open',
        ingressId,
        outcomeId,
        recordedAt: postedAt,
        details: {
          responseId: key,
          hostMessageId: entry.hostMessageId || null,
          coreTransactionId: ingress?.coreTransactionId || null,
          sourceFrameId: ingress?.sourceFrameId || ingress?.sourceFrame?.id || null,
          visibleResponsePostedAt: postedAt,
          turnLatency: cloneJson(turnLatency),
          error: coreReleaseError,
          recoveryPolicy: {
            action: 'repairCoreVisibleResponseRecord',
            reason: 'Directive posted the visible response, but CORE could not record visibleResponsePosted.',
            repostVisibleResponse: false
          }
        }
      });
      if (ingressId) {
        next = updateTurnIngress(next, ingressId, {
          status: 'recoveryRequired',
          responseStrategy: entry.strategy,
          turnId,
          outcomeId,
          recoveryId: entry.recoveryId,
          error: coreReleaseError,
          failedAt: postedAt
        });
      }
    }
    await acceptState(next, `Posted Directive ${responseType} response for ${ingressId || outcomeId || turnId || 'campaign turn'}.`);
    return {
      ok: coreReleaseError ? false : true,
      recoveryRequired: coreReleaseError ? true : undefined,
      duplicate: posted?.duplicate === true,
      posted: cloneJson(posted),
      response: cloneJson(posted),
      entry: cloneJson(entry),
      coreReleaseError: cloneJson(coreReleaseError),
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
