import assert from 'node:assert/strict';
import * as contracts from '../../src/story/character-knowledge-contracts.mjs';

const packet = {
  kind: 'directive.characterPacket.v1', personId: 'person.bronn',
  identity: { name: 'Bronn', role: 'officer' }, situation: 'A status report is requested.',
  information: [{ id: 'fact.door', text: 'The door is sealed.', claimType: 'narrated-fact', acquisition: 'observed', status: 'current' }],
};
assert.deepEqual(contracts.parseCharacterKnowledgePacket(packet), packet);
assert.throws(() => contracts.parseCharacterKnowledgePacket({ ...packet, sharedHistory: 'Private deadline: three minutes.' }), { code: 'DIRECTIVE_CHARACTER_KNOWLEDGE_INVALID' });
console.log('PASS character packet rejects extra context fields');

const contribution = { id: 'line.1', personId: 'person.bronn', kind: 'speech', mode: 'recall', text: 'The door is sealed.', basisIds: ['fact.door'], recipientIds: ['person.captain'], dependsOnIds: [] };
const contributionContext = { packet, playerId: 'person.player', audienceIds: new Set(['person.captain']), priorContributionIds: new Set() };
assert.deepEqual(contracts.parseCharacterContribution(contribution, contributionContext), contribution);
assert.throws(() => contracts.parseCharacterContribution({ ...contribution, basisIds: ['fact.private'] }, contributionContext), { code: 'DIRECTIVE_CHARACTER_KNOWLEDGE_INVALID' });
console.log('PASS contribution evidence belongs to its character');

const exposure = { kind: 'directive.characterExposure.v1', id: 'exposure.1', speakerId: 'person.bronn', recipientIds: ['person.captain'], acquisition: 'heard', text: 'The door is sealed.', claimType: 'character-claim', source: { type: 'contribution', contributionId: 'line.1' }, dependsOnIds: [] };
const exposureContext = { speakerIds: new Set(['person.bronn']), audienceIds: new Set(['person.captain', 'person.remote']), passageIds: new Set(), contributions: new Map([['line.1', contribution]]), exposureIds: new Set() };
assert.deepEqual(contracts.parseCharacterExposure(exposure, exposureContext), exposure);
assert.throws(() => contracts.parseCharacterExposure({ ...exposure, recipientIds: ['person.remote'] }, exposureContext), { code: 'DIRECTIVE_CHARACTER_KNOWLEDGE_INVALID' });
console.log('PASS disclosure cannot enlarge the source contribution audience');

const dependent = { ...contribution, id: 'line.2', dependsOnIds: ['line.1'], personId: 'person.captain', text: 'Understood.' };
const segments = [{ kind: 'prose', id: 'segment.1', text: 'Bronn gives his report.' }, { kind: 'character', id: 'line.1' }, { kind: 'character', id: 'line.2' }];
assert.deepEqual(contracts.parseCharacterNarrationSegments(segments, { contributions: [contribution, dependent] }), segments);
assert.throws(() => contracts.parseCharacterNarrationSegments([...segments].reverse(), { contributions: [contribution, dependent] }), { code: 'DIRECTIVE_CHARACTER_KNOWLEDGE_INVALID' });
console.log('PASS narration preserves contribution dependency order');

const candidateDigest = 'a'.repeat(64);
const supportDigest = 'b'.repeat(64);
const review = { kind: 'directive.characterKnowledgeReview.v1', candidateDigest, supportDigest, verdict: 'pass', findings: [] };
const reviewContext = { candidateDigest, supportDigest, segmentIds: new Set(segments.map(item => item.id)), subjectIds: new Set(['person.bronn', 'narrator']), supportIds: new Set(['fact.door']) };
assert.deepEqual(contracts.parseCharacterKnowledgeReview(review, reviewContext), review);
assert.throws(() => contracts.parseCharacterKnowledgeReview({ ...review, candidateDigest: 'c'.repeat(64) }, reviewContext), { code: 'DIRECTIVE_CHARACTER_KNOWLEDGE_INVALID' });
console.log('PASS review is bound to the exact candidate and support');

