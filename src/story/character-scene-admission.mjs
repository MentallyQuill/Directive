import { canonicalJson } from '../storage/v1-state-delta-codec.mjs';
import { stableSha256Hex } from '../runtime/v1-stable-hash.mjs';

export const CHARACTER_KNOWLEDGE_PLAYER_ID = 'person.directive-player';
const SLOTS = ['previousAssistant', 'currentPlayer'];
const validId = value => typeof value === 'string' && value.length <= 180 && /^[a-z0-9][a-z0-9._:-]*$/.test(value);
const hash = value => stableSha256Hex(canonicalJson(value));
function invalid() { throw Object.assign(new Error('Character scene evidence is invalid.'), { code: 'DIRECTIVE_CHARACTER_SCENE_ADMISSION_INVALID' }); }
function fields(value, names) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Object.keys(value).some(key => !names.includes(key)) || names.some(key => !Object.hasOwn(value, key))) invalid();
}
function array(value, maximum, minimum = 0) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum || Array.from(value).some(item => item === undefined)) invalid();
}
function identities(sourcePair) {
  return Object.fromEntries(SLOTS.map(slot => {
    const source = sourcePair?.[slot];
    if (!source || typeof source.messageId !== 'string' || !source.messageId || source.messageId.length > 300
      || (source.selectedSwipeId !== null && (typeof source.selectedSwipeId !== 'string' || !source.selectedSwipeId))
      || typeof source.textHash !== 'string' || !source.textHash || source.textHash.length > 128) invalid();
    return [slot, { messageId: source.messageId, selectedSwipeId: source.selectedSwipeId, textHash: source.textHash }];
  }));
}
function audienceProjection(explicitAudience = new Map()) {
  if (!(explicitAudience instanceof Map)) invalid();
  return Object.fromEntries([...explicitAudience].sort(([a], [b]) => a.localeCompare(b)).map(([slot, ids]) => {
    if (!SLOTS.includes(slot) || !(ids instanceof Set) || ids.size > 128 || [...ids].some(id => !validId(id))) invalid();
    return [slot, [...ids].sort()];
  }));
}
function validateProposal(proposal, { playerId, people, sourcePair = null, explicitAudience = new Map() }) {
  fields(proposal, ['participants', 'reactions', 'playerContext']);
  array(proposal.participants, 3); array(proposal.reactions, 4); array(proposal.playerContext, 8, 1);
  const evidence = (item, recipientId = null) => {
    fields(item, ['sourceSlot', 'evidenceQuote']);
    if (!SLOTS.includes(item.sourceSlot) || typeof item.evidenceQuote !== 'string' || !item.evidenceQuote.trim() || item.evidenceQuote.length > 320) invalid();
    if (sourcePair) {
      const text = sourcePair[item.sourceSlot]?.text;
      if (typeof text !== 'string' || !text.includes(item.evidenceQuote) || item.evidenceQuote.trim().length < Math.min(12, text.trim().length)) invalid();
    }
    const explicit = explicitAudience.get(item.sourceSlot);
    if (recipientId && explicit && !explicit.has(recipientId)) invalid();
  };
  const participants = new Map();
  for (const person of proposal.participants) {
    fields(person, ['personId', 'presence', 'evidence', 'audience', 'perception']);
    if (!validId(person.personId) || !people.has(person.personId) || person.personId === playerId || participants.has(person.personId)
      || !['present', 'remote'].includes(person.presence)) invalid();
    array(person.perception, 4);
    for (const item of person.perception) {
      fields(item, ['acquisition', 'evidence']);
      if (!['heard', 'observed', 'read'].includes(item.acquisition)) invalid();
      evidence(item.evidence, person.personId);
    }
    array(person.evidence, 2, 1); person.evidence.forEach(item => evidence(item));
    array(person.audience, 4);
    const recipients = new Set();
    for (const route of person.audience) {
      fields(route, ['personId', 'acquisition', 'evidence']);
      if (!people.has(route.personId) || recipients.has(route.personId) || !['heard', 'observed', 'read'].includes(route.acquisition)) invalid();
      array(route.evidence, 2, 1); route.evidence.forEach(item => evidence(item, route.personId));
      recipients.add(route.personId);
    }
    participants.set(person.personId, recipients);
  }
  const after = [];
  const previousByPerson = new Map();
  for (const [index, reaction] of proposal.reactions.entries()) {
    fields(reaction, ['personId', 'after']);
    if (!participants.has(reaction.personId) || !participants.get(reaction.personId).has(playerId)) invalid();
    array(reaction.after, 3);
    if (new Set(reaction.after).size !== reaction.after.length || reaction.after.some(value => !Number.isSafeInteger(value) || value < 0 || value >= proposal.reactions.length || value === index)) invalid();
    const dependencies = [...reaction.after];
    if (previousByPerson.has(reaction.personId) && !dependencies.includes(previousByPerson.get(reaction.personId))) dependencies.push(previousByPerson.get(reaction.personId));
    previousByPerson.set(reaction.personId, index); after.push(dependencies);
  }
  for (const [index, dependencies] of after.entries()) for (const prior of dependencies) {
    const source = proposal.reactions[prior].personId, recipient = proposal.reactions[index].personId;
    if (source !== recipient && !participants.get(source).has(recipient)) invalid();
  }
  const seen = new Set();
  for (let round = 0; seen.size < after.length; round++) {
    const ready = after.flatMap((ids, index) => !seen.has(index) && ids.every(id => seen.has(id)) ? [index] : []);
    if (!ready.length || round >= 2) invalid();
    ready.forEach(index => seen.add(index));
  }
  proposal.playerContext.forEach(item => evidence(item, playerId));
}

