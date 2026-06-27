import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import {
  appendJsonLine,
  compact,
  createRunId,
  ensureArtifactTree,
  ensureDirectory,
  errorSummary,
  sha256Text,
  writeJsonFile,
  writeTextFile
} from './lib/sillytavern-live-harness.mjs';
import {
  SOAK_PARALLEL_WORKER_POLICY,
  SOAK_TURN_SCRIPT
} from './soak-sillytavern-campaign-live.mjs';

export const CONTINUITY_MATRIX_FIVE_USER_ARTIFACT_ROOT = 'artifacts/live-soak/continuity-projection-matrix-five-user';

export const CONTINUITY_MATRIX_REQUIRED_SOURCE_IDS = Object.freeze([
  'crew.hadrik-bronn.species',
  'crew.hadrik-bronn.age-description',
  'ship.uss-breckenridge.travel.not-six-days-impulse'
]);

export const CONTINUITY_MATRIX_REQUIRED_PROMPT_KEYS = Object.freeze([
  'directive.contract',
  'directive.continuity.invariants',
  'directive.scene.active',
  'directive.continuity.domain',
  'directive.recap.committed',
  'directive.context.revolving'
]);

const RESERVED_HUMAN_ONLY_USERS = new Set(['default-user']);
const DEFAULT_TURN_LIMIT = '';
let signalHandlersInstalled = false;
let signalLogPath = null;
let activeChildProcess = null;
let activeMaterialAction = null;

function usage() {
  return `Directive Continuity Projection Matrix five-user soak coordinator

Dry run:
  node tools\\scripts\\run-continuity-matrix-five-user-soak.mjs --write-artifacts

Bounded live proof:
  $env:SILLYTAVERN_BASE_URL='http://127.0.0.1:8000'
  $env:DIRECTIVE_SOAK_ST_USERS='directive-soak-a,directive-soak-b,directive-soak-c,directive-soak-d,directive-soak-e'
  $env:DIRECTIVE_LIVE_MODEL_CALL_BUDGET='unlimited'
  node tools\\scripts\\run-continuity-matrix-five-user-soak.mjs --live --turn-limit 2 --write-artifacts

Full certification:
  Omit --turn-limit and DIRECTIVE_SOAK_TURN_LIMIT. The coordinator then runs the
  full 52-turn live campaign soak once per lane/user.

Options:
  --live              Run live SillyTavern readiness and lane soaks.
  --write-artifacts   Write report.json, summary.md, and live-log.jsonl.
  --skip-readiness    Skip the five-user isolation preflight.
  --resume            Reuse matching completed lane artifacts for this run id.
  --turn-limit N      Bound each lane to N turns; produces a warning.
  --lanes a,b         Run lane ids or user handles matching the policy.
`;
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    help: false,
    live: false,
    writeArtifacts: false,
    skipReadiness: false,
    resume: false,
    turnLimit: DEFAULT_TURN_LIMIT,
    laneFilter: []
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--live') options.live = true;
    else if (arg === '--write-artifacts') options.writeArtifacts = true;
    else if (arg === '--skip-readiness') options.skipReadiness = true;
    else if (arg === '--resume') options.resume = true;
    else if (arg === '--turn-limit') {
      options.turnLimit = String(argv[index + 1] || '').trim();
      index += 1;
    } else if (arg.startsWith('--turn-limit=')) {
      options.turnLimit = arg.slice('--turn-limit='.length).trim();
    } else if (arg === '--lanes') {
      options.laneFilter = parseList(argv[index + 1] || '');
      index += 1;
    } else if (arg.startsWith('--lanes=')) {
      options.laneFilter = parseList(arg.slice('--lanes='.length));
    }
  }
  if (process.env.DIRECTIVE_CPM_FIVE_USER_SOAK_LIVE === '1') options.live = true;
  if (process.env.DIRECTIVE_CPM_FIVE_USER_SOAK_WRITE === '1') options.writeArtifacts = true;
  if (process.env.DIRECTIVE_CPM_FIVE_USER_SOAK_RESUME === '1') options.resume = true;
  if (!options.turnLimit && process.env.DIRECTIVE_SOAK_TURN_LIMIT) {
    options.turnLimit = String(process.env.DIRECTIVE_SOAK_TURN_LIMIT || '').trim();
  }
  return options;
}

function parseList(value = '') {
  return String(value || '')
    .split(',')
    .map((part) => normalizeId(part))
    .filter(Boolean);
}

function normalizeId(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '');
}

