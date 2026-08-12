import assert from 'node:assert/strict';

import { createFakeJsonStorage } from '../../src/hosts/fake/fake-host.mjs';
import {
  compareAndSwapActiveV1CampaignSave,
  createV1CampaignSave,
  getV1StorageIndex,
  loadV1CampaignSave,
  storeV1CampaignSave,
  V1_STORAGE_PATHS
} from '../../src/storage/v1-storage-repository.mjs';
import {
  deleteTimelineOperation,
  loadTimelineOperation,
  storeTimelineOperation
} from '../../src/runtime/timeline-operation-journal.mjs';
import { createAshesInitialState } from './v1-test-fixtures.mjs';
import { createCampaignStartController } from '../../src/runtime/campaign-start-controller.mjs';
import { V1_CAMPAIGN_LIBRARY_TEASERS } from '../../src/packages/bundled-package-registry.mjs';
import { loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

const now = '2026-08-11T12:00:00.000Z';
const adapter = createFakeJsonStorage();
const parentState = createAshesInitialState({ campaignId: 'campaign.timeline', saveId: 'save.parent', chatId: 'chat.parent' });
const parent = createV1CampaignSave({ id: 'save.parent', name: 'Current Timeline', state: parentState, createdAt: now });
await storeV1CampaignSave(adapter, parent);

const childState = structuredClone(parentState);
childState.campaignChatBinding.saveId = 'save.child';
childState.campaignChatBinding.chatId = 'chat.child';
childState.mission.v1.branchId = 'save.child';
childState.mission.v1Journey.branchId = 'save.child';
childState.storySettlement.branchId = 'save.child';
// Initial run identity is validated by projection, not the storage envelope.
const child = createV1CampaignSave({ id: 'save.child', name: 'Branched Timeline', state: childState, createdAt: now });
await storeV1CampaignSave(adapter, child, { makeActive: false });
assert.equal((await getV1StorageIndex(adapter)).activeSaveId, 'save.parent');

await assert.rejects(
  compareAndSwapActiveV1CampaignSave(adapter, { expectedSaveId: 'save.wrong', nextSaveId: 'save.child', now }),
  (error) => error.code === 'DIRECTIVE_V1_ACTIVE_SAVE_CAS_MISMATCH'
);
assert.equal((await getV1StorageIndex(adapter)).activeSaveId, 'save.parent');

await compareAndSwapActiveV1CampaignSave(adapter, { expectedSaveId: 'save.parent', nextSaveId: 'save.child', now });
assert.equal((await getV1StorageIndex(adapter)).activeSaveId, 'save.child');
assert.deepEqual(await loadV1CampaignSave(adapter, 'save.parent'), parent);

const journal = {
  kind: 'directive.timelineOperation.v1',
  version: 1,
  operationId: 'timeline-op.1',
  operationType: 'native-branch',
  campaignId: 'campaign.timeline',
  stage: 'child-persisted',
  parentSaveId: 'save.parent',
  childSaveId: 'save.child',
  checkpointId: 'checkpoint.parent',
  parentBinding: parentState.campaignChatBinding,
  childBinding: childState.campaignChatBinding,
  lineageHash: 'abcdef0123456789',
  createdAt: now,
  updatedAt: now,
  diagnostics: {}
};
assert.equal(V1_STORAGE_PATHS.timelineOperation('campaign.timeline'), 'v1/operations/campaign.timeline.timeline.v1.json');
await storeTimelineOperation(adapter, journal);
assert.deepEqual(await loadTimelineOperation(adapter, 'campaign.timeline'), journal);
await storeTimelineOperation(adapter, { ...journal, stage: 'child-binding-written' });
assert.equal((await loadTimelineOperation(adapter, 'campaign.timeline')).stage, 'child-binding-written');
await assert.rejects(storeTimelineOperation(adapter, { ...journal, stage: 'invented-stage' }), /stage/i);
await deleteTimelineOperation(adapter, 'campaign.timeline');

const assets = loadAshesRuntimeAssets();
const controllerAdapter = createFakeJsonStorage();
await storeV1CampaignSave(controllerAdapter, parent);
let nextId = 0;
const controller = createCampaignStartController({
  adapter: controllerAdapter,
  packages: [assets.packageData],
  missionDefinitions: assets.missionDefinitions,
  campaignLibrary: V1_CAMPAIGN_LIBRARY_TEASERS,
  idFactory: (prefix) => `${prefix}.timeline.${++nextId}`,
  now: () => now
});
await controller.initialize();
const preserved = await controller.prepareTimelineCheckpoint({ name: 'Automatic Previous Timeline' });
const preservedBytes = JSON.stringify(preserved);
await controller.renameSavedGame({ savedGameId: preserved.id, name: 'Before the Branch' });
assert.equal((await loadV1CampaignSave(controllerAdapter, preserved.id)).name, 'Before the Branch');
assert.deepEqual((await loadV1CampaignSave(controllerAdapter, preserved.id)).state, preserved.state);

await controller.persistInactiveTimeline({ save: child });
assert.equal((await getV1StorageIndex(controllerAdapter)).activeSaveId, 'save.parent');
await controller.activatePersistedTimeline({ expectedSaveId: 'save.parent', nextSaveId: 'save.child' });
assert.equal(controller.getActiveSave().id, 'save.child');
const grouped = await controller.getCampaignView();
assert.equal(grouped.campaigns.length, 1);
assert.equal(grouped.campaigns[0].activeTimeline.saveId, 'save.child');
assert.deepEqual(grouped.campaigns[0].savedGames.map((save) => save.id), [preserved.id]);
assert.equal(JSON.stringify({ ...await loadV1CampaignSave(controllerAdapter, preserved.id), name: preserved.name, updatedAt: preserved.updatedAt }), preservedBytes);

await controller.retireSupersededTimeline({ saveId: 'save.parent' });
await assert.rejects(loadV1CampaignSave(controllerAdapter, 'save.parent'), /not found/i);
assert.equal(await loadTimelineOperation(adapter, 'campaign.timeline'), null);
await deleteTimelineOperation(adapter, 'campaign.timeline');

console.log('V1 timeline storage tests passed');
