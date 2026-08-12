import assert from 'node:assert/strict';

import { GENERATION_ROLE_IDS } from '../../src/generation/generation-roles.mjs';
import {
  createSillyTavernProviderSettingsStore,
  providerKindForRole
} from '../../src/providers/directive-provider-settings.mjs';
import {
  DIRECTIVE_PROVIDER_TEST_MAX_TOKENS,
  createDirectiveProviderClient,
  listSillyTavernConnectionProfiles
} from '../../src/hosts/sillytavern/provider-client.mjs';
import { createSillyTavernGenerationClient } from '../../src/hosts/sillytavern/generation-client.mjs';
import { createDirectiveGenerationRouter } from '../../src/runtime/runtime-app.mjs';

assert.deepEqual(GENERATION_ROLE_IDS, [
  'narration',
  'acceptedPairMissionEvidence',
  'characterCreatorSectionDraft',
  'utilityJson'
]);
assert.equal(providerKindForRole('narration'), 'reasoning');
assert.equal(providerKindForRole('utilityJson'), 'utility');

const profiles = [
  { id: 'chat.local', name: 'Local Chat', model: 'cydonia-local', api: 'openai', preset: 'Local Chat Preset' },
  { id: 'text.local', name: 'Local Text', model: 'llama-local', api: 'textgenerationwebui', instruct: 'Alpaca' },
  { id: 'unsupported', name: 'Unsupported', model: 'image-model', api: 'comfy' }
];
const profileCalls = [];
const profileService = {
  getSupportedProfiles: () => profiles,
  getProfile: (id) => profiles.find((profile) => profile.id === id) || null,
  validateProfile: (profile) => ({ selected: profile?.api, source: 'nanogpt', type: 'llamacpp' }),
  async sendRequest(profileId, messages, maxTokens, options, payload) {
    profileCalls.push({ profileId, messages, maxTokens, options, payload });
    if (payload?.json_schema) return { content: { ok: true }, reasoning: '' };
    return { content: 'profile-visible-answer', reasoning: '' };
  }
};
const profileContext = {
  extensionSettings: {},
  saveSettingsDebounced() {},
  ConnectionManagerRequestService: profileService,
  getPresetManager: () => ({
    getCompletionPresetByName: (name) => name === 'Local Chat Preset' ? { temperature: 0.6, top_p: 0.9 } : null
  }),
  ChatCompletionService: {
    TYPE: 'openai',
    async presetToGeneratePayload(_preset, _overrides, basePayload) {
      return { ...basePayload, temperature: 0.6, top_p: 0.9, top_k: 40, custom_url: 'DO_NOT_PROJECT' };
    }
  }
};

assert.deepEqual(listSillyTavernConnectionProfiles(profileContext), [
  {
    id: 'chat.local',
    label: 'Local Chat / cydonia-local',
    name: 'Local Chat',
    model: 'cydonia-local',
    completionMode: 'chat',
    presetName: 'Local Chat Preset',
    instructName: ''
  },
  {
    id: 'text.local',
    label: 'Local Text / llama-local',
    name: 'Local Text',
    model: 'llama-local',
    completionMode: 'text',
    presetName: '',
    instructName: 'Alpaca'
  }
]);

const profileStore = createSillyTavernProviderSettingsStore({ context: profileContext });
profileStore.update('utility', {
  provider: 'profile',
  profileId: 'chat.local',
  samplerMode: 'profile',
  structuredOutputMode: 'auto',
  maxTokens: 600
});
profileStore.update('reasoning', {
  provider: 'profile',
  profileId: 'text.local',
  presetMode: 'full-profile',
  instructMode: 'auto',
  samplerMode: 'directive',
  structuredOutputMode: 'prompt-json',
  temperature: 0.35,
  topP: 0.8,
  maxTokens: 700
});
const profileClient = createDirectiveProviderClient({
  contextFactory: () => profileContext,
  settingsStore: profileStore,
  now: () => '2026-08-10T12:00:00.000Z'
});

