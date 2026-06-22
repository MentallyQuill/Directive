import assert from 'node:assert/strict';

import {
  createSillyTavernChatAdapter,
  normalizeSillyTavernMessagePayload
} from '../../src/hosts/sillytavern/chat-adapter.mjs';
import { createSillyTavernPromptAdapter } from '../../src/hosts/sillytavern/prompt-adapter.mjs';

let currentChatId = 'chat-before';
let chat = [];
let metadataSaves = 0;
let chatSaves = 0;
let addedMessages = 0;
const openedCharacterArgs = [];
const context = {
  characterId: 7,
  name2: 'Captain Whitaker',
  chatMetadata: {},
  get chat() { return chat; },
  set chat(value) { chat = value; },
  get chatId() { return currentChatId; },
  getCurrentChatId() { return currentChatId; },
  async createNewChat(options) {
    assert.equal(options.name, 'Directive - Ashes of Peace');
    currentChatId = 'chat-directive';
    chat = [{ id: 'host-greeting', is_user: false, mes: 'Default character greeting that Directive should replace.' }];
    return { chatId: currentChatId };
  },
  async openCharacterChat(...args) {
    openedCharacterArgs.push(args);
    currentChatId = args[0];
  },
  async saveMetadata() { metadataSaves += 1; },
  async saveChat() { chatSaves += 1; },
  async addOneMessage() { addedMessages += 1; }
};

const adapter = createSillyTavernChatAdapter({
  contextFactory: () => context,
  now: () => '2026-06-22T12:00:00.000Z'
});
const binding = await adapter.createOrBindCampaignChat({
  name: 'Directive - Ashes of Peace',
  fallbackName: 'Directive',
  campaignId: 'campaign-st-adapter',
  saveId: 'save-st-adapter',
  createNew: true
});
assert.equal(binding.chatId, 'chat-directive');
assert.equal(binding.createdByDirective, true);
assert.equal(binding.entityType, 'character');
assert.equal(binding.chatName, 'Directive - Ashes of Peace');
assert.equal(binding.freshChatCleanup.status, 'cleared');
assert.equal(binding.freshChatCleanup.removedMessageCount, 1);
assert.equal(chat.length, 0);
assert.equal(context.chatMetadata.directiveCampaignBinding.campaignId, 'campaign-st-adapter');
assert.equal(metadataSaves, 1);

const firstPost = await adapter.postAssistantMessage({
  text: 'Captain Whitaker yields the deck.',
  campaignId: 'campaign-st-adapter',
  responseKind: 'campaignIntro',
  idempotencyKey: 'intro:campaign-st-adapter'
});
const duplicatePost = await adapter.postAssistantMessage({
  text: 'This duplicate must not be appended.',
  campaignId: 'campaign-st-adapter',
  responseKind: 'campaignIntro',
  idempotencyKey: 'intro:campaign-st-adapter'
});
assert.equal(firstPost.posted, true);
assert.equal(duplicatePost.duplicate, true);
assert.equal(chat.length, 1);
assert.equal(addedMessages, 1);
assert.equal(chatSaves, 2);

chat.push({ id: 'player-1', is_user: true, mes: 'Preserve the telemetry and notify the Captain.' });
const latest = adapter.getLatestPlayerMessage();
assert.equal(latest.hostMessageId, 'player-1');
assert.equal(latest.isUser, true);
assert.equal(latest.isDirectiveOwned, false);
assert.equal(normalizeSillyTavernMessagePayload(context, 1).text.includes('telemetry'), true);

currentChatId = 'other-chat';
const opened = await adapter.open({
  chatId: 'chat-directive',
  entityType: 'character',
  entityId: '7'
});
assert.equal(opened, true);
assert.deepEqual(openedCharacterArgs.at(-1), ['chat-directive']);

let selectBeforeOpenChatId = 'welcome-chat';
let selectBeforeOpenCharacterId = null;
const selectBeforeOpenCalls = [];
const selectBeforeOpenContext = {
  characters: [{ name: 'Albus Dumbledore' }],
  get characterId() { return selectBeforeOpenCharacterId; },
  get name2() { return selectBeforeOpenCharacterId === 0 ? 'Albus Dumbledore' : 'SillyTavern System'; },
  get chatId() { return selectBeforeOpenChatId; },
  async selectCharacterById(id, options) {
    selectBeforeOpenCalls.push(['selectCharacterById', id, options]);
    selectBeforeOpenCharacterId = id;
  },
  async openCharacterChat(fileName) {
    selectBeforeOpenCalls.push(['openCharacterChat', fileName, selectBeforeOpenCharacterId]);
    assert.equal(selectBeforeOpenCharacterId, 0);
    selectBeforeOpenChatId = fileName;
  }
};
const selectBeforeOpenAdapter = createSillyTavernChatAdapter({ contextFactory: () => selectBeforeOpenContext });
assert.equal(await selectBeforeOpenAdapter.open({
  chatId: 'Albus Dumbledore - 2026-06-22@13h30m15s725ms',
  entityType: 'character',
  entityId: '0'
}), true);
assert.deepEqual(selectBeforeOpenCalls, [
  ['selectCharacterById', 0, { switchMenu: false }],
  ['openCharacterChat', 'Albus Dumbledore - 2026-06-22@13h30m15s725ms', 0]
]);

