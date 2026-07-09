import { stripCampaignReplyHeader } from './campaign-time-header.mjs';
import {
  resolveElapsedMinutes,
  resolveOpeningMinuteOfDay
} from './campaign-time-state.mjs';

export const TIME_ADVANCE_ADJUDICATOR_ROLE_ID = 'timeAdvanceAdjudicator';
export const TIME_ADVANCE_PROPOSAL_KIND = 'directive.timeAdvanceProposal.v1';

const DAY_MINUTES = 1440;

const NUMBER_WORD_VALUES = Object.freeze({
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90
});

const NUMBER_WORD_PATTERN = [
  'a',
  'an',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty(?:[-\\s]+(?:one|two|three|four|five|six|seven|eight|nine))?',
  'thirty(?:[-\\s]+(?:one|two|three|four|five|six|seven|eight|nine))?',
  'forty(?:[-\\s]+(?:one|two|three|four|five|six|seven|eight|nine))?',
  'fifty(?:[-\\s]+(?:one|two|three|four|five|six|seven|eight|nine))?',
  'sixty(?:[-\\s]+(?:one|two|three|four|five|six|seven|eight|nine))?',
  'seventy(?:[-\\s]+(?:one|two|three|four|five|six|seven|eight|nine))?',
  'eighty(?:[-\\s]+(?:one|two|three|four|five|six|seven|eight|nine))?',
  'ninety(?:[-\\s]+(?:one|two|three|four|five|six|seven|eight|nine))?'
].join('|');

