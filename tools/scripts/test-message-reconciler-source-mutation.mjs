import assert from 'node:assert/strict';

import { createMessageReconciler } from '../../src/runtime/message-reconciler.mjs';
import {
  initializeCampaignRuntimeTracking,
  recordDirectiveResponse
} from '../../src/runtime/state-delta-gateway.mjs';

const cloneJson = (value) => JSON.parse(JSON.stringify(value));
const now = () => '2026-07-03T01:30:00.000Z';
const projectionLedger = (name) => (
  (name === 'responseLedger' ? state.directiveRuntimeEvidence?.coreStoreReadProjections?.responses : undefined)
  || state.directiveRuntimeEvidence?.coreStoreReadProjections?.[name]
  || state.runtimeTracking?.[name]
  || []
);
const responseEntry = (id) => projectionLedger('responseLedger').find((entry) => entry.id === id);
const ingressEntry = (id) => projectionLedger('ingressLedger').find((entry) => entry.id === id);

let state = initializeCampaignRuntimeTracking({
  campaign: { id: 'campaign-source-mutation' },
  campaignChatBinding: {
    hostId: 'fake',
    chatId: 'chat-source-mutation',
    campaignId: 'campaign-source-mutation',
    saveId: 'save-source-mutation'
  }
});

state = recordDirectiveResponse(state, {
  id: 'response-core-release-only',
  hostMessageId: '59',
  status: 'posted',
  responseKind: 'clarificationNeeded',
  coreRelease: {
    transactionId: 'txn-response-core-release-only',
    phase: 'hostContinueReleased',
    route: 'clarificationNeeded'
  }
});

const recordedRecoveries = [];
const persisted = [];
const coreTurnStore = {
  async readProjections() {
    if (state.directiveRuntimeEvidence?.coreStoreReadProjections) {
      return cloneJson(state.directiveRuntimeEvidence.coreStoreReadProjections);
    }
    return cloneJson({
      ingressLedger: state.runtimeTracking?.ingressLedger || [],
      responseLedger: state.runtimeTracking?.responseLedger || [],
      recoveryJournal: state.runtimeTracking?.recoveryJournal || []
    });
  },
  async markRecoveryRequired(transactionId, payload) {
    recordedRecoveries.push({ transactionId, payload: cloneJson(payload) });
    return {
      id: payload.id,
      status: 'required',
      phase: 'recoveryRequired',
      reason: payload.reason
    };
  }
};

const reconciler = createMessageReconciler({
  getCampaignState: () => state,
  setCampaignState: (next) => { state = cloneJson(next); },
  coreTurnStore,
  persist: async (next, summary) => {
    persisted.push({ summary, state: cloneJson(next) });
    return { ok: true };
  },
  syncPrompt: async (next) => next,
  now
});

const result = await reconciler.reconcileEdited({
  hostMessageId: '59',
  replacementText: 'The bridge keeps the refusal quiet and documented.'
});

assert.equal(result.ok, true);
assert.equal(result.matched, true);
assert.equal(result.action, 'invalidated');
assert.equal(recordedRecoveries.length, 1);
assert.equal(recordedRecoveries[0].transactionId, 'txn-response-core-release-only');
assert.equal(recordedRecoveries[0].payload.reason, 'directiveResponseEdited');
assert.equal(recordedRecoveries[0].payload.repairDecision.sourceKind, 'directiveResponse');

const response = responseEntry('response-core-release-only');
assert.equal(response.status, 'invalidated');
assert.equal(response.invalidatedAt, now());
assert.equal(response.invalidationType, 'directiveResponseEdited');
assert.equal(response.editedAt, now());
assert.equal(response.replacementText, null);
assert.equal(response.replacementTextPresent, true);
assert.equal(response.replacementTextHash.length, 64);
assert.equal(response.replacementTextLength, 'The bridge keeps the refusal quiet and documented.'.length);
assert.equal(JSON.stringify(response).includes('The bridge keeps the refusal quiet and documented.'), false);
assert.equal(response.coreRecovery.status, 'recorded');
assert.equal(response.coreRecovery.recoveryCaseId, 'recovery:source-mutation:txn-response-core-release-only:directiveResponseEdited');
assert.equal(response.authority, 'compatibilityProjection');
assert.equal(response.projectionSource, 'coreStoreV2');
assert.equal(response.coreProjection.kind, 'directive.coreResponseMutationProjectionRef.v1');
assert.equal(response.coreProjection.transactionId, 'txn-response-core-release-only');
assert.equal(response.coreProjection.responseId, 'response-core-release-only');
assert.equal(response.coreProjection.eventType, 'directiveResponseEdited');
assert.equal(response.repairDecision.kind, 'directive.repairDecision.v1');
assert.equal(response.repairDecision.action, 'invalidateProjection');
assert.equal(response.repairDecision.eventType, 'directiveResponseEdited');
assert.equal(persisted.some((entry) => /directiveResponseEdited/.test(entry.summary)), true);

