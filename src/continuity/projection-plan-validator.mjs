import {
  CONTINUITY_DISCLOSURE_STATE,
  CONTINUITY_VISIBILITY,
  asArray,
  cloneJson,
  compact,
  factKnowledgeScope,
  hashContinuityText,
  isFactAllowedForSourceFrame,
  isFactVisibleToAudience
} from './fact-schema.mjs';
import { CONTINUITY_PROMPT_LANES } from './prompt-keys.mjs';

export const CONTINUITY_PLAN_KIND = 'directive.continuityProjectionPlan.v1';
export const VALIDATED_CONTINUITY_PLAN_KIND = 'directive.validatedContinuityProjectionPlan.v1';

const LANE_BY_KEY = new Map(CONTINUITY_PROMPT_LANES.map((lane, index) => [lane.promptKey, { ...lane, rank: index }]));
const RENDERABLE_FACT_LANES = Object.freeze([
  'directive.continuity.invariants',
  'directive.continuity.domain',
  'directive.recap.committed',
  'directive.context.revolving'
]);
const RENDERABLE_FACT_LANE_SET = new Set(RENDERABLE_FACT_LANES);
const DEFAULT_FACT_LIMITS = Object.freeze({
  'directive.continuity.invariants': 32,
  'directive.continuity.domain': 24,
  'directive.recap.committed': 18,
  'directive.context.revolving': 18
});
const OPERATION_FIELDS = new Set([
  'factId',
  'action',
  'lane',
  'force',
  'ttl',
  'reason',
  'confidence',
  'compressionGroupId'
]);
const COMPRESSION_GROUP_FIELDS = new Set([
  'id',
  'factIds',
  'lane',
  'reason',
  'goal'
]);
const PLAN_LANE_ALIASES = new Map([
  ['l1', 'directive.continuity.invariants'],
  ['invariants', 'directive.continuity.invariants'],
  ['invariant', 'directive.continuity.invariants'],
  ['l2', 'directive.continuity.domain'],
  ['l3', 'directive.continuity.domain'],
  ['domain', 'directive.continuity.domain'],
  ['l4', 'directive.recap.committed'],
  ['recap', 'directive.recap.committed'],
  ['committedrecap', 'directive.recap.committed'],
  ['committed-recap', 'directive.recap.committed'],
  ['l5', 'directive.context.revolving'],
  ['revolving', 'directive.context.revolving'],
  ['context', 'directive.context.revolving'],
  ['l6', 'auditOnly'],
  ['guardonly', 'guardOnly'],
  ['guard-only', 'guardOnly'],
  ['auditonly', 'auditOnly'],
  ['audit-only', 'auditOnly']
]);
const ACTION_ALIASES = new Map([
  ['select', 'select'],
  ['include', 'select'],
  ['render', 'select'],
  ['guard', 'guardOnly'],
  ['guardonly', 'guardOnly'],
  ['guard-only', 'guardOnly'],
  ['audit', 'auditOnly'],
  ['auditonly', 'auditOnly'],
  ['audit-only', 'auditOnly']
]);
const FORCE_ALIASES = new Map([
  ['must', 'must'],
  ['required', 'must'],
  ['hard', 'must'],
  ['hardinvariant', 'must'],
  ['hard-invariant', 'must'],
  ['guard', 'guard'],
  ['contradictionguard', 'guard'],
  ['contradiction-guard', 'guard'],
  ['boost', 'boost'],
  ['scenecritical', 'boost'],
  ['scene-critical', 'boost'],
  ['support', 'support'],
  ['background', 'background']
]);
const TTL_ALIASES = new Map([
  ['turn', 'turn'],
  ['currentturn', 'turn'],
  ['current-turn', 'turn'],
  ['scene', 'scene'],
  ['chapter', 'chapter'],
  ['session', 'session'],
  ['revolving', 'revolving'],
  ['campaign', 'campaign']
]);
const REQUIRED_FORCES = new Set(['must', 'guard', 'boost']);

