import assert from 'node:assert/strict';

import {
  createSillyTavernChatAdapter,
  normalizeSillyTavernMessagePayload
} from '../../src/hosts/sillytavern/chat-adapter.mjs';
import {
  DIRECTIVE_STATIC_PROMPT_KEYS,
  createSillyTavernPromptAdapter
} from '../../src/hosts/sillytavern/prompt-adapter.mjs';

let currentChatId = 'chat-before';
let chat = [];
let metadataSaves = 0;
let chatSaves = 0;
let addedMessages = 0;
let selectedCharacterId = 0;
let forceSystemName2 = false;
const savedChats = new Map();
const createdCharacterNames = [];
const createdCharacterPayloads = [];
const selectedCharacterCalls = [];
const openedCharacterArgs = [];
const context = {
  characters: [{ name: 'Albus Dumbledore', avatar: 'albus.png' }],
  get characterId() { return selectedCharacterId; },
  get name2() { return forceSystemName2 ? 'SillyTavern System' : (this.characters[selectedCharacterId]?.name || 'SillyTavern System'); },
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
    if (savedChats.has(currentChatId)) {
      const saved = savedChats.get(currentChatId);
      chat = JSON.parse(JSON.stringify(saved.chatData || []));
      this.chatMetadata = JSON.parse(JSON.stringify(saved.withMetadata || {}));
    }
  },
  async saveChatSnapshot(options) {
    savedChats.set(options.chatName, JSON.parse(JSON.stringify(options)));
    chatSaves += 1;
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

forceSystemName2 = true;
const firstPost = await adapter.postAssistantMessage({
  text: 'Captain Whitaker yields the deck.',
  campaignId: 'campaign-st-adapter',
  responseKind: 'campaignIntro',
  idempotencyKey: 'intro:campaign-st-adapter'
});
assert.equal(chat[0].name, 'Directive - Ashes of Peace');
chat[0].name = 'SillyTavern System';
const duplicatePost = await adapter.postAssistantMessage({
  text: 'This duplicate must not be appended.',
  campaignId: 'campaign-st-adapter',
  responseKind: 'campaignIntro',
  idempotencyKey: 'intro:campaign-st-adapter'
});
assert.equal(firstPost.posted, true);
assert.equal(duplicatePost.duplicate, true);
assert.equal(chat.length, 1);
assert.equal(chat[0].name, 'Directive - Ashes of Peace');
assert.deepEqual(chat[0].swipes, ['Captain Whitaker yields the deck.']);
assert.equal(chat[0].swipe_id, 0);
assert.equal(chat[0].extra.overswipe_behavior, 'regenerate');
assert.equal(chat[0].swipe_info.length, 1);
assert.equal(chat[0].swipe_info[0].send_date, '2026-06-22T12:00:00.000Z');
assert.equal(chat[0].swipe_info[0].extra.overswipe_behavior, 'regenerate');
assert.equal(chat[0].swipe_info[0].extra.directive.responseKind, 'campaignIntro');
assert.equal(addedMessages, 1);
assert.equal(chatSaves, 3);

const alternateIntroSwipe = await adapter.appendAssistantMessageSwipe({
  hostMessageId: firstPost.hostMessageId,
  text: 'Captain Whitaker receives the new executive officer at the rail.',
  campaignId: 'campaign-st-adapter',
  responseKind: 'campaignIntro',
  extra: {
    directive: {
      introRevisionId: 'intro:campaign-st-adapter:1'
    }
  }
});
assert.equal(alternateIntroSwipe.ok, true);
assert.equal(alternateIntroSwipe.swipeIndex, 1);
assert.equal(alternateIntroSwipe.swipeCount, 2);
assert.equal(chat[0].mes, 'Captain Whitaker receives the new executive officer at the rail.');
assert.deepEqual(chat[0].swipes, [
  'Captain Whitaker yields the deck.',
  'Captain Whitaker receives the new executive officer at the rail.'
]);
assert.equal(chat[0].swipe_id, 1);
assert.equal(chat[0].extra.directive.selectedSwipeIndex, 1);
assert.equal(chat[0].extra.directive.swipeCount, 2);
assert.equal(chat[0].extra.directive.introRevisionId, 'intro:campaign-st-adapter:1');
assert.equal(chat[0].extra.overswipe_behavior, 'regenerate');
assert.equal(chat[0].swipe_info.length, 2);
assert.equal(chat[0].swipe_info[1].send_date, '2026-06-22T12:00:00.000Z');
assert.equal(chat[0].swipe_info[1].extra.overswipe_behavior, 'regenerate');
assert.equal(chat[0].swipe_info[1].extra.directive.introRevisionId, 'intro:campaign-st-adapter:1');
assert.equal(chatSaves, 4);

chat.push({ id: 'player-1', is_user: true, mes: 'Preserve the telemetry and notify the Captain.' });
const latest = adapter.getLatestPlayerMessage();
assert.equal(latest.hostMessageId, 'player-1');
assert.equal(latest.isUser, true);
assert.equal(latest.isDirectiveOwned, false);
assert.equal(normalizeSillyTavernMessagePayload(context, 1).text.includes('telemetry'), true);
assert.equal(normalizeSillyTavernMessagePayload(context, { messageId: '1' }).hostMessageId, 'player-1');
assert.equal(normalizeSillyTavernMessagePayload(context, { hostMessageId: 'player-1' }).text.includes('telemetry'), true);
assert.equal(
  normalizeSillyTavernMessagePayload(context, { messageId: '99' }),
  null,
  'Explicit event message references must not fall back to a prior latest user message.'
);
assert.equal(
  normalizeSillyTavernMessagePayload(context, { hostMessageId: 'missing-player-message' }),
  null,
  'Missing host message ids should remain transient so the event observer can retry.'
);
chat.push({
  id: 'player-ghosted',
  is_user: true,
  mes: 'Summaryception hid this from prompt, but it remains a source row.',
  extra: { sc_ghosted: true }
});
const ghostedPayload = normalizeSillyTavernMessagePayload(context, { hostMessageId: 'player-ghosted' });
assert.equal(ghostedPayload.visibility.sourceRowExists, true);
assert.equal(ghostedPayload.visibility.visibilityMutationOnly, true);
assert.equal(ghostedPayload.visibility.sourceMutation, false);
assert.equal(ghostedPayload.visibility.ghostedBySummaryception, true);
chat.push({
  id: 'player-deleted',
  is_user: true,
  mes: 'This row was deleted after being hidden.',
  deleted: true,
  extra: { sc_ghosted: true }
});
const deletedPayload = normalizeSillyTavernMessagePayload(context, { hostMessageId: 'player-deleted' });
assert.equal(deletedPayload.visibility.visibilityMutationOnly, false);
assert.equal(deletedPayload.visibility.sourceMutation, true);
const metadataGhostIndex = chat.length;
context.chatMetadata.summaryception = {
  ghostedIndices: [metadataGhostIndex],
  summarizedUpTo: metadataGhostIndex + 1
};
chat.push({
  id: 'player-metadata-ghosted',
  is_user: true,
  mes: 'Summaryception ghosted this by chat metadata instead of row metadata.'
});
const metadataGhostedPayload = normalizeSillyTavernMessagePayload(context, { hostMessageId: 'player-metadata-ghosted' });
assert.equal(metadataGhostedPayload.visibility.ghostedBySummaryception, true);
assert.equal(metadataGhostedPayload.visibility.ghostedBySummaryceptionMetadata, true);
assert.equal(metadataGhostedPayload.visibility.summarizedBySummaryception, true);
assert.equal(metadataGhostedPayload.visibility.visibilityMutationOnly, true);
assert.equal(metadataGhostedPayload.visibility.hiddenReasons.includes('summaryception-ghosted'), true);
chat.push({
  id: 'player-summarized-only',
  is_user: true,
  mes: 'Summaryception summarized this earlier row, but did not ghost it.'
});
const summarizedOnlyPayload = normalizeSillyTavernMessagePayload(context, { hostMessageId: 'player-summarized-only' });
assert.equal(summarizedOnlyPayload.visibility.summarizedBySummaryception, true);
assert.equal(summarizedOnlyPayload.visibility.hiddenByExternal, false);
assert.equal(summarizedOnlyPayload.visibility.visibilityMutationOnly, false);
const summarizedRangeIndex = chat.length;
context.chatMetadata.summaryception.summarizedRanges = [[summarizedRangeIndex, summarizedRangeIndex]];
chat.push({
  id: 'player-summarized-range',
  is_user: true,
  mes: 'Summaryception summarized this range without hiding the source row.'
});
const summarizedRangePayload = normalizeSillyTavernMessagePayload(context, { hostMessageId: 'player-summarized-range' });
assert.equal(summarizedRangePayload.visibility.summarizedBySummaryception, true);
assert.equal(summarizedRangePayload.visibility.hiddenByExternal, false);
assert.equal(summarizedRangePayload.visibility.visibilityMutationOnly, false);
const memoryBooksIndex = chat.length;
const memoryUnhiddenIndex = chat.length + 1;
const vectFoxIndex = chat.length + 2;
const nativeHiddenIndex = chat.length + 3;
const metadataDeletedIndex = chat.length + 4;
const deletedUnhiddenIndex = chat.length + 5;
context.chatMetadata.directiveVisibility = {
  memoryBooksHiddenIndices: [memoryBooksIndex],
  memoryBooksUnhiddenIndices: [memoryUnhiddenIndex, deletedUnhiddenIndex],
  vectFoxPromptExcludedIndices: [vectFoxIndex],
  nativeHiddenIndices: [nativeHiddenIndex],
  deletedIndices: [metadataDeletedIndex, deletedUnhiddenIndex]
};
chat.push(
  { id: 'player-memory-hidden', is_user: true, mes: 'Memory Books hid this row from prompt context.' },
  { id: 'player-memory-unhidden', is_user: true, mes: 'Memory Books restored this row to prompt context.' },
  { id: 'player-vectfox-ghosted', is_user: true, mes: 'VectFox removed this row from prompt context.' },
  { id: 'player-native-hidden', is_user: true, mes: 'SillyTavern native hide changed visibility only.' },
  { id: 'player-metadata-deleted', is_user: true, mes: 'This row has a metadata-level source delete.' },
  { id: 'player-deleted-unhidden', is_user: true, mes: 'This row was unhidden after being source-deleted.' }
);
const memoryHiddenPayload = normalizeSillyTavernMessagePayload(context, { hostMessageId: 'player-memory-hidden' });
assert.equal(memoryHiddenPayload.visibility.hiddenByMemoryBooks, true);
assert.equal(memoryHiddenPayload.visibility.visibilityMutationOnly, true);
assert.equal(memoryHiddenPayload.visibility.hiddenReasons.includes('memory-books-hidden'), true);
const memoryUnhiddenPayload = normalizeSillyTavernMessagePayload(context, { hostMessageId: 'player-memory-unhidden' });
assert.equal(memoryUnhiddenPayload.visibility.hiddenByMemoryBooks, false);
assert.equal(memoryUnhiddenPayload.visibility.unhiddenByMemoryBooks, true);
assert.equal(memoryUnhiddenPayload.visibility.memoryBooksVisibilityMutation, true);
assert.equal(memoryUnhiddenPayload.visibility.visibilityMutationOnly, true);
assert.equal(memoryUnhiddenPayload.visibility.visibilityMutationReasons.includes('memory-books-unhidden'), true);
const vectFoxGhostedPayload = normalizeSillyTavernMessagePayload(context, { hostMessageId: 'player-vectfox-ghosted' });
assert.equal(vectFoxGhostedPayload.visibility.ghostedByVectFox, true);
assert.equal(vectFoxGhostedPayload.visibility.promptExcludedByVectFox, true);
assert.equal(vectFoxGhostedPayload.visibility.visibilityMutationOnly, true);
assert.equal(vectFoxGhostedPayload.visibility.hiddenReasons.includes('vectfox-prompt-ghosted'), true);
const nativeHiddenPayload = normalizeSillyTavernMessagePayload(context, { hostMessageId: 'player-native-hidden' });
assert.equal(nativeHiddenPayload.visibility.hiddenByHost, true);
assert.equal(nativeHiddenPayload.visibility.visibilityMutationOnly, true);
assert.equal(nativeHiddenPayload.visibility.hiddenReasons.includes('host-hidden'), true);
const metadataDeletedPayload = normalizeSillyTavernMessagePayload(context, { hostMessageId: 'player-metadata-deleted' });
assert.equal(metadataDeletedPayload.visibility.visibilityMutationOnly, false);
assert.equal(metadataDeletedPayload.visibility.sourceMutation, true);
assert.equal(metadataDeletedPayload.visibility.sourceMutationReasons.includes('metadata-delete'), true);
const deletedUnhiddenPayload = normalizeSillyTavernMessagePayload(context, { hostMessageId: 'player-deleted-unhidden' });
assert.equal(deletedUnhiddenPayload.visibility.unhiddenByMemoryBooks, true);
assert.equal(deletedUnhiddenPayload.visibility.sourceMutation, true);
assert.equal(deletedUnhiddenPayload.visibility.visibilityMutationOnly, false);
chat.push({
  id: 'player-latest-ghosted',
  is_user: true,
  mes: 'Summaryception hid the latest row, but it is still the player source.',
  extra: { sc_ghosted: true }
});
const latestGhosted = adapter.getLatestPlayerMessage();
assert.equal(latestGhosted.hostMessageId, 'player-latest-ghosted');
assert.equal(latestGhosted.visibility.sourceRowExists, true);
assert.equal(latestGhosted.visibility.visibilityMutationOnly, true);
assert.equal(latestGhosted.visibility.sourceMutation, false);
const cloneSourceChatId = currentChatId;
const cloneSourceMessageCount = chat.length;
const branchBinding = await adapter.cloneCurrentChatForSaveBranch({
  name: 'Directive - Ashes Branch',
  campaignId: 'campaign-st-adapter',
  saveId: 'save-st-branch',
  sourceBinding: context.chatMetadata.directiveCampaignBinding
});
assert.equal(branchBinding.sourceChatId, cloneSourceChatId);
assert.equal(branchBinding.chatId, 'Directive - Ashes Branch');
assert.equal(branchBinding.saveId, 'save-st-branch');
assert.equal(currentChatId, branchBinding.chatId);
assert.equal(chat.length, cloneSourceMessageCount);
assert.equal(savedChats.get('Directive - Ashes Branch').chatData.length, cloneSourceMessageCount);
assert.equal(savedChats.get('Directive - Ashes Branch').withMetadata.directiveCampaignBinding.saveId, 'save-st-branch');
assert.equal(context.chatMetadata.directiveCampaignBinding.chatId, 'Directive - Ashes Branch');
assert.equal(context.chatMetadata.directiveCampaignBinding.saveId, 'save-st-branch');
const continuationUnavailable = await adapter.continueHostGeneration({ reason: 'node-adapter-contract' });
assert.equal(continuationUnavailable.ok, false);
assert.equal(continuationUnavailable.skipped, false);
assert.equal(Boolean(continuationUnavailable.error?.message), true);

let nonblockingGenerateCalled = false;
const nonblockingAdapter = createSillyTavernChatAdapter({
  contextFactory: () => context,
  now: () => '2026-06-22T12:34:56.000Z',
  scriptModule: {
    isGenerating: () => false,
    Generate(type, options) {
      nonblockingGenerateCalled = true;
      assert.equal(type, 'normal');
      assert.equal(options.automatic_trigger, true);
      return new Promise(() => {});
    }
  }
});
const nonblockingRelease = await Promise.race([
  nonblockingAdapter.continueHostGeneration({
    reason: 'nonblocking-release-test',
    waitForCompletion: false
  }),
  new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), 25))
]);
assert.equal(nonblockingGenerateCalled, true);
assert.equal(nonblockingRelease.timedOut, undefined);
assert.equal(nonblockingRelease.ok, true);
assert.equal(nonblockingRelease.released, true);
assert.equal(nonblockingRelease.waitForCompletion, false);
assert.equal(nonblockingRelease.generationStartedAt, '2026-06-22T12:34:56.000Z');
assert.equal(nonblockingRelease.hostGenerationReleasedAt, '2026-06-22T12:34:56.000Z');
assert.equal(nonblockingRelease.observedMessage, null);

