export const KNOWLEDGE_CLASSES = Object.freeze({
  ROUTINE_PROFESSIONAL: 'routineProfessional',
  SPECIALIST: 'specialist',
  COMMAND_JUDGMENT: 'commandJudgment',
  UNKNOWN_OR_CONCEALED: 'unknownOrConcealed'
});

export const CONFIDENCE_LABELS = Object.freeze([
  'confirmed',
  'strongAssessment',
  'probableInference',
  'plausibleHypothesis',
  'speculation',
  'unknown'
]);

export const WARNING_SEVERITIES = Object.freeze([
  'advisory',
  'serious',
  'critical'
]);

export const NO_GOTCHA_BASES = Object.freeze([
  'riskCommunicated',
  'explicitBypass',
  'establishedInformation',
  'genuinelyConcealed',
  'clearTimePressure',
  'ignoredStandingConcern',
  'characterImpairmentOrUnfamiliar'
]);

export function isKnownKnowledgeClass(value) {
  return Object.values(KNOWLEDGE_CLASSES).includes(value);
}

export function isPlayerSafeKnowledgeClass(value) {
  return value !== KNOWLEDGE_CLASSES.UNKNOWN_OR_CONCEALED;
}

export function normalizeSeverity(value) {
  const key = String(value || '').trim().toLowerCase();
  return WARNING_SEVERITIES.includes(key) ? key : 'advisory';
}

export function isSevereConsequence(value) {
  return ['serious', 'critical'].includes(normalizeSeverity(value));
}
