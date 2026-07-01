import assert from 'node:assert/strict';

import {
  createExternalPromptEnvironmentRef,
  createStorageWriteCounters,
  createTurnSourceFrameContract,
  createTurnSourceFrameRef,
  hashStableJson,
  normalizeExternalPromptEnvironment,
  recordStorageWrite,
  stableJsonByteLength
} from '../../src/runtime/architecture-redesign-contracts.mjs';
import {
  createLensPromptBudgetTrace,
  promptBudgetLaneIds
} from '../../src/runtime/lens-prompt-budget-trace.mjs';
import {
  createRecallQuery,
  normalizeRecallIndexEntry,
  queryRecallIndex
} from '../../src/retrieval/recall-index.mjs';

const MESSAGE_COUNT = 5000;
const COMPARISON_MESSAGE_COUNT = 500;
const CORE_SEGMENT_MAX_BYTES = 512 * 1024;
const FRAME_SEGMENT_MAX_BYTES = 384 * 1024;
const RECALL_SEGMENT_MAX_BYTES = 384 * 1024;
const MATERIALIZED_HEAD_MAX_BYTES = 384 * 1024;
const V2_LAYOUT_TRACE_MAX_BYTES = 192 * 1024;
const LENS_TRACE_MAX_BYTES = 96 * 1024;
const EXTERNAL_REF_CATALOG_MAX_BYTES = 32 * 1024;
const COMPACT_TOTAL_MAX_BYTES = 8 * 1024 * 1024;
const SEGMENT_HEADROOM_BYTES = 8 * 1024;

const RAW_PAYLOAD_CANARIES = Object.freeze([
  'RAW_PLAYER_TRANSCRIPT_TOKEN',
  'RAW_ASSISTANT_TRANSCRIPT_TOKEN',
  'RAW_PROVIDER_PROMPT_TOKEN',
  'RAW_PROVIDER_RESPONSE_TOKEN',
  'RAW_SUMMARYCEPTION_TOKEN',
  'RAW_VECTOR_PAYLOAD_TOKEN',
  'RAW_LOREBOOK_PROMPT_TOKEN',
  'RAW_MEMORY_BOOK_TOKEN',
  'RAW_UNKNOWN_EXTERNAL_CONTEXT_TOKEN',
  'SECRET-QDRANT-KEY',
  'SECRET-PROVIDER-KEY'
]);

const FORBIDDEN_COMPACT_KEYS = new Set([
  'apiKey',
  'authorization',
  'embedding',
  'embeddings',
  'externalPayload',
  'fullTranscript',
  'messageText',
  'password',
  'promptBody',
  'promptContent',
  'promptText',
  'providerOutput',
  'providerPayload',
  'providerPrompt',
  'providerResponse',
  'qdrant_api_key',
  'rawContent',
  'rawPrompt',
  'rawPromptBody',
  'rawProviderOutput',
  'rawResponse',
  'rawSummary',
  'rawText',
  'responseSnapshot',
  'secret',
  'token',
  'transcriptText',
  'vectorPayload'
]);

function repeated(label, index, targetLength) {
  const seed = `${label}-${String(index).padStart(5, '0')} `;
  return seed.repeat(Math.ceil(targetLength / seed.length)).slice(0, targetLength);
}