function normalizedKey(value) {
  return compact(value).toLowerCase().replace(/[\s_]+/g, '-');
}

function compactKey(value) {
  return normalizedKey(value).replace(/-/g, '');
}

export function normalizePlanForce(value) {
  const raw = compact(value);
  if (!raw) return { ok: true, value: null };
  const alias = FORCE_ALIASES.get(normalizedKey(raw)) || FORCE_ALIASES.get(compactKey(raw));
  if (!alias) return { ok: false, value: null, reason: 'invalid-force', force: raw };
  return { ok: true, value: alias };
}

export function normalizePlanTtl(value) {
  const raw = compact(value);
  if (!raw) return { ok: true, value: null };
  const alias = TTL_ALIASES.get(normalizedKey(raw)) || TTL_ALIASES.get(compactKey(raw));
  if (!alias) return { ok: false, value: null, reason: 'invalid-ttl', ttl: raw };
  return { ok: true, value: alias };
}

export function normalizePlanLane(value) {
  const raw = compact(value);
  if (!raw) return { ok: false, lane: null, action: null, reason: 'missing-lane', raw };
  if (RENDERABLE_FACT_LANE_SET.has(raw)) {
    return { ok: true, lane: raw, action: null, nonRendering: false, raw };
  }
  const lower = normalizedKey(raw);
  const alias = PLAN_LANE_ALIASES.get(lower) || PLAN_LANE_ALIASES.get(compactKey(raw));
  if (alias === 'guardOnly' || alias === 'auditOnly') {
    return { ok: true, lane: null, action: alias, nonRendering: true, raw };
  }
  if (alias && RENDERABLE_FACT_LANE_SET.has(alias)) {
    return { ok: true, lane: alias, action: null, nonRendering: false, raw };
  }
  if (raw === 'directive.contract' || raw === 'directive.scene.active' || lower === 'l0') {
    return { ok: false, lane: null, action: null, reason: 'static-lane-not-selectable', raw };
  }
  return { ok: false, lane: null, action: null, reason: 'invalid-lane', raw };
}

function normalizePlanAction(value, laneAction = null) {
  const raw = compact(value);
  if (!raw) return { ok: true, action: laneAction || 'select' };
  const alias = ACTION_ALIASES.get(normalizedKey(raw)) || ACTION_ALIASES.get(compactKey(raw));
  if (!alias) return { ok: false, action: null, reason: 'invalid-action', actionValue: raw };
  if (laneAction && alias === 'select') return { ok: true, action: laneAction };
  return { ok: true, action: alias };
}

function validatePlanOperationFields(operation = {}) {
  const rejections = [];
  for (const field of Object.keys(operation || {})) {
    if (OPERATION_FIELDS.has(field)) continue;
    rejections.push({
      factId: compact(operation?.factId) || null,
      reason: 'invalid-operation-field',
      field
    });
  }
  return rejections;
}

function validatePlanObjectFields(value = {}, allowedFields = new Set(), reason = 'invalid-plan-field') {
  const rejections = [];
  for (const field of Object.keys(value || {})) {
    if (allowedFields.has(field)) continue;
    rejections.push({ reason, field });
  }
  return rejections;
}

function tagSet(fact) {
  return new Set(asArray(fact?.tags).map((tag) => compact(tag).toLowerCase()).filter(Boolean));
}

function factDisclosureState(fact) {
  return factKnowledgeScope(fact).disclosureState;
}

function isPerspectiveOrProvisionalFact(fact) {
  const state = factDisclosureState(fact);
  return state === CONTINUITY_DISCLOSURE_STATE.falseBelief
    || state === CONTINUITY_DISCLOSURE_STATE.inferred;
}

function isHardFact(fact) {
  if (isPerspectiveOrProvisionalFact(fact)) return false;
  const criticality = compact(fact?.criticality).toLowerCase();
  const tags = tagSet(fact);
  return criticality === 'hard'
    || criticality === 'critical'
    || tags.has('contradiction-guard')
    || tags.has('invariant');
}

