import { normalizeProviderResponseUsage } from '../../src/providers/provider-response-normalizer.mjs';
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
  'openingSceneDirector',
  'acceptedPairMissionEvidence',
  'storyDirector',
  'storyDirectionAnalyst',
  'continuityAnalyst',
  'episodeEvaluator',
  'peopleDossierAuthor',
  'characterCreatorSectionDraft',
  'characterResponder',
  'sceneNarrator',
  'characterKnowledgeReviewer'
]);
assert.equal(providerKindForRole('openingSceneDirector'), 'reasoning');
assert.equal(providerKindForRole('storyDirector'), 'reasoning');
assert.equal(providerKindForRole('episodeEvaluator'), 'reasoning');
assert.equal(providerKindForRole('peopleDossierAuthor'), 'reasoning');
assert.equal(providerKindForRole('acceptedPairMissionEvidence'), 'utility');

const unavailableAttempts = [];
const unavailableClient = createDirectiveProviderClient({
  contextFactory: () => null,
  settingsStore: {get: () => ({provider: 'current'})},
});
await assert.rejects(unavailableClient.generate('episodeEvaluator', {}, {
  onAttempt: attempt => unavailableAttempts.push(attempt),
}), error => error.code === 'DIRECTIVE_PROVIDER_UNAVAILABLE');
assert.deepEqual(unavailableAttempts, [], 'unavailable context never reports a transport attempt');

const profiles = [
  { id: 'chat.local', name: 'Local Chat', model: 'cydonia-local', api: 'openai', preset: 'Local Chat Preset' },
  { id: 'text.local', name: 'Local Text', model: 'llama-local', api: 'textgenerationwebui', instruct: 'Alpaca' },
  { id: 'unsupported', name: 'Unsupported', model: 'image-model', api: 'comfy' }
];
const profileCalls = [];
const profileService = {
  getSupportedProfiles: () => profiles,
  getProfile: (id) => profiles.find((profile) => profile.id === id) || null,
  validateProfile: (profile) => ({ selected: profile?.api, source: profile?.source || 'nanogpt', type: 'llamacpp' }),
  async sendRequest(profileId, messages, maxTokens, options, payload) {
    profileCalls.push({ profileId, messages, maxTokens, options, payload });
    if (payload?.json_schema) {
      return { choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }] };
    }
    if (profileId === 'text.local') return [{ content: 'profile-visible-answer' }];
    return { choices: [{ message: { content: 'profile-visible-answer' }, finish_reason: 'stop' }], usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17, privateField: 'PRIVATE_USAGE' } };
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
      return { ...basePayload, temperature: 0.6, top_p: 0.9, top_k: 40, reasoning_effort: 'medium', custom_url: 'DO_NOT_PROJECT' };
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

const providerAttemptNumbers = [];
let providerAttemptCount = 0;
const retryProfileContext = {
  ...profileContext,
  extensionSettings: {},
  ConnectionManagerRequestService: {
    ...profileService,
    async sendRequest() {
      providerAttemptCount += 1;
      return providerAttemptCount === 1
        ? { content: '', reasoning: 'private reasoning only' }
        : { content: 'visible retry result', reasoning: '' };
    }
  }
};
const retryProfileStore = createSillyTavernProviderSettingsStore({ context: retryProfileContext });
retryProfileStore.update('utility', { provider: 'profile', profileId: 'chat.local', structuredOutputMode: 'prompt-json' });
const retryProfileClient = createDirectiveProviderClient({
  contextFactory: () => retryProfileContext,
  settingsStore: retryProfileStore,
});
const retryProfileResult = await retryProfileClient.generate('acceptedPairMissionEvidence', {
  prompt: 'Return visible output.',
}, {
  onAttempt: (attempt) => providerAttemptNumbers.push(attempt),
});
assert.equal(retryProfileResult.text, 'visible retry result');
assert.deepEqual(providerAttemptNumbers, [1, 2], 'provider retries report only transport attempts that start');

