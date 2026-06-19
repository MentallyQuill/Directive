import {
  NO_GOTCHA_BASES,
  isSevereConsequence
} from './knowledge-classes.mjs';

function hasWarning(competencePacket, warningId) {
  return Boolean(warningId) && (competencePacket?.proceduralWarnings || []).some((warning) => warning.id === warningId);
}

function hasRoutineAction(competencePacket, routineProcedureId) {
  return Boolean(routineProcedureId) && (competencePacket?.routineActions || []).some((action) => action.id === routineProcedureId);
}

export function evaluateNoGotchaCheck({ consequence = {}, competencePacket = {} } = {}) {
  const severe = isSevereConsequence(consequence.severity);
  const evidence = [];

  if (hasWarning(competencePacket, consequence.warningId)) {
    evidence.push('riskCommunicated');
  }
  for (const basis of NO_GOTCHA_BASES) {
    if (consequence[basis] === true && !evidence.includes(basis)) {
      evidence.push(basis);
    }
  }

  const shouldHaveBeenAutocompleted = severe
    && evidence.length === 0
    && hasRoutineAction(competencePacket, consequence.omittedRoutineProcedureId);

  return {
    consequenceId: consequence.id || null,
    severity: consequence.severity || 'advisory',
    fair: !severe || evidence.length > 0,
    evidence,
    shouldHaveBeenAutocompleted,
    reason: !severe
      ? 'No-gotcha check not required for non-severe consequence.'
      : (evidence.length > 0
        ? 'Severe consequence has a fair-play basis.'
        : 'Severe consequence lacks a fair-play basis.')
  };
}
