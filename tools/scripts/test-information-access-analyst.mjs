import assert from 'node:assert/strict';
import { createContinuityAnalyst, parseContinuityAnalystOutput } from '../../src/story/continuity-analyst.mjs';
import { createFocusedStorySchema } from '../../src/story/story-director.mjs';
import { makeDirectorRequest, makeDirectorOutput } from './director-contract-test-fixtures.mjs';

const request = makeDirectorRequest();
request.authoredContext.referenceIds = ['person.nayar', 'location.cargo'];
request.authoredContext.references = [{ id: 'person.nayar', name: 'Priya Nayar', kind: 'person' }, { id: 'location.cargo', name: 'Cargo bay', kind: 'location' }];
request.pendingPair.currentPlayer.text = 'Sam tells Nayar, "Two Type-9s are standing by as our cargo fallback."';
const changes = makeDirectorOutput(request).threadChanges;
const add = changes.find(change => change.operation === 'addFact');
Object.assign(add, {
  text: 'Sam says two Type-9s are standing by as a cargo fallback.', claimType: 'character-claim',
  sourceSlot: 'currentPlayer', evidenceQuote: 'Two Type-9s are standing by as our cargo fallback.',
  informationAccess: { recipientIds: ['person.nayar'], acquisition: 'heard', audienceEvidence: [{ sourceSlot: 'currentPlayer', evidenceQuote: 'Sam tells Nayar,' }] },
});
const proposal = { kind: 'directive.continuityAnalystProposal.v1', envelope: request.envelope, coverage: 'complete', threadChanges: changes, lookupRequests: [] };
const schema = createFocusedStorySchema(request, 'continuityAnalyst');
assert.match(JSON.stringify(schema), /informationAccess/, 'existing analyst must expose the access contract');
assert.equal(parseContinuityAnalystOutput(proposal, { request }).ok, true, JSON.stringify(parseContinuityAnalystOutput(proposal, { request })));
const bad = structuredClone(proposal);
bad.threadChanges.find(c => c.operation === 'addFact').informationAccess.recipientIds = ['location.cargo'];
assert.equal(parseContinuityAnalystOutput(bad, { request }).ok, false, 'a known location is not a recipient');
for (const malformed of [{}, 42, null, 'person.nayar']) {
  bad.threadChanges.find(c => c.operation === 'addFact').informationAccess.recipientIds = malformed;
  assert.equal(parseContinuityAnalystOutput(bad, { request }).ok, false, 'invalid output returns errors rather than throwing');
}
let calls = 0;
const analyst = createContinuityAnalyst({ generationRouter: { generate: async (role, payload) => {
  calls++;
  assert.equal(role, 'continuityAnalyst');
  assert.match(payload.systemPrompt, /private thoughts/);
  assert.match(payload.systemPrompt, /not proof of that earlier communication/);
  assert.match(payload.systemPrompt, /partial disclosure/);
  return { ok: true, response: { json: proposal } };
} } });
assert.equal((await analyst({ request })).ok, true);
assert.equal(calls, 1, 'knowledge extraction shares the existing analysis call');
console.log('PASS information-access schema, recipient identity, extraction policy and single-call route');
