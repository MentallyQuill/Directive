import assert from 'node:assert/strict';

import {
  commitTrackedCampaignState,
  createCampaignStateSnapshot,
  createStateDeltaGateway,
  initializeCampaignRuntimeTracking,
  recordDirectiveResponse,
  recordLifecycleEvent,
  recordModelCallEvent,
  recordPendingInteraction,
  recordTurnIngress,
  resolvePendingInteraction,
  resolveRecoveryEvent,
  restoreTrackedCampaignRevision,
  updateDirectiveResponse,
  updateTurnIngress
} from '../../src/runtime/state-delta-gateway.mjs';
import {
  createRuntimeLedgerView,
  readRuntimeCoreProjections
} from '../../src/runtime/runtime-ledger-view.mjs';
import { terminalDecisionLedgerView } from '../../src/runtime/terminal-decision-ledger-view.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

const sidecarDemotionInitState = initializeCampaignRuntimeTracking({
  campaign: { id: 'sidecar-demotion-init' },
  runtimeTracking: {
    sidecarJournal: [{ id: 'legacy-sidecar-row', diagnostics: { raw: 'old sidecar diagnostics' } }]
  }
});
assert.deepEqual(sidecarDemotionInitState.runtimeTracking.sidecarJournal, []);

let sidecarDemotionCommitState = initializeCampaignRuntimeTracking({
  campaign: { id: 'sidecar-demotion-commit' },
  mission: { activePhaseId: 'before-sidecar-demotion' }
});
sidecarDemotionCommitState.runtimeTracking.sidecarJournal = [{ id: 'legacy-sidecar-hot-row' }];
const sidecarDemotionNextState = cloneJson(sidecarDemotionCommitState);
sidecarDemotionNextState.mission.activePhaseId = 'after-sidecar-demotion';
sidecarDemotionCommitState = commitTrackedCampaignState({
  campaignState: sidecarDemotionCommitState,
  nextCampaignState: sidecarDemotionNextState,
  delta: {
    source: 'test',
    reason: 'Legacy sidecar demotion fixture.',
    domains: ['mission'],
    stable: true
  }
});
assert.deepEqual(sidecarDemotionCommitState.runtimeTracking.sidecarJournal, []);
sidecarDemotionCommitState.runtimeTracking.sidecarJournal = [{ id: 'legacy-sidecar-before-restore' }];
const sidecarDemotionRestoredState = restoreTrackedCampaignRevision(sidecarDemotionCommitState, 0, {
  reason: 'Legacy sidecar restore demotion fixture.'
});
assert.deepEqual(sidecarDemotionRestoredState.runtimeTracking.sidecarJournal, []);

const terminalLedgerDemotionState = initializeCampaignRuntimeTracking({
  campaign: { id: 'terminal-ledger-demotion-init' },
  runtimeTracking: {
    endConditionLedger: {
      schemaVersion: 1,
      activeDecisionId: 'legacy-terminal-decision',
      detections: [
        { id: 'legacy-terminal-detection', decisionId: 'legacy-terminal-decision' },
        {
          id: 'tagged-terminal-detection',
          decisionId: 'tagged-terminal-decision',
          authority: 'terminalDecisionProjection',
          projectionSource: 'terminalOutcomeDecision',
          coreProjection: {
            kind: 'directive.terminalEndConditionLedgerProjectionRef.v1',
            rowKind: 'detection',
            decisionId: 'tagged-terminal-decision',
            detectionId: 'tagged-terminal-detection',
            status: 'detected'
          }
        }
      ],
      decisions: [
        { id: 'legacy-terminal-decision', status: 'pending' },
        {
          id: 'tagged-terminal-decision',
          status: 'pending',
          authority: 'terminalDecisionProjection',
          projectionSource: 'terminalOutcomeDecision',
          coreProjection: {
            kind: 'directive.terminalEndConditionLedgerProjectionRef.v1',
            rowKind: 'decision',
            decisionId: 'tagged-terminal-decision',
            status: 'pending'
          }
        }
      ],
      branchRecords: [
        { id: 'legacy-terminal-branch' },
        {
          id: 'tagged-terminal-branch',
          authority: 'terminalDecisionProjection',
          projectionSource: 'terminalOutcomeDecision',
          coreProjection: {
            kind: 'directive.terminalEndConditionLedgerProjectionRef.v1',
            rowKind: 'branchRecord',
            decisionId: 'tagged-terminal-decision',
            status: 'branchSaved'
          }
        }
      ],
      continuationFrames: [
        { id: 'legacy-terminal-continuation' },
        {
          id: 'tagged-terminal-continuation',
          authority: 'terminalDecisionProjection',
          projectionSource: 'terminalOutcomeDecision',
          coreProjection: {
            kind: 'directive.terminalEndConditionLedgerProjectionRef.v1',
            rowKind: 'continuationFrame',
            decisionId: 'tagged-terminal-decision',
            status: 'accepted'
          }
        }
      ]
    }
  }
});
assert.deepEqual(
  terminalLedgerDemotionState.runtimeTracking.endConditionLedger.detections.map((entry) => entry.id),
  ['tagged-terminal-detection'],
  'Runtime tracking initialization must drop untagged terminal detection rows.'
);
assert.deepEqual(
  terminalLedgerDemotionState.runtimeTracking.endConditionLedger.decisions.map((entry) => entry.id),
  ['tagged-terminal-decision'],
  'Runtime tracking initialization must drop untagged terminal decision rows.'
);
assert.deepEqual(
  terminalLedgerDemotionState.runtimeTracking.endConditionLedger.branchRecords.map((entry) => entry.id),
  ['tagged-terminal-branch'],
  'Runtime tracking initialization must drop untagged terminal branch rows.'
);
assert.deepEqual(
  terminalLedgerDemotionState.runtimeTracking.endConditionLedger.continuationFrames.map((entry) => entry.id),
  ['tagged-terminal-continuation'],
  'Runtime tracking initialization must drop untagged terminal continuation rows.'
);
assert.equal(
  terminalLedgerDemotionState.runtimeTracking.endConditionLedger.activeDecisionId,
  null,
  'Runtime tracking initialization must not keep activeDecisionId for dropped legacy terminal decisions.'
);

const sceneLedgerDemotionState = initializeCampaignRuntimeTracking({
  campaign: { id: 'scene-ledger-demotion-init' },
  runtimeTracking: {
    sceneReconciliation: {
      schemaVersion: 2,
      markers: { start: { hostMessageId: 'legacy-start' }, end: null },
      runs: [{ id: 'legacy-recon-run', status: 'completed' }],
      pending: [{ id: 'legacy-recon-pending' }],
      applied: [],
      rejected: [],
      recalculationPreviews: [],
      chunkCache: [],
      invalidations: []
    },
    sceneHandshake: {
      settled: [
        { id: 'legacy-scene-handshake-settled', status: 'settled' },
        {
          id: 'tagged-scene-handshake-settled',
          status: 'settled',
          authority: 'sreSceneHandshakeProjection',
          projectionSource: 'sourceSettlementLatestPair',
          compatibilityMirror: {
            kind: 'directive.sceneHandshakeLedgerProjectionRef.v1',
            settlementId: 'tagged-scene-handshake-settled',
            status: 'settled'
          }
        }
      ],
      pendingInternalReview: [{ id: 'legacy-scene-handshake-review', status: 'pendingInternalReview' }],
      deferred: [],
      operatorRecovery: [],
      rejected: [],
      lastResult: { id: 'legacy-scene-handshake-settled', status: 'settled' }
    }
  }
});
assert.deepEqual(
  sceneLedgerDemotionState.runtimeTracking.sceneReconciliation.runs,
  [],
  'Runtime tracking initialization must drop untagged Scene Reconciliation status runs.'
);
assert.equal(
  sceneLedgerDemotionState.runtimeTracking.sceneReconciliation.markers.start,
  null,
  'Runtime tracking initialization must drop untagged Scene Reconciliation markers.'
);
assert.deepEqual(
  sceneLedgerDemotionState.runtimeTracking.sceneHandshake.settled.map((entry) => entry.id),
  ['tagged-scene-handshake-settled'],
  'Runtime tracking initialization must drop untagged Scene Handshake rows while preserving tagged SRE rows.'
);
assert.deepEqual(sceneLedgerDemotionState.runtimeTracking.sceneHandshake.pendingInternalReview, []);
assert.equal(sceneLedgerDemotionState.runtimeTracking.sceneHandshake.lastResult, null);

const taggedSceneLedgerState = initializeCampaignRuntimeTracking({
  campaign: { id: 'tagged-scene-ledger-init' },
  runtimeTracking: {
    sceneReconciliation: {
      schemaVersion: 2,
      authority: 'sreSceneReconciliationProjection',
      projectionSource: 'sceneReconciliation',
      compatibilityMirror: {
        kind: 'directive.sceneReconciliationLedgerProjectionRef.v1',
        runId: 'tagged-recon-run',
        status: 'completed'
      },
      markers: { start: { hostMessageId: 'tagged-start' }, end: null },
      runs: [{ id: 'tagged-recon-run', status: 'completed' }],
      pending: [],
      applied: [{ id: 'tagged-recon-applied' }],
      rejected: [],
      recalculationPreviews: [],
      chunkCache: [],
      invalidations: []
    },
    sceneHandshake: {
      settled: [],
      pendingInternalReview: [],
      deferred: [],
      operatorRecovery: [],
      rejected: [],
      lastResult: {
        id: 'tagged-scene-handshake-last',
        status: 'settled',
        authority: 'sreSceneHandshakeProjection',
        projectionSource: 'sourceSettlementLatestPair',
        compatibilityMirror: {
          kind: 'directive.sceneHandshakeLedgerProjectionRef.v1',
          settlementId: 'tagged-scene-handshake-last',
          status: 'settled'
        }
      }
    }
  }
});
assert.deepEqual(taggedSceneLedgerState.runtimeTracking.sceneReconciliation.runs.map((entry) => entry.id), ['tagged-recon-run']);
assert.equal(taggedSceneLedgerState.runtimeTracking.sceneReconciliation.markers.start.hostMessageId, 'tagged-start');
assert.deepEqual(taggedSceneLedgerState.sceneReconciliation.runs.map((entry) => entry.id), ['tagged-recon-run']);
assert.equal(taggedSceneLedgerState.sceneReconciliation.markers.start.hostMessageId, 'tagged-start');
assert.equal(taggedSceneLedgerState.runtimeTracking.sceneHandshake.lastResult.id, 'tagged-scene-handshake-last');

