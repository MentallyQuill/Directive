import assert from 'node:assert/strict';

import { __directiveEventTestHooks } from '../../src/hosts/sillytavern/shell-events.js';
import {
  clearSillyTavernDirectiveRuntimeBridge,
  setSillyTavernDirectiveRuntimeBridge
} from '../../src/hosts/sillytavern/runtime-bridge.mjs';

const registrations = [];
const eventSource = {
  on(name, handler) {
    registrations.push({ name, handler });
  }
};
const eventTypes = {
  CHAT_CHANGED: 'chat_changed',
  MESSAGE_SENT: 'message_sent',
  USER_MESSAGE_RENDERED: 'user_message_rendered',
  MESSAGE_EDITED: 'message_edited',
  MESSAGE_UPDATED: 'message_updated',
  MESSAGE_DELETED: 'message_deleted',
  MESSAGE_SWIPED: 'message_swiped',
  EXTENSION_DISABLED: 'extension_disabled'
};

assert.equal(__directiveEventTestHooks.wireEvents({ eventSource, eventTypes }), true);
assert.deepEqual(
  registrations.map((entry) => entry.name).sort(),
  ['chat_changed', 'extension_disabled', 'message_deleted', 'message_edited', 'message_sent', 'message_swiped', 'message_updated', 'user_message_rendered'].sort()
);
assert.equal(registrations.every((entry) => typeof entry.handler === 'function'), true);

const legacyRegistrations = [];
assert.equal(__directiveEventTestHooks.wireEvents({
  eventSource: { on: (name, handler) => legacyRegistrations.push({ name, handler }) },
  event_types: eventTypes
}), true);
assert.equal(legacyRegistrations.length, registrations.length);

const lifecycleAdds = [];
const lifecycleRemoves = [];
const lifecycleSource = {
  on(name, handler) {
    lifecycleAdds.push({ name, handler });
  },
  off(name, handler) {
    lifecycleRemoves.push({ name, handler });
  }
};
const lifecycleDocumentEvents = [];
const lifecycleDocument = {
  addEventListener(name, handler, options) {
    lifecycleDocumentEvents.push({ op: 'add', name, handler, options });
  },
  removeEventListener(name, handler, options) {
    lifecycleDocumentEvents.push({ op: 'remove', name, handler, options });
  }
};
const fullEventTypes = {
  ...eventTypes,
  USER_MESSAGE_SENT: 'user_message_sent',
  MESSAGE_REMOVED: 'message_removed',
  GENERATION_STOPPED: 'generation_stopped',
  EXTENSION_DISABLE: 'extension_disable'
};
assert.equal(__directiveEventTestHooks.wireEvents({
  eventSource: lifecycleSource,
  eventTypes: fullEventTypes,
  document: lifecycleDocument
}), true);
const firstLifecycleAddCount = lifecycleAdds.length;
assert.equal(firstLifecycleAddCount, 12);
assert.equal(lifecycleDocumentEvents.filter((entry) => entry.op === 'add').length, 4);
assert.equal(__directiveEventTestHooks.wireEvents({
  eventSource: lifecycleSource,
  eventTypes: fullEventTypes,
  document: lifecycleDocument
}), true);
assert.equal(lifecycleRemoves.length, firstLifecycleAddCount);
assert.equal(lifecycleAdds.length, firstLifecycleAddCount * 2);
assert.equal(lifecycleDocumentEvents.filter((entry) => entry.op === 'remove').length, 4);
__directiveEventTestHooks.disposeSillyTavernDirectiveEventLifecycle();
assert.equal(lifecycleRemoves.length, firstLifecycleAddCount * 2);
assert.equal(lifecycleDocumentEvents.filter((entry) => entry.op === 'remove').length, 8);

let observeCalls = 0;
setSillyTavernDirectiveRuntimeBridge({
  active: true,
  app: {
    observeHostPlayerMessage() {
      observeCalls += 1;
      return observeCalls === 1
        ? { handled: false, reason: 'no-player-message' }
        : { handled: true, reason: 'processed' };
    }
  }
});
const firstObservation = await __directiveEventTestHooks.observePlayerMessageInBackground({ messageId: '2' });
assert.equal(firstObservation.retryScheduled, true);
assert.equal(firstObservation.retryAttempt, 1);
await new Promise((resolve) => setTimeout(resolve, 240));
assert.equal(observeCalls, 2);
clearSillyTavernDirectiveRuntimeBridge();

