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

function createMissingMethodError(methodName) {
  const error = new Error(`Logical storage adapter backing store does not support ${methodName}`);
  error.code = 'DIRECTIVE_LOGICAL_STORAGE_UNSUPPORTED';
  error.methodName = methodName;
  return error;
}

export function createLogicalStorageAdapter({
  storage,
  hostId = null,
  mapper = null
} = {}) {
  requireObject(storage, 'storage');
  requireFunction(storage.readJson, 'storage.readJson');
  requireFunction(storage.writeJson, 'storage.writeJson');

  const resolvedMapper = mapper || createLogicalStorageMapper(hostId);
  requireObject(resolvedMapper, 'logical storage mapper');
  requireFunction(resolvedMapper.toPath, 'logical storage mapper.toPath');

  function toPath(logicalKey) {
    return resolvedMapper.toPath(assertDirectiveLogicalStorageKey(logicalKey));
  }

  const adapter = {
    hostId: resolvedMapper.hostId || hostId || 'unknown',
    toPath,
    async readJson(logicalKey) {
      return cloneJson(await storage.readJson(toPath(logicalKey)));
    },
    async writeJson(logicalKey, value) {
      return storage.writeJson(toPath(logicalKey), cloneJson(value));
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
      return storage.deleteJsonFile(toPath(logicalKey));
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
