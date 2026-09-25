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
// A supplied but too-short audience quote must identify the nested field for retry.
const shortAudience = structuredClone(proposal);
shortAudience.threadChanges[1].informationAccess.audienceEvidence[0].evidenceQuote = 'Sam tells';
const shortAudienceResult = parseContinuityAnalystOutput(shortAudience, { request });
assert.equal(shortAudienceResult.ok, false, 'short audience evidence remains rejected');
assert.ok(shortAudienceResult.errors.includes('continuity-source-quote-invalid'));
const audienceDiagnostic = shortAudienceResult.errors.find(error => error.includes('threadChanges[1].informationAccess.audienceEvidence[0]'));
assert.ok(audienceDiagnostic, 'retry must identify the invalid nested audience field');
assert.match(audienceDiagnostic, /reason=length/);
assert.match(audienceDiagnostic, /length=9 allowed=12\.\./);
assert.ok(audienceDiagnostic.length <= 240, 'retry detail stays bounded');
for (const [quote, reason] of [['Nayar tells Sam the news.', 'not-contiguous'], [null, 'invalid-type'], ['x'.repeat(241), 'length']]) {
  const invalidAudience = structuredClone(proposal);
  invalidAudience.threadChanges[1].informationAccess.audienceEvidence.push({ sourceSlot: 'currentPlayer', evidenceQuote: quote });
  const parsed = parseContinuityAnalystOutput(invalidAudience, { request });
  assert.equal(parsed.ok, false);
  const detail = parsed.errors.find(error => error.includes('threadChanges[1].informationAccess.audienceEvidence[1]'));
  assert.ok(detail, 'second audience entry receives its own diagnostic');
  assert.ok(detail.includes(`reason=${reason}`));
  assert.ok(detail.length <= 240);
}
const retryRequestBefore = structuredClone(request);
let retryPayload;
let repairedAudience = false;
const retryAnalyst = createContinuityAnalyst({ generationRouter: { generate: async (_role, payload) => {
  retryPayload = payload;
  return { ok: true, response: { json: repairedAudience ? proposal : shortAudience } };
} } });
const rejectedAudience = await retryAnalyst({ request });
assert.equal(rejectedAudience.ok, false);
assert.ok(rejectedAudience.diagnostics.errors.some(error => error.includes('audienceEvidence[0]') && error.includes('allowed=12..')));
assert.equal((await retryAnalyst({ request, validationErrors: rejectedAudience.diagnostics.errors })).ok, false, 'feedback cannot admit repeated invalid evidence');
assert.deepEqual(JSON.parse(retryPayload.messages[1].content).validationFeedback.errors, rejectedAudience.diagnostics.errors);
repairedAudience = true;
assert.equal((await retryAnalyst({ request, validationErrors: rejectedAudience.diagnostics.errors })).ok, true);
assert.deepEqual(request, retryRequestBefore, 'nested feedback never mutates source authority');
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
  assert.match(payload.systemPrompt, /conditional.*NPC response or environment change.*omit informationAccess/i);
  assert.match(payload.systemPrompt, /direct player-controlled speech.*heard access/i);
  assert.match(payload.systemPrompt, /environment change.*directly enacted by the player in currentPlayer.*omit informationAccess/i);
  return { ok: true, response: { json: proposal } };
} } });
assert.equal((await analyst({ request })).ok, true);
assert.equal(calls, 1, 'knowledge extraction shares the existing analysis call');
console.log('PASS information-access schema, recipient identity, extraction policy and single-call route');
