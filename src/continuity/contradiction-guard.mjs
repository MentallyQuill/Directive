import { buildContinuityFactIndex } from './fact-index.mjs';
import { asArray, compact } from './fact-schema.mjs';

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const GENERIC_SUBJECT_FOCUS_TERMS = new Set([
  'captain',
  'commander',
  'lieutenant',
  'ensign',
  'doctor',
  'chief',
  'officer'
]);

function subjectNamesForFact(fact, packageData) {
  const subject = compact(fact?.subject);
  const crewId = subject.startsWith('crew.') ? subject.slice('crew.'.length) : null;
  if (!crewId) return [];
  const officer = asArray(packageData?.crew?.senior).find((entry) => entry?.id === crewId);
  const name = compact(officer?.name || crewId.replace(/-/g, ' '));
  const parts = name.split(/\s+/).filter(Boolean);
  return [...new Set([name, parts.length > 1 ? parts.at(-1) : null, compact(officer?.shortName)])]
    .filter((term) => term && !GENERIC_SUBJECT_FOCUS_TERMS.has(term.toLowerCase()));
}

function containsNear(text, left, right, window = 100) {
  const lower = String(text || '').toLowerCase();
  const leftLower = String(left || '').toLowerCase();
  const rightRegex = right instanceof RegExp ? right : new RegExp(escapeRegex(right), 'i');
  let index = lower.indexOf(leftLower);
  while (index >= 0) {
    const span = lower.slice(index, index + window);
    if (rightRegex.test(span)) return true;
    index = lower.indexOf(leftLower, index + leftLower.length);
  }
  return false;
}

