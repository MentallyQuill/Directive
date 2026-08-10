import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  createFakeChatAdapter,
  createFakeDirectiveHost,
  createFakeGenerationClient,
  createFakeJsonStorage
} from '../../src/hosts/fake/fake-host.mjs';
import { awardV1CommandBearing } from '../../src/command/v1-command-bearing.mjs';
import {
  createDirectiveGenerationRouter,
  createDirectiveRuntimeApp
} from '../../src/runtime/runtime-app.mjs';
import { V1_CAMPAIGN_LIBRARY_TEASERS } from '../../src/packages/bundled-package-registry.mjs';
import { V1_STORAGE_PATHS } from '../../src/storage/v1-storage-repository.mjs';

function json(relative) {
  return JSON.parse(fs.readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8'));
}

const runtimeGenerationCalls = [];
const runtimeGenerationRouter = createDirectiveGenerationRouter({
  generation: {
    async generate(roleId, request, options) {
      runtimeGenerationCalls.push({ roleId, request, options });
      return { text: '{"ok":true}', providerId: 'fake-runtime-provider', model: 'fake-model' };
    }
  }
});
const runtimeRoutedResult = await runtimeGenerationRouter.generate('characterCreatorSectionDraft', {
  prompt: 'Repair malformed JSON.'
}, {
  providerKind: 'utility',
  timeoutMs: 30000
});
assert.equal(runtimeRoutedResult.ok, true);
assert.deepEqual(runtimeGenerationCalls[0].options, {
  providerKind: 'utility',
  timeoutMs: 30000
});

const definitionNames = [
  'prelude-a-ship-underway', 'chapter-1-the-empty-convoy', 'chapter-2-false-colors',
  'open-orders-1-work-worth-doing', 'chapter-3-dead-letters', 'chapter-4-the-colony-that-stayed',
  'chapter-5-old-lessons', 'open-orders-2-what-survives', 'chapter-6-the-cost-of-knowing',
  'chapter-7-a-peace-of-their-own', 'open-orders-3-before-the-lamps-go-out',
  'chapter-8-the-last-directive', 'epilogue-the-terms-we-keep'
];
const records = {
  packageData: json('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json'),
  crewDataset: json('packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json'),
  shipDataset: json('packages/bundled/breckenridge/breckenridge-intrepid-class.ship-dataset.json'),
  missionDefinitions: definitionNames.map((name) => json(`packages/bundled/breckenridge/v1/${name}.mission-v1.json`)),
  campaignLibrary: V1_CAMPAIGN_LIBRARY_TEASERS
};

const chat = createFakeChatAdapter({ chatId: 'unbound-chat' });
const jsonStorage = createFakeJsonStorage();
const storedPortraitPaths = [];
const deletedPortraitPaths = [];
const storage = {
  ...jsonStorage,
  async writeBase64File(fileName) {
    const path = `/user/files/${fileName}`;
    storedPortraitPaths.push(path);
    return { ok: true, fileName, path };
  },
  async deleteFile(path) {
    deletedPortraitPaths.push(path);
    return { ok: true, path };
  }
};
let missionInterpretationCalls = 0;
const generation = createFakeGenerationClient({
  responses: {
    narration: { text: 'Captain Whitaker waits in the ready room. “Come in, Commander.”', providerId: 'fake-narrator' },
    acceptedPairMissionEvidence: () => {
      missionInterpretationCalls += 1;
      if (missionInterpretationCalls === 1) throw new Error('transient fake provider failure');
      return {
        text: JSON.stringify({
          kind: 'directive.missionEvidenceInterpretation.v1',
          assistantAcceptance: 'accepted',
          claims: [],
          abstained: true
        }),
        providerId: 'fake-utility'
      };
    }
  }
});
const runtimeWarnings = [];
const host = createFakeDirectiveHost({
  chatNative: true,
  chat,
  generation,
  storage,
  logger: { warn: (...args) => runtimeWarnings.push(args), info() {}, error() {} }
});
let nextId = 0;
let nextMinute = 0;
let app = createDirectiveRuntimeApp({
  host,
  packageLoader: async () => structuredClone(records),
  idFactory: (prefix) => `${prefix}.${++nextId}`,
  now: () => new Date(Date.parse('2026-08-10T03:00:00.000Z') + (nextMinute++ * 60_000)).toISOString()
});

const initial = await app.initialize();
assert.equal(initial.kind, 'directive.runtimeView.v1');
assert.equal(initial.campaignState, null);
assert.deepEqual(initial.media, { playerPortraitImportSupported: true });
assert.equal(app.getChatTurnOrchestrator() != null, true);

const incompleteStorageView = await createDirectiveRuntimeApp({
  host: createFakeDirectiveHost(),
  packageLoader: async () => structuredClone(records),
  idFactory: (prefix) => `${prefix}.incomplete-storage`,
  now: () => '2026-08-10T03:00:00.000Z'
}).initialize();
assert.deepEqual(incompleteStorageView.media, { playerPortraitImportSupported: false });

await app.startCreatorDraft();
const disposablePortrait = await app.importCreatorPortrait({
  bytes: new Uint8Array([1, 2, 3, 4]),
  mimeType: 'image/png',
  fileName: 'disposable.png'
});
const discardedDraft = await app.discardCreatorDraft();
assert.equal(discardedDraft.kind, 'directive.runtimeView.v1');
assert.deepEqual(discardedDraft.portraitCleanup, {
  attempted: true,
  deleted: true,
  path: disposablePortrait.portrait.asset.path
});
assert.equal(deletedPortraitPaths.includes(disposablePortrait.portrait.asset.path), true);

await app.startCreatorDraft();
const writeJson = host.storage.writeJson;
host.storage.writeJson = async (path, value) => {
  if (String(path).startsWith('v1/drafts/')) {
    const error = new Error('fake draft save failure');
    error.code = 'FAKE_DRAFT_SAVE_FAILED';
    throw error;
  }
  return writeJson.call(host.storage, path, value);
};
const storedBeforeFailedImport = storedPortraitPaths.length;
const deletedBeforeFailedImport = deletedPortraitPaths.length;
await assert.rejects(
  app.importCreatorPortrait({
    bytes: new Uint8Array([5, 6, 7, 8]),
    mimeType: 'image/png',
    fileName: 'must-be-removed.png'
  }),
  (error) => error?.code === 'FAKE_DRAFT_SAVE_FAILED'
);
host.storage.writeJson = writeJson;
assert.equal(storedPortraitPaths.length, storedBeforeFailedImport + 1);
assert.equal(deletedPortraitPaths.length, deletedBeforeFailedImport + 1);
assert.equal(deletedPortraitPaths.at(-1), storedPortraitPaths.at(-1));
await app.discardCreatorDraft();

await app.startCreatorDraft();
await app.importCreatorPortrait({
  bytes: new Uint8Array([9, 10, 11, 12]),
  mimeType: 'image/png',
  fileName: 'cleanup-warning.png'
});
const deleteFile = host.storage.deleteFile;
host.storage.deleteFile = async () => {
  const error = new Error('fake portrait cleanup failure');
  error.code = 'FAKE_PORTRAIT_DELETE_FAILED';
  throw error;
};
const removedPortrait = await app.removeCreatorPortrait();
host.storage.deleteFile = deleteFile;
assert.deepEqual(removedPortrait.portraitCleanup, {
  attempted: true,
  deleted: false,
  reason: 'removed-player-portrait-cleanup-failed',
  errorCode: 'FAKE_PORTRAIT_DELETE_FAILED',
  message: 'fake portrait cleanup failure'
});
assert.equal(runtimeWarnings.some(([message]) => message === '[Directive] Player portrait cleanup failed.'), true);
assert.equal(removedPortrait.view.creator.input.identity.portrait, null);
await app.discardCreatorDraft();

await app.startCreatorDraft();
await app.saveCreatorDraft({
  patch: {
    activeStep: 'review',
    input: {
      identity: {
        name: 'Ren Okada', pronounsOrAddress: 'he/him', speciesId: 'human',
        ageBandId: 'mid-career', appearance: 'Attentive and deliberate.'
      },
      service: {
        careerBackgroundId: 'tactical-security',
        formativeExperienceId: 'dominion-war-fleet-service',
        assignmentReasonId: 'experienced-outsider-transfer'
      },
      personality: {
        traits: { insight: 'perceptive', connection: 'candid', execution: 'decisive' },
        flawId: 'impatient'
      },
      dossier: {
        briefBiography: 'Ren Okada is a command officer shaped by wartime service and committed to reconstruction.',
        publicReputation: 'A decisive officer learning how to turn wartime instincts toward peace.'
      }
    }
  }
});
const chatBeforeFailedCampaignStart = host.chat.getCurrentChatId();
const updateBindingMetadata = host.chat.updateBindingMetadata;
host.chat.updateBindingMetadata = async () => {
  const error = new Error('fake campaign chat metadata failure');
  error.code = 'FAKE_CAMPAIGN_CHAT_METADATA_FAILED';
  throw error;
};
await assert.rejects(
  app.acceptCreatorDraftAndStartCampaign(),
  (error) => error?.code === 'FAKE_CAMPAIGN_CHAT_METADATA_FAILED'
);
host.chat.updateBindingMetadata = updateBindingMetadata;
const recoverableCampaignView = await app.getCurrentView({ tabId: 'campaign' });
assert.equal(recoverableCampaignView.activeScreen, 'campaign');
assert.equal(recoverableCampaignView.creator, null);
assert.equal(recoverableCampaignView.campaignIndex.campaigns.length, 1);
assert.equal(recoverableCampaignView.campaignState, null);
assert.equal(host.chat.getCurrentChatId(), chatBeforeFailedCampaignStart);
assert.equal(chat.calls().some((call) => call.type === 'deleteCampaignChat'), true);
assert.equal(
  (await host.storage.readJson(V1_STORAGE_PATHS.save(recoverableCampaignView.activeSaveId))).state.campaignChatBinding?.chatId ?? null,
  null,
  'failed host binding must restore the persisted first save to its unbound state'
);
await app.openCampaignChat({ saveId: recoverableCampaignView.activeSaveId });
const missionView = await app.getCurrentView({ tabId: 'mission' });
assert.equal(missionView.campaignState.campaign.status, 'active');
assert.equal(missionView.campaignState.campaignChatBinding.kind, 'directive.campaignChatBinding.v1');
assert.equal(missionView.v1PlayerProjection.kind, 'directive.playerProjection.v1');
assert.equal(chat.messages().filter((message) => !message.isUser).length, 1);
const boundCampaignChatId = missionView.campaignState.campaignChatBinding.chatId;
chat.setCurrentChatId('unbound-open-failure');
const messagesBeforeOpenFailure = chat.messages().length;
const openBoundCampaignChat = host.chat.openCampaignChat;
host.chat.openCampaignChat = async () => false;
await assert.rejects(
  app.openCampaignChat({ saveId: missionView.activeSaveId }),
  (error) => error?.code === 'DIRECTIVE_CAMPAIGN_CHAT_OPEN_FAILED'
);
host.chat.openCampaignChat = openBoundCampaignChat;
assert.equal(chat.getCurrentChatId(), 'unbound-open-failure');
assert.equal(chat.messages().length, messagesBeforeOpenFailure, 'failed open must not post the campaign opening into another chat');
await app.openCampaignChat({ saveId: missionView.activeSaveId });
assert.equal(chat.getCurrentChatId(), boundCampaignChatId);
const installedPrompt = host.prompt.inspect().blocks[0]?.text || '';
assert.match(installedPrompt, /"simulationMode": "Command"/);
assert.match(installedPrompt, /Command mode: preserve full causal consequence severity/);

const activeSavePath = V1_STORAGE_PATHS.save(missionView.activeSaveId);
const creditedSave = await host.storage.readJson(activeSavePath);
creditedSave.state.commandBearing = awardV1CommandBearing(creditedSave.state.commandBearing, {
  awardId: 'award.test.command-bearing',
  sourceId: 'objective.test.optional-command-choice',
  reason: 'You made a meaningful optional command decision.'
}).commandBearing;
await host.storage.writeJson(activeSavePath, creditedSave);
app = createDirectiveRuntimeApp({
  host,
  packageLoader: async () => structuredClone(records),
  idFactory: (prefix) => `${prefix}.${++nextId}`,
  now: () => new Date(Date.parse('2026-08-10T03:00:00.000Z') + (nextMinute++ * 60_000)).toISOString()
});
await app.initialize();

const reserved = await app.reserveCommandBearingEdge();
assert.equal(reserved.applied, true);
assert.equal(reserved.commandBearing.balance, 0);
assert.equal(reserved.commandBearing.spends[reserved.spendId].status, 'reserved');
assert.doesNotMatch(host.prompt.inspect().blocks[0]?.text || '', /COMMAND BEARING EDGE IS ARMED/);

const opening = chat.messages()[0];
const player = chat.pushPlayerMessage({ text: 'I take the chair opposite Whitaker and open the handover packet.' });
const settled = await app.observeHostPlayerMessage({ message: player });
assert.equal(settled.handled, true);
assert.equal(settled.mission.ok, false);
assert.equal(settled.mission.reasonCode, 'provider-empty');
assert.equal((await app.getCurrentView({ tabId: 'mission' })).campaignState.storySettlement.revision, 0);
assert.equal((await app.getCurrentView({ tabId: 'people' })).campaignState.commandBearing.spends[reserved.spendId].status, 'reserved');
const intercepted = await app.getChatTurnOrchestrator().interceptGeneration();
assert.equal(intercepted.acceptedPairReplay.replayed, 1);
assert.equal(intercepted.acceptedPairReplay.retryPending, false);
assert.equal(missionInterpretationCalls, 2);
assert.ok((await app.getCurrentView({ tabId: 'mission' })).campaignState.storySettlement.revision > 0);
assert.equal((await app.getCurrentView({ tabId: 'people' })).campaignState.commandBearing.spends[reserved.spendId].status, 'armed');
assert.match(host.prompt.inspect().blocks[0]?.text || '', /COMMAND BEARING EDGE IS ARMED/);
const acceptedRevision = (await app.getCurrentView({ tabId: 'mission' })).campaignState.stateCustody.revision;
assert.ok(acceptedRevision > 1);

const provisional = chat.pushAssistantMessage({
  text: 'Whitaker closes the packet.',
  hostMessageId: 'assistant.provisional',
  swipes: ['Whitaker closes the packet.', 'Whitaker leaves it open.'],
  swipeId: 1
});
await app.handleHostMessageSelectedSwipeChanged({ message: provisional });
const afterSwipeRevision = (await app.getCurrentView({ tabId: 'mission' })).campaignState.stateCustody.revision;
assert.ok(afterSwipeRevision >= acceptedRevision);
assert.equal((await app.getCurrentView({ tabId: 'people' })).campaignState.commandBearing.spends[reserved.spendId].status, 'armed');

const nextPlayer = chat.pushPlayerMessage({ text: '“Let us start with where you need me most.”' });
await app.observeHostPlayerMessage({ message: nextPlayer });
const finalRevision = (await app.getCurrentView({ tabId: 'mission' })).campaignState.stateCustody.revision;
assert.ok(finalRevision > afterSwipeRevision);
assert.equal((await app.getCurrentView({ tabId: 'people' })).campaignState.commandBearing.spends[reserved.spendId].status, 'committed');
assert.doesNotMatch(host.prompt.inspect().blocks[0]?.text || '', /COMMAND BEARING EDGE IS ARMED/);
assert.equal(opening.text.startsWith('*Stardate'), true);

await app.handleHostMessageSelectedSwipeChanged({ message: provisional });
const afterInvalidation = await app.getCurrentView({ tabId: 'people' });
assert.equal(afterInvalidation.campaignState.commandBearing.balance, 1);
assert.equal(afterInvalidation.campaignState.commandBearing.spends[reserved.spendId].status, 'refunded');

const cancelCandidate = await app.reserveCommandBearingEdge();
assert.equal(cancelCandidate.applied, true);
const cancelled = await app.cancelCommandBearingEdge();
assert.equal(cancelled.applied, true);
assert.equal(cancelled.commandBearing.balance, 1);
assert.equal(cancelled.commandBearing.spends[cancelCandidate.spendId].status, 'refunded');

const disposableCheckpoint = await app.saveGame({ name: 'Disposable checkpoint' });
const checkpointChatId = disposableCheckpoint.checkpoint.state.campaignChatBinding.chatId;
assert.ok(checkpointChatId);
assert.equal(
  disposableCheckpoint.checkpoint.state.campaignChatBinding.saveId,
  disposableCheckpoint.checkpoint.parentSaveId,
  'checkpoint chat metadata must retain the active V1 branch id'
);
const continuedCheckpoint = await app.loadCheckpoint({ checkpointId: disposableCheckpoint.checkpoint.id });
assert.equal(continuedCheckpoint.timeline.state.campaignChatBinding.saveId, disposableCheckpoint.checkpoint.parentSaveId);
assert.notEqual(continuedCheckpoint.timeline.state.campaignChatBinding.chatId, checkpointChatId);
const checkpointDeletion = await app.deleteSave({ checkpointId: disposableCheckpoint.checkpoint.id });
assert.equal(checkpointDeletion.result.deleted, true);
assert.deepEqual(checkpointDeletion.chatCleanup, {
  attempted: true,
  deleted: true,
  chatId: checkpointChatId
});
assert.equal(
  chat.calls().some((call) => call.type === 'deleteCampaignChat' && call.chatId === checkpointChatId),
  true,
  'deleting a checkpoint must also delete its cloned host chat'
);

const activeChatBeforeSelectedDeletion = (await app.getCurrentView({ tabId: 'mission' })).campaignState.campaignChatBinding.chatId;
const selectedCheckpoint = await app.saveGame({ name: 'Selected checkpoint chat' });
const selectedCheckpointChatId = selectedCheckpoint.checkpoint.state.campaignChatBinding.chatId;
chat.setCurrentChatId(selectedCheckpointChatId);
const selectedCheckpointDeletion = await app.deleteSave({ checkpointId: selectedCheckpoint.checkpoint.id });
assert.equal(selectedCheckpointDeletion.result.deleted, true);
assert.deepEqual(selectedCheckpointDeletion.chatCleanup, {
  attempted: true,
  deleted: true,
  chatId: selectedCheckpointChatId
});
assert.equal(
  chat.getCurrentChatId(),
  activeChatBeforeSelectedDeletion,
  'checkpoint deletion must reopen the authoritative active chat before deleting a selected clone'
);

const cleanupFailureCheckpoint = await app.saveGame({ name: 'Cleanup failure checkpoint' });
const deleteCampaignChat = host.chat.deleteCampaignChat;
host.chat.deleteCampaignChat = async () => {
  const error = new Error('fake checkpoint chat deletion failure');
  error.code = 'FAKE_CHAT_DELETE_FAILED';
  throw error;
};
const cleanupFailureDeletion = await app.deleteSave({ checkpointId: cleanupFailureCheckpoint.checkpoint.id });
host.chat.deleteCampaignChat = deleteCampaignChat;
assert.equal(cleanupFailureDeletion.result.deleted, true);
assert.deepEqual(cleanupFailureDeletion.chatCleanup, {
  attempted: true,
  deleted: false,
  reason: 'checkpoint-chat-delete-failed',
  errorCode: 'FAKE_CHAT_DELETE_FAILED',
  message: 'fake checkpoint chat deletion failure'
});

const cloneCampaignChat = host.chat.cloneCampaignChat;
host.chat.cloneCampaignChat = async () => {
  const error = new Error('fake checkpoint clone failure');
  error.code = 'FAKE_CHAT_CLONE_FAILED';
  throw error;
};
await assert.rejects(
  app.saveGame({ name: 'Must not survive clone failure' }),
  (error) => error?.code === 'FAKE_CHAT_CLONE_FAILED'
);
host.chat.cloneCampaignChat = cloneCampaignChat;
assert.equal(
  (await app.getCurrentView({ tabId: 'campaign' })).campaignIndex.campaigns[0].checkpoints.length,
  0,
  'a checkpoint without an exact cloned chat must be removed'
);
host.chat.cloneCampaignChat = undefined;
await assert.rejects(
  app.saveGame({ name: 'No clone fallback' }),
  (error) => error?.code === 'DIRECTIVE_CHECKPOINT_CLONE_UNAVAILABLE'
);
host.chat.cloneCampaignChat = cloneCampaignChat;
assert.equal(
  (await app.getCurrentView({ tabId: 'campaign' })).campaignIndex.campaigns[0].checkpoints.length,
  0,
  'V1 must not create a state-only checkpoint when host chat cloning is unavailable'
);

const restoreFailureCheckpoint = await app.saveGame({ name: 'Restore failure checkpoint' });
const mutationBeforeFailedRestore = await app.reserveCommandBearingEdge();
assert.equal(mutationBeforeFailedRestore.applied, true);
const stateBeforeFailedRestore = (await app.getCurrentView({ tabId: 'mission' })).campaignState;
const openCampaignChat = host.chat.openCampaignChat;
host.chat.openCampaignChat = async () => false;
await assert.rejects(
  app.loadCheckpoint({ checkpointId: restoreFailureCheckpoint.checkpoint.id }),
  (error) => error?.code === 'DIRECTIVE_CHECKPOINT_CONTINUATION_OPEN_FAILED'
);
host.chat.openCampaignChat = openCampaignChat;
assert.deepEqual(
  (await app.getCurrentView({ tabId: 'mission' })).campaignState,
  stateBeforeFailedRestore,
  'a failed continuation activation must restore the pre-load active timeline'
);
const failedContinuationClone = [...chat.calls()].reverse().find((call) => (
  call.type === 'cloneCampaignChat'
  && call.sourceChatId === restoreFailureCheckpoint.checkpoint.state.campaignChatBinding.chatId
));
assert.equal(failedContinuationClone.options.open, false);
assert.equal(
  chat.calls().some((call) => call.type === 'deleteCampaignChat' && call.chatId === failedContinuationClone.branchChatId),
  true,
  'a continuation that cannot be opened must be removed after rollback'
);
await app.cancelCommandBearingEdge();
await app.deleteSave({ checkpointId: restoreFailureCheckpoint.checkpoint.id });

console.log('PASS V1 runtime app');
