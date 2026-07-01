import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  buildMessageMutationActuationProof,
  writeMessageMutationActuationProof
} from './preflight-sillytavern-message-mutation-actuation.mjs';
import {
  DEFAULT_SOAK_ARTIFACT_ROOT,
  createRunId,
  sha256Text,
  writeJsonFile
} from './lib/sillytavern-live-harness.mjs';

const REPORT_KIND = 'directive.sillytavernMessageMutation.actuationLiveRun.v1';
const DEFAULT_TIMEOUT_MS = 300000;
const FORBIDDEN_RAW_TEXT_KEYS = new Set([
  'text',
  'mes',
  'originaltext',
  'replacementtext',
  'rawtext',
  'fulltext',
  'messagetext',
  'assistanttext',
  'playertext',
  'prompt',
  'provideroutput'
]);

const SCENARIOS = Object.freeze([
  {
    id: 'source-edit',
    reportKey: 'sourceEdit',
    script: 'tools/scripts/run-sillytavern-message-edit-live.mjs',
    runIdEnv: 'DIRECTIVE_MESSAGE_EDIT_RUN_ID',
    liveEnv: 'DIRECTIVE_MESSAGE_EDIT_LIVE',
    writeEnv: 'DIRECTIVE_MESSAGE_EDIT_WRITE',
    targetEnv: 'DIRECTIVE_MESSAGE_EDIT_TARGET_MESID',
    targetOption: 'sourceEditMesid',
    targetMutationEnv: 'DIRECTIVE_MESSAGE_MUTATION_SOURCE_EDIT_MESID',
    replacementTextEnv: 'DIRECTIVE_MESSAGE_EDIT_REPLACEMENT_TEXT',
    replacementFileEnv: 'DIRECTIVE_MESSAGE_EDIT_REPLACEMENT_FILE',
    replacementTextOption: 'sourceEditReplacementText',
    replacementFileOption: 'sourceEditReplacementFile',
    mutationReplacementTextEnv: 'DIRECTIVE_MESSAGE_MUTATION_SOURCE_EDIT_REPLACEMENT_TEXT',
    mutationReplacementFileEnv: 'DIRECTIVE_MESSAGE_MUTATION_SOURCE_EDIT_REPLACEMENT_FILE'
  },
  {
    id: 'assistant-edit',
    reportKey: 'assistantEdit',
    script: 'tools/scripts/run-sillytavern-message-edit-live.mjs',
    runIdEnv: 'DIRECTIVE_MESSAGE_EDIT_RUN_ID',
    liveEnv: 'DIRECTIVE_MESSAGE_EDIT_LIVE',
    writeEnv: 'DIRECTIVE_MESSAGE_EDIT_WRITE',
    targetEnv: 'DIRECTIVE_MESSAGE_EDIT_TARGET_MESID',
    targetOption: 'assistantEditMesid',
    targetMutationEnv: 'DIRECTIVE_MESSAGE_MUTATION_ASSISTANT_EDIT_MESID',
    replacementTextEnv: 'DIRECTIVE_MESSAGE_EDIT_REPLACEMENT_TEXT',
    replacementFileEnv: 'DIRECTIVE_MESSAGE_EDIT_REPLACEMENT_FILE',
    replacementTextOption: 'assistantEditReplacementText',
    replacementFileOption: 'assistantEditReplacementFile',
    mutationReplacementTextEnv: 'DIRECTIVE_MESSAGE_MUTATION_ASSISTANT_EDIT_REPLACEMENT_TEXT',
    mutationReplacementFileEnv: 'DIRECTIVE_MESSAGE_MUTATION_ASSISTANT_EDIT_REPLACEMENT_FILE'
  },
  {
    id: 'source-delete',
    reportKey: 'sourceDelete',
    script: 'tools/scripts/run-sillytavern-message-delete-live.mjs',
    runIdEnv: 'DIRECTIVE_MESSAGE_DELETE_RUN_ID',
    liveEnv: 'DIRECTIVE_MESSAGE_DELETE_LIVE',
    writeEnv: 'DIRECTIVE_MESSAGE_DELETE_WRITE',
    targetEnv: 'DIRECTIVE_MESSAGE_DELETE_TARGET_MESID',
    targetOption: 'sourceDeleteMesid',
    targetMutationEnv: 'DIRECTIVE_MESSAGE_MUTATION_SOURCE_DELETE_MESID'
  },
  {
    id: 'assistant-delete',
    reportKey: 'assistantDelete',
    script: 'tools/scripts/run-sillytavern-message-delete-live.mjs',
    runIdEnv: 'DIRECTIVE_MESSAGE_DELETE_RUN_ID',
    liveEnv: 'DIRECTIVE_MESSAGE_DELETE_LIVE',
    writeEnv: 'DIRECTIVE_MESSAGE_DELETE_WRITE',
    targetEnv: 'DIRECTIVE_MESSAGE_DELETE_TARGET_MESID',
    targetOption: 'assistantDeleteMesid',
    targetMutationEnv: 'DIRECTIVE_MESSAGE_MUTATION_ASSISTANT_DELETE_MESID'
  },
  {
    id: 'selected-swipe',
    reportKey: 'selectedSwipe',
    script: 'tools/scripts/smoke-scene-handshake-live.mjs',
    selectedSwipe: true
  }
]);

