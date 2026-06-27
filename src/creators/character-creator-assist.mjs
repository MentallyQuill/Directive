import { createCharacterCreationContext } from '../packages/campaign-package-context.mjs';
import { assertProviderResponseText } from '../providers/provider-response-normalizer.mjs';
import { parseStructuredJsonText } from '../providers/structured-output-parser.mjs';
import { HIDDEN_TRUTH_TERMS, hiddenTruthTerm } from '../generation/hidden-truth-safety.mjs';

export const CHARACTER_CREATOR_SECTION_DRAFT_ROLE_ID = 'characterCreatorSectionDraft';

export const CHARACTER_CREATOR_SECTION_IDS = Object.freeze([
  'identity',
  'service',
  'personality',
  'review'
]);

const SECTION_FIELDS = Object.freeze({
  identity: Object.freeze([
    'identity.name',
    'identity.pronounsOrAddress',
    'identity.speciesId',
    'identity.ageBandId',
    'identity.appearance'
  ]),
  service: Object.freeze([
    'service.careerBackgroundId',
    'service.formativeExperienceId',
    'service.assignmentReasonId',
    'dossier.serviceSummary'
  ]),
  personality: Object.freeze([
    'personality.traits.insight',
    'personality.traits.connection',
    'personality.traits.execution',
    'personality.flawId',
    'dossier.traits'
  ]),
  review: Object.freeze([
    'dossier.briefBiography',
    'dossier.publicReputation'
  ])
});

export const CHARACTER_CREATOR_SELF_FILL_CHAR_LIMIT = 1500;
export const CHARACTER_CREATOR_SELF_FILL_CHARACTER_TARGET = Object.freeze({
  min: 600,
  max: 800
});
export const CHARACTER_CREATOR_SECTION_DRAFT_TIMEOUT_RETRY_LIMIT = 1;
export const CHARACTER_CREATOR_SECTION_DRAFT_REASONING_TIMEOUT_MS = 45000;
export const CHARACTER_CREATOR_SECTION_DRAFT_UTILITY_TIMEOUT_MS = 30000;
export const CHARACTER_CREATOR_SELF_FILL_FIELDS = Object.freeze([
  'identity.appearance',
  'dossier.serviceSummary',
  'dossier.traits',
  'dossier.briefBiography',
  'dossier.publicReputation'
]);

const SELF_FILL_FIELD_SET = new Set(CHARACTER_CREATOR_SELF_FILL_FIELDS);

const FIELD_LIMITS = Object.freeze({
  'identity.name': 90,
  'identity.pronounsOrAddress': 70,
  'identity.appearance': CHARACTER_CREATOR_SELF_FILL_CHAR_LIMIT,
  'dossier.serviceSummary': CHARACTER_CREATOR_SELF_FILL_CHAR_LIMIT,
  'dossier.traits': CHARACTER_CREATOR_SELF_FILL_CHAR_LIMIT,
  'dossier.briefBiography': CHARACTER_CREATOR_SELF_FILL_CHAR_LIMIT,
  'dossier.publicReputation': CHARACTER_CREATOR_SELF_FILL_CHAR_LIMIT
});

const SELECT_FIELD_OPTIONS = Object.freeze({
  'identity.speciesId': 'allowedSpecies',
  'identity.ageBandId': 'ageBands',
  'service.careerBackgroundId': 'careerBackgrounds',
  'service.formativeExperienceId': 'formativeExperiences',
  'service.assignmentReasonId': 'assignmentReasons',
  'personality.flawId': 'flaws'
});

const TRAIT_FIELD_CATEGORY = Object.freeze({
  'personality.traits.insight': 'insight',
  'personality.traits.connection': 'connection',
  'personality.traits.execution': 'execution'
});

const CREATOR_ASSIST_PARAMETERS = Object.freeze({
  temperature: 0.45,
  max_tokens: 900
});

const CREATOR_ASSIST_MODEL_PREFERENCES = Object.freeze({
  cost: 'balanced',
  latency: 'medium',
  capability: 'reasoning-writing'
});

const CREATOR_SECTION_DRAFT_PROVIDER_ATTEMPTS = Object.freeze([
  Object.freeze({
    id: 'reasoning-primary',
    providerKind: 'reasoning',
    timeoutMs: CHARACTER_CREATOR_SECTION_DRAFT_REASONING_TIMEOUT_MS
  }),
  Object.freeze({
    id: 'reasoning-retry',
    providerKind: 'reasoning',
    timeoutMs: CHARACTER_CREATOR_SECTION_DRAFT_REASONING_TIMEOUT_MS
  }),
  Object.freeze({
    id: 'utility-fallback',
    providerKind: 'utility',
    timeoutMs: CHARACTER_CREATOR_SECTION_DRAFT_UTILITY_TIMEOUT_MS
  })
]);

