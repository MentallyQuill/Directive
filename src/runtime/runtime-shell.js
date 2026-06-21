import { renderCharacterCreatorPanel } from '../ui/character-creator-panel.js';
import { renderCommandLogPanel } from '../ui/command-log-panel.js';
import { renderCrewPanel, resetCrewPanelState } from '../ui/crew-panel.js';
import { renderMissionPanel } from '../ui/mission-panel.js';
import { renderSettingsPanel } from '../ui/settings-panel.js';
import { renderShipPanel } from '../ui/ship-panel.js';
import { renderStarshipsPanel, resetStarshipsPanelState } from '../ui/starships-panel.js';
import { createDirectiveCommandSpineShell } from '../ui/directive-command-spine-shell.js';
import {
  DIRECTIVE_PRIMARY_ROUTES,
  getDirectiveRoute,
  getDirectiveRouteLabel,
  normalizeDirectiveRouteId
} from '../ui/directive-routes.mjs';
import {
  constrainDirectiveShellLayout,
  getDirectiveShellViewport,
  getDirectiveSpineWidth,
  isDirectiveMobileShell,
  loadDirectiveShellLayout,
  resetDirectiveShellLayout,
  saveDirectiveShellLayout
} from '../ui/directive-shell-layout.mjs';
import { applyDirectiveTheme, getDirectiveThemePack } from '../theme/directive-theme-packs.mjs';
import {
  appendEmpty,
  appendSectionTitle,
  clearElement
} from '../ui/runtime-ui-kit.js';

export const DIRECTIVE_RUNTIME_PANEL_ID = 'directive-runtime-panel';

export const DIRECTIVE_RUNTIME_TABS = Object.freeze(DIRECTIVE_PRIMARY_ROUTES.map((route) => ({
  id: route.id,
  label: route.label
})));

let shellLayout = loadDirectiveShellLayout();
let activeTab = normalizeDirectiveRouteId(shellLayout.activeRoute, 'starships');
shellLayout.activeRoute = activeTab;
let runtimeApp = null;
let fullscreenMode = 'none';
let isDraggingShelf = false;
let shelfDragStartX = 0;
let shelfDragStartY = 0;
let shelfDragStartLeft = 0;
let shelfDragStartTop = 0;
let isResizingDrawer = false;
let resizeStartX = 0;
let resizeStartY = 0;
let resizeStartWidth = 0;
let resizeStartHeight = 0;
let keydownListenerInstalled = false;
let viewportListenerInstalled = false;

