import fs from 'node:fs';

import { lintMissionPackage } from '../../src/mission/v1/mission-package-linter.mjs';

const DEFINITION_PATH = 'packages/bundled/breckenridge/v1/open-orders-3-before-the-lamps-go-out.mission-v1.json';
const SCENARIOS_PATH = 'tests/fixtures/mission/v1/open-orders-3-scenarios.fixture.json';
const PACKAGE_PATH = 'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json';
const PREDECESSOR_PATH = 'packages/bundled/breckenridge/v1/chapter-7-a-peace-of-their-own.mission-v1.json';
const CREW_PATH = 'packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json';
const SOURCE_ID = 'open-orders-3-before-the-lamps-go-out';
const SUCCESSOR_ID = 'chapter-8-the-last-directive';
const ASSIGNMENTS = ['name', 'signal', 'signatures'];

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
const scenarioExpectations = scenarios.scenarios.map((scenario) => scenario.expected);
const result = lintMissionPackage({
    definition,
    knownTransitionTargetIds: new Set(templates.map((template) => template.id)),
    scenarioExpectations,
    spoilerTerms: [
        'thirty-second',
        'multiple regional alerts',
        'mutually exclusive orders',
        'three active nodes',
        'quorum',
        'direct contact with voyager',
        'pathfinder breakthrough',
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
if (definition.packageBinding?.sourceId !== SOURCE_ID
    || predecessor.transitions?.[0]?.target?.id !== SOURCE_ID) {
    errors.push('Open Orders III source identity does not match the exact Chapter 7 transition target');
}
if (templates.some((template) => template.id === SOURCE_ID)) {
    errors.push('Open Orders III must remain V1-only instead of gaining a duplicate legacy quest row');
}
if (definition.transitions?.[0]?.target?.id !== SUCCESSOR_ID
    || !templates.some((template) => template.id === SUCCESSOR_ID)) {
    errors.push('Open Orders III does not target the exact package-authored Chapter 8 mission');
}
for (const sideId of ['side-the-name-on-the-hull', 'side-a-signal-toward-home', 'side-two-signatures']) {
    const side = templates.find((template) => template.id === sideId);
    if (!side || JSON.stringify(side.missionGraph || null) !== '{}') {
        errors.push(`${sideId} must remain an empty legacy migration input`);
    }
}
if (scenarios.definitionId !== definition.id) errors.push('scenario fixture definitionId mismatch');

if ((definition.facts || []).length !== 5
    || definition.facts.filter((fact) => fact.visibility === 'known').length !== 1
    || definition.facts.filter((fact) => fact.visibility === 'discoverable').length !== 4) {
    errors.push('Open Orders III must use one known opportunity fact and four discoverable aggregate reports');
}
if ((definition.events || []).length !== 4
    || definition.events.some((event) => event.playerVisibility !== 'hidden')) {
    errors.push('assignment assessment and readiness events must remain four hidden causal gates');
}
if ((definition.outcomes || []).length !== 7
    || (definition.evidencePolicies || []).length !== 18
    || (definition.reportRoutes || []).length !== 4
    || (definition.objectives || []).length !== 4
    || (definition.outcomeDimensions || []).length !== 4
    || (definition.terminalDispositions || []).length !== 5) {
    errors.push('Open Orders III bounded tracking surface changed unexpectedly');
}
if ((definition.clocks || []).length !== 0) {
    errors.push('Open Orders III cannot invent a player-known deadline without an authored duration');
}

const initiallyKnown = (definition.facts || [])
    .filter((fact) => fact.initiallyTrue === true && fact.visibility === 'known');
if (initiallyKnown.length !== 1 || initiallyKnown[0]?.id !== 'fact.open-orders3.opportunities') {
    errors.push('only spoiler-safe assignment opportunities may be initially known');
}

const knownActorIds = new Set((crewData.officers || []).map((officer) => officer.id));
for (const route of definition.reportRoutes || []) {
    if (route.deliveryRequirement !== 'required') errors.push(`${route.id} can bypass Duty Report custody`);
    for (const actorId of [...(route.preferredActorIds || []), ...(route.fallbackActorIds || [])]) {
        if (!knownActorIds.has(actorId)) errors.push(`${route.id} names unknown crew actor: ${actorId}`);
    }
    const routeWhen = JSON.stringify(route.when);
    if (!routeWhen.includes('event.open-orders3.')) {
        errors.push(`${route.id} is not gated by a completed aggregate event`);
    }
    if (route.factId !== 'fact.open-orders3.distributed-readiness'
        && !routeWhen.includes('-engagement')) {
        errors.push(`${route.id} is not gated by both engagement and completed assessment`);
    }
}

for (const slug of ASSIGNMENTS) {
    const engagement = definition.evidencePolicies.find(
        (policy) => policy.id === `policy.open-orders3.${slug}-engagement`,
    );
    if (engagement?.claimType !== 'decisionRecorded'
        || JSON.stringify(engagement?.sourceRoles) !== JSON.stringify(['user'])) {
        errors.push(`${slug} engagement is not exclusively player-owned`);
    }
    const resultPolicy = definition.evidencePolicies.find(
        (policy) => policy.id === `policy.open-orders3.${slug}-result`,
    );
    if (resultPolicy?.claimType !== 'outcomeObserved'
        || resultPolicy?.sourceRoles?.includes('user')
        || JSON.stringify(resultPolicy?.when) !== JSON.stringify({
            factKnown: `fact.open-orders3.${slug}-assessment`,
        })) {
        errors.push(`${slug} result can bypass its player-known assessment or world custody`);
    }
    const objective = definition.objectives.find(
        (candidate) => candidate.id === `objective.open-orders3.${slug}`,
    );
    if (objective?.class !== 'conditional' || objective?.activatedAs !== 'optional') {
        errors.push(`${slug} is no longer a visible conditional optional objective`);
    }
    const declineRule = objective?.terminalWhen?.find((entry) => entry.disposition === 'knowinglyDeclined');
    const declineText = JSON.stringify(declineRule?.when);
    if (!declineText.includes('"pending"')
        || !declineText.includes('"declined"')
        || !declineText.includes('outcome.open-orders3.conclusion')) {
        errors.push(`${slug} cannot remain reversible until explicit interval conclusion`);
    }
    const dimension = definition.outcomeDimensions.find(
        (candidate) => candidate.id === `dimension.open-orders3.${slug}`,
    );
    const declinedDimension = dimension?.derive?.find((entry) => entry.value === 'declined');
    if (!JSON.stringify(declinedDimension?.when).includes('knowinglyDeclined')) {
        errors.push(`${slug} does not collapse explicit and implicit non-selection into one terminal dimension`);
    }
}

const readinessEvent = definition.evidencePolicies.find(
    (policy) => policy.id === 'policy.open-orders3.readiness-prepared',
);
const readinessDisclosure = definition.evidencePolicies.find(
    (policy) => policy.id === 'policy.open-orders3.readiness-disclosed',
);
const readinessRoute = definition.reportRoutes.find(
    (route) => route.factId === 'fact.open-orders3.distributed-readiness',
);
if (readinessEvent?.claimType !== 'eventOccurred'
    || readinessEvent?.sourceRoles?.includes('user')) {
    errors.push('distributed readiness can be self-certified by player prose');
}
if (readinessDisclosure?.claimType !== 'factDisclosed'
    || !JSON.stringify(readinessDisclosure?.when).includes('event.open-orders3.readiness-prepared')) {
    errors.push('distributed-readiness disclosure bypasses the completed aggregate review');
}
if (readinessRoute?.urgency !== 'urgent'
    || readinessRoute?.deliveryRequirement !== 'required') {
    errors.push('the campaign-critical readiness report lacks required urgent delivery');
}

for (const policyId of [
    'policy.open-orders3.conclude-after-two',
    'policy.open-orders3.conclude-broad-coverage',
    'policy.open-orders3.conclude-overextended',
    'policy.open-orders3.depart-early',
]) {
    const policy = definition.evidencePolicies.find((candidate) => candidate.id === policyId);
    if (policy?.claimType !== 'decisionRecorded'
        || JSON.stringify(policy?.sourceRoles) !== JSON.stringify(['user'])) {
        errors.push(`${policyId} is not exclusively player-owned`);
    }
    if (!JSON.stringify(policy?.when).includes('fact.open-orders3.distributed-readiness')) {
        errors.push(`${policyId} can conclude before the critical readiness report`);
    }
}

const closeWhenText = JSON.stringify(definition.closeWhen);
if (!closeWhenText.includes('objective.open-orders3.conclusion')
    || ASSIGNMENTS.some((slug) => closeWhenText.includes(`objective.open-orders3.${slug}`))
    || /fact\.open-orders3|event\.open-orders3|outcome\.open-orders3/.test(closeWhenText)) {
    errors.push('the explicit conclusion objective is no longer the sole closure authority');
}

const signaturesText = JSON.stringify([
    definition.facts.find((fact) => fact.id === 'fact.open-orders3.signatures-assessment'),
    definition.evidencePolicies.find((policy) => policy.id === 'policy.open-orders3.signatures-result'),
    definition.transitions?.[0],
]);
if (!/imani/i.test(signaturesText)
    || !/independent/i.test(signaturesText)
    || !/documented limits/i.test(signaturesText)
    || !/refus/i.test(signaturesText)) {
    errors.push('Two Signatures loses independent consent, bounded asset, or refusal-forward semantics');
}
const signalText = JSON.stringify([
    definition.facts.find((fact) => fact.id === 'fact.open-orders3.signal-assessment'),
    definition.transitions?.[0],
]);
if (!/relay window/i.test(signalText)
    || !/(?:not|neither) direct contact with voyager/i.test(signalText)
    || !/(?:not|nor).*pathfinder breakthrough/i.test(signalText)) {
    errors.push('A Signal Toward Home can overclaim direct contact or a decisive Pathfinder result');
}

const scenarioById = new Map(scenarios.scenarios.map((scenario) => [scenario.id, scenario]));
for (const scenarioId of [
    'name-and-signal-normal',
    'name-and-signatures-normal',
    'signal-and-signatures-normal',
    'broad-coverage-with-delegation',
    'three-direct-overextension',
    'overextended-with-informed-failure',
    'limited-mixed-results',
    'informed-assignment-failure',
    'early-departure-after-readiness',
    'decline-then-reconsider',
    'non-linear-assignment-order',
    'selection-alone-does-not-close',
    'delegation-does-not-earn-asset',
    'premature-assignment-report',
    'premature-assignment-result',
    'premature-readiness-disclosure',
    'conclusion-before-readiness-report',
    'assistant-cannot-set-engagement',
    'user-cannot-self-certify-result',
    'stale-proposal',
    'wrong-swipe-proposal',
    'hallucinated-policy-proposal',
]) {
    if (!scenarioById.has(scenarioId)) errors.push(`missing required resilience scenario: ${scenarioId}`);
}
const reachedTerminals = new Set(scenarioExpectations.map((expected) => expected.terminalDisposition).filter(Boolean));
for (const terminal of definition.terminalDispositions || []) {
    if (!reachedTerminals.has(terminal.id)) errors.push(`terminal disposition lacks a scenario: ${terminal.id}`);
}
for (const scenario of scenarios.scenarios) {
    if (scenario.expected?.status === 'terminal'
        && scenario.expected?.transitionTargetId !== SUCCESSOR_ID) {
        errors.push(`${scenario.id} does not transition to Chapter 8`);
    }
}

const initialPlayerSafeSurfaces = [
    definition.playerText,
    ...initiallyKnown.map((fact) => fact.playerText),
    ...(definition.objectives || []).map((objective) => objective.playerText),
];
if (/thirty-second|multiple regional alerts|mutually exclusive orders|three active nodes|quorum|direct contact with voyager|pathfinder breakthrough|one cross.*consent|legal office.*malicious|hidden objective|unknown objective|\b\d+%/i.test(JSON.stringify(initialPlayerSafeSurfaces))) {
    errors.push('initial player-safe Open Orders III surfaces reveal hidden assignment or Chapter 8 truth');
}
if (/"(?:commandBearing|inspiration|resolve)"\s*:|progressModel|initialProgress|pressure\.|revelation\.|event-template|systemicResolution|maxObjectiveProgressPerTurn/i.test(JSON.stringify(definition))) {
    errors.push('Open Orders III embeds deferred rewards or legacy progress/revelation machinery');
}

if (errors.length > 0) {
    for (const error of [...new Set(errors)].sort()) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
} else {
    console.log(
        `Validated Ashes V1 Open Orders III: ${definition.objectives.length} objectives, `
        + `${definition.evidencePolicies.length} evidence policies, `
        + `${definition.reportRoutes.length} aggregate reports, ${scenarios.scenarios.length} scenarios, `
        + 'reversible optional work, distributed-readiness custody, no synthetic clock, and Chapter 8 handoff.',
    );
}