const CHARACTER_CREATOR_SECTION_DRAFT_JSON_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'sectionId', 'mode', 'fields'],
  properties: {
    kind: { const: 'directive.characterCreatorSectionDraftResult' },
    sectionId: { enum: CHARACTER_CREATOR_SECTION_IDS },
    mode: { enum: ['create', 'refine'] },
    fields: {
      type: 'object',
      additionalProperties: {
        anyOf: [
          { type: 'string' },
          { type: 'number' },
          { type: 'boolean' },
          { type: 'object' }
        ]
      }
    },
    notes: {
      type: 'array',
      items: { type: 'string' }
    },
    warnings: {
      type: 'array',
      items: { type: 'string' }
    }
  }
});

const RISKY_BACKSTORY_PATTERN = /\b(section\s*31|secret ancestry|hidden powers?|chosen one|war criminal|criminal history|court-?martial|universally admired|impossibly competent|severe trauma|traumatic secret)\b/i;

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function normalizeText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function compactText(value = '', maxLength = 700) {
  const text = normalizeText(value);
  if (!text) return '';
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function redactHiddenTerms(value) {
  if (typeof value === 'string') {
    return HIDDEN_TRUTH_TERMS.reduce((text, term) => (
      text.replace(new RegExp(escapeRegExp(term), 'gi'), '[hidden campaign term]')
    ), value);
  }
  if (Array.isArray(value)) return value.map(redactHiddenTerms);
  if (isObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, redactHiddenTerms(entry)]));
  }
  return value;
}

function requireSectionId(sectionId) {
  const id = String(sectionId || '').trim();
  if (!CHARACTER_CREATOR_SECTION_IDS.includes(id)) {
    throw new Error(`Unknown Character Creator section "${id || 'unknown'}".`);
  }
  return id;
}

function getNestedValue(source, path) {
  return String(path || '').split('.').filter(Boolean).reduce((value, key) => value?.[key], source);
}

function setNestedValue(target, path, value) {
  const keys = String(path || '').split('.').filter(Boolean);
  if (keys.length === 0) return;
  let cursor = target;
  for (const key of keys.slice(0, -1)) {
    if (!isObject(cursor[key])) cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[keys.at(-1)] = value;
}

function meaningfulValue(value) {
  return typeof value === 'string' ? value.trim() !== '' : value !== undefined && value !== null;
}

function isSelfFillField(path = '') {
  return SELF_FILL_FIELD_SET.has(path);
}

export function characterCreatorSectionHasMeaningfulInput(input = {}, sectionId = '') {
  const id = requireSectionId(sectionId);
  return SECTION_FIELDS[id].some((path) => meaningfulValue(getNestedValue(input, path)));
}

function modeForSection(input, sectionId) {
  return characterCreatorSectionHasMeaningfulInput(input, sectionId) ? 'refine' : 'create';
}

function pickSectionInput(input = {}, sectionId = '') {
  const id = requireSectionId(sectionId);
  const section = {};
  for (const path of SECTION_FIELDS[id]) {
    const value = getNestedValue(input, path);
    if (meaningfulValue(value)) setNestedValue(section, path, value);
  }
  return section;
}

function priorSectionInputs(input = {}, sectionId = '') {
  const id = requireSectionId(sectionId);
  const prior = {};
  const index = CHARACTER_CREATOR_SECTION_IDS.indexOf(id);
  for (const priorId of CHARACTER_CREATOR_SECTION_IDS.slice(0, Math.max(0, index))) {
    prior[priorId] = pickSectionInput(input, priorId);
  }
  return prior;
}

function optionArray(context, key) {
  if (key === 'flaws') return asArray(context.options?.flaws?.options);
  return asArray(context.options?.[key]);
}

function traitOptions(context, categoryId) {
  return asArray(context.options?.traitCategories)
    .find((category) => category?.id === categoryId)?.options || [];
}

function allowedIdsForField(context, path) {
  const traitCategory = TRAIT_FIELD_CATEGORY[path];
  if (traitCategory) return new Set(traitOptions(context, traitCategory).map((option) => option.id).filter(Boolean));
  const key = SELECT_FIELD_OPTIONS[path];
  if (!key) return null;
  return new Set(optionArray(context, key).map((option) => option.id).filter(Boolean));
}

function optionLabel(options = [], id = '', fallback = '') {
  const option = asArray(options).find((item) => item?.id === id);
  return compactText(option?.label || option?.title || option?.summary || fallback || id, 180);
}

function labelForField(context, path, id = '') {
  const traitCategory = TRAIT_FIELD_CATEGORY[path];
  if (traitCategory) return optionLabel(traitOptions(context, traitCategory), id, id);
  const key = SELECT_FIELD_OPTIONS[path];
  if (key) return optionLabel(optionArray(context, key), id, id);
  return compactText(id, 180);
}

function firstOptionId(options = [], preferred = []) {
  const available = asArray(options).filter((option) => option?.id);
  for (const id of preferred) {
    if (available.some((option) => option.id === id)) return id;
  }
  return available[0]?.id || '';
}

function allowedOptionsForSection(context, sectionId) {
  const id = requireSectionId(sectionId);
  const options = {};
  for (const path of SECTION_FIELDS[id]) {
    const traitCategory = TRAIT_FIELD_CATEGORY[path];
    if (traitCategory) {
      options[path] = traitOptions(context, traitCategory).map((option) => ({
        id: option.id,
        label: option.label,
        summary: option.summary || ''
      }));
      continue;
    }
    const key = SELECT_FIELD_OPTIONS[path];
    if (key) {
      options[path] = optionArray(context, key).map((option) => ({
        id: option.id,
        label: option.label,
        summary: option.summary || ''
      }));
    }
  }
  return options;
}

function flattenFields(source = {}, prefix = '', output = {}) {
  if (!isObject(source)) return output;
  for (const [key, value] of Object.entries(source)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isObject(value)) {
      flattenFields(value, path, output);
    } else {
      output[path] = value;
    }
  }
  return output;
}

