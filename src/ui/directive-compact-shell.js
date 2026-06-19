import { createElement, createIcon } from './runtime-ui-kit.js';

function appendText(element, text) {
  const label = createElement('span');
  label.textContent = text;
  element.appendChild(label);
  return label;
}

function createShellAction(action = {}) {
  const button = createElement('button', `directive-icon-button directive-shell-action directive-shell-action-${action.id || 'item'}`);
  button.type = 'button';
  button.dataset.shellAction = action.id || '';
  button.title = action.title || action.label || '';
  button.setAttribute('aria-label', action.label || action.title || 'Directive action');
  button.disabled = action.disabled === true;
  button.setAttribute('aria-disabled', button.disabled ? 'true' : 'false');
  if (action.icon) {
    button.append(createIcon(action.icon));
  } else {
    appendText(button, action.label || 'Action');
  }
  if (typeof action.onClick === 'function') {
    button.addEventListener('click', (event) => {
      if (button.disabled) {
        event?.preventDefault?.();
        return;
      }
      action.onClick(event);
    });
  }
  return button;
}

function createShellRouteButton(route, activeRouteId, onSelectRoute) {
  const selected = route.id === activeRouteId;
  const button = createElement('button', 'directive-tab-button directive-shell-route-button');
  button.type = 'button';
  button.dataset.tab = route.id;
  button.dataset.routeId = route.id;
  button.title = route.description || route.label;
  button.setAttribute('aria-selected', selected ? 'true' : 'false');
  button.setAttribute('role', 'tab');
  if (selected) {
    button.classList.add('directive-tab-button-active');
    button.setAttribute('aria-current', 'page');
  }
  if (route.icon) {
    button.append(createIcon(`${route.icon} directive-shell-route-icon`));
  }
  appendText(button, route.label);
  button.addEventListener('click', () => onSelectRoute?.(route.id));
  return button;
}

export function createDirectiveCompactShell({
  id = '',
  title = 'Directive',
  label = 'Directive runtime',
  icon = 'fa-solid fa-compass directive-runtime-title-icon',
  routes = [],
  activeRouteId = '',
  actions = [],
  onSelectRoute = null
} = {}) {
  const panel = createElement('section', 'directive-runtime-panel directive-compact-shell directive-top-control-shell');
  if (id) {
    panel.id = id;
  }
  panel.dataset.directiveShell = 'top-control';
  panel.setAttribute('aria-label', label);

  const header = createElement('header', 'directive-runtime-header directive-shell-topbar');
  const titleElement = createElement('div', 'directive-runtime-title directive-shell-title');
  titleElement.append(createIcon(icon));
  appendText(titleElement, title);

  const tabs = createElement('nav', 'directive-runtime-tabs directive-shell-topnav');
  tabs.setAttribute('aria-label', 'Directive sections');
  tabs.setAttribute('role', 'tablist');
  for (const route of routes) {
    tabs.appendChild(createShellRouteButton(route, activeRouteId, onSelectRoute));
  }

  const actionCluster = createElement('div', 'directive-shell-actions');
  actionCluster.dataset.directiveShellActions = 'top-right';
  for (const action of actions) {
    actionCluster.appendChild(createShellAction(action));
  }

  header.append(titleElement, tabs, actionCluster);

  const body = createElement('main', 'directive-runtime-body directive-shell-body');
  body.dataset.directiveRuntimeBody = 'true';
  body.setAttribute('role', 'tabpanel');

  panel.append(header, body);
  return panel;
}
