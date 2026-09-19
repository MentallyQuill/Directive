import { parseCharacterKnowledgePacket, parseCharacterNarrativePosition } from './character-knowledge-contracts.mjs';

function fail(reason) {
  const error = new TypeError(reason);
  error.code = reason === 'knowledge_packet_budget' ? 'DIRECTIVE_CHARACTER_KNOWLEDGE_BUDGET' : 'DIRECTIVE_CHARACTER_KNOWLEDGE_INVALID';
  throw error;
}

/** Final allowlist over normalized, source-admitted candidates. Callers must not
 * pass model-authored recipient grants directly; the archive adapter owns access.
 */
export function compileCharacterPacket({ personId, identity, publicSituation, candidates, validSourceIds, beforeOrder, authoredInformation = [], maxCharacters = 12000, maxEstimatedTokens = 12000 } = {}) {
  if (!Number.isSafeInteger(beforeOrder) || beforeOrder < 0 || !(validSourceIds instanceof Set)
      || !Array.isArray(candidates) || !identity || ![maxCharacters, maxEstimatedTokens].every(value => Number.isSafeInteger(value) && value > 0)) fail('knowledge_packet_invalid');
  const admitted = candidates.filter(item => {
    if (!item || !Array.isArray(item.recipientIds) || !Array.isArray(item.sourceIds)
        || !Number.isSafeInteger(item.learnedAt)
        || !Array.from(item.sourceIds).every(id => typeof id === 'string' && id.length > 0)
        || !Array.from(item.recipientIds).every(id => typeof id === 'string' && id.length > 0)) fail('knowledge_candidate_invalid');
    return item.recipientIds.includes(personId) && item.learnedAt < beforeOrder
      && item.status !== 'retracted' && item.sourceIds.length > 0
      && item.sourceIds.every(id => validSourceIds.has(id));
  });
  if (admitted.length > 128) fail('knowledge_packet_budget');
  const packet = parseCharacterKnowledgePacket({
    kind: 'directive.characterPacket.v1', personId,
    identity: { name: identity.name, role: identity.role }, situation: publicSituation,
    ...(authoredInformation.length ? { authoredInformation } : {}),
    information: admitted.map(item => ({ id: item.id, text: item.text, claimType: item.claimType,
      acquisition: item.acquisition, status: item.status })),
  });
  const serialized = JSON.stringify(packet);
  // UTF-8 bytes provide a conservative fallback estimate until a route has a tokenizer.
  if (serialized.length > maxCharacters || new TextEncoder().encode(serialized).length > maxEstimatedTokens) fail('knowledge_packet_budget');
  return packet;
}

import { pruneContinuityEvents } from './continuity-events.mjs';
import { validateContinuityEvent, requireSourceQuote } from './continuity-contracts.mjs';
import { canonicalJson } from '../storage/v1-state-delta-codec.mjs';
import { stableSha256Hex } from '../runtime/v1-stable-hash.mjs';

function sameSource(left, right) {
  return left && right && left.messageId === right.messageId
    && left.selectedSwipeId === right.selectedSwipeId && left.textHash === right.textHash;
}

/** Snapshot is captured by the runtime from accepted state and its source lineage.
 * It is not a model response. Only source-admitted archive entries reach the wire.
 */