function canUseDocument() {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

function tabLabel(tabId) {
  return getDirectiveRouteLabel(tabId);
}

function getPanel() {
  return canUseDocument() ? document.getElementById(DIRECTIVE_RUNTIME_PANEL_ID) : null;
}

function runtimeHost() {
  return document.body || document.documentElement;
}

function setStyleProperty(element, property, value) {
  element?.style?.setProperty?.(property, value);
}

function currentViewport() {
  return getDirectiveShellViewport();
}

function isMobileRuntime() {
  return isDirectiveMobileShell(currentViewport().width);
}

function persistLayout() {
  shellLayout.activeRoute = activeTab;
  shellLayout = saveDirectiveShellLayout(shellLayout, currentViewport());
  shellLayout.activeRoute = activeTab;
  return shellLayout;
}

function resetDirectiveRouteUiState() {
  resetStarshipsPanelState();
  resetCrewPanelState();
}

function getVisualDrawerOpen() {
  return isMobileRuntime() || shellLayout.drawerOpen === true || shellLayout.fullscreen === true;
}

function drawerDensity(width = shellLayout.drawerWidth) {
  const value = Number(width) || 0;
  if (value < 620) return 'compact';
  if (value < 820) return 'standard';
  return 'wide';
}

function applyShellLayout(panel = getPanel(), { persist = false } = {}) {
  if (!panel) return null;

  shellLayout = constrainDirectiveShellLayout({
    ...shellLayout,
    activeRoute: activeTab,
    fullscreen: fullscreenMode !== 'none'
  }, currentViewport());
  shellLayout.activeRoute = activeTab;
  shellLayout.fullscreen = fullscreenMode !== 'none';

  const mobile = isMobileRuntime();
  const visualDrawerOpen = mobile || shellLayout.drawerOpen || shellLayout.fullscreen;
  const spineWidth = getDirectiveSpineWidth(shellLayout.spineMode);
  const density = shellLayout.fullscreen ? 'wide' : drawerDensity(shellLayout.drawerWidth);

  panel.dataset.directiveShell = 'command-spine';
  panel.dataset.activeRoute = activeTab;
  panel.dataset.mobileActiveTab = activeTab;
  panel.dataset.drawerOpen = visualDrawerOpen ? 'true' : 'false';
  panel.dataset.persistedDrawerOpen = shellLayout.drawerOpen ? 'true' : 'false';
  panel.dataset.fullscreen = shellLayout.fullscreen ? 'true' : 'false';
  panel.dataset.fullscreenMode = fullscreenMode;
  panel.dataset.spineMode = shellLayout.spineMode;
  panel.dataset.drawerDensity = density;
  panel.dataset.mobileShell = mobile ? 'true' : 'false';
  panel.dataset.shelfLeft = String(shellLayout.shelfLeft);
  panel.dataset.shelfTop = String(shellLayout.shelfTop);

  panel.classList.toggle('directive-runtime-drawer-open', visualDrawerOpen);
  panel.classList.toggle('directive-runtime-fullscreen', shellLayout.fullscreen);
  panel.classList.toggle('directive-runtime-mobile-shell', mobile);
  panel.classList.toggle('directive-spine-compact', shellLayout.spineMode === 'compact');
  panel.classList.toggle('directive-spine-expanded', shellLayout.spineMode === 'expanded');
  panel.classList.toggle('directive-drawer-density-compact', density === 'compact');
  panel.classList.toggle('directive-drawer-density-standard', density === 'standard');
  panel.classList.toggle('directive-drawer-density-wide', density === 'wide');

  setStyleProperty(panel, '--directive-spine-width', `${spineWidth}px`);
  setStyleProperty(panel, '--directive-shell-left', `${shellLayout.shelfLeft}px`);
  setStyleProperty(panel, '--directive-shell-top', `${shellLayout.shelfTop}px`);
  setStyleProperty(panel, '--directive-drawer-width', `${shellLayout.drawerWidth}px`);
  setStyleProperty(panel, '--directive-drawer-height', `${shellLayout.drawerHeight}px`);

  const drawer = panel.querySelector('.directive-command-drawer');
  if (drawer) {
    drawer.hidden = !visualDrawerOpen;
    drawer.setAttribute('aria-hidden', visualDrawerOpen ? 'false' : 'true');
    drawer.setAttribute('role', shellLayout.fullscreen ? 'dialog' : 'region');
    drawer.setAttribute('aria-modal', shellLayout.fullscreen ? 'true' : 'false');
    if (drawer.style) {
      drawer.style.width = mobile ? '' : `${shellLayout.drawerWidth}px`;
      drawer.style.height = mobile ? '' : `${shellLayout.drawerHeight}px`;
    }
  }

  if (persist) persistLayout();
  return shellLayout;
}

function syncShellChrome(panel = getPanel()) {
  if (!panel) return;
  const route = getDirectiveRoute(activeTab);
  const visualDrawerOpen = getVisualDrawerOpen();

  for (const button of panel.querySelectorAll('.directive-spine-route')) {
    const selected = button.dataset.routeId === activeTab;
    const expanded = selected && visualDrawerOpen;
    button.classList.toggle('directive-spine-route-selected', selected);
    button.classList.toggle('directive-spine-route-active', expanded);
    button.classList.toggle('directive-tab-button-active', expanded);
    button.setAttribute('aria-selected', selected ? 'true' : 'false');
    button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    if (selected) button.setAttribute('aria-current', 'page');
    else button.removeAttribute?.('aria-current');
  }

  for (const button of panel.querySelectorAll('.directive-mobile-bottom-tab')) {
    const selected = button.dataset.mobileRouteId === activeTab;
    button.classList.toggle('directive-mobile-bottom-tab-active', selected);
    button.setAttribute('aria-selected', selected ? 'true' : 'false');
    if (selected) button.setAttribute('aria-current', 'page');
    else button.removeAttribute?.('aria-current');
    button.title = button.dataset.mobileLabel || 'Directive route';
    button.setAttribute('aria-label', button.dataset.mobileLabel || 'Directive route');
    const label = button.querySelector('.directive-mobile-bottom-label');
    if (label) label.textContent = button.dataset.mobileLabel || '';
  }

  const routeTitle = panel.querySelector('.directive-shell-title-label');
  if (routeTitle) routeTitle.textContent = route.label;
  const routeDetail = panel.querySelector('[data-directive-current-route-detail="true"]');
  if (routeDetail) routeDetail.textContent = route.shelfLabel || route.description || 'Command drawer';
  const contextValue = panel.querySelector('[data-directive-current-route="true"]');
  if (contextValue) contextValue.textContent = route.label;

  const titleIcon = panel.querySelector('.directive-runtime-title-icon');
  if (titleIcon && String(titleIcon.tagName || '').toLowerCase() !== 'img') {
    titleIcon.className = `${route.icon || 'fa-solid fa-compass'} directive-runtime-title-icon`;
  }

  const fullscreenControl = panel.querySelector('[data-shell-action="fullscreen"]');
  if (fullscreenControl) {
    const workspaceRequired = fullscreenMode === 'workspace';
    const expanded = shellLayout.fullscreen === true;
    const label = workspaceRequired
      ? 'Full-screen workspace required for Character Creator'
      : expanded
        ? 'Restore resizable drawer'
        : 'Open full-screen workspace';
    fullscreenControl.title = label;
    fullscreenControl.setAttribute('aria-label', label);
    fullscreenControl.disabled = workspaceRequired;
    fullscreenControl.setAttribute('aria-disabled', workspaceRequired ? 'true' : 'false');
    const icon = fullscreenControl.querySelector('.directive-command-drawer-action-icon');
    if (icon && String(icon.tagName || '').toLowerCase() !== 'img') {
      icon.className = `${expanded ? 'fa-solid fa-compress' : 'fa-solid fa-expand'} directive-command-drawer-action-icon`;
    }
  }

  const collapseControl = panel.querySelector('[data-shell-action="collapse"]');
  if (collapseControl) {
    const mobile = isMobileRuntime();
    const label = mobile ? 'Close Directive' : 'Close active drawer';
    collapseControl.title = label;
    collapseControl.setAttribute('aria-label', label);
    const icon = collapseControl.querySelector('.directive-command-drawer-action-icon');
    if (icon && String(icon.tagName || '').toLowerCase() !== 'img') {
      icon.className = `${mobile ? 'fa-solid fa-xmark' : 'fa-solid fa-chevron-left'} directive-command-drawer-action-icon`;
    }
  }

  const densityControl = panel.querySelector('[data-shell-action="density"]');
  if (densityControl) {
    const expanded = shellLayout.spineMode === 'expanded';
    const label = expanded ? 'Use compact Directive shelf' : 'Expand Directive shelf labels';
    densityControl.title = label;
    densityControl.setAttribute('aria-label', label);
    const icon = densityControl.querySelector('i');
    if (icon) icon.className = expanded ? 'fa-solid fa-angles-left' : 'fa-solid fa-angles-right';
  }

  const status = panel.querySelector('.directive-command-drawer-status');
  if (status) {
    status.textContent = fullscreenMode === 'workspace'
      ? 'WORKSPACE REQUIRED'
      : shellLayout.fullscreen
        ? 'FULL-SCREEN WORKSPACE'
        : 'DRAWER ONLINE';
  }
}

function createPanel() {
  const panel = createDirectiveCommandSpineShell({
    id: DIRECTIVE_RUNTIME_PANEL_ID,
    title: 'Directive',
    label: 'Directive command spine and drawer',
    routes: DIRECTIVE_PRIMARY_ROUTES,
    activeRouteId: activeTab,
    drawerOpen: shellLayout.drawerOpen,
    fullscreen: shellLayout.fullscreen,
    spineMode: shellLayout.spineMode,
    onSelectRoute: (routeId) => selectRouteFromSpine(routeId),
    onCollapseDrawer: () => (isMobileRuntime() ? hideDirectiveRuntimePanel() : collapseDirectiveRuntimeDrawer()),
    onToggleFullscreen: () => toggleDirectiveRuntimeFullscreen(),
    onToggleSpineMode: () => toggleDirectiveSpineMode(),
    onCloseShell: () => hideDirectiveRuntimePanel(),
    onResizeStart: (event) => startDirectiveDrawerResize(event),
    onShelfDragStart: (event) => startDirectiveShelfDrag(event)
  });
  applyShellLayout(panel);
  syncShellChrome(panel);
  return panel;
}

function installGlobalShellListeners() {
  if (!canUseDocument()) return;
  if (!keydownListenerInstalled && typeof document.addEventListener === 'function') {
    document.addEventListener('keydown', onDirectiveShellKeydown);
    keydownListenerInstalled = true;
  }
  if (!viewportListenerInstalled && typeof globalThis.addEventListener === 'function') {
    globalThis.addEventListener('resize', onDirectiveViewportResize);
    viewportListenerInstalled = true;
  }
}

function ensurePanel() {
  if (!canUseDocument()) return null;
  let panel = getPanel();
  if (!panel) {
    panel = createPanel();
    runtimeHost()?.appendChild(panel);
  }
  installGlobalShellListeners();
  return panel;
}

async function getRuntimeView() {
  if (!runtimeApp || typeof runtimeApp.getCurrentView !== 'function') return null;
  return runtimeApp.getCurrentView({ tabId: activeTab });
}

function setActiveRoute(routeId, { openDrawer = true, persist = true } = {}) {
  const nextTab = normalizeDirectiveRouteId(routeId, activeTab);
  activeTab = nextTab;
  shellLayout.activeRoute = nextTab;
  if (openDrawer) shellLayout.drawerOpen = true;
  if (fullscreenMode === 'workspace' && nextTab !== 'starships') {
    fullscreenMode = 'none';
    shellLayout.fullscreen = false;
  }
  const panel = getPanel();
  applyShellLayout(panel, { persist });
  syncShellChrome(panel);
  return nextTab;
}

async function selectRouteFromSpine(routeId) {
  const nextTab = normalizeDirectiveRouteId(routeId, activeTab);
  const sameRoute = nextTab === activeTab;
  const mobile = isMobileRuntime();

  if (!mobile && sameRoute && shellLayout.drawerOpen && fullscreenMode === 'none') {
    return collapseDirectiveRuntimeDrawer();
  }

  activeTab = nextTab;
  shellLayout.activeRoute = nextTab;
  shellLayout.drawerOpen = true;
  if (fullscreenMode === 'workspace' && nextTab !== 'starships') {
    fullscreenMode = 'none';
    shellLayout.fullscreen = false;
  }
  persistLayout();
  await refreshDirectiveRuntimePanel();
  return { activeTab, drawerOpen: true };
}

async function navigateToRoute(routeId, { openDrawer = true } = {}) {
  setActiveRoute(routeId, { openDrawer, persist: true });
  await refreshDirectiveRuntimePanel();
  return { activeTab, drawerOpen: shellLayout.drawerOpen };
}

function createRuntimeActions() {
  return {
    setActiveTab(tabId) {
      setActiveRoute(tabId, { openDrawer: true, persist: true });
    },
    refresh: refreshDirectiveRuntimePanel,
    importStarshipPackageArchive(options) {
      return runtimeApp.importStarshipPackageArchive(options);
    },
    startCreatorDraft(options) {
      return runtimeApp.startCreatorDraft(options);
    },
    resumeCreatorDraft(options) {
      return runtimeApp.resumeCreatorDraft(options);
    },
    saveCreatorDraft(options) {
      return runtimeApp.saveCreatorDraft(options);
    },
    cancelCreatorDraft() {
      return runtimeApp.cancelCreatorDraft();
    },
    acceptCreatorDraftAndStartCampaign(options) {
      return runtimeApp.acceptCreatorDraftAndStartCampaign(options);
    },
    loadGame(options) {
      return runtimeApp.loadGame(options);
    },
    saveCurrentGame(options) {
      return runtimeApp.saveCurrentGame(options);
    },
    saveCurrentGameAs(options) {
      return runtimeApp.saveCurrentGameAs(options);
    },
    refreshStorageDiagnostics() {
      return runtimeApp.refreshStorageDiagnostics();
    },
    verifyActiveSave() {
      return runtimeApp.verifyActiveSave();
    },
    settleActiveState() {
      return runtimeApp.settleActiveState();
    },
    exportActiveSave() {
      return runtimeApp.exportActiveSave();
    },
    cleanMissingStorageRecords() {
      return runtimeApp.cleanMissingStorageRecords();
    },
    previewDirectorTurn(options) {
      return runtimeApp.previewDirectorTurn(options);
    },
    commitProvisionalDirectorTurn(options) {
      return runtimeApp.commitProvisionalDirectorTurn(options);
    },
    discardProvisionalDirectorTurn() {
      return runtimeApp.discardProvisionalDirectorTurn();
    },
    previewOutcomeReplacement(options) {
      return runtimeApp.previewOutcomeReplacement(options);
    },
    deleteCommittedOutcome(options) {
      return runtimeApp.deleteCommittedOutcome(options);
    },
    commitOpenOrdersCandidateReview(options) {
      return runtimeApp.commitOpenOrdersCandidateReview(options);
    },
    commitSideMissionOpportunityReview(options) {
      return runtimeApp.commitSideMissionOpportunityReview(options);
    },
    runSideMissionProviderAssistance(options) {
      return runtimeApp.runSideMissionProviderAssistance(options);
    },
    startSideMissionOpportunityScene(options) {
      return runtimeApp.startSideMissionOpportunityScene(options);
    },
    commitSideMissionOpportunitySceneBeat(options) {
      return runtimeApp.commitSideMissionOpportunitySceneBeat(options);
    },
    commitSideMissionOpportunityResolution(options) {
      return runtimeApp.commitSideMissionOpportunityResolution(options);
    },
    startOpenOrdersAssignmentScene(options) {
      return runtimeApp.startOpenOrdersAssignmentScene(options);
    },
    commitOpenOrdersAssignmentSceneBeat(options) {
      return runtimeApp.commitOpenOrdersAssignmentSceneBeat(options);
    },
    commitOpenOrdersAssignmentResolution(options) {
      return runtimeApp.commitOpenOrdersAssignmentResolution(options);
    },
    retryNarrationForLastTurn(options) {
      return runtimeApp.retryNarrationForLastTurn(options);
    }
  };
}

function renderActivePanel(body, view) {
  const actions = createRuntimeActions();
  if (activeTab === 'starships' && view?.activeScreen === 'creator' && view?.creator) {
    renderCharacterCreatorPanel(body, view, actions);
    return;
  }
  if (activeTab === 'starships') {
    renderStarshipsPanel(body, view, actions);
    return;
  }
  if (activeTab === 'mission') {
    renderMissionPanel(body, view, actions);
    return;
  }
  if (activeTab === 'crew') {
    renderCrewPanel(body, view, actions);
    return;
  }
  if (activeTab === 'ship') {
    renderShipPanel(body, view, actions);
    return;
  }
  if (activeTab === 'log') {
    renderCommandLogPanel(body, view, actions);
    return;
  }
  if (activeTab === 'settings') {
    renderSettingsPanel(body, view, actions);
    return;
  }
  appendSectionTitle(body, tabLabel(activeTab));
  appendEmpty(body, 'No panel loaded.');
}

function syncRequiredWorkspace(panel, view) {
  const requiresWorkspace = activeTab === 'starships'
    && view?.activeScreen === 'creator'
    && Boolean(view?.creator);

  if (requiresWorkspace && fullscreenMode !== 'workspace') {
    fullscreenMode = 'workspace';
    shellLayout.fullscreen = true;
    shellLayout.drawerOpen = true;
    applyShellLayout(panel);
    syncShellChrome(panel);
  } else if (!requiresWorkspace && fullscreenMode === 'workspace') {
    fullscreenMode = 'none';
    shellLayout.fullscreen = false;
    applyShellLayout(panel);
    syncShellChrome(panel);
  }

  panel.dataset.workspaceRequired = requiresWorkspace ? 'true' : 'false';
}

async function renderBody(panel) {
  const body = panel.querySelector('[data-directive-runtime-body="true"]');
  if (!body) return;
  clearElement(body);

  let view = null;
  try {
    view = await getRuntimeView();
  } catch (error) {
    syncRequiredWorkspace(panel, null);
    appendSectionTitle(body, tabLabel(activeTab));
    appendEmpty(body, error?.message || String(error));
    return;
  }

  syncRequiredWorkspace(panel, view);
  renderActivePanel(body, view);
}

function onDirectiveShellKeydown(event) {
  if (event?.key !== 'Escape' || event?.defaultPrevented) return;
  const panel = getPanel();
  if (!panel || panel.hidden === true) return;
  const targetTag = String(event.target?.tagName || '').toUpperCase();
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(targetTag) || event.target?.isContentEditable) return;

  if (fullscreenMode === 'manual') {
    fullscreenMode = 'none';
    shellLayout.fullscreen = false;
    applyShellLayout(panel);
    syncShellChrome(panel);
  } else if (shellLayout.drawerOpen || shellLayout.fullscreen) {
    collapseDirectiveRuntimeDrawer();
  } else {
    return;
  }
  event.preventDefault?.();
  event.stopPropagation?.();
}

