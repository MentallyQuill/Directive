import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { classifyChatTurn } from '../../src/adjudication/utility-turn-classifier.mjs';
import { createFakeChatAdapter, createFakePromptAdapter } from '../../src/hosts/fake/fake-host.mjs';
import {
  migrateCommandBearingState,
  readyCommandBearingPoint
} from '../../src/command/command-bearing.mjs';
import { createChatTurnOrchestrator } from '../../src/runtime/chat-turn-orchestrator.mjs';
import { createResponseDispatcher } from '../../src/runtime/response-dispatcher.mjs';
import {
  createStateDeltaGateway,
  initializeCampaignRuntimeTracking,
  recordRecoveryEvent,
  updateTurnIngress
} from '../../src/runtime/state-delta-gateway.mjs';

const root = process.cwd();
const readJson = (filePath) => JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
const cloneJson = (value) => JSON.parse(JSON.stringify(value));
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');

const chat = createFakeChatAdapter({ chatId: 'campaign-chat' });
const prompt = createFakePromptAdapter();
let campaignState = initializeCampaignRuntimeTracking(cloneJson(projection.initialState));
campaignState.campaign = {
  ...campaignState.campaign,
  id: 'campaign-orchestration-test',
  title: 'Ashes of Peace',
  status: 'active'
};
campaignState.campaignChatBinding = {
  hostId: 'fake',
  chatId: 'campaign-chat',
  campaignId: campaignState.campaign.id,
  saveId: 'save-orchestration-test',
  promptContextRevision: 1
};

const persisted = [];
const sidecarCalls = [];
const previewCalls = [];
const commitCalls = [];
const responseSwipeGenerationCalls = [];
const postCommitConversationCalls = [];
let pendingTurn = null;
let nextCommandBearingPrompt = null;
let nextPreviewOutcomeBand = null;
let nextNarrationResult = null;
let sequence = 0;
const now = () => `2026-06-22T01:00:${String(sequence++).padStart(2, '0')}.000Z`;
const getCampaignState = () => campaignState;
const setCampaignState = (next) => { campaignState = cloneJson(next); };
const persistCampaignState = async (next, summary) => {
  campaignState = cloneJson(next);
  persisted.push({ summary: cloneJson(summary), revision: next.runtimeTracking?.revision || 0 });
  return { ok: true };
};

const stateDeltaGateway = createStateDeltaGateway({
  getState: getCampaignState,
  setState: setCampaignState,
  persist: persistCampaignState,
  now
});
const responseDispatcher = createResponseDispatcher({
  host: { chat },
  getCampaignState,
  setCampaignState,
  persist: persistCampaignState,
  now
});

