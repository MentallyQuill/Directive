import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildMessageMutationActuationProof,
  writeMessageMutationActuationProof
} from './preflight-sillytavern-message-mutation-actuation.mjs';

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return filePath;
}

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'directive-message-mutation-actuation-'));
}

function mutationReport({
  kind,
  isUser,
  trackedKind,
  status = 'pass',
  user = 'directive-soak-b',
  operation = 'edit'
} = {}) {
  const beforeTracked = {
    id: `${trackedKind}.1`,
    hostMessageId: '12',
    status: 'committed',
    editedAt: null,
    deletedAt: null,
    recoveryId: null
  };
  const afterTracked = operation === 'delete'
    ? {
        ...beforeTracked,
        status: 'invalidated',
        deletedAt: '2026-06-29T12:00:00.000Z',
        recoveryId: 'recovery.delete.1'
      }
    : {
        ...beforeTracked,
        status: 'reviewRequired',
        editedAt: '2026-06-29T12:00:00.000Z',
        recoveryId: 'recovery.edit.1',
        replacementTextSet: trackedKind === 'response' ? true : undefined
      };
  const before = {
    currentChatId: 'Directive - Ashes',
    chatLength: 18,
    targetMesid: '12',
    targetMessage: {
      isUser,
      isSystem: false,
      textHash: 20
    },
    ingress: trackedKind === 'ingress' ? beforeTracked : null,
    response: trackedKind === 'response' ? beforeTracked : null,
    recoveryCount: 1,
    promptContextRevision: 8
  };
  const after = {
    ...before,
    chatLength: operation === 'delete' ? 17 : 18,
    ingress: trackedKind === 'ingress' ? afterTracked : null,
    response: trackedKind === 'response' ? afterTracked : null,
    recoveryCount: 1,
    promptContextRevision: 9
  };
  return {
    schemaVersion: 1,
    kind,
    runId: `${operation}-${trackedKind}`,
    generatedAt: '2026-06-29T12:00:01.000Z',
    status,
    baseUrl: 'http://127.0.0.1:8000',
    sillyTavernUser: user,
    servedExtension: { ok: true, mismatchCount: 0, servedFailureCount: 0, comparedFiles: ['src/hosts/sillytavern/runtime-bridge.mjs'] },
    resumeSaveId: 'save-test',
    expectedChatId: 'Directive - Ashes',
    openCampaign: { expectedChatMatches: true },
    [operation === 'delete' ? 'deletion' : 'edit']: operation === 'delete'
      ? {
          targetMesid: '12',
          originalTextHash: 'original-hash',
          originalTextLength: 34,
          editButtonBox: { x: 1, y: 2, width: 12, height: 12 },
          deleteButtonBox: { x: 2, y: 3, width: 12, height: 12 },
          confirmation: { clicked: true, selector: '.menu_button', labelHash: 'confirm-hash', labelLength: 6, box: { x: 3, y: 4, width: 12, height: 12 } },
          nativeDialog: { seen: false, type: null }
        }
      : {
          targetMesid: '12',
          originalTextHash: 'original-hash',
          originalTextLength: 34,
          replacementTextHash: 'replacement-hash',
          replacementTextLength: 42,
          editButtonBox: { x: 1, y: 2, width: 12, height: 12 },
          doneButtonBox: { x: 2, y: 3, width: 12, height: 12 }
        },
    waited: { ok: status === 'pass' },
    before,
    after,
    deltas: {
      chatLength: after.chatLength - before.chatLength,
      legacyRecovery: after.recoveryCount - before.recoveryCount,
      promptContextRevision: after.promptContextRevision - before.promptContextRevision
    },
    sourceMutationProof: {
      kind: 'directive.sourceMutationProof.v1',
      mutationKind: operation,
      sourceRole: isUser ? 'source' : 'assistant',
      trackedKind,
      targetHostMessageId: '12',
      nativeHostControlMoved: true,
      nativeHostControls: operation === 'delete'
        ? { editButton: true, deleteButton: true, confirmation: true, nativeDialog: false }
        : { editButton: true, doneButton: true },
      textHashes: operation === 'delete'
        ? { original: 'original-hash' }
        : { original: 'original-hash', replacement: 'replacement-hash' },
      trackingChanged: true,
      legacyRecoveryDelta: 0,
      promptContextRevisionDelta: 1,
      beforeStatus: beforeTracked.status,
      afterStatus: afterTracked.status,
      coreRecovery: {
        status: 'recorded',
        transactionId: `txn.${operation}.${trackedKind}`,
        recoveryCaseId: `case.${operation}.${trackedKind}`,
        phase: 'recoveryRequired',
        reason: trackedKind === 'ingress'
          ? `playerMessage${operation === 'delete' ? 'Deleted' : 'Edited'}`
          : `directiveResponse${operation === 'delete' ? 'Deleted' : 'Edited'}`
      },
      repairDecision: {
        kind: 'directive.repairDecision.v1',
        action: operation === 'delete' ? 'reviewRequired' : 'reviewRequired',
        eventType: trackedKind === 'ingress'
          ? `playerMessage${operation === 'delete' ? 'Deleted' : 'Edited'}`
          : `directiveResponse${operation === 'delete' ? 'Deleted' : 'Edited'}`,
        sourceKind: trackedKind === 'ingress' ? 'playerIngress' : 'directiveResponse',
        recoveryStatus: 'reviewRequired'
      }
    }
  };
}