const lifecycleDemotionState = initializeCampaignRuntimeTracking({
  campaign: { id: 'lifecycle-demotion-init' },
  runtimeTracking: {
    lifecycleJournal: [
      {
        id: 'legacy-lifecycle-row',
        type: 'chatRebind',
        status: 'applied'
      },
      {
        id: 'legacy-lifecycle-telemetry-row',
        type: 'chatRebind',
        status: 'applied',
        authority: 'legacyLifecycleTelemetry',
        projectionSource: 'runtimeTrackingLegacy',
        compatibilityMirror: {
          kind: 'directive.lifecycleCompatibilityMirror.v1',
          status: 'legacyLifecycleTelemetry'
        }
      },
      {
        id: 'runtime-lifecycle-row',
        type: 'chatRebind',
        status: 'applied',
        authority: 'runtimeLifecycleProjection',
        projectionSource: 'runtimeApp',
        compatibilityMirror: {
          kind: 'directive.lifecycleCompatibilityMirror.v1',
          status: 'runtimeLifecycleProjection',
          lifecycleId: 'runtime-lifecycle-row',
          type: 'chatRebind'
        }
      },
      {
        id: 'repair-lifecycle-row',
        type: 'stateRevisionRestored',
        status: 'applied',
        authority: 'repairLifecycleProjection',
        projectionSource: 'stateDeltaGateway',
        compatibilityMirror: {
          kind: 'directive.lifecycleCompatibilityMirror.v1',
          status: 'repairLifecycleProjection',
          lifecycleId: 'repair-lifecycle-row',
          type: 'stateRevisionRestored'
        }
      }
    ]
  }
});
assert.deepEqual(
  lifecycleDemotionState.runtimeTracking.lifecycleJournal.map((entry) => entry.id),
  ['runtime-lifecycle-row', 'repair-lifecycle-row'],
  'Runtime tracking initialization must drop untagged and legacy lifecycle telemetry rows while preserving owned lifecycle projections.'
);

const runtimeBoundaryDemotionState = initializeCampaignRuntimeTracking({
  campaign: { id: 'runtime-boundary-demotion-init' },
  runtimeTracking: {
    lastWorldBoundary: {
      id: 'legacy-world-boundary',
      type: 'travel',
      sourceEventId: 'event:legacy'
    },
    timeNormalization: {
      reason: 'legacy-time-normalization',
      repairs: ['timeLedger']
    }
  }
});
assert.equal(runtimeBoundaryDemotionState.runtimeTracking.lastWorldBoundary, undefined);
assert.equal(runtimeBoundaryDemotionState.runtimeTracking.timeNormalization, undefined);

const runtimeBoundaryTaggedState = initializeCampaignRuntimeTracking({
  campaign: { id: 'runtime-boundary-tagged-init' },
  runtimeTracking: {
    lastWorldBoundary: {
      id: 'tagged-world-boundary',
      type: 'travel',
      sourceEventId: 'event:tagged',
      authority: 'openWorldBoundaryProjection',
      projectionSource: 'directorCoordinator',
      compatibilityMirror: {
        kind: 'directive.openWorldBoundaryProjectionRef.v1',
        boundaryId: 'tagged-world-boundary',
        boundaryType: 'travel'
      }
    },
    timeNormalization: {
      reason: 'tagged-time-normalization',
      repairs: ['timeLedger'],
      authority: 'timeNormalizationProjection',
      projectionSource: 'campaignTimeState',
      compatibilityMirror: {
        kind: 'directive.timeNormalizationProjectionRef.v1',
        reason: 'tagged-time-normalization',
        repairCount: 1
      }
    }
  }
});
assert.equal(runtimeBoundaryTaggedState.runtimeTracking.lastWorldBoundary.id, 'tagged-world-boundary');
assert.equal(runtimeBoundaryTaggedState.runtimeTracking.timeNormalization.reason, 'tagged-time-normalization');

const pendingInteractionDemotionState = initializeCampaignRuntimeTracking({
  campaign: { id: 'pending-interaction-demotion-init' },
  runtimeTracking: {
    pendingInteractions: [
      {
        id: 'legacy-pending-interaction-row',
        kind: 'clarificationNeeded',
        status: 'pending'
      },
      {
        id: 'legacy-pending-telemetry-row',
        kind: 'clarificationNeeded',
        status: 'pending',
        authority: 'legacyPendingInteractionTelemetry',
        projectionSource: 'runtimeTrackingLegacy',
        compatibilityMirror: {
          kind: 'directive.pendingInteractionCompatibilityMirror.v1',
          status: 'legacyPendingInteractionTelemetry'
        }
      },
      {
        id: 'core-pending-interaction-row',
        kind: 'clarificationNeeded',
        status: 'pending',
        authority: 'corePendingInteractionProjection',
        projectionSource: 'coreStoreV2',
        compatibilityMirror: {
          kind: 'directive.pendingInteractionCompatibilityMirror.v1',
          status: 'corePendingInteractionProjection',
          interactionId: 'core-pending-interaction-row',
          transactionId: 'txn:pending:core'
        }
      },
      {
        id: 'terminal-pending-interaction-row',
        kind: 'terminalOutcomeDecision',
        status: 'pending',
        authority: 'terminalDecisionProjection',
        projectionSource: 'terminalOutcomeDecision',
        compatibilityMirror: {
          kind: 'directive.pendingInteractionCompatibilityMirror.v1',
          status: 'terminalDecisionProjection',
          interactionId: 'terminal-pending-interaction-row',
          checkpointId: 'checkpoint:terminal'
        }
      },
      {
        id: 'repair-pending-interaction-row',
        kind: 'operatorRecovery',
        status: 'pending',
        authority: 'repairPendingInteractionProjection',
        projectionSource: 'repairRuntime',
        compatibilityMirror: {
          kind: 'directive.pendingInteractionCompatibilityMirror.v1',
          status: 'repairPendingInteractionProjection',
          interactionId: 'repair-pending-interaction-row'
        }
      }
    ]
  }
});
assert.deepEqual(
  pendingInteractionDemotionState.runtimeTracking.pendingInteractions.map((entry) => entry.id),
  ['core-pending-interaction-row', 'terminal-pending-interaction-row', 'repair-pending-interaction-row'],
  'Runtime tracking initialization must drop untagged and legacy pending interaction telemetry rows while preserving owned projections.'
);

const modelCallInitDemotionState = initializeCampaignRuntimeTracking({
  campaign: { id: 'model-call-init-demotion' },
  runtimeTracking: {
    modelCallJournal: [{
      id: 'model-call:init:legacy',
      roleId: 'utilityTurnClassifier',
      providerKind: 'utility',
      status: 'ok',
      providerId: 'fixture-provider',
      model: 'fixture-model',
      trigger: 'classification',
      campaignRevision: 4,
      requestHash: 'model-call-init-hash',
      parseStatus: 'ok',
      validationStatus: 'ok',
      appliedStatus: 'ok',
      sanitizedReason: 'compact only',
      latencyMs: 25,
      retryable: true,
      recordedAt: '2026-07-03T00:00:00.000Z',
      errorCode: 'none',
      prompt: 'RAW_INIT_MODEL_CALL_PROMPT_SHOULD_NOT_SURVIVE',
      response: 'RAW_INIT_MODEL_CALL_RESPONSE_SHOULD_NOT_SURVIVE',
      metadata: {
        prompt: 'RAW_INIT_MODEL_CALL_METADATA_SHOULD_NOT_SURVIVE',
        providerPayload: { body: 'RAW_INIT_MODEL_CALL_BODY_SHOULD_NOT_SURVIVE' }
      }
    }]
  }
});
assert.deepEqual(
  Object.keys(modelCallInitDemotionState.runtimeTracking.modelCallJournal[0]).sort(),
  [
    'appliedStatus',
    'campaignRevision',
    'errorCode',
    'id',
    'latencyMs',
    'model',
    'parseStatus',
    'providerId',
    'providerKind',
    'recordedAt',
    'requestHash',
    'retryable',
    'roleId',
    'sanitizedReason',
    'status',
    'trigger',
    'validationStatus'
  ].sort(),
  'Runtime tracking initialization must reduce old model-call telemetry to compact allowed fields.'
);
assert.equal(
  JSON.stringify(modelCallInitDemotionState.runtimeTracking.modelCallJournal).includes('RAW_INIT_MODEL_CALL_'),
  false,
  'Runtime tracking initialization must drop raw prompt/response/metadata from old model-call telemetry.'
);

const runtimeLedgerInitDemotionState = initializeCampaignRuntimeTracking({
  campaign: { id: 'runtime-ledger-init-demotion' },
  runtimeTracking: {
    ingressLedger: [{
      id: 'ingress-init-raw',
      hostMessageId: 'player-init-raw',
      textHash: 'ingress-init-hash',
      text: 'RAW_INIT_INGRESS_TEXT_SHOULD_NOT_SURVIVE',
      replacementText: 'RAW_INIT_INGRESS_REPLACEMENT_SHOULD_NOT_SURVIVE',
      metadata: { prompt: 'RAW_INIT_INGRESS_METADATA_SHOULD_NOT_SURVIVE' },
      sourceFrame: {
        id: 'frame-init-raw',
        hostMessageId: 'player-init-raw',
        textHash: 'frame-init-hash',
        text: 'RAW_INIT_SOURCE_FRAME_TEXT_SHOULD_NOT_SURVIVE'
      }
    }],
    responseLedger: [{
      id: 'response-init-raw',
      hostMessageId: 'assistant-init-raw',
      responseKind: 'hostContinue',
      status: 'posted',
      text: 'RAW_INIT_RESPONSE_TEXT_SHOULD_NOT_SURVIVE',
      replacementText: 'RAW_INIT_RESPONSE_REPLACEMENT_SHOULD_NOT_SURVIVE',
      hostObservation: {
        hostMessageId: 'assistant-init-raw',
        textHash: 'response-observation-hash',
        observedText: 'RAW_INIT_HOST_OBSERVATION_TEXT_SHOULD_NOT_SURVIVE'
      },
      hostContinuation: {
        observedMessage: {
          hostMessageId: 'assistant-init-raw',
          textHash: 'response-continuation-hash',
          text: 'RAW_INIT_HOST_CONTINUATION_TEXT_SHOULD_NOT_SURVIVE'
        }
      },
      metadata: {
        providerPayload: { body: 'RAW_INIT_RESPONSE_BODY_SHOULD_NOT_SURVIVE' }
      }
    }]
  }
});
const runtimeLedgerInitText = JSON.stringify(runtimeLedgerInitDemotionState.runtimeTracking);
assert.equal(
  runtimeLedgerInitText.includes('RAW_INIT_'),
  false,
  'Runtime tracking initialization must strip raw ingress/response bridge payloads.'
);
assert.equal(runtimeLedgerInitDemotionState.runtimeTracking.ingressLedger[0].replacementText, null);
assert.equal(runtimeLedgerInitDemotionState.runtimeTracking.ingressLedger[0].replacementTextHash.length, 64);
assert.equal(runtimeLedgerInitDemotionState.runtimeTracking.responseLedger[0].replacementText, null);
assert.equal(runtimeLedgerInitDemotionState.runtimeTracking.responseLedger[0].replacementTextHash.length, 64);
assert.equal(runtimeLedgerInitDemotionState.runtimeTracking.ingressLedger[0].sourceFrame.textHash, 'frame-init-hash');
assert.equal(runtimeLedgerInitDemotionState.runtimeTracking.responseLedger[0].hostObservation.textHash, 'response-observation-hash');

