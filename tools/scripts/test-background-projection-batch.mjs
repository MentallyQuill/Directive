import assert from 'node:assert/strict';

import {
  createSyntheticForgeCoordinator
} from '../../src/jobs/forge-coordinator-synthetic.mjs';
import {
  createForgeBatchCommit
} from '../../src/jobs/forge-contracts.mjs';
import {
  createSyntheticFastGateRuntime
} from '../../src/runtime/fast-gate-runtime-synthetic.mjs';
import {
  createSyntheticLensPromptScheduler
} from '../../src/runtime/lens-prompt-scheduler-synthetic.mjs';
import {
  hashStableJson
} from '../../src/runtime/architecture-redesign-contracts.mjs';
import {
  createCoreStoreV2,
  loadCoreStoreStateV2,
  readCoreStoreProjectionsV2
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

function createHarness({ nowPrefix = '2026-06-28T21:00', nowValues = [] } = {}) {
  let tick = 0;
  const storage = createLoggingStorage();
  const adapter = createLogicalStorageAdapter({ storage, hostId: 'fake' });
  const coreStore = createCoreStoreV2({
    adapter,
    campaignId: 'campaign-forge-synthetic',
    saveId: 'save-forge-synthetic',
    now: () => `${nowPrefix}:${String(tick++).padStart(2, '0')}.000Z`
  });
  let clockIndex = 0;
  const clock = () => nowValues[clockIndex++] || `${nowPrefix}:${String(clockIndex + 30).padStart(2, '0')}.000Z`;
  return { storage, adapter, coreStore, clock };
}

async function beginHostTurn(harness, { transactionId = 'txn-forge-1', hostMessageId = '100' } = {}) {
  const fastGate = createSyntheticFastGateRuntime({
    coreStore: harness.coreStore,
    clock: harness.clock,
    deterministicRoute: () => ({ route: 'hostContinue', reason: 'host-turn-for-forge' }),
    releaseHostGeneration: async () => ({ ok: true }),
    storageWrites: harness.storage.writeLog
  });
  return fastGate.handleHostEvent({
    frameId: `frame:${transactionId}`,
    transactionId,
    campaignId: 'campaign-forge-synthetic',
    saveId: 'save-forge-synthetic',
    chatId: 'ashes-chat',
    hostMessageId,
    playerSubmittedAt: '2026-06-28T21:00:00.000Z',
    textHash: hashStableJson({ text: `FORGE source ${hostMessageId}` })
  });
}

const harness = createHarness({
  nowValues: [
    '2026-06-28T21:01:01.000Z',
    '2026-06-28T21:01:02.000Z',
    '2026-06-28T21:01:04.000Z',
    '2026-06-28T21:01:10.000Z',
    '2026-06-28T21:01:20.000Z',
    '2026-06-28T21:01:30.000Z'
  ]
});
const gate = await beginHostTurn(harness, { transactionId: 'txn-forge-clean', hostMessageId: '100' });
const lensBuildCalls = [];
const lens = createSyntheticLensPromptScheduler({
  coreStore: harness.coreStore,
  clock: harness.clock,
  buildDirectivePromptPacket: async (payload) => {
    lensBuildCalls.push(payload);
    return {
      hash: hashStableJson({ revision: payload.revision, dirtyDomains: payload.dirtyDomains }),
      blocks: [{
        id: 'forge-background',
        promptKey: 'directive.forge.background',
        title: 'FORGE Background Prompt',
        text: 'Background effects have updated Directive context.',
        placement: 'inPrompt',
        depth: 0,
        role: 'system'
      }]
    };
  },
  installPromptPacket: async () => ({ ok: true }),
  observeExternalPromptEnvironment: async () => ({
    host: 'sillytavern',
    status: 'observed',
    promptKeys: ['summaryception', '3_vectfox'],
    summaryception: {
      installed: true,
      enabled: true,
      promptKeyActive: true,
      promptText: 'RAW_EXTERNAL_SUMMARY'
    },
    vectFox: {
      installed: true,
      enabled: true,
      promptKeys: ['3_vectfox'],
      vectorPayload: ['RAW_VECTOR_RESULT']
    }
  })
});
const sourceChecks = [];
const workerCalls = [];
const forge = createSyntheticForgeCoordinator({
  coreStore: harness.coreStore,
  lens,
  clock: harness.clock,
  isSourceCurrent: async (payload) => {
    sourceChecks.push(payload);
    return { ok: true };
  }
});
const workers = [
  {
    id: 'continuity',
    allowedRoots: ['continuity'],
    async run(payload) {
      workerCalls.push({ workerId: 'continuity', signalPresent: Boolean(payload.signal) });
      return {
        rawPrompt: 'RAW_CONTINUITY_PROMPT',
        rawResponse: 'RAW_CONTINUITY_RESPONSE',
        promptDirtyDomains: ['continuity'],
        operations: [{
          domain: 'continuity',
          op: 'upsertFactHash',
          path: 'continuity.factIndex',
          value: { id: 'fact-forge-1', rawText: 'RAW_FACT_TEXT' },
          summary: 'Continuity fact hash updated.'
        }]
      };
    }
  },
  {
    id: 'crew',
    allowedRoots: ['crew'],
    async run(payload) {
      workerCalls.push({ workerId: 'crew', signalPresent: Boolean(payload.signal) });
      return {
        promptDirtyDomains: ['crewShipRelationship'],
        operations: [{
          domain: 'crew',
          op: 'append',
          path: 'crew.casualties',
          value: { crewId: 'crew-forge-1', summary: 'Minor injury under observation.' },
          summary: 'Crew follow-up recorded.'
        }]
      };
    }
  }
];
const clean = await forge.run({
  transactionId: 'txn-forge-clean',
  sourceToken: 'source-token-forge-clean',
  sourceFrame: gate.sourceFrame,
  committedOutcomeId: 'outcome-forge-clean',
  baseRevisions: { mechanics: harness.coreStore.state.revisions.mechanics },
  materializedHead: { mission: { active: true } },
  cpmDigest: { hash: 'cpm-forge-clean', sourceHash: 'cpm-source-forge-clean' },
  requestedEffects: {
    sidecarProjection: { continuity: true, crew: true },
    commandLogSummary: true
  },
  workers,
  lens,
  binding: {
    campaignId: 'campaign-forge-synthetic',
    saveId: 'save-forge-synthetic',
    chatId: 'ashes-chat'
  },
  campaignContext: {
    campaignId: 'campaign-forge-synthetic',
    saveId: 'save-forge-synthetic',
    chatId: 'ashes-chat'
  },
  externalContextOutputs: {
    summaryception: {
      rawSummary: 'RAW_EXTERNAL_SUMMARY'
    },
    vectFox: {
      vectorPayload: ['RAW_VECTOR_RESULT']
    },
    memoryBooks: {
      rawPromptBody: 'RAW_MEMORY_BOOK_PROMPT'
    }
  },
  idempotencyKey: 'forge-clean-1'
});
assert.equal(clean.status, 'applied');
assert.equal(clean.operationCount, 2);
assert.equal(workerCalls.length, 2);
assert.deepEqual(sourceChecks.map((entry) => entry.phase), ['preflight', 'beforeApply']);
assert.equal(harness.coreStore.state.events.filter((event) => event.type === 'backgroundBatchCommitted').length, 1);
assert.equal(harness.coreStore.state.transactions['txn-forge-clean'].backgroundBatchId, 'forge:txn-forge-clean');
assert.equal(harness.coreStore.state.revisions.mechanics, 1);
assert.equal(harness.coreStore.state.revisions.runtime, 4);
assert.equal(harness.coreStore.state.diagnostics.filter((entry) => entry.type === 'forge').length, 1);
assert.equal(clean.lensResult.status, 'installed');
assert.equal(lensBuildCalls.length, 1, 'FORGE should ask LENS for one prompt rebuild');
assert.deepEqual(clean.promptDirtyDomains, ['continuity', 'crewShipRelationship']);
const cleanStateJson = JSON.stringify(harness.coreStore.state);
assert.equal(cleanStateJson.includes('RAW_CONTINUITY_PROMPT'), false);
assert.equal(cleanStateJson.includes('RAW_CONTINUITY_RESPONSE'), false);
assert.equal(cleanStateJson.includes('RAW_FACT_TEXT'), false);
assert.equal(cleanStateJson.includes('RAW_EXTERNAL_SUMMARY'), false);
assert.equal(cleanStateJson.includes('RAW_VECTOR_RESULT'), false);
assert.equal(cleanStateJson.includes('RAW_MEMORY_BOOK_PROMPT'), false);
const hydratedCleanState = await loadCoreStoreStateV2(harness.adapter, {
  campaignId: 'campaign-forge-synthetic',
  saveId: 'save-forge-synthetic'
});
assert.deepEqual(hydratedCleanState.promptDirtyDomains, ['continuity', 'crewShipRelationship'], 'hydrated CORE state must derive FORGE dirty domains from background events');
assert.equal(hydratedCleanState.transactions['txn-forge-clean'].backgroundBatchIds.includes('forge:txn-forge-clean'), true, 'hydrated CORE state must derive FORGE batch ids from background events');
assert.equal(
  hydratedCleanState.transactions['txn-forge-clean'].backgroundBatches.some((entry) => (
    entry.batchId === 'forge:txn-forge-clean'
    && entry.operationCount === 2
    && entry.workerCount === 2
  )),
  true,
  'hydrated CORE state must derive FORGE background summaries from appended events'
);
const hydratedCleanStore = createCoreStoreV2({
  adapter: harness.adapter,
  campaignId: 'campaign-forge-synthetic',
  saveId: 'save-forge-synthetic',
  now: harness.clock,
  initialState: hydratedCleanState
});
const hydratedBackgroundEventCount = hydratedCleanStore.state.events.filter((event) => event.type === 'backgroundBatchCommitted').length;
await hydratedCleanStore.commitBackgroundBatch('txn-forge-clean', {
  baseMechanicsRevision: hydratedCleanStore.state.revisions.mechanics,
  idempotencyKey: 'forge-clean-1',
  batchId: 'forge:txn-forge-clean',
  phaseAfter: 'backgroundSettling'
});
assert.equal(
  hydratedCleanStore.state.events.filter((event) => event.type === 'backgroundBatchCommitted').length,
  hydratedBackgroundEventCount,
  'hydrated CORE background replay must not append a second FORGE batch event'
);
await assert.rejects(
  () => hydratedCleanStore.commitBackgroundBatch('txn-forge-clean', {
    idempotencyKey: 'forge-clean-other-key',
    batchId: 'forge:txn-forge-clean',
    phaseAfter: 'backgroundSettling'
  }),
  /already has background batch/,
  'hydrated CORE background replay must reject a different key for an existing FORGE batch'
);
const cleanProjections = await readCoreStoreProjectionsV2(harness.adapter, {
  campaignId: 'campaign-forge-synthetic',
  saveId: 'save-forge-synthetic'
});
const cleanProjectedBatch = cleanProjections.backgroundBatches.find((entry) => (
  entry.transactionId === 'txn-forge-clean'
  && entry.batchId === 'forge:txn-forge-clean'
));
assert.ok(cleanProjectedBatch, 'persisted projections must derive the FORGE background batch from event segments');
assert.equal(cleanProjectedBatch.operationCount, 2);
assert.equal(cleanProjectedBatch.workerCount, 2);
assert.deepEqual(cleanProjectedBatch.dirtyDomains, ['continuity', 'crewShipRelationship']);
const replay = await forge.run({
  transactionId: 'txn-forge-clean',
  sourceToken: 'source-token-forge-clean',
  sourceFrame: gate.sourceFrame,
  baseRevisions: { mechanics: 0 },
  workers,
  idempotencyKey: 'forge-clean-1'
});
assert.equal(replay.status, 'replayed');
assert.equal(workerCalls.length, 2, 'same FORGE idempotency key must not rerun workers');

const noChangeHarness = createHarness({ nowPrefix: '2026-06-28T21:05' });
const noChangeGate = await beginHostTurn(noChangeHarness, { transactionId: 'txn-forge-no-change', hostMessageId: '105' });
let noChangeBuildCalls = 0;
const noChangeLens = createSyntheticLensPromptScheduler({
  coreStore: noChangeHarness.coreStore,
  clock: noChangeHarness.clock,
  buildDirectivePromptPacket: async () => {
    noChangeBuildCalls += 1;
    return {
      hash: 'no-change-should-not-build',
      blocks: []
    };
  },
  installPromptPacket: async () => ({ ok: true })
});
let noChangeWorkerCalls = 0;
const noChangeForge = createSyntheticForgeCoordinator({
  coreStore: noChangeHarness.coreStore,
  lens: noChangeLens,
  clock: noChangeHarness.clock,
  isSourceCurrent: async () => ({ ok: true })
});
const noChange = await noChangeForge.run({
  transactionId: 'txn-forge-no-change',
  sourceToken: 'source-token-forge-no-change',
  sourceFrame: noChangeGate.sourceFrame,
  baseRevisions: { mechanics: noChangeHarness.coreStore.state.revisions.mechanics },
  workers: [{
    id: 'continuity',
    allowedRoots: ['continuity'],
    async run() {
      noChangeWorkerCalls += 1;
      return {
        rawPrompt: 'RAW_NO_CHANGE_PROMPT',
        rawResponse: 'RAW_NO_CHANGE_RESPONSE',
        promptDirtyDomains: ['continuity'],
        operations: []
      };
    }
  }],
  lens: noChangeLens,
  binding: {
    campaignId: 'campaign-forge-synthetic',
    saveId: 'save-forge-synthetic',
    chatId: 'ashes-chat'
  },
  idempotencyKey: 'forge-no-change'
});
assert.equal(noChange.status, 'noChange');
assert.equal(noChange.providerCallAttempted, true);
assert.equal(noChange.applied, false);
assert.equal(noChange.operationCount, 0);
assert.equal(noChangeWorkerCalls, 1);
assert.equal(noChangeHarness.coreStore.state.events.filter((event) => event.type === 'backgroundBatchCommitted').length, 0, 'No-change FORGE run must not commit a CORE background batch.');
assert.equal(noChangeBuildCalls, 0, 'No-change FORGE run must not ask LENS for a prompt rebuild.');
assert.equal(noChangeHarness.coreStore.state.diagnostics.filter((entry) => entry.type === 'forge').length, 1, 'No-change FORGE run should be diagnostics-only.');
const noChangeStateJson = JSON.stringify(noChangeHarness.coreStore.state);
assert.equal(noChangeStateJson.includes('RAW_NO_CHANGE_PROMPT'), false);
assert.equal(noChangeStateJson.includes('RAW_NO_CHANGE_RESPONSE'), false);

const nullMechanicsBatch = createForgeBatchCommit({
  transactionId: 'txn-null-mechanics',
  idempotencyKey: 'forge-null-mechanics',
  baseRevisions: { mechanics: 0 },
  baseMechanicsRevision: null,
  workerResults: [{
    workerId: 'continuity',
    roleId: 'continuityTracker',
    status: 'accepted',
    operations: []
  }]
});
assert.equal(
  Object.prototype.hasOwnProperty.call(nullMechanicsBatch, 'baseMechanicsRevision'),
  false,
  'Explicit null baseMechanicsRevision must omit the CORE mechanics gate instead of falling back to baseRevisions.mechanics.'
);

const nullGateHarness = createHarness({ nowPrefix: '2026-06-28T21:05' });
await beginHostTurn(nullGateHarness, { transactionId: 'txn-forge-null-mechanics', hostMessageId: '105' });
nullGateHarness.coreStore.state.revisions.mechanics = 5;
await nullGateHarness.coreStore.commitBackgroundBatch('txn-forge-null-mechanics', {
  batchId: 'campaign-sidecar:null-mechanics',
  idempotencyKey: 'campaign-sidecar:null-mechanics',
  baseMechanicsRevision: null,
  phaseAfter: 'backgroundSettling',
  promptDirtyDomains: ['continuity'],
  operations: [],
  backgroundEffectRefs: [{
    kind: 'directive.nullMechanicsGateProof.v1',
    id: 'null-mechanics-gate-proof',
    hash: hashStableJson({ ok: true })
  }]
});
assert.equal(
  nullGateHarness.coreStore.state.events.some((event) => event.type === 'backgroundBatchCommitted'),
  true,
  'CORE background batch must ignore null baseMechanicsRevision and rely on source/currentness checks.'
);

const staleHarness = createHarness({ nowPrefix: '2026-06-28T21:10' });
const staleGate = await beginHostTurn(staleHarness, { transactionId: 'txn-forge-stale', hostMessageId: '110' });
let staleWorkerCalls = 0;
const staleForge = createSyntheticForgeCoordinator({
  coreStore: staleHarness.coreStore,
  clock: staleHarness.clock,
  isSourceCurrent: async () => ({ ok: false, reason: 'source-invalidated-by-repair' })
});
const stale = await staleForge.run({
  transactionId: 'txn-forge-stale',
  sourceToken: 'source-token-forge-stale',
  sourceFrame: staleGate.sourceFrame,
  baseRevisions: { mechanics: staleHarness.coreStore.state.revisions.mechanics },
  workers: [{
    id: 'ship',
    allowedRoots: ['ship'],
    async run() {
      staleWorkerCalls += 1;
      throw new Error('Stale source must not run provider work.');
    }
  }],
  idempotencyKey: 'forge-stale-preflight'
});
assert.equal(stale.status, 'staleBeforeProvider');
assert.equal(stale.providerCallAttempted, false);
assert.equal(staleWorkerCalls, 0);
assert.equal(staleHarness.coreStore.state.events.filter((event) => event.type === 'backgroundBatchCommitted').length, 0);

const staleAfterHarness = createHarness({ nowPrefix: '2026-06-28T21:20' });
const staleAfterGate = await beginHostTurn(staleAfterHarness, { transactionId: 'txn-forge-stale-after', hostMessageId: '120' });
let staleAfterCheckCount = 0;
let staleAfterWorkerCalls = 0;
const staleAfterForge = createSyntheticForgeCoordinator({
  coreStore: staleAfterHarness.coreStore,
  clock: staleAfterHarness.clock,
  isSourceCurrent: async () => {
    staleAfterCheckCount += 1;
    return staleAfterCheckCount === 1 ? { ok: true } : { ok: false, reason: 'edited-while-provider-running' };
  }
});
const staleAfter = await staleAfterForge.run({
  transactionId: 'txn-forge-stale-after',
  sourceToken: 'source-token-forge-stale-after',
  sourceFrame: staleAfterGate.sourceFrame,
  baseRevisions: { mechanics: staleAfterHarness.coreStore.state.revisions.mechanics },
  workers: [{
    id: 'ship',
    allowedRoots: ['ship'],
    async run() {
      staleAfterWorkerCalls += 1;
      return {
        rawResponse: 'RAW_STALE_PROVIDER_RESULT',
        operations: [{ domain: 'ship', op: 'append', path: 'ship.damage', value: { id: 'stale-after', rawText: 'RAW_STALE_VALUE' } }]
      };
    }
  }],
  idempotencyKey: 'forge-stale-after'
});
assert.equal(staleAfter.status, 'staleAfterProvider');
assert.equal(staleAfter.providerCallAttempted, true);
assert.equal(staleAfter.applied, false);
assert.equal(staleAfterWorkerCalls, 1);
assert.equal(staleAfterHarness.coreStore.state.events.filter((event) => event.type === 'backgroundBatchCommitted').length, 0);
assert.equal(JSON.stringify(staleAfterHarness.coreStore.state).includes('RAW_STALE_PROVIDER_RESULT'), false);
assert.equal(JSON.stringify(staleAfterHarness.coreStore.state).includes('RAW_STALE_VALUE'), false);

const conflictHarness = createHarness({ nowPrefix: '2026-06-28T21:30' });
const conflictGate = await beginHostTurn(conflictHarness, { transactionId: 'txn-forge-conflict', hostMessageId: '130' });
const conflictForge = createSyntheticForgeCoordinator({
  coreStore: conflictHarness.coreStore,
  clock: conflictHarness.clock,
  isSourceCurrent: async () => ({ ok: true })
});
const conflict = await conflictForge.run({
  transactionId: 'txn-forge-conflict',
  sourceToken: 'source-token-forge-conflict',
  sourceFrame: conflictGate.sourceFrame,
  baseRevisions: { mechanics: conflictHarness.coreStore.state.revisions.mechanics },
  workers: [
    {
      id: 'relationship',
      allowedRoots: ['relationships'],
      async run() {
        return { operations: [{ domain: 'relationships', op: 'set', path: 'relationships.seniorCrew', value: [] }] };
      }
    },
    {
      id: 'crew',
      allowedRoots: ['relationships'],
      async run() {
        return { operations: [{ domain: 'relationships', op: 'set', path: 'relationships.seniorCrew', value: [] }] };
      }
    }
  ],
  idempotencyKey: 'forge-conflict'
});
assert.equal(conflict.status, 'rejected');
assert.equal(conflict.conflict.path, 'relationships.seniorCrew');
assert.equal(conflictHarness.coreStore.state.events.filter((event) => event.type === 'backgroundBatchCommitted').length, 0);

const abortHarness = createHarness({ nowPrefix: '2026-06-28T21:40' });
const abortGate = await beginHostTurn(abortHarness, { transactionId: 'txn-forge-abort', hostMessageId: '140' });
const controller = new AbortController();
controller.abort();
let abortWorkerCalls = 0;
const abortForge = createSyntheticForgeCoordinator({
  coreStore: abortHarness.coreStore,
  clock: abortHarness.clock,
  isSourceCurrent: async () => ({ ok: true })
});
const aborted = await abortForge.run({
  transactionId: 'txn-forge-abort',
  sourceToken: 'source-token-forge-abort',
  sourceFrame: abortGate.sourceFrame,
  signal: controller.signal,
  workers: [{
    id: 'continuity',
    allowedRoots: ['continuity'],
    async run() {
      abortWorkerCalls += 1;
      return { operations: [] };
    }
  }],
  idempotencyKey: 'forge-aborted'
});
assert.equal(aborted.status, 'canceled');
assert.equal(aborted.providerCallAttempted, false);
assert.equal(abortWorkerCalls, 0);

console.log('FORGE background projection batch tests passed.');
