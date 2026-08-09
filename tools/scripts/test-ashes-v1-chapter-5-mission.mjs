import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

import { validateMissionEvidenceProposal } from '../../src/mission/v1/evidence-contracts.mjs';
import { validateMissionDefinition } from '../../src/mission/v1/mission-contracts.mjs';
import { reduceMissionEvidence } from '../../src/mission/v1/mission-reducer.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
import { createMissionPlayerProjection } from '../../src/mission/v1/player-projection.mjs';

const DEFINITION_PATH = 'packages/bundled/breckenridge/v1/chapter-5-old-lessons.mission-v1.json';
const SCENARIOS_PATH = 'tests/fixtures/mission/v1/chapter-5-old-lessons-scenarios.fixture.json';
const PACKAGE_PATH = 'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json';
const PREDECESSOR_PATH = 'packages/bundled/breckenridge/v1/chapter-4-the-colony-that-stayed.mission-v1.json';
const SOURCE_PATH = 'docs/source/Directive_Ashes_of_Peace_Campaign_v0.2.md';
const INITIAL_SPOILER_PATTERN = /sigma-?4.*(?:target|objective)|authentication core|maintenance drone|pale lantern|models? (?:starfleet )?doctrine|holt(?:'s)? cell|portable interface|meridian.*operator|hidden objective|unknown objective|\b\d+%|minutes? remaining/i;
const LEGACY_SHAPE_PATTERN = /progressModel|initialProgress|pressure\.|revelation\.|event-template|systemicResolution|maxObjectiveProgressPerTurn/i;

assert.equal(fs.existsSync(DEFINITION_PATH), true, `missing ${DEFINITION_PATH}`);

const definition = JSON.parse(fs.readFileSync(DEFINITION_PATH, 'utf8'));
const scenarios = JSON.parse(fs.readFileSync(SCENARIOS_PATH, 'utf8'));
const packageData = JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'));
const predecessor = JSON.parse(fs.readFileSync(PREDECESSOR_PATH, 'utf8'));
const source = fs.readFileSync(SOURCE_PATH, 'utf8');
const quest = packageData.questTemplates.templates.find((candidate) => candidate.id === 'chapter-5-old-lessons');

const contract = validateMissionDefinition(definition);
assert.equal(contract.ok, true, contract.errors.join('\n'));
assert.equal(definition.kind, 'directive.missionDefinition.v1');
assert.equal(definition.id, 'mission.chapter-5-old-lessons');
assert.equal(definition.packageBinding.packageId, packageData.manifest.id);
assert.equal(definition.packageBinding.packageVersion, packageData.manifest.version);
assert.equal(definition.packageBinding.sourceId, quest.id);
assert.equal(predecessor.transitions[0].target.id, quest.id);
assert.deepEqual(quest.missionGraph, {}, 'legacy Old Lessons has no mission graph to import');
assert.equal(definition.transitions.length, 1);
assert.equal(definition.transitions[0].target.id, 'open-orders-2-what-survives');
assert.equal(packageData.questTemplates.templates.some((candidate) => candidate.id === 'open-orders-2-what-survives'), false);
assert.equal(source.includes('## 18. Open Orders II: What Survives'), true, 'V1-only successor is bound to the authored quiet interval');
assert.equal(definition.clocks.length, 0, 'tactical pressure is not a synthetic clock');
assert.equal(LEGACY_SHAPE_PATTERN.test(JSON.stringify(definition)), false, 'V1 cannot embed legacy progress or pressure state');

assert.deepEqual(definition.objectives.map((objective) => [objective.id, objective.class]), [
    ['objective.chapter5.safety', 'required'],
    ['objective.chapter5.operation', 'required'],
    ['objective.chapter5.understanding', 'required'],
]);
assert.deepEqual(definition.facts.map((fact) => fact.id), [
    'fact.chapter5.orison-crisis',
    'fact.chapter5.concentration-and-model-gap',
    'fact.chapter5.sigma-target-and-doctrine-model',
    'fact.chapter5.holt-initiation-and-autonomous-escalation',
]);
assert.equal(definition.reportRoutes.length, 3, 'one aggregate report per discoverable fact');
assert.equal(definition.events.length, 3, 'three causal evidence events remain hidden');
assert.equal(definition.events.every((event) => event.playerVisibility === 'hidden'), true);
assert.equal(definition.outcomes.every((outcome) => outcome.playerVisibility === 'hidden'), true);
assert.deepEqual(definition.outcomeDimensions.map((dimension) => dimension.id), [
    'dimension.chapter5.orison',
    'dimension.chapter5.authentication',
    'dimension.chapter5.operator',
    'dimension.chapter5.command',
]);

const initialState = createMissionState({ definition, branchId: 'scenario.initial' });
const initialProjection = createMissionPlayerProjection({ definition, state: initialState });
assert.deepEqual(initialState.knownFacts, ['fact.chapter5.orison-crisis']);
assert.equal(initialProjection.objectives.length, 3);
assert.equal(INITIAL_SPOILER_PATTERN.test(JSON.stringify(initialProjection)), false);
assert.equal(INITIAL_SPOILER_PATTERN.test(JSON.stringify(definition.playerText)), false);

assert.equal(scenarios.kind, 'directive.ashesV1Chapter5Scenarios.v1');
assert.equal(scenarios.definitionId, definition.id);
assert.deepEqual(scenarios.scenarios.map((scenario) => scenario.id), [
    'multi-front-success',
    'lives-saved-core-lost-before-knowledge',
    'core-saved-at-cost',
    'cascade-forward',
    'partial-containment',
    'responsible-handoff',
    'informed-destruction-without-record',
    'non-linear-front-order-no-command-posture',
    'clean-success-dismissive-posture',
    'choices-alone-do-not-resolve',
    'sigma-choice-before-target-known',
    'command-posture-before-model-gap',
    'assistant-owned-sigma-choice',
    'player-declared-traffic-result',
    'player-declared-operator-result',
    'premature-target-report',
    'stale-proposal',
    'wrong-swipe-proposal',
    'hallucinated-controller-policy',
]);

function selectedSwipe(sourceRecord) {
    return sourceRecord.selectedSwipeId || null;
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
        const sourceRecord = sourceForStep(scenario.id, step, index, state.revision);
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
                    messageId: sourceRecord.messageId,
                    swipeId: Object.hasOwn(step, 'sourceSwipeOverride')
                        ? step.sourceSwipeOverride
                        : selectedSwipe(sourceRecord),
                    textHash: sourceRecord.textHash,
                },
            }],
        };
        const evidence = validateMissionEvidenceProposal({
            definition,
            state,
            proposal,
            resolveSourceRef: (ref) => ref?.messageId === sourceRecord.messageId ? sourceRecord : null,
        });
        acceptedClaimCount += evidence.acceptedClaims.length;
        rejectedReasonCodes.push(...evidence.rejectedClaims.map((claim) => claim.reasonCode));
        if (evidence.acceptedClaims.length > 0) {
            state = reduceMissionEvidence({
                definition,
                state,
                acceptedClaims: evidence.acceptedClaims,
                sourceContribution: { id: `contribution.${scenario.id}.${index + 1}` },
            }).state;
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

console.log('Ashes V1 Chapter 5 mission tests passed.');
