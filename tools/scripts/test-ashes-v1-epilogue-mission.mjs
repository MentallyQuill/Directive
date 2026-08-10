import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

import { validateMissionEntryCapabilitySources } from '../../src/mission/v1/mission-entry-capabilities.mjs';
import { validateMissionEvidenceProposal } from '../../src/mission/v1/evidence-contracts.mjs';
import { reduceMissionEvidence } from '../../src/mission/v1/mission-reducer.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
import { getBundledCampaignPackageRef } from '../../src/packages/bundled-package-registry.mjs';

const DEFINITION_PATH = 'packages/bundled/breckenridge/v1/epilogue-the-terms-we-keep.mission-v1.json';
const SCENARIOS_PATH = 'tests/fixtures/mission/v1/epilogue-terms-we-keep-scenarios.fixture.json';
const PACKAGE_PATH = 'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json';
const PREDECESSOR_PATH = 'packages/bundled/breckenridge/v1/chapter-8-the-last-directive.mission-v1.json';
const SOURCE_PATH = 'docs/source/Directive_Ashes_of_Peace_Campaign_v0.2.md';
const SOURCE_ID = 'epilogue-the-terms-we-keep';
const COMPLETION_PHASE_ID = 'ashes-authored-conclusion';
const PACKAGE_VERSION = '0.3.0-pre-alpha.1';
const LEGACY_KEYS = ['missionGraph', 'objectivesReveal', 'objectiveCompletionRules', 'introText', 'directorNotes'];
const INITIAL_MENU_PATTERN = /dissolved|sunset charter|joint command|criminal proceedings|classified custody|treated as suspects|complete truth remains classified|accountable peace|contested aftermath/i;

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
    'chapter-8-the-last-directive',
].map((slug) => `packages/bundled/breckenridge/v1/${slug}.mission-v1.json`);
const knownDefinitions = [...priorDefinitionPaths.map(readJson), definition];