const orchestrator = createChatTurnOrchestrator({
  host: { chat, prompt },
  classify: ({ text, context }) => classifyChatTurn({ text, context }),
  responseDispatcher,
  generationRouter: {
    async generate(roleId, request) {
      responseSwipeGenerationCalls.push({ roleId, request: cloneJson(request) });
      if (roleId === 'commandBearingSpendValidator') {
        return {
          ok: true,
          response: {
            providerId: 'fake-command-bearing-validator',
            text: JSON.stringify({
              kind: 'directive.commandBearingFitCheck',
              track: 'resolve',
              fit: 'strong',
              valid: true,
              summary: 'Resolve fits because the player gives a lawful order and accepts responsibility for the cost.',
              whatWorks: ['The message states an order, accepts exposure, and preserves the convoy.'],
              missing: [],
              suggestions: [],
              causalBasis: ['lawful order', 'accepted responsibility', 'credible cost']
            })
          },
          diagnostics: { providerId: 'fake-command-bearing-validator' }
        };
      }
      if (roleId === 'missionDirectorAdvisor') {
        return {
          ok: true,
          response: {
            providerId: 'fake-counsel-provider',
            text: JSON.stringify({
              kind: 'directive.playerSafeAdvisory',
              subject: 'Bridge arrival options',
              missionBrief: 'Sam asked for decision support before choosing how to use the remaining arrival window.',
              logSummary: 'Sam requested options for using the remaining time before reporting to the bridge.',
              involvedCrewIds: ['mara-whitaker'],
              crewNotes: [
                {
                  crewId: 'mara-whitaker',
                  summary: 'The arrival timing question is relevant to Whitaker because it shapes the first ready-room handoff.'
                }
              ],
              considerations: ['Captain availability is not yet established in the player-visible scene.'],
              options: [
                'Settle quarters, then proceed directly to the bridge.',
                'Check in with the duty officer en route.'
              ]
            })
          },
          diagnostics: { providerId: 'fake-counsel-provider' }
        };
      }
      return {
        ok: true,
        response: {
          providerId: 'fake-response-swipe-provider',
          text: `Alternate Directive response ${responseSwipeGenerationCalls.length}.`
        },
        diagnostics: { providerId: 'fake-response-swipe-provider' }
      };
    }
  },
  stateDeltaGateway,
  getCampaignState,
  setCampaignState,
  persistCampaignState,
  syncPromptContext: async (state) => {
    const next = cloneJson(state);
    next.campaignChatBinding.promptContextRevision += 1;
    await prompt.install({
      binding: next.campaignChatBinding,
      packet: {
        revision: next.campaignChatBinding.promptContextRevision,
        blocks: [{ id: 'active-scene', text: 'Player-safe scene context.', depth: 4, role: 'system' }]
      }
    });
    return next;
  },
  previewDirectorTurn: async ({ turnId, playerInput }) => {
    const outcomeId = `outcome-${previewCalls.length + 1}`;
    const commandBearingPrompt = nextCommandBearingPrompt || { eligible: false };
    nextCommandBearingPrompt = null;
    pendingTurn = {
      turnId,
      outcomePacket: {
        id: outcomeId,
        resultBand: nextPreviewOutcomeBand || commandBearingPrompt.actions?.[0]?.from || 'success',
        visibleConsequences: ['The order changes the tactical posture.']
      },
      commandLogPacket: {
        visibleConsequences: ['The order changes the tactical posture.']
      }
    };
    nextPreviewOutcomeBand = null;
    previewCalls.push({ turnId, playerInput, outcomeId });
    return {
      turnPacket: cloneJson(pendingTurn),
      commandBearingPrompt: cloneJson(commandBearingPrompt),
      warningConfirmation: { required: false }
    };
  },
  commitProvisionalDirectorTurn: async ({ confirmWarnings = false, readiedCommandBearing = null } = {}) => {
    assert.ok(pendingTurn, 'A provisional Director turn must exist before commit.');
    const turnPacket = cloneJson(pendingTurn);
    pendingTurn = null;
    const next = initializeCampaignRuntimeTracking(campaignState);
    if (readiedCommandBearing) {
      next.commandBearing = cloneJson(next.commandBearing || next.commandStyle || {});
      next.commandBearing.readied = null;
      next.commandBearing.spendLedger = next.commandBearing.spendLedger || {};
      next.commandBearing.spendLedger[turnPacket.outcomePacket.id] = {
        outcomeId: turnPacket.outcomePacket.id,
        readiedId: readiedCommandBearing.id || readiedCommandBearing.readiedId || '',
        ingressId: readiedCommandBearing.ingressId || '',
        hostMessageId: readiedCommandBearing.hostMessageId || '',
        track: readiedCommandBearing.track,
        from: turnPacket.outcomePacket.resultBand,
        to: readiedCommandBearing.track === 'resolve' ? 'Partial Success' : 'Success',
        rationale: readiedCommandBearing.rationale || ''
      };
      next.commandStyle = cloneJson(next.commandBearing);
    }
    next.commandLog = next.commandLog || { entries: [] };
    next.commandLog.entries = next.commandLog.entries || [];
    next.commandLog.entries.push({
      id: `command-log-${turnPacket.outcomePacket.id}`,
      type: 'consequentialCommand',
      outcomeId: turnPacket.outcomePacket.id,
      visibleConsequences: cloneJson(turnPacket.commandLogPacket.visibleConsequences)
    });
    next.runtimeTracking.lastCommittedTurn = {
      turnId: turnPacket.turnId,
      outcomeId: turnPacket.outcomePacket.id,
      resultBand: turnPacket.outcomePacket.resultBand,
      narrationStatus: 'complete',
      responseStatus: 'pending',
      committedAt: now()
    };
    setCampaignState(next);
    await persistCampaignState(next, 'Stub mechanics committed before narration.');
    commitCalls.push({
      confirmWarnings,
      outcomeId: turnPacket.outcomePacket.id,
      readiedCommandBearing: cloneJson(readiedCommandBearing)
    });
    const narrationResult = nextNarrationResult || {
      ok: true,
      narration: { text: `Committed narration for ${turnPacket.outcomePacket.id}.` }
    };
    nextNarrationResult = null;
    return {
      campaignState: cloneJson(next),
      turnPacket,
      narrationResult
    };
  },
  discardProvisionalDirectorTurn: async () => { pendingTurn = null; },
  turnCommitCoordinator: {
    async markResponse({ campaignState: state, outcomeId, status, hostMessageId }) {
      const next = initializeCampaignRuntimeTracking(state);
      assert.equal(next.runtimeTracking.lastCommittedTurn.outcomeId, outcomeId);
      next.runtimeTracking.lastCommittedTurn.responseStatus = status;
      next.runtimeTracking.lastCommittedTurn.hostMessageId = hostMessageId;
      setCampaignState(next);
      await persistCampaignState(next, 'Response checkpoint updated.');
      return { campaignState: next };
    }
  },
  sidecarScheduler: {
    schedule(payload) {
      sidecarCalls.push(cloneJson(payload));
      if (typeof payload.activityReporter === 'function') {
        const requested = Object.keys(payload.workerPlan || {}).filter((key) => payload.workerPlan[key] === true);
        payload.activityReporter({
          phase: 'sidecarsQueued',
          mode: 'background',
          requested,
          classification: payload.turnContext?.classification || null
        });
      }
      return Promise.resolve({ ok: true });
    }
  },
  postCommitConversationProcessor: async (conversation) => {
    postCommitConversationCalls.push(cloneJson(conversation));
    return { ok: true, campaignState: cloneJson(campaignState) };
  },
  now
});

