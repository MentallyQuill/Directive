import assert from 'node:assert/strict';
import { createGenerationRoleRegistry } from '../../src/generation/generation-roles.mjs';
import { normalizeDirectiveProviderSettings, providerKindForRole, validateDirectiveProviderSettings } from '../../src/providers/directive-provider-settings.mjs';

const registry = createGenerationRoleRegistry();
for (const [id, lane] of [['characterResponder', 'reasoning'], ['sceneNarrator', 'narration'], ['characterKnowledgeReviewer', 'utility'], ['characterAudienceReviewer', 'utility']]) {
  const role = registry.get(id);
  assert.equal(role.providerKind, lane);
  assert.equal(role.mayProposeState, false);
  assert.equal(role.mayInjectPrompt, false);
  assert.equal(role.fallback, 'fail-closed');
  assert.equal(providerKindForRole(id), lane);
}
const migrated = normalizeDirectiveProviderSettings({ utility: { provider: 'profile', profileId: 'utility.saved' }, reasoning: { provider: 'profile', profileId: 'reasoning.saved' } });
assert.equal(migrated.utility.profileId, 'utility.saved');
assert.equal(migrated.reasoning.profileId, 'reasoning.saved');
assert.equal(migrated.narration.profileId, '');
assert.equal(validateDirectiveProviderSettings(migrated).ok, true, 'unused narration lane must not invalidate legacy settings');
assert.equal(validateDirectiveProviderSettings(migrated, 'narration').ok, false, 'protected narration requires an explicit connection selection');
console.log('PASS protected roles have separate routes without altering existing connections');

