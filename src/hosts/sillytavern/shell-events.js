import { runRuntimeAction } from '../../runtime/runtime-actions.js';
import { OUTCOME_INTEGRITY_EDIT_ACTION_ID } from '../../runtime/outcome-integrity.mjs';
import { removeGlobalBridge } from '../../extension/global-bridge.js';
import { closeDirectiveGuidance } from '../../guidance/directive-guidance.js';
import { closeAllDirectiveOverlays } from '../../ui/directive-overlay-root.js';
import { createSillyTavernEventAdapter } from './events-adapter.mjs';
import { disposeDirectiveAssistButton } from './directive-assist-button.js';
import { disposeDirectiveMessageActions } from './message-actions.js';
import {
  cancelActiveDirectiveTurnActivities,
  disposeDirectiveTurnActivity,
  finishDirectiveTurnActivity,
  markDirectiveTurnActivity,
  updateDirectiveTurnActivity
} from './turn-activity-indicator.js';
import {
  getSillyTavernDirectiveRuntimeBridge,
  removeDirectiveGenerationInterceptor,
  setSillyTavernDirectiveRuntimeEnabled
} from './runtime-bridge.mjs';

function registerEventHandlers(adapter, eventNames, handler, disposers) {
  const registered = new Set();
  for (const eventName of eventNames) {
    if (!eventName || registered.has(eventName)) continue;
    try {
      const dispose = adapter.on(eventName, handler);
      disposers.push(dispose);
      registered.add(eventName);
    } catch (error) {
      reportFailure(`Failed to wire event ${eventName}`, error);
    }
  }
  return registered.size;
}

function removeRegisteredEventHandler(source, eventName, handler) {
  if (typeof source?.off === 'function') {
    source.off(eventName, handler);
    return;
  }
  if (typeof source?.removeListener === 'function') {
    source.removeListener(eventName, handler);
  }
}

function createSourceEventAdapter(source) {
  return {
    on(eventName, handler) {
      source.on(eventName, handler);
      return () => removeRegisteredEventHandler(source, eventName, handler);
    }
  };
}

function rememberEventLifecycle(disposers) {
  eventLifecycle = {
    dispose() {
      for (const dispose of [...disposers].reverse()) {
        try {
          dispose();
        } catch (error) {
          reportFailure('Failed to dispose SillyTavern event handler', error);
        }
      }
      disposers.length = 0;
    }
  };
}

function reportFailure(label, error) {
  console.warn(`[Directive] ${label}:`, error);
}

function directiveDisabledResult() {
  return { handled: false, reason: 'extension-disabled' };
}

function directiveIsEnabled() {
  return getSillyTavernDirectiveRuntimeBridge().enabled !== false;
}

const PLAYER_MESSAGE_OBSERVE_RETRY_DELAYS_MS = Object.freeze([150, 500, 1000]);
const TRANSIENT_PLAYER_MESSAGE_REASONS = new Set(['no-player-message', 'inactive-or-unbound']);
const NATIVE_DELETE_INTENT_MAX_AGE_MS = 10000;

let pendingNativeDeleteIntent = null;
let nativeDeleteIntentCapture = null;
let nativeProtectedEditCapture = null;
let lastProtectedEditOpen = null;
let eventLifecycle = null;

const OUTCOME_INTEGRITY_EDIT_OPEN_DELAY_MS = 80;

function scheduleSoon(task, delayMs = 0) {
  const scheduler = typeof globalThis.setTimeout === 'function'
    ? globalThis.setTimeout.bind(globalThis)
    : (callback) => Promise.resolve().then(callback);
  return scheduler(task, Math.max(0, Number(delayMs) || 0));
}

function shouldRetryPlayerMessageObservation(result, attempt) {
  return (
    result?.handled !== true
    && TRANSIENT_PLAYER_MESSAGE_REASONS.has(result?.reason)
    && attempt < PLAYER_MESSAGE_OBSERVE_RETRY_DELAYS_MS.length
  );
}