const tokenLimitRawResponse = {
  id: 'chatcmpl-live-boundary-fixture',
  choices: [{
    index: 0,
    finish_reason: 'length',
    message: {
      role: 'assistant',
      content: '',
      reasoning: 'private reasoning exhausted the response budget'
    }
  }],
  usage: {
    prompt_tokens: 4692,
    completion_tokens: 8192,
    total_tokens: 12884
  }
};

const nativeResponseToolsLoader = async () => ({
  extractMessageFromData(data, mainApi) {
    if (mainApi === 'textgenerationwebui') {
      return data?.choices?.[0]?.text ?? data?.choices?.[0]?.message?.content ?? data?.content ?? data?.response ?? data?.[0]?.content ?? '';
    }
    return data?.content?.filter?.((part) => part.type === 'text').map((part) => part.text).join('\n\n')
      ?? data?.choices?.[0]?.message?.content
      ?? data?.choices?.[0]?.text
      ?? '';
  },
  extractJsonFromData(data, { chatCompletionSource } = {}) {
    if (chatCompletionSource === 'claude') {
      return JSON.stringify(data?.content?.find((part) => part.type === 'tool_use')?.input ?? {});
    }
    return JSON.stringify(JSON.parse(this.extractMessageFromData(data, 'openai')));
  },
  extractReasoningFromData(data) {
    return data?.choices?.[0]?.message?.reasoning ?? '';
  },
  getInstructStoppingSequences({ customInstruct } = {}) {
    return [customInstruct?.stop_sequence, customInstruct?.input_sequence].filter(Boolean);
  }
});
const tokenLimitCalls = [];
const tokenLimitContext = {
  ...profileContext,
  extensionSettings: {},
  ConnectionManagerRequestService: {
    ...profileService,
    async sendRequest(_profileId, _messages, _maxTokens, options) {
      tokenLimitCalls.push(options);
      return options.extractData === false
        ? tokenLimitRawResponse
        : {
            content: tokenLimitRawResponse.choices[0].message.content,
            reasoning: tokenLimitRawResponse.choices[0].message.reasoning
          };
    }
  }
};
const tokenLimitStore = createSillyTavernProviderSettingsStore({ context: tokenLimitContext });
tokenLimitStore.update('reasoning', {
  provider: 'profile',
  profileId: 'chat.local',
  structuredOutputMode: 'prompt-json',
  maxTokens: 8192
});
const tokenLimitClient = createDirectiveProviderClient({
  contextFactory: () => tokenLimitContext,
  settingsStore: tokenLimitStore
});
await assert.rejects(
  tokenLimitClient.generate('continuityAnalyst', { prompt: 'Return bounded continuity JSON.' }),
  (error) => {
    assert.equal(error.code, 'provider_token_limit');
    assert.equal(error.details.finishReason, 'length');
    assert.equal(error.details.maxTokens, 8192);
    return true;
  }
);
assert.equal(tokenLimitCalls.length, 1, 'confirmed token-limit finishes do not trigger visible-output retry');

