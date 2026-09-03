import assert from 'node:assert/strict';

import {
  __sillyTavernChatAdapterTestHooks,
  createSillyTavernChatAdapter
} from '../../src/hosts/sillytavern/chat-adapter.mjs';

const {
  clearFreshDirectiveChatOpeningMessages,
  tryCreateChat
} = __sillyTavernChatAdapterTestHooks;

let staleSnapshotCreateCalls = 0;
let liveChatId = 'previous-chat';
const staleSnapshotCreation = await tryCreateChat({
  chatId: 'previous-chat',
  getCurrentChatId() {
    return liveChatId;
  },
  async createNewChat() {
    staleSnapshotCreateCalls += 1;
    liveChatId = 'fresh-live-chat';
  }
}, 'Fresh live chat');
assert.equal(staleSnapshotCreation.created, true);
assert.equal(staleSnapshotCreation.chatId, 'fresh-live-chat');
assert.equal(staleSnapshotCreateCalls, 1, 'a successful host side effect must not be repeated through fallback signatures');

let circularChatCreateCalls = 0;
let circularChatId = 'previous-chat';
const circularChatCreation = await tryCreateChat({
  getCurrentChatId() {
    return circularChatId;
  },
  async createNewChat() {
    circularChatCreateCalls += 1;
    circularChatId = 'circular-result-chat';
    const result = { chatId: circularChatId };
    result.circular = result;
    return result;
  }
}, 'Circular result chat');
assert.equal(circularChatCreation.created, true);
assert.equal(circularChatCreation.chatId, 'circular-result-chat');
assert.equal(circularChatCreateCalls, 1, 'serializing an acknowledged chat result must not repeat the irreversible host call');

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

let bootstrapChatId = 'previous-chat';
let bootstrapChat = [{ id: 'previous-message', is_user: true, mes: 'Existing play.' }];
let bootstrapMetadata = { note_prompt: 'Previous chat note.' };
let redundantCreateNewChatCalls = 0;
const bootstrapCharacters = [];
const bootstrapContext = {
  characters: bootstrapCharacters,
  characterId: null,
  name2: null,
  chatId: 'previous-chat',
  getCurrentChatId() {
    return bootstrapChatId;
  },
  get chat() {
    return bootstrapChat;
  },
  get chatMetadata() {
    return bootstrapMetadata;
  },
  get chat_metadata() {
    return bootstrapMetadata;
  },
  set chatMetadata(value) {
    bootstrapMetadata = value;
  },
  set chat_metadata(value) {
    bootstrapMetadata = value;
  },
  async createCharacterCard(payload) {
    bootstrapCharacters.push({ name: payload.ch_name, avatar: 'bootstrap-chat.png' });
    return { id: '0', name: payload.ch_name, avatar: 'bootstrap-chat.png' };
  },
  async selectCharacterById(id) {
    this.characterId = String(id);
    this.name2 = bootstrapCharacters[id].name;
    bootstrapChatId = 'host-created-bootstrap-chat';
    bootstrapChat = [];
    bootstrapMetadata = {};
  },
  async createNewChat() {
    redundantCreateNewChatCalls += 1;
    bootstrapChatId = 'redundant-second-chat';
  },
  async saveChat() {}
};
const bootstrapAdapter = createSillyTavernChatAdapter({
  contextFactory: () => bootstrapContext,
  now: () => '2026-09-03T22:00:00.000Z'
});
const bootstrapBinding = await bootstrapAdapter.createOrBindCampaignChat({
  campaignId: 'campaign-bootstrap-chat',
  saveId: 'save-bootstrap-chat',
  name: 'Ashes of Peace - Bootstrap Chat',
  createNew: true
});
assert.equal(bootstrapBinding.chatId, 'host-created-bootstrap-chat');
assert.equal(bootstrapBinding.creationMethod, 'character-selection');
assert.equal(redundantCreateNewChatCalls, 0, 'a fresh chat created while selecting the new character must be reused, not orphaned');

