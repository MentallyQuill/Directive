import {
  buildCompetenceContext,
  isPlayerSafeRecord,
  publicRecord,
  ruleMatchesContext
} from './competence-policy-index.mjs';
import { normalizeSeverity } from './knowledge-classes.mjs';

export function evaluateProceduralWarnings(policyIndex, sceneSnapshot = {}) {
  const context = buildCompetenceContext(sceneSnapshot);
  return (policyIndex.warningRules || [])
    .filter((warning) => isPlayerSafeRecord(warning))
    .filter((warning) => ruleMatchesContext(warning, context))
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((warning) => ({
      id: warning.id,
      severity: normalizeSeverity(warning.severity),
      proposedAction: warning.proposedAction || '',
      standardConcern: warning.standardConcern || '',
      knownConsequence: warning.knownConsequence || '',
      availableBasisForException: warning.availableBasisForException || '',
      confirmationRequired: normalizeSeverity(warning.severity) === 'critical',
      record: publicRecord(warning)
    }));
}
