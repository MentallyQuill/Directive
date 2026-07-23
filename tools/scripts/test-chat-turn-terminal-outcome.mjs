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
import {
  terminalDecisionLedgerView,
  withTerminalDecisionLedgerProjection
} from '../../src/runtime/terminal-decision-ledger-view.mjs';

const root = process.cwd();
const readJson = (filePath) => JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
const cloneJson = (value) => JSON.parse(JSON.stringify(value));
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');

function terminalLedgerProjection(rowKind, {
  decisionId,
  detectionId = null,
  conditionId = null,
  turnId = null,
  outcomeId = null,
  status = null,
  action = null
} = {}) {
  return {
    authority: 'terminalDecisionProjection',
    projectionSource: 'coreStoreV2',
    coreProjection: {
      kind: 'directive.terminalEndConditionLedgerProjectionRef.v1',
      rowKind,
      decisionId,
      detectionId,
      conditionId,
      turnId,
      outcomeId,
      status,
      action
    }
  };
}

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
const terminalSettlementCalls = [];
const sidecarScheduleCalls = [];
const commandLogScheduleCalls = [];
const postCommitScheduleCalls = [];
let pendingTurn = null;
let classifyMode = 'consequential';
let previewRequiresWarning = false;
let dropResolvedIngressOnce = false;
const corePendingInteractionEvents = [];
const coreTerminalDecisionLedgerEvents = [];

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
const coreTransactions = new Map();
const coreTurnStore = {
  async beginTurn(sourceFrame, options = {}) {
    const transaction = {
      id: options.transactionId || `txn:${sourceFrame.id}`,
      phase: 'observed',
      sourceFrameId: sourceFrame.id,
      ingressId: options.ingressId || `ingress:${options.transactionId || sourceFrame.id}`,
      sourceFrame: cloneJson(sourceFrame)
    };
    coreTransactions.set(transaction.id, transaction);
    return transaction;
  },
  async advanceTurn(transactionId, patch = {}) {
    const previous = coreTransactions.get(transactionId) || { id: transactionId };
    const next = {
      ...previous,
      ...cloneJson(patch),
      id: transactionId,
      phase: patch.phase || previous.phase || 'observed',
      route: patch.route || previous.route || null,
      responseId: patch.responseId || previous.responseId || null,
      responseKind: patch.responseKind || previous.responseKind || null,
      outcomeId: patch.outcomeId || previous.outcomeId || null,
      timing: cloneJson(patch.timing || previous.timing || null)
    };
    coreTransactions.set(transactionId, next);
    return next;
  },
  async recordVisibleResponse(transactionId, responseRef = {}) {
    const previous = coreTransactions.get(transactionId) || { id: transactionId };
    const next = {
      ...previous,
      id: transactionId,
      phase: 'visibleResponsePosted',
      visibleResponseRef: cloneJson(responseRef)
    };
    coreTransactions.set(transactionId, next);
    return next;
  },
  async recordPendingInteraction(transactionId, interaction = {}) {
    const transaction = coreTransactions.get(transactionId) || { id: transactionId };
    const row = {
      id: interaction.id,
      kind: interaction.kind || 'decision',
      status: 'pending',
      ingressId: interaction.ingressId || transaction.ingressId || null,
      turnId: interaction.turnId || null,
      outcomeId: interaction.outcomeId || transaction.outcomeId || null,
      coreTransactionId: transactionId,
      prompt: interaction.prompt || null,
      options: cloneJson(interaction.options || []),
      authority: 'corePendingInteractionProjection',
      projectionSource: 'coreStoreV2',
      compatibilityMirror: {
        kind: 'directive.pendingInteractionCompatibilityMirror.v1',
        status: 'pending',
        interactionId: interaction.id,
        ingressId: interaction.ingressId || transaction.ingressId || null,
        transactionId
      },
      coreProjection: {
        kind: 'directive.corePendingInteractionProjectionRef.v1',
        interactionId: interaction.id,
        transactionId,
        ingressId: interaction.ingressId || transaction.ingressId || null,
        status: 'pending'
      }
    };
    corePendingInteractionEvents.push({ type: 'recorded', transactionId, row: cloneJson(row) });
    return cloneJson(row);
  },
  async resolvePendingInteraction(transactionId, interactionId, resolution = {}) {
    const prior = [...corePendingInteractionEvents].reverse()
      .map((event) => event.row)
      .find((entry) => entry.id === interactionId) || { id: interactionId, kind: 'decision' };
    const row = {
      ...cloneJson(prior),
      status: resolution.status || 'resolved',
      resolvedAt: resolution.resolvedAt || now(),
      resolution: cloneJson(resolution),
      compatibilityMirror: {
        ...(prior.compatibilityMirror || {}),
        status: resolution.status || 'resolved'
      },
      coreProjection: {
        ...(prior.coreProjection || {}),
        status: resolution.status || 'resolved'
      }
    };
    corePendingInteractionEvents.push({ type: 'resolved', transactionId, row: cloneJson(row) });
    return cloneJson(row);
  },
  async recordTerminalDecisionLedger(transactionId, ledger = {}, options = {}) {
    const row = cloneJson(ledger);
    coreTerminalDecisionLedgerEvents.push({
      type: 'projected',
      transactionId,
      idempotencyKey: options.idempotencyKey || null,
      ledger: row
    });
    return cloneJson(row);
  },
  async readProjections() {
    const ingressLedger = [...coreTransactions.values()]
      .filter((transaction) => transaction.ingressId)
      .map((transaction) => ({
        id: transaction.ingressId,
        ingressId: transaction.ingressId,
        transactionId: transaction.id,
        coreTransactionId: transaction.id,
        sourceFrameId: transaction.sourceFrameId || transaction.sourceFrame?.id || null,
        hostMessageId: transaction.sourceFrame?.hostMessageId || null,
        textHash: transaction.sourceFrame?.textHash || null,
        status: transaction.phase || 'observed',
        coreProjection: {
          kind: 'directive.coreIngressProjectionRef.v1',
          transactionId: transaction.id,
          sourceFrameId: transaction.sourceFrameId || transaction.sourceFrame?.id || null,
          status: transaction.phase || 'observed'
        }
      }));
    return {
      pendingInteractions: Object.values(corePendingInteractionEvents.reduce((acc, event) => {
        acc[event.row.id] = event.row;
        return acc;
      }, {})).map(cloneJson),
      terminalDecisionLedger: coreTerminalDecisionLedgerEvents.at(-1)?.ledger || {
        schemaVersion: 1,
        activeDecisionId: null,
        detections: [],
        decisions: [],
        branchRecords: [],
        continuationFrames: []
      },
      ingressLedger,
      responseLedger: [...coreTransactions.values()]
        .filter((transaction) => transaction.visibleResponseRef || transaction.responseId || ['hostContinueReleased', 'visibleResponsePosted'].includes(transaction.phase))
        .map((transaction) => ({
          id: transaction.visibleResponseRef?.responseId || transaction.responseId || null,
          responseId: transaction.visibleResponseRef?.responseId || transaction.responseId || null,
          transactionId: transaction.id,
          hostMessageId: transaction.visibleResponseRef?.hostMessageId || null,
          outcomeId: transaction.visibleResponseRef?.outcomeId || transaction.outcomeId || null,
          responseKind: transaction.visibleResponseRef?.responseKind || transaction.responseKind || null,
          status: transaction.phase,
          generationStartedAt: transaction.visibleResponseRef?.visibleResponsePostedAt || null
        }))
        .filter((entry) => entry.responseId || entry.transactionId),
      recoveryJournal: []
    };
  }
};
const responseDispatcher = createResponseDispatcher({
  host: { chat },
  coreTurnStore,
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
      const pending = terminalDecisionLedgerView(campaignState).decisions.find((entry) => entry.status === 'pending');
      assert.ok(pending, 'Terminal resolution fixture requires a pending terminal ledger decision.');
      return classifyChatTurn({ text, context });
    }
    if (classifyMode === 'live-classifier') {
      return classifyChatTurn({ text, context });
    }
    return consequentialDecision();
  },
  responseDispatcher,
  stateDeltaGateway,
  coreTurnStore,
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
        { id: 'keepEnding', action: 'keepEnding', label: 'Keep this ending' }
      ],
      metadata: {
        terminalOutcomeId: 'terminal.fixture.ship-loss',
        terminalOutcomeBand: 'Great Failure',
        finalCampaignBandCandidate: 'Partial Failure',
        reason: 'The Breckenridge is lost in the committed timeline.'
      },
      authority: 'terminalDecisionProjection',
      projectionSource: 'coreStoreV2',
      coreProjection: {
        kind: 'directive.terminalPendingInteractionProjectionRef.v1',
        decisionId: terminalDecisionId,
        conditionId: 'terminal.fixture.ship-loss',
        turnId: pendingTurn.turnId,
        outcomeId: pendingTurn.outcomePacket.id,
        status: 'pending'
      }
    };
    const terminalDecisionLedger = {
      schemaVersion: 1,
      activeDecisionId: terminalInteraction.id,
      detections: [{
        id: 'terminal-detection-orchestrator',
        decisionId: terminalInteraction.id,
        ...terminalLedgerProjection('detection', {
          decisionId: terminalInteraction.id,
          detectionId: 'terminal-detection-orchestrator',
          conditionId: terminalInteraction.metadata.terminalOutcomeId,
          turnId: pendingTurn.turnId,
          outcomeId: pendingTurn.outcomePacket.id,
          status: 'detected'
        })
      }],
      decisions: [{
        id: terminalInteraction.id,
        status: 'pending',
        conditionId: terminalInteraction.metadata.terminalOutcomeId,
        postedAt: null,
        resolvedAt: null,
        resolution: null,
        ...terminalLedgerProjection('decision', {
          decisionId: terminalInteraction.id,
          conditionId: terminalInteraction.metadata.terminalOutcomeId,
          turnId: pendingTurn.turnId,
          outcomeId: pendingTurn.outcomePacket.id,
          status: 'pending'
        })
      }],
      branchRecords: [],
      continuationFrames: []
    };
    let next = withTerminalDecisionLedgerProjection(initializeCampaignRuntimeTracking(campaignState), terminalDecisionLedger);
    setCampaignState(next);
    await persistCampaignState(next, 'Fixture terminal mechanics committed.');
    const terminalTransaction = [...coreTransactions.values()]
      .find((entry) => entry.ingressId === terminalInteraction.ingressId);
    assert.ok(terminalTransaction?.id, 'Terminal fixture requires CORE ingress transaction before pending decision.');
    await coreTurnStore.recordTerminalDecisionLedger(terminalTransaction.id, terminalDecisionLedger, {
      idempotencyKey: `terminal-fixture-ledger:${terminalInteraction.id}`
    });
    await coreTurnStore.recordPendingInteraction(terminalTransaction.id, terminalInteraction);
    next = withTerminalDecisionLedgerProjection(next, coreTerminalDecisionLedgerEvents.at(-1).ledger);
    setCampaignState(next);
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
      text: 'Directive Checkpoint\n\nReplay from checkpoint\nPush On\nKeep this ending',
      responseKind: 'terminalOutcomeCheckpoint',
      idempotencyKey: `${interactionId}:checkpoint`
    });
    const ledger = terminalDecisionLedgerView(campaignState);
    const nextLedger = {
      ...ledger,
      decisions: ledger.decisions.map((entry) => entry.id === interactionId
      ? { ...entry, postedAt: now(), checkpointMessageId: posted.hostMessageId || null }
      : entry)
    };
    const pendingCore = [...corePendingInteractionEvents].reverse()
      .map((event) => event.row)
      .find((entry) => entry.id === interactionId);
    await coreTurnStore.recordTerminalDecisionLedger(pendingCore.coreTransactionId, nextLedger, {
      idempotencyKey: `terminal-fixture-checkpoint-posted:${interactionId}`
    });
    const next = withTerminalDecisionLedgerProjection(initializeCampaignRuntimeTracking(campaignState), nextLedger);
    setCampaignState(next);
    await persistCampaignState(next, 'Fixture terminal checkpoint posted.');
    return { ok: true, posted, campaignState: cloneJson(next) };
  },
  resolveTerminalOutcomeDecision: async ({ interactionId, action, playerArgument, resolutionIngressId }) => {
    terminalResolutionCalls.push({ interactionId, action, playerArgument });
    const pendingCore = [...corePendingInteractionEvents].reverse()
      .map((event) => event.row)
      .find((entry) => entry.id === interactionId);
    assert.ok(pendingCore?.coreTransactionId, 'Terminal resolution fixture requires CORE pending-interaction authority.');
    await coreTurnStore.resolvePendingInteraction(pendingCore.coreTransactionId, interactionId, {
      status: 'resolved',
      action,
      playerArgument,
      resolutionIngressId,
      resolvedAt: now()
    });
    const ledger = terminalDecisionLedgerView(campaignState);
    const nextLedger = {
      ...ledger,
      activeDecisionId: null,
      decisions: ledger.decisions.map((entry) => entry.id === interactionId
      ? { ...entry, status: 'pushedOn', resolvedAt: now(), resolution: { action, playerArgument } }
      : entry)
    };
    await coreTurnStore.recordTerminalDecisionLedger(pendingCore.coreTransactionId, nextLedger, {
      idempotencyKey: `terminal-fixture-resolved:${interactionId}:${action}`
    });
    let next = withTerminalDecisionLedgerProjection(initializeCampaignRuntimeTracking(campaignState), nextLedger);
    if (dropResolvedIngressOnce) {
      dropResolvedIngressOnce = false;
      next.runtimeTracking.ingressLedger = (next.runtimeTracking.ingressLedger || []).filter((entry) => entry.id !== resolutionIngressId);
    }
    setCampaignState(next);
    await persistCampaignState(next, 'Fixture terminal decision resolved.');
    return { ok: true, action, campaignState: cloneJson(next) };
  },
  recordTerminalCheckpointSettlement: (event) => {
    terminalSettlementCalls.push(cloneJson(event));
    return {
      kind: 'directive.terminalCheckpointSettlementScheduled',
      scheduled: true,
      status: event.status,
      settlementKind: event.kind,
      interactionId: event.interactionId || null,
      ingressId: event.ingressId || null,
      resolutionIngressId: event.resolutionIngressId || null,
      outcomeId: event.outcomeId || null
    };
  },
  sidecarScheduler: {
    schedule(payload) {
      sidecarScheduleCalls.push(cloneJson(payload));
      return {
        ok: true,
        scheduled: true,
        outcomeId: payload.turnContext?.outcomeId || null
      };
    }
  },
  scheduleCommandLogSummaryForCommittedTurn: (payload) => {
    commandLogScheduleCalls.push(cloneJson(payload));
    return {
      ok: null,
      scheduled: true,
      outcomeId: payload.outcomeId || null
    };
  },
  schedulePostCommitConversationProcessor: (conversation) => {
    postCommitScheduleCalls.push(cloneJson(conversation));
    return {
      ok: null,
      scheduled: true,
      outcomeId: conversation.outcomeId || null
    };
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

function corePendingInteractions(state = campaignState) {
  return state.directiveRuntimeEvidence?.coreStoreReadProjections?.pendingInteractions || [];
}

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
assert.equal(terminalSettlementCalls.length, 1);
assert.equal(terminalSettlementCalls[0].kind, 'terminalOutcomeCheckpointPosted');
assert.equal(terminal.terminalCheckpointSettlement.status, 'posted');
assert.equal(sidecarScheduleCalls.length, 1, 'Terminal committed outcome still schedules normal post-visible sidecars for the committed outcome.');
assert.equal(commandLogScheduleCalls.length, 1, 'Terminal committed outcome still schedules Command Log summary for the committed outcome.');
assert.equal(postCommitScheduleCalls.length, 1, 'Terminal committed outcome still schedules Narrative Thread settlement for the committed outcome.');
assert.deepEqual(
  chat.messages().filter((entry) => entry.isDirectiveOwned).map((entry) => entry.metadata?.responseKind),
  ['committedOutcome', 'terminalOutcomeCheckpoint']
);
assert.equal(campaignState.runtimeTracking.pendingInteractions.some((entry) => entry.kind === 'terminalOutcomeDecision'), false);
assert.equal(campaignState.runtimeTracking.endConditionLedger.activeDecisionId, null);
assert.equal(terminalDecisionLedgerView(campaignState).activeDecisionId, 'terminal-decision-orchestrator');

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
assert.equal(terminalSettlementCalls.length, 2);
assert.equal(terminalSettlementCalls.at(-1).kind, 'terminalOutcomeCheckpointResolved');
assert.equal(terminalSettlementCalls.at(-1).ingressId, resolved.terminalCheckpointSettlement.ingressId);
assert.equal(resolved.terminalCheckpointSettlement.status, 'resolved');
assert.equal(previewCalls.length, 1, 'Terminal pending replies must resolve the checkpoint instead of starting a new Director turn.');
assert.equal(commitCalls.length, 1);
assert.equal(sidecarScheduleCalls.length, 1, 'Terminal checkpoint replies must not schedule normal sidecars.');
assert.equal(commandLogScheduleCalls.length, 1, 'Terminal checkpoint replies must not schedule Command Log summary.');
assert.equal(postCommitScheduleCalls.length, 1, 'Terminal checkpoint replies must not schedule Narrative Thread extraction.');
assert.equal(campaignState.runtimeTracking.pendingInteractions.some((entry) => entry.kind === 'terminalOutcomeDecision'), false);
assert.equal(terminalDecisionLedgerView(campaignState).decisions[0].status, 'pushedOn');

const missingIngressTerminal = {
  id: 'terminal-decision-missing-ingress',
  kind: 'terminalOutcomeDecision',
  status: 'pending',
  ingressId: 'ingress-terminal-missing-ingress-source',
  turnId: 'turn-terminal-missing-ingress',
  outcomeId: 'outcome-terminal-missing-ingress',
  prompt: 'Directive Checkpoint',
  options: [
    { id: 'pushOn', action: 'pushOn', label: 'Push On' }
  ],
  metadata: {
    terminalOutcomeId: 'terminal-missing-ingress'
  },
  authority: 'corePendingInteractionProjection',
  projectionSource: 'coreStoreV2',
  coreProjection: {
    kind: 'directive.corePendingInteractionProjectionRef.v1',
    interactionId: 'terminal-decision-missing-ingress',
    transactionId: 'txn:terminal-missing-ingress',
    ingressId: 'ingress-terminal-missing-ingress-source',
    status: 'pending'
  },
  compatibilityMirror: {
    kind: 'directive.pendingInteractionCompatibilityMirror.v1',
    interactionId: 'terminal-decision-missing-ingress',
    transactionId: 'txn:terminal-missing-ingress',
    ingressId: 'ingress-terminal-missing-ingress-source',
    status: 'pending',
    projectionSource: 'coreStoreV2'
  }
};
campaignState = withTerminalDecisionLedgerProjection(initializeCampaignRuntimeTracking(campaignState), {
  schemaVersion: 1,
  activeDecisionId: missingIngressTerminal.id,
  decisions: [{
    id: missingIngressTerminal.id,
    status: 'pending',
    conditionId: 'terminal-missing-ingress',
    ...terminalLedgerProjection('decision', {
      decisionId: missingIngressTerminal.id,
      conditionId: 'terminal-missing-ingress',
      turnId: 'turn-terminal-missing-ingress',
      outcomeId: 'outcome-terminal-missing-ingress',
      status: 'pending'
    })
  }],
  detections: [],
  branchRecords: [],
  continuationFrames: []
});
setCampaignState(campaignState);
await coreTurnStore.recordTerminalDecisionLedger('txn:terminal-missing-ingress', terminalDecisionLedgerView(campaignState), {
  idempotencyKey: 'terminal-missing-ingress-ledger'
});
await coreTurnStore.recordPendingInteraction('txn:terminal-missing-ingress', missingIngressTerminal);
const terminalMissingIngressRuntimeCountBefore = campaignState.runtimeTracking.ingressLedger.length;
const terminalMissingIngressCoreCountBefore = campaignState.directiveRuntimeEvidence?.coreStoreReadProjections?.ingressLedger?.length || 0;
dropResolvedIngressOnce = true;
const missingIngressReply = chat.pushPlayerMessage({
  text: 'Push on. Keep the evidence moving.',
  hostMessageId: 'player-terminal-missing-ingress-resolution'
});
const missingIngressResolution = await orchestrator.observePlayerMessage({
  chatId: 'terminal-chat',
  message: missingIngressReply
});
assert.equal(missingIngressResolution.resolvedPendingInteraction, true);
assert.equal(missingIngressResolution.reason || null, null);
const restoredResolutionIngress = (campaignState.directiveRuntimeEvidence?.coreStoreReadProjections?.ingressLedger || [])
  .find((entry) => entry.hostMessageId === 'player-terminal-missing-ingress-resolution');
assert.equal(Boolean(restoredResolutionIngress?.coreTransactionId), true, 'Terminal resolution must restore the ingress through CORE projection evidence.');
assert.equal(campaignState.directiveRuntimeEvidence.coreStoreReadProjections.ingressLedger.length, terminalMissingIngressCoreCountBefore + 1);
assert.equal(
  campaignState.runtimeTracking.ingressLedger.length,
  terminalMissingIngressRuntimeCountBefore,
  'Terminal resolution must not restore old runtimeTracking ingress authority.'
);

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
campaignState = withTerminalDecisionLedgerProjection(campaignState, {
  schemaVersion: 1,
  activeDecisionId: 'terminal-decision-ledger-only',
  detections: [{
    id: 'terminal-detection-ledger-only',
    decisionId: 'terminal-decision-ledger-only',
    ...terminalLedgerProjection('detection', {
      decisionId: 'terminal-decision-ledger-only',
      detectionId: 'terminal-detection-ledger-only',
      conditionId: 'terminal.fixture.ledger-only',
      status: 'detected'
    })
  }],
  decisions: [{
    id: 'terminal-decision-ledger-only',
    status: 'pending',
    conditionId: 'terminal.fixture.ledger-only',
    condition: {
      resolutionPolicy: {
        actions: ['replayFromCheckpoint', 'pushOn', 'keepEnding']
      }
    },
    postedAt: now(),
    resolvedAt: null,
    resolution: null,
    ...terminalLedgerProjection('decision', {
      decisionId: 'terminal-decision-ledger-only',
      conditionId: 'terminal.fixture.ledger-only',
      status: 'pending'
    })
  }],
  branchRecords: [],
  continuationFrames: []
});
classifyMode = 'live-classifier';
const ledgerOnlyResolutionCount = terminalResolutionCalls.length;
await coreTurnStore.recordTerminalDecisionLedger('txn:terminal-decision-ledger-only', terminalDecisionLedgerView(campaignState), {
  idempotencyKey: 'terminal-ledger-only-ledger'
});
await coreTurnStore.recordPendingInteraction('txn:terminal-decision-ledger-only', {
  id: 'terminal-decision-ledger-only',
  kind: 'terminalOutcomeDecision',
  status: 'pending',
  ingressId: 'ingress-terminal-ledger-only',
  prompt: 'Directive Checkpoint',
  options: [
    { id: 'replayFromCheckpoint', action: 'replayFromCheckpoint', label: 'Replay from checkpoint' },
    { id: 'pushOn', action: 'pushOn', label: 'Push On' },
    { id: 'keepEnding', action: 'keepEnding', label: 'Keep this ending' }
  ]
});
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
assert.equal(sidecarScheduleCalls.length, 1, 'Ledger-only terminal checkpoint replies must not schedule normal sidecars.');
assert.equal(commandLogScheduleCalls.length, 1, 'Ledger-only terminal checkpoint replies must not schedule Command Log summary.');
assert.equal(postCommitScheduleCalls.length, 1, 'Ledger-only terminal checkpoint replies must not schedule Narrative Thread extraction.');

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
assert.deepEqual(campaignState.runtimeTracking.pendingInteractions, []);
const riskInteraction = corePendingInteractions().find((entry) => entry.kind === 'riskConfirmationNeeded' && entry.status === 'pending');
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
assert.equal(terminalSettlementCalls.at(-1).kind, 'terminalOutcomeCheckpointPosted');
assert.equal(riskConfirmed.terminalCheckpointSettlement.status, 'posted');
assert.equal(sidecarScheduleCalls.length, 2, 'Risk-confirmed terminal commits schedule normal sidecars only after committed outcome posting.');
assert.equal(commandLogScheduleCalls.length, 2, 'Risk-confirmed terminal commits schedule Command Log summary only after committed outcome posting.');
assert.equal(postCommitScheduleCalls.length, 2, 'Risk-confirmed terminal commits schedule Narrative Thread extraction only after committed outcome posting.');
assert.equal(corePendingInteractions().find((entry) => entry.id === riskInteraction.id).status, 'resolved');
assert.deepEqual(campaignState.runtimeTracking.pendingInteractions, []);
assert.equal(campaignState.runtimeTracking.pendingInteractions.some((entry) => entry.kind === 'terminalOutcomeDecision'), false);
assert.equal(campaignState.runtimeTracking.endConditionLedger.activeDecisionId, null);
assert.equal(terminalDecisionLedgerView(campaignState).activeDecisionId, 'terminal-decision-risk-orchestrator');
assert.deepEqual(
  chat.messages().filter((entry) => entry.isDirectiveOwned).map((entry) => entry.metadata?.responseKind).slice(-3),
  ['riskConfirmationNeeded', 'committedOutcome', 'terminalOutcomeCheckpoint']
);

console.log('Chat terminal outcome tests passed: checkpoint posts after consequence and chat replies resolve terminal decisions');
