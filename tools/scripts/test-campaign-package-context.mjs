import fs from 'node:fs';
import path from 'node:path';
import {
  createCharacterCreationContext,
  createCampaignPackageSummary,
  getCampaignPackageSpineErrors
} from '../../src/packages/campaign-package-context.mjs';
import { createRuntimePackageContext } from '../../src/runtime/campaign-start-controller.mjs';

const root = process.cwd();
const errors = [];
const HERO_SHIP_REGISTRY_PATTERN = /^NCC-\d{5}(?:-[A-Z])?$/;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

function stable(value) {
  return JSON.stringify(value);
}

function at(location, message) {
  errors.push(`${location}: ${message}`);
}

function requireEqual(actual, expected, location) {
  if (stable(actual) !== stable(expected)) {
    at(location, `got ${stable(actual)}, expected ${stable(expected)}`);
  }
}

function requireIncludes(values, expected, location) {
  if (!Array.isArray(values) || !values.includes(expected)) {
    at(location, `missing "${expected}"`);
  }
}

function requireTextIncludes(value, expected, location) {
  if (!String(value || '').includes(expected)) {
    at(location, `missing "${expected}"`);
  }
}

function requireFileExists(filePath, location) {
  if (!fs.existsSync(path.resolve(root, filePath))) {
    at(location, `target does not exist: ${filePath}`);
  }
}

function ids(items = []) {
  return items.map((item) => item && item.id).filter(Boolean);
}

function idMap(items = []) {
  return new Map((Array.isArray(items) ? items : [])
    .filter((item) => item && item.id)
    .map((item) => [item.id, item]));
}

function paragraphCount(value) {
  return String(value || '').split(/\n\s*\n/).filter((paragraph) => paragraph.trim()).length;
}

function wordCount(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length;
}

function requireCampaignLibraryCopy(filePath, expectedTitle, { expectedSessions = '', requiredHookNeedles = [], expectedShipHeroPath = '' } = {}) {
  const pack = readJson(filePath);
  const packSummary = createCampaignPackageSummary(pack);
  requireEqual(getCampaignPackageSpineErrors(pack), [], `${expectedTitle} package spine errors`);
  requireEqual(packSummary.campaign.title, expectedTitle, `${expectedTitle} summary campaign.title`);
  if (expectedSessions) {
    requireEqual(packSummary.campaign.structure.expectedSessions, expectedSessions, `${expectedTitle} summary campaign.structure.expectedSessions`);
  }
  if (paragraphCount(packSummary.campaign.highConcept) !== 3) {
    at(`${expectedTitle} summary campaign.highConcept`, 'must use three back-cover paragraphs for Campaign Library expansion');
  }
  const hookWords = wordCount(packSummary.campaign.highConcept);
  if (hookWords < 140 || hookWords > 220) {
    at(`${expectedTitle} summary campaign.highConcept`, `got ${hookWords} words, expected a back-cover hook near Ashes length`);
  }
  for (const needle of requiredHookNeedles) {
    requireTextIncludes(packSummary.campaign.highConcept, needle, `${expectedTitle} summary campaign.highConcept`);
  }
  if (expectedShipHeroPath) {
    const summaryImages = Array.isArray(packSummary.assets?.images) ? packSummary.assets.images : [];
    const shipHero = summaryImages.find((image) => image.kind === 'ship.hero' && image.subjectId === packSummary.ship.id);
    const expectedCardPath = expectedShipHeroPath.replace(/\.hero\.webp$/, '.card.webp');
    const expectedThumbPath = expectedShipHeroPath.replace(/\.hero\.webp$/, '.thumb.webp');
    requireEqual(shipHero?.variants?.hero, expectedShipHeroPath, `${expectedTitle} summary ship hero`);
    requireEqual(shipHero?.variants?.card, expectedCardPath, `${expectedTitle} summary ship card`);
    requireEqual(shipHero?.variants?.thumb, expectedThumbPath, `${expectedTitle} summary ship thumb`);
    requireFileExists(expectedShipHeroPath, `${expectedTitle} ship hero file`);
    requireFileExists(expectedCardPath, `${expectedTitle} ship card file`);
    requireFileExists(expectedThumbPath, `${expectedTitle} ship thumb file`);
    for (const [index, unresolved] of (pack.assets?.unresolved || []).entries()) {
      if (/ship hero/i.test(String(unresolved || ''))) {
        at(`${expectedTitle} assets.unresolved[${index}]`, 'ship hero must not remain unresolved after image integration');
      }
    }
  }
}

