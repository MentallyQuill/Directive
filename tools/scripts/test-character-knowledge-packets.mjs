import assert from 'node:assert/strict';
import * as knowledge from '../../src/story/character-knowledge.mjs';

const input = {
  personId: 'person.bronn', identity: { name: 'Bronn', role: 'officer', privateDossier: 'Do not include this raw field.' },
  publicSituation: 'The captain requests a status report.',
  validSourceIds: new Set(['source.public', 'source.private']), beforeOrder: 3,
  candidates: [
    { id: 'fact.public', text: 'The door is sealed.', claimType: 'narrated-fact', recipientIds: ['person.bronn'], acquisition: 'observed', learnedAt: 1, status: 'current', sourceIds: ['source.public'] },
    { id: 'fact.private', text: 'Private deadline: three minutes.', claimType: 'character-claim', recipientIds: ['person.sato'], acquisition: 'heard', learnedAt: 1, status: 'current', sourceIds: ['source.private'] },
  ],
};
const packet = knowledge.compileCharacterPacket(input);
assert.deepEqual(packet.information.map(item => item.id), ['fact.public']);
assert.equal(JSON.stringify(packet).includes('three minutes'), false);
assert.equal(JSON.stringify(packet).includes('privateDossier'), false);
assert.deepEqual(input.candidates[1].recipientIds, ['person.sato']);
console.log('PASS compiled packet excludes private facts and unapproved identity fields');

assert.throws(() => knowledge.compileCharacterPacket({ ...input, maxCharacters: 20 }), { code: 'DIRECTIVE_CHARACTER_KNOWLEDGE_BUDGET' });
assert.throws(() => knowledge.compileCharacterPacket({ ...input, maxEstimatedTokens: 20 }), { code: 'DIRECTIVE_CHARACTER_KNOWLEDGE_BUDGET' });
console.log('PASS required knowledge over capacity fails rather than truncates');

const delivery = { ...input.candidates[1], recipientIds: ['person.bronn'], learnedAt: 3 };
assert.equal(knowledge.compileCharacterPacket({ ...input, candidates: [delivery] }).information.length, 0);
assert.equal(knowledge.compileCharacterPacket({ ...input, candidates: [delivery], beforeOrder: 4 }).information.length, 1);
assert.equal(knowledge.compileCharacterPacket({ ...input, validSourceIds: new Set() }).information.length, 0);
const many = Array.from({ length: 9 }, (_, index) => ({ ...input.candidates[0], id: `fact.${index}`, text: `Accessible report ${index}.` }));
assert.equal(knowledge.compileCharacterPacket({ ...input, candidates: many }).information.length, 9);
assert.throws(() => knowledge.compileCharacterPacket({ ...input, candidates: [{ ...input.candidates[0], sourceIds: new Array(1) }] }), { code: 'DIRECTIVE_CHARACTER_KNOWLEDGE_INVALID' });
console.log('PASS ordered disclosure, source withdrawal, full eligible records and malformed custody');

import { materializeContinuityChanges } from '../../src/story/continuity-events.mjs';
import { makeMaterializeInput } from './story-director-test-fixtures.mjs';
const archiveInput = makeMaterializeInput({ knownLinkIds: ['person.bronn'] });
archiveInput.changes[1].informationAccess = { recipientIds: ['person.bronn'], acquisition: 'heard', audienceEvidence: [{ sourceSlot: 'currentPlayer', evidenceQuote: 'What flexibility do we have?' }] };
const events = await materializeContinuityChanges(archiveInput);
const sources = new Map(events.flatMap(event => event.sourceContributionIds.map((id, index) => [id, event.sources[index]])));
const snapshot = {
  state: { storySettlement: { branchId: 'save.test', revision: 1, continuityEvents: events } },
  sourceIdentities: sources,
  characters: new Map([['person.bronn', { name: 'Bronn', role: 'officer', dossier: 'Private irrelevant material' }]]),
};
const compiled = knowledge.createCharacterKnowledgePacket({ snapshot, personId: 'person.bronn' });
assert.equal(compiled.ok, true, JSON.stringify(compiled));
assert.deepEqual(compiled.packet.information.map(item => item.text), ['The rendezvous is scheduled for 1400.']);
assert.match(compiled.digest, /^[a-f0-9]{64}$/);
assert.equal(JSON.stringify(compiled.packet).includes('Private irrelevant'), false);
assert.deepEqual(snapshot.state.storySettlement.continuityEvents, events);
console.log('PASS archive adapter uses admitted access without leaking raw snapshot context');

