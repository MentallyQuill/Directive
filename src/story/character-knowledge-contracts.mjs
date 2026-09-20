import { CONTINUITY_STABLE_ID_PATTERN } from './continuity-contracts.mjs';

const ID = new RegExp(CONTINUITY_STABLE_ID_PATTERN);
const CLAIM_TYPES = ['narrated-fact', 'character-claim', 'player-commitment'];

function invalid(path) {
  const error = new TypeError(`character-knowledge-invalid:${path}`);
  error.code = 'DIRECTIVE_CHARACTER_KNOWLEDGE_INVALID';
  throw error;
}
function object(value, fields, required, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid(path);
  if (Object.keys(value).some(key => !fields.includes(key))
      || required.some(key => !Object.hasOwn(value, key))) invalid(path);
}
function text(value, maximum, path) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) invalid(path);
}
function id(value, path) {
  text(value, 180, path);
  if (!ID.test(value)) invalid(path);
}
function choice(value, choices, path) {
  if (!choices.includes(value)) invalid(path);
}
function list(value, maximum, path) {
  if (!Array.isArray(value) || value.length > maximum) invalid(path);
  for (let index = 0; index < value.length; index++) if (!Object.hasOwn(value, index)) invalid(path);
}
function uniqueIds(values, path) {
  if (new Set(values).size !== values.length) invalid(path);
  values.forEach(value => id(value, path));
}

/** A wire contract, not an access grant. The compiler must establish source custody. */
export function parseCharacterKnowledgePacket(value) {
  object(value, ['kind', 'personId', 'identity', 'situation', 'information', 'authoredInformation'],
    ['kind', 'personId', 'identity', 'situation', 'information'], 'packet');
  choice(value.kind, ['directive.characterPacket.v1'], 'packet.kind');
  id(value.personId, 'packet.personId');
  object(value.identity, ['name', 'role'], ['name', 'role'], 'packet.identity');
  text(value.identity.name, 180, 'packet.identity.name');
  text(value.identity.role, 500, 'packet.identity.role');
  text(value.situation, 6000, 'packet.situation');
  list(value.information, 128, 'packet.information');
  for (const item of value.information) {
    object(item, ['id', 'text', 'claimType', 'acquisition', 'status'],
      ['id', 'text', 'claimType', 'acquisition', 'status'], 'packet.information.item');
    id(item.id, 'packet.information.id');
    text(item.text, 4000, 'packet.information.text');
    choice(item.claimType, CLAIM_TYPES, 'packet.information.claimType');
    choice(item.acquisition, ['heard', 'observed', 'read'], 'packet.information.acquisition');
    choice(item.status, ['current', 'superseded'], 'packet.information.status');
  }
  if (value.authoredInformation !== undefined) {
    list(value.authoredInformation, 32, 'packet.authoredInformation');
    for (const item of value.authoredInformation) {
      object(item, ['id', 'type', 'text'], ['id', 'type', 'text'], 'packet.authoredInformation.item');
      id(item.id, 'packet.authoredInformation.id');
      choice(item.type, ['competence', 'background'], 'packet.authoredInformation.type');
      text(item.text, 2000, 'packet.authoredInformation.text');
    }
  }
  uniqueIds([...value.information, ...(value.authoredInformation || [])].map(item => item.id), 'packet.information.ids');
  return structuredClone(value);
}

function references(values, allowed, maximum, path) {
  if (!(allowed instanceof Set)) invalid(`${path}.authority`);
  list(values, maximum, path);
  uniqueIds(values, path);
  if (values.some(value => !allowed.has(value))) invalid(path);
}

