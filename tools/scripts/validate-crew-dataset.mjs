import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_SCHEMA = 'schemas/packages/crew-dataset.schema.json';
const DEFAULT_PACKAGE = 'packages/bundled/breckenridge/ashes-of-peace.starship-package.json';
const DEFAULT_DATASET = 'packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json';

const root = process.cwd();
const schemaPath = path.resolve(root, process.argv[2] || DEFAULT_SCHEMA);
const packagePath = path.resolve(root, process.argv[3] || DEFAULT_PACKAGE);
const datasetPath = path.resolve(root, process.argv[4] || DEFAULT_DATASET);

const crewCardTypes = new Set([
  'crew.profile',
  'crew.voice',
  'crew.relationship',
  'crew.reveal',
  'crew.bplot',
  'crew.coalitionRule',
  'crew.development',
  'command.styleReaction'
]);

const audiences = new Set([
  'missionDirector',
  'crewDirector',
  'shipDirector',
  'commandDirector',
  'narrator',
  'commandLog'
]);

const visibilityValues = new Set([
  'publicPackage',
  'playerKnown',
  'playerDiscoverable',
  'directorOnly',
  'lockedHidden'
]);

const playerKnowledgeValues = new Set([
  'none',
  'serviceRecord',
  'professionalConversation',
  'highTrust',
  'crisisDisclosure',
  'revealed'
]);

const requiredDevelopmentDimensions = [
  'operationalExperience',
  'playerMentorship',
  'personalArcProgress',
  'commandConfidence',
  'professionalStrain'
];

