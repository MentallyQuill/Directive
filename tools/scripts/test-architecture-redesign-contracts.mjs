import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  ARCHITECTURE_REDESIGN_CONTRACTS,
  collectExternalPromptKeys,
  createExternalPromptEnvironmentRef,
  createStorageWriteCounters,
  createTurnLatencyMetrics,
  createTurnSourceFrameContract,
  createTurnSourceFrameRef,
  hashStableJson,
  isDirectivePromptKey,
  normalizeExternalPromptEnvironment,
  normalizeHostMessageVisibility,
  redactExternalDiagnostic,
  recordStorageWrite,
  stableJsonByteLength,
  stableJsonStringify
} from '../../src/runtime/architecture-redesign-contracts.mjs';

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

for (const schemaPath of [
  'schemas/runtime/turn-source-frame.schema.json',
  'schemas/runtime/turn-transaction.schema.json',
  'schemas/runtime/external-prompt-environment.schema.json',
  'schemas/runtime/architecture-metrics.schema.json',
  'schemas/runtime/recall-index.schema.json',
  'schemas/runtime/lens-prompt-budget-trace.schema.json'
]) {
  const schema = readJson(schemaPath);
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.additionalProperties, false, `${schemaPath} should reject unplanned root fields`);
  assert.equal(Array.isArray(schema.required), true, `${schemaPath} should declare required fields`);
}
assert.equal(readJson('schemas/runtime/turn-source-frame.schema.json').properties.externalPromptEnvironmentRef.type.includes('object'), true);
assert.equal(readJson('schemas/runtime/external-prompt-environment.schema.json').required.includes('redactions'), true);
assert.equal(readJson('schemas/runtime/architecture-metrics.schema.json').properties.latency.properties.architectureWithin60s.type.includes('boolean'), true);
assert.equal(readJson('schemas/runtime/recall-index.schema.json').properties.result.required.includes('includedRefs'), true);
assert.equal(readJson('schemas/runtime/lens-prompt-budget-trace.schema.json').properties.lanes.items.properties.id.enum.includes('recall'), true);

assert.equal(ARCHITECTURE_REDESIGN_CONTRACTS.EXTERNAL_CONTEXT_KIND, 'directive.externalPromptEnvironment.v1');
assert.equal(isDirectivePromptKey('directive.context.revolving'), true);
assert.equal(isDirectivePromptKey('summaryception'), false);
assert.equal(hashStableJson({ a: 1 }), '015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862');
assert.equal(stableJsonByteLength({ text: 'é' }), 13);

const externalPromptEnvironment = normalizeExternalPromptEnvironment({
  host: 'sillytavern',
  userHandle: 'directive-soak-a',
  chatId: 'ashes-chat-1',
  campaignId: 'campaign-ashes',
  observedAt: '2026-06-28T12:00:00.000Z',
  promptKeys: [
    'directive.contract',
    'summaryception',
    '3_vectfox',
    '3_vectfox_summarizer'
  ],
  worldInfo: {
    enabled: true,
    activeNames: ['Story_Ashes', 'Story_Ashes'],
    chatBoundName: 'Directive Ashes Memory',
    depth: 3,
    budgetPercent: 100,
    recursive: true,
    promptPositions: ['before', 'atDepth', 'before'],
    rawPromptBody: 'This raw lorebook body must not be stored.'
  },
  memoryBooks: {
    installed: true,
    enabled: true,
    activeBookName: 'Directive Ashes Memory',
    entryCount: 42,
    entryHash: 'stmb-entry-hash',
    riskyModes: {
      autoSummary: true,
      sidePrompts: true,
      atDepthUserOrAssistant: true
    },
    apiKey: 'SECRET-STMB-KEY'
  },
  summaryception: {
    installed: true,
    enabled: true,
    promptKeyActive: true,
    summarizedUpTo: 100,
    layerCount: 2,
    ghostedCount: 17,
    injectionHash: 'summary-hash',
    externalModelCalls: true,
    promptText: 'Raw Summaryception injection must not persist.'
  },
  vectFox: {
    installed: true,
    enabled: false,
    disabledPresent: true,
    promptKeys: ['3_vectfox', '3_vectfox_eventbase'],
    vectorBackend: 'qdrant',
    qdrant_api_key: 'SECRET-QDRANT-KEY',
    semanticWorldInfoEnabled: false,
    summarizerInjectionEnabled: true,
    ghostingEnabled: false,
    generationInterceptorActive: true,
    vectorPayload: ['raw vector text']
  },
  unknownSignals: ['extension-prompt-order-unavailable']
});

