import assert from 'node:assert/strict';

import {
  createSyntheticFastGateRuntime
} from '../../src/runtime/fast-gate-runtime-synthetic.mjs';
import {
  createSyntheticMechanicsNarrationRuntime
} from '../../src/runtime/mechanics-narration-runtime-synthetic.mjs';
import {
  createSyntheticRepairRuntime
} from '../../src/runtime/repair-runtime-synthetic.mjs';
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

function createHarness({ nowPrefix = '2026-06-28T18:00', nowValues = [] } = {}) {
  let tick = 0;
  const storage = createLoggingStorage();
  const adapter = createLogicalStorageAdapter({ storage, hostId: 'fake' });
  const coreStore = createCoreStoreV2({
    adapter,
    campaignId: 'campaign-repair-synthetic',
    saveId: 'save-repair-synthetic',
    now: () => `${nowPrefix}:${String(tick++).padStart(2, '0')}.000Z`
  });
  let clockIndex = 0;
  const clock = () => nowValues[clockIndex++] || `${nowPrefix}:${String(clockIndex + 30).padStart(2, '0')}.000Z`;
  return { storage, adapter, coreStore, clock };
}

async function createCommittedDirectiveResponse(harness, {
  transactionId = 'txn-sam-33',
  frameId = 'frame-sam-33',
  hostMessageId = '33',
  responseHostMessageId = '34',
  playerTextHash = hashStableJson({ text: 'Sam gave the earlier answer.' }),
  outcomeId = 'outcome-sam-1',
  responseId = 'response-sam-1'
} = {}) {
  const fastGate = createSyntheticFastGateRuntime({
    coreStore: harness.coreStore,
    clock: harness.clock,
    deterministicRoute: () => ({
      route: 'directiveCommit',
      reason: 'consequential-command'
    }),
    storageWrites: harness.storage.writeLog
  });
  const gate = await fastGate.handleHostEvent({
    frameId,
    transactionId,
    campaignId: 'campaign-repair-synthetic',
    saveId: 'save-repair-synthetic',
    chatId: 'ashes-chat',
    hostMessageId,
    playerSubmittedAt: '2026-06-28T18:00:00.000Z',
    textHash: playerTextHash
  });
  assert.equal(gate.route, 'directiveCommit');

  const mechanicsNarration = createSyntheticMechanicsNarrationRuntime({
    coreStore: harness.coreStore,
    clock: harness.clock,
    startNarrationGeneration: async () => ({
      textHash: hashStableJson({ text: 'Directive response that depends on the original player row.' }),
      rawResponse: 'RAW_DIRECTIVE_RESPONSE'
    }),
    storageWrites: harness.storage.writeLog
  });
  const posted = await mechanicsNarration.startDirectiveNarration(transactionId, {
    playerSubmittedAt: '2026-06-28T18:00:00.000Z',
    operationBundle: {
      baseMechanicsRevision: 0,
      idempotencyKey: `mechanics:${transactionId}`,
      turnId: `turn:${transactionId}`,
      outcomeId,
      summary: 'Committed dependent mechanics before narration.',
      committedRoots: ['mission', 'commandLog'],
      operations: [{ domain: 'mission', op: 'appendLog', summary: 'Dependent outcome committed.' }]
    },
    responseRef: {
      responseId,
      hostMessageId: responseHostMessageId,
      idempotencyKey: `response:${transactionId}`
    },
    providerRequest: {
      sourceToken: `source-token:${transactionId}`
    }
  });
  assert.equal(posted.status, 'posted');
  assert.equal(harness.coreStore.state.transactions[transactionId].phase, 'visibleResponsePosted');
  return posted;
}

function createRepairRuntime(harness) {
  const cancelCalls = [];
  const restartCalls = [];
  let classifyCalls = 0;
  const repair = createSyntheticRepairRuntime({
    coreStore: harness.coreStore,
    clock: harness.clock,
    cancelBackgroundWork: async (payload) => {
      cancelCalls.push(payload);
      return { ok: true };
    },
    restartSameTransaction: async (payload) => {
      restartCalls.push(payload);
      return { ok: true };
    },
    classifyTurn: async () => {
      classifyCalls += 1;
      throw new Error('REPAIR recovery must not classify a replacement turn');
    }
  });
  return {
    repair,
    cancelCalls,
    restartCalls,
    classifyCalls: () => classifyCalls
  };
}

const oldSamHash = hashStableJson({ text: 'Sam listened, weighing the room before she answered.' });
const editedSamText = 'Sam listened, weighing the room before she answered. Sam waited for her reply.';
const newSamHash = hashStableJson({ text: editedSamText });

