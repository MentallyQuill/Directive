import {
  assertDirectiveStorageFileName,
  assertDirectiveUserFilesPath,
  DIRECTIVE_STORAGE_JSON_EXTENSION,
  getDirectiveUserFilesFileName
} from '../../storage/directive-storage-filenames.mjs';

const JSON_CONTENT_TYPE = 'application/json';

function getDefaultFetch() {
  const fetchImpl = globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('Fetch is not available for Directive file storage.');
  }
  return fetchImpl.bind(globalThis);
}

function getDefaultRequestHeaders() {
  const ctx = globalThis.SillyTavern?.getContext?.();
  if (typeof ctx?.getRequestHeaders === 'function') {
    return ctx.getRequestHeaders();
  }
  return { 'Content-Type': JSON_CONTENT_TYPE };
}

function mergeJsonHeaders(headers = {}) {
  return {
    ...headers,
    'Content-Type': headers['Content-Type'] || headers['content-type'] || JSON_CONTENT_TYPE
  };
}

function utf8ToBase64(text = '') {
  const value = String(text || '');
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'utf8').toString('base64');
  }
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return globalThis.btoa(binary);
}

function base64ToUtf8(base64 = '') {
  const value = String(base64 || '');
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'base64').toString('utf8');
  }
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

async function parseResponse(response) {
  const text = typeof response?.text === 'function' ? await response.text() : '';
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function requireOk(response, fallbackMessage) {
  if (response?.ok) {
    return response;
  }
  const body = await parseResponse(response);
  const message = typeof body === 'string'
    ? body
    : (body?.error || body?.message || fallbackMessage || 'Directive file storage request failed.');
  const error = new Error(String(message || fallbackMessage || 'Directive file storage request failed.'));
  error.status = Number(response?.status) || 0;
  error.body = body;
  throw error;
}

function normalizeVerifyResult(value = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function createSillyTavernFileApi(options = {}) {
  const fetchImpl = typeof options.fetchImpl === 'function' ? options.fetchImpl : getDefaultFetch();
  const getRequestHeaders = typeof options.getRequestHeaders === 'function'
    ? options.getRequestHeaders
    : getDefaultRequestHeaders;
  const baseUrl = String(options.baseUrl || '').replace(/\/+$/g, '');

  const url = (filePath) => `${baseUrl}${filePath}`;
  const jsonHeaders = () => mergeJsonHeaders(getRequestHeaders() || {});

  async function postJson(filePath, body, fallbackMessage) {
    const response = await fetchImpl(url(filePath), {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(body || {})
    });
    await requireOk(response, fallbackMessage);
    return parseResponse(response);
  }

  async function uploadBase64File(fileName = '', base64Data = '', options = {}) {
    const name = assertDirectiveStorageFileName(fileName, {
      allowedExtensions: options.allowedExtensions
    });
    const data = String(base64Data || '').trim();
    if (!data) {
      throw new Error('Directive file upload data is required.');
    }
    const result = await postJson('/api/files/upload', { name, data }, 'Directive file upload failed.');
    const path = assertDirectiveUserFilesPath(result?.path || '', {
      allowedExtensions: options.allowedExtensions
    });
    return { path, fileName: name };
  }

  async function writeTextFile(fileName = '', text = '', options = {}) {
    return uploadBase64File(fileName, utf8ToBase64(text), options);
  }

  async function writeJsonFile(fileName = '', value = {}, options = {}) {
    const space = options.pretty === false ? 0 : 2;
    const text = `${JSON.stringify(value ?? null, null, space)}\n`;
    return writeTextFile(fileName, text, {
      ...options,
      allowedExtensions: options.allowedExtensions || [DIRECTIVE_STORAGE_JSON_EXTENSION]
    });
  }

  async function readTextFile(filePath = '', options = {}) {
    const safePath = assertDirectiveUserFilesPath(filePath, options);
    const response = await fetchImpl(url(safePath), {
      method: 'GET',
      headers: getRequestHeaders() || {}
    });
    await requireOk(response, 'Directive file read failed.');
    return typeof response.text === 'function' ? response.text() : '';
  }

  async function readJsonFile(filePath = '', options = {}) {
    const text = await readTextFile(filePath, {
      ...options,
      allowedExtensions: options.allowedExtensions || [DIRECTIVE_STORAGE_JSON_EXTENSION]
    });
    try {
      return JSON.parse(text);
    } catch (error) {
      const wrapped = new Error(`Directive JSON file could not be parsed: ${error?.message || error}`);
      wrapped.cause = error;
      throw wrapped;
    }
  }

  async function verifyFiles(paths = [], options = {}) {
    const safePaths = [...new Set((Array.isArray(paths) ? paths : [])
      .map((filePath) => assertDirectiveUserFilesPath(filePath, options)))];
    if (safePaths.length === 0) {
      return {};
    }
    const result = await postJson('/api/files/verify', { urls: safePaths }, 'Directive file verification failed.');
    return normalizeVerifyResult(result);
  }

  async function deleteFile(filePath = '', options = {}) {
    const safePath = assertDirectiveUserFilesPath(filePath, options);
    await postJson('/api/files/delete', { path: safePath }, 'Directive file deletion failed.');
    return { ok: true, path: safePath };
  }

  return {
    uploadBase64File,
    writeTextFile,
    writeJsonFile,
    readTextFile,
    readJsonFile,
    verifyFiles,
    deleteFile
  };
}

export function createSillyTavernFileStorageAdapter(options = {}) {
  const fileApi = options.fileApi || createSillyTavernFileApi(options);

  return {
    async readJson(filePath) {
      return fileApi.readJsonFile(assertDirectiveUserFilesPath(filePath), {
        allowedExtensions: [DIRECTIVE_STORAGE_JSON_EXTENSION]
      });
    },
    async writeJson(filePath, value) {
      const safePath = assertDirectiveUserFilesPath(filePath, {
        allowedExtensions: [DIRECTIVE_STORAGE_JSON_EXTENSION]
      });
      const fileName = getDirectiveUserFilesFileName(safePath, {
        allowedExtensions: [DIRECTIVE_STORAGE_JSON_EXTENSION]
      });
      return fileApi.writeJsonFile(fileName, value, {
        allowedExtensions: [DIRECTIVE_STORAGE_JSON_EXTENSION],
        pretty: options.pretty
      });
    },
    async verifyJsonFiles(paths = []) {
      return fileApi.verifyFiles(paths, {
        allowedExtensions: [DIRECTIVE_STORAGE_JSON_EXTENSION]
      });
    },
    async deleteJsonFile(filePath) {
      return fileApi.deleteFile(filePath, {
        allowedExtensions: [DIRECTIVE_STORAGE_JSON_EXTENSION]
      });
    }
  };
}

export const __sillyTavernFileApiTestHooks = {
  utf8ToBase64,
  base64ToUtf8,
  parseResponse
};
