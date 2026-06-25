import { assertProviderResponseText } from '../providers/provider-response-normalizer.mjs';
import { parseStructuredJsonText } from '../providers/structured-output-parser.mjs';

export const COMMAND_BEARING_FIT_CHECK_ROLE_ID = 'commandBearingFitChecker';
export const COMMAND_BEARING_SPEND_VALIDATOR_ROLE_ID = 'commandBearingSpendValidator';

const TRACKS = new Set(['inspiration', 'resolve']);
const FIT_LABELS = new Set(['strong', 'plausible', 'thin', 'mismatch', 'notConsequential']);
const ACCEPTED_SPEND_FITS = new Set(['strong', 'plausible']);

const TRACK_DEFINITIONS = Object.freeze({
  inspiration: 'Inspiration is leadership through trust, shared purpose, transparency, dignity, mentorship, and voluntary cooperation.',
  resolve: 'Resolve is leadership through lawful authority, preparation, credible boundaries, discipline, and accepted responsibility.'
});

const FIT_PARAMETERS = Object.freeze({
  temperature: 0.1,
  max_tokens: 800
});

const FIT_MODEL_PREFERENCES = Object.freeze({
  cost: 'low',
  latency: 'fast',
  capability: 'utility-reasoning'
});
const HIDDEN_STATE_PATTERNS = Object.freeze([
  /\bdirector[-\s]?only\b/i,
  /\bhidden\s+(?:truth|state|score|fact|note|value|delta|memory)\b/i,
  /\bhidden\s+relationship\s+(?:score|value|delta|memory)\b/i,
  /\bunrevealed\s+(?:truth|fact|state|score|note|memory)\b/i,
  /\bsecret\s+(?:score|truth|fact|value|note|memory)\b/i,
  /\braw\s+(?:relationship|provider|model|score|value|delta|output)\b/i,
  /\bprivate\s+(?:npc|character)\s+(?:thought|thoughts|motive|motives|feeling|feelings)\b/i
]);

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === undefined || value === null) return [];
  return [value];
}

function compact(value = '', maxLength = 700) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function compactList(values = [], maxItems = 6, maxLength = 240) {
  const output = [];
  const seen = new Set();
  for (const value of asArray(values)) {
    const text = compact(typeof value === 'string' ? value : value?.summary || value?.label || value?.id || '', maxLength);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    output.push(text);
    if (output.length >= maxItems) break;
  }
  return output;
}

function textContainsHiddenLeak(value) {
  const text = compact(value, 1200);
  return Boolean(text) && HIDDEN_STATE_PATTERNS.some((pattern) => pattern.test(text));
}

function objectContainsHiddenLeak(value) {
  const queue = [value];
  while (queue.length) {
    const current = queue.shift();
    if (typeof current === 'string' && textContainsHiddenLeak(current)) return true;
    if (Array.isArray(current)) queue.push(...current);
    else if (isObject(current)) queue.push(...Object.values(current));
  }
  return false;
}

function normalizeTrack(track) {
  const key = String(track || '').trim().toLowerCase();
  if (!TRACKS.has(key)) {
    throw new Error(`Unknown Command Bearing track "${track || 'unknown'}".`);
  }
  return key;
}

function trackLabel(track) {
  return track === 'inspiration' ? 'Inspiration' : 'Resolve';
}

function countSignals(text, signals = []) {
  const source = compact(text, 2000).toLowerCase();
  return signals.filter((signal) => source.includes(signal)).length;
}

function commandBearingFitSignals(text = '') {
  return {
    inspiration: countSignals(text, [
      'trust',
      'transparent',
      'transparency',
      'dignity',
      'shared',
      'purpose',
      'cooperate',
      'cooperation',
      'invite',
      'listen',
      'support',
      'reassure',
      'voluntary',
      'consensus',
      'mentor',
      'together'
    ]),
    resolve: countSignals(text, [
      'order',
      'deadline',
      'responsible',
      'responsibility',
      'authority',
      'boundary',
      'accept',
      'accountable',
      'hold',
      'secure',
      'delay',
      'preserve',
      'lawful',
      'contingency',
      'discipline',
      'procedure'
    ])
  };
}