function envPasswordKey(handle) {
  const suffix = String(handle || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return suffix ? `DIRECTIVE_SOAK_ST_PASSWORD_${suffix}` : null;
}

function configuredUsers(raw = process.env.DIRECTIVE_SOAK_ST_USERS || process.env.DIRECTIVE_PARALLEL_SOAK_USERS || '') {
  const text = String(raw || '').trim();
  if (!text) return [];
  let entries = [];
  if (text.startsWith('[')) {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error('DIRECTIVE_SOAK_ST_USERS JSON must be an array.');
    entries = parsed;
  } else {
    entries = text.split(',').map((part) => part.trim()).filter(Boolean);
  }
  return entries.map((entry, index) => {
    if (typeof entry === 'string') {
      const colon = entry.indexOf(':');
      const handle = normalizeId(colon > 0 ? entry.slice(0, colon) : entry);
      const passwordKey = envPasswordKey(handle);
      return {
        handle,
        password: colon > 0 ? entry.slice(colon + 1) : process.env[passwordKey] || process.env.DIRECTIVE_SOAK_ST_PASSWORD || '',
        index
      };
    }
    const handle = normalizeId(entry?.handle || entry?.username || entry?.user || '');
    const passwordKey = envPasswordKey(handle);
    return {
      handle,
      password: entry?.password || process.env[passwordKey] || process.env.DIRECTIVE_SOAK_ST_PASSWORD || '',
      index
    };
  }).filter((entry) => entry.handle);
}

function redactUser(user) {
  return {
    handle: user?.handle || null,
    passwordConfigured: Boolean(user?.password)
  };
}

export function buildContinuityMatrixLanes({
  policy = SOAK_PARALLEL_WORKER_POLICY,
  users = configuredUsers(),
  laneFilter = []
} = {}) {
  const userByHandle = new Map(users.map((user) => [user.handle, user]));
  const filter = new Set((laneFilter || []).map((entry) => normalizeId(entry)).filter(Boolean));
  const lanes = (policy?.lanes || []).map((lane) => {
    const handle = normalizeId(lane.userHandle);
    const configured = userByHandle.get(handle) || { handle, password: '' };
    return {
      id: normalizeId(lane.id),
      userHandle: handle,
      focus: lane.focus || '',
      stopPolicy: lane.stopPolicy || '',
      user: configured,
      userConfigured: userByHandle.has(handle)
    };
  }).filter((lane) => {
    if (!filter.size) return true;
    return filter.has(lane.id) || filter.has(lane.userHandle);
  });
  return lanes;
}

function artifactPaths({ rootDir, runId }) {
  const root = path.resolve(rootDir, runId);
  return {
    root,
    report: path.join(root, 'report.json'),
    summary: path.join(root, 'summary.md'),
    liveLog: path.join(root, 'live-log.jsonl'),
    lanes: path.join(root, 'lanes'),
    readiness: path.join(root, 'readiness')
  };
}

function statusRank(status) {
  if (status === 'fail') return 3;
  if (status === 'warning') return 2;
  if (status === 'skipped') return 1;
  return 0;
}

function worstStatus(statuses) {
  return statuses.reduce((current, next) => (statusRank(next) > statusRank(current) ? next : current), 'pass');
}

function reportCheck(id, status, summary, details = null) {
  return { id, status, summary, details };
}

function coordinatorLog(paths, options, record = {}) {
  if (!options?.writeArtifacts || !paths?.liveLog) return;
  appendJsonLine(paths.liveLog, {
    kind: record.kind || 'continuity-matrix-coordinator',
    recordedAt: new Date().toISOString(),
    ...record
  });
}

function installSignalHandlers(paths, options) {
  if (signalHandlersInstalled || !options?.writeArtifacts) return;
  signalHandlersInstalled = true;
  signalLogPath = paths.liveLog;
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      appendJsonLine(signalLogPath, {
        kind: 'operator-stop',
        status: 'interrupted',
        recordedAt: new Date().toISOString(),
        signal,
        activeAction: activeMaterialAction,
        activeChildPid: activeChildProcess?.pid || null
      });
      try {
        activeChildProcess?.kill?.(signal);
      } catch {
        // Best effort only; the parent evidence log is the critical artifact.
      }
      process.exit(signal === 'SIGINT' ? 130 : 143);
    });
  }
}

