import assert from 'node:assert/strict';

import { createFakeJsonStorage } from '../../src/hosts/fake/fake-host.mjs';
import {
  createExternalPromptEnvironmentRef,
  createStorageWriteCounters,
  createTurnLatencyMetrics,
  hashStableJson,
  normalizeExternalPromptEnvironment,
  recordStorageWrite,
  stableJsonByteLength
} from '../../src/runtime/architecture-redesign-contracts.mjs';
import { createLogicalStorageAdapter } from '../../src/storage/logical-storage-adapter.mjs';
import {
  commitV2SaveLayout,
  loadV2SaveManifest,
  readV2ArtifactRef
} from '../../src/storage/transaction-store-v2.mjs';

const MESSAGE_COUNT = 5000;
const MATERIALIZED_HEAD_MAX_BYTES = 8 * 1024 * 1024;
const SAVE_MANIFEST_MAX_BYTES = 50 * 1024;
const ACTIVE_PROMPT_CACHE_MAX_BYTES = 1024 * 1024;
const HOST_MAP_MAX_BYTES = 5 * 1024 * 1024;
const EVENT_SEGMENT_MAX_BYTES = 2 * 1024 * 1024;
const DIAGNOSTICS_SEGMENT_MAX_BYTES = 5 * 1024 * 1024;
const SEGMENT_HEADROOM_BYTES = 8 * 1024;

function repeated(label, index, targetLength) {
  const seed = `${label}-${String(index).padStart(4, '0')} `;
  return seed.repeat(Math.ceil(targetLength / seed.length)).slice(0, targetLength);
}

function makeHash(label, value) {
  return hashStableJson({ label, value });
}

function createSyntheticMessages(count) {
  return Array.from({ length: count }, (_, index) => {
    const role = index % 2 === 0 ? 'player' : 'assistant';
    return {
      hostMessageId: `msg-${String(index + 1).padStart(5, '0')}`,
      role,
      turnId: `turn-${String(Math.floor(index / 2) + 1).padStart(5, '0')}`,
      outcomeId: role === 'assistant' ? `outcome-${String(Math.floor(index / 2) + 1).padStart(5, '0')}` : null,
      text: repeated(role === 'player' ? 'Sam spoke plainly' : 'Breckenridge answered', index, 520)
    };
  });
}

function createExternalEnvironment() {
  return normalizeExternalPromptEnvironment({
    host: 'sillytavern',
    userHandle: 'directive-soak-a',
    chatId: 'ashes-scale-chat',
    campaignId: 'campaign-ashes-scale',
    observedAt: '2026-06-28T12:00:00.000Z',
    promptKeys: ['directive.campaign.context', 'summaryception', '3_vectfox', '3_vectfox_eventbase'],
    worldInfo: {
      installed: true,
      enabled: true,
      activeNames: ['Ashes Test Lorebook'],
      chatBoundName: 'Ashes Test Lorebook',
      promptPositions: ['before', 'atDepth'],
      depth: 4,
      budgetPercent: 80,
      rawPromptBody: 'Raw lorebook content must not enter diagnostics.'
    },
    memoryBooks: {
      installed: true,
      enabled: true,
      activeBookName: 'Ashes Memory Book',
      entryCount: 240,
      entryHash: makeHash('stmb-entries', 240),
      autoSummary: true,
      autoHideUnhide: true,
      sidePrompts: true
    },
    summaryception: {
      installed: true,
      enabled: true,
      promptKeyActive: true,
      summarizedUpTo: 3800,
      layerCount: 12,
      ghostedCount: 3200,
      injectionHash: makeHash('summaryception', 12),
      promptText: 'Raw rolling summary must not enter diagnostics.'
    },
    vectFox: {
      installed: true,
      enabled: false,
      disabledPresent: true,
      promptKeys: ['3_vectfox', '3_vectfox_eventbase'],
      vectorBackend: 'qdrant',
      generationInterceptorActive: false,
      qdrant_api_key: 'SECRET-QDRANT-KEY',
      vectorPayload: ['Raw vector payload must not enter diagnostics.']
    }
  });
}

