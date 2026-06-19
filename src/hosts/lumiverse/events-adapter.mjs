const LUMIVERSE_EVENT_ALIASES = Object.freeze({
  chatChanged: 'CHAT_CHANGED',
  chatSwitched: 'CHAT_SWITCHED',
  messageSent: 'MESSAGE_SENT',
  messageEdited: 'MESSAGE_EDITED',
  messageDeleted: 'MESSAGE_DELETED',
  messageSwiped: 'MESSAGE_SWIPED',
  swipeEdited: 'SWIPE_EDITED',
  generationStarted: 'GENERATION_STARTED',
  streamTokenReceived: 'STREAM_TOKEN_RECEIVED',
  generationEnded: 'GENERATION_ENDED',
  generationStopped: 'GENERATION_STOPPED',
  toolInvocation: 'TOOL_INVOCATION',
  permissionChanged: 'PERMISSION_CHANGED'
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
    throw new Error('Lumiverse event name must be a non-empty string');
  }
  return LUMIVERSE_EVENT_ALIASES[value] || value.trim();
}

function safeUnsubscribe(unsubscribe) {
  if (typeof unsubscribe === 'function') {
    unsubscribe();
  }
}

export function createLumiverseEventAdapter({ spindle } = {}) {
  requireObject(spindle, 'spindle');
  requireFunction(spindle.on, 'spindle.on');
  const subscriptions = new Set();

  function on(eventName, handler) {
    requireFunction(handler, 'event handler');
    const resolvedEvent = requireEventName(eventName);
    const unsubscribe = spindle.on(resolvedEvent, handler);
    const subscription = {
      eventName: resolvedEvent,
      unsubscribe: () => {
        safeUnsubscribe(unsubscribe);
        subscriptions.delete(subscription);
      }
    };
    subscriptions.add(subscription);
    return subscription.unsubscribe;
  }

  function onMany(eventNames = [], handler) {
    const unsubscribers = eventNames.map((eventName) => on(eventName, handler));
    return () => {
      for (const unsubscribe of unsubscribers.splice(0)) {
        unsubscribe();
      }
    };
  }

  function disposeAll() {
    for (const subscription of [...subscriptions]) {
      subscription.unsubscribe();
    }
  }

  return {
    on,
    onMany,
    disposeAll,
    listenerCount: () => subscriptions.size,
    aliases: LUMIVERSE_EVENT_ALIASES
  };
}
