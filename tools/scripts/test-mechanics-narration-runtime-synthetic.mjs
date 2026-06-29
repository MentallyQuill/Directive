import assert from 'node:assert/strict';

import {
  createSyntheticFastGateRuntime
} from '../../src/runtime/fast-gate-runtime-synthetic.mjs';
import {
  createSyntheticMechanicsNarrationRuntime
} from '../../src/runtime/mechanics-narration-runtime-synthetic.mjs';
import {
  hashStableJson
} from '../../src/runtime/architecture-redesign-contracts.mjs';
import {
  createCoreStoreV2
} from '../../src/storage/core-store-v2.mjs';
import { createLogicalStorageAdapter } from '../../src/storage/logical-storage-adapter.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createLoggingStorage() {
  const files = new Map();
  const writeLog = [];
  return {
    writeLog,
    async readJson(filePath) {
      if (!files.has(filePath)) {
        const error = new Error(`not found: ${filePath}`);
        error.code = 'ENOENT';
        throw error;
      }
      return cloneJson(files.get(filePath));
    },
    async writeJson(filePath, value) {
      const serialized = JSON.stringify(value);
      writeLog.push({
        path: filePath,
        bytes: Buffer.byteLength(serialized, 'utf8')
      });
      files.set(filePath, cloneJson(value));
      return { ok: true, path: filePath };
    },
    async verifyJsonFiles(paths) {
      return Object.fromEntries(paths.map((filePath) => [filePath, files.has(filePath)]));
    }
  };
}

function createHarness({ nowValues = [] } = {}) {
  let tick = 0;
  const storage = createLoggingStorage();
  const adapter = createLogicalStorageAdapter({ storage, hostId: 'fake' });
  const coreStore = createCoreStoreV2({
    adapter,
    campaignId: 'campaign-mechanics-narration',
    saveId: 'save-mechanics-narration',
    now: () => `2026-06-28T17:00:${String(tick++).padStart(2, '0')}.000Z`
  });
  let clockIndex = 0;
  const clock = () => nowValues[clockIndex++] || `2026-06-28T17:01:${String(clockIndex).padStart(2, '0')}.000Z`;
  return { storage, adapter, coreStore, clock };
}

async function createDirectiveCommitTransaction(harness, idSuffix = '1') {
  const fastGate = createSyntheticFastGateRuntime({
    coreStore: harness.coreStore,
    clock: harness.clock,
    deterministicRoute: () => ({
      route: 'directiveCommit',
      reason: 'consequential-command'
    }),
    storageWrites: harness.storage.writeLog
  });
  return fastGate.handleHostEvent({
    frameId: `frame-directive-${idSuffix}`,
    transactionId: `txn-directive-${idSuffix}`,
    campaignId: 'campaign-mechanics-narration',
    saveId: 'save-mechanics-narration',
    chatId: 'ashes-chat',
    hostMessageId: `4${idSuffix}`,
    playerSubmittedAt: `2026-06-28T17:${idSuffix.padStart(2, '0')}:00.000Z`,
    textHash: hashStableJson({ text: `Directive command ${idSuffix}` })
  });
}

const successHarness = createHarness({
  nowValues: [
    '2026-06-28T17:01:01.000Z',
    '2026-06-28T17:01:02.000Z',
    '2026-06-28T17:01:12.000Z',
    '2026-06-28T17:01:55.000Z'
  ]
});
const directiveCommit = await createDirectiveCommitTransaction(successHarness, '1');
assert.equal(directiveCommit.route, 'directiveCommit');
assert.equal(successHarness.coreStore.state.transactions['txn-directive-1'].phase, 'mechanicsPending');

const narrationCalls = [];
const backgroundCalls = [];
const callOrder = [];
const unresolvedCommandLogSidecar = new Promise(() => {});
const successRuntime = createSyntheticMechanicsNarrationRuntime({
  coreStore: successHarness.coreStore,
  clock: successHarness.clock,
  startNarrationGeneration: async (payload) => {
    callOrder.push(`narration-start:${payload.startedAt}`);
    narrationCalls.push(payload);
    return {
      textHash: hashStableJson({ text: 'Directive-owned narration response.' }),
      rawResponse: 'RAW_PROVIDER_NARRATION'
    };
  },
  scheduleBackgroundEffects: (payload) => {
    callOrder.push(`background-scheduled:${payload.afterGenerationStart}`);
    backgroundCalls.push(payload);
    return unresolvedCommandLogSidecar;
  },
  storageWrites: successHarness.storage.writeLog
});

