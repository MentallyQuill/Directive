import {
  advanceCheckpointOperation,
  createCheckpointOperation,
  createManualCheckpointRecord,
  deleteManualCheckpoint,
  loadCheckpointOperation,
  requireManualCheckpoint,
  storeCheckpointOperation,
  storeManualCheckpoint
} from '../storage/manual-checkpoint-records.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function requireString(value, label) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${label} must be a non-empty string`);
  return text;
}

function defaultId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function createManualCheckpointService({
  storage,
  chat,
  core,
  getActiveContext,
  guardSource = async () => ({ ok: true }),
  activateTimeline,
  rebuildPrompt,
  now = () => new Date().toISOString(),
  createId = defaultId
} = {}) {
  requireObject(storage, 'storage');
  requireObject(chat, 'chat');
  requireObject(core, 'core');
  if (typeof getActiveContext !== 'function') throw new Error('getActiveContext must be a function');
  if (typeof activateTimeline !== 'function') throw new Error('activateTimeline must be a function');
  if (typeof rebuildPrompt !== 'function') throw new Error('rebuildPrompt must be a function');

  const timestamp = () => String(now());

  async function operationFor({
    operationId,
    campaignId,
    operationKind,
    checkpointId,
    sourceSaveId = null,
    targetSaveId = null
  }) {
    const existing = await loadCheckpointOperation(storage, {
      campaignId,
      operationId
    });
    if (existing) {
      if (existing.operationKind !== operationKind
        || existing.checkpointId !== checkpointId
        || (targetSaveId && existing.targetSaveId !== targetSaveId)) {
        throw new Error(`Checkpoint operation "${operationId}" conflicts with the requested operation`);
      }
      return existing;
    }
    const created = createCheckpointOperation({
      id: operationId,
      campaignId,
      kind: operationKind,
      checkpointId,
      sourceSaveId,
      targetSaveId,
      createdAt: timestamp()
    });
    await storeCheckpointOperation(storage, created);
    return created;
  }

  async function advance(operation, stage, result) {
    return advanceCheckpointOperation(storage, operation, {
      stage,
      result,
      updatedAt: timestamp()
    });
  }

  return {
    async saveGame({
      name,
      checkpointId = createId('checkpoint'),
      operationId = createId('checkpoint-save')
    } = {}) {
      const context = requireObject(await getActiveContext(), 'active context');
      const campaignId = requireString(context.campaignId, 'active context campaignId');
      const sourceSaveId = requireString(context.saveId, 'active context saveId');
      const activeChatId = context.chatId;
      const checkpointName = requireString(name, 'name');
      let operation = await operationFor({
        operationId: requireString(operationId, 'operationId'),
        campaignId,
        operationKind: 'save',
        checkpointId: requireString(checkpointId, 'checkpointId'),
        sourceSaveId
      });
      if (operation.status === 'complete') return cloneJson(operation.results.complete);

      if (!operation.results.sourceGuard) {
        const guard = await guardSource(cloneJson(context));
        if (guard?.ok !== true) {
          const error = new Error(guard?.summary || 'Checkpoint source guard failed');
          error.code = guard?.code || 'DIRECTIVE_CHECKPOINT_SOURCE_GUARD_FAILED';
          error.details = cloneJson(guard);
          throw error;
        }
        operation = await advance(operation, 'sourceGuard', guard);
      }
      requireString(activeChatId, 'active context chatId');

      let preservedChat = operation.results.chatClone;
      if (!preservedChat) {
        preservedChat = await chat.cloneCampaignChat({
          sourceChatId: activeChatId,
          sourceBinding: cloneJson(context.chatBinding || {}),
          campaignId,
          saveId: sourceSaveId,
          targetName: checkpointName,
          open: false
        });
        requireString(preservedChat?.chatId, 'preserved checkpoint chatId');
        operation = await advance(operation, 'chatClone', preservedChat);
      }

      let coreAuthority = operation.results.coreAuthority;
      if (!coreAuthority) {
        coreAuthority = await core.createCheckpointAuthority({
          campaignId,
          sourceSaveId,
          sourceChatId: activeChatId,
          checkpointId,
          preservedChatId: preservedChat.chatId
        });
        requireString(coreAuthority?.checkpointId, 'core checkpointId');
        operation = await advance(operation, 'coreAuthority', coreAuthority);
      }

      let checkpoint = operation.results.checkpointRecord;
      if (!checkpoint) {
        checkpoint = createManualCheckpointRecord({
          id: checkpointId,
          campaignId,
          sourceSaveId,
          name: checkpointName,
          createdAt: operation.createdAt,
          preservedChatBinding: preservedChat,
          coreAuthority,
          summary: cloneJson(context.summary || {})
        });
        await storeManualCheckpoint(storage, checkpoint);
        operation = await advance(operation, 'checkpointRecord', checkpoint);
      }

      const result = {
        checkpoint: cloneJson(checkpoint),
        activeSaveId: sourceSaveId,
        activeChatId
      };
      await advance(operation, 'complete', result);
      return result;
    },

    async loadGame({
      campaignId,
      checkpointId,
      targetSaveId = createId('save'),
      operationId = createId('checkpoint-load')
    } = {}) {
      const campaign = requireString(campaignId, 'campaignId');
      const checkpoint = await requireManualCheckpoint(storage, {
        campaignId: campaign,
        checkpointId: requireString(checkpointId, 'checkpointId')
      });
      const saveId = requireString(targetSaveId, 'targetSaveId');
      let operation = await operationFor({
        operationId: requireString(operationId, 'operationId'),
        campaignId: campaign,
        operationKind: 'load',
        checkpointId: checkpoint.id,
        sourceSaveId: checkpoint.sourceSaveId,
        targetSaveId: saveId
      });
      if (operation.status === 'complete') return cloneJson(operation.results.complete);

      if (!operation.results.sourceGuard) {
        operation = await advance(operation, 'sourceGuard', {
          checkpointId: checkpoint.id,
          immutable: checkpoint.immutable === true
        });
      }

      let playableChat = operation.results.chatClone;
      if (!playableChat) {
        playableChat = await chat.cloneCampaignChat({
          sourceChatId: checkpoint.preservedChatBinding.chatId,
          sourceBinding: cloneJson(checkpoint.preservedChatBinding),
          campaignId: campaign,
          saveId,
          targetName: `${checkpoint.name} - Continue`,
          open: false
        });
        requireString(playableChat?.chatId, 'playable chatId');
        operation = await advance(operation, 'chatClone', playableChat);
      }

      let coreResult = operation.results.coreAuthority;
      if (!coreResult) {
        coreResult = await core.forkCheckpoint({
          checkpoint: cloneJson(checkpoint),
          targetSaveId: saveId,
          targetChatId: playableChat.chatId
        });
        operation = await advance(operation, 'coreAuthority', coreResult);
      }

      let activated = operation.results.bindingWrite;
      if (!activated) {
        activated = await activateTimeline({
          checkpoint: cloneJson(checkpoint),
          targetSaveId: saveId,
          chatBinding: cloneJson(playableChat),
          coreResult: cloneJson(coreResult)
        });
        operation = await advance(operation, 'bindingWrite', activated);
      }

      let prompt = operation.results.promptRebuild;
      if (!prompt) {
        prompt = await rebuildPrompt({
          checkpoint: cloneJson(checkpoint),
          targetSaveId: saveId,
          chatBinding: cloneJson(playableChat),
          activated: cloneJson(activated)
        });
        operation = await advance(operation, 'promptRebuild', prompt);
      }

      let opened = operation.results.openChat;
      if (!opened) {
        opened = await chat.openCampaignChat(cloneJson(playableChat));
        operation = await advance(operation, 'openChat', opened);
      }

      const result = {
        checkpointId: checkpoint.id,
        activeSaveId: saveId,
        playableChat: cloneJson(playableChat),
        campaignState: cloneJson(activated?.campaignState || coreResult?.campaignState || null),
        prompt: cloneJson(prompt),
        opened: cloneJson(opened)
      };
      await advance(operation, 'complete', result);
      return result;
    },

    async deleteGame({
      campaignId,
      checkpointId,
      operationId = createId('checkpoint-delete')
    } = {}) {
      const campaign = requireString(campaignId, 'campaignId');
      const checkpoint = await requireManualCheckpoint(storage, {
        campaignId: campaign,
        checkpointId: requireString(checkpointId, 'checkpointId')
      });
      let operation = await operationFor({
        operationId: requireString(operationId, 'operationId'),
        campaignId: campaign,
        operationKind: 'delete',
        checkpointId: checkpoint.id,
        sourceSaveId: checkpoint.sourceSaveId
      });
      if (operation.status === 'complete') return cloneJson(operation.results.complete);

      if (!operation.results.sourceGuard) {
        operation = await advance(operation, 'sourceGuard', {
          checkpointId: checkpoint.id,
          activeTimelineUnaffected: true
        });
      }
      if (!operation.results.chatClone) {
        const chatResult = typeof chat.deleteCampaignChat === 'function'
          ? await chat.deleteCampaignChat(cloneJson(checkpoint.preservedChatBinding))
          : { deleted: false, reason: 'chat-delete-unavailable' };
        operation = await advance(operation, 'chatClone', chatResult);
      }
      if (!operation.results.coreAuthority) {
        const coreResult = typeof core.deleteCheckpointAuthority === 'function'
          ? await core.deleteCheckpointAuthority({ checkpoint: cloneJson(checkpoint) })
          : { deleted: false, reason: 'core-delete-unavailable' };
        operation = await advance(operation, 'coreAuthority', coreResult);
      }
      const deletion = await deleteManualCheckpoint(storage, {
        campaignId: campaign,
        checkpointId: checkpoint.id
      });
      operation = await advance(operation, 'checkpointRecord', deletion);
      const result = {
        checkpointId: checkpoint.id,
        deleted: deletion.deleted === true || deletion.indexed === true,
        chat: cloneJson(operation.results.chatClone),
        core: cloneJson(operation.results.coreAuthority)
      };
      await advance(operation, 'complete', result);
      return result;
    }
  };
}