function onDirectiveViewportResize() {
  const panel = getPanel();
  if (!panel) return;
  applyShellLayout(panel, { persist: true });
  syncShellChrome(panel);
}

function shouldIgnoreShelfDragStart(event) {
  const target = event?.target;
  return target?.closest?.(
    'button, a, input, textarea, select, [contenteditable="true"], [data-shell-action], [data-directive-drawer-resize-handle]'
  );
}

function startDirectiveShelfDrag(event) {
  const panel = getPanel();
  if (!panel || isMobileRuntime() || shellLayout.fullscreen || fullscreenMode !== 'none') return;
  if (event?.button !== undefined && event.button !== 0) return;
  if (shouldIgnoreShelfDragStart(event)) return;

  const rect = panel.getBoundingClientRect?.();
  isDraggingShelf = true;
  shelfDragStartX = Number(event?.clientX) || 0;
  shelfDragStartY = Number(event?.clientY) || 0;
  shelfDragStartLeft = Number(rect?.left);
  shelfDragStartTop = Number(rect?.top);
  if (!Number.isFinite(shelfDragStartLeft)) shelfDragStartLeft = Number(shellLayout.shelfLeft) || 0;
  if (!Number.isFinite(shelfDragStartTop)) shelfDragStartTop = Number(shellLayout.shelfTop) || 0;
  panel.classList.add('directive-command-shell-dragging');
  event?.preventDefault?.();
  event?.stopPropagation?.();
  event?.currentTarget?.setPointerCapture?.(event.pointerId);

  document.addEventListener?.('pointermove', moveDirectiveShelfDrag);
  document.addEventListener?.('pointerup', endDirectiveShelfDrag);
  document.addEventListener?.('pointercancel', endDirectiveShelfDrag);
}

