import assert from 'node:assert/strict';
import { createSillyTavernProviderSettingsStore } from '../../src/providers/directive-provider-settings.mjs';
import { createDirectiveProviderClient } from '../../src/hosts/sillytavern/provider-client.mjs';
import { createDirectiveGenerationRouter } from '../../src/runtime/runtime-app.mjs';

const sent = [];
const context = {
  extensionSettings: {},
  saveSettingsDebounced() {},
  ConnectionManagerRequestService: {
    getSupportedProfiles: () => [{ id: 'test', api: 'openai', model: 'test' }],
    getProfile: () => ({ id: 'test', api: 'openai', model: 'test' }),
    validateProfile: () => ({ selected: 'openai', source: 'custom' }),
    async sendRequest(_id, _messages, maxTokens) { sent.push(maxTokens); return { content: 'visible answer' }; },
  },
};
const settings = createSillyTavernProviderSettingsStore({ context });
settings.update('reasoning', {
  provider: 'profile', profileId: 'test', structuredOutputMode: 'prompt-json', maxTokens: 16000,
  roleLimits: { episodeEvaluator: { maxTokens: 24000, timeoutSeconds: 420, maxAttempts: 4 } },
});
const provider = createDirectiveProviderClient({ contextFactory: () => context, settingsStore: settings });
await provider.generate('episodeEvaluator', { prompt: 'test', parameters: { max_tokens: 4096 } });
assert.equal(sent.at(-1), 24000, 'explicit role budget reaches transport above both lane and old request cap');
await provider.generate('storyDirectionAnalyst', { prompt: 'test', parameters: { max_tokens: 2048 } });
assert.equal(sent.at(-1), 16000, 'inherited lane budget reaches transport without a hidden request cap');

const routed = [];
const router = createDirectiveGenerationRouter({
  providers: { getSettings: () => settings.getAll() },
  generation: { async generate(role, request, options) { routed.push({ role, request, options }); return { text: 'ok' }; } },
});
assert.equal(router.getMaxTokens('episodeEvaluator', 4096), 24000);
assert.equal(router.getTimeoutMs('episodeEvaluator', 60000), 420000);
assert.equal(router.getMaxAttempts('episodeEvaluator'), 4);
await router.generate('episodeEvaluator', { parameters: { max_tokens: 4096 } }, { timeoutMs: 60000 });
assert.equal(routed[0].request.parameters.max_tokens, 24000);
assert.equal(routed[0].options.timeoutMs, 420000);
settings.update('reasoning', { roleLimits: { episodeEvaluator: { maxTokens: null, timeoutSeconds: null, maxAttempts: 1 } } });
assert.equal(router.getMaxTokens('episodeEvaluator', 4096), 16000);
assert.equal(router.getMaxAttempts('episodeEvaluator'), 1);
settings.update('utility', { analysisLimits: { providerVisibleOutputAttempts: 3, providerTestMaxTokens: 9000 } });
let recoveryCalls = 0;
context.ConnectionManagerRequestService.sendRequest = async () => (++recoveryCalls < 3
  ? { content: '', reasoning: 'thinking' } : { content: 'answer' });
assert.equal((await provider.generate('episodeEvaluator', { prompt: 'test' })).text, 'answer');
assert.equal(recoveryCalls, 3, 'visible-output recovery uses its configured attempt budget');
settings.update('utility', { analysisLimits: { providerVisibleOutputAttempts: 1 } });
recoveryCalls = 0;
await assert.rejects(provider.generate('episodeEvaluator', { prompt: 'test' }));
assert.equal(recoveryCalls, 1, 'one attempt disables automatic visible-output recovery');
context.ConnectionManagerRequestService.sendRequest = async (_id, _messages, maxTokens, _options, payload) => {
  sent.push(maxTokens); return { content: payload?.json_schema ? { ok: true } : 'DIRECTIVE_PROVIDER_OK' };
};
assert.equal((await provider.test('reasoning')).maxTokens, 9000);
assert.equal(sent.at(-1), 9000);
settings.update('reasoning', { timeoutSeconds: 7 });
context.ConnectionManagerRequestService.sendRequest = async () => new Promise(() => {});
const originalSetTimeout = globalThis.setTimeout;
const waits = [];
globalThis.setTimeout = (callback, milliseconds, ...args) => {
  waits.push(milliseconds);
  return originalSetTimeout(callback, 0, ...args);
};
try {
  const timedOutProbe = await provider.test('reasoning');
  assert.equal(timedOutProbe.error.code, 'DIRECTIVE_GENERATION_TIMEOUT');
  assert.deepEqual(waits, [7000], 'provider certification honors its lane timeout');
} finally { globalThis.setTimeout = originalSetTimeout; }
console.log('Configured generation limit routing tests passed.');

settings.update('reasoning', { outputTokenOverride: null, roleLimits: { episodeEvaluator: { maxTokens: null } } });
settings.update('utility', { analysisCapacity: 5, analysisOverrides: null });
assert.equal(router.getMaxTokens('episodeEvaluator'), 40960);
assert.equal(router.getAnalysisLimits().threadMaxRecords, 60);
assert.equal(router.getAnalysisLimits().threadInactivityRevisions, 12);
assert.equal(router.getMaxAttempts('episodeEvaluator'), 1);
assert.equal(router.getTimeoutMs('episodeEvaluator'), 7000);
context.ConnectionManagerRequestService.sendRequest = async (_id, _messages, maxTokens) => { sent.push(maxTokens); return { content: 'answer' }; };
await provider.generate('episodeEvaluator', { prompt: 'test', parameters: { max_tokens: 4096 } });
assert.equal(sent.at(-1), 40960, 'capacity affects actual provider calls');
settings.update('utility', { analysisCapacity: 0.5 });
assert.equal(router.getMaxTokens('episodeEvaluator'), 4096);
assert.equal(router.getAnalysisLimits().threadMaxRecords, 6);
settings.update('reasoning', { roleLimits: { episodeEvaluator: { maxTokens: 19000 } } });
settings.update('utility', { analysisOverrides: { threadMaxRecords: 17 } });
await provider.generate('episodeEvaluator', { prompt: 'test' });
assert.equal(sent.at(-1), 19000, 'exact role override remains independent of capacity');
assert.equal(router.getAnalysisLimits().threadMaxRecords, 17);
console.log('Analysis capacity transport and independent override tests passed.');
