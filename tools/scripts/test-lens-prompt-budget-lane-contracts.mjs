import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  createLensPromptBudgetTrace,
  LENS_PROMPT_BUDGET_LANES,
  LENS_PROMPT_BUDGET_TRACE_KIND,
  promptBudgetLaneIds
} from '../../src/runtime/lens-prompt-budget-trace.mjs';

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

const schema = readJson('schemas/runtime/lens-prompt-budget-trace.schema.json');
assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
assert.equal(schema.additionalProperties, false);
assert.equal(schema.required.includes('lanes'), true);
assert.deepEqual(promptBudgetLaneIds(), [
  'stableRules',
  'protectedContinuity',
  'activeScene',
  'activeCast',
  'missionPressure',
  'recentTranscript',
  'recall',
  'volatileTurn',
  'externalEnvironment'
]);
assert.deepEqual(promptBudgetLaneIds(), [...LENS_PROMPT_BUDGET_LANES]);

const trace = createLensPromptBudgetTrace({
  packetId: 'packet-1',
  promptRevision: 12,
  cacheKey: 'cache-key-1',
  cacheInputs: {
    mechanicsRevision: 44,
    promptDomainVector: {
      continuity: 9,
      sourceBinding: 2
    },
    recallIndexRevision: 'recall-rev-1',
    sceneSealRevision: 'seal-rev-1',
    pressureArcDigestRevision: 'pressure-arc-rev-1',
    packageRevision: 'package-rev-1',
    externalPromptEnvironmentRef: {
      kind: 'directive.externalPromptEnvironmentRef.v1',
      hash: 'external-hash',
      rawPromptBody: 'External raw prompt body must not serialize.'
    }
  },
  lanes: [
    {
      id: 'stableRules',
      budgetTokens: 400,
      reservedFloor: 300,
      authority: 'directive',
      refs: [{
        id: 'rules-directive',
        kind: 'rules',
        hash: 'rules-hash',
        estimatedTokens: 120,
        text: 'Prompt body text must not serialize.'
      }]
    },
    {
      id: 'recall',
      budgetTokens: 100,
      reservedFloor: 0,
      authority: 'directive',
      refs: [
        {
          id: 'recall-bronn-warning',
          kind: 'directive.recallIndexEntry.v1',
          authority: 'committed',
          hash: 'recall-hash-1',
          estimatedTokens: 70,
          rawTranscript: 'Raw transcript must not serialize.'
        },
        {
          id: 'recall-omitted',
          kind: 'directive.recallIndexEntry.v1',
          authority: 'package',
          hash: 'recall-hash-2',
          estimatedTokens: 60,
          providerOutput: 'Provider output must not serialize.'
        }
      ]
    },
    {
      id: 'externalEnvironment',
      budgetTokens: 0,
      reservedFloor: 0,
      authority: 'diagnostic',
      refs: [{
        id: 'external-ref',
        kind: 'directive.externalPromptEnvironmentRef.v1',
        hash: 'external-hash',
        estimatedTokens: 999,
        summaryceptionSummary: 'Summaryception summary must not serialize.',
        vectorPayload: 'Vector payload must not serialize.',
        apiKey: 'SECRET'
      }]
    }
  ]
});

assert.equal(trace.kind, LENS_PROMPT_BUDGET_TRACE_KIND);
assert.equal(trace.schemaVersion, 1);
assert.equal(trace.promptRevision, 12);
assert.match(trace.hash, /^[a-f0-9]{64}$/);
assert.equal(trace.cacheInputs.mechanicsRevision, 44);
assert.equal(trace.cacheInputs.recallIndexRevision, 'recall-rev-1');
assert.equal(trace.cacheInputs.sceneSealRevision, 'seal-rev-1');
assert.equal(trace.cacheInputs.pressureArcDigestRevision, 'pressure-arc-rev-1');
assert.equal(trace.cacheInputs.packageRevision, 'package-rev-1');
assert.equal(trace.cacheInputs.externalPromptEnvironmentRef.hash, 'external-hash');

const recallLane = trace.lanes.find((lane) => lane.id === 'recall');
assert.equal(recallLane.includedRefs.length, 1);
assert.equal(recallLane.includedRefs[0].id, 'recall-bronn-warning');
assert.equal(recallLane.omittedRefs.length, 1);
assert.equal(recallLane.omittedRefs[0].id, 'recall-omitted');
assert.equal(recallLane.omittedRefs[0].omissionReason, 'budget-exceeded');
assert.equal(recallLane.omissionReasons.includes('budget-exceeded'), true);

const externalLane = trace.lanes.find((lane) => lane.id === 'externalEnvironment');
assert.equal(externalLane.diagnosticOnly, true);
assert.equal(externalLane.includedRefs.length, 1);
assert.equal(externalLane.estimatedTokens, 999);

const serialized = JSON.stringify(trace);
assert.equal(serialized.includes('Prompt body text'), false);
assert.equal(serialized.includes('Raw transcript'), false);
assert.equal(serialized.includes('Provider output'), false);
assert.equal(serialized.includes('External raw prompt body'), false);
assert.equal(serialized.includes('Summaryception summary'), false);
assert.equal(serialized.includes('Vector payload'), false);
assert.equal(serialized.includes('SECRET'), false);

assert.throws(
  () => createLensPromptBudgetTrace({ lanes: [{ id: 'notALane' }] }),
  /Unknown LENS prompt budget lane/
);

console.log('LENS prompt budget lane contract tests passed.');
