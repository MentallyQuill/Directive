import {
  assertDirectiveLogicalStorageKey,
  createLogicalStorageMapper
} from './logical-storage-paths.mjs';

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function requireFunction(value, label) {
  if (typeof value !== 'function') {
    throw new Error(`${label} must be a function`);
  }
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

let nextStorageAdapterId = 0;

function createMissingMethodError(methodName) {
  const error = new Error(`Logical storage adapter backing store does not support ${methodName}`);
  error.code = 'DIRECTIVE_LOGICAL_STORAGE_UNSUPPORTED';
  error.methodName = methodName;
  return error;
}

function compactError(error) {
  return {
    message: error?.message || String(error || 'Unknown storage error'),
    code: error?.code || null,
    status: Number.isFinite(Number(error?.status)) ? Number(error.status) : null
  };
}

export function createLogicalStorageAdapter({
  storage,
  hostId = null,
  mapper = null,
  onProgress = null
} = {}) {
  requireObject(storage, 'storage');
  requireFunction(storage.readJson, 'storage.readJson');
  requireFunction(storage.writeJson, 'storage.writeJson');

  const resolvedMapper = mapper || createLogicalStorageMapper(hostId);
  requireObject(resolvedMapper, 'logical storage mapper');
  requireFunction(resolvedMapper.toPath, 'logical storage mapper.toPath');
  const resolvedHostId = resolvedMapper.hostId || hostId || 'unknown';
  const adapterInstanceId = `logical-storage-${++nextStorageAdapterId}`;
  let nextOperationId = 0;

  function toPath(logicalKey) {
    return resolvedMapper.toPath(assertDirectiveLogicalStorageKey(logicalKey));
  }

  function reportProgress(payload = {}) {
    if (typeof onProgress !== 'function') return;
    try {
      onProgress({
        kind: 'directive.storageProgress',
        source: 'logical-storage-adapter',
        hostId: resolvedHostId,
        ...payload
      });
    } catch (error) {
      console.warn?.('[Directive] Storage progress reporter failed:', error);
    }
  }

  function createOperation(logicalKey, operation) {
    const key = assertDirectiveLogicalStorageKey(logicalKey);
    return {
      operationId: `${adapterInstanceId}:${++nextOperationId}`,
      operation,
      logicalKey: key,
      path: toPath(key)
    };
  }

  async function runStorageOperation({ logicalKey, operation, startedPhase, completePhase, failedPhase, run }) {
    const details = createOperation(logicalKey, operation);
    reportProgress({
      ...details,
      phase: startedPhase,
      status: 'running'
    });
    try {
      const result = await run(details);
      reportProgress({
        ...details,
        phase: completePhase,
        status: 'complete'
      });
      return result;
    } catch (error) {
      reportProgress({
        ...details,
        phase: failedPhase,
        status: 'failed',
        error: compactError(error)
      });
      throw error;
    }
  }

  const adapter = {
    hostId: resolvedHostId,
    toPath,
    async readJson(logicalKey) {
      return cloneJson(await storage.readJson(toPath(logicalKey)));
    },
    async writeJson(logicalKey, value) {
      return runStorageOperation({
        logicalKey,
        operation: 'writeJson',
        startedPhase: 'storageWriteStarted',
        completePhase: 'storageWriteComplete',
        failedPhase: 'storageWriteFailed',
        run: ({ path }) => storage.writeJson(path, cloneJson(value))
      });
    },
    async verifyJsonFiles(logicalKeys = []) {
      if (typeof storage.verifyJsonFiles !== 'function') {
        throw createMissingMethodError('verifyJsonFiles');
      }
      const pairs = logicalKeys.map((logicalKey) => [
        assertDirectiveLogicalStorageKey(logicalKey),
        toPath(logicalKey)
      ]);
      const verified = await storage.verifyJsonFiles(pairs.map(([, physicalPath]) => physicalPath));
      return Object.fromEntries(pairs.map(([logicalKey, physicalPath]) => [
        logicalKey,
        Boolean(verified?.[physicalPath])
      ]));
    },
    async deleteJsonFile(logicalKey) {
      if (typeof storage.deleteJsonFile !== 'function') {
        throw createMissingMethodError('deleteJsonFile');
      }
      return runStorageOperation({
        logicalKey,
        operation: 'deleteJsonFile',
        startedPhase: 'storageDeleteStarted',
        completePhase: 'storageDeleteComplete',
        failedPhase: 'storageDeleteFailed',
        run: ({ path }) => storage.deleteJsonFile(path)
      });
    }
  };

  if (typeof storage.writeBase64File === 'function') {
    adapter.writeBase64File = (fileName, base64Data, options = {}) => storage.writeBase64File(fileName, base64Data, options);
  }
  if (typeof storage.verifyFiles === 'function') {
    adapter.verifyFiles = (paths = [], options = {}) => storage.verifyFiles(paths, options);
  }
  if (typeof storage.deleteFile === 'function') {
    adapter.deleteFile = (filePath, options = {}) => storage.deleteFile(filePath, options);
  }

  return adapter;
}
