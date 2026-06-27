import { hasRuntimeAction, runRuntimeAction } from '../runtime/runtime-actions.js';
import { createDirectiveMenuIcon } from './menu-button.js';

export const DIRECTIVE_SETTINGS_PANEL_ID = 'directive_settings';
export const DIRECTIVE_OPEN_RUNTIME_BUTTON_ID = 'directive_open_runtime';
export const DIRECTIVE_RESET_WINDOW_BUTTON_ID = 'directive_reset_window';
export const DIRECTIVE_EXTENSION_ENABLE_TOGGLE_ID = 'directive_extension_enabled';
export const DIRECTIVE_EXTENSION_ENABLE_STATUS_ID = 'directive_extension_enabled_status';

const SETTINGS_CONTAINER_IDS = ['extensions_settings2', 'extensions_settings'];
const RESET_LAYOUT_ACTION_ID = 'runtime.resetLayout';
let pendingSettingsContainerObserver = null;
let pendingSettingsContainerOptions = null;

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
  button.dataset.directiveEnabledTitle = title;
  const labelNode = document.createElement('span');
  labelNode.textContent = label;
  button.append(createIcon(iconClassName), labelNode);
  return button;
}

function directiveEnabledFromOptions(options = {}) {
  return options.directiveEnabled !== false;
}

function createDirectiveEnableToggle(options = {}) {
  const enabled = directiveEnabledFromOptions(options);
  const row = document.createElement('label');
  row.className = 'directive-extension-enable-row';

  const copy = document.createElement('span');
  copy.className = 'directive-extension-enable-copy';
  const label = document.createElement('span');
  label.className = 'directive-extension-enable-label';
  label.textContent = 'Directive enabled';
  const status = document.createElement('span');
  status.id = DIRECTIVE_EXTENSION_ENABLE_STATUS_ID;
  status.className = 'directive-extension-enable-status';
  status.textContent = enabled ? 'On' : 'Off';
  copy.append(label, status);

  const input = document.createElement('input');
  input.id = DIRECTIVE_EXTENSION_ENABLE_TOGGLE_ID;
  input.type = 'checkbox';
  input.className = 'directive-extension-enable-input';
  input.checked = enabled;
  input.setAttribute('role', 'switch');
  input.setAttribute('aria-label', 'Turn Directive on or off');
  input.setAttribute('aria-checked', enabled ? 'true' : 'false');

  const slider = document.createElement('span');
  slider.className = 'directive-extension-enable-slider';
  slider.setAttribute('aria-hidden', 'true');

  const control = document.createElement('span');
  control.className = 'directive-extension-enable-control';
  control.append(input, slider);

  row.append(copy, control);
  return row;
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

  const enableToggle = createDirectiveEnableToggle(options);

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

  column.append(description, enableToggle, actions);
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

function syncDropdownEnabledState(container, options = {}) {
  const enabled = directiveEnabledFromOptions(options);
  const toggle = container.querySelector(`#${DIRECTIVE_EXTENSION_ENABLE_TOGGLE_ID}`);
  if (toggle) {
    toggle.checked = enabled;
    toggle.setAttribute('aria-checked', enabled ? 'true' : 'false');
  }
  const status = container.querySelector(`#${DIRECTIVE_EXTENSION_ENABLE_STATUS_ID}`);
  if (status) status.textContent = enabled ? 'On' : 'Off';
  for (const id of [DIRECTIVE_OPEN_RUNTIME_BUTTON_ID, DIRECTIVE_RESET_WINDOW_BUTTON_ID]) {
    const button = container.querySelector(`#${id}`);
    if (!button) continue;
    button.disabled = !enabled;
    button.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    button.title = enabled
      ? button.dataset.directiveEnabledTitle || button.title
      : 'Turn Directive on before using this control.';
  }
}

function wireDirectiveEnableToggle(container, options = {}) {
  const toggle = container.querySelector(`#${DIRECTIVE_EXTENSION_ENABLE_TOGGLE_ID}`);
  if (!toggle || toggle.dataset.directiveToggleWired === 'true') return;
  toggle.__directiveToggleOptions = options;
  toggle.dataset.directiveToggleWired = 'true';
  toggle.addEventListener('change', async (event) => {
    const currentOptions = toggle.__directiveToggleOptions || {};
    const nextEnabled = toggle.checked !== false;
    syncDropdownEnabledState(container, { ...currentOptions, directiveEnabled: nextEnabled });
    try {
      const result = await currentOptions.onDirectiveEnabledChange?.(nextEnabled, { event, container });
      const resolvedEnabled = result?.enabled === false ? false : nextEnabled;
      syncDropdownEnabledState(container, { ...currentOptions, directiveEnabled: resolvedEnabled });
    } catch (error) {
      const restoredEnabled = !nextEnabled;
      syncDropdownEnabledState(container, { ...currentOptions, directiveEnabled: restoredEnabled });
      globalThis.toastr?.error?.(error?.message || String(error));
      throw error;
    }
  });
}

function wireActionButton(container, id, actionId) {
  const button = container.querySelector(`#${id}`);
  if (!button || button.dataset.directiveActionWired === 'true') return;
  button.dataset.directiveActionWired = 'true';
  button.addEventListener('click', (event) => {
    event?.preventDefault?.();
    if (button.disabled || button.getAttribute('aria-disabled') === 'true') return;
    runRuntimeAction(actionId);
  });
}

export function wireExtensionsMenuDropdown(container, options = {}) {
  if (!container) return false;
  syncResetWindowButton(container, options);
  syncDropdownEnabledState(container, options);
  const toggle = container.querySelector(`#${DIRECTIVE_EXTENSION_ENABLE_TOGGLE_ID}`);
  if (toggle) toggle.__directiveToggleOptions = options;
  wireDirectiveEnableToggle(container, options);
  wireActionButton(container, DIRECTIVE_OPEN_RUNTIME_BUTTON_ID, 'runtime.open');
  wireActionButton(container, DIRECTIVE_RESET_WINDOW_BUTTON_ID, RESET_LAYOUT_ACTION_ID);
  return true;
}

function clearPendingSettingsContainerObserver() {
  pendingSettingsContainerObserver?.disconnect?.();
  pendingSettingsContainerObserver = null;
  pendingSettingsContainerOptions = null;
}

function observeSettingsContainer(options = {}) {
  pendingSettingsContainerOptions = options;
  if (
    pendingSettingsContainerObserver
    || typeof MutationObserver !== 'function'
    || !document.body
  ) {
    return false;
  }

  pendingSettingsContainerObserver = new MutationObserver(() => {
    const container = getSettingsContainer();
    if (!container) return;
    const latestOptions = pendingSettingsContainerOptions || options;
    clearPendingSettingsContainerObserver();
    installExtensionsMenuDropdown(latestOptions);
  });
  pendingSettingsContainerObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
  return true;
}

export function installExtensionsMenuDropdown(options = {}) {
  if (typeof document === 'undefined') return false;

  const existing = document.getElementById(DIRECTIVE_SETTINGS_PANEL_ID);
  if (existing) {
    clearPendingSettingsContainerObserver();
    wireExtensionsMenuDropdown(existing, options);
    return true;
  }

  const settingsContainer = getSettingsContainer();
  if (!settingsContainer) {
    observeSettingsContainer(options);
    return false;
  }

  clearPendingSettingsContainerObserver();
  const panel = buildSettingsPanel(options);
  settingsContainer.appendChild(panel);
  wireExtensionsMenuDropdown(panel, options);
  return true;
}
