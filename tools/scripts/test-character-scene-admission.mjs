import assert from 'node:assert/strict';
import { createCharacterSceneAdmission, materializeCharacterSceneAdmission, validateCharacterSceneAdmissionRecord, createCharacterSceneAdmissionSchema } from '../../src/story/character-scene-admission.mjs';
const sourcePair = { previousAssistant: { messageId: 'a1', selectedSwipeId: '0', textHash: '12345678', text: 'A and B stand beside the captain. A opens a radio connection to B.' }, currentPlayer: { messageId: 'u2', selectedSwipeId: null, textHash: '87654321', text: 'Report on the sealed hatch.' } };
const evidence = { sourceSlot: 'previousAssistant', evidenceQuote: 'A and B stand beside the captain.' };
const proposal = { participants: [
  { personId: 'person.a', presence: 'present', perception: [], evidence: [evidence], audience: [{ personId: 'person.b', acquisition: 'heard', evidence: [evidence] }, { personId: 'person.player', acquisition: 'heard', evidence: [evidence] }] },
  { personId: 'person.b', presence: 'present', perception: [], evidence: [evidence], audience: [{ personId: 'person.player', acquisition: 'heard', evidence: [evidence] }] },
], reactions: [{ personId: 'person.a', after: [] }, { personId: 'person.b', after: [0] }], playerContext: [{ sourceSlot: 'currentPlayer', evidenceQuote: 'Report on the sealed hatch.' }] };
const args = { proposal, sourcePair, playerId: 'person.player', knownPersonIds: new Set(['person.a', 'person.b']) };
const record = createCharacterSceneAdmission(args);
assert.equal(validateCharacterSceneAdmissionRecord(record).ok, true);
const admitted = materializeCharacterSceneAdmission(record, args);
assert.equal(admitted.participants.length, 2);
assert.deepEqual(admitted.plan[1].dependsOnIds, [admitted.plan[0].id]);
assert.equal(admitted.playerInformation[0].text, sourcePair.currentPlayer.text);
assert.equal(admitted.participants[0].present, true);
assert.throws(() => createCharacterSceneAdmission({ ...args, proposal: { ...proposal, reactions: [{ personId: 'person.a', after: [1] }, { personId: 'person.b', after: [0] }] } }), { code: 'DIRECTIVE_CHARACTER_SCENE_ADMISSION_INVALID' });
assert.throws(() => createCharacterSceneAdmission({ ...args, proposal: { ...proposal, participants: [{ ...proposal.participants[0], personId: 'person.unknown' }] } }), { code: 'DIRECTIVE_CHARACTER_SCENE_ADMISSION_INVALID' });
assert.throws(() => createCharacterSceneAdmission({ ...args, explicitAudience: new Map([['previousAssistant', new Set(['person.player'])]]) }), { code: 'DIRECTIVE_CHARACTER_SCENE_ADMISSION_INVALID' });
assert.throws(() => materializeCharacterSceneAdmission(record, { ...args, sourcePair: { ...sourcePair, previousAssistant: { ...sourcePair.previousAssistant, textHash: 'changed' } } }), { code: 'DIRECTIVE_CHARACTER_SCENE_ADMISSION_INVALID' });
const badQuote = structuredClone(proposal); badQuote.participants[0].evidence[0].evidenceQuote = 'A is secretly elsewhere.';
assert.throws(() => createCharacterSceneAdmission({ ...args, proposal: badQuote }), { code: 'DIRECTIVE_CHARACTER_SCENE_ADMISSION_INVALID' });
const schema = createCharacterSceneAdmissionSchema({ personIds: ['person.a', 'person.b'], playerId: 'person.player' });
assert.equal(schema.additionalProperties, false);
assert.deepEqual(sourcePair.currentPlayer.text, 'Report on the sealed hatch.');
console.log('PASS source-bound scene admission, closed graph, explicit audience precedence and stale source refusal');

const { parseContinuityAnalystOutput, createContinuityAnalyst } = await import('../../src/story/continuity-analyst.mjs');
const { makeDirectorRequest } = await import('./director-contract-test-fixtures.mjs');
const request = makeDirectorRequest({ pendingPair: sourcePair });
request.currentScene = { characterKnowledge: 'protected', playerId: args.playerId, explicitAudience: {} };
request.authoredContext.references = [...args.knownPersonIds].map(id => ({ id, name: id, kind: 'person' }));
request.authoredContext.referenceIds = [...args.knownPersonIds];
const sceneOutput = { kind: 'directive.continuityAnalystProposal.v1', envelope: request.envelope,
  coverage: 'complete', threadChanges: [], lookupRequests: [], characterScene: structuredClone(proposal) };
assert.equal(parseContinuityAnalystOutput(sceneOutput, { request }).ok, true);
sceneOutput.characterScene.participants[0].audience = [];
const missingAudience = parseContinuityAnalystOutput(sceneOutput, { request });
assert.equal(missingAudience.ok, false);
assert.ok(missingAudience.errors.includes('character-scene-admission-invalid'));
assert.ok(missingAudience.errors.some(error => /characterScene.reactions\[0\].*audience.*player.*omit/i.test(error)), JSON.stringify(missingAudience));
assert.ok(missingAudience.errors.every(error => error.length <= 240), 'admission feedback is bounded');
sceneOutput.characterScene = structuredClone(proposal);
sceneOutput.characterScene.participants[0].personId = args.playerId;
const playerActor = parseContinuityAnalystOutput(sceneOutput, { request });
assert.ok(playerActor.errors.some(error => /characterScene.participants\[0\].personId.*player/i.test(error)), JSON.stringify(playerActor));
const analyst = createContinuityAnalyst({ generationRouter: { generate: async (_role, payload) => {
  assert.match(payload.systemPrompt, /player.*currentScene.playerId/i);
  assert.match(payload.systemPrompt, /similarly named NPC/i);
  assert.match(payload.systemPrompt, /audience.*outgoing/i);
  assert.match(payload.systemPrompt, /every reaction.*audience.*player/i);
  return { ok: true, response: { json: { ...sceneOutput, characterScene: proposal } } };
} } });
assert.equal((await analyst({ request })).ok, true);
console.log('PASS bounded scene admission feedback and explicit player/audience contract');
