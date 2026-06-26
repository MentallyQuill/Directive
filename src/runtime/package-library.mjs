import { BUNDLED_CAMPAIGN_PACKAGE_REFS } from '../packages/bundled-package-registry.mjs';

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function defaultFetchImpl() {
  if (typeof globalThis.fetch !== 'function') {
    throw new Error('Fetch is not available for Directive bundled package loading.');
  }
  return globalThis.fetch.bind(globalThis);
}

export function packageIdOf(packageData) {
  return packageData?.manifest?.id;
}

export function unwrapProjectionRecord(record) {
  return record?.projection || record;
}

function projectionPathOf(record) {
  return record?.path || '';
}

function unwrapCrewDatasetRecord(record) {
  if (!record) return null;
  return {
    path: record.path || '',
    dataset: record.dataset || record
  };
}

function unwrapMissionGraphRecords(record) {
  if (!record) return [];
  const records = Array.isArray(record) ? record : [record];
  return records.filter(Boolean).map((item) => ({
    path: item.path || '',
    graph: item.graph || item
  }));
}

function recordForPackage(records, packageId, index) {
  if (!records) return null;
  if (Array.isArray(records)) {
    return records[index] || null;
  }
  return records[packageId] || null;
}

export function indexRuntimeAssets({
  packages = [],
  projections = [],
  crewDatasets = [],
  missionGraphs = []
} = {}) {
  const byPackageId = new Map();
  packages.forEach((packageData, index) => {
    const packageId = packageIdOf(packageData);
    if (!packageId) return;
    const projectionRecord = recordForPackage(projections, packageId, index);
    const crewDatasetRecord = unwrapCrewDatasetRecord(recordForPackage(crewDatasets, packageId, index));
    const graphRecords = unwrapMissionGraphRecords(recordForPackage(missionGraphs, packageId, index));
    const missionGraphsById = new Map();
    for (const graphRecord of graphRecords) {
      const graphId = graphRecord.graph?.manifest?.id || graphRecord.graph?.id || graphRecord.path;
      if (graphId) {
        missionGraphsById.set(graphId, graphRecord);
      }
    }
    byPackageId.set(packageId, {
      packageData,
      projection: unwrapProjectionRecord(projectionRecord),
      projectionPath: projectionPathOf(projectionRecord),
      crewDataset: crewDatasetRecord?.dataset || null,
      crewDatasetPath: crewDatasetRecord?.path || '',
      missionGraphs: graphRecords,
      missionGraphsById
    });
  });
  return byPackageId;
}

export async function fetchJsonAsset(url, { fetchImpl = defaultFetchImpl() } = {}) {
  const response = await fetchImpl(url);
  if (!response?.ok) {
    throw new Error(`Directive package asset failed to load: HTTP ${response?.status || 0}`);
  }
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`Directive package asset is not valid JSON: ${error?.message || error}`);
  }
}

export async function loadBundledCampaignPackageRecords({
  refs = BUNDLED_CAMPAIGN_PACKAGE_REFS,
  fetchImpl = defaultFetchImpl()
} = {}) {
  const packages = [];
  const projections = [];
  const crewDatasets = [];
  const missionGraphs = [];
  for (const ref of refs) {
    const packageData = await fetchJsonAsset(ref.packageUrl, { fetchImpl });
    const projection = await fetchJsonAsset(ref.projectionUrl, { fetchImpl });
    const crewDataset = ref.crewDatasetUrl ? await fetchJsonAsset(ref.crewDatasetUrl, { fetchImpl }) : null;
    const graphRefs = Array.isArray(ref.missionGraphUrls) && ref.missionGraphUrls.length > 0
      ? ref.missionGraphUrls
      : ref.missionGraphUrl
        ? [{ url: ref.missionGraphUrl, path: ref.missionGraphPath || '' }]
        : [];
    const graphRecords = [];
    for (const graphRef of graphRefs) {
      const graph = await fetchJsonAsset(graphRef.url, { fetchImpl });
      graphRecords.push({
        path: graphRef.path || '',
        graph
      });
    }
    packages.push(packageData);
    projections.push({
      path: ref.projectionPath || '',
      projection
    });
    crewDatasets.push(crewDataset ? {
      path: ref.crewDatasetPath || '',
      dataset: crewDataset
    } : null);
    missionGraphs.push(graphRecords);
  }
  return { packages, projections, crewDatasets, missionGraphs };
}

function payloadPackageId(payload) {
  return payload?.sourcePackage?.packageId || payload?.manifest?.packageId || payload?.manifest?.sourcePackageId || null;
}

