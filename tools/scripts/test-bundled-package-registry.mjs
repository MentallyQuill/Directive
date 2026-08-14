import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  ASHES_V1_BUNDLED_REF,
  ASHES_V1_PACKAGE_ID,
  BUNDLED_CAMPAIGN_PACKAGE_REFS,
  V1_CAMPAIGN_LIBRARY_TEASERS,
  bundledCampaignPackagePaths,
  bundledCrewDatasetPairs,
  bundledMissionDefinitionPairs,
  bundledShipDatasetPairs,
  getBundledCampaignPackageRef
} from '../../src/packages/bundled-package-registry.mjs';

assert.deepEqual(BUNDLED_CAMPAIGN_PACKAGE_REFS, [ASHES_V1_BUNDLED_REF]);
assert.equal(V1_CAMPAIGN_LIBRARY_TEASERS.length, 6);
assert.equal(V1_CAMPAIGN_LIBRARY_TEASERS.filter((entry) => entry.teaserOnly).length, 6);
assert.deepEqual(
  V1_CAMPAIGN_LIBRARY_TEASERS.map((entry) => ({
    title: entry.title,
    era: entry.campaign?.eraLabel,
    theater: entry.campaign?.theater,
    assignment: [entry.ship?.name, entry.ship?.class].filter(Boolean).join(', '),
    role: [entry.playerRole?.rank, entry.playerRole?.billet].filter(Boolean).join(', ')
  })),
  [
    { title: 'Ashes of Peace', era: '2376, Post-Dominion War', theater: 'Asterion Reach', assignment: 'U.S.S. Breckenridge, Intrepid-class', role: 'Commander, Executive Officer' },
    { title: 'Drowned Constellation', era: '2373, Dominion War', theater: 'Nerine Reef', assignment: 'U.S.S. Glass Harbor, Steamrunner-class', role: 'Commander, Executive Officer' },
    { title: 'Black Current', era: '2376, Post-Dominion War', theater: 'Vanta Wake', assignment: 'U.S.S. Serein, Steamrunner-class', role: 'Commander, Executive Officer' },
    { title: 'Broken Accord', era: '2378, Post-Dominion War', theater: 'Ilyra System', assignment: 'U.S.S. Eudora Vale, Intrepid-class', role: 'Commander, Executive Officer' },
    { title: 'Unseen Border', era: '2371', theater: 'Lacuna March', assignment: 'U.S.S. Aster Vale, New Orleans-class', role: 'Commander, Executive Officer' },
    { title: "Enemy's Garden", era: '2376, Post-Dominion War', theater: 'Cyradon Relief Cluster', assignment: 'U.S.S. Celandine, Norway-class', role: 'Commander, Executive Officer' }
  ]
);

function sentenceCount(value) {
  return String(value || '').match(/[.!?](?=\s+[A-Z]|$)/g)?.length || 0;
}

for (const teaser of V1_CAMPAIGN_LIBRARY_TEASERS) {
  assert.equal(
    sentenceCount(teaser.campaign?.highConcept),
    4,
    `${teaser.title} must provide a four-sentence campaign hook`
  );
}

assert.equal(getBundledCampaignPackageRef(ASHES_V1_PACKAGE_ID), ASHES_V1_BUNDLED_REF);
assert.equal(getBundledCampaignPackageRef('breckenridge-ashes-of-peace'), ASHES_V1_BUNDLED_REF);
assert.equal(getBundledCampaignPackageRef('directive:campaign-package:serein-black-current'), null);
assert.deepEqual(bundledCampaignPackagePaths(), [ASHES_V1_BUNDLED_REF.packagePath]);
assert.deepEqual(bundledCrewDatasetPairs(), [[ASHES_V1_BUNDLED_REF.packagePath, ASHES_V1_BUNDLED_REF.crewDatasetPath]]);
assert.deepEqual(bundledShipDatasetPairs(), [[ASHES_V1_BUNDLED_REF.packagePath, ASHES_V1_BUNDLED_REF.shipDatasetPath]]);
assert.equal(bundledMissionDefinitionPairs().length, 13);

for (const file of [
  ASHES_V1_BUNDLED_REF.packagePath,
  ASHES_V1_BUNDLED_REF.crewDatasetPath,
  ASHES_V1_BUNDLED_REF.shipDatasetPath,
  ...ASHES_V1_BUNDLED_REF.missionDefinitionRefs.map((entry) => entry.path)
]) {
  assert.equal(fs.existsSync(file), true, `${file} must exist`);
}
const pack = JSON.parse(fs.readFileSync(ASHES_V1_BUNDLED_REF.packagePath, 'utf8'));
assert.equal(pack.manifest.kind, 'directive.campaignPackage.v1');
assert.equal(pack.manifest.id, ASHES_V1_PACKAGE_ID);
const expectedHeroLayers = {
  background: 'assets/packages/breckenridge/images/ship/uss-breckenridge.hero-background.webp',
  stars: 'assets/packages/breckenridge/images/ship/uss-breckenridge.hero-stars.webp',
  foreground: 'assets/packages/breckenridge/images/ship/uss-breckenridge.hero-ship.webp',
  cruise: {
    farStars: 'assets/packages/breckenridge/images/ship/uss-breckenridge.hero-stars-far.svg',
    nearStars: 'assets/packages/breckenridge/images/ship/uss-breckenridge.hero-stars-near.svg',
    sunlight: 'assets/packages/breckenridge/images/ship/uss-breckenridge.hero-sunlight.svg'
  }
};
assert.deepEqual(V1_CAMPAIGN_LIBRARY_TEASERS[0].assets.images[0].layers, expectedHeroLayers);
assert.deepEqual(pack.assets.images.find((image) => image.id === 'breckenridge.ship.primary')?.layers, expectedHeroLayers);
for (const path of [
  expectedHeroLayers.background,
  expectedHeroLayers.stars,
  expectedHeroLayers.foreground,
  ...Object.values(expectedHeroLayers.cruise)
]) {
  assert.equal(fs.existsSync(path), true, `${path} must exist`);
}
const farStarsSvg = fs.readFileSync(expectedHeroLayers.cruise.farStars, 'utf8');
const nearStarsSvg = fs.readFileSync(expectedHeroLayers.cruise.nearStars, 'utf8');
const sunlightSvg = fs.readFileSync(expectedHeroLayers.cruise.sunlight, 'utf8');
assert.match(farStarsSvg, /viewBox="0 0 960 600"/);
assert.match(nearStarsSvg, /viewBox="0 0 960 600"/);
assert.match(sunlightSvg, /viewBox="0 0 1672 941"/);
assert.doesNotMatch(farStarsSvg, /<rect[^>]+(?:fill="#(?:fff|ffffff)"|opacity="1")/i);
assert.doesNotMatch(nearStarsSvg, /<rect[^>]+(?:fill="#(?:fff|ffffff)"|opacity="1")/i);
assert.doesNotMatch(sunlightSvg, /<rect[^>]+fill="#[0-9a-f]{3,8}"/i);
for (const ref of ASHES_V1_BUNDLED_REF.missionDefinitionRefs) {
  const definition = JSON.parse(fs.readFileSync(ref.path, 'utf8'));
  assert.equal(definition.kind, 'directive.missionDefinition.v1');
  assert.equal(definition.packageBinding.packageId, ASHES_V1_PACKAGE_ID);
  assert.equal(definition.packageBinding.packageVersion, pack.manifest.version);
}

console.log('PASS V1 bundled package registry');
