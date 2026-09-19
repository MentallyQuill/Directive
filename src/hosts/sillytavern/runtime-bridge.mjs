import {
  cancelActiveDirectiveTurnActivities,
  finishDirectiveTurnActivity,
  markDirectiveTurnActivity,
  recordDirectiveTurnProgress,
  resolveDirectiveHostGenerationHandoff
} from './turn-activity-indicator.js';
import {
  closeSettlementRetryDialog,
  showSettlementRetryDialog
} from '../../ui/settlement-retry-dialog.js';

let runtimeApp = null;
let orchestrator = null;
let host = null;
let enabled = true;
let unsubscribeProgress = null;
let cancellationEpoch = 0;
let activeGenerationOperation = null;
let pendingRetryHandoff = null;

export function resetDirectiveTurnProgress() {
  cancellationEpoch += 1;
  activeGenerationOperation = null;
  pendingRetryHandoff = null;
  closeSettlementRetryDialog('runtime-reset');
  runtimeApp?.resetTurnProgress?.();
  recordDirectiveTurnProgress({ type: 'reset' });
}

function detachProgress() {
  unsubscribeProgress?.();
  unsubscribeProgress = null;
  resetDirectiveTurnProgress();
}

export function setSillyTavernDirectiveRuntimeBridge({
  app = null,
  turnOrchestrator = null,
  directiveHost = null,
  active = true
} = {}) {
  detachProgress();
  if (runtimeApp && runtimeApp !== app) cancelActiveDirectiveTurnActivities();
  runtimeApp = app;
  orchestrator = turnOrchestrator;
  host = directiveHost;
  enabled = active !== false;
  if (!enabled) {
    resetDirectiveTurnProgress();
    cancelActiveDirectiveTurnActivities();
  }
  if (enabled && runtimeApp?.subscribeTurnProgress) {
    const source = runtimeApp;
    unsubscribeProgress = source.subscribeTurnProgress(event => {
      if (enabled && runtimeApp === source) recordDirectiveTurnProgress(event);
    });
  }
  return getSillyTavernDirectiveRuntimeBridge();
}

export function getSillyTavernDirectiveRuntimeBridge() {
  return { runtimeApp, orchestrator, host, enabled };
}

export function setSillyTavernDirectiveRuntimeEnabled(value) {
  enabled = value !== false;
  if (!enabled) {
    resetDirectiveTurnProgress();
    cancelActiveDirectiveTurnActivities();
  }
  return enabled;
}

export function clearSillyTavernDirectiveRuntimeBridge() {
  detachProgress();
  cancelActiveDirectiveTurnActivities();
  closeSettlementRetryDialog('bridge-cleared');
  runtimeApp = null;
  orchestrator = null;
  host = null;
  enabled = false;
}

