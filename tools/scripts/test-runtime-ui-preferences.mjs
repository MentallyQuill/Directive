import assert from 'node:assert/strict';

import { createRuntimeUiPreferences } from '../../src/runtime/ui-preferences.mjs';

const writes = [];
const preferences = createRuntimeUiPreferences({
  storageAdapter: { id: 'adapter' },
  now: () => '2026-06-26T00:00:00.000Z',
  loadPreferences: async (adapter, options) => {
    assert.equal(adapter.id, 'adapter');
    assert.equal(options.now, '2026-06-26T00:00:00.000Z');
    return {
      hiddenCampaignSessionKeys: [' session:a ', '', null, 'session:b'],
      selectedQuestIdsByScope: {
        ' campaign:ashes::chat:1 ': ' quest:hesperus ',
        '': 'ignored',
        'campaign:bad': ''
      }
    };
  },
  savePreferences: async (adapter, payload, options) => {
    writes.push({ adapter, payload, options });
    return { ok: true, payload };
  }
});

await preferences.load();
assert.deepEqual(preferences.hiddenSessionKeys(), ['session:a', 'session:b']);
assert.equal(preferences.hasHiddenSessionKey(' session:a '), true);
assert.equal(preferences.hasHiddenSessionKey('missing'), false);
assert.equal(preferences.selectedQuestId('campaign:ashes::chat:1'), 'quest:hesperus');
assert.equal(preferences.selectedQuestId('missing'), null);

assert.equal(preferences.hideSessionKey(' session:c '), true);
assert.equal(preferences.hideSessionKey(''), false);
assert.equal(preferences.showSessionKey(' session:a '), true);
assert.equal(preferences.showSessionKey(''), false);
assert.deepEqual(preferences.hiddenSessionKeys(), ['session:b', 'session:c']);
assert.equal(preferences.selectQuest(' campaign:ashes::chat:1 ', ' quest:relay '), true);
assert.equal(preferences.selectQuest('', 'quest:missing'), false);
assert.equal(preferences.clearSelectedQuest('missing'), false);
assert.equal(preferences.clearSelectedQuest('campaign:ashes::chat:1'), true);
assert.equal(preferences.selectedQuestId('campaign:ashes::chat:1'), null);
assert.equal(preferences.selectQuest('campaign:ashes::chat:1', 'quest:relay'), true);

const result = await preferences.persist();
assert.equal(result.ok, true);
assert.deepEqual(writes[0].payload, {
  schemaVersion: 2,
  hiddenCampaignSessionKeys: ['session:b', 'session:c'],
  selectedCampaignId: null,
  selectedQuestIdsByScope: {
    'campaign:ashes': 'quest:relay'
  },
  selectedPersonIdsByCampaign: {},
  categoryOrderByCampaign: {},
  recordOrderByScope: {},
  collapsedCategoryIdsByCampaign: {},
  questOrderByCampaign: {},
  openQuestIdsByCampaign: {},
  shipCollectionOrderByScope: {},
  openShipIssueIdsByScope: {}
});
assert.equal(writes[0].options.now, '2026-06-26T00:00:00.000Z');
