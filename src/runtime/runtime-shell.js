import { renderCharacterCreatorPanel } from '../ui/character-creator-panel.js';
import { renderCommandLogPanel } from '../ui/command-log-panel.js';
import { renderCrewPanel, resetCrewPanelState } from '../ui/crew-panel.js';
import { renderMissionPanel } from '../ui/mission-panel.js';
import {
  highlightDirectivePresetSettingsCard,
  renderSettingsPanel,
  resetSettingsPanelState,
  selectDirectivePresetSettingsSection
} from '../ui/settings-panel.js';
import { renderShipPanel } from '../ui/ship-panel.js';
import { renderCampaignPanel, resetCampaignPanelState } from '../ui/campaign-panel.js';
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
  DIRECTIVE_BUNDLED_ICON_PACKS,
  resolveDirectiveIconSlot
} from '../theme/directive-icon-packs.mjs';
import {
  addTooltip,
  appendEmpty,
  appendSectionTitle,
  clearElement,
  createElement,
  createIcon
} from '../ui/runtime-ui-kit.js';
import { appendDirectiveOverlay } from '../ui/directive-overlay-root.js';
import {
  buildDirectiveTrainingScenarioView,
  isDirectiveTrainingScenarioView
} from '../guidance/directive-training-scenario.mjs';
import {
  closeDirectiveGuidance,
  resetDirectiveGuidanceProgress,
  runDirectiveGuidanceStartupOffer as runGuidanceStartupOffer,
  setDirectiveGuidancePreference,
  showDirectiveGuidanceTip,
  showDirectiveGuidanceTutorial
} from '../guidance/directive-guidance.js';
import { OUTCOME_INTEGRITY_EDIT_ACTION_ID } from './outcome-integrity.mjs';

export const DIRECTIVE_RUNTIME_PANEL_ID = 'directive-runtime-panel';

export const DIRECTIVE_RUNTIME_TABS = Object.freeze(DIRECTIVE_PRIMARY_ROUTES.map((route) => ({
  id: route.id,
  label: route.label
})));

let shellLayout = loadDirectiveShellLayout();
let activeTab = normalizeDirectiveRouteId(shellLayout.activeRoute, 'campaign');
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
let runtimeMountHost = null;
let lastRenderedTab = '';
let renderBodyRequestId = 0;
let trainingScenarioSession = null;

function canUseDocument() {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

function tabLabel(tabId) {
  return getDirectiveRouteLabel(tabId);
}

function getPanel() {
  return canUseDocument() ? document.getElementById(DIRECTIVE_RUNTIME_PANEL_ID) : null;
}

function runtimeScrollContainers(panel) {
  const seen = new Set();
  const selectors = [
    '[data-directive-runtime-body="true"]',
    '.directive-command-drawer-body'
  ];
  const containers = [];
  for (const selector of selectors) {
    for (const element of panel?.querySelectorAll?.(selector) || []) {
      if (!element || seen.has(element)) continue;
      seen.add(element);
      containers.push(element);
    }
  }
  return containers;
}

function captureRuntimeScroll(panel) {
  return runtimeScrollContainers(panel).map((element, index) => ({
    index,
    top: Number(element.scrollTop) || 0,
    left: Number(element.scrollLeft) || 0
  }));
}

function restoreRuntimeScroll(panel, snapshot = []) {
  if (!snapshot.length) return;
  const containers = runtimeScrollContainers(panel);
  const apply = () => {
    for (const entry of snapshot) {
      const element = containers[entry.index];
      if (!element) continue;
      element.scrollTop = entry.top;
      element.scrollLeft = entry.left;
    }
  };
  apply();
  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(apply);
  }
}

function runtimeHost() {
  return runtimeMountHost || document.body || document.documentElement;
}

function outcomeIntegrityEditorHost() {
  if (!canUseDocument()) return { element: runtimeHost(), mount: 'viewport' };
  const chatSurface = document.getElementById('sheld') || document.querySelector('#chat')?.parentElement || document.querySelector('#chat');
  const rect = chatSurface?.getBoundingClientRect?.();
  if (chatSurface && Number(rect?.width) >= 320 && Number(rect?.height) >= 320) {
    return { element: chatSurface, mount: 'chat' };
  }
  return { element: runtimeHost(), mount: 'viewport' };
}

function setStyleProperty(element, property, value) {
  element?.style?.setProperty?.(property, value);
}

function syncSemanticIconElement(element, { slot = '', fallbackClass = '', className = '' } = {}) {
  if (!element) return;
  const descriptor = resolveDirectiveIconSlot(DIRECTIVE_BUNDLED_ICON_PACKS[0], slot);
  if (descriptor.type === 'mask' && (descriptor.glyph || descriptor.value)) {
    element.className = `directive-vector-glyph${className ? ` ${className}` : ''}`;
    element.dataset.glyph = descriptor.glyph || descriptor.value;
    element.dataset.iconSlot = slot || descriptor.slot || '';
    element.setAttribute?.('aria-hidden', 'true');
    return;
  }
  if (descriptor.type === 'image' && descriptor.value) {
    element.className = className;
    element.src = descriptor.value;
    element.alt = '';
    element.draggable = false;
    element.setAttribute?.('draggable', 'false');
    element.dataset.iconSlot = slot || descriptor.slot || '';
    return;
  }
  element.className = `${descriptor.value || fallbackClass || 'fa-solid fa-circle'}${className ? ` ${className}` : ''}`;
  element.dataset.iconSlot = slot || descriptor.slot || '';
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
  resetCampaignPanelState();
  resetCrewPanelState();
  resetSettingsPanelState();
}

function isTrainingScenarioActive() {
  return trainingScenarioSession?.active === true;
}

function tutorialUsesTrainingScenario(tutorial = null) {
  return tutorial?.trainingScenario !== false;
}

function startDirectiveTrainingScenario({
  tutorial = null,
  tutorialId = '',
  stepId = '',
  stepIndex = 0
} = {}) {
  if (!tutorialUsesTrainingScenario(tutorial)) {
    stopDirectiveTrainingScenario({ refresh: false });
    return { active: false };
  }
  const prior = trainingScenarioSession || {
    previousRoute: activeTab,
    previousDrawerOpen: shellLayout.drawerOpen,
    previousFullscreenMode: fullscreenMode
  };
  trainingScenarioSession = {
    active: true,
    tutorialId: tutorialId || tutorial?.id || '',
    stepId,
    stepIndex: Math.max(0, Number(stepIndex) || 0),
    previousRoute: prior.previousRoute || activeTab,
    previousDrawerOpen: prior.previousDrawerOpen === true,
    previousFullscreenMode: prior.previousFullscreenMode || 'none'
  };
  return { active: true, ...trainingScenarioSession };
}