const success = await successRuntime.startDirectiveNarration('txn-directive-1', {
  playerSubmittedAt: '2026-06-28T17:01:00.000Z',
  operationBundle: {
    baseMechanicsRevision: 0,
    idempotencyKey: 'mechanics-directive-1',
    turnId: 'turn-directive-1',
    outcomeId: 'outcome-directive-1',
    summary: 'Sam commits to a bounded action before narration.',
    committedRoots: ['mission', 'commandLog'],
    promptDirtyDomains: ['missionQuestThread'],
    operations: [{
      domain: 'mission',
      op: 'appendLog',
      summary: 'Committed the command decision.',
      rawText: 'RAW_MECHANICS_PAYLOAD'
    }]
  },
  responseRef: {
    responseId: 'response-directive-1',
    hostMessageId: 'assistant-1',
    idempotencyKey: 'response-directive-1'
  },
  providerRequest: {
    sourceToken: 'source-token-directive-1'
  }
});

assert.equal(success.status, 'posted');
assert.equal(success.directiveGenerationStartedAt, '2026-06-28T17:01:12.000Z');
assert.equal(success.visibleResponsePostedAt, '2026-06-28T17:01:55.000Z');
assert.equal(success.latency.generationStartLatencyMs, 12000);
assert.equal(success.latency.providerCompletionLatencyMs, 43000);
assert.equal(success.latency.architectureWithin60s, true);
assert.equal(narrationCalls.length, 1);
assert.equal(backgroundCalls.length, 1);
assert.equal(backgroundCalls[0].afterGenerationStart, true);
assert.deepEqual(callOrder, [
  'background-scheduled:true',
  'narration-start:2026-06-28T17:01:12.000Z'
]);
assert.equal(successHarness.coreStore.state.turns.length, 1);
assert.equal(successHarness.coreStore.state.turns[0].outcomeId, 'outcome-directive-1');
assert.equal(successHarness.coreStore.state.transactions['txn-directive-1'].phase, 'visibleResponsePosted');
assert.deepEqual(successHarness.coreStore.state.events.map((event) => event.type), [
  'turnObserved',
  'phaseAdvanced',
  'phaseAdvanced',
  'mechanicsCommitted',
  'phaseAdvanced',
  'visibleResponseRecorded'
]);
assert.equal(
  successHarness.coreStore.state.events[4].payload.timing.directiveGenerationStartedAt,
  '2026-06-28T17:01:12.000Z'
);
assert.equal(success.storageWrites.fullSaveRewriteCount, 0);
const persistedSuccessState = JSON.stringify(successHarness.coreStore.state);
assert.equal(persistedSuccessState.includes('RAW_PROVIDER_NARRATION'), false);
assert.equal(persistedSuccessState.includes('RAW_MECHANICS_PAYLOAD'), false);
assert.equal(persistedSuccessState.includes('Directive-owned narration response.'), false);
const beforeMechanicsReplayEvents = successHarness.coreStore.state.events.length;
const replayMechanics = await successHarness.coreStore.commitMechanics('txn-directive-1', {
  baseMechanicsRevision: 0,
  idempotencyKey: 'mechanics-directive-1'
});
assert.equal(replayMechanics.outcomeId, 'outcome-directive-1');
assert.equal(successHarness.coreStore.state.turns.length, 1);
assert.equal(successHarness.coreStore.state.events.length, beforeMechanicsReplayEvents);

