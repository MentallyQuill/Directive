import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fake-dom.mjs';

const fakeDocument = installFakeDom();

const {
  cancelActiveCreatorAssistSession,
  createCharacterCreatorAssistDialog,
  registerActiveCreatorAssistSession
} = await import('../../src/ui/character-creator-assist-dialog.js');

const shell = fakeDocument.createElement('section');
shell.id = 'directive-runtime-panel';
fakeDocument.body.appendChild(shell);
const opener = fakeDocument.createElement('button');
shell.appendChild(opener);
opener.focus();

const assist = createCharacterCreatorAssistDialog({
  sectionId: 'identity',
  sectionLabel: 'Identity',
  mode: 'refine',
  opener,
  progressMessage: 'Generating with Reasoning...'
});

const modalRoot = fakeDocument.getElementById('directive-modal-root');
assert(modalRoot, 'assist should mount through the Directive modal root');
assert.equal(assist.dialog.getAttribute('role'), 'dialog');
assert.equal(assist.dialog.getAttribute('aria-modal'), 'true');
assert.equal(assist.overlay.dataset.creatorAssistModal, 'identity');
assert.equal(assist.progress.textContent, 'Generating with Reasoning...');
assert.equal(assist.progress.getAttribute('aria-live'), 'polite');
assert.equal(shell.inert, true, 'Directive shell should become inert while assist is open');
assert.equal(assist.isOpen(), true);
assert.equal(fakeDocument.activeElement?.dataset?.creatorAssistAction, 'cancel', 'loading state should receive initial focus');

assist.close('dismissed');
assert.equal(assist.isOpen(), false, 'closing should remove the assist overlay');
assert.equal(shell.inert, false, 'closing should restore Directive shell interaction');
assert.equal(fakeDocument.activeElement, opener, 'closing should restore focus to the wand');

const cancellations = [];
registerActiveCreatorAssistSession({ cancel: (reason) => cancellations.push(`first:${reason}`) });
registerActiveCreatorAssistSession({ cancel: (reason) => cancellations.push(`second:${reason}`) });
assert.deepEqual(cancellations, ['first:replaced'], 'registering a new assist should cancel the previous session');
assert.equal(cancelActiveCreatorAssistSession('directive-closed'), true);
assert.deepEqual(cancellations, ['first:replaced', 'second:directive-closed']);
assert.equal(cancelActiveCreatorAssistSession('directive-closed'), false, 'a canceled session must not be canceled twice');

const progressAssist = createCharacterCreatorAssistDialog({
  sectionId: 'service',
  sectionLabel: 'Service',
  mode: 'create',
  opener,
  progressMessage: 'Generating with Reasoning...'
});
progressAssist.showProgress('Reasoning timed out again. Trying Utility...');
assert.equal(progressAssist.progress.textContent, 'Reasoning timed out again. Trying Utility...');
assert.equal(progressAssist.overlay.dataset.creatorAssistState, 'loading');
progressAssist.close();

const resultActions = [];
const resultAssist = createCharacterCreatorAssistDialog({
  sectionId: 'identity',
  sectionLabel: 'Identity',
  mode: 'refine',
  opener
});
resultAssist.showResult({
  title: 'Suggested Refinement',
  source: 'Reasoning provider',
  fields: [
    { label: 'Name', value: 'Sam Vickers' },
    { label: 'Species', value: 'Human' }
  ],
  message: 'Review before applying to this section.',
  onApply: () => resultActions.push('apply'),
  onRegenerate: () => resultActions.push('regenerate'),
  onDismiss: () => resultActions.push('dismiss')
});
assert.equal(resultAssist.overlay.dataset.creatorAssistState, 'result');
assert.equal(resultAssist.dialog.querySelector('.directive-creator-assist-dialog-title').textContent, 'Suggested Refinement');
assert.equal(resultAssist.dialog.getAttribute('aria-label'), 'Suggested Refinement');
assert.equal(resultAssist.dialog.querySelector('.directive-creator-assist-dialog-source').textContent, 'Reasoning provider');
assert.deepEqual(
  resultAssist.dialog.querySelectorAll('.directive-creator-assist-dialog-field-value').map((node) => node.textContent),
  ['Sam Vickers', 'Human']
);
const resultButtons = resultAssist.dialog.querySelector('.directive-creator-assist-dialog-actions').querySelectorAll('[data-creator-assist-action]');
assert.deepEqual(resultButtons.map((button) => button.dataset.creatorAssistAction), ['apply', 'regenerate', 'dismiss']);
assert.equal(fakeDocument.activeElement?.dataset?.creatorAssistAction, 'apply', 'result state should focus Apply');
await resultButtons[0].listeners.get('click')[0]({ preventDefault() {} });
assert.deepEqual(resultActions, ['apply']);
resultAssist.close();

