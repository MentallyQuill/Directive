import fs from 'node:fs';

import { lintMissionPackage } from '../../src/mission/v1/mission-package-linter.mjs';

const DEFINITION_PATH = 'packages/bundled/breckenridge/v1/chapter-1-the-empty-convoy.mission-v1.json';
const SCENARIOS_PATH = 'tests/fixtures/mission/v1/chapter-1-empty-convoy-scenarios.fixture.json';
const PACKAGE_PATH = 'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json';

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
const templates = questTemplates(packageData);
const knownTransitionTargetIds = new Set(templates.map((template) => template.id));
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
if (scenarios.definitionId !== definition.id) {
    errors.push(`scenario fixture definitionId does not match: ${scenarios.definitionId}`);
}
if ((definition.clocks || []).length !== 0) {
    errors.push('Chapter 1 cannot add an urgency clock without an authored player-known deadline');
}
if ((definition.reportRoutes || []).length > 3) {
    errors.push('Chapter 1 report-route count exceeds the approved aggregate anti-spam boundary');
}
for (const objective of definition.objectives || []) {
    if (objective.class === 'conditional' && objective.activatedAs === 'required') {
        const matchingRoute = (definition.reportRoutes || []).find((route) => (
            route.factId === objective.activationRoute?.factId
            && route.deliveryRequirement === 'required'
        ));
        if (!matchingRoute) {
            errors.push(`${objective.id} lacks its mandatory required report route`);
        }
    }
}
if (JSON.stringify(definition.closeWhen).includes('objective.chapter1.shared-record')) {
    errors.push('optional shared record participates in mission closure');
}

if (errors.length > 0) {
    for (const error of [...new Set(errors)].sort()) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
} else {
    console.log(
        `Validated Ashes V1 Chapter 1: ${definition.objectives.length} objectives, `
        + `${definition.evidencePolicies.length} evidence policies, `
        + `${definition.reportRoutes.length} aggregate Duty Report routes, `
        + `${scenarios.scenarios.length} scenarios, no synthetic clock.`,
    );
}
