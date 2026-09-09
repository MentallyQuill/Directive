import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createSillyTavernDirectiveHost } from '../../src/hosts/sillytavern/host-factory.mjs';
import { createDirectiveProviderClient } from '../../src/hosts/sillytavern/provider-client.mjs';
import { createSillyTavernProviderSettingsStore } from '../../src/providers/directive-provider-settings.mjs';

let response = { choices: [{ finish_reason: 'length', message: { content: '', reasoning: 'PRIVATE_SENTINEL' } }] };
const context = {
  eventSource: new EventEmitter(),
  extensionSettings: {}, saveSettingsDebounced() {},
  ConnectionManagerRequestService: {
    getSupportedProfiles: () => [{ id: 'test', api: 'openai', model: 'test' }],
    getProfile: () => ({ id: 'test', api: 'openai', model: 'test' }),
    validateProfile: () => ({ selected: 'openai', source: 'custom' }),
    async sendRequest() { return response; },
  },
};
const settingsStore = createSillyTavernProviderSettingsStore({ context });
settingsStore.update('reasoning', { provider: 'profile', profileId: 'test', structuredOutputMode: 'prompt-json' });
settingsStore.update('utility', { analysisCapacity: 2 });
const notices = [];
const client = createDirectiveProviderClient({ contextFactory: () => context, settingsStore, onOutputLimit: notice => notices.push(notice) });
await assert.rejects(client.generate('episodeEvaluator', { prompt: 'PRIVATE_PROMPT' }), { code: 'provider_token_limit' });
assert.deepEqual(notices, [{ roleId: 'episodeEvaluator', analysisCapacity: 2, hasOutputOverride: false }]);
assert.doesNotMatch(JSON.stringify(notices), /PRIVATE/);
settingsStore.update('reasoning', { roleLimits: { episodeEvaluator: { maxTokens: 3000 } } });
await assert.rejects(client.generate('episodeEvaluator', {}), { code: 'provider_token_limit' });
assert.equal(notices.at(-1).hasOutputOverride, true);
response = { content: '{broken', finish_reason: 'stop' };
await client.generate('episodeEvaluator', {});
response = { content: '', reasoning: 'thinking', finish_reason: 'stop' };
await assert.rejects(client.generate('episodeEvaluator', {}, { allowVisibleOutputRetry: false }), { code: 'provider_reasoning_only' });
assert.equal(notices.length, 2, 'no capacity notice for malformed or reasoning-only responses without a token-limit finish reason');
const originalSend = context.ConnectionManagerRequestService.sendRequest;
context.ConnectionManagerRequestService.sendRequest = async () => { throw Object.assign(new Error('length mentioned in a network error'), { code: 'ECONNRESET' }); };
await assert.rejects(client.generate('episodeEvaluator', {}));
assert.equal(notices.length, 2, 'generic errors mentioning length are not classified as token exhaustion');
context.ConnectionManagerRequestService.sendRequest = originalSend;
response = { choices: [{ finish_reason: 'length', message: { content: '{partial' } }] };
const brokenUi = createDirectiveProviderClient({ contextFactory: () => context, settingsStore, onOutputLimit() { throw new Error('UI failed'); } });
await assert.rejects(brokenUi.generate('episodeEvaluator', {}), { code: 'provider_token_limit' });
const emitted = [];
const host = createSillyTavernDirectiveHost({ context, ui: { send: message => emitted.push(message) } });
await assert.rejects(host.generation.generate('episodeEvaluator', {}), { code: 'provider_token_limit' });
assert.equal(emitted.length, 1);
assert.equal(emitted[0].type, 'directive.modelOutputLimit.v1');
assert.deepEqual(emitted[0].payload, notices.at(-1));
const controller = new AbortController(); controller.abort();
await assert.rejects(client.generate('episodeEvaluator', {}, { signal: controller.signal }), { code: 'DIRECTIVE_GENERATION_ABORTED' });
assert.equal(notices.length, 2, 'canceled requests do not publish output-limit advice');
console.log('Confirmed model output-limit notification emission passed.');
