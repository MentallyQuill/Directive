import assert from 'node:assert/strict';

import { createSillyTavernChatAdapter } from '../../src/hosts/sillytavern/chat-adapter.mjs';

let currentChatId = 'active-chat';
let currentChat = [{ id: 'm1', is_user: true, mes: 'Engage.' }];
const saved = new Map();
const deleted = [];
const deletedCharacters = [];
const context = {
  characters: [{ name: 'Directive Campaign', avatar: 'directive.png', chat: 'active-chat' }],
  characterId: 0,
  name2: 'Directive Campaign',
  chatMetadata: {
    directiveCampaignBinding: {
      hostId: 'sillytavern',
      chatId: 'active-chat',
      campaignId: 'campaign-1',
      saveId: 'save-active',
      entityType: 'character',
      entityId: '0',
      entityName: 'Directive Campaign'
    }
  },
  get chat() { return currentChat; },
  get chatId() { return currentChatId; },
  getCurrentChatId() { return currentChatId; },
  getRequestHeaders() { return { 'Content-Type': 'application/json' }; },
  async saveChatSnapshot(options) {
    saved.set(options.chatName, structuredClone(options));
  },
  async openCharacterChat(chatId) {
    currentChatId = chatId;
  },
  async saveMetadata() {},
  async fetch(url, options = {}) {
    const body = JSON.parse(options.body || '{}');
    if (url === '/api/characters/chats') {
      return {
        ok: true,
        async json() {
          return [...saved.keys()].map((name) => ({ file_name: `${name}.jsonl`, file_id: name }));
        }
      };
    }
    if (url === '/api/chats/get') {
      const snapshot = saved.get(body.file_name);
      assert.ok(snapshot, `expected saved chat snapshot ${body.file_name}`);
      return {
        ok: true,
        async json() {
          return [
            {
              chat_metadata: structuredClone(snapshot.withMetadata || {})
            },
            ...structuredClone(snapshot.chatData || [])
          ];
        }
      };
    }
    if (url === '/api/chats/delete') {
      deleted.push(body);
      return { ok: true, async json() { return {}; } };
    }
    throw new Error(`Unexpected fetch ${url}`);
  }
};

const adapter = createSillyTavernChatAdapter({
  contextFactory: () => context,
  now: () => '2026-07-22T18:00:00.000Z',
  scriptModule: {
    async deleteCharacter(avatar, options) {
      deletedCharacters.push({ avatar, options });
      return true;
    }
  }
});

currentChat.push({
  id: 'assistant-hosted',
  is_user: false,
  is_system: false,
  mes: 'A host-generated report.',
  swipes: ['A host-generated report.'],
  swipe_id: 0,
  swipe_info: [{ extra: { preservedByAnotherExtension: true } }],
  extra: { preservedRoot: true }
});
await adapter.attachAssistantRuntimeMetadata({
  hostMessageId: 'assistant-hosted',
  runtimeMetadata: { responseId: 'host-response.assistant-hosted', dutyReportManifest: { kind: 'test-manifest' } }
});
const hosted = adapter.getMessage('assistant-hosted');
assert.equal(hosted.isDirectiveOwned, false, 'runtime custody must not take ownership of host narration');
assert.equal(hosted.raw.extra.preservedRoot, true);
assert.equal(hosted.raw.extra.runtimeMetadata.responseId, 'host-response.assistant-hosted');
assert.equal(hosted.raw.swipe_info[0].extra.preservedByAnotherExtension, true);
assert.equal(hosted.raw.swipe_info[0].extra.runtimeMetadata.dutyReportManifest.kind, 'test-manifest');

const checkpointBinding = await adapter.cloneCampaignChat({
  sourceChatId: 'active-chat',
  sourceBinding: context.chatMetadata.directiveCampaignBinding,
  campaignId: 'campaign-1',
  saveId: 'save-active',
  targetName: 'Checkpoint One',
  open: false
});
assert.equal(checkpointBinding.chatId, 'Checkpoint One');
assert.equal(currentChatId, 'active-chat', 'saving a checkpoint must not navigate away from the active chat');
assert.equal(saved.get('Checkpoint One').chatData[0].id, 'm1');
assert.equal(checkpointBinding.transcriptAttestation.kind, 'directive.nativeBranchTranscriptAttestation.v1');
assert.equal(checkpointBinding.transcriptAttestation.version, 1);
assert.equal(checkpointBinding.transcriptAttestation.messageCount, 2);
assert.match(checkpointBinding.transcriptAttestation.lineageHash, /^[0-9a-f]{16}$/);
assert.deepEqual(
  saved.get('Checkpoint One').withMetadata.directiveCampaignBinding.transcriptAttestation,
  checkpointBinding.transcriptAttestation
);
assert.deepEqual(await adapter.verifyCampaignChatSnapshot(checkpointBinding), {
  ok: true,
  reasonCode: null
});

