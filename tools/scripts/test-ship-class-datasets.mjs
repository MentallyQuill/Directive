import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { materializeShipDatasetFacts } from '../../src/continuity/materializers/ship-dataset-facts.mjs';
import { createPlayerSafeCampaignProjection } from '../../src/generation/player-safe-prompt-context-builder.mjs';

const root = process.cwd();

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, relativePath), 'utf8'));
}

const fixtures = [
  {
    name: 'Glass Harbor Steamrunner',
    packagePath: 'packages/bundled/glass-harbor/drowned-constellation.campaign-package.json',
    projectionPath: 'packages/bundled/glass-harbor/drowned-constellation.campaign-projection.json',
    datasetPath: 'packages/bundled/glass-harbor/glass-harbor-steamrunner-class.ship-dataset.json',
    areaId: 'steamrunner.aft-lower-flight-deck',
    guardPattern: /aft-lower|astern and below|deflector/i
  },
  {
    name: 'Serein Steamrunner',
    packagePath: 'packages/bundled/serein/black-current.campaign-package.json',
    projectionPath: 'packages/bundled/serein/black-current.campaign-projection.json',
    datasetPath: 'packages/bundled/serein/serein-steamrunner-class.ship-dataset.json',
    areaId: 'steamrunner.aft-lower-flight-deck',
    guardPattern: /aft-lower|astern and below|deflector/i
  },
  {
    name: 'Aster Vale New Orleans',
    packagePath: 'packages/bundled/aster-vale/unseen-border.campaign-package.json',
    projectionPath: 'packages/bundled/aster-vale/unseen-border.campaign-projection.json',
    datasetPath: 'packages/bundled/aster-vale/aster-vale-new-orleans-class.ship-dataset.json',
    areaId: 'new-orleans.aft-saucer-shuttlebay',
    guardPattern: /aft saucer\/neck|mission pods are not routine shuttlebays|astern/i
  },
  {
    name: "Celandine Norway",
    packagePath: 'packages/bundled/celandine/enemys-garden.campaign-package.json',
    projectionPath: 'packages/bundled/celandine/enemys-garden.campaign-projection.json',
    datasetPath: 'packages/bundled/celandine/celandine-norway-class.ship-dataset.json',
    areaId: 'norway.aft-centerline-shuttlebay',
    guardPattern: /pylon gap|aft centerline|astern/i
  }
];

for (const fixture of fixtures) {
  const packageData = readJson(fixture.packagePath);
  const projection = readJson(fixture.projectionPath);
  const shipDataset = readJson(fixture.datasetPath);
  const campaignState = projection.initialState || {};

  assert.equal(shipDataset.manifest.packageId, packageData.manifest.id, `${fixture.name} package id mismatch`);
  assert.equal(shipDataset.manifest.shipId, packageData.ship.id, `${fixture.name} ship id mismatch`);

  const facts = materializeShipDatasetFacts({ packageData, campaignState, shipDataset });
  const factText = facts.map((fact) => `${fact.id}\n${fact.summary}\n${fact.render?.narrator || ''}\n${fact.render?.director || ''}`).join('\n');
  assert.match(factText, new RegExp(fixture.areaId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${fixture.name} should materialize the shuttlebay layout area`);
  assert.match(factText, fixture.guardPattern, `${fixture.name} should materialize class-specific shuttlebay geometry`);
  assert.equal(
    facts.some((fact) => fact.id.endsWith('.not-saucer-underside') && (fact.tags || []).includes('contradiction-guard')),
    true,
    `${fixture.name} should materialize a shuttlebay contradiction guard`
  );

  const projectionView = createPlayerSafeCampaignProjection({
    campaignState,
    packageData,
    shipDataset
  });
  const anchors = projectionView?.ship?.layoutAnchors || [];
  const anchor = anchors.find((entry) => entry.id === fixture.areaId);
  assert(anchor, `${fixture.name} should expose the shuttlebay area as a player-safe layout anchor`);
  assert.match(JSON.stringify(anchor), fixture.guardPattern, `${fixture.name} prompt anchor should carry class-specific shuttlebay geometry`);
}

console.log(`Ship class dataset runtime coverage passed for ${fixtures.length} packages.`);
