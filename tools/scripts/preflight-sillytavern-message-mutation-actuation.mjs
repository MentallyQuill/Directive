import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPORT_KIND = 'directive.sillytavernMessageMutation.actuationProof.v1';

const EXPECTED_KINDS = Object.freeze({
  edit: 'directive.sillytavernMessageEdit.live',
  delete: 'directive.sillytavernMessageDelete.live'
});

const SCENARIOS = Object.freeze([
  'source-edit',
  'source-delete',
  'assistant-edit',
  'assistant-delete',
  'selected-swipe'
]);

const FORBIDDEN_RAW_TEXT_KEYS = new Set([
  'text',
  'mes',
  'originaltext',
  'replacementtext',
  'rawtext',
  'fulltext',
  'messagetext',
  'assistanttext',
  'playertext',
  'prompt',
  'provideroutput'
]);

function usage() {
  return `Usage:
  node tools/scripts/preflight-sillytavern-message-mutation-actuation.mjs --manifest <file> [--strict] [--write-artifacts]

Options:
  --manifest PATH            JSON manifest with source/assistant edit/delete and selected-swipe report paths.
  --source-edit PATH         run-sillytavern-message-edit-live.mjs report for a player/source row.
  --source-delete PATH       run-sillytavern-message-delete-live.mjs report for a player/source row.
  --assistant-edit PATH      run-sillytavern-message-edit-live.mjs report for an assistant row.
  --assistant-delete PATH    run-sillytavern-message-delete-live.mjs report for an assistant row.
  --selected-swipe PATH      smoke-scene-handshake-live.mjs JSON output proving selected-swipe source truth.
  --strict                   Any warning fails.
  --write-artifacts          Write message-mutation-actuation-proof.json beside the manifest, or under artifacts/live-soak.
  --output PATH              Write the proof artifact to a specific path.
`;
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    manifest: '',
    strict: process.env.DIRECTIVE_MESSAGE_MUTATION_ACTUATION_STRICT === '1',
    writeArtifacts: false,
    output: '',
    paths: {
      sourceEdit: '',
      sourceDelete: '',
      assistantEdit: '',
      assistantDelete: '',
      selectedSwipe: ''
    },
    help: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--manifest') options.manifest = path.resolve(argv[++index] || '');
    else if (arg.startsWith('--manifest=')) options.manifest = path.resolve(arg.slice('--manifest='.length));
    else if (arg === '--strict') options.strict = true;
    else if (arg === '--write-artifacts') options.writeArtifacts = true;
    else if (arg === '--output') options.output = path.resolve(argv[++index] || '');
    else if (arg.startsWith('--output=')) options.output = path.resolve(arg.slice('--output='.length));
    else if (arg === '--source-edit') options.paths.sourceEdit = path.resolve(argv[++index] || '');
    else if (arg === '--source-delete') options.paths.sourceDelete = path.resolve(argv[++index] || '');
    else if (arg === '--assistant-edit') options.paths.assistantEdit = path.resolve(argv[++index] || '');
    else if (arg === '--assistant-delete') options.paths.assistantDelete = path.resolve(argv[++index] || '');
    else if (arg === '--selected-swipe') options.paths.selectedSwipe = path.resolve(argv[++index] || '');
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function readJson(filePath) {
  if (!filePath) return null;
  if (!fs.existsSync(filePath)) return { __readError: { message: 'file does not exist' } };
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return { __readError: { message: error?.message || String(error) } };
  }
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return filePath;
}

function resolveManifestPath(baseDir, value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return path.resolve(path.isAbsolute(raw) ? raw : path.join(baseDir, raw));
}

