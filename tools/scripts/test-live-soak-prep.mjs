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
  SOAK_CAMPAIGN_MATRIX,
  SOAK_END_CONDITION_SCENARIOS,
  SOAK_LIVE_LOG_POLICY,
  SOAK_PLAYER_INPUT_POLICY,
  SOAK_PHASES,
  SOAK_READABLE_TRANSCRIPT_POLICY,
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
assert.equal(schema.properties.liveLogPolicy.properties.artifact.const, 'live-log.jsonl');
assert.equal(schema.properties.readableTranscriptPolicy.properties.required.const, true);
assert.equal(schema.properties.playerInputPolicy.properties.required.const, true);
assert.equal(schema.properties.artifacts.required.includes('liveLog'), true);
assert.equal(schema.properties.artifacts.required.includes('readableTranscript'), true);
assert.equal(schema.properties.artifacts.required.includes('sourceChatTranscript'), true);
assert.equal(schema.properties.campaignMatrix.items.$ref, '#/$defs/campaignMatrixEntry');
assert.equal(schema.properties.endConditionScenarios.items.$ref, '#/$defs/endConditionScenario');

assert.equal(SOAK_LIVE_LOG_POLICY.appendOnly, true);
assert.equal(SOAK_LIVE_LOG_POLICY.flushAfterEveryRecord, true);
assert.equal(SOAK_LIVE_LOG_POLICY.partialRunProofRequired, true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('operator-stop'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('failure'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('parallel-user'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('patch-lane'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('extension-sync-barrier'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('transcript-capture'), true);
assert.equal(SOAK_READABLE_TRANSCRIPT_POLICY.required, true);
assert.equal(SOAK_READABLE_TRANSCRIPT_POLICY.readableArtifact, 'transcript/readable-chat.md');
assert.equal(SOAK_PLAYER_INPUT_POLICY.required, true);
assert.match(SOAK_PLAYER_INPUT_POLICY.style, /roleplay prose/);
assert(SOAK_PLAYER_INPUT_POLICY.qualityDimensions.includes('dialogue quality'));

assert.equal(SOAK_CAMPAIGN_MATRIX.length, 6);
assert.equal(new Set(SOAK_CAMPAIGN_MATRIX.map((entry) => entry.packageId)).size, 6);
assert.equal(SOAK_CAMPAIGN_MATRIX.filter((entry) => entry.liveCoverage === 'full-soak-rotation-primary').length, 1);
assert.equal(SOAK_CAMPAIGN_MATRIX.every((entry) => entry.requiredLiveChecks.includes('cross-campaign-isolation')), true);
assert.equal(SOAK_CAMPAIGN_MATRIX.every((entry) => entry.deterministicCoverage.includes('end-condition-contract')), true);
assert.equal(SOAK_CAMPAIGN_MATRIX.some((entry) => entry.packageId === 'directive:campaign-package:breckenridge-ashes-of-peace'), true);
assert.equal(SOAK_CAMPAIGN_MATRIX.some((entry) => entry.packageId === 'directive:campaign-package:glass-harbor-drowned-constellation'), true);
assert.equal(SOAK_CAMPAIGN_MATRIX.some((entry) => entry.packageId === 'directive:campaign-package:serein-black-current'), true);
assert.equal(SOAK_CAMPAIGN_MATRIX.some((entry) => entry.packageId === 'directive:campaign-package:eudora-vale-broken-accord'), true);
assert.equal(SOAK_CAMPAIGN_MATRIX.some((entry) => entry.packageId === 'directive:campaign-package:aster-vale-unseen-border'), true);
assert.equal(SOAK_CAMPAIGN_MATRIX.some((entry) => entry.packageId === 'directive:campaign-package:celandine-enemys-garden'), true);

assert.equal(SOAK_PHASES.length, 9);
assert.equal(SOAK_TURN_SCRIPT.length, 52);
assert.equal(SOAK_TURN_SCRIPT.at(0).turn, 1);
assert.equal(SOAK_TURN_SCRIPT.at(-1).turn, 52);
assert.equal(new Set(SOAK_TURN_SCRIPT.map((entry) => entry.turn)).size, 52);
assert.equal(SOAK_END_CONDITION_SCENARIOS.length, 4);
assert.deepEqual(
  SOAK_END_CONDITION_SCENARIOS.map((entry) => entry.expectedAction).sort(),
  ['keepEnding', 'pushOn', 'replayFromCheckpoint', 'saveTerminalBranch']
);
assert.deepEqual(
  SOAK_END_CONDITION_SCENARIOS.map((entry) => entry.expectedDecisionStatus).sort(),
  ['keptEnding', 'pending', 'pushedOn', 'replayed']
);

const report = await buildDryRunReport();
assert.equal(report.kind, 'directive.liveCampaignSoak.report');
assert.equal(report.modelCallPolicy.budget, 'unlimited');
assert.equal(report.driverPolicy.primary, 'playwright');
assert.equal(report.driverPolicy.fallbackEvidenceIsEquivalent, false);
assert.equal(report.liveLogPolicy.artifact, 'live-log.jsonl');
assert.equal(report.readableTranscriptPolicy.required, true);
assert.equal(report.playerInputPolicy.required, true);
assert.equal(report.playerInputPolicy.qualityDimensions.includes('player-agency discipline'), true);
assert.equal(report.campaignMatrix.length, SOAK_CAMPAIGN_MATRIX.length);
assert.equal(report.phases.length, SOAK_PHASES.length);
assert.equal(report.turnScript.length, SOAK_TURN_SCRIPT.length);
assert.equal(report.endConditionScenarios.length, SOAK_END_CONDITION_SCENARIOS.length);
assert(report.checks.some((entry) => entry.id === 'playwright-import'));
assert(report.checks.some((entry) => entry.id === 'playwright-browser-control'));
assert(report.checks.some((entry) => entry.id === 'terminal-endings-live-smoke-source'));
assert(report.checks.some((entry) => entry.id === 'served-extension-freshness'));
assert(report.checks.some((entry) => entry.id === 'extension-sync-before-testing'));
assert(report.checks.some((entry) => entry.id === 'reserved-human-user'));
assert.equal(fs.existsSync('tools/scripts/check-sillytavern-multi-user-soak-readiness.mjs'), true);

const browserProbe = await verifyPlaywrightBrowserEnvironment({ captureArtifacts: false });
assert.equal(browserProbe.ok, true, JSON.stringify(browserProbe.error || browserProbe));
assert.equal(browserProbe.interaction.resultText, '1');

const tempRoot = tempArtifactRoot();
const paths = createArtifactPaths({ rootDir: tempRoot, runId: 'prep-test' });
ensureArtifactTree(paths);
writeJsonFile(paths.report, report);
appendJsonLine(paths.liveLog, { kind: 'run-start', status: 'planned' });
appendJsonLine(paths.turns, { turn: 1, status: 'planned' });
writeJsonFile(paths.transcriptIndex, { runId: 'prep-test', readableTranscript: paths.readableTranscript });
assert.equal(fs.existsSync(paths.report), true);
assert.equal(fs.readFileSync(paths.liveLog, 'utf8').trim(), JSON.stringify({ kind: 'run-start', status: 'planned' }));
assert.equal(fs.readFileSync(paths.turns, 'utf8').trim(), JSON.stringify({ turn: 1, status: 'planned' }));
assert.equal(path.basename(paths.readableTranscript), 'readable-chat.md');
assert.equal(path.basename(paths.sourceChatTranscript), 'source-chat.jsonl');
assert.equal(fs.existsSync(paths.transcriptIndex), true);

const expectedDirs = ['snapshots', 'transcript', 'screenshots', 'playwright', 'promptInspection', 'storage', 'endConditions', 'parallelUsers', 'discovery'];
for (const key of expectedDirs) {
  assert.equal(fs.statSync(paths[key]).isDirectory(), true, `${key} artifact directory should exist`);
}

console.log('Live soak prep tests passed.');
