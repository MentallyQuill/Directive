import assert from 'node:assert/strict';
import * as fingerprint from '../../src/runtime/branch-history-package-fingerprint.mjs';
import { loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';
const assets = loadAshesRuntimeAssets();
const hash = await fingerprint.computeBranchHistoryPackageFingerprintV1(assets);
assert.match(hash, /^[a-f0-9]{64}$/);
for (const key of ['packageData', 'crewDataset', 'shipDataset', 'cohesionCatalog']) {
  const changed = structuredClone(assets); changed[key].fingerprintTest = 'changed';
  assert.notEqual(await fingerprint.computeBranchHistoryPackageFingerprintV1(changed), hash, key);
}
const changedMission = structuredClone(assets); changedMission.missionDefinitions[0].fingerprintTest = true;
assert.notEqual(await fingerprint.computeBranchHistoryPackageFingerprintV1(changedMission), hash);
const reordered = value => Array.isArray(value) ? value.map(reordered) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reordered(item)])) : value;
assert.equal(await fingerprint.computeBranchHistoryPackageFingerprintV1(reordered(assets)), hash);
assert.equal(await fingerprint.computeBranchHistoryPackageFingerprintV1({ ...assets,
  missionDefinitionsById: new Map(), providerSettings: { model: 'other' }, campaignLibrary: ['other'] }), hash);
const moving = structuredClone(assets);
const pending = fingerprint.computeBranchHistoryPackageFingerprintV1(moving);
moving.packageData.changedAfterInvocation = true;
assert.equal(await pending, hash, 'hash input is sampled before the first await');
for (const key of ['packageData', 'crewDataset', 'shipDataset', 'cohesionCatalog', 'missionDefinitions']) {
  const missing = { ...assets }; delete missing[key];
  await assert.rejects(fingerprint.computeBranchHistoryPackageFingerprintV1(missing));
}
for (const bad of [undefined, NaN, new Date(), () => {}, new Map()]) {
  const candidate = structuredClone(assets); candidate.packageData.bad = bad;
  await assert.rejects(fingerprint.computeBranchHistoryPackageFingerprintV1(candidate));
}
let getterCalls = 0;
const accessor = { ...assets, packageData: Object.defineProperty({}, 'bad', {
  enumerable: true, get() { getterCalls++; return 'unsafe'; } }) };
await assert.rejects(fingerprint.computeBranchHistoryPackageFingerprintV1(accessor));
assert.equal(getterCalls, 0);
const duplicate = structuredClone(assets); duplicate.missionDefinitions.push(duplicate.missionDefinitions[0]);
await assert.rejects(fingerprint.computeBranchHistoryPackageFingerprintV1(duplicate));
const foreign = structuredClone(assets); foreign.missionDefinitions[0].packageBinding.packageVersion = 'foreign';
await assert.rejects(fingerprint.computeBranchHistoryPackageFingerprintV1(foreign));
const ordered = structuredClone(assets); ordered.missionDefinitions.reverse();
assert.notEqual(await fingerprint.computeBranchHistoryPackageFingerprintV1(ordered), hash, 'authored array order is preserved');
const cyclic = structuredClone(assets); cyclic.packageData.cycle = cyclic.packageData;
await assert.rejects(fingerprint.computeBranchHistoryPackageFingerprintV1(cyclic));
const deep = structuredClone(assets); let cursor = deep.packageData;
for (let i = 0; i < 66; i++) { cursor.nested = {}; cursor = cursor.nested; }
await assert.rejects(fingerprint.computeBranchHistoryPackageFingerprintV1(deep));
const sparse = structuredClone(assets); sparse.missionDefinitions = Array(2);
await assert.rejects(fingerprint.computeBranchHistoryPackageFingerprintV1(sparse));
console.log('Branch history package fingerprint: authoritative assets, canonical identity, synchronous snapshot and invalid inputs passed.');
