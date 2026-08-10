import {
  DIRECTIVE_STORAGE_IMAGE_EXTENSIONS,
  assertDirectiveUserFilesPath
} from './directive-storage-filenames.mjs';

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export async function storeV1PlayerPortrait(adapter, upload, { ownerKind, ownerId, now } = {}) {
  if (upload?.kind !== 'directive.playerPortraitUpload' || upload?.descriptor?.kind !== 'directive.playerPortrait') {
    throw new Error('Directive V1 requires an exact player portrait upload.');
  }
  if (typeof adapter?.writeBase64File !== 'function') {
    const error = new Error('This host does not support player portrait uploads.');
    error.code = 'DIRECTIVE_PLAYER_PORTRAIT_UNSUPPORTED';
    throw error;
  }
  const stored = await adapter.writeBase64File(upload.fileName, upload.base64Data, {
    allowedExtensions: DIRECTIVE_STORAGE_IMAGE_EXTENSIONS
  });
  const path = assertDirectiveUserFilesPath(stored.path, { allowedExtensions: DIRECTIVE_STORAGE_IMAGE_EXTENSIONS });
  return {
    ...clone(upload.descriptor),
    owner: { kind: String(ownerKind), id: String(ownerId) },
    asset: {
      ...clone(upload.descriptor.asset),
      path,
      fileName: stored.fileName || upload.fileName,
      updatedAt: typeof now === 'function' ? now() : (now || new Date().toISOString())
    }
  };
}

export async function deleteV1PlayerPortrait(adapter, portrait) {
  const rawPath = portrait?.asset?.path || '';
  if (!rawPath) return { deleted: false, path: null };
  const path = assertDirectiveUserFilesPath(rawPath, { allowedExtensions: DIRECTIVE_STORAGE_IMAGE_EXTENSIONS });
  if (typeof adapter?.deleteFile !== 'function') {
    const error = new Error('This host does not support player portrait deletion.');
    error.code = 'DIRECTIVE_PLAYER_PORTRAIT_UNSUPPORTED';
    throw error;
  }
  const result = await adapter.deleteFile(path, { allowedExtensions: DIRECTIVE_STORAGE_IMAGE_EXTENSIONS });
  return { deleted: result?.ok !== false, path };
}
