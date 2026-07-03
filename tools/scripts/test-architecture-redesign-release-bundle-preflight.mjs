import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildArchitectureReleaseBundlePreflight,
  writeArchitectureReleaseBundlePreflight
} from './preflight-architecture-redesign-release-bundle.mjs';

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return filePath;
}

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'directive-release-bundle-preflight-'));
}

function continuityPreflight() {
  return {
    kind: 'directive.continuityProjectionMatrix.fullCertificationPreflight.v1',
    schemaVersion: 1,
    status: 'pass',
    strict: true,
    checks: [
      { id: 'five-lane-coverage', status: 'pass', summary: 'Artifact includes all five lanes.' },
      { id: 'full-depth-run', status: 'pass', summary: 'Artifact is unbounded.' },
      { id: 'unbounded-artifact-budget', status: 'pass', summary: 'Artifact budget is complete.' },
      { id: 'model-call-failure-policy', status: 'pass', summary: 'Model-call policy passed.' }
    ]
  };
}

function commandBearingClosure() {
  return {
    ok: true,
    status: 'pass',
    runId: 'closure-run',
    driver: 'playwright',
    stUser: 'directive-soak-c',
    defaultUserTouched: false,
    fixtureBacked: true,
    servedExtension: { ok: true, mismatchCount: 0, comparedFiles: ['src/runtime/runtime-app.mjs'] },
    isolation: { sourceSaveId: 'save-source', branchSaveId: 'save-branch' },
    closure: {
      closureId: 'closure.quest.1',
      closureType: 'quest',
      evidenceIds: ['evidence.1']
    },
    review: {
      records: [{ id: 'review.1', markAwarded: true, awardedTrack: 'resolve' }]
    }
  };
}

function commandBearingPoint() {
  return {
    ok: true,
    status: 'pass',
    runId: 'point-run',
    driver: 'playwright',
    stUser: 'directive-soak-d',
    defaultUserTouched: false,
    servedExtension: { ok: true, mismatchCount: 0, comparedFiles: ['src/runtime/runtime-app.mjs'] },
    branchSaveId: 'save-point-branch',
    gateEvidence: {
      rankReserveChecked: true,
      readyCancelChecked: true,
      validSpendChecked: true,
      controlledNarrationChecked: true,
      markCount: 1
    }
  };
}

function terminalReport(triggerKind, user = 'directive-soak-e') {
  const scenarios = [
    ['save-branch', 'saveTerminalBranch', 'pending'],
    ['replay', 'replayFromCheckpoint', 'replayed'],
    ['push-on', 'pushOn', 'pushedOn'],
    ['keep-ending', 'keepEnding', 'keptEnding']
  ].map(([id, expectedAction, decisionStatus]) => ({
    id,
    triggerKind,
    expectedAction,
    resolved: { decisionStatus }
  }));
  return {
    ok: true,
    baseUrl: 'http://127.0.0.1:8000',
    driver: 'playwright',
    authenticatedUser: { handle: user },
    staleCheck: { ok: true, compared: 16 },
    scenarios
  };
}

function messageMutationDiscovery() {
  return {
    schemaVersion: 1,
    kind: 'directive.sillytavernMessageMutation.discovery',
    runId: 'mutation-discovery',
    mode: 'live-read-only',
    status: 'pass',
    sillyTavernUser: 'directive-soak-b',
    inspected: {
      recommendations: {
        hasMessageEditedEvent: true,
        hasMessageDeletedEvent: true,
        hasVisibleEditDeleteControls: true,
        directiveActionsHaveGeometry: true
      }
    }
  };
}

function messageMutationActuation() {
  const scenarioIds = ['source-edit', 'source-delete', 'assistant-edit', 'assistant-delete', 'selected-swipe'];
  return {
    kind: 'directive.sillytavernMessageMutation.actuationProof.v1',
    schemaVersion: 1,
    ok: true,
    status: 'pass',
    driver: 'playwright',
    sillyTavernUser: 'directive-soak-b',
    defaultUserTouched: false,
    servedExtension: {
      ok: true,
      childReportCount: 5,
      freshChildReportCount: 5,
      missingChildReportCount: 0,
      mismatchCount: 0,
      servedFailureCount: 0,
      comparedFiles: ['src/hosts/sillytavern/runtime-bridge.mjs']
    },
    scenarios: scenarioIds.map((id) => ({
      id,
      status: 'pass',
      ok: true,
      artifactPath: `mutation/${id}.json`,
      evidence: id === 'selected-swipe'
        ? {
            selectedSwipeIndex: 2,
            swipeCount: 3,
            hashMatched: true,
            sourceIntegrityProof: {
              kind: 'directive.sourceIntegrityProof.v1',
              selectedHostMessageId: 'assistant-selected-swipe',
              actuationMode: 'native-host-swipe-control',
              nativeHostControlMoved: true,
              selectedSwipeIndex: 2,
              swipeCount: 3,
              sourceIntegrity: 'clean',
              hashMatched: true,
              selectedHashMatchesPrevious: true,
              discardedSwipeCanariesAbsent: true,
              sreDecision: {
                status: 'settled',
                action: 'selectedSwipeAccepted'
              }
            }
          }
        : {
            targetMesid: '12',
            targetRole: id.startsWith('source') ? 'source' : 'assistant',
            legacyRecoveryDelta: 0,
            sourceMutationProof: {
              kind: 'directive.sourceMutationProof.v1',
              coreRecovery: {
                status: 'recorded',
                recoveryCaseId: `recovery:${id}`,
                transactionId: `core-tx:${id}`
              },
              repairDecision: {
                kind: 'directive.repairDecision.v1',
                action: id.endsWith('edit') ? 'repairSourceEdit' : 'repairSourceDelete',
                eventType: id.endsWith('edit') ? 'messageEdited' : 'messageDeleted'
              }
            }
          }
    }))
  };
}