function updateDirectiveTrainingScenarioStep({
  tutorialId = '',
  stepId = '',
  stepIndex = 0
} = {}) {
  if (!isTrainingScenarioActive()) return { active: false };
  trainingScenarioSession = {
    ...trainingScenarioSession,
    tutorialId: tutorialId || trainingScenarioSession.tutorialId || '',
    stepId,
    stepIndex: Math.max(0, Number(stepIndex) || 0)
  };
  return { active: true, ...trainingScenarioSession };
}

function stopDirectiveTrainingScenario({ refresh = true, restoreRoute = true } = {}) {
  if (!isTrainingScenarioActive()) return { stopped: false };
  const session = trainingScenarioSession;
  trainingScenarioSession = null;
  if (restoreRoute && session.previousRoute) {
    activeTab = normalizeDirectiveRouteId(session.previousRoute, activeTab);
    shellLayout.activeRoute = activeTab;
    shellLayout.drawerOpen = session.previousDrawerOpen;
    fullscreenMode = session.previousFullscreenMode || 'none';
    shellLayout.fullscreen = fullscreenMode !== 'none';
  }
  const panel = getPanel();
  if (panel) {
    applyShellLayout(panel);
    syncShellChrome(panel);
    if (refresh && panel.hidden !== true) {
      void refreshDirectiveRuntimePanel({ preserveScroll: false });
    }
  }
  return { stopped: true };
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
    const labelText = button.dataset.mobileLabel || 'Directive route';
    const tooltip = button.dataset.mobileTooltip || button.dataset.routeDetail || labelText;
    button.setAttribute('aria-label', labelText);
    addTooltip(button, tooltip, { showOnHover: false, showOnFocus: false });
    const label = button.querySelector('.directive-mobile-bottom-label');
    if (label) label.textContent = button.dataset.mobileLabel || '';
  }

  const routeTitle = panel.querySelector('.directive-shell-title-label');
  if (routeTitle) routeTitle.textContent = route.label;
  const routeDetail = panel.querySelector('[data-directive-current-route-detail="true"]');
  if (routeDetail) routeDetail.textContent = route.shelfLabel || route.description || 'Command drawer';
  const contextValue = panel.querySelector('[data-directive-current-route="true"]');
  if (contextValue) contextValue.textContent = route.label;
  const body = panel.querySelector('[data-directive-runtime-body="true"]');
  if (body) body.dataset.directiveTour = `route-body.${activeTab}`;

  const titleIcon = panel.querySelector('.directive-runtime-title-icon');
  syncSemanticIconElement(titleIcon, {
    slot: route.iconSlot || `route.${route.id || ''}`,
    fallbackClass: route.icon || 'fa-solid fa-compass',
    className: 'directive-runtime-title-icon'
  });

  const fullscreenControl = panel.querySelector('[data-shell-action="fullscreen"]');
  if (fullscreenControl) {
    const workspaceRequired = fullscreenMode === 'workspace';
    const expanded = shellLayout.fullscreen === true;
    const label = workspaceRequired
      ? 'Full-screen workspace required for Character Creator'
      : expanded
        ? 'Restore resizable drawer'
        : 'Open full-screen workspace';
    fullscreenControl.setAttribute('aria-label', label);
    addTooltip(fullscreenControl, label);
    fullscreenControl.disabled = workspaceRequired;
    fullscreenControl.setAttribute('aria-disabled', workspaceRequired ? 'true' : 'false');
    const icon = fullscreenControl.querySelector('.directive-command-drawer-action-icon');
    syncSemanticIconElement(icon, {
      slot: expanded ? 'action.restore' : 'action.fullscreen',
      fallbackClass: expanded ? 'fa-regular fa-window-restore' : 'fa-regular fa-window-maximize',
      className: 'directive-command-drawer-action-icon'
    });
  }

  const collapseControl = panel.querySelector('[data-shell-action="collapse"]');
  if (collapseControl) {
    const mobile = isMobileRuntime();
    const label = mobile ? 'Close Directive' : 'Close active drawer';
    collapseControl.setAttribute('aria-label', label);
    addTooltip(collapseControl, label);
    const icon = collapseControl.querySelector('.directive-command-drawer-action-icon');
    syncSemanticIconElement(icon, {
      slot: 'action.close',
      fallbackClass: 'fa-solid fa-xmark',
      className: 'directive-command-drawer-action-icon'
    });
  }

  const densityControl = panel.querySelector('[data-shell-action="density"]');
  if (densityControl) {
    const expanded = shellLayout.spineMode === 'expanded';
    const label = expanded ? 'Hide shelf labels' : 'Show shelf labels';
    densityControl.setAttribute('aria-label', label);
    addTooltip(densityControl, label);
    const icon = densityControl.querySelector('.directive-spine-control-icon');
    syncSemanticIconElement(icon, {
      slot: expanded ? 'action.densityCompact' : 'action.densityExpanded',
      fallbackClass: expanded ? 'fa-solid fa-outdent' : 'fa-solid fa-indent',
      className: 'directive-spine-control-icon'
    });
  }

  const status = panel.querySelector('.directive-command-drawer-status');
  if (status) {
    const statusText = fullscreenMode === 'workspace'
      ? 'WORKSPACE REQUIRED'
      : shellLayout.fullscreen
        ? 'FULL-SCREEN WORKSPACE'
        : '';
    status.textContent = statusText;
    status.hidden = !statusText;
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
  const baseView = runtimeApp && typeof runtimeApp.getCurrentView === 'function'
    ? await runtimeApp.getCurrentView({ tabId: activeTab })
    : null;
  if (isTrainingScenarioActive()) {
    return buildDirectiveTrainingScenarioView({
      baseView,
      activeTab,
      tutorialId: trainingScenarioSession.tutorialId,
      stepId: trainingScenarioSession.stepId
    });
  }
  return baseView;
}

