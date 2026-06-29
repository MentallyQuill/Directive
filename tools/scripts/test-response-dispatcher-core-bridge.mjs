import assert from 'node:assert/strict';

import {
  createTurnSourceFrameContract,
  hashStableJson
} from '../../src/runtime/architecture-redesign-contracts.mjs';
import { createResponseDispatcher } from '../../src/runtime/response-dispatcher.mjs';
import {
  initializeCampaignRuntimeTracking,
  recordTurnIngress
} from '../../src/runtime/state-delta-gateway.mjs';
import {
  createCoreStoreV2,
  readCoreStoreProjectionsV2
} from '../../src/storage/core-store-v2.mjs';
import { createLogicalStorageAdapter } from '../../src/storage/logical-storage-adapter.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createLoggingStorage() {
  const files = new Map();
  return {
    async readJson(filePath) {
      if (!files.has(filePath)) {
        const error = new Error(`not found: ${filePath}`);
        error.code = 'ENOENT';
        throw error;
      }
      return cloneJson(files.get(filePath));
    },
    async writeJson(filePath, value) {
      files.set(filePath, cloneJson(value));
      return { ok: true, path: filePath };
    },
    async verifyJsonFiles(paths) {
      return Object.fromEntries(paths.map((filePath) => [filePath, files.has(filePath)]));
    }
  };
}

function createCampaignState({ campaignId, saveId, chatId }) {
  return initializeCampaignRuntimeTracking({
    campaign: {
      id: campaignId,
      title: 'Ashes of Peace',
      status: 'active'
    },
    campaignChatBinding: {
      hostId: 'fake',
      chatId,
      campaignId,
      saveId,
      promptContextRevision: 7
    }
  });
}

function addIngress(state, {
  ingressId,
  hostMessageId,
  chatId,
  campaignId,
  sourceFrame,
  coreTransactionId,
  receivedAt = '2026-06-28T17:00:00.000Z'
}) {
  return recordTurnIngress(state, {
    id: ingressId,
    hostMessageId,
    chatId,
    campaignId,
    textHash: sourceFrame.textHash,
    playerSubmittedAt: receivedAt,
    receivedAt,
    stateRevision: state.runtimeTracking?.revision || 0,
    sourceFrameId: sourceFrame.id,
    sourceFrame,
    coreTransactionId,
    status: 'classified',
    classification: {
      classification: 'sceneColor',
      responseStrategy: 'injectAndContinue'
    },
    responseStrategy: 'injectAndContinue'
  });
}

let tick = 0;
const now = () => `2026-06-28T17:00:${String(tick++).padStart(2, '0')}.000Z`;

const campaignId = 'campaign-response-core-bridge';
const saveId = 'save-response-core-bridge';
const chatId = 'ashes-chat';
const storage = createLoggingStorage();
const adapter = createLogicalStorageAdapter({ storage, hostId: 'fake' });
const coreStore = createCoreStoreV2({
  adapter,
  campaignId,
  saveId,
  now
});
const sourceFrame = createTurnSourceFrameContract({
  id: 'frame-response-core-1',
  campaignId,
  saveId,
  chatId,
  hostMessageId: 'player-core-release-1',
  textHash: hashStableJson({ text: 'Sam waited at the rail while the answer found its shape.' }),
  sourceRevision: 0,
  createdAt: '2026-06-28T17:00:00.000Z'
});
const transaction = await coreStore.beginTurn(sourceFrame, {
  transactionId: 'txn-response-core-1',
  ingressId: 'ingress-response-core-1',
  idempotencyKey: 'begin-response-core-1'
});

let state = addIngress(createCampaignState({ campaignId, saveId, chatId }), {
  ingressId: 'ingress-response-core-1',
  hostMessageId: 'player-core-release-1',
  chatId,
  campaignId,
  sourceFrame,
  coreTransactionId: transaction.id
});
let hostReleaseCalls = 0;
const dispatcher = createResponseDispatcher({
  host: {
    chat: {
      postAssistantMessage: async () => {
        throw new Error('HostContinue bridge test must not post Directive text.');
      },
      continueHostGeneration: async (payload = {}) => {
        hostReleaseCalls += 1;
        assert.equal(payload.waitForCompletion, false);
        return {
          ok: true,
          released: true,
          skipped: false,
          waitForCompletion: false,
          reason: payload.reason,
          generationStartedAt: '2026-06-28T17:00:10.000Z',
          hostGenerationReleasedAt: '2026-06-28T17:00:10.000Z'
        };
      }
    }
  },
  coreTurnStore: coreStore,
  getCampaignState: () => state,
  setCampaignState: (next) => { state = initializeCampaignRuntimeTracking(next); },
  persist: async (next) => { state = initializeCampaignRuntimeTracking(next); },
  now
});

