import assert from 'node:assert/strict';
import { createCharacterSceneCoordinator } from '../../src/runtime/character-scene-coordinator.mjs';
import { createTurnAttemptBudget } from '../../src/generation/turn-attempt-budget.mjs';
const snapshot = {
  state: { storySettlement: { branchId: 'save.test', revision: 1, continuityEvents: [] } },
  sourceIdentities: new Map(), characters: new Map([['person.a', { name: 'A', role: 'Engineer' }], ['person.b', { name: 'B', role: 'Officer' }]]),
  authoredKnowledge: [{ id: 'fact.private', type: 'background', text: 'Three minutes remain.', recipientIds: ['person.a'] }],
};
const participants = [
  { personId: 'person.a', present: true, conscious: true, audience: [{ personId: 'person.b', acquisition: 'heard' }] },
  { personId: 'person.b', present: true, conscious: true, audience: [{ personId: 'person.a', acquisition: 'heard' }] },
];
const identity = { bindingKey: 'chat.test', branchId: 'save.test', sourceDigest: 'a'.repeat(64), settingsDigest: 'b'.repeat(64), epoch: 1 };
const plan = [{ id: 'line.a', personId: 'person.a', dependsOnIds: [] }, { id: 'line.b', personId: 'person.b', dependsOnIds: ['line.a'] }];
const packets = [];
const responder = { async respond({ packet, contributionId, audienceIds, priorContributionIds, budget, signal }) {
  assert.equal(signal.aborted, false); budget.claim(); packets.push(packet);
  return { contribution: { id: contributionId, personId: packet.personId, kind: 'speech', mode: 'ordinary', text: packet.personId === 'person.a' ? 'Three minutes remain.' : 'Understood.', basisIds: [], recipientIds: [...audienceIds], dependsOnIds: [...priorContributionIds] } };
} };
const before = structuredClone(snapshot);
const coordinator = createCharacterSceneCoordinator({ responder });
const args = { snapshot, participants, identity, plan, playerId: 'person.player', budget: createTurnAttemptBudget(), isCurrent: () => true };
const flight = coordinator.createFlight(args);
const draft = await flight.run();
assert.deepEqual(draft.contributions.map(item => item.id), ['line.a', 'line.b']);
assert.equal(draft.rounds, 2);
assert.equal(packets[0].information.length, 0);
assert.equal(packets[1].information.length, 1);
assert.equal(packets[1].information[0].claimType, 'character-claim');
assert.equal(packets[1].information[0].text, 'Three minutes remain.');
assert.deepEqual(snapshot, before);
assert.equal(args.budget.available, 6, 'two physical calls used and two finalization slots reserved');
assert.match(draft.disclosures[0].contributionDigest, /^[a-f0-9]{64}$/);
assert.equal(draft.disclosures[0].exposure.source.contributionId, 'line.a');
flight.dispose();
assert.equal(args.budget.available, 8);
assert.throws(() => coordinator.createFlight({ ...args, budget: createTurnAttemptBudget(), plan: [{ ...plan[0], dependsOnIds: ['line.b'] }, plan[1]] }), { code: 'DIRECTIVE_CHARACTER_SCENE_INVALID' });
assert.throws(() => coordinator.createFlight({ ...args, budget: createTurnAttemptBudget({ limit: 3 }) }), { code: 'DIRECTIVE_TURN_ATTEMPT_LIMIT' });
console.log('PASS ordered, flight-local disclosure and finalization reservation');
// Dependency replacement must invalidate B's packet and the old candidate digest.
const replacementBudget = createTurnAttemptBudget();
let report = 'Three minutes remain.';
const replacementPackets = [];
const replacement = createCharacterSceneCoordinator({ responder: { async respond(input) {
  input.budget.claim(); replacementPackets.push(structuredClone(input.packet));
  return { contribution: { ...draft.contributions.find(item => item.id === input.contributionId), text: input.contributionId === 'line.a' ? report : 'Updated.' } };
} } }).createFlight({ ...args, budget: replacementBudget });
const first = await replacement.run();
assert.deepEqual(replacement.invalidate('line.a'), ['line.a', 'line.b']);
assert.equal(replacement.getDraft(), null);
assert.throws(() => replacement.assertCurrent(first.flightDigest), { code: 'DIRECTIVE_CHARACTER_SCENE_STALE' });
report = 'Two minutes remain.';
const second = await replacement.run();
assert.notEqual(second.flightDigest, first.flightDigest);
assert.equal(replacementPackets.at(-1).information[0].text, report);
assert.notEqual(second.packets[1].digest, first.packets[1].digest);
assert.equal(replacementBudget.used, 4);
await replacement.run();
assert.equal(replacementBudget.used, 4, 'unchanged candidate reuses only the exact dependency-complete cache');
replacement.dispose();
// Two independent actors can overlap, but a third cannot exceed concurrency two.
let active = 0, maximumActive = 0;
const parallelSnapshot = structuredClone(snapshot);
parallelSnapshot.characters.set('person.c', { name: 'C', role: 'Navigator' });
const parallel = createCharacterSceneCoordinator({ responder: { async respond(input) {
  input.budget.claim(); active++; maximumActive = Math.max(active, maximumActive);
  await new Promise(resolve => setTimeout(resolve, 5)); active--;
  return { contribution: { ...baseContribution(input), recipientIds: [] } };
} } });
function baseContribution(input) { return { id: input.contributionId, personId: input.packet.personId, kind: 'speech', mode: 'ordinary', text: 'Ready.', basisIds: [], recipientIds: [...input.audienceIds], dependsOnIds: [...input.priorContributionIds] }; }
const parallelFlight = parallel.createFlight({ ...args, snapshot: parallelSnapshot, budget: createTurnAttemptBudget(),
  participants: [...participants, { personId: 'person.c', present: true, conscious: true, audience: [] }],
  plan: ['a', 'b', 'c'].map(letter => ({ id: `line.${letter}`, personId: `person.${letter}`, dependsOnIds: [] })) });
