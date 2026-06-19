import { getStarshipPackageSpineErrors } from './starship-package-context.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function issue(severity, code, message, data = {}) {
  return {
    severity,
    code,
    message,
    ...cloneJson(data)
  };
}

export function diagnosticStatus(issues = []) {
  if (issues.some((item) => item.severity === 'error')) return 'error';
  if (issues.some((item) => item.severity === 'warning')) return 'warning';
  return 'ok';
}

function packageId(packageData) {
  return packageData?.manifest?.id || null;
}

function packageVersion(packageData) {
  return packageData?.manifest?.version || null;
}

function normalizeMissionGraphs(missionGraphs = []) {
  const records = Array.isArray(missionGraphs) ? missionGraphs : Object.values(missionGraphs || {});
  return records
    .filter(Boolean)
    .map((record) => ({
      path: record.path || '',
      graph: record.graph || record
    }));
}

export function diagnoseStarshipPackageRecord({
  packageData,
  projection = null,
  crewDataset = null,
  missionGraphs = [],
  campaignState = null,
  archiveRecord = null
} = {}) {
  const issues = [];
  const spineErrors = getStarshipPackageSpineErrors(packageData);
  for (const errorText of spineErrors) {
    issues.push(issue('error', 'package-spine-invalid', errorText));
  }

  const id = packageId(packageData);
  const version = packageVersion(packageData);
  if (!id) {
    issues.push(issue('error', 'package-id-missing', 'Package manifest must provide a stable id.'));
  }
  if (!version) {
    issues.push(issue('error', 'package-version-missing', 'Package manifest must provide a version.'));
  }
  if (packageData?.manifest?.kind && packageData.manifest.kind !== 'directive.starshipPackage') {
    issues.push(issue('error', 'package-kind-invalid', 'Package manifest kind must be directive.starshipPackage.'));
  }
  if (packageData?.manifest?.transportExtension && packageData.manifest.transportExtension !== '.directive-starship.zip') {
    issues.push(issue('error', 'package-transport-invalid', 'Package transport extension must be .directive-starship.zip.'));
  }

  const projectionPackageId = projection?.sourcePackage?.packageId || projection?.manifest?.packageId || null;
  if (projection && id && projectionPackageId !== id) {
    issues.push(issue('error', 'projection-package-mismatch', 'Campaign projection package id must match the package manifest id.', {
      packageId: id,
      projectionPackageId
    }));
  }

  const datasetPackageId = crewDataset?.manifest?.packageId || null;
  if (crewDataset && id && datasetPackageId !== id) {
    issues.push(issue('error', 'crew-dataset-package-mismatch', 'Crew dataset package id must match the package manifest id.', {
      packageId: id,
      datasetPackageId
    }));
  }

  const graphRecords = normalizeMissionGraphs(missionGraphs);
  for (const record of graphRecords) {
    const graphPackageId = record.graph?.manifest?.packageId || null;
    if (id && graphPackageId && graphPackageId !== id) {
      issues.push(issue('error', 'mission-graph-package-mismatch', 'Mission graph package id must match the package manifest id.', {
        packageId: id,
        graphPackageId,
        path: record.path
      }));
    }
  }

  const campaignPackageId = campaignState?.activeStarshipPackage?.packageId || null;
  const campaignPackageVersion = campaignState?.activeStarshipPackage?.packageVersion || null;
  if (campaignState && id && campaignPackageId && campaignPackageId !== id) {
    issues.push(issue('error', 'campaign-package-mismatch', 'Campaign save points at a different starship package id.', {
      packageId: id,
      campaignPackageId
    }));
  }
  if (campaignState && id && campaignPackageId === id && version && campaignPackageVersion && campaignPackageVersion !== version) {
    issues.push(issue('warning', 'campaign-package-version-drift', 'Campaign state remains authoritative; newer package data may be read only when referenced ids still exist.', {
      packageId: id,
      campaignPackageVersion,
      packageVersion: version
    }));
  }

  const activeGraphId = campaignState?.mission?.activeMissionGraphId || null;
  if (campaignState && activeGraphId && graphRecords.length > 0) {
    const graphIds = new Set(graphRecords.map((record) => record.graph?.manifest?.id || record.graph?.id || record.path).filter(Boolean));
    if (!graphIds.has(activeGraphId)) {
      issues.push(issue('error', 'active-mission-graph-missing', 'The active campaign mission graph id is not available in the package assets.', {
        activeMissionGraphId: activeGraphId
      }));
    }
  }

  for (const archiveIssue of archiveRecord?.diagnostics?.issues || []) {
    issues.push(cloneJson(archiveIssue));
  }

  return {
    kind: 'directive.starshipPackageDiagnostics',
    packageId: id,
    packageVersion: version,
    status: diagnosticStatus(issues),
    issueCount: issues.length,
    issues
  };
}

export function createStarshipPackageDiagnosticsSummary(diagnostics = {}) {
  return {
    status: diagnostics.status || diagnosticStatus(diagnostics.issues || []),
    issueCount: diagnostics.issueCount ?? (diagnostics.issues || []).length,
    errorCount: (diagnostics.issues || []).filter((item) => item.severity === 'error').length,
    warningCount: (diagnostics.issues || []).filter((item) => item.severity === 'warning').length
  };
}