const source = { messageId: 'assistant.7', selectedSwipeId: 'swipe.0', textHash: 'c'.repeat(64) };
const position = { source, order: 0 };
assert.deepEqual(contracts.parseCharacterNarrativePosition(position, { source }), position);
assert.throws(() => contracts.parseCharacterNarrativePosition({ ...position, source: { ...source, selectedSwipeId: 'swipe.1' } }, { source }), { code: 'DIRECTIVE_CHARACTER_KNOWLEDGE_INVALID' });
console.log('PASS narrative order is bound to selected source identity');

const receipt = {
  kind: 'directive.characterSceneReceipt.v1', publicationId: 'publication.1', flightDigest: 'd'.repeat(64), source,
  candidateDigest, supportDigest, packetDigests: [{ personId: 'person.bronn', digest: 'e'.repeat(64) }],
  contributionDigests: [{ id: 'line.1', digest: 'f'.repeat(64) }], review,
  disclosures: [{ exposure, position }],
};
const receiptContext = { source, flightDigest: receipt.flightDigest, reviewContext, exposureContext,
  packetDigests: new Map([['person.bronn', 'e'.repeat(64)]]), contributionDigests: new Map([['line.1', 'f'.repeat(64)]]) };
assert.deepEqual(contracts.parseCharacterSceneReceipt(receipt, receiptContext), receipt);
assert.throws(() => contracts.parseCharacterSceneReceipt({ ...receipt, source: { ...source, textHash: 'changed' } }, receiptContext), { code: 'DIRECTIVE_CHARACTER_KNOWLEDGE_INVALID' });
console.log('PASS publication receipt retains source and digest custody');

assert.throws(() => contracts.parseCharacterContribution({ ...contribution, basisIds: new Array(1) }, contributionContext), { code: 'DIRECTIVE_CHARACTER_KNOWLEDGE_INVALID' });
console.log('PASS sparse evidence arrays are rejected');

import { readFileSync } from 'node:fs';
const scenarios = JSON.parse(readFileSync(new URL('../fixtures/character-knowledge/scenarios.json', import.meta.url), 'utf8'));
assert.deepEqual(new Set(scenarios.map(item => item.id)), new Set(['bronn-private', 'bronn-disclosed', 'nayar-private', 'false-report', 'accessible-correction', 'withheld-correction', 'competence', 'inference', 'private-thought', 'radio-only', 'whisper', 'ordered-disclosure', 'player-agency']));
for (const scenario of scenarios) {
  assert.ok(scenario.expectedBehavior.length > 0);
  assert.equal(new Set(scenario.records.map(item => item.id)).size, scenario.records.length);
  const accessible = scenario.records.filter(item => item.recipientIds.includes(scenario.personId));
  assert.deepEqual(accessible.map(item => item.text), scenario.expectedInformationTexts, scenario.id);
  for (const forbidden of scenario.forbiddenInformationTexts) assert.equal(accessible.some(item => item.text === forbidden), false, scenario.id);
}
console.log('PASS 13 adversarial and positive-control fixtures have explicit expected access');

assert.throws(() => contracts.parseCharacterContribution(contribution, { ...contributionContext, priorContributionIds: new Set(['line.1']) }), { code: 'DIRECTIVE_CHARACTER_KNOWLEDGE_INVALID' });
console.log('PASS contribution IDs cannot replace an earlier causal node');

