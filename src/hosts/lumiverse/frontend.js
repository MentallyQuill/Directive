import { createDirectiveCompactShell } from '../../ui/directive-compact-shell.js';
import { DIRECTIVE_PRIMARY_ROUTES, normalizeDirectiveRouteId } from '../../ui/directive-routes.mjs';

const STATUS_REQUEST_TYPE = 'directive.status.request';
const STATUS_RESPONSE_TYPE = 'directive.status';
const RUNTIME_REQUEST_TYPE = 'directive.runtime.request';
const RUNTIME_RESPONSE_TYPE = 'directive.runtime.response';

const DEFAULT_PLAYER_INPUT = [
  'Protect civilians first, keep the Breckinridge coordinated, preserve evidence,',
  'and accept a modest operational delay if safety requires it.'
].join(' ');

function createElement(tagName, {
  className = '',
  text = '',
  style = ''
} = {}) {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (text) {
    element.textContent = text;
  }
  if (style) {
    element.style.cssText = style;
  }
  return element;
}

function installShellStyles() {
  if (typeof document === 'undefined' || !document.head || document.getElementById?.('directive-lumiverse-shell-styles')) {
    return;
  }
  const style = document.createElement('style');
  style.id = 'directive-lumiverse-shell-styles';
  style.textContent = `
    .directive-lumiverse-shell {
      box-sizing: border-box;
      min-height: 100%;
      display: grid;
      grid-template-rows: auto minmax(0,1fr) auto;
      background: var(--lumiverse-surface,#ffffff);
      color: var(--lumiverse-text,#0f172a);
      overflow: hidden;
    }
    .directive-lumiverse-shell .directive-shell-topbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
      align-items: center;
      padding: 10px;
      border-bottom: 1px solid var(--lumiverse-border,rgba(148,163,184,0.22));
    }
    .directive-lumiverse-shell .directive-runtime-title {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      min-width: 0;
      font-size: 16px;
      font-weight: 700;
    }
    .directive-lumiverse-shell .directive-icon-button {
      min-height: 30px;
      border: 1px solid var(--lumiverse-border,rgba(148,163,184,0.35));
      border-radius: 6px;
      background: var(--lumiverse-fill-subtle,rgba(148,163,184,0.1));
      color: var(--lumiverse-text,#0f172a);
      font-size: 12px;
      cursor: pointer;
    }
    .directive-lumiverse-shell .directive-icon-button:disabled {
      opacity: 0.48;
      cursor: not-allowed;
    }
    .directive-lumiverse-shell .directive-icon-button:disabled:hover {
      border-color: var(--lumiverse-border,rgba(148,163,184,0.35));
      background: var(--lumiverse-fill-subtle,rgba(148,163,184,0.1));
    }
    .directive-lumiverse-shell .directive-shell-actions {
      display: inline-flex;
      gap: 4px;
      justify-content: flex-end;
    }
    .directive-lumiverse-shell .directive-runtime-body {
      min-height: 0;
      overflow: auto;
      padding: 12px;
    }
    .directive-lumiverse-shell .directive-mobile-bottom-bar {
      display: grid;
      grid-template-columns: repeat(var(--directive-mobile-bottom-tab-count,6),minmax(0,1fr));
      gap: 4px;
      align-items: stretch;
      padding: 7px 8px calc(7px + env(safe-area-inset-bottom,0px));
      border-top: 1px solid var(--lumiverse-border,rgba(148,163,184,0.35));
      background: var(--lumiverse-fill-subtle,rgba(148,163,184,0.12));
    }
    .directive-lumiverse-shell .directive-mobile-shell-action-bar {
      display: none;
    }
    .directive-lumiverse-shell .directive-mobile-shell-action,
    .directive-lumiverse-shell .directive-mobile-bottom-tab {
      min-width: 0;
      min-height: 42px;
      display: grid;
      place-items: center;
      gap: 2px;
      padding: 4px;
      border: 1px solid var(--lumiverse-border,rgba(148,163,184,0.35));
      border-radius: 6px;
      background: var(--lumiverse-surface,#ffffff);
      color: var(--lumiverse-text,#0f172a);
      font-size: 11px;
      cursor: pointer;
    }
    .directive-lumiverse-shell .directive-mobile-bottom-tab-active {
      border-color: var(--lumiverse-accent,#2563eb);
      background: color-mix(in srgb, var(--lumiverse-accent,#2563eb) 14%, transparent);
    }
    .directive-lumiverse-shell .directive-mobile-bottom-label {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .directive-lumiverse-shell .directive-mobile-bottom-icon,
    .directive-lumiverse-shell .directive-mobile-shell-action-icon {
      font-size: 12px;
      line-height: 1;
    }
    @media (max-width: 560px) {
      .directive-lumiverse-shell .directive-shell-topbar {
        grid-template-columns: minmax(0,1fr) auto;
      }
      .directive-lumiverse-shell .directive-mobile-bottom-bar { padding-inline: 6px; }
      .directive-lumiverse-shell .directive-mobile-shell-action,
      .directive-lumiverse-shell .directive-mobile-bottom-tab {
        min-height: 40px;
        font-size: 10.5px;
      }
    }
  `;
  document.head.appendChild(style);
}

