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
for (const ref of ASHES_V1_BUNDLED_REF.missionDefinitionRefs) {
  const definition = JSON.parse(fs.readFileSync(ref.path, 'utf8'));
  assert.equal(definition.kind, 'directive.missionDefinition.v1');
  assert.equal(definition.packageBinding.packageId, ASHES_V1_PACKAGE_ID);
  assert.equal(definition.packageBinding.packageVersion, pack.manifest.version);
}

console.log('PASS V1 bundled package registry');
