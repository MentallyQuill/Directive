export const V1_GAMEPLAY_ARCHITECTURE_ID = 'directive.v1GameplayArchitecture.storySettlement';
export const V1_RUNTIME_ARCHITECTURE_KIND = 'directive.gameplayArchitecture.v1';
export const V1_RUNTIME_ARCHITECTURE_CONTRACT_VERSION = 1;
export const V1_SEMANTIC_AUTHORITY = 'storySettlement';

function compact(value) {
  return String(value ?? '').trim();
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function result(mode, reasonCode, { stamp = null, definition = null } = {}) {
  return {
    ok: mode !== 'blocked',
    mode,
    reasonCode,
    stamp: cloneJson(stamp),
    definition
  };
}

function safeReasonCode(value, fallback = 'definition-unavailable') {
  const reason = compact(value).slice(0, 120);
  return /^[a-z0-9][a-z0-9._:-]*$/i.test(reason) ? reason : fallback;
}

export function createV1RuntimeArchitectureStamp({ packageData = null } = {}) {
  const manifest = packageData?.manifest;
  if (!isObject(manifest) || manifest.architecture !== V1_GAMEPLAY_ARCHITECTURE_ID) return null;
  const packageId = compact(manifest.id);
  const packageVersion = compact(manifest.version);
  if (!packageId || !packageVersion) return null;
  return {
    kind: V1_RUNTIME_ARCHITECTURE_KIND,
    contractVersion: V1_RUNTIME_ARCHITECTURE_CONTRACT_VERSION,
    semanticAuthority: V1_SEMANTIC_AUTHORITY,
    packageId,
    packageVersion,
    createdForNewSave: true
  };
}

function validStamp(stamp) {
  return isObject(stamp)
    && stamp.kind === V1_RUNTIME_ARCHITECTURE_KIND
    && stamp.contractVersion === V1_RUNTIME_ARCHITECTURE_CONTRACT_VERSION
    && stamp.semanticAuthority === V1_SEMANTIC_AUTHORITY
    && Boolean(compact(stamp.packageId))
    && Boolean(compact(stamp.packageVersion))
    && stamp.createdForNewSave === true;
}

export function resolveV1SemanticAuthority({
  campaignState = {},
  runtimeAssets = {},
  definitionResolution = null
} = {}) {
  const stamp = campaignState?.campaign?.runtimeArchitecture;
  if (stamp === null || stamp === undefined) {
    return result('blocked', 'authority-stamp-absent');
  }
  if (!validStamp(stamp)) {
    return result('blocked', 'authority-stamp-invalid', { stamp });
  }

  const activePackage = campaignState?.activeCampaignPackage || {};
  if (compact(activePackage.packageId) !== compact(stamp.packageId)
    || compact(activePackage.packageVersion) !== compact(stamp.packageVersion)) {
    return result('blocked', 'active-package-mismatch', { stamp });
  }

  const runtimeManifest = runtimeAssets?.packageData?.manifest || {};
  if (runtimeManifest.architecture !== V1_GAMEPLAY_ARCHITECTURE_ID
    || compact(runtimeManifest.id) !== compact(stamp.packageId)
    || compact(runtimeManifest.version) !== compact(stamp.packageVersion)) {
    return result('blocked', 'runtime-package-mismatch', { stamp });
  }

  if (!definitionResolution || definitionResolution.ok !== true) {
    return result('blocked', safeReasonCode(definitionResolution?.reasonCode), { stamp });
  }
  const definition = definitionResolution.definition;
  const binding = definition?.packageBinding || {};
  if (!isObject(definition)
    || compact(binding.packageId) !== compact(stamp.packageId)
    || compact(binding.packageVersion) !== compact(stamp.packageVersion)
    || compact(binding.sourceId) !== compact(campaignState?.mission?.activeMissionId)) {
    return result('blocked', 'definition-package-mismatch', { stamp });
  }

  return result('authoritative', null, { stamp, definition });
}
