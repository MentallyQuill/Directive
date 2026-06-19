import fs from 'node:fs';
import path from 'node:path';
import {
  chapter2RequiredDecisionPointIds,
  chapter2RequiredFactIds,
  chapter2RequiredOutcomeFlagIds,
  chapter2RequiredPhaseIds,
  chapter2RequiredPressureIds,
  chapter1RequiredDecisionPointIds,
  chapter1RequiredFactIds,
  chapter1RequiredOutcomeFlagIds,
  chapter1RequiredPhaseIds,
  chapter1RequiredPressureIds,
  preludeRequiredDecisionPointIds,
  preludeRequiredOutcomeFlagIds,
  preludeRequiredPhaseIds,
  preludeRequiredPressureIds
} from './lib/directive-contracts.mjs';

const DEFAULT_SCHEMA = 'schemas/mission/mission-graph.schema.json';
const DEFAULT_PACKAGE = 'packages/bundled/breckinridge/ashes-of-peace.starship-package.json';
const DEFAULT_DATASET = 'packages/bundled/breckinridge/breckinridge-senior-staff.crew-dataset.json';
const DEFAULT_GRAPH = 'packages/bundled/breckinridge/prelude-a-ship-underway.mission-graph.json';

const root = process.cwd();
const schemaPath = path.resolve(root, process.argv[2] || DEFAULT_SCHEMA);
const packagePath = path.resolve(root, process.argv[3] || DEFAULT_PACKAGE);
const crewDatasetPath = path.resolve(root, process.argv[4] || DEFAULT_DATASET);
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

function requireIncludes(actualSet, requiredIds, location, label) {
  for (const id of requiredIds) {
    if (!actualSet.has(id)) {
      at(location, `missing ${label} "${id}"`);
    }
  }
}

