import assert from 'node:assert/strict';
import {
  DIRECTIVE_V1_PROMPT_KEY,
  createSillyTavernPromptAdapter
} from '../../src/hosts/sillytavern/prompt-adapter.mjs';

const calls = [];
const hostPromptRegistry = new Map([
  ['vectfox.context', 'VECTFOX_CONTEXT_CANARY'],
  ['summaryception.summary', 'SUMMARYCEPTION_CONTEXT_CANARY'],
  ['memory-books.entries', 'MEMORY_BOOKS_CONTEXT_CANARY']
]);
const context = {
  chatId: 'ashes-chat',
  extension_prompt_types: { IN_CHAT: 1 },
  extension_prompt_roles: { SYSTEM: 0 },
  setExtensionPrompt(...args) {
    calls.push(args);
    const [key, text] = args;
    if (text) hostPromptRegistry.set(key, text);
    else hostPromptRegistry.delete(key);
  }
};
const adapter = createSillyTavernPromptAdapter({ contextFactory: () => context });
await adapter.install({
  binding: { chatId: 'ashes-chat' },
  packet: { revision: 3, text: 'Exact V1 prompt' }
});
assert.deepEqual(calls[0].slice(0, 2), [DIRECTIVE_V1_PROMPT_KEY, 'Exact V1 prompt']);
assert.deepEqual(calls[0].slice(2), [1, 0, false, 0]);
assert.deepEqual(Object.fromEntries(hostPromptRegistry), {
  'vectfox.context': 'VECTFOX_CONTEXT_CANARY',
  'summaryception.summary': 'SUMMARYCEPTION_CONTEXT_CANARY',
  'memory-books.entries': 'MEMORY_BOOKS_CONTEXT_CANARY',
  [DIRECTIVE_V1_PROMPT_KEY]: 'Exact V1 prompt'
});
assert.equal(adapter.inspect({ includeText: true }).text, 'Exact V1 prompt');
await adapter.syncForChat({ chatId: 'other-chat' });
assert.deepEqual(calls.at(-1).slice(0, 2), [DIRECTIVE_V1_PROMPT_KEY, '']);
assert.deepEqual(Object.fromEntries(hostPromptRegistry), {
  'vectfox.context': 'VECTFOX_CONTEXT_CANARY',
  'summaryception.summary': 'SUMMARYCEPTION_CONTEXT_CANARY',
  'memory-books.entries': 'MEMORY_BOOKS_CONTEXT_CANARY'
});
const clearCount = calls.length;
await adapter.syncForChat({ chatId: 'other-chat' });
assert.equal(calls.length, clearCount + 1, 'every unbound sync must clear a potentially stale host prompt');
assert.deepEqual(calls.at(-1).slice(0, 2), [DIRECTIVE_V1_PROMPT_KEY, '']);
context.chatId = 'other-chat';
await assert.rejects(
  adapter.install({ binding: { chatId: 'ashes-chat' }, packet: { text: 'wrong chat' } }),
  (error) => error?.code === 'DIRECTIVE_PROMPT_CHAT_MISMATCH'
);

console.log('PASS V1 prompt adapter');
