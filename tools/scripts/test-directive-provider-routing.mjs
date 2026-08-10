import assert from 'node:assert/strict';

import { GENERATION_ROLE_IDS } from '../../src/generation/generation-roles.mjs';
import {
  createDirectiveProviderSecretStore,
  createSillyTavernProviderSettingsStore,
  providerKindForRole
} from '../../src/providers/directive-provider-settings.mjs';
import {
  DIRECTIVE_PROVIDER_TEST_MAX_TOKENS,
  createDirectiveProviderClient
} from '../../src/hosts/sillytavern/provider-client.mjs';
import { createSillyTavernGenerationClient } from '../../src/hosts/sillytavern/generation-client.mjs';
import { createDirectiveGenerationRouter } from '../../src/runtime/runtime-app.mjs';

assert.deepEqual(GENERATION_ROLE_IDS, [
  'narration',
  'acceptedPairMissionEvidence',
  'timeAdvanceAdjudicator',
  'characterCreatorSectionDraft',
  'utilityJson'
]);
assert.equal(providerKindForRole('narration'), 'reasoning');
assert.equal(providerKindForRole('characterCreatorSectionDraft'), 'reasoning');
assert.equal(providerKindForRole('acceptedPairMissionEvidence'), 'utility');
assert.equal(providerKindForRole('timeAdvanceAdjudicator'), 'utility');
assert.equal(providerKindForRole('utilityJson'), 'utility');
assert.throws(() => providerKindForRole('unknownRole'), /Unknown generation role/);

const sessionValues = new Map();
const sessionStorage = {
  getItem: (key) => sessionValues.get(key) || null,
  setItem: (key, value) => sessionValues.set(key, String(value)),
  removeItem: (key) => sessionValues.delete(key)
};
const profileCalls = [];
const context = {
  extensionSettings: {},
  saveSettingsDebounced() {},
  ConnectionManagerRequestService: {
    async sendRequest(profileId, messages, maxTokens, options, payload) {
      profileCalls.push({ profileId, messages, maxTokens, options, payload });
      return { text: 'profile-visible-answer' };
    }
  }
};
const secretStore = createDirectiveProviderSecretStore({ sessionStorage });
const store = createSillyTavernProviderSettingsStore({ context, secretStore });
store.update('utility', {
  provider: 'openai_compatible',
  baseUrl: 'https://utility.example/v1',
  model: 'utility-small',
  apiKey: 'SESSION_ONLY_KEY',
  maxTokens: 512,
  temperature: 0.1
});
store.update('reasoning', {
  provider: 'profile',
  profileId: 'reasoning-profile',
  maxTokens: 4096,
  temperature: 0.65
});
assert.equal(store.get('utility').apiKeySet, true);
assert.equal(store.getRoleProviderKind('acceptedPairMissionEvidence'), 'utility');
assert.equal(store.getRoleProviderKind('narration'), 'reasoning');
assert.equal(JSON.stringify(context.extensionSettings).includes('SESSION_ONLY_KEY'), false);
assert.equal(secretStore.get('utility'), 'SESSION_ONLY_KEY');

const fetchCalls = [];
const fetchImpl = async (url, options) => {
  fetchCalls.push({ url, options });
  return {
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify({
        choices: [{ message: { content: 'utility-visible-answer' } }],
        usage: { prompt_tokens: 4, completion_tokens: 2 }
      });
    }
  };
};
const client = createDirectiveProviderClient({
  contextFactory: () => context,
  settingsStore: store,
  fetchImpl
});

