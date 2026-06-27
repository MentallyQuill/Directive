import { cloneJson, compact, hashContinuityText } from './fact-schema.mjs';
import { normalizeContinuityState, withContinuityState } from './state.mjs';

export function continuityProjectionPolicyHash({ staticPromptKeys = [], projectionHints = [], plannerMode = 'localOnly' } = {}) {
  return hashContinuityText({
    kind: 'directive.continuityProjectionPolicy.v1',
    staticPromptKeys,
    plannerMode,
    projectionHints: projectionHints.map((hint) => ({
      factId: hint.factId,
      force: hint.force,
      minimumLane: hint.minimumLane,
      expiresRevision: hint.expiresRevision
    }))
  });
}

export function readContinuityProjectionCache(campaignState, {
  sourceHash,
  policyHash
} = {}) {
  const continuity = normalizeContinuityState(campaignState?.continuity);
  const cache = continuity.projectionCache || {};
  if (!sourceHash || !policyHash) return null;
  if (cache.sourceHash !== sourceHash || cache.policyHash !== policyHash) return null;
  return cloneJson(cache.matrix || null);
}

export function writeContinuityProjectionCache(campaignState, matrix, {
  policyHash = null
} = {}) {
  return withContinuityState(campaignState, (continuity) => ({
    ...continuity,
    projectionCache: {
      sourceHash: compact(matrix?.sourceFrame?.sourceHash) || null,
      policyHash: policyHash || matrix?.policyHash || null,
      promptHash: compact(matrix?.hash || matrix?.contentHash) || null,
      blocks: (matrix?.blocks || []).map((block) => ({
        id: block.id,
        promptKey: block.promptKey || null,
        hash: block.hash || block.contentHash || null,
        sourceHash: block.sourceHash || null,
        sourceIds: cloneJson(block.sourceIds || [])
      })),
      omitted: cloneJson(matrix?.omitted || []),
      matrix: {
        kind: matrix?.kind || null,
        hash: matrix?.hash || null,
        sourceHash: matrix?.sourceFrame?.sourceHash || null,
        staticPromptKeys: cloneJson(matrix?.staticPromptKeys || []),
        audit: cloneJson(matrix?.audit || null),
        plan: matrix?.plan ? {
          kind: matrix.plan.kind,
          hash: matrix.plan.hash,
          selectedFactIds: cloneJson(matrix.plan.selectedFactIds || []),
          rejections: cloneJson(matrix.plan.rejections || [])
        } : null
      }
    }
  }));
}
