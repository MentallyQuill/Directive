import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createInitialCampaignStateFromCreatorReview } from '../../src/campaign/campaign-start.mjs';
import {
  createRuntimeModelCallJournal
} from '../../src/runtime/model-call-journal.mjs';
import {
  ACTIVE_RUNTIME_HEAD_MAX_BYTES,
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
  commitV2SaveLayout,
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
const replacementTextCanary = 'RAW_REPLACEMENT_TEXT_CANARY Sam waited for her reply, then revised the assistant row.';
const transientCoreSidecarCanary = 'RAW_CORE_SIDECAR_DIAGNOSTIC_CANARY should never persist in v2 active head.';
const transientCoreProjectionCanary = 'RAW_CORE_RUNTIME_PROJECTION_CANARY should never persist in v2 active-save artifacts.';
const outcomeIntegrityCanary = 'RAW_OUTCOME_INTEGRITY_CANARY should never persist in v2 active-save artifacts.';
const modelCallPromptCanary = 'RAW_MODEL_CALL_PROMPT_CANARY should never persist in v2 active-save artifacts.';
const modelCallResponseCanary = 'RAW_MODEL_CALL_RESPONSE_CANARY should never persist in v2 active-save artifacts.';
const coreReplacementTextHash = 'a'.repeat(64);

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
    replacementText: replacementTextCanary,
    status: 'posted'
  }],
    recoveryJournal: [{ id: 'recovery-1', status: 'reviewRequired' }],
  modelCallJournal: [{
    id: 'model-call:42:utilityTurnClassifier',
    roleId: 'utilityTurnClassifier',
    providerKind: 'utility',
    providerId: 'provider-fixture',
    model: 'model-fixture',
    status: 'ok',
    requestHash: 'request-hash-utility-42',
    parseStatus: 'ok',
    validationStatus: 'ok',
    appliedStatus: 'applied',
    latencyMs: 321,
    recordedAt: '2026-06-28T15:00:45.000Z',
    campaignRevision: 17,
    prompt: modelCallPromptCanary,
    response: modelCallResponseCanary
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
campaignState.directiveRuntimeEvidence = {
  coreStoreReadProjections: {
    kind: 'directive.coreStoreReadProjections.v1',
    runtimeAuthority: 'coreStoreV2',
    ingressLedger: [{
      id: 'ingress-core-44',
      hostMessageId: '44',
      turnId: 'turn-core-44',
      outcomeId: 'outcome-core-44',
      textHash: 'corehash',
      rawText: transientCoreProjectionCanary,
      status: 'committed',
      transactionId: 'txn-core-44',
      sourceFrameId: 'frame-core-44'
    }],
    responseLedger: [{
      id: 'response-core-45',
      hostMessageId: '45',
      turnId: 'turn-core-44',
      outcomeId: 'outcome-core-44',
      status: 'posted',
      responseKind: 'directivePosted',
      replacementTextPresent: true,
      replacementTextHash: coreReplacementTextHash,
      replacementTextLength: 777,
      text: transientCoreProjectionCanary,
      transactionId: 'txn-core-45',
      sourceFrameId: 'frame-core-45',
      outcomeIntegrity: {
        selectedRevisionId: 'revision-core-45',
        revisions: [{
          id: 'revision-core-45',
          rawText: outcomeIntegrityCanary
        }]
      }
    }],
    recoveryJournal: [{
      id: 'recovery-core-45',
      hostMessageId: '45',
      turnId: 'turn-core-44',
      outcomeId: 'outcome-core-44',
      status: 'reviewRequired',
      transactionId: 'txn-core-45',
      sourceFrameId: 'frame-core-45',
      rawRecoveryText: transientCoreProjectionCanary
    }],
    turnLedger: {
      entries: [{
        id: 'turn-record-core-44',
        turnId: 'turn-core-44',
        outcomeId: 'outcome-core-44',
        phase: 'directivePosted',
        stateDeltaHash: 'core-state-delta-hash',
        retainedPacketHash: 'core-retained-packet-hash',
        snapshotBeforeHash: 'core-snapshot-before-hash',
      transactionId: 'txn-core-44',
      sourceFrameId: 'frame-core-44',
      snapshotBeforeRetained: true,
      stateDelta: {
        rawTransientCoreProjection: transientCoreProjectionCanary
      }
      }],
      lastCommittedOutcomeId: 'outcome-core-44',
      replacementHistory: [{
        kind: 'directive.coreOutcomeReplacementRef.v1',
        transactionId: 'txn-core-44',
        replacedOutcomeId: 'outcome-core-33',
        replacementOutcomeId: 'outcome-core-44',
        repairDecision: {
          kind: 'directive.repairOutcomeRerunActuationDecision.v1',
          transactionId: 'txn-core-44',
          action: 'createRerunBranchCandidate'
        },
        rawSnapshot: transientCoreProjectionCanary
      }],
      lastReplacedOutcomeId: 'outcome-core-33'
    },
    sidecarDiagnostics: [
      {
        id: 'core-sidecar-1',
        status: 'accepted',
        workerKey: 'relationship',
        rawProviderOutput: transientCoreSidecarCanary
      },
      {
        id: 'core-sidecar-2',
        status: 'accepted',
        workerKey: 'crew'
      },
      {
        id: 'core-sidecar-3',
        status: 'accepted',
        workerKey: 'continuity'
      }
    ],
    backgroundBatches: [{
      id: 'background-batch-core-sidecar',
      acceptedBatchHash: 'accepted-batch-core-sidecar-hash',
      workerCount: 4
    }],
    commandBearingEvidence: [{
      evidenceId: 'bearing-evidence-core-1',
      transactionId: 'txn-core-44',
      batchId: 'background-batch-core-sidecar',
      sourceFrameId: 'frame-core-44',
      sourceOutcomeId: 'outcome-core-44',
      primarySignal: 'resolve',
      trackSignals: ['resolve'],
      strength: 'strong',
      status: 'open',
      evidenceHash: 'bearing-evidence-core-hash',
      rawEvidenceText: transientCoreSidecarCanary
    }]
  }
};
const omittedCommandLogCanary = 'RAW_OMITTED_COMMAND_LOG_BLOAT';
campaignState.commandLog = {
  ...(campaignState.commandLog || {}),
  entries: [
    ...(Array.isArray(campaignState.commandLog?.entries) ? campaignState.commandLog.entries : []),
    ...Array.from({ length: 96 }, (_, index) => ({
      id: `old-log-${index + 1}`,
      sourceOutcomeId: `old-outcome-${index + 1}`,
      summary: `${omittedCommandLogCanary} ${'older command log text '.repeat(80)} ${index + 1}`,
      summaryInputs: [`${omittedCommandLogCanary} summary input ${index + 1}`],
      visibleConsequences: [`${omittedCommandLogCanary} consequence ${index + 1}`]
    })),
    ...Array.from({ length: 32 }, (_, index) => ({
      id: `recent-log-${index + 1}`,
      type: 'turnOutcome',
      sourceOutcomeId: `recent-outcome-${index + 1}`,
      summary: `Recent compact command log ${index + 1}.`,
      summaryInputs: [`Recent compact summary input ${index + 1}.`],
      visibleConsequences: [`Recent compact consequence ${index + 1}.`],
      assistedSummary: {
        title: `Recent assisted title ${index + 1}`,
        status: 'complete',
        summary: `Recent assisted command summary ${index + 1}.`,
        highlights: [`Recent assisted highlight ${index + 1}.`],
        rawProviderOutput: 'RAW_COMMAND_LOG_ASSISTED_SUMMARY_PROVIDER_OUTPUT'
      }
    }))
  ]
};

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
assert.equal(head.state.directiveRuntimeEvidence, undefined, 'materialized head omits transient CORE read-projection evidence');
assert.equal(head.state.runtimeResume.modelCallEventSequence, 42, 'materialized head keeps compact model-call resume cursor');
assert.equal(head.state.runtimeResume.sidecarCount, 4, 'materialized head resume cursor counts CORE accepted background-batch workers over old sidecar journals');
assert.equal(head.runtimeHeadBudget.status, 'pass', 'active runtime head should stay under the bridge budget');
assert.equal(head.runtimeHeadBudget.byteLength <= ACTIVE_RUNTIME_HEAD_MAX_BYTES, true, 'active runtime head byte budget should be enforced in diagnostics');
assert.equal(head.state.commandLog.compactedForRuntimeHead, true, 'runtime-current v2 head stores a compact Command Log projection');
assert.equal(head.state.commandLog.entries.length, 32, 'runtime-current v2 head stores only recent Command Log entries');
assert.equal(head.state.commandLog.omittedEntryCount >= 96, true, 'runtime-current v2 head records omitted Command Log history count');
assert.equal(head.state.commandLog.entries.at(-1).type, 'turnOutcome', 'runtime-current v2 head preserves compact Command Log entry type for presentation labels');
assert.equal(
  head.state.commandLog.entries.at(-1).assistedSummary.summary,
  'Recent assisted command summary 32.',
  'runtime-current v2 head keeps compact player-safe assisted Command Log summary text for recent presentation replay'
);
assert.deepEqual(
  head.state.commandLog.entries.at(-1).assistedSummary.highlights,
  ['Recent assisted highlight 32.'],
  'runtime-current v2 head keeps compact assisted Command Log highlights for recent presentation replay'
);
assert.equal(
  JSON.stringify(head.state.commandLog).includes(omittedCommandLogCanary),
  false,
  'runtime-current v2 head omits older turn-scaled Command Log text'
);
assert.equal(head.runtimeSummary.historyCount, 1, 'runtime summary keeps compact history count');
assert.equal(head.runtimeSummary.modelCallCount, 1, 'runtime summary counts runtimeTracking model-call journal entries');
assert.equal(head.runtimeSummary.modelCallEventSequence, 42, 'runtime summary keeps compact model-call sequence cursor');
assert.equal(head.runtimeSummary.sidecarCount, 4, 'runtime summary counts CORE accepted background-batch workers over old sidecar journals');

const hostMap = await readV2ArtifactRef(adapter, result.refs.hostMap);
assert.equal(hostMap.excludesRawChatText, true);
assert.equal(hostMap.rows.length, 2, 'host map is projected from CORE ingress/response rows');
assert.equal(hostMap.rows[0].hostMessageId, '44', 'host map prefers CORE ingress over stale v1 runtimeTracking');
assert.equal(hostMap.rows[0].textHash, 'corehash');
assert.equal(hostMap.rows[0].transactionId, 'txn-core-44', 'host map preserves CORE transaction evidence');
assert.equal(hostMap.rows[0].sourceFrameId, 'frame-core-44', 'host map preserves CORE source-frame evidence');
assert.equal(hostMap.rows[1].hostMessageId, '45', 'host map prefers CORE response over stale v1 runtimeTracking');
assert.equal(hostMap.rows[1].outcomeId, 'outcome-core-44');
assert.equal(hostMap.rows[1].transactionId, 'txn-core-45', 'host map preserves CORE response transaction evidence');
const eventSegment = await readV2ArtifactRef(adapter, result.refs.eventSegments[0]);
const eventEntries = eventSegment.entries || [];
assert.equal(eventEntries.some((entry) => entry.ingressId === 'ingress-core-44'), true, 'event segment projects CORE ingress');
assert.equal(eventEntries.some((entry) => entry.ingressId === 'ingress-33-oldhash'), false, 'event segment omits stale v1 ingress when CORE projections exist');
assert.equal(eventEntries.some((entry) => entry.responseId === 'response-core-45'), true, 'event segment projects CORE response');
assert.equal(eventEntries.some((entry) => entry.responseId === 'response-34'), false, 'event segment omits stale v1 response when CORE projections exist');
assert.equal(eventEntries.some((entry) => entry.recoveryId === 'recovery-core-45'), true, 'event segment projects CORE recovery evidence');
assert.equal(eventEntries.find((entry) => entry.responseId === 'response-core-45')?.transactionId, 'txn-core-45', 'event segment preserves CORE response transaction evidence');
const turnSegment = await readV2ArtifactRef(adapter, result.refs.turnSegments[0]);
const turnEntries = turnSegment.entries || [];
assert.equal(turnEntries.length, 1, 'turn segment is projected from CORE turn records');
assert.equal(turnEntries[0].turnId, 'turn-core-44');
assert.equal(turnEntries[0].outcomeId, 'outcome-core-44');
assert.equal(turnEntries[0].phase, 'directivePosted');
assert.equal(turnEntries[0].stateDeltaHash, 'core-state-delta-hash');
const diagnosticsSegment = await readV2ArtifactRef(adapter, result.refs.diagnosticsSegments[0]);
const diagnosticEntries = diagnosticsSegment.entries || [];
const modelCallDiagnostics = diagnosticEntries.filter((entry) => entry.type === 'runtimeModelCallProjected');
assert.equal(modelCallDiagnostics.length, 1, 'diagnostics segment stores compact model-call resume projections');
assert.equal(modelCallDiagnostics[0].modelCallId, 'model-call:42:utilityTurnClassifier');
assert.equal(modelCallDiagnostics[0].roleId, 'utilityTurnClassifier');
assert.equal(modelCallDiagnostics[0].requestHash, 'request-hash-utility-42');
const sidecarDiagnostics = diagnosticEntries.filter((entry) => entry.type === 'runtimeSidecarDiagnosticProjected');
assert.equal(sidecarDiagnostics.length, 3, 'diagnostics segment stores compact CORE sidecar projections');
assert.equal(sidecarDiagnostics[0].sidecarId, 'core-sidecar-1');
assert.equal(sidecarDiagnostics[0].workerKey, 'relationship');
assert.equal(sidecarDiagnostics[0].status, 'accepted');
assert.equal(sidecarDiagnostics[0].rawProviderOutput, undefined, 'compact sidecar projection omits raw provider output');
const backgroundDiagnostics = diagnosticEntries.filter((entry) => entry.type === 'runtimeBackgroundBatchProjected');
assert.equal(backgroundDiagnostics.length, 1, 'diagnostics segment stores compact CORE background batch projections');
assert.equal(backgroundDiagnostics[0].backgroundBatchId, 'background-batch-core-sidecar');
assert.equal(backgroundDiagnostics[0].acceptedBatchHash, 'accepted-batch-core-sidecar-hash');
assert.equal(backgroundDiagnostics[0].workerCount, 4);
const commandBearingEvidenceDiagnostics = diagnosticEntries.filter((entry) => entry.type === 'runtimeCommandBearingEvidenceProjected');
assert.equal(commandBearingEvidenceDiagnostics.length, 1, 'diagnostics segment stores compact CORE Command Bearing evidence projections');
assert.equal(commandBearingEvidenceDiagnostics[0].evidenceId, 'bearing-evidence-core-1');
assert.equal(commandBearingEvidenceDiagnostics[0].primarySignal, 'resolve');
assert.equal(JSON.stringify(commandBearingEvidenceDiagnostics).includes(transientCoreSidecarCanary), false, 'compact Command Bearing evidence omits raw evidence text');
const v2Artifacts = Object.fromEntries(Object.entries(adapter.snapshot()).filter(([key]) => key.startsWith('campaigns/')));
const v2ArtifactsJson = JSON.stringify(v2Artifacts);
assert.equal(v2ArtifactsJson.includes('Sam waited for her reply.'), false, 'v2 artifacts omit raw player text');
assert.equal(v2ArtifactsJson.includes('Raw assistant prose'), false, 'v2 artifacts omit raw assistant text');
assert.equal(v2ArtifactsJson.includes('raw prompt should not be in v2 diagnostics'), false, 'v2 artifacts omit raw prompt text');
assert.equal(v2ArtifactsJson.includes('raw runtime prompt should not be in v2 diagnostics'), false, 'v2 artifacts omit raw runtime prompt text');
assert.equal(v2ArtifactsJson.includes(modelCallPromptCanary), false, 'v2 artifacts omit raw model-call prompt text');
assert.equal(v2ArtifactsJson.includes(modelCallResponseCanary), false, 'v2 artifacts omit raw model-call response text');
assert.equal(v2ArtifactsJson.includes('secret provider output'), false, 'v2 artifacts omit retained provider output');
assert.equal(v2ArtifactsJson.includes('full runtime snapshot'), false, 'v2 artifacts omit full runtime snapshots');
assert.equal(v2ArtifactsJson.includes(omittedCommandLogCanary), false, 'v2 artifacts omit older turn-scaled Command Log text');
assert.equal(v2ArtifactsJson.includes('RAW_COMMAND_LOG_ASSISTED_SUMMARY_PROVIDER_OUTPUT'), false, 'v2 artifacts omit raw assisted Command Log provider output');
assert.equal(v2ArtifactsJson.includes(replacementTextCanary), false, 'v2 artifacts omit raw response replacement text');
assert.equal(v2ArtifactsJson.includes(transientCoreSidecarCanary), false, 'v2 artifacts omit transient CORE sidecar diagnostic payloads');
assert.equal(v2ArtifactsJson.includes(transientCoreProjectionCanary), false, 'v2 artifacts omit transient CORE runtime projection payloads');
assert.equal(v2ArtifactsJson.includes(outcomeIntegrityCanary), false, 'v2 artifacts omit raw outcome-integrity revision payloads');

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
assert.equal(loaded.campaignState.runtimeTracking.schemaVersion, 2, 'facade load returns compact runtime projections');
assert.equal(loaded.campaignState.runtimeTracking.ingressLedger.length, 1);
assert.equal(loaded.campaignState.runtimeTracking.ingressLedger[0].hostMessageId, '44');
assert.equal(loaded.campaignState.runtimeTracking.ingressLedger[0].textHash, 'corehash');
assert.equal(loaded.campaignState.runtimeTracking.ingressLedger[0].coreTransactionId, 'txn-core-44');
assert.equal(loaded.campaignState.runtimeTracking.ingressLedger[0].sourceFrameId, 'frame-core-44');
assert.equal(loaded.campaignState.runtimeTracking.responseLedger.length, 1);
assert.equal(loaded.campaignState.runtimeTracking.responseLedger[0].hostMessageId, '45');
assert.equal(loaded.campaignState.runtimeTracking.responseLedger[0].outcomeId, 'outcome-core-44');
assert.equal(loaded.campaignState.runtimeTracking.responseLedger[0].coreTransactionId, 'txn-core-45');
assert.equal(loaded.campaignState.runtimeTracking.responseLedger[0].replacementText, undefined, 'facade load must not rehydrate raw replacement text');
assert.equal(loaded.campaignState.runtimeTracking.responseLedger[0].replacementTextPresent, true, 'facade load preserves replacement-text presence evidence');
assert.equal(loaded.campaignState.runtimeTracking.responseLedger[0].replacementTextHash.length, 64, 'facade load preserves replacement-text hash evidence');
assert.equal(loaded.campaignState.runtimeTracking.responseLedger[0].replacementTextHash, coreReplacementTextHash, 'facade load preserves CORE replacement-text hash evidence');
assert.equal(loaded.campaignState.runtimeTracking.responseLedger[0].replacementTextLength, 777, 'facade load preserves CORE replacement-text length evidence');
assert.equal(loaded.campaignState.runtimeTracking.recoveryJournal.length, 1, 'facade load preserves compact CORE recovery projections');
assert.equal(loaded.campaignState.runtimeTracking.recoveryJournal[0].id, 'recovery-core-45');
assert.equal(loaded.campaignState.runtimeTracking.recoveryJournal[0].coreTransactionId, 'txn-core-45');
assert.equal(
  loaded.campaignState.runtimeTracking.recoveryJournal.some((entry) => entry.id === 'recovery-1'),
  false,
  'facade load must not revive legacy recovery rows once CORE recovery projections exist'
);
assert.equal(loaded.campaignState.runtimeTracking.modelCallJournal.length, 1, 'facade load preserves compact model-call resume projections');
assert.equal(loaded.campaignState.runtimeTracking.modelCallJournal[0].id, 'model-call:42:utilityTurnClassifier');
assert.equal(loaded.campaignState.runtimeTracking.modelCallJournal[0].roleId, 'utilityTurnClassifier');
assert.equal(loaded.campaignState.runtimeTracking.modelCallJournal[0].requestHash, 'request-hash-utility-42');
assert.equal(loaded.campaignState.runtimeTracking.modelCallJournal[0].latencyMs, 321);
assert.equal(loaded.campaignState.runtimeTracking.modelCallJournal[0].prompt, undefined, 'facade load must not rehydrate raw model-call prompt text');
assert.equal(loaded.campaignState.runtimeTracking.modelCallJournal[0].response, undefined, 'facade load must not rehydrate raw model-call response text');
const loadedCoreReadProjections = loaded.campaignState.directiveRuntimeEvidence?.coreStoreReadProjections || {};
assert.equal(loaded.campaignState.runtimeTracking.sidecarJournal.length, 0, 'facade load keeps accepted CORE sidecar/background diagnostics out of legacy sidecarJournal');
assert.equal(loadedCoreReadProjections.kind, 'directive.coreStoreReadProjections.v1', 'facade load returns transient CORE read projection evidence');
assert.equal(loadedCoreReadProjections.sidecarDiagnostics.length, 3, 'facade load preserves compact CORE sidecar diagnostic continuity under CORE projections');
assert.equal(loadedCoreReadProjections.sidecarDiagnostics[0].id, 'core-sidecar-1');
assert.equal(loadedCoreReadProjections.sidecarDiagnostics[0].workerKey, 'relationship');
assert.equal(loadedCoreReadProjections.sidecarDiagnostics[0].rawProviderOutput, undefined, 'facade load must not rehydrate raw sidecar provider output');
assert.equal(loadedCoreReadProjections.backgroundBatches.length, 1, 'facade load preserves accepted background-batch continuity under CORE projections');
assert.equal(loadedCoreReadProjections.backgroundBatches[0].acceptedBatchHash, 'accepted-batch-core-sidecar-hash');
assert.equal(loadedCoreReadProjections.backgroundBatches[0].workerCount, 4);
assert.equal(loadedCoreReadProjections.commandBearingEvidence.length, 1, 'facade load preserves compact Command Bearing evidence under CORE projections');
assert.equal(loadedCoreReadProjections.commandBearingEvidence[0].evidenceId, 'bearing-evidence-core-1');
assert.equal(loadedCoreReadProjections.commandBearingEvidence[0].evidenceHash, 'bearing-evidence-core-hash');
assert.equal(JSON.stringify(loadedCoreReadProjections.commandBearingEvidence).includes(transientCoreSidecarCanary), false, 'facade load must not rehydrate raw Command Bearing evidence text');
assert.equal(JSON.stringify(loaded.campaignState).includes(replacementTextCanary), false, 'facade load omits raw replacement text from runtime projections');
assert.equal(loaded.campaignState.turnLedger.entries.length, 1, 'facade load returns compact CORE turn projections');
assert.equal(loaded.campaignState.turnLedger.entries[0].turnId, 'turn-core-44');
assert.equal(loaded.campaignState.turnLedger.entries[0].outcomeId, 'outcome-core-44');
assert.equal(loaded.campaignState.turnLedger.entries[0].snapshotBeforeRetained, true, 'facade load preserves retained-snapshot capability without raw snapshot');
assert.equal(loaded.campaignState.turnLedger.lastCommittedOutcomeId, 'outcome-core-44');
assert.equal(loaded.campaignState.turnLedger.replacementHistory.at(-1).replacementOutcomeId, 'outcome-core-44');
assert.equal(loaded.campaignState.turnLedger.lastReplacedOutcomeId, 'outcome-core-33');
assert.equal(loadedCoreReadProjections.turnLedger.replacementHistory.at(-1).repairDecision.transactionId, 'txn-core-44');
assert.equal(loaded.campaignState.runtimeResume.modelCallEventSequence, 42, 'facade load returns compact runtime resume cursor');
assert.equal(loaded.campaignState.runtimeResume.sidecarCount, 4, 'facade load returns CORE accepted background-batch worker resume count');
assert.equal(loaded.campaignState.commandLog.compactedForRuntimeHead, true, 'facade load returns compact Command Log projection');
assert.equal(loaded.campaignState.commandLog.entries.length, 32);
assert.equal(loaded.campaignState.commandLog.entries.at(-1).type, 'turnOutcome', 'facade load preserves compact Command Log entry type for presentation labels');
assert.equal(
  loaded.campaignState.commandLog.entries.at(-1).assistedSummary.summary,
  'Recent assisted command summary 32.',
  'facade load preserves compact assisted Command Log summary text for presentation replay'
);
assert.deepEqual(
  loaded.campaignState.commandLog.entries.at(-1).assistedSummary.highlights,
  ['Recent assisted highlight 32.'],
  'facade load preserves compact assisted Command Log highlights for presentation replay'
);
let loadedRuntimeState = loaded.campaignState;
const resumedModelCallJournal = createRuntimeModelCallJournal({
  now: () => '2026-06-28T15:04:00.000Z',
  getCampaignState: () => loadedRuntimeState,
  setCampaignState(next) {
    loadedRuntimeState = next;
  }
});
const resumedModelCall = resumedModelCallJournal.record({
  roleId: 'directiveAssist',
  providerKind: 'reasoning',
  requestHash: 'request-hash-after-reload'
});
assert.match(resumedModelCall.id, /^model-call:43:directiveAssist$/, 'model-call journal resumes sequence from compact v2 evidence');
assert.equal(
  new Set(loadedRuntimeState.runtimeTracking.modelCallJournal.map((entry) => entry.id)).size,
  loadedRuntimeState.runtimeTracking.modelCallJournal.length,
  'model-call journal ids remain unique after recording on a v2-reloaded state'
);
const loadedRepersist = await persistActiveCampaignStateV2(adapter, {
  saveRecord,
  campaignState: loaded.campaignState,
  packageData,
  summary: 'Runtime v2 active-save compact model-call repersist test.',
  reason: 'test-runtime-model-call-repersist',
  now: '2026-06-28T15:04:30.000Z'
});
const loadedRepersistHead = await loadV2MaterializedHead(adapter, {
  campaignId: campaignState.campaign.id,
  saveId: saveRecord.id
});
assert.equal(loadedRepersistHead.runtimeSummary.modelCallCount, 1, 'repersisting loaded compact state keeps model-call count');
assert.equal(loadedRepersistHead.runtimeSummary.sidecarCount, 4, 'repersisting loaded compact state keeps sidecar/background resume count from CORE projections');
assert.equal(loadedRepersistHead.state.runtimeResume.modelCallEventSequence, 42, 'repersisting loaded compact state keeps model-call sequence cursor');
const loadedRepersistDiagnostics = await readV2ArtifactRef(adapter, loadedRepersist.refs.diagnosticsSegments[0]);
const loadedRepersistDiagnosticEntries = loadedRepersistDiagnostics.entries || [];
assert.equal(
  loadedRepersistDiagnosticEntries.filter((entry) => entry.type === 'runtimeModelCallProjected').length,
  1,
  'repersisting loaded compact state writes one compact model-call projection'
);
assert.equal(
  loadedRepersistDiagnosticEntries.filter((entry) => entry.type === 'runtimeSidecarDiagnosticProjected').length,
  3,
  'repersisting loaded compact state writes compact CORE sidecar projections from read evidence'
);
const loadedRepersistBackgroundDiagnostics = loadedRepersistDiagnosticEntries.filter((entry) => entry.type === 'runtimeBackgroundBatchProjected');
assert.equal(
  loadedRepersistBackgroundDiagnostics.length,
  1,
  'repersisting loaded compact state writes accepted background-batch projection from read evidence'
);
assert.equal(loadedRepersistBackgroundDiagnostics[0].acceptedBatchHash, 'accepted-batch-core-sidecar-hash');

snapshot = adapter.snapshot();
assert.equal(snapshot['indexes/saves.v1.json'].activeSaveId, saveRecord.id);
assert.equal(snapshot['indexes/saves.v1.json'].saves[saveRecord.id].path, v1SavePath);
assert.equal(snapshot['indexes/saves.v1.json'].saves[saveRecord.id].payloadKind || 'directive.campaignSave', 'directive.campaignSave');
assert.equal(snapshot['indexes/saves.v1.json'].saves[saveRecord.id].runtimeStorageFormat, 'v2');
assert.equal(snapshot['indexes/saves.v1.json'].saves[saveRecord.id].v2ManifestRef.logicalKey, saveManifestKey);
assert.equal(snapshot[v1SavePath].kind, 'directive.campaignSave', 'v1 manual checkpoint remains available');

const partialAdapter = createMemoryJsonAdapter();
const partialState = cloneJson(campaignState);
partialState.campaignChatBinding.saveId = 'save-active-v2-partial';
delete partialState.directiveRuntimeEvidence.coreStoreReadProjections.runtimeAuthority;
partialState.runtimeTracking.ingressLedger = [
  {
    id: 'legacy-ingress-old',
    hostMessageId: 'host-old',
    turnId: 'turn-old',
    outcomeId: 'outcome-old',
    textHash: 'legacy-ingress-old-hash',
    status: 'classified'
  },
  {
    id: 'legacy-ingress-shared',
    hostMessageId: 'host-shared',
    turnId: 'turn-shared',
    outcomeId: 'outcome-shared',
    textHash: 'legacy-ingress-shared-hash',
    status: 'classified'
  }
];
partialState.runtimeTracking.responseLedger = [
  {
    id: 'legacy-response-old',
    turnId: 'turn-old',
    outcomeId: 'outcome-old',
    responseKind: 'hostContinue',
    status: 'posted'
  },
  {
    id: 'legacy-response-shared',
    turnId: 'turn-shared',
    outcomeId: 'outcome-shared',
    responseKind: 'hostContinue',
    status: 'posted'
  }
];
partialState.turnLedger = {
  entries: [
    {
      id: 'legacy-turn-old',
      turnId: 'turn-old',
      outcomeId: 'outcome-old'
    },
    {
      id: 'legacy-turn-shared',
      turnId: 'turn-shared',
      outcomeId: 'outcome-shared'
    }
  ],
  lastCommittedOutcomeId: 'outcome-shared',
  replacementHistory: [
    {
      id: 'legacy-replacement-old',
      replacedOutcomeId: 'outcome-old',
      replacementOutcomeId: 'outcome-old-rerun',
      replacedTurnId: 'turn-old',
      replacementTurnId: 'turn-old-rerun'
    },
    {
      id: 'legacy-replacement-shared',
      replacedOutcomeId: 'outcome-shared',
      replacementOutcomeId: 'outcome-shared-rerun',
      replacedTurnId: 'turn-shared',
      replacementTurnId: 'turn-shared-rerun'
    }
  ]
};
partialState.runtimeTracking.recoveryJournal = [
  {
    id: 'legacy-recovery-old',
    status: 'reviewRequired',
    transactionId: 'txn-old'
  },
  {
    id: 'legacy-recovery-shared',
    status: 'reviewRequired',
    transactionId: 'txn-shared'
  }
];
partialState.directiveRuntimeEvidence.coreStoreReadProjections.ingressLedger = [
  {
    id: 'core-ingress-shared',
    hostMessageId: 'host-shared',
    turnId: 'turn-shared',
    outcomeId: 'outcome-shared',
    textHash: 'core-ingress-shared-hash',
    status: 'committed',
    transactionId: 'txn-shared'
  },
  {
    id: 'core-ingress-new',
    hostMessageId: 'host-new',
    turnId: 'turn-new',
    outcomeId: 'outcome-new',
    textHash: 'core-ingress-new-hash',
    status: 'committed',
    transactionId: 'txn-new'
  }
];
partialState.directiveRuntimeEvidence.coreStoreReadProjections.responseLedger = [{
  id: 'core-response-shared',
  turnId: 'turn-shared',
  outcomeId: 'outcome-shared',
  responseKind: 'hostContinue',
  status: 'posted',
  transactionId: 'txn-shared'
}];
partialState.directiveRuntimeEvidence.coreStoreReadProjections.turnLedger = {
  entries: [{
    id: 'core-turn-shared',
    turnId: 'turn-shared',
    outcomeId: 'outcome-shared',
    phase: 'hostContinueReleased',
    transactionId: 'txn-shared',
    stateDeltaHash: 'core-shared-state-delta-hash'
  }],
  lastCommittedOutcomeId: 'outcome-shared',
  replacementHistory: [
    {
      id: 'core-replacement-shared',
      transactionId: 'txn-shared',
      replacedOutcomeId: 'outcome-shared',
      replacementOutcomeId: 'outcome-shared-rerun',
      replacedTurnId: 'turn-shared',
      replacementTurnId: 'turn-shared-rerun'
    }
  ]
};
partialState.directiveRuntimeEvidence.coreStoreReadProjections.recoveryJournal = [
  {
    id: 'core-recovery-shared',
    status: 'resolved',
    transactionId: 'txn-shared'
  }
];
const partialSaveRecord = createFirstCampaignSaveRecord({
  campaignState: partialState,
  packageData,
  saveId: 'save-active-v2-partial',
  savedAt: '2026-06-28T15:02:30.000Z'
});
await storeCampaignSave(partialAdapter, partialSaveRecord);
const partialPersist = await persistActiveCampaignStateV2(partialAdapter, {
  saveRecord: partialSaveRecord,
  campaignState: partialState,
  packageData,
  summary: 'Runtime v2 active-save partial CORE projection test.',
  reason: 'test-runtime-partial-core-persist',
  now: '2026-06-28T15:03:00.000Z'
});
const partialHead = await loadV2MaterializedHead(partialAdapter, {
  campaignId: partialState.campaign.id,
  saveId: partialSaveRecord.id
});
assert.equal(partialHead.runtimeSummary.responseCount, 2, 'partial CORE response projections must not shrink compact response counts');
const partialEventSegment = await readV2ArtifactRef(partialAdapter, partialPersist.refs.eventSegments[0]);
const partialIngresses = (partialEventSegment.entries || []).filter((entry) => entry.type === 'runtimeIngressProjected');
assert.deepEqual(
  partialIngresses.map((entry) => entry.outcomeId),
  ['outcome-old', 'outcome-shared', 'outcome-new'],
  'unmarked equal-cardinality CORE ingress merge preserves unmatched legacy rows and appends unmatched CORE rows'
);
assert.equal(partialIngresses.find((entry) => entry.outcomeId === 'outcome-shared')?.ingressId, 'core-ingress-shared');
const partialResponses = (partialEventSegment.entries || []).filter((entry) => entry.type === 'runtimeResponseProjected');
assert.deepEqual(
  partialResponses.map((entry) => entry.outcomeId),
  ['outcome-old', 'outcome-shared'],
  'partial CORE response merge preserves ledger order while replacing matching rows'
);
assert.equal(partialResponses.filter((entry) => entry.outcomeId === 'outcome-shared').length, 1, 'partial CORE response merge dedupes logical fallback tuple matches');
assert.equal(partialResponses.find((entry) => entry.outcomeId === 'outcome-shared')?.responseId, 'core-response-shared');
const partialRecoveries = (partialEventSegment.entries || []).filter((entry) => entry.type === 'runtimeRecoveryProjected');
assert.deepEqual(
  partialRecoveries.map((entry) => entry.recoveryId),
  ['core-recovery-shared'],
  'partial CORE recovery projection must not preserve unmatched legacy recovery rows'
);
const partialReplacements = (partialEventSegment.entries || []).filter((entry) => entry.type === 'outcomeReplacementRecorded');
assert.deepEqual(
  partialReplacements.map((entry) => entry.payload?.outcomeReplacementRef?.replacedOutcomeId),
  ['outcome-old', 'outcome-shared'],
  'unmarked partial CORE replacement history merge preserves unmatched legacy replacements'
);
const partialLoaded = await loadActiveCampaignStateV2(partialAdapter, {
  saveRecord: partialSaveRecord,
  fallbackCampaignState: partialSaveRecord.payload.campaignState
});
assert.equal(partialLoaded.campaignState.turnLedger.lastCommittedOutcomeId, 'outcome-shared', 'partial CORE turn merge must not regress last committed outcome on reload');
assert.deepEqual(
  partialLoaded.campaignState.turnLedger.entries.map((entry) => entry.outcomeId),
  ['outcome-old', 'outcome-shared'],
  'partial CORE turn merge preserves chronological compatibility order'
);
assert.equal(partialLoaded.campaignState.turnLedger.entries.at(-1).id, 'core-turn-shared', 'partial CORE turn merge replaces matching legacy row with CORE row');

const authoritativeCoreAdapter = createMemoryJsonAdapter();
const authoritativeCoreState = cloneJson(partialState);
authoritativeCoreState.campaignChatBinding.saveId = 'save-active-v2-authoritative-core';
authoritativeCoreState.directiveRuntimeEvidence.coreStoreReadProjections.runtimeAuthority = 'coreStoreV2';
const authoritativeCoreSaveRecord = createFirstCampaignSaveRecord({
  campaignState: authoritativeCoreState,
  packageData,
  saveId: 'save-active-v2-authoritative-core',
  savedAt: '2026-06-28T15:03:30.000Z'
});
await storeCampaignSave(authoritativeCoreAdapter, authoritativeCoreSaveRecord);
const authoritativeCorePersist = await persistActiveCampaignStateV2(authoritativeCoreAdapter, {
  saveRecord: authoritativeCoreSaveRecord,
  campaignState: authoritativeCoreState,
  packageData,
  summary: 'Runtime v2 active-save authoritative CORE projection test.',
  reason: 'test-runtime-authoritative-core-persist',
  now: '2026-06-28T15:04:00.000Z'
});
const authoritativeEventSegment = await readV2ArtifactRef(authoritativeCoreAdapter, authoritativeCorePersist.refs.eventSegments[0]);
const authoritativeIngresses = (authoritativeEventSegment.entries || []).filter((entry) => entry.type === 'runtimeIngressProjected');
assert.deepEqual(
  authoritativeIngresses.map((entry) => entry.outcomeId),
  ['outcome-shared', 'outcome-new'],
  'authoritative CORE runtime projections must not reserialize unmatched legacy ingress rows'
);
const authoritativeResponses = (authoritativeEventSegment.entries || []).filter((entry) => entry.type === 'runtimeResponseProjected');
assert.deepEqual(
  authoritativeResponses.map((entry) => entry.outcomeId),
  ['outcome-shared'],
  'authoritative CORE runtime projections must not reserialize unmatched legacy response rows'
);
const authoritativeTurnSegment = await readV2ArtifactRef(authoritativeCoreAdapter, authoritativeCorePersist.refs.turnSegments[0]);
assert.deepEqual(
  (authoritativeTurnSegment.entries || []).map((entry) => entry.outcomeId),
  ['outcome-shared'],
  'authoritative CORE runtime projections must not reserialize unmatched legacy turn rows'
);
const authoritativeRecoveries = (authoritativeEventSegment.entries || []).filter((entry) => entry.type === 'runtimeRecoveryProjected');
assert.deepEqual(
  authoritativeRecoveries.map((entry) => entry.recoveryId),
  ['core-recovery-shared'],
  'authoritative CORE runtime projections must not reserialize unmatched legacy recovery rows'
);
const authoritativeReplacements = (authoritativeEventSegment.entries || []).filter((entry) => entry.type === 'outcomeReplacementRecorded');
assert.deepEqual(
  authoritativeReplacements.map((entry) => entry.payload?.outcomeReplacementRef?.replacedOutcomeId),
  ['outcome-shared'],
  'authoritative CORE runtime projections must not reserialize unmatched legacy replacement history'
);
const authoritativeLoaded = await loadActiveCampaignStateV2(authoritativeCoreAdapter, {
  saveRecord: authoritativeCoreSaveRecord,
  fallbackCampaignState: authoritativeCoreSaveRecord.payload.campaignState
});
assert.equal(
  authoritativeLoaded.campaignState.runtimeTracking.ingressLedger.some((entry) => entry.id === 'legacy-ingress-old'),
  false,
  'authoritative CORE runtime load must not revive unmatched legacy ingress rows'
);
assert.equal(
  authoritativeLoaded.campaignState.runtimeTracking.responseLedger.some((entry) => entry.id === 'legacy-response-old'),
  false,
  'authoritative CORE runtime load must not revive unmatched legacy response rows'
);
assert.equal(
  authoritativeLoaded.campaignState.turnLedger.entries.some((entry) => entry.id === 'legacy-turn-old'),
  false,
  'authoritative CORE runtime load must not revive unmatched legacy turn rows'
);
assert.equal(
  authoritativeLoaded.campaignState.runtimeTracking.recoveryJournal.some((entry) => entry.id === 'legacy-recovery-old'),
  false,
  'authoritative CORE runtime load must not revive unmatched legacy recovery rows'
);

const duplicateModelCallAdapter = createMemoryJsonAdapter();
const duplicateModelCallState = cloneJson(campaignState);
duplicateModelCallState.campaignChatBinding.saveId = 'save-active-v2-duplicate-model-call';
duplicateModelCallState.runtimeTracking.modelCallJournal = [
  {
    id: 'model-call:42:utilityTurnClassifier',
    roleId: 'utilityTurnClassifier',
    requestHash: 'request-hash-utility-42',
    latencyMs: 321,
    recordedAt: '2026-06-28T15:00:45.000Z'
  },
  {
    id: 'model-call:42:utilityTurnClassifier',
    roleId: 'utilityTurnClassifier',
    requestHash: 'request-hash-utility-42',
    latencyMs: 654,
    recordedAt: '2026-06-28T15:00:46.000Z'
  }
];
const duplicateModelCallSaveRecord = createFirstCampaignSaveRecord({
  campaignState: duplicateModelCallState,
  packageData,
  saveId: 'save-active-v2-duplicate-model-call',
  savedAt: '2026-06-28T15:05:30.000Z'
});
await storeCampaignSave(duplicateModelCallAdapter, duplicateModelCallSaveRecord);
await persistActiveCampaignStateV2(duplicateModelCallAdapter, {
  saveRecord: duplicateModelCallSaveRecord,
  campaignState: duplicateModelCallState,
  packageData,
  summary: 'Runtime v2 active-save duplicate model-call projection test.',
  reason: 'test-runtime-duplicate-model-call-persist',
  now: '2026-06-28T15:06:00.000Z'
});
const duplicateModelCallLoaded = await loadActiveCampaignStateV2(duplicateModelCallAdapter, {
  saveRecord: duplicateModelCallSaveRecord,
  fallbackCampaignState: duplicateModelCallSaveRecord.payload.campaignState
});
assert.equal(
  duplicateModelCallLoaded.campaignState.runtimeTracking.modelCallJournal.length,
  1,
  'facade load dedupes repeated compact model-call projections by id'
);
assert.equal(duplicateModelCallLoaded.campaignState.runtimeTracking.modelCallJournal[0].latencyMs, 654, 'model-call projection dedupe keeps the latest compact row');

const coreWorkerShapeAdapter = createMemoryJsonAdapter();
const coreWorkerShapeState = cloneJson(campaignState);
coreWorkerShapeState.campaignChatBinding.saveId = 'save-active-v2-core-worker-shape';
coreWorkerShapeState.directiveRuntimeEvidence.coreStoreReadProjections.sidecarDiagnostics = [
  {
    transactionId: 'txn-core-worker-shape',
    status: 'accepted',
    worker: 'relationship',
    sidecarType: 'relationship',
    acceptedBatchHash: 'accepted-batch-core-worker-shape',
    rawProviderOutput: transientCoreSidecarCanary
  },
  {
    transactionId: 'txn-core-worker-shape',
    status: 'accepted',
    worker: 'crew',
    sidecarType: 'crew',
    acceptedBatchHash: 'accepted-batch-core-worker-shape',
    rawProviderOutput: transientCoreSidecarCanary
  }
];
coreWorkerShapeState.directiveRuntimeEvidence.coreStoreReadProjections.backgroundBatches = [];
const coreWorkerShapeSaveRecord = createFirstCampaignSaveRecord({
  campaignState: coreWorkerShapeState,
  packageData,
  saveId: 'save-active-v2-core-worker-shape',
  savedAt: '2026-06-28T15:07:30.000Z'
});
await storeCampaignSave(coreWorkerShapeAdapter, coreWorkerShapeSaveRecord);
const coreWorkerShapePersist = await persistActiveCampaignStateV2(coreWorkerShapeAdapter, {
  saveRecord: coreWorkerShapeSaveRecord,
  campaignState: coreWorkerShapeState,
  packageData,
  summary: 'Runtime v2 active-save CORE worker-shape sidecar projection test.',
  reason: 'test-runtime-core-worker-shape-sidecar-persist',
  now: '2026-06-28T15:08:00.000Z'
});
const coreWorkerShapeDiagnostics = await readV2ArtifactRef(coreWorkerShapeAdapter, coreWorkerShapePersist.refs.diagnosticsSegments[0]);
const coreWorkerShapeSidecars = (coreWorkerShapeDiagnostics.entries || []).filter((entry) => entry.type === 'runtimeSidecarDiagnosticProjected');
assert.deepEqual(
  coreWorkerShapeSidecars.map((entry) => entry.workerKey),
  ['relationship', 'crew'],
  'compact sidecar projections preserve CORE worker aliases when producer rows omit id and workerKey'
);
const coreWorkerShapeLoaded = await loadActiveCampaignStateV2(coreWorkerShapeAdapter, {
  saveRecord: coreWorkerShapeSaveRecord,
  fallbackCampaignState: coreWorkerShapeSaveRecord.payload.campaignState
});
const coreWorkerShapeLoadedProjections = coreWorkerShapeLoaded.campaignState.directiveRuntimeEvidence?.coreStoreReadProjections || {};
assert.deepEqual(
  (coreWorkerShapeLoadedProjections.sidecarDiagnostics || []).map((entry) => entry.workerKey),
  ['relationship', 'crew'],
  'facade load must not collapse same-transaction CORE worker-shape sidecar projections'
);
assert.equal(
  JSON.stringify(coreWorkerShapeLoaded.campaignState).includes(transientCoreSidecarCanary),
  false,
  'CORE worker-shape sidecar reload still omits raw provider output'
);

const promptResumeAdapter = createMemoryJsonAdapter();
const promptResumeState = cloneJson(campaignState);
promptResumeState.campaignChatBinding = {
  ...promptResumeState.campaignChatBinding,
  saveId: 'save-active-v2-prompt-resume',
  promptContextRevision: 5,
  externalPromptEnvironmentRef: {
    kind: 'directive.externalPromptEnvironmentRef.v1',
    revision: 5,
    targets: ['stale-world-info']
  }
};
delete promptResumeState.runtimeTracking;
delete promptResumeState.turnLedger;
delete promptResumeState.directiveRuntimeEvidence;
promptResumeState.runtimeResume = {
  kind: 'directive.runtimeResumeCursor.v1',
  runtimeRevision: 3,
  mechanicsRevision: 2,
  responseLedgerRevision: 1,
  promptContextRevision: 5
};
const promptResumeSaveRecord = createFirstCampaignSaveRecord({
  campaignState: promptResumeState,
  packageData,
  saveId: 'save-active-v2-prompt-resume',
  savedAt: '2026-06-28T15:09:30.000Z'
});
await storeCampaignSave(promptResumeAdapter, promptResumeSaveRecord);
await commitV2SaveLayout(promptResumeAdapter, {
  campaignId: promptResumeState.campaign.id,
  saveId: promptResumeSaveRecord.id,
  branchId: 'main',
  now: '2026-06-28T15:10:00.000Z',
  current: true,
  metadata: promptResumeSaveRecord.metadata,
  head: {
    source: 'active-save-facade-v2-test',
    state: promptResumeState,
    excludesRuntimeJournals: true
  },
  hostMap: {
    excludesRawChatText: true,
    rows: []
  },
  promptCache: {
    directiveOwnedRevision: 9,
    externalPromptEnvironmentRef: {
      kind: 'directive.externalPromptEnvironmentRef.v1',
      revision: 9,
      targets: ['st-lorebooks', 'memory-books', 'summaryception', 'vectfox']
    },
    blocks: [{
      key: 'directive-owned-context',
      rawPromptText: 'RAW_PROMPT_CACHE_BLOCK_CANARY must not be needed for resume.'
    }]
  },
  eventSegments: [[]],
  turnSegments: [[]],
  diagnosticsSegments: [[]],
  checkpoints: []
});
const promptResumeLoaded = await loadActiveCampaignStateV2(promptResumeAdapter, {
  saveRecord: promptResumeSaveRecord,
  fallbackCampaignState: promptResumeSaveRecord.payload.campaignState
});
assert.equal(promptResumeLoaded.found, true);
assert.equal(promptResumeLoaded.head.promptCache.directiveOwnedRevision, 9, 'facade load returns verified prompt-cache resume evidence');
assert.equal(
  promptResumeLoaded.campaignState.campaignChatBinding.promptContextRevision,
  9,
  'facade load restores Directive-owned prompt revision from the v2 prompt-cache artifact when the materialized head is stale'
);
assert.deepEqual(
  promptResumeLoaded.campaignState.campaignChatBinding.externalPromptEnvironmentRef.targets,
  ['st-lorebooks', 'memory-books', 'summaryception', 'vectfox'],
  'facade load restores compact external prompt environment refs from prompt-cache artifact'
);
assert.equal(
  JSON.stringify(promptResumeLoaded.campaignState).includes('RAW_PROMPT_CACHE_BLOCK_CANARY'),
  false,
  'prompt-cache resume must not copy raw prompt blocks into campaign state'
);
assert.equal(
  JSON.stringify(promptResumeLoaded).includes('RAW_PROMPT_CACHE_BLOCK_CANARY'),
  false,
  'facade load returns compact prompt-cache resume evidence without raw prompt blocks'
);

console.log('Active save facade v2 tests passed.');
