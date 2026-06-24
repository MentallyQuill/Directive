import fs from 'node:fs';
import path from 'node:path';
import { campaignProjectionHiddenDomains, campaignProjectionStateDomains } from './lib/directive-contracts.mjs';

const root = process.cwd();
const projectionPath = path.resolve(root, process.argv[2] || 'packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const packagePath = path.resolve(root, process.argv[3] || 'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const schemaPath = path.resolve(root, process.argv[4] || 'schemas/campaign/campaign-state-projection.schema.json');
const errors = [];
function readJson(filePath) { try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (error) { throw new Error(`${path.relative(root, filePath)} is not valid JSON: ${error.message}`); } }
function at(location, message) { errors.push(`${location}: ${message}`); }
function object(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function arr(value, location) { if (!Array.isArray(value)) { at(location, 'must be an array'); return []; } return value; }
function idMap(values, location) { const map = new Map(); for (const [index,item] of arr(values,location).entries()) { if (!object(item) || !item.id) { at(`${location}[${index}]`, 'must be an object with id'); continue; } if (map.has(item.id)) at(`${location}[${index}].id`, `duplicate id "${item.id}"`); map.set(item.id,item); } return map; }
function requireKeys(value, keys, location) { if (!object(value)) { at(location,'must be an object'); return; } for (const key of keys) if (!(key in value)) at(location,`missing property "${key}"`); }
function sameMembers(a,b) { return Array.isArray(a) && a.length===b.length && [...a].sort().every((v,i)=>v===[...b].sort()[i]); }
function rel(filePath) { return path.relative(root,filePath).replaceAll(path.sep,'/'); }

const projection = readJson(projectionPath);
const pkg = readJson(packagePath);
const schema = readJson(schemaPath);

requireKeys(projection, ['manifest','sourcePackage','projectionPolicy','stateDomains','hiddenStatePolicy','initialState','invariants'], '$');
if (projection.manifest?.kind !== 'directive.campaignStateProjection') at('$.manifest.kind','must be directive.campaignStateProjection');
if (projection.manifest?.schemaVersion !== 2) at('$.manifest.schemaVersion','must be 2');
if (schema.properties?.manifest?.properties?.schemaVersion?.const !== 2) at('schema.manifest.schemaVersion','must validate schema version 2');
if (projection.manifest?.version !== pkg.manifest?.version) at('$.manifest.version','must match package version');

if (projection.sourcePackage?.packageId !== pkg.manifest?.id) at('$.sourcePackage.packageId','must match package id');
if (projection.sourcePackage?.campaignId !== pkg.storyArcs?.campaign?.id) at('$.sourcePackage.campaignId','must match storyArcs.campaign.id');
if (projection.sourcePackage?.packagePath !== rel(packagePath)) at('$.sourcePackage.packagePath',`must be ${rel(packagePath)}`);
if (projection.sourcePackage?.packageVersion !== pkg.manifest?.version) at('$.sourcePackage.packageVersion','must match package version');
if (projection.sourcePackage?.packageVersionPinned !== true) at('$.sourcePackage.packageVersionPinned','must be true');

for (const key of ['copied','referenced','generated','derived']) if (!Array.isArray(projection.projectionPolicy?.[key]) || projection.projectionPolicy[key].length === 0) at(`$.projectionPolicy.${key}`,'must be a non-empty array');
if (!sameMembers(projection.stateDomains, campaignProjectionStateDomains)) at('$.stateDomains','must exactly match schema-v2 runtime domains');
for (const domain of campaignProjectionHiddenDomains) if (!projection.hiddenStatePolicy?.hiddenDomains?.includes(domain)) at('$.hiddenStatePolicy.hiddenDomains',`must include ${domain}`);
if (projection.hiddenStatePolicy?.normalUiMustNotExposeRawValues !== true) at('$.hiddenStatePolicy.normalUiMustNotExposeRawValues','must be true');

const state = projection.initialState;
for (const domain of campaignProjectionStateDomains) if (!(domain in state)) at('$.initialState',`missing domain "${domain}"`);
if (state.campaign?.saveSchemaVersion !== 2) at('$.initialState.campaign.saveSchemaVersion','must be 2');
if (state.campaign?.templateCampaignId !== pkg.storyArcs?.campaign?.id) at('$.initialState.campaign.templateCampaignId','must match story arc campaign id');
if (state.campaign?.openingStardate !== pkg.storyArcs?.campaign?.openingStardate) at('$.initialState.campaign.openingStardate','must match package');
if (state.campaign?.currentStardate !== state.worldState?.currentStardate) at('$.initialState.campaign.currentStardate','must match worldState.currentStardate');
if (state.campaign?.theater !== pkg.storyArcs?.campaign?.theater) at('$.initialState.campaign.theater','must match package theater');
if (state.activeCampaignPackage?.packageId !== pkg.manifest?.id) at('$.initialState.activeCampaignPackage.packageId','must match package id');
if (state.activeCampaignPackage?.packageVersion !== pkg.manifest?.version) at('$.initialState.activeCampaignPackage.packageVersion','must match package version');
if (state.activeCampaignPackage?.immutableTemplate !== true) at('$.initialState.activeCampaignPackage.immutableTemplate','must be true');
for (const key of ['id', 'name', 'class', 'registry']) {
  if (state.ship?.[key] !== pkg.ship?.[key]) at(`$.initialState.ship.${key}`, `must match package ship ${key}`);
}
if (object(state.campaignAssets?.packageAssets)) {
  const packageAssets = state.campaignAssets.packageAssets;
  for (const [index, unresolved] of arr(packageAssets.unresolved || [], '$.initialState.campaignAssets.packageAssets.unresolved').entries()) {
    if (/ship hero/i.test(String(unresolved || ''))) at(`$.initialState.campaignAssets.packageAssets.unresolved[${index}]`, 'ship hero image must not remain unresolved after package integration');
  }
  const packageShipHero = (Array.isArray(pkg.assets?.images) ? pkg.assets.images : [])
    .find((image) => image?.kind === 'ship.hero' && image.subjectId === pkg.ship?.id);
  if (packageShipHero && Array.isArray(packageAssets.images)) {
    const projectedShipHero = packageAssets.images.find((image) => image?.id === packageShipHero.id && image?.kind === 'ship.hero');
    if (!projectedShipHero) at('$.initialState.campaignAssets.packageAssets.images', 'must include package ship.hero image when package assets are snapshotted');
  }
}

const packageLocations = idMap(pkg.world?.locations,'$.package.world.locations');
const packageFactions = idMap(pkg.world?.factions,'$.package.world.factions');
const packageActors = idMap(pkg.world?.actors,'$.package.world.actors');
const packageFronts = idMap(pkg.world?.fronts,'$.package.world.fronts');
const packageClocks = idMap(pkg.world?.clocks,'$.package.world.clocks');
const packageTracks = idMap(pkg.world?.stateTracks,'$.package.world.stateTracks');
const stateLocations = idMap(state.worldState?.locations,'$.initialState.worldState.locations');
const stateFactions = idMap(state.worldState?.factions,'$.initialState.worldState.factions');
const stateActors = idMap(state.worldState?.actors,'$.initialState.worldState.actors');
const stateFronts = idMap(state.worldState?.fronts,'$.initialState.worldState.fronts');
const stateClocks = idMap(state.worldState?.clocks,'$.initialState.worldState.clocks');
if (Array.isArray(state.campaignTracks)) at('$.initialState.campaignTracks','must use records, not a bare array');
requireKeys(state.campaignTracks,['records'],'$.initialState.campaignTracks');
const stateTracks = idMap(state.campaignTracks?.records,'$.initialState.campaignTracks.records');
if (state.worldState?.regionId !== pkg.world?.id) at('$.initialState.worldState.regionId','must match package world id');
if (!stateLocations.has(state.worldState?.currentLocationId)) at('$.initialState.worldState.currentLocationId','must reference projected location');
for (const id of packageLocations.keys()) if (!stateLocations.has(id)) at('$.initialState.worldState.locations',`missing package location "${id}"`);
for (const id of packageFactions.keys()) if (!stateFactions.has(id)) at('$.initialState.worldState.factions',`missing package faction "${id}"`);
for (const id of packageActors.keys()) if (!stateActors.has(id)) at('$.initialState.worldState.actors',`missing package actor "${id}"`);
for (const id of packageFronts.keys()) if (!stateFronts.has(id)) at('$.initialState.worldState.fronts',`missing package front "${id}"`);
for (const id of packageClocks.keys()) if (!stateClocks.has(id)) at('$.initialState.worldState.clocks',`missing package clock "${id}"`);
for (const id of packageTracks.keys()) if (!stateTracks.has(id)) at('$.initialState.campaignTracks.records',`missing package state track "${id}"`);

if (state.storyArcLedger?.schemaVersion !== 2) at('$.initialState.storyArcLedger.schemaVersion','must be 2');
const arcIds = new Set((pkg.storyArcs?.arcs || []).map((item)=>item.id));
for (const arc of arr(state.storyArcLedger?.arcs,'$.initialState.storyArcLedger.arcs')) if (!arcIds.has(arc.id)) at('$.initialState.storyArcLedger.arcs',`unknown arc "${arc.id}"`);

if (state.questLedger?.schemaVersion !== 2) at('$.initialState.questLedger.schemaVersion','must be 2');
const templates = idMap(pkg.questTemplates?.templates,'$.package.questTemplates.templates');
const instances = idMap(state.questLedger?.instances,'$.initialState.questLedger.instances');
for (const id of templates.keys()) if (!instances.has(id)) at('$.initialState.questLedger.instances',`missing static quest instance "${id}"`);
for (const [id, instance] of instances) {
  if (!templates.has(instance.templateId) && !(state.dynamicQuestCatalog?.templates || []).some((item)=>item.id===instance.templateId)) at(`$.initialState.questLedger.instances.${id}.templateId`,`unknown template "${instance.templateId}"`);
  if (!pkg.questTemplates?.lifecycle?.includes(instance.status)) at(`$.initialState.questLedger.instances.${id}.status`,`unknown status "${instance.status}"`);
  if (!Array.isArray(instance.objectiveStates)) at(`$.initialState.questLedger.instances.${id}.objectiveStates`,'must be an array');
}
const foreground = instances.get(state.questLedger?.foregroundQuestId);
if (!foreground || foreground.status !== 'active') at('$.initialState.questLedger.foregroundQuestId','must reference an active quest');
if (state.attentionState?.foregroundQuestId !== state.questLedger?.foregroundQuestId) at('$.initialState.attentionState.foregroundQuestId','must match quest ledger foreground');

requireKeys(state.dynamicQuestCatalog,['schemaVersion','templates','proposalJournal','archivedTemplateIds','semanticIndex'],'$.initialState.dynamicQuestCatalog');
if (state.dynamicQuestCatalog?.schemaVersion !== 2) at('$.initialState.dynamicQuestCatalog.schemaVersion','must be 2');
requireKeys(state.knowledgeLedger,['schemaVersion','facts','rumors','contradictions'],'$.initialState.knowledgeLedger');
if (state.knowledgeLedger?.schemaVersion !== 2) at('$.initialState.knowledgeLedger.schemaVersion','must be 2');
requireKeys(state.threadLedger,['schemaVersion','records','activationReviews','closureReviews','promotionReviews','pacing'],'$.initialState.threadLedger');
if (state.threadLedger?.schemaVersion !== 2) at('$.initialState.threadLedger.schemaVersion','must be 2');

requireKeys(state.eventLedger,['schemaVersion','nextSequence','committedEvents','pendingReactions','reactionHistory','invalidatedEventIds'],'$.initialState.eventLedger');
if (state.eventLedger?.schemaVersion !== 2) at('$.initialState.eventLedger.schemaVersion','must be 2');
if (!Number.isInteger(state.eventLedger?.nextSequence) || state.eventLedger.nextSequence < 1) at('$.initialState.eventLedger.nextSequence','must be a positive integer');
if ('events' in (state.eventLedger || {})) at('$.initialState.eventLedger.events','legacy events property is forbidden');

requireKeys(state.runtimeTracking,['schemaVersion','revision','mechanicsRevision','stateDeltaJournal','sceneReconciliation'],'$.initialState.runtimeTracking');
if (state.runtimeTracking?.schemaVersion !== 2) at('$.initialState.runtimeTracking.schemaVersion','must be 2');
const reconciliation = state.runtimeTracking?.sceneReconciliation;
requireKeys(reconciliation,['schemaVersion','markers','runs','pending','applied','rejected','recalculationPreviews','chunkCache','invalidations'],'$.initialState.runtimeTracking.sceneReconciliation');
if (reconciliation?.schemaVersion !== 2) at('$.initialState.runtimeTracking.sceneReconciliation.schemaVersion','must be 2');

const forbiddenRoots = ['mainCampaign','sideMissions'];
for (const rootName of forbiddenRoots) if (rootName in state) at(`$.initialState.${rootName}`,'legacy schema-v1 domain is forbidden');
if (!Array.isArray(projection.invariants) || projection.invariants.length < 5) at('$.invariants','must document core runtime invariants');

if (errors.length) {
  console.error(`Campaign projection validation failed (${errors.length} error(s)):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`Campaign projection valid: ${path.relative(root, projectionPath)}`);
console.log(`Schema v2: ${instances.size} quest instances, ${stateLocations.size} locations, event and reconciliation journals normalized.`);
