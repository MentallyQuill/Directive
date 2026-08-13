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

console.log('Settlement retry dialog tests passed.');