function requireBundledHeroShipRegistry(packagePath, projectionPath, expectedRegistry) {
  const pack = readJson(packagePath);
  const projection = readJson(projectionPath);
  const label = pack.ship?.name || packagePath;
  requireEqual(pack.ship?.registry, expectedRegistry, `${label} package ship.registry`);
  requireEqual(createCampaignPackageSummary(pack).ship.registry, expectedRegistry, `${label} summary ship.registry`);
  requireEqual(projection.initialState?.ship?.registry, expectedRegistry, `${label} projection ship.registry`);
  if (!HERO_SHIP_REGISTRY_PATTERN.test(String(pack.ship?.registry || ''))) {
    at(`${label} package ship.registry`, `must be an NCC hero-ship registry, got ${stable(pack.ship?.registry)}`);
  }
  for (const [index, decision] of (pack.ship?.serviceHistory?.openProductionDecisions || []).entries()) {
    if (/registry/i.test(String(decision || ''))) {
      at(`${label} openProductionDecisions[${index}]`, 'registry must not remain an open production decision');
    }
  }
  for (const [index, unresolved] of (pack.assets?.unresolved || []).entries()) {
    if (/registry/i.test(String(unresolved || ''))) {
      at(`${label} assets.unresolved[${index}]`, 'registry must not remain an unresolved asset placeholder');
    }
  }
}

function requireBundledMissionGraphEntryAlignment(filePath) {
  const pack = readJson(filePath);
  const packageLabel = pack.manifest?.id || filePath;
  const graphAssetsByPath = new Map((pack.assets?.datasets || [])
    .filter((asset) => asset?.kind === 'missionGraph' && asset.path)
    .map((asset) => [asset.path, asset]));
  for (const quest of pack.questTemplates?.templates || []) {
    const missionGraph = quest?.missionGraph;
    if (!missionGraph?.path) continue;
    const location = `${packageLabel} questTemplates.${quest.id}.missionGraph`;
    const graphPath = path.resolve(root, missionGraph.path);
    if (!fs.existsSync(graphPath)) {
      at(`${location}.path`, `target does not exist: ${missionGraph.path}`);
      continue;
    }
    const graph = readJson(missionGraph.path);
    requireEqual(missionGraph.id, graph.manifest?.id, `${location}.id`);
    requireEqual(graph.manifest?.missionId, quest.id, `${location}.manifest.missionId`);
    const asset = graphAssetsByPath.get(missionGraph.path);
    if (!asset) {
      at(`${location}.path`, 'mission graph path must be listed in assets.datasets');
    } else {
      requireEqual(asset.id, graph.manifest?.id, `${location}.assets.datasets.id`);
    }

    const phasesById = idMap(graph.phases);
    const decisionsById = idMap(graph.decisionPoints);
    if (missionGraph.entryPhaseId && !phasesById.has(missionGraph.entryPhaseId)) {
      at(`${location}.entryPhaseId`, `missing graph phase "${missionGraph.entryPhaseId}"`);
    }
    if (missionGraph.startPhaseId && !phasesById.has(missionGraph.startPhaseId)) {
      at(`${location}.startPhaseId`, `missing graph phase "${missionGraph.startPhaseId}"`);
    }
    for (const decisionId of missionGraph.entryDecisionPointIds || []) {
      const decision = decisionsById.get(decisionId);
      if (!decision) {
        at(`${location}.entryDecisionPointIds`, `missing graph decision "${decisionId}"`);
        continue;
      }
      if (!missionGraph.entryPhaseId) {
        at(`${location}.entryPhaseId`, `required when entryDecisionPointIds are declared`);
        continue;
      }
      const entryPhase = phasesById.get(missionGraph.entryPhaseId);
      if (decision.phaseId !== missionGraph.entryPhaseId) {
        at(`${location}.entryDecisionPointIds`, `"${decisionId}" belongs to "${decision.phaseId}", not entry phase "${missionGraph.entryPhaseId}"`);
      }
      if (!entryPhase?.decisionPointIds?.includes(decisionId)) {
        at(`${location}.entryDecisionPointIds`, `"${decisionId}" must be listed by entry phase "${missionGraph.entryPhaseId}"`);
      }
    }
  }
}

