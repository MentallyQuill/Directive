import { createElement, createIconFromDescriptor } from './runtime-ui-kit.js';
import {
  DIRECTIVE_BUNDLED_ICON_PACKS,
  resolveDirectiveIconSlot
} from '../theme/directive-icon-packs.mjs';

function appendText(element, text, className = '') {
  const label = createElement('span', className);
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

function invokeAction(action, event, control = null) {
  if (control?.disabled === true || (!control && action?.disabled === true)) {
    event?.preventDefault?.();
    return;
  }
  if (typeof action?.onClick === 'function') {
    action.onClick(event);
  }
}

function createShellAction(action = {}, className = '') {
  const button = createElement(
    'button',
    `directive-icon-button directive-command-drawer-action directive-command-drawer-action-${action.id || 'item'}${className ? ` ${className}` : ''}`
  );
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
      className: 'directive-command-drawer-action-icon'
    }));
  } else {
    appendText(button, action.label || 'Action');
  }
  button.addEventListener('click', (event) => invokeAction(action, event, button));
  return button;
}

function createRouteIcon(route) {
  const wrap = createElement('span', 'directive-spine-route-icon');
  wrap.setAttribute('aria-hidden', 'true');
  wrap.append(createResolvedIcon({
    slot: route.iconSlot || `route.${route.id || ''}`,
    fallbackClass: route.icon || '',
    className: 'directive-spine-route-icon-image'
  }));
  return wrap;
}

function createSpineRouteButton(route, activeRouteId, drawerOpen, routeIndex, onSelectRoute) {
  const selected = route.id === activeRouteId;
  const expanded = selected && drawerOpen;
  const button = createElement('button', 'directive-spine-route directive-tab-button');
  button.type = 'button';
  button.dataset.tab = route.id;
  button.dataset.routeId = route.id;
  button.dataset.routeIndex = String(routeIndex + 1).padStart(2, '0');
  button.dataset.routeTone = route.id;
  button.title = route.description || route.label;
  button.setAttribute('role', 'tab');
  button.setAttribute('aria-selected', selected ? 'true' : 'false');
  button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  button.setAttribute('aria-controls', 'directive-command-drawer');
  if (selected) {
    button.classList.add('directive-spine-route-selected');
    button.setAttribute('aria-current', 'page');
  }
  if (expanded) {
    button.classList.add('directive-spine-route-active', 'directive-tab-button-active');
  }

  const index = createElement('span', 'directive-spine-route-index');
  index.textContent = String(routeIndex + 1).padStart(2, '0');
  const copy = createElement('span', 'directive-spine-route-copy');
  const label = createElement('span', 'directive-spine-route-label');
  label.textContent = route.label;
  const detail = createElement('span', 'directive-spine-route-detail');
  detail.textContent = route.shelfLabel || route.shortLabel || '';
  copy.append(label, detail);

  button.append(index, createRouteIcon(route), copy);
  button.addEventListener('click', async (event) => {
    event?.stopPropagation?.();
    await onSelectRoute?.(route.id);
  });
  return button;
}

function createMobileRouteButton(route, activeRouteId, onSelectRoute, routeIndex = 0) {
  const selected = route.id === activeRouteId;
  const button = createElement('button', 'directive-mobile-bottom-tab');
  button.type = 'button';
  button.dataset.routeId = route.id;
  button.dataset.mobileRouteId = route.id;
  button.dataset.mobileLabel = route.label;
  button.dataset.routeIndex = String(routeIndex + 1).padStart(2, '0');
  button.dataset.routeDetail = route.shelfLabel || route.description || '';
  button.dataset.routeTone = route.id;
  button.title = route.description || route.label;
  button.setAttribute('aria-label', route.description || route.label);
  button.setAttribute('role', 'tab');
  button.setAttribute('aria-selected', selected ? 'true' : 'false');
  if (selected) {
    button.classList.add('directive-mobile-bottom-tab-active');
    button.setAttribute('aria-current', 'page');
  }

  const routeIcon = createElement('span', 'directive-mobile-bottom-icon directive-mobile-route-icon');
  routeIcon.setAttribute('aria-hidden', 'true');
  routeIcon.append(createResolvedIcon({
    slot: route.iconSlot || `route.${route.id || ''}`,
    fallbackClass: route.icon || ''
  }));
  const label = createElement('span', 'directive-mobile-bottom-label');
  label.textContent = route.label;
  button.append(routeIcon, label);
  button.addEventListener('contextmenu', (event) => event.preventDefault());
  button.addEventListener('click', async (event) => {
    event?.stopPropagation?.();
    await onSelectRoute?.(route.id);
  });
  return button;
}

