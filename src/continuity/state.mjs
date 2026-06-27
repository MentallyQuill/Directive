import {
  CONTINUITY_SCHEMA_VERSION,
  cloneJson,
  compact,
  isObject
} from './fact-schema.mjs';

const LIMITS = Object.freeze({
  acceptedFacts: 240,
  candidateClaims: 120,
  rejectedClaims: 120,
  projectionRuns: 80,
  projectionHints: 120,
  factUseStats: 400,
  auditLog: 120
});

function boundedArray(value, limit) {
  const source = Array.isArray(value) ? value : [];
  return source.slice(Math.max(0, source.length - Math.max(1, limit))).map(cloneJson);
}

function normalizeRecordMap(value, limit) {
  const entries = isObject(value) ? Object.entries(value) : [];
  return Object.fromEntries(entries.slice(Math.max(0, entries.length - Math.max(1, limit))).map(([key, record]) => [
    compact(key),
    cloneJson(record)
  ]).filter(([key]) => key));
}

export function continuityStateDefaults() {
  return {
    schemaVersion: CONTINUITY_SCHEMA_VERSION,
    acceptedFacts: [],
    candidateClaims: [],
    rejectedClaims: [],
    projectionHints: [],
    projectionRuns: [],
    factUseStats: {},
    automationLocks: [],
    projectionCache: {
      sourceHash: null,
      promptHash: null,
      blocks: [],
      omitted: []
    },
    lastProjection: null,
    auditLog: []
  };
}

export function normalizeContinuityState(value = {}) {
  const input = isObject(value) ? value : {};
  return {
    ...continuityStateDefaults(),
    ...cloneJson(input),
    schemaVersion: CONTINUITY_SCHEMA_VERSION,
    acceptedFacts: boundedArray(input.acceptedFacts, LIMITS.acceptedFacts),
    candidateClaims: boundedArray(input.candidateClaims, LIMITS.candidateClaims),
    rejectedClaims: boundedArray(input.rejectedClaims, LIMITS.rejectedClaims),
    projectionHints: boundedArray(input.projectionHints, LIMITS.projectionHints),
    projectionRuns: boundedArray(input.projectionRuns, LIMITS.projectionRuns),
    factUseStats: normalizeRecordMap(input.factUseStats, LIMITS.factUseStats),
    automationLocks: boundedArray(input.automationLocks, LIMITS.projectionHints),
    projectionCache: {
      sourceHash: input.projectionCache?.sourceHash || null,
      policyHash: input.projectionCache?.policyHash || null,
      promptHash: input.projectionCache?.promptHash || null,
      blocks: boundedArray(input.projectionCache?.blocks, 24),
      omitted: boundedArray(input.projectionCache?.omitted, 120),
      matrix: input.projectionCache?.matrix ? cloneJson(input.projectionCache.matrix) : null
    },
    lastProjection: input.lastProjection ? cloneJson(input.lastProjection) : null,
    auditLog: boundedArray(input.auditLog, LIMITS.auditLog)
  };
}

export function withContinuityState(campaignState, mutator) {
  if (!isObject(campaignState)) throw new Error('campaignState must be an object');
  const next = cloneJson(campaignState);
  const continuity = normalizeContinuityState(next.continuity);
  next.continuity = typeof mutator === 'function' ? normalizeContinuityState(mutator(continuity) || continuity) : continuity;
  return next;
}

export function recordContinuityProjectionRun(campaignState, run) {
  return withContinuityState(campaignState, (continuity) => ({
    ...continuity,
    lastProjection: cloneJson(run),
    projectionRuns: [
      ...continuity.projectionRuns,
      cloneJson(run)
    ]
  }));
}