function createMaterializedHead({ externalRef }) {
  return {
    kind: 'directive.materializedCampaignHead.v2',
    schemaVersion: 1,
    campaignId: 'campaign-ashes-scale',
    saveId: 'save-ashes-scale',
    branchId: 'main',
    campaign: {
      title: 'Ashes of Peace',
      currentStardate: 78144.6,
      currentLocation: 'U.S.S. Breckenridge'
    },
    player: {
      name: 'Sam Vickers',
      role: 'Executive Officer'
    },
    ship: {
      id: 'uss-breckenridge',
      name: 'U.S.S. Breckenridge',
      readiness: 'strained'
    },
    mission: {
      activeMissionId: 'ashes-of-peace',
      activePhaseId: 'long-range-pressure',
      openOrders: Array.from({ length: 18 }, (_, index) => ({
        id: `order-${index + 1}`,
        status: index % 3 === 0 ? 'waiting' : 'open',
        summary: repeated('bounded order summary', index, 120)
      }))
    },
    commandLog: {
      retainedEntryCount: 40,
      summaryCursor: MESSAGE_COUNT,
      entries: Array.from({ length: 40 }, (_, index) => ({
        id: `log-${index + 1}`,
        turnId: `turn-${MESSAGE_COUNT / 2 - 39 + index}`,
        summary: repeated('bounded command log', index, 160)
      }))
    },
    crew: Object.fromEntries(Array.from({ length: 14 }, (_, index) => [
      `crew-${index + 1}`,
      {
        readiness: index % 4 === 0 ? 'fatigued' : 'steady',
        relationshipSummary: repeated('crew relation', index, 140)
      }
    ])),
    threadLedger: {
      activeThreadCount: 64,
      visibleThreads: Array.from({ length: 32 }, (_, index) => ({
        id: `thread-${index + 1}`,
        status: index % 5 === 0 ? 'pressure' : 'open',
        summary: repeated('thread summary', index, 160)
      }))
    },
    prompt: {
      directiveOwnedRevision: 5000,
      externalPromptEnvironmentRef: externalRef
    },
    counts: {
      hostRows: MESSAGE_COUNT,
      eventSegments: null,
      diagnosticsSegments: null
    }
  };
}

function createHostMap(messages, externalRef) {
  return {
    kind: 'directive.hostMessageMap.v2',
    schemaVersion: 1,
    campaignId: 'campaign-ashes-scale',
    saveId: 'save-ashes-scale',
    chatId: 'ashes-scale-chat',
    excludesRawChatText: true,
    rows: messages.map((message, index) => ({
      hostMessageId: message.hostMessageId,
      role: message.role,
      turnId: message.turnId,
      outcomeId: message.outcomeId,
      textHash: makeHash('message-text', message.text),
      selectedVariantHash: message.role === 'assistant' ? makeHash('selected-swipe', `${message.hostMessageId}:0`) : null,
      visibility: {
        sourceRowExists: true,
        hiddenByHost: false,
        hiddenByExternal: index % 113 === 0,
        visibilityMutationOnly: index % 113 === 0,
        sourceMutation: false
      },
      externalPromptEnvironmentRef: index % 250 === 0 ? externalRef : null
    }))
  };
}

function createTurnEvents(messages) {
  return messages.map((message, index) => ({
    id: `event-${String(index + 1).padStart(5, '0')}`,
    type: message.role === 'player' ? 'playerIngressObserved' : 'visibleResponseRecorded',
    transactionId: `txn-${String(Math.floor(index / 2) + 1).padStart(5, '0')}`,
    turnId: message.turnId,
    outcomeId: message.outcomeId,
    source: {
      chatId: 'ashes-scale-chat',
      hostMessageId: message.hostMessageId,
      textHash: makeHash('message-text', message.text)
    },
    revision: index + 1,
    compactSummary: repeated('compact event summary', index, 720)
  }));
}