const historyInitDemotionState = initializeCampaignRuntimeTracking({
  campaign: { id: 'history-init-demotion' },
  runtimeTracking: {
    history: [{
      revision: 3,
      committedAt: '2026-07-03T00:01:00.000Z',
      source: 'test',
      reason: 'History init demotion fixture.',
      prompt: 'RAW_INIT_HISTORY_ENTRY_PROMPT_SHOULD_NOT_SURVIVE',
      metadata: {
        transcript: 'RAW_INIT_HISTORY_ENTRY_METADATA_SHOULD_NOT_SURVIVE'
      },
      snapshot: {
        campaign: { id: 'history-init-demotion' },
        mission: { activePhaseId: 'before-history-init-demotion' },
        directiveRuntimeEvidence: {
          coreStoreReadProjections: {
            ingressLedger: [{ id: 'history-core-ingress', raw: 'RAW_INIT_HISTORY_CORE_INGRESS_SHOULD_NOT_SURVIVE' }]
          }
        },
        runtimeResume: {
          kind: 'directive.runtimeResumeCursor.v1',
          responseLedgerRevision: 31
        },
        runtimeTracking: {
          history: [{ snapshot: { prompt: 'RAW_INIT_HISTORY_NESTED_HISTORY_SHOULD_NOT_SURVIVE' } }],
          ingressLedger: [{ id: 'history-ingress', text: 'RAW_INIT_HISTORY_INGRESS_TEXT_SHOULD_NOT_SURVIVE' }],
          responseLedger: [{ id: 'history-response', text: 'RAW_INIT_HISTORY_RESPONSE_TEXT_SHOULD_NOT_SURVIVE' }],
          recoveryJournal: [{ id: 'history-recovery', prompt: 'RAW_INIT_HISTORY_RECOVERY_PROMPT_SHOULD_NOT_SURVIVE' }],
          sidecarJournal: [{ id: 'history-sidecar', body: 'RAW_INIT_HISTORY_SIDECAR_BODY_SHOULD_NOT_SURVIVE' }],
          modelCallJournal: [{ id: 'history-model-call', prompt: 'RAW_INIT_HISTORY_MODEL_PROMPT_SHOULD_NOT_SURVIVE' }],
          pendingInteractions: [{ id: 'history-pending', prompt: 'RAW_INIT_HISTORY_PENDING_PROMPT_SHOULD_NOT_SURVIVE' }]
        }
      }
    }]
  }
});
const historyInitDemotionText = JSON.stringify(historyInitDemotionState.runtimeTracking.history);
assert.equal(
  historyInitDemotionText.includes('RAW_INIT_HISTORY_'),
  false,
  'Runtime tracking initialization must strip raw payloads from imported old history entries and snapshots.'
);
assert.equal(
  historyInitDemotionState.runtimeTracking.history[0].snapshot.mission.activePhaseId,
  'before-history-init-demotion',
  'Runtime tracking initialization must keep restorable compact state fields in imported old history snapshots.'
);
assert.equal(historyInitDemotionState.runtimeTracking.history[0].snapshot.directiveRuntimeEvidence, undefined);
assert.equal(historyInitDemotionState.runtimeTracking.history[0].snapshot.runtimeResume, undefined);
assert.equal(historyInitDemotionState.runtimeTracking.history[0].snapshot.runtimeTracking.history.length, 0);
assert.equal(historyInitDemotionState.runtimeTracking.history[0].snapshot.runtimeTracking.ingressLedger.length, 0);
assert.equal(historyInitDemotionState.runtimeTracking.history[0].snapshot.runtimeTracking.responseLedger.length, 0);
assert.equal(historyInitDemotionState.runtimeTracking.history[0].snapshot.runtimeTracking.recoveryJournal.length, 0);
assert.equal(historyInitDemotionState.runtimeTracking.history[0].snapshot.runtimeTracking.sidecarJournal.length, 0);
assert.equal(historyInitDemotionState.runtimeTracking.history[0].snapshot.runtimeTracking.modelCallJournal.length, 0);
assert.equal(historyInitDemotionState.runtimeTracking.history[0].snapshot.runtimeTracking.pendingInteractions.length, 0);

const legacyHistoryLimitState = initializeCampaignRuntimeTracking({
  campaign: { id: 'legacy-history-limit-demotion' },
  runtimeTracking: {
    historyLimit: 60,
    historyIndex: 59,
    history: Array.from({ length: 12 }, (_, index) => ({
      revision: index,
      snapshot: {
        campaign: { id: 'legacy-history-limit-demotion' },
        mission: { activePhaseId: `phase-${index}` }
      }
    }))
  }
});
assert.equal(
  legacyHistoryLimitState.runtimeTracking.historyLimit,
  8,
  'Runtime tracking initialization must ignore old runtimeTracking.historyLimit and use the scale-oriented default.'
);
assert.deepEqual(
  legacyHistoryLimitState.runtimeTracking.history.map((entry) => entry.revision),
  [4, 5, 6, 7, 8, 9, 10, 11],
  'Runtime tracking initialization must bound imported old history to the active history limit.'
);
assert.equal(
  legacyHistoryLimitState.runtimeTracking.historyIndex,
  7,
  'Runtime tracking initialization must clamp old historyIndex after bounding imported history.'
);
const explicitHistoryLimitState = initializeCampaignRuntimeTracking({
  campaign: { id: 'explicit-history-limit-demotion' },
  runtimeTracking: {
    historyLimit: 60,
    historyIndex: 59,
    history: Array.from({ length: 12 }, (_, index) => ({
      revision: index,
      snapshot: { campaign: { id: 'explicit-history-limit-demotion' } }
    }))
  }
}, { historyLimit: 6 });
assert.equal(explicitHistoryLimitState.runtimeTracking.historyLimit, 6);
assert.deepEqual(explicitHistoryLimitState.runtimeTracking.history.map((entry) => entry.revision), [6, 7, 8, 9, 10, 11]);

let state = initializeCampaignRuntimeTracking({
  campaign: { id: 'campaign-state-gateway', status: 'active' },
  mission: { knownFacts: [] },
  ship: { damage: [], condition: 'Operational' },
  crew: { casualties: [] },
  commandLog: { entries: [] }
}, { historyLimit: 6 });
const persisted = [];
const gateway = createStateDeltaGateway({
  getState: () => state,
  setState: (next) => { state = next; },
  persist: async (next, delta) => persisted.push({ revision: next.runtimeTracking.revision, delta }),
  now: (() => {
    let index = 0;
    return () => `2026-06-22T00:00:0${index++}.000Z`;
  })()
});

assert.throws(
  () => recordTurnIngress(state, {
    id: 'ingress:missing-core-rejected',
    hostMessageId: 'message-missing-core',
    textHash: 'missing-core',
    textPreview: 'No CORE evidence.'
  }),
  (error) => error.code === 'DIRECTIVE_CORE_PROJECTION_REQUIRED_FOR_OLD_LEDGER_WRITE',
  'state-delta gateway must reject new missing-CORE old ingress writes'
);
assert.throws(
  () => recordTurnIngress(state, {
    id: 'ingress:missing-core-quarantine-rejected',
    hostMessageId: 'message-missing-core-quarantine',
    textHash: 'missing-core-quarantine',
    textPreview: 'No CORE evidence, even with old quarantine mode.'
  }, {
    missingCoreWriteMode: 'quarantine'
  }),
  (error) => error.code === 'DIRECTIVE_CORE_PROJECTION_REQUIRED_FOR_OLD_LEDGER_WRITE',
  'state-delta gateway must reject missing-CORE old ingress writes even when old quarantine mode is requested'
);
assert.throws(
  () => recordTurnIngress(state, {
    id: 'ingress:forged-authority',
    hostMessageId: 'message-forged-authority',
    textHash: 'forged-authority',
    textPreview: 'Authority string alone is not CORE evidence.',
    authority: 'compatibilityProjection',
    projectionSource: 'coreStoreV2'
  }),
  (error) => error.code === 'DIRECTIVE_CORE_PROJECTION_REQUIRED_FOR_OLD_LEDGER_WRITE',
  'state-delta gateway must reject forged ingress compatibility authority without CORE evidence'
);
assert.throws(
  () => recordDirectiveResponse(state, {
    id: 'response:forged-authority',
    hostMessageId: 'assistant-forged-authority',
    status: 'posted',
    authority: 'compatibilityProjection',
    projectionSource: 'coreStoreV2'
  }),
  (error) => error.code === 'DIRECTIVE_CORE_PROJECTION_REQUIRED_FOR_OLD_LEDGER_WRITE',
  'state-delta gateway must reject forged response compatibility authority without CORE evidence'
);

state = recordTurnIngress(state, {
  id: 'ingress:one',
  hostMessageId: 'message-1',
  chatId: 'chat-1',
  campaignId: 'campaign-state-gateway',
  textHash: 'abc123',
  textPreview: 'Preserve telemetry.',
  coreTransactionId: 'txn:ingress:one'
});
assert.equal(state.runtimeTracking.ingressLedger[0].authority, 'coreIngressProjection');
assert.equal(state.runtimeTracking.ingressLedger[0].projectionSource, 'coreStoreV2');
assert.equal(state.runtimeTracking.ingressLedger[0].compatibilityMirror.kind, 'directive.coreIngressCompatibilityMirror.v1');
assert.equal(state.runtimeTracking.ingressLedger[0].compatibilityMirror.status, 'sourceObserved');
state = updateTurnIngress(state, 'ingress:one', {
  status: 'invalidated',
  invalidatedAt: '2026-06-22T00:00:00.500Z',
  invalidationType: 'playerMessageDeleted',
  replacementText: null
});
state = recordTurnIngress(state, {
  id: 'ingress:one',
  hostMessageId: 'message-1',
  chatId: 'chat-1',
  campaignId: 'campaign-state-gateway',
  textHash: 'abc123',
  textPreview: 'Preserve telemetry.',
  status: 'classifying',
  coreTransactionId: 'txn:ingress:one'
});
assert.equal(state.runtimeTracking.ingressLedger[0].status, 'classifying');
assert.equal(state.runtimeTracking.ingressLedger[0].invalidationType, null);
assert.equal(state.runtimeTracking.ingressLedger[0].invalidatedAt, null);
state = updateTurnIngress(state, 'ingress:one', {
  authority: 'compatibilityProjection',
  projectionSource: 'coreStoreV2',
  coreRecovery: { transactionId: 'txn:ingress:one', recoveryCaseId: 'recovery:ingress:one' },
  coreProjection: {
    kind: 'directive.coreIngressMutationProjectionRef.v1',
    transactionId: 'txn:ingress:one',
    ingressId: 'ingress:one',
    eventType: 'playerMessageEdited'
  },
  compatibilityMirror: {
    kind: 'directive.coreIngressCompatibilityMirror.v1',
    status: 'projected'
  }
});
state = recordTurnIngress(state, {
  id: 'ingress:one',
  hostMessageId: 'message-1',
  chatId: 'chat-1',
  campaignId: 'campaign-state-gateway',
  textHash: 'abc123',
  textPreview: 'Preserve telemetry.',
  status: 'classifying-again'
});
assert.equal(state.runtimeTracking.ingressLedger[0].status, 'classifying-again');
assert.equal(state.runtimeTracking.ingressLedger[0].authority, 'compatibilityProjection');
assert.equal(state.runtimeTracking.ingressLedger[0].projectionSource, 'coreStoreV2');
assert.equal(state.runtimeTracking.ingressLedger[0].coreRecovery.transactionId, 'txn:ingress:one');
assert.equal(state.runtimeTracking.ingressLedger[0].coreProjection.kind, 'directive.coreIngressMutationProjectionRef.v1');
assert.equal(state.runtimeTracking.ingressLedger[0].compatibilityMirror.kind, 'directive.coreIngressCompatibilityMirror.v1');

