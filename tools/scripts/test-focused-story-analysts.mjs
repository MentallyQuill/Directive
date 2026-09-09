import assert from 'node:assert/strict';
import { createStoryDirector, createStoryDirectionAnalyst, parseStoryDirectionOutput } from '../../src/story/story-director.mjs';
import { createContinuityAnalyst, parseContinuityAnalystOutput } from '../../src/story/continuity-analyst.mjs';
import { makeDirectorRequest, makeDirectorOutput, makeEpisodeReviewRequest } from './director-contract-test-fixtures.mjs';

const request = makeDirectorRequest();
const legacy = makeDirectorOutput(request);
for (const [role, create, fields] of [
  ['storyDirectionAnalyst', createStoryDirectionAnalyst, { direction: { move: 'respond-to-player', targetRef: null, requires: [], newComplications: 'avoid' } }],
  ['continuityAnalyst', createContinuityAnalyst, { coverage: 'complete', threadChanges: legacy.threadChanges, lookupRequests: [] }],
]) {
  let malformed = false;
  const run = create({ generationRouter: { getMaxTokens: () => 32768, generate: async (id, payload) => {
    assert.equal(id, role);
    assert.equal(payload.maxTokens, role === 'continuityAnalyst' ? 6144 : 2048);
    const context = JSON.parse(payload.messages[1].content);
    assert.equal(Object.hasOwn(context, 'episodeReview'), false);
    assert.equal(payload.systemPrompt.includes('episodeReview'), false);
    assert.equal(Object.hasOwn(payload.jsonSchema.properties, role === 'continuityAnalyst' ? 'direction' : 'threadChanges'), false);
    return { ok: true, response: { json: { kind: `directive.${role}Proposal.v1`, envelope: request.envelope, ...fields, ...(malformed ? { extra: true } : {}) } } };
  } } });
  const result = await run({ request });
  assert.equal(result.ok, true);
  assert.ok(result.diagnostics.inputCharacters > 0);
  assert.ok(result.diagnostics.outputCharacters > 0);
  malformed = true;
  assert.equal((await run({ request })).ok, false);
}
const continuity = { kind: 'directive.continuityAnalystProposal.v1', envelope: request.envelope, coverage: 'complete', threadChanges: legacy.threadChanges, lookupRequests: [] };
assert.equal(parseContinuityAnalystOutput({ ...continuity, threadChanges: [{ ...legacy.threadChanges[0], evidenceQuote: 'A fabricated evidence quote.' }] }, { request }).ok, false);
assert.equal(parseContinuityAnalystOutput({ ...continuity, envelope: { ...request.envelope, baseRevision: 999 } }, { request }).ok, false);
const lookup = { ...continuity, coverage: 'lookup-needed', threadChanges: [], lookupRequests: [{ threadIds: [], query: 'Ravenna rendezvous' }] };
assert.equal(parseContinuityAnalystOutput(lookup, { request }).ok, true);
assert.equal(parseContinuityAnalystOutput({ ...lookup, threadChanges: legacy.threadChanges }, { request }).ok, false);
assert.equal(parseContinuityAnalystOutput({ ...lookup, lookupRequests: [{ threadIds: [], query: null }] }, { request }).ok, false);
const knownRequest = { ...request, authoredContext: { ...request.authoredContext, referenceIds: ['person.cross'], temporalContext: { elapsedSeconds: 0, secondOfDay: 32400 } } };
const linked = { ...continuity, threadChanges: legacy.threadChanges.map(change => change.operation === 'addFact' ? { ...change, linkedIds: ['person.cross'], deadlineElapsedSeconds: 18000 } : change) };
assert.equal(parseContinuityAnalystOutput(linked, { request: knownRequest }).ok, true);
assert.equal(parseContinuityAnalystOutput(linked, { request }).ok, false, 'unsupplied people cannot become valid link targets');
assert.equal(parseContinuityAnalystOutput({ ...linked, threadChanges: linked.threadChanges.map(change => change.operation === 'addFact' ? { ...change, authoredRef: 'person.cross' } : change) }, { request: knownRequest }).ok, false, 'known people are not authored mechanics authority');
const opaqueRequest = { ...request, authoredContext: { ...request.authoredContext,
  referenceIds: ['person.9a71fe02'], references: [{ id: 'person.9a71fe02', name: 'Cross', kind: 'person' }],
} };
let capturedOpaqueContext;
const opaqueAnalyst = createContinuityAnalyst({ generationRouter: { generate: async (_role, payload) => {
  capturedOpaqueContext = JSON.parse(payload.messages[1].content).authoredContext;
  return { ok: true, response: { json: continuity } };
} } });
assert.equal((await opaqueAnalyst({ request: opaqueRequest })).ok, true);
assert.deepEqual(capturedOpaqueContext.references, [{ id: 'person.9a71fe02', name: 'Cross', kind: 'person' }]);
assert.deepEqual(capturedOpaqueContext.referenceIds, ['person.9a71fe02']);
for (const references of [
  [{ id: 'person.unknown', name: 'Cross', kind: 'person' }],
  [{ id: 'person.9a71fe02', name: 'Cross', kind: 'person', secret: true }],
  [{ id: 'person.9a71fe02', name: 'Cross', kind: 'person' }, { id: 'person.9a71fe02', name: 'Someone else', kind: 'person' }],
]) assert.equal(parseContinuityAnalystOutput(continuity, { request: { ...opaqueRequest, authoredContext: { ...opaqueRequest.authoredContext, references } } }).ok, false);
assert.equal(parseStoryDirectionOutput({ kind: 'directive.storyDirectionAnalystProposal.v1', envelope: request.envelope, direction: { ...legacy.direction, move: 'continue-thread', targetRef: 'rendezvous' } }, { request }).ok, false, 'direction cannot depend on a concurrently opened local thread');
const sizes = {};
const sizingRouter = { generate: async (role, payload) => {
  sizes[role] = payload.messages.reduce((total, message) => total + [...message.content].length, 0);
  return { ok: false };
} };
const combinedRequest = makeDirectorRequest({ episodeReview: makeEpisodeReviewRequest() });
for (const create of [createStoryDirector, createStoryDirectionAnalyst, createContinuityAnalyst]) {
  await create({ generationRouter: sizingRouter })({ request: combinedRequest });
}
assert.ok(sizes.storyDirectionAnalyst < sizes.storyDirector);
assert.ok(sizes.continuityAnalyst < sizes.storyDirector);
console.log('Fixture input characters (not tokens; episode call excluded from split totals):', sizes);
console.log('focused story analysts passed');

// Exercise the actual fake transport with the evaluator's prefixed user prompt.
const { createFakeGenerationClient } = await import('../../src/hosts/fake/fake-host.mjs');
const { createEpisodeEvaluator } = await import('../../src/story/episode-evaluator.mjs');
const fakeGeneration = createFakeGenerationClient();
const review = await createEpisodeEvaluator({ generationRouter: {
  generate: async (role, payload, options) => ({ ok: true, response: await fakeGeneration.generate(role, payload, options) }),
} })({ request: makeEpisodeReviewRequest() });
assert.equal(review.ok, true, 'due episode review must work through the real fake transport');
assert.equal(review.proposal.decision, 'abstain');