function createSpineControl({ id, label, title, icon, iconSlot = '', onClick }) {
  const button = createElement('button', `directive-spine-control directive-spine-control-${id}`);
  button.type = 'button';
  button.dataset.shellAction = id;
  button.title = title || label;
  button.setAttribute('aria-label', label);
  button.append(createResolvedIcon({
    slot: iconSlot,
    fallbackClass: icon,
    className: 'directive-spine-control-icon'
  }));
  button.addEventListener('click', (event) => {
    event?.stopPropagation?.();
    onClick?.(event);
  });
  return button;
}

function createDrawerResizeHandle({ edge = 'right', onResizeStart = null } = {}) {
  const normalizedEdge = edge === 'left' ? 'left' : 'right';
  const resizeHandle = createElement(
    'div',
    `directive-command-drawer-resize-handle directive-command-drawer-resize-handle-${normalizedEdge}`
  );
  resizeHandle.dataset.directiveDrawerResizeHandle = 'true';
  resizeHandle.dataset.directiveDrawerResizeEdge = normalizedEdge;
  resizeHandle.setAttribute('role', 'separator');
  resizeHandle.setAttribute('aria-orientation', 'horizontal');
  resizeHandle.setAttribute('aria-label', 'Resize Directive drawer');
  resizeHandle.title = 'Drag to resize the Directive drawer. Size is remembered.';
  resizeHandle.append(createResolvedIcon({
    slot: 'action.resize',
    fallbackClass: 'fa-solid fa-up-right-and-down-left-from-center',
    className: 'directive-command-drawer-resize-icon'
  }));
  resizeHandle.addEventListener('pointerdown', (event) => onResizeStart?.(event));
  return resizeHandle;
}

function bindShelfDragHandle(element, onShelfDragStart = null) {
  if (!element || typeof onShelfDragStart !== 'function') return element;
  element.classList.add('directive-command-shelf-drag-handle');
  element.dataset.directiveShelfDragHandle = 'true';
  element.title = 'Drag to move the Directive shelf. Position is remembered.';
  element.addEventListener('pointerdown', (event) => onShelfDragStart(event));
  return element;
}

