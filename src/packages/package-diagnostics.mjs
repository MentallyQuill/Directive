import { getCampaignPackageSpineErrors } from './campaign-package-context.mjs';

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

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function ids(values = []) {
  return new Set((Array.isArray(values) ? values : []).map((item) => item?.id).filter(Boolean));
}

const CHECKPOINT_SOURCES = new Set(['preOutcomeSnapshot', 'lastStableAutosave', 'packageCheckpoint']);
const SNAPSHOT_RETENTION_MODES = new Set(['untilTerminalDecisionResolved', 'untilCampaignConclusion', 'packageDefault']);

function union(...sets) {
  const next = new Set();
  for (const set of sets) {
    for (const value of set || []) next.add(value);
  }
  return next;
}

function walkPredicate(predicate, visit) {
  if (!isObject(predicate)) return;
  visit(predicate);
  for (const key of ['all', 'any', 'none']) {
    for (const child of array(predicate[key])) walkPredicate(child, visit);
  }
  if (predicate.not !== undefined) walkPredicate(predicate.not, visit);
}

function validatePredicateRefs(predicate, {
  packageData,
  issues,
  conditionId = null,
  location = ''
} = {}) {
  const questIds = ids(packageData?.questTemplates?.templates);
  const trackIds = ids(packageData?.world?.stateTracks);
  const actorIds = ids(packageData?.world?.actors);
  const crewIds = ids(packageData?.crew?.senior);
  const actorOrCrewIds = union(actorIds, crewIds);
  const check = (refType, refId, allowed) => {
    if (!refId || allowed.has(refId)) return;
    issues.push(issue('error', 'package-end-condition-predicate-reference-missing', 'End condition predicate references an unknown package id.', {
      conditionId,
      location,
      refType,
      refId
    }));
  };
  walkPredicate(predicate, (node) => {
    switch (node.type) {
      case 'questStatus':
        check('quest', node.questId || node.id, questIds);
        break;
      case 'worldTrack':
        check('worldTrack', node.trackId || node.id, trackIds);
        break;
      case 'actorStatus':
        check('actor', node.actorId || node.id, actorOrCrewIds);
        break;
      case 'crewStatus':
        check('crew', node.crewId || node.id, crewIds);
        break;
      default:
        break;
    }
  });
}

