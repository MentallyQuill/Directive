import { appendDirectiveModal } from './directive-overlay-root.js';
import { createElement } from './runtime-ui-kit.js';

function profileLabel(profile) {
  return String(profile?.label || profile?.name || profile?.id || '').trim();
}

function profileDetails(profile) {
  return [profile?.model, profile?.id]
    .map((value) => String(value || '').trim())
    .filter((value, index, values) => value && values.indexOf(value) === index)
    .join(' / ');
}

function profileSearchText(profile) {
  return [profile?.label, profile?.name, profile?.model, profile?.id]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
    .join('\n');
}

export function createConnectionProfilePicker({ profiles = [], selectedId = '', opener = null, onSelect = null } = {}) {
  const shell = document.getElementById?.('directive-runtime-panel') || null;
  const shellWasInert = shell?.inert === true;
  if (shell) shell.inert = true;
  let busy = false;

  const overlay = createElement('div', 'connection-profile-picker-overlay');
  const dialog = createElement('section', 'connection-profile-picker-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'connection-profile-picker-title');

  const header = createElement('header', 'connection-profile-picker-header');
  const title = createElement('h2', 'connection-profile-picker-title');
  title.id = 'connection-profile-picker-title';
  title.textContent = 'Choose Connection Profile';
  const closeButton = createElement('button', 'connection-profile-picker-close');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Close connection profile picker');
  closeButton.textContent = '\u00d7';
  header.append(title, closeButton);
  const searchInput = createElement('input', 'connection-profile-picker-search');
  searchInput.type = 'search';
  searchInput.setAttribute('aria-label', 'Search connection profiles');

  const resultList = createElement('div', 'connection-profile-picker-results');
  resultList.dataset.directiveScrollOwner = 'true';
  resultList.setAttribute('role', 'list');
  const error = createElement('p', 'connection-profile-picker-error');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const actions = createElement('footer', 'connection-profile-picker-actions');
  const clearButton = createElement('button', 'connection-profile-picker-clear');
  clearButton.type = 'button';
  clearButton.textContent = 'Clear selection';
  actions.appendChild(clearButton);
  const close = (reason = 'dismissed') => {
    if (busy || !overlay.isConnected) return { closed: false, reason };
    overlay.remove?.();
    if (shell) shell.inert = shellWasInert;
    opener?.focus?.({ preventScroll: true });
    return { closed: true, reason };
  };
  const selectProfile = async (profileId) => {
    if (busy) return;
    busy = true;
    error.hidden = true;
    error.textContent = '';
    try {
      await onSelect?.(String(profileId || ''));
      busy = false;
      close('selected');
    } catch (cause) {
      busy = false;
      error.textContent = cause?.message || 'Could not save the connection profile.';
      error.hidden = false;
      searchInput.focus?.({ preventScroll: true });
    }
  };
  closeButton.addEventListener('click', () => close('close-control'));
  clearButton.addEventListener('click', () => selectProfile(''));
  dialog.addEventListener('keydown', (event) => {
    if (event?.key !== 'Escape') return;
    event.preventDefault?.();
    event.stopPropagation?.();
    close('escape');
  });
  dialog.addEventListener('cancel', (event) => {
    event?.preventDefault?.();
    close('cancel');
  });
  overlay.addEventListener('click', (event) => {
    if (event?.target === overlay) close('backdrop');
  });
  const renderOptions = () => {
    const query = String(searchInput.value || '').trim().toLowerCase();
    const matches = profiles.filter((entry) => !query || profileSearchText(entry).includes(query));
    resultList.replaceChildren();
    if (!matches.length) {
      const empty = createElement('p', 'connection-profile-picker-empty');
      empty.setAttribute('role', 'status');
      empty.textContent = profiles.length
        ? 'No matching profiles.'
        : 'No supported chat or text connection profiles are available.';
      resultList.appendChild(empty);
      return;
    }
    for (const profile of matches) {
      const option = createElement('button', 'connection-profile-picker-option');
      option.type = 'button';
      option.dataset.connectionProfileId = String(profile?.id || '');
      option.setAttribute('role', 'listitem');
      if (option.dataset.connectionProfileId === String(selectedId || '')) {
        option.setAttribute('aria-current', 'true');
      }
      const label = createElement('strong', 'connection-profile-picker-option-label');
      label.textContent = profileLabel(profile);
      const details = createElement('span', 'connection-profile-picker-option-details');
      details.textContent = profileDetails(profile);
      option.append(label, details);
      option.addEventListener('click', () => selectProfile(option.dataset.connectionProfileId));
      resultList.appendChild(option);
    }
  };
  searchInput.addEventListener('input', renderOptions);
  renderOptions();

  dialog.append(header, searchInput, resultList, error, actions);
  overlay.appendChild(dialog);
  appendDirectiveModal(overlay);
  searchInput.focus?.({ preventScroll: true });

  return {
    overlay,
    dialog,
    searchInput,
    resultList,
    closeButton,
    clearButton,
    error,
    close,
    isOpen: () => overlay.isConnected === true
  };
}
