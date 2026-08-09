import fs from 'node:fs';

import { lintMissionPackage } from '../../src/mission/v1/mission-package-linter.mjs';

const DEFINITION_PATH = 'packages/bundled/breckenridge/v1/open-orders-2-what-survives.mission-v1.json';
const SCENARIOS_PATH = 'tests/fixtures/mission/v1/open-orders-2-scenarios.fixture.json';
const PACKAGE_PATH = 'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json';
const PREDECESSOR_PATH = 'packages/bundled/breckenridge/v1/chapter-5-old-lessons.mission-v1.json';
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
const knownTransitionTargetIds = new Set(templates.map((template) => template.id));
const scenarioExpectations = scenarios.scenarios.map((scenario) => scenario.expected);
const result = lintMissionPackage({ definition, knownTransitionTargetIds, scenarioExpectations });
const errors = [...result.errors];

if (definition.packageBinding?.packageId !== packageData.manifest?.id) {
    errors.push(`package binding id does not match ${PACKAGE_PATH}`);
}
if (definition.packageBinding?.packageVersion !== packageData.manifest?.version) {
    errors.push(`package binding version does not match ${PACKAGE_PATH}`);
}
const predecessorTarget = predecessor.transitions?.[0]?.target?.id;
if (definition.packageBinding?.sourceId !== predecessorTarget) {
    errors.push(`V1-only source identity does not match the exact Old Lessons target: ${predecessorTarget}`);
}
if (templates.some((template) => template.id === definition.packageBinding?.sourceId)) {
    errors.push('Open Orders II must not add a duplicate legacy quest template');
}
if (!templates.some((template) => template.id === definition.transitions?.[0]?.target?.id)) {
    errors.push(`Chapter 6 transition target is not an authored package template: ${definition.transitions?.[0]?.target?.id}`);
}
if (scenarios.definitionId !== definition.id) errors.push('scenario fixture definitionId mismatch');
if ((definition.clocks || []).length !== 0) errors.push('Open Orders II cannot add a clock without an authored deadline');
if ((definition.reportRoutes || []).length !== 4) errors.push('Open Orders II must use three assignment reports and one credential-path report');

const initiallyKnownFactIds = new Set((definition.facts || [])
    .filter((fact) => fact.initiallyTrue === true && fact.visibility === 'known')
    .map((fact) => fact.id));
if (JSON.stringify([...initiallyKnownFactIds]) !== JSON.stringify(['fact.open-orders2.opportunities'])) {
    errors.push('only the spoiler-safe assignment opportunities may be initially known');
}
for (const policy of definition.evidencePolicies || []) {
    if (policy.claimType === 'factDisclosed' && initiallyKnownFactIds.has(policy.targetId)) {
        errors.push(`${policy.id} redundantly records an initially known fact`);
    }
}

const knownActorIds = new Set((crewData.officers || []).map((officer) => officer.id));
for (const route of definition.reportRoutes || []) {
    for (const actorId of [...(route.preferredActorIds || []), ...(route.fallbackActorIds || [])]) {
        if (!knownActorIds.has(actorId)) errors.push(`${route.id} names unknown crew actor: ${actorId}`);
    }
    const serializedWhen = JSON.stringify(route.when);
    if (!serializedWhen.includes('event.open-orders2.')) {
        errors.push(`${route.id} is not gated by a completed aggregate event`);
    }
    if (route.factId !== 'fact.open-orders2.current-starfleet-credential-path'
        && !serializedWhen.includes('-engagement')) {
        errors.push(`${route.id} is not gated by both engagement and completed assessment`);
    }
}

const optionalObjectiveIds = [
    'objective.open-orders2.last-watch',
    'objective.open-orders2.second-opinion',
    'objective.open-orders2.unwelcome-result',
];
const closeWhenText = JSON.stringify(definition.closeWhen);
for (const objectiveId of optionalObjectiveIds) {
    if (closeWhenText.includes(objectiveId)) errors.push(`${objectiveId} participates directly in closeWhen`);
}
if (!closeWhenText.includes('objective.open-orders2.conclusion')) {
    errors.push('the explicit interval conclusion is not the sole closure authority');
}
if (closeWhenText.includes('current-starfleet-credential-path')) {
    errors.push('the credential path must gate conclusion evidence, not become a hidden closure objective');
}

