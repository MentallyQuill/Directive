import assert from 'node:assert/strict';

import { hashStableJson } from '../../src/runtime/architecture-redesign-contracts.mjs';
import { createTurnCommitCoordinator } from '../../src/runtime/turn-commit-coordinator.mjs';
import { initializeCampaignRuntimeTracking } from '../../src/runtime/state-delta-gateway.mjs';
import { createCoreStoreV2 } from '../../src/storage/core-store-v2.mjs';
import { createLogicalStorageAdapter } from '../../src/storage/logical-storage-adapter.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createMemoryStorage() {
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

function baseState() {
  return initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-core-mechanics-order', status: 'active' },
    campaignChatBinding: {
      hostId: 'fake',
      chatId: 'ashes-chat',
      campaignId: 'campaign-core-mechanics-order',
      saveId: 'save-core-mechanics-order'
    },
    mission: { activePhaseId: 'before-commit' },
    worldState: { currentLocationId: 'before-location' },
    commandLog: { entries: [] },
    turnLedger: { entries: [] },
    runtimeTracking: {
      ingressLedger: [{
        id: 'ingress-core-mechanics-order',
        coreTransactionId: 'txn-core-mechanics-order',
        status: 'classified'
      }]
    }
  });
}

function committedState() {
  return {
    ...baseState(),
    mission: { activePhaseId: 'after-commit' },
    worldState: { currentLocationId: 'after-location' },
    turnLedger: {
      entries: [{
        turnId: 'turn-core-mechanics-order',
        outcomeId: 'outcome-core-mechanics-order',
        resultBand: 'Success'
      }],
      lastCommittedOutcomeId: 'outcome-core-mechanics-order',
      swipeRerollForbidden: true
    }
  };
}

const turnPacket = {
  turnId: 'turn-core-mechanics-order',
  outcomePacket: {
    id: 'outcome-core-mechanics-order',
    resultBand: 'Success'
  },
  stateDelta: {
    openWorld: {
      reducerBundle: {
        kind: 'directive.openWorldReducerBundle.v1',
        sourceOutcomeId: 'outcome-core-mechanics-order',
        sourceEventIds: ['event-core-mechanics-order'],
        sourceAnchorRange: {
          rangeHash: 'range-core-mechanics-order',
          hostMessageIds: ['player-core-mechanics-order']
        },
        operations: [{
          type: 'value.set',
          path: ['worldState', 'currentLocationId'],
          value: 'RAW_OPEN_WORLD_REDUCER_VALUE'
        }],
        diagnostics: {
          operationCount: 1,
          changedRoots: ['worldState'],
          boundaryType: 'turn',
          eventCount: 1,
          reactionCount: 0
        }
      }
    }
  },
  provenance: {
    continuityProjection: { source: 'fixture' }
  }
};

