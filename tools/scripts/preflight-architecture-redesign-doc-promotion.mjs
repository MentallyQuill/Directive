import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPORT_KIND = 'directive.architectureRedesign.docPromotionPreflight.v1';
const RELEASE_BUNDLE_PREFLIGHT_KIND = 'directive.architectureRedesign.releaseBundlePreflight.v1';
const REQUIRED_INDEX_LINKS = Object.freeze([
  'planning/ARCHITECTURE_REDESIGN_PROPOSAL.md',
  'planning/ARCHITECTURE_REDESIGN_IMPLEMENTATION_PLAN.md'
]);

function usage() {
  return `Usage:
  node tools/scripts/preflight-architecture-redesign-doc-promotion.mjs --release-bundle-preflight <file> [options]

Options:
  --docs-root PATH                 Docs root to scan. Defaults to docs.
  --release-bundle-preflight PATH  Passing architecture release-bundle preflight JSON.
  --strict                         Any warning fails the preflight.
  --write-artifacts                Write architecture-redesign-doc-promotion-preflight.json.
  --output PATH                    Write report to explicit path.
`;
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    docsRoot: path.resolve('docs'),
    releaseBundlePreflight: '',
    strict: false,
    writeArtifacts: false,
    output: '',
    help: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--docs-root') options.docsRoot = path.resolve(argv[++index] || '');
    else if (arg.startsWith('--docs-root=')) options.docsRoot = path.resolve(arg.slice('--docs-root='.length));
    else if (arg === '--release-bundle-preflight') options.releaseBundlePreflight = path.resolve(argv[++index] || '');
    else if (arg.startsWith('--release-bundle-preflight=')) options.releaseBundlePreflight = path.resolve(arg.slice('--release-bundle-preflight='.length));
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

function relativeDocPath(docsRoot, filePath) {
  return path.relative(docsRoot, filePath).replaceAll(path.sep, '/');
}

function listMarkdownFiles(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const filePath = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(filePath);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) files.push(filePath);
    }
  };
  visit(root);
  return files;
}

function validateReleaseBundlePreflight(filePath) {
  const report = readJson(filePath);
  const failures = [];
  if (report.__readError) failures.push('readable');
  if (!report.__readError && report.kind !== RELEASE_BUNDLE_PREFLIGHT_KIND) failures.push('kind');
  if (!report.__readError && report.status !== 'pass') failures.push('status');
  const failingChecks = report.__readError ? [] : (report.checks || []).filter((entry) => entry?.status !== 'pass');
  if (failingChecks.length) failures.push('checks');
  return check(
    'release-bundle-preflight',
    failures.length ? 'fail' : 'pass',
    failures.length
      ? `Release bundle preflight is not ready for docs promotion: ${failures.join(', ')}.`
      : 'Release bundle preflight passed before docs promotion.',
    {
      filePath,
      kind: report.kind || null,
      status: report.status || null,
      failingChecks: failingChecks.map((entry) => ({ id: entry.id, status: entry.status }))
    }
  );
}

function validateDocumentationIndex(docsRoot) {
  const indexPath = path.join(docsRoot, 'DOCUMENTATION_INDEX.md');
  const text = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';
  const missingLinks = REQUIRED_INDEX_LINKS.filter((link) => !text.includes(link));
  return check(
    'documentation-index-links',
    missingLinks.length ? 'fail' : 'pass',
    missingLinks.length
      ? `Documentation index is missing architecture redesign links: ${missingLinks.join(', ')}.`
      : 'Documentation index links architecture redesign proposal and implementation plan.',
    { indexPath, missingLinks }
  );
}

function validateStaleHotSaveClaims(docsRoot) {
  const staleFiles = [];
  const staleClaimPattern = /hot[- ]path\s+runtime\s+writes\s+full\s+campaign\s+saves/i;
  for (const filePath of listMarkdownFiles(docsRoot)) {
    const relativePath = relativeDocPath(docsRoot, filePath);
    if (relativePath.startsWith('planning/')) continue;
    if (staleClaimPattern.test(fs.readFileSync(filePath, 'utf8'))) staleFiles.push(relativePath);
  }
  return check(
    'stale-hot-save-doc-claims',
    staleFiles.length ? 'fail' : 'pass',
    staleFiles.length
      ? `Docs still contain stale hot-path full-save claims: ${staleFiles.join(', ')}.`
      : 'No promoted non-planning docs claim hot-path runtime writes full campaign saves.',
    { files: staleFiles }
  );
}

export function buildArchitectureRedesignDocPromotionPreflight({
  docsRoot = path.resolve('docs'),
  releaseBundlePreflight = '',
  strict = false
} = {}) {
  const resolvedDocsRoot = path.resolve(docsRoot);
  const checks = [
    validateReleaseBundlePreflight(releaseBundlePreflight),
    validateDocumentationIndex(resolvedDocsRoot),
    validateStaleHotSaveClaims(resolvedDocsRoot)
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
    docsRoot: resolvedDocsRoot,
    releaseBundlePreflight: path.resolve(String(releaseBundlePreflight || '')),
    checks
  };
}

export function writeArchitectureRedesignDocPromotionPreflight(report, { output = '' } = {}) {
  const target = output || path.join(report.docsRoot || path.resolve('docs'), '..', 'artifacts', 'live-soak', 'architecture-redesign-doc-promotion-preflight.json');
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
  const report = buildArchitectureRedesignDocPromotionPreflight({
    docsRoot: options.docsRoot,
    releaseBundlePreflight: options.releaseBundlePreflight,
    strict: options.strict
  });
  if (options.writeArtifacts || options.output) {
    writeArchitectureRedesignDocPromotionPreflight(report, { output: options.output });
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
