import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createInitialCampaignStateFromCreatorReview } from '../../src/campaign/campaign-start.mjs';
import {
  createTurnSourceFrameContract,
  hashStableJson
} from '../../src/runtime/architecture-redesign-contracts.mjs';
import {
  persistActiveCampaignStateV2,
  loadActiveCampaignStateV2
} from '../../src/storage/active-save-facade-v2.mjs';
import {
  createFirstCampaignSaveRecord
} from '../../src/storage/save-records.mjs';
import {
  campaignManifestV2LogicalKey,
  campaignSaveLogicalKey,
  coreCampaignManifestV2LogicalKey,
  coreMaterializedHeadV2LogicalKey,
  coreSaveManifestV2LogicalKey,
  materializedHeadV2LogicalKey,
  saveManifestV2LogicalKey
} from '../../src/storage/logical-storage-paths.mjs';
import { createLogicalStorageAdapter } from '../../src/storage/logical-storage-adapter.mjs';
import {
  createCoreStoreV2,
  readCoreStoreProjectionsV2
} from '../../src/storage/core-store-v2.mjs';
import {
  loadV2CampaignManifest,
  loadV2MaterializedHead,
  loadV2SaveManifest,
  readV2ArtifactRef
} from '../../src/storage/transaction-store-v2.mjs';
import {
  storeCampaignSave
} from '../../src/storage/directive-storage-repository.mjs';