function makeHash(label, value) {
  return hashStableJson({ label, value });
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createSyntheticMessages(count) {
  return Array.from({ length: count }, (_, index) => {
    const role = index % 2 === 0 ? 'player' : 'assistant';
    const turnNumber = Math.floor(index / 2) + 1;
    const canary = role === 'player' ? 'RAW_PLAYER_TRANSCRIPT_TOKEN' : 'RAW_ASSISTANT_TRANSCRIPT_TOKEN';
    return {
      hostMessageId: `msg-${String(index + 1).padStart(5, '0')}`,
      role,
      turnId: `turn-${String(turnNumber).padStart(5, '0')}`,
      outcomeId: role === 'assistant' ? `outcome-${String(turnNumber).padStart(5, '0')}` : null,
      selectedSwipeIndex: role === 'assistant' ? index % 3 : null,
      text: `${canary} ${repeated(role === 'player' ? 'Sam gives a direct order' : 'The bridge answers with consequences', index, 420)}`
    };
  });
}

function createExternalEnvironment() {
  return normalizeExternalPromptEnvironment({
    host: 'sillytavern',
    userHandle: 'directive-scale-worker',
    chatId: 'architecture-redesign-scale-chat',
    campaignId: 'campaign-architecture-scale',
    saveId: 'save-architecture-scale',
    observedAt: '2026-06-30T06:00:00.000Z',
    promptKeys: [
      'directive.campaign.context',
      'summaryception',
      '3_vectfox',
      '3_vectfox_eventbase',
      'customDepthWI_0',
      'unknown_context_provider'
    ],
    worldInfo: {
      installed: true,
      enabled: true,
      activeNames: ['Architecture Scale Lorebook'],
      chatBoundName: 'Architecture Scale Lorebook',
      depth: 4,
      budgetPercent: 80,
      promptPositions: ['before', 'atDepth'],
      rawPromptBody: 'RAW_LOREBOOK_PROMPT_TOKEN'
    },
    memoryBooks: {
      installed: true,
      enabled: true,
      activeBookName: 'Architecture Scale Memory',
      entryCount: 640,
      entryHash: makeHash('memory-book-entries', 640),
      autoSummary: true,
      autoHideUnhide: true,
      sidePrompts: true,
      rawContent: 'RAW_MEMORY_BOOK_TOKEN'
    },
    summaryception: {
      installed: true,
      enabled: true,
      promptKeyActive: true,
      summarizedUpTo: 4200,
      layerCount: 16,
      ghostedCount: 3600,
      injectionHash: makeHash('summaryception-layer', 16),
      externalModelCalls: true,
      rawSummary: 'RAW_SUMMARYCEPTION_TOKEN'
    },
    vectFox: {
      installed: true,
      enabled: true,
      disabledPresent: false,
      promptKeys: ['3_vectfox', '3_vectfox_eventbase'],
      vectorBackend: 'qdrant',
      generationInterceptorActive: true,
      semanticWorldInfoEnabled: true,
      qdrant_api_key: 'SECRET-QDRANT-KEY',
      vectorPayload: ['RAW_VECTOR_PAYLOAD_TOKEN']
    },
    unknownExternalContext: {
      promptKeys: ['unknown_context_provider'],
      visibilityMarkerCount: 17,
      rawPromptBody: 'RAW_UNKNOWN_EXTERNAL_CONTEXT_TOKEN'
    }
  });
}

function createExternalReferenceCatalog(externalEnvironment) {
  const environmentRef = createExternalPromptEnvironmentRef(externalEnvironment);
  return {
    kind: 'directive.externalContextReferenceCatalog.v1',
    schemaVersion: 1,
    environmentRef,
    diagnosticRefs: externalEnvironment.diagnostics.map((diagnostic) => ({
      id: `${diagnostic.target}:${diagnostic.evidenceHash.slice(0, 12)}`,
      kind: diagnostic.kind,
      layer: diagnostic.layer,
      target: diagnostic.target,
      status: diagnostic.status,
      authority: cloneJson(diagnostic.authority),
      evidenceHash: diagnostic.evidenceHash,
      rawContentCaptured: diagnostic.rawContentCaptured === true
    }))
  };
}

function createFrameTrace(messages, externalRef) {
  const frames = messages.map((message, index) => {
    const previousAssistant = index > 0 && messages[index - 1].role === 'assistant'
      ? messages[index - 1]
      : null;
    return createTurnSourceFrameContract({
      id: `frame-${String(index + 1).padStart(5, '0')}`,
      campaignId: 'campaign-architecture-scale',
      saveId: 'save-architecture-scale',
      chatId: 'architecture-redesign-scale-chat',
      hostMessageId: message.hostMessageId,
      textHash: makeHash('host-message-text', message.text),
      selectedAssistantVariantHash: previousAssistant
        ? makeHash('selected-assistant-variant', `${previousAssistant.hostMessageId}:${previousAssistant.selectedSwipeIndex}`)
        : null,
      sourceRevision: index + 1,
      externalPromptEnvironmentRef: index % 250 === 0 ? externalRef : null,
      visibility: {
        sourceRowExists: true,
        visibilityMutationOnly: index % 137 === 0,
        sourceMutation: false,
        hiddenByExternal: index % 137 === 0
      },
      createdAt: `2026-06-30T06:${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}.000Z`
    });
  });
  return frames.map(createTurnSourceFrameRef);
}

function createCoreTraceEntries(frameRefs, diagnosticRefs) {
  return frameRefs.map((frameRef, index) => {
    const isPlayer = index % 2 === 0;
    const turnNumber = Math.floor(index / 2) + 1;
    return {
      id: `core-event-${String(index + 1).padStart(5, '0')}`,
      kind: 'directive.coreEventRef.v1',
      schemaVersion: 1,
      transactionId: `txn-${String(turnNumber).padStart(5, '0')}`,
      eventType: isPlayer ? 'playerIngressObserved' : 'visibleResponseRecorded',
      phase: isPlayer ? 'observed' : 'visibleResponsePosted',
      turnId: `turn-${String(turnNumber).padStart(5, '0')}`,
      outcomeId: isPlayer ? null : `outcome-${String(turnNumber).padStart(5, '0')}`,
      sourceFrameRef: {
        id: frameRef.id,
        hostMessageId: frameRef.hostMessageId,
        textHash: frameRef.textHash,
        sourceRevision: frameRef.sourceRevision
      },
      mechanicsRevision: isPlayer ? turnNumber - 1 : turnNumber,
      promptDirtyDomains: isPlayer ? [] : ['missionQuestThread', index % 11 === 1 ? 'continuity' : null].filter(Boolean),
      diagnosticRefs: index % 250 === 0 ? diagnosticRefs.map((ref) => ({
        id: ref.id,
        target: ref.target,
        evidenceHash: ref.evidenceHash
      })) : []
    };
  });
}

function createRecallEntries(frameRefs) {
  const assistantFrameRefs = frameRefs.filter((_, index) => index % 2 === 1);
  return assistantFrameRefs
    .filter((_, index) => index % 4 === 0)
    .map((frameRef, index) => normalizeRecallIndexEntry({
      id: `recall-entry-${String(index + 1).padStart(5, '0')}`,
      campaignId: 'campaign-architecture-scale',
      saveId: 'save-architecture-scale',
      branchId: 'main',
      sourceFrameRef: frameRef,
      coreEventRefs: [{
        id: `core-event-${String(index * 8 + 2).padStart(5, '0')}`,
        hash: makeHash('core-event-ref', index)
      }],
      sceneSealRef: {
        id: `scene-seal-${String(index % 64).padStart(3, '0')}`,
        hash: makeHash('scene-seal', index % 64)
      },
      phaseId: `phase-${index % 24}`,
      sceneId: `scene-${index % 128}`,
      locationId: ['bridge', 'ready-room', 'sickbay', 'engineering'][index % 4],
      actorIds: ['sam-vickers', ['tessa-bronn', 'elias-thorne', 'maia-reyes'][index % 3]],
      subjectIds: [['command-handoff', 'ship-readiness', 'external-context-risk'][index % 3]],
      threadIds: [`thread-${index % 96}`],
      missionIds: ['mission-architecture-scale'],
      tags: ['scale', index % 5 === 0 ? 'pressure' : 'continuity'],
      keywords: ['breckenridge', index % 3 === 0 ? 'warning' : 'decision'],
      authority: index % 17 === 0 ? 'reviewedImport' : 'committed',
      textHash: frameRef.textHash,
      preview: `Bounded recall preview ${index + 1}`,
      rawTranscript: 'RAW_ASSISTANT_TRANSCRIPT_TOKEN',
      providerOutput: 'RAW_PROVIDER_RESPONSE_TOKEN'
    }));
}

function createRecallResult(recallEntries) {
  const query = createRecallQuery({
    campaignId: 'campaign-architecture-scale',
    saveId: 'save-architecture-scale',
    branchId: 'main',
    sourceFrameId: 'frame-05000',
    actorIds: ['sam-vickers', 'tessa-bronn'],
    subjectIds: ['command-handoff', 'external-context-risk'],
    locationId: 'bridge',
    missionId: 'mission-architecture-scale',
    threadIds: ['thread-4', 'thread-12', 'thread-28'],
    tags: ['scale', 'pressure'],
    keywords: ['warning', 'breckenridge'],
    limit: 16,
    includeSemanticCandidates: false
  });
  return queryRecallIndex({ entries: recallEntries, query });
}

function createLensTrace({ frameRefs, recallResult, externalCatalog }) {
  const recentFrameRefs = frameRefs.slice(-32).map((ref) => ({
    id: ref.id,
    kind: ref.kind,
    hash: ref.textHash,
    sourceFrameId: ref.id,
    estimatedTokens: 55
  }));
  const recallRefs = [
    ...recallResult.includedRefs,
    ...recallResult.omittedRefs.slice(0, 12)
  ].map((ref, index) => ({
    id: ref.id,
    kind: 'directive.recallIndexEntry.v1',
    authority: ref.authority,
    hash: ref.textHash || ref.metadataHash || ref.id,
    sourceFrameId: ref.sourceFrameRef?.id,
    estimatedTokens: index < 10 ? 70 : 160
  }));
  return createLensPromptBudgetTrace({
    packetId: 'lens-packet-5000-scale',
    promptRevision: MESSAGE_COUNT,
    cacheKey: makeHash('lens-cache', {
      messageCount: MESSAGE_COUNT,
      recallIndexRevision: recallResult.recallIndexRevision,
      externalHash: externalCatalog.environmentRef.hash
    }),
    cacheInputs: {
      mechanicsRevision: MESSAGE_COUNT / 2,
      promptDomainVector: {
        stableRules: 1,
        protectedContinuity: 84,
        activeScene: 121,
        activeCast: 32,
        missionPressure: 57,
        recentTranscript: MESSAGE_COUNT,
        recall: recallResult.recallIndexRevision,
        volatileTurn: frameRefs.at(-1).id,
        externalEnvironment: externalCatalog.environmentRef.hash
      },
      recallIndexRevision: recallResult.recallIndexRevision,
      sceneSealRevision: 'scene-seal-revision-5000',
      packageRevision: 'package-revision-scale',
      externalPromptEnvironmentRef: externalCatalog.environmentRef
    },
    lanes: [
      {
        id: 'stableRules',
        budgetTokens: 500,
        reservedFloor: 350,
        refs: [{
          id: 'directive-rules-baseline',
          kind: 'directive.rulesRef.v1',
          hash: makeHash('stable-rules', 1),
          estimatedTokens: 180,
          promptText: 'RAW_PROVIDER_PROMPT_TOKEN'
        }]
      },
      {
        id: 'protectedContinuity',
        budgetTokens: 900,
        reservedFloor: 450,
        refs: [{
          id: 'protected-continuity-head',
          kind: 'directive.continuityProjectionRef.v1',
          hash: makeHash('continuity-head', MESSAGE_COUNT),
          estimatedTokens: 360
        }]
      },
      {
        id: 'activeScene',
        budgetTokens: 1100,
        reservedFloor: 500,
        refs: [{
          id: 'active-scene-seal',
          kind: 'directive.sceneSealRef.v1',
          hash: makeHash('active-scene', MESSAGE_COUNT),
          estimatedTokens: 420
        }]
      },
      {
        id: 'activeCast',
        budgetTokens: 800,
        reservedFloor: 250,
        refs: Array.from({ length: 10 }, (_, index) => ({
          id: `cast-ref-${index + 1}`,
          kind: 'directive.castStateRef.v1',
          hash: makeHash('cast-ref', index),
          estimatedTokens: 55
        }))
      },
      {
        id: 'missionPressure',
        budgetTokens: 900,
        reservedFloor: 300,
        refs: Array.from({ length: 12 }, (_, index) => ({
          id: `pressure-ref-${index + 1}`,
          kind: 'directive.missionPressureRef.v1',
          hash: makeHash('pressure-ref', index),
          estimatedTokens: 60
        }))
      },
      {
        id: 'recentTranscript',
        budgetTokens: 850,
        reservedFloor: 300,
        refs: recentFrameRefs
      },
      {
        id: 'recall',
        budgetTokens: 900,
        reservedFloor: 0,
        refs: recallRefs
      },
      {
        id: 'volatileTurn',
        budgetTokens: 350,
        reservedFloor: 250,
        refs: [{
          id: frameRefs.at(-1).id,
          kind: frameRefs.at(-1).kind,
          hash: frameRefs.at(-1).textHash,
          sourceFrameId: frameRefs.at(-1).id,
          estimatedTokens: 180
        }]
      },
      {
        id: 'externalEnvironment',
        budgetTokens: 0,
        reservedFloor: 0,
        authority: 'diagnostic',
        refs: [
          {
            id: 'external-environment-ref',
            kind: externalCatalog.environmentRef.kind,
            hash: externalCatalog.environmentRef.hash,
            estimatedTokens: 750,
            vectorPayload: 'RAW_VECTOR_PAYLOAD_TOKEN',
            apiKey: 'SECRET-QDRANT-KEY'
          },
          ...externalCatalog.diagnosticRefs.map((ref) => ({
            id: ref.id,
            kind: ref.kind,
            authority: 'diagnostic',
            hash: ref.evidenceHash,
            estimatedTokens: 25
          }))
        ]
      }
    ]
  });
}

function finalizeSegment(kind, index, entries) {
  const segment = {
    kind,
    schemaVersion: 1,
    index,
    entryCount: entries.length,
    entries
  };
  segment.hash = hashStableJson(segment);
  segment.byteLength = stableJsonByteLength(segment);
  return segment;
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

function createMaterializedHead({ externalCatalog, frameSegmentRefs, coreSegmentRefs, recallSegmentRefs, recallResult }) {
  return {
    kind: 'directive.materializedCampaignHead.v2',
    schemaVersion: 1,
    campaignId: 'campaign-architecture-scale',
    saveId: 'save-architecture-scale',
    branchId: 'main',
    messageCount: MESSAGE_COUNT,
    turnCount: MESSAGE_COUNT / 2,
    campaign: {
      title: 'Architecture Scale Harness',
      currentStardate: 78145.2,
      currentLocation: 'U.S.S. Breckenridge'
    },
    core: {
      mechanicsRevision: MESSAGE_COUNT / 2,
      runtimeRevision: MESSAGE_COUNT,
      promptDirtyRevision: MESSAGE_COUNT / 2,
      eventSegmentCount: coreSegmentRefs.length,
      latestEventSegmentRef: coreSegmentRefs.at(-1)
    },
    frames: {
      segmentCount: frameSegmentRefs.length,
      latestFrameSegmentRef: frameSegmentRefs.at(-1)
    },
    recall: {
      segmentCount: recallSegmentRefs.length,
      latestResultHash: recallResult.hash,
      recallIndexRevision: recallResult.recallIndexRevision,
      latestSegmentRef: recallSegmentRefs.at(-1)
    },
    lens: {
      promptRevision: MESSAGE_COUNT,
      promptBudgetTraceRef: {
        id: 'lens-packet-5000-scale',
        hash: null
      }
    },
    externalContext: {
      environmentRef: externalCatalog.environmentRef,
      diagnosticRefs: externalCatalog.diagnosticRefs.map((ref) => ({
        id: ref.id,
        target: ref.target,
        evidenceHash: ref.evidenceHash
      }))
    }
  };
}

function refForArtifact(logicalKey, artifact) {
  return {
    logicalKey,
    hash: hashStableJson(artifact),
    byteLength: stableJsonByteLength(artifact)
  };
}

function createV2LayoutTrace({ head, frameSegments, coreSegments, recallSegments, lensTrace, externalCatalog }) {
  const frameSegmentRefs = frameSegments.map((segment) => refForArtifact(`core/frames/frame-segment-${segment.index}.v2.json`, segment));
  const coreSegmentRefs = coreSegments.map((segment) => refForArtifact(`core/events/core-segment-${segment.index}.v2.json`, segment));
  const recallSegmentRefs = recallSegments.map((segment) => refForArtifact(`recall/recall-segment-${segment.index}.v1.json`, segment));
  return {
    kind: 'directive.v2StorageLayoutTrace.v1',
    schemaVersion: 1,
    campaignId: 'campaign-architecture-scale',
    saveId: 'save-architecture-scale',
    headRef: refForArtifact('core/head.v2.json', head),
    frameSegmentRefs,
    coreSegmentRefs,
    recallSegmentRefs,
    lensTraceRef: refForArtifact('lens/prompt-budget-trace-5000.v1.json', lensTrace),
    externalContextRefCatalogRef: refForArtifact('diagnostics/external-context-ref-catalog.v1.json', externalCatalog),
    manifestPolicy: {
      pointerWritesPerSettledTurnMax: 2,
      fullSaveRewriteAllowed: false,
      largeArtifactsSegmented: true
    }
  };
}

function createNaiveFullSave(count) {
  const messages = createSyntheticMessages(count);
  const turnCount = Math.floor(count / 2);
  return {
    kind: 'directive.naiveFullSave.v1',
    schemaVersion: 1,
    id: `naive-save-${count}`,
    payload: {
      campaignState: {
        campaign: {
          id: 'campaign-architecture-scale',
          title: 'Architecture Scale Harness'
        },
        transcript: messages.map((message, index) => ({
          hostMessageId: message.hostMessageId,
          role: message.role,
          text: message.text,
          providerPrompt: index % 2 === 1 ? `RAW_PROVIDER_PROMPT_TOKEN ${repeated('provider prompt copy', index, 360)}` : null,
          providerResponse: index % 2 === 1 ? `RAW_PROVIDER_RESPONSE_TOKEN ${repeated('provider response copy', index, 360)}` : null
        })),
        runtimeTracking: {
          history: Array.from({ length: turnCount }, (_, index) => ({
            turnId: `turn-${String(index + 1).padStart(5, '0')}`,
            fullTranscript: messages.slice(Math.max(0, index * 2 - 12), index * 2 + 2).map((message) => message.text),
            stateSnapshot: repeated('full state snapshot', index, 900),
            externalPayload: {
              worldInfo: 'RAW_LOREBOOK_PROMPT_TOKEN',
              summaryception: 'RAW_SUMMARYCEPTION_TOKEN',
              vectFox: 'RAW_VECTOR_PAYLOAD_TOKEN'
            }
          })),
          modelCallJournal: Array.from({ length: turnCount }, (_, index) => ({
            id: `model-call-${String(index + 1).padStart(5, '0')}`,
            promptText: `RAW_PROVIDER_PROMPT_TOKEN ${repeated('model prompt snapshot', index, 540)}`,
            responseSnapshot: `RAW_PROVIDER_RESPONSE_TOKEN ${repeated('model response snapshot', index, 540)}`,
            apiKey: 'SECRET-PROVIDER-KEY'
          }))
        },
        externalContext: {
          worldInfo: { rawPromptBody: 'RAW_LOREBOOK_PROMPT_TOKEN' },
          memoryBooks: { rawContent: 'RAW_MEMORY_BOOK_TOKEN' },
          summaryception: { rawSummary: 'RAW_SUMMARYCEPTION_TOKEN' },
          vectFox: {
            qdrant_api_key: 'SECRET-QDRANT-KEY',
            vectorPayload: ['RAW_VECTOR_PAYLOAD_TOKEN']
          }
        }
      }
    }
  };
}

function flattenArtifacts(value) {
  if (Array.isArray(value)) return value.flatMap(flattenArtifacts);
  return [value];
}

function findForbiddenPayloads(value) {
  const serialized = JSON.stringify(value);
  return RAW_PAYLOAD_CANARIES.filter((canary) => serialized.includes(canary));
}

function findForbiddenKeys(value, path = '$', findings = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenKeys(item, `${path}[${index}]`, findings));
    return findings;
  }
  if (!value || typeof value !== 'object') return findings;
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_COMPACT_KEYS.has(key)) findings.push(`${path}.${key}`);
    findForbiddenKeys(item, `${path}.${key}`, findings);
  }
  return findings;
}