function fitLabelFor({ score, otherScore, text }) {
  if (compact(text).length < 12) return 'notConsequential';
  if (score <= 0 && otherScore > 0) return 'mismatch';
  if (score >= 3) return 'strong';
  if (score >= 2) return 'plausible';
  if (score >= 1) return 'thin';
  return 'mismatch';
}

function tipsForTrack(track) {
  return track === 'inspiration'
    ? [
      'Name the shared purpose.',
      'Be transparent about the risk.',
      'Offer a voluntary path to cooperate.',
      "Preserve the other party's dignity."
    ]
    : [
      'State the authority boundary.',
      'Make the order or deadline specific.',
      'Show what responsibility the player accepts.',
      'Make the consequence credible rather than threatening.'
    ];
}

export function createDeterministicCommandBearingFitResult({
  track,
  action = '',
  inputText = '',
  source = 'deterministic-fit-check',
  diagnostics = {}
} = {}) {
  const key = normalizeTrack(track);
  const signals = commandBearingFitSignals(inputText);
  const score = signals[key];
  const otherTrack = key === 'inspiration' ? 'resolve' : 'inspiration';
  const otherScore = signals[otherTrack];
  const fit = fitLabelFor({ score, otherScore, text: inputText });
  const label = trackLabel(key);
  const otherLabel = trackLabel(otherTrack);
  const tips = tipsForTrack(key);
  const whatWorks = [];
  const missing = [];

  if (key === 'inspiration') {
    if (score > 0) whatWorks.push('The draft has some trust, cooperation, or shared-purpose language.');
    if (!/\b(?:trust|shared|purpose|together|cooperat|voluntary|dignity|transparent)\b/i.test(inputText)) {
      missing.push('The action does not yet clearly rely on trust, shared purpose, transparency, dignity, or voluntary cooperation.');
    }
  } else {
    if (score > 0) whatWorks.push('The draft has some authority, boundary, responsibility, or discipline language.');
    if (!/\b(?:order|authority|boundary|responsib|deadline|accountable|procedure|secure|preserve)\b/i.test(inputText)) {
      missing.push('The action does not yet clearly rely on lawful authority, credible boundaries, preparation, discipline, or accepted responsibility.');
    }
  }
  if (fit === 'notConsequential') {
    missing.push('Write the intended action first; there is not enough here to judge a Command Bearing fit.');
  }
  if (fit === 'mismatch' && otherScore > score) {
    missing.push(`This reads closer to ${otherLabel} than ${label}.`);
  }

  return {
    kind: 'directive.commandBearingFitCheck',
    ok: true,
    source,
    action: action || (key === 'inspiration' ? 'checkInspiration' : 'checkResolve'),
    track: key,
    label: action === 'checkInspiration' ? 'Check Inspiration' : action === 'checkResolve' ? 'Check Resolve' : `${label} Fit`,
    title: `${label} Fit`,
    replacementText: '',
    fit,
    valid: ACCEPTED_SPEND_FITS.has(fit),
    summary: fit === 'strong'
      ? `This is a strong ${label} fit.`
      : fit === 'notConsequential'
        ? 'There is not enough actionable command text to judge yet.'
        : `This is a ${fit} ${label} fit.`,
    whatWorks: whatWorks.length ? whatWorks : ['The draft has a player-authored intent to evaluate.'],
    missing,
    suggestions: tips,
    tip: tips[0],
    causalBasis: whatWorks.length ? whatWorks : [],
    warnings: [],
    usedContext: [
      'current composer text',
      'player role authority',
      'Command Bearing track definitions'
    ],
    diagnostics: {
      providerUsed: false,
      hiddenLeakBlocked: false,
      score,
      otherTrack,
      otherScore,
      ...cloneJson(diagnostics)
    }
  };
}

