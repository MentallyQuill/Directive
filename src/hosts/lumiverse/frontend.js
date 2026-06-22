import {
  hideDirectiveRuntimePanel,
  setDirectiveRuntimeApp,
  setDirectiveRuntimeMountHost,
  showDirectiveRuntimePanel
} from '../../runtime/runtime-shell.js';

const STATUS_REQUEST_TYPE = 'directive.status.request';
const STATUS_RESPONSE_TYPE = 'directive.status';
const RUNTIME_REQUEST_TYPE = 'directive.runtime.request';
const RUNTIME_RESPONSE_TYPE = 'directive.runtime.response';

const DIRECTIVE_STYLESHEET_ID = 'directive-lumiverse-command-shell-styles';
const DIRECTIVE_APP_MOUNT_CLASS = 'directive-lumiverse-command-shelf-mount';
const DEFAULT_PLAYER_INPUT = [
  'Protect civilians first, keep the Breckenridge coordinated, preserve evidence,',
  'and accept a modest operational delay if safety requires it.'
].join(' ');

const PROXIED_RUNTIME_ACTIONS = Object.freeze([
  'importCampaignPackageArchive',
  'startCreatorDraft',
  'resumeCreatorDraft',
  'saveCreatorDraft',
  'generateCreatorSectionDraft',
  'cancelCreatorDraft',
  'returnCreatorToCampaignLibrary',
  'discardCreatorDraft',
  'acceptCreatorDraftAndStartCampaign',
  'loadGame',
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
  'commitOpenOrdersCandidateReview',
  'commitSideMissionOpportunityReview',
  'runSideMissionProviderAssistance',
  'startSideMissionOpportunityScene',
  'commitSideMissionOpportunitySceneBeat',
  'commitSideMissionOpportunityResolution',
  'startOpenOrdersAssignmentScene',
  'commitOpenOrdersAssignmentSceneBeat',
  'commitOpenOrdersAssignmentResolution',
  'retryNarrationForLastTurn',
  'runDirectiveAssist',
  'recoverCommandBearingPoint',
  'resetRuntimeUiState'
]);