const samHarness = createHarness({
  nowValues: [
    '2026-06-28T18:01:01.000Z',
    '2026-06-28T18:01:02.000Z',
    '2026-06-28T18:01:10.000Z',
    '2026-06-28T18:01:25.000Z',
    '2026-06-28T18:02:00.000Z'
  ]
});
await createCommittedDirectiveResponse(samHarness, {
  transactionId: 'txn-sam-33',
  frameId: 'frame-sam-33',
  hostMessageId: '33',
  responseHostMessageId: '34',
  playerTextHash: oldSamHash,
  outcomeId: 'outcome-sam-1',
  responseId: 'response-sam-1'
});
const samRepairHarness = createRepairRuntime(samHarness);
const beforeSamRepairEvents = samHarness.coreStore.state.events.length;
const samRepair = await samRepairHarness.repair.handleHostMutation({
  mutationId: 'mutation-sam-33-edit',
  mutationKind: 'player-edited',
  transactionId: 'txn-sam-33',
  sourceToken: 'source-token:txn-sam-33',
  hostMessageId: '33',
  role: 'player',
  oldTextHash: oldSamHash,
  newTextHash: newSamHash,
  message: {
    id: '33',
    is_user: true,
    mes: editedSamText
  },
  latestBoundary: {
    isLatestActionablePlayerRow: false,
    hasDependentAssistant: true
  },
  dependent: {
    outcomeId: 'outcome-sam-1',
    responseId: 'response-sam-1',
    assistantHostMessageId: '34'
  }
});

assert.equal(samRepair.action, 'recoveryReview');
assert.equal(samRepair.recoveryRequired, true);
assert.equal(samRepair.normalTurnAllowed, false);
assert.equal(samRepair.sourceMutation.oldTextHash, oldSamHash);
assert.equal(samRepair.sourceMutation.newTextHash, newSamHash);
assert.equal(samRepairHarness.cancelCalls.length, 1);
assert.equal(samRepairHarness.cancelCalls[0].sourceToken, 'source-token:txn-sam-33');
assert.equal(samRepairHarness.restartCalls.length, 0);
assert.equal(samRepairHarness.classifyCalls(), 0);
assert.equal(samHarness.coreStore.state.transactions['txn-sam-33'].phase, 'recoveryRequired');
assert.equal(samHarness.coreStore.state.transactions['txn-sam-33'].outcomeId, 'outcome-sam-1');
assert.equal(
  samHarness.coreStore.state.events.filter((event) => event.type === 'turnObserved').length,
  1,
  'dependent edit must not create a replacement observed ingress'
);
assert.equal(
  samHarness.coreStore.state.events.filter((event) => event.type === 'recoveryRequired').length,
  1
);
assert.equal(samHarness.coreStore.state.events.length, beforeSamRepairEvents + 1);
const samRecoveryEvent = samHarness.coreStore.state.events.at(-1);
assert.equal(samRecoveryEvent.type, 'recoveryRequired');
assert.equal(samRecoveryEvent.payload.sourceMutation.mutationKind, 'player-edited');
assert.equal(samRecoveryEvent.payload.sourceMutation.oldTextHash, oldSamHash);
assert.equal(samRecoveryEvent.payload.sourceMutation.newTextHash, newSamHash);
assert.deepEqual(samRecoveryEvent.payload.allowedActions, [
  'rollback-outcome',
  'replace-dependent-response',
  'branch',
  'review'
]);
assert.equal(samRecoveryEvent.payload.dependentOutcomeId, 'outcome-sam-1');
assert.equal(samRecoveryEvent.payload.dependentResponseId, 'response-sam-1');
const samProjections = samHarness.coreStore.readProjections();
assert.equal(samProjections.ingressLedger.length, 1);
assert.equal(samProjections.ingressLedger[0].status, 'recoveryRequired');
assert.equal(samProjections.ingressLedger[0].textHash, oldSamHash);
assert.equal(samProjections.responses.length, 1);
assert.equal(samProjections.recoveryJournal.length, 1);
assert.equal(samProjections.recoveryJournal[0].sourceMutation.mutationKind, 'player-edited');
assert.equal(samProjections.recoveryJournal[0].sourceMutation.oldTextHash, oldSamHash);
assert.equal(samProjections.recoveryJournal[0].sourceMutation.newTextHash, newSamHash);
assert.equal(samProjections.recoveryJournal[0].dependentOutcomeId, 'outcome-sam-1');
assert.equal(samProjections.recoveryJournal[0].dependentResponseId, 'response-sam-1');
assert.deepEqual(samProjections.recoveryJournal[0].allowedActions, [
  'rollback-outcome',
  'replace-dependent-response',
  'branch',
  'review'
]);
assert.equal(JSON.stringify(samHarness.coreStore.state).includes('Sam waited for her reply'), false);
assert.equal(JSON.stringify(samHarness.coreStore.state).includes('RAW_DIRECTIVE_RESPONSE'), false);