const root = process.cwd();
const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createLoggingStorage() {
  const files = new Map();
  const writeLog = [];
  return {
    writeLog,
    resetLog() {
      writeLog.length = 0;
    },
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

function createCampaignState({ campaignId, saveId, chatId }) {
  const campaignState = createInitialCampaignStateFromCreatorReview({
    packageData,
    projection,
    creatorReview: {
      identity: {
        name: 'Sam Vickers',
        pronounsOrAddress: 'he/him',
        speciesId: 'human',
        ageBandId: 'experienced',
        appearance: 'Tired around the eyes, careful with his words.'
      },
      service: {
        careerBackgroundId: 'diplomacy-first-contact',
        formativeExperienceId: 'frontier-border-service',
        assignmentReasonId: 'requested-by-captain'
      },
      personality: {
        traits: {
          insight: 'perceptive',
          connection: 'diplomatic',
          execution: 'patient'
        },
        flawId: 'stubborn'
      },
      dossier: {
        detailLevel: 'Standard',
        briefBiography: 'Sam Vickers listens before he decides.',
        publicReputation: 'A patient officer with a habit of looking for the human cost first.'
      }
    },
    campaignId,
    createdAt: '2026-06-28T16:00:00.000Z',
    simulationMode: 'Command',
    creatorDraftId: `draft-${campaignId}`
  });
  campaignState.campaign.currentStardate = 53062.1;
  campaignState.campaignChatBinding = {
    hostId: 'sillytavern',
    chatId,
    saveId,
    promptContextRevision: 17
  };
  campaignState.runtimeTracking = {
    ingressLedger: [{
      id: 'ingress-active-33',
      hostMessageId: '33',
      turnId: 'turn-active-33',
      outcomeId: 'outcome-active-33',
      textHash: 'hash-active-player-33',
      rawText: 'Sam waited for her reply.',
      status: 'complete'
    }],
    responseLedger: [{
      id: 'response-active-34',
      hostMessageId: '34',
      turnId: 'turn-active-33',
      outcomeId: 'outcome-active-33',
      text: 'RAW_ACTIVE_ASSISTANT_TEXT',
      status: 'posted'
    }],
    recoveryJournal: [],
    modelCallJournal: [{
      id: 'model-call:77:utilityTurnClassifier',
      roleId: 'utilityTurnClassifier',
      prompt: 'RAW_ACTIVE_PROVIDER_PROMPT',
      response: 'RAW_ACTIVE_PROVIDER_RESPONSE'
    }],
    history: [{
      snapshot: {
        rawTranscriptText: 'RAW_ACTIVE_HISTORY'
      }
    }]
  };
  campaignState.turnLedger = {
    entries: [{
      turnId: 'turn-active-33',
      outcomeId: 'outcome-active-33',
      stateDelta: { openWorld: { rootsSet: { runtimeTracking: campaignState.runtimeTracking } } },
      retainedPacket: { rawProviderOutput: 'RAW_ACTIVE_RETAINED_PACKET' },
      snapshotBefore: { rawTranscriptText: 'RAW_ACTIVE_SNAPSHOT' }
    }],
    lastCommittedOutcomeId: 'outcome-active-33'
  };
  return campaignState;
}

async function setupScenario(suffix) {
  const storage = createLoggingStorage();
  const adapter = createLogicalStorageAdapter({ storage, hostId: 'fake' });
  const campaignId = `campaign-cross-writer-v2-${suffix}`;
  const saveId = `save-cross-writer-v2-${suffix}`;
  const chatId = `chat-cross-writer-v2-${suffix}`;
  const campaignState = createCampaignState({ campaignId, saveId, chatId });
  const saveRecord = createFirstCampaignSaveRecord({
    campaignState,
    packageData,
    saveId,
    savedAt: '2026-06-28T16:00:30.000Z'
  });
  await storeCampaignSave(adapter, saveRecord);
  storage.resetLog();
  return { storage, adapter, campaignId, saveId, chatId, campaignState, saveRecord };
}

async function persistActive({ adapter, campaignState, saveRecord }, now) {
  return persistActiveCampaignStateV2(adapter, {
    saveRecord,
    campaignState,
    packageData,
    summary: 'Cross-writer v2 active-save persist.',
    reason: 'test-cross-writer-v2',
    now
  });
}

async function writeCoreTurn({ adapter, campaignId, saveId, chatId }, suffix) {
  let tick = 0;
  const coreStore = createCoreStoreV2({
    adapter,
    campaignId,
    saveId,
    now: () => `2026-06-28T16:01:${String(tick++).padStart(2, '0')}.000Z`
  });
  const sourceFrame = createTurnSourceFrameContract({
    id: `frame-core-${suffix}`,
    campaignId,
    saveId,
    chatId,
    hostMessageId: '35',
    textHash: hashStableJson({ text: 'Sam waited for her reply.' }),
    createdAt: '2026-06-28T16:01:00.000Z'
  });
  const transaction = await coreStore.beginTurn(sourceFrame, {
    transactionId: `txn-core-${suffix}`,
    ingressId: `ingress-core-${suffix}`,
    idempotencyKey: `begin-core-${suffix}`
  });
  await coreStore.advanceTurn(transaction.id, {
    phase: 'routePending',
    route: 'directiveCommit',
    reason: 'cross-writer-test',
    idempotencyKey: `route-core-${suffix}`
  });
  await coreStore.commitMechanics(transaction.id, {
    baseMechanicsRevision: 0,
    idempotencyKey: `mechanics-core-${suffix}`,
    turnId: `turn-core-${suffix}`,
    outcomeId: `outcome-core-${suffix}`,
    summary: 'Sam frames the bridge decision without raw transcript storage.',
    committedRoots: ['mission'],
    promptDirtyDomains: ['missionQuestThread'],
    operations: [{
      domain: 'mission',
      op: 'appendLog',
      summary: 'Recorded cross-writer mission effect.',
      rawText: 'RAW_CORE_MECHANICS_TEXT'
    }]
  });
  await coreStore.recordVisibleResponse(transaction.id, {
    idempotencyKey: `response-core-${suffix}`,
    responseId: `response-core-${suffix}`,
    hostMessageId: '36',
    outcomeId: `outcome-core-${suffix}`,
    responseKind: 'directiveNarration',
    rawResponse: 'RAW_CORE_RESPONSE_TEXT'
  });
  await coreStore.appendDiagnostics(transaction.id, {
    type: 'modelCall',
    roleId: 'utilityTurnClassifier',
    promptText: 'RAW_CORE_PROVIDER_PROMPT',
    responseSnapshot: 'RAW_CORE_PROVIDER_RESPONSE',
    apiKey: 'SECRET-CORE-KEY'
  });
  return coreStore;
}

async function verifyManifestRefs(adapter, manifest) {
  await readV2ArtifactRef(adapter, manifest.head);
  if (manifest.hostMap) await readV2ArtifactRef(adapter, manifest.hostMap);
  if (manifest.promptCache) await readV2ArtifactRef(adapter, manifest.promptCache);
  for (const ref of [
    ...(manifest.eventSegments || []),
    ...(manifest.turnSegments || []),
    ...(manifest.diagnosticsSegments || []),
    ...(manifest.checkpoints || [])
  ]) {
    await readV2ArtifactRef(adapter, ref);
  }
}

function assertNoWritesTo(writeLog, disallowedKeys, label) {
  for (const key of disallowedKeys) {
    assert.equal(writeLog.includes(key), false, `${label} must not write ${key}`);
  }
}

function assertSaveIndexPointsAtActiveManifest(snapshot, { saveId, activeManifestRef, v1Path }) {
  const saveIndex = snapshot['indexes/saves.v1.json'];
  assert.equal(saveIndex.activeSaveId, saveId);
  assert.equal(saveIndex.saves[saveId].path, v1Path);
  assert.equal(saveIndex.saves[saveId].runtimeStorageFormat, 'v2');
  assert.equal(saveIndex.saves[saveId].v2ManifestRef.logicalKey, activeManifestRef.logicalKey);
  assert.equal(saveIndex.saves[saveId].v2ManifestRef.hash, activeManifestRef.hash);
  assert.equal(saveIndex.saves[saveId].v2ManifestRef.byteLength, activeManifestRef.byteLength);
}

async function assertActiveSaveHealthy({ adapter, storage, campaignId, saveId, saveRecord, campaignState, activeManifestRef }) {
  const activeManifest = await loadV2SaveManifest(adapter, { campaignId, saveId });
  assert.equal(activeManifest.layout, 'active');
  assert.equal(activeManifest.hash, activeManifestRef.hash);
  await verifyManifestRefs(adapter, activeManifest);
  const activeHead = await loadV2MaterializedHead(adapter, { campaignId, saveId });
  assert.equal(activeHead.layout, 'active');
  assert.equal(activeHead.state.player.name, 'Sam Vickers');
  assert.equal(activeHead.state.runtimeTracking, undefined);
  assert.equal(activeHead.state.turnLedger, undefined);
  assert.equal(activeHead.state.runtimeResume.modelCallEventSequence, 77);
  assert.equal(activeHead.coreStore, undefined);
  const activeLoad = await loadActiveCampaignStateV2(adapter, {
    saveRecord,
    fallbackCampaignState: campaignState
  });
  assert.equal(activeLoad.found, true);
  assert.equal(activeLoad.campaignState.player.name, 'Sam Vickers');
  const activeCampaignManifest = await loadV2CampaignManifest(adapter, campaignId);
  assert.equal(activeCampaignManifest.layout, 'active');
  assert.equal(activeCampaignManifest.saves[saveId].manifest.hash, activeManifestRef.hash);
  assertSaveIndexPointsAtActiveManifest(storage.snapshot(), {
    saveId,
    activeManifestRef,
    v1Path: campaignSaveLogicalKey(saveId)
  });
}

async function assertCoreHealthy({ adapter, campaignId, saveId }) {
  const coreManifest = await loadV2SaveManifest(adapter, { campaignId, saveId, layout: 'core' });
  assert.equal(coreManifest.layout, 'core');
  await verifyManifestRefs(adapter, coreManifest);
  const coreCampaignManifest = await loadV2CampaignManifest(adapter, campaignId, { layout: 'core' });
  assert.equal(coreCampaignManifest.layout, 'core');
  assert.equal(coreCampaignManifest.saves[saveId].manifest.hash, coreManifest.hash);
  const coreHead = await loadV2MaterializedHead(adapter, { campaignId, saveId, layout: 'core' });
  assert.equal(coreHead.layout, 'core');
  assert.equal(coreHead.state, undefined);
  assert.equal(coreHead.coreStore.counters.transactions, 1);
  assert.equal(coreHead.coreStore.counters.turns, 0, 'mechanics hot append must not rewrite the CORE head');
  assert.equal(coreHead.coreStore.counters.diagnostics, 0, 'diagnostics-only append must not rewrite the CORE head');
  const projections = await readCoreStoreProjectionsV2(adapter, { campaignId, saveId });
  assert.equal(projections.ingressLedger.length, 1);
  assert.equal(projections.responseLedger.length, 1);
  assert.equal(projections.turnLedger.entries.length, 1);
  assert.equal(projections.modelCallDiagnostics.length, 1);
  assert.equal(projections.modelCallDiagnostics[0].promptText, '[redacted-raw-payload]');
}

async function testActiveThenCore() {
  const scenario = await setupScenario('active-then-core');
  const { storage, adapter, campaignId, saveId } = scenario;
  const v1Path = campaignSaveLogicalKey(saveId);
  const activeHeadPath = materializedHeadV2LogicalKey({ campaignId, saveId });
  const activeSaveManifestPath = saveManifestV2LogicalKey({ campaignId, saveId });
  const activeCampaignManifestPath = campaignManifestV2LogicalKey(campaignId);
  const coreHeadPath = coreMaterializedHeadV2LogicalKey({ campaignId, saveId });
  const coreSaveManifestPath = coreSaveManifestV2LogicalKey({ campaignId, saveId });
  const coreCampaignManifestPath = coreCampaignManifestV2LogicalKey(campaignId);

  const activePersist = await persistActive(scenario, '2026-06-28T16:02:00.000Z');
  const activeManifestRef = cloneJson(activePersist.saveManifestRef);
  await assertActiveSaveHealthy({ ...scenario, activeManifestRef });
  await assert.rejects(
    () => loadV2SaveManifest(adapter, { campaignId, saveId, layout: 'core' }),
    /not found/
  );
  const v1CheckpointBefore = JSON.stringify(storage.snapshot()[v1Path]);

  storage.resetLog();
  await writeCoreTurn(scenario, 'active-then-core');
  assertNoWritesTo(storage.writeLog, [activeHeadPath, activeSaveManifestPath, activeCampaignManifestPath], 'CORE writer');
  assert.equal(storage.writeLog.includes(coreHeadPath), true);
  assert.equal(storage.writeLog.includes(coreSaveManifestPath), true);
  assert.equal(storage.writeLog.includes(coreCampaignManifestPath), true);

  await assertActiveSaveHealthy({ ...scenario, activeManifestRef });
  await assertCoreHealthy(scenario);
  assert.equal(JSON.stringify(storage.snapshot()[v1Path]), v1CheckpointBefore, 'CORE writer must not rewrite the v1 checkpoint');
  const snapshot = storage.snapshot();
  assert.equal(Boolean(snapshot[activeHeadPath]), true);
  assert.equal(Boolean(snapshot[coreHeadPath]), true);
  assert.equal(snapshot[activeHeadPath].state.player.name, 'Sam Vickers');
  assert.equal(snapshot[coreHeadPath].coreStore.counters.transactions, 1);
}

async function testCoreThenActive() {
  const scenario = await setupScenario('core-then-active');
  const { storage, adapter, campaignId, saveId } = scenario;
  const activeHeadPath = materializedHeadV2LogicalKey({ campaignId, saveId });
  const activeSaveManifestPath = saveManifestV2LogicalKey({ campaignId, saveId });
  const activeCampaignManifestPath = campaignManifestV2LogicalKey(campaignId);
  const coreHeadPath = coreMaterializedHeadV2LogicalKey({ campaignId, saveId });
  const coreSaveManifestPath = coreSaveManifestV2LogicalKey({ campaignId, saveId });
  const coreCampaignManifestPath = coreCampaignManifestV2LogicalKey(campaignId);

  await writeCoreTurn(scenario, 'core-then-active');
  await assertCoreHealthy(scenario);
  const coreManifestBefore = await loadV2SaveManifest(adapter, { campaignId, saveId, layout: 'core' });
  assert.equal(storage.writeLog.includes(coreHeadPath), true);
  assert.equal(storage.writeLog.includes(coreSaveManifestPath), true);
  assert.equal(storage.writeLog.includes(coreCampaignManifestPath), true);
  await assert.rejects(
    () => loadV2SaveManifest(adapter, { campaignId, saveId }),
    /not found/
  );

  storage.resetLog();
  const activePersist = await persistActive(scenario, '2026-06-28T16:03:00.000Z');
  const activeManifestRef = cloneJson(activePersist.saveManifestRef);
  assertNoWritesTo(storage.writeLog, [coreHeadPath, coreSaveManifestPath, coreCampaignManifestPath], 'active-save writer');
  assert.equal(storage.writeLog.includes(activeHeadPath), true);
  assert.equal(storage.writeLog.includes(activeSaveManifestPath), true);
  assert.equal(storage.writeLog.includes(activeCampaignManifestPath), true);

  await assertActiveSaveHealthy({ ...scenario, activeManifestRef });
  await assertCoreHealthy(scenario);
  const coreManifestAfter = await loadV2SaveManifest(adapter, { campaignId, saveId, layout: 'core' });
  assert.equal(coreManifestAfter.hash, coreManifestBefore.hash, 'active-save writer must not rewrite CORE manifest');
  const snapshot = storage.snapshot();
  assert.equal(snapshot[activeHeadPath].state.player.name, 'Sam Vickers');
  assert.equal(snapshot[coreHeadPath].coreStore.counters.transactions, 1);
  const v2Snapshot = Object.fromEntries(Object.entries(snapshot).filter(([key]) => key.startsWith('campaigns/')));
  assert.equal(JSON.stringify(v2Snapshot).includes('RAW_CORE_PROVIDER_PROMPT'), false);
  assert.equal(JSON.stringify(v2Snapshot).includes('RAW_ACTIVE_PROVIDER_PROMPT'), false);
}

await testActiveThenCore();
await testCoreThenActive();

console.log('Storage cross-writer v2 tests passed.');
