import assert from 'node:assert/strict';
import * as evidence from '../../src/story/evidence-passages.mjs';
import { requireSourceQuote } from '../../src/story/continuity-contracts.mjs';
const sourcePair = {
  previousAssistant: { messageId: 'a7', selectedSwipeId: '0', textHash: 'hash-a', text: 'The hatch is sealed. Bronn hears the announcement.' },
  currentPlayer: { messageId: 'u8', selectedSwipeId: null, textHash: 'hash-u', text: 'Please check the hatch.' },
};
const catalog = evidence.createEvidencePassageCatalog({ sourcePair, requestId: 'request.one' });
const entry = [...catalog.values()].find(item => item.text === 'The hatch is sealed.');
assert.ok(entry);
const hydrated = evidence.hydrateEvidenceReferences({ value: { operation: 'addFact', evidencePassageId: entry.id }, catalog, sourcePair });
assert.deepEqual(hydrated, { operation: 'addFact', sourceSlot: 'previousAssistant', evidenceQuote: 'The hatch is sealed.' });
assert.equal(requireSourceQuote(hydrated, sourcePair).messageId, 'a7');
console.log('PASS passage references hydrate existing evidence without changing validation');

const longPair = { ...sourcePair, previousAssistant: { ...sourcePair.previousAssistant, text: 'A'.repeat(230) + ' 🚪 boundary disclosure ' + 'B'.repeat(260) + '.' } };
const longCatalog = evidence.createEvidencePassageCatalog({ sourcePair: longPair, requestId: 'request.long' });
const longEntries = [...longCatalog.values()].filter(item => item.sourceSlot === 'previousAssistant');
assert.ok(longEntries.some(item => item.text.includes('boundary disclosure')));
assert.ok(longEntries.some((item, index) => longEntries.slice(index + 1).some(other => item.start < other.start && item.end > other.start)));
for (const passage of longEntries) {
  assert.ok(passage.text.length <= 240);
  assert.equal(passage.text, longPair.previousAssistant.text.slice(passage.start, passage.end));
  assert.equal(passage.text.isWellFormed(), true);
}
console.log('PASS long sources retain contiguous overlapping Unicode-safe evidence');

assert.throws(() => evidence.createEvidencePassageCatalog({ sourcePair, requestId: 'request.small', limits: { requestContextCharacters: 300 } }), { code: 'DIRECTIVE_EVIDENCE_PASSAGE_INVALID' });
console.log('PASS catalog growth obeys configured request capacity');

const nested = evidence.hydrateEvidenceReferences({ value: { time: { durationSeconds: 60, durationEvidencePassageId: entry.id }, informationAccess: { audienceEvidence: [{ evidencePassageId: entry.id }] } }, catalog, sourcePair });
assert.deepEqual(nested.time, { durationSeconds: 60, durationSourceSlot: 'previousAssistant', durationEvidenceQuote: 'The hatch is sealed.' });
assert.equal(nested.informationAccess.audienceEvidence[0].evidenceQuote, 'The hatch is sealed.');
console.log('PASS nested audience and duration evidence retain their original field contracts');

const playerEntry = [...catalog.values()].find(item => item.sourceSlot === 'currentPlayer');
const pacing = evidence.hydrateEvidenceReferences({ value: { intentPassageId: playerEntry.id, missionDeparturePassageId: null, participation: [{ playerPassageId: playerEntry.id, assistantPassageId: entry.id }] }, catalog, sourcePair });
assert.equal(pacing.intentQuote, sourcePair.currentPlayer.text);
assert.equal(pacing.missionDepartureQuote, '');
assert.equal(pacing.participation[0].assistantQuote, 'The hatch is sealed.');
assert.throws(() => evidence.hydrateEvidenceReferences({ value: { playerPassageId: entry.id }, catalog, sourcePair }), { code: 'DIRECTIVE_EVIDENCE_PASSAGE_INVALID' });
console.log('PASS pacing evidence preserves fixed player and assistant source slots');