function sumBytes(values) {
  return flattenArtifacts(values).reduce((total, item) => total + stableJsonByteLength(item), 0);
}

function maxBytes(values) {
  return Math.max(...flattenArtifacts(values).map(stableJsonByteLength));
}

function assertCompactArtifactsSafe(artifacts) {
  const flattened = flattenArtifacts(artifacts);
  for (const artifact of flattened) {
    assert.deepEqual(findForbiddenPayloads(artifact), [], `${artifact.kind || 'artifact'} must not serialize raw payload canaries`);
    assert.deepEqual(findForbiddenKeys(artifact), [], `${artifact.kind || 'artifact'} must not use raw payload key names`);
  }
}

function buildCompactScaleArtifacts(count) {
  const messages = createSyntheticMessages(count);
  const externalEnvironment = createExternalEnvironment();
  const externalCatalog = createExternalReferenceCatalog(externalEnvironment);
  const frameRefs = createFrameTrace(messages, externalCatalog.environmentRef);
  const coreEntries = createCoreTraceEntries(frameRefs, externalCatalog.diagnosticRefs);
  const recallEntries = createRecallEntries(frameRefs);
  const recallResult = createRecallResult(recallEntries);
  const lensTrace = createLensTrace({ frameRefs, recallResult, externalCatalog });
  const frameSegments = rollSegments('directive.frameRefSegment.v1', frameRefs, FRAME_SEGMENT_MAX_BYTES);
  const coreSegments = rollSegments('directive.coreEventSegment.v1', coreEntries, CORE_SEGMENT_MAX_BYTES);
  const recallSegments = rollSegments('directive.recallIndexSegment.v1', recallEntries, RECALL_SEGMENT_MAX_BYTES);
  const frameSegmentRefs = frameSegments.map((segment) => refForArtifact(`core/frames/frame-segment-${segment.index}.v2.json`, segment));
  const coreSegmentRefs = coreSegments.map((segment) => refForArtifact(`core/events/core-segment-${segment.index}.v2.json`, segment));
  const recallSegmentRefs = recallSegments.map((segment) => refForArtifact(`recall/recall-segment-${segment.index}.v1.json`, segment));
  const head = createMaterializedHead({
    externalCatalog,
    frameSegmentRefs,
    coreSegmentRefs,
    recallSegmentRefs,
    recallResult
  });
  head.lens.promptBudgetTraceRef.hash = lensTrace.hash;
  const v2LayoutTrace = createV2LayoutTrace({
    head,
    frameSegments,
    coreSegments,
    recallSegments,
    lensTrace,
    externalCatalog
  });
  return {
    messages,
    externalEnvironment,
    externalCatalog,
    frameSegments,
    coreSegments,
    recallSegments,
    recallResult,
    lensTrace,
    head,
    v2LayoutTrace
  };
}