const callOrder = [];
const persisted = [];
const coordinator = createTurnCommitCoordinator({
  now: () => '2026-06-29T01:00:00.000Z',
  persist: async (next, summary) => {
    callOrder.push('persist');
    persisted.push({ state: cloneJson(next), summary });
    return { id: `save-${persisted.length}` };
  },
  coreTurnStore: {
    async getTransaction(transactionId) {
      return {
        id: transactionId,
        revisions: { mechanics: 0, runtime: 1, diagnostic: 0, prompt: 0 }
      };
    },
    async getRevisions() {
      return { mechanics: 0, runtime: 1, diagnostic: 0, prompt: 0 };
    },
    async advanceTurn(transactionId, patch) {
      callOrder.push('core-advance');
      assert.equal(transactionId, 'txn-core-mechanics-order');
      assert.equal(patch.phase, 'routePending');
      return { id: transactionId, phase: patch.phase };
    },
    async commitMechanics(transactionId, bundle) {
      callOrder.push('core-mechanics');
      assert.equal(transactionId, 'txn-core-mechanics-order');
      assert.equal(bundle.outcomeId, 'outcome-core-mechanics-order');
      assert.equal(bundle.phaseAfter, 'mechanicsPending');
      assert.equal(bundle.baseMechanicsRevision, 0);
      assert.equal(
        bundle.operations.some((operation) => operation.domain === 'mission'),
        true,
        'CORE mechanics bundle should record the changed mechanics domain'
      );
      assert.equal(
        bundle.operations.some((operation) => operation.domain === 'worldState' && operation.op === 'domainCommitted'),
        false,
        'reducer-owned roots should not also be recorded as broad domain commits'
      );
      const reducerOperation = bundle.operations.find((operation) => operation.op === 'reducerBundleCommitted');
      assert.ok(reducerOperation, 'CORE mechanics bundle should include open-world reducer source evidence');
      assert.equal(reducerOperation.domain, 'openWorld');
      assert.equal(reducerOperation.sourceKind, 'directive.openWorldReducerBundle.v1');
      assert.equal(reducerOperation.operationCount, 1);
      assert.deepEqual(reducerOperation.changedRoots, ['worldState']);
      assert.ok(reducerOperation.sourceHash, 'reducer source evidence should include a stable source hash');
      assert.ok(reducerOperation.valueHash, 'reducer source evidence should include an operation hash');
      assert.equal(JSON.stringify(bundle).includes('RAW_OPEN_WORLD_REDUCER_VALUE'), false);
      return {
        turnId: 'core-turn-1',
        outcomeId: bundle.outcomeId,
        operationHash: 'core-operation-hash'
      };
    },
    async recordOutcomeReplacement(transactionId, replacement) {
      callOrder.push('core-replacement');
      assert.equal(transactionId, 'txn-core-mechanics-order');
      assert.equal(replacement.type, 'rerunOutcome');
      assert.equal(replacement.replacedOutcomeId, 'outcome-old-core-mechanics-order');
      assert.equal(replacement.replacementOutcomeId, 'outcome-core-mechanics-order');
      assert.equal(replacement.replacedTurnId, 'turn-old-core-mechanics-order');
      assert.equal(replacement.replacementTurnId, 'turn-core-mechanics-order');
      assert.equal(replacement.repairDecision?.kind, 'directive.repairOutcomeRerunActuationDecision.v1');
      assert.equal(replacement.repairDecision?.action, 'createRerunBranchCandidate');
      return {
        kind: 'directive.coreOutcomeReplacementRef.v1',
        transactionId,
        replacedOutcomeId: replacement.replacedOutcomeId,
        replacementOutcomeId: replacement.replacementOutcomeId
      };
    }
  }
});

const success = await coordinator.checkpointMechanics({
  beforeCampaignState: baseState(),
  campaignState: committedState(),
  turnPacket,
  ingressId: 'ingress-core-mechanics-order',
  outcomeReplacement: {
    transactionId: 'txn-core-mechanics-order',
    idempotencyKey: 'outcome-replacement:txn-core-mechanics-order:outcome-old-core-mechanics-order:outcome-core-mechanics-order',
    type: 'rerunOutcome',
    replacedOutcomeId: 'outcome-old-core-mechanics-order',
    replacementOutcomeId: 'outcome-core-mechanics-order',
    replacedTurnId: 'turn-old-core-mechanics-order',
    replacementTurnId: 'turn-core-mechanics-order',
    repairDecision: {
      kind: 'directive.repairOutcomeRerunActuationDecision.v1',
      authorized: true,
      action: 'createRerunBranchCandidate',
      outcomeId: 'outcome-old-core-mechanics-order'
    }
  }
});

assert.deepEqual(callOrder, ['core-advance', 'core-mechanics', 'core-replacement', 'persist']);
assert.equal(success.coreMechanics.status, 'committed');
assert.equal(success.coreMechanics.operationHash, 'core-operation-hash');
assert.equal(success.coreOutcomeReplacement.kind, 'directive.coreOutcomeReplacementRef.v1');
assert.equal(success.coreOutcomeReplacement.replacedOutcomeId, 'outcome-old-core-mechanics-order');
assert.equal(success.coreOutcomeReplacement.replacementOutcomeId, 'outcome-core-mechanics-order');
assert.equal(persisted.length, 1);
assert.equal(persisted[0].state.runtimeTracking.lastCommittedTurn.outcomeId, 'outcome-core-mechanics-order');
assert.equal(persisted[0].state.runtimeTracking.lastCommittedTurn.coreTransactionId, 'txn-core-mechanics-order');
assert.equal(persisted[0].state.turnLedger.entries.at(-1).coreTransactionId, 'txn-core-mechanics-order');
assert.equal(persisted[0].state.turnLedger.entries.at(-1).coreOperationHash, 'core-operation-hash');

