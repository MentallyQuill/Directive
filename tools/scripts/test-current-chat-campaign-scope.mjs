import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createFakeDirectiveHost } from '../../src/hosts/fake/fake-host.mjs';
import {
  __directiveRuntimeAppTestHooks,
  createDirectiveRuntimeApp
} from '../../src/runtime/runtime-app.mjs';
import {
  loadCampaignSaveRecordFromStorage,
  storeCampaignSave
} from '../../src/storage/directive-storage-repository.mjs';
import { persistActiveCampaignStateV2 } from '../../src/storage/active-save-facade-v2.mjs';
import { createAutosaveCampaignSaveRecord } from '../../src/storage/save-records.mjs';

const root = process.cwd();
const readJson = (filePath) => JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));

const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const crewDataset = readJson('packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json');
const missionGraphs = [
  'packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json',
  'packages/bundled/breckenridge/chapter-1-the-empty-convoy.mission-graph.json',
  'packages/bundled/breckenridge/chapter-2-false-colors.mission-graph.json'
].map((filePath) => ({ path: filePath, graph: readJson(filePath) }));

{
  const staleScopedState = {
    campaign: { id: 'campaign.scope-freshness' },
    campaignChatBinding: {
      hostId: 'fake',
      chatId: 'scope-freshness-chat',
      campaignId: 'campaign.scope-freshness',
      saveId: 'save.scope-freshness'
    },
    commandLog: { entries: [{ id: 'old-log' }] },
    turnLedger: { entries: [{ turnId: 'old-turn' }] },
    runtimeTracking: {
      revision: 12,
      mechanicsRevision: 7,
      modelCallJournal: [{ id: 'model-call.old' }]
    }
  };
  const richerInMemoryState = {
    ...JSON.parse(JSON.stringify(staleScopedState)),
    commandLog: {
      entries: [
        { id: 'old-log' },
        { id: 'new-log' }
      ]
    },
    runtimeTracking: {
      ...staleScopedState.runtimeTracking,
      modelCallJournal: [
        { id: 'model-call.old' },
        { id: 'model-call.new' }
      ]
    }
  };
  assert.equal(
    __directiveRuntimeAppTestHooks.shouldPreferInMemoryCampaignState(staleScopedState, richerInMemoryState, {
      chatId: 'scope-freshness-chat'
    }),
    true,
    'Same-chat view should prefer richer in-memory state when revision is equal and Command Log is fresher.'
  );
  assert.equal(
    __directiveRuntimeAppTestHooks.shouldPreferInMemoryCampaignState(
      {
        ...staleScopedState,
        campaignChatBinding: {
          ...staleScopedState.campaignChatBinding,
          chatId: ''
        }
      },
      richerInMemoryState,
      { chatId: 'scope-freshness-chat' }
    ),
    true,
    'Current-chat metadata should allow a richer in-memory state to win when the loaded save lacks a chat binding.'
  );
  assert.equal(
    __directiveRuntimeAppTestHooks.shouldPreferInMemoryCampaignState(
      {
        ...staleScopedState,
        commandLog: { entries: [{ id: 'old-log' }] },
        runtimeTracking: {
          ...staleScopedState.runtimeTracking,
          revision: 13
        }
      },
      richerInMemoryState,
      { chatId: 'scope-freshness-chat' }
    ),
    true,
    'A same-chat loaded save with a higher revision must not replace richer in-memory Command Log state.'
  );
  assert.equal(
    __directiveRuntimeAppTestHooks.shouldPreferInMemoryCampaignState(
      staleScopedState,
      {
        ...staleScopedState,
        runtimeTracking: {
          ...staleScopedState.runtimeTracking,
          modelCallJournal: [
            { id: 'model-call.old' },
            { id: 'model-call.legacy-only-extra' }
          ]
        }
      },
      { chatId: 'scope-freshness-chat' }
    ),
    false,
    'Old modelCallJournal growth alone must not make an in-memory state fresher than the saved state.'
  );
  assert.equal(
    __directiveRuntimeAppTestHooks.shouldPreferInMemoryCampaignState(
      staleScopedState,
      {
        ...richerInMemoryState,
        campaignChatBinding: {
          ...richerInMemoryState.campaignChatBinding,
          saveId: 'different-save'
        }
      },
      { chatId: 'scope-freshness-chat' }
    ),
    false,
    'Freshness comparison must not cross save branches.'
  );
  assert.equal(
    __directiveRuntimeAppTestHooks.shouldPreferInMemoryCampaignState(
      {
        ...staleScopedState,
        commandLog: {
          entries: [
            { id: 'old-log' },
            { id: 'new-log' },
            { id: 'newer-log' }
          ]
        },
        turnLedger: {
          entries: [
            { turnId: 'old-turn' },
            { turnId: 'newer-turn' }
          ]
        },
        runtimeTracking: {
          ...staleScopedState.runtimeTracking,
          revision: 13
        }
      },
      richerInMemoryState,
      { chatId: 'scope-freshness-chat' }
    ),
    false,
    'A newer loaded/scoped revision must not be replaced by an older in-memory state.'
  );
  assert.equal(
    __directiveRuntimeAppTestHooks.shouldPreferInMemoryCampaignState(
      {
        ...staleScopedState,
        campaignChatBinding: {
          ...staleScopedState.campaignChatBinding,
          promptContextRevision: 22
        },
        turnLedger: { entries: [] },
        runtimeTracking: {
          ...staleScopedState.runtimeTracking,
          revision: 11,
          mechanicsRevision: 6,
          modelCallJournal: [
            { id: 'model-call.old' },
            { id: 'model-call.prompt-refresh' },
            { id: 'model-call.narration' }
          ]
        }
      },
      {
        ...richerInMemoryState,
        turnLedger: {
          entries: [
            { turnId: 'old-turn', outcomeId: 'old-outcome' },
            { turnId: 'fresh-turn', outcomeId: 'fresh-outcome' }
          ]
        },
        runtimeTracking: {
          ...richerInMemoryState.runtimeTracking,
          revision: 13,
          mechanicsRevision: 8,
          lastCommittedTurn: {
            turnId: 'fresh-turn',
            outcomeId: 'fresh-outcome',
            responseStatus: 'pending'
          }
        }
      },
      { chatId: 'scope-freshness-chat' }
    ),
    true,
    'Prompt/model-call-only stale writes must not replace a same-chat state with a committed turn ledger entry.'
  );
  const projectionAuthorityEvidence = __directiveRuntimeAppTestHooks.coreProjectionFreshnessEvidence({
    ingressLedger: [{
      id: 'core-ingress-authority',
      hostMessageId: 'core-player-authority',
      transactionId: 'txn-core-authority',
      status: 'classified'
    }],
    responseLedger: [{
      id: 'core-response-authority',
      hostMessageId: 'core-assistant-authority',
      transactionId: 'txn-core-authority',
      responseKind: 'hostContinue',
      status: 'posted'
    }],
    recoveryJournal: [],
    turnLedger: { entries: [], replacementHistory: [] }
  }, {
    runtimeTracking: {
      ingressLedger: [{ id: 'silent-old-ingress-authority', hostMessageId: 'silent-old-player-authority', status: 'old' }],
      responseLedger: [{ id: 'silent-old-response-authority', hostMessageId: 'silent-old-assistant-authority', status: 'old' }]
    }
  });
  assert.equal(
    projectionAuthorityEvidence.runtimeAuthority,
    'coreStoreV2',
    'Silent old ledger rows must not prevent CORE read projections from being marked authoritative.'
  );
  assert.equal(
    __directiveRuntimeAppTestHooks.shouldPreferInMemoryCampaignState(
      {
        ...staleScopedState,
        directiveRuntimeEvidence: {
          coreStoreReadProjections: {
            kind: 'directive.coreStoreReadProjections.v1',
            runtimeAuthority: 'coreStoreV2',
            turnLedger: {
              runtimeAuthority: 'coreStoreV2',
              entries: []
            },
            ingressLedger: [],
            responses: [],
            recoveryJournal: []
          }
        },
        runtimeTracking: {
          ...staleScopedState.runtimeTracking,
          revision: 1,
          mechanicsRevision: 1
        }
      },
      {
        ...staleScopedState,
        runtimeTracking: {
          ...staleScopedState.runtimeTracking,
          revision: 999,
          mechanicsRevision: 999
        }
      },
      { chatId: 'scope-freshness-chat' }
    ),
    false,
    'Old runtimeTracking revision/mechanics counters must not outrank a same-chat CORE/v2 authoritative state.'
  );
  const missingMirrorAuthorityEvidence = __directiveRuntimeAppTestHooks.coreProjectionFreshnessEvidence({
    ingressLedger: [{
      id: 'core-ingress-authority',
      hostMessageId: 'core-player-authority',
      transactionId: 'txn-core-authority',
      status: 'classified'
    }],
    responseLedger: [],
    recoveryJournal: [],
    turnLedger: { entries: [], replacementHistory: [] }
  }, {
    runtimeTracking: {
      ingressLedger: [{
        id: 'missing-core-ingress-authority',
        hostMessageId: 'missing-core-player-authority',
        status: 'old',
        authority: 'compatibilityProjectionUnavailable',
        projectionSource: 'runtimeTrackingLegacy',
        compatibilityMirror: { kind: 'directive.coreIngressCompatibilityMirror.v1', status: 'missingCoreProjection' }
      }]
    }
  });
  assert.equal(
    missingMirrorAuthorityEvidence.runtimeAuthority,
    'coreStoreV2',
    'Missing-CORE quarantine mirrors must not prevent CORE read projections from being marked authoritative.'
  );
  const unmatchedCompatibilityAuthorityEvidence = __directiveRuntimeAppTestHooks.coreProjectionFreshnessEvidence({
    ingressLedger: [{
      id: 'core-ingress-authority',
      hostMessageId: 'core-player-authority',
      transactionId: 'txn-core-authority',
      status: 'classified'
    }],
    responseLedger: [],
    recoveryJournal: [],
    turnLedger: { entries: [], replacementHistory: [] }
  }, {
    runtimeTracking: {
      ingressLedger: [{
        id: 'unmatched-compat-ingress-authority',
        hostMessageId: 'unmatched-compat-player-authority',
        status: 'classified',
        authority: 'compatibilityProjection',
        projectionSource: 'coreStoreV2',
        compatibilityMirror: { kind: 'directive.coreIngressCompatibilityMirror.v1', status: 'sourceObserved' }
      }]
    }
  });
  assert.equal(
    unmatchedCompatibilityAuthorityEvidence.runtimeAuthority,
    'coreStoreV2',
    'Unmatched old compatibility projection rows must not block authoritative CORE markers.'
  );
  const mergeCandidateEmpty = {
    runtimeTracking: {
      responseLedger: [],
      responseLedgerRevision: 0
    }
  };
  assert.equal(
    __directiveRuntimeAppTestHooks.stateFreshnessCounters({
      runtimeTracking: { responseLedgerRevision: 44 }
    }).responseLedgerRevision,
    0,
    'Runtime freshness counters must not treat old runtimeTracking.responseLedgerRevision as CORE freshness.'
  );
  assert.equal(
    __directiveRuntimeAppTestHooks.stateFreshnessCounters({
      directiveRuntimeEvidence: {
        coreStoreReadProjections: {
          pendingInteractions: [{
            id: 'risk-pending-freshness',
            kind: 'riskConfirmationNeeded',
            status: 'pending',
            authority: 'corePendingInteractionProjection',
            compatibilityMirror: { kind: 'directive.pendingInteractionCompatibilityMirror.v1', status: 'corePendingInteractionProjection' }
          }]
        }
      },
      runtimeTracking: {
        pendingInteractions: [{
          id: 'terminal-pending-freshness',
          kind: 'terminalOutcomeDecision',
          status: 'pending',
          authority: 'terminalDecisionProjection',
          compatibilityMirror: { kind: 'directive.pendingInteractionCompatibilityMirror.v1', status: 'terminalDecisionProjection' }
        }]
      }
    }).pendingInteractions,
    1,
    'Runtime freshness counters must count only CORE pending interaction projections.'
  );
  assert.equal(
    __directiveRuntimeAppTestHooks.stateFreshnessCounters({
      directiveRuntimeEvidence: {
        coreStoreReadProjections: {
          responseLedgerRevision: 12
        }
      },
      runtimeTracking: { responseLedgerRevision: 44 }
    }).responseLedgerRevision,
    12,
    'Runtime freshness counters must use CORE responseLedgerRevision over old runtimeTracking.'
  );
  assert.equal(
    __directiveRuntimeAppTestHooks.stateFreshnessCounters({
      runtimeTracking: {
        sidecarJournal: Array.from({ length: 6 }, (_, index) => ({ id: `old-sidecar-${index}` }))
      }
    }).sidecarJournalEntries,
    0,
    'Runtime freshness counters must not treat old sidecarJournal rows as freshness.'
  );
  assert.equal(
    __directiveRuntimeAppTestHooks.stateFreshnessCounters({
      runtimeResume: { sidecarCount: 2 },
      directiveRuntimeEvidence: {
        coreStoreReadProjections: {
          sidecarDiagnostics: [{ id: 'core-sidecar-1' }],
          backgroundBatches: [{ id: 'core-background-batch', acceptedBatchHash: 'hash', workerCount: 3 }]
        }
      },
      runtimeTracking: {
        sidecarJournal: Array.from({ length: 9 }, (_, index) => ({ id: `old-sidecar-shadow-${index}` }))
      }
    }).sidecarJournalEntries,
    3,
    'Runtime freshness counters must use CORE/background/runtimeResume sidecar evidence over old sidecarJournal rows.'
  );
  const mergeSilentMemory = {
    runtimeTracking: {
      responseLedger: [{
        id: 'silent-memory-response',
        hostMessageId: 'silent-memory-assistant',
        status: 'posted',
        outcomeIntegrity: { selectedRevisionId: 'silent-revision' }
      }],
      responseLedgerRevision: 7
    }
  };
  const silentMergeResult = __directiveRuntimeAppTestHooks.mergeFresherResponseLedgerProjection(
    mergeCandidateEmpty,
    mergeSilentMemory
  );
  assert.equal(
    silentMergeResult.runtimeTracking.responseLedger.length,
    0,
    'Fresher response merge must not copy silent old in-memory response rows.'
  );
  assert.equal(
    silentMergeResult.runtimeTracking.responseLedgerRevision,
    0,
    'Fresher response merge must not promote old in-memory responseLedgerRevision into runtimeTracking.'
  );
  const taggedMergeResult = __directiveRuntimeAppTestHooks.mergeFresherResponseLedgerProjection(
    mergeCandidateEmpty,
    {
      runtimeTracking: {
        responseLedger: [{
          id: 'tagged-memory-response',
          hostMessageId: 'tagged-memory-assistant',
          status: 'posted',
          authority: 'compatibilityProjection',
          projectionSource: 'coreStoreV2',
          compatibilityMirror: {
            kind: 'directive.coreResponseCompatibilityMirror.v1',
            source: 'coreStoreV2',
            status: 'posted'
          },
          outcomeIntegrity: { selectedRevisionId: 'tagged-revision' }
        }],
        responseLedgerRevision: 8
      }
    }
  );
  assert.equal(
    taggedMergeResult.runtimeTracking.responseLedger.length,
    0,
    'Fresher response merge must not resurrect tagged old rows into runtimeTracking without CORE projection evidence.'
  );
  assert.equal(taggedMergeResult.directiveRuntimeEvidence?.coreStoreReadProjections?.responseLedger, undefined);
  assert.equal(
    taggedMergeResult.runtimeTracking.responseLedgerRevision,
    0,
    'Fresher response merge must not promote tagged old responseLedgerRevision into runtimeTracking.'
  );
  const coreProjectionMergeResult = __directiveRuntimeAppTestHooks.mergeFresherResponseLedgerProjection(
    mergeCandidateEmpty,
    {
      directiveRuntimeEvidence: {
        coreStoreReadProjections: {
          responseLedgerRevision: 9,
          responseLedger: [{
            id: 'core-memory-response',
            responseId: 'core-memory-response',
            hostMessageId: 'core-memory-assistant',
            transactionId: 'txn-core-memory-response',
            responseKind: 'hostContinue',
            status: 'posted',
            outcomeIntegrity: { selectedRevisionId: 'core-revision' }
          }]
        }
      },
      runtimeTracking: {
        responseLedger: [{
          id: 'silent-memory-response',
          hostMessageId: 'silent-memory-assistant',
          status: 'posted',
          outcomeIntegrity: { selectedRevisionId: 'silent-revision' }
        }],
        responseLedgerRevision: 9
      }
    }
  );
  assert.equal(coreProjectionMergeResult.runtimeTracking.responseLedger.length, 0);
  assert.equal(coreProjectionMergeResult.runtimeTracking.responseLedgerRevision, 0);
  const mergedCoreProjectionRows = coreProjectionMergeResult.directiveRuntimeEvidence.coreStoreReadProjections.responses;
  assert.equal(
    coreProjectionMergeResult.directiveRuntimeEvidence.coreStoreReadProjections.responseLedgerRevision,
    9,
    'Fresher response merge must carry CORE responseLedgerRevision as projection evidence, not old runtimeTracking.'
  );
  assert.equal(mergedCoreProjectionRows.length, 1);
  assert.equal(mergedCoreProjectionRows[0].id, 'core-memory-response');
  assert.equal(mergedCoreProjectionRows[0].authority, 'compatibilityProjection');
  assert.equal(mergedCoreProjectionRows[0].projectionSource, 'coreStoreV2');
  assert.equal(mergedCoreProjectionRows[0].compatibilityMirror.kind, 'directive.coreResponseCompatibilityMirror.v1');
  assert.equal(mergedCoreProjectionRows[0].coreProjection.transactionId, 'txn-core-memory-response');
  const authorityEvidence = __directiveRuntimeAppTestHooks.coreProjectionFreshnessEvidence(
    {
      turnLedger: { entries: [] },
      ingressLedger: [{
        id: 'core-ingress-authority',
        ingressId: 'core-ingress-authority',
        hostMessageId: '1',
        transactionId: 'txn-core-authority'
      }],
      responseLedger: [{
        id: 'core-response-authority',
        responseId: 'core-response-authority',
        hostMessageId: '2',
        transactionId: 'txn-core-authority',
        responseKind: 'hostContinue'
      }]
    },
    {
      runtimeTracking: {
        ingressLedger: [{
          id: 'stale-tagged-ingress',
          hostMessageId: 'old-1',
          transactionId: 'txn-old-ingress',
          authority: 'compatibilityProjection',
          projectionSource: 'coreStoreV2',
          compatibilityMirror: { kind: 'directive.coreIngressCompatibilityMirror.v1' }
        }],
        responseLedger: [{
          id: 'stale-tagged-response',
          hostMessageId: 'old-2',
          transactionId: 'txn-old-response',
          authority: 'compatibilityProjection',
          projectionSource: 'coreStoreV2',
          compatibilityMirror: { kind: 'directive.coreResponseCompatibilityMirror.v1' }
        }]
      }
    }
  );
  assert.equal(
    authorityEvidence.runtimeAuthority,
    'coreStoreV2',
    'CORE projections must remain runtime authority even when unmatched old compatibility rows exist.'
  );
  const hostIdOnlyMergeResult = __directiveRuntimeAppTestHooks.mergeFresherResponseLedgerProjection(
    {
      directiveRuntimeEvidence: {
        coreStoreReadProjections: {
          responseLedger: [{
            id: 'candidate-response-stable-id',
            responseId: 'candidate-response-stable-id',
            hostMessageId: 'shared-host-message',
            transactionId: 'txn-candidate-response',
            responseKind: 'hostContinue',
            status: 'posted',
            outcomeIntegrity: { selectedRevisionId: 'candidate-revision' }
          }]
        }
      },
      runtimeTracking: {
        responseLedger: [],
        responseLedgerRevision: 1
      }
    },
    {
      directiveRuntimeEvidence: {
        coreStoreReadProjections: {
          responseLedger: [{
            id: 'memory-response-different-stable-id',
            responseId: 'memory-response-different-stable-id',
            hostMessageId: 'shared-host-message',
            transactionId: 'txn-memory-response',
            responseKind: 'hostContinue',
            status: 'posted',
            outcomeIntegrity: { selectedRevisionId: 'memory-revision' }
          }]
        }
      },
      runtimeTracking: {
        responseLedger: [],
        responseLedgerRevision: 2
      }
    }
  );
  assert.equal(
    hostIdOnlyMergeResult.directiveRuntimeEvidence.coreStoreReadProjections.responses.length,
    2,
    'Fresher response projection merge must not match solely by SillyTavern hostMessageId.'
  );
  assert.equal(
    __directiveRuntimeAppTestHooks.shouldPreferInMemoryCampaignState(
      {
        ...staleScopedState,
        turnLedger: {
          entries: [
            { turnId: 'old-turn', outcomeId: 'old-outcome' },
            { turnId: 'fresh-turn', outcomeId: 'fresh-outcome' }
          ]
        },
        runtimeTracking: {
          ...staleScopedState.runtimeTracking,
          revision: 13,
          mechanicsRevision: 8,
          lastCommittedTurn: {
            turnId: 'fresh-turn',
            outcomeId: 'fresh-outcome',
            responseStatus: 'pending'
          }
        }
      },
      {
        ...richerInMemoryState,
        campaignChatBinding: {
          ...richerInMemoryState.campaignChatBinding,
          promptContextRevision: 30
        },
        turnLedger: { entries: [] },
        runtimeTracking: {
          ...richerInMemoryState.runtimeTracking,
          revision: 14,
          mechanicsRevision: 7,
          modelCallJournal: [
            { id: 'model-call.old' },
            { id: 'model-call.prompt-refresh' },
            { id: 'model-call.narration' }
          ]
        }
      },
      { chatId: 'scope-freshness-chat' }
    ),
    false,
    'A same-chat mechanics checkpoint with a committed turn must beat a higher-revision prompt-only in-memory state.'
  );
  assert.equal(
    __directiveRuntimeAppTestHooks.shouldPreferInMemoryCampaignState(
      {
        ...staleScopedState,
        turnLedger: {
          entries: [
            { turnId: 'old-turn', outcomeId: 'old-outcome' },
            { turnId: 'stale-old-ledger-turn', outcomeId: 'stale-old-ledger-outcome' },
            { turnId: 'stale-old-ledger-turn-2', outcomeId: 'stale-old-ledger-outcome-2' }
          ]
        },
        runtimeTracking: {
          ...staleScopedState.runtimeTracking,
          ingressLedger: [
            { id: 'old-ingress' },
            { id: 'stale-old-ledger-ingress' }
          ],
          responseLedger: [
            { id: 'old-response', status: 'posted' },
            { id: 'stale-old-ledger-response', status: 'posted' }
          ],
          recoveryJournal: [
            { id: 'stale-old-ledger-recovery', status: 'open' }
          ]
        }
      },
      {
        ...richerInMemoryState,
        turnLedger: { entries: [{ turnId: 'old-turn', outcomeId: 'old-outcome' }] },
        runtimeTracking: {
          ...richerInMemoryState.runtimeTracking,
          responseLedger: [{ id: 'old-response', status: 'posted' }]
        },
        directiveRuntimeEvidence: {
          coreStoreReadProjections: {
            kind: 'directive.coreStoreReadProjections.v1',
            turnLedger: {
              entries: [
                { turnId: 'old-turn', outcomeId: 'old-outcome' },
                { turnId: 'core-fresh-turn', outcomeId: 'core-fresh-outcome' },
                { turnId: 'core-fresh-turn-2', outcomeId: 'core-fresh-outcome-2' },
                { turnId: 'core-fresh-turn-3', outcomeId: 'core-fresh-outcome-3' }
              ]
            },
            ingressLedger: [
              { id: 'old-ingress' },
              { id: 'core-fresh-ingress' },
              { id: 'core-fresh-ingress-2' }
            ],
            responseLedger: [
              { id: 'old-response', status: 'posted' },
              { id: 'core-fresh-response', status: 'posted' },
              { id: 'core-fresh-response-2', status: 'posted' }
            ],
            recoveryJournal: [
              { id: 'core-fresh-recovery', status: 'open' },
              { id: 'core-fresh-recovery-2', status: 'open' }
            ]
          }
        }
      },
      { chatId: 'scope-freshness-chat' }
    ),
    true,
    'CORE read-projection freshness evidence must outrank stale old-ledger growth for the same chat/save.'
  );
  const coreOnlyTurnMerge = __directiveRuntimeAppTestHooks.mergeCoreTurnLedgerProjection(
    {
      entries: [
        {
          id: 'legacy-turn-old',
          turnId: 'turn-old',
          outcomeId: 'outcome-old',
          coreCheckpointRef: { checkpointId: 'legacy-checkpoint-old' }
        },
        {
          id: 'legacy-turn-shared',
          turnId: 'turn-shared',
          outcomeId: 'outcome-shared',
          coreTransactionId: 'legacy-core-txn-shared',
          transactionId: 'legacy-txn-shared',
          coreCheckpointRef: { checkpointId: 'checkpoint-shared' },
          snapshotBeforeRetained: true
        }
      ],
      replacementHistory: [
        { id: 'legacy-replacement-old', replacedOutcomeId: 'outcome-old' },
        { id: 'legacy-replacement-shared', replacedOutcomeId: 'outcome-shared' }
      ],
      lastCommittedOutcomeId: 'outcome-old'
    },
    {
      entries: [
        {
          id: 'core-turn-shared',
          turnId: 'turn-shared',
          outcomeId: 'outcome-shared',
          transactionId: 'txn-shared'
        }
      ],
      replacementHistory: [
        { id: 'core-replacement-shared', replacedOutcomeId: 'outcome-shared' }
      ],
      lastCommittedOutcomeId: 'outcome-shared'
    }
  );
  assert.deepEqual(
    coreOnlyTurnMerge.entries.map((entry) => entry.outcomeId),
    ['outcome-shared'],
    'Runtime CORE turn merge must omit unmatched legacy turn rows.'
  );
  assert.equal(
    coreOnlyTurnMerge.entries[0].coreCheckpointRef,
    undefined,
    'Runtime CORE turn merge must not promote matched legacy checkpoint refs into active authority.'
  );
  assert.equal(
    coreOnlyTurnMerge.entries[0].coreTransactionId,
    'txn-shared',
    'Runtime CORE turn merge must not promote matched legacy transaction ids into active authority.'
  );
  assert.equal(
    coreOnlyTurnMerge.entries[0].snapshotBeforeRetained,
    undefined,
    'Runtime CORE turn merge must not promote matched legacy retained-snapshot authority.'
  );
  assert.deepEqual(
    coreOnlyTurnMerge.replacementHistory.map((entry) => entry.replacedOutcomeId),
    ['outcome-shared'],
    'Runtime CORE turn merge must omit unmatched legacy replacement history.'
  );
  assert.equal(coreOnlyTurnMerge.lastCommittedOutcomeId, 'outcome-shared');
  const mergedRuntimePersistPending = __directiveRuntimeAppTestHooks.mergeRuntimePersistPendingRequest(
    {
      summary: 'Committed turn persisted.',
      state: {
        ...richerInMemoryState,
        campaignChatBinding: {
          ...richerInMemoryState.campaignChatBinding,
          promptContextRevision: 3
        },
        turnLedger: {
          entries: [
            { turnId: 'old-turn', outcomeId: 'old-outcome' },
            { turnId: 'pending-turn', outcomeId: 'pending-outcome' }
          ]
        },
        directiveRuntimeEvidence: {
          coreStoreReadProjections: {
            kind: 'directive.coreStoreReadProjections.v1',
            turnLedger: {
              entries: [
                { turnId: 'old-turn', outcomeId: 'old-outcome' },
                { turnId: 'pending-turn', outcomeId: 'pending-outcome' }
              ]
            },
            ingressLedger: [
              { id: 'old-ingress' },
              { id: 'pending-ingress', turnId: 'pending-turn' }
            ]
          }
        }
      }
    },
    {
      summary: 'Prompt context persisted.',
      state: {
        ...richerInMemoryState,
        campaignChatBinding: {
          ...richerInMemoryState.campaignChatBinding,
          promptContextRevision: 4
        },
        runtimeResume: { sidecarCount: 2 },
        turnLedger: {
          entries: [{ turnId: 'old-turn', outcomeId: 'old-outcome' }]
        },
        directiveRuntimeEvidence: {
          coreStoreReadProjections: {
            kind: 'directive.coreStoreReadProjections.v1',
            turnLedger: {
              entries: [{ turnId: 'old-turn', outcomeId: 'old-outcome' }]
            },
            sidecarDiagnostics: [
              { id: 'sidecar-diagnostic-1', status: 'settled' },
              { id: 'sidecar-diagnostic-2', status: 'settled' }
            ]
          }
        }
      }
    },
    { chatId: 'scope-freshness-chat', fallbackSaveId: 'save.scope-freshness' }
  );
  assert.equal(
    mergedRuntimePersistPending.state.campaignChatBinding.promptContextRevision,
    4,
    'Runtime persist pending merge must keep the newest prompt context revision.'
  );
  assert.equal(
    mergedRuntimePersistPending.state.turnLedger.entries.some((entry) => entry.turnId === 'pending-turn'),
    true,
    'Runtime persist pending merge must not drop a fresher queued CORE turn projection.'
  );
  assert.equal(
    mergedRuntimePersistPending.state.directiveRuntimeEvidence.coreStoreReadProjections.ingressLedger
      .some((entry) => entry.id === 'pending-ingress'),
    true,
    'Runtime persist pending merge must preserve queued CORE ingress evidence.'
  );
  assert.equal(
    mergedRuntimePersistPending.state.runtimeResume.sidecarCount,
    2,
    'Runtime persist pending merge must keep newer runtime resume counters from the later request.'
  );
  const mergedRuntimePersistPendingWithoutOldLedgers = __directiveRuntimeAppTestHooks.mergeRuntimePersistPendingRequest(
    {
      summary: 'Prior CORE runtime projections plus stale old ledgers.',
      state: {
        ...richerInMemoryState,
        runtimeTracking: {
          ...richerInMemoryState.runtimeTracking,
          ingressLedger: [{ id: 'stale-raw-ingress', status: 'received' }],
          responseLedger: [{ id: 'stale-raw-response', status: 'posted' }],
          recoveryJournal: [{ id: 'stale-raw-recovery', status: 'open' }]
        },
        directiveRuntimeEvidence: {
          coreStoreReadProjections: {
            kind: 'directive.coreStoreReadProjections.v1',
            ingressLedger: [{ id: 'core-merge-ingress', transactionId: 'txn.merge.1' }],
            responseLedger: [{ id: 'core-merge-response', transactionId: 'txn.merge.1', status: 'posted' }],
            recoveryJournal: [{ id: 'core-merge-recovery', transactionId: 'txn.merge.1', status: 'open' }]
          }
        }
      }
    },
    {
      summary: 'Persisted state without old runtime ledgers.',
      state: {
        ...richerInMemoryState,
        runtimeTracking: {
          ...richerInMemoryState.runtimeTracking,
          ingressLedger: [],
          responseLedger: [],
          recoveryJournal: []
        }
      }
    },
    { chatId: 'scope-freshness-chat', fallbackSaveId: 'save.scope-freshness' }
  );
  assert.equal(
    (mergedRuntimePersistPendingWithoutOldLedgers.state.runtimeTracking.ingressLedger || [])
      .some((entry) => entry.id === 'stale-raw-ingress'),
    false,
    'Runtime persist pending merge must not resurrect raw old ingress ledger rows when CORE projections carry freshness.'
  );
  assert.equal(
    (mergedRuntimePersistPendingWithoutOldLedgers.state.runtimeTracking.responseLedger || [])
      .some((entry) => entry.id === 'stale-raw-response'),
    false,
    'Runtime persist pending merge must not resurrect raw old response ledger rows when CORE projections carry freshness.'
  );
  assert.equal(
    (mergedRuntimePersistPendingWithoutOldLedgers.state.runtimeTracking.recoveryJournal || [])
      .some((entry) => entry.id === 'stale-raw-recovery'),
    false,
    'Runtime persist pending merge must not resurrect raw old recovery journal rows when CORE projections carry freshness.'
  );
  assert.equal(
    mergedRuntimePersistPendingWithoutOldLedgers.state.directiveRuntimeEvidence.coreStoreReadProjections.ingressLedger
      .some((entry) => entry.id === 'core-merge-ingress'),
    true,
    'Runtime persist pending merge must keep fresher CORE ingress projection evidence instead of old ledger rows.'
  );
  assert.equal(
    mergedRuntimePersistPendingWithoutOldLedgers.state.directiveRuntimeEvidence.coreStoreReadProjections.responses
      .some((entry) => entry.id === 'core-merge-response'),
    true,
    'Runtime persist pending merge must keep fresher CORE response projection evidence instead of old ledger rows.'
  );
  assert.equal(
    mergedRuntimePersistPendingWithoutOldLedgers.state.directiveRuntimeEvidence.coreStoreReadProjections.recoveryJournal
      .some((entry) => entry.id === 'core-merge-recovery'),
    true,
    'Runtime persist pending merge must keep fresher CORE recovery projection evidence instead of old journal rows.'
  );
  const mergedRuntimePersistAuthoritativeEmpty = __directiveRuntimeAppTestHooks.mergeRuntimePersistPendingRequest(
    {
      summary: 'Prior stale CORE projection evidence.',
      state: {
        ...richerInMemoryState,
        turnLedger: {
          entries: [{ turnId: 'stale-turn', outcomeId: 'stale-outcome' }]
        },
        directiveRuntimeEvidence: {
          coreStoreReadProjections: {
            kind: 'directive.coreStoreReadProjections.v1',
            runtimeAuthority: 'coreStoreV2',
            turnLedger: {
              runtimeAuthority: 'coreStoreV2',
              entries: [{ turnId: 'stale-turn', outcomeId: 'stale-outcome' }],
              replacementHistory: [{ id: 'stale-replacement' }]
            },
            ingressLedger: [{ id: 'stale-ingress', transactionId: 'txn-stale' }],
            responseLedger: [{ id: 'stale-response', transactionId: 'txn-stale', status: 'posted' }],
            pendingInteractions: [{
              id: 'stale-pending',
              kind: 'riskConfirmationNeeded',
              status: 'pending'
            }]
          }
        }
      }
    },
    {
      summary: 'Later authoritative empty CORE projection.',
      state: {
        ...richerInMemoryState,
        turnLedger: { entries: [] },
        directiveRuntimeEvidence: {
          coreStoreReadProjections: {
            kind: 'directive.coreStoreReadProjections.v1',
            runtimeAuthority: 'coreStoreV2',
            turnLedger: {
              runtimeAuthority: 'coreStoreV2',
              entries: [],
              replacementHistory: []
            },
            ingressLedger: [],
            responseLedger: [],
            pendingInteractions: []
          }
        }
      }
    },
    { chatId: 'scope-freshness-chat', fallbackSaveId: 'save.scope-freshness' }
  );
  assert.deepEqual(
    mergedRuntimePersistAuthoritativeEmpty.state.directiveRuntimeEvidence.coreStoreReadProjections.turnLedger.entries,
    [],
    'Later authoritative CORE turn projection must replace stale prior turn rows.'
  );
  assert.deepEqual(
    mergedRuntimePersistAuthoritativeEmpty.state.directiveRuntimeEvidence.coreStoreReadProjections.ingressLedger,
    [],
    'Later authoritative CORE ingress projection must replace stale prior ingress rows.'
  );
  assert.deepEqual(
    mergedRuntimePersistAuthoritativeEmpty.state.directiveRuntimeEvidence.coreStoreReadProjections.responses,
    [],
    'Later authoritative CORE response projection must replace stale prior response rows.'
  );
  assert.deepEqual(
    mergedRuntimePersistAuthoritativeEmpty.state.directiveRuntimeEvidence.coreStoreReadProjections.pendingInteractions,
    [],
    'Later authoritative CORE pending projection must replace stale prior pending rows.'
  );
  assert.deepEqual(
    mergedRuntimePersistAuthoritativeEmpty.state.turnLedger.entries,
    [],
    'Later authoritative CORE projection must not let stale prior turnLedger rows re-enter active state.'
  );
  const mergedRuntimePersistPendingWithoutTerminalMirror = __directiveRuntimeAppTestHooks.mergeRuntimePersistPendingRequest(
    {
      summary: 'Prior pending interactions.',
      state: {
        ...richerInMemoryState,
        directiveRuntimeEvidence: {
          ...richerInMemoryState.directiveRuntimeEvidence,
          coreStoreReadProjections: {
            ...richerInMemoryState.directiveRuntimeEvidence?.coreStoreReadProjections,
            pendingInteractions: [{
              id: 'risk-pending-still-owned',
              kind: 'riskConfirmationNeeded',
              status: 'pending',
              authority: 'corePendingInteractionProjection',
              compatibilityMirror: { kind: 'directive.pendingInteractionCompatibilityMirror.v1', status: 'corePendingInteractionProjection' }
            }]
          }
        },
        runtimeTracking: {
          ...richerInMemoryState.runtimeTracking,
          pendingInteractions: [{
            id: 'terminal-pending-mirror-stale',
            kind: 'terminalOutcomeDecision',
            status: 'pending',
            authority: 'terminalDecisionProjection',
            compatibilityMirror: { kind: 'directive.pendingInteractionCompatibilityMirror.v1', status: 'terminalDecisionProjection' }
          }]
        }
      }
    },
    {
      summary: 'Terminal ledger state persisted.',
      state: {
        ...richerInMemoryState,
        runtimeTracking: {
          ...richerInMemoryState.runtimeTracking,
          pendingInteractions: [],
          endConditionLedger: {
            schemaVersion: 1,
            activeDecisionId: 'terminal-decision-ledger-owned',
            detections: [],
            decisions: [{
              id: 'terminal-decision-ledger-owned',
              status: 'pending',
              authority: 'terminalDecisionProjection',
              coreProjection: {
                kind: 'directive.terminalEndConditionLedgerProjectionRef.v1',
                rowKind: 'decision',
                decisionId: 'terminal-decision-ledger-owned',
                status: 'pending'
              }
            }],
            branchRecords: [],
            continuationFrames: []
          }
        }
      }
    },
    { chatId: 'scope-freshness-chat', fallbackSaveId: 'save.scope-freshness' }
  );
  assert.equal(
    mergedRuntimePersistPendingWithoutTerminalMirror.state.runtimeTracking.pendingInteractions
      .some((entry) => entry.kind === 'terminalOutcomeDecision'),
    false,
    'Runtime persist pending merge must not resurrect terminal decisions from pendingInteractions.'
  );
  assert.equal(
    mergedRuntimePersistPendingWithoutTerminalMirror.state.runtimeTracking.pendingInteractions
      .some((entry) => entry.id === 'risk-pending-still-owned'),
    false,
    'Runtime persist pending merge must not preserve non-terminal pending interactions in old runtimeTracking rows.'
  );
  assert.equal(
    mergedRuntimePersistPendingWithoutTerminalMirror.state.directiveRuntimeEvidence.coreStoreReadProjections.pendingInteractions
      .some((entry) => entry.id === 'risk-pending-still-owned'),
    true,
    'Runtime persist pending merge must still preserve non-terminal CORE pending interactions under CORE read projections.'
  );
  const restoredCommittedOutcome = __directiveRuntimeAppTestHooks.restoreCommittedOutcomeState(
    {
      ...staleScopedState,
      commandLog: { entries: [{ id: 'old-log' }] },
      turnLedger: { entries: [] },
      runtimeTracking: {
        ...staleScopedState.runtimeTracking,
        responseLedger: [{ outcomeId: 'fresh-outcome', hostMessageId: '2' }],
        modelCallJournal: [{ id: 'model-call.narration' }],
        history: [{ source: 'sidecar:continuity', outcomeId: 'fresh-outcome' }]
      }
    },
    {
      ...richerInMemoryState,
      commandLog: {
        entries: [
          { id: 'old-log' },
          { sourceOutcomeId: 'fresh-outcome', summaryInputs: ['Committed outcome.'] }
        ]
      },
      turnLedger: {
        entries: [{ turnId: 'fresh-turn', outcomeId: 'fresh-outcome' }]
      },
      runtimeTracking: {
        ...richerInMemoryState.runtimeTracking,
        lastCommittedTurn: {
          turnId: 'fresh-turn',
          outcomeId: 'fresh-outcome',
          responseStatus: 'pending'
        },
        history: [{ source: 'missionDirector', outcomeId: 'fresh-outcome' }]
      }
    },
    'fresh-outcome'
  );
  assert.equal(restoredCommittedOutcome.turnLedger.entries.length, 1);
  assert.equal(restoredCommittedOutcome.runtimeTracking.lastCommittedTurn.outcomeId, 'fresh-outcome');
  assert.equal(restoredCommittedOutcome.runtimeTracking.responseLedger.length, 1);
  assert.equal(restoredCommittedOutcome.commandLog.entries.some((entry) => entry.sourceOutcomeId === 'fresh-outcome'), true);
  assert.equal(
    restoredCommittedOutcome.runtimeTracking.history.some((entry) => entry.source === 'missionDirector' && entry.outcomeId === 'fresh-outcome'),
    false,
    'Restoring a committed outcome must not import old checkpoint runtime history as replay authority.'
  );
  assert.deepEqual(
    restoredCommittedOutcome.runtimeTracking.history,
    [],
    'Restoring a committed outcome must clear old current compact history rows.'
  );
}

