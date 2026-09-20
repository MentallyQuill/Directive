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

for (const [text, quote, expected] of [
  ['Lieutenant Nayar, Commander Vale requests the schedule.', 'Lieutenant Nayar, Comm', 'Lieutenant Nayar,'],
  ["The duty captain's scheduling request is pending.", 'The duty captain', 'The duty'],
  ['Commander 𐐀𐐁 requests the schedule.', 'Commander 𐐀', 'Commander'],
  ['He opened a private message to Lieutenant Nayar and typed.', 'ened a private message to Lieutenant Nayar', 'a private message to Lieutenant Nayar'],
  ['Extraordinarily', 'traordinaril', null],
]) {
  const options = { ...args, sourcePair: { ...sourcePair, currentPlayer: { ...sourcePair.currentPlayer, text } },
    proposal: { ...proposal, playerContext: [{ sourceSlot: 'currentPlayer', evidenceQuote: quote }] } };
  const selected = createCharacterSceneAdmission(options);
  const before = JSON.stringify(selected);
  const shown = materializeCharacterSceneAdmission(selected, options).playerInformation;
  assert.deepEqual(shown.map(item => item.text), expected === null ? [] : [expected]);
  if (expected !== null) assert.ok(quote.includes(expected), 'projection can only remove exact edge fragments');
  assert.equal(JSON.stringify(selected), before, 'source evidence and record digest inputs remain untouched');
}
const repeatedText = 'Report on the sealed hatchway. Report on the sealed hatch is requested.';
const repeatedOptions = { ...args,
  sourcePair: { ...sourcePair, currentPlayer: { ...sourcePair.currentPlayer, text: repeatedText } },
  proposal: { ...proposal, playerContext: [{ sourceSlot: 'currentPlayer', evidenceQuote: 'Report on the sealed hatch' }] }
};
const repeated = createCharacterSceneAdmission(repeatedOptions);
assert.equal(materializeCharacterSceneAdmission(repeated, repeatedOptions).playerInformation[0].text, 'Report on the sealed hatch');
const historicalClipped = structuredClone(record);
historicalClipped.proposal.playerContext[0].evidenceQuote = 'Report on the sealed hat';
assert.equal(validateCharacterSceneAdmissionRecord(historicalClipped).ok, true);
const historicalBefore = JSON.stringify(historicalClipped);
const historicalShown = materializeCharacterSceneAdmission(historicalClipped, args);
assert.equal(historicalShown.playerInformation[0].text, 'Report on the sealed');
assert.equal(JSON.stringify(historicalClipped), historicalBefore);
assert.deepEqual(historicalShown.reviewerEvidence, historicalClipped);
assert.equal(historicalShown.playerInformation[0].id, materializeCharacterSceneAdmission(historicalClipped, args).playerInformation[0].id);
assert.throws(() => createCharacterSceneAdmission({ ...args, proposal: { ...proposal, playerContext: [{ sourceSlot: 'currentPlayer', evidenceQuote: 'Invented context is never admitted.' }] } }), { code: 'DIRECTIVE_CHARACTER_SCENE_ADMISSION_INVALID' });
console.log('PASS player scene trims only partial edge words without rejecting or mutating exact source custody');const { createEvidencePassageCatalog, hydrateEvidenceReferences } = await import('../../src/story/evidence-passages.mjs');
// Exact K05 player source: the system catalog, not the model, supplied "ened".
const liveText = 'Jonah kept the combadge audio channel open while shifting his PADD so its screen faced away from Captain Whitaker. He opened a private message to Lieutenant Nayar and typed: **Provisional revised check-in: 22:43, observation lounge. Please text back the time and location you have recorded for me. Keep this off the shared calendar; do not relay it to Captain Whitaker yet.** He sent the message without reading the proposed time or location aloud. Then he returned his attention to the captain. "For continuity, Captain, what check-in time do you currently have from our conversation?" He kept the question limited to her existing understanding and waited, making no claim that the provisional change had taken effect.';
const livePair = { ...sourcePair, currentPlayer: { ...sourcePair.currentPlayer, text: liveText } };
const liveCatalog = createEvidencePassageCatalog({ sourcePair: livePair, requestId: 'k05.valid-window' });
const livePassage = [...liveCatalog.values()].find(item => item.text.startsWith('ened a private message'));
assert.ok(livePassage, 'production catalog itself supplies the partial-word window');
const liveEvidence = hydrateEvidenceReferences({ value: { evidencePassageId: livePassage.id }, catalog: liveCatalog, sourcePair: livePair });
const liveOptions = { ...args, sourcePair: livePair, proposal: { ...proposal, playerContext: [liveEvidence] } };
const liveRecord = createCharacterSceneAdmission(liveOptions);
const liveScene = materializeCharacterSceneAdmission(liveRecord, liveOptions);
assert.equal(liveScene.playerInformation[0].text, livePassage.text.slice(5));
assert.equal(liveRecord.proposal.playerContext[0].evidenceQuote, livePassage.text);
assert.throws(() => hydrateEvidenceReferences({ value: { evidencePassageId: livePassage.id.slice(0, -1) }, catalog: liveCatalog, sourcePair: livePair }), { code: 'DIRECTIVE_EVIDENCE_PASSAGE_INVALID' });
console.log('PASS exact K05 catalog window keeps original evidence and cannot rescue an invalid ID');
