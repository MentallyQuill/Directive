import assert from 'node:assert/strict';

import {
  V1_STORAGE_PATHS,
  V1_CREATOR_DRAFT_KIND,
  createV1CampaignSave,
  deleteV1CampaignSave,
  initializeV1Storage,
  listV1CampaignSaves,
  loadActiveV1CampaignSave,
  loadV1CampaignSave,
  storeV1CampaignSave,
  storeV1CreatorDraft
} from '../../src/storage/v1-storage-repository.mjs';
import { createV1StateCustody } from '../../src/runtime/v1-campaign-state.mjs';

function memoryAdapter(seed = {}) {
  const files = new Map(Object.entries(structuredClone(seed)));
  return {
    async readJson(key) {
      if (!files.has(key)) {
        const error = new Error(`not found: ${key}`);
        error.code = 'ENOENT';
        throw error;
      }
      return structuredClone(files.get(key));
    },
    async writeJson(key, value) { files.set(key, structuredClone(value)); },
    async deleteJsonFile(key) { files.delete(key); },
    snapshot: () => Object.fromEntries(files)
  };
}

function state() {
  return {
    campaign: {
      id: 'campaign.one',
      title: 'Ashes of Peace',
      currentStardate: 53051.1,
      runtimeArchitecture: {
        kind: 'directive.gameplayArchitecture.v1',
        contractVersion: 1,
        semanticAuthority: 'storySettlement',
        packageId: 'package.ashes',
        packageVersion: '1.0.0',
        createdForNewSave: true
      }
    },
    activeCampaignPackage: { packageId: 'package.ashes', packageVersion: '1.0.0' },
    player: { name: 'Ren Okada', role: 'Executive Officer' },
    crew: {},
    ship: { name: 'U.S.S. Breckenridge' },
    mission: { activeMissionId: 'prelude' },
    commandBearing: {},
    values: {},
    turnLedger: {},
    ui: {},
    settings: {},
    captainState: {},
    worldState: {},
    timeLedger: {},
    stateCustody: createV1StateCustody()
  };
}

const adapter = memoryAdapter({
  'indexes/saves.v1.json': {
    kind: 'directive.saveIndex',
    saves: { legacy: { id: 'legacy' } }
  }
});
await initializeV1Storage(adapter, { now: '2026-08-10T00:00:00.000Z' });
assert.equal(Object.hasOwn(adapter.snapshot(), 'indexes/saves.v1.json'), true);
assert.deepEqual(await listV1CampaignSaves(adapter), []);

const draft = {
  kind: V1_CREATOR_DRAFT_KIND,
  schemaVersion: 1,
  id: 'draft.one',
  package: { id: 'package.ashes', title: 'Ashes of Peace' },
  campaign: { id: 'ashes', title: 'Ashes of Peace' },
  status: 'inProgress',
  revision: 1,
  activeStep: 'identity',
  progress: {},
  updatedAt: '2026-08-10T00:01:00.000Z'
};
await storeV1CreatorDraft(adapter, draft);
assert.equal(adapter.snapshot()[V1_STORAGE_PATHS.index].drafts['draft.one'].kind, V1_CREATOR_DRAFT_KIND);

const active = createV1CampaignSave({
  id: 'save.one',
  name: 'Ren - Ashes',
  state: state(),
  createdAt: '2026-08-10T00:02:00.000Z'
});
await storeV1CampaignSave(adapter, active);
assert.equal((await loadActiveV1CampaignSave(adapter)).id, 'save.one');
assert.equal((await loadV1CampaignSave(adapter, 'save.one')).kind, 'directive.campaignSave.v1');

const checkpoint = createV1CampaignSave({
  id: 'checkpoint.one',
  name: 'Before Hesperus',
  slotType: 'checkpoint',
  parentSaveId: 'save.one',
  state: state(),
  createdAt: '2026-08-10T00:03:00.000Z'
});
await storeV1CampaignSave(adapter, checkpoint, { makeActive: false });
assert.deepEqual((await listV1CampaignSaves(adapter)).map((entry) => entry.id), ['checkpoint.one', 'save.one']);
await deleteV1CampaignSave(adapter, 'checkpoint.one', { now: '2026-08-10T00:04:00.000Z' });
assert.deepEqual((await listV1CampaignSaves(adapter)).map((entry) => entry.id), ['save.one']);

await assert.rejects(
  loadV1CampaignSave(memoryAdapter({
    [V1_STORAGE_PATHS.index]: {
      kind: 'directive.storageIndex.v1', version: 1, activeSaveId: 'old', drafts: {},
      saves: { old: { id: 'old' } }, updatedAt: '2026-08-10T00:00:00.000Z'
    },
    [V1_STORAGE_PATHS.save('old')]: { kind: 'directive.saveManifest.v2', id: 'old' }
  }), 'old'),
  (error) => error?.code === 'DIRECTIVE_V1_SAVE_REJECTED'
);

console.log('PASS V1 storage repository');
