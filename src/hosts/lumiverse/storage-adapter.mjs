import { assertDirectiveLogicalStorageKey } from '../../storage/logical-storage-paths.mjs';

const SAFE_PREFIX_PATTERN = /^[a-z0-9][a-z0-9/_.-]*\/?$/;

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

function assertSafePrefix(prefix = '') {
  const value = String(prefix || '');
  if (!value) {
    return '';
  }
  if (value.includes('..') || value.startsWith('/') || value.includes('\\') || !SAFE_PREFIX_PATTERN.test(value)) {
    throw new Error(`Unsafe Lumiverse storage prefix "${value}"`);
  }
  return value;
}

function methodOptions({ userId, indent, includeUserId }) {
  const options = {
    indent
  };
  if (includeUserId && userId) {
    options.userId = userId;
  }
  return options;
}

function methodUserId(userId, includeUserId) {
  return includeUserId && userId ? userId : undefined;
}

function selectStorage(spindle, scope) {
  requireObject(spindle, 'spindle');
  if (scope === 'shared') {
    requireObject(spindle.storage, 'spindle.storage');
    return spindle.storage;
  }
  requireObject(spindle.userStorage || spindle.storage, 'spindle.userStorage');
  return spindle.userStorage || spindle.storage;
}

function createUnsupportedError(methodName) {
  const error = new Error(`Lumiverse storage does not support ${methodName}`);
  error.code = 'DIRECTIVE_LUMIVERSE_STORAGE_UNSUPPORTED';
  error.methodName = methodName;
  return error;
}

export function createLumiverseStorageAdapter({
  spindle,
  scope = 'user',
  userId = null,
  indent = 2
} = {}) {
  const storage = selectStorage(spindle, scope);
  const resolvedScope = scope === 'shared' ? 'shared' : 'user';
  const includeUserId = resolvedScope === 'user' && storage === spindle.userStorage;

  async function readJson(filePath) {
    const path = assertDirectiveLogicalStorageKey(filePath);
    if (typeof storage.getJson === 'function') {
      return cloneJson(await storage.getJson(path, {
        fallback: null,
        ...methodOptions({ userId, indent, includeUserId })
      }));
    }
    requireFunction(storage.read, 'lumiverse storage.read');
    const text = await storage.read(path, methodUserId(userId, includeUserId));
    return JSON.parse(text);
  }

  async function writeJson(filePath, value) {
    const path = assertDirectiveLogicalStorageKey(filePath);
    if (typeof storage.setJson === 'function') {
      await storage.setJson(path, cloneJson(value), methodOptions({ userId, indent, includeUserId }));
      return { ok: true, path };
    }
    requireFunction(storage.write, 'lumiverse storage.write');
    await storage.write(path, `${JSON.stringify(value ?? null, null, indent)}\n`, methodUserId(userId, includeUserId));
    return { ok: true, path };
  }

  async function deleteJsonFile(filePath) {
    const path = assertDirectiveLogicalStorageKey(filePath);
    if (typeof storage.delete !== 'function') {
      throw createUnsupportedError('delete');
    }
    await storage.delete(path, methodUserId(userId, includeUserId));
    return { ok: true, path };
  }

  async function verifyJsonFiles(paths = []) {
    if (typeof storage.exists !== 'function') {
      throw createUnsupportedError('exists');
    }
    const safePaths = paths.map(assertDirectiveLogicalStorageKey);
    const entries = await Promise.all(safePaths.map(async (path) => [
      path,
      Boolean(await storage.exists(path, methodUserId(userId, includeUserId)))
    ]));
    return Object.fromEntries(entries);
  }

  async function listJsonFiles(prefix = '') {
    if (typeof storage.list !== 'function') {
      throw createUnsupportedError('list');
    }
    return storage.list(assertSafePrefix(prefix), methodUserId(userId, includeUserId));
  }

  return {
    hostId: 'lumiverse',
    scope: resolvedScope,
    userId,
    readJson,
    writeJson,
    deleteJsonFile,
    verifyJsonFiles,
    listJsonFiles
  };
}
