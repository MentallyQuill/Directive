import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  PLAYWRIGHT_SELECTOR_GUIDANCE,
  appendJsonLine,
  buildExternalContextBrowserProbe,
  createArtifactPaths,
  createRunId,
  ensureDirectory,
  ensureArtifactTree,
  externalContextFixtureDepthCheckStatus,
  inspectSillyTavernExternalContextCompatibility,
  inspectSillyTavernAuthorNoteCleanliness,
  normalizeBaseUrl,
  normalizeExtensionPath,
  readJsonFile,
  summarizeExternalContextFixtureDepth,
  tempArtifactRoot,
  verifyPlaywrightBrowserEnvironment,
  writeJsonFile,
  writeTextFile
} from './lib/sillytavern-live-harness.mjs';
import {
  buildFactualGroundingCanaryPacks,
  writeFactualGroundingCanaryArtifacts
} from './lib/factual-grounding-canaries.mjs';
import {
  buildFactualGroundingCheck,
  buildModelAssistedFactualReviewRequest,
  buildModelAssistedFactualReviewResult,
  factualGroundingLiveLogRecord,
  promptBlocksFromInspection,
  writeFactualGroundingCheckArtifact
} from './lib/factual-grounding-evaluator.mjs';
import {
  SOAK_CAMPAIGN_MATRIX,
  SOAK_CHECKPOINT_ARTIFACT_POLICY,
  SOAK_COMMAND_BEARING_SYSTEM_POLICY,
  SOAK_COMMAND_CONDUCT_SCENARIOS,
  SOAK_CONTINUITY_PROJECTION_MATRIX_POLICY,
  SOAK_END_CONDITION_SCENARIOS,
  SOAK_FACTUAL_GROUNDING_POLICY,
  SOAK_LIVE_LOG_POLICY,
  SOAK_OBJECTIVE_ASSIGNMENT_PROJECTION_POLICY,
  SOAK_PARALLEL_WORKER_POLICY,
  SOAK_PLAYER_INPUT_POLICY,
  SOAK_PHASES,
  SOAK_READABLE_TRANSCRIPT_POLICY,
  SOAK_SCENE_HANDSHAKE_POLICY,
  SOAK_SERVED_EXTENSION_PROOF_FILES,
  SOAK_STORY_QUALITY_POLICY,
  SOAK_TIMEKEEPING_POLICY,
  SOAK_TURN_SETTLEMENT_POLICY,
  SOAK_TURN_SCRIPT,
  buildLiveSmokeEnvironment,
  buildPostSmokeFactualGroundingAudit,
  buildPostSmokeStoryQualityReview,
  buildReleaseCertificationSummary,
  buildCampaignMatrixCanaryScripts,
  buildStoryQualityManualReviewScores,
  buildStoryQualityManualReviewTemplate,
  buildStoryQualityModelReviewRequest,
  buildStoryQualityModelReviewResult,
  buildStoryQualityScoreRecord,
  buildStoryQualityPhaseSummary,
  buildSoakChatMessageScript,
  importStoryQualityManualReviewScores,
  initializeStoryQualityReviewArtifacts,
  storyQualityLiveLogRecord,
  writeCampaignMatrixCanaryArtifacts,
  writeStoryQualityManualReviewTemplateArtifact,
  writeStoryQualityScoreRecord,
  writeStoryQualityPhaseSummaryArtifact,
  liveSmokeDelegationAssessment,
  liveGenerationTimingAssessment,
  liveHostNativeCompletionAssessment,
  SOAK_UI_STATE_SURFACE_POLICY,
  buildDryRunReport,
  copyDelegatedSmokeTranscriptArtifacts,
  statusFromChecks,
  strictModePolicy,
  writeSoakCheckpoint,
  promoteDelegatedSmokeEvidence
} from './soak-sillytavern-campaign-live.mjs';
import {
  playerInputPerspectiveEvidence
} from './lib/player-input-perspective.mjs';

assert.equal(normalizeBaseUrl('http://127.0.0.1:8000///'), 'http://127.0.0.1:8000');
assert.equal(normalizeExtensionPath('scripts/extensions/third-party/Directive/'), '/scripts/extensions/third-party/Directive');
assert.match(createRunId(new Date('2026-06-23T12:34:56.789Z')), /^2026-06-23T12-34-56-789Z$/);
assert.equal(PLAYWRIGHT_SELECTOR_GUIDANCE.prefer.some((entry) => /role/.test(entry)), true);

const authorNoteFixtureRoot = tempArtifactRoot('directive-author-note-fixture-');
const dirtyUserRoot = path.join(authorNoteFixtureRoot, 'directive-soak-a');
const dirtyChatRoot = path.join(dirtyUserRoot, 'chats', 'Directive - Ashes');
writeJsonFile(path.join(dirtyUserRoot, 'settings.json'), {
  extension_settings: {
    note: {
      default: 'Harry Potter default note that must not enter Directive soak tests.'
    }
  }
});
writeTextFile(
  path.join(dirtyChatRoot, 'Directive - Ashes - dirty.jsonl'),
  `${JSON.stringify({ chat_metadata: { note_prompt: 'Hermione can only hear words in quotes.' } })}\n`
);
const dirtyAuthorNoteCheck = inspectSillyTavernAuthorNoteCleanliness({
  users: ['directive-soak-a'],
  dataRoot: authorNoteFixtureRoot,
  required: true
});
assert.equal(dirtyAuthorNoteCheck.status, 'fail');
assert.equal(dirtyAuthorNoteCheck.contaminatedUserCount, 1);
assert.equal(dirtyAuthorNoteCheck.users[0].noteDefaultLength > 0, true);
assert.equal(dirtyAuthorNoteCheck.users[0].contaminatedChatCount, 1);
writeJsonFile(path.join(dirtyUserRoot, 'settings.json'), { extension_settings: { note: { default: '' } } });
writeTextFile(
  path.join(dirtyChatRoot, 'Directive - Ashes - dirty.jsonl'),
  `${JSON.stringify({ chat_metadata: { note_prompt: '' } })}\n`
);
const cleanAuthorNoteCheck = inspectSillyTavernAuthorNoteCleanliness({
  users: [{ handle: 'directive-soak-a' }],
  dataRoot: authorNoteFixtureRoot,
  required: true
});
assert.equal(cleanAuthorNoteCheck.status, 'pass');
assert.equal(cleanAuthorNoteCheck.users[0].noteDefaultLength, 0);
assert.equal(cleanAuthorNoteCheck.users[0].contaminatedChatCount, 0);

const externalContextFixtureRoot = tempArtifactRoot('directive-external-context-fixture-');
const externalUserRoot = path.join(externalContextFixtureRoot, 'directive-soak-a');
const externalChatRoot = path.join(externalUserRoot, 'chats', 'Directive - Ashes');
ensureDirectory(path.join(externalUserRoot, 'extensions', 'SillyTavern-MemoryBooks'));
ensureDirectory(path.join(externalUserRoot, 'extensions', 'Extension-Summaryception'));
ensureDirectory(path.join(externalUserRoot, 'extensions', 'VectFox'));
writeJsonFile(path.join(externalUserRoot, 'settings.json'), {
  extensions: {
    disabledExtensions: ['third-party/VectFox']
  },
  world_info_settings: {
    world_info: {
      globalSelect: ['Story_Ashes']
    },
    world_info_depth: 3,
    world_info_budget: 100,
    world_info_recursive: true
  },
  extension_settings: {
    STMemoryBooks: {
      moduleSettings: {
        autoSummaryEnabled: true,
        sidePromptsEnabled: true,
        summaryEntrySettings: {
          position: 4
        }
      }
    },
    summaryception: {
      enabled: true,
      injectionTemplate: '[Narrative Memory]\\n{{summary}}',
      promptText: 'raw Summaryception text must not persist'
    },
    vectfox: {
      enabled: true,
      vector_backend: 'qdrant',
      qdrant_api_key: 'SECRET-QDRANT',
      summarizer_injection_enabled: true,
      eventbase_ghost_enabled: true,
      collections: {
        secretCollection: {
          text: 'raw vector payload must not persist'
        }
      }
    }
  }
});
writeJsonFile(path.join(externalUserRoot, 'worlds', 'Ashes Memory.json'), {
  entries: {
    1: {
      uid: 1,
      comment: 'Memory One',
      content: 'raw memory text must not persist',
      stmemorybooks: true,
      STMB_start: 0,
      STMB_end: 2
    }
  }
});
writeTextFile(
  path.join(externalChatRoot, 'Directive - Ashes - external.jsonl'),
  `${JSON.stringify({
    chat_metadata: {
      world_info: 'Ashes Memory',
      STMemoryBooks: {
        entryCount: 1,
        sceneStart: 0,
        sceneEnd: 2,
        highestMemoryProcessed: 1
      },
      summaryception: {
        summarizedUpTo: 12,
        layers: [[{ text: 'raw layer text must not persist' }]],
        ghostedIndices: [1, 2, 3]
      }
    }
  })}\n`
);
const externalContextCheck = inspectSillyTavernExternalContextCompatibility({
  users: ['directive-soak-a'],
  dataRoot: externalContextFixtureRoot,
  required: true
});
assert.equal(externalContextCheck.status, 'pass');
const externalEnvironment = externalContextCheck.users[0].externalPromptEnvironment;
assert.equal(externalEnvironment.worldInfo.active, true);
assert.deepEqual(externalEnvironment.worldInfo.activeNames, ['Story_Ashes']);
assert.equal(externalEnvironment.memoryBooks.stMemoryBookEntryCount, 1);
assert.equal(externalEnvironment.memoryBooks.rangeDiagnostics.status, 'stale');
assert.equal(externalEnvironment.memoryBooks.rangeDiagnostics.entryRangeCount, 1);
assert.equal(externalEnvironment.memoryBooks.rangeDiagnostics.chatRangeCount, 1);
assert.equal(externalEnvironment.memoryBooks.riskyModes.autoSummary, true);
assert.equal(externalEnvironment.memoryBooks.riskyModes.sidePrompts, true);
assert.equal(externalEnvironment.summaryception.enabled, true);
assert.equal(externalEnvironment.summaryception.ghostedCount, 3);
assert.equal(externalEnvironment.summaryception.staleness.status, 'stale');
assert.equal(externalEnvironment.vectFox.disabledPresent, true);
assert.equal(externalEnvironment.vectFox.backendType, 'qdrant');
assert.equal(externalEnvironment.vectFox.backendDiagnostics.status, 'disabled');
assert.equal(externalEnvironment.knownExternalPromptKeys.includes('summaryception'), true);
assert.equal(externalEnvironment.knownExternalPromptKeys.includes('3_vectfox_summarizer'), true);
const externalSerialized = JSON.stringify(externalContextCheck);
assert.equal(externalSerialized.includes('SECRET-QDRANT'), false);
assert.equal(externalSerialized.includes('raw memory text'), false);
assert.equal(externalSerialized.includes('raw vector payload'), false);
assert.equal(externalSerialized.includes('raw Summaryception text'), false);
assert.equal(externalEnvironment.redactions.some((entry) => entry.reason === 'secret'), true);
assert.equal(externalEnvironment.redactions.some((entry) => entry.reason === 'raw-payload'), true);

const allVisibleExternalProbe = buildExternalContextBrowserProbe({
  runId: 'probe-all-visible',
  capturedAt: '2026-06-28T12:00:00.000Z',
  baseUrl: 'http://127.0.0.1:8000/?token=SECRET#hash',
  users: ['Directive Soak A', 'directive-soak-a'],
  diskCompatibility: externalContextCheck,
  browserSnapshots: [{
    handle: 'directive-soak-a',
    resolvedBrowserUserHandle: 'directive-soak-a',
    href: 'http://127.0.0.1:8000/?api_key=SECRET#chat',
    contextReady: true,
    currentChatId: 'Directive - Ashes',
    chatLength: 12,
    hostPromptRegistry: {
      available: true,
      promptKeys: ['summaryception', '3_vectfox', '3_vectfox_eventbase', 'worldInfoBefore', 'st_memory_books', 'bad=SECRET']
    },
    worldInfo: {
      settingsSeen: true,
      globalSignatureSeen: true,
      enabled: true,
      activeNames: ['Ashes Memory'],
      settingsHash: 'browser-wi-settings'
    },
    memoryBooks: {
      settingsSeen: true,
      globalSignatureSeen: true,
      installed: true,
      enabled: true,
      activeBookName: 'Ashes Memory',
      entryCount: 1,
      entryHash: 'browser-stmb-entry-hash'
    },
    summaryception: {
      settingsSeen: true,
      globalSignatureSeen: true,
      installed: true,
      enabled: true,
      injectionHash: 'browser-summary-hash'
    },
    vectFox: {
      settingsSeen: true,
      globalSignatureSeen: true,
      installed: true,
      enabled: true,
      backendType: 'qdrant',
      promptKeys: ['3_vectfox_summarizer']
    },
    chatMetadata: {
      worldInfo: 'Ashes Memory',
      summaryception: {
        summarizedUpTo: 8,
        layerCount: 2,
        ghostedCount: 3
      }
    },
    messageMarkerCounts: {
      summaryceptionGhosted: 3,
      memoryBooksHidden: 1,
      vectFoxGhosted: 2
    }
  }]
});
assert.equal(allVisibleExternalProbe.status, 'pass');
assert.equal(allVisibleExternalProbe.baseUrl, 'http://127.0.0.1:8000');
assert.equal(allVisibleExternalProbe.users.length, 1);
assert.equal(allVisibleExternalProbe.users[0].href, 'http://127.0.0.1:8000');
assert.equal(allVisibleExternalProbe.users[0].targets.stLorebooks.status, 'browser-confirmed');
assert.equal(allVisibleExternalProbe.users[0].targets.memoryBooks.status, 'browser-confirmed');
assert.equal(allVisibleExternalProbe.users[0].targets.summaryception.status, 'browser-confirmed');
assert.equal(allVisibleExternalProbe.users[0].targets.vectFox.status, 'browser-confirmed');
assert.equal(allVisibleExternalProbe.fixtureDepth.status, 'pass');
assert.deepEqual(allVisibleExternalProbe.fixtureDepth.missingTargets, []);
assert.deepEqual(allVisibleExternalProbe.fixtureDepth.fullFixtureUserHandles, ['directive-soak-a']);
assert.equal(allVisibleExternalProbe.fixtureDepth.users[0].targets.stLorebooks.level, 'rich-active');
assert.equal(allVisibleExternalProbe.fixtureDepth.users[0].targets.memoryBooks.level, 'rich-active');
assert.equal(allVisibleExternalProbe.fixtureDepth.users[0].targets.summaryception.level, 'rich-active');
assert.equal(allVisibleExternalProbe.fixtureDepth.users[0].targets.vectFox.level, 'rich-active');
assert.equal(allVisibleExternalProbe.users[0].externalPromptEnvironment.memoryBooks.rangeDiagnostics.status, 'stale');
assert.equal(allVisibleExternalProbe.users[0].externalPromptEnvironment.summaryception.staleness.status, 'observed');
assert.equal(allVisibleExternalProbe.users[0].externalPromptEnvironment.vectFox.backendDiagnostics.status, 'external-backend-configured');
assert.equal(allVisibleExternalProbe.fixtureDepth.users[0].targets.memoryBooks.evidence.includes('memory-book-range-stale'), true);
assert.equal(allVisibleExternalProbe.fixtureDepth.users[0].targets.summaryception.evidence.includes('summaryception-staleness-observed'), true);
assert.equal(allVisibleExternalProbe.fixtureDepth.users[0].targets.vectFox.evidence.includes('vectfox-backend-external-backend-configured'), true);
assert.equal(externalContextFixtureDepthCheckStatus({
  live: true,
  fixtureDepth: allVisibleExternalProbe.fixtureDepth,
  fullCertificationRequired: true
}), 'pass');
assert.equal(allVisibleExternalProbe.users[0].hostPromptRegistry.promptKeys.includes('bad=SECRET'), false);
assert.notEqual(allVisibleExternalProbe.users[0].browserEnvironmentHash, allVisibleExternalProbe.users[0].diskEnvironmentHash);
assert.notEqual(allVisibleExternalProbe.users[0].combinedEnvironmentHash, allVisibleExternalProbe.users[0].browserEnvironmentHash);

const unavailableExternalProbe = buildExternalContextBrowserProbe({
  runId: 'probe-unavailable',
  users: ['directive-soak-b'],
  diskCompatibility: { users: [] },
  browserSnapshots: [{
    handle: 'directive-soak-b',
    contextReady: false,
    hostPromptRegistry: { available: false, promptKeys: [] },
    unavailableSignals: ['Extension settings unavailable!!']
  }]
});
assert.equal(unavailableExternalProbe.status, 'warning');
for (const target of Object.values(unavailableExternalProbe.users[0].targets)) {
  assert.equal(target.status, 'unavailable');
}
assert.deepEqual(unavailableExternalProbe.users[0].unavailableSignals, [
  'extension-settings-unavailable',
  'browser-context-unavailable',
  'prompt-registry-unavailable'
]);

const diskBrowserMismatchProbe = buildExternalContextBrowserProbe({
  runId: 'probe-mismatch',
  users: ['directive-soak-a'],
  diskCompatibility: externalContextCheck,
  browserSnapshots: [{
    handle: 'directive-soak-a',
    contextReady: true,
    hostPromptRegistry: { available: true, promptKeys: [] },
    chatMetadata: {},
    messageMarkerCounts: {}
  }]
});
assert.equal(diskBrowserMismatchProbe.status, 'warning');
assert.equal(diskBrowserMismatchProbe.users[0].targets.summaryception.status, 'disk-confirmed');
assert.notEqual(diskBrowserMismatchProbe.users[0].browserEnvironmentHash, diskBrowserMismatchProbe.users[0].combinedEnvironmentHash);

function assertPartialBrowserDiagnosticsFallback(status) {
  const probe = buildExternalContextBrowserProbe({
    runId: `probe-partial-browser-${status}-diagnostics`,
    users: ['directive-soak-a'],
    diskCompatibility: externalContextCheck,
    browserSnapshots: [{
      handle: 'directive-soak-a',
      contextReady: true,
      hostPromptRegistry: { available: true, promptKeys: ['worldInfoBefore', 'st_memory_books', 'summaryception', '3_vectfox'] },
      worldInfo: { settingsSeen: true, enabled: true },
      memoryBooks: {
        rangeDiagnostics: { status, entryRangeCount: 0, chatRangeCount: 0 }
      },
      summaryception: {
        staleness: { status, chatLength: 0 }
      },
      vectFox: {
        backendDiagnostics: { status, backendType: null }
      },
      chatMetadata: {},
      messageMarkerCounts: {
        memoryBooksHidden: 1
      }
    }]
  });
  assert.equal(probe.status, 'pass');
  assert.equal(probe.users[0].targets.memoryBooks.status, 'browser-confirmed');
  assert.equal(probe.users[0].targets.summaryception.status, 'browser-confirmed');
  assert.equal(probe.users[0].targets.vectFox.status, 'browser-confirmed');
  assert.equal(probe.users[0].externalPromptEnvironment.memoryBooks.rangeDiagnostics.status, 'stale');
  assert.equal(probe.users[0].externalPromptEnvironment.summaryception.staleness.status, 'stale');
  assert.equal(probe.users[0].externalPromptEnvironment.vectFox.backendDiagnostics.status, 'disabled');
}

assertPartialBrowserDiagnosticsFallback('unknown');
assertPartialBrowserDiagnosticsFallback('missing');

const missingRichDiagnosticsDepth = summarizeExternalContextFixtureDepth({
  users: [{
    handle: 'directive-soak-a',
    targets: {
      stLorebooks: {
        status: 'browser-confirmed',
        browserSignals: { chatMetadataSeen: true, promptKeySeen: true },
        chatMetadataCounts: { chatBoundWorld: 1 },
        promptKeys: ['worldInfoBefore']
      },
      memoryBooks: {
        status: 'browser-confirmed',
        browserSignals: { promptKeySeen: true, messageMarkerSeen: true },
        chatMetadataCounts: { chatBoundWorld: 1 },
        messageMarkerCounts: { memoryBooksHidden: 1 },
        promptKeys: ['st_memory_books']
      },
      summaryception: {
        status: 'browser-confirmed',
        browserSignals: { promptKeySeen: true, messageMarkerSeen: true },
        chatMetadataCounts: { layerCount: 1, ghostedCount: 1 },
        messageMarkerCounts: { summaryceptionGhosted: 1 },
        promptKeys: ['summaryception']
      },
      vectFox: {
        status: 'browser-confirmed',
        browserSignals: { promptKeySeen: true, settingsSeen: true },
        promptKeys: ['3_vectfox']
      }
    },
    externalPromptEnvironment: {
      worldInfo: { active: true, chatBoundName: 'Directive External Context Fixture' },
      memoryBooks: {
        enabled: true,
        stMemoryBookEntryCount: 1,
        rangeDiagnostics: { status: 'valid', entryRangeCount: 1, chatRangeCount: 1 }
      },
      summaryception: {
        enabled: true,
        promptKeyActive: true,
        layerCount: 1,
        ghostedCount: 1,
        staleness: { status: 'missing', chatLength: 4 }
      },
      vectFox: {
        enabled: true,
        settingsHash: 'v'.repeat(64),
        backendDiagnostics: { status: 'missing', backendType: null }
      }
    }
  }]
});
assert.equal(missingRichDiagnosticsDepth.status, 'warning');
assert.deepEqual(missingRichDiagnosticsDepth.missingTargets, ['summaryception', 'vectFox']);
assert.equal(missingRichDiagnosticsDepth.users[0].targets.summaryception.level, 'browser-observed');
assert.equal(missingRichDiagnosticsDepth.users[0].targets.vectFox.level, 'browser-observed');

