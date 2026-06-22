import { createCharacterCreationContext } from '../packages/campaign-package-context.mjs';

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

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function choiceMap(items = []) {
  return new Map(items.filter((item) => item?.id).map((item) => [item.id, item]));
}

function resolveChoice(items, id, label, customLabel) {
  requireNonEmptyString(id, label);
  const option = choiceMap(items).get(id);
  if (!option) {
    throw new Error(`${label} references unknown option "${id}"`);
  }

  return {
    ...cloneJson(option),
    selectedLabel: customLabel?.trim() || option.label
  };
}

function resolveTraitCategory(context, categoryId, traitId, customLabel) {
  const category = (context.options.traitCategories || []).find((item) => item.id === categoryId);
  if (!category) {
    throw new Error(`Missing trait category "${categoryId}" in character creation context`);
  }
  return resolveChoice(category.options, traitId, `creatorReview.personality.traits.${categoryId}`, customLabel);
}

function interpolate(template, variables) {
  return String(template || '').replaceAll(/\{\{([a-zA-Z0-9_.-]+)\}\}/g, (_, key) => {
    const value = variables[key];
    return value === undefined || value === null || value === '' ? '' : String(value);
  });
}

function createChoiceBundle(context, creatorReview) {
  const identity = creatorReview.identity || {};
  const service = creatorReview.service || {};
  const personality = creatorReview.personality || {};
  const traits = personality.traits || {};
  const customTraits = personality.customTraits || {};

  return {
    species: resolveChoice(context.options.allowedSpecies, identity.speciesId, 'creatorReview.identity.speciesId', identity.customSpeciesLabel),
    ageBand: resolveChoice(context.options.ageBands, identity.ageBandId, 'creatorReview.identity.ageBandId'),
    careerBackground: resolveChoice(context.options.careerBackgrounds, service.careerBackgroundId, 'creatorReview.service.careerBackgroundId'),
    formativeExperience: resolveChoice(context.options.formativeExperiences, service.formativeExperienceId, 'creatorReview.service.formativeExperienceId'),
    assignmentReason: resolveChoice(context.options.assignmentReasons, service.assignmentReasonId, 'creatorReview.service.assignmentReasonId', service.customAssignmentReason),
    traits: {
      insight: resolveTraitCategory(context, 'insight', traits.insight, customTraits.insight),
      connection: resolveTraitCategory(context, 'connection', traits.connection, customTraits.connection),
      execution: resolveTraitCategory(context, 'execution', traits.execution, customTraits.execution)
    },
    flaw: resolveChoice(context.options.flaws?.options || [], personality.flawId, 'creatorReview.personality.flawId', personality.customFlaw)
  };
}

function assertCreatorReviewReadyForCampaignStart(creatorReview) {
  const identity = creatorReview.identity || {};
  const service = creatorReview.service || {};
  const personality = creatorReview.personality || {};
  const traits = personality.traits || {};
  const required = [
    ['creatorReview.identity.name', identity.name],
    ['creatorReview.identity.pronounsOrAddress', identity.pronounsOrAddress],
    ['creatorReview.identity.speciesId', identity.speciesId],
    ['creatorReview.identity.ageBandId', identity.ageBandId],
    ['creatorReview.identity.appearance', identity.appearance],
    ['creatorReview.service.careerBackgroundId', service.careerBackgroundId],
    ['creatorReview.service.formativeExperienceId', service.formativeExperienceId],
    ['creatorReview.service.assignmentReasonId', service.assignmentReasonId],
    ['creatorReview.personality.traits.insight', traits.insight],
    ['creatorReview.personality.traits.connection', traits.connection],
    ['creatorReview.personality.traits.execution', traits.execution],
    ['creatorReview.personality.flawId', personality.flawId]
  ];

  const missing = required
    .filter(([, value]) => typeof value !== 'string' || value.trim() === '')
    .map(([label]) => label);

  if (missing.length > 0) {
    throw new Error(`creatorReview is not ready for campaign start; missing ${missing.join(', ')}`);
  }
}

