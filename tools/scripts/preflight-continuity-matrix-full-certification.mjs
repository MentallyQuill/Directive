import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  compact,
  errorSummary,
  writeJsonFile
} from './lib/sillytavern-live-harness.mjs';
import {
  summarizeModelCallFailurePolicy
} from './lib/model-call-failure-policy.mjs';
import {
  SOAK_PARALLEL_WORKER_POLICY,
  SOAK_TURN_SCRIPT
} from './soak-sillytavern-campaign-live.mjs';
import {
  summarizeExternalContextGenerationArtifacts,
  summarizeFactualGroundingArtifacts,
  summarizeGenerationTimingCoreProof,
  summarizeHostNativeCompletionProof,
  summarizeLaneArtifactCompleteness,
  summarizeStoryQualityReviewArtifacts
} from './run-continuity-matrix-five-user-soak.mjs';

const REPORT_KIND = 'directive.continuityProjectionMatrix.fullCertificationPreflight.v1';
const DEFAULT_COVERAGE_STANDARD = 'single-rich-lane';

function usage() {
  return `Usage:
  node tools/scripts/preflight-continuity-matrix-full-certification.mjs --artifact-root <path> [--strict] [--write-artifacts]

Options:
  --artifact-root PATH       Existing five-user coordinator artifact root.
  --strict                   Promote non-depth warnings to failure. Default via DIRECTIVE_CPM_CERT_PREFLIGHT_STRICT=1.
  --write-artifacts          Write full-certification-preflight.json under the artifact root.
  --output PATH              Write the report to a specific path.
  --expected-lanes N         Expected lane count. Default ${SOAK_PARALLEL_WORKER_POLICY.lanes.length}.
  --coverage-standard NAME   single-rich-lane or all-lanes. Default ${DEFAULT_COVERAGE_STANDARD}.
`;
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    artifactRoot: '',
    strict: process.env.DIRECTIVE_CPM_CERT_PREFLIGHT_STRICT === '1',
    writeArtifacts: false,
    output: '',
    expectedLanes: SOAK_PARALLEL_WORKER_POLICY.lanes.length,
    coverageStandard: DEFAULT_COVERAGE_STANDARD,
    help: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--artifact-root') options.artifactRoot = path.resolve(argv[++index] || '');
    else if (arg.startsWith('--artifact-root=')) options.artifactRoot = path.resolve(arg.slice('--artifact-root='.length));
    else if (arg === '--strict') options.strict = true;
    else if (arg === '--write-artifacts') options.writeArtifacts = true;
    else if (arg === '--output') options.output = path.resolve(argv[++index] || '');
    else if (arg.startsWith('--output=')) options.output = path.resolve(arg.slice('--output='.length));
    else if (arg === '--expected-lanes') options.expectedLanes = positiveInteger(argv[++index], options.expectedLanes);
    else if (arg.startsWith('--expected-lanes=')) options.expectedLanes = positiveInteger(arg.slice('--expected-lanes='.length), options.expectedLanes);
    else if (arg === '--coverage-standard') options.coverageStandard = String(argv[++index] || '').trim() || DEFAULT_COVERAGE_STANDARD;
    else if (arg.startsWith('--coverage-standard=')) options.coverageStandard = String(arg.slice('--coverage-standard='.length) || '').trim() || DEFAULT_COVERAGE_STANDARD;
    else if (arg && !arg.startsWith('-')) options.artifactRoot = path.resolve(arg);
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return { __readError: errorSummary(error) };
  }
}

function statusRank(status = 'unknown') {
  if (status === 'fail') return 3;
  if (status === 'warning') return 2;
  if (status === 'pass') return 1;
  if (status === 'skipped') return 0;
  return 2;
}

function worstStatus(statuses = []) {
  const filtered = statuses.filter(Boolean);
  if (!filtered.length) return 'fail';
  return filtered.reduce((worst, status) => (statusRank(status) > statusRank(worst) ? status : worst), 'pass');
}

