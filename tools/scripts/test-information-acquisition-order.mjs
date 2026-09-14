import assert from 'node:assert/strict';
import { materializeContinuityChanges, pruneContinuityEvents, rebindContinuityEventsSync } from '../../src/story/continuity-events.mjs';
import { validateContinuityEvent } from '../../src/story/continuity-contracts.mjs';
import { createCharacterInformationProjection } from '../../src/story/character-information.mjs';
import { makeMaterializeInput } from './story-director-test-fixtures.mjs';

const input = makeMaterializeInput({ knownLinkIds: ['person.nayar'] });
const earlierReceipt = 'Restoration is expected at sixteen hundred.';
const laterReceipt = 'Restoration is expected at fifteen hundred.';
input.sourcePair.previousAssistant.text = `The dispatch reads: ${laterReceipt} Sam keeps the dispatch private.`;
input.sourcePair.currentPlayer.text = `Sam tells Nayar: ${earlierReceipt} Then Sam reads Nayar the private dispatch aloud.`;
const fact = (text, sourceSlot, audienceQuote, audienceSlot = 'currentPlayer') => ({
  operation: 'addFact', threadRef: 'restoration', text,
  claimType: 'character-claim', authoredRef: null, supersedesFactId: null,
  sourceSlot, evidenceQuote: text,
  informationAccess: {
    recipientIds: ['person.nayar'], acquisition: 'heard',
    audienceEvidence: [{ sourceSlot: audienceSlot, evidenceQuote: audienceQuote }],
  },
});
input.changes = [
  { operation: 'open', localRef: 'restoration', title: 'Restoration reports', category: 'information',
    sourceSlot: 'previousAssistant', evidenceQuote: laterReceipt },
  fact(earlierReceipt, 'currentPlayer', 'Sam tells Nayar:'),
  fact(laterReceipt, 'previousAssistant', 'Then Sam reads Nayar the private dispatch aloud.'),
];
const project = (events, extra = {}) => createCharacterInformationProjection({
  events, personIds: ['person.nayar'], maxCharacters: 10000, ...extra,
});
const events = await materializeContinuityChanges(input);
assert.equal(project(events, { maxStatementsPerCharacter: 1 }).characters[0].statements[0].text, laterReceipt,
  'the most recently delivered statement survives the one-statement cap');
assert.deepEqual(events.filter(e => e.operation === 'addFact').map(e => e.payload.text), [earlierReceipt, laterReceipt]);
assert.deepEqual(await materializeContinuityChanges({ ...input, changes: input.changes.toReversed() }), events,
  'equivalent proposals have the same event identities and acquisition order');
assert.deepEqual(project(JSON.parse(JSON.stringify(events))), project(events), 'save/load retains acquisition order');

const many = structuredClone(input);
const competing = ['seventeen', 'eighteen', 'nineteen', 'twenty', 'twenty-one'].map(hour => `Restoration is expected at ${hour} hundred.`);
many.sourcePair.currentPlayer.text = `Sam tells Nayar: ${[earlierReceipt, ...competing].join(' ')} Then Sam reads Nayar the private dispatch aloud.`;
many.changes.splice(2, 0, ...competing.map(text => fact(text, 'currentPlayer', 'Sam tells Nayar:')));
const manyEvents = await materializeContinuityChanges(many);
const bounded = project(manyEvents);
assert.equal(bounded.characters[0].statements.length, 6);
assert.equal(bounded.characters[0].statements[0].text, laterReceipt, 'latest delivery survives the default cap');
assert.equal(bounded.characters[0].statements.some(s => s.text === earlierReceipt), false);
assert.equal(bounded.omittedStatementCount, 1);

assert.deepEqual(project(pruneContinuityEvents(events, ['contribution.u8'])).characters, [], 'editing the delivery source removes both receipts');
assert.deepEqual(project(pruneContinuityEvents(events, ['contribution.a7'])).characters, [], 'editing primary provenance removes the dependent thread');
assert.deepEqual(project(await materializeContinuityChanges({ ...input, assistantAccepted: false })).characters, [], 'rejected assistant evidence grants no access');
const playerThread = structuredClone(input);
playerThread.changes[0] = { ...playerThread.changes[0], sourceSlot: 'currentPlayer', evidenceQuote: earlierReceipt };
const playerThreadEvents = await materializeContinuityChanges(playerThread);
assert.deepEqual(project(pruneContinuityEvents(playerThreadEvents, ['contribution.a7'])).characters[0].statements.map(s => s.text), [earlierReceipt],
  'editing the private statement removes its later receipt but preserves the independent player report');
