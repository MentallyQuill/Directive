import assert from 'node:assert/strict';

import {
  createTurnSourceFrameContract,
  hashStableJson
} from '../../src/runtime/architecture-redesign-contracts.mjs';
import {
  createCoreStoreV2,
  loadCoreStoreStateV2,
  readCoreStoreProjectionsV2
} from '../../src/storage/core-store-v2.mjs';
import { createLogicalStorageAdapter } from '../../src/storage/logical-storage-adapter.mjs';
import {
  loadV2SaveManifest,
  readV2ArtifactRef,
  readV2Segment
} from '../../src/storage/transaction-store-v2.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createLoggingStorage() {
  const files = new Map();
  const writeLog = [];
  return {
    writeLog,
    snapshot() {
      return Object.fromEntries([...files.entries()].map(([key, value]) => [key, cloneJson(value)]));
    },
    async readJson(filePath) {
      if (!files.has(filePath)) {
        const error = new Error(`not found: ${filePath}`);
        error.code = 'ENOENT';
        throw error;
      }
      return cloneJson(files.get(filePath));
    },
    async writeJson(filePath, value) {
      writeLog.push(filePath);
      files.set(filePath, cloneJson(value));
      return { ok: true, path: filePath };
    },
    async verifyJsonFiles(paths) {
      return Object.fromEntries(paths.map((filePath) => [filePath, files.has(filePath)]));
    }
  };
}

let tick = 0;
const storage = createLoggingStorage();
const adapter = createLogicalStorageAdapter({ storage, hostId: 'fake' });
const coreStore = createCoreStoreV2({
  adapter,
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  now: () => `2026-06-28T15:00:${String(tick++).padStart(2, '0')}.000Z`
});

const sourceFrame = createTurnSourceFrameContract({
  id: 'frame-29',
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  chatId: 'ashes-chat',
  hostMessageId: '29',
  textHash: hashStableJson({ text: 'Sam waited for her reply.' }),
  createdAt: '2026-06-28T15:00:00.000Z'
});

const transaction = await coreStore.beginTurn(sourceFrame, {
  transactionId: 'txn-29',
  ingressId: 'ingress-29',
  idempotencyKey: 'begin-29'
});
assert.equal(transaction.phase, 'observed');
assert.equal(transaction.revisions.runtime, 1);
const duplicateBegin = await coreStore.beginTurn(sourceFrame, {
  transactionId: 'txn-29',
  ingressId: 'ingress-29',
  idempotencyKey: 'begin-29'
});
assert.equal(duplicateBegin.revisions.runtime, 1, 'same beginTurn idempotency key should replay without advancing revisions');
await assert.rejects(
  () => coreStore.advanceTurn(transaction.id, { phase: 'settled' }),
  /Invalid CORE transaction phase transition/
);

await coreStore.advanceTurn(transaction.id, {
  phase: 'routePending',
  route: 'directiveCommit',
  reason: 'consequential-command',
  idempotencyKey: 'advance-29'
});
const beforeAdvanceReplayEvents = coreStore.state.events.length;
const replayAdvance = await coreStore.advanceTurn(transaction.id, {
  phase: 'routePending',
  route: 'directiveCommit',
  reason: 'consequential-command',
  idempotencyKey: 'advance-29'
});
assert.equal(replayAdvance.phase, 'routePending', 'same advance idempotency key should replay current transaction');
assert.equal(coreStore.state.events.length, beforeAdvanceReplayEvents, 'same advance idempotency key must not append another event');
await assert.rejects(
  () => coreStore.commitMechanics(transaction.id, {
    baseMechanicsRevision: 99,
    operations: [{ domain: 'mission', op: 'appendLog' }]
  }),
  /Stale CORE mechanics base revision/
);
const mechanics = await coreStore.commitMechanics(transaction.id, {
  baseMechanicsRevision: 0,
  idempotencyKey: 'mechanics-29',
  turnId: 'turn-29',
  outcomeId: 'outcome-29',
  summary: 'Sam frames the tactical risk without overruling the bridge.',
  committedRoots: ['mission', 'commandLog'],
  promptDirtyDomains: ['missionQuestThread'],
  operations: [
    {
      domain: 'mission',
      op: 'appendLog',
      summary: 'Clarified the bridge decision under pressure.',
      sourceKind: 'directive.openWorldReducerBundle.v1',
      sourceHash: 'open-world-reducer-source-hash',
      operationCount: 1,
      changedRoots: ['worldState'],
      rawText: 'RAW_MECHANICS_TEXT'
    }
  ]
});
assert.equal(mechanics.outcomeId, 'outcome-29');
assert.equal(mechanics.operationCount, 1);
assert.equal(coreStore.state.revisions.prompt, 0, 'CORE must emit dirty domains without owning prompt revision');
const replayMechanics = await coreStore.commitMechanics(transaction.id, {
  baseMechanicsRevision: 0,
  idempotencyKey: 'mechanics-29',
  turnId: 'turn-29',
  outcomeId: 'outcome-29'
});
assert.equal(replayMechanics.id, mechanics.id, 'same mechanics idempotency key should replay the committed turn');

const beforeDiagnosticsMechanicsRevision = coreStore.state.revisions.mechanics;
const beforeDiagnosticsRuntimeRevision = coreStore.state.revisions.runtime;
const beforeDiagnosticsPromptRevision = coreStore.state.revisions.prompt;
const beforeDiagnosticsHeadWrites = storage.writeLog.filter((key) => key.endsWith('/head.v2.json')).length;
const beforeDiagnosticsPromptWrites = storage.writeLog.filter((key) => key.endsWith('/prompt-cache.v2.json')).length;
const beforeDiagnosticsEventWrites = storage.writeLog.filter((key) => key.includes('/events/')).length;
const beforeDiagnosticsTurnWrites = storage.writeLog.filter((key) => key.includes('/turns/')).length;
const modelDiagnostic = await coreStore.appendDiagnostics(transaction.id, {
  type: 'modelCall',
  roleId: 'utilityTurnClassifier',
  status: 'ok',
  latencyMs: 950,
  promptText: 'RAW_PROVIDER_PROMPT',
  responseSnapshot: 'RAW_PROVIDER_RESPONSE',
  apiKey: 'SECRET-API-KEY',
  requestHash: 'request-hash-1'
});
assert.equal(coreStore.state.revisions.mechanics, beforeDiagnosticsMechanicsRevision, 'diagnostics must not advance mechanics revision');
assert.equal(coreStore.state.revisions.runtime, beforeDiagnosticsRuntimeRevision, 'diagnostics must not advance runtime revision');
assert.equal(coreStore.state.revisions.prompt, beforeDiagnosticsPromptRevision, 'diagnostics must not advance prompt revision');
assert.equal(storage.writeLog.filter((key) => key.endsWith('/head.v2.json')).length, beforeDiagnosticsHeadWrites, 'diagnostics-only append must not rewrite head');
assert.equal(storage.writeLog.filter((key) => key.endsWith('/prompt-cache.v2.json')).length, beforeDiagnosticsPromptWrites, 'diagnostics-only append must not rewrite prompt cache');
assert.equal(storage.writeLog.filter((key) => key.includes('/events/')).length, beforeDiagnosticsEventWrites, 'diagnostics-only append must not rewrite event segments');
assert.equal(storage.writeLog.filter((key) => key.includes('/turns/')).length, beforeDiagnosticsTurnWrites, 'diagnostics-only append must not rewrite turn segments');
assert.equal(modelDiagnostic.kind, 'directive.coreDiagnostic.v1');
assert.equal(modelDiagnostic.redactedPayload.promptText, '[redacted-raw-payload]');
assert.equal(modelDiagnostic.redactedPayload.responseSnapshot, '[redacted-raw-payload]');
assert.equal(modelDiagnostic.redactedPayload.apiKey, '[redacted-secret]');

