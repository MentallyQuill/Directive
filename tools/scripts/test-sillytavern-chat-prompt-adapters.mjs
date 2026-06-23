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
let selectedCharacterId = 0;
const createdCharacterNames = [];
const createdCharacterPayloads = [];
const selectedCharacterCalls = [];
const openedCharacterArgs = [];
const context = {
  characters: [{ name: 'Albus Dumbledore', avatar: 'albus.png' }],
  get characterId() { return selectedCharacterId; },
  get name2() { return this.characters[selectedCharacterId]?.name || 'SillyTavern System'; },
  chatMetadata: {},
  get chat() { return chat; },
  set chat(value) { chat = value; },
  get chatId() { return currentChatId; },
  getCurrentChatId() { return currentChatId; },
  async createDirectiveCharacterCard(payload) {
    createdCharacterNames.push(payload.ch_name);
    createdCharacterPayloads.push(payload);
    const avatar = `${payload.ch_name}.png`;
    this.characters.push({ name: payload.ch_name, avatar });
    return { avatar, name: payload.ch_name };
  },
  async selectCharacterById(id, options) {
    selectedCharacterCalls.push([id, options]);
    selectedCharacterId = id;
  },
  async createNewChat(options) {
    assert.equal(options.name, 'Directive - Ashes of Peace');
    assert.equal(this.characters[selectedCharacterId]?.name, 'Directive - Ashes of Peace');
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
assert.equal(binding.entityId, '1');
assert.equal(binding.entityName, 'Directive - Ashes of Peace');
assert.equal(binding.chatName, 'Directive - Ashes of Peace');
assert.equal(binding.characterCreationMethod, 'context:createCharacterCard');
assert.equal(binding.freshChatCleanup.status, 'cleared');
assert.equal(binding.freshChatCleanup.removedMessageCount, 1);
assert.deepEqual(createdCharacterNames, ['Directive - Ashes of Peace']);
assert.equal(createdCharacterPayloads[0].description, '');
assert.equal(createdCharacterPayloads[0].first_mes, '');
assert.equal(createdCharacterPayloads[0].personality, '');
assert.equal(createdCharacterPayloads[0].scenario, '');
assert.equal(createdCharacterPayloads[0].mes_example, '');
assert.deepEqual(selectedCharacterCalls[0], [1, { switchMenu: false }]);
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

let inferredOpenChatId = null;
let inferredOpenCharacterId = null;
const inferredOpenCalls = [];
const inferredOpenContext = {
  characters: [
    { name: 'SillyTavern System' },
    { name: 'Directive - Ashes of Peace' }
  ],
  get characterId() { return inferredOpenCharacterId; },
  get name2() { return inferredOpenCharacterId === null ? 'SillyTavern System' : this.characters[inferredOpenCharacterId]?.name; },
  get chatId() { return inferredOpenChatId; },
  async selectCharacterById(id, options) {
    inferredOpenCalls.push(['selectCharacterById', id, options]);
    inferredOpenCharacterId = id;
  },
  async openCharacterChat(fileName) {
    inferredOpenCalls.push(['openCharacterChat', fileName, inferredOpenCharacterId]);
    inferredOpenChatId = fileName;
  }
};
const inferredOpenAdapter = createSillyTavernChatAdapter({ contextFactory: () => inferredOpenContext });
assert.equal(await inferredOpenAdapter.open({
  chatId: 'Directive - Ashes of Peace - 2026-06-22@20h26m43s770ms',
  entityType: 'character'
}), true);
assert.deepEqual(inferredOpenCalls, [
  ['selectCharacterById', 1, { switchMenu: false }],
  ['openCharacterChat', 'Directive - Ashes of Peace - 2026-06-22@20h26m43s770ms', 1]
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
  (error) => error.code === 'DIRECTIVE_CHARACTER_CREATE_UNAVAILABLE'
);

let noChatApiSelectedCharacterId = 0;
const noChatApiContext = {
  chatId: 'chat-before',
  chat: [],
  chatMetadata: {},
  characters: [{ name: 'Albus Dumbledore' }],
  get characterId() { return noChatApiSelectedCharacterId; },
  async createDirectiveCharacterCard(payload) {
    this.characters.push({ name: payload.ch_name, avatar: `${payload.ch_name}.png` });
    return { name: payload.ch_name, avatar: `${payload.ch_name}.png` };
  },
  async selectCharacterById(id) {
    noChatApiSelectedCharacterId = id;
  }
};
const noChatApi = createSillyTavernChatAdapter({ contextFactory: () => noChatApiContext });
await assert.rejects(
  noChatApi.createOrBindCampaignChat({ name: 'No Chat API', campaignId: 'campaign', createNew: true }),
  (error) => error.code === 'DIRECTIVE_CHAT_CREATE_FAILED'
);

let noSelectionChatId = 'no-selection-before';
const noSelectionContext = {
  chatMetadata: {},
  characters: [{ name: 'Albus Dumbledore' }],
  chat: [],
  get chatId() { return noSelectionChatId; },
  async createDirectiveCharacterCard(payload) {
    this.characters.push({ name: payload.ch_name, avatar: `${payload.ch_name}.png` });
    return { name: payload.ch_name, avatar: `${payload.ch_name}.png` };
  },
  async createNewChat() {
    noSelectionChatId = 'must-not-create-chat';
    return { chatId: noSelectionChatId };
  },
  async saveMetadata() {}
};
const noSelection = createSillyTavernChatAdapter({ contextFactory: () => noSelectionContext });
await assert.rejects(
  noSelection.createOrBindCampaignChat({ name: 'No Selection API', campaignId: 'no-selection-campaign', createNew: true }),
  (error) => error.code === 'DIRECTIVE_CHARACTER_CREATE_FAILED'
);
assert.equal(noSelectionChatId, 'no-selection-before');

let suffixChatId = 'suffix-before';
let suffixSelectedCharacterId = 0;
const suffixContext = {
  characters: [
    { name: 'Albus Dumbledore' },
    { name: 'Directive - Ashes of Peace' }
  ],
  chatMetadata: {},
  chat: [],
  get characterId() { return suffixSelectedCharacterId; },
  get name2() { return this.characters[suffixSelectedCharacterId]?.name || 'SillyTavern System'; },
  get chatId() { return suffixChatId; },
  async createDirectiveCharacterCard(payload) {
    assert.equal(payload.ch_name, 'Directive - Ashes of Peace (1)');
    this.characters.push({ name: payload.ch_name, avatar: `${payload.ch_name}.png` });
    return { name: payload.ch_name, avatar: `${payload.ch_name}.png` };
  },
  async selectCharacterById(id) {
    suffixSelectedCharacterId = id;
  },
  async createNewChat(options) {
    assert.equal(options.name, 'Directive - Ashes of Peace (1)');
    assert.equal(this.characters[suffixSelectedCharacterId]?.name, 'Directive - Ashes of Peace (1)');
    suffixChatId = 'suffix-directive';
    return { chatId: suffixChatId };
  },
  async saveMetadata() {}
};
const suffixAdapter = createSillyTavernChatAdapter({ contextFactory: () => suffixContext });
const suffixBinding = await suffixAdapter.createOrBindCampaignChat({
  name: 'Directive - Ashes of Peace',
  fallbackName: 'Directive',
  campaignId: 'suffix-campaign',
  createNew: true
});
assert.equal(suffixBinding.chatId, 'suffix-directive');
assert.equal(suffixBinding.entityName, 'Directive - Ashes of Peace (1)');
assert.equal(suffixBinding.chatName, 'Directive - Ashes of Peace (1)');

let secondSuffixChatId = 'second-suffix-before';
let secondSuffixSelectedCharacterId = 0;
const secondSuffixContext = {
  characters: [
    { name: 'Albus Dumbledore' },
    { name: 'Directive - Ashes of Peace' },
    { name: 'Directive - Ashes of Peace (1)' }
  ],
  chatMetadata: {},
  chat: [],
  get characterId() { return secondSuffixSelectedCharacterId; },
  get name2() { return this.characters[secondSuffixSelectedCharacterId]?.name || 'SillyTavern System'; },
  get chatId() { return secondSuffixChatId; },
  async createDirectiveCharacterCard(payload) {
    assert.equal(payload.ch_name, 'Directive - Ashes of Peace (2)');
    this.characters.push({ name: payload.ch_name, avatar: `${payload.ch_name}.png` });
    return { name: payload.ch_name, avatar: `${payload.ch_name}.png` };
  },
  async selectCharacterById(id) {
    secondSuffixSelectedCharacterId = id;
  },
  async createNewChat(options) {
    assert.equal(options.name, 'Directive - Ashes of Peace (2)');
    assert.equal(this.characters[secondSuffixSelectedCharacterId]?.name, 'Directive - Ashes of Peace (2)');
    secondSuffixChatId = 'second-suffix-directive';
    return { chatId: secondSuffixChatId };
  },
  async saveMetadata() {}
};
const secondSuffixAdapter = createSillyTavernChatAdapter({ contextFactory: () => secondSuffixContext });
const secondSuffixBinding = await secondSuffixAdapter.createOrBindCampaignChat({
  name: 'Directive - Ashes of Peace',
  fallbackName: 'Directive',
  campaignId: 'second-suffix-campaign',
  createNew: true
});
assert.equal(secondSuffixBinding.chatId, 'second-suffix-directive');
assert.equal(secondSuffixBinding.entityName, 'Directive - Ashes of Peace (2)');
assert.equal(secondSuffixBinding.chatName, 'Directive - Ashes of Peace (2)');

let fallbackChatId = 'fallback-before';
let fallbackChat = [];
let fallbackSelectedCharacterId = 0;
const fallbackCreateNames = [];
const fallbackContext = {
  characters: [{ name: 'Captain Rena' }],
  get characterId() { return fallbackSelectedCharacterId; },
  get name2() { return this.characters[fallbackSelectedCharacterId]?.name || 'SillyTavern System'; },
  chatMetadata: {},
  get chat() { return fallbackChat; },
  set chat(value) { fallbackChat = value; },
  get chatId() { return fallbackChatId; },
  async createDirectiveCharacterCard(payload) {
    this.characters.push({ name: payload.ch_name, avatar: `${payload.ch_name}.png` });
    return { name: payload.ch_name, avatar: `${payload.ch_name}.png` };
  },
  async selectCharacterById(id) {
    fallbackSelectedCharacterId = id;
  },
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
