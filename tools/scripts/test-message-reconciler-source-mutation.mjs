import assert from 'node:assert/strict';

import { createMessageReconciler } from '../../src/runtime/message-reconciler.mjs';
import {
  initializeCampaignRuntimeTracking,
  recordDirectiveResponse
} from '../../src/runtime/state-delta-gateway.mjs';

const cloneJson = (value) => JSON.parse(JSON.stringify(value));
const now = () => '2026-07-03T01:30:00.000Z';

let state = initializeCampaignRuntimeTracking({
  campaign: { id: 'campaign-source-mutation' },
  campaignChatBinding: {
    hostId: 'fake',
    chatId: 'chat-source-mutation',
    campaignId: 'campaign-source-mutation',
    saveId: 'save-source-mutation'
  }
});

state = recordDirectiveResponse(state, {
  id: 'response-core-release-only',
  hostMessageId: '59',
  status: 'posted',
  responseKind: 'clarificationNeeded',
  coreRelease: {
    transactionId: 'txn-response-core-release-only',
    phase: 'hostContinueReleased',
    route: 'clarificationNeeded'
  }
});

const recordedRecoveries = [];
const persisted = [];
const coreTurnStore = {
  async markRecoveryRequired(transactionId, payload) {
    recordedRecoveries.push({ transactionId, payload: cloneJson(payload) });
    return {
      id: payload.id,
      status: 'required',
      phase: 'recoveryRequired',
      reason: payload.reason
    };
  }
};

const reconciler = createMessageReconciler({
  getCampaignState: () => state,
  setCampaignState: (next) => { state = cloneJson(next); },
  coreTurnStore,
  persist: async (next, summary) => {
    persisted.push({ summary, state: cloneJson(next) });
    return { ok: true };
  },
  syncPrompt: async (next) => next,
  now
});

const result = await reconciler.reconcileEdited({
  hostMessageId: '59',
  replacementText: 'The bridge keeps the refusal quiet and documented.'
});

assert.equal(result.ok, true);
assert.equal(result.matched, true);
assert.equal(result.action, 'invalidated');
assert.equal(recordedRecoveries.length, 1);
assert.equal(recordedRecoveries[0].transactionId, 'txn-response-core-release-only');
assert.equal(recordedRecoveries[0].payload.reason, 'directiveResponseEdited');
assert.equal(recordedRecoveries[0].payload.repairDecision.sourceKind, 'directiveResponse');

const response = state.runtimeTracking.responseLedger.find((entry) => entry.id === 'response-core-release-only');
assert.equal(response.status, 'invalidated');
assert.equal(response.invalidatedAt, now());
assert.equal(response.invalidationType, 'directiveResponseEdited');
assert.equal(response.editedAt, now());
assert.equal(response.replacementText, 'The bridge keeps the refusal quiet and documented.');
assert.equal(persisted.some((entry) => /directiveResponseEdited/.test(entry.summary)), true);

console.log('Message reconciler source mutation tests passed.');