function sentenceSegments(text = '') {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/([.!?])(["'\u2019\u201d)]*)\s+/gu, '$1$2\n')
    .split(/\n+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function sentenceContainsFocus(sentence, focusTerms = []) {
  return asArray(focusTerms).some((term) => {
    const clean = compact(term);
    if (!clean) return false;
    const pattern = clean.split(/\s+/).map(escapeRegex).join('\\s+');
    return new RegExp(`\\b${pattern}\\b`, 'i').test(sentence);
  });
}

function sentenceContainsPatternForFocus(text, focusTerms = [], pattern) {
  return sentenceSegments(text).some((sentence) => sentenceContainsFocus(sentence, focusTerms) && pattern.test(sentence));
}

const UNIFORM_COLOR_PATTERNS = Object.freeze({
  'burgundy-red': /\b(?:burgundy[-\s]?red|command\s+red|red-and-black)\b/i,
  'mustard-yellow': /\b(?:mustard[-\s]?yellow|operations?\s+yellow|ops\s+yellow|engineering\s+yellow|tactical\s+yellow|security\s+yellow|gold|yellow)\b/i,
  teal: /\b(?:science\s+teal|teal)\b/i,
  blue: /\b(?:medical\s+blue|blue)\b/i
});

function uniformFactColor(fact) {
  return compact(fact?.value?.color || fact?.value || fact?.summary);
}

function hasUniformColorContradiction(text, expectedColor, focusTerms = []) {
  const expected = compact(expectedColor).toLowerCase();
  if (!UNIFORM_COLOR_PATTERNS[expected]) return false;
  const hasFocusTerms = asArray(focusTerms).some((term) => compact(term));
  const wrongPatterns = Object.entries(UNIFORM_COLOR_PATTERNS)
    .filter(([color]) => color !== expected)
    .map(([, pattern]) => pattern);
  return sentenceSegments(text).some((sentence) => {
    if (hasFocusTerms && !sentenceContainsFocus(sentence, focusTerms)) return false;
    if (/\bnot\s+(?:command\s+)?red\b/i.test(sentence) || /\bnot\s+red-and-black\b/i.test(sentence)) return false;
    if (!/\b(?:uniform|division|collar|tactical|security|operations?|ops|engineering|science|medical|command|acting[-\s]?XO)\b/i.test(sentence)) return false;
    return wrongPatterns.some((pattern) => pattern.test(sentence));
  });
}

function speciesFindings(text, facts, packageData) {
  const findings = [];
  for (const fact of facts.filter((entry) => entry.predicate === 'species')) {
    const species = compact(fact.value);
    if (!species || /^(human|player-defined|user-defined|unspecified|unknown)$/i.test(species)) continue;
    const names = subjectNamesForFact(fact, packageData);
    const name = names.find((candidate) => sentenceContainsPatternForFocus(text, [candidate], /\bhuman\b/i));
    if (name) {
      findings.push({
        kind: 'species-contradiction',
        factId: fact.id,
        severity: 'blocker',
        summary: `${name} is ${species}, but generated text describes them as human.`
      });
    }
  }
  return findings;
}

function ageFindings(text, facts, packageData) {
  const findings = [];
  for (const fact of facts.filter((entry) => entry.predicate === 'ageDescription')) {
    const age = compact(fact.value || fact.summary);
    if (!/fift/i.test(age)) continue;
    const names = subjectNamesForFact(fact, packageData);
    const name = names.find((candidate) => sentenceContainsPatternForFocus(text, [candidate], /\b(early\s+forties|forty[-\s]?year[-\s]?old|40[-\s]?year[-\s]?old|in\s+his\s+forties|in\s+her\s+forties|in\s+their\s+forties)\b/i));
    if (name) {
      findings.push({
        kind: 'age-contradiction',
        factId: fact.id,
        severity: 'blocker',
        summary: `${name} has age frame "${age}", but generated text gives a forties age band.`
      });
    }
  }
  return findings;
}

function uniformDivisionFindings(text, facts, packageData) {
  const findings = [];
  for (const fact of facts.filter((entry) => entry.predicate === 'uniformDivisionColor')) {
    const expectedColor = uniformFactColor(fact);
    const names = subjectNamesForFact(fact, packageData);
    const name = names.find((candidate) => hasUniformColorContradiction(text, expectedColor, [candidate]));
    if (name) {
      findings.push({
        kind: 'uniform-division-color-contradiction',
        factId: fact.id,
        severity: 'blocker',
        summary: `${name} has uniform fact "${fact.summary}", but generated text assigns a conflicting division color.`
      });
    }
  }
  return findings;
}

function travelFindings(text, facts) {
  const hasTravelGuard = facts.some((fact) => fact.id.endsWith('.not-six-days-impulse'));
  const shuttleApproachFact = facts.find((fact) => (
    fact.id.endsWith('.opening-transit-mode')
    && /shuttlebay two|saucer-underside|nacelle pylons/i.test(`${fact.summary || ''} ${fact.render?.narrator || ''}`)
  ));
  const shuttlebayLayoutGuardFact = facts.find((fact) => (
    fact.id.endsWith('.not-saucer-underside')
    || (
      asArray(fact.tags).map((tag) => compact(tag).toLowerCase()).includes('contradiction-guard')
      && /shuttle\s*bay|shuttlebay/i.test(`${fact.summary || ''} ${fact.render?.narrator || ''} ${fact.render?.director || ''}`)
      && /saucer|underside|ventral|primary hull|aft dorsal|deck 10/i.test(`${fact.summary || ''} ${fact.render?.narrator || ''} ${fact.render?.director || ''}`)
    )
  ));
  const shuttleLayoutFact = shuttlebayLayoutGuardFact || shuttleApproachFact;
  if (!hasTravelGuard && !shuttleLayoutFact) return [];
  const normalized = String(text || '').replace(/\s+/g, ' ');
  const findings = [];
  const badImpulse = hasTravelGuard && /\bat\s+impulse\s+for\s+(six|6)\s+days\b/i.test(normalized)
    && /(Utopia|Planitia|leaving|left|departed|since)/i.test(normalized);
  const badSinceUtopia = hasTravelGuard && /since\s+(leaving|departing)\s+Utopia\s+Planitia/i.test(normalized)
    && /\bimpulse\b/i.test(normalized)
    && /\b(six|6)\s+days\b/i.test(normalized);
  if (badImpulse || badSinceUtopia) {
    findings.push({
      kind: 'travel-contradiction',
      factId: facts.find((fact) => fact.id.endsWith('.not-six-days-impulse'))?.id || null,
      severity: 'blocker',
      summary: 'Generated text describes the Breckenridge opening transit as six days at impulse from Utopia Planitia.'
    });
  }
  const badSaucerShuttlebay = shuttleLayoutFact && (
    /\b(?:shuttle\s*bay|shuttlebay|bay doors?)\b.{0,160}\b(?:underside|under side|ventral|belly)\b.{0,80}\b(?:saucer|primary hull)\b/i.test(normalized)
    || /\b(?:underside|under side|ventral|belly)\b.{0,80}\b(?:saucer|primary hull)\b.{0,160}\b(?:shuttle\s*bay|shuttlebay|bay doors?)\b/i.test(normalized)
  );
  if (badSaucerShuttlebay) {
    findings.push({
      kind: 'ship-layout-contradiction',
      factId: shuttleLayoutFact.id,
      severity: 'blocker',
      summary: 'Generated text depicts the Intrepid-class Breckenridge shuttle arrival through a saucer-underside shuttlebay instead of the Deck 10 aft shuttlebay complex.'
    });
  }
  return findings;
}

export function reviewContinuityContradictions({
  text,
  campaignState,
  packageData = null,
  crewDataset = null,
  shipDataset = null,
  campaignProjection = null
} = {}) {
  const factIndex = buildContinuityFactIndex({
    campaignState,
    packageData,
    crewDataset,
    shipDataset,
    campaignProjection
  });
  const findings = [
    ...speciesFindings(text, factIndex.facts, packageData),
    ...ageFindings(text, factIndex.facts, packageData),
    ...uniformDivisionFindings(text, factIndex.facts, packageData),
    ...travelFindings(text, factIndex.facts)
  ];
  return {
    kind: 'directive.continuityContradictionReview.v1',
    ok: findings.length === 0,
    findings,
    checkedFactCount: factIndex.acceptedCount
  };
}

export function assertContinuityContradictionFree(options = {}) {
  const review = reviewContinuityContradictions(options);
  if (review.ok) return review;
  const error = new Error(review.findings.map((finding) => finding.summary).join(' '));
  error.code = 'DIRECTIVE_CONTINUITY_CONTRADICTION';
  error.review = review;
  throw error;
}
