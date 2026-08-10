import fs from 'node:fs';

import { lintMissionPackage } from '../../src/mission/v1/mission-package-linter.mjs';

const DEFINITION_PATH = 'packages/bundled/breckenridge/v1/chapter-7-a-peace-of-their-own.mission-v1.json';
const SCENARIOS_PATH = 'tests/fixtures/mission/v1/chapter-7-peace-of-their-own-scenarios.fixture.json';
const PACKAGE_PATH = 'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json';
const PREDECESSOR_PATH = 'packages/bundled/breckenridge/v1/chapter-6-the-cost-of-knowing.mission-v1.json';
const CREW_PATH = 'packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json';
const SOURCE_PATH = 'docs/source/Directive_Ashes_of_Peace_Campaign_v0.2.md';
const SUCCESSOR_ID = 'open-orders-3-before-the-lamps-go-out';

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
    knownTransitionTargetIds: new Set([...templates.map((template) => template.id), SUCCESSOR_ID]),
    scenarioExpectations,
    spoilerTerms: [
        'three factions',
        'restrain holt',
        'portable pale lantern',
        'portable interface',
        'manipulated telemetry',
        'similarly manipulated',
        'weapons lock',
        'boarding attempt',
        'communications cutoff',
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
    errors.push('Chapter 7 source identity does not match the exact Chapter 6 transition target');
}
if (!quest || JSON.stringify(quest.missionGraph || null) !== '{}') {
    errors.push('legacy Chapter 7 source must exist with an empty mission graph before V1 replacement');
}
if (templates.some((template) => template.id === SUCCESSOR_ID)) {
    errors.push('Open Orders III must remain V1-only instead of gaining a duplicate legacy quest row');
}
if (definition.transitions?.[0]?.target?.id !== SUCCESSOR_ID
    || !source.includes('## 21. Open Orders III: Before the Lamps Go Out')) {
    errors.push('Chapter 7 does not target the exact source-authored Open Orders III interval');
}
if (scenarios.definitionId !== definition.id) errors.push('scenario fixture definitionId mismatch');

if ((definition.objectives || []).length !== 3
    || definition.objectives.some((objective) => objective.class !== 'required')) {
    errors.push('Chapter 7 must expose exactly three high-value required responsibilities');
}
if ((definition.reportRoutes || []).length !== 2) {
    errors.push('the seven source revelations must remain two aggregate Duty Reports');
}
if ((definition.facts || []).length !== 3
    || definition.facts.filter((fact) => fact.visibility === 'known').length !== 1
    || definition.facts.filter((fact) => fact.visibility === 'discoverable').length !== 2) {
    errors.push('Chapter 7 must use one known opening fact and two discoverable aggregate facts');
}
if ((definition.events || []).length !== 1
    || definition.events[0]?.id !== 'event.chapter7.task-group-arrived'
    || definition.events[0]?.playerVisibility !== 'hidden') {
    errors.push('task-group arrival must remain one hidden event rather than a duplicate player tracker');
}
if ((definition.outcomes || []).length !== 11
    || definition.outcomes.some((outcome) => outcome.playerVisibility !== 'hidden')) {
    errors.push('raw Chapter 7 choices, truth routes, and world results cannot duplicate aggregate player-facing dimensions');
}
if ((definition.outcomeDimensions || []).length !== 5) {
    errors.push('Chapter 7 must derive exactly five aggregate persistent dimensions');
}
if ((definition.terminalDispositions || []).length !== 7) {
    errors.push('Chapter 7 must define the seven approved failure-forward terminal dispositions');
}
if ((definition.evidencePolicies || []).length !== 14) {
    errors.push('Chapter 7 must retain the bounded fourteen-policy evidence surface');
}

const initiallyKnownFacts = (definition.facts || [])
    .filter((fact) => fact.initiallyTrue === true && fact.visibility === 'known');
if (initiallyKnownFacts.length !== 1
    || initiallyKnownFacts[0]?.id !== 'fact.chapter7.annex-constitutional-crisis') {
    errors.push('only the Annex constitutional crisis may be known at mission opening');
}

const clock = definition.clocks?.[0];
if ((definition.clocks || []).length !== 1
    || clock?.id !== 'clock.chapter7.task-group-arrival'
    || clock?.unit !== 'hours'
    || clock?.direction !== 'down'
    || clock?.initialValue !== 36
    || clock?.startWhen !== true
    || !JSON.stringify(clock?.visibleWhen).includes('fact.chapter7.annex-constitutional-crisis')
    || !exactSet(clock?.advanceSources || [], ['authoritativeStoryTime'])
    || clock?.consequence?.targetId !== 'event.chapter7.task-group-arrived') {
    errors.push('Chapter 7 clock no longer represents the one visible authoritative thirty-six-hour task-group deadline');
}
if (!JSON.stringify(clock?.resolveWhen).includes('outcome.chapter7.settlement-result')) {
    errors.push('Chapter 7 clock does not resolve when an actual settlement result is established');
}
const timePolicy = definition.evidencePolicies
    .find((policy) => policy.id === 'policy.chapter7.authoritative-time');
