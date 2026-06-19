import {
  buildCompetenceContext,
  isPlayerSafeRecord,
  publicRecord,
  ruleMatchesContext
} from './competence-policy-index.mjs';
import { normalizeSeverity } from './knowledge-classes.mjs';

function acceptedWarningIds(campaignState = {}, sceneSnapshot = {}) {
  const activeMissionId = sceneSnapshot.missionId || null;
  const activePhaseId = sceneSnapshot.activePhaseId || sceneSnapshot.phaseId || null;
  return new Set((campaignState.commandCompetence?.warningLedger || [])
    .filter((record) => record.confirmed === true || record.accepted === true)
    .filter((record) => !activeMissionId || record.activeMissionId === activeMissionId)
    .filter((record) => !activePhaseId || record.activePhaseId === activePhaseId)
    .map((record) => record.id)
    .filter(Boolean));
}

export function evaluateProceduralWarnings(policyIndex, sceneSnapshot = {}, campaignState = {}) {
  const context = buildCompetenceContext(sceneSnapshot);
  const acceptedIds = acceptedWarningIds(campaignState, sceneSnapshot);
  return (policyIndex.warningRules || [])
    .filter((warning) => !acceptedIds.has(warning.id))
    .filter((warning) => isPlayerSafeRecord(warning))
    .filter((warning) => ruleMatchesContext(warning, context))
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((warning) => {
      const severity = normalizeSeverity(warning.severity);
      return {
        id: warning.id,
        severity,
        proposedAction: warning.proposedAction || '',
        standardConcern: warning.standardConcern || '',
        knownConsequence: warning.knownConsequence || '',
        availableBasisForException: warning.availableBasisForException || '',
        confirmationRecommended: severity === 'serious',
        confirmationRequired: ['serious', 'critical'].includes(severity),
        explicitConfirmationRequired: severity === 'critical',
        record: publicRecord(warning)
      };
    });
}