function createDiagnostics(messages, externalEnvironment, externalRef) {
  const modelCallDiagnostics = Array.from({ length: 120 }, (_, index) => ({
    id: `diag-model-${index + 1}`,
    type: 'modelCallSummary',
    transactionId: `txn-${String(index * 20 + 1).padStart(5, '0')}`,
    providerLane: index % 2 === 0 ? 'utility' : 'reasoning',
    status: 'ok',
    latencyMs: 1200 + index,
    promptHash: makeHash('prompt', index),
    responseHash: makeHash('response', index)
  }));
  const externalDiagnostics = Array.from({ length: 40 }, (_, index) => ({
    id: `diag-external-${index + 1}`,
    type: 'externalPromptEnvironmentObserved',
    transactionId: `txn-${String(index * 50 + 1).padStart(5, '0')}`,
    environmentRef: externalRef,
    promptKeys: externalRef.knownExternalPromptKeys,
    ghostedRowsObserved: Math.floor(messages.length * 0.64),
    settingsHash: externalEnvironment.hash
  }));
  return [
    {
      id: 'diag-external-environment-snapshot',
      type: 'externalPromptEnvironmentSnapshot',
      environment: externalEnvironment
    },
    ...modelCallDiagnostics,
    ...externalDiagnostics
  ];
}

function finalizeSegment(kind, index, entries) {
  const hash = makeHash(`${kind}-segment`, { index, entries });
  return {
    kind,
    schemaVersion: 1,
    index,
    entryCount: entries.length,
    hash,
    entries
  };
}

function rollSegments(kind, entries, maxBytes) {
  const segments = [];
  let currentEntries = [];
  let currentBytes = stableJsonByteLength(finalizeSegment(kind, 0, []));
  for (const entry of entries) {
    const entryBytes = stableJsonByteLength(entry) + 2;
    if (currentEntries.length > 0 && currentBytes + entryBytes > maxBytes - SEGMENT_HEADROOM_BYTES) {
      segments.push(finalizeSegment(kind, segments.length, currentEntries));
      currentEntries = [];
      currentBytes = stableJsonByteLength(finalizeSegment(kind, segments.length, []));
    }
    currentEntries.push(entry);
    currentBytes += entryBytes;
  }
  if (currentEntries.length > 0) {
    segments.push(finalizeSegment(kind, segments.length, currentEntries));
  }
  return segments;
}

function createPromptCache({ materializedHead }) {
  return {
    kind: 'directive.promptCache.v2',
    schemaVersion: 1,
    campaignId: materializedHead.campaignId,
    saveId: materializedHead.saveId,
    directiveOwnedRevision: materializedHead.prompt.directiveOwnedRevision,
    baseCacheKey: makeHash('base-cpm-cache', {
      campaignId: materializedHead.campaignId,
      mission: materializedHead.mission.activeMissionId,
      crewCount: Object.keys(materializedHead.crew).length
    }),
    externalPromptEnvironmentRef: materializedHead.prompt.externalPromptEnvironmentRef,
    blocks: Array.from({ length: 32 }, (_, index) => ({
      id: `cache-block-${index + 1}`,
      lane: ['identity', 'missionQuestThread', 'crewShipRelationship', 'continuity'][index % 4],
      promptKey: `directive.cache.${index + 1}`,
      sourceHash: makeHash('prompt-cache-source', index),
      textHash: makeHash('prompt-cache-text', repeated('prompt cache bounded text', index, 520)),
      byteLength: 520
    })),
    overlays: Array.from({ length: 8 }, (_, index) => ({
      id: `turn-overlay-${index + 1}`,
      sourceFrameHash: makeHash('turn-overlay-frame', index),
      textHash: makeHash('turn-overlay-text', repeated('turn local overlay', index, 320)),
      byteLength: 320
    }))
  };
}

