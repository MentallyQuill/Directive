import assert from 'node:assert/strict';

import { createLogicalStorageAdapter } from '../../src/storage/logical-storage-adapter.mjs';
import {
  campaignManifestV2LogicalKey,
  coreCampaignManifestV2LogicalKey,
  coreSaveManifestV2LogicalKey,
  materializedHeadV2LogicalKey,
  saveManifestV2LogicalKey
} from '../../src/storage/logical-storage-paths.mjs';
import {
  chunkV2SegmentEntries,
  commitV2DiagnosticsSegments,
  commitV2EventTurnSegments,
  commitV2SaveLayout,
  createV2SegmentRecord,
  loadV2CampaignManifest,
  loadV2Checkpoint,
  loadV2MaterializedHead,
  loadV2SaveManifest,
  readV2ArtifactRef,
  readV2Segment,
  writeV2Segment
} from '../../src/storage/transaction-store-v2.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createLoggingStorage({ corruptOnWrite = null, afterReadJson = null } = {}) {
  const files = new Map();
  const writeLog = [];
  const readLog = [];
  const deleteLog = [];
  return {
    writeLog,
    readLog,
    deleteLog,
    snapshot() {
      return Object.fromEntries([...files.entries()].map(([key, value]) => [key, cloneJson(value)]));
    },
    async readJson(filePath) {
      readLog.push(filePath);
      if (!files.has(filePath)) {
        const error = new Error(`not found: ${filePath}`);
        error.code = 'ENOENT';
        throw error;
      }
      const value = cloneJson(files.get(filePath));
      if (typeof afterReadJson === 'function') {
        await afterReadJson(filePath, cloneJson(value));
      }
      return value;
    },
    async writeJson(filePath, value) {
      writeLog.push(filePath);
      const next = cloneJson(value);
      if (typeof corruptOnWrite === 'function') corruptOnWrite(filePath, next);
      files.set(filePath, next);
      return { ok: true, path: filePath };
    },
    async deleteJsonFile(filePath) {
      deleteLog.push(filePath);
      files.delete(filePath);
      return { ok: true, path: filePath };
    },
    async verifyJsonFiles(paths) {
      return Object.fromEntries(paths.map((filePath) => [filePath, files.has(filePath)]));
    }
  };
}

const storage = createLoggingStorage();
const adapter = createLogicalStorageAdapter({ storage, hostId: 'fake' });
const campaignId = 'campaign-v2-test';
const saveId = 'save-v2-test';
const now = '2026-06-28T14:00:00.000Z';

const result = await commitV2SaveLayout(adapter, {
  campaignId,
  saveId,
  branchId: 'main',
  now,
  head: {
    state: {
      campaign: { title: 'Ashes of Peace' },
      player: { name: 'Sam Vickers' }
    }
  },
  hostMap: {
    excludesRawChatText: true,
    rows: [
      { hostMessageId: '29', role: 'player', textHash: 'hash-player-29' },
      { hostMessageId: '30', role: 'assistant', outcomeId: 'outcome-30' }
    ]
  },
  promptCache: {
    directiveOwnedRevision: 7,
    blocks: [{ id: 'contract', textHash: 'hash-contract' }]
  },
  eventSegments: [
    Array.from({ length: 12 }, (_, index) => ({
      id: `event-${index + 1}`,
      type: 'turnEvent',
      revision: index + 1,
      summary: `event ${index + 1}`
    }))
  ],
  turnSegments: [
    [
      { id: 'turn-1', turnId: 'turn-1', outcomeId: 'outcome-1', phase: 'settled' }
    ]
  ],
  diagnosticsSegments: [
    [
      { id: 'diag-1', type: 'modelCallSummary', status: 'ok', latencyMs: 1500 }
    ]
  ],
  checkpoints: [
    {
      checkpointId: 'before-turn-1',
      source: 'test',
      snapshotHash: 'checkpoint-hash',
      retained: true
    }
  ]
});

assert.equal(
  storage.writeLog.includes(saveManifestV2LogicalKey({ campaignId, saveId })),
  true,
  'save manifest should be written after blobs'
);
assert.equal(
  storage.writeLog.indexOf(saveManifestV2LogicalKey({ campaignId, saveId }))
    < storage.writeLog.indexOf(campaignManifestV2LogicalKey(campaignId)),
  true,
  'save manifest should be written before campaign manifest pointer'
);
assert.equal(storage.writeLog.at(-1), campaignManifestV2LogicalKey(campaignId), 'campaign manifest should be the final pointer write');
assert.equal(result.saveManifest.current, true);
assert.equal(result.refs.eventSegments.length, 1);
assert.equal(result.refs.turnSegments.length, 1);
assert.equal(result.refs.diagnosticsSegments.length, 1);
assert.equal(result.refs.checkpoints.length, 1);
assert.equal(Object.values(result.verification).every(Boolean), true);

