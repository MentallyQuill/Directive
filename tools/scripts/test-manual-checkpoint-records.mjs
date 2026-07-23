import assert from 'node:assert/strict';

import {
  checkpointOperationLogicalKey,
  manualCheckpointIndexLogicalKey,
  manualCheckpointLogicalKey
} from '../../src/storage/logical-storage-paths.mjs';
import {
  CHECKPOINT_OPERATION_STAGES,
  advanceCheckpointOperation,
  createCheckpointOperation,
  createManualCheckpointRecord,
  deleteManualCheckpoint,
  listManualCheckpoints,
  loadCheckpointOperation,
  requireManualCheckpoint,
  storeCheckpointOperation,
  storeManualCheckpoint
} from '../../src/storage/manual-checkpoint-records.mjs';

function createMemoryAdapter() {
  const files = new Map();
  return {
    files,
    async readJson(key) {
      if (!files.has(key)) {
        const error = new Error(`Missing ${key}`);
        error.code = 'ENOENT';
        throw error;
      }
      return structuredClone(files.get(key));
    },
    async writeJson(key, value) {
      files.set(key, structuredClone(value));
    },
    async deleteJson(key) {
      return files.delete(key);
    }
  };
}

assert.equal(manualCheckpointIndexLogicalKey('campaign-1'), 'campaigns/campaign-1/manual-checkpoints/index.v1.json');
assert.equal(manualCheckpointLogicalKey({ campaignId: 'campaign-1', checkpointId: 'checkpoint-1' }), 'campaigns/campaign-1/manual-checkpoints/checkpoint-1.v1.json');
assert.equal(checkpointOperationLogicalKey({ campaignId: 'campaign-1', operationId: 'operation-1' }), 'campaigns/campaign-1/checkpoint-operations/operation-1.v1.json');

const record = createManualCheckpointRecord({
  id: 'checkpoint-1',
  campaignId: 'campaign-1',
  sourceSaveId: 'save-active',
  name: 'Before the Distress Call',
  createdAt: '2026-07-22T18:00:00.000Z',
  preservedChatBinding: {
    hostId: 'sillytavern',
    chatId: 'checkpoint-chat',
    entityType: 'character',
    entityId: '42'
  },
  coreAuthority: {
    campaignId: 'campaign-1',
    saveId: 'save-active',
    checkpointId: 'core-checkpoint-1'
  },
  summary: {
    chapter: 'Prelude',
    stardate: '53049.2'
  }
});
assert.equal(record.kind, 'directive.manualCheckpoint.v1');
assert.equal(record.immutable, true);
assert.equal(record.preservedChatBinding.chatId, 'checkpoint-chat');
assert.equal(record.coreAuthority.checkpointId, 'core-checkpoint-1');

assert.throws(
  () => createManualCheckpointRecord({ ...record, kind: 'directive.campaignSave' }),
  /kind must be directive\.manualCheckpoint\.v1/
);

const adapter = createMemoryAdapter();
await storeManualCheckpoint(adapter, record);
await storeManualCheckpoint(adapter, record);
assert.deepEqual((await listManualCheckpoints(adapter, { campaignId: 'campaign-1' })).map((item) => item.id), ['checkpoint-1']);
assert.equal((await requireManualCheckpoint(adapter, { campaignId: 'campaign-1', checkpointId: 'checkpoint-1' })).name, 'Before the Distress Call');

await assert.rejects(
  () => storeManualCheckpoint(adapter, { ...record, name: 'Mutated Name' }),
  /immutable checkpoint/i
);

const operation = createCheckpointOperation({
  id: 'operation-1',
  campaignId: 'campaign-1',
  kind: 'save',
  checkpointId: 'checkpoint-1',
  sourceSaveId: 'save-active',
  createdAt: '2026-07-22T18:00:00.000Z'
});
assert.deepEqual(CHECKPOINT_OPERATION_STAGES, [
  'sourceGuard',
  'chatClone',
  'coreAuthority',
  'checkpointRecord',
  'bindingWrite',
  'promptRebuild',
  'openChat',
  'complete'
]);
assert.equal(operation.stage, 'sourceGuard');
await storeCheckpointOperation(adapter, operation);
const advanced = await advanceCheckpointOperation(adapter, operation, {
  stage: 'chatClone',
  result: { chatId: 'checkpoint-chat' },
  updatedAt: '2026-07-22T18:01:00.000Z'
});
assert.equal(advanced.stage, 'chatClone');
assert.equal((await loadCheckpointOperation(adapter, { campaignId: 'campaign-1', operationId: 'operation-1' })).results.chatClone.chatId, 'checkpoint-chat');
await assert.rejects(
  () => advanceCheckpointOperation(adapter, advanced, { stage: 'sourceGuard' }),
  /cannot move backward/i
);

const deletion = await deleteManualCheckpoint(adapter, {
  campaignId: 'campaign-1',
  checkpointId: 'checkpoint-1'
});
assert.equal(deletion.deleted, true);
assert.deepEqual(await listManualCheckpoints(adapter, { campaignId: 'campaign-1' }), []);

console.log('Manual checkpoint record tests passed.');
