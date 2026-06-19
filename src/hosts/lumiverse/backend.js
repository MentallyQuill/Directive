import { createLumiverseDirectiveHost } from './host-factory.mjs';
import { registerLumiverseDirectiveInterceptor } from './interceptor-adapter.mjs';
import { createLumiversePromptBlocksFromRuntimeSummary } from './prompt-blocks.mjs';
import {
  createLumiverseRuntimeBridge,
  LUMIVERSE_RUNTIME_REQUEST_TYPE
} from './runtime-bridge.mjs';
import {
  createDirectiveRuntimeApp,
  loadBundledStarshipPackageRecords
} from '../../runtime/runtime-app.mjs';

const STATUS_REQUEST_TYPE = 'directive.status.request';
const STATUS_RESPONSE_TYPE = 'directive.status';
const ACTIVE_SITUATION_TOOL = 'directive_get_active_situation';
const SEARCH_COMMAND_LOG_TOOL = 'directive_search_command_log';
const CREW_CONTEXT_TOOL = 'directive_get_crew_context';
const SHIP_STATUS_TOOL = 'directive_get_ship_status';
const DIRECTIVE_TOOL_NAMES = Object.freeze([
  ACTIVE_SITUATION_TOOL,
  SEARCH_COMMAND_LOG_TOOL,
  CREW_CONTEXT_TOOL,
  SHIP_STATUS_TOOL
]);
const KNOWN_PERMISSIONS = Object.freeze([
  'generation',
  'interceptor',
  'tools'
]);
const WATCHED_EVENTS = Object.freeze([
  'messageSent',
  'messageEdited',
  'messageDeleted',
  'generationStarted',
  'generationEnded',
  'generationStopped'
]);

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function log(spindle, level, message, details) {
  const logger = spindle?.log || console;
  const writer = logger[level] || logger.info || console.log;
  if (details === undefined) {
    writer.call(logger, message);
  } else {
    writer.call(logger, message, details);
  }
}

function hasPermission(spindle, permission) {
  try {
    return spindle?.permissions?.has?.(permission) === true;
  } catch {
    return false;
  }
}

async function grantedPermissions(spindle) {
  if (typeof spindle?.permissions?.getGranted === 'function') {
    try {
      const granted = await spindle.permissions.getGranted();
      return Array.isArray(granted) ? granted.filter((entry) => typeof entry === 'string') : [];
    } catch (error) {
      log(spindle, 'warn', '[Directive] Failed to read Lumiverse permissions.', {
        message: error?.message || String(error)
      });
    }
  }
  return KNOWN_PERMISSIONS.filter((permission) => hasPermission(spindle, permission));
}

function createFrontendBridge(spindle, state) {
  return {
    send(message) {
      const targetUserId = state.lastFrontendUserId;
      state.uiMessageCount += 1;
      state.lastUiMessage = cloneJson(message);
      if (targetUserId && typeof spindle.sendToFrontend === 'function') {
        spindle.sendToFrontend({
          type: 'directive.ui.message',
          payload: cloneJson(message)
        }, targetUserId);
      }
    }
  };
}

function createLumiversePackageLoader(spindle) {
  const hookLoader = globalThis.__directiveLumiverseTestHooks?.packageLoader;
  if (typeof hookLoader === 'function') {
    return hookLoader;
  }

  const fetchImpl = async (url) => {
    if (typeof globalThis.fetch === 'function') {
      return globalThis.fetch(url);
    }
    throw new Error('Directive Lumiverse package loader requires fetch.');
  };

  return () => loadBundledStarshipPackageRecords({ fetchImpl });
}

function createRuntimeApp({ host, spindle }) {
  const hooks = globalThis.__directiveLumiverseTestHooks || {};
  return createDirectiveRuntimeApp({
    host,
    packageLoader: createLumiversePackageLoader(spindle),
    idFactory: typeof hooks.idFactory === 'function' ? hooks.idFactory : undefined,
    now: hooks.now || null
  });
}

function createRuntimeState() {
  return {
    initialized: false,
    busy: false,
    actionCount: 0,
    lastAction: null,
    lastActionAt: null,
    lastResult: null,
    lastView: null,
    lastError: null
  };
}

function sendToFrontendUser(spindle, payload, userId) {
  // Operator-scoped Lumiverse extensions broadcast when userId is omitted.
  if (!userId || typeof spindle?.sendToFrontend !== 'function') {
    return false;
  }
  spindle.sendToFrontend(payload, userId);
  return true;
}

function summarizeEventPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  return {
    chatId: payload.chatId || payload.chat_id || null,
    messageId: payload.messageId || payload.message_id || payload.id || null,
    generationId: payload.generationId || payload.generation_id || null,
    type: payload.type || null
  };
}