let recoveryResolutionState = initializeCampaignRuntimeTracking({
  runtimeTracking: {
    recoveryJournal: [
      {
        id: 'core-recovery-projection-row',
        status: 'recoveryRequired',
        authority: 'compatibilityProjection',
        projectionSource: 'coreStoreV2',
        coreProjection: {
          kind: 'directive.coreRecoveryProjectionRef.v1',
          transactionId: 'txn:core-recovery-projection-row'
        }
      },
      {
        id: 'legacy-recovery-row',
        status: 'recoveryRequired'
      }
    ]
  }
});
assert.equal(
  recoveryResolutionState.runtimeTracking.recoveryJournal.some((entry) => entry.id === 'legacy-recovery-row'),
  false,
  'Runtime tracking initialization must drop untagged legacy recovery rows.'
);
recoveryResolutionState = resolveRecoveryEvent(recoveryResolutionState, 'core-recovery-projection-row', {
  status: 'resolved',
  reason: 'core-owned-resolution'
});
recoveryResolutionState = resolveRecoveryEvent(recoveryResolutionState, 'legacy-recovery-row', {
  status: 'resolved',
  reason: 'legacy-fallback-resolution'
});
assert.equal(
  recoveryResolutionState.runtimeTracking.recoveryJournal.find((entry) => entry.id === 'core-recovery-projection-row').status,
  'recoveryRequired',
  'CORE-owned recovery projection rows must not be mutated by old recovery resolver.'
);
assert.equal(
  recoveryResolutionState.runtimeTracking.recoveryJournal.find((entry) => entry.id === 'legacy-recovery-row'),
  undefined,
  'Legacy recovery rows must not reappear after old resolver calls.'
);

const first = await gateway.applyOperations({
  id: 'proposal-1',
  workerId: 'ship',
  baseRevision: 0,
  operations: [
    { op: 'append', path: 'ship.damage', value: { id: 'sensor-pallet', summary: 'Sensor pallet degraded.' } },
    { op: 'set', path: 'ship.condition', value: 'Degraded but operational' }
  ],
  summary: 'Record visible sensor damage.'
}, { allowedRoots: ['ship'] });
assert.equal(first.applied, true);
assert.equal(first.revision, 1);
assert.equal(state.ship.damage.length, 1);
assert.equal(state.runtimeTracking.ingressLedger[0].id, 'ingress:one');
assert.equal(state.runtimeTracking.history.length, 1);
assert.equal(state.runtimeTracking.history[0].snapshot.ship.damage.length, 0);

const second = await gateway.applyOperations({
  id: 'proposal-2',
  workerId: 'continuity',
  baseRevision: 1,
  operations: [
    { op: 'append', path: 'mission.knownFacts', value: 'The port sensor pallet is degraded.' }
  ],
  summary: 'Expose the confirmed system condition.'
}, { allowedRoots: ['mission'] });
assert.equal(second.revision, 2);
assert.equal(state.mission.knownFacts.length, 1);
assert.equal(persisted.length, 2);

const validatedOnly = await gateway.validateOperations({
  id: 'proposal-validate-only',
  workerId: 'ship',
  baseRevision: 2,
  operations: [
    { op: 'set', path: 'ship.condition', value: 'Validated but not yet applied' }
  ],
  summary: 'Validate ship condition projection without mutating runtime state.'
}, { allowedRoots: ['ship'] });
assert.equal(validatedOnly.applied, true);
assert.equal(validatedOnly.revision, 3);
assert.equal(validatedOnly.persisted, false);
assert.equal(validatedOnly.mutated, false);
assert.equal(validatedOnly.campaignState.ship.condition, 'Validated but not yet applied');
assert.equal(state.ship.condition, 'Degraded but operational', 'validateOperations must not mutate live gateway state.');
assert.equal(state.runtimeTracking.revision, 2, 'validateOperations must not advance live runtime revision.');
assert.equal(persisted.length, 2, 'validateOperations must not persist compatibility projection.');

assert.throws(
  () => recordModelCallEvent(state, {
    id: 'model-call.fixture.utility.blocked',
    roleId: 'utilityTurnClassifier',
    providerKind: 'utility',
    status: 'ok',
    requestHash: 'blocked-request-hash'
  }),
  (error) => error.code === 'DIRECTIVE_CORE_PROJECTION_REQUIRED_FOR_OLD_LEDGER_WRITE',
  'direct model-call old-ledger writes must reject unless explicitly marked legacy telemetry'
);

state = recordModelCallEvent(state, {
  id: 'model-call.fixture.utility',
  roleId: 'utilityTurnClassifier',
  providerKind: 'utility',
  status: 'ok',
  providerId: 'fixture-provider',
  requestHash: 'abc12345',
  latencyMs: 12,
  prompt: 'RAW_MODEL_CALL_PROMPT_SHOULD_NOT_SURVIVE',
  response: 'RAW_MODEL_CALL_RESPONSE_SHOULD_NOT_SURVIVE',
  metadata: {
    prompt: 'RAW_MODEL_CALL_METADATA_PROMPT_SHOULD_NOT_SURVIVE',
    providerPayload: { body: 'RAW_MODEL_CALL_METADATA_BODY_SHOULD_NOT_SURVIVE' }
  }
}, {
  allowLegacyModelCallTelemetry: true
});
assert.equal(state.runtimeTracking.modelCallJournal.length, 1);
assert.equal(state.runtimeTracking.modelCallJournal[0].roleId, 'utilityTurnClassifier');
assert.equal(state.runtimeTracking.modelCallJournal[0].requestHash, 'abc12345');
assert.equal(state.runtimeTracking.modelCallJournal[0].metadata, undefined, 'old model-call fallback must not persist arbitrary metadata');
assert.equal(
  JSON.stringify(state.runtimeTracking.modelCallJournal).includes('RAW_MODEL_CALL_'),
  false,
  'old model-call fallback must not persist raw prompt/response/metadata canaries'
);

assert.throws(
  () => recordLifecycleEvent(state, {
    id: 'lifecycle:missing-authority',
    type: 'chatRebind',
    status: 'applied'
  }),
  (error) => error.code === 'DIRECTIVE_LIFECYCLE_AUTHORITY_REQUIRED',
  'lifecycle old-ledger writes must reject without runtime or REPAIR authority'
);

state = recordLifecycleEvent(state, {
  id: 'lifecycle:runtime-authorized',
  type: 'campaignDifficultyChange',
  status: 'applied',
  authority: 'runtimeLifecycleProjection',
  projectionSource: 'runtimeApp',
  coreProjection: {
    kind: 'directive.runtimeLifecycleProjectionRef.v1',
    lifecycleType: 'campaignDifficultyChange',
    campaignId: 'campaign-state-gateway',
    status: 'applied'
  }
});
const lifecycleEntry = state.runtimeTracking.lifecycleJournal.find((entry) => entry.id === 'lifecycle:runtime-authorized');
assert.equal(lifecycleEntry.authority, 'runtimeLifecycleProjection');
assert.equal(lifecycleEntry.projectionSource, 'runtimeApp');
assert.equal(lifecycleEntry.compatibilityMirror.kind, 'directive.lifecycleCompatibilityMirror.v1');
assert.equal(lifecycleEntry.coreProjection.kind, 'directive.runtimeLifecycleProjectionRef.v1');

assert.throws(
  () => recordPendingInteraction(state, {
    id: 'interaction:missing-authority',
    kind: 'clarificationNeeded',
    ingressId: 'ingress:one',
    prompt: 'Clarify intent.'
  }),
  (error) => error.code === 'DIRECTIVE_PENDING_INTERACTION_AUTHORITY_REQUIRED',
  'pending interaction old-ledger writes must reject without CORE, terminal, or REPAIR authority'
);

state = recordPendingInteraction(state, {
  id: 'interaction:core-authorized',
  kind: 'clarificationNeeded',
  ingressId: 'ingress:one',
  prompt: 'Clarify intent.',
  authority: 'corePendingInteractionProjection',
  projectionSource: 'coreStoreV2',
  coreTransactionId: 'txn:pending:core',
  coreProjection: {
    kind: 'directive.corePendingInteractionProjectionRef.v1',
    interactionId: 'interaction:core-authorized',
    ingressId: 'ingress:one',
    transactionId: 'txn:pending:core',
    status: 'pending'
  }
});
let pendingInteraction = state.runtimeTracking.pendingInteractions.find((entry) => entry.id === 'interaction:core-authorized');
assert.equal(pendingInteraction.authority, 'corePendingInteractionProjection');
assert.equal(pendingInteraction.projectionSource, 'coreStoreV2');
assert.equal(pendingInteraction.compatibilityMirror.transactionId, 'txn:pending:core');
state = resolvePendingInteraction(state, 'interaction:core-authorized', {
  status: 'resolved',
  action: 'accept',
  resolvedAt: '2026-06-28T17:00:00.000Z'
});
pendingInteraction = state.runtimeTracking.pendingInteractions.find((entry) => entry.id === 'interaction:core-authorized');
assert.equal(pendingInteraction.status, 'resolved');
assert.equal(pendingInteraction.authority, 'corePendingInteractionProjection');

state = recordPendingInteraction(state, {
  id: 'interaction:terminal-authorized',
  kind: 'terminalOutcomeDecision',
  ingressId: 'ingress:terminal',
  turnId: 'turn:terminal',
  outcomeId: 'outcome:terminal',
  prompt: 'Directive Checkpoint',
  authority: 'terminalDecisionProjection',
  projectionSource: 'terminalOutcomeDecision',
  coreProjection: {
    kind: 'directive.terminalPendingInteractionProjectionRef.v1',
    decisionId: 'interaction:terminal-authorized',
    conditionId: 'terminal.condition',
    turnId: 'turn:terminal',
    outcomeId: 'outcome:terminal',
    status: 'pending'
  }
});
pendingInteraction = state.runtimeTracking.pendingInteractions.find((entry) => entry.id === 'interaction:terminal-authorized');
assert.equal(pendingInteraction.authority, 'terminalDecisionProjection');
assert.equal(pendingInteraction.projectionSource, 'terminalOutcomeDecision');

await assert.rejects(
  gateway.applyOperations({
    baseRevision: 1,
    operations: [{ op: 'set', path: 'ship.condition', value: 'Destroyed' }]
  }, { allowedRoots: ['ship'] }),
  (error) => error.code === 'DIRECTIVE_STATE_REVISION_CONFLICT'
);

await assert.rejects(
  gateway.applyOperations({
    baseRevision: 2,
    operations: [{ op: 'set', path: 'relationships.seniorCrew', value: [] }]
  }, { allowedRoots: ['ship'] }),
  (error) => error.code === 'DIRECTIVE_STATE_ROOT_FORBIDDEN'
);

await assert.rejects(
  gateway.applyOperations({
    baseRevision: 2,
    operations: [{ op: 'set', path: 'ship.__proto__.polluted', value: true }]
  }, { allowedRoots: ['ship'] }),
  (error) => error.code === 'DIRECTIVE_STATE_PATH_FORBIDDEN'
);

