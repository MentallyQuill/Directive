import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PATH_KEYS = Object.freeze({
  continuityPreflight: 'continuityPreflight',
  commandBearingClosure: 'commandBearingClosure',
  commandBearingPoint: 'commandBearingPointLifecycle',
  terminalCatastrophic: 'terminalCatastrophic',
  terminalCommandFitness: 'terminalCommandFitnessLadder',
  messageMutationDiscovery: 'messageMutationDiscovery',
  messageMutationActuation: 'messageMutationActuationProof'
});

function usage() {
  return `Usage:
  node tools/scripts/create-architecture-redesign-release-bundle-manifest.mjs --output <file> [options]

Options:
  --output PATH                           Write release bundle manifest JSON.
  --baseline-completed-at ISO             Implementation-complete baseline timestamp.
  --alpha-gate-check-count N              Alpha gate check count; must be >= 205.
  --strict-dry-run-preflight-status pass  Strict live dry-run preflight status.
  --strict-dry-run-planned-turns 52       Strict live dry-run planned turn count.
  --served-extension-fresh true           Served extension freshness flag.
  --provider-profile-alignment-status pass
                                            Strict dry-run provider-profile alignment status.
  --continuity-preflight PATH             Full certification preflight JSON.
  --command-bearing-closure PATH          Command Bearing closure live report.
  --command-bearing-point PATH            Command Bearing point lifecycle live report.
  --terminal-catastrophic PATH            Terminal endings report for catastrophic-command trigger.
  --terminal-command-fitness PATH         Terminal endings report for command-fitness-ladder trigger.
  --message-mutation-discovery PATH       Read-only message mutation discovery report.
  --message-mutation-actuation PATH       Message mutation actuation proof report.
`;
}

