import assert from 'node:assert/strict';
import { createOpeningDirectorRequest, parseOpeningDirection } from '../../src/narration/campaign-opening.mjs';
import { materializeCharacterSceneAdmission } from '../../src/story/character-scene-admission.mjs';
const premise = { continuitySummary: 'The shuttle reaches the station.', firstPlayableScene: 'The hatch opens onto the arrival deck.', requiredContext: ['The station has requested relief supplies.'], sceneMaterial: ['Officer Iven waits beside the open hatch.'], personalization: [], forbiddenFacts: ['SECRET_FUTURE_SABOTAGE'], firstSceneGuidance: ['Offer the player a choice after they act.'] };
const request = createOpeningDirectorRequest({ premise, player: { name: 'Tester', dossier: { briefBiography: 'PRIVATE_PLAYER_HISTORY' } }, characterKnowledge: { mode: 'protected', people: [{ id: 'person.iven', name: 'Iven' }] } });
assert.ok(request.context.characterKnowledge, 'protected opening director must receive source-bound scene preparation');
const knowledge = request.context.characterKnowledge;
assert.ok(request.jsonSchema.required.includes('characterScene'));
assert.ok(!knowledge.sourcePair.previousAssistant.text.includes('SECRET_FUTURE_SABOTAGE'));
assert.ok(!knowledge.sourcePair.previousAssistant.text.includes('PRIVATE_PLAYER_HISTORY'));
assert.ok(knowledge.sourcePair.currentPlayer.text.includes('PRIVATE_PLAYER_HISTORY'));
const proposal = { participants: [{ personId: 'person.iven', presence: 'present', evidence: [{ sourceSlot: 'previousAssistant', evidenceQuote: premise.sceneMaterial[0] }], audience: [{ personId: knowledge.playerId, acquisition: 'heard', evidence: [{ sourceSlot: 'previousAssistant', evidenceQuote: premise.sceneMaterial[0] }] }], perception: [] }], reactions: [{ personId: 'person.iven', after: [] }], playerContext: [{ sourceSlot: 'previousAssistant', evidenceQuote: premise.firstPlayableScene }] };
const direction = { kind: 'directive.openingDirection.v1', sceneMaterialIds: ['scene:0'], backgroundIds: ['background:briefBiography'], emphasis: 'setting', characterScene: proposal };
const parsed = parseOpeningDirection(direction, { request });
assert.equal(parsed.ok, true, JSON.stringify(parsed));
const admitted = materializeCharacterSceneAdmission(parsed.characterScene, { sourcePair: knowledge.sourcePair, knownPersonIds: new Set(['person.iven']), explicitAudience: new Map([['currentPlayer', new Set([knowledge.playerId])]]) });
assert.equal(admitted.participants[0].personId, 'person.iven');
const leak = structuredClone(direction);
leak.characterScene.participants[0].perception = [{ acquisition: 'read', evidence: { sourceSlot: 'currentPlayer', evidenceQuote: 'PRIVATE_PLAYER_HISTORY' } }];
assert.equal(parseOpeningDirection(leak, { request }).ok, false, 'player-only history cannot become NPC perception');
const changed = createOpeningDirectorRequest({ premise: { ...premise, firstPlayableScene: 'The shuttle remains sealed.' }, player: { name: 'Tester' }, characterKnowledge: { mode: 'protected', people: [{ id: 'person.iven', name: 'Iven' }] } });
assert.notDeepEqual(changed.context.characterKnowledge.sourcePair, knowledge.sourcePair);
assert.equal(parseOpeningDirection(direction, { request: changed }).ok, false);
const legacy = createOpeningDirectorRequest({ premise, player: { name: 'Tester' } });
assert.equal(legacy.context.characterKnowledge, undefined);
assert.equal(legacy.jsonSchema.properties.characterScene, undefined);
console.log('PASS protected opening source admission, private biography isolation, and legacy compatibility');

const { createOpeningLifecycle } = await import('../../src/narration/opening-lifecycle.mjs');
let unrestrictedCalls = 0, protectedCalls = 0, openingRecord = null;
const lifecycle = createOpeningLifecycle({ chat: { getRecentMessages: async () => [], getOpeningRecord: () => openingRecord, setOpeningRecord: async value => { openingRecord = value; } }, getBinding: () => ({ campaignId: 'campaign.test', saveId: 'save.test', chatId: 'chat.test' }), isCurrent: () => true,
  generateDirector: async () => ({ text: JSON.stringify(direction) }), generateNarration: async () => { unrestrictedCalls++; return { text: 'unreviewed' }; }, getProseGuidance: async () => { unrestrictedCalls++; return ''; },
  publishProtectedOpening: async input => { if (input.recoveryOnly) return null; protectedCalls++; assert.deepEqual(input.admission, parsed.characterScene); assert.equal(input.requireEmpty, true); return { ok: true, persisted: true }; } });
const opened = await lifecycle.generate({ premise, player: { name: 'Tester', dossier: { briefBiography: 'PRIVATE_PLAYER_HISTORY' } }, characterKnowledge: { mode: 'protected', people: [{ id: 'person.iven', name: 'Iven' }] } });
assert.equal(opened.ok, true, JSON.stringify(opened));
assert.equal(protectedCalls, 1);
assert.equal(unrestrictedCalls, 0);
console.log('PASS protected opening lifecycle bypasses unrestricted narration and prose guidance');
