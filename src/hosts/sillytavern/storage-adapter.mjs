import { createDirectiveFileStorageAdapter } from '../../storage/directive-file-api.mjs';
import { createLogicalStorageAdapter } from '../../storage/logical-storage-adapter.mjs';

export function createSillyTavernStorageAdapter(options = {}) {
  const physicalStorage = options.storage || createDirectiveFileStorageAdapter(options);
  return createLogicalStorageAdapter({
    storage: physicalStorage,
    hostId: 'sillytavern'
  });
}
