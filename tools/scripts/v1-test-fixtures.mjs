import fs from 'node:fs';

import { createInitialCampaignStateFromCreatorReview } from '../../src/campaign/campaign-start.mjs';

export function readRepoJson(relativePath) {
  return JSON.parse(fs.readFileSync(relativePath, 'utf8'));
}

export function loadAshesRuntimeAssets() {
  const packageData = readRepoJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
  const names = [
    'prelude-a-ship-underway',
    'chapter-1-the-empty-convoy',
    'chapter-2-false-colors',
    'open-orders-1-work-worth-doing',
    'chapter-3-dead-letters',
    'chapter-4-the-colony-that-stayed',
    'chapter-5-old-lessons',
    'open-orders-2-what-survives',
    'chapter-6-the-cost-of-knowing',
    'chapter-7-a-peace-of-their-own',
    'open-orders-3-before-the-lamps-go-out',
    'chapter-8-the-last-directive',
    'epilogue-the-terms-we-keep'
  ];
  const missionDefinitions = names.map((name) => (
    readRepoJson(`packages/bundled/breckenridge/v1/${name}.mission-v1.json`)
  ));
  return {
    packageData,
    crewDataset: readRepoJson('packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json'),
    shipDataset: readRepoJson('packages/bundled/breckenridge/breckenridge-intrepid-class.ship-dataset.json'),
    missionDefinitions,
    missionDefinitionsById: new Map(missionDefinitions.map((definition) => [definition.id, definition]))
  };
}

export function createAshesInitialState({
  campaignId = 'campaign.ashes.test',
  saveId = 'save.ashes.test',
  chatId = 'chat.ashes.test',
  createdAt = '2026-08-10T00:00:00.000Z'
} = {}) {
  const { packageData, missionDefinitions } = loadAshesRuntimeAssets();
  const state = createInitialCampaignStateFromCreatorReview({
    packageData,
    missionDefinitions,
    saveId,
    campaignId,
    createdAt,
    simulationMode: 'Command',
    creatorReview: {
      identity: {
        name: 'Ren Okada',
        pronounsOrAddress: 'he/him',
        speciesId: 'human',
        ageBandId: 'mid-career',
        appearance: 'Attentive and deliberate.'
      },
      service: {
        careerBackgroundId: 'tactical-security',
        formativeExperienceId: 'dominion-war-fleet-service',
        assignmentReasonId: 'experienced-outsider-transfer'
      },
      personality: {
        traits: { insight: 'perceptive', connection: 'candid', execution: 'decisive' },
        flawId: 'impatient'
      }
    }
  });
  state.campaign.status = 'active';
  state.campaignChatBinding = {
    kind: 'directive.campaignChatBinding.v1',
    version: 1,
    campaignId,
    saveId,
    chatId
  };
  return state;
}
