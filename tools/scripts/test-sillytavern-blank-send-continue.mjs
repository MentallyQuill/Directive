import assert from 'node:assert/strict';

import { installFakeDom } from './helpers/fake-dom.mjs';
import { createFakeEventAdapter } from '../../src/hosts/fake/fake-host.mjs';
import { activateSillyTavernDirectiveRuntime } from '../../src/hosts/sillytavern/runtime-activation.mjs';
import {
  clearSillyTavernDirectiveRuntimeBridge,
  setSillyTavernDirectiveRuntimeBridge
} from '../../src/hosts/sillytavern/runtime-bridge.mjs';
import { handleExtensionDisabled } from '../../src/hosts/sillytavern/shell-events.js';

let blankSendModule = null;
try {
  blankSendModule = await import('../../src/hosts/sillytavern/blank-send-continue.js');
} catch {}

assert(blankSendModule, 'the SillyTavern blank Send continuation module must exist');

const {
  disposeBlankSendContinue,
  installBlankSendContinue
} = blankSendModule;

const document = installFakeDom();
const sendButton = document.createElement('button');
sendButton.id = 'send_but';
const sendIcon = document.createElement('i');
sendButton.appendChild(sendIcon);
const textarea = document.createElement('textarea');
textarea.id = 'send_textarea';
const fileInput = document.createElement('input');
fileInput.id = 'file_form_input';
fileInput.files = [];
const explicitContinue = document.createElement('button');
explicitContinue.id = 'option_continue';
const unrelatedButton = document.createElement('button');
unrelatedButton.id = 'unrelated';
document.body.append(sendButton, textarea, fileInput, explicitContinue, unrelatedButton);

const inputEvents = [];
textarea.dispatchEvent = (event) => {
  inputEvents.push(event);
  return true;
};

let bound = true;
setSillyTavernDirectiveRuntimeBridge({
  app: { isCurrentChatBound: () => bound },
  active: true
});

const addListenerCalls = [];
const removeListenerCalls = [];
const addEventListener = document.addEventListener.bind(document);
const removeEventListener = document.removeEventListener.bind(document);
document.addEventListener = (type, handler, options) => {
  addListenerCalls.push({ type, handler, options });
  addEventListener(type, handler, options);
};
document.removeEventListener = (type, handler, options) => {
  removeListenerCalls.push({ type, handler, options });
  removeEventListener(type, handler, options);
};

assert.equal(installBlankSendContinue({ root: document }), true);
assert.equal(installBlankSendContinue({ root: document }), true, 'installation must be idempotent');
assert.equal(document.listeners.get('click')?.length, 1, 'one capture listener must own blank Send');
assert.equal(addListenerCalls[0]?.options, true, 'blank Send must normalize in the capture phase');
const clickHandler = document.listeners.get('click')[0];

textarea.value = '';
assert.equal(clickHandler({ target: sendIcon }), true);
assert.equal(textarea.value, 'Continue.');
assert.equal(inputEvents.length, 1);
assert.equal(inputEvents[0].type, 'input');
assert.equal(inputEvents[0].bubbles, true);

textarea.value = '  \n\t ';
assert.equal(clickHandler({ target: sendButton }), true);
assert.equal(textarea.value, 'Continue.', 'whitespace-only input must normalize');
assert.equal(inputEvents.length, 2);

textarea.value = 'Hold position.';
assert.equal(clickHandler({ target: sendButton }), false);
assert.equal(textarea.value, 'Hold position.');
assert.equal(inputEvents.length, 2);

textarea.value = '';
fileInput.files = [{ name: 'orders.txt' }];
assert.equal(clickHandler({ target: sendButton }), false);
assert.equal(textarea.value, '', 'an attachment is a real player submission');
fileInput.files = [];

fileInput.remove();
assert.equal(clickHandler({ target: sendButton }), false);
assert.equal(textarea.value, '', 'missing attachment state must fail open');
document.body.appendChild(fileInput);

bound = false;
assert.equal(clickHandler({ target: sendButton }), false);
assert.equal(textarea.value, '', 'unbound chats must retain native blank Send behavior');
bound = true;

setSillyTavernDirectiveRuntimeBridge({
  app: { isCurrentChatBound: () => true },
  active: false
});
assert.equal(clickHandler({ target: sendButton }), false);
assert.equal(textarea.value, '', 'disabled Directive sessions must retain native behavior');

setSillyTavernDirectiveRuntimeBridge({
  app: { isCurrentChatBound: () => true },
  active: true
});
assert.equal(clickHandler({ target: explicitContinue }), false);
assert.equal(clickHandler({ target: unrelatedButton }), false);
assert.equal(textarea.value, '', 'only the Send control may synthesize Continue');

assert.equal(disposeBlankSendContinue(), true);
assert.equal(document.listeners.get('click')?.length, 0, 'disposal must remove the capture listener');
assert.equal(removeListenerCalls.at(-1)?.options, true, 'disposal must match the capture listener');
assert.equal(disposeBlankSendContinue(), false);

setSillyTavernDirectiveRuntimeBridge({
  app: {
    isCurrentChatBound: () => true,
    async clearDirectivePrompt() {}
  },
  active: true
});
await activateSillyTavernDirectiveRuntime({
  context: {
    document,
    eventSource: createFakeEventAdapter(),
    eventTypes: {}
  }
});
assert.equal(
  addListenerCalls.some((call) => call.type === 'click' && call.options === true),
  true,
  'runtime activation must install the capture listener'
);
assert.equal(document.listeners.get('click')?.length, 2, 'activation must install blank Send beside branch capture');
await handleExtensionDisabled();
assert.equal(document.listeners.get('click')?.length, 0, 'extension disable must dispose blank Send and branch capture');

clearSillyTavernDirectiveRuntimeBridge();

console.log('PASS SillyTavern blank Send continuation');