const dispatch = await dispatcher.dispatch({
  campaignState: state,
  ingressId: 'ingress-response-core-1',
  strategy: 'injectAndContinue',
  responseKind: 'hostGeneration',
  idempotencyKey: 'response-core-bridge-1'
});
assert.equal(dispatch.ok, true);
assert.equal(dispatch.entry.status, 'released');
assert.equal(dispatch.entry.hostGenerationReleaseMode, 'nonblocking');
assert.equal(hostReleaseCalls, 1);
assert.deepEqual(
  coreStore.state.events.map((entry) => entry.type),
  ['turnObserved', 'phaseAdvanced', 'phaseAdvanced']
);
assert.equal(coreStore.state.transactions[transaction.id].phase, 'hostContinueReleased');
assert.equal(coreStore.state.transactions[transaction.id].route, 'hostContinue');
assert.equal(state.runtimeTracking.responseLedger.at(-1).status, 'released');
assert.equal(state.runtimeTracking.responseLedger.at(-1).coreRelease.phase, 'hostContinueReleased');
assert.equal(state.runtimeTracking.responseLedger.at(-1).turnLatency.architectureWithin60s, true);
assert.equal(state.runtimeTracking.responseLedger.at(-1).generationStartedAt, '2026-06-28T17:00:10.000Z');
assert.equal(state.runtimeTracking.responseLedger.at(-1).turnLatency.hostGenerationReleasedAt, Date.parse('2026-06-28T17:00:10.000Z'));
assert.equal(state.runtimeTracking.responseLedger.at(-1).turnLatency.directiveGenerationStartedAt, null);
assert.equal(state.runtimeTracking.responseLedger.at(-1).turnLatency.providerCompletionLatencyMs, null);
  const persistedProjection = await readCoreStoreProjectionsV2(adapter, { campaignId, saveId });
  assert.equal(persistedProjection.ingressLedger[0].status, 'hostContinueReleased');
  const hostTimingProjection = persistedProjection.turnTiming.find((entry) => entry.transactionId === transaction.id);
  assert.ok(hostTimingProjection, 'CORE persisted projections expose hostContinue timing');
  assert.equal(hostTimingProjection.route, 'hostContinue');
  assert.equal(hostTimingProjection.turnTiming.hostGenerationReleasedAt, Date.parse('2026-06-28T17:00:10.000Z'));
  assert.equal(hostTimingProjection.turnTiming.directiveGenerationStartedAt, null);
  assert.equal(hostTimingProjection.turnTiming.providerCompletionLatencyMs, null);
  assert.equal(hostTimingProjection.turnTiming.architectureWithin60s, true);

const eventCountBeforeDuplicate = coreStore.state.events.length;
const duplicate = await dispatcher.dispatch({
  campaignState: state,
  ingressId: 'ingress-response-core-1',
  strategy: 'injectAndContinue',
  responseKind: 'hostGeneration',
  idempotencyKey: 'response-core-bridge-1'
});
assert.equal(duplicate.duplicate, true);
assert.equal(hostReleaseCalls, 1, 'duplicate dispatch must not release host generation again');
assert.equal(coreStore.state.events.length, eventCountBeforeDuplicate, 'duplicate dispatch must not advance CORE again');