const host = createFakeDirectiveHost({
  chatNative: true,
  chatOptions: { chatId: 'pre-campaign-chat', entityName: 'Captain Whitaker' },
  generationOptions: {
    responses: {
      campaignIntro: {
        providerId: 'fake-reasoning',
        text: 'The Breckenridge opens a fresh campaign chat and hands the deck to the player officer.'
      }
    }
  }
});

let idSequence = 0;
let clock = Date.parse('2026-06-22T08:00:00.000Z');
const app = createDirectiveRuntimeApp({
  host,
  packageLoader: async () => ({
    packages: [packageData],
    projections: [projection],
    crewDatasets: [{
      path: 'packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json',
      dataset: crewDataset
    }],
    missionGraphs
  }),
  idFactory(prefix) {
    idSequence += 1;
    return `${prefix}-scope-${idSequence}`;
  },
  now() {
    const value = new Date(clock).toISOString();
    clock += 1000;
    return value;
  }
});

function draftPatch(name) {
  return {
    activeStep: 'review',
    input: {
      identity: {
        name,
        pronounsOrAddress: 'they/them',
        speciesId: 'human',
        ageBandId: 'mid-career',
        appearance: `${name} keeps a composed command posture.`
      },
      service: {
        careerBackgroundId: 'tactical-security',
        formativeExperienceId: 'dominion-war-fleet-service',
        assignmentReasonId: 'experienced-outsider-transfer'
      },
      personality: {
        traits: { insight: 'perceptive', connection: 'candid', execution: 'decisive' },
        flawId: 'impatient'
      },
      dossier: {
        detailLevel: 'Standard',
        briefBiography: `${name} is a Starfleet officer assigned to Directive current-chat scope testing.`,
        publicReputation: 'Known for steady judgment during uncertain operations.'
      }
    }
  };
}

