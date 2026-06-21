import assert from 'node:assert/strict';

import { createSillyTavernGenerationClient } from '../../src/hosts/sillytavern/generation-client.mjs';

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

const commandLogSummary = await rawClient.generate('commandLogSummarizer', {
  messages: [
    {
      role: 'system',
      content: 'Return compact Command Log JSON.'
    },
    {
      role: 'user',
      content: 'Summarize a committed outcome.'
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
assert.equal(commandLogSummary.providerId, 'sillytavern-current-provider');
assert.equal(commandLogSummary.roleId, 'commandLogSummarizer');
assert.match(rawCalls[2].prompt, /Return compact Command Log JSON/);
assert.match(rawCalls[2].prompt, /Summarize a committed outcome/);
assert.equal(rawCalls[2].responseLength, 220);

const roleProvider = rawClient.role('narration');
const roleResult = await roleProvider.generateNarration({
  prompt: 'Role provider request.'
});
assert.equal(roleProvider.id, 'sillytavern-role:narration');
assert.equal(roleResult.text, 'raw:Role provider request.');

let textRequest = null;
const textClient = createSillyTavernGenerationClient({
  contextFactory: () => ({
    async generateText(request) {
      textRequest = request;
      return 'text fallback';
    }
  })
});
const textResult = await textClient.generate('missionDirectorAdvisor', {
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

const missingContextClient = createSillyTavernGenerationClient({
  contextFactory: () => null
});
await assert.rejects(
  () => missingContextClient.generate('continuityTracker', {}),
  /context is not available/
);

const unsupportedClient = createSillyTavernGenerationClient({
  contextFactory: () => ({})
});
await assert.rejects(
  () => unsupportedClient.generate('shipDirector', {}),
  /does not expose a supported generation method/
);

console.log('SillyTavern generation client tests passed.');