const authoredSnapshot = { ...snapshot, authoredKnowledge: [
  { id: 'authored.first-aid', type: 'competence', text: 'Basic first aid', recipientIds: ['person.bronn'] },
  { id: 'authored.secret', type: 'background', text: 'The captain has a secret diagnosis.', recipientIds: ['person.captain'] },
] };
const withCompetence = knowledge.createCharacterKnowledgePacket({ snapshot: authoredSnapshot, personId: 'person.bronn' });
assert.equal(withCompetence.ok, true);
assert.deepEqual(withCompetence.packet.authoredInformation, [{ id: 'authored.first-aid', type: 'competence', text: 'Basic first aid' }]);
assert.equal(JSON.stringify(withCompetence.packet).includes('secret diagnosis'), false);
console.log('PASS authored expertise has explicit access without fabricated observation');

import { parseCharacterContribution } from '../../src/story/character-knowledge-contracts.mjs';
assert.equal(parseCharacterContribution({ id: 'line.aid', personId: 'person.bronn', kind: 'action', mode: 'ordinary', text: 'Bronn applies pressure to the wound.', basisIds: ['authored.first-aid'], recipientIds: [], dependsOnIds: [] }, { packet: withCompetence.packet, playerId: 'person.player', audienceIds: new Set(), priorContributionIds: new Set() }).mode, 'ordinary');
console.log('PASS contributions may cite admitted authored competence');

const oldFact = events.find(event => event.operation === 'addFact');
const correction = { ...structuredClone(oldFact), id: 'fact.correction', payload: { ...structuredClone(oldFact.payload), text: 'The rendezvous has moved to 1500.', supersedesFactId: oldFact.id, informationAccess: { ...structuredClone(oldFact.payload.informationAccess), recipientIds: ['person.sato'] } } };
const correctionSnapshot = { ...snapshot, state: { storySettlement: { ...snapshot.state.storySettlement, continuityEvents: [...events, correction] } } };
const hiddenCorrection = knowledge.createCharacterKnowledgePacket({ snapshot: correctionSnapshot, personId: 'person.bronn' });
assert.equal(hiddenCorrection.packet.information[0].status, 'current');
assert.equal(hiddenCorrection.packet.information.length, 1);
correction.payload.informationAccess.recipientIds = ['person.bronn'];
const visibleCorrection = knowledge.createCharacterKnowledgePacket({ snapshot: correctionSnapshot, personId: 'person.bronn' });
assert.equal(visibleCorrection.packet.information[0].status, 'superseded');
assert.equal(visibleCorrection.packet.information.length, 2);
const withdrawn = knowledge.createCharacterKnowledgePacket({ snapshot: { ...snapshot, invalidSourceIds: new Set(['contribution.u8']) }, personId: 'person.bronn' });
assert.equal(withdrawn.packet.information.length, 0);
const driftedSources = new Map(sources);
driftedSources.set('contribution.a7', { ...sources.get('contribution.a7'), selectedSwipeId: '1' });
assert.equal(knowledge.createCharacterKnowledgePacket({ snapshot: { ...snapshot, sourceIdentities: driftedSources }, personId: 'person.bronn' }).packet.information.length, 0);
console.log('PASS archive corrections and source invalidation preserve personal knowledge');

const focusedSnapshot = { ...correctionSnapshot, focusByPerson: new Map([['person.bronn', { requiredIds: [oldFact.id], queryIds: [] }]]) };
const focused = knowledge.createCharacterKnowledgePacket({ snapshot: focusedSnapshot, personId: 'person.bronn', limits: { maxRecords: 1 } });
assert.equal(focused.ok, false);
assert.equal(focused.code, 'DIRECTIVE_CHARACTER_KNOWLEDGE_BUDGET');
console.log('PASS required correction closure cannot be silently truncated');

const provisional = { event: { ...structuredClone(oldFact), id: 'fact.flight' }, position: { source: { messageId: 'u8', selectedSwipeId: null, textHash: 'abcd5678' }, order: 2 } };
const duringReply = { snapshot, personId: 'person.bronn', sourcePair: archiveInput.sourcePair, provisionalExposures: [provisional] };
assert.equal(knowledge.createCharacterKnowledgePacket({ ...duringReply, beforeOrder: 2 }).packet.information.some(item => item.id === 'fact.flight'), false);
assert.equal(knowledge.createCharacterKnowledgePacket({ ...duringReply, beforeOrder: 3 }).packet.information.some(item => item.id === 'fact.flight'), true);
assert.deepEqual(snapshot.state.storySettlement.continuityEvents, events);
console.log('PASS provisional disclosure is visible only after its validated source position');