function countOnlyMessageMutationActuation() {
  const artifact = messageMutationActuation();
  artifact.scenarios = artifact.scenarios.map((scenario) => ({
    ...scenario,
    evidence: scenario.id === 'selected-swipe'
      ? { selectedSwipeIndex: 2, swipeCount: 3, hashMatched: true }
      : { targetMesid: '12', targetRole: scenario.id.startsWith('source') ? 'source' : 'assistant', deltaRecovery: 1 }
  }));
  return artifact;
}

function shallowMessageMutationActuation() {
  return {
    kind: 'directive.sillytavernMessageMutation.actuationProof.v1',
    schemaVersion: 1,
    ok: true,
    status: 'pass',
    driver: 'playwright',
    sillyTavernUser: 'directive-soak-b',
    defaultUserTouched: false,
    servedExtension: { ok: true, mismatchCount: 0, servedFailureCount: 0 },
    scenarios: [
      { id: 'source-edit', status: 'pass' },
      { id: 'source-delete', status: 'pass' },
      { id: 'assistant-edit', status: 'pass' },
      { id: 'assistant-delete', status: 'pass' },
      { id: 'selected-swipe', status: 'pass' }
    ]
  };
}

function writeBundle(root, overrides = {}) {
  const paths = {
    continuityPreflight: writeJson(path.join(root, 'continuity', 'full-certification-preflight.json'), overrides.continuityPreflight || continuityPreflight()),
    commandBearingClosure: writeJson(path.join(root, 'command-bearing', 'closure-report.json'), overrides.commandBearingClosure || commandBearingClosure()),
    commandBearingPoint: writeJson(path.join(root, 'command-bearing', 'point-report.json'), overrides.commandBearingPoint || commandBearingPoint()),
    terminalCatastrophic: writeJson(path.join(root, 'terminal', 'catastrophic-report.json'), overrides.terminalCatastrophic || terminalReport('catastrophic-command')),
    terminalCommandFitness: writeJson(path.join(root, 'terminal', 'command-fitness-report.json'), overrides.terminalCommandFitness || terminalReport('command-fitness-ladder')),
    messageMutationDiscovery: writeJson(path.join(root, 'mutation', 'discovery.json'), overrides.messageMutationDiscovery || messageMutationDiscovery()),
    messageMutationActuation: writeJson(path.join(root, 'mutation', 'actuation.json'), overrides.messageMutationActuation || messageMutationActuation())
  };
  const manifest = writeJson(path.join(root, 'release-bundle-manifest.json'), {
    continuityPreflight: path.relative(root, paths.continuityPreflight),
    commandBearingClosure: path.relative(root, paths.commandBearingClosure),
    commandBearingPointLifecycle: path.relative(root, paths.commandBearingPoint),
    terminalCatastrophic: path.relative(root, paths.terminalCatastrophic),
    terminalCommandFitnessLadder: path.relative(root, paths.terminalCommandFitness),
    messageMutationDiscovery: path.relative(root, paths.messageMutationDiscovery),
    messageMutationActuationProof: path.relative(root, paths.messageMutationActuation)
  });
  return { manifest, paths };
}

const passRoot = makeRoot();
const passBundle = writeBundle(passRoot);
const passReport = buildArchitectureReleaseBundlePreflight({
  manifest: passBundle.manifest,
  strict: true
});
assert.equal(passReport.status, 'pass');
assert.equal(passReport.checks.find((entry) => entry.id === 'continuity-full-certification-preflight').status, 'pass');
assert.equal(passReport.checks.find((entry) => entry.id === 'message-mutation-actuation-live-proof').status, 'pass');
const writtenPath = writeArchitectureReleaseBundlePreflight(passReport, { manifest: passBundle.manifest });
assert.equal(fs.existsSync(writtenPath), true);

const discoveryOnlyRoot = makeRoot();
const discoveryOnlyBundle = writeBundle(discoveryOnlyRoot);
fs.rmSync(discoveryOnlyBundle.paths.messageMutationActuation, { force: true });
const discoveryOnlyReport = buildArchitectureReleaseBundlePreflight({
  manifest: discoveryOnlyBundle.manifest,
  strict: true
});
assert.equal(discoveryOnlyReport.status, 'fail');
assert.equal(discoveryOnlyReport.checks.find((entry) => entry.id === 'message-mutation-discovery-live-proof').status, 'pass');
assert.equal(discoveryOnlyReport.checks.find((entry) => entry.id === 'message-mutation-actuation-live-proof').status, 'fail');