function createLegacyLargeSave(messages) {
  const turnCount = Math.floor(messages.length / 2);
  return {
    kind: 'directive.campaignSave',
    schemaVersion: 1,
    id: 'save-ashes-scale-legacy',
    payload: {
      campaignState: {
        campaign: {
          id: 'campaign-ashes-scale',
          title: 'Ashes of Peace',
          currentStardate: 78144.6
        },
        runtimeTracking: {
          ingressLedger: messages.filter((message) => message.role === 'player').map((message, index) => ({
            id: `ingress-${index + 1}`,
            hostMessageId: message.hostMessageId,
            textHash: makeHash('message-text', message.text),
            status: 'complete'
          })),
          responseLedger: messages.filter((message) => message.role === 'assistant').map((message, index) => ({
            id: `response-${index + 1}`,
            hostMessageId: message.hostMessageId,
            outcomeId: message.outcomeId,
            status: 'posted'
          })),
          history: Array.from({ length: turnCount }, (_, index) => ({
            id: `history-${index + 1}`,
            snapshot: {
              mission: {
                activePhaseId: `phase-${index % 20}`,
                stateSummary: repeated('legacy mission snapshot', index, 460)
              },
              commandLog: {
                entries: Array.from({ length: 3 }, (__, offset) => ({
                  id: `legacy-log-${index}-${offset}`,
                  summary: repeated('legacy retained command log', index + offset, 320)
                }))
              },
              prompt: {
                contextSummary: repeated('legacy prompt context', index, 520)
              }
            }
          }))
        },
        turnLedger: {
          lastCommittedOutcomeId: `outcome-${String(turnCount).padStart(5, '0')}`,
          entries: Array.from({ length: turnCount }, (_, index) => ({
            turnId: `turn-${String(index + 1).padStart(5, '0')}`,
            outcomeId: `outcome-${String(index + 1).padStart(5, '0')}`,
            snapshotBefore: {
              ship: {
                readiness: index % 7 === 0 ? 'strained' : 'steady',
                retainedStatus: repeated('legacy ship snapshot', index, 360)
              },
              runtimeTracking: {
                nestedHistory: repeated('legacy nested runtime tracking', index, 520)
              }
            },
            retainedPacket: {
              narratorPacket: repeated('legacy narrator packet', index, 720),
              directorPacket: repeated('legacy director packet', index, 720),
              stateDelta: {
                openWorld: {
                  rootsSet: {
                    runtimeTracking: repeated('legacy broad rootsSet runtimeTracking', index, 640)
                  }
                }
              }
            }
          }))
        },
        modelCallJournal: Array.from({ length: 800 }, (_, index) => ({
          id: `model-call-${index + 1}`,
          promptSnapshot: repeated('legacy model call prompt snapshot', index, 700),
          responseSnapshot: repeated('legacy model call response snapshot', index, 700)
        })),
        sidecarJournal: Array.from({ length: 600 }, (_, index) => ({
          id: `sidecar-${index + 1}`,
          worker: ['continuity', 'relationship', 'crew', 'ship', 'commandBearing'][index % 5],
          sourceSnapshot: repeated('legacy sidecar source snapshot', index, 600),
          resultSnapshot: repeated('legacy sidecar result snapshot', index, 600)
        }))
      }
    }
  };
}

function evaluateThresholds(report) {
  const violations = [];
  if (report.sizes.materializedHeadBytes > MATERIALIZED_HEAD_MAX_BYTES) violations.push('materialized-head-too-large');
  if (report.sizes.saveManifestBytes > SAVE_MANIFEST_MAX_BYTES) violations.push('save-manifest-too-large');
  if (report.sizes.promptCacheBytes > ACTIVE_PROMPT_CACHE_MAX_BYTES) violations.push('prompt-cache-too-large');
  if (report.sizes.hostMapBytes > HOST_MAP_MAX_BYTES) violations.push('host-map-too-large');
  if (report.sizes.eventSegmentMaxBytes > EVENT_SEGMENT_MAX_BYTES) violations.push('event-segment-too-large');
  if (report.sizes.diagnosticsSegmentMaxBytes > DIAGNOSTICS_SEGMENT_MAX_BYTES) violations.push('diagnostics-segment-too-large');
  if (report.writeCounters.fullSaveRewriteCount !== 0) violations.push('hot-path-full-save-rewrite');
  if (report.writeCounters.writesBeforeGenerationStart > 1) violations.push('too-many-writes-before-generation-start');
  if (report.turnWriteBudget?.writesPerSettledTurn > 4) violations.push('too-many-writes-per-settled-turn');
  if (report.latency.architectureWithin60s !== true) violations.push('generation-start-over-budget');
  return violations;
}

const messages = createSyntheticMessages(MESSAGE_COUNT);
const externalEnvironment = createExternalEnvironment();
const externalRef = createExternalPromptEnvironmentRef(externalEnvironment);
const materializedHead = createMaterializedHead({ externalRef });
const hostMap = createHostMap(messages, externalRef);
const eventSegments = rollSegments('directive.eventSegment.v2', createTurnEvents(messages), EVENT_SEGMENT_MAX_BYTES);
const diagnosticsSegments = rollSegments(
  'directive.diagnosticsSegment.v2',
  createDiagnostics(messages, externalEnvironment, externalRef),
  DIAGNOSTICS_SEGMENT_MAX_BYTES
);
materializedHead.counts.eventSegments = eventSegments.length;
materializedHead.counts.diagnosticsSegments = diagnosticsSegments.length;
const promptCache = createPromptCache({ materializedHead });

