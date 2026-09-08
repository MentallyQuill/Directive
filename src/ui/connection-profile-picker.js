import { bindDirectiveModal } from './modal-lifecycle.js';
import { appendDirectiveModal } from './directive-overlay-root.js';
import { createElement, setButtonBusy } from './runtime-ui-kit.js';

function profileLabel(profile) {
  return String(profile?.name || profile?.label || profile?.id || '').trim();
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
  let busy = false;
  let ownsHistoryEntry = false;
  let closingPromise = null;
  let resolveClosing = null;
  let closingReason = 'dismissed';

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
  resultList.setAttribute('role', 'group');
  resultList.setAttribute('aria-label', 'Connection profiles');
  const error = createElement('p', 'connection-profile-picker-error');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const actions = createElement('footer', 'connection-profile-picker-actions');
  const clearButton = createElement('button', 'connection-profile-picker-clear');
  clearButton.type = 'button';
  clearButton.textContent = 'Clear selection';
  actions.appendChild(clearButton);
  const removePopstateListener = () => {
    if (typeof window !== 'undefined') window.removeEventListener?.('popstate', onPickerPopstate, true);
  };
  const finalizeClose = (reason = 'dismissed') => {
    if (!overlay.isConnected) return { closed: false, reason };
    ownsHistoryEntry = false;
    removePopstateListener();
    overlay.remove?.();
    release();
    const result = { closed: true, reason };
    resolveClosing?.(result);
    resolveClosing = null;
    closingPromise = null;
    return result;
  };
  function onPickerPopstate(event) {
    if (!ownsHistoryEntry || !overlay.isConnected) return;
    event?.stopImmediatePropagation?.();
    event?.stopPropagation?.();
    finalizeClose(closingPromise ? closingReason : 'back');
  }
  const close = (reason = 'dismissed') => {
    if (busy || !overlay.isConnected) return { closed: false, reason };
    if (!ownsHistoryEntry || typeof window === 'undefined' || typeof window.history?.back !== 'function') {
      return finalizeClose(reason);
    }
    if (closingPromise) return closingPromise;
    closingReason = reason;
    closingPromise = new Promise((resolve) => { resolveClosing = resolve; });
    window.history.back();
    return closingPromise;
  };
  const selectProfile = async (profileId, control) => {
    if (busy || !overlay.isConnected) return;
    busy = true;
    const restore = setButtonBusy(control, true);
    error.hidden = true;
    error.textContent = '';
    try {
      await onSelect?.(String(profileId || ''));
      busy = false;
      if (!overlay.isConnected) return;
      await close('selected');
    } catch (cause) {
      busy = false;
      if (!overlay.isConnected) return;
      error.textContent = cause?.message || 'Could not save the connection profile.';
      error.hidden = false;
      searchInput.focus?.({ preventScroll: true });
    } finally {
      restore();
    }
  };
  closeButton.addEventListener('click', () => close('close-control'));
  clearButton.addEventListener('click', () => selectProfile('', clearButton));

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
      if (option.dataset.connectionProfileId === String(selectedId || '')) {
        option.setAttribute('aria-current', 'true');
      }
      const label = createElement('strong', 'connection-profile-picker-option-label');
      label.textContent = profileLabel(profile);
      const details = createElement('span', 'connection-profile-picker-option-details');
      details.textContent = profileDetails(profile);
      option.append(label, details);
      option.addEventListener('click', () => selectProfile(option.dataset.connectionProfileId, option));
      resultList.appendChild(option);
    }
  };
  searchInput.addEventListener('input', renderOptions);
  renderOptions();

  dialog.append(header, searchInput, resultList, error, actions);
  overlay.appendChild(dialog);
  appendDirectiveModal(overlay);
  const release = bindDirectiveModal({ overlay, dialog, opener, initialFocus: searchInput, onDismiss: close, dismissOnBackdrop: true, canDismiss: () => !busy });
  const mobileViewport = typeof window !== 'undefined'
    && (typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 640px)').matches
      : Number(window.innerWidth) <= 640);
  if (mobileViewport && typeof window.history?.pushState === 'function' && typeof window.history?.back === 'function') {
    try {
      window.history.pushState({
        ...(window.history.state || {}),
        directiveConnectionProfilePicker: true
      }, '');
      ownsHistoryEntry = true;
      window.addEventListener?.('popstate', onPickerPopstate, true);
    } catch {
      ownsHistoryEntry = false;
    }
  }
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