let selectionOnlyChatId = 'previous-chat';
let selectionOnlyChat = [{ id: 'previous-message', is_user: true, mes: 'Existing play.' }];
let selectionOnlyMetadata = { note_prompt: 'Previous chat note.' };
const selectionOnlyCharacters = [];
const selectionOnlyContext = {
  characters: selectionOnlyCharacters,
  characterId: null,
  name2: null,
  getCurrentChatId() {
    return selectionOnlyChatId;
  },
  get chat() {
    return selectionOnlyChat;
  },
  get chatMetadata() {
    return selectionOnlyMetadata;
  },
  get chat_metadata() {
    return selectionOnlyMetadata;
  },
  set chatMetadata(value) {
    selectionOnlyMetadata = value;
  },
  set chat_metadata(value) {
    selectionOnlyMetadata = value;
  },
  async createCharacterCard(payload) {
    selectionOnlyCharacters.push({ name: payload.ch_name, avatar: 'selection-only.png' });
    return { id: '0', name: payload.ch_name, avatar: 'selection-only.png' };
  },
  async selectCharacterById(id) {
    this.characterId = String(id);
    this.name2 = selectionOnlyCharacters[id].name;
    selectionOnlyChatId = 'selection-only-bootstrap-chat';
    selectionOnlyChat = [];
    selectionOnlyMetadata = {};
  }
};
const selectionOnlyAdapter = createSillyTavernChatAdapter({
  contextFactory: () => selectionOnlyContext,
  now: () => '2026-09-03T22:00:00.000Z'
});
const selectionOnlyBinding = await selectionOnlyAdapter.createOrBindCampaignChat({
  campaignId: 'campaign-selection-only-chat',
  saveId: 'save-selection-only-chat',
  name: 'Ashes of Peace - Selection Only Chat',
  createNew: true
});
assert.equal(selectionOnlyBinding.chatId, 'selection-only-bootstrap-chat');
assert.equal(selectionOnlyBinding.creationMethod, 'character-selection');
assert.equal(selectionOnlyCharacters.length, 1, 'character selection may be the only available fresh-chat creation route');

const sameNameBootstrapCharacters = [{ name: 'Previously Selected', avatar: 'previous.png' }];
let sameNameBootstrapChat = [{ id: 'previous-message', is_user: true, mes: 'Existing play.' }];
let sameNameBootstrapMetadata = { note_prompt: 'Previous note.' };
const sameNameBootstrapContext = {
  characters: sameNameBootstrapCharacters,
  characterId: '0',
  name2: 'Previously Selected',
  getCurrentChatId() {
    return 'shared-character-scoped-chat';
  },
  get chat() {
    return sameNameBootstrapChat;
  },
  get chatMetadata() {
    return sameNameBootstrapMetadata;
  },
  get chat_metadata() {
    return sameNameBootstrapMetadata;
  },
  set chatMetadata(value) {
    sameNameBootstrapMetadata = value;
  },
  set chat_metadata(value) {
    sameNameBootstrapMetadata = value;
  },
  async createCharacterCard(payload) {
    sameNameBootstrapCharacters.push({ name: payload.ch_name, avatar: 'same-name-bootstrap.png' });
    return { id: '1', name: payload.ch_name, avatar: 'same-name-bootstrap.png' };
  },
  async selectCharacterById(id) {
    this.characterId = String(id);
    this.name2 = sameNameBootstrapCharacters[id].name;
    sameNameBootstrapChat = [];
    sameNameBootstrapMetadata = {};
  }
};
const sameNameBootstrapAdapter = createSillyTavernChatAdapter({
  contextFactory: () => sameNameBootstrapContext,
  now: () => '2026-09-03T22:00:10.000Z'
});
const sameNameBootstrapBinding = await sameNameBootstrapAdapter.createOrBindCampaignChat({
  campaignId: 'campaign-same-name-bootstrap',
  saveId: 'save-same-name-bootstrap',
  name: 'Ashes of Peace - Same Name Bootstrap',
  createNew: true
});
assert.equal(sameNameBootstrapBinding.chatId, 'shared-character-scoped-chat');
assert.equal(sameNameBootstrapBinding.entityId, '1');
assert.equal(sameNameBootstrapBinding.creationMethod, 'character-selection');

