import assert from 'node:assert/strict';

import {
  assertFrameCleanForSettlement,
  createRangeSourceFrame,
  createSourceToken,
  createTurnSourceFrame,
  derivePromptFrame
} from '../../src/runtime/frame-contracts.mjs';
import {
  createLensPromptScheduler,
  normalizePromptDirtyDomains
} from '../../src/runtime/lens-prompt-scheduler.mjs';
import {
  buildLensPromptPacket,
  createLensPromptInput,
  lensPromptPacketProjectionSummary
} from '../../src/runtime/lens-prompt-packet-builder.mjs';
import {
  createCoreTurnRuntime
} from '../../src/runtime/core-turn-runtime.mjs';
import {
  createRepairCommandBoundary
} from '../../src/runtime/repair-command-boundary.mjs';
import {
  createSourceSettlementService
} from '../../src/runtime/source-settlement-service.mjs';
import {
  createForgeBatchCommit,
  findForgePathConflict,
  normalizeForgeWorkerResult
} from '../../src/jobs/forge-contracts.mjs';
import {
  createForgeCoordinator
} from '../../src/jobs/forge-coordinator.mjs';
import {
  hashStableJson
} from '../../src/runtime/architecture-redesign-contracts.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createFakeCoreStore() {
  const calls = [];
  return {
    calls,
    async beginTurn(sourceFrame, options = {}) {
      calls.push({ method: 'beginTurn', sourceFrame: cloneJson(sourceFrame), options: cloneJson(options) });
      return { id: options.transactionId || 'txn-skeleton', sourceFrameId: sourceFrame.id };
    },
    async advanceTurn(transactionId, phasePatch = {}) {
      calls.push({ method: 'advanceTurn', transactionId, phasePatch: cloneJson(phasePatch) });
      return { id: transactionId, phase: phasePatch.phase || null };
    },
    async commitMechanics(transactionId, bundle = {}) {
      calls.push({ method: 'commitMechanics', transactionId, bundle: cloneJson(bundle) });
      return { id: transactionId, phase: 'mechanicsCommitted' };
    },
    async recordVisibleResponse(transactionId, responseRef = {}) {
      calls.push({ method: 'recordVisibleResponse', transactionId, responseRef: cloneJson(responseRef) });
      return { id: transactionId, phase: 'visibleResponsePosted' };
    },
    async repairVisibleResponseRef(transactionId, responseRef = {}) {
      calls.push({ method: 'repairVisibleResponseRef', transactionId, responseRef: cloneJson(responseRef) });
      return { id: transactionId, phase: 'visibleResponsePosted' };
    },
    async markRecoveryRequired(transactionId, recoveryBundle = {}) {
      calls.push({ method: 'markRecoveryRequired', transactionId, recoveryBundle: cloneJson(recoveryBundle) });
      return { id: recoveryBundle.id || `recovery:${transactionId}`, phase: recoveryBundle.phaseAfter || 'recoveryRequired' };
    },
    async commitBackgroundBatch(transactionId, operationBundle = {}) {
      calls.push({ method: 'commitBackgroundBatch', transactionId, operationBundle: cloneJson(operationBundle) });
      return { id: transactionId, backgroundBatchId: operationBundle.batchId };
    },
    async appendDiagnostics(transactionId, diagnostic = {}) {
      calls.push({ method: 'appendDiagnostics', transactionId, diagnostic: cloneJson(diagnostic) });
      return { id: `diag-${calls.length}`, transactionId, diagnostic: cloneJson(diagnostic) };
    },
    readProjections() {
      calls.push({ method: 'readProjections' });
      return { transactions: [] };
    },
    estimateSize() {
      calls.push({ method: 'estimateSize' });
      return 42;
    }
  };
}

const frame = createTurnSourceFrame({
  campaignId: 'campaign-ashes',
  saveId: 'save-1',
  chatId: 'chat-1',
  hostId: 'sillytavern',
  branchId: 'main',
  hostMessageId: '29',
  text: 'RAW PLAYER TEXT MUST NOT SURFACE',
  textHash: hashStableJson({ text: 'player source' }),
  currentPlayer: {
    hostMessageId: '29',
    role: 'player',
    text: 'RAW PLAYER TEXT MUST NOT SURFACE'
  },
  previousAssistant: {
    hostMessageId: '28',
    selectedSwipeIndex: 1,
    swipeCount: 3,
    selectedTextHash: hashStableJson({ text: 'accepted assistant variant' }),
    text: 'RAW ASSISTANT TEXT MUST NOT SURFACE'
  },
  externalPromptEnvironment: {
    host: 'sillytavern',
    promptKeys: ['summaryception', '3_vectfox'],
    summaryception: {
      installed: true,
      enabled: true,
      promptKeyActive: true,
      rawSummary: 'RAW SUMMARY MUST NOT SURFACE'
    },
    vectFox: {
      installed: true,
      enabled: true,
      promptKeys: ['3_vectfox'],
      vectorPayload: ['RAW VECTOR MUST NOT SURFACE']
    }
  }
});

