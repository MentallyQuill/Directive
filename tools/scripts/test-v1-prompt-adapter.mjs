import assert from 'node:assert/strict';
import {
  DIRECTIVE_V1_PROMPT_KEY,
  createSillyTavernPromptAdapter
} from '../../src/hosts/sillytavern/prompt-adapter.mjs';

const calls = [];
const context = {
  chatId: 'ashes-chat',
  extension_prompt_types: { IN_CHAT: 1 },
  extension_prompt_roles: { SYSTEM: 0 },
  setExtensionPrompt(...args) { calls.push(args); }
};
const adapter = createSillyTavernPromptAdapter({ contextFactory: () => context });
await adapter.install({
  binding: { chatId: 'ashes-chat' },
  packet: { revision: 3, text: 'Exact V1 prompt' }
});
assert.deepEqual(calls[0].slice(0, 2), [DIRECTIVE_V1_PROMPT_KEY, 'Exact V1 prompt']);
assert.equal(adapter.inspect({ includeText: true }).text, 'Exact V1 prompt');
await adapter.syncForChat({ chatId: 'other-chat' });
assert.deepEqual(calls.at(-1).slice(0, 2), [DIRECTIVE_V1_PROMPT_KEY, '']);
context.chatId = 'other-chat';
await assert.rejects(
  adapter.install({ binding: { chatId: 'ashes-chat' }, packet: { text: 'wrong chat' } }),
  (error) => error?.code === 'DIRECTIVE_PROMPT_CHAT_MISMATCH'
);

console.log('PASS V1 prompt adapter');
