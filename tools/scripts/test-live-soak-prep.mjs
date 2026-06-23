import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  PLAYWRIGHT_SELECTOR_GUIDANCE,
  appendJsonLine,
  createArtifactPaths,
  createRunId,
  ensureArtifactTree,
  normalizeBaseUrl,
  normalizeExtensionPath,
  readJsonFile,
  tempArtifactRoot,
  verifyPlaywrightBrowserEnvironment,
  writeJsonFile
} from './lib/sillytavern-live-harness.mjs';
import {
  SOAK_PHASES,
  SOAK_TURN_SCRIPT,
  buildDryRunReport
} from './soak-sillytavern-campaign-live.mjs';

assert.equal(normalizeBaseUrl('http://127.0.0.1:8000///'), 'http://127.0.0.1:8000');
assert.equal(normalizeExtensionPath('scripts/extensions/third-party/Directive/'), '/scripts/extensions/third-party/Directive');
assert.match(createRunId(new Date('2026-06-23T12:34:56.789Z')), /^2026-06-23T12-34-56-789Z$/);
assert.equal(PLAYWRIGHT_SELECTOR_GUIDANCE.prefer.some((entry) => /role/.test(entry)), true);

const schema = readJsonFile('schemas/testing/live-campaign-soak-report.schema.json');
assert.equal(schema.properties.modelCallPolicy.properties.budget.const, 'unlimited');
assert.equal(schema.properties.driverPolicy.properties.primary.const, 'playwright');
assert.equal(schema.properties.driverPolicy.properties.fallbackEvidenceIsEquivalent.const, false);

assert.equal(SOAK_PHASES.length, 8);
assert.equal(SOAK_TURN_SCRIPT.length, 52);
assert.equal(SOAK_TURN_SCRIPT.at(0).turn, 1);
assert.equal(SOAK_TURN_SCRIPT.at(-1).turn, 52);
assert.equal(new Set(SOAK_TURN_SCRIPT.map((entry) => entry.turn)).size, 52);

const report = await buildDryRunReport();
assert.equal(report.kind, 'directive.liveCampaignSoak.report');
assert.equal(report.modelCallPolicy.budget, 'unlimited');
assert.equal(report.driverPolicy.primary, 'playwright');
assert.equal(report.driverPolicy.fallbackEvidenceIsEquivalent, false);
assert.equal(report.phases.length, SOAK_PHASES.length);
assert.equal(report.turnScript.length, SOAK_TURN_SCRIPT.length);
assert(report.checks.some((entry) => entry.id === 'playwright-import'));
assert(report.checks.some((entry) => entry.id === 'playwright-browser-control'));
assert(report.checks.some((entry) => entry.id === 'served-extension-freshness'));
assert(report.checks.some((entry) => entry.id === 'extension-sync-before-testing'));

const browserProbe = await verifyPlaywrightBrowserEnvironment({ captureArtifacts: false });
assert.equal(browserProbe.ok, true, JSON.stringify(browserProbe.error || browserProbe));
assert.equal(browserProbe.interaction.resultText, '1');

const tempRoot = tempArtifactRoot();
const paths = createArtifactPaths({ rootDir: tempRoot, runId: 'prep-test' });
ensureArtifactTree(paths);
writeJsonFile(paths.report, report);
appendJsonLine(paths.turns, { turn: 1, status: 'planned' });
assert.equal(fs.existsSync(paths.report), true);
assert.equal(fs.readFileSync(paths.turns, 'utf8').trim(), JSON.stringify({ turn: 1, status: 'planned' }));

const expectedDirs = ['snapshots', 'transcript', 'screenshots', 'playwright', 'promptInspection', 'storage', 'discovery'];
for (const key of expectedDirs) {
  assert.equal(fs.statSync(paths[key]).isDirectory(), true, `${key} artifact directory should exist`);
}

console.log('Live soak prep tests passed.');
