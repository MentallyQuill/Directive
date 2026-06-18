import fs from 'node:fs';
import path from 'node:path';
import {
  campaignProjectionHiddenDomains,
  campaignProjectionStateDomains
} from './lib/directive-contracts.mjs';

const DEFAULT_SCHEMA = 'schemas/campaign/campaign-state-projection.schema.json';
const DEFAULT_PACKAGE = 'packages/bundled/breckinridge/ashes-of-peace.starship-package.json';
const DEFAULT_PROJECTION = 'packages/bundled/breckinridge/ashes-of-peace.campaign-projection.json';
const DEFAULT_GRAPH = 'packages/bundled/breckinridge/prelude-a-ship-underway.mission-graph.json';

const root = process.cwd();
const schemaPath = path.resolve(root, process.argv[2] || DEFAULT_SCHEMA);
const packagePath = path.resolve(root, process.argv[3] || DEFAULT_PACKAGE);
const projectionPath = path.resolve(root, process.argv[4] || DEFAULT_PROJECTION);
const graphPath = path.resolve(root, process.argv[5] || DEFAULT_GRAPH);

const errors = [];

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

function requireExactArray(actual, expected, location) {
  if (!Array.isArray(actual)) {
    at(location, 'must be an array');
    return;
  }
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    at(location, `must exactly equal: ${expected.join(', ')}`);
  }
}

function idSet(items) {
  return new Set((items || []).map((item) => item && item.id).filter(Boolean));
}

function byId(items) {
  return new Map((items || []).filter((item) => item && item.id).map((item) => [item.id, item]));
}

function requireNoMissing(ids, available, location, label) {
  for (const id of ids) {
    if (!available.has(id)) {
      at(location, `missing ${label} "${id}"`);
    }
  }
}

const schema = readJson(schemaPath);
const pkg = readJson(packagePath);
const projection = readJson(projectionPath);
const missionGraph = readJson(graphPath);

if (schema.title !== 'Directive Campaign State Projection') {
  at('schema.title', 'must be Directive Campaign State Projection');
}

if (requireObject(projection.manifest, '$.manifest')) {
  if (projection.manifest.kind !== 'directive.campaignStateProjection') {
    at('$.manifest.kind', 'must be directive.campaignStateProjection');
  }
  if (projection.manifest.schemaVersion !== 1) {
    at('$.manifest.schemaVersion', 'must be 1');
  }
  if (projection.manifest.version !== pkg.manifest?.version) {
    at('$.manifest.version', 'must match package manifest version');
  }
}

if (requireObject(projection.sourcePackage, '$.sourcePackage')) {
  if (projection.sourcePackage.packageId !== pkg.manifest?.id) {
    at('$.sourcePackage.packageId', 'must match package manifest id');
  }
  if (projection.sourcePackage.campaignId !== pkg.mainCampaign?.id) {
    at('$.sourcePackage.campaignId', 'must match package mainCampaign id');
  }
  if (projection.sourcePackage.packagePath !== rel(packagePath)) {
    at('$.sourcePackage.packagePath', `must be ${rel(packagePath)}`);
  }
  if (projection.sourcePackage.packageVersionPinned !== true) {
    at('$.sourcePackage.packageVersionPinned', 'must be true');
  }
  if (projection.sourcePackage.packagePath && !fs.existsSync(path.resolve(root, projection.sourcePackage.packagePath))) {
    at('$.sourcePackage.packagePath', 'target package does not exist');
  }
}

if (requireObject(projection.projectionPolicy, '$.projectionPolicy')) {
  for (const key of ['copied', 'referenced', 'generated', 'derived']) {
    if (!Array.isArray(projection.projectionPolicy[key]) || projection.projectionPolicy[key].length === 0) {
      at(`$.projectionPolicy.${key}`, 'must be a non-empty array');
    }
  }
  for (const field of ['manifest.version', 'missionTemplates', 'sideMissionRules', 'guardrails', 'assets.datasets']) {
    if (!projection.projectionPolicy.referenced?.includes(field)) {
      at('$.projectionPolicy.referenced', `must include ${field}`);
    }
  }
  for (const field of ['mission.activeMissionGraphId', 'mission.activePhaseId', 'mission.outcomeFlags', 'clocks.values']) {
    if (!projection.projectionPolicy.derived?.includes(field)) {
      at('$.projectionPolicy.derived', `must include ${field}`);
    }
  }
}