function missionSpecific(requiredByMissionId, fallback) {
  return requiredByMissionId[missionId] || fallback;
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

const schema = readJson(schemaPath);
const pkg = readJson(packagePath);
const crewDataset = readJson(crewDatasetPath);
const graph = readJson(graphPath);
const missionId = graph.manifest?.missionId || null;

if (schema.title !== 'Directive Mission Graph') {
  at('schema.title', 'must be Directive Mission Graph');
}

if (requireObject(graph.manifest, '$.manifest')) {
  if (graph.manifest.kind !== 'directive.missionGraph') {
    at('$.manifest.kind', 'must be directive.missionGraph');
  }
  if (graph.manifest.schemaVersion !== 1) {
    at('$.manifest.schemaVersion', 'must be 1');
  }
  if (graph.manifest.packageId !== pkg.manifest?.id) {
    at('$.manifest.packageId', 'must match starship package manifest id');
  }
  if (graph.manifest.campaignId !== pkg.mainCampaign?.id) {
    at('$.manifest.campaignId', 'must match package mainCampaign id');
  }
  if (!idSet(pkg.missionTemplates?.main).has(graph.manifest.missionId)) {
    at('$.manifest.missionId', 'must exist in package missionTemplates.main');
  }
  if (graph.manifest.version !== pkg.manifest?.version) {
    at('$.manifest.version', 'must match package version');
  }
}

const packageAsset = (pkg.assets?.datasets || []).find((asset) => asset?.id === graph.manifest?.id);
if (!packageAsset) {
  at('$.assets.datasets', `package must list mission graph asset "${graph.manifest?.id}"`);
} else {
  if (packageAsset.kind !== 'missionGraph') {
    at('$.assets.datasets.missionGraph.kind', 'must be missionGraph');
  }
  if (packageAsset.path !== rel(graphPath)) {
    at('$.assets.datasets.missionGraph.path', `must be ${rel(graphPath)}`);
  }
  if (packageAsset.schema !== rel(schemaPath)) {
    at('$.assets.datasets.missionGraph.schema', `must be ${rel(schemaPath)}`);
  }
}

if (requireArray(graph.sources, '$.sources')) {
  graph.sources.forEach((doc, index) => checkSourceDocument(doc, `$.sources[${index}]`));
}

if (requireObject(graph.missionFrame, '$.missionFrame')) {
  if (missionId === 'prelude-a-ship-underway') {
    if (graph.missionFrame.startStardate !== pkg.mainCampaign?.openingStardate) {
      at('$.missionFrame.startStardate', 'must match campaign opening stardate');
    }
    if (graph.missionFrame.baselineEndStardate !== 53076.6) {
      at('$.missionFrame.baselineEndStardate', 'must be 53076.6 for the baseline Reach arrival');
    }
    if (graph.missionFrame.transitionToMissionId !== 'chapter-1-the-empty-convoy') {
      at('$.missionFrame.transitionToMissionId', 'must transition to chapter-1-the-empty-convoy');
    }
  }
  if (missionId === 'chapter-1-the-empty-convoy') {
    if (graph.missionFrame.startStardate !== 53076.6) {
      at('$.missionFrame.startStardate', 'must be 53076.6 for Chapter 1');
    }
    if (graph.missionFrame.transitionToMissionId !== 'chapter-2-false-colors') {
      at('$.missionFrame.transitionToMissionId', 'must transition to chapter-2-false-colors');
    }
  }
  if (missionId === 'chapter-2-false-colors') {
    if (graph.missionFrame.startStardate !== 53094) {
      at('$.missionFrame.startStardate', 'must be 53094 for Chapter 2');
    }
    if (graph.missionFrame.transitionToMissionId !== 'open-orders-1-work-worth-doing') {
      at('$.missionFrame.transitionToMissionId', 'must transition to open-orders-1-work-worth-doing');
    }
  }
  if (graph.missionFrame.failurePolicy?.campaignMustContinue !== true) {
    at('$.missionFrame.failurePolicy.campaignMustContinue', 'must be true');
  }
  const requiredForbidden = missionId === 'chapter-1-the-empty-convoy'
    ? ['destroy the Breckinridge', 'reveal Pale Lantern in the opening frame', 'treat missing protocol words as player incompetence']
    : missionId === 'chapter-2-false-colors'
      ? ['destroy the Breckinridge', 'reveal the impersonation source in the first briefing', 'grant unrestricted command authentication access']
      : ['destroy the Breckinridge', 'remove a senior officer from play', 'prevent Ashes of Peace from beginning'];
  for (const forbidden of requiredForbidden) {
    if (!graph.missionFrame.failurePolicy?.forbiddenOutcomes?.includes(forbidden)) {
      at('$.missionFrame.failurePolicy.forbiddenOutcomes', `must include "${forbidden}"`);
    }
  }
}

const phaseIds = idSet(graph.phases);
const factIds = idSet(graph.facts);
const decisionPointIds = idSet(graph.decisionPoints);
const commandDecisionIds = idSet(graph.commandDecisions);
const outcomeFlagIds = idSet(graph.outcomeFlags);
const actorIntentionIds = idSet(graph.actorIntentions);
const pressureIds = idSet(graph.pressures);
const crewCardIds = idSet(crewDataset.cards);

if (requireArray(graph.phases, '$.phases')) {
  requireUniqueIds(graph.phases, '$.phases');
  requireIncludes(
    phaseIds,
    missionSpecific({
      'chapter-1-the-empty-convoy': chapter1RequiredPhaseIds,
      'chapter-2-false-colors': chapter2RequiredPhaseIds
    }, preludeRequiredPhaseIds),
    '$.phases',
    'phase'
  );
  for (const [index, phase] of graph.phases.entries()) {
    const location = `$.phases[${index}]`;
    if (!isObject(phase)) {
      at(location, 'must be an object');
      continue;
    }
    for (const factId of phase.factsIntroduced || []) {
      if (!factIds.has(factId)) {
        at(`${location}.factsIntroduced`, `unknown fact id "${factId}"`);
      }
    }
    for (const decisionPointId of phase.decisionPointIds || []) {
      if (!decisionPointIds.has(decisionPointId)) {
        at(`${location}.decisionPointIds`, `unknown decision point id "${decisionPointId}"`);
      }
    }
  }
}

if (requireArray(graph.facts, '$.facts')) {
  requireUniqueIds(graph.facts, '$.facts');
  for (const [index, fact] of graph.facts.entries()) {
    if (fact?.introducedByPhase && !phaseIds.has(fact.introducedByPhase)) {
      at(`$.facts[${index}].introducedByPhase`, `unknown phase id "${fact.introducedByPhase}"`);
    }
  }
  const requiredFacts = missionSpecific({
    'chapter-1-the-empty-convoy': chapter1RequiredFactIds,
    'chapter-2-false-colors': chapter2RequiredFactIds
  }, [
      'hesperus.no-hostile-actor',
      'hesperus.inspection-fraud',
      'ship.command-network-certificate-issue',
      'chapter-1.relief-convoy-distress-packet'
    ]);
  for (const requiredFact of requiredFacts) {
    if (!factIds.has(requiredFact)) {
      at('$.facts', `missing required fact "${requiredFact}"`);
    }
  }
}

if (requireArray(graph.clocks, '$.clocks')) {
  requireUniqueIds(graph.clocks, '$.clocks');
  const requiredClocks = missionSpecific({
    'chapter-1-the-empty-convoy': ['chapter-1.rescue-window', 'chapter-1.security-exposure', 'chapter-1.evidence-volatility'],
    'chapter-2-false-colors': ['chapter-2.public-anger', 'chapter-2.audit-fragility', 'chapter-2.medical-risk', 'chapter-2.security-access-risk']
  }, ['arrival-schedule-margin', 'crew-integration-strain', 'technical-debt-pressure']);
  for (const clockId of requiredClocks) {
    if (!idSet(graph.clocks).has(clockId)) {
      at('$.clocks', `missing clock "${clockId}"`);
    }
  }
}

if (graph.actorIntentions !== undefined && requireArray(graph.actorIntentions, '$.actorIntentions')) {
  requireUniqueIds(graph.actorIntentions, '$.actorIntentions');
  for (const [index, intention] of graph.actorIntentions.entries()) {
    const location = `$.actorIntentions[${index}]`;
    for (const pressureId of intention?.pressureIds || []) {
      if (!pressureIds.has(pressureId)) {
        at(`${location}.pressureIds`, `unknown pressure id "${pressureId}"`);
      }
    }
  }
}

if (graph.pressures !== undefined && requireArray(graph.pressures, '$.pressures')) {
  requireUniqueIds(graph.pressures, '$.pressures');
  requireIncludes(
    pressureIds,
    missionSpecific({
      'chapter-1-the-empty-convoy': chapter1RequiredPressureIds,
      'chapter-2-false-colors': chapter2RequiredPressureIds
    }, preludeRequiredPressureIds),
    '$.pressures',
    'pressure'
  );
  for (const [index, pressure] of graph.pressures.entries()) {
    const location = `$.pressures[${index}]`;
    if (pressure?.phaseId && !phaseIds.has(pressure.phaseId)) {
      at(`${location}.phaseId`, `unknown phase id "${pressure.phaseId}"`);
    }
    for (const intentionId of pressure?.intentionIds || []) {
      if (!actorIntentionIds.has(intentionId)) {
        at(`${location}.intentionIds`, `unknown actor intention id "${intentionId}"`);
      }
    }
    for (const decisionPointId of pressure?.linkedDecisionPointIds || []) {
      if (!decisionPointIds.has(decisionPointId)) {
        at(`${location}.linkedDecisionPointIds`, `unknown decision point id "${decisionPointId}"`);
      }
    }
    for (const factId of pressure?.linkedFactIds || []) {
      if (!factIds.has(factId)) {
        at(`${location}.linkedFactIds`, `unknown fact id "${factId}"`);
      }
    }
    for (const clockId of pressure?.linkedClockIds || []) {
      if (!idSet(graph.clocks).has(clockId)) {
        at(`${location}.linkedClockIds`, `unknown clock id "${clockId}"`);
      }
    }
    for (const commandDecisionId of pressure?.linkedCommandDecisionIds || []) {
      if (!commandDecisionIds.has(commandDecisionId)) {
        at(`${location}.linkedCommandDecisionIds`, `unknown command decision id "${commandDecisionId}"`);
      }
    }
  }
}

if (requireArray(graph.decisionPoints, '$.decisionPoints')) {
  requireUniqueIds(graph.decisionPoints, '$.decisionPoints');
  requireIncludes(
    decisionPointIds,
    missionSpecific({
      'chapter-1-the-empty-convoy': chapter1RequiredDecisionPointIds,
      'chapter-2-false-colors': chapter2RequiredDecisionPointIds
    }, preludeRequiredDecisionPointIds),
    '$.decisionPoints',
    'decision point'
  );
  for (const [index, decisionPoint] of graph.decisionPoints.entries()) {
    const location = `$.decisionPoints[${index}]`;
    if (decisionPoint?.phaseId && !phaseIds.has(decisionPoint.phaseId)) {
      at(`${location}.phaseId`, `unknown phase id "${decisionPoint.phaseId}"`);
    }
    for (const commandDecisionId of decisionPoint?.commandDecisionIds || []) {
      if (!commandDecisionIds.has(commandDecisionId)) {
        at(`${location}.commandDecisionIds`, `unknown command decision id "${commandDecisionId}"`);
      }
    }
    for (const outcomeFlagId of decisionPoint?.outcomeFlagIds || []) {
      if (!outcomeFlagIds.has(outcomeFlagId)) {
        at(`${location}.outcomeFlagIds`, `unknown outcome flag id "${outcomeFlagId}"`);
      }
    }
  }
}

if (requireArray(graph.commandDecisions, '$.commandDecisions')) {
  requireUniqueIds(graph.commandDecisions, '$.commandDecisions');
  if (missionId === 'prelude-a-ship-underway') {
    const hesperusDecision = graph.commandDecisions.find((decision) => decision?.id === 'command.hesperus-fraud-accountability');
    if (!hesperusDecision) {
      at('$.commandDecisions', 'missing command.hesperus-fraud-accountability');
    } else {
      if (hesperusDecision.repeatable !== false) {
        at('$.commandDecisions.command.hesperus-fraud-accountability.repeatable', 'must be false');
      }
      if (!String(hesperusDecision.awardPolicy || '').includes('passengers')) {
        at('$.commandDecisions.command.hesperus-fraud-accountability.awardPolicy', 'must account for passenger cost');
      }
    }
  }
  if (missionId === 'chapter-1-the-empty-convoy') {
    const initialDecision = graph.commandDecisions.find((decision) => decision?.id === 'command.initial-convoy-posture');
    if (!initialDecision) {
      at('$.commandDecisions', 'missing command.initial-convoy-posture');
    } else {
      if (initialDecision.repeatable !== false) {
        at('$.commandDecisions.command.initial-convoy-posture.repeatable', 'must be false');
      }
      if (!String(initialDecision.awardPolicy || '').includes('rescue')) {
        at('$.commandDecisions.command.initial-convoy-posture.awardPolicy', 'must account for rescue');
      }
    }
  }
  if (missionId === 'chapter-2-false-colors') {
    const transparencyDecision = graph.commandDecisions.find((decision) => decision?.id === 'command.false-colors-transparency-terms');
    if (!transparencyDecision) {
      at('$.commandDecisions', 'missing command.false-colors-transparency-terms');
    } else {
      if (transparencyDecision.repeatable !== false) {
        at('$.commandDecisions.command.false-colors-transparency-terms.repeatable', 'must be false');
      }
      if (!String(transparencyDecision.awardPolicy || '').includes('transparency')) {
        at('$.commandDecisions.command.false-colors-transparency-terms.awardPolicy', 'must account for transparency');
      }
    }
    const evidenceDecision = graph.commandDecisions.find((decision) => decision?.id === 'command.orison-evidence-baseline');
    if (!evidenceDecision) {
      at('$.commandDecisions', 'missing command.orison-evidence-baseline');
    } else {
      if (evidenceDecision.repeatable !== false) {
        at('$.commandDecisions.command.orison-evidence-baseline.repeatable', 'must be false');
      }
      if (!String(evidenceDecision.awardPolicy || '').includes('independent evidence')) {
        at('$.commandDecisions.command.orison-evidence-baseline.awardPolicy', 'must account for independent evidence');
      }
    }
    const medicalDecision = graph.commandDecisions.find((decision) => decision?.id === 'command.aegis-medical-trust');
    if (!medicalDecision) {
      at('$.commandDecisions', 'missing command.aegis-medical-trust');
    } else {
      if (medicalDecision.repeatable !== false) {
        at('$.commandDecisions.command.aegis-medical-trust.repeatable', 'must be false');
      }
      if (!String(medicalDecision.awardPolicy || '').includes('medical care')) {
        at('$.commandDecisions.command.aegis-medical-trust.awardPolicy', 'must account for medical care');
      }
    }
    const securityDecision = graph.commandDecisions.find((decision) => decision?.id === 'command.security-access-demonstration');
    if (!securityDecision) {
      at('$.commandDecisions', 'missing command.security-access-demonstration');
    } else {
      if (securityDecision.repeatable !== false) {
        at('$.commandDecisions.command.security-access-demonstration.repeatable', 'must be false');
      }
      if (!String(securityDecision.awardPolicy || '').includes('command-authentication')) {
        at('$.commandDecisions.command.security-access-demonstration.awardPolicy', 'must account for command-authentication access');
      }
    }
    const charterDecision = graph.commandDecisions.find((decision) => decision?.id === 'command.joint-investigation-charter');
    if (!charterDecision) {
      at('$.commandDecisions', 'missing command.joint-investigation-charter');
    } else {
      if (charterDecision.repeatable !== false) {
        at('$.commandDecisions.command.joint-investigation-charter.repeatable', 'must be false');
      }
      if (!String(charterDecision.awardPolicy || '').includes('joint investigation')) {
        at('$.commandDecisions.command.joint-investigation-charter.awardPolicy', 'must account for joint investigation');
      }
    }
  }
}

if (requireArray(graph.outcomeFlags, '$.outcomeFlags')) {
  requireUniqueIds(graph.outcomeFlags, '$.outcomeFlags');
  requireIncludes(
    outcomeFlagIds,
    missionSpecific({
      'chapter-1-the-empty-convoy': chapter1RequiredOutcomeFlagIds,
      'chapter-2-false-colors': chapter2RequiredOutcomeFlagIds
    }, preludeRequiredOutcomeFlagIds),
    '$.outcomeFlags',
    'outcome flag'
  );
  for (const [index, flag] of graph.outcomeFlags.entries()) {
    if (!flag?.allowedValues?.includes(flag.defaultValue)) {
      at(`$.outcomeFlags[${index}].defaultValue`, 'must be included in allowedValues');
    }
  }
}

if (requireArray(graph.endStates, '$.endStates')) {
  requireUniqueIds(graph.endStates, '$.endStates');
  for (const [index, endState] of graph.endStates.entries()) {
    if (endState?.transitionToMissionId !== graph.missionFrame?.transitionToMissionId) {
      at(`$.endStates[${index}].transitionToMissionId`, 'must match missionFrame.transitionToMissionId');
    }
  }
}

if (requireArray(graph.retrievalHooks, '$.retrievalHooks')) {
  for (const [index, hook] of graph.retrievalHooks.entries()) {
    const location = `$.retrievalHooks[${index}]`;
    if (hook?.phaseId && !phaseIds.has(hook.phaseId)) {
      at(`${location}.phaseId`, `unknown phase id "${hook.phaseId}"`);
    }
    for (const cardId of hook?.requiredCardIds || []) {
      if (!crewCardIds.has(cardId)) {
        at(`${location}.requiredCardIds`, `unknown crew dataset card id "${cardId}"`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error(`Mission graph validation failed for ${rel(graphPath)}:`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Validated ${rel(graphPath)} against ${rel(schemaPath)}, ${rel(packagePath)}, and ${rel(crewDatasetPath)}`);