function fitRequestPrompt({ track, inputText, context = {}, purpose = 'assist' }) {
  const key = normalizeTrack(track);
  const label = trackLabel(key);
  const spendMode = purpose === 'spend';
  return [
    'You are Directive Command Bearing fit evaluator.',
    `Chosen track: ${label}.`,
    TRACK_DEFINITIONS.inspiration,
    TRACK_DEFINITIONS.resolve,
    spendMode
      ? 'This call decides whether a Readied Command Bearing point may be used with the exact player message just sent. You cannot spend points or change state; you only judge fit.'
      : 'This call gives the player a pre-send fit report. You must not rewrite, complete, or improve the player message.',
    'Judge only the player-authored action text and supplied player-safe context.',
    'Do not predict outcomes, write NPC replies, award Marks, reveal hidden state, or mention raw scores.',
    spendMode
      ? 'Set valid true only for strong or plausible fit. Thin, mismatch, and notConsequential are invalid for a spend.'
      : 'Offer brief GM-style feedback. Suggestions must be tips, not replacement prose.',
    'Return JSON only with this shape:',
    '{"kind":"directive.commandBearingFitCheck","track":"inspiration|resolve","fit":"strong|plausible|thin|mismatch|notConsequential","valid":false,"summary":"one sentence","whatWorks":[],"missing":[],"suggestions":[],"causalBasis":[]}',
    '',
    `Player message:\n${compact(inputText, 2200)}`,
    '',
    `Player-safe context:\n${JSON.stringify(context || {}, null, 2)}`
  ].join('\n');
}