const postedResponse = await coreStore.recordVisibleResponse(transaction.id, {
  idempotencyKey: 'response-30-key',
  responseId: 'response-30',
  hostMessageId: '30',
  outcomeId: 'outcome-29',
  responseKind: 'directiveNarration',
  directiveGenerationStartedAt: '2026-06-28T15:00:40.000Z',
  generationStartedAt: '2026-06-28T15:00:40.000Z',
  postedAt: '2026-06-28T15:01:45.000Z',
  turnLatency: {
    playerSubmittedAt: '2026-06-28T15:00:00.000Z',
    turnObservedAt: '2026-06-28T15:00:00.000Z',
    routeDecidedAt: '2026-06-28T15:00:40.000Z',
    directiveGenerationStartedAt: '2026-06-28T15:00:40.000Z',
    visibleResponsePostedAt: '2026-06-28T15:01:45.000Z'
  },
  rawResponse: 'RAW_RESPONSE_TEXT'
});
const beforeResponseReplayEvents = coreStore.state.events.length;
const replayResponse = await coreStore.recordVisibleResponse(transaction.id, {
  idempotencyKey: 'response-30-key',
  responseId: 'response-30',
  hostMessageId: '30',
  outcomeId: 'outcome-29',
  responseKind: 'directiveNarration'
});
assert.deepEqual(replayResponse.visibleResponseRef, postedResponse.visibleResponseRef, 'same response idempotency key should replay visible response');
assert.equal(coreStore.state.events.length, beforeResponseReplayEvents, 'same response replay must not append another event');
await assert.rejects(
  () => coreStore.recordVisibleResponse(transaction.id, {
    idempotencyKey: 'response-30-other-key',
    responseId: 'response-31',
    hostMessageId: '31',
    outcomeId: 'outcome-29',
    responseKind: 'directiveNarration'
  }),
  /already has a visible response/
);
await coreStore.commitBackgroundBatch(transaction.id, {
  idempotencyKey: 'terminal-checkpoint-posted-29-key',
  batchId: 'terminal-checkpoint:txn-29:terminalOutcomeCheckpointPosted:terminal-decision-29',
  phaseAfter: 'backgroundSettling',
  outcomeId: 'outcome-29',
  backgroundEffectRefs: [
    {
      effect: 'terminalOutcomeCheckpointPosted',
      status: 'posted',
      interactionId: 'terminal-decision-29',
      outcomeId: 'outcome-29',
      turnId: 'turn-29',
      ingressId: 'ingress-29',
      hostMessageId: '29',
      checkpointHostMessageId: '30-checkpoint',
      rawCheckpointText: 'RAW_TERMINAL_CHECKPOINT_TEXT'
    }
  ],
  workers: [
    {
      worker: 'terminalOutcomeCheckpoint',
      sidecarType: 'terminalOutcomeCheckpoint',
      status: 'posted',
      interactionId: 'terminal-decision-29',
      outcomeId: 'outcome-29',
      checkpointHostMessageId: '30-checkpoint'
    }
  ]
});
await coreStore.commitBackgroundBatch(transaction.id, {
  baseMechanicsRevision: 1,
  idempotencyKey: 'forge-29-key',
  batchId: 'forge-29',
  phaseAfter: 'backgroundSettling',
  sourceToken: 'turnSourceFrame:frame-29',
  sourceFrameRef: {
    kind: 'directive.turnSourceFrameRef.v1',
    schemaVersion: 1,
    id: 'frame-29',
    campaignId: 'campaign-core-v2',
    saveId: 'save-core-v2',
    chatId: 'ashes-chat',
    hostMessageId: '29',
    textHash: 'source-text-hash-29',
    selectedAssistantVariantHash: 'selected-assistant-hash-29',
    rawPlayerText: 'RAW_BACKGROUND_SOURCE_FRAME_TEXT'
  },
  promptDirtyDomains: ['continuity'],
  operations: [
    {
      domain: 'continuity',
      op: 'upsertFactHash',
      factHash: 'fact-hash-1'
    }
  ],
  workers: [
    {
      worker: 'continuity',
      status: 'applied',
      sourceToken: 'source-token-29'
    }
  ]
});
await coreStore.commitBackgroundBatch(transaction.id, {
  idempotencyKey: 'command-log-summary-29-key',
  batchId: 'command-log-summary-29',
  phaseAfter: 'settled',
  outcomeId: 'outcome-29',
  backgroundEffectRefs: [
    {
      effect: 'commandLogAssistedSummary',
      status: 'applied',
      outcomeId: 'outcome-29',
      assistedSummaryHash: 'summary-hash-29',
      rawSummary: 'RAW_COMMAND_LOG_BACKGROUND_SUMMARY'
    }
  ],
  workers: [
    {
      worker: 'commandLogSummary',
      sidecarType: 'commandLogSummary',
      status: 'applied',
      outcomeId: 'outcome-29',
      assistedSummaryHash: 'summary-hash-29'
    }
  ]
});
const replayBackgroundBatchEvents = coreStore.state.events.filter((event) => event.type === 'backgroundBatchCommitted').length;
await coreStore.commitBackgroundBatch(transaction.id, {
  idempotencyKey: 'command-log-summary-29-key',
  batchId: 'command-log-summary-29',
  phaseAfter: 'settled',
  outcomeId: 'outcome-29'
});
assert.equal(
  coreStore.state.events.filter((event) => event.type === 'backgroundBatchCommitted').length,
  replayBackgroundBatchEvents,
  'same background idempotency key must replay without appending another event'
);
await coreStore.appendDiagnostics(transaction.id, {
  type: 'sidecar',
  worker: 'continuity',
  status: 'applied',
  rawPromptBody: 'RAW_SIDECAR_PROMPT',
  rawResponse: 'RAW_REGULAR_SIDECAR_RESPONSE'
});
await coreStore.appendDiagnostics(transaction.id, {
  type: 'sidecar',
  worker: 'commandLogSummary',
  sidecarType: 'commandLogSummary',
  status: 'applied',
  outcomeId: 'outcome-29',
  rawSummary: 'RAW_COMMAND_LOG_SUMMARY_TEXT',
  rawPromptBody: 'RAW_COMMAND_LOG_SUMMARY_PROMPT'
});