const saveManifest = await loadV2SaveManifest(adapter, { campaignId, saveId });
assert.equal(saveManifest.head.hash, result.refs.head.hash);
assert.equal(saveManifest.eventSegments[0].entryCount, 12);
const campaignManifest = await loadV2CampaignManifest(adapter, campaignId);
assert.equal(campaignManifest.activeSaveId, saveId);
assert.equal(campaignManifest.saves[saveId].manifest.hash, result.saveManifestRef.hash);
const head = await loadV2MaterializedHead(adapter, { campaignId, saveId });
assert.equal(head.state.player.name, 'Sam Vickers');

{
  const interruptedCampaignId = 'campaign-interrupted-head';
  const interruptedSaveId = 'save-interrupted-head';
  const interruptedSaveManifestKey = saveManifestV2LogicalKey({
    campaignId: interruptedCampaignId,
    saveId: interruptedSaveId
  });
  let saveManifestWrites = 0;
  const interruptedStorage = createLoggingStorage({
    corruptOnWrite: (filePath) => {
      if (filePath !== interruptedSaveManifestKey) return;
      saveManifestWrites += 1;
      if (saveManifestWrites === 2) {
        const error = new Error('simulated save-manifest write interruption');
        error.code = 'SIMULATED_SAVE_MANIFEST_WRITE_INTERRUPTION';
        throw error;
      }
    }
  });
  const interruptedAdapter = createLogicalStorageAdapter({ storage: interruptedStorage, hostId: 'fake' });
  const interruptedInitial = await commitV2SaveLayout(interruptedAdapter, {
    campaignId: interruptedCampaignId,
    saveId: interruptedSaveId,
    now,
    head: {
      state: {
        campaign: { id: interruptedCampaignId },
        player: { name: 'Old Sam' },
        continuity: { dossier: 'old continuity' }
      }
    },
    eventSegments: [[]],
    turnSegments: [[]],
    diagnosticsSegments: [[]]
  });
  await assert.rejects(
    () => commitV2SaveLayout(interruptedAdapter, {
      campaignId: interruptedCampaignId,
      saveId: interruptedSaveId,
      now: '2026-06-28T14:00:10.000Z',
      head: {
        state: {
          campaign: { id: interruptedCampaignId },
          player: { name: 'New Sam' },
          continuity: { dossier: 'new continuity' }
        }
      },
      eventSegments: [[]],
      turnSegments: [[]],
      diagnosticsSegments: [[]]
    }),
    /simulated save-manifest write interruption/
  );
  const interruptedManifest = await loadV2SaveManifest(interruptedAdapter, {
    campaignId: interruptedCampaignId,
    saveId: interruptedSaveId
  });
  assert.equal(
    interruptedManifest.head.hash,
    interruptedInitial.saveManifest.head.hash,
    'interrupted commit must leave save manifest pointing at last committed immutable head ref'
  );
  const interruptedLoadedHead = await loadV2MaterializedHead(interruptedAdapter, {
    campaignId: interruptedCampaignId,
    saveId: interruptedSaveId,
    headRef: interruptedManifest.head
  });
  assert.equal(interruptedLoadedHead.state.player.name, 'Old Sam');
  assert.equal(interruptedLoadedHead.state.continuity.dossier, 'old continuity');
  const interruptedCanonicalHead = await loadV2MaterializedHead(interruptedAdapter, {
    campaignId: interruptedCampaignId,
    saveId: interruptedSaveId
  });
  assert.equal(
    interruptedCanonicalHead.state.player.name,
    'Old Sam',
    'canonical latest head must not advance before the save manifest write succeeds'
  );
}

const eventSegment = await readV2Segment(adapter, {
  segmentType: 'event',
  campaignId,
  saveId,
  segmentId: '0000'
});
assert.equal(eventSegment.entryCount, 12);
const checkpoint = await loadV2Checkpoint(adapter, {
  campaignId,
  saveId,
  checkpointId: 'before-turn-1'
});
assert.equal(checkpoint.checkpoint.snapshotHash, 'checkpoint-hash');
const promptCache = await readV2ArtifactRef(adapter, result.refs.promptCache);
assert.equal(promptCache.directiveOwnedRevision, 7);

