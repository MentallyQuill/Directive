import assert from 'node:assert/strict';

import { createFakeChatAdapter } from '../../src/hosts/fake/fake-host.mjs';
import { createChatTurnOrchestrator } from '../../src/runtime/chat-turn-orchestrator.mjs';
import { createResponseDispatcher } from '../../src/runtime/response-dispatcher.mjs';
import {
  createStateDeltaGateway,
  initializeCampaignRuntimeTracking,
  recordRecoveryEvent,
  recordTurnIngress
} from '../../src/runtime/state-delta-gateway.mjs';
import { createTurnCommitCoordinator } from '../../src/runtime/turn-commit-coordinator.mjs';

const cloneJson = (value) => JSON.parse(JSON.stringify(value));
let sequence = 0;
const now = () => `2026-06-22T14:00:${String(sequence++).padStart(2, '0')}.000Z`;
const chat = createFakeChatAdapter({ chatId: 'recovery-chat' });
let state = initializeCampaignRuntimeTracking({
  campaign: { id: 'recovery-campaign', status: 'active' },
  campaignChatBinding: { hostId: 'fake', chatId: 'recovery-chat', campaignId: 'recovery-campaign' },
  commandLog: { entries: [] },
  turnLedger: { entries: [] }
});
state.runtimeTracking.lastCommittedTurn = {
  turnId: 'turn-recovery',
  outcomeId: 'outcome-recovery',
  narrationStatus: 'complete',
  responseStatus: 'failed'
};
state = recordTurnIngress(state, {
  id: 'ingress-recovery',
  hostMessageId: 'player-recovery',
  chatId: 'recovery-chat',
  campaignId: 'recovery-campaign',
  status: 'recoveryRequired',
  outcomeId: 'outcome-recovery'
});
state = recordRecoveryEvent(state, {
  id: 'recovery:response:ingress-recovery',
  type: 'hostResponsePostFailure',
  status: 'open',
  ingressId: 'ingress-recovery',
  outcomeId: 'outcome-recovery',
  details: {
    strategy: 'directivePosted',
    text: 'The bridge executes the already committed maneuver.',
    turnId: 'turn-recovery',
    responseKind: 'committedOutcome',
    classification: 'consequentialCommand',
    workerPlan: { continuity: true }
  }
});

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
assert.equal(state.runtimeTracking.recoveryJournal.find((entry) => entry.id === 'recovery:response:ingress-recovery').status, 'resolved');
assert.equal(state.runtimeTracking.ingressLedger.find((entry) => entry.id === 'ingress-recovery').status, 'committed');
assert.equal(chat.messages().filter((message) => message.metadata?.outcomeId === 'outcome-recovery').length, 1);
assert.equal(persisted.length > 0, true);

const duplicate = await orchestrator.retryCommittedResponse({ recoveryId: 'recovery:response:ingress-recovery' });
assert.equal(duplicate.ok, false);
assert.equal(duplicate.reason, 'response-recovery-not-found');
assert.equal(chat.messages().filter((message) => message.metadata?.outcomeId === 'outcome-recovery').length, 1);

console.log('Chat response recovery tests passed: committed mechanics are reused, response posting is idempotent, and recovery journals close');