const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const before = stable(packageData);

requireEqual(getCampaignPackageSpineErrors(packageData), [], 'package spine errors');

const summary = createCampaignPackageSummary(packageData);
requireEqual(summary.packageId, 'directive:campaign-package:breckenridge-ashes-of-peace', 'summary packageId');
requireEqual(summary.ship.name, 'U.S.S. Breckenridge', 'summary ship.name');
requireEqual(summary.ship.openingCondition, 'Returned to service after a four-month repair and modernization period at Utopia Planitia; certified for service with several upgraded systems still requiring integrated validation under sustained deployment conditions.', 'summary ship.openingCondition');
requireEqual(summary.campaign.title, 'Ashes of Peace', 'summary campaign.title');
requireEqual(summary.campaign.openingYear, 2376, 'summary campaign.openingYear');
requireEqual(summary.campaign.eraLabel, '2376, Aftermath of the Dominion War', 'summary campaign.eraLabel');
if (!summary.campaign.highConcept.includes('\n\nInto that fracture comes the U.S.S. Breckenridge')) {
  at('summary campaign.highConcept', 'must preserve the multi-paragraph back-cover hook for Campaign Library expansion');
}
requireCampaignLibraryCopy('packages/bundled/glass-harbor/drowned-constellation.campaign-package.json', 'Drowned Constellation', {
  expectedSessions: '40-60',
  requiredHookNeedles: ['safe chart is still worth drawing'],
  expectedShipHeroPath: 'assets/packages/glass-harbor/images/ship/uss-glass-harbor.hero.webp'
});
requireCampaignLibraryCopy('packages/bundled/serein/black-current.campaign-package.json', 'Black Current', {
  expectedSessions: '35-55',
  requiredHookNeedles: ['past comes back asking for authority'],
  expectedShipHeroPath: 'assets/packages/serein/images/ship/uss-serein.hero.webp'
});
requireCampaignLibraryCopy('packages/bundled/eudora-vale/broken-accord.campaign-package.json', 'Broken Accord', {
  expectedSessions: '28-42',
  requiredHookNeedles: ['broken accord can be repaired'],
  expectedShipHeroPath: 'assets/packages/eudora-vale/images/ship/uss-eudora-vale.hero.webp'
});
requireCampaignLibraryCopy('packages/bundled/aster-vale/unseen-border.campaign-package.json', 'Unseen Border', {
  expectedSessions: '32-50',
  requiredHookNeedles: ['visibility is rescue, betrayal, or both'],
  expectedShipHeroPath: 'assets/packages/aster-vale/images/ship/uss-aster-vale.hero.webp'
});
requireCampaignLibraryCopy('packages/bundled/celandine/enemys-garden.campaign-package.json', "Enemy's Garden", {
  expectedSessions: '28-42',
  requiredHookNeedles: ['what can be uprooted when survival itself has taken root'],
  expectedShipHeroPath: 'assets/packages/celandine/images/ship/uss-celandine.hero.webp'
});
requireBundledHeroShipRegistry(
  'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json',
  'packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json',
  'NCC-74638'
);
requireBundledHeroShipRegistry(
  'packages/bundled/glass-harbor/drowned-constellation.campaign-package.json',
  'packages/bundled/glass-harbor/drowned-constellation.campaign-projection.json',
  'NCC-52247'
);
requireBundledHeroShipRegistry(
  'packages/bundled/serein/black-current.campaign-package.json',
  'packages/bundled/serein/black-current.campaign-projection.json',
  'NCC-52814'
);
requireBundledHeroShipRegistry(
  'packages/bundled/eudora-vale/broken-accord.campaign-package.json',
  'packages/bundled/eudora-vale/broken-accord.campaign-projection.json',
  'NCC-74593'
);
requireBundledHeroShipRegistry(
  'packages/bundled/aster-vale/unseen-border.campaign-package.json',
  'packages/bundled/aster-vale/unseen-border.campaign-projection.json',
  'NCC-65488'
);
requireBundledHeroShipRegistry(
  'packages/bundled/celandine/enemys-garden.campaign-package.json',
  'packages/bundled/celandine/enemys-garden.campaign-projection.json',
  'NCC-64941'
);
for (const bundledPackagePath of [
  'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json',
  'packages/bundled/glass-harbor/drowned-constellation.campaign-package.json',
  'packages/bundled/serein/black-current.campaign-package.json',
  'packages/bundled/eudora-vale/broken-accord.campaign-package.json',
  'packages/bundled/aster-vale/unseen-border.campaign-package.json',
  'packages/bundled/celandine/enemys-garden.campaign-package.json'
]) {
  requireBundledMissionGraphEntryAlignment(bundledPackagePath);
}
requireEqual(summary.campaign.structure.model, 'open-world', 'summary campaign.structure.model');
requireEqual(summary.campaign.structure.expectedSessions, '25-40', 'summary campaign.structure.expectedSessions');
requireEqual(summary.campaign.structure.storyArcCount, 4, 'summary campaign.structure.storyArcCount');
requireEqual(summary.campaign.structure.endConditionCount, 12, 'summary campaign.structure.endConditionCount');
requireEqual(summary.campaign.structure.continuationFrameCount, 7, 'summary campaign.structure.continuationFrameCount');
requireEqual(summary.campaign.structure.questTemplateCount, 19, 'summary campaign.structure.questTemplateCount');
requireIncludes(ids(summary.endConditions), 'terminal.ashes.breck-destroyed-objective-saved', 'summary endConditions Breckenridge objective saved');
requireIncludes(ids(summary.campaign.quests), 'chapter-1-the-empty-convoy', 'summary campaign.quests chapter 1');
requireEqual(summary.playerRole.mode, 'lockedRole', 'summary playerRole.mode');
requireEqual(summary.playerRole.label, 'Incoming permanent XO', 'summary playerRole.label');
requireEqual(summary.playerRole.rank, 'Commander', 'summary playerRole.rank');
requireEqual(summary.playerRole.billet, 'Executive Officer', 'summary playerRole.billet');
requireEqual(summary.playerRole.authority, 'Principal mission commander and coordinator of shipboard operations.', 'summary playerRole.authority');
requireIncludes(summary.simulationModes, 'Exploration', 'summary simulationModes Exploration');
requireIncludes(summary.simulationModes, 'Command', 'summary simulationModes Command');
requireEqual(ids(summary.seniorCrewPreview), [
  'mara-whitaker',
  'player-commander',
  'kieran-vale',
  'priya-nayar',
  'hadrik-bronn',
  'rowan-saye',
  'miriam-sato',
  'imani-cross'
], 'summary seniorCrewPreview authored order');
requireIncludes(ids(summary.seniorCrewPreview), 'mara-whitaker', 'summary seniorCrewPreview captain');
requireEqual(summary.seniorCrewPreview.find((crew) => crew.id === 'mara-whitaker')?.billet, 'Commanding Officer', 'summary seniorCrewPreview captain billet');
requireEqual(summary.seniorCrewPreview.find((crew) => crew.id === 'miriam-sato')?.rank, 'Commander', 'summary seniorCrewPreview Miriam rank');
requireEqual(summary.datasetCount, 4, 'summary datasetCount');
requireIncludes(ids(packageData.assets.datasets), 'breckenridge.ashes-of-peace.chapter-1-the-empty-convoy', 'package datasets Chapter 1 graph');
requireIncludes(ids(packageData.assets.datasets), 'breckenridge.ashes-of-peace.chapter-2-false-colors', 'package datasets Chapter 2 graph');

