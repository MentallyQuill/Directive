import assert from 'node:assert/strict';
import { createStoryDirector, createStoryDirectionAnalyst, parseStoryDirectionOutput, createFocusedStorySchema, validateStoryDirectorRequest } from '../../src/story/story-director.mjs';
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
    assert.equal(payload.maxTokens, 32768);
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
const invalidObjectiveDirection = parseStoryDirectionOutput({
  kind: 'directive.storyDirectionAnalystProposal.v1',
  envelope: request.envelope,
  direction: { ...legacy.direction, move: 'continue-thread', targetRef: 'opportunity.assignment' },
}, { request });
assert.equal(invalidObjectiveDirection.ok, false, 'continue-thread cannot target an authored opportunity');
assert.ok(invalidObjectiveDirection.errors.includes('director-direction-target-invalid'), 'stable error code remains available to consumers');
const actionableTargetError = invalidObjectiveDirection.errors.find(error => error !== 'director-direction-target-invalid' && error.startsWith('director-direction-target-invalid'));
assert.ok(actionableTargetError, 'invalid direction targets include an actionable diagnostic');
assert.ok(actionableTargetError.length <= 240);
assert.match(actionableTargetError, /move=continue-thread/);
assert.match(actionableTargetError, /targetRef=opportunity\.assignment/);
assert.match(actionableTargetError, /no continuity\.records IDs/i);
assert.match(actionableTargetError, /respond-to-player.*targetRef=null/i);
const longThreadId = `continuity-thread.${'x'.repeat(180)}`;
const longIdRequest = { ...request, continuity: { ...request.continuity, records: [{ id: longThreadId }] } };
const longIdDirection = parseStoryDirectionOutput({
  kind: 'directive.storyDirectionAnalystProposal.v1',
  envelope: request.envelope,
  direction: { ...legacy.direction, move: 'continue-thread', targetRef: 'opportunity.assignment' },
}, { request: longIdRequest });
const longIdTargetError = longIdDirection.errors.find(error => error !== 'director-direction-target-invalid' && error.startsWith('director-direction-target-invalid'));
assert.ok(longIdTargetError.length <= 240);
assert.equal(longIdTargetError.includes('...'), false, 'diagnostics must never present a shortened identifier as an allowed choice');
assert.match(longIdTargetError, /see supplied continuity\.records IDs/i);
const threadTargetRequest = {
  ...request,
  authoredContext: {
    ...request.authoredContext,
    constraints: [...request.authoredContext.constraints, {
      id: 'ship-constraint.sensor-corroboration-required',
      kind: 'runtime-condition',
      text: 'Corroborate uncertain sensor readings.',
    }],
  },
  continuity: {
    ...request.continuity,
    records: [{ id: 'continuity-thread.handover', title: 'Command handover', status: 'active' }],
  },
};
const invalidThreadRequires = parseStoryDirectionOutput({
  kind: 'directive.storyDirectionAnalystProposal.v1',
  envelope: request.envelope,
  direction: {
    move: 'continue-thread',
    targetRef: 'continuity-thread.handover',
    newComplications: 'avoid',
    requires: ['ship-constraint.sensor-corroboration-required'],
  },
}, { request: threadTargetRequest });
assert.equal(invalidThreadRequires.ok, false, 'continuity targets cannot claim unrelated global constraints as requirements');
assert.ok(invalidThreadRequires.errors.includes('director-direction-requires-invalid'));
const actionableRequiresError = invalidThreadRequires.errors.find(error => error.startsWith('director-direction-requires-invalid detail:'));
assert.ok(actionableRequiresError, 'target-specific requirement rejection includes actionable feedback');
assert.ok(actionableRequiresError.length <= 240);
assert.match(actionableRequiresError, /move=continue-thread/);
assert.match(actionableRequiresError, /targetRef=continuity-thread\.handover/);
assert.match(actionableRequiresError, /requires=\[\]/);
const focusedDirectionSchema = createFocusedStorySchema(threadTargetRequest, 'storyDirectionAnalyst').properties.direction;
assert.equal(
  focusedDirectionSchema.anyOf.some(branch => branch.properties?.requires?.maxItems === 0),
  true,
  'focused direction schema requires empty requirements for continuity moves',
);
for (const direction of [
  { ...legacy.direction, move: 'continue-thread', targetRef: { toString: null } },
  { ...legacy.direction, move: { toString: null }, targetRef: 'opportunity.assignment' },
]) {
  const malformedDirection = parseStoryDirectionOutput({
    kind: 'directive.storyDirectionAnalystProposal.v1', envelope: request.envelope, direction,
  }, { request });
  assert.equal(malformedDirection.ok, false, 'malformed direction values remain strict validation failures');
  assert.ok(malformedDirection.errors.includes('director-direction-target-invalid'));
}
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

