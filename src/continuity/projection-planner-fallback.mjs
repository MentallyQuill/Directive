import { buildDeterministicContinuityProjectionPlan } from './projection-plan-validator.mjs';

export function deterministicContinuityProjectionFallback({
  factIndex,
  projectionHints = [],
  sourceFrame = null,
  reason = 'deterministic-floor'
} = {}) {
  return buildDeterministicContinuityProjectionPlan({
    factIndex,
    projectionHints,
    sourceFrame,
    reason
  });
}
