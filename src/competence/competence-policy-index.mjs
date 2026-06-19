import {
  KNOWLEDGE_CLASSES,
  isPlayerSafeKnowledgeClass
} from './knowledge-classes.mjs';

export function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function byId(items = []) {
  return new Map(asArray(items).filter((item) => item?.id).map((item) => [item.id, item]));
}

function normalizeText(value) {
  return String(value || '').toLowerCase();
}

function textIncludesAny(text, values = []) {
  const normalized = normalizeText(text);
  return values.some((value) => normalized.includes(normalizeText(value)));
}

function inferIntentTags(playerInput) {
  const input = normalizeText(playerInput);
  const tags = [];
  const groups = [
    ['distress', ['distress', 'hail', 'hails', 'signal', 'packet']],
    ['approach', ['approach', 'take us in', 'close', 'move in', 'intercept']],
    ['rescue', ['rescue', 'survivor', 'survivors', 'help', 'aid', 'relief']],
    ['verification', ['verify', 'authenticate', 'authentication', 'confirm', 'check']],
    ['scan', ['scan', 'sensors', 'sensor', 'long-range']],
    ['medical', ['medical', 'doctor', 'sickbay', 'pathogen', 'bio', 'biological']],
    ['security', ['security', 'tactical', 'shields', 'weapons', 'boarding party']],
    ['quarantine', ['quarantine', 'isolation', 'isolate', 'decon']],
    ['evidence', ['evidence', 'forensic', 'logs', 'computer', 'records', 'preserve']],
    ['diplomacy', ['diplomacy', 'coordinate', 'contact', 'compact', 'local authority']],
    ['waive-isolation', ['waive isolation', 'skip isolation', 'ignore quarantine', 'directly to unrestricted']],
    ['beam-to-public-area', ['beam directly', 'beam them directly', 'unrestricted sickbay', 'public area']],
    ['weapons', ['open fire', 'fire phasers', 'weapons free', 'destroy']],
    ['detention', ['detain', 'arrest', 'seize']]
  ];

  for (const [tag, terms] of groups) {
    if (textIncludesAny(input, terms)) {
      tags.push(tag);
    }
  }

  return unique(tags);
}

export function buildCompetenceContext(sceneSnapshot = {}) {
  const playerInput = sceneSnapshot.playerInput || '';
  const providedIntentTags = asArray(sceneSnapshot.intentTags);
  const inferredIntentTags = inferIntentTags(playerInput);
  const signals = unique([
    ...asArray(sceneSnapshot.conditionIds),
    ...asArray(sceneSnapshot.signalIds),
    ...asArray(sceneSnapshot.knownFactIds),
    ...asArray(sceneSnapshot.activeDecisionPointIds),
    ...providedIntentTags,
    ...inferredIntentTags
  ]);

  return {
    playerInput,
    normalizedPlayerInput: normalizeText(playerInput),
    intentTags: unique([...providedIntentTags, ...inferredIntentTags]),
    signals
  };
}

function requiresAllPresent(required = [], available = []) {
  const availableSet = new Set(available);
  return asArray(required).every((value) => availableSet.has(value));
}

function hasAny(values = [], available = []) {
  const availableSet = new Set(available);
  return asArray(values).some((value) => availableSet.has(value));
}

export function ruleMatchesContext(rule = {}, context = buildCompetenceContext()) {
  const requiredSignals = [
    ...asArray(rule.eligibleWhen),
    ...asArray(rule.requiredSignals)
  ];
  if (requiredSignals.length > 0 && !requiresAllPresent(requiredSignals, context.signals)) {
    return false;
  }

  const disqualifyingSignals = [
    ...asArray(rule.ineligibleWhen),
    ...asArray(rule.disqualifyingSignals)
  ];
  if (disqualifyingSignals.length > 0 && hasAny(disqualifyingSignals, context.signals)) {
    return false;
  }

  const intentAny = [
    ...asArray(rule.intentAny),
    ...asArray(rule.requiresIntentAny)
  ];
  if (intentAny.length > 0 && !hasAny(intentAny, context.intentTags) && !textIncludesAny(context.playerInput, intentAny)) {
    return false;
  }

  const excludesIntentAny = [
    ...asArray(rule.excludesIntentAny)
  ];
  if (excludesIntentAny.length > 0 && (hasAny(excludesIntentAny, context.intentTags) || textIncludesAny(context.playerInput, excludesIntentAny))) {
    return false;
  }

  const matches = asArray(rule.matches);
  if (matches.length > 0 && !hasAny(matches, context.intentTags) && !textIncludesAny(context.playerInput, matches)) {
    return false;
  }

  return true;
}

export function isPlayerSafeRecord(record = {}) {
  if (record.visibility === 'directorOnly') {
    return false;
  }
  if (record.knowledgeClass && !isPlayerSafeKnowledgeClass(record.knowledgeClass)) {
    return false;
  }
  return true;
}

export function publicRecord(record = {}) {
  const copy = cloneJson(record);
  delete copy.directorOnly;
  delete copy.hiddenTruth;
  delete copy.hiddenRefs;
  return copy;
}

export function indexCompetencePolicy(policy = {}) {
  const indexed = {
    raw: cloneJson(policy),
    manifest: cloneJson(policy.manifest || {}),
    missionId: policy.missionId || policy.manifest?.missionId || null,
    phaseId: policy.phaseId || policy.manifest?.phaseId || null,
    routineProcedures: asArray(policy.routineProcedures),
    professionalKnowledge: asArray(policy.professionalKnowledge),
    domainReports: asArray(policy.domainReports),
    commandQuestions: asArray(policy.commandQuestions),
    warningRules: asArray(policy.warningRules),
    authorityNotes: asArray(policy.authorityNotes),
    anchoredRiskRules: asArray(policy.anchoredRiskRules),
    briefFacts: asArray(policy.briefFacts),
    briefUncertainties: asArray(policy.briefUncertainties),
    operationalPressures: asArray(policy.operationalPressures)
  };

  indexed.routineProceduresById = byId(indexed.routineProcedures);
  indexed.professionalKnowledgeById = byId(indexed.professionalKnowledge);
  indexed.domainReportsById = byId(indexed.domainReports);
  indexed.commandQuestionsById = byId(indexed.commandQuestions);
  indexed.warningRulesById = byId(indexed.warningRules);
  indexed.authorityNotesById = byId(indexed.authorityNotes);
  indexed.anchoredRiskRulesById = byId(indexed.anchoredRiskRules);
  indexed.briefFactsById = byId(indexed.briefFacts);
  indexed.briefUncertaintiesById = byId(indexed.briefUncertainties);
  indexed.operationalPressuresById = byId(indexed.operationalPressures);

  indexed.commandJudgmentRecords = indexed.professionalKnowledge
    .filter((item) => item.knowledgeClass === KNOWLEDGE_CLASSES.COMMAND_JUDGMENT)
    .map((item) => item.id);

  return indexed;
}
