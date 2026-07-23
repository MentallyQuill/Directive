import {
  checkpointOperationLogicalKey,
  manualCheckpointIndexLogicalKey,
  manualCheckpointLogicalKey
} from './logical-storage-paths.mjs';

export const CHECKPOINT_OPERATION_STAGES = Object.freeze([
  'sourceGuard',
  'chatClone',
  'coreAuthority',
  'checkpointRecord',
  'bindingWrite',
  'promptRebuild',
  'openChat',
  'complete'
]);

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function requireString(value, label) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${label} must be a non-empty string`);
  return text;
}

function isMissing(error) {
  return error?.code === 'ENOENT'
    || error?.status === 404
    || /not found|missing/i.test(String(error?.message || ''));
}

async function readOrNull(adapter, key) {
  requireObject(adapter, 'storage adapter');
  if (typeof adapter.readJson !== 'function') throw new Error('storage adapter must provide readJson(path)');
  try {
    return cloneJson(await adapter.readJson(key));
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

async function write(adapter, key, value) {
  requireObject(adapter, 'storage adapter');
  if (typeof adapter.writeJson !== 'function') throw new Error('storage adapter must provide writeJson(path, value)');
  await adapter.writeJson(key, cloneJson(value));
  return cloneJson(value);
}

async function remove(adapter, key) {
  const deleteJson = adapter?.deleteJsonFile || adapter?.deleteJson;
  if (typeof deleteJson !== 'function') return false;
  try {
    return (await deleteJson.call(adapter, key)) !== false;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

function checkpointIndex(campaignId, createdAt) {
  return {
    kind: 'directive.manualCheckpointIndex.v1',
    schemaVersion: 1,
    campaignId,
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    checkpoints: {}
  };
}

function checkpointListEntry(record) {
  return {
    id: record.id,
    kind: record.kind,
    campaignId: record.campaignId,
    name: record.name,
    sourceSaveId: record.sourceSaveId,
    createdAt: record.createdAt,
    summary: cloneJson(record.summary || {}),
    path: manualCheckpointLogicalKey({
      campaignId: record.campaignId,
      checkpointId: record.id
    })
  };
}

export function createManualCheckpointRecord(value = {}) {
  if (value.kind !== undefined && value.kind !== 'directive.manualCheckpoint.v1') {
    throw new Error('kind must be directive.manualCheckpoint.v1');
  }
  const record = {
    kind: 'directive.manualCheckpoint.v1',
    schemaVersion: 1,
    immutable: true,
    id: requireString(value.id, 'id'),
    campaignId: requireString(value.campaignId, 'campaignId'),
    sourceSaveId: requireString(value.sourceSaveId, 'sourceSaveId'),
    name: requireString(value.name, 'name'),
    createdAt: requireString(value.createdAt, 'createdAt'),
    preservedChatBinding: cloneJson(requireObject(value.preservedChatBinding, 'preservedChatBinding')),
    coreAuthority: cloneJson(requireObject(value.coreAuthority, 'coreAuthority')),
    summary: cloneJson(value.summary || {})
  };
  requireString(record.preservedChatBinding.chatId, 'preservedChatBinding.chatId');
  requireString(record.coreAuthority.checkpointId, 'coreAuthority.checkpointId');
  return record;
}

export async function storeManualCheckpoint(adapter, value) {
  const record = createManualCheckpointRecord(value);
  const key = manualCheckpointLogicalKey({
    campaignId: record.campaignId,
    checkpointId: record.id
  });
  const existing = await readOrNull(adapter, key);
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(record)) {
      throw new Error(`Cannot mutate immutable checkpoint "${record.id}"`);
    }
    return existing;
  }
  await write(adapter, key, record);
  const indexKey = manualCheckpointIndexLogicalKey(record.campaignId);
  const index = await readOrNull(adapter, indexKey) || checkpointIndex(record.campaignId, record.createdAt);
  index.revision = Math.max(1, Number(index.revision) || 1) + 1;
  index.updatedAt = record.createdAt;
  index.checkpoints = index.checkpoints && typeof index.checkpoints === 'object'
    ? index.checkpoints
    : {};
  index.checkpoints[record.id] = checkpointListEntry(record);
  await write(adapter, indexKey, index);
  return record;
}

export async function listManualCheckpoints(adapter, { campaignId } = {}) {
  const id = requireString(campaignId, 'campaignId');
  const index = await readOrNull(adapter, manualCheckpointIndexLogicalKey(id));
  return Object.values(index?.checkpoints || {})
    .filter((entry) => entry?.kind === 'directive.manualCheckpoint.v1')
    .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')))
    .map(cloneJson);
}

export async function requireManualCheckpoint(adapter, { campaignId, checkpointId } = {}) {
  const key = manualCheckpointLogicalKey({
    campaignId: requireString(campaignId, 'campaignId'),
    checkpointId: requireString(checkpointId, 'checkpointId')
  });
  const record = await readOrNull(adapter, key);
  if (!record || record.kind !== 'directive.manualCheckpoint.v1') {
    throw new Error(`Manual checkpoint "${checkpointId}" does not exist`);
  }
  return createManualCheckpointRecord(record);
}

export async function deleteManualCheckpoint(adapter, { campaignId, checkpointId } = {}) {
  const campaign = requireString(campaignId, 'campaignId');
  const checkpoint = requireString(checkpointId, 'checkpointId');
  const indexKey = manualCheckpointIndexLogicalKey(campaign);
  const index = await readOrNull(adapter, indexKey);
  const indexed = Boolean(index?.checkpoints?.[checkpoint]);
  const deleted = await remove(adapter, manualCheckpointLogicalKey({
    campaignId: campaign,
    checkpointId: checkpoint
  }));
  if (indexed) {
    delete index.checkpoints[checkpoint];
    index.revision = Math.max(1, Number(index.revision) || 1) + 1;
    index.updatedAt = new Date().toISOString();
    await write(adapter, indexKey, index);
  }
  return {
    kind: 'directive.manualCheckpointDeleteResult.v1',
    campaignId: campaign,
    checkpointId: checkpoint,
    indexed,
    deleted
  };
}

export function createCheckpointOperation(value = {}) {
  const kind = requireString(value.kind, 'kind');
  if (!['save', 'load', 'delete'].includes(kind)) {
    throw new Error('kind must be save, load, or delete');
  }
  return {
    kind: 'directive.checkpointOperation.v1',
    schemaVersion: 1,
    id: requireString(value.id, 'id'),
    campaignId: requireString(value.campaignId, 'campaignId'),
    operationKind: kind,
    checkpointId: requireString(value.checkpointId, 'checkpointId'),
    sourceSaveId: value.sourceSaveId ? requireString(value.sourceSaveId, 'sourceSaveId') : null,
    targetSaveId: value.targetSaveId ? requireString(value.targetSaveId, 'targetSaveId') : null,
    stage: 'sourceGuard',
    status: 'pending',
    createdAt: requireString(value.createdAt, 'createdAt'),
    updatedAt: requireString(value.createdAt, 'createdAt'),
    results: {}
  };
}

export async function storeCheckpointOperation(adapter, operation) {
  requireObject(operation, 'operation');
  if (operation.kind !== 'directive.checkpointOperation.v1') {
    throw new Error('operation must be directive.checkpointOperation.v1');
  }
  const key = checkpointOperationLogicalKey({
    campaignId: requireString(operation.campaignId, 'campaignId'),
    operationId: requireString(operation.id, 'operation.id')
  });
  const existing = await readOrNull(adapter, key);
  if (existing && JSON.stringify(existing) !== JSON.stringify(operation)) {
    throw new Error(`Checkpoint operation "${operation.id}" already exists with different data`);
  }
  return existing || write(adapter, key, operation);
}

export async function loadCheckpointOperation(adapter, { campaignId, operationId } = {}) {
  return readOrNull(adapter, checkpointOperationLogicalKey({
    campaignId: requireString(campaignId, 'campaignId'),
    operationId: requireString(operationId, 'operationId')
  }));
}

export async function advanceCheckpointOperation(adapter, operation, {
  stage,
  result = null,
  updatedAt = new Date().toISOString()
} = {}) {
  requireObject(operation, 'operation');
  const currentIndex = CHECKPOINT_OPERATION_STAGES.indexOf(operation.stage);
  const nextIndex = CHECKPOINT_OPERATION_STAGES.indexOf(stage);
  if (nextIndex < 0) throw new Error(`Unknown checkpoint operation stage "${stage}"`);
  if (nextIndex < currentIndex) throw new Error('Checkpoint operation cannot move backward');
  const next = {
    ...cloneJson(operation),
    stage,
    status: stage === 'complete' ? 'complete' : 'pending',
    updatedAt,
    results: {
      ...(cloneJson(operation.results || {})),
      ...(result === null ? {} : { [stage]: cloneJson(result) })
    }
  };
  const key = checkpointOperationLogicalKey({
    campaignId: next.campaignId,
    operationId: next.id
  });
  await write(adapter, key, next);
  return next;
}