const currentModelCalls = [];
const currentModelContext = {
  extensionSettings: {},
  mainApi: 'openai',
  chatCompletionSettings: {
    chat_completion_source: 'nanogpt'
  },
  getChatCompletionModel: () => 'zai-org/glm-5.1:thinking',
  ChatCompletionService: {
    async processRequest(requestData, options, extractData, signal) {
      currentModelCalls.push({ requestData, options, extractData, signal });
      return { content: 'controlled-current-answer', reasoning: '' };
    }
  }
};
const currentModelStore = createSillyTavernProviderSettingsStore({
  context: currentModelContext,
  secretStore: createDirectiveProviderSecretStore({ sessionStorage })
});
currentModelStore.update('utility', {
  provider: 'st',
  maxTokens: 640,
  temperature: 0.15,
  topP: 0.85
});
const currentModelClient = createDirectiveProviderClient({
  contextFactory: () => currentModelContext,
  settingsStore: currentModelStore,
  fetchImpl
});
const currentModelSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['ok'],
  properties: { ok: { type: 'boolean' } }
};
const currentModelResult = await currentModelClient.generate('utilityJson', {
  systemPrompt: 'Return only bounded Directive utility JSON.',
  prompt: 'Inspect the accepted visible pair.',
  parameters: {
    temperature: 0.05,
    top_p: 0.75,
    max_tokens: 320
  },
  jsonSchema: currentModelSchema
});
assert.equal(currentModelResult.text, 'controlled-current-answer');
assert.deepEqual(currentModelCalls, [{
  requestData: {
    stream: false,
    messages: [
      { role: 'system', content: 'Return only bounded Directive utility JSON.' },
      { role: 'user', content: 'Inspect the accepted visible pair.' }
    ],
    model: 'zai-org/glm-5.1:thinking',
    chat_completion_source: 'nanogpt',
    max_tokens: 320,
    temperature: 0.05,
    top_p: 0.75,
    json_schema: currentModelSchema
  },
  options: { presetName: 'Directive' },
  extractData: true,
  signal: undefined
}]);

const utility = await client.generate('acceptedPairMissionEvidence', {
  kind: 'directive.testStructuredRequest',
  messages: [{ role: 'user', content: 'Interpret this accepted pair.' }],
  parameters: { temperature: 0.05, top_p: 0.8, max_tokens: 384 },
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['ok'],
    properties: { ok: { type: 'boolean' } }
  }
});
assert.equal(utility.providerKind, 'utility');
assert.equal(utility.text, 'utility-visible-answer');
assert.equal(fetchCalls[0].url, 'https://utility.example/v1/chat/completions');
assert.equal(fetchCalls[0].options.headers.Authorization, 'Bearer SESSION_ONLY_KEY');
const utilityBody = JSON.parse(fetchCalls[0].options.body);
assert.equal(utilityBody.model, 'utility-small');
assert.equal(utilityBody.temperature, 0.05);
assert.equal(utilityBody.top_p, 0.8);
assert.equal(utilityBody.max_tokens, 384);
assert.deepEqual(utilityBody.response_format, {
  type: 'json_schema',
  json_schema: {
    name: 'directive_test_structured_request',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['ok'],
      properties: { ok: { type: 'boolean' } }
    }
  }
});

const reasoningSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['draft'],
  properties: { draft: { type: 'string' } }
};
const reasoning = await client.generate('characterCreatorSectionDraft', {
  messages: [{ role: 'user', content: 'Draft the bounded character section.' }],
  parameters: { max_tokens: 700 },
  jsonSchema: reasoningSchema
});
assert.equal(reasoning.providerKind, 'reasoning');
assert.equal(reasoning.text, 'profile-visible-answer');
assert.equal(profileCalls.length, 1);
assert.equal(profileCalls[0].profileId, 'reasoning-profile');
assert.equal(profileCalls[0].maxTokens, 700);
assert.deepEqual(profileCalls[0].payload.json_schema, reasoningSchema);

const utilityOverride = await client.generate('characterCreatorSectionDraft', {
  kind: 'directive.characterCreatorSectionDraftRepairRequest',
  messages: [{ role: 'user', content: 'Repair malformed JSON only.' }],
  parameters: { max_tokens: 256 }
}, {
  providerKind: 'utility'
});
assert.equal(utilityOverride.providerKind, 'utility');
assert.equal(utilityOverride.text, 'utility-visible-answer');
assert.equal(fetchCalls.length, 2);
assert.equal(profileCalls.length, 1, 'provider override must not use the role default profile');

