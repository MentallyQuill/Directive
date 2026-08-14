import assert from 'node:assert/strict';

import { installFakeDom } from './helpers/fake-dom.mjs';
import {
  clearSillyTavernDirectiveRuntimeBridge,
  setSillyTavernDirectiveRuntimeBridge
} from '../../src/hosts/sillytavern/runtime-bridge.mjs';

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

assert.equal(installBlankSendContinue({ root: document }), true);
assert.equal(installBlankSendContinue({ root: document }), true, 'installation must be idempotent');
assert.equal(document.listeners.get('click')?.length, 1, 'one capture listener must own blank Send');
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
assert.equal(disposeBlankSendContinue(), false);
clearSillyTavernDirectiveRuntimeBridge();

console.log('PASS SillyTavern blank Send continuation');
