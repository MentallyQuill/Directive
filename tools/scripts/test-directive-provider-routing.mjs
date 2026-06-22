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
import { createDirectiveProviderClient } from '../../src/hosts/sillytavern/provider-client.mjs';

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
assert.equal(providerKindForRole('questActionInterpreter'), 'utility');
assert.equal(providerKindForRole('sceneDeltaExtractor'), 'utility');
assert.equal(providerKindForRole('sceneReconciliationExtractor'), 'utility');
assert.equal(providerKindForRole('commandLogSummarizer'), 'utility');
assert.equal(providerKindForRole('missionDirectorAdvisor'), 'reasoning');
assert.equal(providerKindForRole('campaignIntro'), 'reasoning');
assert.equal(providerKindForRole('characterCreatorSectionDraft'), 'reasoning');
assert.equal(providerKindForRole('relationshipEvaluator'), 'reasoning');
assert.equal(providerKindForRole('commandBearingEvaluator'), 'reasoning');
assert.equal(providerKindForRole('questArchitect'), 'reasoning');
assert.throws(() => providerKindForRole('unknownRole'), /Unknown generation role/);

const roleRouting = listProviderRoleRouting();
assert.equal(roleRouting.length, GENERATION_ROLE_IDS.length);
for (const roleId of GENERATION_ROLE_IDS) {
  const route = roleRouting.find((entry) => entry.roleId === roleId);
  assert.ok(route, `Missing provider route for ${roleId}`);
  assert.ok(['utility', 'reasoning'].includes(route.providerKind), `Invalid provider kind for ${roleId}`);
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

store.update('utility', { provider: 'st', apiKey: '' });
const current = await client.generate('continuityTracker', {
  messages: [{ role: 'user', content: 'Track continuity.' }]
});
assert.equal(current.providerKind, 'utility');
assert.equal(current.text, 'current-model-response');
assert.equal(rawCalls.length, 1);
assert.equal(store.get('utility').apiKeySet, false);
assert.equal(secretStore.get('utility'), '');

const profiles = client.listProfiles();
assert.equal(profiles.some((entry) => entry.id === 'reasoning-profile' && entry.model === 'Reasoner-70B'), true);
assert.equal(client.status('reasoning').ready, true);

console.log('Directive provider routing tests passed: Utility/Reasoning isolation, ST/profile/OpenAI-compatible routing, and session-only keys');
