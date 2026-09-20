import assert from 'node:assert/strict';
import { createCharacterKnowledgeReviewer, createReviewedCharacterScene } from '../../src/story/character-knowledge-reviewer.mjs';
import { createCharacterSceneNarrator, characterNarrativeDigest } from '../../src/narration/character-scene-narrator.mjs';
import { createCharacterSceneCoordinator } from '../../src/runtime/character-scene-coordinator.mjs';
import { createTurnAttemptBudget } from '../../src/generation/turn-attempt-budget.mjs';
const scene = { kind: 'directive.playerScenePacket.v1', player: { personId: 'person.player', name: 'Captain' }, situation: 'At the hatch.', information: [], constraints: [], visiblePersonIds: ['person.a', 'person.player'] };
const snapshot = { state: { storySettlement: { branchId: 'save.test', revision: 1, continuityEvents: [] } }, sourceIdentities: new Map(), characters: new Map([['person.a', { name: 'Bronn', role: 'Engineer' }]]) };
const identity = { bindingKey: 'chat.test', branchId: 'save.test', sourceDigest: 'a'.repeat(64), settingsDigest: 'b'.repeat(64), epoch: 1 };
let actorCalls = 0, reviewCalls = 0, narrationCalls = 0;
let verdict = 'pass';
const requests = [];
const generation = { async generate(role, request, options) {
  options.attemptBudget.claim(); requests.push({ role, request });
  const input = JSON.parse(request.messages[1].content);
  if (role === 'sceneNarrator') { narrationCalls++; return { text: JSON.stringify({ segments: [{ kind: 'prose', id: 'segment.1', text: 'Bronn had known about the three-minute deadline all along.' }, { kind: 'character', id: 'line.a' }] }) }; }
  reviewCalls++;
  const finding = { id: 'finding.1', segmentId: 'segment.1', subjectId: 'person.a', type: 'unsupported-knowledge', explanation: 'SECRET_REVIEW_CONTENT', supportIds: [] };
  return { text: JSON.stringify({ kind: 'directive.characterKnowledgeReview.v1', candidateDigest: input.candidateDigest, supportDigest: input.supportDigest,
    verdict: verdict === 'pass' ? 'pass' : 'reject', findings: verdict === 'pass' ? [] : [{ ...finding, ...(verdict === 'invalid' ? { segmentId: 'segment.forged' } : {}) }] }) };
} };
const coordinator = createCharacterSceneCoordinator({ responder: { async respond(input) {
  actorCalls++; input.budget.claim();
  return { contribution: { id: input.contributionId, personId: input.packet.personId, kind: 'speech', mode: 'ordinary', text: 'Ready.', basisIds: [], recipientIds: ['person.player'], dependsOnIds: [] } };
} } });
const makeFlight = budget => coordinator.createFlight({ snapshot, identity, playerId: 'person.player', budget, isCurrent: () => true,
  participants: [{ personId: 'person.a', present: true, conscious: true, audience: [{ personId: 'person.player', acquisition: 'heard' }] }],
  plan: [{ id: 'line.a', personId: 'person.a', dependsOnIds: [] }] });
