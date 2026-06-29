import assert from 'node:assert/strict';

import {
  createExternalPromptEnvironmentRef,
  hashStableJson,
  normalizeExternalPromptEnvironment
} from '../../src/runtime/architecture-redesign-contracts.mjs';
import {
  createSyntheticFastGateRuntime
} from '../../src/runtime/fast-gate-runtime-synthetic.mjs';
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
    campaignId: 'campaign-fast-gate',
    saveId: 'save-fast-gate',
    now: () => `2026-06-28T16:00:${String(tick++).padStart(2, '0')}.000Z`
  });
  let clockIndex = 0;
  const clock = () => nowValues[clockIndex++] || `2026-06-28T16:01:${String(clockIndex).padStart(2, '0')}.000Z`;
  return { storage, adapter, coreStore, clock };
}

const externalEnvironment = normalizeExternalPromptEnvironment({
  host: 'sillytavern',
  userHandle: 'directive-soak-a',
  observedAt: '2026-06-28T16:00:00.000Z',
  promptKeys: ['summaryception', '3_vectfox'],
  summaryception: {
    installed: true,
    enabled: true,
    promptKeyActive: true
  },
  vectFox: {
    installed: true,
    enabled: true,
    promptKeys: ['3_vectfox']
  }
});
const externalEnvironmentRef = createExternalPromptEnvironmentRef(externalEnvironment);

const releaseCalls = [];
const scheduledBackground = [];
const pendingBackground = new Promise(() => {});
const hostContinueHarness = createHarness({
  nowValues: [
    '2026-06-28T16:10:01.000Z',
    '2026-06-28T16:10:03.000Z',
    '2026-06-28T16:10:04.000Z'
  ]
});
const hostContinueRuntime = createSyntheticFastGateRuntime({
  coreStore: hostContinueHarness.coreStore,
  clock: hostContinueHarness.clock,
  observeExternalPromptEnvironment: async () => externalEnvironment,
  deterministicRoute: () => ({
    route: 'hostContinue',
    reason: 'routine-host-prose'
  }),
  releaseHostGeneration: async (payload) => {
    releaseCalls.push(payload);
    return { ok: true, releasedAt: payload.releasedAt };
  },
  scheduleBackgroundEffects: (payload) => {
    scheduledBackground.push(payload);
    return pendingBackground;
  },
  storageWrites: hostContinueHarness.storage.writeLog
});

const hostContinue = await hostContinueRuntime.handleHostEvent({
  frameId: 'frame-host-1',
  transactionId: 'txn-host-1',
  ingressId: 'ingress-host-1',
  campaignId: 'campaign-fast-gate',
  saveId: 'save-fast-gate',
  chatId: 'ashes-chat',
  hostMessageId: '33',
  playerSubmittedAt: '2026-06-28T16:10:00.000Z',
  text: 'Sam waited for her reply.',
  acceptedAssistantVariant: {
    hostMessageId: '32',
    swipeIndex: 1,
    textHash: 'assistant-selected-hash'
  },
  directivePromptRevisionUsed: 7
});

assert.equal(hostContinue.route, 'hostContinue');
assert.equal(hostContinue.released, true);
assert.equal(hostContinue.releasedAt, '2026-06-28T16:10:04.000Z');
assert.equal(hostContinue.latency.generationStartLatencyMs, 4000);
assert.equal(hostContinue.latency.architectureWithin60s, true);
assert.equal(hostContinue.latency.providerCompletionLatencyMs, null);
assert.equal(hostContinue.sourceFrame.externalPromptEnvironmentRef.hash, externalEnvironmentRef.hash);
assert.equal(hostContinue.sourceFrame.externalPromptEnvironmentRef.knownExternalPromptKeys.includes('summaryception'), true);
assert.equal(hostContinue.sourceFrame.selectedAssistantVariantHash.length, 64);
assert.equal(JSON.stringify(hostContinue.sourceFrame).includes('Sam waited'), false);
assert.equal(releaseCalls.length, 1);
assert.equal(scheduledBackground.length, 1);
assert.equal(scheduledBackground[0].afterGenerationStart, true);
assert.equal(hostContinue.storageWrites.fullSaveRewriteCount, 0);
assert.equal(hostContinue.storageWrites.beforeGenerationStartCount > 0, true);