const directiveSourceFrame = createTurnSourceFrameContract({
  id: 'frame-response-core-directive-posted',
  campaignId,
  saveId,
  chatId,
  hostMessageId: 'player-core-directive-posted',
  textHash: hashStableJson({ text: 'Sam gives the order and waits for the bridge to answer.' }),
  sourceRevision: 1,
  createdAt: '2026-06-28T17:00:20.000Z'
});
const directiveTransaction = await coreStore.beginTurn(directiveSourceFrame, {
  transactionId: 'txn-response-core-directive-posted',
  ingressId: 'ingress-response-core-directive-posted',
  idempotencyKey: 'begin-response-core-directive-posted'
});
state = addIngress(state, {
  ingressId: 'ingress-response-core-directive-posted',
  hostMessageId: 'player-core-directive-posted',
  chatId,
  campaignId,
  sourceFrame: directiveSourceFrame,
  coreTransactionId: directiveTransaction.id,
  receivedAt: '2026-06-28T17:00:20.000Z'
});
await coreStore.advanceTurn(directiveTransaction.id, {
  phase: 'routePending',
  route: 'directivePosted',
  reason: 'test-mechanics-before-visible-response',
  idempotencyKey: `route-pending:${directiveTransaction.id}`
});
await coreStore.commitMechanics(directiveTransaction.id, {
  batchId: 'mechanics:outcome-response-core-directive-posted',
  idempotencyKey: `mechanics:${directiveTransaction.id}:outcome-response-core-directive-posted`,
  turnId: 'turn-response-core-directive-posted',
  outcomeId: 'outcome-response-core-directive-posted',
  summary: 'Committed deterministic Directive mechanics.',
  operations: [{
    domain: 'mission',
    op: 'domainCommitted',
    path: 'mission',
    summary: 'Committed mission mechanics.',
    valueHash: hashStableJson({ mission: 'redacted' })
  }],
  committedRoots: ['mission'],
  promptDirtyDomains: [],
  phaseAfter: 'mechanicsPending'
});
assert.equal(coreStore.state.transactions[directiveTransaction.id].phase, 'mechanicsPending');
assert.equal(coreStore.state.transactions[directiveTransaction.id].route, 'directivePosted');
let directivePostCalls = 0;
const directivePostedDispatcher = createResponseDispatcher({
  host: {
    chat: {
      postAssistantMessage: async (payload = {}) => {
        directivePostCalls += 1;
        assert.equal(payload.extra.runtimeMetadata.directiveGenerationStartedAt, '2026-06-28T17:00:30.000Z');
        return {
          ok: true,
          hostMessageId: 'assistant-core-directive-posted'
        };
      }
    }
  },
  coreTurnStore: coreStore,
  getCampaignState: () => state,
  setCampaignState: (next) => { state = initializeCampaignRuntimeTracking(next); },
  persist: async (next) => { state = initializeCampaignRuntimeTracking(next); },
  now
});
const directivePosted = await directivePostedDispatcher.dispatch({
  campaignState: state,
  ingressId: 'ingress-response-core-directive-posted',
  strategy: 'directivePosted',
  responseKind: 'committedOutcome',
  text: 'The bridge answers the order in sequence.',
  turnId: 'turn-response-core-directive-posted',
  outcomeId: 'outcome-response-core-directive-posted',
  metadata: {
    directiveGenerationStartedAt: '2026-06-28T17:00:30.000Z'
  },
  idempotencyKey: 'response-core-directive-posted'
});
assert.equal(directivePosted.ok, true);
assert.equal(directivePostCalls, 1);
const directivePostedResponse = state.runtimeTracking.responseLedger.at(-1);
assert.equal(directivePostedResponse.strategy, 'directivePosted');
assert.equal(directivePostedResponse.directiveGenerationStartedAt, '2026-06-28T17:00:30.000Z');
assert.equal(directivePostedResponse.generationStartedAt, '2026-06-28T17:00:30.000Z');
assert.equal(directivePostedResponse.turnLatency.directiveGenerationStartedAt, Date.parse('2026-06-28T17:00:30.000Z'));
  assert.equal(directivePostedResponse.turnLatency.generationStartLatencyMs, 10000);
  assert.equal(directivePostedResponse.turnLatency.architectureWithin60s, true);
  assert.equal(Number.isFinite(directivePostedResponse.turnLatency.providerCompletionLatencyMs), true);
  assert.equal(coreStore.state.transactions[directiveTransaction.id].visibleResponseRef.generationStartedAt, '2026-06-28T17:00:30.000Z');
  assert.equal(coreStore.state.transactions[directiveTransaction.id].visibleResponseRef.directiveGenerationStartedAt, '2026-06-28T17:00:30.000Z');
  assert.equal(coreStore.state.transactions[directiveTransaction.id].visibleResponseRef.turnLatency.architectureWithin60s, true);
  assert.equal(coreStore.state.turns.filter((entry) => entry.transactionId === directiveTransaction.id).length, 1);
  const directivePostedProjection = await readCoreStoreProjectionsV2(adapter, { campaignId, saveId });
  assert.equal(
    directivePostedProjection.responseLedger.find((entry) => entry.transactionId === directiveTransaction.id).generationStartedAt,
    '2026-06-28T17:00:30.000Z'
  );
  const directiveTimingProjection = directivePostedProjection.turnTiming.find((entry) => entry.transactionId === directiveTransaction.id);
  assert.ok(directiveTimingProjection, 'CORE persisted projections expose Directive-posted timing');
  assert.equal(directiveTimingProjection.route, 'directivePosted');
  assert.equal(directiveTimingProjection.turnTiming.directiveGenerationStartedAt, Date.parse('2026-06-28T17:00:30.000Z'));
  assert.equal(directiveTimingProjection.turnTiming.hostGenerationReleasedAt, null);
  assert.equal(directiveTimingProjection.turnTiming.generationStartLatencyMs, 10000);
  assert.equal(directiveTimingProjection.turnTiming.architectureWithin60s, true);
  const directiveTurnProjection = directivePostedProjection.turnLedger.entries.find((entry) => entry.transactionId === directiveTransaction.id);
  assert.ok(directiveTurnProjection, 'CORE turn projection survives visible response recording after mechanics commit');
  assert.equal(directiveTurnProjection.outcomeId, 'outcome-response-core-directive-posted');