const rootSplitStorage = createLoggingStorage();
const rootSplitAdapter = createLogicalStorageAdapter({ storage: rootSplitStorage, hostId: 'fake' });
const rootSplitCampaignId = 'campaign-root-split-head';
const rootSplitSaveId = 'save-root-split-head';
const largeContinuityText = 'continuity '.repeat(24000);
const rootSplitInitial = await commitV2SaveLayout(rootSplitAdapter, {
  campaignId: rootSplitCampaignId,
  saveId: rootSplitSaveId,
  now,
  head: {
    state: {
      campaign: { title: 'Ashes of Peace' },
      player: { name: 'Sam Vickers' },
      continuity: { dossier: largeContinuityText }
    },
    runtimeSummary: { sidecarCount: 0 }
  },
  reuseExistingSegmentRefs: true
});
const rawRootSplitHead = await readV2ArtifactRef(rootSplitAdapter, rootSplitInitial.refs.head);
assert.equal(rawRootSplitHead.state, undefined, 'materialized head file should not inline full root state');
assert.equal(Boolean(rawRootSplitHead.stateRootRefs?.continuity?.logicalKey), true, 'materialized head file should point at continuity root artifact');
assert.equal(
  rootSplitInitial.refs.head.byteLength < 12000,
  true,
  'materialized head pointer file must stay compact even when continuity root is large'
);
const hydratedRootSplitHead = await loadV2MaterializedHead(rootSplitAdapter, {
  campaignId: rootSplitCampaignId,
  saveId: rootSplitSaveId
});
assert.equal(hydratedRootSplitHead.state.continuity.dossier, largeContinuityText, 'materialized head loader hydrates split root state');
const continuityRootKey = rawRootSplitHead.stateRootRefs.continuity.logicalKey;
const rootSplitAliasKey = materializedHeadV2LogicalKey({ campaignId: rootSplitCampaignId, saveId: rootSplitSaveId });
const rootSplitProjectionOnlyWriteStart = rootSplitStorage.writeLog.length;
const rootSplitProjectionOnly = await commitV2SaveLayout(rootSplitAdapter, {
  campaignId: rootSplitCampaignId,
  saveId: rootSplitSaveId,
  now: '2026-06-28T14:00:15.000Z',
  head: {
    state: {
      campaign: { title: 'Ashes of Peace' },
      player: { name: 'Sam Vickers' },
      continuity: { dossier: largeContinuityText }
    },
    runtimeSummary: { sidecarCount: 2 }
  },
  reuseExistingSegmentRefs: true
});
const rootSplitProjectionOnlyWrites = rootSplitStorage.writeLog.slice(rootSplitProjectionOnlyWriteStart);
assert.equal(
  rootSplitProjectionOnly.refs.head.logicalKey,
  rootSplitInitial.refs.head.logicalKey,
  'projection-only active-head commits must keep the existing immutable head ref'
);
assert.equal(
  rootSplitProjectionOnlyWrites.includes(rootSplitInitial.refs.head.logicalKey),
  false,
  'projection-only active-head commits must not rewrite the immutable head'
);
assert.equal(
  rootSplitProjectionOnlyWrites.includes(rootSplitAliasKey),
  false,
  'projection-only active-head commits must not refresh the stable head alias when it already matches'
);
await rootSplitStorage.deleteJsonFile(rootSplitAliasKey);
const rootSplitMissingAliasWriteStart = rootSplitStorage.writeLog.length;
const rootSplitMissingAliasRepair = await commitV2SaveLayout(rootSplitAdapter, {
  campaignId: rootSplitCampaignId,
  saveId: rootSplitSaveId,
  now: '2026-06-28T14:00:20.000Z',
  head: {
    state: {
      campaign: { title: 'Ashes of Peace' },
      player: { name: 'Sam Vickers' },
      continuity: { dossier: largeContinuityText }
    },
    runtimeSummary: { sidecarCount: 3 }
  },
  reuseExistingSegmentRefs: true
});
const rootSplitMissingAliasWrites = rootSplitStorage.writeLog.slice(rootSplitMissingAliasWriteStart);
assert.equal(
  rootSplitMissingAliasRepair.refs.head.logicalKey,
  rootSplitInitial.refs.head.logicalKey,
  'projection-only active-head commits must keep the existing immutable head ref when repairing a missing stable alias'
);
assert.equal(
  rootSplitMissingAliasWrites.includes(rootSplitInitial.refs.head.logicalKey),
  false,
  'missing stable alias repair must not rewrite the immutable head'
);
assert.equal(
  rootSplitMissingAliasWrites.includes(rootSplitAliasKey),
  true,
  'missing stable head alias must be repaired even when the immutable head is unchanged'
);
const rootSplitWriteStart = rootSplitStorage.writeLog.length;
await commitV2SaveLayout(rootSplitAdapter, {
  campaignId: rootSplitCampaignId,
  saveId: rootSplitSaveId,
  now: '2026-06-28T14:00:30.000Z',
  head: {
    state: {
      campaign: { title: 'Ashes of Peace' },
      player: { name: 'Mira Arlen' },
      continuity: { dossier: largeContinuityText }
    },
    runtimeSummary: { sidecarCount: 0 }
  },
  reuseExistingSegmentRefs: true
});
const rootSplitDeltaWrites = rootSplitStorage.writeLog.slice(rootSplitWriteStart);
assert.equal(
  rootSplitDeltaWrites.includes(continuityRootKey),
  false,
  'unchanged large materialized-head root must not be rewritten when another root changes'
);
assert.equal(
  rootSplitDeltaWrites.includes(rootSplitAliasKey),
  true,
  'real materialized-head root changes must refresh the stable head alias'
);