const hostContinueState = hostContinueHarness.coreStore.state;
assert.deepEqual(hostContinueState.events.map((event) => event.type), [
  'turnObserved',
  'phaseAdvanced',
  'phaseAdvanced'
]);
assert.equal(hostContinueState.transactions['txn-host-1'].phase, 'hostContinueReleased');
assert.equal(hostContinueState.transactions['txn-host-1'].route, 'hostContinue');
assert.equal(hostContinueState.turns.length, 0, 'hostContinue fast gate must not commit mechanics before release');
assert.equal(
  hostContinueState.events[2].payload.timing.hostGenerationReleasedAt,
  '2026-06-28T16:10:04.000Z'
);
assert.equal(hostContinueState.events[2].payload.directivePromptRevisionUsed, 7);
const persistedFastGateStateBeforeResponse = JSON.stringify(hostContinueState);
assert.equal(persistedFastGateStateBeforeResponse.includes('Sam waited for her reply'), false);
assert.equal(persistedFastGateStateBeforeResponse.includes('Host native assistant response'), false);
assert.equal(persistedFastGateStateBeforeResponse.includes('summaryception'), true, 'external prompt keys may be recorded as keys, not prompt bodies');

const postedHostResponse = await hostContinueRuntime.recordHostVisibleResponse('txn-host-1', {
  responseId: 'response-host-1',
  hostMessageId: '34',
  postedAt: '2026-06-28T16:10:44.000Z',
  textHash: hashStableJson({ text: 'Host native assistant response.' })
});
assert.equal(postedHostResponse.phase, 'visibleResponsePosted');
const replayHostResponse = await hostContinueRuntime.recordHostVisibleResponse('txn-host-1', {
  responseId: 'response-host-1',
  hostMessageId: '34',
  idempotencyKey: 'host-response:txn-host-1:34'
});
assert.deepEqual(replayHostResponse.visibleResponseRef, postedHostResponse.visibleResponseRef);
assert.equal(
  hostContinueHarness.coreStore.state.events.filter((event) => event.type === 'visibleResponseRecorded').length,
  1,
  'host visible response must be exactly-once'
);
assert.deepEqual(hostContinueHarness.coreStore.state.events.map((event) => event.type), [
  'turnObserved',
  'phaseAdvanced',
  'phaseAdvanced',
  'visibleResponseRecorded'
]);
assert.equal(JSON.stringify(hostContinueHarness.coreStore.state).includes('Host native assistant response'), false);

const recoveryHarness = createHarness({
  nowValues: [
    '2026-06-28T16:20:00.000Z',
    '2026-06-28T16:20:01.000Z',
    '2026-06-28T16:20:02.000Z'
  ]
});
let recoveryReleaseCount = 0;
const recoveryRuntime = createSyntheticFastGateRuntime({
  coreStore: recoveryHarness.coreStore,
  clock: recoveryHarness.clock,
  releaseHostGeneration: async () => {
    recoveryReleaseCount += 1;
  },
  deterministicRoute: () => {
    throw new Error('stale source must not reach classifier');
  },
  storageWrites: recoveryHarness.storage.writeLog
});

const recovery = await recoveryRuntime.handleHostEvent({
  frameId: 'frame-recovery-1',
  transactionId: 'txn-recovery-1',
  campaignId: 'campaign-fast-gate',
  saveId: 'save-fast-gate',
  chatId: 'ashes-chat',
  hostMessageId: '35',
  playerSubmittedAt: '2026-06-28T16:20:00.000Z',
  textHash: hashStableJson({ text: 'Edited dependent player row.' }),
  deleted: true,
  visibility: {
    sourceMutation: true,
    sourceMutationReasons: ['host-delete']
  }
});
assert.equal(recovery.route, 'recoveryReview');
assert.equal(recovery.released, false);
assert.equal(recoveryReleaseCount, 0);
assert.equal(recoveryHarness.coreStore.state.transactions['txn-recovery-1'].phase, 'recoveryRequired');
assert.deepEqual(recoveryHarness.coreStore.state.events.map((event) => event.type), [
  'turnObserved',
  'recoveryRequired'
]);
assert.equal(recoveryHarness.coreStore.state.turns.length, 0);

console.log('Fast Gate synthetic runtime tests passed.');