let alreadyGeneratingGenerateCalled = false;
const alreadyGeneratingAdapter = createSillyTavernChatAdapter({
  contextFactory: () => context,
  now: () => '2026-06-22T12:35:56.000Z',
  scriptModule: {
    isGenerating: () => true,
    Generate() {
      alreadyGeneratingGenerateCalled = true;
      throw new Error('Generate should not be called when SillyTavern is already generating.');
    }
  }
});
const alreadyGeneratingRelease = await alreadyGeneratingAdapter.continueHostGeneration({
  reason: 'already-generating-release-test',
  waitForCompletion: false
});
assert.equal(alreadyGeneratingGenerateCalled, false);
assert.equal(alreadyGeneratingRelease.ok, true);
assert.equal(alreadyGeneratingRelease.skipped, true);
assert.equal(alreadyGeneratingRelease.released, true);
assert.equal(alreadyGeneratingRelease.waitForCompletion, false);
assert.equal(alreadyGeneratingRelease.reason, 'host-already-generating');
assert.equal(alreadyGeneratingRelease.generationStartedAt, '2026-06-22T12:35:56.000Z');
assert.equal(alreadyGeneratingRelease.hostGenerationReleasedAt, '2026-06-22T12:35:56.000Z');
assert.equal(alreadyGeneratingRelease.observedMessage, null);

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
  extensionPrompts: {
    summaryception: { value: 'Raw Summaryception text must not persist.' },
    '3_vectfox': { value: 'Raw VectFox text must not persist.' },
    worldInfoBefore: { value: 'Raw World Info text must not persist.' }
  },
  worldInfoSettings: {
    world_info: {
      globalSelect: ['Ashes Native Lorebook']
    },
    world_info_depth: 3,
    rawPromptBody: 'Raw World Info settings body must not persist.'
  },
  extensionSettings: {
    summaryception: {
      enabled: true,
      promptText: 'Raw Summaryception settings text must not persist.'
    },
    vectfox: {
      enabled: true,
      vector_backend: 'qdrant',
      qdrant_api_key: 'SECRET-QDRANT',
      vectorPayload: ['Raw vector payload must not persist.']
    }
  },
  chatMetadata: {
    world_info: 'Ashes Memory Book',
    summaryception: {
      summarizedUpTo: 2,
      ghostedIndices: [1]
    }
  },
  chat: [
    { is_user: true, mes: 'Visible row.' },
    { is_user: true, mes: 'Ghosted row.', extra: { sc_ghosted: true } }
  ],
  extension_prompt_types: { BEFORE_PROMPT: 0, IN_CHAT: 1, IN_PROMPT: 2 },
  extension_prompt_roles: { SYSTEM: 0, USER: 1, ASSISTANT: 2 }
};
const promptAdapter = createSillyTavernPromptAdapter({ contextFactory: () => promptContext });
const packet = {
  kind: 'directive.playerSafePromptContext',
  revision: 3,
  hash: 'packet-hash',
  blocks: [
    { id: 'campaign-frame', title: 'Campaign Frame', text: 'Ashes of Peace.', placement: 'inChat', depth: 8, role: 'system', priority: 100, sourceIds: ['campaign.ashes'] },
    { id: 'narrator-constraints', title: 'Narrator Constraints', text: 'Never reveal hidden state.', placement: 'inPrompt', depth: 1, role: 'system', priority: 1000 }
  ]
};
currentChatId = 'chat-directive';
const installed = await promptAdapter.install({ binding, packet });
assert.equal(installed.ok, true);
assert.equal(installed.blockCount, 2);
const promptInspectionAfterInstall = promptAdapter.inspect();
assert.equal(promptInspectionAfterInstall.status, 'active');
assert.deepEqual(promptInspectionAfterInstall.blocks.find((block) => block.id === 'campaign-frame')?.sourceIds, ['campaign.ashes']);
assert.match(promptInspectionAfterInstall.externalPromptEnvironmentRef.hash, /^[a-f0-9]{64}$/);
assert.equal(promptInspectionAfterInstall.knownExternalPromptKeys.includes('summaryception'), true);
assert.equal(promptInspectionAfterInstall.knownExternalPromptKeys.includes('3_vectfox'), true);
assert.equal(promptInspectionAfterInstall.knownExternalPromptKeys.includes('worldInfoBefore'), true);
assert.equal(promptInspectionAfterInstall.directiveOwnedPromptKeys.every((key) => key.startsWith('directive.')), true);
assert.equal(promptInspectionAfterInstall.finalHostPromptMayIncludeExternal, true);
assert.equal(promptInspectionAfterInstall.redactions.some((entry) => entry.reason === 'secret'), true);
assert.equal(promptInspectionAfterInstall.redactions.some((entry) => entry.reason === 'raw-payload'), true);
const promptInspectionSerialized = JSON.stringify(promptInspectionAfterInstall);
assert.equal(promptInspectionSerialized.includes('SECRET-QDRANT'), false);
assert.equal(promptInspectionSerialized.includes('Raw vector payload'), false);
assert.equal(promptInspectionSerialized.includes('Raw Summaryception'), false);
assert.equal(promptCalls.filter((call) => call[1]).length, 2);
for (const key of DIRECTIVE_STATIC_PROMPT_KEYS) {
  assert.ok(promptCalls.some((call) => call[0] === key && call[1] === ''), `${key} should be cleared before install when absent`);
}

