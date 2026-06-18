import { runRuntimeAction } from '../runtime/runtime-actions.js';
import { removeGlobalBridge } from './global-bridge.js';

function registerEventHandler(source, eventName, handler) {
  if (!source || !eventName || typeof source.on !== 'function') return false;
  source.on(eventName, handler);
  return true;
}

function registerEventHandlers(source, eventNames, handler) {
  const registered = new Set();
  for (const eventName of eventNames) {
    if (!eventName || registered.has(eventName)) continue;
    if (registerEventHandler(source, eventName, handler)) {
      registered.add(eventName);
    }
  }
  return registered.size;
}

export function handleExtensionDisabled() {
  try {
    runRuntimeAction('runtime.hide');
  } catch (error) {
    console.warn('[Directive] Failed to hide runtime during disable:', error);
  }
  removeGlobalBridge();
}

export function handleChatChanged() {
  try {
    runRuntimeAction('runtime.refresh');
  } catch (error) {
    console.warn('[Directive] Failed to refresh runtime after chat change:', error);
  }
}

export function wireEvents(ctx) {
  if (!ctx) return false;
  if (ctx.eventSource && ctx.event_types) {
    const events = ctx.event_types;
    registerEventHandler(ctx.eventSource, events.CHAT_CHANGED, handleChatChanged);
    registerEventHandlers(ctx.eventSource, [
      events.EXTENSION_DISABLED,
      events.EXTENSION_DISABLE
    ], handleExtensionDisabled);
    return true;
  }

  const bus = ctx.eventBus || (typeof eventBus !== 'undefined' ? eventBus : null);
  if (bus && typeof bus.on === 'function') {
    registerEventHandler(bus, 'CHAT_CHANGED', handleChatChanged);
    registerEventHandler(bus, 'EXTENSION_DISABLED', handleExtensionDisabled);
    registerEventHandler(bus, 'EXTENSION_DISABLE', handleExtensionDisabled);
    return true;
  }
  return false;
}

export const __directiveEventTestHooks = Object.freeze({
  wireEvents,
  handleChatChanged,
  handleExtensionDisabled
});
