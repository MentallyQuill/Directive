import { appendDirectiveModal } from './directive-overlay-root.js';
import { createButton, createElement } from './runtime-ui-kit.js';

let activeDialog = null;

export function closeSettlementRetryDialog(reason = 'closed') {
  if (!activeDialog) return { closed: false, reason };
  const dialog = activeDialog;
  activeDialog = null;
  document.removeEventListener?.('keydown', dialog.onKeyDown);
  dialog.overlay.remove?.();
  return { closed: true, reason };
}

export function showSettlementRetryDialog({
  reasonCode = 'persistence-failed',
  attempts = 3,
  onRetry = null
} = {}) {
  if (activeDialog) return activeDialog;
  const overlay = createElement('div', 'directive-settlement-retry-overlay');
  const dialog = createElement('section', 'directive-settlement-retry-dialog');
  dialog.setAttribute('role', 'alertdialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'Directive could not safely record this turn');
  const title = createElement('h2', 'directive-settlement-retry-title');
  title.textContent = 'Narration Paused';
  const message = createElement('p', 'directive-settlement-retry-message');
  message.setAttribute('role', 'alert');
  message.textContent = reasonCode === 'persistence-failed'
    ? `Directive could not safely record this turn after ${attempts} attempts. Narration has not begun.`
    : 'Directive could not reconcile accepted story state. Narration has not begun.';
  const detail = createElement('p', 'directive-settlement-retry-detail');
  detail.textContent = reasonCode === 'persistence-failed'
    ? 'Check that the active save is writable, then retry.'
    : 'The accepted story state must be reconciled before narration can continue.';
  const status = createElement('p', 'directive-settlement-retry-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const retry = createButton({ label: 'Retry', icon: 'fa-solid fa-rotate-right' });
  retry.dataset.settlementRetryAction = 'retry';
  retry.addEventListener('click', async () => {
    if (retry.disabled) return;
    retry.disabled = true;
    status.textContent = 'Retrying accepted story settlement...';
    try {
      const result = await onRetry?.();
      if (result?.ok === true) {
        closeSettlementRetryDialog('settled');
        return;
      }
      status.textContent = 'Directive still cannot safely record this turn.';
    } catch {
      status.textContent = 'Directive still cannot safely record this turn.';
    }
    retry.disabled = false;
    retry.focus?.({ preventScroll: true });
  });
  const close = createButton({ label: 'Close', icon: 'fa-solid fa-xmark' });
  close.dataset.settlementRetryAction = 'close';
  close.addEventListener('click', () => closeSettlementRetryDialog('dismissed'));
  const actions = createElement('div', 'directive-settlement-retry-actions');
  actions.append(retry, close);
  const onKeyDown = (event) => {
    if (event?.key !== 'Escape') return;
    event.preventDefault?.();
    closeSettlementRetryDialog('escape');
  };
  overlay.addEventListener('click', (event) => {
    if (event?.target === overlay) closeSettlementRetryDialog('backdrop');
  });
  document.addEventListener?.('keydown', onKeyDown);
  dialog.append(title, message, detail, status, actions);
  overlay.appendChild(dialog);
  appendDirectiveModal(overlay);
  retry.focus?.({ preventScroll: true });
  activeDialog = { overlay, dialog, retry, close, status, onKeyDown };
  return activeDialog;
}

export const __settlementRetryDialogTestHooks = Object.freeze({
  active: () => activeDialog
});
