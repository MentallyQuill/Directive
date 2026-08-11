export const CAMPAIGN_PACKAGE_SPINE = Object.freeze([
  'manifest',
  'campaign',
  'ship',
  'crew',
  'characterCreation',
  'world',
  'guardrails',
  'assets'
]);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function object(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function array(value) {
  return Array.isArray(value) ? clone(value) : [];
}

function requireObject(value, label, errors) {
  if (!object(value)) errors.push(`${label} must be an object`);
}

function requireText(value, label, errors) {
  if (!text(value)) errors.push(`${label} must be a non-empty string`);
}

export function getCampaignPackageSpineErrors(packageData) {
  const errors = [];
  if (!object(packageData)) return ['packageData must be an object'];
  for (const key of CAMPAIGN_PACKAGE_SPINE) {
    if (!(key in packageData)) errors.push(`missing top-level key "${key}"`);
  }
  for (const key of Object.keys(packageData)) {
    if (!CAMPAIGN_PACKAGE_SPINE.includes(key)) errors.push(`unexpected top-level key "${key}"`);
  }
  for (const key of CAMPAIGN_PACKAGE_SPINE) requireObject(packageData[key], `packageData.${key}`, errors);
  if (errors.length) return errors;

  if (packageData.manifest.kind !== 'directive.campaignPackage.v1') {
    errors.push('packageData.manifest.kind must equal "directive.campaignPackage.v1"');
  }
  if (packageData.manifest.schemaVersion !== 1) {
    errors.push('packageData.manifest.schemaVersion must equal 1');
  }
  for (const [value, label] of [
    [packageData.manifest.id, 'packageData.manifest.id'],
    [packageData.manifest.slug, 'packageData.manifest.slug'],
    [packageData.manifest.title, 'packageData.manifest.title'],
    [packageData.manifest.version, 'packageData.manifest.version'],
    [packageData.manifest.openingMissionId, 'packageData.manifest.openingMissionId'],
    [packageData.campaign.id, 'packageData.campaign.id'],
    [packageData.campaign.title, 'packageData.campaign.title'],
    [packageData.campaign.theater, 'packageData.campaign.theater'],
    [packageData.campaign.highConcept, 'packageData.campaign.highConcept'],
    [packageData.campaign.openingMessage, 'packageData.campaign.openingMessage'],
    [packageData.ship.id, 'packageData.ship.id'],
    [packageData.ship.name, 'packageData.ship.name'],
    [packageData.world.id, 'packageData.world.id'],
    [packageData.world.openingLocationId, 'packageData.world.openingLocationId']
  ]) requireText(value, label, errors);
  const openingContext = packageData.campaign.openingContext;
  requireObject(openingContext, 'packageData.campaign.openingContext', errors);
  if (object(openingContext)) {
    requireText(
      openingContext.continuitySummary,
      'packageData.campaign.openingContext.continuitySummary',
      errors
    );
    requireText(
      openingContext.firstPlayableScene,
      'packageData.campaign.openingContext.firstPlayableScene',
      errors
    );
    if (!Array.isArray(openingContext.firstSceneGuidance) || openingContext.firstSceneGuidance.length === 0) {
      errors.push('packageData.campaign.openingContext.firstSceneGuidance must be a non-empty array');
    } else {
      openingContext.firstSceneGuidance.forEach((entry, index) => {
        requireText(
          entry,
          `packageData.campaign.openingContext.firstSceneGuidance[${index}]`,
          errors
        );
      });
    }
  }
  if (!Number.isFinite(Number(packageData.manifest.openingMinuteOfDay))) {
    errors.push('packageData.manifest.openingMinuteOfDay must be numeric');
  }
  if (!Number.isFinite(Number(packageData.campaign.openingStardate))) {
    errors.push('packageData.campaign.openingStardate must be numeric');
  }
  if (!Array.isArray(packageData.crew.senior)) errors.push('packageData.crew.senior must be an array');
  if (!Array.isArray(packageData.guardrails.simulationModes) || packageData.guardrails.simulationModes.length === 0) {
    errors.push('packageData.guardrails.simulationModes must be a non-empty array');
  }
  if (!Array.isArray(packageData.assets.images)) errors.push('packageData.assets.images must be an array');
  return errors;
}

export function assertCampaignPackageSpine(packageData) {
  const errors = getCampaignPackageSpineErrors(packageData);
  if (errors.length) {
    throw new Error(`Invalid Directive V1 campaign package:\n${errors.map((error) => `- ${error}`).join('\n')}`);
  }
  return packageData;
}

export function createCampaignPackageSummary(packageData) {
  assertCampaignPackageSpine(packageData);
  const creation = packageData.characterCreation;
  return {
    packageId: packageData.manifest.id,
    slug: packageData.manifest.slug,
    title: packageData.manifest.title,
    version: packageData.manifest.version,
    status: packageData.manifest.status,
    bundled: packageData.manifest.bundled === true,
    campaign: clone(packageData.campaign),
    ship: {
      id: packageData.ship.id,
      name: packageData.ship.name,
      class: packageData.ship.class,
      affiliation: packageData.ship.affiliation,
      registry: packageData.ship.registry || null,
      openingStardate: packageData.ship.openingStardate,
      openingCondition: packageData.ship.openingCondition
    },
    playerRole: {
      mode: creation.roleMode,
      label: creation.lockedRole?.roleLabel || '',
      rank: creation.lockedRole?.rank || '',
      billet: creation.lockedRole?.billet || '',
      authority: creation.lockedRole?.commandAuthority || ''
    },
    simulationModes: array(packageData.guardrails.simulationModes),
    defaultSimulationMode: packageData.guardrails.defaultSimulationMode,
    seniorCrewPreview: array(packageData.crew.senior)
      .filter((crew) => text(crew.id))
      .map(({ id, name, rank, billet, species, packageRole = '' }) => ({
        id, name, rank, billet, species, packageRole
      })),
    assets: { images: array(packageData.assets.images) }
  };
}

export function createCharacterCreationContext(packageData) {
  assertCampaignPackageSpine(packageData);
  const creation = packageData.characterCreation;
  return {
    package: {
      id: packageData.manifest.id,
      slug: packageData.manifest.slug,
      title: packageData.manifest.title,
      version: packageData.manifest.version,
      status: packageData.manifest.status
    },
    campaign: {
      id: packageData.campaign.id,
      title: packageData.campaign.title,
      theater: packageData.campaign.theater,
      openingStardate: packageData.campaign.openingStardate
    },
    ship: {
      id: packageData.ship.id,
      name: packageData.ship.name,
      class: packageData.ship.class,
      affiliation: packageData.ship.affiliation,
      registry: packageData.ship.registry || null
    },
    defaultSimulationMode: packageData.guardrails.defaultSimulationMode,
    roleMode: creation.roleMode,
    lockedRole: clone(creation.lockedRole || null),
    selectableRoles: array(creation.selectableRoles),
    campaignContext: clone(creation.campaignContext || {}),
    flow: clone(creation.flow || {}),
    fields: {
      required: array(creation.requiredFields),
      optional: array(creation.optionalFields)
    },
    options: {
      ageBands: array(creation.ageBands),
      allowedSpecies: array(creation.allowedSpecies),
      careerBackgrounds: array(creation.careerBackgrounds),
      formativeExperiences: array(creation.formativeExperiences),
      assignmentReasons: array(creation.assignmentReasons),
      traitCategories: array(creation.traitCategories),
      flaws: clone(creation.flaws || { requiredSelections: 0, customAllowed: false, options: [] })
    },
    dossier: clone(creation.dossier || {}),
    generationRules: clone(creation.generationRules || {}),
    continuityGuardrails: array(creation.continuityGuardrails),
    localFallback: clone(creation.localFallback || {})
  };
}