assert.equal(frame.kind, 'directive.turnSourceFrame.v1');
assert.match(frame.id, /^frame:/);
assert.match(frame.sourceHash, /^[a-f0-9]{64}$/);
assert.equal(createSourceToken(frame), frame.sourceToken);
assert.equal(JSON.stringify(frame).includes('RAW PLAYER TEXT MUST NOT SURFACE'), false);
assert.equal(JSON.stringify(frame).includes('RAW ASSISTANT TEXT MUST NOT SURFACE'), false);
assert.equal(JSON.stringify(frame).includes('RAW SUMMARY MUST NOT SURFACE'), false);
assert.equal(JSON.stringify(frame).includes('RAW VECTOR MUST NOT SURFACE'), false);
const promptFrame = derivePromptFrame(frame);
assert.equal(promptFrame.sourceFrameId, frame.id);
assert.equal(promptFrame.externalPromptEnvironmentRef.hash, frame.externalPromptEnvironmentRef.hash);
assert.equal(assertFrameCleanForSettlement(frame, { campaignId: 'campaign-ashes' }).ok, true);
assert.throws(
  () => assertFrameCleanForSettlement({ ...frame, sourceIntegrity: 'selected-variant-hash-mismatch' }),
  (error) => error?.code === 'DIRECTIVE_FRAME_SOURCE_NOT_CLEAN'
);

const rangeFrame = createRangeSourceFrame([
  { hostMessageId: '1', role: 'player', text: 'range text 1' },
  { hostMessageId: '2', role: 'assistant', textHash: hashStableJson({ text: 'range text 2' }) }
], {
  campaignId: 'campaign-ashes',
  saveId: 'save-1',
  chatId: 'chat-1'
});
const rangeFrameAgain = createRangeSourceFrame([
  { hostMessageId: '1', role: 'player', text: 'range text 1' },
  { hostMessageId: '2', role: 'assistant', textHash: hashStableJson({ text: 'range text 2' }) }
], {
  campaignId: 'campaign-ashes',
  saveId: 'save-1',
  chatId: 'chat-1'
});
assert.equal(rangeFrame.kind, 'directive.rangeSourceFrame.v1');
assert.equal(rangeFrame.rangeHash, rangeFrameAgain.rangeHash);
assert.equal(JSON.stringify(rangeFrame).includes('range text 1'), false);

assert.deepEqual(
  normalizePromptDirtyDomains(['threadLedger', 'questLedger', 'commandBearing', 'factIndex', 'unknownRoot']),
  ['missionQuestThread', 'command', 'continuity']
);
assert.deepEqual(
  normalizePromptDirtyDomains(['relationships', 'crew', 'ship', 'mission', 'commandCulture']),
  ['crewShipRelationship', 'missionQuestThread', 'command']
);

const lensPromptInput = createLensPromptInput({
  campaignState: {
    campaign: { id: 'campaign-ashes', title: 'Ashes of Peace', status: 'active' },
    campaignChatBinding: { chatId: 'chat-1', promptContextRevision: 1 },
    runtimeTracking: { revision: 1 },
    mission: { knownFacts: ['The Breckenridge is underway.'] },
    commandLog: { entries: [] }
  },
  assets: {
    packageData: { id: 'ashes-package', crew: { senior: [] } },
    crewDataset: { officers: [] },
    shipDataset: { id: 'breckenridge' },
    projection: { id: 'ashes-projection' }
  },
  promptFrame: {
    playerText: 'Hold position and ask for a report.',
    recentChatMessages: [{ id: '1', role: 'player', text: 'Hold position.' }],
    scene: { activePhaseId: 'phase-1' }
  },
  createdAt: '2026-06-30T02:00:00.000Z'
});
const lensPacket = await buildLensPromptPacket({
  promptInput: lensPromptInput,
  revision: 7,
  cacheKey: 'cache-key-7',
  dirtyDomains: ['missionQuestThread'],
  externalPromptEnvironmentRef: frame.externalPromptEnvironmentRef
});
assert.equal(lensPacket.kind, 'directive.playerSafePromptContext');
assert.equal(lensPacket.revision, 7);
assert.equal(lensPacket.cacheKey, 'cache-key-7');
assert.deepEqual(lensPacket.lensDirtyDomains, ['missionQuestThread']);
assert.equal(lensPacket.externalPromptEnvironmentRef.hash, frame.externalPromptEnvironmentRef.hash);
const lensPacketSummary = lensPromptPacketProjectionSummary(lensPacket);
assert.equal(lensPacketSummary.revision, 7);
assert.equal(lensPacketSummary.blockCount > 0, true);