assert.deepEqual(definition.packageBinding, {
    packageId: packageData.manifest.id,
    packageVersion: PACKAGE_VERSION,
    sourceId: SOURCE_ID,
});
assert.equal(definition.id, 'mission.epilogue-the-terms-we-keep');
assert.equal(predecessor.transitions?.[0]?.target?.id, SOURCE_ID);
assert.equal(definition.transitions?.[0]?.target?.kind, 'phase');
assert.equal(definition.transitions?.[0]?.target?.id, COMPLETION_PHASE_ID);
assert.match(source, /## 23\. Epilogue Mission: The Terms We Keep/);

const questTemplates = Array.isArray(packageData.questTemplates)
    ? packageData.questTemplates.flatMap((collection) => collection?.templates || [])
    : packageData.questTemplates?.templates || [];
const quest = questTemplates.find((template) => template.id === SOURCE_ID);
assert.ok(quest, 'Epilogue must bind to the exact package quest');
assert.deepEqual(quest.missionGraph, {}, 'legacy epilogue graph remains empty migration input');
const bundledRef = getBundledCampaignPackageRef(definition.packageBinding.packageId);
assert.equal(bundledRef.missionDefinitionPaths.at(-1), DEFINITION_PATH, 'epilogue must be the thirteenth registered V1 journey definition');

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
assert.deepEqual(definition.objectives.map((objective) => objective.id), [
    'objective.epilogue.aftermath',
    'objective.epilogue.authority',
    'objective.epilogue.accountability',
    'objective.epilogue.command',
]);
assert.equal(definition.objectives.every((objective) => objective.class === 'required'), true);
assert.equal(definition.objectives.every((objective) => JSON.stringify(objective.supportedDispositions) === '["completed"]'), true);
assert.equal(definition.facts.length, 3);
assert.equal(definition.facts.every((fact) => fact.visibility === 'discoverable' && fact.initiallyTrue === true), true);
assert.equal(definition.events.length, 3);
assert.equal(definition.events.every((event) => event.playerVisibility === 'hidden'), true);
assert.equal(definition.outcomes.length, 9);
assert.equal(definition.evidencePolicies.length, 15);
assert.equal(definition.reportRoutes.length, 3);
assert.equal(definition.reportRoutes.every((route) => route.deliveryRequirement === 'required'), true);
assert.equal(definition.outcomeDimensions.length, 7);
assert.equal(definition.terminalDispositions.length, 3);
assert.equal(definition.clocks.length, 0, 'the epilogue cannot invent a countdown');

const initialState = createMissionState({ definition, branchId: 'scenario.epilogue.initial' });
assert.deepEqual(initialState.knownFacts, []);
assert.equal(Object.values(initialState.objectives).every((objective) => objective.visibility === 'visible'), true);
assert.equal(Object.values(initialState.objectives).every((objective) => objective.state === 'available'), true);
const initialVisibleText = [
    definition.playerText,
    ...definition.objectives.map((objective) => ({
        title: objective.playerText.title,
        summary: objective.playerText.summary,
    })),
];
assert.equal(INITIAL_MENU_PATTERN.test(JSON.stringify(initialVisibleText)), false, 'initial copy cannot become a prescribed settlement menu');
assert.equal(/first|then|next|after completing|step [1-4]/i.test(JSON.stringify(initialVisibleText)), false, 'epilogue responsibilities cannot imply a fixed order');
assert.equal(/kieran|priya|bronn|rowan|miriam|imani/i.test(JSON.stringify(definition.objectives)), false, 'crew resolutions cannot become one objective per officer');

for (const policyId of ['policy.epilogue.authority-position', 'policy.epilogue.accountability-position']) {
    const policy = definition.evidencePolicies.find((candidate) => candidate.id === policyId);
    assert.deepEqual(policy?.sourceRoles, ['user']);
    assert.match(policy?.interpretation?.guidance || '', /own language|free-form|across several turns/i);
    assert.match((policy?.interpretation?.exclusions || []).join(' '), /question|brainstorm|assistant|not.*position/i);
}

for (const report of ['aftermath', 'settlement', 'command']) {
    const eventId = `event.epilogue.${report === 'settlement' ? 'settlement-record' : report === 'command' ? 'command-review' : 'aftermath-report'}-complete`;
    const factId = `fact.epilogue.${report === 'settlement' ? 'settlement-account' : report === 'command' ? 'command-review' : 'aftermath-record'}`;
    const eventPolicy = definition.evidencePolicies.find((policy) => policy.id === `policy.epilogue.${report}-report`);
    const disclosurePolicy = definition.evidencePolicies.find((policy) => policy.id === `policy.epilogue.${report}-disclosed`);
    assert.equal(eventPolicy?.targetId, eventId, report);
    assert.equal(eventPolicy?.sourceRoles?.includes('user'), false, report);
    assert.match(JSON.stringify(eventPolicy?.when), /"not"/, `${report}: aggregate event must be one-shot`);
    assert.equal(disclosurePolicy?.targetId, factId, report);
    assert.match(JSON.stringify(disclosurePolicy?.when), /"factKnown"/, `${report}: disclosure must be one-shot`);
    assert.equal(definition.reportRoutes.filter((route) => route.factId === factId).length, 1, report);
}

for (const result of ['compact-status', 'defense-control', 'farwatch-accountability', 'lantern-custody', 'cardassian-participation', 'public-narrative']) {
    const policy = definition.evidencePolicies.find((candidate) => candidate.id === `policy.epilogue.${result}`);
    assert.equal(policy?.sourceRoles?.includes('user'), false, result);
    assert.match(JSON.stringify(policy?.when), /event\.epilogue\.settlement-record-complete/, result);
    assert.match(JSON.stringify(policy?.when), /pending/, `${result}: settlement result must be one-shot`);
}
const commandResultPolicy = definition.evidencePolicies.find((policy) => policy.id === 'policy.epilogue.command-future');
assert.match(JSON.stringify(commandResultPolicy?.when), /event\.epilogue\.command-review-complete/);
assert.match(JSON.stringify(commandResultPolicy?.when), /pending/);

assert.equal(definition.entryCapabilities.length, 3);
assert.deepEqual(definition.entryCapabilities.map((capability) => capability.id), [
    'capability.epilogue.nightfall-aftermath-record',
    'capability.epilogue.farwatch-evidence-package',
    'capability.epilogue.provisional-regional-accord',
]);
assert.equal(definition.entryCapabilities[0].source.requirements.length, 5);
assert.deepEqual(validateMissionEntryCapabilitySources({ definition, definitions: knownDefinitions }), { ok: true, errors: [] });

assert.equal(scenarios.kind, 'directive.ashesV1EpilogueScenarios.v1');
assert.equal(scenarios.definitionId, definition.id);
assert.deepEqual(scenarios.scenarios.map((scenario) => scenario.id), [
    'accountable-peace',
    'managed-settlement-nonlinear',
    'contested-aftermath',
    'positions-alone-do-not-close',
    'command-review-before-settlement',
    'settlement-before-prerequisites-rejected',
    'settlement-missing-accountability-rejected',
    'settlement-without-disclosure-does-not-resolve',
    'assistant-cannot-state-player-authority-position',
    'user-cannot-self-certify-settlement',
    'settlement-cannot-be-rewritten',
    'command-review-cannot-be-rewritten',
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
        const proposal = {
            kind: 'directive.missionEvidenceProposal.v1',
            branchId,
            missionId: definition.id,
            baseRevision: state.revision + (claims[0].baseRevisionOffset || 0),
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
    scenarios.scenarios.find((scenario) => scenario.id === 'managed-settlement-nonlinear').sequence[1],
    'command-continued',
    'the fixture proves Whitaker command review can settle before the formal political settlement',
);

console.log('Ashes V1 epilogue mission tests passed.');
