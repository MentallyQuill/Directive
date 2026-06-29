import assert from 'node:assert/strict';

import { createLogicalStorageAdapter } from '../../src/storage/logical-storage-adapter.mjs';
import {
  campaignManifestV2LogicalKey,
  coreCampaignManifestV2LogicalKey,
  coreSaveManifestV2LogicalKey,
  saveManifestV2LogicalKey
} from '../../src/storage/logical-storage-paths.mjs';
import {
  chunkV2SegmentEntries,
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

function createLoggingStorage({ corruptOnWrite = null } = {}) {
  const files = new Map();
  const writeLog = [];
  const readLog = [];
  return {
    writeLog,
    readLog,
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
      return cloneJson(files.get(filePath));
    },
    async writeJson(filePath, value) {
      writeLog.push(filePath);
      const next = cloneJson(value);
      if (typeof corruptOnWrite === 'function') corruptOnWrite(filePath, next);
      files.set(filePath, next);
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

assert.equal(storage.writeLog.at(-2), saveManifestV2LogicalKey({ campaignId, saveId }), 'save manifest should be written after blobs');
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
assert.equal(storage.writeLog.at(-2), coreSaveManifestV2LogicalKey({ campaignId, saveId }), 'CORE save manifest should use the CORE namespace');
assert.equal(storage.writeLog.at(-1), coreCampaignManifestV2LogicalKey(campaignId), 'CORE campaign manifest should use the CORE namespace');
assert.notEqual(coreResult.refs.head.logicalKey, result.refs.head.logicalKey, 'CORE head ref must not overlap active-save head ref');
assert.equal(coreResult.saveManifest.layout, 'core');
assert.equal(coreResult.campaignManifest.layout, 'core');
assert.equal((await loadV2SaveManifest(adapter, { campaignId, saveId })).hash, activeSaveManifestHash, 'CORE commit must not rewrite active-save manifest');
assert.equal((await loadV2MaterializedHead(adapter, { campaignId, saveId })).state.player.name, 'Sam Vickers', 'CORE commit must not rewrite active-save head');
assert.equal((await loadV2MaterializedHead(adapter, { campaignId, saveId, layout: 'core' })).coreStore.test, true);
assert.equal((await loadV2SaveManifest(adapter, { campaignId, saveId, layout: 'core' })).eventSegments.length, 1);

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
    if (filePath.endsWith('/head.v2.json')) {
      value.state.player.name = 'Corrupted After Hash';
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

console.log('Transaction store v2 tests passed.');
