import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  assessStoryQualityReviewResult,
  discoverStoryQualityReviewRequests,
  runStoryQualityReviewPreflight
} from './replay-story-quality-review-preflight.mjs';

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'directive-story-quality-preflight-'));
}

function writeReviewPair(root, laneId, {
  status = 'pass',
  reason = null,
  modelCall = {
    roleId: 'storyQualityReviewer',
    providerKind: 'utility',
    status: 'ok',
    ok: true,
    latencyMs: 1400
  }
} = {}) {
  const directory = path.join(root, 'lanes', laneId, 'quality-review', 'model-assisted-review');
  const requestPath = path.join(directory, 'request.json');
  const resultPath = path.join(directory, 'result.json');
  writeJson(requestPath, {
    kind: 'directive.liveCampaignSoak.storyQualityModelReviewRequest',
    schemaVersion: 1,
    requestId: `story-quality-${laneId}`,
    runId: 'preflight-test',
    inputHash: `${laneId}-input-hash`,
    transcript: [
      {
        index: 0,
        messageId: `${laneId}-message-1`,
        role: 'user',
        textHash: 'a'.repeat(64),
        text: 'The XO gives a careful order.'
      }
    ],
    deterministicScores: []
  });
  writeJson(resultPath, {
    kind: 'directive.liveCampaignSoak.storyQualityModelReviewResult',
    schemaVersion: 1,
    requestId: `story-quality-${laneId}`,
    runId: 'preflight-test',
    inputHash: `${laneId}-input-hash`,
    status,
    reason,
    counts: {
      scores: status === 'not-run' ? 0 : 1,
      scoreZero: 0,
      warningOrWeak: status === 'warning' ? 1 : 0
    },
    scores: status === 'not-run' ? [] : [
      {
        messageId: `${laneId}-message-1`,
        messageIndex: 0,
        role: 'user',
        overallScore: status === 'warning' ? 1 : 2,
        dimensions: []
      }
    ],
    modelCall
  });
  return { requestPath, resultPath };
}

const root = makeRoot();
const passPair = writeReviewPair(root, 'pass-lane');
const warningPair = writeReviewPair(root, 'warning-lane', { status: 'warning' });
const notRunPair = writeReviewPair(root, 'not-run-lane', {
  status: 'not-run',
  reason: 'model-assisted story quality reviewer was not invoked',
  modelCall: null
});
const timeoutPair = writeReviewPair(root, 'timeout-lane', {
  status: 'fail',
  reason: 'DIRECTIVE_GENERATION_TIMEOUT after 60000 ms',
  modelCall: {
    roleId: 'storyQualityReviewer',
    providerKind: 'utility',
    status: 'failed',
    ok: false,
    latencyMs: 60000,
    errorCode: 'DIRECTIVE_GENERATION_TIMEOUT'
  }
});
const missingPair = writeReviewPair(root, 'missing-result-lane');
fs.rmSync(missingPair.resultPath, { force: true });

const discovered = discoverStoryQualityReviewRequests({ artifactRoots: [root] });
assert.equal(discovered.length, 5);
assert(discovered.includes(passPair.requestPath));

assert.equal(assessStoryQualityReviewResult({ requestPath: passPair.requestPath }).status, 'pass');
assert.equal(assessStoryQualityReviewResult({ requestPath: warningPair.requestPath }).status, 'warning');
assert.equal(assessStoryQualityReviewResult({ requestPath: warningPair.requestPath, strict: true }).status, 'fail');
assert.equal(assessStoryQualityReviewResult({ requestPath: notRunPair.requestPath }).status, 'fail');
assert.equal(assessStoryQualityReviewResult({ requestPath: notRunPair.requestPath }).missing, true);
assert.equal(assessStoryQualityReviewResult({ requestPath: timeoutPair.requestPath }).status, 'fail');
assert.equal(assessStoryQualityReviewResult({ requestPath: timeoutPair.requestPath }).timedOut, true);
assert.equal(assessStoryQualityReviewResult({ requestPath: missingPair.requestPath }).status, 'fail');

const invalidRoot = makeRoot();
const mismatchPair = writeReviewPair(invalidRoot, 'mismatch-lane');
const mismatchResult = readJson(mismatchPair.resultPath);
mismatchResult.inputHash = 'stale-input-hash';
writeJson(mismatchPair.resultPath, mismatchResult);
const mismatchAssessment = assessStoryQualityReviewResult({ requestPath: mismatchPair.requestPath });
assert.equal(mismatchAssessment.status, 'fail');
assert.equal(mismatchAssessment.validationFailed, true);
assert.equal(mismatchAssessment.validationIssues.some((entry) => entry.code === 'input-hash-mismatch'), true);

const missingModelPair = writeReviewPair(invalidRoot, 'missing-model-lane', { modelCall: null });
const missingModelAssessment = assessStoryQualityReviewResult({ requestPath: missingModelPair.requestPath });
assert.equal(missingModelAssessment.status, 'fail');
assert.equal(missingModelAssessment.validationIssues.some((entry) => entry.code === 'model-call-missing'), true);

const wrongRolePair = writeReviewPair(invalidRoot, 'wrong-role-lane', {
  modelCall: {
    roleId: 'factualGroundingReviewer',
    providerKind: 'utility',
    status: 'ok',
    ok: true,
    latencyMs: 1400
  }
});
const wrongRoleAssessment = assessStoryQualityReviewResult({ requestPath: wrongRolePair.requestPath });
assert.equal(wrongRoleAssessment.status, 'fail');
assert.equal(wrongRoleAssessment.validationIssues.some((entry) => entry.code === 'model-call-role-mismatch'), true);