const activeSaveManifestHash = (await loadV2SaveManifest(adapter, { campaignId, saveId })).hash;
const coreResult = await commitV2SaveLayout(adapter, {
  campaignId,
  saveId,
  branchId: 'main',
  layout: 'core',
  now: '2026-06-28T14:01:00.000Z',
  head: {
    coreStore: {
      test: true
    }
  },
  eventSegments: [[{ id: 'core-event-1', kind: 'directive.coreEvent.v1', type: 'turnObserved' }]]
});
assert.equal(
  storage.writeLog.includes(coreSaveManifestV2LogicalKey({ campaignId, saveId })),
  true,
  'CORE save manifest should use the CORE namespace'
);
assert.equal(
  storage.writeLog.indexOf(coreSaveManifestV2LogicalKey({ campaignId, saveId }))
    < storage.writeLog.indexOf(coreCampaignManifestV2LogicalKey(campaignId)),
  true,
  'CORE save manifest should be written before CORE campaign manifest pointer'
);
assert.equal(storage.writeLog.at(-1), coreCampaignManifestV2LogicalKey(campaignId), 'CORE campaign manifest should use the CORE namespace');
assert.notEqual(coreResult.refs.head.logicalKey, result.refs.head.logicalKey, 'CORE head ref must not overlap active-save head ref');
assert.equal(coreResult.saveManifest.layout, 'core');
assert.equal(coreResult.campaignManifest.layout, 'core');
assert.equal((await loadV2SaveManifest(adapter, { campaignId, saveId })).hash, activeSaveManifestHash, 'CORE commit must not rewrite active-save manifest');
assert.equal((await loadV2MaterializedHead(adapter, { campaignId, saveId })).state.player.name, 'Sam Vickers', 'CORE commit must not rewrite active-save head');
assert.equal((await loadV2MaterializedHead(adapter, { campaignId, saveId, layout: 'core' })).coreStore.test, true);
assert.equal((await loadV2SaveManifest(adapter, { campaignId, saveId, layout: 'core' })).eventSegments.length, 1);

const coreManifestBeforeCheckpointAppend = await loadV2SaveManifest(adapter, { campaignId, saveId, layout: 'core' });
const coreCheckpointAppend = await commitV2EventTurnSegments(adapter, {
  campaignId,
  saveId,
  layout: 'core',
  now: '2026-06-28T14:01:30.000Z',
  eventSegments: [[{ id: 'core-event-2', type: 'mechanicsCommitted' }]],
  turnSegments: [[{ id: 'core-turn-2', turnId: 'turn-core-2', outcomeId: 'outcome-core-2' }]],
  checkpoints: [{
    checkpointId: 'core-mechanics-outcome-core-2',
    type: 'coreMechanicsPreOutcome',
    outcomeId: 'outcome-core-2',
    campaignState: { campaign: { id: campaignId }, marker: 'before-outcome-core-2' }
  }]
});
assert.equal(coreCheckpointAppend.refs.checkpoints.length, coreManifestBeforeCheckpointAppend.checkpoints.length + 1);
assert.equal(coreCheckpointAppend.refs.checkpoints.at(-1).logicalKey.endsWith('/core/checkpoints/core-mechanics-outcome-core-2.v2.json'), true);
const coreCheckpoint = await loadV2Checkpoint(adapter, {
  campaignId,
  saveId,
  checkpointId: 'core-mechanics-outcome-core-2',
  layout: 'core'
});
assert.equal(coreCheckpoint.checkpoint.outcomeId, 'outcome-core-2');
assert.equal(coreCheckpoint.checkpoint.campaignState.marker, 'before-outcome-core-2');
assert.equal((await loadV2SaveManifest(adapter, { campaignId, saveId, layout: 'core' })).checkpoints.at(-1).hash, coreCheckpointAppend.refs.checkpoints.at(-1).hash);
assert.equal((await loadV2SaveManifest(adapter, { campaignId, saveId })).hash, activeSaveManifestHash, 'CORE checkpoint append must not rewrite active-save manifest');