const invalidCode = { code: 'DIRECTIVE_EVIDENCE_PASSAGE_INVALID' };
for (const value of [{ evidencePassageId: 'foreign' }, { evidencePassageId: entry.id, evidenceQuote: 'Another quote' }, { evidencePassageId: entry.id, sourceSlot: 'currentPlayer' }]) {
  assert.throws(() => evidence.hydrateEvidenceReferences({ value, catalog, sourcePair }), invalidCode);
}
const otherCatalog = evidence.createEvidencePassageCatalog({ sourcePair, requestId: 'request.other' });
assert.throws(() => evidence.hydrateEvidenceReferences({ value: { evidencePassageId: entry.id }, catalog: otherCatalog, sourcePair }), invalidCode);
for (const patch of [{ selectedSwipeId: '1' }, { textHash: 'new-hash' }, { text: 'Changed message with no matching quote.' }]) {
  assert.throws(() => evidence.hydrateEvidenceReferences({ value: { evidencePassageId: entry.id }, catalog, sourcePair: { ...sourcePair, previousAssistant: { ...sourcePair.previousAssistant, ...patch } } }), invalidCode);
}
const forgedCatalog = new Map(catalog);
forgedCatalog.set(entry.id, { ...entry, start: entry.start + 1 });
assert.throws(() => evidence.hydrateEvidenceReferences({ value: { evidencePassageId: entry.id }, catalog: forgedCatalog, sourcePair }), invalidCode);
const legacy = { sourceSlot: 'previousAssistant', evidenceQuote: 'The hatch is sealed.' };
assert.deepEqual(evidence.hydrateEvidenceReferences({ value: legacy, catalog, sourcePair }), legacy);
import { acceptedPairTimeDecisionErrors } from '../../src/time/accepted-time-interpretation.mjs';
const unsupportedTime = evidence.hydrateEvidenceReferences({ value: { decision: 'advance', basis: 'explicitDuration', elapsedSeconds: 60, durationSeconds: 60, reason: 'claimed interval', confidence: 1, durationEvidencePassageId: entry.id }, catalog, sourcePair });
assert.ok(acceptedPairTimeDecisionErrors(unsupportedTime, sourcePair).length > 0, 'A real source ID does not prove an unsupported one-minute interval');
console.log('PASS foreign, mixed, stale and forged references fail; semantic evidence checks remain active');

const wireSchema = evidence.createEvidenceReferenceSchema({ type: 'object', required: ['sourceSlot', 'evidenceQuote', 'time'], properties: { sourceSlot: { type: 'string' }, evidenceQuote: { type: 'string', minLength: 12 }, time: { type: 'object', required: ['durationSourceSlot', 'durationEvidenceQuote'], properties: { durationSourceSlot: { type: 'string' }, durationEvidenceQuote: { type: 'string' } } } } });
assert.deepEqual(wireSchema.required, ['evidencePassageId', 'time']);
assert.equal(wireSchema.properties.evidenceQuote, undefined);
assert.equal(wireSchema.properties.evidencePassageId.type, 'string');
assert.deepEqual(wireSchema.properties.time.required, ['durationEvidencePassageId']);
console.log('PASS wire schema requests IDs while semantic contracts retain quotes');

import { createMissionAcceptedPairInterpreter } from '../../src/mission/v1/accepted-pair-interpreter.mjs';
let interpreterWireSeen = false;
const interpret = createMissionAcceptedPairInterpreter({ generationRouter: { generate: async (_role, request) => {
  const userMessage = request.messages[1].content;
  const context = JSON.parse(userMessage.slice(userMessage.indexOf('{')));
  assert.ok(Array.isArray(context.evidencePassages));
  assert.ok(request.jsonSchema.properties.time.properties.evidencePassageId);
  const passage = context.evidencePassages.find(item => item.sourceSlot === 'currentPlayer');
  interpreterWireSeen = true;
  return { ok: true, response: { text: JSON.stringify({ kind: 'directive.missionEvidenceInterpretation.v1', assistantAcceptance: 'accepted', claims: [], peopleEvents: [], abstained: true, time: { decision: 'advance', basis: 'implicitAction', elapsedSeconds: 2, reason: 'spoken request', confidence: 0.9, evidencePassageId: passage.id } }) } };
} } });
const interpreted = await interpret({ candidatePacket: { candidates: [] }, sourcePair });
assert.equal(interpreted.ok, true, JSON.stringify(interpreted));
assert.equal(interpreterWireSeen, true);
assert.equal(interpreted.interpretation.time.evidenceQuote, sourcePair.currentPlayer.text);
console.log('PASS interpreter runtime sends passage schema and validates hydrated evidence');