export function defaultContinuityLaneForFact(fact) {
  const tags = tagSet(fact);
  if (tags.has('commandlog') || tags.has('recap') || compact(fact?.kind).toLowerCase() === 'commandlog.committed') {
    return 'directive.recap.committed';
  }
  if (isHardFact(fact)) return 'directive.continuity.invariants';
  if (
    tags.has('crew')
    || tags.has('ship')
    || tags.has('mission')
    || tags.has('travel')
    || tags.has('pressure')
    || tags.has('thread')
    || tags.has('command')
  ) {
    return 'directive.continuity.domain';
  }
  return 'directive.context.revolving';
}

function normalizedHintMap(hints = []) {
  const map = new Map();
  for (const hint of asArray(hints)) {
    const factId = compact(hint?.factId);
    if (!factId) continue;
    const existing = map.get(factId) || {};
    const force = normalizePlanForce(hint?.force || existing.force);
    const minimumLane = RENDERABLE_FACT_LANE_SET.has(hint?.minimumLane)
      ? hint.minimumLane
      : existing.minimumLane;
    map.set(factId, {
      ...existing,
      ...cloneJson(hint),
      factId,
      minimumLane,
      force: force.ok ? force.value : null
    });
  }
  return map;
}

function laneAtLeastAsProminent(candidateLane, minimumLane) {
  const candidate = LANE_BY_KEY.get(candidateLane);
  const minimum = LANE_BY_KEY.get(minimumLane);
  if (!candidate || !minimum) return false;
  return candidate.rank <= minimum.rank;
}

function applyMinimumLane(lane, minimumLane) {
  if (!minimumLane) return lane;
  return laneAtLeastAsProminent(lane, minimumLane) ? lane : minimumLane;
}

function capLaneForFactDisclosure(fact, lane) {
  if (!isPerspectiveOrProvisionalFact(fact)) return { lane, lowered: false };
  if (lane === 'directive.continuity.invariants') {
    return { lane: 'directive.continuity.domain', lowered: true };
  }
  return { lane, lowered: false };
}

function operationKey(operation) {
  return `${operation.factId}:${operation.lane || operation.action || 'select'}`;
}

function relevantActorSet(sourceFrame = null) {
  return new Set(asArray(sourceFrame?.relevantActorIds)
    .map((id) => compact(id).toLowerCase())
    .filter(Boolean));
}

function factMatchesActor(fact, actorId) {
  const id = compact(actorId).toLowerCase();
  if (!id) return false;
  const subject = compact(fact?.subject).toLowerCase();
  if (subject === `crew.${id}` || subject === id) return true;
  if (compact(fact?.id).toLowerCase().includes(id)) return true;
  return asArray(fact?.tags).some((tag) => compact(tag).toLowerCase() === id);
}

const GENERIC_TURN_RELEVANCE_TERMS = new Set([
  'area',
  'class',
  'deck',
  'director',
  'fact',
  'hard',
  'high',
  'intrepid',
  'layout',
  'location',
  'medium',
  'narrator',
  'ship',
  'system',
  'the',
  'uss',
  'voyager'
]);

function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function textReferencesTerm(text = '', term = '') {
  const value = compact(term);
  if (!value || value.length < 3) return false;
  const normalized = String(text || '').toLowerCase();
  const pattern = value
    .toLowerCase()
    .split(/\s+/)
    .map(escapeRegex)
    .join('[\\s-]+');
  return new RegExp(`(^|[^a-z0-9])${pattern}([^a-z0-9]|$)`, 'i').test(normalized);
}

