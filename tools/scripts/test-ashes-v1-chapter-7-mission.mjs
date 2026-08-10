import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

import { validateMissionDefinition } from '../../src/mission/v1/mission-contracts.mjs';
import { validateMissionEvidenceProposal } from '../../src/mission/v1/evidence-contracts.mjs';
import { reduceMissionEvidence } from '../../src/mission/v1/mission-reducer.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';

const DEFINITION_PATH = 'packages/bundled/breckenridge/v1/chapter-7-a-peace-of-their-own.mission-v1.json';
const SCENARIOS_PATH = 'tests/fixtures/mission/v1/chapter-7-peace-of-their-own-scenarios.fixture.json';
const PACKAGE_PATH = 'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json';
const PREDECESSOR_PATH = 'packages/bundled/breckenridge/v1/chapter-6-the-cost-of-knowing.mission-v1.json';
const SOURCE_PATH = 'docs/source/Directive_Ashes_of_Peace_Campaign_v0.2.md';
const PACKAGE_ID = 'directive:campaign-package:breckenridge-ashes-of-peace';
const PACKAGE_VERSION = '0.3.0-pre-alpha.1';
const SOURCE_ID = 'chapter-7-a-peace-of-their-own';
const SUCCESSOR_ID = 'open-orders-3-before-the-lamps-go-out';
const INITIAL_SPOILER_PATTERN = /three factions|restrain holt|portable pale lantern|portable interface|manipulated telemetry|similarly manipulated|weapons lock|boarding attempt|communications cutoff|hidden objective|unknown objective|\b\d+%/i;
const LEGACY_KEYS = new Set([
    'progressModel', 'initialProgress', 'completionThreshold', 'phases', 'phaseId',
    'outcomeFlags', 'pressures', 'pressureIds', 'revelations', 'systemicResolution',
]);

assert.equal(fs.existsSync(DEFINITION_PATH), true, `Chapter 7 V1 definition is required at ${DEFINITION_PATH}`);