function parseProviderResponse(response = {}) {
  if (isObject(response?.content)) return cloneJson(response.content);
  if (isObject(response?.json)) return cloneJson(response.json);
  if (isObject(response?.data)) return cloneJson(response.data);
  if (isObject(response?.structuredOutput)) return cloneJson(response.structuredOutput);
  if (isObject(response) && isObject(response.fields)) return cloneJson(response);
  const text = assertProviderResponseText(response, {
    providerTitle: 'Character Creator section draft',
    maxTokens: CREATOR_ASSIST_PARAMETERS.max_tokens
  });
  const parsed = parseStructuredJsonText(text, { requireObject: true });
  if (parsed.ok) return parsed.value;
  const error = new Error('Provider returned invalid structured JSON for Character Creator section draft.');
  error.code = parsed.diagnostic?.code || 'json_invalid';
  error.details = parsed.diagnostic || null;
  throw error;
}

function unsafeGeneratedTerm(value, allowedInput = {}) {
  const hidden = hiddenTruthTerm(value);
  if (hidden && !hiddenTruthTerm(allowedInput)) return hidden;
  const text = JSON.stringify(value || {});
  const match = text.match(RISKY_BACKSTORY_PATTERN);
  return match ? match[0] : null;
}

function normalizeFieldValue({ context, path, value, currentInput }) {
  const allowed = allowedIdsForField(context, path);
  if (allowed) {
    const selected = compactText(value, 120);
    return allowed.has(selected) ? selected : '';
  }
  const text = isSelfFillField(path)
    ? normalizeText(value)
    : compactText(value, FIELD_LIMITS[path] || 420);
  if (!text) return '';
  const term = unsafeGeneratedTerm({ [path]: text }, currentInput);
  if (term) {
    const error = new Error(`Provider output included unsafe Character Creator content: ${term}.`);
    error.code = 'DIRECTIVE_CHARACTER_CREATOR_ASSIST_UNSAFE_OUTPUT';
    error.hiddenLeakTerm = term;
    throw error;
  }
  return text;
}

function supplementMissingProviderFields({ fields, context, sectionId, input }) {
  const fallbackFields = createFallbackFields(context, sectionId, input);
  const supplemented = [];
  for (const path of SECTION_FIELDS[sectionId]) {
    if (!meaningfulValue(fields[path]) && meaningfulValue(fallbackFields[path])) {
      fields[path] = fallbackFields[path];
      supplemented.push(path);
    }
  }
  return supplemented;
}

function normalizeProviderPayload({ payload, sectionId, context, input, generationResult }) {
  const id = requireSectionId(sectionId);
  if (payload.sectionId && payload.sectionId !== id) {
    throw new Error(`Provider returned section "${payload.sectionId}" while "${id}" was requested.`);
  }
  const rawFields = flattenFields(isObject(payload.fields) ? payload.fields : payload);
  const allowed = new Set(SECTION_FIELDS[id]);
  const fields = {};
  const warnings = [];

  for (const [path, value] of Object.entries(rawFields)) {
    if (!allowed.has(path)) {
      if (!['kind', 'mode', 'sectionId', 'notes', 'warnings'].includes(path)) {
        warnings.push(`Ignored unsupported field "${path}".`);
      }
      continue;
    }
    const normalized = normalizeFieldValue({
      context,
      path,
      value,
      currentInput: input
    });
    if (normalized) fields[path] = normalized;
    else warnings.push(`Ignored invalid value for "${path}".`);
  }

  if (Object.keys(fields).length === 0) {
    throw new Error('Provider returned no usable fields for the requested Character Creator section.');
  }
  const supplementedFields = supplementMissingProviderFields({
    fields,
    context,
    sectionId: id,
    input
  });
  if (supplementedFields.length > 0) {
    warnings.push(`Filled ${supplementedFields.length} missing section field${supplementedFields.length === 1 ? '' : 's'} from package-safe fallback values.`);
  }

  return {
    kind: 'directive.characterCreatorSectionDraftResult',
    ok: true,
    source: 'provider',
    sectionId: id,
    mode: payload.mode === 'refine' ? 'refine' : modeForSection(input, id),
    fields,
    notes: asArray(payload.notes).map((note) => compactText(note, 220)).filter(Boolean).slice(0, 6),
    warnings: [
      ...warnings,
      ...asArray(payload.warnings).map((warning) => compactText(warning, 220)).filter(Boolean)
    ].slice(0, 8),
    diagnostics: {
      providerUsed: true,
      providerOutputRejected: false,
      hiddenLeakBlocked: false,
      ...providerDiagnosticsFromGenerationResult(generationResult)
    }
  };
}

