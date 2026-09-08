import assert from 'node:assert/strict';

import {
  createSillyTavernGenerationClient,
  isDirectiveOwnedHostGeneration,
} from '../../src/hosts/sillytavern/generation-client.mjs';

const rawCalls = [];
const rawClient = createSillyTavernGenerationClient({
  contextFactory: () => ({
    async generateRaw(request) {
      rawCalls.push(request);
      return {
        text: `raw:${request.prompt}`
      };
    }
  })
});

const narration = await rawClient.generate('narration', {
  prompt: 'Narrate the committed packet.'
});
assert.equal(narration.providerId, 'sillytavern-current-provider');
assert.equal(narration.text, 'raw:Narrate the committed packet.');
assert.deepEqual(rawCalls, [{
  prompt: 'Narrate the committed packet.',
  responseLength: null,
  jsonSchema: null
}]);

const utility = await rawClient.generate('utilityJson', {
  messages: [
    {
      role: 'system',
      content: 'Return JSON.'
    },
    {
      role: 'user',
      content: 'Summarize visible continuity.'
    }
  ]
});
assert.equal(utility.providerId, 'sillytavern-current-provider');
assert.equal(utility.roleId, 'utilityJson');
assert.match(rawCalls[1].prompt, /system: Return JSON/);
assert.match(rawCalls[1].prompt, /user: Summarize visible continuity/);

const settlement = await rawClient.generate('acceptedPairMissionEvidence', {
  messages: [
    {
      role: 'system',
      content: 'Return exact accepted-pair settlement JSON.'
    },
    {
      role: 'user',
      content: 'Interpret the accepted pair.'
    }
  ],
  parameters: {
    max_tokens: 220
  },
  modelPreferences: {
    cost: 'low',
    latency: 'fast',
    capability: 'utility'
  }
});
assert.equal(settlement.providerId, 'sillytavern-current-provider');
assert.equal(settlement.roleId, 'acceptedPairMissionEvidence');
assert.match(rawCalls[2].prompt, /Return exact accepted-pair settlement JSON/);
assert.match(rawCalls[2].prompt, /Interpret the accepted pair/);
assert.equal(rawCalls[2].responseLength, 220);

const rawSignalController = new AbortController();
await rawClient.generate('utilityJson', {
  prompt: 'Cancelable raw request.',
  signal: rawSignalController.signal
});
assert.equal(rawCalls[3].signal, rawSignalController.signal);

const roleProvider = rawClient.role('narration');
const roleResult = await roleProvider.generateNarration({
  prompt: 'Role provider request.'
});
assert.equal(roleProvider.id, 'sillytavern-role:narration');
assert.equal(roleResult.text, 'raw:Role provider request.');

const batch = await rawClient.batch([
  {
    roleId: 'acceptedPairMissionEvidence',
    prompt: 'Interpret mission evidence and elapsed time.'
  },
  {
    roleId: 'characterCreatorSectionDraft',
    prompt: 'Draft the character section.'
  }
], {
  concurrent: true
});
assert.equal(batch[0].roleId, 'acceptedPairMissionEvidence');
assert.equal(batch[0].text, 'raw:Interpret mission evidence and elapsed time.');
assert.equal(batch[1].roleId, 'characterCreatorSectionDraft');
assert.equal(batch[1].text, 'raw:Draft the character section.');

let textRequest = null;
const textClient = createSillyTavernGenerationClient({
  contextFactory: () => ({
    async generateText(request) {
      textRequest = request;
      return 'text fallback';
    }
  })
});
const textResult = await textClient.generate('characterCreatorSectionDraft', {
  prompt: 'Advise only.',
  source: {
    turnId: 'turn-1'
  }
});
assert.equal(textResult.text, 'text fallback');
assert.equal(textRequest.prompt, 'Advise only.');
assert.deepEqual(textRequest.source, {
  turnId: 'turn-1'
});

