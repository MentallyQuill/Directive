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
console.log('PASS isolated narrator preserves exact contributions, rejects missing references and hidden audiences');