await assert.rejects(
  gateway.applyOperations({
    baseRevision: 2,
    operations: [{ op: 'merge', path: 'mission.knownFacts', value: { 0: 'Array-like model output must not turn knownFacts into an object.' } }]
  }, { allowedRoots: ['mission'] }),
  (error) => error.code === 'DIRECTIVE_STATE_ARRAY_MERGE_FORBIDDEN'
);
assert.equal(Array.isArray(state.mission.knownFacts), true);

state.threadLedger = {
  records: [{ id: 'thread.gateway.command-bearing', status: 'resolved' }]
};
const commandBearingEvidence = await gateway.applyOperations({
  id: 'proposal-command-bearing-evidence',
  workerId: 'commandBearing',
  baseRevision: 2,
  turnId: 'turn.gateway.command-bearing',
  outcomeId: 'outcome.gateway.command-bearing',
  operations: [{
    op: 'append',
    path: 'commandBearing.evidenceLedger.records',
    value: {
      id: 'bearing-evidence.gateway.resolve',
      sourceOutcomeId: 'outcome.gateway.command-bearing',
      sourceTurnId: 'turn.gateway.command-bearing',
      threadId: 'thread.gateway.command-bearing',
      primarySignal: 'resolve',
      trackSignals: ['resolve'],
      strength: 'strong',
      criteria: { agency: true, commitment: true, causality: true },
      actionSummary: 'Accepted the operational cost.',
      consequenceSummary: 'The ship preserved the boundary.',
      playerFacingSummary: 'This may support Resolve because command accepted a visible cost.',
      visible: true,
      status: 'open'
    }
  }],
  summary: 'Record validated Command Bearing evidence.'
}, { allowedRoots: ['commandBearing'] });
assert.equal(commandBearingEvidence.revision, 3);
assert.equal(state.commandBearing.evidenceLedger.records.length, 1);

await assert.rejects(
  gateway.applyOperations({
    baseRevision: 3,
    operations: [{ op: 'set', path: 'commandBearing.tracks.resolve.points', value: 99 }]
  }, { allowedRoots: ['commandBearing'] }),
  (error) => error.code === 'DIRECTIVE_COMMAND_BEARING_OPERATION_FORBIDDEN'
);

const restored = await gateway.restore(1, { reason: 'Restore before continuity update.' });
assert.equal(restored.runtimeTracking.revision, 1);
assert.equal(restored.ship.damage.length, 1);
assert.equal(restored.mission.knownFacts.length, 0);
assert.equal(restored.runtimeTracking.ingressLedger[0].id, 'ingress:one');
assert.equal(restored.runtimeTracking.modelCallJournal[0].id, 'model-call.fixture.utility');
assert.equal(restored.runtimeTracking.recoveryJournal.some((entry) => entry.type === 'restoreRevision'), false);
assert.equal(restored.runtimeTracking.lifecycleJournal.at(-1).type, 'stateRevisionRestored');
assert.equal(restored.runtimeTracking.lifecycleJournal.at(-1).details.toRevision, 1);

let genericRestoreDemotionState = initializeCampaignRuntimeTracking({
  campaign: { id: 'generic-restore-demotion' },
  mission: { activePhaseId: 'phase-before-generic-restore' },
  directiveRuntimeEvidence: {
    coreStoreReadProjections: {
      responseLedgerRevision: 77,
      ingressLedger: [{
        id: 'core-ingress-generic-restore',
        hostMessageId: 'core-player-generic-restore',
        transactionId: 'txn-generic-restore',
        status: 'classified'
      }],
      responseLedger: [{
        id: 'core-response-generic-restore',
        hostMessageId: 'core-assistant-generic-restore',
        transactionId: 'txn-generic-restore',
        responseKind: 'hostContinue',
        status: 'posted'
      }],
      recoveryJournal: [{
        id: 'core-recovery-generic-restore',
        transactionId: 'txn-generic-restore',
        status: 'resolved'
      }],
      modelCallDiagnostics: [{
        id: 'core-model-call-generic-restore',
        roleId: 'utilityTurnClassifier',
        status: 'ok',
        requestHash: 'core-model-call-hash-generic-restore'
      }]
    }
  },
  runtimeTracking: {
    ingressLedger: [
      { id: 'silent-ingress-generic-restore', hostMessageId: 'silent-player-generic-restore', status: 'classified' },
      {
        id: 'tagged-ingress-generic-restore',
        hostMessageId: 'tagged-player-generic-restore',
        status: 'classified',
        authority: 'compatibilityProjectionUnavailable',
        projectionSource: 'runtimeTrackingLegacy',
        compatibilityMirror: { kind: 'directive.coreIngressCompatibilityMirror.v1', status: 'missingCoreProjection' }
      }
    ],
    responseLedger: [
      { id: 'silent-response-generic-restore', hostMessageId: 'silent-assistant-generic-restore', responseKind: 'hostContinue', status: 'posted' },
      {
        id: 'tagged-response-generic-restore',
        hostMessageId: 'tagged-assistant-generic-restore',
        responseKind: 'hostContinue',
        status: 'posted',
        authority: 'compatibilityProjectionUnavailable',
        projectionSource: 'runtimeTrackingLegacy',
        compatibilityMirror: { kind: 'directive.coreResponseCompatibilityMirror.v1', status: 'missingCoreProjection' }
      }
    ],
    responseLedgerRevision: 999,
    recoveryJournal: [{ id: 'silent-recovery-generic-restore', status: 'reviewRequired' }],
    modelCallJournal: [{
      id: 'silent-model-call-generic-restore',
      roleId: 'legacyReviewer',
      status: 'ok',
      prompt: 'SILENT_OLD_GENERIC_RESTORE_MODEL_CALL_PROMPT_SHOULD_NOT_SURVIVE'
    }],
    pendingInteractions: [{
      id: 'silent-pending-generic-restore',
      kind: 'terminalOutcomeDecision',
      status: 'pending'
    }, {
      id: 'terminal-pending-generic-restore',
      kind: 'terminalOutcomeDecision',
      status: 'pending',
      authority: 'terminalDecisionProjection',
      projectionSource: 'terminalOutcomeDecision',
      compatibilityMirror: {
        kind: 'directive.pendingInteractionCompatibilityMirror.v1',
        status: 'terminalDecisionProjection',
        interactionId: 'terminal-pending-generic-restore',
        checkpointId: 'checkpoint-generic-restore'
      }
    }],
    endConditionLedger: {
      schemaVersion: 1,
      activeDecisionId: 'terminal-decision-generic-restore',
      detections: [{
        id: 'terminal-detection-generic-restore',
        authority: 'terminalDecisionProjection',
        coreProjection: {
          kind: 'directive.terminalEndConditionLedgerProjectionRef.v1',
          rowKind: 'detection',
          status: 'pending'
        }
      }, {
        id: 'silent-terminal-detection-generic-restore',
        status: 'pending'
      }],
      decisions: [{
        id: 'terminal-decision-generic-restore',
        status: 'pending',
        authority: 'terminalDecisionProjection',
        coreProjection: {
          kind: 'directive.terminalEndConditionLedgerProjectionRef.v1',
          rowKind: 'decision',
          status: 'pending'
        }
      }, {
        id: 'silent-terminal-decision-generic-restore',
        status: 'pending'
      }],
      branchRecords: [{
        id: 'terminal-branch-generic-restore',
        decisionId: 'terminal-decision-generic-restore',
        authority: 'terminalDecisionProjection',
        coreProjection: {
          kind: 'directive.terminalEndConditionLedgerProjectionRef.v1',
          rowKind: 'branchRecord',
          status: 'saved'
        }
      }, {
        id: 'silent-terminal-branch-generic-restore',
        decisionId: 'terminal-decision-generic-restore'
      }],
      continuationFrames: []
    }
  }
});
const genericRestoreNext = cloneJson(genericRestoreDemotionState);
genericRestoreNext.mission.activePhaseId = 'phase-after-generic-restore';
genericRestoreDemotionState = commitTrackedCampaignState({
  campaignState: genericRestoreDemotionState,
  nextCampaignState: genericRestoreNext,
  delta: {
    source: 'test',
    reason: 'Generic restore demotion fixture.',
    domains: ['mission'],
    stable: true
  }
});
assert.deepEqual(
  genericRestoreDemotionState.runtimeTracking.ingressLedger.map((entry) => entry.id),
  [],
  'state commit must not mirror CORE ingress projection rows back into old runtimeTracking ledgers'
);
assert.deepEqual(
  genericRestoreDemotionState.runtimeTracking.responseLedger.map((entry) => entry.id),
  [],
  'state commit must not mirror CORE response projection rows back into old runtimeTracking ledgers'
);
assert.deepEqual(
  genericRestoreDemotionState.runtimeTracking.recoveryJournal.map((entry) => entry.id),
  [],
  'state commit must not mirror CORE recovery projection rows back into old runtimeTracking ledgers'
);
assert.deepEqual(
  genericRestoreDemotionState.runtimeTracking.modelCallJournal.map((entry) => entry.id),
  [],
  'state commit must keep CORE model-call diagnostics out of old runtimeTracking.modelCallJournal'
);
assert.equal(
  genericRestoreDemotionState.runtimeTracking.responseLedgerRevision,
  77,
  'state commit must preserve CORE response revision instead of stale old responseLedgerRevision'
);
assert.equal(
  JSON.stringify(genericRestoreDemotionState.runtimeTracking.modelCallJournal).includes('SILENT_OLD_GENERIC_RESTORE_MODEL_CALL_PROMPT_SHOULD_NOT_SURVIVE'),
  false,
  'state commit must not carry raw old model-call prompt text'
);
assert.deepEqual(
  readRuntimeCoreProjections(genericRestoreDemotionState).modelCallDiagnostics.map((entry) => entry.id),
  ['core-model-call-generic-restore'],
  'state commit must preserve compact CORE model-call diagnostics under CORE projections'
);
assert.deepEqual(
  createRuntimeLedgerView(genericRestoreDemotionState, { runtimeOverlay: true }).ingressLedger.map((entry) => entry.id),
  ['core-ingress-generic-restore'],
  'runtime ledger view must still expose CORE ingress rows after old-ledger mirror demotion'
);
assert.deepEqual(
  createRuntimeLedgerView(genericRestoreDemotionState, { runtimeOverlay: true }).responseLedger.map((entry) => entry.id),
  ['core-response-generic-restore'],
  'runtime ledger view must still expose CORE response rows after old-ledger mirror demotion'
);
assert.deepEqual(
  createRuntimeLedgerView(genericRestoreDemotionState, { runtimeOverlay: true }).recoveryJournal.map((entry) => entry.id),
  ['core-recovery-generic-restore'],
  'runtime ledger view must still expose CORE recovery rows after old-ledger mirror demotion'
);