const failedChatCharacters = [];
const failedChatContext = {
  characters: failedChatCharacters,
  characterId: null,
  name2: null,
  chat: [],
  chatId: 'previous-chat',
  getCurrentChatId() {
    return 'previous-chat';
  },
  async createCharacterCard(payload) {
    failedChatCharacters.push({ name: payload.ch_name, avatar: 'failed-chat.png' });
    return { id: '0', name: payload.ch_name, avatar: 'failed-chat.png' };
  },
  async selectCharacterById(id) {
    this.characterId = String(id);
    this.name2 = failedChatCharacters[id].name;
  },
  async createNewChat() {
    throw new Error('host chat creation failed');
  }
};
const failedChatAdapter = createSillyTavernChatAdapter({
  contextFactory: () => failedChatContext,
  now: () => '2026-09-03T22:00:00.000Z'
});
await assert.rejects(
  failedChatAdapter.createOrBindCampaignChat({
    campaignId: 'campaign-failed-chat',
    saveId: 'save-failed-chat',
    name: 'Ashes of Peace - Failed Chat',
    createNew: true
  }),
  (error) => (
    error?.code === 'DIRECTIVE_CHAT_CREATE_FAILED'
    && error?.createdBinding?.createdByDirective === true
    && error?.createdBinding?.entityType === 'character'
    && error?.createdBinding?.entityId === '0'
    && error?.createdBinding?.entityName === 'Ashes of Peace - Failed Chat'
  )
);
assert.equal(failedChatCharacters.length, 1, 'a failed chat creation must expose the one created character for rollback');

const failedSelectionCharacters = [];
let failedSelectionCreateCalls = 0;
const failedSelectionContext = {
  characters: failedSelectionCharacters,
  characterId: null,
  name2: null,
  chat: [],
  chatMetadata: {},
  chat_metadata: {},
  getCurrentChatId() {
    return 'previous-chat';
  },
  async createCharacterCard(payload) {
    failedSelectionCreateCalls += 1;
    failedSelectionCharacters.push({ name: payload.ch_name, avatar: 'failed-selection.png' });
    return { id: '0', name: payload.ch_name, avatar: 'failed-selection.png' };
  },
  async selectCharacterById() {
    throw new Error('host selection failed');
  },
  async createNewChat() {
    throw new Error('must not create a chat without selecting the new character');
  }
};
const failedSelectionAdapter = createSillyTavernChatAdapter({
  contextFactory: () => failedSelectionContext,
  now: () => '2026-09-03T22:00:30.000Z'
});
await assert.rejects(
  failedSelectionAdapter.createOrBindCampaignChat({
    campaignId: 'campaign-failed-selection',
    saveId: 'save-failed-selection',
    name: 'Ashes of Peace - Failed Selection',
    createNew: true
  }),
  (error) => (
    error?.code === 'DIRECTIVE_CHARACTER_SELECT_FAILED'
    && error?.createdBinding?.createdByDirective === true
    && error?.createdBinding?.chatId === null
    && error?.createdBinding?.entityType === 'character'
    && error?.createdBinding?.entityId === '0'
    && error?.createdBinding?.entityName === 'Ashes of Peace - Failed Selection'
  )
);
assert.equal(failedSelectionCreateCalls, 1, 'an acknowledged character creation must never be repeated after selection fails');

const noOpSelectionCharacters = [{ name: 'Previously Selected', avatar: 'previous.png' }];
let noOpSelectionChatId = 'previous-chat';
let noOpSelectionChatCreateCalls = 0;
const noOpSelectionContext = {
  characters: noOpSelectionCharacters,
  characterId: '0',
  name2: 'Previously Selected',
  chat: [],
  chatMetadata: {},
  chat_metadata: {},
  getCurrentChatId() {
    return noOpSelectionChatId;
  },
  async createCharacterCard(payload) {
    noOpSelectionCharacters.push({ name: payload.ch_name, avatar: 'no-op-selection.png' });
    return { id: '1', name: payload.ch_name, avatar: 'no-op-selection.png' };
  },
  async selectCharacterById() {
    // Resolve successfully without changing the selected SillyTavern character.
  },
  async createNewChat() {
    noOpSelectionChatCreateCalls += 1;
    noOpSelectionChatId = 'wrong-character-chat';
  }
};
const noOpSelectionAdapter = createSillyTavernChatAdapter({
  contextFactory: () => noOpSelectionContext,
  now: () => '2026-09-03T22:00:35.000Z'
});
await assert.rejects(
  noOpSelectionAdapter.createOrBindCampaignChat({
    campaignId: 'campaign-no-op-selection',
    saveId: 'save-no-op-selection',
    name: 'Ashes of Peace - No-op Selection',
    createNew: true
  }),
  (error) => (
    error?.code === 'DIRECTIVE_CHARACTER_SELECT_FAILED'
    && error?.createdBinding?.chatId === null
    && error?.createdBinding?.entityId === '1'
  )
);
assert.equal(noOpSelectionChatCreateCalls, 0, 'Directive must verify the new character selection before creating any chat');

