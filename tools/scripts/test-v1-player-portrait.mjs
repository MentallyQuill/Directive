import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  createPlayerPortraitUpload,
  PLAYER_PORTRAIT_MAX_BYTES
} from '../../src/media/player-portrait-assets.mjs';
import {
  deleteV1PlayerPortrait,
  storeV1PlayerPortrait
} from '../../src/storage/v1-player-portrait-storage.mjs';
import { isCreatorPortraitLifecycleSupported } from '../../src/ui/character-creator-panel.js';

const now = '2026-08-10T12:00:00.000Z';
const pngFixture = new Uint8Array(await readFile(new URL(
  '../../assets/icons/directive-vector-glyphs-v1/preview.png',
  import.meta.url
)));
const webpFixture = new Uint8Array(await readFile(new URL(
  '../../assets/packages/aster-vale/images/ship/uss-aster-vale.thumb.webp',
  import.meta.url
)));
const jpegFixture = new Uint8Array(Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////'
  + '2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB'
  + '/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAA'
  + 'AAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/Aaf/xAAUEQEAAAAAAAAAAAAAAAAA'
  + 'AAAA/9oACAECAQE/Aaf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oA'
  + 'CAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAA'
  + 'AAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z',
  'base64'
));
const imageFixtures = [
  ['image/png', 'commander.png', '.png', pngFixture],
  ['image/jpeg', 'commander.jpeg', '.jpg', jpegFixture],
  ['image/webp', 'commander.webp', '.webp', webpFixture]
];
const imageBytes = imageFixtures[0][3];

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

for (const [mimeType, fileName, extension, fixtureBytes] of imageFixtures) {
  const upload = await createPlayerPortraitUpload({
    bytes: fixtureBytes,
    mimeType,
    fileName,
    ownerKind: 'creatorDraft',
    ownerId: 'draft-1',
    now
  });
  assert.equal(upload.kind, 'directive.playerPortraitUpload');
  assert.equal(upload.descriptor.asset.mimeType, mimeType);
  assert.equal(upload.fileName.endsWith(extension), true);
  assert.equal(upload.byteLength, fixtureBytes.byteLength);
}

await assert.rejects(
  createPlayerPortraitUpload({
    bytes: new Uint8Array([1, 2, 3, 4]),
    mimeType: 'image/png',
    fileName: 'not-an-image.png',
    ownerKind: 'creatorDraft',
    ownerId: 'draft-1',
    now
  }),
  /not a valid PNG image/
);

await assert.rejects(
  createPlayerPortraitUpload({
    bytes: imageBytes,
    mimeType: 'image/svg+xml',
    fileName: 'commander.svg',
    ownerKind: 'creatorDraft',
    ownerId: 'draft-1',
    now
  }),
  /PNG, JPEG, or WebP/
);

await assert.rejects(
  createPlayerPortraitUpload({
    bytes: imageBytes,
    mimeType: 'image/png',
    fileName: 'commander.png',
    ownerKind: 'creatorDraft',
    ownerId: 'draft-1',
    now,
    maxBytes: imageBytes.byteLength - 1
  }),
  /or smaller/
);
assert.equal(PLAYER_PORTRAIT_MAX_BYTES, 5 * 1024 * 1024);

let oversizedFileRead = false;
await assert.rejects(
  createPlayerPortraitUpload({
    file: {
      name: 'oversized.png',
      type: 'image/png',
      size: PLAYER_PORTRAIT_MAX_BYTES + 1,
      async arrayBuffer() {
        oversizedFileRead = true;
        return new ArrayBuffer(0);
      }
    },
    ownerKind: 'creatorDraft',
    ownerId: 'draft-1',
    now
  }),
  /or smaller/
);
assert.equal(oversizedFileRead, false, 'oversized files must be rejected before allocation');

