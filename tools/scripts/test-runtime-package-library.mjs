import assert from 'node:assert/strict';

import {
  indexRuntimeAssets,
  loadBundledCampaignPackageRecords,
  mergeImportedPackageRecords,
  summarizeRuntimeAssets,
  unwrapProjectionRecord
} from '../../src/runtime/package-library.mjs';

const payloads = new Map([
  ['package-a.json', {
    manifest: { id: 'pkg-a', bundled: true },
    guardrails: {},
    characterCreation: {},
    contextPolicy: { hiddenStatePolicy: 'explicit-player-safe-projection-only' }
  }],
  ['projection-a.json', {
    manifest: { kind: 'directive.campaignStateProjection' },
    sourcePackage: { packageId: 'pkg-a' }
  }],
  ['crew-a.json', {
    manifest: { kind: 'directive.crewDataset', packageId: 'pkg-a' }
  }],
  ['ship-a.json', {
    manifest: { kind: 'directive.shipDataset', packageId: 'pkg-a' }
  }],
  ['graph-a.json', {
    manifest: { id: 'graph-a', kind: 'directive.missionGraph', packageId: 'pkg-a' }
  }],
  ['graph-b.json', {
    id: 'graph-b',
    manifest: { kind: 'directive.missionGraph', packageId: 'pkg-a' }
  }]
]);

const loaded = await loadBundledCampaignPackageRecords({
  refs: [{
    packageUrl: 'package-a.json',
    projectionUrl: 'projection-a.json',
    crewDatasetUrl: 'crew-a.json',
    shipDatasetUrl: 'ship-a.json',
    missionGraphUrls: [
      { url: 'graph-a.json', path: 'graphs/graph-a.json' },
      { url: 'graph-b.json', path: 'graphs/graph-b.json' }
    ],
    projectionPath: 'projections/projection-a.json',
    crewDatasetPath: 'crew/crew-a.json',
    shipDatasetPath: 'ship/ship-a.json'
  }],
  fetchImpl: async (url) => ({
    ok: payloads.has(url),
    status: payloads.has(url) ? 200 : 404,
    json: async () => payloads.get(url)
  })
});

assert.equal(loaded.packages[0].manifest.id, 'pkg-a');
assert.equal(unwrapProjectionRecord(loaded.projections[0]).sourcePackage.packageId, 'pkg-a');
assert.equal(loaded.crewDatasets[0].path, 'crew/crew-a.json');
assert.equal(loaded.shipDatasets[0].path, 'ship/ship-a.json');
assert.equal(loaded.missionGraphs[0].length, 2);

const imported = [{
  packageId: 'pkg-a',
  packageData: {
    manifest: { id: 'pkg-a', bundled: false },
    characterCreation: {}
  },
  diagnostics: { status: 'ok' },
  jsonPayloads: {
    'import/projection.json': {
      manifest: { kind: 'directive.campaignStateProjection' },
      sourcePackage: { packageId: 'pkg-a' },
      imported: true
    },
    'import/crew.json': {
      manifest: { kind: 'directive.crewDataset', packageId: 'pkg-a' },
      imported: true
    },
    'import/ship.json': {
      manifest: { kind: 'directive.shipDataset', packageId: 'pkg-a' },
      imported: true
    },
    'import/graph.json': {
      manifest: { id: 'imported-graph', kind: 'directive.missionGraph', packageId: 'pkg-a' },
      imported: true
    }
  }
}, {
  packageId: 'pkg-b',
  packageData: { manifest: { id: 'pkg-b' } },
  diagnostics: { status: 'error' }
}];

const merged = mergeImportedPackageRecords(loaded, imported);
assert.equal(merged.packages.length, 1);
assert.equal(merged.packages[0].manifest.bundled, false);
assert.equal(merged.sources['pkg-a'], 'imported');
assert.equal(merged.projections[0].path, 'import/projection.json');
assert.equal(merged.crewDatasets[0].path, 'import/crew.json');
assert.equal(merged.shipDatasets[0].path, 'import/ship.json');
assert.equal(merged.missionGraphs[0][0].path, 'import/graph.json');

const assets = indexRuntimeAssets({
  packages: merged.packages,
  projections: merged.projections,
  crewDatasets: merged.crewDatasets,
  shipDatasets: merged.shipDatasets,
  missionGraphs: merged.missionGraphs
});
assert.equal(assets.get('pkg-a').projection.imported, true);
assert.equal(assets.get('pkg-a').crewDataset.imported, true);
assert.equal(assets.get('pkg-a').shipDataset.imported, true);
assert.equal(assets.get('pkg-a').missionGraphsById.get('imported-graph').path, 'import/graph.json');

const summaries = summarizeRuntimeAssets(assets, merged.sources);
assert.deepEqual(summaries['pkg-a'], {
  source: 'imported',
  hasProjection: true,
  hasCrewDataset: true,
  hasShipDataset: true,
  hasGuardrails: false,
  hasCharacterCreationContext: true,
  hasPromptMetadata: false,
  missionGraphCount: 1
});