function parseChildJson(stdout) {
  const text = String(stdout || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first < 0 || last <= first) return null;
    try {
      return JSON.parse(text.slice(first, last + 1));
    } catch {
      return null;
    }
  }
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function listJsonFiles(directory) {
  if (!directory || !fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter((fileName) => fileName.endsWith('.json'))
    .map((fileName) => path.join(directory, fileName))
    .sort();
}

function latestJsonFile(directory) {
  return listJsonFiles(directory).at(-1) || null;
}

function relativePathFrom(root, target) {
  if (!target) return null;
  return path.relative(root, target).replace(/\\/g, '/');
}

export function summarizePromptInspectionArtifact({
  artifactRoot,
  requiredSourceIds = CONTINUITY_MATRIX_REQUIRED_SOURCE_IDS,
  requiredPromptKeys = CONTINUITY_MATRIX_REQUIRED_PROMPT_KEYS
} = {}) {
  const promptDirectory = artifactRoot ? path.join(artifactRoot, 'prompt-inspection') : '';
  const filePath = latestJsonFile(promptDirectory);
  if (!filePath) {
    return {
      status: 'fail',
      file: null,
      blockCount: 0,
      promptKeys: [],
      sourceIds: [],
      requiredSourceIds: [...requiredSourceIds],
      presentSourceIds: [],
      missingSourceIds: [...requiredSourceIds],
      requiredPromptKeys: [...requiredPromptKeys],
      presentPromptKeys: [],
      missingPromptKeys: [...requiredPromptKeys]
    };
  }

  const json = readJsonIfExists(filePath) || {};
  const promptInspection = json.promptInspection || json;
  const blocks = Array.isArray(promptInspection.blocks) ? promptInspection.blocks : [];
  const promptKeys = [...new Set(blocks.map((block) => block.promptKey || block.key).filter(Boolean))].sort();
  const sourceIds = [...new Set(blocks.flatMap((block) => Array.isArray(block.sourceIds) ? block.sourceIds : []).filter(Boolean))].sort();
  const presentSourceIds = requiredSourceIds.filter((id) => sourceIds.includes(id));
  const missingSourceIds = requiredSourceIds.filter((id) => !sourceIds.includes(id));
  const presentPromptKeys = requiredPromptKeys.filter((key) => promptKeys.includes(key));
  const missingPromptKeys = requiredPromptKeys.filter((key) => !promptKeys.includes(key));
  return {
    status: missingSourceIds.length || missingPromptKeys.length ? 'fail' : 'pass',
    file: relativePathFrom(artifactRoot, filePath),
    revision: promptInspection.revision || null,
    blockCount: promptInspection.blockCount || blocks.length,
    promptKeys,
    sourceIds,
    requiredSourceIds: [...requiredSourceIds],
    presentSourceIds,
    missingSourceIds,
    requiredPromptKeys: [...requiredPromptKeys],
    presentPromptKeys,
    missingPromptKeys
  };
}

function factCheckFiles(artifactRoot) {
  const root = artifactRoot ? path.join(artifactRoot, 'fact-checks') : '';
  if (!root || !fs.existsSync(root)) return [];
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(root, entry.name, 'fact-check.json');
    if (fs.existsSync(candidate)) files.push(candidate);
  }
  return files.sort();
}

function addCounts(target, source = {}) {
  for (const [key, value] of Object.entries(source || {})) {
    if (typeof value !== 'number') continue;
    target[key] = (target[key] || 0) + value;
  }
}

export function summarizeFactualGroundingArtifacts({ artifactRoot } = {}) {
  const files = factCheckFiles(artifactRoot);
  const counts = {};
  const checks = [];
  for (const filePath of files) {
    const json = readJsonIfExists(filePath) || {};
    addCounts(counts, json.counts || {});
    checks.push({
      id: path.basename(path.dirname(filePath)),
      status: json.status || 'unknown',
      counts: json.counts || {},
      badFindingCount: (json.results || []).filter((entry) => ['contradicted', 'omitted', 'unsupported-detail'].includes(entry.verdict)).length,
      artifact: relativePathFrom(artifactRoot, filePath)
    });
  }
  const badCount = (counts.contradicted || 0) + (counts.omitted || 0) + (counts.unsupportedDetail || 0);
  const failedChecks = checks.filter((entry) => entry.status === 'fail');
  const warningChecks = checks.filter((entry) => entry.status === 'warning' || entry.badFindingCount > 0);
  return {
    status: files.length === 0 ? 'fail' : failedChecks.length ? 'fail' : warningChecks.length || badCount > 0 ? 'warning' : 'pass',
    checkCount: checks.length,
    counts,
    badCount,
    checks
  };
}

function expectedFactCheckCountForTurnLimit(turnLimit) {
  if (turnLimit === undefined) return null;
  return (requestedTurnLimitValue(turnLimit) || SOAK_TURN_SCRIPT.length) + 1;
}

export function summarizeLaneArtifactCompleteness({ artifactRoot, turnLimit } = {}) {
  const requiredFiles = [
    'report.json',
    'summary.md',
    'live-log.jsonl',
    'fact-checks/canary-index.json',
    'transcript/readable-chat.md'
  ];
  const missingFiles = requiredFiles.filter((relative) => !fs.existsSync(path.join(artifactRoot || '', relative)));
  const promptFileCount = listJsonFiles(path.join(artifactRoot || '', 'prompt-inspection')).length;
  const factCheckCount = factCheckFiles(artifactRoot).length;
  const expectedFactCheckCount = expectedFactCheckCountForTurnLimit(turnLimit);
  const missingPromptInspection = promptFileCount === 0;
  const factCheckDepthMissing = expectedFactCheckCount !== null && factCheckCount < expectedFactCheckCount;
  return {
    status: missingFiles.length || missingPromptInspection || factCheckDepthMissing ? 'fail' : 'pass',
    requiredFiles,
    missingFiles,
    promptFileCount,
    factCheckCount,
    expectedFactCheckCount
  };
}

