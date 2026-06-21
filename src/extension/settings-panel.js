import { hasRuntimeAction, runRuntimeAction } from '../runtime/runtime-actions.js';
import { createDirectiveMenuIcon } from './menu-button.js';

export const DIRECTIVE_SETTINGS_PANEL_ID = 'directive_settings';
export const DIRECTIVE_OPEN_RUNTIME_BUTTON_ID = 'directive_open_runtime';
export const DIRECTIVE_RESET_WINDOW_BUTTON_ID = 'directive_reset_window';

const SETTINGS_CONTAINER_IDS = ['extensions_settings2', 'extensions_settings'];
const RESET_LAYOUT_ACTION_ID = 'runtime.resetLayout';

function getSettingsContainer() {
  for (const id of SETTINGS_CONTAINER_IDS) {
    const container = document.getElementById(id);
    if (container) return container;
  }
  return null;
}

function createIcon(className) {
  const icon = document.createElement('i');
  icon.className = className;
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

function createActionButton({ id, title, iconClassName, label }) {
  const button = document.createElement('button');
  button.id = id;
  button.type = 'button';
  button.className = 'menu_button interactable';
  button.title = title;
  const labelNode = document.createElement('span');
  labelNode.textContent = label;
  button.append(createIcon(iconClassName), labelNode);
  return button;
}

function shouldShowResetWindow(options = {}) {
  if (options.allowResetWindow === true) return true;
  if (options.allowResetWindow === false) return false;
  return hasRuntimeAction(RESET_LAYOUT_ACTION_ID);
}

function buildSettingsPanel(options = {}) {
  const root = document.createElement('div');
  root.id = DIRECTIVE_SETTINGS_PANEL_ID;
  root.className = 'directive-settings';

  const drawer = document.createElement('div');
  drawer.className = 'inline-drawer';

  const header = document.createElement('div');
  header.className = 'inline-drawer-toggle inline-drawer-header';

  const title = document.createElement('span');
  title.className = 'directive-extension-dropdown-title';
  const titleText = document.createElement('b');
  titleText.textContent = 'Directive';
  title.append(createDirectiveMenuIcon(), titleText);

  const drawerIcon = document.createElement('div');
  drawerIcon.className = 'inline-drawer-icon fa-solid fa-circle-chevron-down down';

  header.append(title, drawerIcon);

  const content = document.createElement('div');
  content.className = 'inline-drawer-content';

  const column = document.createElement('div');
  column.className = 'flex-container flexFlowColumn gap-1';

  const description = document.createElement('p');
  description.className = 'directive-extension-description';
  description.textContent = 'Directive: Starfleet command runtime. Use the command spine and resizable drawer for mission, crew, ship, command log, package, and settings control.';

  const actions = document.createElement('div');
  actions.className = 'directive-runtime-window-actions';

  const openButton = createActionButton({
    id: DIRECTIVE_OPEN_RUNTIME_BUTTON_ID,
    title: 'Open the Directive runtime.',
    iconClassName: 'fa-solid fa-up-right-from-square',
    label: 'Open Runtime'
  });
  actions.appendChild(openButton);

  if (shouldShowResetWindow(options)) {
    actions.appendChild(createActionButton({
      id: DIRECTIVE_RESET_WINDOW_BUTTON_ID,
      title: 'Reset the Directive runtime window to its default layout.',
      iconClassName: 'fa-solid fa-arrows-rotate',
      label: 'Reset Window'
    }));
  }

  column.append(description, actions);
  content.appendChild(column);
  drawer.append(header, content);
  root.appendChild(drawer);
  return root;
}

function syncResetWindowButton(container, options = {}) {
  const existingButton = container.querySelector(`#${DIRECTIVE_RESET_WINDOW_BUTTON_ID}`);
  if (!shouldShowResetWindow(options)) {
    existingButton?.remove();
    return;
  }
  if (existingButton) return;

  const actions = container.querySelector('.directive-runtime-window-actions');
  if (!actions) return;
  actions.appendChild(createActionButton({
    id: DIRECTIVE_RESET_WINDOW_BUTTON_ID,
    title: 'Reset the Directive runtime window to its default layout.',
    iconClassName: 'fa-solid fa-arrows-rotate',
    label: 'Reset Window'
  }));
}

function wireActionButton(container, id, actionId) {
  const button = container.querySelector(`#${id}`);
  if (!button || button.dataset.directiveActionWired === 'true') return;
  button.dataset.directiveActionWired = 'true';
  button.addEventListener('click', (event) => {
    event?.preventDefault?.();
    runRuntimeAction(actionId);
  });
}

export function wireExtensionsMenuDropdown(container, options = {}) {
  if (!container) return false;
  syncResetWindowButton(container, options);
  wireActionButton(container, DIRECTIVE_OPEN_RUNTIME_BUTTON_ID, 'runtime.open');
  wireActionButton(container, DIRECTIVE_RESET_WINDOW_BUTTON_ID, RESET_LAYOUT_ACTION_ID);
  return true;
}

export function installExtensionsMenuDropdown(options = {}) {
  if (typeof document === 'undefined') return false;

  const existing = document.getElementById(DIRECTIVE_SETTINGS_PANEL_ID);
  if (existing) {
    wireExtensionsMenuDropdown(existing, options);
    return true;
  }

  const settingsContainer = getSettingsContainer();
  if (!settingsContainer) return false;

  const panel = buildSettingsPanel(options);
  settingsContainer.appendChild(panel);
  wireExtensionsMenuDropdown(panel, options);
  return true;
}
