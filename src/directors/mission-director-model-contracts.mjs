export const MISSION_DIRECTOR_FRAME_KIND = 'directive.missionDirectorFrame.v1';
export const MISSION_STORY_POSITION_KIND = 'directive.missionStoryPosition.v1';
export const MISSION_OUTCOME_PLAN_KIND = 'directive.missionOutcomePlan.v1';
export const MISSION_DIRECTOR_PLAN_REVIEW_KIND = 'directive.missionDirectorPlanReview.v1';

const RESULT_BANDS = new Set(['Success', 'Partial Success', 'Partial Failure', 'Failure', 'Great Failure']);
const STORY_ROUTES = new Set(['outcome', 'hostContinue', 'pause']);
const REVIEW_ACTIONS = new Set(['approve', 'pause', 'retryStoryPosition', 'retryOutcomePlan', 'hostContinue']);
const REVIEW_RISKS = new Set(['low', 'medium', 'high']);
const COMPLETION_RECOMMENDATIONS = new Set(['continue', 'completeQuest', 'pauseForReview']);
const HIDDEN_PATTERNS = [
  /\braw (?:relationship|pressure|hidden|secret)\b/i,
  /\bhidden (?:state|truth|pressure|score|value)\b/i,
  /\bprovider reasoning\b/i,
  /\bprivate npc thought\b/i,
  /\bapi key\b/i,
  /\bcsrf\b/i,
  /\bcookie\b/i
];

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compact(value = '') {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanList(value, limit = 32) {
  return asArray(value).map(compact).filter(Boolean).slice(0, limit);
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function hasHiddenLeak(value) {
  const candidate = cloneJson(value || {});
  if (candidate.narrationPlan) {
    delete candidate.narrationPlan.forbiddenFacts;
  }
  if (candidate.narrationSafety) {
    delete candidate.narrationSafety.forbiddenClaims;
  }
  const text = JSON.stringify(candidate || {});
  return HIDDEN_PATTERNS.some((pattern) => pattern.test(text));
}

function fail(code, details = {}) {
  return { ok: false, value: null, error: { code, ...details } };
}

function sourceHashOk(value, expectedSourceHash) {
  if (!expectedSourceHash) return true;
  return compact(value.sourceHash) === compact(expectedSourceHash);
}

export function normalizeMissionStoryPosition(value = {}, { expectedSourceHash = '' } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('not_object');
  if (value.kind !== MISSION_STORY_POSITION_KIND) return fail('wrong_kind');
  if (!sourceHashOk(value, expectedSourceHash)) return fail('source_hash_mismatch');
  if (hasHiddenLeak(value)) return fail('hidden_state_leak');
  const relevance = object(value.outcomeRelevance);
  const route = compact(relevance.route);
  if (!STORY_ROUTES.has(route)) return fail('unsupported_route');
  const evidenceRefs = cleanList(value.sourceUse?.evidenceRefs, 24);
  if (!evidenceRefs.length) return fail('missing_evidence_refs');
  const storyPosition = object(value.storyPosition);
  return {
    ok: true,
    value: {
      kind: MISSION_STORY_POSITION_KIND,
      schemaVersion: 1,
      sourceHash: compact(value.sourceHash),
      confidence: Math.max(0, Math.min(1, Number(value.confidence) || 0)),
      storyPosition: {
        contextType: compact(storyPosition.contextType) || 'unknown',
        missionId: compact(storyPosition.missionId),
        questId: compact(storyPosition.questId),
        phaseId: compact(storyPosition.phaseId),
        locationId: compact(storyPosition.locationId),
        anchorId: compact(storyPosition.anchorId),
        anchorFrom: compact(storyPosition.anchorFrom),
        anchorTo: compact(storyPosition.anchorTo),
        arc: compact(storyPosition.arc),
        phase: compact(storyPosition.phase),
        currentConversation: compact(storyPosition.currentConversation)
      },
      sceneContinuity: {
        mustPreserve: cleanList(value.sceneContinuity?.mustPreserve, 24),
        mustNotReestablish: cleanList(value.sceneContinuity?.mustNotReestablish, 24)
      },
      outcomeRelevance: {
        route,
        reason: compact(relevance.reason),
        activeDecisionIds: cleanList(relevance.activeDecisionIds, 24),
        candidateOutcomeIds: cleanList(relevance.candidateOutcomeIds, 24),
        requiresClarification: relevance.requiresClarification === true
      },
      sourceUse: {
        evidenceRefs,
        ignoredStaleSetup: cleanList(value.sourceUse?.ignoredStaleSetup, 24),
        uncertainties: cleanList(value.sourceUse?.uncertainties, 24)
      }
    },
    error: null
  };
}

function operationRoot(operation = {}) {
  const path = compact(operation.path || operation.pointer);
  if (path) return path.replace(/^\/+/, '').split(/[./]/)[0] || '';
  return compact(operation.root || operation.domain || operation.targetRoot);
}

export function normalizeMissionOutcomePlan(value = {}, {
  expectedSourceHash = '',
  expectedStoryPositionHash = '',
  allowedRoots = [],
  allowedFactIds = [],
  allowedDecisionIds = []
} = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('not_object');
  if (value.kind !== MISSION_OUTCOME_PLAN_KIND) return fail('wrong_kind');
  if (!sourceHashOk(value, expectedSourceHash)) return fail('source_hash_mismatch');
  if (expectedStoryPositionHash && compact(value.storyPositionHash) !== compact(expectedStoryPositionHash)) return fail('story_position_hash_mismatch');
  if (hasHiddenLeak(value)) return fail('hidden_state_leak');
  const resultBand = compact(value.resultBand);
  if (!RESULT_BANDS.has(resultBand)) return fail('unsupported_result_band');
  const allowedRootSet = new Set(cleanList(allowedRoots, 64));
  const factSet = new Set(cleanList(allowedFactIds, 512));
  const decisionSet = new Set(cleanList(allowedDecisionIds, 128));
  const stateProposal = object(value.stateProposal);
  const proposedRoots = cleanList(stateProposal.allowedRoots, 32);
  for (const root of proposedRoots) {
    if (!allowedRootSet.has(root)) return fail('unsupported_state_root', { root });
  }
  const operations = asArray(stateProposal.operations).filter((entry) => entry && typeof entry === 'object');
  for (const operation of operations) {
    const root = operationRoot(operation);
    if (root && !allowedRootSet.has(root)) return fail('unsupported_state_root', { root });
  }
  const consequencePlan = object(value.consequencePlan);
  const revealedFactIds = cleanList(consequencePlan.revealedFactIds, 64);
  for (const id of revealedFactIds) {
    if (factSet.size && !factSet.has(id)) return fail('unknown_fact_id', { id });
  }
  const commandDecisionAwards = asArray(consequencePlan.commandDecisionAwards).filter((entry) => entry && typeof entry === 'object');
  for (const award of commandDecisionAwards) {
    const id = compact(award.id);
    if (id && decisionSet.size && !decisionSet.has(id)) return fail('unknown_decision_id', { id });
  }
  const recommendation = compact(consequencePlan.completionRecommendation) || 'continue';
  if (!COMPLETION_RECOMMENDATIONS.has(recommendation)) return fail('unsupported_completion_recommendation');
  return {
    ok: true,
    value: {
      kind: MISSION_OUTCOME_PLAN_KIND,
      schemaVersion: 1,
      sourceHash: compact(value.sourceHash),
      storyPositionHash: compact(value.storyPositionHash),
      resultBand,
      outcomeSummary: compact(value.outcomeSummary),
      consequencePlan: {
        costs: cleanList(consequencePlan.costs, 24),
        revealedFactIds,
        commandDecisionAwards: cloneJson(commandDecisionAwards),
        openAssignments: cloneJson(asArray(consequencePlan.openAssignments).slice(0, 24)),
        questOutcomeKey: compact(consequencePlan.questOutcomeKey),
        completionRecommendation: recommendation
      },
      narrationPlan: {
        allowedFacts: cleanList(value.narrationPlan?.allowedFacts, 64),
        forbiddenFacts: cleanList(value.narrationPlan?.forbiddenFacts, 64),
        constraints: cleanList(value.narrationPlan?.constraints, 32),
        mustPreserve: cleanList(value.narrationPlan?.mustPreserve, 24),
        mustNotReestablish: cleanList(value.narrationPlan?.mustNotReestablish, 24)
      },
      stateProposal: {
        allowedRoots: proposedRoots,
        operations: cloneJson(operations)
      },
      diagnostics: {
        reasonerUsed: value.diagnostics?.reasonerUsed === true,
        uncertainties: cleanList(value.diagnostics?.uncertainties, 24),
        reviewRequired: value.diagnostics?.reviewRequired === true
      }
    },
    error: null
  };
}

export function normalizeMissionDirectorPlanReview(value = {}, {
  expectedSourceHash = '',
  expectedStoryPositionHash = '',
  expectedOutcomePlanHash = ''
} = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('not_object');
  if (value.kind !== MISSION_DIRECTOR_PLAN_REVIEW_KIND) return fail('wrong_kind');
  if (!sourceHashOk(value, expectedSourceHash)) return fail('source_hash_mismatch');
  if (expectedStoryPositionHash && compact(value.storyPositionHash) !== compact(expectedStoryPositionHash)) return fail('story_position_hash_mismatch');
  if (expectedOutcomePlanHash && compact(value.outcomePlanHash) !== compact(expectedOutcomePlanHash)) return fail('outcome_plan_hash_mismatch');
  if (hasHiddenLeak(value)) return fail('hidden_state_leak');
  const requiredAction = compact(value.requiredAction);
  if (!REVIEW_ACTIONS.has(requiredAction)) return fail('unsupported_required_action');
  const risk = compact(value.risk);
  if (!REVIEW_RISKS.has(risk)) return fail('unsupported_risk');
  return {
    ok: true,
    value: {
      kind: MISSION_DIRECTOR_PLAN_REVIEW_KIND,
      schemaVersion: 1,
      sourceHash: compact(value.sourceHash),
      storyPositionHash: compact(value.storyPositionHash),
      outcomePlanHash: compact(value.outcomePlanHash),
      approved: value.approved === true,
      risk,
      requiredAction,
      reasons: cleanList(value.reasons, 24),
      narrationSafety: {
        hiddenStateLeak: value.narrationSafety?.hiddenStateLeak === true,
        staleSetupRisk: value.narrationSafety?.staleSetupRisk === true,
        forbiddenClaims: cleanList(value.narrationSafety?.forbiddenClaims, 24)
      }
    },
    error: null
  };
}