function findRuntimeBody(element) {
  if (!element) {
    return null;
  }
  if (element.dataset?.directiveRuntimeBody === 'true') {
    return element;
  }
  for (const child of element.children || []) {
    const match = findRuntimeBody(child);
    if (match) return match;
  }
  return null;
}

function row(label, value) {
  const container = createElement('div', {
    style: 'display:grid;grid-template-columns:minmax(96px,0.42fr) 1fr;gap:10px;align-items:start;padding:6px 0;border-bottom:1px solid var(--lumiverse-border,rgba(148,163,184,0.22));'
  });
  container.append(
    createElement('div', {
      text: label,
      style: 'font-size:12px;color:var(--lumiverse-text-dim,#64748b);'
    }),
    createElement('div', {
      text: value || 'None',
      style: 'font-size:12.5px;color:var(--lumiverse-text,#0f172a);overflow-wrap:anywhere;'
    })
  );
  return container;
}

function button(label, onClick, {
  primary = false,
  disabled = false
} = {}) {
  const control = createElement('button', {
    text: label,
    style: [
      'min-height:30px;padding:0 10px;border-radius:6px;font-size:12px;cursor:pointer;',
      primary
        ? 'border:1px solid var(--lumiverse-accent,#2563eb);background:var(--lumiverse-accent,#2563eb);color:#fff;'
        : 'border:1px solid var(--lumiverse-border,rgba(148,163,184,0.35));background:var(--lumiverse-fill-subtle,rgba(148,163,184,0.1));color:var(--lumiverse-text,#0f172a);',
      disabled ? 'opacity:0.55;cursor:not-allowed;' : ''
    ].join('')
  });
  control.type = 'button';
  control.disabled = disabled;
  control.addEventListener('click', onClick);
  return control;
}

function permissionText(status) {
  const permissions = Array.isArray(status?.permissions) ? status.permissions : [];
  return permissions.length > 0 ? permissions.join(', ') : 'Pending';
}

function lastEventText(status) {
  const lastEvent = status?.events?.lastEvent;
  if (!lastEvent) {
    return 'No events observed';
  }
  return `${lastEvent.eventName || 'event'} at ${lastEvent.at || 'unknown time'}`;
}

function capabilityText(status) {
  const generation = status?.host?.capabilities?.generation || {};
  if (generation.batchConcurrent) {
    return 'Concurrent sidecars';
  }
  if (generation.batch) {
    return 'Batch sidecars';
  }
  return 'Sequential sidecars';
}