async function startCampaign(name) {
  await app.startCreatorDraft({ packageId: packageData.manifest.id });
  let view = await app.saveCreatorDraft({
    reason: `testCompleteDraft:${name}`,
    patch: draftPatch(name)
  });
  assert.equal(view.creator.canBeginCampaign, true);
  view = await app.acceptCreatorDraftAndStartCampaign({ simulationMode: 'Command' });
  assert.equal(view.currentChat.status, 'matching-campaign');
  assert.equal(view.campaignState.player.name, name);
  assert.ok(view.chatNative.binding.chatId);
  assert.ok(view.chatNative.binding.saveId);
  return {
    name,
    binding: view.chatNative.binding,
    saveId: view.chatNative.binding.saveId,
    campaignId: view.chatNative.binding.campaignId
  };
}

function campaignIndexRow(view, campaign) {
  return view.campaignIndex.sessions.find((session) => session.campaignId === campaign.campaignId) || null;
}

await app.initialize();
const campaignA = await startCampaign('Asha Ren');
const campaignB = await startCampaign('Bren Tal');
const campaignASourceRecord = await loadCampaignSaveRecordFromStorage(host.storage, campaignA.saveId);
const campaignAAutosaveState = JSON.parse(JSON.stringify(campaignASourceRecord.payload.campaignState));
campaignAAutosaveState.campaign.currentStardate = 53101.7;
campaignAAutosaveState.campaignChatBinding = JSON.parse(JSON.stringify(campaignA.binding));
const campaignAAutosave = createAutosaveCampaignSaveRecord({
  campaignState: campaignAAutosaveState,
  packageData,
  saveId: 'autosave-scope-latest-campaign-a',
  savedAt: '2026-06-22T09:30:00.000Z',
  summary: 'Latest autosave for campaign A.'
});
await storeCampaignSave(host.storage, campaignAAutosave);
await persistActiveCampaignStateV2(host.storage, {
  saveRecord: campaignAAutosave,
  campaignState: campaignAAutosaveState,
  packageData,
  summary: 'Latest autosave for campaign A.',
  reason: 'test-current-chat-campaign-scope-autosave-runtime-v2',
  slotType: 'autosave',
  now: '2026-06-22T09:30:00.000Z'
});