let refreshFailureCreateCalls = 0;
const refreshFailureContext = {
  characters: [],
  characterId: null,
  name2: null,
  chat: [],
  chatMetadata: {},
  chat_metadata: {},
  getCurrentChatId() {
    return 'previous-chat';
  },
  async createCharacterCard(payload) {
    refreshFailureCreateCalls += 1;
    return { id: '44', name: payload.ch_name, avatar: 'refresh-failure.png' };
  },
  async getCharacters() {
    throw new Error('host character refresh failed after creation');
  },
  async selectCharacterById() {
    throw new Error('host selection failed');
  },
  async createNewChat() {
    throw new Error('must not create a chat without selecting the new character');
  }
};
const refreshFailureAdapter = createSillyTavernChatAdapter({
  contextFactory: () => refreshFailureContext,
  now: () => '2026-09-03T22:00:45.000Z'
});
await assert.rejects(
  refreshFailureAdapter.createOrBindCampaignChat({
    campaignId: 'campaign-refresh-failure',
    saveId: 'save-refresh-failure',
    name: 'Ashes of Peace - Refresh Failure',
    createNew: true
  }),
  (error) => (
    error?.code === 'DIRECTIVE_CHARACTER_SELECT_FAILED'
    && error?.createdBinding?.entityId === '44'
    && error?.createdBinding?.entityName === 'Ashes of Peace - Refresh Failure'
    && error?.createdBinding?.entityAvatar === 'refresh-failure.png'
  )
);
assert.equal(refreshFailureCreateCalls, 1, 'a refresh failure after acknowledged character creation must not trigger another character creation');

let circularResultCreateCalls = 0;
const circularResultContext = {
  characters: [],
  characterId: null,
  name2: null,
  chat: [],
  chatMetadata: {},
  chat_metadata: {},
  getCurrentChatId() {
    return 'previous-chat';
  },
  async createCharacterCard(payload) {
    circularResultCreateCalls += 1;
    const result = { id: '45', name: payload.ch_name, avatar: 'circular-result.png' };
    result.circular = result;
    return result;
  },
  async selectCharacterById() {
    throw new Error('host selection failed');
  },
  async createNewChat() {
    throw new Error('must not create a chat without selecting the new character');
  }
};
const circularResultAdapter = createSillyTavernChatAdapter({
  contextFactory: () => circularResultContext,
  now: () => '2026-09-03T22:00:47.000Z'
});
await assert.rejects(
  circularResultAdapter.createOrBindCampaignChat({
    campaignId: 'campaign-circular-result',
    saveId: 'save-circular-result',
    name: 'Ashes of Peace - Circular Result',
    createNew: true
  }),
  (error) => (
    error?.code === 'DIRECTIVE_CHARACTER_SELECT_FAILED'
    && error?.createdBinding?.entityId === '45'
    && error?.createdBinding?.entityAvatar === 'circular-result.png'
  )
);
assert.equal(circularResultCreateCalls, 1, 'serializing an acknowledged host result must not trigger another character creation');