function fillMissing(fields, path, value) {
  if (!meaningfulValue(fields[path]) && meaningfulValue(value)) fields[path] = value;
}

function fallbackIdentityFields(context, input = {}) {
  const fields = {};
  for (const path of SECTION_FIELDS.identity) fillMissing(fields, path, getNestedValue(input, path));
  fillMissing(fields, 'identity.name', 'Ari Venn');
  fillMissing(fields, 'identity.pronounsOrAddress', 'they/them');
  fillMissing(fields, 'identity.speciesId', firstOptionId(context.options.allowedSpecies, ['human']));
  fillMissing(fields, 'identity.ageBandId', firstOptionId(context.options.ageBands, ['mid-career']));
  const species = labelForField(context, 'identity.speciesId', fields['identity.speciesId']) || 'Starfleet';
  const ageBand = labelForField(context, 'identity.ageBandId', fields['identity.ageBandId']) || 'experienced';
  const billet = context.lockedRole?.billet || 'senior officer';
  fillMissing(fields, 'identity.appearance', `A ${ageBand.toLowerCase()} ${species} officer with practical uniform details, an alert bridge posture, and the steady presence expected of the ${billet}.`);
  return fields;
}

function fallbackServiceSummary(context, fields = {}) {
  const career = labelForField(context, 'service.careerBackgroundId', fields['service.careerBackgroundId']) || 'a credible Starfleet service record';
  const formative = labelForField(context, 'service.formativeExperienceId', fields['service.formativeExperienceId']) || 'prior operational experience';
  const assignment = labelForField(context, 'service.assignmentReasonId', fields['service.assignmentReasonId']) || 'the current assignment';
  const shipName = context.ship?.name || 'the assigned starship';
  return `Service record centers on ${career.toLowerCase()}, shaped by ${formative.toLowerCase()}, with the ${shipName} assignment grounded in ${assignment.toLowerCase()}.`;
}

function fallbackServiceFields(context, input = {}) {
  const fields = {};
  for (const path of SECTION_FIELDS.service) fillMissing(fields, path, getNestedValue(input, path));
  fillMissing(fields, 'service.careerBackgroundId', firstOptionId(context.options.careerBackgrounds, ['operations-logistics', 'command-administration']));
  fillMissing(fields, 'service.formativeExperienceId', firstOptionId(context.options.formativeExperiences, ['dominion-war-fleet-service', 'disaster-relief-evacuation']));
  fillMissing(fields, 'service.assignmentReasonId', firstOptionId(context.options.assignmentReasons, ['relevant-specialist-experience', 'requested-by-captain']));
  fillMissing(fields, 'dossier.serviceSummary', fallbackServiceSummary(context, fields));
  return fields;
}

function fallbackPersonalitySummary(context, fields = {}) {
  const insight = labelForField(context, 'personality.traits.insight', fields['personality.traits.insight']) || 'careful observation';
  const connection = labelForField(context, 'personality.traits.connection', fields['personality.traits.connection']) || 'professional candor';
  const execution = labelForField(context, 'personality.traits.execution', fields['personality.traits.execution']) || 'disciplined action';
  const flaw = labelForField(context, 'personality.flawId', fields['personality.flawId']) || 'guarded judgment';
  return `Command style reads as ${insight.toLowerCase()}, ${connection.toLowerCase()}, and ${execution.toLowerCase()}, with ${flaw.toLowerCase()} as the pressure point to watch.`;
}

function fallbackPersonalityFields(context, input = {}) {
  const fields = {};
  for (const path of SECTION_FIELDS.personality) fillMissing(fields, path, getNestedValue(input, path));
  fillMissing(fields, 'personality.traits.insight', firstOptionId(traitOptions(context, 'insight'), ['perceptive', 'analytical']));
  fillMissing(fields, 'personality.traits.connection', firstOptionId(traitOptions(context, 'connection'), ['diplomatic', 'candid']));
  fillMissing(fields, 'personality.traits.execution', firstOptionId(traitOptions(context, 'execution'), ['disciplined', 'decisive']));
  fillMissing(fields, 'personality.flawId', firstOptionId(context.options.flaws?.options, ['guarded', 'impatient']));
  fillMissing(fields, 'dossier.traits', fallbackPersonalitySummary(context, fields));
  return fields;
}

function applyTemplate(template = '', values = {}) {
  return String(template || '').replace(/\{\{([^}]+)\}\}/g, (_, key) => compactText(values[key.trim()] || '', 120));
}