const changedLimits = { continuityMaxChanges: 2, continuityTitleCharacters: 200, continuityFactCharacters: 900, continuityEvidenceQuoteCharacters: 300, continuityMaxLinkedIds: 25, continuityLookupRequests: 4, continuityLookupIds: 10, continuityLookupQueryCharacters: 250, directionMaxRequires: 10, requestContextCharacters: 100000 };
const settingsRequest = { ...request, analysisLimits: changedLimits };
const schemaSettings = createFocusedStorySchema(settingsRequest, 'continuityAnalyst');
assert.equal(schemaSettings.properties.threadChanges.maxItems, 2);
assert.equal(schemaSettings.properties.threadChanges.items.anyOf[0].properties.title.maxLength, 200);
assert.equal(schemaSettings.properties.threadChanges.items.anyOf[1].properties.text.maxLength, 900);
assert.equal(schemaSettings.properties.lookupRequests.maxItems, 4);
assert.equal(schemaSettings.properties.lookupRequests.items.properties.query.anyOf[1].maxLength, 250);
assert.equal(createFocusedStorySchema(settingsRequest, 'storyDirectionAnalyst').properties.direction.properties.requires.maxItems, 10);
assert.equal(parseContinuityAnalystOutput(continuity, { request: { ...settingsRequest, analysisLimits: { ...changedLimits, continuityMaxChanges: 1 } } }).ok, false);
assert.equal(validateStoryDirectorRequest({ ...settingsRequest, analysisLimits: { requestContextCharacters: 10 } }).ok, false);
let configuredStoryCall;
const configuredStory = createStoryDirectionAnalyst({ generationRouter: {
    getMaxTokens: () => 48000, getTimeoutMs: () => 180000, getAnalysisLimits: () => changedLimits,
    generate: async (_id, payload, options) => { configuredStoryCall = { payload, options }; return { ok: true, response: { json: { kind: 'directive.storyDirectionAnalystProposal.v1', envelope: request.envelope, direction: { move: 'respond-to-player', targetRef: null, requires: [], newComplications: 'avoid' } } } }; },
} });
assert.equal((await configuredStory({ request })).ok, true);
assert.equal(configuredStoryCall.payload.maxTokens, 48000);
assert.equal(configuredStoryCall.options.timeoutMs, 180000);
assert.equal(configuredStoryCall.payload.jsonSchema.properties.direction.properties.requires.maxItems, 10);
assert.match(configuredStoryCall.payload.systemPrompt, /requires \[\].*continuity thread targets/i);
console.log('Configured story schemas, validators, and uncapped profile budgets passed.');

const feedbackErrors = [null, 42, {}, '', ...Array.from({ length: 12 }, (_, n) => `${n}: ${'x'.repeat(300)}`)];
const expectedFeedbackErrors = feedbackErrors
  .filter(error => typeof error === 'string' && error.trim())
  .slice(0, 8)
  .map(error => error.slice(0, 240));
for (const [role, create, proposal] of [
  ['storyDirectionAnalyst', createStoryDirectionAnalyst, { kind: 'directive.storyDirectionAnalystProposal.v1', envelope: request.envelope, direction: legacy.direction }],
  ['continuityAnalyst', createContinuityAnalyst, continuity],
]) {
  let sentPayload;
  const analyst = create({ generationRouter: { generate: async (_role, payload) => {
    sentPayload = payload;
    return { ok: true, response: { json: proposal } };
  } } });
  assert.equal((await analyst({ request, validationErrors: feedbackErrors })).ok, true);
  const sentRequest = JSON.parse(sentPayload.messages[1].content);
  assert.deepEqual(sentRequest.validationFeedback?.errors, expectedFeedbackErrors, `${role} must receive bounded role-local diagnostics`);
  assert.match(sentPayload.systemPrompt, /diagnostics.*not story evidence/i);
}
console.log('Focused analyst validation feedback bounds passed.');
