import fs from 'node:fs';

import { lintMissionPackage } from '../../src/mission/v1/mission-package-linter.mjs';

const DEFINITION_PATH = 'packages/bundled/breckenridge/v1/chapter-3-dead-letters.mission-v1.json';
const SCENARIOS_PATH = 'tests/fixtures/mission/v1/chapter-3-dead-letters-scenarios.fixture.json';
const PACKAGE_PATH = 'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json';
const PREDECESSOR_PATH = 'packages/bundled/breckenridge/v1/open-orders-1-work-worth-doing.mission-v1.json';
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
const quest = templates.find((template) => template.id === definition.packageBinding?.sourceId);
const knownTransitionTargetIds = new Set(templates.map((template) => template.id));
const scenarioExpectations = scenarios.scenarios.map((scenario) => scenario.expected);
const result = lintMissionPackage({
    definition,
    knownTransitionTargetIds,
    scenarioExpectations,
    spoilerTerms: [
        'dominion',
        'private archive',
        'distributed',
        'predictive',
        'starfleet intelligence',
        'demeris',
        'mira solenn',
        'pale lantern',
        'farwatch',
        'holt',
        'rourke',
        'wayward sun',
        'hidden objective',
        'unknown objective',
    ],
});
const errors = [...result.errors];

if (definition.packageBinding?.packageId !== packageData.manifest?.id) {
    errors.push(`package binding id does not match ${PACKAGE_PATH}`);
}
if (definition.packageBinding?.packageVersion !== packageData.manifest?.version) {
    errors.push(`package binding version does not match ${PACKAGE_PATH}`);
}
if (definition.packageBinding?.sourceId !== predecessor.transitions?.[0]?.target?.id) {
    errors.push('Dead Letters source identity does not match the exact Open Orders I transition target');
}
if (!quest || JSON.stringify(quest.missionGraph || null) !== '{}') {
    errors.push('legacy Dead Letters source must exist with an empty mission graph before V1 replacement');
}
if (!templates.some((template) => template.id === definition.transitions?.[0]?.target?.id)) {
    errors.push(`Chapter 4 transition target is not an authored package template: ${definition.transitions?.[0]?.target?.id}`);
}
if (scenarios.definitionId !== definition.id) errors.push('scenario fixture definitionId mismatch');
if ((definition.clocks || []).length !== 0) errors.push('Dead Letters cannot synthesize a clock from narrative pressure');
if ((definition.objectives || []).length !== 3) errors.push('Dead Letters must expose exactly three high-value required objectives');
if ((definition.reportRoutes || []).length !== 3) errors.push('Dead Letters must use exactly three aggregate discoverable reports');
if ((definition.events || []).some((event) => event.playerVisibility !== 'hidden')) {
    errors.push('internal Dead Letters evidence milestones cannot become separate player-facing trackers');
}
if ((definition.outcomes || []).some((outcome) => outcome.playerVisibility !== 'hidden')) {
    errors.push('raw Dead Letters decisions and results cannot duplicate aggregate player-facing dimensions');
}

const knownActorIds = new Set((crewData.officers || []).map((officer) => officer.id));
for (const route of definition.reportRoutes || []) {
    for (const actorId of [...(route.preferredActorIds || []), ...(route.fallbackActorIds || [])]) {
        if (!knownActorIds.has(actorId)) errors.push(`${route.id} names unknown crew actor: ${actorId}`);
    }
    if (route.deliveryRequirement !== 'required') {
        errors.push(`${route.id} can bypass accepted Duty Report custody`);
    }
}

for (const policyId of [
    'policy.chapter3.withdraw-responsibly',
    'policy.chapter3.relay-decision',
    'policy.chapter3.withdraw-relay-decision',
    'policy.chapter3.archive-decision',
]) {
    const policy = definition.evidencePolicies.find((candidate) => candidate.id === policyId);
    if (policy?.claimType !== 'decisionRecorded'
        || JSON.stringify(policy?.sourceRoles) !== JSON.stringify(['user'])) {
        errors.push(`${policyId} is not exclusively player-owned`);
    }
}
for (const policy of definition.evidencePolicies || []) {
    if (policy.claimType === 'outcomeObserved' && policy.sourceRoles?.includes('user')) {
        errors.push(`${policy.id} lets player prose prove an observed result`);
    }
}

