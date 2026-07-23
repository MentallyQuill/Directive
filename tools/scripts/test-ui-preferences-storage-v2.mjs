import assert from 'node:assert/strict';

import { createFakeJsonStorage } from '../../src/hosts/fake/fake-host.mjs';
import {
  DIRECTIVE_STORAGE_PATHS,
  loadDirectiveUiPreferences,
  saveDirectiveUiPreferences
} from '../../src/storage/directive-storage-repository.mjs';

const storage = createFakeJsonStorage();
await storage.writeJson(DIRECTIVE_STORAGE_PATHS.uiPreferences, {
  kind: 'directive.uiPreferences',
  schemaVersion: 1,
  revision: 4,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  selectedQuestIdsByScope: {
    ' campaign:ashes::chat:old ': ' quest:intro '
  }
});

const migrated = await loadDirectiveUiPreferences(storage, { now: '2026-07-22T00:00:00.000Z' });
assert.equal(migrated.schemaVersion, 2);
assert.deepEqual(migrated.selectedQuestIdsByScope, { 'campaign:ashes': 'quest:intro' });
assert.deepEqual(migrated.categoryOrderByCampaign, {});

const saved = await saveDirectiveUiPreferences(storage, {
  ...migrated,
  selectedCampaignId: ' ashes ',
  categoryOrderByCampaign: { ashes: ['command', 'command', '', 'custom'] },
  shipCollectionOrderByScope: { 'ashes::ship': { issues: ['issue:a'], capabilities: ['cap:a'] } }
}, { now: '2026-07-22T01:00:00.000Z' });

assert.equal(saved.schemaVersion, 2);
assert.equal(saved.revision, 5);
assert.equal(saved.selectedCampaignId, 'ashes');
assert.deepEqual(saved.categoryOrderByCampaign, { ashes: ['command', 'custom'] });
assert.deepEqual(saved.shipCollectionOrderByScope, { 'ashes::ship': { issues: ['issue:a'], capabilities: ['cap:a'] } });

console.log('UI preferences storage v2 tests passed.');