const v2Counters = createStorageWriteCounters();
const fakeStorage = createFakeJsonStorage();
const storageAdapter = createLogicalStorageAdapter({
  storage: fakeStorage,
  hostId: 'fake'
});

const turnEntries = messages
  .filter((message) => message.role === 'assistant')
  .map((message, index) => ({
    id: `turn-entry-${index + 1}`,
    turnId: message.turnId,
    outcomeId: message.outcomeId,
    sourceHash: makeHash('turn-source', message.hostMessageId)
  }));
const substrateCommit = await commitV2SaveLayout(storageAdapter, {
  campaignId: 'campaign-ashes-scale',
  saveId: 'save-ashes-scale',
  branchId: 'main',
  now: '2026-06-28T12:00:30.000Z',
  head: materializedHead,
  hostMap,
  promptCache,
  eventSegments: eventSegments.map((segment) => segment.entries),
  turnSegments: [turnEntries],
  diagnosticsSegments: diagnosticsSegments.map((segment) => segment.entries),
  checkpoints: [{
    checkpointId: 'scale-import',
    type: 'scaleHarnessCheckpoint',
    hostRows: MESSAGE_COUNT,
    sourceHash: makeHash('scale-checkpoint', MESSAGE_COUNT)
  }]
});
const substrateHead = await readV2ArtifactRef(storageAdapter, substrateCommit.refs.head);
const substrateHostMap = await readV2ArtifactRef(storageAdapter, substrateCommit.refs.hostMap);
const substratePromptCache = await readV2ArtifactRef(storageAdapter, substrateCommit.refs.promptCache);
const saveManifest = await loadV2SaveManifest(storageAdapter, {
  campaignId: 'campaign-ashes-scale',
  saveId: 'save-ashes-scale'
});
for (const [index, ref] of substrateCommit.refs.eventSegments.entries()) {
  recordStorageWrite(v2Counters, {
    logicalKey: ref.logicalKey,
    type: 'segment',
    bytes: ref.byteLength,
    beforeGenerationStart: index === substrateCommit.refs.eventSegments.length - 1
  });
}
recordStorageWrite(v2Counters, { logicalKey: substrateCommit.refs.head.logicalKey, type: 'head', bytes: substrateCommit.refs.head.byteLength });
recordStorageWrite(v2Counters, { logicalKey: substrateCommit.refs.hostMap.logicalKey, type: 'segment', bytes: substrateCommit.refs.hostMap.byteLength });
recordStorageWrite(v2Counters, { logicalKey: substrateCommit.refs.promptCache.logicalKey, type: 'segment', bytes: substrateCommit.refs.promptCache.byteLength });
for (const ref of substrateCommit.refs.diagnosticsSegments) {
  recordStorageWrite(v2Counters, { logicalKey: ref.logicalKey, type: 'diagnostics', bytes: ref.byteLength });
}
recordStorageWrite(v2Counters, { logicalKey: substrateCommit.saveManifestRef.logicalKey, type: 'manifest', bytes: substrateCommit.saveManifestRef.byteLength });

const latency = createTurnLatencyMetrics({
  playerSubmittedAt: 1000,
  turnObservedAt: 1300,
  routeDecidedAt: 1800,
  hostGenerationReleasedAt: 2400,
  visibleResponsePostedAt: 64000
});

const v2Report = {
  messageCount: messages.length,
  sizes: {
    materializedHeadBytes: stableJsonByteLength(substrateHead),
    substrateHeadBytes: stableJsonByteLength(substrateHead),
    saveManifestBytes: stableJsonByteLength(saveManifest),
    promptCacheBytes: stableJsonByteLength(substratePromptCache),
    hostMapBytes: stableJsonByteLength(substrateHostMap),
    eventSegmentMaxBytes: Math.max(...substrateCommit.refs.eventSegments.map((ref) => ref.byteLength)),
    diagnosticsSegmentMaxBytes: Math.max(...substrateCommit.refs.diagnosticsSegments.map((ref) => ref.byteLength)),
    eventSegmentCount: substrateCommit.refs.eventSegments.length,
    diagnosticsSegmentCount: substrateCommit.refs.diagnosticsSegments.length
  },
  writeCounters: v2Counters,
  turnWriteBudget: {
    targetWritesPerSettledTurn: 2,
    maxWritesPerSettledTurn: 4,
    writesPerSettledTurn: 3
  },
  latency
};

