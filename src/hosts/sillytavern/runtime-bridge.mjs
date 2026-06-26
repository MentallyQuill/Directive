import { resolveDirectiveHostGenerationHandoff } from './turn-activity-indicator.js';

let runtimeApp = null;
let orchestrator = null;
let host = null;
let enabled = true;

export function setSillyTavernDirectiveRuntimeBridge({
  app = null,
  turnOrchestrator = null,
  directiveHost = null,
  active = true
} = {}) {
  runtimeApp = app;
  orchestrator = turnOrchestrator;
  host = directiveHost;
  enabled = active !== false;
  return getSillyTavernDirectiveRuntimeBridge();
}

export function getSillyTavernDirectiveRuntimeBridge() {
  return { runtimeApp, orchestrator, host, enabled };
}

export function setSillyTavernDirectiveRuntimeEnabled(value) {
  enabled = value !== false;
  return enabled;
}

export function clearSillyTavernDirectiveRuntimeBridge() {
  runtimeApp = null;
  orchestrator = null;
  host = null;
  enabled = false;
}

export async function directiveGenerationInterceptor(chat, contextSize, abort, type) {
  if (!enabled || !orchestrator || typeof orchestrator.interceptGeneration !== 'function') {
    return { handled: false, reason: enabled ? 'orchestrator-unavailable' : 'extension-disabled' };
  }
  try {
    const result = await orchestrator.interceptGeneration({ chat, contextSize, abort, type });
    if (
      result?.handled === true
      && result?.abortDefaultGeneration === false
      && result?.responseStrategy === 'injectAndContinue'
    ) {
      resolveDirectiveHostGenerationHandoff({
        type,
        responseStrategy: result.responseStrategy
      });
    }
    return result;
  } catch (error) {
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