const recoveryFrame = createTurnSourceFrameContract({
  id: 'frame-31',
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  chatId: 'ashes-chat',
  hostMessageId: '31',
  textHash: hashStableJson({ text: 'Edited dependent row.' }),
  createdAt: '2026-06-28T15:00:31.000Z'
});
const recoveryTransaction = await coreStore.beginTurn(recoveryFrame, {
  transactionId: 'txn-31',
  ingressId: 'ingress-31',
  idempotencyKey: 'begin-31'
});
await coreStore.markRecoveryRequired(recoveryTransaction.id, {
  id: 'recovery-31',
  reason: 'dependent-player-edit',
  status: 'required',
  idempotencyKey: 'recovery-31-key',
  rawText: 'RAW_EDITED_PLAYER_TEXT'
});

const retryFrame = createTurnSourceFrameContract({
  id: 'frame-32',
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  chatId: 'ashes-chat',
  hostMessageId: '32',
  textHash: hashStableJson({ text: 'Retry the visible response.' }),
  createdAt: '2026-06-28T15:00:32.000Z'
});
const retryTransaction = await coreStore.beginTurn(retryFrame, {
  transactionId: 'txn-32',
  ingressId: 'ingress-32',
  idempotencyKey: 'begin-32'
});
await coreStore.advanceTurn(retryTransaction.id, {
  phase: 'routePending',
  route: 'directiveCommit',
  reason: 'retryable-response-test',
  idempotencyKey: 'advance-32'
});
const responseRetryCase = await coreStore.markRecoveryRequired(retryTransaction.id, {
  id: 'recovery-32',
  reason: 'host-response-post-failure',
  responseRetry: true,
  repairDecision: {
    kind: 'directive.repairResponseRecoveryDecision.v1',
    eventType: 'hostResponsePostFailure',
    policySource: 'core-store-sentinel',
    responseStatus: 'responseRetryRequired',
    phaseAfter: 'responseRetryRequired',
    normalTurnAllowed: false
  },
  allowedActions: ['retryResponse'],
  idempotencyKey: 'recovery-32-key',
  rawText: 'RAW_FAILED_RESPONSE_TEXT'
});
assert.equal(responseRetryCase.status, 'required');
assert.equal(coreStore.state.transactions[retryTransaction.id].phase, 'responseRetryRequired');
const retriedResponse = await coreStore.recordVisibleResponse(retryTransaction.id, {
  idempotencyKey: 'response-32-key',
  responseId: 'response-32',
  hostMessageId: '33',
  outcomeId: 'outcome-32',
  responseKind: 'directiveNarration'
});
assert.equal(retriedResponse.phase, 'visibleResponsePosted', 'response retry phase must allow recording the eventual visible response');
const beforeRetryReplayEvents = coreStore.state.events.length;
await coreStore.recordVisibleResponse(retryTransaction.id, {
  idempotencyKey: 'response-32-key',
  responseId: 'response-32',
  hostMessageId: '33',
  outcomeId: 'outcome-32',
  responseKind: 'directiveNarration'
});
assert.equal(coreStore.state.events.length, beforeRetryReplayEvents, 'response retry replay must not append another visible-response event');
await assert.rejects(
  () => coreStore.recordVisibleResponse(recoveryTransaction.id, {
    idempotencyKey: 'response-31-key',
    responseId: 'response-31',
    hostMessageId: '34',
    outcomeId: 'outcome-31',
    responseKind: 'directiveNarration'
  }),
  (error) => error?.code === 'DIRECTIVE_CORE_RECOVERY_VISIBLE_RESPONSE_UNAUTHORIZED',
  'generic recoveryRequired remains terminal for visible responses'
);

const unavailableClosureFrame = createTurnSourceFrameContract({
  id: 'frame-36',
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  chatId: 'ashes-chat',
  hostMessageId: '36',
  textHash: hashStableJson({ text: 'A host-native response was unavailable, then reobserved.' }),
  createdAt: '2026-06-28T15:00:36.000Z'
});
const unavailableClosureTransaction = await coreStore.beginTurn(unavailableClosureFrame, {
  transactionId: 'txn-36',
  ingressId: 'ingress-36',
  idempotencyKey: 'begin-36'
});
await coreStore.advanceTurn(unavailableClosureTransaction.id, {
  phase: 'routePending',
  route: 'hostContinue',
  reason: 'host-native-unavailable-reobserve-closure-route',
  idempotencyKey: 'advance-36-route'
});
await coreStore.advanceTurn(unavailableClosureTransaction.id, {
  phase: 'hostContinueReleased',
  route: 'hostContinue',
  reason: 'host-native-unavailable-reobserve-closure-release',
  idempotencyKey: 'advance-36-release'
});
await coreStore.markRecoveryRequired(unavailableClosureTransaction.id, {
  id: 'recovery-36',
  reason: 'hostNativeAssistantUnavailable',
  phaseAfter: 'recoveryRequired',
  responseRetry: false,
  repairDecision: {
    kind: 'directive.repairResponseRecoveryDecision.v1',
    eventType: 'hostNativeAssistantUnavailable',
    responseStatus: 'unavailable',
    allowedActions: ['reobserveHostAssistantRows', 'reviewHostNativeAvailability'],
    normalTurnAllowed: false
  },
  allowedActions: ['reobserveHostAssistantRows', 'reviewHostNativeAvailability'],
  idempotencyKey: 'recovery-36-key'
});
assert.equal(coreStore.state.transactions[unavailableClosureTransaction.id].phase, 'recoveryRequired');
const unavailableClosureHash = hashStableJson({ text: 'The host-native row was reobserved safely.' });
const unavailableClosure = await coreStore.recordVisibleResponse(unavailableClosureTransaction.id, {
  idempotencyKey: 'response-36-key',
  responseId: 'response-36',
  hostMessageId: '37',
  outcomeId: 'outcome-36',
  responseKind: 'hostContinue',
  textHash: unavailableClosureHash,
  repairDecision: {
    kind: 'directive.repairResponseReobserveClosureDecision.v1',
    authorized: true,
    action: 'recordVisibleResponse',
    reason: 'host-native-response-reobserved',
    eventType: 'hostNativeAssistantUnavailable',
    recoveryCaseId: 'recovery-36',
    recoveryId: 'recovery-36',
    allowedActions: ['reobserveHostAssistantRows', 'reviewHostNativeAvailability'],
    recoveryResolved: true
  }
});
assert.equal(unavailableClosure.phase, 'visibleResponsePosted', 'authorized unavailable reobserve should close as visible response');
assert.equal(coreStore.state.transactions[unavailableClosureTransaction.id].recoveryCaseId, null);
const unavailableClosureProjection = await readCoreStoreProjectionsV2(adapter, {
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2'
});
const unavailableClosureRecovery = unavailableClosureProjection.recoveryJournal.find((entry) => (
  entry.transactionId === unavailableClosureTransaction.id
  && entry.status === 'resolved'
));
assert.equal(unavailableClosureRecovery.reason, 'host-native-response-reobserved');
assert.equal(unavailableClosureRecovery.hostMessageId, '37');
assert.equal(unavailableClosureRecovery.textHash, unavailableClosureHash);