let undiscoveredCreateCalls = 0;
const undiscoveredDeletedAvatars = [];
const undiscoveredContext = {
  characters: [],
  characterId: null,
  name2: null,
  chat: [],
  chatMetadata: {},
  chat_metadata: {},
  getCurrentChatId() {
    return 'previous-chat';
  },
  async createCharacterCard(payload) {
    undiscoveredCreateCalls += 1;
    return { name: payload.ch_name, avatar: 'undiscovered-created.png' };
  },
  async getCharacters() {},
  async createNewChat() {
    throw new Error('must not create a chat without discovering and selecting the new character');
  }
};
const undiscoveredAdapter = createSillyTavernChatAdapter({
  contextFactory: () => undiscoveredContext,
  now: () => '2026-09-03T22:00:50.000Z',
  scriptModule: {
    async deleteCharacter(avatar, options) {
      undiscoveredDeletedAvatars.push({ avatar, options });
      return true;
    }
  }
});
let undiscoveredCreationError = null;
try {
  await undiscoveredAdapter.createOrBindCampaignChat({
    campaignId: 'campaign-undiscovered-character',
    saveId: 'save-undiscovered-character',
    name: 'Ashes of Peace - Undiscovered Character',
    createNew: true
  });
} catch (error) {
  undiscoveredCreationError = error;
}
assert.equal(undiscoveredCreationError?.code, 'DIRECTIVE_CHARACTER_SELECT_FAILED');
assert.equal(undiscoveredCreationError?.createdBinding?.entityId, null);
assert.equal(undiscoveredCreationError?.createdBinding?.entityName, 'Ashes of Peace - Undiscovered Character');
assert.equal(undiscoveredCreationError?.createdBinding?.entityAvatar, 'undiscovered-created.png');
assert.equal(undiscoveredCreateCalls, 1, 'an acknowledged but undiscovered character must never be created again under a fallback name');
undiscoveredContext.characters.push({
  name: 'Ashes of Peace - Undiscovered Character',
  avatar: 'undiscovered-created.png',
  creator: 'Directive'
});
const undiscoveredCleanup = await undiscoveredAdapter.deleteCampaignCharacter(undiscoveredCreationError.createdBinding);
assert.equal(undiscoveredCleanup.deleted, true);
assert.deepEqual(undiscoveredDeletedAvatars, [{
  avatar: 'undiscovered-created.png',
  options: { deleteChats: true }
}], 'discovery failure cleanup must delete the one character matching the created name and avatar');

let unreadableFetchCreateCalls = 0;
const unreadableFetchDeletedAvatars = [];
const unreadableFetchContext = {
  characters: [],
  characterId: null,
  name2: null,
  chat: [],
  chatMetadata: {},
  chat_metadata: {},
  getCurrentChatId() {
    return 'previous-chat';
  },
  getRequestHeaders() {
    return { 'Content-Type': 'application/json' };
  },
  async fetch() {
    unreadableFetchCreateCalls += 1;
    return {
      ok: true,
      async text() {
        throw new Error('created response body unreadable');
      }
    };
  },
  async getCharacters() {
    throw new Error('character refresh unavailable');
  },
  async createNewChat() {
    throw new Error('must not create a chat without discovering and selecting the new character');
  }
};
const originalLocation = globalThis.location;
globalThis.location = { origin: 'http://directive.test' };
const unreadableFetchAdapter = createSillyTavernChatAdapter({
  contextFactory: () => unreadableFetchContext,
  now: () => '2026-09-03T22:00:55.000Z',
  scriptModule: {
    async deleteCharacter(avatar, options) {
      unreadableFetchDeletedAvatars.push({ avatar, options });
      return true;
    }
  }
});
let unreadableFetchError = null;
try {
  await unreadableFetchAdapter.createOrBindCampaignChat({
    campaignId: 'campaign-unreadable-fetch',
    saveId: 'save-unreadable-fetch',
    name: 'Ashes of Peace - Unreadable Fetch',
    createNew: true
  });
} catch (error) {
  unreadableFetchError = error;
} finally {
  globalThis.location = originalLocation;
}
assert.equal(unreadableFetchError?.code, 'DIRECTIVE_CHARACTER_SELECT_FAILED');
assert.equal(unreadableFetchError?.createdBinding?.entityId, null);
assert.equal(unreadableFetchError?.createdBinding?.entityAvatar, null);
assert.equal(unreadableFetchCreateCalls, 1, 'an unreadable successful fetch response must not repeat character creation');
unreadableFetchContext.characters.push({
  name: 'Ashes of Peace - Unreadable Fetch',
  avatar: 'unreadable-fetch-created.png',
  creator: 'Directive',
  extensions: JSON.stringify({
    directive: {
      kind: 'campaign-shell',
      campaignId: 'campaign-unreadable-fetch',
      saveId: 'save-unreadable-fetch'
    }
  })
});
const unreadableFetchCleanup = await unreadableFetchAdapter.deleteCampaignCharacter(unreadableFetchError.createdBinding);
assert.equal(unreadableFetchCleanup.deleted, true);
assert.deepEqual(unreadableFetchDeletedAvatars, [{
  avatar: 'unreadable-fetch-created.png',
  options: { deleteChats: true }
}], 'a name-only failure binding must delete only the character carrying its exact Directive campaign marker');

