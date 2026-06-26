import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createFakeChatAdapter, createFakePromptAdapter } from '../../src/hosts/fake/fake-host.mjs';
import {
  __campaignActivationCoordinatorTestHooks,
  createCampaignActivationCoordinator
} from '../../src/runtime/campaign-activation-coordinator.mjs';
import { createCampaignConclusionService } from '../../src/runtime/campaign-conclusion-service.mjs';
import { initializeCampaignRuntimeTracking } from '../../src/runtime/state-delta-gateway.mjs';

const root = process.cwd();
const readJson = (filePath) => JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
const cloneJson = (value) => JSON.parse(JSON.stringify(value));
const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const crewDataset = readJson('packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json');

const chat = createFakeChatAdapter({
  chatId: 'setup-chat',
  messages: [{ id: 'pre-campaign-message', text: 'This setup message must not enter the fresh campaign chat.', isUser: false }]
});
const prompt = createFakePromptAdapter();
const generationCalls = [];
const generationRequests = [];
const secondPersonNarrationContext = {
  kind: 'directive.narrationPresetContext',
  roleId: 'campaignIntro',
  activePresetName: 'Directive',
  compatible: true,
  source: 'active-directive-preset',
  perspective: 'second person external - address the player command character as "you" only for observable situation, reports, direct sensory facts, and consequences.',
  instructions: '# Player Agency And Perspective\nDefault perspective: second person external - address the player command character as "you" only for observable situation, reports, direct sensory facts, and consequences.\n\nOnly the user speaks, acts, decides, and thinks for the player command character.',
  perspectivePromptId: 'directive-pov-second-external',
  promptIdentifiers: ['directive-pov-second-external', 'directive-player-agency-perspective']
};
const generationRouter = {
  async generate(roleId, request = {}) {
    generationCalls.push(roleId);
    generationRequests.push({ roleId, request: cloneJson(request) });
    if (roleId === 'campaignIntro') {
      const introCount = generationCalls.filter((role) => role === 'campaignIntro').length;
      const text = introCount === 1
        ? 'The Breckenridge receives its new executive officer. Captain Whitaker yields the deck, and the bridge waits for the commander\'s first order.'
        : `Alternate campaign intro ${introCount}: Captain Whitaker holds the bridge at readiness while the commander steps into the handoff.`;
      return { ok: true, response: { text } };
    }
    if (roleId === 'campaignConclusion') {
      return { ok: true, response: { text: 'The final watch ends with the Breckenridge secure, her command record complete, and her crew ready for whatever follows.' } };
    }
    throw new Error(`Unexpected role ${roleId}`);
  }
};
const persisted = [];
const activationActivity = [];
const nowValues = Array.from({ length: 60 }, (_, index) => `2026-06-22T00:00:${String(index).padStart(2, '0')}.000Z`);
let nowIndex = 0;
const now = () => nowValues[Math.min(nowIndex++, nowValues.length - 1)];

let initial = initializeCampaignRuntimeTracking(cloneJson(projection.initialState));
initial.campaign = {
  ...initial.campaign,
  id: 'campaign-activation-test',
  title: 'Ashes of Peace',
  packageTitle: 'Ashes of Peace',
  status: 'activating'
};
initial.player = {
  ...initial.player,
  id: 'player-activation-test',
  name: 'Talia Serrin',
  rank: 'Commander',
  billet: 'Executive Officer',
  dossier: { publicReputation: 'A measured officer with a record of decisive command.' }
};