function sourceFrameText(sourceFrame = null) {
  const recentMessages = asArray(sourceFrame?.recentMessages)
    .map((message) => compact(message?.text))
    .filter(Boolean);
  return [
    sourceFrame?.playerText,
    sourceFrame?.recentMessageSummary,
    ...recentMessages,
    sourceFrame?.acceptedAssistantVariant?.text,
    sourceFrame?.locationId,
    sourceFrame?.activePhaseId,
    sourceFrame?.scene?.location,
    sourceFrame?.scene?.locationId,
    sourceFrame?.scene?.currentQuestion,
    sourceFrame?.scene?.immediateStakes,
    ...asArray(sourceFrame?.scene?.relevantLocationIds),
    ...asArray(sourceFrame?.scene?.relevantSystemIds)
  ].map(compact).filter(Boolean).join('\n');
}

function usableRelevanceTerm(value = '') {
  const term = compact(value);
  if (term.length < 3) return '';
  const normalized = term.toLowerCase();
  if (GENERIC_TURN_RELEVANCE_TERMS.has(normalized)) return '';
  if (/^ship[.:_-]?/i.test(term) && term.length < 10) return '';
  return term;
}

function factRelevanceTerms(fact = {}) {
  const semanticKeywords = asArray(fact?.semantics?.keywords);
  const decks = asArray(fact?.semantics?.decks).map((deck) => `Deck ${deck}`);
  const valueTerms = [
    fact?.value?.areaId,
    fact?.value?.systemId,
    fact?.value?.name,
    fact?.value?.zone,
    fact?.value?.exteriorPlacement,
    ...asArray(fact?.value?.functions),
    ...asArray(fact?.value?.sceneUses),
    ...asArray(fact?.value?.hardFacts),
    ...asArray(fact?.value?.keywords)
  ];
  return [...new Set([
    fact?.id,
    fact?.subject,
    fact?.predicate,
    fact?.kind,
    fact?.semantics?.areaId,
    fact?.semantics?.systemId,
    ...decks,
    ...asArray(fact?.tags),
    ...semanticKeywords,
    ...valueTerms
  ].map(usableRelevanceTerm).filter(Boolean))];
}

function factMatchesTurnText(fact, sourceFrame = null) {
  const haystack = sourceFrameText(sourceFrame);
  if (!haystack) return false;
  return factRelevanceTerms(fact).some((term) => textReferencesTerm(haystack, term));
}

function factMatchesLocation(fact, sourceFrame = null) {
  const locationIds = new Set([
    sourceFrame?.locationId,
    sourceFrame?.scene?.locationId,
    ...asArray(sourceFrame?.scene?.relevantLocationIds)
  ].map((value) => compact(value).toLowerCase()).filter(Boolean));
  if (!locationIds.size) return false;
  const factTerms = factRelevanceTerms(fact).map((term) => compact(term).toLowerCase());
  return factTerms.some((term) => locationIds.has(term));
}

function turnRelevanceScore(fact, sourceFrame = null) {
  const actors = relevantActorSet(sourceFrame);
  for (const actorId of actors) {
    if (factMatchesActor(fact, actorId)) return 100;
  }
  if (factMatchesLocation(fact, sourceFrame)) return 90;
  if (factMatchesTurnText(fact, sourceFrame)) return 80;
  return 0;
}

function isTurnRelevantFact(fact, sourceFrame = null) {
  return turnRelevanceScore(fact, sourceFrame) > 0;
}

function sortFactsForDeterministicProjection(facts = [], sourceFrame = null) {
  return [...asArray(facts)].sort((left, right) => {
    const relevance = turnRelevanceScore(right, sourceFrame) - turnRelevanceScore(left, sourceFrame);
    if (relevance !== 0) return relevance;
    return 0;
  });
}

