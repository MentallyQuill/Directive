export const CAMPAIGN_PACKAGE_REQUIRED_MANIFEST_FIELDS = Object.freeze([
  'kind',
  'schemaVersion',
  'id',
  'slug',
  'title',
  'version',
  'status',
  'bundled',
  'transportExtension',
  'sourceDocuments'
]);

export const CAMPAIGN_PACKAGE_STATUSES = Object.freeze([
  'draft',
  'pre-alpha',
  'playtest',
  'stable'
]);

const STATUS_SET = new Set(CAMPAIGN_PACKAGE_STATUSES);

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

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value || {}, key);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

export function validateCampaignPackageManifestContract(packageData) {
  const issues = [];
  const manifest = packageData?.manifest;
  if (!isObject(manifest)) {
    issues.push(issue('error', 'package-manifest-missing', 'Package manifest must be an object.', {
      location: '$.manifest'
    }));
    return issues;
  }

  for (const field of CAMPAIGN_PACKAGE_REQUIRED_MANIFEST_FIELDS) {
    if (!hasOwn(manifest, field)) {
      issues.push(issue('error', 'package-manifest-field-missing', `Package manifest must define "${field}".`, {
        location: `$.manifest.${field}`,
        field
      }));
    }
  }

  if (hasOwn(manifest, 'kind') && manifest.kind !== 'directive.campaignPackage') {
    issues.push(issue('error', 'package-kind-invalid', 'Package manifest kind must be directive.campaignPackage.', {
      location: '$.manifest.kind'
    }));
  }
  if (hasOwn(manifest, 'schemaVersion') && manifest.schemaVersion !== 2) {
    issues.push(issue('error', 'package-schema-version-invalid', 'Package manifest schemaVersion must be 2.', {
      location: '$.manifest.schemaVersion'
    }));
  }
  for (const field of ['id', 'slug', 'title', 'version']) {
    if (hasOwn(manifest, field) && !nonEmptyString(manifest[field])) {
      issues.push(issue('error', `package-${field}-missing`, `Package manifest "${field}" must be a non-empty string.`, {
        location: `$.manifest.${field}`,
        field
      }));
    }
  }
  if (hasOwn(manifest, 'status') && !STATUS_SET.has(manifest.status)) {
    issues.push(issue('error', 'package-status-invalid', `Package manifest status must be one of: ${CAMPAIGN_PACKAGE_STATUSES.join(', ')}.`, {
      location: '$.manifest.status',
      status: manifest.status
    }));
  }
  if (hasOwn(manifest, 'bundled') && typeof manifest.bundled !== 'boolean') {
    issues.push(issue('error', 'package-bundled-invalid', 'Package manifest bundled must be a boolean.', {
      location: '$.manifest.bundled'
    }));
  }
  if (hasOwn(manifest, 'transportExtension') && manifest.transportExtension !== '.directive-campaign.zip') {
    issues.push(issue('error', 'package-transport-invalid', 'Package transport extension must be .directive-campaign.zip.', {
      location: '$.manifest.transportExtension'
    }));
  }
  if (hasOwn(manifest, 'sourceDocuments') && !Array.isArray(manifest.sourceDocuments)) {
    issues.push(issue('error', 'package-source-documents-invalid', 'Package manifest sourceDocuments must be an array.', {
      location: '$.manifest.sourceDocuments'
    }));
  }

  return issues;
}

export function validateCampaignPackageUnresolvedAssetPolicy(packageData) {
  const issues = [];
  const manifest = packageData?.manifest || {};
  const unresolved = Array.isArray(packageData?.assets?.unresolved) ? packageData.assets.unresolved : [];
  if (manifest.status && manifest.status !== 'draft' && unresolved.length > 0) {
    issues.push(issue('error', 'package-unresolved-assets-release-facing', 'Non-draft package manifests must not carry unresolved asset placeholders.', {
      location: '$.assets.unresolved',
      status: manifest.status,
      unresolved: cloneJson(unresolved)
    }));
  }
  return issues;
}

export function validateCampaignPackageCoreContract(packageData) {
  return [
    ...validateCampaignPackageManifestContract(packageData),
    ...validateCampaignPackageUnresolvedAssetPolicy(packageData)
  ];
}
