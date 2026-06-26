export function runtimePackageIdForState({
  state = null,
  controller = null,
  campaignView = null
} = {}) {
  return state?.activeCampaignPackage?.packageId
    || state?.packageId
    || state?.campaign?.packageId
    || controller?.activePackageId
    || campaignView?.activePackageId
    || null;
}

export function selectActiveRuntimeAssets({
  campaignState = null,
  controller = null,
  runtimeAssetsByPackageId = new Map()
} = {}) {
  const packageId = campaignState?.activeCampaignPackage?.packageId || controller?.activePackageId;
  const assets = packageId ? runtimeAssetsByPackageId.get(packageId) : null;
  if (!assets) {
    throw new Error(`No runtime mission assets are loaded for package "${packageId || 'unknown'}"`);
  }
  return assets;
}

export function selectOptionalActiveRuntimeAssets(options = {}) {
  try {
    return selectActiveRuntimeAssets(options);
  } catch {
    return null;
  }
}

export function selectActiveCreatorRuntimeAssets({
  creatorView = null,
  controller = null,
  campaignView = null,
  runtimeAssetsByPackageId = new Map()
} = {}) {
  const packageId = creatorView?.package?.id || controller?.activePackageId || campaignView?.activePackageId;
  const assets = packageId ? runtimeAssetsByPackageId.get(packageId) : null;
  if (!assets?.packageData) {
    throw new Error(`No Character Creator package assets are loaded for package "${packageId || 'unknown'}"`);
  }
  return assets;
}

export function selectActiveMissionGraphRecord({
  assets = null,
  campaignState = null,
  sceneSnapshotOverrides = {}
} = {}) {
  const graphId = sceneSnapshotOverrides.activeMissionGraphId
    || campaignState?.mission?.activeMissionGraphId
    || assets?.missionGraphs?.[0]?.graph?.manifest?.id;
  const record = assets?.missionGraphsById?.get(graphId) || assets?.missionGraphs?.[0] || null;
  if (!record?.graph) {
    throw new Error(`No mission graph is loaded for "${graphId || 'active mission'}"`);
  }
  return record;
}

export function selectOptionalActiveMissionGraph(options = {}) {
  if (!options?.assets) return null;
  try {
    return selectActiveMissionGraphRecord(options)?.graph || null;
  } catch {
    return null;
  }
}

export function selectOptionalRuntimeAssetsForState({
  state = null,
  controller = null,
  campaignView = null,
  runtimeAssetsByPackageId = new Map()
} = {}) {
  const packageId = runtimePackageIdForState({ state, controller, campaignView });
  if (!packageId) return null;
  return runtimeAssetsByPackageId.get(packageId) || null;
}

export function selectPackageContextForState({
  state = null,
  controller = null,
  campaignView = null
} = {}) {
  const packageId = runtimePackageIdForState({ state, controller, campaignView });
  if (!packageId || typeof controller?.getPackageContext !== 'function') return null;
  try {
    return controller.getPackageContext({ packageId });
  } catch {
    return null;
  }
}