function fallbackReviewFields(context, input = {}) {
  const identity = {
    ...fallbackIdentityFields(context, input),
    ...flattenFields(input.identity ? { identity: input.identity } : {})
  };
  const service = {
    ...fallbackServiceFields(context, input),
    ...flattenFields(input.service ? { service: input.service } : {})
  };
  const personality = {
    ...fallbackPersonalityFields(context, input),
    ...flattenFields(input.personality ? { personality: input.personality } : {})
  };
  const name = compactText(identity['identity.name'], 90) || 'This officer';
  const rank = context.lockedRole?.rank || 'Commander';
  const billet = context.lockedRole?.billet || 'Executive Officer';
  const values = {
    name,
    species: labelForField(context, 'identity.speciesId', identity['identity.speciesId']) || 'Starfleet',
    careerBackground: labelForField(context, 'service.careerBackgroundId', service['service.careerBackgroundId']) || 'command',
    formativeExperience: labelForField(context, 'service.formativeExperienceId', service['service.formativeExperienceId']) || 'prior service',
    insightTrait: labelForField(context, 'personality.traits.insight', personality['personality.traits.insight']) || 'careful observation',
    connectionTrait: labelForField(context, 'personality.traits.connection', personality['personality.traits.connection']) || 'professional candor',
    executionTrait: labelForField(context, 'personality.traits.execution', personality['personality.traits.execution']) || 'disciplined action',
    flaw: labelForField(context, 'personality.flawId', personality['personality.flawId']) || 'guarded judgment',
    rank,
    billet,
    shipName: context.ship?.name || 'the assigned starship'
  };
  const fallbackBiography = applyTemplate(context.localFallback?.biographyTemplate, values)
    || `${name} is a ${values.species} Starfleet ${rank} assigned as ${billet} aboard ${values.shipName}. Their ${values.careerBackground} background and ${values.formativeExperience} experience make the assignment credible, while ${values.flaw} remains a pressure point.`;
  const fallbackReputation = applyTemplate(context.localFallback?.publicReputationTemplate, values)
    || `${name} is regarded as a capable ${rank} whose ${values.careerBackground} background makes the Breckenridge assignment plausible.`;
  return {
    'dossier.briefBiography': normalizeText(getNestedValue(input, 'dossier.briefBiography') || fallbackBiography),
    'dossier.publicReputation': normalizeText(getNestedValue(input, 'dossier.publicReputation') || fallbackReputation)
  };
}

function createFallbackFields(context, sectionId, input = {}) {
  if (sectionId === 'identity') return fallbackIdentityFields(context, input);
  if (sectionId === 'service') return fallbackServiceFields(context, input);
  if (sectionId === 'personality') return fallbackPersonalityFields(context, input);
  return fallbackReviewFields(context, input);
}

function createFallbackResult({ context, sectionId, mode, input, warnings = [], diagnostics = {} }) {
  return {
    kind: 'directive.characterCreatorSectionDraftResult',
    ok: true,
    source: 'deterministic-fallback',
    sectionId,
    mode,
    fields: createFallbackFields(context, sectionId, input),
    notes: ['Used package Character Creator options and player-visible setup context.'],
    warnings: warnings.map((warning) => compactText(warning, 220)).filter(Boolean).slice(0, 8),
    diagnostics: {
      providerUsed: false,
      providerOutputRejected: false,
      hiddenLeakBlocked: false,
      ...cloneJson(diagnostics)
    }
  };
}

function createCanceledResult({ sectionId, mode, diagnostics = {} }) {
  return {
    kind: 'directive.characterCreatorSectionDraftResult',
    ok: false,
    source: 'canceled',
    sectionId,
    mode,
    fields: {},
    notes: [],
    warnings: ['Draft canceled.'],
    diagnostics: {
      providerUsed: true,
      providerOutputRejected: false,
      hiddenLeakBlocked: false,
      canceled: true,
      providerId: diagnostics.providerId || null,
      model: diagnostics.model || null,
      usage: cloneJson(diagnostics.usage || null),
      providerKind: diagnostics.providerKind || null,
      finalProviderKind: diagnostics.finalProviderKind || diagnostics.providerKind || null,
      utilityFallbackAttempted: diagnostics.utilityFallbackAttempted === true,
      providerAttempts: cloneJson(diagnostics.providerAttempts || []),
      timeoutRetryCount: Number(diagnostics.timeoutRetryCount || 0)
    }
  };
}

function isGenerationTimeoutResult(result = {}) {
  return result?.ok === false && result?.error?.code === 'DIRECTIVE_GENERATION_TIMEOUT';
}

function isGenerationCanceledResult(result = {}) {
  return result?.ok === false && result?.error?.code === 'DIRECTIVE_GENERATION_ABORTED';
}

function isAbortLikeError(error) {
  return error?.code === 'DIRECTIVE_GENERATION_ABORTED'
    || error?.name === 'AbortError'
    || error?.code === 'ABORT_ERR';
}

