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
        outcomeId: 'outcome-1',
        coreTransactionId: 'core-txn-1'
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
const sourcePreflightCalls = [];
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
  sourceSettlementService: {
    async preflightRange(payload) {
      sourcePreflightCalls.push(cloneJson(payload));
      return {
        kind: 'directive.sourceSettlementDecision.v1',
        mode: 'explicitRange',
        status: 'preflightClean',
        transactionId: payload.transactionId || null,
        rangeFrameId: `range-preflight-${sourcePreflightCalls.length}`,
        rangeHash: payload.anchorRangeHash || null,
        providerCalled: false,
        applied: false,
        reasons: payload.reasons || [],
        diagnostic: { id: `core-diagnostic-${sourcePreflightCalls.length}` },
        observedAt: '2026-06-22T12:00:00.000Z'
      };
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
assert.equal(sourcePreflightCalls.length, 1);
assert.equal(sourcePreflightCalls[0].transactionId, 'core-txn-1');
assert.equal(sourcePreflightCalls[0].expected.chatId, 'chat-recon');
assert.deepEqual(sourcePreflightCalls[0].reasons, ['scene-reconciliation-range-diagnostic-preflight']);
assert.match(sourcePreflightCalls[0].messages[0].textHash, /^h[0-9a-z]+$/);
assert.equal('text' in sourcePreflightCalls[0].messages[0], false);
assert.equal(JSON.stringify(sourcePreflightCalls[0]).includes('Engineering reached the cargo bay'), false);
assert.equal(logResult.sourcePreflight.status, 'preflightClean');
assert.equal(logResult.sourcePreflight.providerCalled, false);
assert.equal(logResult.sourcePreflight.applied, false);
assert.equal(logResult.sourcePreflight.diagnosticId, 'core-diagnostic-1');
assert.equal(JSON.stringify(logResult.sourcePreflight).includes('Engineering reached the cargo bay'), false);
assert.equal(state.runtimeTracking.sceneReconciliation.runs.at(-1).sourcePreflight.status, 'preflightClean');
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
const cleared = await service.clearMarkers();
assert.equal(cleared.ok, true);
assert.equal(cleared.action, 'clearMarkers');
assert.equal(state.runtimeTracking.sceneReconciliation.markers.start, null);
assert.equal(state.runtimeTracking.sceneReconciliation.markers.end, null);
assert.equal(state.runtimeTracking.sceneReconciliation.lastResult.status, 'cleared');

await service.setStart({ message: { hostMessageId: '1' } });
await service.setEnd({ message: { hostMessageId: '3' } });
const marked = await service.reconcileMarked();
assert.equal(marked.ok, true);
assert.equal(state.runtimeTracking.sceneReconciliation.markers.start, null);
assert.equal(state.runtimeTracking.sceneReconciliation.markers.end, null);
assert.equal(state.runtimeTracking.sceneReconciliation.lastResult.markersCleared, true);

state.runtimeTracking.sceneReconciliation.runs.push({
  id: 'abandoned-run',
  action: 'reconcileMessage',
  status: 'running',
  startedAt: '2026-06-22T11:59:00.000Z',
  completedAt: null
});
state.runtimeTracking.sceneReconciliation.lastRunId = 'abandoned-run';
state.runtimeTracking.sceneReconciliation.lastResult = {
  ok: true,
  action: 'reconcileMessage',
  status: 'running',
  runId: 'abandoned-run',
  summary: 'Scene reconciliation started.'
};
const afterAbandoned = await service.reconcileMessage({ message: { hostMessageId: '1' } });
assert.equal(afterAbandoned.ok, true);
const interrupted = state.runtimeTracking.sceneReconciliation.runs.find((run) => run.id === 'abandoned-run');
assert.equal(interrupted.status, 'interrupted');
assert.equal(interrupted.interruptionReason, 'superseded-by-new-reconciliation-run');
assert.equal(state.runtimeTracking.sceneReconciliation.lastResult.status, 'completed');

assert(persisted >= 1, 'Scene reconciliation should persist runtime tracking and accepted state changes');

let blockedState = cloneJson({
  ...state,
  commandLog: { entries: [] },
  mission: { activePhaseId: 'opening', phase: 'Opening' },
  runtimeTracking: {
    revision: 0,
    ingressLedger: [{
      id: 'blocked-ingress-1',
      hostMessageId: '1',
      chatId: 'chat-recon',
      textHash: 'blocked-old',
      turnId: 'blocked-turn-1',
      outcomeId: 'blocked-outcome-1',
      coreTransactionId: 'blocked-core-txn-1'
    }],
    responseLedger: []
  }
});
const blockedGatewayCore = createStateDeltaGateway({
  getState: () => blockedState,
  setState: (next) => { blockedState = cloneJson(next); },
  persist: async () => {},
  now: () => '2026-06-22T12:10:00.000Z'
});
const blockedGatewayCalls = [];
const blockedOrder = [];
const blockedGateway = {
  ...blockedGatewayCore,
  async commit(next, delta, options) {
    if (delta?.metadata?.invalidation === true) blockedOrder.push('invalidation');
    blockedGatewayCalls.push(['commit', delta?.source || null, cloneJson(delta?.metadata || {})]);
    return blockedGatewayCore.commit(next, delta, options);
  },
  async applyOperations(proposal, policy) {
    blockedOrder.push(proposal?.workerId === 'scene-reconciliation-ledger' ? 'ledger' : 'apply');
    blockedGatewayCalls.push(['applyOperations', proposal?.source || null, cloneJson(proposal?.metadata || {}), proposal?.workerId || null]);
    return blockedGatewayCore.applyOperations(proposal, policy);
  }
};
const blockedSettlementCalls = [];
const blockedService = createSceneReconciliationService({
  getCampaignState: () => blockedState,
  stateDeltaGateway: blockedGateway,
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
  sourceSettlementService: {
    async preflightRange(payload) {
      return {
        kind: 'directive.sourceSettlementDecision.v1',
        mode: 'explicitRange',
        status: 'preflightClean',
        transactionId: payload.transactionId || null,
        rangeHash: payload.anchorRangeHash || null,
        providerCalled: false,
        applied: false,
        reasons: payload.reasons || [],
        diagnostic: { id: 'blocked-preflight-diagnostic' },
        observedAt: '2026-06-22T12:10:00.000Z'
      };
    },
    async reconcileRange(payload) {
      blockedOrder.push('settlement');
      blockedSettlementCalls.push(cloneJson(payload));
      return {
        kind: 'directive.sourceSettlementDecision.v1',
        mode: 'explicitRange',
        status: 'hardSkipped',
        transactionId: payload.transactionId || null,
        rangeFrameId: 'blocked-range-frame',
        rangeHash: payload.anchorRangeHash || null,
        providerCalled: false,
        applied: false,
        reasons: ['range-hash-changed'],
        diagnostic: { id: 'blocked-settlement-diagnostic' },
        observedAt: '2026-06-22T12:10:00.000Z'
      };
    }
  },
  idFactory(prefix) {
    idSequence += 1;
    return `${prefix}-blocked-${idSequence}`;
  },
  now: () => '2026-06-22T12:10:00.000Z'
});

const blockedResult = await blockedService.reconcileMessage({ message: { hostMessageId: '1' } });
assert.equal(blockedResult.ok, false, 'SRE hardSkipped explicit range must stop scene reconciliation');
assert.equal(blockedResult.status, 'hardSkipped');
assert.equal(blockedSettlementCalls.length, 1, 'Scene reconciliation must ask SRE for terminal range settlement');
assert.equal(blockedSettlementCalls[0].transactionId, 'blocked-core-txn-1');
assert.match(blockedSettlementCalls[0].messages[0].textHash, /^h[0-9a-z]+$/);
assert.equal('text' in blockedSettlementCalls[0].messages[0], false);
assert.equal(JSON.stringify(blockedSettlementCalls[0]).includes('Engineering reached the cargo bay'), false);
assert.equal(
  blockedGatewayCalls.some((call) => call[0] === 'applyOperations' && call[3] !== 'scene-reconciliation-ledger'),
  false,
  'SRE hardSkipped must prevent reconciliation proposal apply'
);
assert.equal(
  blockedGatewayCalls.some((call) => call[0] === 'commit' && call[2]?.invalidation === true),
  false,
  'SRE hardSkipped must prevent anchor invalidation before source authority accepts'
);
assert.equal(blockedOrder[0], 'settlement', 'terminal SRE settlement must happen before scene reconciliation ledger writes');
assert.equal(blockedState.commandLog.entries.length, 0, 'SRE hardSkipped must leave derived command log untouched');
assert.equal(blockedState.runtimeTracking.sceneReconciliation.lastResult.status, 'hardSkipped');
assert.equal(JSON.stringify(blockedState.runtimeTracking.sceneReconciliation.lastResult).includes('Engineering reached the cargo bay'), false);
assert.equal(JSON.stringify(blockedState.runtimeTracking.sceneReconciliation.runs).includes('Engineering reached the cargo bay'), false);

function createSettlementFixture({ status, suffix }) {
  let fixtureState = {
    campaign: {
      id: `campaign-scene-reconciliation-${suffix}`,
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
      entries: [{
        turnId: `turn-${suffix}`,
        outcomeId: `outcome-${suffix}`,
        snapshotBefore: {
          campaign: { id: `campaign-scene-reconciliation-${suffix}`, status: 'active' },
          mission: { activePhaseId: 'before-revision' },
          commandLog: { entries: [] }
        }
      }]
    },
    runtimeTracking: {
      revision: 0,
      ingressLedger: [{
        id: `ingress-${suffix}`,
        hostMessageId: '1',
        chatId: 'chat-recon',
        textHash: `old-${suffix}`,
        turnId: `turn-${suffix}`,
        outcomeId: `outcome-${suffix}`,
        coreTransactionId: `core-txn-${suffix}`
      }],
      responseLedger: []
    }
  };
  const gatewayCore = createStateDeltaGateway({
    getState: () => fixtureState,
    setState: (next) => { fixtureState = cloneJson(next); },
    persist: async () => {},
    now: () => '2026-06-22T12:20:00.000Z'
  });
  const calls = { gateway: [], settlement: [], order: [] };
  const gateway = {
    ...gatewayCore,
    async commit(next, delta, options) {
      if (delta?.metadata?.invalidation === true) calls.order.push('invalidation');
      calls.gateway.push(['commit', delta?.source || null, cloneJson(delta?.metadata || {})]);
      return gatewayCore.commit(next, delta, options);
    },
    async applyOperations(proposal, policy) {
      calls.order.push(proposal?.workerId === 'scene-reconciliation-ledger' ? 'ledger' : 'apply');
      calls.gateway.push(['applyOperations', proposal?.source || null, cloneJson(proposal?.metadata || {}), proposal?.workerId || null]);
      return gatewayCore.applyOperations(proposal, policy);
    }
  };
  const service = createSceneReconciliationService({
    getCampaignState: () => fixtureState,
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
    sourceSettlementService: {
      async preflightRange(payload) {
        return {
          kind: 'directive.sourceSettlementDecision.v1',
          mode: 'explicitRange',
          status: 'preflightClean',
          transactionId: payload.transactionId || null,
          rangeHash: payload.anchorRangeHash || null,
          providerCalled: false,
          applied: false,
          reasons: payload.reasons || [],
          diagnostic: { id: `${suffix}-preflight-diagnostic` },
          observedAt: '2026-06-22T12:20:00.000Z'
        };
      },
      async reconcileRange(payload) {
        calls.order.push('settlement');
        calls.settlement.push(cloneJson(payload));
        return {
          kind: 'directive.sourceSettlementDecision.v1',
          mode: 'explicitRange',
          status,
          transactionId: payload.transactionId || null,
          rangeFrameId: `${suffix}-range-frame`,
          rangeHash: payload.anchorRangeHash || null,
          providerCalled: status === 'accepted' || status === 'staleBeforeApply',
          applied: status === 'accepted',
          reasons: status === 'accepted' ? [] : ['range-hash-changed-before-apply'],
          diagnostic: { id: `${suffix}-settlement-diagnostic` },
          observedAt: '2026-06-22T12:20:00.000Z'
        };
      }
    },
    idFactory(prefix) {
      idSequence += 1;
      return `${prefix}-${suffix}-${idSequence}`;
    },
    now: () => '2026-06-22T12:20:00.000Z'
  });
  return {
    service,
    calls,
    getState: () => fixtureState
  };
}

const acceptedFixture = createSettlementFixture({ status: 'accepted', suffix: 'accepted' });
const acceptedResult = await acceptedFixture.service.reconcileMessage({ message: { hostMessageId: '1' } });
assert.equal(acceptedResult.ok, true);
assert.equal(acceptedResult.sourceSettlement.status, 'accepted');
assert.equal(acceptedFixture.calls.settlement.length, 1);
assert.equal(acceptedFixture.calls.order[0], 'settlement', 'SRE accepted settlement must happen before any scene reconciliation state mutation');
assert.deepEqual(
  acceptedFixture.calls.order.filter((item) => item !== 'ledger').slice(0, 3),
  ['settlement', 'invalidation', 'apply'],
  'SRE accepted settlement must happen before invalidation and proposal apply'
);
assert.equal(acceptedFixture.getState().commandLog.entries.length, 1, 'SRE accepted range should allow safe reconciliation apply');
assert.equal(JSON.stringify(acceptedResult.sourceSettlement).includes('Engineering reached the cargo bay'), false);
assert.equal(JSON.stringify(acceptedFixture.getState().runtimeTracking.sceneReconciliation.runs).includes('Engineering reached the cargo bay'), false);

const staleFixture = createSettlementFixture({ status: 'staleBeforeApply', suffix: 'stale' });
const staleResult = await staleFixture.service.reconcileMessage({ message: { hostMessageId: '1' } });
assert.equal(staleResult.ok, false);
assert.equal(staleResult.status, 'staleBeforeApply');
assert.equal(staleFixture.calls.order[0], 'settlement', 'SRE staleBeforeApply must happen before ledger writes');
assert.deepEqual(staleFixture.calls.order.filter((item) => item !== 'ledger'), ['settlement'], 'SRE staleBeforeApply must stop before invalidation or proposal apply');
assert.equal(staleFixture.getState().commandLog.entries.length, 0, 'SRE staleBeforeApply must leave derived state untouched');
assert.equal(staleFixture.getState().runtimeTracking.sceneReconciliation.lastResult.status, 'staleBeforeApply');
assert.equal(JSON.stringify(staleFixture.getState().runtimeTracking.sceneReconciliation.lastResult).includes('Engineering reached the cargo bay'), false);

console.log('test-scene-reconciliation: ok');