function loadManifest(filePath) {
  if (!filePath) return {};
  const manifest = readJson(filePath);
  if (!manifest || manifest.__readError) {
    return { __readError: manifest?.__readError || { message: 'manifest path is missing' } };
  }
  const baseDir = path.dirname(filePath);
  return {
    sourceEdit: resolveManifestPath(baseDir, manifest.sourceEdit),
    sourceDelete: resolveManifestPath(baseDir, manifest.sourceDelete),
    assistantEdit: resolveManifestPath(baseDir, manifest.assistantEdit),
    assistantDelete: resolveManifestPath(baseDir, manifest.assistantDelete),
    selectedSwipe: resolveManifestPath(baseDir, manifest.selectedSwipe || manifest.sceneHandshakeSelectedSwipe)
  };
}

function mergePaths(manifestPaths = {}, cliPaths = {}) {
  const merged = {};
  for (const key of ['sourceEdit', 'sourceDelete', 'assistantEdit', 'assistantDelete', 'selectedSwipe']) {
    merged[key] = cliPaths[key] || manifestPaths[key] || '';
  }
  return merged;
}

function compact(value = '', max = 220) {
  const text = String(value || '');
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 3))}...`;
}

function statusRank(status = 'unknown') {
  if (status === 'fail') return 3;
  if (status === 'warning') return 2;
  if (status === 'pass') return 1;
  return 2;
}

function worstStatus(statuses = []) {
  if (!statuses.length) return 'fail';
  return statuses.reduce((worst, status) => (statusRank(status) > statusRank(worst) ? status : worst), 'pass');
}

function isNonHumanUser(value) {
  const user = String(value || '').trim().toLowerCase();
  return Boolean(user && user !== 'default-user');
}

function servedExtensionFresh(report = {}) {
  const served = report?.servedExtension || null;
  if (served) {
    return served.ok === true
      && Number(served.mismatchCount || 0) === 0
      && Number(served.servedFailureCount || 0) === 0;
  }
  const staleCheck = report?.staleCheck || null;
  if (staleCheck) return staleCheck.ok === true && staleCheck.skipped !== true;
  return false;
}

function summarizeServedExtension(report = {}) {
  const served = report?.servedExtension || null;
  if (served) {
    return {
      ok: served.ok === true,
      mismatchCount: Number(served.mismatchCount || 0),
      servedFailureCount: Number(served.servedFailureCount || 0),
      comparedFiles: Array.isArray(served.comparedFiles)
        ? served.comparedFiles.filter(Boolean)
        : Array.isArray(served.compared)
          ? served.compared.map((entry) => entry?.relativePath || entry?.file || entry).filter(Boolean)
          : []
    };
  }
  const staleCheck = report?.staleCheck || null;
  if (staleCheck) {
    return {
      ok: staleCheck.ok === true && staleCheck.skipped !== true,
      mismatchCount: Number(staleCheck.mismatchCount || 0),
      servedFailureCount: Number(staleCheck.servedFailureCount || 0),
      comparedFiles: Array.isArray(staleCheck.comparedFiles)
        ? staleCheck.comparedFiles.filter(Boolean)
        : []
    };
  }
  return null;
}

function aggregateServedExtension(scenarios = []) {
  const summaries = scenarios.map((entry) => entry.servedExtension).filter(Boolean);
  const comparedFiles = [...new Set(summaries.flatMap((entry) => entry.comparedFiles || []))];
  const missingCount = scenarios.length - summaries.length;
  return {
    ok: scenarios.length > 0
      && missingCount === 0
      && summaries.every((entry) => entry.ok === true)
      && summaries.reduce((sum, entry) => sum + Number(entry.mismatchCount || 0), 0) === 0
      && summaries.reduce((sum, entry) => sum + Number(entry.servedFailureCount || 0), 0) === 0,
    childReportCount: scenarios.length,
    freshChildReportCount: summaries.filter((entry) => entry.ok === true).length,
    missingChildReportCount: missingCount,
    mismatchCount: summaries.reduce((sum, entry) => sum + Number(entry.mismatchCount || 0), 0),
    servedFailureCount: summaries.reduce((sum, entry) => sum + Number(entry.servedFailureCount || 0), 0),
    comparedFiles
  };
}

function collectRawTextLeaks(value, pathParts = [], leaks = []) {
  if (!value || typeof value !== 'object') return leaks;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectRawTextLeaks(entry, [...pathParts, String(index)], leaks));
    return leaks;
  }
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    const nextPath = [...pathParts, key];
    if ((FORBIDDEN_RAW_TEXT_KEYS.has(normalized) || normalized.endsWith('textpreview')) && typeof child === 'string' && child.trim()) {
      leaks.push(nextPath.join('.'));
      continue;
    }
    collectRawTextLeaks(child, nextPath, leaks);
  }
  return leaks;
}

function assertNoRawTextLeaks(artifact = {}, failures = []) {
  const leaks = collectRawTextLeaks(artifact).slice(0, 8);
  if (leaks.length) failures.push(`raw text fields are present: ${leaks.join(', ')}`);
}

function hasBoundingBox(value) {
  return Boolean(value && typeof value === 'object'
    && Number.isFinite(Number(value.x))
    && Number.isFinite(Number(value.y))
    && Number(value.width) > 0
    && Number(value.height) > 0);
}

function readArtifact(filePath) {
  const artifact = readJson(filePath);
  if (!filePath) return { artifact: null, failures: ['artifact path is missing'] };
  if (!artifact || artifact.__readError) {
    return {
      artifact: null,
      failures: [`artifact could not be read: ${artifact?.__readError?.message || 'unknown read error'}`]
    };
  }
  return { artifact, failures: [] };
}

function trackingChanged(before = null, after = null, kind = 'ingress') {
  const a = before?.[kind] || null;
  const b = after?.[kind] || null;
  if (!a && !b) return false;
  return a?.status !== b?.status
    || a?.editedAt !== b?.editedAt
    || a?.deletedAt !== b?.deletedAt
    || a?.invalidatedAt !== b?.invalidatedAt
    || a?.recoveryId !== b?.recoveryId
    || a?.replacementTextSet !== b?.replacementTextSet;
}

function proofTargetMesid(proof = {}) {
  return String(proof.targetHostMessageId || proof.targetMesid || proof.hostMessageId || '').trim();
}

function legacyRecoveryDelta(artifact = {}) {
  return Number(artifact.deltas?.legacyRecovery ?? artifact.deltas?.recovery ?? 0);
}

function validateSourceMutationProof({
  proof = null,
  artifact = {},
  mutationKind,
  expectedSourceRole,
  expectedTrackedKind,
  failures = []
} = {}) {
  if (!proof || typeof proof !== 'object') {
    failures.push('sourceMutationProof is missing');
    return null;
  }
  if (proof.kind !== 'directive.sourceMutationProof.v1') {
    failures.push('sourceMutationProof kind must be directive.sourceMutationProof.v1');
  }
  if (proof.mutationKind !== mutationKind) {
    failures.push(`sourceMutationProof mutationKind must be ${mutationKind}`);
  }
  if (proof.sourceRole !== expectedSourceRole) {
    failures.push(`sourceMutationProof sourceRole must be ${expectedSourceRole}`);
  }
  if (proof.trackedKind !== expectedTrackedKind) {
    failures.push(`sourceMutationProof trackedKind must be ${expectedTrackedKind}`);
  }
  const expectedMesid = String(
    artifact.before?.targetMesid
      || artifact.after?.targetMesid
      || artifact[mutationKind === 'delete' ? 'deletion' : 'edit']?.targetMesid
      || ''
  ).trim();
  const reportedMesid = proofTargetMesid(proof);
  if (!reportedMesid) failures.push('sourceMutationProof targetHostMessageId is missing');
  else if (expectedMesid && reportedMesid !== expectedMesid) {
    failures.push(`sourceMutationProof targetHostMessageId mismatch: expected ${expectedMesid}, got ${reportedMesid}`);
  }
  if (proof.nativeHostControlMoved !== true) failures.push('sourceMutationProof nativeHostControlMoved must be true');
  if (proof.trackingChanged !== true) failures.push('sourceMutationProof trackingChanged must be true');
  if (!proof.coreRecovery?.status) failures.push('sourceMutationProof.coreRecovery status is missing');
  if (!proof.coreRecovery?.recoveryCaseId && !proof.coreRecovery?.id && !proof.coreRecovery?.transactionId) {
    failures.push('sourceMutationProof.coreRecovery id is missing');
  }
  if (proof.repairDecision?.kind !== 'directive.repairDecision.v1') {
    failures.push('sourceMutationProof.repairDecision kind is missing');
  }
  if (!proof.repairDecision?.action) failures.push('sourceMutationProof.repairDecision action is missing');
  if (!proof.repairDecision?.eventType) failures.push('sourceMutationProof.repairDecision eventType is missing');
  return {
    kind: proof.kind || null,
    mutationKind: proof.mutationKind || null,
    sourceRole: proof.sourceRole || null,
    trackedKind: proof.trackedKind || null,
    targetHostMessageId: reportedMesid || null,
    nativeHostControlMoved: proof.nativeHostControlMoved === true,
    trackingChanged: proof.trackingChanged === true,
    legacyRecoveryDelta: Number(proof.legacyRecoveryDelta ?? proof.recoveryDelta ?? 0),
    coreRecovery: {
      status: proof.coreRecovery?.status || null,
      phase: proof.coreRecovery?.phase || null,
      recoveryCaseId: proof.coreRecovery?.recoveryCaseId || proof.coreRecovery?.id || null,
      transactionId: proof.coreRecovery?.transactionId || null
    },
    repairDecision: {
      kind: proof.repairDecision?.kind || null,
      action: proof.repairDecision?.action || null,
      eventType: proof.repairDecision?.eventType || null,
      sourceKind: proof.repairDecision?.sourceKind || null,
      recoveryStatus: proof.repairDecision?.recoveryStatus || null
    }
  };
}

function validateSourceIntegrityProof({
  proof = null,
  variant = null,
  sourceHashes = null,
  failures = []
} = {}) {
  if (!proof || typeof proof !== 'object') {
    failures.push('sourceIntegrityProof is missing');
    return null;
  }
  if (proof.kind !== 'directive.sourceIntegrityProof.v1') {
    failures.push('sourceIntegrityProof kind must be directive.sourceIntegrityProof.v1');
  }
  const integrityKind = proof.integrityKind || proof.mutationKind || null;
  if (integrityKind !== 'selectedSwipe') failures.push('sourceIntegrityProof integrityKind must be selectedSwipe');
  if (proof.sourceRole !== 'assistant') failures.push('sourceIntegrityProof sourceRole must be assistant');
  const proofSelectedIndex = Number(proof.selectedSwipeIndex);
  const proofSwipeCount = Number(proof.swipeCount);
  if (!Number.isFinite(proofSelectedIndex)) failures.push('sourceIntegrityProof selectedSwipeIndex is missing');
  if (!Number.isFinite(proofSwipeCount) || proofSwipeCount < 2) failures.push('sourceIntegrityProof swipeCount must be at least 2');
  if (variant && Number.isFinite(Number(variant.selectedSwipeIndex)) && proofSelectedIndex !== Number(variant.selectedSwipeIndex)) {
    failures.push('sourceIntegrityProof selectedSwipeIndex does not match selectedAssistantVariant');
  }
  if (variant && Number.isFinite(Number(variant.swipeCount)) && proofSwipeCount !== Number(variant.swipeCount)) {
    failures.push('sourceIntegrityProof swipeCount does not match selectedAssistantVariant');
  }
  if (proof.sourceIntegrity !== 'clean') failures.push(`sourceIntegrityProof sourceIntegrity is ${proof.sourceIntegrity || 'missing'}`);
  if (proof.selectedHashMatchesPrevious !== true) {
    failures.push('sourceIntegrityProof selectedHashMatchesPrevious must be true');
  }
  if (proof.discardedSwipeCanariesAbsent !== true) {
    failures.push('sourceIntegrityProof discardedSwipeCanariesAbsent must be true');
  }
  const hashRefs = proof.sourceTextHashes || proof.hashRefs || {};
  const selectedHash = hashRefs.selectedAssistantVariant || sourceHashes?.selectedAssistantVariant || null;
  const previousHash = hashRefs.previousAssistant || sourceHashes?.previousAssistant || null;
  if (!selectedHash || !previousHash) {
    failures.push('sourceIntegrityProof source hash refs are missing');
  } else if (selectedHash !== previousHash) {
    failures.push('sourceIntegrityProof selected assistant hash does not match previous assistant hash');
  }
  if (!proof.sreDecision?.status) failures.push('sourceIntegrityProof.sreDecision status is missing');
  return {
    kind: proof.kind || null,
    integrityKind,
    sourceRole: proof.sourceRole || null,
    selectedSwipeIndex: Number.isFinite(proofSelectedIndex) ? proofSelectedIndex : null,
    swipeCount: Number.isFinite(proofSwipeCount) ? proofSwipeCount : null,
    sourceIntegrity: proof.sourceIntegrity || null,
    selectedHashMatchesPrevious: proof.selectedHashMatchesPrevious === true,
    discardedSwipeCanariesAbsent: proof.discardedSwipeCanariesAbsent === true,
    sourceTextHashes: {
      selectedAssistantVariant: selectedHash,
      previousAssistant: previousHash
    },
    sreDecision: {
      status: proof.sreDecision?.status || null,
      action: proof.sreDecision?.action || null
    }
  };
}

function scenarioResult({
  id,
  artifactPath,
  artifact = null,
  failures = [],
  warnings = [],
  summary = '',
  evidence = {}
}) {
  const status = failures.length ? 'fail' : warnings.length ? 'warning' : 'pass';
  return {
    id,
    status,
    ok: status === 'pass',
    artifactPath,
    kind: artifact?.kind || null,
    sillyTavernUser: artifact?.sillyTavernUser || null,
    runId: artifact?.runId || null,
    servedExtension: summarizeServedExtension(artifact),
    summary: summary || (status === 'pass' ? `${id} proof passed.` : `${id} proof did not certify.`),
    failures,
    warnings,
    evidence
  };
}

function validateEditScenario({ id, filePath, expectedIsUser }) {
  const { artifact, failures } = readArtifact(filePath);
  if (!artifact) return scenarioResult({ id, artifactPath: filePath, failures });
  const warnings = [];
  if (artifact.kind !== EXPECTED_KINDS.edit) failures.push(`expected kind ${EXPECTED_KINDS.edit}`);
  if (artifact.status !== 'pass') failures.push(`expected pass status, got ${artifact.status || 'missing'}`);
  if (!isNonHumanUser(artifact.sillyTavernUser)) failures.push('proof must use a non-human SillyTavern user');
  if (!servedExtensionFresh(artifact)) failures.push('served extension freshness is missing or failed');
  if (artifact.openCampaign?.expectedChatMatches !== true) failures.push('opened chat did not match expected chat id');
  assertNoRawTextLeaks(artifact, failures);
  if (!hasBoundingBox(artifact.edit?.editButtonBox)) failures.push('native edit button evidence is missing');
  if (!hasBoundingBox(artifact.edit?.doneButtonBox)) failures.push('native edit done button evidence is missing');
  if (!artifact.edit?.originalTextHash || !artifact.edit?.replacementTextHash) failures.push('edit text hash evidence is missing');
  const target = artifact.before?.targetMessage || null;
  if (!target) failures.push('before.targetMessage is missing');
  if (target && target.isUser !== expectedIsUser) {
    failures.push(`target role mismatch: expected ${expectedIsUser ? 'source/player' : 'assistant'} row`);
  }
  const trackedKind = expectedIsUser ? 'ingress' : 'response';
  if (!artifact.before?.[trackedKind]) failures.push(`before.${trackedKind} is missing`);
  if (artifact.waited?.ok !== true) failures.push('Directive recovery/reconciliation wait did not pass');
  if (!trackingChanged(artifact.before, artifact.after, trackedKind)) {
    failures.push(`${trackedKind} tracking did not change after edit`);
  }
  if (Number(artifact.deltas?.promptContextRevision || 0) < 0) warnings.push('prompt context revision moved backward');
  const sourceMutationProof = validateSourceMutationProof({
    proof: artifact.sourceMutationProof,
    artifact,
    mutationKind: 'edit',
    expectedSourceRole: expectedIsUser ? 'source' : 'assistant',
    expectedTrackedKind: trackedKind,
    failures
  });
  return scenarioResult({
    id,
    artifactPath: filePath,
    artifact,
    failures,
    warnings,
    summary: `${id} ${failures.length ? 'did not certify' : 'proved native edit with Directive tracking response'}.`,
    evidence: {
      targetMesid: artifact.before?.targetMesid || artifact.after?.targetMesid || null,
      targetRole: expectedIsUser ? 'source' : 'assistant',
      trackedKind,
      beforeStatus: artifact.before?.[trackedKind]?.status || null,
      afterStatus: artifact.after?.[trackedKind]?.status || null,
      legacyRecoveryDelta: legacyRecoveryDelta(artifact),
      deltaPromptContextRevision: Number(artifact.deltas?.promptContextRevision || 0),
      sourceMutationProof
    }
  });
}

function validateDeleteScenario({ id, filePath, expectedIsUser }) {
  const { artifact, failures } = readArtifact(filePath);
  if (!artifact) return scenarioResult({ id, artifactPath: filePath, failures });
  const warnings = [];
  if (artifact.kind !== EXPECTED_KINDS.delete) failures.push(`expected kind ${EXPECTED_KINDS.delete}`);
  if (artifact.status !== 'pass') failures.push(`expected pass status, got ${artifact.status || 'missing'}`);
  if (!isNonHumanUser(artifact.sillyTavernUser)) failures.push('proof must use a non-human SillyTavern user');
  if (!servedExtensionFresh(artifact)) failures.push('served extension freshness is missing or failed');
  if (artifact.openCampaign?.expectedChatMatches !== true) failures.push('opened chat did not match expected chat id');
  assertNoRawTextLeaks(artifact, failures);
  if (!hasBoundingBox(artifact.deletion?.editButtonBox)) failures.push('native edit button evidence is missing');
  if (!hasBoundingBox(artifact.deletion?.deleteButtonBox)) failures.push('native delete button evidence is missing');
  if (artifact.deletion?.confirmation?.clicked !== true && artifact.deletion?.nativeDialog?.seen !== true) {
    failures.push('native delete confirmation evidence is missing');
  }
  if (!artifact.deletion?.originalTextHash) failures.push('delete original text hash evidence is missing');
  const target = artifact.before?.targetMessage || null;
  if (!target) failures.push('before.targetMessage is missing');
  if (target && target.isUser !== expectedIsUser) {
    failures.push(`target role mismatch: expected ${expectedIsUser ? 'source/player' : 'assistant'} row`);
  }
  const trackedKind = expectedIsUser ? 'ingress' : 'response';
  if (!artifact.before?.[trackedKind]) failures.push(`before.${trackedKind} is missing`);
  if (artifact.waited?.ok !== true) failures.push('Directive recovery/reconciliation wait did not pass');
  if (!trackingChanged(artifact.before, artifact.after, trackedKind)) {
    failures.push(`${trackedKind} tracking did not change after delete`);
  }
  if (Number(artifact.deltas?.chatLength || 0) >= 0) warnings.push('chat length did not decrease after delete');
  const sourceMutationProof = validateSourceMutationProof({
    proof: artifact.sourceMutationProof,
    artifact,
    mutationKind: 'delete',
    expectedSourceRole: expectedIsUser ? 'source' : 'assistant',
    expectedTrackedKind: trackedKind,
    failures
  });
  return scenarioResult({
    id,
    artifactPath: filePath,
    artifact,
    failures,
    warnings,
    summary: `${id} ${failures.length ? 'did not certify' : 'proved native delete with Directive tracking response'}.`,
    evidence: {
      targetMesid: artifact.before?.targetMesid || artifact.after?.targetMesid || null,
      targetRole: expectedIsUser ? 'source' : 'assistant',
      trackedKind,
      beforeStatus: artifact.before?.[trackedKind]?.status || null,
      afterStatus: artifact.after?.[trackedKind]?.status || null,
      deltaChatLength: Number(artifact.deltas?.chatLength || 0),
      legacyRecoveryDelta: legacyRecoveryDelta(artifact),
      deltaPromptContextRevision: Number(artifact.deltas?.promptContextRevision || 0),
      sourceMutationProof
    }
  });
}

function validateSelectedSwipeScenario(filePath) {
  const { artifact, failures } = readArtifact(filePath);
  if (!artifact) return scenarioResult({ id: 'selected-swipe', artifactPath: filePath, failures });
  const warnings = [];
  if (artifact.ok !== true) failures.push('selected-swipe proof did not report ok=true');
  if (!isNonHumanUser(artifact.sillyTavernUser)) failures.push('proof must use a non-human SillyTavern user');
  if (!servedExtensionFresh(artifact)) failures.push('served extension freshness is missing or failed');
  assertNoRawTextLeaks(artifact, failures);
  const variant = artifact.selectedAssistantVariant || artifact.lastResult?.selectedAssistantVariant || null;
  const sourceHashes = artifact.lastResult?.sourceTextHashes
    || artifact.sceneHandshakeModelCalls?.at?.(-1)?.metadata?.sourceTextHashes
    || null;
  if (!variant) failures.push('selectedAssistantVariant evidence is missing');
  if (variant && Number(variant.swipeCount || 0) < 2) failures.push('selectedAssistantVariant.swipeCount must be at least 2');
  if (variant && !Number.isFinite(Number(variant.selectedSwipeIndex))) failures.push('selectedAssistantVariant.selectedSwipeIndex is missing');
  if (variant?.sourceIntegrity && variant.sourceIntegrity !== 'clean') failures.push(`selected swipe source integrity is ${variant.sourceIntegrity}`);
  if (!sourceHashes?.selectedAssistantVariant || !sourceHashes?.previousAssistant) {
    failures.push('selected/previous assistant source hashes are missing');
  } else if (sourceHashes.selectedAssistantVariant !== sourceHashes.previousAssistant) {
    failures.push('selected assistant variant hash does not match previous assistant source hash');
  }
  if (artifact.sourceEditInvalidation && artifact.sourceEditInvalidation.ok !== true) {
    failures.push('selected-swipe source edit invalidation did not pass');
  }
  if (!artifact.sourceEditInvalidation) {
    warnings.push('selected-swipe proof did not include source edit invalidation closeout');
  }
  const sourceIntegrityProof = validateSourceIntegrityProof({
    proof: artifact.sourceIntegrityProof,
    variant,
    sourceHashes,
    failures
  });
  return scenarioResult({
    id: 'selected-swipe',
    artifactPath: filePath,
    artifact,
    failures,
    warnings,
    summary: failures.length
      ? 'selected-swipe source truth did not certify.'
      : 'selected-swipe source truth and hash boundary certified.',
    evidence: {
      fixtureHostMessageId: artifact.fixtureHostMessageId || null,
      selectedSwipeIndex: Number.isFinite(Number(variant?.selectedSwipeIndex)) ? Number(variant.selectedSwipeIndex) : null,
      swipeCount: Number.isFinite(Number(variant?.swipeCount)) ? Number(variant.swipeCount) : null,
      sourceIntegrity: variant?.sourceIntegrity || null,
      hashMatched: Boolean(sourceHashes?.selectedAssistantVariant && sourceHashes.selectedAssistantVariant === sourceHashes.previousAssistant),
      sourceEditInvalidation: artifact.sourceEditInvalidation || null,
      sourceIntegrityProof
    }
  });
}

export function buildMessageMutationActuationProof({
  manifest = '',
  paths = {},
  strict = false
} = {}) {
  const manifestPaths = loadManifest(manifest);
  const manifestReadError = manifestPaths.__readError || null;
  const evidencePaths = mergePaths(manifestReadError ? {} : manifestPaths, paths);
  const scenarios = [
    validateEditScenario({ id: 'source-edit', filePath: evidencePaths.sourceEdit, expectedIsUser: true }),
    validateDeleteScenario({ id: 'source-delete', filePath: evidencePaths.sourceDelete, expectedIsUser: true }),
    validateEditScenario({ id: 'assistant-edit', filePath: evidencePaths.assistantEdit, expectedIsUser: false }),
    validateDeleteScenario({ id: 'assistant-delete', filePath: evidencePaths.assistantDelete, expectedIsUser: false }),
    validateSelectedSwipeScenario(evidencePaths.selectedSwipe)
  ];
  const scenarioStatus = worstStatus(scenarios.map((entry) => entry.status));
  const status = manifestReadError
    ? 'fail'
    : scenarioStatus === 'fail'
      ? 'fail'
      : strict && scenarioStatus === 'warning'
        ? 'fail'
        : scenarioStatus;
  const users = [...new Set(scenarios.map((entry) => entry.sillyTavernUser).filter(Boolean))];
  const defaultUserTouched = users.some((user) => String(user).trim().toLowerCase() === 'default-user');
  const servedExtension = aggregateServedExtension(scenarios);
  return {
    kind: REPORT_KIND,
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    ok: status === 'pass',
    status,
    strict,
    manifest: manifest || null,
    artifacts: evidencePaths,
    driver: 'playwright',
    servedExtension,
    sillyTavernUser: users[0] || null,
    sillyTavernUsers: users,
    defaultUserTouched,
    requiredScenarios: SCENARIOS,
    scenarios,
    failures: [
      ...(manifestReadError ? [`manifest could not be read: ${manifestReadError.message || 'unknown read error'}`] : []),
      ...scenarios.flatMap((entry) => entry.failures.map((failure) => `${entry.id}: ${failure}`))
    ],
    warnings: scenarios.flatMap((entry) => entry.warnings.map((warning) => `${entry.id}: ${warning}`)),
    summary: status === 'pass'
      ? 'Message mutation actuation proof is complete.'
      : 'Message mutation actuation proof is incomplete or non-certifying.'
  };
}

export function writeMessageMutationActuationProof(report, { output = '', manifest = '' } = {}) {
  const destination = output
    || (manifest
      ? path.join(path.dirname(path.resolve(manifest)), 'message-mutation-actuation-proof.json')
      : path.resolve('artifacts/live-soak/message-mutation-actuation-proof.json'));
  return writeJsonFile(destination, report);
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    console.log(usage());
    return;
  }
  const report = buildMessageMutationActuationProof({
    manifest: options.manifest,
    paths: options.paths,
    strict: options.strict
  });
  const output = (options.writeArtifacts || options.output)
    ? writeMessageMutationActuationProof(report, { output: options.output, manifest: options.manifest })
    : null;
  console.log(JSON.stringify({
    ok: report.status === 'pass',
    status: report.status,
    manifest: report.manifest,
    output,
    scenarios: report.scenarios.map((entry) => ({
      id: entry.id,
      status: entry.status,
      summary: entry.summary
    })),
    failures: report.failures,
    warnings: report.warnings
  }, null, 2));
  if (report.status === 'fail') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}