function moveDirectiveShelfDrag(event) {
  if (!isDraggingShelf) return;
  const panel = getPanel();
  if (!panel) return;

  const requestedLeft = shelfDragStartLeft + ((Number(event?.clientX) || 0) - shelfDragStartX);
  const requestedTop = shelfDragStartTop + ((Number(event?.clientY) || 0) - shelfDragStartY);
  shellLayout = constrainDirectiveShellLayout({
    ...shellLayout,
    shelfLeft: requestedLeft,
    shelfTop: requestedTop,
    fullscreen: false
  }, currentViewport());
  shellLayout.activeRoute = activeTab;
  applyShellLayout(panel);
  syncShellChrome(panel);
  event?.preventDefault?.();
}

function endDirectiveShelfDrag() {
  if (!isDraggingShelf) return;
  isDraggingShelf = false;
  getPanel()?.classList.remove('directive-command-shell-dragging');
  persistLayout();
  document.removeEventListener?.('pointermove', moveDirectiveShelfDrag);
  document.removeEventListener?.('pointerup', endDirectiveShelfDrag);
  document.removeEventListener?.('pointercancel', endDirectiveShelfDrag);
}

function startDirectiveDrawerResize(event) {
  const panel = getPanel();
  const drawer = panel?.querySelector('.directive-command-drawer');
  if (!panel || !drawer || isMobileRuntime() || shellLayout.fullscreen) return;
  if (event?.button !== undefined && event.button !== 0) return;

  const rect = drawer.getBoundingClientRect?.();
  isResizingDrawer = true;
  resizeStartX = Number(event?.clientX) || 0;
  resizeStartY = Number(event?.clientY) || 0;
  resizeStartWidth = Number(rect?.width) || shellLayout.drawerWidth;
  resizeStartHeight = Number(rect?.height) || shellLayout.drawerHeight;
  drawer.classList.add('directive-command-drawer-resizing');
  event?.preventDefault?.();
  event?.stopPropagation?.();
  event?.currentTarget?.setPointerCapture?.(event.pointerId);

  document.addEventListener?.('pointermove', moveDirectiveDrawerResize);
  document.addEventListener?.('pointerup', endDirectiveDrawerResize);
  document.addEventListener?.('pointercancel', endDirectiveDrawerResize);
}