export function buildDeterministicContinuityProjectionPlan({
  factIndex,
  projectionHints = [],
  sourceFrame = null,
  reason = 'deterministic-floor'
} = {}) {
  const hints = normalizedHintMap(projectionHints);
  const operations = [];
  const omitted = [];
  const counts = new Map();
  for (const fact of sortFactsForDeterministicProjection(factIndex?.facts, sourceFrame)) {
    const hint = hints.get(fact.id);
    if (!isFactAllowedForSourceFrame(fact, sourceFrame)) {
      omitted.push({ factId: fact.id, reason: 'witness-scope' });
      continue;
    }
    const turnRelevant = isTurnRelevantFact(fact, sourceFrame);
    const defaultLane = defaultContinuityLaneForFact(fact);
    const lane = applyMinimumLane(defaultLane, hint?.minimumLane || (turnRelevant ? 'directive.continuity.domain' : null));
    const limit = DEFAULT_FACT_LIMITS[lane] || 0;
    const count = counts.get(lane) || 0;
    const forced = isHardFact(fact) || turnRelevant || REQUIRED_FORCES.has(compact(hint?.force).toLowerCase());
    if (limit && count >= limit && !forced) {
      omitted.push({ factId: fact.id, reason: `budget:${lane}` });
      continue;
    }
    operations.push({
      factId: fact.id,
      lane,
      reason: turnRelevant && !isHardFact(fact)
        ? `${reason}:turn-relevance`
        : (forced ? `${reason}:floor` : reason)
    });
    counts.set(lane, count + 1);
  }
  return {
    kind: CONTINUITY_PLAN_KIND,
    operations,
    omitted
  };
}

function plannerCandidateSets({ factIndex, candidateFactIds = null, hardFloorFactIds = null } = {}) {
  const facts = asArray(factIndex?.facts);
  const candidateIdsWereProvided = Array.isArray(candidateFactIds);
  const hardFloorIdsWereProvided = Array.isArray(hardFloorFactIds);
  const candidates = new Set((candidateIdsWereProvided ? candidateFactIds : facts.map((fact) => fact.id)).map(compact).filter(Boolean));
  const hardFloors = new Set((hardFloorIdsWereProvided
    ? hardFloorFactIds
    : facts.filter(isHardFact).map((fact) => fact.id)
  ).map(compact).filter(Boolean));
  return {
    candidateIdsWereProvided,
    hardFloorIdsWereProvided,
    candidates,
    hardFloors
  };
}

export function isPlanFactSelectable(fact, {
  audience = CONTINUITY_VISIBILITY.narratorSafe,
  candidates = new Set(),
  hardFloors = new Set(),
  sourceFrame = null
} = {}) {
  if (!fact) return { ok: false, reason: 'unknown-fact-id' };
  if (!isFactVisibleToAudience(fact, audience)) {
    return { ok: false, reason: 'audience-blocked-fact' };
  }
  if (!isFactAllowedForSourceFrame(fact, sourceFrame)) {
    return { ok: false, reason: 'witness-scope-blocked-fact' };
  }
  if (!candidates.has(fact.id) && !hardFloors.has(fact.id)) {
    return { ok: false, reason: 'fact-not-in-planner-candidates' };
  }
  return { ok: true };
}

function isRequiredFactForPlan(fact, {
  hint = null,
  sourceFrame = null,
  hardFloors = new Set(),
  force = null
} = {}) {
  return hardFloors.has(fact?.id)
    || isHardFact(fact)
    || isTurnRelevantFact(fact, sourceFrame)
    || REQUIRED_FORCES.has(compact(force || hint?.force).toLowerCase());
}

function operationConfidence(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : null;
}

function validateGuardFocus(rawGuardFocus = [], {
  factById,
  audience,
  candidates,
  hardFloors,
  sourceFrame = null
} = {}) {
  const guardFocus = [];
  const rejections = [];
  for (const rawFactId of asArray(rawGuardFocus)) {
    const factId = compact(rawFactId);
    const fact = factById.get(factId);
    const selectable = isPlanFactSelectable(fact, { audience, candidates, hardFloors, sourceFrame });
    if (!selectable.ok) {
      rejections.push({ factId: factId || null, reason: `guard-focus-${selectable.reason}` });
      continue;
    }
    if (!guardFocus.includes(factId)) guardFocus.push(factId);
  }
  return { guardFocus, rejections };
}