assert.equal(
  __campaignActivationCoordinatorTestHooks.campaignChatName(initial, packageData),
  'Directive - Ashes of Peace'
);
assert.equal(
  __campaignActivationCoordinatorTestHooks.campaignChatName({
    ...initial,
    campaign: {
      ...initial.campaign,
      title: 'A Campaign Title So Long That It Should Not Become A Host Chat Name Because It Would Be Hard To Scan'
    }
  }, packageData),
  'Directive'
);
const defaultLocalIntro = __campaignActivationCoordinatorTestHooks.localIntroPacket({
  campaignState: initial,
  packageData
});
assert.doesNotMatch(defaultLocalIntro.text, /\b[Yy]ou\b|\b[Yy]our\b/);
assert.doesNotMatch(defaultLocalIntro.text, /prelude-a-ship-underway\.objective\.\d/);
assert.equal(defaultLocalIntro.narrationContext.source, 'directive-default');
const idObjectiveInitial = {
  ...cloneJson(initial),
  mission: {
    ...cloneJson(initial.mission || {}),
    formalObjectives: [
      'prelude-a-ship-underway.objective.1',
      'prelude-a-ship-underway.objective.2',
      'prelude-a-ship-underway.objective.3'
    ]
  }
};
const idObjectiveLocalIntro = __campaignActivationCoordinatorTestHooks.localIntroPacket({
  campaignState: idObjectiveInitial,
  packageData
});
assert.doesNotMatch(idObjectiveLocalIntro.text, /prelude-a-ship-underway\.objective\.\d/);
assert.match(idObjectiveLocalIntro.text, /Complete the command handover with Captain Whitaker/);
assert.match(idObjectiveLocalIntro.text, /Establish delegation and readiness procedures with the senior staff/);
const secondPersonLocalIntro = __campaignActivationCoordinatorTestHooks.localIntroPacket({
  campaignState: initial,
  packageData,
  narrationContext: secondPersonNarrationContext
});
assert.match(secondPersonLocalIntro.text, /\bYou arrive as Commander Talia Serrin\b/);
assert.match(secondPersonLocalIntro.text, /\byour assigned responsibility\b/);
const firstPersonLocalIntro = __campaignActivationCoordinatorTestHooks.localIntroPacket({
  campaignState: initial,
  packageData,
  narrationContext: {
    ...secondPersonNarrationContext,
    perspective: 'first person from a package-defined non-player narrator, log voice, or NPC only.',
    perspectivePromptId: 'directive-pov-first-non-player'
  }
});
assert.match(firstPersonLocalIntro.text, /Captain Mara Whitaker's log/);
assert.match(firstPersonLocalIntro.text, /\bI retain final authority\b/);

const activation = createCampaignActivationCoordinator({
  host: {
    chat,
    prompt,
    presets: {
      getNarrationContext() {
        return cloneJson(secondPersonNarrationContext);
      }
    },
    ui: {
      reportProgress(payload) {
        activationActivity.push(cloneJson(payload));
      }
    }
  },
  generationRouter,
  persist: async (state, summary) => persisted.push({ state: cloneJson(state), summary }),
  now
});
const activated = await activation.activate({
  campaignState: initial,
  packageData,
  crewDataset,
  saveId: 'save-activation-test',
  createNewChat: true
});
assert.equal(activated.ok, true);
assert.equal(activated.campaignState.campaign.status, 'active');
assert.equal(activated.activationJournal.status, 'complete');
assert.equal(Object.values(activated.activationJournal.steps).every((step) => step.status === 'complete'), true);
assert.equal(chat.calls().filter((entry) => entry.type === 'createOrBindCampaignChat').length, 1);
assert.equal(chat.calls().find((entry) => entry.type === 'createOrBindCampaignChat').options.createNewChat, undefined);
assert.equal(chat.calls().find((entry) => entry.type === 'createOrBindCampaignChat').options.createNew, true);
assert.equal(chat.calls().find((entry) => entry.type === 'createOrBindCampaignChat').options.existingChatId, null);
assert.equal(chat.calls().find((entry) => entry.type === 'createOrBindCampaignChat').options.name, 'Directive - Ashes of Peace');
assert.equal(chat.calls().find((entry) => entry.type === 'createOrBindCampaignChat').options.fallbackName, 'Directive');
assert.equal(chat.calls().filter((entry) => entry.type === 'postAssistantMessage').length, 1);
assert.equal(chat.messages().filter((message) => message.metadata?.responseKind === 'campaignIntro').length, 1);
assert.equal(
  chat.messages().find((message) => message.metadata?.responseKind === 'campaignIntro')?.text.startsWith('*Stardate 53049.2 | 0830 hours*\n\n'),
  true
);
assert.equal(chat.messages().length, 1);
assert.equal(prompt.calls().filter((entry) => entry.type === 'sync').length, 1);
assert.equal(activated.campaignState.campaignChatBinding.introMessageId !== null, true);
assert.equal(activated.campaignState.campaignChatBinding.promptContextRevision > 0, true);
const introRequest = generationRequests.find((entry) => entry.roleId === 'campaignIntro')?.request;
assert.match(introRequest.messages[0].content, /second person external/);
assert.match(introRequest.prompt, /This model call happens outside normal host preset assembly/);
assert.equal(introRequest.metadata.narrationContext.source, 'active-directive-preset');
assert.equal(activated.introPacket.narrationContext.perspectivePromptId, 'directive-pov-second-external');
assert.equal(activated.activationJournal.steps.introGenerated.details.narrationContext.perspectivePromptId, 'directive-pov-second-external');
const initialActivationPhases = activationActivity.map((event) => event.phase);
assert.equal(initialActivationPhases[0], 'activationStarting');
assert.equal(initialActivationPhases.at(-1), 'activationComplete');
assert.equal(initialActivationPhases.includes('activationIntroGenerating'), true);
assert.equal(initialActivationPhases.includes('activationIntroGenerated'), true);
assert.equal(
  initialActivationPhases.indexOf('activationIntroGenerating') < initialActivationPhases.indexOf('activationIntroGenerated'),
  true
);
assert.equal(activationActivity.find((event) => event.phase === 'activationIntroGenerating')?.status, 'running');
assert.equal(activationActivity.find((event) => event.phase === 'activationIntroGenerating')?.jobId, `campaignActivation:${activated.activationJournal.activationId}`);
assert.equal(activationActivity.find((event) => event.phase === 'activationComplete')?.status, 'complete');

const retriedActivation = await activation.activate({
  campaignState: activated.campaignState,
  packageData,
  crewDataset,
  saveId: 'save-activation-test',
  existingChatId: activated.binding.chatId,
  createNewChat: false
});
assert.equal(retriedActivation.ok, true);
assert.equal(chat.calls().filter((entry) => entry.type === 'createOrBindCampaignChat').length, 1);
assert.equal(chat.calls().filter((entry) => entry.type === 'postAssistantMessage').length, 1);
assert.equal(prompt.calls().filter((entry) => entry.type === 'sync').length, 1);
assert.equal(generationCalls.filter((role) => role === 'campaignIntro').length, 1);

const activityCountBeforeRewrite = activationActivity.length;
const rewrittenIntro = await activation.rewriteIntro({
  campaignState: retriedActivation.campaignState,
  packageData,
  saveId: 'save-activation-test',
  hostMessageId: retriedActivation.campaignState.campaignChatBinding.introMessageId,
  reason: 'test-intro-reroll'
});
assert.equal(rewrittenIntro.ok, true);
assert.equal(rewrittenIntro.summary, 'Campaign intro rewritten.');
assert.equal(generationCalls.filter((role) => role === 'campaignIntro').length, 2);
assert.equal(chat.calls().filter((entry) => entry.type === 'appendAssistantMessageSwipe').length, 1);
const rewrittenIntroMessage = chat.messages().find((message) => message.metadata?.responseKind === 'campaignIntro');
assert.equal(rewrittenIntroMessage.swipes.length, 2);
assert.equal(rewrittenIntroMessage.swipe_id, 1);
assert.equal(rewrittenIntroMessage.text.startsWith('*Stardate 53049.2 | 0830 hours*\n\n'), true);
assert.match(rewrittenIntroMessage.text, /Alternate campaign intro 2/);
assert.equal(rewrittenIntro.activationJournal.introRevisions.length, 2);
assert.equal(rewrittenIntro.activationJournal.introRevisions[0].reason, 'initial-campaign-intro');
assert.equal(rewrittenIntro.activationJournal.introRevisions[1].reason, 'test-intro-reroll');
assert.equal(rewrittenIntro.activationJournal.introPacket.selectedIntroRevisionId, rewrittenIntro.activationJournal.introRevisions[1].id);
assert.equal(rewrittenIntro.swipe.swipeIndex, 1);
const rewriteActivityPhases = activationActivity.slice(activityCountBeforeRewrite).map((event) => event.phase);
assert.deepEqual(rewriteActivityPhases, ['introRewriteGenerating', 'introRewritePosting', 'introRewriteComplete']);
assert.equal(activationActivity.at(-1)?.jobId, `campaignIntroRewrite:${rewrittenIntro.activationJournal.activationId}:${rewrittenIntro.campaignState.campaignChatBinding.introMessageId}`);

chat.pushPlayerMessage({ text: 'Take us in, helm.', hostMessageId: 'player-after-intro' });
const blockedIntroRewrite = await activation.rewriteIntro({
  campaignState: rewrittenIntro.campaignState,
  packageData,
  hostMessageId: rewrittenIntro.campaignState.campaignChatBinding.introMessageId
});
assert.equal(blockedIntroRewrite.ok, false);
assert.equal(blockedIntroRewrite.reason, 'player-message-exists');
assert.equal(generationCalls.filter((role) => role === 'campaignIntro').length, 2);
assert.equal(chat.calls().filter((entry) => entry.type === 'appendAssistantMessageSwipe').length, 1);

const flakyBaseChat = createFakeChatAdapter({ chatId: 'flaky-setup-chat' });
let openAttempts = 0;
const flakyChat = {
  ...flakyBaseChat,
  async open(binding) {
    openAttempts += 1;
    if (openAttempts === 1) return false;
    return flakyBaseChat.open(binding);
  }
};
const flakyPrompt = createFakePromptAdapter();
let failureInitial = initializeCampaignRuntimeTracking(cloneJson(projection.initialState));
failureInitial.campaign = {
  ...failureInitial.campaign,
  id: 'campaign-activation-recovery-test',
  title: 'Ashes of Peace',
  packageTitle: 'Ashes of Peace',
  status: 'activating'
};
failureInitial.player = {
  ...failureInitial.player,
  id: 'player-activation-recovery-test',
  name: 'Ilya Venn',
  rank: 'Commander',
  billet: 'Executive Officer'
};
const flakyActivation = createCampaignActivationCoordinator({
  host: { chat: flakyChat, prompt: flakyPrompt },
  now: () => '2026-06-22T01:00:00.000Z'
});
const failedActivation = await flakyActivation.activate({
  campaignState: failureInitial,
  packageData,
  crewDataset,
  saveId: 'save-activation-recovery-test',
  createNewChat: true
});
assert.equal(failedActivation.ok, false);
assert.equal(failedActivation.error.code, 'DIRECTIVE_CAMPAIGN_CHAT_OPEN_FAILED');
assert.equal(failedActivation.error.failedStep, 'chatOpened');
assert.equal(failedActivation.campaignState.campaign.status, 'activationFailed');
assert.equal(failedActivation.activationJournal.steps.promptInstalled.status, 'pending');
assert.equal(failedActivation.activationJournal.steps.chatOpened.status, 'failed');
assert.equal(flakyPrompt.inspect().blockCount, 0);
assert.equal(flakyBaseChat.calls().filter((entry) => entry.type === 'createOrBindCampaignChat').length, 1);
assert.equal(flakyBaseChat.calls().filter((entry) => entry.type === 'postAssistantMessage').length, 1);
assert.equal(flakyPrompt.calls().filter((entry) => entry.type === 'sync').length, 1);
assert.equal(flakyPrompt.calls().filter((entry) => entry.type === 'clear').length, 1);

const recoveredActivation = await flakyActivation.activate({
  campaignState: failedActivation.campaignState,
  packageData,
  crewDataset,
  saveId: 'save-activation-recovery-test',
  existingChatId: failedActivation.campaignState.campaignChatBinding.chatId,
  createNewChat: false
});
assert.equal(recoveredActivation.ok, true);
assert.equal(recoveredActivation.campaignState.campaign.status, 'active');
assert.equal(recoveredActivation.activationJournal.status, 'complete');
assert.equal(openAttempts, 2);
assert.equal(flakyBaseChat.calls().filter((entry) => entry.type === 'createOrBindCampaignChat').length, 1);
assert.equal(flakyBaseChat.calls().filter((entry) => entry.type === 'postAssistantMessage').length, 1);
assert.equal(flakyPrompt.calls().filter((entry) => entry.type === 'sync').length, 2);
assert.equal(flakyPrompt.calls().filter((entry) => entry.type === 'clear').length, 1);
assert.equal(flakyPrompt.inspect().blockCount > 0, true);

let campaignState = rewrittenIntro.campaignState;
let postAttempts = 0;
const originalPost = chat.postAssistantMessage.bind(chat);
const conclusionChat = {
  ...chat,
  async postAssistantMessage(options) {
    postAttempts += 1;
    if (postAttempts === 1) throw new Error('simulated chat persistence failure');
    return originalPost(options);
  }
};
const conclusion = createCampaignConclusionService({
  host: { chat: conclusionChat, prompt },
  generationRouter,
  getCampaignState: () => campaignState,
  setCampaignState: (next) => { campaignState = cloneJson(next); },
  persist: async (state, summary) => persisted.push({ state: cloneJson(state), summary }),
  now
});

await assert.rejects(
  conclusion.conclude({ reason: 'The player completed the assigned campaign.', type: 'playerChoice' }),
  (error) => error.code === 'DIRECTIVE_CONCLUSION_FINALIZATION_FAILED'
);
assert.equal(campaignState.campaign.status, 'concluding');
assert.equal(campaignState.conclusion.recapStatus, 'failed');
assert.equal(campaignState.conclusion.recapText.includes('final watch'), true);
assert.equal(campaignState.commandLog.entries.filter((entry) => entry.type === 'campaignConclusion').length, 1);
assert.equal(prompt.calls().filter((entry) => entry.type === 'clear').length, 0);
const conclusionRequest = generationRequests.find((entry) => entry.roleId === 'campaignConclusion')?.request;
assert.match(conclusionRequest.prompt, /Narration perspective contract/);
assert.match(conclusionRequest.prompt, /This model call happens outside normal host preset assembly/);
assert.match(conclusionRequest.messages[0].content, /third person limited external/);
assert.equal(conclusionRequest.metadata.narrationContext.roleId, 'campaignConclusion');
assert.equal(conclusionRequest.metadata.narrationContext.source, 'preset-adapter-unavailable');

const completed = await conclusion.conclude({ reason: 'This changed reason must not replace committed mechanics.', type: 'authoredCompletion' });
assert.equal(completed.ok, true);
assert.equal(completed.campaignState.conclusion.recapStatus, 'complete');
assert.equal(completed.campaignState.campaign.status, 'complete');
assert.equal(completed.campaignState.conclusion.finalMessageId !== null, true);
assert.equal(completed.campaignState.commandLog.entries.filter((entry) => entry.type === 'campaignConclusion').length, 1);
assert.equal(completed.campaignState.campaign.completionReason, 'The player completed the assigned campaign.');
assert.equal(generationCalls.filter((role) => role === 'campaignConclusion').length, 1);
assert.equal(prompt.calls().filter((entry) => entry.type === 'clear').length, 1);
assert.equal(chat.messages().filter((message) => message.metadata?.responseKind === 'campaignConclusion').length, 1);
assert.equal(
  chat.messages().find((message) => message.metadata?.responseKind === 'campaignConclusion')?.text.startsWith('*Stardate 53049.2 | 0830 hours*\n\n'),
  true
);

const duplicate = await conclusion.conclude();
assert.equal(duplicate.ok, true);
assert.equal(duplicate.duplicate, true);
assert.equal(postAttempts, 2);

console.log('Chat-native activation and conclusion tests passed: idempotent binding/intro/prompt activation, failed-open cleanup/retry, and no-reroll conclusion recovery');
