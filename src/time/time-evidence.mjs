const DURATION_QUANTITY = '(?:\\d+(?:\\.\\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|half(?: an?)?|quarter(?: of an?)?)';
const DURATION_UNIT = '(?:seconds?|minutes?|hours?|days?|weeks?)';
const DURATION_EXPRESSION = `${DURATION_QUANTITY}\\s+(?:(?:more|additional)\\s+)?${DURATION_UNIT}`;
const EXPLICIT_DURATION = new RegExp(`\\b${DURATION_EXPRESSION}\\b`, 'i');
const RELATIVE_SCENE_CUT = /\b(?:(?:next|following)\s+(?:morning|afternoon|evening|night|day|week)|overnight|(?:seconds?|minutes?|hours?|days?|weeks?)\s+later|later\s+(?:that|the same)\s+(?:morning|afternoon|evening|night|day))\b/i;
const CLOCK_ANCHOR = /\bat\s+(?:(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?|(?:[01]\d|2[0-3])[0-5]\d)\b/i;
const NON_ENACTED_PREFIX = /\b(?:if|unless|not|never|cannot|can['’]t|could|might|should|will|would|refuse[ds]?|decline[ds]?|won['’]t|wouldn['’]t|don['’]t|doesn['’]t|didn['’]t|do\s+not|whether|hypothetical(?:ly)?|plan(?:ned|ning|s)?|schedul(?:e|ed|es|ing)|estimate[ds]?|yesterday|previously|earlier|last\s+(?:night|morning|week|day))\b/i;
const PAST_SUFFIX = /^\s*(?:ago\b|yesterday\b|last\s+(?:night|morning|week|day)\b)/i;
const NON_ENACTED_SUFFIX = /^\s*(?:if|unless|when|tomorrow|provided|assuming)\b/i;
const DIRECT_CONDITIONAL_SUFFIX = /^\s*(?:[,([]\s*)*(?:only\s+)?(?:if|unless|when|provided|assuming)\b/i;
const DIRECT_FUTURE_SUFFIX = /^\s*,?\s*(?:i|we)\s+(?:will|would|could|might|should)\b/i;
const SENTENCE_LEADING_EXCLUSION = /^\s*(?:if|unless|yesterday|previously|earlier|last\s+(?:night|morning|week|day))\b/i;
const PLAYER_DURATION_ACTION = new RegExp(`^(?:so\\s+)?(?:i|we)\\s+(?:wait|spend|rest|sleep|work|travel|remain|stay|delay|pause)\\b[^.!?;,]{0,48}\\b${DURATION_EXPRESSION}\\b`, 'i');
const PLAYER_TEMPORAL_LEAD = new RegExp(`^(?:after\\s+${DURATION_EXPRESSION}|${DURATION_EXPRESSION}\\s+later|(?:the\\s+)?(?:next|following)\\s+(?:morning|afternoon|evening|night|day|week)|overnight|at\\s+(?:(?:[01]?\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?|(?:[01]\\d|2[0-3])[0-5]\\d))\\b`, 'i');

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
  sourceText = '', evidenceQuote = '', requirePlayerEnactment = false
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
  if (clause.text.includes('?')) return { ok: false, reasonCode: 'duration-evidence-question', context: clause.text };
  if (NON_ENACTED_PREFIX.test(prefix)
    || PAST_SUFFIX.test(suffix)
    || NON_ENACTED_SUFFIX.test(suffix)
    || DIRECT_CONDITIONAL_SUFFIX.test(directSuffix)
    || DIRECT_FUTURE_SUFFIX.test(directSuffix)) {
    return { ok: false, reasonCode: 'duration-evidence-not-enacted', context: clause.text };
  }
  if (requirePlayerEnactment) {
    const playerClause = stripLeadingRoleplayWrapper(clause.text);
    const playerSentence = stripLeadingRoleplayWrapper(sentence.text);
    if (SENTENCE_LEADING_EXCLUSION.test(playerSentence)
      || (!PLAYER_DURATION_ACTION.test(playerClause) && !PLAYER_TEMPORAL_LEAD.test(playerClause))) {
      return { ok: false, reasonCode: 'duration-evidence-not-enacted-by-player', context: clause.text };
    }
  }
  return { ok: true, reasonCode: null, context: clause.text };
}
