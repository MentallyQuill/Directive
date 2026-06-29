import assert from 'node:assert/strict';

import {
  createSyntheticFastGateRuntime
} from '../../src/runtime/fast-gate-runtime-synthetic.mjs';
import {
  createSyntheticSourceReconciliationEngine
} from '../../src/runtime/source-reconciliation-engine-synthetic.mjs';
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

function createHarness({ nowPrefix = '2026-06-28T19:00', nowValues = [] } = {}) {
  let tick = 0;
  const storage = createLoggingStorage();
  const adapter = createLogicalStorageAdapter({ storage, hostId: 'fake' });
  const coreStore = createCoreStoreV2({
    adapter,
    campaignId: 'campaign-sre-synthetic',
    saveId: 'save-sre-synthetic',
    now: () => `${nowPrefix}:${String(tick++).padStart(2, '0')}.000Z`
  });
  let clockIndex = 0;
  const clock = () => nowValues[clockIndex++] || `${nowPrefix}:${String(clockIndex + 30).padStart(2, '0')}.000Z`;
  return { storage, adapter, coreStore, clock };
}

async function beginHostContinue(harness, {
  transactionId = 'txn-sre-1',
  frameId = 'frame-sre-1',
  hostMessageId = '33',
  selectedAssistantVariantHash = null,
  visibility = null
} = {}) {
  const fastGate = createSyntheticFastGateRuntime({
    coreStore: harness.coreStore,
    clock: harness.clock,
    deterministicRoute: () => ({ route: 'hostContinue', reason: 'routine-host-prose' }),
    releaseHostGeneration: async () => ({ ok: true }),
    storageWrites: harness.storage.writeLog
  });
  return fastGate.handleHostEvent({
    frameId,
    transactionId,
    campaignId: 'campaign-sre-synthetic',
    saveId: 'save-sre-synthetic',
    chatId: 'ashes-chat',
    hostMessageId,
    playerSubmittedAt: '2026-06-28T19:00:00.000Z',
    textHash: hashStableJson({ text: `Player source row ${hostMessageId}` }),
    selectedAssistantVariantHash,
    visibility
  });
}

const acceptedSelectedHash = hashStableJson({ text: 'Accepted selected assistant source.' });
const visibleUnselectedHash = hashStableJson({ text: 'Visible but unaccepted assistant source.' });
const playerHash = hashStableJson({ text: 'Sam keeps the question anchored in what the bridge can verify.' });