async function send(text, hostMessageId, options = {}) {
  const message = chat.pushPlayerMessage({ text, hostMessageId });
  return orchestrator.observePlayerMessage({
    chatId: 'campaign-chat',
    message,
    turnActivityReporter: options.activityReporter
  });
}

const color = await send('*I nod once to the helmsman.*', 'player-color');
assert.equal(color.decision.classification, 'sceneColor');
assert.equal(color.abortDefaultGeneration, false);
assert.equal(chat.messages().filter((entry) => entry.isDirectiveOwned).length, 0);
assert.equal(campaignState.runtimeTracking.responseLedger.at(-1).strategy, 'injectAndContinue');

const colorDuplicate = await orchestrator.observePlayerMessage({
  chatId: 'campaign-chat',
  message: chat.getMessage('player-color')
});
assert.equal(colorDuplicate.deduplicated, true);
assert.equal(colorDuplicate.abortDefaultGeneration, false);
assert.equal(campaignState.runtimeTracking.responseLedger.filter((entry) => entry.ingressId?.includes('player-color')).length, 1);

const commandLogBeforeSceneNavigation = campaignState.commandLog?.entries?.length || 0;
const sceneNavigationActivity = [];
const sceneNavigation = await send('Continue the scene.', 'player-scene-navigation', {
  activityReporter: (event) => sceneNavigationActivity.push(cloneJson(event))
});
assert.equal(sceneNavigation.decision.classification, 'sceneNavigation');
assert.equal(sceneNavigation.abortDefaultGeneration, false);
assert.equal(chat.messages().filter((entry) => entry.metadata?.responseKind === 'routineCommand').length, 0);
assert.equal(campaignState.commandLog?.entries?.length || 0, commandLogBeforeSceneNavigation);
assert.equal(campaignState.runtimeTracking.responseLedger.at(-1).strategy, 'injectAndContinue');
assert.ok(sceneNavigationActivity.some((event) => event.phase === 'classifying'));
assert.ok(sceneNavigationActivity.some((event) => event.phase === 'classified' && event.classification === 'sceneNavigation'));
assert.ok(sceneNavigationActivity.some((event) => event.phase === 'scene' && event.classification === 'sceneNavigation'));
assert.ok(sceneNavigationActivity.some((event) => event.phase === 'delegatingHostGeneration'));
assert.ok(sceneNavigationActivity.some((event) => event.phase === 'sidecarsQueued' && event.mode === 'background'));

const previewCallsBeforeStaleClassifier = previewCalls.length;
const responseLedgerBeforeStaleClassifier = campaignState.runtimeTracking.responseLedger.length;
const sidecarCallsBeforeStaleClassifier = sidecarCalls.length;
const staleClassifierOrchestrator = createChatTurnOrchestrator({
  host: { chat, prompt },
  classify: async () => {
    const current = initializeCampaignRuntimeTracking(getCampaignState());
    const ingress = current.runtimeTracking.ingressLedger.find((entry) => entry.hostMessageId === 'player-stale-classifier');
    assert.ok(ingress, 'The stale-classifier ingress should exist before classifier return.');
    setCampaignState(updateTurnIngress(current, ingress.id, {
      status: 'invalidated',
      invalidatedAt: '2026-06-22T01:00:09.000Z',
      invalidationType: 'playerMessageEdited',
      replacementText: 'I order helm to proceed.',
      textHash: 'edited-message-hash'
    }));
    return {
      kind: 'directive.validatedTurnDecision',
      classification: 'consequentialCommand',
      confidence: 0.92,
      ambiguity: 'low',
      speechAct: 'order',
      action: 'proceed',
      target: 'helm',
      targetConfidence: 0.9,
      domainSignals: ['mission'],
      riskSignals: [],
      missingInformation: [],
      mixedIntent: false,
      workerPlan: {
        missionDirector: true,
        continuity: true,
        narrator: true
      },
      responseStrategy: 'directivePosted',
      reasons: ['This stale result should never commit.']
    };
  },
  responseDispatcher,
  generationRouter: {
    async generate(roleId, request) {
      responseSwipeGenerationCalls.push({ roleId, request: cloneJson(request) });
      return {
        ok: true,
        response: {
          providerId: 'fake-response-swipe-provider',
          text: `Alternate Directive response ${responseSwipeGenerationCalls.length}.`
        },
        diagnostics: { providerId: 'fake-response-swipe-provider' }
      };
    }
  },
  stateDeltaGateway,
  getCampaignState,
  setCampaignState,
  persistCampaignState,
  syncPromptContext: async (state) => state,
  previewDirectorTurn: async () => {
    throw new Error('Stale classifier output must not preview a Director turn.');
  },
  commitProvisionalDirectorTurn: async () => {
    throw new Error('Stale classifier output must not commit a Director turn.');
  },
  discardProvisionalDirectorTurn: async () => {},
  sidecarScheduler: {
    schedule(payload) {
      sidecarCalls.push(cloneJson(payload));
      return Promise.resolve({ ok: true });
    }
  },
  now
});
const staleClassifierMessage = chat.pushPlayerMessage({
  text: 'I order helm to proceedd.',
  hostMessageId: 'player-stale-classifier'
});
const staleClassifier = await staleClassifierOrchestrator.observePlayerMessage({
  chatId: 'campaign-chat',
  message: staleClassifierMessage
});
assert.equal(staleClassifier.stale, true);
assert.equal(staleClassifier.reason, 'source-ingress-stale');
assert.equal(staleClassifier.abortDefaultGeneration, true);
assert.equal(previewCalls.length, previewCallsBeforeStaleClassifier);
assert.equal(campaignState.runtimeTracking.responseLedger.length, responseLedgerBeforeStaleClassifier);
assert.equal(sidecarCalls.length, sidecarCallsBeforeStaleClassifier);