export const CHARACTER_SCENE_ANALYSIS_POLICY = [
  'When currentScene.characterKnowledge is protected, also propose characterScene using the supplied schema. Establish only people who can presently react and the exact communication/perception audience; known people are not automatically present, awake or listening.',
  'Every presence and audience edge needs exact source evidence. Remote participants need an established live channel. Do not treat a future plan, attempted connection, private thought, mention, unconscious person or departed person as a present reacting recipient. Explicit host audience restrictions take precedence.',
  'Choose only necessary reactions: at most three actors, four responses and two causal rounds. Respect smaller currentScene.limits ceilings; with one round, each actor can respond only once. reactions.after names zero-based reaction indices, never invented character IDs. Dependent recipients can react only after the proposed source character has contributed. Independent characters may run together. Do not write dialogue.',
  'Each participant perception contains only the source excerpts they can currently hear, observe or read. Include a spoken player request when audible to that person, but never private player thoughts, hidden narration or offscreen events. Preserve speech as a claim and attempted player actions as attempts. Presence alone does not grant access to the whole source.',
  'playerContext contains only source excerpts available to the player, including the player\'s own supplied actions and thoughts. Never select another character\'s private thoughts or an omniscient explanation as player context. Quote enough context to establish each claim. Short sources may be quoted in full.',
  'When currentScene.sceneOnly is true, update only characterScene. Return coverage complete, threadChanges [] and lookupRequests []; the exchange is already interpreted and no new facts may be extracted.',
  'characterScene is preparation evidence, not world truth or accepted knowledge. On lookup-needed return characterScene null. On complete return a fully supported scene even if no NPC needs to respond; ambiguity must remain absent, not fabricated.',
].join('\n');

export function createCharacterSceneAdmissionSchema({ personIds = [], playerId = CHARACTER_KNOWLEDGE_PLAYER_ID, limits = {} } = {}) {
  const actors = personIds.filter(id => id !== playerId);
  const maxActors = Math.min(3, limits.maxActors ?? 3), maxResponses = Math.min(4, limits.maxCharacterCalls ?? 4, maxActors * (limits.maxRounds ?? 2));
  const evidence = { type: 'object', additionalProperties: false, required: ['sourceSlot', 'evidenceQuote'], properties: {
    sourceSlot: { enum: SLOTS }, evidenceQuote: { type: 'string', minLength: 1, maxLength: 320 } } };
  const evidenceList = { type: 'array', minItems: 1, maxItems: 2, items: evidence };
  return { type: 'object', additionalProperties: false, required: ['participants', 'reactions', 'playerContext'], properties: {
    participants: { type: 'array', maxItems: actors.length ? maxActors : 0, items: { type: 'object', additionalProperties: false, required: ['personId', 'presence', 'evidence', 'audience', 'perception'], properties: {
      perception: { type: 'array', maxItems: 4, items: { type: 'object', additionalProperties: false, required: ['acquisition', 'evidence'], properties: { acquisition: { enum: ['heard', 'observed', 'read'] }, evidence } } },
      personId: actors.length ? { enum: actors } : { type: 'string' }, presence: { enum: ['present', 'remote'] }, evidence: evidenceList,
      audience: { type: 'array', maxItems: 4, items: { type: 'object', additionalProperties: false, required: ['personId', 'acquisition', 'evidence'], properties: {
        personId: { enum: [...new Set([...personIds, playerId])] }, acquisition: { enum: ['heard', 'observed', 'read'] }, evidence: evidenceList } } },
    } } },
    reactions: { type: 'array', maxItems: actors.length ? maxResponses : 0, items: { type: 'object', additionalProperties: false, required: ['personId', 'after'], properties: {
      personId: actors.length ? { enum: actors } : { type: 'string' }, after: { type: 'array', maxItems: limits.maxRounds === 1 ? 0 : 3, uniqueItems: true, items: { type: 'integer', minimum: 0, maximum: 3 } } } } },
    playerContext: { type: 'array', minItems: 1, maxItems: 8, items: evidence },
  } };
}

