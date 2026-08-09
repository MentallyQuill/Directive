import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

import { validateMissionEvidenceProposal } from '../../src/mission/v1/evidence-contracts.mjs';
import { validateMissionDefinition } from '../../src/mission/v1/mission-contracts.mjs';
import { reduceMissionEvidence } from '../../src/mission/v1/mission-reducer.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
import { createMissionPlayerProjection } from '../../src/mission/v1/player-projection.mjs';

const DEFINITION_PATH = 'packages/bundled/breckenridge/v1/chapter-4-the-colony-that-stayed.mission-v1.json';
const SCENARIOS_PATH = 'tests/fixtures/mission/v1/chapter-4-colony-that-stayed-scenarios.fixture.json';
const PACKAGE_PATH = 'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json';
const PREDECESSOR_PATH = 'packages/bundled/breckenridge/v1/chapter-3-dead-letters.mission-v1.json';
const INITIAL_SPOILER_PATTERN = /pale lantern|diverted evacuation|forged clearance|freighter|two (?:people|crew|members).*(?:died|death)|compact security|another access device|orison|holt|hidden interface|hidden objective|unknown objective|\b\d+%/i;
const LEGACY_SHAPE_PATTERN = /progressModel|initialProgress|pressure\.|revelation\.|event-template|systemicResolution|maxObjectiveProgressPerTurn/i;

assert.equal(fs.existsSync(DEFINITION_PATH), true, `missing ${DEFINITION_PATH}`);

const definition = JSON.parse(fs.readFileSync(DEFINITION_PATH, 'utf8'));
const scenarios = JSON.parse(fs.readFileSync(SCENARIOS_PATH, 'utf8'));
const packageData = JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'));
const predecessor = JSON.parse(fs.readFileSync(PREDECESSOR_PATH, 'utf8'));
const quest = packageData.questTemplates.templates.find((candidate) => candidate.id === 'chapter-4-the-colony-that-stayed');
const chapter5 = packageData.questTemplates.templates.find((candidate) => candidate.id === 'chapter-5-old-lessons');

const contract = validateMissionDefinition(definition);
assert.equal(contract.ok, true, contract.errors.join('\n'));
assert.equal(definition.kind, 'directive.missionDefinition.v1');
assert.equal(definition.id, 'mission.chapter-4-the-colony-that-stayed');
assert.equal(definition.packageBinding.packageId, packageData.manifest.id);
assert.equal(definition.packageBinding.packageVersion, packageData.manifest.version);
assert.equal(definition.packageBinding.sourceId, quest.id);
assert.equal(predecessor.transitions[0].target.id, quest.id);
assert.deepEqual(quest.missionGraph, {}, 'legacy Colony has no mission graph to import');
assert.ok(chapter5, 'Old Lessons package target exists');
assert.equal(definition.transitions.length, 1);
assert.equal(definition.transitions[0].target.id, chapter5.id);
assert.equal(definition.clocks.length, 0, 'political pressure is not a synthetic clock');
assert.equal(LEGACY_SHAPE_PATTERN.test(JSON.stringify(definition)), false, 'V1 cannot embed legacy progress or pressure state');

assert.deepEqual(definition.objectives.map((objective) => [objective.id, objective.class]), [
    ['objective.chapter4.process', 'required'],
    ['objective.chapter4.truth', 'required'],
    ['objective.chapter4.accountability', 'required'],
]);
assert.deepEqual(definition.facts.map((fact) => fact.id), [
    'fact.chapter4.competing-claims',
    'fact.chapter4.survival-and-evacuation-record',
    'fact.chapter4.solenn-use-benefit-and-harm',
    'fact.chapter4.continuing-access-and-orison-route',
]);
assert.equal(definition.reportRoutes.length, 3, 'one aggregate report per discoverable fact');
assert.deepEqual(definition.outcomeDimensions.map((dimension) => dimension.id), [
    'dimension.chapter4.process',
    'dimension.chapter4.evidence',
    'dimension.chapter4.solenn',
    'dimension.chapter4.interface',
]);

const initialState = createMissionState({ definition, branchId: 'scenario.initial' });
const initialProjection = createMissionPlayerProjection({ definition, state: initialState });
assert.deepEqual(initialState.knownFacts, ['fact.chapter4.competing-claims']);
assert.equal(initialProjection.objectives.length, 3);
assert.equal(INITIAL_SPOILER_PATTERN.test(JSON.stringify(initialProjection)), false);
assert.equal(INITIAL_SPOILER_PATTERN.test(JSON.stringify(definition.playerText)), false);

assert.equal(scenarios.kind, 'directive.ashesV1Chapter4Scenarios.v1');
assert.equal(scenarios.definitionId, definition.id);
assert.deepEqual(scenarios.scenarios.map((scenario) => scenario.id), [
    'shared-accountability',
    'lawful-local-resolution',
    'starfleet-seizure',
    'covert-truth-at-cost',
    'responsible-handoff',
    'process-collapse-before-final-choice',
    'flight-and-loss-after-informed-choice',
    'informed-destruction-without-record',
    'non-linear-evidence-order',
    'choice-alone-does-not-resolve',
    'process-order-only',
    'final-choice-before-knowledge',
    'assistant-owned-solenn-choice',
    'player-declared-interface-result',
    'premature-continuing-access-report',
    'stale-proposal',
    'wrong-swipe-proposal',
    'hallucinated-controller-policy',
]);

