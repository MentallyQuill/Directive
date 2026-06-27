import {
  CONTINUITY_VISIBILITY,
  asArray,
  compact,
  createContinuityFact,
  hashContinuityText
} from '../fact-schema.mjs';
import { normalizeContinuityState } from '../state.mjs';

const REJECTED_CLAIM_FACT_LIMIT = 8;

function categoriesForClaim(claim = {}) {
  return [...new Set(asArray(claim.categories || claim.category).map(compact).filter(Boolean))];
}

function findingsForClaim(claim = {}) {
  return asArray(claim.review?.findings).filter((finding) => finding && typeof finding === 'object');
}

function findingFactIds(claim = {}) {
  return [...new Set([
    ...asArray(claim.findingFactIds),
    ...findingsForClaim(claim).map((finding) => compact(finding.factId))
  ].map(compact).filter(Boolean))];
}

function sourceIdForClaim(claim = {}) {
  return claim.textHash || hashContinuityText({
    id: claim.id || null,
    source: claim.source || null,
    categories: categoriesForClaim(claim),
    findingFactIds: findingFactIds(claim)
  });
}

function categoryLabel(categories = []) {
  const values = categories.map(compact).filter(Boolean);
  if (!values.length) return 'continuity';
  if (values.length === 1) return values[0];
  return `${values.slice(0, -1).join(', ')} and ${values.at(-1)}`;
}

export function materializeRejectedClaimFacts({ campaignState = null } = {}) {
  const continuity = normalizeContinuityState(campaignState?.continuity);
  return asArray(continuity.rejectedClaims)
    .filter((claim) => compact(claim?.status || 'rejected') === 'rejected')
    .slice(-REJECTED_CLAIM_FACT_LIMIT)
    .map((claim) => {
      const categories = categoriesForClaim(claim);
      const factIds = findingFactIds(claim);
      const sourceId = sourceIdForClaim(claim);
      const label = categoryLabel(categories);
      const factCount = factIds.length;
      const guardText = [
        `A recent generated ${label} claim was rejected by continuity review.`,
        factCount ? `It conflicted with ${factCount} protected continuity fact${factCount === 1 ? '' : 's'}.` : null,
        'Do not repeat, summarize, or rely on that rejected generated claim; use the protected continuity facts instead.'
      ].filter(Boolean).join(' ');
      return createContinuityFact({
        id: `rejected-claim.${sourceId}`,
        kind: 'continuity.rejectedClaim',
        subject: factIds[0] ? `guard.${hashContinuityText(factIds.join('|'))}` : 'guard.rejectedGeneratedClaim',
        predicate: 'rejectedGeneratedClaim',
        value: {
          categories,
          findingFactIds: factIds,
          textHash: claim.textHash || null,
          sourceKind: compact(claim.source?.kind || claim.sourceKind) || null
        },
        summary: guardText,
        render: {
          narrator: guardText,
          director: guardText,
          inspector: guardText
        },
        source: {
          type: 'continuity.rejectedClaims',
          claimHash: hashContinuityText(claim.id || sourceId),
          textHash: claim.textHash || null,
          sourceKind: compact(claim.source?.kind || claim.sourceKind) || null
        },
        authority: 'campaignState',
        visibility: CONTINUITY_VISIBILITY.narratorSafe,
        criticality: 'hard',
        stability: 'volatile',
        tags: ['rejected-claim', 'contradiction-guard', ...categories]
      });
    });
}