let visibleFailureState = addIngress(createCampaignState({
  campaignId: 'campaign-response-core-visible-failure',
  saveId: 'save-response-core-visible-failure',
  chatId
}), {
  ingressId: 'ingress-response-core-visible-failure',
  hostMessageId: 'player-core-visible-failure',
  chatId,
  campaignId: 'campaign-response-core-visible-failure',
  sourceFrame: {
    ...sourceFrame,
    id: 'frame-response-core-visible-failure',
    campaignId: 'campaign-response-core-visible-failure',
    saveId: 'save-response-core-visible-failure',
    hostMessageId: 'player-core-visible-failure'
  },
  coreTransactionId: 'txn-response-core-visible-failure'
});
let visibleFailurePostCalls = 0;
let visibleFailureRecordCalls = 0;
const visibleFailureDispatcher = createResponseDispatcher({
  host: {
    chat: {
      postAssistantMessage: async () => {
        visibleFailurePostCalls += 1;
        return {
          ok: true,
          hostMessageId: 'assistant-core-visible-failure'
        };
      }
    }
  },
  coreTurnStore: {
    async advanceTurn(transactionId, patch = {}) {
      return { id: transactionId, phase: patch.phase || 'observed' };
    },
    async recordVisibleResponse() {
      visibleFailureRecordCalls += 1;
      const error = new Error('Synthetic CORE visible-response write failed.');
      error.code = 'DIRECTIVE_CORE_VISIBLE_WRITE_FAILED';
      throw error;
    }
  },
  getCampaignState: () => visibleFailureState,
  setCampaignState: (next) => { visibleFailureState = initializeCampaignRuntimeTracking(next); },
  persist: async (next) => { visibleFailureState = initializeCampaignRuntimeTracking(next); },
  now
});
const visibleFailure = await visibleFailureDispatcher.dispatch({
  campaignState: visibleFailureState,
  ingressId: 'ingress-response-core-visible-failure',
  strategy: 'directivePosted',
  responseKind: 'committedOutcome',
  text: 'The bridge answers once; CORE will need repair.',
  turnId: 'turn-response-core-visible-failure',
  outcomeId: 'outcome-response-core-visible-failure',
  idempotencyKey: 'response-core-visible-failure'
});
assert.equal(visibleFailure.ok, false);
assert.equal(visibleFailure.recoveryRequired, true);
assert.equal(visibleFailurePostCalls, 1);
assert.equal(visibleFailureRecordCalls, 1);
assert.equal(visibleFailure.posted.hostMessageId, 'assistant-core-visible-failure');
const visibleFailureResponse = visibleFailureState.runtimeTracking.responseLedger.at(-1);
assert.equal(visibleFailureResponse.status, 'recoveryRequired');
assert.equal(visibleFailureResponse.hostMessageId, 'assistant-core-visible-failure');
assert.equal(visibleFailureResponse.coreReleaseError.code, 'DIRECTIVE_CORE_VISIBLE_WRITE_FAILED');
assert.equal(
  visibleFailureState.runtimeTracking.recoveryJournal.some((entry) => (
    entry.type === 'coreVisibleResponseRecordFailure'
    && entry.details?.recoveryPolicy?.repostVisibleResponse === false
  )),
  true
);
assert.equal(
  visibleFailureState.runtimeTracking.ingressLedger.find((entry) => entry.id === 'ingress-response-core-visible-failure').status,
  'recoveryRequired'
);
const visibleFailureDuplicate = await visibleFailureDispatcher.dispatch({
  campaignState: visibleFailureState,
  ingressId: 'ingress-response-core-visible-failure',
  strategy: 'directivePosted',
  responseKind: 'committedOutcome',
  text: 'The bridge answers once; CORE will need repair.',
  turnId: 'turn-response-core-visible-failure',
  outcomeId: 'outcome-response-core-visible-failure',
  idempotencyKey: 'response-core-visible-failure'
});
assert.equal(visibleFailureDuplicate.duplicate, true);
assert.equal(visibleFailurePostCalls, 1, 'CORE visible-response recovery duplicate must not repost visible text');

