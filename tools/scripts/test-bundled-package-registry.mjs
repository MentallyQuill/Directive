import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUNDLED_CAMPAIGN_PACKAGE_REFS,
  bundledCampaignPackagePaths,
  bundledCampaignProjectionPairs,
  bundledCrewDatasetPairs,
  bundledShipDatasetPairs,
  bundledMissionGraphTriples,
  getBundledCampaignPackageRef
} from '../../src/packages/bundled-package-registry.mjs';

const root = process.cwd();

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, relativePath), 'utf8'));
}

function assertUnique(values, label) {
  assert.equal(new Set(values).size, values.length, `${label} must be unique`);
}

function assertPathExists(relativePath, label = relativePath) {
  assert.equal(fs.existsSync(path.resolve(root, relativePath)), true, `${label} must exist`);
}

function fileUrlRelative(url) {
  assert.equal(url?.protocol, 'file:');
  return path.relative(root, fileURLToPath(url)).replace(/\\/g, '/');
}

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function pathStartsWithRoot(filePath, roots) {
  return roots.some((rootPath) => filePath === rootPath || filePath.startsWith(`${rootPath}/`));
}

assert.equal(BUNDLED_CAMPAIGN_PACKAGE_REFS.length, 6, 'bundled registry package count');
assertUnique(BUNDLED_CAMPAIGN_PACKAGE_REFS.map((ref) => ref.id), 'package ids');
assertUnique(BUNDLED_CAMPAIGN_PACKAGE_REFS.map((ref) => ref.slug), 'package slugs');
assertUnique(BUNDLED_CAMPAIGN_PACKAGE_REFS.map((ref) => ref.packagePath), 'package paths');
assertUnique(BUNDLED_CAMPAIGN_PACKAGE_REFS.map((ref) => ref.projectionPath), 'projection paths');
assertUnique(BUNDLED_CAMPAIGN_PACKAGE_REFS.map((ref) => ref.crewDatasetPath), 'crew dataset paths');
assertUnique(BUNDLED_CAMPAIGN_PACKAGE_REFS.map((ref) => ref.shipDatasetPath).filter(Boolean), 'ship dataset paths');

assert.deepEqual(
  bundledCampaignPackagePaths(),
  BUNDLED_CAMPAIGN_PACKAGE_REFS.map((ref) => ref.packagePath),
  'package helper follows registry order'
);
assert.deepEqual(
  bundledCampaignProjectionPairs(),
  BUNDLED_CAMPAIGN_PACKAGE_REFS.map((ref) => [ref.projectionPath, ref.packagePath]),
  'projection helper follows registry order'
);
assert.deepEqual(
  bundledCrewDatasetPairs(),
  BUNDLED_CAMPAIGN_PACKAGE_REFS.map((ref) => [ref.packagePath, ref.crewDatasetPath]),
  'crew helper follows registry order'
);
assert.deepEqual(
  bundledShipDatasetPairs(),
  BUNDLED_CAMPAIGN_PACKAGE_REFS
    .filter((ref) => ref.shipDatasetPath)
    .map((ref) => [ref.packagePath, ref.shipDatasetPath]),
  'ship helper follows registry order'
);
assert.deepEqual(
  bundledMissionGraphTriples(),
  BUNDLED_CAMPAIGN_PACKAGE_REFS.flatMap((ref) => (
    ref.missionGraphPaths.map((graphPath) => [ref.packagePath, ref.crewDatasetPath, graphPath])
  )),
  'mission graph helper follows registry order'
);