function selectedSwipeReport(user = 'directive-soak-b') {
  return {
    ok: true,
    sillyTavernUser: user,
    servedExtension: { ok: true, mismatchCount: 0, servedFailureCount: 0, comparedFiles: ['src/hosts/sillytavern/runtime-bridge.mjs'] },
    fixtureHostMessageId: 'assistant-selected-swipe',
    selectedAssistantVariant: {
      selectedSwipeIndex: 1,
      swipeCount: 3,
      sourceIntegrity: 'clean'
    },
    lastResult: {
      status: 'settled',
      selectedAssistantVariant: {
        selectedSwipeIndex: 1,
        swipeCount: 3,
        sourceIntegrity: 'clean'
      },
      sourceTextHashes: {
        selectedAssistantVariant: 'hash-selected',
        previousAssistant: 'hash-selected'
      }
    },
    sourceEditInvalidation: {
      ok: true,
      action: 'sceneHandshakeInvalidated',
      lastStatus: 'invalidated'
    },
    sourceIntegrityProof: {
      kind: 'directive.sourceIntegrityProof.v1',
      integrityKind: 'selectedSwipe',
      sourceRole: 'assistant',
      actuationMode: 'native-host-swipe-control',
      nativeHostControlMoved: true,
      selectedHostMessageId: 'assistant-selected-swipe',
      selectedSwipeIndex: 1,
      swipeCount: 3,
      sourceIntegrity: 'clean',
      selectedHashMatchesPrevious: true,
      discardedSwipeCanariesAbsent: true,
      sourceTextHashes: {
        selectedAssistantVariant: 'hash-selected',
        previousAssistant: 'hash-selected',
        currentPlayer: 'hash-player',
        range: 'hash-range'
      },
      sreDecision: {
        status: 'settled',
        action: 'autoCommit'
      }
    }
  };
}

function writeBundle(root, overrides = {}) {
  const paths = {
    sourceEdit: writeJson(path.join(root, 'source-edit.json'), overrides.sourceEdit || mutationReport({
      kind: 'directive.sillytavernMessageEdit.live',
      isUser: true,
      trackedKind: 'ingress',
      operation: 'edit'
    })),
    sourceDelete: writeJson(path.join(root, 'source-delete.json'), overrides.sourceDelete || mutationReport({
      kind: 'directive.sillytavernMessageDelete.live',
      isUser: true,
      trackedKind: 'ingress',
      operation: 'delete'
    })),
    assistantEdit: writeJson(path.join(root, 'assistant-edit.json'), overrides.assistantEdit || mutationReport({
      kind: 'directive.sillytavernMessageEdit.live',
      isUser: false,
      trackedKind: 'response',
      operation: 'edit'
    })),
    assistantDelete: writeJson(path.join(root, 'assistant-delete.json'), overrides.assistantDelete || mutationReport({
      kind: 'directive.sillytavernMessageDelete.live',
      isUser: false,
      trackedKind: 'response',
      operation: 'delete'
    })),
    selectedSwipe: writeJson(path.join(root, 'selected-swipe.json'), overrides.selectedSwipe || selectedSwipeReport())
  };
  const manifest = writeJson(path.join(root, 'message-mutation-actuation-manifest.json'), {
    sourceEdit: path.relative(root, paths.sourceEdit),
    sourceDelete: path.relative(root, paths.sourceDelete),
    assistantEdit: path.relative(root, paths.assistantEdit),
    assistantDelete: path.relative(root, paths.assistantDelete),
    selectedSwipe: path.relative(root, paths.selectedSwipe)
  });
  return { manifest, paths };
}