function check(id, status, summary, details = null) {
  return {
    id,
    status,
    summary,
    ...(details ? { details } : {})
  };
}

function laneArtifactRoot(lane = {}, aggregateRoot = '') {
  if (lane.artifactRoot) return path.resolve(lane.artifactRoot);
  if (!aggregateRoot || !lane.id) return '';
  return path.join(aggregateRoot, 'lanes', lane.id, `${path.basename(aggregateRoot)}-${lane.id}`);
}

export function expectedFullCertificationBudget({ expectedLanes = SOAK_PARALLEL_WORKER_POLICY.lanes.length } = {}) {
  const laneCount = positiveInteger(expectedLanes, SOAK_PARALLEL_WORKER_POLICY.lanes.length);
  const fullTurnCount = SOAK_TURN_SCRIPT.length;
  return {
    laneCount,
    fullTurnCount,
    promptSnapshotsPerLane: fullTurnCount,
    factChecksPerLane: fullTurnCount + 1,
    totalPromptSnapshots: laneCount * fullTurnCount,
    totalFactChecks: laneCount * (fullTurnCount + 1),
    requiredLaneIds: SOAK_PARALLEL_WORKER_POLICY.lanes.map((lane) => lane.id),
    requiredUserHandles: SOAK_PARALLEL_WORKER_POLICY.defaultWorkerHandles.slice()
  };
}

function warningIsDepthOnly({ checkEntry = null, laneSummaries = [] } = {}) {
  if (!checkEntry || checkEntry.status !== 'warning') return false;
  if (checkEntry.id === 'turn-depth') return true;
  if (checkEntry.id === 'lane-results') {
    return laneSummaries.length > 0 && laneSummaries.every((lane) => lane.depthOnlyWarnings === true);
  }
  return /turn-limit|turn limited|bounded proof|bounded-depth|not full certification/i.test(String(checkEntry.summary || ''));
}

function laneDepthOnlyWarnings(laneReport = null) {
  if (!laneReport) return false;
  const warnings = (laneReport.checks || []).filter((entry) => entry.status === 'warning');
  if (!warnings.length) return false;
  return warnings.every((entry) => entry.id === 'live-execution-turn-limit'
    || /turn|bounded|limited/i.test(String(entry.summary || '')));
}

function reportCheckStatuses(report = null) {
  return (report?.checks || []).map((entry) => ({
    id: entry.id || 'unknown',
    status: entry.status || 'unknown',
    summary: compact(entry.summary || '', 220)
  }));
}

function nonPassingChecks(report = null) {
  return reportCheckStatuses(report).filter((entry) => entry.status !== 'pass');
}

function checkStatus(report = null, id = '') {
  return (report?.checks || []).find((entry) => entry?.id === id)?.status || null;
}

export function classifyAggregateWarnings({ aggregateReport = {}, laneSummaries = [] } = {}) {
  const warningChecks = (aggregateReport.checks || []).filter((entry) => entry.status === 'warning');
  return warningChecks.map((entry) => {
    const depthOnly = warningIsDepthOnly({ checkEntry: entry, laneSummaries });
    return {
      id: entry.id || 'unknown',
      summary: entry.summary || '',
      depthOnly,
      strictBlocking: !depthOnly,
      classification: depthOnly ? 'bounded-depth-only' : 'strict-blocker'
    };
  });
}

function aggregateTurnLimit(report = {}) {
  const optionLimit = report.options?.turnLimit ?? null;
  if (optionLimit) return optionLimit;
  const turnDepth = (report.checks || []).find((entry) => entry.id === 'turn-depth');
  return turnDepth?.details?.turnLimit ?? null;
}

