import { runRuntimeAction } from '../../runtime/runtime-actions.js';
import { OUTCOME_INTEGRITY_EDIT_ACTION_ID } from '../../runtime/outcome-integrity.mjs';
import { removeGlobalBridge } from '../../extension/global-bridge.js';
import { closeDirectiveGuidance } from '../../guidance/directive-guidance.js';
import { closeAllDirectiveOverlays } from '../../ui/directive-overlay-root.js';
import { createSillyTavernEventAdapter } from './events-adapter.mjs';
import { disposeDirectiveAssistButton } from './directive-assist-button.js';
import { disposeDirectiveMessageActions } from './message-actions.js';
import { disposeMissionComponentsCapture } from './mission-components-capture.js';
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
const USER_MESSAGE_FALLBACK_SCAN_DELAY_MS = 50;
const USER_MESSAGE_FALLBACK_POLL_INTERVAL_MS = 750;

let pendingNativeDeleteIntent = null;
let nativeDeleteIntentCapture = null;
let nativeProtectedEditCapture = null;
let userMessageFallbackObserver = null;
let lastFallbackUserMessageSignature = null;
let lastFallbackChatId = null;
let lastFallbackChatMessageCount = null;
let pendingFallbackUserMessageSignatures = new Map();
let fallbackScanScheduled = false;
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

function compactString(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || null;
}

function currentSillyTavernContext(fallbackContext = null) {
  try {
    const context = globalThis.SillyTavern?.getContext?.();
    if (context && typeof context === 'object') return context;
  } catch {
    // Keep the fallback observer best-effort.
  }
  return fallbackContext && typeof fallbackContext === 'object' ? fallbackContext : null;
}

function currentChatIdFromContext(context = null) {
  return compactString(
    context?.chatId
    ?? context?.chat_id
    ?? context?.currentChatId
    ?? context?.current_chat_id
    ?? (typeof context?.getCurrentChatId === 'function' ? context.getCurrentChatId() : null)
    ?? context?.chatMetadata?.chat_id
    ?? context?.chat_metadata?.chat_id
    ?? getSillyTavernDirectiveRuntimeBridge().host?.chat?.getCurrentChatId?.()
  );
}

function messageText(message = {}) {
  const value = message?.mes ?? message?.content ?? message?.text ?? message?.message ?? '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((part) => part?.text || part?.content || '').filter(Boolean).join('\n');
  }
  return String(value || '');
}

function isUserMessage(message = {}) {
  return message?.is_user === true || message?.isUser === true || message?.role === 'user';
}

function hostMessageIdFor(message = {}, index = null) {
  return compactString(
    message?.id
    ?? message?.messageId
    ?? message?.message_id
    ?? message?.uuid
    ?? message?.extra?.messageId
  ) || (Number.isInteger(index) ? String(index) : null);
}

function latestUserMessageCandidate(context = null) {
  const ctx = currentSillyTavernContext(context);
  const chat = Array.isArray(ctx?.chat) ? ctx.chat : [];
  for (let index = chat.length - 1; index >= 0; index -= 1) {
    const message = chat[index];
    if (!isUserMessage(message)) continue;
    const text = compactString(messageText(message));
    if (!text) continue;
    const chatId = currentChatIdFromContext(ctx) || 'unknown-chat';
    const hostMessageId = hostMessageIdFor(message, index);
    return {
      chatId,
      index,
      hostMessageId,
      signature: `${chatId}:${index}`,
      chatLength: chat.length,
      payload: {
        chatId,
        index,
        messageId: index,
        hostMessageId,
        message: clonePayload(message),
        source: 'sillytavern-chat-fallback-observer'
      }
    };
  }
  return null;
}

function resetUserMessageFallbackBaseline(context = null) {
  const candidate = latestUserMessageCandidate(context);
  const ctx = currentSillyTavernContext(context);
  const chat = Array.isArray(ctx?.chat) ? ctx.chat : [];
  lastFallbackChatId = candidate?.chatId || currentChatIdFromContext(ctx) || null;
  lastFallbackChatMessageCount = chat.length;
  lastFallbackUserMessageSignature = candidate?.signature || null;
  return candidate;
}

