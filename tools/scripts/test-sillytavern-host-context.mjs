import assert from 'node:assert/strict';

import {
  __sillyTavernHostFactoryTestHooks,
  resolveSillyTavernHostContext,
} from '../../src/hosts/sillytavern/host-factory.mjs';

const bootstrap = { chatId: 'chat.parent' };
const live = { chatId: 'chat.child' };

assert.equal(
  resolveSillyTavernHostContext({ bootstrapContext: bootstrap, currentContext: live }),
  live,
  'the live SillyTavern context must replace the bootstrap snapshot after a chat switch'
);
assert.equal(
  resolveSillyTavernHostContext({ bootstrapContext: bootstrap, currentContext: null }),
  bootstrap,
  'tests and hosts without a global context retain the explicit bootstrap fallback'
);

const callbackMessages = [];
const ui = __sillyTavernHostFactoryTestHooks.createSillyTavernUiAdapter({
  send(message) {
    callbackMessages.push(message);
    message.payload.records[0].title = 'callback mutation';
  },
});
const originalMessage = {
  type: 'directive.gameplayNotifications.publish.v1',
  payload: { records: [{ title: 'Objective complete' }] },
};
ui.send(originalMessage);
assert.equal(callbackMessages.length, 1);
assert.notEqual(callbackMessages[0], originalMessage, 'the UI callback must receive a cloned host message');
assert.equal(originalMessage.payload.records[0].title, 'Objective complete');
assert.equal(
  ui.messages()[0].payload.records[0].title,
  'callback mutation',
  'the UI diagnostics recorder must retain the same callback message'
);

console.log('SillyTavern host context tests passed.');