const failingClassifierOrchestrator = createChatTurnOrchestrator({
  host: { chat, prompt },
  classify: async () => {
    const error = new Error('Classifier unavailable for retry regression.');
    error.code = 'DIRECTIVE_TEST_CLASSIFIER_FAILED';
    throw error;
  },
  responseDispatcher,
  generationRouter: {
    async generate(roleId, request) {
      responseSwipeGenerationCalls.push({ roleId, request: cloneJson(request) });
      return {
        ok: true,
        response: {
          providerId: 'fake-response-swipe-provider',
          text: `Alternate Directive response ${responseSwipeGenerationCalls.length}.`
        },
        diagnostics: { providerId: 'fake-response-swipe-provider' }
      };
    }
  },
  stateDeltaGateway,
  getCampaignState,
  setCampaignState,
  persistCampaignState,
  syncPromptContext: async (state) => state,
  previewDirectorTurn: async () => {
    throw new Error('Classifier failure must not preview a Director turn.');
  },
  commitProvisionalDirectorTurn: async () => {
    throw new Error('Classifier failure must not commit a Director turn.');
  },
  discardProvisionalDirectorTurn: async () => {},
  sidecarScheduler: {
    schedule(payload) {
      sidecarCalls.push(cloneJson(payload));
      return Promise.resolve({ ok: true });
    }
  },
  now
});
const classifierFailureMessage = chat.pushPlayerMessage({
  text: 'Log the retry check, preserve the watch handoff, and keep the Captain informed.',
  hostMessageId: 'player-classifier-failure'
});
const classifierFailure = await failingClassifierOrchestrator.observePlayerMessage({
  chatId: 'campaign-chat',
  message: classifierFailureMessage
});
const failedIngress = campaignState.runtimeTracking.ingressLedger.find((entry) => entry.hostMessageId === 'player-classifier-failure');
const failedRecovery = campaignState.runtimeTracking.recoveryJournal.find((entry) => entry.ingressId === failedIngress.id && entry.type === 'chatTurnProcessingFailure');
assert.equal(classifierFailure.recoveryRequired, true);
assert.equal(failedIngress.status, 'recoveryRequired');
assert.equal(failedIngress.error.code, 'DIRECTIVE_TEST_CLASSIFIER_FAILED');
assert.equal(failedRecovery.status, 'open');
assert.equal(failedRecovery.details.stage, 'classification');

const retriedClassifierFailure = await orchestrator.observePlayerMessage({
  chatId: 'campaign-chat',
  message: classifierFailureMessage
});
const retriedIngress = campaignState.runtimeTracking.ingressLedger.find((entry) => entry.hostMessageId === 'player-classifier-failure');
const resolvedFailureRecovery = campaignState.runtimeTracking.recoveryJournal.find((entry) => entry.id === failedRecovery.id);
assert.equal(retriedClassifierFailure.handled, true);
assert.notEqual(retriedClassifierFailure.deduplicated, true);
assert.notEqual(retriedIngress.status, 'recoveryRequired');
assert.equal(resolvedFailureRecovery.status, 'resolved');
assert.equal(resolvedFailureRecovery.resolution.reason, 'message-reobserved');

const routine = await send('Log the distress call, preserve the telemetry, and keep the Captain informed.', 'player-routine');
assert.equal(routine.decision.classification, 'routineCommand');
assert.equal(routine.abortDefaultGeneration, false);
assert.equal(campaignState.commandCompetence.assumedActionsLedger.some((entry) => entry.sourceMessageId === 'player-routine'), true);
assert.equal(campaignState.commandLog.entries.some((entry) => entry.type === 'routineCommand'), true);

