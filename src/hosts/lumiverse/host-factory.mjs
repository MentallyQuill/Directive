import {
  createHostCapabilities,
  normalizeDirectiveHost
} from '../host-contract.mjs';
import { createLumiverseEventAdapter } from './events-adapter.mjs';
import { createLumiverseGenerationClient } from './generation-client.mjs';
import { createLumiverseStorageAdapter } from './storage-adapter.mjs';
import { createLumiverseToolAdapter } from './tools-adapter.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function createLumiverseLogger(spindle) {
  const logger = spindle?.log || console;
  return {
    debug: (...args) => logger.debug?.(...args) ?? logger.info?.(...args),
    info: (...args) => logger.info?.(...args),
    warn: (...args) => logger.warn?.(...args),
    error: (...args) => logger.error?.(...args)
  };
}

function createLumiverseUiAdapter({
  frontend = null,
  logger = null
} = {}) {
  const messages = [];

  function send(payload) {
    const message = cloneJson(payload);
    messages.push(message);
    if (typeof frontend?.send === 'function') {
      frontend.send(message);
    } else if (typeof frontend?.postMessage === 'function') {
      frontend.postMessage(message);
    } else {
      logger?.debug?.('[Directive] Lumiverse UI message queued without frontend bridge.', message);
    }
  }

  return {
    async mount() {
      send({
        type: 'directive.ui.mount'
      });
      return {
        ok: true,
        hostId: 'lumiverse'
      };
    },
    send,
    reportProgress(payload) {
      send({
        type: 'directive.job.progress',
        payload: cloneJson(payload)
      });
    },
    messages() {
      return cloneJson(messages);
    }
  };
}

export function createLumiverseDirectiveHost({
  spindle,
  userId = null,
  storageScope = 'user',
  generation = {},
  frontend = null,
  tools = true
} = {}) {
  requireObject(spindle, 'spindle');
  const logger = createLumiverseLogger(spindle);
  const eventAdapter = createLumiverseEventAdapter({ spindle });
  const canRegisterTools = tools !== false
    && typeof spindle.registerTool === 'function'
    && typeof spindle.on === 'function';
  const toolAdapter = canRegisterTools ? createLumiverseToolAdapter({ spindle }) : null;
  const storageApi = storageScope === 'shared' ? spindle.storage : (spindle.userStorage || spindle.storage || {});
  const generationApi = spindle.generate || {};
  const canRegisterInterceptor = typeof spindle.registerInterceptor === 'function';
  const canSendToFrontend = typeof frontend?.send === 'function' || typeof frontend?.postMessage === 'function';
  return normalizeDirectiveHost({
    id: 'lumiverse',
    displayName: 'Lumiverse',
    capabilities: createHostCapabilities({
      storage: {
        json: true,
        list: typeof storageApi.list === 'function',
        delete: typeof storageApi.delete === 'function',
        verify: typeof storageApi.exists === 'function',
        userScoped: storageScope !== 'shared'
      },
      generation: {
        quiet: typeof generationApi.quiet === 'function',
        raw: typeof generationApi.raw === 'function',
        batch: typeof generationApi.batch === 'function',
        batchConcurrent: typeof generationApi.batch === 'function',
        observeMainGeneration: typeof generationApi.observe === 'function',
        structuredOutput: typeof generationApi.raw === 'function' || typeof generationApi.quiet === 'function',
        toolCalling: typeof generationApi.raw === 'function' || typeof generationApi.quiet === 'function'
      },
      prompt: {
        contextHandlers: false,
        interceptors: canRegisterInterceptor,
        promptBreakdownAttribution: canRegisterInterceptor
      },
      tools: {
        registerTools: canRegisterTools,
        councilEligibleTools: canRegisterTools
      },
      ui: {
        frontendModule: canSendToFrontend,
        backendToFrontendMessages: canSendToFrontend
      },
      lifecycle: {
        install: true,
        update: true,
        enable: true,
        disable: true,
        delete: true
      }
    }),
    logger,
    storage: createLumiverseStorageAdapter({
      spindle,
      scope: storageScope,
      userId
    }),
    events: eventAdapter,
    generation: createLumiverseGenerationClient({
      spindle,
      ...generation
    }),
    chat: {},
    ui: createLumiverseUiAdapter({
      frontend,
      logger
    }),
    jobs: {
      disposeAll() {
        eventAdapter.disposeAll();
        toolAdapter?.disposeAll();
      }
    },
    tools: toolAdapter
  });
}

export const __lumiverseHostFactoryTestHooks = {
  createLumiverseUiAdapter
};