const sceneSnapshot = { ...snapshot, perceptionByPerson: new Map([['person.bronn', [oldFact.id]]]) };
const scenePacket = knowledge.createCharacterKnowledgePacket({ snapshot: sceneSnapshot, personId: 'person.bronn' });
assert.ok(scenePacket.packet.situation.includes('rendezvous is scheduled for 1400'));
assert.equal(knowledge.createCharacterKnowledgePacket({ snapshot: { ...snapshot, perceptionByPerson: new Map([['person.bronn', ['fact.private']]]) }, personId: 'person.bronn' }).ok, false);
console.log('PASS scene context can only reference admitted records');

const freshOpen = { ...structuredClone(events.find(event => event.operation === 'open')), id: 'flight.open', threadId: 'flight.thread' };
const freshFact = { ...structuredClone(oldFact), id: 'flight.fact', threadId: 'flight.thread', dependsOnEventIds: ['flight.open'] };
const freshExposures = [freshOpen, freshFact].map((event, order) => ({ event, position: { source: { messageId: 'a7', selectedSwipeId: '0', textHash: 'abcd1234' }, order } }));
const freshResult = knowledge.createCharacterKnowledgePacket({ ...duringReply, provisionalExposures: freshExposures, beforeOrder: 2 });
assert.equal(freshResult.ok, true, JSON.stringify(freshResult));
assert.equal(freshResult.packet.information.some(item => item.id === 'flight.fact'), true);
console.log('PASS provisional thread creation stays within the uncommitted causal batch');

const legacyEvents = structuredClone(events);
delete legacyEvents.find(event => event.operation === 'addFact').payload.informationAccess;
assert.equal(knowledge.createCharacterKnowledgePacket({ snapshot: { ...snapshot, state: { storySettlement: { ...snapshot.state.storySettlement, continuityEvents: legacyEvents } } }, personId: 'person.bronn' }).packet.information.length, 0);
const falseEvents = structuredClone(events);
falseEvents.find(event => event.operation === 'addFact').payload.claimType = 'character-claim';
assert.equal(knowledge.createCharacterKnowledgePacket({ snapshot: { ...snapshot, state: { storySettlement: { ...snapshot.state.storySettlement, continuityEvents: falseEvents } } }, personId: 'person.bronn' }).packet.information[0].claimType, 'character-claim');
assert.equal(knowledge.createCharacterKnowledgePacket({ snapshot, personId: 'person.bronn', limits: { maxCharacters: 20 } }).code, 'DIRECTIVE_CHARACTER_KNOWLEDGE_BUDGET');
assert.equal(knowledge.createCharacterKnowledgePacket({ ...duringReply, provisionalExposures: [{ ...provisional, position: { ...provisional.position, source: { ...provisional.position.source, textHash: 'wrong' } } }], beforeOrder: 3 }).ok, false);
assert.equal(knowledge.createCharacterKnowledgePacket({ ...duringReply, sourcePair: { ...archiveInput.sourcePair, previousAssistant: { ...archiveInput.sourcePair.previousAssistant, text: 'Evidence was edited away.' } }, beforeOrder: 3 }).ok, false);
assert.equal(knowledge.createCharacterKnowledgePacket({ snapshot: { ...snapshot, sourceIdentities: new Map([...sources].reverse()) }, personId: 'person.bronn' }).digest, compiled.digest);
const historical = Array.from({ length: 10 }, (_, index) => ({ ...structuredClone(oldFact), id: `fact.archive.${index}`, payload: { ...structuredClone(oldFact.payload), text: index === 0 ? 'The cooling system is overheating.' : `Unrelated archived report number ${index}.` } }));
const retrievalSnapshot = { ...snapshot, state: { storySettlement: { ...snapshot.state.storySettlement, continuityEvents: [events[0], ...historical] } }, focusByPerson: new Map([['person.bronn', { queryIds: ['fact.archive.0'], requiredIds: [] }]]) };
const retrieval = knowledge.createCharacterKnowledgePacket({ snapshot: retrievalSnapshot, personId: 'person.bronn', limits: { maxRecords: 2 } });
assert.equal(retrieval.ok, true);
assert.equal(retrieval.packet.information.some(item => item.id === 'fact.archive.0'), true);
assert.equal(retrieval.diagnostics.coverage, 'partial');
console.log('PASS legacy access, false claims, canonical hashes and full-archive retrieval');