function runtimeSummary(status, runtime) {
  const summary = runtime || status?.runtime?.lastView || null;
  const primaryOpenOrdersInterval = (summary?.campaign?.openOrders?.intervals || [])[0] || null;
  if (!summary?.initialized) {
    return {
      loaded: false,
      campaign: 'No campaign loaded',
      activeSave: status?.runtime?.lastView?.activeSaveId || 'None',
      outcome: 'None',
      narration: 'None',
      saves: '0'
    };
  }
  return {
    loaded: true,
    campaign: summary.campaign
      ? `${summary.campaign.playerName || 'Player'} aboard ${summary.campaign.shipName || 'active ship'}`
      : 'No campaign loaded',
    activeSave: summary.activeSaveId || 'None',
    outcome: summary.lastOutcome
      ? `${summary.lastOutcome.resultBand || 'Outcome'}: ${summary.lastOutcome.summary || summary.lastOutcome.id || ''}`.trim()
      : summary.pendingOutcome
        ? `Pending: ${summary.pendingOutcome.summary || summary.pendingOutcome.id || ''}`.trim()
        : 'None',
    narration: summary.lastNarration?.ok
      ? summary.lastNarration.text
      : summary.lastNarration?.error || 'None',
    saves: String(summary.starships?.saveCount || 0),
    activeAssignmentId: summary.campaign?.openOrders?.activeAssignmentId || null,
    activeAssignment: (summary.campaign?.openOrders?.availableAssignments || [])
      .find((assignment) => assignment.id === summary.campaign?.openOrders?.activeAssignmentId)
      || (summary.campaign?.openOrders?.availableAssignments || [])[0]
      || null,
    reviewCandidate: (summary.openOrdersReview?.candidates || [])[0] || null,
    openOrdersProgress: primaryOpenOrdersInterval
      ? `${primaryOpenOrdersInterval.status || 'active'}: ${(primaryOpenOrdersInterval.completedAssignmentIds || []).length}/${primaryOpenOrdersInterval.totalAssignmentCount || primaryOpenOrdersInterval.requiredCompletionCount || 0}`
      : 'None',
    openOrdersSummary: primaryOpenOrdersInterval?.playerSummary || ''
  };
}

function latestSaveIdFromRuntime(runtime) {
  const packages = Array.isArray(runtime?.starships?.packages) ? runtime.starships.packages : [];
  const packageSave = packages.find((entry) => entry?.loadLatestSave)?.loadLatestSave || null;
  return packageSave || runtime?.activeSaveId || null;
}