const hostNativeRepairFrame = createTurnSourceFrameContract({
  id: 'frame-35',
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  chatId: 'ashes-chat',
  hostMessageId: '35',
  textHash: hashStableJson({ text: 'A host-native continuation is observed after background settlement.' }),
  createdAt: '2026-06-28T15:00:35.000Z'
});
const hostNativeRepairTransaction = await coreStore.beginTurn(hostNativeRepairFrame, {
  transactionId: 'txn-35',
  ingressId: 'ingress-35',
  idempotencyKey: 'begin-35'
});
await coreStore.advanceTurn(hostNativeRepairTransaction.id, {
  phase: 'routePending',
  route: 'hostContinue',
  reason: 'host-native-missing-hash-repair-test',
  idempotencyKey: 'advance-35-route'
});
await coreStore.advanceTurn(hostNativeRepairTransaction.id, {
  phase: 'hostContinueReleased',
  route: 'hostContinue',
  reason: 'host-native-released-before-background',
  idempotencyKey: 'advance-35-release'
});
await coreStore.commitBackgroundBatch(hostNativeRepairTransaction.id, {
  batchId: 'background-before-visible-35',
  idempotencyKey: 'background-before-visible-35',
  outcomeId: 'outcome-35',
  operations: [],
  workers: [{ workerKey: 'diagnostic', status: 'noChange' }]
});
assert.equal(coreStore.state.transactions[hostNativeRepairTransaction.id].phase, 'backgroundSettling');
await coreStore.recordVisibleResponse(hostNativeRepairTransaction.id, {
  idempotencyKey: 'response-35-key',
  responseId: 'response-35',
  hostMessageId: '36',
  responseKind: 'hostContinue',
  hostGenerationReleasedAt: '2026-06-28T15:00:35.000Z',
  postedAt: '2026-06-28T15:00:45.000Z'
});
assert.equal(coreStore.state.transactions[hostNativeRepairTransaction.id].visibleResponseRef.textHash, null);
const repairedHostNativeHash = hashStableJson({ text: 'Host-native row text was recovered later.' });
await coreStore.repairVisibleResponseRef(hostNativeRepairTransaction.id, {
  hostMessageId: '36',
  textHash: repairedHostNativeHash,
  reason: 'test-missing-host-native-text-hash',
  idempotencyKey: 'repair-response-35-hash'
});
assert.equal(coreStore.state.transactions[hostNativeRepairTransaction.id].visibleResponseRef.textHash, repairedHostNativeHash);
const repairedProjection = await readCoreStoreProjectionsV2(adapter, {
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2'
});
const repairedProjectionResponse = repairedProjection.responseLedger.find((entry) => entry.transactionId === hostNativeRepairTransaction.id);
assert.equal(repairedProjectionResponse.textHash, repairedHostNativeHash);

const settledRecoveryFrame = createTurnSourceFrameContract({
  id: 'frame-34',
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  chatId: 'ashes-chat',
  hostMessageId: '34',
  textHash: hashStableJson({ text: 'A source row that was already settled is edited.' }),
  createdAt: '2026-06-28T15:00:34.000Z'
});
const settledRecoveryTransaction = await coreStore.beginTurn(settledRecoveryFrame, {
  transactionId: 'txn-34',
  ingressId: 'ingress-34',
  idempotencyKey: 'begin-34'
});
await coreStore.advanceTurn(settledRecoveryTransaction.id, {
  phase: 'routePending',
  route: 'directiveCommit',
  reason: 'settled-source-mutation-test',
  idempotencyKey: 'settled-recovery-route-34'
});
await coreStore.advanceTurn(settledRecoveryTransaction.id, {
  phase: 'settled',
  route: 'directiveCommit',
  reason: 'settled-before-source-mutation-test',
  idempotencyKey: 'settled-before-recovery-34'
});
const settledRecoveryCase = await coreStore.markRecoveryRequired(settledRecoveryTransaction.id, {
  id: 'recovery-34',
  reason: 'playerMessageEdited',
  sourceMutation: {
    kind: 'directive.sourceMutation.v1',
    sourceKind: 'playerIngress',
    eventType: 'playerMessageEdited',
    hostMessageId: '34',
    ingressId: 'ingress-34',
    outcomeId: 'outcome-34',
    responseId: 'response-34',
    sourceFrameId: 'frame-34',
    replacementText: 'edited settled source raw text that must not persist',
    replacementTextHash: hashStableJson({ text: 'edited settled source' }),
    replacementTextPresent: true,
    preOutcomeRevision: 42,
    rawPlayerText: 'RAW_SETTLED_SOURCE_EDIT'
  },
  repairDecision: {
    kind: 'directive.repairDecision.v1',
    eventType: 'playerMessageEdited',
    sourceKind: 'playerIngress',
    transactionId: 'txn-34',
    sourceMutation: true,
    action: 'reviewRequired',
    normalTurnAllowed: false
  },
  dependentOutcomeId: 'outcome-34',
  dependentResponseId: 'response-34',
  allowedActions: ['reviewSourceMutation'],
  idempotencyKey: 'recovery-34-key'
});
assert.equal(settledRecoveryCase.phase, 'recoveryRequired');
assert.equal(coreStore.state.transactions[settledRecoveryTransaction.id].phase, 'recoveryRequired');

const terminalResolutionFrame = createTurnSourceFrameContract({
  id: 'frame-33',
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  chatId: 'ashes-chat',
  hostMessageId: '33',
  textHash: hashStableJson({ text: 'Push on from the terminal checkpoint.' }),
  createdAt: '2026-06-28T15:00:33.000Z'
});
const terminalResolutionTransaction = await coreStore.beginTurn(terminalResolutionFrame, {
  transactionId: 'txn-33',
  ingressId: 'ingress-33',
  idempotencyKey: 'begin-33'
});
await coreStore.advanceTurn(terminalResolutionTransaction.id, {
  phase: 'routePending',
  route: 'terminalCheckpointResolution',
  reason: 'terminal-checkpoint-resolution-test',
  idempotencyKey: 'terminal-resolution-route-33'
});
await coreStore.commitBackgroundBatch(terminalResolutionTransaction.id, {
  idempotencyKey: 'terminal-checkpoint-resolved-33-key',
  batchId: 'terminal-checkpoint:txn-33:terminalOutcomeCheckpointResolved:terminal-decision-29',
  phaseAfter: 'settled',
  outcomeId: 'outcome-29',
  backgroundEffectRefs: [
    {
      effect: 'terminalOutcomeCheckpointResolved',
      status: 'resolved',
      interactionId: 'terminal-decision-29',
      action: 'pushOn',
      outcomeId: 'outcome-29',
      ingressId: 'ingress-33',
      resolutionIngressId: 'ingress-33',
      resolutionHostMessageId: '33',
      rawPlayerText: 'RAW_TERMINAL_RESOLUTION_TEXT'
    }
  ],
  workers: [
    {
      worker: 'terminalOutcomeCheckpoint',
      sidecarType: 'terminalOutcomeCheckpoint',
      status: 'resolved',
      interactionId: 'terminal-decision-29',
      action: 'pushOn',
      outcomeId: 'outcome-29',
      ingressId: 'ingress-33',
      resolutionIngressId: 'ingress-33',
      resolutionHostMessageId: '33'
    }
  ]
});