function laneModelCallPolicyEvidence({ report = null, smokeReport = null, smokeSummary = null, chatCampaignSummary = null } = {}) {
  const durableEvidence = report?.modelCallPolicy?.failurePolicyEvidence || null;
  if (durableEvidence && typeof durableEvidence === 'object') {
    return {
      ...durableEvidence,
      durableEvidenceSource: 'lane-report:modelCallPolicy.failurePolicyEvidence'
    };
  }
  const diagnosticPolicy = summarizeModelCallFailurePolicy({ smokeReport, smokeSummary, chatCampaignSummary });
  return {
    status: 'fail',
    summary: 'Lane report is missing durable model-call failure policy evidence; full certification cannot rely on raw smoke reconstruction.',
    evidenceSource: 'missing-lane-report-policy',
    authoritySource: diagnosticPolicy.authoritySource || 'src/generation/model-call-authority-matrix.mjs',
    severityPolicy: diagnosticPolicy.severityPolicy || 'Missing durable lane-owned policy evidence blocks certification.',
    durableEvidenceSource: null,
    failedModelCallCount: diagnosticPolicy.failedModelCallCount || 0,
    retainedModelCallCount: diagnosticPolicy.retainedModelCallCount || 0,
    modelCallCount: diagnosticPolicy.modelCallCount || 0,
    calls: diagnosticPolicy.calls || [],
    releaseBlockingCalls: [{
      classification: 'release-blocking-missing-durable-lane-evidence',
      failedModelCallCount: diagnosticPolicy.failedModelCallCount || 0,
      diagnosticStatus: diagnosticPolicy.status || 'unknown',
      diagnosticSummary: diagnosticPolicy.summary || null
    }],
    unresolvedCalls: [],
    fallbackHandledCalls: []
  };
}

function summarizeLaneForPreflight(lane = {}, aggregateRoot = '') {
  const artifactRoot = laneArtifactRoot(lane, aggregateRoot);
  const report = readJsonIfExists(path.join(artifactRoot, 'report.json'));
  const smokeSummary = readJsonIfExists(path.join(artifactRoot, 'smoke-chat-soak', 'report-summary.json'));
  const chatCampaignSummary = smokeSummary?.browser?.chatCampaign
    || smokeSummary?.browser?.chatCampaignFlow?.chatCampaign
    || smokeSummary?.chatCampaign
    || null;
  const artifactCompleteness = summarizeLaneArtifactCompleteness({ artifactRoot, turnLimit: null });
  const externalContextGeneration = summarizeExternalContextGenerationArtifacts({ artifactRoot, turnLimit: null });
  const factualGrounding = summarizeFactualGroundingArtifacts({ artifactRoot });
  const storyQualityReview = summarizeStoryQualityReviewArtifacts({ artifactRoot });
  const generationTiming = summarizeGenerationTimingCoreProof({ artifactRoot });
  const hostNativeCompletion = summarizeHostNativeCompletionProof({ artifactRoot });
  const smokeReport = readJsonIfExists(path.join(artifactRoot, 'smoke-chat-soak', 'report.json'));
  const modelCallPolicy = laneModelCallPolicyEvidence({
    report,
    smokeReport,
    smokeSummary,
    chatCampaignSummary
  });
  const depthOnlyWarnings = laneDepthOnlyWarnings(report);
  const laneNonPassingChecks = nonPassingChecks(report);
  const liveSmokeDelegationStatus = checkStatus(report, 'live-smoke-52-turn-delegation');
  const releaseStatuses = [
    artifactCompleteness.status === 'pass' ? 'pass' : 'fail',
    externalContextGeneration.status === 'pass' ? 'pass' : 'fail',
    factualGrounding.status === 'pass' ? 'pass' : factualGrounding.status === 'warning' ? 'warning' : 'fail',
    storyQualityReview.status === 'pass' ? 'pass' : 'fail',
    generationTiming.status,
    hostNativeCompletion.status,
    modelCallPolicy.status
  ];
  return {
    id: lane.id || null,
    userHandle: lane.userHandle || null,
    artifactRoot,
    aggregateLaneStatus: lane.status || null,
    reportStatus: report?.status || null,
    laneCheckStatuses: reportCheckStatuses(report),
    laneNonPassingChecks,
    liveSmokeDelegationStatus,
    modelCallSummary: {
      modelCallCount: Number(chatCampaignSummary?.modelCallCount || 0),
      retainedModelCallCount: Number(chatCampaignSummary?.retainedModelCallCount || 0),
      failedModelCallCount: Number(chatCampaignSummary?.failedModelCallCount || 0)
    },
    modelCallPolicy,
    depthOnlyWarnings,
    releaseStatus: worstStatus(releaseStatuses),
    artifactCompleteness,
    externalContextGeneration,
    factualGrounding: {
      status: factualGrounding.status,
      checkCount: factualGrounding.checkCount,
      badCount: factualGrounding.badCount,
      counts: factualGrounding.counts
    },
    storyQualityReview,
    generationTiming,
    hostNativeCompletion
  };
}

