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
requireEqual(summary.campaign.structure.expectedLength, '25-40 Sessions', 'summary campaign.structure.expectedLength');
requireIncludes(ids(summary.campaign.chapters), 'chapter-1-the-empty-convoy', 'summary campaign.chapters chapter 1');
requireEqual(summary.playerRole.mode, 'lockedRole', 'summary playerRole.mode');
requireEqual(summary.playerRole.label, 'Incoming permanent XO', 'summary playerRole.label');
requireEqual(summary.playerRole.rank, 'Commander', 'summary playerRole.rank');
requireEqual(summary.playerRole.billet, 'Executive Officer', 'summary playerRole.billet');
requireEqual(summary.playerRole.authority, 'Principal mission commander and coordinator of shipboard operations.', 'summary playerRole.authority');
requireIncludes(summary.simulationModes, 'Exploration', 'summary simulationModes Exploration');
requireIncludes(summary.simulationModes, 'Command', 'summary simulationModes Command');
requireIncludes(ids(summary.seniorCrewPreview), 'mara-whitaker', 'summary seniorCrewPreview captain');
requireEqual(summary.seniorCrewPreview.find((crew) => crew.id === 'mara-whitaker')?.billet, 'Commanding Officer', 'summary seniorCrewPreview captain billet');
requireEqual(summary.datasetCount, 4, 'summary datasetCount');
requireIncludes(ids(packageData.assets.datasets), 'breckenridge.ashes-of-peace.chapter-1-the-empty-convoy', 'package datasets Chapter 1 graph');
requireIncludes(ids(packageData.assets.datasets), 'breckenridge.ashes-of-peace.chapter-2-false-colors', 'package datasets Chapter 2 graph');

const runtimeContext = createRuntimePackageContext(packageData);
const chapter1Checkpoint = (runtimeContext.mvpCheckpoints || [])
  .find((checkpoint) => checkpoint.chapterId === 'chapter-1-the-empty-convoy');
requireEqual(chapter1Checkpoint?.mvpStatus, 'mvp-complete', 'runtimeContext chapter1 mvpStatus');
requireEqual(chapter1Checkpoint?.checkpoint?.rawValuesHidden, true, 'runtimeContext checkpoint rawValuesHidden');
requireIncludes(chapter1Checkpoint?.checkpoint?.established || [], 'The Breckenridge rescued the convoy survivors through controlled quarantine, security, and evidence procedures.', 'runtimeContext checkpoint established');
requireIncludes(chapter1Checkpoint?.checkpoint?.unresolved || [], 'The wider source of the conflicting orders remains unknown to the player.', 'runtimeContext checkpoint unresolved');
requireIncludes(chapter1Checkpoint?.checkpoint?.carryForward || [], 'Open repair, fallback-command, and coordination pressures can still become optional work.', 'runtimeContext checkpoint carryForward');
if (/pale lantern|nightfall|bioweapon|kestrel/i.test(stable(runtimeContext.mvpCheckpoints))) {
  at('runtimeContext mvpCheckpoints', 'must not expose hidden campaign terms');
}

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
