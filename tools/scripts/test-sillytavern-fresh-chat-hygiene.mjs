import assert from 'node:assert/strict';

import {
  __sillyTavernChatAdapterTestHooks,
  createSillyTavernChatAdapter
} from '../../src/hosts/sillytavern/chat-adapter.mjs';

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

const missingSaveMetadata = {
  note_prompt: '(Inherited note with no persistence API.)',
  note_interval: 3,
  note_position: 2,
  note_depth: 1,
  note_role: 1
};
await assert.rejects(
  clearFreshDirectiveChatOpeningMessages({
    chat: [],
    chatMetadata: missingSaveMetadata,
    chat_metadata: missingSaveMetadata
  }),
  (error) => (
    error?.code === 'DIRECTIVE_FRESH_CHAT_PROMPT_HYGIENE_FAILED'
    && error?.retryable === true
    && /persistence API is unavailable/.test(error.message)
  )
);

let createdChatId = 'previous-chat';
let createdChat = [{ id: 'previous-message', is_user: true, mes: 'Existing play.' }];
let createdMetadata = { unrelated: { previous: true } };
const createdCharacters = [];
const creationContext = {
  characters: createdCharacters,
  characterId: null,
  name2: null,
  get chat() { return createdChat; },
  get chatId() { return createdChatId; },
  get chatMetadata() { return createdMetadata; },
  get chat_metadata() { return createdMetadata; },
  set chatMetadata(value) { createdMetadata = value; },
  set chat_metadata(value) { createdMetadata = value; },
  async createCharacterCard(payload) {
    createdCharacters.push({ name: payload.ch_name, avatar: 'fresh-directive.png' });
    return { id: '0', name: payload.ch_name, avatar: 'fresh-directive.png' };
  },
  async selectCharacterById(id) {
    this.characterId = String(id);
    this.name2 = createdCharacters[id].name;
  },
  async createNewChat() {
    createdChatId = 'failed-fresh-chat';
    createdChat = [];
    createdMetadata = {
      note_prompt: '(Inherited unrelated note.)',
      note_interval: 5,
      note_position: 2,
      note_depth: 1,
      note_role: 2
    };
    return { chatId: createdChatId };
  },
  async saveChat() {
    throw new Error('fresh chat header write failed');
  }
};
const creationAdapter = createSillyTavernChatAdapter({
  contextFactory: () => creationContext,
  now: () => '2026-08-10T20:00:00.000Z'
});
await assert.rejects(
  creationAdapter.createOrBindCampaignChat({
    campaignId: 'campaign-failed-hygiene',
    saveId: 'save-failed-hygiene',
    name: 'Ashes of Peace - Failed Hygiene',
    createNew: true
  }),
  (error) => (
    error?.code === 'DIRECTIVE_FRESH_CHAT_PROMPT_HYGIENE_FAILED'
    && error?.createdBinding?.chatId === 'failed-fresh-chat'
    && error?.createdBinding?.createdByDirective === true
    && error?.createdBinding?.entityType === 'character'
    && error?.createdBinding?.entityId === '0'
  )
);

console.log('SillyTavern fresh-chat prompt hygiene tests passed.');
