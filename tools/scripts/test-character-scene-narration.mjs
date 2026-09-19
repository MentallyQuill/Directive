import assert from 'node:assert/strict';
import { createCharacterSceneNarrator, createProtectedNarrationPacing } from '../../src/narration/character-scene-narrator.mjs';
import { createTurnAttemptBudget } from '../../src/generation/turn-attempt-budget.mjs';
import { assertIsolatedGenerationRequest } from '../../src/generation/isolated-request.mjs';
const scene = { kind: 'directive.playerScenePacket.v1', player: { personId: 'person.player', name: 'Captain' }, situation: 'At the hatch.', information: [{ id: 'fact.hatch', text: 'The hatch is sealed.' }], constraints: [], visiblePersonIds: ['person.a', 'person.player'] };
const contribution = { id: 'line.a', personId: 'person.a', kind: 'speech', mode: 'ordinary', text: 'Ready.', basisIds: [], recipientIds: ['person.player'], dependsOnIds: [] };
let segments = [{ kind: 'prose', id: 'segment.1', text: 'A waits beside the hatch.' }, { kind: 'character', id: 'line.a' }];
const calls = [];
const narrator = createCharacterSceneNarrator({ generation: { async generate(role, request, options) {
  assert.equal(role, 'sceneNarrator'); assertIsolatedGenerationRequest(request); options.attemptBudget.claim(); calls.push(request);
  return { ok: true, response: { text: JSON.stringify({ segments }) } };
} } });
const args = { scenePacket: scene, contributions: [contribution], budget: createTurnAttemptBudget(), settings: { pov: 'second-person', tense: 'present', secret: 'SECRET_PRESET' } };
const result = await narrator.narrate(args);
assert.equal(result.text, 'A waits beside the hatch.\n\nReady.');
assert.match(result.candidateDigest, /^[a-f0-9]{64}$/);
assert.ok(!JSON.stringify(calls).includes('SECRET_PRESET'));
assert.ok(JSON.stringify(calls).includes('Use second person'));
for (const invalid of [[segments[0]], [...segments, segments[1]], [{ kind: 'character', id: 'line.forged' }]]) {
  segments = invalid;
  await assert.rejects(narrator.narrate(args), { code: 'DIRECTIVE_CHARACTER_KNOWLEDGE_INVALID' });
}
await assert.rejects(narrator.narrate({ ...args, contributions: [{ ...contribution, recipientIds: ['person.other'] }] }), { code: 'DIRECTIVE_CHARACTER_NARRATION_INVALID' });
await assert.rejects(narrator.narrate({ ...args, scenePacket: { ...scene, secretDossier: 'SECRET' } }), { code: 'DIRECTIVE_CHARACTER_NARRATION_INVALID' });
assert.equal(createProtectedNarrationPacing({}), null);
{
  const formatCalls = [];
  const formatBudget = createTurnAttemptBudget({ limit: 3 });
  const reviewReservation = formatBudget.reserve('review', 1);
  const recovering = createCharacterSceneNarrator({ generation: { async generate(role, request, options) {
    options.attemptBudget.claim(); formatCalls.push(request);
    return { ok: true, response: { text: formatCalls.length === 1
      ? 'At the hatch.\n{"kind":"character","id":"line.a"}\nReady.'
      : JSON.stringify({ segments: [{ kind: 'character', id: 'line.a' }] }) } };
  } } });
  const recovered = await recovering.narrate({ ...args, budget: formatBudget });
  assert.equal(recovered.text, 'Ready.');
  assert.equal(formatCalls.length, 2);
  assert.equal(formatBudget.used, 2);
  assert.equal(formatBudget.available, 0);
  assert.equal(formatBudget.release(reviewReservation), 1);
  assert.deepEqual(JSON.parse(formatCalls[0].messages[1].content).contributions, JSON.parse(formatCalls[1].messages[1].content).contributions);
  assert.match(formatCalls[1].messages[0].content, /JSON object/);
}
for (const mode of ['repeated-format', 'reserved-budget', 'provider-failure', 'stopped']) {
  let attempts = 0;
  const controller = new AbortController();
  const boundedBudget = createTurnAttemptBudget({ limit: mode === 'reserved-budget' ? 2 : 4, signal: controller.signal });
  boundedBudget.reserve('review', 1);
  const bounded = createCharacterSceneNarrator({ generation: { async generate(role, request, options) {
    options.attemptBudget.claim(); attempts++;
    if (mode === 'provider-failure') return { ok: false, error: { code: 'provider_token_limit' } };
    if (mode === 'stopped') controller.abort();
    return { ok: true, response: { text: 'Plain narration without structured segments.' } };
  } } });
  await assert.rejects(bounded.narrate({ ...args, budget: boundedBudget, signal: controller.signal }));
  assert.equal(attempts, mode === 'repeated-format' ? 2 : 1, mode);
}
console.log('PASS isolated narrator preserves exact contributions, rejects missing references and hidden audiences');