if (timePolicy?.claimType !== 'timeAdvanced'
    || !exactSet(timePolicy?.sourceRoles || [], ['runtime', 'adjudicator'])
    || Object.hasOwn(timePolicy || {}, 'interpretation')) {
    errors.push('Chapter 7 elapsed time is not exclusively authoritative runtime/adjudicator evidence');
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
    if (!routeWhen.includes('outcome.chapter7.') || !routeWhen.includes('factKnown')) {
        errors.push(`${route.id} is not gated by completed route evidence and undisclosed aggregate truth`);
    }
}

const choicePolicyIds = [
    'policy.chapter7.crisis-posture',
    'policy.chapter7.interface-response',
    'policy.chapter7.settlement-framework',
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
if (!JSON.stringify(definition.evidencePolicies
    .find((policy) => policy.id === 'policy.chapter7.interface-response')?.when)
    .includes('fact.chapter7.mutual-telemetry-manipulation')) {
    errors.push('the player can lock an interface response before receiving the manipulation account');
}
const settlementFramework = definition.evidencePolicies
    .find((policy) => policy.id === 'policy.chapter7.settlement-framework');
if (!JSON.stringify(settlementFramework?.when).includes('fact.chapter7.political-legitimacy-account')) {
    errors.push('the player can lock a settlement framework before receiving the political-legitimacy account');
}
if (!(settlementFramework?.interpretation?.values || [])
    .some((entry) => entry.value === 'otherConcreteFramework')) {
    errors.push('the settlement classifier lost its freeform concrete-framework escape value');
}

const routeRequirements = new Map([
    ['policy.chapter7.political-account-route', ['directNegotiation', 'civilianPublicRecords', 'independentLegalReview']],
    ['policy.chapter7.interface-truth-route', ['sharedLiveTelemetry', 'technicalIsolation', 'crossSystemReconstruction']],
]);
for (const [policyId, expectedValues] of routeRequirements) {
    const policy = definition.evidencePolicies.find((candidate) => candidate.id === policyId);
    const actualValues = (policy?.interpretation?.values || []).map((value) => value.value);
    if (!exactSet(actualValues, expectedValues)) {
        errors.push(`${policyId} loses a direct or alternate truth route`);
    }
}
for (const [policyId, targetId] of [
    ['policy.chapter7.political-account-disclosed', 'outcome.chapter7.political-account-route'],
    ['policy.chapter7.interface-truth-disclosed', 'outcome.chapter7.interface-truth-route'],
]) {
    const policy = definition.evidencePolicies.find((candidate) => candidate.id === policyId);
    if (policy?.claimType !== 'factDisclosed'
        || !JSON.stringify(policy?.when).includes(targetId)) {
        errors.push(`${policyId} can disclose aggregate truth without a completed evidentiary route`);
    }
}

const closeWhenText = JSON.stringify(definition.closeWhen);
for (const objectiveId of [
    'objective.chapter7.standoff',
    'objective.chapter7.shared-truth-interface',
    'objective.chapter7.command-settlement',
]) {
    if (!closeWhenText.includes(objectiveId)) errors.push(`${objectiveId} is absent from closeWhen`);
}
if (/outcome\.chapter7|fact\.chapter7|event\.chapter7|clock\.chapter7/.test(closeWhenText)) {
    errors.push('raw facts, events, outcomes, or the clock bypass objective-based Chapter 7 closure');
}

const terminalsById = new Map((definition.terminalDispositions || []).map((terminal) => [terminal.id, terminal]));
for (const [terminalId, priority] of [
    ['openConflict', 700],
    ['federationRestoration', 600],
    ['compactControl', 500],
    ['fragmentedAuthority', 400],
    ['provisionalAccord', 300],
    ['armedStandDown', 200],
    ['responsibleHandoff', 100],
]) {
    if (terminalsById.get(terminalId)?.priority !== priority) {
        errors.push(`${terminalId} priority no longer preserves the approved failure-forward ordering`);
    }
}
if (!JSON.stringify(terminalsById.get('openConflict')?.when).includes('openHostility')) {
    errors.push('open conflict no longer outranks political labels when coalition hostility is active');
}
if (!JSON.stringify(terminalsById.get('responsibleHandoff')?.when).includes('objectiveDisposition')) {
    errors.push('responsible handoff is not an eligible objective-based fallback before terminal selection');
}

const scenarioById = new Map(scenarios.scenarios.map((scenario) => [scenario.id, scenario]));
for (const scenarioId of [
    'provisional-accord-before-deadline',
    'non-linear-armed-stand-down',
    'federation-restoration-with-cost',
    'compact-control-with-cost',
    'fragmented-authority-freeform',
    'open-conflict-before-knowledge',
    'responsible-mixed-handoff',
    'task-group-arrival-does-not-close',
    'choices-alone-do-not-close',
    'world-results-without-truth-do-not-close',
    'framework-before-political-report',
    'interface-choice-before-manipulation-report',
    'assistant-cannot-set-player-posture',
    'user-cannot-self-certify-settlement',
    'assistant-cannot-advance-clock',
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
const earlyConflict = scenarioById.get('open-conflict-before-knowledge');
const firstTruthIndex = Math.min(
    earlyConflict?.sequence?.indexOf('political-independent-report') ?? -1,
    earlyConflict?.sequence?.indexOf('interface-isolation-report') ?? -1,
);
if (firstTruthIndex < 2
    || earlyConflict?.expected?.objectiveDispositions?.['objective.chapter7.standoff'] !== 'completedWithCost') {
    errors.push('conflict before hidden manipulation is known is incorrectly treated as informed player failure');
}
const expiry = scenarioById.get('task-group-arrival-does-not-close');
if (expiry?.expected?.status !== 'active'
    || !expiry?.expected?.eventsInclude?.includes('event.chapter7.task-group-arrived')
    || (expiry?.expected?.transitionTargetId ?? null) !== null) {
    errors.push('task-group arrival incorrectly closes or fails Chapter 7');
}
const beforeDeadline = scenarioById.get('provisional-accord-before-deadline');
if (beforeDeadline?.expected?.clockStates?.['clock.chapter7.task-group-arrival']?.state !== 'resolved'
    || beforeDeadline?.expected?.eventsExclude?.includes('event.chapter7.task-group-arrived') !== true) {
    errors.push('fixtures do not prove settlement-before-expiry clock resolution');
}
for (const scenarioId of ['choices-alone-do-not-close', 'world-results-without-truth-do-not-close']) {
    const scenario = scenarioById.get(scenarioId);
    if (scenario?.expected?.status !== 'active' || (scenario?.expected?.transitionTargetId ?? null) !== null) {
        errors.push(`${scenarioId} can close Chapter 7 without all three actual responsibilities`);
    }
}
for (const scenario of scenarios.scenarios) {
    if (scenario.expected?.status === 'terminal'
        && scenario.expected?.transitionTargetId !== SUCCESSOR_ID) {
        errors.push(`${scenario.id} does not transition to Open Orders III`);
    }
}

const initialPlayerSafeSurfaces = [
    definition.playerText,
    ...initiallyKnownFacts.map((fact) => fact.playerText),
    ...(definition.objectives || []).map((objective) => objective.playerText),
    ...(definition.clocks || []).map((entry) => entry.playerText),
];
if (/three factions|restrain holt|portable (?:pale lantern )?interface|manipulated telemetry|similarly manipulated|weapons lock|boarding attempt|communications cutoff|hidden objective|unknown objective|\b\d+%/i.test(JSON.stringify(initialPlayerSafeSurfaces))) {
    errors.push('initial player-safe Chapter 7 surfaces reveal director-only truth');
}
const openingText = JSON.stringify([definition.playerText, initiallyKnownFacts[0]?.playerText, clock?.playerText]);
if (!/annex six/i.test(openingText)
    || !/tolland/i.test(openingText)
    || !/(?:mercer|task group)/i.test(openingText)
    || !/(?:thirty-six|36)/i.test(openingText)) {
    errors.push('the spoiler-safe opening loses a required occupation, Federation-order, Mercer, or deadline beat');
}
if (/\brebels?\b|criminal compact|unlawful occupation/i.test(openingText)) {
    errors.push('the opening caricatures the Compact as simple rebels or presumes Starfleet moral authority');
}
const transitionText = JSON.stringify(definition.transitions?.[0]);
for (const requiredBeat of ['evacuation', 'defense', 'challenge codes', 'compact civil', 'cardassian']) {
    if (!transitionText.toLowerCase().includes(requiredBeat)) {
        errors.push(`Open Orders III transition loses the coordinated ${requiredBeat} test`);
    }
}
if (/exact activation|activation sequence|expected solution|finale solution/i.test(JSON.stringify([
    definition.transitions?.[0]?.target?.playerSafeSetup,
    definition.transitions?.[0]?.mustNarrate,
]))) {
    errors.push('Chapter 7 reveals Chapter 8 director-only activation or solution detail');
}
if (/"(?:commandBearing|inspiration|resolve)"\s*:|progressModel|initialProgress|pressure\.|revelation\.|event-template|systemicResolution|maxObjectiveProgressPerTurn/i.test(JSON.stringify(definition))) {
    errors.push('Chapter 7 embeds deferred rewards or legacy progress/revelation machinery');
}

if (errors.length > 0) {
    for (const error of [...new Set(errors)].sort()) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
} else {
    console.log(
        `Validated Ashes V1 Chapter 7: ${definition.objectives.length} objectives, `
        + `${definition.evidencePolicies.length} evidence policies, `
        + `${definition.reportRoutes.length} aggregate reports, ${scenarios.scenarios.length} scenarios, `
        + 'alternate truth routes, freeform settlement, fair authoritative clock, and Open Orders III handoff.',
    );
}