let view = await app.getCurrentView({ tabId: 'campaign' });
assert.equal(view.campaignIndex.sessions.length >= 2, true, 'Command should index multiple campaigns.');
assert.equal(view.campaignIndex.visibleSessions.some((session) => session.campaignId === campaignA.campaignId), true);
assert.equal(view.campaignIndex.visibleSessions.some((session) => session.campaignId === campaignB.campaignId), true);

const campaignARows = view.campaignIndex.sessions.filter((session) => session.campaignId === campaignA.campaignId);
assert.equal(campaignARows.length, 1, 'Command should group every save for one playthrough into one campaign card.');
const sessionA = campaignARows[0];
assert.ok(sessionA?.key, 'Campaign cards should expose a stable hide/show key.');
assert.equal(sessionA?.saveId, campaignAAutosave.id, 'Command should represent the newest save even when that save is an autosave.');
assert.equal(sessionA?.slotType, 'autosave', 'Command latest-save selection should include autosaves.');
assert.equal(sessionA?.saveCount, 2, 'Command campaign card should expose the grouped save count.');
assert.equal(sessionA?.autosaveCount, 1, 'Command campaign card should count autosaves inside the campaign.');
assert.equal(sessionA?.simulationMode, 'Command', 'Campaign cards should expose saved Campaign Difficulty metadata.');
view = await app.hideCampaignSession({ key: sessionA.key });
assert.equal(view.campaignIndex.visibleSessions.some((session) => session.campaignId === campaignA.campaignId), false);
assert.equal(campaignIndexRow(view, campaignA)?.hidden, true);
assert.equal(view.campaignIndex.counts.hidden >= 1, true);
let preferences = await host.storage.readJson('system/ui-preferences.v1.json');
assert.equal(preferences.hiddenCampaignSessionKeys.includes(sessionA.key), true);
view = await app.showCampaignSession({ key: sessionA.key });
assert.equal(view.campaignIndex.visibleSessions.some((session) => session.campaignId === campaignA.campaignId), true);
preferences = await host.storage.readJson('system/ui-preferences.v1.json');
assert.equal(preferences.hiddenCampaignSessionKeys.includes(sessionA.key), false);

