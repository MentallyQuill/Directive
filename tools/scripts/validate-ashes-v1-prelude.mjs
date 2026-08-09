import fs from 'node:fs';

import { lintMissionPackage } from '../../src/mission/v1/mission-package-linter.mjs';

const DEFINITION_PATH = 'packages/bundled/breckenridge/v1/prelude-a-ship-underway.mission-v1.json';
const SCENARIOS_PATH = 'tests/fixtures/mission/v1/prelude-hesperus-scenarios.fixture.json';
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

if (errors.length > 0) {
    for (const error of [...new Set(errors)].sort()) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
} else {
    console.log(
        `Validated Ashes V1 Prelude: ${definition.objectives.length} objectives, `
        + `${definition.evidencePolicies.length} evidence policies, `
        + `${definition.reportRoutes.length} Duty Report routes, `
        + `${scenarios.scenarios.length} scenarios.`,
    );
}
