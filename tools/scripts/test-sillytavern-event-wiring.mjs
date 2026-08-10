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

console.log('PASS V1 SillyTavern event wiring');