const restartPriorFrame = createTurnSourceFrameContract({
  id: 'frame-restart-prior',
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  chatId: 'ashes-chat',
  hostMessageId: '37',
  textHash: hashStableJson({ text: 'Prior latest row before edit.' }),
  createdAt: '2026-06-28T15:00:37.000Z'
});
const restartPriorTransaction = await coreStore.beginTurn(restartPriorFrame, {
  transactionId: 'txn-restart-prior',
  ingressId: 'ingress-restart-prior',
  idempotencyKey: 'begin-restart-prior'
});
const restartReplacementFrame = createTurnSourceFrameContract({
  id: 'frame-restart-replacement',
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  chatId: 'ashes-chat',
  hostMessageId: '37',
  textHash: hashStableJson({ text: 'Edited latest row without a dependent response.' }),
  createdAt: '2026-06-28T15:00:38.000Z'
});
const restartReplacementTransaction = await coreStore.beginTurn(restartReplacementFrame, {
  transactionId: 'txn-restart-replacement',
  ingressId: 'ingress-restart-replacement',
  idempotencyKey: 'begin-restart-replacement'
});
await assert.rejects(
  () => coreStore.supersedeLatestSourceTransaction(transaction.id, restartReplacementTransaction.id, {
    idempotencyKey: 'restart-after-visible-key'
  }),
  /cannot restart after mechanics or visible response/
);
const restartResult = await coreStore.supersedeLatestSourceTransaction(restartPriorTransaction.id, restartReplacementTransaction.id, {
  priorRecoveryId: 'recovery-restart-prior',
  reason: 'latest-source-reobserved',
  idempotencyKey: 'restart-prior-to-replacement-key',
  repairDecision: {
    kind: 'directive.repairSourceReobserveDecision.v1',
    action: 'restartLatestSource',
    rawPlayerText: 'RAW_RESTART_PLAYER_TEXT'
  },
  sourceMutation: {
    kind: 'directive.sourceMutation.v1',
    sourceKind: 'playerIngress',
    eventType: 'playerMessageReobserved',
    hostMessageId: '37',
    ingressId: 'ingress-restart-prior',
    sourceFrameId: 'frame-restart-prior',
    replacementIngressId: 'ingress-restart-replacement',
    replacementSourceFrameId: 'frame-restart-replacement',
    replacementText: 'RAW_RESTART_REPLACEMENT_TEXT'
  }
});
assert.equal(restartResult.status, 'recorded');
assert.equal(restartResult.priorTransaction.phase, 'restartSuperseded');
assert.equal(restartResult.transaction.phase, 'observed');
assert.equal(restartResult.sourceRestart.priorTransactionId, 'txn-restart-prior');
assert.equal(restartResult.sourceRestart.newTransactionId, 'txn-restart-replacement');
assert.equal(restartResult.sourceRestart.recoveryId, 'recovery-restart-prior');
assert.equal(coreStore.state.transactions['txn-restart-prior'].restartedByTransactionId, 'txn-restart-replacement');
assert.equal(coreStore.state.transactions['txn-restart-replacement'].restartedFromTransactionId, 'txn-restart-prior');
assert.equal(JSON.stringify(coreStore.state).includes('RAW_RESTART_PLAYER_TEXT'), false, 'CORE source restart refs must not retain raw player text.');
assert.equal(JSON.stringify(coreStore.state).includes('RAW_RESTART_REPLACEMENT_TEXT'), false, 'CORE source restart mutations must not retain raw replacement text.');
const restartEventCount = coreStore.state.events.filter((event) => event.type === 'latestSourceRestarted').length;
const replayRestartResult = await coreStore.supersedeLatestSourceTransaction(restartPriorTransaction.id, restartReplacementTransaction.id, {
  priorRecoveryId: 'recovery-restart-prior',
  reason: 'latest-source-reobserved',
  idempotencyKey: 'restart-prior-to-replacement-key'
});
assert.equal(replayRestartResult.transaction.id, 'txn-restart-replacement');
assert.equal(
  coreStore.state.events.filter((event) => event.type === 'latestSourceRestarted').length,
  restartEventCount,
  'source restart idempotency must not append another latestSourceRestarted event'
);
await assert.rejects(
  () => coreStore.supersedeLatestSourceTransaction(restartPriorTransaction.id, restartReplacementTransaction.id, {
    idempotencyKey: 'restart-prior-to-replacement-other-key'
  }),
  /already has a source restart/
);

