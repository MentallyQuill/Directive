import {
  asArray,
  cloneJson,
  compact,
  hashContinuityText
} from './fact-schema.mjs';
import { DIRECTIVE_STATIC_PROMPT_KEYS } from './prompt-keys.mjs';
import { normalizeContinuityState } from './state.mjs';
import { createRuntimeLedgerView } from '../runtime/runtime-ledger-view.mjs';

function latest(values = []) {
  return asArray(values).at(-1) || null;
}

function count(values) {
  return asArray(values).length;
}

function hashOrNull(value) {
  const text = compact(value);
  return text ? hashContinuityText(text) : null;
}

function sanitizedClaimRecord(claim = {}) {
  if (!claim || typeof claim !== 'object' || Array.isArray(claim)) return null;
  return {
    idHash: hashOrNull(claim.id),
    categories: cloneJson(claim.categories || claim.category ? asArray(claim.categories || [claim.category]) : []),
    textHash: claim.textHash || hashOrNull(claim.text),
    status: compact(claim.status) || null,
    sourceKind: compact(claim.source?.kind || claim.sourceKind) || null,
    sourceHash: hashOrNull(claim.source?.id || claim.source?.responseId || claim.source?.outcomeId || claim.sourceId)
  };
}

function latestContinuityReview(campaignState = {}) {
  const runtimeLedgerView = createRuntimeLedgerView(campaignState || {});
  const recoveryRows = asArray(runtimeLedgerView.recoveryJournal);
  const response = [...asArray(runtimeLedgerView.responseLedger)].reverse()
    .find((entry) => entry?.continuityReview);
  const recovery = [...recoveryRows].reverse()
    .find((entry) => String(entry?.type || '').includes('Continuity') || String(entry?.type || '').includes('continuity'));
  return {
    status: response?.continuityReview?.ok === false ? 'contradicted' : (response?.continuityReview ? 'ok' : 'not-reviewed'),
    findingCount: count(response?.continuityReview?.findings),
    responseStatus: compact(response?.status) || null,
    responseIdHash: hashOrNull(response?.id),
    hostMessageIdHash: hashOrNull(response?.hostObservation?.hostMessageId || response?.hostMessageId),
    observationTextHash: response?.hostObservation?.textHash || null,
    recoveryCount: recoveryRows.filter((entry) => (
      String(entry?.type || '').includes('Continuity') || String(entry?.type || '').includes('continuity')
    )).length,
    latestRecoveryIdHash: hashOrNull(recovery?.id),
    latestRecoveryStatus: compact(recovery?.status) || null
  };
}

function promptKeyStatus(promptInspection = null, promptContext = null) {
  const inspectedBlocks = asArray(promptInspection?.blocks);
  const contextBlocks = asArray(promptContext?.blocks);
  const sourceBlocks = inspectedBlocks.length ? inspectedBlocks : contextBlocks;
  const installedKeys = new Set(sourceBlocks.map((block) => compact(block.promptKey || block.key)).filter(Boolean));
  const missingStaticKeys = DIRECTIVE_STATIC_PROMPT_KEYS.filter((key) => !installedKeys.has(key));
  return {
    installedStaticKeyCount: DIRECTIVE_STATIC_PROMPT_KEYS.length - missingStaticKeys.length,
    expectedStaticKeyCount: DIRECTIVE_STATIC_PROMPT_KEYS.length,
    missingStaticKeyCount: missingStaticKeys.length,
    missingStaticKeyHashes: missingStaticKeys.map(hashContinuityText)
  };
}

function freshnessStatus({ promptContext = null, promptInspection = null, continuity = null } = {}) {
  const projection = promptContext?.continuityProjection || continuity?.lastProjection || null;
  if (!projection) return 'missing';
  const promptHash = promptContext?.hash || promptContext?.contentHash || null;
  const installedHash = promptInspection?.hash || null;
  if (promptInspection && installedHash && promptHash && installedHash !== promptHash) return 'stale';
  const missing = promptKeyStatus(promptInspection, promptContext).missingStaticKeyCount;
  if (missing > 0) return 'needs-rebuild';
  return 'fresh';
}

export function buildContinuityProjectionDiagnostics({
  campaignState = null,
  promptInspection = null
} = {}) {
  const continuity = normalizeContinuityState(campaignState?.continuity);
  const promptContext = campaignState?.runtimeTracking?.promptContext || campaignState?.campaignChatBinding?.promptContext || null;
  const projection = promptContext?.continuityProjection || continuity.lastProjection || null;
  const keyStatus = promptKeyStatus(promptInspection, promptContext);
  const status = freshnessStatus({ promptContext, promptInspection, continuity });
  const latestRun = continuity.lastProjection || null;
  return {
    kind: 'directive.continuityProjectionDiagnostics.v1',
    status,
    promptRevision: Number(promptContext?.revision || campaignState?.campaignChatBinding?.promptContextRevision || 0),
    promptHash: promptContext?.hash || campaignState?.campaignChatBinding?.promptContextHash || null,
    sourceHash: projection?.sourceHash || latestRun?.sourceHash || continuity.projectionCache?.sourceHash || null,
    policyHash: projection?.policyHash || latestRun?.policyHash || continuity.projectionCache?.policyHash || null,
    blockCount: Number(projection?.audit?.blockCount || latestRun?.blockCount || 0),
    factCount: Number(projection?.audit?.factCount || projection?.audit?.selectedFactCount || count(latestRun?.selectedFactIds)),
    selectedFactCount: Number(projection?.audit?.selectedFactCount || count(latestRun?.selectedFactIds)),
    conflictCount: Number(projection?.audit?.conflictCount || latestRun?.conflictCount || 0),
    omittedFactCount: Number(projection?.audit?.omittedFactCount || count(latestRun?.omitted)),
    validatorRejectionCount: Number(projection?.audit?.validatorRejectionCount || count(latestRun?.rejections)),
    candidateClaimCount: count(continuity.candidateClaims),
    rejectedClaimCount: count(continuity.rejectedClaims),
    activeHintCount: count(continuity.projectionHints),
    projectionRunCount: count(continuity.projectionRuns),
    staticKeys: keyStatus,
    latestReview: latestContinuityReview(campaignState || {}),
    latestCandidateClaim: sanitizedClaimRecord(latest(continuity.candidateClaims)),
    latestRejectedClaim: sanitizedClaimRecord(latest(continuity.rejectedClaims))
  };
}

export function buildContinuityTelemetry(input = {}) {
  const diagnostics = buildContinuityProjectionDiagnostics(input);
  return {
    kind: 'directive.continuityTelemetry.v1',
    status: diagnostics.status,
    promptRevision: diagnostics.promptRevision,
    promptHash: diagnostics.promptHash,
    sourceHash: diagnostics.sourceHash,
    policyHash: diagnostics.policyHash,
    blockCount: diagnostics.blockCount,
    selectedFactCount: diagnostics.selectedFactCount,
    conflictCount: diagnostics.conflictCount,
    candidateClaimCount: diagnostics.candidateClaimCount,
    rejectedClaimCount: diagnostics.rejectedClaimCount,
    activeHintCount: diagnostics.activeHintCount,
    latestReview: cloneJson(diagnostics.latestReview),
    latestRejectedClaim: cloneJson(diagnostics.latestRejectedClaim),
    staticKeys: cloneJson(diagnostics.staticKeys)
  };
}