const lensCore = createFakeCoreStore();
const installedPackets = [];
const clearedPackets = [];
const lensBuildCalls = [];
const lens = createLensPromptScheduler({
  coreStore: lensCore,
  clock: () => '2026-06-30T02:00:00.000Z',
  buildDirectivePromptPacket: async ({ revision, dirtyDomains, cacheKey, externalPromptEnvironmentRef }) => {
    lensBuildCalls.push({ revision, dirtyDomains, cacheKey, externalPromptEnvironmentRef });
    return {
      kind: 'directive.playerSafePromptContext',
      revision,
      cacheKey,
      rawPromptBody: 'RAW LENS PACKET PROMPT MUST NOT PERSIST',
      rawResponse: 'RAW LENS PACKET RESPONSE MUST NOT PERSIST',
      blocks: [{
        id: 'macro-skeleton',
        promptKey: 'not.directive.key',
        text: `Dirty: ${dirtyDomains.join(',')}`
      }]
    };
  },
  installPromptPacket: async (packet) => {
    installedPackets.push(cloneJson(packet));
    return { ok: true };
  },
  clearPromptPacket: async (options = {}) => {
    clearedPackets.push(cloneJson(options));
    return { ok: true, status: 'cleared' };
  },
  observeExternalPromptEnvironment: async () => ({
    host: 'sillytavern',
    status: 'observed',
    promptKeys: ['summaryception', '3_vectfox'],
    summaryception: {
      installed: true,
      enabled: true,
      promptKeyActive: true,
      rawSummary: 'RAW SUMMARY FROM LENS OBSERVER MUST NOT PERSIST'
    },
    vectFox: {
      installed: true,
      enabled: true,
      promptKeys: ['3_vectfox'],
      vectorPayload: ['RAW VECTOR FROM LENS OBSERVER MUST NOT PERSIST']
    }
  })
});
lens.markDirty({
  lane: 'visible',
  dirtyDomains: ['threadLedger', 'commandBearing'],
  idempotencyKey: 'dirty-1'
});
const lensFlush = await lens.flushVisible({
  transactionId: 'txn-lens',
  binding: { campaignId: 'campaign-ashes' },
  campaignContext: { mechanicsRevision: 1 },
  promptFrame,
  externalPromptEnvironmentRef: frame.externalPromptEnvironmentRef,
  idempotencyKey: 'flush-1'
});
assert.equal(lensFlush.status, 'installed');
assert.equal(lensFlush.rebuilt, true);
assert.equal(lensFlush.appliesTo, 'currentOrNextDirectiveGeneration');
assert.deepEqual(lensFlush.dirtyDomains, ['missionQuestThread', 'command']);
assert.equal(lensFlush.packet.blocks[0].promptKey.startsWith('directive.'), true);
assert.equal(installedPackets.length, 1);
assert.equal(lensBuildCalls.length, 1);
assert.equal(lensBuildCalls[0].externalPromptEnvironmentRef.hash, frame.externalPromptEnvironmentRef.hash);
assert.equal(lensCore.calls.some((call) => call.diagnostic?.cacheRecord?.externalPromptEnvironmentRef?.hash === frame.externalPromptEnvironmentRef.hash), true);
assert.equal(JSON.stringify(lensCore.calls).includes('RAW LENS PACKET PROMPT MUST NOT PERSIST'), false);
assert.equal(JSON.stringify(lensCore.calls).includes('RAW LENS PACKET RESPONSE MUST NOT PERSIST'), false);

lens.markDirty({
  lane: 'visible',
  dirtyDomains: ['threadLedger', 'commandBearing'],
  idempotencyKey: 'dirty-1-repeat'
});
const reusedFlush = await lens.flushVisible({
  transactionId: 'txn-lens',
  binding: { campaignId: 'campaign-ashes' },
  campaignContext: { mechanicsRevision: 1 },
  promptFrame,
  externalPromptEnvironmentRef: frame.externalPromptEnvironmentRef,
  idempotencyKey: 'flush-1-repeat'
});
assert.equal(reusedFlush.status, 'reused');
assert.equal(reusedFlush.rebuilt, false);
assert.equal(installedPackets.length, 1);
assert.equal(lensBuildCalls.length, 1);

