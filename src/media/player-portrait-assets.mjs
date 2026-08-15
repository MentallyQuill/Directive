import {
  DIRECTIVE_STORAGE_IMAGE_EXTENSIONS,
  normalizeDirectiveStorageId
} from '../storage/directive-storage-filenames.mjs';

export const PLAYER_PORTRAIT_MAX_BYTES = 5 * 1024 * 1024;
export const PLAYER_PORTRAIT_MAX_DIMENSION = 8192;
export const PLAYER_PORTRAIT_MAX_PIXELS = 40_000_000;

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

function portraitSizeError(maxBytes) {
  return new Error(`Player portrait images must be ${Math.round(maxBytes / 1024 / 1024)}MB or smaller.`);
}

function assertMaxBytes(maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error('maxBytes must be a positive integer');
  }
}

function assertSourceSizeBeforeRead({ file, bytes, arrayBuffer, base64 }, maxBytes) {
  const knownByteLength = Number.isFinite(file?.size)
    ? file.size
    : bytes instanceof Uint8Array
      ? bytes.byteLength
      : Array.isArray(bytes)
        ? bytes.length
        : arrayBuffer instanceof ArrayBuffer
          ? arrayBuffer.byteLength
          : null;
  if (knownByteLength !== null) {
    if (knownByteLength > maxBytes) throw portraitSizeError(maxBytes);
    return;
  }
  if (base64 && base64ByteLength(base64) > maxBytes) throw portraitSizeError(maxBytes);
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
  if (!/^[a-zA-Z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 === 1) {
    throw new Error('Player portrait image data must be valid Base64.');
  }
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
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

function ascii(bytes, offset, length) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function crc32(bytes, start, end) {
  let crc = 0xffffffff;
  for (let index = start; index < end; index += 1) {
    crc ^= bytes[index];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngDimensions(bytes) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 45 || !signature.every((value, index) => bytes[index] === value)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let dimensions = null;
  let hasImageData = false;
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = ascii(bytes, offset + 4, 4);
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > bytes.length) return null;
    const expectedCrc = view.getUint32(offset + 8 + length);
    if (crc32(bytes, offset + 4, offset + 8 + length) !== expectedCrc) return null;
    if (offset === 8) {
      if (type !== 'IHDR' || length !== 13) return null;
      dimensions = { width: view.getUint32(offset + 8), height: view.getUint32(offset + 12) };
    }
    if (type === 'IDAT' && length > 0) hasImageData = true;
    if (type === 'IEND') {
      return length === 0 && chunkEnd === bytes.length && hasImageData ? dimensions : null;
    }
    offset = chunkEnd;
  }
  return null;
}

function jpegDimensions(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf
  ]);
  let dimensions = null;
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xd9) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return null;
    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
    if (startOfFrameMarkers.has(marker)) {
      if (segmentLength < 7) return null;
      dimensions = {
        width: (bytes[offset + 5] << 8) | bytes[offset + 6],
        height: (bytes[offset + 3] << 8) | bytes[offset + 4]
      };
    }
    if (marker === 0xda) {
      const scanStart = offset + segmentLength;
      const hasEndMarker = bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
      return dimensions && scanStart < bytes.length - 2 && hasEndMarker ? dimensions : null;
    }
    offset += segmentLength;
  }
  return null;
}

function webpDimensions(bytes) {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, true) + 8 !== bytes.length) return null;
  let canvasDimensions = null;
  let imageDimensions = null;
  let hasImageData = false;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const format = ascii(bytes, offset, 4);
    const length = view.getUint32(offset + 4, true);
    const dataOffset = offset + 8;
    const chunkEnd = dataOffset + length;
    if (chunkEnd > bytes.length) return null;
    if (format === 'VP8X' && length >= 10) {
      canvasDimensions = {
        width: 1 + bytes[dataOffset + 4] + (bytes[dataOffset + 5] << 8) + (bytes[dataOffset + 6] << 16),
        height: 1 + bytes[dataOffset + 7] + (bytes[dataOffset + 8] << 8) + (bytes[dataOffset + 9] << 16)
      };
    }
    if (format === 'VP8 ' && length >= 10
      && bytes[dataOffset + 3] === 0x9d && bytes[dataOffset + 4] === 0x01 && bytes[dataOffset + 5] === 0x2a) {
      hasImageData = true;
      imageDimensions = {
        width: (bytes[dataOffset + 6] | (bytes[dataOffset + 7] << 8)) & 0x3fff,
        height: (bytes[dataOffset + 8] | (bytes[dataOffset + 9] << 8)) & 0x3fff
      };
    }
    if (format === 'VP8L' && length >= 5 && bytes[dataOffset] === 0x2f) {
      hasImageData = true;
      imageDimensions = {
        width: 1 + bytes[dataOffset + 1] + ((bytes[dataOffset + 2] & 0x3f) << 8),
        height: 1 + (bytes[dataOffset + 2] >> 6) + (bytes[dataOffset + 3] << 2)
          + ((bytes[dataOffset + 4] & 0x0f) << 10)
      };
    }
    if (format === 'ANMF' && length >= 16) hasImageData = true;
    offset = chunkEnd + (length % 2);
  }
  if (offset !== bytes.length || !hasImageData) return null;
  return canvasDimensions || imageDimensions;
}

