import assert from 'node:assert/strict';

import {
  DIRECTIVE_STATIC_PROMPT_KEYS,
  buildContinuityProjectionDiagnostics,
  buildContinuityTelemetry
} from '../../src/continuity/index.mjs';

const hiddenFactText = 'The captain has a hidden medical collapse.';
const rejectedClaimText = 'Bronn is a human male in his early forties.';
const rawFactId = 'crew.hadrik-bronn.species';
const rawSourceId = 'source.raw.chat-message-77';

const campaignState = {
  campaign: { id: 'campaign-test' },
  campaignChatBinding: {
    promptContextRevision: 12,
    promptContextHash: 'prompt-hash-binding'
  },
  runtimeTracking: {
    revision: 3,
    promptContext: {
      revision: 12,
      hash: 'prompt-hash-runtime',
      continuityProjection: {
        kind: 'directive.continuityProjectionMatrix.v1',
        hash: 'projection-hash',
        sourceHash: 'source-hash',
        policyHash: 'policy-hash',
        audit: {
          blockCount: 6,
          factCount: 14,
          selectedFactCount: 9,
          conflictCount: 2,
          omittedFactCount: 3,
          validatorRejectionCount: 1
        },
        plan: {
          selectedFactIds: [rawFactId],
          laneFactIds: {
            'directive.continuity.invariants': [rawFactId]
          }
        }
      },
      blocks: DIRECTIVE_STATIC_PROMPT_KEYS.map((promptKey) => ({
        id: `block.${promptKey}`,
        promptKey,
        sourceIds: [rawFactId, rawSourceId]
      }))
    },
    responseLedger: [{
      id: 'response.raw.1',
      status: 'delegatedContinuityIssue',
      authority: 'compatibilityProjection',
      projectionSource: 'coreStoreV2',
      compatibilityMirror: {
        kind: 'directive.coreResponseCompatibilityMirror.v1',
        status: 'delegatedContinuityIssue',
        transactionId: 'txn.response.raw.1'
      },
      hostObservation: {
        hostMessageId: 'host-message-raw-1',
        textHash: 'observed-text-hash'
      },
      continuityReview: {
        ok: false,
        findings: [{
          factId: rawFactId,
          summary: hiddenFactText
        }]
      }
    }],
    recoveryJournal: [{
      id: 'recovery.raw.1',
      type: 'hostNativeContinuityContradiction',
      status: 'open'
    }]
  },
  continuity: {
    schemaVersion: 1,
    candidateClaims: [{
      id: 'claim.candidate.raw',
      text: 'The shuttle rendezvous is underway.',
      categories: ['travel'],
      source: { kind: 'hostNativeGeneration', id: rawSourceId }
    }],
    rejectedClaims: [{
      id: 'claim.rejected.raw',
      text: rejectedClaimText,
      textHash: 'rejected-text-hash',
      categories: ['species', 'age'],
      source: { kind: 'hostNativeGeneration', id: rawSourceId }
    }],
    projectionHints: [{
      id: 'hint.raw.1',
      factId: rawFactId,
      reason: hiddenFactText
    }],
    projectionRuns: [{
      id: 'projection.raw.1',
      sourceHash: 'source-hash',
      hash: 'projection-hash',
      blockCount: 6,
      selectedFactIds: [rawFactId],
      conflictCount: 2,
      rejections: [{ factId: rawFactId }]
    }],
    factUseStats: {},
    projectionCache: {
      sourceHash: 'source-hash',
      policyHash: 'policy-hash',
      promptHash: 'projection-hash',
      blocks: [],
      omitted: []
    },
    lastProjection: {
      id: 'projection.raw.1',
      status: 'active',
      sourceHash: 'source-hash',
      hash: 'projection-hash',
      policyHash: 'policy-hash',
      blockCount: 6,
      selectedFactIds: [rawFactId],
      conflictCount: 2,
      rejections: [{ factId: rawFactId }]
    },
    auditLog: []
  }
};

