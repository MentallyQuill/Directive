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
import {
  createLensPromptBudgetTrace
} from '../../src/runtime/lens-prompt-budget-trace.mjs';
import {
  createRecallQuery,
  normalizeRecallIndexEntry,
  queryRecallIndex
} from '../../src/retrieval/recall-index.mjs';
import { createLogicalStorageAdapter } from '../../src/storage/logical-storage-adapter.mjs';
import {
  initializeDirectiveStorage,
  loadCampaignSaveFromStorage,
  recoverActiveCampaignSave,
  storeCampaignV2SaveManifestIndexEntry
} from '../../src/storage/directive-storage-repository.mjs';
import {
  commitV2EventTurnSegments,
  commitV2SaveLayout,
  loadV2CampaignManifest,
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
const RECALL_INDEX_SEGMENT_MAX_BYTES = 5 * 1024 * 1024;
const SCENE_SEAL_SEGMENT_MAX_BYTES = 5 * 1024 * 1024;
const PROMPT_BUDGET_TRACE_SEGMENT_MAX_BYTES = 5 * 1024 * 1024;
const AUXILIARY_SCALE_SEGMENT_MAX_BYTES = 5 * 1024 * 1024;
const SEGMENT_HEADROOM_BYTES = 8 * 1024;

const scaleTimings = [];
let lastScaleTiming = Date.now();

function markScaleTiming(label) {
  const now = Date.now();
  scaleTimings.push({ label, ms: now - lastScaleTiming });
  lastScaleTiming = now;
}

function scaleTimingMs(label) {
  return scaleTimings.find((entry) => entry.label === label)?.ms ?? 0;
}

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

function createRecallEntries(messages, externalRef) {
  const playerMessages = messages.filter((message) => message.role === 'player');
  const deterministicEntries = playerMessages.map((message, index) => normalizeRecallIndexEntry({
    id: `recall-${String(index + 1).padStart(5, '0')}`,
    campaignId: 'campaign-ashes-scale',
    saveId: 'save-ashes-scale',
    branchId: 'main',
    sourceFrameRef: {
      id: `frame-${message.hostMessageId}`,
      hostMessageId: message.hostMessageId,
      textHash: makeHash('message-text', message.text),
      externalPromptEnvironmentRef: index % 125 === 0 ? externalRef : null,
      rawTranscript: 'RAW_SCALE_RECALL_TRANSCRIPT'
    },
    sceneSealRef: index % 20 === 0
      ? {
          id: `seal-${String(index / 20).padStart(4, '0')}`,
          hash: makeHash('scene-seal', index),
          rawSummary: 'RAW_SCALE_SEAL_SUMMARY'
        }
      : null,
    phaseId: `phase-${index % 24}`,
    sceneId: `scene-${index % 120}`,
    locationId: ['bridge', 'ready-room', 'shuttlebay-two', 'sickbay'][index % 4],
    actorIds: ['sam-vickers', index % 3 === 0 ? 'bronn' : 'tala'],
    subjectIds: [index % 5 === 0 ? 'command-handoff' : 'mission-pressure'],
    threadIds: [`thread-${index % 64}`],
    missionIds: ['ashes-of-peace'],
    tags: ['scale', index % 7 === 0 ? 'callback' : 'routine'],
    keywords: ['breckenridge', index % 11 === 0 ? 'warning' : 'pressure'],
    authority: index % 37 === 0 ? 'package' : 'committed',
    textHash: makeHash('recall-text', message.text),
    preview: repeated('bounded recall preview', index, 140),
    metadataHash: makeHash('recall-metadata', index),
    rawProviderOutput: 'RAW_SCALE_RECALL_PROVIDER'
  }));
  const semanticCandidates = Array.from({ length: 250 }, (_, index) => normalizeRecallIndexEntry({
    id: `semantic-candidate-${String(index + 1).padStart(4, '0')}`,
    campaignId: 'campaign-ashes-scale',
    saveId: 'save-ashes-scale',
    branchId: 'main',
    authority: 'diagnosticCandidate',
    actorIds: ['sam-vickers'],
    subjectIds: ['mission-pressure'],
    threadIds: [`thread-${index % 64}`],
    missionIds: ['ashes-of-peace'],
    keywords: ['pressure', index % 2 === 0 ? 'warning' : 'supply'],
    embeddingRef: {
      id: `embedding-${index + 1}`,
      hash: makeHash('embedding-ref', index),
      vectorPayload: 'RAW_SCALE_VECTOR_PAYLOAD',
      apiKey: 'SECRET-SCALE-QDRANT'
    },
    textHash: makeHash('semantic-hit', index)
  }));
  return [...deterministicEntries, ...semanticCandidates];
}

function createRecallScaleResult(recallEntries) {
  const query = createRecallQuery({
    campaignId: 'campaign-ashes-scale',
    saveId: 'save-ashes-scale',
    branchId: 'main',
    sourceFrameId: 'frame-msg-05000',
    actorIds: ['sam-vickers', 'bronn'],
    subjectIds: ['mission-pressure'],
    locationId: 'bridge',
    missionId: 'ashes-of-peace',
    threadIds: ['thread-1', 'thread-7'],
    phaseId: 'phase-3',
    tags: ['scale', 'callback'],
    keywords: ['pressure', 'warning'],
    includeSemanticCandidates: true,
    limit: 12,
    invalidatedSourceFrameIds: ['frame-msg-00031']
  });
  return queryRecallIndex({ entries: recallEntries, query });
}

function createScenePhaseSeals(messages, recallEntries) {
  const playerMessages = messages.filter((message) => message.role === 'player');
  return Array.from({ length: 240 }, (_, index) => {
    const source = playerMessages[index * 10] || playerMessages[playerMessages.length - 1];
    return {
      kind: 'directive.scenePhaseSeal.v1',
      schemaVersion: 1,
      id: `scene-seal-${String(index + 1).padStart(4, '0')}`,
      campaignId: 'campaign-ashes-scale',
      saveId: 'save-ashes-scale',
      phaseId: `phase-${index % 24}`,
      sceneId: `scene-${index % 120}`,
      sourceFrameRefs: [{
        id: `frame-${source.hostMessageId}`,
        hostMessageId: source.hostMessageId,
        textHash: makeHash('message-text', source.text)
      }],
      recallEntryRefs: recallEntries.slice(index * 2, index * 2 + 3).map((entry) => ({
        id: entry.id,
        textHash: entry.textHash,
        authority: entry.authority
      })),
      status: index % 19 === 0 ? 'superseded' : 'active',
      sealHash: makeHash('scene-phase-seal', index),
      summaryHash: makeHash('scene-phase-summary', index),
      promptDirtyDomains: ['continuity', 'missionQuestThread'],
      rawTranscript: undefined
    };
  });
}

function createWitnessFacts(messages) {
  const playerMessages = messages.filter((message) => message.role === 'player');
  return Array.from({ length: 640 }, (_, index) => {
    const source = playerMessages[index % playerMessages.length];
    return {
      kind: 'directive.witnessScopedFact.v1',
      schemaVersion: 1,
      id: `witness-fact-${String(index + 1).padStart(4, '0')}`,
      campaignId: 'campaign-ashes-scale',
      saveId: 'save-ashes-scale',
      sourceFrameRef: {
        id: `frame-${source.hostMessageId}`,
        hostMessageId: source.hostMessageId,
        textHash: makeHash('message-text', source.text)
      },
      factHash: makeHash('witness-fact', index),
      knownBy: ['sam-vickers', index % 2 === 0 ? 'bronn' : 'tala'],
      witnessedBy: index % 3 === 0 ? ['bridge-crew'] : ['senior-staff'],
      confidence: index % 11 === 0 ? 'contested' : 'accepted',
      directiveAuthority: true
    };
  });
}

function createCorrectionCases(messages) {
  const assistantMessages = messages.filter((message) => message.role === 'assistant');
  return Array.from({ length: 80 }, (_, index) => {
    const source = assistantMessages[(index * 13) % assistantMessages.length];
    return {
      kind: 'directive.correctionCase.v1',
      schemaVersion: 1,
      id: `correction-case-${String(index + 1).padStart(4, '0')}`,
      campaignId: 'campaign-ashes-scale',
      saveId: 'save-ashes-scale',
      status: index % 9 === 0 ? 'accepted' : 'proposed',
      sourceFrameRef: {
        id: `frame-${source.hostMessageId}`,
        hostMessageId: source.hostMessageId,
        selectedVariantHash: makeHash('selected-swipe', `${source.hostMessageId}:0`)
      },
      evidenceRefs: [{
        id: `recall-${String(index + 1).padStart(5, '0')}`,
        authority: 'committed',
        hash: makeHash('correction-evidence', index)
      }],
      candidateSwipeRef: {
        id: `candidate-swipe-${index + 1}`,
        textHash: makeHash('candidate-swipe-text', index),
        providerOutputHash: makeHash('candidate-swipe-provider', index)
      },
      allowedActions: ['acceptAsSwipe', 'reject']
    };
  });
}

function createPackageRetrievalMetadata() {
  return Array.from({ length: 160 }, (_, index) => ({
    kind: 'directive.packageRetrievalMetadata.v1',
    schemaVersion: 1,
    id: `package-retrieval-${String(index + 1).padStart(4, '0')}`,
    packageId: 'ashes-of-peace',
    sourceKind: ['campaign-package', 'crew-dataset', 'ship-dataset'][index % 3],
    sourceId: `package-source-${index + 1}`,
    authority: 'package',
    facetHash: makeHash('package-retrieval-facet', index),
    keywords: ['breckenridge', index % 2 === 0 ? 'crew' : 'mission'],
    subjectIds: [index % 2 === 0 ? 'ship-layout' : 'mission-pressure']
  }));
}

function createPromptBudgetTraces({ messages, recallResult, sceneSeals, externalRef }) {
  const playerMessages = messages.filter((message) => message.role === 'player');
  return Array.from({ length: 500 }, (_, index) => {
    const source = playerMessages[index * 5] || playerMessages[playerMessages.length - 1];
    const recallRefs = recallResult.includedRefs.slice(0, 8).map((ref, offset) => ({
      id: `${ref.id}:trace-${index}-${offset}`,
      kind: 'directive.recallResultRef.v1',
      authority: ref.authority,
      hash: ref.textHash || ref.metadataHash || makeHash('recall-trace-ref', `${index}:${offset}`),
      estimatedTokens: offset < 2 ? 70 : 160,
      rawPromptBody: 'RAW_SCALE_BUDGET_RECALL_PROMPT'
    }));
    return createLensPromptBudgetTrace({
      packetId: `packet-scale-${String(index + 1).padStart(4, '0')}`,
      promptRevision: index + 1,
      cacheKey: makeHash('prompt-budget-cache', index),
      cacheInputs: {
        mechanicsRevision: index,
        promptDomainVector: {
          continuity: index % 5,
          missionQuestThread: index % 7
        },
        recallIndexRevision: recallResult.recallIndexRevision,
        sceneSealRevision: sceneSeals[index % sceneSeals.length].sealHash,
        packageRevision: makeHash('package-revision', 'ashes-of-peace'),
        externalPromptEnvironmentRef: externalRef
      },
      lanes: [
        {
          id: 'stableRules',
          budgetTokens: 900,
          reservedFloor: 700,
          authority: 'directive',
          refs: [{
            id: 'directive-rules',
            kind: 'preset',
            hash: makeHash('stable-rules', 1),
            estimatedTokens: 520
          }]
        },
        {
          id: 'activeScene',
          budgetTokens: 700,
          reservedFloor: 400,
          authority: 'core',
          refs: [{
            id: sceneSeals[index % sceneSeals.length].id,
            kind: 'sceneSeal',
            hash: sceneSeals[index % sceneSeals.length].sealHash,
            sourceFrameId: `frame-${source.hostMessageId}`,
            estimatedTokens: 420
          }]
        },
        {
          id: 'recentTranscript',
          budgetTokens: 640,
          authority: 'frame',
          refs: [{
            id: `recent-${source.hostMessageId}`,
            kind: 'frameRef',
            hash: makeHash('message-text', source.text),
            sourceFrameId: `frame-${source.hostMessageId}`,
            estimatedTokens: 280,
            rawTranscript: 'RAW_SCALE_RECENT_TRANSCRIPT'
          }]
        },
        {
          id: 'recall',
          budgetTokens: 420,
          authority: 'recallIndex',
          refs: recallRefs
        },
        {
          id: 'externalEnvironment',
          budgetTokens: 0,
          authority: 'diagnostic',
          refs: [{
            id: externalRef.hash,
            kind: 'directive.externalPromptEnvironmentRef.v1',
            hash: externalRef.hash,
            estimatedTokens: 900,
            rawPromptBody: 'RAW_SCALE_EXTERNAL_PROMPT',
            apiKey: 'SECRET-SCALE-EXTERNAL'
          }]
        }
      ]
    });
  });
}

function createAuxiliaryScaleArtifacts({ messages, externalRef }) {
  const recallEntries = createRecallEntries(messages, externalRef);
  const recallResult = createRecallScaleResult(recallEntries);
  const sceneSeals = createScenePhaseSeals(messages, recallEntries);
  const witnessFacts = createWitnessFacts(messages);
  const correctionCases = createCorrectionCases(messages);
  const packageRetrievalMetadata = createPackageRetrievalMetadata();
  const promptBudgetTraces = createPromptBudgetTraces({
    messages,
    recallResult,
    sceneSeals,
    externalRef
  });
  return {
    recallEntries,
    recallResult,
    sceneSeals,
    witnessFacts,
    correctionCases,
    packageRetrievalMetadata,
    promptBudgetTraces,
    segments: {
      recallIndex: rollSegments('directive.recallIndexSegment.v1', recallEntries, RECALL_INDEX_SEGMENT_MAX_BYTES),
      sceneSeals: rollSegments('directive.scenePhaseSealSegment.v1', sceneSeals, SCENE_SEAL_SEGMENT_MAX_BYTES),
      promptBudgetTraces: rollSegments('directive.lensPromptBudgetTraceSegment.v1', promptBudgetTraces, PROMPT_BUDGET_TRACE_SEGMENT_MAX_BYTES),
      witnessFacts: rollSegments('directive.witnessScopedFactSegment.v1', witnessFacts, AUXILIARY_SCALE_SEGMENT_MAX_BYTES),
      correctionCases: rollSegments('directive.correctionCaseSegment.v1', correctionCases, AUXILIARY_SCALE_SEGMENT_MAX_BYTES),
      packageRetrievalMetadata: rollSegments('directive.packageRetrievalMetadataSegment.v1', packageRetrievalMetadata, AUXILIARY_SCALE_SEGMENT_MAX_BYTES)
    }
  };
}

async function writeAuxiliaryScaleSegments(adapter, category, segments) {
  const refs = [];
  for (const [index, segment] of segments.entries()) {
    const segmentId = String(index).padStart(4, '0');
    const logicalKey = `campaigns/campaign-ashes-scale/saves/save-ashes-scale/${category}/${segmentId}.v1.json`;
    const record = {
      ...segment,
      campaignId: 'campaign-ashes-scale',
      saveId: 'save-ashes-scale',
      segmentId
    };
    const withSize = {
      ...record,
      byteLength: stableJsonByteLength(record)
    };
    await adapter.writeJson(logicalKey, withSize);
    refs.push({
      logicalKey,
      kind: withSize.kind,
      hash: withSize.hash,
      byteLength: stableJsonByteLength(withSize),
      entryCount: withSize.entryCount
    });
  }
  return refs;
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
  if (report.sizes.recallIndexSegmentMaxBytes > RECALL_INDEX_SEGMENT_MAX_BYTES) violations.push('recall-index-segment-too-large');
  if (report.sizes.sceneSealSegmentMaxBytes > SCENE_SEAL_SEGMENT_MAX_BYTES) violations.push('scene-seal-segment-too-large');
  if (report.sizes.promptBudgetTraceSegmentMaxBytes > PROMPT_BUDGET_TRACE_SEGMENT_MAX_BYTES) violations.push('prompt-budget-trace-segment-too-large');
  if (report.sizes.auxiliarySegmentMaxBytes > AUXILIARY_SCALE_SEGMENT_MAX_BYTES) violations.push('auxiliary-segment-too-large');
  if (report.writeCounters.fullSaveRewriteCount !== 0) violations.push('hot-path-full-save-rewrite');
  if (report.writeCounters.writesBeforeGenerationStart > 1) violations.push('too-many-writes-before-generation-start');
  if (report.turnWriteBudget?.writesPerSettledTurn > 4) violations.push('too-many-writes-per-settled-turn');
  if (report.turnWriteBudget?.sealedSegmentRewriteCount > 0) violations.push('sealed-segment-rewrite');
  if (report.turnWriteBudget?.openTailOverwriteCount > 0) violations.push('open-tail-overwrite');
  if (report.turnReadBudget?.sealedSegmentReadCount > 0) violations.push('sealed-segment-read');
  if (report.turnReadBudget?.sealedSegmentVerifyCount > 0) violations.push('sealed-segment-verify');
  if (report.latency.architectureWithin60s !== true) violations.push('generation-start-over-budget');
  return violations;
}

function completedWriteKeys(progressEvents = []) {
  return progressEvents
    .filter((event) => event.operation === 'writeJson' && event.phase === 'storageWriteComplete')
    .map((event) => event.logicalKey);
}

function segmentRefs(refGroups = []) {
  return refGroups.flatMap((refs) => Array.isArray(refs) ? refs : [refs]).filter(Boolean);
}

function byteMapForRefs(refs = []) {
  return new Map(refs.map((ref) => [ref.logicalKey, Number(ref.byteLength || 0)]));
}

function createLoggingJsonStorage(storage) {
  const readLog = [];
  const writeLog = [];
  const verifyLog = [];
  return {
    readLog,
    writeLog,
    verifyLog,
    async readJson(filePath) {
      readLog.push(filePath);
      return storage.readJson(filePath);
    },
    async writeJson(filePath, value) {
      writeLog.push(filePath);
      return storage.writeJson(filePath, value);
    },
    async verifyJsonFiles(paths = []) {
      verifyLog.push(...paths);
      return storage.verifyJsonFiles(paths);
    },
    async deleteJsonFile(filePath) {
      return storage.deleteJsonFile(filePath);
    },
    async listJsonFiles(prefix = '') {
      return storage.listJsonFiles(prefix);
    },
    snapshot() {
      return storage.snapshot();
    }
  };
}

function createHotTurnWriteBudget({
  hotTurnWriteKeys = [],
  sealedSegmentRefs = [],
  protectedOpenTailRefs = [],
  allSegmentRefs = []
} = {}) {
  const sealedKeys = new Set(sealedSegmentRefs.map((ref) => ref.logicalKey));
  const protectedOpenTailKeys = new Set(protectedOpenTailRefs.map((ref) => ref.logicalKey));
  const bytesByKey = byteMapForRefs(allSegmentRefs);
  const rewrittenSealedKeys = hotTurnWriteKeys.filter((key) => sealedKeys.has(key));
  const overwrittenOpenTailKeys = hotTurnWriteKeys.filter((key) => protectedOpenTailKeys.has(key));
  return {
    targetWritesPerSettledTurn: 2,
    maxWritesPerSettledTurn: 4,
    writesPerSettledTurn: hotTurnWriteKeys.length,
    sealedSegmentRewriteCount: rewrittenSealedKeys.length,
    sealedSegmentRewriteBytes: rewrittenSealedKeys.reduce((total, key) => total + (bytesByKey.get(key) || 0), 0),
    openTailOverwriteCount: overwrittenOpenTailKeys.length,
    overwrittenOpenTailKeys,
    rewrittenSealedKeys
  };
}

function createHotTurnReadBudget({
  hotTurnReadKeys = [],
  hotTurnVerifyKeys = [],
  sealedSegmentRefs = []
} = {}) {
  const sealedKeys = new Set(sealedSegmentRefs.map((ref) => ref.logicalKey));
  const readSealedKeys = hotTurnReadKeys.filter((key) => sealedKeys.has(key));
  const verifiedSealedKeys = hotTurnVerifyKeys.filter((key) => sealedKeys.has(key));
  return {
    sealedSegmentReadCount: readSealedKeys.length,
    sealedSegmentVerifyCount: verifiedSealedKeys.length,
    readSealedKeys,
    verifiedSealedKeys
  };
}

const messages = createSyntheticMessages(MESSAGE_COUNT);
markScaleTiming('messages');
const externalEnvironment = createExternalEnvironment();
const externalRef = createExternalPromptEnvironmentRef(externalEnvironment);
markScaleTiming('external-environment');
const auxiliaryScaleArtifacts = createAuxiliaryScaleArtifacts({ messages, externalRef });
markScaleTiming('auxiliary-artifacts');
const materializedHead = createMaterializedHead({ externalRef });
const hostMap = createHostMap(messages, externalRef);
markScaleTiming('head-host-map');
const eventSegments = rollSegments('directive.eventSegment.v2', createTurnEvents(messages), EVENT_SEGMENT_MAX_BYTES);
const diagnosticsSegments = rollSegments(
  'directive.diagnosticsSegment.v2',
  createDiagnostics(messages, externalEnvironment, externalRef),
  DIAGNOSTICS_SEGMENT_MAX_BYTES
);
markScaleTiming('event-diagnostics-segments');
materializedHead.counts.eventSegments = eventSegments.length;
materializedHead.counts.diagnosticsSegments = diagnosticsSegments.length;
const promptCache = createPromptCache({ materializedHead });
markScaleTiming('prompt-cache');

const v2Counters = createStorageWriteCounters();
const fakeStorage = createLoggingJsonStorage(createFakeJsonStorage());
const storageProgressEvents = [];
const storageAdapter = createLogicalStorageAdapter({
  storage: fakeStorage,
  hostId: 'fake',
  onProgress: (event) => storageProgressEvents.push(event)
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
markScaleTiming('commit-v2-save-layout');
const substrateHead = await readV2ArtifactRef(storageAdapter, substrateCommit.refs.head);
const substrateHostMap = await readV2ArtifactRef(storageAdapter, substrateCommit.refs.hostMap);
const substratePromptCache = await readV2ArtifactRef(storageAdapter, substrateCommit.refs.promptCache);
const saveManifest = await loadV2SaveManifest(storageAdapter, {
  campaignId: 'campaign-ashes-scale',
  saveId: 'save-ashes-scale'
});
await initializeDirectiveStorage(storageAdapter, { now: '2026-06-28T12:00:31.000Z' });
await storeCampaignV2SaveManifestIndexEntry(storageAdapter, {
  saveManifest,
  saveManifestRef: substrateCommit.saveManifestRef,
  name: 'Ashes Scale V2',
  slotType: 'manual',
  summary: '5000-message Ashes scale fixture',
  now: '2026-06-28T12:00:32.000Z'
});
const auxiliaryRefs = {
  recallIndex: await writeAuxiliaryScaleSegments(storageAdapter, 'recall-index', auxiliaryScaleArtifacts.segments.recallIndex),
  sceneSeals: await writeAuxiliaryScaleSegments(storageAdapter, 'scene-seals', auxiliaryScaleArtifacts.segments.sceneSeals),
  promptBudgetTraces: await writeAuxiliaryScaleSegments(storageAdapter, 'prompt-budget-traces', auxiliaryScaleArtifacts.segments.promptBudgetTraces),
  witnessFacts: await writeAuxiliaryScaleSegments(storageAdapter, 'witness-facts', auxiliaryScaleArtifacts.segments.witnessFacts),
  correctionCases: await writeAuxiliaryScaleSegments(storageAdapter, 'correction-cases', auxiliaryScaleArtifacts.segments.correctionCases),
  packageRetrievalMetadata: await writeAuxiliaryScaleSegments(storageAdapter, 'package-retrieval', auxiliaryScaleArtifacts.segments.packageRetrievalMetadata)
};
markScaleTiming('write-auxiliary-segments');
const allSegmentRefs = segmentRefs([
  substrateCommit.refs.eventSegments,
  substrateCommit.refs.turnSegments,
  substrateCommit.refs.diagnosticsSegments,
  substrateCommit.refs.checkpoints,
  auxiliaryRefs.recallIndex,
  auxiliaryRefs.sceneSeals,
  auxiliaryRefs.promptBudgetTraces,
  auxiliaryRefs.witnessFacts,
  auxiliaryRefs.correctionCases,
  auxiliaryRefs.packageRetrievalMetadata
]);
const sealedSegmentRefs = segmentRefs([
  substrateCommit.refs.eventSegments.slice(0, -1),
  substrateCommit.refs.turnSegments.slice(0, -1),
  auxiliaryRefs.recallIndex.slice(0, -1),
  auxiliaryRefs.sceneSeals.slice(0, -1),
  auxiliaryRefs.promptBudgetTraces.slice(0, -1)
]);
const bootstrapWriteKeys = completedWriteKeys(storageProgressEvents);
const expectedBootstrapStorageKeyCount = substrateCommit.refs.eventSegments.length
  + substrateCommit.refs.turnSegments.length
  + substrateCommit.refs.diagnosticsSegments.length
  + substrateCommit.refs.checkpoints.length
  + auxiliaryRefs.recallIndex.length
  + auxiliaryRefs.sceneSeals.length
  + auxiliaryRefs.promptBudgetTraces.length
  + auxiliaryRefs.witnessFacts.length
  + auxiliaryRefs.correctionCases.length
  + auxiliaryRefs.packageRetrievalMetadata.length
  + 10;
const bootstrapStorageKeyCount = Object.keys(fakeStorage.snapshot()).length;
const oldOpenEventTailRef = substrateCommit.refs.eventSegments.at(-1);
const oldOpenTurnTailRef = substrateCommit.refs.turnSegments.at(-1);
const oldOpenEventTail = await readV2ArtifactRef(storageAdapter, oldOpenEventTailRef);
const oldOpenTurnTail = await readV2ArtifactRef(storageAdapter, oldOpenTurnTailRef);
const hotReadStart = fakeStorage.readLog.length;
const hotWriteStart = fakeStorage.writeLog.length;
const hotVerifyStart = fakeStorage.verifyLog.length;
const hotTurnCommit = await commitV2EventTurnSegments(storageAdapter, {
  campaignId: 'campaign-ashes-scale',
  saveId: 'save-ashes-scale',
  now: '2026-06-28T12:00:45.000Z',
  eventSegments: [[
    {
      id: 'event-hot-05001',
      type: 'playerIngressObserved',
      transactionId: 'txn-02501',
      turnId: 'turn-02501',
      source: {
        chatId: 'ashes-scale-chat',
        hostMessageId: 'msg-05001',
        textHash: makeHash('message-text', 'hot turn player text')
      },
      revision: MESSAGE_COUNT + 1,
      compactSummary: repeated('hot turn player summary', 1, 720)
    },
    {
      id: 'event-hot-05002',
      type: 'visibleResponseRecorded',
      transactionId: 'txn-02501',
      turnId: 'turn-02501',
      outcomeId: 'outcome-02501',
      source: {
        chatId: 'ashes-scale-chat',
        hostMessageId: 'msg-05002',
        textHash: makeHash('message-text', 'hot turn assistant text')
      },
      revision: MESSAGE_COUNT + 2,
      compactSummary: repeated('hot turn assistant summary', 2, 720)
    }
  ]],
  turnSegments: [[{
    id: 'turn-entry-2501',
    turnId: 'turn-02501',
    outcomeId: 'outcome-02501',
    sourceHash: makeHash('turn-source', 'msg-05002')
  }]],
  metadata: {
    source: 'storage-scale-hot-turn',
    messageCount: MESSAGE_COUNT + 2
  }
});
markScaleTiming('hot-turn-append');
const hotTurnReadKeys = fakeStorage.readLog.slice(hotReadStart);
const compactHotTurnWriteKeys = fakeStorage.writeLog.slice(hotWriteStart);
const hotTurnVerifyKeys = fakeStorage.verifyLog.slice(hotVerifyStart);
const hotTurnManifest = await loadV2SaveManifest(storageAdapter, {
  campaignId: 'campaign-ashes-scale',
  saveId: 'save-ashes-scale'
});
const hotTurnCampaignManifest = await loadV2CampaignManifest(storageAdapter, 'campaign-ashes-scale');
const reloadReadStart = fakeStorage.readLog.length;
const reloadVerifyStart = fakeStorage.verifyLog.length;
const loadedAfterHotAppend = await loadCampaignSaveFromStorage(storageAdapter, 'save-ashes-scale', {
  markActive: false,
  now: '2026-06-28T12:00:46.000Z'
});
const recoveredAfterHotAppend = await recoverActiveCampaignSave(storageAdapter, {
  now: '2026-06-28T12:00:47.000Z'
});
markScaleTiming('hot-turn-reload');
const reloadReadKeys = fakeStorage.readLog.slice(reloadReadStart);
const reloadVerifyKeys = fakeStorage.verifyLog.slice(reloadVerifyStart);
const hotOpenEventTailRef = hotTurnCommit.refs.eventSegments.at(-1);
const hotOpenTurnTailRef = hotTurnCommit.refs.turnSegments.at(-1);
const hotTurnBudgetRefs = segmentRefs([
  allSegmentRefs,
  hotTurnCommit.refs.eventSegments,
  hotTurnCommit.refs.turnSegments
]);
const segmentizedRewriteHotTurnWriteKeys = [
  ...sealedSegmentRefs.slice(0, 1).map((ref) => ref.logicalKey),
  ...compactHotTurnWriteKeys
];
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
for (const ref of [
  ...auxiliaryRefs.recallIndex,
  ...auxiliaryRefs.sceneSeals,
  ...auxiliaryRefs.promptBudgetTraces,
  ...auxiliaryRefs.witnessFacts,
  ...auxiliaryRefs.correctionCases,
  ...auxiliaryRefs.packageRetrievalMetadata
]) {
  recordStorageWrite(v2Counters, { logicalKey: ref.logicalKey, type: 'segment', bytes: ref.byteLength });
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
    recallIndexSegmentMaxBytes: Math.max(...auxiliaryRefs.recallIndex.map((ref) => ref.byteLength)),
    sceneSealSegmentMaxBytes: Math.max(...auxiliaryRefs.sceneSeals.map((ref) => ref.byteLength)),
    promptBudgetTraceSegmentMaxBytes: Math.max(...auxiliaryRefs.promptBudgetTraces.map((ref) => ref.byteLength)),
    auxiliarySegmentMaxBytes: Math.max(
      ...auxiliaryRefs.witnessFacts.map((ref) => ref.byteLength),
      ...auxiliaryRefs.correctionCases.map((ref) => ref.byteLength),
      ...auxiliaryRefs.packageRetrievalMetadata.map((ref) => ref.byteLength)
    ),
    eventSegmentCount: substrateCommit.refs.eventSegments.length,
    diagnosticsSegmentCount: substrateCommit.refs.diagnosticsSegments.length,
    recallIndexSegmentCount: auxiliaryRefs.recallIndex.length,
    sceneSealSegmentCount: auxiliaryRefs.sceneSeals.length,
    promptBudgetTraceSegmentCount: auxiliaryRefs.promptBudgetTraces.length
  },
  writeCounters: v2Counters,
  turnWriteBudget: {
    ...createHotTurnWriteBudget({
      hotTurnWriteKeys: compactHotTurnWriteKeys,
      sealedSegmentRefs,
      protectedOpenTailRefs: [oldOpenEventTailRef, oldOpenTurnTailRef],
      allSegmentRefs: hotTurnBudgetRefs
    }),
    bootstrapWriteCount: bootstrapWriteKeys.length,
    bootstrapWroteSealedSegmentCount: bootstrapWriteKeys.filter((key) => (
      new Set(sealedSegmentRefs.map((ref) => ref.logicalKey)).has(key)
    )).length
  },
  turnReadBudget: createHotTurnReadBudget({
    hotTurnReadKeys,
    hotTurnVerifyKeys,
    sealedSegmentRefs
  }),
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
  bootstrapStorageKeyCount,
  expectedBootstrapStorageKeyCount,
  'scale harness should round-trip candidate artifacts through logical storage'
);
assert.equal(v2Report.turnWriteBudget.writesPerSettledTurn, compactHotTurnWriteKeys.length, 'hot-turn write budget should use actual storage writes');
assert.equal(v2Report.turnWriteBudget.sealedSegmentRewriteCount, 0, 'hot turn must not rewrite sealed history');
assert.equal(v2Report.turnWriteBudget.openTailOverwriteCount, 0, 'hot turn must not overwrite open-tail keys still named by the previous manifest');
assert.equal(v2Report.turnReadBudget.sealedSegmentReadCount, 0, 'hot turn must not read sealed history');
assert.equal(v2Report.turnReadBudget.sealedSegmentVerifyCount, 0, 'hot turn must not verify sealed history through storage');
assert.equal(scaleTimingMs('commit-v2-save-layout') < 60000, true, '5000-message v2 layout commit must stay below the submit-to-generation budget');
assert.equal(compactHotTurnWriteKeys.includes(hotOpenEventTailRef.logicalKey), true, 'hot turn should write the manifest-selected event tail/new event segment');
assert.equal(compactHotTurnWriteKeys.includes(hotOpenTurnTailRef.logicalKey), true, 'hot turn should write the manifest-selected turn tail/new turn segment');
assert.equal(compactHotTurnWriteKeys.includes(oldOpenEventTailRef.logicalKey), false, 'hot turn must not overwrite the prior event tail key');
assert.equal(compactHotTurnWriteKeys.includes(oldOpenTurnTailRef.logicalKey), false, 'hot turn must not overwrite the prior turn tail key');
assert.notEqual(hotOpenEventTailRef.logicalKey, oldOpenEventTailRef.logicalKey, 'changed event tail should publish through a versioned/new key');
assert.notEqual(hotOpenTurnTailRef.logicalKey, oldOpenTurnTailRef.logicalKey, 'changed turn tail should publish through a versioned/new key');
assert.deepEqual(await readV2ArtifactRef(storageAdapter, oldOpenEventTailRef), oldOpenEventTail, 'previous event tail should remain readable through the old manifest ref');
assert.deepEqual(await readV2ArtifactRef(storageAdapter, oldOpenTurnTailRef), oldOpenTurnTail, 'previous turn tail should remain readable through the old manifest ref');
assert.equal(compactHotTurnWriteKeys.at(-2), hotTurnCommit.saveManifestRef.logicalKey, 'save manifest should be the penultimate hot pointer write');
assert.equal(compactHotTurnWriteKeys.at(-1), hotTurnCommit.campaignManifestRef.logicalKey, 'campaign manifest should be the final hot pointer write');
assert.equal(hotTurnManifest.hash, hotTurnCommit.saveManifest.hash, 'loaded hot manifest should match the committed save manifest hash');
assert.equal(hotTurnCampaignManifest.saves['save-ashes-scale'].manifest.hash, hotTurnCommit.saveManifestRef.hash, 'campaign manifest should point at the hot save manifest hash');
const loadedHotCoreProjections = loadedAfterHotAppend.directiveRuntimeEvidence?.coreStoreReadProjections || {};
const recoveredHotCoreProjections = recoveredAfterHotAppend.campaignState?.directiveRuntimeEvidence?.coreStoreReadProjections || {};
assert.equal(
  loadedAfterHotAppend.runtimeTracking?.ingressLedger?.some((entry) => entry.hostMessageId === 'msg-05001'),
  false,
  'manifest-owned production reload must keep hot appended player ingress out of old runtimeTracking'
);
assert.equal(
  loadedAfterHotAppend.runtimeTracking?.responseLedger?.some((entry) => (
    entry.hostMessageId === 'msg-05002' && entry.outcomeId === 'outcome-02501'
  )),
  false,
  'manifest-owned production reload must keep hot appended assistant response out of old runtimeTracking'
);
assert.equal(
  loadedHotCoreProjections.ingressLedger?.some((entry) => entry.hostMessageId === 'msg-05001'),
  true,
  'manifest-owned production reload should see the hot appended player ingress through CORE projections'
);
assert.equal(
  loadedHotCoreProjections.responseLedger?.some((entry) => (
    entry.hostMessageId === 'msg-05002' && entry.outcomeId === 'outcome-02501'
  )),
  true,
  'manifest-owned production reload should see the hot appended assistant response through CORE projections'
);
assert.equal(
  loadedAfterHotAppend.turnLedger?.entries?.some((entry) => (
    entry.turnId === 'turn-02501' && entry.outcomeId === 'outcome-02501'
  )),
  true,
  'manifest-owned production reload should see the hot appended turn ledger entry'
);
assert.equal(recoveredAfterHotAppend.storageFormat, 'v2', 'active save recovery should recover the manifest-owned v2 save');
assert.equal(recoveredAfterHotAppend.activeSaveId, 'save-ashes-scale', 'active save recovery should select the registered v2 scale save');
assert.equal(
  recoveredAfterHotAppend.campaignState?.runtimeTracking?.ingressLedger?.some((entry) => entry.hostMessageId === 'msg-05001'),
  false,
  'active save recovery must keep the hot appended player ingress out of old runtimeTracking'
);
assert.equal(
  recoveredAfterHotAppend.campaignState?.runtimeTracking?.responseLedger?.some((entry) => (
    entry.hostMessageId === 'msg-05002' && entry.outcomeId === 'outcome-02501'
  )),
  false,
  'active save recovery must keep the hot appended assistant response out of old runtimeTracking'
);
assert.equal(
  recoveredHotCoreProjections.ingressLedger?.some((entry) => entry.hostMessageId === 'msg-05001'),
  true,
  'active save recovery should see the hot appended player ingress through CORE projections'
);
assert.equal(
  recoveredHotCoreProjections.responseLedger?.some((entry) => (
    entry.hostMessageId === 'msg-05002' && entry.outcomeId === 'outcome-02501'
  )),
  true,
  'active save recovery should see the hot appended assistant response through CORE projections'
);
assert.equal(
  reloadReadKeys.filter((key) => new Set(sealedSegmentRefs.map((ref) => ref.logicalKey)).has(key)).length,
  0,
  'production reload after hot append must not read sealed event/turn history'
);
assert.equal(
  reloadVerifyKeys.filter((key) => new Set(sealedSegmentRefs.map((ref) => ref.logicalKey)).has(key)).length,
  0,
  'production reload after hot append must not verify sealed event/turn history'
);
for (const [index, ref] of substrateCommit.refs.eventSegments.slice(0, -1).entries()) {
  assert.deepEqual(hotTurnManifest.eventSegments[index], ref, `hot turn must preserve sealed event segment ref ${index}`);
}
for (const [index, ref] of substrateCommit.refs.turnSegments.slice(0, -1).entries()) {
  assert.deepEqual(hotTurnManifest.turnSegments[index], ref, `hot turn must preserve sealed turn segment ref ${index}`);
}
await Promise.all(segmentRefs([
  hotTurnManifest.eventSegments,
  hotTurnManifest.turnSegments,
  hotTurnManifest.diagnosticsSegments,
  hotTurnManifest.checkpoints
]).map((ref) => readV2ArtifactRef(storageAdapter, ref)));
assert.equal(auxiliaryScaleArtifacts.recallEntries.length, MESSAGE_COUNT / 2 + 250);
assert.equal(auxiliaryScaleArtifacts.recallResult.includedRefs.length, 12);
assert.equal(auxiliaryScaleArtifacts.recallResult.includedRefs.every((ref) => ref.directiveAuthority === true), true);
assert.equal(
  auxiliaryScaleArtifacts.recallResult.omittedRefs.some((ref) => (
    String(ref.id || '').startsWith('semantic-candidate-') && ref.directiveAuthority === false
  )),
  true,
  'scale recall query should keep optional semantic candidates non-authoritative when deterministic refs fill the budget'
);
assert.equal(
  auxiliaryScaleArtifacts.recallResult.omittedRefs.some((ref) => ref.omissionReason === 'stale-source'),
  true,
  'scale recall query should prove invalidated source refs are omitted'
);
assert.equal(auxiliaryScaleArtifacts.sceneSeals.length, 240);
assert.equal(auxiliaryScaleArtifacts.witnessFacts.length, 640);
assert.equal(auxiliaryScaleArtifacts.correctionCases.length, 80);
assert.equal(auxiliaryScaleArtifacts.packageRetrievalMetadata.length, 160);
assert.equal(auxiliaryScaleArtifacts.promptBudgetTraces.length, 500);
assert.equal(
  auxiliaryScaleArtifacts.promptBudgetTraces.some((trace) => (
    trace.lanes.some((lane) => lane.id === 'recall' && lane.omittedRefs.some((ref) => ref.omissionReason === 'budget-exceeded'))
  )),
  true,
  'prompt budget scale traces should prove recall omissions are traceable'
);
assert.equal(
  auxiliaryScaleArtifacts.promptBudgetTraces.every((trace) => (
    trace.lanes.find((lane) => lane.id === 'externalEnvironment')?.diagnosticOnly === true
  )),
  true,
  'external prompt environment lane remains diagnostic-only at scale'
);
assert.equal(v2Report.turnWriteBudget.sealedSegmentRewriteCount, 0, 'Stage 2 target forbids rewriting sealed segments per turn');
assert.equal(v2Report.turnWriteBudget.bootstrapWroteSealedSegmentCount > 0, true, 'bulk bootstrap may write sealed historical segments before the hot-turn budget begins');
const segmentizedRewriteReport = {
  ...v2Report,
  turnWriteBudget: createHotTurnWriteBudget({
    hotTurnWriteKeys: segmentizedRewriteHotTurnWriteKeys,
    sealedSegmentRefs,
    protectedOpenTailRefs: [oldOpenEventTailRef, oldOpenTurnTailRef],
    allSegmentRefs: hotTurnBudgetRefs
  })
};
const segmentizedRewriteViolations = evaluateThresholds(segmentizedRewriteReport);
assert.equal(segmentizedRewriteViolations.includes('sealed-segment-rewrite'), true, 'scale gate must fail v2 designs that rewrite sealed event/turn segments per turn');
assert.equal(segmentizedRewriteViolations.includes('hot-path-full-save-rewrite'), false, 'compact v2 rewrite-all-history designs fail separately from legacy full-save rewrites');
const openTailOverwriteReport = {
  ...v2Report,
  turnWriteBudget: createHotTurnWriteBudget({
    hotTurnWriteKeys: [
      oldOpenEventTailRef.logicalKey,
      hotTurnCommit.saveManifestRef.logicalKey,
      hotTurnCommit.campaignManifestRef.logicalKey
    ],
    sealedSegmentRefs,
    protectedOpenTailRefs: [oldOpenEventTailRef, oldOpenTurnTailRef],
    allSegmentRefs: hotTurnBudgetRefs
  })
};
assert.equal(
  evaluateThresholds(openTailOverwriteReport).includes('open-tail-overwrite'),
  true,
  'scale gate must fail hot turns that overwrite the old open-tail key still named by the previous manifest'
);
const sealedReadReport = {
  ...v2Report,
  turnReadBudget: createHotTurnReadBudget({
    hotTurnReadKeys: sealedSegmentRefs.slice(0, 1).map((ref) => ref.logicalKey),
    hotTurnVerifyKeys: [],
    sealedSegmentRefs
  })
};
assert.equal(evaluateThresholds(sealedReadReport).includes('sealed-segment-read'), true, 'scale gate must fail hot turns that read sealed segment history');
const sealedVerifyReport = {
  ...v2Report,
  turnReadBudget: createHotTurnReadBudget({
    hotTurnReadKeys: [],
    hotTurnVerifyKeys: sealedSegmentRefs.slice(0, 1).map((ref) => ref.logicalKey),
    sealedSegmentRefs
  })
};
assert.equal(evaluateThresholds(sealedVerifyReport).includes('sealed-segment-verify'), true, 'scale gate must fail hot turns that verify sealed segment history through storage');

const serializedV2 = JSON.stringify(fakeStorage.snapshot());
markScaleTiming('serialize-v2-snapshot');
assert.equal(serializedV2.includes('SECRET-QDRANT-KEY'), false);
assert.equal(serializedV2.includes('Raw vector payload'), false);
assert.equal(serializedV2.includes('Raw rolling summary'), false);
assert.equal(serializedV2.includes('Raw lorebook content'), false);
assert.equal(serializedV2.includes('RAW_SCALE_RECALL_TRANSCRIPT'), false);
assert.equal(serializedV2.includes('RAW_SCALE_RECALL_PROVIDER'), false);
assert.equal(serializedV2.includes('RAW_SCALE_SEAL_SUMMARY'), false);
assert.equal(serializedV2.includes('RAW_SCALE_VECTOR_PAYLOAD'), false);
assert.equal(serializedV2.includes('SECRET-SCALE-QDRANT'), false);
assert.equal(serializedV2.includes('RAW_SCALE_BUDGET_RECALL_PROMPT'), false);
assert.equal(serializedV2.includes('RAW_SCALE_RECENT_TRANSCRIPT'), false);
assert.equal(serializedV2.includes('RAW_SCALE_EXTERNAL_PROMPT'), false);
assert.equal(serializedV2.includes('SECRET-SCALE-EXTERNAL'), false);
assert.equal(serializedV2.includes(messages[0].text), false, 'v2 layout must not retain raw transcript text');
assert.equal(serializedV2.includes('"rootsSet"'), false, 'v2 layout must not retain broad open-world rootsSet replacements');
markScaleTiming('redaction-canaries');

const legacyLargeSave = createLegacyLargeSave(messages);
markScaleTiming('legacy-fixture');
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
markScaleTiming('legacy-report');
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
  recallIndexSegments: v2Report.sizes.recallIndexSegmentCount,
  sceneSealSegments: v2Report.sizes.sceneSealSegmentCount,
  promptBudgetTraceSegments: v2Report.sizes.promptBudgetTraceSegmentCount,
  recallIndexSegmentMaxBytes: v2Report.sizes.recallIndexSegmentMaxBytes,
  sceneSealSegmentMaxBytes: v2Report.sizes.sceneSealSegmentMaxBytes,
  promptBudgetTraceSegmentMaxBytes: v2Report.sizes.promptBudgetTraceSegmentMaxBytes,
  hotTurnWrites: v2Report.turnWriteBudget.writesPerSettledTurn,
  hotTurnReads: hotTurnReadKeys.length,
  sealedSegmentReads: v2Report.turnReadBudget.sealedSegmentReadCount,
  sealedSegmentRewrites: v2Report.turnWriteBudget.sealedSegmentRewriteCount,
  openTailOverwrites: v2Report.turnWriteBudget.openTailOverwriteCount,
  legacyFullSaveBytes: legacyReport.sizes.materializedHeadBytes,
  timings: scaleTimings
}));
