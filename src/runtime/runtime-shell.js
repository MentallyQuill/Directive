import { renderCharacterCreatorPanel } from '../ui/character-creator-panel.js';
import { cancelActiveCreatorAssistSession } from '../ui/character-creator-assist-dialog.js';
import { renderCrewPanel, resetCrewPanelState } from '../ui/crew-panel.js';
import { syncCampaignRequiredGuidance } from '../ui/current-chat-empty-state.js';
import { renderMissionPanel } from '../ui/mission-panel.js';
import {
  highlightDirectivePresetSettingsCard,
  renderSettingsPanel,
  resetSettingsPanelState,
  selectDirectivePresetSettingsSection
} from '../ui/settings-panel.js';
import { renderShipPanel } from '../ui/ship-panel.js';
import { renderCampaignPanel, resetCampaignPanelState } from '../ui/campaign-panel.js';
import { createDirectiveExpandedShell } from '../ui/directive-expanded-shell.js';
import {
  DIRECTIVE_PRIMARY_ROUTES,
  getDirectiveRoute,
  getDirectiveRouteLabel,
  normalizeDirectiveRouteId,
  resolveDirectiveRouteId
} from '../ui/directive-routes.mjs';
import { applyDirectiveTheme, getDirectiveThemePack } from '../theme/directive-theme-packs.mjs';
import { appendEmpty, appendSectionTitle, clearElement } from '../ui/runtime-ui-kit.js';
import { appendDirectiveOverlay } from '../ui/directive-overlay-root.js';

export const DIRECTIVE_RUNTIME_PANEL_ID = 'directive-runtime-panel';
export const DIRECTIVE_RUNTIME_TABS = Object.freeze(DIRECTIVE_PRIMARY_ROUTES.map((route) => ({
  id: route.id,
  label: route.label
})));

let shellLayout = { activeRoute: 'campaign' };
let activeTab = 'campaign';
let routeSelectionExplicit = false;
let runtimeApp = null;
let runtimeMountHost = null;
let runtimeOverlay = null;
let runtimeOpener = null;
let keydownListenerInstalled = false;
let popstateListenerInstalled = false;
let lastRenderedTab = '';
let renderBodyRequestId = 0;

function canUseDocument() {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

function isMobileViewport() {
  if (typeof window === 'undefined') return false;
  if (typeof window.matchMedia === 'function') return window.matchMedia('(max-width: 640px)').matches;
  return Number(window.innerWidth) <= 640;
}

function runtimeHost() {
  return runtimeMountHost || document.body || document.documentElement;
}

function getPanel() {
  return canUseDocument() ? document.getElementById(DIRECTIVE_RUNTIME_PANEL_ID) : null;
}

function ensureRuntimeOverlay() {
  if (!canUseDocument()) return null;
  let overlay = document.getElementById?.('directive-runtime-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'directive-runtime-overlay';
    overlay.className = 'directive-runtime-overlay';
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    const backdrop = document.createElement('div');
    backdrop.className = 'directive-runtime-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.addEventListener?.('click', (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      hideDirectiveRuntimePanel();
    });
    const panelHost = document.createElement('div');
    panelHost.className = 'directive-runtime-panel-host';
    overlay.append(backdrop, panelHost);
    (document.body || document.documentElement)?.appendChild?.(overlay);
  }
  runtimeOverlay = {
    overlay,
    backdrop: overlay.querySelector?.('.directive-runtime-backdrop') || null,
    panelHost: overlay.querySelector?.('.directive-runtime-panel-host') || null
  };
  return runtimeOverlay;
}

function getRuntimeOverlay() {
  return runtimeOverlay?.overlay ? runtimeOverlay : ensureRuntimeOverlay();
}

function resetDirectiveRouteUiState() {
  resetCampaignPanelState();
  resetCrewPanelState();
  resetSettingsPanelState();
}

function persistLayout() {
  shellLayout.activeRoute = activeTab;
  return shellLayout;
}

function applyShellLayout(panel = getPanel(), { persist = false } = {}) {
  if (!panel) return null;
  panel.dataset.directiveShell = 'expanded';
  panel.dataset.activeRoute = activeTab;
  panel.dataset.mobileActiveTab = activeTab;
  if (persist) persistLayout();
  return shellLayout;
}

