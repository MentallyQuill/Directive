import fs from 'node:fs';

import { lintMissionPackage } from '../../src/mission/v1/mission-package-linter.mjs';

const DEFINITION_PATH = 'packages/bundled/breckenridge/v1/chapter-8-the-last-directive.mission-v1.json';
const SCENARIOS_PATH = 'tests/fixtures/mission/v1/chapter-8-last-directive-scenarios.fixture.json';
const PACKAGE_PATH = 'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json';
const PREDECESSOR_PATH = 'packages/bundled/breckenridge/v1/open-orders-3-before-the-lamps-go-out.mission-v1.json';
const CREW_PATH = 'packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json';
const SOURCE_ID = 'chapter-8-the-last-directive';
const SUCCESSOR_ID = 'epilogue-the-terms-we-keep';
const priorDefinitionPaths = [
    'prelude-a-ship-underway',
    'chapter-1-the-empty-convoy',
    'chapter-2-false-colors',
    'open-orders-1-work-worth-doing',
    'chapter-3-dead-letters',
    'chapter-4-the-colony-that-stayed',
    'chapter-5-old-lessons',
    'open-orders-2-what-survives',
    'chapter-6-the-cost-of-knowing',
    'chapter-7-a-peace-of-their-own',
    'open-orders-3-before-the-lamps-go-out',
].map((slug) => `packages/bundled/breckenridge/v1/${slug}.mission-v1.json`);

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
const knownDefinitions = [...priorDefinitionPaths.map(readJson), definition];
const result = lintMissionPackage({
    definition,
    knownDefinitions,
    knownTransitionTargetIds: new Set(templates.map((template) => template.id)),
    scenarioExpectations: scenarios.scenarios.map((scenario) => scenario.expected),
    spoilerTerms: [
        'three active paths',
        'three-node quorum',
        'all known nodes',
        'lantern extinguished',
        'ashes outcome',
        'epilogue settlement',
        'hidden objective',
        'unknown objective',
    ],
});
const errors = [...result.errors];

if (definition.packageBinding?.packageId !== packageData.manifest?.id
    || definition.packageBinding?.packageVersion !== packageData.manifest?.version) {
    errors.push('Chapter 8 package binding does not match the Ashes package');
}
if (definition.packageBinding?.sourceId !== SOURCE_ID
    || predecessor.transitions?.[0]?.target?.id !== SOURCE_ID) {
    errors.push('Chapter 8 source identity does not match the exact Open Orders III transition target');
}
const legacyQuest = templates.find((template) => template.id === SOURCE_ID);
if (!legacyQuest || JSON.stringify(legacyQuest.missionGraph || null) !== '{}') {
    errors.push('Chapter 8 legacy quest must remain empty migration input');
}
if (definition.transitions?.[0]?.target?.id !== SUCCESSOR_ID
    || !templates.some((template) => template.id === SUCCESSOR_ID)) {
    errors.push('Chapter 8 does not target the exact package epilogue');
}
if (scenarios.definitionId !== definition.id) errors.push('scenario fixture definitionId mismatch');

if ((definition.entryCapabilities || []).length !== 14) errors.push('Chapter 8 must declare exactly fourteen proven entry capabilities');
if (/Cardassian Logistics Index/i.test(JSON.stringify(definition.entryCapabilities || []))) {
    errors.push('Chapter 8 cannot invent the source-orphaned Cardassian Logistics Index');
}
if ((definition.facts || []).length !== 5
    || definition.facts.some((fact) => fact.initiallyTrue !== true || fact.visibility !== 'discoverable')) {
    errors.push('Chapter 8 must use exactly five discoverable aggregate front accounts');
}
if ((definition.events || []).length !== 5
    || definition.events.some((event) => event.playerVisibility !== 'hidden')) {
    errors.push('Chapter 8 must use exactly five hidden aggregate report events');
}
if ((definition.outcomes || []).length !== 6
    || (definition.evidencePolicies || []).length !== 16
    || (definition.reportRoutes || []).length !== 5
    || (definition.objectives || []).length !== 5
    || (definition.outcomeDimensions || []).length !== 5
    || (definition.terminalDispositions || []).length !== 5) {
    errors.push('Chapter 8 bounded five-front tracking surface changed unexpectedly');
}
if ((definition.clocks || []).length !== 0) errors.push('Chapter 8 cannot invent a player-known deadline');
if (definition.objectives.some((objective) => objective.class !== 'required')) {
    errors.push('Chapter 8 fronts must remain parallel required responsibilities with failure-forward terminal rules');
}

const knownActorIds = new Set((crewData.officers || []).map((officer) => officer.id));
for (const route of definition.reportRoutes || []) {
    if (route.deliveryRequirement !== 'required' || route.urgency !== 'urgent') {
        errors.push(`${route.id} can bypass urgent Duty Report custody`);
    }
    for (const actorId of [...(route.preferredActorIds || []), ...(route.fallbackActorIds || [])]) {
        if (!knownActorIds.has(actorId)) errors.push(`${route.id} names unknown crew actor: ${actorId}`);
    }
    if (!JSON.stringify(route.when).includes('-report-complete')) {
        errors.push(`${route.id} is not gated by one completed aggregate front event`);
    }
}

const planPolicy = definition.evidencePolicies.find((policy) => policy.id === 'policy.chapter8.command-plan');
if (JSON.stringify(planPolicy?.sourceRoles) !== JSON.stringify(['user'])
    || planPolicy?.claimType !== 'decisionRecorded'
    || !/own language|free-form/i.test(planPolicy?.interpretation?.guidance || '')) {
    errors.push('Chapter 8 executable command plan is not exclusively player-owned and prose-flexible');
}
for (const front of ['command', 'mesh', 'weapons', 'core', 'civilians']) {
    const eventId = `event.chapter8.${front}-report-complete`;
    const factId = `fact.chapter8.${front}-account`;
    const resultPolicy = definition.evidencePolicies.find((policy) => policy.id === `policy.chapter8.${front}-result`);
    const disclosurePolicy = definition.evidencePolicies.find((policy) => policy.id === `policy.chapter8.${front}-disclosed`);
    if (resultPolicy?.sourceRoles?.includes('user') || !JSON.stringify(resultPolicy?.when).includes(eventId)) {
        errors.push(`${front} result can bypass world-owned aggregate report completion`);
    }
    if (!JSON.stringify(disclosurePolicy?.when).includes(eventId)
        || !definition.reportRoutes.some((route) => route.factId === factId)) {
        errors.push(`${front} result lacks one bounded player-known Duty Report route`);
    }
}

const priorities = Object.fromEntries(definition.terminalDispositions.map((item) => [item.id, item.priority]));
if (!(priorities.ashes > priorities.fracturedSurvival
    && priorities.fracturedSurvival > priorities.imposedOrder
    && priorities.imposedOrder > priorities.peaceAtCost
    && priorities.peaceAtCost > priorities.lanternExtinguished)) {
    errors.push('Chapter 8 terminal priority can erase severe loss, fracture, coercion, or material cost');
}

if (errors.length > 0) {
    console.error(errors.join('\n'));
    process.exit(1);
}

console.log(`Validated Ashes V1 Chapter 8: ${definition.objectives.length} parallel fronts, ${definition.reportRoutes.length} aggregate reports, ${definition.entryCapabilities.length} proven entry capabilities, ${scenarios.scenarios.length} scenarios, no synthetic clock.`);