import { createContinuityAnalyst } from '../../src/story/continuity-analyst.mjs';
import { makeDirectorRequest, makeDirectorOutput } from './director-contract-test-fixtures.mjs';
const directorRequest = makeDirectorRequest();
let continuityCalls = 0;
const analyzeContinuity = createContinuityAnalyst({ generationRouter: { generate: async (_role, payload) => {
  continuityCalls++;
  const context = JSON.parse(payload.messages[1].content);
  assert.ok(Array.isArray(context.evidencePassages));
  const quoted = context.evidencePassages.find(item => item.text === 'Rendezvous at 1400.');
  assert.ok(quoted);
  const threadChanges = makeDirectorOutput(directorRequest).threadChanges.map(({ sourceSlot, evidenceQuote, ...change }) => ({ ...change, evidencePassageId: quoted.id }));
  return { ok: true, response: { json: { kind: 'directive.continuityAnalystProposal.v1', envelope: directorRequest.envelope, coverage: 'complete', threadChanges, lookupRequests: [] } } };
} } });
const analyzed = await analyzeContinuity({ request: directorRequest });
assert.equal(analyzed.ok, true, JSON.stringify(analyzed));
assert.equal(continuityCalls, 1);
assert.equal(analyzed.proposal.threadChanges[0].evidenceQuote, 'Rendezvous at 1400.');
console.log('PASS continuity analysis shares its existing call and validators with passage references');

const raisedSource = { ...sourcePair, previousAssistant: { ...sourcePair.previousAssistant, text: 'A'.repeat(350) + '.' } };
const raisedCatalog = evidence.createEvidencePassageCatalog({ sourcePair: raisedSource, requestId: 'request.raised', limits: { continuityEvidenceQuoteCharacters: 480 } });
assert.ok([...raisedCatalog.values()].some(item => item.text === raisedSource.previousAssistant.text));
assert.ok([...raisedCatalog.values()].some(item => item.sourceSlot === 'previousAssistant' && item.text.length <= 240));
console.log('PASS catalog retains both raised continuity limits and shorter time evidence windows');

const accessRequest = makeDirectorRequest();
accessRequest.authoredContext.referenceIds = ['person.bronn'];
accessRequest.authoredContext.references = [{ id: 'person.bronn', name: 'Bronn', kind: 'person' }];
accessRequest.pendingPair.currentPlayer.text = 'I tell Bronn that the hatch is sealed. I privately intend to leave.';
let accessCalls = 0;
let rejectReference = true;
const accessAnalyst = createContinuityAnalyst({ generationRouter: { generate: async (_role, payload) => {
  accessCalls++;
  const context = JSON.parse(payload.messages[1].content);
  const publicPassage = context.evidencePassages.find(item => item.text === 'I tell Bronn that the hatch is sealed.');
  assert.ok(publicPassage);
  if (!rejectReference) assert.deepEqual(context.validationFeedback.errors, ['evidence_passage_invalid']);
  const reference = rejectReference ? 'passage.foreign' : publicPassage.id;
  return { ok: true, response: { json: { kind: 'directive.continuityAnalystProposal.v1', envelope: accessRequest.envelope, coverage: 'complete', lookupRequests: [], threadChanges: [
    { operation: 'open', localRef: 'disclosure', title: 'Hatch report', category: 'information', evidencePassageId: reference },
    { operation: 'addFact', threadRef: 'disclosure', text: 'The player says the hatch is sealed.', claimType: 'character-claim', authoredRef: null, supersedesFactId: null, evidencePassageId: reference, informationAccess: { recipientIds: ['person.bronn'], acquisition: 'heard', audienceEvidence: [{ evidencePassageId: reference }] } },
  ] } } };
} } });
const refused = await accessAnalyst({ request: accessRequest });
assert.equal(refused.ok, false);
assert.deepEqual(refused.diagnostics.errors, ['evidence_passage_invalid']);
rejectReference = false;
const recovered = await accessAnalyst({ request: accessRequest, validationErrors: refused.diagnostics.errors });
assert.equal(recovered.ok, true, JSON.stringify(recovered));
assert.equal(accessCalls, 2, 'one existing analysis call per attempt, no exposure-extraction role');
assert.equal(recovered.proposal.threadChanges[1].informationAccess.audienceEvidence[0].evidenceQuote, 'I tell Bronn that the hatch is sealed.');
assert.equal(JSON.stringify(recovered.proposal).includes('privately intend'), false);
console.log('PASS current-player audience references and bounded retry feedback share continuity analysis');

const literalValue = { required: ['evidenceQuote'], properties: { evidenceQuote: 'authored literal' } };
assert.deepEqual(evidence.createEvidenceReferenceSchema({ const: literalValue }).const, literalValue);
console.log('PASS schema conversion leaves authored literal values unchanged');

const authoredSelection = { value: { evidencePassageId: 'an authored literal, not a wire reference' }, evidencePassageId: entry.id };
assert.deepEqual(evidence.hydrateEvidenceReferences({ value: authoredSelection, catalog, sourcePair }).value, authoredSelection.value);
console.log('PASS hydration preserves closed-set authored candidate values');
