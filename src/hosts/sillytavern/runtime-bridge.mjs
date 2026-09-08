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

export function resetDirectiveTurnProgress() {
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
  try {
    const result = await orchestrator.interceptGeneration({ chat, contextSize, abort, type });
    if (result?.handled === true && result?.abortDefaultGeneration === true) {
      finishDirectiveTurnActivity(activityToken);
      abort?.(false);
      showSettlementRetryDialog({
        reasonCode: result.settlementError?.reasonCode,
        attempts: result.settlementError?.persistenceAttempts,
        onRetry: async ({ signal = null, isActive = null } = {}) => {
          const settled = await runtimeApp?.retryPendingAcceptedPairSettlement?.();
          if (settled?.ok === true) {
            if (signal?.aborted === true || isActive?.() === false) {
              return { ok: false, reasonCode: 'settlement-retry-dismissed' };
            }
            const continued = await host?.chat?.continueHostGeneration?.({
              reason: 'directive-settlement-retry',
              type: type || 'normal',
              automaticTrigger: true,
              waitForCompletion: false
            });
            return continued?.ok === false ? { ok: false } : { ok: true };
          }
          return settled;
        }
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
    // Fail open. A host generation must not be blocked merely because Directive could
    // not classify an inactive or malformed turn.
    host?.logger?.error?.('[Directive] generation interceptor failed open:', error);
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
