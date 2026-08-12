import assert from 'node:assert/strict';
import { createFakeEventAdapter } from '../../src/hosts/fake/fake-host.mjs';
import {
  __directiveEventTestHooks,
  disposeSillyTavernDirectiveEventLifecycle,
  wireEvents
} from '../../src/hosts/sillytavern/shell-events.js';
import {
  clearSillyTavernDirectiveRuntimeBridge,
  setSillyTavernDirectiveRuntimeBridge
} from '../../src/hosts/sillytavern/runtime-bridge.mjs';
import { __directiveRuntimeActionTestHooks, registerRuntimeAction } from '../../src/runtime/runtime-actions.js';

const eventSource = createFakeEventAdapter();
const eventTypes = {
  CHAT_CHANGED: 'chat',
  MESSAGE_SENT: 'sent',
  MESSAGE_EDITED: 'edited',
  MESSAGE_SWIPED: 'swiped',
  MESSAGE_DELETED: 'deleted',
  GENERATION_STOPPED: 'stopped',
  EXTENSION_DISABLED: 'disabled'
};
assert.equal(wireEvents({ eventSource, eventTypes }), true);
for (const event of Object.values(eventTypes)) assert.equal(eventSource.listenerCount(event), 1);
assert.equal(eventSource.listenerCount('MESSAGE_UPDATED'), 0);
disposeSillyTavernDirectiveEventLifecycle();
for (const event of Object.values(eventTypes)) assert.equal(eventSource.listenerCount(event), 0);

const row = { getAttribute: () => '42' };
const deleteButton = { closest: (selector) => selector === '.mes[mesid]' ? row : null };
__directiveEventTestHooks.captureDeleteIntent({
  target: { closest: (selector) => selector === '.mes_edit_delete' ? deleteButton : null }
});
assert.equal(__directiveEventTestHooks.payloadWithDeleteIntent({}).hostMessageId, '42');

let branchPayload = null;
let currentBranchChatId = 'chat.parent';
setSillyTavernDirectiveRuntimeBridge({
  app: {
    async handleHostChatChanged(payload) {
      branchPayload = payload;
      return {};
    }
  },
  directiveHost: { chat: { getCurrentChatId: () => currentBranchChatId } }
});
const branchRow = { getAttribute: () => '17' };
const branchButton = { closest: (selector) => selector === '.mes[mesid]' ? branchRow : null };
__directiveEventTestHooks.captureNativeBranchIntent({
  target: { closest: (selector) => selector === '.mes_create_branch' ? branchButton : null }
});
currentBranchChatId = 'chat.child';
registerRuntimeAction('runtime.refresh', () => ({ refreshed: true }));
await __directiveEventTestHooks.handleChatChanged({ chatId: 'chat.child' });
assert.equal(branchPayload.nativeBranchIntent.kind, 'directive.nativeBranchIntent.v1');
assert.equal(branchPayload.nativeBranchIntent.parentChatId, 'chat.parent');
assert.equal(branchPayload.nativeBranchIntent.endpointHostMessageId, '17');
assert.equal(typeof branchPayload.nativeBranchIntent.capturedAt, 'number');
clearSillyTavernDirectiveRuntimeBridge();
__directiveRuntimeActionTestHooks.clearRuntimeActions();

let restoreCount = 0;
setSillyTavernDirectiveRuntimeBridge({
  app: { async clearDirectivePrompt() {} },
  directiveHost: {
    presets: {
      async restoreNarrationPreset() {
        restoreCount += 1;
      }
    }
  }
});
await __directiveEventTestHooks.handleExtensionDisabled();
assert.equal(restoreCount, 1, 'extension disable must restore the preset selected before campaign play');
clearSillyTavernDirectiveRuntimeBridge();

let renamed = null;
const branchUiSequence = [];
const previousPrompt = globalThis.prompt;
globalThis.prompt = (label, value) => {
  branchUiSequence.push('prompt');
  assert.match(label, /Name Previous Timeline/);
  assert.equal(value, 'Prelude — Stardate 53068.4');
  return 'Before Whitaker';
};
setSillyTavernDirectiveRuntimeBridge({
  app: {
    async handleHostChatChanged() {
      return {
        timelineFork: {
          status: 'activated',
          savedGameId: 'checkpoint.1',
          suggestedName: 'Prelude — Stardate 53068.4'
        }
      };
    },
    async renameSavedGame(options) { renamed = options; }
  }
});
registerRuntimeAction('runtime.refresh', () => {
  branchUiSequence.push('refresh');
  return { refreshed: true };
});
await __directiveEventTestHooks.handleChatChanged();
assert.deepEqual(branchUiSequence, ['refresh', 'prompt', 'refresh'], 'refresh must finish before the naming dialog opens');
assert.deepEqual(renamed, { savedGameId: 'checkpoint.1', name: 'Before Whitaker' });
globalThis.prompt = previousPrompt;
clearSillyTavernDirectiveRuntimeBridge();
__directiveRuntimeActionTestHooks.clearRuntimeActions();

console.log('PASS V1 SillyTavern event wiring');