function createDossier(context, creatorReview, choices) {
  const identity = creatorReview.identity || {};
  const service = creatorReview.service || {};
  const personality = creatorReview.personality || {};
  const dossier = creatorReview.dossier || {};
  const detailLevel = dossier.detailLevel || context.dossier.defaultDetailLevel || 'Standard';

  if (!context.dossier.detailLevels?.includes(detailLevel)) {
    throw new Error(`creatorReview.dossier.detailLevel references unknown detail level "${detailLevel}"`);
  }

  const variables = {
    name: identity.name,
    species: choices.species.selectedLabel,
    rank: context.lockedRole?.rank || creatorReview.role?.rank,
    billet: context.lockedRole?.billet || creatorReview.role?.billet,
    shipName: context.ship.name,
    campaignTitle: context.campaign.title,
    careerBackground: choices.careerBackground.label,
    formativeExperience: choices.formativeExperience.label,
    assignmentReason: choices.assignmentReason.selectedLabel,
    insightTrait: choices.traits.insight.selectedLabel,
    connectionTrait: choices.traits.connection.selectedLabel,
    executionTrait: choices.traits.execution.selectedLabel,
    flaw: choices.flaw.selectedLabel
  };

  const briefBiography = dossier.briefBiography?.trim()
    || interpolate(context.localFallback.biographyTemplate, variables).trim();
  const publicReputation = dossier.publicReputation?.trim()
    || interpolate(context.localFallback.publicReputationTemplate, variables).trim();

  requireNonEmptyString(briefBiography, 'creatorReview.dossier.briefBiography or local fallback biography');
  requireNonEmptyString(publicReputation, 'creatorReview.dossier.publicReputation or local fallback reputation');

  return {
    detailLevel,
    generatedBy: dossier.generatedBy || (dossier.briefBiography ? 'provider-or-player-edit' : 'localFallback'),
    identitySummary: dossier.identitySummary?.trim() || `${identity.name} is a ${choices.species.selectedLabel} ${variables.rank}.`,
    serviceSummary: dossier.serviceSummary?.trim() || `${choices.careerBackground.label}; shaped by ${choices.formativeExperience.label}.`,
    briefBiography,
    traits: dossier.traits?.trim() || `${choices.traits.insight.selectedLabel}, ${choices.traits.connection.selectedLabel}, ${choices.traits.execution.selectedLabel}; flaw: ${choices.flaw.selectedLabel}.`,
    publicReputation,
    optionalOpenThread: dossier.optionalOpenThread?.trim() || '',
    editedByPlayer: dossier.editedByPlayer === true
  };
}

export function createPlayerCharacterFromCreatorReview({ packageData, creatorReview, acceptedAt }) {
  requireObject(creatorReview, 'creatorReview');
  assertCreatorReviewReadyForCampaignStart(creatorReview);
  const context = createCharacterCreationContext(packageData);
  const identity = creatorReview.identity || {};
  const service = creatorReview.service || {};
  const personality = creatorReview.personality || {};

  const name = requireNonEmptyString(identity.name, 'creatorReview.identity.name');
  const pronounsOrAddress = requireNonEmptyString(identity.pronounsOrAddress, 'creatorReview.identity.pronounsOrAddress');
  const appearance = requireNonEmptyString(identity.appearance, 'creatorReview.identity.appearance');
  const choices = createChoiceBundle(context, creatorReview);
  const dossier = createDossier(context, creatorReview, choices);
  const role = context.roleMode === 'lockedRole' ? context.lockedRole : creatorReview.role;

  requireObject(role, 'creator role');
  requireNonEmptyString(role.rank, 'creator role rank');
  requireNonEmptyString(role.billet, 'creator role billet');

  const player = {
    id: 'player-commander',
    creationStatus: 'complete',
    name,
    pronounsOrAddress,
    rank: role.rank,
    billet: role.billet,
    role: role.commandAuthority || role.roleLabel || `${role.rank}, ${role.billet}`,
    roleMode: context.roleMode,
    shipId: context.ship.id,
    shipName: context.ship.name,
    species: {
      id: choices.species.id,
      label: choices.species.selectedLabel,
      summary: choices.species.summary
    },
    ageBand: {
      id: choices.ageBand.id,
      label: choices.ageBand.label,
      summary: choices.ageBand.summary
    },
    appearance,
    firstImpression: identity.firstImpression?.trim() || '',
    service: {
      careerBackground: choices.careerBackground,
      formativeExperience: choices.formativeExperience,
      assignmentReason: choices.assignmentReason,
      mustBeTrueFact: service.mustBeTrueFact?.trim() || ''
    },
    personality: {
      traits: choices.traits,
      flaw: choices.flaw,
      additionalGenerationNote: personality.additionalGenerationNote?.trim() || ''
    },
    dossier,
    personalValues: cloneJson(creatorReview.personalValues || []),
    creatorAcceptedAt: acceptedAt,
    adjudicationProfile: {
      role: `${role.rank}, ${role.billet}`,
      careerBackground: choices.careerBackground.label,
      formativeExperience: choices.formativeExperience.label,
      traits: [
        choices.traits.insight.selectedLabel,
        choices.traits.connection.selectedLabel,
        choices.traits.execution.selectedLabel
      ],
      flaw: choices.flaw.selectedLabel,
      specialistBoundary: 'Broad command competence; senior staff remain necessary experts in their departments.'
    }
  };
  if (identity.portrait?.kind === 'directive.playerPortrait') {
    player.portrait = cloneJson(identity.portrait);
  }
  return player;
}

