import assert from 'node:assert/strict';
import { createCharacterResponder } from '../../src/story/character-responder.mjs';
import { createTurnAttemptBudget } from '../../src/generation/turn-attempt-budget.mjs';
import { assertIsolatedGenerationRequest } from '../../src/generation/isolated-request.mjs';
const packet = { kind: 'directive.characterPacket.v1', personId: 'person.bronn', identity: { name: 'Bronn', role: 'Engineer' }, situation: 'At the sealed door.', information: [{ id: 'fact.door', text: 'The door is sealed.', claimType: 'narrated-fact', acquisition: 'observed', status: 'current' }], authoredInformation: [{ id: 'skill.tools', type: 'competence', text: 'Uses ordinary engineering tools.' }] };
const base = { id: 'line.1', personId: packet.personId, kind: 'speech', mode: 'recall', text: 'The door is sealed.', basisIds: ['fact.door'], recipientIds: ['person.player'], dependsOnIds: [] };
const calls = [];
let answer = base;
const generation = { async generate(roleId, request, options) {
  assert.equal(roleId, 'characterResponder'); assertIsolatedGenerationRequest(request);
  options.attemptBudget.claim(); calls.push(request);
  return { text: JSON.stringify(answer) };
} };
const respond = createCharacterResponder({ generation }).respond;
const args = { packet, playerId: 'person.player', contributionId: 'line.1', audienceIds: new Set(['person.player']), priorContributionIds: new Set(), budget: createTurnAttemptBudget({ limit: 20 }) };
assert.deepEqual((await respond(args)).contribution, base);
for (const patch of [{ basisIds: ['fact.private'] }, { personId: 'person.player' }, { recipientIds: ['person.remote'] }, { id: 'line.forged' }, { dependsOnIds: ['line.forged'] }, { worldState: { door: 'open' } }]) {
  answer = { ...base, ...patch };
  await assert.rejects(respond(args), { code: 'DIRECTIVE_CHARACTER_KNOWLEDGE_INVALID' });
}
for (const [mode, basisIds] of [['ordinary', ['skill.tools']], ['inference', ['fact.door']], ['question', []], ['deception', []]]) {
  answer = { ...base, mode, basisIds };
  assert.equal((await respond(args)).contribution.mode, mode);
}
assert.ok(!JSON.stringify(calls).includes('fact.private'), 'invalid model content must not leak into later prompts');
const abort = new AbortController();
const canceled = createCharacterResponder({ generation: { async generate() { abort.abort(); return { text: JSON.stringify(base) }; } } });
await assert.rejects(canceled.respond({ ...args, signal: abort.signal }), { code: 'DIRECTIVE_GENERATION_ABORTED' });
console.log('PASS scoped character response validation, competence, inference, question, deception and Stop');
let retryCount = 0;
const retryRequests = [];
const retried = createCharacterResponder({ generation: { async generate(roleId, request, options) {
  options.attemptBudget.claim(); retryRequests.push(request);
  return { text: JSON.stringify(retryCount++ === 0 ? { ...base, basisIds: ['SECRET_INACCESSIBLE'] } : base) };
} } });
assert.deepEqual((await retried.respond({ ...args, budget: createTurnAttemptBudget({ limit: 2 }), maxAttempts: 2 })).contribution, base);
assert.equal(retryRequests.length, 2);
assert.ok(!JSON.stringify(retryRequests).includes('SECRET_INACCESSIBLE'));
assert.ok(JSON.stringify(retryRequests[1]).includes('validationFeedback'));
const noTransport = createCharacterResponder({ generation: { generate() { assert.fail('invalid caller authority must not send'); } } });
await assert.rejects(noTransport.respond({ ...args, playerId: packet.personId }), { code: 'DIRECTIVE_CHARACTER_KNOWLEDGE_INVALID' });
await assert.rejects(noTransport.respond({ ...args, priorContributionIds: new Set(['line.1']) }), { code: 'DIRECTIVE_CHARACTER_KNOWLEDGE_INVALID' });
answer = { ...base, text: '<script>doSomething()</script>' };
await assert.rejects(respond(args), { code: 'DIRECTIVE_CHARACTER_KNOWLEDGE_INVALID' });
const beforeCanceled = calls.length;
await assert.rejects(respond({ ...args, signal: abort.signal }), { code: 'DIRECTIVE_GENERATION_ABORTED' });
assert.equal(calls.length, beforeCanceled);
console.log('PASS bounded feedback excludes rejected secrets; invalid authority and Stop prevent sends');
const routed = createCharacterResponder({ generation: { async generate() { return { ok: true, response: { text: JSON.stringify(base) } }; } } });
assert.deepEqual((await routed.respond(args)).contribution, base);
const routeFailure = createCharacterResponder({ generation: { async generate() { return { ok: false, error: { code: 'DIRECTIVE_TURN_ATTEMPT_LIMIT', message: 'limit' } }; } } });
await assert.rejects(routeFailure.respond(args), { code: 'DIRECTIVE_TURN_ATTEMPT_LIMIT' });
console.log('PASS shared generation router envelopes retain normalized failures');
answer = base;
await respond({ ...args, repair: true });
assert.ok(JSON.stringify(calls.at(-1)).includes('validationFeedback'));
assert.ok(!JSON.stringify(calls.at(-1)).includes('SECRET_ACTOR_FEEDBACK'));
console.log('PASS actor repair uses fixed scoped feedback');