lens.markDirty({
  lane: 'visible',
  dirtyDomains: ['factIndex'],
  idempotencyKey: 'dirty-observe-external'
});
const observedFlush = await lens.flushVisible({
  transactionId: 'txn-lens-observe',
  binding: { campaignId: 'campaign-ashes' },
  campaignContext: { mechanicsRevision: 2 },
  promptFrame,
  idempotencyKey: 'flush-observe-external'
});
assert.equal(observedFlush.status, 'installed');
assert.equal(observedFlush.externalPromptEnvironmentRef.knownExternalPromptKeys.includes('summaryception'), true);
assert.equal(observedFlush.externalPromptEnvironmentRef.knownExternalPromptKeys.includes('3_vectfox'), true);
assert.equal(installedPackets.length, 2);
assert.equal(lensBuildCalls.length, 2);
assert.equal(JSON.stringify(lensCore.calls).includes('RAW SUMMARY FROM LENS OBSERVER MUST NOT PERSIST'), false);
assert.equal(JSON.stringify(lensCore.calls).includes('RAW VECTOR FROM LENS OBSERVER MUST NOT PERSIST'), false);
lens.markDirty({
  lane: 'background',
  dirtyDomains: ['continuity'],
  idempotencyKey: 'dirty-background-before-clear'
});
const backgroundBeforeClear = await lens.flushBackground({
  transactionId: 'txn-lens-background-clear',
  binding: { campaignId: 'campaign-ashes' },
  campaignContext: { mechanicsRevision: 3 },
  promptFrame,
  externalPromptEnvironmentRef: frame.externalPromptEnvironmentRef,
  idempotencyKey: 'flush-background-before-clear'
});
assert.equal(backgroundBeforeClear.status, 'installed');
assert.equal(lens.inspect().installed.background.directiveOwnedRevision > 0, true);
const lensSuspend = await lens.suspendDirectivePrompt({
  transactionId: 'txn-lens-suspend',
  lane: 'visible',
  allLanes: true,
  reason: 'unbound-chat'
});
assert.equal(lensSuspend.status, 'suspended');
assert.equal(lensSuspend.lane, 'all');
assert.deepEqual(clearedPackets, [{ lane: 'all', reason: 'unbound-chat', preservePacket: true }]);
assert.equal(lens.inspect().installed.visible.directiveOwnedRevision > 0, true);
assert.equal(lens.inspect().installed.background.directiveOwnedRevision > 0, true);
assert.equal(lens.inspect().suspended.visible.preservePacket, true);
assert.equal(lens.inspect().suspended.background.preservePacket, true);
const lensBuildCallsBeforeResume = lensBuildCalls.length;
const installedPacketsBeforeResume = installedPackets.length;
lens.markDirty({
  lane: 'visible',
  dirtyDomains: ['factIndex'],
  idempotencyKey: 'dirty-resume-suspended'
});
const resumedAfterSuspend = await lens.flushVisible({
  transactionId: 'txn-lens-resume-suspended',
  binding: { campaignId: 'campaign-ashes' },
  campaignContext: { mechanicsRevision: 2 },
  promptFrame,
  externalPromptEnvironmentRef: observedFlush.externalPromptEnvironmentRef,
  idempotencyKey: 'flush-resume-suspended'
});
assert.equal(resumedAfterSuspend.status, 'installed', 'Suspended LENS lanes must reinstall instead of returning a false cache reuse.');
assert.equal(resumedAfterSuspend.rebuilt, true);
assert.equal(lensBuildCalls.length, lensBuildCallsBeforeResume + 1);
assert.equal(installedPackets.length, installedPacketsBeforeResume + 1);
assert.equal(lens.inspect().suspended.visible, undefined);
assert.equal(lens.inspect().suspended.background.preservePacket, true);
assert.equal(lensCore.calls.some((call) => call.diagnostic?.status === 'suspendedDirectivePrompt'), true);
assert.equal(lensCore.calls.some((call) => call.diagnostic?.resumedFromSuspension === true), true);
const lensClear = await lens.clearDirectivePrompt({
  transactionId: 'txn-lens-clear',
  lane: 'visible',
  allLanes: true,
  reason: 'manual-clear'
});
assert.equal(lensClear.status, 'cleared');
assert.equal(lensClear.lane, 'all');
assert.deepEqual(clearedPackets, [
  { lane: 'all', reason: 'unbound-chat', preservePacket: true },
  { lane: 'all', reason: 'manual-clear' }
]);
assert.deepEqual(lens.inspect().installed, {});
assert.deepEqual(lens.inspect().suspended, {});
assert.equal(lensCore.calls.some((call) => call.diagnostic?.status === 'clearedDirectivePrompt'), true);
const failingClearCore = createFakeCoreStore();
const failingClearLens = createLensPromptScheduler({
  coreStore: failingClearCore,
  clock: () => '2026-06-30T02:00:01.000Z',
  clearPromptPacket: async () => ({ ok: false, status: 'failed', reason: 'host-clear-failed' })
});
failingClearLens.markDirty({
  lane: 'visible',
  dirtyDomains: ['command'],
  idempotencyKey: 'dirty-before-failed-clear'
});
const beforeFailedClear = await failingClearLens.flushVisible({
  transactionId: 'txn-lens-clear-failure',
  binding: { campaignId: 'campaign-ashes' },
  campaignContext: { mechanicsRevision: 4 },
  promptFrame,
  idempotencyKey: 'flush-before-failed-clear'
});
assert.equal(beforeFailedClear.status, 'installed');
const failedLensClear = await failingClearLens.clearDirectivePrompt({
  transactionId: 'txn-lens-clear-failure',
  reason: 'manual-clear'
});
assert.equal(failedLensClear.status, 'failed');
assert.equal(failingClearLens.inspect().installed.visible.directiveOwnedRevision, beforeFailedClear.directiveOwnedRevision);
assert.equal(failingClearCore.calls.some((call) => call.diagnostic?.status === 'clearDirectivePromptFailed'), true);
const failingSuspendCore = createFakeCoreStore();
const failedSuspendPackets = [];
const failingSuspendLens = createLensPromptScheduler({
  coreStore: failingSuspendCore,
  clock: () => '2026-06-30T02:00:02.000Z',
  clearPromptPacket: async (options = {}) => {
    failedSuspendPackets.push(cloneJson(options));
    return { ok: false, status: 'failed', reason: 'host-suspend-failed' };
  }
});
failingSuspendLens.markDirty({
  lane: 'visible',
  dirtyDomains: ['command'],
  idempotencyKey: 'dirty-before-failed-suspend'
});
const beforeFailedSuspend = await failingSuspendLens.flushVisible({
  transactionId: 'txn-lens-suspend-failure',
  binding: { campaignId: 'campaign-ashes' },
  campaignContext: { mechanicsRevision: 5 },
  promptFrame,
  idempotencyKey: 'flush-before-failed-suspend'
});
const failedLensSuspend = await failingSuspendLens.suspendDirectivePrompt({
  transactionId: 'txn-lens-suspend-failure',
  reason: 'unbound-chat'
});
assert.equal(failedLensSuspend.status, 'failed');
assert.deepEqual(failedSuspendPackets, [{ lane: 'visible', reason: 'unbound-chat', preservePacket: true }]);
assert.equal(failingSuspendLens.inspect().installed.visible.directiveOwnedRevision, beforeFailedSuspend.directiveOwnedRevision);
assert.deepEqual(failingSuspendLens.inspect().suspended, {});
assert.equal(failingSuspendCore.calls.some((call) => call.diagnostic?.status === 'suspendDirectivePromptFailed'), true);
const diagnosticOnly = await lens.recordDiagnosticOnly({
  transactionId: 'txn-lens',
  payload: {
    rawPrompt: 'RAW PROMPT MUST BE REDACTED',
    apiKey: 'SECRET'
  }
});
assert.equal(diagnosticOnly.dirtyPrompt, false);
assert.equal(JSON.stringify(lensCore.calls).includes('RAW PROMPT MUST BE REDACTED'), false);
assert.equal(JSON.stringify(lensCore.calls).includes('SECRET'), false);