const projections = coreStore.readProjections();
assert.equal(projections.ingressLedger.length, 9);
assert.equal(projections.ingressLedger.find((entry) => entry.transactionId === 'txn-29').status, 'settled');
assert.equal(projections.ingressLedger.find((entry) => entry.transactionId === 'txn-31').status, 'recoveryRequired');
assert.equal(projections.ingressLedger.find((entry) => entry.transactionId === 'txn-32').status, 'complete');
assert.equal(projections.ingressLedger.find((entry) => entry.transactionId === 'txn-33').status, 'settled');
assert.equal(projections.ingressLedger.find((entry) => entry.transactionId === 'txn-34').status, 'recoveryRequired');
assert.equal(projections.ingressLedger.find((entry) => entry.transactionId === 'txn-35').status, 'complete');
assert.equal(projections.ingressLedger.find((entry) => entry.transactionId === 'txn-36').status, 'complete');
const restartPriorProjection = projections.ingressLedger.find((entry) => entry.transactionId === 'txn-restart-prior');
const restartReplacementProjection = projections.ingressLedger.find((entry) => entry.transactionId === 'txn-restart-replacement');
assert.equal(restartPriorProjection.status, 'restartSuperseded');
assert.equal(restartPriorProjection.restartedByTransactionId, 'txn-restart-replacement');
assert.equal(restartPriorProjection.sourceRestart.reason, 'latest-source-reobserved');
assert.equal(restartReplacementProjection.status, 'pending');
assert.equal(restartReplacementProjection.restartedFromTransactionId, 'txn-restart-prior');
assert.equal(restartReplacementProjection.sourceRestart.priorIngressId, 'ingress-restart-prior');
assert.equal(projections.responseLedger.length, 4);
assert.equal(projections.responseLedger[0].hostMessageId, '30');
assert.equal(projections.responseLedger[0].generationStartedAt, '2026-06-28T15:00:40.000Z');
assert.equal(projections.responseLedger[0].turnTiming.architectureWithin60s, true);
assert.equal(projections.responseLedger[0].turnTiming.generationStartLatencyMs, 40000);
assert.equal(projections.responseLedger.find((entry) => entry.transactionId === 'txn-35').textHash, repairedHostNativeHash);
assert.equal(projections.responseLedger.find((entry) => entry.transactionId === 'txn-36').textHash, unavailableClosureHash);
const directiveTurnTiming = projections.turnTiming.find((entry) => entry.transactionId === 'txn-29');
assert.ok(directiveTurnTiming, 'CORE projections should expose persisted generation-start timing for live proof');
assert.equal(directiveTurnTiming.route, 'directiveCommit');
assert.equal(directiveTurnTiming.turnTiming.directiveGenerationStartedAt, Date.parse('2026-06-28T15:00:40.000Z'));
assert.equal(directiveTurnTiming.turnTiming.visibleResponsePostedAt, Date.parse('2026-06-28T15:01:45.000Z'));
assert.equal(directiveTurnTiming.turnTiming.generationStartLatencyMs, 40000);
assert.equal(directiveTurnTiming.turnTiming.providerCompletionLatencyMs, 65000);
assert.equal(directiveTurnTiming.turnTiming.architectureWithin60s, true);
assert.equal(projections.turnLedger.entries.length, 1);
assert.equal(projections.turnLedger.lastCommittedOutcomeId, 'outcome-29');
assert.equal(projections.recoveryJournal.length, 6);
assert.equal(projections.recoveryJournal[0].id, 'recovery-31');
const responseRetryProjection = projections.recoveryJournal.find((entry) => entry.id === 'recovery-32');
assert.equal(responseRetryProjection.phase, 'responseRetryRequired');
assert.deepEqual(responseRetryProjection.allowedActions, ['retryResponse']);
assert.equal(responseRetryProjection.repairDecision.kind, 'directive.repairResponseRecoveryDecision.v1');
assert.equal(responseRetryProjection.repairDecision.policySource, 'core-store-sentinel');
const unavailableRecoveryRequiredProjection = projections.recoveryJournal.find((entry) => (
  entry.id === 'recovery-36'
  && entry.status === 'required'
));
assert.equal(unavailableRecoveryRequiredProjection.phase, 'recoveryRequired');
assert.deepEqual(unavailableRecoveryRequiredProjection.allowedActions, ['reobserveHostAssistantRows', 'reviewHostNativeAvailability']);
const unavailableRecoveryResolvedProjection = projections.recoveryJournal.find((entry) => (
  entry.id === 'recovery-36'
  && entry.status === 'resolved'
));
assert.equal(unavailableRecoveryResolvedProjection.phase, 'visibleResponsePosted');
assert.equal(unavailableRecoveryResolvedProjection.reason, 'host-native-response-reobserved');
assert.equal(unavailableRecoveryResolvedProjection.hostMessageId, '37');
const sourceMutationRecoveryProjection = projections.recoveryJournal.find((entry) => entry.id === 'recovery-34');
assert.equal(sourceMutationRecoveryProjection.reason, 'playerMessageEdited');
assert.equal(sourceMutationRecoveryProjection.sourceMutation.kind, 'directive.sourceMutation.v1');
assert.equal(sourceMutationRecoveryProjection.sourceMutation.sourceKind, 'playerIngress');
assert.equal(sourceMutationRecoveryProjection.sourceMutation.sourceFrameId, 'frame-34');
assert.equal(sourceMutationRecoveryProjection.sourceMutation.replacementTextHash.length, 64);
assert.equal(sourceMutationRecoveryProjection.sourceMutation.replacementTextPresent, true);
assert.equal('replacementText' in sourceMutationRecoveryProjection.sourceMutation, false);
assert.equal(sourceMutationRecoveryProjection.sourceMutation.rawPlayerText, '[redacted-raw-payload]');
assert.equal(sourceMutationRecoveryProjection.repairDecision.kind, 'directive.repairDecision.v1');
assert.equal(sourceMutationRecoveryProjection.repairDecision.action, 'reviewRequired');
assert.equal(sourceMutationRecoveryProjection.repairDecision.normalTurnAllowed, false);
assert.equal(sourceMutationRecoveryProjection.dependentOutcomeId, 'outcome-34');
assert.equal(sourceMutationRecoveryProjection.dependentResponseId, 'response-34');
assert.deepEqual(sourceMutationRecoveryProjection.allowedActions, ['reviewSourceMutation']);
assert.equal(JSON.stringify(sourceMutationRecoveryProjection).includes('RAW_SETTLED_SOURCE_EDIT'), false);
assert.equal(JSON.stringify(sourceMutationRecoveryProjection).includes('edited settled source raw text'), false);
const restartRecoveryProjection = projections.recoveryJournal.find((entry) => entry.id === 'recovery-restart-prior');
assert.equal(restartRecoveryProjection.status, 'resolved');
assert.equal(restartRecoveryProjection.phase, 'restartSuperseded');
assert.equal(restartRecoveryProjection.replacementTransactionId, 'txn-restart-replacement');
assert.equal(restartRecoveryProjection.replacementIngressId, 'ingress-restart-replacement');
assert.equal(restartRecoveryProjection.sourceMutation.replacementTextHash.length, 64);
assert.equal(JSON.stringify(restartRecoveryProjection).includes('RAW_RESTART_REPLACEMENT_TEXT'), false);
assert.equal(projections.modelCallDiagnostics.length, 1);
assert.equal(projections.modelCallDiagnostics[0].promptText, '[redacted-raw-payload]');
assert.equal(projections.backgroundBatches.length, 5);
const forgeBackgroundBatch = projections.backgroundBatches.find((entry) => entry.batchId === 'forge-29');
assert.ok(forgeBackgroundBatch);
assert.equal(forgeBackgroundBatch.transactionId, 'txn-29');
assert.equal(forgeBackgroundBatch.operationCount, 1);
assert.equal(forgeBackgroundBatch.workerCount, 1);
const commandLogBackgroundBatch = projections.backgroundBatches.find((entry) => entry.batchId === 'command-log-summary-29');
assert.ok(commandLogBackgroundBatch);
assert.equal(commandLogBackgroundBatch.transactionId, 'txn-29');
assert.equal(commandLogBackgroundBatch.operationCount, 0);
assert.equal(commandLogBackgroundBatch.workerCount, 1);
const terminalCheckpointBackgroundBatches = projections.backgroundBatches.filter((entry) => String(entry.batchId || '').startsWith('terminal-checkpoint:'));
assert.equal(terminalCheckpointBackgroundBatches.length, 2);
assert.equal(terminalCheckpointBackgroundBatches.every((entry) => entry.operationCount === 0), true, 'Terminal checkpoint settlement must not create mechanics operations.');
assert.equal(terminalCheckpointBackgroundBatches.every((entry) => entry.workerCount === 1), true, 'Terminal checkpoint settlement must identify one terminal worker/control effect.');
assert.equal(terminalCheckpointBackgroundBatches.some((entry) => entry.transactionId === 'txn-33'), true, 'Terminal resolution ingress must settle its own CORE transaction.');
assert.equal(projections.sidecarDiagnostics.length, 7);
assert.equal(projections.sidecarDiagnostics.some((entry) => entry.worker === 'continuity'), true);
assert.equal(projections.sidecarDiagnostics.filter((entry) => entry.worker === 'terminalOutcomeCheckpoint').length, 2);
assert.equal(JSON.stringify(projections.sidecarDiagnostics).includes('RAW_TERMINAL_CHECKPOINT_TEXT'), false);
assert.equal(JSON.stringify(projections.sidecarDiagnostics).includes('RAW_TERMINAL_RESOLUTION_TEXT'), false);
assert.equal(JSON.stringify(coreStore.state.events).includes('RAW_TERMINAL_CHECKPOINT_TEXT'), false);
assert.equal(JSON.stringify(coreStore.state.events).includes('RAW_TERMINAL_RESOLUTION_TEXT'), false);
const continuityDiagnostic = projections.sidecarDiagnostics.find((entry) => entry.worker === 'continuity');
assert.equal(continuityDiagnostic.rawResponse, '[redacted-raw-payload]');
assert.equal(JSON.stringify(projections.sidecarDiagnostics).includes('RAW_REGULAR_SIDECAR_RESPONSE'), false);
const commandLogSummaryDiagnostic = projections.sidecarDiagnostics.find((entry) => entry.worker === 'commandLogSummary');
assert.ok(commandLogSummaryDiagnostic);
assert.equal(commandLogSummaryDiagnostic.rawSummary, '[redacted-raw-payload]');
assert.equal(commandLogSummaryDiagnostic.rawPromptBody, '[redacted-raw-payload]');
assert.equal(projections.sidecarDiagnostics.some((entry) => entry.worker === 'commandLogSummary' && entry.assistedSummaryHash === 'summary-hash-29'), true);
assert.equal(JSON.stringify(projections.sidecarDiagnostics).includes('RAW_COMMAND_LOG_SUMMARY_TEXT'), false);
assert.equal(JSON.stringify(projections.sidecarDiagnostics).includes('RAW_COMMAND_LOG_BACKGROUND_SUMMARY'), false);
const persistedProjections = await readCoreStoreProjectionsV2(adapter, {
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2'
});
assert.equal(persistedProjections.ingressLedger.length, projections.ingressLedger.length, 'persisted projection loader should derive ingress from segments');
assert.equal(
  persistedProjections.ingressLedger.find((entry) => entry.transactionId === 'txn-restart-prior').status,
  'restartSuperseded',
  'persisted projection loader should preserve prior restart status'
);
assert.equal(
  persistedProjections.ingressLedger.find((entry) => entry.transactionId === 'txn-restart-replacement').restartedFromTransactionId,
  'txn-restart-prior',
  'persisted projection loader should preserve replacement source-restart link'
);
assert.equal(persistedProjections.responseLedger.length, projections.responseLedger.length, 'persisted projection loader should derive responses from segments');
assert.equal(persistedProjections.turnTiming.length, projections.turnTiming.length, 'persisted projection loader should derive generation-start timing from segments');
assert.equal(
  persistedProjections.turnTiming.find((entry) => entry.transactionId === 'txn-29').turnTiming.generationStartLatencyMs,
  40000,
  'persisted projection timing should preserve submit-to-generation-start latency'
);
assert.equal(persistedProjections.turnLedger.entries.length, projections.turnLedger.entries.length, 'persisted projection loader should derive turns from segments');
assert.equal(persistedProjections.recoveryJournal.length, projections.recoveryJournal.length, 'persisted projection loader should derive recovery from segments');
assert.equal(
  persistedProjections.recoveryJournal.find((entry) => entry.id === 'recovery-restart-prior').replacementTransactionId,
  'txn-restart-replacement',
  'persisted projection loader should preserve source-restart recovery resolution'
);
assert.equal(
  persistedProjections.recoveryJournal.find((entry) => entry.id === 'recovery-34').sourceMutation.sourceKind,
  'playerIngress',
  'persisted projection loader should preserve sanitized source-mutation recovery details'
);
assert.equal(persistedProjections.backgroundBatches.length, projections.backgroundBatches.length, 'persisted projection loader should derive background batches from segments');
const hydratedState = await loadCoreStoreStateV2(adapter, {
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2'
});
const hydratedCoreStore = createCoreStoreV2({
  adapter,
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  now: () => `2026-06-28T15:01:${String(tick++).padStart(2, '0')}.000Z`,
  initialState: hydratedState
});
const hydratedProjections = hydratedCoreStore.readProjections();
assert.equal(hydratedProjections.ingressLedger.length, projections.ingressLedger.length, 'hydrated CORE Store should preserve ingress projections');
assert.equal(
  hydratedProjections.ingressLedger.find((entry) => entry.transactionId === 'txn-restart-prior').restartedByTransactionId,
  'txn-restart-replacement',
  'hydrated CORE Store should preserve prior source-restart link'
);
assert.equal(
  hydratedProjections.ingressLedger.find((entry) => entry.transactionId === 'txn-restart-replacement').sourceRestart.priorTransactionId,
  'txn-restart-prior',
  'hydrated CORE Store should preserve replacement source-restart ref'
);
assert.equal(hydratedProjections.responseLedger.length, projections.responseLedger.length, 'hydrated CORE Store should preserve response projections');
assert.equal(hydratedProjections.turnTiming.length, projections.turnTiming.length, 'hydrated CORE Store should preserve timing projections');
assert.equal(hydratedCoreStore.state.events.length, coreStore.state.events.length, 'hydrated CORE Store should preserve event segments');