let failureState = addIngress(createCampaignState({
  campaignId: 'campaign-response-core-failure',
  saveId: 'save-response-core-failure',
  chatId
}), {
  ingressId: 'ingress-response-core-failure',
  hostMessageId: 'player-core-release-failure',
  chatId,
  campaignId: 'campaign-response-core-failure',
  sourceFrame: {
    ...sourceFrame,
    id: 'frame-response-core-failure',
    campaignId: 'campaign-response-core-failure',
    saveId: 'save-response-core-failure',
    hostMessageId: 'player-core-release-failure'
  },
  coreTransactionId: 'txn-response-core-failure'
});
let failureHostReleaseCalls = 0;
let failureAdvanceCalls = 0;
const failureDispatcher = createResponseDispatcher({
  host: {
    chat: {
      postAssistantMessage: async () => {
        throw new Error('Failure bridge test must not post Directive text.');
      },
      continueHostGeneration: async () => {
        failureHostReleaseCalls += 1;
        return {
          ok: true,
          released: true,
          skipped: false,
          waitForCompletion: false,
          generationStartedAt: '2026-06-28T17:01:10.000Z',
          hostGenerationReleasedAt: '2026-06-28T17:01:10.000Z'
        };
      }
    }
  },
  coreTurnStore: {
    async advanceTurn(transactionId, patch = {}) {
      failureAdvanceCalls += 1;
      if (patch.phase === 'hostContinueReleased') {
        const error = new Error('Synthetic CORE release write failed.');
        error.code = 'DIRECTIVE_CORE_RELEASE_WRITE_FAILED';
        throw error;
      }
      return { id: transactionId, phase: patch.phase || 'observed' };
    }
  },
  getCampaignState: () => failureState,
  setCampaignState: (next) => { failureState = initializeCampaignRuntimeTracking(next); },
  persist: async (next) => { failureState = initializeCampaignRuntimeTracking(next); },
  now
});
const failed = await failureDispatcher.dispatch({
  campaignState: failureState,
  ingressId: 'ingress-response-core-failure',
  strategy: 'injectAndContinue',
  responseKind: 'hostGeneration',
  idempotencyKey: 'response-core-bridge-failure'
});
assert.equal(failed.ok, false);
assert.equal(failed.recoveryRequired, true);
assert.equal(failureHostReleaseCalls, 1);
assert.equal(failureAdvanceCalls, 2);
const failedResponse = failureState.runtimeTracking.responseLedger.at(-1);
assert.equal(failedResponse.status, 'recoveryRequired');
assert.equal(failedResponse.hostGenerationReleasedAt, '2026-06-28T17:01:10.000Z');
assert.equal(failedResponse.coreReleaseError.code, 'DIRECTIVE_CORE_RELEASE_WRITE_FAILED');
assert.equal(
  failureState.runtimeTracking.recoveryJournal.some((entry) => entry.type === 'coreHostContinueReleaseFailure'),
  true
);
assert.equal(
  failureState.runtimeTracking.ingressLedger.find((entry) => entry.id === 'ingress-response-core-failure').status,
  'recoveryRequired'
);
const failureDuplicate = await failureDispatcher.dispatch({
  campaignState: failureState,
  ingressId: 'ingress-response-core-failure',
  strategy: 'injectAndContinue',
  responseKind: 'hostGeneration',
  idempotencyKey: 'response-core-bridge-failure'
});
assert.equal(failureDuplicate.duplicate, true);
assert.equal(failureHostReleaseCalls, 1, 'recovery duplicate must not release host generation again');

console.log('Response dispatcher CORE bridge tests passed.');