const sourceCore = createFakeCoreStore();
let providerCalled = false;
const sourceSettlement = createSourceSettlementService({
  coreStore: sourceCore,
  runLatestPairProvider: async () => {
    providerCalled = true;
    return { operations: [] };
  }
});
const cleanPreflight = await sourceSettlement.preflightLatestPair({
  transactionId: 'txn-sre-preflight',
  sourceFrame: frame,
  expected: {
    campaignId: 'campaign-ashes',
    saveId: 'save-1',
    chatId: 'chat-1'
  }
});
assert.equal(cleanPreflight.status, 'preflightClean');
assert.equal(cleanPreflight.providerCalled, false);
assert.equal(cleanPreflight.applied, false);
assert.equal(providerCalled, false);
const rangePreflight = await sourceSettlement.preflightRange({
  transactionId: 'txn-sre-range-preflight',
  messages: [{
    hostMessageId: 'range-message-1',
    chatId: 'chat-1',
    role: 'player',
    text: 'RAW RANGE PREFLIGHT TEXT MUST NOT PERSIST'
  }],
  expected: {
    campaignId: 'campaign-ashes',
    saveId: 'save-1',
    chatId: 'other-chat'
  },
  reasons: ['range-preflight-contract']
});
assert.equal(rangePreflight.status, 'hardSkipped');
assert.equal(rangePreflight.providerCalled, false);
assert.equal(rangePreflight.applied, false);
assert.equal(rangePreflight.reasons.includes('wrong-chat'), true);
assert.equal(providerCalled, false);
assert.equal(JSON.stringify(sourceCore.calls).includes('RAW RANGE PREFLIGHT TEXT MUST NOT PERSIST'), false);
const hardSkipped = await sourceSettlement.settleLatestPair({
  transactionId: 'txn-sre',
  sourceFrame: {
    ...frame,
    selectedAssistantVariantHash: 'hash-a'
  },
  expected: {
    selectedAssistantVariantHash: 'hash-b'
  }
});
assert.equal(hardSkipped.status, 'hardSkipped');
assert.equal(hardSkipped.providerCalled, false);
assert.equal(providerCalled, false);
assert.equal(sourceCore.calls.some((call) => call.method === 'appendDiagnostics'), true);

