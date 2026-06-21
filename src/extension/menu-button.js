import { runRuntimeAction } from '../runtime/runtime-actions.js';

export const DIRECTIVE_MENU_BUTTON_ID = 'directive-extensions-menu-button';

export function createDirectiveMenuIcon() {
  const icon = document.createElement('i');
  icon.className = 'fa-solid fa-compass directive-extensions-menu-icon';
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

export function installExtensionsMenuButton() {
  const menu = document.getElementById('extensionsMenu');
  if (!menu) return false;

  if (document.getElementById(DIRECTIVE_MENU_BUTTON_ID)) return true;

  const placeholder = document.getElementById('extensionsMenuDefault');
  if (placeholder) placeholder.remove();

  const button = document.createElement('div');
  button.id = DIRECTIVE_MENU_BUTTON_ID;
  button.className = 'list-group-item flex-container flexGap5 interactable';
  button.title = 'Open Directive command spine.';

  const label = document.createElement('span');
  label.textContent = 'Directive';
  button.append(createDirectiveMenuIcon(), label);

  button.addEventListener('click', () => {
    runRuntimeAction('runtime.open');
  });

  menu.appendChild(button);
  return true;
}
