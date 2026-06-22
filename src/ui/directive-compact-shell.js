import { createElement, createIconFromDescriptor } from './runtime-ui-kit.js';
import {
  DIRECTIVE_BUNDLED_ICON_PACKS,
  resolveDirectiveIconSlot
} from '../theme/directive-icon-packs.mjs';

function appendText(element, text) {
  const label = createElement('span');
  label.textContent = text;
  element.appendChild(label);
  return label;
}

function resolveIconDescriptor(slot, fallbackClass = '') {
  if (slot) {
    return resolveDirectiveIconSlot(DIRECTIVE_BUNDLED_ICON_PACKS[0], slot);
  }
  return {
    type: 'class',
    value: fallbackClass,
    label: ''
  };
}

function createResolvedIcon({ slot = '', fallbackClass = '', className = '' } = {}) {
  const icon = resolveIconDescriptor(slot, fallbackClass);
  return createIconFromDescriptor(icon, { slot, fallbackClass, className });
}

function createShellAction(action = {}) {
  const button = createElement('button', `directive-icon-button directive-shell-action directive-shell-action-${action.id || 'item'}`);
  button.type = 'button';
  button.dataset.shellAction = action.id || '';
  button.title = action.title || action.label || '';
  button.setAttribute('aria-label', action.label || action.title || 'Directive action');
  button.disabled = action.disabled === true;
  button.setAttribute('aria-disabled', button.disabled ? 'true' : 'false');
  if (action.icon || action.iconSlot) {
    button.append(createResolvedIcon({
      slot: action.iconSlot || `action.${action.id || ''}`,
      fallbackClass: action.icon || '',
      className: 'directive-shell-action-icon'
    }));
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

function invokeAction(action, event, control = null) {
  if (control?.disabled === true || (!control && action?.disabled === true)) {
    event?.preventDefault?.();
    return;
  }
  if (typeof action?.onClick === 'function') {
    action.onClick(event);
  }
}

function createMobileShellAction(action = {}) {
  const button = createElement('button', `directive-mobile-shell-action directive-mobile-shell-action-${action.id || 'item'}`);
  button.type = 'button';
  button.dataset.mobileShellAction = action.id || '';
  button.title = action.title || action.label || '';
  button.setAttribute('aria-label', action.label || action.title || 'Directive action');
  button.disabled = action.disabled === true;
  button.setAttribute('aria-disabled', button.disabled ? 'true' : 'false');

  const icon = createElement('span', `directive-mobile-shell-action-icon directive-mobile-shell-action-icon-${action.id || 'item'}`);
  icon.setAttribute('aria-hidden', 'true');
  if (action.icon || action.iconSlot) {
    icon.append(createResolvedIcon({
      slot: action.iconSlot || `action.${action.id || ''}`,
      fallbackClass: action.icon || ''
    }));
  }
  button.append(icon);

  const label = createElement('span', 'directive-mobile-shell-action-label');
  label.textContent = action.label || action.title || 'Action';
  button.append(label);
  button.addEventListener('click', (event) => invokeAction(action, event, button));
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
  if (route.icon || route.iconSlot) {
    button.append(createResolvedIcon({
      slot: route.iconSlot || `route.${route.id || ''}`,
      fallbackClass: route.icon || '',
      className: 'directive-shell-route-icon'
    }));
  }
  appendText(button, route.label);
  button.addEventListener('click', () => onSelectRoute?.(route.id));
  return button;
}

function createShellRail() {
  const rail = createElement('aside', 'directive-shell-rail');
  rail.setAttribute('aria-hidden', 'true');

  const cap = createElement('span', 'directive-shell-rail-cap');
  const labels = [
    ['SYS', '01'],
    ['LCARS', '47-741'],
    ['OPS', '02'],
    ['ENG', '03'],
    ['SEC', '04'],
    ['COM', '05']
  ];
  const stack = createElement('div', 'directive-shell-rail-stack');
  labels.forEach(([label, index], position) => {
    const segment = createElement('span', `directive-shell-rail-segment directive-shell-rail-segment-${position + 1}`);
    const segmentLabel = createElement('span', 'directive-shell-rail-label');
    segmentLabel.textContent = label;
    const segmentIndex = createElement('strong', 'directive-shell-rail-index');
    segmentIndex.textContent = index;
    segment.append(segmentLabel, segmentIndex);
    stack.appendChild(segment);
  });
  const foot = createElement('span', 'directive-shell-rail-foot');
  rail.append(cap, stack, foot);
  return rail;
}

function createMobileRouteButton(route, activeRouteId, onSelectRoute, routeIndex = 0) {
  const selected = route.id === activeRouteId;
  const button = createElement('button', 'directive-mobile-bottom-tab');
  button.type = 'button';
  button.dataset.routeId = route.id;
  button.dataset.mobileRouteId = route.id;
  button.dataset.mobileLabel = route.label;
  button.title = route.description || route.label;
  button.setAttribute('aria-label', route.description || route.label);
  button.setAttribute('role', 'tab');
  button.setAttribute('aria-selected', selected ? 'true' : 'false');
  if (selected) {
    button.classList.add('directive-mobile-bottom-tab-active');
    button.setAttribute('aria-current', 'page');
  }

  button.dataset.routeIndex = String(routeIndex + 1).padStart(2, '0');
  button.dataset.routeDetail = route.shelfLabel || route.description || '';

  const routeIcon = createElement('span', 'directive-mobile-bottom-icon directive-mobile-route-icon');
  routeIcon.setAttribute('aria-hidden', 'true');
  if (route.icon || route.iconSlot) {
    routeIcon.append(createResolvedIcon({
      slot: route.iconSlot || `route.${route.id || ''}`,
      fallbackClass: route.icon || ''
    }));
  } else {
    routeIcon.textContent = route.label.slice(0, 1);
  }

  const label = createElement('span', 'directive-mobile-bottom-label');
  label.textContent = route.label;

  button.append(routeIcon, label);
  button.addEventListener('contextmenu', (event) => event.preventDefault());
  button.addEventListener('click', (event) => {
    event?.stopPropagation?.();
    return onSelectRoute?.(route.id);
  });
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
  const panel = createElement('section', 'directive-runtime-panel directive-runtime-shell directive-compact-shell directive-bottom-navigation-shell directive-mobile-touch');
  if (id) {
    panel.id = id;
  }
  panel.dataset.directiveShell = 'bottom-navigation';
  panel.setAttribute('aria-label', label);

  const header = createElement('header', 'directive-runtime-header directive-shell-topbar');
  const identityCluster = createElement('div', 'directive-shell-identity-cluster');
  const brandStack = createElement('div', 'directive-shell-brand-stack');
  const productLabel = createElement('span', 'directive-shell-product-label');
  productLabel.textContent = 'DIRECTIVE';
  const titleElement = createElement('div', 'directive-runtime-title directive-shell-title');
  titleElement.dataset.directiveCurrentRouteTitle = 'true';
  const activeRoute = routes.find((route) => route.id === activeRouteId);
  titleElement.append(createResolvedIcon({
    slot: activeRoute?.iconSlot || '',
    fallbackClass: activeRoute?.icon || icon || 'fa-solid fa-compass',
    className: 'directive-runtime-title-icon'
  }));
  const routeTitle = appendText(titleElement, activeRoute?.label || title);
  routeTitle.className = 'directive-shell-title-label';
  const versionLabel = createElement('span', 'directive-shell-version-label');
  versionLabel.textContent = 'CAMPAIGN EXTENSION / PRE-ALPHA';
  brandStack.append(productLabel, titleElement);
  identityCluster.append(brandStack, versionLabel);

  const telemetry = createElement('div', 'directive-shell-telemetry');
  const runtimeStatus = createElement('div', 'directive-shell-runtime-status');
  const statusDot = createElement('span', 'directive-shell-status-dot');
  statusDot.setAttribute('aria-hidden', 'true');
  const statusText = createElement('span', 'directive-shell-status-text');
  statusText.textContent = 'RUNTIME ONLINE';
  runtimeStatus.append(statusDot, statusText);
  const routeContext = createElement('div', 'directive-shell-route-context');
  const contextLabel = createElement('span', 'directive-shell-context-label');
  contextLabel.textContent = 'CONTEXT';
  const contextValue = createElement('strong', 'directive-shell-context-value');
  contextValue.dataset.directiveCurrentRoute = 'true';
  contextValue.textContent = routes.find((route) => route.id === activeRouteId)?.label || title;
  routeContext.append(contextLabel, contextValue);
  const chronometer = createElement('div', 'directive-shell-chronometer');
  const chronoLabel = createElement('span', 'directive-shell-context-label');
  chronoLabel.textContent = 'LCARS';
  const chronoValue = createElement('strong', 'directive-shell-chrono-value');
  chronoValue.textContent = 'ONLINE';
  chronometer.append(chronoLabel, chronoValue);
  telemetry.append(runtimeStatus, routeContext, chronometer);

  const actionCluster = createElement('div', 'directive-shell-actions');
  actionCluster.dataset.directiveShellActions = 'top-right';
  for (const action of actions) {
    actionCluster.appendChild(createShellAction(action));
  }

  header.append(identityCluster, telemetry, actionCluster);

  const body = createElement('main', 'directive-runtime-body directive-shell-body');
  body.dataset.directiveRuntimeBody = 'true';
  body.setAttribute('role', 'tabpanel');

  const mobileShellActions = actions.filter((item) => item?.mobileShell === true);

  const mobileBottomBar = createElement('nav', 'directive-mobile-bottom-bar directive-bottom-route-bar');
  mobileBottomBar.setAttribute('aria-label', 'Directive mobile navigation');
  mobileBottomBar.setAttribute('role', 'tablist');
  mobileBottomBar.style?.setProperty?.('--directive-mobile-bottom-tab-count', String(routes.length || 1));
  if (mobileShellActions.length > 0) {
    const mobileActionBar = createElement('div', 'directive-mobile-shell-action-bar');
    mobileActionBar.setAttribute('aria-label', 'Directive shell actions');
    for (const action of mobileShellActions) {
      mobileActionBar.appendChild(createMobileShellAction(action));
    }
    mobileBottomBar.appendChild(mobileActionBar);
  }
  routes.forEach((route, routeIndex) => {
    mobileBottomBar.appendChild(createMobileRouteButton(route, activeRouteId, onSelectRoute, routeIndex));
  });

  const rail = createShellRail();
  panel.append(rail, header, body, mobileBottomBar);
  return panel;
}