function generationFailureResultFromThrown(error, attempt) {
  return {
    ok: false,
    error: {
      code: isAbortLikeError(error) ? 'DIRECTIVE_GENERATION_ABORTED' : (error?.code || 'DIRECTIVE_GENERATION_FAILED'),
      message: error?.message || String(error || 'Character Creator provider request failed.'),
      retryable: !isAbortLikeError(error)
    },
    diagnostics: {
      providerId: null,
      model: null,
      usage: null,
      providerKind: attempt.providerKind
    }
  };
}

function attemptProgressMessage(attempt, previousResult = null) {
  if (attempt.id === 'reasoning-primary') return 'Generating with Reasoning...';
  const previousTimedOut = isGenerationTimeoutResult(previousResult);
  const previousRejected = previousResult?.diagnostics?.providerOutputRejected === true;
  if (attempt.id === 'reasoning-retry') {
    if (previousTimedOut) return 'Reasoning timed out. Retrying Reasoning...';
    if (previousRejected) return 'Reasoning returned an unusable draft. Retrying Reasoning...';
    return 'Reasoning failed. Retrying Reasoning...';
  }
  if (previousTimedOut) return 'Reasoning timed out again. Trying Utility...';
  if (previousRejected) return 'Reasoning returned another unusable draft. Trying Utility...';
  return 'Reasoning failed again. Trying Utility...';
}

function localFallbackProgressMessage(previousResult = null) {
  const provider = previousResult?.role?.providerKind || previousResult?.diagnostics?.finalProviderKind || 'provider';
  const label = provider === 'utility' ? 'Utility' : 'Provider';
  if (isGenerationTimeoutResult(previousResult)) return `${label} timed out. Using local fallback...`;
  if (previousResult?.diagnostics?.providerOutputRejected === true) return `${label} returned an unusable draft. Using local fallback...`;
  return `${label} failed. Using local fallback...`;
}

function emitCreatorAssistProgress(onProgress, payload = {}) {
  if (typeof onProgress !== 'function') return;
  try {
    onProgress({
      kind: 'directive.creatorAssistProgress',
      ...payload
    });
  } catch {
    // Progress is UI-only and must never affect provider fallback behavior.
  }
}

function annotateGenerationAttemptResult(generationResult, attempt, {
  timeoutRetryCount = 0,
  attemptRecords = []
} = {}) {
  return {
    ...generationResult,
    diagnostics: {
      ...(generationResult?.diagnostics || {}),
      providerKind: generationResult?.role?.providerKind || generationResult?.diagnostics?.providerKind || attempt.providerKind,
      finalProviderKind: generationResult?.role?.providerKind || generationResult?.diagnostics?.providerKind || attempt.providerKind,
      timeoutRetryCount,
      utilityFallbackAttempted: attemptRecords.some((record) => record.providerKind === 'utility'),
      providerAttempts: cloneJson(attemptRecords)
    }
  };
}

function providerDiagnosticsFromGenerationResult(generationResult = {}) {
  return {
    providerId: generationResult?.diagnostics?.providerId || null,
    model: generationResult?.diagnostics?.model || null,
    usage: cloneJson(generationResult?.diagnostics?.usage || null),
    providerKind: generationResult?.diagnostics?.providerKind || generationResult?.role?.providerKind || null,
    finalProviderKind: generationResult?.diagnostics?.finalProviderKind || generationResult?.diagnostics?.providerKind || generationResult?.role?.providerKind || null,
    hiddenLeakBlocked: generationResult?.diagnostics?.hiddenLeakBlocked === true,
    hiddenLeakTerm: generationResult?.diagnostics?.hiddenLeakTerm || null,
    validationErrorCode: generationResult?.diagnostics?.validationErrorCode || null,
    utilityFallbackAttempted: generationResult?.diagnostics?.utilityFallbackAttempted === true,
    providerAttempts: cloneJson(generationResult?.diagnostics?.providerAttempts || []),
    timeoutRetryCount: Number(generationResult?.diagnostics?.timeoutRetryCount || 0)
  };
}

function validationFailureResultFromError(generationResult, attempt, error, {
  timeoutRetryCount = 0,
  attemptRecords = []
} = {}) {
  return {
    ...generationResult,
    ok: false,
    error: {
      code: error?.code || 'DIRECTIVE_CHARACTER_CREATOR_ASSIST_PROVIDER_REJECTED',
      message: error?.message || 'Character Creator provider response was not usable.',
      retryable: true
    },
    diagnostics: {
      ...(generationResult?.diagnostics || {}),
      providerKind: generationResult?.role?.providerKind || generationResult?.diagnostics?.providerKind || attempt.providerKind,
      finalProviderKind: generationResult?.role?.providerKind || generationResult?.diagnostics?.providerKind || attempt.providerKind,
      providerOutputRejected: true,
      hiddenLeakBlocked: error?.code === 'DIRECTIVE_CHARACTER_CREATOR_ASSIST_UNSAFE_OUTPUT',
      hiddenLeakTerm: error?.hiddenLeakTerm || null,
      validationErrorCode: error?.code || null,
      timeoutRetryCount,
      utilityFallbackAttempted: attemptRecords.some((record) => record.providerKind === 'utility'),
      providerAttempts: cloneJson(attemptRecords)
    }
  };
}

