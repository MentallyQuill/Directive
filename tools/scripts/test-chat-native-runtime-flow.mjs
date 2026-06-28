import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createFakeDirectiveHost } from '../../src/hosts/fake/fake-host.mjs';
import { createDirectiveRuntimeApp } from '../../src/runtime/runtime-app.mjs';
import { listCampaignSaves } from '../../src/storage/directive-storage-repository.mjs';

const root = process.cwd();
const readJson = (filePath) => JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const crewDataset = readJson('packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json');
const graphPaths = [
  'packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json',
  'packages/bundled/breckenridge/chapter-1-the-empty-convoy.mission-graph.json',
  'packages/bundled/breckenridge/chapter-2-false-colors.mission-graph.json'
];
const missionGraphs = graphPaths.map((filePath) => ({ path: filePath, graph: readJson(filePath) }));

const noChangeProposal = { text: JSON.stringify({ id: 'no-change', operations: [], summary: 'No durable sidecar change.' }) };
let campaignIntroGenerationCount = 0;
let holdNextCampaignIntro = false;
let heldCampaignIntroAbortObserved = false;
let heldCampaignIntroStarted = null;
let heldCampaignIntroResolve = null;
async function loadChatNativeAssets() {
  return {
    packages: [packageData],
    projections: [projection],
    crewDatasets: [{
      path: 'packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json',
      dataset: crewDataset
    }],
    missionGraphs
  };
}

const host = createFakeDirectiveHost({
  chatNative: true,
  chatOptions: { chatId: 'pre-campaign-chat', entityName: 'Captain Whitaker' },
  generationOptions: {
    responses: {
      campaignIntro: ({ request, rawRequest }) => {
        campaignIntroGenerationCount += 1;
        if (holdNextCampaignIntro) {
          holdNextCampaignIntro = false;
          heldCampaignIntroStarted?.();
          return new Promise((resolve, reject) => {
            const signal = rawRequest?.signal;
            let fallbackTimer = null;
            heldCampaignIntroResolve = () => {
              if (fallbackTimer) globalThis.clearTimeout?.(fallbackTimer);
              heldCampaignIntroResolve = null;
              resolve({
                providerId: 'fake-reasoning',
                text: 'The held campaign intro now posts after the player asks Directive to build the opening scene.'
              });
            };
            const abortHeldIntro = () => {
              heldCampaignIntroAbortObserved = true;
              if (fallbackTimer) globalThis.clearTimeout?.(fallbackTimer);
              heldCampaignIntroResolve = null;
              const error = new Error('Held campaign intro canceled by test.');
              error.code = 'DIRECTIVE_GENERATION_ABORTED';
              reject(error);
            };
            if (signal?.aborted) {
              abortHeldIntro();
              return;
            }
            signal?.addEventListener?.('abort', abortHeldIntro, { once: true });
            fallbackTimer = globalThis.setTimeout?.(() => heldCampaignIntroResolve?.(), 5000);
          });
        }
        return {
          providerId: 'fake-reasoning',
          text: campaignIntroGenerationCount === 1
            ? 'The U.S.S. Breckenridge holds steady at the edge of the assignment zone. Captain Whitaker yields the deck to Commander Serrin as the first operational report reaches the bridge.'
            : `The U.S.S. Breckenridge holds steady for alternate intro ${campaignIntroGenerationCount}. Captain Whitaker keeps the same handoff in view while the seeded variant changes only the prose.`
        };
      },
      narration: {
        providerId: 'fake-reasoning',
        text: 'The bridge answers in practiced sequence. Helm adjusts the Breckenridge posture while Operations records the command and the senior staff waits for the next decision.'
      },
      campaignConclusion: {
        providerId: 'fake-reasoning',
        text: 'The Breckenridge closes the final watch with her crew intact and the campaign entered into Starfleet record.'
      },
      utilityTurnClassifier: {
        providerId: 'fake-utility',
        text: JSON.stringify({
          classification: 'consequentialCommand',
          responseStrategy: 'directivePosted',
          confidence: 0.86,
          ambiguity: 'low',
          speechAct: 'order',
          action: 'change course and pursue',
          target: 'freighter',
          targetConfidence: 0.84,
          domainSignals: ['mission', 'ship'],
          riskSignals: [],
          reasons: ['Runtime fixture utility response routes the player order to the Mission Director.'],
          workerPlan: {
            missionDirector: true,
            ship: true,
            commandBearing: true,
            sideMission: true,
            continuity: true,
            promptUpdate: true,
            narrator: true
          }
        })
      },
      continuityTracker: noChangeProposal,
      relationshipEvaluator: noChangeProposal,
      crewDirector: noChangeProposal,
      shipDirector: noChangeProposal,
      commandBearingEvaluator: noChangeProposal,
      sideMissionSignalDetector: noChangeProposal,
      outcomeIntegrityReview: {
        providerId: 'fake-utility',
        text: JSON.stringify({
          schema: 'directive.outcomeIntegrityReview.v1',
          verdict: 'accept',
          categories: [],
          reason: 'The edit shortens the prose while preserving the same committed pursuit outcome.',
          safeSummary: 'Prose-only trim.'
        })
      },
      commandLogSummarizer: {
        providerId: 'fake-utility',
        text: JSON.stringify({ summary: 'The bridge committed the commander\'s order.', visibleConsequences: ['Operational posture changed.'] })
      },
      continuityProjectionPlanner: {
        providerId: 'fake-utility',
        text: JSON.stringify({
          kind: 'directive.continuityProjectionPlan.v1',
          operations: [],
          omitted: []
        })
      }
    }
  }
});