const failedPersisted = [];
const failingCoordinator = createTurnCommitCoordinator({
  now: () => '2026-06-29T01:01:00.000Z',
  persist: async (next, summary) => {
    failedPersisted.push({ state: cloneJson(next), summary });
    return { id: `save-failed-${failedPersisted.length}` };
  },
  coreTurnStore: {
    async getTransaction(transactionId) {
      return {
        id: transactionId,
        revisions: { mechanics: 0, runtime: 1, diagnostic: 0, prompt: 0 }
      };
    },
    async getRevisions() {
      return { mechanics: 0, runtime: 1, diagnostic: 0, prompt: 0 };
    },
    async advanceTurn() {
      return { id: 'txn-core-mechanics-order', phase: 'routePending' };
    },
    async commitMechanics() {
      const error = new Error('simulated CORE mechanics failure');
      error.code = 'DIRECTIVE_CORE_MECHANICS_COMMIT_FAILED';
      throw error;
    }
  }
});

await assert.rejects(
  () => failingCoordinator.checkpointMechanics({
    beforeCampaignState: baseState(),
    campaignState: committedState(),
    turnPacket,
    ingressId: 'ingress-core-mechanics-order'
  }),
  (error) => {
    assert.equal(error.code, 'DIRECTIVE_CORE_MECHANICS_COMMIT_FAILED');
    assert.equal(error.details?.status, 'error');
    return true;
  }
);
assert.equal(failedPersisted.length, 0, 'v1 checkpoint must not persist when CORE mechanics fails first');

const failedReplacementCalls = [];
const failedReplacementPersisted = [];
const failedReplacementCoordinator = createTurnCommitCoordinator({
  now: () => '2026-06-29T01:01:30.000Z',
  persist: async (next, summary) => {
    failedReplacementCalls.push('persist');
    failedReplacementPersisted.push({ state: cloneJson(next), summary });
    return { id: `save-failed-replacement-${failedReplacementPersisted.length}` };
  },
  coreTurnStore: {
    async getTransaction(transactionId) {
      return {
        id: transactionId,
        revisions: { mechanics: 0, runtime: 1, diagnostic: 0, prompt: 0 }
      };
    },
    async getRevisions() {
      return { mechanics: 0, runtime: 1, diagnostic: 0, prompt: 0 };
    },
    async advanceTurn() {
      failedReplacementCalls.push('core-advance');
      return { id: 'txn-core-mechanics-order', phase: 'routePending' };
    },
    async commitMechanics() {
      failedReplacementCalls.push('core-mechanics');
      return {
        turnId: 'core-turn-failed-replacement',
        outcomeId: 'outcome-core-mechanics-order',
        operationHash: 'core-operation-hash'
      };
    },
    async recordOutcomeReplacement() {
      failedReplacementCalls.push('core-replacement');
      const error = new Error('simulated CORE outcome replacement failure');
      error.code = 'DIRECTIVE_CORE_OUTCOME_REPLACEMENT_RECORD_FAILED';
      throw error;
    }
  }
});

await assert.rejects(
  () => failedReplacementCoordinator.checkpointMechanics({
    beforeCampaignState: baseState(),
    campaignState: committedState(),
    turnPacket,
    ingressId: 'ingress-core-mechanics-order',
    outcomeReplacement: {
      transactionId: 'txn-core-mechanics-order',
      idempotencyKey: 'outcome-replacement:txn-core-mechanics-order:outcome-old-core-mechanics-order:outcome-core-mechanics-order',
      type: 'rerunOutcome',
      replacedOutcomeId: 'outcome-old-core-mechanics-order',
      replacementOutcomeId: 'outcome-core-mechanics-order'
    }
  }),
  (error) => {
    assert.equal(error.code, 'DIRECTIVE_CORE_OUTCOME_REPLACEMENT_RECORD_FAILED');
    return true;
  }
);
assert.deepEqual(failedReplacementCalls, ['core-advance', 'core-mechanics', 'core-replacement']);
assert.equal(failedReplacementPersisted.length, 0, 'v1 checkpoint must not persist when CORE replacement record fails');