const { createIsolatedGenerationRequest, assertIsolatedGenerationRequest } = await import('../../src/generation/isolated-request.mjs');
const isolated = createIsolatedGenerationRequest({ messages: [{ role: 'system', content: 'Reviewed rules' }, { role: 'user', content: 'Allowed packet' }] });
assert.doesNotThrow(() => assertIsolatedGenerationRequest(isolated));
assert.throws(() => assertIsolatedGenerationRequest({ ...isolated, messages: [...isolated.messages, { role: 'user', content: 'SECRET_HISTORY' }] }), { code: 'DIRECTIVE_CONTEXT_ISOLATION' });
assert.throws(() => assertIsolatedGenerationRequest({ messages: isolated.messages }), { code: 'DIRECTIVE_CONTEXT_ISOLATION' });
assert.throws(() => createIsolatedGenerationRequest({ messages: [{ role: 'user', content: 'packet', name: 'SECRET_CARD' }] }), { code: 'DIRECTIVE_CONTEXT_ISOLATION' });
console.log('PASS isolated request integrity rejects extra context');
const { createDirectiveProviderClient } = await import('../../src/hosts/sillytavern/provider-client.mjs');
const { createSillyTavernProviderSettingsStore } = await import('../../src/providers/directive-provider-settings.mjs');
const { createTurnAttemptBudget } = await import('../../src/generation/turn-attempt-budget.mjs');
const { createSillyTavernGenerationClient } = await import('../../src/hosts/sillytavern/generation-client.mjs');
const calls = [];
let reasoningOnly = false;
const profile = { id: 'protected', model: 'fake', api: 'openai', preset: 'SECRET_PRESET' };
const context = {
  extensionSettings: {}, saveSettingsDebounced() {},
  chat: ['SECRET_HISTORY'], worldInfo: 'SECRET_WORLD', authorNote: 'SECRET_NOTE', characters: ['SECRET_CARD'],
  cache: 'SECRET_CACHE', retryFeedback: 'SECRET_RETRY',
  ConnectionManagerRequestService: {
    getSupportedProfiles: () => [profile], getProfile: () => profile,
    validateProfile: () => ({ selected: 'openai', source: 'nanogpt' }),
    async sendRequest(profileId, messages, maxTokens, options, payload) {
      calls.push({ profileId, messages, maxTokens, options, payload });
      return { choices: [{ message: reasoningOnly ? { content: '', reasoning_content: 'private reasoning' } : { content: '{"ok":true}' }, finish_reason: 'stop' }] };
    },
  },
  getPresetManager: () => ({ getCompletionPresetByName: () => ({ messages: ['SECRET_PRESET'] }) }),
  ChatCompletionService: { TYPE: 'openai', presetToGeneratePayload() { throw new Error('Protected requests must bypass preset projection'); } },
};
const settingsStore = createSillyTavernProviderSettingsStore({ context });
settingsStore.update('reasoning', { provider: 'profile', profileId: 'protected', presetMode: 'full-profile', instructMode: 'on', samplerMode: 'profile' });
const client = createDirectiveProviderClient({ contextFactory: () => context, settingsStore });
const budget = createTurnAttemptBudget({ limit: 1 });
await client.generate('characterResponder', isolated, { attemptBudget: budget });
assert.equal(budget.used, 1);
assert.equal(calls.length, 1);
assert.equal(calls[0].options.includePreset, false);
assert.equal(calls[0].options.includeInstruct, false);
assert.deepEqual(calls[0].messages, isolated.messages);
assert.ok(!JSON.stringify(calls).includes('SECRET_'));
await assert.rejects(client.generate('characterResponder', isolated, { attemptBudget: budget }), { code: 'DIRECTIVE_TURN_ATTEMPT_LIMIT' });
assert.equal(calls.length, 1);
await assert.rejects(client.generate('characterResponder', { messages: isolated.messages }, { attemptBudget: createTurnAttemptBudget() }), { code: 'DIRECTIVE_CONTEXT_ISOLATION' });
await assert.rejects(client.generate('characterResponder', isolated), { code: 'DIRECTIVE_CONTEXT_ISOLATION' });
reasoningOnly = true;
const retryBudget = createTurnAttemptBudget({ limit: 1 });
await assert.rejects(client.generate('characterResponder', isolated, { attemptBudget: retryBudget }), { code: 'DIRECTIVE_TURN_ATTEMPT_LIMIT' });
assert.equal(calls.length, 2, 'continuation must claim another physical attempt');
const fallback = createSillyTavernGenerationClient({ contextFactory: () => ({ generateRaw() { throw new Error('unsafe native fallback'); } }) });
await assert.rejects(fallback.generate('characterResponder', isolated), { code: 'DIRECTIVE_CONTEXT_ISOLATION' });
console.log('PASS protected transport strips ambient context, blocks fallback, and counts physical retries');
reasoningOnly = false;
settingsStore.update('narration', { provider: 'profile', profileId: 'protected' });
const narratorResult = await client.generate('sceneNarrator', isolated, { attemptBudget: createTurnAttemptBudget() });
assert.equal(narratorResult.providerKind, 'narration');
await assert.rejects(client.generate('characterResponder', isolated, { providerKind: 'utility', attemptBudget: createTurnAttemptBudget() }), { code: 'DIRECTIVE_CONTEXT_ISOLATION' });
let remainingEmpty = 1;
context.ConnectionManagerRequestService.sendRequest = async (profileId, messages, maxTokens, options, payload) => {
  calls.push({ profileId, messages, maxTokens, options, payload });
  return { choices: [{ message: remainingEmpty-- > 0 ? { content: '', reasoning_content: 'thinking' } : { content: '{"ok":true}' }, finish_reason: 'stop' }] };
};
const successfulRetryBudget = createTurnAttemptBudget({ limit: 2 });
await client.generate('characterResponder', isolated, { attemptBudget: successfulRetryBudget, onAttempt() { throw new Error('presentation observer'); } });
assert.equal(successfulRetryBudget.used, 2);
assert.deepEqual(calls.at(-1).messages.slice(0, -1), isolated.messages);
assert.match(calls.at(-1).messages.at(-1).content, /final visible answer/);
const stopped = new AbortController();
const beforeStop = calls.length;
context.ConnectionManagerRequestService.sendRequest = async () => {
  calls.push({ stopped: true }); stopped.abort();
  return { choices: [{ message: { content: '', reasoning_content: 'thinking' }, finish_reason: 'stop' }] };
};
await assert.rejects(client.generate('characterResponder', isolated, { signal: stopped.signal, attemptBudget: createTurnAttemptBudget({ limit: 2, signal: stopped.signal }) }), { code: 'DIRECTIVE_GENERATION_ABORTED' });
assert.equal(calls.length, beforeStop + 1);
console.log('PASS narration route, bounded trusted continuation, observer failures and Stop');