const beforeSamReplayEvents = samHarness.coreStore.state.events.length;
const samReplay = await samRepairHarness.repair.handleHostMutation({
  mutationId: 'mutation-sam-33-edit',
  mutationKind: 'player-edited',
  transactionId: 'txn-sam-33',
  sourceToken: 'source-token:txn-sam-33',
  hostMessageId: '33',
  role: 'player',
  oldTextHash: oldSamHash,
  newTextHash: newSamHash,
  message: { id: '33', is_user: true, mes: editedSamText },
  latestBoundary: { hasDependentAssistant: true },
  dependent: { outcomeId: 'outcome-sam-1', responseId: 'response-sam-1' }
});
assert.deepEqual(samReplay, samRepair);
assert.equal(samHarness.coreStore.state.events.length, beforeSamReplayEvents);
assert.equal(samRepairHarness.cancelCalls.length, 1, 'same mutation id must not cancel twice');

const latestHarness = createHarness({
  nowPrefix: '2026-06-28T18:10',
  nowValues: [
    '2026-06-28T18:10:01.000Z',
    '2026-06-28T18:10:02.000Z',
    '2026-06-28T18:10:04.000Z',
    '2026-06-28T18:10:05.000Z'
  ]
});
const latestFastGate = createSyntheticFastGateRuntime({
  coreStore: latestHarness.coreStore,
  clock: latestHarness.clock,
  deterministicRoute: () => ({ route: 'hostContinue', reason: 'routine-host-prose' }),
  releaseHostGeneration: async () => ({ ok: true }),
  storageWrites: latestHarness.storage.writeLog
});
await latestFastGate.handleHostEvent({
  frameId: 'frame-latest-40',
  transactionId: 'txn-latest-40',
  campaignId: 'campaign-repair-synthetic',
  saveId: 'save-repair-synthetic',
  chatId: 'ashes-chat',
  hostMessageId: '40',
  playerSubmittedAt: '2026-06-28T18:10:00.000Z',
  textHash: hashStableJson({ text: 'Latest player row before edit.' })
});
const latestRepairHarness = createRepairRuntime(latestHarness);
const latestEdit = await latestRepairHarness.repair.handleHostMutation({
  mutationId: 'mutation-latest-40-edit',
  mutationKind: 'player-edited',
  transactionId: 'txn-latest-40',
  sourceToken: 'source-token:txn-latest-40',
  hostMessageId: '40',
  role: 'player',
  oldTextHash: hashStableJson({ text: 'Latest player row before edit.' }),
  newTextHash: hashStableJson({ text: 'Latest player row after edit.' }),
  message: {
    id: '40',
    is_user: true,
    extra: {
      sc_ghosted: true
    }
  },
  latestBoundary: {
    isLatestActionablePlayerRow: true,
    hasDependentAssistant: false
  }
});
assert.equal(latestEdit.action, 'restartSameTransaction');
assert.equal(latestEdit.recoveryRequired, false);
assert.equal(latestEdit.sourceMutation.ghostedBySummaryception, true);
assert.equal(latestRepairHarness.cancelCalls.length, 1);
assert.equal(latestRepairHarness.restartCalls.length, 1);
assert.equal(
  latestHarness.coreStore.state.events.filter((event) => event.type === 'recoveryRequired').length,
  0
);
assert.equal(latestRepairHarness.classifyCalls(), 0);

const visibilityHarness = createHarness({ nowPrefix: '2026-06-28T18:20' });
const visibilityRepairHarness = createRepairRuntime(visibilityHarness);
const summaryceptionGhost = await visibilityRepairHarness.repair.handleHostMutation({
  mutationId: 'visibility-summaryception-1',
  mutationKind: 'visibility-changed',
  hostMessageId: '50',
  role: 'player',
  message: {
    id: '50',
    is_user: true,
    extra: { sc_ghosted: true }
  },
  index: 50
});
assert.equal(summaryceptionGhost.action, 'visibilityOnlySourceRow');
assert.equal(summaryceptionGhost.sourceRowExists, true);
assert.equal(summaryceptionGhost.visibility.ghostedBySummaryception, true);

const summarizedRange = await visibilityRepairHarness.repair.handleHostMutation({
  mutationId: 'visibility-summaryception-range',
  mutationKind: 'visibility-changed',
  hostMessageId: '51',
  role: 'assistant',
  message: { id: '51' },
  index: 51,
  chatMetadata: {
    summaryception: {
      summarizedRanges: [[50, 52]]
    }
  }
});
assert.equal(summarizedRange.action, 'sourceRowContinues');
assert.equal(summarizedRange.visibility.summarizedBySummaryception, true);
assert.equal(summarizedRange.visibility.sourceMutation, false);