const replacementPersistFailureCalls = [];
const replacementPersistFailureRecoveries = [];
const replacementPersistFailureCoordinator = createTurnCommitCoordinator({
  now: () => '2026-06-29T01:01:40.000Z',
  persist: async () => {
    replacementPersistFailureCalls.push('persist');
    const error = new Error('simulated active-save persist failure after replacement record');
    error.code = 'DIRECTIVE_ACTIVE_SAVE_PERSIST_FAILED';
    throw error;
  },
  coreTurnStore: {
    async getTransaction(transactionId) {
      return {
        id: transactionId,
        revisions: { mechanics: 0, runtime: 1, diagnostic: 0, prompt: 0 }
      };
    },
    async getRevisions() {
      return { mechanics: 0, runtime: 1, diagnostic: 0, prompt: 0 };
    },
    async advanceTurn() {
      replacementPersistFailureCalls.push('core-advance');
      return { id: 'txn-core-mechanics-order', phase: 'routePending' };
    },
    async commitMechanics() {
      replacementPersistFailureCalls.push('core-mechanics');
      return {
        turnId: 'core-turn-replacement-persist-failure',
        outcomeId: 'outcome-core-mechanics-order',
        operationHash: 'core-operation-hash'
      };
    },
    async recordOutcomeReplacement(transactionId, replacement) {
      replacementPersistFailureCalls.push('core-replacement');
      assert.equal(transactionId, 'txn-core-mechanics-order');
      return {
        kind: 'directive.coreOutcomeReplacementRef.v1',
        transactionId,
        replacedOutcomeId: replacement.replacedOutcomeId,
        replacementOutcomeId: replacement.replacementOutcomeId
      };
    },
    async markRecoveryRequired(transactionId, recoveryBundle) {
      replacementPersistFailureCalls.push('core-recovery');
      replacementPersistFailureRecoveries.push({ transactionId, recoveryBundle: cloneJson(recoveryBundle) });
      return {
        id: recoveryBundle.id,
        status: 'required',
        reason: recoveryBundle.reason
      };
    }
  }
});

await assert.rejects(
  () => replacementPersistFailureCoordinator.checkpointMechanics({
    beforeCampaignState: baseState(),
    campaignState: committedState(),
    turnPacket,
    ingressId: 'ingress-core-mechanics-order',
    outcomeReplacement: {
      transactionId: 'txn-core-mechanics-order',
      idempotencyKey: 'outcome-replacement:txn-core-mechanics-order:persist-failure',
      type: 'rerunOutcome',
      replacedOutcomeId: 'outcome-old-core-mechanics-order',
      replacementOutcomeId: 'outcome-core-mechanics-order'
    }
  }),
  (error) => {
    assert.equal(error.code, 'DIRECTIVE_ACTIVE_SAVE_PERSIST_FAILED');
    return true;
  }
);
assert.deepEqual(replacementPersistFailureCalls, ['core-advance', 'core-mechanics', 'core-replacement', 'persist', 'core-recovery']);
assert.equal(replacementPersistFailureRecoveries.length, 1, 'CORE replacement persist failure should be durably recoverable');
assert.equal(replacementPersistFailureRecoveries[0].transactionId, 'txn-core-mechanics-order');
assert.equal(replacementPersistFailureRecoveries[0].recoveryBundle.reason, 'outcome-replacement-active-save-persist-failed');
assert.equal(replacementPersistFailureRecoveries[0].recoveryBundle.dependentOutcomeId, 'outcome-core-mechanics-order');
assert.equal(replacementPersistFailureRecoveries[0].recoveryBundle.repairDecision.action, 'reviewOutcomeReplacementPersistFailure');