assert.equal(externalPromptEnvironment.kind, 'directive.externalPromptEnvironment.v1');
assert.equal(externalPromptEnvironment.host, 'sillytavern');
assert.deepEqual(externalPromptEnvironment.worldInfo.activeNames, ['Story_Ashes']);
assert.deepEqual(externalPromptEnvironment.worldInfo.promptPositions, ['before', 'atDepth']);
assert.equal(externalPromptEnvironment.memoryBooks.stMemoryBookEntryCount, 42);
assert.equal(externalPromptEnvironment.memoryBooks.riskyModes.autoSummary, true);
assert.equal(externalPromptEnvironment.memoryBooks.riskyModes.sidePrompts, true);
assert.equal(externalPromptEnvironment.summaryception.ghostedCount, 17);
assert.equal(externalPromptEnvironment.summaryception.externalModelCalls, true);
assert.equal(externalPromptEnvironment.vectFox.backendType, 'qdrant');
assert.equal(externalPromptEnvironment.vectFox.disabledPresent, true);
assert.equal(externalPromptEnvironment.vectFox.generationInterceptorActive, true);
assert.deepEqual(externalPromptEnvironment.unknownSignals, ['extension-prompt-order-unavailable']);
assert.deepEqual(collectExternalPromptKeys(externalPromptEnvironment), [
  'summaryception',
  '3_vectfox',
  '3_vectfox_summarizer',
  '3_vectfox_eventbase'
]);
const serializedEnvironment = JSON.stringify(externalPromptEnvironment);
assert.equal(serializedEnvironment.includes('SECRET'), false);
assert.equal(serializedEnvironment.includes('raw vector text'), false);
assert.equal(serializedEnvironment.includes('Raw Summaryception injection'), false);
assert.equal(serializedEnvironment.includes('raw lorebook body'), false);
assert.equal(externalPromptEnvironment.redactions.some((entry) => entry.reason === 'secret'), true);
assert.equal(externalPromptEnvironment.redactions.some((entry) => entry.reason === 'raw-payload'), true);
assert.match(externalPromptEnvironment.hash, /^[a-f0-9]{64}$/);
assert.equal(externalPromptEnvironment.byteLength > 0, true);
const provenanceRedactions = [];
assert.deepEqual(
  redactExternalDiagnostic({
    sourceToken: 'turnSourceFrame:frame-29',
    turnSourceToken: 'ingress:ingress-29',
    bearerToken: 'SECRET-BEARER-TOKEN',
    sourceTokenFallback: 'SECRET-FALLBACK-TOKEN',
    sourceTokenInvalid: 'SECRET-FALLBACK-TOKEN'
  }, provenanceRedactions),
  {
    sourceToken: 'turnSourceFrame:frame-29',
    turnSourceToken: 'ingress:ingress-29',
    bearerToken: '[redacted-secret]',
    sourceTokenFallback: '[redacted-secret]',
    sourceTokenInvalid: '[redacted-secret]'
  }
);
assert.deepEqual(
  provenanceRedactions.map((entry) => entry.key),
  ['bearerToken', 'sourceTokenFallback', 'sourceTokenInvalid']
);
assert.equal(
  normalizeExternalPromptEnvironment({
    host: 'sillytavern',
    observedAt: '2026-06-28T12:00:00.000Z',
    promptKeys: ['summaryception'],
    summaryception: { installed: true, enabled: true, promptKeyActive: true }
  }).hash,
  normalizeExternalPromptEnvironment({
    host: 'sillytavern',
    observedAt: '2026-06-28T12:00:30.000Z',
    promptKeys: ['summaryception'],
    summaryception: { installed: true, enabled: true, promptKeyActive: true }
  }).hash,
  'external prompt environment identity hash must not churn on observedAt only'
);

