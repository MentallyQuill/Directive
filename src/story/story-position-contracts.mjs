export const STORY_CONTEXT_INDEX_KIND = 'directive.storyContextIndex.v1';
export const STORY_POSITION_CANDIDATE_KIND = 'directive.storyPositionCandidate.v1';
export const STORY_POSITION_SELECTION_KIND = 'directive.storyPositionSelection.v1';
export const STORY_POSITION_REVIEW_KIND = 'directive.storyPositionReview.v1';
export const STORY_DELTA_PLAN_KIND = 'directive.storyDeltaPlan.v1';
export const STORY_DELTA_REVIEW_KIND = 'directive.storyDeltaReview.v1';
export const ACTIVE_STORY_PROJECTION_KIND = 'directive.activeStoryProjection.v1';

const ROUTES = new Set(['outcome', 'hostContinue', 'pause', 'clarify', 'openWorld', 'sideScene', 'aftermath']);
const REVIEW_ACTIONS = new Set(['approve', 'pause', 'retryStoryPosition', 'retryOutcomePlan', 'retryDeltaPlan', 'hostContinue']);
const RISKS = new Set(['low', 'medium', 'high']);
const NODE_STATUSES = new Set(['unseen', 'available', 'active', 'completed', 'closed', 'blocked', 'stale', 'rerunOnly']);
const FACT_STATUSES = new Set(['unknown', 'known', 'notYetTrue', 'invalidated']);
const THREAD_STATUSES = new Set(['unseen', 'available', 'active', 'completed', 'closed', 'blocked']);
const HIDDEN_PATTERNS = [
  /\braw (?:relationship|pressure|hidden|secret)\b/i,
  /\bhidden (?:state|truth|pressure|score|value)\b/i,
  /\bprovider reasoning\b/i,
  /\bprivate npc thought\b/i,
  /\bapi key\b/i,
  /\bcsrf\b/i,
  /\bcookie\b/i
];

function compact(value = '') {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function cleanList(value, limit = 64) {
  const output = [];
  const seen = new Set();
  for (const item of asArray(value)) {
    const text = compact(item);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    output.push(text);
    if (output.length >= limit) break;
  }
  return output;
}

function fail(code, details = {}) {
  return { ok: false, value: null, error: { code, ...details } };
}

function requireKind(value, kind) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'not_object';
  if (value.kind !== kind) return 'wrong_kind';
  return '';
}

function sourceOk(value, sourceHash) {
  return !sourceHash || compact(value.sourceHash) === compact(sourceHash);
}

function unknownIds(ids, knownIds) {
  const known = new Set(cleanList(knownIds, 10000));
  if (!known.size) return [];
  return cleanList(ids, 10000).filter((id) => !known.has(id));
}

function hasHiddenLeak(value) {
  const candidate = cloneJson(value || {});
  if (candidate.continuityGuards) {
    delete candidate.continuityGuards.mustNotReestablish;
  }
  const text = JSON.stringify(candidate || {});
  return HIDDEN_PATTERNS.some((pattern) => pattern.test(text));
}

export function normalizeStoryPositionSelection(value = {}, { sourceHash = '', candidateIds = [] } = {}) {
  const kindError = requireKind(value, STORY_POSITION_SELECTION_KIND);
  if (kindError) return fail(kindError);
  if (!sourceOk(value, sourceHash)) return fail('source_hash_mismatch');
  if (hasHiddenLeak(value)) return fail('hidden_state_leak');
  const primaryCandidateId = compact(value.primaryCandidateId);
  if (!primaryCandidateId) return fail('missing_primary_candidate_id');
  const allCandidateIds = [primaryCandidateId, ...cleanList(value.secondaryCandidateIds, 32)];
  const unknown = unknownIds(allCandidateIds, candidateIds);
  if (unknown.length) return fail('unknown_candidate_id', { id: unknown[0] });
  const route = compact(value.route);
  if (!ROUTES.has(route)) return fail('unsupported_route', { route });
  const evidenceRefs = cleanList(value.evidenceRefs, 48);
  if (!evidenceRefs.length) return fail('missing_evidence_refs');
  return {
    ok: true,
    value: {
      kind: STORY_POSITION_SELECTION_KIND,
      schemaVersion: 1,
      sourceHash: compact(value.sourceHash),
      primaryCandidateId,
      secondaryCandidateIds: cleanList(value.secondaryCandidateIds, 32),
      route,
      confidence: Math.max(0, Math.min(1, Number(value.confidence) || 0)),
      evidenceRefs,
      ignoredStaleSetup: cleanList(value.ignoredStaleSetup, 32),
      continuityGuards: {
        mustPreserve: cleanList(value.continuityGuards?.mustPreserve, 32),
        mustNotReestablish: cleanList(value.continuityGuards?.mustNotReestablish, 32)
      },
      unresolved: cleanList(value.unresolved, 32)
    },
    error: null
  };
}