function syncShellChrome(panel = getPanel()) {
  if (!panel) return;
  const route = getDirectiveRoute(activeTab);
  panel.dataset.activeRoute = activeTab;
  for (const button of panel.querySelectorAll?.('.directive-route-control') || []) {
    const selected = button.dataset.routeId === activeTab;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', selected ? 'true' : 'false');
    if (selected) button.setAttribute('aria-current', 'page');
    else button.removeAttribute?.('aria-current');
  }
  const routePath = panel.querySelector?.('.directive-route-path');
  if (routePath) routePath.textContent = `${route.label} / ${route.shelfLabel || route.shortLabel || route.label}`;
  const routeName = panel.querySelector?.('.directive-route-name');
  if (routeName) routeName.textContent = route.label;
  const routeBody = panel.querySelector?.('[data-directive-runtime-body="true"]');
  if (routeBody) {
    routeBody.dataset.directiveTour = `route-body.${activeTab}`;
    routeBody.dataset.routeView = activeTab;
  }
}

function createPanel() {
  const panel = createDirectiveExpandedShell({
    id: DIRECTIVE_RUNTIME_PANEL_ID,
    title: 'DIRECTIVE',
    label: 'Directive expanded interface',
    routes: DIRECTIVE_PRIMARY_ROUTES,
    activeRouteId: activeTab,
    onSelectRoute: (routeId) => selectRoute(routeId),
    onClose: () => hideDirectiveRuntimePanel()
  });
  panel.hidden = true;
  panel.setAttribute('aria-hidden', 'true');
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
  if (!popstateListenerInstalled && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('popstate', onDirectiveShellPopstate);
    popstateListenerInstalled = true;
  }
}

function ensurePanel() {
  if (!canUseDocument()) return null;
  let panel = getPanel();
  if (!panel) {
    panel = createPanel();
    getRuntimeOverlay()?.panelHost?.appendChild?.(panel);
  } else {
    const panelHost = getRuntimeOverlay()?.panelHost;
    if (panelHost && panel.parentNode !== panelHost) panelHost.appendChild(panel);
  }
  installGlobalShellListeners();
  return panel;
}

async function getRuntimeView() {
  let view = typeof runtimeApp?.getCurrentView === 'function'
    ? await runtimeApp.getCurrentView({ tabId: activeTab })
    : null;
  const hasActiveCampaign = Boolean(view?.campaignState?.campaignChatBinding?.chatId);
  const route = !routeSelectionExplicit && activeTab === 'campaign' && hasActiveCampaign
    ? 'mission'
    : resolveDirectiveRouteId(activeTab, { hasActiveCampaign });
  if (route !== activeTab) {
    activeTab = route;
    persistLayout();
    view = typeof runtimeApp?.getCurrentView === 'function'
      ? await runtimeApp.getCurrentView({ tabId: activeTab })
      : view;
  }
  return view;
}

async function selectRoute(routeId) {
  activeTab = normalizeDirectiveRouteId(routeId, activeTab);
  routeSelectionExplicit = true;
  persistLayout();
  applyShellLayout();
  syncShellChrome();
  await refreshDirectiveRuntimePanel();
  return { activeTab, isOpen: true };
}

function callApp(method, options) {
  const handler = runtimeApp?.[method];
  if (typeof handler !== 'function') {
    throw new Error(`Directive runtime action ${method} is unavailable.`);
  }
  return handler.call(runtimeApp, options);
}