const previousInactiveChat = [{ id: 'existing-assistant', is_user: false, mes: 'Preserve this chat.' }];
const previousInactiveMetadata = { note_prompt: 'Preserve this note.', note_interval: 8 };
const inactiveCharacters = [];
let inactiveSaveCount = 0;
const inactiveCreationContext = {
  characters: inactiveCharacters,
  characterId: null,
  name2: null,
  chatId: 'previous-chat',
  getCurrentChatId() {
    return 'previous-chat';
  },
  chat: previousInactiveChat,
  chatMetadata: previousInactiveMetadata,
  chat_metadata: previousInactiveMetadata,
  async createCharacterCard(payload) {
    inactiveCharacters.push({ name: payload.ch_name, avatar: 'inactive-chat.png' });
    return { id: '0', name: payload.ch_name, avatar: 'inactive-chat.png' };
  },
  async selectCharacterById(id) {
    this.characterId = String(id);
    this.name2 = inactiveCharacters[id].name;
  },
  async createNewChat() {
    return { chatId: 'fresh-but-inactive' };
  },
  async saveChat() {
    inactiveSaveCount += 1;
  }
};
const inactiveCreationAdapter = createSillyTavernChatAdapter({
  contextFactory: () => inactiveCreationContext,
  now: () => '2026-09-03T22:01:00.000Z'
});
await assert.rejects(
  inactiveCreationAdapter.createOrBindCampaignChat({
    campaignId: 'campaign-inactive-chat',
    saveId: 'save-inactive-chat',
    name: 'Ashes of Peace - Inactive Chat',
    createNew: true
  }),
  (error) => (
    error?.code === 'DIRECTIVE_CHAT_BINDING_NOT_ACTIVE'
    && error?.createdBinding?.chatId === 'fresh-but-inactive'
    && error?.createdBinding?.entityId === '0'
  )
);
assert.deepEqual(previousInactiveChat, [{ id: 'existing-assistant', is_user: false, mes: 'Preserve this chat.' }]);
assert.deepEqual(previousInactiveMetadata, { note_prompt: 'Preserve this note.', note_interval: 8 });
assert.equal(inactiveSaveCount, 0, 'Directive must not sanitize or save a chat the host did not activate');

const renameRaceCharacters = [];
const renameRaceFreshChat = [{ id: 'fresh-greeting', is_user: false, mes: 'Fresh greeting.' }];
const renameRaceFreshMetadata = { note_prompt: 'Fresh inherited note.', note_interval: 7 };
const renameRacePreviousChat = [{ id: 'previous-assistant', is_user: false, mes: 'Preserve previous chat byte-for-byte.' }];
const renameRacePreviousMetadata = { note_prompt: 'Preserve previous note.', note_interval: 9 };
let renameRaceChatId = 'previous-chat';
let renameRaceChat = renameRacePreviousChat;
let renameRaceMetadata = renameRacePreviousMetadata;
let renameRaceSaveCount = 0;
const renameRaceContext = {
  characters: renameRaceCharacters,
  characterId: null,
  name2: null,
  getCurrentChatId() {
    return renameRaceChatId;
  },
  get chat() {
    return renameRaceChat;
  },
  get chatMetadata() {
    return renameRaceMetadata;
  },
  get chat_metadata() {
    return renameRaceMetadata;
  },
  set chatMetadata(value) {
    renameRaceMetadata = value;
  },
  set chat_metadata(value) {
    renameRaceMetadata = value;
  },
  async createCharacterCard(payload) {
    renameRaceCharacters.push({ name: payload.ch_name, avatar: 'rename-race.png' });
    return { id: '0', name: payload.ch_name, avatar: 'rename-race.png' };
  },
  async selectCharacterById(id) {
    this.characterId = String(id);
    this.name2 = renameRaceCharacters[id].name;
  },
  async createNewChat() {
    renameRaceChatId = 'rename-race-fresh-chat';
    renameRaceChat = renameRaceFreshChat;
    renameRaceMetadata = renameRaceFreshMetadata;
  },
  async renameChat() {
    renameRaceChatId = 'previous-chat';
    renameRaceChat = renameRacePreviousChat;
    renameRaceMetadata = renameRacePreviousMetadata;
  },
  async saveChat() {
    renameRaceSaveCount += 1;
  }
};
const renameRaceAdapter = createSillyTavernChatAdapter({
  contextFactory: () => renameRaceContext,
  now: () => '2026-09-03T22:01:30.000Z'
});
await assert.rejects(
  renameRaceAdapter.createOrBindCampaignChat({
    campaignId: 'campaign-rename-race',
    saveId: 'save-rename-race',
    name: 'Ashes of Peace - Rename Race',
    createNew: true
  }),
  (error) => (
    error?.code === 'DIRECTIVE_CHAT_BINDING_NOT_ACTIVE'
    && error?.createdBinding?.chatId === 'rename-race-fresh-chat'
    && error?.createdBinding?.entityId === '0'
  )
);
assert.deepEqual(renameRacePreviousChat, [{ id: 'previous-assistant', is_user: false, mes: 'Preserve previous chat byte-for-byte.' }]);
assert.deepEqual(renameRacePreviousMetadata, { note_prompt: 'Preserve previous note.', note_interval: 9 });
assert.equal(renameRaceSaveCount, 0, 'a rename-time chat switch must be detected before fresh-chat hygiene mutates or saves the new active chat');

