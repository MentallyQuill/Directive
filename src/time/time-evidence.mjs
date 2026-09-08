const SMALL_NUMBERS = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ');
const QUANTITY_VALUES = new Map([
  ['a', 1], ['an', 1], ...SMALL_NUMBERS.map((word, index) => [word, index + 1]),
  ['twenty', 20], ['thirty', 30], ['forty', 40], ['fifty', 50], ['sixty', 60], ['seventy', 70], ['eighty', 80], ['ninety', 90],
]);
const QUANTITY_WORD = '(?:' + [...QUANTITY_VALUES.keys(), 'hundred', 'thousand', 'and', 'half', 'quarter', 'of'].join('|') + '|\\d+(?:\\.\\d+)?)';
const DURATION_QUANTITY = QUANTITY_WORD + '(?:[- ]' + QUANTITY_WORD + ')*';
const DURATION_UNIT = '(?:seconds?|minutes?|hours?|days?|weeks?)';
const DURATION_EXPRESSION = DURATION_QUANTITY + '\\s+(?:(?:more|additional)\\s+)?' + DURATION_UNIT;
const EXPLICIT_DURATION = new RegExp('\\b' + DURATION_EXPRESSION + '\\b', 'i');
const UNIT_SECONDS = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800 };

function durationQuantity(raw) {
  const quantity = raw.toLowerCase().replace(/-/g, ' ');
  if (/^(?:a |an )?half(?: of)?(?: a| an)?$/.test(quantity)) return 0.5;
  if (/^(?:a |an )?quarter(?: of)?(?: a| an)?$/.test(quantity)) return 0.25;
  const mixed = quantity.match(/^(.*?) and (?:a |an )?(half|quarter)$/);
  if (mixed) return durationQuantity(mixed[1]) + (mixed[2] === 'half' ? 0.5 : 0.25);
  let total = 0;
  let group = 0;
  for (const word of quantity.split(/\s+/)) {
    if (word === 'and') continue;
    if (word === 'hundred') group = (group || 1) * 100;
    else if (word === 'thousand') { total += (group || 1) * 1000; group = 0; }
    else {
      const value = QUANTITY_VALUES.get(word) ?? Number(word);
      if (!Number.isFinite(value)) return NaN;
      group += value;
    }
  }
  return total + group;
}