/** Persisted syntax only; this parser does not establish knowledge or audience authority. */
export function parseCharacterContributionRecord(value) {
  const keys = ['id', 'personId', 'kind', 'mode', 'text', 'basisIds', 'recipientIds', 'dependsOnIds'];
  object(value, keys, keys, 'contribution');
  id(value.id, 'contribution.id'); id(value.personId, 'contribution.personId');
  choice(value.kind, ['speech', 'action', 'message'], 'contribution.kind');
  choice(value.mode, ['recall', 'inference', 'question', 'ordinary', 'deception'], 'contribution.mode');
  text(value.text, 4000, 'contribution.text');
  for (const [key, maximum] of [['basisIds', 32], ['recipientIds', 16], ['dependsOnIds', 16]]) {
    list(value[key], maximum, `contribution.${key}`); uniqueIds(value[key], `contribution.${key}`);
  }
  if (['recall', 'inference'].includes(value.mode) && value.basisIds.length === 0) invalid('contribution.basisIds');
  if (value.dependsOnIds.includes(value.id)) invalid('contribution.selfDependency');
  return structuredClone(value);
}

export function parseCharacterContribution(value, { packet, playerId, audienceIds, priorContributionIds } = {}) {
  value = parseCharacterContributionRecord(value);
  const checkedPacket = parseCharacterKnowledgePacket(packet);
  object(value, ['id', 'personId', 'kind', 'mode', 'text', 'basisIds', 'recipientIds', 'dependsOnIds'],
    ['id', 'personId', 'kind', 'mode', 'text', 'basisIds', 'recipientIds', 'dependsOnIds'], 'contribution');
  id(value.id, 'contribution.id');
  id(playerId, 'contribution.playerId');
  if (value.personId !== checkedPacket.personId || value.personId === playerId) invalid('contribution.personId');
  choice(value.kind, ['speech', 'action', 'message'], 'contribution.kind');
  choice(value.mode, ['recall', 'inference', 'question', 'ordinary', 'deception'], 'contribution.mode');
  text(value.text, 4000, 'contribution.text');
  references(value.basisIds, new Set([...checkedPacket.information, ...(checkedPacket.authoredInformation || [])].map(item => item.id)), 32, 'contribution.basisIds');
  if (['recall', 'inference'].includes(value.mode) && value.basisIds.length === 0) invalid('contribution.basisIds');
  references(value.recipientIds, audienceIds, 16, 'contribution.recipientIds');
  references(value.dependsOnIds, priorContributionIds, 16, 'contribution.dependsOnIds');
  if (value.dependsOnIds.includes(value.id) || priorContributionIds.has(value.id)) invalid('contribution.selfDependency');
  return structuredClone(value);
}

/** Proposals need semantic admission before they can become character information. */
export function parseCharacterExposure(value, { speakerIds, audienceIds, passageIds, contributions, exposureIds } = {}) {
  object(value, ['kind', 'id', 'speakerId', 'recipientIds', 'acquisition', 'text', 'claimType', 'source', 'dependsOnIds'],
    ['kind', 'id', 'speakerId', 'recipientIds', 'acquisition', 'text', 'claimType', 'source', 'dependsOnIds'], 'exposure');
  choice(value.kind, ['directive.characterExposure.v1'], 'exposure.kind');
  id(value.id, 'exposure.id');
  references([value.speakerId], speakerIds, 1, 'exposure.speakerId');
  references(value.recipientIds, audienceIds, 16, 'exposure.recipientIds');
  if (!value.recipientIds.length) invalid('exposure.recipientIds');
  choice(value.acquisition, ['heard', 'observed', 'read'], 'exposure.acquisition');
  choice(value.claimType, CLAIM_TYPES, 'exposure.claimType');
  text(value.text, 4000, 'exposure.text');
  references(value.dependsOnIds, exposureIds, 16, 'exposure.dependsOnIds');
  if (value.dependsOnIds.includes(value.id)) invalid('exposure.selfDependency');
  if (value.source?.type === 'passage') {
    object(value.source, ['type', 'passageId'], ['type', 'passageId'], 'exposure.source');
    references([value.source.passageId], passageIds, 1, 'exposure.source.passageId');
  } else {
    object(value.source, ['type', 'contributionId'], ['type', 'contributionId'], 'exposure.source');
    choice(value.source.type, ['contribution'], 'exposure.source.type');
    if (!(contributions instanceof Map)) invalid('exposure.source.authority');
    const source = contributions.get(value.source.contributionId);
    if (!source || source.personId !== value.speakerId || !Array.isArray(source.recipientIds)
        || value.recipientIds.some(personId => !source.recipientIds.includes(personId))) invalid('exposure.source.contributionId');
    // Hearing a claim establishes that it was said, not that the claim is true.
    if (['speech', 'message'].includes(source.kind) && value.claimType !== 'character-claim') invalid('exposure.claimType');
  }
  return structuredClone(value);
}

