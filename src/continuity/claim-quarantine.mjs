import {
  cloneJson,
  compact,
  hashContinuityText
} from './fact-schema.mjs';
import { normalizeContinuityState } from './state.mjs';

const HIGH_RISK_PATTERNS = Object.freeze([
  { category: 'species', pattern: /\b(human|tellarite|vulcan|bajoran|betazoid|trill|andorian|bolian|cardassian|romulan|klingon)\b/i },
  { category: 'age', pattern: /\b(early|mid|late)?\s*(twenties|thirties|forties|fifties|sixties|seventies|\d{2}[-\s]?year[-\s]?old)\b/i },
  { category: 'travel', pattern: /\b(warp|impulse|Utopia Planitia|Asterion Reach|light-years?|days underway|rendezvous)\b/i },
  { category: 'identity', pattern: /\b(chief|captain|XO|executive officer|acting XO|security officer|tactical officer)\b/i }
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function sentences(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+/u)
    .map(compact)
    .filter(Boolean);
}

export function extractContinuityClaimsFromText({
  text,
  source = {},
  review = null,
  status = 'candidate',
  now = null
} = {}) {
  const extractedAt = typeof now === 'function' ? now() : (now || new Date().toISOString());
  const claims = [];
  for (const sentence of sentences(text)) {
    const categories = HIGH_RISK_PATTERNS
      .filter((entry) => entry.pattern.test(sentence))
      .map((entry) => entry.category);
    if (!categories.length) continue;
    const hash = hashContinuityText({ sentence, source, categories });
    const findingFactIds = [...new Set(asArray(review?.findings)
      .map((finding) => compact(finding?.factId))
      .filter(Boolean))];
    claims.push({
      schemaVersion: 1,
      id: `generated-claim.${hash}`,
      status,
      categories: [...new Set(categories)],
      text: sentence,
      textHash: hashContinuityText(sentence),
      source: cloneJson(source || {}),
      sourceHash: hashContinuityText(source || {}),
      extractedAt,
      authority: 'generatedClaim',
      accepted: false,
      findingFactIds,
      findingKinds: [...new Set(asArray(review?.findings)
        .map((finding) => compact(finding?.kind))
        .filter(Boolean))],
      review: review ? cloneJson(review) : null
    });
  }
  return claims;
}

function appendUnique(existing, additions) {
  const byId = new Map((Array.isArray(existing) ? existing : []).map((entry) => [entry.id, cloneJson(entry)]));
  for (const claim of additions) {
    if (!claim?.id) continue;
    byId.set(claim.id, cloneJson(claim));
  }
  return [...byId.values()];
}

export function quarantineGeneratedClaims(campaignState, {
  text,
  source = {},
  review = null,
  status = null,
  now = null
} = {}) {
  if (!campaignState || typeof campaignState !== 'object') throw new Error('campaignState must be an object.');
  const targetStatus = status || (review?.ok === false ? 'rejected' : 'candidate');
  const claims = extractContinuityClaimsFromText({
    text,
    source,
    review,
    status: targetStatus,
    now
  });
  if (!claims.length) return { campaignState: cloneJson(campaignState), claims: [] };
  const next = cloneJson(campaignState);
  const continuity = normalizeContinuityState(next.continuity);
  if (targetStatus === 'rejected') {
    continuity.rejectedClaims = appendUnique(continuity.rejectedClaims, claims);
  } else {
    continuity.candidateClaims = appendUnique(continuity.candidateClaims, claims);
  }
  next.continuity = normalizeContinuityState(continuity);
  return {
    campaignState: next,
    claims
  };
}
