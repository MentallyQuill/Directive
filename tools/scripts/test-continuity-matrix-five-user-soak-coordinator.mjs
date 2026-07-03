import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  externalContextFixtureDepthCheckStatus
} from './lib/sillytavern-live-harness.mjs';
import {
  summarizeModelCallFailurePolicy
} from './lib/model-call-failure-policy.mjs';

import {
  CONTINUITY_MATRIX_REQUIRED_PROMPT_KEYS,
  CONTINUITY_MATRIX_REQUIRED_SOURCE_IDS,
  buildReport,
  buildContinuityMatrixLanes,
  coordinatorReadinessUsers,
  firstHostNativeCompletionRequiredTurn,
  summarizeExternalContextProbe,
  summarizeExternalContextGenerationArtifacts,
  summarizeExternalContextPromptArtifact,
  summarizeContinuityMatrixLane,
  summarizeFactualGroundingArtifacts,
  summarizeGenerationTimingCoreProof,
  summarizeHostNativeCompletionProof,
  summarizeLaneArtifactCompleteness,
  summarizePromptInspectionArtifact,
  readinessCommandArgs,
  summarizeReadiness,
  summarizeReusableContinuityMatrixLane,
  summarizeStoryQualityReviewArtifacts
} from './run-continuity-matrix-five-user-soak.mjs';

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, String(value), 'utf8');
}

function writeExternalContextSummary(root) {
  writeJson(path.join(root, 'host-extensions', 'external-context-summary.json'), {
    kind: 'directive.sillytavern.externalContextSummary.v1',
    schemaVersion: 1,
    source: 'delegated-smoke-prompt-inspection',
    status: 'pass',
    authority: {
      directiveAuthority: false,
      role: 'diagnostics-provenance-only'
    },
    aggregate: {
      captureCount: 1,
      refHashes: ['a'.repeat(64)],
      knownExternalPromptKeys: ['summaryception', '3_vectfox', 'worldInfoBefore'],
      finalHostPromptMayIncludeExternal: true,
      redactionReasons: ['secret'],
      targetSummaryCount: 1
    },
    targetSummaries: [{
      scriptMessageId: 'soak-turn-01',
      scriptCategory: 'directiveCommit',
      targets: {
        stLorebooks: { active: true, chatBound: true },
        memoryBooks: { enabled: true, rangeDiagnostics: { status: 'valid' } },
        summaryception: { enabled: true, staleness: { status: 'observed' } },
        vectFox: { enabled: true, backendDiagnostics: { status: 'external-backend-configured' } }
      }
    }]
  });
}

function writeFactualModelReviewArtifacts(root, {
  requestId = 'fact-model-review-fixture',
  inputHash = 'fact-model-input-hash',
  status = 'pass',
  reason = null,
  roleId = 'factualGroundingReviewer',
  modelCallStatus = 'ok',
  modelCallOk = true,
  errorCode = null,
  counts = {
    respected: 1,
    omitted: 0,
    unsupportedDetail: 0,
    contradicted: 0,
    notApplicable: 0,
    p1: 0,
    p2: 0,
    p3: 0
  }
} = {}) {
  const requestPath = path.join(root, 'fact-checks', 'model-assisted-review', 'request.json');
  const resultPath = path.join(root, 'fact-checks', 'model-assisted-review', 'result.json');
  writeJson(requestPath, {
    kind: 'directive.liveCampaignSoak.factualModelReviewRequest',
    schemaVersion: 1,
    requestId,
    runId: 'lane-run',
    packageId: 'directive:starship-package:breckinridge-ashes-of-peace',
    packId: 'ashes-factual-grounding',
    inputHash,
    transcript: [{ messageIndex: 0, role: 'assistant', textHash: 'a'.repeat(64) }],
    deterministicChecks: [{ checkId: 'fact-check-soak-turn-01', status: 'pass' }]
  });
  writeJson(resultPath, {
    kind: 'directive.liveCampaignSoak.factualModelReviewResult',
    schemaVersion: 1,
    requestId,
    status,
    reason,
    packageId: 'directive:starship-package:breckinridge-ashes-of-peace',
    packId: 'ashes-factual-grounding',
    inputHash,
    modelCall: {
      roleId,
      providerKind: 'utility',
      providerId: 'test-provider',
      model: 'test-model',
      status: modelCallStatus,
      ok: modelCallOk,
      latencyMs: 900,
      errorCode
    },
    counts,
    findings: []
  });
}

function makeArtifactRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'directive-cpm-five-user-'));
}

function timingCheck({
  status = 'pass',
  proof = null,
  summary = 'Delegated smoke proved generation-start timing for 1 turn(s); max latency 4200 ms.'
} = {}) {
  return {
    id: 'live-generation-start-timing',
    status,
    summary,
    details: {
      proof: proof || {
        status: 'pass',
        source: 'coreStoreTurnTiming',
        timingSource: 'coreProjection',
        checkedTurnCount: 1,
        skippedTurnCount: 1,
        maxGenerationStartLatencyMs: 4200,
        routes: ['directivePosted'],
        entries: [
          {
            route: 'directivePosted',
            responseKind: 'committedOutcome',
            timingStatus: 'pass',
            turnLatency: {
              generationStartLatencyMs: 4200,
              architectureWithin60s: true
            }
          }
        ],
        skippedEntries: [
          {
            route: 'directivePosted',
            responseKind: 'clarificationNeeded',
            timingStatus: 'skipped-non-generation'
          }
        ]
      }
    }
  };
}