const replayResponse = await successRuntime.retryDirectiveNarrationResponse('txn-directive-1', {
  outcomeId: 'outcome-directive-1',
  responseId: 'response-directive-1',
  hostMessageId: 'assistant-1',
  idempotencyKey: 'response-directive-1',
  providerResult: {
    textHash: hashStableJson({ text: 'Directive-owned narration response.' })
  },
  generationStartedAt: '2026-06-28T17:01:12.000Z',
  postedAt: '2026-06-28T17:01:55.000Z'
});
assert.deepEqual(replayResponse.visibleResponseRef, success.response.visibleResponseRef);
assert.equal(successHarness.coreStore.state.turns.length, 1, 'response retry must not rerun mechanics');
assert.equal(
  successHarness.coreStore.state.events.filter((event) => event.type === 'visibleResponseRecorded').length,
  1,
  'same response idempotency key should not append a second response'
);

const failureHarness = createHarness({
  nowValues: [
    '2026-06-28T17:02:01.000Z',
    '2026-06-28T17:02:02.000Z',
    '2026-06-28T17:02:09.000Z'
  ]
});
await createDirectiveCommitTransaction(failureHarness, '2');
const failureRuntime = createSyntheticMechanicsNarrationRuntime({
  coreStore: failureHarness.coreStore,
  clock: failureHarness.clock,
  startNarrationGeneration: async () => {
    throw new Error('Narration provider unavailable');
  },
  storageWrites: failureHarness.storage.writeLog
});
const failure = await failureRuntime.startDirectiveNarration('txn-directive-2', {
  playerSubmittedAt: '2026-06-28T17:02:00.000Z',
  operationBundle: {
    baseMechanicsRevision: 0,
    idempotencyKey: 'mechanics-directive-2',
    turnId: 'turn-directive-2',
    outcomeId: 'outcome-directive-2',
    summary: 'Mechanics committed before provider failure.',
    committedRoots: ['mission'],
    operations: [{ domain: 'mission', op: 'appendLog', summary: 'Committed before failure.' }]
  },
  providerRequest: {
    recoveryCaseId: 'response-retry-directive-2'
  }
});
assert.equal(failure.status, 'responseRetryRequired');
assert.equal(failure.directiveGenerationStartedAt, '2026-06-28T17:02:09.000Z');
assert.equal(failure.latency.generationStartLatencyMs, 9000);
assert.equal(failure.latency.providerCompletionLatencyMs, null);
assert.equal(failureHarness.coreStore.state.turns.length, 1, 'provider failure must preserve committed mechanics');
assert.equal(failureHarness.coreStore.state.transactions['txn-directive-2'].phase, 'recoveryRequired');
assert.equal(failureHarness.coreStore.state.transactions['txn-directive-2'].outcomeId, 'outcome-directive-2');
assert.deepEqual(failureHarness.coreStore.state.events.map((event) => event.type), [
  'turnObserved',
  'phaseAdvanced',
  'phaseAdvanced',
  'mechanicsCommitted',
  'phaseAdvanced',
  'recoveryRequired'
]);
assert.equal(
  failureHarness.coreStore.state.events.filter((event) => event.type === 'visibleResponseRecorded').length,
  0
);

assert.equal(
  failureHarness.coreStore.state.events.at(-1).payload.allowedActions.includes('retry-response'),
  true,
  'provider failure must enter a REPAIR-compatible response retry state'
);
await assert.rejects(
  () => failureRuntime.retryDirectiveNarrationResponse('txn-directive-2', {
    outcomeId: 'outcome-directive-2',
    responseId: 'response-directive-2',
    hostMessageId: 'assistant-2',
    idempotencyKey: 'response-directive-2',
    providerResult: {
      textHash: hashStableJson({ text: 'Recovered narration response.' }),
      rawResponse: 'RAW_RECOVERED_PROVIDER_OUTPUT'
    },
    generationStartedAt: '2026-06-28T17:02:40.000Z',
    postedAt: '2026-06-28T17:03:00.000Z'
  }),
  /Invalid CORE transaction phase transition/,
  'REPAIR must explicitly reopen or branch a recovery-required transaction before response retry posts'
);
assert.equal(failureHarness.coreStore.state.turns.length, 1, 'failed-provider recovery must not rerun mechanics');
assert.equal(JSON.stringify(failureHarness.coreStore.state).includes('RAW_RECOVERED_PROVIDER_OUTPUT'), false);

console.log('Mechanics/Narration synthetic runtime tests passed.');