export async function directiveGenerationInterceptor(chat, contextSize, abort, type) {
  if (!enabled || !orchestrator || typeof orchestrator.interceptGeneration !== 'function') {
    return { handled: false, reason: enabled ? 'orchestrator-unavailable' : 'extension-disabled' };
  }
  const handoff = pendingRetryHandoff;
  pendingRetryHandoff = null;
  const operation = handoff?.operation === activeGenerationOperation
    && handoff?.type === (type || 'normal') && handoff?.isActive()
    ? handoff.operation : { retryAttempt: null };
  if (operation !== activeGenerationOperation) {
    activeGenerationOperation = operation;
    closeSettlementRetryDialog('new-generation');
  }
  const activityToken = markDirectiveTurnActivity({
    label: 'Processing the turn...',
    phase: 'reading',
    hostGeneration: true
  });
  const boundAtStart = runtimeApp?.isCurrentChatBound?.() === true;
  const retryApp = runtimeApp;
  const retryHost = host;
  const retryOrchestrator = orchestrator;
  const retryChatId = retryHost?.chat?.getCurrentChatId?.();
  const retryEpoch = cancellationEpoch;
  const retryBinding = retryApp?.getCurrentChatBinding?.();
  const ownsRecovery = () => enabled && activeGenerationOperation === operation
    && retryEpoch === cancellationEpoch
    && runtimeApp === retryApp && host === retryHost && orchestrator === retryOrchestrator
    && retryApp?.isCurrentChatBound?.() === true
    && retryHost?.chat?.getCurrentChatId?.() === retryChatId
    && ['campaignId', 'saveId', 'chatId'].every(key => (
      retryBinding?.[key] === retryApp?.getCurrentChatBinding?.()?.[key]
    ));
  const retryGeneration = async ({ signal = null, isActive = null } = {}) => {
    const retryActive = () => {
      if (signal?.aborted || isActive?.() === false) return false;
      if (ownsRecovery()) return true;
      closeSettlementRetryDialog('stale-recovery');
      return false;
    };
    if (!retryActive()) return { ok: false, reasonCode: 'settlement-retry-dismissed' };
    const retryAttempt = {};
    operation.retryAttempt = retryAttempt;
    const prepared = await retryOrchestrator.interceptGeneration({
      chat, contextSize, abort, type, recoveryIntent: 'explicit', signal,
    });
    if (!retryActive()) return { ok: false, reasonCode: 'settlement-retry-dismissed' };
    if (prepared?.handled === true && prepared?.abortDefaultGeneration === true && prepared?.responseStrategy === 'protectedScenePublished' && prepared.publication?.persisted === true) {
      return { ok: true, publication: prepared.publication };
    }
    if (prepared?.abortDefaultGeneration !== false) {
      return { ok: false, reasonCode: prepared?.settlementError?.reasonCode || 'turn-preparation-failed' };
    }
    const continued = await retryHost?.chat?.continueHostGeneration?.({
      signal,
      isActive: retryActive,
      onGenerationStarting: () => {
        // Claim only the native interceptor entered by this Retry's Generate call.
        const handoff = { operation, type: type || 'normal',
          isActive: () => ownsRecovery() && operation.retryAttempt === retryAttempt };
        pendingRetryHandoff = handoff;
        return () => { if (pendingRetryHandoff === handoff) pendingRetryHandoff = null; };
      },
      reason: 'directive-settlement-retry', type: type || 'normal',
      automaticTrigger: true, waitForCompletion: false,
      onGenerationFailed: () => {
        if (!ownsRecovery() || operation.retryAttempt !== retryAttempt) return;
        operation.retryAttempt = null;
        closeSettlementRetryDialog('narration-failed');
        showSettlementRetryDialog({ reasonCode: 'narration-start-failed', onRetry: retryGeneration });
      },
    });
    if (!retryActive()) return { ok: false, reasonCode: 'settlement-retry-dismissed' };
    if (continued?.ok !== true || continued.skipped === true) {
      return { ok: false, reasonCode: continued?.alreadyGenerating ? 'host-already-generating' : 'narration-start-failed' };
    }
    return { ok: true };
  };
  try {
    const result = await retryOrchestrator.interceptGeneration({
      chat, contextSize, abort, type, recoveryIntent: 'native',
    });
    if (boundAtStart && !ownsRecovery() && result?.responseStrategy !== 'cancelStaleTurn') {
      finishDirectiveTurnActivity(activityToken);
      abort?.(false);
      return { handled: true, abortDefaultGeneration: true, responseStrategy: 'cancelStaleTurn', reasonCode: 'stale-recovery' };
    }
    if (
      result?.handled === true
      && result?.abortDefaultGeneration === true
      && result?.responseStrategy === 'cancelStaleTurn'
    ) {
      finishDirectiveTurnActivity(activityToken);
      abort?.(false);
      return result;
    }
    if (result?.handled === true && result?.abortDefaultGeneration === true && result?.responseStrategy === 'protectedScenePublished' && result.publication?.persisted === true) {
      finishDirectiveTurnActivity(activityToken);
      abort?.(false);
      return result;
    }
    if (result?.handled === true && result?.abortDefaultGeneration === true) {
      finishDirectiveTurnActivity(activityToken);
      abort?.(false);
      showSettlementRetryDialog({
        reasonCode: result.settlementError?.reasonCode,
        blockedRoles: result.settlementError?.blockedRoles || [],
        attempts: result.settlementError?.persistenceAttempts,
        onRetry: retryGeneration
      });
      return result;
    }
    if (
      result?.handled === true
      && result?.abortDefaultGeneration === false
      && result?.responseStrategy === 'injectAndContinue'
    ) {
      resolveDirectiveHostGenerationHandoff({
        token: activityToken,
        type,
        responseStrategy: result.responseStrategy
      });
    } else {
      finishDirectiveTurnActivity(activityToken);
    }
    return result;
  } catch (error) {
    finishDirectiveTurnActivity(activityToken);
    if ((boundAtStart && !ownsRecovery()) || error?.code === 'DIRECTIVE_GENERATION_ABORTED' || error?.name === 'AbortError') {
      abort?.(false);
      return { handled: true, abortDefaultGeneration: true, responseStrategy: 'cancelStaleTurn', reasonCode: 'host-generation-stopped' };
    }
    const bound = boundAtStart || runtimeApp?.isCurrentChatBound?.() === true;
    host?.logger?.error?.('[Directive] generation interceptor failed:', error);
    if (bound) {
      abort?.(false);
      const reasonCode = error?.reasonCode || error?.code || 'turn-preparation-failed';
      try { showSettlementRetryDialog({ reasonCode, onRetry: retryGeneration }); } catch (uiError) {
        host?.logger?.error?.('[Directive] Could not display turn recovery:', uiError);
      }
      return { handled: true, abortDefaultGeneration: true, responseStrategy: 'blockAndRetry',
        settlementError: {code:'DIRECTIVE_TURN_PREPARATION_FAILED', reasonCode, blockedRoles:[], persistenceAttempts:0} };
    }
    return {
      handled: false,
      reason: 'interceptor-error',
      error: { code: error?.code || 'DIRECTIVE_INTERCEPTOR_FAILED', message: error?.message || String(error) }
    };
  }
}

export function installDirectiveGenerationInterceptor() {
  globalThis.directiveGenerationInterceptor = directiveGenerationInterceptor;
  return directiveGenerationInterceptor;
}

export function removeDirectiveGenerationInterceptor() {
  if (globalThis.directiveGenerationInterceptor === directiveGenerationInterceptor) {
    delete globalThis.directiveGenerationInterceptor;
  }
}
