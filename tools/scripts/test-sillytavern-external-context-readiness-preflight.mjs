import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  EXTERNAL_CONTEXT_FIXTURE_ALLOWED_USERS,
  prepareSillyTavernExternalContextFixture
} from './prepare-sillytavern-external-context-fixture.mjs';
import {
  summarizeExternalContextSummaryArtifact
} from './run-continuity-matrix-five-user-soak.mjs';

function tempRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeAlignedProviderProfile(dataRoot, handle, { profileId = 'target-profile-id', profileName = 'Target Profile' } = {}) {
  const settingsPath = path.join(dataRoot, handle, 'settings.json');
  const settings = fs.existsSync(settingsPath) ? readJson(settingsPath) : {};
  settings.extension_settings = settings.extension_settings || {};
  settings.extension_settings.connectionManager = {
    ...(settings.extension_settings.connectionManager || {}),
    selectedProfile: profileId,
    profiles: [
      ...(settings.extension_settings.connectionManager?.profiles || []).filter((entry) => entry?.id !== profileId),
      { id: profileId, name: profileName }
    ]
  };
  settings.extension_settings.directive = settings.extension_settings.directive || {};
  settings.extension_settings.directive.providers = {
    ...(settings.extension_settings.directive.providers || {}),
    utility: {
      ...(settings.extension_settings.directive.providers?.utility || {}),
      provider: 'profile',
      profileId
    },
    reasoning: {
      ...(settings.extension_settings.directive.providers?.reasoning || {}),
      provider: 'profile',
      profileId
    }
  };
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
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
  writeAlignedProviderProfile(dataRoot, handle);
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
    DIRECTIVE_SOAK_REQUIRE_EXTERNAL_CONTEXT_FIXTURE_DEPTH: '1',
    DIRECTIVE_REQUIRE_PROVIDER_PROFILE_ALIGNMENT: '1',
    DIRECTIVE_REQUIRED_CONNECTION_PROFILE_ID: 'target-profile-id',
    DIRECTIVE_REQUIRED_CONNECTION_PROFILE_NAME: 'Target Profile'
  }
});

assert.equal(child.status, 0, `readiness preflight should exit 0\nstdout=${child.stdout}\nstderr=${child.stderr}`);

const reportPath = path.join(artifactRoot, runId, 'report.json');
const probePath = path.join(artifactRoot, runId, 'host-extensions', 'external-context-probe.json');
const summaryPath = path.join(artifactRoot, runId, 'host-extensions', 'external-context-summary.json');
const report = readJson(reportPath);
const probe = readJson(probePath);
const summaryArtifact = readJson(summaryPath);
assert.equal(report.status, 'pass');
assert.equal(report.checks.find((entry) => entry.id === 'host-extension-compatibility')?.status, 'pass');
assert.equal(report.checks.find((entry) => entry.id === 'host-extension-fixture-depth')?.status, 'pass');
assert.equal(report.checks.find((entry) => entry.id === 'provider-profile-alignment')?.status, 'pass');
assert.equal(probe.status, 'pass');
assert.equal(probe.fixtureDepth.status, 'pass');
assert.equal(report.externalContextSummary.status, 'warning');
assert.equal(summaryArtifact.kind, 'directive.sillytavern.externalContextSummary.v1');
assert.equal(summaryArtifact.status, 'warning');
assert.equal(summaryArtifact.aggregate.captureCount, EXTERNAL_CONTEXT_FIXTURE_ALLOWED_USERS.length);
assert.equal(summaryArtifact.aggregate.finalHostPromptMayIncludeExternal, true);
const readinessSummary = summarizeExternalContextSummaryArtifact({ artifactRoot: path.join(artifactRoot, runId) });
assert.equal(readinessSummary.status, 'fail');
assert.equal(readinessSummary.missingFields.includes('aggregate.timingCoverage.targetsWithTiming'), true);
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

