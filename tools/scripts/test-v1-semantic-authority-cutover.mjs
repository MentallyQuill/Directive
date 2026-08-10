import assert from 'node:assert/strict';

import {
  V1_RUNTIME_ARCHITECTURE_KIND,
  createV1RuntimeArchitectureStamp,
  resolveV1SemanticAuthority
} from '../../src/runtime/v1-semantic-authority.mjs';

const packageId = 'directive:campaign-package:breckenridge-ashes-of-peace';
const packageVersion = '0.3.0-pre-alpha.1';
const packageData = {
  manifest: {
    kind: 'directive.campaignPackage.v1',
    schemaVersion: 1,
    id: packageId,
    version: packageVersion
  }
};
const definition = {
  id: 'mission.prelude-a-ship-underway',
  version: '1.0.0',
  packageBinding: {
    packageId,
    packageVersion,
    sourceId: 'prelude-a-ship-underway'
  }
};

assert.equal(createV1RuntimeArchitectureStamp({
  packageData: { manifest: { kind: 'directive.campaignPackage.invalid', schemaVersion: 1, id: packageId, version: packageVersion } }
}), null, 'packages must opt new saves into the exact V1 architecture');

const stamp = createV1RuntimeArchitectureStamp({ packageData });
assert.deepEqual(stamp, {
  kind: V1_RUNTIME_ARCHITECTURE_KIND,
  contractVersion: 1,
  semanticAuthority: 'storySettlement',
  packageId,
  packageVersion,
  createdForNewSave: true
});

const unstampedState = {
  campaign: { id: 'campaign.unstamped' },
  activeCampaignPackage: { packageId, packageVersion },
  mission: { activeMissionId: 'prelude-a-ship-underway' }
};
const availableDefinition = { ok: true, definition };
assert.deepEqual(resolveV1SemanticAuthority({
  campaignState: unstampedState,
  runtimeAssets: { packageData },
  definitionResolution: availableDefinition
}), {
  ok: false,
  mode: 'blocked',
  reasonCode: 'authority-stamp-absent',
  stamp: null,
  definition: null
}, 'unstamped saves are unsupported even when V1 definitions are available');

const authoritativeState = {
  ...structuredClone(unstampedState),
  campaign: {
    ...structuredClone(unstampedState.campaign),
    runtimeArchitecture: stamp
  }
};
const authoritative = resolveV1SemanticAuthority({
  campaignState: authoritativeState,
  runtimeAssets: { packageData },
  definitionResolution: availableDefinition
});
assert.equal(authoritative.ok, true);
assert.equal(authoritative.mode, 'authoritative');
assert.equal(authoritative.reasonCode, null);
assert.deepEqual(authoritative.stamp, stamp);
assert.equal(authoritative.definition, definition);

for (const [label, statePatch, assetsPatch, definitionResolution, reasonCode] of [
  [
    'malformed stamp',
    { campaign: { runtimeArchitecture: { ...stamp, contractVersion: 2 } } },
    {},
    availableDefinition,
    'authority-stamp-invalid'
  ],
  [
    'active package mismatch',
    { activeCampaignPackage: { packageId, packageVersion: '0.2.0' } },
    {},
    availableDefinition,
    'active-package-mismatch'
  ],
  [
    'runtime package mismatch',
    {},
    { packageData: { manifest: { ...packageData.manifest, version: '0.2.0' } } },
    availableDefinition,
    'runtime-package-mismatch'
  ],
  [
    'definition unavailable',
    {},
    {},
    { ok: false, reasonCode: 'definition-assets-missing' },
    'definition-assets-missing'
  ],
  [
    'definition binding mismatch',
    {},
    {},
    { ok: true, definition: { ...definition, packageBinding: { ...definition.packageBinding, packageVersion: '0.2.0' } } },
    'definition-package-mismatch'
  ]
]) {
  const state = {
    ...structuredClone(authoritativeState),
    ...structuredClone(statePatch),
    campaign: {
      ...structuredClone(authoritativeState.campaign),
      ...structuredClone(statePatch.campaign || {})
    }
  };
  const assets = {
    packageData,
    ...structuredClone(assetsPatch)
  };
  const result = resolveV1SemanticAuthority({
    campaignState: state,
    runtimeAssets: assets,
    definitionResolution
  });
  assert.equal(result.ok, false, label);
  assert.equal(result.mode, 'blocked', label);
  assert.equal(result.reasonCode, reasonCode, label);
}

console.log('V1 semantic authority cutover tests passed.');