const head = await coreStore.loadHead();
assert.equal(head.coreStore.counters.transactions, 9);
assert.equal(head.coreStore.counters.diagnostics, 3);
assert.equal(head.coreStore.revisions.diagnostic, 3);
assert.equal(head.coreStore.revisions.mechanics, 2, 'mechanics should advance for mechanics commit plus background operation only');
assert.equal(head.coreStore.revisions.prompt, 0, 'CORE head must not advance prompt revision');
assert.equal(head.coreStore.promptDirtyDomains.includes('missionQuestThread'), true);
assert.equal(head.coreStore.promptDirtyDomains.includes('continuity'), true);

const saveManifest = await loadV2SaveManifest(adapter, {
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  layout: 'core'
});
assert.equal(saveManifest.layout, 'core');
assert.equal(saveManifest.eventSegments.length, 1);
assert.equal(saveManifest.turnSegments.length, 1);
assert.equal(saveManifest.diagnosticsSegments.length >= 1, true);
const eventSegment = await readV2Segment(adapter, {
  segmentType: 'event',
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  segmentId: '0000',
  layout: 'core'
});
assert.equal(eventSegment.entries.every((entry) => entry.kind === 'directive.coreEvent.v1'), true);
assert.deepEqual(eventSegment.entries.map((entry) => entry.sequence), eventSegment.entries.map((_, index) => index + 1));
assert.equal(eventSegment.entries.every((entry) => entry.txnId && entry.sourceFrameId && entry.occurredAt), true);
assert.equal(eventSegment.entries.every((entry) => !('transactionId' in entry)), true);
assert.equal(eventSegment.entries.every((entry) => entry.revisionsBefore && entry.revisionsAfter), true);
assert.equal(eventSegment.entries.some((entry) => entry.type === 'turnObserved'), true);
assert.equal(eventSegment.entries.some((entry) => entry.type === 'phaseAdvanced'), true);
assert.equal(eventSegment.entries.some((entry) => entry.type === 'mechanicsCommitted'), true);
const forgeBackgroundEvent = eventSegment.entries.find((entry) => entry.type === 'backgroundBatchCommitted' && entry.payload?.operationBundle?.batchId === 'forge-29');
assert.ok(forgeBackgroundEvent, 'CORE background event should retain the FORGE batch ref.');
assert.equal(forgeBackgroundEvent.payload.operationBundle.sourceToken, 'turnSourceFrame:frame-29');
assert.equal(forgeBackgroundEvent.payload.operationBundle.sourceFrameRef.id, 'frame-29');
assert.equal(forgeBackgroundEvent.payload.operationBundle.sourceFrameRef.textHash, 'source-text-hash-29');
assert.equal(JSON.stringify(forgeBackgroundEvent).includes('RAW_BACKGROUND_SOURCE_FRAME_TEXT'), false);
const mechanicsEvent = eventSegment.entries.find((entry) => entry.type === 'mechanicsCommitted');
const compactMechanicsOperation = mechanicsEvent.payload.operationBundle.operations.find((operation) => operation.sourceKind === 'directive.openWorldReducerBundle.v1');
assert.ok(compactMechanicsOperation, 'CORE mechanics event should retain redacted reducer-bundle operation metadata');
assert.equal(compactMechanicsOperation.sourceHash, 'open-world-reducer-source-hash');
assert.equal(compactMechanicsOperation.operationCount, 1);
assert.deepEqual(compactMechanicsOperation.changedRoots, ['worldState']);
assert.equal(JSON.stringify(compactMechanicsOperation).includes('RAW_MECHANICS_TEXT'), false);
assert.equal(eventSegment.entries.some((entry) => entry.type === 'visibleResponseRecorded'), true);
assert.equal(eventSegment.entries.some((entry) => entry.type === 'visibleResponseRefRepaired'), true);
assert.equal(eventSegment.entries.some((entry) => entry.type === 'recoveryRequired'), true);
assert.equal(eventSegment.entries.some((entry) => entry.type === 'latestSourceRestarted'), true);
const settledRecoveryEvent = eventSegment.entries.find((entry) => entry.type === 'recoveryRequired' && entry.payload?.recoveryCase?.id === 'recovery-34');
assert.ok(settledRecoveryEvent, 'Settled source mutations should reopen the CORE transaction into recoveryRequired.');
assert.equal(settledRecoveryEvent.payload.sourceMutation.sourceKind, 'playerIngress');
assert.equal(settledRecoveryEvent.payload.sourceMutation.replacementTextHash.length, 64);
assert.equal(JSON.stringify(settledRecoveryEvent).includes('RAW_SETTLED_SOURCE_EDIT'), false);
const diagnosticSegment = await readV2Segment(adapter, {
  segmentType: 'diagnostics',
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  segmentId: '0000',
  layout: 'core'
});
const diagnosticEntries = (await Promise.all(saveManifest.diagnosticsSegments.map((ref) => readV2ArtifactRef(adapter, ref))))
  .flatMap((segment) => segment.entries || []);