host.chat.setCurrentChatId('');
view = await app.getCurrentView({ tabId: 'mission' });
assert.equal(view.currentChat.status, 'none-selected');
assert.equal(view.campaignState, null);
assert.equal(view.currentChatCampaignState, null);
assert.equal(view.chatNative, null);
assert.equal(view.currentChatCampaignGuard.reason, 'no-active-chat-selected');
assert.match(view.currentChatCampaignGuard.summary, /Choose the campaign chat/);
assert.ok(view.loadedCampaignState, 'Loaded saves remain available for Campaign and Records.');
assert.equal(view.loadedCampaignState.player.name, campaignB.name);
assert.equal(view.loadedChatNative.manualSaveGuard.reason, 'no-active-chat-selected');
assert.equal(view.loadedSave.status, 'loaded-not-current-chat');

host.chat.setCurrentChatId('ordinary-host-chat');
view = await app.getCurrentView({ tabId: 'crew' });
assert.equal(view.currentChat.status, 'non-directive');
assert.equal(view.campaignState, null);
assert.equal(view.currentChatCampaignState, null);
assert.equal(view.chatNative, null);
assert.equal(view.currentChatCampaignGuard.reason, 'unbound-chat');
assert.equal(view.loadedCampaignState.player.name, campaignB.name);
assert.equal(view.loadedChatNative.manualSaveGuard.reason, 'unbound-chat');
const ordinaryChatSessionB = campaignIndexRow(view, campaignB);
assert.equal(ordinaryChatSessionB?.currentChat, false, 'A campaign row should not claim Current Chat while an unrelated host chat is selected.');
assert.equal(ordinaryChatSessionB?.binding?.chatId, campaignB.binding.chatId, 'Campaign rows should retain the bound SillyTavern chat identity for display.');

