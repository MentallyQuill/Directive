import assert from 'node:assert/strict';

import {
  runtimePackageIdForState,
  selectActiveCreatorRuntimeAssets,
  selectActiveMissionGraphRecord,
  selectActiveRuntimeAssets,
  selectOptionalActiveMissionGraph,
  selectOptionalActiveRuntimeAssets,
  selectOptionalRuntimeAssetsForState,
  selectPackageContextForState
} from '../../src/runtime/mission-asset-selector.mjs';

const graphA = { manifest: { id: 'graph-a' }, nodes: [] };
const graphB = { manifest: { id: 'graph-b' }, nodes: [] };
const assetsA = {
  packageData: { manifest: { id: 'pkg-a' } },
  missionGraphs: [
    { path: 'graphs/a.json', graph: graphA },
    { path: 'graphs/b.json', graph: graphB }
  ],
  missionGraphsById: new Map([
    ['graph-a', { path: 'graphs/a.json', graph: graphA }],
    ['graph-b', { path: 'graphs/b.json', graph: graphB }]
  ])
};
const assetsB = {
  packageData: { manifest: { id: 'pkg-b' } },
  missionGraphs: [],
  missionGraphsById: new Map()
};
const runtimeAssetsByPackageId = new Map([
  ['pkg-a', assetsA],
  ['pkg-b', assetsB]
]);
const controller = {
  activePackageId: 'pkg-a',
  getPackageContext: ({ packageId }) => {
    if (packageId === 'pkg-a') return { packageId, simulationModes: ['Exploration'] };
    throw new Error('missing package context');
  }
};
const campaignView = { activePackageId: 'pkg-b' };

assert.equal(runtimePackageIdForState({
  state: { activeCampaignPackage: { packageId: 'state-package' } },
  controller,
  campaignView
}), 'state-package');
assert.equal(runtimePackageIdForState({
  state: { packageId: 'direct-state-package' },
  controller,
  campaignView
}), 'direct-state-package');
assert.equal(runtimePackageIdForState({
  state: { campaign: { packageId: 'campaign-package' } },
  controller,
  campaignView
}), 'campaign-package');
assert.equal(runtimePackageIdForState({ state: null, controller, campaignView }), 'pkg-a');
assert.equal(runtimePackageIdForState({ state: null, controller: null, campaignView }), 'pkg-b');

assert.equal(selectActiveRuntimeAssets({
  campaignState: null,
  controller,
  runtimeAssetsByPackageId
}), assetsA);
assert.equal(selectOptionalActiveRuntimeAssets({
  campaignState: null,
  controller: { activePackageId: 'missing' },
  runtimeAssetsByPackageId
}), null);

assert.equal(selectActiveCreatorRuntimeAssets({
  creatorView: { package: { id: 'pkg-b' } },
  controller,
  campaignView,
  runtimeAssetsByPackageId
}), assetsB);
assert.throws(
  () => selectActiveCreatorRuntimeAssets({
    creatorView: { package: { id: 'missing' } },
    controller,
    campaignView,
    runtimeAssetsByPackageId
  }),
  /No Character Creator package assets/
);

assert.equal(selectActiveMissionGraphRecord({
  assets: assetsA,
  campaignState: { mission: { activeMissionGraphId: 'graph-b' } }
}).graph, graphB);
assert.equal(selectActiveMissionGraphRecord({
  assets: assetsA,
  campaignState: { mission: { activeMissionGraphId: 'graph-b' } },
  sceneSnapshotOverrides: { activeMissionGraphId: 'graph-a' }
}).graph, graphA);
assert.equal(selectActiveMissionGraphRecord({
  assets: assetsA,
  campaignState: { mission: {} }
}).graph, graphA);
assert.equal(selectOptionalActiveMissionGraph({ assets: null }), null);
assert.equal(selectOptionalActiveMissionGraph({
  assets: assetsB,
  campaignState: { mission: {} }
}), null);

assert.equal(selectOptionalRuntimeAssetsForState({
  state: { campaign: { packageId: 'pkg-b' } },
  controller,
  campaignView,
  runtimeAssetsByPackageId
}), assetsB);
assert.equal(selectOptionalRuntimeAssetsForState({
  state: { campaign: { packageId: 'missing' } },
  controller,
  campaignView,
  runtimeAssetsByPackageId
}), null);

assert.deepEqual(selectPackageContextForState({
  state: null,
  controller,
  campaignView
}), { packageId: 'pkg-a', simulationModes: ['Exploration'] });
assert.equal(selectPackageContextForState({
  state: { activeCampaignPackage: { packageId: 'missing' } },
  controller,
  campaignView
}), null);