const lateSwitchCharacters = [];
const lateSwitchFreshChat = [{ id: 'fresh-greeting', is_user: false, mes: 'Fresh greeting.' }];
const lateSwitchFreshMetadata = { note_prompt: 'Fresh inherited note.', note_interval: 7 };
const lateSwitchPreviousChat = [{ id: 'previous-user', is_user: true, mes: 'Preserve existing play.' }];
const lateSwitchPreviousMetadata = { note_prompt: 'Preserve existing note.', note_interval: 11 };
let lateSwitchChatId = 'previous-chat';
let lateSwitchChat = lateSwitchPreviousChat;
let lateSwitchMetadata = lateSwitchPreviousMetadata;
const lateSwitchContext = {
  characters: lateSwitchCharacters,
  characterId: null,
  name2: null,
  getCurrentChatId() {
    return lateSwitchChatId;
  },
  get chat() {
    return lateSwitchChat;
  },
  get chatMetadata() {
    return lateSwitchMetadata;
  },
  get chat_metadata() {
    return lateSwitchMetadata;
  },
  set chatMetadata(value) {
    lateSwitchMetadata = value;
  },
  set chat_metadata(value) {
    lateSwitchMetadata = value;
  },
  async createCharacterCard(payload) {
    lateSwitchCharacters.push({ name: payload.ch_name, avatar: 'late-switch.png' });
    return { id: '0', name: payload.ch_name, avatar: 'late-switch.png' };
  },
  async selectCharacterById(id) {
    this.characterId = String(id);
    this.name2 = lateSwitchCharacters[id].name;
  },
  async createNewChat() {
    lateSwitchChatId = 'late-switch-fresh-chat';
    lateSwitchChat = lateSwitchFreshChat;
    lateSwitchMetadata = lateSwitchFreshMetadata;
  },
  async saveChat() {
    lateSwitchChatId = 'previous-chat';
    lateSwitchChat = lateSwitchPreviousChat;
    lateSwitchMetadata = lateSwitchPreviousMetadata;
  },
  async openChat() {
    // Simulate a host that acknowledges the open request but cannot reactivate the chat.
  }
};
const lateSwitchAdapter = createSillyTavernChatAdapter({
  contextFactory: () => lateSwitchContext,
  now: () => '2026-09-03T22:01:45.000Z'
});
await assert.rejects(
  lateSwitchAdapter.createOrBindCampaignChat({
    campaignId: 'campaign-late-switch',
    saveId: 'save-late-switch',
    name: 'Ashes of Peace - Late Switch',
    createNew: true
  }),
  (error) => (
    error?.code === 'DIRECTIVE_CHAT_BINDING_NOT_ACTIVE'
    && error?.createdBinding?.chatId === 'late-switch-fresh-chat'
    && error?.createdBinding?.entityId === '0'
  )
);
assert.deepEqual(lateSwitchPreviousChat, [{ id: 'previous-user', is_user: true, mes: 'Preserve existing play.' }]);
assert.deepEqual(lateSwitchPreviousMetadata, { note_prompt: 'Preserve existing note.', note_interval: 11 });