function handleUserMessageFallbackChatChanged(context = null) {
  const ctx = currentSillyTavernContext(context);
  const chat = Array.isArray(ctx?.chat) ? ctx.chat : [];
  const chatLength = chat.length;
  const chatId = currentChatIdFromContext(ctx);
  if (!lastFallbackChatId) {
    const candidate = latestUserMessageCandidate(ctx);
    if (candidate && candidate.signature !== lastFallbackUserMessageSignature) {
      lastFallbackChatId = chatId || candidate.chatId || lastFallbackChatId;
      scheduleUserMessageFallbackScan('chat-changed');
      return {
        reset: false,
        chatId: chatId || candidate.chatId || null,
        signature: lastFallbackUserMessageSignature,
        chatLength
      };
    }
  }
  if (!lastFallbackChatId && lastFallbackChatMessageCount !== null && chatLength > lastFallbackChatMessageCount) {
    lastFallbackChatId = chatId || lastFallbackChatId;
    scheduleUserMessageFallbackScan('chat-changed');
    return {
      reset: false,
      chatId,
      signature: lastFallbackUserMessageSignature,
      chatLength
    };
  }
  if (!lastFallbackChatId || (chatId && chatId !== lastFallbackChatId)) {
    const candidate = resetUserMessageFallbackBaseline(ctx);
    return {
      reset: true,
      chatId: chatId || candidate?.chatId || null,
      signature: candidate?.signature || null,
      chatLength
    };
  }
  scheduleUserMessageFallbackScan('chat-changed');
  return {
    reset: false,
    chatId,
    signature: lastFallbackUserMessageSignature,
    chatLength
  };
}

function fallbackSignatureIsPending(signature) {
  if (!signature || !pendingFallbackUserMessageSignatures.has(signature)) return false;
  const startedAt = Number(pendingFallbackUserMessageSignatures.get(signature) || 0);
  return nowMs() - startedAt < 30000;
}

function clearPendingFallbackSignature(signature) {
  if (!signature) return;
  pendingFallbackUserMessageSignatures.delete(signature);
}

function schedulePendingFallbackClear(signature, delayMs = 2500) {
  scheduleSoon(() => clearPendingFallbackSignature(signature), delayMs);
}

function handleFallbackPlayerMessage(candidate, reason = 'scan') {
  if (!candidate?.signature) return { handled: false, reason: 'no-player-message' };
  pendingFallbackUserMessageSignatures.set(candidate.signature, nowMs());
  const activityToken = markDirectiveTurnActivity({
    label: 'Directive is reading your post...',
    phase: 'reading'
  });
  scheduleSoon(async () => {
    let result = null;
    try {
      result = await observePlayerMessageInBackground({
        ...candidate.payload,
        fallbackReason: reason
      }, activityToken);
      if (result?.handled === true) {
        lastFallbackUserMessageSignature = candidate.signature;
        lastFallbackChatId = candidate.chatId || lastFallbackChatId;
        lastFallbackChatMessageCount = candidate.chatLength ?? lastFallbackChatMessageCount;
      }
    } finally {
      if (result?.retryScheduled) schedulePendingFallbackClear(candidate.signature);
      else clearPendingFallbackSignature(candidate.signature);
    }
  });
  return {
    handled: true,
    scheduled: true,
    responseStrategy: 'pendingDirectiveObservation',
    abortDefaultGeneration: false,
    source: 'sillytavern-chat-fallback-observer'
  };
}

export function scanLatestUserMessageFallback(reason = 'scan', context = null) {
  fallbackScanScheduled = false;
  if (!directiveIsEnabled()) return directiveDisabledResult();
  const candidate = latestUserMessageCandidate(context);
  if (!candidate) {
    const ctx = currentSillyTavernContext(context);
    if (Array.isArray(ctx?.chat)) lastFallbackChatMessageCount = ctx.chat.length;
    lastFallbackUserMessageSignature = null;
    return { handled: false, reason: 'no-player-message' };
  }
  if (candidate.signature === lastFallbackUserMessageSignature) {
    return { handled: false, reason: 'already-observed', signature: candidate.signature };
  }
  if (fallbackSignatureIsPending(candidate.signature)) {
    return { handled: false, reason: 'observation-pending', signature: candidate.signature };
  }
  return handleFallbackPlayerMessage(candidate, reason);
}