export function createCharacterKnowledgePacket({ snapshot, personId, sourcePair = {}, provisionalExposures = [], beforeOrder = 0, limits = {} } = {}) {
  try {
    const settlement = snapshot?.state?.storySettlement;
    const identity = snapshot?.characters instanceof Map && snapshot.characters.get(personId);
    if (!settlement || !Array.isArray(settlement.continuityEvents) || !identity
        || !(snapshot.sourceIdentities instanceof Map)
        || !Number.isSafeInteger(settlement.revision) || settlement.revision < 0
        || (snapshot.focusByPerson !== undefined && !(snapshot.focusByPerson instanceof Map))
        || (snapshot.perceptionByPerson !== undefined && !(snapshot.perceptionByPerson instanceof Map))) fail('knowledge_snapshot_invalid');
    const invalidSources = new Set(snapshot.invalidSourceIds || []);
    const events = settlement.continuityEvents;
    for (const event of events) {
      if (!validateContinuityEvent(event, { branchId: settlement.branchId, maximumRevision: settlement.revision }).ok) fail('knowledge_archive_invalid');
      event.sourceContributionIds.forEach((id, index) => {
        if (!sameSource(event.sources[index], snapshot.sourceIdentities.get(id))) invalidSources.add(id);
      });
    }
    const surviving = pruneContinuityEvents(events, invalidSources);
    const pending = admitProvisionalExposures({ provisionalExposures, sourcePair, settlement, beforeOrder, surviving, invalidSources, limits, sourceIdentities: snapshot.sourceIdentities });
    const accessible = [...surviving, ...pending.events].filter(event => event.operation === 'addFact'
      && event.payload.informationAccess?.recipientIds.includes(personId));
    // A hidden correction cannot tell this character that an old report is outdated.
    const superseded = new Set(accessible.map(event => event.payload.supersedesFactId).filter(Boolean));
    const candidates = accessible.map(event => ({
      id: event.id, text: event.payload.text, claimType: event.payload.claimType,
      recipientIds: event.payload.informationAccess.recipientIds,
      acquisition: event.payload.informationAccess.acquisition,
      status: superseded.has(event.id) ? 'superseded' : 'current',
      sourceIds: event.sourceContributionIds, learnedAt: pending.orders.get(event.id) ?? -1,
      dependsOnIds: event.dependsOnEventIds, supersedesId: event.payload.supersedesFactId,
    }));
    const authoredKnowledge = snapshot.authoredKnowledge ?? [];
    if (!Array.isArray(authoredKnowledge) || authoredKnowledge.some(item => !item || !Array.isArray(item.recipientIds))) fail('knowledge_authored_invalid');
    const authoredInformation = authoredKnowledge.filter(item => item.recipientIds.includes(personId))
      .map(({ id, type, text }) => ({ id, type, text }));
    const perceptionIds = snapshot.perceptionByPerson?.get(personId) ?? [];
    const eligibleById = new Map([...candidates, ...authoredInformation].map(item => [item.id, item]));
    if (!Array.isArray(perceptionIds) || Array.from(perceptionIds).some(id => !eligibleById.has(id))) fail('knowledge_perception_invalid');
    const focus = snapshot.focusByPerson?.get(personId) ?? {};
    if (!Array.isArray(focus.requiredIds ?? [])) fail('knowledge_reference_unavailable');
    const selected = selectCharacterRecords(candidates, { ...focus, requiredIds: [...(focus.requiredIds ?? []), ...perceptionIds] }, limits.maxRecords ?? 128, authoredInformation);
    const publicSituation = perceptionIds.length
      ? `Current admitted context:\n${perceptionIds.map(id => eligibleById.get(id).text).join('\n')}`
      : 'Respond to the current scene using only your admitted information and professional competence.';
    const packet = compileCharacterPacket({
      personId, identity, candidates: selected, beforeOrder, authoredInformation,
      publicSituation,
      validSourceIds: new Set([...snapshot.sourceIdentities.keys(), ...pending.sourceIds].filter(id => !invalidSources.has(id))),
      maxCharacters: limits.maxCharacters ?? 12000, maxEstimatedTokens: limits.maxEstimatedTokens ?? 12000,
    });
    return { ok: true, packet, digest: stableSha256Hex(canonicalJson(packet)), diagnostics: { eligibleCount: candidates.length, includedCount: packet.information.length, omittedCount: candidates.length - packet.information.length, coverage: candidates.length === packet.information.length ? 'complete' : 'partial' } };
  } catch (error) {
    if (!['DIRECTIVE_CHARACTER_KNOWLEDGE_INVALID', 'DIRECTIVE_CHARACTER_KNOWLEDGE_BUDGET'].includes(error?.code)) throw error;
    return { ok: false, reason: error.message, code: error.code };
  }
}