const memoryBooksUnhidden = await visibilityRepairHarness.repair.handleHostMutation({
  mutationId: 'visibility-memorybooks-unhidden',
  mutationKind: 'visibility-changed',
  hostMessageId: '52',
  role: 'player',
  message: { id: '52' },
  index: 52,
  chatMetadata: {
    memoryBooks: {
      unhiddenIndices: [52]
    }
  }
});
assert.equal(memoryBooksUnhidden.action, 'visibilityOnlySourceRow');
assert.equal(memoryBooksUnhidden.visibility.unhiddenByMemoryBooks, true);

const vectFoxPromptExcluded = await visibilityRepairHarness.repair.handleHostMutation({
  mutationId: 'visibility-vectfox-excluded',
  mutationKind: 'visibility-changed',
  hostMessageId: '53',
  role: 'player',
  message: { id: '53' },
  index: 53,
  chatMetadata: {
    vectFox: {
      promptExcludedIndices: [53]
    }
  }
});
assert.equal(vectFoxPromptExcluded.action, 'visibilityOnlySourceRow');
assert.equal(vectFoxPromptExcluded.visibility.promptExcludedByVectFox, true);
assert.equal(visibilityRepairHarness.cancelCalls.length, 0);
assert.equal(visibilityRepairHarness.restartCalls.length, 0);
assert.equal(visibilityRepairHarness.classifyCalls(), 0);
assert.equal(visibilityHarness.coreStore.state.events.length, 0);

const deleteHarness = createHarness({
  nowPrefix: '2026-06-28T18:30',
  nowValues: [
    '2026-06-28T18:30:01.000Z',
    '2026-06-28T18:30:02.000Z',
    '2026-06-28T18:30:10.000Z',
    '2026-06-28T18:30:25.000Z',
    '2026-06-28T18:30:40.000Z'
  ]
});
await createCommittedDirectiveResponse(deleteHarness, {
  transactionId: 'txn-delete-60',
  frameId: 'frame-delete-60',
  hostMessageId: '60',
  responseHostMessageId: '61',
  playerTextHash: hashStableJson({ text: 'Deleted dependent player row.' }),
  outcomeId: 'outcome-delete-60',
  responseId: 'response-delete-60'
});
const deleteRepairHarness = createRepairRuntime(deleteHarness);
const deletedButUnhidden = await deleteRepairHarness.repair.handleHostMutation({
  mutationId: 'mutation-delete-60',
  mutationKind: 'player-deleted',
  transactionId: 'txn-delete-60',
  sourceToken: 'source-token:txn-delete-60',
  hostMessageId: '60',
  role: 'player',
  oldTextHash: hashStableJson({ text: 'Deleted dependent player row.' }),
  message: {
    id: '60',
    deleted: true,
    extra: {
      memoryBooks: {
        unhidden: true
      }
    }
  },
  index: 60,
  chatMetadata: {
    summaryception: {
      summarizedRanges: [{ startIndex: 58, endIndex: 62 }]
    },
    vectFox: {
      promptExcludedIndices: [60]
    }
  },
  latestBoundary: {
    isLatestActionablePlayerRow: false,
    hasDependentAssistant: true
  },
  dependent: {
    outcomeId: 'outcome-delete-60',
    responseId: 'response-delete-60',
    assistantHostMessageId: '61'
  }
});
assert.equal(deletedButUnhidden.action, 'recoveryReview');
assert.equal(deletedButUnhidden.sourceMutation.sourceMutation, true);
assert.equal(deletedButUnhidden.sourceMutation.unhiddenByMemoryBooks, true);
assert.equal(deletedButUnhidden.sourceMutation.promptExcludedByVectFox, true);
assert.equal(deleteRepairHarness.cancelCalls.length, 1);
const deleteRecoveryEvent = deleteHarness.coreStore.state.events.at(-1);
assert.equal(deleteRecoveryEvent.type, 'recoveryRequired');
assert.equal(deleteRecoveryEvent.payload.sourceMutation.sourceMutationReasons.includes('host-delete'), true);
assert.equal(deleteRecoveryEvent.payload.sourceMutation.unhiddenByMemoryBooks, true);
assert.equal(deleteRecoveryEvent.payload.sourceMutation.promptExcludedByVectFox, true);
assert.equal(deleteRepairHarness.classifyCalls(), 0);

console.log('REPAIR synthetic runtime tests passed.');