function summarizeChildReport({ artifactRoot } = {}) {
  const report = readJsonIfExists(artifactRoot ? path.join(artifactRoot, 'report.json') : '');
  if (!report) {
    return {
      status: 'fail',
      checks: [],
      warnings: [],
      failures: ['Lane report.json is missing.']
    };
  }
  return {
    status: report.status || 'unknown',
    runId: report.runId || null,
    mode: report.mode || null,
    checks: (report.checks || []).map((entry) => ({
      id: entry.id,
      status: entry.status,
      summary: entry.summary
    })),
    warnings: report.warnings || [],
    failures: report.failures || []
  };
}

export function summarizeContinuityMatrixLane({
  lane,
  child,
  artifactRoot,
  turnLimit
} = {}) {
  const childJson = child?.json || null;
  const resolvedArtifactRoot = artifactRoot || childJson?.artifactRoot || null;
  const childReport = summarizeChildReport({ artifactRoot: resolvedArtifactRoot });
  const promptInspection = summarizePromptInspectionArtifact({ artifactRoot: resolvedArtifactRoot });
  const factualGrounding = summarizeFactualGroundingArtifacts({ artifactRoot: resolvedArtifactRoot });
  const artifactCompleteness = summarizeLaneArtifactCompleteness({ artifactRoot: resolvedArtifactRoot, turnLimit });
  const processStatus = child?.exitCode === 0 ? 'pass' : 'fail';
  const laneStatus = worstStatus([
    processStatus,
    childReport.status === 'fail' ? 'fail' : childReport.status === 'warning' ? 'warning' : 'pass',
    promptInspection.status,
    factualGrounding.status,
    artifactCompleteness.status
  ]);
  return {
    id: lane.id,
    userHandle: lane.userHandle,
    focus: lane.focus,
    stopPolicy: lane.stopPolicy,
    status: laneStatus,
    process: {
      exitCode: child?.exitCode ?? null,
      signal: child?.signal || null,
      stdoutHash: sha256Text(child?.stdout || ''),
      stderrHash: sha256Text(child?.stderr || ''),
      stderrPreview: compact(child?.stderr || '', 500)
    },
    artifactRoot: resolvedArtifactRoot,
    report: childReport,
    artifactCompleteness,
    promptInspection,
    factualGrounding
  };
}

function buildDryRunLane(lane) {
  return {
    id: lane.id,
    userHandle: lane.userHandle,
    focus: lane.focus,
    stopPolicy: lane.stopPolicy,
    status: 'planned',
    userConfigured: lane.userConfigured,
    user: redactUser(lane.user),
    requiredPromptKeys: [...CONTINUITY_MATRIX_REQUIRED_PROMPT_KEYS],
    requiredSourceIds: [...CONTINUITY_MATRIX_REQUIRED_SOURCE_IDS]
  };
}

function spawnChild(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: options.env || process.env,
      windowsHide: true
    });
    activeChildProcess = child;
    activeMaterialAction = options.action || null;
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      if (activeChildProcess === child) {
        activeChildProcess = null;
        activeMaterialAction = null;
      }
      resolve({
        exitCode: null,
        signal: null,
        stdout,
        stderr,
        error: errorSummary(error),
        json: null
      });
    });
    child.on('close', (exitCode, signal) => {
      if (activeChildProcess === child) {
        activeChildProcess = null;
        activeMaterialAction = null;
      }
      resolve({
        exitCode,
        signal,
        stdout,
        stderr,
        error: null,
        json: parseChildJson(stdout)
      });
    });
  });
}

function laneRunId(parentRunId, laneId) {
  return `${parentRunId}-${laneId}`.replace(/[^a-zA-Z0-9._-]+/g, '-');
}

function laneArtifactRoot(paths, laneId) {
  return path.join(paths.lanes, laneId);
}

function laneArtifactRootForRun(paths, runId, laneId) {
  return path.join(laneArtifactRoot(paths, laneId), laneRunId(runId, laneId));
}

function childEnvForLane({ lane, paths, runId, turnLimit }) {
  const laneUser = {
    handle: lane.userHandle,
    password: lane.user?.password || ''
  };
  const env = {
    ...process.env,
    DIRECTIVE_LIVE_CAMPAIGN_SOAK: '1',
    DIRECTIVE_SOAK_WRITE_ARTIFACTS: '1',
    DIRECTIVE_SILLYTAVERN_USER: lane.userHandle,
    DIRECTIVE_SOAK_ST_USERS: JSON.stringify([laneUser]),
    DIRECTIVE_SOAK_RUN_ID: laneRunId(runId, lane.id),
    DIRECTIVE_SOAK_ARTIFACT_DIR: laneArtifactRoot(paths, lane.id)
  };
  if (lane.user?.password && !env.DIRECTIVE_SILLYTAVERN_PASSWORD) {
    env.DIRECTIVE_SILLYTAVERN_PASSWORD = lane.user.password;
  }
  if (turnLimit) env.DIRECTIVE_SOAK_TURN_LIMIT = String(turnLimit);
  else delete env.DIRECTIVE_SOAK_TURN_LIMIT;
  return env;
}