function importedJsonPayloadEntries(importRecord) {
  return Object.entries(importRecord?.jsonPayloads || {})
    .filter(([, value]) => isObject(value))
    .map(([path, value]) => ({ path, value }));
}

function importedProjectionRecord(importRecord) {
  const packageId = importRecord?.packageId || importRecord?.packageData?.manifest?.id || null;
  const match = importedJsonPayloadEntries(importRecord)
    .find(({ value }) => value?.manifest?.kind === 'directive.campaignStateProjection' && payloadPackageId(value) === packageId);
  return match ? { path: match.path, projection: match.value } : null;
}

function importedCrewDatasetRecord(importRecord) {
  const packageId = importRecord?.packageId || importRecord?.packageData?.manifest?.id || null;
  const match = importedJsonPayloadEntries(importRecord)
    .find(({ value }) => value?.manifest?.kind === 'directive.crewDataset' && payloadPackageId(value) === packageId);
  return match ? { path: match.path, dataset: match.value } : null;
}

function importedMissionGraphRecords(importRecord) {
  const packageId = importRecord?.packageId || importRecord?.packageData?.manifest?.id || null;
  return importedJsonPayloadEntries(importRecord)
    .filter(({ value }) => value?.manifest?.kind === 'directive.missionGraph' && payloadPackageId(value) === packageId)
    .map(({ path, value }) => ({ path, graph: value }));
}

function normalizeLoadedPackageRecords(loaded = {}) {
  const packages = Array.isArray(loaded.packages) ? loaded.packages : Object.values(loaded.packages || {});
  const projections = Array.isArray(loaded.projections) ? loaded.projections : Object.values(loaded.projections || {});
  const crewDatasets = Array.isArray(loaded.crewDatasets) ? loaded.crewDatasets : Object.values(loaded.crewDatasets || {});
  const missionGraphs = Array.isArray(loaded.missionGraphs) ? loaded.missionGraphs : Object.values(loaded.missionGraphs || {});
  return { packages, projections, crewDatasets, missionGraphs };
}

export function mergeImportedPackageRecords(baseRecords, importedRecords = []) {
  const records = normalizeLoadedPackageRecords(baseRecords);
  const byPackageId = new Map();
  records.packages.forEach((packageData, index) => {
    const packageId = packageIdOf(packageData);
    if (!packageId) return;
    byPackageId.set(packageId, {
      packageData,
      projection: records.projections[index] || null,
      crewDataset: records.crewDatasets[index] || null,
      missionGraphs: records.missionGraphs[index] || [],
      source: packageData?.manifest?.bundled === true ? 'bundled' : 'loaded'
    });
  });

  for (const importRecord of importedRecords || []) {
    if (!importRecord?.packageData || importRecord.diagnostics?.status === 'error') continue;
    const packageId = importRecord.packageId || importRecord.packageData?.manifest?.id;
    if (!packageId) continue;
    const existing = byPackageId.get(packageId) || {};
    const projection = importedProjectionRecord(importRecord);
    const crewDataset = importedCrewDatasetRecord(importRecord);
    const missionGraphs = importedMissionGraphRecords(importRecord);
    byPackageId.set(packageId, {
      packageData: importRecord.packageData,
      projection: projection || existing.projection || null,
      crewDataset: crewDataset || existing.crewDataset || null,
      missionGraphs: missionGraphs.length > 0 ? missionGraphs : existing.missionGraphs || [],
      source: 'imported'
    });
  }

  const merged = {
    packages: [],
    projections: [],
    crewDatasets: [],
    missionGraphs: [],
    sources: {}
  };
  for (const [packageId, record] of byPackageId.entries()) {
    merged.packages.push(record.packageData);
    merged.projections.push(record.projection);
    merged.crewDatasets.push(record.crewDataset);
    merged.missionGraphs.push(record.missionGraphs);
    merged.sources[packageId] = record.source;
  }
  return merged;
}

export function summarizeRuntimeAssets(runtimeAssetsByPackageId, sources = {}) {
  const summaries = {};
  for (const [packageId, assets] of runtimeAssetsByPackageId.entries()) {
    summaries[packageId] = {
      source: sources[packageId] || 'loaded',
      hasProjection: isObject(assets.projection),
      hasCrewDataset: isObject(assets.crewDataset),
      hasGuardrails: isObject(assets.packageData?.guardrails),
      hasCharacterCreationContext: isObject(assets.packageData?.characterCreation),
      hasPromptMetadata: isObject(assets.packageData?.contextPolicy)
        && assets.packageData.contextPolicy.hiddenStatePolicy === 'explicit-player-safe-projection-only',
      missionGraphCount: Array.isArray(assets.missionGraphs) ? assets.missionGraphs.length : 0
    };
  }
  return summaries;
}
