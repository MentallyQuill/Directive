import {
  createCampaignSaveMetadata
} from './save-records.mjs';
import {
  commitV2SaveLayout,
  loadV2SaveManifest,
  readV2ArtifactRef
} from './transaction-store-v2.mjs';
import {
  hashStableJson
} from '../runtime/architecture-redesign-contracts.mjs';
import {
  markCampaignSaveRuntimeV2State
} from './directive-storage-repository.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireObject(value, label) {
  if (!isObject(value)) throw new Error(`${label} must be an object`);
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function isoNow() {
  return new Date().toISOString();
}

function compact(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function runtimeCollection(campaignState = {}, key) {
  const runtimeTracking = campaignState.runtimeTracking || {};
  if (Array.isArray(runtimeTracking[key])) return runtimeTracking[key];
  if (Array.isArray(campaignState[key])) return campaignState[key];
  return [];
}

function maxModelCallEventSequence(campaignState = {}) {
  return runtimeCollection(campaignState, 'modelCallJournal').reduce((max, entry) => {
    const match = /^model-call:(\d+):/.exec(String(entry?.id || ''));
    const sequence = match ? Number(match[1]) : 0;
    return Number.isFinite(sequence) && sequence > max ? sequence : max;
  }, 0);
}

function runtimeSummary(campaignState = {}) {
  const runtimeTracking = campaignState.runtimeTracking || {};
  const turnLedger = campaignState.turnLedger || {};
  const modelCalls = runtimeCollection(campaignState, 'modelCallJournal');
  const sidecars = runtimeCollection(campaignState, 'sidecarJournal');
  return {
    ingressCount: Array.isArray(runtimeTracking.ingressLedger) ? runtimeTracking.ingressLedger.length : 0,
    responseCount: Array.isArray(runtimeTracking.responseLedger) ? runtimeTracking.responseLedger.length : 0,
    responseLedgerRevision: Math.max(0, Number(runtimeTracking.responseLedgerRevision) || 0),
    recoveryCount: Array.isArray(runtimeTracking.recoveryJournal) ? runtimeTracking.recoveryJournal.length : 0,
    historyCount: Array.isArray(runtimeTracking.history) ? runtimeTracking.history.length : 0,
    turnCount: Array.isArray(turnLedger.entries) ? turnLedger.entries.length : 0,
    lastCommittedOutcomeId: turnLedger.lastCommittedOutcomeId || null,
    modelCallCount: modelCalls.length,
    modelCallEventSequence: maxModelCallEventSequence(campaignState),
    sidecarCount: sidecars.length
  };
}

function runtimeResumeCursor(campaignState = {}) {
  const runtimeTracking = campaignState.runtimeTracking || {};
  const modelCalls = runtimeCollection(campaignState, 'modelCallJournal');
  const sidecars = runtimeCollection(campaignState, 'sidecarJournal');
  return compact({
    kind: 'directive.runtimeResumeCursor.v1',
    runtimeRevision: runtimeTracking.revision || 0,
    mechanicsRevision: runtimeTracking.mechanicsRevision || 0,
    responseLedgerRevision: Math.max(0, Number(runtimeTracking.responseLedgerRevision) || 0),
    promptContextRevision: campaignState.campaignChatBinding?.promptContextRevision || null,
    modelCallCount: modelCalls.length,
    modelCallEventSequence: maxModelCallEventSequence(campaignState),
    sidecarCount: sidecars.length
  });
}

function materializedHeadState(campaignState = {}) {
  const {
    runtimeTracking,
    turnLedger,
    modelCallJournal,
    sidecarJournal,
    ...headState
  } = campaignState || {};
  return cloneJson({
    ...headState,
    runtimeResume: runtimeResumeCursor(campaignState)
  });
}

function hostRowsFromRuntime(campaignState = {}) {
  const runtimeTracking = campaignState.runtimeTracking || {};
  const ingressRows = Array.isArray(runtimeTracking.ingressLedger) ? runtimeTracking.ingressLedger : [];
  const responseRows = Array.isArray(runtimeTracking.responseLedger) ? runtimeTracking.responseLedger : [];
  return [
    ...ingressRows.map((entry) => compact({
      hostMessageId: entry.hostMessageId || null,
      role: 'player',
      ingressId: entry.id || null,
      turnId: entry.turnId || null,
      outcomeId: entry.outcomeId || null,
      textHash: entry.textHash || null,
      status: entry.status || null
    })),
    ...responseRows.map((entry) => compact({
      hostMessageId: entry.hostMessageId || null,
      role: 'assistant',
      responseId: entry.id || null,
      turnId: entry.turnId || null,
      outcomeId: entry.outcomeId || null,
      status: entry.status || null,
      outcomeIntegrity: entry.outcomeIntegrity ? cloneJson(entry.outcomeIntegrity) : undefined
    }))
  ];
}

function runtimeEvents(campaignState = {}) {
  const runtimeTracking = campaignState.runtimeTracking || {};
  const ingressRows = Array.isArray(runtimeTracking.ingressLedger) ? runtimeTracking.ingressLedger : [];
  const responseRows = Array.isArray(runtimeTracking.responseLedger) ? runtimeTracking.responseLedger : [];
  return [
    ...ingressRows.map((entry, index) => compact({
      kind: 'directive.coreEvent.v1',
      schemaVersion: 1,
      id: `runtime-ingress-${index + 1}`,
      type: 'runtimeIngressProjected',
      ingressId: entry.id || null,
      hostMessageId: entry.hostMessageId || null,
      turnId: entry.turnId || null,
      outcomeId: entry.outcomeId || null,
      textHash: entry.textHash || null,
      status: entry.status || null
    })),
    ...responseRows.map((entry, index) => compact({
      kind: 'directive.coreEvent.v1',
      schemaVersion: 1,
      id: `runtime-response-${index + 1}`,
      type: 'runtimeResponseProjected',
      responseId: entry.id || null,
      hostMessageId: entry.hostMessageId || null,
      turnId: entry.turnId || null,
      outcomeId: entry.outcomeId || null,
      status: entry.status || null,
      responseKind: entry.responseKind || null,
      outcomeIntegrity: entry.outcomeIntegrity ? cloneJson(entry.outcomeIntegrity) : undefined
    }))
  ];
}

function runtimeTrackingFromEventSegments(eventSegments = [], headState = {}) {
  const entries = eventSegments.flatMap((segment) => (
    Array.isArray(segment?.entries) ? segment.entries : []
  ));
  const ingressLedger = entries
    .filter((entry) => entry?.type === 'runtimeIngressProjected')
    .map((entry) => compact({
      id: entry.ingressId || null,
      hostMessageId: entry.hostMessageId || null,
      turnId: entry.turnId || null,
      outcomeId: entry.outcomeId || null,
      textHash: entry.textHash || null,
      status: entry.status || null
    }));
  const responseLedger = entries
    .filter((entry) => entry?.type === 'runtimeResponseProjected')
    .map((entry) => compact({
      id: entry.responseId || null,
      hostMessageId: entry.hostMessageId || null,
      turnId: entry.turnId || null,
      outcomeId: entry.outcomeId || null,
      status: entry.status || null,
      responseKind: entry.responseKind || null,
      outcomeIntegrity: entry.outcomeIntegrity ? cloneJson(entry.outcomeIntegrity) : undefined
    }));
  const resume = headState?.runtimeResume || {};
  return compact({
    schemaVersion: 2,
    revision: Math.max(0, Number(resume.runtimeRevision) || 0),
    mechanicsRevision: Math.max(0, Number(resume.mechanicsRevision) || 0),
    responseLedgerRevision: Math.max(0, Number(resume.responseLedgerRevision) || 0),
    ingressLedger,
    responseLedger,
    recoveryJournal: [],
    sidecarJournal: [],
    modelCallJournal: [],
    pendingInteractions: []
  });
}

function turnRecords(campaignState = {}) {
  const turns = Array.isArray(campaignState.turnLedger?.entries) ? campaignState.turnLedger.entries : [];
  return turns.map((entry, index) => compact({
    kind: 'directive.coreStoreTurnRecord.v1',
    schemaVersion: 1,
    id: `runtime-turn-${index + 1}`,
    turnId: entry.turnId || entry.id || null,
    outcomeId: entry.outcomeId || null,
    phase: 'runtimeProjected',
    stateDeltaHash: entry.stateDelta ? hashStableJson(entry.stateDelta) : null,
    retainedPacketHash: entry.retainedPacket ? hashStableJson(entry.retainedPacket) : null,
    snapshotBeforeHash: entry.snapshotBefore ? hashStableJson(entry.snapshotBefore) : null
  }));
}

function diagnostics(campaignState = {}, { reason = null } = {}) {
  const summary = runtimeSummary(campaignState);
  return [
    compact({
      kind: 'directive.coreDiagnostic.v1',
      schemaVersion: 1,
      id: 'runtime-persistence-summary',
      type: 'runtimePersistenceSummary',
      status: 'ok',
      reason,
      runtimeSummary: summary
    })
  ];
}

function metadataFor({ saveRecord, campaignState, packageData, savedAt, summary }) {
  if (campaignState && packageData) {
    return createCampaignSaveMetadata({
      campaignState,
      packageData,
      savedAt,
      summary
    });
  }
  return cloneJson(saveRecord.metadata || {
    campaignId: campaignState?.campaign?.id || null,
    lastUpdatedAt: savedAt,
    summary: summary || null
  });
}

function campaignIdFor(saveRecord, campaignState) {
  return requireNonEmptyString(campaignState?.campaign?.id || saveRecord.metadata?.campaignId, 'campaignId');
}

function saveIdFor(saveRecord) {
  return requireNonEmptyString(saveRecord.id, 'saveRecord.id');
}

export async function persistActiveCampaignStateV2(adapter, {
  saveRecord,
  campaignState,
  packageData = null,
  summary = null,
  reason = 'runtimePersist',
  current = null,
  now = null
} = {}) {
  requireObject(saveRecord, 'saveRecord');
  if (saveRecord.kind !== 'directive.campaignSave') throw new Error('saveRecord must be a directive.campaignSave record');
  requireObject(campaignState, 'campaignState');
  const savedAt = now || isoNow();
  const campaignId = campaignIdFor(saveRecord, campaignState);
  const saveId = saveIdFor(saveRecord);
  const headState = materializedHeadState(campaignState);
  const metadata = metadataFor({ saveRecord, campaignState, packageData, savedAt, summary });

  const commit = await commitV2SaveLayout(adapter, {
    campaignId,
    saveId,
    branchId: saveRecord.metadata?.branch?.branchId || 'main',
    now: savedAt,
    current: saveRecord.current === true,
    metadata,
    importedFrom: {
      kind: saveRecord.kind,
      saveId,
      revision: saveRecord.revision || null,
      updatedAt: saveRecord.updatedAt || null,
      summary: 'v1 manual checkpoint remains available; v2 active state is runtime-current.'
    },
    head: {
      source: 'active-save-facade-v2',
      state: headState,
      runtimeSummary: runtimeSummary(campaignState),
      materializedHeadStateHash: hashStableJson(headState),
      excludesRuntimeJournals: true
    },
    hostMap: {
      excludesRawChatText: true,
      rows: hostRowsFromRuntime(campaignState)
    },
    promptCache: {
      directiveOwnedRevision: campaignState.campaignChatBinding?.promptContextRevision || null,
      externalPromptEnvironmentRef: campaignState.campaignChatBinding?.externalPromptEnvironmentRef || null,
      blocks: []
    },
    eventSegments: [runtimeEvents(campaignState)],
    turnSegments: [turnRecords(campaignState)],
    diagnosticsSegments: [diagnostics(campaignState, { reason })],
    checkpoints: [{
      checkpointId: 'runtime-active-head',
      type: 'runtimeActiveHead',
      stateHash: hashStableJson(headState),
      reason
    }]
  });

  const saveIndexEntry = await markCampaignSaveRuntimeV2State(adapter, {
    saveId,
    saveManifest: commit.saveManifest,
    saveManifestRef: commit.saveManifestRef,
    metadata,
    current: current === null ? saveRecord.current === true : current === true,
    now: savedAt
  });

  return {
    kind: 'directive.activeCampaignStatePersist.v2',
    storageFormat: 'v2',
    campaignId,
    saveId,
    updatedAt: savedAt,
    wroteV1Payload: false,
    saveManifestRef: commit.saveManifestRef,
    campaignManifestRef: commit.campaignManifestRef,
    refs: cloneJson(commit.refs),
    saveIndexEntry
  };
}

export async function hasActiveCampaignStateV2(adapter, {
  campaignId,
  saveId
} = {}) {
  try {
    await loadV2SaveManifest(adapter, {
      campaignId: requireNonEmptyString(campaignId, 'campaignId'),
      saveId: requireNonEmptyString(saveId, 'saveId')
    });
    return true;
  } catch {
    return false;
  }
}

export async function loadActiveCampaignStateV2(adapter, {
  saveRecord,
  fallbackCampaignState = null
} = {}) {
  requireObject(saveRecord, 'saveRecord');
  const campaignId = campaignIdFor(saveRecord, fallbackCampaignState || {});
  const saveId = saveIdFor(saveRecord);
  try {
    const saveManifest = await loadV2SaveManifest(adapter, { campaignId, saveId });
    const head = await readV2ArtifactRef(adapter, saveManifest.head);
    const eventSegments = [];
    for (const ref of saveManifest.eventSegments || []) {
      eventSegments.push(await readV2ArtifactRef(adapter, ref));
    }
    const campaignState = cloneJson(head.state || null);
    if (campaignState) {
      campaignState.runtimeTracking = runtimeTrackingFromEventSegments(eventSegments, campaignState);
    }
    return {
      kind: 'directive.activeCampaignStateLoad.v2',
      storageFormat: 'v2',
      found: true,
      campaignId,
      saveId,
      saveManifest,
      campaignState,
      head: {
        ...head,
        eventSegments
      }
    };
  } catch (error) {
    return {
      kind: 'directive.activeCampaignStateLoad.v2',
      storageFormat: 'v2',
      found: false,
      campaignId,
      saveId,
      campaignState: cloneJson(fallbackCampaignState),
      error: {
        message: error?.message || String(error),
        code: error?.code || null
      }
    };
  }
}