let idSequence = 0;
let clock = Date.parse('2026-06-22T04:00:00.000Z');
const app = createDirectiveRuntimeApp({
  host,
  packageLoader: loadChatNativeAssets,
  idFactory(prefix) {
    idSequence += 1;
    return `${prefix}-chat-native-${idSequence}`;
  },
  now() {
    const value = new Date(clock).toISOString();
    clock += 1000;
    return value;
  }
});
const generationRoleCount = (roleId) => host.generation.calls().filter((entry) => entry.role === roleId).length;

function assertRuntimeViewBoundToSave(runtimeView, saveId, label) {
  assert.equal(runtimeView.activeSaveId, saveId, `${label}: active save id`);
  assert.equal(runtimeView.loadedSave.saveId, saveId, `${label}: loaded save id`);
  assert.equal(runtimeView.loadedChatNative.binding.saveId, saveId, `${label}: loaded chat binding save id`);
  assert.equal(runtimeView.chatNative.binding.saveId, saveId, `${label}: rendered chat binding save id`);
  assert.equal(runtimeView.currentChat.status, 'matching-campaign', `${label}: current chat status`);
  assert.equal(runtimeView.currentChatCampaignGuard.ok, true, `${label}: current chat save guard`);
}

let view = await app.initialize();
assert.equal(view.campaign.packages[0].actions.startNewCampaign, true);
assert.equal(host.prompt.inspect().blockCount, 0, 'Install and package browsing must not inject campaign context.');
assert.equal(host.chat.calls().length, 0, 'Install and package browsing must not create a campaign chat.');

view = await app.startCreatorDraft({ packageId: packageData.manifest.id });
assert.equal(view.activeScreen, 'creator');
view = await app.saveCreatorDraft({
  reason: 'testCompleteDraft',
  patch: {
    activeStep: 'review',
    input: {
      identity: {
        name: 'Talia Serrin',
        pronounsOrAddress: 'she/her',
        speciesId: 'human',
        ageBandId: 'mid-career',
        appearance: 'A composed officer who watches the room before speaking.'
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
        detailLevel: 'Standard',
        briefBiography: 'Talia Serrin is a tactical-minded Starfleet Commander whose war service taught her to make timely decisions without treating lives as expendable. Her transfer gives the Breckenridge a disciplined executive officer with a measured command presence.',
        publicReputation: 'A decisive and observant officer known for increasingly measured restraint.'
      }
    }
  }
});
assert.equal(view.creator.canBeginCampaign, true);

