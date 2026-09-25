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
    if (role === 'continuityAnalyst') {
      assert.match(payload.systemPrompt, /IDs must use lowercase letters, digits, periods, underscores, colons, or hyphens, and must start with a lowercase letter or digit\./);
      assert.match(payload.systemPrompt, /Every open localRef must also have an addFact.*same response/i);
      assert.match(payload.systemPrompt, /currentPlayer obligation.*stand alone/i);
      assert.match(payload.systemPrompt, /currentPlayer addFact must use player-commitment/i);
      assert.match(payload.systemPrompt, /character-claim.*informationAccess/i);
      assert.match(payload.systemPrompt, /previousAssistant addFact must never use player-commitment/i);
    }
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
const partialNoteRequest = makeDirectorRequest({
  pendingPair: {
    previousAssistant: {
      messageId: 'assistant.18', selectedSwipeId: '0', textHash: 'hash.assistant.18',
      text: 'Halvard repeats that amber notebook means review only and no authorization to begin.',
    },
    currentPlayer: {
      messageId: 'player.19', selectedSwipeId: null, textHash: 'hash.player.19',
      text: 'On my own PADD I write: Violet lantern means I want a private conversation with the captain. I conceal that line from Halvard.',
    },
  },
  continuity: { index: [], records: [{ id: 'continuity-thread.amber' }] },
});
const partialNoteProposal = {
  kind: 'directive.continuityAnalystProposal.v1', envelope: partialNoteRequest.envelope,
  coverage: 'complete', lookupRequests: [], threadChanges: [{
    operation: 'open', sourceSlot: 'currentPlayer',
    evidenceQuote: 'Violet lantern means I want a private conversation with the captain.',
    localRef: 'violet-lantern-note', title: 'Private violet lantern note', category: 'information',
  }],
};
const ungroundedPartialNote = parseContinuityAnalystOutput(partialNoteProposal, { request: partialNoteRequest });
assert.equal(ungroundedPartialNote.ok, false, 'captured standalone information open remains structurally rejected');
assert.ok(ungroundedPartialNote.errors.includes('continuity-open-ungrounded:violet-lantern-note'));
const invalidCurrentPlayerFact = parseContinuityAnalystOutput({
  ...partialNoteProposal,
  threadChanges: [
    ...partialNoteProposal.threadChanges,
    {
      operation: 'addFact', sourceSlot: 'currentPlayer',
      evidenceQuote: 'Violet lantern means I want a private conversation with the captain.',
      threadRef: 'violet-lantern-note', text: 'The player keeps a private violet lantern note.',
      claimType: 'player-commitment', authoredRef: null, supersedesFactId: null,
    },
    {
      operation: 'addFact', sourceSlot: 'currentPlayer',
      evidenceQuote: 'I conceal that line from Halvard.',
      threadRef: 'continuity-thread.amber', text: 'Halvard correctly understood the prior instruction.',
      claimType: 'narrated-fact', authoredRef: null, supersedesFactId: null,
    },
  ],
}, { request: partialNoteRequest });
assert.equal(invalidCurrentPlayerFact.ok, false, 'captured retry cannot turn player text into narrated fact');
assert.ok(invalidCurrentPlayerFact.errors.includes('continuity-player-claim-type-invalid'));
const correctedPartialNote = parseContinuityAnalystOutput({
  ...partialNoteProposal,
  threadChanges: [
    ...partialNoteProposal.threadChanges,
    {
      operation: 'addFact', sourceSlot: 'currentPlayer',
      evidenceQuote: 'Violet lantern means I want a private conversation with the captain.',
      threadRef: 'violet-lantern-note', text: 'The player keeps a private violet lantern note.',
      claimType: 'player-commitment', authoredRef: null, supersedesFactId: null,
    },
    {
      operation: 'addFact', sourceSlot: 'previousAssistant',
      evidenceQuote: 'Halvard repeats that amber notebook means review only and no authorization to begin.',
      threadRef: 'continuity-thread.amber', text: 'Halvard repeated the prior instruction.',
      claimType: 'narrated-fact', authoredRef: null, supersedesFactId: null,
    },
  ],
}, { request: partialNoteRequest });
assert.equal(correctedPartialNote.ok, true, 'grounded private player note and assistant fact use their permitted claim types');
assert.equal(parseContinuityAnalystOutput({
  ...partialNoteProposal,
  threadChanges: [{ ...partialNoteProposal.threadChanges[0], category: 'obligation' }],
}, { request: partialNoteRequest }).ok, true, 'standalone currentPlayer obligation remains the deliberate grounding exception');
assert.equal(parseContinuityAnalystOutput({ ...continuity, threadChanges: [{ ...legacy.threadChanges[0], evidenceQuote: 'A fabricated evidence quote.' }] }, { request }).ok, false);
assert.equal(parseContinuityAnalystOutput({ ...continuity, envelope: { ...request.envelope, baseRevision: 999 } }, { request }).ok, false);
const quoteFailureCases = [{
  label: 'length',
  evidenceQuote: 'Rendezvous at 1400. '.repeat(13),
  reason: 'length',
}, {
  label: 'not contiguous',
  evidenceQuote: 'Rendezvous at 1500.',
  reason: 'not-contiguous',
}, {
  label: 'hostile value',
  evidenceQuote: { toString: null, valueOf: null },
  reason: 'invalid-type',
}];
for (const testCase of quoteFailureCases) {
  let parsed;
  assert.doesNotThrow(() => {
    parsed = parseContinuityAnalystOutput({
      ...continuity,
      threadChanges: [{ ...legacy.threadChanges[0], evidenceQuote: testCase.evidenceQuote }],
    }, { request });
  }, `${testCase.label}: hostile output must not escape validation`);
  assert.equal(parsed.ok, false, `${testCase.label}: invalid quote is rejected`);
  assert.ok(parsed.errors.includes('continuity-source-quote-invalid'), `${testCase.label}: stable error code remains available`);
  const diagnostic = parsed.errors.find((error) => error.startsWith('continuity-source-quote-invalid detail:'));
  assert.ok(diagnostic, `${testCase.label}: actionable diagnostic is included`);
  assert.ok(diagnostic.length <= 240, `${testCase.label}: diagnostic remains bounded`);
  assert.match(diagnostic, /changeIndex=0/);
  assert.match(diagnostic, /sourceSlot=previousAssistant/);
  assert.match(diagnostic, new RegExp(`reason=${testCase.reason}`));
}
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