const passRoot = makeRoot();
const passBundle = writeBundle(passRoot);
const passReport = buildMessageMutationActuationProof({
  manifest: passBundle.manifest,
  strict: true
});
assert.equal(passReport.status, 'pass');
assert.equal(passReport.kind, 'directive.sillytavernMessageMutation.actuationProof.v1');
assert.equal(passReport.defaultUserTouched, false);
assert.deepEqual(passReport.requiredScenarios, ['source-edit', 'source-delete', 'assistant-edit', 'assistant-delete', 'selected-swipe']);
assert.equal(passReport.scenarios.every((entry) => entry.status === 'pass'), true);
const written = writeMessageMutationActuationProof(passReport, { manifest: passBundle.manifest });
assert.equal(fs.existsSync(written), true);

const roleMismatchRoot = makeRoot();
const roleMismatchBundle = writeBundle(roleMismatchRoot, {
  sourceEdit: mutationReport({
    kind: 'directive.sillytavernMessageEdit.live',
    isUser: false,
    trackedKind: 'response',
    operation: 'edit'
  })
});
const roleMismatchReport = buildMessageMutationActuationProof({
  manifest: roleMismatchBundle.manifest,
  strict: true
});
assert.equal(roleMismatchReport.status, 'fail');
assert.equal(roleMismatchReport.scenarios.find((entry) => entry.id === 'source-edit').status, 'fail');
assert(roleMismatchReport.failures.some((entry) => /source-edit: target role mismatch/.test(entry)));

const selectedMissingRoot = makeRoot();
const selectedMissingBundle = writeBundle(selectedMissingRoot);
fs.rmSync(selectedMissingBundle.paths.selectedSwipe, { force: true });
const selectedMissingReport = buildMessageMutationActuationProof({
  manifest: selectedMissingBundle.manifest,
  strict: true
});
assert.equal(selectedMissingReport.status, 'fail');
assert.equal(selectedMissingReport.scenarios.find((entry) => entry.id === 'selected-swipe').status, 'fail');

const defaultUserRoot = makeRoot();
const defaultUserBundle = writeBundle(defaultUserRoot, {
  assistantDelete: mutationReport({
    kind: 'directive.sillytavernMessageDelete.live',
    isUser: false,
    trackedKind: 'response',
    operation: 'delete',
    user: 'default-user'
  })
});
const defaultUserReport = buildMessageMutationActuationProof({
  manifest: defaultUserBundle.manifest,
  strict: true
});
assert.equal(defaultUserReport.status, 'fail');
assert(defaultUserReport.failures.some((entry) => /assistant-delete: proof must use a non-human SillyTavern user/.test(entry)));

const missingServedRoot = makeRoot();
const missingServedArtifact = mutationReport({
  kind: 'directive.sillytavernMessageEdit.live',
  isUser: true,
  trackedKind: 'ingress',
  operation: 'edit'
});
delete missingServedArtifact.servedExtension;
const missingServedBundle = writeBundle(missingServedRoot, {
  sourceEdit: missingServedArtifact
});
const missingServedReport = buildMessageMutationActuationProof({
  manifest: missingServedBundle.manifest,
  strict: true
});
assert.equal(missingServedReport.status, 'fail');
assert(missingServedReport.failures.some((entry) => /source-edit: served extension freshness is missing or failed/.test(entry)));
assert.equal(missingServedReport.servedExtension.ok, false);
assert.equal(missingServedReport.servedExtension.missingChildReportCount, 1);

