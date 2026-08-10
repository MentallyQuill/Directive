import fs from 'node:fs';

import { lintMissionPackage } from '../../src/mission/v1/mission-package-linter.mjs';

const DEFINITION_PATH = 'packages/bundled/breckenridge/v1/chapter-6-the-cost-of-knowing.mission-v1.json';
const SCENARIOS_PATH = 'tests/fixtures/mission/v1/chapter-6-cost-of-knowing-scenarios.fixture.json';
const PACKAGE_PATH = 'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json';
const PREDECESSOR_PATH = 'packages/bundled/breckenridge/v1/open-orders-2-what-survives.mission-v1.json';
const CREW_PATH = 'packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json';
const SOURCE_PATH = 'docs/source/Directive_Ashes_of_Peace_Campaign_v0.2.md';
const SUCCESSOR_ID = 'chapter-7-a-peace-of-their-own';

function readJson(path) {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function questTemplates(packageData) {
    const collections = Array.isArray(packageData.questTemplates)
        ? packageData.questTemplates
        : [packageData.questTemplates];
    return collections.flatMap((collection) => collection?.templates || []);
}

function exactSet(actual, expected) {
    return JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
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
    knownTransitionTargetIds: new Set(templates.map((template) => template.id)),
    scenarioExpectations,
    spoilerTerms: [
        'eighty-three days',
        'deliberately left',
        'current starfleet credentials',
        'without warrants',
        'false recall',
        'nightfall model',
        'portable interface',
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
    errors.push('Chapter 6 source identity does not match the exact Open Orders II transition target');
}
if (!quest || JSON.stringify(quest.missionGraph || null) !== '{}') {
    errors.push('legacy Chapter 6 source must exist with an empty mission graph before V1 replacement');
}
if (definition.transitions?.[0]?.target?.id !== SUCCESSOR_ID
    || !source.includes('## 20. Chapter 7: A Peace of Their Own')) {
    errors.push('Chapter 6 does not target the exact source-authored Chapter 7 quest');
}
if (scenarios.definitionId !== definition.id) errors.push('scenario fixture definitionId mismatch');

if ((definition.clocks || []).length !== 0) {
    errors.push('Chapter 6 cannot borrow Chapter 7\'s thirty-six-hour clock or synthesize one from crisis pressure');
}
if ((definition.objectives || []).length !== 3
    || definition.objectives.some((objective) => objective.class !== 'required')) {
    errors.push('Chapter 6 must expose exactly three high-value required responsibilities');
}
if ((definition.reportRoutes || []).length !== 2) {
    errors.push('the eight source revelations must remain two aggregate Duty Reports');
}
if ((definition.facts || []).length !== 3
    || definition.facts.filter((fact) => fact.visibility === 'known').length !== 1
    || definition.facts.filter((fact) => fact.visibility === 'discoverable').length !== 2) {
    errors.push('Chapter 6 must use one known opening fact and two discoverable aggregate facts');
}
if ((definition.events || []).length !== 1
    || definition.events.some((event) => event.playerVisibility !== 'hidden')) {
    errors.push('the false-emergency milestone must remain one hidden event, not player-facing tracker spam');
}
if ((definition.outcomes || []).length !== 9
    || definition.outcomes.some((outcome) => outcome.playerVisibility !== 'hidden')) {
    errors.push('raw Chapter 6 choices, routes, and results cannot duplicate aggregate player-facing dimensions');
}
if ((definition.outcomeDimensions || []).length !== 4) {
    errors.push('Chapter 6 must derive exactly four aggregate persistent dimensions');
}
if ((definition.terminalDispositions || []).length !== 6) {
    errors.push('Chapter 6 must define the six approved failure-forward terminal dispositions');
}

const initiallyKnownFacts = (definition.facts || [])
    .filter((fact) => fact.initiallyTrue === true && fact.visibility === 'known');
if (initiallyKnownFacts.length !== 1
    || initiallyKnownFacts[0]?.id !== 'fact.chapter6.classified-confrontation') {
    errors.push('only the classified confrontation may be known at mission opening');
}

const knownActorIds = new Set((crewData.officers || []).map((officer) => officer.id));
for (const route of definition.reportRoutes || []) {
    for (const actorId of [...(route.preferredActorIds || []), ...(route.fallbackActorIds || [])]) {
        if (!knownActorIds.has(actorId)) errors.push(`${route.id} names unknown crew actor: ${actorId}`);
    }
    if (route.deliveryRequirement !== 'required') {
        errors.push(`${route.id} can bypass accepted Duty Report custody`);
    }
    const routeWhen = JSON.stringify(route.when);
    if (!routeWhen.includes('outcome.chapter6.') || !routeWhen.includes('factKnown')) {
        errors.push(`${route.id} is not gated by completed route evidence and undisclosed aggregate truth`);
    }
}

const choicePolicyIds = [
    'policy.chapter6.rourke-boundary',
    'policy.chapter6.network-response',
    'policy.chapter6.evidence-disposition',
];
for (const policyId of choicePolicyIds) {
    const policy = definition.evidencePolicies.find((candidate) => candidate.id === policyId);
    if (policy?.claimType !== 'decisionRecorded'
        || JSON.stringify(policy?.sourceRoles) !== JSON.stringify(['user'])) {
        errors.push(`${policyId} is not exclusively player-owned`);
    }
}
for (const policy of definition.evidencePolicies || []) {
    if ((policy.claimType === 'outcomeObserved' || policy.claimType === 'eventOccurred')
        && policy.sourceRoles?.includes('user')) {
        errors.push(`${policy.id} lets player prose self-certify a world result`);
    }
}
const evidenceDecision = definition.evidencePolicies
    .find((policy) => policy.id === 'policy.chapter6.evidence-disposition');
if (!JSON.stringify(evidenceDecision?.when).includes('fact.chapter6.farwatch-operational-account')) {
    errors.push('evidence/disclosure disposition can lock before the player knows the Farwatch account');
}
const networkDecision = definition.evidencePolicies
    .find((policy) => policy.id === 'policy.chapter6.network-response');
if (!JSON.stringify(networkDecision?.when).includes('event.chapter6.false-emergency-active')) {
    errors.push('network response can lock before the false-emergency crisis is active');
}

const routeRequirements = new Map([
    ['policy.chapter6.farwatch-account-route', ['lacunaArchive', 'corroboratedTestimony', 'externalReview']],
    ['policy.chapter6.nightfall-risk-route', ['lacunaTelemetry', 'crossSystemCorroboration', 'operationalInference']],
]);
for (const [policyId, expectedValues] of routeRequirements) {
    const policy = definition.evidencePolicies.find((candidate) => candidate.id === policyId);
    const actualValues = (policy?.interpretation?.values || []).map((value) => value.value);
    if (!exactSet(actualValues, expectedValues)) {
        errors.push(`${policyId} loses a direct or alternate truth route`);
    }
}
for (const [policyId, targetId] of [
    ['policy.chapter6.farwatch-account-disclosed', 'outcome.chapter6.farwatch-account-route'],
    ['policy.chapter6.nightfall-risk-disclosed', 'outcome.chapter6.nightfall-risk-route'],
]) {
    const policy = definition.evidencePolicies.find((candidate) => candidate.id === policyId);
    if (policy?.claimType !== 'factDisclosed'
        || !JSON.stringify(policy?.when).includes(targetId)) {
        errors.push(`${policyId} can disclose aggregate truth without a completed evidentiary route`);
    }
}

const closeWhenText = JSON.stringify(definition.closeWhen);
for (const objectiveId of [
    'objective.chapter6.command-network',
    'objective.chapter6.farwatch-truth',
    'objective.chapter6.evidence-authority',
]) {
    if (!closeWhenText.includes(objectiveId)) errors.push(`${objectiveId} is absent from closeWhen`);
}
if (/outcome\.chapter6|fact\.chapter6|event\.chapter6/.test(closeWhenText)) {
    errors.push('raw facts, events, or outcomes bypass objective-based Chapter 6 closure');
}

const terminalsById = new Map((definition.terminalDispositions || []).map((terminal) => [terminal.id, terminal]));
for (const [terminalId, priority] of [
    ['operationalRuptureForward', 600],
    ['evidenceLostForward', 500],
    ['publicRupture', 400],
    ['controlledSecrecy', 300],
    ['accountablePreservation', 200],
    ['responsibleHandoff', 100],
]) {
    if (terminalsById.get(terminalId)?.priority !== priority) {
        errors.push(`${terminalId} priority no longer preserves the approved failure-forward ordering`);
    }
}
if (!JSON.stringify(terminalsById.get('responsibleHandoff')?.when).includes('objectiveDisposition')) {
    errors.push('responsible handoff is not an eligible closeWhen fallback before terminal selection');
}

const scenarioById = new Map(scenarios.scenarios.map((scenario) => [scenario.id, scenario]));
for (const scenarioId of [
    'accountable-preservation',
    'controlled-secrecy',
    'public-rupture',
    'evidence-lost-before-knowledge',
    'evidence-lost-after-informed-choice',
    'operational-rupture',
    'responsible-mixed-handoff',
    'non-linear-world-results-before-reports',
    'choices-alone-do-not-close',
    'evidence-choice-before-account-report',
    'crisis-alone-does-not-settle-network',
    'network-result-before-crisis',
    'premature-account-report',
    'premature-nightfall-report',
    'assistant-cannot-set-rourke-boundary',
    'user-cannot-self-certify-world-result',
    'stale-proposal',
    'wrong-swipe-proposal',
    'hallucinated-policy-proposal',
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
const earlyLoss = scenarioById.get('evidence-lost-before-knowledge');
if (earlyLoss?.sequence?.includes('evidence-choice')
    || earlyLoss?.expected?.objectiveDispositions?.['objective.chapter6.evidence-authority'] !== 'completedWithCost') {
    errors.push('evidence loss before player knowledge is incorrectly treated as informed player failure');
}
const choicesOnly = scenarioById.get('choices-alone-do-not-close');
if (choicesOnly?.expected?.status !== 'active' || (choicesOnly?.expected?.transitionTargetId ?? null) !== null) {
    errors.push('player choices alone can close Chapter 6');
}
const nonLinear = scenarioById.get('non-linear-world-results-before-reports');
if (nonLinear?.expected?.status !== 'terminal'
    || nonLinear?.expected?.terminalDisposition !== 'accountablePreservation') {
    errors.push('fixtures do not prove a valid non-linear route to closure');
}
for (const scenario of scenarios.scenarios) {
    if (scenario.expected?.status === 'terminal'
        && scenario.expected?.transitionTargetId !== SUCCESSOR_ID) {
        errors.push(`${scenario.id} does not transition to Chapter 7`);
    }
}

const initialPlayerSafeSurfaces = [
    definition.playerText,
    ...initiallyKnownFacts.map((fact) => fact.playerText),
    ...(definition.objectives || []).map((objective) => objective.playerText),
];
if (/eighty-three days|deliberately (?:kept|left)|current (?:starfleet )?(?:challenge )?codes|without (?:recognized )?(?:local )?(?:authority|warrants)|rourke warned|false (?:emergency|recall)|nightfall|regional defense and evacuation|portable interface/i.test(JSON.stringify(initialPlayerSafeSurfaces))) {
    errors.push('initial player-safe Chapter 6 surfaces reveal director-only truth or Chapter 7 information');
}
const transitionText = JSON.stringify(definition.transitions?.[0]);
if (!/annex six/i.test(transitionText) || !/kessler/i.test(transitionText) || !/task group/i.test(transitionText)) {
    errors.push('Chapter 7 transition loses a required source-authored setup beat');
}
if (/portable (?:pale lantern )?interface|preparing an assault/i.test(JSON.stringify([
    definition.transitions?.[0]?.target?.playerSafeSetup,
    definition.transitions?.[0]?.mustNarrate,
]))) {
    errors.push('Chapter 6 reveals Chapter 7 director-only truth');
}
if (!/genuine|real intelligence|weapons/i.test(JSON.stringify([
    definition.facts,
    definition.reportRoutes,
    definition.transitions?.[0]?.mustNarrate,
]))) {
    errors.push('Chapter 6 caricatures Farwatch by dropping its genuine intelligence value');
}
if (/"(?:commandBearing|inspiration|resolve)"\s*:|progressModel|initialProgress|pressure\.|revelation\.|event-template|systemicResolution|maxObjectiveProgressPerTurn/i.test(JSON.stringify(definition))) {
    errors.push('Chapter 6 embeds deferred rewards or legacy progress/revelation machinery');
}

if (errors.length > 0) {
    for (const error of [...new Set(errors)].sort()) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
} else {
    console.log(
        `Validated Ashes V1 Chapter 6: ${definition.objectives.length} objectives, `
        + `${definition.evidencePolicies.length} evidence policies, `
        + `${definition.reportRoutes.length} aggregate reports, ${scenarios.scenarios.length} scenarios, `
        + 'alternate truth routes, early-loss fairness, spoiler-safe Chapter 7 handoff, no synthetic clock.',
    );
}