let hotOverlayCommitState = initializeCampaignRuntimeTracking({
  campaign: { id: 'hot-overlay-commit' },
  mission: { activePhaseId: 'phase-before-hot-overlay' },
  directiveRuntimeEvidence: {
    coreStoreReadProjections: {
      runtimeAuthority: 'coreStoreV2',
      ingressLedger: [{
        id: 'core-ingress-hot-overlay',
        hostMessageId: 'core-player-hot-overlay',
        transactionId: 'txn-core-hot-overlay',
        status: 'complete'
      }],
      responseLedger: [{
        id: 'core-response-hot-overlay',
        hostMessageId: 'core-assistant-hot-overlay',
        transactionId: 'txn-core-hot-overlay',
        responseKind: 'hostContinue',
        status: 'posted'
      }]
    }
  },
  runtimeTracking: {
    ingressLedger: [{
      id: 'hot-ingress-overlay',
      hostMessageId: 'hot-player-overlay',
      coreTransactionId: 'txn-hot-overlay',
      status: 'classified',
      authority: 'coreIngressProjection',
      projectionSource: 'coreStoreV2',
      compatibilityMirror: { kind: 'directive.coreIngressCompatibilityMirror.v1', status: 'sourceObserved' }
    }, {
      id: 'missing-core-ingress-overlay',
      hostMessageId: 'missing-core-player-overlay',
      status: 'classified',
      authority: 'compatibilityProjectionUnavailable',
      projectionSource: 'runtimeBridgeV2',
      compatibilityMirror: { kind: 'directive.coreIngressCompatibilityMirror.v1', status: 'runtimeBridgeProjection' }
    }],
    responseLedger: [{
      id: 'hot-response-overlay',
      hostMessageId: 'hot-assistant-overlay',
      coreTransactionId: 'txn-hot-overlay',
      responseKind: 'hostContinue',
      status: 'posted',
      authority: 'compatibilityProjection',
      projectionSource: 'coreStoreV2',
      compatibilityMirror: { kind: 'directive.coreResponseCompatibilityMirror.v1', status: 'coreResponseProjection' }
    }],
    responseLedgerRevision: 66,
    recoveryJournal: []
  }
});
const hotOverlayNext = cloneJson(hotOverlayCommitState);
hotOverlayNext.mission.activePhaseId = 'phase-after-hot-overlay';
hotOverlayCommitState = commitTrackedCampaignState({
  campaignState: hotOverlayCommitState,
  nextCampaignState: hotOverlayNext,
  delta: {
    source: 'test',
    reason: 'Hot runtime overlay carry-forward fixture.',
    domains: ['mission'],
    stable: true
  }
});
assert.deepEqual(
  hotOverlayCommitState.runtimeTracking.ingressLedger.map((entry) => entry.id),
  ['hot-ingress-overlay'],
  'state commit must preserve only hot CORE-tagged ingress overlay rows in old runtimeTracking ledgers'
);
assert.deepEqual(
  hotOverlayCommitState.runtimeTracking.responseLedger.map((entry) => entry.id),
  ['hot-response-overlay'],
  'state commit must preserve only hot CORE-tagged response overlay rows in old runtimeTracking ledgers'
);
assert.equal(
  hotOverlayCommitState.runtimeTracking.responseLedgerRevision,
  0,
  'state commit must not carry old responseLedgerRevision when no CORE revision exists'
);
assert.equal(
  hotOverlayCommitState.runtimeTracking.ingressLedger.some((entry) => entry.id === 'missing-core-ingress-overlay'),
  false,
  'state commit hot overlay must still drop missing-CORE runtimeBridge rows'
);
assert.deepEqual(
  createRuntimeLedgerView(hotOverlayCommitState, { runtimeOverlay: true }).ingressLedger.map((entry) => entry.id),
  ['core-ingress-hot-overlay', 'hot-ingress-overlay'],
  'runtime ledger view must expose CORE ingress plus hot overlay rows after state commit'
);
assert.deepEqual(
  createRuntimeLedgerView(hotOverlayCommitState, { runtimeOverlay: true }).responseLedger.map((entry) => entry.id),
  ['core-response-hot-overlay', 'hot-response-overlay'],
  'runtime ledger view must expose CORE response plus hot overlay rows after state commit'
);
assert.equal(
  Object.prototype.hasOwnProperty.call(hotOverlayCommitState.runtimeTracking.history[0], 'snapshot'),
  false,
  'CORE-authoritative hot-overlay commit must not keep old snapshot restore authority.'
);
assert.equal(
  hotOverlayCommitState.runtimeTracking.history[0].snapshotRef.kind,
  'directive.coreRuntimeHistorySnapshotRef.v1',
  'CORE-authoritative hot-overlay commit must keep only a compact history ref.'
);
assert.throws(
  () => restoreTrackedCampaignRevision(hotOverlayCommitState, 0, {
    reason: 'Restore hot overlay fixture.'
  }),
  /No tracked snapshot exists for revision 0\./,
  'generic old-snapshot restore must fail closed for CORE-authoritative history refs'
);
const genericRestoreDemoted = restoreTrackedCampaignRevision(genericRestoreDemotionState, 0, {
  reason: 'Restore generic demotion fixture.'
});
assert.equal(genericRestoreDemoted.mission.activePhaseId, 'phase-before-generic-restore');
assert.deepEqual(
  genericRestoreDemoted.runtimeTracking.ingressLedger.map((entry) => entry.id),
  [],
  'generic restore must not mirror CORE ingress projection rows back into old runtimeTracking ledgers'
);
assert.deepEqual(
  genericRestoreDemoted.runtimeTracking.responseLedger.map((entry) => entry.id),
  [],
  'generic restore must not mirror CORE response projection rows back into old runtimeTracking ledgers'
);
assert.deepEqual(
  genericRestoreDemoted.runtimeTracking.recoveryJournal.map((entry) => entry.id),
  [],
  'generic restore must not mirror CORE recovery projection rows back into old runtimeTracking ledgers'
);
assert.deepEqual(
  genericRestoreDemoted.runtimeTracking.modelCallJournal.map((entry) => entry.id),
  [],
  'generic restore must keep CORE model-call diagnostics out of old runtimeTracking.modelCallJournal'
);
assert.equal(
  genericRestoreDemoted.runtimeTracking.responseLedgerRevision,
  77,
  'generic restore must preserve CORE response revision instead of stale old responseLedgerRevision'
);
assert.equal(
  JSON.stringify(genericRestoreDemoted.runtimeTracking.modelCallJournal).includes('SILENT_OLD_GENERIC_RESTORE_MODEL_CALL_PROMPT_SHOULD_NOT_SURVIVE'),
  false,
  'generic restore must not carry raw old model-call prompt text'
);
assert.deepEqual(
  readRuntimeCoreProjections(genericRestoreDemoted).modelCallDiagnostics.map((entry) => entry.id),
  ['core-model-call-generic-restore'],
  'generic restore must preserve compact CORE model-call diagnostics under CORE projections'
);
assert.deepEqual(
  genericRestoreDemoted.runtimeTracking.pendingInteractions.map((entry) => entry.id),
  ['terminal-pending-generic-restore'],
  'generic restore must preserve only owner-tagged pending interactions.'
);
assert.deepEqual(
  terminalDecisionLedgerView(genericRestoreDemoted).detections.map((entry) => entry.id),
  ['terminal-detection-generic-restore'],
  'generic restore must preserve only terminal projection detection rows.'
);
assert.deepEqual(
  terminalDecisionLedgerView(genericRestoreDemoted).decisions.map((entry) => entry.id),
  ['terminal-decision-generic-restore'],
  'generic restore must drop unowned terminal decision rows.'
);
assert.deepEqual(
  terminalDecisionLedgerView(genericRestoreDemoted).branchRecords.map((entry) => entry.id),
  ['terminal-branch-generic-restore'],
  'generic restore must drop unowned terminal branch rows.'
);
assert.equal(
  JSON.stringify(genericRestoreDemoted.runtimeTracking).includes('silent-terminal-')
    || JSON.stringify(genericRestoreDemoted.runtimeTracking).includes('silent-pending-generic-restore'),
  false,
  'generic restore must not carry raw unowned pending or terminal ledger rows.'
);
assert.deepEqual(
  createRuntimeLedgerView(genericRestoreDemoted, { runtimeOverlay: true }).ingressLedger.map((entry) => entry.id),
  ['core-ingress-generic-restore'],
  'runtime ledger view must still expose CORE ingress rows after generic restore old-ledger demotion'
);
assert.deepEqual(
  createRuntimeLedgerView(genericRestoreDemoted, { runtimeOverlay: true }).responseLedger.map((entry) => entry.id),
  ['core-response-generic-restore'],
  'runtime ledger view must still expose CORE response rows after generic restore old-ledger demotion'
);
assert.deepEqual(
  createRuntimeLedgerView(genericRestoreDemoted, { runtimeOverlay: true }).recoveryJournal.map((entry) => entry.id),
  ['core-recovery-generic-restore'],
  'runtime ledger view must still expose CORE recovery rows after generic restore old-ledger demotion'
);

const responseTimingState = recordDirectiveResponse(initializeCampaignRuntimeTracking({
  campaign: { id: 'response-timing' }
}), {
  id: 'response:directive-timing',
  ingressId: 'ingress:directive-timing',
  outcomeId: 'outcome:directive-timing',
  coreTransactionId: 'txn:response-directive-timing',
  coreProjection: {
    kind: 'directive.coreResponseProjectionRef.v1',
    responseId: 'response:directive-timing',
    transactionId: 'txn:response-directive-timing',
    status: 'posted'
  },
  directiveGenerationStartedAt: '2026-06-28T17:03:10.000Z',
  generationStartedAt: '2026-06-28T17:03:10.000Z',
  turnLatency: {
    kind: 'directive.turnLatencyMetrics.v1',
    directiveGenerationStartedAt: 1782666190000,
    generationStartedAt: 1782666190000,
    generationStartLatencyMs: 10000,
    providerCompletionLatencyMs: 4000,
    architectureWithin60s: true
  }
});
const responseTimingEntry = responseTimingState.runtimeTracking.responseLedger.at(-1);
assert.equal(responseTimingEntry.directiveGenerationStartedAt, '2026-06-28T17:03:10.000Z');
assert.equal(responseTimingEntry.generationStartedAt, '2026-06-28T17:03:10.000Z');
assert.equal(responseTimingEntry.turnLatency.providerCompletionLatencyMs, 4000);
assert.equal(responseTimingEntry.authority, 'compatibilityProjection');
assert.equal(responseTimingEntry.projectionSource, 'coreStoreV2');
assert.equal(responseTimingEntry.compatibilityMirror.kind, 'directive.coreResponseCompatibilityMirror.v1');
assert.equal(responseTimingEntry.compatibilityMirror.status, 'coreResponseProjection');