const directiveRoutineOrchestrator = createChatTurnOrchestrator({
  host: { chat, prompt },
  classify: async () => ({
    kind: 'directive.validatedTurnDecision',
    classification: 'routineCommand',
    confidence: 0.88,
    ambiguity: 'low',
    speechAct: 'order',
    action: 'direct routine handoff procedure',
    target: 'Whitaker, Bronn, Ops',
    targetConfidence: 0.9,
    domainSignals: ['command-rhythm', 'crew-coordination'],
    riskSignals: [],
    missingInformation: [],
    pendingInteractionResolution: null,
    mixedIntent: true,
    reasons: ['Provider requested a Directive-owned routine response.'],
    workerPlan: {
      relationship: true,
      crew: true,
      commandBearing: true,
      continuity: true,
      promptUpdate: true
    },
    responseStrategy: 'directivePosted',
    source: 'utility-provider'
  }),
  responseDispatcher,
  generationRouter: {
    async generate(roleId, request) {
      responseSwipeGenerationCalls.push({ roleId, request: cloneJson(request) });
      return {
        ok: true,
        response: {
          providerId: 'fake-response-swipe-provider',
          text: `Alternate Directive response ${responseSwipeGenerationCalls.length}.`
        },
        diagnostics: { providerId: 'fake-response-swipe-provider' }
      };
    }
  },
  stateDeltaGateway,
  getCampaignState,
  setCampaignState,
  persistCampaignState,
  syncPromptContext: async (state) => state,
  previewDirectorTurn: async () => {
    throw new Error('Directive-owned routine test must not preview a Director turn.');
  },
  commitProvisionalDirectorTurn: async () => {
    throw new Error('Directive-owned routine test must not commit a Director turn.');
  },
  discardProvisionalDirectorTurn: async () => {},
  sidecarScheduler: {
    schedule(payload) {
      sidecarCalls.push(cloneJson(payload));
      return Promise.resolve({ ok: true });
    }
  },
  now
});
const directiveRoutineMessage = chat.pushPlayerMessage({
  text: 'I tell Whitaker to keep the handoff public but brief.',
  hostMessageId: 'player-routine-directive'
});
const directiveRoutine = await directiveRoutineOrchestrator.observePlayerMessage({
  chatId: 'campaign-chat',
  message: directiveRoutineMessage
});
assert.equal(directiveRoutine.decision.classification, 'routineCommand');
assert.equal(directiveRoutine.responseStrategy, 'directivePosted');
assert.equal(directiveRoutine.abortDefaultGeneration, true);
assert.equal(campaignState.runtimeTracking.responseLedger.at(-1).strategy, 'directivePosted');
assert.equal(campaignState.runtimeTracking.responseLedger.at(-1).responseKind, 'routineCommand');
assert.equal(chat.messages().filter((entry) => entry.metadata?.responseKind === 'routineCommand').length, 1);

const responseLedgerBeforeSwipe = cloneJson(campaignState.runtimeTracking.responseLedger);
let directiveSwipeAbort = false;
const directiveSwipe = await directiveRoutineOrchestrator.interceptGeneration({
  chat: chat.messages(),
  abort: () => { directiveSwipeAbort = true; },
  type: 'swipe'
});
assert.equal(directiveSwipe.handled, true);
assert.equal(directiveSwipe.responseStrategy, 'directiveSwipe');
assert.equal(directiveSwipe.abortDefaultGeneration, true);
assert.equal(directiveSwipeAbort, true);
assert.equal(responseSwipeGenerationCalls.length, 1);
const directiveRoutineResponse = chat.messages().find((entry) => entry.metadata?.responseKind === 'routineCommand');
assert.equal(directiveRoutineResponse.swipes.length, 2);
assert.equal(directiveRoutineResponse.swipes[0], 'The order is acknowledged and folded into the working rhythm. The relevant officers carry it forward while the log records the procedure.');
assert.equal(directiveRoutineResponse.swipes[1], 'Alternate Directive response 1.');
assert.equal(directiveRoutineResponse.swipe_id, 1);
assert.equal(directiveRoutineResponse.metadata.responseSwipeReason, 'native-swipe-reroll');
assert.deepEqual(campaignState.runtimeTracking.responseLedger, responseLedgerBeforeSwipe, 'Response swipes are chat transcript variants, not campaign-state entries.');

const counsel = await send('What are our options here?', 'player-counsel-format');
assert.equal(counsel.decision.classification, 'counselRequest');
assert.equal(counsel.responseStrategy, 'injectAndContinue');
assert.equal(counsel.abortDefaultGeneration, false);
assert.equal(chat.messages().filter((entry) => entry.metadata?.responseKind === 'counsel').length, 0);
assert.equal(counsel.advisory.subject, 'Bridge arrival options');
assert.equal(counsel.advisory.involvedCrewIds.includes('mara-whitaker'), true);
assert.equal(campaignState.commandCompetence.counselRequestLedger.at(-1).id, counsel.advisory.id);
assert.equal(campaignState.commandCompetence.counselRequestLedger.at(-1).options.length, 2);
assert.equal(campaignState.runtimeTracking.responseLedger.at(-1).strategy, 'injectAndContinue');
assert.equal(campaignState.runtimeTracking.responseLedger.at(-1).responseKind, 'hostGeneration');

const consequential = await send('I order helm to change course and pursue the freighter.', 'player-consequential');
assert.equal(consequential.decision.classification, 'consequentialCommand');
assert.equal(consequential.abortDefaultGeneration, true);
assert.equal(previewCalls.length, 1);
assert.equal(commitCalls.length, 1);
assert.equal(chat.messages().filter((entry) => entry.metadata?.responseKind === 'committedOutcome').length, 1);
assert.equal(campaignState.runtimeTracking.lastCommittedTurn.responseStatus, 'complete');
assert.equal(campaignState.runtimeTracking.activeIngressId.includes('player-consequential'), true);
assert.equal(postCommitConversationCalls.length, 1);
assert.equal(postCommitConversationCalls[0].outcomeId, 'outcome-1');
assert.equal(postCommitConversationCalls[0].messages.map((entry) => entry.role).join(','), 'user,assistant');

