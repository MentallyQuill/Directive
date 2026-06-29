import assert from 'node:assert/strict';

import {
  generationTimingEntryStatus,
  generationTimingProofStatus,
  timingProofEntryIsNonGenerated,
  timingProofEntryRequiresGenerationStart
} from './lib/generation-timing-proof-policy.mjs';

const generatedPass = {
  route: 'directivePosted',
  responseKind: 'committedOutcome',
  directiveGenerationStartedAt: '2026-06-28T17:00:10.000Z',
  turnLatency: {
    directiveGenerationStartedAt: Date.parse('2026-06-28T17:00:10.000Z'),
    generationStartLatencyMs: 4200,
    architectureWithin60s: true
  }
};

assert.equal(timingProofEntryRequiresGenerationStart(generatedPass), true);
assert.equal(timingProofEntryIsNonGenerated(generatedPass), false);
assert.equal(generationTimingEntryStatus(generatedPass), 'pass');
assert.equal(generationTimingProofStatus({
  checked: [generatedPass],
  statuses: ['pass'],
  entries: [generatedPass]
}), 'pass');

const generatedMissingStart = {
  route: 'directivePosted',
  responseKind: 'committedOutcome',
  turnLatency: {}
};

assert.equal(timingProofEntryRequiresGenerationStart(generatedMissingStart), true);
assert.equal(generationTimingEntryStatus(generatedMissingStart), 'missing-directive-start');
assert.equal(generationTimingProofStatus({
  checked: [generatedMissingStart],
  statuses: ['missing-directive-start'],
  entries: [generatedMissingStart]
}), 'fail');

const clarification = {
  route: 'directivePosted',
  responseKind: 'clarificationNeeded',
  turnLatency: {}
};

assert.equal(timingProofEntryRequiresGenerationStart(clarification), false);
assert.equal(timingProofEntryIsNonGenerated(clarification), true);
assert.equal(generationTimingProofStatus({
  checked: [],
  statuses: [],
  entries: [clarification]
}), 'skipped');

const unknownDirectivePost = {
  route: 'directivePosted',
  responseKind: 'unexpectedDirectivePost',
  turnLatency: {}
};

assert.equal(timingProofEntryRequiresGenerationStart(unknownDirectivePost), false);
assert.equal(timingProofEntryIsNonGenerated(unknownDirectivePost), false);
assert.equal(generationTimingProofStatus({
  checked: [],
  statuses: [],
  entries: [unknownDirectivePost]
}), 'warning');

const hostContinueMissingRelease = {
  route: 'hostContinue',
  responseKind: 'hostGeneration',
  turnLatency: {}
};

assert.equal(timingProofEntryRequiresGenerationStart(hostContinueMissingRelease), true);
assert.equal(generationTimingEntryStatus(hostContinueMissingRelease), 'missing-host-release');

console.log('Generation timing proof policy tests passed.');