let groupChatId = 'group-before';
const groupOpenArgs = [];
const groupContext = {
  groupId: 'group-17',
  groups: [{ id: 'group-17', name: 'Bridge Crew' }],
  chat: [],
  chatMetadata: {},
  get chatId() { return groupChatId; },
  async openGroupChat(...args) {
    groupOpenArgs.push(args);
    groupChatId = args[1];
  }
};
const groupAdapter = createSillyTavernChatAdapter({ contextFactory: () => groupContext });
assert.equal(await groupAdapter.open({ chatId: 'group-campaign', entityType: 'group', entityId: 'group-17' }), true);
assert.deepEqual(groupOpenArgs.at(-1), ['group-17', 'group-campaign']);

const promptCalls = [];
const promptContext = {
  get chatId() { return currentChatId; },
  setExtensionPrompt(...args) { promptCalls.push(args); },
  extension_prompt_types: { BEFORE_PROMPT: 0, IN_CHAT: 1, IN_PROMPT: 2 },
  extension_prompt_roles: { SYSTEM: 0, USER: 1, ASSISTANT: 2 }
};
const promptAdapter = createSillyTavernPromptAdapter({ contextFactory: () => promptContext });
const packet = {
  kind: 'directive.playerSafePromptContext',
  revision: 3,
  hash: 'packet-hash',
  blocks: [
    { id: 'campaign-frame', title: 'Campaign Frame', text: 'Ashes of Peace.', placement: 'inChat', depth: 8, role: 'system', priority: 100 },
    { id: 'narrator-constraints', title: 'Narrator Constraints', text: 'Never reveal hidden state.', placement: 'inPrompt', depth: 1, role: 'system', priority: 1000 }
  ]
};
currentChatId = 'chat-directive';
const installed = await promptAdapter.install({ binding, packet });
assert.equal(installed.ok, true);
assert.equal(installed.blockCount, 2);
assert.equal(promptAdapter.inspect().status, 'active');
assert.equal(promptCalls.filter((call) => call[1]).length, 2);

currentChatId = 'unbound-chat';
await assert.rejects(
  promptAdapter.install({ binding, packet }),
  (error) => error.code === 'DIRECTIVE_PROMPT_CHAT_MISMATCH'
);
const suspended = await promptAdapter.syncForChat({ chatId: 'unbound-chat' });
assert.equal(suspended.active, false);
assert.equal(promptAdapter.inspect().blockCount, 0);

const unavailableContext = {
  chatId: 'chat-before',
  chat: [],
  characterId: 1,
  name2: 'Character',
  chatMetadata: {}
};
const unavailable = createSillyTavernChatAdapter({ contextFactory: () => unavailableContext });
await assert.rejects(
  unavailable.createOrBindCampaignChat({ name: 'No API', campaignId: 'campaign', createNew: true }),
  (error) => error.code === 'DIRECTIVE_CHAT_CREATE_FAILED'
);

const missingEntityContext = {
  chatId: 'chat-before',
  chat: [],
  chatMetadata: {}
};
const missingEntity = createSillyTavernChatAdapter({ contextFactory: () => missingEntityContext });
await assert.rejects(
  missingEntity.createOrBindCampaignChat({ name: 'No Entity', campaignId: 'campaign', createNew: true }),
  (error) => error.code === 'DIRECTIVE_CHAT_ENTITY_REQUIRED'
    && error.message.includes('Select the character or group Directive should use')
);

let undetectedEntityChatId = 'undetected-before';
let undetectedEntityChat = [];
const undetectedEntityContext = {
  chatMetadata: {},
  get chat() { return undetectedEntityChat; },
  set chat(value) { undetectedEntityChat = value; },
  get chatId() { return undetectedEntityChatId; },
  async createNewChat(options) {
    assert.equal(options.name, 'Undetected Entity');
    undetectedEntityChatId = 'undetected-directive';
    undetectedEntityChat = [];
    return { chatId: undetectedEntityChatId };
  },
  async saveMetadata() {}
};
const undetectedEntity = createSillyTavernChatAdapter({ contextFactory: () => undetectedEntityContext });
const undetectedBinding = await undetectedEntity.createOrBindCampaignChat({
  name: 'Undetected Entity',
  campaignId: 'undetected-campaign',
  createNew: true
});
assert.equal(undetectedBinding.chatId, 'undetected-directive');
assert.equal(undetectedBinding.createdByDirective, true);
assert.equal(undetectedBinding.entityType, 'character');
assert.equal(undetectedBinding.entityId, null);

