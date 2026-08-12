import { createV1CampaignSave } from '../storage/v1-storage-repository.mjs';
import { hashStableJson } from './v1-host-message-contracts.mjs';
import { reconstructV1BranchState, rebindV1CampaignStateCustody } from './v1-branch-reconstruction.mjs';
import { V1_TIMELINE_OPERATION_STAGES } from './timeline-operation-journal.mjs';

const STAGE_INDEX = new Map(V1_TIMELINE_OPERATION_STAGES.map((stage, index) => [stage, index]));

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function compact(value) {
  return String(value ?? '').trim();
}

function stageAtLeast(operation, stage) {
  return (STAGE_INDEX.get(operation?.stage) ?? -1) >= STAGE_INDEX.get(stage);
}

function transactionError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = clone(details);
  return error;
}

export function suggestPreviousTimelineName(campaignState = {}, runtimeAssets = {}) {
  const definitionId = campaignState?.mission?.v1?.definitionId;
  const definition = (runtimeAssets.missionDefinitions || []).find((entry) => entry.id === definitionId);
  const mission = compact(definition?.title || campaignState?.mission?.activeMissionId || 'Previous Timeline');
  const stardate = campaignState?.campaign?.currentStardate;
  if (Number.isFinite(stardate)) return `${mission} — Stardate ${stardate}`;
  return `${mission} — ${new Date().toLocaleString()}`;
}

