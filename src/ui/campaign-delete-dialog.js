import { appendDirectiveModal } from './directive-overlay-root.js';
import { createElement } from './runtime-ui-kit.js';

function normalizedConfirmation(value) {
  return String(value || '').trim().toLowerCase() === 'delete';
}

export function createCampaignDeleteDialog({
  campaign,
  opener = null,
  onDelete = null
} = {}) {
  const shell = document.getElementById?.('directive-runtime-panel') || null;
  const shellWasInert = shell?.inert === true;
  if (shell) shell.inert = true;
  let busy = false;

  const overlay = createElement('div', 'campaign-delete-dialog-overlay');
  overlay.dataset.campaignDeleteModal = String(campaign?.id || 'campaign');
  overlay.dataset.campaignDeleteState = 'confirming';
  const dialog = createElement('section', 'campaign-delete-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'campaign-delete-dialog-title');

  const header = createElement('header', 'campaign-delete-dialog-header');
  const title = createElement('h2', 'campaign-delete-dialog-title');
  title.id = 'campaign-delete-dialog-title';
  title.textContent = 'Delete campaign?';
  const closeButton = createElement('button', 'campaign-delete-dialog-close');
  closeButton.type = 'button';
  closeButton.dataset.campaignDeleteAction = 'close';
  closeButton.setAttribute('aria-label', 'Close campaign deletion confirmation');
  closeButton.textContent = '\u00d7';
  header.append(title, closeButton);

  const body = createElement('div', 'campaign-delete-dialog-body');
  body.dataset.directiveScrollOwner = 'true';
  const warning = createElement('p', 'campaign-delete-dialog-warning');
  warning.textContent = `This will permanently delete the SillyTavern character card named "${campaign?.characterName || ''}" along with all of its chats.`;
  const instruction = createElement('p', 'campaign-delete-dialog-instruction');
  instruction.textContent = 'Type delete to confirm.';
  const field = createElement('label', 'campaign-delete-dialog-field');
  field.setAttribute('for', 'campaign-delete-confirmation');
  const fieldLabel = createElement('span', 'campaign-delete-dialog-label');
  fieldLabel.textContent = 'Confirmation';
  const input = createElement('input', 'campaign-delete-dialog-input');
  input.id = 'campaign-delete-confirmation';
  input.type = 'text';
  input.autocomplete = 'off';
  input.autocapitalize = 'none';
  input.spellcheck = false;
  field.append(fieldLabel, input);
  const error = createElement('p', 'campaign-delete-dialog-error');
  error.setAttribute('role', 'alert');
  error.setAttribute('aria-live', 'assertive');
  error.hidden = true;

  const actions = createElement('div', 'campaign-delete-dialog-actions');
  const cancelButton = createElement('button', 'campaign-command');
  cancelButton.type = 'button';
  cancelButton.dataset.campaignDeleteAction = 'cancel';
  cancelButton.textContent = 'Cancel';
  const deleteButton = createElement('button', 'campaign-command campaign-command-danger campaign-delete-confirm');
  deleteButton.type = 'button';
  deleteButton.dataset.campaignDeleteAction = 'delete';
  deleteButton.textContent = 'Delete';
  deleteButton.disabled = true;
  actions.append(cancelButton, deleteButton);
  body.append(warning, instruction, field, error, actions);
  dialog.append(header, body);
  overlay.appendChild(dialog);
  appendDirectiveModal(overlay);

  const setControlsDisabled = (disabled) => {
    input.disabled = disabled;
    cancelButton.disabled = disabled;
    closeButton.disabled = disabled;
    deleteButton.disabled = disabled || !normalizedConfirmation(input.value);
  };

  const close = (reason = 'dismissed') => {
    if (busy || !overlay.isConnected) return { closed: false, reason };
    overlay.remove?.();
    if (shell) shell.inert = shellWasInert;
    opener?.focus?.({ preventScroll: true });
    return { closed: true, reason };
  };

  const requestClose = (reason) => {
    if (!busy) close(reason);
  };

  input.addEventListener('input', () => {
    deleteButton.disabled = busy || !normalizedConfirmation(input.value);
  });
  closeButton.addEventListener('click', (event) => {
    event?.preventDefault?.();
    requestClose('close-control');
  });
  cancelButton.addEventListener('click', (event) => {
    event?.preventDefault?.();
    requestClose('cancel');
  });
  deleteButton.addEventListener('click', async (event) => {
    event?.preventDefault?.();
    if (busy || !normalizedConfirmation(input.value)) return;
    busy = true;
    overlay.dataset.campaignDeleteState = 'deleting';
    error.hidden = true;
    error.textContent = '';
    deleteButton.textContent = 'Deleting...';
    setControlsDisabled(true);
    try {
      await onDelete?.({ campaignId: campaign?.id, saveId: campaign?.activeTimeline?.saveId || null });
      busy = false;
      close('deleted');
    } catch (cause) {
      busy = false;
      overlay.dataset.campaignDeleteState = 'error';
      error.textContent = cause?.message || String(cause || 'Campaign deletion failed.');
      error.hidden = false;
      deleteButton.textContent = 'Delete';
      setControlsDisabled(false);
      input.focus?.({ preventScroll: true });
    }
  });
  dialog.addEventListener('keydown', (event) => {
    if (event?.key === 'Escape') {
      event.preventDefault?.();
      event.stopPropagation?.();
      requestClose('escape');
      return;
    }
    if (event?.key !== 'Tab') return;
    const candidates = [...(dialog.querySelectorAll?.('[data-campaign-delete-action]') || [])]
      .filter((candidate) => candidate.disabled !== true && candidate.hidden !== true);
    const focusable = [input, ...candidates].filter((candidate) => candidate.disabled !== true);
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

  input.focus?.({ preventScroll: true });
  return {
    overlay,
    dialog,
    input,
    error,
    cancelButton,
    deleteButton,
    close,
    isOpen: () => overlay.isConnected === true
  };
}
