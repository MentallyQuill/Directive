import { createCharacterReviewInput } from './character-knowledge-reviewer.mjs';
import { parseCharacterContributionRecord, parseCharacterKnowledgeReview, parseCharacterSceneReceipt, parseCharacterNarrationSegments } from './character-knowledge-contracts.mjs';
import { characterNarrativeDigest } from '../narration/character-scene-narrator.mjs';
import { captureV1AssistantSourceVariant } from '../runtime/v1-accepted-pair-source.mjs';
import { canonicalJson } from '../storage/v1-state-delta-codec.mjs';
import { stableSha256Hex } from '../runtime/v1-stable-hash.mjs';

const digest = value => stableSha256Hex(canonicalJson(value));
function invalid() { throw Object.assign(new Error('Protected scene receipt does not match its source.'), { code: 'DIRECTIVE_CHARACTER_PUBLICATION_INVALID' }); }
function sourceFromMessage(message) {
  const selected = captureV1AssistantSourceVariant(message);
  if (!selected.ok) invalid();
  return { messageId: selected.value.hostMessageId, selectedSwipeId: selected.value.selectedVariantId, textHash: selected.value.selectedTextHash };
}
function packetDigestGroups(packets) {
  const groups = new Map();
  for (const entry of packets) {
    const list = groups.get(entry.personId) || [];
    list.push({ contributionId: entry.contributionId, digest: entry.digest }); groups.set(entry.personId, list);
  }
  // A person may respond twice with different causal inputs. Retain both identities.
  return new Map([...groups].map(([personId, entries]) => [personId, digest(entries.sort((a, b) => a.contributionId.localeCompare(b.contributionId)))]));
}

export function createCharacterScenePublicationMetadata({ approved, scenePacket, pacing = null, publicationId, source } = {}) {
  const { draft, candidate } = approved || {};
  const { context } = createCharacterReviewInput({ candidate, draft, scenePacket, pacing });
  const review = parseCharacterKnowledgeReview(approved.review, context);
  if (review.verdict !== 'pass' || typeof source?.selectedSwipeId !== 'string' || !/^(0|[1-9][0-9]*)$/.test(source.selectedSwipeId)) invalid();
  const expectedTextSource = sourceFromMessage({ id: source.messageId, mes: candidate.text, swipes: [candidate.text], swipe_id: 0, is_user: false });
  if (source.textHash !== expectedTextSource.textHash) invalid();
  const contributionDigests = new Map(draft.contributions.map(item => [item.id, digest(item)]));
  const packetDigests = packetDigestGroups(draft.packets);
  const segmentOrder = new Map(candidate.segments.filter(item => item.kind === 'character').map((item, index) => [item.id, index]));
  const exposures = [...draft.disclosures].sort((a, b) => segmentOrder.get(a.exposure.source.contributionId) - segmentOrder.get(b.exposure.source.contributionId) || a.order - b.order);
  const receipt = {
    kind: 'directive.characterSceneReceipt.v1', publicationId, flightDigest: draft.flightDigest, source: structuredClone(source),
    candidateDigest: candidate.candidateDigest, supportDigest: context.supportDigest,
    packetDigests: [...packetDigests].map(([personId, digest]) => ({ personId, digest })),
    contributionDigests: [...contributionDigests].map(([id, digest]) => ({ id, digest })), review,
    disclosures: exposures.map(({ exposure }, order) => ({ exposure: structuredClone(exposure), position: { source: structuredClone(source), order } })),
  };
  const exposureContext = { speakerIds: new Set(draft.contributions.map(item => item.personId)),
    audienceIds: new Set(draft.contributions.flatMap(item => item.recipientIds)), passageIds: new Set(),
    contributions: new Map(draft.contributions.map(item => [item.id, item])), exposureIds: new Set(exposures.map(item => item.exposure.id)) };
  parseCharacterSceneReceipt(receipt, { source, flightDigest: draft.flightDigest, reviewContext: context, exposureContext, packetDigests, contributionDigests });
  return { kind: 'directive.characterScenePublication.v1', publicationId, source: structuredClone(source), receipt,
    segments: structuredClone(candidate.segments), contributions: structuredClone(draft.contributions) };
}