const defaultUserRoot = makeRoot();
const defaultUserBundle = writeBundle(defaultUserRoot, {
  terminalCatastrophic: terminalReport('catastrophic-command', 'default-user')
});
const defaultUserReport = buildArchitectureReleaseBundlePreflight({
  manifest: defaultUserBundle.manifest,
  strict: true
});
assert.equal(defaultUserReport.status, 'fail');
assert.equal(defaultUserReport.checks.find((entry) => entry.id === 'terminal-catastrophic-command-live-proof').status, 'fail');

const continuityRoot = makeRoot();
const continuityBundle = writeBundle(continuityRoot, {
  continuityPreflight: {
    ...continuityPreflight(),
    status: 'fail',
    checks: [{ id: 'model-call-failure-policy', status: 'fail', summary: 'Missing durable evidence.' }]
  }
});
const continuityReport = buildArchitectureReleaseBundlePreflight({
  manifest: continuityBundle.manifest,
  strict: true
});
assert.equal(continuityReport.status, 'fail');
assert.equal(continuityReport.checks.find((entry) => entry.id === 'continuity-full-certification-preflight').status, 'fail');

const missingServedRoot = makeRoot();
const missingServedActuation = messageMutationActuation();
delete missingServedActuation.servedExtension;
const missingServedBundle = writeBundle(missingServedRoot, {
  messageMutationActuation: missingServedActuation
});
const missingServedReport = buildArchitectureReleaseBundlePreflight({
  manifest: missingServedBundle.manifest,
  strict: true
});
assert.equal(missingServedReport.status, 'fail');
assert.equal(missingServedReport.checks.find((entry) => entry.id === 'message-mutation-actuation-live-proof').status, 'fail');

const shallowActuationRoot = makeRoot();
const shallowActuationBundle = writeBundle(shallowActuationRoot, {
  messageMutationActuation: shallowMessageMutationActuation()
});
const shallowActuationReport = buildArchitectureReleaseBundlePreflight({
  manifest: shallowActuationBundle.manifest,
  strict: true
});
assert.equal(shallowActuationReport.status, 'fail');
const shallowActuationCheck = shallowActuationReport.checks.find((entry) => entry.id === 'message-mutation-actuation-live-proof');
assert.equal(shallowActuationCheck.status, 'fail');
assert.equal(shallowActuationCheck.details.shallowScenarios.length, 5);

const countOnlyActuationRoot = makeRoot();
const countOnlyActuationBundle = writeBundle(countOnlyActuationRoot, {
  messageMutationActuation: countOnlyMessageMutationActuation()
});
const countOnlyActuationReport = buildArchitectureReleaseBundlePreflight({
  manifest: countOnlyActuationBundle.manifest,
  strict: true
});
assert.equal(countOnlyActuationReport.status, 'fail');
const countOnlyActuationCheck = countOnlyActuationReport.checks.find((entry) => entry.id === 'message-mutation-actuation-live-proof');
assert.equal(countOnlyActuationCheck.status, 'fail');
assert.deepEqual(countOnlyActuationCheck.details.weakOwnerEvidenceScenarios.sort(), [
  'assistant-delete',
  'assistant-edit',
  'selected-swipe',
  'source-delete',
  'source-edit'
]);

const stagedSwipeRoot = makeRoot();
const stagedSwipeActuation = messageMutationActuation();
const stagedScenario = stagedSwipeActuation.scenarios.find((scenario) => scenario.id === 'selected-swipe');
stagedScenario.evidence.sourceIntegrityProof.actuationMode = 'staged-context-source-truth';
stagedScenario.evidence.sourceIntegrityProof.nativeHostControlMoved = false;
const stagedSwipeBundle = writeBundle(stagedSwipeRoot, {
  messageMutationActuation: stagedSwipeActuation
});
const stagedSwipeReport = buildArchitectureReleaseBundlePreflight({
  manifest: stagedSwipeBundle.manifest,
  strict: true
});
assert.equal(stagedSwipeReport.status, 'fail');
const stagedSwipeCheck = stagedSwipeReport.checks.find((entry) => entry.id === 'message-mutation-actuation-live-proof');
assert.deepEqual(stagedSwipeCheck.details.weakOwnerEvidenceScenarios, ['selected-swipe']);

fs.rmSync(passRoot, { recursive: true, force: true });
fs.rmSync(discoveryOnlyRoot, { recursive: true, force: true });
fs.rmSync(defaultUserRoot, { recursive: true, force: true });
fs.rmSync(continuityRoot, { recursive: true, force: true });
fs.rmSync(missingServedRoot, { recursive: true, force: true });
fs.rmSync(shallowActuationRoot, { recursive: true, force: true });
fs.rmSync(countOnlyActuationRoot, { recursive: true, force: true });
fs.rmSync(stagedSwipeRoot, { recursive: true, force: true });

console.log('Architecture redesign release bundle preflight tests passed.');
