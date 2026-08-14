import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fake-dom.mjs';

const document = installFakeDom();
const {
  closeSettlementRetryDialog,
  showSettlementRetryDialog
} = await import('../../src/ui/settlement-retry-dialog.js');

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
const click = opened.retry.listeners.get('click')[0]({ preventDefault() {} });
assert.equal(opened.retry.disabled, true);
assert.match(opened.status.textContent, /retrying/i);
releaseRetry({ ok: true });
await click;
assert.equal(opened.overlay.isConnected, false);
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
await Promise.all((document.listeners.get('keydown') || []).map((listener) => listener({
  key: 'Escape',
  preventDefault() {}
})));
assert.equal(keyboardReplay.overlay.isConnected, false, 'Escape must release the presentation layer');

console.log('Settlement retry dialog tests passed.');
