import { createSillyTavernFileStorageAdapter } from './file-api.mjs';
import { createLogicalStorageAdapter } from '../../storage/logical-storage-adapter.mjs';

export function createSillyTavernStorageAdapter(options = {}) {
  const physicalStorage = options.storage || createSillyTavernFileStorageAdapter(options);
  return createLogicalStorageAdapter({
    storage: physicalStorage,
    hostId: 'sillytavern',
    onProgress: options.onProgress
  });
}