const latestHarness = createHarness({
  nowValues: [
    '2026-06-28T19:01:01.000Z',
    '2026-06-28T19:01:02.000Z',
    '2026-06-28T19:01:04.000Z',
    '2026-06-28T19:01:10.000Z'
  ]
});
const latestGate = await beginHostContinue(latestHarness, {
  transactionId: 'txn-sre-latest-clean',
  frameId: 'frame-sre-latest-clean',
  selectedAssistantVariantHash: acceptedSelectedHash
});
const providerCalls = [];
const applyCalls = [];
const sre = createSyntheticSourceReconciliationEngine({
  coreStore: latestHarness.coreStore,
  clock: latestHarness.clock,
  runLatestPairProvider: async (payload) => {
    providerCalls.push(payload);
    return {
      providerId: 'fake-sre-latest',
      rawPrompt: 'RAW_SRE_PROMPT',
      rawResponse: 'RAW_SRE_RESPONSE',
      operations: [{
        domain: 'commandLog',
        op: 'append',
        summary: 'Accepted selected-source continuity fact.',
        value: { raw: 'RAW_OPERATION_VALUE' }
      }],
      promptDirtyDomains: ['sourceBinding']
    };
  },
  applySettlement: async (payload) => {
    applyCalls.push(payload);
    return { ok: true };
  }
});
const latestResult = await sre.settleLatestPair({
  transactionId: 'txn-sre-latest-clean',
  settlementId: 'settlement-latest-clean',
  sourceFrame: latestGate.sourceFrame,
  expected: {
    campaignId: 'campaign-sre-synthetic',
    saveId: 'save-sre-synthetic',
    chatId: 'ashes-chat',
    selectedAssistantVariantHash: acceptedSelectedHash
  },
  previousAssistant: {
    hostMessageId: '32',
    chatId: 'ashes-chat',
    role: 'assistant',
    visibleTextHash: visibleUnselectedHash,
    selectedTextHash: acceptedSelectedHash,
    selectedSwipeIndex: 1,
    swipeCount: 2,
    sourceIntegrity: 'clean'
  },
  currentPlayer: {
    hostMessageId: '33',
    chatId: 'ashes-chat',
    role: 'player',
    textHash: playerHash
  }
});
assert.equal(latestResult.status, 'accepted');
assert.equal(latestResult.providerCalled, true);
assert.equal(latestResult.applied, true);
assert.equal(providerCalls.length, 1);
assert.equal(applyCalls.length, 1);
assert.equal(providerCalls[0].source.previousAssistant.selectedAssistantVariant.selectedTextHash, acceptedSelectedHash);
assert.equal(providerCalls[0].source.previousAssistant.textHash, acceptedSelectedHash);
assert.equal(providerCalls[0].source.selectedAssistantVariantHash, acceptedSelectedHash);
assert.notEqual(providerCalls[0].source.selectedAssistantVariantHash, visibleUnselectedHash);
assert.equal(latestHarness.coreStore.state.diagnostics.length, 1);
const latestDiagnostic = latestHarness.coreStore.state.diagnostics[0];
assert.equal(latestDiagnostic.type, 'sourceSettlement');
assert.equal(latestDiagnostic.status, 'accepted');
assert.equal(latestDiagnostic.redactedPayload.rawPrompt, '[redacted-raw-payload]');
assert.equal(latestDiagnostic.redactedPayload.rawResponse, '[redacted-raw-payload]');
assert.equal(latestDiagnostic.redactedPayload.source.previousAssistant.selectedAssistantVariant.selectedTextHash, acceptedSelectedHash);
assert.equal(latestDiagnostic.redactedPayload.promptDirtyDomains.includes('sourceBinding'), true);
const persistedLatest = JSON.stringify(latestHarness.coreStore.state);
assert.equal(persistedLatest.includes('Accepted selected assistant source.'), false);
assert.equal(persistedLatest.includes('Visible but unaccepted assistant source.'), false);
assert.equal(persistedLatest.includes('RAW_SRE_PROMPT'), false);
assert.equal(persistedLatest.includes('RAW_SRE_RESPONSE'), false);
assert.equal(persistedLatest.includes('RAW_OPERATION_VALUE'), false);

const beforeReplayDiagnostics = latestHarness.coreStore.state.diagnostics.length;
const latestReplay = await sre.settleLatestPair({
  transactionId: 'txn-sre-latest-clean',
  idempotencyKey: 'sre:replay-clean',
  settlementId: 'settlement-latest-clean',
  sourceFrame: latestGate.sourceFrame,
  expected: {
    campaignId: 'campaign-sre-synthetic',
    saveId: 'save-sre-synthetic',
    chatId: 'ashes-chat',
    selectedAssistantVariantHash: acceptedSelectedHash
  },
  previousAssistant: {
    hostMessageId: '32',
    chatId: 'ashes-chat',
    role: 'assistant',
    selectedTextHash: acceptedSelectedHash,
    sourceIntegrity: 'clean'
  },
  currentPlayer: { hostMessageId: '33', chatId: 'ashes-chat', role: 'player', textHash: playerHash }
});
assert.equal(latestReplay.status, 'accepted');
assert.equal(latestHarness.coreStore.state.diagnostics.length, beforeReplayDiagnostics + 1, 'different idempotency key records a distinct SRE run');
const idempotentReplay = await sre.settleLatestPair({
  transactionId: 'txn-sre-latest-clean',
  idempotencyKey: 'sre:replay-clean',
  settlementId: 'settlement-latest-clean',
  sourceFrame: latestGate.sourceFrame,
  expected: { campaignId: 'campaign-sre-synthetic', saveId: 'save-sre-synthetic', chatId: 'ashes-chat', selectedAssistantVariantHash: acceptedSelectedHash },
  previousAssistant: { hostMessageId: '32', chatId: 'ashes-chat', role: 'assistant', selectedTextHash: acceptedSelectedHash, sourceIntegrity: 'clean' },
  currentPlayer: { hostMessageId: '33', chatId: 'ashes-chat', role: 'player', textHash: playerHash }
});
assert.deepEqual(idempotentReplay, latestReplay);
assert.equal(providerCalls.length, 2);
assert.equal(latestHarness.coreStore.state.diagnostics.length, beforeReplayDiagnostics + 1);

