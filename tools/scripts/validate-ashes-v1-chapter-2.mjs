import fs from 'node:fs';

import { lintMissionPackage } from '../../src/mission/v1/mission-package-linter.mjs';

const DEFINITION_PATH = 'packages/bundled/breckenridge/v1/chapter-2-false-colors.mission-v1.json';
const SCENARIOS_PATH = 'tests/fixtures/mission/v1/chapter-2-false-colors-scenarios.fixture.json';
const PACKAGE_PATH = 'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json';
const LEGACY_GRAPH_PATH = 'packages/bundled/breckenridge/chapter-2-false-colors.mission-graph.json';
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
const legacyGraph = readJson(LEGACY_GRAPH_PATH);
const crewData = readJson(CREW_PATH);
const templates = questTemplates(packageData);
const knownTransitionTargetIds = new Set(templates.map((template) => template.id));
knownTransitionTargetIds.add(legacyGraph.missionFrame?.transitionToMissionId);
const scenarioExpectations = (scenarios.scenarios || []).map((scenario) => scenario.expected);
const result = lintMissionPackage({
    definition,
    knownTransitionTargetIds,
    scenarioExpectations,
});
const errors = [...result.errors];

if (definition.packageBinding?.packageId !== packageData.manifest?.id) {
    errors.push(`package binding id does not match ${PACKAGE_PATH}`);
}
if (definition.packageBinding?.packageVersion !== packageData.manifest?.version) {
    errors.push(`package binding version does not match ${PACKAGE_PATH}`);
}
if (!templates.some((template) => template.id === definition.packageBinding?.sourceId)) {
    errors.push(`package binding source does not exist: ${definition.packageBinding?.sourceId}`);
}
if (definition.transitions?.[0]?.target?.id !== legacyGraph.missionFrame?.transitionToMissionId) {
    errors.push(`transition target does not match authored migration source ${LEGACY_GRAPH_PATH}`);
}
if (scenarios.definitionId !== definition.id) {
    errors.push(`scenario fixture definitionId does not match: ${scenarios.definitionId}`);
}
if ((definition.clocks || []).length !== 0) {
    errors.push('Chapter 2 cannot add an urgency clock without an authored player-known deadline');
}
if ((definition.reportRoutes || []).length !== 3) {
    errors.push('Chapter 2 must use exactly three aggregate Duty Report routes');
}
const knownActorIds = new Set((crewData.officers || []).map((officer) => officer.id));
for (const route of definition.reportRoutes || []) {
    for (const actorId of [...(route.preferredActorIds || []), ...(route.fallbackActorIds || [])]) {
        if (!knownActorIds.has(actorId)) errors.push(`${route.id} names unknown crew actor: ${actorId}`);
    }
}

for (const objective of definition.objectives || []) {
    if (objective.class === 'conditional' && objective.activatedAs === 'required') {
        const matchingRoute = (definition.reportRoutes || []).find((route) => (
            route.factId === objective.activationRoute?.factId
            && route.deliveryRequirement === 'required'
        ));
        if (!matchingRoute) errors.push(`${objective.id} lacks its mandatory required report route`);
    }
}

if (JSON.stringify(definition.closeWhen).includes('objective.chapter2.joint-framework')) {
    errors.push('optional joint framework participates in mission closure');
}

const expectedTerminalDispositions = new Set(
    scenarioExpectations.map((expected) => expected.terminalDisposition).filter(Boolean),
);
for (const terminal of definition.terminalDispositions || []) {
    if (!expectedTerminalDispositions.has(terminal.id)) {
        errors.push(`terminal disposition lacks a scenario: ${terminal.id}`);
    }
}

const reachableObjectiveDispositions = new Map();
for (const expected of scenarioExpectations) {
    for (const [objectiveId, disposition] of Object.entries(expected.objectiveDispositions || {})) {
        if (!disposition) continue;
        if (!reachableObjectiveDispositions.has(objectiveId)) reachableObjectiveDispositions.set(objectiveId, new Set());
        reachableObjectiveDispositions.get(objectiveId).add(disposition);
    }
}
for (const objective of definition.objectives || []) {
    if (objective.activatedAs === 'optional') continue;
    const reached = reachableObjectiveDispositions.get(objective.id) || new Set();
    for (const disposition of objective.supportedDispositions || []) {
        if (!reached.has(disposition)) errors.push(`${objective.id} disposition lacks a scenario: ${disposition}`);
    }
}

const medicalPolicy = (definition.evidencePolicies || []).find((policy) => policy.id === 'policy.chapter2.medical-result');
if (JSON.stringify(medicalPolicy?.when) !== JSON.stringify({ factKnown: 'fact.chapter2.false-colors-crisis' })) {
    errors.push('medical outcome is improperly gated by testimony, access, evidence, or political cooperation');
}

const initialScenario = (scenarios.scenarios || []).find((scenario) => scenario.id === 'undiscovered-content-does-not-close');
if (initialScenario?.sequence?.[0] !== 'medical-stabilized' || initialScenario.expected?.acceptedClaimCount !== 1) {
    errors.push('fixtures do not prove medical success independent of later political and evidence gates');
}

const nonLinear = (scenarios.scenarios || []).find((scenario) => scenario.id === 'non-linear-core-order');
if (!nonLinear || nonLinear.sequence?.[0] !== 'independent-evidence' || nonLinear.sequence?.[2] !== 'access-report') {
    errors.push('fixtures do not prove a causally valid order outside the legacy phase sequence');
}

const playerSafeSurfaces = [
    definition.playerText,
    ...(definition.facts || []).map((fact) => fact.playerText),
    ...(definition.reportRoutes || []).map((route) => route.playerText),
    ...(definition.objectives || []).map((objective) => objective.playerText),
    ...(definition.terminalDispositions || []).map((terminal) => terminal.playerText),
];
if (/pale lantern|holt's cell|holt staged|remote-controlled cargo tug/i.test(JSON.stringify(playerSafeSurfaces))) {
    errors.push('player-safe Chapter 2 surfaces reveal director-only attribution');
}

if (errors.length > 0) {
    for (const error of [...new Set(errors)].sort()) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
} else {
    console.log(
        `Validated Ashes V1 Chapter 2: ${definition.objectives.length} objectives, `
        + `${definition.evidencePolicies.length} evidence policies, `
        + `${definition.reportRoutes.length} aggregate Duty Report routes, `
        + `${scenarios.scenarios.length} scenarios, no synthetic clock.`,
    );
}
