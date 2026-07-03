import assert from 'node:assert/strict';

import {
  summarizeModelCallFailurePolicy
} from './lib/model-call-failure-policy.mjs';

function smokeSummary({ failedModelCallCount = 0, modelCallCount = 0, retainedModelCallCount = 0 } = {}) {
  return {
    browser: {
      chatCampaign: {
        failedModelCallCount,
        modelCallCount,
        retainedModelCallCount
      }
    }
  };
}

function smokeReport(modelCalls = []) {
  return {
    browser: {
      chatCampaignFlow: {
        final: {
          modelCallCount: modelCalls.length,
          modelCalls
        }
      }
    }
  };
}

function failedCall(overrides = {}) {
  return {
    id: 'model-call:test',
    roleId: 'continuityProjectionPlanner',
    providerKind: 'utility',
    status: 'failed',
    ok: false,
    latencyMs: 15000,
    errorCode: 'DIRECTIVE_GENERATION_TIMEOUT',
    requestHash: 'request-hash',
    metadata: {
      requestHash: 'request-hash',
      sourceHash: 'source-hash'
    },
    ...overrides
  };
}

const noFailures = summarizeModelCallFailurePolicy({
  smokeSummary: smokeSummary({ modelCallCount: 3, retainedModelCallCount: 3 })
});
assert.equal(noFailures.status, 'pass');
assert.equal(noFailures.failedModelCallCount, 0);

const handledFallback = summarizeModelCallFailurePolicy({
  smokeSummary: smokeSummary({ failedModelCallCount: 1, modelCallCount: 1, retainedModelCallCount: 1 }),
  smokeReport: smokeReport([failedCall()])
});
assert.equal(handledFallback.status, 'pass');
assert.equal(handledFallback.fallbackHandledCalls.length, 1);
assert.equal(handledFallback.calls[0].roleId, 'continuityProjectionPlanner');
assert.equal(handledFallback.calls[0].requestHash, 'request-hash');

const failClosedNoMutationFallback = summarizeModelCallFailurePolicy({
  smokeSummary: smokeSummary({ failedModelCallCount: 1, modelCallCount: 1, retainedModelCallCount: 1 }),
  smokeReport: smokeReport([failedCall({
    id: 'model-call:source-settlement-timeout',
    roleId: 'sourceSettlementLatestPair',
    providerKind: 'utility'
  })])
});
assert.equal(failClosedNoMutationFallback.status, 'pass');
assert.equal(failClosedNoMutationFallback.fallbackHandledCalls.length, 1);
assert.equal(
  failClosedNoMutationFallback.fallbackHandledCalls[0].classification,
  'fallback-handled-fail-closed-no-mutation'
);

const blockingRole = summarizeModelCallFailurePolicy({
  smokeSummary: smokeSummary({ failedModelCallCount: 1, modelCallCount: 1, retainedModelCallCount: 1 }),
  smokeReport: smokeReport([failedCall({
    id: 'model-call:blocking',
    roleId: 'narration',
    providerKind: 'main'
  })])
});
assert.equal(blockingRole.status, 'fail');
assert.equal(blockingRole.releaseBlockingCalls[0].classification, 'release-blocking-authoritative-failure');

const unknownRole = summarizeModelCallFailurePolicy({
  smokeSummary: smokeSummary({ failedModelCallCount: 1, modelCallCount: 1, retainedModelCallCount: 1 }),
  smokeReport: smokeReport([failedCall({
    id: 'model-call:unknown',
    roleId: 'notARealDirectiveRole'
  })])
});
assert.equal(unknownRole.status, 'fail');
assert.equal(unknownRole.releaseBlockingCalls[0].classification, 'release-blocking-unknown-role');

const missingRole = summarizeModelCallFailurePolicy({
  smokeSummary: smokeSummary({ failedModelCallCount: 1, modelCallCount: 1, retainedModelCallCount: 1 }),
  smokeReport: smokeReport([failedCall({
    id: 'model-call:missing-role',
    roleId: null
  })])
});
assert.equal(missingRole.status, 'fail');
assert.equal(missingRole.releaseBlockingCalls[0].classification, 'release-blocking-missing-role');

const missingStatus = summarizeModelCallFailurePolicy({
  smokeSummary: smokeSummary({ failedModelCallCount: 1, modelCallCount: 1, retainedModelCallCount: 1 }),
  smokeReport: smokeReport([failedCall({
    id: 'model-call:missing-status',
    status: null,
    error: { code: 'DIRECTIVE_GENERATION_TIMEOUT' }
  })])
});
assert.equal(missingStatus.status, 'fail');
assert.equal(missingStatus.releaseBlockingCalls[0].classification, 'release-blocking-missing-status');

const missingErrorCode = summarizeModelCallFailurePolicy({
  smokeSummary: smokeSummary({ failedModelCallCount: 1, modelCallCount: 1, retainedModelCallCount: 1 }),
  smokeReport: smokeReport([failedCall({
    id: 'model-call:missing-error',
    errorCode: null,
    error: null
  })])
});
assert.equal(missingErrorCode.status, 'fail');
assert.equal(missingErrorCode.releaseBlockingCalls[0].classification, 'release-blocking-missing-error-code');

const missingRequestHash = summarizeModelCallFailurePolicy({
  smokeSummary: smokeSummary({ failedModelCallCount: 1, modelCallCount: 1, retainedModelCallCount: 1 }),
  smokeReport: smokeReport([failedCall({
    id: 'model-call:missing-request',
    requestHash: null,
    metadata: {}
  })])
});
assert.equal(missingRequestHash.status, 'fail');
assert.equal(missingRequestHash.releaseBlockingCalls[0].classification, 'release-blocking-missing-request-hash');

const countOnly = summarizeModelCallFailurePolicy({
  smokeSummary: smokeSummary({ failedModelCallCount: 2, modelCallCount: 4, retainedModelCallCount: 0 })
});
assert.equal(countOnly.status, 'fail');
assert.equal(countOnly.releaseBlockingCalls[0].classification, 'release-blocking-missing-retained-evidence');
