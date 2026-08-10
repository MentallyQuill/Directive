import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

import { validateMissionEntryCapabilitySources } from '../../src/mission/v1/mission-entry-capabilities.mjs';
import { validateMissionEvidenceProposal } from '../../src/mission/v1/evidence-contracts.mjs';
import { reduceMissionEvidence } from '../../src/mission/v1/mission-reducer.mjs';
import { createMissionState, missionStateContext } from '../../src/mission/v1/mission-state.mjs';
import { evaluateMissionPredicate } from '../../src/mission/v1/predicate-evaluator.mjs';

const DEFINITION_PATH = 'packages/bundled/breckenridge/v1/chapter-8-the-last-directive.mission-v1.json';
const SCENARIOS_PATH = 'tests/fixtures/mission/v1/chapter-8-last-directive-scenarios.fixture.json';
const PACKAGE_PATH = 'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json';
const PREDECESSOR_PATH = 'packages/bundled/breckenridge/v1/open-orders-3-before-the-lamps-go-out.mission-v1.json';
const SOURCE_PATH = 'docs/source/Directive_Ashes_of_Peace_Campaign_v0.2.md';
const SOURCE_ID = 'chapter-8-the-last-directive';
const SUCCESSOR_ID = 'epilogue-the-terms-we-keep';
const PACKAGE_VERSION = '0.3.0-pre-alpha.1';
const LEGACY_KEYS = ['missionGraph', 'objectivesReveal', 'objectiveCompletionRules', 'introText', 'directorNotes'];
const INITIAL_SPOILER_PATTERN = /three-node|quorum|hecate relay|lacuna|annex six node|all known nodes|lantern extinguished|ashes outcome/i;

function readJson(path) {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
}

const definition = readJson(DEFINITION_PATH);
const scenarios = readJson(SCENARIOS_PATH);
const packageData = readJson(PACKAGE_PATH);
const predecessor = readJson(PREDECESSOR_PATH);
const source = fs.readFileSync(SOURCE_PATH, 'utf8');
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
const knownDefinitions = [...priorDefinitionPaths.map(readJson), definition];