assert.deepEqual(project(await materializeContinuityChanges({ ...playerThread, assistantAccepted: false })).characters[0].statements.map(s => s.text), [earlierReceipt],
  'rejected assistant evidence leaves the independently grounded player delivery');
const rebound = rebindContinuityEventsSync(events, {
  branchId: 'save.fork', contributionMap: new Map([['contribution.a7', 'fork.a7'], ['contribution.u8', 'fork.u8']]),
}).events;
assert.equal(rebound.every(e => validateContinuityEvent(e).ok), true);
assert.equal(project(rebound, { maxStatementsPerCharacter: 1 }).characters[0].statements[0].text, laterReceipt);
assert.deepEqual(project(pruneContinuityEvents(rebound, ['fork.u8'])).characters, []);

const briefing = structuredClone(input);
briefing.sourcePair.previousAssistant.text = `Nayar listens to the briefing. ${earlierReceipt} ${laterReceipt}`;
briefing.changes = [briefing.changes[0], ...[laterReceipt, earlierReceipt].map(text => fact(text, 'previousAssistant', 'Nayar listens to the briefing.', 'previousAssistant'))];
const briefingEvents = await materializeContinuityChanges(briefing);
assert.deepEqual(project(briefingEvents).characters[0].statements.map(s => s.text), [laterReceipt, earlierReceipt], 'shared presence evidence preserves statement sequence in an ordinary briefing');

// A common later receipt is one acquisition occasion. Statement sequence can
// order its contents without claiming separate times of delivery.
briefing.sourcePair.currentPlayer.text = 'Sam reads Nayar the complete briefing aloud.';
for (const change of briefing.changes.slice(1)) change.informationAccess.audienceEvidence = [{ sourceSlot: 'currentPlayer', evidenceQuote: briefing.sourcePair.currentPlayer.text }];
assert.deepEqual(project(await materializeContinuityChanges(briefing)).characters[0].statements.map(s => s.text), [laterReceipt, earlierReceipt]);

const ambiguous = structuredClone(input);
ambiguous.sourcePair.currentPlayer.text = `Then Sam reads Nayar the private dispatch aloud. Sam tells Nayar: ${earlierReceipt} Then Sam reads Nayar the private dispatch aloud.`;
await assert.rejects(materializeContinuityChanges(ambiguous), /continuity-information-access-occurrence-ambiguous/,
  'repeated receipt evidence spanning another disclosure requires an unambiguous longer quote');
ambiguous.changes[2].informationAccess.audienceEvidence[0].evidenceQuote = `${earlierReceipt} Then Sam reads Nayar the private dispatch aloud.`;
assert.equal(project(await materializeContinuityChanges(ambiguous), { maxStatementsPerCharacter: 1 }).characters[0].statements[0].text, laterReceipt,
  'a longer exact receipt quote resolves the ambiguity');
const repeatedOrigin = structuredClone(input);
repeatedOrigin.sourcePair.previousAssistant.text += ` ${laterReceipt}`;
assert.equal(project(await materializeContinuityChanges(repeatedOrigin), { maxStatementsPerCharacter: 1 }).characters[0].statements[0].text, laterReceipt,
  'repeated older statement text does not obscure its unique later delivery');
const supportingAudience = structuredClone(input);
supportingAudience.changes[2].informationAccess.audienceEvidence.unshift({ sourceSlot: 'previousAssistant', evidenceQuote: 'Sam keeps the dispatch private.' });
assert.equal(project(await materializeContinuityChanges(supportingAudience), { maxStatementsPerCharacter: 1 }).characters[0].statements[0].text, laterReceipt,
  'earlier contextual audience evidence does not replace the later receipt');
console.log('Information acquisition order tests passed.');
