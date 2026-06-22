import {
  DIRECTIVE_STORAGE_IMAGE_EXTENSIONS,
  normalizeDirectiveStorageId
} from '../storage/directive-storage-filenames.mjs';

export const PLAYER_PORTRAIT_MAX_BYTES = 5 * 1024 * 1024;

const MIME_TO_EXTENSION = Object.freeze({
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp'
});

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function timestampFromNow(now) {
  if (typeof now === 'function') return now();
  if (typeof now === 'string' && now.trim()) return now;
  return new Date().toISOString();
}

function extensionOf(fileName = '') {
  const index = String(fileName || '').lastIndexOf('.');
  return index >= 0 ? String(fileName || '').slice(index).toLowerCase() : '';
}

function mimeFromExtension(fileName = '') {
  const extension = extensionOf(fileName);
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  return '';
}

function extensionForMime(mimeType = '', fileName = '') {
  const mime = String(mimeType || '').trim().toLowerCase() || mimeFromExtension(fileName);
  const extension = MIME_TO_EXTENSION[mime] || extensionOf(fileName);
  if (!DIRECTIVE_STORAGE_IMAGE_EXTENSIONS.includes(extension)) {
    throw new Error('Player portraits must be PNG, JPEG, or WebP images.');
  }
  return extension === '.jpeg' ? '.jpg' : extension;
}

function mimeForPortrait(mimeType = '', fileName = '') {
  const mime = String(mimeType || '').trim().toLowerCase() || mimeFromExtension(fileName);
  if (!MIME_TO_EXTENSION[mime]) {
    throw new Error('Player portraits must be PNG, JPEG, or WebP images.');
  }
  return mime;
}

function stripDataUrl(base64 = '') {
  return String(base64 || '').replace(/^data:[^;]+;base64,/i, '').trim();
}

function bytesToBase64(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(view).toString('base64');
  }
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
}

function base64ByteLength(base64 = '') {
  const clean = stripDataUrl(base64);
  if (!clean) return 0;
  if (typeof Buffer !== 'undefined') return Buffer.from(clean, 'base64').byteLength;
  return Math.floor((clean.length * 3) / 4);
}

async function bytesFromFile(file) {
  if (!file || typeof file.arrayBuffer !== 'function') return null;
  return new Uint8Array(await file.arrayBuffer());
}

async function resolveSourceBytes({ file = null, bytes = null, arrayBuffer = null, base64 = '' } = {}) {
  const fromFile = await bytesFromFile(file);
  if (fromFile) return fromFile;
  if (bytes instanceof Uint8Array) return bytes;
  if (Array.isArray(bytes)) return new Uint8Array(bytes);
  if (arrayBuffer instanceof ArrayBuffer) return new Uint8Array(arrayBuffer);
  if (base64) {
    const clean = stripDataUrl(base64);
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(clean, 'base64'));
    const binary = globalThis.atob(clean);
    const out = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) out[index] = binary.charCodeAt(index);
    return out;
  }
  return null;
}

async function readImageDimensions(bytes, mimeType) {
  if (typeof createImageBitmap !== 'function' || typeof Blob === 'undefined') {
    return { width: null, height: null };
  }
  try {
    const bitmap = await createImageBitmap(new Blob([bytes], { type: mimeType }));
    const dimensions = { width: bitmap.width || null, height: bitmap.height || null };
    bitmap.close?.();
    return dimensions;
  } catch {
    return { width: null, height: null };
  }
}

async function blobToBytes(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

function dataUrlToBytes(dataUrl = '') {
  const clean = stripDataUrl(dataUrl);
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(clean, 'base64'));
  const binary = globalThis.atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function canvasToBlob(canvas, mimeType) {
  if (typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type: mimeType, quality: 0.88 });
  }
  if (typeof canvas.toBlob === 'function') {
    return new Promise((resolve) => canvas.toBlob(resolve, mimeType, 0.88));
  }
  if (typeof canvas.toDataURL === 'function') {
    return new Blob([dataUrlToBytes(canvas.toDataURL(mimeType, 0.88))], { type: mimeType });
  }
  return null;
}