const missingReplacementTransactionCalls = [];
const missingReplacementTransactionPersisted = [];
const missingReplacementTransactionCoordinator = createTurnCommitCoordinator({
  now: () => '2026-06-29T01:01:45.000Z',
  persist: async (next, summary) => {
    missingReplacementTransactionCalls.push('persist');
    missingReplacementTransactionPersisted.push({ state: cloneJson(next), summary });
    return { id: `save-missing-replacement-transaction-${missingReplacementTransactionPersisted.length}` };
  },
  coreTurnStore: {
    async getTransaction(transactionId) {
      return {
        id: transactionId,
        revisions: { mechanics: 0, runtime: 1, diagnostic: 0, prompt: 0 }
      };
    },
    async getRevisions() {
      return { mechanics: 0, runtime: 1, diagnostic: 0, prompt: 0 };
    },
    async advanceTurn() {
      missingReplacementTransactionCalls.push('core-advance');
      return { id: 'txn-core-mechanics-order', phase: 'routePending' };
    },
    async commitMechanics() {
      missingReplacementTransactionCalls.push('core-mechanics');
      return {
        turnId: 'core-turn-missing-replacement-transaction',
        outcomeId: 'outcome-core-mechanics-order',
        operationHash: 'core-operation-hash'
      };
    },
    async recordOutcomeReplacement() {
      missingReplacementTransactionCalls.push('core-replacement');
      return { kind: 'directive.coreOutcomeReplacementRef.v1' };
    }
  }
});

await assert.rejects(
  () => missingReplacementTransactionCoordinator.checkpointMechanics({
    beforeCampaignState: baseState(),
    campaignState: committedState(),
    turnPacket,
    ingressId: 'ingress-core-mechanics-order',
    outcomeReplacement: {
      idempotencyKey: 'outcome-replacement:missing-transaction',
      type: 'rerunOutcome',
      replacedOutcomeId: 'outcome-old-core-mechanics-order',
      replacementOutcomeId: 'outcome-core-mechanics-order'
    }
  }),
  (error) => {
    assert.equal(error.code, 'DIRECTIVE_CORE_OUTCOME_REPLACEMENT_TRANSACTION_REQUIRED');
    return true;
  }
);
assert.deepEqual(missingReplacementTransactionCalls, ['core-advance', 'core-mechanics']);
assert.equal(missingReplacementTransactionPersisted.length, 0, 'v1 checkpoint must not persist replacement records without explicit CORE replacement transaction');

const skippedMechanicsReplacementPersisted = [];
const skippedMechanicsReplacementCoordinator = createTurnCommitCoordinator({
  now: () => '2026-06-29T01:01:50.000Z',
  persist: async (next, summary) => {
    skippedMechanicsReplacementPersisted.push({ state: cloneJson(next), summary });
    return { id: `save-skipped-mechanics-replacement-${skippedMechanicsReplacementPersisted.length}` };
  },
  coreTurnStore: {
    async recordOutcomeReplacement() {
      return { kind: 'directive.coreOutcomeReplacementRef.v1' };
    }
  }
});

await assert.rejects(
  () => skippedMechanicsReplacementCoordinator.checkpointMechanics({
    beforeCampaignState: baseState(),
    campaignState: committedState(),
    turnPacket,
    ingressId: null,
    outcomeReplacement: {
      transactionId: 'txn-core-mechanics-order',
      idempotencyKey: 'outcome-replacement:skipped-mechanics',
      type: 'rerunOutcome',
      replacedOutcomeId: 'outcome-old-core-mechanics-order',
      replacementOutcomeId: 'outcome-core-mechanics-order'
    }
  }),
  (error) => {
    assert.equal(error.code, 'DIRECTIVE_CORE_OUTCOME_REPLACEMENT_MECHANICS_REQUIRED');
    return true;
  }
);
assert.equal(skippedMechanicsReplacementPersisted.length, 0, 'v1 checkpoint must not persist replacement records when CORE mechanics is skipped');

