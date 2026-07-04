import assert from 'node:assert/strict';

import { hashStableJson } from '../../src/runtime/architecture-redesign-contracts.mjs';
import { createLogicalStorageAdapter } from '../../src/storage/logical-storage-adapter.mjs';
import {
  importCampaignSaveRecordToV2,
  loadV2CampaignManifest,
  loadV2Checkpoint,
  loadV2MaterializedHead,
  loadV2SaveManifest,
  readV2ArtifactRef,
  readV2Segment
} from '../../src/storage/transaction-store-v2.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createMemoryStorage() {
  const files = new Map();
  return {
    snapshot() {
      return Object.fromEntries([...files.entries()].map(([key, value]) => [key, cloneJson(value)]));
    },
    async readJson(filePath) {
      if (!files.has(filePath)) {
        const error = new Error(`not found: ${filePath}`);
        error.code = 'ENOENT';
        throw error;
      }
      return cloneJson(files.get(filePath));
    },
    async writeJson(filePath, value) {
      files.set(filePath, cloneJson(value));
      return { ok: true, path: filePath };
    },
    async verifyJsonFiles(paths) {
      return Object.fromEntries(paths.map((filePath) => [filePath, files.has(filePath)]));
    }
  };
}

function createLegacySave() {
  return {
    kind: 'directive.campaignSave',
    schemaVersion: 1,
    id: 'save-import-v1',
    revision: 3,
    slotType: 'manual',
    name: 'Sam Vickers - Ashes Import',
    createdAt: '2026-06-27T20:00:00.000Z',
    updatedAt: '2026-06-28T14:10:00.000Z',
    current: true,
    metadata: {
      campaignId: 'campaign-import-v1',
      campaignTitle: 'Ashes of Peace',
      playerName: 'Sam Vickers',
      branch: {
        parentSaveId: 'save-parent',
        parentSaveName: 'Parent Timeline',
        divergenceOutcomeId: 'outcome-parent'
      }
    },
    payload: {
      campaignState: {
        campaign: {
          id: 'campaign-import-v1',
          title: 'Ashes of Peace',
          currentStardate: 78144.6
        },
        player: {
          name: 'Sam Vickers',
          role: 'Executive Officer'
        },
        ship: {
          name: 'U.S.S. Breckenridge'
        },
        campaignChatBinding: {
          hostId: 'sillytavern',
          chatId: 'ashes-import-chat',
          promptContextRevision: 42
        },
        commandLog: {
          entries: [
            { id: 'log-1', summary: 'Sam held the room together without pretending the room was fine.' }
          ]
        },
        externalDiagnostics: {
          qdrant_api_key: 'SECRET-QDRANT-KEY',
          promptText: 'RAW_EXTERNAL_PROMPT_TEXT'
        },
        runtimeTracking: {
          directiveRuntimeEvidence: {
            coreStoreReadProjections: {
              modelCallDiagnostics: [
                {
                  id: 'model-projection-1',
                  status: 'ok',
                  requestHash: 'model-request-hash',
                  promptSnapshot: 'RAW_PROVIDER_PROMPT',
                  responseSnapshot: 'RAW_PROVIDER_RESPONSE'
                }
              ],
              sidecarDiagnostics: [
                {
                  id: 'sidecar-projection-1',
                  worker: 'continuity',
                  status: 'accepted',
                  sourceSnapshot: 'RAW_SIDECAR_SOURCE',
                  resultSnapshot: 'RAW_SIDECAR_RESULT'
                }
              ]
            }
          },
          ingressLedger: [
            {
              id: 'ingress-1',
              hostMessageId: '29',
              turnId: 'turn-1',
              outcomeId: 'outcome-1',
              textHash: 'hash-player-29',
              textPreview: 'RAW_PLAYER_TRANSCRIPT_TEXT',
              status: 'complete',
              authority: 'compatibilityProjection',
              projectionSource: 'coreStoreV2',
              compatibilityMirror: {
                kind: 'directive.coreIngressCompatibilityMirror.v1',
                status: 'complete',
                transactionId: 'txn-import-v1'
              }
            }
          ],
          responseLedger: [
            {
              id: 'response-1',
              hostMessageId: '30',
              turnId: 'turn-1',
              outcomeId: 'outcome-1',
              status: 'posted',
              authority: 'compatibilityProjection',
              projectionSource: 'coreStoreV2',
              compatibilityMirror: {
                kind: 'directive.coreResponseCompatibilityMirror.v1',
                status: 'posted',
                transactionId: 'txn-import-v1'
              }
            }
          ],
          recoveryJournal: [
            { id: 'recovery-1', status: 'resolved' }
          ],
          history: [
            {
              id: 'history-1',
              snapshot: {
                rawContent: 'RAW_RUNTIME_HISTORY_SNAPSHOT'
              }
            }
          ]
        },
        turnLedger: {
          lastCommittedOutcomeId: 'outcome-1',
          entries: [
            {
              turnId: 'turn-1',
              outcomeId: 'outcome-1',
              stateDelta: {
                mission: {
                  activePhaseId: 'follow-up'
                },
                openWorld: {
                  rootsSet: {
                    runtimeTracking: {
                      modelCallJournal: ['RAW_LEGACY_ROOTSET_MODEL_CALL_JOURNAL']
                    }
                  }
                }
              },
              snapshotBefore: {
                rawContent: 'RAW_SNAPSHOT_BEFORE_PAYLOAD',
                runtimeTracking: {
                  history: ['RAW_NESTED_RUNTIME_HISTORY']
                }
              },
              retainedPacket: {
                narratorPacket: 'RAW_NARRATOR_PACKET',
                directorPacket: 'RAW_DIRECTOR_PACKET'
              }
            }
          ]
        },
        modelCallJournal: [
          {
            id: 'model-1',
            status: 'ok',
            promptSnapshot: 'RAW_PROVIDER_PROMPT',
            responseSnapshot: 'RAW_PROVIDER_RESPONSE'
          }
        ],
        sidecarJournal: [
          {
            id: 'sidecar-1',
            worker: 'continuity',
            sourceSnapshot: 'RAW_SIDECAR_SOURCE',
            resultSnapshot: 'RAW_SIDECAR_RESULT'
          }
        ]
      }
    }
  };
}

