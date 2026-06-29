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
  externalContextFixtureDepthCheckStatus,
  summarizeExternalContextFixtureDepth,
  writeJsonFile,
  writeTextFile
} from './lib/sillytavern-live-harness.mjs';
import {
  SOAK_PARALLEL_WORKER_POLICY,
  SOAK_TURN_SCRIPT
} from './soak-sillytavern-campaign-live.mjs';
import {
  assessStoryQualityReviewResult
} from './replay-story-quality-review-preflight.mjs';
import {
  summarizeModelCallFailurePolicy
} from './lib/model-call-failure-policy.mjs';

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

const EXTERNAL_CONTEXT_TARGET_IDS = Object.freeze([
  'stLorebooks',
  'memoryBooks',
  'summaryception',
  'vectFox'
]);

const RESERVED_HUMAN_ONLY_USERS = new Set(['default-user']);
const DEFAULT_TURN_LIMIT = '';
let signalHandlersInstalled = false;
let signalLogPath = null;
const activeChildProcesses = new Set();
const activeMaterialActions = new Map();

function usage() {
  return `Directive Continuity Projection Matrix five-user soak coordinator

Dry run:
  node tools\\scripts\\run-continuity-matrix-five-user-soak.mjs --write-artifacts

Bounded live proof:
  $env:SILLYTAVERN_BASE_URL='http://127.0.0.1:8000'
  $env:DIRECTIVE_SOAK_ST_USERS='directive-soak-a,directive-soak-b,directive-soak-c,directive-soak-d,directive-soak-e'
  $env:DIRECTIVE_LIVE_MODEL_CALL_BUDGET='unlimited'
  node tools\\scripts\\run-continuity-matrix-five-user-soak.mjs --live --turn-limit 3 --write-artifacts

Full certification:
  Omit --turn-limit and DIRECTIVE_SOAK_TURN_LIMIT. The coordinator then runs the
  full 52-turn live campaign soak concurrently once per lane/user.

Options:
  --live              Run live SillyTavern readiness and lane soaks.
  --write-artifacts   Write report.json, summary.md, and live-log.jsonl.
  --skip-readiness    Skip the five-user isolation preflight.
  --activate-external-context-fixture
                      Ask live readiness to activate the prepared rich fixture chat.
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
    activateExternalContextFixture: false,
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
    else if (arg === '--activate-external-context-fixture') options.activateExternalContextFixture = true;
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
  if (process.env.DIRECTIVE_SOAK_ACTIVATE_EXTERNAL_CONTEXT_FIXTURE === '1') options.activateExternalContextFixture = true;
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

export function coordinatorReadinessUsers({ configured = [], lanes = [] } = {}) {
  const configuredUsersList = Array.isArray(configured)
    ? configured.filter((entry) => entry?.handle)
    : [];
  if (configuredUsersList.length) return configuredUsersList;
  return (Array.isArray(lanes) ? lanes : [])
    .map((lane) => lane?.user)
    .filter((entry) => entry?.handle);
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
    readiness: path.join(root, 'readiness'),
    hostExtensions: path.join(root, 'host-extensions')
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
        activeChildren: [...activeChildProcesses].map((child) => ({
          pid: child?.pid || null,
          action: activeMaterialActions.get(child) || null
        }))
      });
      for (const child of activeChildProcesses) {
        try {
          child?.kill?.(signal);
        } catch {
          // Best effort only; the parent evidence log is the critical artifact.
        }
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

function externalRefFromPromptInspection(artifact = {}, promptInspection = {}) {
  return promptInspection.externalPromptEnvironmentRef
    || promptInspection.externalEnvironmentRef
    || promptInspection.cacheRecord?.externalPromptEnvironmentRef
    || artifact.externalPromptEnvironmentRef
    || artifact.externalContext?.externalPromptEnvironmentRef
    || null;
}

function externalPromptKeysFromPromptInspection(artifact = {}, promptInspection = {}) {
  const ref = externalRefFromPromptInspection(artifact, promptInspection);
  const values = [
    ...(Array.isArray(ref?.knownExternalPromptKeys) ? ref.knownExternalPromptKeys : []),
    ...(Array.isArray(promptInspection.knownExternalPromptKeys) ? promptInspection.knownExternalPromptKeys : []),
    ...(Array.isArray(promptInspection.externalPromptKeys) ? promptInspection.externalPromptKeys : []),
    ...(Array.isArray(promptInspection.externalPromptKeysObserved) ? promptInspection.externalPromptKeysObserved : []),
    ...(Array.isArray(artifact.knownExternalPromptKeys) ? artifact.knownExternalPromptKeys : []),
    ...(Array.isArray(artifact.externalPromptKeys) ? artifact.externalPromptKeys : [])
  ];
  return [...new Set(values.filter((value) => value && !String(value).startsWith('directive.')).map(String))].sort();
}

function targetEvidenceFromPromptInspection(promptInspection = {}, knownExternalPromptKeys = []) {
  const targets = promptInspection.externalPromptEnvironmentTargets || promptInspection.externalTargets || {};
  const keys = knownExternalPromptKeys.map((key) => String(key || ''));
  const worldInfoKey = keys.some((key) => (
    key === 'worldInfoBefore'
    || key === 'worldInfoAfter'
    || /^customDepthWI_/i.test(key)
    || /^customWIOutlet_/i.test(key)
    || key === '2_floating_prompt'
  ));
  const summaryceptionKey = keys.includes('summaryception');
  const vectFoxKey = keys.some((key) => /^3_vectfox/i.test(key));
  const memoryBooksActive = targets.memoryBooks?.active === true
    || targets.memoryBooks?.enabled === true
    || Number(targets.memoryBooks?.entryCount || 0) > 0;
  const memoryBooksRangeStatus = targets.memoryBooks?.rangeDiagnostics?.status || null;
  const summaryceptionStalenessStatus = targets.summaryception?.staleness?.status || null;
  const vectFoxBackendStatus = targets.vectFox?.backendDiagnostics?.status || null;
  const usefulStatus = (status, blocked = ['unknown', 'missing']) => {
    const normalized = String(status || '').trim().toLowerCase();
    return Boolean(normalized && !blocked.includes(normalized));
  };
  const diagnostics = {
    memoryBooks: {
      rangeStatus: memoryBooksRangeStatus,
      rangeDiagnosticPresent: usefulStatus(memoryBooksRangeStatus)
    },
    summaryception: {
      stalenessStatus: summaryceptionStalenessStatus,
      stalenessDiagnosticPresent: usefulStatus(summaryceptionStalenessStatus)
    },
    vectFox: {
      backendStatus: vectFoxBackendStatus,
      backendDiagnosticPresent: usefulStatus(vectFoxBackendStatus, ['unknown', 'missing', 'unavailable'])
    }
  };
  return {
    stLorebooks: Boolean(worldInfoKey || targets.stLorebooks?.active || targets.stLorebooks?.enabled || targets.stLorebooks?.chatBound),
    memoryBooks: Boolean(memoryBooksActive && diagnostics.memoryBooks.rangeDiagnosticPresent),
    summaryception: Boolean((summaryceptionKey || targets.summaryception?.enabled || targets.summaryception?.promptKeyActive) && diagnostics.summaryception.stalenessDiagnosticPresent),
    vectFox: Boolean((vectFoxKey || targets.vectFox?.enabled || targets.vectFox?.generationInterceptorActive || targets.vectFox?.summarizerInjectionEnabled) && diagnostics.vectFox.backendDiagnosticPresent),
    diagnostics,
    finalHostPromptMayIncludeExternal: promptInspection.finalHostPromptMayIncludeExternal === true,
    redactionReasons: [...new Set((promptInspection.redactions || []).map((entry) => entry?.reason).filter(Boolean))].sort()
  };
}

function richFixturePressureFromCaptures(captures = []) {
  const targetCoverage = Object.fromEntries(EXTERNAL_CONTEXT_TARGET_IDS.map((targetId) => [
    targetId,
    captures.some((capture) => capture.targetEvidence?.[targetId] === true)
  ]));
  const missingTargets = EXTERNAL_CONTEXT_TARGET_IDS.filter((targetId) => !targetCoverage[targetId]);
  const finalHostPromptMayIncludeExternal = captures.some((capture) => capture.targetEvidence?.finalHostPromptMayIncludeExternal === true);
  const status = captures.length && missingTargets.length === 0 && finalHostPromptMayIncludeExternal ? 'pass' : 'fail';
  return {
    status,
    requiredTargets: [...EXTERNAL_CONTEXT_TARGET_IDS],
    targetCoverage,
    missingTargets,
    targetDiagnostics: Object.fromEntries(EXTERNAL_CONTEXT_TARGET_IDS.map((targetId) => [
      targetId,
      captures
        .map((capture) => capture.targetEvidence?.diagnostics?.[targetId])
        .find(Boolean) || null
    ])),
    finalHostPromptMayIncludeExternal,
    redactionReasons: [...new Set(captures.flatMap((capture) => capture.targetEvidence?.redactionReasons || []))].sort()
  };
}

export function summarizeExternalContextPromptArtifact({ artifactRoot } = {}) {
  const promptDirectory = artifactRoot ? path.join(artifactRoot, 'prompt-inspection') : '';
  const filePath = latestJsonFile(promptDirectory);
  if (!filePath) {
    return {
      status: 'fail',
      file: null,
      externalPromptEnvironmentRef: null,
      knownExternalPromptKeys: [],
      directiveOwnedPromptKeys: [],
      finalHostPromptMayIncludeExternal: null,
      unavailableSignals: ['prompt-inspection-missing'],
      redactionReasons: []
    };
  }

  const artifact = readJsonIfExists(filePath) || {};
  const promptInspection = artifact.promptInspection || artifact;
  const blocks = Array.isArray(promptInspection.blocks) ? promptInspection.blocks : [];
  const directiveOwnedPromptKeys = [...new Set(blocks
    .map((block) => block.promptKey || block.key)
    .filter((key) => key && String(key).startsWith('directive.'))
    .map(String))].sort();
  const externalPromptEnvironmentRef = externalRefFromPromptInspection(artifact, promptInspection);
  const knownExternalPromptKeys = externalPromptKeysFromPromptInspection(artifact, promptInspection);
  const unavailableSignals = [
    ...(Array.isArray(promptInspection.unavailableSignals) ? promptInspection.unavailableSignals : []),
    ...(Array.isArray(artifact.unavailableSignals) ? artifact.unavailableSignals : []),
    ...(!externalPromptEnvironmentRef ? ['external-prompt-environment-ref-missing'] : []),
    ...(knownExternalPromptKeys.length ? [] : ['known-external-prompt-keys-missing'])
  ];
  const redactionReasons = [...new Set([
    ...(Array.isArray(promptInspection.redactions) ? promptInspection.redactions : []),
    ...(Array.isArray(artifact.redactions) ? artifact.redactions : [])
  ].map((entry) => entry?.reason).filter(Boolean))];
  const finalHostPromptMayIncludeExternal = promptInspection.finalHostPromptMayIncludeExternal
    ?? promptInspection.cacheRecord?.finalHostPromptMayIncludeExternal
    ?? artifact.finalHostPromptMayIncludeExternal
    ?? null;
  return {
    status: externalPromptEnvironmentRef && knownExternalPromptKeys.length ? 'pass' : 'fail',
    file: relativePathFrom(artifactRoot, filePath),
    externalPromptEnvironmentRef: externalPromptEnvironmentRef
      ? {
        kind: externalPromptEnvironmentRef.kind || null,
        hash: externalPromptEnvironmentRef.hash || null,
        byteLength: externalPromptEnvironmentRef.byteLength ?? null,
        status: externalPromptEnvironmentRef.status || null,
        observedAt: externalPromptEnvironmentRef.observedAt || null,
        knownExternalPromptKeys
      }
      : null,
    knownExternalPromptKeys,
    directiveOwnedPromptKeys,
    finalHostPromptMayIncludeExternal,
    unavailableSignals,
    redactionReasons
  };
}

function promptInspectionArtifacts(artifactRoot) {
  const promptDirectory = artifactRoot ? path.join(artifactRoot, 'prompt-inspection') : '';
  return listJsonFiles(promptDirectory)
    .map((filePath) => {
      const artifact = readJsonIfExists(filePath) || {};
      const promptInspection = artifact.promptInspection || artifact;
      return {
        filePath,
        artifact,
        promptInspection
      };
    });
}

function expectedGenerationPromptSnapshotCount(turnLimit) {
  if (turnLimit === undefined) return null;
  return requestedTurnLimitValue(turnLimit) || SOAK_TURN_SCRIPT.length;
}

export function summarizeExternalContextGenerationArtifacts({ artifactRoot, turnLimit } = {}) {
  const artifacts = promptInspectionArtifacts(artifactRoot);
  const generationArtifacts = artifacts.filter(({ artifact }) => artifact.reason === 'pre-generation');
  const expectedCaptureCount = expectedGenerationPromptSnapshotCount(turnLimit);
  const captures = generationArtifacts.map(({ filePath, artifact, promptInspection }) => {
    const externalPromptEnvironmentRef = externalRefFromPromptInspection(artifact, promptInspection);
    const knownExternalPromptKeys = externalPromptKeysFromPromptInspection(artifact, promptInspection);
    const targetEvidence = targetEvidenceFromPromptInspection(promptInspection, knownExternalPromptKeys);
    const unavailableSignals = [
      ...(Array.isArray(promptInspection.unavailableSignals) ? promptInspection.unavailableSignals : []),
      ...(Array.isArray(artifact.unavailableSignals) ? artifact.unavailableSignals : []),
      ...(!externalPromptEnvironmentRef ? ['external-prompt-environment-ref-missing'] : []),
      ...(knownExternalPromptKeys.length ? [] : ['known-external-prompt-keys-missing'])
    ];
    return {
      file: relativePathFrom(artifactRoot, filePath),
      scriptMessageId: artifact.scriptMessageId || null,
      scriptCategory: artifact.scriptCategory || null,
      chatLength: artifact.chatLength ?? null,
      status: externalPromptEnvironmentRef && knownExternalPromptKeys.length ? 'pass' : 'fail',
      refHash: externalPromptEnvironmentRef?.hash || null,
      refStatus: externalPromptEnvironmentRef?.status || null,
      knownExternalPromptKeys,
      targetEvidence,
      finalHostPromptMayIncludeExternal: promptInspection.finalHostPromptMayIncludeExternal
        ?? promptInspection.cacheRecord?.finalHostPromptMayIncludeExternal
        ?? artifact.finalHostPromptMayIncludeExternal
        ?? null,
      unavailableSignals
    };
  });
  const failedCaptures = captures.filter((capture) => capture.status !== 'pass');
  const captureDepthMissing = expectedCaptureCount !== null && captures.length < expectedCaptureCount;
  const status = captures.length === 0 || failedCaptures.length || captureDepthMissing ? 'fail' : 'pass';
  return {
    status,
    captureCount: captures.length,
    expectedCaptureCount,
    captureDepthMissing,
    failedCaptureCount: failedCaptures.length,
    knownExternalPromptKeys: [...new Set(captures.flatMap((capture) => capture.knownExternalPromptKeys || []))].sort(),
    refHashes: [...new Set(captures.map((capture) => capture.refHash).filter(Boolean))].sort(),
    richFixturePressure: richFixturePressureFromCaptures(captures),
    captures,
    unavailableSignals: [...new Set(captures.flatMap((capture) => capture.unavailableSignals || []))].sort(),
    summary: captures.length === 0
      ? 'No generation-time prompt-inspection snapshots were recorded.'
      : captureDepthMissing
        ? `Only ${captures.length} generation-time prompt-inspection snapshot(s) were recorded; expected ${expectedCaptureCount}.`
        : failedCaptures.length
          ? `${failedCaptures.length} generation-time prompt-inspection snapshot(s) are missing external-context refs or keys.`
          : `Recorded ${captures.length} generation-time external-context prompt snapshot(s).`
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

export function summarizeStoryQualityReviewArtifacts({ artifactRoot } = {}) {
  const report = readJsonIfExists(artifactRoot ? path.join(artifactRoot, 'report.json') : '');
  const check = (report?.checks || []).find((entry) => entry?.id === 'live-story-quality-transcript-review') || null;
  const checkDetails = check?.details || {};
  const storyReview = checkDetails.storyQualityReview || report?.storyQualityReview || null;
  const modelReview = checkDetails.modelAssistedReview || storyReview?.modelAssistedReview || null;
  const modelResultPath = modelReview?.resultPath
    ? path.join(artifactRoot || '', modelReview.resultPath)
    : path.join(artifactRoot || '', 'quality-review', 'model-assisted-review', 'result.json');
  const modelResult = readJsonIfExists(modelResultPath) || null;
  const modelStatus = modelResult?.status || modelReview?.status || null;
  const modelCall = modelResult?.modelCall || modelReview?.modelCall || null;
  const modelCounts = modelResult?.counts || modelReview?.counts || null;
  const providerOutputPath = modelReview?.providerOutputPath || null;
  const requestPath = modelReview?.requestPath || storyReview?.modelAssistedReviewRequestPathRelative || null;
  const resultPath = modelReview?.resultPath || storyReview?.modelAssistedReviewResultPathRelative || null;
  const absoluteRequestPath = requestPath
    ? path.join(artifactRoot || '', requestPath)
    : path.join(artifactRoot || '', 'quality-review', 'model-assisted-review', 'request.json');
  const modelAssessment = assessStoryQualityReviewResult({ requestPath: absoluteRequestPath });
  const deterministicStatus = storyReview?.status || check?.status || report?.storyQualityReview?.status || null;
  const deterministicScoreCount = Number(storyReview?.scoreCount || 0);
  const modelMissing = !modelStatus || modelStatus === 'not-run';
  const modelFailed = modelStatus === 'fail';
  const modelWarning = modelStatus === 'warning';
  const modelUnparseable = Boolean(modelResult?.reason && /not return parseable JSON|did not return parseable JSON/i.test(String(modelResult.reason)));
  const modelTimedOut = Boolean(
    modelCall?.errorCode
    && /timeout|timed|DIRECTIVE_GENERATION_TIMEOUT/i.test(String(modelCall.errorCode))
  ) || Boolean(
    modelResult?.reason
    && /timeout|timed out|DIRECTIVE_GENERATION_TIMEOUT/i.test(String(modelResult.reason))
  );
  const modelEvidenceInvalid = modelAssessment.validationFailed === true
    || modelAssessment.invalidStatus === true
    || (modelAssessment.status === 'fail' && modelAssessment.missing !== true && modelAssessment.timedOut !== true && modelFailed !== true);
  const status = !report || !check
    ? 'fail'
    : check.status === 'fail' || deterministicStatus === 'fail' || modelFailed || modelUnparseable || modelTimedOut || modelEvidenceInvalid
      ? 'fail'
      : modelMissing || modelWarning
        ? 'warning'
        : 'pass';
  return {
    status,
    checkStatus: check?.status || null,
    deterministicStatus,
    deterministicScoreCount,
    averageScore: storyReview?.averageScore ?? null,
    scoreZeroCount: storyReview?.scoreZeroCount ?? null,
    modelAssistedReview: {
      status: modelStatus,
      requestPath,
      resultPath,
      providerOutputPath,
      inputHash: modelReview?.inputHash || modelResult?.inputHash || null,
      counts: modelCounts,
      modelCall,
      reason: modelResult?.reason || null,
      missing: modelMissing,
      unparseable: modelUnparseable,
      timedOut: modelTimedOut,
      validationFailed: modelAssessment.validationFailed === true,
      validationIssues: modelAssessment.validationIssues || [],
      coverageStatus: modelAssessment.validationFailed === true ? 'fail' : modelAssessment.status,
      assessmentStatus: modelAssessment.status,
      assessmentReason: modelAssessment.reason || null
    },
    summary: !report
      ? 'Lane report.json is missing; story-quality review cannot be verified.'
      : !check
        ? 'Lane report is missing live-story-quality-transcript-review check.'
        : modelMissing
          ? 'Model-assisted story-quality review is missing or still not-run.'
          : modelTimedOut
          ? 'Model-assisted story-quality review timed out.'
          : modelUnparseable
            ? 'Model-assisted story-quality review did not return parseable JSON.'
            : modelEvidenceInvalid
              ? `Model-assisted story-quality review evidence is invalid: ${modelAssessment.reason || 'validation failed'}.`
              : `Story-quality review deterministic status ${deterministicStatus || 'unknown'} with model-assisted status ${modelStatus}.`
  };
}

function expectedFactCheckCountForTurnLimit(turnLimit) {
  if (turnLimit === undefined) return null;
  return (requestedTurnLimitValue(turnLimit) || SOAK_TURN_SCRIPT.length) + 1;
}

export function summarizeExternalContextSummaryArtifact({ artifactRoot } = {}) {
  const filePath = path.join(artifactRoot || '', 'host-extensions', 'external-context-summary.json');
  if (!filePath || !fs.existsSync(filePath)) {
    return {
      status: 'fail',
      present: false,
      file: 'host-extensions/external-context-summary.json',
      artifactStatus: null,
      captureCount: 0,
      knownExternalPromptKeys: [],
      refHashes: [],
      targetSummaryCount: 0,
      redactionReasons: [],
      finalHostPromptMayIncludeExternal: null,
      missingFields: ['file'],
      summary: 'External context summary artifact is missing.'
    };
  }
  let artifact = null;
  try {
    artifact = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return {
      status: 'fail',
      present: true,
      file: relativePathFrom(artifactRoot, filePath),
      artifactStatus: null,
      captureCount: 0,
      knownExternalPromptKeys: [],
      refHashes: [],
      targetSummaryCount: 0,
      redactionReasons: [],
      finalHostPromptMayIncludeExternal: null,
      missingFields: ['parseable-json'],
      summary: `External context summary artifact could not be parsed: ${compact(error.message || error, 160)}`
    };
  }
  const aggregate = artifact?.aggregate && typeof artifact.aggregate === 'object' ? artifact.aggregate : {};
  const knownExternalPromptKeys = Array.isArray(aggregate.knownExternalPromptKeys)
    ? aggregate.knownExternalPromptKeys.filter(Boolean).map(String)
    : [];
  const refHashes = Array.isArray(aggregate.refHashes)
    ? aggregate.refHashes.filter(Boolean).map(String)
    : [];
  const redactionReasons = Array.isArray(aggregate.redactionReasons)
    ? aggregate.redactionReasons.filter(Boolean).map(String)
    : [];
  const captureCount = Number(aggregate.captureCount || 0);
  const targetSummaryCount = Number(aggregate.targetSummaryCount || 0);
  const targetSummaries = Array.isArray(artifact.targetSummaries) ? artifact.targetSummaries : [];
  const presentTargetSummaries = new Set();
  for (const entry of targetSummaries) {
    const targets = entry?.targets && typeof entry.targets === 'object' ? entry.targets : {};
    for (const targetId of EXTERNAL_CONTEXT_TARGET_IDS) {
      if (targets[targetId] && typeof targets[targetId] === 'object') presentTargetSummaries.add(targetId);
    }
  }
  const missingTargetSummaries = EXTERNAL_CONTEXT_TARGET_IDS.filter((targetId) => !presentTargetSummaries.has(targetId));
  const missingFields = [];
  if (artifact.kind !== 'directive.sillytavern.externalContextSummary.v1') missingFields.push('kind');
  if (artifact.status !== 'pass') missingFields.push('status');
  if (artifact.authority?.directiveAuthority !== false) missingFields.push('authority.directiveAuthority');
  if (!artifact.authority?.role) missingFields.push('authority.role');
  if (!aggregate || typeof aggregate !== 'object') missingFields.push('aggregate');
  if (captureCount <= 0) missingFields.push('aggregate.captureCount');
  if (!knownExternalPromptKeys.length) missingFields.push('aggregate.knownExternalPromptKeys');
  if (!refHashes.length) missingFields.push('aggregate.refHashes');
  if (targetSummaryCount <= 0) missingFields.push('aggregate.targetSummaryCount');
  if (missingTargetSummaries.length) missingFields.push('targetSummaries.requiredTargets');
  const status = missingFields.length ? 'fail' : 'pass';
  return {
    status,
    present: true,
    file: relativePathFrom(artifactRoot, filePath),
    artifactStatus: artifact.status || null,
    captureCount,
    knownExternalPromptKeys,
    refHashes,
    targetSummaryCount,
    requiredTargetSummaries: [...EXTERNAL_CONTEXT_TARGET_IDS],
    presentTargetSummaries: [...presentTargetSummaries],
    missingTargetSummaries,
    redactionReasons,
    finalHostPromptMayIncludeExternal: aggregate.finalHostPromptMayIncludeExternal ?? null,
    authority: {
      directiveAuthority: artifact.authority?.directiveAuthority ?? null,
      role: artifact.authority?.role || null
    },
    missingFields,
    summary: status === 'pass'
      ? `External context summary recorded ${captureCount} prompt-inspection capture(s) with ${targetSummaryCount} target summary record(s).`
      : `External context summary artifact is invalid; missing or invalid fields: ${missingFields.join(', ')}.`
  };
}

export function summarizeLaneArtifactCompleteness({ artifactRoot, turnLimit } = {}) {
  const requiredFiles = [
    'report.json',
    'summary.md',
    'live-log.jsonl',
    'host-extensions/external-context-summary.json',
    'fact-checks/canary-index.json',
    'transcript/readable-chat.md'
  ];
  const missingFiles = requiredFiles.filter((relative) => !fs.existsSync(path.join(artifactRoot || '', relative)));
  const externalContextSummary = summarizeExternalContextSummaryArtifact({ artifactRoot });
  const promptArtifacts = promptInspectionArtifacts(artifactRoot);
  const promptFileCount = promptArtifacts.length;
  const generationPromptFileCount = promptArtifacts.filter(({ artifact }) => artifact?.reason === 'pre-generation').length;
  const factCheckCount = factCheckFiles(artifactRoot).length;
  const expectedFactCheckCount = expectedFactCheckCountForTurnLimit(turnLimit);
  const expectedPromptInspectionCount = expectedGenerationPromptSnapshotCount(turnLimit);
  const missingPromptInspection = promptFileCount === 0;
  const missingGenerationPromptInspection = generationPromptFileCount === 0;
  const missingFactChecks = factCheckCount === 0;
  const factCheckDepthMissing = expectedFactCheckCount !== null && factCheckCount < expectedFactCheckCount;
  const promptInspectionDepthMissing = expectedPromptInspectionCount !== null && generationPromptFileCount < expectedPromptInspectionCount;
  const hardMissing = missingFiles.length || externalContextSummary.status !== 'pass' || missingPromptInspection || missingGenerationPromptInspection || missingFactChecks;
  return {
    status: hardMissing ? 'fail' : factCheckDepthMissing || promptInspectionDepthMissing ? 'warning' : 'pass',
    requiredFiles,
    missingFiles,
    externalContextSummaryPresent: externalContextSummary.present === true,
    externalContextSummaryPath: externalContextSummary.present ? path.join(artifactRoot || '', 'host-extensions', 'external-context-summary.json') : null,
    externalContextSummary,
    promptFileCount,
    generationPromptFileCount,
    factCheckCount,
    expectedPromptInspectionCount,
    expectedFactCheckCount,
    promptInspectionDepthMissing,
    factCheckDepthMissing
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
    modelCallPolicy: report.modelCallPolicy || null,
    checks: (report.checks || []).map((entry) => ({
      id: entry.id,
      status: entry.status,
      summary: entry.summary
    })),
    warnings: report.warnings || [],
    failures: report.failures || []
  };
}

function summarizeLaneModelCallFailurePolicy({ artifactRoot } = {}) {
  const report = readJsonIfExists(artifactRoot ? path.join(artifactRoot, 'report.json') : '');
  if (!report) {
    return {
      status: 'fail',
      summary: 'Lane report.json is missing; model-call failure policy evidence cannot be verified.',
      evidenceSource: 'missing-lane-report',
      durableEvidenceSource: null,
      failedModelCallCount: 0,
      retainedModelCallCount: 0,
      modelCallCount: 0,
      calls: [],
      releaseBlockingCalls: [{ classification: 'release-blocking-missing-lane-report' }],
      unresolvedCalls: [],
      fallbackHandledCalls: []
    };
  }
  const durableEvidence = report.modelCallPolicy?.failurePolicyEvidence || null;
  if (durableEvidence && typeof durableEvidence === 'object') {
    return {
      ...durableEvidence,
      durableEvidenceSource: 'lane-report:modelCallPolicy.failurePolicyEvidence'
    };
  }
  const policyCheck = (report.checks || []).find((entry) => entry?.id === 'live-model-call-failure-policy') || null;
  if (policyCheck?.details) {
    return {
      status: policyCheck.status || 'fail',
      summary: policyCheck.summary || 'Lane model-call failure policy check did not include a summary.',
      evidenceSource: policyCheck.details.evidenceSource || 'lane-check-details',
      authoritySource: policyCheck.details.authoritySource || null,
      severityPolicy: policyCheck.details.severityPolicy || null,
      durableEvidenceSource: 'lane-report:live-model-call-failure-policy.details',
      failedModelCallCount: Number(policyCheck.details.failedModelCallCount || 0),
      retainedModelCallCount: Number(policyCheck.details.retainedModelCallCount || 0),
      modelCallCount: Number(policyCheck.details.modelCallCount || 0),
      calls: policyCheck.details.calls || [],
      releaseBlockingCalls: policyCheck.details.releaseBlockingCalls || [],
      unresolvedCalls: policyCheck.details.unresolvedCalls || [],
      fallbackHandledCalls: policyCheck.details.fallbackHandledCalls || []
    };
  }
  const smokeSummary = readJsonIfExists(path.join(artifactRoot || '', 'smoke-chat-soak', 'report-summary.json'));
  const smokeReport = readJsonIfExists(path.join(artifactRoot || '', 'smoke-chat-soak', 'report.json'));
  const diagnosticPolicy = summarizeModelCallFailurePolicy({ smokeReport, smokeSummary });
  return {
    status: 'fail',
    summary: 'Lane report is missing durable model-call failure policy evidence.',
    evidenceSource: 'missing-lane-report-policy',
    authoritySource: diagnosticPolicy.authoritySource || null,
    severityPolicy: diagnosticPolicy.severityPolicy || 'Missing durable lane-owned policy evidence blocks certification.',
    durableEvidenceSource: null,
    failedModelCallCount: diagnosticPolicy.failedModelCallCount || 0,
    retainedModelCallCount: diagnosticPolicy.retainedModelCallCount || 0,
    modelCallCount: diagnosticPolicy.modelCallCount || 0,
    calls: diagnosticPolicy.calls || [],
    releaseBlockingCalls: [{
      classification: 'release-blocking-missing-durable-lane-evidence',
      failedModelCallCount: diagnosticPolicy.failedModelCallCount || 0,
      diagnosticStatus: diagnosticPolicy.status || 'unknown'
    }],
    unresolvedCalls: [],
    fallbackHandledCalls: []
  };
}

export function summarizeGenerationTimingCoreProof({ artifactRoot } = {}) {
  const report = readJsonIfExists(artifactRoot ? path.join(artifactRoot, 'report.json') : '');
  if (!report) {
    return {
      status: 'fail',
      summary: 'Lane report.json is missing; CORE generation timing proof cannot be verified.',
      proof: null,
      checkStatus: null
    };
  }
  const timingCheck = (report.checks || []).find((entry) => entry?.id === 'live-generation-start-timing') || null;
  if (!timingCheck) {
    return {
      status: 'fail',
      summary: 'Lane report is missing live-generation-start-timing check.',
      proof: null,
      checkStatus: null
    };
  }
  const proof = timingCheck.details?.proof || null;
  if (timingCheck.status === 'fail') {
    return {
      status: 'fail',
      summary: timingCheck.summary || 'Lane generation-start timing check failed.',
      proof,
      checkStatus: timingCheck.status
    };
  }
  if (!proof) {
    return {
      status: 'fail',
      summary: 'Lane generation-start timing check did not include proof details.',
      proof: null,
      checkStatus: timingCheck.status || null
    };
  }
  const hasCoreProjectionProof = proof.source === 'coreStoreTurnTiming'
    && proof.timingSource === 'coreProjection';
  if (!hasCoreProjectionProof) {
    return {
      status: 'fail',
      summary: `Lane timing proof is not persisted CORE projection evidence; source=${proof.source || 'unknown'}, timingSource=${proof.timingSource || 'unknown'}.`,
      proof,
      checkStatus: timingCheck.status || null
    };
  }
  if (proof.status !== 'pass' || Number(proof.checkedTurnCount || 0) <= 0 || timingCheck.status !== 'pass') {
    const skippedSuffix = Number(proof.skippedTurnCount || 0) > 0
      ? ` ${proof.skippedTurnCount} deterministic non-generation turn(s) were skipped.`
      : '';
    return {
      status: proof.status === 'fail' || timingCheck.status === 'fail' ? 'fail' : 'warning',
      summary: `Lane timing proof is incomplete for certification.${skippedSuffix}`,
      proof,
      checkStatus: timingCheck.status || null
    };
  }
  const skippedSuffix = Number(proof.skippedTurnCount || 0) > 0
    ? ` ${proof.skippedTurnCount} deterministic non-generation turn(s) were skipped.`
    : '';
  return {
    status: 'pass',
    summary: `Lane proved persisted CORE generation-start timing for ${proof.checkedTurnCount} turn(s); max latency ${proof.maxGenerationStartLatencyMs ?? 'unknown'} ms.${skippedSuffix}`,
    proof,
    checkStatus: timingCheck.status || null
  };
}

export function summarizeHostNativeCompletionProof({ artifactRoot, turnLimit = null } = {}) {
  const report = readJsonIfExists(artifactRoot ? path.join(artifactRoot, 'report.json') : '');
  if (!report) {
    return {
      status: 'fail',
      summary: 'Lane report.json is missing; host-native completion proof cannot be verified.',
      proof: null,
      checkStatus: null
    };
  }
  const completionCheck = (report.checks || []).find((entry) => entry?.id === 'live-host-native-completion-proof') || null;
  if (!completionCheck) {
    return {
      status: 'fail',
      summary: 'Lane report is missing live-host-native-completion-proof check.',
      proof: null,
      checkStatus: null
    };
  }
  const proof = completionCheck.details?.proof || null;
  if (completionCheck.status === 'fail') {
    return {
      status: 'fail',
      summary: completionCheck.summary || 'Lane host-native completion proof failed.',
      proof,
      checkStatus: completionCheck.status
    };
  }
  if (!proof) {
    return {
      status: 'fail',
      summary: 'Lane host-native completion check did not include proof details.',
      proof: null,
      checkStatus: completionCheck.status || null
    };
  }
  const hasCoreProjectionProof = proof.source === 'coreStoreResponseLedger'
    && proof.completionSource === 'coreProjection';
  if (!hasCoreProjectionProof) {
    return {
      status: 'fail',
      summary: `Lane host-native completion proof is not persisted CORE projection evidence; source=${proof.source || 'unknown'}, completionSource=${proof.completionSource || 'unknown'}.`,
      proof,
      checkStatus: completionCheck.status || null
    };
  }
  if (proof.status !== 'pass' || Number(proof.completedHostContinueCount || 0) <= 0 || completionCheck.status !== 'pass') {
    return {
      status: proof.status === 'fail' || completionCheck.status === 'fail' ? 'fail' : 'warning',
      summary: 'Lane host-native completion proof is incomplete for certification.',
      proof,
      checkStatus: completionCheck.status || null
    };
  }
  const requiredCompletionAssessment = assessRequiredHostNativeCompletionProof(proof);
  const requiresRequiredTurnProof = requiredHostNativeCompletionProofRequired(turnLimit);
  if (requiresRequiredTurnProof && requiredCompletionAssessment.status !== 'pass') {
    return {
      status: 'fail',
      summary: requiredCompletionAssessment.missing.length > 0
        ? `Lane host-native completion proof is missing required turn binding for ${requiredCompletionAssessment.missing.map((entry) => entry.scriptMessageId).join(', ')}.`
        : 'Lane host-native completion proof reported failed required-turn binding.',
      proof,
      requiredCompletionAssessment,
      checkStatus: completionCheck.status || null
    };
  }
  return {
    status: 'pass',
    summary: requiresRequiredTurnProof
      ? `Lane proved ${proof.completedHostContinueCount} terminal host-native completion(s), including ${requiredCompletionAssessment.matched.length} required turn binding(s), from persisted CORE projections; max completion latency ${proof.maxCompletionLatencyMs ?? 'unknown'} ms.`
      : `Lane proved ${proof.completedHostContinueCount} terminal host-native completion(s) from persisted CORE projections; max completion latency ${proof.maxCompletionLatencyMs ?? 'unknown'} ms.`,
    proof,
    requiredCompletionAssessment,
    checkStatus: completionCheck.status || null
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
  const externalContextProof = summarizeExternalContextPromptArtifact({ artifactRoot: resolvedArtifactRoot });
  const externalContextGenerationProof = summarizeExternalContextGenerationArtifacts({ artifactRoot: resolvedArtifactRoot, turnLimit });
  const factualGrounding = summarizeFactualGroundingArtifacts({ artifactRoot: resolvedArtifactRoot });
  const artifactCompleteness = summarizeLaneArtifactCompleteness({ artifactRoot: resolvedArtifactRoot, turnLimit });
  const generationTimingProof = summarizeGenerationTimingCoreProof({ artifactRoot: resolvedArtifactRoot });
  const hostNativeCompletionProof = summarizeHostNativeCompletionProof({ artifactRoot: resolvedArtifactRoot, turnLimit });
  const storyQualityReview = summarizeStoryQualityReviewArtifacts({ artifactRoot: resolvedArtifactRoot });
  const modelCallFailurePolicy = summarizeLaneModelCallFailurePolicy({ artifactRoot: resolvedArtifactRoot });
  const processStatus = child?.exitCode === 0 ? 'pass' : 'fail';
  const laneStatus = worstStatus([
    processStatus,
    childReport.status === 'fail' ? 'fail' : childReport.status === 'warning' ? 'warning' : 'pass',
    promptInspection.status,
    externalContextProof.status,
    externalContextGenerationProof.status,
    factualGrounding.status,
    artifactCompleteness.status,
    generationTimingProof.status,
    hostNativeCompletionProof.status,
    storyQualityReview.status,
    modelCallFailurePolicy.status
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
    externalContextProof,
    externalContextGenerationProof,
    factualGrounding,
    generationTimingProof,
    hostNativeCompletionProof,
    storyQualityReview,
    modelCallFailurePolicy
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
    const action = options.action || null;
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: options.env || process.env,
      windowsHide: true
    });
    activeChildProcesses.add(child);
    activeMaterialActions.set(child, action);
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      activeChildProcesses.delete(child);
      activeMaterialActions.delete(child);
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
      activeChildProcesses.delete(child);
      activeMaterialActions.delete(child);
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

function childEnvForLane({ lane, paths, runId, turnLimit, activateExternalContextFixture = false }) {
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
  if (activateExternalContextFixture) env.DIRECTIVE_SOAK_ACTIVATE_EXTERNAL_CONTEXT_FIXTURE = '1';
  else delete env.DIRECTIVE_SOAK_ACTIVATE_EXTERNAL_CONTEXT_FIXTURE;
  return env;
}

function requestedTurnLimitValue(turnLimit) {
  const parsed = Number.parseInt(String(turnLimit || '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function firstHostNativeCompletionRequiredTurn() {
  const requiredTurns = requiredHostNativeCompletionMessages()
    .map((entry) => Number(entry.turn))
    .filter((turn) => Number.isFinite(turn) && turn > 0)
    .sort((a, b) => a - b);
  return requiredTurns[0] || null;
}

export function requiredHostNativeCompletionMessages() {
  return SOAK_TURN_SCRIPT
    .filter((entry) => entry?.hostNativeCompletionRequired === true)
    .map((entry) => {
      const turn = Number(entry.turn);
      const scriptMessageId = entry.id || (Number.isFinite(turn) && turn > 0
        ? `soak-turn-${String(turn).padStart(2, '0')}`
        : null);
      return {
        scriptMessageId,
        turn: Number.isFinite(turn) && turn > 0 ? turn : null,
        expectedRoute: entry.expectedRoute || 'hostContinue',
        expectedResponseStrategy: entry.expectedResponseStrategy || 'injectAndContinue'
      };
    })
    .filter((entry) => entry.scriptMessageId);
}

function requiredHostNativeCompletionProofRequired(turnLimit) {
  const firstRequiredTurn = firstHostNativeCompletionRequiredTurn();
  if (!firstRequiredTurn) return false;
  const requestedLimit = requestedTurnLimitValue(turnLimit);
  return requestedLimit === null || requestedLimit >= firstRequiredTurn;
}

function requiredHostNativeCompletionsFromProof(proof = {}) {
  const completions = Array.isArray(proof?.requiredCompletions)
    ? proof.requiredCompletions
    : Array.isArray(proof?.requiredHostNativeCompletions)
      ? proof.requiredHostNativeCompletions
      : [];
  return completions.filter((entry) => entry?.required === true || entry?.scriptMessageId || entry?.id);
}

function requiredHostNativeCompletionMatches(completion = {}, expected = {}) {
  const turn = Number(completion.turn);
  const expectedTurn = Number(expected.turn);
  return completion.status === 'pass'
    && (completion.scriptMessageId || completion.id || null) === expected.scriptMessageId
    && (!Number.isFinite(expectedTurn) || expectedTurn <= 0 || turn === expectedTurn)
    && (completion.expectedRoute || 'hostContinue') === expected.expectedRoute
    && (completion.expectedResponseStrategy || 'injectAndContinue') === expected.expectedResponseStrategy
    && completion.source === 'coreStoreResponseLedger'
    && completion.completionSource === 'coreProjection'
    && Number(completion.completedHostContinueCount || 0) > 0
    && Number(completion.failedHostContinueCount || 0) === 0;
}

function assessRequiredHostNativeCompletionProof(proof = {}) {
  const expected = requiredHostNativeCompletionMessages();
  const completions = requiredHostNativeCompletionsFromProof(proof);
  const matched = [];
  const missing = [];
  for (const required of expected) {
    const completion = completions.find((entry) => requiredHostNativeCompletionMatches(entry, required)) || null;
    if (completion) matched.push(completion);
    else missing.push(required);
  }
  const failed = completions.filter((entry) => entry.status && entry.status !== 'pass');
  return {
    status: missing.length > 0 || failed.length > 0 ? 'fail' : 'pass',
    expected,
    completions,
    matched,
    missing,
    failed
  };
}

function laneReportTurnLimit(report = {}) {
  const turnLimitCheck = (report.checks || []).find((entry) => entry.id === 'live-execution-turn-limit');
  const value = turnLimitCheck?.details?.turnLimit ?? null;
  return requestedTurnLimitValue(value);
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
  const boundedTurnLimit = requestedTurnLimitValue(turnLimit) !== null;
  if (
    summary.report?.status === 'fail'
    || summary.artifactCompleteness?.status === 'fail'
    || (summary.artifactCompleteness?.status === 'warning' && !boundedTurnLimit)
    || summary.promptInspection?.status !== 'pass'
    || summary.externalContextProof?.status !== 'pass'
    || summary.externalContextGenerationProof?.status !== 'pass'
    || summary.generationTimingProof?.status !== 'pass'
    || summary.hostNativeCompletionProof?.status !== 'pass'
    || summary.modelCallFailurePolicy?.status !== 'pass'
    || summary.storyQualityReview?.status === 'fail'
    || (summary.storyQualityReview?.status === 'warning' && !boundedTurnLimit)
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

function countByStatus(items = []) {
  const counts = {};
  for (const item of items) {
    const status = item?.status || 'unknown';
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

function summarizeExternalContextTarget(target = {}) {
  return {
    status: target.status || 'unknown',
    diskSignals: {
      installed: target.diskSignals?.installed === true,
      enabled: target.diskSignals?.enabled === true,
      disabledPresent: target.diskSignals?.disabledPresent === true,
      settingsHash: target.diskSignals?.settingsHash || null
    },
    browserSignals: {
      settingsSeen: target.browserSignals?.settingsSeen === true,
      globalSignatureSeen: target.browserSignals?.globalSignatureSeen === true,
      promptKeySeen: target.browserSignals?.promptKeySeen === true,
      chatMetadataSeen: target.browserSignals?.chatMetadataSeen === true,
      messageMarkerSeen: target.browserSignals?.messageMarkerSeen === true
    },
    promptKeys: Array.isArray(target.promptKeys) ? target.promptKeys.slice(0, 40) : [],
    chatMetadataCounts: target.chatMetadataCounts && typeof target.chatMetadataCounts === 'object'
      ? { ...target.chatMetadataCounts }
      : {},
    messageMarkerCounts: target.messageMarkerCounts && typeof target.messageMarkerCounts === 'object'
      ? { ...target.messageMarkerCounts }
      : {},
    unavailableReasons: Array.isArray(target.unavailableReasons) ? target.unavailableReasons.slice(0, 20) : []
  };
}

export function summarizeExternalContextProbe(probe = null) {
  if (!probe || typeof probe !== 'object') return null;
  const users = (probe.users || []).map((user) => {
    const targets = Object.fromEntries(EXTERNAL_CONTEXT_TARGET_IDS.map((targetId) => [
      targetId,
      summarizeExternalContextTarget(user.targets?.[targetId] || {})
    ]));
    const targetStatuses = Object.values(targets).map((target) => target.status || 'unknown');
    const externalPromptKeys = Array.isArray(user.externalPromptEnvironment?.knownExternalPromptKeys)
      ? user.externalPromptEnvironment.knownExternalPromptKeys.slice(0, 100)
      : [];
    return {
      handle: user.handle || null,
      status: user.status || 'unknown',
      contextReady: user.contextReady === true,
      currentChatId: user.currentChatId || null,
      chatLength: Number(user.chatLength || 0),
      diskEnvironmentHash: user.diskEnvironmentHash || null,
      browserEnvironmentHash: user.browserEnvironmentHash || null,
      combinedEnvironmentHash: user.combinedEnvironmentHash || null,
      hostPromptRegistry: {
        available: user.hostPromptRegistry?.available === true,
        keyCount: Number(user.hostPromptRegistry?.keyCount || user.hostPromptRegistry?.promptKeys?.length || 0),
        promptKeys: Array.isArray(user.hostPromptRegistry?.promptKeys) ? user.hostPromptRegistry.promptKeys.slice(0, 100) : []
      },
      externalPromptKeys,
      externalPromptKeyCount: externalPromptKeys.length,
      targetStatusCounts: countByStatus(targetStatuses.map((status) => ({ status }))),
      targets,
      unavailableSignals: Array.isArray(user.unavailableSignals) ? user.unavailableSignals.slice(0, 50) : [],
      redactionCount: Array.isArray(user.redactions) ? user.redactions.length : 0,
      redactionReasons: [...new Set((user.redactions || []).map((entry) => entry?.reason).filter(Boolean))]
    };
  });
  const fixtureDepth = summarizeExternalContextFixtureDepth(probe);
  return {
    kind: probe.kind || 'directive.sillytavern.externalContextProbe.v1',
    schemaVersion: probe.schemaVersion || 1,
    runId: probe.runId || null,
    capturedAt: probe.capturedAt || null,
    mode: probe.mode || null,
    status: probe.status || 'unknown',
    required: probe.required === true,
    baseUrl: probe.baseUrl || null,
    userCount: users.length,
    userStatusCounts: countByStatus(users),
    targetStatusCounts: countByStatus(users.flatMap((user) => Object.values(user.targets))),
    fixtureDepth,
    users
  };
}

export function summarizeReadiness(child, paths, runId) {
  const json = child?.json || null;
  const artifactRoot = json?.artifactRoot || path.join(paths.readiness, `${runId}-readiness`);
  const report = readJsonIfExists(path.join(artifactRoot, 'report.json'));
  const externalContextProbe = summarizeExternalContextProbe(
    report?.externalContextProbe
    || readJsonIfExists(path.join(artifactRoot, 'host-extensions', 'external-context-probe.json'))
  );
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
      : null,
    externalContextProbe
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
  const externalProbe = readiness?.externalContextProbe || null;
  checks.push(reportCheck(
    'external-context-readiness-proof',
    !options.live
      ? 'skipped'
      : options.skipReadiness
        ? 'warning'
        : !externalProbe
          ? 'fail'
          : externalProbe.status === 'pass'
            ? 'pass'
            : externalProbe.status === 'warning'
              ? 'warning'
              : 'fail',
    !options.live
      ? 'External context readiness proof skipped in dry-run mode.'
      : options.skipReadiness
        ? 'External context readiness proof was skipped with live readiness.'
        : !externalProbe
          ? 'Live readiness did not produce an external-context probe artifact.'
          : externalProbe.status === 'pass'
            ? 'External context probe captured per-user browser/disk compatibility evidence.'
            : externalProbe.status === 'warning'
              ? 'External context probe captured compatibility evidence with unresolved browser/disk warnings.'
              : 'External context probe failed or did not prove required compatibility evidence.',
    externalProbe
      ? {
        artifactRoot: readiness.artifactRoot,
        userCount: externalProbe.userCount,
        userStatusCounts: externalProbe.userStatusCounts,
        targetStatusCounts: externalProbe.targetStatusCounts,
        required: externalProbe.required
      }
      : readiness ? { artifactRoot: readiness.artifactRoot } : null
  ));
  const fixtureDepth = externalProbe?.fixtureDepth || null;
  const fixtureDepthStatus = externalContextFixtureDepthCheckStatus({
    live: options.live,
    skipReadiness: options.skipReadiness,
    turnLimit: options.turnLimit,
    fixtureDepth,
    fullCertificationRequired: Boolean(options.live && !options.turnLimit && !options.skipReadiness)
  });
  checks.push(reportCheck(
    'external-context-fixture-depth',
    fixtureDepthStatus,
    !options.live
      ? 'External context fixture-depth proof skipped in dry-run mode.'
      : options.skipReadiness
        ? 'External context fixture-depth proof was skipped with live readiness.'
        : !fixtureDepth
          ? 'Live readiness did not produce fixture-depth evidence.'
          : fixtureDepth.status === 'pass'
            ? 'At least one non-human soak user has rich active fixture evidence for every external-context target.'
            : options.turnLimit
              ? 'External context observability exists, but rich active fixture evidence is incomplete or shallow.'
              : 'Full external-context certification requires rich active fixture evidence for every target in at least one non-human soak user.',
    fixtureDepth
      ? {
        status: fixtureDepth.status,
        fullCertificationRequired: Boolean(options.live && !options.turnLimit && !options.skipReadiness),
        requiredTargets: fixtureDepth.requiredTargets,
        fullFixtureUserHandles: fixtureDepth.fullFixtureUserHandles,
        missingTargets: fixtureDepth.missingTargets,
        targetCoverage: fixtureDepth.targetCoverage
      }
      : readiness ? { artifactRoot: readiness.artifactRoot } : null
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
  const hostNativeRequiredTurn = firstHostNativeCompletionRequiredTurn();
  const requestedTurnLimit = requestedTurnLimitValue(options.turnLimit);
  const hostNativeTurnCoverageStatus = !options.live
    ? 'skipped'
    : hostNativeRequiredTurn && requestedTurnLimit && requestedTurnLimit < hostNativeRequiredTurn
      ? 'warning'
      : 'pass';
  checks.push(reportCheck(
    'host-native-completion-turn-coverage',
    hostNativeTurnCoverageStatus,
    !options.live
      ? 'Host-native completion turn coverage skipped in dry-run mode.'
      : hostNativeTurnCoverageStatus === 'warning'
        ? `Each lane is limited to ${requestedTurnLimit} turn(s), before required host-native completion proof turn ${hostNativeRequiredTurn}.`
        : hostNativeRequiredTurn
          ? `Lane depth reaches required host-native completion proof turn ${hostNativeRequiredTurn}.`
          : 'No required host-native completion turn is marked in the soak script.',
    {
      turnLimit: requestedTurnLimit,
      firstHostNativeCompletionRequiredTurn: hostNativeRequiredTurn
    }
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
  const richFixtureUserHandles = new Set(fixtureDepth?.fullFixtureUserHandles || []);
  const externalPromptMissing = laneSummaries.filter((lane) => lane.externalContextGenerationProof?.status !== 'pass');
  const richFixtureGenerationMissing = laneSummaries.filter((lane) => (
    richFixtureUserHandles.has(lane.userHandle)
    && lane.externalContextGenerationProof?.richFixturePressure?.status !== 'pass'
  ));
  checks.push(reportCheck(
    'external-context-generation-proof',
    !options.live ? 'skipped' : externalPromptMissing.length || richFixtureGenerationMissing.length ? 'fail' : 'pass',
    !options.live
      ? 'External context generation proof skipped in dry-run mode.'
      : externalPromptMissing.length
        ? `${externalPromptMissing.length} lane(s) are missing generation-time prompt-snapshot external context refs, known external prompt keys, or expected capture depth.`
        : richFixtureGenerationMissing.length
          ? `${richFixtureGenerationMissing.length} rich fixture lane(s) did not prove fixture-specific external context pressure during generation.`
        : 'Every live lane recorded generation-time external prompt environment refs and known external prompt keys before sends.',
    {
      richFixtureUserHandles: [...richFixtureUserHandles],
      lanes: laneSummaries.map((lane) => ({
        id: lane.id,
        userHandle: lane.userHandle,
        status: lane.externalContextGenerationProof?.status || 'missing',
        captureCount: lane.externalContextGenerationProof?.captureCount ?? 0,
        expectedCaptureCount: lane.externalContextGenerationProof?.expectedCaptureCount ?? null,
        captureDepthMissing: lane.externalContextGenerationProof?.captureDepthMissing === true,
        knownExternalPromptKeys: lane.externalContextGenerationProof?.knownExternalPromptKeys || [],
        refHashes: lane.externalContextGenerationProof?.refHashes || [],
        richFixturePressure: lane.externalContextGenerationProof?.richFixturePressure || null,
        unavailableSignals: lane.externalContextGenerationProof?.unavailableSignals || [],
        latestPromptSnapshot: {
          status: lane.externalContextProof?.status || 'missing',
          refHash: lane.externalContextProof?.externalPromptEnvironmentRef?.hash || null,
          finalHostPromptMayIncludeExternal: lane.externalContextProof?.finalHostPromptMayIncludeExternal ?? null
        }
      }))
    }
  ));
  const timingProofMissing = laneSummaries.filter((lane) => lane.generationTimingProof?.status !== 'pass');
  checks.push(reportCheck(
    'generation-start-timing-core-proof',
    !options.live ? 'skipped' : timingProofMissing.length ? 'fail' : 'pass',
    !options.live
      ? 'Generation-start timing CORE proof skipped in dry-run mode.'
      : timingProofMissing.length
        ? `${timingProofMissing.length} lane(s) are missing persisted CORE projection generation-start timing proof.`
        : 'Every live lane proved generation-start timing from persisted CORE Store projections.',
    {
      lanes: laneSummaries.map((lane) => ({
        id: lane.id,
        userHandle: lane.userHandle,
        status: lane.generationTimingProof?.status || 'missing',
        checkStatus: lane.generationTimingProof?.checkStatus || null,
        source: lane.generationTimingProof?.proof?.source || null,
        timingSource: lane.generationTimingProof?.proof?.timingSource || null,
        checkedTurnCount: lane.generationTimingProof?.proof?.checkedTurnCount ?? null,
        skippedTurnCount: lane.generationTimingProof?.proof?.skippedTurnCount ?? null,
        maxGenerationStartLatencyMs: lane.generationTimingProof?.proof?.maxGenerationStartLatencyMs ?? null,
        summary: lane.generationTimingProof?.summary || null
      }))
    }
  ));
  const hostCompletionMissing = laneSummaries.filter((lane) => lane.hostNativeCompletionProof?.status !== 'pass');
  checks.push(reportCheck(
    'host-native-completion-core-proof',
    !options.live ? 'skipped' : hostCompletionMissing.length ? 'fail' : 'pass',
    !options.live
      ? 'Host-native completion CORE proof skipped in dry-run mode.'
      : hostCompletionMissing.length
        ? `${hostCompletionMissing.length} lane(s) are missing persisted CORE projection host-native completion proof.`
        : 'Every live lane proved terminal host-native completion from persisted CORE Store response projections.',
    {
      lanes: laneSummaries.map((lane) => ({
        id: lane.id,
        userHandle: lane.userHandle,
        status: lane.hostNativeCompletionProof?.status || 'missing',
        checkStatus: lane.hostNativeCompletionProof?.checkStatus || null,
        source: lane.hostNativeCompletionProof?.proof?.source || null,
        completionSource: lane.hostNativeCompletionProof?.proof?.completionSource || null,
        completedHostContinueCount: lane.hostNativeCompletionProof?.proof?.completedHostContinueCount ?? null,
        failedHostContinueCount: lane.hostNativeCompletionProof?.proof?.failedHostContinueCount ?? null,
        requiredCompletionStatus: lane.hostNativeCompletionProof?.requiredCompletionAssessment?.status || null,
        requiredCompletionMatchedCount: lane.hostNativeCompletionProof?.requiredCompletionAssessment?.matched?.length ?? null,
        requiredCompletionMissing: lane.hostNativeCompletionProof?.requiredCompletionAssessment?.missing || [],
        requiredCompletions: lane.hostNativeCompletionProof?.requiredCompletionAssessment?.completions || [],
        maxCompletionLatencyMs: lane.hostNativeCompletionProof?.proof?.maxCompletionLatencyMs ?? null,
        summary: lane.hostNativeCompletionProof?.summary || null
      }))
    }
  ));
  const modelCallPolicyFailures = laneSummaries.filter((lane) => lane.modelCallFailurePolicy?.status === 'fail');
  const modelCallPolicyWarnings = laneSummaries.filter((lane) => lane.modelCallFailurePolicy?.status === 'warning');
  checks.push(reportCheck(
    'model-call-failure-policy',
    !options.live ? 'skipped' : modelCallPolicyFailures.length ? 'fail' : modelCallPolicyWarnings.length ? 'warning' : 'pass',
    !options.live
      ? 'Model-call failure policy evidence skipped in dry-run mode.'
      : modelCallPolicyFailures.length
        ? `${modelCallPolicyFailures.length} lane(s) have release-blocking or missing model-call failure policy evidence.`
        : modelCallPolicyWarnings.length
          ? `${modelCallPolicyWarnings.length} lane(s) have unresolved model-call failure policy evidence.`
          : 'Every live lane has durable model-call failure policy evidence.',
    {
      lanes: laneSummaries.map((lane) => ({
        id: lane.id,
        userHandle: lane.userHandle,
        status: lane.modelCallFailurePolicy?.status || 'missing',
        summary: lane.modelCallFailurePolicy?.summary || null,
        evidenceSource: lane.modelCallFailurePolicy?.evidenceSource || null,
        durableEvidenceSource: lane.modelCallFailurePolicy?.durableEvidenceSource || null,
        failedModelCallCount: lane.modelCallFailurePolicy?.failedModelCallCount || 0,
        releaseBlockingCount: lane.modelCallFailurePolicy?.releaseBlockingCalls?.length || 0,
        unresolvedCount: lane.modelCallFailurePolicy?.unresolvedCalls?.length || 0,
        fallbackHandledCount: lane.modelCallFailurePolicy?.fallbackHandledCalls?.length || 0
      }))
    }
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
  const boundedTurnLimit = requestedTurnLimitValue(options.turnLimit) !== null;
  const storyQualityFailures = laneSummaries.filter((lane) => lane.storyQualityReview?.status === 'fail');
  const storyQualityWarnings = laneSummaries.filter((lane) => lane.storyQualityReview?.status === 'warning');
  const modelReviewNotRun = laneSummaries.filter((lane) => lane.storyQualityReview?.modelAssistedReview?.missing === true);
  const modelReviewWarnings = laneSummaries.filter((lane) => lane.storyQualityReview?.modelAssistedReview?.status === 'warning');
  const storyQualityStatus = !options.live
    ? 'skipped'
    : storyQualityFailures.length
      ? 'fail'
      : storyQualityWarnings.length
        ? (boundedTurnLimit ? 'warning' : 'fail')
        : 'pass';
  checks.push(reportCheck(
    'story-quality-model-review',
    storyQualityStatus,
    !options.live
      ? 'Story-quality model-review proof skipped in dry-run mode.'
      : storyQualityFailures.length
        ? `${storyQualityFailures.length} lane(s) failed story-quality review proof.`
        : storyQualityWarnings.length
          ? boundedTurnLimit
            ? `${storyQualityWarnings.length} bounded lane(s) have incomplete or non-passing model-assisted story-quality review evidence.`
            : `${storyQualityWarnings.length} lane(s) have incomplete or non-passing model-assisted story-quality review evidence; unbounded certification requires pass.`
          : 'Every live lane has passing model-assisted story-quality review evidence.',
    {
      boundedTurnLimit,
      missingOrNotRunCount: modelReviewNotRun.length,
      warningCount: modelReviewWarnings.length,
      lanes: laneSummaries.map((lane) => ({
        id: lane.id,
        userHandle: lane.userHandle,
        status: lane.storyQualityReview?.status || 'missing',
        checkStatus: lane.storyQualityReview?.checkStatus || null,
        deterministicStatus: lane.storyQualityReview?.deterministicStatus || null,
        deterministicScoreCount: lane.storyQualityReview?.deterministicScoreCount || 0,
        averageScore: lane.storyQualityReview?.averageScore ?? null,
        modelAssistedReviewStatus: lane.storyQualityReview?.modelAssistedReview?.status || null,
        modelAssistedReviewResultPath: lane.storyQualityReview?.modelAssistedReview?.resultPath || null,
        modelAssistedReviewProviderOutputPath: lane.storyQualityReview?.modelAssistedReview?.providerOutputPath || null,
        modelAssistedReviewMissing: lane.storyQualityReview?.modelAssistedReview?.missing === true,
        modelAssistedReviewUnparseable: lane.storyQualityReview?.modelAssistedReview?.unparseable === true,
        modelAssistedReviewTimedOut: lane.storyQualityReview?.modelAssistedReview?.timedOut === true,
        summary: lane.storyQualityReview?.summary || null
      }))
    }
  ));
  const artifactFailures = laneSummaries.filter((lane) => lane.artifactCompleteness?.status === 'fail');
  const artifactWarnings = laneSummaries.filter((lane) => lane.artifactCompleteness?.status === 'warning');
  checks.push(reportCheck(
    'lane-artifact-completeness',
    !options.live ? 'skipped' : artifactFailures.length ? 'fail' : artifactWarnings.length ? 'warning' : 'pass',
    !options.live
      ? 'Lane artifact completeness skipped in dry-run mode.'
      : artifactFailures.length
        ? `${artifactFailures.length} lane(s) are missing required certification artifacts.`
        : artifactWarnings.length
          ? `${artifactWarnings.length} lane(s) wrote required artifacts with lower-than-planned fact-check depth.`
          : 'Every live lane wrote the required certification artifacts.',
    {
      lanes: laneSummaries.map((lane) => ({
        id: lane.id,
        status: lane.artifactCompleteness?.status || 'missing',
        factCheckCount: lane.artifactCompleteness?.factCheckCount || 0,
        expectedFactCheckCount: lane.artifactCompleteness?.expectedFactCheckCount ?? null,
        factCheckDepthMissing: lane.artifactCompleteness?.factCheckDepthMissing === true,
        promptFileCount: lane.artifactCompleteness?.promptFileCount || 0,
        generationPromptFileCount: lane.artifactCompleteness?.generationPromptFileCount || 0,
        expectedPromptInspectionCount: lane.artifactCompleteness?.expectedPromptInspectionCount ?? null,
        promptInspectionDepthMissing: lane.artifactCompleteness?.promptInspectionDepthMissing === true,
        externalContextSummaryPresent: lane.artifactCompleteness?.externalContextSummaryPresent === true,
        externalContextSummary: lane.artifactCompleteness?.externalContextSummary || null,
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
  if (report.readiness?.externalContextProbe) {
    const probe = report.readiness.externalContextProbe;
    lines.push('', '## External Context Readiness', '');
    lines.push(`Status: ${probe.status}`);
    lines.push(`Users: ${probe.userCount}`);
    lines.push(`Targets: ${Object.entries(probe.targetStatusCounts || {}).map(([status, count]) => `${status}=${count}`).join(', ') || 'none'}`);
    if (report.artifacts?.hostExtensions) {
      lines.push(`Aggregate host extension artifacts: ${path.relative(report.artifactRoot, report.artifacts.hostExtensions).replace(/\\/g, '/')}`);
    }
    if (report.readiness?.artifactRoot) {
      const readinessHostExtensions = path.join(report.readiness.artifactRoot, 'host-extensions');
      lines.push(`Readiness host extension artifacts: ${path.relative(report.artifactRoot, readinessHostExtensions).replace(/\\/g, '/')}`);
      lines.push(`External context probe: ${path.relative(report.artifactRoot, path.join(readinessHostExtensions, 'external-context-probe.json')).replace(/\\/g, '/')}`);
    }
    if (probe.fixtureDepth) {
      lines.push(`FixtureDepth: ${probe.fixtureDepth.status}`);
      lines.push(`Full fixture users: ${probe.fixtureDepth.fullFixtureUserHandles?.join(', ') || 'none'}`);
      lines.push(`Missing fixture targets: ${probe.fixtureDepth.missingTargets?.join(', ') || 'none'}`);
    }
  }
  lines.push('', '## Lanes', '');
  for (const lane of report.lanes) {
    const reuseLabel = lane.reused === true ? ' reused' : '';
    lines.push(`- ${lane.status}: ${lane.id} (${lane.userHandle})${reuseLabel}`);
    if (lane.artifactRoot) lines.push(`  - artifactRoot: ${lane.artifactRoot}`);
    if (lane.promptInspection?.presentSourceIds) {
      lines.push(`  - sourceIds: ${lane.promptInspection.presentSourceIds.join(', ') || 'none'}`);
    }
    if (lane.externalContextProof) {
      lines.push(`  - externalContext: ${lane.externalContextProof.status}, keys=${lane.externalContextProof.knownExternalPromptKeys?.join(', ') || 'none'}`);
    }
    if (lane.artifactCompleteness?.externalContextSummary) {
      const summary = lane.artifactCompleteness.externalContextSummary;
      lines.push(`  - externalContextSummary: ${summary.status}, captures=${summary.captureCount || 0}, targets=${summary.targetSummaryCount || 0}, artifact=${summary.file || 'missing'}`);
    }
    if (lane.factualGrounding?.counts) {
      const counts = lane.factualGrounding.counts;
      lines.push(`  - factualGrounding: contradicted=${counts.contradicted || 0}, omitted=${counts.omitted || 0}, unsupportedDetail=${counts.unsupportedDetail || 0}`);
    }
    if (lane.modelCallFailurePolicy) {
      lines.push(`  - modelCallFailurePolicy: ${lane.modelCallFailurePolicy.status}, failed=${lane.modelCallFailurePolicy.failedModelCallCount || 0}, blocking=${lane.modelCallFailurePolicy.releaseBlockingCalls?.length || 0}, handled=${lane.modelCallFailurePolicy.fallbackHandledCalls?.length || 0}`);
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

export function readinessCommandArgs(options = {}) {
  return [
    'tools/scripts/check-sillytavern-multi-user-soak-readiness.mjs',
    '--live',
    ...(options.activateExternalContextFixture ? ['--activate-external-context-fixture'] : []),
    '--write-artifacts'
  ];
}

async function runLiveCoordinator({ options, lanes, paths, runId, readinessUsers = [] }) {
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
    const users = coordinatorReadinessUsers({ configured: readinessUsers, lanes });
    coordinatorLog(paths, options, {
      kind: 'readiness-start',
      status: 'started',
      runId,
      userHandles: users.map((user) => user.handle)
    });
    const child = await spawnChild(
      process.execPath,
      readinessCommandArgs(options),
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

  async function runLane(lane) {
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
        coordinatorLog(paths, options, {
          kind: 'lane-reused',
          status: reusable.status,
          runId,
          laneId: lane.id,
          userHandle: lane.userHandle,
          artifactRoot: reusable.artifactRoot
        });
        return reusable;
      }
    }
    const env = childEnvForLane({
      lane,
      paths,
      runId,
      turnLimit: options.turnLimit,
      activateExternalContextFixture: options.activateExternalContextFixture === true
    });
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
    return laneSummary;
  }
  laneSummaries.push(...await Promise.all(lanes.map((lane) => runLane(lane))));
  return { readiness, laneSummaries };
}

export function buildReport({
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
    artifacts: {
      report: paths.report,
      summary: paths.summary,
      liveLog: paths.liveLog,
      lanes: paths.lanes,
      readiness: paths.readiness,
      hostExtensions: paths.hostExtensions
    },
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
      hostExtensions: paths.hostExtensions,
      storage: path.join(paths.root, 'storage'),
      campaignMatrix: path.join(paths.root, 'campaign-matrix'),
      objectiveAssignments: path.join(paths.root, 'objective-assignments'),
      factChecks: path.join(paths.root, 'fact-checks'),
      continuityProjectionMatrix: path.join(paths.root, 'continuity-projection-matrix'),
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
    const result = await runLiveCoordinator({ options, lanes, paths, runId, readinessUsers: users });
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