assert.equal(v2Report.messageCount, MESSAGE_COUNT);
assert.equal(hostMap.excludesRawChatText, true);
assert.equal(hostMap.rows.some((row) => 'text' in row || 'mes' in row || 'rawText' in row), false);
assert.equal(eventSegments.length > 1, true, 'scale fixture should force event segment rollover');
assert.equal(substrateCommit.refs.eventSegments.length > 1, true, 'substrate should preserve event segment rollover');
assert.deepEqual(evaluateThresholds(v2Report), []);
assert.equal(v2Report.sizes.promptCacheBytes <= ACTIVE_PROMPT_CACHE_MAX_BYTES, true);
assert.equal(
  Object.keys(fakeStorage.snapshot()).length,
  substrateCommit.refs.eventSegments.length
    + substrateCommit.refs.turnSegments.length
    + substrateCommit.refs.diagnosticsSegments.length
    + substrateCommit.refs.checkpoints.length
    + 5,
  'scale harness should round-trip candidate artifacts through logical storage'
);

const serializedV2 = JSON.stringify(fakeStorage.snapshot());
assert.equal(serializedV2.includes('SECRET-QDRANT-KEY'), false);
assert.equal(serializedV2.includes('Raw vector payload'), false);
assert.equal(serializedV2.includes('Raw rolling summary'), false);
assert.equal(serializedV2.includes('Raw lorebook content'), false);
assert.equal(serializedV2.includes(messages[0].text), false, 'v2 layout must not retain raw transcript text');
assert.equal(serializedV2.includes('"rootsSet"'), false, 'v2 layout must not retain broad open-world rootsSet replacements');

const legacyLargeSave = createLegacyLargeSave(messages);
const legacyCounters = createStorageWriteCounters();
recordStorageWrite(legacyCounters, {
  logicalKey: 'saves/save-ashes-scale-legacy.v1.json',
  payload: legacyLargeSave,
  bytes: stableJsonByteLength(legacyLargeSave),
  beforeGenerationStart: true
});
const legacyReport = {
  sizes: {
    materializedHeadBytes: stableJsonByteLength(legacyLargeSave),
    saveManifestBytes: 0,
    hostMapBytes: 0,
    eventSegmentMaxBytes: 0,
    diagnosticsSegmentMaxBytes: 0
  },
  writeCounters: legacyCounters,
  latency
};
const legacyViolations = evaluateThresholds(legacyReport);
assert.equal(legacyLargeSave.payload.campaignState.runtimeTracking.history.length, MESSAGE_COUNT / 2);
assert.equal(legacyLargeSave.payload.campaignState.turnLedger.entries.length, MESSAGE_COUNT / 2);
assert.equal(JSON.stringify(legacyLargeSave).includes('"rootsSet"'), true, 'legacy fixture should keep proving broad rootsSet pressure');
assert.equal(legacyViolations.includes('hot-path-full-save-rewrite'), true);
assert.equal(legacyCounters.fullSaveRewriteCount, 1);
assert.equal(v2Report.sizes.materializedHeadBytes < legacyReport.sizes.materializedHeadBytes, true);

console.log('Storage scale 5000 tests passed:', JSON.stringify({
  messages: v2Report.messageCount,
  materializedHeadBytes: v2Report.sizes.materializedHeadBytes,
  hostMapBytes: v2Report.sizes.hostMapBytes,
  saveManifestBytes: v2Report.sizes.saveManifestBytes,
  promptCacheBytes: v2Report.sizes.promptCacheBytes,
  eventSegments: v2Report.sizes.eventSegmentCount,
  diagnosticsSegments: v2Report.sizes.diagnosticsSegmentCount,
  legacyFullSaveBytes: legacyReport.sizes.materializedHeadBytes
}));