const mismatchHarness = createHarness({ nowPrefix: '2026-06-28T19:10' });
const mismatchGate = await beginHostContinue(mismatchHarness, {
  transactionId: 'txn-sre-mismatch',
  frameId: 'frame-sre-mismatch',
  selectedAssistantVariantHash: acceptedSelectedHash
});
let mismatchProviderCalls = 0;
let mismatchApplyCalls = 0;
const mismatchSre = createSyntheticSourceReconciliationEngine({
  coreStore: mismatchHarness.coreStore,
  runLatestPairProvider: async () => {
    mismatchProviderCalls += 1;
    throw new Error('selected-swipe mismatch must hard-skip before provider');
  },
  applySettlement: async () => {
    mismatchApplyCalls += 1;
  }
});
const mismatch = await mismatchSre.settleLatestPair({
  transactionId: 'txn-sre-mismatch',
  settlementId: 'settlement-mismatch',
  sourceFrame: mismatchGate.sourceFrame,
  expected: {
    campaignId: 'campaign-sre-synthetic',
    saveId: 'save-sre-synthetic',
    chatId: 'ashes-chat',
    selectedAssistantVariantHash: acceptedSelectedHash
  },
  previousAssistant: {
    hostMessageId: '42',
    chatId: 'ashes-chat',
    role: 'assistant',
    selectedTextHash: hashStableJson({ text: 'Different selected swipe.' }),
    sourceIntegrity: 'selected-swipe-mismatch'
  },
  currentPlayer: { hostMessageId: '43', chatId: 'ashes-chat', role: 'player', textHash: playerHash }
});
assert.equal(mismatch.status, 'hardSkipped');
assert.equal(mismatch.providerCalled, false);
assert.equal(mismatch.applied, false);
assert.equal(mismatch.reasons.includes('selected-swipe-mismatch'), true);
assert.equal(mismatch.reasons.includes('selected-variant-hash-mismatch'), true);
assert.equal(mismatchProviderCalls, 0);
assert.equal(mismatchApplyCalls, 0);
assert.equal(mismatchHarness.coreStore.state.diagnostics.at(-1).status, 'hardSkipped');

const wrongSave = await mismatchSre.settleLatestPair({
  transactionId: 'txn-sre-mismatch',
  settlementId: 'settlement-wrong-save',
  sourceFrame: {
    ...mismatchGate.sourceFrame,
    saveId: 'other-save'
  },
  expected: {
    campaignId: 'campaign-sre-synthetic',
    saveId: 'save-sre-synthetic',
    chatId: 'ashes-chat',
    selectedAssistantVariantHash: acceptedSelectedHash
  },
  previousAssistant: { hostMessageId: '42', chatId: 'ashes-chat', role: 'assistant', selectedTextHash: acceptedSelectedHash, sourceIntegrity: 'clean' },
  currentPlayer: { hostMessageId: '43', chatId: 'ashes-chat', role: 'player', textHash: playerHash }
});
assert.equal(wrongSave.status, 'hardSkipped');
assert.equal(wrongSave.reasons.includes('wrong-save'), true);
assert.equal(mismatchProviderCalls, 0);
assert.equal(mismatchApplyCalls, 0);

const repairOwned = await mismatchSre.settleLatestPair({
  transactionId: 'txn-sre-mismatch',
  settlementId: 'settlement-repair-owned',
  sourceFrame: {
    ...mismatchGate.sourceFrame,
    visibility: {
      sourceMutation: true,
      sourceMutationReasons: ['host-delete']
    }
  },
  expected: { campaignId: 'campaign-sre-synthetic', saveId: 'save-sre-synthetic', chatId: 'ashes-chat', selectedAssistantVariantHash: acceptedSelectedHash },
  previousAssistant: { hostMessageId: '42', chatId: 'ashes-chat', role: 'assistant', selectedTextHash: acceptedSelectedHash, sourceIntegrity: 'clean' },
  currentPlayer: { hostMessageId: '43', chatId: 'ashes-chat', role: 'player', textHash: playerHash }
});
assert.equal(repairOwned.status, 'repairRequired');
assert.equal(repairOwned.reasons.includes('source-mutation-owned-by-repair'), true);
assert.equal(mismatchProviderCalls, 0);