for (const ref of BUNDLED_CAMPAIGN_PACKAGE_REFS) {
  assert.equal(getBundledCampaignPackageRef(ref.id), ref, `${ref.id} lookup by id`);
  assert.equal(getBundledCampaignPackageRef(ref.slug), ref, `${ref.id} lookup by slug`);
  assert.ok(Array.isArray(ref.assetRoots) && ref.assetRoots.length > 0, `${ref.id} asset roots`);
  assert.equal(ref.assetRoot, ref.assetRoots[0], `${ref.id} primary asset root`);
  for (const assetRoot of ref.assetRoots) {
    assertPathExists(assetRoot, `${ref.id} asset root`);
  }
  assertPathExists(ref.packagePath, `${ref.id} package`);
  assertPathExists(ref.projectionPath, `${ref.id} projection`);
  assertPathExists(ref.crewDatasetPath, `${ref.id} crew dataset`);
  if (ref.shipDatasetPath) assertPathExists(ref.shipDatasetPath, `${ref.id} ship dataset`);
  assert.equal(fileUrlRelative(ref.packageUrl), ref.packagePath, `${ref.id} package URL`);
  assert.equal(fileUrlRelative(ref.projectionUrl), ref.projectionPath, `${ref.id} projection URL`);
  assert.equal(fileUrlRelative(ref.crewDatasetUrl), ref.crewDatasetPath, `${ref.id} crew URL`);
  if (ref.shipDatasetUrl) assert.equal(fileUrlRelative(ref.shipDatasetUrl), ref.shipDatasetPath, `${ref.id} ship URL`);
  assert.equal(ref.missionGraphPath, ref.missionGraphPaths[0], `${ref.id} first mission graph path`);
  assert.equal(fileUrlRelative(ref.missionGraphUrl), ref.missionGraphPath, `${ref.id} first mission graph URL`);

  const packageData = readJson(ref.packagePath);
  const projection = readJson(ref.projectionPath);
  const crewDataset = readJson(ref.crewDatasetPath);
  const shipDataset = ref.shipDatasetPath ? readJson(ref.shipDatasetPath) : null;
  assert.equal(packageData.manifest?.id, ref.id, `${ref.id} manifest id`);
  assert.equal(packageData.manifest?.slug, ref.slug, `${ref.id} manifest slug`);
  assert.equal(packageData.manifest?.title, ref.manifestTitle, `${ref.id} manifest title`);
  assert.equal(packageData.manifest?.status, ref.status, `${ref.id} manifest status`);
  assert.equal(packageData.storyArcs?.campaign?.title, ref.campaignTitle, `${ref.id} campaign title`);
  assert.equal(projection.sourcePackage?.packageId, ref.id, `${ref.id} projection package id`);
  assert.equal(projection.sourcePackage?.packagePath, ref.packagePath, `${ref.id} projection package path`);
  assert.equal(projection.sourcePackage?.packageVersion, packageData.manifest?.version, `${ref.id} projection package version`);
  assert.equal(crewDataset.manifest?.packageId, ref.id, `${ref.id} crew dataset package id`);
  if (shipDataset) {
    assert.equal(shipDataset.manifest?.packageId, ref.id, `${ref.id} ship dataset package id`);
    assert.equal(shipDataset.manifest?.shipId, packageData.ship?.id, `${ref.id} ship dataset ship id`);
    assert.equal(shipDataset.manifest?.version, packageData.manifest?.version, `${ref.id} ship dataset version`);
  }

  if (ref.status !== 'draft') {
    assert.deepEqual(packageData.assets?.unresolved || [], [], `${ref.id} non-draft packages must not carry unresolved asset placeholders`);
  }

  for (const image of packageData.assets?.images || []) {
    for (const variantPath of Object.values(image.variants || {})) {
      assert.ok(pathStartsWithRoot(String(variantPath), ref.assetRoots), `${ref.id} image asset path must live under registry roots: ${variantPath}`);
      assertPathExists(variantPath, `${ref.id} image asset ${variantPath}`);
    }
  }

  const packageMissionGraphPaths = (packageData.assets?.datasets || [])
    .filter((asset) => asset?.kind === 'missionGraph')
    .map((asset) => asset.path)
    .filter(Boolean);
  assert.deepEqual(sorted(ref.missionGraphPaths), sorted(packageMissionGraphPaths), `${ref.id} registry graph paths match package asset graph paths`);

  const questGraphPaths = new Map((packageData.questTemplates?.templates || [])
    .filter((quest) => quest?.missionGraph?.path)
    .map((quest) => [quest.missionGraph.path, quest]));
  assert.deepEqual(sorted(ref.missionGraphPaths), sorted([...questGraphPaths.keys()]), `${ref.id} registry graph paths match quest graph paths`);

  for (const graphRef of ref.missionGraphUrls) {
    assertPathExists(graphRef.path, `${ref.id} mission graph`);
    assert.equal(fileUrlRelative(graphRef.url), graphRef.path, `${ref.id} mission graph URL`);
    const graph = readJson(graphRef.path);
    const quest = questGraphPaths.get(graphRef.path);
    assert.equal(graph.manifest?.packageId, ref.id, `${ref.id} graph package id`);
    assert.equal(graph.manifest?.missionId, quest?.id, `${ref.id} graph mission id`);
    assert.equal(quest?.missionGraph?.id, graph.manifest?.id, `${ref.id} quest graph id`);
  }
}

assert.equal(getBundledCampaignPackageRef('missing'), null, 'missing bundled package lookup');

console.log('Bundled package registry tests passed.');