const consequenceDuplicate = await orchestrator.observePlayerMessage({
  chatId: 'campaign-chat',
  message: chat.getMessage('player-consequential')
});
assert.equal(consequenceDuplicate.deduplicated, true);
assert.equal(consequenceDuplicate.abortDefaultGeneration, true);
assert.equal(commitCalls.length, 1);
assert.equal(chat.messages().filter((entry) => entry.metadata?.responseKind === 'committedOutcome').length, 1);

const indexedMessageText = 'I order helm to intercept the armed raider and tactical to disable its weapons before it reaches the convoy.';
const indexedMessage = await orchestrator.observePlayerMessage({
  chatId: 'campaign-chat',
  hostMessageId: '42',
  index: 42,
  text: indexedMessageText,
  isUser: true
});
assert.equal(indexedMessage.abortDefaultGeneration, true);
assert.equal(commitCalls.length, 2);
let indexedAbort = false;
const indexedPromptIntercept = await orchestrator.interceptGeneration({
  chat: [
    { mes: 'Older prompt context.', is_user: false, index: 38 },
    { mes: indexedMessageText, is_user: true, index: 42 }
  ],
  abort: () => { indexedAbort = true; },
  type: 'normal'
});
assert.equal(indexedPromptIntercept.deduplicated, true);
assert.equal(indexedPromptIntercept.abortDefaultGeneration, true);
assert.equal(indexedAbort, true);
assert.equal(commitCalls.length, 2, 'Interceptor prompt-array indices must dedupe against MESSAGE_SENT host indices.');

let ownedDepthAbort = false;
globalThis.__directiveOwnedGenerationDepth = 1;
try {
  const ownedDepthPromptIntercept = await orchestrator.interceptGeneration({
    chat: [{ mes: indexedMessageText, is_user: true, index: 42 }],
    abort: () => { ownedDepthAbort = true; },
    type: 'normal'
  });
  assert.equal(ownedDepthPromptIntercept.deduplicated, true);
  assert.equal(ownedDepthPromptIntercept.abortDefaultGeneration, true);
  assert.equal(ownedDepthAbort, true);
  assert.equal(commitCalls.length, 2, 'Normal host generation must still abort while a Directive provider call is in flight.');
} finally {
  delete globalThis.__directiveOwnedGenerationDepth;
}

let regenerateAborted = false;
const regenerate = await orchestrator.interceptGeneration({
  chat: chat.messages(),
  abort: () => { regenerateAborted = true; },
  type: 'regenerate'
});
assert.equal(regenerate.deduplicated, true);
assert.equal(regenerate.abortDefaultGeneration, true, 'Regeneration must not bypass a committed Directive outcome.');
assert.equal(regenerateAborted, true);
assert.equal(commitCalls.length, 2, 'Regeneration must reuse, not reroll, committed mechanics.');

const risk = await send('Fire phasers and disable their life support.', 'player-risk');
assert.equal(risk.decision.classification, 'riskConfirmationNeeded');
assert.equal(risk.abortDefaultGeneration, true);
assert.equal(previewCalls.length, 3, 'Risk classification must still create a provisional Director turn.');
assert.equal(commitCalls.length, 2, 'Risk mechanics must remain uncommitted until confirmation.');
const riskInteraction = campaignState.runtimeTracking.pendingInteractions.find((entry) => entry.ingressId?.includes('player-risk') && entry.status === 'pending');
assert.ok(riskInteraction);
assert.ok(riskInteraction.turnId);
assert.ok(riskInteraction.outcomeId);
assert.deepEqual(riskInteraction.options.map((entry) => entry.id), ['confirm', 'revise']);

const riskResolution = await send('Confirm the order.', 'player-risk-confirm');
assert.equal(riskResolution.resolvedPendingInteraction, true);
assert.equal(riskResolution.abortDefaultGeneration, true);
assert.equal(commitCalls.length, 3);
assert.equal(commitCalls.at(-1).confirmWarnings, true);
assert.equal(previewCalls.length, 3, 'Chat confirmation must resolve the pending turn, not preview a new one.');
assert.equal(campaignState.runtimeTracking.pendingInteractions.find((entry) => entry.id === riskInteraction.id).status, 'resolved');
assert.equal(chat.messages().filter((entry) => entry.metadata?.responseKind === 'committedOutcome').length, 3);

const clarification = await send('Proceed.', 'player-clarification');
assert.equal(clarification.decision.classification, 'clarificationNeeded');
assert.equal(clarification.abortDefaultGeneration, true);
assert.equal(previewCalls.length, 3, 'Clarification should pause before invoking the Director.');
const clarificationInteraction = campaignState.runtimeTracking.pendingInteractions.find((entry) => entry.ingressId?.includes('player-clarification') && entry.status === 'pending');
assert.ok(clarificationInteraction);
assert.equal(clarificationInteraction.options.length, 0);
const canceled = await orchestrator.resolveInteraction({ interactionId: clarificationInteraction.id, action: 'cancel' });
assert.equal(canceled.ok, true);
assert.equal(commitCalls.length, 3);
assert.equal(campaignState.runtimeTracking.pendingInteractions.find((entry) => entry.id === clarificationInteraction.id).status, 'canceled');