function fixtureDepthFromReport(report = {}) {
  return report.readiness?.externalContextProbe?.fixtureDepth
    || report.readiness?.externalContextProbe?.externalProbe?.fixtureDepth
    || null;
}

function externalCoverageStatus({ report = {}, laneSummaries = [], coverageStandard = DEFAULT_COVERAGE_STANDARD } = {}) {
  const fixtureDepth = fixtureDepthFromReport(report);
  if (!fixtureDepth) {
    return {
      status: 'fail',
      summary: 'Aggregate report is missing external-context fixture-depth evidence.',
      fixtureDepth: null
    };
  }
  const fullFixtureUsers = new Set(fixtureDepth.fullFixtureUserHandles || []);
  if (coverageStandard === 'all-lanes') {
    const missing = laneSummaries
      .map((lane) => lane.userHandle)
      .filter((handle) => handle && !fullFixtureUsers.has(handle));
    return {
      status: fixtureDepth.status === 'pass' && missing.length === 0 ? 'pass' : 'fail',
      summary: missing.length
        ? `${missing.length} lane(s) do not have rich external-context fixture coverage under all-lanes standard.`
        : 'Every lane has rich external-context fixture coverage under all-lanes standard.',
      fixtureDepth,
      missingUserHandles: missing
    };
  }
  return {
    status: fixtureDepth.status === 'pass' && fullFixtureUsers.size > 0 ? 'pass' : 'fail',
    summary: fixtureDepth.status === 'pass' && fullFixtureUsers.size > 0
      ? 'At least one non-human soak user has rich active external-context fixture evidence.'
      : 'Single-rich-lane external-context standard requires at least one full fixture user with pass status.',
    fixtureDepth,
    missingUserHandles: []
  };
}

