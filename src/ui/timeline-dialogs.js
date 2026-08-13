import { appendDirectiveModal } from './directive-overlay-root.js';
import { appendEmpty, createElement } from './runtime-ui-kit.js';

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
  return [savedGame.chapter, Number.isFinite(savedGame.stardate) ? `Stardate ${savedGame.stardate}` : savedGame.stardate, formatDate(savedGame.createdAt)]
    .filter(Boolean)
    .join(' / ');
}

function createDialogFrame({ title, className, opener = null } = {}) {
  const shell = globalThis.document?.getElementById?.('directive-runtime-panel') || null;
  const shellWasInert = shell?.inert === true;
  if (shell) shell.inert = true;
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
  const close = (reason = 'dismissed') => {
    overlay.remove?.();
    if (shell) shell.inert = shellWasInert;
    opener?.focus?.({ preventScroll: true });
    return { closed: true, reason };
  };
  dialog.addEventListener('keydown', (event) => {
    if (event?.key !== 'Escape') return;
    event.preventDefault?.();
    event.stopPropagation?.();
    close('escape');
  });
  return { overlay, dialog, close };
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

export function createSaveGameDialog({ campaign, opener = null, onSave = null } = {}) {
  const frame = createDialogFrame({ title: 'Save Game', className: 'save-game-dialog-overlay', opener });
  const explanation = createElement('p', 'timeline-dialog-copy');
  explanation.textContent = 'Create an immutable saved game without leaving your current timeline.';
  const label = createElement('label', 'timeline-dialog-field');
  const labelText = createElement('span');
  labelText.textContent = 'Save name';
  const input = createElement('input', 'timeline-dialog-input');
  input.type = 'text';
  input.value = campaign?.chapter ? `Before ${campaign.chapter}` : 'Saved Game';
  label.append(labelText, input);
  frame.dialog.append(explanation, label);
  let busy = false;
  const controls = appendDialogActions(frame.dialog, {
    primaryLabel: 'Save Game',
    close: frame.close,
    onPrimary: async () => {
      const name = compact(input.value);
      if (!name || busy) return;
      busy = true;
      controls.primary.disabled = true;
      try {
        await onSave?.({ name });
        frame.close('saved');
      } finally {
        busy = false;
        controls.primary.disabled = !compact(input.value);
      }
    }
  });
  input.addEventListener('input', () => { controls.primary.disabled = !compact(input.value) || busy; });
  input.focus?.({ preventScroll: true });
  input.select?.();
  return { ...frame, input, ...controls };
}

export function createLoadGameDialog({ campaign, opener = null, onLoad = null, onDelete = null } = {}) {
  const frame = createDialogFrame({ title: 'Load Game', className: 'load-game-dialog-overlay', opener });
  const explanation = createElement('p', 'timeline-dialog-copy');
  explanation.textContent = 'Loading this save creates a new timeline. Your current timeline will be preserved automatically.';
  const list = createElement('div', 'timeline-saved-game-list');
  const savedGames = campaign?.savedGames || campaign?.checkpoints || [];
  let selectedId = null;
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
      if (!selectedId || controls.primary.disabled) return;
      controls.primary.disabled = true;
      try {
        await onLoad?.({ savedGameId: selectedId });
        frame.close('loaded');
      } finally {
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
      selectedId = savedGame.id;
      rows.forEach((candidate) => candidate.setAttribute('aria-pressed', candidate === row ? 'true' : 'false'));
      controls.primary.disabled = false;
    });
    const remove = createElement('button', 'timeline-saved-game-delete');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Delete saved game ${savedGame.name || 'Saved Game'}`);
    remove.textContent = 'Delete';
    remove.addEventListener('click', async (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      const confirmed = typeof globalThis.confirm !== 'function'
        || globalThis.confirm(`Delete saved game "${savedGame.name || 'Saved Game'}"?`);
      if (!confirmed) return;
      remove.disabled = true;
      error.hidden = true;
      error.textContent = '';
      try {
        await onDelete?.({ savedGameId: savedGame.id });
        const index = entries.indexOf(entry);
        if (index >= 0) {
          entries.splice(index, 1);
          rows.splice(index, 1);
          deleteButtons.splice(index, 1);
        }
        entry.remove?.();
        if (selectedId === savedGame.id) selectedId = null;
        controls.primary.disabled = true;
        if (!entries.length) appendEmpty(list, 'No saved games are available to load.');
      } catch (cause) {
        error.textContent = cause?.message || String(cause || 'Saved game deletion failed.');
        error.hidden = false;
        remove.disabled = false;
      }
    });
    entry.append(row, remove);
    entries.push(entry);
    rows.push(row);
    deleteButtons.push(remove);
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
  frame.dialog.append(explanation, label);
  let busy = false;
  const controls = appendDialogActions(frame.dialog, {
    primaryLabel: 'Save Name',
    close: frame.close,
    onPrimary: async () => {
      const name = compact(input.value);
      if (busy) return;
      busy = true;
      controls.primary.disabled = true;
      try {
        if (name && name !== compact(suggestedName)) await onRename?.({ savedGameId, name });
        frame.close(name ? 'saved' : 'kept-automatic-name');
      } finally {
        busy = false;
      }
    }
  });
  input.focus?.({ preventScroll: true });
  input.select?.();
  return { ...frame, input, ...controls };
}

export const __timelineDialogTestHooks = Object.freeze({ savedGameMeta });