// A near-match must remain invalid; retries need the exact supplied closed set,
// not another copy of the model's malformed hash. No fuzzy ID repair is allowed.
const suppliedThreadId = 'continuity-thread.d4fa206deb9aae9b817ebfe98d2a30abc700c1555c48e6fbf8c2618aca796756';
const malformedThreadId = 'continuity-thread.d4fa206deb9aae9b817ebfe98d2a30abc700c1555c48e6fbf8c82618aca796756';
const referenceRetryRequest = makeDirectorRequest({ continuity: {
  index: [{ id: 'continuity-thread.index-only' }],
  records: [{ id: suppliedThreadId }, { id: longThreadId }, { id: 'continuity-thread.INVALID' }],
} });
const referenceRetryBefore = structuredClone(referenceRetryRequest);
let referencePayload;
let referenceDispatches = 0;
let returnedThreadId = malformedThreadId;
const referenceAnalyst = createContinuityAnalyst({ generationRouter: { generate: async (_role, payload) => {
  referenceDispatches++;
  referencePayload = payload;
  return { ok: true, response: { json: {
    ...continuity, envelope: referenceRetryRequest.envelope,
    threadChanges: [{ ...legacy.threadChanges[1], threadRef: returnedThreadId }],
  } } };
} } });
const rejectedReference = await referenceAnalyst({ request: referenceRetryRequest });
assert.equal(rejectedReference.ok, false, 'near-match thread ID must not be accepted or automatically corrected');
assert.equal(JSON.parse(referencePayload.messages[1].content).validationFeedback, undefined);
const referenceErrors = rejectedReference.diagnostics.errors;
assert.ok(referenceErrors.includes(`continuity-thread-ref-unknown:${malformedThreadId}`));
returnedThreadId = suppliedThreadId;
assert.equal((await referenceAnalyst({ request: referenceRetryRequest, validationErrors: referenceErrors })).ok, true);
const referenceFeedback = JSON.parse(referencePayload.messages[1].content).validationFeedback;
assert.deepEqual(referenceFeedback.allowedExistingThreadRefs, [suppliedThreadId, longThreadId],
  'retry offers only complete existing record IDs, never index-only IDs or the rejected hash');
assert.deepEqual(referenceRetryRequest, referenceRetryBefore, 'retry guidance must not mutate source context');
await referenceAnalyst({ request: referenceRetryRequest, validationErrors: ['continuity-source-quote-invalid'] });
assert.equal(Object.hasOwn(JSON.parse(referencePayload.messages[1].content).validationFeedback, 'allowedExistingThreadRefs'), false,
  'unrelated errors do not add reference guidance');
assert.equal((await referenceAnalyst({ request: referenceRetryRequest, validationErrors: referenceErrors })).ok, true);
returnedThreadId = malformedThreadId;
assert.equal((await referenceAnalyst({ request: referenceRetryRequest, validationErrors: referenceErrors })).ok, false,
  'reference guidance does not weaken validation if the model repeats its mistake');