// A response route is caller authority, not a model choice. K03's private
// PADD action must never be delivered over its mistakenly admitted audio route.
const typedReply = { ...base, kind: 'action', mode: 'ordinary', text: "Whitaker typed 'ivory kestrel 62' on her own PADD, then angled the screen toward Jonah alone.", basisIds: ['skill.tools'] };
const channelRequests = [];
let channelAnswer = typedReply;
const channelResponder = createCharacterResponder({ generation: { async generate(role, request, options) {
  options.attemptBudget.claim(); channelRequests.push(request);
  return { text: JSON.stringify(channelAnswer) };
} } });
const channelArgs = { ...args, budget: createTurnAttemptBudget({ limit: 20 }) };
await assert.rejects(channelResponder.respond({ ...channelArgs, audienceAcquisitions: new Map([['person.player', 'heard']]) }), { code: 'DIRECTIVE_CHARACTER_KNOWLEDGE_INVALID' });
assert.deepEqual(JSON.parse(channelRequests.at(-1).messages[1].content).schema.properties.kind.enum, ['speech']);
assert.deepEqual((await channelResponder.respond({ ...channelArgs, audienceAcquisitions: new Map([['person.player', 'observed']]) })).contribution, typedReply);
assert.deepEqual(JSON.parse(channelRequests.at(-1).messages[1].content).audienceRoutes, [{ personId: 'person.player', acquisition: 'observed' }]);
await assert.rejects(channelResponder.respond({ ...channelArgs, audienceAcquisitions: new Map([['person.player', 'read']]) }), { code: 'DIRECTIVE_CHARACTER_KNOWLEDGE_INVALID' });
channelAnswer = { ...base, recipientIds: ['person.remote'] };
const mixedChannelArgs = { ...channelArgs, audienceIds: new Set(['person.player', 'person.remote']), audienceAcquisitions: new Map([['person.player', 'observed'], ['person.remote', 'heard']]) };
assert.equal((await channelResponder.respond(mixedChannelArgs)).contribution.kind, 'speech');
channelAnswer = { ...typedReply, recipientIds: ['person.player', 'person.remote'] };
await assert.rejects(channelResponder.respond(mixedChannelArgs), { code: 'DIRECTIVE_CHARACTER_KNOWLEDGE_INVALID' });
channelAnswer = typedReply;
assert.deepEqual((await channelResponder.respond(mixedChannelArgs)).contribution.recipientIds, ['person.player']);
for (const routes of [new Map(), new Map([['person.player', 'visual']]), new Map([['person.player', 'heard'], ['person.remote', 'observed']])]) {
  await assert.rejects(noTransport.respond({ ...args, audienceAcquisitions: routes }), { code: 'DIRECTIVE_CHARACTER_KNOWLEDGE_INVALID' });
}
console.log('PASS admitted response channels constrain action recipients without remote visual access');
channelAnswer = { ...base, kind: 'message', text: 'Ready.' };
assert.equal((await channelResponder.respond({ ...channelArgs, audienceAcquisitions: new Map([['person.player', 'read']]) })).contribution.kind, 'message');
channelAnswer = { ...base };
await assert.rejects(channelResponder.respond({ ...channelArgs, audienceAcquisitions: new Map([['person.player', 'read']]) }), { code: 'DIRECTIVE_CHARACTER_KNOWLEDGE_INVALID' });
channelAnswer = { ...base, kind: 'message' };
await assert.rejects(channelResponder.respond({ ...channelArgs, audienceAcquisitions: new Map([['person.player', 'heard']]) }), { code: 'DIRECTIVE_CHARACTER_KNOWLEDGE_INVALID' });
console.log('PASS quoted written content retains read route without granting physical action access');