assert.deepEqual(profileClient.status('utility'), {
  kind: 'utility',
  provider: 'profile',
  ready: true,
  label: 'Local Chat / cydonia-local',
  sourceLabel: 'Connection Profile',
  completionMode: 'chat',
  identity: 'profile:chat.local:cydonia-local',
  profile: {
    id: 'chat.local',
    label: 'Local Chat / cydonia-local',
    name: 'Local Chat',
    model: 'cydonia-local',
    completionMode: 'chat',
    presetName: 'Local Chat Preset',
    instructName: ''
  },
  certification: { status: 'not-run' }
});

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['ok'],
  properties: { ok: { type: 'boolean' } }
};
const utility = await profileClient.generate('utilityJson', {
  messages: [{ role: 'user', content: 'Return bounded JSON.' }],
  parameters: { temperature: 0.05, top_p: 0.7, max_tokens: 900 },
  jsonSchema: schema
});
assert.equal(utility.text, 'profile-visible-answer');
assert.equal(utility.providerKind, 'utility');
assert.deepEqual(profileCalls[0], {
  profileId: 'chat.local',
  messages: [{ role: 'user', content: 'Return bounded JSON.' }],
  maxTokens: 600,
  options: {
    stream: false,
    extractData: true,
    includePreset: false,
    includeInstruct: false,
    signal: undefined
  },
  payload: { temperature: 0.6, top_p: 0.9, top_k: 40 }
});
assert.equal(utility.generationPolicy.structuredOutputMethod, 'prompt-json');

await profileClient.generate('narration', {
  messages: [{ role: 'user', content: 'Continue.' }],
  maxTokens: 500
});
assert.deepEqual(profileCalls[1], {
  profileId: 'text.local',
  messages: [{ role: 'user', content: 'Continue.' }],
  maxTokens: 500,
  options: {
    stream: false,
    extractData: true,
    includePreset: true,
    includeInstruct: true,
    signal: undefined
  },
  payload: { temperature: 0.35, top_p: 0.8 }
});

profileStore.update('utility', { structuredOutputMode: 'native-schema' });
await assert.rejects(
  profileClient.generate('utilityJson', { messages: [{ role: 'user', content: 'Schema.' }], jsonSchema: schema }),
  (error) => error?.code === 'DIRECTIVE_NATIVE_SCHEMA_UNCERTIFIED'
);
assert.equal(profileCalls.length, 2, 'uncertified explicit native schema must fail before transport');

const tested = await profileClient.test('utility');
assert.equal(tested.ok, true);
assert.equal(tested.maxTokens, DIRECTIVE_PROVIDER_TEST_MAX_TOKENS);
assert.deepEqual(tested.capabilities, { connectivity: true, structuredOutput: 'native-schema' });
assert.deepEqual(profileStore.get('utility').certification, {
  status: 'passed',
  configHash: tested.configHash,
  structuredOutput: 'native-schema',
  testedAt: '2026-08-10T12:00:00.000Z'
});
profiles[0].preset = 'Changed Local Chat Preset';
assert.deepEqual(profileClient.status('utility').certification, { status: 'not-run' });
await assert.rejects(
  profileClient.generate('utilityJson', { messages: [{ role: 'user', content: 'Changed source.' }], jsonSchema: schema }),
  (error) => error?.code === 'DIRECTIVE_NATIVE_SCHEMA_UNCERTIFIED'
);
profiles[0].preset = 'Local Chat Preset';
assert.equal(profileClient.status('utility').certification.status, 'passed');

const promptOnlyCalls = [];
const promptOnlyContext = {
  ...profileContext,
  extensionSettings: {},
  ConnectionManagerRequestService: {
    ...profileService,
    async sendRequest(profileId, messages, maxTokens, options, payload) {
      promptOnlyCalls.push({ profileId, messages, maxTokens, options, payload });
      return payload?.json_schema
        ? { content: 'schema metadata ignored' }
        : { content: 'DIRECTIVE_PROVIDER_OK' };
    }
  }
};
const promptOnlyStore = createSillyTavernProviderSettingsStore({ context: promptOnlyContext });
promptOnlyStore.update('utility', { provider: 'profile', profileId: 'chat.local' });
const promptOnlyClient = createDirectiveProviderClient({
  contextFactory: () => promptOnlyContext,
  settingsStore: promptOnlyStore,
  now: () => '2026-08-10T12:00:00.000Z'
});
const promptOnlyTest = await promptOnlyClient.test('utility');
assert.equal(promptOnlyTest.ok, true);
assert.deepEqual(promptOnlyTest.capabilities, { connectivity: true, structuredOutput: 'prompt-json' });
assert.equal(promptOnlyCalls.length, 2);
assert.equal(promptOnlyStore.get('utility').certification.structuredOutput, 'prompt-json');

const nativeResult = await profileClient.generate('utilityJson', {
  messages: [{ role: 'user', content: 'Schema after certification.' }],
  jsonSchema: schema
});
assert.equal(nativeResult.text, JSON.stringify({ ok: true }));
assert.deepEqual(profileCalls.at(-1).payload.json_schema, {
  name: 'directive_structured_output',
  value: schema,
  strict: true
});

profileStore.update('utility', { topP: 0.82 });
assert.deepEqual(profileStore.get('utility').certification, { status: 'not-run' });
await assert.rejects(
  profileClient.generate('utilityJson', { messages: [{ role: 'user', content: 'Changed.' }], jsonSchema: schema }),
  (error) => error?.code === 'DIRECTIVE_NATIVE_SCHEMA_UNCERTIFIED'
);