const claudeProfile = {
  id: 'chat.claude',
  name: 'Claude Chat',
  model: 'claude-sonnet',
  api: 'openai',
  source: 'claude',
  preset: 'Local Chat Preset'
};
const claudeContext = {
  ...profileContext,
  extensionSettings: {},
  ConnectionManagerRequestService: {
    ...profileService,
    getSupportedProfiles: () => [claudeProfile],
    getProfile: (id) => id === claudeProfile.id ? claudeProfile : null,
    validateProfile: () => ({ selected: 'openai', source: 'claude' }),
    async sendRequest(_profileId, _messages, _maxTokens, _options, payload) {
      if (!payload?.json_schema) {
        return { choices: [{ message: { content: 'DIRECTIVE_PROVIDER_OK' }, finish_reason: 'stop' }] };
      }
      return {
        content: [{
          type: 'tool_use',
          name: payload.json_schema.name,
          input: { ok: true }
        }],
        stop_reason: 'tool_use'
      };
    }
  }
};
const claudeStore = createSillyTavernProviderSettingsStore({ context: claudeContext });
claudeStore.update('utility', {
  provider: 'profile',
  profileId: claudeProfile.id,
  structuredOutputMode: 'auto'
});
const claudeClient = createDirectiveProviderClient({
  contextFactory: () => claudeContext,
  settingsStore: claudeStore,
  nativeResponseToolsLoader
});
const claudeTest = await claudeClient.test('utility');
assert.equal(claudeTest.capabilities.structuredOutput, 'native-schema');
const claudeNativeResult = await claudeClient.generate('acceptedPairMissionEvidence', {
  messages: [{ role: 'user', content: 'Use the forced schema tool.' }],
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['ok'],
    properties: { ok: { type: 'boolean' } }
  }
});
assert.equal(claudeNativeResult.text, '{"ok":true}', 'Claude tool_use input survives raw metadata capture');

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
const utility = await profileClient.generate('acceptedPairMissionEvidence', {
  messages: [{ role: 'user', content: 'Return bounded JSON.' }],
  parameters: { temperature: 0.05, top_p: 0.7, max_tokens: 900 },
  jsonSchema: schema
});
assert.equal(utility.text, 'profile-visible-answer');
assert.equal(utility.providerKind, 'utility');
assert.deepEqual(utility.usage, { input_tokens: 12, output_tokens: 5, total_tokens: 17 });
assert.deepEqual(profileCalls[0], {
  profileId: 'chat.local',
  messages: [{ role: 'user', content: 'Return bounded JSON.' }],
  maxTokens: 600,
  options: {
    stream: false,
    extractData: false,
    includePreset: false,
    includeInstruct: false,
    signal: profileCalls[0].options.signal
  },
  payload: { temperature: 0.6, top_p: 0.9, top_k: 40, reasoning_effort: 'medium' }
});
assert.equal(utility.generationPolicy.structuredOutputMethod, 'prompt-json');
assert.ok(profileCalls[0].options.signal instanceof AbortSignal, 'configured timeout supplies a cancellation signal');

await profileClient.generate('episodeEvaluator', {
  messages: [{ role: 'user', content: 'Continue.' }],
  maxTokens: 500
});
assert.deepEqual(profileCalls[1], {
  profileId: 'text.local',
  messages: [{ role: 'user', content: 'Continue.' }],
  maxTokens: 700,
  options: {
    stream: false,
    extractData: false,
    includePreset: true,
    includeInstruct: true,
    signal: profileCalls[1].options.signal
  },
  payload: { temperature: 0.35, top_p: 0.8 }
});