function hostNativeCompletionCheck({
  status = 'pass',
  proof = null,
  summary = 'Delegated smoke proved 1 terminal host-native completion from persisted CORE projections.'
} = {}) {
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
  return {
    id: 'live-host-native-completion-proof',
    status,
    summary,
    details: {
      proof: proof || {
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
    }
  };
}

function promptInspectionFixture({
  revision = 12,
  hash = 'prompt-hash',
  refHash = 'a'.repeat(64),
  knownExternalPromptKeys = ['summaryception', '3_vectfox', 'worldInfoBefore'],
  finalHostPromptMayIncludeExternal = true,
  externalPromptEnvironmentTargets = {
    stLorebooks: {
      active: true,
      enabled: true,
      promptPositions: ['before']
    },
    memoryBooks: {
      active: true,
      enabled: true,
      entryCount: 4,
      rangeDiagnostics: {
        status: 'valid',
        entryRangeCount: 2,
        chatRangeCount: 1,
        validRangeCount: 3,
        invertedRangeCount: 0,
        outOfBoundsRangeCount: 0,
        staleRangeCount: 0,
        rangeHash: 'range-fixture'
      }
    },
    summaryception: {
      enabled: true,
      promptKeyActive: true,
      layerCount: 1,
      ghostedCount: 2,
      staleness: {
        status: 'observed',
        chatLength: 12,
        summarizedRangeBeyondChat: false,
        staleAfterMutation: false,
        ghostedSystemVisibleCount: 0,
        summarizedOnlyCount: 0
      }
    },
    vectFox: {
      enabled: true,
      generationInterceptorActive: true,
      promptKeys: ['3_vectfox'],
      backendDiagnostics: {
        status: 'external-backend-configured',
        backendType: 'qdrant',
        unavailable: false,
        externalTimingObserved: true,
        interceptorLatencyMs: 8,
        retrievalLatencyMs: 13,
        timingHash: 'vectfox-timing'
      }
    }
  }
} = {}) {
  return {
    promptInspection: {
      status: 'active',
      revision,
      hash,
      externalPromptEnvironmentRef: {
        kind: 'directive.externalPromptEnvironmentRef.v1',
        schemaVersion: 1,
        hash: refHash,
        byteLength: 512,
        status: 'observed',
        observedAt: '2026-06-28T22:10:00.000Z',
        knownExternalPromptKeys
      },
      finalHostPromptMayIncludeExternal,
      externalPromptEnvironmentTargets,
      redactions: [{ key: 'qdrant_api_key', reason: 'secret' }],
      blocks: [
        {
          id: 'continuity-contract',
          promptKey: 'directive.contract',
          sourceIds: []
        },
        {
          id: 'continuity-invariants',
          promptKey: 'directive.continuity.invariants',
          sourceIds: [
            'crew.hadrik-bronn.species',
            'ship.uss-breckenridge.travel.not-six-days-impulse',
            'ship.uss-breckenridge.travel.not-short-refit-duration'
          ]
        },
        {
          id: 'continuity-scene-active',
          promptKey: 'directive.scene.active',
          sourceIds: []
        },
        {
          id: 'continuity-domain',
          promptKey: 'directive.continuity.domain',
          sourceIds: ['crew.hadrik-bronn.age-description']
        },
        {
          id: 'continuity-recap-committed',
          promptKey: 'directive.recap.committed',
          sourceIds: []
        },
        {
          id: 'continuity-revolving-context',
          promptKey: 'directive.context.revolving',
          sourceIds: []
        }
      ]
    }
  };
}

function writePromptInspectionArtifact(root, {
  reason = 'pre-generation',
  scriptMessageId = 'soak-turn-01',
  scriptCategory = 'factual-director',
  chatLength = 2,
  promptInspection = promptInspectionFixture()
} = {}) {
  const fileName = reason === 'run-end'
    ? 'run-end.json'
    : `${reason}-${scriptMessageId}-${String(chatLength).padStart(4, '0')}.json`
      .replace(/[^a-zA-Z0-9._-]+/g, '-');
  writeJson(path.join(root, 'prompt-inspection', fileName), {
    kind: 'directive.sillytavern.promptInspectionSnapshot',
    schemaVersion: 1,
    capturedAt: '2026-06-28T22:10:00.000Z',
    reason,
    scriptMessageId: reason === 'run-end' ? null : scriptMessageId,
    scriptLabel: reason === 'run-end' ? null : `Turn ${scriptMessageId}`,
    scriptCategory: reason === 'run-end' ? null : scriptCategory,
    currentChatId: 'ashes-chat',
    chatLength,
    ...promptInspection
  });
}

function writePassingLaneArtifacts(root, {
  turnLimit = null,
  includeTiming = true,
  timingProof = null,
  includeHostNativeCompletion = true,
  hostNativeCompletionProof = null,
  includeStoryQuality = true,
  storyQualityModelStatus = 'pass',
  promptCaptureCount = 1,
  includePreGenerationPromptCaptures = true,
  failedModelCallCount = 0,
  modelCalls = null
} = {}) {
  const smokeSummary = {
    browser: {
      chatCampaign: {
        modelCallCount: 10,
        retainedModelCallCount: Array.isArray(modelCalls) ? modelCalls.length : 10,
        failedModelCallCount
      }
    }
  };
  const smokeReport = Array.isArray(modelCalls)
    ? {
        browser: {
          chatCampaignFlow: {
            final: {
              modelCallCount: modelCalls.length,
              modelCalls
            }
          }
        }
      }
    : null;
  const modelCallFailurePolicy = summarizeModelCallFailurePolicy({ smokeReport, smokeSummary });
  const storyQualityRequestPath = path.join(root, 'quality-review', 'model-assisted-review', 'request.json');
  const storyQualityResultPath = path.join(root, 'quality-review', 'model-assisted-review', 'result.json');
  if (includeStoryQuality) {
    writeJson(storyQualityRequestPath, {
      kind: 'directive.liveCampaignSoak.storyQualityModelReviewRequest',
      schemaVersion: 1,
      requestId: 'story-quality-fixture',
      runId: 'lane-run',
      inputHash: 'story-quality-input-hash',
      transcript: [
        {
          index: 0,
          messageId: 'fixture-user-1',
          role: 'user',
          textHash: 'u'.repeat(64),
          text: 'The commander gives the bridge a careful order.'
        }
      ],
      deterministicScores: []
    });
    writeJson(storyQualityResultPath, {
      kind: 'directive.liveCampaignSoak.storyQualityModelReviewResult',
      schemaVersion: 1,
      requestId: 'story-quality-fixture',
      runId: 'lane-run',
      inputHash: 'story-quality-input-hash',
      status: storyQualityModelStatus,
      reason: storyQualityModelStatus === 'not-run' ? 'fixture not invoked' : null,
      counts: {
        scores: storyQualityModelStatus === 'not-run' ? 0 : 1,
        scoreZero: 0,
        warningOrWeak: storyQualityModelStatus === 'warning' ? 1 : 0
      },
      scores: storyQualityModelStatus === 'not-run' ? [] : [
        {
          messageId: 'fixture-user-1',
          messageIndex: 0,
          role: 'user',
          overallScore: storyQualityModelStatus === 'warning' ? 1 : 2,
          dimensions: []
        }
      ],
      modelCall: storyQualityModelStatus === 'not-run' ? null : {
        roleId: 'storyQualityReviewer',
        providerKind: 'utility',
        status: 'ok',
        ok: true,
        latencyMs: 1200
      }
    });
  }
  writeText(path.join(root, 'summary.md'), '# Lane Summary\n');
  writeText(path.join(root, 'live-log.jsonl'), `${JSON.stringify({ kind: 'run-end', status: 'pass' })}\n`);
  writeText(path.join(root, 'transcript', 'readable-chat.md'), '# Transcript\n\nBronn is Tellarite.\n');
  writeExternalContextSummary(root);
  writeFactualModelReviewArtifacts(root);
  writeJson(path.join(root, 'fact-checks', 'canary-index.json'), {
    kind: 'directive.liveCampaignSoak.factualCanaryIndex',
    canaryCount: 2
  });
  writeJson(path.join(root, 'report.json'), {
    status: modelCallFailurePolicy.status === 'fail' ? 'fail' : 'pass',
    runId: 'lane-run',
    mode: 'live',
    modelCallPolicy: {
      budget: 'unlimited',
      liveProvidersRequired: true,
      fallbackWarningRequired: true,
      failurePolicyEvidence: modelCallFailurePolicy
    },
    checks: [
      {
        id: 'live-factual-grounding-transcript-audit',
        status: 'pass',
        summary: 'ok',
        details: {
          modelAssistedReview: {
            status: 'pass',
            requestPath: 'fact-checks/model-assisted-review/request.json',
            resultPath: 'fact-checks/model-assisted-review/result.json',
            inputHash: 'fact-model-input-hash',
            counts: {
              respected: 1,
              omitted: 0,
              unsupportedDetail: 0,
              contradicted: 0,
              notApplicable: 0,
              p1: 0,
              p2: 0,
              p3: 0
            }
          }
        }
      },
      { id: 'served-extension-freshness', status: 'pass', summary: 'ok' },
      ...(includeTiming ? [timingCheck({ proof: timingProof })] : []),
      ...(includeHostNativeCompletion ? [hostNativeCompletionCheck({ proof: hostNativeCompletionProof })] : []),
      {
        id: 'live-model-call-failure-policy',
        status: modelCallFailurePolicy.status,
        summary: modelCallFailurePolicy.summary,
        details: {
          evidenceSource: modelCallFailurePolicy.evidenceSource,
          authoritySource: modelCallFailurePolicy.authoritySource,
          severityPolicy: modelCallFailurePolicy.severityPolicy,
          failedModelCallCount: modelCallFailurePolicy.failedModelCallCount,
          retainedModelCallCount: modelCallFailurePolicy.retainedModelCallCount,
          modelCallCount: modelCallFailurePolicy.modelCallCount,
          releaseBlockingCalls: modelCallFailurePolicy.releaseBlockingCalls,
          unresolvedCalls: modelCallFailurePolicy.unresolvedCalls,
          fallbackHandledCalls: modelCallFailurePolicy.fallbackHandledCalls,
          calls: modelCallFailurePolicy.calls
        }
      },
      ...(includeStoryQuality ? [{
        id: 'live-story-quality-transcript-review',
        status: 'pass',
        summary: 'Story-quality review fixture passed.',
        details: {
          storyQualityReview: {
            status: storyQualityModelStatus === 'fail' ? 'fail' : 'pass',
            scoreCount: 1,
            userScoreCount: 1,
            assistantScoreCount: 0,
            scoreZeroCount: 0,
            averageScore: storyQualityModelStatus === 'warning' ? 1 : 2,
            modelAssistedReview: {
              status: storyQualityModelStatus,
              requestPath: 'quality-review/model-assisted-review/request.json',
              resultPath: 'quality-review/model-assisted-review/result.json',
              providerOutputPath: 'smoke-story-quality-review/provider-result.json',
              inputHash: 'story-quality-input-hash',
              counts: {
                scores: storyQualityModelStatus === 'not-run' ? 0 : 1,
                scoreZero: 0,
                warningOrWeak: storyQualityModelStatus === 'warning' ? 1 : 0
              }
            }
          }
        }
      }] : []),
      {
        id: 'live-execution-turn-limit',
        status: turnLimit ? 'warning' : 'pass',
        summary: turnLimit ? `limited to ${turnLimit}` : 'full run',
        details: { turnLimit, fullTurnCount: 52 }
      }
    ],
    warnings: [],
    failures: modelCallFailurePolicy.status === 'fail' ? [modelCallFailurePolicy.summary] : []
  });
  writeJson(path.join(root, 'smoke-chat-soak', 'report-summary.json'), smokeSummary);
  if (smokeReport) writeJson(path.join(root, 'smoke-chat-soak', 'report.json'), smokeReport);
  if (includePreGenerationPromptCaptures) {
    for (let turn = 1; turn <= promptCaptureCount; turn += 1) {
      writePromptInspectionArtifact(root, {
        reason: 'pre-generation',
        scriptMessageId: `soak-turn-${String(turn).padStart(2, '0')}`,
        chatLength: turn + 1,
        promptInspection: promptInspectionFixture({
          revision: 11 + turn,
          hash: `prompt-hash-${turn}`,
          refHash: `${String(turn % 10).repeat(64)}`
        })
      });
    }
  }
  writePromptInspectionArtifact(root, {
    reason: 'run-end',
    scriptMessageId: 'campaign',
    chatLength: promptCaptureCount + 2,
    promptInspection: promptInspectionFixture({
      revision: 99,
      hash: 'run-end-prompt-hash',
      refHash: 'a'.repeat(64)
    })
  });
  writeJson(path.join(root, 'fact-checks', 'soak-turn-01', 'fact-check.json'), {
    status: 'pass',
    counts: {
      respected: 2,
      omitted: 0,
      unsupportedDetail: 0,
      contradicted: 0,
      promptAvailable: 3
    },
    results: []
  });
  writeJson(path.join(root, 'fact-checks', 'transcript-level', 'fact-check.json'), {
    status: 'pass',
    counts: {
      respected: 4,
      omitted: 0,
      unsupportedDetail: 0,
      contradicted: 0,
      promptAvailable: 3
    },
    results: []
  });
}

function removeVectFoxRichFixturePressure(root) {
  const promptDir = path.join(root, 'prompt-inspection');
  for (const name of fs.readdirSync(promptDir)) {
    if (!name.endsWith('.json')) continue;
    const filePath = path.join(promptDir, name);
    const artifact = readJson(filePath);
    if (artifact.reason !== 'pre-generation') continue;
    const targets = artifact.promptInspection?.externalPromptEnvironmentTargets;
    if (!targets || typeof targets !== 'object') continue;
    targets.vectFox = {
      enabled: true,
      generationInterceptorActive: true,
      promptKeys: ['3_vectfox'],
      backendDiagnostics: {
        status: 'missing'
      }
    };
    writeJson(filePath, artifact);
  }
}

function mutatePreGenerationScriptId(root, fileName, scriptMessageId) {
  const filePath = path.join(root, 'prompt-inspection', fileName);
  const artifact = readJson(filePath);
  artifact.scriptMessageId = scriptMessageId;
  writeJson(filePath, artifact);
}

assert.equal(CONTINUITY_MATRIX_REQUIRED_PROMPT_KEYS.includes('directive.continuity.invariants'), true);
assert.equal(CONTINUITY_MATRIX_REQUIRED_SOURCE_IDS.includes('crew.hadrik-bronn.species'), true);
assert.equal(CONTINUITY_MATRIX_REQUIRED_SOURCE_IDS.includes('ship.uss-breckenridge.travel.not-six-days-impulse'), true);
assert.equal(CONTINUITY_MATRIX_REQUIRED_SOURCE_IDS.includes('ship.uss-breckenridge.travel.not-short-refit-duration'), true);

const lanes = buildContinuityMatrixLanes({
  users: [
    { handle: 'directive-soak-a', password: 'a' },
    { handle: 'directive-soak-b', password: 'b' },
    { handle: 'directive-soak-c', password: 'c' },
    { handle: 'directive-soak-d', password: 'd' },
    { handle: 'directive-soak-e', password: 'e' }
  ]
});
const configuredSoakUsers = [
  { handle: 'directive-soak-a', password: 'a' },
  { handle: 'directive-soak-b', password: 'b' },
  { handle: 'directive-soak-c', password: 'c' },
  { handle: 'directive-soak-d', password: 'd' },
  { handle: 'directive-soak-e', password: 'e' }
];
const focusedLanes = buildContinuityMatrixLanes({
  users: configuredSoakUsers,
  laneFilter: ['ashes-command-bearing-endings']
});
assert.equal(focusedLanes.length, 1);
assert.deepEqual(coordinatorReadinessUsers({ configured: configuredSoakUsers, lanes: focusedLanes }).map((user) => user.handle), [
  'directive-soak-a',
  'directive-soak-b',
  'directive-soak-c',
  'directive-soak-d',
  'directive-soak-e'
]);
assert.deepEqual(readinessCommandArgs({ activateExternalContextFixture: false }), [
  'tools/scripts/check-sillytavern-multi-user-soak-readiness.mjs',
  '--live',
  '--write-artifacts'
]);
assert.deepEqual(readinessCommandArgs({ activateExternalContextFixture: true }), [
  'tools/scripts/check-sillytavern-multi-user-soak-readiness.mjs',
  '--live',
  '--activate-external-context-fixture',
  '--write-artifacts'
]);
assert.deepEqual(readinessCommandArgs({
  prepareExternalContextFixtures: true,
  activateExternalContextFixture: true
}), [
  'tools/scripts/check-sillytavern-multi-user-soak-readiness.mjs',
  '--live',
  '--prepare-external-context-fixtures',
  '--activate-external-context-fixture',
  '--write-artifacts'
]);
assert.equal(lanes.length, 5);
assert.deepEqual(lanes.map((lane) => lane.userHandle), [
  'directive-soak-a',
  'directive-soak-b',
  'directive-soak-c',
  'directive-soak-d',
  'directive-soak-e'
]);
assert.equal(lanes.every((lane) => lane.userConfigured), true);
assert.equal(buildContinuityMatrixLanes({ users: [], laneFilter: ['ashes-factual-director'] }).length, 1);

function probeUser(handle, {
  summaryceptionStatus = 'browser-confirmed',
  vectFoxStatus = 'disabled',
  unavailableSignals = []
} = {}) {
  return {
    handle,
    status: 'pass',
    contextReady: true,
    currentChatId: `ashes-${handle}`,
    chatLength: 12,
    diskEnvironmentHash: `disk-${handle}`,
    browserEnvironmentHash: `browser-${handle}`,
    combinedEnvironmentHash: `combined-${handle}`,
    hostPromptRegistry: {
      available: true,
      keyCount: 4,
      promptKeys: ['summaryception', '3_vectfox', 'worldInfoBefore', 'directive.campaign.context']
    },
    externalPromptEnvironment: {
      knownExternalPromptKeys: ['summaryception', '3_vectfox', 'worldInfoBefore'],
      worldInfo: {
        installed: true,
        enabled: true,
        active: true,
        activeNames: ['Ashes Memory'],
        chatBoundName: 'Ashes Memory'
      },
      memoryBooks: {
        installed: true,
        enabled: true,
        activeBookName: 'Ashes Memory',
        stMemoryBookEntryCount: 1,
        rangeDiagnostics: {
          status: 'valid',
          entryRangeCount: 1,
          chatRangeCount: 1,
          validRangeCount: 2,
          invertedRangeCount: 0,
          outOfBoundsRangeCount: 0,
          staleRangeCount: 0,
          rangeHash: `range-${handle}`
        }
      },
      summaryception: {
        installed: true,
        enabled: summaryceptionStatus !== 'not-installed',
        promptKeyActive: summaryceptionStatus === 'browser-confirmed',
        layerCount: 2,
        ghostedCount: 3,
        staleness: {
          status: 'observed',
          chatLength: 12,
          summarizedRangeBeyondChat: false,
          staleAfterMutation: false,
          ghostedSystemVisibleCount: 0,
          summarizedOnlyCount: 0
        }
      },
      vectFox: {
        installed: true,
        enabled: vectFoxStatus === 'browser-confirmed',
        disabledPresent: vectFoxStatus === 'disabled',
        promptKeys: vectFoxStatus === 'browser-confirmed' ? ['3_vectfox'] : [],
        generationInterceptorActive: vectFoxStatus === 'browser-confirmed',
        backendDiagnostics: {
          status: vectFoxStatus === 'browser-confirmed' ? 'external-backend-configured' : 'disabled',
          backendType: vectFoxStatus === 'browser-confirmed' ? 'qdrant' : null,
          unavailable: false,
          externalTimingObserved: vectFoxStatus === 'browser-confirmed',
          interceptorLatencyMs: vectFoxStatus === 'browser-confirmed' ? 8 : null,
          retrievalLatencyMs: vectFoxStatus === 'browser-confirmed' ? 13 : null,
          timingHash: vectFoxStatus === 'browser-confirmed' ? `vf-${handle}` : null
        }
      },
      rawPromptBody: 'RAW_PROMPT_CANARY_SHOULD_NOT_SURFACE'
    },
    targets: {
      stLorebooks: {
        status: 'browser-confirmed',
        diskSignals: { installed: true, enabled: true, settingsHash: `wi-${handle}` },
        browserSignals: { settingsSeen: true, globalSignatureSeen: true, promptKeySeen: true, chatMetadataSeen: true },
        promptKeys: ['worldInfoBefore'],
        chatMetadataCounts: { chatBoundWorld: 1 },
        messageMarkerCounts: {},
        unavailableReasons: []
      },
      memoryBooks: {
        status: 'browser-confirmed',
        diskSignals: { installed: true, enabled: true, settingsHash: `stmb-${handle}` },
        browserSignals: { settingsSeen: true, globalSignatureSeen: true, chatMetadataSeen: true, messageMarkerSeen: true },
        promptKeys: [],
        chatMetadataCounts: { chatBoundWorld: 1 },
        messageMarkerCounts: { memoryBooksHidden: 1 },
        unavailableReasons: []
      },
      summaryception: {
        status: summaryceptionStatus,
        diskSignals: { installed: true, enabled: summaryceptionStatus !== 'not-installed', settingsHash: `sc-${handle}` },
        browserSignals: { settingsSeen: true, globalSignatureSeen: true, promptKeySeen: true, chatMetadataSeen: true, messageMarkerSeen: true },
        promptKeys: ['summaryception'],
        chatMetadataCounts: { ghostedCount: 3, layerCount: 2 },
        messageMarkerCounts: { summaryceptionGhosted: 3 },
        unavailableReasons: unavailableSignals
      },
      vectFox: {
        status: vectFoxStatus,
        diskSignals: { installed: true, enabled: vectFoxStatus === 'browser-confirmed', disabledPresent: vectFoxStatus === 'disabled', settingsHash: `vf-${handle}` },
        browserSignals: { settingsSeen: true, globalSignatureSeen: true, promptKeySeen: vectFoxStatus === 'browser-confirmed', messageMarkerSeen: false },
        promptKeys: vectFoxStatus === 'browser-confirmed' ? ['3_vectfox'] : [],
        chatMetadataCounts: {},
        messageMarkerCounts: { vectFoxGhosted: 0 },
        unavailableReasons: unavailableSignals
      }
    },
    unavailableSignals,
    redactions: [{ key: 'qdrant_api_key', reason: 'secret' }, { key: 'rawPromptBody', reason: 'raw-payload' }]
  };
}

const readinessRoot = makeArtifactRoot();
const externalProbe = {
  kind: 'directive.sillytavern.externalContextProbe.v1',
  schemaVersion: 1,
  runId: 'readiness-external',
  capturedAt: '2026-06-28T22:00:00.000Z',
  mode: 'live-browser-preflight',
  required: true,
  status: 'pass',
  baseUrl: 'http://127.0.0.1:8000',
  users: configuredSoakUsers.map((user) => probeUser(user.handle))
};
writeJson(path.join(readinessRoot, 'report.json'), {
  status: 'pass',
  runId: 'readiness-external',
  checks: [{ id: 'host-extension-compatibility', status: 'pass', summary: 'ok' }],
  externalContextProbe: externalProbe
});
const externalProbeSummary = summarizeExternalContextProbe(externalProbe);
assert.equal(externalProbeSummary.userCount, 5);
assert.equal(externalProbeSummary.targetStatusCounts['browser-confirmed'], 15);
assert.equal(externalProbeSummary.targetStatusCounts.disabled, 5);
assert.equal(externalProbeSummary.fixtureDepth.status, 'warning');
assert.deepEqual(externalProbeSummary.fixtureDepth.missingTargets, ['vectFox']);
assert.equal(externalProbeSummary.fixtureDepth.targetCoverage.stLorebooks.richUserCount, 5);
assert.equal(externalProbeSummary.fixtureDepth.targetCoverage.memoryBooks.richUserCount, 5);
assert.equal(externalProbeSummary.fixtureDepth.targetCoverage.summaryception.richUserCount, 5);
assert.equal(externalProbeSummary.fixtureDepth.targetCoverage.vectFox.richUserCount, 0);
assert.equal(externalProbeSummary.users[0].redactionReasons.includes('secret'), true);
assert.equal(externalProbeSummary.users[0].targets.summaryception.chatMetadataCounts.ghostedCount, 3);
assert.equal(JSON.stringify(externalProbeSummary).includes('RAW_PROMPT_CANARY'), false);
const richExternalProbeSummary = summarizeExternalContextProbe({
  ...externalProbe,
  users: configuredSoakUsers.map((user) => probeUser(user.handle, { vectFoxStatus: 'browser-confirmed' }))
});
assert.equal(richExternalProbeSummary.fixtureDepth.status, 'pass');
assert.deepEqual(richExternalProbeSummary.fixtureDepth.missingTargets, []);
assert.equal(richExternalProbeSummary.fixtureDepth.fullFixtureUserHandles.length, 5);
assert.equal(richExternalProbeSummary.fixtureDepth.users[0].targets.memoryBooks.evidence.includes('memory-book-range-valid'), true);
assert.equal(richExternalProbeSummary.fixtureDepth.users[0].targets.summaryception.evidence.includes('summaryception-staleness-observed'), true);
assert.equal(richExternalProbeSummary.fixtureDepth.users[0].targets.vectFox.evidence.includes('vectfox-backend-external-backend-configured'), true);
const readinessSummary = summarizeReadiness({
  exitCode: 0,
  signal: null,
  stdout: JSON.stringify({ status: 'pass', artifactRoot: readinessRoot }),
  stderr: '',
  json: { status: 'pass', artifactRoot: readinessRoot }
}, { readiness: path.dirname(readinessRoot) }, 'parent-run');
assert.equal(readinessSummary.status, 'pass');
assert.equal(readinessSummary.externalContextProbe.status, 'pass');
assert.equal(readinessSummary.externalContextProbe.fixtureDepth.status, 'warning');
assert.equal(readinessSummary.externalContextProbe.users[4].targets.vectFox.status, 'disabled');
assert.equal(externalContextFixtureDepthCheckStatus({
  live: true,
  turnLimit: '1',
  fixtureDepth: readinessSummary.externalContextProbe.fixtureDepth
}), 'warning');
assert.equal(externalContextFixtureDepthCheckStatus({
  live: true,
  turnLimit: '',
  fixtureDepth: readinessSummary.externalContextProbe.fixtureDepth,
  fullCertificationRequired: true
}), 'fail');
assert.equal(externalContextFixtureDepthCheckStatus({
  live: true,
  turnLimit: '',
  fixtureDepth: richExternalProbeSummary.fixtureDepth,
  fullCertificationRequired: true
}), 'pass');

const root = makeArtifactRoot();
writePassingLaneArtifacts(root);
const promptSummary = summarizePromptInspectionArtifact({ artifactRoot: root });
assert.equal(promptSummary.status, 'pass');
assert.equal(promptSummary.missingPromptKeys.length, 0);
assert.equal(promptSummary.missingSourceIds.length, 0);
const externalPromptSummary = summarizeExternalContextPromptArtifact({ artifactRoot: root });
assert.equal(externalPromptSummary.status, 'pass');
assert.equal(externalPromptSummary.externalPromptEnvironmentRef.hash, 'a'.repeat(64));
assert.deepEqual(externalPromptSummary.knownExternalPromptKeys, ['3_vectfox', 'summaryception', 'worldInfoBefore']);
assert.equal(externalPromptSummary.directiveOwnedPromptKeys.includes('directive.contract'), true);
assert.equal(externalPromptSummary.finalHostPromptMayIncludeExternal, true);
const externalGenerationSummary = summarizeExternalContextGenerationArtifacts({ artifactRoot: root });
assert.equal(externalGenerationSummary.status, 'pass');
assert.equal(externalGenerationSummary.captureCount, 1);
assert.equal(externalGenerationSummary.expectedCaptureCount, null);
assert.equal(externalGenerationSummary.knownExternalPromptKeys.includes('3_vectfox'), true);
assert.equal(externalGenerationSummary.richFixturePressure.status, 'pass');
assert.deepEqual(externalGenerationSummary.richFixturePressure.missingTargets, []);
assert.equal(externalGenerationSummary.richFixturePressure.targetDiagnostics.memoryBooks.rangeStatus, 'valid');
assert.equal(externalGenerationSummary.richFixturePressure.targetDiagnostics.summaryception.stalenessStatus, 'observed');
assert.equal(externalGenerationSummary.richFixturePressure.targetDiagnostics.vectFox.backendStatus, 'external-backend-configured');

const activeMissingDiagnosticsRoot = makeArtifactRoot();
writePassingLaneArtifacts(activeMissingDiagnosticsRoot);
const activeMissingDiagnosticsPath = path.join(activeMissingDiagnosticsRoot, 'prompt-inspection', 'pre-generation-soak-turn-01-0002.json');
const activeMissingDiagnosticsPrompt = readJson(activeMissingDiagnosticsPath);
delete activeMissingDiagnosticsPrompt.promptInspection.externalPromptEnvironmentTargets.memoryBooks.rangeDiagnostics;
delete activeMissingDiagnosticsPrompt.promptInspection.externalPromptEnvironmentTargets.summaryception.staleness;
delete activeMissingDiagnosticsPrompt.promptInspection.externalPromptEnvironmentTargets.vectFox.backendDiagnostics;
writeJson(activeMissingDiagnosticsPath, activeMissingDiagnosticsPrompt);
const activeMissingDiagnosticsSummary = summarizeExternalContextGenerationArtifacts({ artifactRoot: activeMissingDiagnosticsRoot });
assert.equal(activeMissingDiagnosticsSummary.status, 'pass');
assert.equal(activeMissingDiagnosticsSummary.richFixturePressure.status, 'fail');
assert.deepEqual(activeMissingDiagnosticsSummary.richFixturePressure.missingTargets, ['memoryBooks', 'summaryception', 'vectFox']);

const activeMissingStatusRoot = makeArtifactRoot();
writePassingLaneArtifacts(activeMissingStatusRoot);
const activeMissingStatusPath = path.join(activeMissingStatusRoot, 'prompt-inspection', 'pre-generation-soak-turn-01-0002.json');
const activeMissingStatusPrompt = readJson(activeMissingStatusPath);
activeMissingStatusPrompt.promptInspection.externalPromptEnvironmentTargets.summaryception.staleness.status = 'missing';
activeMissingStatusPrompt.promptInspection.externalPromptEnvironmentTargets.vectFox.backendDiagnostics.status = 'missing';
writeJson(activeMissingStatusPath, activeMissingStatusPrompt);
const activeMissingStatusSummary = summarizeExternalContextGenerationArtifacts({ artifactRoot: activeMissingStatusRoot });
assert.equal(activeMissingStatusSummary.status, 'pass');
assert.equal(activeMissingStatusSummary.richFixturePressure.status, 'fail');
assert.deepEqual(activeMissingStatusSummary.richFixturePressure.missingTargets, ['summaryception', 'vectFox']);

const factualSummary = summarizeFactualGroundingArtifacts({ artifactRoot: root });
assert.equal(factualSummary.status, 'pass');
assert.equal(factualSummary.checkCount, 2);
assert.equal(factualSummary.badCount, 0);
const timingSummary = summarizeGenerationTimingCoreProof({ artifactRoot: root });
assert.equal(timingSummary.status, 'pass');
assert.equal(timingSummary.proof.timingSource, 'coreProjection');
const hostNativeCompletionSummary = summarizeHostNativeCompletionProof({ artifactRoot: root });
assert.equal(hostNativeCompletionSummary.status, 'pass');
assert.equal(hostNativeCompletionSummary.proof.completionSource, 'coreProjection');
assert.equal(hostNativeCompletionSummary.proof.completedHostContinueCount, 1);
assert.equal(hostNativeCompletionSummary.requiredCompletionAssessment.status, 'pass');
assert.equal(hostNativeCompletionSummary.requiredCompletionAssessment.matched[0].scriptMessageId, 'soak-turn-03');
const storyQualitySummary = summarizeStoryQualityReviewArtifacts({ artifactRoot: root });
assert.equal(storyQualitySummary.status, 'pass');
assert.equal(storyQualitySummary.modelAssistedReview.status, 'pass');
assert.equal(storyQualitySummary.modelAssistedReview.missing, false);
const laneSummary = summarizeContinuityMatrixLane({
  lane: lanes[0],
  child: {
    exitCode: 0,
    signal: null,
    stdout: JSON.stringify({ status: 'pass', artifactRoot: root }),
    stderr: '',
    json: { status: 'pass', artifactRoot: root }
  },
  artifactRoot: root
});
assert.equal(laneSummary.status, 'pass');
assert.equal(laneSummary.promptInspection.presentSourceIds.includes('crew.hadrik-bronn.species'), true);
assert.equal(laneSummary.externalContextProof.status, 'pass');
assert.equal(laneSummary.externalContextProof.knownExternalPromptKeys.includes('summaryception'), true);
assert.equal(laneSummary.externalContextGenerationProof.status, 'pass');
assert.equal(laneSummary.externalContextGenerationProof.captureCount, 1);
assert.equal(laneSummary.externalContextGenerationProof.richFixturePressure.status, 'pass');
assert.equal(laneSummary.factualGrounding.counts.respected, 6);
assert.equal(laneSummary.generationTimingProof.status, 'pass');
assert.equal(laneSummary.hostNativeCompletionProof.status, 'pass');
assert.equal(laneSummary.storyQualityReview.status, 'pass');
assert.equal(laneSummary.modelCallFailurePolicy.status, 'pass');
assert.equal(laneSummary.modelCallFailurePolicy.durableEvidenceSource, 'lane-report:modelCallPolicy.failurePolicyEvidence');
assert.equal(summarizeReusableContinuityMatrixLane({
  lane: lanes[0],
  artifactRoot: root,
  turnLimit: null
}), null);
const aggregateRichPassReport = buildReport({
  runId: 'aggregate-rich-pass',
  mode: 'live',
  options: {
    live: true,
    turnLimit: '1',
    skipReadiness: false,
    resume: false,
    laneFilter: []
  },
  paths: { root },
  lanes: [lanes[0]],
  readiness: {
    status: 'pass',
    externalContextProbe: {
      status: 'pass',
      fixtureDepth: richExternalProbeSummary.fixtureDepth
    }
  },
  laneSummaries: [laneSummary]
});
const aggregateRichPassCheck = aggregateRichPassReport.checks.find((entry) => entry.id === 'external-context-generation-proof');
assert.equal(aggregateRichPassCheck.status, 'pass');
assert.equal(aggregateRichPassCheck.details.richFixtureUserHandles.includes('directive-soak-a'), true);
const fiveLaneRichRoot = makeArtifactRoot();
const fiveLaneRichSummaries = lanes.map((lane, index) => {
  const artifactRoot = path.join(fiveLaneRichRoot, lane.id);
  writePassingLaneArtifacts(artifactRoot);
  return summarizeContinuityMatrixLane({
    lane,
    child: {
      exitCode: 0,
      signal: null,
      stdout: JSON.stringify({ status: 'pass', artifactRoot }),
      stderr: '',
      json: { status: 'pass', artifactRoot }
    },
    artifactRoot
  });
});
const fiveLaneRichPassReport = buildReport({
  runId: 'aggregate-five-lane-rich-pass',
  mode: 'live',
  options: {
    live: true,
    turnLimit: '3',
    skipReadiness: false,
    resume: false,
    laneFilter: []
  },
  paths: { root: fiveLaneRichRoot },
  lanes,
  readiness: {
    status: 'pass',
    externalContextProbe: {
      status: 'pass',
      fixtureDepth: richExternalProbeSummary.fixtureDepth
    }
  },
  laneSummaries: fiveLaneRichSummaries
});
const fiveLaneRichPassCheck = fiveLaneRichPassReport.checks.find((entry) => entry.id === 'external-context-generation-proof');
assert.equal(fiveLaneRichPassCheck.status, 'pass');
assert.equal(fiveLaneRichPassCheck.details.richFixtureUserHandles.length, 5);

const fiveLaneRichMissingRoot = makeArtifactRoot();
const fiveLaneRichMissingSummaries = lanes.map((lane, index) => {
  const artifactRoot = path.join(fiveLaneRichMissingRoot, lane.id);
  writePassingLaneArtifacts(artifactRoot);
  if (index === 2) removeVectFoxRichFixturePressure(artifactRoot);
  return summarizeContinuityMatrixLane({
    lane,
    child: {
      exitCode: 0,
      signal: null,
      stdout: JSON.stringify({ status: 'pass', artifactRoot }),
      stderr: '',
      json: { status: 'pass', artifactRoot }
    },
    artifactRoot
  });
});
assert.equal(fiveLaneRichMissingSummaries[2].externalContextGenerationProof.status, 'pass');
assert.equal(fiveLaneRichMissingSummaries[2].externalContextGenerationProof.richFixturePressure.status, 'fail');
assert.deepEqual(fiveLaneRichMissingSummaries[2].externalContextGenerationProof.richFixturePressure.missingTargets, ['vectFox']);
const fiveLaneRichMissingReport = buildReport({
  runId: 'aggregate-five-lane-rich-missing',
  mode: 'live',
  options: {
    live: true,
    turnLimit: '3',
    skipReadiness: false,
    resume: false,
    laneFilter: []
  },
  paths: { root: fiveLaneRichMissingRoot },
  lanes,
  readiness: {
    status: 'pass',
    externalContextProbe: {
      status: 'pass',
      fixtureDepth: richExternalProbeSummary.fixtureDepth
    }
  },
  laneSummaries: fiveLaneRichMissingSummaries
});
const fiveLaneRichMissingCheck = fiveLaneRichMissingReport.checks.find((entry) => entry.id === 'external-context-generation-proof');
assert.equal(fiveLaneRichMissingCheck.status, 'fail');
assert.match(fiveLaneRichMissingCheck.summary, /rich fixture lane/);
assert.equal(fiveLaneRichMissingCheck.details.lanes[2].richFixturePressure.status, 'fail');
const aggregateHostNativeCompletionCheck = aggregateRichPassReport.checks.find((entry) => entry.id === 'host-native-completion-core-proof');
assert.equal(aggregateHostNativeCompletionCheck.status, 'pass');
assert.equal(aggregateHostNativeCompletionCheck.details.lanes[0].completedHostContinueCount, 1);
assert.equal(aggregateHostNativeCompletionCheck.details.lanes[0].requiredCompletionStatus, 'pass');
assert.equal(aggregateHostNativeCompletionCheck.details.lanes[0].requiredCompletionMatchedCount, 1);
const staleLegacyWarningRoot = makeArtifactRoot();
writePassingLaneArtifacts(staleLegacyWarningRoot);
fs.appendFileSync(path.join(staleLegacyWarningRoot, 'live-log.jsonl'), `${JSON.stringify({
  kind: 'turn-end',
  status: 'warning',
  scriptMessageId: 'soak-turn-03',
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
  },
  hostNativeCompletion: {
    persisted: {
      status: 'warning',
      source: 'coreStoreResponseLedger',
      completionSource: 'coreProjection',
      targetTransactionCount: 0,
      completedHostContinueCount: 0,
      failedHostContinueCount: 0,
      entries: [],
      unavailableReason: 'no-hostContinue-completion-candidates'
    }
  }
})}\n`, 'utf8');
const staleLegacyWarningLaneSummary = summarizeContinuityMatrixLane({
  lane: lanes[0],
  child: {
    exitCode: 0,
    signal: null,
    stdout: JSON.stringify({ status: 'pass', artifactRoot: staleLegacyWarningRoot }),
    stderr: '',
    json: { status: 'pass', artifactRoot: staleLegacyWarningRoot }
  },
  artifactRoot: staleLegacyWarningRoot
});
assert.equal(staleLegacyWarningLaneSummary.generationTimingProof.status, 'pass');
assert.equal(staleLegacyWarningLaneSummary.hostNativeCompletionProof.status, 'pass');
const staleLegacyWarningAggregate = buildReport({
  runId: 'aggregate-stale-legacy-warning',
  mode: 'live',
  options: {
    live: true,
    turnLimit: '3',
    skipReadiness: false,
    resume: false,
    laneFilter: []
  },
  paths: { root: staleLegacyWarningRoot },
  lanes: [lanes[0]],
  readiness: {
    status: 'pass',
    externalContextProbe: {
      status: 'pass',
      fixtureDepth: richExternalProbeSummary.fixtureDepth
    }
  },
  laneSummaries: [staleLegacyWarningLaneSummary]
});
assert.equal(staleLegacyWarningAggregate.checks.find((entry) => entry.id === 'generation-start-timing-core-proof').status, 'pass');
assert.equal(staleLegacyWarningAggregate.checks.find((entry) => entry.id === 'host-native-completion-core-proof').status, 'pass');
const aggregateStoryQualityCheck = aggregateRichPassReport.checks.find((entry) => entry.id === 'story-quality-model-review');
assert.equal(aggregateStoryQualityCheck.status, 'pass');
assert.equal(aggregateStoryQualityCheck.details.lanes[0].modelAssistedReviewStatus, 'pass');
const aggregateModelCallPolicyCheck = aggregateRichPassReport.checks.find((entry) => entry.id === 'model-call-failure-policy');
assert.equal(aggregateModelCallPolicyCheck.status, 'pass');
assert.equal(aggregateModelCallPolicyCheck.details.lanes[0].failedModelCallCount, 0);
assert.equal(firstHostNativeCompletionRequiredTurn(), 3);
const aggregateHostNativeCoverageCheck = aggregateRichPassReport.checks.find((entry) => entry.id === 'host-native-completion-turn-coverage');
assert.equal(aggregateHostNativeCoverageCheck.status, 'warning');
assert.match(aggregateHostNativeCoverageCheck.summary, /before required host-native completion proof turn 3/);
assert.equal(aggregateHostNativeCoverageCheck.details.turnLimit, 1);
assert.equal(aggregateHostNativeCoverageCheck.details.firstHostNativeCompletionRequiredTurn, 3);
const aggregateTurnThreeReport = buildReport({
  runId: 'aggregate-turn-three',
  mode: 'live',
  options: {
    live: true,
    turnLimit: '3',
    skipReadiness: false,
    resume: false,
    laneFilter: []
  },
  paths: { root },
  lanes: [lanes[0]],
  readiness: {
    status: 'pass',
    externalContextProbe: {
      status: 'pass',
      fixtureDepth: richExternalProbeSummary.fixtureDepth
    }
  },
  laneSummaries: [laneSummary]
});
assert.equal(
  aggregateTurnThreeReport.checks.find((entry) => entry.id === 'host-native-completion-turn-coverage').status,
  'pass'
);
const aggregateFullDepthReport = buildReport({
  runId: 'aggregate-full-depth',
  mode: 'live',
  options: {
    live: true,
    turnLimit: '',
    skipReadiness: false,
    resume: false,
    laneFilter: []
  },
  paths: { root },
  lanes: [lanes[0]],
  readiness: {
    status: 'pass',
    externalContextProbe: {
      status: 'pass',
      fixtureDepth: richExternalProbeSummary.fixtureDepth
    }
  },
  laneSummaries: [laneSummary]
});
assert.equal(
  aggregateFullDepthReport.checks.find((entry) => entry.id === 'host-native-completion-turn-coverage').status,
  'pass'
);

const blockingModelCallRoot = makeArtifactRoot();
writePassingLaneArtifacts(blockingModelCallRoot, {
  failedModelCallCount: 1,
  modelCalls: [{
    id: 'model-call:blocking:narration',
    roleId: 'narration',
    providerKind: 'main',
    status: 'failed',
    ok: false,
    latencyMs: 90000,
    errorCode: 'DIRECTIVE_GENERATION_TIMEOUT',
    requestHash: 'blocking-request-hash',
    metadata: {
      requestHash: 'blocking-request-hash'
    }
  }]
});
const blockingModelCallLaneSummary = summarizeContinuityMatrixLane({
  lane: lanes[0],
  child: {
    exitCode: 0,
    signal: null,
    stdout: JSON.stringify({ status: 'pass', artifactRoot: blockingModelCallRoot }),
    stderr: '',
    json: { status: 'pass', artifactRoot: blockingModelCallRoot }
  },
  artifactRoot: blockingModelCallRoot
});
assert.equal(blockingModelCallLaneSummary.status, 'fail');
assert.equal(blockingModelCallLaneSummary.modelCallFailurePolicy.status, 'fail');
assert.equal(blockingModelCallLaneSummary.modelCallFailurePolicy.releaseBlockingCalls.length, 1);
const blockingModelCallAggregate = buildReport({
  runId: 'aggregate-blocking-model-call',
  mode: 'live',
  options: {
    live: true,
    turnLimit: '1',
    skipReadiness: false,
    resume: false,
    laneFilter: []
  },
  paths: { root: blockingModelCallRoot },
  lanes: [lanes[0]],
  readiness: {
    status: 'pass',
    externalContextProbe: {
      status: 'pass',
      fixtureDepth: richExternalProbeSummary.fixtureDepth
    }
  },
  laneSummaries: [blockingModelCallLaneSummary]
});
assert.equal(blockingModelCallAggregate.checks.find((entry) => entry.id === 'model-call-failure-policy').status, 'fail');

const notRunStoryQualityRoot = makeArtifactRoot();
writePassingLaneArtifacts(notRunStoryQualityRoot, {
  turnLimit: 1,
  storyQualityModelStatus: 'not-run'
});
const notRunStoryQualitySummary = summarizeStoryQualityReviewArtifacts({ artifactRoot: notRunStoryQualityRoot });
assert.equal(notRunStoryQualitySummary.status, 'warning');
assert.equal(notRunStoryQualitySummary.modelAssistedReview.missing, true);
const notRunStoryLaneSummary = summarizeContinuityMatrixLane({
  lane: lanes[0],
  child: {
    exitCode: 0,
    signal: null,
    stdout: JSON.stringify({ status: 'pass', artifactRoot: notRunStoryQualityRoot }),
    stderr: '',
    json: { status: 'pass', artifactRoot: notRunStoryQualityRoot }
  },
  artifactRoot: notRunStoryQualityRoot,
  turnLimit: 1
});
assert.equal(notRunStoryLaneSummary.status, 'warning');
const boundedNotRunStoryReport = buildReport({
  runId: 'aggregate-story-not-run-bounded',
  mode: 'live',
  options: {
    live: true,
    turnLimit: '1',
    skipReadiness: false,
    resume: false,
    laneFilter: []
  },
  paths: { root: notRunStoryQualityRoot },
  lanes: [lanes[0]],
  readiness: {
    status: 'pass',
    externalContextProbe: {
      status: 'pass',
      fixtureDepth: richExternalProbeSummary.fixtureDepth
    }
  },
  laneSummaries: [notRunStoryLaneSummary]
});
assert.equal(
  boundedNotRunStoryReport.checks.find((entry) => entry.id === 'story-quality-model-review').status,
  'warning'
);
const unboundedNotRunStoryQualityRoot = makeArtifactRoot();
writePassingLaneArtifacts(unboundedNotRunStoryQualityRoot, {
  storyQualityModelStatus: 'not-run'
});
assert.equal(summarizeStoryQualityReviewArtifacts({ artifactRoot: unboundedNotRunStoryQualityRoot }).status, 'warning');
assert.equal(summarizeReusableContinuityMatrixLane({
  lane: lanes[0],
  artifactRoot: unboundedNotRunStoryQualityRoot,
  turnLimit: null
}), null);
const unboundedNotRunStoryReport = buildReport({
  runId: 'aggregate-story-not-run-unbounded',
  mode: 'live',
  options: {
    live: true,
    turnLimit: '',
    skipReadiness: false,
    resume: false,
    laneFilter: []
  },
  paths: { root: notRunStoryQualityRoot },
  lanes: [lanes[0]],
  readiness: {
    status: 'pass',
    externalContextProbe: {
      status: 'pass',
      fixtureDepth: richExternalProbeSummary.fixtureDepth
    }
  },
  laneSummaries: [notRunStoryLaneSummary]
});
const unboundedStoryCheck = unboundedNotRunStoryReport.checks.find((entry) => entry.id === 'story-quality-model-review');
assert.equal(unboundedStoryCheck.status, 'fail');
assert.match(unboundedStoryCheck.summary, /unbounded certification requires pass/);

const flatStoryQualityRoot = makeArtifactRoot();
writePassingLaneArtifacts(flatStoryQualityRoot);
const flatStoryReportPath = path.join(flatStoryQualityRoot, 'report.json');
const flatStoryReport = readJson(flatStoryReportPath);
const flatStoryCheck = flatStoryReport.checks.find((entry) => entry.id === 'live-story-quality-transcript-review');
flatStoryCheck.details = {
  modelAssistedReview: {
    status: 'pass',
    requestPath: 'quality-review/model-assisted-review/request.json',
    resultPath: 'quality-review/model-assisted-review/result.json',
    providerOutputPath: 'smoke-story-quality-review/provider-result.json',
    inputHash: 'story-quality-input-hash',
    counts: { scores: 1, scoreZero: 0, warningOrWeak: 0 }
  }
};
writeJson(flatStoryReportPath, flatStoryReport);
const flatStorySummary = summarizeStoryQualityReviewArtifacts({ artifactRoot: flatStoryQualityRoot });
assert.equal(flatStorySummary.status, 'pass');
assert.equal(flatStorySummary.modelAssistedReview.status, 'pass');

const staleStoryQualityRoot = makeArtifactRoot();
writePassingLaneArtifacts(staleStoryQualityRoot);
const staleStoryResultPath = path.join(staleStoryQualityRoot, 'quality-review', 'model-assisted-review', 'result.json');
const staleStoryResult = readJson(staleStoryResultPath);
staleStoryResult.inputHash = 'stale-story-quality-input-hash';
writeJson(staleStoryResultPath, staleStoryResult);
const staleStorySummary = summarizeStoryQualityReviewArtifacts({ artifactRoot: staleStoryQualityRoot });
assert.equal(staleStorySummary.status, 'fail');
assert.equal(staleStorySummary.modelAssistedReview.validationFailed, true);
assert.equal(staleStorySummary.modelAssistedReview.validationIssues.some((entry) => entry.code === 'input-hash-mismatch'), true);

const wrongRoleStoryQualityRoot = makeArtifactRoot();
writePassingLaneArtifacts(wrongRoleStoryQualityRoot);
const wrongRoleStoryResultPath = path.join(wrongRoleStoryQualityRoot, 'quality-review', 'model-assisted-review', 'result.json');
const wrongRoleStoryResult = readJson(wrongRoleStoryResultPath);
wrongRoleStoryResult.modelCall.roleId = 'factualGroundingReviewer';
writeJson(wrongRoleStoryResultPath, wrongRoleStoryResult);
const wrongRoleStorySummary = summarizeStoryQualityReviewArtifacts({ artifactRoot: wrongRoleStoryQualityRoot });
assert.equal(wrongRoleStorySummary.status, 'fail');
assert.equal(wrongRoleStorySummary.modelAssistedReview.validationIssues.some((entry) => entry.code === 'model-call-role-mismatch'), true);

const noScoreStoryQualityRoot = makeArtifactRoot();
writePassingLaneArtifacts(noScoreStoryQualityRoot);
const noScoreStoryResultPath = path.join(noScoreStoryQualityRoot, 'quality-review', 'model-assisted-review', 'result.json');
const noScoreStoryResult = readJson(noScoreStoryResultPath);
noScoreStoryResult.counts = { scores: 0, scoreZero: 0, warningOrWeak: 0 };
noScoreStoryResult.scores = [];
writeJson(noScoreStoryResultPath, noScoreStoryResult);
const noScoreStorySummary = summarizeStoryQualityReviewArtifacts({ artifactRoot: noScoreStoryQualityRoot });
assert.equal(noScoreStorySummary.status, 'fail');
assert.equal(noScoreStorySummary.modelAssistedReview.validationIssues.some((entry) => entry.code === 'score-count-missing'), true);

const partialCoverageStoryQualityRoot = makeArtifactRoot();
writePassingLaneArtifacts(partialCoverageStoryQualityRoot);
const partialCoverageStoryRequestPath = path.join(partialCoverageStoryQualityRoot, 'quality-review', 'model-assisted-review', 'request.json');
const partialCoverageStoryRequest = readJson(partialCoverageStoryRequestPath);
partialCoverageStoryRequest.transcript.push({
  index: 1,
  messageId: 'fixture-assistant-2',
  role: 'assistant',
  textHash: 'a'.repeat(64),
  text: 'A second message that must be scored.'
});
writeJson(partialCoverageStoryRequestPath, partialCoverageStoryRequest);
const partialCoverageStorySummary = summarizeStoryQualityReviewArtifacts({ artifactRoot: partialCoverageStoryQualityRoot });
assert.equal(partialCoverageStorySummary.status, 'fail');
assert.equal(partialCoverageStorySummary.modelAssistedReview.validationIssues.some((entry) => entry.code === 'score-transcript-coverage-mismatch'), true);

const unparseableStoryQualityRoot = makeArtifactRoot();
writePassingLaneArtifacts(unparseableStoryQualityRoot);
writeJson(path.join(unparseableStoryQualityRoot, 'quality-review', 'model-assisted-review', 'result.json'), {
  kind: 'directive.liveCampaignSoak.storyQualityModelReviewResult',
  schemaVersion: 1,
  status: 'fail',
  reason: 'model-assisted story quality reviewer did not return parseable JSON',
  modelCall: {
    roleId: 'storyQualityReviewer',
    status: 'ok',
    ok: true
  }
});
const unparseableStorySummary = summarizeStoryQualityReviewArtifacts({ artifactRoot: unparseableStoryQualityRoot });
assert.equal(unparseableStorySummary.status, 'fail');
assert.equal(unparseableStorySummary.modelAssistedReview.unparseable, true);

const timeoutStoryQualityRoot = makeArtifactRoot();
writePassingLaneArtifacts(timeoutStoryQualityRoot);
writeJson(path.join(timeoutStoryQualityRoot, 'quality-review', 'model-assisted-review', 'result.json'), {
  kind: 'directive.liveCampaignSoak.storyQualityModelReviewResult',
  schemaVersion: 1,
  status: 'fail',
  reason: 'DIRECTIVE_GENERATION_TIMEOUT after 60000 ms',
  modelCall: {
    roleId: 'storyQualityReviewer',
    status: 'failed',
    ok: false,
    errorCode: 'DIRECTIVE_GENERATION_TIMEOUT',
    latencyMs: 60000
  }
});
const timeoutStorySummary = summarizeStoryQualityReviewArtifacts({ artifactRoot: timeoutStoryQualityRoot });
assert.equal(timeoutStorySummary.status, 'fail');
assert.equal(timeoutStorySummary.modelAssistedReview.timedOut, true);

const missingTimingRoot = makeArtifactRoot();
writePassingLaneArtifacts(missingTimingRoot, { includeTiming: false });
const missingTimingSummary = summarizeGenerationTimingCoreProof({ artifactRoot: missingTimingRoot });
assert.equal(missingTimingSummary.status, 'fail');
assert.match(missingTimingSummary.summary, /missing live-generation-start-timing/);
assert.equal(summarizeContinuityMatrixLane({
  lane: lanes[0],
  child: {
    exitCode: 0,
    signal: null,
    stdout: JSON.stringify({ status: 'pass', artifactRoot: missingTimingRoot }),
    stderr: '',
    json: { status: 'pass', artifactRoot: missingTimingRoot }
  },
  artifactRoot: missingTimingRoot
}).status, 'fail');
assert.equal(summarizeReusableContinuityMatrixLane({
  lane: lanes[0],
  artifactRoot: missingTimingRoot,
  turnLimit: null
}), null);

const runtimeTimingRoot = makeArtifactRoot();
writePassingLaneArtifacts(runtimeTimingRoot, {
  timingProof: {
    status: 'pass',
    source: 'runtimeSnapshot',
    timingSource: 'runtimeSnapshot',
    checkedTurnCount: 1,
    maxGenerationStartLatencyMs: 4200
  }
});
const runtimeTimingSummary = summarizeGenerationTimingCoreProof({ artifactRoot: runtimeTimingRoot });
assert.equal(runtimeTimingSummary.status, 'fail');
assert.match(runtimeTimingSummary.summary, /not persisted CORE projection/);

const skippedTimingRoot = makeArtifactRoot();
writePassingLaneArtifacts(skippedTimingRoot, {
  timingProof: {
    status: 'skipped',
    source: 'coreStoreTurnTiming',
    timingSource: 'coreProjection',
    checkedTurnCount: 0,
    skippedTurnCount: 2,
    skippedEntries: [{ responseKind: 'clarificationNeeded' }]
  }
});
const skippedTimingSummary = summarizeGenerationTimingCoreProof({ artifactRoot: skippedTimingRoot });
assert.equal(skippedTimingSummary.status, 'warning');
assert.match(skippedTimingSummary.summary, /incomplete/);

const missingHostCompletionRoot = makeArtifactRoot();
writePassingLaneArtifacts(missingHostCompletionRoot, { includeHostNativeCompletion: false });
const missingHostCompletionSummary = summarizeHostNativeCompletionProof({ artifactRoot: missingHostCompletionRoot });
assert.equal(missingHostCompletionSummary.status, 'fail');
assert.match(missingHostCompletionSummary.summary, /missing live-host-native-completion-proof/);
assert.equal(summarizeContinuityMatrixLane({
  lane: lanes[0],
  child: {
    exitCode: 0,
    signal: null,
    stdout: JSON.stringify({ status: 'pass', artifactRoot: missingHostCompletionRoot }),
    stderr: '',
    json: { status: 'pass', artifactRoot: missingHostCompletionRoot }
  },
  artifactRoot: missingHostCompletionRoot
}).status, 'fail');

const nonCoreHostCompletionRoot = makeArtifactRoot();
writePassingLaneArtifacts(nonCoreHostCompletionRoot, {
  hostNativeCompletionProof: {
    status: 'pass',
    source: 'runtimeSnapshot',
    completionSource: 'runtimeSnapshot',
    completedHostContinueCount: 1
  }
});
const nonCoreHostCompletionSummary = summarizeHostNativeCompletionProof({ artifactRoot: nonCoreHostCompletionRoot });
assert.equal(nonCoreHostCompletionSummary.status, 'fail');
assert.match(nonCoreHostCompletionSummary.summary, /not persisted CORE projection/);

const incompleteHostCompletionRoot = makeArtifactRoot();
writePassingLaneArtifacts(incompleteHostCompletionRoot, {
  hostNativeCompletionProof: {
    status: 'warning',
    source: 'coreStoreResponseLedger',
    completionSource: 'coreProjection',
    completedHostContinueCount: 0,
    failedHostContinueCount: 0,
    unavailableReason: 'no-hostContinue-completion-candidates'
  }
});
const incompleteHostCompletionSummary = summarizeHostNativeCompletionProof({ artifactRoot: incompleteHostCompletionRoot });
assert.equal(incompleteHostCompletionSummary.status, 'warning');
assert.match(incompleteHostCompletionSummary.summary, /incomplete/);

const countOnlyHostCompletionRoot = makeArtifactRoot();
writePassingLaneArtifacts(countOnlyHostCompletionRoot, {
  hostNativeCompletionProof: {
    status: 'pass',
    source: 'coreStoreResponseLedger',
    completionSource: 'coreProjection',
    completedHostContinueCount: 1,
    failedHostContinueCount: 0,
    maxCompletionLatencyMs: 9000,
    entries: [
      {
        responseId: 'response-host-count-only',
        transactionId: 'txn-host-count-only',
        route: 'hostContinue',
        responseKind: 'hostContinue',
        hostMessageId: 'assistant-host-count-only',
        textHash: 'c'.repeat(64),
        completionStatus: 'pass'
      }
    ]
  }
});
const countOnlyHostCompletionSummary = summarizeHostNativeCompletionProof({
  artifactRoot: countOnlyHostCompletionRoot,
  turnLimit: '3'
});
assert.equal(countOnlyHostCompletionSummary.status, 'fail');
assert.match(countOnlyHostCompletionSummary.summary, /missing required turn binding/);
assert.equal(countOnlyHostCompletionSummary.requiredCompletionAssessment.missing[0].scriptMessageId, 'soak-turn-03');

const preRequiredHostCompletionSummary = summarizeHostNativeCompletionProof({
  artifactRoot: countOnlyHostCompletionRoot,
  turnLimit: '2'
});
assert.equal(preRequiredHostCompletionSummary.status, 'pass');

const fullRoot = makeArtifactRoot();
writePassingLaneArtifacts(fullRoot, { promptCaptureCount: 52 });
for (let turn = 2; turn <= 52; turn += 1) {
  writeJson(path.join(fullRoot, 'fact-checks', `soak-turn-${String(turn).padStart(2, '0')}`, 'fact-check.json'), {
    status: 'pass',
    counts: {
      respected: 1,
      omitted: 0,
      unsupportedDetail: 0,
      contradicted: 0,
      promptAvailable: 1
    },
    results: []
  });
}
const reusableFullLane = summarizeReusableContinuityMatrixLane({
  lane: lanes[0],
  artifactRoot: fullRoot,
  turnLimit: null
});
assert.equal(reusableFullLane.reused, true);
assert.equal(reusableFullLane.status, 'pass');
assert.equal(reusableFullLane.artifactCompleteness.generationPromptFileCount, 52);
assert.equal(reusableFullLane.artifactCompleteness.expectedPromptInspectionCount, 52);
assert.equal(reusableFullLane.artifactCompleteness.promptInspectionDepthMissing, false);
assert.equal(reusableFullLane.artifactCompleteness.externalContextSummaryPresent, true);
assert.equal(summarizeReusableContinuityMatrixLane({
  lane: lanes[0],
  artifactRoot: root,
  turnLimit: '1'
}), null);

const missingExternalSummaryRoot = makeArtifactRoot();
writePassingLaneArtifacts(missingExternalSummaryRoot, { turnLimit: 1 });
fs.rmSync(path.join(missingExternalSummaryRoot, 'host-extensions'), { recursive: true, force: true });
const missingExternalSummaryCompleteness = summarizeLaneArtifactCompleteness({
  artifactRoot: missingExternalSummaryRoot,
  turnLimit: '1'
});
assert.equal(missingExternalSummaryCompleteness.status, 'fail');
assert.equal(missingExternalSummaryCompleteness.externalContextSummaryPresent, false);
assert.equal(missingExternalSummaryCompleteness.missingFiles.includes('host-extensions/external-context-summary.json'), true);
assert.equal(summarizeContinuityMatrixLane({
  lane: lanes[0],
  child: {
    exitCode: 0,
    signal: null,
    stdout: JSON.stringify({ status: 'pass', artifactRoot: missingExternalSummaryRoot }),
    stderr: '',
    json: { status: 'pass', artifactRoot: missingExternalSummaryRoot }
  },
  artifactRoot: missingExternalSummaryRoot,
  turnLimit: '1'
}).status, 'fail');

const missingExternalSummaryFileRoot = makeArtifactRoot();
writePassingLaneArtifacts(missingExternalSummaryFileRoot, { turnLimit: 1 });
fs.rmSync(path.join(missingExternalSummaryFileRoot, 'host-extensions', 'external-context-summary.json'), { force: true });
const missingExternalSummaryFileCompleteness = summarizeLaneArtifactCompleteness({
  artifactRoot: missingExternalSummaryFileRoot,
  turnLimit: '1'
});
assert.equal(missingExternalSummaryFileCompleteness.status, 'fail');
assert.equal(missingExternalSummaryFileCompleteness.externalContextSummaryPresent, false);
assert.equal(missingExternalSummaryFileCompleteness.missingFiles.includes('host-extensions/external-context-summary.json'), true);
assert.equal(summarizeContinuityMatrixLane({
  lane: lanes[0],
  child: {
    exitCode: 0,
    signal: null,
    stdout: JSON.stringify({ status: 'pass', artifactRoot: missingExternalSummaryFileRoot }),
    stderr: '',
    json: { status: 'pass', artifactRoot: missingExternalSummaryFileRoot }
  },
  artifactRoot: missingExternalSummaryFileRoot,
  turnLimit: '1'
}).status, 'fail');

const malformedExternalSummaryRoot = makeArtifactRoot();
writePassingLaneArtifacts(malformedExternalSummaryRoot, { turnLimit: 1 });
writeJson(path.join(malformedExternalSummaryRoot, 'host-extensions', 'external-context-summary.json'), {
  kind: 'directive.sillytavern.externalContextSummary.v1',
  schemaVersion: 1,
  status: 'warning',
  authority: {
    directiveAuthority: false,
    role: 'diagnostics-provenance-only'
  },
  aggregate: {
    captureCount: 0,
    knownExternalPromptKeys: [],
    refHashes: [],
    targetSummaryCount: 0
  }
});
const malformedExternalSummaryCompleteness = summarizeLaneArtifactCompleteness({
  artifactRoot: malformedExternalSummaryRoot,
  turnLimit: '1'
});
assert.equal(malformedExternalSummaryCompleteness.status, 'fail');
assert.equal(malformedExternalSummaryCompleteness.externalContextSummary.present, true);
assert.equal(malformedExternalSummaryCompleteness.externalContextSummary.status, 'fail');
assert.equal(malformedExternalSummaryCompleteness.externalContextSummary.missingFields.includes('status'), true);
assert.equal(malformedExternalSummaryCompleteness.externalContextSummary.missingFields.includes('aggregate.captureCount'), true);
assert.equal(malformedExternalSummaryCompleteness.externalContextSummary.missingFields.includes('aggregate.knownExternalPromptKeys'), true);
assert.equal(malformedExternalSummaryCompleteness.externalContextSummary.missingFields.includes('aggregate.refHashes'), true);
assert.equal(malformedExternalSummaryCompleteness.externalContextSummary.missingFields.includes('aggregate.targetSummaryCount'), true);
assert.equal(malformedExternalSummaryCompleteness.externalContextSummary.missingFields.includes('aggregate.finalHostPromptMayIncludeExternal'), true);
assert.equal(malformedExternalSummaryCompleteness.externalContextSummary.missingFields.includes('targetSummaries.requiredTargets'), true);

const genericExternalSummaryRoot = makeArtifactRoot();
writePassingLaneArtifacts(genericExternalSummaryRoot, { turnLimit: 1 });
writeJson(path.join(genericExternalSummaryRoot, 'host-extensions', 'external-context-summary.json'), {
  kind: 'directive.sillytavern.externalContextSummary.v1',
  schemaVersion: 1,
  status: 'pass',
  authority: {
    directiveAuthority: false,
    role: 'diagnostics-provenance-only'
  },
  aggregate: {
    captureCount: 1,
    knownExternalPromptKeys: ['generic_plugin_key'],
    refHashes: ['a'.repeat(64)],
    targetSummaryCount: 1
  },
  targetSummaries: [{
    scriptMessageId: 'soak-turn-01',
    targets: {
      genericPlugin: { status: 'observed' }
    }
  }]
});
const genericExternalSummaryCompleteness = summarizeLaneArtifactCompleteness({
  artifactRoot: genericExternalSummaryRoot,
  turnLimit: '1'
});
assert.equal(genericExternalSummaryCompleteness.status, 'fail');
assert.deepEqual(genericExternalSummaryCompleteness.externalContextSummary.missingTargetSummaries, ['stLorebooks', 'memoryBooks', 'summaryception', 'vectFox']);

const placeholderExternalSummaryRoot = makeArtifactRoot();
writePassingLaneArtifacts(placeholderExternalSummaryRoot, { turnLimit: 1 });
const placeholderExternalSummary = readJson(path.join(placeholderExternalSummaryRoot, 'host-extensions', 'external-context-summary.json'));
writeJson(path.join(placeholderExternalSummaryRoot, 'host-extensions', 'external-context-summary.json'), {
  ...placeholderExternalSummary,
  targetSummaries: [{
    scriptMessageId: 'soak-turn-01',
    targets: {
      stLorebooks: {},
      memoryBooks: {},
      summaryception: {},
      vectFox: {}
    }
  }]
});
const placeholderExternalSummaryCompleteness = summarizeLaneArtifactCompleteness({
  artifactRoot: placeholderExternalSummaryRoot,
  turnLimit: '1'
});
assert.equal(placeholderExternalSummaryCompleteness.status, 'fail');
assert.deepEqual(placeholderExternalSummaryCompleteness.externalContextSummary.missingTargetSummaries, []);
assert.deepEqual(placeholderExternalSummaryCompleteness.externalContextSummary.placeholderTargetSummaries, ['stLorebooks', 'memoryBooks', 'summaryception', 'vectFox']);
assert.equal(placeholderExternalSummaryCompleteness.externalContextSummary.missingFields.includes('targetSummaries.usefulTargets'), true);

const partialFullPromptDepthRoot = makeArtifactRoot();
writePassingLaneArtifacts(partialFullPromptDepthRoot, { promptCaptureCount: 1 });
for (let turn = 2; turn <= 52; turn += 1) {
  writeJson(path.join(partialFullPromptDepthRoot, 'fact-checks', `soak-turn-${String(turn).padStart(2, '0')}`, 'fact-check.json'), {
    status: 'pass',
    counts: {
      respected: 1,
      omitted: 0,
      unsupportedDetail: 0,
      contradicted: 0,
      promptAvailable: 1
    },
    results: []
  });
}
const partialFullPromptDepth = summarizeLaneArtifactCompleteness({
  artifactRoot: partialFullPromptDepthRoot,
  turnLimit: null
});
assert.equal(partialFullPromptDepth.status, 'warning');
assert.equal(partialFullPromptDepth.generationPromptFileCount, 1);
assert.equal(partialFullPromptDepth.expectedPromptInspectionCount, 52);
assert.equal(partialFullPromptDepth.promptInspectionDepthMissing, true);
assert.equal(partialFullPromptDepth.factCheckDepthMissing, false);
assert.equal(summarizeReusableContinuityMatrixLane({
  lane: lanes[0],
  artifactRoot: partialFullPromptDepthRoot,
  turnLimit: null
}), null);

const boundedRoot = makeArtifactRoot();
writePassingLaneArtifacts(boundedRoot, { turnLimit: 1 });
const reusableBoundedLane = summarizeReusableContinuityMatrixLane({
  lane: lanes[0],
  artifactRoot: boundedRoot,
  turnLimit: '1'
});
assert.equal(reusableBoundedLane.reused, true);
assert.equal(reusableBoundedLane.status, 'pass');
assert.equal(summarizeReusableContinuityMatrixLane({
  lane: lanes[0],
  artifactRoot: boundedRoot,
  turnLimit: null
}), null);

const partialFactDepthRoot = makeArtifactRoot();
writePassingLaneArtifacts(partialFactDepthRoot, { turnLimit: 5, promptCaptureCount: 5 });
const partialFactDepth = summarizeLaneArtifactCompleteness({
  artifactRoot: partialFactDepthRoot,
  turnLimit: '5'
});
assert.equal(partialFactDepth.status, 'warning');
assert.equal(partialFactDepth.generationPromptFileCount, 5);
assert.equal(partialFactDepth.expectedPromptInspectionCount, 5);
assert.equal(partialFactDepth.promptInspectionDepthMissing, false);
assert.equal(partialFactDepth.factCheckDepthMissing, true);
const reusablePartialFactDepth = summarizeReusableContinuityMatrixLane({
  lane: lanes[0],
  artifactRoot: partialFactDepthRoot,
  turnLimit: '5'
});
assert.equal(reusablePartialFactDepth.reused, true);
assert.equal(reusablePartialFactDepth.status, 'warning');

const partialPromptDepthRoot = makeArtifactRoot();
writePassingLaneArtifacts(partialPromptDepthRoot, { turnLimit: 5, promptCaptureCount: 1 });
for (let turn = 2; turn <= 5; turn += 1) {
  writeJson(path.join(partialPromptDepthRoot, 'fact-checks', `soak-turn-${String(turn).padStart(2, '0')}`, 'fact-check.json'), {
    status: 'pass',
    counts: {
      respected: 1,
      omitted: 0,
      unsupportedDetail: 0,
      contradicted: 0,
      promptAvailable: 1
    },
    results: []
  });
}
const partialPromptDepth = summarizeLaneArtifactCompleteness({
  artifactRoot: partialPromptDepthRoot,
  turnLimit: '5'
});
assert.equal(partialPromptDepth.status, 'warning');
assert.equal(partialPromptDepth.generationPromptFileCount, 1);
assert.equal(partialPromptDepth.expectedPromptInspectionCount, 5);
assert.equal(partialPromptDepth.promptInspectionDepthMissing, true);
assert.equal(partialPromptDepth.factCheckDepthMissing, false);
const reusablePartialPromptDepth = summarizeReusableContinuityMatrixLane({
  lane: lanes[0],
  artifactRoot: partialPromptDepthRoot,
  turnLimit: '5'
});
assert.equal(reusablePartialPromptDepth, null);

const missingGenerationPromptRoot = makeArtifactRoot();
writePassingLaneArtifacts(missingGenerationPromptRoot, { includePreGenerationPromptCaptures: false });
const missingGenerationPromptSummary = summarizeExternalContextGenerationArtifacts({ artifactRoot: missingGenerationPromptRoot });
assert.equal(missingGenerationPromptSummary.status, 'fail');
assert.equal(missingGenerationPromptSummary.captureCount, 0);
assert.match(missingGenerationPromptSummary.summary, /No generation-time/);
assert.equal(summarizeContinuityMatrixLane({
  lane: lanes[0],
  child: {
    exitCode: 0,
    signal: null,
    stdout: JSON.stringify({ status: 'pass', artifactRoot: missingGenerationPromptRoot }),
    stderr: '',
    json: { status: 'pass', artifactRoot: missingGenerationPromptRoot }
  },
  artifactRoot: missingGenerationPromptRoot
}).status, 'fail');

const shallowGenerationPromptRoot = makeArtifactRoot();
writePassingLaneArtifacts(shallowGenerationPromptRoot, { turnLimit: 3, promptCaptureCount: 2 });
const shallowGenerationPromptSummary = summarizeExternalContextGenerationArtifacts({
  artifactRoot: shallowGenerationPromptRoot,
  turnLimit: '3'
});
assert.equal(shallowGenerationPromptSummary.status, 'fail');
assert.equal(shallowGenerationPromptSummary.captureDepthMissing, true);
assert.equal(shallowGenerationPromptSummary.expectedCaptureCount, 3);

const wrongScriptGenerationPromptRoot = makeArtifactRoot();
writePassingLaneArtifacts(wrongScriptGenerationPromptRoot, { turnLimit: 3, promptCaptureCount: 3 });
mutatePreGenerationScriptId(wrongScriptGenerationPromptRoot, 'pre-generation-soak-turn-02-0003.json', 'soak-turn-99');
const wrongScriptGenerationPromptSummary = summarizeExternalContextGenerationArtifacts({
  artifactRoot: wrongScriptGenerationPromptRoot,
  turnLimit: '3'
});
assert.equal(wrongScriptGenerationPromptSummary.status, 'fail');
assert.deepEqual(wrongScriptGenerationPromptSummary.expectedScriptMessageIds, ['soak-turn-01', 'soak-turn-02', 'soak-turn-03']);
assert.deepEqual(wrongScriptGenerationPromptSummary.missingScriptMessageIds, ['soak-turn-02']);
assert.deepEqual(wrongScriptGenerationPromptSummary.unexpectedScriptMessageIds, ['soak-turn-99']);
assert.match(wrongScriptGenerationPromptSummary.summary, /missing expected script id/);
const wrongScriptLaneSummary = summarizeContinuityMatrixLane({
  lane: lanes[0],
  child: {
    exitCode: 0,
    signal: null,
    stdout: JSON.stringify({ status: 'pass', artifactRoot: wrongScriptGenerationPromptRoot }),
    stderr: '',
    json: { status: 'pass', artifactRoot: wrongScriptGenerationPromptRoot }
  },
  artifactRoot: wrongScriptGenerationPromptRoot,
  turnLimit: '3'
});
const wrongScriptAggregate = buildReport({
  runId: 'aggregate-wrong-script-external-context',
  mode: 'live',
  options: {
    live: true,
    turnLimit: '3',
    skipReadiness: false,
    resume: false,
    laneFilter: []
  },
  paths: { root: wrongScriptGenerationPromptRoot },
  lanes: [lanes[0]],
  readiness: {
    status: 'pass',
    externalContextProbe: {
      status: 'pass',
      fixtureDepth: richExternalProbeSummary.fixtureDepth
    }
  },
  laneSummaries: [wrongScriptLaneSummary]
});
const wrongScriptAggregateCheck = wrongScriptAggregate.checks.find((entry) => entry.id === 'external-context-generation-proof');
assert.equal(wrongScriptAggregateCheck.status, 'fail');
assert.deepEqual(wrongScriptAggregateCheck.details.lanes[0].missingScriptMessageIds, ['soak-turn-02']);
assert.deepEqual(wrongScriptAggregateCheck.details.lanes[0].unexpectedScriptMessageIds, ['soak-turn-99']);

const duplicateScriptGenerationPromptRoot = makeArtifactRoot();
writePassingLaneArtifacts(duplicateScriptGenerationPromptRoot, { turnLimit: 3, promptCaptureCount: 3 });
mutatePreGenerationScriptId(duplicateScriptGenerationPromptRoot, 'pre-generation-soak-turn-03-0004.json', 'soak-turn-02');
const duplicateScriptGenerationPromptSummary = summarizeExternalContextGenerationArtifacts({
  artifactRoot: duplicateScriptGenerationPromptRoot,
  turnLimit: '3'
});
assert.equal(duplicateScriptGenerationPromptSummary.status, 'fail');
assert.deepEqual(duplicateScriptGenerationPromptSummary.missingScriptMessageIds, ['soak-turn-03']);
assert.deepEqual(duplicateScriptGenerationPromptSummary.duplicateScriptMessageIds, ['soak-turn-02']);

const missingScriptGenerationPromptRoot = makeArtifactRoot();
writePassingLaneArtifacts(missingScriptGenerationPromptRoot, { turnLimit: 3, promptCaptureCount: 3 });
mutatePreGenerationScriptId(missingScriptGenerationPromptRoot, 'pre-generation-soak-turn-03-0004.json', null);
const missingScriptGenerationPromptSummary = summarizeExternalContextGenerationArtifacts({
  artifactRoot: missingScriptGenerationPromptRoot,
  turnLimit: '3'
});
assert.equal(missingScriptGenerationPromptSummary.status, 'fail');
assert.deepEqual(missingScriptGenerationPromptSummary.missingScriptMessageIds, ['soak-turn-03']);
assert.equal(missingScriptGenerationPromptSummary.missingScriptMessageIdCount, 1);

const badGenerationPromptRoot = makeArtifactRoot();
writePassingLaneArtifacts(badGenerationPromptRoot);
const badGenerationPrompt = readJson(path.join(badGenerationPromptRoot, 'prompt-inspection', 'pre-generation-soak-turn-01-0002.json'));
delete badGenerationPrompt.promptInspection.externalPromptEnvironmentRef;
badGenerationPrompt.promptInspection.knownExternalPromptKeys = [];
writeJson(path.join(badGenerationPromptRoot, 'prompt-inspection', 'pre-generation-soak-turn-01-0002.json'), badGenerationPrompt);
const badGenerationPromptSummary = summarizeExternalContextGenerationArtifacts({ artifactRoot: badGenerationPromptRoot });
assert.equal(badGenerationPromptSummary.status, 'fail');
assert.equal(badGenerationPromptSummary.failedCaptureCount, 1);
assert.equal(badGenerationPromptSummary.unavailableSignals.includes('external-prompt-environment-ref-missing'), true);

const genericExternalPromptRoot = makeArtifactRoot();
writePassingLaneArtifacts(genericExternalPromptRoot);
const genericPromptPath = path.join(genericExternalPromptRoot, 'prompt-inspection', 'pre-generation-soak-turn-01-0002.json');
const genericPrompt = readJson(genericPromptPath);
genericPrompt.promptInspection.knownExternalPromptKeys = ['1_memory'];
genericPrompt.promptInspection.externalPromptEnvironmentRef.knownExternalPromptKeys = ['1_memory'];
genericPrompt.promptInspection.externalPromptEnvironmentTargets = {
  stLorebooks: { active: false, enabled: false },
  memoryBooks: { active: false, enabled: false, entryCount: 0 },
  summaryception: { enabled: false, promptKeyActive: false },
  vectFox: { enabled: false, generationInterceptorActive: false, promptKeys: [] }
};
writeJson(genericPromptPath, genericPrompt);
const genericExternalGeneration = summarizeExternalContextGenerationArtifacts({ artifactRoot: genericExternalPromptRoot });
assert.equal(genericExternalGeneration.status, 'pass', 'Generic external key still proves only basic generation-time observability.');
assert.equal(genericExternalGeneration.richFixturePressure.status, 'fail');
assert.deepEqual(genericExternalGeneration.richFixturePressure.missingTargets, ['stLorebooks', 'memoryBooks', 'summaryception', 'vectFox']);
assert.equal(genericExternalGeneration.richFixturePressure.targetDiagnostics.memoryBooks.rangeStatus, null);
assert.equal(genericExternalGeneration.richFixturePressure.targetDiagnostics.summaryception.stalenessStatus, null);
assert.equal(genericExternalGeneration.richFixturePressure.targetDiagnostics.vectFox.backendStatus, null);

const stLorebooksMemoryPromptRoot = makeArtifactRoot();
writePassingLaneArtifacts(stLorebooksMemoryPromptRoot);
const stLorebooksMemoryPromptPath = path.join(stLorebooksMemoryPromptRoot, 'prompt-inspection', 'pre-generation-soak-turn-01-0002.json');
const stLorebooksMemoryPrompt = readJson(stLorebooksMemoryPromptPath);
stLorebooksMemoryPrompt.promptInspection.knownExternalPromptKeys = ['1_memory', 'summaryception', '3_vectfox'];
stLorebooksMemoryPrompt.promptInspection.externalPromptEnvironmentRef.knownExternalPromptKeys = ['1_memory', 'summaryception', '3_vectfox'];
stLorebooksMemoryPrompt.promptInspection.externalPromptEnvironmentTargets.stLorebooks = {
  active: true,
  enabled: true,
  chatBound: true
};
writeJson(stLorebooksMemoryPromptPath, stLorebooksMemoryPrompt);
const stLorebooksMemoryGeneration = summarizeExternalContextGenerationArtifacts({ artifactRoot: stLorebooksMemoryPromptRoot });
assert.equal(stLorebooksMemoryGeneration.richFixturePressure.targetCoverage.stLorebooks, true);
assert.equal(stLorebooksMemoryGeneration.richFixturePressure.status, 'pass');

const genericLaneSummary = summarizeContinuityMatrixLane({
  lane: lanes[0],
  child: {
    exitCode: 0,
    signal: null,
    stdout: JSON.stringify({ status: 'pass', artifactRoot: genericExternalPromptRoot }),
    stderr: '',
    json: { status: 'pass', artifactRoot: genericExternalPromptRoot }
  },
  artifactRoot: genericExternalPromptRoot
});
assert.equal(genericLaneSummary.externalContextGenerationProof.status, 'pass');
assert.equal(genericLaneSummary.externalContextGenerationProof.richFixturePressure.status, 'fail');
const aggregateGenericReport = buildReport({
  runId: 'aggregate-rich-fail',
  mode: 'live',
  options: {
    live: true,
    turnLimit: '1',
    skipReadiness: false,
    resume: false,
    laneFilter: []
  },
  paths: { root: genericExternalPromptRoot },
  lanes: [lanes[0]],
  readiness: {
    status: 'pass',
    externalContextProbe: {
      status: 'pass',
      fixtureDepth: richExternalProbeSummary.fixtureDepth
    }
  },
  laneSummaries: [genericLaneSummary]
});
const aggregateGenericCheck = aggregateGenericReport.checks.find((entry) => entry.id === 'external-context-generation-proof');
assert.equal(aggregateGenericCheck.status, 'fail');
assert.match(aggregateGenericCheck.summary, /rich fixture lane/);

const missingRoot = makeArtifactRoot();
writePassingLaneArtifacts(missingRoot);
writeJson(path.join(missingRoot, 'prompt-inspection', 'run-end.json'), {
  promptInspection: {
    status: 'active',
    blocks: [
      { id: 'continuity-contract', promptKey: 'directive.contract', sourceIds: [] }
    ]
  }
});
const missingPromptSummary = summarizePromptInspectionArtifact({ artifactRoot: missingRoot });
assert.equal(missingPromptSummary.status, 'fail');
assert.equal(missingPromptSummary.missingSourceIds.includes('crew.hadrik-bronn.species'), true);

const missingExternalRoot = makeArtifactRoot();
writePassingLaneArtifacts(missingExternalRoot);
const missingExternalPrompt = readJson(path.join(missingExternalRoot, 'prompt-inspection', 'run-end.json'));
delete missingExternalPrompt.promptInspection.externalPromptEnvironmentRef;
missingExternalPrompt.promptInspection.finalHostPromptMayIncludeExternal = null;
writeJson(path.join(missingExternalRoot, 'prompt-inspection', 'run-end.json'), missingExternalPrompt);
const missingExternalSummary = summarizeExternalContextPromptArtifact({ artifactRoot: missingExternalRoot });
assert.equal(missingExternalSummary.status, 'fail');
assert.equal(missingExternalSummary.unavailableSignals.includes('external-prompt-environment-ref-missing'), true);
assert.equal(summarizeReusableContinuityMatrixLane({
  lane: lanes[0],
  artifactRoot: missingExternalRoot,
  turnLimit: null
}), null);

const badFactRoot = makeArtifactRoot();
writePassingLaneArtifacts(badFactRoot);
writeJson(path.join(badFactRoot, 'fact-checks', 'soak-turn-01', 'fact-check.json'), {
  status: 'fail',
  counts: {
    respected: 0,
    omitted: 0,
    unsupportedDetail: 0,
    contradicted: 1
  },
  results: [{ verdict: 'contradicted' }]
});
const badFactSummary = summarizeFactualGroundingArtifacts({ artifactRoot: badFactRoot });
assert.equal(badFactSummary.status, 'fail');
assert.equal(badFactSummary.badCount, 1);

const warningFactRoot = makeArtifactRoot();
writePassingLaneArtifacts(warningFactRoot);
writeJson(path.join(warningFactRoot, 'fact-checks', 'soak-turn-01', 'fact-check.json'), {
  status: 'warning',
  counts: {
    respected: 1,
    omitted: 1,
    unsupportedDetail: 0,
    contradicted: 0
  },
  results: [{ verdict: 'omitted', severity: 'P2 factual warning' }]
});
const warningFactSummary = summarizeFactualGroundingArtifacts({ artifactRoot: warningFactRoot });
assert.equal(warningFactSummary.status, 'warning');
assert.equal(warningFactSummary.badCount, 1);

const missingFactualModelReviewRoot = makeArtifactRoot();
writePassingLaneArtifacts(missingFactualModelReviewRoot);
fs.rmSync(path.join(missingFactualModelReviewRoot, 'fact-checks', 'model-assisted-review', 'result.json'), { force: true });
const missingFactualModelReviewSummary = summarizeFactualGroundingArtifacts({ artifactRoot: missingFactualModelReviewRoot });
assert.equal(missingFactualModelReviewSummary.status, 'warning');
assert.equal(missingFactualModelReviewSummary.modelAssistedReview.missing, true);
assert.equal(missingFactualModelReviewSummary.modelAssistedReview.validationIssues.includes('missing-result'), true);
const missingFactualModelReviewLane = summarizeContinuityMatrixLane({
  lane: lanes[0],
  child: {
    exitCode: 0,
    signal: null,
    stdout: JSON.stringify({ status: 'pass', artifactRoot: missingFactualModelReviewRoot }),
    stderr: '',
    json: { status: 'pass', artifactRoot: missingFactualModelReviewRoot }
  },
  artifactRoot: missingFactualModelReviewRoot
});
const missingFactualModelReviewAggregate = buildReport({
  runId: 'aggregate-missing-factual-model-review',
  mode: 'live',
  options: {
    live: true,
    turnLimit: '',
    skipReadiness: false,
    resume: false,
    laneFilter: []
  },
  paths: { root: missingFactualModelReviewRoot },
  lanes: [lanes[0]],
  readiness: {
    status: 'pass',
    externalContextProbe: {
      status: 'pass',
      fixtureDepth: richExternalProbeSummary.fixtureDepth
    }
  },
  laneSummaries: [missingFactualModelReviewLane]
});
const missingFactualModelReviewCheck = missingFactualModelReviewAggregate.checks.find((entry) => entry.id === 'factual-grounding');
assert.equal(missingFactualModelReviewCheck.status, 'fail');
assert.equal(missingFactualModelReviewCheck.details.lanes[0].modelAssistedReview.missing, true);

const notRunFactualModelReviewRoot = makeArtifactRoot();
writePassingLaneArtifacts(notRunFactualModelReviewRoot);
writeFactualModelReviewArtifacts(notRunFactualModelReviewRoot, {
  status: 'not-run',
  reason: 'model-assisted factual review request was prepared; provider was not invoked'
});
const notRunFactualModelReviewSummary = summarizeFactualGroundingArtifacts({ artifactRoot: notRunFactualModelReviewRoot });
assert.equal(notRunFactualModelReviewSummary.status, 'warning');
assert.equal(notRunFactualModelReviewSummary.modelAssistedReview.missing, true);

const staleFactualModelReviewRoot = makeArtifactRoot();
writePassingLaneArtifacts(staleFactualModelReviewRoot);
writeFactualModelReviewArtifacts(staleFactualModelReviewRoot, { inputHash: 'stale-input-hash' });
const staleFactualResultPath = path.join(staleFactualModelReviewRoot, 'fact-checks', 'model-assisted-review', 'result.json');
const staleFactualResult = readJson(staleFactualResultPath);
staleFactualResult.inputHash = 'different-input-hash';
writeJson(staleFactualResultPath, staleFactualResult);
const staleFactualModelReviewSummary = summarizeFactualGroundingArtifacts({ artifactRoot: staleFactualModelReviewRoot });
assert.equal(staleFactualModelReviewSummary.status, 'fail');
assert.equal(staleFactualModelReviewSummary.modelAssistedReview.validationIssues.includes('input-hash-mismatch'), true);

const wrongRoleFactualModelReviewRoot = makeArtifactRoot();
writePassingLaneArtifacts(wrongRoleFactualModelReviewRoot);
writeFactualModelReviewArtifacts(wrongRoleFactualModelReviewRoot, { roleId: 'storyQualityReviewer' });
const wrongRoleFactualModelReviewSummary = summarizeFactualGroundingArtifacts({ artifactRoot: wrongRoleFactualModelReviewRoot });
assert.equal(wrongRoleFactualModelReviewSummary.status, 'fail');
assert.equal(wrongRoleFactualModelReviewSummary.modelAssistedReview.wrongRole, true);

const timeoutFactualModelReviewRoot = makeArtifactRoot();
writePassingLaneArtifacts(timeoutFactualModelReviewRoot);
writeFactualModelReviewArtifacts(timeoutFactualModelReviewRoot, {
  status: 'fail',
  reason: 'factualGroundingReviewer timed out',
  modelCallStatus: 'failed',
  modelCallOk: false,
  errorCode: 'DIRECTIVE_GENERATION_TIMEOUT'
});
const timeoutFactualModelReviewSummary = summarizeFactualGroundingArtifacts({ artifactRoot: timeoutFactualModelReviewRoot });
assert.equal(timeoutFactualModelReviewSummary.status, 'fail');
assert.equal(timeoutFactualModelReviewSummary.modelAssistedReview.timedOut, true);

const unparseableFactualModelReviewRoot = makeArtifactRoot();
writePassingLaneArtifacts(unparseableFactualModelReviewRoot);
writeFactualModelReviewArtifacts(unparseableFactualModelReviewRoot, {
  status: 'fail',
  reason: 'Model-assisted factual reviewer did not return parseable JSON'
});
const unparseableFactualModelReviewSummary = summarizeFactualGroundingArtifacts({ artifactRoot: unparseableFactualModelReviewRoot });
assert.equal(unparseableFactualModelReviewSummary.status, 'fail');
assert.equal(unparseableFactualModelReviewSummary.modelAssistedReview.unparseable, true);

const stalePassUnparseableProviderFactualRoot = makeArtifactRoot();
writePassingLaneArtifacts(stalePassUnparseableProviderFactualRoot);
writeFactualModelReviewArtifacts(stalePassUnparseableProviderFactualRoot);
writeText(
  path.join(stalePassUnparseableProviderFactualRoot, 'smoke-factual-review', 'provider-result.json'),
  JSON.stringify({ result: { ok: true, text: 'not strict json' } })
);
const stalePassUnparseableProviderReportPath = path.join(stalePassUnparseableProviderFactualRoot, 'report.json');
const stalePassUnparseableProviderReport = readJson(stalePassUnparseableProviderReportPath);
stalePassUnparseableProviderReport.checks.find((entry) => entry.id === 'live-factual-grounding-transcript-audit')
  .details.modelAssistedReview.providerOutputPath = 'smoke-factual-review/provider-result.json';
writeJson(stalePassUnparseableProviderReportPath, stalePassUnparseableProviderReport);
const stalePassUnparseableProviderFactualSummary = summarizeFactualGroundingArtifacts({
  artifactRoot: stalePassUnparseableProviderFactualRoot
});
assert.equal(stalePassUnparseableProviderFactualSummary.status, 'fail');
assert.equal(stalePassUnparseableProviderFactualSummary.modelAssistedReview.unparseable, true);
assert.equal(
  stalePassUnparseableProviderFactualSummary.modelAssistedReview.validationIssues.includes('unparseable-provider-output'),
  true
);

const badFindingFactualModelReviewRoot = makeArtifactRoot();
writePassingLaneArtifacts(badFindingFactualModelReviewRoot);
writeFactualModelReviewArtifacts(badFindingFactualModelReviewRoot, {
  counts: {
    respected: 0,
    omitted: 0,
    unsupportedDetail: 0,
    contradicted: 1,
    notApplicable: 0,
    p1: 1,
    p2: 0,
    p3: 0
  }
});
const badFindingFactualModelReviewSummary = summarizeFactualGroundingArtifacts({ artifactRoot: badFindingFactualModelReviewRoot });
assert.equal(badFindingFactualModelReviewSummary.status, 'fail');
assert.equal(badFindingFactualModelReviewSummary.modelAssistedReview.validationIssues.includes('model-review-bad-findings'), true);

const coordinatorSource = fs.readFileSync('tools/scripts/run-continuity-matrix-five-user-soak.mjs', 'utf8');
assert.match(coordinatorSource, /external-context-readiness-proof/);
assert.match(coordinatorSource, /external-context-fixture-depth/);
assert.match(coordinatorSource, /external-context-generation-proof/);
assert.match(coordinatorSource, /generation-start-timing-core-proof/);
assert.match(coordinatorSource, /story-quality-model-review/);
assert.match(coordinatorSource, /summarizeStoryQualityReviewArtifacts/);
assert.match(coordinatorSource, /summarizeGenerationTimingCoreProof/);
assert.match(coordinatorSource, /External Context Readiness/);
assert.match(coordinatorSource, /FixtureDepth/);
assert.match(coordinatorSource, /hostExtensions: path\.join\(root, 'host-extensions'\)/);
assert.match(coordinatorSource, /hostExtensions: paths\.hostExtensions/);
assert.match(coordinatorSource, /artifacts:\s*\{/);
assert.match(coordinatorSource, /External context probe:/);

fs.rmSync(readinessRoot, { recursive: true, force: true });
fs.rmSync(root, { recursive: true, force: true });
fs.rmSync(notRunStoryQualityRoot, { recursive: true, force: true });
fs.rmSync(unboundedNotRunStoryQualityRoot, { recursive: true, force: true });
fs.rmSync(flatStoryQualityRoot, { recursive: true, force: true });
fs.rmSync(unparseableStoryQualityRoot, { recursive: true, force: true });
fs.rmSync(timeoutStoryQualityRoot, { recursive: true, force: true });
fs.rmSync(missingTimingRoot, { recursive: true, force: true });
fs.rmSync(runtimeTimingRoot, { recursive: true, force: true });
fs.rmSync(skippedTimingRoot, { recursive: true, force: true });
fs.rmSync(staleLegacyWarningRoot, { recursive: true, force: true });
fs.rmSync(fullRoot, { recursive: true, force: true });
fs.rmSync(missingExternalSummaryRoot, { recursive: true, force: true });
fs.rmSync(missingExternalSummaryFileRoot, { recursive: true, force: true });
fs.rmSync(malformedExternalSummaryRoot, { recursive: true, force: true });
fs.rmSync(boundedRoot, { recursive: true, force: true });
fs.rmSync(partialFactDepthRoot, { recursive: true, force: true });
fs.rmSync(missingGenerationPromptRoot, { recursive: true, force: true });
fs.rmSync(shallowGenerationPromptRoot, { recursive: true, force: true });
fs.rmSync(badGenerationPromptRoot, { recursive: true, force: true });
fs.rmSync(genericExternalPromptRoot, { recursive: true, force: true });
fs.rmSync(missingRoot, { recursive: true, force: true });
fs.rmSync(missingExternalRoot, { recursive: true, force: true });
fs.rmSync(badFactRoot, { recursive: true, force: true });
fs.rmSync(warningFactRoot, { recursive: true, force: true });
fs.rmSync(missingFactualModelReviewRoot, { recursive: true, force: true });
fs.rmSync(notRunFactualModelReviewRoot, { recursive: true, force: true });
fs.rmSync(staleFactualModelReviewRoot, { recursive: true, force: true });
fs.rmSync(wrongRoleFactualModelReviewRoot, { recursive: true, force: true });
fs.rmSync(timeoutFactualModelReviewRoot, { recursive: true, force: true });
fs.rmSync(unparseableFactualModelReviewRoot, { recursive: true, force: true });
fs.rmSync(stalePassUnparseableProviderFactualRoot, { recursive: true, force: true });
fs.rmSync(badFindingFactualModelReviewRoot, { recursive: true, force: true });

console.log('test-continuity-matrix-five-user-soak-coordinator: ok');