function selectedSwipe(source) {
    return source.selectedSwipeId || null;
}

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
                    swipeId: Object.hasOwn(step, 'sourceSwipeOverride')
                        ? step.sourceSwipeOverride
                        : selectedSwipe(source),
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
        acceptedClaimCount += evidence.acceptedClaims.length;
        rejectedReasonCodes.push(...evidence.rejectedClaims.map((claim) => claim.reasonCode));
        if (evidence.acceptedClaims.length > 0) {
            try {
                state = reduceMissionEvidence({
                    definition,
                    state,
                    acceptedClaims: evidence.acceptedClaims,
                    sourceContribution: { id: `contribution.${scenario.id}.${index + 1}` },
                }).state;
            } catch (error) {
                throw new Error(`${scenario.id}:${step.claimId}: ${error.message}`, { cause: error });
            }
        }
    }
    return { state, acceptedClaimCount, rejectedReasonCodes };
}

for (const scenario of scenarios.scenarios) {
    const actual = runScenario(scenario);
    const expected = scenario.expected;
    assert.equal(actual.state.status, expected.status, `${scenario.id}:status`);
    assert.equal(actual.state.terminalDisposition, expected.terminalDisposition, `${scenario.id}:terminal disposition`);
    assert.equal(actual.acceptedClaimCount, expected.acceptedClaimCount, `${scenario.id}:accepted claim count`);
    assert.deepEqual(actual.rejectedReasonCodes, expected.rejectedReasonCodes, `${scenario.id}:rejections`);
    for (const [objectiveId, disposition] of Object.entries(expected.objectiveDispositions || {})) {
        assert.equal(actual.state.objectives[objectiveId]?.disposition, disposition, `${scenario.id}:${objectiveId}`);
    }
    for (const factId of expected.knownFactsExcludes || []) {
        assert.equal(actual.state.knownFacts.includes(factId), false, `${scenario.id}:${factId}`);
    }
    for (const [dimensionId, value] of Object.entries(expected.outcomeDimensions || {})) {
        assert.equal(actual.state.outcomeDimensions[dimensionId] ?? 'pending', value, `${scenario.id}:${dimensionId}`);
    }
    assert.equal(actual.state.transitionReceipt?.target?.id || null, expected.transitionTargetId || null, `${scenario.id}:transition`);
}

function validateBatch({ scenarioId, state, fragmentIds }) {
    const steps = fragmentIds.flatMap((fragmentId) => scenarios.fragments[fragmentId]);
    const source = sourceForStep(scenarioId, steps[0], 0, state.revision);
    const proposal = {
        kind: 'directive.missionEvidenceProposal.v1',
        branchId: state.branchId,
        missionId: definition.id,
        baseRevision: state.revision,
        providerConfidence: 0.99,
        claims: steps.map((step) => ({
            claimId: `batch.${scenarioId}.${step.claimId}`,
            policyId: step.policyId,
            claimType: step.claimType,
            targetId: step.targetId,
            ...(Object.hasOwn(step, 'value') ? { value: step.value } : {}),
            sourceRef: {
                messageId: source.messageId,
                swipeId: source.selectedSwipeId,
                textHash: source.textHash,
            },
        })),
    };
    return validateMissionEvidenceProposal({
        definition,
        state,
        proposal,
        resolveSourceRef: (ref) => ref?.messageId === source.messageId ? source : null,
    });
}

const withdrawalState = runScenario({
    id: 'same-scene-withdrawal-batch',
    sequence: ['process-withdraw-choice'],
}).state;
const withdrawalBatch = validateBatch({
    scenarioId: 'same-scene-withdrawal-batch',
    state: withdrawalState,
    fragmentIds: ['process-withdraw-result', 'solenn-handoff-result', 'interface-handoff-result'],
});
assert.equal(withdrawalBatch.acceptedClaims.length, 3, 'one observed handoff scene can settle all three authored results');
assert.deepEqual(withdrawalBatch.rejectedClaims, []);

const collapseState = runScenario({
    id: 'same-scene-collapse-batch',
    sequence: ['process-joint-choice'],
}).state;
const collapseBatch = validateBatch({
    scenarioId: 'same-scene-collapse-batch',
    state: collapseState,
    fragmentIds: ['process-collapse-result', 'solenn-escaped-result', 'interface-lost-result'],
});
assert.equal(collapseBatch.acceptedClaims.length, 3, 'one collapse scene can settle no-fault process, witness, and custody results');
assert.deepEqual(collapseBatch.rejectedClaims, []);

const informedChoiceState = runScenario({
    id: 'same-message-final-choices',
    sequence: [
        'process-joint-choice',
        'process-joint-result',
        'history-evidence',
        'solenn-evidence',
        'access-evidence',
        'route-direct',
    ],
}).state;
const informedChoiceBatch = validateBatch({
    scenarioId: 'same-message-final-choices',
    state: informedChoiceState,
    fragmentIds: ['solenn-restorative-choice', 'interface-shared-choice'],
});
assert.equal(informedChoiceBatch.acceptedClaims.length, 2, 'one player message can record both independent informed final choices');
assert.deepEqual(informedChoiceBatch.rejectedClaims, []);

console.log('Ashes V1 Chapter 4 mission tests passed.');
