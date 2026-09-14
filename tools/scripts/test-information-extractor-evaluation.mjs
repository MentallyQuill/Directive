import assert from 'node:assert/strict';
import { createExtractionCases, scoreExtractedAccess, runExtractionEvaluation } from './character-information-extractor-evaluation.mjs';

const cases = createExtractionCases();
const scenario = cases.find(item => item.id === 'private-call');
const access = (evidenceQuote, recipientIds = ['person.nayar'], sourceSlot = 'previousAssistant') => ({ operation: 'addFact', sourceSlot, evidenceQuote, informationAccess: { recipientIds } });
const scored = scoreExtractedAccess(scenario, [access(scenario.facts[0].quote)]);
assert.equal(scored.unsupportedGrants, 1, 'private source receipt is an unsupported grant');
assert.equal(scored.omissions, 1, 'omitting the actual briefing is scored independently');
assert.equal(scoreExtractedAccess(scenario, [access('An unrelated claimed briefing.')]).unclassifiedAccessRecords, 1);
const conditional = cases.find(item => item.id === 'conditional-private-delivery-adaptation');
const playerEnacted = cases.find(item => item.id === 'player-enacted-private-delivery');
const confirmed = cases.find(item => item.id === 'confirmed-private-delivery');
assert.equal(scoreExtractedAccess(conditional, [access(conditional.facts[0].quote, ['person.nayar'], 'currentPlayer')]).unsupportedGrants, 1,
  'conditional speech behind an unestablished private-meeting precondition is a false grant');
assert.deepEqual(scoreExtractedAccess(conditional, []), {
  unsupportedGrants: 0, omissions: 0, correctReceipts: 0, unclassifiedAccessRecords: 0,
}, 'omitting unestablished conditional delivery is correct');
assert.equal(scoreExtractedAccess(playerEnacted, [access(playerEnacted.facts[0].quote, ['person.nayar'], 'currentPlayer')]).correctReceipts, 1,
  'player-enacted setup and direct speech establish receipt without an NPC precondition');
assert.equal(scoreExtractedAccess(playerEnacted, []).omissions, 1,
  'missing player-enacted direct delivery is an omission');
assert.equal(scoreExtractedAccess(confirmed, [access(confirmed.facts[0].quote)]).correctReceipts, 1,
  'assistant-enacted private delivery is a supported receipt');
assert.equal(scoreExtractedAccess(confirmed, []).omissions, 1,
  'missing an assistant-enacted private delivery is an omission');
assert.equal((await runExtractionEvaluation()).status, 'unrun', 'No oracle fixture is labelled a model evaluation');

for (const capacity of [0.5, 1, 5]) {
  const scenarios = createExtractionCases({ capacity });
  let calls = 0;
  const evaluated = await runExtractionEvaluation({ capacity, generate: async (role, request, _options, id) => {
    calls++;
    assert.equal(role, 'continuityAnalyst');
    const wire = JSON.parse(request.messages.find(message => message.role === 'user').content);
    assert.ok(!Object.hasOwn(wire, 'facts'), 'Expected labels never reach the extractor');
    assert.ok(!JSON.stringify(wire).includes('"received"'));
    assert.equal(wire.analysisLimits.continuityMaxChanges, Math.round(16 * capacity));
    const scenario = scenarios.find(item => item.id === id);
    const first = scenario.facts[0];
    return { ok: true, response: { json: {
      kind: 'directive.continuityAnalystProposal.v1', envelope: wire.envelope, coverage: 'complete', lookupRequests: [],
      threadChanges: [
        { operation: 'open', localRef: 'fixture', title: 'Fixture briefing', category: 'information', sourceSlot: first.sourceSlot, evidenceQuote: first.quote },
        ...scenario.facts.map(fact => ({ operation: 'addFact', threadRef: 'fixture', text: fact.quote,
          claimType: 'character-claim', authoredRef: null, supersedesFactId: null, sourceSlot: fact.sourceSlot, evidenceQuote: fact.quote,
          informationAccess: { recipientIds: ['person.nayar'], acquisition: 'heard', audienceEvidence: [{ sourceSlot: fact.sourceSlot, evidenceQuote: fact.quote }] },
        })),
      ],
    } } };
  } });
  assert.equal(calls, 9);
  assert.equal(evaluated.invalidCases, 0, JSON.stringify(evaluated));
  assert.equal(evaluated.totals.unsupportedGrants, 6, 'Source-valid but private or conditional receipts remain semantic errors');
  assert.equal(evaluated.totals.omissions, 0);
  assert.equal(evaluated.totals.unclassifiedAccessRecords, 0);
}
const malformed = await runExtractionEvaluation({ generate: async () => ({ ok: true, response: { text: '{broken' } }) });
assert.equal(malformed.invalidCases, cases.length);
for (const code of ['provider_empty_content', 'provider_reasoning_only', 'provider_token_limit', 'DIRECTIVE_GENERATION_TIMEOUT']) {
  const failed = await runExtractionEvaluation({ generate: async () => ({ ok: false, error: { code } }) });
  assert.equal(failed.invalidCases, cases.length);
  assert.equal(failed.totals.unsupportedGrants, 0, 'Transport failures are not labelled semantic successes or grants');
  assert.ok(failed.cases.every(row => row.reasonCode === code), JSON.stringify(failed));
}
console.log('Extraction evaluation: production requests, private-grant/omission scoring, capacity and distinct failure paths passed. No live provider called.');