const currentCalls = [];
const currentContext = {
  extensionSettings: {},
  mainApi: 'openai',
  chatCompletionSettings: {
    chat_completion_source: 'nanogpt',
    preset_settings_openai: 'Current Preset'
  },
  getChatCompletionModel: () => 'zai-org/glm-5.1:thinking',
  ChatCompletionService: {
    async processRequest(requestData, options, extractData, signal) {
      currentCalls.push({ requestData, options, extractData, signal });
      return requestData.json_schema
        ? { content: { ok: true }, reasoning: '' }
        : { content: 'current-visible-answer', reasoning: '' };
    }
  }
};
const currentStore = createSillyTavernProviderSettingsStore({ context: currentContext });
currentStore.update('reasoning', {
  provider: 'st',
  presetMode: 'full-profile',
  instructMode: 'auto',
  samplerMode: 'profile',
  structuredOutputMode: 'auto',
  maxTokens: 640
});
const currentClient = createDirectiveProviderClient({
  contextFactory: () => currentContext,
  settingsStore: currentStore,
  now: () => '2026-08-10T12:00:00.000Z'
});
assert.deepEqual(currentClient.status('reasoning'), {
  kind: 'reasoning',
  provider: 'st',
  ready: true,
  label: 'zai-org/glm-5.1:thinking',
  sourceLabel: 'Current Model',
  completionMode: 'chat',
  identity: 'current:openai:nanogpt:zai-org/glm-5.1:thinking',
  profile: null,
  certification: { status: 'not-run' }
});
const currentResult = await currentClient.generate('narration', {
  systemPrompt: 'Directive system.',
  prompt: 'Continue.',
  parameters: { temperature: 0.9, top_p: 0.4, max_tokens: 900 }
});
assert.equal(currentResult.text, 'current-visible-answer');
assert.deepEqual(currentCalls[0], {
  requestData: {
    stream: false,
    messages: [
      { role: 'system', content: 'Directive system.' },
      { role: 'user', content: 'Continue.' }
    ],
    model: 'zai-org/glm-5.1:thinking',
    chat_completion_source: 'nanogpt',
    max_tokens: 640
  },
  options: { presetName: 'Current Preset' },
  extractData: true,
  signal: undefined
});

const currentTextCalls = [];
const currentTextContext = {
  extensionSettings: {},
  mainApi: 'textgenerationwebui',
  model: 'llama-local',
  textCompletionSettings: { type: 'llamacpp', preset_settings: 'Text Preset' },
  power_user: { instruct: { preset: 'Alpaca' } },
  getPresetManager: (type) => ({
    getCompletionPresetByName: (name) => ({ type, name, temperature: 0.55 })
  }),
  TextCompletionService: {
    TYPE: 'textgenerationwebui',
    async processRequest(requestData, options, extractData, signal) {
      currentTextCalls.push({ requestData, options, extractData, signal });
      return { content: 'current-text-visible-answer', reasoning: '' };
    },
    async presetToGeneratePayload(_preset, _overrides, basePayload) {
      return { ...basePayload, temperature: 0.55, top_p: 0.92 };
    }
  }
};
const currentTextStore = createSillyTavernProviderSettingsStore({ context: currentTextContext });
currentTextStore.update('utility', {
  provider: 'st',
  presetMode: 'full-profile',
  instructMode: 'auto',
  samplerMode: 'profile',
  structuredOutputMode: 'prompt-json',
  maxTokens: 550
});
const currentTextClient = createDirectiveProviderClient({
  contextFactory: () => currentTextContext,
  settingsStore: currentTextStore
});
const currentTextResult = await currentTextClient.generate('utilityJson', {
  messages: [{ role: 'user', content: 'Use native text completion.' }],
  maxTokens: 500
});
assert.equal(currentTextResult.text, 'current-text-visible-answer');
assert.deepEqual(currentTextCalls[0], {
  requestData: {
    stream: false,
    prompt: [{ role: 'user', content: 'Use native text completion.' }],
    model: 'llama-local',
    max_tokens: 500,
    api_type: 'llamacpp'
  },
  options: { presetName: 'Text Preset', instructName: 'Alpaca' },
  extractData: true,
  signal: undefined
});

