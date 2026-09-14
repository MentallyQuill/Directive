import assert from 'node:assert/strict';
import { materializeContinuityChanges, projectContinuityThreads, pruneContinuityEvents } from '../../src/story/continuity-events.mjs';
import { makeMaterializeInput } from './story-director-test-fixtures.mjs';

const input = makeMaterializeInput();
const existingEvents = await materializeContinuityChanges(input);
const threadRef = existingEvents[0].threadId;
const resolved = 'Your request is resolved; the transfer is complete.';
const reopened = 'Actually, reopen the transfer request for another delivery.';
const status = (value, sourceSlot, evidenceQuote) => ({
  operation: 'setStatus', threadRef, status: value, sourceSlot, evidenceQuote,
});
const settle = (sourcePair, changes) => materializeContinuityChanges({
  ...input, sourcePair, changes, existingEvents, sourceRangeHash: 'pair.next', settledAtRevision: 2,
  contributionIds: { previousAssistant: 'contribution.a9', currentPlayer: 'contribution.u10' },
});
const sourcePair = structuredClone(input.sourcePair);
sourcePair.previousAssistant.text = resolved;
sourcePair.currentPlayer.text = reopened;
const changes = [status('resolved', 'previousAssistant', resolved), status('active', 'currentPlayer', reopened)];
const events = await settle(sourcePair, changes);
assert.equal(projectContinuityThreads(events)[0].status, 'active', 'later player reopening survives earlier assistant resolution');
assert.deepEqual(await settle(sourcePair, changes.toReversed()), events, 'proposal order cannot change causal order or event identity');
assert.equal(projectContinuityThreads(pruneContinuityEvents(events, ['contribution.u10']))[0].status, 'resolved', 'pruning later reopening restores surviving resolution');
assert.equal(projectContinuityThreads(pruneContinuityEvents(events, ['contribution.a9']))[0].status, 'active', 'reopening does not depend on the discarded earlier resolution');
const createdTogether = await materializeContinuityChanges({
  ...input, sourcePair: { ...sourcePair, previousAssistant: { ...sourcePair.previousAssistant, text: `${input.sourcePair.previousAssistant.text} ${resolved}` } },
  changes: [...changes.map(change => ({ ...change, threadRef: 'ravenna' })), ...input.changes],
});
assert.equal(projectContinuityThreads(createdTogether)[0].status, 'active', 'creation and fact dependencies precede the ordered status mutations');
assert.equal(createdTogether[0].operation, 'open');

for (const slot of ['previousAssistant', 'currentPlayer']) {
  // Players may defer/reopen, but only accepted narration may resolve a thread.
  const firstStatus = slot === 'previousAssistant' ? 'resolved' : 'deferred';
  for (const reverse of [false, true]) {
    const pair = structuredClone(sourcePair);
    pair[slot].text = reverse ? `${reopened} ${resolved}` : `${resolved} ${reopened}`;
    const mutations = [status(firstStatus, slot, resolved), status('active', slot, reopened)];
    const result = await settle(pair, mutations.toReversed());
    assert.equal(projectContinuityThreads(result)[0].status, reverse ? firstStatus : 'active', `${slot} mutations follow passage order`);
  }
}

for (const text of [`${resolved} ${reopened} ${resolved}`, `${resolved} ${reopened}`]) {
  const pair = structuredClone(sourcePair);
  pair.previousAssistant.text = text;
  const ambiguousQuote = text.startsWith(resolved) && text.endsWith(resolved) ? resolved : text;
  await assert.rejects(settle(pair, [
    status('resolved', 'previousAssistant', ambiguousQuote),
    status('active', 'previousAssistant', reopened),
  ]), /continuity-status-occurrence-ambiguous/, 'repeated or overlapping contradictory evidence cannot invent an order');
}
for (const [text, expected] of [
  [`${resolved} ${resolved} ${reopened}`, 'active'],
  [`${reopened} ${resolved} ${resolved}`, 'resolved'],
  [`${resolved} ${reopened} ${reopened}`, 'active'],
  [`${reopened} ${reopened} ${resolved}`, 'resolved'],
]) {
  const pair = structuredClone(sourcePair);
  pair.previousAssistant.text = text;
  const mutations = [status('resolved', 'previousAssistant', resolved), status('active', 'previousAssistant', reopened)];
  const ordered = await settle(pair, mutations);
  assert.equal(projectContinuityThreads(ordered)[0].status, expected,
    'repeated evidence is valid when every possible occurrence establishes the same relative order');
  assert.deepEqual(await settle(pair, mutations.toReversed()), ordered);
}
assert.deepEqual(projectContinuityThreads(existingEvents), projectContinuityThreads(JSON.parse(JSON.stringify(existingEvents))), 'legacy archive order remains readable');
console.log('Continuity causal order tests passed.');
