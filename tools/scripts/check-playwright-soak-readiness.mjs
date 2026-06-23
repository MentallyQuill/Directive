import path from 'node:path';

import {
  DEFAULT_SOAK_ARTIFACT_ROOT,
  PLAYWRIGHT_VIEWPORTS,
  compact,
  createArtifactPaths,
  createRunId,
  ensureArtifactTree,
  errorSummary,
  tempArtifactRoot,
  verifyPlaywrightBrowserEnvironment,
  writeJsonFile,
  writeTextFile
} from './lib/sillytavern-live-harness.mjs';

const args = new Set(process.argv.slice(2));
const HELP = args.has('--help') || args.has('-h');
const WRITE_ARTIFACTS = args.has('--write-artifacts') || process.env.DIRECTIVE_PLAYWRIGHT_READINESS_WRITE === '1';
const HEADLESS = process.env.DIRECTIVE_SILLYTAVERN_HEADLESS !== '0';
const RUN_ID = process.env.DIRECTIVE_PLAYWRIGHT_READINESS_RUN_ID || createRunId();
const ROOT_DIR = WRITE_ARTIFACTS
  ? process.env.DIRECTIVE_SOAK_ARTIFACT_DIR || DEFAULT_SOAK_ARTIFACT_ROOT
  : tempArtifactRoot('directive-playwright-soak-readiness-');

function usage() {
  return `Directive Playwright soak readiness check

Default:
  node tools\\scripts\\check-playwright-soak-readiness.mjs

Write artifacts into the repo soak artifact tree:
  node tools\\scripts\\check-playwright-soak-readiness.mjs --write-artifacts

Environment:
  DIRECTIVE_SOAK_ARTIFACT_DIR=artifacts/live-soak/sillytavern-campaign
  DIRECTIVE_PLAYWRIGHT_TIMEOUT_MS=30000
  DIRECTIVE_SILLYTAVERN_HEADLESS=0

This script does not contact SillyTavern. It launches Playwright Chromium,
drives a role-locator click, switches the soak desktop/phone viewports, and
writes fixture screenshots plus a Playwright trace.
`;
}

function timeoutMs() {
  const parsed = Number.parseInt(process.env.DIRECTIVE_PLAYWRIGHT_TIMEOUT_MS || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30000;
}

function summaryMarkdown(report) {
  const lines = [
    '# Directive Playwright Soak Readiness',
    '',
    `Run: ${report.runId}`,
    `Status: ${report.status}`,
    `Generated: ${report.generatedAt}`,
    `Headless: ${report.environment.headless}`,
    '',
    '## Result',
    '',
    `- Stage: ${report.result.stage}`,
    `- Interaction result: ${report.result.interaction?.resultText || 'n/a'}`,
    `- Page errors: ${report.result.pageErrors?.length || 0}`,
    `- Console messages: ${report.result.consoleMessages?.length || 0}`,
    '',
    '## Artifacts',
    '',
    `- Trace: ${report.result.artifacts?.trace?.path || 'not written'}`
  ];
  for (const [id, entry] of Object.entries(report.result.viewports || {})) {
    lines.push(`- ${id} screenshot: ${entry.screenshot?.path || 'not written'}`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main() {
  if (HELP) {
    console.log(usage());
    return;
  }

  const artifactRunId = WRITE_ARTIFACTS ? RUN_ID : 'playwright-readiness';
  const artifacts = createArtifactPaths({
    rootDir: ROOT_DIR,
    runId: artifactRunId
  });
  ensureArtifactTree(artifacts);

  const result = await verifyPlaywrightBrowserEnvironment({
    headless: HEADLESS,
    timeoutMs: timeoutMs(),
    artifactPaths: artifacts,
    captureArtifacts: true,
    viewports: PLAYWRIGHT_VIEWPORTS
  });

  const report = {
    schemaVersion: 1,
    kind: 'directive.playwrightSoakReadiness.report',
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    status: result.ok ? 'pass' : 'fail',
    artifacts,
    result,
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      cwd: process.cwd(),
      headless: HEADLESS,
      writeArtifacts: WRITE_ARTIFACTS,
      tempArtifactRoot: WRITE_ARTIFACTS ? null : path.resolve(ROOT_DIR),
      viewports: PLAYWRIGHT_VIEWPORTS
    }
  };

  writeJsonFile(artifacts.report, report);
  writeTextFile(artifacts.summary, summaryMarkdown(report));

  console.log(JSON.stringify({
    ok: report.status === 'pass',
    status: report.status,
    runId: report.runId,
    artifactRoot: artifacts.root,
    trace: result.artifacts?.trace?.path || null,
    screenshots: Object.fromEntries(Object.entries(result.viewports || {}).map(([id, entry]) => [
      id,
      entry.screenshot?.path || null
    ])),
    error: result.error ? compact(result.error, 300) : null
  }, null, 2));

  if (report.status !== 'pass') process.exitCode = 1;
}

main().catch((error) => {
  console.error(errorSummary(error));
  process.exit(1);
});