const misalignedProviderDataRoot = tempRoot('directive-readiness-provider-misaligned-data-');
const misalignedProviderArtifactRoot = tempRoot('directive-readiness-provider-misaligned-artifacts-');
for (const handle of EXTERNAL_CONTEXT_FIXTURE_ALLOWED_USERS) {
  fs.mkdirSync(path.join(misalignedProviderDataRoot, handle), { recursive: true });
  writeAlignedProviderProfile(misalignedProviderDataRoot, handle);
}
writeAlignedProviderProfile(misalignedProviderDataRoot, EXTERNAL_CONTEXT_FIXTURE_ALLOWED_USERS[2], {
  profileId: 'wrong-profile-id',
  profileName: 'Wrong Profile'
});
const misalignedProvider = spawnSync(process.execPath, [
  'tools/scripts/check-sillytavern-multi-user-soak-readiness.mjs',
  '--write-artifacts'
], {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: {
    ...process.env,
    DIRECTIVE_SOAK_RUN_ID: 'provider-profile-misaligned',
    DIRECTIVE_SOAK_ARTIFACT_DIR: misalignedProviderArtifactRoot,
    DIRECTIVE_SILLYTAVERN_DATA_ROOT: misalignedProviderDataRoot,
    DIRECTIVE_SOAK_ST_USERS: EXTERNAL_CONTEXT_FIXTURE_ALLOWED_USERS.join(','),
    DIRECTIVE_REQUIRE_PROVIDER_PROFILE_ALIGNMENT: '1',
    DIRECTIVE_REQUIRED_CONNECTION_PROFILE_ID: 'target-profile-id',
    DIRECTIVE_REQUIRED_CONNECTION_PROFILE_NAME: 'Target Profile'
  }
});
assert.notEqual(misalignedProvider.status, 0, 'readiness preflight must fail when any five-user lane uses the wrong provider profile');
const misalignedProviderReport = readJson(path.join(misalignedProviderArtifactRoot, 'provider-profile-misaligned', 'report.json'));
const providerAlignmentCheck = misalignedProviderReport.checks.find((entry) => entry.id === 'provider-profile-alignment');
assert.equal(providerAlignmentCheck.status, 'fail');
assert.equal(providerAlignmentCheck.details.failedUserCount, 1);
assert(providerAlignmentCheck.details.users.some((entry) => entry.handle === EXTERNAL_CONTEXT_FIXTURE_ALLOWED_USERS[2] && entry.misalignedLanes.includes('connectionManager')));

fs.rmSync(misalignedProviderDataRoot, { recursive: true, force: true });
fs.rmSync(misalignedProviderArtifactRoot, { recursive: true, force: true });

const preparedByReadinessDataRoot = tempRoot('directive-external-context-readiness-autoprep-data-');
const preparedByReadinessArtifactRoot = tempRoot('directive-external-context-readiness-autoprep-artifacts-');
const preparedByReadinessRunId = 'external-context-readiness-autoprep';
const preparedByReadiness = spawnSync(process.execPath, [
  'tools/scripts/check-sillytavern-multi-user-soak-readiness.mjs',
  '--external-context-fixture',
  '--prepare-external-context-fixtures',
  '--write-artifacts'
], {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: {
    ...process.env,
    DIRECTIVE_SOAK_RUN_ID: preparedByReadinessRunId,
    DIRECTIVE_SOAK_ARTIFACT_DIR: preparedByReadinessArtifactRoot,
    DIRECTIVE_SILLYTAVERN_DATA_ROOT: preparedByReadinessDataRoot,
    DIRECTIVE_SOAK_ST_USERS: EXTERNAL_CONTEXT_FIXTURE_ALLOWED_USERS.join(','),
    DIRECTIVE_SOAK_REQUIRE_EXTERNAL_CONTEXT_FIXTURE_DEPTH: '1'
  }
});

assert.equal(
  preparedByReadiness.status,
  0,
  `readiness preflight should prepare and validate fixture users\nstdout=${preparedByReadiness.stdout}\nstderr=${preparedByReadiness.stderr}`
);

const preparedByReadinessReport = readJson(path.join(preparedByReadinessArtifactRoot, preparedByReadinessRunId, 'report.json'));
const preparedByReadinessProbe = readJson(path.join(preparedByReadinessArtifactRoot, preparedByReadinessRunId, 'host-extensions', 'external-context-probe.json'));
const preparedByReadinessSummaryArtifact = readJson(path.join(preparedByReadinessArtifactRoot, preparedByReadinessRunId, 'host-extensions', 'external-context-summary.json'));
const preparedByReadinessSummary = summarizeExternalContextSummaryArtifact({
  artifactRoot: path.join(preparedByReadinessArtifactRoot, preparedByReadinessRunId)
});
assert.equal(preparedByReadinessReport.externalContextFixturePreparation.status, 'pass');
assert.equal(preparedByReadinessReport.externalContextFixturePreparation.resultCount, EXTERNAL_CONTEXT_FIXTURE_ALLOWED_USERS.length);
assert.equal(
  preparedByReadinessReport.checks.find((entry) => entry.id === 'host-extension-fixture-preparation')?.status,
  'pass'
);
assert.equal(preparedByReadinessProbe.fixtureDepth.status, 'pass');
assert.equal(preparedByReadinessProbe.fixtureDepth.fullFixtureUserHandles.length, EXTERNAL_CONTEXT_FIXTURE_ALLOWED_USERS.length);
assert.equal(preparedByReadinessReport.externalContextSummary.status, 'warning');
assert.equal(preparedByReadinessSummaryArtifact.status, 'warning');
assert.equal(preparedByReadinessSummary.status, 'fail');
assert.equal(preparedByReadinessSummary.missingFields.includes('aggregate.timingCoverage.targetsWithTiming'), true);

fs.rmSync(preparedByReadinessDataRoot, { recursive: true, force: true });
fs.rmSync(preparedByReadinessArtifactRoot, { recursive: true, force: true });

console.log('SillyTavern external-context readiness preflight tests passed.');
