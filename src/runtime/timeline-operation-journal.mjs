import { V1_STORAGE_PATHS } from '../storage/v1-storage-repository.mjs';

export const V1_TIMELINE_OPERATION_KIND = 'directive.timelineOperation.v1';
export const V1_TIMELINE_OPERATION_STAGES = Object.freeze([
  'detected',
  'parent-preserved',
  'child-derived',
  'child-persisted',
  'child-binding-written',
  'active-pointer-switched',
  'prompt-ready',
  'parent-record-retired',
  'completed'
]);

const TYPES = new Set(['native-branch', 'load-game']);
const STAGES = new Set(V1_TIMELINE_OPERATION_STAGES);

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function object(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function required(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function missing(error) {
  return error?.code === 'ENOENT' || error?.name === 'NotFoundError' || /not found|missing/i.test(String(error?.message || ''));
}

export function assertTimelineOperation(operation) {
  if (!object(operation) || operation.kind !== V1_TIMELINE_OPERATION_KIND || operation.version !== 1) {
    throw new Error('Timeline operation kind and version are invalid.');
  }
  for (const field of ['operationId', 'campaignId', 'parentSaveId', 'childSaveId', 'checkpointId', 'createdAt', 'updatedAt']) {
    required(operation[field], field);
  }
  if (!TYPES.has(operation.operationType)) throw new Error('Timeline operation type is invalid.');
  if (!STAGES.has(operation.stage)) throw new Error('Timeline operation stage is invalid.');
  if (!object(operation.parentBinding) || !object(operation.childBinding)) throw new Error('Timeline operation bindings are required.');
  if (!object(operation.diagnostics)) throw new Error('Timeline operation diagnostics must be an object.');
  return operation;
}

export async function storeTimelineOperation(adapter, operation) {
  const record = clone(assertTimelineOperation(operation));
  await adapter.writeJson(V1_STORAGE_PATHS.timelineOperation(record.campaignId), record);
  return clone(record);
}

export async function loadTimelineOperation(adapter, campaignId) {
  const path = V1_STORAGE_PATHS.timelineOperation(required(campaignId, 'campaignId'));
  try {
    const record = await adapter.readJson(path);
    return record == null ? null : clone(assertTimelineOperation(record));
  } catch (error) {
    if (missing(error)) return null;
    throw error;
  }
}

export async function deleteTimelineOperation(adapter, campaignId) {
  const path = V1_STORAGE_PATHS.timelineOperation(required(campaignId, 'campaignId'));
  const deleter = adapter.deleteJsonFile || adapter.deleteJson;
  if (typeof deleter !== 'function') throw new Error('Timeline operation storage does not support deletion.');
  try {
    await deleter.call(adapter, path);
    return { deleted: true, path };
  } catch (error) {
    if (missing(error)) return { deleted: false, path };
    throw error;
  }
}