function createSituationToolResult({ host, state }) {
  const runtimeSummary = state.runtime?.lastView || null;
  return {
    summary: runtimeSummary?.campaign
      ? `Directive campaign "${runtimeSummary.campaign.title || runtimeSummary.campaign.id || 'active campaign'}" is loaded.`
      : 'Directive Lumiverse host is online. No Directive campaign is loaded yet.',
    host: {
      id: host.id,
      displayName: host.displayName
    },
    runtime: cloneJson(runtimeSummary),
    loadedAt: state.loadedAt,
    lastEvent: cloneJson(state.lastEvent),
    sidecars: {
      strategy: host.capabilities.generation.batchConcurrent ? 'concurrent' : 'sequential',
      active: false
    },
    safety: {
      hiddenStateIncluded: false,
      mutationAllowed: false
    }
  };
}

function normalizeLimit(value, fallback = 8, max = 25) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(1, Math.min(max, Math.floor(number)));
}

function playerSafeToolSafety() {
  return {
    hiddenStateIncluded: false,
    mutationAllowed: false
  };
}

function runtimeNotLoadedPayload(kind) {
  return {
    kind,
    summary: 'No Directive campaign is loaded yet.',
    loaded: false,
    safety: playerSafeToolSafety()
  };
}

function commandLogEntries(runtimeSummary) {
  const entries = runtimeSummary?.campaign?.commandLog?.entries;
  return Array.isArray(entries) ? entries : [];
}

function createCommandLogSearchToolResult({ state, args = {} }) {
  const runtimeSummary = state.runtime?.lastView || null;
  if (!runtimeSummary?.initialized) {
    return runtimeNotLoadedPayload('directive.commandLogSearch');
  }
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  const normalizedQuery = query.toLowerCase();
  const limit = normalizeLimit(args.limit, 8, 25);
  const entries = commandLogEntries(runtimeSummary);
  const matches = entries
    .filter((entry) => {
      if (!normalizedQuery) {
        return true;
      }
      const searchable = [
        entry.id,
        entry.type,
        entry.stardate,
        entry.sourceOutcomeId,
        entry.summary,
        ...(entry.visibleConsequences || [])
      ].join(' ').toLowerCase();
      return searchable.includes(normalizedQuery);
    })
    .slice(-limit)
    .reverse();
  return {
    kind: 'directive.commandLogSearch',
    loaded: true,
    query,
    totalEntries: entries.length,
    matchCount: matches.length,
    matches: cloneJson(matches),
    safety: playerSafeToolSafety()
  };
}

function createCrewContextToolResult({ state }) {
  const runtimeSummary = state.runtime?.lastView || null;
  if (!runtimeSummary?.initialized) {
    return runtimeNotLoadedPayload('directive.crewContext');
  }
  return {
    kind: 'directive.crewContext',
    loaded: true,
    campaign: cloneJson(runtimeSummary.campaign || null),
    crew: cloneJson(runtimeSummary.crew || null),
    safety: playerSafeToolSafety()
  };
}

function createShipStatusToolResult({ state }) {
  const runtimeSummary = state.runtime?.lastView || null;
  if (!runtimeSummary?.initialized) {
    return runtimeNotLoadedPayload('directive.shipStatus');
  }
  return {
    kind: 'directive.shipStatus',
    loaded: true,
    campaign: cloneJson(runtimeSummary.campaign || null),
    ship: cloneJson(runtimeSummary.ship || null),
    safety: playerSafeToolSafety()
  };
}

function createStatusPayload({ host, state, permissions }) {
  return {
    host: {
      id: host.id,
      displayName: host.displayName,
      capabilities: cloneJson(host.capabilities)
    },
    loadedAt: state.loadedAt,
    checkedAt: nowIso(),
    permissions,
    features: {
      toolsRegistered: state.toolsRegistered,
      interceptorRegistered: state.interceptorRegistered,
      backendToFrontendMessages: typeof globalThis.spindle?.sendToFrontend === 'function'
    },
    events: {
      messageEvents: state.messageEvents,
      generationEvents: state.generationEvents,
      lastEvent: cloneJson(state.lastEvent)
    },
    ui: {
      messageCount: state.uiMessageCount,
      lastMessage: cloneJson(state.lastUiMessage)
    },
    runtime: cloneJson(state.runtime || null),
    diagnostics: {
      lastPermissionDenied: cloneJson(state.lastPermissionDenied),
      lastError: cloneJson(state.lastError)
    }
  };
}