function requestedTurnLimitValue(turnLimit) {
  const parsed = Number.parseInt(String(turnLimit || '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function laneReportTurnLimit(report = {}) {
  const turnLimitCheck = (report.checks || []).find((entry) => entry.id === 'live-execution-turn-limit');
  const value = turnLimitCheck?.details?.turnLimit ?? null;
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function laneArtifactTurnLimitMatches({ artifactRoot, turnLimit } = {}) {
  const report = readJsonIfExists(artifactRoot ? path.join(artifactRoot, 'report.json') : '');
  if (!report) return false;
  return laneReportTurnLimit(report) === requestedTurnLimitValue(turnLimit);
}

export function summarizeReusableContinuityMatrixLane({
  lane,
  artifactRoot,
  turnLimit
} = {}) {
  if (!artifactRoot || !fs.existsSync(path.join(artifactRoot, 'report.json'))) return null;
  if (!laneArtifactTurnLimitMatches({ artifactRoot, turnLimit })) return null;
  const summary = summarizeContinuityMatrixLane({
    lane,
    child: {
      exitCode: 0,
      signal: null,
      stdout: JSON.stringify({ status: 'reused', artifactRoot }),
      stderr: '',
      json: { status: 'reused', artifactRoot }
    },
    artifactRoot,
    turnLimit
  });
  if (
    summary.report?.status === 'fail'
    || summary.artifactCompleteness?.status !== 'pass'
    || summary.promptInspection?.status !== 'pass'
    || summary.factualGrounding?.status === 'fail'
  ) {
    return null;
  }
  return {
    ...summary,
    reused: true,
    process: {
      ...summary.process,
      reused: true
    }
  };
}

function readinessEnv({ paths, runId, users }) {
  return {
    ...process.env,
    DIRECTIVE_SOAK_RUN_ID: `${runId}-readiness`,
    DIRECTIVE_SOAK_ARTIFACT_DIR: paths.readiness,
    DIRECTIVE_SOAK_ST_USERS: JSON.stringify(users.map((user) => ({
      handle: user.handle,
      password: user.password || ''
    })))
  };
}

function summarizeReadiness(child, paths, runId) {
  const json = child?.json || null;
  const artifactRoot = json?.artifactRoot || path.join(paths.readiness, `${runId}-readiness`);
  const report = readJsonIfExists(path.join(artifactRoot, 'report.json'));
  const reportedStatus = report?.status || json?.status || null;
  const status = child?.exitCode !== 0 || reportedStatus === 'fail'
    ? 'fail'
    : reportedStatus === 'warning'
      ? 'warning'
      : 'pass';
  return {
    status,
    artifactRoot,
    process: {
      exitCode: child?.exitCode ?? null,
      signal: child?.signal || null,
      stdoutHash: sha256Text(child?.stdout || ''),
      stderrHash: sha256Text(child?.stderr || ''),
      stderrPreview: compact(child?.stderr || '', 500)
    },
    report: report
      ? {
        runId: report.runId || null,
        status: report.status || null,
        checks: (report.checks || []).map((entry) => ({
          id: entry.id,
          status: entry.status,
          summary: entry.summary
        })),
        failures: report.failures || [],
        warnings: report.warnings || []
      }
      : null
  };
}

function aggregateChecks({ options, lanes, readiness, laneSummaries }) {
  const checks = [];
  checks.push(reportCheck(
    'five-user-lane-policy',
    lanes.length === 5 ? 'pass' : 'warning',
    lanes.length === 5
      ? 'Five configured Continuity Matrix soak lanes are selected.'
      : `${lanes.length} Continuity Matrix soak lane(s) are selected.`,
    { laneIds: lanes.map((lane) => lane.id), userHandles: lanes.map((lane) => lane.userHandle) }
  ));
  checks.push(reportCheck(
    'non-human-soak-users',
    lanes.every((lane) => lane.userHandle && !RESERVED_HUMAN_ONLY_USERS.has(lane.userHandle)) ? 'pass' : 'fail',
    'Selected lanes use non-human SillyTavern soak accounts.',
    { userHandles: lanes.map((lane) => lane.userHandle) }
  ));
  checks.push(reportCheck(
    'live-readiness',
    !options.live
      ? 'skipped'
      : options.skipReadiness
        ? 'warning'
        : readiness?.status === 'pass'
          ? 'pass'
          : readiness?.status === 'warning'
            ? 'warning'
            : 'fail',
    !options.live
      ? 'Live readiness skipped in dry-run mode.'
      : options.skipReadiness
        ? 'Live readiness was explicitly skipped.'
        : readiness?.status === 'pass'
          ? 'Five-user SillyTavern isolation readiness passed.'
          : readiness?.status === 'warning'
            ? 'Five-user SillyTavern isolation readiness completed with warnings.'
            : 'Five-user SillyTavern isolation readiness failed.',
    readiness ? { artifactRoot: readiness.artifactRoot } : null
  ));
  checks.push(reportCheck(
    'turn-depth',
    !options.live ? 'skipped' : options.turnLimit ? 'warning' : 'pass',
    !options.live
      ? 'Turn-depth check skipped in dry-run mode.'
      : options.turnLimit
        ? `Each lane is limited to ${options.turnLimit} turn(s); this is bounded proof, not full certification.`
        : 'Each lane will run the full 52-turn campaign soak.',
    { turnLimit: options.turnLimit || null }
  ));
  const promptMissing = laneSummaries.filter((lane) => lane.promptInspection?.status !== 'pass');
  checks.push(reportCheck(
    'continuity-prompt-source-proof',
    !options.live ? 'skipped' : promptMissing.length ? 'fail' : 'pass',
    !options.live
      ? 'Prompt source proof skipped in dry-run mode.'
      : promptMissing.length
        ? `${promptMissing.length} lane(s) are missing required CPM prompt keys or source ids.`
        : 'Every live lane exposed the required Continuity Matrix prompt keys and source ids.',
    { requiredPromptKeys: [...CONTINUITY_MATRIX_REQUIRED_PROMPT_KEYS], requiredSourceIds: [...CONTINUITY_MATRIX_REQUIRED_SOURCE_IDS] }
  ));
  const factualHardFailures = laneSummaries.filter((lane) => lane.factualGrounding?.status === 'fail');
  const factualWarnings = laneSummaries.filter((lane) => lane.factualGrounding?.status === 'warning');
  checks.push(reportCheck(
    'factual-grounding',
    !options.live ? 'skipped' : factualHardFailures.length ? 'fail' : factualWarnings.length ? 'warning' : 'pass',
    !options.live
      ? 'Factual grounding skipped in dry-run mode.'
      : factualHardFailures.length
        ? `${factualHardFailures.length} lane(s) failed factual-grounding checks.`
        : factualWarnings.length
          ? `${factualWarnings.length} lane(s) completed factual-grounding checks with warnings.`
        : 'Every live lane passed deterministic factual-grounding checks.',
    {
      totalFactChecks: laneSummaries.reduce((sum, lane) => sum + (lane.factualGrounding?.checkCount || 0), 0),
      totalBadFindings: laneSummaries.reduce((sum, lane) => sum + (lane.factualGrounding?.badCount || 0), 0)
    }
  ));
  const artifactFailures = laneSummaries.filter((lane) => lane.artifactCompleteness?.status === 'fail');
  checks.push(reportCheck(
    'lane-artifact-completeness',
    !options.live ? 'skipped' : artifactFailures.length ? 'fail' : 'pass',
    !options.live
      ? 'Lane artifact completeness skipped in dry-run mode.'
      : artifactFailures.length
        ? `${artifactFailures.length} lane(s) are missing required certification artifacts.`
        : 'Every live lane wrote the required certification artifacts.',
    {
      lanes: laneSummaries.map((lane) => ({
        id: lane.id,
        status: lane.artifactCompleteness?.status || 'missing',
        factCheckCount: lane.artifactCompleteness?.factCheckCount || 0,
        expectedFactCheckCount: lane.artifactCompleteness?.expectedFactCheckCount ?? null,
        promptFileCount: lane.artifactCompleteness?.promptFileCount || 0,
        missingFiles: lane.artifactCompleteness?.missingFiles || []
      }))
    }
  ));
  const laneFailures = laneSummaries.filter((lane) => lane.status === 'fail');
  const laneWarnings = laneSummaries.filter((lane) => lane.status === 'warning');
  checks.push(reportCheck(
    'lane-results',
    !options.live ? 'skipped' : laneFailures.length ? 'fail' : laneWarnings.length ? 'warning' : 'pass',
    !options.live
      ? 'Lane execution skipped in dry-run mode.'
      : laneFailures.length
        ? `${laneFailures.length} lane(s) failed.`
        : laneWarnings.length
          ? `${laneWarnings.length} lane(s) completed with warnings.`
          : 'All selected lanes completed successfully.',
    {
      laneStatuses: laneSummaries.map((lane) => ({ id: lane.id, userHandle: lane.userHandle, status: lane.status }))
    }
  ));
  return checks;
}

function buildSummaryMarkdown(report) {
  const lines = [
    '# Continuity Projection Matrix Five-User Soak',
    '',
    `Run: ${report.runId}`,
    `Status: ${report.status}`,
    `Mode: ${report.mode}`,
    ''
  ];
  lines.push('## Checks', '');
  for (const check of report.checks) {
    lines.push(`- ${check.status}: ${check.id} - ${check.summary}`);
  }
  lines.push('', '## Lanes', '');
  for (const lane of report.lanes) {
    const reuseLabel = lane.reused === true ? ' reused' : '';
    lines.push(`- ${lane.status}: ${lane.id} (${lane.userHandle})${reuseLabel}`);
    if (lane.artifactRoot) lines.push(`  - artifactRoot: ${lane.artifactRoot}`);
    if (lane.promptInspection?.presentSourceIds) {
      lines.push(`  - sourceIds: ${lane.promptInspection.presentSourceIds.join(', ') || 'none'}`);
    }
    if (lane.factualGrounding?.counts) {
      const counts = lane.factualGrounding.counts;
      lines.push(`  - factualGrounding: contradicted=${counts.contradicted || 0}, omitted=${counts.omitted || 0}, unsupportedDetail=${counts.unsupportedDetail || 0}`);
    }
  }
  if (report.warnings.length) {
    lines.push('', '## Warnings', '');
    for (const warning of report.warnings) lines.push(`- ${warning}`);
  }
  if (report.failures.length) {
    lines.push('', '## Failures', '');
    for (const failure of report.failures) lines.push(`- ${failure}`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function finalStatus({ checks, options }) {
  if (!options.live) return 'planned';
  if (checks.some((entry) => entry.status === 'fail')) return 'fail';
  if (checks.some((entry) => entry.status === 'warning')) return 'warning';
  return 'pass';
}

async function runLiveCoordinator({ options, lanes, paths, runId }) {
  const laneSummaries = [];
  let readiness = null;
  coordinatorLog(paths, options, {
    kind: 'run-start',
    status: 'started',
    runId,
    laneCount: lanes.length,
    turnLimit: options.turnLimit || null,
    resume: options.resume === true
  });
  if (!options.skipReadiness) {
    const users = lanes.map((lane) => lane.user);
    coordinatorLog(paths, options, {
      kind: 'readiness-start',
      status: 'started',
      runId,
      userHandles: users.map((user) => user.handle)
    });
    const child = await spawnChild(
      process.execPath,
      ['tools/scripts/check-sillytavern-multi-user-soak-readiness.mjs', '--live', '--write-artifacts'],
      { env: readinessEnv({ paths, runId, users }), action: { kind: 'readiness', runId } }
    );
    readiness = summarizeReadiness(child, paths, runId);
    coordinatorLog(paths, options, {
      kind: 'readiness-end',
      status: readiness.status,
      runId,
      artifactRoot: readiness.artifactRoot,
      exitCode: child.exitCode,
      signal: child.signal || null
    });
  }

  for (const lane of lanes) {
    const reusableArtifactRoot = laneArtifactRootForRun(paths, runId, lane.id);
    coordinatorLog(paths, options, {
      kind: 'lane-assigned',
      status: 'assigned',
      runId,
      laneId: lane.id,
      userHandle: lane.userHandle,
      artifactRoot: reusableArtifactRoot
    });
    if (options.resume) {
      const reusable = summarizeReusableContinuityMatrixLane({
        lane,
        artifactRoot: reusableArtifactRoot,
        turnLimit: options.turnLimit
      });
      if (reusable) {
        laneSummaries.push(reusable);
        coordinatorLog(paths, options, {
          kind: 'lane-reused',
          status: reusable.status,
          runId,
          laneId: lane.id,
          userHandle: lane.userHandle,
          artifactRoot: reusable.artifactRoot
        });
        continue;
      }
    }
    const env = childEnvForLane({ lane, paths, runId, turnLimit: options.turnLimit });
    coordinatorLog(paths, options, {
      kind: 'lane-start',
      status: 'started',
      runId,
      laneId: lane.id,
      userHandle: lane.userHandle,
      artifactRoot: reusableArtifactRoot
    });
    const child = await spawnChild(
      process.execPath,
      ['tools/scripts/soak-sillytavern-campaign-live.mjs', '--write-artifacts'],
      { env, action: { kind: 'lane', runId, laneId: lane.id, userHandle: lane.userHandle, artifactRoot: reusableArtifactRoot } }
    );
    const artifactRoot = child.json?.artifactRoot || laneArtifactRootForRun(paths, runId, lane.id);
    const laneSummary = summarizeContinuityMatrixLane({ lane, child, artifactRoot, turnLimit: options.turnLimit || null });
    laneSummaries.push(laneSummary);
    coordinatorLog(paths, options, {
      kind: 'lane-end',
      status: laneSummary.status,
      runId,
      laneId: lane.id,
      userHandle: lane.userHandle,
      artifactRoot: laneSummary.artifactRoot,
      exitCode: child.exitCode,
      signal: child.signal || null,
      promptStatus: laneSummary.promptInspection.status,
      factualStatus: laneSummary.factualGrounding.status,
      artifactStatus: laneSummary.artifactCompleteness.status
    });
  }
  return { readiness, laneSummaries };
}

function buildReport({
  runId,
  mode,
  options,
  paths,
  lanes,
  readiness = null,
  laneSummaries = []
}) {
  const checks = aggregateChecks({ options, lanes, readiness, laneSummaries });
  const warnings = checks.filter((entry) => entry.status === 'warning').map((entry) => entry.summary);
  const failures = checks.filter((entry) => entry.status === 'fail').map((entry) => entry.summary);
  return {
    kind: 'directive.continuityProjectionMatrix.fiveUserSoakReport',
    runId,
    generatedAt: new Date().toISOString(),
    status: finalStatus({ checks, options }),
    mode,
    artifactRoot: paths.root,
    options: {
      live: options.live,
      turnLimit: options.turnLimit || null,
      skipReadiness: options.skipReadiness,
      resume: options.resume,
      laneFilter: options.laneFilter
    },
    policy: {
      strategy: SOAK_PARALLEL_WORKER_POLICY.strategy,
      requiredPromptKeys: [...CONTINUITY_MATRIX_REQUIRED_PROMPT_KEYS],
      requiredSourceIds: [...CONTINUITY_MATRIX_REQUIRED_SOURCE_IDS]
    },
    checks,
    readiness,
    lanes: options.live ? laneSummaries : lanes.map(buildDryRunLane),
    warnings,
    failures
  };
}

function writeCoordinatorArtifacts(report, paths) {
  ensureDirectory(paths.root);
  writeJsonFile(paths.report, report);
  writeTextFile(paths.summary, buildSummaryMarkdown(report));
  appendJsonLine(paths.liveLog, {
    kind: 'run-end',
    runId: report.runId,
    status: report.status,
    mode: report.mode,
    laneCount: report.lanes.length,
    checkStatuses: report.checks.map((entry) => ({ id: entry.id, status: entry.status })),
    reusedLaneCount: report.lanes.filter((lane) => lane.reused === true).length,
    artifactRoot: report.artifactRoot
  });
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    console.log(usage());
    return;
  }

  const runId = process.env.DIRECTIVE_CPM_FIVE_USER_SOAK_RUN_ID || createRunId();
  const rootDir = process.env.DIRECTIVE_CPM_FIVE_USER_SOAK_ARTIFACT_DIR || CONTINUITY_MATRIX_FIVE_USER_ARTIFACT_ROOT;
  const paths = artifactPaths({ rootDir, runId });
  const users = configuredUsers();
  const lanes = buildContinuityMatrixLanes({ users, laneFilter: options.laneFilter });
  const mode = options.live ? 'live' : 'dry-run';
  let readiness = null;
  let laneSummaries = [];

  if (options.writeArtifacts) {
    ensureArtifactTree({
      root: paths.root,
      snapshots: path.join(paths.root, 'snapshots'),
      transcript: path.join(paths.root, 'transcript'),
      screenshots: path.join(paths.root, 'screenshots'),
      playwright: path.join(paths.root, 'playwright'),
      promptInspection: path.join(paths.root, 'prompt-inspection'),
      storage: path.join(paths.root, 'storage'),
      campaignMatrix: path.join(paths.root, 'campaign-matrix'),
      objectiveAssignments: path.join(paths.root, 'objective-assignments'),
      factChecks: path.join(paths.root, 'fact-checks'),
      qualityReview: path.join(paths.root, 'quality-review'),
      sceneHandshake: path.join(paths.root, 'scene-handshake'),
      timekeeping: path.join(paths.root, 'timekeeping'),
      endConditions: path.join(paths.root, 'end-conditions'),
      parallelUsers: path.join(paths.root, 'parallel-users'),
      discovery: path.join(paths.root, 'discovery')
    });
    ensureDirectory(paths.lanes);
    ensureDirectory(paths.readiness);
    installSignalHandlers(paths, options);
  }

  if (options.live) {
    const result = await runLiveCoordinator({ options, lanes, paths, runId });
    readiness = result.readiness;
    laneSummaries = result.laneSummaries;
  }

  const report = buildReport({ runId, mode, options, paths, lanes, readiness, laneSummaries });
  if (options.writeArtifacts) writeCoordinatorArtifacts(report, paths);
  console.log(JSON.stringify({
    ok: report.status !== 'fail',
    status: report.status,
    runId: report.runId,
    mode: report.mode,
    artifactRoot: options.writeArtifacts ? report.artifactRoot : null,
    checks: report.checks.map((entry) => ({
      id: entry.id,
      status: entry.status,
      summary: compact(entry.summary, 160)
    })),
    lanes: report.lanes.map((lane) => ({
      id: lane.id,
      userHandle: lane.userHandle,
      status: lane.status,
      reused: lane.reused === true,
      artifactRoot: lane.artifactRoot || null
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
