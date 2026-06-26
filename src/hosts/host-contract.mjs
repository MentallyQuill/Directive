export const DIRECTIVE_HOST_IDS = Object.freeze([
  'fake',
  'sillytavern'
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
    promptBreakdownAttribution: false,
    install: false,
    update: false,
    clear: false,
    rebuild: false,
    lifecycle: false,
    scopedToChat: false
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
    regexMacros: false,
    identity: false,
    create: false,
    bind: false,
    open: false,
    postAssistant: false,
    postAssistantMessage: false,
    assistantSwipes: false,
    observeMessages: false,
    messageObservation: false,
    editRecovery: false,
    messageEditObservation: false,
    messageDeleteObservation: false,
    metadata: false
  },
  worldBooks: { attachments: false },
  presets: {
    variables: false,
    chatCompletion: false,
    narrationContext: false,
    install: false,
    versionedInstall: false
  },
  installer: { unifiedHubInstall: false },
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
  if (!isObject(override)) return next;
  for (const [key, value] of Object.entries(override)) {
    next[key] = isObject(value) && isObject(next[key])
      ? mergeObjects(next[key], value)
      : value;
  }
  return next;
}

function requireFunction(value, path) {
  if (typeof value !== 'function') throw new Error(`${path} must be a function`);
}

function requireObject(value, path) {
  if (!isObject(value)) throw new Error(`${path} must be an object`);
}

export function createHostCapabilities(overrides = {}) {
  return mergeObjects(DEFAULT_CAPABILITIES, overrides);
}

export function assertDirectiveStorageAdapter(storage, path = 'host.storage') {
  requireObject(storage, path);
  requireFunction(storage.readJson, `${path}.readJson`);
  requireFunction(storage.writeJson, `${path}.writeJson`);
  if (storage.verifyJsonFiles !== undefined) requireFunction(storage.verifyJsonFiles, `${path}.verifyJsonFiles`);
  if (storage.deleteJsonFile !== undefined) requireFunction(storage.deleteJsonFile, `${path}.deleteJsonFile`);
  if (storage.listJsonFiles !== undefined) requireFunction(storage.listJsonFiles, `${path}.listJsonFiles`);
  if (storage.writeBase64File !== undefined) requireFunction(storage.writeBase64File, `${path}.writeBase64File`);
  if (storage.verifyFiles !== undefined) requireFunction(storage.verifyFiles, `${path}.verifyFiles`);
  if (storage.deleteFile !== undefined) requireFunction(storage.deleteFile, `${path}.deleteFile`);
  return storage;
}

export function assertDirectiveGenerationClient(generation, path = 'host.generation') {
  requireObject(generation, path);
  requireFunction(generation.generate, `${path}.generate`);
  if (generation.role !== undefined) requireFunction(generation.role, `${path}.role`);
  if (generation.observe !== undefined) requireFunction(generation.observe, `${path}.observe`);
  return generation;
}

export function assertDirectiveChatAdapter(chat, path = 'host.chat') {
  requireObject(chat, path);
  for (const method of [
    'getCurrentChatId',
    'getCurrentBinding',
    'createOrBindCampaignChat',
    'postAssistantMessage',
    'appendAssistantMessageSwipe',
    'updateBindingMetadata',
    'getBindingMetadata',
    'getRecentMessages',
    'getLatestPlayerMessage',
    'getMessage',
    'open'
  ]) {
    if (chat[method] !== undefined) requireFunction(chat[method], `${path}.${method}`);
  }
  return chat;
}

export function assertDirectivePromptAdapter(prompt, path = 'host.prompt') {
  requireObject(prompt, path);
  for (const method of ['install', 'update', 'clear', 'rebuild', 'inspect']) {
    if (prompt[method] !== undefined) requireFunction(prompt[method], `${path}.${method}`);
  }
  return prompt;
}

export function assertDirectiveProviderAdapter(providers, path = 'host.providers') {
  requireObject(providers, path);
  for (const method of [
    'getSettings',
    'updateSettings',
    'updateRoleProviderKind',
    'resetRoleProviderKind',
    'listRoleRouting',
    'listConnectionProfiles',
    'status',
    'resolve',
    'test'
  ]) {
    if (providers[method] !== undefined) requireFunction(providers[method], `${path}.${method}`);
  }
  return providers;
}

export function assertDirectivePresetAdapter(presets, path = 'host.presets') {
  requireObject(presets, path);
  for (const method of [
    'getStatus',
    'latestStatus',
    'getNarrationContext',
    'getAutoCheckPreference',
    'setAutoCheckPreference',
    'dismissAutoCheckForVersion',
    'getStartupCheck',
    'installBundledPreset',
    'loadBundledPreset'
  ]) {
    if (presets[method] !== undefined) requireFunction(presets[method], `${path}.${method}`);
  }
  return presets;
}

export function assertDirectiveEventAdapter(events, path = 'host.events') {
  requireObject(events, path);
  requireFunction(events.on, `${path}.on`);
  return events;
}

export function assertDirectiveUiAdapter(ui, path = 'host.ui') {
  requireObject(ui, path);
  if (ui.mount !== undefined) requireFunction(ui.mount, `${path}.mount`);
  if (ui.send !== undefined) requireFunction(ui.send, `${path}.send`);
  if (ui.reportProgress !== undefined) requireFunction(ui.reportProgress, `${path}.reportProgress`);
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
  assertDirectiveChatAdapter(host.chat || {});
  assertDirectivePromptAdapter(host.prompt || {});
  if (host.providers !== undefined) assertDirectiveProviderAdapter(host.providers);
  if (host.presets !== undefined) assertDirectivePresetAdapter(host.presets);
  if (host.jobs !== undefined) requireObject(host.jobs, 'host.jobs');
  return host;
}

export function normalizeDirectiveHost(host) {
  assertDirectiveHost(host);
  return {
    ...host,
    displayName: host.displayName.trim(),
    capabilities: createHostCapabilities(host.capabilities),
    chat: host.chat || {},
    prompt: host.prompt || {},
    presets: host.presets
  };
}

export function createHostContractError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = cloneJson(details);
  return error;
}