let importedSilentLedgerState = initializeCampaignRuntimeTracking({
  campaign: { id: 'imported-silent-ledgers' },
  runtimeTracking: {
    ingressLedger: [{
      id: 'imported-ingress-silent',
      hostMessageId: 'host-imported-ingress',
      status: 'received'
    }],
    responseLedger: [{
      id: 'imported-response-silent',
      hostMessageId: 'host-imported-response',
      status: 'released'
    }],
    responseLedgerRevision: 88
  }
});
assert.throws(
  () => updateTurnIngress(importedSilentLedgerState, 'imported-ingress-silent', {
    status: 'invalidated'
  }, {
    missingCoreWriteMode: 'quarantine'
  }),
  (error) => error.code === 'DIRECTIVE_CORE_PROJECTION_REQUIRED_FOR_OLD_LEDGER_WRITE',
  'missing-CORE imported ingress rows must not be updatable through old quarantine mode'
);
importedSilentLedgerState = updateTurnIngress(importedSilentLedgerState, 'imported-ingress-silent', {
  status: 'invalidated',
  coreTransactionId: 'txn-imported-ingress',
  coreProjection: {
    kind: 'directive.coreIngressMutationProjectionRef.v1',
    ingressId: 'imported-ingress-silent',
    transactionId: 'txn-imported-ingress',
    eventType: 'playerMessageDeleted'
  }
});
let importedIngress = importedSilentLedgerState.runtimeTracking.ingressLedger.at(-1);
assert.equal(importedIngress.status, 'invalidated');
assert.equal(importedIngress.authority, 'compatibilityProjection');
assert.equal(importedIngress.projectionSource, 'coreStoreV2');
assert.equal(importedIngress.compatibilityMirror.kind, 'directive.coreIngressCompatibilityMirror.v1');
assert.equal(importedIngress.compatibilityMirror.status, 'coreIngressProjection');
assert.throws(
  () => updateDirectiveResponse(importedSilentLedgerState, 'imported-response-silent', {
    status: 'failed'
  }, {
    missingCoreWriteMode: 'quarantine'
  }),
  (error) => error.code === 'DIRECTIVE_CORE_PROJECTION_REQUIRED_FOR_OLD_LEDGER_WRITE',
  'missing-CORE imported response rows must not be updatable through old quarantine mode'
);
importedSilentLedgerState = updateDirectiveResponse(importedSilentLedgerState, 'imported-response-silent', {
  status: 'failed',
  coreProjection: {
    kind: 'directive.coreResponseProjectionRef.v1',
    responseId: 'imported-response-silent',
    transactionId: 'txn-imported-response-failed',
    status: 'failed'
  }
});
let importedResponse = importedSilentLedgerState.runtimeTracking.responseLedger.at(-1);
assert.equal(importedResponse.status, 'failed');
assert.equal(importedResponse.authority, 'compatibilityProjection');
assert.equal(importedResponse.projectionSource, 'coreStoreV2');
assert.equal(importedResponse.compatibilityMirror.kind, 'directive.coreResponseCompatibilityMirror.v1');
assert.equal(importedResponse.compatibilityMirror.status, 'coreResponseProjection');
assert.equal(
  importedSilentLedgerState.runtimeTracking.responseLedgerRevision,
  0,
  'response update must not increment or preserve old responseLedgerRevision when CORE revision is absent'
);
importedSilentLedgerState = updateDirectiveResponse(importedSilentLedgerState, 'imported-response-silent', {
  status: 'posted',
  coreProjection: {
    kind: 'directive.coreResponseProjectionRef.v1',
    responseId: 'imported-response-silent',
    transactionId: 'txn-imported-response',
    status: 'posted'
  }
});
importedResponse = importedSilentLedgerState.runtimeTracking.responseLedger.at(-1);
assert.equal(importedResponse.status, 'posted');
assert.equal(importedResponse.authority, 'compatibilityProjection');
assert.equal(importedResponse.projectionSource, 'coreStoreV2');
assert.equal(importedResponse.compatibilityMirror.status, 'coreResponseProjection');
assert.equal(importedResponse.compatibilityMirror.transactionId, 'txn-imported-response');
assert.equal(
  importedSilentLedgerState.runtimeTracking.responseLedgerRevision,
  0,
  'response update with row-level CORE projection must not synthesize a responseLedgerRevision without CORE read-projection revision'
);
let coreRevisionResponseUpdateState = initializeCampaignRuntimeTracking({
  campaign: { id: 'core-revision-response-update' },
  directiveRuntimeEvidence: {
    coreStoreReadProjections: {
      responseLedgerRevision: 22
    }
  },
  runtimeTracking: {
    responseLedger: [{
      id: 'response-core-revision-update',
      status: 'released',
      authority: 'compatibilityProjection',
      projectionSource: 'coreStoreV2',
      compatibilityMirror: { kind: 'directive.coreResponseCompatibilityMirror.v1', status: 'released' }
    }],
    responseLedgerRevision: 2200
  }
});
coreRevisionResponseUpdateState = updateDirectiveResponse(coreRevisionResponseUpdateState, 'response-core-revision-update', {
  status: 'posted'
}, {
  missingCoreWriteMode: 'reject'
});
assert.equal(
  coreRevisionResponseUpdateState.runtimeTracking.responseLedgerRevision,
  22,
  'response update must carry CORE read-projection responseLedgerRevision instead of incrementing stale old revision'
);
importedSilentLedgerState = updateDirectiveResponse(importedSilentLedgerState, 'host-imported-response', {
  status: 'host-id-update-should-not-match'
});
importedResponse = importedSilentLedgerState.runtimeTracking.responseLedger.at(-1);
assert.equal(
  importedResponse.status,
  'posted',
  'response updates must not match SillyTavern hostMessageId by default because host ids are positional'
);
importedSilentLedgerState = updateDirectiveResponse(importedSilentLedgerState, 'host-imported-response', {
  status: 'host-id-update-explicit'
}, {
  allowHostMessageIdMatch: true
});
importedResponse = importedSilentLedgerState.runtimeTracking.responseLedger.at(-1);
assert.equal(
  importedResponse.status,
  'host-id-update-explicit',
  'hostMessageId response updates require explicit opt-in'
);

let replacementProjectionState = initializeCampaignRuntimeTracking({ campaign: { id: 'replacement-projection' } });
replacementProjectionState = recordTurnIngress(replacementProjectionState, {
  id: 'ingress-core-projection',
  hostMessageId: 'core-ingress',
  coreTransactionId: 'txn-core-ingress',
  sourceFrameId: 'frame-core-ingress'
});
const coreIngressProjection = replacementProjectionState.runtimeTracking.ingressLedger.at(-1);
assert.equal(coreIngressProjection.authority, 'coreIngressProjection');
assert.equal(coreIngressProjection.projectionSource, 'coreStoreV2');
assert.equal(coreIngressProjection.compatibilityMirror.status, 'sourceObserved');
assert.equal(coreIngressProjection.compatibilityMirror.transactionId, 'txn-core-ingress');
replacementProjectionState = recordTurnIngress(replacementProjectionState, {
  id: 'ingress-replacement-projection',
  hostMessageId: 'replacement-ingress',
  coreTransactionId: 'txn-ingress-replacement-projection',
  coreProjection: {
    kind: 'directive.coreIngressMutationProjectionRef.v1',
    ingressId: 'ingress-replacement-projection',
    transactionId: 'txn-ingress-replacement-projection',
    eventType: 'playerMessageEdited'
  },
  replacementText: 'RAW_INGRESS_REPLACEMENT_TEXT_MUST_NOT_PERSIST'
});
let replacementIngress = replacementProjectionState.runtimeTracking.ingressLedger.at(-1);
assert.equal(replacementIngress.authority, 'compatibilityProjection');
assert.equal(replacementIngress.replacementText, null);
assert.equal(replacementIngress.replacementTextPresent, true);
assert.equal(replacementIngress.replacementTextHash.length, 64);
assert.equal(replacementIngress.replacementTextLength, 'RAW_INGRESS_REPLACEMENT_TEXT_MUST_NOT_PERSIST'.length);
assert.equal(JSON.stringify(replacementIngress).includes('RAW_INGRESS_REPLACEMENT_TEXT_MUST_NOT_PERSIST'), false);
replacementProjectionState = updateTurnIngress(replacementProjectionState, 'ingress-replacement-projection', {
  replacementText: 'RAW_UPDATED_INGRESS_REPLACEMENT_TEXT_MUST_NOT_PERSIST',
  coreProjection: {
    kind: 'directive.coreIngressMutationProjectionRef.v1',
    ingressId: 'ingress-replacement-projection',
    transactionId: 'txn-ingress-replacement-projection',
    eventType: 'playerMessageEditedAgain'
  }
});
replacementIngress = replacementProjectionState.runtimeTracking.ingressLedger.at(-1);
assert.equal(replacementIngress.replacementText, null);
assert.equal(replacementIngress.replacementTextHash.length, 64);
assert.equal(replacementIngress.replacementTextLength, 'RAW_UPDATED_INGRESS_REPLACEMENT_TEXT_MUST_NOT_PERSIST'.length);
assert.equal(JSON.stringify(replacementIngress).includes('RAW_UPDATED_INGRESS_REPLACEMENT_TEXT_MUST_NOT_PERSIST'), false);
replacementProjectionState = recordDirectiveResponse(replacementProjectionState, {
  id: 'response-replacement-projection',
  coreTransactionId: 'txn-response-replacement-projection',
  coreProjection: {
    kind: 'directive.coreResponseProjectionRef.v1',
    responseId: 'response-replacement-projection',
    transactionId: 'txn-response-replacement-projection',
    status: 'edited'
  },
  replacementText: 'RAW_RESPONSE_REPLACEMENT_TEXT_MUST_NOT_PERSIST'
});
let replacementResponse = replacementProjectionState.runtimeTracking.responseLedger.at(-1);
assert.equal(replacementResponse.authority, 'compatibilityProjection');
assert.equal(replacementResponse.replacementText, null);
assert.equal(replacementResponse.replacementTextPresent, true);
assert.equal(replacementResponse.replacementTextHash.length, 64);
assert.equal(replacementResponse.replacementTextLength, 'RAW_RESPONSE_REPLACEMENT_TEXT_MUST_NOT_PERSIST'.length);
assert.equal(JSON.stringify(replacementResponse).includes('RAW_RESPONSE_REPLACEMENT_TEXT_MUST_NOT_PERSIST'), false);
replacementProjectionState = updateDirectiveResponse(replacementProjectionState, 'response-replacement-projection', {
  replacementText: 'RAW_UPDATED_RESPONSE_REPLACEMENT_TEXT_MUST_NOT_PERSIST',
  coreProjection: {
    kind: 'directive.coreResponseProjectionRef.v1',
    responseId: 'response-replacement-projection',
    transactionId: 'txn-response-replacement-projection',
    status: 'editedAgain'
  }
});
replacementResponse = replacementProjectionState.runtimeTracking.responseLedger.at(-1);
assert.equal(replacementResponse.replacementText, null);
assert.equal(replacementResponse.replacementTextHash.length, 64);
assert.equal(replacementResponse.replacementTextLength, 'RAW_UPDATED_RESPONSE_REPLACEMENT_TEXT_MUST_NOT_PERSIST'.length);
assert.equal(JSON.stringify(replacementResponse).includes('RAW_UPDATED_RESPONSE_REPLACEMENT_TEXT_MUST_NOT_PERSIST'), false);

