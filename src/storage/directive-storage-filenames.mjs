export const DIRECTIVE_STORAGE_PREFIX = 'directive';
export const DIRECTIVE_STORAGE_JSON_EXTENSION = '.json';
export const DIRECTIVE_STORAGE_VERSION_SUFFIX = '.v1';
export const DIRECTIVE_USER_FILES_PREFIX = '/user/files/';

const DEFAULT_ALLOWED_EXTENSIONS = [DIRECTIVE_STORAGE_JSON_EXTENSION];
const BLOCKED_ACTIVE_EXTENSIONS = new Set([
  '.bat',
  '.cmd',
  '.com',
  '.dll',
  '.exe',
  '.html',
  '.htm',
  '.js',
  '.mjs',
  '.ps1',
  '.sh',
  '.svg',
  '.vbs'
]);

function normalizeExtension(extension = '') {
  const value = String(extension || '').trim().toLowerCase();
  return value.startsWith('.') ? value : `.${value}`;
}

function extensionOf(fileName = '') {
  const text = String(fileName || '');
  const index = text.lastIndexOf('.');
  return index >= 0 ? text.slice(index).toLowerCase() : '';
}

function isFlatFileName(fileName = '') {
  return Boolean(fileName)
    && !fileName.includes('/')
    && !fileName.includes('\\')
    && !fileName.startsWith('.')
    && fileName !== '.'
    && fileName !== '..';
}

export function normalizeDirectiveStorageId(value = '', fallback = 'item', maxLength = 140) {
  const normalized = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9._:-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._:-]+|[._:-]+$/g, '')
    .slice(0, Math.max(1, Number(maxLength) || 140));
  return normalized || fallback;
}

export function validateDirectiveStorageFileName(fileName = '', options = {}) {
  const name = String(fileName || '').trim();
  const allowedExtensions = (options.allowedExtensions || DEFAULT_ALLOWED_EXTENSIONS)
    .map(normalizeExtension);
  const extension = extensionOf(name);

  if (!isFlatFileName(name)) {
    return { ok: false, reason: 'Directive storage filenames must be flat file names.' };
  }
  if (!name.startsWith(`${DIRECTIVE_STORAGE_PREFIX}-`)) {
    return { ok: false, reason: 'Directive storage filenames must use the directive- prefix.' };
  }
  if (BLOCKED_ACTIVE_EXTENSIONS.has(extension)) {
    return { ok: false, reason: `Directive storage filename extension ${extension} is not allowed.` };
  }
  if (!allowedExtensions.includes(extension)) {
    return { ok: false, reason: `Directive storage filename extension ${extension || '(missing)'} is not allowed.` };
  }
  if (/\s/.test(name)) {
    return { ok: false, reason: 'Directive storage filenames cannot contain whitespace.' };
  }
  return { ok: true, fileName: name };
}

export function assertDirectiveStorageFileName(fileName = '', options = {}) {
  const result = validateDirectiveStorageFileName(fileName, options);
  if (!result.ok) {
    throw new Error(result.reason);
  }
  return result.fileName;
}

export function toDirectiveUserFilesPath(fileName = '', options = {}) {
  return `${DIRECTIVE_USER_FILES_PREFIX}${assertDirectiveStorageFileName(fileName, options)}`;
}

export function getDirectiveUserFilesFileName(filePath = '', options = {}) {
  const path = assertDirectiveUserFilesPath(filePath, options);
  return path.slice(DIRECTIVE_USER_FILES_PREFIX.length);
}

export function validateDirectiveUserFilesPath(filePath = '', options = {}) {
  const path = String(filePath || '').trim();
  if (!path.startsWith(DIRECTIVE_USER_FILES_PREFIX)) {
    return { ok: false, reason: 'Directive storage paths must be under /user/files/.' };
  }
  const fileName = path.slice(DIRECTIVE_USER_FILES_PREFIX.length);
  const fileNameResult = validateDirectiveStorageFileName(fileName, options);
  if (!fileNameResult.ok) {
    return fileNameResult;
  }
  return { ok: true, path: `${DIRECTIVE_USER_FILES_PREFIX}${fileNameResult.fileName}` };
}

export function assertDirectiveUserFilesPath(filePath = '', options = {}) {
  const result = validateDirectiveUserFilesPath(filePath, options);
  if (!result.ok) {
    throw new Error(result.reason);
  }
  return result.path;
}

export function buildDirectiveJsonStorageFileName(kind = '', ownerId = '') {
  const cleanKind = normalizeDirectiveStorageId(kind, 'payload', 80);
  const cleanOwnerId = normalizeDirectiveStorageId(ownerId, 'item', 160);
  return assertDirectiveStorageFileName(`${DIRECTIVE_STORAGE_PREFIX}-${cleanKind}-${cleanOwnerId}${DIRECTIVE_STORAGE_VERSION_SUFFIX}${DIRECTIVE_STORAGE_JSON_EXTENSION}`);
}

export function buildDirectiveIndexStorageFileName(stem = '') {
  const cleanStem = normalizeDirectiveStorageId(stem, 'index', 80);
  return assertDirectiveStorageFileName(`${DIRECTIVE_STORAGE_PREFIX}-${cleanStem}-index${DIRECTIVE_STORAGE_VERSION_SUFFIX}${DIRECTIVE_STORAGE_JSON_EXTENSION}`);
}