const policyIncompleteContext = {
  extensionSettings: {},
  mainApi: 'openai',
  chatCompletionSettings: { chat_completion_source: 'nanogpt' },
  getChatCompletionModel: () => 'legacy-current-model',
  async generateRaw() { return 'must not bypass provider policy'; }
};
const policyIncompleteStore = createSillyTavernProviderSettingsStore({ context: policyIncompleteContext });
const policyIncompleteClient = createDirectiveProviderClient({
  contextFactory: () => policyIncompleteContext,
  settingsStore: policyIncompleteStore
});
assert.equal(policyIncompleteClient.status('utility').ready, false);
await assert.rejects(
  policyIncompleteClient.generate('utilityJson', { prompt: 'Do not use an incomplete transport.' }),
  (error) => error?.code === 'DIRECTIVE_PROVIDER_UNAVAILABLE'
);

const invalidProfileContext = {
  extensionSettings: {},
  ConnectionManagerRequestService: {
    ...profileService,
    getProfile: () => null
  }
};
const invalidStore = createSillyTavernProviderSettingsStore({ context: invalidProfileContext });
invalidStore.update('utility', { provider: 'profile', profileId: 'missing' });
const invalidClient = createDirectiveProviderClient({ contextFactory: () => invalidProfileContext, settingsStore: invalidStore });
assert.equal(invalidClient.status('utility').ready, false);
await assert.rejects(
  invalidClient.generate('utilityJson', { prompt: 'No route.' }),
  (error) => error?.code === 'DIRECTIVE_PROFILE_UNAVAILABLE'
);

const leakyContext = {
  ...profileContext,
  extensionSettings: {},
  ConnectionManagerRequestService: {
    ...profileService,
    async sendRequest() {
      const error = new Error('401 Bearer LEAKED_TOKEN full provider response body');
      error.status = 401;
      error.details = { apiKey: 'LEAKED_TOKEN', responseBody: 'FULL_SECRET_BODY' };
      throw error;
    }
  }
};
const leakyStore = createSillyTavernProviderSettingsStore({ context: leakyContext });
leakyStore.update('utility', { provider: 'profile', profileId: 'chat.local' });
const leakyClient = createDirectiveProviderClient({ contextFactory: () => leakyContext, settingsStore: leakyStore });
await assert.rejects(
  leakyClient.generate('utilityJson', { prompt: 'Do not expose backend errors.' }),
  (error) => {
    assert.equal(error.code, 'DIRECTIVE_PROVIDER_REQUEST_FAILED');
    assert.equal(error.message, 'Provider utility request failed.');
    assert.equal(JSON.stringify(error).includes('LEAKED_TOKEN'), false);
    assert.equal(JSON.stringify(error).includes('FULL_SECRET_BODY'), false);
    return true;
  }
);
const leakyTest = await leakyClient.test('utility');
assert.equal(leakyTest.ok, false);
assert.equal(leakyTest.error.code, 'DIRECTIVE_PROVIDER_REQUEST_FAILED');
assert.equal(leakyTest.error.message, 'Provider utility request failed.');
assert.equal(JSON.stringify(leakyTest).includes('LEAKED_TOKEN'), false);
assert.equal(JSON.stringify(leakyTest).includes('FULL_SECRET_BODY'), false);

let cancellationSignal = null;
const cancellationContext = {
  extensionSettings: {},
  ConnectionManagerRequestService: {
    ...profileService,
    async sendRequest(_profileId, _messages, _maxTokens, options) {
      cancellationSignal = options.signal;
      return new Promise((_resolve, reject) => {
        cancellationSignal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      });
    }
  }
};
const cancellationStore = createSillyTavernProviderSettingsStore({ context: cancellationContext });
cancellationStore.update('utility', { provider: 'profile', profileId: 'chat.local' });
const cancellationClient = createDirectiveProviderClient({ contextFactory: () => cancellationContext, settingsStore: cancellationStore });
const controller = new AbortController();
const canceled = cancellationClient.generate('utilityJson', { prompt: 'Cancel.' }, { signal: controller.signal, timeoutMs: 1000 });
controller.abort();
await assert.rejects(canceled, (error) => error?.code === 'DIRECTIVE_GENERATION_ABORTED');
assert.equal(cancellationSignal.aborted, true);

const routedProviderClient = createDirectiveProviderClient({ contextFactory: () => cancellationContext, settingsStore: cancellationStore });
const router = createDirectiveGenerationRouter({
  generation: createSillyTavernGenerationClient({ providerClient: routedProviderClient })
});
const routedController = new AbortController();
const routed = router.generate('utilityJson', { prompt: 'Cancel through router.' }, {
  signal: routedController.signal,
  timeoutMs: 1000,
  allowVisibleOutputRetry: false
});
routedController.abort();
const routedResult = await routed;
assert.equal(routedResult.ok, false);
assert.equal(routedResult.error.code, 'DIRECTIVE_GENERATION_ABORTED');
assert.equal(routedResult.diagnostics.providerKind, 'utility');

console.log('PASS Directive native provider lanes and generation-role routing');