const saveRecord = createLegacySave();
assert.equal(JSON.stringify(saveRecord).includes('"rootsSet"'), true, 'legacy save fixture should include broad open-world rootsSet');
const storage = createMemoryStorage();
const adapter = createLogicalStorageAdapter({ storage, hostId: 'fake' });
const imported = await importCampaignSaveRecordToV2(adapter, saveRecord, {
  now: '2026-06-28T14:15:00.000Z'
});

assert.equal(imported.saveManifest.current, true);
assert.equal(imported.saveManifest.importedFrom.legacyFullSaveHash, hashStableJson(saveRecord));
assert.equal(imported.saveManifest.importedFrom.metadata.branch.parentSaveId, 'save-parent');
assert.equal(imported.saveManifest.importedFrom.summary.ingressCount, 1);
assert.equal(imported.saveManifest.importedFrom.summary.turnCount, 1);
assert.equal(imported.refs.eventSegments.length, 1);
assert.equal(imported.refs.turnSegments.length, 1);
assert.equal(imported.refs.diagnosticsSegments.length, 1);
assert.equal(imported.refs.checkpoints.length, 2);

const campaignManifest = await loadV2CampaignManifest(adapter, 'campaign-import-v1');
assert.equal(campaignManifest.activeSaveId, 'save-import-v1');
const saveManifest = await loadV2SaveManifest(adapter, {
  campaignId: 'campaign-import-v1',
  saveId: 'save-import-v1'
});
assert.equal(saveManifest.hash, imported.saveManifest.hash);
const head = await loadV2MaterializedHead(adapter, {
  campaignId: 'campaign-import-v1',
  saveId: 'save-import-v1'
});
assert.equal(head.importedFromLegacySave, true);
assert.equal(head.state.player.name, 'Sam Vickers');
assert.equal(head.state.runtimeTracking, undefined);
assert.equal(head.state.turnLedger, undefined);
assert.equal(head.state.modelCallJournal, undefined);
assert.equal(head.state.externalDiagnostics.qdrant_api_key, '[redacted-secret]');
assert.equal(head.state.externalDiagnostics.promptText, '[redacted-raw-payload]');