const rolloverChunks = chunkV2SegmentEntries({
  segmentType: 'event',
  campaignId,
  saveId,
  maxBytes: 850,
  createdAt: now,
  entries: Array.from({ length: 18 }, (_, index) => ({
    id: `large-${index}`,
    textHash: `hash-${index}`,
    summary: 'x'.repeat(180)
  }))
});
assert.equal(rolloverChunks.length > 1, true, 'bounded segment chunker should roll over');
for (const [index, entries] of rolloverChunks.entries()) {
  const segment = createV2SegmentRecord({
    segmentType: 'event',
    campaignId,
    saveId,
    segmentId: String(index).padStart(4, '0'),
    entries,
    createdAt: now
  });
  assert.equal(segment.byteLength <= 850, true);
}

await assert.rejects(
  () => writeV2Segment(adapter, {
    segmentType: 'event',
    campaignId,
    saveId,
    segmentId: 'oversize',
    entries: [{ id: 'too-large', summary: 'x'.repeat(1000) }],
    maxBytes: 300,
    createdAt: now
  }),
  /exceeds 300 bytes/
);

const corruptStorage = createLoggingStorage({
  corruptOnWrite(filePath, value) {
    if (filePath.includes('/head-roots/player-')) {
      value.value.name = 'Corrupted After Hash';
    }
  }
});
const corruptAdapter = createLogicalStorageAdapter({ storage: corruptStorage, hostId: 'fake' });
await assert.rejects(
  () => commitV2SaveLayout(corruptAdapter, {
    campaignId: 'campaign-corrupt',
    saveId: 'save-corrupt',
    now,
    head: {
      state: {
        player: { name: 'Original' }
      }
    },
    eventSegments: [[{ id: 'event-1', type: 'turnEvent' }]]
  }),
  (error) => error?.code === 'DIRECTIVE_V2_ARTIFACT_HASH_MISMATCH'
);
assert.equal(
  corruptStorage.writeLog.some((path) => path.endsWith('/save-manifest.v2.json') || path.endsWith('/campaign-manifest.v2.json')),
  false,
  'manifest pointers should not be written after blob hash verification fails'
);

let corruptReusedTailWrite = false;
const corruptReuseStorage = createLoggingStorage({
  corruptOnWrite(filePath, value) {
    if (corruptReusedTailWrite && filePath.includes('/events/0000')) {
      value.entries.push({ id: 'corrupted-after-hash' });
    }
  }
});
const corruptReuseAdapter = createLogicalStorageAdapter({ storage: corruptReuseStorage, hostId: 'fake' });
await commitV2SaveLayout(corruptReuseAdapter, {
  campaignId: 'campaign-corrupt-reuse',
  saveId: 'save-corrupt-reuse',
  now,
  head: {
    state: {
      player: { name: 'Original' }
    }
  },
  eventSegments: [[{ id: 'event-1', type: 'turnEvent' }]]
});
const corruptReuseWriteStart = corruptReuseStorage.writeLog.length;
corruptReusedTailWrite = true;
await assert.rejects(
  () => commitV2SaveLayout(corruptReuseAdapter, {
    campaignId: 'campaign-corrupt-reuse',
    saveId: 'save-corrupt-reuse',
    now: '2026-06-28T14:02:00.000Z',
    reuseExistingSegmentRefs: true,
    head: {
      state: {
        player: { name: 'Still Original' }
      }
    },
    eventSegments: [[
      { id: 'event-1', type: 'turnEvent' },
      { id: 'event-2', type: 'turnEvent' }
    ]]
  }),
  (error) => error?.code === 'DIRECTIVE_V2_ARTIFACT_HASH_MISMATCH'
);
assert.equal(
  corruptReuseStorage.writeLog
    .slice(corruptReuseWriteStart)
    .some((path) => path.endsWith('/save-manifest.v2.json') || path.endsWith('/campaign-manifest.v2.json')),
  false,
  'manifest pointers should not be written after reused-tail blob hash verification fails'
);