export function createDirectiveCommandSpineShell({
  id = '',
  title = 'Directive',
  label = 'Directive command spine',
  routes = [],
  activeRouteId = '',
  drawerOpen = false,
  fullscreen = false,
  spineMode = 'compact',
  actions = [],
  onSelectRoute = null,
  onCollapseDrawer = null,
  onToggleFullscreen = null,
  onToggleSpineMode = null,
  onCloseShell = null,
  onResizeStart = null,
  onShelfDragStart = null
} = {}) {
  const panel = createElement(
    'section',
    `directive-runtime-panel directive-runtime-shell directive-command-spine-shell directive-mobile-touch directive-spine-${spineMode}`
  );
  if (id) panel.id = id;
  panel.dataset.directiveShell = 'command-spine';
  panel.dataset.drawerOpen = drawerOpen ? 'true' : 'false';
  panel.dataset.fullscreen = fullscreen ? 'true' : 'false';
  panel.dataset.spineMode = spineMode;
  panel.dataset.activeRoute = activeRouteId;
  panel.setAttribute('aria-label', label);

  const spine = createElement('aside', 'directive-command-spine');
  spine.setAttribute('aria-label', 'Directive primary routes');

  const brand = createElement('div', 'directive-spine-brand');
  bindShelfDragHandle(brand, onShelfDragStart);
  const brandMark = createElement('span', 'directive-spine-brand-mark');
  brandMark.textContent = 'D';
  const brandCopy = createElement('span', 'directive-spine-brand-copy');
  appendText(brandCopy, 'DIRECTIVE', 'directive-spine-brand-title');
  appendText(brandCopy, 'STARSHIPS', 'directive-spine-brand-subtitle');
  brand.append(brandMark, brandCopy);

  const routeNav = createElement('nav', 'directive-spine-routes');
  routeNav.setAttribute('role', 'tablist');
  routeNav.setAttribute('aria-orientation', 'vertical');
  routes.forEach((route, routeIndex) => {
    routeNav.appendChild(createSpineRouteButton(route, activeRouteId, drawerOpen, routeIndex, onSelectRoute));
  });

  const controls = createElement('div', 'directive-spine-controls');
  controls.append(
    createSpineControl({
      id: 'density',
      label: spineMode === 'expanded' ? 'Use compact Directive shelf' : 'Expand Directive shelf labels',
      title: spineMode === 'expanded' ? 'Use compact shelf' : 'Expand shelf labels',
      icon: spineMode === 'expanded' ? 'fa-solid fa-angles-left' : 'fa-solid fa-angles-right',
      iconSlot: spineMode === 'expanded' ? 'action.densityCompact' : 'action.densityExpanded',
      onClick: onToggleSpineMode
    }),
    createSpineControl({
      id: 'close',
      label: 'Close Directive shelf',
      title: 'Close Directive shelf',
      icon: 'fa-solid fa-xmark',
      iconSlot: 'action.close',
      onClick: onCloseShell
    })
  );
  spine.append(brand, routeNav, controls);

  const drawer = createElement('section', 'directive-command-drawer');
  drawer.id = 'directive-command-drawer';
  drawer.dataset.directiveDrawer = 'true';
  drawer.setAttribute('role', fullscreen ? 'dialog' : 'region');
  drawer.setAttribute('aria-modal', fullscreen ? 'true' : 'false');
  drawer.setAttribute('aria-label', `${title} drawer`);

  const header = createElement('header', 'directive-runtime-header directive-command-drawer-header');
  const hinge = createElement('span', 'directive-command-drawer-hinge');
  hinge.setAttribute('aria-hidden', 'true');

  const identity = createElement('div', 'directive-command-drawer-identity');
  bindShelfDragHandle(identity, onShelfDragStart);
  const productLabel = createElement('span', 'directive-shell-product-label');
  productLabel.textContent = 'DIRECTIVE';
  const routeTitle = createElement('div', 'directive-runtime-title directive-command-drawer-title');
  routeTitle.dataset.directiveCurrentRouteTitle = 'true';
  routeTitle.append(createResolvedIcon({
    slot: routes.find((route) => route.id === activeRouteId)?.iconSlot || '',
    fallbackClass: routes.find((route) => route.id === activeRouteId)?.icon || 'fa-solid fa-compass',
    className: 'directive-runtime-title-icon'
  }));
  appendText(
    routeTitle,
    routes.find((route) => route.id === activeRouteId)?.label || title,
    'directive-shell-title-label'
  );
  const routeDetail = createElement('span', 'directive-command-drawer-route-detail');
  routeDetail.dataset.directiveCurrentRouteDetail = 'true';
  routeDetail.textContent = routes.find((route) => route.id === activeRouteId)?.shelfLabel || 'Command drawer';
  identity.append(productLabel, routeTitle, routeDetail);

  const telemetry = createElement('div', 'directive-command-drawer-telemetry');
  const statusDot = createElement('span', 'directive-shell-status-dot');
  statusDot.setAttribute('aria-hidden', 'true');
  const status = createElement('span', 'directive-command-drawer-status');
  status.textContent = fullscreen ? 'WORKSPACE' : '';
  status.hidden = !fullscreen;
  telemetry.append(statusDot, status);
  const currentRoute = createElement('span', 'directive-assistive-copy');
  currentRoute.dataset.directiveCurrentRoute = 'true';
  currentRoute.textContent = routes.find((route) => route.id === activeRouteId)?.label || title;
  telemetry.append(currentRoute);

  const headerActions = createElement('div', 'directive-shell-actions directive-command-drawer-actions');
  headerActions.dataset.directiveShellActions = 'drawer-header';
  for (const action of actions) {
    headerActions.appendChild(createShellAction(action));
  }
  headerActions.append(
    createShellAction({
      id: 'fullscreen',
      label: fullscreen ? 'Restore drawer' : 'Open full-screen workspace',
      title: fullscreen ? 'Restore drawer' : 'Open full-screen workspace',
      icon: fullscreen ? 'fa-solid fa-compress' : 'fa-solid fa-expand',
      iconSlot: fullscreen ? 'action.restore' : 'action.fullscreen',
      onClick: onToggleFullscreen
    }),
    createShellAction({
      id: 'collapse',
      label: 'Close active drawer',
      title: 'Close active drawer',
      icon: 'fa-solid fa-chevron-left',
      iconSlot: 'action.drawerCollapse',
      onClick: onCollapseDrawer
    })
  );
  header.append(hinge, identity, telemetry, headerActions);

  const body = createElement('main', 'directive-runtime-body directive-command-drawer-body');
  body.dataset.directiveRuntimeBody = 'true';
  body.setAttribute('role', 'tabpanel');

  const mobileBottomBar = createElement('nav', 'directive-mobile-bottom-bar directive-bottom-route-bar directive-command-mobile-nav');
  mobileBottomBar.setAttribute('aria-label', 'Directive mobile navigation');
  mobileBottomBar.setAttribute('role', 'tablist');
  mobileBottomBar.style?.setProperty?.('--directive-mobile-bottom-tab-count', String(routes.length || 1));
  routes.forEach((route, routeIndex) => {
    mobileBottomBar.appendChild(createMobileRouteButton(route, activeRouteId, onSelectRoute, routeIndex));
  });

  const rightResizeHandle = createDrawerResizeHandle({ edge: 'right', onResizeStart });

  drawer.append(header, body, mobileBottomBar, rightResizeHandle);
  panel.append(spine, drawer);
  return panel;
}
