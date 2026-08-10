import { appendDirectiveModal } from './directive-overlay-root.js';
import { createButton, createElement } from './runtime-ui-kit.js';

let activeCreatorAssistSession = null;

export function cancelActiveCreatorAssistSession(reason = 'canceled') {
  const session = activeCreatorAssistSession;
  if (!session) return false;
  activeCreatorAssistSession = null;
  session.cancel?.(reason);
  return true;
}

export function registerActiveCreatorAssistSession(session = {}) {
  cancelActiveCreatorAssistSession('replaced');
  activeCreatorAssistSession = session;
  return () => {
    if (activeCreatorAssistSession === session) activeCreatorAssistSession = null;
  };
}

export function createCharacterCreatorAssistDialog({
  sectionId = '',
  sectionLabel = 'Character',
  mode = 'create',
  opener = null,
  progressMessage = 'Generating with Reasoning...',
  onRequestClose = null
} = {}) {
  const shell = document.getElementById?.('directive-runtime-panel') || null;
  const shellWasInert = shell?.inert === true;
  if (shell) shell.inert = true;

  const overlay = createElement('div', 'directive-creator-assist-dialog-overlay');
  overlay.dataset.creatorAssistModal = sectionId;
  overlay.dataset.creatorAssistState = 'loading';
  const dialog = createElement('section', 'directive-creator-assist-dialog');
  const header = createElement('header', 'directive-creator-assist-dialog-header');
  const title = createElement('h2', 'directive-creator-assist-dialog-title');
  const loadingTitle = mode === 'refine' ? `Refining ${sectionLabel}` : `Drafting ${sectionLabel}`;
  title.textContent = loadingTitle;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', title.textContent);
  const closeControl = createElement('button', 'directive-creator-assist-dialog-close');
  closeControl.type = 'button';
  closeControl.dataset.creatorAssistAction = 'close';
  closeControl.setAttribute('aria-label', 'Close character draft assistant');
  closeControl.textContent = '\u00d7';
  header.append(title, closeControl);

  const progress = createElement('p', 'directive-creator-assist-dialog-progress');
  progress.setAttribute('role', 'status');
  progress.setAttribute('aria-live', 'polite');
  progress.textContent = progressMessage;
  const spinner = createElement('span', 'directive-creator-assist-dialog-spinner');
  spinner.setAttribute('aria-hidden', 'true');
  const loading = createElement('div', 'directive-creator-assist-dialog-loading');
  loading.append(spinner, progress);
  const loadingActions = createElement('div', 'directive-creator-assist-dialog-actions');
  const cancel = createElement('button', 'directive-button directive-creator-assist-dialog-cancel');
  cancel.type = 'button';
  cancel.dataset.creatorAssistAction = 'cancel';
  cancel.textContent = 'Cancel';
  loadingActions.appendChild(cancel);

  const body = createElement('div', 'directive-creator-assist-dialog-body');
  body.append(loading, loadingActions);
  dialog.append(header, body);
  overlay.appendChild(dialog);
  appendDirectiveModal(overlay);
  cancel.focus?.({ preventScroll: true });

  const showProgress = (message) => {
    overlay.dataset.creatorAssistState = 'loading';
    title.textContent = loadingTitle;
    dialog.setAttribute('aria-label', loadingTitle);
    progress.textContent = String(message || 'Generating with Reasoning...');
    body.replaceChildren(loading, loadingActions);
    cancel.focus?.({ preventScroll: true });
  };

  const showResult = ({
    title: resultTitle = 'Suggested Draft',
    source = 'Provider',
    fields = [],
    message = 'Review before applying to this section.',
    onApply = null,
    onRegenerate = null,
    onDismiss = null
  } = {}) => {
    overlay.dataset.creatorAssistState = 'result';
    title.textContent = resultTitle;
    dialog.setAttribute('aria-label', resultTitle);
    const sourceLabel = createElement('p', 'directive-creator-assist-dialog-source');
    sourceLabel.textContent = source;
    const list = createElement('dl', 'directive-creator-assist-dialog-field-list');
    for (const field of fields) {
      const term = createElement('dt', 'directive-creator-assist-dialog-field-label');
      term.textContent = field?.label || '';
      const value = createElement('dd', 'directive-creator-assist-dialog-field-value');
      value.textContent = String(field?.value || '');
      list.append(term, value);
    }
    const note = createElement('p', 'directive-creator-assist-dialog-note');
    note.textContent = message;
    const actions = createElement('div', 'directive-creator-assist-dialog-actions');
    const apply = createButton({ label: 'Apply', icon: 'fa-solid fa-check', onClick: onApply });
    apply.dataset.creatorAssistAction = 'apply';
    const regenerate = createButton({ label: 'Regenerate', icon: 'fa-solid fa-rotate-right', onClick: onRegenerate });
    regenerate.dataset.creatorAssistAction = 'regenerate';
    const dismiss = createButton({ label: 'Dismiss', icon: 'fa-solid fa-xmark', onClick: onDismiss });
    dismiss.dataset.creatorAssistAction = 'dismiss';
    actions.append(apply, regenerate, dismiss);
    body.replaceChildren(sourceLabel, list, note, actions);
    apply.focus?.({ preventScroll: true });
  };

  const showError = ({
    message = 'Section drafting failed.',
    onRetry = null,
    onDismiss = null
  } = {}) => {
    overlay.dataset.creatorAssistState = 'error';
    title.textContent = `${sectionLabel} Draft Unavailable`;
    dialog.setAttribute('aria-label', title.textContent);
    const error = createElement('p', 'directive-creator-assist-dialog-error');
    error.setAttribute('role', 'alert');
    error.textContent = message;
    const actions = createElement('div', 'directive-creator-assist-dialog-actions');
    const retry = createButton({ label: 'Retry', icon: 'fa-solid fa-rotate-right', onClick: onRetry });
    retry.dataset.creatorAssistAction = 'retry';
    const dismiss = createButton({ label: 'Dismiss', icon: 'fa-solid fa-xmark', onClick: onDismiss });
    dismiss.dataset.creatorAssistAction = 'dismiss';
    actions.append(retry, dismiss);
    body.replaceChildren(error, actions);
    retry.focus?.({ preventScroll: true });
  };

  const close = (reason = 'dismissed') => {
    if (!overlay.isConnected) return { closed: false, reason };
    overlay.remove?.();
    if (shell) shell.inert = shellWasInert;
    opener?.focus?.({ preventScroll: true });
    return { closed: true, reason };
  };

  const requestClose = (reason) => {
    onRequestClose?.(reason);
    close(reason);
  };
  closeControl.addEventListener('click', (event) => {
    event?.preventDefault?.();
    requestClose('close-control');
  });
  cancel.addEventListener('click', (event) => {
    event?.preventDefault?.();
    requestClose('cancel');
  });
  dialog.addEventListener('keydown', (event) => {
    if (event?.key === 'Escape') {
      event.preventDefault?.();
      event.stopPropagation?.();
      requestClose('escape');
      return;
    }
    if (event?.key !== 'Tab') return;
    const actions = dialog.querySelectorAll?.('[data-creator-assist-action]') || [];
    const focusable = [...actions].filter((action) => action.disabled !== true && action.hidden !== true);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault?.();
      last.focus?.();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault?.();
      first.focus?.();
    }
  });

  return {
    overlay,
    dialog,
    progress,
    opener,
    close,
    showError,
    showProgress,
    showResult,
    isOpen: () => overlay.isConnected === true
  };
}