function setActiveRoute(routeId, { openDrawer = true, persist = true } = {}) {
  const nextTab = normalizeDirectiveRouteId(routeId, activeTab);
  activeTab = nextTab;
  shellLayout.activeRoute = nextTab;
  if (openDrawer) shellLayout.drawerOpen = true;
  if (fullscreenMode === 'workspace' && nextTab !== 'campaign') {
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
  if (fullscreenMode === 'workspace' && nextTab !== 'campaign') {
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

function stopTrainingBeforeRealStateChange() {
  if (isTrainingScenarioActive()) {
    stopDirectiveTrainingScenario({ refresh: false, restoreRoute: false });
  }
}

function dispatchMissionComponentOpenSource(result = {}) {
  if (!result?.ok || !canUseDocument()) return;
  const detail = {
    component: result.component || null,
    source: result.source || null
  };
  const event = typeof CustomEvent === 'function'
    ? new CustomEvent('directive:mission-component-open-source', { detail })
    : { type: 'directive:mission-component-open-source', detail };
  document.dispatchEvent?.(event);
}

const TRAINING_INERT_ACTIONS = Object.freeze([
  'importCampaignPackageArchive',
  'startCreatorDraft',
  'resumeCreatorDraft',
  'saveCreatorDraft',
  'generateCreatorSectionDraft',
  'importCreatorPortrait',
  'removeCreatorPortrait',
  'cancelCreatorDraft',
  'returnCreatorToCampaignLibrary',
  'discardCreatorDraft',
  'acceptCreatorDraftAndStartCampaign',
  'importPlayerPortrait',
  'removePlayerPortrait',
  'loadGame',
  'deleteCampaignSave',
  'saveCurrentGame',
  'saveCurrentGameAs',
  'refreshStorageDiagnostics',
  'verifyActiveSave',
  'settleActiveState',
  'exportActiveSave',
  'cleanMissingStorageRecords',
  'previewDirectorTurn',
  'commitProvisionalDirectorTurn',
  'discardProvisionalDirectorTurn',
  'previewOutcomeReplacement',
  'deleteCommittedOutcome',
  'getQuestOpportunities',
  'offerOpenWorldQuest',
  'acceptOpenWorldQuest',
  'activateOpenWorldQuest',
  'pauseOpenWorldQuest',
  'delegateOpenWorldQuest',
  'abandonOpenWorldQuest',
  'travelOpenWorld',
  'advanceOpenWorldTime',
  'retryNarrationForLastTurn',
  'readyCommandBearingPoint',
  'cancelReadiedCommandBearingPoint',
  'recoverCommandBearingPoint',
  'openCampaignChat',
  'hideCampaignSession',
  'showCampaignSession',
  'resolvePendingChatInteraction',
  'resolveTerminalOutcomeDecision',
  'retryCommittedChatResponse',
  'rewriteCampaignIntro',
  'setReconciliationStart',
  'setReconciliationEnd',
  'clearReconciliationMarkers',
  'reconcileMessage',
  'reconcileFromHere',
  'reconcileMarkedPassage',
  'recalculateFromHere',
  'openPendingReconciliation',
  'applyPendingReconciliation',
  'rejectPendingReconciliation',
  'retryCampaignActivation',
  'buildCampaignOpeningScene',
  'rebindCampaignChat',
  'rebuildPromptContext',
  'clearPromptContext',
  'updateRuntimeHistoryLimit',
  'updateRuntimeSettings',
  'updateCampaignDifficulty',
  'updateProviderSettings',
  'updateProviderRoleRouting',
  'resetProviderRoleRouting',
  'testProvider',
  'runFactualGroundingReview',
  'refreshDirectivePresetStatus',
  'updateDirectivePresetAutoCheck',
  'installDirectivePreset',
  'concludeCampaign',
  'archiveCompletedCampaign'
]);

function createTrainingScenarioActions() {
  const actions = {};
  for (const name of TRAINING_INERT_ACTIONS) {
    actions[name] = async () => ({
      ok: true,
      inert: true,
      trainingScenario: true,
      reason: 'tutorial-training-scenario'
    });
  }
  actions.setActiveTab = (tabId) => {
    setActiveRoute(tabId, { openDrawer: true, persist: true });
  };
  actions.refresh = refreshDirectiveRuntimePanel;
  actions.beginGuidanceTutorial = (options = {}) => beginDirectiveGuidanceTutorial(options);
  actions.showGuidanceTip = (options = {}) => showDirectiveRuntimeGuidanceTip(options);
  actions.setGuidancePreference = (options = {}) => updateDirectiveGuidancePreference(options);
  actions.resetGuidanceProgress = () => resetDirectiveGuidanceProgress();
  return actions;
}

function appendTrainingScenarioBanner(body, view) {
  if (!isDirectiveTrainingScenarioView(view)) return;
  const banner = createElement('aside', 'directive-training-scenario-banner');
  banner.dataset.directiveTour = 'tutorial.training-scenario';
  banner.setAttribute('role', 'note');
  addTooltip(banner, 'Tutorial-only populated campaign preview. Real saves, chats, prompts, and providers are not changed.');
  const icon = createElement('span', 'directive-training-scenario-icon');
  icon.appendChild(createIcon('fa-solid fa-graduation-cap'));
  const copy = createElement('span', 'directive-training-scenario-copy');
  const title = createElement('strong');
  title.textContent = view.trainingScenario?.label || 'Training Scenario';
  const summary = createElement('span');
  summary.textContent = view.trainingScenario?.summary || 'Tutorial-only populated campaign preview. No real state is changed.';
  copy.append(title, summary);
  banner.append(icon, copy);
  body.appendChild(banner);
}

function createRuntimeActions() {
  return {
    setActiveTab(tabId) {
      setActiveRoute(tabId, { openDrawer: true, persist: true });
    },
    refresh: refreshDirectiveRuntimePanel,
    importCampaignPackageArchive(options) {
      return runtimeApp.importCampaignPackageArchive(options);
    },
    startCreatorDraft(options) {
      stopTrainingBeforeRealStateChange();
      return runtimeApp.startCreatorDraft(options);
    },
    resumeCreatorDraft(options) {
      stopTrainingBeforeRealStateChange();
      return runtimeApp.resumeCreatorDraft(options);
    },
    saveCreatorDraft(options) {
      return runtimeApp.saveCreatorDraft(options);
    },
    generateCreatorSectionDraft(options) {
      return runtimeApp.generateCreatorSectionDraft(options);
    },
    importCreatorPortrait(options) {
      return runtimeApp.importCreatorPortrait(options);
    },
    removeCreatorPortrait(options) {
      return runtimeApp.removeCreatorPortrait(options);
    },
    cancelCreatorDraft() {
      return runtimeApp.cancelCreatorDraft();
    },
    returnCreatorToCampaignLibrary(options) {
      return runtimeApp.returnCreatorToCampaignLibrary(options);
    },
    discardCreatorDraft(options) {
      return runtimeApp.discardCreatorDraft(options);
    },
    acceptCreatorDraftAndStartCampaign(options) {
      stopTrainingBeforeRealStateChange();
      setActiveRoute('mission', { openDrawer: true, persist: true });
      return runtimeApp.acceptCreatorDraftAndStartCampaign(options);
    },
    importPlayerPortrait(options) {
      return runtimeApp.importPlayerPortrait(options);
    },
    removePlayerPortrait(options) {
      return runtimeApp.removePlayerPortrait(options);
    },
    loadGame(options) {
      stopTrainingBeforeRealStateChange();
      return runtimeApp.loadGame(options);
    },
    deleteCampaignSave(options) {
      return runtimeApp.deleteCampaignSave(options);
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
    getQuestOpportunities(options) {
      return runtimeApp.getQuestOpportunities(options);
    },
    offerOpenWorldQuest(options) {
      return runtimeApp.offerOpenWorldQuest(options);
    },
    acceptOpenWorldQuest(options) {
      return runtimeApp.acceptOpenWorldQuest(options);
    },
    activateOpenWorldQuest(options) {
      return runtimeApp.activateOpenWorldQuest(options);
    },
    pauseOpenWorldQuest(options) {
      return runtimeApp.pauseOpenWorldQuest(options);
    },
    delegateOpenWorldQuest(options) {
      return runtimeApp.delegateOpenWorldQuest(options);
    },
    abandonOpenWorldQuest(options) {
      return runtimeApp.abandonOpenWorldQuest(options);
    },
    travelOpenWorld(options) {
      return runtimeApp.travelOpenWorld(options);
    },
    advanceOpenWorldTime(options) {
      return runtimeApp.advanceOpenWorldTime(options);
    },
    captureMissionComponentSelection(options) {
      return runtimeApp.captureMissionComponentSelection(options);
    },
    saveMissionComponent(options) {
      return runtimeApp.saveMissionComponent(options);
    },
    updateMissionComponent(options) {
      return runtimeApp.updateMissionComponent(options);
    },
    archiveMissionComponent(options) {
      return runtimeApp.archiveMissionComponent(options);
    },
    async openMissionComponentSource(options) {
      const result = await runtimeApp.openMissionComponentSource(options);
      dispatchMissionComponentOpenSource(result);
      return result;
    },
    retryNarrationForLastTurn(options) {
      return runtimeApp.retryNarrationForLastTurn(options);
    },
    readyCommandBearingPoint(options) {
      return runtimeApp.readyCommandBearingPoint(options);
    },
    cancelReadiedCommandBearingPoint(options) {
      return runtimeApp.cancelReadiedCommandBearingPoint(options);
    },
    recoverCommandBearingPoint(options) {
      return runtimeApp.recoverCommandBearingPoint(options);
    },
    openCampaignChat(options) {
      stopTrainingBeforeRealStateChange();
      return runtimeApp.openCampaignChat(options);
    },
    hideCampaignSession(options) {
      return runtimeApp.hideCampaignSession(options);
    },
    showCampaignSession(options) {
      return runtimeApp.showCampaignSession(options);
    },
    resolvePendingChatInteraction(options) {
      return runtimeApp.resolvePendingChatInteraction(options);
    },
    resolveTerminalOutcomeDecision(options) {
      return runtimeApp.resolveTerminalOutcomeDecision(options);
    },
    retryCommittedChatResponse(options) {
      return runtimeApp.retryCommittedChatResponse(options);
    },
    rewriteCampaignIntro(options) {
      return runtimeApp.rewriteCampaignIntro(options);
    },
    setReconciliationStart(options) {
      return runtimeApp.setReconciliationStart(options);
    },
    setReconciliationEnd(options) {
      return runtimeApp.setReconciliationEnd(options);
    },
    clearReconciliationMarkers(options) {
      return runtimeApp.clearReconciliationMarkers(options);
    },
    reconcileMessage(options) {
      return runtimeApp.reconcileMessage(options);
    },
    reconcileFromHere(options) {
      return runtimeApp.reconcileFromHere(options);
    },
    reconcileMarkedPassage(options) {
      return runtimeApp.reconcileMarkedPassage(options);
    },
    recalculateFromHere(options) {
      return runtimeApp.recalculateFromHere(options);
    },
    openPendingReconciliation() {
      return runtimeApp.openPendingReconciliation();
    },
    applyPendingReconciliation(options) {
      return runtimeApp.applyPendingReconciliation(options);
    },
    rejectPendingReconciliation(options) {
      return runtimeApp.rejectPendingReconciliation(options);
    },
    retryCampaignActivation() {
      return runtimeApp.retryCampaignActivation();
    },
    buildCampaignOpeningScene() {
      return runtimeApp.buildCampaignOpeningScene();
    },
    rebindCampaignChat(options) {
      return runtimeApp.rebindCampaignChat(options);
    },
    rebuildPromptContext() {
      return runtimeApp.rebuildPromptContext();
    },
    clearPromptContext(options) {
      return runtimeApp.clearPromptContext(options);
    },
    updateRuntimeHistoryLimit(options) {
      return runtimeApp.updateRuntimeHistoryLimit(options);
    },
    updateRuntimeSettings(options) {
      return runtimeApp.updateRuntimeSettings(options);
    },
    updateCampaignDifficulty(options) {
      return runtimeApp.updateCampaignDifficulty(options);
    },
    updateProviderSettings(options) {
      return runtimeApp.updateProviderSettings(options);
    },
    updateProviderRoleRouting(options) {
      return runtimeApp.updateProviderRoleRouting(options);
    },
    resetProviderRoleRouting(options) {
      return runtimeApp.resetProviderRoleRouting(options);
    },
    testProvider(options) {
      return runtimeApp.testProvider(options);
    },
    runFactualGroundingReview(options) {
      return runtimeApp.runFactualGroundingReview(options);
    },
    refreshDirectivePresetStatus() {
      return runtimeApp.refreshDirectivePresetStatus();
    },
    updateDirectivePresetAutoCheck(options) {
      return runtimeApp.updateDirectivePresetAutoCheck(options);
    },
    installDirectivePreset() {
      return runtimeApp.installDirectivePreset();
    },
    concludeCampaign(options) {
      return runtimeApp.concludeCampaign(options);
    },
    archiveCompletedCampaign() {
      return runtimeApp.archiveCompletedCampaign();
    },
    beginGuidanceTutorial(options = {}) {
      return beginDirectiveGuidanceTutorial(options);
    },
    showGuidanceTip(options = {}) {
      return showDirectiveRuntimeGuidanceTip(options);
    },
    setGuidancePreference(options = {}) {
      return updateDirectiveGuidancePreference(options);
    },
    resetGuidanceProgress() {
      return resetDirectiveGuidanceProgress();
    }
  };
}

function renderActivePanel(body, view) {
  const trainingScenario = isDirectiveTrainingScenarioView(view);
  const actions = trainingScenario ? createTrainingScenarioActions() : createRuntimeActions();
  appendTrainingScenarioBanner(body, view);
  if (activeTab === 'campaign' && view?.activeScreen === 'creator' && view?.creator) {
    renderCharacterCreatorPanel(body, view, actions);
    return;
  }
  if (activeTab === 'campaign') {
    renderCampaignPanel(body, view, actions);
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
  const requiresWorkspace = activeTab === 'campaign'
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
  const requestId = ++renderBodyRequestId;
  const body = panel.querySelector('[data-directive-runtime-body="true"]');
  if (!body) return;
  clearElement(body);

  let view = null;
  try {
    view = await getRuntimeView();
  } catch (error) {
    if (requestId !== renderBodyRequestId) return false;
    clearElement(body);
    syncRequiredWorkspace(panel, null);
    appendSectionTitle(body, tabLabel(activeTab));
    appendEmpty(body, error?.message || String(error));
    return true;
  }

  if (requestId !== renderBodyRequestId) return false;
  clearElement(body);
  syncRequiredWorkspace(panel, view);
  renderActivePanel(body, view);
  return true;
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
  if (isResizingDrawer) return;

  const rect = drawer.getBoundingClientRect?.();
  isResizingDrawer = true;
  resizeStartX = Number(event?.clientX) || 0;
  resizeStartY = Number(event?.clientY) || 0;
  resizeStartWidth = Number(rect?.width) || shellLayout.drawerWidth;
  resizeStartHeight = Number(rect?.height) || shellLayout.drawerHeight;
  drawer.classList.add('directive-command-drawer-resizing');
  event?.preventDefault?.();
  event?.stopPropagation?.();
  if (event?.pointerId !== undefined && typeof event?.currentTarget?.setPointerCapture === 'function') {
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Mouse-event fallbacks and synthetic drags do not always have a capturable pointer.
    }
  }

  document.addEventListener?.('pointermove', moveDirectiveDrawerResize);
  document.addEventListener?.('pointerup', endDirectiveDrawerResize);
  document.addEventListener?.('pointercancel', endDirectiveDrawerResize);
  document.addEventListener?.('mousemove', moveDirectiveDrawerResize);
  document.addEventListener?.('mouseup', endDirectiveDrawerResize);
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
  document.removeEventListener?.('mousemove', moveDirectiveDrawerResize);
  document.removeEventListener?.('mouseup', endDirectiveDrawerResize);
}

export function setDirectiveRuntimeApp(app) {
  if (!app) {
    closeDirectiveGuidance('runtime-unmount');
    stopDirectiveTrainingScenario({ refresh: false });
  }
  runtimeApp = app || null;
}

export function setDirectiveRuntimeMountHost(host = null) {
  runtimeMountHost = host && typeof host.appendChild === 'function' ? host : null;
  const panel = getPanel();
  if (panel && runtimeMountHost && panel.parentNode !== runtimeMountHost) {
    runtimeMountHost.appendChild(panel);
  }
  return {
    mounted: Boolean(runtimeMountHost),
    host: runtimeMountHost
  };
}

export async function runDirectiveAssistFromRuntime(payload = {}) {
  if (typeof runtimeApp?.runDirectiveAssist !== 'function') {
    throw new Error('Directive Assist is unavailable until the Directive runtime app is initialized.');
  }
  return runtimeApp.runDirectiveAssist(payload);
}

export async function runFactualGroundingReviewFromRuntime(payload = {}) {
  if (typeof runtimeApp?.runFactualGroundingReview !== 'function') {
    throw new Error('Factual grounding review is unavailable until the Directive runtime app is initialized.');
  }
  return runtimeApp.runFactualGroundingReview(payload);
}

export async function runCommandBearingFromRuntime(action, payload = {}) {
  const actionName = String(action || '').trim();
  if (actionName === 'view') {
    if (typeof runtimeApp?.getCurrentView !== 'function') {
      throw new Error('Command Bearing view is unavailable until the Directive runtime app is initialized.');
    }
    const view = await runtimeApp.getCurrentView({ tabId: payload?.tabId || 'mission' });
    return {
      commandBearingPlayerView: view?.commandBearingPlayerView || view?.loadedCommandBearingPlayerView || null,
      view
    };
  }
  const methodByAction = {
    ready: 'readyCommandBearingPoint',
    cancel: 'cancelReadiedCommandBearingPoint',
    recover: 'recoverCommandBearingPoint'
  };
  const methodName = methodByAction[actionName];
  if (!methodName || typeof runtimeApp?.[methodName] !== 'function') {
    throw new Error(`Command Bearing action "${actionName || 'unknown'}" is unavailable.`);
  }
  return runtimeApp[methodName](payload);
}

export async function runCampaignIntroRewriteFromRuntime(payload = {}) {
  if (typeof runtimeApp?.rewriteCampaignIntro !== 'function') {
    throw new Error('Campaign intro rewrite is unavailable until the Directive runtime app is initialized.');
  }
  return runtimeApp.rewriteCampaignIntro(payload);
}

export async function runSceneReconciliationFromRuntime(action, payload = {}) {
  const actionName = String(action || '').trim();
  const methodByAction = {
    reconcileMessage: 'reconcileMessage',
    setStart: 'setReconciliationStart',
    setEnd: 'setReconciliationEnd',
    clearMarkers: 'clearReconciliationMarkers',
    reconcileFromHere: 'reconcileFromHere',
    recalculateFromHere: 'recalculateFromHere',
    reconcileMarked: 'reconcileMarkedPassage',
    openPending: 'openPendingReconciliation',
    applyPending: 'applyPendingReconciliation',
    rejectPending: 'rejectPendingReconciliation'
  };
  const methodName = methodByAction[actionName];
  if (!methodName || typeof runtimeApp?.[methodName] !== 'function') {
    throw new Error(`Scene reconciliation action "${actionName || 'unknown'}" is unavailable.`);
  }
  return runtimeApp[methodName](payload);
}

export async function runMissionComponentsFromRuntime(action, payload = {}) {
  const actionName = String(action || '').trim();
  const methodByAction = {
    captureSelection: 'captureMissionComponentSelection',
    save: 'saveMissionComponent',
    update: 'updateMissionComponent',
    archive: 'archiveMissionComponent',
    openSource: 'openMissionComponentSource'
  };
  const methodName = methodByAction[actionName];
  if (!methodName || typeof runtimeApp?.[methodName] !== 'function') {
    throw new Error(`Mission Components action "${actionName || 'unknown'}" is unavailable.`);
  }
  const result = await runtimeApp[methodName](payload);
  if (actionName === 'openSource') dispatchMissionComponentOpenSource(result);
  return result;
}

function removeOutcomeIntegrityEditor() {
  if (!canUseDocument()) return;
  document.getElementById('directive-outcome-integrity-editor')?.remove();
}

function compactEditorLine(value = '', maxLength = 260) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function createOutcomeIntegrityLockedSummary(context = {}) {
  const locked = context.lockedContext || {};
  const section = document.createElement('section');
  section.className = 'directive-outcome-integrity-locked';
  const title = document.createElement('strong');
  title.textContent = 'Locked Outcome';
  const list = document.createElement('ul');
  const rows = [
    locked.outcomeId ? `Outcome: ${locked.outcomeId}` : '',
    locked.resultBand ? `Result: ${locked.resultBand}` : '',
    Array.isArray(locked.changedDomains) && locked.changedDomains.length ? `Committed domains: ${locked.changedDomains.join(', ')}` : '',
    Array.isArray(locked.commandLog) && locked.commandLog.length ? `Consequences: ${locked.commandLog.map((item) => compactEditorLine(item, 140)).join(' / ')}` : '',
    locked.commandBearing?.changed ? 'Command Bearing changed in this outcome.' : '',
    Number(locked.relationshipChangeCount) > 0 ? `Relationship changes: ${locked.relationshipChangeCount}` : ''
  ].filter(Boolean);
  for (const row of rows.length ? rows : ['No public committed summary is available for this response.']) {
    const item = document.createElement('li');
    item.textContent = row;
    list.appendChild(item);
  }
  section.append(title, list);
  return section;
}

function createOutcomeIntegrityEditor(context = {}) {
  removeOutcomeIntegrityEditor();
  const overlay = document.createElement('div');
  overlay.id = 'directive-outcome-integrity-editor';
  overlay.className = 'directive-outcome-integrity-editor-overlay';
  overlay.setAttribute('role', 'presentation');
  overlay.dataset.openedAt = String(Date.now());

  const dialog = document.createElement('section');
  dialog.className = 'directive-outcome-integrity-editor';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'directive-outcome-integrity-editor-title');

  const header = document.createElement('header');
  header.className = 'directive-outcome-integrity-editor-header';
  const heading = document.createElement('div');
  const title = document.createElement('h2');
  title.id = 'directive-outcome-integrity-editor-title';
  title.textContent = 'Edit Prose';
  const status = document.createElement('span');
  status.className = 'directive-outcome-integrity-mode';
  status.textContent = `Outcome Integrity ${context.mode === 'relaxed' ? 'Relaxed' : 'Strict'}`;
  heading.append(title, status);

  const headerActions = document.createElement('div');
  headerActions.className = 'directive-outcome-integrity-editor-header-actions';
  const expandButton = document.createElement('button');
  expandButton.type = 'button';
  expandButton.className = 'directive-button directive-secondary-command directive-outcome-integrity-expand';
  expandButton.title = 'Expand editor';
  expandButton.setAttribute('aria-label', 'Expand editor');
  const expandIcon = document.createElement('i');
  expandIcon.className = 'fa-solid fa-up-right-and-down-left-from-center';
  expandIcon.setAttribute('aria-hidden', 'true');
  expandButton.appendChild(expandIcon);
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'directive-button directive-secondary-command directive-outcome-integrity-close';
  closeButton.title = 'Close editor';
  closeButton.setAttribute('aria-label', 'Close editor');
  const closeIcon = document.createElement('i');
  closeIcon.className = 'fa-solid fa-xmark';
  closeIcon.setAttribute('aria-hidden', 'true');
  closeButton.appendChild(closeIcon);
  headerActions.append(expandButton, closeButton);
  header.append(heading, headerActions);

  const body = document.createElement('div');
  body.className = 'directive-outcome-integrity-editor-body';
  const guidance = document.createElement('p');
  guidance.className = 'directive-outcome-integrity-guidance';
  guidance.textContent = context.guidance || 'Prose edit only. Dialogue and wording can change; committed outcomes, costs, facts, relationships, and Command Bearing cannot.';
  const subguidance = document.createElement('p');
  subguidance.className = 'directive-outcome-integrity-subguidance';
  subguidance.textContent = 'You can shorten, reword, or adjust dialogue here. If you want the result itself to change, use outcome recovery instead.';
  const textarea = document.createElement('textarea');
  textarea.className = 'directive-outcome-integrity-textarea';
  textarea.value = context.currentText || '';
  textarea.maxLength = Number(context.editCharLimit) || 10000;
  textarea.spellcheck = true;
  textarea.setAttribute('aria-label', 'Edited assistant prose');
  const feedback = document.createElement('div');
  feedback.className = 'directive-outcome-integrity-feedback';
  feedback.hidden = true;
  body.append(guidance, subguidance, createOutcomeIntegrityLockedSummary(context), textarea, feedback);

  const footer = document.createElement('footer');
  footer.className = 'directive-outcome-integrity-editor-footer';
  const counter = document.createElement('span');
  counter.className = 'directive-outcome-integrity-counter';
  const submitButton = document.createElement('button');
  submitButton.type = 'button';
  submitButton.className = 'directive-button directive-primary-command directive-outcome-integrity-submit';
  submitButton.textContent = 'Submit Edit';
  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'directive-button directive-secondary-command';
  cancelButton.textContent = 'Cancel';
  footer.append(counter, cancelButton, submitButton);
  dialog.append(header, body, footer);
  overlay.appendChild(dialog);

  const updateCounter = () => {
    const words = textarea.value.trim() ? textarea.value.trim().split(/\s+/).length : 0;
    counter.textContent = `${words} words / ${textarea.value.length} of ${textarea.maxLength} characters`;
  };
  updateCounter();
  textarea.addEventListener('input', updateCounter);
  closeButton.addEventListener('click', removeOutcomeIntegrityEditor);
  cancelButton.addEventListener('click', removeOutcomeIntegrityEditor);
  overlay.addEventListener('click', (event) => {
    const openedAt = Number(overlay.dataset.openedAt || 0);
    if (Date.now() - openedAt < 250) return;
    if (event.target === overlay) removeOutcomeIntegrityEditor();
  });
  expandButton.addEventListener('click', () => {
    const expanded = !dialog.classList.contains('directive-outcome-integrity-editor-expanded');
    dialog.classList.toggle('directive-outcome-integrity-editor-expanded', expanded);
    expandButton.title = expanded ? 'Collapse editor' : 'Expand editor';
    expandButton.setAttribute('aria-label', expandButton.title);
    expandIcon.className = expanded
      ? 'fa-solid fa-down-left-and-up-right-to-center'
      : 'fa-solid fa-up-right-and-down-left-from-center';
  });
  submitButton.addEventListener('click', async () => {
    submitButton.disabled = true;
    feedback.hidden = false;
    feedback.className = 'directive-outcome-integrity-feedback directive-outcome-integrity-feedback-working';
    feedback.textContent = 'Reviewing prose edit...';
    try {
      const result = await runtimeApp.submitOutcomeIntegrityEdit({
        hostMessageId: context.hostMessageId,
        baseTextHash: context.baseTextHash,
        proposedText: textarea.value,
        reviewProviderKind: context.reviewProviderKind
      });
      if (result?.accepted) {
        globalThis.toastr?.success?.(result.summary || 'Prose edit accepted.');
        removeOutcomeIntegrityEditor();
        await refreshDirectiveRuntimePanel({ preserveScroll: true });
        return;
      }
      feedback.className = 'directive-outcome-integrity-feedback directive-outcome-integrity-feedback-rejected';
      feedback.textContent = [result?.summary, result?.detail].filter(Boolean).join(' ');
      globalThis.toastr?.warning?.(result?.summary || 'Outcome Integrity rejected the edit.');
    } catch (error) {
      feedback.className = 'directive-outcome-integrity-feedback directive-outcome-integrity-feedback-rejected';
      feedback.textContent = error?.message || String(error);
      globalThis.toastr?.error?.(feedback.textContent);
    } finally {
      submitButton.disabled = false;
      updateCounter();
    }
  });

  return { overlay, dialog, textarea };
}

export async function runOutcomeIntegrityEditFromRuntime(payload = {}) {
  if (typeof runtimeApp?.prepareOutcomeIntegrityEdit !== 'function') {
    throw new Error('Outcome Integrity is unavailable until the Directive runtime app is initialized.');
  }
  const context = await runtimeApp.prepareOutcomeIntegrityEdit(payload);
  if (!context?.ok) {
    const summary = context?.summary || context?.reason || 'This message cannot be edited through Outcome Integrity.';
    globalThis.toastr?.warning?.(summary);
    return { ok: false, reason: context?.reason || 'unavailable', summary, context };
  }
  if (!canUseDocument()) return { ok: false, reason: 'document-unavailable', context };
  const editor = createOutcomeIntegrityEditor(context);
  const host = outcomeIntegrityEditorHost();
  editor.overlay.dataset.mount = host.mount;
  host.element?.appendChild(editor.overlay);
  editor.textarea.focus?.();
  editor.textarea.setSelectionRange?.(0, editor.textarea.value.length);
  return { ok: true, opened: true, actionId: OUTCOME_INTEGRITY_EDIT_ACTION_ID, context };
}

function removeDirectivePresetUpdateDialog() {
  if (!canUseDocument()) return;
  document.getElementById('directive-preset-update-dialog')?.remove();
}

function createDirectivePresetUpdateDialog(reminder) {
  if (!canUseDocument()) return null;
  removeDirectivePresetUpdateDialog();
  const overlay = document.createElement('div');
  overlay.id = 'directive-preset-update-dialog';
  overlay.className = 'directive-preset-update-dialog-overlay';
  overlay.setAttribute('role', 'presentation');

  const dialog = document.createElement('section');
  dialog.className = 'directive-preset-update-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'directive-preset-update-title');
  dialog.setAttribute('aria-describedby', 'directive-preset-update-message');

  const title = document.createElement('h2');
  title.id = 'directive-preset-update-title';
  title.textContent = reminder?.title || 'Directive Preset needs attention';
  const message = document.createElement('p');
  message.id = 'directive-preset-update-message';
  message.textContent = reminder?.message || 'Open Directive Preset settings to install the latest bundled preset.';
  const meta = document.createElement('p');
  meta.className = 'directive-preset-update-meta';
  meta.textContent = `Bundled preset: ${reminder?.bundledVersion || 'latest'}`;

  const actions = document.createElement('div');
  actions.className = 'directive-preset-update-dialog-actions';

  const openButton = document.createElement('button');
  openButton.type = 'button';
  openButton.className = 'directive-button directive-primary-command';
  openButton.dataset.presetDialogAction = 'open-settings';
  openButton.textContent = 'Open Preset Settings';

  const notNowButton = document.createElement('button');
  notNowButton.type = 'button';
  notNowButton.className = 'directive-button directive-secondary-command';
  notNowButton.dataset.presetDialogAction = 'not-now';
  notNowButton.textContent = 'Not Now';

  const disableButton = document.createElement('button');
  disableButton.type = 'button';
  disableButton.className = 'directive-button directive-secondary-command';
  disableButton.dataset.presetDialogAction = 'disable';
  disableButton.textContent = "Don't Remind Me Again";

  actions.append(openButton, notNowButton, disableButton);
  dialog.append(title, message, meta, actions);
  overlay.appendChild(dialog);
  return {
    overlay,
    openButton,
    notNowButton,
    disableButton
  };
}

export async function openDirectivePresetSettings({ highlight = true } = {}) {
  selectDirectivePresetSettingsSection();
  await showDirectiveRuntimePanel();
  await setDirectiveRuntimeTab('settings');
  if (highlight) await highlightDirectivePresetSettingsCard();
  return { ok: true, activeTab };
}

export async function runDirectivePresetStartupReminder({ app = runtimeApp } = {}) {
  if (!app || typeof app.getDirectivePresetStartupReminder !== 'function') {
    return { shown: false, reason: 'missing-runtime-app' };
  }
  const reminder = await app.getDirectivePresetStartupReminder();
  if (!reminder?.shouldPrompt) {
    return { shown: false, reminder };
  }
  const dialog = createDirectivePresetUpdateDialog(reminder);
  if (!dialog) {
    return { shown: false, reason: 'missing-document', reminder };
  }
  appendDirectiveOverlay(dialog.overlay, { fallbackParent: runtimeHost() });
  dialog.openButton.focus?.();

  const close = () => dialog.overlay.remove?.();
  dialog.openButton.addEventListener('click', async () => {
    close();
    await openDirectivePresetSettings({ highlight: true });
  });
  dialog.notNowButton.addEventListener('click', async () => {
    close();
    await app.dismissDirectivePresetStartupReminder?.({
      bundledVersion: reminder.bundledVersion
    });
  });
  dialog.disableButton.addEventListener('click', async () => {
    close();
    await app.dismissDirectivePresetStartupReminder?.({
      disable: true,
      bundledVersion: reminder.bundledVersion
    });
  });

  return { shown: true, reminder };
}

function createDirectiveGuidanceController() {
  return {
    onTutorialStart: async ({ tutorial, tutorialId, stepId, stepIndex } = {}) => {
      const result = startDirectiveTrainingScenario({
        tutorial,
        tutorialId,
        stepId,
        stepIndex
      });
      if (result.active) {
        await showDirectiveRuntimePanel();
        await refreshDirectiveRuntimePanel({ preserveScroll: false });
      }
    },
    onTutorialStep: async ({ tutorialId, stepId, stepIndex } = {}) => {
      if (!isTrainingScenarioActive()) return;
      updateDirectiveTrainingScenarioStep({ tutorialId, stepId, stepIndex });
      await refreshDirectiveRuntimePanel({ preserveScroll: false });
    },
    onGuidanceClose: ({ kind, reason } = {}) => {
      if (kind === 'tutorial') {
        const runtimeClose = String(reason || '').startsWith('runtime-');
        stopDirectiveTrainingScenario({
          refresh: !runtimeClose,
          restoreRoute: reason !== 'replace' && !runtimeClose
        });
      }
    },
    navigateToRoute: async (routeId) => {
      await showDirectiveRuntimePanel();
      await setDirectiveRuntimeTab(routeId);
      await refreshDirectiveRuntimePanel({ preserveScroll: false });
    }
  };
}

export async function beginDirectiveGuidanceTutorial(options = {}) {
  return showDirectiveGuidanceTutorial(options, createDirectiveGuidanceController());
}

export async function showDirectiveRuntimeGuidanceTip(options = {}) {
  return showDirectiveGuidanceTip(options, createDirectiveGuidanceController());
}

export function updateDirectiveGuidancePreference({ key = '', value = false } = {}) {
  return setDirectiveGuidancePreference(key, value);
}

export async function runDirectiveGuidanceStartupOffer() {
  if (canUseDocument() && document.getElementById('directive-preset-update-dialog')) {
    return { shown: false, reason: 'preset-dialog-active' };
  }
  return runGuidanceStartupOffer(createDirectiveGuidanceController());
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
  closeDirectiveGuidance('runtime-hide');
  stopDirectiveTrainingScenario({ refresh: false });
  const panel = getPanel();
  if (!panel) return { isOpen: false };
  fullscreenMode = 'none';
  shellLayout.fullscreen = false;
  panel.hidden = true;
  panel.classList.remove('directive-runtime-panel-open', 'directive-runtime-fullscreen');
  return { isOpen: false, activeTab };
}

export async function refreshDirectiveRuntimePanel({ preserveScroll = true } = {}) {
  const panel = ensurePanel();
  if (!panel) return { refreshed: false, activeTab };
  const shouldRestoreScroll = preserveScroll !== false && lastRenderedTab === activeTab;
  const scrollSnapshot = shouldRestoreScroll ? captureRuntimeScroll(panel) : [];
  applyDirectiveTheme(panel, getDirectiveThemePack());
  applyShellLayout(panel);
  syncShellChrome(panel);
  const rendered = await renderBody(panel);
  if (!rendered) {
    return {
      refreshed: false,
      stale: true,
      activeTab,
      drawerOpen: getVisualDrawerOpen(),
      fullscreen: shellLayout.fullscreen
    };
  }
  restoreRuntimeScroll(panel, scrollSnapshot);
  lastRenderedTab = activeTab;
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
  closeDirectiveGuidance('runtime-reset');
  stopDirectiveTrainingScenario({ refresh: false });
  endDirectiveShelfDrag();
  endDirectiveDrawerResize();
  resetDirectiveRouteUiState();
  if (typeof runtimeApp?.resetRuntimeUiState === 'function') {
    await runtimeApp.resetRuntimeUiState();
  }
  shellLayout = resetDirectiveShellLayout(currentViewport());
  activeTab = normalizeDirectiveRouteId(shellLayout.activeRoute, 'campaign');
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
    closeDirectiveGuidance('runtime-test-reset');
    stopDirectiveTrainingScenario({ refresh: false });
    shellLayout = resetDirectiveShellLayout(currentViewport());
    activeTab = 'campaign';
    shellLayout.activeRoute = activeTab;
    runtimeApp = null;
    runtimeMountHost = null;
    trainingScenarioSession = null;
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