export function createInitialCampaignStateFromCreatorReview({
  packageData,
  projection,
  creatorReview,
  campaignId,
  createdAt,
  simulationMode = 'Command',
  creatorDraftId = null
}) {
  requireObject(projection, 'projection');
  requireObject(projection.initialState, 'projection.initialState');
  const context = createCharacterCreationContext(packageData);

  if (projection.sourcePackage?.packageId !== context.package.id) {
    throw new Error(`Projection package id "${projection.sourcePackage?.packageId}" does not match package "${context.package.id}"`);
  }
  if (projection.sourcePackage?.campaignId !== context.campaign.id) {
    throw new Error(`Projection campaign id "${projection.sourcePackage?.campaignId}" does not match package campaign "${context.campaign.id}"`);
  }

  const id = requireNonEmptyString(campaignId, 'campaignId');
  const timestamp = requireNonEmptyString(createdAt, 'createdAt');
  const allowedModes = packageData.guardrails?.simulationModes || [];
  if (!allowedModes.includes(simulationMode)) {
    throw new Error(`simulationMode must be one of: ${allowedModes.join(', ')}`);
  }

  const player = createPlayerCharacterFromCreatorReview({
    packageData,
    creatorReview,
    acceptedAt: timestamp
  });
  if (player.portrait?.kind === 'directive.playerPortrait') {
    player.portrait = {
      ...cloneJson(player.portrait),
      owner: {
        kind: 'campaign',
        id,
        subjectId: 'player-commander'
      }
    };
  }

  const state = cloneJson(projection.initialState);
  state.campaign.id = id;
  state.campaign.status = 'activating';
  state.campaign.createdAt = timestamp;
  state.campaign.startedAt = timestamp;
  state.campaign.characterCreatorDraftId = creatorDraftId;
  state.campaign.packageTitle = context.package.title;
  state.activeCampaignPackage.packageId = context.package.id;
  state.activeCampaignPackage.packageVersion = context.package.version;
  state.player = player;
  state.values.personal = cloneJson(player.personalValues || []);
  state.ui.activeTab = 'Mission';
  state.settings.simulationMode = simulationMode;
  state.settings.allowedSimulationModes = cloneJson(allowedModes);

  state.commandLog.entries = [
    ...(state.commandLog.entries || []),
    {
      id: `campaign-start.${id}`,
      type: 'campaignStart',
      stardate: state.campaign.currentStardate,
      source: 'characterCreatorReview',
      summaryInputs: [
        `${player.name} accepted assignment as ${player.rank}, ${player.billet} aboard ${context.ship.name}.`,
        `Campaign started in ${simulationMode} mode.`
      ],
      visibleConsequences: [
        'Player character created.',
        'First mission state initialized from package projection.'
      ]
    }
  ];

  return state;
}
