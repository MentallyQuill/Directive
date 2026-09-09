import assert from 'node:assert/strict';
import { validateContinuityChanges, validateContinuityEvent } from '../../src/story/continuity-contracts.mjs';
import { materializeContinuityChanges, projectContinuityThreads, pruneContinuityEvents, rebindContinuityEvents, rebindContinuityEventsSync } from '../../src/story/continuity-events.mjs';
import { makeMaterializeInput } from './story-director-test-fixtures.mjs';

const legacyInput = makeMaterializeInput();
const legacy = await materializeContinuityChanges(legacyInput);
const input = makeMaterializeInput({ knownLinkIds: ['person.nayar'] });
input.changes[0].category = 'information';
input.changes[1].informationAccess = {
  recipientIds: ['person.nayar'], acquisition: 'heard',
  audienceEvidence: [{ sourceSlot: 'currentPlayer', evidenceQuote: 'What flexibility do we have?' }],
};
assert.equal(validateContinuityChanges(input.changes, input).ok, true);
const events = await materializeContinuityChanges(input);
const fact = events.find(e => e.operation === 'addFact');
assert.deepEqual(fact.sourceContributionIds, ['contribution.a7', 'contribution.u8']);
assert.equal(fact.payload.informationAccess.audienceSources[0].messageId, 'u8');
assert.equal(validateContinuityEvent(fact).ok, true);
assert.deepEqual(projectContinuityThreads(events)[0].facts[0].informationAccess, fact.payload.informationAccess);
assert.equal(pruneContinuityEvents(events, new Set(['contribution.u8'])).some(e => e.id === fact.id), false);
assert.deepEqual(pruneContinuityEvents(events, new Set(['contribution.a7'])), []);
const map = new Map([['contribution.a7', 'branch.a7'], ['contribution.u8', 'branch.u8']]);
const options = { branchId: 'save.branch', contributionMap: map };
const rebound = rebindContinuityEventsSync(events, options);
assert.deepEqual(await rebindContinuityEvents(events, options), rebound);
assert.deepEqual(rebound.events[1].sourceContributionIds, ['branch.a7', 'branch.u8']);
assert.deepEqual(rebound.events[1].payload.informationAccess, fact.payload.informationAccess);
assert.throws(() => rebindContinuityEventsSync(events, { ...options, contributionMap: new Map([['contribution.a7', 'branch.a7']]) }), /map-missing/);
for (const metadata of [
  {}, { ...input.changes[1].informationAccess, recipientIds: [] },
  { ...input.changes[1].informationAccess, recipientIds: ['person.unknown'] },
  { ...input.changes[1].informationAccess, recipientIds: Array.from({length: 17}, (_, i) => `person.${i}`) },
  { ...input.changes[1].informationAccess, acquisition: 'assumed' },
  { ...input.changes[1].informationAccess, audienceEvidence: [] },
  { ...input.changes[1].informationAccess, audienceEvidence: Array(3).fill(input.changes[1].informationAccess.audienceEvidence[0]) },
  { ...input.changes[1].informationAccess, audienceEvidence: [{sourceSlot: 'history', evidenceQuote: 'What flexibility do we have?'}] },
  { ...input.changes[1].informationAccess, audienceEvidence: [{sourceSlot: 'currentPlayer', evidenceQuote: 'Nayar is not in this text.'}] },
]) {
  const changes = structuredClone(input.changes);
  changes[1].informationAccess = metadata;
  assert.equal(validateContinuityChanges(changes, input).ok, false, JSON.stringify(metadata));
}
const tampered = structuredClone(fact);
tampered.payload.informationAccess.audienceSources[0].messageId = 'unrelated';
assert.equal(validateContinuityEvent(tampered).ok, false);
for (const metadata of [
  { ...fact.payload.informationAccess, recipientIds: ['person.nayar', 'person.nayar'] },
  { ...fact.payload.informationAccess, acquisition: 'remembered' },
  { ...fact.payload.informationAccess, audienceSources: [] },
  { ...fact.payload.informationAccess, audienceEvidence: [] },
  { ...fact.payload.informationAccess, audienceSources: [null] },
]) {
  assert.equal(validateContinuityEvent({ ...fact, payload: { ...fact.payload, informationAccess: metadata } }).ok, false);
}
const changed = structuredClone(input);
changed.changes[1].informationAccess.acquisition = 'read';
assert.notEqual((await materializeContinuityChanges(changed))[1].id, fact.id);
const superseded = await materializeContinuityChanges({
  ...input, existingEvents: events,
  changes: [{ ...input.changes[1], threadRef: fact.threadId, supersedesFactId: fact.id, text: 'The reported rendezvous has been corrected.' }],
});
assert.equal(projectContinuityThreads(superseded)[0].facts.length, 1);
assert.deepEqual(superseded.find(e => e.id === fact.id), fact, 'supersession retains archived access');
const resolved = await materializeContinuityChanges({
  ...input, existingEvents: superseded,
  changes: [{ operation: 'setStatus', threadRef: fact.threadId, status: 'resolved', sourceSlot: 'previousAssistant', evidenceQuote: 'Rendezvous 1400.' }],
});
assert.equal(projectContinuityThreads(resolved)[0].status, 'resolved');
assert.deepEqual(resolved.find(e => e.id === fact.id), fact, 'resolution retains archived access');
const reboundResolved = rebindContinuityEventsSync(resolved, options);
assert.equal(reboundResolved.events.every(e => validateContinuityEvent(e).ok), true);
assert.deepEqual(pruneContinuityEvents(reboundResolved.events, new Set(['branch.u8'])).map(e => e.operation), ['open']);
const sameSource = structuredClone(input);
sameSource.changes[1].informationAccess.audienceEvidence = [{ sourceSlot: 'previousAssistant', evidenceQuote: 'The tender awaits your response.' }];
const sameSourceFact = (await materializeContinuityChanges(sameSource))[1];
assert.equal(sameSourceFact.sources.length, 1);
assert.equal(validateContinuityEvent(sameSourceFact).ok, true);
const player = structuredClone(input);
player.changes[0] = { ...player.changes[0], category: 'obligation', sourceSlot: 'currentPlayer', evidenceQuote: 'What flexibility do we have?' };
player.changes[1] = { ...player.changes[1], sourceSlot: 'currentPlayer', evidenceQuote: 'What flexibility do we have?', claimType: 'player-commitment', informationAccess: sameSource.changes[1].informationAccess };
player.assistantAccepted = false;
assert.equal((await materializeContinuityChanges(player)).some(e => e.operation === 'addFact'), false);
assert.deepEqual(await materializeContinuityChanges(legacyInput), legacy);
const nullInput = structuredClone(legacyInput);
nullInput.changes[1].informationAccess = null;
assert.deepEqual(await materializeContinuityChanges(nullInput), legacy, 'null metadata preserves legacy hashes');
assert.equal(Object.hasOwn(legacy[1].payload, 'informationAccess'), false);
const ordered = structuredClone(input);
ordered.sourcePair.previousAssistant.text = 'Zulu launch is confirmed. Alpha launch is cancelled.';
ordered.changes[0].evidenceQuote = 'Zulu launch is confirmed.';
const firstStatement = { ...ordered.changes[1], text: 'Zulu launch is confirmed.', evidenceQuote: 'Zulu launch is confirmed.' };
const lastStatement = { ...ordered.changes[1], text: 'Alpha launch is cancelled.', evidenceQuote: 'Alpha launch is cancelled.' };
ordered.changes = [ordered.changes[0], lastStatement, firstStatement];
const orderedEvents = await materializeContinuityChanges(ordered);
assert.deepEqual(orderedEvents.filter(e => e.operation === 'addFact').map(e => e.payload.text), [firstStatement.text, lastStatement.text], 'received statements follow their primary source order, not proposal or lexical order');
assert.deepEqual(await materializeContinuityChanges({ ...ordered, changes: [ordered.changes[0], firstStatement, lastStatement] }), orderedEvents);
const playerClaim = { ...input.changes[1], text: 'The player shares a briefing.', sourceSlot: 'currentPlayer', evidenceQuote: 'What flexibility do we have?', claimType: 'character-claim' };
const mixedEvents = await materializeContinuityChanges({ ...ordered, changes: [ordered.changes[0], playerClaim, lastStatement, firstStatement] });
assert.deepEqual(mixedEvents.filter(e => e.operation === 'addFact').map(e => e.payload.text), [firstStatement.text, lastStatement.text, playerClaim.text], 'assistant source precedes current player disclosures');
assert.equal(validateContinuityEvent(mixedEvents.at(-1)).ok, true);
console.log('Information access event tests passed');