function createRuntimeActions() {
  return {
    setActiveTab: (tabId) => selectRoute(tabId),
    refresh: refreshDirectiveRuntimePanel,
    startCreatorDraft: (options) => callApp('startCreatorDraft', options),
    resumeCreatorDraft: (options) => callApp('resumeCreatorDraft', options),
    saveCreatorDraft: (options) => callApp('saveCreatorDraft', options),
    generateCreatorSectionDraft: (options) => callApp('generateCreatorSectionDraft', options),
    importCreatorPortrait: (options) => callApp('importCreatorPortrait', options),
    removeCreatorPortrait: (options) => callApp('removeCreatorPortrait', options),
    importCampaignPlayerPortrait: (options) => callApp('importCampaignPlayerPortrait', options),
    removeCampaignPlayerPortrait: () => callApp('removeCampaignPlayerPortrait'),
    returnCreatorToCampaignLibrary: (options) => callApp('returnCreatorToCampaignLibrary', options),
    discardCreatorDraft: (options) => callApp('discardCreatorDraft', options),
    acceptCreatorDraftAndStartCampaign: async (options) => {
      const result = await callApp('acceptCreatorDraftAndStartCampaign', options);
      await selectRoute('mission');
      return result;
    },
    openCampaignChat: (options) => callApp('openCampaignChat', options),
    deleteCampaign: (options) => callApp('deleteCampaign', options),
    saveGame: (options) => callApp('saveGame', options),
    renameSavedGame: (options) => callApp('renameSavedGame', options),
    loadCheckpoint: (options) => callApp('loadCheckpoint', options),
    loadGame: (options) => callApp('loadGame', options),
    deleteSave: (options) => callApp('deleteSave', options),
    verifyActiveSave: () => callApp('verifyActiveSave'),
    exportSupportDiagnostics: (options) => callApp('exportSupportDiagnostics', options),
    updateProviderSettings: (options) => callApp('updateProviderSettings', options),
    testProvider: (options) => callApp('testProvider', options),
    refreshDirectivePresetStatus: () => callApp('refreshDirectivePresetStatus'),
    updateDirectivePresetAutoCheck: (options) => callApp('updateDirectivePresetAutoCheck', options),
    installDirectivePreset: () => callApp('installDirectivePreset'),
    reserveCommandBearingEdge: () => callApp('reserveCommandBearingEdge'),
    cancelCommandBearingEdge: () => callApp('cancelCommandBearingEdge'),
    reserveCohesionRelief: (options) => callApp('reserveCohesionRelief', options),
    cancelCohesionRelief: () => callApp('cancelCohesionRelief'),
  };
}

function renderActivePanel(body, view) {
  const actions = createRuntimeActions();
  if (activeTab === 'campaign' && view?.activeScreen === 'creator' && view?.creator) {
    renderCharacterCreatorPanel(body, view, actions);
  } else if (activeTab === 'campaign') {
    renderCampaignPanel(body, view, actions);
  } else if (activeTab === 'mission') {
    renderMissionPanel(body, view, actions);
  } else if (activeTab === 'people') {
    renderCrewPanel(body, view, actions);
  } else if (activeTab === 'ship') {
    renderShipPanel(body, view, actions);
  } else if (activeTab === 'settings') {
    renderSettingsPanel(body, view, actions);
  } else {
    appendSectionTitle(body, getDirectiveRouteLabel(activeTab));
    appendEmpty(body, 'No panel loaded.');
  }
}

function syncRequiredWorkspace(panel, view) {
  const required = activeTab === 'campaign' && view?.activeScreen === 'creator' && Boolean(view?.creator);
  panel.dataset.workspaceRequired = required ? 'true' : 'false';
}

async function renderBody(panel) {
  const requestId = ++renderBodyRequestId;
  const body = panel.querySelector?.('[data-directive-runtime-body="true"]');
  if (!body) return false;
  clearElement(body);
  delete body.dataset.campaignRequired;
  syncCampaignRequiredGuidance(panel, body);
  try {
    const view = await getRuntimeView();
    if (requestId !== renderBodyRequestId) return false;
    syncRequiredWorkspace(panel, view);
    renderActivePanel(body, view);
    syncCampaignRequiredGuidance(panel, body);
    return true;
  } catch (error) {
    if (requestId !== renderBodyRequestId) return false;
    clearElement(body);
    delete body.dataset.campaignRequired;
    syncRequiredWorkspace(panel, null);
    appendSectionTitle(body, getDirectiveRouteLabel(activeTab));
    appendEmpty(body, error?.message || String(error));
    syncCampaignRequiredGuidance(panel, body);
    return true;
  }
}

function scrollContainers(panel) {
  return [...(panel?.querySelectorAll?.('[data-directive-runtime-body="true"]') || [])];
}

