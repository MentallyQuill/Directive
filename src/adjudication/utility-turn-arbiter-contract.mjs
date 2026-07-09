export const TURN_ARBITER_ROLE_ID = 'utilityTurnArbiter';
export const TURN_ARBITER_PLAN_KIND = 'directive.turnArbiterPlan.v1';

export const TURN_ARBITER_ROUTES = Object.freeze([
  'hostContinue',
  'directiveOutcome',
  'localPacing',
  'pause',
  'recovery'
]);

export const TURN_ARBITER_TIME_ACTIONS = Object.freeze([
  'skip',
  'adjudicate'
]);

export const TURN_ARBITER_TIME_SEMANTIC_KINDS = Object.freeze([
  'none',
  'sceneCut',
  'montage',
  'travel',
  'workBlock',
  'rest',
  'acceptedContinuation',
  'referenceOnly'
]);

export const TURN_ARBITER_TIME_AUTHORITIES = Object.freeze([
  'none',
  'playerNarration',
  'playerDialogue',
  'assistantAcceptedProse',
  'operatorControl'
]);

const OWNER_BY_ROUTE = Object.freeze({
  hostContinue: 'host',
  directiveOutcome: 'directive',
  localPacing: 'directive',
  pause: 'directive',
  recovery: 'directive'
});

const HIDDEN_STATE_PATTERNS = Object.freeze([
  /\braw (?:pressure|relationship|hidden|secret)\b/i,
  /\bhidden (?:state|truth|pressure|score|value)\b/i,
  /\bprovider reasoning\b/i,
  /\bapi key\b/i,
  /\bcsrf\b/i,
  /\bcookie\b/i,
  /\bprivate npc thought\b/i
]);

function compact(value = '') {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanStringArray(value) {
  return asArray(value).map(compact).filter(Boolean);
}

function hasHiddenStateLeak(value) {
  const text = JSON.stringify(value || {});
  return HIDDEN_STATE_PATTERNS.some((pattern) => pattern.test(text));
}

function normalizeRoute(value) {
  const route = compact(value);
  return TURN_ARBITER_ROUTES.includes(route) ? route : '';
}

function normalizeMember(value, allowed, fallback) {
  const normalized = compact(value);
  return allowed.includes(normalized) ? normalized : fallback;
}

function normalizeTimePlan(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const action = normalizeMember(source.action, TURN_ARBITER_TIME_ACTIONS, 'skip');
  const semanticKind = normalizeMember(source.semanticKind, TURN_ARBITER_TIME_SEMANTIC_KINDS, action === 'skip' ? 'none' : 'sceneCut');
  const authority = normalizeMember(source.authority, TURN_ARBITER_TIME_AUTHORITIES, 'none');
  const confidence = Math.max(0, Math.min(1, Number(source.confidence) || 0));
  return {
    action,
    semanticKind,
    authority,
    confidence,
    evidence: compact(source.evidence),
    rationale: compact(source.rationale)
  };
}

export function normalizeTurnArbiterPlan(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, plan: null, error: { code: 'not_object' } };
  }
  if (hasHiddenStateLeak(value)) {
    return { ok: false, plan: null, error: { code: 'hidden_state_leak' } };
  }
  const route = normalizeRoute(value.route);
  if (!route) return { ok: false, plan: null, error: { code: 'unsupported_route' } };
  const owner = compact(value.responsePlan?.owner);
  if (owner !== OWNER_BY_ROUTE[route]) {
    return { ok: false, plan: null, error: { code: 'route_owner_mismatch' } };
  }
  const commitOutcome = value.statePlan?.commitOutcome === true;
  if (commitOutcome && route !== 'directiveOutcome') {
    return { ok: false, plan: null, error: { code: 'commit_outcome_route_mismatch' } };
  }
  const confidence = Math.max(0, Math.min(1, Number(value.confidence) || 0));
  const plan = {
    kind: TURN_ARBITER_PLAN_KIND,
    schemaVersion: 1,
    route,
    confidence,
    ambiguity: compact(value.ambiguity) || 'unknown',
    playerIntent: {
      speechAct: compact(value.playerIntent?.speechAct),
      action: compact(value.playerIntent?.action),
      target: compact(value.playerIntent?.target),
      directObject: compact(value.playerIntent?.directObject),
      domainSignals: cleanStringArray(value.playerIntent?.domainSignals),
      riskSignals: cleanStringArray(value.playerIntent?.riskSignals)
    },
    sceneContinuity: {
      currentLocation: compact(value.sceneContinuity?.currentLocation),
      currentConversation: compact(value.sceneContinuity?.currentConversation),
      mustPreserve: cleanStringArray(value.sceneContinuity?.mustPreserve),
      mustNotReestablish: cleanStringArray(value.sceneContinuity?.mustNotReestablish)
    },
    responsePlan: {
      owner,
      strategy: compact(value.responsePlan?.strategy),
      guidance: compact(value.responsePlan?.guidance)
    },
    statePlan: {
      commitOutcome,
      allowedDomains: cleanStringArray(value.statePlan?.allowedDomains),
      proposedOperations: asArray(value.statePlan?.proposedOperations).filter((entry) => entry && typeof entry === 'object'),
      promptDirtyDomains: cleanStringArray(value.statePlan?.promptDirtyDomains)
    },
    timePlan: normalizeTimePlan(value.timePlan),
    risk: {
      requiresPause: value.risk?.requiresPause === true,
      pauseReason: compact(value.risk?.pauseReason),
      reasons: cleanStringArray(value.risk?.reasons)
    },
    diagnostics: {
      sourceUse: compact(value.diagnostics?.sourceUse),
      deterministicFallbackUsed: value.diagnostics?.deterministicFallbackUsed === true
    }
  };
  if (['hostContinue', 'directiveOutcome'].includes(route)
    && plan.sceneContinuity.mustPreserve.length === 0
    && plan.sceneContinuity.mustNotReestablish.length === 0) {
    return { ok: false, plan: null, error: { code: 'missing_scene_continuity' } };
  }
  return { ok: true, plan, error: null };
}