const compact500 = buildCompactScaleArtifacts(COMPARISON_MESSAGE_COUNT);
const compact5000 = buildCompactScaleArtifacts(MESSAGE_COUNT);
const naive500 = createNaiveFullSave(COMPARISON_MESSAGE_COUNT);
const naive5000 = createNaiveFullSave(MESSAGE_COUNT);

const compactArtifacts = [
  compact5000.externalCatalog,
  compact5000.frameSegments,
  compact5000.coreSegments,
  compact5000.recallSegments,
  compact5000.recallResult,
  compact5000.lensTrace,
  compact5000.head,
  compact5000.v2LayoutTrace
];

assert.equal(compact5000.messages.length, MESSAGE_COUNT);
assert.equal(compact5000.coreSegments.length > 1, true, 'CORE event refs should segment at 5000 messages');
assert.equal(compact5000.frameSegments.length > 1, true, 'Frame refs should segment at 5000 messages');
assert.equal(compact5000.recallSegments.length > 0, true, 'Recall index segment fixture should exist');
assert.equal(compact5000.recallResult.trace.deterministicFirst, true);
assert.equal(compact5000.recallResult.trace.semanticCandidatesAuthoritative, false);
assert.deepEqual(
  compact5000.lensTrace.lanes.map((lane) => lane.id),
  promptBudgetLaneIds(),
  'LENS trace should cover every Stage 2 budget lane'
);