function usage() {
  return `Usage:
  node tools/scripts/run-sillytavern-message-mutation-actuation-live.mjs [--live] [--strict] [--write-artifacts]

Runs or assembles the full message mutation actuation proof:
  source-edit, source-delete, assistant-edit, assistant-delete, selected-swipe.

Safe assembly mode:
  --source-edit-report PATH
  --source-delete-report PATH
  --assistant-edit-report PATH
  --assistant-delete-report PATH
  --selected-swipe-report PATH

Live mode requires a non-human SillyTavern user plus explicit targets:
  --live
  --st-user directive-soak-b
  --base-url http://127.0.0.1:8000
  --resume-save-id save-...
  --resume-chat-id "Directive - ..."
  --source-edit-mesid 12
  --source-edit-replacement-text "..."
  --assistant-edit-mesid 13
  --assistant-edit-replacement-text "..."
  --source-delete-mesid 14
  --assistant-delete-mesid 15

Options:
  --artifact-root PATH       Root for actuation runner artifacts.
  --run-id ID                Stable run id.
  --output PATH              Write the final live-run report to this path.
  --timeout-ms N             Per-child timeout in milliseconds.
`;
}

function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const options = {
    help: false,
    live: false,
    strict: env.DIRECTIVE_MESSAGE_MUTATION_ACTUATION_STRICT === '1',
    writeArtifacts: false,
    runId: env.DIRECTIVE_MESSAGE_MUTATION_ACTUATION_RUN_ID || `message-mutation-actuation-${createRunId()}`,
    artifactRoot: env.DIRECTIVE_MESSAGE_MUTATION_ACTUATION_ARTIFACT_ROOT || path.join(DEFAULT_SOAK_ARTIFACT_ROOT, 'message-mutation-actuation'),
    output: '',
    timeoutMs: positiveInteger(env.DIRECTIVE_MESSAGE_MUTATION_ACTUATION_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    baseUrl: env.SILLYTAVERN_BASE_URL || env.ST_BASE_URL || '',
    stUser: env.DIRECTIVE_SILLYTAVERN_USER || env.DIRECTIVE_SOAK_ST_USER || '',
    allowedUsers: parseConfiguredSoakUsers(env.DIRECTIVE_SOAK_ST_USERS || env.DIRECTIVE_PARALLEL_SOAK_USERS || ''),
    resumeSaveId: env.DIRECTIVE_SILLYTAVERN_RESUME_SAVE_ID || '',
    resumeChatId: env.DIRECTIVE_SILLYTAVERN_RESUME_CHAT_ID || '',
    reports: {
      sourceEdit: '',
      sourceDelete: '',
      assistantEdit: '',
      assistantDelete: '',
      selectedSwipe: ''
    },
    liveInputs: {
      sourceEditMesid: env.DIRECTIVE_MESSAGE_MUTATION_SOURCE_EDIT_MESID || '',
      sourceDeleteMesid: env.DIRECTIVE_MESSAGE_MUTATION_SOURCE_DELETE_MESID || '',
      assistantEditMesid: env.DIRECTIVE_MESSAGE_MUTATION_ASSISTANT_EDIT_MESID || '',
      assistantDeleteMesid: env.DIRECTIVE_MESSAGE_MUTATION_ASSISTANT_DELETE_MESID || '',
      sourceEditReplacementText: env.DIRECTIVE_MESSAGE_MUTATION_SOURCE_EDIT_REPLACEMENT_TEXT || '',
      sourceEditReplacementFile: env.DIRECTIVE_MESSAGE_MUTATION_SOURCE_EDIT_REPLACEMENT_FILE || '',
      assistantEditReplacementText: env.DIRECTIVE_MESSAGE_MUTATION_ASSISTANT_EDIT_REPLACEMENT_TEXT || '',
      assistantEditReplacementFile: env.DIRECTIVE_MESSAGE_MUTATION_ASSISTANT_EDIT_REPLACEMENT_FILE || ''
    }
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index] || '';
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--live') options.live = true;
    else if (arg === '--strict') options.strict = true;
    else if (arg === '--write-artifacts') options.writeArtifacts = true;
    else if (arg === '--run-id') options.runId = next();
    else if (arg.startsWith('--run-id=')) options.runId = arg.slice('--run-id='.length);
    else if (arg === '--artifact-root') options.artifactRoot = next();
    else if (arg.startsWith('--artifact-root=')) options.artifactRoot = arg.slice('--artifact-root='.length);
    else if (arg === '--output') options.output = next();
    else if (arg.startsWith('--output=')) options.output = arg.slice('--output='.length);
    else if (arg === '--timeout-ms') options.timeoutMs = positiveInteger(next(), DEFAULT_TIMEOUT_MS);
    else if (arg === '--base-url') options.baseUrl = next();
    else if (arg === '--st-user') options.stUser = next();
    else if (arg === '--resume-save-id') options.resumeSaveId = next();
    else if (arg === '--resume-chat-id') options.resumeChatId = next();
    else if (arg === '--source-edit-report') options.reports.sourceEdit = next();
    else if (arg === '--source-delete-report') options.reports.sourceDelete = next();
    else if (arg === '--assistant-edit-report') options.reports.assistantEdit = next();
    else if (arg === '--assistant-delete-report') options.reports.assistantDelete = next();
    else if (arg === '--selected-swipe-report') options.reports.selectedSwipe = next();
    else if (arg === '--source-edit-mesid') options.liveInputs.sourceEditMesid = next();
    else if (arg === '--source-delete-mesid') options.liveInputs.sourceDeleteMesid = next();
    else if (arg === '--assistant-edit-mesid') options.liveInputs.assistantEditMesid = next();
    else if (arg === '--assistant-delete-mesid') options.liveInputs.assistantDeleteMesid = next();
    else if (arg === '--source-edit-replacement-text') options.liveInputs.sourceEditReplacementText = next();
    else if (arg === '--source-edit-replacement-file') options.liveInputs.sourceEditReplacementFile = next();
    else if (arg === '--assistant-edit-replacement-text') options.liveInputs.assistantEditReplacementText = next();
    else if (arg === '--assistant-edit-replacement-file') options.liveInputs.assistantEditReplacementFile = next();
    else throw new Error(`Unknown option: ${arg}`);
  }
  return normalizeOptions(options);
}