profileStore.update('utility', { structuredOutputMode: 'native-schema' });
await assert.rejects(
  profileClient.generate('acceptedPairMissionEvidence', { messages: [{ role: 'user', content: 'Schema.' }], jsonSchema: schema }),
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
  profileClient.generate('acceptedPairMissionEvidence', { messages: [{ role: 'user', content: 'Changed source.' }], jsonSchema: schema }),
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

const optionalPlaceholderCalls = [];
const optionalPlaceholderContext = {
  ...profileContext,
  extensionSettings: {},
  ConnectionManagerRequestService: {
    ...profileService,
    async sendRequest(profileId, messages, maxTokens, options, payload) {
      optionalPlaceholderCalls.push({ profileId, messages, maxTokens, options, payload });
      if (!payload?.json_schema) {
        return { choices: [{ message: { content: 'DIRECTIVE_PROVIDER_OK' }, finish_reason: 'stop' }] };
      }
      const properties = payload.json_schema.value?.properties || {};
      const content = { ok: true };
      if (Object.hasOwn(properties, 'durationSeconds')) content.durationSeconds = 0;
      if (Object.hasOwn(properties, 'durationSourceSlot')) content.durationSourceSlot = 'previousAssistant';
      if (Object.hasOwn(properties, 'durationEvidenceQuote')) content.durationEvidenceQuote = '';
      return { choices: [{ message: { content: JSON.stringify(content) }, finish_reason: 'stop' }] };
    }
  }
};
const optionalPlaceholderStore = createSillyTavernProviderSettingsStore({ context: optionalPlaceholderContext });
optionalPlaceholderStore.update('utility', {
  provider: 'profile', profileId: 'chat.local', structuredOutputMode: 'native-schema',
});
const optionalPlaceholderClient = createDirectiveProviderClient({
  contextFactory: () => optionalPlaceholderContext,
  settingsStore: optionalPlaceholderStore,
  now: () => '2026-08-10T12:00:00.000Z'
});
const optionalPlaceholderTest = await optionalPlaceholderClient.test('utility');
assert.equal(optionalPlaceholderTest.ok, true);
assert.deepEqual(
  optionalPlaceholderTest.capabilities,
  { connectivity: true, structuredOutput: 'prompt-json' },
  'native certification rejects providers that materialize invalid placeholders for optional constrained fields',
);
assert.equal(optionalPlaceholderCalls.length, 2);
const optionalProbeSchema = optionalPlaceholderCalls[1].payload.json_schema.value;
assert.deepEqual(optionalProbeSchema.required, ['ok']);
assert.deepEqual(optionalProbeSchema.properties.durationSeconds, {
  type: 'integer', minimum: 1, maximum: 2678400,
});
assert.deepEqual(optionalProbeSchema.properties.durationSourceSlot, {
  type: 'string', enum: ['previousAssistant', 'currentPlayer'],
});
assert.deepEqual(optionalProbeSchema.properties.durationEvidenceQuote, {
  type: 'string', minLength: 12, maxLength: 240,
});
await assert.rejects(
  optionalPlaceholderClient.generate('acceptedPairMissionEvidence', {
    messages: [{ role: 'user', content: 'Do not silently downgrade an explicit native request.' }],
    jsonSchema: schema,
  }),
  error => error?.code === 'DIRECTIVE_NATIVE_SCHEMA_UNCERTIFIED',
);
assert.equal(optionalPlaceholderCalls.length, 2, 'failed native certification blocks explicit native mode before transport');

const nativeResult = await profileClient.generate('acceptedPairMissionEvidence', {
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
  profileClient.generate('acceptedPairMissionEvidence', { messages: [{ role: 'user', content: 'Changed.' }], jsonSchema: schema }),
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
const currentResult = await currentClient.generate('episodeEvaluator', {
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
  extractData: false,
  signal: currentCalls[0].signal
});

const currentTextCalls = [];
const currentTextContext = {
  extensionSettings: {},
  mainApi: 'textgenerationwebui',
  model: 'llama-local',
  textCompletionSettings: { type: 'llamacpp', preset_settings: 'Text Preset' },
  power_user: { instruct: { preset: 'Alpaca' } },
  getPresetManager: (type) => ({
    getCompletionPresetByName: (name) => type === 'instruct'
      ? {
          name,
          stop_sequence: '<STOP>',
          input_sequence: '<USER>',
          output_sequence: '<ASSISTANT>',
          first_output_sequence: '<FIRST>',
          last_output_sequence: '<LAST>'
        }
      : { type, name, temperature: 0.55 }
  }),
  TextCompletionService: {
    TYPE: 'textgenerationwebui',
    async processRequest(requestData, options, extractData, signal) {
      currentTextCalls.push({ requestData, options, extractData, signal });
      return currentTextCalls.length === 1
        ? [{ content: '<ASSISTANT>{"ok":true}<LAST><USER>following user turn' }]
        : [{ content: '{"ok":true}<ST' }];
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
  settingsStore: currentTextStore,
  nativeResponseToolsLoader
});
const currentTextResult = await currentTextClient.generate('acceptedPairMissionEvidence', {
  messages: [{ role: 'user', content: 'Use native text completion.' }],
  maxTokens: 500
});
assert.equal(currentTextResult.text, '{"ok":true}', 'llama.cpp arrays retain native instruct-marker cleanup');
assert.deepEqual(currentTextCalls[0], {
  requestData: {
    stream: false,
    prompt: [{ role: 'user', content: 'Use native text completion.' }],
    model: 'llama-local',
    max_tokens: 550,
    api_type: 'llamacpp'
  },
  options: { presetName: 'Text Preset', instructName: 'Alpaca' },
  extractData: false,
  signal: currentTextCalls[0].signal
});
const currentTextPartialStop = await currentTextClient.generate('acceptedPairMissionEvidence', {
  messages: [{ role: 'user', content: 'Trim a partial trailing stop string.' }],
  maxTokens: 500
});
assert.equal(currentTextPartialStop.text, '{"ok":true}', 'partial trailing stop strings stay removed');

const noInstructContext = {
  ...currentTextContext,
  extensionSettings: {},
  power_user: {},
  TextCompletionService: {
    ...currentTextContext.TextCompletionService,
    async processRequest() {
      return [{ content: 'keep output GLOBAL_' }];
    }
  }
};
const noInstructStore = createSillyTavernProviderSettingsStore({ context: noInstructContext });
noInstructStore.update('utility', {
  provider: 'st',
  presetMode: 'full-profile',
  instructMode: 'off',
  samplerMode: 'profile',
  structuredOutputMode: 'prompt-json',
  maxTokens: 550
});
const noInstructClient = createDirectiveProviderClient({
  contextFactory: () => noInstructContext,
  settingsStore: noInstructStore,
  nativeResponseToolsLoader: async () => ({
    ...(await nativeResponseToolsLoader()),
    getInstructStoppingSequences: ({ customInstruct } = {}) => customInstruct ? ['<STOP>'] : ['GLOBAL_STOP']
  })
});
const noInstructResult = await noInstructClient.generate('acceptedPairMissionEvidence', {
  messages: [{ role: 'user', content: 'Do not apply global instruct cleanup.' }]
});
assert.equal(noInstructResult.text, 'keep output GLOBAL_', 'disabled instruct never inherits global stop strings');

const presetStopContext = {
  ...noInstructContext,
  extensionSettings: {},
  getPresetManager: (type) => ({
    getCompletionPresetByName: () => type === 'textgenerationwebui'
      ? { stopping_strings: ['<END>'] }
      : null
  }),
  TextCompletionService: {
    ...noInstructContext.TextCompletionService,
    async processRequest() {
      return [{ content: 'keep preset output<EN' }];
    },
    async presetToGeneratePayload(preset, _overrides, basePayload) {
      return { ...basePayload, stopping_strings: preset.stopping_strings };
    }
  }
};
const presetStopStore = createSillyTavernProviderSettingsStore({ context: presetStopContext });
presetStopStore.update('utility', {
  provider: 'st',
  presetMode: 'full-profile',
  instructMode: 'off',
  samplerMode: 'profile',
  structuredOutputMode: 'prompt-json',
  maxTokens: 550
});
const presetStopClient = createDirectiveProviderClient({
  contextFactory: () => presetStopContext,
  settingsStore: presetStopStore,
  nativeResponseToolsLoader
});
const presetStopResult = await presetStopClient.generate('acceptedPairMissionEvidence', {
  messages: [{ role: 'user', content: 'Apply the profile stopping strings.' }]
});
assert.equal(presetStopResult.text, 'keep preset output', 'full-profile text stopping strings retain native cleanup');

const textLengthContext = {
  ...noInstructContext,
  extensionSettings: {},
  TextCompletionService: {
    ...noInstructContext.TextCompletionService,
    async processRequest() {
      return [{ content: '', finish_reason: 'length' }];
    }
  }
};
const textLengthStore = createSillyTavernProviderSettingsStore({ context: textLengthContext });
textLengthStore.update('utility', {
  provider: 'st',
  presetMode: 'none',
  instructMode: 'off',
  samplerMode: 'directive',
  structuredOutputMode: 'prompt-json',
  maxTokens: 550
});
const textLengthClient = createDirectiveProviderClient({
  contextFactory: () => textLengthContext,
  settingsStore: textLengthStore,
  nativeResponseToolsLoader
});
await assert.rejects(
  textLengthClient.generate('acceptedPairMissionEvidence', {
    messages: [{ role: 'user', content: 'Return bounded text JSON.' }]
  }),
  (error) => {
    assert.equal(error.code, 'provider_token_limit');
    assert.equal(error.details.finishReason, 'length');
    return true;
  }
);

const sourceRaceContext = {
  extensionSettings: {},
  mainApi: 'openai',
  chatCompletionSettings: { chat_completion_source: 'claude' },
  getChatCompletionModel: () => 'claude-sonnet',
  ChatCompletionService: {
    async processRequest() {
      sourceRaceContext.chatCompletionSettings.chat_completion_source = 'nanogpt';
      return { content: [{ type: 'thinking', thinking: 'private Claude reasoning' }], stop_reason: 'end_turn' };
    }
  }
};
const sourceRaceStore = createSillyTavernProviderSettingsStore({ context: sourceRaceContext });
sourceRaceStore.update('utility', {
  provider: 'st',
  presetMode: 'none',
  instructMode: 'off',
  samplerMode: 'directive',
  structuredOutputMode: 'prompt-json'
});
const sourceRaceClient = createDirectiveProviderClient({
  contextFactory: () => sourceRaceContext,
  settingsStore: sourceRaceStore,
  nativeResponseToolsLoader: async () => ({
    ...(await nativeResponseToolsLoader()),
    extractReasoningFromData: (data, { chatCompletionSource } = {}) => chatCompletionSource === 'claude'
      ? data?.content?.filter((part) => part.type === 'thinking').map((part) => part.thinking).join('\n\n') || ''
      : ''
  })
});
await assert.rejects(
  sourceRaceClient.generate('acceptedPairMissionEvidence', { prompt: 'Preserve the sent source.' }, {
    allowVisibleOutputRetry: false
  }),
  (error) => error.code === 'provider_reasoning_only'
);

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
  policyIncompleteClient.generate('acceptedPairMissionEvidence', { prompt: 'Do not use an incomplete transport.' }),
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
  invalidClient.generate('acceptedPairMissionEvidence', { prompt: 'No route.' }),
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
  leakyClient.generate('acceptedPairMissionEvidence', { prompt: 'Do not expose backend errors.' }),
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
let cancellationStarted;
const cancellationEntered = new Promise(resolve => { cancellationStarted = resolve; });
const cancellationContext = {
  extensionSettings: {},
  ConnectionManagerRequestService: {
    ...profileService,
    async sendRequest(_profileId, _messages, _maxTokens, options) {
      cancellationSignal = options.signal;
      cancellationStarted();
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
const canceled = cancellationClient.generate('acceptedPairMissionEvidence', { prompt: 'Cancel.' }, { signal: controller.signal, timeoutMs: 1000 });
await cancellationEntered;
controller.abort();
await assert.rejects(canceled, (error) => error?.code === 'DIRECTIVE_GENERATION_ABORTED');
assert.equal(cancellationSignal.aborted, true);
const previousSignal = cancellationSignal;
await assert.rejects(cancellationClient.generate('acceptedPairMissionEvidence', { prompt: 'Already stopped.' }, { signal: controller.signal }),
  error => error?.code === 'DIRECTIVE_GENERATION_ABORTED');
assert.equal(cancellationSignal, previousSignal, 'already canceled requests never reach transport');
const preparingController = new AbortController();
const preparingRequest = cancellationClient.generate('acceptedPairMissionEvidence', { prompt: 'Stop during sampler preparation.' }, { signal: preparingController.signal });
preparingController.abort();
await assert.rejects(preparingRequest, error => error?.code === 'DIRECTIVE_GENERATION_ABORTED');
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(cancellationSignal, previousSignal, 'cancellation during async preparation prevents a later transport start');

const routedProviderClient = createDirectiveProviderClient({ contextFactory: () => cancellationContext, settingsStore: cancellationStore });
const router = createDirectiveGenerationRouter({
  generation: createSillyTavernGenerationClient({ providerClient: routedProviderClient })
});
const routedController = new AbortController();
const routed = router.generate('acceptedPairMissionEvidence', { prompt: 'Cancel through router.' }, {
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

assert.equal(normalizeProviderResponseUsage({}), null);
assert.deepEqual(normalizeProviderResponseUsage({ usage: { input_tokens: 0, output_tokens: -1, total_tokens: '17' } }), { input_tokens: 0, output_tokens: null, total_tokens: null });
