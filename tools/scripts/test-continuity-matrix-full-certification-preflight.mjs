import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  SOAK_PARALLEL_WORKER_POLICY,
  SOAK_TURN_SCRIPT
} from './soak-sillytavern-campaign-live.mjs';
import {
  buildFullCertificationPreflight,
  classifyAggregateWarnings,
  expectedFullCertificationBudget
} from './preflight-continuity-matrix-full-certification.mjs';
import {
  summarizeModelCallFailurePolicy
} from './lib/model-call-failure-policy.mjs';

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
      captureCount: SOAK_TURN_SCRIPT.length,
      refHashes: ['a'.repeat(64)],
      knownExternalPromptKeys: ['worldInfoBefore', 'summaryception', '3_vectfox'],
      finalHostPromptMayIncludeExternal: true,
      redactionReasons: ['secret'],
      targetSummaryCount: SOAK_TURN_SCRIPT.length
    },
    targetSummaries: SOAK_TURN_SCRIPT.map((turn, index) => ({
      scriptMessageId: `soak-turn-${String(index + 1).padStart(2, '0')}`,
      scriptCategory: turn.category || 'directiveCommit',
      targets: {
        stLorebooks: { active: true, chatBound: true },
        memoryBooks: { enabled: true, rangeDiagnostics: { status: 'valid' } },
        summaryception: { enabled: true, staleness: { status: 'observed' } },
        vectFox: { enabled: true, backendDiagnostics: { status: 'external-backend-configured' } }
      }
    }))
  });
}

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'directive-cpm-full-cert-preflight-'));
}

function externalPromptSnapshot(turn) {
  return {
    kind: 'directive.sillytavern.promptInspectionSnapshot',
    schemaVersion: 1,
    reason: 'pre-generation',
    scriptMessageId: `soak-turn-${String(turn).padStart(2, '0')}`,
    chatLength: turn + 1,
    promptInspection: {
      externalPromptEnvironmentRef: {
        kind: 'directive.externalPromptEnvironmentRef.v1',
        schemaVersion: 1,
        status: 'observed',
        hash: `${String(turn % 10).repeat(64)}`,
        byteLength: 512,
        knownExternalPromptKeys: ['worldInfoBefore', 'summaryception', '3_vectfox']
      },
      finalHostPromptMayIncludeExternal: true,
      externalPromptEnvironmentTargets: {
        stLorebooks: { active: true, enabled: true, chatBound: true },
        memoryBooks: {
          active: true,
          enabled: true,
          entryCount: 2,
          rangeDiagnostics: {
            status: 'valid',
            entryRangeCount: 2,
            chatRangeCount: 1,
            validRangeCount: 3,
            invertedRangeCount: 0,
            outOfBoundsRangeCount: 0,
            staleRangeCount: 0,
            rangeHash: 'memory-range-hash'
          }
        },
        summaryception: {
          enabled: true,
          promptKeyActive: true,
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
          backendDiagnostics: {
            status: 'local-backend-configured',
            backendType: 'qdrant',
            unavailable: false,
            externalTimingObserved: true,
            timingHash: 'vectfox-timing-hash'
          }
        }
      },
      redactions: [{ reason: 'secret' }]
    }
  };
}

function timingCheck() {
  return {
    id: 'live-generation-start-timing',
    status: 'pass',
    summary: 'Delegated smoke proved generation-start timing for 52 turns.',
    details: {
      proof: {
        status: 'pass',
        source: 'coreStoreTurnTiming',
        timingSource: 'coreProjection',
        checkedTurnCount: SOAK_TURN_SCRIPT.length,
        skippedTurnCount: 0,
        maxGenerationStartLatencyMs: 24000
      }
    }
  };
}

function hostNativeCompletionCheck() {
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
    status: 'pass',
    summary: 'Delegated smoke proved terminal host-native completion.',
    details: {
      proof: {
        status: 'pass',
        source: 'coreStoreResponseLedger',
        completionSource: 'coreProjection',
        completedHostContinueCount: 1,
        failedHostContinueCount: 0,
        requiredCompletionCount: 1,
        requiredCompletionPassCount: 1,
        requiredCompletionFailureCount: 0,
        maxCompletionLatencyMs: 14000,
        requiredCompletions: [requiredCompletion],
        requiredHostNativeCompletions: [requiredCompletion]
      }
    }
  };
}

