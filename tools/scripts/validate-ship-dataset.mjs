import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const schemaPath = path.resolve(root, process.argv[2] || 'schemas/packages/ship-dataset.schema.json');
const packagePath = path.resolve(root, process.argv[3] || 'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const datasetPath = path.resolve(root, process.argv[4] || 'packages/bundled/breckenridge/breckenridge-intrepid-class.ship-dataset.json');
const errors = [];
const warnings = [];
const validAudiences = new Set(['missionDirector', 'crewDirector', 'shipDirector', 'commandDirector', 'narrator', 'commandLog']);
const validVisibilities = new Set(['publicPackage', 'playerKnown', 'playerDiscoverable', 'directorOnly', 'lockedHidden']);
const validKnowledgeGates = new Set(['none', 'serviceRecord', 'professionalConversation', 'highTrust', 'crisisDisclosure', 'revealed']);

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${path.relative(root, filePath)} is not valid JSON: ${error.message}`);
  }
}

function rel(filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/');
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

function requireArray(value, location, { min = 0 } = {}) {
  if (!Array.isArray(value)) {
    at(location, 'must be an array');
    return [];
  }
  if (value.length < min) {
    at(location, `must contain at least ${min} item(s)`);
  }
  return value;
}

function requireText(value, location) {
  if (typeof value !== 'string' || value.trim() === '') {
    at(location, 'must be a non-empty string');
    return '';
  }
  return value;
}

function idSet(values = []) {
  return new Set((Array.isArray(values) ? values : []).map((item) => item?.id).filter(Boolean));
}

function requireUniqueIds(values = [], location) {
  const seen = new Set();
  for (const [index, value] of requireArray(values, location).entries()) {
    if (!isObject(value)) {
      at(`${location}[${index}]`, 'must be an object');
      continue;
    }
    const id = requireText(value.id, `${location}[${index}].id`);
    if (!id) continue;
    if (seen.has(id)) {
      at(`${location}[${index}].id`, `duplicate id "${id}"`);
    }
    seen.add(id);
  }
  return seen;
}

function indexedIds(index = {}) {
  return new Set(Object.values(index || {}).flatMap((values) => Array.isArray(values) ? values : []));
}

function assertIndexed(index = {}, key, cardId, location) {
  if (!key) return;
  const values = Array.isArray(index?.[key]) ? index[key] : [];
  if (!values.includes(cardId)) {
    at(location, `must include card id "${cardId}"`);
  }
}

function checkIndex(index = {}, name, allowedCardIds) {
  if (!isObject(index)) {
    at(`$.indexes.${name}`, 'must be an object');
    return;
  }
  for (const [key, values] of Object.entries(index)) {
    if (!Array.isArray(values)) {
      at(`$.indexes.${name}.${key}`, 'must be an array');
      continue;
    }
    for (const cardId of values) {
      if (!allowedCardIds.has(cardId)) {
        at(`$.indexes.${name}.${key}`, `unknown card id "${cardId}"`);
      }
    }
  }
}

function checkSourceDocument(source, location) {
  if (!requireObject(source, location)) return;
  requireText(source.title, `${location}.title`);
  const sourcePath = requireText(source.path, `${location}.path`);
  requireText(source.role, `${location}.role`);
  if (sourcePath && !fs.existsSync(path.resolve(root, sourcePath))) {
    at(`${location}.path`, `source does not exist: ${sourcePath}`);
  }
}

function checkArea(area, location) {
  if (!requireObject(area, location)) return;
  requireText(area.name, `${location}.name`);
  requireArray(area.decks, `${location}.decks`, { min: 1 });
  requireText(area.zone, `${location}.zone`);
  requireArray(area.functions, `${location}.functions`, { min: 1 });
  requireArray(area.hardFacts, `${location}.hardFacts`, { min: 1 });
  requireArray(area.textures, `${location}.textures`, { min: 1 });
  requireArray(area.constraints, `${location}.constraints`, { min: 1 });
  requireArray(area.keywords, `${location}.keywords`, { min: 1 });
}

function checkSystem(system, location) {
  if (!requireObject(system, location)) return;
  requireText(system.name, `${location}.name`);
  requireText(system.scope, `${location}.scope`);
  requireText(system.capability, `${location}.capability`);
  requireArray(system.dependencies, `${location}.dependencies`, { min: 1 });
  requireArray(system.failureModes, `${location}.failureModes`, { min: 1 });
  requireArray(system.sceneUses, `${location}.sceneUses`, { min: 1 });
  requireArray(system.keywords, `${location}.keywords`, { min: 1 });
}

function checkCard(card, location, { datasetId, areaIds, systemIds }) {
  if (!requireObject(card, location)) return;
  const cardId = requireText(card.id, `${location}.id`);
  requireText(card.type, `${location}.type`);
  if (!String(card.type || '').startsWith('ship.')) {
    at(`${location}.type`, 'ship dataset cards must use ship.* card types');
  }
  requireText(card.title, `${location}.title`);
  if (card.datasetId !== datasetId) {
    at(`${location}.datasetId`, 'must match dataset manifest id');
  }
  if (!requireObject(card.source, `${location}.source`)) return;
  requireText(card.source.document, `${location}.source.document`);
  requireArray(card.source.refs, `${location}.source.refs`, { min: 1 });
  if (!validVisibilities.has(card.visibility)) {
    at(`${location}.visibility`, `must be one of ${[...validVisibilities].join(', ')}`);
  }
  const audiences = requireArray(card.audiences, `${location}.audiences`, { min: 1 });
  for (const audience of audiences) {
    if (!validAudiences.has(audience)) {
      at(`${location}.audiences`, `unknown audience "${audience}"`);
    }
  }
  if (card.visibility === 'lockedHidden' && audiences.some((audience) => ['narrator', 'commandLog'].includes(audience))) {
    at(`${location}.audiences`, 'lockedHidden cards must not target player-facing packets');
  }
  if (!requireObject(card.scope, `${location}.scope`)) return;
  for (const areaId of card.scope.locations || []) {
    if (!areaIds.has(areaId)) {
      at(`${location}.scope.locations`, `unknown ship area "${areaId}"`);
    }
  }
  for (const systemId of card.scope.systems || []) {
    if (!systemIds.has(systemId)) {
      at(`${location}.scope.systems`, `unknown ship system "${systemId}"`);
    }
  }
  if (!requireObject(card.gates, `${location}.gates`)) return;
  if (!validKnowledgeGates.has(card.gates.playerKnowledge)) {
    at(`${location}.gates.playerKnowledge`, `unknown player knowledge gate "${card.gates.playerKnowledge}"`);
  }
  if (!requireObject(card.retrieval, `${location}.retrieval`)) return;
  requireArray(card.retrieval.lanes, `${location}.retrieval.lanes`, { min: 1 });
  requireArray(card.retrieval.keywords, `${location}.retrieval.keywords`, { min: 1 });
  if (!['low', 'normal', 'high', 'critical'].includes(card.retrieval.priority)) {
    at(`${location}.retrieval.priority`, 'must be low, normal, high, or critical');
  }
  if (!requireObject(card.payload, `${location}.payload`)) return;
  requireText(card.payload.summary, `${location}.payload.summary`);
  requireArray(card.payload.constraints, `${location}.payload.constraints`, { min: 1 });
  if (card.payload.narratorSafe !== true && card.audiences?.includes('narrator')) {
    at(`${location}.payload.narratorSafe`, 'narrator cards must set narratorSafe true');
  }
  if (!Array.isArray(card.payload.hardAnchors) || card.payload.hardAnchors.length === 0) {
    warn(`${location}.payload.hardAnchors`, 'ship cards should provide hard anchors for CPM materialization');
  }
  if (cardId.includes('shuttlebay')) {
    const serialized = JSON.stringify(card);
    if (!/Deck 10|aft|astern/i.test(serialized) || !/underside|saucer/i.test(serialized)) {
      at(location, 'shuttlebay card must carry Deck 10/aft/astern facts and saucer-underside prohibition');
    }
  }
}

readJson(schemaPath);
const pkg = readJson(packagePath);
const dataset = readJson(datasetPath);

if (requireObject(dataset.manifest, '$.manifest')) {
  if (dataset.manifest.kind !== 'directive.shipDataset') at('$.manifest.kind', 'must be directive.shipDataset');
  if (dataset.manifest.schemaVersion !== 1) at('$.manifest.schemaVersion', 'must be 1');
  if (dataset.manifest.packageId !== pkg.manifest?.id) at('$.manifest.packageId', 'must match package manifest id');
  if (dataset.manifest.shipId !== pkg.ship?.id) at('$.manifest.shipId', 'must match package ship id');
  if (dataset.manifest.version !== pkg.manifest?.version) at('$.manifest.version', 'must match package manifest version');
  requireText(dataset.manifest.classId, '$.manifest.classId');
  requireText(dataset.manifest.title, '$.manifest.title');
  requireText(dataset.manifest.status, '$.manifest.status');
}

for (const [index, source] of requireArray(dataset.sources, '$.sources', { min: 1 }).entries()) {
  checkSourceDocument(source, `$.sources[${index}]`);
}

const areaIds = requireUniqueIds(dataset.areas, '$.areas');
for (const [index, area] of (dataset.areas || []).entries()) {
  checkArea(area, `$.areas[${index}]`);
}
const systemIds = requireUniqueIds(dataset.systems, '$.systems');
for (const [index, system] of (dataset.systems || []).entries()) {
  checkSystem(system, `$.systems[${index}]`);
}
const cardIds = requireUniqueIds(dataset.cards, '$.cards');
for (const [index, card] of (dataset.cards || []).entries()) {
  checkCard(card, `$.cards[${index}]`, {
    datasetId: dataset.manifest?.id,
    areaIds,
    systemIds
  });
  for (const areaId of card.scope?.locations || []) {
    assertIndexed(dataset.indexes?.byArea, areaId, card.id, `$.indexes.byArea.${areaId}`);
  }
  for (const systemId of card.scope?.systems || []) {
    assertIndexed(dataset.indexes?.bySystem, systemId, card.id, `$.indexes.bySystem.${systemId}`);
  }
  assertIndexed(dataset.indexes?.byType, card.type, card.id, `$.indexes.byType.${card.type}`);
  for (const audience of card.audiences || []) {
    assertIndexed(dataset.indexes?.byAudience, audience, card.id, `$.indexes.byAudience.${audience}`);
  }
  assertIndexed(dataset.indexes?.byRevealGate, card.gates?.playerKnowledge, card.id, `$.indexes.byRevealGate.${card.gates?.playerKnowledge}`);
}

if (requireObject(dataset.indexes, '$.indexes')) {
  checkIndex(dataset.indexes.byArea, 'byArea', cardIds);
  checkIndex(dataset.indexes.bySystem, 'bySystem', cardIds);
  checkIndex(dataset.indexes.byType, 'byType', cardIds);
  checkIndex(dataset.indexes.byAudience, 'byAudience', cardIds);
  checkIndex(dataset.indexes.byRevealGate, 'byRevealGate', cardIds);
  checkIndex(dataset.indexes.byKeyword, 'byKeyword', cardIds);
}

const indexedByArea = indexedIds(dataset.indexes?.byArea);
for (const card of dataset.cards || []) {
  const hasAreaScope = Array.isArray(card.scope?.locations) && card.scope.locations.length > 0;
  if (hasAreaScope && !indexedByArea.has(card.id)) {
    at('$.indexes.byArea', `card "${card.id}" scopes a location but is not indexed by area`);
  }
}

const asset = (pkg.assets?.datasets || []).find((entry) => entry?.id === dataset.manifest?.id);
if (!asset) {
  at('$.package.assets.datasets', `package must list ship dataset asset "${dataset.manifest?.id}"`);
} else {
  if (asset.kind !== 'ship') at('$.package.assets.datasets.ship.kind', 'must be ship');
  if (asset.path !== rel(datasetPath)) at('$.package.assets.datasets.ship.path', `must be ${rel(datasetPath)}`);
  if (asset.schema !== rel(schemaPath)) at('$.package.assets.datasets.ship.schema', `must be ${rel(schemaPath)}`);
}

if (errors.length) {
  console.error(`Ship dataset validation failed for ${rel(datasetPath)}:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
if (warnings.length) {
  console.warn(`Ship dataset validation warnings for ${rel(datasetPath)}:`);
  for (const warning of warnings) console.warn(`- ${warning}`);
}
console.log(`Validated ${rel(datasetPath)} against ${rel(schemaPath)} and ${rel(packagePath)}`);