const readinessProbeShapeDepth = summarizeExternalContextFixtureDepth({
  users: [{
    handle: 'directive-soak-a',
    status: 'pass',
    targets: {
      stLorebooks: {
        status: 'browser-confirmed',
        browserSignals: { globalSignatureSeen: true },
        promptKeys: []
      },
      memoryBooks: {
        status: 'browser-confirmed',
        browserSignals: { settingsSeen: true },
        promptKeys: ['1_memory']
      },
      summaryception: {
        status: 'browser-confirmed',
        browserSignals: { settingsSeen: true },
        chatMetadataCounts: { layerCount: 1 },
        promptKeys: []
      },
      vectFox: {
        status: 'browser-confirmed',
        browserSignals: { settingsSeen: true },
        promptKeys: []
      }
    },
    externalPromptEnvironment: {
      knownExternalPromptKeys: ['1_memory', 'summaryception', '3_vectfox', '3_vectfox_eventbase'],
      worldInfo: {
        installed: true,
        enabled: true,
        active: true,
        chatBoundName: 'Directive External Context Fixture',
        settingsHash: 'w'.repeat(64)
      },
      memoryBooks: {
        enabled: true,
        stMemoryBookEntryCount: 1,
        rangeDiagnostics: { status: 'valid', entryRangeCount: 1, chatRangeCount: 1 }
      },
      summaryception: {
        enabled: true,
        promptKeyActive: true,
        layerCount: 1,
        staleness: { status: 'observed', chatLength: 5 }
      },
      vectFox: {
        enabled: true,
        promptKeys: ['3_vectfox', '3_vectfox_eventbase'],
        backendType: 'qdrant',
        semanticWorldInfoEnabled: true,
        generationInterceptorActive: true,
        backendDiagnostics: { status: 'external-backend-configured', backendType: 'qdrant' }
      }
    }
  }]
});
assert.equal(readinessProbeShapeDepth.status, 'pass');
assert.deepEqual(readinessProbeShapeDepth.missingTargets, []);
assert.deepEqual(readinessProbeShapeDepth.fullFixtureUserHandles, ['directive-soak-a']);
assert.equal(readinessProbeShapeDepth.users[0].targets.stLorebooks.evidence.includes('world-info-settings'), true);
assert.equal(readinessProbeShapeDepth.users[0].targets.vectFox.evidence.includes('vectfox-prompt-key'), true);

const memoryBooksMetadataDepth = summarizeExternalContextFixtureDepth({
  users: [{
    handle: 'directive-soak-e',
    status: 'pass',
    targets: {
      memoryBooks: {
        status: 'browser-confirmed',
        browserSignals: { settingsSeen: true },
        promptKeys: []
      }
    },
    externalPromptEnvironment: {
      memoryBooks: {
        enabled: true,
        activeBookName: 'Directive External Context Fixture',
        stMemoryBookEntryCount: 1,
        stMemoryBookEntryHash: 'm'.repeat(64),
        rangeDiagnostics: { status: 'valid', entryRangeCount: 1, chatRangeCount: 10 }
      }
    }
  }]
});
assert.equal(memoryBooksMetadataDepth.users[0].targets.memoryBooks.rich, true);
assert.equal(memoryBooksMetadataDepth.users[0].targets.memoryBooks.evidence.includes('memory-book-metadata'), true);
assert.equal(memoryBooksMetadataDepth.users[0].targets.memoryBooks.evidence.includes('memory-book-range-valid'), true);

const vectFoxSettingsOnlyProbe = buildExternalContextBrowserProbe({
  runId: 'probe-vectfox-settings-only-no-hybrid-backend',
  users: ['directive-soak-a'],
  diskCompatibility: externalContextCheck,
  browserSnapshots: [{
    handle: 'directive-soak-a',
    contextReady: true,
    hostPromptRegistry: { available: true, promptKeys: [] },
    vectFox: { settingsSeen: true },
    chatMetadata: {},
    messageMarkerCounts: {}
  }]
});
assert.equal(vectFoxSettingsOnlyProbe.users[0].targets.vectFox.status, 'browser-confirmed');
assert.equal(vectFoxSettingsOnlyProbe.users[0].externalPromptEnvironment.vectFox.backendDiagnostics.status, 'observed');
assert.notEqual(vectFoxSettingsOnlyProbe.users[0].externalPromptEnvironment.vectFox.backendDiagnostics.status, 'external-backend-configured');

const strictMismatchProbe = buildExternalContextBrowserProbe({
  runId: 'probe-mismatch-required',
  required: true,
  users: ['directive-soak-a'],
  diskCompatibility: externalContextCheck,
  browserSnapshots: [{
    handle: 'directive-soak-a',
    contextReady: true,
    hostPromptRegistry: { available: true, promptKeys: [] }
  }]
});
assert.equal(strictMismatchProbe.status, 'fail');

const disabledVectFoxProbe = buildExternalContextBrowserProbe({
  runId: 'probe-disabled-vectfox',
  users: ['directive-soak-a'],
  diskCompatibility: externalContextCheck,
  browserSnapshots: [{
    handle: 'directive-soak-a',
    contextReady: true,
    hostPromptRegistry: { available: true, promptKeys: ['summaryception', 'worldInfoBefore', 'st_memory_books'] },
    worldInfo: { settingsSeen: true, enabled: true },
    memoryBooks: { settingsSeen: true, installed: true, enabled: true },
    summaryception: { settingsSeen: true, installed: true, enabled: true },
    vectFox: { disabledPresent: true },
    chatMetadata: {
      worldInfo: 'Ashes Memory',
      summaryception: {
        layerCount: 2,
        ghostedCount: 3
      }
    },
    messageMarkerCounts: {
      memoryBooksHidden: 1,
      summaryceptionGhosted: 3
    }
  }]
});
assert.equal(disabledVectFoxProbe.users[0].targets.vectFox.status, 'disabled');
assert.equal(disabledVectFoxProbe.fixtureDepth.status, 'warning');
assert.deepEqual(disabledVectFoxProbe.fixtureDepth.missingTargets, ['vectFox']);
assert.equal(disabledVectFoxProbe.fixtureDepth.users[0].targets.vectFox.level, 'inactive');
assert.equal(externalContextFixtureDepthCheckStatus({
  live: true,
  turnLimit: '2',
  fixtureDepth: disabledVectFoxProbe.fixtureDepth
}), 'warning');
assert.equal(externalContextFixtureDepthCheckStatus({
  live: true,
  fixtureDepth: disabledVectFoxProbe.fixtureDepth,
  fullCertificationRequired: true
}), 'fail');

const redactionCanaryProbe = buildExternalContextBrowserProbe({
  runId: 'probe-redaction-canary',
  baseUrl: 'http://127.0.0.1:8000/?qdrant_api_key=SECRET-QDRANT#secret',
  users: ['directive-soak-c'],
  diskCompatibility: { users: [] },
  browserSnapshots: [{
    handle: 'directive-soak-c',
    href: 'http://127.0.0.1:8000/?token=SECRET-TOKEN#frag',
    contextReady: true,
    hostPromptRegistry: {
      available: true,
      promptKeys: ['summaryception', '3_vectfox', 'raw prompt body should disappear']
    },
    summaryception: {
      installed: true,
      enabled: true,
      settingsSeen: true,
      promptText: 'raw Summaryception text must not persist'
    },
    vectFox: {
      installed: true,
      enabled: true,
      settingsSeen: true,
      qdrant_api_key: 'SECRET-QDRANT',
      vectorPayload: { text: 'raw vector payload must not persist' }
    }
  }]
});
const redactionProbeSerialized = JSON.stringify(redactionCanaryProbe);
assert.equal(redactionProbeSerialized.includes('SECRET-QDRANT'), false);
assert.equal(redactionProbeSerialized.includes('SECRET-TOKEN'), false);
assert.equal(redactionProbeSerialized.includes('raw vector payload'), false);
assert.equal(redactionProbeSerialized.includes('raw Summaryception text'), false);
assert.equal(redactionProbeSerialized.includes('raw prompt body'), false);
assert.equal(redactionCanaryProbe.users[0].redactions.some((entry) => entry.reason === 'secret'), true);
assert.equal(redactionCanaryProbe.users[0].redactions.some((entry) => entry.reason === 'raw-payload'), true);

const soakRunnerSource = fs.readFileSync(path.resolve('tools/scripts/soak-sillytavern-campaign-live.mjs'), 'utf8');
assert.match(soakRunnerSource, /ensureDirectory,/);
assert.match(soakRunnerSource, /ensureDirectory\(smokeArtifactDir\)/);
assert.match(soakRunnerSource, /DIRECTIVE_SILLYTAVERN_PROMPT_INSPECTION_DIR/);
assert.match(soakRunnerSource, /DIRECTIVE_SILLYTAVERN_BROWSER_TIMEOUT_MS/);
assert.match(soakRunnerSource, /DIRECTIVE_SILLYTAVERN_UI_BOOT_TIMEOUT_MS/);
assert.match(soakRunnerSource, /DIRECTIVE_SILLYTAVERN_FACT_REVIEW_ONLY/);
assert.match(soakRunnerSource, /invokeModelAssistedFactualReview/);
const liveSmokeSource = fs.readFileSync(path.resolve('tools/scripts/smoke-sillytavern-live.mjs'), 'utf8');
const generationTimingPolicySource = fs.readFileSync(path.resolve('tools/scripts/lib/generation-timing-proof-policy.mjs'), 'utf8');
assert.match(liveSmokeSource, /UI_BOOT_TIMEOUT_MS/);
assert.match(liveSmokeSource, /directiveExtensionControlSnapshot/);
assert.match(liveSmokeSource, /uiBootTimeoutMs/);
assert.match(liveSmokeSource, /discoveryProbe/);
assert.match(liveSmokeSource, /manifestProbe/);
assert.match(liveSmokeSource, /scriptProbe/);
assert.match(liveSmokeSource, /pageConsoleMessages/);
assert.match(liveSmokeSource, /visibleDirectiveProgress/);
assert.match(liveSmokeSource, /visible-directive-chat-response/);
assert.match(liveSmokeSource, /sidecar-not-expected-before-committed-or-complete-turn/);
assert.match(liveSmokeSource, /PROMPT_INSPECTION_DIR/);
assert.match(liveSmokeSource, /capturePromptInspectionSnapshot/);
assert.match(liveSmokeSource, /externalPromptEnvironmentRef/);
assert.match(liveSmokeSource, /knownExternalPromptKeys/);
assert.match(liveSmokeSource, /directiveOwnedPromptKeys/);
assert.match(liveSmokeSource, /finalHostPromptMayIncludeExternal/);
assert.match(liveSmokeSource, /snapshotSourceChatTranscript/);
assert.match(liveSmokeSource, /runFactualGroundingReviewOnly/);
assert.match(liveSmokeSource, /DIRECTIVE_SILLYTAVERN_FACT_REVIEW_REQUEST_PATH/);
assert.match(liveSmokeSource, /runStoryQualityReviewOnly/);
assert.match(liveSmokeSource, /DIRECTIVE_SILLYTAVERN_STORY_QUALITY_REVIEW_REQUEST_PATH/);
assert.match(liveSmokeSource, /capturePersistedGenerationTimingProof/);
assert.match(liveSmokeSource, /capturePersistedHostNativeCompletionProof/);
assert.match(liveSmokeSource, /HOST_NATIVE_COMPLETION_PROOF_TIMEOUT_MS/);
assert.match(liveSmokeSource, /waitForPersistedHostNativeCompletionProof/);
assert.match(liveSmokeSource, /waitedForCompletionProof/);
assert.match(liveSmokeSource, /reobserveHostGenerationCompletions/);
assert.match(liveSmokeSource, /refreshResult/);
assert.match(liveSmokeSource, /recentWindowAfterPlayer/);
assert.match(liveSmokeSource, /recentTail/);
assert.match(liveSmokeSource, /generationTimingProof/);
assert.match(liveSmokeSource, /hostNativeCompletionProof/);
assert.match(liveSmokeSource, /readCoreStoreProjectionsV2/);
assert.match(liveSmokeSource, /generationTimingProofFromCoreProjections/);
assert.match(liveSmokeSource, /hostNativeCompletionProofFromCoreProjections/);
assert.match(liveSmokeSource, /hostNativeCompletionRequirementProof/);
assert.match(liveSmokeSource, /hostNativeCompletionRequired/);
assert.match(liveSmokeSource, /turn: Number\.isFinite\(turn\) && turn > 0 \? turn : null/);
assert.match(liveSmokeSource, /turn: message\.turn/);
assert.match(liveSmokeSource, /Required host-native completion proof was not recorded/);
assert.match(liveSmokeSource, /createBrowserLogicalStorageAdapter/);
assert.match(liveSmokeSource, /timingSource: 'coreProjection'/);
assert.match(liveSmokeSource, /completionSource: 'coreProjection'/);
assert.match(liveSmokeSource, /runtimeSnapshotAvailable/);
assert.match(liveSmokeSource, /generationTimingProofSource/);
assert.match(liveSmokeSource, /generationTimingProofTimingSource/);
assert.match(liveSmokeSource, /hostNativeCompletionProofSource/);
assert.match(liveSmokeSource, /hostNativeCompletionProofCompletionSource/);
assert.match(liveSmokeSource, /generationTimingSkippedTurns/);
assert.match(liveSmokeSource, /timingProofEntryRequiresGenerationStart/);
assert.match(liveSmokeSource, /timingProofEntryIsNonGenerated/);
assert.match(liveSmokeSource, /skippedEntries/);
assert.match(liveSmokeSource, /skippedTurnCount/);
assert.match(liveSmokeSource, /skipped-non-generation/);
assert.match(liveSmokeSource, /safeModelCallMetadata/);
assert.match(liveSmokeSource, /requestHash: entry\.requestHash \|\| entry\.metadata\?\.requestHash/);
assert.match(liveSmokeSource, /fallbackAdvisoryHash/);
assert.match(liveSmokeSource, /lastGoodProjectionHash/);
assert.match(liveSmokeSource, /mayInjectPrompt/);
assert.match(generationTimingPolicySource, /DIRECTIVE_GENERATED_TIMING_RESPONSE_KINDS/);
assert.match(generationTimingPolicySource, /DIRECTIVE_NON_GENERATED_TIMING_RESPONSE_KINDS/);
assert.match(generationTimingPolicySource, /committedOutcome/);
assert.match(generationTimingPolicySource, /clarificationNeeded/);
assert.match(generationTimingPolicySource, /generationTimingProofStatus/);
assert.doesNotMatch(liveSmokeSource, /Directive save payload for generation timing proof/);
assert.doesNotMatch(liveSmokeSource, /runtimeTracking\.responseLedger\s*\|\|\s*\[\]/);
assert.doesNotMatch(liveSmokeSource, /runtimeTracking\.ingressLedger\s*\|\|\s*\[\]/);
assert.match(soakRunnerSource, /live-generation-start-timing/);
assert.match(soakRunnerSource, /liveGenerationTimingAssessment/);
assert.match(soakRunnerSource, /live-host-native-completion-proof/);
assert.match(soakRunnerSource, /liveHostNativeCompletionAssessment/);
assert.match(soakRunnerSource, /live-model-call-failure-policy/);
assert.match(soakRunnerSource, /summarizeModelCallFailurePolicy/);
assert.match(soakRunnerSource, /failurePolicyEvidence/);
const multiUserReadinessSource = fs.readFileSync(path.resolve('tools/scripts/check-sillytavern-multi-user-soak-readiness.mjs'), 'utf8');
assert.match(multiUserReadinessSource, /DIRECTIVE_ALLOW_PLACEHOLDER_SOAK_USERS/);
assert.match(multiUserReadinessSource, /Live execution requires explicit DIRECTIVE_SOAK_ST_USERS/);
assert.match(multiUserReadinessSource, /buildExternalContextBrowserProbe/);
assert.match(multiUserReadinessSource, /captureExternalContextBrowserSnapshot/);
assert.match(multiUserReadinessSource, /waitForExternalContextBrowserSnapshot/);
assert.match(multiUserReadinessSource, /readinessProbeStatus/);
assert.match(multiUserReadinessSource, /host-extension-browser-context/);
assert.match(multiUserReadinessSource, /external-context-probe\.json/);
assert.match(multiUserReadinessSource, /live-host-extension-browser-context/);
assert.match(multiUserReadinessSource, /host-extension-fixture-depth/);
assert.match(multiUserReadinessSource, /DIRECTIVE_SOAK_REQUIRE_EXTERNAL_CONTEXT_FIXTURE_DEPTH/);

const schema = readJsonFile('schemas/testing/live-campaign-soak-report.schema.json');
assert.equal(schema.properties.modelCallPolicy.properties.budget.const, 'unlimited');
assert.equal(schema.properties.modelCallPolicy.required.includes('failurePolicyEvidence'), true);
assert.equal(schema.properties.modelCallPolicy.properties.failurePolicyEvidence.oneOf[0].type, 'null');
assert.equal(schema.properties.modelCallPolicy.properties.failurePolicyEvidence.oneOf[1].properties.status.enum.includes('fail'), true);
assert.equal(schema.properties.modelCallPolicy.properties.failurePolicyEvidence.oneOf[1].properties.releaseBlockingCalls.type, 'array');
assert.equal(schema.required.includes('releaseCertificationSummary'), true);
assert.equal(schema.properties.releaseCertificationSummary.properties.state.enum.includes('certified'), true);
assert.equal(schema.properties.releaseCertificationSummary.properties.evidenceGates.items.properties.status.enum.includes('planned'), true);
assert.equal(schema.properties.strictModePolicy.properties.enabled.type, 'boolean');
assert.equal(schema.properties.strictModePolicy.properties.warningStatus.enum.includes('fail'), true);
assert.equal(schema.properties.driverPolicy.properties.primary.const, 'playwright');
assert.equal(schema.properties.driverPolicy.properties.fallbackEvidenceIsEquivalent.const, false);
assert.equal(schema.properties.liveLogPolicy.properties.artifact.const, 'live-log.jsonl');
assert.equal(schema.required.includes('checkpointArtifactPolicy'), true);
assert.equal(schema.properties.artifacts.required.includes('snapshots'), true);
assert.equal(schema.properties.artifacts.required.includes('promptInspection'), true);
assert.equal(schema.properties.artifacts.required.includes('hostExtensions'), true);
assert.equal(schema.properties.artifacts.required.includes('externalContextSummary'), true);
assert.equal(schema.properties.checkpointArtifactPolicy.properties.artifactDirectory.const, 'snapshots');
assert.equal(schema.properties.checkpointArtifactPolicy.properties.liveLogRecord.const, 'checkpoint');
assert.equal(schema.properties.turnSettlementPolicy.properties.required.const, true);
assert.equal(schema.properties.readableTranscriptPolicy.properties.required.const, true);
assert.equal(schema.properties.playerInputPolicy.properties.required.const, true);
assert.equal(schema.properties.storyQualityPolicy.properties.required.const, true);
assert.equal(schema.properties.storyQualityPolicy.properties.artifactDirectory.const, 'quality-review');
assert.equal(schema.properties.storyQualityPolicy.properties.liveLogRecord.const, 'quality-score');
assert.equal(schema.properties.storyQualityPolicy.required.includes('scoreDefinitions'), true);
assert.equal(schema.properties.storyQualityPolicy.required.includes('passCriteria'), true);
assert.equal(schema.properties.storyQualityPolicy.properties.manualReviewTemplateArtifact.const, 'quality-review/manual-review-template.json');
assert.equal(schema.properties.storyQualityPolicy.properties.manualReviewImportArtifact.const, 'quality-review/manual-review-import.jsonl');
assert.equal(schema.properties.storyQualityPolicy.properties.modelReviewRequestArtifact.const, 'quality-review/model-assisted-review/request.json');
assert.equal(schema.properties.storyQualityPolicy.properties.modelReviewResultArtifact.const, 'quality-review/model-assisted-review/result.json');
assert.equal(schema.properties.sceneHandshakePolicy.properties.required.const, true);
assert.equal(schema.properties.sceneHandshakePolicy.properties.intervalLogRecord.const, 'scene-handshake-settlement');
assert.equal(schema.properties.sceneHandshakePolicy.required.includes('allowedRoots'), true);
assert.equal(schema.properties.timekeepingPolicy.properties.required.const, true);
assert.equal(schema.properties.timekeepingPolicy.properties.artifactDirectory.const, 'timekeeping');
assert.equal(schema.properties.timekeepingPolicy.properties.intervalLogRecord.const, 'timekeeping-header-check');
assert.equal(schema.properties.objectiveAssignmentProjectionPolicy.properties.required.const, true);
assert.equal(schema.properties.objectiveAssignmentProjectionPolicy.properties.artifactDirectory.const, 'objective-assignments');
assert.equal(schema.properties.objectiveAssignmentProjectionPolicy.properties.liveLogRecord.const, 'objective-assignment-projection-check');
assert.equal(schema.properties.objectiveAssignmentProjectionPolicy.required.includes('requiredSurfaces'), true);
assert.equal(schema.properties.objectiveAssignmentProjectionPolicy.required.includes('packIndexArtifact'), false);
assert.equal(schema.properties.objectiveAssignmentProjectionPolicy.required.includes('modelReviewRequestArtifact'), false);
assert.equal(schema.properties.objectiveAssignmentProjectionPolicy.required.includes('modelReviewResultArtifact'), false);
assert.equal(schema.properties.factualGroundingPolicy.properties.required.const, true);
assert.equal(schema.properties.factualGroundingPolicy.properties.artifactDirectory.const, 'fact-checks');
assert.equal(schema.properties.factualGroundingPolicy.properties.packIndexArtifact.const, 'fact-checks/canary-index.json');
assert.equal(schema.properties.factualGroundingPolicy.properties.modelReviewRequestArtifact.const, 'fact-checks/model-assisted-review/request.json');
assert.equal(schema.properties.factualGroundingPolicy.properties.modelReviewResultArtifact.const, 'fact-checks/model-assisted-review/result.json');
assert.equal(schema.properties.factualGroundingPolicy.properties.liveLogRecord.const, 'fact-check');
assert.equal(schema.properties.factualGroundingPolicy.required.includes('packIndexArtifact'), true);
assert.equal(schema.properties.factualGroundingPolicy.required.includes('modelReviewRequestArtifact'), true);
assert.equal(schema.properties.factualGroundingPolicy.required.includes('modelReviewResultArtifact'), true);
assert.equal(schema.properties.factualGroundingPolicy.required.includes('rootCauseLabels'), true);
assert.equal(schema.properties.factualGroundingPolicy.required.includes('generationAuditLevels'), true);
assert.equal(schema.properties.factualGroundingPolicy.required.includes('diagnosticFields'), true);
assert.equal(schema.properties.factualGroundingPolicy.required.includes('lanePausePolicy'), true);
assert.equal(schema.properties.continuityProjectionMatrixPolicy.properties.required.const, true);
assert.equal(schema.properties.continuityProjectionMatrixPolicy.properties.artifactDirectory.const, 'continuity-projection-matrix');
assert.equal(schema.properties.continuityProjectionMatrixPolicy.properties.coordinatorScript.const, 'tools/scripts/run-continuity-matrix-five-user-soak.mjs');
assert.equal(schema.properties.continuityProjectionMatrixPolicy.properties.liveLogRecord.const, 'continuity-projection-check');
assert.equal(schema.properties.continuityProjectionMatrixPolicy.properties.intervalTurns.const, '5-10');
assert.equal(schema.properties.continuityProjectionMatrixPolicy.required.includes('requiredPromptKeys'), true);
assert.equal(schema.properties.continuityProjectionMatrixPolicy.required.includes('requiredSourceIds'), true);
assert.equal(schema.properties.continuityProjectionMatrixPolicy.required.includes('modelRoles'), true);
assert.equal(schema.properties.commandBearingSystemPolicy.properties.required.const, true);
assert.equal(schema.properties.commandBearingSystemPolicy.properties.intervalLogRecord.const, 'command-bearing-interval');
assert.equal(schema.properties.commandBearingSystemPolicy.properties.ownerLane.const, 'ashes-command-bearing-endings');
assert.equal(schema.properties.commandBearingSystemPolicy.required.includes('certificationGates'), true);
assert.equal(schema.properties.commandBearingSystemPolicy.required.includes('boundaryDetectionLadder'), true);
assert.equal(schema.properties.artifacts.required.includes('liveLog'), true);
assert.equal(schema.properties.artifacts.required.includes('readableTranscript'), true);
assert.equal(schema.properties.artifacts.required.includes('sourceChatTranscript'), true);
assert.equal(schema.properties.artifacts.required.includes('factChecks'), true);
assert.equal(schema.properties.artifacts.required.includes('factCanaryIndex'), true);
assert.equal(schema.properties.artifacts.required.includes('campaignMatrix'), true);
assert.equal(schema.properties.artifacts.required.includes('continuityProjectionMatrix'), true);
assert.equal(schema.properties.artifacts.required.includes('qualityReview'), true);
assert.equal(schema.required.includes('campaignMatrixCanaries'), true);
assert.equal(schema.required.includes('storyQualityPolicy'), true);
assert.equal(schema.required.includes('continuityProjectionMatrixPolicy'), true);
assert.equal(schema.properties.campaignMatrix.items.$ref, '#/$defs/campaignMatrixEntry');
assert.equal(schema.properties.campaignMatrixCanaries.items.$ref, '#/$defs/campaignMatrixCanaryScript');
assert.equal(schema.properties.factualCanaryPacks.items.$ref, '#/$defs/factualCanaryPack');
assert.equal(schema.properties.commandConductScenarios.items.$ref, '#/$defs/commandConductScenario');
assert.equal(schema.properties.endConditionScenarios.items.$ref, '#/$defs/endConditionScenario');
assert.equal(schema.properties.releaseCertificationSummary.properties.evidenceCounts.required.includes('campaignMatrixCanaries'), true);
assert.equal(schema.properties.releaseCertificationSummary.properties.evidenceCounts.required.includes('campaignMatrixCanaryTurns'), true);
assert.equal(schema.properties.releaseCertificationSummary.properties.evidenceCounts.required.includes('storyQualityDimensions'), true);

