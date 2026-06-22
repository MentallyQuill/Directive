import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { classifyChatTurn } from '../../src/adjudication/utility-turn-classifier.mjs';
import { createFakeChatAdapter, createFakePromptAdapter } from '../../src/hosts/fake/fake-host.mjs';
import { createChatTurnOrchestrator } from '../../src/runtime/chat-turn-orchestrator.mjs';
import { createResponseDispatcher } from '../../src/runtime/response-dispatcher.mjs';
import {
  createStateDeltaGateway,
  initializeCampaignRuntimeTracking
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
let pendingTurn = null;
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
    pendingTurn = {
      turnId,
      outcomePacket: {
        id: outcomeId,
        resultBand: 'success',
        visibleConsequences: ['The order changes the tactical posture.']
      },
      commandLogPacket: {
        visibleConsequences: ['The order changes the tactical posture.']
      }
    };
    previewCalls.push({ turnId, playerInput, outcomeId });
    return {
      turnPacket: cloneJson(pendingTurn),
      commandBearingPrompt: { eligible: false },
      warningConfirmation: { required: false }
    };
  },
  commitProvisionalDirectorTurn: async ({ confirmWarnings = false } = {}) => {
    assert.ok(pendingTurn, 'A provisional Director turn must exist before commit.');
    const turnPacket = cloneJson(pendingTurn);
    pendingTurn = null;
    const next = initializeCampaignRuntimeTracking(campaignState);
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
    commitCalls.push({ confirmWarnings, outcomeId: turnPacket.outcomePacket.id });
    return {
      campaignState: cloneJson(next),
      turnPacket,
      narrationResult: {
        ok: true,
        narration: { text: `Committed narration for ${turnPacket.outcomePacket.id}.` }
      }
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
      return Promise.resolve({ ok: true });
    }
  },
  now
});

async function send(text, hostMessageId) {
  const message = chat.pushPlayerMessage({ text, hostMessageId });
  return orchestrator.observePlayerMessage({ chatId: 'campaign-chat', message });
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

const routine = await send('Log the distress call, preserve the telemetry, and keep the Captain informed.', 'player-routine');
assert.equal(routine.decision.classification, 'routineCommand');
assert.equal(routine.abortDefaultGeneration, false);
assert.equal(campaignState.commandCompetence.assumedActionsLedger.some((entry) => entry.sourceMessageId === 'player-routine'), true);
assert.equal(campaignState.commandLog.entries.some((entry) => entry.type === 'routineCommand'), true);

const consequential = await send('I order helm to change course and pursue the freighter.', 'player-consequential');
assert.equal(consequential.decision.classification, 'consequentialCommand');
assert.equal(consequential.abortDefaultGeneration, true);
assert.equal(previewCalls.length, 1);
assert.equal(commitCalls.length, 1);
assert.equal(chat.messages().filter((entry) => entry.metadata?.responseKind === 'committedOutcome').length, 1);
assert.equal(campaignState.runtimeTracking.lastCommittedTurn.responseStatus, 'complete');
assert.equal(campaignState.runtimeTracking.activeIngressId.includes('player-consequential'), true);

const consequenceDuplicate = await orchestrator.observePlayerMessage({
  chatId: 'campaign-chat',
  message: chat.getMessage('player-consequential')
});
assert.equal(consequenceDuplicate.deduplicated, true);
assert.equal(consequenceDuplicate.abortDefaultGeneration, true);
assert.equal(commitCalls.length, 1);
assert.equal(chat.messages().filter((entry) => entry.metadata?.responseKind === 'committedOutcome').length, 1);
let regenerateAborted = false;
const regenerate = await orchestrator.interceptGeneration({
  chat: chat.messages(),
  abort: () => { regenerateAborted = true; },
  type: 'regenerate'
});
assert.equal(regenerate.deduplicated, true);
assert.equal(regenerate.abortDefaultGeneration, true, 'Regeneration must not bypass a committed Directive outcome.');
assert.equal(regenerateAborted, true);
assert.equal(commitCalls.length, 1, 'Regeneration must reuse, not reroll, committed mechanics.');

const risk = await send('Fire phasers and disable their life support.', 'player-risk');
assert.equal(risk.decision.classification, 'riskConfirmationNeeded');
assert.equal(risk.abortDefaultGeneration, true);
assert.equal(previewCalls.length, 2, 'Risk classification must still create a provisional Director turn.');
assert.equal(commitCalls.length, 1, 'Risk mechanics must remain uncommitted until confirmation.');
const riskInteraction = campaignState.runtimeTracking.pendingInteractions.find((entry) => entry.ingressId?.includes('player-risk') && entry.status === 'pending');
assert.ok(riskInteraction);
assert.ok(riskInteraction.turnId);
assert.ok(riskInteraction.outcomeId);
assert.deepEqual(riskInteraction.options.map((entry) => entry.id), ['confirm', 'revise']);

const riskResolution = await send('Confirm the order.', 'player-risk-confirm');
assert.equal(riskResolution.resolvedPendingInteraction, true);
assert.equal(riskResolution.abortDefaultGeneration, true);
assert.equal(commitCalls.length, 2);
assert.equal(commitCalls.at(-1).confirmWarnings, true);
assert.equal(previewCalls.length, 2, 'Chat confirmation must resolve the pending turn, not preview a new one.');
assert.equal(campaignState.runtimeTracking.pendingInteractions.find((entry) => entry.id === riskInteraction.id).status, 'resolved');
assert.equal(chat.messages().filter((entry) => entry.metadata?.responseKind === 'committedOutcome').length, 2);

const clarification = await send('Proceed.', 'player-clarification');
assert.equal(clarification.decision.classification, 'clarificationNeeded');
assert.equal(clarification.abortDefaultGeneration, true);
assert.equal(previewCalls.length, 2, 'Clarification should pause before invoking the Director.');
const clarificationInteraction = campaignState.runtimeTracking.pendingInteractions.find((entry) => entry.ingressId?.includes('player-clarification') && entry.status === 'pending');
assert.ok(clarificationInteraction);
assert.equal(clarificationInteraction.options.length, 0);
const canceled = await orchestrator.resolveInteraction({ interactionId: clarificationInteraction.id, action: 'cancel' });
assert.equal(canceled.ok, true);
assert.equal(commitCalls.length, 2);
assert.equal(campaignState.runtimeTracking.pendingInteractions.find((entry) => entry.id === clarificationInteraction.id).status, 'canceled');

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
console.log('Chat-turn orchestrator tests passed: utility routing, deduplication, exactly-one response, risk pause/confirm, and clarification cancellation');
