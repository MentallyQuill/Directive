import { sha256Json } from '../storage/v1-state-delta-codec.mjs';

const SOURCES = ['packageData', 'crewDataset', 'shipDataset', 'cohesionCatalog', 'missionDefinitions'];
const encoder = new TextEncoder();
function requireData(ok) {
  if (!ok) throw Object.assign(new Error('Complete, bounded authoritative package data is required.'),
    { code: 'DIRECTIVE_BRANCH_HISTORY_PACKAGE_INVALID' });
}

// Hash precisely the sources selected by indexRuntimeAssets, not its derived
// lookup Map, catalog teaser rows, provider settings or runtime service objects.
// Any change to this source selection requires a new fingerprint version.
export async function computeBranchHistoryPackageFingerprintV1(runtimeAssets) {
  requireData(runtimeAssets && typeof runtimeAssets === 'object'
    && [Object.prototype, null].includes(Object.getPrototypeOf(runtimeAssets)));
  const sources = {};
  for (const name of SOURCES) {
    const property = Object.getOwnPropertyDescriptor(runtimeAssets, name);
    requireData(property?.enumerable && Object.hasOwn(property, 'value'));
    sources[name] = property.value;
  }
  const ancestors = new Set(); let slots = 0, bytes = 0;
  const count = text => { bytes += encoder.encode(text).byteLength; requireData(bytes <= 64 * 1024 * 1024); };
  function validate(value, depth = 0) {
    requireData(++slots <= 2000000 && depth <= 64);
    if (value === null || typeof value === 'boolean' || typeof value === 'string'
      || (typeof value === 'number' && Number.isFinite(value))) {
      if (typeof value === 'string') requireData(value.length <= 64 * 1024 * 1024 - bytes);
      count(JSON.stringify(value)); return;
    }
    const array = Array.isArray(value);
    requireData(value && typeof value === 'object' && !ancestors.has(value)
      && (array ? Object.getPrototypeOf(value) === Array.prototype
        : [Object.prototype, null].includes(Object.getPrototypeOf(value))));
    const keys = Reflect.ownKeys(value);
    requireData(keys.length <= 2000000 - slots && (!array || keys.length === value.length + 1));
    ancestors.add(value); count('[]'); let index = 0;
    for (const key of keys) {
      if (array && key === 'length') continue;
      const property = Object.getOwnPropertyDescriptor(value, key);
      requireData(typeof key === 'string' && property.enumerable && Object.hasOwn(property, 'value')
        && (!array || key === String(index)));
      if (index++) count(',');
      if (!array) { count(JSON.stringify(key)); count(':'); }
      validate(property.value, depth + 1);
    }
    ancestors.delete(value);
  }
  validate(sources);
  for (const name of SOURCES.slice(0, -1)) requireData(sources[name] && !Array.isArray(sources[name]) && typeof sources[name] === 'object');
  const manifest = sources.packageData.manifest;
  requireData(typeof manifest?.id === 'string' && manifest.id.length > 0
    && typeof manifest.version === 'string' && manifest.version.length > 0
    && Array.isArray(sources.missionDefinitions) && sources.missionDefinitions.length > 0);
  const ids = new Set();
  for (const definition of sources.missionDefinitions) {
    requireData(definition?.kind === 'directive.missionDefinition.v1' && typeof definition.id === 'string'
      && definition.id.length > 0 && !ids.has(definition.id)
      && definition.packageBinding?.packageId === manifest.id
      && definition.packageBinding?.packageVersion === manifest.version);
    ids.add(definition.id);
  }
  // sha256Json canonicalizes synchronously before its hashing await. The hash
  // therefore cannot observe later caller mutation; authored array order stays.
  return sha256Json({ kind: 'directive.branchHistoryPackageFingerprint.v1', version: 1, sources });
}
