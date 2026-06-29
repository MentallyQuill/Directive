import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  EXTERNAL_CONTEXT_FIXTURE_ALLOWED_USERS,
  prepareSillyTavernExternalContextFixture
} from './prepare-sillytavern-external-context-fixture.mjs';

function tempRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const dataRoot = tempRoot('directive-external-context-readiness-data-');
const artifactRoot = tempRoot('directive-external-context-readiness-artifacts-');
const runId = 'external-context-readiness-fixture';

for (const handle of EXTERNAL_CONTEXT_FIXTURE_ALLOWED_USERS) {
  const result = prepareSillyTavernExternalContextFixture({
    dataRoot,
    userHandle: handle,
    write: true,
    validate: true
  });
  assert.equal(result.status, 'pass', `${handle} fixture should validate before readiness preflight`);
}

const child = spawnSync(process.execPath, [
  'tools/scripts/check-sillytavern-multi-user-soak-readiness.mjs',
  '--external-context-fixture',
  '--write-artifacts'
], {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: {
    ...process.env,
    DIRECTIVE_SOAK_RUN_ID: runId,
    DIRECTIVE_SOAK_ARTIFACT_DIR: artifactRoot,
    DIRECTIVE_SILLYTAVERN_DATA_ROOT: dataRoot,
    DIRECTIVE_SOAK_ST_USERS: EXTERNAL_CONTEXT_FIXTURE_ALLOWED_USERS.join(','),
    DIRECTIVE_SOAK_REQUIRE_EXTERNAL_CONTEXT_FIXTURE_DEPTH: '1'
  }
});

assert.equal(child.status, 0, `readiness preflight should exit 0\nstdout=${child.stdout}\nstderr=${child.stderr}`);

const reportPath = path.join(artifactRoot, runId, 'report.json');
const probePath = path.join(artifactRoot, runId, 'host-extensions', 'external-context-probe.json');
const report = readJson(reportPath);
const probe = readJson(probePath);
assert.equal(report.status, 'pass');
assert.equal(report.checks.find((entry) => entry.id === 'host-extension-compatibility')?.status, 'pass');
assert.equal(report.checks.find((entry) => entry.id === 'host-extension-fixture-depth')?.status, 'pass');
assert.equal(probe.status, 'pass');
assert.equal(probe.fixtureDepth.status, 'pass');
assert.equal(probe.fixtureDepth.fullFixtureUserHandles.length, EXTERNAL_CONTEXT_FIXTURE_ALLOWED_USERS.length);
assert.deepEqual(probe.fixtureDepth.missingTargets, []);
for (const target of ['stLorebooks', 'memoryBooks', 'summaryception', 'vectFox']) {
  assert.equal(probe.fixtureDepth.targetCoverage[target].richUserCount, EXTERNAL_CONTEXT_FIXTURE_ALLOWED_USERS.length);
}

const serialized = JSON.stringify({ report, probe });
assert.equal(serialized.includes('Contaminating Author Note'), false);
assert.equal(serialized.includes('SECRET'), false);
assert.equal(serialized.includes('raw vector'), false);
assert.equal(serialized.includes('raw Summaryception'), false);

fs.rmSync(dataRoot, { recursive: true, force: true });
fs.rmSync(artifactRoot, { recursive: true, force: true });

console.log('SillyTavern external-context readiness preflight tests passed.');
