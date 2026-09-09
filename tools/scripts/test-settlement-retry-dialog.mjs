import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fake-dom.mjs';

const document = installFakeDom();
const {
  closeSettlementRetryDialog,
  showSettlementRetryDialog
} = await import('../../src/ui/settlement-retry-dialog.js');

const shell = document.createElement('section');
shell.id = 'directive-runtime-panel';
const opener = document.createElement('button');
document.body.append(shell, opener);
opener.focus();

let releaseRetry;
const retryPromise = new Promise((resolve) => { releaseRetry = resolve; });
const opened = showSettlementRetryDialog({
  reasonCode: 'persistence-failed',
  attempts: 3,
  onRetry: () => retryPromise
});
assert.equal(opened.dialog.getAttribute('role'), 'alertdialog');
assert.equal(opened.dialog.getAttribute('aria-modal'), 'true');
assert.match(opened.dialog.querySelector('.directive-settlement-retry-message').textContent, /after 3 attempts/i);
assert.match(opened.dialog.querySelector('.directive-settlement-retry-message').textContent, /narration has not begun/i);
assert.equal(document.activeElement, opened.retry);
assert.equal(shell.inert, true, 'the underlying Directive shell must be inert while narration recovery is modal');
const click = opened.retry.listeners.get('click')[0]({ preventDefault() {} });
assert.equal(opened.retry.disabled, false, 'busy Retry remains focusable');
assert.equal(opened.retry.getAttribute('aria-busy'), 'true');
assert.equal(document.activeElement, opened.retry, 'pending Retry preserves focus');
opened.retry.focus();
let pendingTabPrevented = 0;
await opened.dialog.dispatch('keydown', {
  key: 'Tab',
  preventDefault() { pendingTabPrevented += 1; }
});
assert.equal(pendingTabPrevented, 1, 'pending Tab must wrap inside the modal');
assert.equal(document.activeElement, opened.close);
let pendingShiftTabPrevented = 0;
await opened.dialog.dispatch('keydown', {
  key: 'Tab', shiftKey: true,
  preventDefault() { pendingShiftTabPrevented += 1; }
});
assert.equal(pendingShiftTabPrevented, 1);
assert.equal(document.activeElement, opened.retry);
assert.match(opened.status.textContent, /retrying/i);
releaseRetry({ ok: true });
await click;
assert.equal(opened.overlay.isConnected, false);
assert.equal(shell.inert, false);
assert.equal(document.activeElement, opener, 'closing narration recovery must restore focus to its opener');
assert.equal(closeSettlementRetryDialog().closed, false);

const replay = showSettlementRetryDialog({
  reasonCode: 'accepted-pair-replay-pending',
  attempts: 0,
  onRetry: async () => ({ ok: false })
});
const replayMessage = replay.dialog.querySelector('.directive-settlement-retry-message').textContent;
assert.doesNotMatch(replayMessage, /after 0 attempts/i);
assert.match(replayMessage, /narration has not begun/i);
const close = document.querySelector('[data-settlement-retry-action="close"]');
assert(close, 'blocked replay must be dismissible without changing story authority');
await close.listeners.get('click')[0]({ preventDefault() {} });
assert.equal(replay.overlay.isConnected, false);
assert.equal(closeSettlementRetryDialog().closed, false);

const backdropReplay = showSettlementRetryDialog({ reasonCode: 'accepted-pair-replay-pending', attempts: 0 });
await backdropReplay.overlay.dispatch('click', { target: backdropReplay.overlay });
assert.equal(backdropReplay.overlay.isConnected, false, 'clicking outside the dialog must release the presentation layer');

const keyboardReplay = showSettlementRetryDialog({ reasonCode: 'accepted-pair-replay-pending', attempts: 0 });
await keyboardReplay.dialog.dispatch('keydown', { key: 'Escape' });
assert.equal(keyboardReplay.overlay.isConnected, false, 'Escape must release the presentation layer');

const trappedReplay = showSettlementRetryDialog({ reasonCode: 'accepted-pair-replay-pending', attempts: 0 });
trappedReplay.retry.focus();
await trappedReplay.dialog.dispatch('keydown', { key: 'Tab' });
assert.equal(document.activeElement, trappedReplay.close, 'Tab must wrap from the final action to the first action');
await trappedReplay.dialog.dispatch('keydown', { key: 'Escape' });

let releasePendingEscape = null;
const pendingEscapePromise = new Promise((resolve) => { releasePendingEscape = resolve; });
const pendingEscapeReplay = showSettlementRetryDialog({
  reasonCode: 'accepted-pair-replay-pending',
  attempts: 0,
  onRetry: () => pendingEscapePromise
});
const pendingEscapeClick = pendingEscapeReplay.retry.listeners.get('click')[0]({ preventDefault() {} });
assert.equal(document.activeElement, pendingEscapeReplay.retry);
await pendingEscapeReplay.dialog.dispatch('keydown', { key: 'Escape' });
assert.equal(pendingEscapeReplay.overlay.isConnected, false, 'Escape must dismiss while Retry is pending');
releasePendingEscape({ ok: true });
await pendingEscapeClick;

for (const [reasonCode, expected] of [
  ['provider_token_limit', /Analysis Capacity/i],
  ['DIRECTIVE_GENERATION_TIMEOUT', /request timeout/i],
]) {
  const failure = showSettlementRetryDialog({ reasonCode, onRetry: async () => ({ ok: false, reasonCode }) });
  assert.match(failure.dialog.querySelector('.directive-settlement-retry-detail').textContent, expected);
  await failure.retry.listeners.get('click')[0]({ preventDefault() {} });
  assert.match(failure.status.textContent, expected);
  closeSettlementRetryDialog();
}
console.log('Settlement retry dialog tests passed.');
