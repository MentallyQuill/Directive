import fs from 'node:fs';
import path from 'node:path';
import {
  ashesRequiredChapterIds,
  ashesRequiredCrewIds,
  expectedRootRefs,
  packageSpine,
  requiredSchemaFiles
} from './lib/directive-contracts.mjs';

const DEFAULT_SCHEMA = 'schemas/campaign-package.schema.json';
const DEFAULT_PACKAGE = 'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json';

const root = process.cwd();
const schemaPath = path.resolve(root, process.argv[2] || DEFAULT_SCHEMA);
const packagePath = path.resolve(root, process.argv[3] || DEFAULT_PACKAGE);

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${path.relative(root, filePath)} is not valid JSON: ${error.message}`);
  }
}

const schema = readJson(schemaPath);
const pkg = readJson(packagePath);
const errors = [];

const requiredCharacterFields = [
  'name',
  'pronounsOrAddress',
  'species',
  'ageBand',
  'appearance',
  'careerBackground',
  'formativeExperience',
  'assignmentReason',
  'insightTrait',
  'connectionTrait',
  'executionTrait',
  'flaw'
];

const requiredAshesSpeciesIds = [
  'human',
  'vulcan',
  'bajoran',
  'trill',
  'tellarite',
  'custom-federation-species'
];

const requiredAshesCareerBackgroundIds = [
  'command-administration',
  'operations-logistics',
  'tactical-security',
  'flight-navigation',
  'science-exploration',
  'engineering-systems',
  'medical-humanitarian',
  'diplomacy-first-contact',
  'intelligence-strategic-analysis'
];

const requiredAshesFormativeExperienceIds = [
  'dominion-war-fleet-service',
  'disaster-relief-evacuation',
  'frontier-border-service',
  'convoy-logistics-duty',
  'deep-space-exploration',
  'routine-professional-service'
];

const requiredAshesAssignmentReasonIds = [
  'requested-by-captain',
  'relevant-specialist-experience',
  'promoted-into-role',
  'experienced-outsider-transfer',
  'requested-fresh-start',
  'professional-disagreement-reassignment',
  'newly-assembled-crew',
  'creator-decides',
  'custom'
];

function rel(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, '/');
}

function at(location, message) {
  errors.push(`${location}: ${message}`);
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireObject(value, location) {
  if (!isObject(value)) {
    at(location, 'must be an object');
    return false;
  }
  return true;
}

function requireArray(value, location) {
  if (!Array.isArray(value)) {
    at(location, 'must be an array');
    return false;
  }
  return true;
}

function requireNonEmptyString(value, location) {
  if (typeof value !== 'string' || value.trim() === '') {
    at(location, 'must be a non-empty string');
    return false;
  }
  return true;
}

function sameArray(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function idSet(items) {
  return new Set((items || []).map((item) => item && item.id).filter(Boolean));
}

function requireUniqueIds(items, location) {
  if (!Array.isArray(items)) {
    return;
  }
  const seen = new Set();
  for (const [index, item] of items.entries()) {
    if (!item || !item.id) {
      continue;
    }
    if (seen.has(item.id)) {
      at(`${location}[${index}].id`, `duplicate id "${item.id}"`);
    }
    seen.add(item.id);
  }
}

function requireChoiceList(items, location, requiredIds = []) {
  const ids = new Set();
  if (!requireArray(items, location)) {
    return ids;
  }

  requireUniqueIds(items, location);
  for (const [index, item] of items.entries()) {
    if (!isObject(item)) {
      at(`${location}[${index}]`, 'must be an object');
      continue;
    }
    requireNonEmptyString(item.id, `${location}[${index}].id`);
    requireNonEmptyString(item.label, `${location}[${index}].label`);
    requireNonEmptyString(item.summary, `${location}[${index}].summary`);
    if (item.id) {
      ids.add(item.id);
    }
  }

  for (const id of requiredIds) {
    if (!ids.has(id)) {
      at(location, `missing option "${id}"`);
    }
  }

  return ids;
}

function collectRefs(value, refs = []) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectRefs(item, refs);
    }
    return refs;
  }

  if (!isObject(value)) {
    return refs;
  }

  if (typeof value.$ref === 'string') {
    refs.push(value.$ref);
  }

  for (const nested of Object.values(value)) {
    collectRefs(nested, refs);
  }

  return refs;
}

function verifySchemaRefs(schemaFile, parsed) {
  const baseDir = path.dirname(path.resolve(root, schemaFile));
  for (const ref of collectRefs(parsed)) {
    if (ref.startsWith('#')) {
      continue;
    }

    const [refPath] = ref.split('#');
    const resolved = path.resolve(baseDir, refPath);
    if (!fs.existsSync(resolved)) {
      at(schemaFile, `broken schema $ref target: ${ref}`);
    }
  }
}

function verifySplitRootSchema() {
  if (!sameArray(schema.required, packageSpine)) {
    at('schema.required', `must exactly match package spine: ${packageSpine.join(', ')}`);
  }

  if (schema.$defs && Object.keys(schema.$defs).length > 0) {
    at('schema.$defs', 'root schema must not own field-level definitions');
  }

  if (!isObject(schema.properties)) {
    at('schema.properties', 'must be an object of top-level $ref entries');
    return;
  }

  for (const key of packageSpine) {
    const expectedRef = expectedRootRefs[key];
    if (schema.properties[key]?.$ref !== expectedRef) {
      at(`schema.properties.${key}.$ref`, `must be ${expectedRef}`);
    }
  }

  for (const key of Object.keys(schema.properties)) {
    if (!packageSpine.includes(key)) {
      at(`schema.properties.${key}`, 'unexpected root schema property');
    }
  }

  const rootLines = fs.readFileSync(schemaPath, 'utf8').split(/\r?\n/).length;
  if (rootLines > 80) {
    at('schema', `root schema is ${rootLines} lines; keep it a thin composition wrapper`);
  }

  for (const schemaFile of requiredSchemaFiles) {
    const absolute = path.resolve(root, schemaFile);
    if (!fs.existsSync(absolute)) {
      at('schema', `missing split schema file: ${schemaFile}`);
      continue;
    }
    const parsed = readJson(absolute);
    if (!parsed.$id) {
      at(schemaFile, 'must declare $id');
    }
    verifySchemaRefs(schemaFile, parsed);
  }
}

verifySplitRootSchema();

const requiredTopLevel = schema.required || packageSpine;

for (const key of requiredTopLevel) {
  if (!(key in pkg)) {
    at('$', `missing top-level key "${key}"`);
  }
}

for (const key of Object.keys(pkg)) {
  if (!requiredTopLevel.includes(key)) {
    at('$', `unexpected top-level key "${key}"`);
  }
}

if (requireObject(pkg.manifest, '$.manifest')) {
  if (pkg.manifest.kind !== 'directive.campaignPackage') {
    at('$.manifest.kind', 'must be directive.campaignPackage');
  }
  if (pkg.manifest.schemaVersion !== 1) {
    at('$.manifest.schemaVersion', 'must be 1');
  }
  requireNonEmptyString(pkg.manifest.id, '$.manifest.id');
  requireNonEmptyString(pkg.manifest.slug, '$.manifest.slug');
  requireNonEmptyString(pkg.manifest.title, '$.manifest.title');
  requireNonEmptyString(pkg.manifest.version, '$.manifest.version');
  if (pkg.manifest.transportExtension !== '.directive-campaign.zip') {
    at('$.manifest.transportExtension', 'must be .directive-campaign.zip');
  }
  if (!pkg.manifest.bundled) {
    at('$.manifest.bundled', 'bundled campaign package must set bundled=true');
  }
  if (requireArray(pkg.manifest.sourceDocuments, '$.manifest.sourceDocuments')) {
    for (const [index, doc] of pkg.manifest.sourceDocuments.entries()) {
      if (!isObject(doc)) {
        at(`$.manifest.sourceDocuments[${index}]`, 'must be an object');
        continue;
      }
      requireNonEmptyString(doc.title, `$.manifest.sourceDocuments[${index}].title`);
      requireNonEmptyString(doc.path, `$.manifest.sourceDocuments[${index}].path`);
      if (doc.path && !fs.existsSync(path.resolve(root, doc.path))) {
        at(`$.manifest.sourceDocuments[${index}].path`, `target does not exist: ${doc.path}`);
      }
    }
  }
}

if (requireObject(pkg.ship, '$.ship')) {
  requireNonEmptyString(pkg.ship.id, '$.ship.id');
  requireNonEmptyString(pkg.ship.name, '$.ship.name');
  requireNonEmptyString(pkg.ship.class, '$.ship.class');
  requireNonEmptyString(pkg.ship.affiliation, '$.ship.affiliation');
  if (pkg.ship.name !== 'U.S.S. Breckenridge') {
    at('$.ship.name', 'bundled campaign ship must be U.S.S. Breckenridge');
  }
  if (pkg.ship.openingStardate !== 53049.2) {
    at('$.ship.openingStardate', 'must be 53049.2');
  }
  if (pkg.ship.registry === null) {
    const openDecisions = pkg.ship.serviceHistory?.openProductionDecisions || [];
    if (!Array.isArray(openDecisions) || !openDecisions.some((decision) => String(decision).toLowerCase().includes('registry'))) {
      at('$.ship.registry', 'null registry must be tracked in serviceHistory.openProductionDecisions');
    }
  }
  requireObject(pkg.ship.commandStructure, '$.ship.commandStructure');
  requireObject(pkg.ship.serviceHistory, '$.ship.serviceHistory');
  requireObject(pkg.ship.systems, '$.ship.systems');
}

if (requireObject(pkg.crew, '$.crew')) {
  if (requireArray(pkg.crew.senior, '$.crew.senior')) {
    requireUniqueIds(pkg.crew.senior, '$.crew.senior');
    const actual = new Set(pkg.crew.senior.map((member) => member && member.id));
    for (const id of ashesRequiredCrewIds) {
      if (!actual.has(id)) {
        at('$.crew.senior', `missing senior crew member "${id}"`);
      }
    }
    for (const [index, member] of pkg.crew.senior.entries()) {
      if (!isObject(member)) {
        at(`$.crew.senior[${index}]`, 'must be an object');
        continue;
      }
      requireNonEmptyString(member.id, `$.crew.senior[${index}].id`);
      requireNonEmptyString(member.name, `$.crew.senior[${index}].name`);
      requireNonEmptyString(member.rank, `$.crew.senior[${index}].rank`);
      requireNonEmptyString(member.billet, `$.crew.senior[${index}].billet`);
    }
  }
  if (requireObject(pkg.crew.relationshipModel, '$.crew.relationshipModel')) {
    if (pkg.crew.relationshipModel.rawValuesHidden !== true) {
      at('$.crew.relationshipModel.rawValuesHidden', 'must be true');
    }
    const dimensions = pkg.crew.relationshipModel.dimensions || [];
    for (const dimension of ['professionalConfidence', 'integrityTrust', 'personalRapport']) {
      if (!dimensions.includes(dimension)) {
        at('$.crew.relationshipModel.dimensions', `missing "${dimension}"`);
      }
    }
  }
}

if (requireObject(pkg.characterCreation, '$.characterCreation')) {
  const creator = pkg.characterCreation;

  if (creator.version !== 1) {
    at('$.characterCreation.version', 'must be 1');
  }
  if (creator.roleMode !== 'lockedRole') {
    at('$.characterCreation.roleMode', 'Ashes of Peace must use lockedRole');
  }

  if (requireObject(creator.campaignContext, '$.characterCreation.campaignContext')) {
    if (creator.campaignContext.campaignTitle !== 'Ashes of Peace') {
      at('$.characterCreation.campaignContext.campaignTitle', 'must be Ashes of Peace');
    }
    if (creator.campaignContext.currentDateOrStardate !== 'Stardate 53049.2') {
      at('$.characterCreation.campaignContext.currentDateOrStardate', 'must be Stardate 53049.2');
    }
    if (creator.campaignContext.serviceOrFaction !== 'Starfleet') {
      at('$.characterCreation.campaignContext.serviceOrFaction', 'must be Starfleet');
    }
    if (creator.campaignContext.shipName !== pkg.ship?.name) {
      at('$.characterCreation.campaignContext.shipName', 'must match $.ship.name');
    }
    if (creator.campaignContext.shipClass !== pkg.ship?.class) {
      at('$.characterCreation.campaignContext.shipClass', 'must match $.ship.class');
    }
    requireNonEmptyString(creator.campaignContext.missionProfile, '$.characterCreation.campaignContext.missionProfile');
    if (!String(creator.campaignContext.playerRoleRule || '').includes('incoming permanent Commander and Executive Officer')) {
      at('$.characterCreation.campaignContext.playerRoleRule', 'must name the locked incoming Commander/XO role');
    }
  }

  if (requireObject(creator.lockedRole, '$.characterCreation.lockedRole')) {
    if (creator.lockedRole.rank !== 'Commander') {
      at('$.characterCreation.lockedRole.rank', 'must be Commander');
    }
    if (creator.lockedRole.billet !== 'Executive Officer') {
      at('$.characterCreation.lockedRole.billet', 'must be Executive Officer');
    }
    if (creator.lockedRole.shipId !== pkg.ship?.id) {
      at('$.characterCreation.lockedRole.shipId', 'must match $.ship.id');
    }
    if (creator.lockedRole.shipName !== pkg.ship?.name) {
      at('$.characterCreation.lockedRole.shipName', 'must match $.ship.name');
    }
    if (creator.lockedRole.captainId !== 'mara-whitaker') {
      at('$.characterCreation.lockedRole.captainId', 'must be mara-whitaker');
    }
    requireNonEmptyString(creator.lockedRole.commandAuthority, '$.characterCreation.lockedRole.commandAuthority');
    requireNonEmptyString(creator.lockedRole.captainAuthorityBoundary, '$.characterCreation.lockedRole.captainAuthorityBoundary');
  }

  if (requireObject(creator.flow, '$.characterCreation.flow')) {
    if (!sameArray(creator.flow.steps, ['identity', 'service', 'personality', 'review'])) {
      at('$.characterCreation.flow.steps', 'must be identity, service, personality, review');
    }
    if (creator.flow.targetCompletionMinutes?.min !== 3 || creator.flow.targetCompletionMinutes?.max !== 5) {
      at('$.characterCreation.flow.targetCompletionMinutes', 'must be 3 to 5 minutes');
    }
    if (creator.flow.mobileFirst !== true) {
      at('$.characterCreation.flow.mobileFirst', 'must be true');
    }
  }

  if (requireArray(creator.requiredFields, '$.characterCreation.requiredFields')) {
    for (const field of requiredCharacterFields) {
      if (!creator.requiredFields.includes(field)) {
        at('$.characterCreation.requiredFields', `missing "${field}"`);
      }
    }
  }
  if (requireArray(creator.optionalFields, '$.characterCreation.optionalFields')) {
    for (const field of ['firstImpression', 'mustBeTrueFact', 'additionalGenerationNote', 'openThread']) {
      if (!creator.optionalFields.includes(field)) {
        at('$.characterCreation.optionalFields', `missing "${field}"`);
      }
    }
  }

  requireChoiceList(creator.ageBands, '$.characterCreation.ageBands', [
    'young-for-role',
    'mid-career',
    'experienced',
    'late-career'
  ]);
  requireChoiceList(creator.allowedSpecies, '$.characterCreation.allowedSpecies', requiredAshesSpeciesIds);
  requireChoiceList(creator.careerBackgrounds, '$.characterCreation.careerBackgrounds', requiredAshesCareerBackgroundIds);
  requireChoiceList(creator.formativeExperiences, '$.characterCreation.formativeExperiences', requiredAshesFormativeExperienceIds);
  requireChoiceList(creator.assignmentReasons, '$.characterCreation.assignmentReasons', requiredAshesAssignmentReasonIds);

  if (requireArray(creator.traitCategories, '$.characterCreation.traitCategories')) {
    requireUniqueIds(creator.traitCategories, '$.characterCreation.traitCategories');
    const categories = new Map();
    for (const [index, category] of creator.traitCategories.entries()) {
      if (!isObject(category)) {
        at(`$.characterCreation.traitCategories[${index}]`, 'must be an object');
        continue;
      }
      requireNonEmptyString(category.id, `$.characterCreation.traitCategories[${index}].id`);
      requireNonEmptyString(category.label, `$.characterCreation.traitCategories[${index}].label`);
      if (category.requiredSelections !== 1) {
        at(`$.characterCreation.traitCategories[${index}].requiredSelections`, 'must be 1');
      }
      if (category.customAllowed !== true) {
        at(`$.characterCreation.traitCategories[${index}].customAllowed`, 'must be true');
      }
      requireChoiceList(category.options, `$.characterCreation.traitCategories[${index}].options`);
      categories.set(category.id, category);
    }
    for (const id of ['insight', 'connection', 'execution']) {
      if (!categories.has(id)) {
        at('$.characterCreation.traitCategories', `missing "${id}"`);
      }
    }
  }

  if (requireObject(creator.flaws, '$.characterCreation.flaws')) {
    if (creator.flaws.requiredSelections !== 1) {
      at('$.characterCreation.flaws.requiredSelections', 'must be 1');
    }
    if (creator.flaws.customAllowed !== true) {
      at('$.characterCreation.flaws.customAllowed', 'must be true');
    }
    requireChoiceList(creator.flaws.options, '$.characterCreation.flaws.options', [
      'guarded',
      'stubborn',
      'impatient',
      'controlling',
      'proud',
      'distrustful',
      'overprotective',
      'rigid'
    ]);
  }

  if (requireObject(creator.dossier, '$.characterCreation.dossier')) {
    for (const section of ['identitySummary', 'serviceSummary', 'briefBiography', 'traits', 'publicReputation']) {
      if (!creator.dossier.sections?.includes(section)) {
        at('$.characterCreation.dossier.sections', `missing "${section}"`);
      }
    }
    if (creator.dossier.biographyWordTarget?.min !== 150 || creator.dossier.biographyWordTarget?.max !== 250) {
      at('$.characterCreation.dossier.biographyWordTarget', 'must be 150 to 250 words');
    }
    if (!sameArray(creator.dossier.detailLevels, ['Minimal', 'Standard', 'Detailed'])) {
      at('$.characterCreation.dossier.detailLevels', 'must be Minimal, Standard, Detailed');
    }
    if (creator.dossier.defaultDetailLevel !== 'Standard') {
      at('$.characterCreation.dossier.defaultDetailLevel', 'must be Standard');
    }
    if (creator.dossier.providerCallPreferred !== true) {
      at('$.characterCreation.dossier.providerCallPreferred', 'must be true');
    }
    if (creator.dossier.localFallbackRequired !== true) {
      at('$.characterCreation.dossier.localFallbackRequired', 'must be true');
    }
  }

  if (requireObject(creator.generationRules, '$.characterCreation.generationRules')) {
    if (!Array.isArray(creator.generationRules.must) || creator.generationRules.must.length === 0) {
      at('$.characterCreation.generationRules.must', 'must be a non-empty array');
    }
    if (!Array.isArray(creator.generationRules.mustNot) || creator.generationRules.mustNot.length === 0) {
      at('$.characterCreation.generationRules.mustNot', 'must be a non-empty array');
    }
    const forbiddenText = (creator.generationRules.mustNot || []).join(' ').toLowerCase();
    for (const phrase of ['secret ancestry', 'current breckenridge crew', 'campaign secrets']) {
      if (!forbiddenText.includes(phrase)) {
        at('$.characterCreation.generationRules.mustNot', `must forbid "${phrase}"`);
      }
    }
  }

  requireChoiceList(creator.continuityGuardrails, '$.characterCreation.continuityGuardrails', [
    'xo-authority',
    'captain-final-command',
    'new-to-crew',
    'campaign-secret-safety',
    'specialist-boundary'
  ]);

  if (requireObject(creator.localFallback, '$.characterCreation.localFallback')) {
    requireNonEmptyString(creator.localFallback.biographyTemplate, '$.characterCreation.localFallback.biographyTemplate');
    requireNonEmptyString(creator.localFallback.publicReputationTemplate, '$.characterCreation.localFallback.publicReputationTemplate');
  }
}

if (requireObject(pkg.mainCampaign, '$.mainCampaign')) {
  if (pkg.mainCampaign.id !== 'ashes-of-peace') {
    at('$.mainCampaign.id', 'must be ashes-of-peace');
  }
  if (pkg.mainCampaign.openingStardate !== 53049.2) {
    at('$.mainCampaign.openingStardate', 'must be 53049.2');
  }
  if (pkg.mainCampaign.theater !== 'Asterion Reach') {
    at('$.mainCampaign.theater', 'must be Asterion Reach');
  }

  if (requireArray(pkg.mainCampaign.stateTracks, '$.mainCampaign.stateTracks')) {
    requireUniqueIds(pkg.mainCampaign.stateTracks, '$.mainCampaign.stateTracks');
    const requiredTracks = [
      'regional-trust',
      'lantern-escalation',
      'humanitarian-strain',
      'starfleet-scrutiny',
      'compact-unity'
    ];
    const tracks = new Map(pkg.mainCampaign.stateTracks.map((track) => [track && track.id, track]));
    for (const id of requiredTracks) {
      if (!tracks.has(id)) {
        at('$.mainCampaign.stateTracks', `missing state track "${id}"`);
      }
    }
    for (const [id, initial] of [
      ['regional-trust', 2],
      ['lantern-escalation', 2],
      ['humanitarian-strain', 3],
      ['starfleet-scrutiny', 1]
    ]) {
      if (tracks.has(id) && tracks.get(id).initial !== initial) {
        at(`$.mainCampaign.stateTracks.${id}.initial`, `must be ${initial}`);
      }
    }
  }

  if (requireArray(pkg.mainCampaign.campaignAssets, '$.mainCampaign.campaignAssets')) {
    requireUniqueIds(pkg.mainCampaign.campaignAssets, '$.mainCampaign.campaignAssets');
    for (const [index, asset] of pkg.mainCampaign.campaignAssets.entries()) {
      if (!isObject(asset)) {
        at(`$.mainCampaign.campaignAssets[${index}]`, 'must be an object');
        continue;
      }
      requireNonEmptyString(asset.id, `$.mainCampaign.campaignAssets[${index}].id`);
      requireNonEmptyString(asset.label, `$.mainCampaign.campaignAssets[${index}].label`);
      if (asset.defaultState !== 'unearned') {
        at(`$.mainCampaign.campaignAssets[${index}].defaultState`, 'must start as unearned');
      }
    }
  }

  if (requireArray(pkg.mainCampaign.chapters, '$.mainCampaign.chapters')) {
    requireUniqueIds(pkg.mainCampaign.chapters, '$.mainCampaign.chapters');
    const chapterIds = new Set(pkg.mainCampaign.chapters.map((chapter) => chapter && chapter.id));
    for (const id of ashesRequiredChapterIds) {
      if (!chapterIds.has(id)) {
        at('$.mainCampaign.chapters', `missing chapter "${id}"`);
      }
    }
  }
}

if (requireObject(pkg.sideMissionRules, '$.sideMissionRules')) {
  if (requireArray(pkg.sideMissionRules.openOrders, '$.sideMissionRules.openOrders')) {
    requireUniqueIds(pkg.sideMissionRules.openOrders, '$.sideMissionRules.openOrders');
    if (pkg.sideMissionRules.openOrders.length !== 3) {
      at('$.sideMissionRules.openOrders', 'must contain exactly three Open Orders intervals for Ashes of Peace');
    }
    const chapterIds = idSet(pkg.mainCampaign?.chapters);
    const sideTemplateIds = idSet(pkg.missionTemplates?.side);
    for (const interval of pkg.sideMissionRules.openOrders) {
      if (!isObject(interval)) {
        continue;
      }
      if (interval.afterChapter && !chapterIds.has(interval.afterChapter)) {
        at(`$.sideMissionRules.openOrders.${interval.id}.afterChapter`, `unknown chapter "${interval.afterChapter}"`);
      }
      if (isObject(interval) && Array.isArray(interval.sideAssignments) && interval.sideAssignments.length !== 3) {
        at(`$.sideMissionRules.openOrders.${interval.id}.sideAssignments`, 'must contain exactly three side assignments');
      }
      for (const assignmentId of interval.sideAssignments || []) {
        if (!sideTemplateIds.has(assignmentId)) {
          at(`$.sideMissionRules.openOrders.${interval.id}.sideAssignments`, `unknown side mission template "${assignmentId}"`);
        }
      }
    }
  }
  if (pkg.sideMissionRules.generationPolicy?.stateInheritanceRequired !== true) {
    at('$.sideMissionRules.generationPolicy.stateInheritanceRequired', 'must be true');
  }
  if (pkg.sideMissionRules.generationPolicy?.outcomePersistenceRequired !== true) {
    at('$.sideMissionRules.generationPolicy.outcomePersistenceRequired', 'must be true');
  }
}

if (requireObject(pkg.missionTemplates, '$.missionTemplates')) {
  for (const key of ['main', 'side', 'bPlots']) {
    requireArray(pkg.missionTemplates[key], `$.missionTemplates.${key}`);
    requireUniqueIds(pkg.missionTemplates[key], `$.missionTemplates.${key}`);
  }
  if (Array.isArray(pkg.missionTemplates.side) && pkg.missionTemplates.side.length !== 9) {
    at('$.missionTemplates.side', 'must contain the nine designed side assignments');
  }
  const chapterTemplates = idSet(pkg.missionTemplates.main);
  const openOrdersIds = idSet(pkg.sideMissionRules?.openOrders);
  for (const chapter of pkg.mainCampaign?.chapters || []) {
    if (!chapter?.id || openOrdersIds.has(chapter.id)) {
      continue;
    }
    if (!chapterTemplates.has(chapter.id)) {
      at('$.missionTemplates.main', `missing template for chapter "${chapter.id}"`);
    }
  }
}

if (requireObject(pkg.guardrails, '$.guardrails')) {
  const modes = pkg.guardrails.simulationModes || [];
  if (!Array.isArray(modes) || modes.length !== 2 || !modes.includes('Exploration') || !modes.includes('Command')) {
    at('$.guardrails.simulationModes', 'must contain exactly Exploration and Command');
  }
  for (const key of ['missionDirectionRules', 'hiddenInformation', 'failurePolicy', 'playerFacingInfo']) {
    if (!Array.isArray(pkg.guardrails[key]) || pkg.guardrails[key].length === 0) {
      at(`$.guardrails.${key}`, 'must be a non-empty array');
    }
  }
}

if (requireObject(pkg.assets, '$.assets')) {
  requireArray(pkg.assets.images, '$.assets.images');
  if (Array.isArray(pkg.assets.datasets)) {
    for (const [index, dataset] of pkg.assets.datasets.entries()) {
      if (!isObject(dataset)) {
        at(`$.assets.datasets[${index}]`, 'must be an object');
        continue;
      }
      requireNonEmptyString(dataset.kind, `$.assets.datasets[${index}].kind`);
      requireNonEmptyString(dataset.id, `$.assets.datasets[${index}].id`);
      requireNonEmptyString(dataset.path, `$.assets.datasets[${index}].path`);
      if (dataset.path && !fs.existsSync(path.resolve(root, dataset.path))) {
        at(`$.assets.datasets[${index}].path`, `target does not exist: ${dataset.path}`);
      }
      if (dataset.schema && !fs.existsSync(path.resolve(root, dataset.schema))) {
        at(`$.assets.datasets[${index}].schema`, `target does not exist: ${dataset.schema}`);
      }
    }
  }
  if (requireArray(pkg.assets.documents, '$.assets.documents')) {
    for (const [index, doc] of pkg.assets.documents.entries()) {
      if (doc.path && !fs.existsSync(path.resolve(root, doc.path))) {
        at(`$.assets.documents[${index}].path`, `target does not exist: ${doc.path}`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error(`Campaign package validation failed for ${rel(packagePath)}:`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Validated ${rel(packagePath)} against ${rel(schemaPath)}`);
