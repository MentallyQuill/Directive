import assert from 'node:assert/strict';

import {
  GENERATION_ROLE_IDS
} from '../../src/generation/generation-roles.mjs';
import {
  createDirectiveProviderSecretStore,
  createSillyTavernProviderSettingsStore,
  listProviderRoleRouting,
  providerKindForRole
} from '../../src/providers/directive-provider-settings.mjs';
import {
  DIRECTIVE_PROVIDER_TEST_MAX_TOKENS,
  createDirectiveProviderClient
} from '../../src/hosts/sillytavern/provider-client.mjs';
import {
  PROVIDER_RESPONSE_ERROR_CODES
} from '../../src/providers/provider-response-normalizer.mjs';

const profileCalls = [];
const rawCalls = [];
const fetchCalls = [];
const sessionValues = new Map();
const sessionStorage = {
  getItem: (key) => sessionValues.get(key) || null,
  setItem: (key, value) => sessionValues.set(key, String(value)),
  removeItem: (key) => sessionValues.delete(key)
};
const context = {
  extensionSettings: {},
  modelName: 'Current ST Model',
  saveSettingsDebounced() {},
  async generateRaw(request) {
    rawCalls.push(request);
    return { text: 'current-model-response', providerId: 'current-st' };
  },
  ConnectionManagerRequestService: {
    async sendRequest(profileId, messages, maxTokens, options, overridePayload) {
      profileCalls.push({ profileId, messages, maxTokens, options, overridePayload });
      return { text: 'profile-response', providerId: `profile:${profileId}` };
    }
  },
  connectionProfiles: [
    { id: 'reasoning-profile', name: 'Reasoning Profile', model: 'Reasoner-70B' }
  ]
};
const fetchImpl = async (url, options) => {
  fetchCalls.push({ url, options: JSON.parse(JSON.stringify(options)) });
  return {
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify({
        choices: [{ message: { content: 'utility-endpoint-response' } }],
        usage: { prompt_tokens: 4, completion_tokens: 2 }
      });
    }
  };
};

const secretStore = createDirectiveProviderSecretStore({ sessionStorage });
const store = createSillyTavernProviderSettingsStore({ context, secretStore });
assert.equal(store.get('utility').maxTokens, 8192);
assert.equal(store.get('reasoning').maxTokens, 8192);
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

assert.equal(providerKindForRole('utilityTurnClassifier'), 'utility');
assert.equal(providerKindForRole('continuityTracker'), 'utility');
assert.equal(providerKindForRole('continuityProjectionPlanner'), 'utility');
assert.equal(providerKindForRole('continuityContradictionReviewer'), 'utility');
assert.equal(providerKindForRole('continuityClaimExtractor'), 'utility');
assert.equal(providerKindForRole('continuityProjectionCompressor'), 'utility');
assert.equal(providerKindForRole('questActionInterpreter'), 'utility');
assert.equal(providerKindForRole('sceneDeltaExtractor'), 'utility');
assert.equal(providerKindForRole('sceneReconciliationExtractor'), 'utility');
assert.equal(providerKindForRole('commandLogSummarizer'), 'utility');
assert.equal(providerKindForRole('factualGroundingReviewer'), 'utility');
assert.equal(providerKindForRole('storyQualityReviewer'), 'utility');
assert.equal(providerKindForRole('missionDirectorAdvisor'), 'reasoning');
assert.equal(providerKindForRole('campaignIntro'), 'reasoning');
assert.equal(providerKindForRole('directiveAssist'), 'reasoning');
assert.equal(providerKindForRole('characterCreatorSectionDraft'), 'reasoning');
assert.equal(providerKindForRole('relationshipEvaluator'), 'utility');
assert.equal(providerKindForRole('commandBearingFitChecker'), 'utility');
assert.equal(providerKindForRole('commandBearingSpendValidator'), 'utility');
assert.equal(providerKindForRole('commandBearingEvaluator'), 'utility');
assert.equal(providerKindForRole('outcomeIntegrityReview'), 'utility');
assert.equal(providerKindForRole('crewDirector'), 'utility');
assert.equal(providerKindForRole('shipDirector'), 'utility');
assert.equal(providerKindForRole('questArchitect'), 'reasoning');
assert.throws(() => providerKindForRole('unknownRole'), /Unknown generation role/);

