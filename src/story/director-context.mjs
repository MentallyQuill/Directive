import { collectMissionPredicateRefs } from '../mission/v1/predicate-evaluator.mjs';
import { projectContinuityThreads } from './continuity-events.mjs';

export const STORY_DIRECTOR_CONTEXT_MAX_CHARACTERS = 48000;
export const STORY_DIRECTOR_MAX_DETAILED_THREADS = 12;

function compact(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function stableId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
}

function assertBudget(value, maximum = STORY_DIRECTOR_CONTEXT_MAX_CHARACTERS) {
  const characters = [...JSON.stringify(value)].length;
  if (!Number.isInteger(maximum) || maximum < 1 || characters > maximum) {
    throw new TypeError('director-context-overflow');
  }
  return value;
}

function predicateRefs(objective = {}) {
  const ids = new Set();
  for (const predicate of [
    objective.activationWhen,
    objective.availableWhen,
    objective.visibleWhen,
    objective.progressWhen,
    ...(objective.terminalWhen || []).map((entry) => entry?.when),
  ]) {
    const refs = collectMissionPredicateRefs(predicate);
    for (const collection of Object.values(refs)) {
      for (const id of collection) if (stableId(id)) ids.add(id);
    }
  }
  if (stableId(objective.scenePacing?.authorizationOutcomeId)) {
    ids.add(objective.scenePacing.authorizationOutcomeId);
  }
  return [...ids].sort();
}

function objectiveOpportunity(objective, state) {
  const authorizationId = objective.scenePacing?.authorizationOutcomeId || null;
  return {
    id: objective.id,
    kind: 'objective',
    playerSafeText: compact(objective.playerText?.summary || objective.playerText?.title),
    playerText: {
      title: compact(objective.playerText?.title),
      summary: compact(objective.playerText?.summary),
    },
    predicateRefs: predicateRefs(objective),
    conditionIds: authorizationId ? [authorizationId] : [],
    permissionFlags: {
      visible: true,
      terminal: false,
      completionAuthorized: authorizationId === null
        || state?.outcomes?.[authorizationId] === 'authorized',
    },
  };
}

function shipConstraints(shipMechanics = {}) {
  const constraints = [];
  for (const item of shipMechanics?.constraints || []) {
    if (!stableId(item?.id)) continue;
    constraints.push({
      id: item.id,
      kind: 'ship-constraint',
      label: compact(item.label),
      text: compact(item.summary),
      narratorGuidance: compact(item.narratorGuidance),
    });
  }
  for (const capability of shipMechanics?.capabilities || []) {
    if (!stableId(capability?.id)) continue;
    for (const [index, limit] of (capability.limits || []).entries()) {
      const text = compact(limit);
      if (!text) continue;
      constraints.push({
        id: `${capability.id}.limit.${index}`,
        kind: 'capability-limit',
        capabilityId: capability.id,
        text,
      });
    }
  }
  return constraints;
}

function guidanceConstraint(definition, knownConstraintIds) {
  const guidance = definition?.directorGuidance;
  if (!guidance) return null;
  const constraintRefs = [...new Set(guidance.constraintRefs || [])];
  if (constraintRefs.some((id) => !knownConstraintIds.has(id))) {
    throw new TypeError('director-guidance-constraint-ref-invalid');
  }
  return {
    id: `director-guidance.${definition.id}`,
    kind: 'mission-guidance',
    focusText: compact(guidance.focusText),
    avoidText: compact(guidance.avoidText),
    constraintRefs,
  };
}

function dutyReportOpportunity(value) {
  if (value?.available === false) return null;
  const packet = value?.packet || value;
  const id = packet?.reportId || packet?.id;
  const canonicalText = compact(value?.segment?.canonicalText || packet?.segment?.canonicalText);
  if (!stableId(id) || !canonicalText) return null;
  return {
    id,
    kind: 'duty-report',
    playerSafeText: canonicalText,
    conditionIds: [],
    canonical: true,
  };
}

function transitionOpportunity(value) {
  if (!value || value.available === false) return null;
  const id = value.transitionKey || value.id;
  const playerSafeText = compact(value.next?.playerSafeSetup || value.playerSafeText);
  if (!stableId(id) || !playerSafeText) return null;
  return {
    id,
    kind: 'transition',
    playerSafeText,
    conditionIds: [],
    canonical: true,
  };
}

export function createDirectorAuthoredContext({
  definition = {},
  missionState = {},
  shipMechanics = {},
  pendingTransition = null,
  pendingDutyReport = null,
} = {}) {
  const constraints = shipConstraints(shipMechanics);
  const knownConstraintIds = new Set(constraints.map(({ id }) => id));
  const guidance = guidanceConstraint(definition, knownConstraintIds);
  if (guidance) constraints.push(guidance);

  const opportunities = (definition.objectives || [])
    .filter((objective) => {
      const state = missionState?.objectives?.[objective.id];
      return state?.visibility === 'visible' && state?.state !== 'terminal';
    })
    .map((objective) => objectiveOpportunity(objective, missionState));
  const report = dutyReportOpportunity(pendingDutyReport);
  const transition = transitionOpportunity(pendingTransition);
  if (report) opportunities.push(report);
  if (transition) opportunities.push(transition);
  opportunities.sort((left, right) => left.id.localeCompare(right.id));

  return assertBudget({ constraints, opportunities, coverage: 'partial' });
}

function compactThread(thread) {
  return {
    id: thread.id,
    title: compact(thread.title),
    category: thread.category,
    status: thread.status,
  };
}

function detailedThread(thread) {
  return {
    id: thread.id,
    title: compact(thread.title),
    category: thread.category,
    status: thread.status,
    facts: (thread.facts || []).map((fact) => ({
      id: fact.id,
      text: compact(fact.text),
      claimType: fact.claimType,
      authoredRef: fact.authoredRef ?? null,
      sourceContributionIds: clone(fact.sourceContributionIds || []),
      sources: clone(fact.sources || []),
    })),
    sourceContributionIds: clone(thread.sourceContributionIds || []),
  };
}

export function projectDirectorContinuity({
  events = [],
  missionId = null,
  referencedIds = [],
  maxCharacters = STORY_DIRECTOR_CONTEXT_MAX_CHARACTERS,
} = {}) {
  const threads = projectContinuityThreads(events);
  const requested = new Set([missionId, ...(referencedIds || [])].filter(stableId));
  const latestRevision = new Map();
  for (const event of events || []) {
    if (!stableId(event?.threadId)) continue;
    latestRevision.set(
      event.threadId,
      Math.max(latestRevision.get(event.threadId) ?? -1, event.settledAtRevision ?? -1),
    );
  }
  const referencesRequestedId = (thread) => requested.has(thread.id)
    || (thread.facts || []).some((fact) => requested.has(fact.id) || requested.has(fact.authoredRef));
  const unresolved = threads.filter((thread) => thread.status !== 'resolved');
  const index = unresolved.map(compactThread).sort((left, right) => left.id.localeCompare(right.id));
  const selectable = threads.filter((thread) => thread.status !== 'resolved' || referencesRequestedId(thread));
  selectable.sort((left, right) => {
    const referenceRank = Number(referencesRequestedId(right)) - Number(referencesRequestedId(left));
    if (referenceRank !== 0) return referenceRank;
    const revisionRank = (latestRevision.get(right.id) ?? -1) - (latestRevision.get(left.id) ?? -1);
    return revisionRank || left.id.localeCompare(right.id);
  });
  const records = selectable.slice(0, STORY_DIRECTOR_MAX_DETAILED_THREADS).map(detailedThread);
  return assertBudget({ index, records }, maxCharacters);
}