const hostMap = await readV2ArtifactRef(adapter, imported.refs.hostMap);
assert.equal(hostMap.excludesRawChatText, true);
assert.equal(hostMap.rows.length, 2);
assert.equal(hostMap.rows.some((row) => 'text' in row || 'mes' in row || 'raw' in row || 'rawText' in row || 'textPreview' in row), false);
const eventSegment = await readV2Segment(adapter, {
  segmentType: 'event',
  campaignId: 'campaign-import-v1',
  saveId: 'save-import-v1',
  segmentId: '0000'
});
assert.equal(eventSegment.entries.some((entry) => entry.type === 'legacyTurnImported'), true);
const importedTurnEvent = eventSegment.entries.find((entry) => entry.type === 'legacyTurnImported');
assert.equal(importedTurnEvent.stateDeltaHash, hashStableJson(saveRecord.payload.campaignState.turnLedger.entries[0].stateDelta));
const turnSegment = await readV2Segment(adapter, {
  segmentType: 'turn',
  campaignId: 'campaign-import-v1',
  saveId: 'save-import-v1',
  segmentId: '0000'
});
assert.equal(turnSegment.entries[0].snapshotAvailableInLegacySave, true);
assert.equal(Object.hasOwn(turnSegment.entries[0], 'snapshotBefore'), false);
assert.equal(Object.hasOwn(turnSegment.entries[0], 'retainedPacket'), false);
const diagnosticsSegment = await readV2Segment(adapter, {
  segmentType: 'diagnostics',
  campaignId: 'campaign-import-v1',
  saveId: 'save-import-v1',
  segmentId: '0000'
});
assert.equal(diagnosticsSegment.entries.length, 2);
assert.equal(diagnosticsSegment.entries.every((entry) => entry.sourceHash), true);
const retainedCheckpoint = await loadV2Checkpoint(adapter, {
  campaignId: 'campaign-import-v1',
  saveId: 'save-import-v1',
  checkpointId: 'legacy-turn-0001'
});
assert.equal(retainedCheckpoint.checkpoint.snapshotHash, hashStableJson(saveRecord.payload.campaignState.turnLedger.entries[0].snapshotBefore));
assert.equal(Object.hasOwn(retainedCheckpoint.checkpoint, 'snapshotBefore'), false);

const serializedV2 = JSON.stringify(storage.snapshot());
for (const marker of [
  'SECRET-QDRANT-KEY',
  'RAW_EXTERNAL_PROMPT_TEXT',
  'RAW_PLAYER_TRANSCRIPT_TEXT',
  'RAW_RUNTIME_HISTORY_SNAPSHOT',
  'RAW_SNAPSHOT_BEFORE_PAYLOAD',
  'RAW_NESTED_RUNTIME_HISTORY',
  'RAW_NARRATOR_PACKET',
  'RAW_DIRECTOR_PACKET',
  'RAW_PROVIDER_PROMPT',
  'RAW_PROVIDER_RESPONSE',
  'RAW_SIDECAR_SOURCE',
  'RAW_SIDECAR_RESULT',
  'RAW_LEGACY_ROOTSET_MODEL_CALL_JOURNAL',
  '"rootsSet"',
  'textPreview',
  'promptSnapshot',
  'responseSnapshot'
]) {
  assert.equal(serializedV2.includes(marker), false, `v2 import artifacts must not include ${marker}`);
}