function scheduleUserMessageFallbackScan(reason = 'mutation') {
  if (fallbackScanScheduled) return;
  fallbackScanScheduled = true;
  const timer = scheduleSoon(() => {
    scanLatestUserMessageFallback(reason, userMessageFallbackObserver?.context || null);
  }, USER_MESSAGE_FALLBACK_SCAN_DELAY_MS);
  if (userMessageFallbackObserver) userMessageFallbackObserver.scanTimer = timer;
}

function fallbackMutationTarget(root = null) {
  if (!root) return null;
  try {
    return root.querySelector?.('#chat')
      || root.querySelector?.('#chat_container')
      || root.body
      || root.documentElement
      || null;
  } catch {
    return null;
  }
}

export function installUserMessageFallbackObserver(root = globalThis.document, context = null) {
  disposeUserMessageFallbackObserver();
  const target = fallbackMutationTarget(root);
  const MutationObserverCtor = root?.defaultView?.MutationObserver || globalThis.MutationObserver;
  const controller = {
    root,
    context,
    observer: null,
    intervalId: null,
    scanTimer: null
  };
  userMessageFallbackObserver = controller;
  resetUserMessageFallbackBaseline(context);
  if (target && typeof MutationObserverCtor === 'function') {
    controller.observer = new MutationObserverCtor(() => scheduleUserMessageFallbackScan('chat-dom-mutation'));
    controller.observer.observe(target, { childList: true, subtree: true });
  }
  const intervalHost = root?.defaultView || globalThis.window;
  if (intervalHost && typeof intervalHost.setInterval === 'function') {
    controller.intervalId = intervalHost.setInterval(() => {
      scanLatestUserMessageFallback('chat-poll', controller.context);
    }, USER_MESSAGE_FALLBACK_POLL_INTERVAL_MS);
  }
  return Boolean(controller.observer || controller.intervalId);
}

export function disposeUserMessageFallbackObserver() {
  const controller = userMessageFallbackObserver;
  userMessageFallbackObserver = null;
  fallbackScanScheduled = false;
  if (controller?.observer?.disconnect) {
    try {
      controller.observer.disconnect();
    } catch (error) {
      reportFailure('Failed to dispose SillyTavern user-message fallback observer', error);
    }
  }
  const intervalHost = controller?.root?.defaultView || globalThis.window;
  if (controller?.intervalId && typeof intervalHost?.clearInterval === 'function') {
    intervalHost.clearInterval(controller.intervalId);
  }
  if (controller?.scanTimer && typeof globalThis.clearTimeout === 'function') {
    globalThis.clearTimeout(controller.scanTimer);
  }
  lastFallbackUserMessageSignature = null;
  lastFallbackChatId = null;
  lastFallbackChatMessageCount = null;
  pendingFallbackUserMessageSignatures = new Map();
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
  disposeUserMessageFallbackObserver();
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
  disposeMissionComponentsCapture();
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
    const result = await runRuntimeAction('runtime.refresh');
    handleUserMessageFallbackChatChanged(payload || userMessageFallbackObserver?.context || null);
    return result;
  } catch (error) {
    reportFailure('Failed to refresh runtime after chat change', error);
    handleUserMessageFallbackChatChanged(payload || userMessageFallbackObserver?.context || null);
    return null;
  }
}

export function wireEvents(ctx) {
  if (!ctx) return false;
  disposeSillyTavernDirectiveEventLifecycle();
  const root = ctx.document || globalThis.document;
  installNativeDeleteIntentCapture(root);
  installNativeProtectedEditCapture(root);
  const disposers = [];
  if (installUserMessageFallbackObserver(root, ctx)) {
    disposers.push(disposeUserMessageFallbackObserver);
  }
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
  installNativeProtectedEditCapture,
  installUserMessageFallbackObserver,
  disposeUserMessageFallbackObserver,
  resetUserMessageFallbackBaseline,
  handleUserMessageFallbackChatChanged,
  scanLatestUserMessageFallback
});
