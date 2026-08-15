import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createCampaignStartController } from '../../src/runtime/campaign-start-controller.mjs';
import { V1_CAMPAIGN_LIBRARY_TEASERS } from '../../src/packages/bundled-package-registry.mjs';
import { loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';
import { V1_STORAGE_PATHS } from '../../src/storage/v1-storage-repository.mjs';

function memoryAdapter(seed = {}) {
  const files = new Map(Object.entries(seed));
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
    async deleteJsonFile(key) { files.delete(key); }
  };
}

const packageData = JSON.parse(fs.readFileSync(
  new URL('../../packages/bundled/breckenridge/ashes-of-peace.campaign-package.json', import.meta.url),
  'utf8'
));
const { missionDefinitions } = loadAshesRuntimeAssets();
let id = 0;
let minute = 0;
const adapter = memoryAdapter({
    'indexes/saves.v1.json': { kind: 'directive.saveIndex', saves: { old: {} } }
  });
const controller = createCampaignStartController({
  adapter,
  packages: [packageData],
  missionDefinitions,
  campaignLibrary: V1_CAMPAIGN_LIBRARY_TEASERS,
  idFactory: (prefix) => `${prefix}.${++id}`,
  now: () => `2026-08-10T02:${String(minute++).padStart(2, '0')}:00.000Z`
});

assert.deepEqual(await controller.initialize(), {
  recovered: false,
  activeSave: null,
  campaignState: null
});
const initialView = await controller.getCampaignView();
assert.equal(initialView.kind, 'directive.campaignView.v1');
assert.equal(initialView.packages.length, V1_CAMPAIGN_LIBRARY_TEASERS.length);
assert.equal(initialView.packages.filter((pack) => pack.actions.startNewCampaign).length, 1);

const startedDraft = await controller.startCreatorDraft();
assert.equal(startedDraft.view.kind, 'directive.characterCreatorView.v1');
const savedDraft = await controller.saveCreatorDraft({
  draftId: startedDraft.draft.id,
  patch: {
    activeStep: 'review',
    input: {
      identity: {
        name: 'Ren Okada', pronounsOrAddress: 'he/him', speciesId: 'human',
        ageBandId: 'mid-career', appearance: 'Attentive and deliberate.'
      },
      service: {
        careerBackgroundId: 'tactical-security',
        formativeExperienceId: 'dominion-war-fleet-service',
        assignmentReasonId: 'experienced-outsider-transfer'
      },
      personality: {
        traits: { insight: 'perceptive', connection: 'candid', execution: 'decisive' },
        flawId: 'impatient'
      },
      dossier: {
        briefBiography: 'Ren Okada is a command officer shaped by wartime service and committed to reconstruction.',
        publicReputation: 'A decisive officer learning how to turn wartime instincts toward peace.'
      }
    }
  }
});
assert.equal(savedDraft.view.canBeginCampaign, true);

const campaign = await controller.acceptCreatorDraftAndStartCampaign({ draftId: savedDraft.draft.id });
assert.equal(campaign.firstSave.kind, 'directive.campaignSave.v1');
assert.equal(controller.getActiveCampaignState().player.name, 'Ren Okada');
assert.equal(controller.getActiveCampaignState().mission.v1.kind, 'directive.missionState.v1');
assert.equal(controller.getActiveCampaignState().storySettlement.kind, 'directive.storySettlement.v1');
const saveManifestPath = V1_STORAGE_PATHS.save(campaign.firstSave.id);
const saveManifest = await adapter.readJson(saveManifestPath);
assert.equal(saveManifest.kind, 'directive.campaignSaveManifest.v1');
assert.equal(Object.hasOwn(saveManifest, 'state'), false);
assert.equal((await adapter.readJson(V1_STORAGE_PATHS.saveBase(campaign.firstSave.id))).kind, 'directive.campaignSaveBase.v1');
const recoveredController = createCampaignStartController({
  adapter,
  packages: [packageData],
  missionDefinitions,
  campaignLibrary: V1_CAMPAIGN_LIBRARY_TEASERS,
  idFactory: (prefix) => `${prefix}.${++id}`,
  now: () => `2026-08-10T03:${String(minute++).padStart(2, '0')}:00.000Z`
});
const recoveredCampaign = await recoveredController.initialize();
assert.equal(recoveredCampaign.campaignState.ship.registry, 'NCC-74656');
assert.deepEqual(await adapter.readJson(saveManifestPath), saveManifest);
await controller.initialize();
const campaignView = await controller.getCampaignView();
assert.equal(campaignView.campaigns.length, 1);
assert.equal(campaignView.campaigns[0].checkpoints.length, 0);

