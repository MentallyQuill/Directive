import { bindRovingFocus } from './expanded-interface-focus.js';
import { addTooltip, createElement, createIconFromDescriptor } from './runtime-ui-kit.js';
import { DIRECTIVE_BUNDLED_ICON_PACKS, resolveDirectiveIconSlot } from '../theme/directive-icon-packs.mjs';

const RAIL_CODES = Object.freeze({
  campaign: 'CPN',
  mission: 'MSN',
  people: 'PPL',
  ship: 'SHP',
  settings: 'SYS'
});

function routePath(route = {}) {
  return `${route.label || 'Directive'} / ${route.shelfLabel || route.shortLabel || route.label || 'Journal'}`;
}

function routeIcon(route = {}) {
  const slot = route.iconSlot || `route.${route.id || ''}`;
  const descriptor = resolveDirectiveIconSlot(DIRECTIVE_BUNDLED_ICON_PACKS[0], slot);
  return createIconFromDescriptor(descriptor, {
    slot,
    fallbackClass: route.icon || 'fa-solid fa-circle',
    className: 'directive-route-control-icon'
  });
}

function createRouteControl(route, activeRouteId, onSelectRoute, index) {
  const selected = route.id === activeRouteId;
  const button = createElement('button', `directive-route-control${selected ? ' active' : ''}`);
  button.type = 'button';
  button.dataset.routeId = route.id;
  button.dataset.routeTone = route.id;
  button.dataset.routeIndex = String(index + 1).padStart(2, '0');
  button.setAttribute('role', 'tab');
  button.setAttribute('aria-selected', selected ? 'true' : 'false');
  if (selected) button.setAttribute('aria-current', 'page');
  addTooltip(button, route.description || route.shelfLabel || route.label, { showOnHover: false });
  const label = createElement('b', 'directive-route-control-label');
  label.textContent = String(route.label || route.id || '').toUpperCase();
  button.append(routeIcon(route), label);
  button.addEventListener('click', async (event) => {
    event?.stopPropagation?.();
    await onSelectRoute?.(route.id);
  });
  return button;
}

export function createDirectiveExpandedShell({
  id = '',
  title = 'DIRECTIVE',
  label = 'Directive expanded interface',
  routes = [],
  activeRouteId = '',
  onSelectRoute = null,
  onClose = null
} = {}) {
  const activeRoute = routes.find((route) => route.id === activeRouteId) || routes[0] || {};
  const panel = createElement('section', 'directive-runtime-panel directive-runtime-shell directive-shell directive-expanded-shell');
  if (id) panel.id = id;
  panel.dataset.directiveShell = 'expanded';
  panel.dataset.activeRoute = activeRoute.id || activeRouteId;
  panel.setAttribute('aria-label', label);

  const rail = createElement('aside', 'directive-lcars-rail');
  rail.setAttribute('aria-label', 'LCARS route identifiers');
  routes.forEach((route, index) => {
    const segment = createElement('span', 'directive-lcars-rail-segment');
    const number = createElement('b');
    number.textContent = String(index + 1).padStart(2, '0');
    const code = createElement('small');
    code.textContent = RAIL_CODES[route.id] || route.id.slice(0, 3).toUpperCase();
    segment.append(number, code);
    rail.append(segment);
  });

  const workspace = createElement('main', 'directive-workspace');
  const topbar = createElement('header', 'directive-topbar');
  const identity = createElement('div', 'directive-topbar-identity');
  const brand = createElement('div', 'directive-brand');
  brand.textContent = title;
  const path = createElement('div', 'directive-route-path');
  path.textContent = routePath(activeRoute);
  identity.append(brand, path);
  const close = createElement('button', 'directive-close-action');
  close.type = 'button';
  close.dataset.shellAction = 'close';
  close.setAttribute('aria-label', 'Close Directive');
  close.textContent = '×';
  addTooltip(close, 'Close Directive');
  close.addEventListener('click', (event) => {
    event?.stopPropagation?.();
    onClose?.(event);
  });
  topbar.append(identity, close);

  const heading = createElement('div', 'directive-route-heading');
  const cap = createElement('span', 'directive-route-cap');
  cap.setAttribute('aria-hidden', 'true');
  const routeName = createElement('span', 'directive-route-name');
  routeName.textContent = activeRoute.label || '';
  heading.append(cap, routeName);

  const body = createElement('section', 'directive-runtime-body directive-route-body');
  body.dataset.directiveRuntimeBody = 'true';
  body.dataset.routeView = activeRoute.id || activeRouteId;

  const nav = createElement('nav', 'directive-route-bar');
  nav.setAttribute('aria-label', 'Directive routes');
  nav.setAttribute('role', 'tablist');
  routes.forEach((route, index) => nav.append(createRouteControl(route, activeRoute.id, onSelectRoute, index)));
  bindRovingFocus(nav, {
    selector: '[data-route-id]',
    orientation: 'horizontal',
    onActivate: (control) => control.click?.()
  });

  workspace.append(topbar, heading, body, nav);
  panel.append(rail, workspace);
  return panel;
}
