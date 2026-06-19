const SILLYTAVERN_EVENT_ALIASES = Object.freeze({
  chatChanged: 'CHAT_CHANGED',
  extensionDisabled: 'EXTENSION_DISABLED',
  extensionDisable: 'EXTENSION_DISABLE',
  messageSent: 'MESSAGE_SENT',
  messageEdited: 'MESSAGE_EDITED',
  messageDeleted: 'MESSAGE_DELETED'
});

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function requireFunction(value, label) {
  if (typeof value !== 'function') {
    throw new Error(`${label} must be a function`);
  }
}

function requireEventName(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('SillyTavern event name must be a non-empty string');
  }
  return SILLYTAVERN_EVENT_ALIASES[value] || value.trim();
}

function resolveEventSource(context) {
  if (context?.eventSource && typeof context.eventSource.on === 'function') {
    return context.eventSource;
  }
  if (context?.eventBus && typeof context.eventBus.on === 'function') {
    return context.eventBus;
  }
  throw new Error('SillyTavern context does not expose an event source.');
}

function resolveEventName(context, eventName) {
  const alias = requireEventName(eventName);
  return context?.event_types?.[alias] || alias;
}

function tryOff(source, eventName, handler) {
  if (typeof source.off === 'function') {
    source.off(eventName, handler);
    return;
  }
  if (typeof source.removeListener === 'function') {
    source.removeListener(eventName, handler);
  }
}

export function createSillyTavernEventAdapter({ context } = {}) {
  requireObject(context, 'SillyTavern context');
  const source = resolveEventSource(context);
  const subscriptions = new Set();

  function on(eventName, handler) {
    requireFunction(handler, 'event handler');
    const resolvedEvent = resolveEventName(context, eventName);
    source.on(resolvedEvent, handler);
    const subscription = {
      eventName: resolvedEvent,
      handler,
      unsubscribe: () => {
        tryOff(source, resolvedEvent, handler);
        subscriptions.delete(subscription);
      }
    };
    subscriptions.add(subscription);
    return subscription.unsubscribe;
  }

  function disposeAll() {
    for (const subscription of [...subscriptions]) {
      subscription.unsubscribe();
    }
  }

  return {
    on,
    disposeAll,
    listenerCount: () => subscriptions.size,
    aliases: SILLYTAVERN_EVENT_ALIASES
  };
}
