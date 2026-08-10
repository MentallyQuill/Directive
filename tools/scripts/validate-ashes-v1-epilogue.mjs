import fs from 'node:fs';

import { lintMissionPackage } from '../../src/mission/v1/mission-package-linter.mjs';

const DEFINITION_PATH = 'packages/bundled/breckenridge/v1/epilogue-the-terms-we-keep.mission-v1.json';
const SCENARIOS_PATH = 'tests/fixtures/mission/v1/epilogue-terms-we-keep-scenarios.fixture.json';
const PACKAGE_PATH = 'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json';
const PREDECESSOR_PATH = 'packages/bundled/breckenridge/v1/chapter-8-the-last-directive.mission-v1.json';
const CREW_PATH = 'packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json';
const SOURCE_ID = 'epilogue-the-terms-we-keep';
const COMPLETION_PHASE_ID = 'ashes-authored-conclusion';
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
    'chapter-8-the-last-directive',
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
    knownTransitionTargetIds: new Set([COMPLETION_PHASE_ID]),
    scenarioExpectations: scenarios.scenarios.map((scenario) => scenario.expected),
    spoilerTerms: [
        'dissolved with services',
        'sunset charter',
        'joint command',
        'criminal proceedings',
        'classified custody',
        'treated as suspects',
        'accountable peace',
        'contested aftermath',
    ],
});
const errors = [...result.errors];

if (definition.packageBinding?.packageId !== packageData.manifest?.id
    || definition.packageBinding?.packageVersion !== packageData.manifest?.version) {
    errors.push('epilogue package binding does not match the Ashes package');
}
if (definition.packageBinding?.sourceId !== SOURCE_ID
    || predecessor.transitions?.[0]?.target?.id !== SOURCE_ID) {
    errors.push('epilogue source identity does not match the exact Chapter 8 transition target');
}
const legacyQuest = templates.find((template) => template.id === SOURCE_ID);
if (!legacyQuest || JSON.stringify(legacyQuest.missionGraph || null) !== '{}') {
    errors.push('epilogue legacy quest must remain empty migration input');
}
if (definition.transitions?.length !== 1
    || definition.transitions[0]?.target?.kind !== 'phase'
    || definition.transitions[0]?.target?.id !== COMPLETION_PHASE_ID) {
    errors.push('epilogue must target the exact V1 authored-conclusion phase');
}
if (scenarios.definitionId !== definition.id) errors.push('scenario fixture definitionId mismatch');

if ((definition.entryCapabilities || []).length !== 3
    || definition.entryCapabilities?.[0]?.source?.requirements?.length !== 5) {
    errors.push('epilogue must declare one five-axis Nightfall record and exactly two conditional prior advantages');
}
if ((definition.facts || []).length !== 3
    || definition.facts.some((fact) => fact.initiallyTrue !== true || fact.visibility !== 'discoverable')) {
    errors.push('epilogue must use exactly three discoverable aggregate accounts');
}
if ((definition.events || []).length !== 3
    || definition.events.some((event) => event.playerVisibility !== 'hidden')) {
    errors.push('epilogue must use exactly three hidden aggregate report events');
}
if ((definition.outcomes || []).length !== 9
    || (definition.evidencePolicies || []).length !== 15
    || (definition.reportRoutes || []).length !== 3
    || (definition.objectives || []).length !== 4
    || (definition.outcomeDimensions || []).length !== 7
    || (definition.terminalDispositions || []).length !== 3) {
    errors.push('epilogue bounded settlement tracking surface changed unexpectedly');
}
if ((definition.clocks || []).length !== 0) errors.push('epilogue cannot invent a player-known deadline');
if (definition.objectives.some((objective) => objective.class !== 'required'
    || JSON.stringify(objective.supportedDispositions) !== '["completed"]')) {
    errors.push('epilogue responsibilities must record completion without moral grading dispositions');
}
if (/kieran|priya|bronn|rowan|miriam|imani/i.test(JSON.stringify(definition.objectives || []))) {
    errors.push('epilogue cannot create one visible objective per crew member');
}

const knownActorIds = new Set((crewData.officers || []).map((officer) => officer.id));
for (const route of definition.reportRoutes || []) {
    if (route.deliveryRequirement !== 'required' || !['routine', 'material'].includes(route.urgency)) {
        errors.push(`${route.id} has invalid non-countdown Duty Report custody`);
    }
    for (const actorId of [...(route.preferredActorIds || []), ...(route.fallbackActorIds || [])]) {
        if (!knownActorIds.has(actorId)) errors.push(`${route.id} names unknown crew actor: ${actorId}`);
    }
    if (!JSON.stringify(route.when).includes('factKnown')) {
        errors.push(`${route.id} is not one-shot against player knowledge`);
    }
}

for (const position of ['authority', 'accountability']) {
    const policy = definition.evidencePolicies.find((candidate) => candidate.id === `policy.epilogue.${position}-position`);
    if (JSON.stringify(policy?.sourceRoles) !== JSON.stringify(['user'])
        || policy?.claimType !== 'decisionRecorded'
        || !/own language|free-form|across several turns/i.test(policy?.interpretation?.guidance || '')) {
        errors.push(`epilogue ${position} position is not exclusively player-owned and prose-flexible`);
    }
}

for (const report of ['aftermath', 'settlement', 'command']) {
    const eventPolicy = definition.evidencePolicies.find((policy) => policy.id === `policy.epilogue.${report}-report`);
    const disclosurePolicy = definition.evidencePolicies.find((policy) => policy.id === `policy.epilogue.${report}-disclosed`);
    if (eventPolicy?.sourceRoles?.includes('user') || !JSON.stringify(eventPolicy?.when).includes('not')) {
        errors.push(`${report} aggregate report event is not world-owned and one-shot`);
    }
    if (!JSON.stringify(disclosurePolicy?.when).includes('factKnown')) {
        errors.push(`${report} aggregate disclosure is not one-shot`);
    }
}

for (const resultId of [
    'compact-status',
    'defense-control',
    'farwatch-accountability',
    'lantern-custody',
    'cardassian-participation',
    'public-narrative',
]) {
    const policy = definition.evidencePolicies.find((candidate) => candidate.id === `policy.epilogue.${resultId}`);
    const when = JSON.stringify(policy?.when);
    if (policy?.sourceRoles?.includes('user')
        || !when.includes('event.epilogue.settlement-record-complete')
        || !when.includes('pending')) {
        errors.push(`${resultId} can bypass one-shot world-owned settlement custody`);
    }
}
const commandResultPolicy = definition.evidencePolicies.find((policy) => policy.id === 'policy.epilogue.command-future');
if (commandResultPolicy?.sourceRoles?.includes('user')
    || !JSON.stringify(commandResultPolicy?.when).includes('event.epilogue.command-review-complete')
    || !JSON.stringify(commandResultPolicy?.when).includes('pending')) {
    errors.push('command future can bypass one-shot Whitaker review custody');
}

const priorities = Object.fromEntries(definition.terminalDispositions.map((item) => [item.id, item.priority]));
if (!(priorities.contestedAftermath > priorities.accountablePeace
    && priorities.accountablePeace > priorities.managedSettlement)) {
    errors.push('epilogue terminal priority can erase explicit fracture or accountable settlement');
}

if (errors.length > 0) {
    console.error([...new Set(errors)].join('\n'));
    process.exit(1);
}

console.log(`Validated Ashes V1 epilogue: ${definition.objectives.length} responsibilities, ${definition.reportRoutes.length} aggregate reports, ${definition.outcomeDimensions.length} settlement dimensions, ${scenarios.scenarios.length} scenarios, no synthetic clock.`);