async function generateSectionDraftWithProviderFallback(generationRouter, request, {
  signal = null,
  onProgress = null,
  acceptGenerationResult = null
} = {}) {
  let timeoutRetryCount = 0;
  let previousResult = null;
  const attemptRecords = [];

  for (const [index, attempt] of CREATOR_SECTION_DRAFT_PROVIDER_ATTEMPTS.entries()) {
    emitCreatorAssistProgress(onProgress, {
      status: attempt.id,
      providerKind: attempt.providerKind,
      timeoutMs: attempt.timeoutMs,
      attempt: index + 1,
      message: attemptProgressMessage(attempt, previousResult)
    });

    let generationResult;
    try {
      generationResult = await generationRouter.generate(CHARACTER_CREATOR_SECTION_DRAFT_ROLE_ID, request, {
        signal,
        providerKind: attempt.providerKind,
        timeoutMs: attempt.timeoutMs
      });
    } catch (error) {
      generationResult = generationFailureResultFromThrown(error, attempt);
    }

    const record = {
      id: attempt.id,
      providerKind: attempt.providerKind,
      timeoutMs: attempt.timeoutMs,
      ok: generationResult?.ok === true,
      errorCode: generationResult?.error?.code || null,
      retryable: generationResult?.error?.retryable === true
    };
    attemptRecords.push(record);
    const result = {
      ...generationResult,
      diagnostics: {
        ...(generationResult?.diagnostics || {}),
        timeoutRetryCount,
        providerKind: generationResult?.role?.providerKind || generationResult?.diagnostics?.providerKind || attempt.providerKind,
        finalProviderKind: generationResult?.role?.providerKind || generationResult?.diagnostics?.providerKind || attempt.providerKind,
        utilityFallbackAttempted: attemptRecords.some((entry) => entry.providerKind === 'utility'),
        providerAttempts: cloneJson(attemptRecords)
      }
    };
    if (isGenerationCanceledResult(result) || signal?.aborted) {
      return result;
    }
    if (result.ok) {
      if (typeof acceptGenerationResult !== 'function') return result;
      try {
        return {
          generationResult: result,
          assistResult: acceptGenerationResult(result)
        };
      } catch (error) {
        record.ok = false;
        record.errorCode = error?.code || 'DIRECTIVE_CHARACTER_CREATOR_ASSIST_PROVIDER_REJECTED';
        record.retryable = true;
        record.providerOutputRejected = true;
        const rejected = validationFailureResultFromError(result, attempt, error, {
          timeoutRetryCount,
          attemptRecords
        });
        previousResult = rejected;
        continue;
      }
    }
    previousResult = result;
    if (attempt.id === 'reasoning-primary' && isGenerationTimeoutResult(result)) timeoutRetryCount += 1;
  }

  emitCreatorAssistProgress(onProgress, {
    status: 'local-fallback',
    providerKind: previousResult?.diagnostics?.finalProviderKind || null,
    timeoutMs: 0,
    attempt: CREATOR_SECTION_DRAFT_PROVIDER_ATTEMPTS.length + 1,
    message: localFallbackProgressMessage(previousResult)
  });

  return annotateGenerationAttemptResult(previousResult, CREATOR_SECTION_DRAFT_PROVIDER_ATTEMPTS.at(-1), {
    timeoutRetryCount,
    attemptRecords
  });
}

function createPrompt(snapshot) {
  return [
    'Draft one Character Creator section for Directive.',
    'Return JSON only. Do not include markdown.',
    'Use only the supplied player-visible campaign and package setup context.',
    'Never expose hidden campaign state, Director notes, raw relationship values, pressure values, hidden clocks, or future reveals.',
    'Respect currentSection as authoritative inspiration in refine mode. Fill missing values and improve weak phrasing without overwriting clear player intent.',
    'For select fields, return only allowed option ids. For text fields, stay concise and plausible for a Starfleet officer in this campaign.',
    `For self-fill text boxes, target about ${CHARACTER_CREATOR_SELF_FILL_CHARACTER_TARGET.min}-${CHARACTER_CREATOR_SELF_FILL_CHARACTER_TARGET.max} characters. Treat the ${CHARACTER_CREATOR_SELF_FILL_CHAR_LIMIT}-character box limit as a target limit, not a reason to cut off or omit a complete reply.`,
    'Avoid secret ancestry, hidden powers, severe trauma hooks, criminal histories, universally admired characters, or impossible competence unless the player already supplied that idea.',
    'Required shape:',
    '{"kind":"directive.characterCreatorSectionDraftResult","sectionId":"identity|service|personality|review","mode":"create|refine","fields":{"field.path":"value"},"notes":[],"warnings":[]}',
    '',
    JSON.stringify(snapshot, null, 2)
  ].join('\n');
}