for (const assignment of ['last-watch', 'second-opinion', 'unwelcome-result']) {
    const engagementPolicy = definition.evidencePolicies.find((policy) => policy.id === `policy.open-orders2.${assignment}-engagement`);
    if (engagementPolicy?.claimType !== 'decisionRecorded'
        || JSON.stringify(engagementPolicy?.sourceRoles) !== JSON.stringify(['user'])) {
        errors.push(`${assignment} engagement is not a player-provable decision`);
    }
    const resultPolicy = definition.evidencePolicies.find((policy) => policy.id === `policy.open-orders2.${assignment}-result`);
    if (JSON.stringify(resultPolicy?.when) !== JSON.stringify({ factKnown: `fact.open-orders2.${assignment}-assessment` })) {
        errors.push(`${assignment} result does not require its player-known assessment`);
    }
}

for (const policyId of [
    'policy.open-orders2.conclude-after-two',
    'policy.open-orders2.conclude-broad-coverage',
    'policy.open-orders2.conclude-overextended',
    'policy.open-orders2.depart-early',
]) {
    const policy = definition.evidencePolicies.find((candidate) => candidate.id === policyId);
    if (policy?.claimType !== 'decisionRecorded'
        || JSON.stringify(policy?.sourceRoles) !== JSON.stringify(['user'])) {
        errors.push(`${policyId} is not exclusively player-owned`);
    }
    if (!JSON.stringify(policy?.when).includes('fact.open-orders2.current-starfleet-credential-path')) {
        errors.push(`${policyId} can conclude before the campaign-critical credential report`);
    }
}

const credentialEventPolicy = definition.evidencePolicies.find((policy) => policy.id === 'policy.open-orders2.credential-path-corroborated');
const credentialDisclosurePolicy = definition.evidencePolicies.find((policy) => policy.id === 'policy.open-orders2.credential-path-disclosed');
if (credentialEventPolicy?.claimType !== 'eventOccurred'
    || !credentialEventPolicy?.sourceRoles?.includes('assistant')) {
    errors.push('credential-path corroboration is not crew/world-owned evidence');
}
if (credentialDisclosurePolicy?.claimType !== 'factDisclosed'
    || !JSON.stringify(credentialDisclosurePolicy?.when).includes('event.open-orders2.credential-path-corroborated')) {
    errors.push('credential-path disclosure is not gated by completed corroboration');
}
const credentialRoute = definition.reportRoutes.find((route) => route.factId === 'fact.open-orders2.current-starfleet-credential-path');
if (credentialRoute?.deliveryRequirement !== 'required'
    || credentialRoute?.urgency !== 'urgent'
    || JSON.stringify(credentialRoute?.preferredActorIds) !== JSON.stringify(['priya-nayar', 'rowan-saye'])) {
    errors.push('credential-path Duty Report lacks required delivery or source custody');
}
if (!/defense-system integration/i.test(JSON.stringify([
    credentialRoute?.playerText,
    definition.facts?.find((fact) => fact.id === 'fact.open-orders2.current-starfleet-credential-path')?.playerText,
    definition.transitions?.[0]?.mustNarrate,
]))) {
    errors.push('the aggregate background report drops the source-authored defense-system integration escalation');
}

const oldLessonsReaction = (packageData.reactionRules?.rules || []).find((reaction) => reaction.id === 'reaction.chapter-5-old-lessons');
const legacyCredentialEffect = oldLessonsReaction?.effects?.find((effect) => effect.fact?.id === 'fact.current-starfleet-credentials');
if (!legacyCredentialEffect) errors.push('legacy credential reaction conflict is no longer present and the migration guard needs review');
if ((definition.facts || []).find((fact) => fact.id === 'fact.open-orders2.current-starfleet-credential-path')?.visibility !== 'discoverable') {
    errors.push('V1 credential truth is not quarantined from initial player knowledge');
}

