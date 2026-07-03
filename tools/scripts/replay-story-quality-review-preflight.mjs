import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import {
  errorSummary,
  writeJsonFile,
  writeTextFile
} from './lib/sillytavern-live-harness.mjs';
import {
  buildStoryQualityModelReviewResult
} from './soak-sillytavern-campaign-live.mjs';

const DEFAULT_TIMEOUT_MS = 300000;
const DEFAULT_MAX_LATENCY_MS = 120000;
const DEFAULT_RETRY_COUNT = 1;
const EXPECTED_REQUEST_KIND = 'directive.liveCampaignSoak.storyQualityModelReviewRequest';
const EXPECTED_RESULT_KIND = 'directive.liveCampaignSoak.storyQualityModelReviewResult';
const EXPECTED_SCHEMA_VERSION = 1;
const STORY_QUALITY_REVIEW_ROLE_ID = 'storyQualityReviewer';

function usage() {
  return `Usage:
  node tools/scripts/replay-story-quality-review-preflight.mjs --artifact-root <path> [--strict] [--dry-run] [--write-artifacts]
  node tools/scripts/replay-story-quality-review-preflight.mjs --request <quality-review/model-assisted-review/request.json> [--strict]

Options:
  --artifact-root PATH   Recursively discover story-quality model-review request artifacts.
  --request PATH         Replay or assess one request artifact. May be repeated.
  --dry-run              Do not call SillyTavern; assess existing result.json files only.
  --strict               Require pass status. Without this, parseable warning/fail statuses are reported honestly.
  --write-artifacts      Write story-quality-review-preflight.json beside each artifact root.
  --output PATH          Write one aggregate preflight report to PATH.
  --timeout-ms N         Timeout per review-only smoke call. Default ${DEFAULT_TIMEOUT_MS}.
  --max-latency-ms N     Treat reviewer latency at or above N as timeout evidence. Default ${DEFAULT_MAX_LATENCY_MS}.
  --retry-count N        Retry failed/empty provider output inside review-only smoke. Default ${DEFAULT_RETRY_COUNT}.
`;
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    artifactRoots: [],
    requests: [],
    dryRun: false,
    strict: process.env.DIRECTIVE_STORY_QUALITY_REVIEW_PREFLIGHT_STRICT === '1',
    writeArtifacts: false,
    output: '',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxLatencyMs: DEFAULT_MAX_LATENCY_MS,
    retryCount: DEFAULT_RETRY_COUNT,
    help: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--artifact-root') options.artifactRoots.push(path.resolve(argv[++index] || ''));
    else if (arg === '--request') options.requests.push(path.resolve(argv[++index] || ''));
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--strict') options.strict = true;
    else if (arg === '--write-artifacts') options.writeArtifacts = true;
    else if (arg === '--output') options.output = path.resolve(argv[++index] || '');
    else if (arg === '--timeout-ms') options.timeoutMs = positiveInteger(argv[++index], DEFAULT_TIMEOUT_MS);
    else if (arg === '--max-latency-ms') options.maxLatencyMs = positiveInteger(argv[++index], DEFAULT_MAX_LATENCY_MS);
    else if (arg === '--retry-count') options.retryCount = nonNegativeInteger(argv[++index], DEFAULT_RETRY_COUNT);
    else if (arg && !arg.startsWith('-')) options.artifactRoots.push(path.resolve(arg));
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function readJsonFileIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return { __readError: errorSummary(error) };
  }
}

function shouldSkipDirectory(name) {
  return new Set(['.git', 'node_modules', '.cache', 'playwright', 'screenshots']).has(name);
}

function discoverRequestFiles(root) {
  const resolvedRoot = path.resolve(root || '');
  if (!resolvedRoot || !fs.existsSync(resolvedRoot)) return [];
  const found = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!shouldSkipDirectory(entry.name)) visit(filePath);
        continue;
      }
      if (
        entry.isFile()
        && entry.name === 'request.json'
        && path.basename(path.dirname(filePath)) === 'model-assisted-review'
        && path.basename(path.dirname(path.dirname(filePath))) === 'quality-review'
      ) {
        found.push(filePath);
      }
    }
  };
  visit(resolvedRoot);
  return found.sort();
}