const externalLane = compact5000.lensTrace.lanes.find((lane) => lane.id === 'externalEnvironment');
assert.equal(externalLane.diagnosticOnly, true, 'external context must remain diagnostic-only in LENS');
assert.equal(externalLane.authority, 'diagnostic');
assert.equal(externalLane.includedRefs.every((ref) => ref.hash && !('evidence' in ref)), true);
assert.equal(compact5000.externalCatalog.diagnosticRefs.every((ref) => ref.evidenceHash && ref.rawContentCaptured === false), true);
assert.equal(compact5000.externalCatalog.diagnosticRefs.some((ref) => ref.target === 'summaryception'), true);
assert.equal(compact5000.externalCatalog.diagnosticRefs.some((ref) => ref.target === 'vectFox'), true);

assertCompactArtifactsSafe(compactArtifacts);
assert.deepEqual(findForbiddenPayloads(compact5000.externalEnvironment), []);
assert.equal(compact5000.externalEnvironment.redactions.length >= 5, true, 'external environment should record raw/secret redactions');
assert.equal(findForbiddenPayloads(naive5000).length >= RAW_PAYLOAD_CANARIES.length - 1, true, 'naive full-save fixture should prove leak canaries are meaningful');
assert.equal(findForbiddenKeys(naive5000).length > 0, true, 'naive full-save fixture should retain forbidden raw payload fields');