export function parseCharacterNarrationSegments(value, { contributions } = {}) {
  list(value, 128, 'segments');
  if (!value.length || !Array.isArray(contributions)) invalid('segments.authority');
  const byId = new Map(contributions.map(item => [item.id, item]));
  if (byId.size !== contributions.length) invalid('segments.contributionIds');
  const used = new Set();
  const segmentIds = new Set();
  for (const segment of value) {
    if (segment?.kind === 'prose') {
      object(segment, ['kind', 'id', 'text'], ['kind', 'id', 'text'], 'segments.prose');
      text(segment.text, 6000, 'segments.prose.text');
    } else {
      object(segment, ['kind', 'id'], ['kind', 'id'], 'segments.character');
      choice(segment.kind, ['character'], 'segments.kind');
      const contribution = byId.get(segment.id);
      if (!contribution || !Array.isArray(contribution.dependsOnIds)
          || contribution.dependsOnIds.some(id => !used.has(id))) invalid('segments.dependency');
      used.add(segment.id);
    }
    id(segment.id, 'segments.id');
    if (segmentIds.has(segment.id)) invalid('segments.duplicateId');
    segmentIds.add(segment.id);
  }
  if (used.size !== byId.size) invalid('segments.missingContribution');
  return structuredClone(value);
}

function digest(value, path) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) invalid(path);
}

export function parseCharacterKnowledgeReview(value, { candidateDigest, supportDigest, segmentIds, subjectIds, supportIds } = {}) {
  object(value, ['kind', 'candidateDigest', 'supportDigest', 'verdict', 'findings'],
    ['kind', 'candidateDigest', 'supportDigest', 'verdict', 'findings'], 'review');
  choice(value.kind, ['directive.characterKnowledgeReview.v1'], 'review.kind');
  digest(value.candidateDigest, 'review.candidateDigest');
  digest(value.supportDigest, 'review.supportDigest');
  if (value.candidateDigest !== candidateDigest || value.supportDigest !== supportDigest) invalid('review.stale');
  choice(value.verdict, ['pass', 'reject'], 'review.verdict');
  list(value.findings, 16, 'review.findings');
  if ((value.verdict === 'pass') !== (value.findings.length === 0)) invalid('review.verdict');
  for (const finding of value.findings) {
    object(finding, ['id', 'segmentId', 'subjectId', 'type', 'explanation', 'supportIds'],
      ['id', 'segmentId', 'subjectId', 'type', 'explanation', 'supportIds'], 'review.finding');
    references([finding.segmentId], segmentIds, 1, 'review.finding.segmentId');
    references([finding.subjectId], subjectIds, 1, 'review.finding.subjectId');
    references(finding.supportIds, supportIds, 16, 'review.finding.supportIds');
    choice(finding.type, ['unsupported-knowledge', 'unsupported-inference', 'audience-mismatch',
      'disclosure-order', 'narrator-leakage', 'player-agency', 'unsupported-world-state'], 'review.finding.type');
    text(finding.explanation, 480, 'review.finding.explanation');
  }
  uniqueIds(value.findings.map(item => item.id), 'review.finding.ids');
  return structuredClone(value);
}