export function discoverStoryQualityReviewRequests({ artifactRoots = [], requests = [] } = {}) {
  const discovered = [
    ...requests.map((entry) => path.resolve(entry)),
    ...artifactRoots.flatMap((root) => discoverRequestFiles(root))
  ];
  return [...new Set(discovered)].filter((filePath) => fs.existsSync(filePath)).sort();
}

function resultPathForRequest(requestPath) {
  return path.join(path.dirname(requestPath), 'result.json');
}

function providerDirForRequest(requestPath) {
  return path.join(path.dirname(requestPath), 'replay-provider');
}

function providerOutputPathForRequest(requestPath) {
  return path.join(providerDirForRequest(requestPath), 'provider-result.json');
}

function modelCallFromProviderResult(providerResult = null) {
  const modelCall = providerResult?.modelCall || null;
  if (modelCall) return modelCall;
  const generation = providerResult?.generation || null;
  if (!generation) return null;
  return {
    roleId: generation.roleId || 'storyQualityReviewer',
    providerKind: generation.providerKind || null,
    providerId: generation.providerId || null,
    model: generation.model || null,
    status: generation.ok === true ? 'ok' : 'failed',
    ok: generation.ok === true,
    latencyMs: generation.latencyMs ?? null,
    errorCode: generation.error?.code || null
  };
}

function childProcessResult(command, args, options = {}) {
  const timeoutMs = positiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS);
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: options.env || process.env,
      shell: false
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      child.kill('SIGTERM');
    }, timeoutMs);
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, exitCode: null, signal: null, stdout, stderr, error: errorSummary(error) });
    });
    child.on('close', (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const timedOut = signal === 'SIGTERM' && exitCode === null;
      resolve({
        ok: exitCode === 0 && !timedOut,
        exitCode,
        signal,
        stdout,
        stderr,
        error: timedOut ? { message: `story-quality review-only smoke timed out after ${timeoutMs} ms`, code: 'timeout' } : null
      });
    });
  });
}

async function replayRequest({ requestPath, timeoutMs, retryCount = DEFAULT_RETRY_COUNT } = {}) {
  const request = readJsonFileIfExists(requestPath);
  if (!request || request.__readError) {
    return {
      requestPath,
      resultPath: resultPathForRequest(requestPath),
      status: 'fail',
      reason: request?.__readError?.message || 'request artifact is missing or unreadable'
    };
  }
  const providerDir = providerDirForRequest(requestPath);
  fs.mkdirSync(providerDir, { recursive: true });
  const providerOutputPath = providerOutputPathForRequest(requestPath);
  const stdoutPath = path.join(providerDir, 'stdout.txt');
  const stderrPath = path.join(providerDir, 'stderr.txt');
  fs.rmSync(providerOutputPath, { force: true });
  const env = {
    ...process.env,
    DIRECTIVE_SILLYTAVERN_ARTIFACT_DIR: providerDir,
    DIRECTIVE_SILLYTAVERN_STORY_QUALITY_REVIEW_ONLY: '1',
    DIRECTIVE_SILLYTAVERN_STORY_QUALITY_REVIEW_REQUEST_PATH: requestPath,
    DIRECTIVE_SILLYTAVERN_STORY_QUALITY_REVIEW_OUTPUT_PATH: providerOutputPath,
    DIRECTIVE_SILLYTAVERN_STORY_QUALITY_REVIEW_RETRY_COUNT: String(Math.max(0, Number(retryCount) || 0)),
    DIRECTIVE_SILLYTAVERN_CHAT_CAMPAIGN: '0',
    DIRECTIVE_SILLYTAVERN_OPEN_WORLD_FLOW: '0',
    DIRECTIVE_SILLYTAVERN_SAVE_FLOW: '0',
    DIRECTIVE_SILLYTAVERN_SCREENSHOTS: '0',
    DIRECTIVE_SILLYTAVERN_RESIZE_SWEEP: '0',
    DIRECTIVE_SILLYTAVERN_TEARDOWN: '0'
  };
  const child = await childProcessResult(process.execPath, ['tools/scripts/smoke-sillytavern-live.mjs'], { env, timeoutMs });
  writeTextFile(stdoutPath, child.stdout || '');
  writeTextFile(stderrPath, child.stderr || '');
  const providerOutput = readJsonFileIfExists(providerOutputPath);
  const providerMatchesRequest = providerOutput
    && providerOutput.requestId === request.requestId
    && providerOutput.inputHash === request.inputHash;
  const providerResult = providerMatchesRequest ? providerOutput?.result || null : null;
  const result = buildStoryQualityModelReviewResult({
    request,
    modelOutput: providerResult?.text || null,
    modelCall: modelCallFromProviderResult(providerResult),
    status: providerResult?.ok === true ? null : (child.ok ? 'fail' : 'not-run'),
    reason: providerResult?.ok === true
      ? null
      : (!providerMatchesRequest && providerOutput
        ? 'story-quality review provider output did not match the request artifact'
        : providerResult?.reason || providerResult?.generation?.error?.message || child.error?.message || 'model-assisted story quality reviewer did not return usable output')
  });
  writeJsonFile(resultPathForRequest(requestPath), result);
  return {
    requestPath,
    resultPath: resultPathForRequest(requestPath),
    providerDir,
    providerOutputPath,
    stdoutPath,
    stderrPath,
    child,
    retryCount: Math.max(0, Number(retryCount) || 0),
    providerOutput,
    result
  };
}

