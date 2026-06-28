import {
  createHostCapabilities,
  normalizeDirectiveHost
} from '../host-contract.mjs';
import { createSillyTavernEventAdapter } from './events-adapter.mjs';
import { createSillyTavernGenerationClient } from './generation-client.mjs';
import { createSillyTavernStorageAdapter } from './storage-adapter.mjs';
import { createSillyTavernFileStorageAdapter } from './file-api.mjs';
import { createSillyTavernChatAdapter } from './chat-adapter.mjs';
import { createSillyTavernPromptAdapter } from './prompt-adapter.mjs';
import { createSillyTavernProviderSettingsStore } from '../../providers/directive-provider-settings.mjs';
import { createDirectiveProviderClient } from './provider-client.mjs';
import { createSillyTavernDirectivePresetManager } from './preset-manager.mjs';
import { reportDirectiveJobProgress } from './turn-activity-indicator.js';

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

function createSillyTavernUiAdapter({ mount = null, send = null } = {}) {
  const messages = [];
  return {
    async mount() {
      messages.push({ type: 'directive.ui.mount' });
      if (typeof mount === 'function') return mount();
      return { ok: true, hostId: 'sillytavern' };
    },
    send(payload) {
      const message = cloneJson(payload);
      messages.push(message);
      if (typeof send === 'function') send(message);
    },
    reportProgress(payload) {
      try {
        reportDirectiveJobProgress(payload);
      } catch (error) {
        console.warn('[Directive] Failed to render job progress:', error);
      }
      this.send({ type: 'directive.job.progress', payload: cloneJson(payload) });
    },
    messages() {
      return cloneJson(messages);
    }
  };
}

function hasChatCompletionPresetManager(context) {
  if (typeof context?.getPresetManager !== 'function') return false;
  try {
    return Boolean(context.getPresetManager('openai'));
  } catch (_) {
    return false;
  }
}

export function createSillyTavernDirectiveHost({
  context,
  contextFactory = null,
  storage = null,
  storageMode = 'logical',
  ui = {}
} = {}) {
  const getContext = typeof contextFactory === 'function'
    ? contextFactory
    : () => context || globalThis.SillyTavern?.getContext?.() || null;
  const resolvedContext = getContext();
  requireObject(resolvedContext, 'SillyTavern context');

  const logger = createSillyTavernLogger(resolvedContext);
  const eventAdapter = createSillyTavernEventAdapter({ context: resolvedContext });
  const providerSettings = createSillyTavernProviderSettingsStore({ context: resolvedContext });
  const providerClient = createDirectiveProviderClient({
    contextFactory: getContext,
    settingsStore: providerSettings
  });
  const chat = createSillyTavernChatAdapter({ contextFactory: getContext });
  const prompt = createSillyTavernPromptAdapter({ contextFactory: getContext });
  const presets = createSillyTavernDirectivePresetManager({ contextFactory: getContext });
  const hasGeneration = typeof resolvedContext.generateRaw === 'function'
    || typeof resolvedContext.generateQuietPrompt === 'function'
    || typeof resolvedContext.generate === 'function'
    || typeof resolvedContext.generateText === 'function';
  const hasPromptApi = typeof resolvedContext.setExtensionPrompt === 'function'
    || typeof globalThis.setExtensionPrompt === 'function'
    || typeof globalThis.SillyTavern?.setExtensionPrompt === 'function';
  const hasPresetManager = hasChatCompletionPresetManager(resolvedContext);

  return normalizeDirectiveHost({
    id: 'sillytavern',
    displayName: 'SillyTavern',
    capabilities: createHostCapabilities({
      storage: {
        json: true,
        binary: true,
        verify: true,
        delete: true,
        userScoped: true
      },
      generation: {
        currentChatModel: hasGeneration,
        quiet: typeof resolvedContext.generateQuietPrompt === 'function',
        raw: typeof resolvedContext.generateRaw === 'function',
        batch: hasGeneration,
        batchConcurrent: false,
        stream: false,
        observeMainGeneration: true,
        connectionProfiles: typeof (
          resolvedContext.ConnectionManagerRequestService
          || globalThis.ConnectionManagerRequestService
        )?.sendRequest === 'function',
        structuredOutput: typeof resolvedContext.generateRaw === 'function',
        toolCalling: false
      },
      prompt: {
        contextHandlers: hasPromptApi,
        interceptors: true,
        promptBreakdownAttribution: hasPromptApi,
        install: hasPromptApi,
        update: hasPromptApi,
        clear: hasPromptApi,
        rebuild: hasPromptApi,
        lifecycle: hasPromptApi,
        scopedToChat: hasPromptApi
      },
      chat: {
        identity: true,
        create: true,
        bind: true,
        open: true,
        clone: true,
        postAssistant: true,
        postAssistantMessage: true,
        assistantSwipes: true,
        observeMessages: true,
        messageObservation: true,
        editRecovery: true,
        messageEditObservation: true,
        messageDeleteObservation: true,
        metadata: true
      },
      ui: {
        panelMount: typeof ui.mount === 'function'
      },
      presets: {
        narrationContext: hasPresetManager,
        chatCompletion: hasPresetManager,
        install: hasPresetManager,
        versionedInstall: hasPresetManager
      },
      lifecycle: {
        enable: true,
        disable: true
      }
    }),
    logger,
    storage: storage || (storageMode === 'logical'
      ? createSillyTavernStorageAdapter({
          getRequestHeaders: typeof resolvedContext.getRequestHeaders === 'function'
            ? () => resolvedContext.getRequestHeaders()
            : undefined
        })
      : createSillyTavernFileStorageAdapter({
          getRequestHeaders: typeof resolvedContext.getRequestHeaders === 'function'
            ? () => resolvedContext.getRequestHeaders()
            : undefined
        })),
    events: eventAdapter,
    generation: createSillyTavernGenerationClient({
      contextFactory: getContext,
      providerClient
    }),
    providers: {
      settings: providerSettings,
      client: providerClient,
      getSettings: () => providerSettings.getAll(),
      updateSettings(kind, patch) {
        return providerSettings.update(kind, patch);
      },
      updateRoleProviderKind(roleId, providerKind) {
        return providerSettings.updateRoleProviderKind(roleId, providerKind);
      },
      resetRoleProviderKind(roleId) {
        return providerSettings.resetRoleProviderKind(roleId);
      },
      listRoleRouting() {
        return providerSettings.listRoleRouting();
      },
      validate: (kind = null) => providerSettings.validate(kind),
      test: (kind) => providerClient.test(kind),
      status: (kind) => providerClient.status(kind),
      listProfiles: () => providerClient.listProfiles()
    },
    chat,
    prompt,
    presets,
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
