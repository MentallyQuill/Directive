import fs from 'node:fs';

import { lintMissionPackage } from '../../src/mission/v1/mission-package-linter.mjs';

const DEFINITION_PATH = 'packages/bundled/breckenridge/v1/chapter-5-old-lessons.mission-v1.json';
const SCENARIOS_PATH = 'tests/fixtures/mission/v1/chapter-5-old-lessons-scenarios.fixture.json';
const PACKAGE_PATH = 'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json';
const PREDECESSOR_PATH = 'packages/bundled/breckenridge/v1/chapter-4-the-colony-that-stayed.mission-v1.json';
const CREW_PATH = 'packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json';
const SOURCE_PATH = 'docs/source/Directive_Ashes_of_Peace_Campaign_v0.2.md';
const SUCCESSOR_ID = 'open-orders-2-what-survives';

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
const source = fs.readFileSync(SOURCE_PATH, 'utf8');
const templates = questTemplates(packageData);
const quest = templates.find((template) => template.id === definition.packageBinding?.sourceId);
const scenarioExpectations = scenarios.scenarios.map((scenario) => scenario.expected);
const result = lintMissionPackage({
    definition,
    knownTransitionTargetIds: new Set([...templates.map((template) => template.id), SUCCESSOR_ID]),
    scenarioExpectations,
    spoilerTerms: [
        'sigma-4 and its bridge',
        'actual technical objective',
        'predicts familiar starfleet',
        "holt's local cell",
        'portable interface',
        'authentication core',
        'maintenance drone',
        'pale lantern',
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
    errors.push('Old Lessons source identity does not match the exact Colony transition target');
}
if (!quest || JSON.stringify(quest.missionGraph || null) !== '{}') {
    errors.push('legacy Old Lessons source must exist with an empty mission graph before V1 replacement');
}
if (definition.transitions?.[0]?.target?.id !== SUCCESSOR_ID
    || !source.includes('## 18. Open Orders II: What Survives')) {
    errors.push('Old Lessons does not target the exact source-authored V1-only Open Orders II interval');
}
if (templates.some((template) => template.id === SUCCESSOR_ID)) {
    errors.push('Old Lessons must not add a duplicate legacy quest for the V1-only Open Orders II interval');
}
if (scenarios.definitionId !== definition.id) errors.push('scenario fixture definitionId mismatch');
if ((definition.clocks || []).length !== 0) errors.push('Old Lessons cannot synthesize a clock from tactical pressure');
if ((definition.objectives || []).length !== 3) errors.push('Old Lessons must expose exactly three high-value required objectives');
if ((definition.reportRoutes || []).length !== 3) errors.push('Old Lessons must use exactly three aggregate discoverable reports');
if ((definition.events || []).length !== 3
    || definition.events.some((event) => event.playerVisibility !== 'hidden')) {
    errors.push('internal Old Lessons evidence milestones cannot become separate player-facing trackers');
}
if ((definition.outcomes || []).length !== 7
    || definition.outcomes.some((outcome) => outcome.playerVisibility !== 'hidden')) {
    errors.push('raw Old Lessons decisions and results cannot duplicate aggregate player-facing dimensions');
}
if ((definition.outcomeDimensions || []).length !== 4) {
    errors.push('Old Lessons must derive exactly four aggregate result dimensions');
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

for (const policyId of ['policy.chapter5.sigma-decision', 'policy.chapter5.command-posture']) {
    const policy = definition.evidencePolicies.find((candidate) => candidate.id === policyId);
    if (policy?.claimType !== 'decisionRecorded'
        || JSON.stringify(policy?.sourceRoles) !== JSON.stringify(['user'])) {
        errors.push(`${policyId} is not exclusively player-owned`);
    }
}
for (const policy of definition.evidencePolicies || []) {
    if (policy.claimType === 'outcomeObserved' && policy.sourceRoles?.includes('user')) {
        errors.push(`${policy.id} lets player prose prove an observed tactical result`);
    }
}
const sigmaDecision = definition.evidencePolicies.find((policy) => policy.id === 'policy.chapter5.sigma-decision');
if (!JSON.stringify(sigmaDecision?.when).includes('fact.chapter5.sigma-target-and-doctrine-model')) {
    errors.push('Sigma disposition can be recorded before the player knows its role');
}
if (JSON.stringify(definition.closeWhen).includes('outcome.chapter5.command-posture')) {
    errors.push('optional Bronn command posture can hang mission closure');
}

const scenarioById = new Map(scenarios.scenarios.map((scenario) => [scenario.id, scenario]));
for (const scenarioId of [
    'multi-front-success',
    'lives-saved-core-lost-before-knowledge',
    'core-saved-at-cost',
    'cascade-forward',
    'partial-containment',
    'responsible-handoff',
    'informed-destruction-without-record',
    'non-linear-front-order-no-command-posture',
    'clean-success-dismissive-posture',
    'choices-alone-do-not-resolve',
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
const noFaultLoss = scenarioById.get('lives-saved-core-lost-before-knowledge');
if (noFaultLoss?.sequence?.some((fragmentId) => fragmentId.startsWith('sigma-') && fragmentId.endsWith('-choice'))
    || noFaultLoss?.expected?.objectiveDispositions?.['objective.chapter5.operation'] !== 'completedWithCost') {
    errors.push('core loss before target knowledge is incorrectly treated as player failure');
}
const informedDestruction = scenarioById.get('informed-destruction-without-record');
if (informedDestruction?.expected?.objectiveDispositions?.['objective.chapter5.operation'] !== 'failedAfterInformedAction') {
    errors.push('explicit informed destruction without a record is not distinguished from no-fault loss');
}
const noCommand = scenarioById.get('non-linear-front-order-no-command-posture');
if (noCommand?.expected?.status !== 'terminal'
    || noCommand?.expected?.outcomeDimensions?.['dimension.chapter5.command'] !== 'pending') {
    errors.push('missing Bronn posture can block tactical closure');
}

const playerSafeAuthoritySurfaces = [
    definition.playerText,
    ...(definition.objectives || []).map((objective) => objective.playerText),
];
if (/sigma-?4.*(?:target|objective)|pale lantern|models? (?:starfleet )?doctrine|holt(?:'s)? cell|portable interface|authentication core/i.test(JSON.stringify(playerSafeAuthoritySurfaces))) {
    errors.push('initial or always-visible Old Lessons authority surfaces reveal the operation');
}
if (/progressModel|initialProgress|pressure\.|revelation\.|event-template|systemicResolution|maxObjectiveProgressPerTurn/i.test(JSON.stringify(definition))) {
    errors.push('Old Lessons V1 embeds legacy progress, pressure, or event-template machinery');
}

if (errors.length > 0) {
    for (const error of [...new Set(errors)].sort()) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
} else {
    console.log(
        `Validated Ashes V1 Old Lessons: ${definition.objectives.length} objectives, `
        + `${definition.evidencePolicies.length} evidence policies, `
        + `${definition.reportRoutes.length} aggregate reports, ${scenarios.scenarios.length} scenarios, `
        + 'multi-front failure-forward routes, optional command posture, no synthetic clock.',
    );
}