const definition = JSON.parse(fs.readFileSync(DEFINITION_PATH, 'utf8'));
const scenarios = JSON.parse(fs.readFileSync(SCENARIOS_PATH, 'utf8'));
const packageData = JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'));
const predecessor = JSON.parse(fs.readFileSync(PREDECESSOR_PATH, 'utf8'));
const source = fs.readFileSync(SOURCE_PATH, 'utf8');
const validation = validateMissionDefinition(definition);
assert.equal(validation.ok, true, validation.errors.join('\n'));
assert.deepEqual(definition.packageBinding, { packageId: PACKAGE_ID, packageVersion: PACKAGE_VERSION, sourceId: SOURCE_ID });
assert.equal(definition.id, 'mission.chapter-7-a-peace-of-their-own');
assert.equal(predecessor.transitions?.[0]?.target?.id, SOURCE_ID);
assert.equal(definition.transitions?.[0]?.target?.id, SUCCESSOR_ID);
assert.match(source, /## 21\. Open Orders III: Before the Lamps Go Out/);

const questTemplates = Array.isArray(packageData.questTemplates)
    ? packageData.questTemplates.flatMap((collection) => collection?.templates || [])
    : packageData.questTemplates?.templates || [];
const quest = questTemplates.find((template) => template.id === SOURCE_ID);
assert.ok(quest, 'Chapter 7 must bind to the exact package quest');
assert.deepEqual(quest.missionGraph, {}, 'legacy Chapter 7 mission graph remains empty migration input');
assert.equal(questTemplates.some((template) => template.id === SUCCESSOR_ID), false, 'Open Orders III is V1-only source authority');

function collectKeys(value, keys = new Set()) {
    if (!value || typeof value !== 'object') return keys;
    if (Array.isArray(value)) {
        for (const child of value) collectKeys(child, keys);
        return keys;
    }
    for (const [key, child] of Object.entries(value)) {
        keys.add(key);
        collectKeys(child, keys);
    }
    return keys;
}

const definitionKeys = collectKeys(definition);
for (const key of LEGACY_KEYS) assert.equal(definitionKeys.has(key), false, `V1 definition contains legacy key ${key}`);
assert.equal(definition.objectives.length, 3);
assert.deepEqual(definition.objectives.map((objective) => objective.id), [
    'objective.chapter7.standoff',
    'objective.chapter7.shared-truth-interface',
    'objective.chapter7.command-settlement',
]);
assert.equal(definition.objectives.every((objective) => objective.class === 'required'), true);
assert.equal(definition.reportRoutes.length, 2, 'seven revelations collapse into two aggregate reports');
assert.equal(definition.outcomeDimensions.length, 5, 'persistent consequences project through five concise dimensions');
assert.equal(definition.clocks.length, 1, 'Chapter 7 has exactly one real player-known deadline');
assert.deepEqual(definition.clocks[0], {
    ...definition.clocks[0],
    id: 'clock.chapter7.task-group-arrival',
    unit: 'hours',
    direction: 'down',
    initialValue: 36,
    advanceSources: ['authoritativeStoryTime'],
});
for (const factId of [
    'fact.chapter7.political-legitimacy-account',
    'fact.chapter7.mutual-telemetry-manipulation',
]) {
    assert.equal(definition.reportRoutes.filter((route) => route.factId === factId).length, 1, factId);
    assert.equal(definition.evidencePolicies.filter((policy) => policy.claimType === 'factDisclosed' && policy.targetId === factId).length, 1, factId);
}

const choicePolicies = new Map([
    ['policy.chapter7.crisis-posture', null],
    ['policy.chapter7.interface-response', 'fact.chapter7.mutual-telemetry-manipulation'],
    ['policy.chapter7.settlement-framework', 'fact.chapter7.political-legitimacy-account'],
]);
for (const [policyId, informedFactId] of choicePolicies) {
    const policy = definition.evidencePolicies.find((candidate) => candidate.id === policyId);
    assert.deepEqual(policy?.sourceRoles, ['user'], `${policyId} must remain exclusively player-owned`);
    if (informedFactId) assert.match(JSON.stringify(policy.when), new RegExp(informedFactId.replaceAll('.', '\\.')));
}
const frameworkPolicy = definition.evidencePolicies.find((policy) => policy.id === 'policy.chapter7.settlement-framework');
assert.equal(frameworkPolicy.interpretation.values.some((entry) => entry.value === 'otherConcreteFramework'), true);

const initialState = createMissionState({ definition, branchId: 'scenario.initial' });
assert.deepEqual(initialState.knownFacts, ['fact.chapter7.annex-constitutional-crisis']);
assert.equal(initialState.objectives['objective.chapter7.standoff'].visibility, 'visible');
assert.equal(initialState.objectives['objective.chapter7.shared-truth-interface'].visibility, 'visible');
assert.equal(initialState.objectives['objective.chapter7.command-settlement'].visibility, 'visible');
assert.deepEqual(initialState.clocks['clock.chapter7.task-group-arrival'], {
    state: 'running', value: 36, visibility: 'visible', expiryApplied: false, lastAdvancementEvidenceKey: null,
});
const initialVisibleText = [
    definition.playerText,
    ...definition.facts.filter((fact) => fact.visibility === 'known').map((fact) => fact.playerText),
    ...definition.objectives.map((objective) => objective.playerText),
    ...definition.clocks.map((clock) => clock.playerText),
];
assert.equal(INITIAL_SPOILER_PATTERN.test(JSON.stringify(initialVisibleText)), false);

assert.equal(scenarios.kind, 'directive.ashesV1Chapter7Scenarios.v1');
assert.equal(scenarios.definitionId, definition.id);
assert.deepEqual(scenarios.scenarios.map((scenario) => scenario.id), [
    'provisional-accord-before-deadline',
    'non-linear-armed-stand-down',
    'federation-restoration-with-cost',
    'compact-control-with-cost',
    'fragmented-authority-freeform',
    'open-conflict-before-knowledge',
    'responsible-mixed-handoff',
    'task-group-arrival-does-not-close',
    'post-arrival-provisional-accord',
    'coercive-federation-overrides-accord-label',
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
]);

function sourceForStep(scenarioId, step, index, revision) {
    const selectedSwipeId = step.sourceRole === 'assistant' ? `swipe.${index + 1}` : null;
    return {
        messageId: `source.${scenarioId}.${index + 1}`,
        branchId: `branch.${scenarioId}`,
        accepted: true,
        selectedSwipeId,
        textHash: createHash('sha256').update(`${scenarioId}:${index}:${step.claimId}`).digest('hex'),
        role: step.sourceRole,
        acceptedAtRevision: revision,
    };
}

function runScenario(scenario) {
    const branchId = `branch.${scenario.id}`;
    let state = createMissionState({ definition, branchId });
    const rejectedReasonCodes = [];
    let acceptedClaimCount = 0;
    const steps = [
        ...(scenario.sequence || []).flatMap((fragmentId) => {
            const fragment = scenarios.fragments?.[fragmentId];
            assert.equal(Array.isArray(fragment), true, `${scenario.id}:unknown fragment ${fragmentId}`);
            return fragment;
        }),
        ...(scenario.steps || []),
    ];
    for (const [index, step] of steps.entries()) {
        const source = sourceForStep(scenario.id, step, index, state.revision);
        const proposal = {
            kind: 'directive.missionEvidenceProposal.v1',
            branchId,
            missionId: definition.id,
            baseRevision: state.revision + (step.baseRevisionOffset || 0),
            providerConfidence: 0.99,
            claims: [{
                claimId: step.claimId,
                policyId: step.policyId,
                claimType: step.claimType,
                targetId: step.targetId,
                ...(Object.hasOwn(step, 'value') ? { value: step.value } : {}),
                sourceRef: {
                    messageId: source.messageId,
                    swipeId: step.sourceSwipeOverride ?? source.selectedSwipeId,
                    textHash: source.textHash,
                },
            }],
        };
        const evidence = validateMissionEvidenceProposal({
            definition,
            state,
            proposal,
            resolveSourceRef: (ref) => ref?.messageId === source.messageId ? source : null,
        });
        rejectedReasonCodes.push(...evidence.rejectedClaims.map((claim) => claim.reasonCode));
        acceptedClaimCount += evidence.acceptedClaims.length;
        if (evidence.acceptedClaims.length === 0) continue;
        state = reduceMissionEvidence({
            definition,
            state,
            acceptedClaims: evidence.acceptedClaims,
            sourceContribution: {
                id: `contribution.${scenario.id}.${index + 1}`,
                messageId: source.messageId,
                swipeId: source.selectedSwipeId,
                role: source.role,
                textHash: source.textHash,
                acceptedAtRevision: source.acceptedAtRevision,
            },
        }).state;
    }
    return { state, rejectedReasonCodes, acceptedClaimCount };
}

for (const scenario of scenarios.scenarios) {
    let result;
    try {
        result = runScenario(scenario);
    } catch (error) {
        throw new Error(`${scenario.id}: ${error.message}`);
    }
    const expected = scenario.expected;
    assert.equal(result.state.status, expected.status, scenario.id);
    assert.equal(result.state.terminalDisposition, expected.terminalDisposition, scenario.id);
    assert.equal(result.acceptedClaimCount, expected.acceptedClaimCount, scenario.id);
    assert.deepEqual(result.rejectedReasonCodes, expected.rejectedReasonCodes, scenario.id);
    for (const [objectiveId, disposition] of Object.entries(expected.objectiveDispositions || {})) {
        assert.equal(result.state.objectives[objectiveId]?.disposition, disposition, `${scenario.id}:${objectiveId}`);
    }
    for (const [dimensionId, value] of Object.entries(expected.outcomeDimensions || {})) {
        assert.equal(result.state.outcomeDimensions[dimensionId], value, `${scenario.id}:${dimensionId}`);
    }
    for (const [clockId, expectedClock] of Object.entries(expected.clockStates || {})) {
        assert.equal(result.state.clocks[clockId]?.state, expectedClock.state, `${scenario.id}:${clockId}:state`);
        assert.equal(result.state.clocks[clockId]?.value, expectedClock.value, `${scenario.id}:${clockId}:value`);
    }
    for (const eventId of expected.eventsInclude || []) {
        assert.equal(result.state.events.includes(eventId), true, `${scenario.id}:${eventId}`);
    }
    for (const eventId of expected.eventsExclude || []) {
        assert.equal(result.state.events.includes(eventId), false, `${scenario.id}:${eventId}`);
    }
    assert.equal(result.state.transitionReceipt?.target?.id || null, expected.transitionTargetId || null, scenario.id);
}

assert.equal(
    scenarios.scenarios.find((scenario) => scenario.id === 'open-conflict-before-knowledge')
        .expected.objectiveDispositions['objective.chapter7.standoff'],
    'completedWithCost',
    'conflict before hidden manipulation is known records cost rather than invented informed blame',
);

console.log('Ashes V1 Chapter 7 mission tests passed.');
