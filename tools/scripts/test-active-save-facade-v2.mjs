import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createInitialCampaignStateFromCreatorReview } from '../../src/campaign/campaign-start.mjs';
import {
  persistActiveCampaignStateV2,
  loadActiveCampaignStateV2,
  hasActiveCampaignStateV2
} from '../../src/storage/active-save-facade-v2.mjs';
import {
  createFirstCampaignSaveRecord
} from '../../src/storage/save-records.mjs';
import {
  campaignManifestV2LogicalKey,
  campaignSaveLogicalKey,
  saveManifestV2LogicalKey
} from '../../src/storage/logical-storage-paths.mjs';
import {
  loadV2MaterializedHead,
  readV2ArtifactRef
} from '../../src/storage/transaction-store-v2.mjs';
import {
  storeCampaignSave
} from '../../src/storage/directive-storage-repository.mjs';

const root = process.cwd();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createMemoryJsonAdapter() {
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
    },
    async verifyJsonFiles(paths) {
      return Object.fromEntries(paths.map((filePath) => [filePath, files.has(filePath)]));
    }
  };
}

const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const adapter = createMemoryJsonAdapter();

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
  campaignId: 'campaign-active-v2',
  createdAt: '2026-06-28T15:00:00.000Z',
  simulationMode: 'Command',
  creatorDraftId: 'draft-active-v2'
});
campaignState.campaign.currentStardate = 53061.7;
campaignState.campaignChatBinding = {
  hostId: 'sillytavern',
  chatId: 'chat-active-v2',
  saveId: 'save-active-v2',
  promptContextRevision: 11
};
campaignState.runtimeTracking = {
  ingressLedger: [{
    id: 'ingress-33-oldhash',
    hostMessageId: '33',
    turnId: 'turn-33',
    outcomeId: 'outcome-33',
    textHash: 'oldhash',
    rawText: 'Sam waited for her reply.',
    status: 'recoveryRequired'
  }],
  responseLedger: [{
    id: 'response-34',
    hostMessageId: '34',
    turnId: 'turn-33',
    outcomeId: 'outcome-33',
    text: 'Raw assistant prose should not be stored in the v2 host map.',
    status: 'posted'
  }],
  recoveryJournal: [{ id: 'recovery-1', status: 'reviewRequired' }],
  modelCallJournal: [{
    id: 'model-call:42:utilityTurnClassifier',
    roleId: 'utilityTurnClassifier',
    prompt: 'raw runtime prompt should not be in v2 diagnostics',
    response: 'raw runtime response should not be in v2 diagnostics'
  }],
  history: [{
    snapshot: {
      rawTranscriptText: 'This full runtime snapshot must not be stored in v2 active-save artifacts.'
    }
  }]
};
campaignState.turnLedger = {
  entries: [{
    turnId: 'turn-33',
    outcomeId: 'outcome-33',
    stateDelta: { openWorld: { rootsSet: { runtimeTracking: campaignState.runtimeTracking } } },
    retainedPacket: { rawProviderOutput: 'secret provider output' },
    snapshotBefore: { rawTranscriptText: 'snapshot text' }
  }],
  lastCommittedOutcomeId: 'outcome-33'
};
campaignState.modelCallJournal = [{
  prompt: 'raw prompt should not be in v2 diagnostics',
  response: 'raw response should not be in v2 diagnostics'
}];
campaignState.sidecarJournal = [{
  packet: { rawSidecarPacket: 'sidecar raw payload' }
}];

const saveRecord = createFirstCampaignSaveRecord({
  campaignState,
  packageData,
  saveId: 'save-active-v2',
  savedAt: '2026-06-28T15:00:30.000Z'
});
await storeCampaignSave(adapter, saveRecord);
const v1SavePath = campaignSaveLogicalKey(saveRecord.id);
let snapshot = adapter.snapshot();
assert.equal(snapshot[v1SavePath].kind, 'directive.campaignSave', 'test starts with v1 save checkpoint');
adapter.resetLog();

const result = await persistActiveCampaignStateV2(adapter, {
  saveRecord,
  campaignState,
  packageData,
  summary: 'Runtime v2 active-save facade test.',
  reason: 'test-runtime-persist',
  now: '2026-06-28T15:01:00.000Z'
});

assert.equal(result.kind, 'directive.activeCampaignStatePersist.v2');
assert.equal(result.wroteV1Payload, false);
assert.equal(result.storageFormat, 'v2');

