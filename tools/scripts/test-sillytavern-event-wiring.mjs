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
  MESSAGE_DELETED: 'message_deleted',
  EXTENSION_DISABLED: 'extension_disabled'
};

assert.equal(__directiveEventTestHooks.wireEvents({ eventSource, eventTypes }), true);
assert.deepEqual(
  registrations.map((entry) => entry.name).sort(),
  ['chat_changed', 'extension_disabled', 'message_deleted', 'message_edited', 'message_sent', 'user_message_rendered'].sort()
);
assert.equal(registrations.every((entry) => typeof entry.handler === 'function'), true);

const legacyRegistrations = [];
assert.equal(__directiveEventTestHooks.wireEvents({
  eventSource: { on: (name, handler) => legacyRegistrations.push({ name, handler }) },
  event_types: eventTypes
}), true);
assert.equal(legacyRegistrations.length, registrations.length);

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

console.log('SillyTavern event wiring tests passed: current eventTypes, legacy event_types aliases, and transient message observation retry');
