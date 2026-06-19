import {
  createHostCapabilities,
  createHostContractError,
  normalizeDirectiveHost
} from '../host-contract.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createMissingFileError(filePath) {
  return createHostContractError(
    'DIRECTIVE_FAKE_HOST_FILE_MISSING',
    `Fake host file not found: ${filePath}`,
    { filePath }
  );
}

export function createFakeJsonStorage(initialFiles = {}) {
  const files = new Map();
  for (const [filePath, value] of Object.entries(initialFiles)) {
    files.set(filePath, cloneJson(value));
  }
  return {
    async readJson(filePath) {
      if (!files.has(filePath)) {
        throw createMissingFileError(filePath);
      }
      return cloneJson(files.get(filePath));
    },
    async writeJson(filePath, value) {
      files.set(filePath, cloneJson(value));
      return { ok: true, path: filePath };
    },
    async verifyJsonFiles(paths = []) {
      return Object.fromEntries(paths.map((filePath) => [filePath, files.has(filePath)]));
    },
    async deleteJsonFile(filePath) {
      const deleted = files.delete(filePath);
      return { ok: deleted, path: filePath };
    },
    async listJsonFiles(prefix = '') {
      return [...files.keys()].filter((filePath) => filePath.startsWith(prefix));
    },
    snapshot() {
      return Object.fromEntries([...files.entries()].map(([filePath, value]) => [filePath, cloneJson(value)]));
    }
  };
}

export function createFakeEventAdapter() {
  const handlers = new Map();
  return {
    on(eventName, handler) {
      if (!handlers.has(eventName)) {
        handlers.set(eventName, new Set());
      }
      handlers.get(eventName).add(handler);
      return () => handlers.get(eventName)?.delete(handler);
    },
    emit(eventName, payload) {
      for (const handler of handlers.get(eventName) || []) {
        handler(payload);
      }
    },
    listenerCount(eventName) {
      return handlers.get(eventName)?.size || 0;
    }
  };
}

export function createFakeGenerationClient({ responses = {}, defaultText = 'Fake generation response.' } = {}) {
  const calls = [];
  async function generate(role, request = {}) {
    calls.push({ role, request: cloneJson(request) });
    const response = responses[role] ?? { text: defaultText, providerId: `fake-${role}` };
    return cloneJson(response);
  }
  return {
    generate,
    role(roleName) {
      return {
        id: `fake-${roleName}`,
        async generateNarration(request = {}) {
          return generate(roleName, request);
        }
      };
    },
    calls() {
      return cloneJson(calls);
    }
  };
}

export function createFakeUiAdapter() {
  const messages = [];
  return {
    async mount() {
      messages.push({ type: 'mount' });
      return { ok: true };
    },
    send(payload) {
      messages.push({ type: 'send', payload: cloneJson(payload) });
    },
    reportProgress(payload) {
      messages.push({ type: 'progress', payload: cloneJson(payload) });
    },
    messages() {
      return cloneJson(messages);
    }
  };
}

export function createFakeDirectiveHost(options = {}) {
  return normalizeDirectiveHost({
    id: 'fake',
    displayName: options.displayName || 'Fake Host',
    capabilities: createHostCapabilities({
      storage: {
        list: true,
        delete: true,
        verify: true,
        userScoped: true
      },
      generation: {
        quiet: true,
        raw: true,
        batch: true,
        batchConcurrent: true,
        structuredOutput: true,
        toolCalling: true
      },
      ui: {
        panelMount: true,
        backendToFrontendMessages: true
      }
    }),
    logger: options.logger || console,
    storage: options.storage || createFakeJsonStorage(options.files),
    events: options.events || createFakeEventAdapter(),
    generation: options.generation || createFakeGenerationClient(options.generationOptions),
    chat: options.chat || {},
    ui: options.ui || createFakeUiAdapter(),
    jobs: options.jobs || {}
  });
}