export function createTimelineTransactionService({
  controller,
  chat,
  prompt,
  getState,
  setState,
  configureRuntime,
  rebuildPrompt,
  runtimeAssets,
  idFactory = null,
  now = () => new Date().toISOString(),
  afterStage = null
} = {}) {
  if (!controller || !chat || typeof getState !== 'function' || typeof setState !== 'function') {
    throw new TypeError('Timeline transactions require controller, chat, getState, and setState.');
  }
  let sequence = 0;
  let queue = Promise.resolve();
  const nextId = (prefix) => typeof idFactory === 'function'
    ? idFactory(prefix)
    : `${prefix}.${Date.now()}.${++sequence}`;

  async function checkpointStage(operation, stage, diagnostics = null) {
    const next = {
      ...clone(operation),
      stage,
      updatedAt: now(),
      diagnostics: diagnostics ? { ...(operation.diagnostics || {}), ...clone(diagnostics) } : clone(operation.diagnostics || {})
    };
    await controller.storeTimelineOperation(next);
    if (typeof afterStage === 'function') await afterStage(stage, clone(next));
    return next;
  }

  async function executeNativeBranch(lineage) {
    const parentSave = controller.getActiveSave();
    const parentState = clone(getState());
    if (!parentSave || !parentState || parentSave.id !== parentState.campaignChatBinding?.saveId) {
      throw transactionError('DIRECTIVE_TIMELINE_PARENT_UNAVAILABLE', 'The active campaign timeline is not exact.');
    }
    const createdAt = now();
    const operationId = `timeline.${hashStableJson({
      campaignId: parentSave.campaignId,
      parentSaveId: parentSave.id,
      parentChatId: parentState.campaignChatBinding.chatId,
      childChatId: lineage.childBinding.chatId,
      lineageHash: lineage.lineageHash
    })}`;
    let operation = await controller.loadTimelineOperation({ campaignId: parentSave.campaignId });
    if (operation?.operationId !== operationId) {
      if (operation && operation.stage !== 'completed') {
        throw transactionError('DIRECTIVE_TIMELINE_OPERATION_CONFLICT', 'Another timeline operation requires recovery.', { operationId: operation.operationId });
      }
      const childSaveId = nextId('save');
      operation = {
        kind: 'directive.timelineOperation.v1',
        version: 1,
        operationId,
        operationType: 'native-branch',
        campaignId: parentSave.campaignId,
        stage: 'detected',
        parentSaveId: parentSave.id,
        childSaveId,
        checkpointId: nextId('checkpoint'),
        parentBinding: clone(parentState.campaignChatBinding),
        childBinding: {
          kind: 'directive.campaignChatBinding.v1',
          version: 1,
          hostId: lineage.childBinding.hostId || lineage.parentBinding.hostId,
          campaignId: parentSave.campaignId,
          saveId: childSaveId,
          chatId: lineage.childBinding.chatId,
          entityType: lineage.childBinding.entityType || lineage.parentBinding.entityType || null,
          entityId: lineage.childBinding.entityId || lineage.parentBinding.entityId || null,
          entityName: lineage.childBinding.entityName || lineage.parentBinding.entityName || null,
          chatName: lineage.childBinding.chatName || null,
          status: 'bound',
          boundAt: createdAt
        },
        lineageHash: lineage.lineageHash,
        createdAt,
        updatedAt: createdAt,
        diagnostics: {}
      };
      await prompt?.clear?.({ reason: 'preparing-native-branch-timeline' });
      await controller.storeTimelineOperation(operation);
      if (typeof afterStage === 'function') await afterStage('detected', clone(operation));
    } else {
      await prompt?.clear?.({ reason: 'recovering-native-branch-timeline' });
    }

    const suggestedName = suggestPreviousTimelineName(parentState, runtimeAssets);
    if (!stageAtLeast(operation, 'parent-preserved')) {
      const saved = await controller.prepareTimelineCheckpoint({
        checkpointId: operation.checkpointId,
        name: suggestedName,
        campaignState: parentState
      });
      operation = await checkpointStage(operation, 'parent-preserved', { suggestedName: saved.name });
    }

    let childSave = null;
    if (!stageAtLeast(operation, 'child-persisted')) {
      const rebuilt = await reconstructV1BranchState({
        parentState,
        parentMessages: lineage.parentMessages,
        childMessages: lineage.childMessages,
        lineageHash: lineage.lineageHash,
        targetSaveId: operation.childSaveId,
        targetChatBinding: operation.childBinding,
        runtimeAssets,
        now
      });
      operation = await checkpointStage(operation, 'child-derived', {
        discardedHostMessageCount: rebuilt.discardedHostMessageIds.length,
        retainedSourceCount: rebuilt.retainedSourceCount
      });
      childSave = createV1CampaignSave({
        id: operation.childSaveId,
        name: parentSave.name,
        state: rebuilt.campaignState,
        createdAt,
        updatedAt: operation.updatedAt
      });
      await controller.persistInactiveTimeline({ save: childSave });
      operation = await checkpointStage(operation, 'child-persisted');
    } else {
      childSave = await controller.loadSaveRecord({ saveId: operation.childSaveId });
    }

    if (!stageAtLeast(operation, 'child-binding-written')) {
      await chat.updateBindingMetadata(operation.childBinding);
      operation = await checkpointStage(operation, 'child-binding-written');
    }

    if (!stageAtLeast(operation, 'active-pointer-switched')) {
      const rechecked = await chat.inspectNativeBranchCandidate({ parentBinding: operation.parentBinding });
      if (!rechecked.ok || rechecked.lineageHash !== operation.lineageHash || compact(chat.getCurrentChatId?.()) !== operation.childBinding.chatId) {
        throw transactionError('DIRECTIVE_TIMELINE_LINEAGE_CHANGED', 'The native branch changed while Directive was preparing it.', { rechecked });
      }
      const index = await controller.getStorageIndex();
      if (index.activeSaveId === operation.childSaveId) {
        await controller.activatePersistedTimeline({ expectedSaveId: operation.childSaveId, nextSaveId: operation.childSaveId });
      } else {
        await controller.activatePersistedTimeline({ expectedSaveId: operation.parentSaveId, nextSaveId: operation.childSaveId });
      }
      operation = await checkpointStage(operation, 'active-pointer-switched');
    }

    childSave = await controller.loadSaveRecord({ saveId: operation.childSaveId });
    setState(childSave.state);
    configureRuntime?.();
    if (!stageAtLeast(operation, 'prompt-ready')) {
      await rebuildPrompt?.();
      operation = await checkpointStage(operation, 'prompt-ready');
    }
    if (!stageAtLeast(operation, 'parent-record-retired')) {
      await controller.retireSupersededTimeline({ saveId: operation.parentSaveId });
      operation = await checkpointStage(operation, 'parent-record-retired');
    }
    if (!stageAtLeast(operation, 'completed')) operation = await checkpointStage(operation, 'completed');
    return {
      status: 'activated',
      operationId: operation.operationId,
      savedGameId: operation.checkpointId,
      childSaveId: operation.childSaveId,
      suggestedName: operation.diagnostics.suggestedName || suggestedName,
      stage: operation.stage
    };
  }

  async function openExactChild(operation) {
    const opened = await chat.openCampaignChat?.(operation.childBinding);
    if (opened === false || compact(chat.getCurrentChatId?.()) !== operation.childBinding.chatId) {
      throw transactionError('DIRECTIVE_LOAD_GAME_CHILD_OPEN_FAILED', 'Directive could not open the new playable timeline chat.');
    }
  }

  async function executeLoadGame(savedGameId) {
    const parentSave = controller.getActiveSave();
    const parentState = clone(getState());
    const selected = await controller.loadSaveRecord({ saveId: savedGameId });
    if (selected.slotType !== 'checkpoint') {
      throw transactionError('DIRECTIVE_LOAD_GAME_SAVE_REQUIRED', 'Load Game requires an immutable saved game.');
    }
    const sourceChatId = compact(selected.state?.campaignChatBinding?.chatId);
    if (!sourceChatId) throw transactionError('DIRECTIVE_LOAD_GAME_CHAT_REQUIRED', 'The selected saved game has no exact preserved chat.');
    if (!parentSave || !parentState || parentSave.id !== parentState.campaignChatBinding?.saveId) {
      throw transactionError('DIRECTIVE_TIMELINE_PARENT_UNAVAILABLE', 'The current timeline is not exact enough to preserve.');
    }
    const createdAt = now();
    const operationId = `timeline.${hashStableJson({
      operationType: 'load-game', campaignId: parentSave.campaignId, parentSaveId: parentSave.id,
      selectedSavedGameId: selected.id, selectedUpdatedAt: selected.updatedAt
    })}`;
    let operation = await controller.loadTimelineOperation({ campaignId: parentSave.campaignId });
    if (operation?.operationId !== operationId) {
      if (operation && operation.stage !== 'completed') {
        throw transactionError('DIRECTIVE_TIMELINE_OPERATION_CONFLICT', 'Another timeline operation requires recovery.', { operationId: operation.operationId });
      }
      const childSaveId = nextId('save');
      operation = {
        kind: 'directive.timelineOperation.v1', version: 1, operationId, operationType: 'load-game',
        campaignId: parentSave.campaignId, stage: 'detected', parentSaveId: parentSave.id,
        childSaveId, checkpointId: nextId('checkpoint'), selectedSavedGameId: selected.id,
        parentBinding: clone(parentState.campaignChatBinding),
        childBinding: {
          kind: 'directive.campaignChatBinding.v1', version: 1, hostId: selected.state.campaignChatBinding?.hostId || null,
          campaignId: parentSave.campaignId, saveId: childSaveId, chatId: null, status: 'unbound'
        },
        lineageHash: hashStableJson({ selectedSaveId: selected.id, selectedState: selected.state }),
        createdAt, updatedAt: createdAt, diagnostics: { selectedSavedGameId: selected.id }
      };
      await prompt?.clear?.({ reason: 'preparing-load-game-timeline' });
      await controller.storeTimelineOperation(operation);
      if (typeof afterStage === 'function') await afterStage('detected', clone(operation));
    } else {
      await prompt?.clear?.({ reason: 'recovering-load-game-timeline' });
    }

    const suggestedName = suggestPreviousTimelineName(parentState, runtimeAssets);
    if (!stageAtLeast(operation, 'parent-preserved')) {
      const saved = await controller.prepareTimelineCheckpoint({
        checkpointId: operation.checkpointId, name: suggestedName, campaignState: parentState
      });
      operation = await checkpointStage(operation, 'parent-preserved', { suggestedName: saved.name });
    }
    if (!stageAtLeast(operation, 'child-chat-cloned')) {
      if (typeof chat.cloneCampaignChat !== 'function') {
        throw transactionError('DIRECTIVE_LOAD_GAME_CLONE_UNAVAILABLE', 'The host cannot clone the selected saved game chat.');
      }
      const cloned = await chat.cloneCampaignChat({
        sourceChatId,
        targetName: `${selected.state.campaign.title} - ${selected.name} continuation`,
        open: false,
        campaignId: selected.campaignId,
        saveId: operation.childSaveId,
        sourceBinding: selected.state.campaignChatBinding
      });
      operation = {
        ...operation,
        childBinding: {
          ...clone(cloned),
          kind: 'directive.campaignChatBinding.v1', version: 1,
          campaignId: selected.campaignId, saveId: operation.childSaveId,
          chatId: compact(cloned.chatId), status: 'bound', boundAt: now()
        }
      };
      operation = await checkpointStage(operation, 'child-chat-cloned');
    }
    let childSave;
    if (!stageAtLeast(operation, 'child-persisted')) {
      const rebound = rebindV1CampaignStateCustody({
        campaignState: selected.state,
        targetSaveId: operation.childSaveId,
        targetChatBinding: operation.childBinding,
        runtimeAssets
      });
      operation = await checkpointStage(operation, 'child-derived');
      childSave = createV1CampaignSave({
        id: operation.childSaveId,
        name: parentSave.name,
        state: rebound.campaignState,
        createdAt,
        updatedAt: operation.updatedAt
      });
      await controller.persistInactiveTimeline({ save: childSave });
      operation = await checkpointStage(operation, 'child-persisted');
    } else childSave = await controller.loadSaveRecord({ saveId: operation.childSaveId });

    if (!stageAtLeast(operation, 'child-binding-written')) {
      // cloneCampaignChat persisted this exact binding inside the unopened child snapshot.
      operation = await checkpointStage(operation, 'child-binding-written');
    }
    if (!stageAtLeast(operation, 'active-pointer-switched')) {
      const index = await controller.getStorageIndex();
      await controller.activatePersistedTimeline({
        expectedSaveId: index.activeSaveId === operation.childSaveId ? operation.childSaveId : operation.parentSaveId,
        nextSaveId: operation.childSaveId
      });
      operation = await checkpointStage(operation, 'active-pointer-switched');
    }
    childSave = await controller.loadSaveRecord({ saveId: operation.childSaveId });
    setState(childSave.state);
    configureRuntime?.();
    if (!stageAtLeast(operation, 'prompt-ready')) {
      await openExactChild(operation);
      await rebuildPrompt?.();
      operation = await checkpointStage(operation, 'prompt-ready');
    }
    if (!stageAtLeast(operation, 'parent-record-retired')) {
      await controller.retireSupersededTimeline({ saveId: operation.parentSaveId });
      operation = await checkpointStage(operation, 'parent-record-retired');
    }
    if (!stageAtLeast(operation, 'completed')) operation = await checkpointStage(operation, 'completed');
    return {
      status: 'activated', operationId: operation.operationId, savedGameId: operation.checkpointId,
      selectedSavedGameId: selected.id, childSaveId: operation.childSaveId,
      suggestedName: operation.diagnostics.suggestedName || suggestedName, stage: operation.stage
    };
  }

  return {
    adoptNativeBranch(lineage) {
      const task = () => executeNativeBranch(lineage);
      const running = queue.then(task, task);
      queue = running.catch(() => null);
      return running;
    },
    loadGame({ savedGameId } = {}) {
      const task = () => executeLoadGame(compact(savedGameId));
      const running = queue.then(task, task);
      queue = running.catch(() => null);
      return running;
    },
    async recoverActiveOperation({ campaignId } = {}) {
      const operation = await controller.loadTimelineOperation({ campaignId });
      if (!operation || operation.stage === 'completed') return null;
      await prompt?.clear?.({ reason: 'recovering-timeline-operation' });
      if (stageAtLeast(operation, 'active-pointer-switched')) {
        const childSave = await controller.loadSaveRecord({ saveId: operation.childSaveId });
        setState(childSave.state);
        configureRuntime?.();
        let recovered = operation;
        if (!stageAtLeast(recovered, 'prompt-ready')) {
          if (recovered.operationType === 'load-game') await openExactChild(recovered);
          await rebuildPrompt?.();
          recovered = await checkpointStage(recovered, 'prompt-ready');
        }
        if (!stageAtLeast(recovered, 'parent-record-retired')) {
          await controller.retireSupersededTimeline({ saveId: recovered.parentSaveId });
          recovered = await checkpointStage(recovered, 'parent-record-retired');
        }
        if (!stageAtLeast(recovered, 'completed')) recovered = await checkpointStage(recovered, 'completed');
        return {
          status: 'recovered',
          operationId: recovered.operationId,
          savedGameId: recovered.checkpointId,
          childSaveId: recovered.childSaveId,
          suggestedName: recovered.diagnostics?.suggestedName || null,
          stage: recovered.stage
        };
      }
      if (operation.operationType === 'load-game') return this.loadGame({ savedGameId: operation.selectedSavedGameId });
      const lineage = await chat.inspectNativeBranchCandidate({ parentBinding: operation.parentBinding });
      if (!lineage.ok || lineage.lineageHash !== operation.lineageHash) {
        throw transactionError('DIRECTIVE_TIMELINE_RECOVERY_UNPROVEN', 'The incomplete timeline operation cannot be recovered from the current chat.', { operation, lineage });
      }
      return this.adoptNativeBranch(lineage);
    }
  };
}