const externalPromptEnvironmentRef = createExternalPromptEnvironmentRef(externalPromptEnvironment);
assert.equal(externalPromptEnvironmentRef.hash, externalPromptEnvironment.hash);
assert.equal(externalPromptEnvironmentRef.knownExternalPromptKeys.includes('directive.contract'), false);
assert.equal(externalPromptEnvironmentRef.knownExternalPromptKeys.includes('summaryception'), true);

const frame = createTurnSourceFrameContract({
  id: 'frame-1',
  campaignId: 'campaign-ashes',
  saveId: 'save-ashes',
  chatId: 'ashes-chat-1',
  hostMessageId: 'msg-29',
  textHash: 'player-text-hash',
  selectedAssistantVariantHash: 'assistant-selected-swipe-hash',
  externalPromptEnvironment: externalPromptEnvironment,
  createdAt: '2026-06-28T12:00:01.000Z'
});
assert.equal(frame.kind, 'directive.turnSourceFrame.v1');
assert.equal(frame.externalPromptEnvironmentRef.hash, externalPromptEnvironment.hash);
assert.equal(frame.externalPromptEnvironmentRef.knownExternalPromptKeys.includes('3_vectfox'), true);
assert.equal(JSON.stringify(frame).includes('Raw Summaryception injection'), false);

const frameRef = createTurnSourceFrameRef({
  ...frame,
  rawPlayerText: 'Raw player text must not survive in the compact Frame ref.',
  textPreview: 'Visible transcript preview must not survive in the compact Frame ref.'
});
assert.equal(frameRef.kind, 'directive.turnSourceFrameRef.v1');
assert.equal(frameRef.id, 'frame-1');
assert.equal(frameRef.textHash, 'player-text-hash');
assert.equal(frameRef.selectedAssistantVariantHash, 'assistant-selected-swipe-hash');
assert.equal(frameRef.externalPromptEnvironmentRef.hash, externalPromptEnvironment.hash);
assert.equal(frameRef.dedupeKey, 'frame-1');
assert.equal(JSON.stringify(frameRef).includes('Raw player text'), false);
assert.equal(JSON.stringify(frameRef).includes('Visible transcript preview'), false);

const summaryceptionGhostedVisibility = normalizeHostMessageVisibility({
  id: 'msg-12',
  is_user: true,
  mes: 'This row is hidden from prompt, but it is still source truth.',
  extra: {
    sc_ghosted: true
  }
});
assert.equal(summaryceptionGhostedVisibility.sourceRowExists, true);
assert.equal(summaryceptionGhostedVisibility.visibilityMutationOnly, true);
assert.equal(summaryceptionGhostedVisibility.sourceMutation, false);
assert.equal(summaryceptionGhostedVisibility.ghostedBySummaryception, true);

const deletedVisibility = normalizeHostMessageVisibility({
  id: 'msg-13',
  deleted: true,
  extra: {
    sc_ghosted: true
  }
});
assert.equal(deletedVisibility.visibilityMutationOnly, false);
assert.equal(deletedVisibility.sourceMutation, true);

const nativeHiddenVisibility = normalizeHostMessageVisibility({
  id: 'msg-14',
  is_hidden: true
});
assert.equal(nativeHiddenVisibility.sourceRowExists, true);
assert.equal(nativeHiddenVisibility.hiddenByHost, true);
assert.equal(nativeHiddenVisibility.visibilityMutationOnly, true);
assert.equal(nativeHiddenVisibility.sourceMutation, false);