const alternatePolicy = definition.evidencePolicies.find(
    (policy) => policy.id === 'policy.chapter3.alternate-route-corroborated',
);
if (!JSON.stringify(alternatePolicy?.when).includes('withdrewResponsibly')
    || !JSON.stringify(alternatePolicy?.when).includes('forcedOff')
    || !JSON.stringify(alternatePolicy?.when).includes('lostOrSeized')) {
    errors.push('alternate corroboration does not survive withdrawal, forced loss, and seized evidence');
}
const routePolicy = definition.evidencePolicies.find(
    (policy) => policy.id === 'policy.chapter3.access-route-disclosed',
);
if (!JSON.stringify(routePolicy?.when).includes('access-history-evidence-acquired')
    || !JSON.stringify(routePolicy?.when).includes('alternate-route-corroborated')) {
    errors.push('the Demeris lead is not gated by direct or alternate evidence');
}

const scenarioById = new Map(scenarios.scenarios.map((scenario) => [scenario.id, scenario]));
for (const scenarioId of [
    'accountable-isolation',
    'bounded-observation',
    'privacy-first-destruction-alternate-route',
    'responsible-withdrawal',
    'lost-or-seized-after-discovery',
    'forced-off-partial-alternate',
    'loss-before-informed-choice',
    'non-linear-custody-before-full-analysis',
    'lead-before-full-analysis',
]) {
    if (!scenarioById.has(scenarioId)) errors.push(`missing required resilience scenario: ${scenarioId}`);
}
const reachedTerminalDispositions = new Set(
    scenarioExpectations.map((expected) => expected.terminalDisposition).filter(Boolean),
);
for (const terminal of definition.terminalDispositions || []) {
    if (!reachedTerminalDispositions.has(terminal.id)) {
        errors.push(`terminal disposition lacks a scenario: ${terminal.id}`);
    }
}
const withdrawal = scenarioById.get('responsible-withdrawal');
if (withdrawal?.expected?.objectiveDispositions?.['objective.chapter3.evidence'] !== 'completedWithCost'
    || withdrawal?.expected?.knownFactsExcludes?.includes('fact.chapter3.relay-archive-character') !== true) {
    errors.push('responsible withdrawal does not preserve a partial route without inventing undiscovered facts');
}
const lossBeforeChoice = scenarioById.get('loss-before-informed-choice');
if (lossBeforeChoice?.sequence?.some((fragmentId) => fragmentId.endsWith('-choice'))
    || lossBeforeChoice?.expected?.objectiveDispositions?.['objective.chapter3.custody'] !== 'completedWithCost') {
    errors.push('loss before an informed player choice is incorrectly treated as player failure');
}

const playerSafeAuthoritySurfaces = [
    definition.playerText,
    ...(definition.objectives || []).map((objective) => objective.playerText),
    ...(definition.terminalDispositions || []).map((terminal) => terminal.playerText),
    ...(definition.transitions || []).map((transition) => transition.target),
];
if (/pale lantern|farwatch|holt|rourke|wayward sun/i.test(JSON.stringify(playerSafeAuthoritySurfaces))) {
    errors.push('player-facing Dead Letters authority surfaces contain unsupported controller attribution');
}
if (/progressModel|initialProgress|pressure\.|revelation\.|event-template|systemicResolution|maxObjectiveProgressPerTurn/i.test(JSON.stringify(definition))) {
    errors.push('Dead Letters V1 embeds legacy progress, pressure, or event-template machinery');
}

if (errors.length > 0) {
    for (const error of [...new Set(errors)].sort()) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
} else {
    console.log(
        `Validated Ashes V1 Dead Letters: ${definition.objectives.length} objectives, `
        + `${definition.evidencePolicies.length} evidence policies, `
        + `${definition.reportRoutes.length} aggregate reports, ${scenarios.scenarios.length} scenarios, `
        + 'direct and alternate clue routes, no synthetic clock.',
    );
}