const narrator = createCharacterSceneNarrator({ generation });
const reviewer = createCharacterKnowledgeReviewer({ generation });
const budget = createTurnAttemptBudget();
const flight = makeFlight(budget), draft = await flight.run();
budget.release(flight.finalizationReservations.narration);
const candidate = await narrator.narrate({ scenePacket: scene, contributions: draft.contributions, budget });
budget.release(flight.finalizationReservations.review);
assert.equal((await reviewer.review({ candidate, draft, scenePacket: scene, budget })).review.verdict, 'pass');
verdict = 'reject';
assert.equal((await reviewer.review({ candidate, draft, scenePacket: scene, budget })).review.verdict, 'reject');
verdict = 'invalid';
await assert.rejects(reviewer.review({ candidate, draft, scenePacket: scene, budget }), { code: 'DIRECTIVE_CHARACTER_KNOWLEDGE_INVALID' });
await assert.rejects(reviewer.review({ candidate: { ...candidate, text: 'Changed' }, draft, scenePacket: scene, budget }), { code: 'DIRECTIVE_CHARACTER_REVIEW_INVALID' });
flight.dispose();
verdict = 'reject'; actorCalls = 0; narrationCalls = 0; reviewCalls = 0;
const pipelineBudget = createTurnAttemptBudget();
const pipeline = createReviewedCharacterScene({ narrator, reviewer });
await assert.rejects(pipeline.generate({ flight: makeFlight(pipelineBudget), scenePacket: scene, budget: pipelineBudget }), { code: 'DIRECTIVE_CHARACTER_KNOWLEDGE_REJECTED' });
assert.equal(actorCalls, 1, 'narrator-only repair retains the valid actor');
assert.equal(narrationCalls, 2);
assert.equal(reviewCalls, 2);
assert.ok(requests.filter(item => item.role === 'sceneNarrator').every(item => !JSON.stringify(item.request).includes('SECRET_REVIEW_CONTENT')));
console.log('PASS bounded semantic review, invalid references, candidate integrity and one sanitized repair');
// Malformed, unavailable, and stale reviewer replies must never become a pass.
for (const makeResult of [() => ({ text: '' }), () => ({ text: '{broken' }), () => ({ ok: false, error: { code: 'DIRECTIVE_PROVIDER_UNAVAILABLE' } })]) {
  const broken = createCharacterKnowledgeReviewer({ generation: { async generate() { return makeResult(); } } });
  await assert.rejects(broken.review({ candidate, draft, scenePacket: scene, budget: createTurnAttemptBudget() }));
}
const staleReviewer = createCharacterKnowledgeReviewer({ generation: { async generate() { return { text: JSON.stringify({ kind: 'directive.characterKnowledgeReview.v1', candidateDigest: 'f'.repeat(64), supportDigest: 'e'.repeat(64), verdict: 'pass', findings: [] }) }; } } });
await assert.rejects(staleReviewer.review({ candidate, draft, scenePacket: scene, budget: createTurnAttemptBudget() }), { code: 'DIRECTIVE_CHARACTER_KNOWLEDGE_INVALID' });
const alteredDraft = structuredClone(draft);
alteredDraft.contributions[0].recipientIds = [];
await assert.rejects(reviewer.review({ candidate, draft: alteredDraft, scenePacket: scene, budget: createTurnAttemptBudget() }), { code: 'DIRECTIVE_CHARACTER_REVIEW_INVALID' });
// An actor finding regenerates that actor and is followed by a complete new review.
let actorReviewCount = 0;
const actorReviewer = createCharacterKnowledgeReviewer({ generation: { async generate(role, request, options) {
  options.attemptBudget.claim(); actorReviewCount++;
  const input = JSON.parse(request.messages[1].content);
  return { text: JSON.stringify({ kind: 'directive.characterKnowledgeReview.v1', candidateDigest: input.candidateDigest, supportDigest: input.supportDigest,
    verdict: actorReviewCount === 1 ? 'reject' : 'pass', findings: actorReviewCount === 1 ? [{ id: 'finding.actor', segmentId: 'line.a', subjectId: 'person.a', type: 'unsupported-inference', explanation: 'SECRET_ACTOR_FEEDBACK', supportIds: [] }] : [] }) };
} } });
actorCalls = 0;
const actorBudget = createTurnAttemptBudget();
const actorFlight = makeFlight(actorBudget);
const approved = await createReviewedCharacterScene({ narrator, reviewer: actorReviewer }).generate({ flight: actorFlight, scenePacket: scene, budget: actorBudget });
assert.equal(approved.review.verdict, 'pass');
assert.equal(actorCalls, 2);
assert.equal(actorReviewCount, 2);
actorFlight.assertCurrent(approved.draft.flightDigest);
actorFlight.dispose();
const smallBudget = createTurnAttemptBudget({ limit: 3 });
await assert.rejects(pipeline.generate({ flight: makeFlight(smallBudget), scenePacket: scene, budget: smallBudget }), { code: 'DIRECTIVE_TURN_ATTEMPT_LIMIT' });
// Stop during repair clears the draft and prevents a second review.
const stop = new AbortController();
const stopBudget = createTurnAttemptBudget();
const stopFlight = makeFlight(stopBudget);
let stopNarrations = 0, stopReviews = 0;
const stopPipeline = createReviewedCharacterScene({
  narrator: { async narrate(input) { stopNarrations++; const result = await narrator.narrate(input); if (stopNarrations === 2) stop.abort(); return result; } },
  reviewer: { async review(input) { stopReviews++; return reviewer.review(input); } },
});
await assert.rejects(stopPipeline.generate({ flight: stopFlight, scenePacket: scene, budget: stopBudget, signal: stop.signal }), { code: 'DIRECTIVE_GENERATION_ABORTED' });
assert.equal(stopReviews, 1);
assert.equal(stopFlight.getDraft(), null);
console.log('PASS unavailable/stale reviews, changed audience, actor repair, budget exhaustion and Stop');

