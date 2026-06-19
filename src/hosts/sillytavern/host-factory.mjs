import {
  createHostCapabilities,
  normalizeDirectiveHost
} from '../host-contract.mjs';
import { createSillyTavernEventAdapter } from './events-adapter.mjs';
import { createSillyTavernGenerationClient } from './generation-client.mjs';
import { createSillyTavernStorageAdapter } from './storage-adapter.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function createSillyTavernLogger(context) {
  const logger = context?.logger || console;
  return {
    debug: (...args) => logger.debug?.(...args) ?? logger.info?.(...args),
    info: (...args) => logger.info?.(...args),
    warn: (...args) => logger.warn?.(...args),
    error: (...args) => logger.error?.(...args)
  };
}

function createSillyTavernUiAdapter({
  mount = null,
  send = null
} = {}) {
  const messages = [];
  return {
    async mount() {
      messages.push({
        type: 'directive.ui.mount'
      });
      if (typeof mount === 'function') {
        return mount();
      }
      return {
        ok: true,
        hostId: 'sillytavern'
      };
    },
    send(payload) {
      const message = cloneJson(payload);
      messages.push(message);
      if (typeof send === 'function') {
        send(message);
      }
    },
    reportProgress(payload) {
      this.send({
        type: 'directive.job.progress',
        payload: cloneJson(payload)
      });
    },
    messages() {
      return cloneJson(messages);
    }
  };
}

export function createSillyTavernDirectiveHost({
  context,
  contextFactory = null,
  storage = null,
  ui = {}
} = {}) {
  const resolvedContext = context || contextFactory?.();
  requireObject(resolvedContext, 'SillyTavern context');
  const logger = createSillyTavernLogger(resolvedContext);
  const eventAdapter = createSillyTavernEventAdapter({
    context: resolvedContext
  });
  const hasGeneration = typeof resolvedContext.generateRaw === 'function'
    || typeof resolvedContext.generate === 'function'
    || typeof resolvedContext.generateText === 'function';
  const hasPanelMount = typeof ui.mount === 'function';

  return normalizeDirectiveHost({
    id: 'sillytavern',
    displayName: 'SillyTavern',
    capabilities: createHostCapabilities({
      storage: {
        json: true,
        verify: true,
        delete: true,
        userScoped: true
      },
      generation: {
        currentChatModel: hasGeneration,
        quiet: false,
        raw: typeof resolvedContext.generateRaw === 'function',
        batch: false,
        batchConcurrent: false,
        stream: false,
        observeMainGeneration: false,
        structuredOutput: false,
        toolCalling: false
      },
      prompt: {
        contextHandlers: false,
        interceptors: false,
        promptBreakdownAttribution: false
      },
      ui: {
        panelMount: hasPanelMount
      },
      lifecycle: {
        enable: true,
        disable: true
      }
    }),
    logger,
    storage: storage || createSillyTavernStorageAdapter({
      getRequestHeaders: typeof resolvedContext.getRequestHeaders === 'function'
        ? () => resolvedContext.getRequestHeaders()
        : undefined
    }),
    events: eventAdapter,
    generation: createSillyTavernGenerationClient({
      contextFactory: () => resolvedContext
    }),
    chat: {},
    ui: createSillyTavernUiAdapter(ui),
    jobs: {
      disposeAll() {
        eventAdapter.disposeAll();
      }
    }
  });
}

export const __sillyTavernHostFactoryTestHooks = {
  createSillyTavernUiAdapter
};