function moveDirectiveDrawerResize(event) {
  if (!isResizingDrawer) return;
  const panel = getPanel();
  if (!panel) return;

  const requestedWidth = resizeStartWidth + ((Number(event?.clientX) || 0) - resizeStartX);
  const requestedHeight = resizeStartHeight + ((Number(event?.clientY) || 0) - resizeStartY);
  shellLayout = constrainDirectiveShellLayout({
    ...shellLayout,
    drawerWidth: requestedWidth,
    drawerHeight: requestedHeight,
    fullscreen: false
  }, currentViewport());
  shellLayout.activeRoute = activeTab;
  applyShellLayout(panel);
  syncShellChrome(panel);
  event?.preventDefault?.();
}

function endDirectiveDrawerResize() {
  if (!isResizingDrawer) return;
  isResizingDrawer = false;
  const panel = getPanel();
  panel?.querySelector('.directive-command-drawer')?.classList.remove('directive-command-drawer-resizing');
  persistLayout();
  document.removeEventListener?.('pointermove', moveDirectiveDrawerResize);
  document.removeEventListener?.('pointerup', endDirectiveDrawerResize);
  document.removeEventListener?.('pointercancel', endDirectiveDrawerResize);
}

export function setDirectiveRuntimeApp(app) {
  runtimeApp = app || null;
}