const projectedLegacySave = createLegacySave();
projectedLegacySave.id = 'save-import-v1-projected';
projectedLegacySave.metadata.campaignId = 'campaign-import-v1-projected';
projectedLegacySave.payload.campaignState.campaign.id = 'campaign-import-v1-projected';
projectedLegacySave.payload.campaignState.runtimeTracking.directiveRuntimeEvidence = {
  coreStoreReadProjections: {
    ingressLedger: [{
      id: 'core-import-ingress',
      hostMessageId: 'core-import-player',
      status: 'classified',
      textHash: 'hash-core-import-player'
    }],
    responseLedger: [{
      id: 'core-import-response',
      hostMessageId: 'core-import-assistant',
      responseKind: 'hostContinue',
      status: 'posted'
    }],
    recoveryJournal: [{
      id: 'core-import-recovery',
      transactionId: 'txn-core-import',
      status: 'resolved'
    }]
  }
};
projectedLegacySave.payload.campaignState.runtimeTracking.ingressLedger = [
  { id: 'silent-import-ingress', hostMessageId: 'silent-import-player', status: 'old' },
  {
    id: 'tagged-import-ingress',
    hostMessageId: 'tagged-import-player',
    status: 'old',
    authority: 'compatibilityProjectionUnavailable',
    projectionSource: 'runtimeTrackingLegacy',
    compatibilityMirror: { kind: 'directive.coreIngressCompatibilityMirror.v1', status: 'missingCoreProjection' }
  }
];
projectedLegacySave.payload.campaignState.runtimeTracking.responseLedger = [
  { id: 'silent-import-response', hostMessageId: 'silent-import-assistant', status: 'old' },
  {
    id: 'tagged-import-response',
    hostMessageId: 'tagged-import-assistant',
    responseKind: 'hostContinue',
    status: 'old',
    authority: 'compatibilityProjectionUnavailable',
    projectionSource: 'runtimeTrackingLegacy',
    compatibilityMirror: { kind: 'directive.coreResponseCompatibilityMirror.v1', status: 'missingCoreProjection' }
  }
];
projectedLegacySave.payload.campaignState.runtimeTracking.recoveryJournal = [
  { id: 'silent-import-recovery', status: 'old' }
];
const projectedStorage = createMemoryStorage();
const projectedAdapter = createLogicalStorageAdapter({ storage: projectedStorage, hostId: 'fake' });
const projectedImported = await importCampaignSaveRecordToV2(projectedAdapter, projectedLegacySave, {
  now: '2026-06-28T14:16:00.000Z'
});
const projectedHostMap = await readV2ArtifactRef(projectedAdapter, projectedImported.refs.hostMap);
assert.deepEqual(
  projectedHostMap.rows.map((row) => row.hostMessageId),
  ['core-import-player', 'core-import-assistant'],
  'old-save v2 import must project CORE rows and ignore unavailable old compatibility rows'
);
const projectedEventSegment = await readV2Segment(projectedAdapter, {
  segmentType: 'event',
  campaignId: 'campaign-import-v1-projected',
  saveId: 'save-import-v1-projected',
  segmentId: '0000'
});
assert.deepEqual(
  projectedEventSegment.entries
    .filter((entry) => entry.type === 'legacyIngressImported' || entry.type === 'legacyResponseImported')
    .map((entry) => entry.hostMessageId),
  ['core-import-player', 'core-import-assistant'],
  'old-save v2 import event segments must not revive silent or unavailable old ledger rows when CORE projections exist'
);
assert.deepEqual(
  {
    ingressCount: projectedImported.saveManifest.importedFrom.summary.ingressCount,
    responseCount: projectedImported.saveManifest.importedFrom.summary.responseCount,
    recoveryCount: projectedImported.saveManifest.importedFrom.summary.recoveryCount
  },
  { ingressCount: 1, responseCount: 1, recoveryCount: 1 },
  'old-save v2 import summary must count CORE-first projected runtime rows'
);
assert.equal(JSON.stringify(projectedStorage.snapshot()).includes('silent-import-player'), false);
assert.equal(JSON.stringify(projectedStorage.snapshot()).includes('silent-import-response'), false);

const secondStorage = createMemoryStorage();
const secondAdapter = createLogicalStorageAdapter({ storage: secondStorage, hostId: 'fake' });
const importedAgain = await importCampaignSaveRecordToV2(secondAdapter, saveRecord, {
  now: '2026-06-28T14:15:00.000Z'
});
assert.equal(importedAgain.saveManifest.hash, imported.saveManifest.hash, 'repeated import with same timestamp should be idempotent');

console.log('Old save importer v2 tests passed.');
