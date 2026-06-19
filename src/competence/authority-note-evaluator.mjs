import {
  buildCompetenceContext,
  isPlayerSafeRecord,
  publicRecord,
  ruleMatchesContext
} from './competence-policy-index.mjs';

export function evaluateAuthorityNotes(policyIndex, sceneSnapshot = {}) {
  const context = buildCompetenceContext(sceneSnapshot);
  return (policyIndex.authorityNotes || [])
    .filter((note) => isPlayerSafeRecord(note))
    .filter((note) => ruleMatchesContext(note, context))
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((note) => ({
      id: note.id,
      summary: note.summary,
      record: publicRecord(note)
    }));
}