const errorActions = [];
const errorAssist = createCharacterCreatorAssistDialog({ sectionId: 'review', sectionLabel: 'Review', opener });
errorAssist.showError({
  message: 'No usable section draft was returned.',
  onRetry: () => errorActions.push('retry'),
  onDismiss: () => errorActions.push('dismiss')
});
assert.equal(errorAssist.overlay.dataset.creatorAssistState, 'error');
assert.equal(errorAssist.dialog.querySelector('.directive-creator-assist-dialog-error').textContent, 'No usable section draft was returned.');
const errorButtons = errorAssist.dialog.querySelector('.directive-creator-assist-dialog-actions').querySelectorAll('[data-creator-assist-action]');
assert.deepEqual(errorButtons.map((button) => button.dataset.creatorAssistAction), ['retry', 'dismiss']);
await errorButtons[0].listeners.get('click')[0]({ preventDefault() {} });
assert.deepEqual(errorActions, ['retry']);
errorAssist.close();

const closeReasons = [];
const closableAssist = createCharacterCreatorAssistDialog({
  sectionId: 'personality',
  sectionLabel: 'Personality',
  opener,
  onRequestClose: (reason) => closeReasons.push(reason)
});
const closeButton = closableAssist.dialog.querySelector('[data-creator-assist-action="close"]');
assert(closeButton, 'assist dialog should expose a close control');
closeButton.click();
assert.deepEqual(closeReasons, ['close-control']);
assert.equal(closableAssist.isOpen(), false);

const escapeAssist = createCharacterCreatorAssistDialog({
  sectionId: 'personality',
  sectionLabel: 'Personality',
  opener,
  onRequestClose: (reason) => closeReasons.push(reason)
});
escapeAssist.dialog.dispatch('keydown', { key: 'Escape' });
assert.deepEqual(closeReasons, ['close-control', 'escape']);
assert.equal(escapeAssist.isOpen(), false);

const cancelReasons = [];
const cancelAssist = createCharacterCreatorAssistDialog({
  sectionId: 'service',
  sectionLabel: 'Service',
  opener,
  onRequestClose: (reason) => cancelReasons.push(reason)
});
assert(cancelAssist.dialog.querySelector('.directive-creator-assist-dialog-spinner'), 'loading state should show an animated progress indicator');
const cancelButton = cancelAssist.dialog.querySelector('[data-creator-assist-action="cancel"]');
assert(cancelButton, 'loading state should expose a Cancel action');
cancelButton.click();
assert.deepEqual(cancelReasons, ['cancel']);
assert.equal(cancelAssist.isOpen(), false);

const trappedAssist = createCharacterCreatorAssistDialog({ sectionId: 'identity', sectionLabel: 'Identity', opener });
trappedAssist.showResult({
  title: 'Suggested Draft',
  source: 'Local fallback',
  fields: [{ label: 'Name', value: 'Ari Venn' }]
});
const trappedActions = trappedAssist.dialog.querySelectorAll('[data-creator-assist-action]');
const trappedClose = trappedActions.find((button) => button.dataset.creatorAssistAction === 'close');
const trappedDismiss = trappedActions.find((button) => button.dataset.creatorAssistAction === 'dismiss');
trappedDismiss.focus();
trappedAssist.dialog.dispatch('keydown', { key: 'Tab', shiftKey: false });
assert.equal(fakeDocument.activeElement, trappedClose, 'Tab should wrap from the last modal action to the first');
trappedClose.focus();
trappedAssist.dialog.dispatch('keydown', { key: 'Tab', shiftKey: true });
assert.equal(fakeDocument.activeElement, trappedDismiss, 'Shift+Tab should wrap from the first modal action to the last');
trappedAssist.showProgress('Generating another draft...');
assert.equal(fakeDocument.activeElement?.dataset?.creatorAssistAction, 'cancel', 'regeneration should move focus into the loading state');
trappedAssist.close();

console.log('Character Creator assist dialog tests passed.');