function storyQualityCheck() {
  return {
    id: 'live-story-quality-transcript-review',
    status: 'pass',
    summary: 'Story-quality review passed.',
    details: {
      storyQualityReview: {
        status: 'pass',
        scoreCount: 1,
        scoreZeroCount: 0,
        averageScore: 2,
        modelAssistedReview: {
          status: 'pass',
          requestPath: 'quality-review/model-assisted-review/request.json',
          resultPath: 'quality-review/model-assisted-review/result.json',
          inputHash: 'story-quality-input-hash',
          counts: { scores: 1, scoreZero: 0, warningOrWeak: 0 },
          modelCall: {
            roleId: 'storyQualityReviewer',
            providerKind: 'utility',
            status: 'ok',
            ok: true,
            latencyMs: 1200
          }
        }
      }
    }
  };
}

function writeLaneArtifacts(root, {
  turnLimit = null,
  promptCount = SOAK_TURN_SCRIPT.length,
  factTurnCount = SOAK_TURN_SCRIPT.length,
  failedModelCallCount = 0,
  modelCalls = null,
  includeModelCallPolicyEvidence = true,
  reportStatusOverride = null,
  liveSmokeDelegationStatus = 'pass'
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
  writeText(path.join(root, 'summary.md'), '# Lane\n');
  writeText(path.join(root, 'live-log.jsonl'), `${JSON.stringify({ kind: 'run-end', status: 'pass' })}\n`);
  writeText(path.join(root, 'transcript', 'readable-chat.md'), '# Transcript\n');
  writeExternalContextSummary(root);
  writeJson(path.join(root, 'fact-checks', 'canary-index.json'), { kind: 'directive.liveCampaignSoak.factualCanaryIndex' });
  writeJson(path.join(root, 'report.json'), {
    status: reportStatusOverride || (modelCallFailurePolicy.status === 'fail' ? 'fail' : turnLimit ? 'warning' : 'pass'),
    runId: 'lane-run',
    mode: 'live',
    modelCallPolicy: {
      budget: 'unlimited',
      liveProvidersRequired: true,
      fallbackWarningRequired: true,
      failurePolicyEvidence: includeModelCallPolicyEvidence ? modelCallFailurePolicy : null
    },
    checks: [
      timingCheck(),
      hostNativeCompletionCheck(),
      storyQualityCheck(),
      {
        id: 'live-smoke-52-turn-delegation',
        status: liveSmokeDelegationStatus,
        summary: liveSmokeDelegationStatus === 'pass'
          ? 'Delegated lane completed the full live smoke script.'
          : 'Delegated lane did not complete the full live smoke script.',
        details: {
          expectedTurnCount: SOAK_TURN_SCRIPT.length,
          completedTurnCount: liveSmokeDelegationStatus === 'pass' ? SOAK_TURN_SCRIPT.length : SOAK_TURN_SCRIPT.length - 1
        }
      },
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
      {
        id: 'live-execution-turn-limit',
        status: turnLimit ? 'warning' : 'pass',
        summary: turnLimit ? `Live execution is intentionally limited to ${turnLimit} turn(s).` : 'Full run.',
        details: { turnLimit, fullTurnCount: SOAK_TURN_SCRIPT.length }
      }
    ],
    warnings: turnLimit ? [`Live execution is intentionally limited to ${turnLimit} turn(s).`] : [],
    failures: modelCallFailurePolicy.status === 'fail' ? [modelCallFailurePolicy.summary] : []
  });
  writeJson(path.join(root, 'smoke-chat-soak', 'report-summary.json'), smokeSummary);
  if (Array.isArray(modelCalls)) {
    writeJson(path.join(root, 'smoke-chat-soak', 'report.json'), smokeReport);
  }
  writeJson(path.join(root, 'quality-review', 'model-assisted-review', 'request.json'), {
    kind: 'directive.liveCampaignSoak.storyQualityModelReviewRequest',
    schemaVersion: 1,
    requestId: 'story-quality-request',
    inputHash: 'story-quality-input-hash',
    transcript: [{
      index: 0,
      messageId: 'm1',
      role: 'user',
      textHash: 'u'.repeat(64),
      text: 'The commander gives a careful order.'
    }],
    deterministicScores: []
  });
  writeJson(path.join(root, 'quality-review', 'model-assisted-review', 'result.json'), {
    kind: 'directive.liveCampaignSoak.storyQualityModelReviewResult',
    schemaVersion: 1,
    requestId: 'story-quality-request',
    inputHash: 'story-quality-input-hash',
    status: 'pass',
    counts: { scores: 1, scoreZero: 0, warningOrWeak: 0 },
    scores: [{ messageId: 'm1', messageIndex: 0, role: 'user', overallScore: 2 }],
    modelCall: {
      roleId: 'storyQualityReviewer',
      providerKind: 'utility',
      status: 'ok',
      ok: true,
      latencyMs: 1200
    }
  });
  for (let turn = 1; turn <= promptCount; turn += 1) {
    writeJson(path.join(root, 'prompt-inspection', `pre-generation-soak-turn-${String(turn).padStart(2, '0')}.json`), externalPromptSnapshot(turn));
  }
  writeJson(path.join(root, 'prompt-inspection', 'run-end.json'), {
    ...externalPromptSnapshot(99),
    reason: 'run-end',
    scriptMessageId: null
  });
  for (let turn = 1; turn <= factTurnCount; turn += 1) {
    writeJson(path.join(root, 'fact-checks', `soak-turn-${String(turn).padStart(2, '0')}`, 'fact-check.json'), {
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
  writeJson(path.join(root, 'fact-checks', 'transcript-level', 'fact-check.json'), {
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

function aggregateReport(root, lanes, { turnLimit = null, status = 'pass' } = {}) {
  writeJson(path.join(root, 'report.json'), {
    kind: 'directive.continuityProjectionMatrix.fiveUserSoakReport',
    runId: path.basename(root),
    status,
    mode: 'live',
    options: { live: true, turnLimit, skipReadiness: false },
    readiness: {
      externalContextProbe: {
        fixtureDepth: {
          status: 'pass',
          requiredTargets: ['stLorebooks', 'memoryBooks', 'summaryception', 'vectFox'],
          fullFixtureUserHandles: ['directive-soak-a'],
          missingTargets: [],
          targetCoverage: {
            stLorebooks: true,
            memoryBooks: true,
            summaryception: true,
            vectFox: true
          }
        }
      }
    },
    checks: [
      {
        id: 'turn-depth',
        status: turnLimit ? 'warning' : 'pass',
        summary: turnLimit ? `Each lane is limited to ${turnLimit} turn(s); this is bounded proof, not full certification.` : 'Each lane will run the full 52-turn campaign soak.',
        details: { turnLimit }
      },
      {
        id: 'lane-results',
        status,
        summary: status === 'pass' ? 'All selected lanes completed successfully.' : '1 lane(s) completed with warnings.'
      }
    ],
    lanes,
    warnings: turnLimit ? [`Each lane is limited to ${turnLimit} turn(s); this is bounded proof, not full certification.`] : [],
    failures: []
  });
}

const budget = expectedFullCertificationBudget();
assert.equal(budget.fullTurnCount, 52);
assert.equal(budget.factChecksPerLane, 53);
assert.equal(budget.totalFactChecks, 265);

const fullRoot = makeRoot();
const fullLanes = SOAK_PARALLEL_WORKER_POLICY.lanes.map((lane) => {
  const artifactRoot = path.join(fullRoot, 'lanes', lane.id, `${path.basename(fullRoot)}-${lane.id}`);
  writeLaneArtifacts(artifactRoot);
  return { id: lane.id, userHandle: lane.userHandle, status: 'pass', artifactRoot };
});
aggregateReport(fullRoot, fullLanes);
const fullPreflight = buildFullCertificationPreflight({ artifactRoot: fullRoot, strict: true });
assert.equal(fullPreflight.status, 'pass');
assert.equal(fullPreflight.checks.find((entry) => entry.id === 'aggregate-live-execution-pass').status, 'pass');
assert.equal(fullPreflight.checks.find((entry) => entry.id === 'lane-live-execution-pass').status, 'pass');
assert.equal(fullPreflight.checks.find((entry) => entry.id === 'unbounded-artifact-budget').status, 'pass');
assert.equal(fullPreflight.checks.find((entry) => entry.id === 'five-lane-coverage').status, 'pass');
assert.equal(fullPreflight.checks.find((entry) => entry.id === 'external-context-coverage-standard').status, 'pass');
assert.equal(fullPreflight.checks.find((entry) => entry.id === 'model-call-failure-policy').status, 'pass');

const countOnlyHostNativeRoot = makeRoot();
const countOnlyHostNativeLanes = SOAK_PARALLEL_WORKER_POLICY.lanes.map((lane) => {
  const artifactRoot = path.join(countOnlyHostNativeRoot, 'lanes', lane.id, `${path.basename(countOnlyHostNativeRoot)}-${lane.id}`);
  writeLaneArtifacts(artifactRoot);
  const reportPath = path.join(artifactRoot, 'report.json');
  const laneReport = readJson(reportPath);
  const completionCheck = laneReport.checks.find((entry) => entry.id === 'live-host-native-completion-proof');
  delete completionCheck.details.proof.requiredCompletions;
  delete completionCheck.details.proof.requiredHostNativeCompletions;
  delete completionCheck.details.proof.requiredCompletionCount;
  delete completionCheck.details.proof.requiredCompletionPassCount;
  delete completionCheck.details.proof.requiredCompletionFailureCount;
  writeJson(reportPath, laneReport);
  return { id: lane.id, userHandle: lane.userHandle, status: 'pass', artifactRoot };
});
aggregateReport(countOnlyHostNativeRoot, countOnlyHostNativeLanes);
const countOnlyHostNativePreflight = buildFullCertificationPreflight({ artifactRoot: countOnlyHostNativeRoot, strict: true });
assert.equal(countOnlyHostNativePreflight.status, 'fail');
const countOnlyHostNativeCheck = countOnlyHostNativePreflight.checks.find((entry) => entry.id === 'host-native-completion-release-proof');
assert.equal(countOnlyHostNativeCheck.status, 'fail');
assert.equal(countOnlyHostNativeCheck.details.failingLanes.length, SOAK_PARALLEL_WORKER_POLICY.lanes.length);
assert.match(countOnlyHostNativePreflight.lanes[0].hostNativeCompletion.summary, /missing required turn binding/);

const aggregateFailRoot = makeRoot();
const aggregateFailLanes = SOAK_PARALLEL_WORKER_POLICY.lanes.map((lane) => {
  const artifactRoot = path.join(aggregateFailRoot, 'lanes', lane.id, `${path.basename(aggregateFailRoot)}-${lane.id}`);
  writeLaneArtifacts(artifactRoot);
  return { id: lane.id, userHandle: lane.userHandle, status: 'pass', artifactRoot };
});
aggregateReport(aggregateFailRoot, aggregateFailLanes, { status: 'fail' });
const aggregateFailPreflight = buildFullCertificationPreflight({ artifactRoot: aggregateFailRoot, strict: true });
assert.equal(aggregateFailPreflight.status, 'fail');
assert.equal(aggregateFailPreflight.checks.find((entry) => entry.id === 'aggregate-live-execution-pass').status, 'fail');

const laneReportFailRoot = makeRoot();
const laneReportFailLanes = SOAK_PARALLEL_WORKER_POLICY.lanes.map((lane, index) => {
  const artifactRoot = path.join(laneReportFailRoot, 'lanes', lane.id, `${path.basename(laneReportFailRoot)}-${lane.id}`);
  writeLaneArtifacts(artifactRoot, index === 0 ? { reportStatusOverride: 'fail' } : {});
  return { id: lane.id, userHandle: lane.userHandle, status: 'pass', artifactRoot };
});
aggregateReport(laneReportFailRoot, laneReportFailLanes);
const laneReportFailPreflight = buildFullCertificationPreflight({ artifactRoot: laneReportFailRoot, strict: true });
assert.equal(laneReportFailPreflight.status, 'fail');
const laneReportLiveCheck = laneReportFailPreflight.checks.find((entry) => entry.id === 'lane-live-execution-pass');
assert.equal(laneReportLiveCheck.status, 'fail');
assert.equal(laneReportLiveCheck.details.failingLanes[0].reportStatus, 'fail');

const laneDelegationFailRoot = makeRoot();
const laneDelegationFailLanes = SOAK_PARALLEL_WORKER_POLICY.lanes.map((lane, index) => {
  const artifactRoot = path.join(laneDelegationFailRoot, 'lanes', lane.id, `${path.basename(laneDelegationFailRoot)}-${lane.id}`);
  writeLaneArtifacts(artifactRoot, index === 0 ? { liveSmokeDelegationStatus: 'fail' } : {});
  return { id: lane.id, userHandle: lane.userHandle, status: 'pass', artifactRoot };
});
aggregateReport(laneDelegationFailRoot, laneDelegationFailLanes);
const laneDelegationFailPreflight = buildFullCertificationPreflight({ artifactRoot: laneDelegationFailRoot, strict: true });
assert.equal(laneDelegationFailPreflight.status, 'fail');
const laneDelegationLiveCheck = laneDelegationFailPreflight.checks.find((entry) => entry.id === 'lane-live-execution-pass');
assert.equal(laneDelegationLiveCheck.status, 'fail');
assert.equal(laneDelegationLiveCheck.details.failingLanes[0].liveSmokeDelegationStatus, 'fail');

const missingExternalSummaryRoot = makeRoot();
const missingExternalSummaryLanes = SOAK_PARALLEL_WORKER_POLICY.lanes.map((lane, index) => {
  const artifactRoot = path.join(missingExternalSummaryRoot, 'lanes', lane.id, `${path.basename(missingExternalSummaryRoot)}-${lane.id}`);
  writeLaneArtifacts(artifactRoot);
  if (index === 0) {
    fs.rmSync(path.join(artifactRoot, 'host-extensions'), { recursive: true, force: true });
  }
  return { id: lane.id, userHandle: lane.userHandle, status: index === 0 ? 'fail' : 'pass', artifactRoot };
});
aggregateReport(missingExternalSummaryRoot, missingExternalSummaryLanes, { status: 'fail' });
const missingExternalSummaryPreflight = buildFullCertificationPreflight({ artifactRoot: missingExternalSummaryRoot, strict: true });
assert.equal(missingExternalSummaryPreflight.status, 'fail');
const missingExternalSummaryBudget = missingExternalSummaryPreflight.checks.find((entry) => entry.id === 'unbounded-artifact-budget');
assert.equal(missingExternalSummaryBudget.status, 'fail');
assert.equal(missingExternalSummaryBudget.details.failingLanes[0].externalContextSummaryPresent, false);
assert.equal(missingExternalSummaryBudget.details.failingLanes[0].missingFiles.includes('host-extensions/external-context-summary.json'), true);

const malformedExternalSummaryRoot = makeRoot();
const malformedExternalSummaryLanes = SOAK_PARALLEL_WORKER_POLICY.lanes.map((lane, index) => {
  const artifactRoot = path.join(malformedExternalSummaryRoot, 'lanes', lane.id, `${path.basename(malformedExternalSummaryRoot)}-${lane.id}`);
  writeLaneArtifacts(artifactRoot);
  if (index === 0) {
    writeJson(path.join(artifactRoot, 'host-extensions', 'external-context-summary.json'), {
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
  }
  return { id: lane.id, userHandle: lane.userHandle, status: index === 0 ? 'fail' : 'pass', artifactRoot };
});
aggregateReport(malformedExternalSummaryRoot, malformedExternalSummaryLanes, { status: 'fail' });
const malformedExternalSummaryPreflight = buildFullCertificationPreflight({ artifactRoot: malformedExternalSummaryRoot, strict: true });
assert.equal(malformedExternalSummaryPreflight.status, 'fail');
const malformedExternalSummaryBudget = malformedExternalSummaryPreflight.checks.find((entry) => entry.id === 'unbounded-artifact-budget');
assert.equal(malformedExternalSummaryBudget.status, 'fail');
assert.equal(malformedExternalSummaryBudget.details.failingLanes[0].externalContextSummary.status, 'fail');
assert.equal(malformedExternalSummaryBudget.details.failingLanes[0].externalContextSummary.missingFields.includes('aggregate.captureCount'), true);
assert.equal(malformedExternalSummaryPreflight.lanes[0].artifactCompleteness.externalContextSummary.missingFields.includes('aggregate.targetSummaryCount'), true);

const missingPolicyRoot = makeRoot();
const missingPolicyLanes = SOAK_PARALLEL_WORKER_POLICY.lanes.map((lane) => {
  const artifactRoot = path.join(missingPolicyRoot, 'lanes', lane.id, `${path.basename(missingPolicyRoot)}-${lane.id}`);
  writeLaneArtifacts(artifactRoot, { includeModelCallPolicyEvidence: false });
  return { id: lane.id, userHandle: lane.userHandle, status: 'pass', artifactRoot };
});
aggregateReport(missingPolicyRoot, missingPolicyLanes);
const missingPolicyPreflight = buildFullCertificationPreflight({ artifactRoot: missingPolicyRoot, strict: true });
assert.equal(missingPolicyPreflight.status, 'fail');
assert.equal(missingPolicyPreflight.checks.find((entry) => entry.id === 'model-call-failure-policy').status, 'fail');
assert.equal(missingPolicyPreflight.lanes[0].modelCallPolicy.status, 'fail');
assert.equal(missingPolicyPreflight.lanes[0].modelCallPolicy.releaseBlockingCount, 1);

const handledRoot = makeRoot();
const handledLanes = SOAK_PARALLEL_WORKER_POLICY.lanes.map((lane, index) => {
  const artifactRoot = path.join(handledRoot, 'lanes', lane.id, `${path.basename(handledRoot)}-${lane.id}`);
  writeLaneArtifacts(artifactRoot, index === 0
    ? {
        failedModelCallCount: 2,
        modelCalls: [
          {
            id: 'model-call:1:continuityProjectionPlanner',
            roleId: 'continuityProjectionPlanner',
            providerKind: 'utility',
            status: 'failed',
            latencyMs: 15000,
            errorCode: 'DIRECTIVE_GENERATION_TIMEOUT',
            requestHash: 'request-hash',
            metadata: {
              sourceHash: 'source-hash',
              requestHash: 'request-hash'
            }
          },
          {
            id: 'model-call:2:missionDirectorAdvisor',
            roleId: 'missionDirectorAdvisor',
            providerKind: 'reasoning',
            status: 'failed',
            latencyMs: 60000,
            errorCode: 'DIRECTIVE_GENERATION_TIMEOUT',
            requestHash: 'advisor-request-hash',
            metadata: {
              coreDiagnosticTarget: 'advisoryEnrichment',
              requestHash: 'advisor-request-hash',
              fallbackAdvisoryHash: 'fallback-hash'
            }
          }
        ]
      }
    : {});
  return { id: lane.id, userHandle: lane.userHandle, status: 'pass', artifactRoot };
});
aggregateReport(handledRoot, handledLanes);
const handledPreflight = buildFullCertificationPreflight({ artifactRoot: handledRoot, strict: true });
assert.equal(handledPreflight.status, 'pass');
const handledModelCallCheck = handledPreflight.checks.find((entry) => entry.id === 'model-call-failure-policy');
assert.equal(handledModelCallCheck.status, 'pass');
assert.equal(handledModelCallCheck.details.handledLanes[0].fallbackHandledCalls.length, 2);
assert.equal(handledPreflight.lanes[0].modelCallPolicy.fallbackHandledCount, 2);

const blockingRoot = makeRoot();
const blockingLanes = SOAK_PARALLEL_WORKER_POLICY.lanes.map((lane, index) => {
  const artifactRoot = path.join(blockingRoot, 'lanes', lane.id, `${path.basename(blockingRoot)}-${lane.id}`);
  writeLaneArtifacts(artifactRoot, index === 0
    ? {
        failedModelCallCount: 1,
        modelCalls: [{
          id: 'model-call:9:narration',
          roleId: 'narration',
          providerKind: 'reasoning',
          status: 'failed',
          latencyMs: 90000,
          errorCode: 'DIRECTIVE_GENERATION_TIMEOUT',
          requestHash: 'narration-request-hash'
        }]
      }
    : {});
  return { id: lane.id, userHandle: lane.userHandle, status: 'pass', artifactRoot };
});
aggregateReport(blockingRoot, blockingLanes);
const blockingPreflight = buildFullCertificationPreflight({ artifactRoot: blockingRoot, strict: true });
assert.equal(blockingPreflight.status, 'fail');
const blockingModelCallCheck = blockingPreflight.checks.find((entry) => entry.id === 'model-call-failure-policy');
assert.equal(blockingModelCallCheck.status, 'fail');
assert.equal(blockingModelCallCheck.details.failingLanes[0].releaseBlockingCalls[0].roleId, 'narration');

const authorityBlockRoot = makeRoot();
const authorityBlockLanes = SOAK_PARALLEL_WORKER_POLICY.lanes.map((lane, index) => {
  const artifactRoot = path.join(authorityBlockRoot, 'lanes', lane.id, `${path.basename(authorityBlockRoot)}-${lane.id}`);
  writeLaneArtifacts(artifactRoot, index === 0
    ? {
        failedModelCallCount: 2,
        modelCalls: [
          {
            id: 'model-call:4:commandBearingSpendValidator',
            roleId: 'commandBearingSpendValidator',
            providerKind: 'utility',
            status: 'failed',
            latencyMs: 15000,
            errorCode: 'DIRECTIVE_GENERATION_TIMEOUT',
            requestHash: 'spend-request-hash'
          },
          {
            id: 'model-call:5:unknownReleaseRole',
            roleId: 'unknownReleaseRole',
            providerKind: 'utility',
            status: 'failed',
            latencyMs: 15000,
            errorCode: 'DIRECTIVE_GENERATION_TIMEOUT',
            requestHash: 'unknown-request-hash'
          }
        ]
      }
    : {});
  return { id: lane.id, userHandle: lane.userHandle, status: 'pass', artifactRoot };
});
aggregateReport(authorityBlockRoot, authorityBlockLanes);
const authorityBlockPreflight = buildFullCertificationPreflight({ artifactRoot: authorityBlockRoot, strict: true });
assert.equal(authorityBlockPreflight.status, 'fail');
const authorityBlockCalls = authorityBlockPreflight
  .checks
  .find((entry) => entry.id === 'model-call-failure-policy')
  .details
  .failingLanes[0]
  .releaseBlockingCalls;
assert.equal(authorityBlockCalls.some((call) => call.roleId === 'commandBearingSpendValidator' && call.classification === 'release-blocking-authoritative-failure'), true);
assert.equal(authorityBlockCalls.some((call) => call.roleId === 'unknownReleaseRole' && call.classification === 'release-blocking-unknown-role'), true);

const boundedRoot = makeRoot();
const boundedLane = SOAK_PARALLEL_WORKER_POLICY.lanes[0];
const boundedLaneRoot = path.join(boundedRoot, 'lanes', boundedLane.id, `${path.basename(boundedRoot)}-${boundedLane.id}`);
writeLaneArtifacts(boundedLaneRoot, { turnLimit: 3, promptCount: 3, factTurnCount: 3, failedModelCallCount: 2 });
const boundedLanes = [{ id: boundedLane.id, userHandle: boundedLane.userHandle, status: 'warning', artifactRoot: boundedLaneRoot }];
aggregateReport(boundedRoot, boundedLanes, { turnLimit: 3, status: 'warning' });
const boundedReport = JSON.parse(fs.readFileSync(path.join(boundedRoot, 'report.json'), 'utf8'));
boundedReport.checks.unshift({
  id: 'five-user-lane-policy',
  status: 'warning',
  summary: '1 Continuity Matrix soak lane(s) are selected.'
});
writeJson(path.join(boundedRoot, 'report.json'), boundedReport);
const boundedPreflight = buildFullCertificationPreflight({ artifactRoot: boundedRoot, strict: true });
assert.equal(boundedPreflight.status, 'fail');
assert.equal(boundedPreflight.checks.find((entry) => entry.id === 'five-lane-coverage').status, 'fail');
assert.equal(boundedPreflight.checks.find((entry) => entry.id === 'full-depth-run').status, 'fail');
assert.equal(boundedPreflight.checks.find((entry) => entry.id === 'unbounded-artifact-budget').status, 'fail');
assert.equal(boundedPreflight.checks.find((entry) => entry.id === 'model-call-failure-policy').status, 'fail');
const warningClassifications = classifyAggregateWarnings({
  aggregateReport: boundedReport,
  laneSummaries: boundedPreflight.lanes
});
assert.equal(warningClassifications.find((entry) => entry.id === 'turn-depth').depthOnly, true);
assert.equal(warningClassifications.find((entry) => entry.id === 'five-user-lane-policy').strictBlocking, true);

fs.rmSync(fullRoot, { recursive: true, force: true });
fs.rmSync(aggregateFailRoot, { recursive: true, force: true });
fs.rmSync(laneReportFailRoot, { recursive: true, force: true });
fs.rmSync(laneDelegationFailRoot, { recursive: true, force: true });
fs.rmSync(missingExternalSummaryRoot, { recursive: true, force: true });
fs.rmSync(malformedExternalSummaryRoot, { recursive: true, force: true });
fs.rmSync(missingPolicyRoot, { recursive: true, force: true });
fs.rmSync(handledRoot, { recursive: true, force: true });
fs.rmSync(blockingRoot, { recursive: true, force: true });
fs.rmSync(authorityBlockRoot, { recursive: true, force: true });
fs.rmSync(boundedRoot, { recursive: true, force: true });

console.log('Continuity Matrix full-certification preflight tests passed.');
