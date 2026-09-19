import assert from 'node:assert/strict';
import { prepareProtectedCharacterTurn } from '../../src/runtime/protected-character-turn.mjs';
import { createCharacterSceneAdmission } from '../../src/story/character-scene-admission.mjs';
import { captureV1StorySource } from '../../src/runtime/v1-accepted-pair-source.mjs';
import { readCharacterScenePublication } from '../../src/story/character-scene-publication.mjs';
const prior = 'The bridge is quiet.';
const messages = [{ id: 'a1', mes: prior, is_user: false, swipe_id: 0, swipes: [prior] }, { id: 'u2', mes: 'I wait.', is_user: true }];
const source = message => { const { role, ...value } = captureV1StorySource(message).value; return value; };
const sourcePair = { previousAssistant: source(messages[0]), currentPlayer: source(messages[1]) };
const { text, ...identitySource } = sourcePair.previousAssistant;
const continuation = { source: identitySource, text };
const admission = createCharacterSceneAdmission({ proposal: { participants: [], reactions: [], playerContext: [{ sourceSlot: 'currentPlayer', evidenceQuote: 'I wait.' }] }, sourcePair, playerId: 'person.player', knownPersonIds: new Set() });
const state = { player: { name: 'Tester' }, storySettlement: { branchId: 'save.test', revision: 1, activeEpisode: null, episodes: [], continuityEvents: [] } };
const generation = { async generate(role, request, options) {
  options.attemptBudget.claim(); const input = JSON.parse(request.messages[1].content);
  if (role === 'sceneNarrator') { assert.equal(input.continuation.text, prior); return { text: JSON.stringify({ segments: [{ kind: 'prose', id: 'segment.new', text: 'A light blinks on the console.' }] }) }; }
  assert.equal(input.support.continuation.text, prior);
  assert.equal(input.candidate.text, prior + '\n\nA light blinks on the console.');
  return { text: JSON.stringify({ kind: 'directive.characterKnowledgeReview.v1', candidateDigest: input.candidateDigest, supportDigest: input.supportDigest, verdict: 'pass', findings: [] }) };
} };
const args = { generation, campaignState: state, crewDataset: {}, messages, sourcePair, admission, continuation,
  identity: { bindingKey: 'chat.test', branchId: 'save.test', sourceDigest: 'a'.repeat(64), settingsDigest: 'b'.repeat(64), epoch: 1 },
  guard: { isCurrent: () => true }, publicationId: 'publication.continue', expectedBinding: {}, hostMessageId: 'a1' };
const turn = await prepareProtectedCharacterTurn(args);
await turn.publish(async options => {
  const row = { id: 'a1', mes: options.text, is_user: false, swipes: [prior, options.text], swipe_id: 1 };
  const { text, role, ...source } = captureV1StorySource(row).value;
  const metadata = options.createMetadata(source);
  row.swipe_info = [{ extra: {} }, { extra: { runtimeMetadata: { characterScenePublication: metadata } } }];
  assert.deepEqual(metadata.continuation, continuation);
  assert.equal(readCharacterScenePublication(row).status, 'valid');
  row.swipes[0] = 'Changed prior response.';
  assert.equal(readCharacterScenePublication(row).status, 'invalid', 'editing the retained source withdraws continuation receipt proposals');
  return { ok: true, persisted: true };
});
await assert.rejects(prepareProtectedCharacterTurn({ ...args, continuation: { ...continuation, text: 'Invented prefix.' } }));
console.log('PASS Continue retains its exact selected source, reviews only the extension, and binds receipt lineage');
