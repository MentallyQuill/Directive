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
  "id": "ship-delta",
  "operations": [
    {"op":"merge","path":"ship.technicalDebt","value":{"ship.command-network-certificate-compatibility":{"owner":"Commander Cross","status":"active"}}},
    {"op":"append","path":"ship.damage","value":{"id":"damage-1","summary":"Minor damage."}}
  ],
  "summary": "Valid JSON already stays unchanged."
}`);
assert.equal(repairedMissingOperationCloser.ok, true);
assert.equal(repairedMissingOperationCloser.value.operations.length, 2);

const malformedMissingOperationCloser = parseStructuredJsonText('{"id":"ship-delta","operations":[{"op":"merge","path":"ship.technicalDebt","value":{"ship.command-network-certificate-compatibility":{"owner":"Commander Cross","status":"active"}},{"op":"append","path":"ship.damage","value":{"id":"damage-1","summary":"Minor damage."}}],"summary":"Recovered missing operation closer."}');
assert.equal(malformedMissingOperationCloser.ok, true);
assert.equal(malformedMissingOperationCloser.repaired, true);
assert.equal(malformedMissingOperationCloser.value.operations.length, 2);
assert.match(repairMissingArrayElementObjectClosers('{"operations":[{"op":"merge","path":"ship.technicalDebt","value":{"a":{"b":1}},{"op":"append","path":"ship.damage","value":{"id":"x"}}]}'), /"b":1\}\}\},\{"op":"append"/);

const invalid = parseStructuredJsonText('no object here');
assert.equal(invalid.ok, false);
assert.equal(invalid.diagnostic.code, 'json_invalid');

console.log('Provider response parser tests passed.');