function scoreCoverageIssues({ request = null, result = null } = {}) {
  const issues = [];
  const add = (code, message) => issues.push({ code, message });
  const transcript = Array.isArray(request?.transcript) ? request.transcript : [];
  const scores = Array.isArray(result?.scores) ? result.scores : [];
  if (!transcript.length) {
    add('request-transcript-missing', 'story-quality request transcript is empty or missing');
    return issues;
  }
  const expectedById = new Set(transcript.map((entry) => String(entry?.messageId || '')).filter(Boolean));
  const expectedByIndex = new Set(transcript.map((entry, index) => Number.isInteger(entry?.index) ? Number(entry.index) : index));
  const seenIds = new Set();
  const seenIndexes = new Set();
  for (const score of scores) {
    const messageId = String(score?.messageId || '').trim();
    const messageIndex = Number(score?.messageIndex);
    if (messageId) {
      if (!expectedById.has(messageId)) add('score-message-id-unknown', `story-quality score references unknown messageId ${messageId}`);
      if (seenIds.has(messageId)) add('score-message-id-duplicate', `story-quality score repeats messageId ${messageId}`);
      seenIds.add(messageId);
    } else {
      add('score-message-id-missing', 'story-quality score is missing messageId');
    }
    if (Number.isInteger(messageIndex)) {
      if (!expectedByIndex.has(messageIndex)) add('score-message-index-unknown', `story-quality score references unknown messageIndex ${messageIndex}`);
      if (seenIndexes.has(messageIndex)) add('score-message-index-duplicate', `story-quality score repeats messageIndex ${messageIndex}`);
      seenIndexes.add(messageIndex);
    } else {
      add('score-message-index-missing', 'story-quality score is missing messageIndex');
    }
  }
  if (scores.length !== transcript.length) {
    add('score-transcript-coverage-mismatch', `story-quality result scored ${scores.length} message(s), expected ${transcript.length}`);
  }
  for (const messageId of expectedById) {
    if (!seenIds.has(messageId)) add('score-message-id-missing-for-transcript', `story-quality result is missing score for messageId ${messageId}`);
  }
  for (const messageIndex of expectedByIndex) {
    if (!seenIndexes.has(messageIndex)) add('score-message-index-missing-for-transcript', `story-quality result is missing score for messageIndex ${messageIndex}`);
  }
  return issues;
}