// Quantity conversion only. Whether the interval happened is a separate decision.
// Ambiguous ranges/multiple intervals stay with semantic interpretation, never a
// partial deterministic conversion (e.g. one component of concurrent work).
export function explicitDurationSeconds(quote = '') {
  const text = String(quote);
  if (/\d\s*[-–—]\s*\d/.test(text)
    || new RegExp('\\b' + QUANTITY_WORD + '\\s+to\\s+' + QUANTITY_WORD + '\\b', 'i').test(text)) return null;
  if (/\b(?:about|around|roughly|approximately|nearly|almost|at least|at most|up to|between|or|million|billion)\b/i.test(text)) return null;
  const matches = [...text.matchAll(new RegExp('\\b(' + DURATION_QUANTITY + ')\\s+(?:(?:more|additional)\\s+)?(' + DURATION_UNIT + ')\\b', 'gi'))];
  if (matches.length !== 1) return null;
  const match = matches[0];
  let amount = durationQuantity(match[1]);
  const suffix = text.slice(match.index + match[0].length).match(/^\s+and (?:a |an )?(half|quarter)\b/i);
  if (suffix) amount += suffix[1].toLowerCase() === 'half' ? 0.5 : 0.25;
  const seconds = amount * UNIT_SECONDS[match[2].toLowerCase().replace(/s$/, '')];
  return Number.isInteger(seconds) && seconds > 0 ? seconds : null;
}
const RELATIVE_SCENE_CUT = /\b(?:(?:next|following)\s+(?:morning|afternoon|evening|night|day|week)|overnight|(?:seconds?|minutes?|hours?|days?|weeks?)\s+later|later\s+(?:that|the same)\s+(?:morning|afternoon|evening|night|day))\b/i;
const CLOCK_ANCHOR = /\b(?:at|until|by)\s+(?:(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?|(?:[01]\d|2[0-3])[0-5]\d)\b/i;
const NON_ENACTED_PREFIX = /\b(?:if|unless|not|never|cannot|can['’]t|could|might|should|will|would|refuse[ds]?|decline[ds]?|won['’]t|wouldn['’]t|don['’]t|doesn['’]t|didn['’]t|do\s+not|whether|hypothetical(?:ly)?|plan(?:ned|ning|s)?|schedul(?:e|ed|es|ing)|estimate[ds]?|yesterday|previously|earlier|last\s+(?:night|morning|week|day))\b/i;
const PAST_SUFFIX = /^\s*(?:ago\b|yesterday\b|last\s+(?:night|morning|week|day)\b)/i;
const NON_ENACTED_SUFFIX = /^\s*(?:if|unless|when|tomorrow|provided|assuming)\b/i;
const DIRECT_CONDITIONAL_SUFFIX = /^\s*(?:[,([]\s*)*(?:only\s+)?(?:if|unless|when|provided|assuming)\b/i;
const DIRECT_FUTURE_SUFFIX = /^\s*,?\s*(?:i|we)\s+(?:will|would|could|might|should)\b/i;
const SENTENCE_LEADING_EXCLUSION = /^\s*(?:if|unless|yesterday|previously|earlier|last\s+(?:night|morning|week|day))\b/i;

export function normalizeTimeEvidence(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function stripLeadingRoleplayWrapper(value = '') {
  return String(value).replace(/^[\s>*_~"'“‘—-]+/, '');
}

function sourceEvidenceLocation(sourceText, evidenceQuote) {
  const source = normalizeTimeEvidence(sourceText);
  const quote = normalizeTimeEvidence(evidenceQuote);
  const index = source.indexOf(quote);
  return index < 0 ? null : { source, quote, index };
}

function temporalAnchorInQuote(quote) {
  return [EXPLICIT_DURATION, RELATIVE_SCENE_CUT, CLOCK_ANCHOR]
    .map((pattern) => quote.match(pattern))
    .filter(Boolean)
    .sort((left, right) => left.index - right.index)[0] || null;
}

function containingRange(source, anchorIndex, anchorLength, boundaries) {
  const preceding = source.slice(0, anchorIndex);
  const start = Math.max(...boundaries.map((mark) => preceding.lastIndexOf(mark))) + 1;
  const following = source.slice(anchorIndex + anchorLength);
  const boundaryOffsets = boundaries
    .map((mark) => following.indexOf(mark))
    .filter((offset) => offset >= 0);
  const end = boundaryOffsets.length > 0
    ? anchorIndex + anchorLength + Math.min(...boundaryOffsets) + 1
    : source.length;
  return { text: source.slice(start, end).trim(), start };
}

export function inspectEnactedDurationEvidence({
  sourceText = '', evidenceQuote = ''
} = {}) {
  const location = sourceEvidenceLocation(sourceText, evidenceQuote);
  if (!location?.quote) return { ok: false, reasonCode: 'duration-evidence-not-in-source', context: null };
  const anchor = temporalAnchorInQuote(location.quote);
  if (!anchor) return { ok: false, reasonCode: 'duration-evidence-temporal-anchor-missing', context: location.quote };
  const sourceAnchorIndex = location.index + anchor.index;
  const sentence = containingRange(location.source, sourceAnchorIndex, anchor[0].length, ['.', '!', '?', ';']);
  const clause = containingRange(location.source, sourceAnchorIndex, anchor[0].length, ['.', '!', '?', ';', ',']);
  const anchorOffset = sourceAnchorIndex - clause.start;
  const prefix = clause.text.slice(0, anchorOffset);
  const suffix = clause.text.slice(anchorOffset + anchor[0].length);
  const directSuffix = location.source.slice(sourceAnchorIndex + anchor[0].length);
  const sentenceText = stripLeadingRoleplayWrapper(sentence.text);
  const clauseText = stripLeadingRoleplayWrapper(clause.text);
  // Retain exclusions across a comma without requiring an action verb or
  // first-person subject. A later independent action can still be enacted.
  if (SENTENCE_LEADING_EXCLUSION.test(sentenceText)
    || (/^(?:do|does|did)\b/i.test(clauseText) && sentence.text.includes('?'))
    || (/^(?:and\s+)?then\b/i.test(clauseText)
      && !/^(?:and\s+)?then\s+(?:i|we|you|he|she|they|the)\b/i.test(clauseText)
      && NON_ENACTED_PREFIX.test(sentence.text.slice(0, sourceAnchorIndex - sentence.start)))) {
    return { ok: false, reasonCode: 'duration-evidence-not-enacted', context: sentence.text };
  }
  if (clause.text.includes('?')) return { ok: false, reasonCode: 'duration-evidence-question', context: clause.text };
  if (NON_ENACTED_PREFIX.test(prefix)
    || PAST_SUFFIX.test(suffix)
    || NON_ENACTED_SUFFIX.test(suffix)
    || DIRECT_CONDITIONAL_SUFFIX.test(directSuffix)
    || DIRECT_FUTURE_SUFFIX.test(directSuffix)) {
    return { ok: false, reasonCode: 'duration-evidence-not-enacted', context: clause.text };
  }
  return { ok: true, reasonCode: null, context: clause.text };
}