const runtimeContext = createRuntimePackageContext(packageData);
requireEqual(runtimeContext.package.schemaVersion, 2, 'runtimeContext package schemaVersion');
requireEqual(runtimeContext.campaign.id, 'ashes-of-peace', 'runtimeContext campaign id');
requireEqual(runtimeContext.world.id, 'asterion-reach', 'runtimeContext world region');
requireIncludes(ids(runtimeContext.endConditions.conditions), 'terminal.ashes.player-death-command', 'runtimeContext end conditions player death');
requireIncludes(ids(runtimeContext.endConditions.continuationFrames), 'survivors-after-breck-loss', 'runtimeContext continuation frames ship loss');
requireIncludes(ids(runtimeContext.questTemplates.templates), 'chapter-1-the-empty-convoy', 'runtimeContext quest templates chapter 1');
requireIncludes(ids(runtimeContext.questTemplates.templates), 'side-the-long-repair', 'runtimeContext authored side quest');
requireEqual(runtimeContext.contextPolicy.hiddenStatePolicy, 'explicit-player-safe-projection-only', 'runtimeContext hidden-state policy');
requireEqual(runtimeContext.reactionRules.version, 2, 'runtimeContext reaction rules schema');
requireEqual(runtimeContext.threadTemplates.version, 2, 'runtimeContext thread templates schema');

