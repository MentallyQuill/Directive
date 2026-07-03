import assert from 'node:assert/strict';

import {
  commitTrackedCampaignState,
  createCampaignStateSnapshot,
  createStateDeltaGateway,
  initializeCampaignRuntimeTracking,
  recordDirectiveResponse,
  recordModelCallEvent,
  recordTurnIngress,
  resolveRecoveryEvent,
  restoreTrackedCampaignRevision,
  updateDirectiveResponse,
  updateTurnIngress
} from '../../src/runtime/state-delta-gateway.mjs';
import { createRuntimeLedgerView } from '../../src/runtime/runtime-ledger-view.mjs';

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
  'state-delta gateway must reject new missing-CORE old ingress writes unless explicitly quarantined'
);

state = recordTurnIngress(state, {
  id: 'ingress:one',
  hostMessageId: 'message-1',
  chatId: 'chat-1',
  campaignId: 'campaign-state-gateway',
  textHash: 'abc123',
  textPreview: 'Preserve telemetry.'
}, {
  missingCoreWriteMode: 'quarantine'
});
assert.equal(state.runtimeTracking.ingressLedger[0].authority, 'compatibilityProjectionUnavailable');
assert.equal(state.runtimeTracking.ingressLedger[0].projectionSource, 'runtimeTrackingLegacy');
assert.equal(state.runtimeTracking.ingressLedger[0].compatibilityMirror.kind, 'directive.coreIngressCompatibilityMirror.v1');
assert.equal(state.runtimeTracking.ingressLedger[0].compatibilityMirror.status, 'missingCoreProjection');
state = updateTurnIngress(state, 'ingress:one', {
  status: 'invalidated',
  invalidatedAt: '2026-06-22T00:00:00.500Z',
  invalidationType: 'playerMessageDeleted',
  replacementText: null
}, {
  missingCoreWriteMode: 'quarantine'
});
state = recordTurnIngress(state, {
  id: 'ingress:one',
  hostMessageId: 'message-1',
  chatId: 'chat-1',
  campaignId: 'campaign-state-gateway',
  textHash: 'abc123',
  textPreview: 'Preserve telemetry.',
  status: 'classifying'
}, {
  missingCoreWriteMode: 'quarantine'
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
    }]
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
  ['core-model-call-generic-restore'],
  'state commit must preserve compact CORE model-call diagnostics instead of old modelCallJournal rows'
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
const hotOverlayRestored = restoreTrackedCampaignRevision(hotOverlayCommitState, 0, {
  reason: 'Restore hot overlay fixture.'
});
assert.equal(hotOverlayRestored.mission.activePhaseId, 'phase-before-hot-overlay');
assert.deepEqual(
  hotOverlayRestored.runtimeTracking.ingressLedger.map((entry) => entry.id),
  ['hot-ingress-overlay'],
  'generic restore must preserve only hot CORE-tagged ingress overlay rows in old runtimeTracking ledgers'
);
assert.deepEqual(
  hotOverlayRestored.runtimeTracking.responseLedger.map((entry) => entry.id),
  ['hot-response-overlay'],
  'generic restore must preserve only hot CORE-tagged response overlay rows in old runtimeTracking ledgers'
);
assert.equal(
  hotOverlayRestored.runtimeTracking.responseLedgerRevision,
  0,
  'generic restore must not carry old responseLedgerRevision when no CORE revision exists'
);
assert.equal(
  hotOverlayRestored.runtimeTracking.ingressLedger.some((entry) => entry.id === 'missing-core-ingress-overlay'),
  false,
  'generic restore hot overlay must still drop missing-CORE runtimeBridge rows'
);
assert.deepEqual(
  createRuntimeLedgerView(hotOverlayRestored, { runtimeOverlay: true }).ingressLedger.map((entry) => entry.id),
  ['core-ingress-hot-overlay', 'hot-ingress-overlay'],
  'runtime ledger view must expose CORE ingress plus hot overlay rows after generic restore'
);
assert.deepEqual(
  createRuntimeLedgerView(hotOverlayRestored, { runtimeOverlay: true }).responseLedger.map((entry) => entry.id),
  ['core-response-hot-overlay', 'hot-response-overlay'],
  'runtime ledger view must expose CORE response plus hot overlay rows after generic restore'
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
  ['core-model-call-generic-restore'],
  'generic restore must preserve compact CORE model-call diagnostics instead of old modelCallJournal rows'
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
}, {
  missingCoreWriteMode: 'quarantine'
});
const responseTimingEntry = responseTimingState.runtimeTracking.responseLedger.at(-1);
assert.equal(responseTimingEntry.directiveGenerationStartedAt, '2026-06-28T17:03:10.000Z');
assert.equal(responseTimingEntry.generationStartedAt, '2026-06-28T17:03:10.000Z');
assert.equal(responseTimingEntry.turnLatency.providerCompletionLatencyMs, 4000);
assert.equal(responseTimingEntry.authority, 'compatibilityProjectionUnavailable');
assert.equal(responseTimingEntry.projectionSource, 'runtimeTrackingLegacy');
assert.equal(responseTimingEntry.compatibilityMirror.kind, 'directive.coreResponseCompatibilityMirror.v1');
assert.equal(responseTimingEntry.compatibilityMirror.status, 'missingCoreProjection');

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
importedSilentLedgerState = updateTurnIngress(importedSilentLedgerState, 'imported-ingress-silent', {
  status: 'invalidated'
}, {
  missingCoreWriteMode: 'quarantine'
});
let importedIngress = importedSilentLedgerState.runtimeTracking.ingressLedger.at(-1);
assert.equal(importedIngress.status, 'invalidated');
assert.equal(importedIngress.authority, 'compatibilityProjectionUnavailable');
assert.equal(importedIngress.projectionSource, 'runtimeTrackingLegacy');
assert.equal(importedIngress.compatibilityMirror.kind, 'directive.coreIngressCompatibilityMirror.v1');
assert.equal(importedIngress.compatibilityMirror.status, 'missingCoreProjection');
importedSilentLedgerState = updateDirectiveResponse(importedSilentLedgerState, 'imported-response-silent', {
  status: 'failed'
}, {
  missingCoreWriteMode: 'quarantine'
});
let importedResponse = importedSilentLedgerState.runtimeTracking.responseLedger.at(-1);
assert.equal(importedResponse.status, 'failed');
assert.equal(importedResponse.authority, 'compatibilityProjectionUnavailable');
assert.equal(importedResponse.projectionSource, 'runtimeTrackingLegacy');
assert.equal(importedResponse.compatibilityMirror.kind, 'directive.coreResponseCompatibilityMirror.v1');
assert.equal(importedResponse.compatibilityMirror.status, 'missingCoreProjection');
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
  replacementText: 'RAW_INGRESS_REPLACEMENT_TEXT_MUST_NOT_PERSIST'
}, {
  missingCoreWriteMode: 'quarantine'
});
let replacementIngress = replacementProjectionState.runtimeTracking.ingressLedger.at(-1);
assert.equal(replacementIngress.authority, 'compatibilityProjectionUnavailable');
assert.equal(replacementIngress.replacementText, null);
assert.equal(replacementIngress.replacementTextPresent, true);
assert.equal(replacementIngress.replacementTextHash.length, 64);
assert.equal(replacementIngress.replacementTextLength, 'RAW_INGRESS_REPLACEMENT_TEXT_MUST_NOT_PERSIST'.length);
assert.equal(JSON.stringify(replacementIngress).includes('RAW_INGRESS_REPLACEMENT_TEXT_MUST_NOT_PERSIST'), false);
replacementProjectionState = updateTurnIngress(replacementProjectionState, 'ingress-replacement-projection', {
  replacementText: 'RAW_UPDATED_INGRESS_REPLACEMENT_TEXT_MUST_NOT_PERSIST'
}, {
  missingCoreWriteMode: 'quarantine'
});
replacementIngress = replacementProjectionState.runtimeTracking.ingressLedger.at(-1);
assert.equal(replacementIngress.replacementText, null);
assert.equal(replacementIngress.replacementTextHash.length, 64);
assert.equal(replacementIngress.replacementTextLength, 'RAW_UPDATED_INGRESS_REPLACEMENT_TEXT_MUST_NOT_PERSIST'.length);
assert.equal(JSON.stringify(replacementIngress).includes('RAW_UPDATED_INGRESS_REPLACEMENT_TEXT_MUST_NOT_PERSIST'), false);
replacementProjectionState = recordDirectiveResponse(replacementProjectionState, {
  id: 'response-replacement-projection',
  replacementText: 'RAW_RESPONSE_REPLACEMENT_TEXT_MUST_NOT_PERSIST'
}, {
  missingCoreWriteMode: 'quarantine'
});
let replacementResponse = replacementProjectionState.runtimeTracking.responseLedger.at(-1);
assert.equal(replacementResponse.replacementText, null);
assert.equal(replacementResponse.replacementTextPresent, true);
assert.equal(replacementResponse.replacementTextHash.length, 64);
assert.equal(replacementResponse.replacementTextLength, 'RAW_RESPONSE_REPLACEMENT_TEXT_MUST_NOT_PERSIST'.length);
assert.equal(JSON.stringify(replacementResponse).includes('RAW_RESPONSE_REPLACEMENT_TEXT_MUST_NOT_PERSIST'), false);
replacementProjectionState = updateDirectiveResponse(replacementProjectionState, 'response-replacement-projection', {
  replacementText: 'RAW_UPDATED_RESPONSE_REPLACEMENT_TEXT_MUST_NOT_PERSIST'
}, {
  missingCoreWriteMode: 'quarantine'
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
    modelCallJournal: [{ id: 'model-heavy' }]
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
assert.equal(compactSnapshot.runtimeTracking.modelCallJournal.length, 0);

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

console.log('State delta gateway tests passed: revision checks, root authorization, bounded snapshots, ingress preservation, and recovery');