function captureScroll(panel) {
  return scrollContainers(panel).map((element, index) => ({
    index,
    top: Number(element.scrollTop) || 0,
    left: Number(element.scrollLeft) || 0
  }));
}

function restoreScroll(panel, snapshot) {
  const containers = scrollContainers(panel);
  const apply = () => snapshot.forEach((entry) => {
    const element = containers[entry.index];
    if (!element) return;
    element.scrollTop = entry.top;
    element.scrollLeft = entry.left;
  });
  apply();
  globalThis.requestAnimationFrame?.(apply);
}

function onDirectiveShellKeydown(event) {
  const panel = getPanel();
  if (event?.key !== 'Escape' || !panel || panel.hidden === true) return;
  hideDirectiveRuntimePanel();
  event.preventDefault?.();
  event.stopPropagation?.();
}

function onDirectiveShellPopstate() {
  const panel = getPanel();
  if (!panel || panel.hidden === true || !isMobileViewport()) return;
  hideDirectiveRuntimePanel({ skipHistory: true });
}

function removeDirectivePresetUpdateDialog() {
  if (!canUseDocument()) return;
  document.getElementById('directive-preset-update-dialog')?.remove?.();
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
  const title = document.createElement('h2');
  title.textContent = reminder?.title || 'Directive Preset needs attention';
  const message = document.createElement('p');
  message.textContent = reminder?.message || 'Open Directive Preset settings to install the latest bundled preset.';
  const meta = document.createElement('p');
  meta.className = 'directive-preset-update-meta';
  meta.textContent = `Bundled preset: ${reminder?.bundledVersion || 'latest'}`;
  const actions = document.createElement('div');
  actions.className = 'directive-preset-update-dialog-actions';
  const openButton = document.createElement('button');
  openButton.type = 'button';
  openButton.className = 'directive-button directive-primary-command';
  openButton.textContent = 'Open Preset Settings';
  const notNowButton = document.createElement('button');
  notNowButton.type = 'button';
  notNowButton.className = 'directive-button directive-secondary-command';
  notNowButton.textContent = 'Not Now';
  const disableButton = document.createElement('button');
  disableButton.type = 'button';
  disableButton.className = 'directive-button directive-secondary-command';
  disableButton.textContent = "Don't Remind Me Again";
  actions.append(openButton, notNowButton, disableButton);
  dialog.append(title, message, meta, actions);
  overlay.appendChild(dialog);
  return { overlay, openButton, notNowButton, disableButton };
}

export function setDirectiveRuntimeApp(app) {
  runtimeApp = app || null;
}

export function setDirectiveRuntimeMountHost(host = null) {
  runtimeMountHost = host && typeof host.appendChild === 'function' ? host : null;
  return { mounted: Boolean(runtimeMountHost), host: runtimeMountHost };
}

export async function openDirectivePresetSettings({ highlight = true } = {}) {
  selectDirectivePresetSettingsSection();
  await showDirectiveRuntimePanel();
  await setDirectiveRuntimeTab('settings');
  if (highlight) await highlightDirectivePresetSettingsCard();
  return { ok: true, activeTab };
}

export async function runDirectivePresetStartupReminder({ app = runtimeApp } = {}) {
  if (typeof app?.getDirectivePresetStartupReminder !== 'function') {
    return { shown: false, reason: 'missing-runtime-app' };
  }
  const reminder = await app.getDirectivePresetStartupReminder();
  if (!reminder?.shouldPrompt) return { shown: false, reminder };
  const dialog = createDirectivePresetUpdateDialog(reminder);
  if (!dialog) return { shown: false, reason: 'missing-document', reminder };
  appendDirectiveOverlay(dialog.overlay, { fallbackParent: runtimeHost() });
  const close = () => dialog.overlay.remove?.();
  dialog.openButton.addEventListener('click', async () => {
    close();
    await openDirectivePresetSettings({ highlight: true });
  });
  dialog.notNowButton.addEventListener('click', async () => {
    close();
    await app.dismissDirectivePresetStartupReminder?.({ bundledVersion: reminder.bundledVersion });
  });
  dialog.disableButton.addEventListener('click', async () => {
    close();
    await app.dismissDirectivePresetStartupReminder?.({ disable: true, bundledVersion: reminder.bundledVersion });
  });
  dialog.openButton.focus?.();
  return { shown: true, reminder };
}