const roleRouting = listProviderRoleRouting();
assert.equal(roleRouting.length, GENERATION_ROLE_IDS.length);
for (const roleId of GENERATION_ROLE_IDS) {
  const route = roleRouting.find((entry) => entry.roleId === roleId);
  assert.ok(route, `Missing provider route for ${roleId}`);
  assert.ok(['utility', 'reasoning'].includes(route.providerKind), `Invalid provider kind for ${roleId}`);
  assert.ok(['utility', 'reasoning'].includes(route.defaultProviderKind), `Invalid default provider kind for ${roleId}`);
  assert.equal(route.overridden, false);
  assert.equal(typeof route.blocking, 'boolean');
  assert.equal(typeof route.mayProposeState, 'boolean');
  assert.ok(route.fallback, `Missing fallback for ${roleId}`);
}
assert.equal(store.get('utility').apiKeySet, true);
assert.equal(JSON.stringify(context.extensionSettings).includes('SESSION_ONLY_KEY'), false);
assert.equal(secretStore.get('utility'), 'SESSION_ONLY_KEY');

const client = createDirectiveProviderClient({
  contextFactory: () => context,
  settingsStore: store,
  fetchImpl
});
const utility = await client.generate('utilityTurnClassifier', {
  messages: [{ role: 'user', content: 'Classify this.' }],
  parameters: { temperature: 0.05, top_p: 0.8, max_tokens: 384 }
});
assert.equal(utility.providerKind, 'utility');
assert.equal(utility.text, 'utility-endpoint-response');
assert.equal(fetchCalls.length, 1);
assert.equal(fetchCalls[0].url, 'https://utility.example/v1/chat/completions');
assert.equal(fetchCalls[0].options.headers.Authorization, 'Bearer SESSION_ONLY_KEY');
const utilityBody = JSON.parse(fetchCalls[0].options.body);
assert.equal(utilityBody.model, 'utility-small');
assert.equal(utilityBody.temperature, 0.05);
assert.equal(utilityBody.top_p, 0.8);
assert.equal(utilityBody.max_tokens, 384);

const reasoning = await client.generate('campaignIntro', {
  messages: [{ role: 'user', content: 'Write an intro.' }],
  parameters: { temperature: 0.55, top_p: 0.9 }
});
assert.equal(reasoning.providerKind, 'reasoning');
assert.equal(reasoning.text, 'profile-response');
assert.equal(profileCalls.length, 1);
assert.equal(profileCalls[0].profileId, 'reasoning-profile');
assert.equal(profileCalls[0].maxTokens, 4096);
assert.equal(profileCalls[0].overridePayload.temperature, 0.55);
assert.equal(profileCalls[0].overridePayload.top_p, 0.9);

const defaultRelationship = await client.generate('relationshipEvaluator', {
  messages: [{ role: 'user', content: 'Check relationship implications.' }]
});
assert.equal(defaultRelationship.providerKind, 'utility');
assert.equal(fetchCalls.length, 2);

const relationshipRoute = store.updateRoleProviderKind('relationshipEvaluator', 'reasoning');
assert.equal(relationshipRoute.providerKind, 'reasoning');
assert.equal(relationshipRoute.defaultProviderKind, 'utility');
assert.equal(relationshipRoute.overridden, true);
assert.equal(store.getRoleProviderKind('relationshipEvaluator'), 'reasoning');
assert.equal(providerKindForRole('relationshipEvaluator', store.getAll()), 'reasoning');
assert.equal(store.getAll().roleProviderKinds.relationshipEvaluator, 'reasoning');

const overriddenRelationship = await client.generate('relationshipEvaluator', {
  messages: [{ role: 'user', content: 'Check relationship implications through the reasoner.' }]
});
assert.equal(overriddenRelationship.providerKind, 'reasoning');
assert.equal(profileCalls.length, 2);
assert.equal(profileCalls[1].profileId, 'reasoning-profile');

const resetRelationship = store.resetRoleProviderKind('relationshipEvaluator');
assert.equal(resetRelationship.providerKind, 'utility');
assert.equal(resetRelationship.overridden, false);
assert.equal(store.getAll().roleProviderKinds.relationshipEvaluator, undefined);

const outcomeReviewOverride = await client.generate('outcomeIntegrityReview', {
  role: { id: 'outcomeIntegrityReview', providerKind: 'reasoning' },
  messages: [{ role: 'user', content: 'Review this prose edit.' }]
});
assert.equal(outcomeReviewOverride.providerKind, 'reasoning');
assert.equal(outcomeReviewOverride.text, 'profile-response');
assert.equal(profileCalls.length, 3);