export function createCharacterSceneAdmission({ proposal, sourcePair, playerId, knownPersonIds, explicitAudience = new Map() } = {}) {
  if (!validId(playerId) || !(knownPersonIds instanceof Set) || [...knownPersonIds].some(id => !validId(id))) invalid();
  const sources = identities(sourcePair), hostAudience = audienceProjection(explicitAudience);
  validateProposal(proposal, { playerId, people: new Set([...knownPersonIds, playerId]), sourcePair, explicitAudience });
  return { kind: 'directive.characterSceneAdmission.v1', playerId, sources, hostAudience, proposal: structuredClone(proposal) };
}

export function validateCharacterSceneAdmissionRecord(record) {
  try {
    fields(record, ['kind', 'playerId', 'sources', 'hostAudience', 'proposal']);
    if (record.kind !== 'directive.characterSceneAdmission.v1' || !validId(record.playerId) || JSON.stringify(record).length > 32000) invalid();
    fields(record.sources, SLOTS); SLOTS.forEach(slot => fields(record.sources[slot], ['messageId', 'selectedSwipeId', 'textHash'])); identities(record.sources);
    if (!record.hostAudience || Array.isArray(record.hostAudience) || typeof record.hostAudience !== 'object') invalid();
    const explicit = new Map(Object.entries(record.hostAudience).map(([slot, ids]) => { array(ids, 128); if (new Set(ids).size !== ids.length) invalid(); return [slot, new Set(ids)]; }));
    audienceProjection(explicit);
    array(record.proposal?.participants, 3);
    const people = new Set([record.playerId, ...record.proposal.participants.flatMap(item => [item.personId, ...(item.audience || []).map(route => route.personId)])]);
    if ([...people].some(id => !validId(id))) invalid();
    validateProposal(record.proposal, { playerId: record.playerId, people, explicitAudience: explicit });
    return { ok: true };
  } catch { return { ok: false, errors: ['character-scene-admission-invalid'] }; }
}

export function materializeCharacterSceneAdmission(record, options = {}) {
  if (!validateCharacterSceneAdmissionRecord(record).ok) invalid();
  const checked = createCharacterSceneAdmission({ ...options, playerId: record.playerId, proposal: record.proposal });
  if (canonicalJson(checked) !== canonicalJson(record)) invalid();
  const prefix = `character.${hash(record).slice(0, 24)}`;
  return {
    participants: record.proposal.participants.map(person => ({ personId: person.personId, present: person.presence === 'present', conscious: true,
      reactionPathValidated: person.presence === 'remote', audience: person.audience.map(({ personId, acquisition }) => ({ personId, acquisition })) })),
    plan: record.proposal.reactions.map((reaction, index) => ({ id: `${prefix}.${index}`, personId: reaction.personId, dependsOnIds: reaction.after.map(prior => `${prefix}.${prior}`) })),
    playerInformation: [...new Map(record.proposal.playerContext.map(item => [`scene.${hash(item).slice(0, 24)}`, item.evidenceQuote])).entries()].map(([id, text]) => ({ id, text })),
    perceptions: new Map(record.proposal.participants.map(person => [person.personId, person.perception.map(item => ({
      id: `perception.${hash({ personId: person.personId, sources: record.sources, item }).slice(0, 24)}`,
      text: item.evidence.evidenceQuote,
      claimType: item.acquisition !== 'observed' ? 'character-claim' : item.evidence.sourceSlot === 'currentPlayer' ? 'player-commitment' : 'narrated-fact',
      acquisition: item.acquisition, status: 'current',
    }))])),
    reviewerEvidence: structuredClone(record),
  };
}

/** Private review support; never included in actor/narrator prompts or saved receipts. */
export function materializeCharacterSceneEvidence(value, knownPersonIds) {
  fields(value, ['admission', 'sourcePair']);
  fields(value.sourcePair, SLOTS);
  for (const slot of SLOTS) {
    fields(value.sourcePair[slot], ['messageId', 'selectedSwipeId', 'textHash', 'text']);
    if (typeof value.sourcePair[slot].text !== 'string' || value.sourcePair[slot].text.length > 48000) invalid();
  }
  if (!validateCharacterSceneAdmissionRecord(value.admission).ok) invalid();
  return materializeCharacterSceneAdmission(value.admission, { sourcePair: value.sourcePair, knownPersonIds,
    explicitAudience: new Map(Object.entries(value.admission.hostAudience).map(([slot, ids]) => [slot, new Set(ids)])) });
}