function render(root, state, requestStatus, sendRuntimeAction) {
  installShellStyles();
  const busy = Boolean(state.pendingAction);
  const shell = createDirectiveCompactShell({
    title: 'Directive',
    label: 'Directive Lumiverse shelf',
    routes: DIRECTIVE_PRIMARY_ROUTES,
    activeRouteId: state.activeRoute,
    actions: [
      {
        id: 'refresh',
        label: 'Refresh Directive',
        title: 'Refresh Directive',
        icon: 'fa-solid fa-rotate',
        disabled: busy,
        onClick: requestStatus
      }
    ],
    onSelectRoute(routeId) {
      const nextRoute = normalizeDirectiveRouteId(routeId, state.activeRoute);
      if (nextRoute !== state.activeRoute) {
        state.activeRoute = nextRoute;
      }
      render(root, state, requestStatus, sendRuntimeAction);
    }
  });
  shell.classList?.add?.('directive-lumiverse-shell');
  const shellBody = findRuntimeBody(shell);

  const status = state.status;
  const runtime = runtimeSummary(status, state.runtime);
  const latestSaveId = latestSaveIdFromRuntime(state.runtime || status?.runtime?.lastView || null);
  const sidecars = state.lastRuntimeResult?.sidecars || status?.runtime?.lastResult?.sidecars || null;
  const body = createElement('div', {
    style: 'border-top:1px solid var(--lumiverse-border,rgba(148,163,184,0.22));'
  });
  const route = normalizeDirectiveRouteId(state.activeRoute, 'starships');
  const statusRows = [
    row('Host', status?.host?.displayName || 'Waiting'),
    row('Backend', status ? 'Loaded' : 'Waiting'),
    row('Permissions', status ? permissionText(status) : 'Pending'),
    row('Sidecars', status ? capabilityText(status) : 'Pending'),
    row('Tools', status?.features?.toolsRegistered ? 'Registered' : 'Not registered'),
    row('Interceptor', status?.features?.interceptorRegistered ? 'Registered' : 'Not registered'),
    row('Runtime', runtime.loaded ? 'Ready' : 'Not started'),
    row('Campaign', runtime.campaign),
    row('Active save', runtime.activeSave),
    row('Saves', runtime.saves),
    row('Last outcome', runtime.outcome),
    row('Narration', runtime.narration),
    row('Last sidecars', sidecars
      ? `${sidecars.strategy || 'sidecars'}: ${(sidecars.results || []).filter((entry) => entry.status === 'complete').length}/${(sidecars.results || []).length} complete`
      : 'None'),
    row('Last event', status ? lastEventText(status) : 'No events observed')
  ];
  const campaignRows = [
    row('Runtime', runtime.loaded ? 'Ready' : 'Not started'),
    row('Campaign', runtime.campaign),
    row('Active save', runtime.activeSave),
    row('Saves', runtime.saves),
    row('Last outcome', runtime.outcome),
    row('Narration', runtime.narration),
    row('Open Orders Candidate', runtime.reviewCandidate?.sideAssignmentTitle || 'None'),
    row('Open Orders', runtime.activeAssignment?.title || 'None'),
    row('Assignment Status', runtime.activeAssignment?.status || 'None'),
    row('Assignment Scene', runtime.activeAssignment?.sceneBrief?.sceneQuestion || 'None'),
    row('Scene Progress', runtime.activeAssignment?.sceneBeatCount ? `${runtime.activeAssignment.sceneBeatCount} beat${runtime.activeAssignment.sceneBeatCount === 1 ? '' : 's'}` : 'None'),
    row('Latest Scene Beat', runtime.activeAssignment?.latestSceneBeat || 'None'),
    row('Open Orders Progress', runtime.openOrdersProgress),
    row('Open Orders Summary', runtime.openOrdersSummary)
  ];
  if (route === 'settings') {
    body.append(...statusRows);
  } else {
    body.append(...campaignRows);
    if (route === 'log') {
      body.append(row('Last sidecars', sidecars
        ? `${sidecars.strategy || 'sidecars'}: ${(sidecars.results || []).filter((entry) => entry.status === 'complete').length}/${(sidecars.results || []).length} complete`
        : 'None'));
    }
    if (route === 'starships') {
      body.append(row('Host', status?.host?.displayName || 'Waiting'));
    }
  }

  if (state.error) {
    body.append(row('Error', state.error));
  }

  const controls = createElement('div', {
    style: 'display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--lumiverse-border,rgba(148,163,184,0.22));padding-top:10px;'
  });
  const actions = createElement('div', {
    style: 'display:flex;flex-wrap:wrap;gap:8px;'
  });
  actions.append(
    button('Initialize', () => sendRuntimeAction('initialize'), { disabled: busy }),
    button('Quick Start', () => sendRuntimeAction('startQuickCampaign'), { primary: !runtime.loaded, disabled: busy }),
    button('Load Latest', () => sendRuntimeAction('loadGame', {
      saveId: latestSaveId
    }), { disabled: busy || !latestSaveId }),
    button('Preview Turn', () => sendRuntimeAction('previewDirectorTurn', {
      playerInput: state.playerInput || DEFAULT_PLAYER_INPUT
    }), { disabled: busy || !runtime.loaded }),
    button('Commit Turn', () => sendRuntimeAction('commitProvisionalDirectorTurn', {
      confirmWarnings: true,
      generateNarration: true
    }), { primary: runtime.loaded, disabled: busy || !runtime.loaded }),
    button('Run Sidecars', () => sendRuntimeAction('runSidecars'), { disabled: busy || !runtime.loaded }),
    button('Start Candidate', () => sendRuntimeAction('commitOpenOrdersCandidateReview', {
      candidateId: runtime.reviewCandidate?.id,
      decision: 'start',
      maxCandidates: 3
    }), { disabled: busy || !runtime.loaded || !runtime.reviewCandidate || Boolean(runtime.activeAssignmentId) }),
    button('Defer Candidate', () => sendRuntimeAction('commitOpenOrdersCandidateReview', {
      candidateId: runtime.reviewCandidate?.id,
      decision: 'defer',
      maxCandidates: 3,
      reason: 'Player deferred this Open Orders candidate from Lumiverse.'
    }), { disabled: busy || !runtime.loaded || !runtime.reviewCandidate || Boolean(runtime.activeAssignmentId) }),
    button('Open Assignment', () => sendRuntimeAction('startOpenOrdersAssignmentScene', {
      assignmentId: runtime.activeAssignmentId
    }), { disabled: busy || !runtime.loaded || !runtime.activeAssignmentId || runtime.activeAssignment?.status === 'active' }),
    button('Advance Scene', () => sendRuntimeAction('commitOpenOrdersAssignmentSceneBeat', {
      assignmentId: runtime.activeAssignmentId,
      playerIntent: state.playerInput || DEFAULT_PLAYER_INPUT,
      approach: 'coordination'
    }), { disabled: busy || !runtime.loaded || !runtime.activeAssignmentId || runtime.activeAssignment?.status !== 'active' }),
    button('Resolve Assignment', () => sendRuntimeAction('commitOpenOrdersAssignmentResolution', {
      assignmentId: runtime.activeAssignmentId,
      assignmentMode: 'direct'
    }), { disabled: busy || !runtime.loaded || !runtime.activeAssignmentId || runtime.activeAssignment?.status !== 'active' }),
    button('Delegate Assignment', () => sendRuntimeAction('commitOpenOrdersAssignmentResolution', {
      assignmentId: runtime.activeAssignmentId,
      assignmentMode: 'delegated',
      delegatedTo: 'accountable Open Orders support'
    }), { disabled: busy || !runtime.loaded || !runtime.activeAssignmentId || runtime.activeAssignment?.status !== 'active' }),
    button('Save', () => sendRuntimeAction('saveCurrentGame', {
      summary: 'Lumiverse manual save.'
    }), { disabled: busy || !runtime.loaded })
  );
  const input = createElement('textarea', {
    style: 'box-sizing:border-box;width:100%;min-height:72px;resize:vertical;border:1px solid var(--lumiverse-border,rgba(148,163,184,0.35));border-radius:6px;padding:8px;background:var(--lumiverse-input,#fff);color:var(--lumiverse-text,#0f172a);font-size:12.5px;line-height:1.4;'
  });
  input.value = state.playerInput || DEFAULT_PLAYER_INPUT;
  input.addEventListener('input', () => {
    state.playerInput = input.value;
  });
  controls.append(actions, input);

  shellBody?.append(body, controls);
  root.replaceChildren(shell);
}

