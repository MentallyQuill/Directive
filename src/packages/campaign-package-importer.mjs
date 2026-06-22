import { diagnoseCampaignPackageRecord, diagnosticStatus } from './package-diagnostics.mjs';

const ACTIVE_CONTENT_EXTENSIONS = new Set([
  '.bat',
  '.cmd',
  '.cjs',
  '.dll',
  '.exe',
  '.htm',
  '.html',
  '.jar',
  '.js',
  '.jsx',
  '.mjs',
  '.ps1',
  '.sh',
  '.svg',
  '.ts',
  '.tsx',
  '.wasm'
]);

const ALLOWED_PASSIVE_EXTENSIONS = new Set([
  '.json',
  '.gif',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.txt',
  '.md'
]);

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function issue(severity, code, message, data = {}) {
  return {
    severity,
    code,
    message,
    ...cloneJson(data)
  };
}

function extensionOf(entryPath = '') {
  const name = String(entryPath).split('/').pop() || '';
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index).toLowerCase() : '';
}

function normalizePath(entryPath = '') {
  const value = String(entryPath || '').replaceAll('\\', '/').trim();
  if (!value || value.endsWith('/')) {
    return { ok: false, reason: 'empty-or-directory' };
  }
  if (value.startsWith('/') || /^[a-zA-Z]:\//.test(value)) {
    return { ok: false, reason: 'absolute-path' };
  }
  const parts = value.split('/');
  if (parts.some((part) => part === '..' || part === '.')) {
    return { ok: false, reason: 'path-traversal' };
  }
  return { ok: true, path: parts.join('/') };
}

function textFromValue(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof Uint8Array) {
    return new TextDecoder().decode(value);
  }
  if (value instanceof ArrayBuffer) {
    return new TextDecoder().decode(value);
  }
  if (value && ArrayBuffer.isView(value)) {
    return new TextDecoder().decode(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  }
  return null;
}

function bytesFromValue(value) {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (value && ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (typeof value === 'string') {
    return new TextEncoder().encode(value);
  }
  return new Uint8Array();
}

function readUInt16(view, offset) {
  return view.getUint16(offset, true);
}

function readUInt32(view, offset) {
  return view.getUint32(offset, true);
}

function findEndOfCentralDirectory(bytes) {
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset -= 1) {
    if (
      bytes[offset] === 0x50
      && bytes[offset + 1] === 0x4b
      && bytes[offset + 2] === 0x05
      && bytes[offset + 3] === 0x06
    ) {
      return offset;
    }
  }
  return -1;
}