const compactSnapshot = createCampaignStateSnapshot({
  campaign: { id: 'snapshot-compact' },
  directiveRuntimeEvidence: {
    coreStoreReadProjections: {
      ingressLedger: [{ id: 'core-ingress-heavy', raw: 'CORE read projection should not enter history snapshot.' }],
      responseLedger: [{ id: 'core-response-heavy', raw: 'CORE response projection should not enter history snapshot.' }]
    }
  },
  runtimeResume: {
    kind: 'directive.runtimeResumeCursor.v1',
    responseLedgerRevision: 99
  },
  sceneReconciliation: {
    schemaVersion: 2,
    authority: 'sreSceneReconciliationProjection',
    projectionSource: 'sceneReconciliation',
    compatibilityMirror: { kind: 'directive.sceneReconciliationLedgerProjectionRef.v1' },
    markers: {
      start: { hostMessageId: 'scene-start-top-heavy', raw: 'RAW_SNAPSHOT_TOP_SCENE_MARKER_SHOULD_NOT_SURVIVE' },
      end: null
    },
    runs: [{ id: 'scene-top-run-heavy', raw: 'RAW_SNAPSHOT_TOP_SCENE_RUN_SHOULD_NOT_SURVIVE' }],
    pending: [{ id: 'scene-top-pending-heavy', raw: 'RAW_SNAPSHOT_TOP_SCENE_PENDING_SHOULD_NOT_SURVIVE' }],
    applied: [{ id: 'scene-top-applied-heavy', raw: 'RAW_SNAPSHOT_TOP_SCENE_APPLIED_SHOULD_NOT_SURVIVE' }],
    rejected: [{ id: 'scene-top-rejected-heavy', raw: 'RAW_SNAPSHOT_TOP_SCENE_REJECTED_SHOULD_NOT_SURVIVE' }],
    recalculationPreviews: [{ id: 'scene-top-preview-heavy', raw: 'RAW_SNAPSHOT_TOP_SCENE_PREVIEW_SHOULD_NOT_SURVIVE' }],
    chunkCache: [{ id: 'scene-top-chunk-heavy', raw: 'RAW_SNAPSHOT_TOP_SCENE_CHUNK_SHOULD_NOT_SURVIVE' }],
    invalidations: [{ id: 'scene-top-invalidation-heavy', raw: 'RAW_SNAPSHOT_TOP_SCENE_INVALIDATION_SHOULD_NOT_SURVIVE' }],
    lastResult: { id: 'scene-top-last-heavy', raw: 'RAW_SNAPSHOT_TOP_SCENE_LAST_RESULT_SHOULD_NOT_SURVIVE' }
  },
  turnLedger: {
    entries: [
      {
        turnId: 'turn-heavy',
        outcomeId: 'outcome-heavy',
        resultBand: 'Success',
        stateDelta: { mission: { knownFactsAdd: Array.from({ length: 20 }, (_, index) => `fact-${index}`) } },
        competencePacket: { hidden: 'not needed in history snapshots' },
        snapshotBefore: { campaign: { id: 'prior-heavy-state' } },
        narrationStatus: 'complete',
        narration: { sourceOutcomeId: 'outcome-heavy', providerId: 'fixture', generatedAt: '2026-06-22T00:00:00.000Z', text: 'Heavy narration text.' },
        narrationFailures: [{ message: 'old failure' }],
        narrationRevisions: [{ text: 'old revision' }]
      }
    ],
    lastCommittedOutcomeId: 'outcome-heavy'
  },
  runtimeTracking: {
    history: [{ snapshot: { heavy: true } }],
    ingressLedger: [{ id: 'ingress-heavy' }],
    lifecycleJournal: [{ id: 'lifecycle-heavy', details: { prompt: 'RAW_SNAPSHOT_LIFECYCLE_SHOULD_NOT_SURVIVE' } }],
    modelCallJournal: [{ id: 'model-heavy' }],
    sceneReconciliation: {
      schemaVersion: 2,
      authority: 'sreSceneReconciliationProjection',
      projectionSource: 'sceneReconciliation',
      compatibilityMirror: { kind: 'directive.sceneReconciliationLedgerProjectionRef.v1' },
      markers: {
        start: { hostMessageId: 'scene-start-heavy', raw: 'RAW_SNAPSHOT_SCENE_MARKER_SHOULD_NOT_SURVIVE' },
        end: null
      },
      runs: [{ id: 'scene-run-heavy', raw: 'RAW_SNAPSHOT_SCENE_RUN_SHOULD_NOT_SURVIVE' }],
      pending: [{ id: 'scene-pending-heavy', raw: 'RAW_SNAPSHOT_SCENE_PENDING_SHOULD_NOT_SURVIVE' }],
      applied: [{ id: 'scene-applied-heavy', raw: 'RAW_SNAPSHOT_SCENE_APPLIED_SHOULD_NOT_SURVIVE' }],
      rejected: [{ id: 'scene-rejected-heavy', raw: 'RAW_SNAPSHOT_SCENE_REJECTED_SHOULD_NOT_SURVIVE' }],
      recalculationPreviews: [{ id: 'scene-preview-heavy', raw: 'RAW_SNAPSHOT_SCENE_PREVIEW_SHOULD_NOT_SURVIVE' }],
      chunkCache: [{ id: 'scene-chunk-heavy', raw: 'RAW_SNAPSHOT_SCENE_CHUNK_SHOULD_NOT_SURVIVE' }],
      invalidations: [{ id: 'scene-invalidation-heavy', raw: 'RAW_SNAPSHOT_SCENE_INVALIDATION_SHOULD_NOT_SURVIVE' }]
    },
    sceneHandshake: {
      settled: [{
        id: 'handshake-heavy',
        authority: 'sreSceneHandshakeProjection',
        projectionSource: 'sourceSettlementLatestPair',
        compatibilityMirror: { kind: 'directive.sceneHandshakeLedgerProjectionRef.v1' },
        raw: 'RAW_SNAPSHOT_HANDSHAKE_SHOULD_NOT_SURVIVE'
      }]
    }
  }
});
assert.equal(compactSnapshot.directiveRuntimeEvidence, undefined);
assert.equal(compactSnapshot.runtimeResume, undefined);
assert.equal(compactSnapshot.turnLedger.entries[0].stateDelta, undefined);
assert.equal(compactSnapshot.turnLedger.entries[0].competencePacket, undefined);
assert.equal(compactSnapshot.turnLedger.entries[0].snapshotBefore, null);
assert.equal(compactSnapshot.turnLedger.entries[0].narration?.text, undefined);
assert.equal(compactSnapshot.turnLedger.entries[0].narrationFailureCount, 1);
assert.equal(compactSnapshot.turnLedger.entries[0].narrationRevisionCount, 1);
assert.equal(compactSnapshot.runtimeTracking.history.length, 0);
assert.equal(compactSnapshot.runtimeTracking.lifecycleJournal.length, 0);
assert.equal(compactSnapshot.runtimeTracking.modelCallJournal.length, 0);
assert.equal(compactSnapshot.runtimeTracking.sceneReconciliation.runs.length, 0);
assert.equal(compactSnapshot.runtimeTracking.sceneReconciliation.pending.length, 0);
assert.equal(compactSnapshot.runtimeTracking.sceneReconciliation.chunkCache.length, 0);
assert.equal(compactSnapshot.runtimeTracking.sceneHandshake.settled.length, 0);
assert.equal(compactSnapshot.sceneReconciliation.runs.length, 0);
assert.equal(compactSnapshot.sceneReconciliation.pending.length, 0);
assert.equal(compactSnapshot.sceneReconciliation.chunkCache.length, 0);
assert.equal(compactSnapshot.sceneReconciliation.invalidations.length, 0);
assert.equal(compactSnapshot.sceneReconciliation.markers.start.raw, undefined);
assert.equal(compactSnapshot.sceneReconciliation.lastResult.raw, undefined);
assert.equal(JSON.stringify(compactSnapshot).includes('RAW_SNAPSHOT_'), false);

let transientSnapshotState = initializeCampaignRuntimeTracking({
  campaign: { id: 'snapshot-transient-history' },
  mission: { activePhaseId: 'before-transient-history' },
  directiveRuntimeEvidence: {
    coreStoreReadProjections: {
      ingressLedger: [{ id: 'core-ingress-transient-history' }],
      responseLedger: [{ id: 'core-response-transient-history' }]
    }
  },
  runtimeResume: {
    kind: 'directive.runtimeResumeCursor.v1',
    responseLedgerRevision: 44
  }
});
const transientSnapshotNext = cloneJson(transientSnapshotState);
transientSnapshotNext.mission.activePhaseId = 'after-transient-history';
transientSnapshotState = commitTrackedCampaignState({
  campaignState: transientSnapshotState,
  nextCampaignState: transientSnapshotNext,
  delta: {
    source: 'test',
    reason: 'Transient snapshot stripping fixture.',
    domains: ['mission'],
    stable: true
  }
});
assert.equal(transientSnapshotState.runtimeTracking.history[0].snapshot.directiveRuntimeEvidence, undefined);
assert.equal(transientSnapshotState.runtimeTracking.history[0].snapshot.runtimeResume, undefined);

let coreAuthoritativeHistoryState = initializeCampaignRuntimeTracking({
  campaign: { id: 'core-authoritative-history' },
  mission: { activePhaseId: 'before-core-authoritative-history' },
  directiveRuntimeEvidence: {
    coreStoreReadProjections: {
      kind: 'directive.coreStoreReadProjections.v1',
      runtimeAuthority: 'coreStoreV2',
      ingressLedger: [{ id: 'core-ingress-history-authority' }],
      responseLedger: [{ id: 'core-response-history-authority' }]
    }
  },
  runtimeResume: {
    kind: 'directive.runtimeResumeCursor.v1',
    responseLedgerRevision: 71
  }
});
const coreAuthoritativeHistoryNext = cloneJson(coreAuthoritativeHistoryState);
coreAuthoritativeHistoryNext.mission.activePhaseId = 'after-core-authoritative-history';
coreAuthoritativeHistoryState = commitTrackedCampaignState({
  campaignState: coreAuthoritativeHistoryState,
  nextCampaignState: coreAuthoritativeHistoryNext,
  delta: {
    source: 'test',
    reason: 'CORE authoritative history fixture.',
    domains: ['mission'],
    stable: true,
    turnId: 'turn-core-authoritative-history',
    outcomeId: 'outcome-core-authoritative-history'
  }
});
assert.equal(
  Object.prototype.hasOwnProperty.call(coreAuthoritativeHistoryState.runtimeTracking.history[0], 'snapshot'),
  false,
  'CORE-authoritative commits must not store full runtimeTracking.history snapshots.'
);
assert.equal(
  coreAuthoritativeHistoryState.runtimeTracking.history[0].snapshotRef.kind,
  'directive.coreRuntimeHistorySnapshotRef.v1'
);
assert.equal(coreAuthoritativeHistoryState.runtimeTracking.history[0].snapshotRef.authority, 'coreStoreV2');
assert.equal(coreAuthoritativeHistoryState.runtimeTracking.history[0].snapshotRef.outcomeId, 'outcome-core-authoritative-history');
assert.throws(
  () => restoreTrackedCampaignRevision(coreAuthoritativeHistoryState, 0, {
    reason: 'CORE authoritative history should require checkpoint restore.'
  }),
  /No tracked snapshot exists for revision 0\./,
  'CORE-authoritative history refs must not authorize old snapshot restore.'
);

console.log('State delta gateway tests passed: revision checks, root authorization, bounded snapshots, ingress preservation, and recovery');