const vectFoxGhostedVisibility = normalizeHostMessageVisibility({
  id: 'msg-15',
  extra: {
    vectfox_prompt_ghosted: true
  }
});
assert.equal(vectFoxGhostedVisibility.ghostedByVectFox, true);
assert.equal(vectFoxGhostedVisibility.visibilityMutationOnly, true);
assert.equal(vectFoxGhostedVisibility.sourceMutation, false);

const memoryBooksHiddenVisibility = normalizeHostMessageVisibility({
  id: 'msg-16',
  extra: {
    stmb_hidden: true,
    memoryBooks: {
      hidden: true
    }
  }
});
assert.equal(memoryBooksHiddenVisibility.hiddenByMemoryBooks, true);
assert.equal(memoryBooksHiddenVisibility.visibilityMutationOnly, true);
assert.equal(memoryBooksHiddenVisibility.sourceMutation, false);

const summaryceptionRangeVisibility = normalizeHostMessageVisibility(
  { id: 'msg-17' },
  {
    index: 17,
    chatMetadata: {
      summaryception: {
        summarizedRanges: [[16, 18]]
      }
    }
  }
);
assert.equal(summaryceptionRangeVisibility.summarizedBySummaryception, true);
assert.equal(summaryceptionRangeVisibility.hiddenByExternal, false);
assert.equal(summaryceptionRangeVisibility.visibilityMutationOnly, false);
assert.deepEqual(summaryceptionRangeVisibility.summaryceptionSummarizedRanges, [{ start: 16, end: 18 }]);

const memoryBooksUnhiddenVisibility = normalizeHostMessageVisibility(
  { id: 'msg-18' },
  {
    index: 18,
    chatMetadata: {
      memoryBooks: {
        unhiddenIndices: [18]
      }
    }
  }
);
assert.equal(memoryBooksUnhiddenVisibility.hiddenByMemoryBooks, false);
assert.equal(memoryBooksUnhiddenVisibility.unhiddenByMemoryBooks, true);
assert.equal(memoryBooksUnhiddenVisibility.memoryBooksVisibilityMutation, true);
assert.equal(memoryBooksUnhiddenVisibility.visibilityMutationOnly, true);
assert.equal(memoryBooksUnhiddenVisibility.sourceMutation, false);
assert.equal(memoryBooksUnhiddenVisibility.visibilityMutationReasons.includes('memory-books-unhidden'), true);

const vectFoxPromptExcludedVisibility = normalizeHostMessageVisibility(
  { id: 'msg-19' },
  {
    index: 19,
    chatMetadata: {
      vectFox: {
        promptExcludedIndices: [19]
      }
    }
  }
);
assert.equal(vectFoxPromptExcludedVisibility.promptExcludedByVectFox, true);
assert.equal(vectFoxPromptExcludedVisibility.ghostedByVectFox, true);
assert.equal(vectFoxPromptExcludedVisibility.visibilityMutationOnly, true);
assert.equal(vectFoxPromptExcludedVisibility.sourceMutation, false);

const deletePrecedenceVisibility = normalizeHostMessageVisibility(
  {
    id: 'msg-20',
    deleted: true,
    extra: {
      memoryBooks: {
        unhidden: true
      }
    }
  },
  {
    index: 20,
    chatMetadata: {
      summaryception: {
        summarizedRanges: [{ startIndex: 19, endIndex: 21 }]
      },
      vectFox: {
        promptExcludedIndices: [20]
      }
    }
  }
);
assert.equal(deletePrecedenceVisibility.summarizedBySummaryception, true);
assert.equal(deletePrecedenceVisibility.promptExcludedByVectFox, true);
assert.equal(deletePrecedenceVisibility.unhiddenByMemoryBooks, true);
assert.equal(deletePrecedenceVisibility.sourceMutation, true);
assert.equal(deletePrecedenceVisibility.visibilityMutationOnly, false);

