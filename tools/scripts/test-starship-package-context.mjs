import fs from 'node:fs';
import path from 'node:path';
import {
  createCharacterCreationContext,
  createStarshipPackageSummary,
  getStarshipPackageSpineErrors
} from '../../src/packages/starship-package-context.mjs';

const root = process.cwd();
const errors = [];

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

function ids(items = []) {
  return items.map((item) => item && item.id).filter(Boolean);
}

const packageData = readJson('packages/bundled/breckinridge/ashes-of-peace.starship-package.json');
const before = stable(packageData);

requireEqual(getStarshipPackageSpineErrors(packageData), [], 'package spine errors');

const summary = createStarshipPackageSummary(packageData);
requireEqual(summary.packageId, 'directive:starship-package:breckinridge-ashes-of-peace', 'summary packageId');
requireEqual(summary.ship.name, 'U.S.S. Breckinridge', 'summary ship.name');
requireEqual(summary.campaign.title, 'Ashes of Peace', 'summary campaign.title');
requireEqual(summary.playerRole.mode, 'lockedRole', 'summary playerRole.mode');
requireEqual(summary.playerRole.label, 'Incoming permanent XO', 'summary playerRole.label');
requireIncludes(summary.simulationModes, 'Exploration', 'summary simulationModes Exploration');
requireIncludes(summary.simulationModes, 'Command', 'summary simulationModes Command');
requireEqual(summary.datasetCount, 4, 'summary datasetCount');
requireIncludes(ids(packageData.assets.datasets), 'breckinridge.ashes-of-peace.chapter-1-the-empty-convoy', 'package datasets Chapter 1 graph');
requireIncludes(ids(packageData.assets.datasets), 'breckinridge.ashes-of-peace.chapter-2-false-colors', 'package datasets Chapter 2 graph');

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

creatorContext.options.allowedSpecies[0].label = 'Changed';
creatorContext.lockedRole.rank = 'Changed';
requireEqual(packageData.characterCreation.allowedSpecies[0].label, 'Human', 'creatorContext clone isolation species');
requireEqual(packageData.characterCreation.lockedRole.rank, 'Commander', 'creatorContext clone isolation role');
requireEqual(stable(packageData), before, 'packageData immutability');

const missingCreator = { ...packageData };
delete missingCreator.characterCreation;
if (getStarshipPackageSpineErrors(missingCreator).length === 0) {
  at('missing characterCreation', 'spine errors must reject missing characterCreation');
}

if (errors.length > 0) {
  console.error('Starship package context test failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Starship package context tests passed: summary, creator context, clone isolation');
