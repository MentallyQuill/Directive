import assert from 'node:assert/strict';

import { deleteV2SaveLayout } from '../../src/storage/transaction-store-v2.mjs';

const records = new Map([
  ['campaigns/campaign-a/saves/checkpoint-authority-a/save-manifest.v2.json', {
    kind: 'directive.saveManifest.v2',
    head: { logicalKey: 'campaigns/campaign-a/saves/checkpoint-authority-a/head.v2.json' },
    eventSegments: [{ logicalKey: 'campaigns/campaign-a/saves/checkpoint-authority-a/events/events-a.v2.json' }]
  }],
  ['campaigns/campaign-a/saves/checkpoint-authority-a/head.v2.json', { kind: 'head' }],
  ['campaigns/campaign-a/saves/checkpoint-authority-a/events/events-a.v2.json', { kind: 'events' }],
  ['campaigns/campaign-a/saves/checkpoint-authority-a/core/save-manifest.v2.json', {
    kind: 'directive.coreSaveManifest.v2',
    head: { logicalKey: 'campaigns/campaign-a/saves/checkpoint-authority-a/core/head.v2.json' }
  }],
  ['campaigns/campaign-a/saves/checkpoint-authority-a/core/head.v2.json', { kind: 'core-head' }],
  ['campaigns/campaign-a/campaign-manifest.v2.json', { kind: 'shared-active-campaign-manifest' }],
  ['campaigns/campaign-a/core/campaign-manifest.v2.json', { kind: 'shared-core-campaign-manifest' }]
]);

const adapter = {
  async readJson(key) {
    if (!records.has(key)) throw new Error(`missing ${key}`);
    return structuredClone(records.get(key));
  },
  async deleteJsonFile(key) {
    records.delete(key);
  }
};

const core = await deleteV2SaveLayout(adapter, {
  campaignId: 'campaign-a',
  saveId: 'checkpoint-authority-a',
  layout: 'core'
});
assert.equal(core.deleted, true);
assert.equal(records.has('campaigns/campaign-a/saves/checkpoint-authority-a/core/save-manifest.v2.json'), false);
assert.equal(records.has('campaigns/campaign-a/saves/checkpoint-authority-a/core/head.v2.json'), false);
assert.equal(records.has('campaigns/campaign-a/saves/checkpoint-authority-a/save-manifest.v2.json'), true);

const active = await deleteV2SaveLayout(adapter, {
  campaignId: 'campaign-a',
  saveId: 'checkpoint-authority-a',
  layout: 'active'
});
assert.equal(active.deleted, true);
assert.equal(records.has('campaigns/campaign-a/saves/checkpoint-authority-a/save-manifest.v2.json'), false);
assert.equal(records.has('campaigns/campaign-a/saves/checkpoint-authority-a/head.v2.json'), false);
assert.equal(records.has('campaigns/campaign-a/saves/checkpoint-authority-a/events/events-a.v2.json'), false);
assert.equal(records.has('campaigns/campaign-a/campaign-manifest.v2.json'), true);
assert.equal(records.has('campaigns/campaign-a/core/campaign-manifest.v2.json'), true);

console.log('V2 save-layout deletion tests passed.');