function normalizeOptions(options) {
  const live = options.live === true;
  return {
    ...options,
    live,
    strict: options.strict === true || live,
    runId: String(options.runId || `message-mutation-actuation-${createRunId()}`).trim(),
    artifactRoot: path.resolve(String(options.artifactRoot || path.join(DEFAULT_SOAK_ARTIFACT_ROOT, 'message-mutation-actuation'))),
    output: options.output ? path.resolve(options.output) : '',
    baseUrl: String(options.baseUrl || '').trim(),
    stUser: normalizeUser(options.stUser),
    allowedUsers: Array.isArray(options.allowedUsers) ? [...new Set(options.allowedUsers.map(normalizeUser).filter(Boolean))] : [],
    resumeSaveId: String(options.resumeSaveId || '').trim(),
    resumeChatId: String(options.resumeChatId || '').trim(),
    reports: Object.fromEntries(Object.entries(options.reports || {}).map(([key, value]) => [
      key,
      value ? path.resolve(String(value)) : ''
    ])),
    liveInputs: Object.fromEntries(Object.entries(options.liveInputs || {}).map(([key, value]) => [
      key,
      String(value || '').trim()
    ]))
  };
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeUser(value = '') {
  return String(value || '').trim().toLowerCase();
}

function parseConfiguredSoakUsers(raw = '') {
  const text = String(raw || '').trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry) => (typeof entry === 'string' ? entry : entry?.handle || entry?.user || entry?.name || ''))
        .map(normalizeUser)
        .filter(Boolean);
    }
  } catch {
    // Fall through to comma/semicolon parsing.
  }
  return text
    .split(/[;,]/)
    .map((entry) => {
      const [handle] = entry.split(':');
      return normalizeUser(handle);
    })
    .filter(Boolean);
}

