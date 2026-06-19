import {
  buildCompetenceContext,
  isPlayerSafeRecord,
  publicRecord,
  ruleMatchesContext
} from './competence-policy-index.mjs';

function selectMatching(records = [], context) {
  return records
    .filter((record) => isPlayerSafeRecord(record))
    .filter((record) => ruleMatchesContext(record, context))
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0) || left.id.localeCompare(right.id))
    .map((record) => ({
      id: record.id,
      summary: record.summary,
      record: publicRecord(record)
    }));
}

export function selectCommandQuestion(policyIndex, sceneSnapshot = {}) {
  const context = buildCompetenceContext(sceneSnapshot);
  return (policyIndex.commandQuestions || [])
    .filter((question) => isPlayerSafeRecord(question))
    .filter((question) => ruleMatchesContext(question, context))
    .sort((left, right) => Number(left.priority || 100) - Number(right.priority || 100) || left.id.localeCompare(right.id))
    .map((question) => ({
      id: question.id,
      summary: question.summary,
      record: publicRecord(question)
    }))[0] || null;
}

export function buildCommandBrief({ policyIndex, sceneSnapshot = {}, routineActions = [], commandQuestion = null }) {
  const context = buildCompetenceContext(sceneSnapshot);
  return {
    routineResponse: routineActions.map((action) => ({
      id: action.id,
      summary: action.summary
    })),
    knownFacts: selectMatching(policyIndex.briefFacts, context),
    uncertainty: selectMatching(policyIndex.briefUncertainties, context),
    operationalPressure: selectMatching(policyIndex.operationalPressures, context),
    commandQuestion
  };
}