export async function showDirectiveRuntimePanel() {
  const panel = ensurePanel();
  if (!panel) return { isOpen: false };
  panel.hidden = false;
  panel.classList.add('directive-runtime-panel-open');
  applyShellLayout(panel);
  syncShellChrome(panel);
  await refreshDirectiveRuntimePanel();
  return {
    isOpen: true,
    activeTab,
    drawerOpen: getVisualDrawerOpen(),
    layout: { ...shellLayout }
  };
}

export function hideDirectiveRuntimePanel() {
  const panel = getPanel();
  if (!panel) return { isOpen: false };
  fullscreenMode = 'none';
  shellLayout.fullscreen = false;
  panel.hidden = true;
  panel.classList.remove('directive-runtime-panel-open', 'directive-runtime-fullscreen');
  return { isOpen: false, activeTab };
}

export async function refreshDirectiveRuntimePanel() {
  const panel = ensurePanel();
  if (!panel) return { refreshed: false, activeTab };
  applyDirectiveTheme(panel, getDirectiveThemePack());
  applyShellLayout(panel);
  syncShellChrome(panel);
  await renderBody(panel);
  applyShellLayout(panel);
  syncShellChrome(panel);
  return {
    refreshed: true,
    activeTab,
    drawerOpen: getVisualDrawerOpen(),
    fullscreen: shellLayout.fullscreen
  };
}