const playableBinding = await adapter.cloneCampaignChat({
  sourceChatId: 'Checkpoint One',
  sourceBinding: checkpointBinding,
  campaignId: 'campaign-1',
  saveId: 'save-loaded',
  targetName: 'Checkpoint One - Continue',
  open: false
});
assert.equal(playableBinding.chatId, 'Checkpoint One - Continue');
assert.equal(currentChatId, 'active-chat', 'cloning a playable continuation must remain non-navigating until binding and prompt work finish');
assert.equal(saved.get('Checkpoint One - Continue').chatData[0].id, 'm1');

const mutatedCheckpoint = structuredClone(saved.get('Checkpoint One'));
mutatedCheckpoint.chatData[0].mes = 'Mutated checkpoint prose.';
saved.set('Checkpoint One', mutatedCheckpoint);
assert.equal(
  (await adapter.verifyCampaignChatSnapshot(checkpointBinding)).reasonCode,
  'native-branch-transcript-attestation-mismatch'
);
const legacyBinding = { ...checkpointBinding };
delete legacyBinding.transcriptAttestation;
assert.deepEqual(await adapter.verifyCampaignChatSnapshot(legacyBinding), {
  ok: true,
  reasonCode: null,
  legacy: true
});

const maximumName = 'A'.repeat(180);
const maximumNameFirst = await adapter.cloneCampaignChat({
  sourceChatId: 'active-chat',
  sourceBinding: context.chatMetadata.directiveCampaignBinding,
  campaignId: 'campaign-1',
  saveId: 'save-long-1',
  targetName: maximumName,
  open: false
});
const maximumNameSecond = await adapter.cloneCampaignChat({
  sourceChatId: 'active-chat',
  sourceBinding: context.chatMetadata.directiveCampaignBinding,
  campaignId: 'campaign-1',
  saveId: 'save-long-2',
  targetName: maximumName,
  open: false
});
assert.equal(maximumNameFirst.chatId.length, 180);
assert.notEqual(maximumNameSecond.chatId, maximumNameFirst.chatId);
assert.equal(maximumNameSecond.chatId.length, 180);
assert.match(maximumNameSecond.chatId, / 2$/);

const successfulFetch = context.fetch;
const savedCountBeforeEnumerationFailure = saved.size;
context.fetch = async (url, options) => {
  if (url === '/api/characters/chats') return { ok: false, status: 503 };
  return successfulFetch.call(context, url, options);
};
await assert.rejects(
  adapter.cloneCampaignChat({
    sourceChatId: 'Checkpoint One - Continue',
    sourceBinding: playableBinding,
    campaignId: 'campaign-1',
    saveId: 'save-enumeration-failure',
    targetName: 'Must Not Overwrite',
    open: false
  }),
  (error) => error?.code === 'DIRECTIVE_CHAT_NAME_ENUMERATION_FAILED'
);
assert.equal(saved.size, savedCountBeforeEnumerationFailure, 'a failed collision check must not write a chat snapshot');
context.fetch = successfulFetch;

for (const invalidEnumeration of [
  { error: true },
  [{ file_id: 'missing-file-name' }]
]) {
  context.fetch = async (url, options) => {
    if (url === '/api/characters/chats') return { ok: true, async json() { return invalidEnumeration; } };
    return successfulFetch.call(context, url, options);
  };
  await assert.rejects(
    adapter.prepareCampaignChatClone({
      sourceChatId: 'Checkpoint One - Continue', sourceBinding: playableBinding,
      campaignId: 'campaign-1', saveId: 'save-invalid-enumeration', targetName: 'Invalid Enumeration'
    }),
    (error) => error?.code === 'DIRECTIVE_CHAT_NAME_ENUMERATION_FAILED'
  );
}
context.fetch = async (url, options) => {
  if (url === '/api/characters/chats') return { ok: true, async json() { return []; } };
  return successfulFetch.call(context, url, options);
};
const emptyArrayPlan = await adapter.prepareCampaignChatClone({
  sourceChatId: 'Checkpoint One - Continue', sourceBinding: playableBinding,
  campaignId: 'campaign-1', saveId: 'save-empty-array', targetName: 'Empty Array Plan'
});
assert.equal(emptyArrayPlan.chatId, 'Empty Array Plan', 'the real SillyTavern empty-array response must allow clone planning');
context.fetch = successfulFetch;

assert.equal(await adapter.openCampaignChat(playableBinding), true);
assert.equal(currentChatId, 'Checkpoint One - Continue');

const deletion = await adapter.deleteCampaignChat(checkpointBinding);
assert.equal(deletion.deleted, true);
assert.deepEqual(deleted[0], {
  chatfile: 'Checkpoint One.jsonl',
  avatar_url: 'directive.png'
});

