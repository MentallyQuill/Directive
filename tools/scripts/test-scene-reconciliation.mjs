import assert from 'node:assert/strict';

import { createSceneReconciliationService } from '../../src/runtime/scene-reconciliation.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

let state = {
  campaign: {
    id: 'campaign-scene-reconciliation',
    title: 'Scene Reconciliation Fixture',
    status: 'active'
  },
  campaignChatBinding: {
    chatId: 'chat-recon'
  },
  commandLog: {
    entries: []
  },
  ship: {
    name: 'U.S.S. Testbed',
    condition: 'Nominal'
  },
  mission: {
    activePhaseId: 'opening',
    phase: 'Opening'
  },
  turnLedger: {
    entries: [
      {
        turnId: 'turn-1',
        outcomeId: 'outcome-1',
        snapshotBefore: {
          campaign: { id: 'campaign-scene-reconciliation', status: 'active' },
          mission: { activePhaseId: 'before-revision' },
          commandLog: { entries: [] }
        }
      }
    ]
  },
  runtimeTracking: {
    revision: 0,
    ingressLedger: [
      {
        id: 'ingress-1',
        hostMessageId: '1',
        chatId: 'chat-recon',
        textHash: 'old',
        turnId: 'turn-1',
        outcomeId: 'outcome-1'
      }
    ],
    responseLedger: []
  }
};

const messages = [
  {
    hostMessageId: '1',
    id: '1',
    index: 1,
    chatId: 'chat-recon',
    text: 'Log: Engineering reached the cargo bay.',
    isUser: true
  },
  {
    hostMessageId: '2',
    id: '2',
    index: 2,
    chatId: 'chat-recon',
    text: 'Ship status: Shields degraded.',
    isUser: true
  },
  {
    hostMessageId: '3',
    id: '3',
    index: 3,
    chatId: 'chat-recon',
    text: 'Mission phase: Medical triage.',
    isUser: true
  }
];

let persisted = 0;
const gateway = createStateDeltaGateway({
  getState: () => state,
  setState: (next) => { state = cloneJson(next); },
  persist: async () => { persisted += 1; },
  now: () => '2026-06-22T12:00:00.000Z'
});

let idSequence = 0;
const service = createSceneReconciliationService({
  getCampaignState: () => state,
  stateDeltaGateway: gateway,
  host: {
    chat: {
      getMessage(hostMessageId) {
        return messages.find((message) => message.hostMessageId === String(hostMessageId)) || null;
      },
      getRecentMessages() {
        return messages;
      },
      normalizeMessagePayload(payload = {}) {
        const message = payload.message || payload;
        return messages.find((item) => item.hostMessageId === String(message.hostMessageId || message.id)) || message;
      }
    }
  },
  idFactory(prefix) {
    idSequence += 1;
    return `${prefix}-${idSequence}`;
  },
  now: () => '2026-06-22T12:00:00.000Z'
});

const marker = await service.setStart({ message: { hostMessageId: '1' } });
assert.equal(marker.ok, true);
assert.equal(state.runtimeTracking.sceneReconciliation.markers.start.hostMessageId, '1');
assert.equal(state.sceneReconciliation, undefined, 'Scene reconciliation ledger should stay under runtimeTracking');

const logResult = await service.reconcileMessage({ message: { hostMessageId: '1' } });
assert.equal(logResult.ok, true);
assert.equal(logResult.applied.length, 1);
assert.equal(logResult.pending.length, 0);
assert.equal(state.commandLog.entries.length, 1);
assert.equal(state.commandLog.entries[0].visibleConsequences[0], 'Engineering reached the cargo bay');
assert.equal(state.runtimeTracking.sceneReconciliation.applied.at(-1).status, 'autoApplied');

const shipResult = await service.reconcileMessage({ message: { hostMessageId: '2' } });
assert.equal(shipResult.ok, true);
assert.equal(shipResult.applied.length, 0);
assert.equal(shipResult.pending.length, 1);
assert.equal(shipResult.pending[0].reviewReason, 'consequential');
assert.equal(state.ship.condition, 'Nominal', 'Consequential ship changes should wait for review');

const pendingShip = state.runtimeTracking.sceneReconciliation.pending.find((item) => item.status === 'pending');
assert(pendingShip, 'Ship status proposal should be pending');
const appliedShip = await service.applyPending({ proposalId: pendingShip.id });
assert.equal(appliedShip.ok, true);
assert.equal(state.ship.condition, 'Shields degraded');
assert.equal(state.runtimeTracking.sceneReconciliation.pending.find((item) => item.id === pendingShip.id).status, 'applied');

const phaseResult = await service.reconcileMessage({ message: { hostMessageId: '3' } });
assert.equal(phaseResult.pending.length, 1);
const pendingPhase = state.runtimeTracking.sceneReconciliation.pending.find((item) => item.id === phaseResult.pending[0].id);
assert.equal(pendingPhase.allowedRoots[0], 'mission');
const rejected = await service.rejectPending({ proposalId: pendingPhase.id });
assert.equal(rejected.ok, true);
assert.equal(state.mission.activePhaseId, 'opening');
assert.equal(state.runtimeTracking.sceneReconciliation.pending.find((item) => item.id === pendingPhase.id).status, 'rejected');

const recalc = await service.recalculateFromHere({ message: { hostMessageId: '1' } });
assert.equal(recalc.ok, true);
assert.equal(recalc.outcomeId, 'outcome-1');
assert.equal(recalc.hasSnapshotBefore, true);
assert.equal(state.runtimeTracking.sceneReconciliation.lastResult.action, 'recalculateFromHere');
assert.equal(state.runtimeTracking.sceneReconciliation.lastResult.destructive, true);

await service.setStart({ message: { hostMessageId: '1' } });
await service.setEnd({ message: { hostMessageId: '3' } });
assert.equal(state.runtimeTracking.sceneReconciliation.markers.start.hostMessageId, '1');
assert.equal(state.runtimeTracking.sceneReconciliation.markers.end.hostMessageId, '3');
const marked = await service.reconcileMarked();
assert.equal(marked.ok, true);
assert.equal(state.runtimeTracking.sceneReconciliation.markers.start, null);
assert.equal(state.runtimeTracking.sceneReconciliation.markers.end, null);
assert.equal(state.runtimeTracking.sceneReconciliation.lastResult.markersCleared, true);

assert(persisted >= 1, 'Scene reconciliation should persist runtime tracking and accepted state changes');

console.log('test-scene-reconciliation: ok');
