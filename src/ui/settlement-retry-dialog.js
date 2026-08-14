import { appendDirectiveModal } from './directive-overlay-root.js';
import { createButton, createElement } from './runtime-ui-kit.js';

let activeDialog = null;

function closeDialog(instance, reason = 'closed') {
  if (!instance || activeDialog !== instance) return { closed: false, reason };
  activeDialog = null;
  instance.retryController?.abort?.(new Error(`settlement-retry-${reason}`));
  instance.overlay.remove?.();
  if (instance.shell) instance.shell.inert = instance.shellWasInert;
  instance.opener?.focus?.({ preventScroll: true });
  return { closed: true, reason };
}

export function closeSettlementRetryDialog(reason = 'closed') {
  return closeDialog(activeDialog, reason);
}

export function showSettlementRetryDialog({
  reasonCode = 'persistence-failed',
  attempts = 3,
  onRetry = null
} = {}) {
  if (activeDialog) return activeDialog;
  const opener = document.activeElement || null;
  const shell = document.getElementById?.('directive-runtime-panel') || null;
  const shellWasInert = shell?.inert === true;
  if (shell) shell.inert = true;
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
  const close = createButton({ label: 'Close', icon: 'fa-solid fa-xmark' });
  close.dataset.settlementRetryAction = 'close';
  const actions = createElement('div', 'directive-settlement-retry-actions');
  actions.append(retry, close);
  const instance = {
    overlay,
    dialog,
    retry,
    close,
    status,
    opener,
    shell,
    shellWasInert,
    retryController: null
  };
  retry.addEventListener('click', async () => {
    if (retry.disabled) return;
    retry.disabled = true;
    close.focus?.({ preventScroll: true });
    status.textContent = 'Retrying accepted story settlement...';
    const retryController = typeof AbortController === 'function' ? new AbortController() : null;
    instance.retryController = retryController;
    const isActive = () => activeDialog === instance && retryController?.signal?.aborted !== true;
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
    }
    if (!isActive()) return;
    retry.disabled = false;
    retry.focus?.({ preventScroll: true });
  });
  close.addEventListener('click', () => closeDialog(instance, 'dismissed'));
  overlay.addEventListener('click', (event) => {
    if (event?.target === overlay) closeDialog(instance, 'backdrop');
  });
  dialog.addEventListener('keydown', (event) => {
    if (event?.key === 'Escape') {
      event.preventDefault?.();
      event.stopPropagation?.();
      closeDialog(instance, 'escape');
      return;
    }
    if (event?.key !== 'Tab') return;
    const focusable = [retry, close].filter((control) => control.disabled !== true && control.hidden !== true);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault?.();
      last?.focus?.();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault?.();
      first?.focus?.();
    }
  });
  dialog.append(title, message, detail, status, actions);
  overlay.appendChild(dialog);
  appendDirectiveModal(overlay);
  activeDialog = instance;
  retry.focus?.({ preventScroll: true });
  return instance;
}

export const __settlementRetryDialogTestHooks = Object.freeze({
  active: () => activeDialog
});