function validateCompressionGroups(rawGroups = [], {
  factById,
  audience,
  candidates,
  hardFloors,
  sourceFrame = null
} = {}) {
  const compressionGroups = [];
  const rejections = [];
  for (const group of asArray(rawGroups)) {
    const fieldErrors = validatePlanObjectFields(group, COMPRESSION_GROUP_FIELDS, 'invalid-compression-group-field');
    if (fieldErrors.length) {
      rejections.push(...fieldErrors.map((error) => ({
        ...error,
        groupId: compact(group?.id) || null
      })));
      continue;
    }
    const lane = normalizePlanLane(group?.lane || 'directive.continuity.domain');
    if (!lane.ok || !['directive.continuity.domain', 'directive.recap.committed', 'directive.context.revolving'].includes(lane.lane)) {
      rejections.push({
        groupId: compact(group?.id) || null,
        reason: 'invalid-compression-lane',
        lane: compact(group?.lane) || null
      });
      continue;
    }
    const factIds = [];
    let rejected = false;
    for (const rawFactId of asArray(group?.factIds)) {
      const factId = compact(rawFactId);
      const fact = factById.get(factId);
      const selectable = isPlanFactSelectable(fact, { audience, candidates, hardFloors, sourceFrame });
      if (!selectable.ok) {
        rejections.push({
          groupId: compact(group?.id) || null,
          factId: factId || null,
          reason: `compression-${selectable.reason}`
        });
        rejected = true;
        continue;
      }
      if (hardFloors.has(factId) || isHardFact(fact)) {
        rejections.push({
          groupId: compact(group?.id) || null,
          factId,
          reason: 'compression-hard-floor-not-allowed'
        });
        rejected = true;
        continue;
      }
      if (!factIds.includes(factId)) factIds.push(factId);
    }
    if (rejected || factIds.length < 2) {
      if (!rejected) {
        rejections.push({
          groupId: compact(group?.id) || null,
          reason: 'compression-group-too-small'
        });
      }
      continue;
    }
    compressionGroups.push({
      id: compact(group?.id) || `compression.${hashContinuityText({ factIds, lane: lane.lane })}`,
      factIds,
      lane: lane.lane,
      reason: compact(group?.reason) || 'planner-compression-group',
      goal: compact(group?.goal) || null
    });
  }
  return { compressionGroups, rejections };
}