const retryProfileCalls = [];
const retryProfileContext = {
  extensionSettings: {},
  saveSettingsDebounced() {},
  ConnectionManagerRequestService: {
    async sendRequest(profileId, messages, maxTokens, options, overridePayload) {
      retryProfileCalls.push({ profileId, messages, maxTokens, options, overridePayload });
      if (retryProfileCalls.length === 1) {
        return {
          choices: [{
            message: {
              content: '',
              reasoning: 'The profile produced hidden reasoning but no visible answer.'
            },
            finish_reason: 'stop'
          }]
        };
      }
      return {
        choices: [{
          message: { content: 'visible-profile-retry-response' },
          finish_reason: 'stop'
        }]
      };
    }
  },
  connectionProfiles: [
    { id: 'retry-profile', name: 'Retry Profile', model: 'Retry-70B' }
  ]
};
const retryProfileStore = createSillyTavernProviderSettingsStore({
  context: retryProfileContext,
  secretStore: createDirectiveProviderSecretStore({ sessionStorage })
});
retryProfileStore.update('reasoning', {
  provider: 'profile',
  profileId: 'retry-profile',
  maxTokens: 2048,
  temperature: 0.2
});
const retryProfileClient = createDirectiveProviderClient({
  contextFactory: () => retryProfileContext,
  settingsStore: retryProfileStore,
  fetchImpl
});
const retryProfileResult = await retryProfileClient.generate('campaignIntro', {
  messages: [{ role: 'user', content: 'Write a visible campaign intro.' }]
});
assert.equal(retryProfileResult.providerKind, 'reasoning');
assert.equal(retryProfileResult.text, 'visible-profile-retry-response');
assert.equal(retryProfileResult.retriedForVisibleOutput, true);
assert.equal(retryProfileCalls.length, 2);
assert.match(retryProfileCalls[1].messages.at(-1).content, /Return the final visible answer now/);

store.update('utility', { provider: 'st', apiKey: '' });
const current = await client.generate('continuityTracker', {
  messages: [{ role: 'user', content: 'Track continuity.' }]
});
assert.equal(current.providerKind, 'utility');
assert.equal(current.text, 'current-model-response');
assert.equal(rawCalls.length, 1);
assert.equal(store.get('utility').apiKeySet, false);
assert.equal(secretStore.get('utility'), '');

const rawSignalController = new AbortController();
await client.generate('continuityTracker', {
  messages: [{ role: 'user', content: 'Track continuity with cancel support.' }],
  signal: rawSignalController.signal
});
assert.equal(rawCalls.length, 2);
assert.equal(rawCalls[1].signal, rawSignalController.signal);

const profiles = client.listProfiles();
assert.equal(profiles.some((entry) => entry.id === 'reasoning-profile' && entry.model === 'Reasoner-70B'), true);
assert.equal(client.status('reasoning').ready, true);

store.update('utility', {
  provider: 'openai_compatible',
  baseUrl: 'https://utility.example/v1',
  model: 'utility-small',
  maxTokens: 64
});
const providerTestFetchCalls = [];
const tokenLimitedClient = createDirectiveProviderClient({
  contextFactory: () => context,
  settingsStore: store,
  fetchImpl: async (url, options) => {
    providerTestFetchCalls.push({ url, body: JSON.parse(options.body) });
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          id: 'chatcmpl-provider-test',
          object: 'chat.completion',
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: '',
              reasoning: 'Analyzing provider connectivity test.'
            },
            finish_reason: 'length'
          }]
        });
      }
    };
  }
});
const tokenLimitedProviderTest = await tokenLimitedClient.test('utility');
assert.equal(providerTestFetchCalls.length, 1);
assert.equal(providerTestFetchCalls[0].body.max_tokens, DIRECTIVE_PROVIDER_TEST_MAX_TOKENS);
assert.equal(providerTestFetchCalls[0].body.temperature, 0);
assert.equal(tokenLimitedProviderTest.ok, false);
assert.equal(tokenLimitedProviderTest.maxTokens, DIRECTIVE_PROVIDER_TEST_MAX_TOKENS);
assert.equal(tokenLimitedProviderTest.error.code, PROVIDER_RESPONSE_ERROR_CODES.TOKEN_LIMIT);
assert.match(tokenLimitedProviderTest.error.message, /token limit/);
assert.equal(tokenLimitedProviderTest.error.details.finishReason, 'length');

console.log('Directive provider routing tests passed: Utility/Reasoning isolation, ST/profile/OpenAI-compatible routing, and session-only keys');
