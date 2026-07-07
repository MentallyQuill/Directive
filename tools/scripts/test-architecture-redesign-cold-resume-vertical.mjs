import assert from 'node:assert/strict';

import { createForgeCoordinator } from '../../src/jobs/forge-coordinator.mjs';
import {
  createTurnSourceFrameContract,
  createTurnSourceFrameRef,
  hashStableJson
} from '../../src/runtime/architecture-redesign-contracts.mjs';
import { applyLensPromptRevisionRecord } from '../../src/runtime/lens-prompt-revision-record.mjs';
import { createLensPromptScheduler } from '../../src/runtime/lens-prompt-scheduler.mjs';
import { createRepairRuntime } from '../../src/runtime/repair-runtime.mjs';
import {
  loadActiveCampaignStateV2,
  persistActiveCampaignStateV2
} from '../../src/storage/active-save-facade-v2.mjs';
import {
  createCoreStoreV2,
  loadCoreStoreStateV2,
  readCoreStoreProjectionsV2
} from '../../src/storage/core-store-v2.mjs';
import { createLogicalStorageAdapter } from '../../src/storage/logical-storage-adapter.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createMemoryStorage() {
  const files = new Map();
  const writeLog = [];
  const readLog = [];
  return {
    files,
    writeLog,
    readLog,
    snapshot() {
      return Object.fromEntries([...files.entries()].map(([key, value]) => [key, cloneJson(value)]));
    },
    async readJson(filePath) {
      readLog.push(filePath);
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

const campaignId = 'campaign-cold-resume-vertical';
const saveId = 'save-cold-resume-vertical';
const chatId = 'ashes-chat';
const saveRecord = {
  kind: 'directive.saveManifest.v2',
  id: saveId,
  saveId,
  branchId: 'main',
  current: true,
  metadata: {
    campaignId,
    title: 'Cold Resume Vertical'
  }
};

let tick = 0;
const clock = () => `2026-07-06T12:00:${String(tick++).padStart(2, '0')}.000Z`;
const storage = createMemoryStorage();
const adapter = createLogicalStorageAdapter({ storage, hostId: 'fake' });
const initialCampaignState = {
  campaign: {
    id: campaignId,
    title: 'Cold Resume Vertical'
  },
  campaignChatBinding: {
    hostId: 'fake',
    chatId,
    saveId,
    branchId: 'main',
    promptContextRevision: 0
  },
  runtimeTracking: {
    ingressLedger: [],
    responseLedger: [],
    recoveryJournal: [],
    lifecycleJournal: [],
    sidecarJournal: [],
    modelCallJournal: []
  },
  commandLog: {
    schemaVersion: 1,
    entries: []
  },
  runtimeResume: {
    kind: 'directive.runtimeResumeCursor.v1',
    revisionAuthority: 'coreStoreV2',
    coreRevisions: {
      runtime: 0,
      mechanics: 0,
      prompt: 0
    }
  }
};

await persistActiveCampaignStateV2(adapter, {
  saveRecord,
  campaignState: initialCampaignState,
  updateSaveIndex: false,
  now: clock(),
  reason: 'coldResumeBaseline'
});

const coreStore = createCoreStoreV2({
  adapter,
  campaignId,
  saveId,
  now: clock
});
const firstSourceFrame = createTurnSourceFrameContract({
  id: 'frame-cold-resume-1',
  campaignId,
  saveId,
  chatId,
  hostMessageId: 'player-cold-resume-1',
  textHash: hashStableJson({ text: 'Initial source command.' }),
  createdAt: clock()
});
const firstTransaction = await coreStore.beginTurn(firstSourceFrame, {
  transactionId: 'txn-cold-resume-1',
  ingressId: 'ingress-cold-resume-1',
  idempotencyKey: 'begin:cold-resume-1'
});
await coreStore.advanceTurn(firstTransaction.id, {
  phase: 'routePending',
  route: 'directivePosted',
  idempotencyKey: 'route:cold-resume-1'
});
await coreStore.recordVisibleResponse(firstTransaction.id, {
  idempotencyKey: 'response:cold-resume-1',
  responseId: 'response-cold-resume-1',
  hostMessageId: 'assistant-cold-resume-1',
  outcomeId: 'outcome-cold-resume-1',
  responseKind: 'assistantNarration',
  generationStartedAt: clock(),
  postedAt: clock(),
  turnLatency: { totalMs: 42 },
  rawResponse: 'RAW_VISIBLE_RESPONSE_CANARY'
});

const firstLoadedActive = await loadActiveCampaignStateV2(adapter, {
  saveRecord,
  fallbackCampaignState: null
});
assert.equal(firstLoadedActive.found, true);
for (const bridgeRoot of [
  'ingressLedger',
  'responseLedger',
  'recoveryJournal',
  'lifecycleJournal',
  'sidecarJournal',
  'modelCallJournal'
]) {
  assert.deepEqual(
    firstLoadedActive.campaignState.runtimeTracking?.[bridgeRoot] || [],
    [],
    `cold resume must not hydrate runtimeTracking.${bridgeRoot} bridge rows`
  );
}

const firstLoadedCoreState = await loadCoreStoreStateV2(adapter, { campaignId, saveId });
const resumedCoreStore = createCoreStoreV2({
  adapter,
  campaignId,
  saveId,
  initialState: firstLoadedCoreState,
  now: clock
});
assert.ok(resumedCoreStore.state.transactions[firstTransaction.id], 'first cold resume should load CORE transaction state');
assert.equal(
  resumedCoreStore.readProjections().responses.some((entry) => entry.id === 'response-cold-resume-1'),
  true,
  'first cold resume should derive visible response projection from CORE event segments'
);

const repairRuntime = createRepairRuntime({
  coreTurnStore: resumedCoreStore,
  now: clock
});
const repair = await repairRuntime.recordSourceMutationRecovery({
  eventType: 'playerMessageEdited',
  hostMessageId: firstSourceFrame.hostMessageId,
  replacementText: 'RAW_REPAIR_REPLACEMENT_CANARY',
  ingress: {
    id: 'ingress-cold-resume-1',
    coreTransactionId: firstTransaction.id,
    outcomeId: 'outcome-cold-resume-1',
    sourceFrameId: firstSourceFrame.id,
    status: 'committed'
  },
  preOutcomeRevision: 1,
  message: {
    id: firstSourceFrame.hostMessageId,
    is_user: true,
    extra: { sc_ghosted: true }
  },
  index: 0,
  chatMetadata: {
    summaryception: {
      ghostedIndices: [0],
      summarizedUpTo: 1
    }
  }
});
assert.equal(repair.status, 'recorded');

const secondSourceFrame = createTurnSourceFrameContract({
  id: 'frame-cold-resume-2',
  campaignId,
  saveId,
  chatId,
  hostMessageId: 'player-cold-resume-2',
  textHash: hashStableJson({ text: 'Continue after cold resume.' }),
  createdAt: clock()
});
const secondSourceFrameRef = createTurnSourceFrameRef(secondSourceFrame);
const secondTransaction = await resumedCoreStore.beginTurn(secondSourceFrame, {
  transactionId: 'txn-cold-resume-2',
  ingressId: 'ingress-cold-resume-2',
  idempotencyKey: 'begin:cold-resume-2'
});
await resumedCoreStore.advanceTurn(secondTransaction.id, {
  phase: 'routePending',
  route: 'directivePosted',
  idempotencyKey: 'route:cold-resume-2'
});
await resumedCoreStore.recordVisibleResponse(secondTransaction.id, {
  idempotencyKey: 'response:cold-resume-2',
  responseId: 'response-cold-resume-2',
  hostMessageId: 'assistant-cold-resume-2',
  outcomeId: 'outcome-cold-resume-2',
  responseKind: 'assistantNarration',
  generationStartedAt: clock(),
  postedAt: clock(),
  turnLatency: { totalMs: 57 },
  rawResponse: 'RAW_SECOND_VISIBLE_RESPONSE_CANARY'
});

const installedPackets = [];
const lens = createLensPromptScheduler({
  coreStore: resumedCoreStore,
  clock,
  buildDirectivePromptPacket: async ({ revision, dirtyDomains, cacheKey }) => ({
    kind: 'directive.playerSafePromptContext',
    revision,
    hash: hashStableJson({ revision, dirtyDomains, cacheKey }),
    blocks: [{
      id: 'cold-resume-block',
      title: 'Cold Resume Context',
      promptKey: 'directive.coldResume',
      priority: 1,
      placement: 'inPrompt',
      depth: 0,
      content: 'Compact cold-resume prompt context.'
    }]
  }),
  installPromptPacket: async ({ packet }) => {
    installedPackets.push(cloneJson(packet));
    return { ok: true };
  },
  observeExternalPromptEnvironment: async () => ({
    host: 'fake',
    chatId,
    campaignId,
    promptKeys: ['directive.coldResume']
  })
});
const forge = createForgeCoordinator({
  coreStore: resumedCoreStore,
  lens,
  clock,
  isSourceCurrent: async () => ({ ok: true })
});
const forgeResult = await forge.settleInternalBackgroundBatch({
  transactionId: secondTransaction.id,
  sourceToken: 'source-token-cold-resume-2',
  sourceFrame: secondSourceFrame,
  sourceFrameRef: secondSourceFrameRef,
  internalOwner: 'coldResumeVerticalGate',
  binding: {
    campaignId,
    saveId,
    chatId,
    branchId: 'main',
    promptContextRevision: firstLoadedActive.campaignState.campaignChatBinding.promptContextRevision || 0
  },
  campaignContext: {
    campaignId,
    saveId,
    chatId,
    branchId: 'main',
    mechanicsRevision: resumedCoreStore.state.revisions.mechanics || 0,
    runtimeRevision: resumedCoreStore.state.revisions.runtime || 0,
    policyHash: 'policy-cold-resume',
    staticPromptKeyVersion: 'directive-static-cold-resume'
  },
  bundle: {
    idempotencyKey: 'forge:cold-resume-2',
    batchId: 'batch-cold-resume-2',
    phaseAfter: 'backgroundSettling',
    outcomeId: 'outcome-cold-resume-2',
    promptDirtyDomains: ['continuity', 'command'],
    backgroundEffectRefs: [{
      effect: 'coldResumeContinuity',
      status: 'applied',
      outcomeId: 'outcome-cold-resume-2',
      ingressId: 'ingress-cold-resume-2',
      sourceFrameId: secondSourceFrame.id,
      resultHash: hashStableJson({ applied: true }),
      rawPromptBody: 'RAW_FORGE_PROMPT_CANARY',
      providerOutput: 'RAW_FORGE_PROVIDER_CANARY'
    }],
    workers: [{
      worker: 'coldResumeVerticalGate',
      workerId: 'coldResumeVerticalGate',
      sidecarType: 'coldResumeContinuity',
      roleId: 'coldResumeVerticalGate',
      status: 'applied',
      resultHash: hashStableJson({ applied: true }),
      rawProviderOutput: 'RAW_FORGE_WORKER_CANARY'
    }]
  },
  flushLens: true,
  cacheInputs: {
    recallIndexRevision: 'recall-cold-resume-2',
    sceneSealRevision: 'scene-seal-cold-resume-2'
  }
});
assert.equal(forgeResult.status, 'internalSettled');
assert.equal(installedPackets.length, 1);
assert.equal(forgeResult.lensResult?.lensPromptRevisionRecord?.kind, 'directive.lensPromptRevisionRecord.v1');

await resumedCoreStore.recordTerminalDecisionLedger(secondTransaction.id, {
  kind: 'directive.terminalDecisionLedger.v1',
  transactionId: secondTransaction.id,
  activeDecisionId: 'terminal-cold-resume-2',
  decisions: [{
    id: 'terminal-cold-resume-2',
    authority: 'terminalDecisionProjection',
    projectionSource: 'coreStoreV2',
    status: 'pending',
    transactionId: secondTransaction.id,
    sourceFrameId: secondSourceFrame.id,
    coreProjection: {
      kind: 'directive.terminalEndConditionLedgerProjectionRef.v1',
      rowKind: 'decision'
    }
  }]
}, {
  idempotencyKey: 'terminal:cold-resume-2'
});

let stateForSecondPersist = cloneJson(firstLoadedActive.campaignState);
stateForSecondPersist = applyLensPromptRevisionRecord(
  stateForSecondPersist,
  forgeResult.lensResult.lensPromptRevisionRecord
);
stateForSecondPersist.directiveRuntimeEvidence = {
  ...(stateForSecondPersist.directiveRuntimeEvidence || {}),
  coreStoreReadProjections: resumedCoreStore.readProjections()
};
await persistActiveCampaignStateV2(adapter, {
  saveRecord,
  campaignState: stateForSecondPersist,
  updateSaveIndex: false,
  now: clock(),
  reason: 'coldResumeVerticalCheckpoint'
});

const secondLoadedActive = await loadActiveCampaignStateV2(adapter, {
  saveRecord,
  fallbackCampaignState: null
});
assert.equal(secondLoadedActive.found, true);
assert.equal(
  secondLoadedActive.campaignState.directiveRuntimeEvidence?.lensPromptRevisionRecord?.kind,
  'directive.lensPromptRevisionRecord.v1',
  'second cold resume must retain compact LENS prompt revision evidence in the active head'
);
assert.equal(
  secondLoadedActive.campaignState.directiveRuntimeEvidence.lensPromptRevisionRecord.cacheInputs.recallIndexRevision,
  'recall-cold-resume-2',
  'second cold resume must retain compact Recall resume ref from the LENS revision record'
);
assert.equal(
  secondLoadedActive.campaignState.campaignChatBinding.promptContextRevision,
  forgeResult.lensResult.lensPromptRevisionRecord.revision,
  'second cold resume must restore active binding prompt revision'
);
assert.equal(
  secondLoadedActive.campaignState.campaignChatBinding.promptContextHash,
  forgeResult.lensResult.lensPromptRevisionRecord.hash,
  'second cold resume must restore active binding prompt hash'
);

const secondLoadedCoreState = await loadCoreStoreStateV2(adapter, { campaignId, saveId });
const secondResumedCoreStore = createCoreStoreV2({
  adapter,
  campaignId,
  saveId,
  initialState: secondLoadedCoreState,
  now: clock
});
const secondProjections = secondResumedCoreStore.readProjections();
assert.equal(
  secondProjections.recoveryJournal.some((entry) => entry.transactionId === firstTransaction.id),
  true,
  'second cold resume must derive REPAIR recovery projection from CORE event segments'
);
assert.equal(
  secondProjections.backgroundBatches.some((entry) => entry.batchId === 'batch-cold-resume-2'),
  true,
  'second cold resume must derive FORGE background batch projection from CORE event segments'
);
assert.equal(
  secondProjections.terminalDecisionLedger.activeDecisionId === 'terminal-cold-resume-2',
  true,
  'second cold resume must derive terminal decision projection from CORE event segments'
);

const persistedProjections = await readCoreStoreProjectionsV2(adapter, { campaignId, saveId });
assert.equal(
  persistedProjections.backgroundBatches.some((entry) => entry.batchId === 'batch-cold-resume-2'),
  true,
  'manifest-only CORE projection read must find FORGE background batch without active-save bridge ledgers'
);

const replayRepairEventCount = secondResumedCoreStore.state.events.length;
const replayRepairRuntime = createRepairRuntime({
  coreTurnStore: secondResumedCoreStore,
  now: clock
});
await replayRepairRuntime.recordSourceMutationRecovery({
  eventType: 'playerMessageEdited',
  hostMessageId: firstSourceFrame.hostMessageId,
  replacementText: 'RAW_REPAIR_REPLACEMENT_CANARY',
  ingress: {
    id: 'ingress-cold-resume-1',
    coreTransactionId: firstTransaction.id,
    outcomeId: 'outcome-cold-resume-1',
    sourceFrameId: firstSourceFrame.id,
    status: 'committed'
  },
  preOutcomeRevision: 1
});
assert.equal(
  secondResumedCoreStore.state.events.length,
  replayRepairEventCount,
  'source mutation recovery replay after cold resume must remain idempotent'
);
const replayTerminalEventCount = secondResumedCoreStore.state.events.length;
await secondResumedCoreStore.recordTerminalDecisionLedger(secondTransaction.id, {
  kind: 'directive.terminalDecisionLedger.v1',
  transactionId: secondTransaction.id,
  activeDecisionId: 'terminal-cold-resume-2',
  decisions: [{
    id: 'terminal-cold-resume-2',
    authority: 'terminalDecisionProjection',
    projectionSource: 'coreStoreV2',
    status: 'pending',
    transactionId: secondTransaction.id,
    sourceFrameId: secondSourceFrame.id,
    coreProjection: {
      kind: 'directive.terminalEndConditionLedgerProjectionRef.v1',
      rowKind: 'decision'
    }
  }]
}, {
  idempotencyKey: 'terminal:cold-resume-2'
});
assert.equal(
  secondResumedCoreStore.state.events.length,
  replayTerminalEventCount,
  'terminal decision replay after cold resume must remain idempotent'
);

const serializedSnapshot = JSON.stringify(storage.snapshot());
for (const rawCanary of [
  'RAW_VISIBLE_RESPONSE_CANARY',
  'RAW_SECOND_VISIBLE_RESPONSE_CANARY',
  'RAW_REPAIR_REPLACEMENT_CANARY',
  'RAW_FORGE_PROMPT_CANARY',
  'RAW_FORGE_PROVIDER_CANARY',
  'RAW_FORGE_WORKER_CANARY'
]) {
  assert.equal(serializedSnapshot.includes(rawCanary), false, `${rawCanary} must not persist`);
}
assert.equal(
  storage.writeLog.some((key) => /\.v1\.json$/.test(key)),
  false,
  'cold-resume vertical gate must not write active-save v1 artifacts'
);

console.log('Architecture redesign cold-resume vertical gate passed.');
