import assert from 'node:assert/strict';

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
const imageBytes = new Uint8Array([1, 2, 3, 4]);

for (const [mimeType, fileName, extension] of [
  ['image/png', 'commander.png', '.png'],
  ['image/jpeg', 'commander.jpeg', '.jpg'],
  ['image/webp', 'commander.webp', '.webp']
]) {
  const upload = await createPlayerPortraitUpload({
    bytes: imageBytes,
    mimeType,
    fileName,
    ownerKind: 'creatorDraft',
    ownerId: 'draft-1',
    now
  });
  assert.equal(upload.kind, 'directive.playerPortraitUpload');
  assert.equal(upload.descriptor.asset.mimeType, mimeType);
  assert.equal(upload.fileName.endsWith(extension), true);
  assert.equal(upload.byteLength, imageBytes.byteLength);
}

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