const DURATION_AMOUNT_PATTERN = `(?:\\d+(?:\\.\\d+)?|${NUMBER_WORD_PATTERN})`;

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compact(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function clamp(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, numeric));
}

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (const char of String(text || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function normalizeMinute(value) {
  const numeric = numberOrNull(value);
  if (numeric === null) return null;
  const minutes = Math.round(numeric);
  return ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
}

function currentMinuteOfDay(campaignState = {}) {
  const opening = resolveOpeningMinuteOfDay(campaignState) ?? 0;
  return normalizeMinute(opening + resolveElapsedMinutes(campaignState)) ?? 0;
}

function cleanText(value = '') {
  return stripCampaignReplyHeader(String(value || ''))
    .replace(/\r/g, '')
    .trim();
}

function textBundle(input = {}) {
  const previous = cleanText(input.previousAssistantText || input.previousAssistant?.text || '');
  const player = cleanText(input.currentPlayerText || input.currentPlayer?.text || input.playerText || '');
  const outcome = cleanText(input.outcomeText || input.assistantText || '');
  return {
    previous,
    player,
    outcome,
    combined: [previous, player, outcome].filter(Boolean).join('\n\n')
  };
}

function durationFromMatch(match = []) {
  const amount = durationAmount(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = String(match[2] || '').toLowerCase();
  if (unit.startsWith('week')) return Math.round(amount * DAY_MINUTES * 7);
  if (unit.startsWith('day')) return Math.round(amount * DAY_MINUTES);
  if (unit.startsWith('hour') || unit === 'hr' || unit === 'hrs') return Math.round(amount * 60);
  return Math.round(amount);
}

function durationAmount(value = '') {
  const numeric = numberOrNull(value);
  if (numeric !== null) return numeric;
  const words = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return null;
  let total = 0;
  for (const word of words) {
    const next = NUMBER_WORD_VALUES[word];
    if (!Number.isFinite(next)) return null;
    total += next;
  }
  return total > 0 ? total : null;
}

function explicitDurationMinutes(text = '') {
  const daySequence = [];
  for (const match of text.matchAll(/\bday\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)(?:\s+and\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten))?\b/gi)) {
    for (const value of [match[1], match[2]]) {
      const amount = durationAmount(value);
      if (Number.isFinite(amount) && amount > 0) daySequence.push(amount);
    }
  }
  if (daySequence.length >= 2) return Math.max(...daySequence) * DAY_MINUTES;

  const patterns = [
    new RegExp(`\\b(?:cut|skip|jump|advance|move)\\s+ahead\\s+(?:about\\s+|roughly\\s+|around\\s+)?(${DURATION_AMOUNT_PATTERN})\\s*(minutes?|mins?|hours?|hrs?|days?|weeks?)\\b`, 'i'),
    new RegExp(`\\b(?:wait|waiting|spend|spends|spent|take|takes|took|after)\\s+(?:about\\s+|roughly\\s+|around\\s+|full\\s+)?(${DURATION_AMOUNT_PATTERN})\\s*(minutes?|mins?|hours?|hrs?|days?|weeks?)\\b`, 'i'),
    new RegExp(`\\b(${DURATION_AMOUNT_PATTERN})\\s*(minutes?|mins?|hours?|hrs?|days?|weeks?)\\s+(?:later|pass|passes|passed)\\b`, 'i'),
    new RegExp(`\\b(?:requiring|required|requires|spanning|spans|covered|covering)\\s+(?:about\\s+|roughly\\s+|around\\s+)?(${DURATION_AMOUNT_PATTERN})\\s*(full\\s+)?(days?|weeks?)\\b`, 'i')
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return durationFromMatch(match[3] ? [match[0], match[1], match[3]] : match);
  }
  return null;
}

function targetMinuteFromText(text = '') {
  const lower = text.toLowerCase();
  const namedTargets = [
    { pattern: /\b(?:dinner|evening meal)\b/, minute: 18 * 60 },
    { pattern: /\b(?:breakfast|morning meal)\b/, minute: 7 * 60 + 30 },
    { pattern: /\blunch\b/, minute: 12 * 60 },
    { pattern: /\b(?:end of shift|shift change)\b/, minute: 16 * 60 },
    { pattern: /\b(?:evening|tonight)\b/, minute: 18 * 60 },
    { pattern: /\b(?:next morning|tomorrow morning)\b/, minute: 8 * 60, nextDay: true },
    { pattern: /\btomorrow\b/, minute: 8 * 60, nextDay: true }
  ];
  for (const target of namedTargets) {
    if (target.pattern.test(lower)) return target;
  }
  const explicit = lower.match(/\b(?:at|until|by|to)\s+([01]?\d|2[0-3])(?::?([0-5]\d))\s*(?:hours?)?\b/);
  if (explicit) {
    return {
      minute: Number(explicit[1]) * 60 + Number(explicit[2]),
      nextDay: /\b(?:tomorrow|next day|next morning)\b/.test(lower)
    };
  }
  return null;
}

function hasExplicitSceneCut(text = '') {
  return /\b(?:cut|skip|jump|fast[-\s]*forward|advance|move)\s+(?:ahead\s+)?(?:to|until)\b/i.test(text)
    || /\b(?:hours?|minutes?)\s+later\b/i.test(text);
}

function hasDeadlineCue(text = '') {
  return /\b(?:by|before|due|deadline|deadlines|expect|expects|expected|draft|drafts|completed|complete|as soon as reasonably possible|no later than)\b/i.test(text);
}

function minutesUntilTarget(currentMinute, target) {
  if (!target) return null;
  const targetMinute = normalizeMinute(target.minute);
  if (targetMinute === null) return null;
  if (target.nextDay) return (DAY_MINUTES - currentMinute) + targetMinute;
  const delta = targetMinute - currentMinute;
  return delta > 0 ? delta : 0;
}

function hasAny(text, patterns = []) {
  return patterns.some((pattern) => pattern.test(text));
}

function deterministicProposal(input = {}) {
  const texts = textBundle(input);
  const combined = texts.combined.toLowerCase();
  if (!combined) return zeroProposal(input, 'empty-source');

  const currentMinute = currentMinuteOfDay(input.campaignState);
  const explicitDuration = explicitDurationMinutes(combined);
  if (explicitDuration !== null) {
    return proposal(input, {
      elapsedMinutes: explicitDuration,
      reason: hasAny(combined, [/\brest\b/, /\bsleep\b/]) ? 'rest' : 'explicit-duration',
      confidence: 0.96,
      source: 'deterministic',
      evidence: 'explicit-duration'
    });
  }

  const target = targetMinuteFromText(combined);
  const explicitSceneCut = hasExplicitSceneCut(combined);
  if (explicitSceneCut && target) {
    return proposal(input, {
      elapsedMinutes: minutesUntilTarget(currentMinute, target),
      reason: 'scene-cut',
      confidence: 0.94,
      source: 'deterministic',
      evidence: 'explicit-target-time'
    });
  }
  if (target) {
    return {
      ...proposal(input, {
        elapsedMinutes: 0,
        reason: hasDeadlineCue(combined) ? 'deadline-reference' : 'target-time-reference',
        confidence: hasDeadlineCue(combined) ? 0.86 : 0.52,
        source: 'deterministic',
        evidence: hasDeadlineCue(combined) ? 'future-deadline-not-elapsed-time' : 'target-time-reference'
      }),
      needsModel: !hasDeadlineCue(combined)
    };
  }

  const readingWork = hasAny(combined, [
    /\b(?:read|reads|review|reviews|study|studies|skim|skims|open|opens)\b.{0,80}\b(?:briefing|packet|report|reports|dossier|logs?|manifest|orders)\b/i,
    /\b(?:briefing packet|mission packet|orders packet|service record)\b/i
  ]);
  if (readingWork) {
    return proposal(input, {
      elapsedMinutes: 10,
      reason: 'shipboard-review',
      confidence: 0.78,
      source: 'deterministic',
      evidence: 'brief-review-work'
    });
  }

  const shipboardMovement = hasAny(combined, [
    /\b(?:walk|walks|head|heads|go|goes|lead|leads|make(?:s)? (?:his|her|their|your)? ?way|escort|escorts|step|steps|arrive|arrives|reach|reaches|leave|leaves)\b.{0,120}\b(?:bridge|ready room|quarters|shuttlebay|shuttle bay|engineering|sickbay|corridor|turbolift|conference room|briefing room|deck)\b/i,
    /\b(?:bridge|ready room|quarters|shuttlebay|shuttle bay|engineering|sickbay|turbolift)\b.{0,120}\b(?:walk|head|lead|arrive|reach|enter|step)\b/i
  ]);
  if (shipboardMovement) {
    return proposal(input, {
      elapsedMinutes: 5,
      reason: 'intra-ship-transition',
      confidence: 0.72,
      source: 'deterministic',
      evidence: 'shipboard-movement'
    });
  }

  const ambiguousTime = hasAny(combined, [
    /\b(?:a while|some time|later|eventually|afterward|afterwards|long enough|takes time|settle in|work on|briefing begins|meeting begins)\b/i
  ]);
  if (ambiguousTime) {
    return {
      ...proposal(input, {
        elapsedMinutes: 0,
        reason: 'ambiguous-time',
        confidence: 0.4,
        source: 'deterministic',
        evidence: 'ambiguous-time-cue'
      }),
      needsModel: true
    };
  }

  return zeroProposal(input, 'no-time-boundary');
}

function zeroProposal(input = {}, evidence = 'no-time-boundary') {
  return proposal(input, {
    elapsedMinutes: 0,
    reason: 'no-time-advance',
    confidence: 0.9,
    source: 'deterministic',
    evidence
  });
}

function proposal(input = {}, patch = {}) {
  const texts = textBundle(input);
  const sourceAnchorRange = cloneJson(input.sourceAnchorRange || null);
  const evidenceMessageIds = [
    input.previousAssistantHostMessageId || input.previousAssistant?.hostMessageId || null,
    input.currentPlayerHostMessageId || input.currentPlayer?.hostMessageId || null,
    input.outcomeHostMessageId || null
  ].filter(Boolean);
  return {
    kind: TIME_ADVANCE_PROPOSAL_KIND,
    id: `time-advance:${fnv1a([texts.previous, texts.player, texts.outcome, patch.reason].join('\n'))}`,
    elapsedMinutes: Math.max(0, Math.round(Number(patch.elapsedMinutes || 0))),
    reason: patch.reason || 'time-advance',
    confidence: clamp(patch.confidence ?? 0.5, 0, 1),
    source: patch.source || 'deterministic',
    evidence: patch.evidence || null,
    sourceAnchorRange,
    evidenceMessageIds,
    sourceTextHashes: {
      previousAssistant: texts.previous ? fnv1a(texts.previous) : null,
      currentPlayer: texts.player ? fnv1a(texts.player) : null,
      outcome: texts.outcome ? fnv1a(texts.outcome) : null
    },
    needsModel: patch.needsModel === true,
    clamped: false
  };
}

function normalizeHostMessageId(value) {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

function boundaryCurrentPlayerHostMessageId(boundary = {}) {
  const anchors = [
    boundary?.sourceAnchorRange,
    boundary?.adjudication?.sourceAnchorRange,
    boundary?.metadata?.sourceAnchorRange
  ];
  for (const anchor of anchors) {
    const id = normalizeHostMessageId(anchor?.currentPlayerHostMessageId);
    if (id) return id;
  }
  return null;
}

export function findTimeBoundaryForPlayerMessage(campaignState = {}, hostMessageId = null) {
  const id = normalizeHostMessageId(hostMessageId);
  if (!id) return null;
  const ledger = campaignState?.timeLedger || {};
  const candidates = [
    ...(Array.isArray(ledger.entries) ? ledger.entries : []),
    ledger.lastBoundary
  ].filter(Boolean);
  return candidates.find((boundary) => {
    if (Number(boundary?.elapsedMinutes || 0) <= 0) return false;
    return boundaryCurrentPlayerHostMessageId(boundary) === id;
  }) || null;
}

function maxMinutesForReason(reason = '') {
  const key = String(reason || '').toLowerCase();
  if (key.includes('scene-cut')) return DAY_MINUTES;
  if (key.includes('rest')) return 12 * 60;
  if (key.includes('review')) return 60;
  if (key.includes('transition')) return 20;
  if (key.includes('explicit-duration')) return DAY_MINUTES;
  if (key.includes('routine')) return 20;
  return 60;
}

function validatedProposal(input = {}, raw = {}) {
  const base = proposal(input, {
    elapsedMinutes: raw.elapsedMinutes ?? raw.minutes ?? raw.durationMinutes ?? 0,
    reason: raw.reason || raw.category || 'model-adjudicated-time',
    confidence: raw.confidence ?? 0.5,
    source: raw.source || 'utility-model',
    evidence: raw.evidence || raw.rationale || null
  });
  const max = maxMinutesForReason(base.reason);
  const elapsedMinutes = Math.round(clamp(base.elapsedMinutes, 0, max));
  return {
    ...base,
    elapsedMinutes,
    confidence: clamp(base.confidence, 0, 0.9),
    source: raw.source || 'utility-model',
    clamped: elapsedMinutes !== base.elapsedMinutes,
    modelRaw: cloneJson(raw)
  };
}

function parseJsonObject(text = '') {
  const source = String(text || '').trim();
  if (!source) return null;
  try {
    return JSON.parse(source);
  } catch {
    const match = source.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function modelRequest(input = {}, deterministic = {}) {
  const texts = textBundle(input);
  const safe = {
    kind: 'directive.timeAdvanceAdjudicationRequest.v1',
    current: {
      stardate: input.campaignState?.worldState?.currentStardate ?? input.campaignState?.campaign?.currentStardate ?? null,
      openingMinuteOfDay: resolveOpeningMinuteOfDay(input.campaignState),
      elapsedMinutes: resolveElapsedMinutes(input.campaignState),
      currentMinuteOfDay: currentMinuteOfDay(input.campaignState)
    },
    source: {
      previousAssistant: texts.previous,
      currentPlayer: texts.player,
      outcome: texts.outcome,
      sourceAnchorRange: cloneJson(input.sourceAnchorRange || null)
    },
    deterministic
  };
  const systemPrompt = [
    'You are Directive Time Advance Adjudicator, a Utility-lane estimator.',
    'Use only the provided visible text and current clock summary.',
    'Return a bounded time delta in minutes. Do not write state and do not recalculate the header.',
    'Good conversations may consume zero minutes; only advance time when the source text implies waiting, travel, work, rest, or a scene cut.',
    'Future due dates, deadlines, appointments, promises, or orders such as "by tomorrow morning" do not advance the current scene clock unless the source also says the scene waits, sleeps, travels, or cuts to that later time.',
    'Return strict JSON: {"kind":"directive.timeAdvanceProposal.v1","elapsedMinutes":0,"reason":"no-time-advance","confidence":0.0,"rationale":"..."}'
  ].join('\n');
  const prompt = [
    'Adjudicate elapsed in-universe time for this accepted source pair.',
    JSON.stringify(safe, null, 2)
  ].join('\n\n');
  return {
    systemPrompt,
    prompt,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ],
    structuredOutput: true,
    metadata: {
      source: 'time-advance-adjudicator',
      sourceAnchorRange: cloneJson(input.sourceAnchorRange || null)
    },
    parameters: {
      temperature: 0,
      top_p: 1,
      max_tokens: 700
    }
  };
}

export async function adjudicateTimeAdvance(input = {}) {
  if (input.acceptedPreviousResponse === false) return zeroProposal(input, 'not-accepted');
  const deterministic = deterministicProposal(input);
  if (!deterministic.needsModel || !input.generationRouter?.generate) {
    return { ...deterministic, needsModel: false };
  }
  let generation = null;
  try {
    generation = await input.generationRouter.generate(
      TIME_ADVANCE_ADJUDICATOR_ROLE_ID,
      modelRequest(input, deterministic),
      { timeoutMs: 15000 }
    );
  } catch (error) {
    return {
      ...deterministic,
      needsModel: false,
      modelError: {
        code: error?.code || 'DIRECTIVE_TIME_ADJUDICATOR_THROW',
        message: error?.message || String(error)
      }
    };
  }
  const text = compact(
    generation?.response?.text
      || generation?.response?.content
      || generation?.text
      || generation?.content
      || ''
  );
  const parsed = parseJsonObject(text);
  if (!generation?.ok || !parsed || parsed.kind !== TIME_ADVANCE_PROPOSAL_KIND) {
    return {
      ...deterministic,
      needsModel: false,
      modelError: generation?.error || { code: 'DIRECTIVE_TIME_ADJUDICATOR_PARSE_FAILED', message: 'Time adjudicator returned no valid proposal.' }
    };
  }
  return {
    ...validatedProposal(input, parsed),
    needsModel: false,
    generation: {
      ok: generation.ok === true,
      roleId: generation.roleId || TIME_ADVANCE_ADJUDICATOR_ROLE_ID,
      providerId: generation.diagnostics?.providerId || generation.response?.providerId || null,
      model: generation.diagnostics?.model || generation.response?.model || null,
      latencyMs: generation.diagnostics?.latencyMs ?? null
    }
  };
}

export const __timeAdvanceAdjudicatorTestHooks = Object.freeze({
  deterministicProposal,
  findTimeBoundaryForPlayerMessage,
  modelRequest,
  validatedProposal,
  currentMinuteOfDay
});