export function reviewResultValidationIssues({ request = null, result = null, status = null, strict = false } = {}) {
  const issues = [];
  const add = (code, message) => issues.push({ code, message });
  if (!request || !result) return issues;
  if (request.kind !== EXPECTED_REQUEST_KIND) add('request-kind-mismatch', 'story-quality request kind is not recognized');
  if (request.schemaVersion !== EXPECTED_SCHEMA_VERSION) add('request-schema-version-mismatch', 'story-quality request schema version is not recognized');
  if (result.kind !== EXPECTED_RESULT_KIND) add('result-kind-mismatch', 'story-quality result kind is not recognized');
  if (result.schemaVersion !== EXPECTED_SCHEMA_VERSION) add('result-schema-version-mismatch', 'story-quality result schema version is not recognized');
  if (!request.requestId || result.requestId !== request.requestId) add('request-id-mismatch', 'story-quality result requestId does not match the request artifact');
  if (!request.inputHash || result.inputHash !== request.inputHash) add('input-hash-mismatch', 'story-quality result inputHash does not match the request artifact');

  if (status === 'pass' || status === 'warning') {
    const modelCall = result.modelCall || null;
    const roleId = modelCall?.roleId || modelCall?.role || null;
    if (!modelCall) add('model-call-missing', 'story-quality result has no modelCall evidence');
    else if (roleId !== STORY_QUALITY_REVIEW_ROLE_ID) add('model-call-role-mismatch', 'story-quality result modelCall is not from storyQualityReviewer');
    if (modelCall && modelCall.ok !== true && modelCall.status !== 'ok') add('model-call-not-ok', 'story-quality result modelCall did not complete successfully');

    const scoreCount = Number(result.counts?.scores ?? result.scores?.length ?? 0);
    if (!Number.isFinite(scoreCount) || scoreCount <= 0) add('score-count-missing', 'story-quality result contains no model-assisted scores');
    if (!Array.isArray(result.scores) || result.scores.length <= 0) add('scores-missing', 'story-quality result scores array is empty');
    if (Number.isFinite(scoreCount) && Array.isArray(result.scores) && scoreCount !== result.scores.length) {
      add('score-count-array-mismatch', `story-quality result counts.scores=${scoreCount} but scores.length=${result.scores.length}`);
    }
    issues.push(...scoreCoverageIssues({ request, result }));
    if (status === 'pass' && Number(result.counts?.scoreZero || 0) > 0) add('pass-with-score-zero', 'story-quality pass result contains score-zero findings');
    if (status === 'pass' && Number(result.counts?.warningOrWeak || 0) > 0) add('pass-with-warning-or-weak', 'story-quality pass result contains warning-or-weak findings');
    if (strict && (Number(result.counts?.scoreZero || 0) > 0 || Number(result.counts?.warningOrWeak || 0) > 0)) {
      add('strict-quality-finding', 'strict story-quality preflight rejects score-zero or warning-or-weak findings');
    }
  }
  return issues;
}

export function assessStoryQualityReviewResult({
  requestPath,
  strict = false,
  maxLatencyMs = DEFAULT_MAX_LATENCY_MS
} = {}) {
  const resultPath = resultPathForRequest(requestPath);
  const request = readJsonFileIfExists(requestPath);
  const result = readJsonFileIfExists(resultPath);
  const readFailed = Boolean(request?.__readError || result?.__readError);
  const modelCall = result?.modelCall || null;
  const status = result?.status || null;
  const missing = !result || readFailed || !status || status === 'not-run';
  const invalidStatus = status && !['pass', 'warning', 'fail', 'not-run'].includes(status);
  const validationIssues = missing || invalidStatus
    ? []
    : reviewResultValidationIssues({ request, result, status, strict });
  const validationFailed = validationIssues.length > 0;
  const timedOut = Boolean(
    modelCall?.errorCode
    && /timeout|timed/i.test(String(modelCall.errorCode))
  ) || Boolean(
    result?.reason
    && /timeout|timed out/i.test(String(result.reason))
  ) || (Number.isFinite(Number(modelCall?.latencyMs)) && Number(modelCall.latencyMs) >= maxLatencyMs);
  const strictFailure = strict && status !== 'pass';
  const finalStatus = missing || invalidStatus || validationFailed || timedOut || strictFailure || status === 'fail'
    ? 'fail'
    : status === 'warning'
      ? 'warning'
      : 'pass';
  return {
    requestPath,
    resultPath,
    status: finalStatus,
    reviewStatus: status,
    strict,
    inputHash: result?.inputHash || request?.inputHash || null,
    requestId: result?.requestId || request?.requestId || null,
    counts: result?.counts || null,
    modelCall,
    missing,
    invalidStatus: Boolean(invalidStatus),
    validationFailed,
    validationIssues,
    timedOut,
    reason: missing
      ? 'model-assisted story-quality result is missing or not-run'
      : invalidStatus
        ? `model-assisted story-quality result has invalid status "${status}"`
        : validationFailed
          ? validationIssues[0]?.message || 'story-quality result failed validation'
        : timedOut
          ? 'model-assisted story-quality review timed out or hit the latency ceiling'
          : strictFailure
            ? `strict preflight requires pass, got ${status}`
            : result?.reason || null
  };
}

