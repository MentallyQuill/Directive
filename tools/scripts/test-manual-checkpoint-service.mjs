import assert from 'node:assert/strict';

import { createManualCheckpointService } from '../../src/runtime/manual-checkpoint-service.mjs';

function createMemoryAdapter() {
  const files = new Map();
  return {
    files,
    async readJson(key) {
      if (!files.has(key)) {
        const error = new Error(`Missing ${key}`);
        error.code = 'ENOENT';
        throw error;
      }
      return structuredClone(files.get(key));
    },
    async writeJson(key, value) {
      files.set(key, structuredClone(value));
    },
    async deleteJson(key) {
      return files.delete(key);
    }
  };
}

const storage = createMemoryAdapter();
const calls = [];
let failCoreOnce = true;
const active = {
  campaignId: 'campaign-1',
  saveId: 'save-active',
  chatId: 'chat-active',
  chatBinding: {
    hostId: 'sillytavern',
    chatId: 'chat-active',
    entityType: 'character',
    entityId: '42'
  },
  summary: { chapter: 'Prelude', stardate: '53049.2' }
};

const service = createManualCheckpointService({
  storage,
  now: () => '2026-07-22T18:00:00.000Z',
  getActiveContext: async () => structuredClone(active),
  guardSource: async (context) => {
    calls.push(['guard', context.saveId, context.chatId]);
    return { ok: true };
  },
  chat: {
    async cloneCampaignChat({ sourceChatId, targetName, open, saveId }) {
      calls.push(['clone', sourceChatId, targetName, open, saveId]);
      return {
        ...structuredClone(active.chatBinding),
        chatId: `${targetName}.jsonl`,
        chatName: targetName,
        saveId,
        sourceChatId
      };
    },
    async openCampaignChat(binding) {
      calls.push(['open', binding.chatId]);
      return { opened: true, chatId: binding.chatId };
    },
    async deleteCampaignChat(binding) {
      calls.push(['delete-chat', binding.chatId]);
      return { deleted: true };
    }
  },
  core: {
    async createCheckpointAuthority({ checkpointId, sourceSaveId }) {
      calls.push(['core-checkpoint', checkpointId, sourceSaveId]);
      if (failCoreOnce) {
        failCoreOnce = false;
        throw new Error('injected core checkpoint failure');
      }
      return {
        campaignId: 'campaign-1',
        saveId: sourceSaveId,
        checkpointId: `core-${checkpointId}`
      };
    },
    async forkCheckpoint({ checkpoint, targetSaveId, targetChatId }) {
      calls.push(['core-fork', checkpoint.id, targetSaveId, targetChatId]);
      return {
        campaignState: { campaign: { id: checkpoint.campaignId }, loadedFromCheckpointId: checkpoint.id },
        saveId: targetSaveId
      };
    },
    async deleteCheckpointAuthority({ checkpoint }) {
      calls.push(['delete-core', checkpoint.id]);
      return { deleted: true };
    }
  },
  async activateTimeline({ checkpoint, targetSaveId, chatBinding, coreResult }) {
    calls.push(['activate', checkpoint.id, targetSaveId, chatBinding.chatId]);
    return { campaignState: coreResult.campaignState, chatBinding };
  },
  async rebuildPrompt({ targetSaveId, chatBinding }) {
    calls.push(['prompt', targetSaveId, chatBinding.chatId]);
    return { rebuilt: true };
  }
});

await assert.rejects(
  () => service.saveGame({
    name: 'Before the Distress Call',
    checkpointId: 'checkpoint-1',
    operationId: 'save-operation-1'
  }),
  /injected core checkpoint failure/
);
assert.equal(calls.filter(([kind]) => kind === 'clone').length, 1);

const saved = await service.saveGame({
  name: 'Before the Distress Call',
  checkpointId: 'checkpoint-1',
  operationId: 'save-operation-1'
});
assert.equal(saved.checkpoint.id, 'checkpoint-1');
assert.equal(saved.activeSaveId, 'save-active');
assert.equal(saved.activeChatId, 'chat-active');
assert.equal(calls.filter(([kind]) => kind === 'clone').length, 1, 'resuming save must not clone a second checkpoint chat');

const savedAgain = await service.saveGame({
  name: 'Before the Distress Call',
  checkpointId: 'checkpoint-1',
  operationId: 'save-operation-1'
});
assert.equal(savedAgain.checkpoint.id, 'checkpoint-1');
assert.equal(calls.filter(([kind]) => kind === 'clone').length, 1);

const loaded = await service.loadGame({
  campaignId: 'campaign-1',
  checkpointId: 'checkpoint-1',
  operationId: 'load-operation-1',
  targetSaveId: 'save-loaded-1'
});
assert.equal(loaded.checkpointId, 'checkpoint-1');
assert.equal(loaded.activeSaveId, 'save-loaded-1');
assert.equal(loaded.playableChat.chatId, 'Before the Distress Call - Continue.jsonl');
assert.deepEqual(
  calls.filter(([kind]) => ['core-fork', 'activate', 'prompt', 'open'].includes(kind)).map(([kind]) => kind),
  ['core-fork', 'activate', 'prompt', 'open']
);

await service.loadGame({
  campaignId: 'campaign-1',
  checkpointId: 'checkpoint-1',
  operationId: 'load-operation-1',
  targetSaveId: 'save-loaded-1'
});
assert.equal(calls.filter(([kind]) => kind === 'core-fork').length, 1, 'replaying the same load operation must converge');

await service.loadGame({
  campaignId: 'campaign-1',
  checkpointId: 'checkpoint-1',
  operationId: 'load-operation-2',
  targetSaveId: 'save-loaded-2'
});
assert.equal(calls.filter(([kind]) => kind === 'core-fork').length, 2, 'a new load operation must create a new playable timeline');

const deleted = await service.deleteGame({
  campaignId: 'campaign-1',
  checkpointId: 'checkpoint-1',
  operationId: 'delete-operation-1'
});
assert.equal(deleted.deleted, true);
assert.equal(calls.filter(([kind]) => kind === 'delete-chat').length, 1);
assert.equal(calls.filter(([kind]) => kind === 'delete-core').length, 1);

console.log('Manual checkpoint service tests passed.');
