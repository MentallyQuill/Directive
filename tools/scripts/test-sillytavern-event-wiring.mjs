import assert from 'node:assert/strict';

import { __directiveEventTestHooks } from '../../src/hosts/sillytavern/shell-events.js';

const registrations = [];
const eventSource = {
  on(name, handler) {
    registrations.push({ name, handler });
  }
};
const eventTypes = {
  CHAT_CHANGED: 'chat_changed',
  MESSAGE_SENT: 'message_sent',
  MESSAGE_EDITED: 'message_edited',
  MESSAGE_DELETED: 'message_deleted',
  EXTENSION_DISABLED: 'extension_disabled'
};

assert.equal(__directiveEventTestHooks.wireEvents({ eventSource, eventTypes }), true);
assert.deepEqual(
  registrations.map((entry) => entry.name).sort(),
  ['chat_changed', 'extension_disabled', 'message_deleted', 'message_edited', 'message_sent'].sort()
);
assert.equal(registrations.every((entry) => typeof entry.handler === 'function'), true);

const legacyRegistrations = [];
assert.equal(__directiveEventTestHooks.wireEvents({
  eventSource: { on: (name, handler) => legacyRegistrations.push({ name, handler }) },
  event_types: eventTypes
}), true);
assert.equal(legacyRegistrations.length, registrations.length);

console.log('SillyTavern event wiring tests passed: current eventTypes and legacy event_types aliases');