const appendStorage = createLoggingStorage();
const appendAdapter = createLogicalStorageAdapter({ storage: appendStorage, hostId: 'fake' });
const appendInitial = await commitV2SaveLayout(appendAdapter, {
  campaignId: 'campaign-append-delta',
  saveId: 'save-append-delta',
  now,
  head: {
    state: {
      player: { name: 'Sam Vickers' }
    }
  },
  eventSegments: [Array.from({ length: 14 }, (_, index) => ({
    id: `append-event-${index + 1}`,
    type: 'turnEvent',
    summary: `append event ${index + 1} ${'x'.repeat(140)}`
  }))],
  turnSegments: [[{ id: 'append-turn-1', turnId: 'turn-1', outcomeId: 'outcome-1' }]],
  segmentMaxBytes: {
    event: 1200,
    turn: 1200
  }
});
assert.equal(appendInitial.refs.eventSegments.length > 1, true, 'append delta fixture should have sealed event history');
const appendInitialManifest = await loadV2SaveManifest(appendAdapter, {
  campaignId: 'campaign-append-delta',
  saveId: 'save-append-delta'
});
const appendSealedEventRefs = appendInitialManifest.eventSegments.slice(0, -1);
const appendOldTailRef = appendInitialManifest.eventSegments.at(-1);
const appendOldTail = await readV2ArtifactRef(appendAdapter, appendOldTailRef);
const appendReadStart = appendStorage.readLog.length;
const appendWriteStart = appendStorage.writeLog.length;
const appendResult = await commitV2EventTurnSegments(appendAdapter, {
  campaignId: 'campaign-append-delta',
  saveId: 'save-append-delta',
  now: '2026-06-28T14:03:00.000Z',
  eventSegments: [[{ id: 'append-event-hot', type: 'turnEvent', summary: `hot append ${'x'.repeat(120)}` }]],
  turnSegments: [[{ id: 'append-turn-hot', turnId: 'turn-hot', outcomeId: 'outcome-hot' }]],
  segmentMaxBytes: {
    event: 1200,
    turn: 1200
  }
});
const appendReadKeys = appendStorage.readLog.slice(appendReadStart);
const appendWriteKeys = appendStorage.writeLog.slice(appendWriteStart);
const appendSealedKeys = new Set(appendSealedEventRefs.map((ref) => ref.logicalKey));
assert.deepEqual(appendReadKeys.filter((key) => appendSealedKeys.has(key)), [], 'append delta must not read sealed event history');
assert.deepEqual(appendWriteKeys.filter((key) => appendSealedKeys.has(key)), [], 'append delta must not write sealed event history');
assert.equal(appendWriteKeys.includes(appendOldTailRef.logicalKey), false, 'append delta must not overwrite the old event tail key');
assert.notEqual(appendResult.refs.eventSegments.at(-1).logicalKey, appendOldTailRef.logicalKey, 'append delta should publish a changed tail through a versioned/new key');
assert.deepEqual(await readV2ArtifactRef(appendAdapter, appendOldTailRef), appendOldTail, 'old event tail must remain readable after append delta');
const appendManifestAfter = await loadV2SaveManifest(appendAdapter, {
  campaignId: 'campaign-append-delta',
  saveId: 'save-append-delta'
});
for (const [index, ref] of appendSealedEventRefs.entries()) {
  assert.deepEqual(appendManifestAfter.eventSegments[index], ref, `append delta must preserve sealed event ref ${index}`);
}
assert.equal(appendWriteKeys.at(-2), appendResult.saveManifestRef.logicalKey, 'append delta save manifest should be the penultimate pointer write');
assert.equal(appendWriteKeys.at(-1), appendResult.campaignManifestRef.logicalKey, 'append delta campaign manifest should be final pointer write');

const identicalDiagnosticsStorage = createLoggingStorage();
const identicalDiagnosticsAdapter = createLogicalStorageAdapter({ storage: identicalDiagnosticsStorage, hostId: 'fake' });
const identicalDiagnosticEntry = {
  id: 'runtime-persistence-summary',
  type: 'runtimePersistenceSummary',
  status: 'ok',
  runtimeSummary: {
    ingressCount: 1,
    responseCount: 0
  }
};
const identicalDiagnosticsInitial = await commitV2SaveLayout(identicalDiagnosticsAdapter, {
  campaignId: 'campaign-identical-diagnostics',
  saveId: 'save-identical-diagnostics',
  now,
  head: {
    state: {
      player: { name: 'Sam Vickers' }
    }
  },
  diagnosticsSegments: [[identicalDiagnosticEntry]],
  reuseExistingSegmentRefs: true
});
const changedDiagnosticEntry = {
  ...identicalDiagnosticEntry,
  runtimeSummary: {
    ingressCount: 1,
    responseCount: 1
  }
};
const changedDiagnostics = await commitV2SaveLayout(identicalDiagnosticsAdapter, {
  campaignId: 'campaign-identical-diagnostics',
  saveId: 'save-identical-diagnostics',
  now: '2026-06-28T14:03:30.000Z',
  head: {
    state: {
      player: { name: 'Sam Vickers' }
    }
  },
  diagnosticsSegments: [[changedDiagnosticEntry]],
  reuseExistingSegmentRefs: true
});
assert.notDeepEqual(
  changedDiagnostics.refs.diagnosticsSegments,
  identicalDiagnosticsInitial.refs.diagnosticsSegments,
  'changed diagnostics should publish one changed segment ref'
);
assert.equal(
  identicalDiagnosticsStorage.deleteLog.includes(identicalDiagnosticsInitial.refs.diagnosticsSegments[0].logicalKey),
  true,
  'changed replacement diagnostics should delete the superseded diagnostics segment after manifest publish'
);
assert.equal(
  Object.keys(identicalDiagnosticsStorage.snapshot()).filter((key) => key.includes('/diagnostics/')).length,
  1,
  'replacement diagnostics should not accumulate orphaned diagnostics segment files'
);
const identicalDiagnosticsWriteStart = identicalDiagnosticsStorage.writeLog.length;
const identicalDiagnosticsRepeat = await commitV2SaveLayout(identicalDiagnosticsAdapter, {
  campaignId: 'campaign-identical-diagnostics',
  saveId: 'save-identical-diagnostics',
  now: '2026-06-28T14:03:31.000Z',
  head: {
    state: {
      player: { name: 'Sam Vickers' }
    }
  },
  diagnosticsSegments: [[changedDiagnosticEntry]],
  reuseExistingSegmentRefs: true
});
const identicalDiagnosticsRepeatWrites = identicalDiagnosticsStorage.writeLog.slice(identicalDiagnosticsWriteStart);
assert.deepEqual(
  identicalDiagnosticsRepeat.refs.diagnosticsSegments,
  changedDiagnostics.refs.diagnosticsSegments,
  'unchanged versioned diagnostics segments should reuse the existing ref instead of publishing timestamp-only variants'
);
assert.equal(
  identicalDiagnosticsRepeatWrites.some((key) => key.includes('/diagnostics/')),
  false,
  'unchanged diagnostics repersist must not write another diagnostics segment file'
);

