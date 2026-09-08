import assert from 'node:assert/strict';

import {
  createDirectorReceipt,
  createPendingDossier,
  requireSourceQuote,
  validateContinuityChanges,
} from '../../src/story/continuity-contracts.mjs';
import {
  materializeContinuityChanges,
  projectContinuityThreads,
  pruneContinuityEvents,
} from '../../src/story/continuity-events.mjs';
import {
  makeChanges,
  makeMaterializeInput,
  makeSourcePair,
} from './story-director-test-fixtures.mjs';

const directorReceipt = await createDirectorReceipt({
  branchId: 'save.test',
  packageId: 'package.breckenridge',
  packageVersion: '1',
  missionId: 'mission.prelude',
  generationType: 'normal',
  generationTargetKey: 'generation-target.test',
  requestKey: 'turn-analysis.test',
  reuseKey: 'reuse.test',
  sourceRangeHash: 'pair.test',
  sourceContributionIds: ['contribution.a7', 'contribution.u8'],
  instruction: 'Respond to the player and preserve the scheduled rendezvous.',
  dependencyIds: ['continuity-thread.test'],
  settledAtRevision: 1,
});
assert.match(directorReceipt.id, /^director-receipt\.[a-f0-9]{64}$/);
assert.equal(directorReceipt.generationTargetKey, 'generation-target.test');
assert.equal(directorReceipt.reuseKey, 'reuse.test');
assert.deepEqual(await createDirectorReceipt({ ...directorReceipt, id: undefined }), directorReceipt);

const pendingDossier = await createPendingDossier({
  personId: 'mara-whitaker',
  introductionSourceContributionIds: ['contribution.a7'],
  publicContext: { displayName: 'Mara Whitaker', introductionSummary: 'Whitaker reported aboard.' },
});
assert.match(pendingDossier.id, /^pending-dossier\.[a-f0-9]{64}$/);
assert.equal(pendingDossier.status, 'pending');
assert.equal(pendingDossier.attemptCount, 0);

const sourcePair = makeSourcePair();
assert.deepEqual(requireSourceQuote({
  sourceSlot: 'previousAssistant',
  evidenceQuote: '  Rendezvous   1400. ',
}, sourcePair), {
  messageId: 'a7',
  selectedSwipeId: '0',
  textHash: 'abcd1234',
  evidenceQuote: 'Rendezvous 1400.',
});
assert.throws(
  () => requireSourceQuote({ sourceSlot: 'history', evidenceQuote: 'Rendezvous 1400.' }, sourcePair),
  /source-slot-invalid/,
);

const input = makeMaterializeInput();
const events = await materializeContinuityChanges(input);
const [ravenna] = projectContinuityThreads(events);
assert.equal(ravenna.status, 'active');
assert.equal(ravenna.facts.length, 1);
assert.equal(ravenna.facts[0].claimType, 'narrated-fact');
assert.deepEqual(await materializeContinuityChanges(input), events);
assert.deepEqual(await materializeContinuityChanges({ ...input, assistantAccepted: false }), []);
await assert.rejects(materializeContinuityChanges({
  ...input,
  changes: [{
    ...makeChanges()[1],
    threadRef: projectContinuityThreads(events)[0].id,
    authoredRef: 'opportunity.untrusted',
  }],
  existingEvents: events,
}), /authored-ref-unknown/);
assert.equal((await materializeContinuityChanges({
  ...input,
  changes: [{ ...makeChanges()[1], threadRef: projectContinuityThreads(events)[0].id, authoredRef: 'opportunity.allowed' }],
  existingEvents: events,
  authoredIds: ['opportunity.allowed'],
})).length, events.length + 1);
await assert.rejects(materializeContinuityChanges({
  ...input,
  existingEvents: events.map((event) => ({ ...event, branchId: 'save.other' })),
}), /existing-event-branch/);
assert.deepEqual(
  projectContinuityThreads(pruneContinuityEvents(events, new Set(['contribution.a7']))),
  [],
);
await assert.rejects(materializeContinuityChanges({
  ...input,
  changes: [{ ...makeChanges()[0], evidenceQuote: 'This text does not occur.' }],
}), /quote/);

const replayed = await materializeContinuityChanges({
  ...input,
  existingEvents: events,
  settledAtRevision: 99,
});
assert.deepEqual(replayed, events, 'exact same-pair replay is a no-op even at a later revision');