const characterDeletion = await adapter.deleteCampaignCharacter({
  ...context.chatMetadata.directiveCampaignBinding,
  kind: 'directive.campaignChatBinding.v1',
  version: 1,
  status: 'bound'
});
assert.deepEqual(characterDeletion, {
  deleted: true,
  entityId: '0',
  entityName: 'Directive Campaign'
});
assert.deepEqual(deletedCharacters, [{
  avatar: 'directive.png',
  options: { deleteChats: true }
}]);

await assert.rejects(
  adapter.deleteCampaignCharacter({
    ...context.chatMetadata.directiveCampaignBinding,
    entityType: 'group'
  }),
  (error) => error?.code === 'DIRECTIVE_CAMPAIGN_CHARACTER_DELETE_TARGET_INVALID'
);
await assert.rejects(
  adapter.deleteCampaignCharacter({
    ...context.chatMetadata.directiveCampaignBinding,
    entityName: 'Wrong Character'
  }),
  (error) => error?.code === 'DIRECTIVE_CAMPAIGN_CHARACTER_DELETE_TARGET_MISMATCH'
);

const unavailableAdapter = createSillyTavernChatAdapter({
  contextFactory: () => context,
  importScript: async () => ({})
});
await assert.rejects(
  unavailableAdapter.deleteCampaignCharacter(context.chatMetadata.directiveCampaignBinding),
  (error) => error?.code === 'DIRECTIVE_CAMPAIGN_CHARACTER_DELETE_UNAVAILABLE'
);

let exactCharacterId = 1;
let exactCharacterName = 'Other Character';
let exactChatId = 'shared-chat';
let exactMessages = [{ id: 'b1', is_user: false, mes: 'Other character transcript.' }];
const exactCharacters = [
  { name: 'Bound Character', avatar: 'bound.png', chat: 'shared-chat' },
  { name: 'Other Character', avatar: 'other.png', chat: 'shared-chat' }
];
const exactSaved = new Map();
const exactDeletes = [];
const exactContext = {
  characters: exactCharacters,
  get characterId() { return exactCharacterId; },
  get name2() { return exactCharacterName; },
  get chat() { return exactMessages; },
  get chatId() { return exactChatId; },
  getCurrentChatId() { return exactChatId; },
  getRequestHeaders() { return { 'Content-Type': 'application/json' }; },
  async selectCharacterById(id) {
    exactCharacterId = Number(id);
    exactCharacterName = exactCharacters[exactCharacterId].name;
    exactMessages = exactCharacterId === 0
      ? [{ id: 'a1', is_user: false, mes: 'Bound character transcript.' }]
      : [{ id: 'b1', is_user: false, mes: 'Other character transcript.' }];
  },
  async saveChatSnapshot(options) {
    exactSaved.set(`${exactCharacters[exactCharacterId].avatar}:${options.chatName}`, structuredClone(options));
  },
  async fetch(url, options = {}) {
    const body = JSON.parse(options.body || '{}');
    if (url === '/api/characters/chats') {
      return { ok: true, async json() { return {}; } };
    }
    if (url === '/api/chats/get') {
      const message = body.avatar_url === 'bound.png'
        ? { id: 'a1', is_user: false, mes: 'Bound character transcript.' }
        : { id: 'b1', is_user: false, mes: 'Other character transcript.' };
      return { ok: true, async json() { return [{ chat_metadata: {} }, message]; } };
    }
    if (url === '/api/chats/delete') {
      exactDeletes.push(body);
      return { ok: true, async json() { return {}; } };
    }
    throw new Error(`Unexpected exact-custody fetch ${url}`);
  }
};
const exactAdapter = createSillyTavernChatAdapter({ contextFactory: () => exactContext });
const boundBinding = {
  hostId: 'sillytavern', campaignId: 'campaign-exact', saveId: 'save-exact', chatId: 'shared-chat',
  entityType: 'character', entityId: '0', entityName: 'Bound Character'
};
const exactClone = await exactAdapter.cloneCampaignChat({
  sourceChatId: 'shared-chat', sourceBinding: boundBinding,
  campaignId: 'campaign-exact', saveId: 'save-exact', targetName: 'Exact Clone', open: false
});
assert.equal(
  exactSaved.get('bound.png:Exact Clone').chatData[0].mes,
  'Bound character transcript.',
  'clone custody must follow the supplied binding rather than an ambient same-named chat'
);
exactCharacterId = 1;
exactCharacterName = 'Other Character';
exactMessages = [{ id: 'b1', is_user: false, mes: 'Other character transcript.' }];
await exactAdapter.deleteCampaignChat(exactClone);
assert.deepEqual(exactDeletes.at(-1), {
  chatfile: 'Exact Clone.jsonl',
  avatar_url: 'bound.png'
}, 'cleanup must delete under the exact bound character after ambient identity changes');

console.log('SillyTavern checkpoint chat tests passed.');
