export const CAMPAIGN_PACKAGE_SPINE = [
  'manifest', 'ship', 'crew', 'characterCreation', 'world', 'storyArcs',
  'endConditions', 'questTemplates', 'threadTemplates', 'reactionRules',
  'directorCards', 'contextPolicy', 'guardrails', 'assets'
];

function cloneJson(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function requireObject(value, label) { if (!isObject(value)) throw new Error(`${label} must be an object`); }
function cloneArray(value) { return Array.isArray(value) ? cloneJson(value) : []; }
function campaignRecord(packageData) { return packageData.storyArcs?.campaign || {}; }
function labelFromId(value) {
  return String(value || '')
    .split(/[-_\s]+/g)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function createTraitCategoryOptions(creation) {
  const explicit = cloneArray(creation.traitCategories);
  if (explicit.length > 0) return explicit;
  if (!isObject(creation.traits)) return [];
  return Object.entries(creation.traits)
    .filter(([, options]) => Array.isArray(options))
    .map(([id, options]) => ({
      id,
      label: labelFromId(id),
      options: cloneArray(options)
    }));
}

function createFlawOptions(creation) {
  if (Array.isArray(creation.flaws)) {
    return {
      requiredSelections: 1,
      customAllowed: false,
      options: cloneArray(creation.flaws)
    };
  }
  return cloneJson(creation.flaws || { requiredSelections: 0, customAllowed: false, options: [] });
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
  return cloneArray(packageData.crew?.senior).filter((crew) => crew.id).map((crew) => ({ id: crew.id, name: crew.name, rank: crew.rank, billet: crew.billet, species: crew.species, packageRole: crew.packageRole || '' }));
}

function createQuestPreview(packageData) {
  return cloneArray(packageData.questTemplates?.templates)
    .filter((quest) => ['onboarding', 'main', 'epilogue'].includes(quest.kind))
    .map((quest) => ({ id: quest.id, kind: quest.kind, title: quest.title, question: quest.dramaticQuestion, locationIds: cloneArray(quest.anchors?.locationIds) }));
}

function createEndConditionPreview(packageData) {
  return cloneArray(packageData.endConditions?.conditions)
    .map((condition) => ({
      id: condition.id,
      family: condition.family,
      severity: condition.severity,
      title: condition.title,
      defaultTerminalOutcomeBand: condition.defaultTerminalOutcomeBand
    }));
}

export function getCampaignPackageSpineErrors(packageData) {
  const errors = [];
  if (!isObject(packageData)) return ['packageData must be an object'];
  for (const key of CAMPAIGN_PACKAGE_SPINE) if (!(key in packageData)) errors.push(`missing top-level key "${key}"`);
  for (const key of Object.keys(packageData)) if (!CAMPAIGN_PACKAGE_SPINE.includes(key)) errors.push(`unexpected top-level key "${key}"`);
  return errors;
}

export function assertCampaignPackageSpine(packageData) {
  const errors = getCampaignPackageSpineErrors(packageData);
  if (errors.length) throw new Error(`Invalid campaign package spine:\n${errors.map((error) => `- ${error}`).join('\n')}`);
}

export function createCampaignPackageSummary(packageData) {
  assertCampaignPackageSpine(packageData);
  requireObject(packageData.manifest, 'packageData.manifest');
  requireObject(packageData.ship, 'packageData.ship');
  requireObject(packageData.storyArcs, 'packageData.storyArcs');
  requireObject(packageData.endConditions, 'packageData.endConditions');
  requireObject(packageData.characterCreation, 'packageData.characterCreation');
  const campaign = campaignRecord(packageData);
  const storyArcs = cloneArray(packageData.storyArcs?.arcs);
  const templates = cloneArray(packageData.questTemplates?.templates);
  return {
    packageId: packageData.manifest.id,
    slug: packageData.manifest.slug,
    title: packageData.manifest.title,
    version: packageData.manifest.version,
    status: packageData.manifest.status,
    bundled: packageData.manifest.bundled === true,
    transportExtension: packageData.manifest.transportExtension,
    ship: { id: packageData.ship.id, name: packageData.ship.name, class: packageData.ship.class, affiliation: packageData.ship.affiliation, registry: packageData.ship.registry || null, openingStardate: packageData.ship.openingStardate, openingCondition: packageData.ship.openingCondition || '' },
    campaign: {
      id: campaign.id,
      title: campaign.title,
      theater: campaign.theater,
      openingStardate: campaign.openingStardate,
      openingYear: campaign.openingYear || packageData.guardrails?.canonEra?.year || null,
      highConcept: campaign.highConcept || '',
      thesis: campaign.thesis || '',
      eraLabel: createCampaignEraLabel(packageData),
      structure: {
        model: 'open-world',
        expectedSessions: campaign.expectedSessions || null,
        storyArcCount: storyArcs.length,
        endConditionCount: cloneArray(packageData.endConditions?.conditions).length,
        continuationFrameCount: cloneArray(packageData.endConditions?.continuationFrames).length,
        questTemplateCount: templates.length,
        mainQuestCount: templates.filter((quest) => ['onboarding', 'main', 'epilogue'].includes(quest.kind)).length,
        sideQuestCount: templates.filter((quest) => ['side', 'dynamic-side'].includes(quest.kind)).length,
        locationCount: cloneArray(packageData.world?.locations).length
      },
      quests: createQuestPreview(packageData)
    },
    endConditions: createEndConditionPreview(packageData),
    playerRole: {
      mode: packageData.characterCreation.roleMode,
      label: packageData.characterCreation.lockedRole?.roleLabel || packageData.characterCreation.campaignContext?.playerRoleRule || '',
      rank: packageData.characterCreation.lockedRole?.rank || '',
      billet: packageData.characterCreation.lockedRole?.billet || '',
      authority: packageData.characterCreation.lockedRole?.commandAuthority || packageData.ship.commandStructure?.playerRole || ''
    },
    simulationModes: cloneArray(packageData.guardrails?.simulationModes),
    defaultSimulationMode: packageData.guardrails?.defaultSimulationMode || packageData.guardrails?.defaultDifficultyMode || null,
    seniorCrewPreview: createSeniorCrewPreview(packageData),
    assets: {
      images: cloneArray(packageData.assets?.images)
    },
    datasetCount: cloneArray(packageData.assets?.datasets).length
  };
}

export function createCharacterCreationContext(packageData) {
  assertCampaignPackageSpine(packageData);
  const creation = packageData.characterCreation;
  const campaign = campaignRecord(packageData);
  const lockedRole = creation.roleMode === 'lockedRole' ? creation.lockedRole : null;
  return {
    package: { id: packageData.manifest.id, slug: packageData.manifest.slug, title: packageData.manifest.title, version: packageData.manifest.version, status: packageData.manifest.status },
    campaign: { id: campaign.id, title: campaign.title, theater: campaign.theater, openingStardate: campaign.openingStardate },
    ship: { id: packageData.ship.id, name: packageData.ship.name, class: packageData.ship.class, affiliation: packageData.ship.affiliation, registry: packageData.ship.registry || null },
    defaultSimulationMode: packageData.guardrails?.defaultSimulationMode || packageData.guardrails?.defaultDifficultyMode || null,
    roleMode: creation.roleMode,
    lockedRole: lockedRole ? cloneJson(lockedRole) : null,
    selectableRoles: cloneArray(creation.selectableRoles),
    campaignContext: cloneJson(creation.campaignContext || {}),
    flow: cloneJson(creation.flow || {}),
    fields: { required: cloneArray(creation.requiredFields), optional: cloneArray(creation.optionalFields) },
    options: {
      ageBands: cloneArray(creation.ageBands), allowedSpecies: cloneArray(creation.allowedSpecies), careerBackgrounds: cloneArray(creation.careerBackgrounds),
      formativeExperiences: cloneArray(creation.formativeExperiences), assignmentReasons: cloneArray(creation.assignmentReasons), traitCategories: createTraitCategoryOptions(creation),
      flaws: createFlawOptions(creation)
    },
    dossier: cloneJson(creation.dossier || {}), generationRules: cloneJson(creation.generationRules || {}), continuityGuardrails: cloneArray(creation.continuityGuardrails), localFallback: cloneJson(creation.localFallback || {})
  };
}