// A readable essay is not a review receipt. Request one bounded format correction.
const formatCalls = [], formatBudget = createTurnAttemptBudget({ limit: 3 });
const retainedReservation = formatBudget.reserve('other-role', 1);
const formatReviewer = createCharacterKnowledgeReviewer({ generation: { async generate(role, request, options) {
  options.attemptBudget.claim(); formatCalls.push(request);
  const input = JSON.parse(request.messages[1].content);
  return { text: formatCalls.length === 1 ? 'The full scene respects the support. No findings.' : JSON.stringify({
    kind: 'directive.characterKnowledgeReview.v1', candidateDigest: input.candidateDigest, supportDigest: input.supportDigest, verdict: 'pass', findings: [],
  }) };
} } });
const formatRecovered = await formatReviewer.review({ candidate, draft, scenePacket: scene, budget: formatBudget });
assert.equal(formatRecovered.review.verdict, 'pass');
assert.equal(formatCalls.length, 2);
assert.equal(formatBudget.used, 2);
assert.equal(formatBudget.available, 0);
assert.equal(formatBudget.release(retainedReservation), 1, 'format recovery cannot spend another role reservation');
assert.equal(formatCalls[0].messages[1].content, formatCalls[1].messages[1].content, 'candidate, support and schema remain exact on format correction');
assert.match(formatCalls[1].messages[0].content, /previous response.*invalid.*format/i);
console.log('PASS one bounded reviewer JSON format correction with exact custody');for (const mode of ['repeated-format', 'reserved-budget', 'provider-limit', 'provider-failure', 'stopped', 'stale-digest', 'invalid-reference', 'semantic-reject']) {
  let attempts = 0;
  const controller = new AbortController();
  const limitedBudget = createTurnAttemptBudget({ limit: mode === 'reserved-budget' ? 2 : 4, signal: controller.signal });
  limitedBudget.reserve('retained-role', 1);
  const limitedReviewer = createCharacterKnowledgeReviewer({ generation: { async generate(role, request, options) {
    options.attemptBudget.claim(); attempts++;
    if (mode === 'provider-limit' || mode === 'provider-failure') return { ok: false, error: { code: mode === 'provider-limit' ? 'provider_token_limit' : 'DIRECTIVE_PROVIDER_UNAVAILABLE' } };
    if (mode === 'stopped') controller.abort();
    if (['stale-digest', 'invalid-reference', 'semantic-reject'].includes(mode)) {
      const input = JSON.parse(request.messages[1].content);
      return { text: JSON.stringify({ kind: 'directive.characterKnowledgeReview.v1', candidateDigest: mode === 'stale-digest' ? 'f'.repeat(64) : input.candidateDigest,
        supportDigest: input.supportDigest, verdict: mode === 'stale-digest' ? 'pass' : 'reject', findings: mode === 'stale-digest' ? [] : [{
          id: 'finding.reject', segmentId: mode === 'invalid-reference' ? 'segment.forged' : 'segment.1', subjectId: 'person.a', type: 'unsupported-knowledge', explanation: 'Knowledge exceeds support.', supportIds: [],
        }] }) };
    }
    return { text: 'No findings.' };
  } } });
  const attempt = limitedReviewer.review({ candidate, draft, scenePacket: scene, budget: limitedBudget, signal: controller.signal });
  if (mode === 'semantic-reject') assert.equal((await attempt).review.verdict, 'reject');
  else await assert.rejects(attempt);
  assert.equal(attempts, mode === 'repeated-format' ? 2 : 1, mode);
}
const fullFormatBudget = createTurnAttemptBudget({ limit: 4 });
const fullFormatFlight = makeFlight(fullFormatBudget);
let fullFormatCalls = 0;
const fullFormatReviewer = createCharacterKnowledgeReviewer({ generation: { async generate(role, request, options) {
  options.attemptBudget.claim(); fullFormatCalls++;
  const input = JSON.parse(request.messages[1].content);
  return { text: fullFormatCalls === 1 ? 'No findings.' : JSON.stringify({ kind: 'directive.characterKnowledgeReview.v1',
    candidateDigest: input.candidateDigest, supportDigest: input.supportDigest, verdict: 'pass', findings: [] }) };
} } });
const beforeFormatActors = actorCalls, beforeFormatNarrations = narrationCalls;
const fullFormatApproved = await createReviewedCharacterScene({ narrator, reviewer: fullFormatReviewer }).generate({ flight: fullFormatFlight, scenePacket: scene, budget: fullFormatBudget });
assert.equal(fullFormatApproved.review.verdict, 'pass');
assert.equal(fullFormatBudget.used, 4);
assert.equal(actorCalls - beforeFormatActors, 1);
assert.equal(narrationCalls - beforeFormatNarrations, 1);
fullFormatFlight.assertCurrent(fullFormatApproved.draft.flightDigest);
fullFormatFlight.dispose();
console.log('PASS reviewer correction respects reservations, Stop, provider failures and semantic verdicts without regenerating the scene');