const noScoresPair = writeReviewPair(invalidRoot, 'no-scores-lane');
const noScoresResult = readJson(noScoresPair.resultPath);
noScoresResult.counts = { scores: 0, scoreZero: 0, warningOrWeak: 0 };
noScoresResult.scores = [];
writeJson(noScoresPair.resultPath, noScoresResult);
const noScoresAssessment = assessStoryQualityReviewResult({ requestPath: noScoresPair.requestPath });
assert.equal(noScoresAssessment.status, 'fail');
assert.equal(noScoresAssessment.validationIssues.some((entry) => entry.code === 'score-count-missing'), true);

const partialCoveragePair = writeReviewPair(invalidRoot, 'partial-coverage-lane');
const partialRequest = readJson(partialCoveragePair.requestPath);
partialRequest.transcript.push({
  index: 1,
  messageId: 'partial-coverage-lane-message-2',
  role: 'assistant',
  textHash: 'b'.repeat(64),
  text: 'The ship answers with a careful consequence.'
});
writeJson(partialCoveragePair.requestPath, partialRequest);
const partialCoverageAssessment = assessStoryQualityReviewResult({ requestPath: partialCoveragePair.requestPath });
assert.equal(partialCoverageAssessment.status, 'fail');
assert.equal(partialCoverageAssessment.validationIssues.some((entry) => entry.code === 'score-transcript-coverage-mismatch'), true);
assert.equal(partialCoverageAssessment.validationIssues.some((entry) => entry.code === 'score-message-id-missing-for-transcript'), true);

const duplicateScorePair = writeReviewPair(invalidRoot, 'duplicate-score-lane');
const duplicateResult = readJson(duplicateScorePair.resultPath);
duplicateResult.counts.scores = 2;
duplicateResult.scores.push({
  ...duplicateResult.scores[0]
});
writeJson(duplicateScorePair.resultPath, duplicateResult);
const duplicateScoreAssessment = assessStoryQualityReviewResult({ requestPath: duplicateScorePair.requestPath });
assert.equal(duplicateScoreAssessment.status, 'fail');
assert.equal(duplicateScoreAssessment.validationIssues.some((entry) => entry.code === 'score-message-id-duplicate'), true);
assert.equal(duplicateScoreAssessment.validationIssues.some((entry) => entry.code === 'score-message-index-duplicate'), true);

const unknownScorePair = writeReviewPair(invalidRoot, 'unknown-score-lane');
const unknownResult = readJson(unknownScorePair.resultPath);
unknownResult.scores[0].messageId = 'unknown-message-id';
unknownResult.scores[0].messageIndex = 99;
writeJson(unknownScorePair.resultPath, unknownResult);
const unknownScoreAssessment = assessStoryQualityReviewResult({ requestPath: unknownScorePair.requestPath });
assert.equal(unknownScoreAssessment.status, 'fail');
assert.equal(unknownScoreAssessment.validationIssues.some((entry) => entry.code === 'score-message-id-unknown'), true);
assert.equal(unknownScoreAssessment.validationIssues.some((entry) => entry.code === 'score-message-index-unknown'), true);

const passOnlyRoot = makeRoot();
writeReviewPair(passOnlyRoot, 'pass-only');
const passReport = await runStoryQualityReviewPreflight({
  artifactRoots: [passOnlyRoot],
  dryRun: true,
  strict: true,
  writeArtifacts: true,
  timeoutMs: 300000,
  maxLatencyMs: 120000,
  retryCount: 1
});
assert.equal(passReport.status, 'pass');
assert.equal(passReport.requestCount, 1);
assert.equal(passReport.timeoutMs, 300000);
assert.equal(passReport.maxLatencyMs, 120000);
assert.equal(passReport.retryCount, 1);
assert.equal(fs.existsSync(path.join(passOnlyRoot, 'story-quality-review-preflight.json')), true);

const mixedReport = await runStoryQualityReviewPreflight({
  artifactRoots: [root],
  dryRun: true,
  strict: true
});
assert.equal(mixedReport.status, 'fail');
assert.equal(mixedReport.requestCount, 5);
assert.equal(mixedReport.assessments.filter((entry) => entry.status === 'fail').length, 4);
assert.equal(readJson(passPair.resultPath).status, 'pass');

const preflightSource = fs.readFileSync(new URL('./replay-story-quality-review-preflight.mjs', import.meta.url), 'utf8');
assert.match(preflightSource, /const DEFAULT_TIMEOUT_MS = 300000/);
assert.match(preflightSource, /const DEFAULT_RETRY_COUNT = 1/);
assert.match(preflightSource, /--retry-count N/);
assert.match(preflightSource, /DIRECTIVE_SILLYTAVERN_STORY_QUALITY_REVIEW_RETRY_COUNT/);
assert.match(preflightSource, /retryCount:\s*Math\.max\(0,\s*Number\(options\.retryCount/);

fs.rmSync(root, { recursive: true, force: true });
fs.rmSync(passOnlyRoot, { recursive: true, force: true });
fs.rmSync(invalidRoot, { recursive: true, force: true });

console.log('Story-quality review preflight tests passed.');