const normalizedWorker = normalizeForgeWorkerResult({
  id: 'continuity',
  roleId: 'continuityProjectionPlanner',
  allowedRoots: ['continuity']
}, {
  rawPrompt: 'RAW FORGE PROMPT',
  rawResponse: 'RAW FORGE RESPONSE',
  operations: [{
    domain: 'continuity',
    op: 'upsertFactHash',
    path: 'continuity.factIndex',
    value: { rawText: 'RAW FACT' }
  }],
  promptDirtyDomains: ['continuity']
});
assert.equal(normalizedWorker.operations.length, 1);
assert.match(normalizedWorker.operations[0].valueHash, /^[a-f0-9]{64}$/);
assert.equal(JSON.stringify(normalizedWorker).includes('RAW FORGE PROMPT'), false);
assert.equal(JSON.stringify(normalizedWorker).includes('RAW FORGE RESPONSE'), false);
assert.equal(JSON.stringify(normalizedWorker).includes('RAW FACT'), false);

const conflict = findForgePathConflict([
  { workerId: 'a', operations: [{ path: 'continuity.factIndex' }] },
  { workerId: 'b', operations: [{ path: 'continuity.factIndex' }] }
]);
assert.equal(conflict.path, 'continuity.factIndex');

const batch = createForgeBatchCommit({
  transactionId: 'txn-forge',
  sourceFrame: frame,
  workerResults: [normalizedWorker],
  idempotencyKey: 'forge-1'
});
assert.equal(batch.kind, 'directive.forgeBatchCommit.v1');
assert.equal(batch.operations.length, 1);
assert.deepEqual(batch.promptDirtyDomains, ['continuity']);