const diagnosticsInterleaveCampaignId = 'campaign-diagnostics-interleave';
const diagnosticsInterleaveSaveId = 'save-diagnostics-interleave';
const diagnosticsInterleaveStorage = createLoggingStorage();
const diagnosticsInterleaveAdapter = createLogicalStorageAdapter({ storage: diagnosticsInterleaveStorage, hostId: 'fake' });
await commitV2SaveLayout(diagnosticsInterleaveAdapter, {
  campaignId: diagnosticsInterleaveCampaignId,
  saveId: diagnosticsInterleaveSaveId,
  now,
  head: {
    state: {
      player: { name: 'Sam Vickers' }
    }
  },
  eventSegments: [[{ id: 'event-before-interleave', type: 'turnEvent' }]],
  turnSegments: [[{ id: 'turn-before-interleave', turnId: 'turn-before', outcomeId: 'outcome-before' }]],
  diagnosticsSegments: [[{
    id: 'diag-before-interleave',
    type: 'sidecar',
    status: 'running'
  }]]
});
await Promise.all([
  commitV2EventTurnSegments(diagnosticsInterleaveAdapter, {
    campaignId: diagnosticsInterleaveCampaignId,
    saveId: diagnosticsInterleaveSaveId,
    now: '2026-06-28T14:04:02.000Z',
    eventSegments: [[{ id: 'event-after-interleave', type: 'turnEvent' }]],
    turnSegments: [[{ id: 'turn-after-interleave', turnId: 'turn-after', outcomeId: 'outcome-after' }]]
  }),
  commitV2DiagnosticsSegments(diagnosticsInterleaveAdapter, {
    campaignId: diagnosticsInterleaveCampaignId,
    saveId: diagnosticsInterleaveSaveId,
    now: '2026-06-28T14:04:01.000Z',
    diagnosticsSegments: [[{
      id: 'diag-interleaved',
      type: 'sidecar',
      status: 'queued'
    }]]
  })
]);
const diagnosticsInterleaveManifest = await loadV2SaveManifest(diagnosticsInterleaveAdapter, {
  campaignId: diagnosticsInterleaveCampaignId,
  saveId: diagnosticsInterleaveSaveId
});
const diagnosticsInterleaveEntries = (await Promise.all(diagnosticsInterleaveManifest.diagnosticsSegments.map((ref) => readV2ArtifactRef(diagnosticsInterleaveAdapter, ref))))
  .flatMap((segment) => segment.entries || []);
assert.deepEqual(
  diagnosticsInterleaveEntries.map((entry) => entry.id),
  ['diag-before-interleave', 'diag-interleaved'],
  'concurrent event/turn and diagnostics appends must preserve diagnostics refs'
);
assert.equal(
  diagnosticsInterleaveManifest.eventSegments.length >= 1,
  true,
  'concurrent event/turn and diagnostics appends must preserve event refs'
);