const invalidCode = { code: 'DIRECTIVE_CHARACTER_KNOWLEDGE_INVALID' };
for (const malformed of [null, [], { ...packet, kind: 'directive.characterPacket.v2' },
  { ...packet, information: [...packet.information, ...packet.information] },
  { ...packet, identity: { ...packet.identity, secret: 'hidden' } },
  { ...packet, information: [{ ...packet.information[0], status: 'retracted' }] },
  { ...packet, information: [{ ...packet.information[0], text: 'x'.repeat(4001) }] }]) {
  assert.throws(() => contracts.parseCharacterKnowledgePacket(malformed), invalidCode);
}
for (const malformed of [
  { ...contribution, personId: 'person.player' }, { ...contribution, personId: 'person.sato' },
  { ...contribution, basisIds: [] }, { ...contribution, basisIds: ['fact.door', 'fact.door'] },
  { ...contribution, recipientIds: ['person.remote'] }, { ...contribution, dependsOnIds: ['line.future'] },
  { ...contribution, commit: { mission: 'complete' } }, { ...contribution, mode: 'omniscient' },
]) assert.throws(() => contracts.parseCharacterContribution(malformed, contributionContext), invalidCode);
for (const mode of ['question', 'ordinary', 'deception']) {
  assert.equal(contracts.parseCharacterContribution({ ...contribution, mode, basisIds: [] }, contributionContext).mode, mode);
}
for (const malformed of [
  { ...exposure, claimType: 'narrated-fact' }, { ...exposure, speakerId: 'person.remote' },
  { ...exposure, recipientIds: [] }, { ...exposure, acquisition: 'remembered' },
  { ...exposure, source: { type: 'passage', passageId: 'passage.foreign' } },
  { ...exposure, source: { type: 'contribution', contributionId: 'line.foreign' } },
  { ...exposure, order: 0 },
]) assert.throws(() => contracts.parseCharacterExposure(malformed, exposureContext), invalidCode);
for (const malformed of [[], segments.slice(0, 2), [...segments, segments[1]],
  [{ kind: 'character', id: 'line.unknown' }], [{ ...segments[0], source: 'private' }, ...segments.slice(1)]]) {
  assert.throws(() => contracts.parseCharacterNarrationSegments(malformed, { contributions: [contribution, dependent] }), invalidCode);
}
const finding = { id: 'finding.1', segmentId: 'segment.1', subjectId: 'person.bronn', type: 'unsupported-knowledge', explanation: 'This character has no admitted support for the asserted deadline.', supportIds: [] };
const rejection = { ...review, verdict: 'reject', findings: [finding] };
assert.deepEqual(contracts.parseCharacterKnowledgeReview(rejection, reviewContext), rejection);
for (const malformed of [{ ...rejection, verdict: 'pass' }, { ...review, verdict: 'reject' },
  { ...rejection, findings: [{ ...finding, segmentId: 'segment.missing' }] },
  { ...rejection, findings: [{ ...finding, supportIds: ['fact.secret'] }] },
  { ...rejection, findings: [finding, finding] }, { ...review, prose: 'replacement text' }]) {
  assert.throws(() => contracts.parseCharacterKnowledgeReview(malformed, reviewContext), invalidCode);
}
for (const malformed of [{ ...position, order: -1 }, { ...position, order: 1.5 }, { ...position, order: null }]) {
  assert.throws(() => contracts.parseCharacterNarrativePosition(malformed, { source }), invalidCode);
}
for (const malformed of [{ ...receipt, review: rejection }, { ...receipt, flightDigest: '0'.repeat(64) },
  { ...receipt, packetDigests: [] }, { ...receipt, contributionDigests: [] },
  { ...receipt, disclosures: [...receipt.disclosures, ...receipt.disclosures] },
  { ...receipt, apiKey: 'do-not-persist' }]) {
  assert.throws(() => contracts.parseCharacterSceneReceipt(malformed, receiptContext), invalidCode);
}
const detached = contracts.parseCharacterKnowledgePacket(packet);
detached.information[0].text = 'changed';
assert.equal(packet.information[0].text, 'The door is sealed.');
console.log('PASS malformed contracts, positive epistemic modes, rejected receipts and clone isolation');
