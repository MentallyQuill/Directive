import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { classifyChatTurn } from '../../src/adjudication/utility-turn-classifier.mjs';
import { createFakeChatAdapter, createFakePromptAdapter } from '../../src/hosts/fake/fake-host.mjs';
import { createChatTurnOrchestrator } from '../../src/runtime/chat-turn-orchestrator.mjs';
import { createResponseDispatcher } from '../../src/runtime/response-dispatcher.mjs';
import {
  createStateDeltaGateway,
  initializeCampaignRuntimeTracking,
  recordPendingInteraction,
  resolvePendingInteraction
} from '../../src/runtime/state-delta-gateway.mjs';

const root = process.cwd();
const readJson = (filePath) => JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
const cloneJson = (value) => JSON.parse(JSON.stringify(value));
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');

const chat = createFakeChatAdapter({ chatId: 'terminal-chat' });
const prompt = createFakePromptAdapter();
let campaignState = initializeCampaignRuntimeTracking(cloneJson(projection.initialState));
campaignState.campaign = {
  ...(campaignState.campaign || {}),
  id: 'campaign-terminal-orchestrator-test',
  title: 'Ashes of Peace',
  status: 'active'
};
campaignState.campaignChatBinding = {
  hostId: 'fake',
  chatId: 'terminal-chat',
  campaignId: campaignState.campaign.id,
  saveId: 'save-terminal-orchestrator-test',
  promptContextRevision: 1
};

let sequence = 0;
const now = () => `2026-06-23T11:00:${String(sequence++).padStart(2, '0')}.000Z`;
const persisted = [];
const previewCalls = [];
const commitCalls = [];
const checkpointCalls = [];
const terminalResolutionCalls = [];
let pendingTurn = null;
let classifyMode = 'consequential';
let previewRequiresWarning = false;