function parseBoolean(value) {
  const text = String(value || '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'pass'].includes(text)) return true;
  if (['0', 'false', 'no', 'fail'].includes(text)) return false;
  return null;
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    help: false,
    output: '',
    implementationCompleteBaseline: {
      completedAt: '',
      alphaGateCheckCount: 0,
      strictDryRunPreflightStatus: '',
      strictDryRunPlannedTurns: 0,
      servedExtensionFresh: false,
      providerProfileAlignmentStatus: ''
    },
    paths: {
      continuityPreflight: '',
      commandBearingClosure: '',
      commandBearingPoint: '',
      terminalCatastrophic: '',
      terminalCommandFitness: '',
      messageMutationDiscovery: '',
      messageMutationActuation: ''
    }
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index] || '';
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--output') options.output = path.resolve(next());
    else if (arg.startsWith('--output=')) options.output = path.resolve(arg.slice('--output='.length));
    else if (arg === '--baseline-completed-at') options.implementationCompleteBaseline.completedAt = next();
    else if (arg.startsWith('--baseline-completed-at=')) options.implementationCompleteBaseline.completedAt = arg.slice('--baseline-completed-at='.length);
    else if (arg === '--alpha-gate-check-count') options.implementationCompleteBaseline.alphaGateCheckCount = Number(next());
    else if (arg.startsWith('--alpha-gate-check-count=')) options.implementationCompleteBaseline.alphaGateCheckCount = Number(arg.slice('--alpha-gate-check-count='.length));
    else if (arg === '--strict-dry-run-preflight-status') options.implementationCompleteBaseline.strictDryRunPreflightStatus = next();
    else if (arg.startsWith('--strict-dry-run-preflight-status=')) options.implementationCompleteBaseline.strictDryRunPreflightStatus = arg.slice('--strict-dry-run-preflight-status='.length);
    else if (arg === '--strict-dry-run-planned-turns') options.implementationCompleteBaseline.strictDryRunPlannedTurns = Number(next());
    else if (arg.startsWith('--strict-dry-run-planned-turns=')) options.implementationCompleteBaseline.strictDryRunPlannedTurns = Number(arg.slice('--strict-dry-run-planned-turns='.length));
    else if (arg === '--served-extension-fresh') options.implementationCompleteBaseline.servedExtensionFresh = parseBoolean(next()) === true;
    else if (arg.startsWith('--served-extension-fresh=')) options.implementationCompleteBaseline.servedExtensionFresh = parseBoolean(arg.slice('--served-extension-fresh='.length)) === true;
    else if (arg === '--provider-profile-alignment-status') options.implementationCompleteBaseline.providerProfileAlignmentStatus = next();
    else if (arg.startsWith('--provider-profile-alignment-status=')) options.implementationCompleteBaseline.providerProfileAlignmentStatus = arg.slice('--provider-profile-alignment-status='.length);
    else if (arg === '--continuity-preflight') options.paths.continuityPreflight = path.resolve(next());
    else if (arg === '--command-bearing-closure') options.paths.commandBearingClosure = path.resolve(next());
    else if (arg === '--command-bearing-point') options.paths.commandBearingPoint = path.resolve(next());
    else if (arg === '--terminal-catastrophic') options.paths.terminalCatastrophic = path.resolve(next());
    else if (arg === '--terminal-command-fitness') options.paths.terminalCommandFitness = path.resolve(next());
    else if (arg === '--message-mutation-discovery') options.paths.messageMutationDiscovery = path.resolve(next());
    else if (arg === '--message-mutation-actuation') options.paths.messageMutationActuation = path.resolve(next());
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function validateBaseline(baseline = {}) {
  const failures = [];
  if (!Number.isFinite(Date.parse(String(baseline.completedAt || '')))) failures.push('completedAt');
  if (Number(baseline.alphaGateCheckCount || 0) < 205) failures.push('alphaGateCheckCount');
  if (baseline.strictDryRunPreflightStatus !== 'pass') failures.push('strictDryRunPreflightStatus');
  if (Number(baseline.strictDryRunPlannedTurns || 0) !== 52) failures.push('strictDryRunPlannedTurns');
  if (baseline.servedExtensionFresh !== true) failures.push('servedExtensionFresh');
  if (baseline.providerProfileAlignmentStatus !== 'pass') failures.push('providerProfileAlignmentStatus');
  if (failures.length) {
    throw new Error(`implementation-complete baseline is not release-ready: ${failures.join(', ')}`);
  }
}

function relativeManifestPath(output, filePath) {
  const resolvedOutput = path.resolve(output || 'architecture-redesign-release-bundle.json');
  const resolvedFile = path.resolve(String(filePath || ''));
  return path.relative(path.dirname(resolvedOutput), resolvedFile).replaceAll(path.sep, '/');
}

function validateArtifactFile(inputKey, filePath) {
  const resolvedFile = path.resolve(String(filePath || ''));
  if (!fs.existsSync(resolvedFile) || !fs.statSync(resolvedFile).isFile()) {
    throw new Error(`release artifact file does not exist: ${inputKey}`);
  }
}

export function buildArchitectureReleaseBundleManifest({
  output = '',
  implementationCompleteBaseline = {},
  paths = {}
} = {}) {
  validateBaseline(implementationCompleteBaseline);
  const manifest = {
    implementationCompleteBaseline: {
      completedAt: new Date(Date.parse(implementationCompleteBaseline.completedAt)).toISOString(),
      alphaGateCheckCount: Number(implementationCompleteBaseline.alphaGateCheckCount),
      strictDryRunPreflightStatus: implementationCompleteBaseline.strictDryRunPreflightStatus,
      strictDryRunPlannedTurns: Number(implementationCompleteBaseline.strictDryRunPlannedTurns),
      servedExtensionFresh: implementationCompleteBaseline.servedExtensionFresh === true,
      providerProfileAlignmentStatus: implementationCompleteBaseline.providerProfileAlignmentStatus
    }
  };
  for (const [inputKey, manifestKey] of Object.entries(PATH_KEYS)) {
    if (!paths[inputKey]) throw new Error(`missing release artifact path: ${inputKey}`);
    validateArtifactFile(inputKey, paths[inputKey]);
    manifest[manifestKey] = relativeManifestPath(output, paths[inputKey]);
  }
  return manifest;
}

export function writeArchitectureReleaseBundleManifest(manifest, { output = '' } = {}) {
  if (!output) throw new Error('output path is required');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return output;
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    console.log(usage());
    return;
  }
  const manifest = buildArchitectureReleaseBundleManifest({
    output: options.output,
    implementationCompleteBaseline: options.implementationCompleteBaseline,
    paths: options.paths
  });
  const output = writeArchitectureReleaseBundleManifest(manifest, { output: options.output });
  console.log(JSON.stringify({ ok: true, output, manifest }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}
