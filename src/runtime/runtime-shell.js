import { renderCharacterCreatorPanel } from '../ui/character-creator-panel.js';
import { renderCommandLogPanel } from '../ui/command-log-panel.js';
import { renderCrewPanel } from '../ui/crew-panel.js';
import { renderMissionPanel } from '../ui/mission-panel.js';
import { renderSettingsPanel } from '../ui/settings-panel.js';
import { renderShipPanel } from '../ui/ship-panel.js';
import { renderStarshipsPanel } from '../ui/starships-panel.js';
import { createDirectiveCompactShell } from '../ui/directive-compact-shell.js';
import {
  DIRECTIVE_PRIMARY_ROUTES,
  getDirectiveRouteLabel,
  normalizeDirectiveRouteId
} from '../ui/directive-routes.mjs';
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

let activeTab = 'starships';
let runtimeApp = null;
let routeHistory = [];

function canUseDocument() {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

function tabLabel(tabId) {
  return getDirectiveRouteLabel(tabId);
}

function createPanel() {
  return createDirectiveCompactShell({
    id: DIRECTIVE_RUNTIME_PANEL_ID,
    title: 'Directive',
    label: 'Directive runtime',
    routes: DIRECTIVE_PRIMARY_ROUTES,
    activeRouteId: activeTab,
    actions: [
      {
        id: 'back',
        label: 'Back',
        title: 'Back',
        icon: 'fa-solid fa-arrow-left',
        disabled: routeHistory.length === 0,
        onClick: async () => {
          await navigateBack();
        }
      },
      {
        id: 'close',
        label: 'Close Directive',
        title: 'Close Directive',
        icon: 'fa-solid fa-xmark',
        onClick: hideDirectiveRuntimePanel
      }
    ],
    onSelectRoute: async (routeId) => {
      await navigateToRoute(routeId);
    }
  });
}

function runtimeHost() {
  return document.body || document.documentElement;
}

function ensurePanel() {
  if (!canUseDocument()) {
    return null;
  }
  let panel = document.getElementById(DIRECTIVE_RUNTIME_PANEL_ID);
  if (!panel) {
    panel = createPanel();
    runtimeHost()?.appendChild(panel);
  }
  return panel;
}

async function getRuntimeView() {
  if (!runtimeApp || typeof runtimeApp.getCurrentView !== 'function') {
    return null;
  }
  return runtimeApp.getCurrentView({ tabId: activeTab });
}

async function navigateToRoute(routeId) {
  const nextTab = normalizeDirectiveRouteId(routeId, activeTab);
  if (nextTab !== activeTab) {
    routeHistory.push(activeTab);
    activeTab = nextTab;
  }
  await refreshDirectiveRuntimePanel();
}

async function navigateBack() {
  const previousTab = routeHistory.pop();
  if (previousTab) {
    activeTab = normalizeDirectiveRouteId(previousTab, activeTab);
  }
  await refreshDirectiveRuntimePanel();
}

function createRuntimeActions() {
  return {
    setActiveTab(tabId) {
      const nextTab = normalizeDirectiveRouteId(tabId, activeTab);
      if (nextTab !== activeTab) {
        routeHistory.push(activeTab);
        activeTab = nextTab;
      }
    },
    refresh: refreshDirectiveRuntimePanel,
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

async function renderBody(panel) {
  const body = panel.querySelector('[data-directive-runtime-body="true"]');
  if (!body) return;
  clearElement(body);

  let view = null;
  try {
    view = await getRuntimeView();
  } catch (error) {
    appendSectionTitle(body, tabLabel(activeTab));
    appendEmpty(body, error?.message || String(error));
    return;
  }

  renderActivePanel(body, view);
}

function syncTabs(panel) {
  for (const button of panel.querySelectorAll('.directive-tab-button')) {
    const selected = button.dataset.tab === activeTab;
    button.classList.toggle('directive-tab-button-active', selected);
    button.setAttribute('aria-selected', selected ? 'true' : 'false');
  }
}

function syncShellActions(panel) {
  const backButton = panel.querySelector('[data-shell-action="back"]');
  if (backButton) {
    backButton.disabled = routeHistory.length === 0;
    backButton.setAttribute('aria-disabled', backButton.disabled ? 'true' : 'false');
  }
}

export function setDirectiveRuntimeApp(app) {
  runtimeApp = app || null;
}

export async function showDirectiveRuntimePanel() {
  const panel = ensurePanel();
  if (!panel) {
    return { isOpen: false };
  }
  panel.hidden = false;
  panel.classList.add('directive-runtime-panel-open');
  await refreshDirectiveRuntimePanel();
  return { isOpen: true, activeTab };
}

export function hideDirectiveRuntimePanel() {
  const panel = canUseDocument() ? document.getElementById(DIRECTIVE_RUNTIME_PANEL_ID) : null;
  if (!panel) {
    return { isOpen: false };
  }
  panel.hidden = true;
  panel.classList.remove('directive-runtime-panel-open');
  return { isOpen: false, activeTab };
}

export async function refreshDirectiveRuntimePanel() {
  const panel = ensurePanel();
  if (!panel) {
    return { refreshed: false, activeTab };
  }
  syncTabs(panel);
  syncShellActions(panel);
  await renderBody(panel);
  return { refreshed: true, activeTab };
}

export async function setDirectiveRuntimeTab(tabId) {
  const requestedTab = String(tabId || '').trim();
  const nextTab = normalizeDirectiveRouteId(requestedTab, '');
  if (!nextTab) {
    throw new Error(`Unknown Directive runtime tab "${requestedTab}"`);
  }
  return navigateToRoute(nextTab);
}

export const __directiveRuntimeShellTestHooks = Object.freeze({
  getActiveTab() {
    return activeTab;
  },
  getRouteHistory() {
    return [...routeHistory];
  },
  reset() {
    activeTab = 'starships';
    runtimeApp = null;
    routeHistory = [];
    if (canUseDocument()) {
      document.getElementById(DIRECTIVE_RUNTIME_PANEL_ID)?.remove();
    }
  }
});