const fallbackObserved = [];
const fallbackContext = {
  chatId: 'fallback-chat',
  chat: [
    { is_user: false, mes: 'Directive opening narration.' },
    { is_user: true, mes: 'Commander Arlen studies the initial telemetry.' }
  ]
};
const mutationObservers = [];
class FakeMutationObserver {
  constructor(callback) {
    this.callback = callback;
    this.disconnected = false;
    mutationObservers.push(this);
  }

  observe(target, options) {
    this.target = target;
    this.options = options;
  }

  disconnect() {
    this.disconnected = true;
  }
}
const fallbackRoot = {
  querySelector(selector) {
    return selector === '#chat' ? { nodeName: 'DIV' } : null;
  },
  defaultView: {
    MutationObserver: FakeMutationObserver
  }
};
setSillyTavernDirectiveRuntimeBridge({
  active: true,
  app: {
    observeHostPlayerMessage(payload) {
      fallbackObserved.push(payload);
      return { handled: true, reason: 'processed' };
    }
  }
});
assert.equal(__directiveEventTestHooks.installUserMessageFallbackObserver(fallbackRoot, fallbackContext), true);
assert.equal(mutationObservers.length, 1);
assert.equal(fallbackObserved.length, 0, 'Fallback observer must not ingest pre-existing chat history on install.');
fallbackContext.chat.push({ is_user: false, mes: 'A bridge officer waits for orders.' });
assert.equal(__directiveEventTestHooks.scanLatestUserMessageFallback('test-assistant-only', fallbackContext).reason, 'already-observed');
fallbackContext.chat.push({
  is_user: true,
  mes: 'Commander Arlen gives one careful order and waits for the crew to answer.'
});
const fallbackChatChanged = __directiveEventTestHooks.handleUserMessageFallbackChatChanged(fallbackContext);
assert.equal(fallbackChatChanged.reset, false, 'Same-chat changes should scan for new player messages instead of resetting the baseline.');
await new Promise((resolve) => setTimeout(resolve, 100));
assert.equal(fallbackObserved.length, 1);
assert.equal(fallbackObserved[0].source, 'sillytavern-chat-fallback-observer');
assert.equal(fallbackObserved[0].chatId, 'fallback-chat');
assert.equal(fallbackObserved[0].index, 3);
assert.equal(fallbackObserved[0].messageId, 3);
assert.equal(__directiveEventTestHooks.scanLatestUserMessageFallback('test-duplicate', fallbackContext).reason, 'already-observed');
await new Promise((resolve) => setTimeout(resolve, 25));
assert.equal(fallbackObserved.length, 1, 'Fallback observer must not duplicate the same latest user message.');
__directiveEventTestHooks.disposeUserMessageFallbackObserver();
assert.equal(mutationObservers[0].disconnected, true);
const freshNoIdContext = {
  chat: [
    { is_user: false, mes: 'Directive opens a fresh campaign chat before SillyTavern exposes a chat id.' }
  ]
};
const observedBeforeFreshNoId = fallbackObserved.length;
assert.equal(__directiveEventTestHooks.installUserMessageFallbackObserver(fallbackRoot, freshNoIdContext), true);
freshNoIdContext.chat.push({
  is_user: true,
  mes: 'Commander Arlen gives the first fresh-chat order before the chat id is visible.'
});
const freshNoIdChange = __directiveEventTestHooks.handleUserMessageFallbackChatChanged(freshNoIdContext);
assert.equal(freshNoIdChange.reset, false, 'A fresh chat with no known chat id should observe the first appended user message instead of consuming it as baseline.');
await new Promise((resolve) => setTimeout(resolve, 100));
assert.equal(fallbackObserved.length, observedBeforeFreshNoId + 1);
assert.equal(fallbackObserved.at(-1).index, 1);
assert.equal(fallbackObserved.at(-1).messageId, 1);
assert.equal(fallbackObserved.at(-1).message.mes, 'Commander Arlen gives the first fresh-chat order before the chat id is visible.');
__directiveEventTestHooks.disposeUserMessageFallbackObserver();
assert.equal(mutationObservers.at(-1).disconnected, true);
clearSillyTavernDirectiveRuntimeBridge();

console.log('SillyTavern event wiring tests passed: current eventTypes, legacy event_types aliases, transient message observation retry, and chat fallback observation');
