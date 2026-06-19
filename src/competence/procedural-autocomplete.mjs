import {
  KNOWLEDGE_CLASSES
} from './knowledge-classes.mjs';
import {
  buildCompetenceContext,
  publicRecord,
  ruleMatchesContext
} from './competence-policy-index.mjs';

const SAFETY_KEYS = [
  'routine',
  'reversible',
  'lowCost',
  'noncontroversial',
  'withinAuthority',
  'intentConsistent',
  'nonEscalatory'
];

function safetyValue(procedure, key) {
  if (procedure.safety && Object.hasOwn(procedure.safety, key)) {
    return procedure.safety[key] === true;
  }
  return procedure[key] === true;
}

export function evaluateRoutineEligibility(procedure = {}, context = buildCompetenceContext()) {
  const failedSafety = SAFETY_KEYS.filter((key) => !safetyValue(procedure, key));
  const reasons = [];

  if (procedure.knowledgeClass === KNOWLEDGE_CLASSES.COMMAND_JUDGMENT) {
    reasons.push('command judgment is reserved for the player');
  }
  if (procedure.knowledgeClass === KNOWLEDGE_CLASSES.UNKNOWN_OR_CONCEALED) {
    reasons.push('concealed information cannot be autocompleted');
  }
  if (failedSafety.length > 0) {
    reasons.push(`missing routine safety gates: ${failedSafety.join(', ')}`);
  }
  if (!ruleMatchesContext(procedure, context)) {
    reasons.push('scene or intent requirements are not met');
  }

  return {
    id: procedure.id || null,
    eligible: reasons.length === 0,
    reasons
  };
}

export function selectRoutineActions(policyIndex, sceneSnapshot = {}) {
  const context = buildCompetenceContext(sceneSnapshot);
  return (policyIndex.routineProcedures || [])
    .map((procedure) => ({
      procedure,
      eligibility: evaluateRoutineEligibility(procedure, context)
    }))
    .filter((candidate) => candidate.eligibility.eligible)
    .sort((left, right) => Number(left.procedure.order || 0) - Number(right.procedure.order || 0) || left.procedure.id.localeCompare(right.procedure.id))
    .map((candidate) => ({
      id: candidate.procedure.id,
      summary: candidate.procedure.summary,
      visibility: candidate.procedure.visibility || 'playerVisibleSummary',
      source: 'proceduralAutocomplete',
      record: publicRecord(candidate.procedure)
    }));
}