const replacementMechanicsCalls = [];
const replacementMechanicsPersisted = [];
const replacementMechanicsState = baseState();
replacementMechanicsState.runtimeTracking.ingressLedger[0].coreTransactionId = 'txn-original-committed-outcome';
const replacementMechanicsCoordinator = createTurnCommitCoordinator({
  now: () => '2026-06-29T01:01:55.000Z',
  persist: async (next, summary) => {
    replacementMechanicsCalls.push('persist');
    replacementMechanicsPersisted.push({ state: cloneJson(next), summary });
    return { id: `save-replacement-mechanics-${replacementMechanicsPersisted.length}` };
  },
  coreTurnStore: {
    async getTransaction(transactionId) {
      replacementMechanicsCalls.push(['getTransaction', transactionId]);
      assert.equal(transactionId, 'txn-fresh-replacement-branch');
      return {
        id: transactionId,
        revisions: { mechanics: 0, runtime: 2, diagnostic: 0, prompt: 0 }
      };
    },
    async getRevisions() {
      return { mechanics: 0, runtime: 2, diagnostic: 0, prompt: 0 };
    },
    async advanceTurn(transactionId, patch) {
      replacementMechanicsCalls.push(['core-advance', transactionId]);
      assert.equal(transactionId, 'txn-fresh-replacement-branch');
      assert.equal(patch.phase, 'routePending');
      return { id: transactionId, phase: patch.phase };
    },
    async commitMechanics(transactionId, bundle) {
      replacementMechanicsCalls.push(['core-mechanics', transactionId]);
      assert.equal(transactionId, 'txn-fresh-replacement-branch');
      assert.equal(bundle.outcomeId, 'outcome-core-mechanics-order');
      return {
        turnId: 'core-turn-fresh-replacement',
        outcomeId: bundle.outcomeId,
        operationHash: 'fresh-replacement-operation-hash'
      };
    },
    async recordOutcomeReplacement(transactionId, replacement) {
      replacementMechanicsCalls.push(['core-replacement', transactionId]);
      assert.equal(transactionId, 'txn-fresh-replacement-branch');
      assert.equal(replacement.replacedTransactionId, 'txn-original-committed-outcome');
      assert.equal(replacement.replacementTransactionId, 'txn-fresh-replacement-branch');
      return {
        kind: 'directive.coreOutcomeReplacementRef.v1',
        transactionId,
        replacedTransactionId: replacement.replacedTransactionId,
        replacementTransactionId: replacement.replacementTransactionId,
        replacedOutcomeId: replacement.replacedOutcomeId,
        replacementOutcomeId: replacement.replacementOutcomeId
      };
    }
  }
});

const replacementMechanicsResult = await replacementMechanicsCoordinator.checkpointMechanics({
  beforeCampaignState: replacementMechanicsState,
  campaignState: {
    ...committedState(),
    runtimeTracking: replacementMechanicsState.runtimeTracking
  },
  turnPacket,
  ingressId: 'ingress-core-mechanics-order',
  outcomeReplacement: {
    transactionId: 'txn-fresh-replacement-branch',
    replacedTransactionId: 'txn-original-committed-outcome',
    replacementTransactionId: 'txn-fresh-replacement-branch',
    idempotencyKey: 'outcome-replacement:fresh-branch',
    type: 'rerunOutcome',
    replacedOutcomeId: 'outcome-old-core-mechanics-order',
    replacementOutcomeId: 'outcome-core-mechanics-order'
  }
});
assert.equal(replacementMechanicsResult.coreMechanics.transactionId, 'txn-fresh-replacement-branch');
assert.equal(replacementMechanicsResult.coreOutcomeReplacement.transactionId, 'txn-fresh-replacement-branch');
assert.equal(replacementMechanicsPersisted[0].state.turnLedger.entries.at(-1).coreTransactionId, 'txn-fresh-replacement-branch');

const malformedReducerPacket = cloneJson(turnPacket);
malformedReducerPacket.stateDelta.openWorld.reducerBundle.diagnostics.operationCount = 2;
const malformedCalls = [];
const malformedPersisted = [];
const malformedCoordinator = createTurnCommitCoordinator({
  now: () => '2026-06-29T01:02:00.000Z',
  persist: async (next, summary) => {
    malformedCalls.push('persist');
    malformedPersisted.push({ state: cloneJson(next), summary });
    return { id: `save-malformed-${malformedPersisted.length}` };
  },
  coreTurnStore: {
    async advanceTurn() {
      malformedCalls.push('core-advance');
      return { id: 'txn-core-mechanics-order', phase: 'routePending' };
    },
    async commitMechanics() {
      malformedCalls.push('core-mechanics');
      return { turnId: 'should-not-commit' };
    }
  }
});