await host.chat.open(campaignA.binding);
view = await app.getCurrentView({ tabId: 'ship' });
assert.equal(view.currentChat.status, 'matching-campaign');
assert.equal(view.campaignState.player.name, campaignA.name);
assert.equal(view.chatNative.binding.saveId, campaignA.saveId);
assert.equal(view.loadedSave.saveId, campaignA.saveId);
assert.equal(campaignIndexRow(view, campaignA)?.saveId, campaignAAutosave.id, 'The campaign card should keep pointing at the latest save while an older branch chat is selected.');
assert.equal(campaignIndexRow(view, campaignA)?.currentChat, true);
assert.equal(campaignIndexRow(view, campaignA)?.currentChatSaveId, campaignA.saveId);
assert.equal(campaignIndexRow(view, campaignB)?.currentChat, false);

await app.hideCampaignSession({ key: sessionA.key });
view = await app.getCurrentView({ tabId: 'log' });
assert.equal(view.campaignState.player.name, campaignA.name, 'Hiding a Command row must not block live routes for the selected chat.');
assert.equal(view.campaignIndex.visibleSessions.some((session) => session.campaignId === campaignA.campaignId), false);
preferences = await host.storage.readJson('system/ui-preferences.v1.json');
assert.equal(preferences.hiddenCampaignSessionKeys.includes(sessionA.key), true);

await host.chat.open(campaignB.binding);
view = await app.getCurrentView({ tabId: 'mission' });
assert.equal(view.currentChat.status, 'matching-campaign');
assert.equal(view.campaignState.player.name, campaignB.name);
assert.equal(view.chatNative.binding.saveId, campaignB.saveId);
assert.equal(view.loadedSave.saveId, campaignB.saveId);

const openedLatestAutosave = await app.openCampaignChat({
  saveId: campaignAAutosave.id,
  binding: campaignIndexRow(await app.getCurrentView({ tabId: 'campaign' }), campaignA)?.binding
});
assert.equal(openedLatestAutosave.ok, true);
assert.equal(openedLatestAutosave.view.loadedSave.saveId, campaignAAutosave.id, 'Opening a campaign card should load its latest save.');
assert.equal(openedLatestAutosave.view.chatNative.binding.saveId, campaignAAutosave.id, 'Explicit latest save id should override stale binding metadata when opening a campaign card.');

console.log('Current chat campaign scope tests passed: Command campaign grouping, latest-save selection, hide/show, no-chat gating, non-Directive gating, and chat-selected hydration');
