import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  acceptCreatorDraftAndCreateFirstSave,
  createCampaignCheckpoint,
  loadGame,
  persistActiveCampaign,
  resumeCharacterCreatorDraft,
  saveCharacterCreatorDraftProgress,
  startCharacterCreatorDraft
} from '../../src/campaign/campaign-start-service.mjs';
import {
  V1_STORAGE_PATHS,
  listV1CampaignSaves
} from '../../src/storage/v1-storage-repository.mjs';

function memoryAdapter() {
  const files = new Map();
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

const packageData = JSON.parse(fs.readFileSync(
  new URL('../../packages/bundled/breckenridge/ashes-of-peace.campaign-package.json', import.meta.url),
  'utf8'
));
const openingMissionDefinition = JSON.parse(fs.readFileSync(
  new URL('../../packages/bundled/breckenridge/v1/prelude-a-ship-underway.mission-v1.json', import.meta.url),
  'utf8'
));
const adapter = memoryAdapter();
const draft = await startCharacterCreatorDraft({
  adapter,
  packageData,
  draftId: 'draft.service',
  now: '2026-08-10T01:00:00.000Z'
});
assert.equal(draft.kind, 'directive.characterCreatorDraft.v1');

await saveCharacterCreatorDraftProgress({
  adapter,
  draftId: draft.id,
  now: '2026-08-10T01:01:00.000Z',
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
assert.equal((await resumeCharacterCreatorDraft({ adapter, draftId: draft.id })).progress.readyForCampaignStart, true);

const started = await acceptCreatorDraftAndCreateFirstSave({
  adapter,
  packageData,
  missionDefinitions: [openingMissionDefinition],
  draftId: draft.id,
  campaignId: 'campaign.service',
  saveId: 'save.service',
  now: '2026-08-10T01:02:00.000Z'
});
assert.equal(started.firstSave.kind, 'directive.campaignSave.v1');
assert.equal(started.firstSave.slotType, 'active');
assert.equal(started.campaignState.player.name, 'Ren Okada');
assert.equal(started.campaignState.stateCustody.kind, 'directive.stateCustody.v1');
assert.equal(started.campaignState.mission.v1.kind, 'directive.missionState.v1');
assert.equal(started.campaignState.mission.v1Journey.kind, 'directive.missionJourney.v1');
assert.deepEqual(started.campaignState.mission.v1History, []);
assert.equal(started.campaignState.storySettlement.kind, 'directive.storySettlement.v1');
assert.equal(started.campaignState.storySettlement.branchId, 'save.service');
assert.equal(Object.hasOwn(started.campaignState, 'runtimeTracking'), false);

const advanced = structuredClone(started.campaignState);
advanced.campaign.currentStardate = 53051.2;
advanced.worldState.currentStardate = 53051.2;
advanced.worldState.elapsedMinutes = 2880;
advanced.timeLedger.elapsedMinutes = 2880;
advanced.timeLedger.stardate = 53051.2;
await persistActiveCampaign({
  adapter,
  saveId: started.firstSave.id,
  campaignState: advanced,
  now: '2026-08-10T01:03:00.000Z'
});
assert.equal((await loadGame({ adapter, saveId: started.firstSave.id })).campaign.currentStardate, 53051.2);

await createCampaignCheckpoint({
  adapter,
  checkpointId: 'checkpoint.hesperus',
  activeSaveId: started.firstSave.id,
  campaignState: advanced,
  name: 'Before Hesperus',
  now: '2026-08-10T01:04:00.000Z'
});
assert.deepEqual((await listV1CampaignSaves(adapter)).map((save) => save.slotType).sort(), ['active', 'checkpoint']);

const snapshot = adapter.snapshot();
assert.deepEqual(Object.keys(snapshot).sort(), [
  V1_STORAGE_PATHS.draft(draft.id),
  V1_STORAGE_PATHS.index,
  V1_STORAGE_PATHS.save('checkpoint.hesperus'),
  V1_STORAGE_PATHS.save(started.firstSave.id)
].sort());

console.log('PASS V1 campaign start service');