await assert.rejects(
  () => malformedCoordinator.checkpointMechanics({
    beforeCampaignState: baseState(),
    campaignState: committedState(),
    turnPacket: malformedReducerPacket,
    ingressId: 'ingress-core-mechanics-order'
  }),
  /operationCount mismatch/
);
assert.deepEqual(malformedCalls, [], 'malformed reducer bundles must fail before CORE writes or v1 persistence');
assert.equal(malformedPersisted.length, 0);

const storage = createMemoryStorage();
const adapter = createLogicalStorageAdapter({ storage, hostId: 'fake' });
const staleCoreStore = createCoreStoreV2({
  adapter,
  campaignId: 'campaign-core-mechanics-order',
  saveId: 'save-core-mechanics-order',
  now: () => '2026-06-29T01:03:00.000Z'
});
const staleSourceFrame = {
  id: 'frame-stale-core-mechanics',
  campaignId: 'campaign-core-mechanics-order',
  saveId: 'save-core-mechanics-order',
  chatId: 'ashes-chat',
  hostMessageId: 'player-stale-core-mechanics',
  textHash: hashStableJson({ text: 'stale mechanics source' }),
  sourceRevision: 0
};
await staleCoreStore.beginTurn(staleSourceFrame, {
  transactionId: 'txn-stale-core-mechanics',
  ingressId: 'ingress-core-mechanics-order',
  idempotencyKey: 'begin-stale-core-mechanics'
});
const concurrentSourceFrame = {
  ...staleSourceFrame,
  id: 'frame-concurrent-core-mechanics',
  hostMessageId: 'player-concurrent-core-mechanics',
  textHash: hashStableJson({ text: 'concurrent mechanics source' })
};
await staleCoreStore.beginTurn(concurrentSourceFrame, {
  transactionId: 'txn-concurrent-core-mechanics',
  ingressId: 'ingress-concurrent-core-mechanics',
  idempotencyKey: 'begin-concurrent-core-mechanics'
});
await staleCoreStore.advanceTurn('txn-concurrent-core-mechanics', {
  phase: 'routePending',
  route: 'directivePosted',
  idempotencyKey: 'route-concurrent-core-mechanics'
});
await staleCoreStore.commitMechanics('txn-concurrent-core-mechanics', {
  baseMechanicsRevision: 0,
  idempotencyKey: 'mechanics-concurrent-core-mechanics',
  turnId: 'turn-concurrent-core-mechanics',
  outcomeId: 'outcome-concurrent-core-mechanics',
  summary: 'Concurrent mechanics commit.',
  operations: [{ domain: 'mission', op: 'domainCommitted', valueHash: 'concurrent' }],
  committedRoots: ['mission'],
  phaseAfter: 'mechanicsPending'
});
const staleState = baseState();
staleState.runtimeTracking.ingressLedger[0].coreTransactionId = 'txn-stale-core-mechanics';
const stalePersisted = [];
const staleCoordinator = createTurnCommitCoordinator({
  now: () => '2026-06-29T01:04:00.000Z',
  persist: async (next, summary) => {
    stalePersisted.push({ state: cloneJson(next), summary });
    return { id: `save-stale-${stalePersisted.length}` };
  },
  coreTurnStore: staleCoreStore
});
const staleEventsBefore = staleCoreStore.state.events.length;
await assert.rejects(
  () => staleCoordinator.checkpointMechanics({
    beforeCampaignState: staleState,
    campaignState: {
      ...committedState(),
      runtimeTracking: staleState.runtimeTracking
    },
    turnPacket,
    ingressId: 'ingress-core-mechanics-order'
  }),
  (error) => {
    assert.equal(error.code, 'DIRECTIVE_CORE_STALE_MECHANICS_REVISION');
    assert.equal(error.details?.status, 'error');
    return true;
  }
);
assert.equal(stalePersisted.length, 0, 'stale CORE mechanics must not persist the v1 checkpoint');
assert.equal(staleCoreStore.state.events.length, staleEventsBefore, 'stale CORE mechanics must fail before route advance');
assert.equal(staleCoreStore.state.transactions['txn-stale-core-mechanics'].phase, 'observed');

console.log('Turn commit coordinator CORE mechanics ordering tests passed.');