export function normalizeStoryPositionReview(value = {}, { sourceHash = '', selectionHash = '' } = {}) {
  const kindError = requireKind(value, STORY_POSITION_REVIEW_KIND);
  if (kindError) return fail(kindError);
  if (!sourceOk(value, sourceHash)) return fail('source_hash_mismatch');
  if (selectionHash && compact(value.selectionHash) !== compact(selectionHash)) return fail('selection_hash_mismatch');
  if (hasHiddenLeak(value)) return fail('hidden_state_leak');
  const requiredAction = compact(value.requiredAction);
  const risk = compact(value.risk);
  if (!REVIEW_ACTIONS.has(requiredAction)) return fail('unsupported_required_action');
  if (!RISKS.has(risk)) return fail('unsupported_risk');
  return {
    ok: true,
    value: {
      kind: STORY_POSITION_REVIEW_KIND,
      schemaVersion: 1,
      sourceHash: compact(value.sourceHash),
      selectionHash: compact(value.selectionHash),
      approved: value.approved === true,
      requiredAction,
      risk,
      reasons: cleanList(value.reasons, 32),
      rejectedCandidateIds: cleanList(value.rejectedCandidateIds, 32),
      staleHistoryRisk: value.staleHistoryRisk === true,
      forbiddenAssertionRisk: value.forbiddenAssertionRisk === true
    },
    error: null
  };
}

export function normalizeStoryDeltaPlan(value = {}, {
  sourceHash = '',
  selectionHash = '',
  outcomePlanHash = '',
  knownNodeIds = [],
  knownFactIds = [],
  knownThreadIds = []
} = {}) {
  const kindError = requireKind(value, STORY_DELTA_PLAN_KIND);
  if (kindError) return fail(kindError);
  if (!sourceOk(value, sourceHash)) return fail('source_hash_mismatch');
  if (selectionHash && compact(value.selectionHash) !== compact(selectionHash)) return fail('selection_hash_mismatch');
  if (outcomePlanHash && compact(value.outcomePlanHash) !== compact(outcomePlanHash)) return fail('outcome_plan_hash_mismatch');
  if (hasHiddenLeak(value)) return fail('hidden_state_leak');
  const eventDrafts = asArray(value.eventDrafts).filter((entry) => entry && typeof entry === 'object').slice(0, 8);
  for (const event of eventDrafts) {
    const nodeIds = asArray(event.nodeTransitions).map((entry) => entry?.nodeId).filter(Boolean);
    const factIds = asArray(event.factTransitions).map((entry) => entry?.factId).filter(Boolean);
    const threadIds = asArray(event.threadTransitions).map((entry) => entry?.threadId).filter(Boolean);
    const unknownNode = unknownIds(nodeIds, knownNodeIds)[0];
    if (unknownNode) return fail('unknown_node_id', { id: unknownNode });
    const unknownFact = unknownIds(factIds, knownFactIds)[0];
    if (unknownFact) return fail('unknown_fact_id', { id: unknownFact });
    const unknownThread = unknownIds(threadIds, knownThreadIds)[0];
    if (unknownThread) return fail('unknown_thread_id', { id: unknownThread });
    for (const transition of asArray(event.nodeTransitions)) {
      if (!NODE_STATUSES.has(compact(transition?.to))) return fail('unsupported_node_status', { status: compact(transition?.to) });
    }
    for (const transition of asArray(event.factTransitions)) {
      if (!FACT_STATUSES.has(compact(transition?.to))) return fail('unsupported_fact_status', { status: compact(transition?.to) });
    }
    for (const transition of asArray(event.threadTransitions)) {
      if (!THREAD_STATUSES.has(compact(transition?.to))) return fail('unsupported_thread_status', { status: compact(transition?.to) });
    }
  }
  return {
    ok: true,
    value: {
      kind: STORY_DELTA_PLAN_KIND,
      schemaVersion: 1,
      sourceHash: compact(value.sourceHash),
      selectionHash: compact(value.selectionHash),
      outcomePlanHash: compact(value.outcomePlanHash),
      eventDrafts: cloneJson(eventDrafts),
      rejectedAssertions: cleanList(value.rejectedAssertions, 64),
      diagnostics: {
        reasonerUsed: value.diagnostics?.reasonerUsed === true,
        uncertainties: cleanList(value.diagnostics?.uncertainties, 32)
      }
    },
    error: null
  };
}

export function normalizeStoryDeltaReview(value = {}, { sourceHash = '', deltaPlanHash = '' } = {}) {
  const kindError = requireKind(value, STORY_DELTA_REVIEW_KIND);
  if (kindError) return fail(kindError);
  if (!sourceOk(value, sourceHash)) return fail('source_hash_mismatch');
  if (deltaPlanHash && compact(value.deltaPlanHash) !== compact(deltaPlanHash)) return fail('delta_plan_hash_mismatch');
  if (hasHiddenLeak(value)) return fail('hidden_state_leak');
  const requiredAction = compact(value.requiredAction);
  const risk = compact(value.risk);
  if (!REVIEW_ACTIONS.has(requiredAction)) return fail('unsupported_required_action');
  if (!RISKS.has(risk)) return fail('unsupported_risk');
  return {
    ok: true,
    value: {
      kind: STORY_DELTA_REVIEW_KIND,
      schemaVersion: 1,
      sourceHash: compact(value.sourceHash),
      deltaPlanHash: compact(value.deltaPlanHash),
      approved: value.approved === true,
      requiredAction,
      risk,
      reasons: cleanList(value.reasons, 32),
      forbiddenPastAssignment: value.forbiddenPastAssignment === true,
      futureFactLeak: value.futureFactLeak === true,
      missingBranchAuthority: value.missingBranchAuthority === true
    },
    error: null
  };
}
