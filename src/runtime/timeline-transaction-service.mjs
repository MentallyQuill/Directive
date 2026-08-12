import { createV1CampaignSave } from '../storage/v1-storage-repository.mjs';
import { hashStableJson } from './v1-host-message-contracts.mjs';
import { reconstructV1BranchState, rebindV1CampaignStateCustody } from './v1-branch-reconstruction.mjs';
import { V1_TIMELINE_OPERATION_STAGES } from './timeline-operation-journal.mjs';

const STAGE_INDEX = new Map(V1_TIMELINE_OPERATION_STAGES.map((stage, index) => [stage, index]));
const CAMPAIGN_TIMELINE_LEASES = new Map();

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

function exactChatBindingMatches(expected, actual, { requireCampaignBinding = true } = {}) {
  if (!expected || !actual) return false;
  const fields = requireCampaignBinding
    ? ['hostId', 'campaignId', 'saveId', 'chatId', 'entityType', 'entityId', 'entityName']
    : ['hostId', 'chatId', 'entityType', 'entityId', 'entityName'];
  return fields.every((field) => {
    const expectedValue = compact(expected[field]);
    const actualValue = compact(actual[field]);
    return Boolean(expectedValue && actualValue && expectedValue === actualValue);
  });
}

export async function withCampaignTimelineLease(campaignId, task, {
  lockManager = globalThis.navigator?.locks || null
} = {}) {
  const id = compact(campaignId);
  if (!id || typeof task !== 'function') {
    throw new TypeError('A campaign timeline lease requires a campaign id and task.');
  }
  const leaseName = `directive.timeline.${id}`;
  if (typeof lockManager?.request === 'function') {
    return lockManager.request(leaseName, { mode: 'exclusive' }, task);
  }
  const previous = CAMPAIGN_TIMELINE_LEASES.get(leaseName) || Promise.resolve();
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const queued = previous.then(() => held, () => held);
  CAMPAIGN_TIMELINE_LEASES.set(leaseName, queued);
  await previous.catch(() => null);
  try {
    return await task();
  } finally {
    release();
    if (CAMPAIGN_TIMELINE_LEASES.get(leaseName) === queued) CAMPAIGN_TIMELINE_LEASES.delete(leaseName);
  }
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
    if (typeof afterStage === 'function') {
      try {
        await afterStage(stage, clone(next));
      } catch (error) {
        error.directiveTimelineStagePersisted = true;
        throw error;
      }
    }
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
        verifiedBranchIntent: lineage.verifiedBranchIntent
          ? { ...clone(lineage.verifiedBranchIntent), verifiedByDirective: true }
          : null,
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
      const rechecked = await chat.inspectNativeBranchCandidate({
        parentBinding: operation.parentBinding,
        branchIntent: operation.verifiedBranchIntent || null
      });
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

  async function openExactChild(operation, { requireCampaignBinding = true } = {}) {
    const opened = await chat.openCampaignChat?.(operation.childBinding);
    const currentBinding = chat.getCurrentBinding?.();
    if (opened === false || !exactChatBindingMatches(operation.childBinding, currentBinding, { requireCampaignBinding })) {
      throw transactionError(
        'DIRECTIVE_LOAD_GAME_CHILD_OPEN_FAILED',
        'Directive could not open the new playable timeline chat.',
        { expectedBinding: operation.childBinding, currentBinding }
      );
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
    if (selected.campaignId !== parentSave.campaignId) {
      throw transactionError(
        'DIRECTIVE_LOAD_GAME_CAMPAIGN_MISMATCH',
        'The selected saved game belongs to a different campaign.',
        { activeCampaignId: parentSave.campaignId, selectedCampaignId: selected.campaignId }
      );
    }
    if (selected.packageId !== parentSave.packageId || selected.packageVersion !== parentSave.packageVersion) {
      throw transactionError(
        'DIRECTIVE_LOAD_GAME_PACKAGE_MISMATCH',
        'The selected saved game does not match the active campaign package.',
        {
          activePackageId: parentSave.packageId,
          activePackageVersion: parentSave.packageVersion,
          selectedPackageId: selected.packageId,
          selectedPackageVersion: selected.packageVersion
        }
      );
    }
    if (selected.state.campaignChatBinding?.transcriptAttestation) {
      if (typeof chat.verifyCampaignChatSnapshot !== 'function') {
        throw transactionError(
          'DIRECTIVE_LOAD_GAME_CHAT_ATTESTATION_UNAVAILABLE',
          'The host cannot verify this saved game transcript before loading it.'
        );
      }
      const verifiedSnapshot = await chat.verifyCampaignChatSnapshot(selected.state.campaignChatBinding);
      if (verifiedSnapshot?.ok !== true) {
        throw transactionError(
          'DIRECTIVE_LOAD_GAME_CHAT_ATTESTATION_MISMATCH',
          'The saved game transcript changed after the game state was saved.',
          { verification: verifiedSnapshot || null }
        );
      }
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
    if (!operation.parentCheckpointBinding) {
      if (typeof chat.cloneCampaignChat !== 'function') {
        throw transactionError('DIRECTIVE_LOAD_GAME_PARENT_CLONE_UNAVAILABLE', 'The host cannot preserve the current timeline chat before loading another save.');
      }
      const clonedParent = await chat.cloneCampaignChat({
        sourceChatId: parentState.campaignChatBinding.chatId,
        targetName: `${parentState.campaign.title} - ${suggestedName} save`,
        open: false,
        campaignId: parentSave.campaignId,
        saveId: parentSave.id,
        sourceBinding: parentState.campaignChatBinding
      });
      const nextOperation = {
        ...operation,
        parentCheckpointBinding: {
          ...clone(clonedParent),
          kind: 'directive.campaignChatBinding.v1', version: 1,
          campaignId: parentSave.campaignId, saveId: parentSave.id,
          chatId: compact(clonedParent.chatId), status: 'bound', boundAt: now()
        },
        updatedAt: now()
      };
      try {
        await controller.storeTimelineOperation(nextOperation);
        operation = nextOperation;
      } catch (error) {
        try {
          await chat.deleteCampaignChat?.(nextOperation.parentCheckpointBinding);
        } catch {
          // The active pointer has not moved; fail closed if host compensation is uncertain.
        }
        throw error;
      }
    }
    if (!stageAtLeast(operation, 'parent-preserved')) {
      const checkpointState = rebindV1CampaignStateCustody({
        campaignState: parentState,
        targetSaveId: parentSave.id,
        targetChatBinding: operation.parentCheckpointBinding,
        runtimeAssets
      }).campaignState;
      const saved = await controller.prepareTimelineCheckpoint({
        checkpointId: operation.checkpointId, name: suggestedName, campaignState: checkpointState
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
      try {
        operation = await checkpointStage(operation, 'child-chat-cloned');
      } catch (error) {
        if (error?.directiveTimelineStagePersisted !== true) {
          try {
            await chat.deleteCampaignChat?.(operation.childBinding);
          } catch {
            // The operation remains uncommitted and fail-closed if host compensation is uncertain.
          }
        }
        throw error;
      }
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
      if (operation.childBinding?.transcriptAttestation) {
        const verifiedChild = await chat.verifyCampaignChatSnapshot?.(operation.childBinding);
        if (verifiedChild?.ok !== true) {
          throw transactionError(
            'DIRECTIVE_LOAD_GAME_CHILD_ATTESTATION_MISMATCH',
            'The new playable timeline chat changed before activation.',
            { verification: verifiedChild || null }
          );
        }
      }
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

  function schedule(campaignId, task) {
    const run = () => withCampaignTimelineLease(campaignId, task);
    const running = queue.then(run, run);
    queue = running.catch(() => null);
    return running;
  }

  async function recoverOperation(campaignId) {
    const operation = await controller.loadTimelineOperation({ campaignId });
    if (!operation || operation.stage === 'completed') return null;
    await prompt?.clear?.({ reason: 'recovering-timeline-operation' });
    const index = await controller.getStorageIndex();
    const pointerCommitted = index.activeSaveId === operation.childSaveId;
    if (!pointerCommitted && index.activeSaveId !== operation.parentSaveId) {
      throw transactionError('DIRECTIVE_TIMELINE_RECOVERY_POINTER_CONFLICT', 'The active save pointer belongs to neither side of the incomplete operation.', { operation, activeSaveId: index.activeSaveId });
    }
    if (stageAtLeast(operation, 'active-pointer-switched') || pointerCommitted) {
      const childSave = await controller.loadSaveRecord({ saveId: operation.childSaveId });
      setState(childSave.state);
      configureRuntime?.();
      let recovered = operation;
      if (!stageAtLeast(recovered, 'active-pointer-switched')) recovered = await checkpointStage(recovered, 'active-pointer-switched');
      if (!stageAtLeast(recovered, 'prompt-ready')) {
        await openExactChild(recovered);
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
    if (operation.operationType === 'load-game') return executeLoadGame(operation.selectedSavedGameId);
    await openExactChild(operation, { requireCampaignBinding: false });
    const lineage = await chat.inspectNativeBranchCandidate({
      parentBinding: operation.parentBinding,
      branchIntent: operation.verifiedBranchIntent || null
    });
    if (!lineage.ok || lineage.lineageHash !== operation.lineageHash) {
      throw transactionError('DIRECTIVE_TIMELINE_RECOVERY_UNPROVEN', 'The incomplete timeline operation cannot be recovered from the exact journaled child chat.', { operation, lineage });
    }
    return executeNativeBranch(lineage);
  }

  return {
    adoptNativeBranch(lineage) {
      const campaignId = compact(lineage?.parentBinding?.campaignId || controller.getActiveSave()?.campaignId);
      return schedule(campaignId, () => executeNativeBranch(lineage));
    },
    loadGame({ savedGameId } = {}) {
      const campaignId = compact(controller.getActiveSave()?.campaignId || getState()?.campaign?.id);
      return schedule(campaignId, () => executeLoadGame(compact(savedGameId)));
    },
    recoverActiveOperation({ campaignId } = {}) {
      const id = compact(campaignId);
      return schedule(id, () => recoverOperation(id));
    }
  };
}