const samClarification = await send('Proceed.', 'player-clarification-sam');
assert.equal(samClarification.decision.classification, 'clarificationNeeded');
const samClarificationInteraction = campaignState.runtimeTracking.pendingInteractions.find((entry) => (
  entry.ingressId?.includes('player-clarification-sam') && entry.status === 'pending'
));
assert.ok(samClarificationInteraction);
const commitCallsBeforeSamAnswer = commitCalls.length;
const routineResponsesBeforeSamAnswer = chat.messages().filter((entry) => entry.metadata?.responseKind === 'routineCommand').length;
const clarificationAnswerOrchestrator = createChatTurnOrchestrator({
  host: { chat, prompt },
  classify: ({ text, context }) => classifyChatTurn({
    text,
    context,
    generationRouter: {
      async generate(roleId) {
        assert.equal(roleId, 'utilityTurnClassifier');
        return {
          ok: true,
          roleId,
          response: {
            providerId: 'fixture-utility',
            text: JSON.stringify({
              kind: 'directive.turnIntentClassification',
              classification: 'routineCommand',
              responseStrategy: 'directivePosted',
              confidence: 0.78,
              ambiguity: 'medium',
              speechAct: 'order',
              action: 'engage autopilot for final docking approach',
              target: 'shuttle Tannhauser docking sequence',
              targetConfidence: 0.75,
              domainSignals: ['flight-operations', 'docking'],
              riskSignals: [],
              missingInformation: [],
              pendingInteractionResolution: samClarificationInteraction.id,
              mixedIntent: false,
              workerPlan: {
                narrator: true,
                ship: true
              },
              reasons: ['The player gives the answer to the pending autopilot/manual clarification.']
            })
          },
          diagnostics: { providerId: 'fixture-utility' }
        };
      }
    }
  }),
  responseDispatcher,
  generationRouter: {
    async generate(roleId, request) {
      responseSwipeGenerationCalls.push({ roleId, request: cloneJson(request) });
      return {
        ok: true,
        response: {
          providerId: 'fake-response-swipe-provider',
          text: `Alternate Directive response ${responseSwipeGenerationCalls.length}.`
        },
        diagnostics: { providerId: 'fake-response-swipe-provider' }
      };
    }
  },
  stateDeltaGateway,
  getCampaignState,
  setCampaignState,
  persistCampaignState,
  syncPromptContext: async (state) => state,
  previewDirectorTurn: async () => {
    throw new Error('Clarification answer routine test must not preview a Director turn.');
  },
  commitProvisionalDirectorTurn: async () => {
    throw new Error('Clarification answer routine test must not commit a provisional Director turn.');
  },
  discardProvisionalDirectorTurn: async () => {},
  sidecarScheduler: {
    schedule(payload) {
      sidecarCalls.push(cloneJson(payload));
      return Promise.resolve({ ok: true });
    }
  },
  now
});
const samAnswerMessage = chat.pushPlayerMessage({
  text: 'Sam trusts systems. The autopilot would be far better than any human piloting the final docking approach.',
  hostMessageId: 'player-clarification-sam-answer'
});
const samAnswer = await clarificationAnswerOrchestrator.observePlayerMessage({
  chatId: 'campaign-chat',
  message: samAnswerMessage
});
assert.equal(samAnswer.decision.classification, 'routineCommand');
assert.equal(samAnswer.responseStrategy, 'directivePosted');
assert.equal(samAnswer.abortDefaultGeneration, true);
assert.equal(commitCalls.length, commitCallsBeforeSamAnswer, 'Clarification answers without provisional turns must not call commitProvisionalDirectorTurn.');
assert.equal(campaignState.runtimeTracking.pendingInteractions.find((entry) => entry.id === samClarificationInteraction.id).status, 'resolved');
assert.equal(chat.messages().filter((entry) => entry.metadata?.responseKind === 'routineCommand').length, routineResponsesBeforeSamAnswer + 1);

const samAnswerIngress = campaignState.runtimeTracking.ingressLedger.find((entry) => entry.hostMessageId === 'player-clarification-sam-answer');
campaignState = updateTurnIngress(campaignState, samAnswerIngress.id, {
  status: 'invalidated',
  invalidatedAt: '2026-06-22T01:00:55.000Z',
  invalidationType: 'playerMessageDeleted',
  replacementText: null
});
campaignState = recordRecoveryEvent(campaignState, {
  id: 'recovery-sam-answer-delete',
  type: 'playerMessageDeleted',
  status: 'invalidated',
  hostMessageId: 'player-clarification-sam-answer',
  ingressId: samAnswerIngress.id,
  outcomeId: null,
  recordedAt: '2026-06-22T01:00:55.000Z'
});
const samAnswerReobserved = await clarificationAnswerOrchestrator.observePlayerMessage({
  chatId: 'campaign-chat',
  message: samAnswerMessage
});
const reobservedIngress = campaignState.runtimeTracking.ingressLedger.find((entry) => entry.id === samAnswerIngress.id);
const resolvedDeleteRecovery = campaignState.runtimeTracking.recoveryJournal.find((entry) => entry.id === 'recovery-sam-answer-delete');
assert.equal(samAnswerReobserved.handled, true);
assert.notEqual(reobservedIngress.status, 'invalidated');
assert.equal(reobservedIngress.invalidationType, null);
assert.equal(reobservedIngress.invalidatedAt, null);
assert.equal(resolvedDeleteRecovery.status, 'resolved');
assert.equal(resolvedDeleteRecovery.resolution.reason, 'message-reobserved');