const promptInspection = {
  kind: 'directive.promptInspection',
  hash: 'prompt-hash-runtime',
  blocks: DIRECTIVE_STATIC_PROMPT_KEYS.slice(0, -1).map((promptKey) => ({
    id: `installed.${promptKey}`,
    key: promptKey,
    promptKey,
    sourceIds: [rawFactId, rawSourceId],
    text: hiddenFactText
  }))
};

const diagnostics = buildContinuityProjectionDiagnostics({ campaignState, promptInspection });
assert.equal(diagnostics.kind, 'directive.continuityProjectionDiagnostics.v1');
assert.equal(diagnostics.status, 'needs-rebuild');
assert.equal(diagnostics.staticKeys.missingStaticKeyCount, 1);
assert.equal(diagnostics.conflictCount, 2);
assert.equal(diagnostics.rejectedClaimCount, 1);
assert.equal(diagnostics.candidateClaimCount, 1);
assert.equal(diagnostics.latestReview.status, 'contradicted');
assert.equal(diagnostics.latestReview.observationTextHash, 'observed-text-hash');
assert.equal(diagnostics.latestRejectedClaim.textHash, 'rejected-text-hash');
assert.deepEqual(diagnostics.latestRejectedClaim.categories, ['species', 'age']);

const telemetry = buildContinuityTelemetry({ campaignState, promptInspection });
assert.equal(telemetry.kind, 'directive.continuityTelemetry.v1');
assert.equal(telemetry.rejectedClaimCount, 1);
assert.equal(telemetry.staticKeys.missingStaticKeyCount, 1);

const projectedCampaignState = {
  ...campaignState,
  directiveRuntimeEvidence: {
    coreStoreReadProjections: {
      responseLedger: [{
        id: 'core.response.continuity',
        hostMessageId: 'core-host-message',
        status: 'posted',
        hostObservation: {
          hostMessageId: 'core-host-message',
          textHash: 'core-observed-text-hash'
        },
        continuityReview: {
          ok: true,
          findings: []
        }
      }],
      recoveryJournal: [{
        id: 'core.recovery.continuity',
        type: 'hostNativeContinuityContradiction',
        status: 'resolved'
      }]
    }
  },
  runtimeTracking: {
    ...campaignState.runtimeTracking,
    responseLedger: [{
      id: 'stale.old.response.continuity',
      hostMessageId: 'stale-old-host-message',
      status: 'recoveryRequired',
      hostObservation: {
        hostMessageId: 'stale-old-host-message',
        textHash: 'stale-old-observed-text-hash'
      },
      continuityReview: {
        ok: false,
        findings: [{ summary: 'RAW_STALE_OLD_CONTINUITY_FINDING' }]
      }
    }],
    recoveryJournal: [{
      id: 'stale.old.recovery.continuity',
      type: 'hostNativeContinuityContradiction',
      status: 'open'
    }]
  }
};
const projectedDiagnostics = buildContinuityProjectionDiagnostics({ campaignState: projectedCampaignState, promptInspection });
assert.equal(projectedDiagnostics.latestReview.status, 'ok');
assert.equal(projectedDiagnostics.latestReview.responseStatus, 'posted');
assert.equal(projectedDiagnostics.latestReview.observationTextHash, 'core-observed-text-hash');
assert.equal(projectedDiagnostics.latestReview.recoveryCount, 1);
assert.equal(projectedDiagnostics.latestReview.latestRecoveryStatus, 'resolved');
assert.equal(JSON.stringify(projectedDiagnostics).includes('stale-old'), false);
assert.equal(JSON.stringify(projectedDiagnostics).includes('RAW_STALE_OLD_CONTINUITY_FINDING'), false);

const serialized = JSON.stringify({ diagnostics, telemetry });
for (const forbidden of [hiddenFactText, rejectedClaimText, rawFactId, rawSourceId, 'host-message-raw-1', 'response.raw.1', 'claim.rejected.raw']) {
  assert.doesNotMatch(serialized, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Diagnostics leaked ${forbidden}`);
}
assert.doesNotMatch(serialized, /sourceIds|factIndex|sourceFrame|findings/, 'Diagnostics should not expose raw matrix internals.');

console.log('Continuity Projection Matrix diagnostics tests passed: sanitized counts, hashes, freshness, and telemetry');
