import assert from 'node:assert/strict';

import {
  createTurnSourceFrameContract,
  hashStableJson
} from '../../src/runtime/architecture-redesign-contracts.mjs';
import {
  __responseDispatcherTestHooks,
  createResponseDispatcher
} from '../../src/runtime/response-dispatcher.mjs';
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

const hostNativeReviewMatchSource = {
  responseId: 'response-review-source-match',
  ingressId: 'ingress-review-source-match',
  observedMessage: {
    hostMessageId: 'assistant-review-source-match',
    text: 'Host-native review source text.'
  }
};
const hostNativeReviewMatchHash = hashStableJson({ text: 'Host-native review source text.' });
assert.equal(
  __responseDispatcherTestHooks.providedHostNativeReviewMatchesSource({
    ok: false,
    sreReview: {
      source: {
        responseId: 'response-review-source-match',
        ingressId: 'ingress-review-source-match',
        hostMessageId: 'assistant-review-source-match',
        textHash: hostNativeReviewMatchHash
      }
    }
  }, hostNativeReviewMatchSource, hostNativeReviewMatchHash),
  true,
  'Provided SRE review may be trusted only when source ids and observed text hash match.'
);
assert.equal(
  __responseDispatcherTestHooks.providedHostNativeReviewMatchesSource({
    ok: false,
    sreReview: {
      source: {
        responseId: 'response-review-source-match',
        ingressId: 'ingress-review-source-match',
        hostMessageId: 'assistant-review-source-match'
      }
    }
  }, hostNativeReviewMatchSource, hostNativeReviewMatchHash),
  false,
  'Provided SRE review with matching source ids but missing text hash must not be trusted.'
);
assert.equal(
  __responseDispatcherTestHooks.providedHostNativeReviewMatchesSource({
    ok: false,
    sreReview: {
      source: {
        responseId: 'response-review-source-match',
        ingressId: 'ingress-review-source-match',
        hostMessageId: 'assistant-review-source-match',
        textHash: hashStableJson({ text: 'Different host-native review source text.' })
      }
    }
  }, hostNativeReviewMatchSource, hostNativeReviewMatchHash),
  false,
  'Provided SRE review with matching source ids but stale text hash must not be trusted.'
);
assert.equal(
  __responseDispatcherTestHooks.providedHostNativeReviewMatchesSource({
    ok: true,
    sreReview: {
      source: {
        responseId: 'response-review-source-match',
        ingressId: 'ingress-review-source-match',
        hostMessageId: 'assistant-review-source-match',
        textHash: hostNativeReviewMatchHash
      }
    }
  }, {
    ...hostNativeReviewMatchSource,
    textHash: hostNativeReviewMatchHash,
    observedMessage: {
      ...hostNativeReviewMatchSource.observedMessage,
      textHash: hashStableJson({ text: 'stale host hash should lose to explicit observed hash' })
    }
  }, hostNativeReviewMatchHash),
  true,
  'Explicit observed text hash must beat stale host message textHash when deciding whether a supplied SRE review matches.'
);
assert.equal(
  __responseDispatcherTestHooks.providedHostNativeReviewMatchesSource({
    ok: true,
    sreReview: {
      source: {
        responseId: 'response-review-source-match',
        ingressId: 'ingress-review-source-match',
        hostMessageId: 'assistant-review-source-match',
        textHash: hostNativeReviewMatchHash
      }
    }
  }, {
    ...hostNativeReviewMatchSource,
    textHash: hashStableJson({ text: 'stale source textHash should lose to current observed message text' })
  }),
  true,
  'Current observed message text must beat stale source textHash when deciding whether a supplied SRE review matches.'
);

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
let hostObserved = null;
const dispatcher = createResponseDispatcher({
  host: {
    chat: {
      postAssistantMessage: async () => {
        throw new Error('HostContinue bridge test must not post Directive text.');
      },
      continueHostGeneration: async (payload = {}) => {
        hostReleaseCalls += 1;
        assert.equal(payload.waitForCompletion, false);
        assert.equal(typeof payload.onHostGenerationObserved, 'function');
        hostObserved = payload.onHostGenerationObserved;
        return {
          ok: true,
          released: true,
          skipped: false,
          waitForCompletion: false,
          reason: payload.reason,
          generationStartedAt: '2026-06-28T17:00:10.000Z',
          hostGenerationReleasedAt: '2026-06-28T17:00:10.000Z',
          observationStatus: 'pending',
          observationId: 'observation-response-core-1'
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

assert.equal(typeof hostObserved, 'function');
const observedTextHash = hashStableJson({ text: 'Host-native completion text.' });
const staleObservedCallbackHash = hashStableJson({ text: 'stale host-native callback text hash' });
const eventsBeforeCompletion = coreStore.state.events.length;
const completedHostObservation = await hostObserved({
  kind: 'directive.hostGenerationObservation.v1',
  observationId: 'observation-response-core-1',
  ingressId: 'ingress-response-core-1',
  status: 'completed',
  ok: true,
  released: true,
  waitForCompletion: false,
  generationStartedAt: '2026-06-28T17:00:10.000Z',
  hostGenerationReleasedAt: '2026-06-28T17:00:10.000Z',
  completedAt: '2026-06-28T17:00:20.000Z',
  observedMessage: {
    hostMessageId: 'assistant-host-native-1',
    index: 7,
    chatId,
    text: 'Host-native completion text.',
    textHash: staleObservedCallbackHash,
    textLength: 'Host-native completion text.'.length
  }
});
assert.equal(completedHostObservation.ok, true);
assert.equal(completedHostObservation.status, 'complete');
assert.equal(coreStore.state.events.length, eventsBeforeCompletion + 1);
assert.equal(coreStore.state.events.at(-1).type, 'visibleResponseRecorded');
assert.equal(coreStore.state.transactions[transaction.id].phase, 'visibleResponsePosted');
assert.equal(coreStore.state.transactions[transaction.id].visibleResponseRef.hostMessageId, 'assistant-host-native-1');
assert.equal(coreStore.state.transactions[transaction.id].visibleResponseRef.kind, 'hostContinue');
assert.equal(coreStore.state.transactions[transaction.id].visibleResponseRef.textHash, observedTextHash);
const completedResponse = state.runtimeTracking.responseLedger.find((entry) => entry.id === 'response-core-bridge-1');
assert.equal(completedResponse.status, 'complete');
assert.equal(completedResponse.hostObservation.hostMessageId, 'assistant-host-native-1');
assert.equal(completedResponse.hostObservation.textHash, observedTextHash);
assert.notEqual(completedResponse.hostObservation.textHash, staleObservedCallbackHash);
assert.equal(completedResponse.turnLatency.visibleResponsePostedAt, Date.parse('2026-06-28T17:00:20.000Z'));
assert.equal(JSON.stringify(completedResponse).includes('Host-native completion text.'), false);
const completionProjection = await readCoreStoreProjectionsV2(adapter, { campaignId, saveId });
const completedProjectionResponse = completionProjection.responseLedger.find((entry) => entry.transactionId === transaction.id);
assert.equal(completedProjectionResponse.hostMessageId, 'assistant-host-native-1');
assert.equal(completedProjectionResponse.textHash, observedTextHash);
const eventsBeforeDuplicateCompletion = coreStore.state.events.length;
const duplicateHostObservation = await hostObserved({
  kind: 'directive.hostGenerationObservation.v1',
  observationId: 'observation-response-core-1',
  ingressId: 'ingress-response-core-1',
  status: 'completed',
  ok: true,
  generationStartedAt: '2026-06-28T17:00:10.000Z',
  hostGenerationReleasedAt: '2026-06-28T17:00:10.000Z',
  completedAt: '2026-06-28T17:00:21.000Z',
  observedMessage: {
    hostMessageId: 'assistant-host-native-1',
    index: 7,
    chatId,
    textHash: observedTextHash
  }
});
assert.equal(duplicateHostObservation.status, 'alreadySettled');
assert.equal(coreStore.state.events.length, eventsBeforeDuplicateCompletion);

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

const reobserveCampaignId = 'campaign-response-core-reobserve';
const reobserveSaveId = 'save-response-core-reobserve';
const reobserveChatId = 'ashes-chat-reobserve';
const reobserveStorage = createLoggingStorage();
const reobserveAdapter = createLogicalStorageAdapter({ storage: reobserveStorage, hostId: 'fake' });
const reobserveCoreStore = createCoreStoreV2({
  adapter: reobserveAdapter,
  campaignId: reobserveCampaignId,
  saveId: reobserveSaveId,
  now
});
const reobserveFrame = createTurnSourceFrameContract({
  id: 'frame-response-core-reobserve',
  campaignId: reobserveCampaignId,
  saveId: reobserveSaveId,
  chatId: reobserveChatId,
  hostMessageId: 'player-core-reobserve-1',
  textHash: hashStableJson({ text: 'Sam waited for her reply.' }),
  sourceRevision: 0,
  createdAt: '2026-06-28T17:01:00.000Z'
});
const reobserveTransaction = await reobserveCoreStore.beginTurn(reobserveFrame, {
  transactionId: 'txn-response-core-reobserve-1',
  ingressId: 'ingress-response-core-reobserve-1',
  idempotencyKey: 'begin-response-core-reobserve-1'
});
let reobserveState = addIngress(createCampaignState({
  campaignId: reobserveCampaignId,
  saveId: reobserveSaveId,
  chatId: reobserveChatId
}), {
  ingressId: 'ingress-response-core-reobserve-1',
  hostMessageId: 'player-core-reobserve-1',
  chatId: reobserveChatId,
  campaignId: reobserveCampaignId,
  sourceFrame: reobserveFrame,
  coreTransactionId: reobserveTransaction.id
});
let reobserveRefreshCalls = 0;
let reobserveRecentMessagesStale = true;
const reobserveDispatcher = createResponseDispatcher({
  host: {
    chat: {
      postAssistantMessage: async () => {
        throw new Error('Reobserve test must not post Directive text.');
      },
      continueHostGeneration: async (payload = {}) => ({
        ok: true,
        released: true,
        skipped: false,
        waitForCompletion: false,
        reason: payload.reason,
        generationStartedAt: '2026-06-28T17:01:10.000Z',
        hostGenerationReleasedAt: '2026-06-28T17:01:10.000Z',
        observationStatus: 'pending',
        observationId: 'observation-response-core-reobserve-1'
      }),
      refreshCurrentChat: async (payload = {}) => {
        reobserveRefreshCalls += 1;
        assert.equal(payload.reason, 'directive-reobserve-host-generation-completions');
        reobserveRecentMessagesStale = false;
        return { ok: true, refreshed: true };
      },
      getRecentMessages: async () => {
        const player = {
          hostMessageId: 'player-core-reobserve-1',
          index: 4,
          chatId: reobserveChatId,
          isUser: true,
          text: 'Sam waited for her reply.'
        };
        if (reobserveRecentMessagesStale) return [player];
        return [player, {
          hostMessageId: 'assistant-core-reobserve-1',
          index: 5,
          chatId: reobserveChatId,
          isUser: false,
          isSystem: false,
          isDirectiveOwned: true,
          text: 'The answer arrived through the bridge crew.'
        }];
      }
    }
  },
  coreTurnStore: reobserveCoreStore,
  getCampaignState: () => reobserveState,
  setCampaignState: (next) => { reobserveState = initializeCampaignRuntimeTracking(next); },
  persist: async (next) => { reobserveState = initializeCampaignRuntimeTracking(next); },
  now
});
const reobserveDispatch = await reobserveDispatcher.dispatch({
  campaignState: reobserveState,
  ingressId: 'ingress-response-core-reobserve-1',
  strategy: 'injectAndContinue',
  responseKind: 'hostGeneration',
  idempotencyKey: 'response-core-reobserve-1'
});
assert.equal(reobserveDispatch.ok, true);
assert.equal(reobserveState.runtimeTracking.responseLedger.at(-1).status, 'released');
const reobserveResult = await reobserveDispatcher.reobserveHostGenerationCompletions({
  campaignState: reobserveState
});
assert.equal(reobserveResult.ok, true);
assert.equal(reobserveRefreshCalls, 1);
assert.equal(reobserveResult.refreshResult.ok, true);
assert.equal(reobserveResult.completedCount, 1);
assert.equal(reobserveResult.results[0].status, 'complete');
assert.equal(reobserveCoreStore.state.events.at(-1).type, 'visibleResponseRecorded');
const reobservedResponse = reobserveState.runtimeTracking.responseLedger.find((entry) => entry.id === 'response-core-reobserve-1');
assert.equal(reobservedResponse.status, 'complete');
assert.equal(reobservedResponse.hostObservation.hostMessageId, 'assistant-core-reobserve-1');
assert.equal(JSON.stringify(reobservedResponse).includes('The answer arrived through the bridge crew.'), false);
const reobserveProjection = await readCoreStoreProjectionsV2(reobserveAdapter, {
  campaignId: reobserveCampaignId,
  saveId: reobserveSaveId
});
const reobservedProjectionResponse = reobserveProjection.responseLedger.find((entry) => entry.transactionId === reobserveTransaction.id);
assert.equal(reobservedProjectionResponse.hostMessageId, 'assistant-core-reobserve-1');
assert.equal(reobservedProjectionResponse.responseKind, 'hostContinue');
assert.equal(reobservedProjectionResponse.textHash.length, 64);

const claimedCampaignId = 'campaign-response-core-claimed-reobserve';
const claimedSaveId = 'save-response-core-claimed-reobserve';
const claimedChatId = 'ashes-chat-claimed-reobserve';
const claimedStorage = createLoggingStorage();
const claimedAdapter = createLogicalStorageAdapter({ storage: claimedStorage, hostId: 'fake' });
const claimedCoreStore = createCoreStoreV2({
  adapter: claimedAdapter,
  campaignId: claimedCampaignId,
  saveId: claimedSaveId,
  now
});
const claimedFrame = createTurnSourceFrameContract({
  id: 'frame-response-core-claimed-reobserve',
  campaignId: claimedCampaignId,
  saveId: claimedSaveId,
  chatId: claimedChatId,
  hostMessageId: 'player-core-claimed-reobserve-1',
  textHash: hashStableJson({ text: 'Sam asks again, then waits.' }),
  sourceRevision: 0,
  createdAt: '2026-06-28T17:02:00.000Z'
});
const claimedTransaction = await claimedCoreStore.beginTurn(claimedFrame, {
  transactionId: 'txn-response-core-claimed-reobserve-1',
  ingressId: 'ingress-response-core-claimed-reobserve-1',
  idempotencyKey: 'begin-response-core-claimed-reobserve-1'
});
let claimedState = addIngress(createCampaignState({
  campaignId: claimedCampaignId,
  saveId: claimedSaveId,
  chatId: claimedChatId
}), {
  ingressId: 'ingress-response-core-claimed-reobserve-1',
  hostMessageId: 'player-core-claimed-reobserve-1',
  chatId: claimedChatId,
  campaignId: claimedCampaignId,
  sourceFrame: claimedFrame,
  coreTransactionId: claimedTransaction.id
});
const claimedDispatcher = createResponseDispatcher({
  host: {
    chat: {
      postAssistantMessage: async () => {
        throw new Error('Claimed reobserve test must not post Directive text.');
      },
      continueHostGeneration: async (payload = {}) => ({
        ok: true,
        released: true,
        skipped: false,
        waitForCompletion: false,
        reason: payload.reason,
        generationStartedAt: '2026-06-28T17:02:10.000Z',
        hostGenerationReleasedAt: '2026-06-28T17:02:10.000Z',
        observationStatus: 'pending',
        observationId: 'observation-response-core-claimed-reobserve-1'
      }),
      refreshCurrentChat: async () => ({ ok: true, refreshed: true }),
      getRecentMessages: async () => [{
        hostMessageId: 'player-core-claimed-reobserve-1',
        index: 10,
        chatId: claimedChatId,
        isUser: true,
        text: 'Sam asks again, then waits.'
      }]
    }
  },
  coreTurnStore: claimedCoreStore,
  getCampaignState: () => claimedState,
  setCampaignState: (next) => { claimedState = initializeCampaignRuntimeTracking(next); },
  persist: async (next) => { claimedState = initializeCampaignRuntimeTracking(next); },
  now
});
const claimedDispatch = await claimedDispatcher.dispatch({
  campaignState: claimedState,
  ingressId: 'ingress-response-core-claimed-reobserve-1',
  strategy: 'injectAndContinue',
  responseKind: 'hostGeneration',
  idempotencyKey: 'response-core-claimed-reobserve-1'
});
assert.equal(claimedDispatch.ok, true);
await claimedCoreStore.commitBackgroundBatch(claimedTransaction.id, {
  batchId: 'background-before-host-native-visible',
  idempotencyKey: 'background-before-host-native-visible',
  outcomeId: 'outcome-claimed-reobserve-1',
  operations: [],
  workers: [{
    workerKey: 'diagnostic',
    status: 'noChange',
    sourceRef: { transactionId: claimedTransaction.id }
  }]
});
assert.equal(claimedCoreStore.state.transactions[claimedTransaction.id].phase, 'backgroundSettling');
const claimedHash = hashStableJson({ text: 'The host row was already observed by the release callback.' });
claimedState.runtimeTracking.responseLedger = claimedState.runtimeTracking.responseLedger.map((entry) => (
  entry.id === 'response-core-claimed-reobserve-1'
    ? {
      ...entry,
      hostObservation: {
        hostMessageId: 'assistant-core-claimed-reobserve-1',
        index: 11,
        textHash: claimedHash
      }
    }
    : entry
));
const claimedReobserveResult = await claimedDispatcher.reobserveHostGenerationCompletions({
  campaignState: claimedState
});
assert.equal(claimedReobserveResult.ok, true);
assert.equal(claimedReobserveResult.checkedResponseCount, 0);
assert.equal(claimedReobserveResult.checkedCoreProjectionCount, 1);
assert.equal(claimedReobserveResult.coreProjectionResults[0].status, 'complete');
assert.equal(claimedReobserveResult.coreProjectionResults[0].source, 'runtimeResponseHostObservation');
assert.equal(claimedReobserveResult.coreProjectionResults[0].textHash, claimedHash);
const claimedProjection = await readCoreStoreProjectionsV2(claimedAdapter, {
  campaignId: claimedCampaignId,
  saveId: claimedSaveId
});
const claimedProjectionResponse = claimedProjection.responseLedger.find((entry) => entry.transactionId === claimedTransaction.id);
assert.equal(claimedProjectionResponse.hostMessageId, 'assistant-core-claimed-reobserve-1');
assert.equal(claimedProjectionResponse.textHash, claimedHash);
assert.equal(claimedCoreStore.state.transactions[claimedTransaction.id].phase, 'visibleResponsePosted');

const hashlessCampaignId = 'campaign-response-core-hashless-reobserve';
const hashlessSaveId = 'save-response-core-hashless-reobserve';
const hashlessChatId = 'ashes-chat-hashless-reobserve';
const hashlessStorage = createLoggingStorage();
const hashlessAdapter = createLogicalStorageAdapter({ storage: hashlessStorage, hostId: 'fake' });
const hashlessCoreStore = createCoreStoreV2({
  adapter: hashlessAdapter,
  campaignId: hashlessCampaignId,
  saveId: hashlessSaveId,
  now
});
const hashlessFrame = createTurnSourceFrameContract({
  id: 'frame-response-core-hashless-reobserve',
  campaignId: hashlessCampaignId,
  saveId: hashlessSaveId,
  chatId: hashlessChatId,
  hostMessageId: 'player-core-hashless-reobserve-1',
  textHash: hashStableJson({ text: 'Sam asks for bridge counsel and waits.' }),
  sourceRevision: 0,
  createdAt: '2026-06-28T17:03:00.000Z'
});
const hashlessTransaction = await hashlessCoreStore.beginTurn(hashlessFrame, {
  transactionId: 'txn-response-core-hashless-reobserve-1',
  ingressId: 'ingress-response-core-hashless-reobserve-1',
  idempotencyKey: 'begin-response-core-hashless-reobserve-1'
});
let hashlessState = addIngress(createCampaignState({
  campaignId: hashlessCampaignId,
  saveId: hashlessSaveId,
  chatId: hashlessChatId
}), {
  ingressId: 'ingress-response-core-hashless-reobserve-1',
  hostMessageId: 'player-core-hashless-reobserve-1',
  chatId: hashlessChatId,
  campaignId: hashlessCampaignId,
  sourceFrame: hashlessFrame,
  coreTransactionId: hashlessTransaction.id
});
const hashlessAssistantText = 'The host assistant row exists, but CORE recorded it before the text hash arrived.';
const hashlessAssistantHash = hashStableJson({ text: hashlessAssistantText });
const hashlessDispatcher = createResponseDispatcher({
  host: {
    chat: {
      postAssistantMessage: async () => {
        throw new Error('Hashless reobserve test must not post Directive text.');
      },
      continueHostGeneration: async (payload = {}) => ({
        ok: true,
        released: true,
        skipped: false,
        waitForCompletion: false,
        reason: payload.reason,
        generationStartedAt: '2026-06-28T17:03:10.000Z',
        hostGenerationReleasedAt: '2026-06-28T17:03:10.000Z',
        observationStatus: 'pending',
        observationId: 'observation-response-core-hashless-reobserve-1'
      }),
      refreshCurrentChat: async () => ({ ok: true, refreshed: true }),
      getRecentMessages: async () => [
        {
          hostMessageId: 'player-core-hashless-reobserve-1',
          index: 20,
          chatId: hashlessChatId,
          isUser: true,
          text: 'Sam asks for bridge counsel and waits.'
        },
        {
          hostMessageId: 'assistant-core-hashless-reobserve-1',
          index: 21,
          chatId: hashlessChatId,
          isUser: false,
          isSystem: false,
          text: hashlessAssistantText
        }
      ]
    }
  },
  coreTurnStore: hashlessCoreStore,
  getCampaignState: () => hashlessState,
  setCampaignState: (next) => { hashlessState = initializeCampaignRuntimeTracking(next); },
  persist: async (next) => { hashlessState = initializeCampaignRuntimeTracking(next); },
  now
});
const hashlessDispatch = await hashlessDispatcher.dispatch({
  campaignState: hashlessState,
  ingressId: 'ingress-response-core-hashless-reobserve-1',
  strategy: 'injectAndContinue',
  responseKind: 'hostGeneration',
  idempotencyKey: 'response-core-hashless-reobserve-1'
});
assert.equal(hashlessDispatch.ok, true);
await hashlessCoreStore.recordVisibleResponse(hashlessTransaction.id, {
  kind: 'hostContinue',
  responseId: 'response-core-hashless-reobserve-1',
  hostMessageId: 'assistant-core-hashless-reobserve-1',
  outcomeId: null,
  postedAt: '2026-06-28T17:03:35.000Z',
  hostGenerationReleasedAt: '2026-06-28T17:03:10.000Z',
  generationStartedAt: '2026-06-28T17:03:10.000Z',
  turnLatency: {
    hostGenerationReleasedAt: '2026-06-28T17:03:10.000Z',
    generationStartedAt: '2026-06-28T17:03:10.000Z',
    visibleResponsePostedAt: '2026-06-28T17:03:35.000Z'
  },
  textHash: null,
  idempotencyKey: 'visible-response-core-hashless-reobserve-1'
});
hashlessState.runtimeTracking.responseLedger = hashlessState.runtimeTracking.responseLedger.map((entry) => (
  entry.id === 'response-core-hashless-reobserve-1'
    ? {
      ...entry,
      status: 'complete',
      hostMessageId: 'assistant-core-hashless-reobserve-1',
      hostObservation: {
        hostMessageId: 'assistant-core-hashless-reobserve-1',
        index: 21
      }
    }
    : entry
));
const hashlessBeforeProjection = await readCoreStoreProjectionsV2(hashlessAdapter, {
  campaignId: hashlessCampaignId,
  saveId: hashlessSaveId
});
const hashlessBeforeResponse = hashlessBeforeProjection.responseLedger.find((entry) => entry.transactionId === hashlessTransaction.id);
assert.equal(hashlessBeforeResponse.textHash, null);
const hashlessReobserveResult = await hashlessDispatcher.reobserveHostGenerationCompletions({
  campaignState: hashlessState
});
assert.equal(hashlessReobserveResult.ok, true);
assert.equal(hashlessReobserveResult.checkedResponseCount, 0);
assert.equal(hashlessReobserveResult.checkedCoreProjectionCount, 1);
assert.equal(hashlessReobserveResult.coreProjectionResults[0].status, 'complete');
assert.equal(hashlessReobserveResult.coreProjectionResults[0].source, 'coreProjectionHashRepair');
assert.equal(hashlessReobserveResult.coreProjectionResults[0].textHash, hashlessAssistantHash);
assert.equal(hashlessCoreStore.state.events.at(-1).type, 'visibleResponseRefRepaired');
const hashlessAfterProjection = await readCoreStoreProjectionsV2(hashlessAdapter, {
  campaignId: hashlessCampaignId,
  saveId: hashlessSaveId
});
const hashlessAfterResponse = hashlessAfterProjection.responseLedger.find((entry) => entry.transactionId === hashlessTransaction.id);
assert.equal(hashlessAfterResponse.hostMessageId, 'assistant-core-hashless-reobserve-1');
assert.equal(hashlessAfterResponse.textHash, hashlessAssistantHash);

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
assert.equal(visibleFailureDuplicate.ok, false, 'CORE visible-response recovery duplicate must not report success from old responseLedger alone');
assert.equal(visibleFailureDuplicate.duplicate, true);
assert.equal(visibleFailureDuplicate.recoveryRequired, true);
assert.equal(visibleFailureDuplicate.recoveryId, 'recovery:core-visible-response:response-core-visible-failure');
assert.equal(visibleFailureDuplicate.coreReleaseError.code, 'DIRECTIVE_CORE_VISIBLE_WRITE_FAILED');
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
assert.equal(failureDuplicate.ok, false, 'CORE host-release recovery duplicate must not report success from old responseLedger alone');
assert.equal(failureDuplicate.duplicate, true);
assert.equal(failureDuplicate.recoveryRequired, true);
assert.equal(failureDuplicate.recoveryId, 'recovery:core-host-continue:response-core-bridge-failure');
assert.equal(failureDuplicate.coreReleaseError.code, 'DIRECTIVE_CORE_RELEASE_WRITE_FAILED');
assert.equal(failureHostReleaseCalls, 1, 'recovery duplicate must not release host generation again');

const unavailableFrame = createTurnSourceFrameContract({
  id: 'frame-response-core-host-native-unavailable',
  campaignId,
  saveId,
  chatId,
  hostMessageId: 'player-core-host-native-unavailable',
  textHash: hashStableJson({ text: 'Sam asks for a quiet status update and waits.' }),
  sourceRevision: 3,
  createdAt: '2026-06-28T17:02:00.000Z'
});
const unavailableTransaction = await coreStore.beginTurn(unavailableFrame, {
  transactionId: 'txn-response-core-host-native-unavailable',
  ingressId: 'ingress-response-core-host-native-unavailable',
  idempotencyKey: 'begin-response-core-host-native-unavailable'
});
state = addIngress(state, {
  ingressId: 'ingress-response-core-host-native-unavailable',
  hostMessageId: 'player-core-host-native-unavailable',
  chatId,
  campaignId,
  sourceFrame: unavailableFrame,
  coreTransactionId: unavailableTransaction.id,
  receivedAt: '2026-06-28T17:02:00.000Z'
});
let unavailableObserved = null;
const unavailableDispatcher = createResponseDispatcher({
  host: {
    chat: {
      postAssistantMessage: async () => {
        throw new Error('Unavailable host-native bridge test must not post Directive text.');
      },
      continueHostGeneration: async (payload = {}) => {
        unavailableObserved = payload.onHostGenerationObserved;
        return {
          ok: true,
          released: true,
          skipped: false,
          waitForCompletion: false,
          generationStartedAt: '2026-06-28T17:02:10.000Z',
          hostGenerationReleasedAt: '2026-06-28T17:02:10.000Z',
          observationStatus: 'pending',
          observationId: 'observation-response-core-host-native-unavailable'
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
const unavailableDispatch = await unavailableDispatcher.dispatch({
  campaignState: state,
  ingressId: 'ingress-response-core-host-native-unavailable',
  strategy: 'injectAndContinue',
  responseKind: 'hostGeneration',
  idempotencyKey: 'response-core-host-native-unavailable'
});
assert.equal(unavailableDispatch.ok, true);
assert.equal(typeof unavailableObserved, 'function');
const unavailableObservation = await unavailableObserved({
  kind: 'directive.hostGenerationObservation.v1',
  observationId: 'observation-response-core-host-native-unavailable',
  ingressId: 'ingress-response-core-host-native-unavailable',
  status: 'unavailable',
  ok: true,
  released: true,
  waitForCompletion: false,
  generationStartedAt: '2026-06-28T17:02:10.000Z',
  hostGenerationReleasedAt: '2026-06-28T17:02:10.000Z',
  completedAt: '2026-06-28T17:02:20.000Z',
  reason: 'assistant-row-unavailable'
});
assert.equal(unavailableObservation.ok, false);
assert.equal(unavailableObservation.status, 'unavailable');
assert.equal(coreStore.state.transactions[unavailableTransaction.id].phase, 'recoveryRequired');
const unavailableResponse = state.runtimeTracking.responseLedger.find((entry) => entry.id === 'response-core-host-native-unavailable');
assert.equal(unavailableResponse.status, 'unavailable');
assert.equal(unavailableResponse.hostObservationStatus, 'unavailable');
assert.equal(unavailableResponse.coreRecovery.phase, 'recoveryRequired');
const unavailableRecovery = state.runtimeTracking.recoveryJournal.find((entry) => entry.id === 'recovery:host-native:response-core-host-native-unavailable');
assert.equal(unavailableRecovery.type, 'hostNativeAssistantUnavailable');
assert.equal(unavailableRecovery.details.repairDecision.kind, 'directive.repairResponseRecoveryDecision.v1');
assert.equal(unavailableRecovery.details.repairDecision.eventType, 'hostNativeAssistantUnavailable');
assert.equal(unavailableRecovery.details.repairDecision.responseStatus, 'unavailable');
assert.equal(unavailableRecovery.details.recoveryPolicy.reobserveHostAssistantRows, true);
assert.equal(unavailableRecovery.details.recoveryPolicy.retryHostGeneration, false);
assert.deepEqual(unavailableRecovery.details.recoveryPolicy.allowedActions, ['reobserveHostAssistantRows', 'reviewHostNativeAvailability']);
const unavailableCoreRecoveryEvent = coreStore.state.events.find((entry) => (
  entry.type === 'recoveryRequired'
  && entry.txnId === unavailableTransaction.id
));
assert.equal(unavailableCoreRecoveryEvent.payload.repairDecision.kind, 'directive.repairResponseRecoveryDecision.v1');
assert.equal(unavailableCoreRecoveryEvent.payload.repairDecision.eventType, 'hostNativeAssistantUnavailable');
assert.deepEqual(unavailableCoreRecoveryEvent.payload.allowedActions, ['reobserveHostAssistantRows', 'reviewHostNativeAvailability']);

const contradictionFrame = createTurnSourceFrameContract({
  id: 'frame-response-core-host-native-contradiction',
  campaignId,
  saveId,
  chatId,
  hostMessageId: 'player-core-host-native-contradiction',
  textHash: hashStableJson({ text: 'Sam asks the host to continue into a continuity contradiction.' }),
  sourceRevision: 4,
  createdAt: '2026-06-28T17:02:20.000Z'
});
const contradictionTransaction = await coreStore.beginTurn(contradictionFrame, {
  transactionId: 'txn-response-core-host-native-contradiction',
  ingressId: 'ingress-response-core-host-native-contradiction',
  idempotencyKey: 'begin-response-core-host-native-contradiction'
});
state = addIngress({
  ...state,
  continuity: {
    acceptedFacts: [{
      id: 'crew.hadrik-bronn.species',
      subject: 'crew.hadrik-bronn',
      predicate: 'species',
      value: 'Tellarite',
      summary: 'Hadrik Bronn is Tellarite.',
      criticality: 'hard',
      visibility: 'narratorSafe'
    }]
  }
}, {
  ingressId: 'ingress-response-core-host-native-contradiction',
  hostMessageId: 'player-core-host-native-contradiction',
  chatId,
  campaignId,
  sourceFrame: contradictionFrame,
  coreTransactionId: contradictionTransaction.id,
  receivedAt: '2026-06-28T17:02:20.000Z'
});
const contradictionDispatcher = createResponseDispatcher({
  host: {
    chat: {
      postAssistantMessage: async () => {
        throw new Error('Contradiction bridge test must not post Directive text.');
      },
      continueHostGeneration: async () => ({
        ok: true,
        released: true,
        skipped: false,
        waitForCompletion: false,
        generationStartedAt: '2026-06-28T17:02:25.000Z',
        hostGenerationReleasedAt: '2026-06-28T17:02:25.000Z',
        observationStatus: 'completed',
        observationId: 'observation-response-core-host-native-contradiction',
        observedMessage: {
          hostMessageId: 'assistant-host-native-contradiction',
          index: 10,
          chatId,
          text: 'Hadrik Bronn smiled with a very human ease as the bridge settled.'
        }
      })
    }
  },
  coreTurnStore: coreStore,
  getCampaignState: () => state,
  setCampaignState: (next) => { state = initializeCampaignRuntimeTracking(next); },
  persist: async (next) => { state = initializeCampaignRuntimeTracking(next); },
  now
});
const contradictionDispatch = await contradictionDispatcher.dispatch({
  campaignState: state,
  ingressId: 'ingress-response-core-host-native-contradiction',
  strategy: 'injectAndContinue',
  responseKind: 'hostGeneration',
  idempotencyKey: 'response-core-host-native-contradiction',
  packageData: {
    crew: {
      senior: [{ id: 'hadrik-bronn', name: 'Hadrik Bronn', shortName: 'Bronn' }]
    }
  }
});
assert.equal(contradictionDispatch.ok, false);
assert.equal(contradictionDispatch.recoveryRequired, true);
assert.equal(coreStore.state.transactions[contradictionTransaction.id].phase, 'recoveryRequired');
const contradictionResponse = state.runtimeTracking.responseLedger.find((entry) => entry.id === 'response-core-host-native-contradiction');
assert.equal(contradictionResponse.status, 'recoveryRequired');
assert.equal(contradictionResponse.coreRecovery.phase, 'recoveryRequired');
assert.equal(contradictionResponse.continuityReview.kind, 'directive.continuityContradictionReview.v1');
assert.equal(contradictionResponse.continuityReview.sreReview.kind, 'directive.sreHostNativeContinuityReview.v1');
assert.equal(contradictionResponse.continuityReview.sreReview.source.hostMessageId, 'assistant-host-native-contradiction');
assert.equal(contradictionResponse.hostContinuation.observedMessage.textHash.length, 64);
assert.equal(JSON.stringify(contradictionResponse.hostContinuation).includes('very human ease'), false);
const contradictionRecovery = state.runtimeTracking.recoveryJournal.find((entry) => entry.id === 'recovery:continuity:response-core-host-native-contradiction');
assert.equal(contradictionRecovery.type, 'hostNativeContinuityContradiction');
assert.equal(contradictionRecovery.details.repairDecision.kind, 'directive.repairResponseRecoveryDecision.v1');
assert.equal(contradictionRecovery.details.repairDecision.eventType, 'hostNativeContinuityContradiction');
assert.equal(contradictionRecovery.details.repairDecision.sreReviewRequired, true);
assert.deepEqual(
  contradictionRecovery.details.recoveryPolicy.allowedActions,
  ['reviewHostNativeContinuityContradiction', 'fallbackDirectiveResponse', 'branchFromPriorRevision']
);
const contradictionCoreRecoveryEvent = coreStore.state.events.find((entry) => (
  entry.type === 'recoveryRequired'
  && entry.txnId === contradictionTransaction.id
));
assert.equal(contradictionCoreRecoveryEvent.payload.repairDecision.eventType, 'hostNativeContinuityContradiction');
assert.equal(contradictionCoreRecoveryEvent.payload.repairDecision.sreReviewRequired, true);
assert.deepEqual(
  contradictionCoreRecoveryEvent.payload.allowedActions,
  ['reviewHostNativeContinuityContradiction', 'fallbackDirectiveResponse', 'branchFromPriorRevision']
);
assert.equal(JSON.stringify(coreStore.state).includes('very human ease'), false);

const staleObservedHashFrame = createTurnSourceFrameContract({
  id: 'frame-response-core-host-native-stale-observed-hash',
  campaignId,
  saveId,
  chatId,
  hostMessageId: 'player-core-host-native-stale-observed-hash',
  textHash: hashStableJson({ text: 'Sam asks the host to continue with stale hash metadata.' }),
  sourceRevision: 4,
  createdAt: '2026-06-28T17:02:25.000Z'
});
const staleObservedHashTransaction = await coreStore.beginTurn(staleObservedHashFrame, {
  transactionId: 'txn-response-core-host-native-stale-observed-hash',
  ingressId: 'ingress-response-core-host-native-stale-observed-hash',
  idempotencyKey: 'begin-response-core-host-native-stale-observed-hash'
});
state = addIngress(state, {
  ingressId: 'ingress-response-core-host-native-stale-observed-hash',
  hostMessageId: 'player-core-host-native-stale-observed-hash',
  chatId,
  campaignId,
  sourceFrame: staleObservedHashFrame,
  coreTransactionId: staleObservedHashTransaction.id,
  receivedAt: '2026-06-28T17:02:25.000Z'
});
const staleObservedHashText = 'Hadrik Bronn answered with a stale host hash in metadata.';
const staleObservedHashActual = hashStableJson({ text: staleObservedHashText });
const staleObservedHashMetadata = hashStableJson({ text: 'stale host-native metadata hash' });
const staleObservedHashSreCalls = [];
const staleObservedHashDispatcher = createResponseDispatcher({
  host: {
    chat: {
      postAssistantMessage: async () => {
        throw new Error('Stale observed hash bridge test must not post Directive text.');
      },
      continueHostGeneration: async () => ({
        ok: true,
        released: true,
        skipped: false,
        waitForCompletion: false,
        generationStartedAt: '2026-06-28T17:02:26.000Z',
        hostGenerationReleasedAt: '2026-06-28T17:02:26.000Z',
        observationStatus: 'completed',
        observedMessage: {
          hostMessageId: 'assistant-host-native-stale-observed-hash',
          index: 10,
          chatId,
          text: staleObservedHashText,
          textHash: staleObservedHashMetadata
        }
      })
    }
  },
  sourceReconciliationEngine: {
    async reviewHostNativeContinuity(payload = {}) {
      staleObservedHashSreCalls.push(cloneJson(payload));
      return {
        kind: 'directive.sreHostNativeContinuityReview.v1',
        ok: false,
        findings: [{
          kind: 'protected-fact-contradiction',
          factId: 'crew.hadrik-bronn.species',
          severity: 'blocker',
          summary: 'Synthetic contradiction with stale host textHash metadata.'
        }],
        checkedFactCount: 1,
        reviewer: 'test-sre',
        sreReview: {
          kind: 'directive.sreHostNativeContinuityReview.v1',
          mode: 'hostNativeCompletion',
          reviewer: 'test-sre',
          status: 'rejected',
          reviewedAt: '2026-06-28T17:02:26.000Z',
          source: {
            responseId: 'response-core-host-native-stale-observed-hash',
            ingressId: 'ingress-response-core-host-native-stale-observed-hash',
            hostMessageId: 'assistant-host-native-stale-observed-hash',
            textHash: staleObservedHashActual
          }
        }
      };
    }
  },
  coreTurnStore: coreStore,
  getCampaignState: () => state,
  setCampaignState: (next) => { state = initializeCampaignRuntimeTracking(next); },
  persist: async (next) => { state = initializeCampaignRuntimeTracking(next); },
  now
});
const staleObservedHashDispatch = await staleObservedHashDispatcher.dispatch({
  campaignState: state,
  ingressId: 'ingress-response-core-host-native-stale-observed-hash',
  strategy: 'injectAndContinue',
  responseKind: 'hostGeneration',
  idempotencyKey: 'response-core-host-native-stale-observed-hash'
});
assert.equal(staleObservedHashDispatch.ok, false);
assert.equal(staleObservedHashSreCalls.length, 1, 'Stale host textHash metadata must not force a duplicate SRE review after the first review used actual observed text.');
const staleObservedHashResponse = state.runtimeTracking.responseLedger.find((entry) => entry.id === 'response-core-host-native-stale-observed-hash');
assert.equal(staleObservedHashResponse.hostObservation.textHash, staleObservedHashActual);
assert.equal(staleObservedHashResponse.hostContinuation.observedMessage.textHash, staleObservedHashActual);
assert.notEqual(staleObservedHashResponse.hostContinuation.observedMessage.textHash, staleObservedHashMetadata);

const sreOwnedFrame = createTurnSourceFrameContract({
  id: 'frame-response-core-host-native-sre-owned',
  campaignId,
  saveId,
  chatId,
  hostMessageId: 'player-core-host-native-sre-owned',
  textHash: hashStableJson({ text: 'Sam asks the host to continue through SRE-owned review.' }),
  sourceRevision: 4,
  createdAt: '2026-06-28T17:02:30.000Z'
});
const sreOwnedTransaction = await coreStore.beginTurn(sreOwnedFrame, {
  transactionId: 'txn-response-core-host-native-sre-owned',
  ingressId: 'ingress-response-core-host-native-sre-owned',
  idempotencyKey: 'begin-response-core-host-native-sre-owned'
});
state = addIngress({
  ...state,
  continuity: {
    acceptedFacts: [{
      id: 'crew.hadrik-bronn.species',
      subject: 'crew.hadrik-bronn',
      predicate: 'species',
      value: 'Tellarite',
      summary: 'Hadrik Bronn is Tellarite.',
      criticality: 'hard',
      visibility: 'narratorSafe'
    }]
  }
}, {
  ingressId: 'ingress-response-core-host-native-sre-owned',
  hostMessageId: 'player-core-host-native-sre-owned',
  chatId,
  campaignId,
  sourceFrame: sreOwnedFrame,
  coreTransactionId: sreOwnedTransaction.id,
  receivedAt: '2026-06-28T17:02:30.000Z'
});
const sreReviewCalls = [];
const invalidSreReviewedAt = '2026-02-30T00:00:00.000Z';
const sreOwnedDispatcher = createResponseDispatcher({
  host: {
    chat: {
      postAssistantMessage: async () => {
        throw new Error('SRE-owned host-native review test must not post Directive text.');
      },
      continueHostGeneration: async () => ({
        ok: true,
        released: true,
        skipped: false,
        waitForCompletion: false,
        generationStartedAt: '2026-06-28T17:02:31.000Z',
        hostGenerationReleasedAt: '2026-06-28T17:02:31.000Z',
        observationStatus: 'completed',
        observedMessage: {
          hostMessageId: 'assistant-host-native-sre-owned',
          index: 11,
          chatId,
          text: 'Hadrik Bronn smiled with a very human ease as the bridge settled.'
        }
      })
    }
  },
  sourceReconciliationEngine: {
    reviewHostNativeContinuity: async (payload = {}) => {
      sreReviewCalls.push(cloneJson(payload));
      return {
        kind: 'directive.sreHostNativeContinuityReview.v1',
        mode: 'hostNativeCompletion',
        ok: true,
        findings: [],
        reviewer: 'test-sre',
        sreReview: {
          kind: 'directive.sreHostNativeContinuityReview.v1',
          mode: 'hostNativeCompletion',
          reviewer: 'test-sre',
          reviewedAt: invalidSreReviewedAt,
          source: {
            responseId: 'malicious-sre-response-id',
            ingressId: 'malicious-sre-ingress-id',
            hostMessageId: 'assistant-host-native-sre-owned'
          }
        }
      };
    }
  },
  coreTurnStore: coreStore,
  getCampaignState: () => state,
  setCampaignState: (next) => { state = initializeCampaignRuntimeTracking(next); },
  persist: async (next) => { state = initializeCampaignRuntimeTracking(next); },
  now
});
const sreOwnedDispatch = await sreOwnedDispatcher.dispatch({
  campaignState: state,
  ingressId: 'ingress-response-core-host-native-sre-owned',
  strategy: 'injectAndContinue',
  responseKind: 'hostGeneration',
  idempotencyKey: 'response-core-host-native-sre-owned',
  packageData: {
    crew: {
      senior: [{ id: 'hadrik-bronn', name: 'Hadrik Bronn', shortName: 'Bronn' }]
    }
  }
});
assert.equal(sreReviewCalls.length, 1, 'Response dispatcher must delegate host-native continuity review to SRE.');
assert.equal(sreReviewCalls[0].mode, 'hostNativeCompletion');
assert.equal(sreReviewCalls[0].responseId, 'response-core-host-native-sre-owned');
assert.equal(sreOwnedDispatch.ok, true, 'SRE ok verdict should prevent dispatcher-local continuity rejection.');
assert.equal(sreOwnedDispatch.recoveryRequired, undefined);
const sreOwnedResponse = state.runtimeTracking.responseLedger.find((entry) => entry.id === 'response-core-host-native-sre-owned');
assert.equal(sreOwnedResponse.status, 'released');
assert.equal(sreOwnedResponse.continuityReview.reviewer, 'test-sre');
assert.equal(sreOwnedResponse.continuityReview.sreReview.source.responseId, 'response-core-host-native-sre-owned');
assert.equal(sreOwnedResponse.continuityReview.sreReview.source.ingressId, 'ingress-response-core-host-native-sre-owned');
assert.equal(sreOwnedResponse.continuityReview.sreReview.source.hostMessageId, 'assistant-host-native-sre-owned');
assert.equal(sreOwnedResponse.continuityReview.sreReview.reviewedAt, null);
assert.equal(JSON.stringify(sreOwnedResponse).includes(invalidSreReviewedAt), false);
assert.equal(
  state.runtimeTracking.recoveryJournal.some((entry) => entry.id === 'recovery:continuity:response-core-host-native-sre-owned'),
  false,
  'SRE ok verdict must not create dispatcher-local contradiction recovery.'
);

const sreFailureFrame = createTurnSourceFrameContract({
  id: 'frame-response-core-host-native-sre-failure',
  campaignId,
  saveId,
  chatId,
  hostMessageId: 'player-core-host-native-sre-failure',
  textHash: hashStableJson({ text: 'Sam asks the host to continue through a failed SRE review.' }),
  sourceRevision: 4,
  createdAt: '2026-06-28T17:02:35.000Z'
});
const sreFailureTransaction = await coreStore.beginTurn(sreFailureFrame, {
  transactionId: 'txn-response-core-host-native-sre-failure',
  ingressId: 'ingress-response-core-host-native-sre-failure',
  idempotencyKey: 'begin-response-core-host-native-sre-failure'
});
state = addIngress(state, {
  ingressId: 'ingress-response-core-host-native-sre-failure',
  hostMessageId: 'player-core-host-native-sre-failure',
  chatId,
  campaignId,
  sourceFrame: sreFailureFrame,
  coreTransactionId: sreFailureTransaction.id,
  receivedAt: '2026-06-28T17:02:35.000Z'
});
const rawSreFailureCanary = 'RAW_SRE_REVIEW_FAILURE_TEXT_MUST_NOT_PERSIST';
const rawSreFailureCodeCanary = 'RAW_SRE_ERROR_CODE_MUST_NOT_PERSIST';
const sreFailureDispatcher = createResponseDispatcher({
  host: {
    chat: {
      postAssistantMessage: async () => {
        throw new Error('SRE failure host-native review test must not post Directive text.');
      },
      continueHostGeneration: async () => ({
        ok: true,
        released: true,
        skipped: false,
        waitForCompletion: false,
        generationStartedAt: '2026-06-28T17:02:36.000Z',
        hostGenerationReleasedAt: '2026-06-28T17:02:36.000Z',
        observationStatus: 'completed',
        observedMessage: {
          hostMessageId: 'assistant-host-native-sre-failure',
          index: 12,
          chatId,
          text: 'The host-native answer cannot be source-reviewed in this test.'
        }
      })
    }
  },
  sourceReconciliationEngine: {
    reviewHostNativeContinuity: async () => {
      const error = new Error(rawSreFailureCanary);
      error.code = rawSreFailureCodeCanary;
      throw error;
    }
  },
  coreTurnStore: coreStore,
  getCampaignState: () => state,
  setCampaignState: (next) => { state = initializeCampaignRuntimeTracking(next); },
  persist: async (next) => { state = initializeCampaignRuntimeTracking(next); },
  now
});
const sreFailureDispatch = await sreFailureDispatcher.dispatch({
  campaignState: state,
  ingressId: 'ingress-response-core-host-native-sre-failure',
  strategy: 'injectAndContinue',
  responseKind: 'hostGeneration',
  idempotencyKey: 'response-core-host-native-sre-failure'
});
assert.equal(sreFailureDispatch.ok, false, 'SRE review failure must fail closed into recovery.');
assert.equal(sreFailureDispatch.recoveryRequired, true);
const sreFailureResponse = state.runtimeTracking.responseLedger.find((entry) => entry.id === 'response-core-host-native-sre-failure');
assert.equal(sreFailureResponse.status, 'recoveryRequired');
assert.equal(sreFailureResponse.continuityReview.error.code, 'DIRECTIVE_SRE_HOST_NATIVE_REVIEW_FAILED');
assert.equal(JSON.stringify(sreFailureResponse).includes(rawSreFailureCanary), false);
assert.equal(JSON.stringify(sreFailureResponse).includes(rawSreFailureCodeCanary), false);
assert.equal(JSON.stringify(state.runtimeTracking.recoveryJournal).includes(rawSreFailureCanary), false);
assert.equal(JSON.stringify(state.runtimeTracking.recoveryJournal).includes(rawSreFailureCodeCanary), false);

const asyncContradictionFrame = createTurnSourceFrameContract({
  id: 'frame-response-core-host-native-async-contradiction',
  campaignId,
  saveId,
  chatId,
  hostMessageId: 'player-core-host-native-async-contradiction',
  textHash: hashStableJson({ text: 'Sam waits while the host-native answer arrives later.' }),
  sourceRevision: 4,
  createdAt: '2026-06-28T17:02:40.000Z'
});
const asyncContradictionTransaction = await coreStore.beginTurn(asyncContradictionFrame, {
  transactionId: 'txn-response-core-host-native-async-contradiction',
  ingressId: 'ingress-response-core-host-native-async-contradiction',
  idempotencyKey: 'begin-response-core-host-native-async-contradiction'
});
state = addIngress({
  ...state,
  continuity: {
    acceptedFacts: [{
      id: 'crew.hadrik-bronn.species',
      subject: 'crew.hadrik-bronn',
      predicate: 'species',
      value: 'Tellarite',
      summary: 'Hadrik Bronn is Tellarite.',
      criticality: 'hard',
      visibility: 'narratorSafe'
    }]
  }
}, {
  ingressId: 'ingress-response-core-host-native-async-contradiction',
  hostMessageId: 'player-core-host-native-async-contradiction',
  chatId,
  campaignId,
  sourceFrame: asyncContradictionFrame,
  coreTransactionId: asyncContradictionTransaction.id,
  receivedAt: '2026-06-28T17:02:40.000Z'
});
let asyncContradictionObserved = null;
const asyncContradictionDispatcher = createResponseDispatcher({
  host: {
    chat: {
      postAssistantMessage: async () => {
        throw new Error('Async contradiction bridge test must not post Directive text.');
      },
      continueHostGeneration: async (payload = {}) => {
        asyncContradictionObserved = payload.onHostGenerationObserved;
        return {
          ok: true,
          released: true,
          skipped: false,
          waitForCompletion: false,
          generationStartedAt: '2026-06-28T17:02:45.000Z',
          hostGenerationReleasedAt: '2026-06-28T17:02:45.000Z',
          observationStatus: 'pending',
          observationId: 'observation-response-core-host-native-async-contradiction'
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
const asyncContradictionDispatch = await asyncContradictionDispatcher.dispatch({
  campaignState: state,
  ingressId: 'ingress-response-core-host-native-async-contradiction',
  strategy: 'injectAndContinue',
  responseKind: 'hostGeneration',
  idempotencyKey: 'response-core-host-native-async-contradiction',
  packageData: {
    crew: {
      senior: [{ id: 'hadrik-bronn', name: 'Hadrik Bronn', shortName: 'Bronn' }]
    }
  }
});
assert.equal(asyncContradictionDispatch.ok, true);
assert.equal(typeof asyncContradictionObserved, 'function');
assert.equal(coreStore.state.transactions[asyncContradictionTransaction.id].phase, 'hostContinueReleased');
const asyncContradictionObservation = await asyncContradictionObserved({
  kind: 'directive.hostGenerationObservation.v1',
  observationId: 'observation-response-core-host-native-async-contradiction-complete',
  ingressId: 'ingress-response-core-host-native-async-contradiction',
  status: 'completed',
  ok: true,
  released: true,
  waitForCompletion: false,
  generationStartedAt: '2026-06-28T17:02:45.000Z',
  hostGenerationReleasedAt: '2026-06-28T17:02:45.000Z',
  completedAt: '2026-06-28T17:02:55.000Z',
  observedMessage: {
    hostMessageId: 'assistant-host-native-async-contradiction',
    index: 12,
    chatId,
    text: 'Hadrik Bronn answered with a very human smile before the bridge quieted.'
  }
});
assert.equal(asyncContradictionObservation.ok, false);
assert.equal(asyncContradictionObservation.status, 'recoveryRequired');
assert.equal(coreStore.state.transactions[asyncContradictionTransaction.id].phase, 'recoveryRequired');
assert.equal(coreStore.state.transactions[asyncContradictionTransaction.id].visibleResponseRef.hostMessageId, 'assistant-host-native-async-contradiction');
assert.equal(coreStore.state.transactions[asyncContradictionTransaction.id].visibleResponseRef.textHash, hashStableJson({ text: 'Hadrik Bronn answered with a very human smile before the bridge quieted.' }));
const asyncContradictionResponse = state.runtimeTracking.responseLedger.find((entry) => entry.id === 'response-core-host-native-async-contradiction');
assert.equal(asyncContradictionResponse.status, 'recoveryRequired');
assert.equal(asyncContradictionResponse.hostObservation.hostMessageId, 'assistant-host-native-async-contradiction');
assert.equal(asyncContradictionResponse.hostObservation.textHash, hashStableJson({ text: 'Hadrik Bronn answered with a very human smile before the bridge quieted.' }));
assert.equal(asyncContradictionResponse.coreCompletion.phase, 'visibleResponsePosted');
assert.equal(asyncContradictionResponse.coreRecovery.phase, 'recoveryRequired');
const asyncContradictionRecovery = state.runtimeTracking.recoveryJournal.find((entry) => entry.id === 'recovery:continuity:response-core-host-native-async-contradiction');
assert.equal(asyncContradictionRecovery.type, 'hostNativeContinuityContradiction');
assert.equal(asyncContradictionRecovery.details.repairDecision.eventType, 'hostNativeContinuityContradiction');
assert.equal(asyncContradictionRecovery.details.repairDecision.sreReviewRequired, true);
assert.equal(JSON.stringify(coreStore.state).includes('very human smile'), false);
assert.equal(JSON.stringify(asyncContradictionResponse).includes('very human smile'), false);

const reobserveContradictionFrame = createTurnSourceFrameContract({
  id: 'frame-response-core-host-native-reobserve-contradiction',
  campaignId,
  saveId,
  chatId,
  hostMessageId: 'player-core-host-native-reobserve-contradiction',
  textHash: hashStableJson({ text: 'Sam waits for a reobserved host-native answer.' }),
  sourceRevision: 4,
  createdAt: '2026-06-28T17:03:00.000Z'
});
const reobserveContradictionTransaction = await coreStore.beginTurn(reobserveContradictionFrame, {
  transactionId: 'txn-response-core-host-native-reobserve-contradiction',
  ingressId: 'ingress-response-core-host-native-reobserve-contradiction',
  idempotencyKey: 'begin-response-core-host-native-reobserve-contradiction'
});
state = addIngress({
  ...state,
  continuity: {
    acceptedFacts: [{
      id: 'crew.hadrik-bronn.species',
      subject: 'crew.hadrik-bronn',
      predicate: 'species',
      value: 'Tellarite',
      summary: 'Hadrik Bronn is Tellarite.',
      criticality: 'hard',
      visibility: 'narratorSafe'
    }]
  }
}, {
  ingressId: 'ingress-response-core-host-native-reobserve-contradiction',
  hostMessageId: 'player-core-host-native-reobserve-contradiction',
  chatId,
  campaignId,
  sourceFrame: reobserveContradictionFrame,
  coreTransactionId: reobserveContradictionTransaction.id,
  receivedAt: '2026-06-28T17:03:00.000Z'
});
const reobserveContradictionText = 'Hadrik Bronn gave a human grin while the answer settled into the room.';
const reobserveContradictionDispatcher = createResponseDispatcher({
  host: {
    chat: {
      postAssistantMessage: async () => {
        throw new Error('Reobserve contradiction bridge test must not post Directive text.');
      },
      continueHostGeneration: async () => ({
        ok: true,
        released: true,
        skipped: false,
        waitForCompletion: false,
        generationStartedAt: '2026-06-28T17:03:05.000Z',
        hostGenerationReleasedAt: '2026-06-28T17:03:05.000Z',
        observationStatus: 'pending',
        observationId: 'observation-response-core-host-native-reobserve-contradiction'
      }),
      refreshCurrentChat: async () => ({ ok: true, refreshed: true }),
      getRecentMessages: async () => [
        {
          hostMessageId: 'player-core-host-native-reobserve-contradiction',
          index: 14,
          chatId,
          isUser: true,
          text: 'Sam waits for a reobserved host-native answer.'
        },
        {
          hostMessageId: 'assistant-host-native-reobserve-contradiction',
          index: 15,
          chatId,
          isUser: false,
          isSystem: false,
          text: reobserveContradictionText
        }
      ]
    }
  },
  coreTurnStore: coreStore,
  getCampaignState: () => state,
  setCampaignState: (next) => { state = initializeCampaignRuntimeTracking(next); },
  persist: async (next) => { state = initializeCampaignRuntimeTracking(next); },
  now
});
const reobserveContradictionDispatch = await reobserveContradictionDispatcher.dispatch({
  campaignState: state,
  ingressId: 'ingress-response-core-host-native-reobserve-contradiction',
  strategy: 'injectAndContinue',
  responseKind: 'hostGeneration',
  idempotencyKey: 'response-core-host-native-reobserve-contradiction'
});
assert.equal(reobserveContradictionDispatch.ok, true);
const reobserveContradictionResult = await reobserveContradictionDispatcher.reobserveHostGenerationCompletions({
  campaignState: state,
  packageData: {
    crew: {
      senior: [{ id: 'hadrik-bronn', name: 'Hadrik Bronn', shortName: 'Bronn' }]
    }
  }
});
assert.equal(reobserveContradictionResult.ok, false);
assert.equal(reobserveContradictionResult.results[0].status, 'recoveryRequired');
assert.equal(coreStore.state.transactions[reobserveContradictionTransaction.id].phase, 'recoveryRequired');
assert.equal(coreStore.state.transactions[reobserveContradictionTransaction.id].visibleResponseRef.hostMessageId, 'assistant-host-native-reobserve-contradiction');
assert.equal(coreStore.state.transactions[reobserveContradictionTransaction.id].visibleResponseRef.textHash, hashStableJson({ text: reobserveContradictionText }));
const reobserveContradictionResponse = state.runtimeTracking.responseLedger.find((entry) => entry.id === 'response-core-host-native-reobserve-contradiction');
assert.equal(reobserveContradictionResponse.status, 'recoveryRequired');
assert.equal(reobserveContradictionResponse.hostObservation.hostMessageId, 'assistant-host-native-reobserve-contradiction');
assert.equal(reobserveContradictionResponse.coreCompletion.phase, 'visibleResponsePosted');
assert.equal(reobserveContradictionResponse.coreRecovery.phase, 'recoveryRequired');
const reobserveContradictionRecovery = state.runtimeTracking.recoveryJournal.find((entry) => entry.id === 'recovery:continuity:response-core-host-native-reobserve-contradiction');
assert.equal(reobserveContradictionRecovery.type, 'hostNativeContinuityContradiction');
assert.equal(reobserveContradictionRecovery.details.repairDecision.sreReviewRequired, true);
assert.equal(JSON.stringify(coreStore.state).includes('human grin'), false);
assert.equal(JSON.stringify(reobserveContradictionResponse).includes('human grin'), false);

const repairOwnedContradictionFrame = createTurnSourceFrameContract({
  id: 'frame-response-core-repair-owned-contradiction',
  campaignId,
  saveId,
  chatId,
  hostMessageId: 'player-core-repair-owned-contradiction',
  textHash: hashStableJson({ text: 'Sam asks the host to continue into a REPAIR-owned contradiction.' }),
  sourceRevision: 4,
  createdAt: '2026-06-28T17:03:20.000Z'
});
const repairOwnedContradictionTransaction = await coreStore.beginTurn(repairOwnedContradictionFrame, {
  transactionId: 'txn-response-core-repair-owned-contradiction',
  ingressId: 'ingress-response-core-repair-owned-contradiction',
  idempotencyKey: 'begin-response-core-repair-owned-contradiction'
});
state = addIngress(state, {
  ingressId: 'ingress-response-core-repair-owned-contradiction',
  hostMessageId: 'player-core-repair-owned-contradiction',
  chatId,
  campaignId,
  sourceFrame: repairOwnedContradictionFrame,
  coreTransactionId: repairOwnedContradictionTransaction.id,
  receivedAt: '2026-06-28T17:03:20.000Z'
});
const repairOwnedContradictionCalls = [];
const repairOwnedCompatibilityRecoveryId = 'recovery:continuity:repair-owned-projection-canary';
const repairOwnedCompatibilityFactId = 'crew.repair-owned.compatibility-canary';
const repairOwnedCompatibilityRecordedAt = '2026-06-28T17:03:27.000Z';
const repairOwnedContradictionDecision = (options = {}, policySource = 'repair-owned-continuity-handler') => ({
  kind: 'directive.repairResponseRecoveryDecision.v1',
  eventType: 'hostNativeContinuityContradiction',
  reason: 'hostNativeContinuityContradiction',
  sourceKind: 'directiveResponse',
  ingressId: options.ingress?.id || null,
  responseId: options.responseId || null,
  outcomeId: options.outcomeId || options.ingress?.outcomeId || null,
  turnId: options.turnId || null,
  sourceFrameId: options.ingress?.sourceFrameId || null,
  transactionId: options.ingress?.coreTransactionId || null,
  action: 'repair-owned-continuity-review',
  responseStatus: 'recoveryRequired',
  responseRetry: false,
  phaseAfter: 'recoveryRequired',
  allowedActions: ['repair-owned-continuity-review'],
  recoveryType: 'hostNativeContinuityContradiction',
  recoveryAction: 'repair-owned-continuity-review',
  recoverySummary: 'Repair-owned continuity contradiction policy.',
  retryHostGeneration: false,
  retryDirectiveResponse: false,
  reobserveHostAssistantRows: false,
  preferredFirstAction: 'repair-owned-continuity-review',
  sreReviewRequired: true,
  normalTurnAllowed: false,
  recoveryRequired: true,
  observationStatus: 'completed',
  policySource
});
const repairOwnedContradictionRuntime = {
  evaluateResponseRecovery(options = {}) {
    return repairOwnedContradictionDecision(options, 'repair-owned-continuity-fallback');
  },
  async handleHostNativeContinuityContradiction(options = {}) {
    const responseLedgerAtRepair = options.campaignState?.runtimeTracking?.responseLedger || [];
    repairOwnedContradictionCalls.push(cloneJson({
      ...options,
      hasCampaignState: Boolean(options.campaignState),
      sawResponseProjectionBeforeRepair: responseLedgerAtRepair.some((entry) => entry.id === 'response-core-repair-owned-contradiction'),
      ingress: options.ingress ? {
        id: options.ingress.id,
        coreTransactionId: options.ingress.coreTransactionId,
        sourceFrameId: options.ingress.sourceFrameId
      } : null
    }));
    const decision = repairOwnedContradictionDecision(options);
    const recoveryCase = await coreStore.markRecoveryRequired(decision.transactionId, {
      id: options.recoveryId || `recovery:continuity:${decision.responseId}`,
      reason: decision.reason,
      status: 'required',
      responseRetry: false,
      phaseAfter: decision.phaseAfter,
      repairDecision: decision,
      allowedActions: decision.allowedActions,
      idempotencyKey: `repair-owned-continuity:${decision.transactionId}:${decision.responseId}`
    });
    return {
      status: 'recorded',
      transactionId: decision.transactionId,
      recoveryCaseId: recoveryCase.id,
      phase: recoveryCase.phase,
      reason: recoveryCase.reason,
      decision,
      compatibilityProjection: {
        rejectedClaims: [{
          schemaVersion: 1,
          id: 'generated-claim.repair-owned-projection-canary',
          status: 'rejected',
          categories: ['identity'],
          textHash: hashStableJson({ text: 'repair-owned compact claim canary' }),
          source: {
            kind: 'hostNativeGeneration',
            responseId: decision.responseId,
            ingressId: decision.ingressId,
            hostMessageId: 'assistant-host-native-repair-owned-contradiction'
          },
          sourceHash: hashStableJson({
            kind: 'hostNativeGeneration',
            responseId: decision.responseId,
            ingressId: decision.ingressId,
            hostMessageId: 'assistant-host-native-repair-owned-contradiction'
          }),
          extractedAt: repairOwnedCompatibilityRecordedAt,
          authority: 'generatedClaim',
          accepted: false,
          findingFactIds: [repairOwnedCompatibilityFactId],
          findingKinds: ['repair-owned-canary'],
          review: {
            kind: 'directive.sreHostNativeContinuityReview.v1',
            ok: false,
            findingCount: 1
          }
        }],
        projectionHints: [{
          id: 'hint.repair-owned-projection-canary',
          factId: repairOwnedCompatibilityFactId,
          mode: 'guard',
          force: 'guard',
          minimumLane: 'directive.continuity.invariants',
          reason: 'Repair-owned compatibility projection canary.',
          owner: 'repair',
          source: { kind: 'repairCompatibilityProjection' },
          createdRevision: 0,
          expiresRevision: 4,
          createdAt: repairOwnedCompatibilityRecordedAt
        }],
        factUseStats: {
          [repairOwnedCompatibilityFactId]: {
            factId: repairOwnedCompatibilityFactId,
            selectedCount: 3,
            guardedCount: 5,
            violationCount: 7,
            lastSelectedRevision: 0,
            lastGuardedRevision: 0,
            lastViolationRevision: 0,
            lastLane: 'directive.continuity.invariants',
            updatedAt: repairOwnedCompatibilityRecordedAt
          }
        },
        recoveryEvent: {
          id: repairOwnedCompatibilityRecoveryId,
          type: 'hostNativeContinuityContradiction',
          status: 'open',
          hostMessageId: 'assistant-host-native-repair-owned-contradiction',
          ingressId: decision.ingressId,
          outcomeId: decision.outcomeId,
          recordedAt: repairOwnedCompatibilityRecordedAt,
          details: {
            responseId: decision.responseId,
            hostMessageId: 'assistant-host-native-repair-owned-contradiction',
            repairDecision: decision,
            recoveryPolicy: {
              action: 'repair-owned-projection-action',
              reason: 'Repair supplied this compatibility projection.',
              hostRepairAvailable: false,
              retryHostGeneration: false,
              reobserveHostAssistantRows: false,
              preferredFirstAction: 'repair-owned-projection-action',
              allowedActions: ['repair-owned-projection-action', 'repair-owned-projection-review']
            }
          }
        },
        ingressPatch: {
          status: 'recoveryRequired',
          responseStrategy: 'injectAndContinue',
          turnId: decision.turnId,
          outcomeId: decision.outcomeId,
          recoveryId: repairOwnedCompatibilityRecoveryId,
          error: {
            code: 'DIRECTIVE_REPAIR_OWNED_CONTINUITY_CANARY',
            message: 'Repair-owned compatibility ingress patch.'
          },
          failedAt: repairOwnedCompatibilityRecordedAt
        }
      }
    };
  }
};
const repairOwnedContradictionDispatcher = createResponseDispatcher({
  host: {
    chat: {
      postAssistantMessage: async () => {
        throw new Error('REPAIR-owned contradiction bridge test must not post Directive text.');
      },
      continueHostGeneration: async () => ({
        ok: true,
        released: true,
        skipped: false,
        waitForCompletion: false,
        generationStartedAt: '2026-06-28T17:03:25.000Z',
        hostGenerationReleasedAt: '2026-06-28T17:03:25.000Z',
        observationStatus: 'completed',
        observedMessage: {
          hostMessageId: 'assistant-host-native-repair-owned-contradiction',
          index: 16,
          chatId,
          text: 'This answer trips the REPAIR-owned continuity review.'
        }
      })
    }
  },
  sourceReconciliationEngine: {
    reviewHostNativeContinuity: async () => ({
      kind: 'directive.sreHostNativeContinuityReview.v1',
      ok: false,
      findings: [{
        kind: 'protected-fact-contradiction',
        factId: 'crew.hadrik-bronn.species',
        severity: 'blocker',
        summary: 'Synthetic contradiction for REPAIR ownership.'
      }],
      checkedFactCount: 1,
      reviewer: 'test-sre',
      sreReview: {
        kind: 'directive.sreHostNativeContinuityReview.v1',
        mode: 'hostNativeCompletion',
        reviewer: 'test-sre',
        status: 'rejected',
        reviewedAt: '2026-06-28T17:03:26.000Z',
        source: {
          responseId: 'response-core-repair-owned-contradiction',
          ingressId: 'ingress-response-core-repair-owned-contradiction',
          hostMessageId: 'assistant-host-native-repair-owned-contradiction'
        }
      }
    })
  },
  coreTurnStore: coreStore,
  repairRuntime: repairOwnedContradictionRuntime,
  getCampaignState: () => state,
  setCampaignState: (next) => { state = initializeCampaignRuntimeTracking(next); },
  persist: async (next) => { state = initializeCampaignRuntimeTracking(next); },
  now
});
const repairOwnedContradictionDispatch = await repairOwnedContradictionDispatcher.dispatch({
  campaignState: state,
  ingressId: 'ingress-response-core-repair-owned-contradiction',
  strategy: 'injectAndContinue',
  responseKind: 'hostGeneration',
  idempotencyKey: 'response-core-repair-owned-contradiction'
});
assert.equal(repairOwnedContradictionDispatch.ok, false);
assert.equal(repairOwnedContradictionCalls.length, 1, 'Host-native contradiction recovery must enter the REPAIR contradiction boundary.');
assert.equal('host' in repairOwnedContradictionCalls[0], false);
assert.equal('chat' in repairOwnedContradictionCalls[0], false);
assert.equal(
  repairOwnedContradictionCalls[0].hasCampaignState,
  true,
  'REPAIR contradiction boundary must receive campaign state so it can own recovery decisions.'
);
assert.equal(
  repairOwnedContradictionCalls[0].sawResponseProjectionBeforeRepair,
  false,
  'REPAIR contradiction boundary must run before response-dispatch compatibility projection is recorded.'
);
const repairOwnedContradictionRecovery = state.runtimeTracking.recoveryJournal.find((entry) => entry.id === 'recovery:continuity:response-core-repair-owned-contradiction');
assert.equal(
  repairOwnedContradictionRecovery,
  undefined,
  'Dispatcher must not write its hard-coded continuity recovery event when REPAIR supplies a compatibility projection.'
);
const repairOwnedProjectedRecovery = state.runtimeTracking.recoveryJournal.find((entry) => entry.id === repairOwnedCompatibilityRecoveryId);
assert.equal(repairOwnedProjectedRecovery.details.repairDecision.policySource, 'repair-owned-continuity-handler');
assert.equal(repairOwnedProjectedRecovery.details.recoveryPolicy.action, 'repair-owned-projection-action');
assert.deepEqual(repairOwnedProjectedRecovery.details.recoveryPolicy.allowedActions, ['repair-owned-projection-action', 'repair-owned-projection-review']);
const repairOwnedProjectedIngress = state.runtimeTracking.ingressLedger.find((entry) => entry.id === 'ingress-response-core-repair-owned-contradiction');
assert.equal(repairOwnedProjectedIngress.recoveryId, repairOwnedCompatibilityRecoveryId);
assert.equal(repairOwnedProjectedIngress.error.code, 'DIRECTIVE_REPAIR_OWNED_CONTINUITY_CANARY');
const repairOwnedProjectedClaim = state.continuity.rejectedClaims.find((entry) => entry.id === 'generated-claim.repair-owned-projection-canary');
assert.equal(repairOwnedProjectedClaim.source.responseId, 'response-core-repair-owned-contradiction');
assert.equal(Object.prototype.hasOwnProperty.call(repairOwnedProjectedClaim, 'text'), false);
assert.equal(JSON.stringify(state.continuity.rejectedClaims).includes('This answer trips the REPAIR-owned continuity review.'), false);
assert.equal(state.continuity.projectionHints.some((entry) => entry.id === 'hint.repair-owned-projection-canary'), true);
assert.deepEqual(state.continuity.factUseStats[repairOwnedCompatibilityFactId], {
  factId: repairOwnedCompatibilityFactId,
  selectedCount: 3,
  guardedCount: 5,
  violationCount: 7,
  lastSelectedRevision: 0,
  lastGuardedRevision: 0,
  lastViolationRevision: 0,
  lastLane: 'directive.continuity.invariants',
  updatedAt: repairOwnedCompatibilityRecordedAt
});
const repairOwnedContradictionCoreEvent = coreStore.state.events.find((entry) => (
  entry.type === 'recoveryRequired'
  && entry.txnId === repairOwnedContradictionTransaction.id
));
assert.equal(repairOwnedContradictionCoreEvent.payload.repairDecision.policySource, 'repair-owned-continuity-handler');
assert.deepEqual(repairOwnedContradictionCoreEvent.payload.allowedActions, ['repair-owned-continuity-review']);

const emptyProjectionContradictionFrame = createTurnSourceFrameContract({
  id: 'frame-response-core-empty-projection-contradiction',
  campaignId,
  saveId,
  chatId,
  hostMessageId: 'player-core-empty-projection-contradiction',
  textHash: hashStableJson({ text: 'Sam asks the host to continue into an empty REPAIR projection contradiction.' }),
  sourceRevision: 4,
  createdAt: '2026-06-28T17:03:28.000Z'
});
const emptyProjectionContradictionTransaction = await coreStore.beginTurn(emptyProjectionContradictionFrame, {
  transactionId: 'txn-response-core-empty-projection-contradiction',
  ingressId: 'ingress-response-core-empty-projection-contradiction',
  idempotencyKey: 'begin-response-core-empty-projection-contradiction'
});
state = addIngress(state, {
  ingressId: 'ingress-response-core-empty-projection-contradiction',
  hostMessageId: 'player-core-empty-projection-contradiction',
  chatId,
  campaignId,
  sourceFrame: emptyProjectionContradictionFrame,
  coreTransactionId: emptyProjectionContradictionTransaction.id,
  receivedAt: '2026-06-28T17:03:28.000Z'
});
const emptyProjectionObservedText = 'Hadrik Bronn answered with a very human grin and called himself the human security chief from Earth.';
const emptyProjectionDecision = (options = {}) => ({
  ...repairOwnedContradictionDecision(options, 'repair-empty-compatibility-projection'),
  allowedActions: ['review-empty-repair-projection'],
  recoveryAction: 'review-empty-repair-projection',
  preferredFirstAction: 'review-empty-repair-projection',
  recoverySummary: 'Empty REPAIR projection must fail closed without raw text.'
});
const emptyProjectionRuntime = {
  evaluateResponseRecovery(options = {}) {
    return emptyProjectionDecision(options);
  },
  async handleHostNativeContinuityContradiction(options = {}) {
    const decision = emptyProjectionDecision(options);
    const recoveryCase = await coreStore.markRecoveryRequired(decision.transactionId, {
      id: options.recoveryId || `recovery:continuity:${decision.responseId}`,
      reason: decision.reason,
      status: 'required',
      responseRetry: false,
      phaseAfter: decision.phaseAfter,
      repairDecision: decision,
      allowedActions: decision.allowedActions,
      idempotencyKey: `repair-empty-projection:${decision.transactionId}:${decision.responseId}`
    });
    return {
      status: 'recorded',
      transactionId: decision.transactionId,
      recoveryCaseId: recoveryCase.id,
      phase: recoveryCase.phase,
      reason: recoveryCase.reason,
      decision,
      compatibilityProjection: {}
    };
  }
};
const emptyProjectionDispatcher = createResponseDispatcher({
  host: {
    chat: {
      postAssistantMessage: async () => {
        throw new Error('Empty projection contradiction test must not post Directive text.');
      },
      continueHostGeneration: async () => ({
        ok: true,
        released: true,
        skipped: false,
        waitForCompletion: false,
        generationStartedAt: '2026-06-28T17:03:28.500Z',
        hostGenerationReleasedAt: '2026-06-28T17:03:28.500Z',
        observationStatus: 'completed',
        observedMessage: {
          hostMessageId: 'assistant-host-native-empty-projection-contradiction',
          index: 17,
          chatId,
          text: emptyProjectionObservedText
        }
      })
    }
  },
  sourceReconciliationEngine: {
    reviewHostNativeContinuity: async () => ({
      kind: 'directive.sreHostNativeContinuityReview.v1',
      ok: false,
      findings: [{
        kind: 'protected-fact-contradiction',
        factId: 'crew.hadrik-bronn.species',
        severity: 'blocker',
        summary: 'Synthetic contradiction with empty REPAIR projection.'
      }],
      checkedFactCount: 1,
      reviewer: 'test-sre',
      sreReview: {
        kind: 'directive.sreHostNativeContinuityReview.v1',
        mode: 'hostNativeCompletion',
        reviewer: 'test-sre',
        status: 'rejected',
        reviewedAt: '2026-06-28T17:03:28.750Z',
        source: {
          responseId: 'response-core-empty-projection-contradiction',
          ingressId: 'ingress-response-core-empty-projection-contradiction',
          hostMessageId: 'assistant-host-native-empty-projection-contradiction',
          textHash: hashStableJson({ text: emptyProjectionObservedText })
        }
      }
    })
  },
  coreTurnStore: coreStore,
  repairRuntime: emptyProjectionRuntime,
  getCampaignState: () => state,
  setCampaignState: (next) => { state = initializeCampaignRuntimeTracking(next); },
  persist: async (next) => { state = initializeCampaignRuntimeTracking(next); },
  now
});
const emptyProjectionDispatch = await emptyProjectionDispatcher.dispatch({
  campaignState: state,
  ingressId: 'ingress-response-core-empty-projection-contradiction',
  strategy: 'injectAndContinue',
  responseKind: 'hostGeneration',
  idempotencyKey: 'response-core-empty-projection-contradiction'
});
assert.equal(emptyProjectionDispatch.ok, false);
assert.equal(emptyProjectionDispatch.recoveryRequired, true);
const emptyProjectionHardCodedRecovery = state.runtimeTracking.recoveryJournal.find((entry) => entry.id === 'recovery:continuity:response-core-empty-projection-contradiction');
assert.equal(
  emptyProjectionHardCodedRecovery,
  undefined,
  'Empty REPAIR compatibilityProjection must not make dispatcher write its hard-coded continuity recovery event.'
);
const emptyProjectionRecovery = state.runtimeTracking.recoveryJournal.find((entry) => (
  entry.details?.responseId === 'response-core-empty-projection-contradiction'
  && entry.type === 'hostNativeContinuityContradiction'
));
assert.equal(Boolean(emptyProjectionRecovery), true);
assert.notEqual(emptyProjectionRecovery.id, 'recovery:continuity:response-core-empty-projection-contradiction');
const emptyProjectionIngress = state.runtimeTracking.ingressLedger.find((entry) => entry.id === 'ingress-response-core-empty-projection-contradiction');
assert.equal(emptyProjectionIngress.status, 'recoveryRequired');
assert.equal(emptyProjectionIngress.recoveryId, emptyProjectionRecovery.id);
assert.equal(JSON.stringify(state).includes(emptyProjectionObservedText), false);
assert.equal(JSON.stringify(emptyProjectionDispatch).includes(emptyProjectionObservedText), false);

const absentProjectionObservedText = 'Hadrik Bronn says RAW_ABSENT_PROJECTION_OBSERVED_TEXT_CANARY while insisting he is a human officer from Earth.';
const absentProjectionFrame = createTurnSourceFrameContract({
  id: 'frame-response-core-absent-projection-contradiction',
  campaignId,
  saveId,
  chatId,
  hostMessageId: 'player-core-absent-projection-contradiction',
  textHash: hashStableJson({ text: 'Sam asks the host to continue into an absent REPAIR projection contradiction.' }),
  sourceRevision: 4,
  createdAt: '2026-06-28T17:03:28.800Z'
});
const absentProjectionTransaction = await coreStore.beginTurn(absentProjectionFrame, {
  transactionId: 'txn-response-core-absent-projection-contradiction',
  ingressId: 'ingress-response-core-absent-projection-contradiction',
  idempotencyKey: 'begin-response-core-absent-projection-contradiction'
});
state = addIngress(state, {
  ingressId: 'ingress-response-core-absent-projection-contradiction',
  hostMessageId: 'player-core-absent-projection-contradiction',
  chatId,
  campaignId,
  sourceFrame: absentProjectionFrame,
  coreTransactionId: absentProjectionTransaction.id,
  receivedAt: '2026-06-28T17:03:28.800Z'
});
const absentProjectionDecision = (options = {}) => ({
  ...repairOwnedContradictionDecision(options, 'repair-absent-compatibility-projection'),
  allowedActions: ['review-absent-repair-projection'],
  recoveryAction: 'review-absent-repair-projection',
  preferredFirstAction: 'review-absent-repair-projection',
  recoverySummary: 'Absent REPAIR projection must fail closed without raw text.'
});
const absentProjectionRuntime = {
  evaluateResponseRecovery(options = {}) {
    return absentProjectionDecision(options);
  },
  async handleHostNativeContinuityContradiction(options = {}) {
    const decision = absentProjectionDecision(options);
    const recoveryCase = await coreStore.markRecoveryRequired(decision.transactionId, {
      id: options.recoveryId || `recovery:continuity:${decision.responseId}`,
      reason: decision.reason,
      status: 'required',
      responseRetry: false,
      phaseAfter: decision.phaseAfter,
      repairDecision: decision,
      allowedActions: decision.allowedActions,
      idempotencyKey: `repair-absent-projection:${decision.transactionId}:${decision.responseId}`
    });
    return {
      status: 'recorded',
      transactionId: decision.transactionId,
      recoveryCaseId: recoveryCase.id,
      phase: recoveryCase.phase,
      reason: recoveryCase.reason,
      decision
    };
  }
};
const absentProjectionDispatcher = createResponseDispatcher({
  host: {
    chat: {
      postAssistantMessage: async () => {
        throw new Error('Absent projection contradiction test must not post Directive text.');
      },
      continueHostGeneration: async () => ({
        ok: true,
        released: true,
        skipped: false,
        waitForCompletion: false,
        generationStartedAt: '2026-06-28T17:03:28.900Z',
        hostGenerationReleasedAt: '2026-06-28T17:03:28.900Z',
        observationStatus: 'completed',
        observedMessage: {
          hostMessageId: 'assistant-host-native-absent-projection-contradiction',
          index: 18,
          chatId,
          text: absentProjectionObservedText
        }
      })
    }
  },
  sourceReconciliationEngine: {
    reviewHostNativeContinuity: async () => ({
      kind: 'directive.sreHostNativeContinuityReview.v1',
      ok: false,
      findings: [{
        kind: 'protected-fact-contradiction',
        factId: 'crew.hadrik-bronn.species',
        severity: 'blocker',
        summary: 'Synthetic contradiction with absent REPAIR projection.'
      }],
      checkedFactCount: 1,
      reviewer: 'test-sre',
      sreReview: {
        kind: 'directive.sreHostNativeContinuityReview.v1',
        mode: 'hostNativeCompletion',
        reviewer: 'test-sre',
        status: 'rejected',
        reviewedAt: '2026-06-28T17:03:28.950Z',
        source: {
          responseId: 'response-core-absent-projection-contradiction',
          ingressId: 'ingress-response-core-absent-projection-contradiction',
          hostMessageId: 'assistant-host-native-absent-projection-contradiction',
          textHash: hashStableJson({ text: absentProjectionObservedText })
        }
      }
    })
  },
  coreTurnStore: coreStore,
  repairRuntime: absentProjectionRuntime,
  getCampaignState: () => state,
  setCampaignState: (next) => { state = initializeCampaignRuntimeTracking(next); },
  persist: async (next) => { state = initializeCampaignRuntimeTracking(next); },
  now
});
const absentProjectionDispatch = await absentProjectionDispatcher.dispatch({
  campaignState: state,
  ingressId: 'ingress-response-core-absent-projection-contradiction',
  strategy: 'injectAndContinue',
  responseKind: 'hostGeneration',
  idempotencyKey: 'response-core-absent-projection-contradiction'
});
assert.equal(absentProjectionDispatch.ok, false);
assert.equal(absentProjectionDispatch.recoveryRequired, true);
const absentProjectionHardCodedRecovery = state.runtimeTracking.recoveryJournal.find((entry) => entry.id === 'recovery:continuity:response-core-absent-projection-contradiction');
assert.equal(
  absentProjectionHardCodedRecovery,
  undefined,
  'Absent REPAIR compatibilityProjection must not make dispatcher write its hard-coded continuity recovery event.'
);
const absentProjectionRecovery = state.runtimeTracking.recoveryJournal.find((entry) => (
  entry.details?.responseId === 'response-core-absent-projection-contradiction'
  && entry.type === 'hostNativeContinuityContradiction'
));
assert.equal(Boolean(absentProjectionRecovery), true);
assert.notEqual(absentProjectionRecovery.id, 'recovery:continuity:response-core-absent-projection-contradiction');
const absentProjectionIngress = state.runtimeTracking.ingressLedger.find((entry) => entry.id === 'ingress-response-core-absent-projection-contradiction');
assert.equal(absentProjectionIngress.status, 'recoveryRequired');
assert.equal(absentProjectionIngress.recoveryId, absentProjectionRecovery.id);
for (const container of [state, absentProjectionDispatch, coreStore.state]) {
  assert.equal(JSON.stringify(container).includes('RAW_ABSENT_PROJECTION_OBSERVED_TEXT_CANARY'), false);
}

const rawWriterThrowMessage = 'RAW_REPAIR_WRITER_THROW_MESSAGE_CANARY';
const rawWriterThrowCode = 'RAW_REPAIR_WRITER_THROW_CODE_CANARY';
const writerThrowObservedText = 'Hadrik Bronn smiled like a human officer while repeating RAW_WRITER_THROW_OBSERVED_TEXT_CANARY.';
const writerThrowFrame = createTurnSourceFrameContract({
  id: 'frame-response-core-writer-throw-contradiction',
  campaignId,
  saveId,
  chatId,
  hostMessageId: 'player-core-writer-throw-contradiction',
  textHash: hashStableJson({ text: 'Sam asks the host to continue into a REPAIR writer throw.' }),
  sourceRevision: 4,
  createdAt: '2026-06-28T17:03:29.000Z'
});
const writerThrowTransaction = await coreStore.beginTurn(writerThrowFrame, {
  transactionId: 'txn-response-core-writer-throw-contradiction',
  ingressId: 'ingress-response-core-writer-throw-contradiction',
  idempotencyKey: 'begin-response-core-writer-throw-contradiction'
});
state = addIngress(state, {
  ingressId: 'ingress-response-core-writer-throw-contradiction',
  hostMessageId: 'player-core-writer-throw-contradiction',
  chatId,
  campaignId,
  sourceFrame: writerThrowFrame,
  coreTransactionId: writerThrowTransaction.id,
  receivedAt: '2026-06-28T17:03:29.000Z'
});
const writerThrowDecision = (options = {}) => repairOwnedContradictionDecision(options, 'repair-writer-throw-fallback');
const writerThrowRuntime = {
  evaluateResponseRecovery(options = {}) {
    return writerThrowDecision(options);
  },
  async handleHostNativeContinuityContradiction() {
    const error = new Error(rawWriterThrowMessage);
    error.code = rawWriterThrowCode;
    throw error;
  }
};
const writerThrowDispatcher = createResponseDispatcher({
  host: {
    chat: {
      postAssistantMessage: async () => {
        throw new Error('Writer throw contradiction test must not post Directive text.');
      },
      continueHostGeneration: async () => ({
        ok: true,
        released: true,
        skipped: false,
        waitForCompletion: false,
        generationStartedAt: '2026-06-28T17:03:29.500Z',
        hostGenerationReleasedAt: '2026-06-28T17:03:29.500Z',
        observationStatus: 'completed',
        observedMessage: {
          hostMessageId: 'assistant-host-native-writer-throw-contradiction',
          index: 18,
          chatId,
          text: writerThrowObservedText
        }
      })
    }
  },
  sourceReconciliationEngine: {
    reviewHostNativeContinuity: async () => ({
      kind: 'directive.sreHostNativeContinuityReview.v1',
      ok: false,
      findings: [{
        kind: 'protected-fact-contradiction',
        factId: 'crew.hadrik-bronn.species',
        severity: 'blocker',
        summary: 'Synthetic contradiction with REPAIR writer throw.'
      }],
      checkedFactCount: 1,
      reviewer: 'test-sre',
      sreReview: {
        kind: 'directive.sreHostNativeContinuityReview.v1',
        mode: 'hostNativeCompletion',
        reviewer: 'test-sre',
        status: 'rejected',
        reviewedAt: '2026-06-28T17:03:29.750Z',
        source: {
          responseId: 'response-core-writer-throw-contradiction',
          ingressId: 'ingress-response-core-writer-throw-contradiction',
          hostMessageId: 'assistant-host-native-writer-throw-contradiction',
          textHash: hashStableJson({ text: writerThrowObservedText })
        }
      }
    })
  },
  coreTurnStore: coreStore,
  repairRuntime: writerThrowRuntime,
  getCampaignState: () => state,
  setCampaignState: (next) => { state = initializeCampaignRuntimeTracking(next); },
  persist: async (next) => { state = initializeCampaignRuntimeTracking(next); },
  now
});
const writerThrowDispatch = await writerThrowDispatcher.dispatch({
  campaignState: state,
  ingressId: 'ingress-response-core-writer-throw-contradiction',
  strategy: 'injectAndContinue',
  responseKind: 'hostGeneration',
  idempotencyKey: 'response-core-writer-throw-contradiction'
});
assert.equal(writerThrowDispatch.ok, false);
assert.equal(writerThrowDispatch.recoveryRequired, true);
const writerThrowResponse = state.runtimeTracking.responseLedger.find((entry) => entry.id === 'response-core-writer-throw-contradiction');
assert.equal(writerThrowResponse.status, 'recoveryRequired');
const writerThrowIngress = state.runtimeTracking.ingressLedger.find((entry) => entry.id === 'ingress-response-core-writer-throw-contradiction');
assert.equal(writerThrowIngress.status, 'recoveryRequired');
for (const container of [state, writerThrowDispatch, coreStore.state]) {
  const serialized = JSON.stringify(container);
  assert.equal(serialized.includes(rawWriterThrowMessage), false);
  assert.equal(serialized.includes(rawWriterThrowCode), false);
  assert.equal(serialized.includes(writerThrowObservedText), false);
}

const contradictionReleaseFailureFrame = createTurnSourceFrameContract({
  id: 'frame-response-core-contradiction-release-failure',
  campaignId,
  saveId,
  chatId,
  hostMessageId: 'player-core-contradiction-release-failure',
  textHash: hashStableJson({ text: 'Sam asks for a host-native answer while CORE release fails.' }),
  sourceRevision: 4,
  createdAt: '2026-06-28T17:03:30.000Z'
});
const contradictionReleaseFailureTransaction = await coreStore.beginTurn(contradictionReleaseFailureFrame, {
  transactionId: 'txn-response-core-contradiction-release-failure',
  ingressId: 'ingress-response-core-contradiction-release-failure',
  idempotencyKey: 'begin-response-core-contradiction-release-failure'
});
state = addIngress(state, {
  ingressId: 'ingress-response-core-contradiction-release-failure',
  hostMessageId: 'player-core-contradiction-release-failure',
  chatId,
  campaignId,
  sourceFrame: contradictionReleaseFailureFrame,
  coreTransactionId: contradictionReleaseFailureTransaction.id,
  receivedAt: '2026-06-28T17:03:30.000Z'
});
const contradictionReleaseFailureCoreStore = {
  async advanceTurn(transactionId, patch = {}) {
    if (patch.phase === 'hostContinueReleased') {
      const error = new Error('Synthetic CORE host-continue release failure during contradiction.');
      error.code = 'DIRECTIVE_CORE_RELEASE_WRITE_FAILED';
      throw error;
    }
    return coreStore.advanceTurn(transactionId, patch);
  },
  async markRecoveryRequired(...args) {
    return coreStore.markRecoveryRequired(...args);
  }
};
const contradictionReleaseFailureDispatcher = createResponseDispatcher({
  host: {
    chat: {
      postAssistantMessage: async () => {
        throw new Error('Contradiction release failure test must not post Directive text.');
      },
      continueHostGeneration: async () => ({
        ok: true,
        released: true,
        skipped: false,
        waitForCompletion: false,
        generationStartedAt: '2026-06-28T17:03:35.000Z',
        hostGenerationReleasedAt: '2026-06-28T17:03:35.000Z',
        observationStatus: 'completed',
        observedMessage: {
          hostMessageId: 'assistant-host-native-contradiction-release-failure',
          index: 17,
          chatId,
          text: 'This answer trips contradiction recovery while release recording fails.'
        }
      })
    }
  },
  sourceReconciliationEngine: {
    reviewHostNativeContinuity: async () => ({
      kind: 'directive.sreHostNativeContinuityReview.v1',
      ok: false,
      findings: [{
        kind: 'protected-fact-contradiction',
        factId: 'crew.hadrik-bronn.species',
        severity: 'blocker',
        summary: 'Synthetic contradiction with release failure.'
      }],
      checkedFactCount: 1,
      reviewer: 'test-sre',
      sreReview: {
        kind: 'directive.sreHostNativeContinuityReview.v1',
        mode: 'hostNativeCompletion',
        reviewer: 'test-sre',
        status: 'rejected',
        reviewedAt: '2026-06-28T17:03:36.000Z',
        source: {
          responseId: 'response-core-contradiction-release-failure',
          ingressId: 'ingress-response-core-contradiction-release-failure',
          hostMessageId: 'assistant-host-native-contradiction-release-failure'
        }
      }
    })
  },
  coreTurnStore: contradictionReleaseFailureCoreStore,
  getCampaignState: () => state,
  setCampaignState: (next) => { state = initializeCampaignRuntimeTracking(next); },
  persist: async (next) => { state = initializeCampaignRuntimeTracking(next); },
  now
});
const contradictionReleaseFailureDispatch = await contradictionReleaseFailureDispatcher.dispatch({
  campaignState: state,
  ingressId: 'ingress-response-core-contradiction-release-failure',
  strategy: 'injectAndContinue',
  responseKind: 'hostGeneration',
  idempotencyKey: 'response-core-contradiction-release-failure'
});
assert.equal(contradictionReleaseFailureDispatch.ok, false);
assert.equal(contradictionReleaseFailureDispatch.recoveryId, 'recovery:continuity:response-core-contradiction-release-failure');
const contradictionReleaseFailureRecoveries = state.runtimeTracking.recoveryJournal.filter((entry) => (
  entry.details?.responseId === 'response-core-contradiction-release-failure'
));
assert.equal(
  contradictionReleaseFailureRecoveries.some((entry) => (
    entry.id === 'recovery:continuity:response-core-contradiction-release-failure'
    && entry.type === 'hostNativeContinuityContradiction'
  )),
  true,
  'Contradiction recovery must keep its own journal entry when CORE release also fails.'
);
assert.equal(
  contradictionReleaseFailureRecoveries.some((entry) => (
    entry.id === 'recovery:core-host-continue:response-core-contradiction-release-failure'
    && entry.type === 'coreHostContinueReleaseFailure'
  )),
  true,
  'CORE release failure must use a distinct recovery id when contradiction recovery already owns the response.'
);
const contradictionReleaseFailureIngress = state.runtimeTracking.ingressLedger.find((entry) => entry.id === 'ingress-response-core-contradiction-release-failure');
assert.equal(contradictionReleaseFailureIngress.recoveryId, 'recovery:continuity:response-core-contradiction-release-failure');

const sentinelFrame = createTurnSourceFrameContract({
  id: 'frame-response-core-repair-sentinel',
  campaignId,
  saveId,
  chatId,
  hostMessageId: 'player-core-repair-sentinel',
  textHash: hashStableJson({ text: 'Sentinel recovery policy should come from REPAIR.' }),
  sourceRevision: 4,
  createdAt: '2026-06-28T17:02:30.000Z'
});
const sentinelTransaction = await coreStore.beginTurn(sentinelFrame, {
  transactionId: 'txn-response-core-repair-sentinel',
  ingressId: 'ingress-response-core-repair-sentinel',
  idempotencyKey: 'begin-response-core-repair-sentinel'
});
state = addIngress(state, {
  ingressId: 'ingress-response-core-repair-sentinel',
  hostMessageId: 'player-core-repair-sentinel',
  chatId,
  campaignId,
  sourceFrame: sentinelFrame,
  coreTransactionId: sentinelTransaction.id,
  receivedAt: '2026-06-28T17:02:30.000Z'
});
const sentinelRepairCalls = [];
const sentinelPolicy = (options = {}) => ({
  kind: 'directive.repairResponseRecoveryDecision.v1',
  eventType: options.eventType || 'hostNativeAssistantUnavailable',
  reason: 'hostNativeAssistantUnavailable',
  sourceKind: 'directiveResponse',
  ingressId: options.ingress?.id || null,
  responseId: options.responseId || null,
  outcomeId: options.outcomeId || options.ingress?.outcomeId || null,
  turnId: options.turnId || null,
  sourceFrameId: options.ingress?.sourceFrameId || null,
  transactionId: options.ingress?.coreTransactionId || null,
  action: 'repair-sentinel-action',
  responseStatus: 'unavailable',
  responseRetry: false,
  phaseAfter: 'recoveryRequired',
  allowedActions: ['repair-sentinel-reobserve'],
  recoveryType: 'hostNativeAssistantUnavailable',
  recoveryAction: 'repair-sentinel-action',
  recoverySummary: 'Repair sentinel policy.',
  retryHostGeneration: false,
  retryDirectiveResponse: false,
  reobserveHostAssistantRows: true,
  preferredFirstAction: 'repair-sentinel-reobserve',
  normalTurnAllowed: false,
  recoveryRequired: true,
  policySource: 'repair-test-sentinel'
});
const sentinelRepairRuntime = {
  evaluateResponseRecovery(options = {}) {
    sentinelRepairCalls.push({ type: 'evaluate', options: cloneJson(options) });
    return sentinelPolicy(options);
  },
  async recordResponseRecovery(options = {}) {
    sentinelRepairCalls.push({ type: 'record', options: cloneJson({
      ...options,
      ingress: options.ingress ? {
        id: options.ingress.id,
        coreTransactionId: options.ingress.coreTransactionId,
        sourceFrameId: options.ingress.sourceFrameId
      } : null
    }) });
    const decision = sentinelPolicy(options);
    const recoveryCase = await coreStore.markRecoveryRequired(decision.transactionId, {
      id: options.recoveryId || `recovery:host-native:${decision.responseId}`,
      reason: decision.reason,
      status: 'required',
      responseRetry: decision.responseRetry,
      phaseAfter: decision.phaseAfter,
      repairDecision: decision,
      allowedActions: decision.allowedActions,
      idempotencyKey: `repair-sentinel:${decision.transactionId}:${decision.responseId}`
    });
    return {
      status: 'recorded',
      transactionId: decision.transactionId,
      recoveryCaseId: recoveryCase.id,
      phase: recoveryCase.phase,
      reason: recoveryCase.reason,
      decision
    };
  }
};
let sentinelObserved = null;
const sentinelDispatcher = createResponseDispatcher({
  host: {
    chat: {
      postAssistantMessage: async () => {
        throw new Error('Sentinel response bridge test must not post Directive text.');
      },
      continueHostGeneration: async (payload = {}) => {
        sentinelObserved = payload.onHostGenerationObserved;
        return {
          ok: true,
          released: true,
          skipped: false,
          waitForCompletion: false,
          generationStartedAt: '2026-06-28T17:02:40.000Z',
          hostGenerationReleasedAt: '2026-06-28T17:02:40.000Z',
          observationStatus: 'pending',
          observationId: 'observation-response-core-repair-sentinel'
        };
      }
    }
  },
  coreTurnStore: coreStore,
  repairRuntime: sentinelRepairRuntime,
  getCampaignState: () => state,
  setCampaignState: (next) => { state = initializeCampaignRuntimeTracking(next); },
  persist: async (next) => { state = initializeCampaignRuntimeTracking(next); },
  now
});
const sentinelDispatch = await sentinelDispatcher.dispatch({
  campaignState: state,
  ingressId: 'ingress-response-core-repair-sentinel',
  strategy: 'injectAndContinue',
  responseKind: 'hostGeneration',
  idempotencyKey: 'response-core-repair-sentinel'
});
assert.equal(sentinelDispatch.ok, true);
await sentinelObserved({
  kind: 'directive.hostGenerationObservation.v1',
  observationId: 'observation-response-core-repair-sentinel',
  ingressId: 'ingress-response-core-repair-sentinel',
  status: 'unavailable',
  ok: true,
  released: true,
  waitForCompletion: false,
  completedAt: '2026-06-28T17:02:50.000Z',
  reason: 'assistant-row-unavailable'
});
assert.equal(sentinelRepairCalls.filter((entry) => entry.type === 'evaluate').length, 1);
assert.equal(sentinelRepairCalls.filter((entry) => entry.type === 'record').length, 1);
assert.equal('host' in sentinelRepairCalls[0].options, false);
assert.equal('chat' in sentinelRepairCalls[0].options, false);
const sentinelRecovery = state.runtimeTracking.recoveryJournal.find((entry) => entry.id === 'recovery:host-native:response-core-repair-sentinel');
assert.equal(sentinelRecovery.details.repairDecision.policySource, 'repair-test-sentinel');
assert.deepEqual(sentinelRecovery.details.recoveryPolicy.allowedActions, ['repair-sentinel-reobserve']);
const sentinelCoreRecoveryEvent = coreStore.state.events.find((entry) => (
  entry.type === 'recoveryRequired'
  && entry.txnId === sentinelTransaction.id
));
assert.equal(sentinelCoreRecoveryEvent.payload.repairDecision.policySource, 'repair-test-sentinel');
assert.deepEqual(sentinelCoreRecoveryEvent.payload.allowedActions, ['repair-sentinel-reobserve']);

const failedFrame = createTurnSourceFrameContract({
  id: 'frame-response-core-host-native-failed',
  campaignId,
  saveId,
  chatId,
  hostMessageId: 'player-core-host-native-failed',
  textHash: hashStableJson({ text: 'Sam asks for the bridge to continue and the host generator fails.' }),
  sourceRevision: 4,
  createdAt: '2026-06-28T17:03:00.000Z'
});
const failedTransaction = await coreStore.beginTurn(failedFrame, {
  transactionId: 'txn-response-core-host-native-failed',
  ingressId: 'ingress-response-core-host-native-failed',
  idempotencyKey: 'begin-response-core-host-native-failed'
});
state = addIngress(state, {
  ingressId: 'ingress-response-core-host-native-failed',
  hostMessageId: 'player-core-host-native-failed',
  chatId,
  campaignId,
  sourceFrame: failedFrame,
  coreTransactionId: failedTransaction.id,
  receivedAt: '2026-06-28T17:03:00.000Z'
});
let failedObserved = null;
const failedObservationDispatcher = createResponseDispatcher({
  host: {
    chat: {
      postAssistantMessage: async () => {
        throw new Error('Failed host-native bridge test must not post Directive text.');
      },
      continueHostGeneration: async (payload = {}) => {
        failedObserved = payload.onHostGenerationObserved;
        return {
          ok: true,
          released: true,
          skipped: false,
          waitForCompletion: false,
          generationStartedAt: '2026-06-28T17:03:10.000Z',
          hostGenerationReleasedAt: '2026-06-28T17:03:10.000Z',
          observationStatus: 'pending',
          observationId: 'observation-response-core-host-native-failed'
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
const failedDispatch = await failedObservationDispatcher.dispatch({
  campaignState: state,
  ingressId: 'ingress-response-core-host-native-failed',
  strategy: 'injectAndContinue',
  responseKind: 'hostGeneration',
  idempotencyKey: 'response-core-host-native-failed'
});
assert.equal(failedDispatch.ok, true);
assert.equal(typeof failedObserved, 'function');
const failedEventsBeforeObservation = coreStore.state.events.length;
const failedObservation = await failedObserved({
  kind: 'directive.hostGenerationObservation.v1',
  observationId: 'observation-response-core-host-native-failed',
  ingressId: 'ingress-response-core-host-native-failed',
  status: 'failed',
  ok: false,
  released: true,
  waitForCompletion: false,
  generationStartedAt: '2026-06-28T17:03:10.000Z',
  hostGenerationReleasedAt: '2026-06-28T17:03:10.000Z',
  failedAt: '2026-06-28T17:03:20.000Z',
  error: {
    code: 'HOST_GENERATION_FAILED',
    message: 'Synthetic host generation failed.'
  }
});
assert.equal(failedObservation.ok, false);
assert.equal(failedObservation.status, 'responseRetryRequired');
assert.equal(coreStore.state.transactions[failedTransaction.id].phase, 'responseRetryRequired');
const failedHostNativeResponse = state.runtimeTracking.responseLedger.find((entry) => entry.id === 'response-core-host-native-failed');
assert.equal(failedHostNativeResponse.status, 'responseRetryRequired');
assert.equal(failedHostNativeResponse.hostObservationStatus, 'failed');
assert.equal(failedHostNativeResponse.coreRecovery.phase, 'responseRetryRequired');
const failedHostNativeRecovery = state.runtimeTracking.recoveryJournal.find((entry) => entry.id === 'recovery:host-native:response-core-host-native-failed');
assert.equal(failedHostNativeRecovery.type, 'hostNativeGenerationFailed');
assert.equal(failedHostNativeRecovery.details.repairDecision.kind, 'directive.repairResponseRecoveryDecision.v1');
assert.equal(failedHostNativeRecovery.details.repairDecision.eventType, 'hostNativeGenerationFailed');
assert.equal(failedHostNativeRecovery.details.repairDecision.responseStatus, 'responseRetryRequired');
assert.equal(failedHostNativeRecovery.details.recoveryPolicy.reobserveHostAssistantRows, true);
assert.equal(failedHostNativeRecovery.details.recoveryPolicy.retryHostGeneration, true);
assert.equal(failedHostNativeRecovery.details.recoveryPolicy.preferredFirstAction, 'reobserveHostAssistantRows');
assert.deepEqual(
  failedHostNativeRecovery.details.recoveryPolicy.allowedActions,
  ['reobserveHostAssistantRows', 'retryHostGeneration', 'fallbackDirectiveResponse', 'reviewHostGenerationFailure']
);
const failedCoreRecoveryEvent = coreStore.state.events.find((entry) => (
  entry.type === 'recoveryRequired'
  && entry.txnId === failedTransaction.id
));
assert.equal(failedCoreRecoveryEvent.payload.recoveryCase.phase, 'responseRetryRequired');
assert.equal(failedCoreRecoveryEvent.payload.repairDecision.kind, 'directive.repairResponseRecoveryDecision.v1');
assert.equal(failedCoreRecoveryEvent.payload.repairDecision.eventType, 'hostNativeGenerationFailed');
assert.deepEqual(
  failedCoreRecoveryEvent.payload.allowedActions,
  ['reobserveHostAssistantRows', 'retryHostGeneration', 'fallbackDirectiveResponse', 'reviewHostGenerationFailure']
);
const retryObservedTextHash = hashStableJson({ text: 'Host-native retry completion text.' });
const retryCompletionObservation = await failedObserved({
  kind: 'directive.hostGenerationObservation.v1',
  observationId: 'observation-response-core-host-native-failed-retry',
  ingressId: 'ingress-response-core-host-native-failed',
  status: 'completed',
  ok: true,
  released: true,
  waitForCompletion: false,
  generationStartedAt: '2026-06-28T17:03:30.000Z',
  hostGenerationReleasedAt: '2026-06-28T17:03:10.000Z',
  completedAt: '2026-06-28T17:03:40.000Z',
  observedMessage: {
    hostMessageId: 'assistant-host-native-retry-1',
    index: 11,
    chatId,
    textHash: retryObservedTextHash,
    textLength: 'Host-native retry completion text.'.length
  }
});
assert.equal(retryCompletionObservation.ok, true);
assert.equal(retryCompletionObservation.status, 'complete');
assert.equal(coreStore.state.transactions[failedTransaction.id].phase, 'visibleResponsePosted');
assert.equal(coreStore.state.transactions[failedTransaction.id].visibleResponseRef.hostMessageId, 'assistant-host-native-retry-1');
const retriedHostNativeResponse = state.runtimeTracking.responseLedger.find((entry) => entry.id === 'response-core-host-native-failed');
assert.equal(retriedHostNativeResponse.status, 'complete');
assert.equal(retriedHostNativeResponse.hostObservation.hostMessageId, 'assistant-host-native-retry-1');
assert.equal(retriedHostNativeResponse.hostObservation.textHash, retryObservedTextHash);
const duplicateFailedObservation = await failedObserved({
  kind: 'directive.hostGenerationObservation.v1',
  observationId: 'observation-response-core-host-native-failed',
  ingressId: 'ingress-response-core-host-native-failed',
  status: 'failed',
  ok: false,
  generationStartedAt: '2026-06-28T17:03:10.000Z',
  hostGenerationReleasedAt: '2026-06-28T17:03:10.000Z',
  failedAt: '2026-06-28T17:03:21.000Z'
});
assert.equal(duplicateFailedObservation.status, 'alreadySettled');
assert.equal(coreStore.state.events.length, failedEventsBeforeObservation + 2);

async function exerciseDelayedRecoveryReobserve({
  label,
  observationStatus,
  transactionId,
  ingressId,
  responseId,
  playerHostMessageId,
  assistantHostMessageId,
  playerText,
  assistantText,
  failureError = null
}) {
  const frame = createTurnSourceFrameContract({
    id: `frame-${label}`,
    campaignId,
    saveId,
    chatId,
    hostMessageId: playerHostMessageId,
    textHash: hashStableJson({ text: playerText }),
    sourceRevision: 0,
    createdAt: '2026-06-28T17:04:00.000Z'
  });
  const txn = await coreStore.beginTurn(frame, {
    transactionId,
    ingressId,
    idempotencyKey: `begin-${label}`
  });
  state = addIngress(state, {
    ingressId,
    hostMessageId: playerHostMessageId,
    chatId,
    campaignId,
    sourceFrame: frame,
    coreTransactionId: txn.id,
    receivedAt: '2026-06-28T17:04:00.000Z'
  });
  let observed = null;
  const dispatcher = createResponseDispatcher({
    host: {
      chat: {
        postAssistantMessage: async () => {
          throw new Error('Delayed recovery reobserve must not post Directive text.');
        },
        continueHostGeneration: async (payload = {}) => {
          observed = payload.onHostGenerationObserved;
          return {
            ok: true,
            released: true,
            skipped: false,
            waitForCompletion: false,
            reason: payload.reason,
            generationStartedAt: '2026-06-28T17:04:10.000Z',
            hostGenerationReleasedAt: '2026-06-28T17:04:10.000Z',
            observationStatus: 'pending',
            observationId: `observation-${label}`
          };
        },
        refreshCurrentChat: async () => ({ ok: true, refreshed: true }),
        getRecentMessages: async () => [
          {
            hostMessageId: playerHostMessageId,
            index: 30,
            chatId,
            isUser: true,
            text: playerText
          },
          {
            hostMessageId: assistantHostMessageId,
            index: 31,
            chatId,
            isUser: false,
            isSystem: false,
            text: assistantText
          }
        ]
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
    ingressId,
    strategy: 'injectAndContinue',
    responseKind: 'hostGeneration',
    idempotencyKey: responseId
  });
  assert.equal(dispatch.ok, true, `${label}: host generation should release`);
  assert.equal(typeof observed, 'function', `${label}: observer callback should be captured`);
  const recoveryObservation = await observed({
    kind: 'directive.hostGenerationObservation.v1',
    observationId: `observation-${label}-recovery`,
    ingressId,
    status: observationStatus,
    ok: observationStatus !== 'failed',
    released: true,
    waitForCompletion: false,
    generationStartedAt: '2026-06-28T17:04:10.000Z',
    hostGenerationReleasedAt: '2026-06-28T17:04:10.000Z',
    failedAt: observationStatus === 'failed' ? '2026-06-28T17:04:20.000Z' : undefined,
    completedAt: observationStatus === 'unavailable' ? '2026-06-28T17:04:20.000Z' : undefined,
    reason: observationStatus === 'unavailable' ? 'assistant-row-unavailable' : undefined,
    error: failureError
  });
  assert.equal(recoveryObservation.ok, false, `${label}: recovery observation should not close response`);
  assert.equal(
    coreStore.state.transactions[txn.id].phase,
    observationStatus === 'failed' ? 'responseRetryRequired' : 'recoveryRequired',
    `${label}: CORE should enter expected recovery phase`
  );
  const responseAfterRecovery = state.runtimeTracking.responseLedger.find((entry) => entry.id === responseId);
  assert.equal(
    responseAfterRecovery.status,
    observationStatus === 'failed' ? 'responseRetryRequired' : 'unavailable',
    `${label}: old response projection should reflect recovery state`
  );
  const recovery = state.runtimeTracking.recoveryJournal.find((entry) => entry.id === `recovery:host-native:${responseId}`);
  assert.equal(recovery.status, 'open', `${label}: old recovery should start open`);

  const reobserve = await dispatcher.reobserveHostGenerationCompletions({
    campaignState: state
  });
  assert.equal(reobserve.ok, true, `${label}: delayed reobserve should complete`);
  assert.equal(reobserve.completedCount, 1, `${label}: delayed reobserve should count one completion`);
  assert.equal(coreStore.state.transactions[txn.id].phase, 'visibleResponsePosted', `${label}: CORE should close to visible response`);
  assert.equal(coreStore.state.transactions[txn.id].visibleResponseRef.hostMessageId, assistantHostMessageId);
  const responseAfterReobserve = state.runtimeTracking.responseLedger.find((entry) => entry.id === responseId);
  assert.equal(responseAfterReobserve.status, 'complete', `${label}: old response projection should close`);
  assert.equal(responseAfterReobserve.hostObservation.hostMessageId, assistantHostMessageId);
  assert.equal(responseAfterReobserve.hostObservation.textHash, hashStableJson({ text: assistantText }));
  const recoveryAfterReobserve = state.runtimeTracking.recoveryJournal.find((entry) => entry.id === `recovery:host-native:${responseId}`);
  assert.equal(recoveryAfterReobserve.status, 'resolved', `${label}: old recovery should resolve`);
  assert.equal(recoveryAfterReobserve.resolution.reason, 'host-native-response-reobserved');
  assert.equal(JSON.stringify(responseAfterReobserve).includes(assistantText), false, `${label}: old response projection should not persist raw assistant text`);
  const projections = await readCoreStoreProjectionsV2(adapter, { campaignId, saveId });
  const projectedResponse = projections.responseLedger.find((entry) => entry.transactionId === txn.id);
  assert.equal(projectedResponse.hostMessageId, assistantHostMessageId, `${label}: CORE response projection should carry host id`);
  assert.equal(projectedResponse.textHash, hashStableJson({ text: assistantText }), `${label}: CORE response projection should carry hash`);
  const projectedResolution = projections.recoveryJournal.find((entry) => (
    entry.transactionId === txn.id
    && entry.status === 'resolved'
    && entry.reason === 'host-native-response-reobserved'
  ));
  assert.ok(projectedResolution, `${label}: CORE projections should expose response recovery resolution`);
}

await exerciseDelayedRecoveryReobserve({
  label: 'host-native-failed-delayed-reobserve',
  observationStatus: 'failed',
  transactionId: 'txn-response-core-host-native-failed-delayed-reobserve',
  ingressId: 'ingress-response-core-host-native-failed-delayed-reobserve',
  responseId: 'response-core-host-native-failed-delayed-reobserve',
  playerHostMessageId: 'player-core-host-native-failed-delayed-reobserve',
  assistantHostMessageId: 'assistant-core-host-native-failed-delayed-reobserve',
  playerText: 'Sam waited again, letting the bridge find the missing thread.',
  assistantText: 'The host-native answer arrived after the failed callback.',
  failureError: {
    code: 'HOST_GENERATION_FAILED',
    message: 'Synthetic delayed host failure.'
  }
});

await exerciseDelayedRecoveryReobserve({
  label: 'host-native-unavailable-delayed-reobserve',
  observationStatus: 'unavailable',
  transactionId: 'txn-response-core-host-native-unavailable-delayed-reobserve',
  ingressId: 'ingress-response-core-host-native-unavailable-delayed-reobserve',
  responseId: 'response-core-host-native-unavailable-delayed-reobserve',
  playerHostMessageId: 'player-core-host-native-unavailable-delayed-reobserve',
  assistantHostMessageId: 'assistant-core-host-native-unavailable-delayed-reobserve',
  playerText: 'Sam held the question in the quiet until the missing response surfaced.',
  assistantText: 'The host-native answer surfaced after the unavailable observation.'
});

console.log('Response dispatcher CORE bridge tests passed.');