export async function setDirectiveRuntimeTab(tabId) {
  const requestedTab = String(tabId || '').trim();
  const nextTab = normalizeDirectiveRouteId(requestedTab, '');
  if (!nextTab) throw new Error(`Unknown Directive runtime tab "${requestedTab}"`);
  return navigateToRoute(nextTab, { openDrawer: true });
}

export function collapseDirectiveRuntimeDrawer() {
  shellLayout.drawerOpen = false;
  shellLayout.fullscreen = false;
  fullscreenMode = 'none';
  persistLayout();
  const panel = getPanel();
  applyShellLayout(panel);
  syncShellChrome(panel);
  return { activeTab, drawerOpen: false, fullscreen: false };
}

export async function toggleDirectiveRuntimeDrawer(tabId = activeTab) {
  return selectRouteFromSpine(tabId);
}

export function toggleDirectiveRuntimeFullscreen(force) {
  if (fullscreenMode === 'workspace') {
    return { fullscreen: true, required: true };
  }
  const next = typeof force === 'boolean' ? force : fullscreenMode !== 'manual';
  fullscreenMode = next ? 'manual' : 'none';
  shellLayout.fullscreen = next;
  if (next) shellLayout.drawerOpen = true;
  const panel = getPanel();
  applyShellLayout(panel);
  syncShellChrome(panel);
  return { fullscreen: next, required: false };
}