export function buildCharacterCreatorSectionDraftRequest({
  packageData,
  creatorView = null,
  sectionId,
  input = {}
} = {}) {
  const id = requireSectionId(sectionId);
  const context = createCharacterCreationContext(packageData);
  const mode = modeForSection(input, id);
  const snapshot = {
    kind: 'directive.characterCreatorSectionDraftRequest',
    sectionId: id,
    mode,
    package: cloneJson(context.package),
    campaign: cloneJson(context.campaign),
    campaignContext: cloneJson(context.campaignContext),
    ship: cloneJson(context.ship),
    role: {
      mode: context.roleMode,
      lockedRole: cloneJson(context.lockedRole),
      selectableRoles: cloneJson(context.selectableRoles)
    },
    sectionFields: cloneJson(SECTION_FIELDS[id]),
    textFields: SECTION_FIELDS[id].filter((path) => !allowedIdsForField(context, path)),
    selfFillTextFields: SECTION_FIELDS[id].filter((path) => isSelfFillField(path)),
    selfFillCharacterTarget: cloneJson(CHARACTER_CREATOR_SELF_FILL_CHARACTER_TARGET),
    fieldLimits: Object.fromEntries(SECTION_FIELDS[id]
      .filter((path) => FIELD_LIMITS[path])
      .map((path) => [path, FIELD_LIMITS[path]])),
    allowedOptions: allowedOptionsForSection(context, id),
    priorSections: priorSectionInputs(input, id),
    currentSection: pickSectionInput(input, id),
    generationRules: redactHiddenTerms(creatorView?.generationRules || context.generationRules || {}),
    continuityGuardrails: redactHiddenTerms(creatorView?.continuityGuardrails || context.continuityGuardrails || [])
  };
  const prompt = createPrompt(snapshot);
  return {
    context,
    snapshot,
    request: {
      kind: 'directive.characterCreatorSectionDraftRequest',
      sectionId: id,
      mode,
      prompt,
      messages: [
        {
          role: 'system',
          content: 'Return player-safe structured JSON for one Directive Character Creator section.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      parameters: cloneJson(CREATOR_ASSIST_PARAMETERS),
      modelPreferences: cloneJson(CREATOR_ASSIST_MODEL_PREFERENCES),
      structuredOutput: true,
      jsonSchema: cloneJson(CHARACTER_CREATOR_SECTION_DRAFT_JSON_SCHEMA)
    }
  };
}

export async function runCharacterCreatorSectionDraft({
  packageData,
  creatorView = null,
  sectionId,
  input = {},
  generationRouter = null,
  useProvider = true,
  signal = null,
  onProgress = null
} = {}) {
  const id = requireSectionId(sectionId);
  const { context, snapshot, request } = buildCharacterCreatorSectionDraftRequest({
    packageData,
    creatorView,
    sectionId: id,
    input
  });
  const mode = snapshot.mode;

  if (!useProvider || typeof generationRouter?.generate !== 'function') {
    return {
      ...createFallbackResult({
        context,
        sectionId: id,
        mode,
        input,
        warnings: useProvider && typeof generationRouter?.generate !== 'function'
          ? ['Character Creator provider unavailable; used local fallback.']
          : []
      }),
      requestSnapshot: cloneJson(snapshot)
    };
  }

  const providerAttempt = await generateSectionDraftWithProviderFallback(generationRouter, request, {
    signal,
    onProgress,
    acceptGenerationResult: (candidateResult) => {
      const payload = parseProviderResponse(candidateResult.response || {});
      const leak = unsafeGeneratedTerm(payload, input);
      if (leak) {
        const error = new Error(`Provider output included unsafe Character Creator content: ${leak}.`);
        error.code = 'DIRECTIVE_CHARACTER_CREATOR_ASSIST_UNSAFE_OUTPUT';
        error.hiddenLeakTerm = leak;
        throw error;
      }
      return normalizeProviderPayload({
        payload,
        sectionId: id,
        context,
        input,
        generationResult: candidateResult
      });
    }
  });
  const generationResult = providerAttempt?.generationResult || providerAttempt;
  if (providerAttempt?.assistResult) {
    return {
      ...providerAttempt.assistResult,
      requestSnapshot: cloneJson(snapshot)
    };
  }
  if (isGenerationCanceledResult(generationResult)) {
    return {
      ...createCanceledResult({
        sectionId: id,
        mode,
        diagnostics: {
          ...providerDiagnosticsFromGenerationResult(generationResult)
        }
      }),
      requestSnapshot: cloneJson(snapshot)
    };
  }
  if (!generationResult?.ok) {
    return {
      ...createFallbackResult({
        context,
        sectionId: id,
        mode,
        input,
        warnings: [generationResult?.error?.message || 'Character Creator provider unavailable; used local fallback.'],
        diagnostics: {
          providerUsed: true,
          providerOutputRejected: true,
          ...providerDiagnosticsFromGenerationResult(generationResult)
        }
      }),
      requestSnapshot: cloneJson(snapshot)
    };
  }
}