const hostContinueLatency = createTurnLatencyMetrics({
  playerSubmittedAt: 1000,
  turnObservedAt: 1250,
  routeDecidedAt: 1800,
  hostGenerationReleasedAt: 9000,
  visibleResponsePostedAt: 20000
});
assert.equal(hostContinueLatency.generationStartedAt, 9000);
assert.equal(hostContinueLatency.generationStartLatencyMs, 8000);
assert.equal(hostContinueLatency.providerCompletionLatencyMs, null);
assert.equal(hostContinueLatency.architectureWithin60s, true);

const directiveCommitLatency = createTurnLatencyMetrics({
  playerSubmittedAt: 0,
  routeDecidedAt: 5000,
  directiveGenerationStartedAt: 45000,
  visibleResponsePostedAt: 125000
});
assert.equal(directiveCommitLatency.generationStartLatencyMs, 45000);
assert.equal(directiveCommitLatency.providerCompletionLatencyMs, 80000);
assert.equal(directiveCommitLatency.architectureWithin60s, true);

const overBudgetLatency = createTurnLatencyMetrics({
  playerSubmittedAt: 0,
  directiveGenerationStartedAt: 61000
});
assert.equal(overBudgetLatency.architectureWithin60s, false);
const isoLatency = createTurnLatencyMetrics({
  playerSubmittedAt: '2026-06-28T12:00:00.000Z',
  hostGenerationReleasedAt: '2026-06-28T12:00:09.500Z',
  visibleResponsePostedAt: '2026-06-28T12:00:20.000Z'
});
assert.equal(isoLatency.generationStartLatencyMs, 9500);
assert.equal(isoLatency.architectureWithin60s, true);
const missingTimestampLatency = createTurnLatencyMetrics({
  playerSubmittedAt: null,
  turnObservedAt: '',
  hostGenerationReleasedAt: null,
  directiveGenerationStartedAt: '2026-06-28T12:00:09.500Z',
  visibleResponsePostedAt: '2026-06-28T12:00:20.000Z'
});
assert.equal(missingTimestampLatency.playerSubmittedAt, null);
assert.equal(missingTimestampLatency.turnObservedAt, null);
assert.equal(missingTimestampLatency.hostGenerationReleasedAt, null);
assert.equal(missingTimestampLatency.generationStartLatencyMs, null);
assert.equal(missingTimestampLatency.architectureWithin60s, null);

const counters = createStorageWriteCounters();
recordStorageWrite(counters, { type: 'segment', bytes: 128, beforeGenerationStart: true });
recordStorageWrite(counters, { type: 'manifest', bytes: 64, beforeGenerationStart: true });
recordStorageWrite(counters, { type: 'diagnostics', bytes: 512 });
assert.equal(counters.fullSaveRewriteCount, 0);
assert.equal(counters.segmentWriteCount, 1);
assert.equal(counters.manifestWriteCount, 1);
assert.equal(counters.diagnosticsWriteCount, 1);
assert.equal(counters.bytesWritten, 704);
assert.equal(counters.writesBeforeGenerationStart, 2);
recordStorageWrite(counters, { type: 'fullSave', bytes: 1024 });
assert.equal(counters.fullSaveRewriteCount, 1);
recordStorageWrite(counters, {
  logicalKey: 'saves/save-ashes.v1.json',
  bytes: 2048,
  payload: {
    metadata: { id: 'save-ashes' },
    payload: {
      campaignState: {
        id: 'campaign-ashes'
      }
    }
  },
  beforeGenerationStart: true
});
assert.equal(counters.fullSaveRewriteCount, 2);
assert.equal(counters.writesBeforeGenerationStart, 3);

const stableA = {
  b: 2,
  a: {
    z: 1,
    y: 2
  }
};
const stableB = {
  a: {
    y: 2,
    z: 1
  },
  b: 2
};
assert.equal(stableJsonStringify(stableA), stableJsonStringify(stableB));
assert.equal(hashStableJson(stableA), hashStableJson(stableB));
assert.equal(stableJsonByteLength(stableA), Buffer.byteLength(stableJsonStringify(stableA), 'utf8'));

console.log('Architecture redesign contract tests passed.');
