import { cloneJson, compact, hashContinuityText } from './fact-schema.mjs';

export const CLAIM_AUTHORITY_CATEGORIES = Object.freeze({
  authoredFact: 'authoredFact',
  committedObservation: 'committedObservation',
  playerClaim: 'playerClaim',
  generatedClaim: 'generatedClaim',
  supportedHypothesis: 'supportedHypothesis',
  unresolvedHypothesis: 'unresolvedHypothesis'
});

export const CLAIM_DISPOSITIONS = Object.freeze({
  commit: 'commit',
  acknowledgeUncertainty: 'acknowledge-uncertainty',
  quarantine: 'quarantine',
  verificationRequired: 'verification-required'
});

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(value) {
  return [...new Set(asArray(value).map((entry) => compact(
    typeof entry === 'object' ? entry.id || entry.refId || entry.sourceId : entry
  )).filter(Boolean))];
}

function sentences(text) {
  return String(text || '')
    .replace(/\s+/gu, ' ')
    .split(/(?<=[.!?])\s+/u)
    .map(compact)
    .filter(Boolean)
    .slice(0, 24);
}

function normalizeCategory(value) {
  const category = compact(value);
  return Object.values(CLAIM_AUTHORITY_CATEGORIES).includes(category)
    ? category
    : CLAIM_AUTHORITY_CATEGORIES.unresolvedHypothesis;
}

export function resolveClaimDisposition({
  category = CLAIM_AUTHORITY_CATEGORIES.unresolvedHypothesis,
  evidenceRefIds = [],
  review = null,
  explicitlyCommitted = false
} = {}) {
  const normalizedCategory = normalizeCategory(category);
  const refs = uniqueStrings(evidenceRefIds);
  let disposition = CLAIM_DISPOSITIONS.verificationRequired;
  let reason = 'No authoritative source or committed observation supports this claim.';
  if (normalizedCategory === CLAIM_AUTHORITY_CATEGORIES.authoredFact || normalizedCategory === CLAIM_AUTHORITY_CATEGORIES.committedObservation || explicitlyCommitted === true) {
    disposition = CLAIM_DISPOSITIONS.commit;
    reason = 'Claim is backed by authored campaign data or a committed observation.';
  } else if (normalizedCategory === CLAIM_AUTHORITY_CATEGORIES.supportedHypothesis) {
    disposition = CLAIM_DISPOSITIONS.acknowledgeUncertainty;
    reason = refs.length
      ? 'Claim has supporting evidence but remains a hypothesis until a story transaction commits it.'
      : 'Claim is treated as a hypothesis and must not be narrated as settled fact.';
  } else if (normalizedCategory === CLAIM_AUTHORITY_CATEGORIES.generatedClaim) {
    disposition = CLAIM_DISPOSITIONS.quarantine;
    reason = review?.ok === false
      ? 'Generated claim is quarantined because source reconciliation found a contradiction.'
      : 'Generated prose is never a state mutation; quarantine it until an authoritative transaction commits it.';
  } else if (normalizedCategory === CLAIM_AUTHORITY_CATEGORIES.playerClaim) {
    disposition = CLAIM_DISPOSITIONS.verificationRequired;
    reason = 'Player input is intent or testimony, not authoritative world state.';
  }
  return {
    category: normalizedCategory,
    disposition,
    accepted: disposition === CLAIM_DISPOSITIONS.commit,
    evidenceRefIds: refs,
    reason
  };
}

function classifyText({
  text = '',
  category,
  source = null,
  evidenceRefIds = [],
  review = null,
  now = null,
  explicitlyCommitted = false
} = {}) {
  const extractedAt = typeof now === 'function' ? now() : (now || new Date().toISOString());
  const normalizedCategory = normalizeCategory(category);
  const refs = uniqueStrings(evidenceRefIds);
  const claims = sentences(text).map((sentence) => {
    const disposition = resolveClaimDisposition({
      category: normalizedCategory,
      evidenceRefIds: refs,
      review,
      explicitlyCommitted
    });
    return {
      schemaVersion: 1,
      id: `claim.${hashContinuityText({ sentence, category: normalizedCategory, source: source || null })}`,
      text: sentence,
      textHash: hashContinuityText(sentence),
      category: disposition.category,
      authority: disposition.category,
      disposition: disposition.disposition,
      accepted: disposition.accepted,
      evidenceRefIds: cloneJson(disposition.evidenceRefIds),
      reason: disposition.reason,
      source: cloneJson(source || null),
      review: review ? cloneJson(review) : null,
      extractedAt
    };
  });
  const first = claims[0] || resolveClaimDisposition({ category: normalizedCategory, evidenceRefIds: refs, review, explicitlyCommitted });
  return {
    kind: 'directive.claimAuthorityAssessment.v1',
    schemaVersion: 1,
    category: first.category,
    disposition: first.disposition,
    accepted: first.accepted,
    evidenceRefIds: refs,
    claims,
    policy: {
      playerInputIsIntentNotFact: true,
      generatedProseCannotCommitState: true,
      unsupportedClaimsRequireVerification: true
    }
  };
}

export function classifyPlayerClaims({
  text = '',
  source = { kind: 'playerInput' },
  supportedFactIds = [],
  evidenceRefIds = [],
  now = null
} = {}) {
  const refs = uniqueStrings([...supportedFactIds, ...evidenceRefIds]);
  return classifyText({
    text,
    category: refs.length ? CLAIM_AUTHORITY_CATEGORIES.supportedHypothesis : CLAIM_AUTHORITY_CATEGORIES.playerClaim,
    source,
    evidenceRefIds: refs,
    now
  });
}

export function classifyGeneratedClaims({
  text = '',
  source = { kind: 'generatedNarration' },
  review = null,
  evidenceRefIds = [],
  now = null
} = {}) {
  return classifyText({
    text,
    category: CLAIM_AUTHORITY_CATEGORIES.generatedClaim,
    source,
    evidenceRefIds,
    review,
    now
  });
}