const oversizedDimensions = imageBytes.slice();
oversizedDimensions.set([0x00, 0x00, 0x23, 0x29], 16);
new DataView(
  oversizedDimensions.buffer,
  oversizedDimensions.byteOffset,
  oversizedDimensions.byteLength
).setUint32(29, crc32(oversizedDimensions, 12, 29));
await assert.rejects(
  createPlayerPortraitUpload({
    bytes: oversizedDimensions,
    mimeType: 'image/png',
    fileName: 'oversized-dimensions.png',
    ownerKind: 'creatorDraft',
    ownerId: 'draft-1',
    now
  }),
  /dimensions are too large/
);

const originalCreateImageBitmap = globalThis.createImageBitmap;
const originalOffscreenCanvas = globalThis.OffscreenCanvas;
let bitmapClosed = false;
try {
  globalThis.createImageBitmap = async () => ({
    width: 2,
    height: 1,
    close() { bitmapClosed = true; }
  });
  globalThis.OffscreenCanvas = class {
    getContext() {
      return {
        clearRect() {},
        drawImage() {}
      };
    }

    async convertToBlob({ type }) {
      return new Blob([new Uint8Array([1, 2, 3])], { type });
    }
  };
  const normalized = await createPlayerPortraitUpload({
    bytes: imageBytes,
    mimeType: 'image/png',
    fileName: 'normalized.png',
    ownerKind: 'creatorDraft',
    ownerId: 'draft-1',
    now
  });
  assert.equal(normalized.descriptor.asset.mimeType, 'image/webp');
  assert.equal(normalized.descriptor.asset.width, 768);
  assert.equal(normalized.descriptor.asset.height, 768);
  assert.equal(bitmapClosed, true);

  globalThis.createImageBitmap = async () => { throw new Error('decode failed'); };
  await assert.rejects(
    createPlayerPortraitUpload({
      bytes: imageBytes,
      mimeType: 'image/png',
      fileName: 'decode-failure.png',
      ownerKind: 'creatorDraft',
      ownerId: 'draft-1',
      now
    }),
    /could not be decoded/
  );
} finally {
  if (originalCreateImageBitmap === undefined) delete globalThis.createImageBitmap;
  else globalThis.createImageBitmap = originalCreateImageBitmap;
  if (originalOffscreenCanvas === undefined) delete globalThis.OffscreenCanvas;
  else globalThis.OffscreenCanvas = originalOffscreenCanvas;
}

const calls = [];
const adapter = {
  async writeBase64File(fileName, base64Data, options) {
    calls.push({ method: 'write', fileName, base64Data, options });
    return { ok: true, fileName, path: `/user/files/${fileName}` };
  },
  async deleteFile(path, options) {
    calls.push({ method: 'delete', path, options });
    return { ok: true, path };
  }
};
const upload = await createPlayerPortraitUpload({
  bytes: imageBytes,
  mimeType: 'image/png',
  fileName: 'commander.png',
  ownerKind: 'creatorDraft',
  ownerId: 'draft-1',
  now
});
const portrait = await storeV1PlayerPortrait(adapter, upload, {
  ownerKind: 'creatorDraft',
  ownerId: 'draft-1',
  now
});
assert.equal(portrait.kind, 'directive.playerPortrait');
assert.match(portrait.asset.path, /^\/user\/files\/directive-player-portrait-/);
assert.equal(calls[0].method, 'write');

const deletion = await deleteV1PlayerPortrait(adapter, portrait);
assert.deepEqual(deletion, { deleted: true, path: portrait.asset.path });
assert.equal(calls[1].method, 'delete');

await assert.rejects(
  deleteV1PlayerPortrait(adapter, {
    kind: 'directive.playerPortrait',
    asset: { path: '/extensions/Directive/index.html' }
  }),
  /under \/user\/files\//
);

const completeActions = {
  importCreatorPortrait() {},
  removeCreatorPortrait() {}
};
assert.equal(isCreatorPortraitLifecycleSupported({
  media: { playerPortraitImportSupported: true }
}, completeActions), true);
assert.equal(isCreatorPortraitLifecycleSupported({
  media: { playerPortraitImportSupported: false }
}, completeActions), false);
assert.equal(isCreatorPortraitLifecycleSupported({
  media: { playerPortraitImportSupported: true }
}, { importCreatorPortrait() {} }), false);

console.log('PASS V1 player portrait');