let nameOnlyChatId = 'name-only-before';
const nameOnlyContext = {
  name2: 'Name Only Character',
  characters: [{ name: 'Other' }, { name: 'Name Only Character' }],
  chatMetadata: {},
  chat: [],
  get chatId() { return nameOnlyChatId; },
  async createNewChat(options) {
    assert.equal(options.name, 'Name Only Selection');
    nameOnlyChatId = 'name-only-directive';
    return { chatId: nameOnlyChatId };
  },
  async saveMetadata() {}
};
const nameOnly = createSillyTavernChatAdapter({ contextFactory: () => nameOnlyContext });
const nameOnlyBinding = await nameOnly.createOrBindCampaignChat({
  name: 'Name Only Selection',
  campaignId: 'name-only-campaign',
  createNew: true
});
assert.equal(nameOnlyBinding.chatId, 'name-only-directive');
assert.equal(nameOnlyBinding.entityType, 'character');
assert.equal(nameOnlyBinding.entityId, '1');
assert.equal(nameOnlyBinding.entityName, 'Name Only Character');

let filenameEntityChatId = 'filename-before';
const filenameEntityContext = {
  name2: 'SillyTavern System',
  characters: [{ name: 'Albus Dumbledore' }, { name: 'Other' }],
  chatMetadata: {},
  chat: [],
  get chatId() { return filenameEntityChatId; },
  async createNewChat(options) {
    assert.equal(options.name, 'Filename Entity');
    filenameEntityChatId = 'Albus Dumbledore - 2026-06-22@13h21m11s249ms';
    return { chatId: filenameEntityChatId };
  },
  async saveMetadata() {}
};
const filenameEntity = createSillyTavernChatAdapter({ contextFactory: () => filenameEntityContext });
const filenameBinding = await filenameEntity.createOrBindCampaignChat({
  name: 'Filename Entity',
  campaignId: 'filename-campaign',
  createNew: true
});
assert.equal(filenameBinding.chatId, 'Albus Dumbledore - 2026-06-22@13h21m11s249ms');
assert.equal(filenameBinding.entityType, 'character');
assert.equal(filenameBinding.entityId, '0');
assert.equal(filenameBinding.entityName, 'Albus Dumbledore');

let globalFallbackChatId = 'global-before';
let globalFallbackChat = [];
const previousThisChid = globalThis.this_chid;
const previousName2 = globalThis.name2;
const previousCharacters = globalThis.characters;
globalThis.this_chid = 4;
globalThis.name2 = 'Global Selected Character';
globalThis.characters = [{ name: 'Other' }, null, null, null, { name: 'Global Selected Character' }];
try {
  const globalFallbackContext = {
    chatMetadata: {},
    get chat() { return globalFallbackChat; },
    set chat(value) { globalFallbackChat = value; },
    get chatId() { return globalFallbackChatId; },
    async createNewChat(options) {
      assert.equal(options.name, 'Global Selection');
      globalFallbackChatId = 'global-directive';
      globalFallbackChat = [];
      return { chatId: globalFallbackChatId };
    },
    async saveMetadata() {}
  };
  const globalFallback = createSillyTavernChatAdapter({ contextFactory: () => globalFallbackContext });
  const globalBinding = await globalFallback.createOrBindCampaignChat({
    name: 'Global Selection',
    campaignId: 'global-campaign',
    createNew: true
  });
  assert.equal(globalBinding.entityType, 'character');
  assert.equal(globalBinding.entityId, '4');
  assert.equal(globalBinding.entityName, 'Global Selected Character');
  assert.equal(globalBinding.chatId, 'global-directive');
} finally {
  if (previousThisChid === undefined) delete globalThis.this_chid;
  else globalThis.this_chid = previousThisChid;
  if (previousName2 === undefined) delete globalThis.name2;
  else globalThis.name2 = previousName2;
  if (previousCharacters === undefined) delete globalThis.characters;
  else globalThis.characters = previousCharacters;
}

let fallbackChatId = 'fallback-before';
let fallbackChat = [];
const fallbackCreateNames = [];
const fallbackContext = {
  characterId: 9,
  name2: 'Captain Rena',
  chatMetadata: {},
  get chat() { return fallbackChat; },
  set chat(value) { fallbackChat = value; },
  get chatId() { return fallbackChatId; },
  async createNewChat(options) {
    const candidateName = typeof options === 'string' ? options : options.name;
    fallbackCreateNames.push(candidateName);
    if (candidateName !== 'Directive') throw new Error('host rejected long name');
    fallbackChatId = 'fallback-directive';
    fallbackChat = [];
    return { chatId: fallbackChatId };
  },
  async saveMetadata() {}
};
const fallbackAdapter = createSillyTavernChatAdapter({ contextFactory: () => fallbackContext });
const fallbackBinding = await fallbackAdapter.createOrBindCampaignChat({
  name: 'Directive - A Campaign Title So Long The Host Refuses It',
  fallbackName: 'Directive',
  campaignId: 'fallback-campaign',
  createNew: true
});
assert.equal(fallbackCreateNames[0], 'Directive - A Campaign Title So Long The Host Refuses It');
assert.equal(fallbackCreateNames.at(-1), 'Directive');
assert.equal(fallbackCreateNames.includes(undefined), false);
assert.equal(fallbackBinding.chatId, 'fallback-directive');
assert.equal(fallbackBinding.chatName, 'Directive');

console.log('SillyTavern chat/prompt adapter tests passed: creation, binding, posting idempotency, host signatures, prompt lifecycle, and mismatch safety');
