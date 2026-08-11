import assert from 'node:assert/strict';

import { __sillyTavernChatAdapterTestHooks } from '../../src/hosts/sillytavern/chat-adapter.mjs';

const { clearFreshDirectiveChatOpeningMessages } = __sillyTavernChatAdapterTestHooks;

const metadata = {
  note_prompt: '(Hermione speaks like she does in book six.)',
  note_interval: 7,
  note_position: 2,
  note_depth: 1,
  note_role: 2,
  variables: { directive_tense: 'past tense' },
  unrelated: { preserve: true }
};
let saveCount = 0;
const freshContext = {
  chat: [{ id: 'host-greeting', is_user: false, mes: 'Hello.' }],
  chatMetadata: metadata,
  chat_metadata: metadata,
  async saveChat() {
    saveCount += 1;
  }
};

const result = await clearFreshDirectiveChatOpeningMessages(freshContext);
assert.deepEqual(freshContext.chat, []);
assert.deepEqual(
  {
    note_prompt: metadata.note_prompt,
    note_interval: metadata.note_interval,
    note_position: metadata.note_position,
    note_depth: metadata.note_depth,
    note_role: metadata.note_role
  },
  {
    note_prompt: '',
    note_interval: 1,
    note_position: 1,
    note_depth: 4,
    note_role: 0
  }
);
assert.deepEqual(metadata.variables, { directive_tense: 'past tense' });
assert.deepEqual(metadata.unrelated, { preserve: true });
assert.equal(saveCount, 1);
assert.equal(result.removedMessageCount, 1);
assert.equal(result.hadInheritedAuthorNote, true);
assert.equal(result.sanitizedAuthorNote, true);

const failingMetadata = {
  note_prompt: '(Inherited unrelated note.)',
  note_interval: 9,
  note_position: 2,
  note_depth: 2,
  note_role: 1
};
const failingContext = {
  chat: [],
  chatMetadata: failingMetadata,
  chat_metadata: failingMetadata,
  async saveChat() {
    throw new Error('disk unavailable');
  }
};
await assert.rejects(
  clearFreshDirectiveChatOpeningMessages(failingContext),
  (error) => (
    error?.code === 'DIRECTIVE_FRESH_CHAT_PROMPT_HYGIENE_FAILED'
    && error?.retryable === true
    && /Author's Note isolation/.test(error.message)
    && error?.cause?.message === 'disk unavailable'
  )
);

console.log('SillyTavern fresh-chat prompt hygiene tests passed.');