export function buildCommandBearingFitCheckRequest({
  track,
  inputText = '',
  context = {},
  purpose = 'assist'
} = {}) {
  const key = normalizeTrack(track);
  const prompt = fitRequestPrompt({ track: key, inputText, context, purpose });
  return {
    prompt,
    messages: [
      {
        role: 'system',
        content: 'Return strict player-safe JSON for a Command Bearing fit check. Do not rewrite player text.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    parameters: cloneJson(FIT_PARAMETERS),
    modelPreferences: cloneJson(FIT_MODEL_PREFERENCES),
    metadata: {
      commandBearingTrack: key,
      purpose
    }
  };
}

function parseFitPayload(response = {}) {
  if (isObject(response?.content)) return cloneJson(response.content);
  if (isObject(response?.json)) return cloneJson(response.json);
  if (isObject(response?.data)) return cloneJson(response.data);
  if (isObject(response?.structuredOutput)) return cloneJson(response.structuredOutput);
  if (isObject(response) && (response.fit || response.summary || response.valid !== undefined)) return cloneJson(response);
  const text = assertProviderResponseText(response, {
    providerTitle: 'Command Bearing fit check',
    maxTokens: FIT_PARAMETERS.max_tokens
  });
  const parsed = parseStructuredJsonText(text);
  if (!parsed.ok) {
    const error = new Error('Provider returned invalid Command Bearing fit JSON.');
    error.code = parsed.diagnostic?.code || 'json_invalid';
    error.details = parsed.diagnostic || null;
    throw error;
  }
  return parsed.value;
}

function normalizeProviderFitResult({
  payload,
  fallback,
  track,
  action = '',
  generationResult = null,
  source = 'provider'
} = {}) {
  if (objectContainsHiddenLeak(payload)) {
    const error = new Error('Provider returned hidden-state language in a Command Bearing fit report.');
    error.code = 'hidden_state_leak';
    throw error;
  }
  const key = normalizeTrack(track);
  const fit = FIT_LABELS.has(payload?.fit) ? payload.fit : fallback.fit;
  const declaredValid = payload?.valid ?? payload?.eligible;
  const valid = declaredValid === false ? false : ACCEPTED_SPEND_FITS.has(fit);
  const summary = compact(payload?.summary, 300) || fallback.summary;
  const suggestions = compactList(payload?.suggestions, 4, 180);
  const whatWorks = compactList(payload?.whatWorks, 4, 220);
  const missing = compactList(payload?.missing, 4, 240);
  const causalBasis = compactList(payload?.causalBasis, 6, 240);
  return {
    ...fallback,
    source,
    action: action || fallback.action,
    track: key,
    title: `${trackLabel(key)} Fit`,
    replacementText: '',
    fit,
    valid,
    summary,
    whatWorks: whatWorks.length ? whatWorks : fallback.whatWorks,
    missing: missing.length ? missing : fallback.missing,
    suggestions: suggestions.length ? suggestions : fallback.suggestions,
    tip: suggestions[0] || fallback.tip,
    causalBasis: causalBasis.length ? causalBasis : fallback.causalBasis,
    warnings: compactList(payload?.warnings, 3, 220),
    usedContext: compactList(payload?.usedContext, 6, 160).length
      ? compactList(payload?.usedContext, 6, 160)
      : fallback.usedContext,
    diagnostics: {
      ...fallback.diagnostics,
      providerUsed: true,
      providerOutputRejected: false,
      providerId: generationResult?.diagnostics?.providerId || null,
      model: generationResult?.diagnostics?.model || null,
      usage: cloneJson(generationResult?.diagnostics?.usage || null)
    }
  };
}

export async function runCommandBearingFitCheck({
  track,
  action = '',
  inputText = '',
  context = {},
  generationRouter = null,
  useProvider = true
} = {}) {
  const key = normalizeTrack(track);
  const fallback = createDeterministicCommandBearingFitResult({
    track: key,
    action,
    inputText
  });
  if (!useProvider || typeof generationRouter?.generate !== 'function') {
    return fallback;
  }
  const request = buildCommandBearingFitCheckRequest({
    track: key,
    inputText,
    context,
    purpose: 'assist'
  });
  const generationResult = await generationRouter.generate(COMMAND_BEARING_FIT_CHECK_ROLE_ID, request);
  if (!generationResult?.ok) {
    return {
      ...fallback,
      diagnostics: {
        ...fallback.diagnostics,
        providerUsed: true,
        providerOutputRejected: true,
        providerError: cloneJson(generationResult?.error || null)
      },
      warnings: ['Command Bearing fit provider was unavailable; used local guidance.']
    };
  }
  try {
    return normalizeProviderFitResult({
      payload: parseFitPayload(generationResult.response || {}),
      fallback,
      track: key,
      action,
      generationResult
    });
  } catch (error) {
    return {
      ...fallback,
      diagnostics: {
        ...fallback.diagnostics,
        providerUsed: true,
        providerOutputRejected: true,
        providerError: {
          code: error?.code || 'provider_fit_invalid',
          message: error?.message || String(error)
        }
      },
      warnings: ['Command Bearing fit provider returned unusable output; used local guidance.']
    };
  }
}

export async function validateCommandBearingReadiedSpendFit({
  track,
  inputText = '',
  context = {},
  generationRouter = null
} = {}) {
  const key = normalizeTrack(track);
  const fallback = createDeterministicCommandBearingFitResult({
    track: key,
    inputText,
    source: 'deterministic-spend-validation'
  });
  if (typeof generationRouter?.generate !== 'function') {
    return {
      ...fallback,
      source: 'provider-unavailable-closed',
      valid: false,
      fit: 'mismatch',
      summary: 'The Command Bearing spend could not be validated, so the point was returned.',
      missing: ['No provider route was available for the required spend validation.'],
      diagnostics: {
        ...fallback.diagnostics,
        providerUsed: false,
        providerOutputRejected: true,
        providerError: {
          code: 'provider_unavailable',
          message: 'Command Bearing spend validation requires a provider route.'
        }
      }
    };
  }
  const request = buildCommandBearingFitCheckRequest({
    track: key,
    inputText,
    context,
    purpose: 'spend'
  });
  const generationResult = await generationRouter.generate(COMMAND_BEARING_SPEND_VALIDATOR_ROLE_ID, request);
  if (!generationResult?.ok) {
    return {
      ...fallback,
      source: 'provider-failed-closed',
      valid: false,
      fit: 'mismatch',
      summary: 'The Command Bearing spend could not be validated, so the point was returned.',
      missing: ['The validation model call did not complete.'],
      diagnostics: {
        ...fallback.diagnostics,
        providerUsed: true,
        providerOutputRejected: true,
        providerError: cloneJson(generationResult?.error || null)
      }
    };
  }
  try {
    return normalizeProviderFitResult({
      payload: parseFitPayload(generationResult.response || {}),
      fallback,
      track: key,
      generationResult,
      source: 'provider-spend-validation'
    });
  } catch (error) {
    return {
      ...fallback,
      source: 'provider-invalid-closed',
      valid: false,
      fit: 'mismatch',
      summary: 'The Command Bearing spend returned an invalid validation report, so the point was returned.',
      missing: ['The validation provider response was not strict fit-check JSON.'],
      diagnostics: {
        ...fallback.diagnostics,
        providerUsed: true,
        providerOutputRejected: true,
        providerError: {
          code: error?.code || 'provider_fit_invalid',
          message: error?.message || String(error)
        }
      }
    };
  }
}

export const __commandBearingFitTestHooks = Object.freeze({
  commandBearingFitSignals,
  fitLabelFor,
  parseFitPayload
});