function setupEventTracking({ host, state }) {
  if (typeof host.events?.on !== 'function') {
    return null;
  }
  const unsubscribers = WATCHED_EVENTS.map((eventName) => host.events.on(eventName, (payload) => {
    if (eventName.startsWith('generation')) {
      state.generationEvents += 1;
    } else {
      state.messageEvents += 1;
    }
    state.lastEvent = {
      eventName,
      at: nowIso(),
      payload: summarizeEventPayload(payload)
    };
  }));
  return () => {
    for (const unsubscribe of unsubscribers.splice(0)) {
      unsubscribe();
    }
  };
}

function setupTools({ host, spindle, state }) {
  function registerTools() {
    if (state.toolsRegistered || !host.tools || !hasPermission(spindle, 'tools')) {
      return false;
    }
    host.tools.registerTool({
      name: ACTIVE_SITUATION_TOOL,
      display_name: 'Directive Active Situation',
      description: 'Return a player-safe Directive host status summary. Does not mutate state or reveal hidden campaign data.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false
      },
      council_eligible: true
    }, async () => createSituationToolResult({
      host,
      state
    }));
    host.tools.registerTool({
      name: SEARCH_COMMAND_LOG_TOOL,
      display_name: 'Directive Search Command Log',
      description: 'Search player-facing Directive command log entries. Does not mutate state or reveal hidden campaign data.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Optional case-insensitive text to search for in player-facing command log summaries.'
          },
          limit: {
            type: 'number',
            minimum: 1,
            maximum: 25,
            description: 'Maximum number of matching entries to return.'
          }
        },
        additionalProperties: false
      },
      council_eligible: true
    }, async ({ args }) => createCommandLogSearchToolResult({
      state,
      args
    }));
    host.tools.registerTool({
      name: CREW_CONTEXT_TOOL,
      display_name: 'Directive Crew Context',
      description: 'Return player-safe Directive senior crew context. Does not expose hidden relationship values or mutate state.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false
      },
      council_eligible: true
    }, async () => createCrewContextToolResult({
      state
    }));
    host.tools.registerTool({
      name: SHIP_STATUS_TOOL,
      display_name: 'Directive Ship Status',
      description: 'Return player-safe Directive ship condition and technical status. Does not mutate state or reveal hidden campaign data.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false
      },
      council_eligible: true
    }, async () => createShipStatusToolResult({
      state
    }));
    state.toolsRegistered = true;
    state.toolsRegisteredAt = nowIso();
    return true;
  }

  function unregisterTools() {
    if (!state.toolsRegistered || !host.tools) {
      return false;
    }
    for (const toolName of DIRECTIVE_TOOL_NAMES) {
      host.tools.unregisterTool?.(toolName);
    }
    state.toolsRegistered = false;
    return true;
  }

  registerTools();
  return {
    registerTools,
    unregisterTools
  };
}

function setupInterceptor({ spindle, state }) {
  function registerInterceptor() {
    if (state.interceptorRegistered || !hasPermission(spindle, 'interceptor')) {
      return false;
    }
    state.interceptorUnsubscribe = registerLumiverseDirectiveInterceptor({
      spindle,
      priority: 80,
      attributionLabel: 'Directive Context',
      async buildPromptBlocks() {
        return createLumiversePromptBlocksFromRuntimeSummary(state.runtime?.lastView, {
          revision: state.runtime?.actionCount || null
        });
      }
    });
    state.interceptorRegistered = true;
    state.interceptorRegisteredAt = nowIso();
    return true;
  }

  registerInterceptor();
  return {
    registerInterceptor
  };
}

function setupPermissionHandlers({ spindle, state, tools, interceptor }) {
  const disposers = [];
  const deniedUnsubscribe = spindle.permissions?.onDenied?.((detail) => {
    state.lastPermissionDenied = {
      ...cloneJson(detail),
      at: nowIso()
    };
    log(spindle, 'warn', '[Directive] Lumiverse permission denied.', state.lastPermissionDenied);
  });
  if (typeof deniedUnsubscribe === 'function') {
    disposers.push(deniedUnsubscribe);
  }

  const changedUnsubscribe = spindle.permissions?.onChanged?.((detail) => {
    const permission = detail?.permission;
    const granted = detail?.granted === true;
    if (permission === 'tools') {
      if (granted) {
        tools.registerTools();
      } else {
        tools.unregisterTools();
      }
    }
    if (permission === 'interceptor' && granted) {
      interceptor.registerInterceptor();
    }
  });
  if (typeof changedUnsubscribe === 'function') {
    disposers.push(changedUnsubscribe);
  }

  return () => {
    for (const dispose of disposers.splice(0)) {
      dispose();
    }
  };
}