export function diagnoseCampaignPackageRecord({
  packageData,
  projection = null,
  crewDataset = null,
  missionGraphs = [],
  campaignState = null,
  archiveRecord = null
} = {}) {
  const issues = [];
  const spineErrors = getCampaignPackageSpineErrors(packageData);
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
  if (packageData?.manifest?.kind && packageData.manifest.kind !== 'directive.campaignPackage') {
    issues.push(issue('error', 'package-kind-invalid', 'Package manifest kind must be directive.campaignPackage.'));
  }
  if (packageData?.manifest?.transportExtension && packageData.manifest.transportExtension !== '.directive-campaign.zip') {
    issues.push(issue('error', 'package-transport-invalid', 'Package transport extension must be .directive-campaign.zip.'));
  }

  if (!isObject(packageData?.endConditions)) {
    issues.push(issue('error', 'package-end-conditions-missing', 'Campaign package must provide endConditions.'));
  } else {
    if (packageData.endConditions.version !== 1) {
      issues.push(issue('error', 'package-end-conditions-version-invalid', 'Campaign package endConditions version must be 1.'));
    }
    const defaultCheckpointPolicy = packageData.endConditions.defaultCheckpointPolicy || {};
    if (!CHECKPOINT_SOURCES.has(defaultCheckpointPolicy.preferred)) {
      issues.push(issue('error', 'package-end-conditions-default-checkpoint-invalid', 'Campaign package default checkpoint policy must define a valid preferred source.'));
    }
    for (const source of array(defaultCheckpointPolicy.fallbacks)) {
      if (!CHECKPOINT_SOURCES.has(source)) {
        issues.push(issue('error', 'package-end-conditions-default-checkpoint-invalid', 'Campaign package default checkpoint policy has an unknown fallback source.', { source }));
      }
    }
    if (!SNAPSHOT_RETENTION_MODES.has(defaultCheckpointPolicy.snapshotRetention)) {
      issues.push(issue('error', 'package-end-conditions-default-retention-missing', 'Campaign package default checkpoint policy must define snapshot retention.'));
    }
    const conditionIds = ids(packageData.endConditions.conditions);
    const frameIds = ids(packageData.endConditions.continuationFrames);
    if (conditionIds.size !== (Array.isArray(packageData.endConditions.conditions) ? packageData.endConditions.conditions.length : 0)) {
      issues.push(issue('error', 'package-end-conditions-duplicate-condition', 'Campaign package end condition ids must be unique.'));
    }
    if (frameIds.size !== (Array.isArray(packageData.endConditions.continuationFrames) ? packageData.endConditions.continuationFrames.length : 0)) {
      issues.push(issue('error', 'package-end-conditions-duplicate-frame', 'Campaign package continuation frame ids must be unique.'));
    }
    for (const condition of packageData.endConditions.conditions || []) {
      const checkpointPolicy = condition.checkpointPolicy || {};
      if (!CHECKPOINT_SOURCES.has(checkpointPolicy.preferred)) {
        issues.push(issue('error', 'package-end-condition-checkpoint-invalid', 'End condition must define a valid preferred checkpoint source.', { conditionId: condition.id || null }));
      }
      for (const source of array(checkpointPolicy.fallbacks)) {
        if (!CHECKPOINT_SOURCES.has(source)) {
          issues.push(issue('error', 'package-end-condition-checkpoint-invalid', 'End condition has an unknown checkpoint fallback source.', {
            conditionId: condition.id || null,
            source
          }));
        }
      }
      if (!SNAPSHOT_RETENTION_MODES.has(checkpointPolicy.snapshotRetention)) {
        issues.push(issue('error', 'package-end-condition-retention-missing', 'End condition checkpoint policy must define snapshot retention.', { conditionId: condition.id || null }));
      }
      for (const frameId of condition.continuationFrameIds || []) {
        if (!frameIds.has(frameId)) {
          issues.push(issue('error', 'package-end-condition-frame-missing', 'End condition references an unknown continuation frame.', {
            conditionId: condition.id || null,
            frameId
          }));
        }
      }
      validatePredicateRefs(condition.trigger, {
        packageData,
        issues,
        conditionId: condition.id || null,
        location: '$.endConditions.conditions[].trigger'
      });
      for (const [index, rule] of array(condition.finalCampaignBandRules).entries()) {
        validatePredicateRefs(rule?.when, {
          packageData,
          issues,
          conditionId: condition.id || null,
          location: `$.endConditions.conditions[].finalCampaignBandRules[${index}].when`
        });
      }
    }
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

  const campaignPackageId = campaignState?.activeCampaignPackage?.packageId || null;
  const campaignPackageVersion = campaignState?.activeCampaignPackage?.packageVersion || null;
  if (campaignState && id && campaignPackageId && campaignPackageId !== id) {
    issues.push(issue('error', 'campaign-package-mismatch', 'Campaign save points at a different campaign package id.', {
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
    kind: 'directive.campaignPackageDiagnostics',
    packageId: id,
    packageVersion: version,
    status: diagnosticStatus(issues),
    issueCount: issues.length,
    issues
  };
}

export function createCampaignPackageDiagnosticsSummary(diagnostics = {}) {
  return {
    status: diagnostics.status || diagnosticStatus(diagnostics.issues || []),
    issueCount: diagnostics.issueCount ?? (diagnostics.issues || []).length,
    errorCount: (diagnostics.issues || []).filter((item) => item.severity === 'error').length,
    warningCount: (diagnostics.issues || []).filter((item) => item.severity === 'warning').length
  };
}
