import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

import { validateMissionDefinition } from '../../src/mission/v1/mission-contracts.mjs';
import { validateMissionEvidenceProposal } from '../../src/mission/v1/evidence-contracts.mjs';
import { reduceMissionEvidence } from '../../src/mission/v1/mission-reducer.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';

const DEFINITION_PATH = 'packages/bundled/breckenridge/v1/open-orders-1-work-worth-doing.mission-v1.json';
const SCENARIOS_PATH = 'tests/fixtures/mission/v1/open-orders-1-scenarios.fixture.json';
const PACKAGE_ID = 'directive:campaign-package:breckenridge-ashes-of-peace';
const PACKAGE_VERSION = '0.3.0-pre-alpha.1';
const SOURCE_ID = 'open-orders-1-work-worth-doing';
const INITIAL_SPOILER_PATTERN = /pale lantern|spy network|sabotage|compromised pilot|hidden objective|unknown objective|\b\d+%/i;
const LEGACY_KEYS = new Set([
    'progressModel',
    'initialProgress',
    'completionThreshold',
    'phases',
    'phaseId',
    'outcomeFlags',
    'pressures',
    'pressureIds',
    'sideMissionTemplates',
    'openOrdersProgress',
]);

assert.equal(fs.existsSync(DEFINITION_PATH), true, `Open Orders I V1 definition is required at ${DEFINITION_PATH}`);

const definition = JSON.parse(fs.readFileSync(DEFINITION_PATH, 'utf8'));
const scenarios = JSON.parse(fs.readFileSync(SCENARIOS_PATH, 'utf8'));
const validation = validateMissionDefinition(definition);
assert.equal(validation.ok, true, validation.errors.join('\n'));
assert.deepEqual(definition.packageBinding, {
    packageId: PACKAGE_ID,
    packageVersion: PACKAGE_VERSION,
    sourceId: SOURCE_ID,
});
assert.equal(definition.id, 'mission.open-orders-1-work-worth-doing');
assert.equal(definition.transitions?.[0]?.target?.id, 'chapter-3-dead-letters');

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
assert.deepEqual(definition.clocks, [], 'Open Orders I has no authored player-known failure deadline');

const objectiveIndex = new Map(definition.objectives.map((objective) => [objective.id, objective]));
assert.deepEqual([...objectiveIndex.keys()], [
    'objective.open-orders1.conclusion',
    'objective.open-orders1.long-repair',
    'objective.open-orders1.borrowed-wings',
    'objective.open-orders1.quiet-channels',
]);
assert.equal(objectiveIndex.get('objective.open-orders1.conclusion').class, 'required');
for (const objectiveId of [
    'objective.open-orders1.long-repair',
    'objective.open-orders1.borrowed-wings',
    'objective.open-orders1.quiet-channels',
]) {
    assert.equal(objectiveIndex.get(objectiveId).activatedAs, 'optional');
    assert.equal(JSON.stringify(definition.closeWhen).includes(objectiveId), false);
}

assert.equal(definition.reportRoutes.length, 3, 'one aggregate assessment report per optional assignment');
for (const factId of [
    'fact.open-orders1.long-repair-assessment',
    'fact.open-orders1.borrowed-wings-assessment',
    'fact.open-orders1.quiet-channels-assessment',
]) {
    assert.equal(definition.reportRoutes.filter((route) => route.factId === factId).length, 1, factId);
    assert.equal(
        definition.evidencePolicies.filter((policy) => policy.claimType === 'factDisclosed' && policy.targetId === factId).length,
        1,
        factId,
    );
}

const initialState = createMissionState({ definition, branchId: 'scenario.initial' });
assert.deepEqual(initialState.knownFacts, ['fact.open-orders1.opportunities']);
for (const objectiveId of objectiveIndex.keys()) {
    assert.equal(initialState.objectives[objectiveId].visibility, 'visible', objectiveId);
}
const initialVisibleText = [definition.playerText, ...definition.objectives.map((objective) => objective.playerText)];
assert.equal(initialVisibleText.length, 5, 'one interval objective plus three deliberate optional opportunities');
assert.equal(INITIAL_SPOILER_PATTERN.test(JSON.stringify(initialVisibleText)), false);

assert.equal(scenarios.kind, 'directive.ashesV1OpenOrders1Scenarios.v1');
assert.equal(scenarios.definitionId, definition.id);
assert.deepEqual(scenarios.scenarios.map((scenario) => scenario.id), [
    'two-assignment-normal',
    'broad-coverage-with-delegation',
    'three-direct-overextension',
    'limited-mixed-results',
    'informed-assignment-failure',
    'early-departure',
    'all-declined-departure',
    'non-linear-assignment-order',
    'selection-alone-does-not-close',
    'delegation-order-does-not-earn-asset',
    'premature-assessment-report',
    'unsupported-player-world-result',
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
    const result = runScenario(scenario);
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
    for (const factId of expected.knownFactsExcludes || []) {
        assert.equal(result.state.knownFacts.includes(factId), false, `${scenario.id}:${factId}`);
    }
    assert.equal(result.state.transitionReceipt?.target?.id || null, expected.transitionTargetId || null, scenario.id);
}

console.log('Ashes V1 Open Orders I mission tests passed.');
