import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

import { validateMissionDefinition } from '../../src/mission/v1/mission-contracts.mjs';
import { validateMissionEvidenceProposal } from '../../src/mission/v1/evidence-contracts.mjs';
import { reduceMissionEvidence } from '../../src/mission/v1/mission-reducer.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';

const DEFINITION_PATH = 'packages/bundled/breckenridge/v1/chapter-2-false-colors.mission-v1.json';
const SCENARIOS_PATH = 'tests/fixtures/mission/v1/chapter-2-false-colors-scenarios.fixture.json';
const PACKAGE_ID = 'directive:campaign-package:breckenridge-ashes-of-peace';
const PACKAGE_VERSION = '0.3.0-pre-alpha.1';
const SOURCE_ID = 'chapter-2-false-colors';
const INITIAL_SPOILER_PATTERN = /cargo tug|holt|pale lantern|hecate|command-authentication access|hidden objective|unknown objective/i;
const LEGACY_KEYS = new Set([
    'progressModel',
    'initialProgress',
    'completionThreshold',
    'phases',
    'phaseId',
    'outcomeFlags',
    'pressures',
    'pressureIds',
]);

assert.equal(
    fs.existsSync(DEFINITION_PATH),
    true,
    `Chapter 2 V1 definition is required at ${DEFINITION_PATH}`,
);

const definition = JSON.parse(fs.readFileSync(DEFINITION_PATH, 'utf8'));
const scenarios = JSON.parse(fs.readFileSync(SCENARIOS_PATH, 'utf8'));
const validation = validateMissionDefinition(definition);
assert.equal(validation.ok, true, validation.errors.join('\n'));
assert.deepEqual(definition.packageBinding, {
    packageId: PACKAGE_ID,
    packageVersion: PACKAGE_VERSION,
    sourceId: SOURCE_ID,
});
assert.equal(definition.id, 'mission.chapter-2-false-colors');

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
for (const key of LEGACY_KEYS) {
    assert.equal(definitionKeys.has(key), false, `V1 definition must not contain legacy key ${key}`);
}
assert.deepEqual(definition.clocks, [], 'Chapter 2 has pressure but no authored player-known deadline');

const objectiveIndex = new Map(definition.objectives.map((objective) => [objective.id, objective]));
assert.deepEqual([...objectiveIndex.keys()], [
    'objective.chapter2.medical',
    'objective.chapter2.attack-account',
    'objective.chapter2.verification-security',
    'objective.chapter2.joint-framework',
]);
assert.equal(objectiveIndex.get('objective.chapter2.medical').class, 'required');
assert.equal(objectiveIndex.get('objective.chapter2.attack-account').class, 'required');
assert.equal(objectiveIndex.get('objective.chapter2.verification-security').activatedAs, 'required');
assert.equal(objectiveIndex.get('objective.chapter2.joint-framework').activatedAs, 'optional');
assert.equal(JSON.stringify(definition.closeWhen).includes('objective.chapter2.joint-framework'), false);

const conditionalRequired = objectiveIndex.get('objective.chapter2.verification-security');
assert.equal(conditionalRequired.activationRoute?.mandatory, true);
assert.equal(conditionalRequired.activationRoute?.playerVisible, true);
assert.equal(
    definition.reportRoutes.some((route) => (
        route.factId === conditionalRequired.activationRoute.factId
        && route.deliveryRequirement === 'required'
    )),
    true,
);

const discoverableFacts = [
    'fact.chapter2.verification-access-dispute',
    'fact.chapter2.independent-evidence-picture',
    'fact.chapter2.counterfeit-route-picture',
];
assert.equal(definition.reportRoutes.length, 3, 'Chapter 2 must use three aggregate reports, not legacy scene spam');
for (const factId of discoverableFacts) {
    assert.equal(
        definition.evidencePolicies.filter((policy) => (
            policy.claimType === 'factDisclosed' && policy.targetId === factId
        )).length,
        1,
        `${factId} needs one disclosure authority`,
    );
    assert.equal(
        definition.reportRoutes.filter((route) => route.factId === factId).length,
        1,
        `${factId} needs one aggregate crew-report route`,
    );
}

const initialState = createMissionState({ definition, branchId: 'scenario.initial' });
assert.deepEqual(initialState.knownFacts, ['fact.chapter2.false-colors-crisis']);
assert.equal(initialState.objectives['objective.chapter2.medical'].visibility, 'visible');
assert.equal(initialState.objectives['objective.chapter2.attack-account'].visibility, 'visible');
assert.equal(initialState.objectives['objective.chapter2.verification-security'].visibility, 'hidden');
assert.equal(initialState.objectives['objective.chapter2.joint-framework'].visibility, 'hidden');
const initialVisibleText = [definition.playerText].concat(
    definition.objectives
        .filter((objective) => initialState.objectives[objective.id]?.visibility === 'visible')
        .map((objective) => objective.playerText),
);
assert.equal(initialVisibleText.length, 3, 'mission text plus two immediate responsibilities');
assert.equal(INITIAL_SPOILER_PATTERN.test(JSON.stringify(initialVisibleText)), false);

assert.equal(scenarios.kind, 'directive.ashesV1Chapter2Scenarios.v1');
assert.equal(scenarios.definitionId, definition.id);
assert.deepEqual(scenarios.scenarios.map((scenario) => scenario.id), [
    'joint-legitimacy',
    'credible-unilateral-vindication',
    'managed-ambiguity',
    'responsible-handoff',
    'political-rupture-forward',
    'undiscovered-content-does-not-close',
    'non-linear-core-order',
    'premature-independent-report',
    'unsupported-player-self-declared-success',
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
            providerConfidence: step.providerConfidence ?? 0.99,
            claims: [{
                claimId: step.claimId,
                policyId: step.policyId,
                claimType: step.claimType,
                targetId: step.targetId,
                ...(Object.hasOwn(step, 'value') ? { value: step.value } : {}),
                sourceRef: {
                    messageId: source.messageId,
                    swipeId: step.sourceSwipeOverride ?? source.selectedSwipeId,
                    textHash: step.sourceHashOverride ?? source.textHash,
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

const scenarioResults = new Map();
for (const scenario of scenarios.scenarios) {
    const result = runScenario(scenario);
    scenarioResults.set(scenario.id, result);
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

const joint = scenarioResults.get('joint-legitimacy').state;
const nonLinear = scenarioResults.get('non-linear-core-order').state;
assert.deepEqual(nonLinear.objectives, joint.objectives, 'causally valid objective order is not a phase rail');
assert.deepEqual(nonLinear.outcomeDimensions, joint.outcomeDimensions);
assert.equal(nonLinear.terminalDisposition, joint.terminalDisposition);

console.log('Ashes V1 Chapter 2 mission tests passed.');