export function buildFullCertificationPreflight({
  artifactRoot,
  strict = false,
  expectedLanes = SOAK_PARALLEL_WORKER_POLICY.lanes.length,
  coverageStandard = DEFAULT_COVERAGE_STANDARD
} = {}) {
  const resolvedRoot = path.resolve(artifactRoot || '');
  const reportPath = path.join(resolvedRoot, 'report.json');
  const aggregateReport = readJsonIfExists(reportPath);
  const expected = expectedFullCertificationBudget({ expectedLanes });
  const lanes = Array.isArray(aggregateReport?.lanes) ? aggregateReport.lanes : [];
  const laneSummaries = lanes.map((lane) => summarizeLaneForPreflight(lane, resolvedRoot));
  const warnings = aggregateReport ? classifyAggregateWarnings({ aggregateReport, laneSummaries }) : [];
  const nonDepthWarnings = warnings.filter((entry) => entry.strictBlocking);
  const boundedWarnings = warnings.filter((entry) => entry.depthOnly);
  const turnLimit = aggregateReport ? aggregateTurnLimit(aggregateReport) : null;
  const artifactTotals = laneSummaries.reduce((totals, lane) => {
    totals.promptSnapshots += Number(lane.artifactCompleteness?.generationPromptFileCount || 0);
    totals.factChecks += Number(lane.artifactCompleteness?.factCheckCount || 0);
    totals.badFindings += Number(lane.factualGrounding?.badCount || 0);
    return totals;
  }, { promptSnapshots: 0, factChecks: 0, badFindings: 0 });
  const missingRequiredLaneIds = expected.requiredLaneIds.filter((id) => !lanes.some((lane) => lane.id === id));
  const artifactBudgetFailures = laneSummaries.filter((lane) => lane.artifactCompleteness?.status !== 'pass'
    || lane.artifactCompleteness?.promptInspectionDepthMissing
    || lane.artifactCompleteness?.factCheckDepthMissing);
  const storyFailures = laneSummaries.filter((lane) => lane.storyQualityReview?.status !== 'pass');
  const externalGenerationFailures = laneSummaries.filter((lane) => lane.externalContextGeneration?.status !== 'pass');
  const factualFailures = laneSummaries.filter((lane) => lane.factualGrounding?.status !== 'pass');
  const timingFailures = laneSummaries.filter((lane) => lane.generationTiming?.status !== 'pass');
  const hostCompletionFailures = laneSummaries.filter((lane) => lane.hostNativeCompletion?.status !== 'pass');
  const modelCallPolicyFailures = laneSummaries.filter((lane) => lane.modelCallPolicy?.status === 'fail');
  const modelCallPolicyWarnings = laneSummaries.filter((lane) => lane.modelCallPolicy?.status === 'warning');
  const modelCallPolicyHandled = laneSummaries.filter((lane) => lane.modelCallPolicy?.fallbackHandledCalls?.length > 0);
  const externalCoverage = externalCoverageStatus({ report: aggregateReport || {}, laneSummaries, coverageStandard });
  const aggregateNonPassingChecks = nonPassingChecks(aggregateReport);
  const aggregateLiveStatusOk = aggregateReport?.status === 'pass' && aggregateNonPassingChecks.length === 0;
  const laneLiveExecutionFailures = laneSummaries.filter((lane) => lane.aggregateLaneStatus !== 'pass'
    || lane.reportStatus !== 'pass'
    || lane.laneNonPassingChecks.length > 0
    || (lane.liveSmokeDelegationStatus !== null && lane.liveSmokeDelegationStatus !== 'pass'));
  const checks = [
    check(
      'artifact-root-readable',
      fs.existsSync(resolvedRoot) && aggregateReport && !aggregateReport.__readError ? 'pass' : 'fail',
      aggregateReport?.__readError
        ? `Aggregate report could not be read: ${aggregateReport.__readError.message || 'unknown read error'}.`
        : fs.existsSync(resolvedRoot)
          ? 'Artifact root and aggregate report are readable.'
          : 'Artifact root does not exist.',
      { artifactRoot: resolvedRoot, reportPath }
    ),
    check(
      'aggregate-live-execution-pass',
      aggregateLiveStatusOk ? 'pass' : 'fail',
      aggregateLiveStatusOk
        ? 'Aggregate five-lane live execution report passed with no non-passing aggregate checks.'
        : 'Aggregate five-lane live execution report did not pass cleanly.',
      {
        aggregateStatus: aggregateReport?.status || null,
        nonPassingChecks: aggregateNonPassingChecks
      }
    ),
    check(
      'lane-live-execution-pass',
      laneLiveExecutionFailures.length ? 'fail' : 'pass',
      laneLiveExecutionFailures.length
        ? `${laneLiveExecutionFailures.length} lane(s) did not pass live execution cleanly.`
        : 'Every lane report passed live execution checks.',
      {
        failingLanes: laneLiveExecutionFailures.map((lane) => ({
          id: lane.id,
          aggregateLaneStatus: lane.aggregateLaneStatus,
          reportStatus: lane.reportStatus,
          liveSmokeDelegationStatus: lane.liveSmokeDelegationStatus,
          nonPassingChecks: lane.laneNonPassingChecks
        }))
      }
    ),
    check(
      'five-lane-coverage',
      lanes.length === expected.laneCount && missingRequiredLaneIds.length === 0 ? 'pass' : 'fail',
      lanes.length === expected.laneCount && missingRequiredLaneIds.length === 0
        ? `Artifact includes all ${expected.laneCount} required lanes.`
        : `Artifact includes ${lanes.length}/${expected.laneCount} required lane(s).`,
      {
        expectedLaneCount: expected.laneCount,
        actualLaneCount: lanes.length,
        requiredLaneIds: expected.requiredLaneIds,
        presentLaneIds: lanes.map((lane) => lane.id || null),
        missingRequiredLaneIds
      }
    ),
    check(
      'full-depth-run',
      !turnLimit ? 'pass' : 'fail',
      !turnLimit
        ? `Artifact is unbounded and expected to cover all ${expected.fullTurnCount} turns.`
        : `Artifact is bounded by turn limit ${turnLimit}; full certification requires no turn limit.`,
      { turnLimit, expectedFullTurnCount: expected.fullTurnCount }
    ),
    check(
      'strict-warning-dry-assessment',
      nonDepthWarnings.length ? 'fail' : boundedWarnings.length ? 'warning' : 'pass',
      nonDepthWarnings.length
        ? `${nonDepthWarnings.length} aggregate warning(s) would block strict certification.`
        : boundedWarnings.length
          ? `${boundedWarnings.length} warning(s) are classified as bounded-depth only.`
          : 'No aggregate warnings would block strict certification.',
      { strict, warnings, nonDepthWarningCount: nonDepthWarnings.length, boundedDepthWarningCount: boundedWarnings.length }
    ),
    check(
      'unbounded-artifact-budget',
      artifactBudgetFailures.length || artifactTotals.promptSnapshots < expected.totalPromptSnapshots || artifactTotals.factChecks < expected.totalFactChecks ? 'fail' : 'pass',
      artifactBudgetFailures.length
        ? `${artifactBudgetFailures.length} lane(s) are missing full-depth prompt/fact artifacts.`
        : `Artifact meets full-depth budget: ${artifactTotals.promptSnapshots} prompt snapshots and ${artifactTotals.factChecks} fact checks.`,
      {
        expected,
        actual: artifactTotals,
        failingLanes: artifactBudgetFailures.map((lane) => ({
          id: lane.id,
          promptSnapshots: lane.artifactCompleteness?.generationPromptFileCount || 0,
          expectedPromptSnapshots: lane.artifactCompleteness?.expectedPromptInspectionCount,
          factChecks: lane.artifactCompleteness?.factCheckCount || 0,
          expectedFactChecks: lane.artifactCompleteness?.expectedFactCheckCount,
          externalContextSummaryPresent: lane.artifactCompleteness?.externalContextSummaryPresent === true,
          externalContextSummary: lane.artifactCompleteness?.externalContextSummary || null,
          missingFiles: lane.artifactCompleteness?.missingFiles || []
        }))
      }
    ),
    check(
      'story-quality-release-proof',
      storyFailures.length ? 'fail' : 'pass',
      storyFailures.length
        ? `${storyFailures.length} lane(s) lack passing model-assisted story-quality review evidence.`
        : 'Every lane has passing model-assisted story-quality review evidence.',
      { failingLanes: storyFailures.map((lane) => ({ id: lane.id, status: lane.storyQualityReview?.status, summary: lane.storyQualityReview?.summary })) }
    ),
    check(
      'external-context-generation-depth',
      externalGenerationFailures.length ? 'fail' : 'pass',
      externalGenerationFailures.length
        ? `${externalGenerationFailures.length} lane(s) lack full-depth external-context generation evidence.`
        : 'Every lane has full-depth external-context generation evidence.',
      { failingLanes: externalGenerationFailures.map((lane) => ({ id: lane.id, status: lane.externalContextGeneration?.status, captureCount: lane.externalContextGeneration?.captureCount, expectedCaptureCount: lane.externalContextGeneration?.expectedCaptureCount })) }
    ),
    check(
      'external-context-coverage-standard',
      externalCoverage.status,
      externalCoverage.summary,
      { coverageStandard, fixtureDepth: externalCoverage.fixtureDepth, missingUserHandles: externalCoverage.missingUserHandles || [] }
    ),
    check(
      'factual-grounding-release-proof',
      factualFailures.length || artifactTotals.badFindings > 0 ? 'fail' : 'pass',
      factualFailures.length || artifactTotals.badFindings > 0
        ? `${factualFailures.length} lane(s) have non-passing factual-grounding evidence; bad findings=${artifactTotals.badFindings}.`
        : 'Every lane has passing factual-grounding evidence with zero bad findings.',
      { failingLanes: factualFailures.map((lane) => ({ id: lane.id, status: lane.factualGrounding?.status, badCount: lane.factualGrounding?.badCount })) }
    ),
    check(
      'generation-start-timing-release-proof',
      timingFailures.length ? 'fail' : 'pass',
      timingFailures.length
        ? `${timingFailures.length} lane(s) lack persisted CORE generation-start timing proof.`
        : 'Every lane has persisted CORE generation-start timing proof.',
      { failingLanes: timingFailures.map((lane) => ({ id: lane.id, status: lane.generationTiming?.status, summary: lane.generationTiming?.summary })) }
    ),
    check(
      'host-native-completion-release-proof',
      hostCompletionFailures.length ? 'fail' : 'pass',
      hostCompletionFailures.length
        ? `${hostCompletionFailures.length} lane(s) lack persisted CORE host-native completion proof.`
        : 'Every lane has persisted CORE host-native completion proof.',
      { failingLanes: hostCompletionFailures.map((lane) => ({ id: lane.id, status: lane.hostNativeCompletion?.status, summary: lane.hostNativeCompletion?.summary })) }
    ),
    check(
      'model-call-failure-policy',
      modelCallPolicyFailures.length ? 'fail' : modelCallPolicyWarnings.length ? 'warning' : 'pass',
      modelCallPolicyFailures.length
        ? `${modelCallPolicyFailures.length} lane(s) have release-blocking failed model calls.`
        : modelCallPolicyWarnings.length
          ? `${modelCallPolicyWarnings.length} lane(s) have failed model calls that lack enough release-policy evidence.`
          : modelCallPolicyHandled.length
            ? `${modelCallPolicyHandled.length} lane(s) recorded failed model calls, all covered by known fallback policy.`
            : 'No lane recorded failed model calls in smoke summaries.',
      {
        failingLanes: modelCallPolicyFailures.map((lane) => ({
          id: lane.id,
          summary: lane.modelCallPolicy?.summary,
          releaseBlockingCalls: lane.modelCallPolicy?.releaseBlockingCalls || []
        })),
        warningLanes: modelCallPolicyWarnings.map((lane) => ({
          id: lane.id,
          summary: lane.modelCallPolicy?.summary,
          unresolvedCalls: lane.modelCallPolicy?.unresolvedCalls || []
        })),
        handledLanes: modelCallPolicyHandled.map((lane) => ({
          id: lane.id,
          summary: lane.modelCallPolicy?.summary,
          fallbackHandledCalls: lane.modelCallPolicy?.fallbackHandledCalls || []
        }))
      }
    )
  ];
  const status = checks.some((entry) => entry.status === 'fail')
    ? 'fail'
    : strict && checks.some((entry) => entry.status === 'warning')
      ? 'fail'
      : checks.some((entry) => entry.status === 'warning')
        ? 'warning'
        : 'pass';
  return {
    kind: REPORT_KIND,
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status,
    artifactRoot: resolvedRoot,
    strict,
    coverageStandard,
    expected,
    aggregate: aggregateReport
      ? {
          status: aggregateReport.status || null,
          mode: aggregateReport.mode || null,
          runId: aggregateReport.runId || null,
          turnLimit,
          checkStatuses: reportCheckStatuses(aggregateReport)
        }
      : null,
    checks,
    lanes: laneSummaries.map((lane) => ({
      id: lane.id,
      userHandle: lane.userHandle,
      releaseStatus: lane.releaseStatus,
      aggregateLaneStatus: lane.aggregateLaneStatus,
      reportStatus: lane.reportStatus,
      liveSmokeDelegationStatus: lane.liveSmokeDelegationStatus,
      laneCheckStatuses: lane.laneCheckStatuses,
      modelCallSummary: lane.modelCallSummary,
      modelCallPolicy: {
        status: lane.modelCallPolicy?.status,
        summary: lane.modelCallPolicy?.summary || null,
        failedModelCallCount: lane.modelCallPolicy?.failedModelCallCount || 0,
        releaseBlockingCount: lane.modelCallPolicy?.releaseBlockingCalls?.length || 0,
        unresolvedCount: lane.modelCallPolicy?.unresolvedCalls?.length || 0,
        fallbackHandledCount: lane.modelCallPolicy?.fallbackHandledCalls?.length || 0,
        calls: lane.modelCallPolicy?.calls || []
      },
      artifactRoot: lane.artifactRoot,
      depthOnlyWarnings: lane.depthOnlyWarnings,
      artifactCompleteness: {
        status: lane.artifactCompleteness?.status,
        generationPromptFileCount: lane.artifactCompleteness?.generationPromptFileCount || 0,
        expectedPromptInspectionCount: lane.artifactCompleteness?.expectedPromptInspectionCount,
        promptInspectionDepthMissing: lane.artifactCompleteness?.promptInspectionDepthMissing === true,
        factCheckCount: lane.artifactCompleteness?.factCheckCount || 0,
        expectedFactCheckCount: lane.artifactCompleteness?.expectedFactCheckCount,
        factCheckDepthMissing: lane.artifactCompleteness?.factCheckDepthMissing === true,
        externalContextSummaryPresent: lane.artifactCompleteness?.externalContextSummaryPresent === true,
        externalContextSummary: lane.artifactCompleteness?.externalContextSummary || null,
        missingFiles: lane.artifactCompleteness?.missingFiles || []
      },
      externalContextGeneration: {
        status: lane.externalContextGeneration?.status,
        captureCount: lane.externalContextGeneration?.captureCount || 0,
        expectedCaptureCount: lane.externalContextGeneration?.expectedCaptureCount,
        captureDepthMissing: lane.externalContextGeneration?.captureDepthMissing === true,
        richFixturePressureStatus: lane.externalContextGeneration?.richFixturePressure?.status || null
      },
      factualGrounding: lane.factualGrounding,
      storyQualityReview: {
        status: lane.storyQualityReview?.status,
        deterministicStatus: lane.storyQualityReview?.deterministicStatus || null,
        modelAssistedReviewStatus: lane.storyQualityReview?.modelAssistedReview?.status || null,
        summary: lane.storyQualityReview?.summary || null
      },
      generationTiming: {
        status: lane.generationTiming?.status,
        summary: lane.generationTiming?.summary || null
      },
      hostNativeCompletion: {
        status: lane.hostNativeCompletion?.status,
        summary: lane.hostNativeCompletion?.summary || null
      }
    }))
  };
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!options.artifactRoot) {
    throw new Error('Missing --artifact-root.');
  }
  const report = buildFullCertificationPreflight(options);
  const outputPath = options.output || (options.writeArtifacts
    ? path.join(path.resolve(options.artifactRoot), 'full-certification-preflight.json')
    : '');
  if (outputPath) writeJsonFile(outputPath, report);
  console.log(JSON.stringify({
    ok: report.status !== 'fail',
    status: report.status,
    artifactRoot: report.artifactRoot,
    output: outputPath || null,
    checks: report.checks.map((entry) => ({
      id: entry.id,
      status: entry.status,
      summary: entry.summary
    }))
  }, null, 2));
  if (report.status === 'fail') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(errorSummary(error));
    process.exit(1);
  });
}
