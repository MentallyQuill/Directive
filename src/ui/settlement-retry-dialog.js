import { bindDirectiveModal } from './modal-lifecycle.js';
import { appendDirectiveModal } from './directive-overlay-root.js';
import { createButton, createElement, setButtonBusy } from './runtime-ui-kit.js';

let activeDialog = null;

function closeDialog(instance, reason = 'closed') {
  if (!instance || activeDialog !== instance) return { closed: false, reason };
  activeDialog = null;
  instance.retryController?.abort?.(new Error(`settlement-retry-${reason}`));
  instance.overlay.remove?.();
  instance.release?.();
  return { closed: true, reason };
}

export function closeSettlementRetryDialog(reason = 'closed') {
  return closeDialog(activeDialog, reason);
}

export function showSettlementRetryDialog({
  reasonCode = 'persistence-failed',
  attempts = 3,
  blockedRoles = [],
  onRetry = null
} = {}) {
  if (activeDialog && !activeDialog.overlay.isConnected) closeDialog(activeDialog, 'removed');
  if (activeDialog) return activeDialog;
  const opener = document.activeElement || null;
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
    : 'Directive could not finish recording this turn. Narration has not begun.';
  if (blockedRoles.includes('director')) {
    message.textContent = blockedRoles.includes('interpreter')
      ? 'Directive could not finish reviewing this turn and preparing story direction. Narration has not begun.'
      : 'Directive could not finish preparing story direction. Narration has not begun.';
  } else if (blockedRoles.includes('interpreter')) {
    message.textContent = 'Directive could not finish reviewing this turn. Narration has not begun.';
  }
  const detail = createElement('p', 'directive-settlement-retry-detail');
  detail.textContent = reasonCode === 'persistence-failed'
    ? 'Retry recording this turn. Closing this dialog keeps narration paused.'
    : 'Retry recording this turn to continue. Closing this dialog keeps narration paused.';
  const status = createElement('p', 'directive-settlement-retry-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const retry = createButton({ label: 'Retry', className: 'campaign-command campaign-command-primary', icon: 'fa-solid fa-rotate-right' });
  retry.dataset.settlementRetryAction = 'retry';
  const close = createButton({ label: 'Close', className: 'campaign-command', icon: 'fa-solid fa-xmark' });
  close.dataset.settlementRetryAction = 'close';
  const actions = createElement('div', 'directive-settlement-retry-actions');
  actions.append(close, retry);
  const instance = {
    overlay,
    dialog,
    retry,
    close,
    status,
    opener,
    retryController: null
  };
  retry.addEventListener('click', async () => {
    if (instance.retryController || retry.dataset.directiveBusy === 'true') return;
    const restore = setButtonBusy(retry, true, { label: 'Retrying...' });
    status.textContent = 'Retrying this turn...';
    const retryController = typeof AbortController === 'function' ? new AbortController() : null;
    instance.retryController = retryController;
    const isActive = () => activeDialog === instance && overlay.isConnected && retryController?.signal?.aborted !== true;
    try {
      const result = await onRetry?.({ signal: retryController?.signal || null, isActive });
      if (!isActive()) return;
      if (result?.ok === true) {
        closeDialog(instance, 'settled');
        return;
      }
      status.textContent = 'Directive still cannot safely record this turn.';
    } catch {
      if (!isActive()) return;
      status.textContent = 'Directive still cannot safely record this turn.';
    } finally {
      restore();
    }
    if (!isActive()) return;
    instance.retryController = null;
    retry.focus?.({ preventScroll: true });
  });
  close.addEventListener('click', () => closeDialog(instance, 'dismissed'));
  dialog.append(title, message, detail, status, actions);
  overlay.appendChild(dialog);
  appendDirectiveModal(overlay);
  instance.release = bindDirectiveModal({ overlay, dialog, opener, initialFocus: retry, onDismiss: reason => closeDialog(instance, reason), dismissOnBackdrop: true,
    onRelease: () => {
      if (activeDialog === instance) activeDialog = null;
      instance.retryController?.abort?.(new Error('settlement-retry-closed'));
    } });
  activeDialog = instance;
  retry.focus?.({ preventScroll: true });
  return instance;
}

export const __settlementRetryDialogTestHooks = Object.freeze({
  active: () => activeDialog
});