const scenarioById = new Map(scenarios.scenarios.map((scenario) => [scenario.id, scenario]));
const two = scenarioById.get('two-assignment-normal');
const broad = scenarioById.get('broad-coverage-with-delegation');
const overextended = scenarioById.get('three-direct-overextension');
const overextendedFailure = scenarioById.get('overextended-with-informed-failure');
const early = scenarioById.get('early-departure-after-background-report');
const reconsidered = scenarioById.get('decline-then-reconsider');
const prematureCredential = scenarioById.get('premature-credential-disclosure');
const blockedConclusion = scenarioById.get('conclusion-before-credential-report');
if (two?.expected?.outcomeDimensions?.['dimension.open-orders2.load'] !== 'normal-two') {
    errors.push('fixtures do not prove the normal two-assignment load');
}
if (!broad?.sequence?.some((fragment) => fragment.endsWith('-delegated'))
    || broad?.expected?.outcomeDimensions?.['dimension.open-orders2.load'] !== 'broad-delegated-coverage') {
    errors.push('fixtures do not prove broad coverage requires delegation');
}
if (overextended?.sequence?.some((fragment) => fragment.endsWith('-delegated'))
    || overextended?.expected?.outcomeDimensions?.['dimension.open-orders2.load'] !== 'overextended-direct') {
    errors.push('fixtures do not prove all-direct overextension');
}
if (overextendedFailure?.expected?.terminalDisposition !== 'limitedWorkForward'
    || overextendedFailure?.expected?.outcomeDimensions?.['dimension.open-orders2.load'] !== 'overextended-direct') {
    errors.push('fixtures do not prove informed failure outranks generic overextension while retaining load cost');
}
if (early?.sequence?.[0] !== 'credentials' || early.expected?.terminalDisposition !== 'earlyDepartureForward') {
    errors.push('fixtures do not prove early departure waits for the background report');
}
if (reconsidered?.expected?.objectiveDispositions?.['objective.open-orders2.last-watch'] !== 'completed') {
    errors.push('fixtures do not prove a provisional decline can be reconsidered before interval conclusion');
}
if (prematureCredential?.expected?.rejectedReasonCodes?.[0] !== 'precondition-not-met') {
    errors.push('fixtures do not reject premature credential disclosure');
}
if (blockedConclusion?.expected?.status !== 'active'
    || blockedConclusion?.expected?.transitionTargetId !== null
    || blockedConclusion?.expected?.rejectedReasonCodes?.[0] !== 'precondition-not-met') {
    errors.push('fixtures do not prove Chapter 6 is blocked before the credential report');
}

for (const scenario of scenarios.scenarios) {
    if (scenario.expected?.status !== 'terminal') continue;
    if (!scenario.expected?.knownFactsIncludes?.includes('fact.open-orders2.current-starfleet-credential-path')) {
        errors.push(`${scenario.id} reaches terminal without fixture proof of the credential report`);
    }
    if (scenario.expected?.transitionTargetId !== 'chapter-6-the-cost-of-knowing') {
        errors.push(`${scenario.id} does not transition to Chapter 6`);
    }
}

const reachedTerminalDispositions = new Set(scenarioExpectations.map((expected) => expected.terminalDisposition).filter(Boolean));
for (const terminal of definition.terminalDispositions || []) {
    if (!reachedTerminalDispositions.has(terminal.id)) errors.push(`terminal disposition lacks a scenario: ${terminal.id}`);
}

const initialPlayerSafeSurfaces = [
    definition.playerText,
    ...(definition.facts || []).filter((fact) => fact.visibility === 'known').map((fact) => fact.playerText),
    ...(definition.objectives || []).map((objective) => objective.playerText),
];
if (/targeting fault|conceal|career pressure|coerc|pale lantern|contaminat|current credential|starfleet intelligence|rourke|farwatch|hidden objective|\b\d+%/i.test(JSON.stringify(initialPlayerSafeSurfaces))) {
    errors.push('initial player-safe Open Orders II surfaces contain a hidden assignment or credential spoiler');
}

if (errors.length > 0) {
    for (const error of [...new Set(errors)].sort()) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
} else {
    console.log(
        `Validated Ashes V1 Open Orders II: ${definition.objectives.length} objectives, `
        + `${definition.evidencePolicies.length} evidence policies, `
        + `${definition.reportRoutes.length} aggregate reports, ${scenarios.scenarios.length} scenarios, `
        + 'V1-only interval identity, credential-gated Chapter 6, no synthetic clock.',
    );
}
