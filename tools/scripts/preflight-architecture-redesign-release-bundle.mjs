import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPORT_KIND = 'directive.architectureRedesign.releaseBundlePreflight.v1';
const EXPECTED_CONTINUITY_PREFLIGHT_KIND = 'directive.continuityProjectionMatrix.fullCertificationPreflight.v1';
const EXPECTED_MESSAGE_MUTATION_DISCOVERY_KIND = 'directive.sillytavernMessageMutation.discovery';
const EXPECTED_MESSAGE_MUTATION_ACTUATION_KIND = 'directive.sillytavernMessageMutation.actuationProof.v1';

const TERMINAL_EXPECTED_STATUSES = Object.freeze({
  saveTerminalBranch: 'pending',
  replayFromCheckpoint: 'replayed',
  pushOn: 'pushedOn',
  keepEnding: 'keptEnding'
});

const REQUIRED_MESSAGE_MUTATION_SCENARIOS = Object.freeze([
  'source-edit',
  'source-delete',
  'assistant-edit',
  'assistant-delete',
  'selected-swipe'
]);

function usage() {
  return `Usage:
  node tools/scripts/preflight-architecture-redesign-release-bundle.mjs --manifest <file> [--strict] [--write-artifacts]

Options:
  --manifest PATH                         JSON manifest with release evidence artifact paths.
  --continuity-preflight PATH             Full certification preflight JSON.
  --command-bearing-closure PATH          Command Bearing closure live report.
  --command-bearing-point PATH            Command Bearing point lifecycle live report.
  --terminal-catastrophic PATH            Terminal endings report for catastrophic-command trigger.
  --terminal-command-fitness PATH         Terminal endings report for command-fitness-ladder trigger.
  --message-mutation-discovery PATH       Read-only message mutation discovery report.
  --message-mutation-actuation PATH       Message mutation actuation proof report.
  --strict                                Any warning fails the bundle.
  --write-artifacts                       Write architecture-redesign-release-bundle-preflight.json.
  --output PATH                           Write report to an explicit path.
`;
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    manifest: '',
    strict: process.env.DIRECTIVE_ARCHITECTURE_RELEASE_BUNDLE_STRICT === '1',
    writeArtifacts: false,
    output: '',
    paths: {
      continuityPreflight: '',
      commandBearingClosure: '',
      commandBearingPoint: '',
      terminalCatastrophic: '',
      terminalCommandFitness: '',
      messageMutationDiscovery: '',
      messageMutationActuation: ''
    },
    help: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--manifest') options.manifest = path.resolve(argv[++index] || '');
    else if (arg.startsWith('--manifest=')) options.manifest = path.resolve(arg.slice('--manifest='.length));
    else if (arg === '--strict') options.strict = true;
    else if (arg === '--write-artifacts') options.writeArtifacts = true;
    else if (arg === '--output') options.output = path.resolve(argv[++index] || '');
    else if (arg.startsWith('--output=')) options.output = path.resolve(arg.slice('--output='.length));
    else if (arg === '--continuity-preflight') options.paths.continuityPreflight = path.resolve(argv[++index] || '');
    else if (arg === '--command-bearing-closure') options.paths.commandBearingClosure = path.resolve(argv[++index] || '');
    else if (arg === '--command-bearing-point') options.paths.commandBearingPoint = path.resolve(argv[++index] || '');
    else if (arg === '--terminal-catastrophic') options.paths.terminalCatastrophic = path.resolve(argv[++index] || '');
    else if (arg === '--terminal-command-fitness') options.paths.terminalCommandFitness = path.resolve(argv[++index] || '');
    else if (arg === '--message-mutation-discovery') options.paths.messageMutationDiscovery = path.resolve(argv[++index] || '');
    else if (arg === '--message-mutation-actuation') options.paths.messageMutationActuation = path.resolve(argv[++index] || '');
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function readJson(filePath) {
  if (!filePath) return null;
  if (!fs.existsSync(filePath)) return { __readError: { message: 'file does not exist' } };
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return { __readError: { message: error?.message || String(error) } };
  }
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return filePath;
}

function resolveManifestPath(baseDir, value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return path.resolve(path.isAbsolute(raw) ? raw : path.join(baseDir, raw));
}