const compactSizes = {
  materializedHeadBytes: stableJsonByteLength(compact5000.head),
  v2LayoutTraceBytes: stableJsonByteLength(compact5000.v2LayoutTrace),
  lensTraceBytes: stableJsonByteLength(compact5000.lensTrace),
  externalRefCatalogBytes: stableJsonByteLength(compact5000.externalCatalog),
  frameSegmentMaxBytes: maxBytes(compact5000.frameSegments),
  coreSegmentMaxBytes: maxBytes(compact5000.coreSegments),
  recallSegmentMaxBytes: maxBytes(compact5000.recallSegments),
  compactTotalBytes: sumBytes(compactArtifacts),
  compact500HeadBytes: stableJsonByteLength(compact500.head),
  compact500TotalBytes: sumBytes([
    compact500.externalCatalog,
    compact500.frameSegments,
    compact500.coreSegments,
    compact500.recallSegments,
    compact500.recallResult,
    compact500.lensTrace,
    compact500.head,
    compact500.v2LayoutTrace
  ])
};

const naiveSizes = {
  naive500Bytes: stableJsonByteLength(naive500),
  naive5000Bytes: stableJsonByteLength(naive5000)
};

assert.equal(compactSizes.materializedHeadBytes <= MATERIALIZED_HEAD_MAX_BYTES, true, 'materialized head must stay bounded');
assert.equal(compactSizes.v2LayoutTraceBytes <= V2_LAYOUT_TRACE_MAX_BYTES, true, 'v2 layout trace must stay bounded');
assert.equal(compactSizes.lensTraceBytes <= LENS_TRACE_MAX_BYTES, true, 'LENS budget trace must stay bounded');
assert.equal(compactSizes.externalRefCatalogBytes <= EXTERNAL_REF_CATALOG_MAX_BYTES, true, 'external diagnostics should be reference-sized');
assert.equal(compactSizes.frameSegmentMaxBytes <= FRAME_SEGMENT_MAX_BYTES, true, 'Frame segments must stay below segment budget');
assert.equal(compactSizes.coreSegmentMaxBytes <= CORE_SEGMENT_MAX_BYTES, true, 'CORE segments must stay below segment budget');
assert.equal(compactSizes.recallSegmentMaxBytes <= RECALL_SEGMENT_MAX_BYTES, true, 'Recall segments must stay below segment budget');
assert.equal(compactSizes.compactTotalBytes <= COMPACT_TOTAL_MAX_BYTES, true, 'compact 5000-message artifact set must stay below Stage 2 budget');
assert.equal(
  compactSizes.materializedHeadBytes <= compactSizes.compact500HeadBytes + 64 * 1024,
  true,
  'head growth should stay nearly flat from 500 to 5000 messages'
);