assert.equal(diagnosticEntries.length, 3);
assert.equal(diagnosticSegment.entries.every((entry) => entry.kind === 'directive.coreDiagnostic.v1'), true);
assert.equal(diagnosticEntries.every((entry) => entry.redactedPayload && entry.sourceHash), true);
const hostMap = await readV2ArtifactRef(adapter, saveManifest.hostMap);
assert.equal(hostMap.excludesRawChatText, true);
assert.equal(hostMap.rows.some((row) => 'text' in row || 'mes' in row || 'rawText' in row || 'raw' in row), false);

assert.equal(storage.writeLog.some((key) => /^saves\/.+\.v1\.json$/.test(key)), false, 'CORE Store v2 must not write old full-save records');
assert.equal(storage.writeLog.some((key) => key === 'campaigns/campaign-core-v2/saves/save-core-v2/head.v2.json'), false, 'CORE Store v2 must not write active-save head path');
assert.equal(storage.writeLog.some((key) => key === 'campaigns/campaign-core-v2/saves/save-core-v2/save-manifest.v2.json'), false, 'CORE Store v2 must not write active-save manifest path');
assert.equal(storage.writeLog.some((key) => key.startsWith('campaigns/campaign-core-v2/saves/save-core-v2/core/')), true, 'CORE Store v2 writes the CORE namespace');
const serializedStorage = JSON.stringify(storage.snapshot());
for (const marker of [
  'payload":{"campaignState"',
  'rootsSet',
  'runtimeTracking',
  'snapshotBefore',
  'RAW_PROVIDER_PROMPT',
  'RAW_PROVIDER_RESPONSE',
  'RAW_MECHANICS_TEXT',
  'RAW_RESPONSE_TEXT',
  'RAW_SIDECAR_PROMPT',
  'RAW_REGULAR_SIDECAR_RESPONSE',
  'RAW_COMMAND_LOG_SUMMARY_TEXT',
  'RAW_COMMAND_LOG_SUMMARY_PROMPT',
  'RAW_COMMAND_LOG_BACKGROUND_SUMMARY',
  'RAW_BACKGROUND_SOURCE_FRAME_TEXT',
  'RAW_EDITED_PLAYER_TEXT',
  'RAW_SETTLED_SOURCE_EDIT',
  'SECRET-API-KEY'
]) {
  assert.equal(serializedStorage.includes(marker), false, `CORE Store v2 artifacts must not include ${marker}`);
}

assert.equal(coreStore.estimateSize() < 1024 * 1024, true);

console.log('Core Store v2 tests passed.');
