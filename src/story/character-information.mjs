import { pruneContinuityEvents } from './continuity-events.mjs';

export const CHARACTER_INFORMATION_POLICY = 'CHARACTER INFORMATION: characterInformation records supported receipt or observation, not truth, belief, or complete knowledge. Shared chat, acceptedStory, workingStory and storyDirection are narrator context, not a briefing delivered to every character. Preserve authored professional competence. Characters may reason from information available to them, ask questions, and hold outdated or mistaken reports. Do not attribute private requests, exact undisclosed schedules, or earlier conversations to a character without an established route. A claim that someone told them is not proof of that past communication. Absence or omission here is unestablished access, not proof of ignorance. A new exchange in this response may convey information only to its established audience in causal order; never invent an earlier off-screen briefing to justify a reaction. Apply this to dialogue, indirect speech, thoughts and narrated actions.';

/** A bounded view of acquired statements over the existing archive. Thread status
 * and world-fact supersession do not erase what an individual previously received.
 * This function never infers an audience, belief, or truth from prose.
 */
export function createCharacterInformationProjection({
  events = [], personIds = [], invalidSourceIds = new Set(),
  maxCharacters = 4000, maxPeople = 8, maxStatementsPerCharacter = 6,
} = {}) {
  if (![maxCharacters, maxPeople, maxStatementsPerCharacter].every(n => Number.isSafeInteger(n) && n > 0)) {
    throw new TypeError('information-projection-budget');
  }
  const people = new Set(personIds);
  const byPerson = new Map();
  const surviving = pruneContinuityEvents(events, invalidSourceIds);
  for (const event of surviving) {
    const access = event.operation === 'addFact' && event.payload?.informationAccess;
    if (!access) continue;
    for (const personId of access.recipientIds) {
      if (!people.has(personId)) continue;
      if (!byPerson.has(personId)) byPerson.set(personId, []);
      byPerson.get(personId).push({
        id: event.id, text: event.payload.text, claimType: event.payload.claimType,
        acquisition: access.acquisition, recordedAtRevision: event.settledAtRevision,
      });
    }
  }
  // Newer records receive priority without treating older records as false or forgotten.
  for (const statements of byPerson.values()) statements.reverse();
  const ordered = [...byPerson].sort((a, b) =>
    (b[1][0].recordedAtRevision ?? 0) - (a[1][0].recordedAtRevision ?? 0) || a[0].localeCompare(b[0]));
  const total = ordered.reduce((n, [, statements]) => n + statements.length, 0);
  const result = {
    kind: 'directive.characterInformationProjection.v1', coverage: 'partial',
    omissionMeaning: 'Access not supplied or not established; never proof of ignorance. Reports are not guaranteed true or believed. New world facts do not automatically update prior recipients.',
    omittedStatementCount: total, omittedCharacterCount: ordered.length, characters: [],
  };
  const size = () => JSON.stringify(result).length;
  if (size() > maxCharacters) throw new TypeError('information-projection-budget');
  for (const [personId, statements] of ordered) {
    if (result.characters.length >= maxPeople) break;
    const character = { personId, statements: [] };
    result.characters.push(character);
    for (const statement of statements.slice(0, maxStatementsPerCharacter)) {
      character.statements.push(statement);
      result.omittedStatementCount--;
      if (size() > maxCharacters) {
        character.statements.pop(); result.omittedStatementCount++;
      }
    }
    if (!character.statements.length) result.characters.pop();
    else result.omittedCharacterCount--;
  }
  return result;
}