// Visible-output retries must not silently follow a changed native profile source.
let routeSource = 'nanogpt';
context.ConnectionManagerRequestService.validateProfile = () => ({ selected: 'openai', source: routeSource });
let routeSends = 0;
context.ConnectionManagerRequestService.sendRequest = async () => {
  routeSends++; routeSource = 'openai';
  return { choices: [{ message: { content: '', reasoning_content: 'thinking' }, finish_reason: 'stop' }] };
};
await assert.rejects(client.generate('characterResponder', isolated, { attemptBudget: createTurnAttemptBudget() }), { code: 'DIRECTIVE_CHARACTER_SCENE_STALE' });
assert.equal(routeSends, 1, 'changed route cannot receive a retry');
console.log('PASS source changes block physical retry before dispatch');

// Audience admission cannot be continued or retried, even with spare capacity.
settingsStore.update('utility', { provider: 'profile', profileId: 'protected', presetMode: 'full-profile', instructMode: 'on', samplerMode: 'profile' });
routeSource = 'nanogpt';
const savedUtility = structuredClone(settingsStore.get('utility'));
for (const outcome of ['empty', 'reasoning', 'retryable', 'cancel', 'success']) {
  for (const reserved of [false, true]) {
    const controller = new AbortController();
    const audienceBudget = createTurnAttemptBudget({ limit: 10, signal: controller.signal });
    const reservation = reserved ? audienceBudget.reserve('audience', 1) : null;
    const before = calls.length;
    context.ConnectionManagerRequestService.sendRequest = async (profileId, messages, maxTokens, options, payload) => {
      calls.push({ profileId, messages, maxTokens, options, payload });
      if (outcome === 'retryable') throw Object.assign(new Error('temporary service failure'), { status: 503 });
      if (outcome === 'cancel') controller.abort();
      return { choices: [{ message: outcome === 'success' ? { content: '{"ok":true}' } : { content: '', ...(outcome === 'reasoning' ? { reasoning_content: 'thinking' } : {}) }, finish_reason: 'stop' }] };
    };
    const pending = client.generate('characterAudienceReviewer', isolated, { signal: controller.signal, attemptBudget: audienceBudget, attemptReservation: reservation, allowVisibleOutputRetry: true, maxAttempts: 10 });
    if (outcome === 'success') {
      const result = await pending;
      assert.equal(result.providerKind, 'utility');
      assert.equal(result.retriedForVisibleOutput, false);
    } else await assert.rejects(pending, error => {
      assert.notEqual(error.code, 'DIRECTIVE_TURN_ATTEMPT_LIMIT', 'single-send policy must preserve the original failure');
      if (outcome === 'cancel') assert.equal(error.code, 'DIRECTIVE_GENERATION_ABORTED');
      return true;
    });
    assert.equal(calls.length - before, 1, `${outcome}: exactly one physical send`);
    assert.equal(audienceBudget.used, 1);
    assert.equal(calls.at(-1).options.includePreset, false);
    assert.equal(calls.at(-1).options.includeInstruct, false);
    assert.deepEqual(calls.at(-1).messages, isolated.messages);
    assert.ok(!JSON.stringify(calls.at(-1)).includes('SECRET_'));
    audienceBudget.dispose();
  }
}
assert.deepEqual(settingsStore.get('utility'), savedUtility, 'isolation must not rewrite saved profiles');
await assert.rejects(fallback.generate('characterAudienceReviewer', isolated), { code: 'DIRECTIVE_CONTEXT_ISOLATION' });
await assert.rejects(client.generate('characterAudienceReviewer', isolated, { providerKind: 'reasoning', attemptBudget: createTurnAttemptBudget() }), { code: 'DIRECTIVE_CONTEXT_ISOLATION' });
console.log('PASS audience review is isolated Utility with one physical send across failure, cancellation and caller retry overrides');