export function conservativeArbiterFailurePlan({
  reason = 'arbiter_failed',
  sourceClean = false,
  ordinaryDialogueLikely = false
} = {}) {
  const hostSafe = sourceClean === true && ordinaryDialogueLikely === true;
  return {
    kind: TURN_ARBITER_PLAN_KIND,
    schemaVersion: 1,
    route: hostSafe ? 'hostContinue' : 'pause',
    confidence: 0,
    ambiguity: 'high',
    playerIntent: {
      speechAct: hostSafe ? 'unknown-dialogue' : 'unknown',
      action: '',
      target: '',
      directObject: '',
      domainSignals: [],
      riskSignals: []
    },
    sceneContinuity: {
      currentLocation: '',
      currentConversation: '',
      mustPreserve: [],
      mustNotReestablish: []
    },
    responsePlan: {
      owner: hostSafe ? 'host' : 'directive',
      strategy: hostSafe ? 'injectAndContinue' : 'pause',
      guidance: hostSafe ? 'Continue from the latest visible exchange. Do not reintroduce already-established scene setup.' : ''
    },
    statePlan: {
      commitOutcome: false,
      allowedDomains: [],
      proposedOperations: [],
      promptDirtyDomains: []
    },
    timePlan: {
      action: 'skip',
      semanticKind: 'none',
      authority: 'none',
      confidence: hostSafe ? 0.7 : 0,
      evidence: hostSafe ? 'Failure fallback preserves host continuation without clock movement.' : '',
      rationale: reason
    },
    risk: {
      requiresPause: !hostSafe,
      pauseReason: hostSafe ? '' : reason,
      reasons: [reason].filter(Boolean)
    },
    diagnostics: {
      sourceUse: 'failure fallback',
      deterministicFallbackUsed: false
    }
  };
}