export function parseStoredZipEntries(bytesLike) {
  const bytes = bytesFromValue(bytesLike);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(bytes);
  if (eocd < 0) {
    throw new Error('Archive is not a readable ZIP file.');
  }

  const entryCount = readUInt16(view, eocd + 10);
  const centralDirectoryOffset = readUInt32(view, eocd + 16);
  const entries = [];
  let offset = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (readUInt32(view, offset) !== 0x02014b50) {
      throw new Error('ZIP central directory is malformed.');
    }
    const compressionMethod = readUInt16(view, offset + 10);
    const compressedSize = readUInt32(view, offset + 20);
    const fileNameLength = readUInt16(view, offset + 28);
    const extraLength = readUInt16(view, offset + 30);
    const commentLength = readUInt16(view, offset + 32);
    const localHeaderOffset = readUInt32(view, offset + 42);
    const fileNameBytes = bytes.slice(offset + 46, offset + 46 + fileNameLength);
    const fileName = new TextDecoder().decode(fileNameBytes);

    if (compressionMethod !== 0) {
      throw new Error(`Unsupported ZIP compression method ${compressionMethod} for "${fileName}". Pre-alpha importer currently accepts stored entries.`);
    }
    if (readUInt32(view, localHeaderOffset) !== 0x04034b50) {
      throw new Error(`ZIP local header is malformed for "${fileName}".`);
    }
    const localNameLength = readUInt16(view, localHeaderOffset + 26);
    const localExtraLength = readUInt16(view, localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    entries.push({
      path: fileName,
      bytes: bytes.slice(dataStart, dataStart + compressedSize)
    });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

export function normalizeCampaignPackageArchive({
  fileName,
  entries = [],
  expectedPackageId = null,
  importedAt = new Date().toISOString()
} = {}) {
  const diagnostics = {
    kind: 'directive.campaignPackageImportDiagnostics',
    sourceFileName: fileName || null,
    status: 'ok',
    issues: []
  };

  if (!String(fileName || '').endsWith('.directive-campaign.zip')) {
    diagnostics.issues.push(issue('error', 'transport-extension-invalid', 'Campaign package imports must use .directive-campaign.zip.', {
      fileName: fileName || null
    }));
  }

  const normalizedEntries = [];
  for (const entry of entries || []) {
    const rawPath = entry.path || entry.name || '';
    const normalized = normalizePath(rawPath);
    if (!normalized.ok) {
      diagnostics.issues.push(issue('error', 'unsafe-path', 'Archive entry path is unsafe.', {
        path: rawPath,
        reason: normalized.reason
      }));
      continue;
    }
    const ext = extensionOf(normalized.path);
    if (ACTIVE_CONTENT_EXTENSIONS.has(ext)) {
      diagnostics.issues.push(issue('error', 'active-content-rejected', 'Campaign packages must be data-only; active content is not allowed.', {
        path: normalized.path,
        extension: ext
      }));
      continue;
    }
    if (ext && !ALLOWED_PASSIVE_EXTENSIONS.has(ext)) {
      diagnostics.issues.push(issue('warning', 'unknown-passive-extension', 'Archive entry has an unrecognized passive extension and will be retained only as an asset path.', {
        path: normalized.path,
        extension: ext
      }));
    }
    normalizedEntries.push({
      path: normalized.path,
      bytes: bytesFromValue(entry.bytes ?? entry.text ?? entry.content)
    });
  }

  const jsonPayloads = {};
  for (const entry of normalizedEntries.filter((item) => extensionOf(item.path) === '.json')) {
    try {
      jsonPayloads[entry.path] = JSON.parse(textFromValue(entry.bytes));
    } catch (error) {
      diagnostics.issues.push(issue('error', 'json-invalid', 'Archive JSON entry is not valid JSON.', {
        path: entry.path,
        detail: error?.message || String(error)
      }));
    }
  }

  const packagePaths = Object.keys(jsonPayloads).filter((entryPath) => entryPath.endsWith('.campaign-package.json') || entryPath === 'package.json');
  if (packagePaths.length === 0) {
    diagnostics.issues.push(issue('error', 'package-json-missing', 'Archive must contain one .campaign-package.json or package.json payload.'));
  }
  if (packagePaths.length > 1) {
    diagnostics.issues.push(issue('error', 'package-json-ambiguous', 'Archive must contain exactly one package root JSON payload.', {
      packagePaths
    }));
  }

  const packagePath = packagePaths[0] || null;
  const packageData = packagePath ? jsonPayloads[packagePath] : null;
  if (packageData && expectedPackageId && packageData.manifest?.id !== expectedPackageId) {
    diagnostics.issues.push(issue('error', 'package-id-mismatch', 'Imported package id does not match the expected package id.', {
      expectedPackageId,
      actualPackageId: packageData.manifest?.id || null
    }));
  }

  if (packageData) {
    const packageDiagnostics = diagnoseCampaignPackageRecord({ packageData });
    diagnostics.issues.push(...packageDiagnostics.issues);
  }

  diagnostics.status = diagnosticStatus(diagnostics.issues);
  const ok = diagnostics.status !== 'error';
  const packageRecord = ok && packageData
    ? {
      kind: 'directive.importedCampaignPackageRecord',
      sourceFileName: fileName,
      importedAt,
      packagePath,
      packageId: packageData.manifest.id,
      packageVersion: packageData.manifest.version,
      packageData: cloneJson(packageData),
      jsonPayloads: cloneJson(jsonPayloads),
      assetPaths: normalizedEntries.map((entry) => entry.path).filter((entryPath) => extensionOf(entryPath) !== '.json'),
      diagnostics: cloneJson(diagnostics)
    }
    : null;

  return {
    ok,
    diagnostics,
    packageRecord
  };
}

export function normalizeCampaignPackageZip({
  fileName,
  bytes,
  expectedPackageId = null,
  importedAt = new Date().toISOString()
} = {}) {
  try {
    return normalizeCampaignPackageArchive({
      fileName,
      entries: parseStoredZipEntries(bytes),
      expectedPackageId,
      importedAt
    });
  } catch (error) {
    const diagnostics = {
      kind: 'directive.campaignPackageImportDiagnostics',
      sourceFileName: fileName || null,
      status: 'error',
      issues: [
        issue('error', 'zip-unreadable', error?.message || String(error))
      ]
    };
    return {
      ok: false,
      diagnostics,
      packageRecord: null
    };
  }
}
