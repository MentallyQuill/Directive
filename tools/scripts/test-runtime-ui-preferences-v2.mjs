import assert from 'node:assert/strict';

import { createRuntimeUiPreferences } from '../../src/runtime/ui-preferences.mjs';

let persisted = null;
const preferences = createRuntimeUiPreferences({
  storageAdapter: {},
  loadPreferences: async () => ({
    schemaVersion: 1,
    selectedQuestIdsByScope: {
      'campaign:ashes::chat:old': 'quest:intro'
    }
  }),
  savePreferences: async (_adapter, value) => {
    persisted = value;
    return value;
  }
});

await preferences.load();
assert.equal(preferences.selectedQuestId('campaign:ashes'), 'quest:intro', 'v1 chat-scoped quest selection should migrate to campaign scope');

assert.equal(preferences.selectCampaign('ashes'), true);
assert.equal(preferences.selectPerson('ashes', 'mara'), true);
assert.equal(preferences.setCategoryOrder('ashes', ['command', 'custom', 'command', '']), true);
assert.equal(preferences.setRecordOrder('ashes::command', ['mara', 'sato']), true);
assert.equal(preferences.setCategoryCollapsed('ashes', 'custom', true), true);
assert.equal(preferences.setQuestOrder('ashes', ['quest:intro', 'quest:side']), true);
assert.equal(preferences.setOpenQuest('ashes', 'quest:side'), true);
assert.equal(preferences.setShipCollectionOrder('ashes::breckenridge', 'issues', ['issue:b', 'issue:a']), true);
assert.equal(preferences.setOpenShipIssue('ashes::breckenridge', 'issue:b'), true);

await preferences.persist();
assert.equal(persisted.schemaVersion, 2);
assert.equal(persisted.selectedCampaignId, 'ashes');
assert.deepEqual(persisted.selectedPersonIdsByCampaign, { ashes: 'mara' });
assert.deepEqual(persisted.categoryOrderByCampaign, { ashes: ['command', 'custom'] });
assert.deepEqual(persisted.recordOrderByScope, { 'ashes::command': ['mara', 'sato'] });
assert.deepEqual(persisted.collapsedCategoryIdsByCampaign, { ashes: ['custom'] });
assert.deepEqual(persisted.selectedQuestIdsByScope, { 'campaign:ashes': 'quest:intro' });
assert.deepEqual(persisted.questOrderByCampaign, { ashes: ['quest:intro', 'quest:side'] });
assert.deepEqual(persisted.openQuestIdsByCampaign, { ashes: 'quest:side' });
assert.deepEqual(persisted.shipCollectionOrderByScope, { 'ashes::breckenridge': { issues: ['issue:b', 'issue:a'], capabilities: [] } });
assert.deepEqual(persisted.openShipIssueIdsByScope, { 'ashes::breckenridge': 'issue:b' });

console.log('Runtime UI preferences v2 tests passed.');
