import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

import { validateMissionDefinition } from '../../src/mission/v1/mission-contracts.mjs';
import { validateMissionEvidenceProposal } from '../../src/mission/v1/evidence-contracts.mjs';
import { reduceMissionEvidence } from '../../src/mission/v1/mission-reducer.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';

const DEFINITION_PATH = 'packages/bundled/breckenridge/v1/prelude-a-ship-underway.mission-v1.json';
const SCENARIOS_PATH = 'tests/fixtures/mission/v1/prelude-hesperus-scenarios.fixture.json';
const PACKAGE_ID = 'directive:campaign-package:breckenridge-ashes-of-peace';
const PACKAGE_VERSION = '0.3.0-pre-alpha.1';
const SOURCE_ID = 'prelude-a-ship-underway';
const SPOILER_PATTERN = /fraud|falsif|corrupt|inspection|hidden objective|unknown objective/i;

const definition = JSON.parse(fs.readFileSync(DEFINITION_PATH, 'utf8'));
const scenarios = JSON.parse(fs.readFileSync(SCENARIOS_PATH, 'utf8'));
const validation = validateMissionDefinition(definition);
assert.equal(validation.ok, true, validation.errors.join('\n'));
assert.deepEqual(definition.packageBinding, {
    packageId: PACKAGE_ID,
    packageVersion: PACKAGE_VERSION,
    sourceId: SOURCE_ID,
});
assert.equal(definition.id, 'mission.prelude-a-ship-underway');
assert.equal(JSON.stringify(definition).includes('progressModel'), false);
assert.equal(JSON.stringify(definition).includes('initialProgress'), false);
assert.equal(JSON.stringify(definition).includes('completionThreshold'), false);

const objectiveIndex = new Map(definition.objectives.map((objective) => [objective.id, objective]));
assert.deepEqual([...objectiveIndex.keys()], [
    'objective.prelude.command-handover',
    'objective.prelude.staff-readiness',
    'objective.prelude.hesperus-rescue',
    'objective.prelude.final-readiness-arrival',
    'objective.prelude.hesperus-accountability',
]);
assert.deepEqual(
    definition.objectives.slice(0, 4).map((objective) => (
        objective.class === 'conditional' ? objective.activatedAs : objective.class
    )),
    ['required', 'required', 'required', 'required'],
);
assert.equal(objectiveIndex.get('objective.prelude.hesperus-accountability').activatedAs, 'optional');

const initialState = createMissionState({ definition, branchId: 'scenario.initial' });
assert.deepEqual(initialState.packageBinding, definition.packageBinding);
assert.equal(initialState.objectives['objective.prelude.command-handover'].state, 'available');
assert.equal(initialState.objectives['objective.prelude.staff-readiness'].state, 'available');
assert.equal(initialState.objectives['objective.prelude.hesperus-rescue'].visibility, 'hidden');
assert.equal(initialState.objectives['objective.prelude.hesperus-accountability'].visibility, 'hidden');
assert.equal(initialState.clocks['clock.hesperus-life-support'].state, 'notStarted');
assert.equal(initialState.clocks['clock.hesperus-life-support'].visibility, 'hidden');
const initialVisibleText = [definition.playerText]
    .concat(definition.objectives
        .filter((objective) => initialState.objectives[objective.id]?.visibility === 'visible')
        .map((objective) => objective.playerText));
assert.equal(SPOILER_PATTERN.test(JSON.stringify(initialVisibleText)), false);
assert.equal(initialVisibleText.length, 3, 'mission text plus two parallel visible objectives');

const factIds = new Set(definition.facts.map((fact) => fact.id));
for (const factId of [
    'fact.hesperus.distress-established',
    'fact.hesperus.passenger-risk',
    'fact.hesperus.injector-limit',
    'fact.hesperus.record-inconsistency',
    'fact.hesperus.record-discrepancy',
    'fact.hesperus.record-falsified',
    'fact.hesperus.owner-attribution-supported',
]) {
    assert.equal(factIds.has(factId), true, `missing Hesperus fact ${factId}`);
    assert.equal(definition.reportRoutes.some((route) => route.factId === factId), true, `missing report route ${factId}`);
    assert.equal(definition.evidencePolicies.some((policy) => (
        policy.claimType === 'factDisclosed' && policy.targetId === factId
    )), true, `missing disclosure policy ${factId}`);
}
assert.equal(definition.transitions.length, 1);
assert.equal(definition.transitions[0].target.id, 'chapter-1-the-empty-convoy');

assert.equal(scenarios.kind, 'directive.ashesV1PreludeScenarios.v1');
assert.equal(scenarios.definitionId, definition.id);
assert.deepEqual(scenarios.scenarios.map((scenario) => scenario.id), [
    'rescue-success-no-discovery',
    'rescue-success-with-cost-no-discovery',
    'discrepancy-known-prudent-handoff',
    'confirmed-record-action-proportionate',
    'confirmed-record-knowing-inaction',
    'informed-rescue-failure',
    'omitted-report-rescue-failure',
    'reversed-command-objective-order',
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

function sourceRefForStep(source, step) {
    return {
        messageId: source.messageId,
        swipeId: step.sourceSwipeOverride ?? source.selectedSwipeId,
        textHash: step.sourceHashOverride ?? source.textHash,
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
                sourceRef: sourceRefForStep(source, step),
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
    for (const factId of expected.knownFactsIncludes || []) {
        assert.equal(result.state.knownFacts.includes(factId), true, `${scenario.id}:${factId}`);
    }
    for (const factId of expected.knownFactsExcludes || []) {
        assert.equal(result.state.knownFacts.includes(factId), false, `${scenario.id}:${factId}`);
    }
    if (expected.transitionTargetId) {
        assert.equal(result.state.transitionReceipt?.target?.id, expected.transitionTargetId, scenario.id);
    } else {
        assert.equal(result.state.transitionReceipt, null, scenario.id);
    }
}

const baseline = scenarioResults.get('rescue-success-no-discovery').state;
const reversed = scenarioResults.get('reversed-command-objective-order').state;
assert.deepEqual(reversed.objectives, baseline.objectives);
assert.deepEqual(reversed.outcomeDimensions, baseline.outcomeDimensions);
assert.equal(reversed.terminalDisposition, baseline.terminalDisposition);

console.log('Ashes V1 Prelude mission tests passed.');
