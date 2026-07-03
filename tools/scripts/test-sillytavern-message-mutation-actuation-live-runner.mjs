import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runMessageMutationActuation } from './run-sillytavern-message-mutation-actuation-live.mjs';

const RAW_SENTINEL = 'RAW_SENTINEL_CHILD_TEXT_SHOULD_NOT_SURVIVE';

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return filePath;
}

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'directive-message-mutation-live-runner-'));
}

function servedExtension() {
  return {
    ok: true,
    mismatchCount: 0,
    servedFailureCount: 0,
    comparedFiles: ['src/hosts/sillytavern/runtime-bridge.mjs']
  };
}

function mutationReport({
  kind,
  isUser,
  trackedKind,
  operation = 'edit',
  status = 'pass',
  user = 'directive-soak-b',
  targetMesid = '12'
} = {}) {
  const beforeTracked = {
    id: `${trackedKind}.1`,
    hostMessageId: targetMesid,
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
    targetMesid,
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
    runId: `${operation}-${trackedKind}-${targetMesid}`,
    generatedAt: '2026-06-29T12:00:01.000Z',
    status,
    baseUrl: 'http://127.0.0.1:8000',
    sillyTavernUser: user,
    servedExtension: servedExtension(),
    resumeSaveId: 'save-test',
    expectedChatId: 'Directive - Ashes',
    openCampaign: { expectedChatMatches: true },
    [operation === 'delete' ? 'deletion' : 'edit']: operation === 'delete'
      ? {
          targetMesid,
          originalTextHash: 'original-hash',
          originalTextLength: 34,
          editButtonBox: { x: 1, y: 2, width: 12, height: 12 },
          deleteButtonBox: { x: 2, y: 3, width: 12, height: 12 },
          confirmation: { clicked: true, selector: '.menu_button', labelHash: 'confirm-hash', labelLength: 6, box: { x: 3, y: 4, width: 12, height: 12 } },
          nativeDialog: { seen: false, type: null }
        }
      : {
          targetMesid,
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
      targetHostMessageId: targetMesid,
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
        transactionId: `txn.${operation}.${trackedKind}.${targetMesid}`,
        recoveryCaseId: `case.${operation}.${trackedKind}.${targetMesid}`,
        phase: 'recoveryRequired',
        reason: trackedKind === 'ingress'
          ? `playerMessage${operation === 'delete' ? 'Deleted' : 'Edited'}`
          : `directiveResponse${operation === 'delete' ? 'Deleted' : 'Edited'}`
      },
      repairDecision: {
        kind: 'directive.repairDecision.v1',
        action: 'reviewRequired',
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
    servedExtension: servedExtension(),
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

function writeProvidedReports(root) {
  return {
    sourceEdit: writeJson(path.join(root, 'provided-source-edit.json'), mutationReport({
      kind: 'directive.sillytavernMessageEdit.live',
      isUser: true,
      trackedKind: 'ingress',
      operation: 'edit',
      targetMesid: '10'
    })),
    sourceDelete: writeJson(path.join(root, 'provided-source-delete.json'), mutationReport({
      kind: 'directive.sillytavernMessageDelete.live',
      isUser: true,
      trackedKind: 'ingress',
      operation: 'delete',
      targetMesid: '12'
    })),
    assistantEdit: writeJson(path.join(root, 'provided-assistant-edit.json'), mutationReport({
      kind: 'directive.sillytavernMessageEdit.live',
      isUser: false,
      trackedKind: 'response',
      operation: 'edit',
      targetMesid: '11'
    })),
    assistantDelete: writeJson(path.join(root, 'provided-assistant-delete.json'), mutationReport({
      kind: 'directive.sillytavernMessageDelete.live',
      isUser: false,
      trackedKind: 'response',
      operation: 'delete',
      targetMesid: '13'
    })),
    selectedSwipe: writeJson(path.join(root, 'provided-selected-swipe.json'), selectedSwipeReport())
  };
}

function baseLiveOptions(root, overrides = {}) {
  return {
    live: true,
    strict: true,
    writeArtifacts: true,
    runId: overrides.runId || 'live-synthetic',
    artifactRoot: root,
    baseUrl: 'http://127.0.0.1:8000',
    stUser: overrides.stUser || 'directive-soak-b',
    resumeSaveId: 'save-test',
    resumeChatId: 'Directive - Ashes',
    timeoutMs: 1000,
    reports: {},
    liveInputs: {
      sourceEditMesid: '10',
      sourceDeleteMesid: '14',
      assistantEditMesid: '11',
      assistantDeleteMesid: '13',
      sourceEditReplacementText: 'Sam waited for her reply.',
      sourceEditReplacementFile: '',
      assistantEditReplacementText: 'The bridge answer changed.',
      assistantEditReplacementFile: '',
      ...(overrides.liveInputs || {})
    }
  };
}

function childReportForScenario(scenario, env) {
  if (scenario === 'source-edit') {
    return mutationReport({
      kind: 'directive.sillytavernMessageEdit.live',
      isUser: true,
      trackedKind: 'ingress',
      operation: 'edit',
      targetMesid: env.DIRECTIVE_MESSAGE_EDIT_TARGET_MESID
    });
  }
  if (scenario === 'assistant-edit') {
    return mutationReport({
      kind: 'directive.sillytavernMessageEdit.live',
      isUser: false,
      trackedKind: 'response',
      operation: 'edit',
      targetMesid: env.DIRECTIVE_MESSAGE_EDIT_TARGET_MESID
    });
  }
  if (scenario === 'source-delete') {
    return mutationReport({
      kind: 'directive.sillytavernMessageDelete.live',
      isUser: true,
      trackedKind: 'ingress',
      operation: 'delete',
      targetMesid: env.DIRECTIVE_MESSAGE_DELETE_TARGET_MESID
    });
  }
  return mutationReport({
    kind: 'directive.sillytavernMessageDelete.live',
    isUser: false,
    trackedKind: 'response',
    operation: 'delete',
    targetMesid: env.DIRECTIVE_MESSAGE_DELETE_TARGET_MESID
  });
}

function createFakeChildRunner({ warningScenario = '' } = {}) {
  const calls = [];
  const runChild = async (command, args, { env, scenario }) => {
    calls.push({ command, args, env, scenario });
    if (scenario === 'selected-swipe') {
      const report = selectedSwipeReport();
      report.prompt = RAW_SENTINEL;
      report.debug = { text: RAW_SENTINEL };
      return {
        ok: true,
        exitCode: 0,
        stdout: `log before json\n${JSON.stringify(report)}\nlog after json`,
        stderr: `selected child stderr ${RAW_SENTINEL}`
      };
    }
    const runId = env.DIRECTIVE_MESSAGE_EDIT_RUN_ID || env.DIRECTIVE_MESSAGE_DELETE_RUN_ID;
    const report = childReportForScenario(scenario, env);
    if (scenario === warningScenario) report.status = 'warning';
    writeJson(path.join(env.DIRECTIVE_SOAK_ARTIFACT_DIR, runId, 'report.json'), report);
    return {
      ok: true,
      exitCode: 0,
      stdout: JSON.stringify({ ok: true, status: report.status }),
      stderr: `child stderr ${RAW_SENTINEL}`
    };
  };
  return { calls, runChild };
}

function createStagedSelectedSwipeChildRunner() {
  const calls = [];
  const runChild = async (command, args, { env, scenario }) => {
    calls.push({ command, args, env, scenario });
    if (scenario === 'selected-swipe') {
      const report = selectedSwipeReport();
      report.sourceIntegrityProof.actuationMode = 'staged-context-source-truth';
      report.sourceIntegrityProof.nativeHostControlMoved = false;
      return {
        ok: true,
        exitCode: 0,
        stdout: JSON.stringify(report),
        stderr: ''
      };
    }
    const runId = env.DIRECTIVE_MESSAGE_EDIT_RUN_ID || env.DIRECTIVE_MESSAGE_DELETE_RUN_ID;
    writeJson(path.join(env.DIRECTIVE_SOAK_ARTIFACT_DIR, runId, 'report.json'), childReportForScenario(scenario, env));
    return { ok: true, exitCode: 0, stdout: JSON.stringify({ ok: true }), stderr: '' };
  };
  return { calls, runChild };
}

const assemblyRoot = makeRoot();
const assemblyReports = writeProvidedReports(assemblyRoot);
const assembly = await runMessageMutationActuation({
  options: {
    live: false,
    strict: true,
    writeArtifacts: true,
    runId: 'assembly-synthetic',
    artifactRoot: assemblyRoot,
    reports: assemblyReports,
    liveInputs: {}
  }
});
assert.equal(assembly.report.status, 'pass');
assert.equal(assembly.report.proof.status, 'pass');
assert.equal(fs.existsSync(assembly.report.manifestPath), true);
assert.equal(fs.existsSync(assembly.outputPath), true);
assert.equal(fs.existsSync(path.join(assembly.report.artifactRoot, 'children.json')), true);
const assemblyManifest = JSON.parse(fs.readFileSync(assembly.report.manifestPath, 'utf8'));
assert.equal(Object.values(assemblyManifest).every((entry) => entry && !path.isAbsolute(entry)), true);

const liveRoot = makeRoot();
const fakeLive = createFakeChildRunner();
const live = await runMessageMutationActuation({
  options: baseLiveOptions(liveRoot),
  runChild: fakeLive.runChild,
  env: {}
});
assert.equal(live.report.status, 'pass');
assert.equal(live.report.proof.status, 'pass');
assert.equal(fakeLive.calls.length, 5);
assert.deepEqual(fakeLive.calls.map((call) => call.scenario), ['source-edit', 'assistant-edit', 'source-delete', 'assistant-delete', 'selected-swipe']);
assert.equal(fakeLive.calls.every((call) => call.env.DIRECTIVE_SILLYTAVERN_USER === 'directive-soak-b'), true);
assert.equal(fakeLive.calls.find((call) => call.scenario === 'source-edit').env.DIRECTIVE_MESSAGE_EDIT_SEGMENT, 'source-edit');
assert.equal(fakeLive.calls.find((call) => call.scenario === 'assistant-delete').env.DIRECTIVE_MESSAGE_DELETE_SEGMENT, 'assistant-delete');
assert.equal(fakeLive.calls.find((call) => call.scenario === 'selected-swipe').args.includes('--write-artifacts'), false);
assert.equal(fakeLive.calls.find((call) => call.scenario === 'selected-swipe').args[0], 'tools/scripts/run-sillytavern-selected-swipe-actuation-live.mjs');
assert.equal(JSON.stringify(live.report).includes('Sam waited for her reply.'), false);
assert.equal(JSON.stringify(live.report).includes(RAW_SENTINEL), false);
const liveManifest = JSON.parse(fs.readFileSync(live.report.manifestPath, 'utf8'));
assert.equal(Object.values(liveManifest).every((entry) => entry && !path.isAbsolute(entry)), true);
assert.equal(liveManifest.selectedSwipe.endsWith('children/live-synthetic-selected-swipe.json'), true);
const liveChildrenText = fs.readFileSync(path.join(live.report.artifactRoot, 'children.json'), 'utf8');
const liveProofText = fs.readFileSync(live.report.proofPath, 'utf8');
const selectedSwipeText = fs.readFileSync(path.join(live.report.artifactRoot, liveManifest.selectedSwipe), 'utf8');
assert.equal(liveChildrenText.includes(RAW_SENTINEL), false);
assert.equal(liveProofText.includes(RAW_SENTINEL), false);
assert.equal(selectedSwipeText.includes(RAW_SENTINEL), false);
assert.equal(JSON.parse(selectedSwipeText).artifactRedaction.rawTextFieldCount, 2);

const duplicateRoot = makeRoot();
const duplicateFake = createFakeChildRunner();
const duplicate = await runMessageMutationActuation({
  options: baseLiveOptions(duplicateRoot, {
    runId: 'duplicate-synthetic',
    liveInputs: {
      assistantEditMesid: '10'
    }
  }),
  runChild: duplicateFake.runChild,
  env: {}
});
assert.equal(duplicate.report.status, 'fail');
assert.equal(duplicateFake.calls.length, 0);
assert(duplicate.report.failures.some((entry) => /duplicate target mesid 10/.test(entry)));
const duplicateManifest = JSON.parse(fs.readFileSync(duplicate.report.manifestPath, 'utf8'));
assert.equal(Object.values(duplicateManifest).every((entry) => entry === ''), true);

const unsafeDeleteRoot = makeRoot();
const unsafeDeleteFake = createFakeChildRunner();
const unsafeDelete = await runMessageMutationActuation({
  options: baseLiveOptions(unsafeDeleteRoot, {
    runId: 'unsafe-delete-synthetic',
    liveInputs: {
      sourceDeleteMesid: '12',
      assistantDeleteMesid: '13'
    }
  }),
  runChild: unsafeDeleteFake.runChild,
  env: {}
});
assert.equal(unsafeDelete.report.status, 'fail');
assert.equal(unsafeDeleteFake.calls.length, 0);
assert(unsafeDelete.report.failures.some((entry) => /unsafe delete ordering/.test(entry)));

const nonNumericRoot = makeRoot();
const nonNumericFake = createFakeChildRunner();
const nonNumeric = await runMessageMutationActuation({
  options: baseLiveOptions(nonNumericRoot, {
    runId: 'nonnumeric-synthetic',
    liveInputs: {
      sourceEditMesid: 'row-ten'
    }
  }),
  runChild: nonNumericFake.runChild,
  env: {}
});
assert.equal(nonNumeric.report.status, 'fail');
assert.equal(nonNumericFake.calls.length, 0);
assert(nonNumeric.report.failures.some((entry) => /source-edit target mesid must be a numeric/.test(entry)));

const configuredUserRoot = makeRoot();
const configuredUserFake = createFakeChildRunner();
const configuredUser = await runMessageMutationActuation({
  options: {
    ...baseLiveOptions(configuredUserRoot, { runId: 'configured-user-synthetic', stUser: 'directive-soak-z' }),
    allowedUsers: ['directive-soak-a', 'directive-soak-b']
  },
  runChild: configuredUserFake.runChild,
  env: {}
});
assert.equal(configuredUser.report.status, 'fail');
assert.equal(configuredUserFake.calls.length, 0);
assert(configuredUser.report.failures.some((entry) => /not in configured DIRECTIVE_SOAK_ST_USERS/.test(entry)));

const warningRoot = makeRoot();
const warningFake = createFakeChildRunner({ warningScenario: 'source-edit' });
const warning = await runMessageMutationActuation({
  options: baseLiveOptions(warningRoot, { runId: 'warning-synthetic' }),
  runChild: warningFake.runChild,
  env: {}
});
assert.equal(warning.report.status, 'fail');
assert(warning.report.failures.some((entry) => /source-edit: expected pass status, got warning/.test(entry)));
assert.equal(warningFake.calls.length, 5);

const stagedRoot = makeRoot();
const stagedFake = createStagedSelectedSwipeChildRunner();
const staged = await runMessageMutationActuation({
  options: baseLiveOptions(stagedRoot, { runId: 'staged-selected-swipe-synthetic' }),
  runChild: stagedFake.runChild,
  env: {}
});
assert.equal(staged.report.status, 'fail');
assert(staged.report.failures.some((entry) => /selected-swipe: sourceIntegrityProof actuationMode must be native-host-swipe-control/.test(entry)));
assert.equal(stagedFake.calls.length, 5);

const selectedSwipeRunnerSource = fs.readFileSync(new URL('./run-sillytavern-selected-swipe-actuation-live.mjs', import.meta.url), 'utf8');
const editRunnerSource = fs.readFileSync(new URL('./run-sillytavern-message-edit-live.mjs', import.meta.url), 'utf8');
const deleteRunnerSource = fs.readFileSync(new URL('./run-sillytavern-message-delete-live.mjs', import.meta.url), 'utf8');
for (const [label, source] of [['edit', editRunnerSource], ['delete', deleteRunnerSource]]) {
  assert.match(
    source,
    /summarizeOpenResult[\s\S]*promptBlockCount[\s\S]*promptTextFieldCount/,
    `${label} runner must summarize openCampaign prompt packets instead of writing raw prompt text into reports.`
  );
  assert.doesNotMatch(
    source,
    /openResult:\s*clone\(openResult\)/,
    `${label} runner must not clone full openCampaign openResult into live proof artifacts.`
  );
  assert.match(
    source,
    /expectsCoreRecovery[\s\S]*ownerEvidenceReady[\s\S]*coreRecoveryChanged/,
    `${label} runner must wait for CORE recovery evidence for CORE-backed mutation targets.`
  );
  assert.match(
    source,
    /sourceMutationDecisionFromRecovery[\s\S]*recoveryCaseId[\s\S]*eventType/,
    `${label} runner must preserve compact REPAIR decision evidence when CORE projection stores source-mutation event authority by recovery id.`
  );
  assert.match(
    source,
    /coreRecoveryEntries[\s\S]*coreRecoveryJournal[\s\S]*recoveryJournal/,
    `${label} runner must find CORE-shaped recovery projections whether the live bridge exposes them through CORE projections or the runtime recovery mirror.`
  );
  assert.match(
    source,
    /triggerPostActuationReobserve[\s\S]*handleHostMessage/,
    `${label} runner must explicitly record a post-actuation runtime reobserve when the native SillyTavern event does not arrive.`
  );
}
assert.match(
  selectedSwipeRunnerSource,
  /entry\.index\s*===\s*chat\.length\s*-\s*1[\s\S]*nativeSwipeTargetRequirement:\s*'sillytavern-text-swipe-buttons-bind-to-last_mes'/,
  'Selected-swipe native runner must fail before candidate append unless the recorded Directive-owned target is the latest host message.'
);
assert.match(
  selectedSwipeRunnerSource,
  /DIRECTIVE_SELECTED_SWIPE_CREATE_LATEST_TARGET[\s\S]*postAssistantMessage[\s\S]*recordDirectiveResponse[\s\S]*setup-only-latest-directive-owned-response/,
  'Selected-swipe native runner must expose an opt-in setup path that creates a latest Directive-owned recorded target through host posting plus response-ledger setup.'
);
assert.match(
  selectedSwipeRunnerSource,
  /compactTargetSetupForReport[\s\S]*textHash[\s\S]*textLength/,
  'Selected-swipe setup artifacts must report target hashes/counts instead of raw target prose.'
);
assert.match(
  selectedSwipeRunnerSource,
  /targetSetup\?\.responseId[\s\S]*String\(responseId\(response\) \|\| ''\) === String\(targetSetup\.responseId\)/,
  'Selected-swipe setup target must use the exact setup response id so old positional host-message ledger rows cannot be selected.'
);
assert.match(
  selectedSwipeRunnerSource,
  /createRuntimeLedgerView[\s\S]*coreProjectionAvailable[\s\S]*core-ledger-host-generation/,
  'Selected-swipe runner must accept CORE-recorded natural host-generation latest rows without setup-only Directive metadata.'
);
assert.match(
  selectedSwipeRunnerSource,
  /dismissDirectivePresetDialog[\s\S]*directive-preset-update-dialog[\s\S]*overlay\?\.remove/,
  'Selected-swipe native runner must dismiss Directive preset-update overlays before clicking native SillyTavern swipe controls.'
);
assert.match(
  selectedSwipeRunnerSource,
  /controlAfterIndex[\s\S]*controlMoved[\s\S]*ok:\s*controlMoved[\s\S]*nativeHostControlMoved:\s*controlMoved/,
  'Selected-swipe diagnostic native API fallback must not satisfy native host-control proof.'
);

for (const root of [assemblyRoot, liveRoot, duplicateRoot, unsafeDeleteRoot, nonNumericRoot, configuredUserRoot, warningRoot, stagedRoot]) {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log('SillyTavern message mutation actuation live runner tests passed.');