const getCampaignState = () => campaignState;
const setCampaignState = (next) => { campaignState = cloneJson(next); };
const persistCampaignState = async (next, summary) => {
  campaignState = cloneJson(next);
  persisted.push({ summary, revision: next.runtimeTracking?.revision || 0 });
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

function consequentialDecision() {
  return {
    kind: 'directive.validatedTurnDecision',
    classification: 'consequentialCommand',
    confidence: 0.9,
    ambiguity: 'low',
    speechAct: 'order',
    action: 'hold the line through terminal loss',
    target: 'Breckenridge command team',
    targetConfidence: 0.9,
    domainSignals: ['mission', 'ship'],
    riskSignals: ['terminal-outcome'],
    missingInformation: [],
    mixedIntent: false,
    pendingInteractionResolution: null,
    workerPlan: {
      missionDirector: true,
      ship: true,
      narrator: true
    },
    responseStrategy: 'directivePosted',
    reasons: ['Fixture consequential command triggers a terminal checkpoint.']
  };
}

const orchestrator = createChatTurnOrchestrator({
  host: { chat, prompt },
  classify: async ({ text, context } = {}) => {
    if (classifyMode === 'terminal-resolution') {
      const pending = campaignState.runtimeTracking.pendingInteractions.find((entry) => entry.kind === 'terminalOutcomeDecision' && entry.status === 'pending');
      assert.ok(pending, 'Terminal resolution fixture requires a pending terminal decision.');
      return classifyChatTurn({ text, context });
    }
    if (classifyMode === 'live-classifier') {
      return classifyChatTurn({ text, context });
    }
    return consequentialDecision();
  },
  responseDispatcher,
  stateDeltaGateway,
  getCampaignState,
  setCampaignState,
  persistCampaignState,
  syncPromptContext: async (state) => state,
  previewDirectorTurn: async ({ turnId, playerInput }) => {
    pendingTurn = {
      turnId,
      outcomePacket: {
        id: 'outcome-terminal-orchestrator',
        resultBand: 'Great Failure',
        visibleConsequences: ['The Breckenridge is lost in a committed terminal timeline.']
      },
      commandLogPacket: {
        visibleConsequences: ['The Breckenridge is lost in a committed terminal timeline.']
      }
    };
    previewCalls.push({ turnId, playerInput });
    return {
      turnPacket: cloneJson(pendingTurn),
      commandBearingPrompt: { eligible: false },
      warningConfirmation: { required: previewRequiresWarning }
    };
  },
  commitProvisionalDirectorTurn: async () => {
    assert.ok(pendingTurn, 'Terminal fixture requires a provisional turn before commit.');
    const terminalDecisionId = campaignState.campaign?.id === 'campaign-terminal-risk-confirmation-test'
      ? 'terminal-decision-risk-orchestrator'
      : 'terminal-decision-orchestrator';
    const terminalInteraction = {
      id: terminalDecisionId,
      kind: 'terminalOutcomeDecision',
      status: 'pending',
      ingressId: campaignState.runtimeTracking?.activeIngressId || null,
      turnId: pendingTurn.turnId,
      outcomeId: pendingTurn.outcomePacket.id,
      prompt: 'Directive Checkpoint',
      options: [
        { id: 'replayFromCheckpoint', action: 'replayFromCheckpoint', label: 'Replay from checkpoint' },
        { id: 'pushOn', action: 'pushOn', label: 'Push On' },
        { id: 'keepEnding', action: 'keepEnding', label: 'Keep this ending' },
        { id: 'saveTerminalBranch', action: 'saveTerminalBranch', label: 'Save as branch' }
      ],
      metadata: {
        terminalOutcomeId: 'terminal.fixture.ship-loss',
        terminalOutcomeBand: 'Great Failure',
        finalCampaignBandCandidate: 'Partial Failure',
        reason: 'The Breckenridge is lost in the committed timeline.'
      }
    };
    const next = recordPendingInteraction(initializeCampaignRuntimeTracking(campaignState), terminalInteraction);
    next.runtimeTracking.endConditionLedger = {
      schemaVersion: 1,
      activeDecisionId: terminalInteraction.id,
      detections: [{ id: 'terminal-detection-orchestrator', decisionId: terminalInteraction.id }],
      decisions: [{
        id: terminalInteraction.id,
        status: 'pending',
        conditionId: terminalInteraction.metadata.terminalOutcomeId,
        postedAt: null,
        resolvedAt: null,
        resolution: null
      }],
      branchRecords: [],
      continuationFrames: []
    };
    setCampaignState(next);
    await persistCampaignState(next, 'Fixture terminal mechanics committed.');
    commitCalls.push({ outcomeId: pendingTurn.outcomePacket.id });
    const turnPacket = cloneJson(pendingTurn);
    const includeReturnedTerminalDecision = campaignState.campaign?.id !== 'campaign-terminal-risk-confirmation-test';
    pendingTurn = null;
    return {
      campaignState: cloneJson(next),
      turnPacket,
      terminalDecision: includeReturnedTerminalDecision ? {
        pendingInteraction: cloneJson(terminalInteraction),
        detection: {
          decisionId: terminalInteraction.id,
          conditionId: terminalInteraction.metadata.terminalOutcomeId
        }
      } : null,
      narrationResult: {
        ok: true,
        narration: { text: 'The terminal consequence lands before Directive offers the checkpoint.' }
      }
    };
  },
  postTerminalOutcomeCheckpoint: async ({ interactionId }) => {
    checkpointCalls.push({ interactionId, responseKindsBefore: chat.messages().map((entry) => entry.metadata?.responseKind || null) });
    const posted = await chat.postAssistantMessage({
      text: 'Directive Checkpoint\n\nReplay from checkpoint\nPush On\nKeep this ending\nSave as branch',
      responseKind: 'terminalOutcomeCheckpoint',
      idempotencyKey: `${interactionId}:checkpoint`
    });
    const next = initializeCampaignRuntimeTracking(campaignState);
    next.runtimeTracking.endConditionLedger.decisions = next.runtimeTracking.endConditionLedger.decisions.map((entry) => entry.id === interactionId
      ? { ...entry, postedAt: now(), checkpointMessageId: posted.hostMessageId || null }
      : entry);
    setCampaignState(next);
    await persistCampaignState(next, 'Fixture terminal checkpoint posted.');
    return { ok: true, posted, campaignState: cloneJson(next) };
  },
  resolveTerminalOutcomeDecision: async ({ interactionId, action, playerArgument }) => {
    terminalResolutionCalls.push({ interactionId, action, playerArgument });
    let next = resolvePendingInteraction(initializeCampaignRuntimeTracking(campaignState), interactionId, {
      status: 'resolved',
      action,
      resolvedAt: now()
    });
    next.runtimeTracking.endConditionLedger.activeDecisionId = null;
    next.runtimeTracking.endConditionLedger.decisions = next.runtimeTracking.endConditionLedger.decisions.map((entry) => entry.id === interactionId
      ? { ...entry, status: 'pushedOn', resolvedAt: now(), resolution: { action, playerArgument } }
      : entry);
    setCampaignState(next);
    await persistCampaignState(next, 'Fixture terminal decision resolved.');
    return { ok: true, action, campaignState: cloneJson(next) };
  },
  turnCommitCoordinator: {
    async markResponse({ campaignState: state, outcomeId, status, hostMessageId }) {
      const next = initializeCampaignRuntimeTracking(state);
      next.runtimeTracking.lastCommittedTurn = {
        ...(next.runtimeTracking.lastCommittedTurn || {}),
        outcomeId,
        responseStatus: status,
        hostMessageId
      };
      setCampaignState(next);
      await persistCampaignState(next, 'Fixture response marked.');
      return { campaignState: cloneJson(next) };
    }
  },
  discardProvisionalDirectorTurn: async () => { pendingTurn = null; },
  now
});

const firstMessage = chat.pushPlayerMessage({
  text: 'I order the Breckenridge to hold the line even if it costs us the ship.',
  hostMessageId: 'player-terminal-command'
});
const terminal = await orchestrator.observePlayerMessage({
  chatId: 'terminal-chat',
  message: firstMessage
});
assert.equal(terminal.abortDefaultGeneration, true);
assert.equal(previewCalls.length, 1);
assert.equal(commitCalls.length, 1);
assert.equal(checkpointCalls.length, 1);
assert.deepEqual(checkpointCalls[0].responseKindsBefore.filter(Boolean), ['committedOutcome']);
assert.deepEqual(
  chat.messages().filter((entry) => entry.isDirectiveOwned).map((entry) => entry.metadata?.responseKind),
  ['committedOutcome', 'terminalOutcomeCheckpoint']
);
assert.equal(campaignState.runtimeTracking.pendingInteractions.find((entry) => entry.id === 'terminal-decision-orchestrator').status, 'pending');

classifyMode = 'terminal-resolution';
const reply = chat.pushPlayerMessage({
  text: 'Push on. We still have survivors and the evidence.',
  hostMessageId: 'player-terminal-push-on'
});
const resolved = await orchestrator.observePlayerMessage({
  chatId: 'terminal-chat',
  message: reply
});
assert.equal(resolved.abortDefaultGeneration, true);
assert.equal(resolved.resolvedPendingInteraction, true);
assert.equal(terminalResolutionCalls.length, 1);
assert.equal(terminalResolutionCalls[0].action, 'pushOn');
assert.equal(terminalResolutionCalls[0].playerArgument, 'Push on. We still have survivors and the evidence.');
assert.equal(previewCalls.length, 1, 'Terminal pending replies must resolve the checkpoint instead of starting a new Director turn.');
assert.equal(commitCalls.length, 1);
assert.equal(campaignState.runtimeTracking.pendingInteractions.find((entry) => entry.id === 'terminal-decision-orchestrator').status, 'resolved');
assert.equal(campaignState.runtimeTracking.endConditionLedger.decisions[0].status, 'pushedOn');

campaignState = initializeCampaignRuntimeTracking(cloneJson(projection.initialState));
campaignState.campaign = {
  ...(campaignState.campaign || {}),
  id: 'campaign-terminal-ledger-only-test',
  title: 'Ashes of Peace',
  status: 'active'
};
campaignState.campaignChatBinding = {
  hostId: 'fake',
  chatId: 'terminal-chat',
  campaignId: campaignState.campaign.id,
  saveId: 'save-terminal-ledger-only-test',
  promptContextRevision: 1
};
campaignState.runtimeTracking.pendingInteractions = [];
campaignState.runtimeTracking.endConditionLedger = {
  schemaVersion: 1,
  activeDecisionId: 'terminal-decision-ledger-only',
  detections: [{ id: 'terminal-detection-ledger-only', decisionId: 'terminal-decision-ledger-only' }],
  decisions: [{
    id: 'terminal-decision-ledger-only',
    status: 'pending',
    conditionId: 'terminal.fixture.ledger-only',
    condition: {
      resolutionPolicy: {
        actions: ['replayFromCheckpoint', 'pushOn', 'keepEnding', 'saveTerminalBranch']
      }
    },
    postedAt: now(),
    resolvedAt: null,
    resolution: null
  }],
  branchRecords: [],
  continuationFrames: []
};
classifyMode = 'live-classifier';
const ledgerOnlyResolutionCount = terminalResolutionCalls.length;
const ledgerOnlyReply = chat.pushPlayerMessage({
  text: 'Replay from checkpoint',
  hostMessageId: 'player-terminal-ledger-only-replay'
});
const ledgerOnlyResolved = await orchestrator.observePlayerMessage({
  chatId: 'terminal-chat',
  message: ledgerOnlyReply
});
assert.equal(ledgerOnlyResolved.abortDefaultGeneration, true);
assert.equal(ledgerOnlyResolved.resolvedPendingInteraction, true);
assert.equal(terminalResolutionCalls.length, ledgerOnlyResolutionCount + 1);
assert.equal(terminalResolutionCalls.at(-1).interactionId, 'terminal-decision-ledger-only');
assert.equal(terminalResolutionCalls.at(-1).action, 'replayFromCheckpoint');

campaignState = initializeCampaignRuntimeTracking(cloneJson(projection.initialState));
campaignState.campaign = {
  ...(campaignState.campaign || {}),
  id: 'campaign-terminal-risk-confirmation-test',
  title: 'Ashes of Peace',
  status: 'active'
};
campaignState.campaignChatBinding = {
  hostId: 'fake',
  chatId: 'terminal-chat',
  campaignId: campaignState.campaign.id,
  saveId: 'save-terminal-risk-confirmation-test',
  promptContextRevision: 1
};
pendingTurn = null;
classifyMode = 'consequential';
previewRequiresWarning = true;
const checkpointCountBeforeRisk = checkpointCalls.length;
const riskMessage = chat.pushPlayerMessage({
  text: 'I order the Breckenridge to hold the line even if it costs us the ship.',
  hostMessageId: 'player-terminal-risk-command'
});
const risk = await orchestrator.observePlayerMessage({
  chatId: 'terminal-chat',
  message: riskMessage
});
assert.equal(risk.abortDefaultGeneration, true);
assert.equal(risk.decision.classification, 'riskConfirmationNeeded');
assert.equal(checkpointCalls.length, checkpointCountBeforeRisk, 'Risk warning must not post the terminal checkpoint before confirmation.');
const riskInteraction = campaignState.runtimeTracking.pendingInteractions.find((entry) => entry.kind === 'riskConfirmationNeeded' && entry.status === 'pending');
assert.ok(riskInteraction);

classifyMode = 'live-classifier';
const riskReply = chat.pushPlayerMessage({
  text: 'Confirm the order.',
  hostMessageId: 'player-terminal-risk-confirm'
});
const riskConfirmed = await orchestrator.observePlayerMessage({
  chatId: 'terminal-chat',
  message: riskReply
});
assert.equal(riskConfirmed.abortDefaultGeneration, true);
assert.equal(riskConfirmed.resolvedPendingInteraction, true);
assert.equal(checkpointCalls.length, checkpointCountBeforeRisk + 1, 'Risk-confirmed terminal commits must post the terminal checkpoint.');
assert.equal(campaignState.runtimeTracking.pendingInteractions.find((entry) => entry.id === riskInteraction.id).status, 'resolved');
assert.equal(campaignState.runtimeTracking.pendingInteractions.find((entry) => entry.kind === 'terminalOutcomeDecision' && entry.status === 'pending')?.id, 'terminal-decision-risk-orchestrator');
assert.deepEqual(
  chat.messages().filter((entry) => entry.isDirectiveOwned).map((entry) => entry.metadata?.responseKind).slice(-3),
  ['riskConfirmationNeeded', 'committedOutcome', 'terminalOutcomeCheckpoint']
);

console.log('Chat terminal outcome tests passed: checkpoint posts after consequence and chat replies resolve terminal decisions');
