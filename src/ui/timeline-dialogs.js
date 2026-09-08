import { bindDirectiveModal } from './modal-lifecycle.js';
import { appendDirectiveModal } from './directive-overlay-root.js';
import { appendEmpty, createElement, setButtonBusy } from './runtime-ui-kit.js';
import { formatStardate } from '../time/ship-time.mjs';

let dialogSequence = 0;

function compact(value) {
  return String(value ?? '').trim();
}

function formatDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : '';
}

function savedGameMeta(savedGame = {}) {
  const stardate = formatStardate(savedGame.stardate);
  return [savedGame.chapter, stardate ? `Stardate ${stardate}` : savedGame.stardate, formatDate(savedGame.createdAt)]
    .filter(Boolean)
    .join(' / ');
}

function createDialogFrame({ title, className, opener = null } = {}) {
  const overlay = createElement('div', `timeline-dialog-overlay ${className || ''}`.trim());
  const dialog = createElement('section', 'timeline-dialog');
  const titleId = `directive-timeline-dialog-title-${++dialogSequence}`;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', titleId);
  const heading = createElement('h2', 'timeline-dialog-title');
  heading.id = titleId;
  heading.textContent = title;
  dialog.appendChild(heading);
  overlay.appendChild(dialog);
  appendDirectiveModal(overlay);
  let closed = false;
  const close = (reason = 'dismissed') => {
    if (closed) return { closed: false, reason };
    closed = true;
    overlay.remove?.();
    release();
    return { closed: true, reason };
  };
  const release = bindDirectiveModal({ overlay, dialog, opener, onDismiss: close });
  return { overlay, dialog, close, isOpen: () => !closed && overlay.isConnected };
}

function appendDialogActions(dialog, { primaryLabel, primaryDisabled = false, onPrimary, close }) {
  const actions = createElement('div', 'timeline-dialog-actions');
  const cancel = createElement('button', 'campaign-command');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  const primary = createElement('button', 'campaign-command campaign-command-primary');
  primary.type = 'button';
  primary.textContent = primaryLabel;
  primary.disabled = primaryDisabled;
  cancel.addEventListener('click', () => close('cancel'));
  primary.addEventListener('click', onPrimary);
  actions.append(cancel, primary);
  dialog.appendChild(actions);
  return { actions, cancel, primary };
}

export function createSaveGameDialog({ campaign, opener = null, onSave = null, onSaved = null } = {}) {
  const frame = createDialogFrame({ title: 'Save Game', className: 'save-game-dialog-overlay', opener });
  const explanation = createElement('p', 'timeline-dialog-copy');
  explanation.textContent = 'Save a snapshot without leaving your current timeline.';
  const label = createElement('label', 'timeline-dialog-field');
  const labelText = createElement('span');
  labelText.textContent = 'Save name';
  const input = createElement('input', 'timeline-dialog-input');
  input.type = 'text';
  input.value = campaign?.chapter ? `Before ${campaign.chapter}` : 'Saved Game';
  label.append(labelText, input);
  const error = createElement('p', 'timeline-dialog-error');
  error.setAttribute('role', 'alert');
  error.setAttribute('aria-live', 'assertive');
  error.hidden = true;
  frame.dialog.append(explanation, label, error);
  let busy = false;
  const controls = appendDialogActions(frame.dialog, {
    primaryLabel: 'Save Game',
    close: frame.close,
    onPrimary: async () => {
      const name = compact(input.value);
      if (!name || busy) return;
      busy = true;
      error.hidden = true;
      error.textContent = '';
      const restore = setButtonBusy(controls.primary, true, { label: 'Saving...' });
      controls.cancel.textContent = 'Close';
      let result;
      try {
        result = await onSave?.({ name });
      } catch (cause) {
        if (!frame.isOpen()) return;
        error.textContent = cause?.message || 'Could not save this game. Try again.';
        error.hidden = false;
        return;
      } finally {
        busy = false;
        restore();
        controls.cancel.textContent = 'Cancel';
        controls.primary.disabled = !compact(input.value);
      }
      if (!frame.isOpen()) return;
      frame.close('saved');
      await onSaved?.(result);
    }
  });
  input.addEventListener('input', () => { controls.primary.disabled = !compact(input.value); });
  input.focus?.({ preventScroll: true });
  input.select?.();
  return { ...frame, input, error, ...controls };
}