holdNextCampaignIntro = true;
heldCampaignIntroAbortObserved = false;
const initialCampaignIntroStartedPromise = new Promise((resolve) => { heldCampaignIntroStarted = resolve; });
const initialActivationPromise = app.acceptCreatorDraftAndStartCampaign({ simulationMode: 'Command' });
await initialCampaignIntroStartedPromise;
heldCampaignIntroStarted = null;
let activatingView = await app.getCurrentView({ tabId: 'campaign' });
assert.equal(activatingView.campaignState.campaign.status, 'activating');
assert.equal(activatingView.chatNative.openingScene.ready, false);
assert.equal(activatingView.chatNative.openingScene.blocked, true);
assert.equal(activatingView.chatNative.manualSaveGuard.ok, false);
assert.equal(activatingView.chatNative.manualSaveGuard.reason, 'campaign-opening-scene-required');
const blockedEarlyBranch = await app.saveCurrentGameAs({ name: 'Too Early Branch' });
assert.equal(blockedEarlyBranch.ok, false);
assert.equal(blockedEarlyBranch.blocked, true);
assert.equal(blockedEarlyBranch.saveGuard.reason, 'campaign-opening-scene-required');
const blockedEarlyPlayerMessage = await app.observeHostPlayerMessage({
  chatId: host.chat.getCurrentChatId(),
  message: {
    hostMessageId: 'pre-intro-player-message',
    text: 'Status report.',
    isUser: true
  }
});
assert.equal(blockedEarlyPlayerMessage.blocked, true);
assert.equal(blockedEarlyPlayerMessage.responseStrategy, 'pause');
assert.equal(blockedEarlyPlayerMessage.abortDefaultGeneration, true);
assert.equal(blockedEarlyPlayerMessage.openingScene.ready, false);
assert.equal(typeof heldCampaignIntroResolve, 'function');
heldCampaignIntroResolve();
view = await initialActivationPromise;
assert.equal(view.campaignState.campaign.status, 'active');
assert.equal(view.chatNative.activation.status, 'complete');
assert.equal(view.chatNative.openingScene.ready, true);
assert.equal(view.chatNative.openingScene.blocked, false);
assert.ok(view.chatNative.binding.chatId);
assert.equal(host.chat.getCurrentChatId(), view.chatNative.binding.chatId);
assert.equal(host.chat.calls().filter((entry) => entry.type === 'createOrBindCampaignChat').length, 1);
assert.equal(host.chat.messages().filter((entry) => entry.metadata?.responseKind === 'campaignIntro').length, 1);
assert.equal(host.prompt.inspect().status, 'installed');
assert(host.prompt.inspect().blockCount > 0);
assert(host.prompt.inspect().blockCount <= 13);
assert.equal(view.promptInspection.blockCount, host.prompt.inspect().blockCount);
assert.equal(view.chatNative.binding.promptContextRevision > 0, true);
assert.equal(generationRoleCount('continuityProjectionPlanner'), 1, 'Activation prompt installation should use the continuity planner once.');