assert.deepEqual(definition.packageBinding, {
    packageId: packageData.manifest.id,
    packageVersion: PACKAGE_VERSION,
    sourceId: SOURCE_ID,
});
assert.equal(definition.id, 'mission.chapter-8-the-last-directive');
assert.equal(predecessor.transitions?.[0]?.target?.id, SOURCE_ID);
assert.equal(definition.transitions?.[0]?.target?.id, SUCCESSOR_ID);
assert.match(source, /## 22\. Chapter 8: The Last Directive/);

const questTemplates = Array.isArray(packageData.questTemplates)
    ? packageData.questTemplates.flatMap((collection) => collection?.templates || [])
    : packageData.questTemplates?.templates || [];
const quest = questTemplates.find((template) => template.id === SOURCE_ID);
assert.ok(quest, 'Chapter 8 must bind to the exact package quest');
assert.deepEqual(quest.missionGraph, {}, 'legacy Chapter 8 graph remains empty migration input');
assert.equal(questTemplates.some((template) => template.id === SUCCESSOR_ID), true);

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
assert.equal(definition.objectives.length, 5);
assert.deepEqual(definition.objectives.map((objective) => objective.id), [
    'objective.chapter8.command',
    'objective.chapter8.mesh',
    'objective.chapter8.weapons',
    'objective.chapter8.core',
    'objective.chapter8.civilians',
]);
assert.equal(definition.objectives.every((objective) => objective.class === 'required'), true);
assert.equal(definition.facts.length, 5);
assert.equal(definition.facts.every((fact) => fact.visibility === 'discoverable' && fact.initiallyTrue === true), true);
assert.equal(definition.reportRoutes.length, 5);
assert.equal(definition.reportRoutes.every((route) => route.deliveryRequirement === 'required'), true);
assert.equal(definition.reportRoutes.every((route) => route.urgency === 'urgent'), true);
assert.equal(definition.events.length, 5);
assert.equal(definition.outcomes.length, 6);
assert.equal(definition.evidencePolicies.length, 16);
assert.equal(definition.outcomeDimensions.length, 5);
assert.equal(definition.terminalDispositions.length, 5);
assert.equal(definition.clocks.length, 0, 'causal pressure cannot become a synthetic timer');

const initialState = createMissionState({ definition, branchId: 'scenario.initial' });
assert.deepEqual(initialState.knownFacts, []);
assert.equal(Object.values(initialState.objectives).every((objective) => objective.visibility === 'visible'), true);
assert.equal(Object.values(initialState.objectives).every((objective) => objective.state === 'available'), true);
const initialVisibleText = [definition.playerText, ...definition.objectives.map((objective) => objective.playerText)];
assert.equal(INITIAL_SPOILER_PATTERN.test(JSON.stringify(initialVisibleText)), false);
assert.equal(/first|then|next|after completing|step [1-5]/i.test(JSON.stringify(initialVisibleText)), false, 'parallel fronts cannot imply a fixed order');

const planPolicy = definition.evidencePolicies.find((policy) => policy.id === 'policy.chapter8.command-plan');
assert.deepEqual(planPolicy?.sourceRoles, ['user']);
assert.match(planPolicy.interpretation.guidance, /own language|free-form/i);
for (const requiredIdea of ['priorit', 'trusted', 'rules of engagement', 'movement', 'responsibilit', 'unilateral']) {
    assert.match(planPolicy.interpretation.guidance.toLowerCase(), new RegExp(requiredIdea));
}
assert.match(planPolicy.interpretation.exclusions.join(' '), /stop the network|generic|vague/i);

for (const front of ['command', 'mesh', 'weapons', 'core', 'civilians']) {
    const eventId = `event.chapter8.${front}-report-complete`;
    const factId = `fact.chapter8.${front}-account`;
    const resultId = `outcome.chapter8.${front}-result`;
    const eventPolicy = definition.evidencePolicies.find((policy) => policy.id === `policy.chapter8.${front}-report`);
    const resultPolicy = definition.evidencePolicies.find((policy) => policy.id === `policy.chapter8.${front}-result`);
    const disclosurePolicy = definition.evidencePolicies.find((policy) => policy.id === `policy.chapter8.${front}-disclosed`);
    assert.equal(eventPolicy?.targetId, eventId, front);
    assert.equal(eventPolicy?.sourceRoles?.includes('user'), false, front);
    assert.equal(resultPolicy?.targetId, resultId, front);
    assert.equal(resultPolicy?.sourceRoles?.includes('user'), false, front);
    assert.match(JSON.stringify(resultPolicy?.when), new RegExp(eventId.replaceAll('.', '\\.')));
    assert.equal(disclosurePolicy?.targetId, factId, front);
    assert.match(JSON.stringify(disclosurePolicy?.when), new RegExp(eventId.replaceAll('.', '\\.')));
    assert.equal(definition.reportRoutes.filter((route) => route.factId === factId).length, 1, front);
}

assert.equal(definition.entryCapabilities.length, 14);
assert.equal(definition.entryCapabilities.some((capability) => /Cardassian Logistics Index/i.test(JSON.stringify(capability))), false);
assert.equal(definition.entryCapabilities.some((capability) => capability.id === 'capability.chapter8.cross-isolation-protocol'), true);
assert.deepEqual(validateMissionEntryCapabilitySources({ definition, definitions: knownDefinitions }), { ok: true, errors: [] });

const firstCapability = definition.entryCapabilities[0];
const capabilityState = createMissionState({
    definition,
    branchId: 'scenario.capability-only',
    entryContext: {
        kind: 'directive.missionEntryContext.v1',
        capabilities: [{
            id: firstCapability.id,
            sourceRunId: 'mission-run.capability-source',
            sourceDefinitionId: firstCapability.source.definitionId,
            sourceDefinitionVersion: firstCapability.source.definitionVersion,
            dimensions: firstCapability.source.requirements.map((requirement) => ({
                id: requirement.dimensionId,
                value: requirement.in[0],
            })),
        }],
    },
});
assert.equal(evaluateMissionPredicate(
    { capabilityAvailable: firstCapability.id },
    missionStateContext(definition, capabilityState),
).value, true);
assert.equal(Object.values(capabilityState.objectives).every((objective) => objective.state === 'available'), true);
assert.equal(capabilityState.status, 'active', 'an earned capability cannot auto-complete the finale');

assert.equal(scenarios.kind, 'directive.ashesV1Chapter8Scenarios.v1');
assert.equal(scenarios.definitionId, definition.id);
assert.deepEqual(scenarios.scenarios.map((scenario) => scenario.id), [
    'lantern-extinguished',
    'peace-at-cost-nonlinear-quorum',
    'starfleet-imposed-order',
    'compact-imposed-order',
    'fractured-survival',
    'ashes',
    'failed-core-does-not-end-other-fronts',
    'plan-alone-does-not-close',
    'fronts-before-plan-leave-command-open',
    'result-without-disclosure-does-not-resolve',
    'assistant-cannot-issue-player-plan',
    'user-cannot-self-certify-front',
    'stale-proposal',
    'wrong-swipe-proposal',
    'hallucinated-policy-proposal',
]);

function sourceForGroup(scenarioId, claims, index, revision) {
    const role = claims[0].sourceRole;
    assert.equal(claims.every((claim) => claim.sourceRole === role), true, `${scenarioId}: mixed-role claim group`);
    const selectedSwipeId = role === 'assistant' ? `swipe.${index + 1}` : null;
    return {
        messageId: `source.${scenarioId}.${index + 1}`,
        branchId: `branch.${scenarioId}`,
        accepted: true,
        selectedSwipeId,
        textHash: createHash('sha256').update(`${scenarioId}:${index}:${claims.map((claim) => claim.claimId).join('|')}`).digest('hex'),
        role,
        acceptedAtRevision: revision,
    };
}

function runScenario(scenario) {
    const branchId = `branch.${scenario.id}`;
    let state = createMissionState({ definition, branchId });
    const rejectedReasonCodes = [];
    let acceptedClaimCount = 0;
    const groups = [
        ...(scenario.sequence || []).map((fragmentId) => {
            const fragment = scenarios.fragments?.[fragmentId];
            assert.equal(Array.isArray(fragment), true, `${scenario.id}: unknown fragment ${fragmentId}`);
            return fragment;
        }),
        ...(scenario.steps || []).map((step) => [step]),
    ];
    for (const [index, claims] of groups.entries()) {
        const source = sourceForGroup(scenario.id, claims, index, state.revision);
        const baseRevisionOffset = claims[0].baseRevisionOffset || 0;
        const proposal = {
            kind: 'directive.missionEvidenceProposal.v1',
            branchId,
            missionId: definition.id,
            baseRevision: state.revision + baseRevisionOffset,
            providerConfidence: 0.99,
            claims: claims.map((step) => ({
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
            })),
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
    assert.equal(result.state.transitionReceipt?.target?.id || null, expected.transitionTargetId || null, scenario.id);
}

assert.equal(
    scenarios.scenarios.find((scenario) => scenario.id === 'peace-at-cost-nonlinear-quorum')
        .sequence[0],
    'core-quorum',
    'the fixture proves that core work may settle before the formal command plan and other fronts',
);

console.log('Ashes V1 Chapter 8 mission tests passed.');