export function createLoadGameDialog({ campaign, opener = null, onLoad = null, onDelete = null } = {}) {
  const frame = createDialogFrame({ title: 'Load Game', className: 'load-game-dialog-overlay', opener });
  const explanation = createElement('p', 'timeline-dialog-copy');
  explanation.textContent = 'Loading this save creates a new timeline. Your current timeline will be preserved automatically.';
  const list = createElement('div', 'timeline-saved-game-list');
  const savedGames = campaign?.savedGames || campaign?.checkpoints || [];
  let selectedId = null;
  let busy = false;
  const entries = [];
  const rows = [];
  const deleteButtons = [];
  const error = createElement('p', 'timeline-dialog-error');
  error.setAttribute('role', 'alert');
  error.setAttribute('aria-live', 'assertive');
  error.hidden = true;
  frame.dialog.append(explanation, list, error);
  const controls = appendDialogActions(frame.dialog, {
    primaryLabel: 'Load Game',
    primaryDisabled: true,
    close: frame.close,
    onPrimary: async () => {
      if (!selectedId || busy || !frame.isOpen()) return;
      busy = true;
      error.hidden = true;
      const restore = setButtonBusy(controls.primary, true, { label: 'Loading...' });
      controls.cancel.textContent = 'Close';
      try {
        await onLoad?.({ savedGameId: selectedId });
        if (frame.isOpen()) frame.close('loaded');
      } catch (cause) {
        if (frame.isOpen()) {
          error.textContent = cause?.message || 'Could not load this game. Try again.';
          error.hidden = false;
        }
      } finally {
        busy = false;
        restore();
        controls.cancel.textContent = 'Cancel';
        controls.primary.disabled = !selectedId;
      }
    }
  });
  for (const savedGame of savedGames) {
    const entry = createElement('div', 'timeline-saved-game-entry');
    const row = createElement('button', 'timeline-saved-game-row');
    row.type = 'button';
    row.dataset.savedGameId = savedGame.id;
    row.setAttribute('aria-pressed', 'false');
    const name = createElement('strong');
    name.textContent = savedGame.name || 'Saved Game';
    const meta = createElement('span');
    meta.textContent = savedGameMeta(savedGame);
    row.append(name, meta);
    row.addEventListener('click', () => {
      if (busy || !frame.isOpen()) return;
      selectedId = savedGame.id;
      rows.forEach((candidate) => candidate.setAttribute('aria-pressed', candidate === row ? 'true' : 'false'));
      controls.primary.disabled = false;
    });
    entry.appendChild(row);
    if (typeof onDelete === 'function') {
      const remove = createElement('button', 'timeline-saved-game-delete');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Delete saved game ${savedGame.name || 'Saved Game'}`);
      remove.textContent = 'Delete';
      remove.addEventListener('click', async (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        if (busy || !frame.isOpen()) return;
        const confirmed = typeof globalThis.confirm !== 'function'
          || globalThis.confirm(`Delete saved game "${savedGame.name || 'Saved Game'}"?`);
        if (!confirmed) return;
        busy = true;
        const restore = setButtonBusy(remove, true, { label: 'Deleting...' });
        controls.cancel.textContent = 'Close';
        error.hidden = true;
        error.textContent = '';
        try {
          await onDelete({ savedGameId: savedGame.id });
          if (!frame.isOpen()) return;
          const index = entries.indexOf(entry);
          if (index >= 0) {
            entries.splice(index, 1);
            rows.splice(index, 1);
            deleteButtons.splice(index, 1);
          }
          entry.remove?.();
          if (selectedId === savedGame.id) selectedId = null;
          controls.primary.disabled = !selectedId;
          if (!entries.length) appendEmpty(list, 'No saved games are available to load.');
        } catch (cause) {
          if (!frame.isOpen()) return;
          error.textContent = cause?.message || 'Could not delete this saved game. Try again.';
          error.hidden = false;
        } finally {
          busy = false;
          restore();
          controls.cancel.textContent = 'Cancel';
        }
      });
      deleteButtons.push(remove);
      entry.appendChild(remove);
    }
    entries.push(entry);
    rows.push(row);
    list.appendChild(entry);
  }
  if (!savedGames.length) appendEmpty(list, 'No saved games are available to load.');
  return { ...frame, list, entries, rows, deleteButtons, error, ...controls, selectedSavedGameId: () => selectedId };
}

export function createPreviousTimelineNameDialog({ savedGameId, suggestedName, opener = null, onRename = null } = {}) {
  if (!globalThis.document?.createElement) {
    const entered = typeof globalThis.prompt === 'function'
      ? globalThis.prompt('Name Previous Timeline\n\nYour previous timeline was saved so you can return to it.', suggestedName)
      : null;
    const name = compact(entered);
    if (name && name !== compact(suggestedName)) Promise.resolve(onRename?.({ savedGameId, name }));
    return { fallback: true, close: () => ({ closed: true, reason: 'fallback' }) };
  }
  const frame = createDialogFrame({ title: 'Name Previous Timeline', className: 'previous-timeline-dialog-overlay', opener });
  const explanation = createElement('p', 'timeline-dialog-copy');
  explanation.textContent = 'Your previous timeline was saved so you can return to it.';
  const label = createElement('label', 'timeline-dialog-field');
  const labelText = createElement('span');
  labelText.textContent = 'Saved game name';
  const input = createElement('input', 'timeline-dialog-input');
  input.type = 'text';
  input.value = compact(suggestedName);
  label.append(labelText, input);
  const error = createElement('p', 'timeline-dialog-error');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  frame.dialog.append(explanation, label, error);
  let busy = false;
  const controls = appendDialogActions(frame.dialog, {
    primaryLabel: 'Save Name',
    close: frame.close,
    onPrimary: async () => {
      const name = compact(input.value);
      if (busy || !frame.isOpen()) return;
      busy = true;
      error.hidden = true;
      const restore = setButtonBusy(controls.primary, true, { label: 'Saving...' });
      controls.cancel.textContent = 'Close';
      try {
        if (name && name !== compact(suggestedName)) await onRename?.({ savedGameId, name });
        if (frame.isOpen()) frame.close(name ? 'saved' : 'kept-automatic-name');
      } catch (cause) {
        if (frame.isOpen()) {
          error.textContent = cause?.message || 'Could not save this name. Try again.';
          error.hidden = false;
        }
      } finally {
        busy = false;
        restore();
        controls.cancel.textContent = 'Cancel';
      }
    }
  });
  input.focus?.({ preventScroll: true });
  input.select?.();
  return { ...frame, input, error, ...controls };
}

export const __timelineDialogTestHooks = Object.freeze({ savedGameMeta });
