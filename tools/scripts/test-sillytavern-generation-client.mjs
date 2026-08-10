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
    roleId: 'timeAdvanceAdjudicator',
    prompt: 'Adjudicate elapsed time.'
  },
  {
    roleId: 'characterCreatorSectionDraft',
    prompt: 'Draft the character section.'
  }
], {
  concurrent: true
});
assert.equal(batch[0].roleId, 'timeAdvanceAdjudicator');
assert.equal(batch[0].text, 'raw:Adjudicate elapsed time.');
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
await assert.rejects(
  () => unsupportedClient.generate('narration', {}),
  /does not expose a supported generation method/
);

console.log('SillyTavern generation client tests passed.');