const creatorContext = createCharacterCreationContext(packageData);
requireEqual(creatorContext.roleMode, 'lockedRole', 'creatorContext roleMode');
requireEqual(creatorContext.lockedRole.rank, 'Commander', 'creatorContext lockedRole.rank');
requireEqual(creatorContext.lockedRole.billet, 'Executive Officer', 'creatorContext lockedRole.billet');
requireEqual(creatorContext.campaignContext.currentDateOrStardate, 'Stardate 53049.2', 'creatorContext stardate');
requireEqual(creatorContext.flow.steps, ['identity', 'service', 'personality', 'review'], 'creatorContext flow.steps');
requireIncludes(creatorContext.fields.required, 'careerBackground', 'creatorContext requiredFields');
requireIncludes(ids(creatorContext.options.allowedSpecies), 'custom-federation-species', 'creatorContext allowedSpecies');
requireIncludes(ids(creatorContext.options.careerBackgrounds), 'operations-logistics', 'creatorContext careerBackgrounds');
requireIncludes(ids(creatorContext.options.formativeExperiences), 'dominion-war-fleet-service', 'creatorContext formativeExperiences');
requireIncludes(ids(creatorContext.options.assignmentReasons), 'creator-decides', 'creatorContext assignmentReasons');
requireEqual(ids(creatorContext.options.traitCategories), ['insight', 'connection', 'execution'], 'creatorContext traitCategories');
requireIncludes(ids(creatorContext.options.flaws.options), 'guarded', 'creatorContext flaws');
requireEqual(creatorContext.dossier.biographyWordTarget, { min: 150, max: 250 }, 'creatorContext biographyWordTarget');
requireEqual(creatorContext.dossier.defaultDetailLevel, 'Standard', 'creatorContext defaultDetailLevel');
requireIncludes(ids(creatorContext.continuityGuardrails), 'campaign-secret-safety', 'creatorContext guardrails');

for (const [contextPath, expectedInsight, expectedFlaw] of [
  ['packages/bundled/serein/black-current.campaign-package.json', 'disciplined-uncertainty', 'over-responsible'],
  ['packages/bundled/eudora-vale/broken-accord.campaign-package.json', 'systems-thinking', 'overcontrol']
]) {
  const alternateContext = createCharacterCreationContext(readJson(contextPath));
  requireEqual(ids(alternateContext.options.traitCategories), ['insight', 'connection', 'execution'], `${contextPath} normalized traitCategories`);
  requireIncludes(ids(alternateContext.options.traitCategories[0]?.options || []), expectedInsight, `${contextPath} normalized insight traits`);
  requireIncludes(ids(alternateContext.options.flaws.options), expectedFlaw, `${contextPath} normalized flaws`);
}

creatorContext.options.allowedSpecies[0].label = 'Changed';
creatorContext.lockedRole.rank = 'Changed';
requireEqual(packageData.characterCreation.allowedSpecies[0].label, 'Human', 'creatorContext clone isolation species');
requireEqual(packageData.characterCreation.lockedRole.rank, 'Commander', 'creatorContext clone isolation role');
requireEqual(stable(packageData), before, 'packageData immutability');

const missingCreator = { ...packageData };
delete missingCreator.characterCreation;
if (getCampaignPackageSpineErrors(missingCreator).length === 0) {
  at('missing characterCreation', 'spine errors must reject missing characterCreation');
}

if (errors.length > 0) {
  console.error('Campaign package context test failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Campaign package context tests passed: summary, creator context, clone isolation');
