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

function intersects(left = [], right = []) {
  const rightSet = new Set(right);
  return left.some((value) => rightSet.has(value));
}

function normalizeText(value) {
  return String(value || '').toLowerCase();
}

function pressureMatchesInput(record, context) {
  const input = normalizeText(context.normalizedPlayerInput);
  if (!input) {
    return false;
  }
  return [
    record.id,
    record.title,
    record.summary,
    ...(record.tags || [])
  ].some((value) => value && input.includes(normalizeText(value)));
}

export function selectCommandQuestion(policyIndex, sceneSnapshot = {}, campaignState = {}) {
  const context = buildCompetenceContext(sceneSnapshot, campaignState);
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

function pressureBriefScore(record, context) {
  let score = 100;
  if (record.linkedPhaseIds.includes(context.activePhaseId)) {
    score -= 35;
  }
  if (intersects(record.linkedDecisionPointIds, context.activeDecisionPointIds)) {
    score -= 40;
  }
  if (intersects(record.tags, context.intentTags)) {
    score -= 20;
  }
  if (pressureMatchesInput(record, context)) {
    score -= 15;
  }
  if (intersects(record.linkedCrewIds, context.presentCharacters)) {
    score -= 8;
  }
  if (intersects(record.linkedCrewIds, context.implicatedOfficerIds)) {
    score -= 8;
  }
  if (record.urgencyBand === 'urgent') {
    score -= 20;
  } else if (record.urgencyBand === 'high') {
    score -= 14;
  } else if (record.urgencyBand === 'medium') {
    score -= 8;
  }
  return score;
}

function pressureOperationalPressure(context) {
  return context.pressureRecords
    .filter((record) => record.status === 'active')
    .map((record) => ({
      record,
      score: pressureBriefScore(record, context)
    }))
    .sort((left, right) => left.score - right.score || left.record.id.localeCompare(right.record.id))
    .slice(0, 4)
    .map(({ record }) => ({
      id: `brief.${record.id}`,
      summary: record.summary,
      record: {
        id: record.id,
        type: record.type,
        status: record.status,
        urgencyBand: record.urgencyBand,
        escalationBand: record.escalationBand,
        linkedCrewIds: record.linkedCrewIds,
        linkedSystemIds: record.linkedSystemIds,
        linkedPhaseIds: record.linkedPhaseIds,
        linkedDecisionPointIds: record.linkedDecisionPointIds,
        linkedChapterIds: record.linkedChapterIds,
        linkedTemplateIds: record.linkedTemplateIds,
        tags: record.tags
      }
    }));
}

export function buildCommandBrief({ policyIndex, sceneSnapshot = {}, campaignState = {}, routineActions = [], commandQuestion = null }) {
  const context = buildCompetenceContext(sceneSnapshot, campaignState);
  return {
    routineResponse: routineActions.map((action) => ({
      id: action.id,
      summary: action.summary
    })),
    knownFacts: selectMatching(policyIndex.briefFacts, context),
    uncertainty: selectMatching(policyIndex.briefUncertainties, context),
    operationalPressure: [
      ...selectMatching(policyIndex.operationalPressures, context),
      ...pressureOperationalPressure(context)
    ],
    commandQuestion
  };
}