async function normalizePortraitRaster(bytes, mimeType, targetSize = 768) {
  if (typeof createImageBitmap !== 'function' || typeof Blob === 'undefined') {
    return null;
  }
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(targetSize, targetSize)
    : typeof globalThis.document?.createElement === 'function'
      ? globalThis.document.createElement('canvas')
      : null;
  if (!canvas) return null;
  canvas.width = targetSize;
  canvas.height = targetSize;
  const context = canvas.getContext?.('2d');
  if (!context) return null;

  try {
    const bitmap = await createImageBitmap(new Blob([bytes], { type: mimeType }));
    const scale = Math.max(targetSize / bitmap.width, targetSize / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    const x = (targetSize - width) / 2;
    const y = (targetSize - height) / 2;
    context.clearRect(0, 0, targetSize, targetSize);
    context.drawImage(bitmap, x, y, width, height);
    bitmap.close?.();
    const webp = await canvasToBlob(canvas, 'image/webp');
    if (webp?.size) {
      return {
        bytes: await blobToBytes(webp),
        mimeType: 'image/webp',
        width: targetSize,
        height: targetSize
      };
    }
    const png = await canvasToBlob(canvas, 'image/png');
    if (png?.size) {
      return {
        bytes: await blobToBytes(png),
        mimeType: 'image/png',
        width: targetSize,
        height: targetSize
      };
    }
  } catch {
    return null;
  }
  return null;
}

function buildPortraitFileName({ ownerKind, ownerId, extension, updatedAt }) {
  const owner = normalizeDirectiveStorageId(`${ownerKind}-${ownerId}`, 'player', 120);
  const stamp = normalizeDirectiveStorageId(updatedAt.replace(/[^0-9TZ]/g, ''), 'portrait', 40);
  return `directive-player-portrait-${owner}-${stamp}${extension}`;
}

export async function createPlayerPortraitUpload({
  file = null,
  bytes = null,
  arrayBuffer = null,
  base64 = '',
  mimeType = '',
  fileName = '',
  ownerKind,
  ownerId,
  now = null,
  maxBytes = PLAYER_PORTRAIT_MAX_BYTES
} = {}) {
  const kind = requireNonEmptyString(ownerKind, 'ownerKind');
  const id = requireNonEmptyString(ownerId, 'ownerId');
  const sourceName = fileName || file?.name || '';
  const sourceMime = mimeForPortrait(mimeType || file?.type, sourceName);
  const sourceBytes = await resolveSourceBytes({ file, bytes, arrayBuffer, base64 });
  const normalizedRaster = sourceBytes ? await normalizePortraitRaster(sourceBytes, sourceMime) : null;
  const outputBytes = normalizedRaster?.bytes || sourceBytes;
  const outputMime = normalizedRaster?.mimeType || sourceMime;
  const extension = extensionForMime(outputMime, sourceName);
  const cleanBase64 = outputBytes ? bytesToBase64(outputBytes) : stripDataUrl(base64);
  const byteLength = outputBytes?.byteLength || base64ByteLength(cleanBase64);
  if (!cleanBase64 || byteLength <= 0) {
    throw new Error('Player portrait image data is required.');
  }
  if (byteLength > maxBytes) {
    throw new Error(`Player portrait images must be ${Math.round(maxBytes / 1024 / 1024)}MB or smaller.`);
  }
  const updatedAt = timestampFromNow(now);
  const dimensions = normalizedRaster
    ? { width: normalizedRaster.width, height: normalizedRaster.height }
    : outputBytes
      ? await readImageDimensions(outputBytes, outputMime)
    : { width: null, height: null };
  const fileNameOut = buildPortraitFileName({
    ownerKind: kind,
    ownerId: id,
    extension,
    updatedAt
  });
  return {
    kind: 'directive.playerPortraitUpload',
    fileName: fileNameOut,
    base64Data: cleanBase64,
    byteLength,
    descriptor: {
      kind: 'directive.playerPortrait',
      source: 'userUpload',
      owner: {
        kind,
        id
      },
      asset: {
        path: '',
        fileName: fileNameOut,
        mimeType: outputMime,
        width: dimensions.width,
        height: dimensions.height,
        aspect: dimensions.width && dimensions.height ? `${dimensions.width}:${dimensions.height}` : 'unknown',
        fit: 'cover',
        focalPoint: { x: 0.5, y: 0.5 },
        alt: 'Player character portrait',
        updatedAt
      }
    }
  };
}

export function isPlayerPortraitDescriptor(value) {
  return isObject(value)
    && value.kind === 'directive.playerPortrait'
    && isObject(value.asset)
    && typeof value.asset.path === 'string';
}