const forgeCore = createFakeCoreStore();
const forgeLens = createLensPromptScheduler({
  clock: () => '2026-06-30T02:01:00.000Z',
  installPromptPacket: async () => ({ ok: true })
});
const forge = createForgeCoordinator({
  coreStore: forgeCore,
  lens: forgeLens,
  isSourceCurrent: async () => ({ ok: true })
});
const forgeResult = await forge.run({
  transactionId: 'txn-forge',
  sourceFrame: frame,
  sourceToken: frame.sourceToken,
  idempotencyKey: 'forge-run-1',
  workers: [{
    id: 'continuity',
    allowedRoots: ['continuity'],
    async run() {
      return {
        operations: [{
          domain: 'continuity',
          op: 'upsertFactHash',
          path: 'continuity.factIndex',
          value: { rawText: 'RAW FORGE VALUE' }
        }],
        promptDirtyDomains: ['continuity'],
        rawPrompt: 'RAW FORGE RUN PROMPT'
      };
    }
  }]
});
assert.equal(forgeResult.status, 'applied');
assert.equal(forgeCore.calls.some((call) => call.method === 'commitBackgroundBatch'), true);
assert.equal(JSON.stringify(forgeCore.calls).includes('RAW FORGE VALUE'), false);
assert.equal(JSON.stringify(forgeCore.calls).includes('RAW FORGE RUN PROMPT'), false);
const forgeReplay = await forge.run({
  transactionId: 'txn-forge',
  sourceFrame: frame,
  sourceToken: frame.sourceToken,
  idempotencyKey: 'forge-run-1',
  workers: [{
    id: 'continuity',
    async run() {
      throw new Error('replay must not run worker');
    }
  }]
});
assert.equal(forgeReplay.status, 'replayed');
let sidecarProviderCalls = 0;
const sidecarExecution = await forge.runProviderBatch({
  transactionId: 'txn-forge-sidecar-provider',
  idempotencyKey: 'forge-sidecar-provider-1',
  sourceToken: frame.sourceToken,
  sourceFrameRef: { id: frame.id, sourceToken: frame.sourceToken },
  upstreamOwner: 'campaignSidecarScheduler',
  jobs: [{
    id: 'sidecar-provider-job-1',
    type: 'continuity',
    roleId: 'continuityTracker',
    source: { campaignId: 'campaign-ashes', saveId: 'save-1', chatId: 'chat-1' },
    snapshot: { campaignState: {}, turnContext: {} },
    request: {
      systemPrompt: 'RAW SIDECAR SYSTEM PROMPT',
      prompt: 'RAW SIDECAR PROVIDER PROMPT',
      maxTokens: 128
    },
    policy: { timeoutMs: 1000, mayProposeState: true }
  }],
  runProviderBatch: async ({ jobs }) => ({
    concurrent: false,
    results: jobs.map((job) => {
      sidecarProviderCalls += 1;
      return {
        id: job.id,
        type: job.type,
        roleId: job.roleId,
        status: 'complete',
        completedAt: '2026-06-29T12:00:00.000Z',
        packet: 'RAW SIDECAR PROVIDER OUTPUT',
        diagnostics: { providerId: 'fake-sidecar-provider', latencyMs: 12 }
      };
    })
  })
});
assert.equal(sidecarExecution.status, 'complete');
assert.equal(sidecarExecution.providerOwner, 'forge');
assert.equal(sidecarExecution.upstreamOwner, 'campaignSidecarScheduler');
assert.equal(sidecarExecution.batch.results[0].packet, 'RAW SIDECAR PROVIDER OUTPUT');
assert.equal(sidecarProviderCalls, 1);
assert.equal(JSON.stringify(forgeCore.calls).includes('RAW SIDECAR PROVIDER PROMPT'), false);
assert.equal(JSON.stringify(forgeCore.calls).includes('RAW SIDECAR PROVIDER OUTPUT'), false);
const sidecarExecutionReplay = await forge.runProviderBatch({
  transactionId: 'txn-forge-sidecar-provider',
  idempotencyKey: 'forge-sidecar-provider-1',
  jobs: [],
  runProviderBatch: async () => {
    throw new Error('sidecar provider replay must not rerun generation');
  }
});
assert.equal(sidecarExecutionReplay.status, 'replayed');
assert.equal(sidecarProviderCalls, 1);
let sidecarFailureCalls = 0;
await assert.rejects(
  forge.runProviderBatch({
    transactionId: 'txn-forge-sidecar-provider-failure',
    idempotencyKey: 'forge-sidecar-provider-failure-1',
    jobs: [],
    runProviderBatch: async () => {
      sidecarFailureCalls += 1;
      const error = new Error('provider failed before packet');
      error.code = 'DIRECTIVE_TEST_PROVIDER_FAILED';
      throw error;
    }
  }),
  /provider failed before packet/
);
const sidecarFailureReplay = await forge.runProviderBatch({
  transactionId: 'txn-forge-sidecar-provider-failure',
  idempotencyKey: 'forge-sidecar-provider-failure-1',
  jobs: [],
  runProviderBatch: async () => {
    throw new Error('failed provider replay must not rerun generation');
  }
});
assert.equal(sidecarFailureReplay.status, 'replayed');
assert.equal(sidecarFailureReplay.originalStatus, 'failed');
assert.equal(sidecarFailureReplay.error.code, 'DIRECTIVE_TEST_PROVIDER_FAILED');
assert.equal(sidecarFailureCalls, 1);
const settledAccepted = await forge.settleAcceptedBatch({
  transactionId: 'txn-forge-sidecar',
  sourceFrame: frame,
  sourceToken: frame.sourceToken,
  idempotencyKey: 'forge-sidecar-settle-1',
  providerOwner: 'campaignSidecarScheduler',
  promptDirtyDomains: ['crew'],
  workerResults: [{
    kind: 'directive.forgeWorkerResult.v1',
    workerId: 'crew',
    status: 'accepted',
    operations: [{
      domain: 'crew',
      op: 'append',
      path: 'crew.casualties',
      valueHash: hashStableJson({ rawText: 'RAW SIDECAR VALUE' }),
      workerId: 'crew'
    }],
    promptDirtyDomains: ['crewShipRelationship']
  }]
});
assert.equal(settledAccepted.status, 'settled');
assert.equal(settledAccepted.providerCallAttempted, false);
assert.equal(settledAccepted.providerOwner, 'campaignSidecarScheduler');
assert.equal(forgeCore.calls.filter((call) => call.method === 'commitBackgroundBatch').length, 2);
assert.equal(JSON.stringify(forgeCore.calls).includes('RAW SIDECAR VALUE'), false);
const settledReplay = await forge.settleAcceptedBatch({
  transactionId: 'txn-forge-sidecar',
  sourceFrame: frame,
  sourceToken: frame.sourceToken,
  idempotencyKey: 'forge-sidecar-settle-1',
  workerResults: []
});
assert.equal(settledReplay.status, 'replayed');
assert.equal(forgeCore.calls.filter((call) => call.method === 'commitBackgroundBatch').length, 2);

