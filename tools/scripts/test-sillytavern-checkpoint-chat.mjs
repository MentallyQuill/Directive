import assert from 'node:assert/strict';

import { createSillyTavernChatAdapter } from '../../src/hosts/sillytavern/chat-adapter.mjs';

let currentChatId = 'active-chat';
let currentChat = [{ id: 'm1', is_user: true, mes: 'Engage.' }];
const saved = new Map();
const deleted = [];
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
          return Object.fromEntries([...saved.keys()].map((name) => [name, { file_name: `${name}.jsonl` }]));
        }
      };
    }
    if (url === '/api/chats/get') {
      assert.equal(body.file_name, 'Checkpoint One');
      return {
        ok: true,
        async json() {
          return [
            {
              chat_metadata: {
                directiveCampaignBinding: {
                  chatId: 'Checkpoint One',
                  campaignId: 'campaign-1',
                  saveId: 'save-active',
                  entityType: 'character',
                  entityId: '0'
                }
              }
            },
            { id: 'checkpoint-message', is_user: false, mes: 'Checkpoint prose.' }
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
  now: () => '2026-07-22T18:00:00.000Z'
});

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
assert.equal(saved.get('Checkpoint One - Continue').chatData[0].id, 'checkpoint-message');

assert.equal(await adapter.openCampaignChat(playableBinding), true);
assert.equal(currentChatId, 'Checkpoint One - Continue');

const deletion = await adapter.deleteCampaignChat(checkpointBinding);
assert.equal(deletion.deleted, true);
assert.deepEqual(deleted[0], {
  chatfile: 'Checkpoint One.jsonl',
  avatar_url: 'directive.png'
});

console.log('SillyTavern checkpoint chat tests passed.');
