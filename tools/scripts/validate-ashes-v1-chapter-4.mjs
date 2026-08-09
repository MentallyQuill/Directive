import fs from 'node:fs';

import { lintMissionPackage } from '../../src/mission/v1/mission-package-linter.mjs';

const DEFINITION_PATH = 'packages/bundled/breckenridge/v1/chapter-4-the-colony-that-stayed.mission-v1.json';
const SCENARIOS_PATH = 'tests/fixtures/mission/v1/chapter-4-colony-that-stayed-scenarios.fixture.json';
const PACKAGE_PATH = 'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json';
const PREDECESSOR_PATH = 'packages/bundled/breckenridge/v1/chapter-3-dead-letters.mission-v1.json';
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
const scenarioExpectations = scenarios.scenarios.map((scenario) => scenario.expected);
const result = lintMissionPackage({
    definition,
    knownTransitionTargetIds: new Set(templates.map((template) => template.id)),
    scenarioExpectations,
    spoilerTerms: [
        'forged clearance',
        'two deaths',
        'compact security',
        'another active',
        'orison',
        'sigma-4',
        'pale lantern',
        'command doctrine',
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
    errors.push('Colony source identity does not match the exact Dead Letters transition target');
}
if (!quest || JSON.stringify(quest.missionGraph || null) !== '{}') {
    errors.push('legacy Colony source must exist with an empty mission graph before V1 replacement');
}
if (!templates.some((template) => template.id === definition.transitions?.[0]?.target?.id)) {
    errors.push(`Old Lessons transition target is not an authored package template: ${definition.transitions?.[0]?.target?.id}`);
}
if (scenarios.definitionId !== definition.id) errors.push('scenario fixture definitionId mismatch');
if ((definition.clocks || []).length !== 0) errors.push('Colony cannot synthesize a clock from political pressure');
if ((definition.objectives || []).length !== 3) errors.push('Colony must expose exactly three high-value required objectives');
if ((definition.reportRoutes || []).length !== 3) errors.push('Colony must use exactly three aggregate discoverable reports');
if ((definition.events || []).length !== 3
    || definition.events.some((event) => event.playerVisibility !== 'hidden')) {
    errors.push('internal Colony evidence milestones cannot become separate player-facing trackers');
}
if ((definition.outcomes || []).length !== 7
    || definition.outcomes.some((outcome) => outcome.playerVisibility !== 'hidden')) {
    errors.push('raw Colony decisions and results cannot duplicate aggregate player-facing dimensions');
}
if ((definition.outcomeDimensions || []).length !== 4) {
    errors.push('Colony must derive exactly four aggregate result dimensions');
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
    'policy.chapter4.process-decision',
    'policy.chapter4.solenn-decision',
    'policy.chapter4.interface-decision',
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

for (const policyId of [
    'policy.chapter4.history-evidence',
    'policy.chapter4.solenn-evidence',
    'policy.chapter4.access-evidence',
]) {
    const policy = definition.evidencePolicies.find((candidate) => candidate.id === policyId);
    const condition = JSON.stringify(policy?.when);
    if (!condition.includes('outcome.chapter4.process-decision') || !condition.includes('pending')) {
        errors.push(`${policyId} can create a revelation before the player establishes an investigation path`);
    }
}
for (const policyId of ['policy.chapter4.solenn-decision', 'policy.chapter4.interface-decision']) {
    const policy = definition.evidencePolicies.find((candidate) => candidate.id === policyId);
    const condition = JSON.stringify(policy?.when);
    for (const factId of [
        'fact.chapter4.survival-and-evacuation-record',
        'fact.chapter4.solenn-use-benefit-and-harm',
        'fact.chapter4.continuing-access-and-orison-route',
    ]) {
        if (!condition.includes(factId)) errors.push(`${policyId} permits a final choice before ${factId} is known`);
    }
}
for (const policyId of ['policy.chapter4.solenn-handoff-result', 'policy.chapter4.interface-handoff-result']) {
    const policy = definition.evidencePolicies.find((candidate) => candidate.id === policyId);
    if (!JSON.stringify(policy?.when).includes('withdraw')) {
        errors.push(`${policyId} can manufacture a handoff without responsible withdrawal`);
    }
}

const scenarioById = new Map(scenarios.scenarios.map((scenario) => [scenario.id, scenario]));
for (const scenarioId of [
    'shared-accountability',
    'lawful-local-resolution',
    'starfleet-seizure',
    'covert-truth-at-cost',
    'responsible-handoff',
    'process-collapse-before-final-choice',
    'flight-and-loss-after-informed-choice',
    'non-linear-evidence-order',
    'choice-alone-does-not-resolve',
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
const noFaultLoss = scenarioById.get('process-collapse-before-final-choice');
if (noFaultLoss?.sequence?.some((fragmentId) => fragmentId.endsWith('-choice') && !fragmentId.startsWith('process-'))
    || noFaultLoss?.expected?.objectiveDispositions?.['objective.chapter4.accountability'] !== 'completedWithCost') {
    errors.push('loss before a final informed choice is incorrectly treated as player failure');
}
const informedLoss = scenarioById.get('flight-and-loss-after-informed-choice');
if (informedLoss?.expected?.objectiveDispositions?.['objective.chapter4.accountability'] !== 'failedAfterInformedAction') {
    errors.push('loss after a final informed choice is not distinguished from no-fault loss');
}

const playerSafeAuthoritySurfaces = [
    definition.playerText,
    ...(definition.objectives || []).map((objective) => objective.playerText),
    ...(definition.terminalDispositions || []).map((terminal) => terminal.playerText),
    ...(definition.transitions || []).map((transition) => transition.target),
];
if (/sigma-4|pale lantern|command doctrine|holt|rourke|wayward sun/i.test(JSON.stringify(playerSafeAuthoritySurfaces))) {
    errors.push('player-facing Colony authority surfaces reveal unsupported later-campaign attribution');
}
if (/progressModel|initialProgress|pressure\.|revelation\.|event-template|systemicResolution|maxObjectiveProgressPerTurn/i.test(JSON.stringify(definition))) {
    errors.push('Colony V1 embeds legacy progress, pressure, or event-template machinery');
}

if (errors.length > 0) {
    for (const error of [...new Set(errors)].sort()) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
} else {
    console.log(
        `Validated Ashes V1 Colony: ${definition.objectives.length} objectives, `
        + `${definition.evidencePolicies.length} evidence policies, `
        + `${definition.reportRoutes.length} aggregate reports, ${scenarios.scenarios.length} scenarios, `
        + 'non-linear direct and alternate inquiry routes, no synthetic clock.',
    );
}
