import { runRuntimeAction } from '../../runtime/runtime-actions.js';
import { removeGlobalBridge } from '../../extension/global-bridge.js';
import {
  getSillyTavernDirectiveRuntimeBridge,
  removeDirectiveGenerationInterceptor,
  setSillyTavernDirectiveRuntimeEnabled
} from './runtime-bridge.mjs';

function registerEventHandler(source, eventName, handler) {
  if (!source || !eventName || typeof source.on !== 'function') return false;
  source.on(eventName, handler);
  return true;
}

function registerEventHandlers(source, eventNames, handler) {
  const registered = new Set();
  for (const eventName of eventNames) {
    if (!eventName || registered.has(eventName)) continue;
    if (registerEventHandler(source, eventName, handler)) registered.add(eventName);
  }
  return registered.size;
}

function reportFailure(label, error) {
  console.warn(`[Directive] ${label}:`, error);
}

export async function handlePlayerMessage(payload = {}) {
  try {
    return await getSillyTavernDirectiveRuntimeBridge().runtimeApp?.observeHostPlayerMessage?.(payload);
  } catch (error) {
    reportFailure('Failed to process player message', error);
    return { handled: false, error: error?.message || String(error) };
  }
}

export async function handleMessageEdited(payload = {}) {
  try {
    return await getSillyTavernDirectiveRuntimeBridge().runtimeApp?.handleHostMessageEdited?.(payload);
  } catch (error) {
    reportFailure('Failed to reconcile edited player message', error);
    return { handled: false, error: error?.message || String(error) };
  }
}

export async function handleMessageDeleted(payload = {}) {
  try {
    return await getSillyTavernDirectiveRuntimeBridge().runtimeApp?.handleHostMessageDeleted?.(payload);
  } catch (error) {
    reportFailure('Failed to reconcile deleted player message', error);
    return { handled: false, error: error?.message || String(error) };
  }
}

export async function handleExtensionDisabled() {
  setSillyTavernDirectiveRuntimeEnabled(false);
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
}

export async function handleChatChanged(payload = {}) {
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
  const eventTypes = ctx.eventTypes || ctx.event_types;
  if (ctx.eventSource && eventTypes) {
    const events = eventTypes;
    registerEventHandler(ctx.eventSource, events.CHAT_CHANGED, handleChatChanged);
    registerEventHandlers(ctx.eventSource, [
      events.MESSAGE_SENT,
      events.USER_MESSAGE_SENT
    ], handlePlayerMessage);
    registerEventHandlers(ctx.eventSource, [
      events.MESSAGE_EDITED,
      events.MESSAGE_UPDATED
    ], handleMessageEdited);
    registerEventHandlers(ctx.eventSource, [
      events.MESSAGE_DELETED,
      events.MESSAGE_REMOVED
    ], handleMessageDeleted);
    registerEventHandlers(ctx.eventSource, [
      events.EXTENSION_DISABLED,
      events.EXTENSION_DISABLE
    ], handleExtensionDisabled);
    return true;
  }

  const bus = ctx.eventBus || (typeof eventBus !== 'undefined' ? eventBus : null);
  if (bus && typeof bus.on === 'function') {
    registerEventHandler(bus, 'CHAT_CHANGED', handleChatChanged);
    registerEventHandler(bus, 'MESSAGE_SENT', handlePlayerMessage);
    registerEventHandler(bus, 'MESSAGE_EDITED', handleMessageEdited);
    registerEventHandler(bus, 'MESSAGE_DELETED', handleMessageDeleted);
    registerEventHandler(bus, 'EXTENSION_DISABLED', handleExtensionDisabled);
    registerEventHandler(bus, 'EXTENSION_DISABLE', handleExtensionDisabled);
    return true;
  }
  return false;
}

export const __directiveEventTestHooks = Object.freeze({
  wireEvents,
  handlePlayerMessage,
  handleMessageEdited,
  handleMessageDeleted,
  handleChatChanged,
  handleExtensionDisabled
});
