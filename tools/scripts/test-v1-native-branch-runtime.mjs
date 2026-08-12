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
import { createTimelineTransactionService } from '../../src/runtime/timeline-transaction-service.mjs';
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
const host = createFakeDirectiveHost({ chatNative: true, chat: appChat, storage: appStorage });
let appId = 0;
const app = createDirectiveRuntimeApp({
  host,
  packageLoader: async () => structuredClone(records),
  idFactory: (prefix) => `${prefix}.app.${++appId}`,
  now: () => fixedNow
});
await app.initialize();
appChat.createNativeBranch({ endpointIndex: 0, childChatId: 'renamed-app-child' });
const changed = await app.handleHostChatChanged();
assert.equal(changed.active, true);
assert.equal(changed.timelineFork.status, 'activated');
assert.match(changed.timelineFork.suggestedName, /Stardate/);
assert.notEqual((await getV1StorageIndex(appStorage)).activeSaveId, 'save.app-parent');
assert.equal((await app.getCurrentView({ tabId: 'mission' })).campaignState.campaignChatBinding.chatId, 'renamed-app-child');
assert.equal((await app.handleHostChatChanged()).timelineFork, null, 'duplicate chat event is idempotent');

const selectedSavedGameBefore = await loadV1CampaignSave(appStorage, changed.timelineFork.savedGameId);
const firstLoad = await app.loadGame({ savedGameId: changed.timelineFork.savedGameId });
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