assert.equal(naiveSizes.naive5000Bytes > naiveSizes.naive500Bytes * 8, true, 'naive full-save fixture should grow with transcript history');
assert.equal(naiveSizes.naive5000Bytes > compactSizes.compactTotalBytes, true, 'compact architecture should beat naive full-save bytes at 5000 messages');

const naiveCounters = createStorageWriteCounters();
recordStorageWrite(naiveCounters, {
  logicalKey: 'saves/naive-scale-save.v1.json',
  payload: naive5000,
  bytes: naiveSizes.naive5000Bytes,
  beforeGenerationStart: true
});
const compactCounters = createStorageWriteCounters();
for (const segment of [...compact5000.frameSegments, ...compact5000.coreSegments, ...compact5000.recallSegments]) {
  recordStorageWrite(compactCounters, {
    logicalKey: `${segment.kind}/${segment.index}.json`,
    type: 'segment',
    bytes: stableJsonByteLength(segment)
  });
}
recordStorageWrite(compactCounters, {
  logicalKey: 'core/head.v2.json',
  type: 'head',
  bytes: compactSizes.materializedHeadBytes
});
recordStorageWrite(compactCounters, {
  logicalKey: 'lens/prompt-budget-trace-5000.v1.json',
  type: 'diagnostics',
  bytes: compactSizes.lensTraceBytes
});
recordStorageWrite(compactCounters, {
  logicalKey: 'diagnostics/external-context-ref-catalog.v1.json',
  type: 'diagnostics',
  bytes: compactSizes.externalRefCatalogBytes
});
recordStorageWrite(compactCounters, {
  logicalKey: 'manifests/save-architecture-scale.v2.json',
  type: 'manifest',
  bytes: compactSizes.v2LayoutTraceBytes
});

assert.equal(naiveCounters.fullSaveRewriteCount, 1);
assert.equal(compactCounters.fullSaveRewriteCount, 0);
assert.equal(compactCounters.headWriteCount, 1);
assert.equal(compactCounters.manifestWriteCount, 1);

console.log('Architecture redesign scale harness passed:', JSON.stringify({
  messages: MESSAGE_COUNT,
  naive500Bytes: naiveSizes.naive500Bytes,
  naive5000Bytes: naiveSizes.naive5000Bytes,
  compact5000Bytes: compactSizes.compactTotalBytes,
  materializedHeadBytes: compactSizes.materializedHeadBytes,
  v2LayoutTraceBytes: compactSizes.v2LayoutTraceBytes,
  frameSegments: compact5000.frameSegments.length,
  coreSegments: compact5000.coreSegments.length,
  recallSegments: compact5000.recallSegments.length,
  lensTraceBytes: compactSizes.lensTraceBytes,
  externalRefCatalogBytes: compactSizes.externalRefCatalogBytes
}));