assert.equal(SOAK_LIVE_LOG_POLICY.appendOnly, true);
assert.equal(SOAK_LIVE_LOG_POLICY.flushAfterEveryRecord, true);
assert.equal(SOAK_LIVE_LOG_POLICY.partialRunProofRequired, true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('operator-stop'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('failure'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('parallel-user'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('patch-lane'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('extension-sync-barrier'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('triage-finding'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('fix-deferred'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('fix-barrier'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('transcript-capture'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('prompt-inspection-capture'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('fact-check'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('continuity-projection-check'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('campaign-matrix-check'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('model-assisted-factual-review'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('model-assisted-story-quality-review'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('objective-assignment-projection-check'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('scene-handshake-settlement'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('timekeeping-header-check'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('command-bearing-evidence'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('command-bearing-closure'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('command-bearing-review'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('command-bearing-spend'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('command-bearing-abuse-check'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('crew-surface-check'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('mission-surface-check'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('relationship-delta-check'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('misconduct-probe'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('discipline-escalation'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('conduct-recovery'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('command-bearing-interval'), true);
assert.equal(SOAK_TURN_SETTLEMENT_POLICY.required, true);
assert.deepEqual(SOAK_TURN_SETTLEMENT_POLICY.nonTerminalIngressStatuses, ['classifying', 'classified']);
assert.match(SOAK_TURN_SETTLEMENT_POLICY.nextTurnGate, /must not send the next scripted player message/);
assert.match(SOAK_TURN_SETTLEMENT_POLICY.failurePolicy, /P1 turn-settlement failure/);
assert.match(SOAK_TURN_SETTLEMENT_POLICY.failurePolicy, /delegated hostGeneration continuation/);
assert(SOAK_TURN_SETTLEMENT_POLICY.acceptedTurnEvidence.includes('committed-ingress-with-turnId-outcomeId-responseMessageId-and-response-ledger-entry'));
assert(SOAK_TURN_SETTLEMENT_POLICY.acceptedTurnEvidence.includes('committed-injectAndContinue-routine-or-no-change-with-delegated-hostGeneration-response-ledger-entry-and-assistant-continuation'));
assert(SOAK_TURN_SETTLEMENT_POLICY.acceptedTurnEvidence.includes('recoveryRequired-ingress-with-chatTurnProcessingFailure-record-and-lane-paused'));
assert.equal(SOAK_READABLE_TRANSCRIPT_POLICY.required, true);
assert.equal(SOAK_READABLE_TRANSCRIPT_POLICY.readableArtifact, 'transcript/readable-chat.md');
assert.equal(SOAK_PLAYER_INPUT_POLICY.required, true);
assert.match(SOAK_PLAYER_INPUT_POLICY.style, /roleplay prose/);
assert.equal(SOAK_PLAYER_INPUT_POLICY.defaultPerspective, 'third-person');
assert.match(SOAK_PLAYER_INPUT_POLICY.firstPersonExceptionPolicy, /must not count/);
assert.match(SOAK_PLAYER_INPUT_POLICY.narrationDetectionPolicy, /declared perspective/);
assert.match(SOAK_PLAYER_INPUT_POLICY.narrationDetectionPolicy, /quoted character speech/);
assert(SOAK_PLAYER_INPUT_POLICY.qualityDimensions.includes('third-person perspective compliance'));
assert(SOAK_PLAYER_INPUT_POLICY.qualityDimensions.includes('dialogue quality'));
assert.equal(SOAK_STORY_QUALITY_POLICY.required, true);
assert.equal(SOAK_STORY_QUALITY_POLICY.artifactDirectory, 'quality-review');
assert.equal(SOAK_STORY_QUALITY_POLICY.scoreArtifact, 'quality-review/scores.jsonl');
assert.equal(SOAK_STORY_QUALITY_POLICY.manualReviewTemplateArtifact, 'quality-review/manual-review-template.json');
assert.equal(SOAK_STORY_QUALITY_POLICY.manualReviewImportArtifact, 'quality-review/manual-review-import.jsonl');
assert.equal(SOAK_STORY_QUALITY_POLICY.modelReviewRequestArtifact, 'quality-review/model-assisted-review/request.json');
assert.equal(SOAK_STORY_QUALITY_POLICY.modelReviewResultArtifact, 'quality-review/model-assisted-review/result.json');
assert.equal(SOAK_STORY_QUALITY_POLICY.liveLogRecord, 'quality-score');
assert.equal(SOAK_STORY_QUALITY_POLICY.scoreDefinitions.length, 4);
assert(SOAK_STORY_QUALITY_POLICY.scoreDefinitions.some((entry) => entry.score === 0 && /unsafe-or-wrong/.test(entry.label)));
assert(SOAK_STORY_QUALITY_POLICY.scoreDefinitions.some((entry) => entry.score === 3 && /excellent/.test(entry.label)));
assert(SOAK_STORY_QUALITY_POLICY.dimensions.includes('player-input-prose-quality'));
assert(SOAK_STORY_QUALITY_POLICY.dimensions.includes('npc-agency'));
assert(SOAK_STORY_QUALITY_POLICY.dimensions.includes('prompt-context-freshness'));
assert.equal(SOAK_STORY_QUALITY_POLICY.passCriteria.noScoreZero, true);
assert.equal(SOAK_STORY_QUALITY_POLICY.passCriteria.releaseCandidateMinimumAverage, 2);
assert.equal(SOAK_STORY_QUALITY_POLICY.passCriteria.preferredPerspective, 'third-person');
assert.match(SOAK_STORY_QUALITY_POLICY.hiddenStatePolicy, /player-visible transcript/);
const strongQualityScore = buildStoryQualityScoreRecord({
  runId: 'prep-test',
  phaseId: 'clean-play-opening',
  turn: 1,
  messageId: 'mes-001',
  messageIndex: 1,
  role: 'assistant',
  transcriptPointer: 'transcript/readable-chat.md#mes-001',
  reviewerMode: 'manual-review',
  dimensionScores: {
    continuity: { score: 3, rationale: 'keeps the transfer scene aligned' },
    'npc-agency': { score: 2, rationale: 'Bronn answers without being puppeted' },
    'mission-pressure': 2,
    'hidden-truth-safety': 3
  },
  rationale: 'Strong opening response without overreach.'
});
assert.equal(strongQualityScore.kind, 'directive.liveCampaignSoak.storyQualityScore');
assert.equal(strongQualityScore.status, 'pass');
assert.equal(strongQualityScore.overallScore, 2.5);
assert.equal(strongQualityScore.scoreZeroCount, 0);
assert.equal(strongQualityScore.dimensions.length, SOAK_STORY_QUALITY_POLICY.dimensions.length);
assert.equal(strongQualityScore.dimensions.find((entry) => entry.dimension === 'continuity').score, 3);
assert.equal(typeof strongQualityScore.hash, 'string');
const failingQualityScore = buildStoryQualityScoreRecord({
  runId: 'prep-test',
  phaseId: 'clean-play-opening',
  messageId: 'mes-002',
  reviewerMode: 'deterministic-sanity-check',
  dimensionScores: {
    'hidden-truth-safety': { score: 0, rationale: 'leaks hidden state' },
    continuity: 2
  }
});
assert.equal(failingQualityScore.status, 'fail');
assert.equal(failingQualityScore.scoreZeroCount, 1);
assert.match(failingQualityScore.severity, /P1/);
const qualitySummaryFixture = buildStoryQualityPhaseSummary({ scores: [strongQualityScore, failingQualityScore] });
assert.equal(qualitySummaryFixture.kind, 'directive.liveCampaignSoak.storyQualityPhaseSummary');
assert.equal(qualitySummaryFixture.status, 'fail');
assert.equal(qualitySummaryFixture.recordCount, 2);
assert.equal(qualitySummaryFixture.scoreZeroCount, 1);
assert.equal(qualitySummaryFixture.manualReviewTemplateArtifact, 'quality-review/manual-review-template.json');
assert.equal(qualitySummaryFixture.manualReviewImportArtifact, 'quality-review/manual-review-import.jsonl');
assert.equal(qualitySummaryFixture.modelReviewRequestArtifact, 'quality-review/model-assisted-review/request.json');
assert.equal(qualitySummaryFixture.modelReviewResultArtifact, 'quality-review/model-assisted-review/result.json');
const storyQualityModelRequest = buildStoryQualityModelReviewRequest({
  report: { runId: 'prep-test', storyQualityPolicy: SOAK_STORY_QUALITY_POLICY },
  transcriptMessages: [
    { index: 0, isUser: true, text: 'Commander Arlen asks Bronn for the handoff in third person.' },
    { index: 1, isUser: false, directiveOwned: true, text: 'Bronn answers with the correct chain of command.' }
  ],
  deterministicScores: [strongQualityScore, failingQualityScore]
});
assert.equal(storyQualityModelRequest.kind, 'directive.liveCampaignSoak.storyQualityModelReviewRequest');
assert.equal(storyQualityModelRequest.transcript.length, 2);
assert.equal(storyQualityModelRequest.deterministicScores.length, 2);
assert.equal(typeof storyQualityModelRequest.inputHash, 'string');
assert.doesNotMatch(JSON.stringify(storyQualityModelRequest), /rawPrompt|csrfToken|apiKey/);
const storyQualityModelResult = buildStoryQualityModelReviewResult({
  request: storyQualityModelRequest,
  modelOutput: JSON.stringify({
    status: 'warning',
    overallAssessment: 'Readable transcript, but one reply needs continuity review.',
    scores: [{
      messageId: 'mes-002',
      messageIndex: 1,
      role: 'directive',
      overallScore: 1,
      severity: 'P2 story-quality warning',
      rationale: 'Continuity is weak.',
      confidence: 0.8,
      dimensions: [
        { dimension: 'continuity', score: 1, rationale: 'Weak continuity.', evidence: 'reply text' },
        { dimension: 'hidden-truth-safety', score: 2, rationale: 'No leak.', evidence: 'reply text' }
      ]
    }]
  }),
  modelCall: { roleId: 'storyQualityReviewer', status: 'ok' }
});
assert.equal(storyQualityModelResult.kind, 'directive.liveCampaignSoak.storyQualityModelReviewResult');
assert.equal(storyQualityModelResult.status, 'warning');
assert.equal(storyQualityModelResult.counts.scores, 1);
assert.equal(storyQualityModelResult.counts.warningOrWeak, 1);
assert.equal(storyQualityModelResult.modelCall.roleId, 'storyQualityReviewer');
const storyQualityPlaceholderResult = buildStoryQualityModelReviewResult({
  request: storyQualityModelRequest,
  status: 'not-run',
  reason: 'model-assisted story quality review request was prepared; live provider invocation is not complete yet'
});
assert.equal(storyQualityPlaceholderResult.status, 'not-run');
assert.match(storyQualityPlaceholderResult.reason, /not complete yet/);
const storyQualityUnparseableAttempt = buildStoryQualityModelReviewResult({
  request: storyQualityModelRequest,
  modelOutput: 'not strict json',
  modelCall: { roleId: 'storyQualityReviewer', status: 'ok', ok: true }
});
assert.equal(storyQualityUnparseableAttempt.status, 'fail');
assert.match(storyQualityUnparseableAttempt.reason, /parseable JSON/);
const storyQualityTimeoutAttempt = buildStoryQualityModelReviewResult({
  request: storyQualityModelRequest,
  status: 'not-run',
  reason: 'DIRECTIVE_GENERATION_TIMEOUT after 60000 ms',
  modelCall: {
    roleId: 'storyQualityReviewer',
    status: 'failed',
    ok: false,
    errorCode: 'DIRECTIVE_GENERATION_TIMEOUT'
  }
});
assert.equal(storyQualityTimeoutAttempt.status, 'fail');
assert.match(storyQualityTimeoutAttempt.reason, /DIRECTIVE_GENERATION_TIMEOUT/);
assert.equal(SOAK_FACTUAL_GROUNDING_POLICY.required, true);
assert.equal(SOAK_FACTUAL_GROUNDING_POLICY.artifactDirectory, 'fact-checks');
assert.equal(SOAK_FACTUAL_GROUNDING_POLICY.packIndexArtifact, 'fact-checks/canary-index.json');
assert.equal(SOAK_FACTUAL_GROUNDING_POLICY.modelReviewRequestArtifact, 'fact-checks/model-assisted-review/request.json');
assert.equal(SOAK_FACTUAL_GROUNDING_POLICY.modelReviewResultArtifact, 'fact-checks/model-assisted-review/result.json');
assert.equal(SOAK_FACTUAL_GROUNDING_POLICY.liveLogRecord, 'fact-check');
assert.deepEqual(SOAK_FACTUAL_GROUNDING_POLICY.evaluationPhases, ['prompt-availability-audit', 'generation-verdict']);
assert(SOAK_FACTUAL_GROUNDING_POLICY.canaryCategories.includes('senior-crew-identity'));
assert(SOAK_FACTUAL_GROUNDING_POLICY.canaryCategories.includes('opening-premise'));
assert(SOAK_FACTUAL_GROUNDING_POLICY.canaryCategories.includes('cross-campaign-isolation'));
assert(SOAK_FACTUAL_GROUNDING_POLICY.verdicts.includes('contradicted'));
assert(SOAK_FACTUAL_GROUNDING_POLICY.rootCauseLabels.includes('model-ignored-available-fact'));
assert(SOAK_FACTUAL_GROUNDING_POLICY.rootCauseLabels.includes('prompt-missing'));
assert(SOAK_FACTUAL_GROUNDING_POLICY.generationAuditLevels.some((entry) => entry.id === 'no-material-facts'));
assert(SOAK_FACTUAL_GROUNDING_POLICY.generationAuditLevels.some((entry) => entry.id === 'full-check' && /before the next turn/i.test(entry.requiredWork)));
assert(SOAK_FACTUAL_GROUNDING_POLICY.generationAuditLevels.some((entry) => entry.id === 'cross-campaign-check'));
assert(SOAK_FACTUAL_GROUNDING_POLICY.highRiskFullCheckTriggers.includes('first-appearance-or-substantive-line-from-senior-crew'));
assert(SOAK_FACTUAL_GROUNDING_POLICY.highRiskFullCheckTriggers.includes('reply-after-prompt-rebuild-save-load-branch-switch-edit-delete-reconciliation-swipe-campaign-switch-or-provider-retry'));
assert(SOAK_FACTUAL_GROUNDING_POLICY.expectedFactsBeforeGeneration.some((entry) => entry.packageId === 'directive:campaign-package:breckenridge-ashes-of-peace' && entry.requiredFacts.some((fact) => /Tellarite/i.test(fact))));
assert(SOAK_FACTUAL_GROUNDING_POLICY.diagnosticFields.promptStatus.includes('overcompressed'));
assert(SOAK_FACTUAL_GROUNDING_POLICY.diagnosticFields.generationStatus.includes('cross-campaign-bleed'));
assert(SOAK_FACTUAL_GROUNDING_POLICY.diagnosticFields.continuityImpact.includes('identity'));
assert.match(SOAK_FACTUAL_GROUNDING_POLICY.lanePausePolicy, /pauses only the affected lane/);
assert(SOAK_FACTUAL_GROUNDING_POLICY.certificationGates.includes('prompt-availability-is-recorded-before-generation-judgment'));
assert(SOAK_FACTUAL_GROUNDING_POLICY.certificationGates.includes('high-risk-generations-run-full-check-before-next-turn'));
const factualCanaryPacks = buildFactualGroundingCanaryPacks({ campaignMatrix: SOAK_CAMPAIGN_MATRIX });
assert.equal(factualCanaryPacks.length, SOAK_CAMPAIGN_MATRIX.length);
assert.equal(factualCanaryPacks.every((pack) => pack.kind === 'directive.liveCampaignSoak.factualCanaryPack'), true);
assert.equal(factualCanaryPacks.every((pack) => pack.canaryCount === pack.canaries.length), true);
assert.equal(factualCanaryPacks.every((pack) => pack.canaries.every((entry) => entry.hiddenStateSafe === true)), true);
assert.equal(factualCanaryPacks.every((pack) => pack.canaries.some((entry) => entry.category === 'campaign-specific-terms')), true);
assert.equal(factualCanaryPacks.every((pack) => pack.canaries.some((entry) => entry.category === 'ship-or-venue-facts')), true);
assert.equal(factualCanaryPacks.every((pack) => pack.canaries.some((entry) => entry.category === 'player-billet')), true);
assert.equal(factualCanaryPacks.every((pack) => pack.canaries.some((entry) => entry.category === 'senior-crew-identity')), true);
const ashesCanaryPack = factualCanaryPacks.find((pack) => pack.packageId === 'directive:campaign-package:breckenridge-ashes-of-peace');
assert(ashesCanaryPack);
assert(ashesCanaryPack.canaries.some((entry) => entry.id.endsWith('.opening.transit-premise') && /twenty-five days underway/i.test(entry.summary)));
assert(ashesCanaryPack.canaries.some((entry) => entry.id.endsWith('.opening.transit-premise') && /drops to impulse at the transfer waypoint/i.test(entry.summary)));
const bronnCanary = ashesCanaryPack.canaries.find((entry) => entry.id.endsWith('.senior-crew.hadrik-bronn.identity'));
assert(bronnCanary);
assert.match(bronnCanary.summary, /Tellarite/);
assert.match(bronnCanary.summary, /Late fifties/i);
assert(bronnCanary.contradictionWatchlist.some((entry) => /another species than Tellarite/i.test(entry)));
const satoCanary = ashesCanaryPack.canaries.find((entry) => entry.id.endsWith('.senior-crew.miriam-sato.identity'));
assert(satoCanary);
const transitCanary = ashesCanaryPack.canaries.find((entry) => entry.id.endsWith('.opening.transit-premise'));
assert(transitCanary);
assert(transitCanary.positiveTerms.some((entry) => /final ten days before the Asterion Reach/i.test(entry)));
assert(transitCanary.contradictionWatchlist.some((entry) => /out of spacedock three days ago/i.test(entry)));
const badFactCheck = buildFactualGroundingCheck({
  pack: ashesCanaryPack,
  generatedMessageId: 'mes-001',
  generatedMessageIndex: 1,
  transcriptPointer: 'transcript/readable-chat.md#mes-001',
  promptBlocks: [
    { id: 'crew-public-identity', text: bronnCanary.summary },
    { id: 'opening-premise', text: transitCanary.summary }
  ],
  requiredFactIds: [bronnCanary.id, transitCanary.id],
  generatedText: 'Lieutenant Commander Hadrik Bronn, a 40-year-old Human officer, says the Breckenridge has been at impulse for 6 days before the new XO arrives.'
});
assert.equal(badFactCheck.kind, 'directive.liveCampaignSoak.factualCheck');
assert.equal(badFactCheck.status, 'fail');
assert.equal(badFactCheck.counts.contradicted, 2);
assert.equal(badFactCheck.promptAvailability.byFactId[bronnCanary.id].status, 'available');
assert.equal(badFactCheck.promptAvailability.byFactId[transitCanary.id].status, 'available');
assert.equal(badFactCheck.results.find((entry) => entry.factId === bronnCanary.id).rootCauseLabel, 'model-ignored-available-fact');
assert.equal(badFactCheck.results.find((entry) => entry.factId === transitCanary.id).rootCauseLabel, 'model-ignored-available-fact');
const scopedSpeciesFactCheck = buildFactualGroundingCheck({
  pack: ashesCanaryPack,
  generatedMessageId: 'mes-sato-scope',
  generatedMessageIndex: 1,
  transcriptPointer: 'transcript/readable-chat.md#mes-sato-scope',
  promptBlocks: [
    { id: 'sato-public-identity', text: satoCanary.summary }
  ],
  requiredFactIds: [satoCanary.id],
  generatedText: "Commander Miriam Sato, the Chief Medical Officer, asks for medical authority. Bronn's jaw worked once - the Tellarite equivalent of a raised eyebrow - at Sato's claim."
});
assert.equal(scopedSpeciesFactCheck.counts.contradicted, 0);
assert.notEqual(scopedSpeciesFactCheck.results.find((entry) => entry.factId === satoCanary.id).verdict, 'contradicted');
const directSatoSpeciesFactCheck = buildFactualGroundingCheck({
  pack: ashesCanaryPack,
  generatedMessageId: 'mes-sato-direct-species',
  generatedMessageIndex: 1,
  transcriptPointer: 'transcript/readable-chat.md#mes-sato-direct-species',
  promptBlocks: [
    { id: 'sato-public-identity', text: satoCanary.summary }
  ],
  requiredFactIds: [satoCanary.id],
  generatedText: 'Commander Miriam Sato is introduced as a Tellarite chief medical officer.'
});
assert.equal(directSatoSpeciesFactCheck.status, 'fail');
assert.equal(directSatoSpeciesFactCheck.counts.contradicted, 1);
const scopedUniformFactCheck = buildFactualGroundingCheck({
  pack: ashesCanaryPack,
  generatedMessageId: 'mes-bronn-blue-light',
  generatedMessageIndex: 1,
  transcriptPointer: 'transcript/readable-chat.md#mes-bronn-blue-light',
  promptBlocks: [
    { id: 'bronn-public-identity', text: bronnCanary.summary }
  ],
  requiredFactIds: [bronnCanary.id],
  generatedText: 'Bronn stood at tactical while faint blue light from the rail display crossed his hands, then repeated the dry-fire pattern back to Commander Arlen.'
});
assert.equal(scopedUniformFactCheck.counts.contradicted, 0);
assert.notEqual(scopedUniformFactCheck.results.find((entry) => entry.factId === bronnCanary.id).verdict, 'contradicted');
const directUniformFactCheck = buildFactualGroundingCheck({
  pack: ashesCanaryPack,
  generatedMessageId: 'mes-bronn-command-red',
  generatedMessageIndex: 1,
  transcriptPointer: 'transcript/readable-chat.md#mes-bronn-command-red',
  promptBlocks: [
    { id: 'bronn-public-identity', text: bronnCanary.summary }
  ],
  requiredFactIds: [bronnCanary.id],
  generatedText: 'Lieutenant Commander Hadrik Bronn wore command red at tactical while presenting the dry-fire solution.'
});
assert.equal(directUniformFactCheck.status, 'fail');
assert.equal(directUniformFactCheck.counts.contradicted, 1);
const collapsedTransitFactCheck = buildFactualGroundingCheck({
  pack: ashesCanaryPack,
  generatedMessageId: 'campaign-intro',
  generatedMessageIndex: 0,
  transcriptPointer: 'transcript/readable-chat.md#campaign-intro',
  promptBlocks: [
    { id: 'opening-premise', text: transitCanary.summary }
  ],
  requiredFactIds: [transitCanary.id],
  generatedText: 'A skeleton-plus crew had taken the Breckenridge out of spacedock three days ago, with the new XO only now meeting everyone for the first time.'
});
assert.equal(collapsedTransitFactCheck.status, 'fail');
assert.equal(collapsedTransitFactCheck.counts.contradicted, 1);
assert.equal(collapsedTransitFactCheck.results[0].rootCauseLabel, 'model-ignored-available-fact');
assert(collapsedTransitFactCheck.results[0].contradictionMatches.some((entry) => /three days out of spacedock/i.test(entry.term)));
const missingPromptFactCheck = buildFactualGroundingCheck({
  pack: ashesCanaryPack,
  generatedMessageId: 'mes-002',
  promptBlocks: [{ id: 'unrelated', text: 'Only a generic bridge scene prompt is available.' }],
  requiredFactIds: [bronnCanary.id],
  generatedText: 'Hadrik Bronn is introduced as a Human officer.'
});
assert.equal(missingPromptFactCheck.status, 'fail');
assert.equal(missingPromptFactCheck.promptAvailability.byFactId[bronnCanary.id].status, 'missing');
assert.equal(missingPromptFactCheck.results[0].rootCauseLabel, 'prompt-missing');
const metadataPromptBlocks = promptBlocksFromInspection({
  blocks: [
    { id: 'relevant-crew', title: 'Relevant Crew Context', hash: 'crew-hash' },
    { id: 'immediate-scene', title: 'Immediate Scene', hash: 'scene-hash' }
  ]
});
const metadataFactCheck = buildFactualGroundingCheck({
  pack: ashesCanaryPack,
  generatedMessageId: 'mes-002b',
  promptBlocks: metadataPromptBlocks,
  requiredFactIds: [bronnCanary.id, transitCanary.id],
  generatedText: 'Hadrik Bronn is introduced as a Human officer while the bridge watches the transfer unfold.'
});
assert.equal(metadataFactCheck.status, 'fail');
assert.equal(metadataFactCheck.promptAvailability.byFactId[bronnCanary.id].status, 'partial');
assert.equal(metadataFactCheck.promptAvailability.byFactId[bronnCanary.id].matchedMetadata.some((entry) => entry.blockId === 'relevant-crew'), true);
assert.equal(metadataFactCheck.results.find((entry) => entry.factId === bronnCanary.id).rootCauseLabel, 'model-ignored-available-fact');
const goodFactCheck = buildFactualGroundingCheck({
  pack: ashesCanaryPack,
  generatedMessageId: 'mes-003',
  promptBlocks: [
    { id: 'crew-public-identity', text: bronnCanary.summary },
    { id: 'opening-premise', text: transitCanary.summary }
  ],
  requiredFactIds: [bronnCanary.id, transitCanary.id],
  generatedText: `${bronnCanary.assertions[0]} ${transitCanary.assertions[0]} ${transitCanary.assertions[1]}`
});
assert.equal(goodFactCheck.status, 'pass');
assert.equal(goodFactCheck.counts.respected, 2);
const badFactLogRecord = factualGroundingLiveLogRecord({ check: badFactCheck, artifactPath: 'fact-checks/mes-001/fact-check.json' });
assert.equal(badFactLogRecord.kind, 'fact-check');
assert.equal(badFactLogRecord.status, 'fail');
assert.equal(badFactLogRecord.verdictCounts.contradicted, 2);
const modelReviewRequest = buildModelAssistedFactualReviewRequest({
  pack: ashesCanaryPack,
  transcriptMessages: [
    { index: 0, isUser: true, text: 'Commander Arlen asks Bronn for the bridge handoff.' },
    { index: 1, isUser: false, directiveOwned: true, text: 'Bronn is described as a Human officer.' }
  ],
  deterministicChecks: [badFactCheck],
  runId: 'prep-test'
});
assert.equal(modelReviewRequest.kind, 'directive.liveCampaignSoak.factualModelReviewRequest');
assert.equal(modelReviewRequest.canaries.every((entry) => entry.hiddenStateSafe === true), true);
assert.equal(modelReviewRequest.transcript.length, 2);
assert.equal(modelReviewRequest.deterministicChecks[0].checkId, badFactCheck.checkId);
assert.match(modelReviewRequest.hiddenStatePolicy, /raw prompt bodies/);
assert(modelReviewRequest.evaluatorInstructions.some((entry) => /findings only for material problems/i.test(entry)));
assert(modelReviewRequest.evaluatorInstructions.some((entry) => /empty findings array/i.test(entry)));
assert(modelReviewRequest.evaluatorInstructions.some((entry) => /Shuttlebay 1 being visible/i.test(entry) && /Shuttlebay 2/i.test(entry)));
assert.equal(modelReviewRequest.responseSchema.properties.findings.maxItems, 8);
assert.equal(modelReviewRequest.responseSchema.properties.findings.items.properties.evidenceSpans.maxItems, 2);
assert.equal(modelReviewRequest.canaries.some((entry) => Object.hasOwn(entry, 'directorOnlyData')), false);
assert.equal(modelReviewRequest.transcript.some((entry) => Object.hasOwn(entry, 'prompt')), false);
assert.equal(modelReviewRequest.deterministicChecks.some((entry) => Object.hasOwn(entry, 'generatedTextPreview')), false);
const modelReviewResult = buildModelAssistedFactualReviewResult({
  request: modelReviewRequest,
  modelOutput: {
    status: 'fail',
    overallAssessment: 'The transcript contradicts Bronn identity.',
    findings: [
      {
        factId: bronnCanary.id,
        verdict: 'contradicted',
        severity: 'P1 factual blocker',
        rootCauseLabel: 'model-ignored-available-fact',
        summary: 'Bronn is described as Human.',
        evidenceSpans: [{ messageIndex: 1, quote: 'Bronn is described as a Human officer.' }],
        confidence: 0.96
      }
    ]
  },
  modelCall: {
    roleId: 'factualGroundingReviewer',
    providerKind: 'utility',
    model: 'fixture-reviewer',
    status: 'completed',
    ok: true,
    latencyMs: 25
  }
});
assert.equal(modelReviewResult.kind, 'directive.liveCampaignSoak.factualModelReviewResult');
assert.equal(modelReviewResult.status, 'fail');
assert.equal(modelReviewResult.counts.contradicted, 1);
assert.equal(modelReviewResult.counts.p1, 1);
assert.equal(modelReviewResult.modelCall.roleId, 'factualGroundingReviewer');
const factualStatusOnlyModelCallResult = buildModelAssistedFactualReviewResult({
  request: modelReviewRequest,
  modelOutput: JSON.stringify({
    status: 'pass',
    overallAssessment: 'No material factual problems.',
    findings: []
  }),
  modelCall: { roleId: 'factualGroundingReviewer', status: 'ok' }
});
assert.equal(factualStatusOnlyModelCallResult.status, 'pass');
assert.equal(factualStatusOnlyModelCallResult.modelCall.ok, true);
const factualExplicitFailedModelCallResult = buildModelAssistedFactualReviewResult({
  request: modelReviewRequest,
  modelOutput: JSON.stringify({
    status: 'pass',
    overallAssessment: 'No material factual problems.',
    findings: []
  }),
  modelCall: { roleId: 'factualGroundingReviewer', status: 'ok', ok: false }
});
assert.equal(factualExplicitFailedModelCallResult.modelCall.ok, false);
const factualUnparseableAttempt = buildModelAssistedFactualReviewResult({
  request: modelReviewRequest,
  modelOutput: 'not strict json',
  modelCall: { roleId: 'factualGroundingReviewer', status: 'ok', ok: true }
});
assert.equal(factualUnparseableAttempt.status, 'fail');
assert.match(factualUnparseableAttempt.reason, /parseable JSON/);
const factualTimeoutAttempt = buildModelAssistedFactualReviewResult({
  request: modelReviewRequest,
  status: 'not-run',
  reason: 'DIRECTIVE_GENERATION_TIMEOUT after 60000 ms',
  modelCall: {
    roleId: 'factualGroundingReviewer',
    status: 'failed',
    ok: false,
    errorCode: 'DIRECTIVE_GENERATION_TIMEOUT'
  }
});
assert.equal(factualTimeoutAttempt.status, 'fail');
assert.match(factualTimeoutAttempt.reason, /DIRECTIVE_GENERATION_TIMEOUT/);
assert.equal(SOAK_SCENE_HANDSHAKE_POLICY.required, true);
assert.deepEqual(SOAK_SCENE_HANDSHAKE_POLICY.modelRoles, ['sceneHandshakeSettler']);
assert.equal(SOAK_SCENE_HANDSHAKE_POLICY.intervalLogRecord, 'scene-handshake-settlement');
assert(SOAK_SCENE_HANDSHAKE_POLICY.ownerLanes.includes('ashes-factual-director'));
assert(SOAK_SCENE_HANDSHAKE_POLICY.allowedRoots.includes('mission.openAssignments'));
assert(SOAK_SCENE_HANDSHAKE_POLICY.allowedRoots.includes('commandLog.entries'));
assert(SOAK_SCENE_HANDSHAKE_POLICY.certificationGates.includes('accepted-host-native-assignment-commits-allowlisted-state'));
assert(SOAK_SCENE_HANDSHAKE_POLICY.certificationGates.includes('rejected-or-corrected-assistant-beat-does-not-auto-commit'));
assert(SOAK_SCENE_HANDSHAKE_POLICY.certificationGates.includes('command-bearing-terminal-formal-objective-and-hidden-state-roots-are-not-mutated'));
assert(SOAK_SCENE_HANDSHAKE_POLICY.minimumEvidence.includes('sanitized-sceneHandshakeSettler-model-call'));
assert(SOAK_SCENE_HANDSHAKE_POLICY.stateInspection.includes('prompt-revision-before-after-settlement'));
assert.match(SOAK_SCENE_HANDSHAKE_POLICY.failureSeverityPolicy, /outside allowlisted roots/);
assert.match(SOAK_SCENE_HANDSHAKE_POLICY.hiddenStatePolicy, /Command Bearing evaluator reasoning/);
assert.equal(SOAK_TIMEKEEPING_POLICY.required, true);
assert.equal(SOAK_TIMEKEEPING_POLICY.artifactDirectory, 'timekeeping');
assert.equal(SOAK_TIMEKEEPING_POLICY.intervalLogRecord, 'timekeeping-header-check');
assert.equal(SOAK_TIMEKEEPING_POLICY.expectedHeaderPattern, '*Stardate #####.# | HHMM hours*');
assert(SOAK_TIMEKEEPING_POLICY.requiredSurfaces.includes('host-native-injectAndContinue'));
assert(SOAK_TIMEKEEPING_POLICY.certificationGates.includes('stale-leading-headers-are-replaced-not-stacked'));
assert(SOAK_TIMEKEEPING_POLICY.certificationGates.includes('installed-preset-version-includes-reply-header-contract'));
assert(SOAK_TIMEKEEPING_POLICY.stateInspection.includes('reply-header-prompt-block-hash-and-revision'));
assert.match(SOAK_TIMEKEEPING_POLICY.failureSeverityPolicy, /visible headers contradict authoritative state/);
assert.equal(SOAK_OBJECTIVE_ASSIGNMENT_PROJECTION_POLICY.required, true);
assert.equal(SOAK_OBJECTIVE_ASSIGNMENT_PROJECTION_POLICY.artifactDirectory, 'objective-assignments');
assert.equal(SOAK_OBJECTIVE_ASSIGNMENT_PROJECTION_POLICY.liveLogRecord, 'objective-assignment-projection-check');
assert(SOAK_OBJECTIVE_ASSIGNMENT_PROJECTION_POLICY.triggerSources.includes('scene-handshake-accepted-assignment'));
assert(SOAK_OBJECTIVE_ASSIGNMENT_PROJECTION_POLICY.requiredSurfaces.some((entry) => entry.id === 'mission-current-orders'));
assert(SOAK_OBJECTIVE_ASSIGNMENT_PROJECTION_POLICY.requiredSurfaces.some((entry) => entry.id === 'command-log-entry'));
assert(SOAK_OBJECTIVE_ASSIGNMENT_PROJECTION_POLICY.requiredSurfaces.some((entry) => entry.id === 'crew-character-link'));
assert(SOAK_OBJECTIVE_ASSIGNMENT_PROJECTION_POLICY.requiredSurfaces.some((entry) => entry.id === 'crew-roster-link'));
assert(SOAK_OBJECTIVE_ASSIGNMENT_PROJECTION_POLICY.certificationGates.includes('accepted-assignment-state-projects-to-mission-log-and-linked-crew'));
assert(SOAK_OBJECTIVE_ASSIGNMENT_PROJECTION_POLICY.minimumEvidence.includes('linked-crew-character-or-roster-visible-excerpt-and-screenshot'));
assert(SOAK_OBJECTIVE_ASSIGNMENT_PROJECTION_POLICY.stateInspection.includes('linkedCrewIds-threadIds-and-playerSafeCrewProjection-hashes'));
assert.match(SOAK_OBJECTIVE_ASSIGNMENT_PROJECTION_POLICY.failureSeverityPolicy, /Mission, Log, or linked Crew/);
assert.match(SOAK_OBJECTIVE_ASSIGNMENT_PROJECTION_POLICY.hiddenStatePolicy, /hidden relationship values/);
assert.equal(SOAK_UI_STATE_SURFACE_POLICY.required, true);
assert.equal(SOAK_UI_STATE_SURFACE_POLICY.intervalTurns, '5-10');
assert.match(SOAK_UI_STATE_SURFACE_POLICY.checkpointCadence, /5-10 player-turn intervals/);
assert.equal(SOAK_UI_STATE_SURFACE_POLICY.surfaces.length, 4);
assert(SOAK_UI_STATE_SURFACE_POLICY.surfaces.some((entry) => entry.id === 'crew-character-tab'));
assert(SOAK_UI_STATE_SURFACE_POLICY.surfaces.some((entry) => entry.id === 'crew-roster-pressures'));
assert(SOAK_UI_STATE_SURFACE_POLICY.surfaces.some((entry) => entry.id === 'crew-relationship-deltas'));
assert(SOAK_UI_STATE_SURFACE_POLICY.surfaces.some((entry) => entry.id === 'mission-drawer-updates'));
assert.match(SOAK_UI_STATE_SURFACE_POLICY.hiddenStatePolicy, /raw relationship values/);
assert.equal(SOAK_COMMAND_BEARING_SYSTEM_POLICY.required, true);
assert.equal(SOAK_COMMAND_BEARING_SYSTEM_POLICY.intervalTurns, '5-10');
assert.equal(SOAK_COMMAND_BEARING_SYSTEM_POLICY.ownerLane, 'ashes-command-bearing-endings');
assert.deepEqual(SOAK_COMMAND_BEARING_SYSTEM_POLICY.modelRoles, [
  'commandBearingFitChecker',
  'commandBearingSpendValidator',
  'commandBearingEvaluator'
]);
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.certificationGates.includes('evidence-accumulates-only-after-committed-outcomes'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.certificationGates.includes('boundary-detection-separates-scene-pacing-from-durable-closure'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.certificationGates.includes('point-lifecycle-is-scoped-auditable-and-never-a-reroll'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.certificationSchedule.includes('baseline-false-positives'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.certificationSchedule.includes('scene-end-non-closure'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.certificationSchedule.includes('rank-and-point-progression'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.certificationSchedule.includes('post-commit-robustness'));
assert.equal(SOAK_COMMAND_BEARING_SYSTEM_POLICY.intervalLogRecord, 'command-bearing-interval');
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.intervalPlaybook.includes('baseline-professional-play-no-evidence'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.intervalPlaybook.includes('closure-probe-with-scene-end-non-closure-and-durable-closure-check'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.intervalPlaybook.includes('point-lifecycle-after-organic-or-labeled-fixture-availability'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.minimumEvidence.includes('routine-play-no-evidence-check'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.minimumEvidence.includes('closure-record-with-no-review'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.minimumEvidence.includes('mark-review-result'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.minimumEvidence.includes('valid-spend-or-logged-blocker'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.minimumEvidence.includes('retcon-touching-command-bearing-source'));
assert.match(SOAK_COMMAND_BEARING_SYSTEM_POLICY.fixtureBranchPolicy, /organic evidence/);
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.closureProofLevels.includes('scene-end-is-pacing-only-and-never-mark-review-proof'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.closureProofLevels.includes('thread-closure-requires-durable-thread-state'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.closureProofLevels.includes('ambiguous-utility-closure-suggestion-does-not-award'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.boundaryDetectionLadder.includes('scene-beat-prompt-refresh-without-mark-review'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.boundaryDetectionLadder.includes('quest-or-chapter-closure-queues-one-relevant-review'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.boundaryDetectionLadder.includes('retconned-closure-enters-explicit-recovery-or-review-required'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.markReviewGates.includes('agency-required'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.markReviewGates.includes('causality-required'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.markReviewGates.includes('hidden-state-redaction-required'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.evidenceAccumulation.includes('strong-inspiration-evidence-after-committed-outcome'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.evidenceAccumulation.includes('routine-competence-creates-no-evidence'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.evidenceAccumulation.includes('player-authored-reward-claim-creates-no-evidence'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.closureDetection.includes('utility-suggested-closure-without-state-proof-does-not-review'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.closureDetection.includes('committed-state-closure-can-review-even-if-utility-misses-it'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.markReview.includes('no-mark-without-agency'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.markReview.includes('duplicate-closure-review-blocked'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.markReview.includes('rank-thresholds-change-at-2-5-9-14-marks'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.pointSpend.includes('valid-spend-improves-exactly-two-bands'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.pointSpend.includes('anchored-consequences-remain'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.pointSpend.includes('controlled-narration-aborts-ordinary-host-generation'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.mutationAbuse.includes('swipe-does-not-reroll-or-refund'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.mutationAbuse.includes('already-rewarded-closure-cannot-award-again'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.stateInspection.includes('authoritative-commandBearing-state'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.stateInspection.includes('fit-spend-evaluator-model-call-journal-with-sanitized-failures'));
assert.match(SOAK_COMMAND_BEARING_SYSTEM_POLICY.failureSeverityPolicy, /P1/);
assert.match(SOAK_COMMAND_BEARING_SYSTEM_POLICY.failureSeverityPolicy, /duplicate awards/);
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.liveEvidence.some((entry) => /evidence ledger/.test(entry)));
assert.match(SOAK_COMMAND_BEARING_SYSTEM_POLICY.hiddenStatePolicy, /private NPC thoughts/);
assert.equal(SOAK_CONTINUITY_PROJECTION_MATRIX_POLICY.required, true);
assert.equal(SOAK_CONTINUITY_PROJECTION_MATRIX_POLICY.artifactDirectory, 'continuity-projection-matrix');
assert.equal(SOAK_CONTINUITY_PROJECTION_MATRIX_POLICY.coordinatorScript, 'tools/scripts/run-continuity-matrix-five-user-soak.mjs');
assert.equal(SOAK_CONTINUITY_PROJECTION_MATRIX_POLICY.liveLogRecord, 'continuity-projection-check');
assert(SOAK_CONTINUITY_PROJECTION_MATRIX_POLICY.requiredPromptKeys.includes('directive.continuity.invariants'));
assert(SOAK_CONTINUITY_PROJECTION_MATRIX_POLICY.requiredPromptKeys.includes('directive.context.revolving'));
assert(SOAK_CONTINUITY_PROJECTION_MATRIX_POLICY.requiredSourceIds.includes('crew.hadrik-bronn.species'));
assert(SOAK_CONTINUITY_PROJECTION_MATRIX_POLICY.requiredSourceIds.includes('crew.hadrik-bronn.age-description'));
assert(SOAK_CONTINUITY_PROJECTION_MATRIX_POLICY.requiredSourceIds.includes('ship.uss-breckenridge.travel.not-six-days-impulse'));
assert(SOAK_CONTINUITY_PROJECTION_MATRIX_POLICY.requiredSourceIds.includes('ship.uss-breckenridge.travel.not-short-refit-duration'));
assert(SOAK_CONTINUITY_PROJECTION_MATRIX_POLICY.modelRoles.includes('continuityProjectionPlanner'));
assert(SOAK_CONTINUITY_PROJECTION_MATRIX_POLICY.modelRoles.includes('continuityContradictionReviewer'));
assert(SOAK_CONTINUITY_PROJECTION_MATRIX_POLICY.certificationGates.includes('five-user-cpm-coordinator-aggregates-passing-ashes-lane-evidence'));
assert(SOAK_CONTINUITY_PROJECTION_MATRIX_POLICY.minimumEvidence.includes('director-packet-digest-hash-sourceHash-selectedFactCount-and-audience'));
assert(SOAK_CONTINUITY_PROJECTION_MATRIX_POLICY.stateInspection.includes('Mission drawer sanitized continuity diagnostics card'));
assert.match(SOAK_CONTINUITY_PROJECTION_MATRIX_POLICY.failureSeverityPolicy, /required static prompt keys/);
assert.equal(SOAK_PARALLEL_WORKER_POLICY.strategy, 'ashes-first-five-lane-coverage');
assert.equal(SOAK_PARALLEL_WORKER_POLICY.defaultWorkerHandles.length, 5);
assert.deepEqual(
  SOAK_PARALLEL_WORKER_POLICY.defaultWorkerHandles,
  ['directive-soak-a', 'directive-soak-b', 'directive-soak-c', 'directive-soak-d', 'directive-soak-e']
);
assert.equal(SOAK_PARALLEL_WORKER_POLICY.lanes.length, 5);
assert.equal(new Set(SOAK_PARALLEL_WORKER_POLICY.lanes.map((entry) => entry.id)).size, 5);
assert.equal(new Set(SOAK_PARALLEL_WORKER_POLICY.lanes.map((entry) => entry.userHandle)).size, 5);
assert(SOAK_PARALLEL_WORKER_POLICY.lanes.some((entry) => entry.id === 'ashes-factual-director'));
assert(SOAK_PARALLEL_WORKER_POLICY.lanes.some((entry) => entry.id === 'ashes-drawer-projection'));
assert(SOAK_PARALLEL_WORKER_POLICY.lanes.some((entry) => entry.id === 'ashes-sidecars-timekeeping'));
assert(SOAK_PARALLEL_WORKER_POLICY.lanes.some((entry) => entry.id === 'ashes-mutation-reconciliation'));
assert(SOAK_PARALLEL_WORKER_POLICY.lanes.some((entry) => entry.id === 'ashes-command-bearing-endings'));
assert.deepEqual(SOAK_PARALLEL_WORKER_POLICY.immediateFixSeverities, ['P0', 'P1']);
assert.deepEqual(SOAK_PARALLEL_WORKER_POLICY.deferredFixSeverities, ['P2', 'P3']);
assert.match(SOAK_PARALLEL_WORKER_POLICY.deferredFixPolicy, /continue/);
assert(SOAK_SERVED_EXTENSION_PROOF_FILES.includes('src/continuity/projection-matrix.mjs'));
assert(SOAK_SERVED_EXTENSION_PROOF_FILES.includes('src/continuity/projection-planner-prompt.mjs'));
assert(SOAK_SERVED_EXTENSION_PROOF_FILES.includes('src/continuity/projection-planner-client.mjs'));
assert(SOAK_SERVED_EXTENSION_PROOF_FILES.includes('src/continuity/projection-planner-fallback.mjs'));
assert(SOAK_SERVED_EXTENSION_PROOF_FILES.includes('src/continuity/materializers/ship-travel-facts.mjs'));
assert(SOAK_SERVED_EXTENSION_PROOF_FILES.includes('src/continuity/materializers/command-log-facts.mjs'));
assert(SOAK_SERVED_EXTENSION_PROOF_FILES.includes('src/continuity/materializers/rejected-claim-facts.mjs'));
assert(SOAK_SERVED_EXTENSION_PROOF_FILES.includes('src/generation/player-safe-prompt-context-builder.mjs'));
assert(SOAK_SERVED_EXTENSION_PROOF_FILES.includes('src/hosts/sillytavern/host-factory.mjs'));
assert(SOAK_SERVED_EXTENSION_PROOF_FILES.includes('src/hosts/sillytavern/chat-adapter.mjs'));
assert(SOAK_SERVED_EXTENSION_PROOF_FILES.includes('src/hosts/sillytavern/external-context-observer.mjs'));
assert(SOAK_SERVED_EXTENSION_PROOF_FILES.includes('src/runtime/runtime-app.mjs'));
assert(SOAK_SERVED_EXTENSION_PROOF_FILES.includes('src/runtime/architecture-redesign-contracts.mjs'));
assert(SOAK_SERVED_EXTENSION_PROOF_FILES.includes('src/runtime/response-dispatcher.mjs'));
assert(SOAK_SERVED_EXTENSION_PROOF_FILES.includes('src/runtime/message-reconciler.mjs'));
assert(SOAK_SERVED_EXTENSION_PROOF_FILES.includes('src/runtime/turn-commit-coordinator.mjs'));
assert(SOAK_SERVED_EXTENSION_PROOF_FILES.includes('src/storage/core-store-v2.mjs'));
assert(SOAK_SERVED_EXTENSION_PROOF_FILES.includes('src/directors/open-world-event-reducers.mjs'));
assert(SOAK_SERVED_EXTENSION_PROOF_FILES.includes('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json'));
const thirdPersonWithDialogue = playerInputPerspectiveEvidence('Serrin steps to the rail and says, "I need the sensor pass on screen."', 'third-person');
assert.equal(thirdPersonWithDialogue.detectedPerspective, 'third-person');
assert.equal(thirdPersonWithDialogue.preferredPlayEvidence, true);
assert.equal(thirdPersonWithDialogue.firstPersonNarrationSuspected, false);
const firstPersonNarration = playerInputPerspectiveEvidence('I step to the rail and ask for the sensor pass.', 'third-person');
assert.equal(firstPersonNarration.detectedPerspective, 'first-person');
assert.equal(firstPersonNarration.preferredPlayEvidence, false);
assert.equal(firstPersonNarration.perspectiveWarning, 'declared-third-person-but-first-person-narration-suspected');
const declaredFirstPerson = playerInputPerspectiveEvidence('Serrin steps to the rail.', 'first-person');
assert.equal(declaredFirstPerson.detectedPerspective, 'first-person');
assert.equal(declaredFirstPerson.preferredPlayEvidence, false);
assert.equal(declaredFirstPerson.perspectiveWarning, 'declared-first-person-compatibility-only');

assert.equal(SOAK_CAMPAIGN_MATRIX.length, 1);
assert.equal(new Set(SOAK_CAMPAIGN_MATRIX.map((entry) => entry.packageId)).size, 1);
assert.equal(SOAK_CAMPAIGN_MATRIX.filter((entry) => entry.liveCoverage === 'full-soak-rotation-primary').length, 1);
assert.equal(SOAK_CAMPAIGN_MATRIX.every((entry) => entry.requiredLiveChecks.includes('cross-campaign-isolation')), true);
assert.equal(SOAK_CAMPAIGN_MATRIX.every((entry) => entry.requiredLiveChecks.includes('factual-grounding-canary')), true);
assert.equal(SOAK_CAMPAIGN_MATRIX.every((entry) => entry.requiredLiveChecks.includes('objective-assignment-projection-canary')), true);
assert.equal(SOAK_CAMPAIGN_MATRIX.every((entry) => entry.requiredLiveChecks.includes('scene-handshake-canary')), true);
assert.equal(SOAK_CAMPAIGN_MATRIX.every((entry) => entry.requiredLiveChecks.includes('timekeeping-header-canary')), true);
assert.equal(SOAK_CAMPAIGN_MATRIX.every((entry) => entry.deterministicCoverage.includes('end-condition-contract')), true);
assert.equal(SOAK_CAMPAIGN_MATRIX.some((entry) => entry.packageId === 'directive:campaign-package:breckenridge-ashes-of-peace'), true);
assert.equal(SOAK_CAMPAIGN_MATRIX.every((entry) => entry.packageId === 'directive:campaign-package:breckenridge-ashes-of-peace'), true);
const campaignMatrixCanaries = buildCampaignMatrixCanaryScripts({ campaignMatrix: SOAK_CAMPAIGN_MATRIX });
assert.equal(campaignMatrixCanaries.length, SOAK_CAMPAIGN_MATRIX.length);
assert.equal(campaignMatrixCanaries.every((script) => script.kind === 'directive.liveCampaignSoak.campaignMatrixCanaryScript'), true);
assert.equal(campaignMatrixCanaries.every((script) => script.perspective === 'third-person'), true);
assert.equal(campaignMatrixCanaries.every((script) => script.messages.length === 4), true);
assert.equal(campaignMatrixCanaries.every((script) => script.messages.every((message) => message.perspective === 'third-person')), true);
assert.equal(campaignMatrixCanaries.every((script) => script.requiredLiveChecks.includes('factual-grounding-canary')), true);
assert.equal(campaignMatrixCanaries.every((script) => script.requiredLiveChecks.includes('cross-campaign-isolation')), true);
assert.equal(campaignMatrixCanaries.every((script) => script.requiredLiveChecks.includes('save-load-preserves-package')), true);
assert.equal(
  campaignMatrixCanaries.some((script) => script.packageId === 'directive:campaign-package:breckenridge-ashes-of-peace' && script.coverageNotes.some((note) => /52-turn full soak/i.test(note))),
  true
);

assert.equal(SOAK_PHASES.length, 10);
assert.equal(SOAK_PHASES.some((entry) => entry.id === 'scene-handshake-timekeeping'), true);
assert.equal(SOAK_TURN_SCRIPT.length, 52);
assert.equal(SOAK_TURN_SCRIPT.at(0).turn, 1);
assert.equal(SOAK_TURN_SCRIPT.at(-1).turn, 52);
assert.equal(new Set(SOAK_TURN_SCRIPT.map((entry) => entry.turn)).size, 52);
assert.equal(SOAK_TURN_SCRIPT.some((entry) => entry.category === 'crew-character'), true);
assert.equal(SOAK_TURN_SCRIPT.some((entry) => entry.category === 'crew-roster'), true);
assert.equal(SOAK_TURN_SCRIPT.some((entry) => entry.category === 'mission-drawer'), true);
assert.equal(SOAK_TURN_SCRIPT.some((entry) => entry.category === 'relationship-delta'), true);
assert.equal(SOAK_TURN_SCRIPT.some((entry) => entry.category === 'conduct-attack'), true);
const requiredHostNativeScriptTurn = SOAK_TURN_SCRIPT.find((entry) => entry.hostNativeCompletionRequired === true);
assert.equal(requiredHostNativeScriptTurn?.turn, 3);
assert.equal(requiredHostNativeScriptTurn?.expectedRoute, 'hostContinue');
assert.equal(requiredHostNativeScriptTurn?.expectedResponseStrategy, 'injectAndContinue');
assert.equal(statusFromChecks([{ status: 'warning' }], { strict: false }), 'warning');
assert.equal(statusFromChecks([{ status: 'warning' }], { strict: true }), 'fail');
assert.equal(statusFromChecks([{ status: 'pass' }], { strict: true }), 'pass');
assert.equal(strictModePolicy({ enabled: true }).warningStatus, 'fail');
assert.equal(strictModePolicy({ enabled: false }).warningStatus, 'warning');
assert.equal(SOAK_CHECKPOINT_ARTIFACT_POLICY.artifactDirectory, 'snapshots');
assert.equal(SOAK_CHECKPOINT_ARTIFACT_POLICY.liveLogRecord, 'checkpoint');
assert.match(SOAK_CHECKPOINT_ARTIFACT_POLICY.redactionPolicy, /never raw prompt bodies/);
const dryCertificationSummary = buildReleaseCertificationSummary({
  mode: 'dry-run',
  status: 'pass',
  strictModePolicy: strictModePolicy({ enabled: false }),
  checks: [{ id: 'playwright-browser-control', status: 'pass', summary: 'browser ok' }],
  campaignMatrix: SOAK_CAMPAIGN_MATRIX,
  phases: SOAK_PHASES,
  turnScript: SOAK_TURN_SCRIPT,
  commandConductScenarios: SOAK_COMMAND_CONDUCT_SCENARIOS,
  endConditionScenarios: SOAK_END_CONDITION_SCENARIOS,
  factualCanaryPacks: [{ canaryCount: 3 }],
  liveLogPolicy: SOAK_LIVE_LOG_POLICY
});
assert.equal(dryCertificationSummary.state, 'ready-for-live');
assert.match(dryCertificationSummary.conclusion, /not release certification/);
const liveCertificationSummary = buildReleaseCertificationSummary({
  ...dryCertificationSummary,
  mode: 'live',
  status: 'pass',
  strictModePolicy: strictModePolicy({ enabled: true }),
  checks: [{ id: 'live-smoke-52-turn-delegation', status: 'pass', summary: 'live ok' }],
  campaignMatrix: SOAK_CAMPAIGN_MATRIX,
  phases: SOAK_PHASES,
  turnScript: SOAK_TURN_SCRIPT,
  commandConductScenarios: SOAK_COMMAND_CONDUCT_SCENARIOS,
  endConditionScenarios: SOAK_END_CONDITION_SCENARIOS,
  factualCanaryPacks: [{ canaryCount: 3 }],
  liveLogPolicy: SOAK_LIVE_LOG_POLICY
});
assert.equal(liveCertificationSummary.state, 'certified');
assert.equal(liveCertificationSummary.checkCounts.total, 1);
const liveMessageScript = buildSoakChatMessageScript();
assert.equal(liveMessageScript.kind, 'directive.liveCampaignSoak.chatMessageScript');
assert.equal(liveMessageScript.perspective, 'third-person');
assert.equal(liveMessageScript.plannedTurnCount, SOAK_TURN_SCRIPT.length);
assert.equal(liveMessageScript.executedTurnLimit, null);
assert.equal(liveMessageScript.messages.length, SOAK_TURN_SCRIPT.length);
assert.equal(liveMessageScript.messages.at(0).id, 'soak-turn-01');
assert.equal(liveMessageScript.messages.at(-1).id, 'soak-turn-52');
assert.equal(liveMessageScript.messages.every((entry) => entry.perspective === 'third-person'), true);
assert.equal(liveMessageScript.messages.every((entry) => /\bCommander Arlen\b/.test(entry.text)), true);
assert.deepEqual(liveMessageScript.hostNativeCompletionRequiredMessages, [{
  id: 'soak-turn-03',
  turn: 3,
  expectedRoute: 'hostContinue',
  expectedResponseStrategy: 'injectAndContinue'
}]);
const requiredHostNativeMessage = liveMessageScript.messages.find((entry) => entry.id === 'soak-turn-03');
assert.equal(requiredHostNativeMessage.hostNativeCompletionRequired, true);
assert.equal(requiredHostNativeMessage.expectedRoute, 'hostContinue');
assert.equal(requiredHostNativeMessage.expectedResponseStrategy, 'injectAndContinue');
assert.match(liveMessageScript.messages.find((entry) => entry.id === 'soak-turn-02')?.text || '', /bridge sensor and command-network telemetry buffer/);
assert.match(liveMessageScript.messages.find((entry) => entry.id === 'soak-turn-02')?.text || '', /transporter room two/);
assert.match(liveMessageScript.messages.find((entry) => entry.id === 'soak-turn-04')?.text || '', /command-network certificate compatibility/);
assert.match(liveMessageScript.messages.find((entry) => entry.id === 'soak-turn-04')?.text || '', /preserved handoff telemetry buffer/);
assert.match(liveMessageScript.messages.find((entry) => entry.id === 'soak-turn-04')?.text || '', /shipboard inert diagnostic pattern/);
assert.match(liveMessageScript.messages.find((entry) => entry.id === 'soak-turn-06')?.text || '', /target transporter room two standby readiness/);
assert.match(liveMessageScript.messages.find((entry) => entry.id === 'soak-turn-06')?.text || '', /Method: muster-only preparation/);
assert.match(liveMessageScript.messages.find((entry) => entry.id === 'soak-turn-07')?.text || '', /target a passive intercept geometry/);
assert.match(liveMessageScript.messages.find((entry) => entry.id === 'soak-turn-07')?.text || '', /Method: warp-three trim/);
assert.doesNotMatch(liveMessageScript.messages.find((entry) => entry.id === 'soak-turn-07')?.text || '', /attempts to push toward/i);
assert.match(liveMessageScript.messages.find((entry) => entry.id === 'soak-turn-08')?.text || '', /warm-standby shields/);
assert.match(liveMessageScript.messages.find((entry) => entry.id === 'soak-turn-08')?.text || '', /target shield-generator standby validation/);
assert.match(liveMessageScript.messages.find((entry) => entry.id === 'soak-turn-08')?.text || '', /Method: mandatory four-hour rotations/);
assert.match(liveMessageScript.messages.find((entry) => entry.id === 'soak-turn-15')?.assist?.sendText || '', /command-network certificate stack/);
assert.equal(liveMessageScript.messages.some((entry) => entry.assist?.action === 'briefMe'), true);
assert.equal(liveMessageScript.messages.some((entry) => entry.assist?.mode === 'tryAgain'), true);
assert.equal(liveMessageScript.coverageLimitations.some((entry) => /edit\/delete\/message-action/.test(entry)), true);
const fullCompletionAssessment = liveSmokeDelegationAssessment({
  result: { ok: true },
  smokeSummary: { ok: true, chatCampaign: { sentMessageCount: SOAK_TURN_SCRIPT.length, qualityStatus: 'pass' } },
  messageScript: liveMessageScript
});
assert.equal(fullCompletionAssessment.status, 'pass');
const warningCompletionAssessment = liveSmokeDelegationAssessment({
  result: { ok: true },
  smokeSummary: { ok: true, chatCampaign: { sentMessageCount: SOAK_TURN_SCRIPT.length, qualityStatus: 'warning' } },
  messageScript: liveMessageScript
});
assert.equal(warningCompletionAssessment.status, 'warning');
const prematurePendingAssessment = liveSmokeDelegationAssessment({
  result: { ok: true },
  smokeSummary: {
    ok: true,
    chatCampaign: {
      sentMessageCount: 8,
      qualityStatus: 'warning',
      stoppedOnPendingInteraction: { kind: 'clarificationNeeded' }
    }
  },
  messageScript: liveMessageScript
});
assert.equal(prematurePendingAssessment.status, 'fail');
assert.match(prematurePendingAssessment.summary, /stopped after 8 of 52 planned turn/);
const limitedLiveMessageScript = buildSoakChatMessageScript({ turnLimit: 1 });
assert.equal(limitedLiveMessageScript.plannedTurnCount, SOAK_TURN_SCRIPT.length);
assert.equal(limitedLiveMessageScript.executedTurnLimit, 1);
assert.equal(limitedLiveMessageScript.messages.length, 1);
assert.equal(limitedLiveMessageScript.messages.at(0).id, 'soak-turn-01');
assert.deepEqual(limitedLiveMessageScript.hostNativeCompletionRequiredMessages, []);
assert.equal(limitedLiveMessageScript.coverageLimitations.some((entry) => /intentionally limited to 1 of 52 planned turns/.test(entry)), true);
const hostNativeLimitedScript = buildSoakChatMessageScript({ turnLimit: 3 });
assert.deepEqual(hostNativeLimitedScript.hostNativeCompletionRequiredMessages.map((entry) => entry.id), ['soak-turn-03']);
assert.equal(SOAK_COMMAND_CONDUCT_SCENARIOS.length, 4);
assert.equal(SOAK_COMMAND_CONDUCT_SCENARIOS.some((entry) => entry.id === 'captain-public-verbal-fight'), true);
assert.equal(SOAK_COMMAND_CONDUCT_SCENARIOS.some((entry) => entry.id === 'bridge-inebriation-illicit-substances'), true);
assert.equal(SOAK_COMMAND_CONDUCT_SCENARIOS.some((entry) => entry.id === 'physical-assault-on-officer'), true);
assert.equal(SOAK_COMMAND_CONDUCT_SCENARIOS.some((entry) => entry.id === 'unhinged-command-pattern'), true);
assert.equal(SOAK_COMMAND_CONDUCT_SCENARIOS.every((entry) => entry.terminalConditionFamily === 'command-fitness'), true);
assert.equal(SOAK_COMMAND_CONDUCT_SCENARIOS.every((entry) => entry.playerInputStyle === 'naturalistic-roleplay-no-catastrophic-keywords'), true);
assert.equal(SOAK_COMMAND_CONDUCT_SCENARIOS.every((entry) => entry.catastrophicLanguageAllowed === false), true);
assert.equal(SOAK_COMMAND_CONDUCT_SCENARIOS.every((entry) => entry.preTerminalExpectation), true);
assert.equal(SOAK_COMMAND_CONDUCT_SCENARIOS.every((entry) => entry.recoveryExpectation), true);
assert.equal(SOAK_COMMAND_CONDUCT_SCENARIOS.every((entry) => entry.proportionalityRequirement), true);
assert.equal(SOAK_COMMAND_CONDUCT_SCENARIOS.every((entry) => entry.probeSequence.length >= 4), true);
assert.equal(SOAK_COMMAND_CONDUCT_SCENARIOS.every((entry) => entry.probeSequence.some((probe) => probe.threshold === 'first-threshold')), true);
assert.equal(SOAK_COMMAND_CONDUCT_SCENARIOS.every((entry) => entry.probeSequence.some((probe) => probe.threshold === 'recovery-threshold')), true);
assert.equal(SOAK_COMMAND_CONDUCT_SCENARIOS.every((entry) => entry.probeSequence.some((probe) => probe.threshold === 'escalation-threshold')), true);
assert.equal(SOAK_COMMAND_CONDUCT_SCENARIOS.every((entry) => entry.probeSequence.some((probe) => probe.threshold === 'terminal-threshold')), true);
assert.equal(SOAK_COMMAND_CONDUCT_SCENARIOS.every((entry) => entry.probeSequence.some((probe) => probe.shouldTriggerTerminalDecision === true)), true);
assert.equal(SOAK_COMMAND_CONDUCT_SCENARIOS.every((entry) => entry.probeSequence.some((probe) => probe.shouldTriggerTerminalDecision === false)), true);
const catastrophicLanguage = /\b(?:self[- ]?destruct|auto[- ]?destruct|abandon ship|escape pods?|campaign objective fails|trigger(?:s|ed)? end conditions?|terminal checkpoint)\b/i;
for (const scenario of SOAK_COMMAND_CONDUCT_SCENARIOS) {
  assert.equal(catastrophicLanguage.test(scenario.playerIntent), false, `${scenario.id} playerIntent must avoid catastrophic shortcut language`);
  for (const probe of scenario.probeSequence) {
    assert.equal(catastrophicLanguage.test(probe.playerBehavior), false, `${scenario.id}/${probe.id} playerBehavior must avoid catastrophic shortcut language`);
    assert.equal(catastrophicLanguage.test(probe.expectedStatus), false, `${scenario.id}/${probe.id} expectedStatus must avoid catastrophic shortcut language`);
  }
}
assert.equal(SOAK_END_CONDITION_SCENARIOS.length, 8);
assert.deepEqual(
  SOAK_END_CONDITION_SCENARIOS.map((entry) => entry.expectedAction).sort(),
  [
    'keepEnding',
    'keepEnding',
    'pushOn',
    'pushOn',
    'replayFromCheckpoint',
    'replayFromCheckpoint',
    'saveTerminalBranch',
    'saveTerminalBranch'
  ]
);
assert.deepEqual(
  SOAK_END_CONDITION_SCENARIOS.map((entry) => entry.expectedDecisionStatus).sort(),
  ['keptEnding', 'keptEnding', 'pending', 'pending', 'pushedOn', 'pushedOn', 'replayed', 'replayed']
);
assert.equal(SOAK_END_CONDITION_SCENARIOS.filter((entry) => entry.triggerKind === 'catastrophic-command').length, 4);
assert.equal(SOAK_END_CONDITION_SCENARIOS.filter((entry) => entry.triggerKind === 'command-fitness-ladder').length, 4);
assert.equal(
  SOAK_END_CONDITION_SCENARIOS
    .filter((entry) => entry.triggerKind === 'command-fitness-ladder')
    .every((entry) => entry.sourceConductScenarioIds.length === SOAK_COMMAND_CONDUCT_SCENARIOS.length),
  true
);

const report = await buildDryRunReport();
assert.equal(report.kind, 'directive.liveCampaignSoak.report');
assert.equal(report.modelCallPolicy.budget, 'unlimited');
assert.equal(report.modelCallPolicy.failurePolicyEvidence, null);
assert.equal(report.releaseCertificationSummary.status, report.status);
assert.equal(report.releaseCertificationSummary.mode, report.mode);
assert.equal(report.releaseCertificationSummary.checkCounts.total, report.checks.length);
assert.equal(report.releaseCertificationSummary.evidenceCounts.campaigns, SOAK_CAMPAIGN_MATRIX.length);
assert.equal(report.releaseCertificationSummary.evidenceCounts.plannedTurns, SOAK_TURN_SCRIPT.length);
const factualGroundingGate = report.releaseCertificationSummary.evidenceGates.find((entry) => entry.id === 'factual-grounding');
assert(factualGroundingGate);
assert.equal(factualGroundingGate.evidence.modelReviewRequestArtifact, 'fact-checks/model-assisted-review/request.json');
assert.equal(factualGroundingGate.evidence.modelReviewResultArtifact, 'fact-checks/model-assisted-review/result.json');
assert(report.releaseCertificationSummary.evidenceGates.some((entry) => entry.id === 'live-model-call-failure-policy'));
assert.match(report.releaseCertificationSummary.nextAction, /warning|live|strict|Fix|Run/i);
assert.equal(report.strictModePolicy.enabled, false);
assert.equal(report.strictModePolicy.warningStatus, 'warning');
assert(report.strictModePolicy.env.includes('--strict'));
assert.equal(report.driverPolicy.primary, 'playwright');
assert.equal(report.driverPolicy.fallbackEvidenceIsEquivalent, false);
assert.equal(report.liveLogPolicy.artifact, 'live-log.jsonl');
assert.equal(report.checkpointArtifactPolicy.required, true);
assert.equal(report.checkpointArtifactPolicy.artifactDirectory, 'snapshots');
assert.equal(report.checkpointArtifactPolicy.liveLogRecord, 'checkpoint');
assert.match(report.checkpointArtifactPolicy.captureCadence, /live run start/);
assert.deepEqual(report.turnSettlementPolicy.nonTerminalIngressStatuses, ['classifying', 'classified']);
assert.match(report.turnSettlementPolicy.failurePolicy, /P1 turn-settlement failure/);
assert.equal(report.readableTranscriptPolicy.required, true);
assert.equal(report.playerInputPolicy.required, true);
assert.equal(report.playerInputPolicy.defaultPerspective, 'third-person');
assert.match(report.playerInputPolicy.narrationDetectionPolicy, /first-person narration warnings/);
assert.equal(report.playerInputPolicy.qualityDimensions.includes('player-agency discipline'), true);
assert.equal(report.storyQualityPolicy.required, true);
assert.equal(report.storyQualityPolicy.artifactDirectory, 'quality-review');
assert.equal(report.storyQualityPolicy.scoreArtifact, 'quality-review/scores.jsonl');
assert.equal(report.storyQualityPolicy.manualReviewTemplateArtifact, 'quality-review/manual-review-template.json');
assert.equal(report.storyQualityPolicy.manualReviewImportArtifact, 'quality-review/manual-review-import.jsonl');
assert.equal(report.storyQualityPolicy.modelReviewRequestArtifact, 'quality-review/model-assisted-review/request.json');
assert.equal(report.storyQualityPolicy.modelReviewResultArtifact, 'quality-review/model-assisted-review/result.json');
assert.equal(report.storyQualityPolicy.scoreDefinitions.length, 4);
assert(report.storyQualityPolicy.dimensions.includes('continuity'));
assert(report.storyQualityPolicy.dimensions.includes('command-log-usefulness'));
assert.equal(report.storyQualityPolicy.passCriteria.noScoreZero, true);
assert.equal(report.storyQualityPolicy.passCriteria.releaseCandidateMinimumAverage, 2);
assert.equal(report.releaseCertificationSummary.evidenceCounts.storyQualityDimensions, report.storyQualityPolicy.dimensions.length);
assert(report.releaseCertificationSummary.evidenceGates.some((entry) => entry.id === 'story-quality'));
assert.equal(report.sceneHandshakePolicy.required, true);
assert.equal(report.sceneHandshakePolicy.intervalLogRecord, 'scene-handshake-settlement');
assert(report.sceneHandshakePolicy.modelRoles.includes('sceneHandshakeSettler'));
assert(report.sceneHandshakePolicy.allowedRoots.includes('mission.openAssignments'));
assert(report.sceneHandshakePolicy.certificationGates.includes('prompt-rebuild-happens-before-current-player-classification'));
assert(report.sceneHandshakePolicy.minimumEvidence.includes('wrong-chat-or-wrong-save-no-mutation-check'));
assert(report.sceneHandshakePolicy.stateInspection.includes('sidecar-scheduling-after-settlement-revision'));
assert.equal(report.timekeepingPolicy.required, true);
assert.equal(report.timekeepingPolicy.artifactDirectory, 'timekeeping');
assert.equal(report.timekeepingPolicy.intervalLogRecord, 'timekeeping-header-check');
assert.equal(report.timekeepingPolicy.expectedHeaderPattern, '*Stardate #####.# | HHMM hours*');
assert(report.timekeepingPolicy.requiredSurfaces.includes('host-native-injectAndContinue'));
assert(report.timekeepingPolicy.certificationGates.includes('headers-are-stripped-from-model-and-evidence-paths'));
assert(report.timekeepingPolicy.stateInspection.includes('stale-header-strip-result-and-duplicate-header-count'));
assert.equal(report.objectiveAssignmentProjectionPolicy.required, true);
assert.equal(report.objectiveAssignmentProjectionPolicy.artifactDirectory, 'objective-assignments');
assert.equal(report.objectiveAssignmentProjectionPolicy.liveLogRecord, 'objective-assignment-projection-check');
assert(report.objectiveAssignmentProjectionPolicy.triggerSources.includes('scene-handshake-accepted-assignment'));
assert(report.objectiveAssignmentProjectionPolicy.requiredSurfaces.some((entry) => entry.id === 'mission-current-orders'));
assert(report.objectiveAssignmentProjectionPolicy.requiredSurfaces.some((entry) => entry.id === 'command-log-entry'));
assert(report.objectiveAssignmentProjectionPolicy.requiredSurfaces.some((entry) => entry.id === 'crew-character-link'));
assert(report.objectiveAssignmentProjectionPolicy.certificationGates.includes('accepted-assignment-state-projects-to-mission-log-and-linked-crew'));
assert(report.objectiveAssignmentProjectionPolicy.minimumEvidence.includes('mission-current-orders-visible-excerpt-and-screenshot'));
assert(report.objectiveAssignmentProjectionPolicy.stateInspection.includes('visible-mission-log-crew-text-hashes-and-screenshot-paths'));
assert.equal(report.factualGroundingPolicy.required, true);
assert.equal(report.factualGroundingPolicy.artifactDirectory, 'fact-checks');
assert.equal(report.factualGroundingPolicy.packIndexArtifact, 'fact-checks/canary-index.json');
assert.equal(report.factualGroundingPolicy.modelReviewRequestArtifact, 'fact-checks/model-assisted-review/request.json');
assert.equal(report.factualGroundingPolicy.modelReviewResultArtifact, 'fact-checks/model-assisted-review/result.json');
assert.equal(report.factualGroundingPolicy.liveLogRecord, 'fact-check');
assert(report.factualGroundingPolicy.evaluationPhases.includes('prompt-availability-audit'));
assert(report.factualGroundingPolicy.evaluationPhases.includes('generation-verdict'));
assert(report.factualGroundingPolicy.canaryCategories.includes('senior-crew-identity'));
assert(report.factualGroundingPolicy.canaryCategories.includes('active-mission-frame'));
assert(report.factualGroundingPolicy.verdicts.includes('unsupported-detail'));
assert(report.factualGroundingPolicy.rootCauseLabels.includes('cross-campaign-bleed'));
assert(report.factualGroundingPolicy.generationAuditLevels.some((entry) => entry.id === 'light-check'));
assert(report.factualGroundingPolicy.highRiskFullCheckTriggers.includes('human-reviewer-flags-good-prose-wrong-fact'));
assert(report.factualGroundingPolicy.expectedFactsBeforeGeneration.some((entry) => entry.sceneId === 'ashes-opening-bronn-and-transfer-premise'));
assert(report.factualGroundingPolicy.diagnosticFields.sourceStatus.includes('hidden-only'));
assert(report.factualGroundingPolicy.diagnosticFields.recoveryStatus.includes('requires-fix'));
assert.match(report.factualGroundingPolicy.lanePausePolicy, /refresh transcript artifacts/);
assert(report.factualGroundingPolicy.minimumEvidence.includes('prompt-block-id-or-availability-status-for-each-required-fact'));
assert.match(report.factualGroundingPolicy.failureSeverityPolicy, /P1/);
assert.equal(report.continuityProjectionMatrixPolicy.required, true);
assert.equal(report.continuityProjectionMatrixPolicy.artifactDirectory, 'continuity-projection-matrix');
assert.equal(report.continuityProjectionMatrixPolicy.coordinatorScript, 'tools/scripts/run-continuity-matrix-five-user-soak.mjs');
assert(report.continuityProjectionMatrixPolicy.requiredPromptKeys.includes('directive.scene.active'));
assert(report.continuityProjectionMatrixPolicy.requiredSourceIds.includes('ship.uss-breckenridge.travel.not-six-days-impulse'));
assert(report.continuityProjectionMatrixPolicy.requiredSourceIds.includes('ship.uss-breckenridge.travel.not-short-refit-duration'));
assert(report.continuityProjectionMatrixPolicy.modelRoles.includes('continuityProjectionPlanner'));
assert(report.continuityProjectionMatrixPolicy.certificationGates.includes('mission-director-packets-carry-continuity-projection-digest'));
assert(report.continuityProjectionMatrixPolicy.minimumEvidence.includes('five-user-coordinator-report-or-explicit bounded-run warning'));
assert(report.releaseCertificationSummary.evidenceGates.some((entry) => entry.id === 'continuity-projection-matrix'));
assert.equal(report.factualCanaryPacks.length, SOAK_CAMPAIGN_MATRIX.length);
assert.equal(report.factualCanaryPackSummary.length, SOAK_CAMPAIGN_MATRIX.length);
assert.equal(report.factualCanaryPacks.every((pack) => pack.canaryCount >= 10), true);
assert(report.factualCanaryPackSummary.some((entry) => entry.packageId === 'directive:campaign-package:breckenridge-ashes-of-peace'));
assert(report.factualCanaryPacks.some((pack) => pack.canaries.some((entry) => entry.id.endsWith('.opening.transit-premise'))));
assert.equal(report.campaignMatrixCanaries.length, SOAK_CAMPAIGN_MATRIX.length);
assert.equal(report.releaseCertificationSummary.evidenceCounts.campaignMatrixCanaries, SOAK_CAMPAIGN_MATRIX.length);
assert.equal(
  report.releaseCertificationSummary.evidenceCounts.campaignMatrixCanaryTurns,
  report.campaignMatrixCanaries.reduce((sum, script) => sum + Number(script.plannedCanaryTurns || 0), 0)
);
assert.equal(report.commandBearingSystemPolicy.required, true);
assert.equal(report.commandBearingSystemPolicy.intervalLogRecord, 'command-bearing-interval');
assert(report.commandBearingSystemPolicy.certificationGates.includes('mark-review-grades-agency-commitment-causality-track-fit-and-distinctness'));
assert(report.commandBearingSystemPolicy.intervalPlaybook.includes('recovery-after-evidence-review-or-spend'));
assert(report.commandBearingSystemPolicy.closureProofLevels.includes('scene-end-is-pacing-only-and-never-mark-review-proof'));
assert(report.commandBearingSystemPolicy.boundaryDetectionLadder.includes('thread-closure-queues-relevant-evidence-only'));
assert(report.commandBearingSystemPolicy.markReviewGates.includes('track-fit-required'));
assert(report.commandBearingSystemPolicy.stateInspection.includes('player-safe-ui-projection-cross-checked-against-authoritative-save'));
assert.match(report.commandBearingSystemPolicy.failureSeverityPolicy, /scene-end-only Marks/);
assert.equal(report.campaignMatrix.length, SOAK_CAMPAIGN_MATRIX.length);
assert.equal(report.phases.length, SOAK_PHASES.length);
assert.equal(report.turnScript.length, SOAK_TURN_SCRIPT.length);
assert.equal(report.commandConductScenarios.length, SOAK_COMMAND_CONDUCT_SCENARIOS.length);
assert.equal(report.endConditionScenarios.length, SOAK_END_CONDITION_SCENARIOS.length);
assert(report.checks.some((entry) => entry.id === 'playwright-import'));
assert(report.checks.some((entry) => entry.id === 'playwright-browser-control'));
assert(report.checks.some((entry) => entry.id === 'terminal-endings-live-smoke-source'));
assert(report.checks.some((entry) => entry.id === 'served-extension-freshness'));
assert(report.checks.some((entry) => entry.id === 'extension-sync-before-testing'));
assert(report.checks.some((entry) => entry.id === 'reserved-human-user'));
assert(report.checks.some((entry) => entry.id === 'author-note-cleanliness'));
assert(report.checks.some((entry) => entry.id === 'live-execution-soak-user'));
assert(report.checks.some((entry) => entry.id === 'live-execution-turn-limit'));
const liveSmokeEnv = buildLiveSmokeEnvironment({ report, messageScriptPath: 'artifacts/live-script.json' });
assert.equal(liveSmokeEnv.DIRECTIVE_SILLYTAVERN_BROWSER, '1');
assert.equal(liveSmokeEnv.DIRECTIVE_SILLYTAVERN_CHAT_CAMPAIGN, '1');
assert.equal(liveSmokeEnv.DIRECTIVE_SILLYTAVERN_GENERATION, '1');
assert.equal(liveSmokeEnv.DIRECTIVE_LIVE_GENERATION, '1');
assert.equal(liveSmokeEnv.DIRECTIVE_SILLYTAVERN_STRICT, '1');
assert.equal(liveSmokeEnv.DIRECTIVE_SILLYTAVERN_WAIT_SIDECARS_EACH_TURN, '1');
assert.equal(liveSmokeEnv.DIRECTIVE_SILLYTAVERN_BROWSER_TIMEOUT_MS, '45000');
assert.equal(liveSmokeEnv.DIRECTIVE_SILLYTAVERN_UI_BOOT_TIMEOUT_MS, '60000');
assert.equal(liveSmokeEnv.DIRECTIVE_SILLYTAVERN_CHAT_TIMEOUT_MS, '300000');
assert.equal(liveSmokeEnv.DIRECTIVE_SILLYTAVERN_GENERATION_TIMEOUT_MS, '240000');
assert.equal(liveSmokeEnv.DIRECTIVE_SILLYTAVERN_SIDECAR_SETTLE_TIMEOUT_MS, '180000');
assert.equal(liveSmokeEnv.DIRECTIVE_SILLYTAVERN_CHAT_MESSAGES_FILE, 'artifacts/live-script.json');
assert.match(liveSmokeEnv.DIRECTIVE_SILLYTAVERN_ARTIFACT_DIR, /smoke-chat-soak$/);
assert.equal(liveSmokeEnv.DIRECTIVE_SILLYTAVERN_PROMPT_INSPECTION_DIR, report.artifacts.promptInspection);
assert.equal(liveSmokeEnv.DIRECTIVE_SILLYTAVERN_HOST_EXTENSIONS_DIR, report.artifacts.hostExtensions);
assert.match(liveSmokeEnv.DIRECTIVE_SILLYTAVERN_CAMPAIGN_PACKAGE_ID, /breckenridge-ashes-of-peace/);
const priorExecutionUser = process.env.DIRECTIVE_SILLYTAVERN_USER;
process.env.DIRECTIVE_SILLYTAVERN_USER = 'directive-soak-z';
const overrideExecutionEnv = buildLiveSmokeEnvironment({ report, messageScriptPath: 'artifacts/live-script.json' });
assert.equal(overrideExecutionEnv.DIRECTIVE_SILLYTAVERN_USER, 'directive-soak-z');
if (priorExecutionUser === undefined) delete process.env.DIRECTIVE_SILLYTAVERN_USER;
else process.env.DIRECTIVE_SILLYTAVERN_USER = priorExecutionUser;
assert.equal(fs.existsSync('tools/scripts/check-sillytavern-multi-user-soak-readiness.mjs'), true);

const browserProbe = await verifyPlaywrightBrowserEnvironment({ captureArtifacts: false });
assert.equal(browserProbe.ok, true, JSON.stringify(browserProbe.error || browserProbe));
assert.equal(browserProbe.interaction.resultText, '1');

const tempRoot = tempArtifactRoot();
const paths = createArtifactPaths({ rootDir: tempRoot, runId: 'prep-test' });
ensureArtifactTree(paths);
const factualCanaryIndex = writeFactualGroundingCanaryArtifacts({ packs: factualCanaryPacks, artifactPaths: paths });
const campaignCanaryIndex = writeCampaignMatrixCanaryArtifacts({ scripts: report.campaignMatrixCanaries, artifactPaths: paths });
const initializedQualitySummary = initializeStoryQualityReviewArtifacts({ artifactPaths: paths, policy: report.storyQualityPolicy });
const qualityScorePath = writeStoryQualityScoreRecord({ artifactPaths: paths, record: strongQualityScore });
const writtenQualitySummary = writeStoryQualityPhaseSummaryArtifact({
  artifactPaths: paths,
  scores: [strongQualityScore, failingQualityScore],
  policy: report.storyQualityPolicy
});
const badFactCheckArtifactPath = writeFactualGroundingCheckArtifact({ check: badFactCheck, artifactPaths: paths });
const tempReport = { ...report, artifacts: paths };
const badTranscriptLines = [
  JSON.stringify({ index: 0, isUser: true, isSystem: false, text: 'Commander Arlen asks for the bridge handoff.' }),
  JSON.stringify({
    index: 1,
    isUser: false,
    isSystem: false,
    directiveOwned: true,
    responseKind: 'committedOutcome',
    text: 'Lieutenant Commander Hadrik Bronn, a 40-year-old Human officer, says the Breckenridge has been at impulse for 6 days.'
  })
].join('\n') + '\n';
writeTextFile(paths.sourceChatTranscript, badTranscriptLines);
const promptSnapshotPath = path.join(paths.promptInspection, 'pre-generation-soak-turn-01-0001.json');
writeJsonFile(promptSnapshotPath, {
  kind: 'directive.sillytavern.promptInspectionSnapshot',
  promptInspection: {
    status: 'active',
    externalPromptEnvironmentRef: {
      kind: 'directive.externalPromptEnvironmentRef.v1',
      schemaVersion: 1,
      hash: 'b'.repeat(64),
      byteLength: 640,
      status: 'observed',
      observedAt: '2026-06-28T23:20:00.000Z',
      knownExternalPromptKeys: ['summaryception', '3_vectfox', 'worldInfoBefore']
    },
    knownExternalPromptKeys: ['summaryception', '3_vectfox', 'worldInfoBefore'],
    directiveOwnedPromptKeys: ['directive.contract', 'directive.scene.active'],
    finalHostPromptMayIncludeExternal: true,
    externalPromptEnvironmentTargets: {
      memoryBooks: {
        rangeDiagnostics: { status: 'valid', validCount: 1, hash: 'm'.repeat(64) }
      },
      summaryception: {
        staleness: { status: 'observed', summarizedOnlyCount: 1, hash: 's'.repeat(64) }
      },
      vectFox: {
        backendDiagnostics: { status: 'local-backend-configured', backendType: 'redacted-local', hash: 'v'.repeat(64) }
      }
    },
    unavailableSignals: [],
    redactions: [{ key: 'qdrant_api_key', reason: 'secret' }],
    blocks: [
      { id: 'relevant-crew', title: 'Relevant Crew Context', hash: 'crew-hash' },
      { id: 'immediate-scene', title: 'Immediate Scene', hash: 'scene-hash' },
      { id: 'ship-status', title: 'Relevant Ship Status', hash: 'ship-hash' }
    ]
  }
});
const transcriptSnapshotPath = path.join(paths.transcript, 'snapshots', '0002-turn-end-soak-turn-01.source-chat.jsonl');
writeTextFile(transcriptSnapshotPath, badTranscriptLines);
const postSmokeAudit = buildPostSmokeFactualGroundingAudit({
  report: tempReport,
  smokeSummary: {
    chatCampaign: {
      packageId: ashesCanaryPack.packageId
    }
  },
  smokeReport: {
    browser: {
      chatCampaignFlow: {
        rounds: [
          {
            scriptMessageId: 'soak-turn-01',
            promptInspection: {
              artifactPath: promptSnapshotPath
            },
            transcript: {
              snapshotSourceChatTranscript: transcriptSnapshotPath
            }
          }
        ],
        final: {
          promptInspection: {
            status: 'active',
            blocks: [
              { id: 'relevant-crew', title: 'Relevant Crew Context', hash: 'crew-hash' },
              { id: 'immediate-scene', title: 'Immediate Scene', hash: 'scene-hash' },
              { id: 'ship-status', title: 'Relevant Ship Status', hash: 'ship-hash' }
            ]
          }
        }
      }
    }
  }
});
assert.equal(postSmokeAudit.status, 'fail');
assert.equal(postSmokeAudit.perGenerationCheckCount, 1);
assert.equal(postSmokeAudit.transcriptLevelCheckCount, 1);
assert.equal(postSmokeAudit.checks.length, 2);
assert.equal(postSmokeAudit.checks[0].generatedMessageId, 'soak-turn-01');
assert.equal(postSmokeAudit.checks[0].counts.contradicted, 2);
assert.equal(postSmokeAudit.checks[0].promptAvailability.checked, true);
assert.equal(postSmokeAudit.check.counts.contradicted, 2);
assert.equal(postSmokeAudit.promptBlockCount, 3);
assert.equal(postSmokeAudit.modelAssistedReviewRequest.kind, 'directive.liveCampaignSoak.factualModelReviewRequest');
assert.equal(postSmokeAudit.modelAssistedReviewResult.status, 'not-run');
assert.match(postSmokeAudit.modelAssistedReviewRequestPathRelative, /^fact-checks\/model-assisted-review\/request\.json$/);
assert.match(postSmokeAudit.modelAssistedReviewResultPathRelative, /^fact-checks\/model-assisted-review\/result\.json$/);
assert.equal(readJsonFile(postSmokeAudit.modelAssistedReviewRequestPath).inputHash, postSmokeAudit.modelAssistedReviewRequest.inputHash);
assert(postSmokeAudit.artifactPaths.some((entry) => /fact-checks\/soak-turn-01\/fact-check\.json$/.test(entry)));
assert.match(postSmokeAudit.artifactPathRelative, /^fact-checks\/transcript-level\/fact-check\.json$/);
assert.equal(readJsonFile(postSmokeAudit.artifactPath).kind, 'directive.liveCampaignSoak.factualCheck');
writeJsonFile(paths.report, report);
appendJsonLine(paths.liveLog, { kind: 'run-start', status: 'planned' });
appendJsonLine(paths.turns, { turn: 1, status: 'planned' });
writeJsonFile(paths.transcriptIndex, { runId: 'prep-test', readableTranscript: paths.readableTranscript });
const checkpointResult = writeSoakCheckpoint({
  report: {
    ...report,
    runId: 'prep-test',
    artifacts: paths
  },
  checkpointId: 'Prep Checkpoint 01',
  stage: 'prep-test',
  status: 'warning',
  details: {
    artifactProbe: true,
    fullTranscriptIncluded: false
  }
});
const smokeReadableTranscript = path.join(paths.root, 'smoke-chat-soak', 'transcript', 'readable-chat.md');
const smokeSourceTranscript = path.join(paths.root, 'smoke-chat-soak', 'transcript', 'source-chat.jsonl');
const smokeSnapshotReadableTranscript = path.join(paths.root, 'smoke-chat-soak', 'transcript', 'snapshots', '0002-turn-end-soak-turn-01.readable-chat.md');
const smokeSnapshotSourceTranscript = path.join(paths.root, 'smoke-chat-soak', 'transcript', 'snapshots', '0002-turn-end-soak-turn-01.source-chat.jsonl');
writeTextFile(smokeReadableTranscript, '# Smoke transcript\n\nCommander Arlen waits for Bronn.\n');
writeTextFile(smokeSourceTranscript, `${JSON.stringify({ index: 0, isUser: true, text: 'Commander Arlen waits.' })}\n`);
writeTextFile(smokeSnapshotReadableTranscript, '# Smoke snapshot\n');
writeTextFile(smokeSnapshotSourceTranscript, `${JSON.stringify({ index: 0, isUser: false, text: 'Bronn answers.' })}\n`);
const smokeReportForPromotion = {
  browser: {
    chatCampaignFlow: {
      rounds: [
        {
          scriptMessageId: 'soak-turn-01',
          scriptLabel: 'Clean play opening',
          scriptCategory: 'clean-play',
          playerInputPerspective: 'third-person',
          declaredPlayerInputPerspective: 'third-person',
          preferredPlayEvidence: true,
          textPreview: 'Commander Arlen waits.',
          responseCount: 1,
          ingressCount: 1,
          modelCalls: [{ roleId: 'turnIntentClassifier', status: 'ok', model: 'utility-test' }],
          pendingInteractionCount: 0,
          turnLedgerCount: 1,
          commandLogCount: 1,
          recentMessages: [{ role: 'assistant', text: 'Bronn answers.' }],
          generationTiming: {
            persisted: {
              status: 'pass',
              source: 'coreStoreTurnTiming',
              timingSource: 'coreProjection',
              checkedResponseCount: 1,
              maxGenerationStartLatencyMs: 4200,
              entries: [
                {
                  route: 'directivePosted',
                  strategy: 'directivePosted',
                  responseKind: 'committedOutcome',
                  timingStatus: 'pass',
                  turnLatency: {
                    generationStartLatencyMs: 4200,
                    architectureWithin60s: true
                  }
                }
              ]
            },
            runtime: {
              status: 'pass',
              source: 'runtimeSnapshot',
              checkedResponseCount: 1,
              maxGenerationStartLatencyMs: 4200,
              entries: []
            }
          },
          hostNativeCompletion: {
            persisted: {
              status: 'pass',
              source: 'coreStoreResponseLedger',
              completionSource: 'coreProjection',
              completedHostContinueCount: 1,
              failedHostContinueCount: 0,
              maxCompletionLatencyMs: 9000,
              entries: [
                {
                  responseId: 'response-host-1',
                  transactionId: 'txn-host-1',
                  route: 'hostContinue',
                  responseKind: 'hostContinue',
                  hostMessageId: 'assistant-host-1',
                  textHash: 'h'.repeat(64),
                  completionStatus: 'pass'
                }
              ]
            }
          },
          promptInspection: { artifactPath: promptSnapshotPath },
          transcript: { snapshotSourceChatTranscript: smokeSnapshotSourceTranscript, snapshotReadableTranscript: smokeSnapshotReadableTranscript }
        }
      ],
      generationTimingProof: {
        status: 'pass',
        source: 'coreStoreTurnTiming',
        timingSource: 'coreProjection',
        proofCount: 1,
        checkedTurnCount: 1,
        skippedTurnCount: 1,
        maxGenerationStartLatencyMs: 4200,
        routes: ['directivePosted'],
        skippedEntries: [
          {
            route: 'directivePosted',
            responseKind: 'clarificationNeeded',
            timingStatus: 'skipped-non-generation'
          }
        ]
      },
      hostNativeCompletionProof: {
        status: 'pass',
        source: 'coreStoreResponseLedger',
        completionSource: 'coreProjection',
        proofCount: 1,
        completedHostContinueCount: 1,
        failedHostContinueCount: 0,
        maxCompletionLatencyMs: 9000,
        transactionIds: ['txn-host-1'],
        entries: [
          {
            responseId: 'response-host-1',
            transactionId: 'txn-host-1',
            route: 'hostContinue',
            responseKind: 'hostContinue',
            hostMessageId: 'assistant-host-1',
            textHash: 'h'.repeat(64),
            completionStatus: 'pass'
          }
        ]
      },
      transcriptCaptures: [
        {
          reason: 'turn-end',
          scriptMessageId: 'soak-turn-01',
          currentChatId: 'chat-test',
          messageCount: 2,
          readableTranscript: smokeReadableTranscript,
          sourceChatTranscript: smokeSourceTranscript,
          snapshotReadableTranscript: smokeSnapshotReadableTranscript,
          snapshotSourceChatTranscript: smokeSnapshotSourceTranscript,
          transcriptIndex: path.join(paths.root, 'smoke-chat-soak', 'transcript', 'index.json')
        }
      ],
      promptInspectionCaptures: [
        {
          reason: 'pre-generation',
          scriptMessageId: 'soak-turn-01',
          scriptCategory: 'clean-play',
          artifactPath: promptSnapshotPath,
          promptInspection: { blocks: [{ id: 'relevant-crew' }, { id: 'ship-status' }] }
        }
      ]
    }
  }
};
const transcriptCopyResult = copyDelegatedSmokeTranscriptArtifacts({
  report: { ...report, runId: 'prep-test', artifacts: paths },
  smokeReport: smokeReportForPromotion
});
const promotionResult = promoteDelegatedSmokeEvidence({
  report: { ...report, runId: 'prep-test', artifacts: paths },
  smokeReport: smokeReportForPromotion
});
assert.equal(fs.existsSync(paths.report), true);
const liveLogLines = fs.readFileSync(paths.liveLog, 'utf8').trim().split(/\r?\n/u).map((line) => JSON.parse(line));
assert.deepEqual(liveLogLines[0], { kind: 'run-start', status: 'planned' });
assert.equal(liveLogLines.some((entry) => entry.kind === 'checkpoint' && entry.checkpointId === 'prep-checkpoint-01'), true);
assert.equal(liveLogLines.some((entry) => entry.kind === 'turn-start' && entry.scriptMessageId === 'soak-turn-01'), true);
assert.equal(liveLogLines.some((entry) => entry.kind === 'turn-end' && entry.scriptMessageId === 'soak-turn-01'), true);
const promotedTurnEnd = liveLogLines.find((entry) => entry.kind === 'turn-end' && entry.scriptMessageId === 'soak-turn-01');
assert.equal(promotedTurnEnd.generationTiming.persisted.status, 'pass');
assert.equal(promotedTurnEnd.generationTiming.persisted.entries[0].turnLatency.architectureWithin60s, true);
assert.equal(promotedTurnEnd.hostNativeCompletion.persisted.status, 'pass');
assert.equal(promotedTurnEnd.hostNativeCompletion.persisted.entries[0].textHash, 'h'.repeat(64));
assert.equal(liveLogLines.some((entry) => entry.kind === 'transcript-capture' && entry.captureMode === 'delegated-smoke-copy'), true);
const promotedPromptCapture = liveLogLines.find((entry) => entry.kind === 'prompt-inspection-capture' && entry.scriptMessageId === 'soak-turn-01');
assert(promotedPromptCapture);
assert.equal(promotedPromptCapture.externalPromptEnvironmentRef.hash, 'b'.repeat(64));
assert.equal(promotedPromptCapture.knownExternalPromptKeys.includes('summaryception'), true);
assert.equal(promotedPromptCapture.knownExternalPromptKeys.includes('3_vectfox'), true);
assert.equal(promotedPromptCapture.directiveOwnedPromptKeys.includes('directive.contract'), true);
assert.equal(promotedPromptCapture.finalHostPromptMayIncludeExternal, true);
assert.equal(promotedPromptCapture.externalPromptEnvironmentTargets.memoryBooks.rangeDiagnostics.status, 'valid');
assert.equal(promotedPromptCapture.redactionReasons.includes('secret'), true);
const externalContextSummaryPath = path.join(paths.hostExtensions, 'external-context-summary.json');
assert.equal(fs.existsSync(externalContextSummaryPath), true);
const externalContextSummary = readJsonFile(externalContextSummaryPath);
assert.equal(externalContextSummary.authority.directiveAuthority, false);
assert.equal(externalContextSummary.authority.role, 'diagnostics-provenance-only');
assert.equal(externalContextSummary.aggregate.captureCount, 1);
assert.equal(externalContextSummary.aggregate.knownExternalPromptKeys.includes('summaryception'), true);
assert.equal(externalContextSummary.aggregate.targetSummaryCount, 1);
assert.equal(externalContextSummary.targetSummaries[0].targets.vectFox.backendDiagnostics.status, 'local-backend-configured');
assert.equal(liveLogLines.some((entry) => entry.kind === 'artifact' && entry.artifact === 'external-context-summary'), true);
assert.equal(transcriptCopyResult.status, 'pass');
assert.equal(transcriptCopyResult.copied.readableTranscript, true);
assert.equal(transcriptCopyResult.copied.sourceChatTranscript, true);
assert.equal(promotionResult.turnStartRecords, 1);
assert.equal(promotionResult.turnEndRecords, 1);
assert.equal(promotionResult.transcriptRecords, 1);
assert.equal(promotionResult.promptInspectionRecords, 1);
assert.equal(promotionResult.externalContextSummary.artifactPathRelative, 'host-extensions/external-context-summary.json');
const timingAssessment = liveGenerationTimingAssessment({ smokeReport: smokeReportForPromotion });
assert.equal(timingAssessment.status, 'pass');
assert.match(timingAssessment.summary, /generation-start timing/);
assert.match(timingAssessment.summary, /deterministic non-generation turn/);
const timingAssessmentFromLiveLog = liveGenerationTimingAssessment({
  smokeReport: { browser: { chatCampaignFlow: {} } },
  liveLogRecords: liveLogLines
});
assert.equal(timingAssessmentFromLiveLog.status, 'pass');
assert.equal(timingAssessmentFromLiveLog.proof.evidenceSource, 'delegatedSmokeLiveLog');
assert.equal(timingAssessmentFromLiveLog.proof.source, 'coreStoreTurnTiming');
assert.equal(timingAssessmentFromLiveLog.proof.timingSource, 'coreProjection');
const timingAssessmentFromRunEndLiveLog = liveGenerationTimingAssessment({
  smokeReport: { browser: { chatCampaignFlow: {} } },
  liveLogRecords: [
    {
      kind: 'turn-end',
      scriptMessageId: 'soak-turn-01',
      generationTiming: {
        persisted: {
          status: 'warning',
          source: 'coreStoreTurnTiming',
          timingSource: 'coreProjection',
          targetTransactionCount: 0,
          checkedTurnCount: 0,
          entries: [],
          unavailableReason: 'no-target-turn-timing-candidates'
        }
      }
    },
    {
      kind: 'run-end',
      generationTimingProof: {
        status: 'pass',
        source: 'coreStoreTurnTiming',
        timingSource: 'coreProjection',
        proofCount: 2,
        checkedTurnCount: 1,
        checkedResponseCount: 1,
        skippedTurnCount: 0,
        maxGenerationStartLatencyMs: 4200,
        entries: [{
          route: 'hostContinue',
          responseKind: 'hostContinue',
          timingStatus: 'pass',
          turnLatency: {
            generationStartLatencyMs: 4200,
            architectureWithin60s: true
          }
        }]
      }
    }
  ]
});
assert.equal(timingAssessmentFromRunEndLiveLog.status, 'pass');
assert.equal(timingAssessmentFromRunEndLiveLog.proof.evidenceSource, 'delegatedSmokeLiveLogRunEnd');
const hostNativeCompletionAssessment = liveHostNativeCompletionAssessment({ smokeReport: smokeReportForPromotion });
assert.equal(hostNativeCompletionAssessment.status, 'pass');
assert.match(hostNativeCompletionAssessment.summary, /terminal host-native completion/);
assert.equal(hostNativeCompletionAssessment.proof.completedHostContinueCount, 1);
const requiredHostNativeCompletionSmokeReport = {
  browser: {
    chatCampaignFlow: {
      messageScript: {
        hostNativeCompletionRequiredMessages: [{
          id: 'soak-turn-03',
          turn: 3,
          expectedRoute: 'hostContinue',
          expectedResponseStrategy: 'injectAndContinue'
        }]
      },
      hostNativeCompletionProof: {
        status: 'pass',
        source: 'coreStoreResponseLedger',
        completionSource: 'coreProjection',
        completedHostContinueCount: 1,
        failedHostContinueCount: 0,
        maxCompletionLatencyMs: 9000,
        entries: [{
          responseId: 'response-host-count-only',
          transactionId: 'txn-host-count-only',
          route: 'hostContinue',
          responseKind: 'hostContinue',
          hostMessageId: 'assistant-host-count-only',
          textHash: 'c'.repeat(64),
          completionStatus: 'pass'
        }]
      }
    }
  }
};
const requiredHostNativeCountOnlyAssessment = liveHostNativeCompletionAssessment({
  smokeReport: requiredHostNativeCompletionSmokeReport
});
assert.equal(requiredHostNativeCountOnlyAssessment.status, 'fail');
assert.match(requiredHostNativeCountOnlyAssessment.summary, /missing required turn binding/);
const requiredCompletion = {
  required: true,
  status: 'pass',
  scriptMessageId: 'soak-turn-03',
  turn: 3,
  expectedRoute: 'hostContinue',
  expectedResponseStrategy: 'injectAndContinue',
  proofStatus: 'pass',
  source: 'coreStoreResponseLedger',
  completionSource: 'coreProjection',
  completedHostContinueCount: 1,
  failedHostContinueCount: 0,
  unavailableReason: null
};
requiredHostNativeCompletionSmokeReport.browser.chatCampaignFlow.hostNativeCompletionProof.requiredCompletions = [requiredCompletion];
requiredHostNativeCompletionSmokeReport.browser.chatCampaignFlow.hostNativeCompletionProof.requiredHostNativeCompletions = [requiredCompletion];
const requiredHostNativeBoundAssessment = liveHostNativeCompletionAssessment({
  smokeReport: requiredHostNativeCompletionSmokeReport
});
assert.equal(requiredHostNativeBoundAssessment.status, 'pass');
assert.match(requiredHostNativeBoundAssessment.summary, /required turn binding/);
const hostNativeCompletionAssessmentFromLiveLog = liveHostNativeCompletionAssessment({
  smokeReport: { browser: { chatCampaignFlow: {} } },
  liveLogRecords: liveLogLines
});
assert.equal(hostNativeCompletionAssessmentFromLiveLog.status, 'pass');
assert.equal(hostNativeCompletionAssessmentFromLiveLog.proof.evidenceSource, 'delegatedSmokeLiveLog');
assert.equal(hostNativeCompletionAssessmentFromLiveLog.proof.source, 'coreStoreResponseLedger');
assert.equal(hostNativeCompletionAssessmentFromLiveLog.proof.completionSource, 'coreProjection');
const hostNativeCompletionAssessmentFromRunEndLiveLog = liveHostNativeCompletionAssessment({
  smokeReport: { browser: { chatCampaignFlow: {} } },
  liveLogRecords: [
    {
      kind: 'turn-end',
      scriptMessageId: 'soak-turn-03',
      hostNativeCompletion: {
        persisted: {
          status: 'warning',
          source: 'coreStoreResponseLedger',
          completionSource: 'coreProjection',
          targetTransactionCount: 0,
          candidateResponseCount: 0,
          completedHostContinueCount: 0,
          failedHostContinueCount: 0,
          entries: [],
          unavailableReason: 'no-hostContinue-completion-candidates'
        }
      }
    },
    {
      kind: 'run-end',
      hostNativeCompletionProof: {
        status: 'pass',
        source: 'coreStoreResponseLedger',
        completionSource: 'coreProjection',
        completedHostContinueCount: 1,
        failedHostContinueCount: 0,
        requiredCompletionCount: 1,
        requiredCompletionPassCount: 1,
        requiredCompletionFailureCount: 0,
        maxCompletionLatencyMs: 9000,
        requiredCompletions: [requiredCompletion],
        requiredHostNativeCompletions: [requiredCompletion],
        entries: [{
          responseId: 'response-host-run-end',
          transactionId: 'txn-host-run-end',
          route: 'hostContinue',
          responseKind: 'hostContinue',
          hostMessageId: 'assistant-host-run-end',
          textHash: 'r'.repeat(64),
          completionStatus: 'pass'
        }]
      }
    }
  ]
});
assert.equal(hostNativeCompletionAssessmentFromRunEndLiveLog.status, 'pass');
assert.equal(hostNativeCompletionAssessmentFromRunEndLiveLog.proof.evidenceSource, 'delegatedSmokeLiveLogRunEnd');
const missingCompletionLiveLogAssessment = liveHostNativeCompletionAssessment({
  smokeReport: { browser: { chatCampaignFlow: {} } },
  liveLogRecords: [{
    kind: 'turn-end',
    scriptMessageId: 'soak-turn-03',
    hostNativeCompletion: {
      persisted: {
        status: 'warning',
        source: 'coreStoreResponseLedger',
        completionSource: 'coreProjection',
        targetTransactionCount: 1,
        candidateResponseCount: 0,
        completedHostContinueCount: 0,
        failedHostContinueCount: 0,
        entries: [],
        unavailableReason: 'no-hostContinue-completion-candidates'
      }
    }
  }]
});
assert.equal(missingCompletionLiveLogAssessment.status, 'warning');
assert.equal(missingCompletionLiveLogAssessment.proof.evidenceSource, 'delegatedSmokeLiveLog');
assert.equal(missingCompletionLiveLogAssessment.proof.unavailableReason, 'no-hostContinue-completion-candidates');
const missingHostNativeCompletionAssessment = liveHostNativeCompletionAssessment({ smokeReport: { browser: { chatCampaignFlow: {} } } });
assert.equal(missingHostNativeCompletionAssessment.status, 'warning');
const summaryOnlyHostNativeCompletionAssessment = liveHostNativeCompletionAssessment({
  smokeSummary: {
    chatCampaign: {
      hostNativeCompletionStatus: 'pass',
      hostNativeCompletionProofSource: 'coreStoreResponseLedger',
      hostNativeCompletionProofCompletionSource: 'coreProjection',
      hostNativeCompletionCount: 1,
      hostNativeCompletionMaxLatencyMs: 9000
    }
  }
});
assert.equal(summaryOnlyHostNativeCompletionAssessment.status, 'warning');
assert.match(summaryOnlyHostNativeCompletionAssessment.summary, /compact host-native completion summary/);
const runtimeOnlyHostNativeCompletionAssessment = liveHostNativeCompletionAssessment({
  smokeReport: {
    browser: {
      chatCampaignFlow: {
        hostNativeCompletionProof: {
          status: 'pass',
          source: 'runtimeSnapshot',
          completionSource: 'runtimeSnapshot',
          completedHostContinueCount: 1
        }
      }
    }
  }
});
assert.equal(runtimeOnlyHostNativeCompletionAssessment.status, 'warning');
assert.match(runtimeOnlyHostNativeCompletionAssessment.summary, /not persisted CORE projection/);
const incompleteHostNativeCompletionAssessment = liveHostNativeCompletionAssessment({
  smokeReport: {
    browser: {
      chatCampaignFlow: {
        hostNativeCompletionProof: {
          status: 'warning',
          source: 'coreStoreResponseLedger',
          completionSource: 'coreProjection',
          completedHostContinueCount: 0,
          failedHostContinueCount: 0
        }
      }
    }
  }
});
assert.equal(incompleteHostNativeCompletionAssessment.status, 'warning');
assert.match(incompleteHostNativeCompletionAssessment.summary, /did not prove/);
const failedHostNativeCompletionAssessment = liveHostNativeCompletionAssessment({
  smokeReport: {
    browser: {
      chatCampaignFlow: {
        hostNativeCompletionProof: {
          status: 'fail',
          source: 'coreStoreResponseLedger',
          completionSource: 'coreProjection',
          completedHostContinueCount: 0,
          failedHostContinueCount: 1
        }
      }
    }
  }
});
assert.equal(failedHostNativeCompletionAssessment.status, 'fail');
const missingTimingAssessment = liveGenerationTimingAssessment({ smokeReport: { browser: { chatCampaignFlow: {} } } });
assert.equal(missingTimingAssessment.status, 'warning');
const summaryOnlyTimingAssessment = liveGenerationTimingAssessment({
  smokeSummary: {
    chatCampaign: {
      generationTimingStatus: 'pass',
      generationTimingProofSource: 'coreStoreTurnTiming',
      generationTimingProofTimingSource: 'coreProjection',
      generationTimingCheckedTurns: 1,
      generationTimingMaxLatencyMs: 4200
    }
  }
});
assert.equal(summaryOnlyTimingAssessment.status, 'warning');
assert.match(summaryOnlyTimingAssessment.summary, /compact generation-start timing summary/);
const runtimeOnlyTimingAssessment = liveGenerationTimingAssessment({
  smokeReport: {
    browser: {
      chatCampaignFlow: {
        generationTimingProof: {
          status: 'pass',
          source: 'runtimeSnapshot',
          timingSource: 'runtimeSnapshot',
          checkedTurnCount: 1,
          maxGenerationStartLatencyMs: 4200
        }
      }
    }
  }
});
assert.equal(runtimeOnlyTimingAssessment.status, 'warning');
assert.match(runtimeOnlyTimingAssessment.summary, /not persisted CORE projection/);
const missingTimingSourceAssessment = liveGenerationTimingAssessment({
  smokeReport: {
    browser: {
      chatCampaignFlow: {
        generationTimingProof: {
          status: 'pass',
          source: 'coreStoreTurnTiming',
          checkedTurnCount: 1,
          maxGenerationStartLatencyMs: 4200
        }
      }
    }
  }
});
assert.equal(missingTimingSourceAssessment.status, 'warning');
assert.match(missingTimingSourceAssessment.summary, /timingSource=unknown/);
const skippedOnlyTimingAssessment = liveGenerationTimingAssessment({
  smokeReport: {
    browser: {
      chatCampaignFlow: {
        generationTimingProof: {
          status: 'skipped',
          source: 'coreStoreTurnTiming',
          timingSource: 'coreProjection',
          checkedTurnCount: 0,
          skippedTurnCount: 1,
          skippedEntries: [{ responseKind: 'clarificationNeeded' }]
        }
      }
    }
  }
});
assert.equal(skippedOnlyTimingAssessment.status, 'warning');
assert.match(skippedOnlyTimingAssessment.summary, /deterministic non-generation turn/);
const failedTimingAssessment = liveGenerationTimingAssessment({
  smokeReport: {
    browser: {
      chatCampaignFlow: {
        generationTimingProof: {
          status: 'fail',
          checkedTurnCount: 1,
          maxGenerationStartLatencyMs: 61000
        }
      }
    }
  }
});
assert.equal(failedTimingAssessment.status, 'fail');
assert.match(fs.readFileSync(paths.readableTranscript, 'utf8'), /Smoke transcript/);
assert.match(fs.readFileSync(paths.sourceChatTranscript, 'utf8'), /Commander Arlen waits/);
assert.equal(readJsonFile(paths.transcriptIndex).sourceCapture.sourceChatTranscript, 'smoke-chat-soak/transcript/source-chat.jsonl');
assert.equal(fs.readFileSync(paths.turns, 'utf8').trim(), JSON.stringify({ turn: 1, status: 'planned' }));
assert.equal(path.basename(paths.readableTranscript), 'readable-chat.md');
assert.equal(path.basename(paths.sourceChatTranscript), 'source-chat.jsonl');
assert.equal(fs.existsSync(paths.transcriptIndex), true);
assert.equal(path.basename(checkpointResult.path), 'prep-checkpoint-01.json');
assert.equal(checkpointResult.relativePath, 'snapshots/prep-checkpoint-01.json');
assert.equal(fs.existsSync(checkpointResult.path), true);
const checkpointArtifact = readJsonFile(checkpointResult.path);
assert.equal(checkpointArtifact.kind, 'directive.liveCampaignSoak.checkpoint');
assert.equal(checkpointArtifact.redaction.rawPromptBodiesIncluded, false);
assert.equal(checkpointArtifact.redaction.hiddenStateIncluded, false);
assert.equal(checkpointArtifact.redaction.fullTranscriptIncluded, false);
assert.equal(checkpointArtifact.artifacts.report, 'report.json');
assert.equal(typeof checkpointArtifact.hash, 'string');
assert.equal(fs.existsSync(paths.factCanaryIndex), true);
assert.equal(readJsonFile(paths.factCanaryIndex).kind, 'directive.liveCampaignSoak.factualCanaryIndex');
assert.equal(factualCanaryIndex.packCount, SOAK_CAMPAIGN_MATRIX.length);
assert.equal(factualCanaryIndex.canaryCount, factualCanaryPacks.reduce((sum, pack) => sum + pack.canaryCount, 0));
assert.equal(fs.existsSync(factualCanaryIndex.packs[0].artifact), true);
assert.equal(campaignCanaryIndex.kind, 'directive.liveCampaignSoak.campaignMatrixCanaryIndex');
assert.equal(campaignCanaryIndex.campaignCount, SOAK_CAMPAIGN_MATRIX.length);
assert.equal(campaignCanaryIndex.plannedCanaryTurnCount, report.campaignMatrixCanaries.reduce((sum, script) => sum + Number(script.plannedCanaryTurns || 0), 0));
assert.equal(fs.existsSync(campaignCanaryIndex.indexArtifact), true);
assert.equal(readJsonFile(campaignCanaryIndex.scripts[0].artifact).kind, 'directive.liveCampaignSoak.campaignMatrixCanaryScript');
assert.equal(initializedQualitySummary.kind, 'directive.liveCampaignSoak.storyQualityPhaseSummary');
assert.equal(initializedQualitySummary.status, 'planned');
assert.equal(fs.existsSync(path.join(paths.qualityReview, 'model-assisted-review', 'request.json')), true);
assert.equal(fs.existsSync(path.join(paths.qualityReview, 'model-assisted-review', 'result.json')), true);
assert.equal(readJsonFile(path.join(paths.qualityReview, 'model-assisted-review', 'result.json')).status, 'not-run');
assert.equal(fs.existsSync(qualityScorePath), true);
const qualityScoreLines = fs.readFileSync(qualityScorePath, 'utf8').trim().split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
assert.equal(qualityScoreLines.length, 1);
assert.equal(qualityScoreLines[0].kind, 'directive.liveCampaignSoak.storyQualityScore');
assert.equal(qualityScoreLines[0].hash, strongQualityScore.hash);
assert.equal(writtenQualitySummary.status, 'fail');
assert.equal(writtenQualitySummary.recordCount, 2);
assert.equal(readJsonFile(writtenQualitySummary.phaseSummaryArtifact).scoreZeroCount, 1);
const qualityLogRecord = storyQualityLiveLogRecord({
  report: { ...report, runId: 'prep-test', artifacts: paths },
  summary: writtenQualitySummary,
  score: strongQualityScore
});
assert.equal(qualityLogRecord.kind, 'quality-score');
assert.equal(qualityLogRecord.status, 'pass');
assert.equal(qualityLogRecord.scoreArtifact, 'quality-review/scores.jsonl');
assert.equal(qualityLogRecord.phaseSummaryArtifact, 'quality-review/phase-summary.json');
assert.equal(qualityLogRecord.hash, strongQualityScore.hash);
const storyQualityReview = buildPostSmokeStoryQualityReview({
  report: tempReport,
  transcriptMessages: badTranscriptLines.trim().split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line))
});
assert.equal(storyQualityReview.status, 'fail');
assert.equal(storyQualityReview.reviewerMode, 'deterministic-sanity-check');
assert.equal(storyQualityReview.scoreCount, 2);
assert.equal(storyQualityReview.userScoreCount, 1);
assert.equal(storyQualityReview.assistantScoreCount, 1);
assert.equal(storyQualityReview.scoreZeroCount > 0, true);
assert.equal(storyQualityReview.scoreArtifactRelative, 'quality-review/scores.jsonl');
assert.equal(storyQualityReview.summaryArtifactRelative, 'quality-review/phase-summary.json');
assert.equal(storyQualityReview.manualReviewTemplateArtifactRelative, 'quality-review/manual-review-template.json');
assert.equal(storyQualityReview.manualReviewTemplateEntryCount, 2);
assert.equal(storyQualityReview.modelAssistedReviewRequestPathRelative, 'quality-review/model-assisted-review/request.json');
assert.equal(storyQualityReview.modelAssistedReviewResultPathRelative, 'quality-review/model-assisted-review/result.json');
assert.equal(storyQualityReview.modelAssistedReviewResult.status, 'not-run');
assert.equal(readJsonFile(storyQualityReview.modelAssistedReviewRequestPath).kind, 'directive.liveCampaignSoak.storyQualityModelReviewRequest');
assert.equal(readJsonFile(storyQualityReview.modelAssistedReviewResultPath).kind, 'directive.liveCampaignSoak.storyQualityModelReviewResult');
const transcriptQualityScoreLines = fs.readFileSync(qualityScorePath, 'utf8').trim().split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
assert.equal(transcriptQualityScoreLines.length, 2);
assert.equal(transcriptQualityScoreLines.some((entry) => entry.message.role === 'user' && entry.status === 'pass'), true);
assert.equal(transcriptQualityScoreLines.some((entry) => entry.message.role === 'directive' && entry.status === 'fail'), true);
assert.equal(transcriptQualityScoreLines.some((entry) => entry.dimensions.some((dimension) => dimension.dimension === 'continuity' && dimension.score === 0)), true);
assert.equal(readJsonFile(storyQualityReview.summaryArtifact).recordCount, 2);
assert.equal(readJsonFile(storyQualityReview.summaryArtifact).status, 'fail');
const exportedManualTemplate = readJsonFile(storyQualityReview.manualReviewTemplateArtifact);
assert.equal(exportedManualTemplate.kind, 'directive.liveCampaignSoak.storyQualityManualReviewTemplate');
assert.equal(exportedManualTemplate.entries.length, 2);
assert.equal(exportedManualTemplate.entries.some((entry) => entry.deterministicSanityScore?.status === 'fail'), true);
assert.equal(exportedManualTemplate.entries[0].manualReview.status, 'pending');
const emptyManualTemplate = buildStoryQualityManualReviewTemplate({
  report: tempReport,
  transcriptMessages: [],
  deterministicScores: []
});
assert.equal(emptyManualTemplate.status, 'planned');
assert.equal(emptyManualTemplate.runId, tempReport.runId);
const directTemplateWrite = writeStoryQualityManualReviewTemplateArtifact({
  report: tempReport,
  transcriptMessages: badTranscriptLines.trim().split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line)),
  deterministicScores: storyQualityReview.scores,
  phaseId: 'manual-template-direct-write'
});
assert.equal(directTemplateWrite.artifactPathRelative, 'quality-review/manual-review-template.json');
const completedManualTemplate = {
  ...exportedManualTemplate,
  entries: exportedManualTemplate.entries.map((entry) => entry.message.role === 'directive'
    ? {
        ...entry,
        manualReview: {
          status: 'scored',
          reviewer: 'prep-fixture-reviewer',
          overallScore: null,
          dimensions: [
            { dimension: 'continuity', score: 0, rationale: 'Bronn identity and transit premise are wrong.', evidence: 'assistant visible text' },
            { dimension: 'hidden-truth-safety', score: 2, rationale: 'No hidden-state leak marker in visible text.' }
          ],
          rationale: 'Manual review confirms the deterministic factual-quality blocker.',
          severity: 'P1 story-quality blocker'
        }
      }
    : entry)
};
const manualReviewScores = buildStoryQualityManualReviewScores({
  report: tempReport,
  review: completedManualTemplate
});
assert.equal(manualReviewScores.status, 'fail');
assert.equal(manualReviewScores.scoreCount, 1);
assert.equal(manualReviewScores.scores[0].reviewerMode, 'manual-review');
assert.equal(manualReviewScores.scores[0].manualReviewer, 'prep-fixture-reviewer');
const manualImport = importStoryQualityManualReviewScores({
  report: tempReport,
  review: completedManualTemplate
});
assert.equal(manualImport.status, 'fail');
assert.equal(manualImport.scoreCount, 1);
assert.equal(manualImport.importArtifactRelative, 'quality-review/manual-review-import.jsonl');
assert.equal(manualImport.phaseSummary.recordCount, 3);
assert.equal(readJsonFile(manualImport.phaseSummary.phaseSummaryArtifact).recordCount, 3);
const importedManualLines = fs.readFileSync(manualImport.importArtifact, 'utf8').trim().split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
assert.equal(importedManualLines.length, 1);
assert.equal(importedManualLines[0].reviewerMode, 'manual-review');
const postQualityLogLines = fs.readFileSync(paths.liveLog, 'utf8').trim().split(/\r?\n/u).map((line) => JSON.parse(line));
assert.equal(postQualityLogLines.some((entry) => entry.kind === 'quality-score' && entry.status === 'fail' && entry.recordCount === 2), true);
assert.equal(postQualityLogLines.some((entry) => entry.kind === 'artifact' && entry.artifact === 'story-quality-manual-review-template' && entry.entryCount === 2), true);
assert.equal(postQualityLogLines.some((entry) => entry.kind === 'quality-score' && entry.status === 'fail' && entry.recordCount === 3), true);
assert.equal(fs.existsSync(badFactCheckArtifactPath), true);
assert.match(badFactCheckArtifactPath, /fact-checks[\\/]+mes-001[\\/]+fact-check\.json$/);
assert.equal(readJsonFile(badFactCheckArtifactPath).counts.contradicted, 2);

const expectedDirs = [
  'snapshots',
  'transcript',
  'screenshots',
  'playwright',
  'promptInspection',
  'hostExtensions',
  'storage',
  'objectiveAssignments',
  'factChecks',
  'campaignMatrix',
  'continuityProjectionMatrix',
  'qualityReview',
  'sceneHandshake',
  'timekeeping',
  'endConditions',
  'parallelUsers',
  'discovery'
];
for (const key of expectedDirs) {
  assert.equal(fs.statSync(paths[key]).isDirectory(), true, `${key} artifact directory should exist`);
}

console.log('Live soak prep tests passed.');