function isNonHumanUser(value = '') {
  const normalized = normalizeUser(value);
  return Boolean(normalized && normalized !== 'default-user');
}

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function relativeManifest(rootDir, filePath) {
  if (!filePath) return '';
  return path.relative(rootDir, filePath).replace(/\\/g, '/');
}

function writeManifest(filePath, rootDir, reports) {
  const manifest = {
    sourceEdit: relativeManifest(rootDir, reports.sourceEdit),
    sourceDelete: relativeManifest(rootDir, reports.sourceDelete),
    assistantEdit: relativeManifest(rootDir, reports.assistantEdit),
    assistantDelete: relativeManifest(rootDir, reports.assistantDelete),
    selectedSwipe: relativeManifest(rootDir, reports.selectedSwipe)
  };
  writeJsonFile(filePath, manifest);
  return manifest;
}

function scenarioRunId(runId, scenarioId) {
  return `${runId}-${scenarioId}`;
}

function scenarioReportPath(childRoot, runId, scenarioId) {
  return path.join(childRoot, scenarioRunId(runId, scenarioId), 'report.json');
}

function childProcessResult(command, args, options = {}) {
  const timeoutMs = positiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS);
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: options.env || process.env,
      shell: false,
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) child.kill('SIGTERM');
    }, timeoutMs);
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, exitCode: null, signal: null, stdout, stderr, error: errorSummary(error), timedOut: false });
    });
    child.on('close', (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const timedOut = signal === 'SIGTERM' && exitCode === null;
      resolve({ ok: exitCode === 0 && !timedOut, exitCode, signal, stdout, stderr, error: null, timedOut });
    });
  });
}

function errorSummary(error) {
  return error ? { name: error.name || 'Error', message: error.message || String(error) } : null;
}