const checkpoint = await controller.createCheckpoint({ name: 'Before Hesperus' });
assert.equal(checkpoint.slotType, 'checkpoint');
assert.equal((await controller.getCampaignView()).campaigns[0].checkpoints.length, 1);
const continuation = await controller.loadCheckpoint({ checkpointId: checkpoint.id });
assert.equal(continuation.timeline.slotType, 'active');
assert.equal(continuation.timeline.id, checkpoint.parentSaveId);
assert.equal(controller.getActiveCampaignState().player.name, 'Ren Okada');

const disposableCheckpoint = await controller.createCheckpoint({ name: 'Disposable checkpoint' });
const boundDisposableCheckpoint = await controller.bindCheckpointChat({
  checkpointId: disposableCheckpoint.id,
  binding: {
    hostId: 'fake',
    chatId: 'fake-chat-disposable-checkpoint',
    campaignId: disposableCheckpoint.campaignId,
    saveId: disposableCheckpoint.id,
    status: 'bound'
  }
});
assert.equal(boundDisposableCheckpoint.state.campaignChatBinding.saveId, disposableCheckpoint.parentSaveId);
const checkpointDeletion = await controller.deleteSave({ checkpointId: disposableCheckpoint.id });
assert.equal(checkpointDeletion.deleted, true);
assert.equal(checkpointDeletion.slotType, 'checkpoint');
assert.equal(checkpointDeletion.campaignChatBinding.chatId, 'fake-chat-disposable-checkpoint');

await assert.rejects(
  controller.prepareCampaignDeletion({ campaignId: campaign.firstSave.campaignId }),
  (error) => error?.code === 'DIRECTIVE_CAMPAIGN_DELETE_CHARACTER_REQUIRED'
);

const deletionState = controller.getActiveCampaignState();
deletionState.campaignChatBinding = {
  kind: 'directive.campaignChatBinding.v1',
  version: 1,
  hostId: 'sillytavern',
  chatId: 'Ren Okada - Ashes of Peace',
  campaignId: campaign.firstSave.campaignId,
  saveId: campaign.firstSave.id,
  status: 'bound',
  entityType: 'character',
  entityId: '0'
};
deletionState.stateCustody.revision += 1;
deletionState.stateCustody.recentCommitIds.push('test.bind-deletion-chat');
await controller.persistActiveCampaign({ campaignState: deletionState });
await assert.rejects(
  controller.prepareCampaignDeletion({ campaignId: campaign.firstSave.campaignId }),
  (error) => error?.code === 'DIRECTIVE_CAMPAIGN_DELETE_CHARACTER_REQUIRED'
);

deletionState.campaignChatBinding = {
  kind: 'directive.campaignChatBinding.v1',
  version: 1,
  hostId: 'sillytavern',
  chatId: 'Ren Okada - Ashes of Peace',
  campaignId: campaign.firstSave.campaignId,
  saveId: campaign.firstSave.id,
  status: 'bound',
  entityType: 'character',
  entityId: '0',
  entityName: 'Ren Okada - Ashes of Peace'
};
deletionState.stateCustody.revision += 1;
deletionState.stateCustody.recentCommitIds.push('test.name-deletion-chat');
await controller.persistActiveCampaign({ campaignState: deletionState });
const deletionCheckpoint = await controller.createCheckpoint({ name: 'Delete with campaign' });
const deletionView = await controller.getCampaignView();
assert.equal(deletionView.campaigns[0].characterName, 'Ren Okada - Ashes of Peace');

const deletionTarget = await controller.prepareCampaignDeletion({
  campaignId: campaign.firstSave.campaignId
});
assert.equal(deletionTarget.saveId, campaign.firstSave.id);
assert.deepEqual(
  new Set(deletionTarget.checkpointIds),
  new Set([checkpoint.id, deletionCheckpoint.id])
);
assert.deepEqual(deletionTarget.campaignChatBinding, deletionState.campaignChatBinding);

await assert.rejects(
  controller.prepareCampaignDeletion({ campaignId: 'campaign.missing' }),
  (error) => error?.code === 'DIRECTIVE_CAMPAIGN_DELETE_TARGET_NOT_FOUND'
);

const campaignDeletion = await controller.deleteCampaign({
  campaignId: deletionTarget.campaignId,
  saveId: deletionTarget.saveId
});
assert.equal(campaignDeletion.deleted, true);
assert.equal(campaignDeletion.saveId, campaign.firstSave.id);
assert.deepEqual(new Set(campaignDeletion.checkpointIds), new Set([checkpoint.id, deletionCheckpoint.id]));
assert.equal(controller.getActiveSave(), null);
assert.equal(controller.getActiveCampaignState(), null);
assert.equal((await controller.getCampaignView()).campaigns.length, 0);

console.log('PASS V1 campaign controller');
