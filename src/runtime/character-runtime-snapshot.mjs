import { captureV1StorySource } from './v1-accepted-pair-source.mjs';
import { selectCurrentStoryEpisodes } from '../story/story-settlement.mjs';
import { createPeopleInterpretationContext } from '../people/accepted-pair-people.mjs';
import { stableSha256Hex } from './v1-stable-hash.mjs';

function invalid() { throw Object.assign(new Error('Character source snapshot is unavailable.'), { code: 'DIRECTIVE_CHARACTER_SNAPSHOT_INVALID' }); }
const compact = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';

/** Read-only runtime projection. Archive anchors never vouch for themselves. */
export function createCharacterRuntimeSnapshot({ campaignState, crewDataset = {}, messages, currentSourceIds = [] } = {}) {
  const settlement = campaignState?.storySettlement;
  if (!settlement || !Array.isArray(settlement.episodes) || !Array.isArray(messages) || !Array.isArray(currentSourceIds)) invalid();
  const selected = new Map();
  for (const message of messages) {
    const captured = captureV1StorySource(message);
    if (!captured.ok) continue;
    if (selected.has(captured.value.messageId)) invalid();
    selected.set(captured.value.messageId, captured.value);
  }
  const episodes = selectCurrentStoryEpisodes(settlement);
  const active = settlement.episodes.find(episode => episode.id === settlement.activeEpisode && episode.status === 'open');
  if (active) episodes.push(structuredClone(active));
  const sourceIdentities = new Map(), invalidSourceIds = new Set();
  for (const contribution of episodes.flatMap(episode => episode.contributions || [])) {
    const source = selected.get(contribution.messageId);
    if (!['user', 'assistant'].includes(contribution.role) || !source || source.role !== contribution.role
      || source.textHash !== contribution.textHash || source.selectedSwipeId !== (contribution.swipeId ?? null)) {
      invalidSourceIds.add(contribution.id); continue;
    }
    const identity = { messageId: source.messageId, selectedSwipeId: source.selectedSwipeId, textHash: source.textHash };
    if (sourceIdentities.has(contribution.id) && JSON.stringify(sourceIdentities.get(contribution.id)) !== JSON.stringify(identity)) invalid();
    sourceIdentities.set(contribution.id, identity);
  }
  for (const id of invalidSourceIds) sourceIdentities.delete(id);
  // Invalid introductions and learned public identities cannot resurrect a person.
  for (const episode of episodes) episode.peopleEvents = (episode.peopleEvents || []).filter(event =>
    Array.isArray(event.sourceContributionIds) && event.sourceContributionIds.length && event.sourceContributionIds.every(id => sourceIdentities.has(id)));
  const known = createPeopleInterpretationContext({ crewDataset, storySettlement: { ...settlement, episodes } }).knownPeople;
  const characters = new Map(known.map(person => [person.id, { name: compact(person.name), role: compact(person.role) || 'Person' }]));
  const authoredKnowledge = [];
  for (const person of crewDataset.officers || []) {
    if (!characters.has(person.id)) continue;
    // Own biography and voice only. No dossier, campaign plot, or other-person fields.
    const own = [
      ['service', 'competence', person.publicRecord?.serviceBackground],
      ['assignment', 'background', person.publicRecord?.assignmentHistory],
      ['species', 'background', person.species],
      ['birthplace', 'background', person.publicRecord?.birthplace],
      ['voice', 'background', person.narrationGuide?.voice],
    ];
    for (const [field, type, value] of own) {
      const text = compact(value);
      if (!text) continue;
      if (text.length > 1900) invalid();
      authoredKnowledge.push({ id: `authored.${stableSha256Hex(`${person.id}:${field}`).slice(0, 24)}`, type,
        text: `${field}: ${text}`, recipientIds: [person.id] });
    }
  }
  const focusByPerson = new Map(), perceptionByPerson = new Map();
  const current = new Set(currentSourceIds);
  for (const personId of characters.keys()) {
    const ids = (settlement.continuityEvents || []).filter(event => event.operation === 'addFact'
      && event.payload.informationAccess?.recipientIds.includes(personId)
      && event.sourceContributionIds.every(id => sourceIdentities.has(id))
      && event.sourceContributionIds.some(id => current.has(id))).map(event => event.id);
    focusByPerson.set(personId, { requiredIds: ids, queryIds: ids });
    perceptionByPerson.set(personId, ids);
  }
  return { state: { storySettlement: structuredClone(settlement) }, sourceIdentities, invalidSourceIds,
    characters, authoredKnowledge, focusByPerson, perceptionByPerson };
}
