import fs from 'node:fs';
import path from 'node:path';
import { validateCampaignPackageCoreContract } from '../../src/packages/package-contract.mjs';
import {
  ashesRequiredCrewIds,
  ashesRequiredQuestIds,
  expectedRootRefs,
  ashesRequiredContinuationFrameIds,
  ashesRequiredEndConditionIds,
  packageSpine,
  requiredSchemaFiles
} from './lib/directive-contracts.mjs';

const root = process.cwd();
const schemaPath = path.resolve(root, process.argv[2] || 'schemas/campaign-package.schema.json');
const packagePath = path.resolve(root, process.argv[3] || 'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const errors = [];
const checkpointSources = new Set(['preOutcomeSnapshot', 'lastStableAutosave', 'packageCheckpoint']);
const snapshotRetentionModes = new Set(['untilTerminalDecisionResolved', 'untilCampaignConclusion', 'packageDefault']);

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch (error) { throw new Error(`${path.relative(root, filePath)} is not valid JSON: ${error.message}`); }
}
function at(location, message) { errors.push(`${location}: ${message}`); }
function object(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function array(value, location, { min = 0 } = {}) {
  if (!Array.isArray(value)) { at(location, 'must be an array'); return []; }
  if (value.length < min) at(location, `must contain at least ${min} item(s)`);
  return value;
}
function text(value, location) { if (typeof value !== 'string' || !value.trim()) at(location, 'must be a non-empty string'); return value; }
function idMap(values, location) {
  const map = new Map();
  for (const [index, item] of array(values, location).entries()) {
    if (!object(item)) { at(`${location}[${index}]`, 'must be an object'); continue; }
    text(item.id, `${location}[${index}].id`);
    if (!item.id) continue;
    if (map.has(item.id)) at(`${location}[${index}].id`, `duplicate id "${item.id}"`);
    map.set(item.id, item);
  }
  return map;
}
function requireKeys(value, keys, location) {
  if (!object(value)) { at(location, 'must be an object'); return; }
  for (const key of keys) if (!(key in value)) at(location, `missing property "${key}"`);
}
function refs(values, allowed, location, label) {
  for (const value of Array.isArray(values) ? values : []) if (!allowed.has(value)) at(location, `unknown ${label} "${value}"`);
}
function idsOf(values) {
  return new Set((Array.isArray(values) ? values : []).map((item) => item?.id).filter(Boolean));
}
function walkPredicate(predicate, visit) {
  if (!object(predicate)) return;
  visit(predicate);
  for (const key of ['all', 'any', 'none']) for (const child of Array.isArray(predicate[key]) ? predicate[key] : []) walkPredicate(child, visit);
  if (predicate.not) walkPredicate(predicate.not, visit);
}
function validateEndConditionPredicateRefs(predicate, location, {
  questIds,
  trackIds,
  actorIds,
  crewIds
}) {
  const actorOrCrewIds = new Set([...actorIds, ...crewIds]);
  const check = (nodeLocation, refId, allowed, label) => {
    if (refId && !allowed.has(refId)) at(nodeLocation, `unknown ${label} "${refId}"`);
  };
  walkPredicate(predicate, (node) => {
    switch (node.type) {
      case 'questStatus':
        check(location, node.questId || node.id, questIds, 'quest');
        break;
      case 'worldTrack':
        check(location, node.trackId || node.id, trackIds, 'world track');
        break;
      case 'actorStatus':
        check(location, node.actorId || node.id, actorOrCrewIds, 'actor');
        break;
      case 'crewStatus':
        check(location, node.crewId || node.id, crewIds, 'crew');
        break;
      default:
        break;
    }
  });
}

const schema = readJson(schemaPath);
const pkg = readJson(packagePath);
const isAshesReferencePackage = pkg.manifest?.id === 'directive:campaign-package:breckenridge-ashes-of-peace';
const nccRegistryPattern = /^NCC-\d{5}(?:-[A-Z])?$/;

for (const contractIssue of validateCampaignPackageCoreContract(pkg)) {
  at(contractIssue.location || '$', contractIssue.message);
}

const topKeys = Object.keys(pkg).sort();
const expectedKeys = [...packageSpine].sort();
if (JSON.stringify(topKeys) !== JSON.stringify(expectedKeys)) {
  at('$', `top-level package spine must be exactly: ${packageSpine.join(', ')}`);
}
requireKeys(pkg.manifest, ['kind', 'schemaVersion', 'id', 'slug', 'title', 'version', 'status', 'bundled', 'transportExtension', 'sourceDocuments'], '$.manifest');
if (pkg.manifest?.kind !== 'directive.campaignPackage') at('$.manifest.kind', 'must be directive.campaignPackage');
if (pkg.manifest?.schemaVersion !== 2) at('$.manifest.schemaVersion', 'must be 2');
if (pkg.manifest?.transportExtension !== '.directive-campaign.zip') at('$.manifest.transportExtension', 'must be .directive-campaign.zip');
text(pkg.manifest?.version, '$.manifest.version');

if (JSON.stringify(schema.required || []) !== JSON.stringify(packageSpine)) at('schema.required', 'must match the schema-v2 package spine in order');
for (const [key, ref] of Object.entries(expectedRootRefs)) {
  if (schema.properties?.[key]?.$ref !== ref) at(`schema.properties.${key}.$ref`, `must be ${ref}`);
}
for (const required of requiredSchemaFiles) if (!fs.existsSync(path.resolve(root, required))) at('schemas', `missing ${required}`);

requireKeys(pkg.ship, ['id', 'name', 'class', 'affiliation', 'registry', 'openingStardate', 'openingCondition', 'commandStructure', 'serviceHistory', 'systems'], '$.ship');
if (pkg.manifest?.bundled === true) {
  text(pkg.ship?.registry, '$.ship.registry');
  if (pkg.ship?.registry && !nccRegistryPattern.test(pkg.ship.registry)) at('$.ship.registry', 'must be an NCC registry such as NCC-74593');
  for (const [index, decision] of array(pkg.ship?.serviceHistory?.openProductionDecisions || [], '$.ship.serviceHistory.openProductionDecisions').entries()) {
    if (/registry/i.test(String(decision || ''))) at(`$.ship.serviceHistory.openProductionDecisions[${index}]`, 'bundled hero ship registry must not remain an open production decision');
  }
  for (const [index, unresolved] of array(pkg.assets?.unresolved || [], '$.assets.unresolved').entries()) {
    if (/registry/i.test(String(unresolved || ''))) at(`$.assets.unresolved[${index}]`, 'bundled hero ship registry must not remain an unresolved asset placeholder');
    if (/ship hero|ship image/i.test(String(unresolved || ''))) at(`$.assets.unresolved[${index}]`, 'bundled hero ship image must not remain an unresolved asset placeholder');
  }
  const images = array(pkg.assets?.images || [], '$.assets.images');
  const shipHeroIndex = images.findIndex((image) => image?.kind === 'ship.hero' && image.subjectId === pkg.ship?.id);
  const shipHero = shipHeroIndex >= 0 ? images[shipHeroIndex] : null;
  if (!shipHero) {
    at('$.assets.images', 'bundled package must include a ship.hero image for the hero ship');
  } else {
    text(shipHero.id, `$.assets.images[${shipHeroIndex}].id`);
    text(shipHero.alt, `$.assets.images[${shipHeroIndex}].alt`);
    for (const variant of ['hero', 'card', 'thumb']) {
      const variantPath = shipHero.variants?.[variant];
      text(variantPath, `$.assets.images[${shipHeroIndex}].variants.${variant}`);
      if (variantPath && !fs.existsSync(path.resolve(root, variantPath))) {
        at(`$.assets.images[${shipHeroIndex}].variants.${variant}`, `target does not exist: ${variantPath}`);
      }
    }
  }
}

const crew = idMap(pkg.crew?.senior, '$.crew.senior');
if (isAshesReferencePackage) {
  for (const id of ashesRequiredCrewIds) if (!crew.has(id)) at('$.crew.senior', `missing required crew "${id}"`);
}
for (const [id, member] of crew) {
  requireKeys(member, ['id', 'name', 'rank', 'billet', 'species', 'status'], `$.crew.senior.${id}`);
  if (pkg.manifest?.bundled === true && id !== 'player-commander') {
    text(member.publicProfile, `$.crew.senior.${id}.publicProfile`);
    text(member.ageDescription, `$.crew.senior.${id}.ageDescription`);
  }
  for (const field of ['publicProfile', 'ageDescription', 'appearanceSummary']) {
    if (member[field] !== undefined) text(member[field], `$.crew.senior.${id}.${field}`);
  }
  for (const [index, fact] of array(member.publicIdentityFacts || [], `$.crew.senior.${id}.publicIdentityFacts`).entries()) {
    text(fact, `$.crew.senior.${id}.publicIdentityFacts[${index}]`);
  }
}

requireKeys(pkg.world, ['id', 'title', 'regionType', 'openingLocationId', 'locations', 'routes', 'factions', 'actors', 'fronts', 'clocks', 'stateTracks', 'everydayLife'], '$.world');
const locations = idMap(pkg.world?.locations, '$.world.locations');
const routes = idMap(pkg.world?.routes, '$.world.routes');
const factions = idMap(pkg.world?.factions, '$.world.factions');
const actors = idMap(pkg.world?.actors, '$.world.actors');
const fronts = idMap(pkg.world?.fronts, '$.world.fronts');
const clocks = idMap(pkg.world?.clocks, '$.world.clocks');
const tracks = idMap(pkg.world?.stateTracks, '$.world.stateTracks');
if (!locations.has(pkg.world?.openingLocationId)) at('$.world.openingLocationId', 'must reference a world location');
for (const [id, route] of routes) {
  if (!locations.has(route.from)) at(`$.world.routes.${id}.from`, `unknown location "${route.from}"`);
  if (!locations.has(route.to)) at(`$.world.routes.${id}.to`, `unknown location "${route.to}"`);
  if (!(Number(route.travelHours) > 0)) at(`$.world.routes.${id}.travelHours`, 'must be greater than zero');
}
for (const [id, actor] of actors) {
  if (!factions.has(actor.affiliationId)) at(`$.world.actors.${id}.affiliationId`, `unknown faction "${actor.affiliationId}"`);
  if (actor.homeLocationId && !locations.has(actor.homeLocationId)) at(`$.world.actors.${id}.homeLocationId`, `unknown location "${actor.homeLocationId}"`);
}
for (const [id, front] of fronts) {
  if (front.clockId && !clocks.has(front.clockId)) at(`$.world.fronts.${id}.clockId`, `unknown clock "${front.clockId}"`);
  refs(front.ownerIds, new Set([...actors.keys(), ...factions.keys()]), `$.world.fronts.${id}.ownerIds`, 'owner');
}

requireKeys(pkg.storyArcs, ['campaign', 'arcs', 'endingProfiles'], '$.storyArcs');
if (isAshesReferencePackage && pkg.storyArcs?.campaign?.id !== 'ashes-of-peace') at('$.storyArcs.campaign.id', 'must be ashes-of-peace');
if (!pkg.world?.title?.includes(pkg.storyArcs?.campaign?.theater || '')) at('$.storyArcs.campaign.theater', 'must identify the package world');
const arcs = idMap(pkg.storyArcs?.arcs, '$.storyArcs.arcs');
const milestoneIds = new Set();
for (const [arcId, arc] of arcs) {
  const milestones = idMap(arc.milestones, `$.storyArcs.arcs.${arcId}.milestones`);
  for (const id of milestones.keys()) {
    if (milestoneIds.has(id)) at(`$.storyArcs.arcs.${arcId}.milestones`, `duplicate campaign milestone "${id}"`);
    milestoneIds.add(id);
  }
}

requireKeys(pkg.endConditions, ['version', 'defaultCheckpointPolicy', 'resultBands', 'continuationFrames', 'conditions'], '$.endConditions');
if (pkg.endConditions?.version !== 1) at('$.endConditions.version', 'must be 1');
requireKeys(pkg.endConditions?.defaultCheckpointPolicy, ['preferred', 'fallbacks', 'terminalBranch', 'snapshotRetention'], '$.endConditions.defaultCheckpointPolicy');
if (pkg.endConditions?.defaultCheckpointPolicy) {
  if (!checkpointSources.has(pkg.endConditions.defaultCheckpointPolicy.preferred)) at('$.endConditions.defaultCheckpointPolicy.preferred', 'must be a known checkpoint source');
  for (const source of array(pkg.endConditions.defaultCheckpointPolicy.fallbacks, '$.endConditions.defaultCheckpointPolicy.fallbacks')) {
    if (!checkpointSources.has(source)) at('$.endConditions.defaultCheckpointPolicy.fallbacks', `unknown checkpoint source "${source}"`);
  }
  if (!snapshotRetentionModes.has(pkg.endConditions.defaultCheckpointPolicy.snapshotRetention)) at('$.endConditions.defaultCheckpointPolicy.snapshotRetention', 'must be a known snapshot retention mode');
}
const endingAxes = new Set(array(pkg.storyArcs?.endingAxes, '$.storyArcs.endingAxes').map((axis) => axis?.id).filter(Boolean));
const endConditions = idMap(pkg.endConditions?.conditions, '$.endConditions.conditions');
const continuationFrames = idMap(pkg.endConditions?.continuationFrames, '$.endConditions.continuationFrames');
const endConditionPredicateRefs = {
  questIds: idsOf(pkg.questTemplates?.templates),
  trackIds: new Set(tracks.keys()),
  actorIds: new Set(actors.keys()),
  crewIds: new Set(crew.keys())
};
if (isAshesReferencePackage) {
  for (const id of ashesRequiredEndConditionIds) if (!endConditions.has(id)) at('$.endConditions.conditions', `missing required end condition "${id}"`);
  for (const id of ashesRequiredContinuationFrameIds) if (!continuationFrames.has(id)) at('$.endConditions.continuationFrames', `missing required continuation frame "${id}"`);
}
for (const [id, condition] of endConditions) {
  requireKeys(condition, ['family', 'severity', 'priority', 'modePolicy', 'trigger', 'fairWarning', 'checkpointPolicy', 'resolutionPolicy', 'pushOnPolicy', 'defaultTerminalOutcomeBand', 'finalCampaignBandRules', 'endingAxisEffects', 'playerFacingSummary'], `$.endConditions.conditions.${id}`);
  requireKeys(condition.checkpointPolicy, ['preferred', 'fallbacks', 'snapshotRetention'], `$.endConditions.conditions.${id}.checkpointPolicy`);
  if (condition.checkpointPolicy) {
    if (!checkpointSources.has(condition.checkpointPolicy.preferred)) at(`$.endConditions.conditions.${id}.checkpointPolicy.preferred`, 'must be a known checkpoint source');
    for (const source of array(condition.checkpointPolicy.fallbacks, `$.endConditions.conditions.${id}.checkpointPolicy.fallbacks`)) {
      if (!checkpointSources.has(source)) at(`$.endConditions.conditions.${id}.checkpointPolicy.fallbacks`, `unknown checkpoint source "${source}"`);
    }
    if (!snapshotRetentionModes.has(condition.checkpointPolicy.snapshotRetention)) at(`$.endConditions.conditions.${id}.checkpointPolicy.snapshotRetention`, 'must be a known snapshot retention mode');
  }
  const actions = array(condition.resolutionPolicy?.actions, `$.endConditions.conditions.${id}.resolutionPolicy.actions`, { min: 1 });
  if (!actions.includes('replayFromCheckpoint')) at(`$.endConditions.conditions.${id}.resolutionPolicy.actions`, 'must include replayFromCheckpoint');
  if (!actions.includes('keepEnding')) at(`$.endConditions.conditions.${id}.resolutionPolicy.actions`, 'must include keepEnding');
  for (const frameId of Array.isArray(condition.continuationFrameIds) ? condition.continuationFrameIds : []) {
    if (!continuationFrames.has(frameId)) at(`$.endConditions.conditions.${id}.continuationFrameIds`, `unknown continuation frame "${frameId}"`);
  }
  validateEndConditionPredicateRefs(condition.trigger, `$.endConditions.conditions.${id}.trigger`, endConditionPredicateRefs);
  const finalCampaignBandRules = array(condition.finalCampaignBandRules, `$.endConditions.conditions.${id}.finalCampaignBandRules`, { min: 1 });
  for (const [ruleIndex, rule] of finalCampaignBandRules.entries()) {
    validateEndConditionPredicateRefs(rule?.when, `$.endConditions.conditions.${id}.finalCampaignBandRules[${ruleIndex}].when`, endConditionPredicateRefs);
  }
  for (const effect of array(condition.endingAxisEffects, `$.endConditions.conditions.${id}.endingAxisEffects`)) {
    if (effect?.axisId && !endingAxes.has(effect.axisId)) at(`$.endConditions.conditions.${id}.endingAxisEffects`, `unknown ending axis "${effect.axisId}"`);
  }
  const visible = `${condition.title || ''} ${condition.playerFacingSummary || ''} ${(condition.finalCampaignBandRules || []).map((rule) => rule?.summary || '').join(' ')}`.toLowerCase();
  for (const forbidden of ['director-only', 'hidden clock', 'raw score', 'unrevealed', 'predicate']) {
    if (visible.includes(forbidden)) at(`$.endConditions.conditions.${id}.playerFacingSummary`, `player-facing copy must not contain "${forbidden}"`);
  }
}

if (pkg.questTemplates?.version !== 2) at('$.questTemplates.version', 'must be 2');
const expectedLifecycle = ['latent','available','offered','accepted','active','delegated','resolved','failed','abandoned','expired','transformed'];
for (const status of expectedLifecycle) if (!pkg.questTemplates?.lifecycle?.includes(status)) at('$.questTemplates.lifecycle', `missing status "${status}"`);
const quests = idMap(pkg.questTemplates?.templates, '$.questTemplates.templates');
if (isAshesReferencePackage) {
  for (const id of ashesRequiredQuestIds) if (!quests.has(id)) at('$.questTemplates.templates', `missing required quest "${id}"`);
}
const allActors = new Set([...actors.keys(), ...crew.keys()]);
for (const [id, quest] of quests) {
  requireKeys(quest, ['id','kind','title','summary','dramaticQuestion','anchors','availability','objectives','outcomes','emittedEvents','contextHints'], `$.questTemplates.templates.${id}`);
  text(quest.title, `$.questTemplates.templates.${id}.title`);
  text(quest.summary, `$.questTemplates.templates.${id}.summary`);
  refs(quest.anchors?.locationIds, new Set(locations.keys()), `$.questTemplates.templates.${id}.anchors.locationIds`, 'location');
  refs(quest.anchors?.actorIds, allActors, `$.questTemplates.templates.${id}.anchors.actorIds`, 'actor');
  refs(quest.anchors?.factionIds, new Set(factions.keys()), `$.questTemplates.templates.${id}.anchors.factionIds`, 'faction');
  const objectives = idMap(quest.objectives, `$.questTemplates.templates.${id}.objectives`);
  if (objectives.size === 0) at(`$.questTemplates.templates.${id}.objectives`, 'must contain at least one objective');
  array(quest.outcomes, `$.questTemplates.templates.${id}.outcomes`, { min: 1 });
  if (quest.missionGraph?.path && !fs.existsSync(path.resolve(root, quest.missionGraph.path))) at(`$.questTemplates.templates.${id}.missionGraph.path`, 'referenced graph does not exist');
  if (quest.delegation?.allowed === true && !(Number(quest.delegation.minimumHours || quest.delegation.checkEveryHours || 0) > 0)) {
    at(`$.questTemplates.templates.${id}.delegation`, 'delegable quests must define a positive duration or check interval');
  }
  walkPredicate(quest.availability, (node) => {
    if (node.questId && !quests.has(node.questId)) at(`$.questTemplates.templates.${id}.availability`, `unknown quest "${node.questId}"`);
    if (node.locationId && !locations.has(node.locationId)) at(`$.questTemplates.templates.${id}.availability`, `unknown location "${node.locationId}"`);
  });
}
for (const [arcId, arc] of arcs) for (const milestone of array(arc.milestones, `$.storyArcs.arcs.${arcId}.milestones`)) refs(milestone.questIds, new Set(quests.keys()), `$.storyArcs.arcs.${arcId}.milestones.${milestone.id}.questIds`, 'quest');

if (pkg.threadTemplates?.version !== 2) at('$.threadTemplates.version', 'must be 2');
const threads = idMap(pkg.threadTemplates?.templates, '$.threadTemplates.templates');
if (threads.size < 10) at('$.threadTemplates.templates', 'must contain a substantial authored seed set');
requireKeys(pkg.threadTemplates?.generationPolicy, ['observableEvidenceOnly','modelsProposeCodeCommits','maximumActiveThreads','maximumAvailableThreads','minimumReinforcementForPromotion','defaultCooldownBoundaries','decayAfterBoundaries','expireAfterBoundaries'], '$.threadTemplates.generationPolicy');
if (pkg.threadTemplates?.generationPolicy?.observableEvidenceOnly !== true) at('$.threadTemplates.generationPolicy.observableEvidenceOnly', 'must be true');
if (pkg.threadTemplates?.generationPolicy?.modelsProposeCodeCommits !== true) at('$.threadTemplates.generationPolicy.modelsProposeCodeCommits', 'must be true');

if (pkg.reactionRules?.version !== 2) at('$.reactionRules.version', 'must be 2');
const reactions = idMap(pkg.reactionRules?.rules, '$.reactionRules.rules');
if (reactions.size === 0) at('$.reactionRules.rules', 'must contain reaction rules');
for (const [id, rule] of reactions) {
  if (!Array.isArray(rule.listensFor) || rule.listensFor.length === 0) at(`$.reactionRules.rules.${id}.listensFor`, 'must contain at least one event type');
  array(rule.effects, `$.reactionRules.rules.${id}.effects`, { min: 1 });
}

if (pkg.directorCards?.version !== 2) at('$.directorCards.version', 'must be 2');
array(pkg.directorCards?.cards, '$.directorCards.cards', { min: 1 });
if (pkg.contextPolicy?.version !== 2) at('$.contextPolicy.version', 'must be 2');
if (!(Number(pkg.contextPolicy?.budgets?.narratorTotalTokens) > 0)) at('$.contextPolicy.budgets.narratorTotalTokens', 'must be positive');
if (!(Number(pkg.contextPolicy?.budgets?.maxBlocks) > 0)) at('$.contextPolicy.budgets.maxBlocks', 'must be positive');

const serialized = JSON.stringify(pkg).toLowerCase();
for (const forbidden of ['"maincampaign"', '"sidemissionrules"', '"missiontemplates"', '"sidemissions"']) {
  if (serialized.includes(forbidden)) at('$', `legacy schema-v1 root ${forbidden} must not remain`);
}
if (/breckinridge|breckenridgee/.test(serialized)) at('$', 'contains a misspelling of Breckenridge');

if (errors.length) {
  console.error(`Campaign package validation failed (${errors.length} error(s)):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`Campaign package valid: ${path.relative(root, packagePath)}`);
console.log(`Schema v2: ${locations.size} locations, ${quests.size} quests, ${threads.size} thread templates, ${reactions.size} reaction rules.`);
