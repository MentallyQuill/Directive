import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildArchitectureReleaseBundleManifest,
  writeArchitectureReleaseBundleManifest
} from './create-architecture-redesign-release-bundle-manifest.mjs';

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'directive-release-bundle-manifest-'));
}

function writeArtifact(root, relativePath) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, '{}\n', 'utf8');
  return filePath;
}

const root = makeRoot();
const output = path.join(root, 'release', 'architecture-redesign-release-bundle.json');
const paths = {
  continuityPreflight: writeArtifact(root, 'continuity/full-certification-preflight.json'),
  commandBearingClosure: writeArtifact(root, 'command-bearing/closure-report.json'),
  commandBearingPoint: writeArtifact(root, 'command-bearing/point-report.json'),
  terminalCatastrophic: writeArtifact(root, 'terminal/catastrophic-report.json'),
  terminalCommandFitness: writeArtifact(root, 'terminal/command-fitness-report.json'),
  messageMutationDiscovery: writeArtifact(root, 'mutation/discovery.json'),
  messageMutationActuation: writeArtifact(root, 'mutation/actuation.json')
};

const manifest = buildArchitectureReleaseBundleManifest({
  output,
  implementationCompleteBaseline: {
    completedAt: '2026-07-07T07:32:50.650Z',
    alphaGateCheckCount: 205,
    strictDryRunPreflightStatus: 'pass',
    strictDryRunPlannedTurns: 52,
    servedExtensionFresh: true,
    providerProfileAlignmentStatus: 'pass'
  },
  paths
});

assert.deepEqual(manifest.implementationCompleteBaseline, {
  completedAt: '2026-07-07T07:32:50.650Z',
  alphaGateCheckCount: 205,
  strictDryRunPreflightStatus: 'pass',
  strictDryRunPlannedTurns: 52,
  servedExtensionFresh: true,
  providerProfileAlignmentStatus: 'pass'
});
assert.equal(manifest.continuityPreflight, '../continuity/full-certification-preflight.json');
assert.equal(manifest.commandBearingClosure, '../command-bearing/closure-report.json');
assert.equal(manifest.commandBearingPointLifecycle, '../command-bearing/point-report.json');
assert.equal(manifest.terminalCatastrophic, '../terminal/catastrophic-report.json');
assert.equal(manifest.terminalCommandFitnessLadder, '../terminal/command-fitness-report.json');
assert.equal(manifest.messageMutationDiscovery, '../mutation/discovery.json');
assert.equal(manifest.messageMutationActuationProof, '../mutation/actuation.json');

const writtenPath = writeArchitectureReleaseBundleManifest(manifest, { output });
assert.equal(writtenPath, output);
assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), manifest);

const cliOutput = path.join(root, 'cli', 'architecture-redesign-release-bundle.json');
const cliResult = spawnSync(process.execPath, [
  'tools/scripts/create-architecture-redesign-release-bundle-manifest.mjs',
  '--output', cliOutput,
  '--baseline-completed-at', '2026-07-07T08:30:34.064Z',
  '--alpha-gate-check-count', '205',
  '--strict-dry-run-preflight-status', 'pass',
  '--strict-dry-run-planned-turns', '52',
  '--served-extension-fresh', 'true',
  '--provider-profile-alignment-status', 'pass',
  '--continuity-preflight', paths.continuityPreflight,
  '--command-bearing-closure', paths.commandBearingClosure,
  '--command-bearing-point', paths.commandBearingPoint,
  '--terminal-catastrophic', paths.terminalCatastrophic,
  '--terminal-command-fitness', paths.terminalCommandFitness,
  '--message-mutation-discovery', paths.messageMutationDiscovery,
  '--message-mutation-actuation', paths.messageMutationActuation
], {
  cwd: process.cwd(),
  encoding: 'utf8'
});
assert.equal(cliResult.status, 0, cliResult.stderr || cliResult.stdout);
const cliManifest = JSON.parse(fs.readFileSync(cliOutput, 'utf8'));
assert.equal(cliManifest.implementationCompleteBaseline.completedAt, '2026-07-07T08:30:34.064Z');
assert.equal(cliManifest.implementationCompleteBaseline.providerProfileAlignmentStatus, 'pass');
assert.equal(cliManifest.alphaGateCheckCount, undefined);
assert.equal(cliManifest.commandBearingClosure, '../command-bearing/closure-report.json');

const missingFileCliOutput = path.join(root, 'cli-missing', 'architecture-redesign-release-bundle.json');
const missingFileCliResult = spawnSync(process.execPath, [
  'tools/scripts/create-architecture-redesign-release-bundle-manifest.mjs',
  '--output', missingFileCliOutput,
  '--baseline-completed-at', '2026-07-07T08:30:34.064Z',
  '--alpha-gate-check-count', '205',
  '--strict-dry-run-preflight-status', 'pass',
  '--strict-dry-run-planned-turns', '52',
  '--served-extension-fresh', 'true',
  '--provider-profile-alignment-status', 'pass',
  '--continuity-preflight', paths.continuityPreflight,
  '--command-bearing-closure', path.join(root, 'missing', 'closure-report.json'),
  '--command-bearing-point', paths.commandBearingPoint,
  '--terminal-catastrophic', paths.terminalCatastrophic,
  '--terminal-command-fitness', paths.terminalCommandFitness,
  '--message-mutation-discovery', paths.messageMutationDiscovery,
  '--message-mutation-actuation', paths.messageMutationActuation
], {
  cwd: process.cwd(),
  encoding: 'utf8'
});
assert.notEqual(missingFileCliResult.status, 0);
assert.match(missingFileCliResult.stderr, /release artifact file does not exist: commandBearingClosure/);
assert.equal(fs.existsSync(missingFileCliOutput), false);

assert.throws(
  () => buildArchitectureReleaseBundleManifest({
    output,
    implementationCompleteBaseline: {
      completedAt: '2026-07-07T07:32:50.650Z',
      alphaGateCheckCount: 204,
      strictDryRunPreflightStatus: 'warning',
      strictDryRunPlannedTurns: 3,
      servedExtensionFresh: false,
      providerProfileAlignmentStatus: 'fail'
    },
    paths
  }),
  /implementation-complete baseline/
);

assert.throws(
  () => buildArchitectureReleaseBundleManifest({
    output,
    implementationCompleteBaseline: {
      completedAt: '2026-07-07T07:32:50.650Z',
      alphaGateCheckCount: 204,
      strictDryRunPreflightStatus: 'pass',
      strictDryRunPlannedTurns: 52,
      servedExtensionFresh: true,
      providerProfileAlignmentStatus: 'pass'
    },
    paths
  }),
  /alphaGateCheckCount/
);

assert.throws(
  () => buildArchitectureReleaseBundleManifest({
    output,
    implementationCompleteBaseline: {
      completedAt: '2026-07-07T07:32:50.650Z',
      alphaGateCheckCount: 205,
      strictDryRunPreflightStatus: 'pass',
      strictDryRunPlannedTurns: 52,
      servedExtensionFresh: true,
      providerProfileAlignmentStatus: 'pass'
    },
    paths: {
      ...paths,
      commandBearingClosure: path.join(root, 'missing', 'closure-report.json')
    }
  }),
  /release artifact file does not exist: commandBearingClosure/
);

fs.rmSync(root, { recursive: true, force: true });

console.log('Architecture redesign release bundle manifest tests passed.');