assert.equal((await parallelFlight.run()).rounds, 1);
assert.equal(maximumActive, 2);
parallelFlight.dispose();
// Stop after the first response must prevent a dependent send and release reservations.
const stop = new AbortController();
let stoppedCalls = 0;
const stopBudget = createTurnAttemptBudget({ signal: stop.signal });
const stoppedFlight = createCharacterSceneCoordinator({ responder: { async respond(input) {
  input.budget.claim(); stoppedCalls++; stop.abort(); return { contribution: baseContribution(input) };
} } }).createFlight({ ...args, budget: stopBudget, signal: stop.signal });
await assert.rejects(stoppedFlight.run(), { code: 'DIRECTIVE_GENERATION_ABORTED' });
assert.equal(stoppedCalls, 1);
assert.equal(stoppedFlight.getDraft(), null);
assert.equal(stopBudget.available, 9);
let current = true;
const staleFlight = createCharacterSceneCoordinator({ responder: { async respond(input) {
  input.budget.claim(); current = false; return { contribution: baseContribution(input) };
} } }).createFlight({ ...args, budget: createTurnAttemptBudget(), isCurrent: () => current });
await assert.rejects(staleFlight.run(), { code: 'DIRECTIVE_CHARACTER_SCENE_STALE' });
assert.equal(staleFlight.getDraft(), null);
for (const changes of [{ present: false }, { conscious: false }]) {
  assert.throws(() => coordinator.createFlight({ ...args, budget: createTurnAttemptBudget(), participants: [{ ...participants[0], ...changes }, participants[1]] }), { code: 'DIRECTIVE_CHARACTER_SCENE_INVALID' });
}
assert.deepEqual(snapshot, before);
console.log('PASS dependency replacement, exact cache, bounded concurrency, Stop and stale source');
const mixed = coordinator.createFlight({ ...args, budget: createTurnAttemptBudget(), participants: [
  { ...participants[0], audience: [{ personId: 'person.b', acquisition: 'read' }, { personId: 'person.player', acquisition: 'heard' }] }, participants[1],
] });
const mixedDraft = await mixed.run();
assert.equal(mixedDraft.disclosures.find(item => item.exposure.recipientIds.includes('person.b')).exposure.acquisition, 'read');
assert.equal(mixedDraft.disclosures.find(item => item.exposure.recipientIds.includes('person.player')).exposure.acquisition, 'heard');
mixed.dispose();
console.log('PASS each disclosure preserves its admitted channel modality');
const invalidatedBudget = createTurnAttemptBudget();
let releasePending, startedPending;
const started = new Promise(resolve => { startedPending = resolve; });
const held = createCharacterSceneCoordinator({ responder: { async respond(input) {
  input.budget.claim(); startedPending();
  await new Promise(resolve => { releasePending = resolve; });
  return { contribution: baseContribution(input) };
} } }).createFlight({ ...args, budget: invalidatedBudget });
const oldRun = held.run();
await started;
held.invalidate('line.a');
await assert.rejects(oldRun, { code: 'DIRECTIVE_GENERATION_ABORTED' });
releasePending();
await Promise.resolve();
assert.equal(held.getDraft(), null, 'late completion cannot restore invalidated draft');
held.dispose();
assert.equal(invalidatedBudget.available, 9);
const noGrant = createCharacterSceneCoordinator({ responder: { async respond(input) {
  input.budget.claim(); return { contribution: { ...baseContribution(input), recipientIds: [] } };
} } }).createFlight({ ...args, budget: createTurnAttemptBudget() });
await assert.rejects(noGrant.run(), { code: 'DIRECTIVE_CHARACTER_SCENE_INVALID' });
assert.equal(noGrant.getDraft(), null);
console.log('PASS in-flight replacement rejects late completion and missing disclosure grants');
assert.throws(() => coordinator.createFlight({ ...args, budget: createTurnAttemptBudget(), participants: [{ ...participants[0], audience: [{ personId: 'person.unknown', acquisition: 'heard' }] }, participants[1]], plan: [plan[0]] }), { code: 'DIRECTIVE_CHARACTER_SCENE_INVALID' });
assert.equal(new Set(mixedDraft.disclosures.map(item => item.order)).size, mixedDraft.disclosures.length, 'disclosure positions are unique and ordered for receipts');
console.log('PASS unknown recipients reject and receipt disclosure positions are unique');
const repeatedPackets = [];
const repeatedActor = createCharacterSceneCoordinator({ responder: { async respond(input) {
  input.budget.claim(); repeatedPackets.push({ id: input.contributionId, packet: structuredClone(input.packet) });
  return { contribution: { ...baseContribution(input), text: input.contributionId === 'line.a' ? 'My first report.' : 'Next report.' } };
} } }).createFlight({ ...args, budget: createTurnAttemptBudget(), plan: [plan[0], { ...plan[1], dependsOnIds: [] }, { id: 'line.a2', personId: 'person.a', dependsOnIds: ['line.b'] }] });
const repeatedDraft = await repeatedActor.run();
assert.ok(repeatedDraft.contributions.find(item => item.id === 'line.a2').dependsOnIds.includes('line.a'), 'an actor cannot forget its own earlier contribution in the same flight');
assert.ok(repeatedPackets.find(item => item.id === 'line.a2').packet.information.some(item => item.text === 'My first report.'));
assert.deepEqual(repeatedActor.invalidate('line.a'), ['line.a', 'line.a2']);
repeatedActor.dispose();
console.log('PASS repeated actors retain their own earlier contribution and invalidation dependency');