function loadManifest(filePath) {
  if (!filePath) return {};
  const manifest = readJson(filePath);
  if (!manifest || manifest.__readError) {
    return { __readError: manifest?.__readError || { message: 'manifest path is missing' } };
  }
  const baseDir = path.dirname(filePath);
  return {
    continuityPreflight: resolveManifestPath(baseDir, manifest.continuityPreflight || manifest.continuityFullCertificationPreflight),
    commandBearingClosure: resolveManifestPath(baseDir, manifest.commandBearingClosure),
    commandBearingPoint: resolveManifestPath(baseDir, manifest.commandBearingPoint || manifest.commandBearingPointLifecycle),
    terminalCatastrophic: resolveManifestPath(baseDir, manifest.terminalCatastrophic),
    terminalCommandFitness: resolveManifestPath(baseDir, manifest.terminalCommandFitness || manifest.terminalCommandFitnessLadder),
    messageMutationDiscovery: resolveManifestPath(baseDir, manifest.messageMutationDiscovery),
    messageMutationActuation: resolveManifestPath(baseDir, manifest.messageMutationActuation || manifest.messageMutationActuationProof)
  };
}

function compact(value = '', max = 220) {
  const text = String(value || '');
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 3))}...`;
}

function check(id, status, summary, details = null) {
  return {
    id,
    status,
    summary,
    ...(details ? { details } : {})
  };
}

function readArtifactCheck(id, filePath) {
  const artifact = readJson(filePath);
  if (!filePath) {
    return {
      artifact: null,
      check: check(id, 'fail', 'Required artifact path is missing.', { filePath: null })
    };
  }
  if (!artifact || artifact.__readError) {
    return {
      artifact: null,
      check: check(id, 'fail', `Required artifact could not be read: ${artifact?.__readError?.message || 'unknown read error'}.`, { filePath })
    };
  }
  return {
    artifact,
    check: null
  };
}

function isNonHumanUser(value) {
  const user = String(value || '').trim().toLowerCase();
  return Boolean(user && user !== 'default-user');
}

function servedExtensionFresh(report = {}) {
  if (report.servedExtension) {
    return report.servedExtension.ok === true
      && Number(report.servedExtension.mismatchCount || 0) === 0
      && Number(report.servedExtension.servedFailureCount || 0) === 0;
  }
  if (report.staleCheck) {
    return report.staleCheck.ok === true && report.staleCheck.skipped !== true;
  }
  return false;
}

function validateContinuityPreflight(filePath) {
  const { artifact, check: readFailure } = readArtifactCheck('continuity-full-certification-preflight', filePath);
  if (readFailure) return readFailure;
  const failures = [];
  if (artifact.kind !== EXPECTED_CONTINUITY_PREFLIGHT_KIND) failures.push('kind');
  if (artifact.status !== 'pass') failures.push('status');
  if (artifact.strict !== true) failures.push('strict');
  const failingChecks = (artifact.checks || []).filter((entry) => entry?.status !== 'pass');
  if (failingChecks.length) failures.push('checks');
  return check(
    'continuity-full-certification-preflight',
    failures.length ? 'fail' : 'pass',
    failures.length
      ? `Continuity Matrix full-certification preflight is not release-ready: ${failures.join(', ')}.`
      : 'Continuity Matrix full-certification preflight passed in strict mode.',
    {
      filePath,
      kind: artifact.kind || null,
      status: artifact.status || null,
      strict: artifact.strict === true,
      failingChecks: failingChecks.map((entry) => ({ id: entry.id, status: entry.status, summary: compact(entry.summary) }))
    }
  );
}

function validateCommandBearingClosure(filePath) {
  const { artifact, check: readFailure } = readArtifactCheck('command-bearing-closure-live-proof', filePath);
  if (readFailure) return readFailure;
  const reviewRecords = Array.isArray(artifact.review?.records) ? artifact.review.records : [];
  const failures = [];
  if (artifact.ok !== true || artifact.status !== 'pass') failures.push('status');
  if (artifact.driver !== 'playwright') failures.push('driver');
  if (!isNonHumanUser(artifact.stUser)) failures.push('non-human user');
  if (artifact.defaultUserTouched !== false) failures.push('default-user isolation');
  if (!servedExtensionFresh(artifact)) failures.push('served extension freshness');
  if (artifact.fixtureBacked !== true) failures.push('fixture isolation');
  if (!artifact.isolation?.branchSaveId) failures.push('branch save');
  if (!Array.isArray(artifact.closure?.evidenceIds) || !artifact.closure.evidenceIds.length) failures.push('closure evidence');
  if (!reviewRecords.length) failures.push('review records');
  return check(
    'command-bearing-closure-live-proof',
    failures.length ? 'fail' : 'pass',
    failures.length
      ? `Command Bearing closure artifact is missing release evidence: ${failures.join(', ')}.`
      : 'Command Bearing closure artifact proves fixture-backed live review, branch persistence, and non-human user isolation.',
    {
      filePath,
      status: artifact.status || null,
      stUser: artifact.stUser || null,
      branchSaveId: artifact.isolation?.branchSaveId || null,
      reviewRecordCount: reviewRecords.length,
      evidenceIdCount: artifact.closure?.evidenceIds?.length || 0
    }
  );
}

function validateCommandBearingPoint(filePath) {
  const { artifact, check: readFailure } = readArtifactCheck('command-bearing-point-lifecycle-live-proof', filePath);
  if (readFailure) return readFailure;
  const gate = artifact.gateEvidence || {};
  const failures = [];
  if (artifact.ok !== true || artifact.status !== 'pass') failures.push('status');
  if (artifact.driver !== 'playwright') failures.push('driver');
  if (!isNonHumanUser(artifact.stUser)) failures.push('non-human user');
  if (artifact.defaultUserTouched !== false) failures.push('default-user isolation');
  if (!servedExtensionFresh(artifact)) failures.push('served extension freshness');
  if (!artifact.branchSaveId) failures.push('branch save');
  for (const key of ['rankReserveChecked', 'readyCancelChecked', 'validSpendChecked', 'controlledNarrationChecked']) {
    if (gate[key] !== true) failures.push(key);
  }
  return check(
    'command-bearing-point-lifecycle-live-proof',
    failures.length ? 'fail' : 'pass',
    failures.length
      ? `Command Bearing point lifecycle artifact is missing release evidence: ${failures.join(', ')}.`
      : 'Command Bearing point lifecycle artifact proves reserve/recovery, ready/cancel, valid spend, and controlled narration.',
    {
      filePath,
      status: artifact.status || null,
      stUser: artifact.stUser || null,
      branchSaveId: artifact.branchSaveId || null,
      gateEvidence: gate
    }
  );
}

function validateTerminalReport(filePath, { id, triggerKind }) {
  const { artifact, check: readFailure } = readArtifactCheck(id, filePath);
  if (readFailure) return readFailure;
  const scenarios = Array.isArray(artifact.scenarios) ? artifact.scenarios : [];
  const failures = [];
  if (artifact.ok !== true) failures.push('status');
  if (!artifact.driver) failures.push('driver');
  const user = artifact.authenticatedUser?.handle || artifact.user || artifact.stUser || null;
  if (!isNonHumanUser(user)) failures.push('non-human user');
  if (!servedExtensionFresh(artifact)) failures.push('served extension freshness');
  const missingActions = [];
  for (const [action, expectedStatus] of Object.entries(TERMINAL_EXPECTED_STATUSES)) {
    const match = scenarios.find((scenario) => scenario?.triggerKind === triggerKind
      && scenario?.expectedAction === action
      && scenario?.resolved?.decisionStatus === expectedStatus);
    if (!match) missingActions.push(`${action}:${expectedStatus}`);
  }
  if (missingActions.length) failures.push('scenario coverage');
  return check(
    id,
    failures.length ? 'fail' : 'pass',
    failures.length
      ? `Terminal ${triggerKind} artifact is missing release evidence: ${failures.join(', ')}.`
      : `Terminal ${triggerKind} artifact proves branch, replay, Push On, and Keep Ending decisions.`,
    {
      filePath,
      triggerKind,
      user,
      scenarioCount: scenarios.length,
      missingActions
    }
  );
}

function validateMessageMutationDiscovery(filePath) {
  const { artifact, check: readFailure } = readArtifactCheck('message-mutation-discovery-live-proof', filePath);
  if (readFailure) return readFailure;
  const recommendations = artifact.inspected?.recommendations || {};
  const failures = [];
  if (artifact.kind !== EXPECTED_MESSAGE_MUTATION_DISCOVERY_KIND) failures.push('kind');
  if (artifact.status !== 'pass' || artifact.mode !== 'live-read-only') failures.push('live read-only status');
  if (!isNonHumanUser(artifact.sillyTavernUser)) failures.push('non-human user');
  for (const key of ['hasMessageEditedEvent', 'hasMessageDeletedEvent', 'hasVisibleEditDeleteControls', 'directiveActionsHaveGeometry']) {
    if (recommendations[key] !== true) failures.push(key);
  }
  return check(
    'message-mutation-discovery-live-proof',
    failures.length ? 'fail' : 'pass',
    failures.length
      ? `Message mutation discovery artifact is missing release evidence: ${failures.join(', ')}.`
      : 'Message mutation discovery artifact proves the live host exposes edit/delete events and reachable controls.',
    {
      filePath,
      status: artifact.status || null,
      mode: artifact.mode || null,
      sillyTavernUser: artifact.sillyTavernUser || null,
      recommendations
    }
  );
}

function validateMessageMutationActuation(filePath) {
  const { artifact, check: readFailure } = readArtifactCheck('message-mutation-actuation-live-proof', filePath);
  if (readFailure) return readFailure;
  const scenarios = Array.isArray(artifact.scenarios) ? artifact.scenarios : [];
  const scenarioIds = new Set(scenarios.map((scenario) => scenario?.id || scenario?.scenarioId).filter(Boolean));
  const failures = [];
  if (artifact.kind !== EXPECTED_MESSAGE_MUTATION_ACTUATION_KIND) failures.push('kind');
  if (artifact.status !== 'pass' || artifact.ok === false) failures.push('status');
  if (artifact.driver !== 'playwright') failures.push('driver');
  if (!isNonHumanUser(artifact.sillyTavernUser || artifact.stUser)) failures.push('non-human user');
  if (artifact.defaultUserTouched !== false) failures.push('default-user isolation');
  if (!servedExtensionFresh(artifact)) failures.push('served extension freshness');
  if (Number(artifact.servedExtension?.childReportCount || 0) < REQUIRED_MESSAGE_MUTATION_SCENARIOS.length
    || Number(artifact.servedExtension?.freshChildReportCount || 0) < REQUIRED_MESSAGE_MUTATION_SCENARIOS.length
    || Number(artifact.servedExtension?.missingChildReportCount || 0) !== 0) {
    failures.push('served child report coverage');
  }
  const missingScenarios = REQUIRED_MESSAGE_MUTATION_SCENARIOS.filter((id) => !scenarioIds.has(id));
  if (missingScenarios.length) failures.push('scenario coverage');
  const failingScenarios = scenarios.filter((scenario) => scenario?.status !== 'pass' && scenario?.ok !== true);
  if (failingScenarios.length) failures.push('failing scenarios');
  const shallowScenarios = scenarios.filter((scenario) => {
    if (!scenario?.artifactPath) return true;
    if (!scenario?.evidence || typeof scenario.evidence !== 'object') return true;
    if (Object.keys(scenario.evidence).length === 0) return true;
    return false;
  });
  if (shallowScenarios.length) failures.push('shallow scenario evidence');
  const weakOwnerEvidenceScenarios = scenarios.filter((scenario) => {
    const id = scenario?.id || scenario?.scenarioId || '';
    const evidence = scenario?.evidence || {};
    if (['source-edit', 'source-delete', 'assistant-edit', 'assistant-delete'].includes(id)) {
      const proof = evidence.sourceMutationProof || {};
      return !proof.coreRecovery?.status
        || !(proof.coreRecovery.recoveryCaseId || proof.coreRecovery.id || proof.coreRecovery.transactionId)
        || !proof.repairDecision?.kind
        || !proof.repairDecision?.action
        || !proof.repairDecision?.eventType;
    }
    if (id === 'selected-swipe') {
      const proof = evidence.sourceIntegrityProof || {};
      return !proof.kind
        || !proof.selectedHostMessageId
        || proof.sourceIntegrity !== 'clean'
        || proof.hashMatched !== true;
    }
    return false;
  });
  if (weakOwnerEvidenceScenarios.length) failures.push('missing CORE/REPAIR owner evidence');
  return check(
    'message-mutation-actuation-live-proof',
    failures.length ? 'fail' : 'pass',
    failures.length
      ? `Message mutation actuation artifact is missing release evidence: ${failures.join(', ')}.`
      : 'Message mutation actuation artifact proves edit/delete/swipe recovery through live host controls.',
    {
      filePath,
      requiredScenarios: REQUIRED_MESSAGE_MUTATION_SCENARIOS,
      presentScenarios: [...scenarioIds],
      missingScenarios,
      failingScenarios: failingScenarios.map((scenario) => scenario?.id || scenario?.scenarioId || 'unknown'),
      shallowScenarios: shallowScenarios.map((scenario) => scenario?.id || scenario?.scenarioId || 'unknown'),
      weakOwnerEvidenceScenarios: weakOwnerEvidenceScenarios.map((scenario) => scenario?.id || scenario?.scenarioId || 'unknown')
    }
  );
}

function mergePaths(manifestPaths = {}, cliPaths = {}) {
  const keys = [
    'continuityPreflight',
    'commandBearingClosure',
    'commandBearingPoint',
    'terminalCatastrophic',
    'terminalCommandFitness',
    'messageMutationDiscovery',
    'messageMutationActuation'
  ];
  const merged = {};
  for (const key of keys) merged[key] = cliPaths[key] || manifestPaths[key] || '';
  return merged;
}

export function buildArchitectureReleaseBundlePreflight({
  manifest = '',
  paths = {},
  strict = false
} = {}) {
  const manifestPaths = loadManifest(manifest);
  const manifestReadError = manifestPaths.__readError || null;
  const evidencePaths = mergePaths(manifestReadError ? {} : manifestPaths, paths);
  const checks = [
    check(
      'manifest-readable',
      manifest && manifestReadError ? 'fail' : 'pass',
      manifest && manifestReadError
        ? `Bundle manifest could not be read: ${manifestReadError.message || 'unknown read error'}.`
        : manifest
          ? 'Bundle manifest is readable.'
          : 'Bundle artifact paths were supplied directly.',
      { manifest: manifest || null }
    ),
    validateContinuityPreflight(evidencePaths.continuityPreflight),
    validateCommandBearingClosure(evidencePaths.commandBearingClosure),
    validateCommandBearingPoint(evidencePaths.commandBearingPoint),
    validateTerminalReport(evidencePaths.terminalCatastrophic, {
      id: 'terminal-catastrophic-command-live-proof',
      triggerKind: 'catastrophic-command'
    }),
    validateTerminalReport(evidencePaths.terminalCommandFitness, {
      id: 'terminal-command-fitness-live-proof',
      triggerKind: 'command-fitness-ladder'
    }),
    validateMessageMutationDiscovery(evidencePaths.messageMutationDiscovery),
    validateMessageMutationActuation(evidencePaths.messageMutationActuation)
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
    strict,
    manifest: manifest || null,
    artifacts: evidencePaths,
    checks,
    summary: status === 'pass'
      ? 'Architecture redesign release bundle evidence is complete.'
      : 'Architecture redesign release bundle evidence is incomplete or non-certifying.'
  };
}

export function writeArchitectureReleaseBundlePreflight(report, { output = '', manifest = '' } = {}) {
  const destination = output
    || (manifest
      ? path.join(path.dirname(path.resolve(manifest)), 'architecture-redesign-release-bundle-preflight.json')
      : path.resolve('artifacts/live-soak/architecture-redesign-release-bundle-preflight.json'));
  return writeJsonFile(destination, report);
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    console.log(usage());
    return;
  }
  const report = buildArchitectureReleaseBundlePreflight({
    manifest: options.manifest,
    paths: options.paths,
    strict: options.strict
  });
  const output = (options.writeArtifacts || options.output)
    ? writeArchitectureReleaseBundlePreflight(report, { output: options.output, manifest: options.manifest })
    : null;
  console.log(JSON.stringify({
    ok: report.status === 'pass',
    status: report.status,
    manifest: report.manifest,
    output,
    checks: report.checks.map((entry) => ({ id: entry.id, status: entry.status, summary: entry.summary }))
  }, null, 2));
  if (report.status === 'fail') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}