const missingControlRoot = makeRoot();
const missingControlArtifact = mutationReport({
  kind: 'directive.sillytavernMessageEdit.live',
  isUser: true,
  trackedKind: 'ingress',
  operation: 'edit'
});
delete missingControlArtifact.edit.doneButtonBox;
const missingControlBundle = writeBundle(missingControlRoot, {
  sourceEdit: missingControlArtifact
});
const missingControlReport = buildMessageMutationActuationProof({
  manifest: missingControlBundle.manifest,
  strict: true
});
assert.equal(missingControlReport.status, 'fail');
assert(missingControlReport.failures.some((entry) => /source-edit: native edit done button evidence is missing/.test(entry)));

const missingProofRoot = makeRoot();
const missingProofArtifact = mutationReport({
  kind: 'directive.sillytavernMessageEdit.live',
  isUser: true,
  trackedKind: 'ingress',
  operation: 'edit'
});
delete missingProofArtifact.sourceMutationProof;
const missingProofBundle = writeBundle(missingProofRoot, {
  sourceEdit: missingProofArtifact
});
const missingProofReport = buildMessageMutationActuationProof({
  manifest: missingProofBundle.manifest,
  strict: true
});
assert.equal(missingProofReport.status, 'fail');
assert(missingProofReport.failures.some((entry) => /source-edit: sourceMutationProof is missing/.test(entry)));

const incompleteProofRoot = makeRoot();
const incompleteProofArtifact = mutationReport({
  kind: 'directive.sillytavernMessageDelete.live',
  isUser: false,
  trackedKind: 'response',
  operation: 'delete'
});
delete incompleteProofArtifact.sourceMutationProof.coreRecovery.status;
delete incompleteProofArtifact.sourceMutationProof.repairDecision.kind;
const incompleteProofBundle = writeBundle(incompleteProofRoot, {
  assistantDelete: incompleteProofArtifact
});
const incompleteProofReport = buildMessageMutationActuationProof({
  manifest: incompleteProofBundle.manifest,
  strict: true
});
assert.equal(incompleteProofReport.status, 'fail');
assert(incompleteProofReport.failures.some((entry) => /assistant-delete: sourceMutationProof\.coreRecovery status is missing/.test(entry)));
assert(incompleteProofReport.failures.some((entry) => /assistant-delete: sourceMutationProof\.repairDecision kind is missing/.test(entry)));

const selectedDefaultRoot = makeRoot();
const selectedDefaultBundle = writeBundle(selectedDefaultRoot, {
  selectedSwipe: selectedSwipeReport('default-user')
});
const selectedDefaultReport = buildMessageMutationActuationProof({
  manifest: selectedDefaultBundle.manifest,
  strict: true
});
assert.equal(selectedDefaultReport.status, 'fail');
assert(selectedDefaultReport.failures.some((entry) => /selected-swipe: proof must use a non-human SillyTavern user/.test(entry)));

const rawTextRoot = makeRoot();
const rawTextArtifact = mutationReport({
  kind: 'directive.sillytavernMessageDelete.live',
  isUser: true,
  trackedKind: 'ingress',
  operation: 'delete'
});
rawTextArtifact.before.targetMessage.text = 'This raw player text must not be retained.';
const rawTextBundle = writeBundle(rawTextRoot, {
  sourceDelete: rawTextArtifact
});
const rawTextReport = buildMessageMutationActuationProof({
  manifest: rawTextBundle.manifest,
  strict: true
});
assert.equal(rawTextReport.status, 'fail');
assert(rawTextReport.failures.some((entry) => /source-delete: raw text fields are present/.test(entry)));