function parseJsonFromStdout(stdout = '') {
  const text = String(stdout || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function stdoutHash(value = '') {
  return value ? sha256Text(value).slice(0, 16) : null;
}

function isRawTextField(key, value) {
  const normalized = String(key || '').toLowerCase();
  return typeof value === 'string'
    && value.trim()
    && (FORBIDDEN_RAW_TEXT_KEYS.has(normalized) || normalized.endsWith('textpreview'));
}

function sanitizeParsedArtifact(value, state = { redactedCount: 0 }) {
  if (Array.isArray(value)) return value.map((entry) => sanitizeParsedArtifact(entry, state));
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (isRawTextField(key, child)) {
      state.redactedCount += 1;
      const hashKey = `${key}Hash`;
      if (!Object.prototype.hasOwnProperty.call(output, hashKey)) output[hashKey] = sha256Text(child).slice(0, 16);
      output[`${key}Length`] = child.length;
      continue;
    }
    output[key] = sanitizeParsedArtifact(child, state);
  }
  return output;
}

function sanitizeChildArtifact(value) {
  const state = { redactedCount: 0 };
  const artifact = sanitizeParsedArtifact(value, state);
  if (state.redactedCount > 0 && artifact && typeof artifact === 'object' && !Array.isArray(artifact)) {
    artifact.artifactRedaction = {
      rawTextFieldCount: state.redactedCount,
      strategy: 'hash-and-length'
    };
  }
  return artifact;
}

function livePrerequisites(options) {
  const failures = [];
  if (!options.baseUrl) failures.push('SILLYTAVERN_BASE_URL or --base-url is required for live mutation actuation.');
  if (!isNonHumanUser(options.stUser)) failures.push('DIRECTIVE_SILLYTAVERN_USER or --st-user must be a non-human soak user.');
  if (options.allowedUsers?.length && !options.allowedUsers.includes(options.stUser)) {
    failures.push(`DIRECTIVE_SILLYTAVERN_USER ${options.stUser || '(missing)'} is not in configured DIRECTIVE_SOAK_ST_USERS.`);
  }
  if (!options.resumeSaveId) failures.push('DIRECTIVE_SILLYTAVERN_RESUME_SAVE_ID or --resume-save-id is required for edit/delete child runs.');
  if (!options.resumeChatId) failures.push('DIRECTIVE_SILLYTAVERN_RESUME_CHAT_ID or --resume-chat-id is required for edit/delete child runs.');
  failures.push(...targetMesidSafetyFailures(options));
  return failures;
}

function targetMesidSafetyFailures(options) {
  const entries = SCENARIOS
    .filter((definition) => definition.targetOption)
    .map((definition) => ({
      id: definition.id,
      mesid: String(options.liveInputs?.[definition.targetOption] || '').trim()
    }))
    .filter((entry) => entry.mesid);
  const seen = new Map();
  const failures = [];
  for (const entry of entries) {
    if (!/^\d+$/.test(entry.mesid)) {
      failures.push(`${entry.id} target mesid must be a numeric SillyTavern message index, got ${entry.mesid}.`);
    }
    const existing = seen.get(entry.mesid);
    if (existing) failures.push(`duplicate target mesid ${entry.mesid} for ${existing} and ${entry.id}; use distinct live rows because edit/delete scenarios mutate chat state.`);
    else seen.set(entry.mesid, entry.id);
  }
  const sourceDelete = entries.find((entry) => entry.id === 'source-delete');
  const assistantDelete = entries.find((entry) => entry.id === 'assistant-delete');
  if (sourceDelete && assistantDelete && /^\d+$/.test(sourceDelete.mesid) && /^\d+$/.test(assistantDelete.mesid)) {
    if (Number(sourceDelete.mesid) <= Number(assistantDelete.mesid)) {
      failures.push(`unsafe delete ordering: source-delete mesid ${sourceDelete.mesid} runs before assistant-delete mesid ${assistantDelete.mesid}; choose a source-delete row with a higher mesid than assistant-delete or run separate proof assembly.`);
    }
  }
  return failures;
}

function missingLiveInputsForScenario(definition, options) {
  if (definition.selectedSwipe) return [];
  const failures = [];
  const target = options.liveInputs[definition.targetOption];
  if (!target) failures.push(`${definition.id} target mesid is required`);
  if (definition.replacementTextOption) {
    const replacementText = options.liveInputs[definition.replacementTextOption];
    const replacementFile = options.liveInputs[definition.replacementFileOption];
    if (!replacementText && !replacementFile) failures.push(`${definition.id} replacement text or file is required`);
  }
  return failures;
}

function childEnvForScenario(definition, options, childRoot, baseEnv) {
  const env = {
    ...baseEnv,
    SILLYTAVERN_BASE_URL: options.baseUrl,
    DIRECTIVE_SILLYTAVERN_USER: options.stUser,
    DIRECTIVE_SILLYTAVERN_RESUME_SAVE_ID: options.resumeSaveId,
    DIRECTIVE_SILLYTAVERN_RESUME_CHAT_ID: options.resumeChatId,
    DIRECTIVE_SOAK_ARTIFACT_DIR: childRoot,
    DIRECTIVE_SILLYTAVERN_LIVE_LOG_PATH: path.join(options.runRoot, 'live-log.jsonl')
  };
  if (definition.selectedSwipe) return env;
  env[definition.runIdEnv] = scenarioRunId(options.runId, definition.id);
  env[definition.liveEnv] = '1';
  env[definition.writeEnv] = '1';
  env[definition.targetEnv] = options.liveInputs[definition.targetOption];
  if (definition.id.includes('edit')) env.DIRECTIVE_MESSAGE_EDIT_SEGMENT = definition.id;
  if (definition.id.includes('delete')) env.DIRECTIVE_MESSAGE_DELETE_SEGMENT = definition.id;
  if (definition.replacementTextEnv) {
    const replacementText = options.liveInputs[definition.replacementTextOption];
    const replacementFile = options.liveInputs[definition.replacementFileOption];
    delete env[definition.replacementTextEnv];
    delete env[definition.replacementFileEnv];
    if (replacementFile) env[definition.replacementFileEnv] = replacementFile;
    else env[definition.replacementTextEnv] = replacementText;
  }
  return env;
}

async function runScenario(definition, options, {
  childRoot,
  runChild = childProcessResult,
  baseEnv = process.env
} = {}) {
  const providedReport = options.reports[definition.reportKey];
  if (providedReport) {
    return {
      id: definition.id,
      status: fs.existsSync(providedReport) ? 'pass' : 'fail',
      source: 'provided-report',
      reportPath: providedReport,
      failures: fs.existsSync(providedReport) ? [] : [`provided report does not exist: ${providedReport}`]
    };
  }
  if (!options.live) {
    return {
      id: definition.id,
      status: 'fail',
      source: 'missing-report',
      reportPath: '',
      failures: [`${definition.id} report is required unless --live is set`]
    };
  }
  const inputFailures = missingLiveInputsForScenario(definition, options);
  if (inputFailures.length) {
    return { id: definition.id, status: 'fail', source: 'live-child', reportPath: '', failures: inputFailures };
  }
  const env = childEnvForScenario(definition, options, childRoot, baseEnv);
  const command = process.execPath;
  const args = [definition.script, '--live', '--write-artifacts'].filter((entry) => !(definition.selectedSwipe && entry === '--write-artifacts'));
  const child = await runChild(command, args, { env, timeoutMs: options.timeoutMs, scenario: definition.id });
  if (definition.selectedSwipe) {
    const parsed = parseJsonFromStdout(child.stdout);
    const reportPath = path.join(childRoot, `${options.runId}-selected-swipe.json`);
    if (parsed) writeJsonFile(reportPath, sanitizeChildArtifact(parsed));
    return {
      id: definition.id,
      status: child.ok && parsed ? 'pass' : 'fail',
      source: 'live-child',
      reportPath: parsed ? reportPath : '',
      child: summarizeChild(child),
      failures: child.ok && parsed ? [] : [`selected-swipe child failed or did not emit parseable JSON`]
    };
  }
  const reportPath = scenarioReportPath(childRoot, options.runId, definition.id);
  return {
    id: definition.id,
    status: child.ok && fs.existsSync(reportPath) ? 'pass' : 'fail',
    source: 'live-child',
    reportPath,
    child: summarizeChild(child),
    failures: child.ok && fs.existsSync(reportPath) ? [] : [`${definition.id} child failed or did not write report.json`]
  };
}

function summarizeChild(child = {}) {
  return {
    ok: child.ok === true,
    exitCode: child.exitCode ?? null,
    signal: child.signal || null,
    timedOut: child.timedOut === true,
    stdoutHash: stdoutHash(child.stdout),
    stderrHash: stdoutHash(child.stderr),
    stderrLength: String(child.stderr || '').length,
    error: child.error || null
  };
}

export async function runMessageMutationActuation({
  options,
  runChild = childProcessResult,
  env = process.env
} = {}) {
  const normalized = normalizeOptions(options || parseArgs([], env));
  normalized.runRoot = path.join(normalized.artifactRoot, normalized.runId);
  const childRoot = path.join(normalized.runRoot, 'children');
  const failures = [];
  if (normalized.live) failures.push(...livePrerequisites(normalized));
  ensureDirectory(normalized.runRoot);
  ensureDirectory(childRoot);

  const scenarioResults = [];
  if (!failures.length) {
    for (const definition of SCENARIOS) {
      const result = await runScenario(definition, normalized, { childRoot, runChild, baseEnv: env });
      scenarioResults.push(result);
      if (result.status === 'fail' && normalized.live) break;
    }
  }
  const reports = {
    sourceEdit: scenarioResults.find((entry) => entry.id === 'source-edit')?.reportPath || normalized.reports.sourceEdit,
    sourceDelete: scenarioResults.find((entry) => entry.id === 'source-delete')?.reportPath || normalized.reports.sourceDelete,
    assistantEdit: scenarioResults.find((entry) => entry.id === 'assistant-edit')?.reportPath || normalized.reports.assistantEdit,
    assistantDelete: scenarioResults.find((entry) => entry.id === 'assistant-delete')?.reportPath || normalized.reports.assistantDelete,
    selectedSwipe: scenarioResults.find((entry) => entry.id === 'selected-swipe')?.reportPath || normalized.reports.selectedSwipe
  };
  const manifestPath = path.join(normalized.runRoot, 'message-mutation-actuation-manifest.json');
  const manifest = writeManifest(manifestPath, normalized.runRoot, reports);
  writeJsonFile(path.join(normalized.runRoot, 'children.json'), scenarioResults);
  const proof = buildMessageMutationActuationProof({
    manifest: manifestPath,
    strict: normalized.strict
  });
  const proofPath = writeMessageMutationActuationProof(proof, {
    output: path.join(normalized.runRoot, 'message-mutation-actuation-proof.json'),
    manifest: manifestPath
  });
  const childFailures = scenarioResults.flatMap((entry) => entry.failures.map((failure) => `${entry.id}: ${failure}`));
  const allFailures = [...failures, ...childFailures, ...proof.failures];
  const status = allFailures.length || proof.status === 'fail' ? 'fail' : proof.status;
  const report = {
    kind: REPORT_KIND,
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    runId: normalized.runId,
    status,
    ok: status === 'pass',
    live: normalized.live,
    strict: normalized.strict,
    artifactRoot: normalized.runRoot,
    sillyTavernUser: normalized.stUser || null,
    defaultUserTouched: normalizeUser(normalized.stUser) === 'default-user',
    manifestPath,
    proofPath,
    manifest,
    scenarios: scenarioResults,
    proof: {
      status: proof.status,
      ok: proof.ok === true,
      servedExtension: proof.servedExtension || null,
      scenarioStatuses: proof.scenarios.map((entry) => ({ id: entry.id, status: entry.status }))
    },
    failures: allFailures,
    warnings: proof.warnings || []
  };
  const outputPath = normalized.output || path.join(normalized.runRoot, 'message-mutation-actuation-live-run.json');
  if (normalized.writeArtifacts || normalized.output || normalized.live) writeJsonFile(outputPath, report);
  return { report, outputPath };
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    console.log(usage());
    return;
  }
  const { report, outputPath } = await runMessageMutationActuation({ options });
  console.log(JSON.stringify({
    ok: report.ok,
    status: report.status,
    runId: report.runId,
    output: outputPath,
    manifestPath: report.manifestPath,
    proofPath: report.proofPath,
    scenarios: report.scenarios.map((entry) => ({ id: entry.id, status: entry.status, source: entry.source, reportPath: entry.reportPath || null })),
    failures: report.failures,
    warnings: report.warnings
  }, null, 2));
  if (report.status !== 'pass') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}
