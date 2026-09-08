import fs from 'node:fs';
import assert from 'node:assert/strict';

import {
  PROVIDER_RESPONSE_ERROR_CODES,
  assertProviderResponseText,
  collectProviderResponseFinishReasons,
  extractProviderContentText,
  extractProviderResponseReasoning,
  extractProviderResponseText,
  getProviderResponseFailure,
  isProviderResponseTokenLimitFinishReason
} from '../../src/providers/provider-response-normalizer.mjs';
import {
  parseStructuredJsonText,
  repairMissingArrayElementObjectClosers,
  repairCommonJson,
  stripReasoningBlocks
} from '../../src/providers/structured-output-parser.mjs';

const jsonText = '{"replacementText":"ok","warnings":[]}';

assert.equal(extractProviderResponseText({
  choices: [{ message: { content: jsonText }, finish_reason: 'stop' }]
}), jsonText);

assert.equal(extractProviderResponseText({
  content: [{ type: 'text', text: '{"replacementText":"' }, { content: [{ value: 'ok"}' }] }]
}), '{"replacementText":"ok"}');

assert.equal(extractProviderContentText([
  { type: 'text', text: 'alpha' },
  { content: [{ text: ' beta' }, { value: ' gamma' }] }
]), 'alpha beta gamma');

const reasoningOnly = {
  choices: [{
    message: {
      content: '',
      reasoning: 'hidden chain of thought'
    },
    finish_reason: 'stop'
  }]
};
assert.equal(extractProviderResponseText(reasoningOnly), '');
assert.equal(extractProviderResponseReasoning(reasoningOnly), 'hidden chain of thought');
assert.equal(getProviderResponseFailure(reasoningOnly, { providerTitle: 'Assist' }).code, PROVIDER_RESPONSE_ERROR_CODES.REASONING_ONLY);

const tokenLimited = {
  choices: [{
    message: { content: '{"replacementText":"partial"' },
    finish_reason: 'length'
  }]
};
assert.deepEqual(collectProviderResponseFinishReasons(tokenLimited), ['length']);
assert.equal(isProviderResponseTokenLimitFinishReason('max_completion_tokens'), true);
assert.throws(
  () => assertProviderResponseText(tokenLimited, { providerTitle: 'Assist', maxTokens: 900 }),
  (error) => error?.code === PROVIDER_RESPONSE_ERROR_CODES.TOKEN_LIMIT
);

const fenced = parseStructuredJsonText(`Here is the JSON:
\`\`\`json
{
  "replacementText": "Captain, sensors are clean.",
  "warnings": [],
}
\`\`\``);
assert.equal(fenced.ok, true);
assert.equal(fenced.value.replacementText, 'Captain, sensors are clean.');
assert.equal(fenced.repaired, true);

const reasoningWrapped = parseStructuredJsonText(`<think>drafting</think>
{"brief":{"summary":"Visible only"},"warnings":[]}`);
assert.equal(reasoningWrapped.ok, true);
assert.equal(reasoningWrapped.value.brief.summary, 'Visible only');
assert.equal(stripReasoningBlocks('<reasoning>hidden</reasoning>{"ok":true}'), '{"ok":true}');

const commented = parseStructuredJsonText(`{
  // provider comment
  "replacementText": "Line one
Line two",
  "notes": ["kept"]
}`);
assert.equal(commented.ok, true);
assert.equal(commented.value.replacementText, 'Line one\nLine two');
assert.equal(repairCommonJson('{"a":1,}'), '{"a":1}');

const repairedMissingOperationCloser = parseStructuredJsonText(`{
  "id": "candidate-batch",
  "operations": [
    {"op":"select","path":"mission.candidates","value":{"candidate.handover":{"sourceSlot":"previousAssistant","status":"supported"}}},
    {"op":"append","path":"mission.claims","value":{"id":"claim-1","summary":"The handover was completed."}}
  ],
  "summary": "Valid JSON already stays unchanged."
}`);
assert.equal(repairedMissingOperationCloser.ok, true);
assert.equal(repairedMissingOperationCloser.value.operations.length, 2);

const malformedMissingOperationCloser = parseStructuredJsonText('{"id":"candidate-batch","operations":[{"op":"select","path":"mission.candidates","value":{"candidate.handover":{"sourceSlot":"previousAssistant","status":"supported"}},{"op":"append","path":"mission.claims","value":{"id":"claim-1","summary":"The handover was completed."}}],"summary":"Recovered missing operation closer."}');
assert.equal(malformedMissingOperationCloser.ok, true);
assert.equal(malformedMissingOperationCloser.repaired, true);
assert.equal(malformedMissingOperationCloser.value.operations.length, 2);
assert.match(repairMissingArrayElementObjectClosers('{"operations":[{"op":"select","path":"mission.candidates","value":{"a":{"b":1}},{"op":"append","path":"mission.claims","value":{"id":"x"}}]}'), /"b":1\}\}\},\{"op":"append"/);

const invalid = parseStructuredJsonText('no object here');
assert.equal(invalid.ok, false);
assert.equal(invalid.diagnostic.code, 'json_invalid');

const intact = { text: '<think>literal</think> Keep /* this */ and https://example.test/a', count: 0, enabled: false };
assert.deepEqual(parseStructuredJsonText(JSON.stringify(intact)).value, intact);
assert.equal(parseStructuredJsonText(JSON.stringify(intact)).repaired, false);
assert.deepEqual(parseStructuredJsonText('{"text":"Keep /* this */ literal",}').value, { text: 'Keep /* this */ literal' });
assert.deepEqual(parseStructuredJsonText("{name: 'Sam', enabled: false,}").value, { name: 'Sam', enabled: false });
for (const input of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', 'Example: {"a":1}\nAnswer: {"a":2}', '{"text":"unfinished', '<think>{"a":1}']) {
  assert.equal(parseStructuredJsonText(input).ok, false, input);
}

assert.equal(parseStructuredJsonText('{"x":1e400,"x":null}').ok, false);
assert.equal(parseStructuredJsonText('{"x":' .repeat(7000) + '0' + '}'.repeat(7000)).ok, true);

const recoveryFixtures = JSON.parse(fs.readFileSync(new URL('../fixtures/model-output-recovery.json', import.meta.url), 'utf8'));
for (const fixture of recoveryFixtures) {
  const result = parseStructuredJsonText(fixture.input);
  assert.equal(result.ok, fixture.expectedOk, fixture.id);
  if (fixture.expectedOk) assert.deepEqual(result.value, fixture.expectedValue, fixture.id);
  else assert.equal(result.diagnostic.code, fixture.expectedCode, fixture.id);
}
for (const input of ['x'.repeat(262145), 'Result: ' + '['.repeat(65) + '0' + ']'.repeat(65), Array.from({length: 5}, (_, i) => JSON.stringify({i})).join(' ')]) {
  assert.equal(parseStructuredJsonText(input).diagnostic.code, 'json_recovery_limit');
}
assert.deepEqual(parseStructuredJsonText('[false,0,null]', {requireObject:false}).value, [false,0,null]);
assert.equal(parseStructuredJsonText(JSON.stringify({text:'x'.repeat(262145)})).ok, true);

assert.deepEqual(parseStructuredJsonText('{"a":1, // comment\r"b":2}').value, {a:1,b:2});
assert.deepEqual(parseStructuredJsonText('{}'.repeat(30000)).value, {});
console.log(`Provider response parser tests passed (${recoveryFixtures.length} recovery fixtures).`);
