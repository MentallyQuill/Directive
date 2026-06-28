import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  createCampaignViewModel
} from '../../src/runtime/campaign-start-controller.mjs';
import {
  diagnoseCampaignPackageRecord
} from '../../src/packages/package-diagnostics.mjs';

const root = process.cwd();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const crewDataset = readJson('packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json');
const shipDataset = readJson('packages/bundled/breckenridge/breckenridge-intrepid-class.ship-dataset.json');
const missionGraph = readJson('packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json');

const okDiagnostics = diagnoseCampaignPackageRecord({
  packageData,
  projection,
  crewDataset,
  shipDataset,
  missionGraphs: [{ path: 'packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json', graph: missionGraph }],
  campaignState: projection.initialState
});
assert.equal(okDiagnostics.status, 'ok');
assert.equal(okDiagnostics.issueCount, 0);

const versionDriftState = cloneJson(projection.initialState);
versionDriftState.activeCampaignPackage.packageVersion = '0.1.0-pre-alpha.0';
const versionDriftDiagnostics = diagnoseCampaignPackageRecord({
  packageData,
  projection,
  crewDataset,
  shipDataset,
  missionGraphs: [missionGraph],
  campaignState: versionDriftState
});
assert.equal(versionDriftDiagnostics.status, 'warning');
assert.equal(versionDriftDiagnostics.issues.some((item) => item.code === 'campaign-package-version-drift'), true);

const packageMismatchState = cloneJson(projection.initialState);
packageMismatchState.activeCampaignPackage.packageId = 'directive:campaign-package:other';
const mismatchDiagnostics = diagnoseCampaignPackageRecord({
  packageData,
  projection,
  campaignState: packageMismatchState
});
assert.equal(mismatchDiagnostics.status, 'error');
assert.equal(mismatchDiagnostics.issues.some((item) => item.code === 'campaign-package-mismatch'), true);

const missingGraphState = cloneJson(projection.initialState);
missingGraphState.mission.activeMissionGraphId = 'missing.graph';
const missingGraphDiagnostics = diagnoseCampaignPackageRecord({
  packageData,
  projection,
  missionGraphs: [missionGraph],
  campaignState: missingGraphState
});
assert.equal(missingGraphDiagnostics.status, 'error');
assert.equal(missingGraphDiagnostics.issues.some((item) => item.code === 'active-mission-graph-missing'), true);

const missingEndConditions = cloneJson(packageData);
delete missingEndConditions.endConditions;
const missingEndConditionsDiagnostics = diagnoseCampaignPackageRecord({
  packageData: missingEndConditions,
  projection
});
assert.equal(missingEndConditionsDiagnostics.status, 'error');
assert.equal(missingEndConditionsDiagnostics.issues.some((item) => item.code === 'package-spine-invalid'), true);
assert.equal(missingEndConditionsDiagnostics.issues.some((item) => item.code === 'package-end-conditions-missing'), true);

const unresolvedNonDraftPackage = cloneJson(packageData);
unresolvedNonDraftPackage.assets.unresolved = ['Release-facing placeholder'];
const unresolvedNonDraftDiagnostics = diagnoseCampaignPackageRecord({
  packageData: unresolvedNonDraftPackage,
  projection
});
assert.equal(unresolvedNonDraftDiagnostics.status, 'error');
assert.equal(unresolvedNonDraftDiagnostics.issues.some((item) => item.code === 'package-unresolved-assets-release-facing'), true);

const badFrameRef = cloneJson(packageData);
badFrameRef.endConditions.conditions[0].continuationFrameIds = ['missing-frame'];
const badFrameRefDiagnostics = diagnoseCampaignPackageRecord({
  packageData: badFrameRef,
  projection
});
assert.equal(badFrameRefDiagnostics.status, 'error');
assert.equal(badFrameRefDiagnostics.issues.some((item) => item.code === 'package-end-condition-frame-missing'), true);

const missingDefaultRetention = cloneJson(packageData);
delete missingDefaultRetention.endConditions.defaultCheckpointPolicy.snapshotRetention;
const missingDefaultRetentionDiagnostics = diagnoseCampaignPackageRecord({
  packageData: missingDefaultRetention,
  projection
});
assert.equal(missingDefaultRetentionDiagnostics.status, 'error');
assert.equal(missingDefaultRetentionDiagnostics.issues.some((item) => item.code === 'package-end-conditions-default-retention-missing'), true);

const missingConditionRetention = cloneJson(packageData);
delete missingConditionRetention.endConditions.conditions[0].checkpointPolicy.snapshotRetention;
const missingConditionRetentionDiagnostics = diagnoseCampaignPackageRecord({
  packageData: missingConditionRetention,
  projection
});
assert.equal(missingConditionRetentionDiagnostics.status, 'error');
assert.equal(missingConditionRetentionDiagnostics.issues.some((item) => item.code === 'package-end-condition-retention-missing'), true);

const badPredicateRef = cloneJson(packageData);
badPredicateRef.endConditions.conditions[0].trigger = {
  type: 'worldTrack',
  trackId: 'missing-track',
  operator: 'gte',
  value: 1
};
const badPredicateRefDiagnostics = diagnoseCampaignPackageRecord({
  packageData: badPredicateRef,
  projection
});
assert.equal(badPredicateRefDiagnostics.status, 'error');
assert.equal(badPredicateRefDiagnostics.issues.some((item) => (
  item.code === 'package-end-condition-predicate-reference-missing'
  && item.refType === 'worldTrack'
  && item.refId === 'missing-track'
)), true);

const badProjection = cloneJson(projection);
badProjection.sourcePackage.packageId = 'directive:campaign-package:other';
const badProjectionDiagnostics = diagnoseCampaignPackageRecord({
  packageData,
  projection: badProjection
});
assert.equal(badProjectionDiagnostics.status, 'error');
assert.equal(badProjectionDiagnostics.issues.some((item) => item.code === 'projection-package-mismatch'), true);

const badShipDataset = cloneJson(shipDataset);
badShipDataset.manifest.shipId = 'uss-other';
const badShipDatasetDiagnostics = diagnoseCampaignPackageRecord({
  packageData,
  projection,
  crewDataset,
  shipDataset: badShipDataset
});
assert.equal(badShipDatasetDiagnostics.status, 'error');
assert.equal(badShipDatasetDiagnostics.issues.some((item) => item.code === 'ship-dataset-ship-mismatch'), true);

const campaignView = createCampaignViewModel({
  packages: [packageData],
  drafts: [],
  saves: [],
  activePackageId: packageData.manifest.id,
  packageDiagnostics: {
    [packageData.manifest.id]: versionDriftDiagnostics
  }
});
assert.equal(campaignView.packages[0].diagnostics.status, 'warning');
assert.equal(campaignView.packages[0].diagnostics.warningCount, 1);
assert.equal(campaignView.packages[0].diagnostics.errorCount, 0);

console.log('Package update diagnostics tests passed.');