const errors = [];
const warnings = [];

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${path.relative(root, filePath)} is not valid JSON: ${error.message}`);
  }
}

function rel(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, '/');
}

function at(location, message) {
  errors.push(`${location}: ${message}`);
}

function warn(location, message) {
  warnings.push(`${location}: ${message}`);
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

function idSet(items) {
  return new Set((items || []).map((item) => item && item.id).filter(Boolean));
}

function requireUniqueIds(items, location) {
  if (!Array.isArray(items)) {
    return;
  }
  const seen = new Set();
  for (const [index, item] of items.entries()) {
    if (!item?.id) {
      continue;
    }
    if (seen.has(item.id)) {
      at(`${location}[${index}].id`, `duplicate id "${item.id}"`);
    }
    seen.add(item.id);
  }
}

function checkSourceDocument(doc, location) {
  if (!isObject(doc)) {
    at(location, 'must be an object');
    return;
  }
  requireNonEmptyString(doc.title, `${location}.title`);
  requireNonEmptyString(doc.path, `${location}.path`);
  if (doc.path && !fs.existsSync(path.resolve(root, doc.path))) {
    at(`${location}.path`, `target does not exist: ${doc.path}`);
  }
}

function checkIndex(indexMap, indexName, cardIds) {
  if (!isObject(indexMap)) {
    at(`$.indexes.${indexName}`, 'must be an object');
    return;
  }
  for (const [key, ids] of Object.entries(indexMap)) {
    if (!Array.isArray(ids)) {
      at(`$.indexes.${indexName}.${key}`, 'must be an array');
      continue;
    }
    for (const id of ids) {
      if (!cardIds.has(id)) {
        at(`$.indexes.${indexName}.${key}`, `unknown card id "${id}"`);
      }
    }
  }
}

function assertIndexed(indexMap, key, cardId, location) {
  const ids = indexMap?.[key];
  if (!Array.isArray(ids) || !ids.includes(cardId)) {
    at(location, `must include card "${cardId}"`);
  }
}

const schema = readJson(schemaPath);
const pkg = readJson(packagePath);
const dataset = readJson(datasetPath);

if (schema.title !== 'Directive Crew Dataset') {
  at('schema.title', 'must be Directive Crew Dataset');
}

const packageCrewIds = idSet(pkg.crew?.senior);
const packageRelationshipDimensions = new Set(pkg.crew?.relationshipModel?.dimensions || []);
const packageMissionIds = new Set([
  ...(pkg.mainCampaign?.chapters || []).map((chapter) => chapter.id),
  ...(pkg.missionTemplates?.main || []).map((template) => template.id),
  ...(pkg.missionTemplates?.side || []).map((template) => template.id),
  ...(pkg.missionTemplates?.bPlots || []).map((template) => template.id)
].filter(Boolean));
const packageCampaignIds = new Set([pkg.mainCampaign?.id].filter(Boolean));

if (requireObject(dataset.manifest, '$.manifest')) {
  if (dataset.manifest.kind !== 'directive.crewDataset') {
    at('$.manifest.kind', 'must be directive.crewDataset');
  }
  if (dataset.manifest.schemaVersion !== 1) {
    at('$.manifest.schemaVersion', 'must be 1');
  }
  if (dataset.manifest.packageId !== pkg.manifest?.id) {
    at('$.manifest.packageId', 'must match starship package manifest id');
  }
  if (dataset.manifest.version !== pkg.manifest?.version) {
    at('$.manifest.version', 'must match starship package version');
  }
}

if (requireArray(dataset.sources, '$.sources')) {
  dataset.sources.forEach((doc, index) => checkSourceDocument(doc, `$.sources[${index}]`));
}

if (requireArray(dataset.officers, '$.officers')) {
  requireUniqueIds(dataset.officers, '$.officers');
  for (const [index, officer] of dataset.officers.entries()) {
    if (!isObject(officer)) {
      at(`$.officers[${index}]`, 'must be an object');
      continue;
    }
    requireNonEmptyString(officer.id, `$.officers[${index}].id`);
    if (officer.id && !packageCrewIds.has(officer.id)) {
      at(`$.officers[${index}].id`, `unknown package crew id "${officer.id}"`);
    }
    if (requireArray(officer.requiredCardTypes, `$.officers[${index}].requiredCardTypes`)) {
      for (const type of officer.requiredCardTypes) {
        if (!crewCardTypes.has(type)) {
          at(`$.officers[${index}].requiredCardTypes`, `unknown crew card type "${type}"`);
        }
      }
    }
  }
}

if (requireArray(dataset.relationshipDimensions, '$.relationshipDimensions')) {
  requireUniqueIds(dataset.relationshipDimensions, '$.relationshipDimensions');
  const datasetDimensions = idSet(dataset.relationshipDimensions);
  for (const dimension of packageRelationshipDimensions) {
    if (!datasetDimensions.has(dimension)) {
      at('$.relationshipDimensions', `missing package relationship dimension "${dimension}"`);
    }
  }
  for (const dimension of dataset.relationshipDimensions) {
    if (dimension.visibility !== 'hidden') {
      at(`$.relationshipDimensions.${dimension.id}.visibility`, 'relationship dimensions must remain hidden');
    }
  }
}

if (requireArray(dataset.developmentDimensions, '$.developmentDimensions')) {
  requireUniqueIds(dataset.developmentDimensions, '$.developmentDimensions');
  const datasetDimensions = idSet(dataset.developmentDimensions);
  for (const dimension of requiredDevelopmentDimensions) {
    if (!datasetDimensions.has(dimension)) {
      at('$.developmentDimensions', `missing development dimension "${dimension}"`);
    }
  }
  for (const dimension of dataset.developmentDimensions) {
    if (dimension.visibility !== 'hidden') {
      at(`$.developmentDimensions.${dimension.id}.visibility`, 'development dimensions must remain hidden');
    }
  }
}

if (requireArray(dataset.cards, '$.cards')) {
  requireUniqueIds(dataset.cards, '$.cards');
  const cardIds = idSet(dataset.cards);
  const datasetOfficerIds = idSet(dataset.officers);
  const cardsByOfficer = new Map();
  const cardsByType = new Map();

  for (const [index, card] of dataset.cards.entries()) {
    const location = `$.cards[${index}]`;
    if (!isObject(card)) {
      at(location, 'must be an object');
      continue;
    }
    requireNonEmptyString(card.id, `${location}.id`);
    requireNonEmptyString(card.type, `${location}.type`);
    if (card.datasetId !== dataset.manifest?.id) {
      at(`${location}.datasetId`, 'must match dataset manifest id');
    }
    if (!crewCardTypes.has(card.type)) {
      at(`${location}.type`, `unknown crew dataset card type "${card.type}"`);
    }
    if (!visibilityValues.has(card.visibility)) {
      at(`${location}.visibility`, `unknown visibility "${card.visibility}"`);
    }
    if (requireArray(card.audiences, `${location}.audiences`)) {
      for (const audience of card.audiences) {
        if (!audiences.has(audience)) {
          at(`${location}.audiences`, `unknown audience "${audience}"`);
        }
      }
    }
    if (card.visibility === 'lockedHidden' && card.audiences?.includes('narrator')) {
      at(`${location}.audiences`, 'lockedHidden cards must not target narrator packets');
    }
    if (card.visibility === 'lockedHidden' && card.audiences?.includes('commandLog')) {
      at(`${location}.audiences`, 'lockedHidden cards must not target Command Log packets before reveal');
    }
    if (card.audiences?.includes('narrator') && card.payload?.narratorSafe !== true) {
      at(`${location}.payload.narratorSafe`, 'narrator audience requires narratorSafe=true');
    }
    if (card.type === 'crew.reveal' && (!card.gates || ['none', 'serviceRecord'].includes(card.gates.playerKnowledge))) {
      at(`${location}.gates.playerKnowledge`, 'crew.reveal cards must require a meaningful reveal gate');
    }
    if (card.source?.document && !fs.existsSync(path.resolve(root, card.source.document))) {
      at(`${location}.source.document`, `target does not exist: ${card.source.document}`);
    }
    if (card.gates && !playerKnowledgeValues.has(card.gates.playerKnowledge)) {
      at(`${location}.gates.playerKnowledge`, `unknown player knowledge gate "${card.gates.playerKnowledge}"`);
    }

    for (const officerId of card.scope?.characters || []) {
      if (!packageCrewIds.has(officerId)) {
        at(`${location}.scope.characters`, `unknown package crew id "${officerId}"`);
      }
      if (datasetOfficerIds.has(officerId)) {
        const list = cardsByOfficer.get(officerId) || [];
        list.push(card);
        cardsByOfficer.set(officerId, list);
      }
    }
    for (const missionId of card.scope?.missions || []) {
      if (!packageMissionIds.has(missionId)) {
        at(`${location}.scope.missions`, `unknown package mission id "${missionId}"`);
      }
    }
    for (const campaignId of card.scope?.campaigns || []) {
      if (!packageCampaignIds.has(campaignId)) {
        at(`${location}.scope.campaigns`, `unknown package campaign id "${campaignId}"`);
      }
    }

    const cardsOfType = cardsByType.get(card.type) || [];
    cardsOfType.push(card);
    cardsByType.set(card.type, cardsOfType);

    assertIndexed(dataset.indexes?.byType, card.type, card.id, `$.indexes.byType.${card.type}`);
    for (const audience of card.audiences || []) {
      assertIndexed(dataset.indexes?.byAudience, audience, card.id, `$.indexes.byAudience.${audience}`);
    }
    assertIndexed(dataset.indexes?.byRevealGate, card.gates?.playerKnowledge, card.id, `$.indexes.byRevealGate.${card.gates?.playerKnowledge}`);
  }

  if (requireObject(dataset.indexes, '$.indexes')) {
    checkIndex(dataset.indexes.byOfficer, 'byOfficer', cardIds);
    checkIndex(dataset.indexes.byType, 'byType', cardIds);
    checkIndex(dataset.indexes.byAudience, 'byAudience', cardIds);
    checkIndex(dataset.indexes.byRevealGate, 'byRevealGate', cardIds);
  }

  for (const officer of dataset.officers || []) {
    const officerCards = cardsByOfficer.get(officer.id) || [];
    const officerTypes = new Set(officerCards.map((card) => card.type));
    for (const type of officer.requiredCardTypes || []) {
      if (!officerTypes.has(type)) {
        at(`$.officers.${officer.id}.requiredCardTypes`, `missing required card type "${type}"`);
      }
    }
    for (const card of officerCards) {
      assertIndexed(dataset.indexes?.byOfficer, officer.id, card.id, `$.indexes.byOfficer.${officer.id}`);
    }
  }

  const seniorCrewCount = (pkg.crew?.senior || []).filter((member) => member?.id && member.id !== 'player-commander').length;
  const coveredSeniorCount = (dataset.officers || []).filter((officer) => officer?.id && officer.id !== 'player-commander').length;
  if (coveredSeniorCount < seniorCrewCount) {
    warn('$.officers', `pre-alpha dataset covers ${coveredSeniorCount}/${seniorCrewCount} non-player senior officers`);
  }
}

if (errors.length > 0) {
  console.error(`Crew dataset validation failed for ${rel(datasetPath)}:`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

if (warnings.length > 0) {
  console.warn(`Crew dataset validation warnings for ${rel(datasetPath)}:`);
  for (const warning of warnings) {
    console.warn(`- ${warning}`);
  }
}

console.log(`Validated ${rel(datasetPath)} against ${rel(schemaPath)} and ${rel(packagePath)}`);