function clonePayload(value) {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function nowMs() {
  return Date.now();
}

function rememberNativeDeleteIntent(hostMessageId, {
  source = 'sillytavern-native-delete-button',
  capturedAt = nowMs()
} = {}) {
  const id = String(hostMessageId ?? '').trim();
  if (!id) return null;
  pendingNativeDeleteIntent = {
    hostMessageId: id,
    source,
    capturedAt
  };
  return pendingNativeDeleteIntent;
}

function captureNativeDeleteIntent(event = {}) {
  const target = event?.target;
  const deleteButton = target?.closest?.('.mes_edit_delete');
  const row = deleteButton?.closest?.('.mes[mesid]');
  return rememberNativeDeleteIntent(row?.getAttribute?.('mesid'));
}

function installNativeDeleteIntentCapture(root = globalThis.document) {
  if (!root?.addEventListener || nativeDeleteIntentCapture?.root === root) return false;
  if (nativeDeleteIntentCapture?.root?.removeEventListener && nativeDeleteIntentCapture.handler) {
    nativeDeleteIntentCapture.root.removeEventListener('pointerdown', nativeDeleteIntentCapture.handler, true);
    nativeDeleteIntentCapture.root.removeEventListener('click', nativeDeleteIntentCapture.handler, true);
  }
  const handler = (event) => {
    captureNativeDeleteIntent(event);
  };
  root.addEventListener('pointerdown', handler, true);
  root.addEventListener('click', handler, true);
  nativeDeleteIntentCapture = { root, handler };
  return true;
}

function disposeNativeDeleteIntentCapture() {
  if (nativeDeleteIntentCapture?.root?.removeEventListener && nativeDeleteIntentCapture.handler) {
    nativeDeleteIntentCapture.root.removeEventListener('pointerdown', nativeDeleteIntentCapture.handler, true);
    nativeDeleteIntentCapture.root.removeEventListener('click', nativeDeleteIntentCapture.handler, true);
  }
  nativeDeleteIntentCapture = null;
  pendingNativeDeleteIntent = null;
}

function protectedEditDecision(hostMessageId) {
  const id = String(hostMessageId ?? '').trim();
  if (!id || !directiveIsEnabled()) return null;
  const bridge = getSillyTavernDirectiveRuntimeBridge();
  if (typeof bridge.runtimeApp?.getOutcomeIntegrityNativeEditDecision !== 'function') return null;
  try {
    return bridge.runtimeApp.getOutcomeIntegrityNativeEditDecision({
      hostMessageId: id,
      message: { hostMessageId: id, id }
    });
  } catch (error) {
    reportFailure('Failed to check Outcome Integrity edit protection', error);
    return null;
  }
}

function openOutcomeIntegrityEditor(hostMessageId) {
  const id = String(hostMessageId ?? '').trim();
  if (!id) return false;
  const now = nowMs();
  if (lastProtectedEditOpen?.hostMessageId === id && now - Number(lastProtectedEditOpen.openedAt || 0) < 650) {
    return true;
  }
  lastProtectedEditOpen = { hostMessageId: id, openedAt: now };
  scheduleSoon(() => {
    try {
      runRuntimeAction(OUTCOME_INTEGRITY_EDIT_ACTION_ID, {
        message: {
          hostMessageId: id,
          id
        }
      });
    } catch (error) {
      reportFailure('Failed to open Outcome Integrity editor', error);
    }
  }, OUTCOME_INTEGRITY_EDIT_OPEN_DELAY_MS);
  return true;
}

function captureNativeProtectedEditIntent(event = {}) {
  const target = event?.target;
  const editButton = target?.closest?.('.mes_edit');
  if (!editButton || target?.closest?.('.mes_edit_delete')) return false;
  const row = editButton.closest?.('.mes[mesid]');
  const hostMessageId = row?.getAttribute?.('mesid');
  const decision = protectedEditDecision(hostMessageId);
  if (decision?.nativeEdit !== 'intercept') return false;
  event.preventDefault?.();
  event.stopPropagation?.();
  event.stopImmediatePropagation?.();
  openOutcomeIntegrityEditor(hostMessageId);
  return true;
}

function installNativeProtectedEditCapture(root = globalThis.document) {
  if (!root?.addEventListener || nativeProtectedEditCapture?.root === root) return false;
  if (nativeProtectedEditCapture?.root?.removeEventListener && nativeProtectedEditCapture.handler) {
    nativeProtectedEditCapture.root.removeEventListener('pointerdown', nativeProtectedEditCapture.handler, true);
    nativeProtectedEditCapture.root.removeEventListener('click', nativeProtectedEditCapture.handler, true);
  }
  const handler = (event) => {
    captureNativeProtectedEditIntent(event);
  };
  root.addEventListener('pointerdown', handler, true);
  root.addEventListener('click', handler, true);
  nativeProtectedEditCapture = { root, handler };
  return true;
}

function disposeNativeProtectedEditCapture() {
  if (nativeProtectedEditCapture?.root?.removeEventListener && nativeProtectedEditCapture.handler) {
    nativeProtectedEditCapture.root.removeEventListener('pointerdown', nativeProtectedEditCapture.handler, true);
    nativeProtectedEditCapture.root.removeEventListener('click', nativeProtectedEditCapture.handler, true);
  }
  nativeProtectedEditCapture = null;
  lastProtectedEditOpen = null;
}

function consumeNativeDeleteIntent(payload) {
  const intent = pendingNativeDeleteIntent;
  if (!intent) return payload;
  pendingNativeDeleteIntent = null;
  if (nowMs() - Number(intent.capturedAt || 0) > NATIVE_DELETE_INTENT_MAX_AGE_MS) return payload;
  return {
    hostMessageId: intent.hostMessageId,
    source: intent.source,
    sillyTavernPayload: clonePayload(payload)
  };
}

function turnActivityReporter(activityToken) {
  if (!activityToken) return null;
  return (event = {}) => {
    updateDirectiveTurnActivity(activityToken, event);
  };
}

async function observePlayerMessageInBackground(payload = {}, activityToken = null, attempt = 0) {
  let retryScheduled = false;
  try {
    const result = await getSillyTavernDirectiveRuntimeBridge().runtimeApp?.observeHostPlayerMessage?.({
      ...payload,
      turnActivityReporter: turnActivityReporter(activityToken)
    });
    if (shouldRetryPlayerMessageObservation(result, attempt)) {
      retryScheduled = true;
      scheduleSoon(() => {
        observePlayerMessageInBackground(payload, activityToken, attempt + 1);
      }, PLAYER_MESSAGE_OBSERVE_RETRY_DELAYS_MS[attempt]);
      return {
        ...result,
        retryScheduled: true,
        retryAttempt: attempt + 1
      };
    }
    return result;
  } catch (error) {
    reportFailure('Failed to process player message', error);
    updateDirectiveTurnActivity(activityToken, {
      phase: 'recovery',
      mode: 'review',
      label: 'Directive needs review before this turn is fully settled.'
    });
    return { handled: false, error: error?.message || String(error) };
  } finally {
    if (!retryScheduled) finishDirectiveTurnActivity(activityToken);
  }
}

export function handlePlayerMessage(payload = {}) {
  if (!directiveIsEnabled()) return directiveDisabledResult();
  const activityToken = markDirectiveTurnActivity({
    label: 'Directive is reading your post...',
    phase: 'reading'
  });
  scheduleSoon(() => {
    observePlayerMessageInBackground(payload, activityToken);
  });
  return {
    handled: true,
    scheduled: true,
    responseStrategy: 'pendingDirectiveObservation',
    abortDefaultGeneration: false
  };
}

export async function handleMessageEdited(payload = {}) {
  if (!directiveIsEnabled()) return directiveDisabledResult();
  try {
    return await getSillyTavernDirectiveRuntimeBridge().runtimeApp?.handleHostMessageEdited?.(payload);
  } catch (error) {
    reportFailure('Failed to reconcile edited player message', error);
    return { handled: false, error: error?.message || String(error) };
  }
}

export async function handleMessageDeleted(payload = {}) {
  if (!directiveIsEnabled()) return directiveDisabledResult();
  try {
    return await getSillyTavernDirectiveRuntimeBridge().runtimeApp?.handleHostMessageDeleted?.(consumeNativeDeleteIntent(payload));
  } catch (error) {
    reportFailure('Failed to reconcile deleted player message', error);
    return { handled: false, error: error?.message || String(error) };
  }
}

export async function handleGenerationStopped(payload = {}) {
  if (!directiveIsEnabled()) return directiveDisabledResult();
  let cancelResult = null;
  try {
    cancelResult = await getSillyTavernDirectiveRuntimeBridge().runtimeApp?.handleHostGenerationStopped?.({
      ...(payload && typeof payload === 'object' ? payload : { payload }),
      reason: 'host-generation-stopped'
    });
  } catch (error) {
    reportFailure('Failed to cancel Directive generation after host Stop', error);
    cancelResult = {
      ok: false,
      error: { code: error?.code || 'DIRECTIVE_GENERATION_CANCEL_FAILED', message: error?.message || String(error) }
    };
  }
  const activityResult = cancelActiveDirectiveTurnActivities();
  return {
    handled: true,
    abortDefaultGeneration: false,
    cancelResult,
    activityResult
  };
}

export function disposeSillyTavernDirectiveEventLifecycle() {
  const lifecycle = eventLifecycle;
  eventLifecycle = null;
  if (lifecycle?.dispose) {
    lifecycle.dispose();
  }
  disposeNativeDeleteIntentCapture();
  disposeNativeProtectedEditCapture();
}

export async function handleExtensionDisabled() {
  setSillyTavernDirectiveRuntimeEnabled(false);
  closeDirectiveGuidance('extension-disabled');
  const { host } = getSillyTavernDirectiveRuntimeBridge();
  try {
    await host?.prompt?.clear?.({ reason: 'extension-disabled' });
  } catch (error) {
    reportFailure('Failed to clear prompt context during disable', error);
  }
  try {
    runRuntimeAction('runtime.hide');
  } catch (error) {
    reportFailure('Failed to hide runtime during disable', error);
  }
  removeDirectiveGenerationInterceptor();
  removeGlobalBridge();
  disposeDirectiveAssistButton();
  disposeDirectiveMessageActions();
  disposeDirectiveTurnActivity();
  disposeSillyTavernDirectiveEventLifecycle();
  closeAllDirectiveOverlays('extension-disabled');
}

export async function handleChatChanged(payload = {}) {
  if (!directiveIsEnabled()) return { refreshed: false, reason: 'extension-disabled' };
  try {
    await getSillyTavernDirectiveRuntimeBridge().runtimeApp?.handleHostChatChanged?.(payload);
  } catch (error) {
    reportFailure('Failed to synchronize campaign binding after chat change', error);
  }
  try {
    return await runRuntimeAction('runtime.refresh');
  } catch (error) {
    reportFailure('Failed to refresh runtime after chat change', error);
    return null;
  }
}

export function wireEvents(ctx) {
  if (!ctx) return false;
  disposeSillyTavernDirectiveEventLifecycle();
  installNativeDeleteIntentCapture(ctx.document || globalThis.document);
  installNativeProtectedEditCapture(ctx.document || globalThis.document);
  const disposers = [];
  const eventTypes = ctx.eventTypes || ctx.event_types;
  try {
    const adapter = createSillyTavernEventAdapter({ context: ctx });
    if (eventTypes) {
      const events = eventTypes;
      registerEventHandlers(adapter, [events.CHAT_CHANGED], handleChatChanged, disposers);
      registerEventHandlers(adapter, [
        events.MESSAGE_SENT,
        events.USER_MESSAGE_SENT,
        events.USER_MESSAGE_RENDERED
      ], handlePlayerMessage, disposers);
      registerEventHandlers(adapter, [events.MESSAGE_EDITED], handleMessageEdited, disposers);
      registerEventHandlers(adapter, [
        events.MESSAGE_DELETED,
        events.MESSAGE_REMOVED
      ], handleMessageDeleted, disposers);
      registerEventHandlers(adapter, [events.GENERATION_STOPPED], handleGenerationStopped, disposers);
      registerEventHandlers(adapter, [
        events.EXTENSION_DISABLED,
        events.EXTENSION_DISABLE
      ], handleExtensionDisabled, disposers);
    } else {
      registerEventHandlers(adapter, ['CHAT_CHANGED'], handleChatChanged, disposers);
      registerEventHandlers(adapter, ['MESSAGE_SENT', 'USER_MESSAGE_RENDERED'], handlePlayerMessage, disposers);
      registerEventHandlers(adapter, ['MESSAGE_EDITED'], handleMessageEdited, disposers);
      registerEventHandlers(adapter, ['MESSAGE_DELETED'], handleMessageDeleted, disposers);
      registerEventHandlers(adapter, ['GENERATION_STOPPED'], handleGenerationStopped, disposers);
      registerEventHandlers(adapter, ['EXTENSION_DISABLED', 'EXTENSION_DISABLE'], handleExtensionDisabled, disposers);
    }

    rememberEventLifecycle(disposers);
    return disposers.length > 0;
  } catch (error) {
    reportFailure('Failed to wire SillyTavern events', error);
  }

  if (ctx.eventSource && eventTypes) {
    const events = eventTypes;
    const fallbackAdapter = createSourceEventAdapter(ctx.eventSource);
    registerEventHandlers(fallbackAdapter, [events.CHAT_CHANGED], handleChatChanged, disposers);
    registerEventHandlers(fallbackAdapter, [
      events.MESSAGE_SENT,
      events.USER_MESSAGE_SENT,
      events.USER_MESSAGE_RENDERED
    ], handlePlayerMessage, disposers);
    registerEventHandlers(fallbackAdapter, [events.MESSAGE_EDITED], handleMessageEdited, disposers);
    registerEventHandlers(fallbackAdapter, [
      events.MESSAGE_DELETED,
      events.MESSAGE_REMOVED
    ], handleMessageDeleted, disposers);
    registerEventHandlers(fallbackAdapter, [events.GENERATION_STOPPED], handleGenerationStopped, disposers);
    registerEventHandlers(fallbackAdapter, [
      events.EXTENSION_DISABLED,
      events.EXTENSION_DISABLE
    ], handleExtensionDisabled, disposers);
    rememberEventLifecycle(disposers);
    return true;
  }

  const bus = ctx.eventBus || (typeof eventBus !== 'undefined' ? eventBus : null);
  if (bus && typeof bus.on === 'function') {
    const fallbackAdapter = createSourceEventAdapter(bus);
    registerEventHandlers(fallbackAdapter, ['CHAT_CHANGED'], handleChatChanged, disposers);
    registerEventHandlers(fallbackAdapter, ['MESSAGE_SENT', 'USER_MESSAGE_RENDERED'], handlePlayerMessage, disposers);
    registerEventHandlers(fallbackAdapter, ['MESSAGE_EDITED'], handleMessageEdited, disposers);
    registerEventHandlers(fallbackAdapter, ['MESSAGE_DELETED'], handleMessageDeleted, disposers);
    registerEventHandlers(fallbackAdapter, ['GENERATION_STOPPED'], handleGenerationStopped, disposers);
    registerEventHandlers(fallbackAdapter, ['EXTENSION_DISABLED', 'EXTENSION_DISABLE'], handleExtensionDisabled, disposers);
    rememberEventLifecycle(disposers);
    return true;
  }
  return false;
}

export const __directiveEventTestHooks = Object.freeze({
  wireEvents,
  handlePlayerMessage,
  handleMessageEdited,
  handleMessageDeleted,
  handleGenerationStopped,
  handleChatChanged,
  handleExtensionDisabled,
  observePlayerMessageInBackground,
  disposeSillyTavernDirectiveEventLifecycle,
  rememberNativeDeleteIntent,
  consumeNativeDeleteIntent,
  captureNativeProtectedEditIntent,
  installNativeProtectedEditCapture
});