const rawRecoveryRoot = makeRoot();
const rawRecoveryArtifact = mutationReport({
  kind: 'directive.sillytavernMessageEdit.live',
  isUser: true,
  trackedKind: 'ingress',
  operation: 'edit'
});
rawRecoveryArtifact.recentRecoveryJournal = [
  {
    details: {
      replacementText: 'This nested replacement text must be redacted.'
    }
  }
];
const rawRecoveryBundle = writeBundle(rawRecoveryRoot, {
  sourceEdit: rawRecoveryArtifact
});
const rawRecoveryReport = buildMessageMutationActuationProof({
  manifest: rawRecoveryBundle.manifest,
  strict: true
});
assert.equal(rawRecoveryReport.status, 'fail');
assert(rawRecoveryReport.failures.some((entry) => /source-edit: raw text fields are present: recentRecoveryJournal\.0\.details\.replacementText/.test(entry)));

const rawWaitedRoot = makeRoot();
const rawWaitedArtifact = mutationReport({
  kind: 'directive.sillytavernMessageEdit.live',
  isUser: false,
  trackedKind: 'response',
  operation: 'edit'
});
rawWaitedArtifact.waited.snapshot = {
  targetMessage: {
    text: 'This raw assistant text must not be retained.'
  }
};
const rawWaitedBundle = writeBundle(rawWaitedRoot, {
  assistantEdit: rawWaitedArtifact
});
const rawWaitedReport = buildMessageMutationActuationProof({
  manifest: rawWaitedBundle.manifest,
  strict: true
});
assert.equal(rawWaitedReport.status, 'fail');
assert(rawWaitedReport.failures.some((entry) => /assistant-edit: raw text fields are present: waited\.snapshot\.targetMessage\.text/.test(entry)));

const missingIntegrityRoot = makeRoot();
const missingIntegrityArtifact = selectedSwipeReport();
delete missingIntegrityArtifact.sourceIntegrityProof;
const missingIntegrityBundle = writeBundle(missingIntegrityRoot, {
  selectedSwipe: missingIntegrityArtifact
});
const missingIntegrityReport = buildMessageMutationActuationProof({
  manifest: missingIntegrityBundle.manifest,
  strict: true
});
assert.equal(missingIntegrityReport.status, 'fail');
assert(missingIntegrityReport.failures.some((entry) => /selected-swipe: sourceIntegrityProof is missing/.test(entry)));

const stagedSwipeRoot = makeRoot();
const stagedSwipeArtifact = selectedSwipeReport();
stagedSwipeArtifact.sourceIntegrityProof.actuationMode = 'staged-context-source-truth';
stagedSwipeArtifact.sourceIntegrityProof.nativeHostControlMoved = false;
const stagedSwipeBundle = writeBundle(stagedSwipeRoot, {
  selectedSwipe: stagedSwipeArtifact
});
const stagedSwipeReport = buildMessageMutationActuationProof({
  manifest: stagedSwipeBundle.manifest,
  strict: true
});
assert.equal(stagedSwipeReport.status, 'fail');
assert(stagedSwipeReport.failures.some((entry) => /selected-swipe: sourceIntegrityProof actuationMode must be native-host-swipe-control/.test(entry)));
assert(stagedSwipeReport.failures.some((entry) => /selected-swipe: sourceIntegrityProof nativeHostControlMoved must be true/.test(entry)));

fs.rmSync(passRoot, { recursive: true, force: true });
fs.rmSync(roleMismatchRoot, { recursive: true, force: true });
fs.rmSync(selectedMissingRoot, { recursive: true, force: true });
fs.rmSync(defaultUserRoot, { recursive: true, force: true });
fs.rmSync(missingServedRoot, { recursive: true, force: true });
fs.rmSync(missingControlRoot, { recursive: true, force: true });
fs.rmSync(missingProofRoot, { recursive: true, force: true });
fs.rmSync(incompleteProofRoot, { recursive: true, force: true });
fs.rmSync(selectedDefaultRoot, { recursive: true, force: true });
fs.rmSync(rawTextRoot, { recursive: true, force: true });
fs.rmSync(rawRecoveryRoot, { recursive: true, force: true });
fs.rmSync(rawWaitedRoot, { recursive: true, force: true });
fs.rmSync(missingIntegrityRoot, { recursive: true, force: true });
fs.rmSync(stagedSwipeRoot, { recursive: true, force: true });

console.log('SillyTavern message mutation actuation preflight tests passed.');
