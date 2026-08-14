import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  createV1CampaignLibrary,
  indexRuntimeAssets,
  loadBundledCampaignPackageRecords,
  summarizeRuntimeAssets
} from '../../src/runtime/package-library.mjs';
import { ASHES_V1_PACKAGE_ID } from '../../src/packages/bundled-package-registry.mjs';

const records = await loadBundledCampaignPackageRecords({
  fetchImpl: async (url) => ({
    ok: true,
    status: 200,
    json: async () => JSON.parse(fs.readFileSync(fileURLToPath(url), 'utf8'))
  })
});
assert.equal(records.packageData.manifest.id, ASHES_V1_PACKAGE_ID);
assert.equal(records.crewDataset.manifest.packageId, ASHES_V1_PACKAGE_ID);
assert.equal(records.shipDataset.manifest.packageId, ASHES_V1_PACKAGE_ID);
assert.equal(records.missionDefinitions.length, 13);

const assets = indexRuntimeAssets(records);
assert.equal(assets.size, 1);
assert.equal(assets.get(ASHES_V1_PACKAGE_ID).missionDefinitionsById.size, 13);
assert.deepEqual(summarizeRuntimeAssets(assets)[ASHES_V1_PACKAGE_ID], {
  source: 'bundled-v1',
  v1Native: true,
  hasCrewDataset: true,
  hasShipDataset: true,
  hasCohesionCatalog: true,
  missionDefinitionCount: 13
});

const library = createV1CampaignLibrary();
assert.equal(library.length, 6);
assert.equal(library[0].packageId, ASHES_V1_PACKAGE_ID);
library[0].title = 'Changed';
assert.notEqual(createV1CampaignLibrary()[0].title, 'Changed');

await assert.rejects(
  loadBundledCampaignPackageRecords({ fetchImpl: async () => ({ ok: false, status: 404 }) }),
  /asset failed to load/
);

await assert.rejects(
  loadBundledCampaignPackageRecords({
    fetchImpl: async (url) => ({
      ok: true,
      status: 200,
      json: async () => {
        const value = JSON.parse(fs.readFileSync(fileURLToPath(url), 'utf8'));
        if (value?.manifest?.kind === 'directive.shipDataset.v1') {
          value.mechanics = { kind: 'directive.shipMechanics.v1', schemaVersion: 1, systems: [] };
        }
        return value;
      }
    })
  }),
  /rejects Ship mechanics.*capabilities.*constraints/i
);

console.log('PASS V1 runtime package library');
