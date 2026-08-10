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