function inspectPortraitImage(bytes, mimeType) {
  const dimensions = mimeType === 'image/png'
    ? pngDimensions(bytes)
    : mimeType === 'image/jpeg'
      ? jpegDimensions(bytes)
      : mimeType === 'image/webp'
        ? webpDimensions(bytes)
        : null;
  if (!dimensions?.width || !dimensions?.height) {
    throw new Error(`Player portrait data is not a valid ${mimeType.replace('image/', '').toUpperCase()} image.`);
  }
  if (dimensions.width > PLAYER_PORTRAIT_MAX_DIMENSION
    || dimensions.height > PLAYER_PORTRAIT_MAX_DIMENSION
    || dimensions.width * dimensions.height > PLAYER_PORTRAIT_MAX_PIXELS) {
    throw new Error('Player portrait dimensions are too large.');
  }
  return dimensions;
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
    return { decoderAvailable: false, decoded: false, raster: null };
  }
  let bitmap = null;
  try {
    bitmap = await createImageBitmap(new Blob([bytes], { type: mimeType }));
  } catch {
    return { decoderAvailable: true, decoded: false, raster: null };
  }

  try {
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(targetSize, targetSize)
      : typeof globalThis.document?.createElement === 'function'
        ? globalThis.document.createElement('canvas')
        : null;
    if (!canvas) return { decoderAvailable: true, decoded: true, raster: null };
    canvas.width = targetSize;
    canvas.height = targetSize;
    const context = canvas.getContext?.('2d');
    if (!context) return { decoderAvailable: true, decoded: true, raster: null };
    const scale = Math.max(targetSize / bitmap.width, targetSize / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    const x = (targetSize - width) / 2;
    const y = (targetSize - height) / 2;
    context.clearRect(0, 0, targetSize, targetSize);
    context.drawImage(bitmap, x, y, width, height);
    const webp = await canvasToBlob(canvas, 'image/webp');
    if (webp?.size) {
      return { decoderAvailable: true, decoded: true, raster: {
        bytes: await blobToBytes(webp), mimeType: 'image/webp', width: targetSize, height: targetSize
      } };
    }
    const png = await canvasToBlob(canvas, 'image/png');
    if (png?.size) {
      return { decoderAvailable: true, decoded: true, raster: {
        bytes: await blobToBytes(png), mimeType: 'image/png', width: targetSize, height: targetSize
      } };
    }
  } catch {
    return { decoderAvailable: true, decoded: true, raster: null };
  } finally {
    bitmap?.close?.();
  }
  return { decoderAvailable: true, decoded: true, raster: null };
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
  assertMaxBytes(maxBytes);
  const kind = requireNonEmptyString(ownerKind, 'ownerKind');
  const id = requireNonEmptyString(ownerId, 'ownerId');
  const sourceName = fileName || file?.name || '';
  const sourceMime = mimeForPortrait(mimeType || file?.type, sourceName);
  assertSourceSizeBeforeRead({ file, bytes, arrayBuffer, base64 }, maxBytes);
  const sourceBytes = await resolveSourceBytes({ file, bytes, arrayBuffer, base64 });
  if (!sourceBytes?.byteLength) {
    throw new Error('Player portrait image data is required.');
  }
  if (sourceBytes.byteLength > maxBytes) throw portraitSizeError(maxBytes);
  const sourceDimensions = inspectPortraitImage(sourceBytes, sourceMime);
  const rasterResult = await normalizePortraitRaster(sourceBytes, sourceMime);
  if (rasterResult.decoderAvailable && !rasterResult.decoded) {
    throw new Error('Player portrait image data could not be decoded.');
  }
  const normalizedRaster = rasterResult.raster;
  const outputBytes = normalizedRaster?.bytes || sourceBytes;
  const outputMime = normalizedRaster?.mimeType || sourceMime;
  const extension = extensionForMime(outputMime, sourceName);
  const cleanBase64 = outputBytes ? bytesToBase64(outputBytes) : stripDataUrl(base64);
  const byteLength = outputBytes?.byteLength || base64ByteLength(cleanBase64);
  if (!cleanBase64 || byteLength <= 0) throw new Error('Player portrait image data is required.');
  if (byteLength > maxBytes) throw portraitSizeError(maxBytes);
  const updatedAt = timestampFromNow(now);
  const dimensions = normalizedRaster
    ? { width: normalizedRaster.width, height: normalizedRaster.height }
    : sourceDimensions;
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