const introBeforeNativeSwipe = host.chat.messages().find((entry) => entry.metadata?.responseKind === 'campaignIntro');
assert.equal(introBeforeNativeSwipe.swipes.length, 1);
let introNativeSwipeAborted = false;
const introNativeSwipe = await app.interceptHostGeneration({
  chat: host.chat.messages(),
  type: 'swipe',
  abort: () => { introNativeSwipeAborted = true; }
});
assert.equal(introNativeSwipe.handled, true);
assert.equal(introNativeSwipe.responseStrategy, 'campaignIntroRewrite');
assert.equal(introNativeSwipe.abortDefaultGeneration, true);
assert.equal(introNativeSwipeAborted, true);
assert.equal(campaignIntroGenerationCount, 2);
const campaignIntroRequests = host.generation.calls().filter((entry) => entry.role === 'campaignIntro');
assert.equal(campaignIntroRequests.length, 2);
assert.equal(campaignIntroRequests[1].request.metadata.introVariantReason, 'native-swipe-reroll');
assert.match(campaignIntroRequests[1].request.metadata.introVariantSeed, /:intro:1:/);
assert.match(campaignIntroRequests[1].request.prompt, /Do not invent a distress call, beacon, anomaly, attack, or new external mission hook/);
const introAfterNativeSwipe = host.chat.messages().find((entry) => entry.metadata?.responseKind === 'campaignIntro');
assert.equal(introAfterNativeSwipe.swipes.length, 2);
assert.equal(introAfterNativeSwipe.swipe_id, 1);
assert.match(introAfterNativeSwipe.swipes[1], /# Ashes of Peace/);
assert.match(introAfterNativeSwipe.swipes[1], /alternate intro 2/);
assert.equal(introAfterNativeSwipe.metadata.introRevisionReason, 'native-swipe-reroll');
assert.equal(introNativeSwipe.rewrite.introRevision.reason, 'native-swipe-reroll');
assert.match(introNativeSwipe.rewrite.introRevision.variantSeed, /:intro:1:/);

const introSwipeCountBeforeCanceledSwipe = introAfterNativeSwipe.swipes.length;
holdNextCampaignIntro = true;
heldCampaignIntroAbortObserved = false;
const heldCampaignIntroStartedPromise = new Promise((resolve) => { heldCampaignIntroStarted = resolve; });
let canceledIntroNativeSwipeAborted = false;
const canceledIntroSwipePromise = app.interceptHostGeneration({
  chat: host.chat.messages(),
  type: 'swipe',
  abort: () => { canceledIntroNativeSwipeAborted = true; }
});
await heldCampaignIntroStartedPromise;
const hostStopResult = await app.handleHostGenerationStopped({ reason: 'host-generation-stopped', source: 'test-stop-button' });
const canceledIntroSwipe = await canceledIntroSwipePromise;
heldCampaignIntroStarted = null;
assert.equal(hostStopResult.canceledCount, 1);
assert.equal(heldCampaignIntroAbortObserved, true);
assert.equal(canceledIntroSwipe.handled, true);
assert.equal(canceledIntroSwipe.responseStrategy, 'campaignIntroRewrite');
assert.equal(canceledIntroSwipe.abortDefaultGeneration, true);
assert.equal(canceledIntroNativeSwipeAborted, true);
assert.equal(canceledIntroSwipe.rewrite.canceled, true);
assert.equal(canceledIntroSwipe.rewrite.reason, 'generation-canceled');
const introAfterCanceledSwipe = host.chat.messages().find((entry) => entry.metadata?.responseKind === 'campaignIntro');
assert.equal(introAfterCanceledSwipe.swipes.length, introSwipeCountBeforeCanceledSwipe);
assert.equal(campaignIntroGenerationCount, 3);

await host.chat.open({ chatId: 'duplicated-campaign-chat' });
const rebound = await app.rebindCampaignChat();
view = rebound.view;
assert.equal(rebound.binding.chatId, 'duplicated-campaign-chat');
assert.equal(host.chat.getCurrentChatId(), 'duplicated-campaign-chat');
const rebindCall = host.chat.calls().filter((entry) => entry.type === 'createOrBindCampaignChat').at(-1);
assert.equal(rebindCall.options.createNew, false);
assert.equal(rebindCall.options.existingChatId, null);
assert.equal(host.chat.messages().filter((entry) => entry.metadata?.responseKind === 'campaignIntro').length, 1);
assert.equal(view.campaignState.runtimeTracking.recoveryJournal.some((entry) => entry.type === 'chatRebind' && entry.status === 'applied'), true);
assert.equal(host.prompt.inspect().status, 'installed');

view = await app.getCurrentView({ tabId: 'campaign' });
assert.equal(view.chatNative.manualSaveGuard.ok, true);
assert.equal(view.chatNative.manualSaveGuard.reason, 'ok');
const manualSave = await app.saveCurrentGame({ summary: 'Manual guard pass test.' });
assert.equal(manualSave.ok, true);
assert.equal(manualSave.saveGuard.ok, true);

host.chat.setCurrentChatId('unbound-chat-for-save-guard');
let blockedSave = await app.saveCurrentGame({ summary: 'Wrong chat should not save.' });
assert.equal(blockedSave.ok, false);
assert.equal(blockedSave.blocked, true);
assert.equal(blockedSave.saveGuard.reason, 'unbound-chat');
assert.match(blockedSave.saveGuard.summary, /not linked to this save/);

host.chat.setCurrentChatId('same-campaign-other-save-chat', {
  hostId: 'fake',
  chatId: 'same-campaign-other-save-chat',
  campaignId: view.chatNative.binding.campaignId,
  saveId: 'other-save-branch'
});
blockedSave = await app.saveCurrentGame({ summary: 'Different branch should not save.' });
assert.equal(blockedSave.ok, false);
assert.equal(blockedSave.saveGuard.reason, 'different-directive-save');
assert.match(blockedSave.saveGuard.summary, /different save branch/);

host.chat.setCurrentChatId('other-campaign-chat', {
  hostId: 'fake',
  chatId: 'other-campaign-chat',
  campaignId: 'different-campaign',
  saveId: 'different-save'
});
blockedSave = await app.saveCurrentGame({ summary: 'Different campaign should not save.' });
assert.equal(blockedSave.ok, false);
assert.equal(blockedSave.saveGuard.reason, 'different-directive-campaign');
assert.match(blockedSave.saveGuard.summary, /different Directive campaign/);

host.chat.setCurrentChatId('');
blockedSave = await app.saveCurrentGame({ summary: 'No active chat should not save.' });
assert.equal(blockedSave.ok, false);
assert.equal(blockedSave.saveGuard.reason, 'no-active-chat-selected');
assert.match(blockedSave.saveGuard.summary, /Choose the campaign chat/);

await host.chat.open(view.chatNative.binding);
const sourceSaveId = view.chatNative.binding.saveId;
const branch = await app.saveCurrentGameAs({ name: 'Guarded Branch' });
assert.equal(branch.ok, true);
assert.notEqual(branch.save.id, view.chatNative.binding.saveId);
assert.equal(branch.view.chatNative.binding.saveId, branch.save.id);
assert.equal(host.chat.getBindingMetadata().saveId, branch.save.id);
assert.equal(host.prompt.inspect().binding.saveId, branch.save.id);
assert.equal(branch.save.payload.campaignState.campaignChatBinding.saveId, branch.save.id);

const openedSource = await app.openCampaignChat({ saveId: sourceSaveId });
assert.equal(openedSource.ok, true);
assertRuntimeViewBoundToSave(openedSource.view, sourceSaveId, 'open source save after Save Game As');
assert.equal(host.chat.getBindingMetadata().saveId, sourceSaveId);
assert.equal(host.prompt.inspect().binding.saveId, sourceSaveId);

const loadedBranch = await app.loadGame({ saveId: branch.save.id });
assertRuntimeViewBoundToSave(loadedBranch, branch.save.id, 'load branch save after reopening source');
assert.equal(host.chat.getBindingMetadata().saveId, branch.save.id);
assert.equal(host.prompt.inspect().binding.saveId, branch.save.id);

const loadedSource = await app.loadGame({ saveId: sourceSaveId });
assertRuntimeViewBoundToSave(loadedSource, sourceSaveId, 'load source save after branch');
assert.equal(host.chat.getBindingMetadata().saveId, sourceSaveId);
assert.equal(host.prompt.inspect().binding.saveId, sourceSaveId);
assert.equal(branch.save.payload.campaignState.campaignChatBinding.saveId, branch.save.id);
view = loadedSource;
const continuityPlannerCallsBeforePlayerTurns = generationRoleCount('continuityProjectionPlanner');

const colorMessage = host.chat.pushPlayerMessage({
  hostMessageId: 'runtime-player-color',
  text: '*I nod once to the operations officer.*'
});
const colorResult = await app.observeHostPlayerMessage({
  chatId: host.chat.getCurrentChatId(),
  message: colorMessage
});
assert.equal(colorResult.decision.classification, 'sceneColor');
assert.equal(colorResult.abortDefaultGeneration, false);
assert.equal(host.chat.messages().filter((entry) => entry.metadata?.responseKind === 'committedOutcome').length, 0);

const sceneNavigationMessage = host.chat.pushPlayerMessage({
  hostMessageId: 'runtime-player-scene-navigation',
  text: 'Continue the scene.'
});
const sceneNavigationResult = await app.observeHostPlayerMessage({
  chatId: host.chat.getCurrentChatId(),
  message: sceneNavigationMessage
});
assert.equal(sceneNavigationResult.decision.classification, 'sceneNavigation');
assert.equal(sceneNavigationResult.abortDefaultGeneration, false);
assert.equal(host.chat.messages().filter((entry) => entry.metadata?.responseKind === 'committedOutcome').length, 0);

view = await app.getCurrentView({ tabId: 'mission' });
const elapsedMinutesBeforeLocationTransition = view.campaignState.worldState?.elapsedMinutes ?? 0;
const locationTransitionMessage = host.chat.pushPlayerMessage({
  hostMessageId: 'runtime-player-location-transition',
  text: 'I head to Engineering.'
});
const locationTransitionResult = await app.observeHostPlayerMessage({
  chatId: host.chat.getCurrentChatId(),
  message: locationTransitionMessage
});
assert.equal(locationTransitionResult.decision.classification, 'locationTransition');
assert.equal(locationTransitionResult.responseStrategy, 'directivePosted');
assert.equal(locationTransitionResult.abortDefaultGeneration, true);
assert.equal(host.chat.messages().filter((entry) => entry.metadata?.responseKind === 'locationTransition').length, 1);
const locationTransitionResponse = host.chat.messages().find((entry) => entry.metadata?.responseKind === 'locationTransition');
assert.match(locationTransitionResponse.text, /Engineering/i);
assert.match(locationTransitionResponse.text, /threshold/i);
view = await app.getCurrentView({ tabId: 'mission' });
assert.equal(view.campaignState.worldState.elapsedMinutes, elapsedMinutesBeforeLocationTransition + 2);

view = await app.getCurrentView({ tabId: 'mission' });
const elapsedMinutesBeforeTimedScene = view.campaignState.worldState?.elapsedMinutes ?? 0;
const timeLedgerEntriesBeforeTimedScene = view.campaignState.timeLedger?.entries?.length || 0;
const timedSceneMessage = host.chat.pushPlayerMessage({
  hostMessageId: 'runtime-player-timed-scene',
  text: '*Serrin spends 10 minutes quietly scanning the bridge status board.*'
});
const timedSceneResult = await app.observeHostPlayerMessage({
  chatId: host.chat.getCurrentChatId(),
  message: timedSceneMessage
});
assert.equal(timedSceneResult.abortDefaultGeneration, false);
view = await app.getCurrentView({ tabId: 'mission' });
assert.equal(view.campaignState.worldState.elapsedMinutes, elapsedMinutesBeforeTimedScene + 10);
assert.equal(view.campaignState.timeLedger.elapsedMinutes, elapsedMinutesBeforeTimedScene + 10);
assert.equal(view.campaignState.timeLedger.entries.length, timeLedgerEntriesBeforeTimedScene + 1);
assert.equal(view.campaignState.timeLedger.entries.at(-1).sourceAnchorRange.kind, 'sceneContinuation');

const routineMessage = host.chat.pushPlayerMessage({
  hostMessageId: 'runtime-player-routine',
  text: 'Log the distress call, preserve the telemetry, and keep the Captain informed.'
});
const routineResult = await app.observeHostPlayerMessage({
  chatId: host.chat.getCurrentChatId(),
  message: routineMessage
});
assert.equal(routineResult.decision.classification, 'routineCommand');
assert.equal(routineResult.abortDefaultGeneration, false);

const consequentialMessage = host.chat.pushPlayerMessage({
  hostMessageId: 'runtime-player-consequential',
  text: 'I order helm to change course and pursue the freighter.'
});
let consequentialResult = await app.observeHostPlayerMessage({
  chatId: host.chat.getCurrentChatId(),
  message: consequentialMessage
});
assert.equal(['consequentialCommand', 'riskConfirmationNeeded', 'directorResponseNeeded'].includes(consequentialResult.decision.classification), true);
assert.equal(consequentialResult.abortDefaultGeneration, true);
if (consequentialResult.responseStrategy === 'pause') {
  view = await app.getCurrentView({ tabId: 'mission' });
  const pending = view.chatNative.pendingInteractions.find((entry) => entry.status === 'pending');
  assert.ok(pending, 'A paused consequential turn must expose a resolvable interaction.');
  consequentialResult = (await app.resolvePendingChatInteraction({
    interactionId: pending.id,
    action: pending.kind === 'riskConfirmationNeeded' ? 'confirm' : 'accept'
  })).result;
  assert.equal(consequentialResult.ok, true);
}

view = await app.getCurrentView({ tabId: 'mission' });
assert.equal(view.chatNative.tracking.ingressCount, 6);
assert.equal(view.chatNative.tracking.responseCount >= 6, true);
assert.equal(view.chatNative.tracking.modelCallCount > 0, true);
assert.equal(view.chatNative.modelCalls.some((entry) => entry.roleId === 'utilityTurnClassifier'), true);
assert.equal(JSON.stringify(view.chatNative.modelCalls).includes('change course and pursue'), false, 'Model-call journal must not store raw player text.');
assert.ok(view.chatNative.tracking.lastCommittedTurn?.outcomeId);
assert.equal(view.chatNative.tracking.lastCommittedTurn.narrationStatus, 'complete');
assert.equal(view.chatNative.tracking.lastCommittedTurn.responseStatus, 'complete');
assert.equal(host.chat.messages().filter((entry) => entry.metadata?.responseKind === 'committedOutcome').length, 1);
assert.equal(view.campaignState.commandLog.entries.some((entry) => entry.type === 'routineCommand'), true);
assert.equal(view.campaignState.turnLedger.entries.length >= 1, true);
assert.equal(view.chatNative.binding.promptContextRevision > 1, true);
assert.equal(
  generationRoleCount('continuityProjectionPlanner'),
  continuityPlannerCallsBeforePlayerTurns,
  'Player-turn prompt synchronization must not invoke the blocking continuity planner.'
);

const committedResponse = host.chat.messages().find((entry) => entry.metadata?.responseKind === 'committedOutcome');
const editContext = await app.prepareOutcomeIntegrityEdit({
  message: { hostMessageId: committedResponse.hostMessageId }
});
assert.equal(editContext.ok, true);
assert.equal(editContext.mode, 'strict');
assert.equal(editContext.reviewProviderKind, 'utility');
const editedText = 'The bridge answers in sequence. Helm changes course to pursue the freighter while Operations records the command.';
const editResult = await app.submitOutcomeIntegrityEdit({
  hostMessageId: committedResponse.hostMessageId,
  baseTextHash: editContext.baseTextHash,
  proposedText: editedText
});
assert.equal(editResult.accepted, true);
assert.equal(editResult.revision.reviewProviderKind, 'utility');
const editedResponse = host.chat.getMessage(committedResponse.hostMessageId);
assert.equal(editedResponse.text.endsWith(editedText), true);
assert.equal(editedResponse.swipes.length, 2);
assert.equal(editedResponse.metadata.selectedOutcomeIntegrityRevisionId, editResult.revision.id);
view = await app.getCurrentView({ tabId: 'mission' });
const editedResponseEntry = view.campaignState.runtimeTracking.responseLedger.find((entry) => entry.hostMessageId === committedResponse.hostMessageId);
assert.equal(editedResponseEntry.outcomeId, editContext.lockedContext.outcomeId);
assert.equal(editedResponseEntry.outcomeIntegrity.selectedRevisionId, editResult.revision.id);

const duplicate = await app.observeHostPlayerMessage({
  chatId: host.chat.getCurrentChatId(),
  message: consequentialMessage
});
assert.equal(duplicate.deduplicated, true);
assert.equal(host.chat.messages().filter((entry) => entry.metadata?.responseKind === 'committedOutcome').length, 1);

const modelCallSequence = (entry) => Number(/^model-call:(\d+):/.exec(String(entry?.id || ''))?.[1] || 0);
const modelCallCountBeforeReload = view.chatNative.modelCalls.length;
const maxModelCallSequenceBeforeReload = Math.max(0, ...view.chatNative.modelCalls.map(modelCallSequence));
const reloadedApp = createDirectiveRuntimeApp({
  host,
  packageLoader: loadChatNativeAssets,
  idFactory(prefix) {
    idSequence += 1;
    return `${prefix}-chat-native-reloaded-${idSequence}`;
  },
  now() {
    const value = new Date(clock).toISOString();
    clock += 1000;
    return value;
  }
});
await reloadedApp.initialize();
await reloadedApp.openCampaignChat({ saveId: view.activeSaveId });
const continuityPlannerCallsBeforeReloadedTurn = generationRoleCount('continuityProjectionPlanner');
const reloadedMessage = host.chat.pushPlayerMessage({
  hostMessageId: 'runtime-player-after-reload',
  text: 'Serrin keeps the ship at measured readiness and orders the relay margin logged before the next step.'
});
const reloadedResult = await reloadedApp.observeHostPlayerMessage({
  chatId: host.chat.getCurrentChatId(),
  message: reloadedMessage
});
assert.equal(reloadedResult.abortDefaultGeneration, true);
const flushedSidecars = await reloadedApp.flushChatSidecars();
assert.equal(flushedSidecars.ok, true);
assert.equal(Number.isFinite(flushedSidecars.sidecarCountAfter), true);
view = await reloadedApp.getCurrentView({ tabId: 'mission' });
assert.equal(view.chatNative.tracking.modelCallCount > modelCallCountBeforeReload, true);
const reloadedModelCalls = view.chatNative.modelCalls.slice(modelCallCountBeforeReload);
assert.equal(reloadedModelCalls.length > 0, true);
assert.equal(
  reloadedModelCalls.every((entry) => modelCallSequence(entry) > maxModelCallSequenceBeforeReload),
  true,
  'Resumed runtime sessions must not reuse model-call journal IDs from the loaded save.'
);
assert.equal(
  generationRoleCount('continuityProjectionPlanner'),
  continuityPlannerCallsBeforeReloadedTurn,
  'Reloaded player-turn prompt synchronization must not invoke the blocking continuity planner.'
);
assert.equal(host.chat.messages().filter((entry) => entry.metadata?.responseKind === 'committedOutcome').length, 2);

const saves = await listCampaignSaves(host.storage);
const activeSave = saves.find((entry) => entry.id === view.activeSaveId);
assert.ok(activeSave);
assert.equal(activeSave.revision > 1, true);

const completed = await reloadedApp.concludeCampaign({ reason: 'Runtime target-flow test completed.', type: 'playerChoice' });
assert.equal(completed.campaignState.campaign.status, 'complete');
assert.equal(completed.campaignState.conclusion.recapStatus, 'complete');
assert.equal(host.chat.messages().filter((entry) => entry.metadata?.responseKind === 'campaignConclusion').length, 1);
assert.equal(host.prompt.inspect().blockCount, 0);

const archived = await reloadedApp.archiveCompletedCampaign();
assert.equal(archived.campaignState.campaign.status, 'archived');
assert.ok(archived.campaignState.campaign.archivedAt);
assert.equal(host.prompt.inspect().blockCount, 0);

console.log('Chat-native runtime flow tests passed: no pre-activation injection, creator activation, automatic chat/intro, utility loop, committed outcome, autosave, conclusion, and archive');
