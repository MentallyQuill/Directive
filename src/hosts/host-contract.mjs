export const DIRECTIVE_HOST_IDS = Object.freeze([
  'fake',
  'sillytavern',
  'lumiverse'
]);

const DEFAULT_CAPABILITIES = Object.freeze({
  storage: {
    json: true,
    binary: false,
    list: false,
    delete: false,
    verify: false,
    userScoped: false
  },
  generation: {
    currentChatModel: false,
    quiet: false,
    raw: false,
    batch: false,
    batchConcurrent: false,
    stream: false,
    observeMainGeneration: false,
    connectionProfiles: false,
    structuredOutput: false,
    toolCalling: false
  },
  prompt: {
    contextHandlers: false,
    interceptors: false,
    promptBreakdownAttribution: false
  },
  tools: {
    registerTools: false,
    councilEligibleTools: false
  },
  ui: {
    panelMount: false,
    frontendModule: false,
    backendToFrontendMessages: false,
    tabLocation: false,
    styleMode: false,
    automation: false,
    sharedComponents: false
  },
  chat: {
    domRegistry: false,
    characterDisplay: false,
    regexMacros: false
  },
  worldBooks: {
    attachments: false
  },
  presets: {
    variables: false
  },
  installer: {
    unifiedHubInstall: false
  },
  lifecycle: {
    install: false,
    update: false,
    enable: false,
    disable: false,
    delete: false
  }
});

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function mergeObjects(base, override) {
  const next = cloneJson(base);
  if (!isObject(override)) {
    return next;
  }
  for (const [key, value] of Object.entries(override)) {
    if (isObject(value) && isObject(next[key])) {
      next[key] = mergeObjects(next[key], value);
    } else {
      next[key] = value;
    }
  }
  return next;
}

function requireFunction(value, path) {
  if (typeof value !== 'function') {
    throw new Error(`${path} must be a function`);
  }
}

function requireObject(value, path) {
  if (!isObject(value)) {
    throw new Error(`${path} must be an object`);
  }
}

export function createHostCapabilities(overrides = {}) {
  return mergeObjects(DEFAULT_CAPABILITIES, overrides);
}

export function assertDirectiveStorageAdapter(storage, path = 'host.storage') {
  requireObject(storage, path);
  requireFunction(storage.readJson, `${path}.readJson`);
  requireFunction(storage.writeJson, `${path}.writeJson`);
  if (storage.verifyJsonFiles !== undefined) {
    requireFunction(storage.verifyJsonFiles, `${path}.verifyJsonFiles`);
  }
  if (storage.deleteJsonFile !== undefined) {
    requireFunction(storage.deleteJsonFile, `${path}.deleteJsonFile`);
  }
  if (storage.listJsonFiles !== undefined) {
    requireFunction(storage.listJsonFiles, `${path}.listJsonFiles`);
  }
  return storage;
}

export function assertDirectiveGenerationClient(generation, path = 'host.generation') {
  requireObject(generation, path);
  requireFunction(generation.generate, `${path}.generate`);
  if (generation.role !== undefined) {
    requireFunction(generation.role, `${path}.role`);
  }
  if (generation.observe !== undefined) {
    requireFunction(generation.observe, `${path}.observe`);
  }
  return generation;
}

export function assertDirectiveEventAdapter(events, path = 'host.events') {
  requireObject(events, path);
  requireFunction(events.on, `${path}.on`);
  return events;
}

export function assertDirectiveUiAdapter(ui, path = 'host.ui') {
  requireObject(ui, path);
  if (ui.mount !== undefined) {
    requireFunction(ui.mount, `${path}.mount`);
  }
  if (ui.send !== undefined) {
    requireFunction(ui.send, `${path}.send`);
  }
  if (ui.reportProgress !== undefined) {
    requireFunction(ui.reportProgress, `${path}.reportProgress`);
  }
  return ui;
}

export function assertDirectiveHost(host) {
  requireObject(host, 'host');
  if (!DIRECTIVE_HOST_IDS.includes(host.id)) {
    throw new Error(`host.id must be one of: ${DIRECTIVE_HOST_IDS.join(', ')}`);
  }
  if (typeof host.displayName !== 'string' || host.displayName.trim() === '') {
    throw new Error('host.displayName must be a non-empty string');
  }
  requireObject(host.capabilities, 'host.capabilities');
  assertDirectiveStorageAdapter(host.storage);
  assertDirectiveGenerationClient(host.generation);
  assertDirectiveEventAdapter(host.events);
  assertDirectiveUiAdapter(host.ui);
  if (host.jobs !== undefined) {
    requireObject(host.jobs, 'host.jobs');
  }
  return host;
}

export function normalizeDirectiveHost(host) {
  assertDirectiveHost(host);
  return {
    ...host,
    displayName: host.displayName.trim(),
    capabilities: createHostCapabilities(host.capabilities)
  };
}

export function createHostContractError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = cloneJson(details);
  return error;
}