function sourceIdentity(value, path) {
  object(value, ['messageId', 'selectedSwipeId', 'textHash'], ['messageId', 'selectedSwipeId', 'textHash'], path);
  text(value.messageId, 300, `${path}.messageId`);
  if (value.selectedSwipeId !== null) text(value.selectedSwipeId, 300, `${path}.selectedSwipeId`);
  text(value.textHash, 128, `${path}.textHash`);
}
function sameSource(a, b) {
  return a.messageId === b.messageId && a.selectedSwipeId === b.selectedSwipeId && a.textHash === b.textHash;
}

export function parseCharacterNarrativePosition(value, { source } = {}) {
  object(value, ['source', 'order'], ['source', 'order'], 'position');
  sourceIdentity(value.source, 'position.source');
  sourceIdentity(source, 'position.authority');
  if (!sameSource(value.source, source) || !Number.isSafeInteger(value.order) || value.order < 0) invalid('position.order');
  return structuredClone(value);
}

function digestEntries(values, key, expected, path) {
  list(values, 16, path);
  if (!(expected instanceof Map) || expected.size !== values.length) invalid(`${path}.authority`);
  for (const entry of values) {
    object(entry, [key, 'digest'], [key, 'digest'], path);
    id(entry[key], `${path}.id`);
    digest(entry.digest, `${path}.digest`);
    if (expected.get(entry[key]) !== entry.digest) invalid(`${path}.stale`);
  }
  uniqueIds(values.map(entry => entry[key]), `${path}.ids`);
}

/** Receipt validation never grants access or commits state; settlement does that. */
export function parseCharacterSceneReceipt(value, {
  source, flightDigest, reviewContext, exposureContext, packetDigests, contributionDigests,
} = {}) {
  const fields = ['kind', 'publicationId', 'flightDigest', 'source', 'candidateDigest', 'supportDigest',
    'packetDigests', 'contributionDigests', 'review', 'disclosures'];
  object(value, fields, fields, 'receipt');
  choice(value.kind, ['directive.characterSceneReceipt.v1'], 'receipt.kind');
  id(value.publicationId, 'receipt.publicationId');
  digest(value.flightDigest, 'receipt.flightDigest');
  if (value.flightDigest !== flightDigest) invalid('receipt.staleFlight');
  sourceIdentity(source, 'receipt.authority');
  sourceIdentity(value.source, 'receipt.source');
  if (!sameSource(source, value.source)) invalid('receipt.staleSource');
  const review = parseCharacterKnowledgeReview(value.review, reviewContext);
  if (review.verdict !== 'pass' || value.candidateDigest !== review.candidateDigest
      || value.supportDigest !== review.supportDigest) invalid('receipt.review');
  digestEntries(value.packetDigests, 'personId', packetDigests, 'receipt.packetDigests');
  digestEntries(value.contributionDigests, 'id', contributionDigests, 'receipt.contributionDigests');
  list(value.disclosures, 32, 'receipt.disclosures');
  let lastOrder = -1;
  const seen = new Set();
  for (const disclosure of value.disclosures) {
    object(disclosure, ['exposure', 'position'], ['exposure', 'position'], 'receipt.disclosure');
    const exposure = parseCharacterExposure(disclosure.exposure, exposureContext);
    // Current-player passages are consumed by analysis, never persisted as request-local IDs.
    if (exposure.source.type !== 'contribution' || !contributionDigests.has(exposure.source.contributionId)
        || exposure.dependsOnIds.some(id => !seen.has(id))) invalid('receipt.disclosure.source');
    const position = parseCharacterNarrativePosition(disclosure.position, { source });
    if (position.order <= lastOrder || seen.has(exposure.id)) invalid('receipt.disclosure.order');
    lastOrder = position.order;
    seen.add(exposure.id);
  }
  return structuredClone(value);
}
