import { createButton, createElement } from './runtime-ui-kit.js';

function restorePortraitControlFocus() {
  const schedule = typeof globalThis.requestAnimationFrame === 'function'
    ? globalThis.requestAnimationFrame
    : (callback) => callback();
  schedule(() => {
    const candidates = [...document.querySelectorAll?.('.people-player-portrait-actions .directive-crew-player-portrait-import') || []];
    const target = candidates.find((candidate) => !candidate.disabled && (candidate.getClientRects?.().length || candidate.offsetParent))
      || candidates.find((candidate) => !candidate.disabled);
    target?.focus?.({ preventScroll: true });
  });
}

export function createPlayerPortraitControls({ portrait, view, actions = {}, extraClassName = '' } = {}) {
  const supported = view?.media?.playerPortraitImportSupported === true
    && typeof actions.importPlayerPortrait === 'function';
  const fileInput = document.createElement('input');
  const status = createElement('span', 'directive-crew-player-portrait-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  fileInput.type = 'file';
  fileInput.accept = 'image/png,image/jpeg,image/webp';
  fileInput.hidden = true;
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0] || null;
    if (!file) return;
    status.textContent = '';
    try {
      await actions.importPlayerPortrait({ file });
      await actions.refresh?.();
      restorePortraitControlFocus();
    } catch {
      status.textContent = 'Portrait import failed. Try again.';
    } finally {
      fileInput.value = '';
    }
  });
  const portraitActions = createElement('div', `directive-crew-player-portrait-actions${extraClassName ? ` ${extraClassName}` : ''}`);
  portraitActions.appendChild(createButton({
    label: portrait?.asset?.path ? 'Change' : 'Import',
    icon: 'fa-solid fa-image',
    className: 'directive-button directive-crew-player-portrait-import',
    title: supported ? 'Import a player character portrait' : 'Portrait import is not available on this host',
    disabled: !supported,
    onClick: async () => {
      fileInput.click?.();
    }
  }));
  if (portrait?.asset?.path) {
    portraitActions.appendChild(createButton({
      label: 'Remove',
      icon: 'fa-solid fa-trash-can',
      className: 'directive-button directive-crew-player-portrait-remove',
      title: 'Remove this player character portrait',
      disabled: typeof actions.removePlayerPortrait !== 'function',
      onClick: async () => {
        status.textContent = '';
        try {
          await actions.removePlayerPortrait();
          await actions.refresh?.();
          restorePortraitControlFocus();
        } catch {
          status.textContent = 'Portrait removal failed. Try again.';
        }
      }
    }));
  }
  portraitActions.appendChild(status);
  return { portraitActions, fileInput };
}
