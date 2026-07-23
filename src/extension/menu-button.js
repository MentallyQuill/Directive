import { runRuntimeAction } from '../runtime/runtime-actions.js';

export const DIRECTIVE_MENU_BUTTON_ID = 'directive-extensions-menu-button';

function directiveEnabledFromOptions(options = {}) {
  return options.directiveEnabled !== false;
}

export function createDirectiveMenuIcon() {
  const icon = document.createElement('i');
  icon.className = 'fa-solid fa-compass directive-extensions-menu-icon';
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

export function syncExtensionsMenuButton(button, options = {}) {
  if (!button) return false;
  const enabled = directiveEnabledFromOptions(options);
  button.dataset.directiveEnabled = enabled ? 'true' : 'false';
  button.setAttribute('aria-disabled', enabled ? 'false' : 'true');
  button.classList.toggle('disabled', !enabled);
  button.title = enabled
    ? 'Open the Directive game menu.'
    : 'Directive is turned off. Enable it from the Directive dropdown.';
  return enabled;
}

export function installExtensionsMenuButton(options = {}) {
  const menu = document.getElementById('extensionsMenu');
  if (!menu) return false;

  const existing = document.getElementById(DIRECTIVE_MENU_BUTTON_ID);
  if (existing) {
    syncExtensionsMenuButton(existing, options);
    return true;
  }

  const placeholder = document.getElementById('extensionsMenuDefault');
  if (placeholder) placeholder.remove();

  const button = document.createElement('div');
  button.id = DIRECTIVE_MENU_BUTTON_ID;
  button.className = 'list-group-item flex-container flexGap5 interactable';

  const label = document.createElement('span');
  label.textContent = 'Directive';
  button.append(createDirectiveMenuIcon(), label);

  button.addEventListener('click', (event) => {
    if (button.dataset.directiveEnabled === 'false') {
      event?.preventDefault?.();
      globalThis.toastr?.info?.('Directive is turned off in the extension dropdown.');
      return;
    }
    runRuntimeAction('runtime.open');
  });

  syncExtensionsMenuButton(button, options);
  menu.appendChild(button);
  return true;
}
