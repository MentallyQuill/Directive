import assert from 'node:assert/strict';
import { normalizeDirectiveProviderSettings, createSillyTavernProviderSettingsStore } from '../../src/providers/directive-provider-settings.mjs';
import { createDirectiveGenerationRouter } from '../../src/runtime/runtime-app.mjs';
import { createStoryDirector } from '../../src/story/story-director.mjs';
import { createEpisodeEvaluator } from '../../src/story/episode-evaluator.mjs';
import { createMissionAcceptedPairInterpreter } from '../../src/mission/v1/accepted-pair-interpreter.mjs';
import { makeDirectorRequest, makeDirectorOutput, makeEpisodeReviewRequest } from './director-contract-test-fixtures.mjs';

assert.equal(normalizeDirectiveProviderSettings().reasoning.timeoutSeconds, 300);
const store = createSillyTavernProviderSettingsStore({ context: { extensionSettings: {} } });
store.update('reasoning', { certification: { status: 'passed', configHash: 'existing' } });
store.update('reasoning', { timeoutSeconds: 1500 });
assert.equal(store.get('reasoning').certification.status, 'passed', 'changing only the deadline does not invalidate model capabilities');
assert.equal(store.get('reasoning').timeoutSeconds, 1500);
assert.equal(normalizeDirectiveProviderSettings({ utility: { timeoutSeconds: Infinity } }).utility.timeoutSeconds, 300);
assert.equal(normalizeDirectiveProviderSettings({ utility: { timeoutSeconds: -1 } }).utility.timeoutSeconds, 1);
const calls = [];
store.update('reasoning', { maxTokens: 16384 });
store.update('utility', { maxTokens: 16384 });
const request = makeDirectorRequest();
const router = createDirectiveGenerationRouter({
  providers: { getSettings: () => store.getAll() },
  generation: { async generate(role, payload, options) {
    calls.push({ role, payload, options });
    return { text: JSON.stringify(makeDirectorOutput(request)) };
  } },
});
const direct = createStoryDirector({ generationRouter: router, timeoutMs: 1 });
const timers = [];
const original = globalThis.setTimeout;
globalThis.setTimeout = (callback, ms, ...args) => {
  timers.push(ms);
  return original(callback, ms, ...args);
};
try {
  assert.equal((await direct({ request })).ok, true);
  assert.equal(calls.at(-1).options.timeoutMs, 1500000);
  assert.equal(calls.at(-1).payload.parameters.max_tokens, 16384);
  assert.ok(calls.at(-1).payload.systemPrompt.includes(JSON.stringify(calls.at(-1).payload.jsonSchema)),
    'Prompt JSON transports must receive the complete director output contract');
  assert.ok(timers.includes(1500000), 'outer director timer honors the configured wait');
  assert.ok(!timers.includes(1), 'old outer deadline cannot cancel a longer configured request');
  store.update('reasoning', { timeoutSeconds: 600 });
  await direct({ request });
  assert.equal(calls.at(-1).options.timeoutMs, 600000, 'settings apply without rebuilding runtime');
  await router.generate('characterCreatorSectionDraft', {}, { providerKind: 'utility', timeoutMs: 45000 });
  assert.equal(calls.at(-1).options.timeoutMs, 300000, 'fallback uses the selected lane timeout');
  timers.length = 0;
  await createEpisodeEvaluator({ generationRouter: router, timeoutMs: 1 })({ request: makeEpisodeReviewRequest() });
  assert.equal(calls.at(-1).options.timeoutMs, 600000);
  assert.ok(timers.includes(600000), 'episode evaluator does not clamp the configured timeout');
  assert.ok(!timers.includes(1));
  timers.length = 0;
  await createMissionAcceptedPairInterpreter({ generationRouter: router, timeoutMs: 1 })({});
  assert.equal(calls.at(-1).options.timeoutMs, 300000);
  assert.equal(calls.at(-1).payload.parameters.max_tokens, 16384);
  assert.ok(timers.includes(300000), 'mission interpreter outer timer uses the Utility setting');
  assert.ok(!timers.includes(1));
} finally { globalThis.setTimeout = original; }
const failedRouter = createDirectiveGenerationRouter({
  generation: { async generate() { throw Object.assign(new Error('truncated'), { code: 'provider_token_limit' }); } },
});
assert.equal((await createStoryDirector({ generationRouter: failedRouter })({ request })).reasonCode, 'provider_token_limit');
assert.equal((await createMissionAcceptedPairInterpreter({ generationRouter: failedRouter })({})).reasonCode, 'provider_token_limit');
console.log('Generation timeout settings passed.');