const staticPacket = {
  ...packet,
  revision: 4,
  blocks: [
    {
      id: 'continuity-invariants',
      promptKey: 'directive.continuity.invariants',
      title: 'Continuity Invariants',
      text: 'Bronn is Tellarite.',
      placement: 'inPrompt',
      depth: 2,
      role: 'system',
      priority: 1000
    }
  ]
};
await promptAdapter.install({ binding, packet: staticPacket });
assert.ok(promptCalls.some((call) => call[0] === 'directive.continuity.invariants' && call[1] === 'Bronn is Tellarite.'));
assert.equal(promptAdapter.inspect().blocks.find((block) => block.id === 'continuity-invariants')?.promptKey, 'directive.continuity.invariants');
const staticClearCount = promptCalls.filter((call) => call[0] === 'directive.continuity.invariants' && call[1] === '').length;
await promptAdapter.install({ binding, packet });
assert.ok(
  promptCalls.filter((call) => call[0] === 'directive.continuity.invariants' && call[1] === '').length > staticClearCount,
  'missing static Matrix keys should be cleared on prompt rebuild'
);

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
let forceSuffixSystemName2 = false;
const suffixContext = {
  characters: [
    { name: 'Albus Dumbledore' },
    { name: 'Directive - Ashes of Peace' }
  ],
  chatMetadata: {},
  chat: [],
  get characterId() { return suffixSelectedCharacterId; },
  get name2() { return forceSuffixSystemName2 ? 'SillyTavern System' : (this.characters[suffixSelectedCharacterId]?.name || 'SillyTavern System'); },
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
forceSuffixSystemName2 = true;
await suffixAdapter.postAssistantMessage({
  text: 'The numbered Directive shell keeps owning campaign narration.',
  campaignId: 'suffix-campaign',
  responseKind: 'campaignIntro',
  idempotencyKey: 'suffix:intro'
});
assert.equal(suffixContext.chat[0].name, 'Directive - Ashes of Peace (1)');

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
