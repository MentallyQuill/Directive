import { selectCommandQuestion, buildCommandBrief } from './command-brief-builder.mjs';
import { createCompetencePacket, validateCompetencePacket } from './competence-packet.mjs';
import {
  buildCompetenceContext,
  indexCompetencePolicy,
  isPlayerSafeRecord,
  publicRecord,
  ruleMatchesContext
} from './competence-policy-index.mjs';
import { selectDomainReports } from './domain-report-selector.mjs';
import { KNOWLEDGE_CLASSES } from './knowledge-classes.mjs';
import { evaluateAuthorityNotes } from './authority-note-evaluator.mjs';
import { evaluateProceduralWarnings } from './procedure-warning-evaluator.mjs';
import { selectRoutineActions } from './procedural-autocomplete.mjs';
import { parseCounselRequest } from './request-counsel-parser.mjs';
import { matchStandingOrders } from './standing-orders.mjs';

function selectProfessionalKnowledge(policyIndex, sceneSnapshot, campaignState = {}) {
  const context = buildCompetenceContext(sceneSnapshot, campaignState);
  return (policyIndex.professionalKnowledge || [])
    .filter((item) => item.knowledgeClass !== KNOWLEDGE_CLASSES.COMMAND_JUDGMENT)
    .filter((item) => isPlayerSafeRecord(item))
    .filter((item) => ruleMatchesContext(item, context))
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0) || left.id.localeCompare(right.id))
    .map((item) => ({
      id: item.id,
      knowledgeClass: item.knowledgeClass || KNOWLEDGE_CLASSES.ROUTINE_PROFESSIONAL,
      summary: item.summary,
      record: publicRecord(item)
    }));
}

export function planCommandCompetence({
  policy,
  sceneSnapshot = {},
  campaignState = {},
  sourceTurnId = null
} = {}) {
  const policyIndex = indexCompetencePolicy(policy || {});
  const routineActions = selectRoutineActions(policyIndex, sceneSnapshot);
  const professionalKnowledge = selectProfessionalKnowledge(policyIndex, sceneSnapshot, campaignState);
  const commandQuestion = selectCommandQuestion(policyIndex, sceneSnapshot, campaignState);
  const requestCounsel = parseCounselRequest(sceneSnapshot);
  const domainReports = selectDomainReports(policyIndex, sceneSnapshot, campaignState);
  const authorityNotes = evaluateAuthorityNotes(policyIndex, sceneSnapshot);
  const proceduralWarnings = evaluateProceduralWarnings(policyIndex, sceneSnapshot, campaignState);
  const standingOrderMatches = matchStandingOrders({ campaignState, sceneSnapshot });
  const commandBrief = buildCommandBrief({
    policyIndex,
    sceneSnapshot,
    campaignState,
    routineActions,
    commandQuestion
  });

  const packet = createCompetencePacket({
    sourceTurnId,
    activeMissionId: sceneSnapshot.missionId || policyIndex.missionId,
    activePhaseId: sceneSnapshot.activePhaseId || sceneSnapshot.phaseId || policyIndex.phaseId,
    routineActions,
    professionalKnowledge,
    domainReports,
    commandQuestion,
    commandBrief,
    requestCounsel,
    authorityNotes,
    proceduralWarnings,
    standingOrderMatches
  });

  const validation = validateCompetencePacket(packet);
  if (!validation.ok) {
    throw new Error(`Invalid competence packet:\n${validation.errors.map((error) => `- ${error}`).join('\n')}`);
  }

  return packet;
}