const rangeHarness = createHarness({ nowPrefix: '2026-06-28T19:20' });
const rangeGate = await beginHostContinue(rangeHarness, {
  transactionId: 'txn-sre-range',
  frameId: 'frame-sre-range'
});
const rangeMessages = [
  { hostMessageId: '50', chatId: 'ashes-chat', role: 'player', index: 50, textHash: hashStableJson({ text: 'Range player message.' }) },
  { hostMessageId: '51', chatId: 'ashes-chat', role: 'assistant', index: 51, textHash: hashStableJson({ text: 'Range assistant message.' }) },
  { hostMessageId: '52', chatId: 'ashes-chat', role: 'player', index: 52, textHash: hashStableJson({ text: 'Range follow-up.' }) }
];
const rangeProviderCalls = [];
const rangeApplyCalls = [];
let staleBeforeApply = false;
const rangeSre = createSyntheticSourceReconciliationEngine({
  coreStore: rangeHarness.coreStore,
  runRangeProvider: async (payload) => {
    rangeProviderCalls.push(payload);
    return {
      providerId: 'fake-sre-range',
      rawPrompt: 'RAW_RANGE_PROMPT',
      rawResponse: 'RAW_RANGE_RESPONSE',
      operations: [{ domain: 'mission', op: 'set', path: 'mission.phase', value: 'Quiet triage', summary: 'Mission phase noted.' }]
    };
  },
  validateBeforeApply: async () => staleBeforeApply
    ? { ok: false, reasons: ['range-hash-changed-before-apply'] }
    : { ok: true },
  applySettlement: async (payload) => {
    rangeApplyCalls.push(payload);
    return { ok: true };
  }
});
const rangeFrame = rangeSre.composeRangeFrame(rangeMessages, {
  campaignId: 'campaign-sre-synthetic',
  saveId: 'save-sre-synthetic',
  chatId: 'ashes-chat'
});
const rangeAccepted = await rangeSre.reconcileRange({
  transactionId: 'txn-sre-range',
  settlementId: 'settlement-range-clean',
  sourceFrame: rangeGate.sourceFrame,
  rangeFrame,
  messages: rangeMessages,
  expected: { campaignId: 'campaign-sre-synthetic', saveId: 'save-sre-synthetic', chatId: 'ashes-chat' },
  anchorRange: {
    chatId: 'ashes-chat',
    rangeHash: rangeFrame.rangeHash
  }
});
assert.equal(rangeAccepted.status, 'accepted');
assert.equal(rangeAccepted.source.rangeHash, rangeFrame.rangeHash);
assert.equal(rangeProviderCalls.length, 1);
assert.equal(rangeApplyCalls.length, 1);
assert.equal(rangeProviderCalls[0].rangeFrame.rangeHash, rangeFrame.rangeHash);
assert.equal(rangeHarness.coreStore.state.diagnostics.at(-1).redactedPayload.source.messageCount, 3);
assert.equal(JSON.stringify(rangeHarness.coreStore.state).includes('RAW_RANGE_PROMPT'), false);
assert.equal(JSON.stringify(rangeHarness.coreStore.state).includes('Range assistant message'), false);

const drift = await rangeSre.reconcileRange({
  transactionId: 'txn-sre-range',
  settlementId: 'settlement-range-drift',
  sourceFrame: rangeGate.sourceFrame,
  rangeFrame,
  messages: rangeMessages,
  expected: { campaignId: 'campaign-sre-synthetic', saveId: 'save-sre-synthetic', chatId: 'ashes-chat' },
  anchorRange: {
    chatId: 'ashes-chat',
    rangeHash: 'old-range-hash'
  }
});
assert.equal(drift.status, 'hardSkipped');
assert.equal(drift.reasons.includes('range-hash-changed'), true);
assert.equal(rangeProviderCalls.length, 1, 'range hash drift must hard-skip before provider');
assert.equal(rangeApplyCalls.length, 1);

staleBeforeApply = true;
const staleApply = await rangeSre.reconcileRange({
  transactionId: 'txn-sre-range',
  settlementId: 'settlement-range-stale-before-apply',
  sourceFrame: rangeGate.sourceFrame,
  rangeFrame,
  messages: rangeMessages,
  expected: { campaignId: 'campaign-sre-synthetic', saveId: 'save-sre-synthetic', chatId: 'ashes-chat' },
  anchorRange: {
    chatId: 'ashes-chat',
    rangeHash: rangeFrame.rangeHash
  }
});
assert.equal(staleApply.status, 'staleBeforeApply');
assert.equal(staleApply.providerCalled, true);
assert.equal(staleApply.applied, false);
assert.equal(staleApply.reasons.includes('range-hash-changed-before-apply'), true);
assert.equal(rangeProviderCalls.length, 2);
assert.equal(rangeApplyCalls.length, 1, 'stale check before apply must prevent state application');
assert.equal(rangeHarness.coreStore.state.diagnostics.at(-1).status, 'staleBeforeApply');

console.log('SRE synthetic runtime tests passed.');
