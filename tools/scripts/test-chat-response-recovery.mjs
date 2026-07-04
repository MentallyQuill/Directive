import assert from 'node:assert/strict';

import { createFakeChatAdapter } from '../../src/hosts/fake/fake-host.mjs';
import {
  createTurnSourceFrameContract,
  hashStableJson
} from '../../src/runtime/architecture-redesign-contracts.mjs';
import { createChatTurnOrchestrator } from '../../src/runtime/chat-turn-orchestrator.mjs';
import { createResponseDispatcher } from '../../src/runtime/response-dispatcher.mjs';
import {
  createStateDeltaGateway,
  initializeCampaignRuntimeTracking,
  recordTurnIngress
} from '../../src/runtime/state-delta-gateway.mjs';
import { createTurnCommitCoordinator } from '../../src/runtime/turn-commit-coordinator.mjs';
import { createCoreStoreV2 } from '../../src/storage/core-store-v2.mjs';
import { createLogicalStorageAdapter } from '../../src/storage/logical-storage-adapter.mjs';

const cloneJson = (value) => JSON.parse(JSON.stringify(value));
function lastCommittedTurnProjectionFields({
  transactionId = null,
  turnId = null,
  outcomeId = null,
  status = 'mirrored'
} = {}) {
  const txn = String(transactionId || '').trim();
  const turn = String(turnId || '').trim();
  const outcome = String(outcomeId || '').trim();
  const cleanStatus = String(status || '').trim() || 'mirrored';
  return {
    authority: 'compatibilityProjection',
    projectionSource: txn ? 'coreStoreV2' : 'turnLedger',
    compatibilityMirror: {
      kind: 'directive.lastCommittedTurnCompatibilityMirror.v1',
      status: cleanStatus,
      outcomeId: outcome || null,
      turnId: turn || null,
      transactionId: txn || null,
      source: 'testRecoveryFixture'
    },
    coreProjection: {
      kind: 'directive.coreLastCommittedTurnProjectionRef.v1',
      outcomeId: outcome || null,
      turnId: turn || null,
      transactionId: txn || null,
      status: cleanStatus
    }
  };
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

let sequence = 0;
const now = () => `2026-06-22T14:00:${String(sequence++).padStart(2, '0')}.000Z`;
const chat = createFakeChatAdapter({ chatId: 'recovery-chat' });
const coreTurnStore = createCoreStoreV2({
  adapter: createLogicalStorageAdapter({ storage: createLoggingStorage(), hostId: 'fake' }),
  campaignId: 'recovery-campaign',
  saveId: 'recovery-save',
  now
});
let state = initializeCampaignRuntimeTracking({
  campaign: { id: 'recovery-campaign', status: 'active' },
  campaignChatBinding: { hostId: 'fake', chatId: 'recovery-chat', campaignId: 'recovery-campaign', saveId: 'recovery-save' },
  commandLog: { entries: [] },
  turnLedger: { entries: [] }
});
const sourceFrame = createTurnSourceFrameContract({
  id: 'frame-recovery',
  campaignId: 'recovery-campaign',
  saveId: 'recovery-save',
  chatId: 'recovery-chat',
  hostMessageId: 'player-recovery',
  textHash: hashStableJson({ text: 'I move toward the bridge and wait for the response.' }),
  createdAt: now()
});
const transaction = await coreTurnStore.beginTurn(sourceFrame, {
  transactionId: 'txn-recovery',
  ingressId: 'ingress-recovery',
  idempotencyKey: 'begin-recovery'
});
await coreTurnStore.advanceTurn(transaction.id, {
  phase: 'routePending',
  route: 'directiveCommit',
  reason: 'response-recovery-test',
  idempotencyKey: 'route-recovery'
});
state.turnLedger.entries.push({
  id: 'turn-ledger-recovery',
  turnId: 'turn-recovery',
  outcomeId: 'outcome-recovery',
  resultBand: 'success',
  finalResultBand: 'success',
  narrationStatus: 'complete',
  responseStatus: 'failed',
  committedAt: now(),
  coreTransactionId: transaction.id,
  coreTurnId: transaction.id
});
state.runtimeTracking.lastCommittedTurn = {
  turnId: 'turn-recovery',
  outcomeId: 'outcome-recovery',
  narrationStatus: 'complete',
  responseStatus: 'failed',
  coreTransactionId: transaction.id,
  coreTurnId: transaction.id,
  ...lastCommittedTurnProjectionFields({
    transactionId: transaction.id,
    turnId: 'turn-recovery',
    outcomeId: 'outcome-recovery',
    status: 'response:failed'
  })
};
state = recordTurnIngress(state, {
  id: 'ingress-recovery',
  hostMessageId: 'player-recovery',
  chatId: 'recovery-chat',
  campaignId: 'recovery-campaign',
  status: 'recoveryRequired',
  outcomeId: 'outcome-recovery',
  sourceFrameId: sourceFrame.id,
  sourceFrame,
  coreTransactionId: transaction.id
});
const recoveryCase = await coreTurnStore.markRecoveryRequired(transaction.id, {
  id: 'recovery:response:ingress-recovery',
  reason: 'host-response-post-failure',
  responseRetry: true,
  phaseAfter: 'responseRetryRequired',
  ingressId: 'ingress-recovery',
  outcomeId: 'outcome-recovery',
  turnId: 'turn-recovery',
  sourceFrameId: sourceFrame.id,
  dependentOutcomeId: 'outcome-recovery',
  responseRetryPlan: {
    kind: 'directive.responseRetryGenerationPlan.v1',
    schemaVersion: 1,
    strategy: 'directivePosted',
    responseKind: 'locationTransition',
    classification: 'locationTransition',
    locationTransition: {
      destinationLabel: 'the bridge'
    }
  },
  repairDecision: {
    kind: 'directive.repairResponseRecoveryDecision.v1',
    eventType: 'hostResponsePostFailure',
    recoveryId: 'recovery:response:ingress-recovery',
    recoveryCaseId: 'recovery:response:ingress-recovery',
    ingressId: 'ingress-recovery',
    outcomeId: 'outcome-recovery',
    turnId: 'turn-recovery',
    sourceFrameId: sourceFrame.id,
    transactionId: transaction.id,
    responseStatus: 'responseRetryRequired',
    phaseAfter: 'responseRetryRequired',
    allowedActions: ['retryResponse'],
    normalTurnAllowed: false
  },
  allowedActions: ['retryResponse'],
  idempotencyKey: 'recovery-response-ingress-recovery'
});
assert.equal(recoveryCase.status, 'required');

const persisted = [];
async function persist(next, summary) {
  state = cloneJson(next);
  persisted.push({ state: cloneJson(next), summary });
  return { id: `save-${persisted.length}` };
}
const host = { chat };
const gateway = createStateDeltaGateway({
  getState: () => state,
  setState: (next) => { state = cloneJson(next); },
  persist,
  now
});
const dispatcher = createResponseDispatcher({
  host,
  coreTurnStore,
  getCampaignState: () => state,
  setCampaignState: (next) => { state = cloneJson(next); },
  persist,
  now
});
const coordinator = createTurnCommitCoordinator({ persist, now });
const orchestrator = createChatTurnOrchestrator({
  host,
  classify: async () => ({ classification: 'noDirectiveAction', workerPlan: {}, responseStrategy: 'injectAndContinue' }),
  responseDispatcher: dispatcher,
  turnCommitCoordinator: coordinator,
  stateDeltaGateway: gateway,
  coreTurnStore,
  getCampaignState: () => state,
  setCampaignState: (next) => { state = cloneJson(next); },
  persistCampaignState: persist,
  syncPromptContext: async (next) => next,
  previewDirectorTurn: async () => { throw new Error('Director preview must not run during response recovery.'); },
  commitProvisionalDirectorTurn: async () => { throw new Error('Mechanics must not rerun during response recovery.'); },
  now
});

const recovered = await orchestrator.retryCommittedResponse({ recoveryId: 'recovery:response:ingress-recovery' });
assert.equal(recovered.ok, true);
assert.equal(state.runtimeTracking.lastCommittedTurn.outcomeId, 'outcome-recovery');
assert.equal(state.runtimeTracking.lastCommittedTurn.responseStatus, 'complete');
assert.equal(state.runtimeTracking.recoveryJournal.length, 0);
assert.equal(state.runtimeTracking.ingressLedger.find((entry) => entry.id === 'ingress-recovery').status, 'committed');
assert.equal(chat.messages().filter((message) => message.metadata?.outcomeId === 'outcome-recovery').length, 1);
assert.equal(persisted.length > 0, true);
const resolvedRecovery = coreTurnStore.readProjections().recoveryJournal.find((entry) => (
  entry.id === 'recovery:response:ingress-recovery'
  && entry.status === 'resolved'
));
assert.equal(resolvedRecovery?.repairDecision?.kind, 'directive.repairResponseRetryActuationDecision.v1');

const duplicate = await orchestrator.retryCommittedResponse({ recoveryId: 'recovery:response:ingress-recovery' });
assert.equal(duplicate.ok, false);
assert.equal(duplicate.reason, 'response-recovery-not-found');
assert.equal(chat.messages().filter((message) => message.metadata?.outcomeId === 'outcome-recovery').length, 1);

console.log('Chat response recovery tests passed: committed mechanics are reused, response posting is idempotent, and recovery journals close');