const readiedSeed = migrateCommandBearingState(campaignState);
readiedSeed.tracks.resolve.points = 1;
const readiedResolve = readyCommandBearingPoint(readiedSeed, {
  readiedId: 'readied-orchestrator-resolve',
  track: 'resolve',
  chatId: 'campaign-chat',
  saveId: campaignState.campaignChatBinding.saveId,
  createdAt: '2026-06-22T01:00:57.000Z'
});
assert.equal(readiedResolve.applied, true);
campaignState = {
  ...cloneJson(campaignState),
  commandBearing: cloneJson(readiedResolve.commandBearing),
  commandStyle: cloneJson(readiedResolve.commandBearing)
};
nextCommandBearingPrompt = {
  eligible: true,
  actions: [{
    track: 'resolve',
    label: 'Use Resolve',
    from: 'Failure',
    to: 'Partial Success',
    rationale: 'Resolve fits because the player accepts responsibility and gives a lawful, specific command under pressure.'
  }]
};
const readiedCommitted = await send(
  'I order the bridge to hold formation, accept the exposure, and keep the convoy covered until the last transport clears.',
  'player-readied-resolve'
);
assert.equal(readiedCommitted.abortDefaultGeneration, true);
assert.equal(readiedCommitted.responseStrategy, 'directivePosted');
assert.equal(commitCalls.at(-1).readiedCommandBearing.track, 'resolve');
assert.equal(commitCalls.at(-1).readiedCommandBearing.id, 'readied-orchestrator-resolve');
assert.equal(commitCalls.at(-1).readiedCommandBearing.ingressId.includes('player-readied-resolve'), true);
assert.equal(commitCalls.at(-1).readiedCommandBearing.hostMessageId, 'player-readied-resolve');
assert.equal(commitCalls.at(-1).readiedCommandBearing.fit, 'strong');
assert.equal(
  responseSwipeGenerationCalls.some((entry) => entry.roleId === 'commandBearingSpendValidator'),
  true,
  'Readied Command Bearing spend must call the provider-routable spend validator.'
);
assert.equal(campaignState.commandBearing.readied, null);
assert.equal(
  campaignState.runtimeTracking.pendingInteractions.some((entry) => entry.kind === 'commandBearing' && entry.ingressId?.includes('player-readied-resolve')),
  false,
  'Readied Command Bearing spend must not use the old pause-first pending interaction.'
);

nextPreviewOutcomeBand = 'Partial Failure';
nextNarrationResult = {
  ok: false,
  error: { code: 'fixture_narration_timeout' }
};
const fallbackNarration = await send(
  'I order tactical to accept that Bronn already deleted the private trace and to proceed as if the cleanup was authorized.',
  'player-fallback-narration'
);
assert.equal(fallbackNarration.abortDefaultGeneration, true);
assert.equal(fallbackNarration.responseStrategy, 'directivePosted');
const fallbackResponse = chat.messages().filter((entry) => entry.metadata?.responseKind === 'committedOutcome').at(-1);
assert.ok(fallbackResponse);
assert.match(fallbackResponse.text, /^The attempt resolves as Partial Failure\./);
assert.equal(
  fallbackResponse.text.includes('The order is carried out'),
  false,
  'Local committed-outcome fallback must not imply a contested player-authored order succeeded.'
);
assert.equal(
  campaignState.runtimeTracking.recoveryJournal.some((entry) => entry.type === 'providerFailureAfterMechanicsCommit' && entry.outcomeId === commitCalls.at(-1).outcomeId),
  true,
  'Narration fallback should still record provider-failure recovery after mechanics commit.'
);

const assistantCountBeforeIntercept = chat.messages().filter((entry) => entry.isDirectiveOwned).length;
const lastPlayer = chat.pushPlayerMessage({ text: 'I smile and wait.', hostMessageId: 'player-interceptor' });
let aborted = false;
const intercept = await orchestrator.interceptGeneration({
  chat: [...chat.messages(), lastPlayer.raw].filter(Boolean),
  abort: () => { aborted = true; },
  type: 'normal'
});
assert.equal(intercept.abortDefaultGeneration, false);
assert.equal(aborted, false);
assert.equal(chat.messages().filter((entry) => entry.isDirectiveOwned).length, assistantCountBeforeIntercept);

assert.equal(sidecarCalls.length >= 4, true);
assert.equal(persisted.length > 0, true);
console.log('Chat-turn orchestrator tests passed: utility routing, deduplication, exactly-one response, Readied Command Bearing spend, risk pause/confirm, and clarification cancellation');