const providerClientCalls = [];
const routedClient = createSillyTavernGenerationClient({
  providerClient: {
    async generate(roleId, request, options) {
      providerClientCalls.push({ roleId, request, options });
      return { text: 'routed repair', providerId: 'fake-provider-client' };
    }
  }
});
const routedRepair = await routedClient.generate('characterCreatorSectionDraft', {
  prompt: 'Repair malformed JSON.'
}, {
  providerKind: 'utility',
  timeoutMs: 30000
});
assert.equal(routedRepair.text, 'routed repair');
assert.deepEqual(providerClientCalls[0].options, {
  providerKind: 'utility',
  timeoutMs: 30000
});
assert.equal(isDirectiveOwnedHostGeneration(), false, 'direct provider fetches do not suppress host narration events');

const attemptNumbers = [];
let visibleOutputCall = 0;
const retryingRawClient = createSillyTavernGenerationClient({
  contextFactory: () => ({
    async generateRaw() {
      visibleOutputCall += 1;
      return visibleOutputCall === 1 ? '<think>private reasoning</think>' : 'visible answer';
    }
  })
});
const retried = await retryingRawClient.generate('utilityJson', { prompt: 'Return visible text.' }, {
  onAttempt: (attempt) => attemptNumbers.push(attempt)
});
assert.equal(retried.text, 'visible answer');
assert.deepEqual(attemptNumbers, [1, 2], 'only actual transport attempts are reported');

const quietAttemptNumbers = [];
let quietCallCount = 0;
const quietFallbackClient = createSillyTavernGenerationClient({
  contextFactory: () => ({
    async generateQuietPrompt(input) {
      quietCallCount += 1;
      if (typeof input === 'object') throw new Error('legacy positional signature');
      return 'quiet fallback answer';
    }
  })
});
await quietFallbackClient.generate('utilityJson', { prompt: 'Use quiet fallback.' }, {
  onAttempt: (attempt) => quietAttemptNumbers.push(attempt),
});
assert.equal(quietCallCount, 2);
assert.deepEqual(quietAttemptNumbers, [1, 2], 'each quiet-prompt signature invocation is an observed attempt');

const nestedAttemptNumbers = [];
let nestedProviderCallCount = 0;
const nestedRetryClient = createSillyTavernGenerationClient({
  providerClient: {
    async generate(_roleId, _request, options) {
      nestedProviderCallCount += 1;
      options.onAttempt(1);
      return nestedProviderCallCount === 1
        ? { text: '<analysis>private reasoning</analysis>' }
        : { text: 'nested visible answer' };
    }
  }
});
await nestedRetryClient.generate('utilityJson', { prompt: 'Aggregate nested attempts.' }, {
  onAttempt: (attempt) => nestedAttemptNumbers.push(attempt),
});
assert.deepEqual(nestedAttemptNumbers, [1, 2], 'nested provider counters aggregate monotonically across outer retries');

let finishHeldHostCall;
let hostCallStarted;
const heldHostCall = new Promise((resolve) => { hostCallStarted = resolve; });
const hostOwnedClient = createSillyTavernGenerationClient({
  contextFactory: () => ({
    generateRaw() {
      hostCallStarted();
      return new Promise((resolve) => { finishHeldHostCall = resolve; });
    }
  })
});
const hostOwnedPending = hostOwnedClient.generate('utilityJson', { prompt: 'Hold host generation.' });
await heldHostCall;
assert.equal(isDirectiveOwnedHostGeneration(), true, 'host fallback generation suppresses its own stream/end events');
finishHeldHostCall('host answer');
await hostOwnedPending;
assert.equal(isDirectiveOwnedHostGeneration(), false, 'host generation ownership always unwinds');

const missingContextClient = createSillyTavernGenerationClient({
  contextFactory: () => null
});
await assert.rejects(
  () => missingContextClient.generate('utilityJson', {}),
  /context is not available/
);

const unsupportedClient = createSillyTavernGenerationClient({
  contextFactory: () => ({})
});
const unsupportedAttempts = [];
await assert.rejects(
  () => unsupportedClient.generate('narration', {}, { onAttempt: (attempt) => unsupportedAttempts.push(attempt) }),
  /does not expose a supported generation method/
);
assert.deepEqual(unsupportedAttempts, [], 'no attempt is reported when no transport method exists');

console.log('SillyTavern generation client tests passed.');
