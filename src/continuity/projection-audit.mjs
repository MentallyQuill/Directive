import { asArray, cloneJson, compact, hashContinuityText } from './fact-schema.mjs';
import { normalizeContinuityState } from './state.mjs';

function nowValue(now) {
  return typeof now === 'function' ? now() : (now || new Date().toISOString());
}

export function createContinuityProjectionRun(matrix, {
  status = 'active',
  installedAt = null,
  now = null
} = {}) {
  const at = installedAt || nowValue(now);
  const blockSummaries = asArray(matrix?.blocks).map((block) => ({
    id: block.id,
    promptKey: block.promptKey || null,
    hash: block.hash || block.contentHash || null,
    sourceHash: block.sourceHash || null,
    sourceIds: cloneJson(block.sourceIds || [])
  }));
  return {
    id: `projection.${hashContinuityText({ hash: matrix?.hash, at })}`,
    kind: matrix?.kind || 'directive.continuityProjectionMatrix.v1',
    status,
    sourceHash: matrix?.sourceFrame?.sourceHash || null,
    hash: matrix?.hash || matrix?.contentHash || null,
    policyHash: matrix?.policyHash || null,
    planHash: matrix?.plan?.hash || null,
    selectedFactIds: cloneJson(matrix?.plan?.selectedFactIds || []),
    rejectedFactCount: Number(matrix?.factIndex?.rejected?.length || matrix?.factIndex?.rejectedCount || 0),
    conflictCount: Number(matrix?.factIndex?.conflicts?.length || matrix?.factIndex?.conflictCount || 0),
    blockCount: blockSummaries.length,
    blocks: blockSummaries,
    omitted: cloneJson(matrix?.omitted || []),
    rejections: cloneJson(matrix?.plan?.rejections || []),
    installedAt: at
  };
}

export function summarizeContinuityProjectionForInspector(campaignState) {
  const continuity = normalizeContinuityState(campaignState?.continuity);
  const last = continuity.lastProjection || null;
  return {
    kind: 'directive.continuityProjectionInspectorSummary.v1',
    hasProjection: Boolean(last),
    status: compact(last?.status) || null,
    sourceHash: last?.sourceHash || null,
    promptHash: last?.hash || continuity.projectionCache?.promptHash || null,
    policyHash: last?.policyHash || continuity.projectionCache?.policyHash || null,
    blockCount: Number(last?.blockCount || 0),
    selectedFactCount: asArray(last?.selectedFactIds).length,
    omittedCount: asArray(last?.omitted).length,
    validatorRejectionCount: asArray(last?.rejections).length,
    conflictCount: Number(last?.conflictCount || 0),
    rejectedClaimCount: asArray(continuity.rejectedClaims).length,
    candidateClaimCount: asArray(continuity.candidateClaims).length,
    activeHintCount: asArray(continuity.projectionHints).length,
    blocks: asArray(last?.blocks).map((block) => ({
      id: block.id,
      promptKey: block.promptKey || null,
      hash: block.hash || null,
      sourceCount: asArray(block.sourceIds).length
    }))
  };
}