const diagnosticsRepairCampaignId = 'campaign-diagnostics-repair';
const diagnosticsRepairSaveId = 'save-diagnostics-repair';
const diagnosticsRepairStorage = createLoggingStorage();
const diagnosticsRepairAdapter = createLogicalStorageAdapter({ storage: diagnosticsRepairStorage, hostId: 'fake' });
await commitV2SaveLayout(diagnosticsRepairAdapter, {
  campaignId: diagnosticsRepairCampaignId,
  saveId: diagnosticsRepairSaveId,
  now,
  head: {
    state: {
      player: { name: 'Sam Vickers' }
    }
  },
  diagnosticsSegments: [[{
    id: 'diag-repair-before',
    type: 'sidecar',
    status: 'before'
  }]]
});
const diagnosticsRepairStaleManifest = await loadV2SaveManifest(diagnosticsRepairAdapter, {
  campaignId: diagnosticsRepairCampaignId,
  saveId: diagnosticsRepairSaveId
});
const missingRecentDiagnostic = {
  id: 'diag-repair-missing-recent',
  type: 'sidecar',
  status: 'queued'
};
await commitV2DiagnosticsSegments(diagnosticsRepairAdapter, {
  campaignId: diagnosticsRepairCampaignId,
  saveId: diagnosticsRepairSaveId,
  now: '2026-06-28T14:05:01.000Z',
  diagnosticsSegments: [[missingRecentDiagnostic]]
});
await diagnosticsRepairAdapter.writeJson(
  saveManifestV2LogicalKey({
    campaignId: diagnosticsRepairCampaignId,
    saveId: diagnosticsRepairSaveId
  }),
  diagnosticsRepairStaleManifest
);
const currentRecentDiagnostic = {
  id: 'diag-repair-current',
  type: 'sidecar',
  status: 'running'
};
await commitV2DiagnosticsSegments(diagnosticsRepairAdapter, {
  campaignId: diagnosticsRepairCampaignId,
  saveId: diagnosticsRepairSaveId,
  now: '2026-06-28T14:05:02.000Z',
  diagnosticsSegments: [[currentRecentDiagnostic]],
  recentDiagnostics: [missingRecentDiagnostic, currentRecentDiagnostic]
});
const diagnosticsRepairManifest = await loadV2SaveManifest(diagnosticsRepairAdapter, {
  campaignId: diagnosticsRepairCampaignId,
  saveId: diagnosticsRepairSaveId
});
const diagnosticsRepairEntries = (await Promise.all(diagnosticsRepairManifest.diagnosticsSegments.map((ref) => readV2ArtifactRef(diagnosticsRepairAdapter, ref))))
  .flatMap((segment) => segment.entries || []);
assert.deepEqual(
  diagnosticsRepairEntries.map((entry) => entry.id),
  ['diag-repair-before', 'diag-repair-missing-recent', 'diag-repair-current'],
  'diagnostics append must repair recent diagnostics missing from a stale manifest tail'
);

const diagnosticsBurstCampaignId = 'campaign-diagnostics-burst';
const diagnosticsBurstSaveId = 'save-diagnostics-burst';
const diagnosticsBurstStorage = createLoggingStorage();
const diagnosticsBurstAdapter = createLogicalStorageAdapter({ storage: diagnosticsBurstStorage, hostId: 'fake' });
await commitV2SaveLayout(diagnosticsBurstAdapter, {
  campaignId: diagnosticsBurstCampaignId,
  saveId: diagnosticsBurstSaveId,
  now,
  head: {
    state: {
      player: { name: 'Sam Vickers' }
    }
  }
});
const diagnosticsBurstWriteStart = diagnosticsBurstStorage.writeLog.length;
for (let index = 0; index < 12; index += 1) {
  await commitV2DiagnosticsSegments(diagnosticsBurstAdapter, {
    campaignId: diagnosticsBurstCampaignId,
    saveId: diagnosticsBurstSaveId,
    now: `2026-06-28T14:06:${String(index).padStart(2, '0')}.000Z`,
    diagnosticsSegments: [[{
      id: `diag-burst-${index}`,
      type: 'sidecar',
      status: 'queued',
      payloadHash: `hash-${index}`
    }]]
  });
}
const diagnosticsBurstWrites = diagnosticsBurstStorage.writeLog
  .slice(diagnosticsBurstWriteStart)
  .filter((key) => key.includes('/diagnostics/'));
const diagnosticsBurstSnapshot = diagnosticsBurstStorage.snapshot();
const diagnosticsBurstRecords = diagnosticsBurstWrites.map((key) => diagnosticsBurstSnapshot[key]);
assert.equal(diagnosticsBurstWrites.length, 12, 'diagnostics burst should write one bounded segment per append');
assert.equal(
  Math.max(...diagnosticsBurstRecords.map((record) => Number(record.entryCount || 0))),
  1,
  'diagnostics burst must not republish a growing diagnostics tail'
);
const diagnosticsBurstManifest = await loadV2SaveManifest(diagnosticsBurstAdapter, {
  campaignId: diagnosticsBurstCampaignId,
  saveId: diagnosticsBurstSaveId
});
assert.equal(
  diagnosticsBurstManifest.diagnosticsSegments.length,
  12,
  'diagnostics burst should retain each bounded appended diagnostics segment ref'
);

console.log('Transaction store v2 tests passed.');