/** Selected-source integrity only. Returned disclosures are proposals for existing
 * continuity analysis/validation, never an access grant or an accepted-state patch.
 */
export function readCharacterScenePublication(message) {
  const raw = message?.raw || message || {};
  const index = raw.swipe_id;
  const metadata = Number.isSafeInteger(index) && index >= 0 ? raw.swipe_info?.[index]?.extra?.runtimeMetadata?.characterScenePublication : null;
  if (!metadata) return { status: 'absent' };
  try {
    if (raw.is_user === true || raw.is_system === true || ['user', 'system'].includes(raw.role) || message?.isUser === true || message?.isSystem === true) invalid();
    const keys = ['kind', 'publicationId', 'source', 'receipt', 'segments', 'contributions'];
    if (!metadata || typeof metadata !== 'object' || Object.keys(metadata).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(metadata, key))
      || metadata.kind !== 'directive.characterScenePublication.v1' || JSON.stringify(metadata).length > 128000
      || !Array.isArray(metadata.contributions) || metadata.contributions.length > 16) invalid();
    const source = sourceFromMessage(message);
    if (canonicalJson(source) !== canonicalJson(metadata.source) || metadata.publicationId !== metadata.receipt?.publicationId) invalid();
    const contributions = metadata.contributions.map(parseCharacterContributionRecord);
    const segments = parseCharacterNarrationSegments(metadata.segments, { contributions });
    const byId = new Map(contributions.map(item => [item.id, item]));
    const text = segments.map(item => item.kind === 'character' ? byId.get(item.id).text : item.text).join('\n\n');
    if (text !== raw.mes || text.length > 24000 || characterNarrativeDigest({ segments, text }) !== metadata.receipt.candidateDigest) invalid();
    const receipt = metadata.receipt;
    const contributionDigests = new Map(contributions.map(item => [item.id, digest(item)]));
    if (!Array.isArray(receipt.packetDigests) || receipt.packetDigests.length > 16 || !Array.isArray(receipt.disclosures) || receipt.disclosures.length > 32) invalid();
    const packetDigests = new Map(receipt.packetDigests.map(item => [item.personId, item.digest]));
    if (packetDigests.size !== new Set(contributions.map(item => item.personId)).size || contributions.some(item => !packetDigests.has(item.personId))) invalid();
    const reviewContext = { candidateDigest: receipt.candidateDigest, supportDigest: receipt.supportDigest,
      segmentIds: new Set(segments.map(item => item.id)), subjectIds: new Set(['narrator', ...contributions.map(item => item.personId)]), supportIds: new Set() };
    const exposureContext = { speakerIds: new Set(contributions.map(item => item.personId)), audienceIds: new Set(contributions.flatMap(item => item.recipientIds)),
      passageIds: new Set(), contributions: byId, exposureIds: new Set(receipt.disclosures.map(item => item.exposure?.id)) };
    parseCharacterSceneReceipt(receipt, { source, flightDigest: receipt.flightDigest, reviewContext, exposureContext, packetDigests, contributionDigests });
    const segmentOrder = new Map(segments.map((item, index) => [item.id, index]));
    let lastSegment = -1;
    for (const item of receipt.disclosures) {
      const segment = segmentOrder.get(item.exposure.source.contributionId);
      if (item.exposure.text !== byId.get(item.exposure.source.contributionId)?.text || !Number.isInteger(segment) || segment < lastSegment) invalid();
      lastSegment = segment;
    }
    return { status: 'valid', admission: 'proposal-only', source, publicationId: metadata.publicationId,
      receipt: structuredClone(receipt), contributions, segments };
  } catch {
    return { status: 'invalid', reasonCode: 'DIRECTIVE_CHARACTER_PUBLICATION_INVALID' };
  }
}