function createElement(tagName, className = '', text = '') {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function installDirectiveStylesheet() {
  if (typeof document === 'undefined' || !document.head || document.getElementById?.(DIRECTIVE_STYLESHEET_ID)) {
    return;
  }
  const link = document.createElement('link');
  link.id = DIRECTIVE_STYLESHEET_ID;
  link.rel = 'stylesheet';
  link.href = 'styles/directive.css';
  document.head.appendChild(link);
}

function createFallbackMount() {
  const root = createElement('div', DIRECTIVE_APP_MOUNT_CLASS);
  const host = document.body || document.documentElement;
  host?.appendChild?.(root);
  return {
    root,
    destroy() {
      root.remove?.();
    }
  };
}

function createLumiverseAppMount(ctx) {
  if (typeof ctx?.ui?.mountApp === 'function') {
    try {
      const mount = ctx.ui.mountApp({
        className: DIRECTIVE_APP_MOUNT_CLASS,
        position: 'app-overlay'
      });
      if (mount?.root) {
        return {
          root: mount.root,
          destroy() {
            mount.destroy?.();
          }
        };
      }
    } catch (error) {
      console.warn?.('[Directive] Lumiverse app mount failed; using document fallback.', {
        message: error?.message || String(error)
      });
    }
  }
  return createFallbackMount();
}

function runtimeViewFromSummary(summary = null) {
  return {
    kind: 'directive.runtimeView',
    activeTab: 'campaign',
    activeScreen: 'campaign',
    activePackageId: summary?.activePackageId || null,
    activeSaveId: summary?.activeSaveId || null,
    activePackage: null,
    campaign: summary?.campaign || {},
    creator: null,
    campaignState: summary?.campaignState || null,
    host: summary?.host || {
      id: 'lumiverse',
      displayName: 'Lumiverse',
      capabilities: {}
    },
    storageDiagnostics: summary?.storageDiagnostics || null,
    lastDirectorTurn: summary?.lastOutcome || null,
    lastNarrationResult: summary?.lastNarration || null,
    lastCommandLogSummarySidecarResult: null,
    lastSideMissionProviderAssistResult: null,
    lastDirectiveAssistResult: null,
    lastStateSafetyResult: null,
    pendingDirectorTurn: summary?.pendingOutcome || null,
    pendingOutcomeReplacement: null,
    openOrdersReview: summary?.openOrdersReview || null,
    sideMissionOpportunityReview: null,
    lastError: summary?.lastError || null
  };
}

function createRuntimeError(errorLike) {
  const message = errorLike?.message || String(errorLike || 'Directive runtime action failed');
  const error = new Error(message);
  if (errorLike?.code) error.code = errorLike.code;
  return error;
}

function createLumiverseRuntimeProxy(ctx) {
  const pending = new Map();
  let requestId = 0;
  let latestView = null;
  let latestSummary = null;
  let latestResult = null;

  function remember(payload = {}) {
    if (payload.view) latestView = cloneJson(payload.view);
    if (payload.summary) latestSummary = cloneJson(payload.summary);
    if (payload.result) latestResult = cloneJson(payload.result);
  }

  function settle(payload = {}) {
    const id = payload.requestId || null;
    const waiter = id ? pending.get(id) : null;
    if (!waiter) return;
    pending.delete(id);
    if (payload.ok === false) {
      waiter.reject(createRuntimeError(payload.error));
      return;
    }
    waiter.resolve(payload);
  }

  function sendRuntimeRequest(action, params = {}) {
    requestId += 1;
    const id = `runtime-${requestId}`;
    return new Promise((resolve, reject) => {
      pending.set(id, { action, resolve, reject });
      try {
        ctx.sendToBackend({
          type: RUNTIME_REQUEST_TYPE,
          requestId: id,
          action,
          params: isObject(params) ? params : {}
        });
      } catch (error) {
        pending.delete(id);
        reject(error);
      }
    });
  }

  async function runRuntimeAction(action, params = {}) {
    const payload = await sendRuntimeRequest(action, params);
    remember(payload);
    return payload.result || payload.view || payload.summary || null;
  }

  async function runRuntimeView(action, params = {}) {
    const payload = await sendRuntimeRequest(action, params);
    remember(payload);
    const view = payload.view || payload.result?.view || latestView || runtimeViewFromSummary(payload.summary || latestSummary);
    return cloneJson(view);
  }

  const proxy = {
    async initialize() {
      return runRuntimeView('initialize');
    },
    async getCurrentView({ tabId = 'campaign' } = {}) {
      return runRuntimeView('getView', { tabId });
    },
    handleBackendMessage(message) {
      if (!message || typeof message !== 'object') return false;
      if (message.type === STATUS_RESPONSE_TYPE) {
        latestSummary = cloneJson(message.payload?.runtime?.lastView || latestSummary);
        return true;
      }
      if (message.type !== RUNTIME_RESPONSE_TYPE) return false;
      const payload = message.payload || {};
      remember(payload);
      settle(payload);
      return true;
    },
    getLatestView() {
      return cloneJson(latestView || runtimeViewFromSummary(latestSummary));
    },
    getLatestSummary() {
      return cloneJson(latestSummary);
    },
    getLatestResult() {
      return cloneJson(latestResult);
    },
    rejectPending(errorLike) {
      const error = createRuntimeError(errorLike);
      for (const waiter of pending.values()) {
        waiter.reject(error);
      }
      pending.clear();
    }
  };

  for (const action of PROXIED_RUNTIME_ACTIONS) {
    proxy[action] = (params = {}) => runRuntimeAction(action, params);
  }

  proxy.runDirectorTurn = (params = {}) => runRuntimeAction('runDirectorTurn', {
    playerInput: params.playerInput || DEFAULT_PLAYER_INPUT,
    ...params
  });
  proxy.generateNarrationForLastTurn = (params = {}) => runRuntimeAction('generateNarrationForLastTurn', params);

  return proxy;
}

function createLauncherTab(ctx) {
  if (typeof ctx?.ui?.registerDrawerTab !== 'function') {
    return null;
  }
  const tab = ctx.ui.registerDrawerTab({
    id: 'directive',
    title: 'Directive',
    shortName: 'Directive',
    headerTitle: 'Directive',
    description: 'Open Directive command shelf',
    keywords: ['directive', 'mission', 'sidecar', 'starship', 'crew']
  });

  const openShelf = () => {
    void showDirectiveRuntimePanel().catch((error) => {
      console.warn?.('[Directive] Failed to open Lumiverse command shelf.', {
        message: error?.message || String(error)
      });
    });
  };
  const unsubscribeActivate = typeof tab?.onActivate === 'function' ? tab.onActivate(openShelf) : null;
  if (tab?.root && typeof tab.root.appendChild === 'function') {
    const button = createElement('button', 'directive-button directive-lumiverse-launcher', 'Open Directive');
    button.type = 'button';
    button.addEventListener?.('click', openShelf);
    tab.root.replaceChildren?.(button);
  }

  return {
    destroy() {
      unsubscribeActivate?.();
      tab?.destroy?.();
    }
  };
}

function requestStatus(ctx) {
  try {
    ctx.sendToBackend({ type: STATUS_REQUEST_TYPE });
  } catch (error) {
    console.warn?.('[Directive] Failed to request Lumiverse status.', {
      message: error?.message || String(error)
    });
  }
}

export function setup(ctx) {
  installDirectiveStylesheet();
  const mount = createLumiverseAppMount(ctx);
  const runtimeProxy = createLumiverseRuntimeProxy(ctx);
  const launcher = createLauncherTab(ctx);
  const disposers = [];

  setDirectiveRuntimeMountHost(mount.root);
  setDirectiveRuntimeApp(runtimeProxy);

  const unsubscribeBackend = ctx.onBackendMessage?.((payload) => {
    runtimeProxy.handleBackendMessage(payload);
  });
  if (typeof unsubscribeBackend === 'function') {
    disposers.push(unsubscribeBackend);
  }

  requestStatus(ctx);
  void showDirectiveRuntimePanel().catch((error) => {
    runtimeProxy.rejectPending(error);
    console.warn?.('[Directive] Failed to initialize Lumiverse command shelf.', {
      message: error?.message || String(error)
    });
  });

  return () => {
    runtimeProxy.rejectPending(new Error('Directive Lumiverse frontend disposed.'));
    for (const dispose of disposers.splice(0)) dispose();
    hideDirectiveRuntimePanel();
    setDirectiveRuntimeApp(null);
    setDirectiveRuntimeMountHost(null);
    launcher?.destroy?.();
    mount.destroy?.();
  };
}
