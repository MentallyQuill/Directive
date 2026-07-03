import {
  CONTINUITY_VISIBILITY,
  asArray,
  cloneJson,
  compact,
  createContinuityFact,
  factKnowledgeScope,
  isFalseBeliefDisclosureState,
  isFactAllowedForSourceFrame,
  isProvisionalDisclosureState,
  isFactVisibleToAudience,
  normalizeActorId
} from './fact-schema.mjs';
import { normalizeContinuityState } from './state.mjs';
import { materializeContinuityFacts } from './materializers/index.mjs';

function normalizeFact(value, fallbackAuthority = 'campaignState') {
  if (!value || typeof value !== 'object') return null;
  if (value.schemaVersion && value.id && value.conflictKey) return cloneJson(value);
  return createContinuityFact({
    ...value,
    authority: value.authority || fallbackAuthority,
    visibility: value.visibility || CONTINUITY_VISIBILITY.narratorSafe
  });
}

function rankFact(fact) {
  const scope = factKnowledgeScope(fact);
  const disclosureRank = isFalseBeliefDisclosureState(scope.disclosureState)
    ? -30
    : (isProvisionalDisclosureState(scope.disclosureState) ? -10 : 0);
  const criticalityRank = {
    hard: 50,
    critical: 45,
    high: 35,
    medium: 20,
    low: 5
  }[compact(fact?.criticality).toLowerCase()] || 0;
  return [
    Number(fact?.authorityRank || 0),
    disclosureRank,
    criticalityRank,
    Number(fact?.confidence || 0) * 10,
    Number(fact?.revision || 0)
  ];
}

function conflictPartitionKey(fact) {
  const key = fact?.conflictKey || fact?.id;
  const scope = factKnowledgeScope(fact);
  if (!isFalseBeliefDisclosureState(scope.disclosureState)) return key;
  const actors = [...new Set([
    ...scope.knownBy,
    ...scope.witnessedBy,
    ...scope.subjectIds
  ])].sort().join(',');
  return `${key}:falseBelief:${actors || 'unknown'}`;
}

function hasExplicitKnowledgeScope(fact) {
  const scope = factKnowledgeScope(fact);
  const subject = normalizeActorId(fact?.subject || '');
  return scope.knownBy.length > 0
    || scope.witnessedBy.length > 0
    || scope.subjectIds.some((actorId) => actorId !== subject);
}

function compareFacts(left, right) {
  const leftRank = rankFact(left);
  const rightRank = rankFact(right);
  for (let index = 0; index < leftRank.length; index += 1) {
    if (leftRank[index] !== rightRank[index]) return rightRank[index] - leftRank[index];
  }
  return String(left.id).localeCompare(String(right.id));
}

function mergeFactSources(left, right) {
  return {
    ...left,
    duplicateOf: [...new Set([...(left.duplicateOf || []), right.id])],
    anchors: [
      ...asArray(left.anchors),
      ...asArray(right.anchors)
    ]
  };
}

export function buildContinuityFactIndex({
  campaignState,
  packageData = null,
  crewDataset = null,
  shipDataset = null,
  campaignProjection = null,
  additionalFacts = [],
  audience = CONTINUITY_VISIBILITY.narratorSafe,
  sourceFrame = null
} = {}) {
  if (!campaignState || typeof campaignState !== 'object') throw new Error('campaignState must be an object.');
  const continuity = normalizeContinuityState(campaignState.continuity);
  const sourceFacts = [
    ...materializeContinuityFacts({ campaignState, packageData, crewDataset, shipDataset, campaignProjection }),
    ...continuity.acceptedFacts.map((fact) => normalizeFact(fact, 'campaignState')),
    ...asArray(additionalFacts).map((fact) => normalizeFact(fact, 'campaignState'))
  ].filter(Boolean);

  const acceptedById = new Map();
  const conflicts = [];
  const rejected = [];
  for (const fact of sourceFacts) {
    if (!isFactVisibleToAudience(fact, audience)) {
      rejected.push({ factId: fact.id, reason: 'audience-gate' });
      continue;
    }
    if (sourceFrame && hasExplicitKnowledgeScope(fact) && !isFactAllowedForSourceFrame(fact, sourceFrame)) {
      rejected.push({ factId: fact.id, reason: 'source-frame-knowledge-gate' });
      continue;
    }
    const existingSameId = acceptedById.get(fact.id);
    if (existingSameId) {
      acceptedById.set(fact.id, mergeFactSources(existingSameId, fact));
      continue;
    }
    acceptedById.set(fact.id, fact);
  }

  const byConflictKey = new Map();
  for (const fact of acceptedById.values()) {
    const key = conflictPartitionKey(fact);
    const siblings = byConflictKey.get(key) || [];
    siblings.push(fact);
    byConflictKey.set(key, siblings);
  }

  const resolved = [];
  for (const [conflictKey, siblings] of byConflictKey) {
    const sorted = siblings.sort(compareFacts);
    const winner = sorted[0];
    resolved.push(winner);
    for (const loser of sorted.slice(1)) {
      conflicts.push({
        conflictKey,
        acceptedFactId: winner.id,
        rejectedFactId: loser.id,
        reason: 'lower-authority-or-salience'
      });
    }
  }

  resolved.sort(compareFacts);
  return {
    kind: 'directive.continuityFactIndex.v1',
    facts: resolved,
    conflicts,
    rejected,
    sourceCount: sourceFacts.length,
    acceptedCount: resolved.length
  };
}
