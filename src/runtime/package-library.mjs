import {
  ASHES_V1_BUNDLED_REF,
  ASHES_V1_PACKAGE_ID,
  V1_CAMPAIGN_LIBRARY_TEASERS
} from '../packages/bundled-package-registry.mjs';
import { validateShipMechanicsPackage } from '../ship/v1/ship-mechanics-contracts.mjs';

function object(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url);
  if (!response?.ok) throw new Error(`Directive V1 asset failed to load: HTTP ${response?.status || 0}`);
  const value = await response.json();
  if (!object(value)) throw new Error('Directive V1 asset must be a JSON object.');
  return value;
}

export function packageIdOf(packageData) {
  return packageData?.manifest?.id || null;
}

export async function loadBundledCampaignPackageRecords({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  ref = ASHES_V1_BUNDLED_REF
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Fetch is unavailable for Directive V1 package loading.');
  const [packageData, crewDataset, shipDataset, ...missionDefinitions] = await Promise.all([
    fetchJson(ref.packageUrl, fetchImpl),
    fetchJson(ref.crewDatasetUrl, fetchImpl),
    fetchJson(ref.shipDatasetUrl, fetchImpl),
    ...ref.missionDefinitionRefs.map((definitionRef) => fetchJson(definitionRef.url, fetchImpl))
  ]);
  if (packageIdOf(packageData) !== ASHES_V1_PACKAGE_ID) {
    throw new Error('Directive V1 bundled package identity mismatch.');
  }
  for (const definition of missionDefinitions) {
    if (definition.kind !== 'directive.missionDefinition.v1'
      || definition.packageBinding?.packageId !== ASHES_V1_PACKAGE_ID
      || definition.packageBinding?.packageVersion !== packageData.manifest?.version) {
      throw new Error(`Directive V1 rejects mission definition "${definition.id || 'unknown'}".`);
    }
  }
  const shipMechanics = validateShipMechanicsPackage({ shipDataset, missionDefinitions });
  if (!shipMechanics.ok) {
    throw new Error(`Directive V1 rejects Ship mechanics: ${shipMechanics.errors.join('; ')}`);
  }
  return {
    packageData,
    crewDataset,
    shipDataset,
    missionDefinitions,
    campaignLibrary: V1_CAMPAIGN_LIBRARY_TEASERS
  };
}

export function indexRuntimeAssets(records = {}) {
  if (packageIdOf(records.packageData) !== ASHES_V1_PACKAGE_ID) {
    throw new Error('Directive V1 runtime assets require the Ashes package.');
  }
  const missionDefinitions = Array.isArray(records.missionDefinitions) ? records.missionDefinitions : [];
  return new Map([[ASHES_V1_PACKAGE_ID, {
    packageData: records.packageData,
    crewDataset: records.crewDataset,
    shipDataset: records.shipDataset,
    missionDefinitions,
    missionDefinitionsById: new Map(missionDefinitions.map((definition) => [definition.id, definition]))
  }]]);
}

export function summarizeRuntimeAssets(runtimeAssetsByPackageId) {
  const assets = runtimeAssetsByPackageId.get(ASHES_V1_PACKAGE_ID);
  return {
    [ASHES_V1_PACKAGE_ID]: {
      source: 'bundled-v1',
      v1Native: Boolean(
        assets?.packageData
        && assets?.crewDataset
        && assets?.shipDataset
        && assets?.missionDefinitions?.length
      ),
      hasCrewDataset: object(assets?.crewDataset),
      hasShipDataset: object(assets?.shipDataset),
      missionDefinitionCount: assets?.missionDefinitions?.length || 0
    }
  };
}

export function createV1CampaignLibrary() {
  return structuredClone(V1_CAMPAIGN_LIBRARY_TEASERS);
}
