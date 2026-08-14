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
import { withCampaignTimelineLease } from '../../src/runtime/timeline-transaction-service.mjs';
import { V1_CAMPAIGN_LIBRARY_TEASERS } from '../../src/packages/bundled-package-registry.mjs';
import { V1_STORAGE_PATHS } from '../../src/storage/v1-storage-repository.mjs';
import { createDutyReportVisibleSegment } from '../../src/mission/v1/duty-report-delivery.mjs';

function json(relative) {
  return JSON.parse(fs.readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8'));
}

const runtimeGenerationCalls = [];
const runtimeGenerationRouter = createDirectiveGenerationRouter({
  generation: {
    async generate(roleId, request, options) {
      runtimeGenerationCalls.push({ roleId, request, options });
      return {
        text: '{"ok":true}',
        providerId: 'fake-runtime-provider',
        model: 'fake-model',
        providerKind: 'utility',
        usage: { prompt_tokens: 10, completion_tokens: 3 }
      };
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
assert.equal(runtimeRoutedResult.diagnostics.providerKind, 'utility');
assert.deepEqual(runtimeRoutedResult.diagnostics.usage, { prompt_tokens: 10, completion_tokens: 3 });

const runtimeFailedRouter = createDirectiveGenerationRouter({
  generation: {
    async generate() {
      const error = new Error('connection failed');
      error.code = 'DIRECTIVE_PROVIDER_TRANSPORT_ERROR';
      error.retryable = true;
      error.providerKind = 'utility';
      error.details = { transportCode: 'ECONNRESET' };
      throw error;
    }
  }
});
const runtimeFailedResult = await runtimeFailedRouter.generate('characterCreatorSectionDraft', {});
assert.equal(runtimeFailedResult.error.retryable, true);
assert.deepEqual(runtimeFailedResult.error.details, { transportCode: 'ECONNRESET' });
assert.equal(runtimeFailedResult.diagnostics.providerKind, 'utility');
assert.equal(runtimeFailedResult.diagnostics.transportCode, 'ECONNRESET');

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
  cohesionCatalog: json('packages/bundled/breckenridge/breckenridge.cohesion-catalog.json'),
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
let holdMissionInterpretation = false;
let reportHeldInterpretationStarted = null;
const generation = createFakeGenerationClient({
  responses: {
    narration: { text: 'Captain Whitaker waits in the ready room. “Come in, Commander.”', providerId: 'fake-narrator' },
    acceptedPairMissionEvidence: async ({ rawOptions }) => {
      missionInterpretationCalls += 1;
      if (holdMissionInterpretation) {
        reportHeldInterpretationStarted?.();
        await new Promise((_resolve, reject) => {
          rawOptions.signal?.addEventListener('abort', () => {
            const error = new Error('held Directive analysis aborted');
            error.code = 'DIRECTIVE_GENERATION_ABORTED';
            reject(error);
          }, { once: true });
        });
      }
      if (missionInterpretationCalls === 1) throw new Error('transient fake provider failure');
      return {
        text: JSON.stringify({
          kind: 'directive.missionEvidenceInterpretation.v1',
          assistantAcceptance: 'accepted',
          claims: [],
          abstained: true,
          time: {
            decision: 'advance',
            elapsedSeconds: 47,
            reason: 'brief-exchange',
            confidence: 0.9
          }
        }),
        providerId: 'fake-utility'
      };
    }
  }
});
const runtimeWarnings = [];
const narrationPresetLifecycle = [];
const host = createFakeDirectiveHost({
  chatNative: true,
  chat,
  generation,
  storage,
  presets: {
    async activateNarrationPreset() {
      narrationPresetLifecycle.push('activate');
      return { ok: true, active: true };
    },
    async restoreNarrationPreset() {
      narrationPresetLifecycle.push('restore');
      return { ok: true, restored: true };
    }
  },
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
assert.deepEqual(initial.generationRouting.map(({ id, providerKind }) => ({ id, providerKind })), [
  { id: 'acceptedPairMissionEvidence', providerKind: 'utility' },
  { id: 'episodeEvaluator', providerKind: 'reasoning' },
  { id: 'peopleDossierAuthor', providerKind: 'reasoning' },
  { id: 'characterCreatorSectionDraft', providerKind: 'reasoning' }
]);
assert.deepEqual(initial.diagnostics, { transcriptAvailable: true });
assert.equal(JSON.stringify(initial.providerConfiguration).includes('baseUrl'), false);
assert.equal(JSON.stringify(initial.providerConfiguration).includes('apiKey'), false);

const getRecentMessagesForRuntime = host.chat.getRecentMessages;
host.chat.getRecentMessages = () => [
  { hostMessageId: 'visible-user', text: 'Visible player message', isUser: true, isSystem: false, visibility: { hiddenByHost: false, sourceMutation: false }, raw: { secret: 'RAW_SECRET' } },
  { hostMessageId: 'visible-assistant', text: 'Selected visible answer', isUser: false, isSystem: false, visibility: { hiddenByHost: false, sourceMutation: false }, swipes: ['Selected visible answer', 'ALTERNATE_SECRET'] },
  { hostMessageId: 'system', text: 'SYSTEM_SECRET', isUser: false, isSystem: true, visibility: { hiddenByHost: false, sourceMutation: false } },
  { hostMessageId: 'hidden', text: 'HIDDEN_SECRET', isUser: false, isSystem: false, visibility: { hiddenByHost: true, sourceMutation: false } },
  { hostMessageId: 'deleted', text: 'DELETED_SECRET', isUser: true, isSystem: false, visibility: { hiddenByHost: false, sourceMutation: true } }
];
const metadataOnlySupport = JSON.parse((await app.exportSupportDiagnostics({ includeStoryTranscript: false })).jsonText);
assert.equal('storyTranscript' in metadataOnlySupport, false);
assert.equal('prompt' in metadataOnlySupport, false);
assert.equal(JSON.stringify(metadataOnlySupport).includes('RAW_SECRET'), false);
assert.equal(JSON.stringify(metadataOnlySupport.providers).includes('apiKey'), false);
assert.equal(metadataOnlySupport.routing.length, 4);
const transcriptSupport = JSON.parse((await app.exportSupportDiagnostics({ includeStoryTranscript: true })).jsonText);
assert.deepEqual(transcriptSupport.storyTranscript, {
  kind: 'directive.playerVisibleTranscript.v1',
  messages: [
    { hostMessageId: 'visible-user', role: 'user', text: 'Visible player message' },
    { hostMessageId: 'visible-assistant', role: 'assistant', text: 'Selected visible answer' }
  ]
});
for (const secret of ['RAW_SECRET', 'ALTERNATE_SECRET', 'SYSTEM_SECRET', 'HIDDEN_SECRET', 'DELETED_SECRET']) {
  assert.equal(JSON.stringify(transcriptSupport).includes(secret), false);
}
host.chat.getRecentMessages = getRecentMessagesForRuntime;

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
const createOrBindCampaignChat = host.chat.createOrBindCampaignChat;
const failedFreshChatBinding = {
  hostId: 'fake',
  chatId: 'failed-fresh-chat',
  campaignId: 'campaign.failed-fresh-chat',
  saveId: 'save.failed-fresh-chat',
  entityType: 'character',
  entityId: 'fake-character-1',
  entityName: 'Failed fresh chat',
  createdByDirective: true
};
host.chat.createOrBindCampaignChat = async () => {
  chat.setCurrentChatId(failedFreshChatBinding.chatId);
  const error = new Error("Directive could not persist fresh campaign chat Author's Note isolation.");
  error.code = 'DIRECTIVE_FRESH_CHAT_PROMPT_HYGIENE_FAILED';
  error.retryable = true;
  error.createdBinding = structuredClone(failedFreshChatBinding);
  throw error;
};
await assert.rejects(
  app.acceptCreatorDraftAndStartCampaign(),
  (error) => error?.code === 'DIRECTIVE_FRESH_CHAT_PROMPT_HYGIENE_FAILED'
);
host.chat.createOrBindCampaignChat = createOrBindCampaignChat;
const recoverableCampaignView = await app.getCurrentView({ tabId: 'campaign' });
assert.equal(recoverableCampaignView.activeScreen, 'campaign');
assert.equal(recoverableCampaignView.creator, null);
assert.equal(recoverableCampaignView.campaignIndex.campaigns.length, 1);
assert.equal(recoverableCampaignView.campaignState, null);
assert.equal(host.chat.getCurrentChatId(), chatBeforeFailedCampaignStart);
assert.equal(
  chat.calls().some((call) => (
    call.type === 'deleteCampaignChat'
    && call.chatId === failedFreshChatBinding.chatId
  )),
  true,
  'a fresh chat that fails prompt hygiene before binding returns must be deleted after reopening the prior chat'
);
assert.equal(
  (await host.storage.readJson(V1_STORAGE_PATHS.save(recoverableCampaignView.activeSaveId))).state.campaignChatBinding?.chatId ?? null,
  null,
  'failed host binding must restore the persisted first save to its unbound state'
);
await app.openCampaignChat({ saveId: recoverableCampaignView.activeSaveId });
const missionView = await app.getCurrentView({ tabId: 'mission' });
assert.equal(narrationPresetLifecycle.includes('activate'), true, 'opening a bound campaign chat must activate the Directive narration preset');
assert.equal(missionView.campaignState.campaign.status, 'active');
assert.equal(missionView.campaignState.campaignChatBinding.kind, 'directive.campaignChatBinding.v1');
assert.equal(missionView.v1PlayerProjection.kind, 'directive.playerProjection.v1');
assert.equal(chat.messages().filter((message) => !message.isUser).length, 1);
const boundCampaignChatId = missionView.campaignState.campaignChatBinding.chatId;

const exactCurrentBinding = host.chat.getCurrentBinding;
host.chat.getCurrentBinding = () => ({
  ...exactCurrentBinding.call(host.chat),
  entityId: 'different-character'
});
assert.equal(
  (await app.getCurrentView({ tabId: 'mission' })).campaignState,
  null,
  'a matching chat filename under a different character must not receive campaign authority'
);
host.chat.getCurrentBinding = exactCurrentBinding;
assert.equal((await app.getCurrentView({ tabId: 'mission' })).campaignState?.campaign?.status, 'active');

let releaseExternalCampaignLease;
let reportExternalCampaignLease;
const externalCampaignLeaseEntered = new Promise((resolve) => { reportExternalCampaignLease = resolve; });
const externalCampaignLeaseRelease = new Promise((resolve) => { releaseExternalCampaignLease = resolve; });
const staleActiveSavePath = V1_STORAGE_PATHS.save(missionView.activeSaveId);
const saveBeforeExternalMutation = await host.storage.readJson(staleActiveSavePath);
const externalCampaignLease = withCampaignTimelineLease(missionView.campaignState.campaign.id, async () => {
  const externallyUpdated = structuredClone(saveBeforeExternalMutation);
  externallyUpdated.state.settings.simulationMode = 'Exploration';
  externallyUpdated.updatedAt = '2026-08-10T04:00:00.000Z';
  await host.storage.writeJson(staleActiveSavePath, externallyUpdated);
  reportExternalCampaignLease();
  await externalCampaignLeaseRelease;
});
await externalCampaignLeaseEntered;
let crossRuntimeMutationResolved = false;
const crossRuntimeMutation = app.reserveCommandBearingEdge().then((result) => {
  crossRuntimeMutationResolved = true;
  return result;
});
await new Promise((resolve) => setImmediate(resolve));
assert.equal(
  crossRuntimeMutationResolved,
  false,
  'accepted-state mutations must share the campaign lease with a second Directive runtime instance'
);
releaseExternalCampaignLease();
await externalCampaignLease;
await assert.rejects(
  crossRuntimeMutation,
  (error) => error?.code === 'DIRECTIVE_TIMELINE_PARENT_STALE'
);
await host.storage.writeJson(staleActiveSavePath, saveBeforeExternalMutation);

const importedCampaignPortrait = await app.importCampaignPlayerPortrait({
  bytes: new Uint8Array([13, 14, 15, 16]),
  mimeType: 'image/png',
  fileName: 'active-campaign.png'
});
const importedCampaignPortraitPath = importedCampaignPortrait.portrait.asset.path;
assert.match(importedCampaignPortraitPath, /^\/user\/files\/directive-player-portrait-/);
assert.equal(
  (await app.getCurrentView({ tabId: 'crew' })).campaignState.player.portrait.asset.path,
  importedCampaignPortraitPath,
  'active campaign portrait import must update the current runtime state'
);
assert.equal(
  (await host.storage.readJson(V1_STORAGE_PATHS.save(missionView.activeSaveId))).state.player.portrait.asset.path,
  importedCampaignPortraitPath,
  'active campaign portrait import must persist the authoritative save'
);

const deleteFileBeforeCampaignReplacement = host.storage.deleteFile;
let persistedPathAtCampaignReplacementCleanup = null;
host.storage.deleteFile = async (path, options) => {
  if (path === importedCampaignPortraitPath) {
    persistedPathAtCampaignReplacementCleanup = (
      await host.storage.readJson(V1_STORAGE_PATHS.save(missionView.activeSaveId))
    ).state.player.portrait.asset.path;
  }
  return deleteFileBeforeCampaignReplacement.call(host.storage, path, options);
};
const replacedCampaignPortrait = await app.importCampaignPlayerPortrait({
  bytes: new Uint8Array([17, 18, 19, 20]),
  mimeType: 'image/webp',
  fileName: 'active-campaign-replacement.webp'
});
host.storage.deleteFile = deleteFileBeforeCampaignReplacement;
assert.deepEqual(replacedCampaignPortrait.previousCleanup, {
  attempted: true,
  deleted: true,
  path: importedCampaignPortraitPath
});
assert.equal(
  persistedPathAtCampaignReplacementCleanup,
  replacedCampaignPortrait.portrait.asset.path,
  'replacement must persist before Directive deletes the superseded portrait file'
);

const writeJsonBeforeFailedCampaignPortrait = host.storage.writeJson;
const storedBeforeFailedCampaignPortrait = storedPortraitPaths.length;
const deletedBeforeFailedCampaignPortrait = deletedPortraitPaths.length;
host.storage.writeJson = async (path, value) => {
  if (path === V1_STORAGE_PATHS.save(missionView.activeSaveId)) {
    throw new Error('fake active campaign portrait persistence failure');
  }
  return writeJsonBeforeFailedCampaignPortrait.call(host.storage, path, value);
};
await assert.rejects(
  app.importCampaignPlayerPortrait({
    bytes: new Uint8Array([21, 22, 23, 24]),
    mimeType: 'image/png',
    fileName: 'active-campaign-rollback.png'
  }),
  (error) => error?.code === 'DIRECTIVE_V1_STATE_PERSISTENCE_FAILED'
);
host.storage.writeJson = writeJsonBeforeFailedCampaignPortrait;
assert.equal(storedPortraitPaths.length, storedBeforeFailedCampaignPortrait + 1);
assert.equal(deletedPortraitPaths.length, deletedBeforeFailedCampaignPortrait + 1);
assert.equal(deletedPortraitPaths.at(-1), storedPortraitPaths.at(-1));
assert.equal(
  (await app.getCurrentView({ tabId: 'crew' })).campaignState.player.portrait.asset.path,
  replacedCampaignPortrait.portrait.asset.path,
  'failed portrait persistence must retain the prior in-memory portrait'
);

const deleteFileBeforeCampaignRemoval = host.storage.deleteFile;
let persistedPortraitAtCampaignRemovalCleanup = 'not-observed';
host.storage.deleteFile = async (path, options) => {
  if (path === replacedCampaignPortrait.portrait.asset.path) {
    persistedPortraitAtCampaignRemovalCleanup = (
      await host.storage.readJson(V1_STORAGE_PATHS.save(missionView.activeSaveId))
    ).state.player.portrait;
  }
  return deleteFileBeforeCampaignRemoval.call(host.storage, path, options);
};
const removedCampaignPortrait = await app.removeCampaignPlayerPortrait();
host.storage.deleteFile = deleteFileBeforeCampaignRemoval;
assert.deepEqual(removedCampaignPortrait.portraitCleanup, {
  attempted: true,
  deleted: true,
  path: replacedCampaignPortrait.portrait.asset.path
});
assert.equal(persistedPortraitAtCampaignRemovalCleanup, null);
assert.equal((await app.getCurrentView({ tabId: 'crew' })).campaignState.player.portrait, null);

chat.setCurrentChatId('unbound-preset-lifecycle');
const clearsBeforeUnboundInterception = host.prompt.calls().filter((call) => call.type === 'clear').length;
const unboundInterception = await app.getChatTurnOrchestrator().interceptGeneration();
assert.deepEqual(unboundInterception, { handled: false, reason: 'inactive-or-unbound' });
assert.equal(host.prompt.inspect().blocks.length, 0, 'an unbound generation boundary must clear stale Directive context');
await app.getChatTurnOrchestrator().interceptGeneration();
assert.equal(
  host.prompt.calls().filter((call) => call.type === 'clear').length,
  clearsBeforeUnboundInterception + 2,
  'every unbound generation boundary must clear the namespaced Directive prompt'
);
await app.handleHostChatChanged();
assert.equal(narrationPresetLifecycle.at(-1), 'restore', 'leaving a bound campaign chat must restore the prior preset');
await app.openCampaignChat({ saveId: missionView.activeSaveId });
assert.equal(narrationPresetLifecycle.at(-1), 'activate', 'reopening a bound campaign chat must reactivate Directive narration');

const immediatePresetActivation = host.presets.activateNarrationPreset;
let releasePendingPresetActivation;
let reportPendingPresetActivation;
const pendingPresetActivationStarted = new Promise((resolve) => { reportPendingPresetActivation = resolve; });
const pendingPresetActivation = new Promise((resolve) => { releasePendingPresetActivation = resolve; });
host.presets.activateNarrationPreset = async () => {
  narrationPresetLifecycle.push('activate-pending');
  reportPendingPresetActivation();
  await pendingPresetActivation;
  return { ok: true, active: true };
};
const pendingBoundRefresh = app.handleHostChatChanged();
await pendingPresetActivationStarted;
chat.setCurrentChatId('unbound-during-preset-activation');
releasePendingPresetActivation();
await pendingBoundRefresh;
assert.equal(
  host.prompt.inspect().blocks.length,
  0,
  'a chat switch during preset activation must not install stale campaign context into the unbound chat'
);
host.presets.activateNarrationPreset = immediatePresetActivation;
await app.openCampaignChat({ saveId: missionView.activeSaveId });
assert.equal(chat.getCurrentChatId(), boundCampaignChatId);

const immediateRecentMessages = host.chat.getRecentMessages;
let releasePendingMessageRead;
let reportPendingMessageRead;
const pendingMessageReadStarted = new Promise((resolve) => { reportPendingMessageRead = resolve; });
const pendingMessageRead = new Promise((resolve) => { releasePendingMessageRead = resolve; });
host.chat.getRecentMessages = async (...args) => {
  reportPendingMessageRead();
  await pendingMessageRead;
  return immediateRecentMessages.apply(host.chat, args);
};
const pendingHistoryRefresh = app.handleHostChatChanged();
await pendingMessageReadStarted;
chat.setCurrentChatId('unbound-during-history-read');
releasePendingMessageRead();
await pendingHistoryRefresh;
assert.equal(
  host.prompt.inspect().blocks.length,
  0,
  'a chat switch during the asynchronous history read must not install campaign context into the unbound chat'
);
host.chat.getRecentMessages = immediateRecentMessages;
await app.openCampaignChat({ saveId: missionView.activeSaveId });
assert.equal(chat.getCurrentChatId(), boundCampaignChatId);

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
assert.match(installedPrompt, /COMMAND MODE - FULL SIMULATION/);
assert.match(installedPrompt, /There is no protagonist protection/);
assert.match(installedPrompt, /do not default to the safest credible outcome/);
assert.match(installedPrompt, /miraculous rescue or last-second intervention/);
assert.match(installedPrompt, /supersedes any general instruction to keep uncommitted consequences local, reversible, or nonfatal/);
assert.match(installedPrompt, /Story Settlement remains the only durable semantic authority/);
assert.match(installedPrompt, /Narrate consequences only when supported by accepted state, visible causality, and the selected difficulty policy/);
assert.doesNotMatch(installedPrompt, /trackers, or consequences/);
assert.doesNotMatch(installedPrompt, /Directive Command Causality|active Directive preset|required Directive preset/);

const activeSavePath = V1_STORAGE_PATHS.save(missionView.activeSaveId);
const explorationFiles = jsonStorage.snapshot();
explorationFiles[activeSavePath].state.settings.simulationMode = 'Exploration';
const explorationChat = createFakeChatAdapter({ chatId: boundCampaignChatId });
await explorationChat.updateBindingMetadata(explorationFiles[activeSavePath].state.campaignChatBinding);
const explorationHost = createFakeDirectiveHost({
  chatNative: true,
  chat: explorationChat,
  storage: createFakeJsonStorage(explorationFiles)
});
const explorationApp = createDirectiveRuntimeApp({
  host: explorationHost,
  packageLoader: async () => structuredClone(records),
  idFactory: (prefix) => `${prefix}.exploration`,
  now: () => '2026-08-10T03:30:00.000Z'
});
await explorationApp.initialize();
await explorationApp.openCampaignChat({ saveId: missionView.activeSaveId });
const explorationPrompt = explorationHost.prompt.inspect().blocks[0]?.text || '';
assert.match(explorationPrompt, /"simulationMode": "Exploration"/);
assert.match(explorationPrompt, /EXPLORATION MODE - STORY-FORWARD/);
assert.match(explorationPrompt, /strongest causally adjacent nonfatal result/);
assert.match(explorationPrompt, /do not erase danger, turn failure into success, or make opposition incompetent/i);
assert.doesNotMatch(explorationPrompt, /COMMAND MODE - FULL SIMULATION/);

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

assert.equal((await app.reserveCohesionRelief({ issueId: 'issue.not-visible' })).reasonCode, 'cohesion-target-unavailable');
const reliefTarget = (await app.buildV1PlayerProjection()).projection.ship.cohesion.visibleTasks[0];
const reservedRelief = await app.reserveCohesionRelief({ issueId: reliefTarget.id });
assert.equal(reservedRelief.applied, true);
assert.equal(reservedRelief.commandBearing.spends[reservedRelief.spendId].effect, 'cohesionRelief');
assert.equal(reservedRelief.commandBearing.spends[reservedRelief.spendId].cohesion, reliefTarget.reward.cohesion);
assert.equal((await app.buildV1PlayerProjection()).projection.commandBearing.pendingCohesionRelief.targetIssueId, reliefTarget.id);
assert.equal((await app.cancelCohesionRelief()).applied, true);

const reserved = await app.reserveCommandBearingEdge();
assert.equal(reserved.applied, true);
assert.equal(reserved.commandBearing.balance, 0);
assert.equal(reserved.commandBearing.spends[reserved.spendId].status, 'reserved');
assert.doesNotMatch(host.prompt.inspect().blocks[0]?.text || '', /COMMAND BEARING EDGE IS ARMED/);

const opening = chat.messages()[0];
const player = chat.pushPlayerMessage({ text: 'I take the chair opposite Whitaker and open the handover packet.' });
const acceptedHistoryReads = [];
const acceptedHistoryReader = host.chat.getRecentMessages;
host.chat.getRecentMessages = (options) => {
  acceptedHistoryReads.push(options);
  return acceptedHistoryReader(options);
};
const settled = await app.observeHostPlayerMessage({ message: player });
host.chat.getRecentMessages = acceptedHistoryReader;
assert.equal(acceptedHistoryReads.some((options) => (
  options?.limit === Number.MAX_SAFE_INTEGER && options?.playerSafeOnly === false
)), true, 'accepted-pair custody must read complete raw chat source');
assert.equal(settled.handled, true);
assert.equal(settled.mission.ok, false);
assert.equal(settled.mission.reasonCode, 'provider-empty');
assert.equal(
  generation.calls().some((call) => call.role === 'timeAdvanceAdjudicator'),
  false,
  'Accepted-pair settlement must not issue a separate story-time model call.'
);
assert.equal((await app.getCurrentView({ tabId: 'mission' })).campaignState.storySettlement.revision, 0);
assert.equal((await app.getCurrentView({ tabId: 'people' })).campaignState.commandBearing.spends[reserved.spendId].status, 'reserved');
const activationsBeforeGeneration = narrationPresetLifecycle.filter((entry) => entry === 'activate').length;
const intercepted = await app.getChatTurnOrchestrator().interceptGeneration();
assert.ok(
  narrationPresetLifecycle.filter((entry) => entry === 'activate').length > activationsBeforeGeneration,
  'every bound host generation must reassert the Directive narration preset before prompt synchronization'
);
assert.equal(intercepted.acceptedPairReplay.replayed, 1);
assert.equal(intercepted.acceptedPairReplay.retryPending, false);
assert.equal(missionInterpretationCalls, 2);
const acceptedPairRequest = generation.calls().find((call) => call.role === 'acceptedPairMissionEvidence')?.request;
assert.match(acceptedPairRequest.messages[1].content, /"secondOfDay": 30600/);
assert.match(acceptedPairRequest.messages[1].content, /"elapsedSeconds": 0/);
assert.match(acceptedPairRequest.messages[1].content, /I take the chair opposite Whitaker/);
assert.ok((await app.getCurrentView({ tabId: 'mission' })).campaignState.storySettlement.revision > 0);
assert.equal(
  (await app.getCurrentView({ tabId: 'mission' })).campaignState.timeLedger.elapsedSeconds,
  47,
  'The shared accepted-pair interpretation must commit time before mission settlement.'
);
assert.equal((await app.getCurrentView({ tabId: 'people' })).campaignState.commandBearing.spends[reserved.spendId].status, 'armed');
assert.match(host.prompt.inspect().blocks[0]?.text || '', /COMMAND BEARING EDGE IS ARMED/);
assert.match(host.prompt.inspect().blocks[0]?.text || '', /DUTY REPORT: Deliver pendingDutyReport/);
assert.match(host.prompt.inspect().blocks[0]?.text || '', /SHIP OPERATIONAL MECHANICS/);
assert.match(host.prompt.inspect().blocks[0]?.text || '', /ship-system\.systems-integration/);
assert.match(host.prompt.inspect().blocks[0]?.text || '', /ship-constraint\.integration-cascade-risk/);
const dutyReportText = createDutyReportVisibleSegment({
  kind: 'directive.dutyReportPacket.v1',
  reportId: 'report.hesperus.distress',
  reporterId: 'priya-nayar',
  urgency: 'urgent',
  confidence: 'confirmed',
  deliveryRequirement: 'required',
  playerText: { summary: 'Operations has received a civilian distress call requiring command attention.' }
}).canonicalText;
const acceptedRevision = (await app.getCurrentView({ tabId: 'mission' })).campaignState.stateCustody.revision;
assert.ok(acceptedRevision > 1);

const provisional = chat.pushAssistantMessage({
  text: `Nayar steps forward. ${dutyReportText}`,
  hostMessageId: 'assistant.provisional',
  swipes: ['Whitaker closes the packet.', `Nayar steps forward. ${dutyReportText}`],
  swipeId: 1
});
const attachedDutyReport = await app.handleHostGenerationEnded({ message: provisional });
assert.deepEqual(attachedDutyReport, {
  handled: true,
  status: 'duty-report-custody-attached',
  hostMessageId: 'assistant.provisional',
  reportId: 'report.hesperus.distress'
});
const hostedReportMessage = chat.messages().find((message) => message.hostMessageId === 'assistant.provisional');
assert.equal(hostedReportMessage.isDirectiveOwned, false, 'Duty Report custody must not take ownership of host narration');
assert.equal(hostedReportMessage.extra.runtimeMetadata.responseId, 'host-response.assistant.provisional');
assert.equal(hostedReportMessage.extra.runtimeMetadata.dutyReportManifest.reportId, 'report.hesperus.distress');
await app.handleHostMessageSelectedSwipeChanged({ message: provisional });
const afterSwipeRevision = (await app.getCurrentView({ tabId: 'mission' })).campaignState.stateCustody.revision;
assert.ok(afterSwipeRevision >= acceptedRevision);
assert.equal((await app.getCurrentView({ tabId: 'people' })).campaignState.commandBearing.spends[reserved.spendId].status, 'armed');

const nextPlayer = chat.pushPlayerMessage({ text: '“Let us start with where you need me most.”' });
await app.observeHostPlayerMessage({ message: nextPlayer });
const finalRevision = (await app.getCurrentView({ tabId: 'mission' })).campaignState.stateCustody.revision;
assert.ok(finalRevision > afterSwipeRevision);
assert.equal((await app.getCurrentView({ tabId: 'people' })).campaignState.commandBearing.spends[reserved.spendId].status, 'committed');
assert.equal(
  (await app.getCurrentView({ tabId: 'mission' })).campaignState.mission.v1.knownFacts.includes('fact.hesperus.distress-established'),
  true,
  'accepted host narration with attached custody settles the Duty Report route'
);
assert.doesNotMatch(host.prompt.inspect().blocks[0]?.text || '', /COMMAND BEARING EDGE IS ARMED/);
assert.doesNotMatch(host.prompt.inspect().blocks[0]?.text || '', /"reportId": "report\.hesperus\.distress"/);
assert.equal(opening.text.endsWith('*Stardate 53068.4 | 08:30:00 hours*'), true);
assert.equal(opening.text.startsWith('*Stardate'), false);

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
assert.notEqual(continuedCheckpoint.timeline.id, disposableCheckpoint.checkpoint.parentSaveId);
assert.equal(continuedCheckpoint.timeline.state.campaignChatBinding.saveId, continuedCheckpoint.timeline.id);
assert.notEqual(continuedCheckpoint.timeline.state.campaignChatBinding.chatId, checkpointChatId);
assert.deepEqual(
  await host.storage.readJson(V1_STORAGE_PATHS.save(disposableCheckpoint.checkpoint.id)),
  disposableCheckpoint.checkpoint,
  'loading must not mutate the selected immutable saved game'
);
assert.ok(continuedCheckpoint.transaction.savedGameId, 'loading preserves the timeline being left');
await app.deleteSave({ checkpointId: continuedCheckpoint.transaction.savedGameId });
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

const delayedCloneCampaignChat = host.chat.cloneCampaignChat;
let releaseDelayedClone;
let reportDelayedCloneStarted;
const delayedCloneStarted = new Promise((resolve) => { reportDelayedCloneStarted = resolve; });
const delayedCloneRelease = new Promise((resolve) => { releaseDelayedClone = resolve; });
let reentrantCloneChatChangedCount = 0;
host.chat.cloneCampaignChat = async (options) => {
  reportDelayedCloneStarted();
  await delayedCloneRelease;
  const cloned = await delayedCloneCampaignChat(options);
  reentrantCloneChatChangedCount += 1;
  await app.handleHostChatChanged({ source: 'synchronous-clone-character-selection-test' });
  return cloned;
};
const delayedSave = app.saveGame({ name: 'Clone before publication' });
await delayedCloneStarted;
assert.equal(
  (await app.getCurrentView({ tabId: 'campaign' })).campaignIndex.campaigns[0].checkpoints.length,
  0,
  'Save Game must not publish a checkpoint while its immutable chat clone is unfinished'
);
let concurrentReservationResolved = false;
const concurrentReservation = app.reserveCommandBearingEdge().then((result) => {
  concurrentReservationResolved = true;
  return result;
});
await new Promise((resolve) => setImmediate(resolve));
assert.equal(
  concurrentReservationResolved,
  false,
  'accepted-state mutations must wait behind an in-flight Save Game operation'
);
releaseDelayedClone();
const delayedCheckpoint = await delayedSave;
assert.ok(reentrantCloneChatChangedCount > 0, 'Save Game must tolerate an awaited CHAT_CHANGED during clone character selection');
const concurrentReservationResult = await concurrentReservation;
host.chat.cloneCampaignChat = delayedCloneCampaignChat;
assert.equal(concurrentReservationResult.applied, true);
assert.equal((await app.cancelCommandBearingEdge()).applied, true);
assert.ok(delayedCheckpoint.checkpoint.state.campaignChatBinding.transcriptAttestation);
await app.deleteSave({ checkpointId: delayedCheckpoint.checkpoint.id });

const authoritativeBeforeDeferredSwitch = (await app.getCurrentView({ tabId: 'mission' })).campaignState.campaignChatBinding;
const cloneBeforeDeferredSwitch = host.chat.cloneCampaignChat;
let deferredUserSwitchAcknowledged = false;
host.chat.cloneCampaignChat = async (options) => {
  const cloned = await cloneBeforeDeferredSwitch(options);
  chat.setCurrentChatId('unrelated-same-character-chat');
  const acknowledgement = await app.handleHostChatChanged({ source: 'user-switch-during-clone' });
  deferredUserSwitchAcknowledged = acknowledgement.deferred === true;
  return cloned;
};
const deferredSwitchSave = await app.saveGame({ name: 'Deferred user switch checkpoint' });
host.chat.cloneCampaignChat = cloneBeforeDeferredSwitch;
assert.equal(deferredUserSwitchAcknowledged, true, 'a synchronous chat event must release the host without deadlocking');
await app.handleHostChatChanged({ source: 'await-deferred-reconciliation' });
assert.equal(
  (await app.getCurrentView({ tabId: 'mission' })).campaignState,
  null,
  'an unrelated user chat switch during cloning must be reconciled after the Save Game queue releases'
);
assert.equal(host.prompt.inspect().blocks.length, 0, 'deferred reconciliation must clear campaign prompt authority from the unrelated chat');
await host.chat.openCampaignChat(authoritativeBeforeDeferredSwitch);
await app.handleHostChatChanged({ source: 'restore-after-deferred-switch-test' });
await app.deleteSave({ checkpointId: deferredSwitchSave.checkpoint.id });

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
const cloneBeforePortraitLoadRace = host.chat.cloneCampaignChat;
let releasePortraitLoadClone;
let reportPortraitLoadClone;
const portraitLoadCloneStarted = new Promise((resolve) => { reportPortraitLoadClone = resolve; });
const portraitLoadCloneRelease = new Promise((resolve) => { releasePortraitLoadClone = resolve; });
host.chat.cloneCampaignChat = async (options) => {
  if (options.sourceChatId === restoreFailureCheckpoint.checkpoint.state.campaignChatBinding.chatId) {
    reportPortraitLoadClone();
    await portraitLoadCloneRelease;
  }
  return cloneBeforePortraitLoadRace(options);
};
const portraitRaceLoad = app.loadCheckpoint({ checkpointId: restoreFailureCheckpoint.checkpoint.id });
await portraitLoadCloneStarted;
let portraitRaceResolved = false;
const portraitRaceImport = app.importCampaignPlayerPortrait({
  bytes: new Uint8Array([31, 32, 33, 34]),
  mimeType: 'image/png',
  fileName: 'load-race.png'
}).then((result) => {
  portraitRaceResolved = true;
  return result;
});
await new Promise((resolve) => setImmediate(resolve));
assert.equal(portraitRaceResolved, false, 'portrait authority must wait behind an in-flight Load Game transaction');
releasePortraitLoadClone();
const [portraitRaceTimeline, portraitAfterLoad] = await Promise.all([portraitRaceLoad, portraitRaceImport]);
host.chat.cloneCampaignChat = cloneBeforePortraitLoadRace;
assert.equal(
  (await host.storage.readJson(V1_STORAGE_PATHS.save((await host.storage.readJson(V1_STORAGE_PATHS.index)).activeSaveId))).state.player.portrait.asset.path,
  portraitAfterLoad.portrait.asset.path,
  'a portrait queued during Load Game must commit to the new active child rather than resurrect the parent'
);
assert.equal(
  (await host.storage.readJson(V1_STORAGE_PATHS.index)).activeSaveId,
  portraitRaceTimeline.timeline.id,
  'portrait mutation must not reactivate the timeline retired by Load Game'
);
const stateBeforeFailedRestore = (await app.getCurrentView({ tabId: 'mission' })).campaignState;
const openCampaignChat = host.chat.openCampaignChat;
host.chat.openCampaignChat = async () => false;
await assert.rejects(
  app.loadCheckpoint({ checkpointId: restoreFailureCheckpoint.checkpoint.id }),
  (error) => error?.code === 'DIRECTIVE_LOAD_GAME_CHILD_OPEN_FAILED'
);
host.chat.openCampaignChat = openCampaignChat;
assert.notDeepEqual(
  (await app.getCurrentView({ tabId: 'mission' })).campaignState,
  stateBeforeFailedRestore,
  'after the active-pointer commit, recovery must move forward rather than overwrite the prior timeline'
);
const failedContinuationClone = [...chat.calls()].reverse().find((call) => (
  call.type === 'cloneCampaignChat'
  && call.sourceChatId === restoreFailureCheckpoint.checkpoint.state.campaignChatBinding.chatId
));
assert.equal(failedContinuationClone.options.open, false);
const recoveredLoad = await app.handleHostChatChanged();
assert.equal(recoveredLoad.timelineFork.status, 'recovered');
assert.equal(chat.getCurrentChatId(), failedContinuationClone.branchChatId);
await app.deleteSave({ checkpointId: recoveredLoad.timelineFork.savedGameId });
await app.deleteSave({ checkpointId: restoreFailureCheckpoint.checkpoint.id });

const retryView = await app.getCurrentView({ tabId: 'mission' });
const retrySavePath = V1_STORAGE_PATHS.save(retryView.activeSaveId);
const retryWriteJson = host.storage.writeJson;
let transientPersistenceAttempts = 0;
host.storage.writeJson = async (path, value) => {
  if (path === retrySavePath) {
    transientPersistenceAttempts += 1;
    if (transientPersistenceAttempts <= 2) throw new Error(`transient settlement persistence ${transientPersistenceAttempts}`);
  }
  return retryWriteJson.call(host.storage, path, value);
};
chat.pushAssistantMessage({
  text: 'Whitaker reviews the next item without changing the tactical situation.',
  hostMessageId: 'assistant.persistence-retry'
});
const retryPlayer = chat.pushPlayerMessage({
  text: 'I acknowledge the item and continue.',
  hostMessageId: 'player.persistence-retry'
});
const generationBeforePersistenceRetry = missionInterpretationCalls;
const revisionBeforePersistenceRetry = retryView.campaignState.stateCustody.revision;
const persistenceRetried = await app.observeHostPlayerMessage({ message: retryPlayer });
host.storage.writeJson = retryWriteJson;
assert.equal(persistenceRetried.mission.ok, true);
assert.equal(persistenceRetried.persistenceAttempts, 3);
assert.equal(transientPersistenceAttempts, 3);
assert.equal(missionInterpretationCalls, generationBeforePersistenceRetry + 1);
assert.equal(
  (await app.getCurrentView({ tabId: 'mission' })).campaignState.stateCustody.revision,
  revisionBeforePersistenceRetry + 1,
  'failed persistence attempts must not leave extra custody revisions'
);

let exhaustedPersistenceAttempts = 0;
host.storage.writeJson = async (path, value) => {
  if (path === retrySavePath && exhaustedPersistenceAttempts < 3) {
    exhaustedPersistenceAttempts += 1;
    throw new Error(`exhausted settlement persistence ${exhaustedPersistenceAttempts}`);
  }
  return retryWriteJson.call(host.storage, path, value);
};
chat.pushAssistantMessage({
  text: 'The bridge waits for the next acknowledged instruction.',
  hostMessageId: 'assistant.persistence-block'
});
const blockedPlayer = chat.pushPlayerMessage({
  text: 'Proceed with the acknowledged instruction.',
  hostMessageId: 'player.persistence-block'
});
const generationBeforeBlockedPersistence = missionInterpretationCalls;
const persistenceBlocked = await app.observeHostPlayerMessage({ message: blockedPlayer });
assert.equal(persistenceBlocked.mission.ok, false);
assert.equal(persistenceBlocked.mission.reasonCode, 'persistence-failed');
assert.equal(persistenceBlocked.persistenceAttempts, 3);
assert.equal(persistenceBlocked.settlementBlocked, true);
assert.equal(exhaustedPersistenceAttempts, 3);
assert.equal(missionInterpretationCalls, generationBeforeBlockedPersistence + 1);
host.storage.writeJson = retryWriteJson;
const manuallyRetried = await app.retryPendingAcceptedPairSettlement();
assert.equal(manuallyRetried.ok, true);
assert.equal(manuallyRetried.settlementBlocked, false);
assert.equal(missionInterpretationCalls, generationBeforeBlockedPersistence + 1);

const beforeAtomicInvalidationFailure = (await app.getCurrentView({ tabId: 'mission' })).campaignState;
host.storage.writeJson = async (path, value) => {
  if (path === retrySavePath) throw new Error('forced atomic invalidation persistence failure');
  return retryWriteJson.call(host.storage, path, value);
};
const failedAtomicInvalidation = await app.handleHostMessageDeleted({ hostMessageId: 'player.persistence-block' });
host.storage.writeJson = retryWriteJson;
assert.equal(failedAtomicInvalidation.mission.ok, false);
assert.equal(failedAtomicInvalidation.mission.reasonCode, 'persistence-failed');
const afterAtomicInvalidationFailure = (await app.getCurrentView({ tabId: 'mission' })).campaignState;
assert.deepEqual(afterAtomicInvalidationFailure.timeLedger, beforeAtomicInvalidationFailure.timeLedger);
assert.deepEqual(afterAtomicInvalidationFailure.mission, beforeAtomicInvalidationFailure.mission);
assert.deepEqual(afterAtomicInvalidationFailure.storySettlement, beforeAtomicInvalidationFailure.storySettlement);

const elapsedBeforeMissingSource = afterAtomicInvalidationFailure.timeLedger.elapsedSeconds;
const completeChat = chat.messages().filter((message) => ![
  'assistant.persistence-block',
  'player.persistence-block'
].includes(message.hostMessageId));
for (let index = 0; index < 510; index += 1) {
  completeChat.push({
    id: `system.filler.${index}`,
    hostMessageId: `system.filler.${index}`,
    text: 'inactive system filler',
    isUser: false,
    isSystem: true,
    role: 'system'
  });
}
chat.setMessagesForChat(chat.getCurrentChatId(), completeChat);
const reconciledMissingSource = await app.handleHostChatChanged();
assert.equal(reconciledMissingSource.acceptedPairReplay.blocked, false);
assert.ok(reconciledMissingSource.acceptedPairReplay.reconciled >= 1);
assert.equal(
  (await app.getCurrentView({ tabId: 'mission' })).campaignState.timeLedger.elapsedSeconds,
  elapsedBeforeMissingSource - 47,
  'complete-chat reconciliation must remove an accepted pair outside the last 500 rows'
);

chat.pushAssistantMessage({
  text: 'The bridge pauses while the next command is considered.',
  hostMessageId: 'assistant.analysis-cancel'
});
const cancellationPlayer = chat.pushPlayerMessage({
  text: 'Hold that thought.',
  hostMessageId: 'player.analysis-cancel'
});
let releaseHeldInterpretationStarted = null;
const heldInterpretationStarted = new Promise((resolve) => { releaseHeldInterpretationStarted = resolve; });
reportHeldInterpretationStarted = releaseHeldInterpretationStarted;
holdMissionInterpretation = true;
const canceledSettlementPending = app.observeHostPlayerMessage({ message: cancellationPlayer });
await heldInterpretationStarted;
const stoppedAnalysis = await app.handleHostGenerationStopped();
assert.deepEqual(stoppedAnalysis, {
  ok: true,
  canceled: true,
  reason: 'directive-analysis-aborted'
});
const canceledRuntimeSettlement = await canceledSettlementPending;
assert.equal(canceledRuntimeSettlement.mission.ok, false);
assert.equal(canceledRuntimeSettlement.mission.reasonCode, 'provider-aborted');
holdMissionInterpretation = false;
reportHeldInterpretationStarted = null;
const noActiveAnalysis = await app.handleHostGenerationStopped();
assert.deepEqual(noActiveAnalysis, {
  ok: true,
  canceled: false,
  reason: 'no-directive-analysis-active'
});
const replayAfterCancellation = await app.getChatTurnOrchestrator().interceptGeneration();
assert.equal(replayAfterCancellation.acceptedPairReplay.blocked, false);

const beforeCampaignDeletion = await app.getCurrentView({ tabId: 'campaign' });
const deletionCampaignId = beforeCampaignDeletion.campaignState.campaign.id;
const deleteCampaignCharacter = host.chat.deleteCampaignCharacter;
host.chat.deleteCampaignCharacter = async () => {
  const error = new Error('fake character deletion failure');
  error.code = 'FAKE_CHARACTER_DELETE_FAILED';
  throw error;
};
await assert.rejects(
  app.deleteCampaign({ campaignId: deletionCampaignId }),
  (error) => error?.code === 'FAKE_CHARACTER_DELETE_FAILED'
);
host.chat.deleteCampaignCharacter = deleteCampaignCharacter;
const afterFailedCampaignDeletion = await app.getCurrentView({ tabId: 'campaign' });
assert.equal(afterFailedCampaignDeletion.campaignIndex.campaigns.length, 1);
assert.equal(afterFailedCampaignDeletion.activeSaveId, beforeCampaignDeletion.activeSaveId);
assert.notEqual(afterFailedCampaignDeletion.campaignState, null);

const campaignDeletion = await app.deleteCampaign({ campaignId: deletionCampaignId });
assert.equal(campaignDeletion.hostDeletion.deleted, true);
assert.equal(campaignDeletion.result.deleted, true);
assert.equal(campaignDeletion.view.activeScreen, 'campaign');
assert.equal(campaignDeletion.view.campaignIndex.campaigns.length, 0);
assert.equal(campaignDeletion.view.activeSaveId, null);
assert.equal(campaignDeletion.view.campaignState, null);
assert.equal(
  chat.calls().some((call) => call.type === 'deleteCampaignCharacter'),
  true
);
assert.equal(host.prompt.inspect().blocks.length, 0);

console.log('PASS V1 runtime app');
