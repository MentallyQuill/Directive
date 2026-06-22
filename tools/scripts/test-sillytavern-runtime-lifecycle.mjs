import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  clearSillyTavernDirectiveRuntimeBridge,
  getSillyTavernDirectiveRuntimeBridge,
  installDirectiveGenerationInterceptor,
  setSillyTavernDirectiveRuntimeBridge
} from '../../src/hosts/sillytavern/runtime-bridge.mjs';
import { wireEvents } from '../../src/hosts/sillytavern/shell-events.js';
import {
  __directiveRuntimeActionTestHooks,
  registerRuntimeAction
} from '../../src/runtime/runtime-actions.js';

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
assert.equal(manifest.generate_interceptor, 'directiveGenerationInterceptor');

const registered = new Map();
const eventSource = {
  on(name, handler) {
    registered.set(name, handler);
  }
};
const eventTypes = {
  CHAT_CHANGED: 'chat-changed',
  MESSAGE_SENT: 'message-sent',
  USER_MESSAGE_SENT: 'user-message-sent',
  MESSAGE_EDITED: 'message-edited',
  MESSAGE_UPDATED: 'message-updated',
  MESSAGE_DELETED: 'message-deleted',
  MESSAGE_REMOVED: 'message-removed',
  EXTENSION_DISABLED: 'extension-disabled',
  EXTENSION_DISABLE: 'extension-disable'
};
assert.equal(wireEvents({ eventSource, eventTypes }), true);
assert.deepEqual([...registered.keys()].sort(), Object.values(eventTypes).sort());

const calls = [];
const app = {
  async observeHostPlayerMessage(payload) {
    calls.push(['sent', payload]);
    return { handled: true, abortDefaultGeneration: false };
  },
  async handleHostMessageEdited(payload) {
    calls.push(['edited', payload]);
    return { handled: true };
  },
  async handleHostMessageDeleted(payload) {
    calls.push(['deleted', payload]);
    return { handled: true };
  },
  async handleHostChatChanged(payload) {
    calls.push(['chat', payload]);
    return { active: true };
  }
};
let promptClearCount = 0;
const host = {
  prompt: {
    async clear(options) {
      promptClearCount += 1;
      calls.push(['prompt-clear', options]);
      return { ok: true };
    }
  },
  logger: { error() {} }
};
const orchestrator = {
  async interceptGeneration(payload) {
    calls.push(['intercept', payload.type]);
    return { handled: true, abortDefaultGeneration: true };
  }
};

__directiveRuntimeActionTestHooks.clearRuntimeActions();
registerRuntimeAction('runtime.refresh', () => ({ ok: true }));
registerRuntimeAction('runtime.hide', () => ({ ok: true }));
setSillyTavernDirectiveRuntimeBridge({ app, turnOrchestrator: orchestrator, directiveHost: host, active: true });
installDirectiveGenerationInterceptor();
assert.equal(typeof globalThis.directiveGenerationInterceptor, 'function');

await registered.get('message-sent')({ id: 4 });
await registered.get('message-edited')({ id: 4, text: 'edited' });
await registered.get('message-deleted')(4);
await registered.get('chat-changed')({ chatId: 'chat-2' });
const intercepted = await globalThis.directiveGenerationInterceptor([], 4096, () => {}, 'normal');
assert.equal(intercepted.abortDefaultGeneration, true);
assert.deepEqual(calls.slice(0, 4).map((entry) => entry[0]), ['sent', 'edited', 'deleted', 'chat']);
assert.equal(calls.some((entry) => entry[0] === 'intercept'), true);

await registered.get('extension-disabled')();
assert.equal(promptClearCount, 1);
assert.equal(globalThis.directiveGenerationInterceptor, undefined);
assert.equal(getSillyTavernDirectiveRuntimeBridge().enabled, false);

clearSillyTavernDirectiveRuntimeBridge();
__directiveRuntimeActionTestHooks.clearRuntimeActions();

console.log('SillyTavern runtime lifecycle tests passed: manifest interceptor, message/edit/delete/chat events, fail-safe bridge routing, and disable cleanup');