export function validateContinuityProjectionPlan(plan, {
  factIndex,
  projectionHints = [],
  sourceFrame = null,
  audience = CONTINUITY_VISIBILITY.narratorSafe,
  candidateFactIds = null,
  hardFloorFactIds = null,
  fallbackReason = null
} = {}) {
  const facts = asArray(factIndex?.facts);
  const factById = new Map(facts.map((fact) => [fact.id, fact]));
  const hints = normalizedHintMap(projectionHints);
  const candidateSets = plannerCandidateSets({ factIndex, candidateFactIds, hardFloorFactIds });
  const { candidates, hardFloors } = candidateSets;
  const proposed = plan?.kind === CONTINUITY_PLAN_KIND && Array.isArray(plan.operations)
    ? plan
    : buildDeterministicContinuityProjectionPlan({ factIndex, projectionHints, sourceFrame, reason: fallbackReason || 'invalid-plan-fallback' });
  const rejections = [];
  const operations = [];
  const selected = new Set();
  const guardFactIds = new Set();
  const auditFactIds = new Set();
  const seenOperation = new Set();
  const laneCounts = new Map();

  for (const rawOperation of asArray(proposed.operations)) {
    const fieldErrors = validatePlanOperationFields(rawOperation);
    if (fieldErrors.length) {
      rejections.push(...fieldErrors);
      continue;
    }
    const factId = compact(rawOperation?.factId);
    const fact = factById.get(factId);
    const selectable = isPlanFactSelectable(fact, { audience, candidates, hardFloors, sourceFrame });
    if (!selectable.ok) {
      rejections.push({ factId: factId || null, reason: selectable.reason });
      continue;
    }
    const laneChoice = normalizePlanLane(rawOperation?.lane || defaultContinuityLaneForFact(fact));
    if (!laneChoice.ok) {
      rejections.push({ factId, reason: laneChoice.reason, lane: laneChoice.raw || null });
      continue;
    }
    const actionChoice = normalizePlanAction(rawOperation?.action, laneChoice.action);
    if (!actionChoice.ok) {
      rejections.push({ factId, reason: actionChoice.reason, action: actionChoice.actionValue || null });
      continue;
    }
    const forceChoice = normalizePlanForce(rawOperation?.force);
    if (!forceChoice.ok) {
      rejections.push({ factId, reason: forceChoice.reason, force: forceChoice.force || null });
      continue;
    }
    const ttlChoice = normalizePlanTtl(rawOperation?.ttl);
    if (!ttlChoice.ok) {
      rejections.push({ factId, reason: ttlChoice.reason, ttl: ttlChoice.ttl || null });
      continue;
    }
    const defaultLane = defaultContinuityLaneForFact(fact);
    const hint = hints.get(factId);
    const turnRelevant = isTurnRelevantFact(fact, sourceFrame);
    const requiredByFloor = isRequiredFactForPlan(fact, {
      hint,
      sourceFrame,
      hardFloors,
      force: forceChoice.value
    });
    const action = actionChoice.action;
    if (action === 'guardOnly' || action === 'auditOnly') {
      if (action === 'guardOnly' && isPerspectiveOrProvisionalFact(fact)) {
        rejections.push({ factId, reason: 'perspective-fact-not-guardable' });
        continue;
      }
      const key = operationKey({ factId, action });
      if (seenOperation.has(key)) continue;
      seenOperation.add(key);
      if (action === 'guardOnly') guardFactIds.add(factId);
      if (action === 'auditOnly') auditFactIds.add(factId);
      operations.push({
        factId,
        lane: null,
        action,
        reason: compact(rawOperation?.reason) || action,
        force: forceChoice.value || (action === 'guardOnly' ? 'guard' : null),
        ttl: ttlChoice.value,
        confidence: operationConfidence(rawOperation?.confidence),
        compressionGroupId: compact(rawOperation?.compressionGroupId) || null
      });
      continue;
    }
    const rawLane = laneChoice.lane || defaultLane;
    const minimumLane = (hardFloors.has(factId) || isHardFact(fact))
      ? 'directive.continuity.invariants'
      : (hint?.minimumLane || (turnRelevant ? 'directive.continuity.domain' : null));
    const uncappedLane = applyMinimumLane(rawLane || defaultLane, minimumLane);
    const cappedLane = capLaneForFactDisclosure(fact, uncappedLane);
    const lane = cappedLane.lane;
    const key = operationKey({ factId, lane });
    if (seenOperation.has(key)) continue;
    const laneLimit = DEFAULT_FACT_LIMITS[lane] || 0;
    const laneCount = laneCounts.get(lane) || 0;
    if (laneLimit && laneCount >= laneLimit && !requiredByFloor) {
      rejections.push({ factId, reason: `budget:${lane}`, lane });
      continue;
    }
    seenOperation.add(key);
    selected.add(factId);
    laneCounts.set(lane, laneCount + 1);
    operations.push({
      factId,
      lane,
      action: 'select',
      reason: compact(rawOperation?.reason) || 'selected',
      force: (hardFloors.has(factId) || isHardFact(fact)) ? 'must' : (forceChoice.value || compact(hint?.force) || (turnRelevant ? 'boost' : null)),
      ttl: ttlChoice.value,
      confidence: operationConfidence(rawOperation?.confidence),
      compressionGroupId: compact(rawOperation?.compressionGroupId) || null
    });
    if (cappedLane.lowered) {
      rejections.push({ factId, reason: 'lane-lowered-for-disclosure-state', requestedLane: rawLane, lane });
    } else if (lane !== rawLane) {
      rejections.push({ factId, reason: 'lane-raised-to-minimum', requestedLane: rawLane, lane });
    }
  }

  for (const fact of sortFactsForDeterministicProjection(facts, sourceFrame)) {
    const hint = hints.get(fact.id);
    const turnRelevant = isTurnRelevantFact(fact, sourceFrame);
    const selectable = isPlanFactSelectable(fact, { audience, candidates, hardFloors, sourceFrame });
    const required = isRequiredFactForPlan(fact, {
      hint,
      sourceFrame,
      hardFloors
    });
    if (required && !selectable.ok) {
      rejections.push({ factId: fact.id, reason: `required-${selectable.reason}` });
    }
    if (!required || selected.has(fact.id)) continue;
    if (!selectable.ok) continue;
    const uncappedLane = applyMinimumLane(
      defaultContinuityLaneForFact(fact),
      (hardFloors.has(fact.id) || isHardFact(fact)) ? 'directive.continuity.invariants' : (hint?.minimumLane || (turnRelevant ? 'directive.continuity.domain' : null))
    );
    const cappedLane = capLaneForFactDisclosure(fact, uncappedLane);
    const lane = cappedLane.lane;
    operations.push({
      factId: fact.id,
      lane,
      action: 'select',
      reason: turnRelevant && !isHardFact(fact) ? 'validator-added-turn-relevance' : 'validator-added-hard-floor',
      force: (hardFloors.has(fact.id) || isHardFact(fact)) ? 'must' : (compact(hint?.force) || (turnRelevant ? 'boost' : 'guard')),
      ttl: null,
      confidence: null,
      compressionGroupId: null
    });
    if (cappedLane.lowered) {
      rejections.push({ factId: fact.id, reason: 'lane-lowered-for-disclosure-state', requestedLane: uncappedLane, lane });
    }
    selected.add(fact.id);
  }

  const guardFocusResult = validateGuardFocus(proposed.guardFocus, {
    factById,
    audience,
    candidates,
    hardFloors,
    sourceFrame
  });
  rejections.push(...guardFocusResult.rejections);
  const compressionResult = validateCompressionGroups(proposed.compressionGroups, {
    factById,
    audience,
    candidates,
    hardFloors,
    sourceFrame
  });
  rejections.push(...compressionResult.rejections);

  const omitted = asArray(proposed.omitted)
    .map((item) => ({ factId: compact(item?.factId), reason: compact(item?.reason) || 'omitted' }))
    .filter((item) => item.factId && factById.has(item.factId) && !selected.has(item.factId));

  const laneFactIds = {};
  for (const operation of operations) {
    if (!operation.lane || operation.action !== 'select') continue;
    if (!laneFactIds[operation.lane]) laneFactIds[operation.lane] = [];
    laneFactIds[operation.lane].push(operation.factId);
  }
  const guardFocus = [...new Set([
    ...guardFocusResult.guardFocus,
    ...guardFactIds
  ])];

  return {
    kind: VALIDATED_CONTINUITY_PLAN_KIND,
    audience,
    operations,
    omitted,
    rejections,
    selectedFactIds: [...selected],
    guardFactIds: [...guardFactIds],
    auditFactIds: [...auditFactIds],
    guardFocus,
    compressionGroups: compressionResult.compressionGroups,
    laneFactIds,
    fallbackReason,
    hash: hashContinuityText({
      operations,
      omitted,
      audience,
      guardFactIds: [...guardFactIds],
      auditFactIds: [...auditFactIds],
      guardFocus,
      compressionGroups: compressionResult.compressionGroups
    })
  };
}

export const __continuityProjectionPlanValidatorTestHooks = Object.freeze({
  RENDERABLE_FACT_LANES,
  isHardFact,
  isPlanFactSelectable,
  laneAtLeastAsProminent,
  normalizePlanForce,
  normalizePlanLane,
  normalizePlanTtl,
  normalizedHintMap,
  turnRelevanceScore
});
