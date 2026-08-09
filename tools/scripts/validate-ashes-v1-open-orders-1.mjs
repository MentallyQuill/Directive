import fs from 'node:fs';

import { lintMissionPackage } from '../../src/mission/v1/mission-package-linter.mjs';

const DEFINITION_PATH = 'packages/bundled/breckenridge/v1/open-orders-1-work-worth-doing.mission-v1.json';
const SCENARIOS_PATH = 'tests/fixtures/mission/v1/open-orders-1-scenarios.fixture.json';
const PACKAGE_PATH = 'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json';
const PREDECESSOR_PATH = 'packages/bundled/breckenridge/v1/chapter-2-false-colors.mission-v1.json';
const CREW_PATH = 'packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json';

function readJson(path) {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function questTemplates(packageData) {
    const collections = Array.isArray(packageData.questTemplates)
        ? packageData.questTemplates
        : [packageData.questTemplates];
    return collections.flatMap((collection) => collection?.templates || []);
}

const definition = readJson(DEFINITION_PATH);
const scenarios = readJson(SCENARIOS_PATH);
const packageData = readJson(PACKAGE_PATH);
const predecessor = readJson(PREDECESSOR_PATH);
const crewData = readJson(CREW_PATH);
const templates = questTemplates(packageData);
const knownTransitionTargetIds = new Set(templates.map((template) => template.id));
const scenarioExpectations = scenarios.scenarios.map((scenario) => scenario.expected);
const result = lintMissionPackage({ definition, knownTransitionTargetIds, scenarioExpectations });
const errors = [...result.errors];

if (definition.packageBinding?.packageId !== packageData.manifest?.id) {
    errors.push(`package binding id does not match ${PACKAGE_PATH}`);
}
if (definition.packageBinding?.packageVersion !== packageData.manifest?.version) {
    errors.push(`package binding version does not match ${PACKAGE_PATH}`);
}
const predecessorTarget = predecessor.transitions?.[0]?.target?.id;
if (definition.packageBinding?.sourceId !== predecessorTarget) {
    errors.push(`V1-only source identity does not match the exact False Colors target: ${predecessorTarget}`);
}
if (templates.some((template) => template.id === definition.packageBinding?.sourceId)) {
    errors.push('Open Orders I must not add a duplicate legacy quest template');
}
if (!templates.some((template) => template.id === definition.transitions?.[0]?.target?.id)) {
    errors.push(`Chapter 3 transition target is not an authored package template: ${definition.transitions?.[0]?.target?.id}`);
}
if (scenarios.definitionId !== definition.id) errors.push('scenario fixture definitionId mismatch');
if ((definition.clocks || []).length !== 0) errors.push('Open Orders I cannot add a clock without an authored deadline');
if ((definition.reportRoutes || []).length !== 3) errors.push('Open Orders I must use exactly three aggregate assessment reports');

const knownActorIds = new Set((crewData.officers || []).map((officer) => officer.id));
for (const route of definition.reportRoutes || []) {
    for (const actorId of [...(route.preferredActorIds || []), ...(route.fallbackActorIds || [])]) {
        if (!knownActorIds.has(actorId)) errors.push(`${route.id} names unknown crew actor: ${actorId}`);
    }
    const serializedWhen = JSON.stringify(route.when);
    if (!serializedWhen.includes('event.open-orders1.') || !serializedWhen.includes('-engagement')) {
        errors.push(`${route.id} is not gated by both engagement and completed assessment`);
    }
}

const optionalObjectiveIds = [
    'objective.open-orders1.long-repair',
    'objective.open-orders1.borrowed-wings',
    'objective.open-orders1.quiet-channels',
];
const closeWhenText = JSON.stringify(definition.closeWhen);
for (const objectiveId of optionalObjectiveIds) {
    if (closeWhenText.includes(objectiveId)) errors.push(`${objectiveId} participates directly in closeWhen`);
}
if (!closeWhenText.includes('objective.open-orders1.conclusion')) {
    errors.push('the explicit interval conclusion is not the sole closure authority');
}

for (const assignment of ['long-repair', 'borrowed-wings', 'quiet-channels']) {
    const engagementPolicy = definition.evidencePolicies.find((policy) => policy.id === `policy.open-orders1.${assignment}-engagement`);
    if (engagementPolicy?.claimType !== 'decisionRecorded' || !engagementPolicy?.sourceRoles?.includes('user')) {
        errors.push(`${assignment} engagement is not a player-provable decision`);
    }
    const resultPolicy = definition.evidencePolicies.find((policy) => policy.id === `policy.open-orders1.${assignment}-result`);
    if (JSON.stringify(resultPolicy?.when) !== JSON.stringify({ factKnown: `fact.open-orders1.${assignment}-assessment` })) {
        errors.push(`${assignment} result does not require its player-known assessment`);
    }
}

const scenarioById = new Map(scenarios.scenarios.map((scenario) => [scenario.id, scenario]));
const two = scenarioById.get('two-assignment-normal');
const broad = scenarioById.get('broad-coverage-with-delegation');
const overextended = scenarioById.get('three-direct-overextension');
const early = scenarioById.get('early-departure');
if (two?.expected?.outcomeDimensions?.['dimension.open-orders1.load'] !== 'normal-two') {
    errors.push('fixtures do not prove the normal two-assignment load');
}
if (!broad?.sequence?.some((fragment) => fragment.endsWith('-delegated'))
    || broad?.expected?.outcomeDimensions?.['dimension.open-orders1.load'] !== 'broad-delegated-coverage') {
    errors.push('fixtures do not prove broad coverage requires delegation');
}
if (overextended?.sequence?.some((fragment) => fragment.endsWith('-delegated'))
    || overextended?.expected?.outcomeDimensions?.['dimension.open-orders1.load'] !== 'overextended-direct') {
    errors.push('fixtures do not prove all-direct overextension');
}
if (early?.sequence?.[0] !== 'depart-early' || early.expected?.terminalDisposition !== 'earlyDepartureForward') {
    errors.push('fixtures do not prove explicit player-known early departure');
}

const reachedTerminalDispositions = new Set(scenarioExpectations.map((expected) => expected.terminalDisposition).filter(Boolean));
for (const terminal of definition.terminalDispositions || []) {
    if (!reachedTerminalDispositions.has(terminal.id)) errors.push(`terminal disposition lacks a scenario: ${terminal.id}`);
}

const playerSafeSurfaces = [
    definition.playerText,
    ...(definition.facts || []).map((fact) => fact.playerText),
    ...(definition.reportRoutes || []).map((route) => route.playerText),
    ...(definition.objectives || []).map((objective) => objective.playerText),
    ...(definition.terminalDispositions || []).map((terminal) => terminal.playerText),
];
if (/pale lantern.*(?:source|controls|operates)|holt's cell|hidden objective|\b\d+%/i.test(JSON.stringify(playerSafeSurfaces))) {
    errors.push('player-safe Open Orders I surfaces contain a conspiracy spoiler or legacy progress artifact');
}

if (errors.length > 0) {
    for (const error of [...new Set(errors)].sort()) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
} else {
    console.log(
        `Validated Ashes V1 Open Orders I: ${definition.objectives.length} objectives, `
        + `${definition.evidencePolicies.length} evidence policies, `
        + `${definition.reportRoutes.length} aggregate reports, ${scenarios.scenarios.length} scenarios, `
        + 'V1-only interval identity, no synthetic clock.',
    );
}
