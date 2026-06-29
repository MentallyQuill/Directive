import assert from 'node:assert/strict';

import {
  createSillyTavernPromptAdapter
} from '../../src/hosts/sillytavern/prompt-adapter.mjs';

const promptCalls = [];
const promptMap = new Map([
  ['summaryception', 'external-summaryception-block'],
  ['3_vectfox', 'external-vectfox-block'],
  ['3_vectfox_summarizer', 'external-vectfox-summary-block'],
  ['3_vectfox_eventbase', 'external-vectfox-eventbase-block'],
  ['worldInfoBefore', 'external-world-info-before'],
  ['worldInfoAfter', 'external-world-info-after']
]);
const externalPromptKeys = new Set([
  'summaryception',
  '3_vectfox',
  '3_vectfox_summarizer',
  '3_vectfox_eventbase',
  'worldInfoBefore',
  'worldInfoAfter'
]);
const context = {
  chatId: 'chat-directive',
  setExtensionPrompt(key, text, ...args) {
    promptMap.set(key, text);
    promptCalls.push([key, text, ...args]);
  },
  extension_prompt_types: {
    BEFORE_PROMPT: 0,
    IN_CHAT: 1,
    IN_PROMPT: 2
  },
  extension_prompt_roles: {
    SYSTEM: 0,
    USER: 1,
    ASSISTANT: 2
  }
};

const adapter = createSillyTavernPromptAdapter({
  contextFactory: () => context
});
const externalSnapshot = Object.fromEntries([...promptMap.entries()].filter(([key]) => externalPromptKeys.has(key)));
const binding = {
  chatId: 'chat-directive',
  campaignId: 'campaign-ashes',
  saveId: 'save-ashes'
};
const packet = {
  kind: 'directive.playerSafePromptContext',
  revision: 1,
  hash: 'prompt-packet-hash',
  blocks: [
    {
      id: 'contract',
      promptKey: 'directive.contract',
      title: 'Directive Contract',
      text: 'Directive controls only directive.* prompt keys.',
      placement: 'inPrompt',
      depth: 0,
      role: 'system'
    },
    {
      id: 'scene-active',
      promptKey: 'directive.scene.active',
      title: 'Active Scene',
      text: 'The Ashes scene remains player-safe.',
      placement: 'inChat',
      depth: 3,
      role: 'system'
    }
  ]
};

await adapter.install({ binding, packet });
await adapter.rebuild({ binding, packet: { ...packet, revision: 2 } });
await adapter.syncForChat({ chatId: 'other-chat' });
await adapter.clear({ reason: 'compatibility-test' });

assert.equal(
  promptCalls.some(([key]) => externalPromptKeys.has(key)),
  false,
  'Directive prompt adapter must never clear or overwrite known external prompt keys.'
);
const clearCalls = promptCalls.filter(([, text]) => text === '');
assert.equal(clearCalls.length > 0, true);
for (const [key] of clearCalls) {
  assert.match(key, /^directive\./, `Prompt clear should be scoped to Directive-owned keys, got ${key}`);
}
const writeCalls = promptCalls.filter(([, text]) => text !== '');
assert.equal(writeCalls.length > 0, true);
for (const [key] of writeCalls) {
  assert.match(key, /^directive\./, `Prompt write should be scoped to Directive-owned keys, got ${key}`);
}
assert.deepEqual(
  Object.fromEntries([...promptMap.entries()].filter(([key]) => externalPromptKeys.has(key))),
  externalSnapshot,
  'Directive prompt lifecycle must preserve existing external prompt values.'
);

promptCalls.length = 0;
await adapter.install({
  binding,
  packet: {
    ...packet,
    revision: 3,
    blocks: [
      {
        id: 'summaryception',
        promptKey: 'summaryception',
        title: 'Non-Directive Prompt Key Attempt',
        text: 'This must be rewritten into a Directive-owned key.',
        placement: 'inPrompt',
        depth: 0,
        role: 'system'
      }
    ]
  }
});
assert.equal(
  promptCalls.some(([key]) => key === 'summaryception'),
  false,
  'Non-Directive packet promptKey must not be called directly.'
);
assert.equal(
  promptCalls.some(([key, text]) => key === 'directive.campaign.summaryception' && text === 'This must be rewritten into a Directive-owned key.'),
  true,
  'Non-Directive packet promptKey should be scoped to a Directive-owned derived key.'
);
assert.equal(promptMap.get('summaryception'), externalSnapshot.summaryception);

console.log('Host prompt key coexistence tests passed.');
