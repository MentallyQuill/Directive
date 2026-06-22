export const STARSHIP_PACKAGE_SPINE = [
  'manifest',
  'ship',
  'crew',
  'characterCreation',
  'mainCampaign',
  'sideMissionRules',
  'missionTemplates',
  'guardrails',
  'promptInjection',
  'assets'
];

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireObject(value, label) {
  if (!isObject(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function cloneArray(value) {
  return Array.isArray(value) ? cloneJson(value) : [];
}

function cloneObject(value) {
  return isObject(value) ? cloneJson(value) : {};
}

function createCampaignEraLabel(packageData) {
  const contextEra = packageData.characterCreation?.campaignContext?.eraLabel;
  if (contextEra) return contextEra;
  const canonEra = packageData.guardrails?.canonEra || {};
  const parts = [];
  if (canonEra.year) parts.push(String(canonEra.year));
  if (canonEra.postDominionWar) parts.push('after the Dominion War');
  if (canonEra.voyagerStatus) parts.push(canonEra.voyagerStatus);
  return parts.join(', ');
}

function createSeniorCrewPreview(packageData) {
  return cloneArray(packageData.crew?.senior)
    .filter((crew) => crew.id && crew.id !== 'player-commander')
    .map((crew) => ({
      id: crew.id,
      name: crew.name,
      rank: crew.rank,
      billet: crew.billet,
      species: crew.species,
      packageRole: crew.packageRole || ''
    }));
}

function createChapterPreview(packageData) {
  return cloneArray(packageData.mainCampaign?.chapters)
    .map((chapter) => ({
      id: chapter.id,
      type: chapter.type,
      title: chapter.title,
      question: chapter.question,
      stardateRange: chapter.stardateRange
    }));
}

export function getStarshipPackageSpineErrors(packageData) {
  const errors = [];
  if (!isObject(packageData)) {
    return ['packageData must be an object'];
  }

  for (const key of STARSHIP_PACKAGE_SPINE) {
    if (!(key in packageData)) {
      errors.push(`missing top-level key "${key}"`);
    }
  }

  for (const key of Object.keys(packageData)) {
    if (!STARSHIP_PACKAGE_SPINE.includes(key)) {
      errors.push(`unexpected top-level key "${key}"`);
    }
  }

  return errors;
}

export function assertStarshipPackageSpine(packageData) {
  const errors = getStarshipPackageSpineErrors(packageData);
  if (errors.length > 0) {
    throw new Error(`Invalid starship package spine:\n${errors.map((error) => `- ${error}`).join('\n')}`);
  }
}

export function createStarshipPackageSummary(packageData) {
  assertStarshipPackageSpine(packageData);
  requireObject(packageData.manifest, 'packageData.manifest');
  requireObject(packageData.ship, 'packageData.ship');
  requireObject(packageData.mainCampaign, 'packageData.mainCampaign');
  requireObject(packageData.characterCreation, 'packageData.characterCreation');

  return {
    packageId: packageData.manifest.id,
    slug: packageData.manifest.slug,
    title: packageData.manifest.title,
    version: packageData.manifest.version,
    status: packageData.manifest.status,
    bundled: packageData.manifest.bundled === true,
    transportExtension: packageData.manifest.transportExtension,
    ship: {
      id: packageData.ship.id,
      name: packageData.ship.name,
      class: packageData.ship.class,
      affiliation: packageData.ship.affiliation,
      openingStardate: packageData.ship.openingStardate,
      openingCondition: packageData.ship.openingCondition || ''
    },
    campaign: {
      id: packageData.mainCampaign.id,
      title: packageData.mainCampaign.title,
      theater: packageData.mainCampaign.theater,
      openingStardate: packageData.mainCampaign.openingStardate,
      openingYear: packageData.mainCampaign.openingYear || packageData.guardrails?.canonEra?.year || null,
      highConcept: packageData.mainCampaign.highConcept || '',
      thesis: packageData.mainCampaign.thesis || '',
      eraLabel: createCampaignEraLabel(packageData),
      structure: cloneObject(packageData.mainCampaign.structure),
      chapters: createChapterPreview(packageData)
    },
    playerRole: {
      mode: packageData.characterCreation.roleMode,
      label: packageData.characterCreation.lockedRole?.roleLabel || packageData.characterCreation.campaignContext?.playerRoleRule || '',
      rank: packageData.characterCreation.lockedRole?.rank || '',
      billet: packageData.characterCreation.lockedRole?.billet || '',
      authority: packageData.characterCreation.lockedRole?.commandAuthority || packageData.ship.commandStructure?.playerRole || ''
    },
    simulationModes: cloneArray(packageData.guardrails?.simulationModes),
    seniorCrewPreview: createSeniorCrewPreview(packageData),
    datasetCount: Array.isArray(packageData.assets?.datasets) ? packageData.assets.datasets.length : 0
  };
}

export function createCharacterCreationContext(packageData) {
  assertStarshipPackageSpine(packageData);
  requireObject(packageData.manifest, 'packageData.manifest');
  requireObject(packageData.ship, 'packageData.ship');
  requireObject(packageData.mainCampaign, 'packageData.mainCampaign');
  requireObject(packageData.characterCreation, 'packageData.characterCreation');

  const creation = packageData.characterCreation;
  const lockedRole = creation.roleMode === 'lockedRole' ? creation.lockedRole : null;

  return {
    package: {
      id: packageData.manifest.id,
      slug: packageData.manifest.slug,
      title: packageData.manifest.title,
      version: packageData.manifest.version,
      status: packageData.manifest.status
    },
    campaign: {
      id: packageData.mainCampaign.id,
      title: packageData.mainCampaign.title,
      theater: packageData.mainCampaign.theater,
      openingStardate: packageData.mainCampaign.openingStardate
    },
    ship: {
      id: packageData.ship.id,
      name: packageData.ship.name,
      class: packageData.ship.class,
      affiliation: packageData.ship.affiliation
    },
    roleMode: creation.roleMode,
    lockedRole: lockedRole ? cloneJson(lockedRole) : null,
    selectableRoles: cloneArray(creation.selectableRoles),
    campaignContext: cloneJson(creation.campaignContext || {}),
    flow: cloneJson(creation.flow || {}),
    fields: {
      required: cloneArray(creation.requiredFields),
      optional: cloneArray(creation.optionalFields)
    },
    options: {
      ageBands: cloneArray(creation.ageBands),
      allowedSpecies: cloneArray(creation.allowedSpecies),
      careerBackgrounds: cloneArray(creation.careerBackgrounds),
      formativeExperiences: cloneArray(creation.formativeExperiences),
      assignmentReasons: cloneArray(creation.assignmentReasons),
      traitCategories: cloneArray(creation.traitCategories),
      flaws: cloneJson(creation.flaws || { requiredSelections: 0, customAllowed: false, options: [] })
    },
    dossier: cloneJson(creation.dossier || {}),
    generationRules: cloneJson(creation.generationRules || {}),
    continuityGuardrails: cloneArray(creation.continuityGuardrails),
    localFallback: cloneJson(creation.localFallback || {})
  };
}