state = initializeCampaignRuntimeTracking({
  campaign: { id: 'campaign-source-mutation' },
  campaignChatBinding: {
    hostId: 'fake',
    chatId: 'chat-source-mutation',
    campaignId: 'campaign-source-mutation',
    saveId: 'save-source-mutation'
  },
  runtimeTracking: {
    ingressLedger: [
      {
        id: 'ingress-shifted-7',
        hostMessageId: '7',
        status: 'complete',
        coreTransactionId: 'txn-shifted-ingress-7',
        sourceFrameId: 'frame-shifted-ingress-7',
        textHash: 'shifted',
        authority: 'coreIngressProjection',
        projectionSource: 'coreStoreV2',
        compatibilityMirror: {
          kind: 'directive.coreIngressCompatibilityMirror.v1',
          status: 'sourceObserved',
          transactionId: 'txn-shifted-ingress-7',
          ingressId: 'ingress-shifted-7'
        }
      }
    ],
    responseLedger: [
      {
        id: 'response-stable-7',
        hostMessageId: '7',
        status: 'posted',
        responseKind: 'hostContinue',
        coreTransactionId: 'txn-stable-response-7',
        authority: 'compatibilityProjection',
        projectionSource: 'coreStoreV2',
        compatibilityMirror: {
          kind: 'directive.coreResponseCompatibilityMirror.v1',
          status: 'coreResponseProjection',
          transactionId: 'txn-stable-response-7',
          responseId: 'response-stable-7'
        }
      }
    ]
  },
  directiveRuntimeEvidence: {
    coreStoreReadProjections: {
      ingressLedger: [
        {
          id: 'ingress-shifted-7',
          hostMessageId: '7',
          status: 'complete',
          coreTransactionId: 'txn-shifted-ingress-7',
          sourceFrameId: 'frame-shifted-ingress-7',
          textHash: 'shifted',
          authority: 'coreIngressProjection',
          projectionSource: 'coreStoreV2',
          compatibilityMirror: {
            kind: 'directive.coreIngressCompatibilityMirror.v1',
            status: 'sourceObserved',
            transactionId: 'txn-shifted-ingress-7',
            ingressId: 'ingress-shifted-7'
          }
        }
      ],
      responseLedger: [
        {
          id: 'response-stable-7',
          hostMessageId: '7',
          status: 'posted',
          responseKind: 'hostContinue',
          coreTransactionId: 'txn-stable-response-7',
          authority: 'compatibilityProjection',
          projectionSource: 'coreStoreV2',
          compatibilityMirror: {
            kind: 'directive.coreResponseCompatibilityMirror.v1',
            status: 'coreResponseProjection',
            transactionId: 'txn-stable-response-7',
            responseId: 'response-stable-7'
          }
        }
      ],
      recoveryJournal: []
    }
  }
});
recordedRecoveries.length = 0;

const stableDelete = await reconciler.reconcileDeleted({
  hostMessageId: '7',
  responseId: 'response-stable-7'
});
assert.equal(stableDelete.ok, true);
assert.equal(stableDelete.matched, true);
assert.equal(recordedRecoveries[0].transactionId, 'txn-stable-response-7');
assert.equal(recordedRecoveries[0].payload.reason, 'directiveResponseDeleted');
assert.equal(recordedRecoveries[0].payload.repairDecision.sourceKind, 'directiveResponse');
assert.equal(responseEntry('response-stable-7').status, 'invalidated');
assert.equal(responseEntry('response-stable-7').authority, 'compatibilityProjection');
assert.equal(responseEntry('response-stable-7').coreProjection.transactionId, 'txn-stable-response-7');
assert.equal(ingressEntry('ingress-shifted-7').status, 'complete');

state = initializeCampaignRuntimeTracking({
  campaign: { id: 'campaign-source-mutation' },
  campaignChatBinding: {
    hostId: 'fake',
    chatId: 'chat-source-mutation',
    campaignId: 'campaign-source-mutation',
    saveId: 'save-source-mutation'
  },
  runtimeTracking: {
    responseLedger: [
      {
        id: 'response-host-5-stale',
        hostMessageId: '5',
        status: 'posted',
        responseKind: 'hostContinue',
        coreTransactionId: 'txn-stale-response-5'
      }
    ]
  },
  directiveRuntimeEvidence: {
    coreStoreReadProjections: {
      responseLedger: [
        {
          id: 'response-host-5-current',
          hostMessageId: '5',
          status: 'posted',
          responseKind: 'hostContinue',
          coreTransactionId: 'txn-current-response-5',
          authority: 'compatibilityProjection',
          projectionSource: 'coreStoreV2',
          compatibilityMirror: {
            kind: 'directive.coreResponseCompatibilityMirror.v1',
            status: 'coreResponseProjection',
            transactionId: 'txn-current-response-5',
            responseId: 'response-host-5-current'
          }
        }
      ],
      recoveryJournal: []
    }
  }
});
recordedRecoveries.length = 0;

