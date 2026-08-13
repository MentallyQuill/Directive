import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  CAMPAIGN_PACKAGE_SPINE,
  createCampaignPackageSummary,
  createCharacterCreationContext,
  getCampaignPackageSpineErrors
} from '../../src/packages/campaign-package-context.mjs';
import { createRuntimePackageContext } from '../../src/runtime/campaign-start-controller.mjs';

const packageData = JSON.parse(fs.readFileSync(
  'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json',
  'utf8'
));
const before = JSON.stringify(packageData);

assert.deepEqual(Object.keys(packageData), CAMPAIGN_PACKAGE_SPINE);
assert.deepEqual(getCampaignPackageSpineErrors(packageData), []);

const summary = createCampaignPackageSummary(packageData);
assert.equal(summary.packageId, 'directive:campaign-package:breckenridge-ashes-of-peace');
assert.equal(summary.campaign.title, 'Ashes of Peace');
assert.equal(summary.campaign.openingStardate, 53068.4);
assert.match(summary.campaign.openingMessage, /Captain Mara Whitaker/);
assert.match(summary.campaign.openingMessage, /shuttle/i);
assert.match(summary.campaign.openingMessage, /PADD/i);
assert.match(summary.campaign.openingMessage, /ready room/i);
assert.match(summary.campaign.openingContext.continuitySummary, /cabin/i);
assert.match(summary.campaign.openingContext.firstPlayableScene, /0830/);
assert.equal(summary.campaign.openingContext.firstSceneGuidance.length >= 4, true);
assert.doesNotMatch(
  [
    summary.campaign.openingMessage,
    summary.campaign.openingContext.continuitySummary,
    summary.campaign.openingContext.firstPlayableScene,
    ...summary.campaign.openingContext.firstSceneGuidance
  ].join('\n'),
  /Hesperus|redline|Rhee|Daro/i
);
assert.equal(summary.ship.registry, 'NCC-74656');
assert.deepEqual(summary.simulationModes, ['Exploration', 'Command']);
assert.equal(summary.defaultSimulationMode, 'Command');
assert.equal(summary.seniorCrewPreview.length, 8);
assert.equal(summary.assets.images.some((image) => image.subjectId === 'uss-breckenridge'), true);

const runtime = createRuntimePackageContext(packageData);
assert.equal(runtime.package.version, '0.3.0-pre-alpha.1');
assert.equal(runtime.campaign.id, 'ashes-of-peace');
assert.equal(runtime.ship.id, 'uss-breckenridge');
assert.deepEqual(runtime.guardrails.simulationModes, ['Exploration', 'Command']);

const creator = createCharacterCreationContext(packageData);
assert.equal(creator.roleMode, 'lockedRole');
assert.equal(creator.lockedRole.billet, 'Executive Officer');
assert.deepEqual(creator.flow.steps, ['identity', 'service', 'personality', 'review']);
assert.equal(creator.options.allowedSpecies.some((option) => option.id === 'human'), true);
assert.equal(creator.options.traitCategories.map((category) => category.id).join(','), 'insight,connection,execution');
assert.equal(creator.options.flaws.options.some((option) => option.id === 'impatient'), true);

creator.lockedRole.rank = 'Changed';
creator.options.allowedSpecies[0].label = 'Changed';
assert.equal(packageData.characterCreation.lockedRole.rank, 'Commander');
assert.equal(packageData.characterCreation.allowedSpecies[0].label, 'Human');
assert.equal(JSON.stringify(packageData), before);

const oldShape = { ...packageData, storyArcs: {} };
assert.match(getCampaignPackageSpineErrors(oldShape).join('\n'), /unexpected top-level key "storyArcs"/);
const missingCampaign = { ...packageData };
delete missingCampaign.campaign;
assert.match(getCampaignPackageSpineErrors(missingCampaign).join('\n'), /missing top-level key "campaign"/);

const missingOpeningContext = structuredClone(packageData);
delete missingOpeningContext.campaign.openingContext;
assert.match(
  getCampaignPackageSpineErrors(missingOpeningContext).join('\n'),
  /packageData\.campaign\.openingContext must be an object/
);

const malformedOpeningContext = structuredClone(packageData);
malformedOpeningContext.campaign.openingContext = {
  continuitySummary: ' ',
  firstPlayableScene: '',
  firstSceneGuidance: ['Valid guidance.', '']
};
assert.match(
  getCampaignPackageSpineErrors(malformedOpeningContext).join('\n'),
  /packageData\.campaign\.openingContext\.continuitySummary must be a non-empty string/
);
assert.match(
  getCampaignPackageSpineErrors(malformedOpeningContext).join('\n'),
  /packageData\.campaign\.openingContext\.firstPlayableScene must be a non-empty string/
);
assert.match(
  getCampaignPackageSpineErrors(malformedOpeningContext).join('\n'),
  /packageData\.campaign\.openingContext\.firstSceneGuidance\[1\] must be a non-empty string/
);

const emptyFirstSceneGuidance = structuredClone(packageData);
emptyFirstSceneGuidance.campaign.openingContext = {
  continuitySummary: 'The player arrived aboard the Breckenridge.',
  firstPlayableScene: 'The player waits outside the ready room.',
  firstSceneGuidance: []
};
assert.match(
  getCampaignPackageSpineErrors(emptyFirstSceneGuidance).join('\n'),
  /packageData\.campaign\.openingContext\.firstSceneGuidance must be a non-empty array/
);

console.log('PASS V1 campaign package context');