function finalStatus(assessments = []) {
  if (!assessments.length) return 'fail';
  if (assessments.some((entry) => entry.status === 'fail')) return 'fail';
  if (assessments.some((entry) => entry.status === 'warning')) return 'warning';
  return 'pass';
}

export async function runStoryQualityReviewPreflight(options = {}) {
  const requests = discoverStoryQualityReviewRequests({
    artifactRoots: options.artifactRoots || [],
    requests: options.requests || []
  });
  const replays = [];
  if (!options.dryRun) {
    for (const requestPath of requests) {
      replays.push(await replayRequest({
        requestPath,
        timeoutMs: options.timeoutMs,
        retryCount: options.retryCount ?? DEFAULT_RETRY_COUNT
      }));
    }
  }
  const assessments = requests.map((requestPath) => assessStoryQualityReviewResult({
    requestPath,
    strict: options.strict === true,
    maxLatencyMs: options.maxLatencyMs || DEFAULT_MAX_LATENCY_MS
  }));
  const report = {
    kind: 'directive.storyQualityReviewPreflight.v1',
    generatedAt: new Date().toISOString(),
    status: finalStatus(assessments),
    strict: options.strict === true,
    dryRun: options.dryRun === true,
    timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
    maxLatencyMs: options.maxLatencyMs || DEFAULT_MAX_LATENCY_MS,
    retryCount: Math.max(0, Number(options.retryCount ?? DEFAULT_RETRY_COUNT) || 0),
    requestCount: requests.length,
    replayedCount: replays.length,
    artifactRoots: (options.artifactRoots || []).map((root) => path.resolve(root)),
    requests,
    assessments,
    replays: replays.map((entry) => ({
      requestPath: entry.requestPath,
      resultPath: entry.resultPath,
      providerOutputPath: entry.providerOutputPath || null,
      retryCount: entry.retryCount ?? null,
      exitCode: entry.child?.exitCode ?? null,
      signal: entry.child?.signal || null,
      childError: entry.child?.error || null,
      reviewStatus: entry.result?.status || null
    }))
  };
  if (options.output) writeJsonFile(options.output, report);
  if (options.writeArtifacts) {
    for (const root of options.artifactRoots || []) {
      writeJsonFile(path.join(path.resolve(root), 'story-quality-review-preflight.json'), report);
    }
  }
  return report;
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!options.artifactRoots.length && !options.requests.length) {
    throw new Error('Provide --artifact-root or --request.');
  }
  const report = await runStoryQualityReviewPreflight(options);
  console.log(JSON.stringify({
    ok: report.status !== 'fail',
    status: report.status,
    strict: report.strict,
    dryRun: report.dryRun,
    requestCount: report.requestCount,
    replayedCount: report.replayedCount,
    failures: report.assessments.filter((entry) => entry.status === 'fail').map((entry) => ({
      requestPath: entry.requestPath,
      reviewStatus: entry.reviewStatus,
      reason: entry.reason
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
