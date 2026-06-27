import { buildContinuityFactIndex } from './fact-index.mjs';
import { asArray, compact } from './fact-schema.mjs';

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function subjectNamesForFact(fact, packageData) {
  const subject = compact(fact?.subject);
  const crewId = subject.startsWith('crew.') ? subject.slice('crew.'.length) : null;
  if (!crewId) return [];
  const officer = asArray(packageData?.crew?.senior).find((entry) => entry?.id === crewId);
  const name = compact(officer?.name || crewId.replace(/-/g, ' '));
  const parts = name.split(/\s+/).filter(Boolean);
  return [...new Set([name, parts.length > 1 ? parts.at(-1) : null, compact(officer?.shortName)])].filter(Boolean);
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

function speciesFindings(text, facts, packageData) {
  const findings = [];
  for (const fact of facts.filter((entry) => entry.predicate === 'species')) {
    const species = compact(fact.value);
    if (!species || species.toLowerCase() === 'human') continue;
    const names = subjectNamesForFact(fact, packageData);
    const name = names.find((candidate) => containsNear(text, candidate, /\bhuman\b/i, 140));
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
    const name = names.find((candidate) => containsNear(text, candidate, /\b(early\s+forties|forty[-\s]?year[-\s]?old|40[-\s]?year[-\s]?old|in\s+his\s+forties|in\s+her\s+forties|in\s+their\s+forties)\b/i, 180));
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

function travelFindings(text, facts) {
  const hasTravelGuard = facts.some((fact) => fact.id.endsWith('.not-six-days-impulse'));
  if (!hasTravelGuard) return [];
  const normalized = String(text || '').replace(/\s+/g, ' ');
  const badImpulse = /\bat\s+impulse\s+for\s+(six|6)\s+days\b/i.test(normalized)
    && /(Utopia|Planitia|leaving|left|departed|since)/i.test(normalized);
  const badSinceUtopia = /since\s+(leaving|departing)\s+Utopia\s+Planitia/i.test(normalized)
    && /\bimpulse\b/i.test(normalized)
    && /\b(six|6)\s+days\b/i.test(normalized);
  if (!badImpulse && !badSinceUtopia) return [];
  return [{
    kind: 'travel-contradiction',
    factId: facts.find((fact) => fact.id.endsWith('.not-six-days-impulse'))?.id || null,
    severity: 'blocker',
    summary: 'Generated text describes the Breckenridge opening transit as six days at impulse from Utopia Planitia.'
  }];
}

export function reviewContinuityContradictions({
  text,
  campaignState,
  packageData = null,
  crewDataset = null,
  campaignProjection = null
} = {}) {
  const factIndex = buildContinuityFactIndex({
    campaignState,
    packageData,
    crewDataset,
    campaignProjection
  });
  const findings = [
    ...speciesFindings(text, factIndex.facts, packageData),
    ...ageFindings(text, factIndex.facts, packageData),
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
