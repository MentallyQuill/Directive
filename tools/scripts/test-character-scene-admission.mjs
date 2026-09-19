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