function selectCharacterRecords(candidates, focus = {}, maxRecords, authoredInformation) {
  if (!Number.isSafeInteger(maxRecords) || maxRecords < 1 || maxRecords > 128) fail('knowledge_retrieval_invalid');
  const byId = new Map(candidates.map(item => [item.id, item]));
  if (byId.size !== candidates.length) fail('knowledge_record_duplicate');
  const accessible = new Map([...byId, ...authoredInformation.map(item => [item.id, item])]);
  const required = focus.requiredIds ?? [];
  const queryIds = focus.queryIds ?? [];
  if (![required, queryIds].every(ids => Array.isArray(ids) && Array.from(ids).every(id => typeof id === 'string' && accessible.has(id)))) fail('knowledge_reference_unavailable');
  const words = text => new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter(word => word.length > 3));
  // Retrieval terms originate only in accessible records, never raw shared chat.
  const query = new Set(queryIds.flatMap(id => [...words(accessible.get(id).text)]));
  const score = item => [...words(item.text)].filter(word => query.has(word)).length;
  function closure(ids) {
    const selected = new Set([...ids].filter(id => byId.has(id)));
    let changed = true;
    while (changed) {
      changed = false;
      for (const item of candidates) {
        if (selected.has(item.id)) {
          for (const id of [...(item.dependsOnIds || []), item.supersedesId]) {
            if (byId.has(id) && !selected.has(id)) { selected.add(id); changed = true; }
          }
        }
        if (selected.has(item.supersedesId) && !selected.has(item.id)) { selected.add(item.id); changed = true; }
      }
    }
    return selected;
  }
  let selected = closure([...required, ...queryIds]);
  if (selected.size > maxRecords) fail('knowledge_packet_budget');
  const ranked = candidates.map((item, index) => ({ item, index, score: score(item) }))
    .sort((a, b) => b.score - a.score || b.index - a.index);
  for (const { item } of ranked) {
    const expanded = closure([...selected, item.id]);
    if (expanded.size <= maxRecords) selected = expanded;
  }
  return candidates.filter(item => selected.has(item.id));
}


function admitProvisionalExposures({ provisionalExposures, sourcePair, settlement, beforeOrder, surviving, invalidSources, limits, sourceIdentities }) {
  if (!Array.isArray(provisionalExposures) || provisionalExposures.length > 32) fail('knowledge_provisional_invalid');
  const events = [], orders = new Map(), sourceIds = new Set();
  const knownIds = new Set(surviving.map(event => event.id));
  const identities = new Map(sourceIdentities);
  let previousOrder = -1;
  for (const entry of provisionalExposures) {
    const event = entry?.event;
    if (!event || !['open', 'addFact'].includes(event.operation) || (event.operation === 'addFact' && !event.payload?.informationAccess)
        || !validateContinuityEvent(event, { branchId: settlement.branchId, maximumRevision: settlement.revision + 1 }).ok) fail('knowledge_provisional_invalid');
    const source = Object.values(sourcePair).find(source => sameSource(source, entry.position?.source));
    if (!source || !event.sources.some(anchor => sameSource(anchor, source))) fail('knowledge_provisional_source');
    const identity = { messageId: source.messageId, selectedSwipeId: source.selectedSwipeId, textHash: source.textHash };
    const position = parseCharacterNarrativePosition(entry.position, { source: identity });
    if (position.order <= previousOrder || knownIds.has(event.id)) fail('knowledge_provisional_order');
    previousOrder = position.order;
    // Source membership is not semantic entailment. Existing analysis/review owns that judgment.
    for (const anchor of [...event.sources, ...(event.payload.informationAccess?.audienceSources || [])]) {
      const slot = ['previousAssistant', 'currentPlayer'].find(slot => sameSource(sourcePair[slot], anchor));
      if (!slot) fail('knowledge_provisional_source');
      try { requireSourceQuote({ sourceSlot: slot, evidenceQuote: anchor.evidenceQuote }, sourcePair, limits); }
      catch { fail('knowledge_provisional_evidence'); }
    }
    event.sourceContributionIds.forEach((id, index) => {
      if (identities.has(id) && !sameSource(identities.get(id), event.sources[index])) fail('knowledge_provisional_source_collision');
      identities.set(id, event.sources[index]);
    });
    if (position.order >= beforeOrder || event.sourceContributionIds.some(id => invalidSources.has(id))
        || event.dependsOnEventIds.some(id => !knownIds.has(id))) continue;
    knownIds.add(event.id);
    events.push(event);
    orders.set(event.id, position.order);
    event.sourceContributionIds.forEach(id => sourceIds.add(id));
  }
  return { events, orders, sourceIds };
}