const sameIdOpenCharacters = [
  { name: 'Previous Campaign', avatar: 'previous-campaign.png' },
  { name: 'Failed New Campaign', avatar: 'failed-new-campaign.png' }
];
let sameIdOpenSelectionCalls = 0;
const sameIdOpenContext = {
  characters: sameIdOpenCharacters,
  characterId: '1',
  name2: 'Failed New Campaign',
  getCurrentChatId() {
    return 'shared-character-scoped-chat';
  },
  async selectCharacterById(id) {
    sameIdOpenSelectionCalls += 1;
    this.characterId = String(id);
    this.name2 = sameIdOpenCharacters[id].name;
  }
};
const sameIdOpenAdapter = createSillyTavernChatAdapter({ contextFactory: () => sameIdOpenContext });
const sameIdOpened = await sameIdOpenAdapter.open({
  chatId: 'shared-character-scoped-chat',
  entityType: 'character',
  entityId: '0',
  entityName: 'Previous Campaign'
});
assert.equal(sameIdOpened, true);
assert.equal(sameIdOpenSelectionCalls, 1, 'open must restore the requested entity even when its character-scoped chat filename is already current');
assert.equal(sameIdOpenContext.characterId, '0');

const misleadingPrefixCharacters = [
  { name: 'Another Character', avatar: 'another.png' },
  { name: 'Requested Campaign', avatar: 'requested.png' }
];
let misleadingPrefixSelectionCalls = 0;
const misleadingPrefixContext = {
  characters: misleadingPrefixCharacters,
  characterId: '0',
  name2: 'Another Character',
  getCurrentChatId() {
    return 'Another Character - misleading prefix';
  },
  async selectCharacterById(id) {
    misleadingPrefixSelectionCalls += 1;
    this.characterId = String(id);
    this.name2 = misleadingPrefixCharacters[id].name;
  }
};
const misleadingPrefixAdapter = createSillyTavernChatAdapter({ contextFactory: () => misleadingPrefixContext });
const misleadingPrefixOpened = await misleadingPrefixAdapter.open({
  chatId: 'Another Character - misleading prefix',
  entityType: 'character',
  entityId: '1',
  entityName: 'Requested Campaign'
});
assert.equal(misleadingPrefixOpened, true);
assert.equal(misleadingPrefixSelectionCalls, 1, 'an exact supplied entity must override character-name inference from the chat filename');
assert.equal(misleadingPrefixContext.characterId, '1');

const metadataFailureCharacters = [];
let metadataFailureChatId = 'previous-chat';
let metadataFailureChat = [];
let metadataFailureMetadata = {};
const metadataFailureContext = {
  characters: metadataFailureCharacters,
  characterId: null,
  name2: null,
  chatId: 'previous-chat',
  getCurrentChatId() {
    return metadataFailureChatId;
  },
  get chat() {
    return metadataFailureChat;
  },
  get chatMetadata() {
    return metadataFailureMetadata;
  },
  get chat_metadata() {
    return metadataFailureMetadata;
  },
  set chatMetadata(value) {
    metadataFailureMetadata = value;
  },
  set chat_metadata(value) {
    metadataFailureMetadata = value;
  },
  async createCharacterCard(payload) {
    metadataFailureCharacters.push({ name: payload.ch_name, avatar: 'metadata-failure.png' });
    return { id: '0', name: payload.ch_name, avatar: 'metadata-failure.png' };
  },
  async selectCharacterById(id) {
    this.characterId = String(id);
    this.name2 = metadataFailureCharacters[id].name;
  },
  async createNewChat() {
    metadataFailureChatId = 'metadata-failure-chat';
    metadataFailureChat = [];
    metadataFailureMetadata = {};
  },
  async saveChat() {},
  async saveMetadata() {
    throw new Error('binding metadata write failed');
  }
};
const metadataFailureAdapter = createSillyTavernChatAdapter({
  contextFactory: () => metadataFailureContext,
  now: () => '2026-09-03T22:02:00.000Z'
});
await assert.rejects(
  metadataFailureAdapter.createOrBindCampaignChat({
    campaignId: 'campaign-metadata-failure',
    saveId: 'save-metadata-failure',
    name: 'Ashes of Peace - Metadata Failure',
    createNew: true
  }),
  (error) => (
    error?.message === 'binding metadata write failed'
    && error?.createdBinding?.chatId === 'metadata-failure-chat'
    && error?.createdBinding?.entityId === '0'
    && error?.createdBinding?.entityAvatar === 'metadata-failure.png'
    && error?.createdBinding?.createdByDirective === true
  )
);

console.log('SillyTavern fresh-chat prompt hygiene tests passed.');
