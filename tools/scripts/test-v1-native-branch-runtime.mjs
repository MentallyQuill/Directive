import assert from 'node:assert/strict';

import {
  createFakeChatAdapter,
  createFakeDirectiveHost,
  createFakeJsonStorage,
  createFakePromptAdapter
} from '../../src/hosts/fake/fake-host.mjs';
import { V1_CAMPAIGN_LIBRARY_TEASERS } from '../../src/packages/bundled-package-registry.mjs';
import { createCampaignStartController } from '../../src/runtime/campaign-start-controller.mjs';
import { createDirectiveRuntimeApp } from '../../src/runtime/runtime-app.mjs';
import {
  createTimelineTransactionService,
  withCampaignTimelineLease
} from '../../src/runtime/timeline-transaction-service.mjs';
import {
  createV1CampaignSave,
  getV1StorageIndex,
  listV1CampaignSaves,
  loadV1CampaignSave,
  storeV1CampaignSave
} from '../../src/storage/v1-storage-repository.mjs';
import { createAshesInitialState, loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

const assets = loadAshesRuntimeAssets();
const records = { ...assets, campaignLibrary: V1_CAMPAIGN_LIBRARY_TEASERS };
const fixedNow = '2026-08-11T12:00:00.000Z';

const leaseOrder = [];
let releaseFirstLease;
let reportFirstLeaseEntered;
const firstLeaseEntered = new Promise((resolve) => { reportFirstLeaseEntered = resolve; });
const firstLeaseRelease = new Promise((resolve) => { releaseFirstLease = resolve; });
const firstLease = withCampaignTimelineLease('campaign.shared-lease', async () => {
  leaseOrder.push('first-enter');
  reportFirstLeaseEntered();
  await firstLeaseRelease;
  leaseOrder.push('first-exit');
});
await firstLeaseEntered;
let secondLeaseEntered = false;
const secondLease = withCampaignTimelineLease('campaign.shared-lease', async () => {
  secondLeaseEntered = true;
  leaseOrder.push('second-enter');
});
await new Promise((resolve) => setImmediate(resolve));
assert.equal(secondLeaseEntered, false, 'separate runtime instances must serialize the same campaign');
releaseFirstLease();
await Promise.all([firstLease, secondLease]);
assert.deepEqual(leaseOrder, ['first-enter', 'first-exit', 'second-enter']);

async function harness({ afterStage = null } = {}) {
  const storage = createFakeJsonStorage();
  const parentState = createAshesInitialState({
    campaignId: 'campaign.branch',
    saveId: 'save.parent',
    chatId: 'chat.parent'
  });
  parentState.campaignChatBinding = {
    ...parentState.campaignChatBinding,
    hostId: 'fake',
    entityType: 'character',
    entityId: '7',
    entityName: 'Ashes of Peace - Sam Vickers'
  };
  const parentSave = createV1CampaignSave({
    id: 'save.parent',
    name: 'Sam Vickers - Ashes of Peace',
    state: parentState,
    createdAt: fixedNow
  });
  await storeV1CampaignSave(storage, parentSave);
  const chat = createFakeChatAdapter({
    chatId: 'chat.parent',
    entityId: '7',
    entityName: 'Ashes of Peace - Sam Vickers',
    messages: [
      { id: 'assistant.1', role: 'assistant', text: 'Opening narration.', isDirectiveOwned: true },
      { id: 'assistant.2', role: 'assistant', text: 'Later narration.', isDirectiveOwned: true }
    ]
  });
  await chat.updateBindingMetadata(parentState.campaignChatBinding);
  chat.createNativeBranch({ endpointIndex: 0, childChatId: 'renamed-native-child' });
  const lineage = await chat.inspectNativeBranchCandidate({ parentBinding: parentState.campaignChatBinding });
  assert.equal(lineage.ok, true);
  const controller = createCampaignStartController({
    adapter: storage,
    packages: [assets.packageData],
    missionDefinitions: assets.missionDefinitions,
    campaignLibrary: V1_CAMPAIGN_LIBRARY_TEASERS,
    idFactory: (() => { let id = 0; return (prefix) => `${prefix}.branch.${++id}`; })(),
    now: () => fixedNow
  });
  await controller.initialize();
  let state = structuredClone(parentState);
  const prompt = createFakePromptAdapter();
  const service = createTimelineTransactionService({
    controller,
    chat,
    prompt,
    getState: () => state,
    setState: (next) => { state = structuredClone(next); },
    configureRuntime() {},
    rebuildPrompt: () => prompt.rebuild({ binding: state.campaignChatBinding, packet: { blocks: [] } }),
    runtimeAssets: assets,
    idFactory: (() => { let id = 0; return (prefix) => `${prefix}.branch.${++id}`; })(),
    now: () => fixedNow,
    afterStage
  });
  return { storage, parentState, chat, lineage, controller, prompt, service, getState: () => state };
}

const stages = [
  'detected', 'parent-preserved', 'child-derived', 'child-persisted',
  'child-binding-written', 'active-pointer-switched', 'prompt-ready',
  'parent-record-retired', 'completed'
];
for (const failedStage of stages) {
  let injected = false;
  const test = await harness({
    afterStage(stage) {
      if (!injected && stage === failedStage) {
        injected = true;
        throw new Error(`injected:${stage}`);
      }
    }
  });
  await assert.rejects(test.service.adoptNativeBranch(test.lineage), new RegExp(`injected:${failedStage}`));
  const beforeRecovery = await getV1StorageIndex(test.storage);
  const committed = stages.indexOf(failedStage) >= stages.indexOf('active-pointer-switched');
  assert.equal(beforeRecovery.activeSaveId === 'save.parent', !committed, `${failedStage} commit boundary`);
  if (failedStage === 'detected') {
    test.chat.setCurrentChatId(test.parentState.campaignChatBinding.chatId);
    assert.equal(test.chat.getCurrentChatId(), 'chat.parent');
  }

  const recovery = createTimelineTransactionService({
    controller: test.controller,
    chat: test.chat,
    prompt: test.prompt,
    getState: test.getState,
    setState: (next) => { const current = test.getState(); Object.keys(current).forEach((key) => delete current[key]); Object.assign(current, structuredClone(next)); },
    configureRuntime() {},
    rebuildPrompt: () => test.prompt.rebuild({ binding: test.getState().campaignChatBinding, packet: { blocks: [] } }),
    runtimeAssets: assets,
    now: () => fixedNow
  });
  await recovery.recoverActiveOperation({ campaignId: 'campaign.branch' });
  const finalIndex = await getV1StorageIndex(test.storage);
  assert.notEqual(finalIndex.activeSaveId, 'save.parent', `${failedStage} recovers to child`);
  await assert.rejects(loadV1CampaignSave(test.storage, 'save.parent'), /not found/i);
  const summaries = await listV1CampaignSaves(test.storage);
  assert.equal(summaries.filter((save) => save.slotType === 'checkpoint').length, 1);
}

let pendingOperationInjected = false;
const pendingOperation = await harness({
  afterStage(stage) {
    if (!pendingOperationInjected && stage === 'detected') {
      pendingOperationInjected = true;
      throw new Error('injected:pending-operation');
    }
  }
});
await assert.rejects(pendingOperation.service.adoptNativeBranch(pendingOperation.lineage), /injected:pending-operation/);
let unrelatedMutationRan = false;
await assert.rejects(
  pendingOperation.service.runExclusive({
    campaignId: 'campaign.branch',
    task: async () => { unrelatedMutationRan = true; }
  }),
  (error) => error?.code === 'DIRECTIVE_TIMELINE_OPERATION_CONFLICT'
);
assert.equal(unrelatedMutationRan, false, 'Save, rename, and delete mutations must not cross a pending recovery journal');

const staleBranchRuntime = await harness();
const externallyRevisedBranchSave = await loadV1CampaignSave(staleBranchRuntime.storage, 'save.parent');
externallyRevisedBranchSave.state.settings.simulationMode = 'Exploration';
externallyRevisedBranchSave.state.stateCustody.revision += 1;
externallyRevisedBranchSave.state.stateCustody.recentCommitIds.push('test.external-branch-revision');
externallyRevisedBranchSave.updatedAt = '2026-08-11T12:00:01.000Z';
await storeV1CampaignSave(staleBranchRuntime.storage, externallyRevisedBranchSave);
await assert.rejects(
  staleBranchRuntime.service.adoptNativeBranch(staleBranchRuntime.lineage),
  (error) => error?.code === 'DIRECTIVE_TIMELINE_PARENT_STALE'
);
await assert.rejects(
  staleBranchRuntime.service.saveGame({ name: 'Stale runtime save' }),
  (error) => error?.code === 'DIRECTIVE_TIMELINE_PARENT_STALE'
);
assert.equal(
  staleBranchRuntime.chat.calls().filter((call) => call.type === 'cloneCampaignChat').length,
  0,
  'a same-save revision change in another runtime must fail before any branch or save artifact is created'
);

const casJournalFailure = await harness();
const storeOperation = casJournalFailure.controller.storeTimelineOperation;
let failedCommitJournalWrite = false;
casJournalFailure.controller.storeTimelineOperation = async (operation) => {
  if (!failedCommitJournalWrite && operation.stage === 'active-pointer-switched') {
    failedCommitJournalWrite = true;
    throw new Error('injected:commit-journal-write');
  }
  return storeOperation(operation);
};
await assert.rejects(
  casJournalFailure.service.adoptNativeBranch(casJournalFailure.lineage),
  /injected:commit-journal-write/
);
assert.notEqual((await getV1StorageIndex(casJournalFailure.storage)).activeSaveId, 'save.parent');
casJournalFailure.controller.storeTimelineOperation = storeOperation;
const pointerRecovery = createTimelineTransactionService({
  controller: casJournalFailure.controller,
  chat: casJournalFailure.chat,
  prompt: casJournalFailure.prompt,
  getState: casJournalFailure.getState,
  setState: (next) => {
    const current = casJournalFailure.getState();
    Object.keys(current).forEach((key) => delete current[key]);
    Object.assign(current, structuredClone(next));
  },
  configureRuntime() {},
  rebuildPrompt: () => casJournalFailure.prompt.rebuild({ binding: casJournalFailure.getState().campaignChatBinding, packet: { blocks: [] } }),
  runtimeAssets: assets,
  now: () => fixedNow
});
const pointerRecovered = await pointerRecovery.recoverActiveOperation({ campaignId: 'campaign.branch' });
assert.equal(pointerRecovered.status, 'recovered', 'recovery recognizes a committed child even when the commit-stage journal write failed');

let crossRuntimeCommitInjected = false;
const crossRuntimeRecovery = await loadHarness({
  afterStage(stage) {
    if (!crossRuntimeCommitInjected && stage === 'active-pointer-switched') {
      crossRuntimeCommitInjected = true;
      throw new Error('injected:cross-runtime-post-commit');
    }
  }
});
const staleRecoveryController = createCampaignStartController({
  adapter: crossRuntimeRecovery.storage,
  packages: [assets.packageData],
  missionDefinitions: assets.missionDefinitions,
  campaignLibrary: V1_CAMPAIGN_LIBRARY_TEASERS,
  now: () => fixedNow
});
await staleRecoveryController.initialize();
let staleRecoveryState = structuredClone(crossRuntimeRecovery.parentState);
const staleRecoveryService = createTimelineTransactionService({
  controller: staleRecoveryController,
  chat: crossRuntimeRecovery.chat,
  prompt: crossRuntimeRecovery.prompt,
  getState: () => staleRecoveryState,
  setState: (next) => { staleRecoveryState = structuredClone(next); },
  configureRuntime() {},
  rebuildPrompt: () => crossRuntimeRecovery.prompt.rebuild({ binding: staleRecoveryState.campaignChatBinding, packet: { blocks: [] } }),
  runtimeAssets: assets,
  now: () => fixedNow
});
await assert.rejects(
  crossRuntimeRecovery.service.loadGame({ savedGameId: crossRuntimeRecovery.selected.id }),
  /injected:cross-runtime-post-commit/
);
const crossRuntimeRecovered = await staleRecoveryService.recoverActiveOperation({ campaignId: 'campaign.load' });
assert.equal(crossRuntimeRecovered.status, 'recovered');
assert.equal(
  staleRecoveryController.getActiveSave().id,
  crossRuntimeRecovered.childSaveId,
  'post-commit recovery in a second runtime must refresh its cached active save to the committed child'
);

const attestedNativeParent = await harness();
const attestedNativeResult = await attestedNativeParent.service.adoptNativeBranch(attestedNativeParent.lineage);
const nativeParentSavedGame = await loadV1CampaignSave(attestedNativeParent.storage, attestedNativeResult.savedGameId);
assert.equal(
  nativeParentSavedGame.state.campaignChatBinding.transcriptAttestation?.kind,
  'directive.nativeBranchTranscriptAttestation.v1',
  'a native branch must attest the preserved parent chat even though it does not clone that retired chat'
);
const editedNativeParentMessages = attestedNativeParent.chat.messagesForChat('chat.parent');
editedNativeParentMessages[0].text = 'The retired parent chat was edited after branching.';
attestedNativeParent.chat.setMessagesForChat('chat.parent', editedNativeParentMessages);
await assert.rejects(
  attestedNativeParent.service.loadGame({ savedGameId: attestedNativeResult.savedGameId }),
  (error) => error?.code === 'DIRECTIVE_LOAD_GAME_CHAT_ATTESTATION_MISMATCH'
);

let parentMutationInjected = false;
const parentMutationBranch = await harness({
  afterStage(stage) {
    if (!parentMutationInjected && stage === 'child-binding-written') {
      parentMutationInjected = true;
      throw new Error('injected-native:parent-mutation-window');
    }
  }
});
await assert.rejects(
  parentMutationBranch.service.adoptNativeBranch(parentMutationBranch.lineage),
  /injected-native:parent-mutation-window/
);
const mutatedPreservedParent = parentMutationBranch.chat.messagesForChat('chat.parent');
mutatedPreservedParent[1].text = 'The parent suffix changed before the child commit.';
parentMutationBranch.chat.setMessagesForChat('chat.parent', mutatedPreservedParent);
await assert.rejects(
  parentMutationBranch.service.recoverActiveOperation({ campaignId: 'campaign.branch' }),
  (error) => error?.code === 'DIRECTIVE_TIMELINE_PARENT_ATTESTATION_MISMATCH'
);
assert.equal((await getV1StorageIndex(parentMutationBranch.storage)).activeSaveId, 'save.parent');

async function loadHarness({ selectedCampaignId = 'campaign.load', afterStage = null } = {}) {
  const storage = createFakeJsonStorage();
  const parentState = createAshesInitialState({
    campaignId: 'campaign.load',
    saveId: 'save.load-parent',
    chatId: 'chat.load-parent'
  });
  parentState.campaignChatBinding = {
    ...parentState.campaignChatBinding,
    hostId: 'fake',
    entityType: 'character',
    entityId: '7',
    entityName: 'Ashes of Peace - Sam Vickers'
  };
  await storeV1CampaignSave(storage, createV1CampaignSave({
    id: 'save.load-parent',
    name: 'Load Parent',
    state: parentState,
    createdAt: fixedNow
  }));
  const chat = createFakeChatAdapter({
    chatId: 'chat.load-parent',
    entityId: '7',
    entityName: 'Ashes of Peace - Sam Vickers',
    messages: [{ id: 'load.1', role: 'assistant', text: 'Saved transcript.' }]
  });
  await chat.updateBindingMetadata(parentState.campaignChatBinding);
  const selectedSourceSaveId = selectedCampaignId === 'campaign.load'
    ? 'save.selected-source'
    : 'save.other-source';
  const selectedBinding = await chat.cloneCampaignChat({
    sourceChatId: 'chat.load-parent',
    sourceBinding: parentState.campaignChatBinding,
    campaignId: selectedCampaignId,
    saveId: selectedSourceSaveId,
    targetName: `Selected ${selectedCampaignId}`,
    open: false
  });
  const selectedState = createAshesInitialState({
    campaignId: selectedCampaignId,
    saveId: selectedSourceSaveId,
    chatId: selectedBinding.chatId
  });
  selectedState.campaignChatBinding = {
    ...selectedState.campaignChatBinding,
    ...selectedBinding,
    kind: 'directive.campaignChatBinding.v1',
    version: 1,
    campaignId: selectedCampaignId,
    saveId: selectedSourceSaveId,
    status: 'bound'
  };
  const selected = createV1CampaignSave({
    id: selectedCampaignId === 'campaign.load' ? 'checkpoint.selected' : 'checkpoint.other',
    name: 'Selected Save',
    slotType: 'checkpoint',
    parentSaveId: selectedSourceSaveId,
    state: selectedState,
    createdAt: fixedNow
  });
  await storeV1CampaignSave(storage, selected, { makeActive: false });
  const controller = createCampaignStartController({
    adapter: storage,
    packages: [assets.packageData],
    missionDefinitions: assets.missionDefinitions,
    campaignLibrary: V1_CAMPAIGN_LIBRARY_TEASERS,
    idFactory: (() => { let id = 0; return (prefix) => `${prefix}.load.${++id}`; })(),
    now: () => fixedNow
  });
  await controller.initialize();
  let state = structuredClone(parentState);
  const prompt = createFakePromptAdapter();
  const service = createTimelineTransactionService({
    controller,
    chat,
    prompt,
    getState: () => state,
    setState: (next) => { state = structuredClone(next); },
    configureRuntime() {},
    rebuildPrompt: () => prompt.rebuild({ binding: state.campaignChatBinding, packet: { blocks: [] } }),
    runtimeAssets: assets,
    idFactory: (() => { let id = 0; return (prefix) => `${prefix}.load.${++id}`; })(),
    now: () => fixedNow,
    afterStage
  });
  return { storage, parentState, selected, selectedBinding, chat, controller, prompt, service, getState: () => state };
}

const crossCampaignLoad = await loadHarness({ selectedCampaignId: 'campaign.other' });
const crossCampaignStorageBefore = crossCampaignLoad.storage.snapshot();
const crossCampaignChatCallsBefore = crossCampaignLoad.chat.calls().length;
const crossCampaignPromptCallsBefore = crossCampaignLoad.prompt.calls().length;
await assert.rejects(
  crossCampaignLoad.service.loadGame({ savedGameId: crossCampaignLoad.selected.id }),
  (error) => error?.code === 'DIRECTIVE_LOAD_GAME_CAMPAIGN_MISMATCH'
);
assert.deepEqual(crossCampaignLoad.storage.snapshot(), crossCampaignStorageBefore);
assert.equal(crossCampaignLoad.chat.calls().length, crossCampaignChatCallsBefore);
assert.equal(crossCampaignLoad.prompt.calls().length, crossCampaignPromptCallsBefore);

const staleLoadRuntime = await loadHarness();
const externallyRevisedLoadSave = await loadV1CampaignSave(staleLoadRuntime.storage, 'save.load-parent');
externallyRevisedLoadSave.state.settings.simulationMode = 'Exploration';
externallyRevisedLoadSave.state.stateCustody.revision += 1;
externallyRevisedLoadSave.state.stateCustody.recentCommitIds.push('test.external-load-revision');
externallyRevisedLoadSave.updatedAt = '2026-08-11T12:00:01.000Z';
await storeV1CampaignSave(staleLoadRuntime.storage, externallyRevisedLoadSave);
const staleLoadCallsBefore = staleLoadRuntime.chat.calls().length;
await assert.rejects(
  staleLoadRuntime.service.loadGame({ savedGameId: staleLoadRuntime.selected.id }),
  (error) => error?.code === 'DIRECTIVE_TIMELINE_PARENT_STALE'
);
assert.equal(staleLoadRuntime.chat.calls().length, staleLoadCallsBefore, 'stale Load Game must fail before cloning either timeline');

const changedSavedChat = await loadHarness();
const changedMessages = changedSavedChat.chat.messagesForChat(changedSavedChat.selectedBinding.chatId);
changedMessages[0].text = 'Transcript changed after the save was created.';
changedSavedChat.chat.setMessagesForChat(changedSavedChat.selectedBinding.chatId, changedMessages);
const changedStorageBefore = changedSavedChat.storage.snapshot();
const changedChatCallsBefore = changedSavedChat.chat.calls().length;
await assert.rejects(
  changedSavedChat.service.loadGame({ savedGameId: changedSavedChat.selected.id }),
  (error) => error?.code === 'DIRECTIVE_LOAD_GAME_CHAT_ATTESTATION_MISMATCH'
);
assert.deepEqual(changedSavedChat.storage.snapshot(), changedStorageBefore);
assert.equal(changedSavedChat.chat.calls().length, changedChatCallsBefore);

const changedDuringLoad = await loadHarness({
  afterStage(stage, operation) {
    if (stage !== 'parent-preserved') return;
    const changed = changedDuringLoad.chat.messagesForChat(changedDuringLoad.selectedBinding.chatId);
    changed[0].text = 'Transcript changed after verification but before the continuation clone.';
    changedDuringLoad.chat.setMessagesForChat(changedDuringLoad.selectedBinding.chatId, changed);
  }
});
await assert.rejects(
  changedDuringLoad.service.loadGame({ savedGameId: changedDuringLoad.selected.id }),
  (error) => error?.code === 'DIRECTIVE_LOAD_GAME_CHAT_ATTESTATION_MISMATCH'
);
assert.equal(
  (await getV1StorageIndex(changedDuringLoad.storage)).activeSaveId,
  'save.load-parent',
  'a transcript changed inside the verification-to-clone window must never switch the active pointer'
);

for (const tornBoundary of ['parent-clone-journal', 'child-clone-journal']) {
  const test = await loadHarness();
  const originalStore = test.controller.storeTimelineOperation;
  let injected = false;
  let cleanupAttempted = false;
  test.chat.deleteCampaignChat = async () => {
    cleanupAttempted = true;
    return { deleted: false, reason: 'injected-cleanup-refusal' };
  };
  test.controller.storeTimelineOperation = async (operation) => {
    const parentCloneWrite = tornBoundary === 'parent-clone-journal'
      && operation.stage === 'detected'
      && Boolean(operation.parentCheckpointBinding?.transcriptAttestation);
    const childCloneWrite = tornBoundary === 'child-clone-journal'
      && operation.stage === 'child-chat-cloned';
    if (!injected && (parentCloneWrite || childCloneWrite)) {
      injected = true;
      throw new Error(`injected:${tornBoundary}`);
    }
    return originalStore(operation);
  };
  await assert.rejects(
    test.service.loadGame({ savedGameId: test.selected.id }),
    new RegExp(`injected:${tornBoundary}`)
  );
  test.controller.storeTimelineOperation = originalStore;
  await test.service.recoverActiveOperation({ campaignId: 'campaign.load' });
  const cloneCalls = test.chat.calls().filter((call) => call.type === 'cloneCampaignChat');
  assert.equal(
    new Set(cloneCalls.map((call) => call.branchChatId)).size,
    3,
    `${tornBoundary} recovery must reuse its journaled clone name rather than create an orphan duplicate`
  );
  assert.equal(cleanupAttempted, false, 'planned clone recovery must not depend on unreliable destructive compensation');
}

const tornSave = await harness();
const originalSaveStore = tornSave.controller.storeTimelineOperation;
let saveCloneJournalFailure = false;
tornSave.controller.storeTimelineOperation = async (operation) => {
  if (!saveCloneJournalFailure && operation.operationType === 'save-game' && operation.stage === 'parent-preserved') {
    saveCloneJournalFailure = true;
    throw new Error('injected:save-clone-journal');
  }
  return originalSaveStore(operation);
};
await assert.rejects(tornSave.service.saveGame({ name: 'Journaled manual save' }), /injected:save-clone-journal/);
tornSave.controller.storeTimelineOperation = originalSaveStore;
const recoveredManualSave = await tornSave.service.recoverActiveOperation({ campaignId: 'campaign.branch' });
assert.equal(recoveredManualSave.status, 'saved');
assert.equal((await loadV1CampaignSave(tornSave.storage, recoveredManualSave.savedGameId)).slotType, 'checkpoint');
const manualSaveCloneCalls = tornSave.chat.calls().filter((call) => call.type === 'cloneCampaignChat');
assert.equal(new Set(manualSaveCloneCalls.map((call) => call.branchChatId)).size, 1);

for (const sourceMutationCase of ['save-game', 'load-parent']) {
  const test = sourceMutationCase === 'save-game' ? await harness() : await loadHarness();
  const originalStore = test.controller.storeTimelineOperation;
  let plannedFailureInjected = false;
  test.controller.storeTimelineOperation = async (operation) => {
    const plannedWithoutClone = operation.stage === 'detected'
      && (sourceMutationCase === 'save-game'
        ? Boolean(operation.childBinding?.sourceTranscriptAttestation)
        : Boolean(operation.parentCheckpointBinding?.sourceTranscriptAttestation));
    if (!plannedFailureInjected && plannedWithoutClone) {
      plannedFailureInjected = true;
      await originalStore(operation);
      throw new Error(`injected:${sourceMutationCase}-after-plan`);
    }
    return originalStore(operation);
  };
  await assert.rejects(
    sourceMutationCase === 'save-game'
      ? test.service.saveGame({ name: 'Source attestation window' })
      : test.service.loadGame({ savedGameId: test.selected.id }),
    new RegExp(`injected:${sourceMutationCase}-after-plan`)
  );
  test.controller.storeTimelineOperation = originalStore;
  const sourceChatId = sourceMutationCase === 'save-game'
    ? test.parentState.campaignChatBinding.chatId
    : test.parentState.campaignChatBinding.chatId;
  const changedSource = test.chat.messagesForChat(sourceChatId);
  changedSource.push({ id: `changed.${sourceMutationCase}`, role: 'user', text: 'Changed after clone planning.' });
  test.chat.setMessagesForChat(sourceChatId, changedSource);
  await assert.rejects(
    test.service.recoverActiveOperation({ campaignId: test.parentState.campaign.id }),
    (error) => error?.code === 'DIRECTIVE_CHAT_CLONE_SOURCE_CHANGED'
  );
  assert.equal(
    (await getV1StorageIndex(test.storage)).activeSaveId,
    test.parentState.campaignChatBinding.saveId,
    `${sourceMutationCase} source drift after planning must leave the original parent authoritative`
  );
}

const loadStages = [
  'detected', 'parent-preserved', 'child-chat-cloned', 'child-derived',
  'child-persisted', 'child-binding-written', 'active-pointer-switched',
  'prompt-ready', 'parent-record-retired', 'completed'
];
for (const failedStage of loadStages) {
  let injected = false;
  const test = await loadHarness({
    afterStage(stage) {
      if (!injected && stage === failedStage) {
        injected = true;
        throw new Error(`injected-load:${stage}`);
      }
    }
  });
  const selectedBefore = await loadV1CampaignSave(test.storage, test.selected.id);
  await assert.rejects(
    test.service.loadGame({ savedGameId: test.selected.id }),
    new RegExp(`injected-load:${failedStage}`)
  );
  const beforeRecovery = await getV1StorageIndex(test.storage);
  const committed = loadStages.indexOf(failedStage) >= loadStages.indexOf('active-pointer-switched');
  assert.equal(beforeRecovery.activeSaveId === 'save.load-parent', !committed, `${failedStage} load commit boundary`);
  await test.service.recoverActiveOperation({ campaignId: 'campaign.load' });
  const finalIndex = await getV1StorageIndex(test.storage);
  assert.notEqual(finalIndex.activeSaveId, 'save.load-parent', `${failedStage} load recovery activates the child`);
  await assert.rejects(loadV1CampaignSave(test.storage, 'save.load-parent'), /not found/i);
  assert.deepEqual(await loadV1CampaignSave(test.storage, test.selected.id), selectedBefore);
  const summaries = await listV1CampaignSaves(test.storage);
  assert.equal(summaries.filter((save) => save.slotType === 'checkpoint').length, 2);
  assert.equal(
    test.chat.calls().filter((call) => call.type === 'cloneCampaignChat').length,
    3,
    `${failedStage} recovery must reuse the selected save clone plus exactly one parent and one child clone`
  );
}

let childMutationInjected = false;
const childMutationLoad = await loadHarness({
  afterStage(stage) {
    if (!childMutationInjected && stage === 'child-binding-written') {
      childMutationInjected = true;
      throw new Error('injected-load:child-mutation-window');
    }
  }
});
await assert.rejects(
  childMutationLoad.service.loadGame({ savedGameId: childMutationLoad.selected.id }),
  /injected-load:child-mutation-window/
);
const childMutationOperation = await childMutationLoad.controller.loadTimelineOperation({ campaignId: 'campaign.load' });
const mutatedChildMessages = childMutationLoad.chat.messagesForChat(childMutationOperation.childBinding.chatId);
mutatedChildMessages[0].text = 'Unbound prose changed before activation.';
childMutationLoad.chat.setMessagesForChat(childMutationOperation.childBinding.chatId, mutatedChildMessages);
await assert.rejects(
  childMutationLoad.service.recoverActiveOperation({ campaignId: 'campaign.load' }),
  (error) => error?.code === 'DIRECTIVE_LOAD_GAME_CHILD_ATTESTATION_MISMATCH'
);
assert.equal((await getV1StorageIndex(childMutationLoad.storage)).activeSaveId, 'save.load-parent');

const appStorage = createFakeJsonStorage();
const appState = createAshesInitialState({ campaignId: 'campaign.app-branch', saveId: 'save.app-parent', chatId: 'chat.app-parent' });
appState.campaignChatBinding = {
  ...appState.campaignChatBinding,
  hostId: 'fake', entityType: 'character', entityId: '7', entityName: 'Ashes of Peace - Sam Vickers'
};
await storeV1CampaignSave(appStorage, createV1CampaignSave({
  id: 'save.app-parent', name: 'App Parent', state: appState, createdAt: fixedNow
}));
const appChat = createFakeChatAdapter({
  chatId: 'chat.app-parent', entityId: '7', entityName: 'Ashes of Peace - Sam Vickers',
  messages: [
    { id: 'opening', role: 'assistant', text: 'Opening narration.', isDirectiveOwned: true },
    { id: 'later', role: 'assistant', text: 'Later narration.', isDirectiveOwned: true }
  ]
});
await appChat.updateBindingMetadata(appState.campaignChatBinding);
let postForkWarning = null;
const host = createFakeDirectiveHost({
  chatNative: true,
  chat: appChat,
  storage: appStorage,
  logger: { warn: (...args) => { postForkWarning = args; } }
});
let appId = 0;
const app = createDirectiveRuntimeApp({
  host,
  packageLoader: async () => structuredClone(records),
  idFactory: (prefix) => `${prefix}.app.${++appId}`,
  now: () => fixedNow
});
await app.initialize();
appChat.createNativeBranch({ endpointIndex: 0, childChatId: 'renamed-app-child' });
const nativeBranchIntent = {
  kind: 'directive.nativeBranchIntent.v1',
  parentChatId: 'chat.app-parent',
  endpointHostMessageId: 'opening',
  capturedAt: Date.now()
};
const originalGetRecentMessages = appChat.getRecentMessages.bind(appChat);
let postForkReplayFailureInjected = false;
appChat.getRecentMessages = async (...args) => {
  if (!postForkReplayFailureInjected && args[0]?.limit === Number.MAX_SAFE_INTEGER) {
    postForkReplayFailureInjected = true;
    throw new Error('injected:post-fork-replay');
  }
  return originalGetRecentMessages(...args);
};
const changed = await app.handleHostChatChanged({ nativeBranchIntent });
appChat.getRecentMessages = originalGetRecentMessages;
const receivedBranchIntent = appChat.calls().findLast((call) => call.type === 'inspectNativeBranchCandidate').branchIntent;
assert.deepEqual(
  Object.fromEntries(Object.entries(receivedBranchIntent).filter(([key]) => key !== 'verifiedByDirective')),
  nativeBranchIntent,
  'the host branch action proof reaches the lineage adapter'
);
assert.equal(receivedBranchIntent.verifiedByDirective, true, 'the verified action proof remains recoverable through the transaction journal');
assert.equal(changed.active, true);
assert.equal(changed.timelineFork.status, 'activated');
assert.match(changed.timelineFork.suggestedName, /Stardate/);
assert.equal(changed.acceptedPairReplay.reasonCode, 'post-fork-replay-failed');
assert.match(postForkWarning?.[0] || '', /Post-fork accepted-pair replay failed/);
assert.notEqual((await getV1StorageIndex(appStorage)).activeSaveId, 'save.app-parent');
assert.equal((await app.getCurrentView({ tabId: 'mission' })).campaignState.campaignChatBinding.chatId, 'renamed-app-child');
const generationAfterReplayFailure = await app.getChatTurnOrchestrator().interceptGeneration();
assert.deepEqual(generationAfterReplayFailure.acceptedPairReplay, {
  replayed: 0,
  blocked: false,
  blockedAtMessageId: null,
  retryPending: false
}, 'generation must retry a post-fork accepted-pair replay failure before continuing');
assert.equal((await app.handleHostChatChanged()).timelineFork, null, 'duplicate chat event is idempotent');

const selectedSavedGameBefore = await loadV1CampaignSave(appStorage, changed.timelineFork.savedGameId);
const originalReentrantOpen = appChat.openCampaignChat.bind(appChat);
let reentrantChatChangedCount = 0;
appChat.openCampaignChat = async (binding) => {
  const opened = await originalReentrantOpen(binding);
  reentrantChatChangedCount += 1;
  await app.handleHostChatChanged({ source: 'synchronous-internal-open-test' });
  return opened;
};
const staleParentMessage = {
  id: 'stale-parent-player', hostMessageId: 'stale-parent-player', chatId: 'renamed-app-child',
  text: 'Proceed from the parent timeline.', isUser: true, isDirectiveOwned: false
};
appChat.setMessagesForChat('renamed-app-child', [
  ...appChat.messagesForChat('renamed-app-child'),
  staleParentMessage
]);
const firstLoadPromise = Promise.race([
  app.loadGame({ savedGameId: changed.timelineFork.savedGameId }),
  new Promise((_, reject) => setTimeout(() => reject(new Error('reentrant CHAT_CHANGED deadlock')), 1000))
]);
const staleParentObservation = app.observeHostPlayerMessage({
  message: staleParentMessage,
  chatId: 'renamed-app-child',
  ingressId: 'stale-parent-after-load-started'
});
const [firstLoad, staleObservationResult] = await Promise.all([firstLoadPromise, staleParentObservation]);
appChat.openCampaignChat = originalReentrantOpen;
assert.ok(reentrantChatChangedCount > 0, 'the load test must exercise a synchronous reentrant CHAT_CHANGED event');
assert.deepEqual(
  { handled: staleObservationResult.handled, reason: staleObservationResult.reason },
  { handled: false, reason: 'source-chat-changed' },
  'a parent message queued behind Load Game must not mutate the activated child timeline'
);
assert.deepEqual(
  (await app.getCurrentView({ tabId: 'mission' })).campaignState,
  firstLoad.timeline.state,
  'a stale parent accepted-pair event must cause zero child state or clock mutation'
);
const preservedBranch = await loadV1CampaignSave(appStorage, firstLoad.transaction.savedGameId);
assert.notEqual(
  preservedBranch.state.campaignChatBinding.chatId,
  'renamed-app-child',
  'Load Game preserves the current timeline in its own immutable chat clone'
);
assert.equal(preservedBranch.state.campaignChatBinding.saveId, preservedBranch.parentSaveId);
assert.equal(appChat.messagesForChat(preservedBranch.state.campaignChatBinding.chatId).length, 2);
const secondLoad = await app.loadGame({ savedGameId: changed.timelineFork.savedGameId });
assert.notEqual(firstLoad.timeline.id, secondLoad.timeline.id, 'repeated loads create independent active timelines');
assert.notEqual(firstLoad.timeline.state.campaignChatBinding.chatId, secondLoad.timeline.state.campaignChatBinding.chatId);
assert.deepEqual(
  await loadV1CampaignSave(appStorage, changed.timelineFork.savedGameId),
  selectedSavedGameBefore,
  'the selected saved game stays immutable across repeated loads'
);
assert.ok(firstLoad.transaction.savedGameId);
assert.ok(secondLoad.transaction.savedGameId);
assert.notEqual(firstLoad.transaction.savedGameId, secondLoad.transaction.savedGameId);

console.log('V1 native branch runtime tests passed');
