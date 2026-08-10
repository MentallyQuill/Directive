import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createCampaignStartController } from '../../src/runtime/campaign-start-controller.mjs';
import { V1_CAMPAIGN_LIBRARY_TEASERS } from '../../src/packages/bundled-package-registry.mjs';

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
let id = 0;
let minute = 0;
const controller = createCampaignStartController({
  adapter: memoryAdapter({
    'indexes/saves.v1.json': { kind: 'directive.saveIndex', saves: { old: {} } }
  }),
  packages: [packageData],
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
const campaignView = await controller.getCampaignView();
assert.equal(campaignView.campaigns.length, 1);
assert.equal(campaignView.campaigns[0].checkpoints.length, 0);

const checkpoint = await controller.createCheckpoint({ name: 'Before Hesperus' });
assert.equal(checkpoint.slotType, 'checkpoint');
assert.equal((await controller.getCampaignView()).campaigns[0].checkpoints.length, 1);
const continuation = await controller.loadCheckpoint({ checkpointId: checkpoint.id });
assert.equal(continuation.slotType, 'active');
assert.notEqual(continuation.id, checkpoint.parentSaveId);
assert.equal(controller.getActiveCampaignState().player.name, 'Ren Okada');

console.log('PASS V1 campaign controller');