const saveManifestKey = saveManifestV2LogicalKey({
  campaignId: campaignState.campaign.id,
  saveId: saveRecord.id
});
const campaignManifestKey = campaignManifestV2LogicalKey(campaignState.campaign.id);
assert.equal(adapter.writeLog.includes(v1SavePath), false, 'runtime v2 persist must not write v1 save payload');
assert.equal(adapter.writeLog.includes(saveManifestKey), true, 'runtime v2 persist writes save manifest');
assert.equal(adapter.writeLog.includes(campaignManifestKey), true, 'runtime v2 persist writes campaign manifest');
assert.equal(
  adapter.writeLog.indexOf(saveManifestKey) < adapter.writeLog.indexOf(campaignManifestKey),
  true,
  'save manifest is written before campaign manifest pointer'
);
assert.equal(
  adapter.writeLog.indexOf(campaignManifestKey) < adapter.writeLog.indexOf('indexes/saves.v1.json'),
  true,
  'save index updates only after v2 manifest pointers are written'
);

const head = await loadV2MaterializedHead(adapter, {
  campaignId: campaignState.campaign.id,
  saveId: saveRecord.id
});
assert.equal(head.state.player.name, 'Sam Vickers');
assert.equal(head.state.campaign.currentStardate, 53061.7);
assert.equal(head.state.runtimeTracking, undefined, 'materialized head omits runtimeTracking journals');
assert.equal(head.state.runtimeResume.modelCallEventSequence, 42, 'materialized head keeps compact model-call resume cursor');
assert.equal(head.runtimeSummary.historyCount, 1, 'runtime summary keeps compact history count');
assert.equal(head.runtimeSummary.modelCallCount, 1, 'runtime summary counts runtimeTracking model-call journal entries');
assert.equal(head.runtimeSummary.modelCallEventSequence, 42, 'runtime summary keeps compact model-call sequence cursor');

const hostMap = await readV2ArtifactRef(adapter, result.refs.hostMap);
assert.equal(hostMap.excludesRawChatText, true);
assert.equal(hostMap.rows[0].textHash, 'oldhash');
const v2Artifacts = Object.fromEntries(Object.entries(adapter.snapshot()).filter(([key]) => key.startsWith('campaigns/')));
const v2ArtifactsJson = JSON.stringify(v2Artifacts);
assert.equal(v2ArtifactsJson.includes('Sam waited for her reply.'), false, 'v2 artifacts omit raw player text');
assert.equal(v2ArtifactsJson.includes('Raw assistant prose'), false, 'v2 artifacts omit raw assistant text');
assert.equal(v2ArtifactsJson.includes('raw prompt should not be in v2 diagnostics'), false, 'v2 artifacts omit raw prompt text');
assert.equal(v2ArtifactsJson.includes('raw runtime prompt should not be in v2 diagnostics'), false, 'v2 artifacts omit raw runtime prompt text');
assert.equal(v2ArtifactsJson.includes('secret provider output'), false, 'v2 artifacts omit retained provider output');
assert.equal(v2ArtifactsJson.includes('full runtime snapshot'), false, 'v2 artifacts omit full runtime snapshots');

assert.equal(await hasActiveCampaignStateV2(adapter, {
  campaignId: campaignState.campaign.id,
  saveId: saveRecord.id
}), true);
const loaded = await loadActiveCampaignStateV2(adapter, {
  saveRecord,
  fallbackCampaignState: saveRecord.payload.campaignState
});
assert.equal(loaded.found, true);
assert.equal(loaded.campaignState.player.name, 'Sam Vickers');
assert.equal(loaded.campaignState.campaign.currentStardate, 53061.7);
assert.equal(loaded.campaignState.runtimeTracking, undefined, 'facade load returns materialized head state');
assert.equal(loaded.campaignState.runtimeResume.modelCallEventSequence, 42, 'facade load returns compact runtime resume cursor');

snapshot = adapter.snapshot();
assert.equal(snapshot['indexes/saves.v1.json'].activeSaveId, saveRecord.id);
assert.equal(snapshot['indexes/saves.v1.json'].saves[saveRecord.id].path, v1SavePath);
assert.equal(snapshot['indexes/saves.v1.json'].saves[saveRecord.id].payloadKind || 'directive.campaignSave', 'directive.campaignSave');
assert.equal(snapshot['indexes/saves.v1.json'].saves[saveRecord.id].runtimeStorageFormat, 'v2');
assert.equal(snapshot['indexes/saves.v1.json'].saves[saveRecord.id].v2ManifestRef.logicalKey, saveManifestKey);
assert.equal(snapshot[v1SavePath].kind, 'directive.campaignSave', 'v1 manual checkpoint remains available');

console.log('Active save facade v2 tests passed.');
