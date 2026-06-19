import assert from 'node:assert/strict';

import { createLumiverseEventAdapter } from '../../src/hosts/lumiverse/events-adapter.mjs';

function createFakeSpindleEvents() {
  const handlers = new Map();
  const calls = [];
  return {
    calls,
    on(eventName, handler) {
      calls.push(eventName);
      if (!handlers.has(eventName)) {
        handlers.set(eventName, new Set());
      }
      handlers.get(eventName).add(handler);
      return () => handlers.get(eventName)?.delete(handler);
    },
    emit(eventName, payload) {
      for (const handler of handlers.get(eventName) || []) {
        handler(payload);
      }
    },
    count(eventName) {
      return handlers.get(eventName)?.size || 0;
    }
  };
}

const spindle = createFakeSpindleEvents();
const adapter = createLumiverseEventAdapter({ spindle });

let chatPayload = null;
const unsubscribeChat = adapter.on('chatChanged', (payload) => {
  chatPayload = payload;
});
assert.equal(spindle.calls[0], 'CHAT_CHANGED');
assert.equal(adapter.listenerCount(), 1);
spindle.emit('CHAT_CHANGED', {
  chatId: 'chat-1'
});
assert.deepEqual(chatPayload, {
  chatId: 'chat-1'
});
unsubscribeChat();
assert.equal(spindle.count('CHAT_CHANGED'), 0);
assert.equal(adapter.listenerCount(), 0);

let generationEvents = 0;
const unsubscribeMany = adapter.onMany([
  'generationStarted',
  'generationEnded'
], () => {
  generationEvents += 1;
});
spindle.emit('GENERATION_STARTED', {});
spindle.emit('GENERATION_ENDED', {});
assert.equal(generationEvents, 2);
assert.equal(adapter.listenerCount(), 2);
unsubscribeMany();
assert.equal(adapter.listenerCount(), 0);

adapter.on('MESSAGE_SENT', () => {});
adapter.on('MESSAGE_EDITED', () => {});
assert.equal(adapter.listenerCount(), 2);
adapter.disposeAll();
assert.equal(adapter.listenerCount(), 0);

assert.throws(
  () => adapter.on('', () => {}),
  /event name must be a non-empty string/
);
assert.throws(
  () => createLumiverseEventAdapter({ spindle: {} }),
  /spindle\.on/
);

console.log('Lumiverse events adapter tests passed.');
