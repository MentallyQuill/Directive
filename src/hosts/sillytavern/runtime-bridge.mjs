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

export function resetDirectiveTurnProgress() {
  cancellationEpoch += 1;
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
  const activityToken = markDirectiveTurnActivity({
    label: 'Processing the turn...',
    phase: 'reading',
    hostGeneration: true
  });
  const boundAtStart = runtimeApp?.isCurrentChatBound?.() === true;
  const retryApp = runtimeApp;
  const retryChatId = host?.chat?.getCurrentChatId?.();
  const retryGeneration = async ({ signal = null, isActive = null } = {}) => {
    const retryEpoch = cancellationEpoch;
    if (signal?.aborted || isActive?.() === false) return { ok: false, reasonCode: 'settlement-retry-dismissed' };
    const prepared = await orchestrator.interceptGeneration({ chat, contextSize, abort, type });
    if (prepared?.abortDefaultGeneration !== false) {
      return { ok: false, reasonCode: prepared?.settlementError?.reasonCode || 'turn-preparation-failed' };
    }
    if (signal?.aborted || isActive?.() === false) return { ok: false, reasonCode: 'settlement-retry-dismissed' };
    const continued = await host?.chat?.continueHostGeneration?.({
      signal,
      reason: 'directive-settlement-retry', type: type || 'normal',
      automaticTrigger: true, waitForCompletion: false,
      onGenerationFailed: () => {
        if (retryEpoch !== cancellationEpoch) return;
        if (runtimeApp !== retryApp || runtimeApp?.isCurrentChatBound?.() !== true
          || host?.chat?.getCurrentChatId?.() !== retryChatId) return;
        closeSettlementRetryDialog('narration-failed');
        showSettlementRetryDialog({ reasonCode: 'narration-start-failed', onRetry: retryGeneration });
      },
    });
    if (continued?.ok !== true || continued.skipped === true) {
      return { ok: false, reasonCode: continued?.alreadyGenerating ? 'host-already-generating' : 'narration-start-failed' };
    }
    return { ok: true };
  };
  try {
    const result = await orchestrator.interceptGeneration({ chat, contextSize, abort, type });
    if (
      result?.handled === true
      && result?.abortDefaultGeneration === true
      && result?.responseStrategy === 'cancelStaleTurn'
    ) {
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
    if (error?.code === 'DIRECTIVE_GENERATION_ABORTED' || error?.name === 'AbortError') {
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