const claimsSourcePair = {
  previousAssistant: {
    messageId: 'a9', selectedSwipeId: '0', textHash: 'claimhash',
    text: 'Whitaker says the tender may already be compromised.',
  },
  currentPlayer: {
    messageId: 'u10', selectedSwipeId: null, textHash: 'commithash',
    text: 'I promise to inspect the tender after the briefing.',
  },
};
const claims = [
  {
    operation: 'open', localRef: 'tender', title: 'Tender inspection',
    category: 'obligation', sourceSlot: 'currentPlayer',
    evidenceQuote: 'I promise to inspect the tender after the briefing.',
  },
  {
    operation: 'addFact', threadRef: 'tender', text: 'The captain committed to inspect the tender.',
    claimType: 'player-commitment', authoredRef: null, supersedesFactId: null,
    sourceSlot: 'currentPlayer', evidenceQuote: 'I promise to inspect the tender after the briefing.',
  },
  {
    operation: 'addFact', threadRef: 'tender', text: 'Whitaker claims the tender may be compromised.',
    claimType: 'character-claim', authoredRef: null, supersedesFactId: null,
    sourceSlot: 'previousAssistant', evidenceQuote: 'the tender may already be compromised.',
  },
];
assert.deepEqual(validateContinuityChanges(claims, {
  sourcePair: claimsSourcePair,
  existingThreads: [],
  authoredIds: [],
}), { ok: true, errors: [] });
const claimEvents = await materializeContinuityChanges(makeMaterializeInput({
  changes: claims,
  sourcePair: claimsSourcePair,
  contributionIds: {
    previousAssistant: 'contribution.a9',
    currentPlayer: 'contribution.u10',
  },
  sourceRangeHash: 'pair.claims',
}));
assert.deepEqual(
  projectContinuityThreads(claimEvents)[0].facts.map(({ claimType }) => claimType).sort(),
  ['character-claim', 'player-commitment'],
);

const rejectedMixed = [
  ...makeChanges().slice(0, 1),
  {
    operation: 'addFact', threadRef: 'ravenna', text: 'The player asks to renegotiate the rendezvous.',
    claimType: 'player-commitment', authoredRef: null, supersedesFactId: null,
    sourceSlot: 'currentPlayer', evidenceQuote: 'What flexibility do we have?',
  },
];
assert.deepEqual(await materializeContinuityChanges(makeMaterializeInput({
  changes: rejectedMixed,
  assistantAccepted: false,
})), [], 'a player change cannot retain a rejected assistant-created local thread');

for (const [label, changes, pattern] of [
  [
    'duplicate local reference',
    [makeChanges()[0], { ...makeChanges()[0], title: 'Duplicate topic' }],
    /local-ref-duplicate/,
  ],
  [
    'unknown field',
    [{ ...makeChanges()[0], rationale: 'model-only prose' }],
    /field-unknown/,
  ],
  [
    'player attempted resolution',
    [{
      operation: 'setStatus', threadRef: 'thread.existing', status: 'resolved',
      sourceSlot: 'currentPlayer', evidenceQuote: 'What flexibility do we have?',
    }],
    /resolved-source-invalid/,
  ],
  [
    'unknown authored reference',
    [{
      ...makeChanges()[1], threadRef: 'thread.existing', authoredRef: 'opportunity.hidden',
    }],
    /authored-ref-unknown/,
  ],
]) {
  const result = validateContinuityChanges(changes, {
    sourcePair,
    existingThreads: [{
      id: 'thread.existing', title: 'Existing', category: 'constraint', status: 'active', facts: [], sourceContributionIds: [],
    }],
    authoredIds: [],
  });
  assert.equal(result.ok, false, label);
  assert.match(result.errors.join('\n'), pattern, label);
}

const existingThreads = [
  {
    id: 'thread.one', title: 'One', category: 'constraint', status: 'active',
    facts: [{ id: 'fact.one', text: 'One fact.' }], sourceContributionIds: [],
  },
  {
    id: 'thread.two', title: 'Two', category: 'constraint', status: 'active',
    facts: [{ id: 'fact.two', text: 'Two fact.' }], sourceContributionIds: [],
  },
];
const crossThread = validateContinuityChanges([{
  operation: 'addFact', threadRef: 'thread.two', text: 'A correction aimed at the wrong thread.',
  claimType: 'narrated-fact', authoredRef: null, supersedesFactId: 'fact.one',
  sourceSlot: 'previousAssistant', evidenceQuote: 'Rendezvous 1400.',
}], { sourcePair, existingThreads, authoredIds: [] });
assert.equal(crossThread.ok, false);
assert.match(crossThread.errors.join('\n'), /supersedes-cross-thread/);

const tooMany = Array.from({ length: 17 }, (_, index) => ({
  ...makeChanges()[0], localRef: `topic-${index}`, title: `Topic ${index}`,
}));
assert.match(validateContinuityChanges(tooMany, {
  sourcePair, existingThreads: [], authoredIds: [],
}).errors.join('\n'), /change-count/);

const independentChanges = [
  ...makeChanges(),
  {
    operation: 'open', localRef: 'tender', title: 'Tender response', category: 'obligation',
    sourceSlot: 'previousAssistant', evidenceQuote: 'The tender awaits your response.',
  },
  {
    operation: 'addFact', threadRef: 'tender', text: 'The tender is awaiting a response.',
    claimType: 'narrated-fact', authoredRef: null, supersedesFactId: null,
    sourceSlot: 'previousAssistant', evidenceQuote: 'The tender awaits your response.',
  },
];
const reordered = [independentChanges[2], independentChanges[3], independentChanges[0], independentChanges[1]];
assert.deepEqual(
  await materializeContinuityChanges(makeMaterializeInput({ changes: independentChanges })),
  await materializeContinuityChanges(makeMaterializeInput({ changes: reordered })),
  'independent output order cannot alter event IDs or append order',
);

console.log('Continuity event tests passed.');