const hostOnlyDelete = await reconciler.reconcileDeleted({
  hostMessageId: '5'
});
assert.equal(hostOnlyDelete.ok, true);
assert.equal(hostOnlyDelete.matched, true);
assert.equal(recordedRecoveries[0].transactionId, 'txn-current-response-5');
assert.equal(recordedRecoveries[0].payload.reason, 'directiveResponseDeleted');
assert.equal(responseEntry('response-host-5-current').status, 'invalidated');
assert.equal(responseEntry('response-host-5-current').authority, 'compatibilityProjection');
assert.equal(responseEntry('response-host-5-current').coreProjection.transactionId, 'txn-current-response-5');
assert.notEqual(
  state.runtimeTracking.responseLedger.find((entry) => entry.id === 'response-host-5-stale')?.status,
  'invalidated',
  'Old runtimeTracking rows must not be selected or invalidated when CORE projection authority exists.'
);

state = initializeCampaignRuntimeTracking({
  campaign: { id: 'campaign-source-mutation' },
  campaignChatBinding: {
    hostId: 'fake',
    chatId: 'chat-source-mutation',
    campaignId: 'campaign-source-mutation',
    saveId: 'save-source-mutation'
  },
  runtimeTracking: {
    responseLedger: [
      {
        id: 'response-silent-8',
        hostMessageId: '8',
        status: 'posted',
        responseKind: 'hostContinue',
        coreTransactionId: 'txn-silent-response-8'
      }
    ]
  },
  directiveRuntimeEvidence: {
    coreStoreReadProjections: {
      responseLedger: [
        {
          id: 'response-core-unrelated',
          hostMessageId: '99',
          transactionId: 'txn-core-unrelated',
          status: 'posted'
        }
      ],
      recoveryJournal: []
    }
  }
});
recordedRecoveries.length = 0;

const silentOldDelete = await reconciler.reconcileDeleted({
  hostMessageId: '8',
  responseId: 'response-silent-8'
});
assert.equal(silentOldDelete.ok, true);
assert.equal(silentOldDelete.matched, false);
assert.equal(silentOldDelete.action, 'ignored');
assert.equal(recordedRecoveries.length, 0);
assert.notEqual(
  responseEntry('response-silent-8')?.status,
  'invalidated',
  'Silent old response rows must not bypass runtime-ledger-view CORE projection demotion.'
);

state = initializeCampaignRuntimeTracking({
  campaign: { id: 'campaign-source-mutation' },
  campaignChatBinding: {
    hostId: 'fake',
    chatId: 'chat-source-mutation',
    campaignId: 'campaign-source-mutation',
    saveId: 'save-source-mutation'
  },
  runtimeTracking: {
    ingressLedger: [
      {
        id: 'ingress-stale-only-12',
        hostMessageId: '12',
        status: 'committed',
        coreTransactionId: 'txn-stale-only-12',
        sourceFrameId: 'frame-stale-only-12',
        authority: 'compatibilityProjection',
        projectionSource: 'coreStoreV2',
        compatibilityMirror: {
          kind: 'directive.coreIngressCompatibilityMirror.v1',
          status: 'sourceObserved',
          transactionId: 'txn-stale-only-12',
          ingressId: 'ingress-stale-only-12'
        }
      }
    ],
    responseLedger: [],
    recoveryJournal: []
  },
  directiveRuntimeEvidence: {
    coreStoreReadProjections: {
      ingressLedger: [],
      responseLedger: [],
      recoveryJournal: []
    }
  }
});
recordedRecoveries.length = 0;

const staleOnlyEdit = await reconciler.reconcileEdited({
  hostMessageId: '12',
  replacementText: 'This should not attach to an old projected row.'
});
assert.equal(staleOnlyEdit.ok, true);
assert.equal(staleOnlyEdit.matched, false);
assert.equal(staleOnlyEdit.action, 'ignored');
assert.equal(recordedRecoveries.length, 0);
assert.notEqual(
  ingressEntry('ingress-stale-only-12')?.status,
  'invalidated',
  'Stale-only old ingress rows must not become source-mutation authority when CORE projections are empty.'
);

console.log('Message reconciler source mutation tests passed.');