export function setup(ctx) {
  const state = {
    status: null,
    runtime: null,
    lastRuntimeResult: null,
    error: '',
    playerInput: DEFAULT_PLAYER_INPUT,
    pendingAction: '',
    requestId: 0,
    activeRoute: 'starships'
  };
  const tab = ctx.ui.registerDrawerTab({
    id: 'directive',
    title: 'Directive',
    shortName: 'Directive',
    headerTitle: 'Directive',
    description: 'Open Directive host status',
    keywords: [
      'directive',
      'mission',
      'sidecar'
    ]
  });
  const disposers = [];

  function requestStatus() {
    try {
      ctx.sendToBackend({
        type: STATUS_REQUEST_TYPE
      });
    } catch (error) {
      state.error = error?.message || String(error);
      render(tab.root, state, requestStatus, sendRuntimeAction);
    }
  }

  function sendRuntimeAction(action, params = {}) {
    try {
      state.requestId += 1;
      state.pendingAction = action;
      ctx.sendToBackend({
        type: RUNTIME_REQUEST_TYPE,
        requestId: `runtime-${state.requestId}`,
        action,
        params
      });
      render(tab.root, state, requestStatus, sendRuntimeAction);
    } catch (error) {
      state.pendingAction = '';
      state.error = error?.message || String(error);
      render(tab.root, state, requestStatus, sendRuntimeAction);
    }
  }

  const unsubscribeBackend = ctx.onBackendMessage((payload) => {
    if (!payload || typeof payload !== 'object') {
      return;
    }
    if (payload.type === STATUS_RESPONSE_TYPE) {
      state.status = payload.payload || null;
      state.runtime = payload.payload?.runtime?.lastView || state.runtime;
      state.error = '';
      render(tab.root, state, requestStatus, sendRuntimeAction);
      return;
    }
    if (payload.type === RUNTIME_RESPONSE_TYPE) {
      state.pendingAction = '';
      state.runtime = payload.payload?.summary || state.runtime;
      state.lastRuntimeResult = payload.payload?.result || state.lastRuntimeResult;
      state.error = payload.payload?.ok === false
        ? payload.payload?.error?.message || 'Directive runtime action failed'
        : '';
      render(tab.root, state, requestStatus, sendRuntimeAction);
    }
  });
  if (typeof unsubscribeBackend === 'function') {
    disposers.push(unsubscribeBackend);
  }

  render(tab.root, state, requestStatus, sendRuntimeAction);
  requestStatus();

  return () => {
    for (const dispose of disposers.splice(0)) {
      dispose();
    }
    tab.destroy?.();
  };
}
