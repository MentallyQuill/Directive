import { renderCharacterCreatorPanel } from '../ui/character-creator-panel.js';
import { renderCommandLogPanel } from '../ui/command-log-panel.js';
import { renderCrewPanel } from '../ui/crew-panel.js';
import { renderMissionPanel } from '../ui/mission-panel.js';
import { renderSettingsPanel } from '../ui/settings-panel.js';
import { renderShipPanel } from '../ui/ship-panel.js';
import { renderStarshipsPanel } from '../ui/starships-panel.js';
import {
  appendEmpty,
  appendSectionTitle,
  clearElement,
  createElement,
  createIcon
} from '../ui/runtime-ui-kit.js';

export const DIRECTIVE_RUNTIME_PANEL_ID = 'directive-runtime-panel';

export const DIRECTIVE_RUNTIME_TABS = Object.freeze([
  { id: 'starships', label: 'Starships' },
  { id: 'mission', label: 'Mission' },
  { id: 'crew', label: 'Crew' },
  { id: 'ship', label: 'Ship' },
  { id: 'log', label: 'Log' },
  { id: 'settings', label: 'Settings' }
]);

let activeTab = 'starships';
let runtimeApp = null;

function canUseDocument() {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

function tabLabel(tabId) {
  return DIRECTIVE_RUNTIME_TABS.find((tab) => tab.id === tabId)?.label || 'Starships';
}

function createPanel() {
  const panel = createElement('section', 'directive-runtime-panel');
  panel.id = DIRECTIVE_RUNTIME_PANEL_ID;
  panel.setAttribute('aria-label', 'Directive runtime');

  const header = createElement('header', 'directive-runtime-header');
  const title = createElement('div', 'directive-runtime-title');
  title.append(createIcon('fa-solid fa-compass directive-runtime-title-icon'));
  const titleText = createElement('span');
  titleText.textContent = 'Directive';
  title.append(titleText);

  const closeButton = createElement('button', 'directive-icon-button');
  closeButton.type = 'button';
  closeButton.title = 'Close Directive';
  closeButton.setAttribute('aria-label', 'Close Directive');
  closeButton.append(createIcon('fa-solid fa-xmark'));
  closeButton.addEventListener('click', hideDirectiveRuntimePanel);
  header.append(title, closeButton);

  const tabs = createElement('nav', 'directive-runtime-tabs');
  tabs.setAttribute('aria-label', 'Directive sections');
  for (const tab of DIRECTIVE_RUNTIME_TABS) {
    const button = createElement('button', 'directive-tab-button');
    button.type = 'button';
    button.dataset.tab = tab.id;
    button.textContent = tab.label;
    button.addEventListener('click', async () => {
      activeTab = tab.id;
      await refreshDirectiveRuntimePanel();
    });
    tabs.appendChild(button);
  }

  const body = createElement('main', 'directive-runtime-body');
  body.dataset.directiveRuntimeBody = 'true';

  panel.append(header, tabs, body);
  return panel;
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

function createRuntimeActions() {
  return {
    setActiveTab(tabId) {
      activeTab = tabId;
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
  await renderBody(panel);
  return { refreshed: true, activeTab };
}

export async function setDirectiveRuntimeTab(tabId) {
  const nextTab = String(tabId || '').trim();
  if (!DIRECTIVE_RUNTIME_TABS.some((tab) => tab.id === nextTab)) {
    throw new Error(`Unknown Directive runtime tab "${nextTab}"`);
  }
  activeTab = nextTab;
  return refreshDirectiveRuntimePanel();
}

export const __directiveRuntimeShellTestHooks = Object.freeze({
  getActiveTab() {
    return activeTab;
  },
  reset() {
    activeTab = 'starships';
    runtimeApp = null;
    if (canUseDocument()) {
      document.getElementById(DIRECTIVE_RUNTIME_PANEL_ID)?.remove();
    }
  }
});