const controlledFetchSignals = [];
const controlledFetch = async (_url, options) => {
  controlledFetchSignals.push(options.signal);
  return new Promise((_resolve, reject) => {
    options.signal?.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  });
};
const controlledClient = createDirectiveProviderClient({
  contextFactory: () => context,
  settingsStore: store,
  fetchImpl: controlledFetch
});
const externalController = new AbortController();
const canceledGeneration = controlledClient.generate('characterCreatorSectionDraft', {
  messages: [{ role: 'user', content: 'Cancel this request.' }]
}, {
  providerKind: 'utility',
  signal: externalController.signal,
  timeoutMs: 1000
});
externalController.abort();
await assert.rejects(canceledGeneration, (error) => error?.code === 'DIRECTIVE_GENERATION_ABORTED');
assert.equal(controlledFetchSignals[0]?.aborted, true, 'external cancellation must abort the active transport signal');

await assert.rejects(controlledClient.generate('characterCreatorSectionDraft', {
  messages: [{ role: 'user', content: 'Time out this request.' }]
}, {
  providerKind: 'utility',
  timeoutMs: 5
}), (error) => error?.code === 'DIRECTIVE_GENERATION_TIMEOUT');
assert.equal(controlledFetchSignals[1]?.aborted, true, 'timeout must abort the active transport signal');

let boundedTransportCalls = 0;
const boundedClient = createDirectiveProviderClient({
  contextFactory: () => context,
  settingsStore: store,
  fetchImpl: async () => {
    boundedTransportCalls += 1;
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({ choices: [{ message: { content: '' } }] });
      }
    };
  }
});
await assert.rejects(boundedClient.generate('characterCreatorSectionDraft', {
  messages: [{ role: 'user', content: 'One transport attempt only.' }]
}, {
  providerKind: 'utility',
  allowVisibleOutputRetry: false
}));
assert.equal(boundedTransportCalls, 1, 'creator recovery lanes must not hide extra provider transport retries');

let fullPathTransportCalls = 0;
let fullPathTransportSignal = null;
const fullPathProviderClient = createDirectiveProviderClient({
  contextFactory: () => context,
  settingsStore: store,
  fetchImpl: async (_url, options) => {
    fullPathTransportCalls += 1;
    fullPathTransportSignal = options.signal;
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('transport aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    });
  }
});
const fullPathRouter = createDirectiveGenerationRouter({
  generation: createSillyTavernGenerationClient({ providerClient: fullPathProviderClient })
});
const fullPathController = new AbortController();
const fullPathResultPromise = fullPathRouter.generate('characterCreatorSectionDraft', {
  messages: [{ role: 'user', content: 'Abort through the complete provider path.' }]
}, {
  providerKind: 'utility',
  signal: fullPathController.signal,
  timeoutMs: 1000,
  allowVisibleOutputRetry: false
});
fullPathController.abort();
const fullPathResult = await fullPathResultPromise;
assert.equal(fullPathResult.ok, false);
assert.equal(fullPathResult.error.code, 'DIRECTIVE_GENERATION_ABORTED');
assert.equal(fullPathResult.diagnostics.providerKind, 'utility');
assert.equal(fullPathTransportSignal.aborted, true);
assert.equal(fullPathTransportCalls, 1);

const tests = [];
for (const kind of ['utility', 'reasoning']) {
  const result = await client.test(kind);
  tests.push(result);
  assert.equal(result.ok, true);
  assert.equal(result.kind, kind);
  assert.equal(result.maxTokens, DIRECTIVE_PROVIDER_TEST_MAX_TOKENS);
}
assert.equal(tests[0].text, 'utility-visible-answer');
assert.equal(tests[1].text, 'profile-visible-answer');

console.log('Directive V1 provider lanes and exact generation-role routing tests passed.');
