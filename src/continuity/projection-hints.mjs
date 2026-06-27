import {
  asArray,
  cloneJson,
  compact,
  hashContinuityText,
  isObject
} from './fact-schema.mjs';
import { normalizeContinuityState, withContinuityState } from './state.mjs';

const DEFAULT_HINT_TTL_REVISIONS = 4;

function revisionOf(campaignState) {
  return Number(campaignState?.runtimeTracking?.revision ?? campaignState?.turnLedger?.entries?.length ?? 0) || 0;
}

function nowValue(now) {
  return typeof now === 'function' ? now() : (now || new Date().toISOString());
}

function normalizeHint(hint, { currentRevision = 0 } = {}) {
  if (!isObject(hint)) return null;
  const factId = compact(hint.factId);
  if (!factId) return null;
  const mode = compact(hint.mode || hint.force || 'boost').toLowerCase();
  const expiresRevision = Number.isFinite(Number(hint.expiresRevision))
    ? Number(hint.expiresRevision)
    : currentRevision + DEFAULT_HINT_TTL_REVISIONS;
  return {
    id: compact(hint.id) || `hint.${hashContinuityText({ factId, mode, at: hint.createdAt || currentRevision })}`,
    factId,
    mode,
    force: compact(hint.force || (mode === 'guard' ? 'guard' : 'boost')) || null,
    minimumLane: compact(hint.minimumLane || 'directive.continuity.invariants') || null,
    reason: compact(hint.reason || 'Projection hint.') || 'Projection hint.',
    owner: compact(hint.owner || 'system') || 'system',
    source: cloneJson(hint.source || null),
    createdRevision: Number.isFinite(Number(hint.createdRevision)) ? Number(hint.createdRevision) : currentRevision,
    expiresRevision,
    cooldownUntilRevision: Number.isFinite(Number(hint.cooldownUntilRevision)) ? Number(hint.cooldownUntilRevision) : null,
    createdAt: hint.createdAt || null,
    lastUsedAt: hint.lastUsedAt || null
  };
}

export function activeContinuityProjectionHints(campaignState, { revision = null } = {}) {
  const currentRevision = Number.isFinite(Number(revision)) ? Number(revision) : revisionOf(campaignState);
  const continuity = normalizeContinuityState(campaignState?.continuity);
  return asArray(continuity.projectionHints)
    .map((hint) => normalizeHint(hint, { currentRevision }))
    .filter((hint) => hint && (
      hint.expiresRevision === null
      || Number(hint.expiresRevision) >= currentRevision
    ))
    .filter((hint) => (
      hint.cooldownUntilRevision === null
      || Number(hint.cooldownUntilRevision) <= currentRevision
    ));
}

export function recordContinuityFactUseStats(campaignState, {
  selectedFactIds = [],
  guardedFactIds = [],
  violationFactIds = [],
  laneByFactId = {},
  now = null
} = {}) {
  const selected = new Set(asArray(selectedFactIds).map(compact).filter(Boolean));
  const guarded = new Set(asArray(guardedFactIds).map(compact).filter(Boolean));
  const violations = new Set(asArray(violationFactIds).map(compact).filter(Boolean));
  const revision = revisionOf(campaignState);
  const at = nowValue(now);
  return withContinuityState(campaignState, (continuity) => {
    const stats = cloneJson(continuity.factUseStats || {});
    for (const factId of new Set([...selected, ...guarded, ...violations])) {
      const prior = stats[factId] || {};
      stats[factId] = {
        factId,
        selectedCount: Number(prior.selectedCount || 0) + (selected.has(factId) ? 1 : 0),
        guardedCount: Number(prior.guardedCount || 0) + (guarded.has(factId) ? 1 : 0),
        violationCount: Number(prior.violationCount || 0) + (violations.has(factId) ? 1 : 0),
        lastSelectedRevision: selected.has(factId) ? revision : (prior.lastSelectedRevision ?? null),
        lastGuardedRevision: guarded.has(factId) ? revision : (prior.lastGuardedRevision ?? null),
        lastViolationRevision: violations.has(factId) ? revision : (prior.lastViolationRevision ?? null),
        lastLane: laneByFactId[factId] || prior.lastLane || null,
        updatedAt: at
      };
    }
    return { ...continuity, factUseStats: stats };
  });
}

export function addContinuityProjectionHints(campaignState, hints = [], { now = null } = {}) {
  const currentRevision = revisionOf(campaignState);
  const createdAt = nowValue(now);
  return withContinuityState(campaignState, (continuity) => {
    const existing = new Map(asArray(continuity.projectionHints).map((hint) => [hint.id, hint]));
    for (const rawHint of asArray(hints)) {
      const hint = normalizeHint({ ...rawHint, createdAt: rawHint.createdAt || createdAt }, { currentRevision });
      if (!hint) continue;
      existing.set(hint.id, hint);
    }
    return {
      ...continuity,
      projectionHints: [...existing.values()]
    };
  });
}

export function continuityHintsFromContradictionReview(review, { now = null, campaignState = null } = {}) {
  const currentRevision = revisionOf(campaignState);
  const createdAt = nowValue(now);
  return asArray(review?.findings)
    .map((finding) => {
      const factId = compact(finding?.factId);
      if (!factId) return null;
      return {
        id: `hint.violation.${hashContinuityText({ factId, kind: finding.kind, revision: currentRevision })}`,
        factId,
        mode: 'guard',
        force: 'guard',
        minimumLane: 'directive.continuity.invariants',
        reason: compact(finding.summary || finding.kind) || 'Recent continuity contradiction.',
        owner: 'automation',
        source: {
          kind: 'continuityContradictionReview',
          findingKind: finding.kind || null
        },
        createdRevision: currentRevision,
        expiresRevision: currentRevision + DEFAULT_HINT_TTL_REVISIONS,
        createdAt
      };
    })
    .filter(Boolean);
}