const conflicting = structuredClone(provisional);
conflicting.event.sources = conflicting.event.sources.map(anchor => anchor.messageId === 'a7' ? { ...anchor, textHash: 'new-hash' } : anchor);
const conflictedSourcePair = { ...archiveInput.sourcePair, previousAssistant: { ...archiveInput.sourcePair.previousAssistant, textHash: 'new-hash' } };
assert.equal(knowledge.createCharacterKnowledgePacket({ ...duringReply, sourcePair: conflictedSourcePair, provisionalExposures: [conflicting], beforeOrder: 3 }).ok, false);
console.log('PASS provisional source IDs cannot alias a different accepted source');

const longHistory = Array.from({ length: 40 }, (_, i) => ({ ...structuredClone(oldFact), id: `fact.long.${i}`, payload: { ...structuredClone(oldFact.payload), text: i === 0 ? 'The cooling system needs repair.' : `Unrelated report ${i}: ` + 'A routine engineering status report. '.repeat(10) } }));
const longSnapshot = { ...snapshot, state: { storySettlement: { ...snapshot.state.storySettlement, continuityEvents: [events[0], ...longHistory] } }, focusByPerson: new Map([['person.bronn', { requiredIds: ['fact.long.0'], queryIds: ['fact.long.0'] }]]) };
const boundedHistory = knowledge.createCharacterKnowledgePacket({ snapshot: longSnapshot, personId: 'person.bronn' });
assert.equal(boundedHistory.ok, true, 'optional history must fit the serialized budget');
assert.ok(boundedHistory.packet.information.some(item => item.id === 'fact.long.0'));
assert.equal(boundedHistory.diagnostics.coverage, 'partial');
assert.ok(JSON.stringify(boundedHistory.packet).length <= 12000);
const allRequired = { ...longSnapshot, focusByPerson: new Map([['person.bronn', { requiredIds: longHistory.map(item => item.id) }]]) };
assert.equal(knowledge.createCharacterKnowledgePacket({ snapshot: allRequired, personId: 'person.bronn' }).code, 'DIRECTIVE_CHARACTER_KNOWLEDGE_BUDGET');
const unicodeSnapshot = structuredClone(longSnapshot);
for (const item of unicodeSnapshot.state.storySettlement.continuityEvents) if (item.operation === 'addFact' && item.id !== 'fact.long.0') item.payload.text = String.fromCodePoint(0x5de5, 0x7a0b).repeat(150);
const unicodePacket = knowledge.createCharacterKnowledgePacket({ snapshot: unicodeSnapshot, personId: 'person.bronn' });
assert.equal(unicodePacket.ok, true);
assert.ok(new TextEncoder().encode(JSON.stringify(unicodePacket.packet)).length <= 12000);
const { createCharacterSceneCoordinator } = await import('../../src/runtime/character-scene-coordinator.mjs');
const { createTurnAttemptBudget } = await import('../../src/generation/turn-attempt-budget.mjs');
const latePackets = [], longSpeech = 'An engineering report. '.repeat(120);
const lateFlight = createCharacterSceneCoordinator({ responder: { async respond(input) {
  input.budget.claim(); latePackets.push(input.packet);
  return { contribution: { id: input.contributionId, personId: 'person.bronn', kind: 'speech', mode: 'ordinary', text: longSpeech, basisIds: [], recipientIds: ['person.player'], dependsOnIds: [...input.priorContributionIds] } };
} } }).createFlight({ snapshot: longSnapshot, playerId: 'person.player', participants: [{ personId: 'person.bronn', present: true, conscious: true, audience: [{ personId: 'person.player', acquisition: 'heard' }] }], plan: [{ id: 'line.first', personId: 'person.bronn', dependsOnIds: [] }, { id: 'line.second', personId: 'person.bronn', dependsOnIds: ['line.first'] }], identity: { bindingKey: 'test', branchId: 'save.test', sourceDigest: 'a'.repeat(64), settingsDigest: 'b'.repeat(64), epoch: 1 }, budget: createTurnAttemptBudget(), isCurrent: () => true });
await lateFlight.run();
assert.equal(latePackets.length, 2);
assert.ok(latePackets[1].information.some(item => item.text === longSpeech));
assert.ok(latePackets[1].information.some(item => item.id === 'fact.long.0'));
lateFlight.dispose();
console.log('PASS budgeted archive retrieval retains required facts and causal context');