export function toggleDirectiveSpineMode() {
  shellLayout.spineMode = shellLayout.spineMode === 'expanded' ? 'compact' : 'expanded';
  persistLayout();
  const panel = getPanel();
  applyShellLayout(panel);
  syncShellChrome(panel);
  return { spineMode: shellLayout.spineMode };
}

export async function resetDirectiveRuntimeLayout() {
  endDirectiveShelfDrag();
  endDirectiveDrawerResize();
  resetDirectiveRouteUiState();
  if (typeof runtimeApp?.resetRuntimeUiState === 'function') {
    await runtimeApp.resetRuntimeUiState();
  }
  shellLayout = resetDirectiveShellLayout(currentViewport());
  activeTab = normalizeDirectiveRouteId(shellLayout.activeRoute, 'starships');
  shellLayout.activeRoute = activeTab;
  fullscreenMode = 'none';
  const panel = getPanel();
  if (panel) {
    applyShellLayout(panel);
    syncShellChrome(panel);
    if (panel.hidden !== true) await refreshDirectiveRuntimePanel();
  }
  return { reset: true, activeTab, layout: { ...shellLayout } };
}

export const __directiveRuntimeShellTestHooks = Object.freeze({
  getActiveTab() {
    return activeTab;
  },
  getLayout() {
    return { ...shellLayout };
  },
  getFullscreenMode() {
    return fullscreenMode;
  },
  reset() {
    endDirectiveShelfDrag();
    endDirectiveDrawerResize();
    shellLayout = resetDirectiveShellLayout(currentViewport());
    activeTab = 'starships';
    shellLayout.activeRoute = activeTab;
    runtimeApp = null;
    fullscreenMode = 'none';
    if (canUseDocument()) {
      getPanel()?.remove();
      if (keydownListenerInstalled) {
        document.removeEventListener?.('keydown', onDirectiveShellKeydown);
        keydownListenerInstalled = false;
      }
    }
    if (viewportListenerInstalled) {
      globalThis.removeEventListener?.('resize', onDirectiveViewportResize);
      viewportListenerInstalled = false;
    }
  }
});