export async function showDirectiveRuntimePanel({ opener = null } = {}) {
  const panel = ensurePanel();
  if (!panel) return { isOpen: false };
  if (isMobileViewport() && window.history?.pushState && panel.dataset.directiveHistoryEntry !== 'true') {
    window.history.pushState({ ...(window.history.state || {}), directiveRuntimeOpen: true }, '');
    panel.dataset.directiveHistoryEntry = 'true';
  }
  runtimeOpener = opener || null;
  panel.hidden = false;
  panel.setAttribute('aria-hidden', 'false');
  panel.classList.add('directive-runtime-panel-open');
  const shell = getRuntimeOverlay();
  if (shell?.overlay) {
    shell.overlay.hidden = false;
    shell.overlay.setAttribute('aria-hidden', 'false');
    shell.overlay.classList.add('directive-runtime-overlay-open');
  }
  applyShellLayout(panel);
  syncShellChrome(panel);
  await refreshDirectiveRuntimePanel();
  if (panel.hidden === true) return { isOpen: false, activeTab };
  panel.querySelector?.('[data-shell-action="close"]')?.focus?.({ preventScroll: true });
  return { isOpen: true, activeTab, layout: { ...shellLayout } };
}

export function hideDirectiveRuntimePanel({ skipHistory = false } = {}) {
  cancelActiveCreatorAssistSession('directive-closed');
  const panel = getPanel();
  if (!panel) return { isOpen: false };
  const opener = runtimeOpener;
  panel.hidden = true;
  panel.setAttribute('aria-hidden', 'true');
  panel.classList.remove('directive-runtime-panel-open');
  const shell = getRuntimeOverlay();
  if (shell?.overlay) {
    shell.overlay.hidden = true;
    shell.overlay.setAttribute('aria-hidden', 'true');
    shell.overlay.classList.remove('directive-runtime-overlay-open');
  }
  if (!skipHistory && panel.dataset.directiveHistoryEntry === 'true') {
    panel.removeAttribute?.('data-directive-history-entry');
    if (typeof window !== 'undefined') window.history?.back?.();
  } else {
    panel.removeAttribute?.('data-directive-history-entry');
  }
  runtimeOpener = null;
  opener?.focus?.({ preventScroll: true });
  return { isOpen: false, activeTab };
}

export async function refreshDirectiveRuntimePanel({ preserveScroll = true } = {}) {
  cancelActiveCreatorAssistSession('runtime-refresh');
  const panel = ensurePanel();
  if (!panel) return { refreshed: false, activeTab };
  const snapshot = preserveScroll !== false && lastRenderedTab === activeTab ? captureScroll(panel) : [];
  applyDirectiveTheme(panel, getDirectiveThemePack());
  applyShellLayout(panel);
  syncShellChrome(panel);
  const rendered = await renderBody(panel);
  if (!rendered) return { refreshed: false, stale: true, activeTab };
  restoreScroll(panel, snapshot);
  lastRenderedTab = activeTab;
  syncShellChrome(panel);
  return { refreshed: true, activeTab };
}

export async function setDirectiveRuntimeTab(tabId) {
  const requested = String(tabId || '').trim();
  const next = normalizeDirectiveRouteId(requested, '');
  if (!next) throw new Error(`Unknown Directive runtime tab "${requested}"`);
  return selectRoute(next);
}

export const __directiveRuntimeShellTestHooks = Object.freeze({
  getActiveTab: () => activeTab,
  getLayout: () => ({ ...shellLayout, viewportBound: true }),
  getRuntimeOverlay,
  reset() {
    shellLayout = { activeRoute: 'campaign' };
    activeTab = 'campaign';
    routeSelectionExplicit = false;
    runtimeApp = null;
    runtimeMountHost = null;
    runtimeOverlay = null;
    runtimeOpener = null;
    lastRenderedTab = '';
    renderBodyRequestId = 0;
    resetDirectiveRouteUiState();
  }
});