requireExactArray(projection.stateDomains, campaignProjectionStateDomains, '$.stateDomains');

if (requireObject(projection.hiddenStatePolicy, '$.hiddenStatePolicy')) {
  for (const domain of campaignProjectionHiddenDomains) {
    if (!projection.hiddenStatePolicy.hiddenDomains?.includes(domain)) {
      at('$.hiddenStatePolicy.hiddenDomains', `must include ${domain}`);
    }
  }
  if (projection.hiddenStatePolicy.normalUiMustNotExposeRawValues !== true) {
    at('$.hiddenStatePolicy.normalUiMustNotExposeRawValues', 'must be true');
  }
}

if (requireObject(projection.initialState, '$.initialState')) {
  const state = projection.initialState;
  for (const domain of campaignProjectionStateDomains) {
    if (!(domain in state)) {
      at('$.initialState', `missing domain "${domain}"`);
    }
  }

  if (state.campaign?.templateCampaignId !== pkg.mainCampaign?.id) {
    at('$.initialState.campaign.templateCampaignId', 'must match package mainCampaign id');
  }
  if (state.campaign?.openingStardate !== pkg.mainCampaign?.openingStardate) {
    at('$.initialState.campaign.openingStardate', 'must match package opening stardate');
  }
  if (state.campaign?.currentStardate !== pkg.mainCampaign?.openingStardate) {
    at('$.initialState.campaign.currentStardate', 'must start at package opening stardate');
  }
  if (state.campaign?.theater !== pkg.mainCampaign?.theater) {
    at('$.initialState.campaign.theater', 'must match package theater');
  }

  if (state.activeStarshipPackage?.packageId !== pkg.manifest?.id) {
    at('$.initialState.activeStarshipPackage.packageId', 'must match package id');
  }
  if (state.activeStarshipPackage?.packageVersion !== pkg.manifest?.version) {
    at('$.initialState.activeStarshipPackage.packageVersion', 'must match package version');
  }
  if (state.activeStarshipPackage?.immutableTemplate !== true) {
    at('$.initialState.activeStarshipPackage.immutableTemplate', 'must be true');
  }

  if (state.player?.creationStatus !== 'requiresPlayerCreation') {
    at('$.initialState.player.creationStatus', 'must be requiresPlayerCreation');
  }
  if (state.player?.id !== 'player-commander') {
    at('$.initialState.player.id', 'must be player-commander');
  }

  const packageCrewIds = [...idSet(pkg.crew?.senior)];
  requireNoMissing(packageCrewIds, new Set(state.crew?.seniorCrewIds || []), '$.initialState.crew.seniorCrewIds', 'crew id');
  if (state.crew?.relationshipModel?.rawValuesHidden !== true) {
    at('$.initialState.crew.relationshipModel.rawValuesHidden', 'must be true');
  }

  if (state.ship?.id !== pkg.ship?.id) {
    at('$.initialState.ship.id', 'must match package ship id');
  }
  if (state.ship?.name !== pkg.ship?.name) {
    at('$.initialState.ship.name', 'must match package ship name');
  }
  if (state.ship?.registry !== pkg.ship?.registry) {
    at('$.initialState.ship.registry', 'must match package ship registry');
  }

  const missionIds = idSet(pkg.missionTemplates?.main);
  if (!missionIds.has(state.mission?.activeMissionId)) {
    at('$.initialState.mission.activeMissionId', 'must exist in package missionTemplates.main');
  }
  if (state.mission?.activeMissionId !== 'prelude-a-ship-underway') {
    at('$.initialState.mission.activeMissionId', 'must start with prelude-a-ship-underway');
  }
  if (state.mission?.activeMissionGraphId !== missionGraph.manifest?.id) {
    at('$.initialState.mission.activeMissionGraphId', 'must match prelude mission graph id');
  }
  if (state.mission?.activeMissionGraphPath !== rel(graphPath)) {
    at('$.initialState.mission.activeMissionGraphPath', `must be ${rel(graphPath)}`);
  }
  const graphAsset = (pkg.assets?.datasets || []).find((asset) => asset?.id === missionGraph.manifest?.id);
  if (!graphAsset) {
    at('$.initialState.mission.activeMissionGraphId', 'mission graph must be listed in package assets.datasets');
  }
  const phaseIds = idSet(missionGraph.phases);
  if (!phaseIds.has(state.mission?.activePhaseId)) {
    at('$.initialState.mission.activePhaseId', 'must exist in mission graph phases');
  }
  if (state.mission?.activePhaseId !== 'shuttle-rendezvous') {
    at('$.initialState.mission.activePhaseId', 'must start at shuttle-rendezvous');
  }
  if (state.mission?.phase !== state.mission?.activePhaseId) {
    at('$.initialState.mission.phase', 'must match activePhaseId until phase label is retired');
  }
  const activePhase = (missionGraph.phases || []).find((phase) => phase?.id === state.mission?.activePhaseId);
  requireNoMissing(activePhase?.decisionPointIds || [], new Set(state.mission?.availableDecisionPointIds || []), '$.initialState.mission.availableDecisionPointIds', 'active phase decision point');
  if (!Array.isArray(state.mission?.knownFacts) || !Array.isArray(state.mission?.hiddenFacts)) {
    at('$.initialState.mission', 'must initialize knownFacts and hiddenFacts arrays');
  }
  const graphOutcomeById = byId(missionGraph.outcomeFlags);
  const projectedOutcomeById = byId(state.mission?.outcomeFlags);
  requireNoMissing(graphOutcomeById.keys(), new Set(projectedOutcomeById.keys()), '$.initialState.mission.outcomeFlags', 'outcome flag');
  for (const [id, graphFlag] of graphOutcomeById.entries()) {
    const projectedFlag = projectedOutcomeById.get(id);
    if (!projectedFlag) {
      continue;
    }
    if (projectedFlag.value !== graphFlag.defaultValue) {
      at(`$.initialState.mission.outcomeFlags.${id}.value`, `must match graph defaultValue ${graphFlag.defaultValue}`);
    }
    if (projectedFlag.visibility !== graphFlag.visibility) {
      at(`$.initialState.mission.outcomeFlags.${id}.visibility`, 'must match graph visibility');
    }
  }

  if (state.mainCampaign?.chapterCursor !== state.mission?.activeMissionId) {
    at('$.initialState.mainCampaign.chapterCursor', 'must match active mission id');
  }

  const packageTrackById = byId(pkg.mainCampaign?.stateTracks);
  const projectedTrackById = byId(state.campaignTracks);
  requireNoMissing(packageTrackById.keys(), new Set(projectedTrackById.keys()), '$.initialState.campaignTracks', 'track');
  for (const [id, packageTrack] of packageTrackById.entries()) {
    const projectedTrack = projectedTrackById.get(id);
    if (!projectedTrack) {
      continue;
    }
    if (projectedTrack.value !== packageTrack.initial) {
      at(`$.initialState.campaignTracks.${id}.value`, `must match package initial value ${packageTrack.initial}`);
    }
    if (projectedTrack.min !== packageTrack.min || projectedTrack.max !== packageTrack.max) {
      at(`$.initialState.campaignTracks.${id}`, 'min and max must match package track');
    }
    if (projectedTrack.visibility !== packageTrack.visibility) {
      at(`$.initialState.campaignTracks.${id}.visibility`, 'must match package track visibility');
    }
  }

  const packageAssetById = byId(pkg.mainCampaign?.campaignAssets);
  const projectedAssetById = byId(state.campaignAssets);
  requireNoMissing(packageAssetById.keys(), new Set(projectedAssetById.keys()), '$.initialState.campaignAssets', 'asset');
  for (const [id, packageAsset] of packageAssetById.entries()) {
    const projectedAsset = projectedAssetById.get(id);
    if (projectedAsset && projectedAsset.state !== packageAsset.defaultState) {
      at(`$.initialState.campaignAssets.${id}.state`, `must match package defaultState ${packageAsset.defaultState}`);
    }
  }

  const graphClockById = byId(missionGraph.clocks);
  const projectedClockById = byId(state.clocks);
  requireNoMissing(graphClockById.keys(), new Set(projectedClockById.keys()), '$.initialState.clocks', 'clock');
  for (const [id, graphClock] of graphClockById.entries()) {
    const projectedClock = projectedClockById.get(id);
    if (!projectedClock) {
      continue;
    }
    if (projectedClock.sourceMissionGraphId !== missionGraph.manifest?.id) {
      at(`$.initialState.clocks.${id}.sourceMissionGraphId`, 'must match mission graph id');
    }
    if (projectedClock.value !== graphClock.initial) {
      at(`$.initialState.clocks.${id}.value`, `must match graph initial value ${graphClock.initial}`);
    }
    if (projectedClock.min !== graphClock.min || projectedClock.max !== graphClock.max) {
      at(`$.initialState.clocks.${id}`, 'min and max must match graph clock');
    }
    if (projectedClock.visibility !== graphClock.visibility) {
      at(`$.initialState.clocks.${id}.visibility`, 'must match graph clock visibility');
    }
  }

  if (state.relationships?.rawValuesHidden !== true) {
    at('$.initialState.relationships.rawValuesHidden', 'must be true');
  }
  if (state.commandStyle?.noMoralityScore !== true) {
    at('$.initialState.commandStyle.noMoralityScore', 'must be true');
  }
  if (state.commandStyle?.systemName !== 'Command Bearing') {
    at('$.initialState.commandStyle.systemName', 'must be Command Bearing');
  }
  for (const track of ['inspiration', 'resolve']) {
    const trackState = state.commandStyle?.[track];
    if (trackState?.rank !== 1) {
      at(`$.initialState.commandStyle.${track}.rank`, 'must start at 1');
    }
    if (trackState?.marks !== 0) {
      at(`$.initialState.commandStyle.${track}.marks`, 'must start at 0');
    }
    if (trackState?.points !== 0) {
      at(`$.initialState.commandStyle.${track}.points`, 'must start at 0');
    }
    if (trackState?.pointCap !== 1) {
      at(`$.initialState.commandStyle.${track}.pointCap`, 'must start at 1');
    }
  }
  if (state.commandStyle?.reserve?.capacity !== 1) {
    at('$.initialState.commandStyle.reserve.capacity', 'must start at 1');
  }
  if (state.commandStyle?.reserve?.absoluteCapacity !== 2) {
    at('$.initialState.commandStyle.reserve.absoluteCapacity', 'must be 2');
  }
  const thresholdMarks = (state.commandStyle?.thresholds || []).map((threshold) => threshold.marks).join(',');
  if (thresholdMarks !== '0,2,5,9,14') {
    at('$.initialState.commandStyle.thresholds', 'must use Command Bearing mark thresholds 0,2,5,9,14');
  }
  if (state.turnLedger?.swipeRerollForbidden !== true) {
    at('$.initialState.turnLedger.swipeRerollForbidden', 'must be true');
  }
  if (state.commandLog?.summariesGeneratedFromCommittedStateOnly !== true) {
    at('$.initialState.commandLog.summariesGeneratedFromCommittedStateOnly', 'must be true');
  }
  if (state.settings?.simulationMode !== 'Command') {
    at('$.initialState.settings.simulationMode', 'must default to Command');
  }
  const packageModes = new Set(pkg.guardrails?.simulationModes || []);
  for (const mode of state.settings?.allowedSimulationModes || []) {
    if (!packageModes.has(mode)) {
      at('$.initialState.settings.allowedSimulationModes', `unknown mode "${mode}"`);
    }
  }
}

if (requireArray(projection.invariants, '$.invariants')) {
  for (const requiredInvariant of [
    'must not mutate the starship package',
    'pin the package id and version',
    'Swipe regeneration can change prose only'
  ]) {
    if (!projection.invariants.some((invariant) => invariant.includes(requiredInvariant))) {
      at('$.invariants', `missing invariant containing "${requiredInvariant}"`);
    }
  }
}

if (errors.length > 0) {
  console.error(`Campaign projection validation failed for ${rel(projectionPath)}:`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Validated ${rel(projectionPath)} against ${rel(schemaPath)}, ${rel(packagePath)}, and ${rel(graphPath)}`);
