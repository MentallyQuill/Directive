import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPORT_KIND = 'directive.architectureRedesign.finalCompletionPreflight.v1';
const RELEASE_BUNDLE_PREFLIGHT_KIND = 'directive.architectureRedesign.releaseBundlePreflight.v1';
const DOC_PROMOTION_PREFLIGHT_KIND = 'directive.architectureRedesign.docPromotionPreflight.v1';

function usage() {
  return `Usage:
  node tools/scripts/preflight-architecture-redesign-final-completion.mjs --release-bundle-preflight <file> --doc-promotion-preflight <file> [options]

Options:
  --release-bundle-preflight PATH  Passing architecture release-bundle preflight JSON.
  --doc-promotion-preflight PATH   Passing Stage 14 docs-promotion preflight JSON.
  --strict                         Any warning fails the preflight.
  --write-artifacts                Write architecture-redesign-final-completion-preflight.json.
  --output PATH                    Write report to explicit path.
`;
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    releaseBundlePreflight: '',
    docPromotionPreflight: '',
    strict: false,
    writeArtifacts: false,
    output: '',
    help: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--release-bundle-preflight') options.releaseBundlePreflight = path.resolve(argv[++index] || '');
    else if (arg.startsWith('--release-bundle-preflight=')) options.releaseBundlePreflight = path.resolve(arg.slice('--release-bundle-preflight='.length));
    else if (arg === '--doc-promotion-preflight') options.docPromotionPreflight = path.resolve(argv[++index] || '');
    else if (arg.startsWith('--doc-promotion-preflight=')) options.docPromotionPreflight = path.resolve(arg.slice('--doc-promotion-preflight='.length));
    else if (arg === '--strict') options.strict = true;
    else if (arg === '--write-artifacts') options.writeArtifacts = true;
    else if (arg === '--output') options.output = path.resolve(argv[++index] || '');
    else if (arg.startsWith('--output=')) options.output = path.resolve(arg.slice('--output='.length));
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function readJson(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return { __readError: 'file does not exist' };
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    return { __readError: error?.message || String(error) };
  }
}

function check(id, status, summary, details = {}) {
  return { id, status, summary, details };
}

function validatePreflightReport({
  id,
  filePath,
  expectedKind,
  passSummary,
  failSummaryPrefix
}) {
  const report = readJson(filePath);
  const failures = [];
  if (report.__readError) failures.push('readable');
  if (!report.__readError && report.kind !== expectedKind) failures.push('kind');
  if (!report.__readError && report.status !== 'pass') failures.push('status');
  const failingChecks = report.__readError ? [] : (report.checks || [])
    .filter((entry) => entry?.status !== 'pass')
    .map((entry) => ({ id: entry.id, status: entry.status }));
  if (failingChecks.length) failures.push('checks');
  return check(
    id,
    failures.length ? 'fail' : 'pass',
    failures.length ? `${failSummaryPrefix}: ${failures.join(', ')}.` : passSummary,
    {
      filePath,
      kind: report.kind || null,
      status: report.status || null,
      failingChecks
    }
  );
}

export function buildArchitectureRedesignFinalCompletionPreflight({
  releaseBundlePreflight = '',
  docPromotionPreflight = '',
  strict = false
} = {}) {
  const checks = [
    validatePreflightReport({
      id: 'release-bundle-preflight',
      filePath: releaseBundlePreflight,
      expectedKind: RELEASE_BUNDLE_PREFLIGHT_KIND,
      passSummary: 'Architecture release bundle preflight passed.',
      failSummaryPrefix: 'Architecture release bundle preflight is not final-completion ready'
    }),
    validatePreflightReport({
      id: 'doc-promotion-preflight',
      filePath: docPromotionPreflight,
      expectedKind: DOC_PROMOTION_PREFLIGHT_KIND,
      passSummary: 'Stage 14 docs-promotion preflight passed.',
      failSummaryPrefix: 'Stage 14 docs-promotion preflight is not final-completion ready'
    })
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
    generatedAt: new Date().toISOString(),
    status,
    strict: strict === true,
    releaseBundlePreflight: path.resolve(String(releaseBundlePreflight || '')),
    docPromotionPreflight: path.resolve(String(docPromotionPreflight || '')),
    checks
  };
}

export function writeArchitectureRedesignFinalCompletionPreflight(report, { output = '' } = {}) {
  const target = output || path.resolve('artifacts/live-soak/architecture-redesign-final-completion-preflight.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return target;
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    console.log(usage());
    return;
  }
  const report = buildArchitectureRedesignFinalCompletionPreflight({
    releaseBundlePreflight: options.releaseBundlePreflight,
    docPromotionPreflight: options.docPromotionPreflight,
    strict: options.strict
  });
  if (options.writeArtifacts || options.output) {
    writeArchitectureRedesignFinalCompletionPreflight(report, { output: options.output });
  }
  console.log(JSON.stringify(report, null, 2));
  if (report.status === 'fail' || (options.strict && report.status !== 'pass')) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}