const coreStore = createFakeCoreStore();
const coreRuntime = createCoreTurnRuntime({ coreStore });
await coreRuntime.observeSource(frame, { transactionId: 'txn-core' });
await coreRuntime.routePending('txn-core', { route: 'directiveCommit' });
await coreRuntime.releaseHostContinue('txn-core', { strategy: 'injectAndContinue' });
await coreRuntime.commitDirectiveMechanics('txn-core', { operations: [] });
await coreRuntime.recordVisibleResponse('txn-core', { responseKind: 'directivePosted' });
await coreRuntime.openRecovery('txn-core', { reason: 'test' });
await coreRuntime.settleBackgroundBatch('txn-core', { batchId: 'background:test' });
await coreRuntime.appendDiagnostic('txn-core', { type: 'test' });
assert.deepEqual(coreStore.calls.map((call) => call.method), [
  'beginTurn',
  'advanceTurn',
  'advanceTurn',
  'commitMechanics',
  'recordVisibleResponse',
  'markRecoveryRequired',
  'commitBackgroundBatch',
  'appendDiagnostics'
]);
assert.equal(coreStore.calls[1].phasePatch.phase, 'routePending');
assert.equal(coreStore.calls[1].phasePatch.route, 'directiveCommit');
assert.equal(coreStore.calls[2].phasePatch.phase, 'hostContinueReleased');
assert.equal(coreStore.calls[2].phasePatch.strategy, 'injectAndContinue');

const repairCalls = [];
const repairBoundary = createRepairCommandBoundary({
  repairRuntime: {
    recordSourceMutationRecovery(input) {
      repairCalls.push(['source', input]);
      return { status: 'recorded' };
    },
    recordVisibilityMutation(input) {
      repairCalls.push(['visibility', input]);
      return { status: 'diagnosticOnly' };
    },
    recordResponseRecovery(input) {
      repairCalls.push(['response', input]);
      return { status: 'recorded' };
    },
    evaluateResponseRetryActuation(input) {
      repairCalls.push(['retry', input]);
      return { authorized: true };
    },
    evaluateRollbackActuation(input) {
      repairCalls.push(['rollback', input]);
      return { authorized: true };
    },
    evaluateSourceReobserve(input) {
      repairCalls.push(['reobserve', input]);
      return { authorized: true };
    },
    evaluateResponseReobserveClosure(input) {
      repairCalls.push(['closure', input]);
      return { authorized: true };
    }
  }
});
assert.equal(repairBoundary.handleSourceMutation({ eventType: 'messageUpdated' }).status, 'recorded');
assert.equal(repairBoundary.handleVisibilityMutation({ eventType: 'messageUpdated' }).status, 'diagnosticOnly');
assert.equal(repairBoundary.handleResponseFailure({ eventType: 'hostResponsePostFailure' }).status, 'recorded');
assert.equal(repairBoundary.authorizeRetry({ transactionId: 'txn' }).authorized, true);
assert.equal(repairBoundary.authorizeRollback({ transactionId: 'txn' }).authorized, true);
assert.equal(repairBoundary.authorizeRerunBranch({ transactionId: 'txn' }).authorized, true);
assert.equal(repairBoundary.authorizeReobserveClosure({ transactionId: 'txn' }).authorized, true);
assert.equal(repairBoundary.recordResponseRecovery({ eventType: 'hostResponsePostFailure' }).status, 'recorded');
assert.equal(repairBoundary.evaluateResponseRetryActuation({ transactionId: 'txn' }).authorized, true);
assert.equal(repairBoundary.evaluateRollbackActuation({ transactionId: 'txn' }).authorized, true);
assert.equal(repairBoundary.evaluateResponseReobserveClosure({ transactionId: 'txn' }).authorized, true);
assert.deepEqual(repairCalls.map(([name]) => name), [
  'source',
  'visibility',
  'response',
  'retry',
  'rollback',
  'reobserve',
  'closure',
  'response',
  'retry',
  'rollback',
  'closure'
]);

console.log('Architecture redesign system skeleton contract tests passed');