function createRuntimeContextManager({ spindle, state }) {
  const contexts = new Map();

  function getForUser(userId) {
    if (!userId || typeof userId !== 'string') {
      return null;
    }
    if (contexts.has(userId)) {
      return contexts.get(userId);
    }
    const contextState = {
      runtime: createRuntimeState()
    };
    const runtimeHost = createLumiverseDirectiveHost({
      spindle,
      userId,
      frontend: createFrontendBridge(spindle, state),
      tools: false
    });
    const runtimeApp = createRuntimeApp({
      host: runtimeHost,
      spindle
    });
    const runtimeBridge = createLumiverseRuntimeBridge({
      host: runtimeHost,
      runtimeApp,
      state: contextState,
      sendToFrontend: (payload, targetUserId) => sendToFrontendUser(spindle, payload, targetUserId),
      logger: runtimeHost.logger
    });
    const context = {
      userId,
      host: runtimeHost,
      runtimeApp,
      runtimeBridge,
      state: contextState
    };
    contexts.set(userId, context);
    return context;
  }

  function syncLastRuntime(context) {
    if (!context) {
      return;
    }
    state.lastRuntimeUserId = context.userId;
    state.runtime = cloneJson(context.state.runtime || createRuntimeState());
  }

  function disposeAll() {
    for (const context of contexts.values()) {
      context.host.jobs?.disposeAll?.();
    }
    contexts.clear();
  }

  return {
    getForUser,
    syncLastRuntime,
    disposeAll,
    contexts
  };
}

function setupFrontendMessages({ spindle, host, state, runtimeContexts }) {
  if (typeof spindle.onFrontendMessage !== 'function') {
    return null;
  }
  return spindle.onFrontendMessage(async (payload, userId) => {
    if (userId) {
      state.lastFrontendUserId = userId;
    }
    if (payload?.type === LUMIVERSE_RUNTIME_REQUEST_TYPE) {
      const runtimeContext = runtimeContexts.getForUser(userId);
      if (runtimeContext) {
        await runtimeContext.runtimeBridge.handleRuntimeRequest(payload, userId);
        runtimeContexts.syncLastRuntime(runtimeContext);
      }
      return;
    }
    if (!payload || typeof payload !== 'object' || payload.type !== STATUS_REQUEST_TYPE) {
      return;
    }
    const permissions = await grantedPermissions(spindle);
    sendToFrontendUser(spindle, {
      type: STATUS_RESPONSE_TYPE,
      payload: createStatusPayload({
        host,
        state,
        permissions
      })
    }, userId);
  });
}

const spindle = globalThis.spindle;
if (!spindle || typeof spindle !== 'object') {
  throw new Error('Directive Lumiverse backend requires globalThis.spindle.');
}

const state = {
  loadedAt: nowIso(),
  lastFrontendUserId: null,
  lastRuntimeUserId: null,
  lastError: null,
  lastEvent: null,
  lastPermissionDenied: null,
  runtime: createRuntimeState(),
  messageEvents: 0,
  generationEvents: 0,
  toolsRegistered: false,
  toolsRegisteredAt: null,
  interceptorRegistered: false,
  interceptorRegisteredAt: null,
  interceptorUnsubscribe: null,
  uiMessageCount: 0,
  lastUiMessage: null
};

const host = createLumiverseDirectiveHost({
  spindle,
  frontend: createFrontendBridge(spindle, state)
});
const runtimeContexts = createRuntimeContextManager({
  spindle,
  state
});
const unsubscribeEvents = setupEventTracking({
  host,
  state
});
const tools = setupTools({
  host,
  spindle,
  state
});
const interceptor = setupInterceptor({
  spindle,
  state
});
const unsubscribePermissions = setupPermissionHandlers({
  spindle,
  state,
  tools,
  interceptor
});
const unsubscribeFrontendMessages = setupFrontendMessages({
  spindle,
  host,
  state,
  runtimeContexts
});

log(spindle, 'info', '[Directive] Lumiverse backend loaded.');

export const directiveLumiverseBackend = {
  host,
  getRuntimeContext: runtimeContexts.getForUser,
  runtimeContexts,
  state,
  async status() {
    return createStatusPayload({
      host,
      state,
      permissions: await grantedPermissions(spindle)
    });
  },
  registerTools: tools.registerTools,
  unregisterTools: tools.unregisterTools,
  registerInterceptor: interceptor.registerInterceptor,
  dispose() {
    unsubscribeEvents?.();
    unsubscribeFrontendMessages?.();
    unsubscribePermissions?.();
    state.interceptorUnsubscribe?.();
    runtimeContexts.disposeAll();
    host.jobs?.disposeAll?.();
  }
};