await referenceAnalyst({ request: referenceRetryRequest, validationErrors: ['continuity-supersedes-cross-thread:fact.example'] });
assert.deepEqual(JSON.parse(referencePayload.messages[1].content).validationFeedback.allowedExistingThreadRefs, [suppliedThreadId, longThreadId]);
assert.match(referencePayload.systemPrompt, /Copy a matching existing ID verbatim/);
const contextLimit = referencePayload.messages[1].content.length - 10;
const limitedReferenceRequest = { ...referenceRetryRequest, analysisLimits: { requestContextCharacters: contextLimit } };
const beforeOrdinaryDispatch = referenceDispatches;
await referenceAnalyst({ request: limitedReferenceRequest });
assert.equal(referenceDispatches, beforeOrdinaryDispatch + 1, 'unchanged request fits before retry guidance');
const beforeOverflowDispatch = referenceDispatches;
const referenceOverflow = await referenceAnalyst({ request: limitedReferenceRequest, validationErrors: referenceErrors });
assert.equal(referenceOverflow.reasonCode, 'director-context-overflow');
assert.equal(referenceDispatches, beforeOverflowDispatch, 'added reference guidance is included in pre-transport size check');
let directionReferencePayload;
await createStoryDirectionAnalyst({ generationRouter: { generate: async (_role, payload) => {
  directionReferencePayload = payload;
  return { ok: true, response: { json: {
    kind: 'directive.storyDirectionAnalystProposal.v1', envelope: referenceRetryRequest.envelope,
    direction: { move: 'respond-to-player', targetRef: null, requires: [], newComplications: 'avoid' },
  } } };
} } })({ request: referenceRetryRequest, validationErrors: referenceErrors });
assert.equal(Object.hasOwn(JSON.parse(directionReferencePayload.messages[1].content).validationFeedback, 'allowedExistingThreadRefs'), false,
  'continuity diagnostics do not add continuity guidance to the direction role');
console.log('Continuity retry exact-reference guidance and strict rejection passed.');

// Preserve the hydrator's bounded field path through the focused-role parser
// and onto the next request, including nested audience evidence references.
const passageRetryRequest = makeDirectorRequest({
  authoredContext: { ...request.authoredContext,
    references: [{ id: 'person.cross', name: 'Cross', kind: 'person' }],
    referenceIds: ['person.cross'],
  },
  continuity: { index: [], records: [{ id: 'continuity-thread.rendezvous' }] },
  pendingPair: { ...request.pendingPair, previousAssistant: {
    ...request.pendingPair.previousAssistant,
    text: 'Cross says the rendezvous is at 1400 and awaits your response.',
  } },
});
const passageRetryBefore = structuredClone(passageRetryRequest);
let passagePayload;
let correctPassage = false;
const passageAnalyst = createContinuityAnalyst({ generationRouter: { generate: async (_role, payload) => {
  passagePayload = payload;
  const context = JSON.parse(payload.messages[1].content);
  const source = context.evidencePassages.find(entry => entry.sourceSlot === 'previousAssistant');
  return { ok: true, response: { json: {
    kind: 'directive.continuityAnalystProposal.v1', envelope: passageRetryRequest.envelope,
    coverage: 'complete', lookupRequests: [], threadChanges: [{
      operation: 'addFact', evidencePassageId: source.id,
      threadRef: 'continuity-thread.rendezvous', text: 'Cross said the rendezvous is at 1400.',
      claimType: 'character-claim', authoredRef: null, supersedesFactId: null,
      informationAccess: { recipientIds: ['person.cross'], acquisition: 'heard',
        audienceEvidence: [{ evidencePassageId: correctPassage ? source.id : `passage.${'0'.repeat(24)}` }],
      },
    }],
  } } };
} } });
const rejectedPassage = await passageAnalyst({ request: passageRetryRequest });
assert.equal(rejectedPassage.ok, false);
assert.ok(rejectedPassage.diagnostics.errors.includes('evidence_passage_invalid'));
const passageDetail = rejectedPassage.diagnostics.errors.find(error => error.startsWith('threadChanges[0].informationAccess.audienceEvidence[0].evidencePassageId:'));
assert.ok(passageDetail, 'focused parser must retain the exact nested evidence field diagnostic');
assert.ok(passageDetail.length <= 240);
assert.match(passageDetail, /unknown catalog ID.*Copy one exact ID from evidencePassages/);
assert.equal((await passageAnalyst({ request: passageRetryRequest, validationErrors: rejectedPassage.diagnostics.errors })).ok, false,
  'feedback must not accept or guess a replacement for the repeated invalid passage');
assert.deepEqual(JSON.parse(passagePayload.messages[1].content).validationFeedback.errors, rejectedPassage.diagnostics.errors);
correctPassage = true;
assert.equal((await passageAnalyst({ request: passageRetryRequest, validationErrors: rejectedPassage.diagnostics.errors })).ok, true);
assert.deepEqual(passageRetryRequest, passageRetryBefore, 'diagnostic recovery preserves source and authority');
console.log('Continuity nested evidence-reference retry diagnostics passed.');
