import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

import { validateMissionDefinition } from '../../src/mission/v1/mission-contracts.mjs';
import { validateMissionEvidenceProposal } from '../../src/mission/v1/evidence-contracts.mjs';
import { reduceMissionEvidence } from '../../src/mission/v1/mission-reducer.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';

const DEFINITION_PATH = 'packages/bundled/breckenridge/v1/open-orders-3-before-the-lamps-go-out.mission-v1.json';
const SCENARIOS_PATH = 'tests/fixtures/mission/v1/open-orders-3-scenarios.fixture.json';
const PACKAGE_PATH = 'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json';
const PREDECESSOR_PATH = 'packages/bundled/breckenridge/v1/chapter-7-a-peace-of-their-own.mission-v1.json';
const PACKAGE_ID = 'directive:campaign-package:breckenridge-ashes-of-peace';
const PACKAGE_VERSION = '0.3.0-pre-alpha.1';
const SOURCE_ID = 'open-orders-3-before-the-lamps-go-out';
const SUCCESSOR_ID = 'chapter-8-the-last-directive';
const INITIAL_SPOILER_PATTERN = /thirty-second|multiple regional alerts|mutually exclusive orders|three active nodes|quorum|direct contact with voyager|pathfinder breakthrough|one cross.*consent|legal office.*malicious|hidden objective|unknown objective|\b\d+%/i;
const LEGACY_KEYS = new Set([
    'progressModel', 'initialProgress', 'completionThreshold', 'phases', 'phaseId',
    'outcomeFlags', 'pressures', 'pressureIds', 'sideMissionTemplates', 'openOrdersProgress',
]);

assert.equal(fs.existsSync(DEFINITION_PATH), true, `Open Orders III V1 definition is required at ${DEFINITION_PATH}`);

const definition = JSON.parse(fs.readFileSync(DEFINITION_PATH, 'utf8'));
const scenarios = JSON.parse(fs.readFileSync(SCENARIOS_PATH, 'utf8'));
const packageData = JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'));
const predecessor = JSON.parse(fs.readFileSync(PREDECESSOR_PATH, 'utf8'));
const validation = validateMissionDefinition(definition);
assert.equal(validation.ok, true, validation.errors.join('\n'));
assert.deepEqual(definition.packageBinding, { packageId: PACKAGE_ID, packageVersion: PACKAGE_VERSION, sourceId: SOURCE_ID });
assert.equal(definition.id, 'mission.open-orders-3-before-the-lamps-go-out');
assert.equal(predecessor.transitions?.[0]?.target?.id, SOURCE_ID);
assert.equal(definition.transitions?.[0]?.target?.id, SUCCESSOR_ID);

const questTemplates = Array.isArray(packageData.questTemplates)
    ? packageData.questTemplates.flatMap((collection) => collection?.templates || [])
    : packageData.questTemplates?.templates || [];
assert.equal(questTemplates.some((template) => template.id === SOURCE_ID), false, 'Open Orders III must not add a duplicate legacy quest row');
assert.equal(questTemplates.some((template) => template.id === SUCCESSOR_ID), true, 'Chapter 8 target must be package-authored');
for (const sideId of ['side-the-name-on-the-hull', 'side-a-signal-toward-home', 'side-two-signatures']) {
    const side = questTemplates.find((template) => template.id === sideId);
    assert.ok(side, `${sideId} legacy side-quest input is required`);
    assert.deepEqual(side.missionGraph, {}, `${sideId} must remain empty migration input`);
}

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
assert.deepEqual(definition.clocks, [], 'Open Orders III has no authored player-known failure deadline');
assert.equal(definition.facts.length, 5);
assert.equal(definition.events.length, 4);
assert.equal(definition.events.every((event) => event.playerVisibility === 'hidden'), true);
assert.equal(definition.outcomes.length, 7);
assert.equal(definition.evidencePolicies.length, 18);
assert.equal(definition.reportRoutes.length, 4);
assert.equal(definition.outcomeDimensions.length, 4);
assert.equal(definition.terminalDispositions.length, 5);

const objectiveIndex = new Map(definition.objectives.map((objective) => [objective.id, objective]));
assert.deepEqual([...objectiveIndex.keys()], [
    'objective.open-orders3.conclusion',
    'objective.open-orders3.name',
    'objective.open-orders3.signal',
    'objective.open-orders3.signatures',
]);
assert.equal(objectiveIndex.get('objective.open-orders3.conclusion').class, 'required');
for (const objectiveId of [
    'objective.open-orders3.name',
    'objective.open-orders3.signal',
    'objective.open-orders3.signatures',
]) {
    assert.equal(objectiveIndex.get(objectiveId).activatedAs, 'optional');
    assert.equal(JSON.stringify(definition.closeWhen).includes(objectiveId), false);
}

for (const factId of [
    'fact.open-orders3.name-assessment',
    'fact.open-orders3.signal-assessment',
    'fact.open-orders3.signatures-assessment',
    'fact.open-orders3.distributed-readiness',
]) {
    assert.equal(definition.reportRoutes.filter((route) => route.factId === factId).length, 1, factId);
    assert.equal(definition.evidencePolicies.filter((policy) => policy.claimType === 'factDisclosed' && policy.targetId === factId).length, 1, factId);
}

const initialState = createMissionState({ definition, branchId: 'scenario.initial' });
assert.deepEqual(initialState.knownFacts, ['fact.open-orders3.opportunities']);
for (const objectiveId of objectiveIndex.keys()) assert.equal(initialState.objectives[objectiveId].visibility, 'visible', objectiveId);
const initialVisibleText = [definition.playerText, ...definition.objectives.map((objective) => objective.playerText)];
assert.equal(initialVisibleText.length, 5);
assert.equal(INITIAL_SPOILER_PATTERN.test(JSON.stringify(initialVisibleText)), false);

assert.equal(scenarios.kind, 'directive.ashesV1OpenOrders3Scenarios.v1');
assert.equal(scenarios.definitionId, definition.id);
assert.deepEqual(scenarios.scenarios.map((scenario) => scenario.id), [
    'name-and-signal-normal',
    'name-and-signatures-normal',
    'signal-and-signatures-normal',
    'broad-coverage-with-delegation',
    'three-direct-overextension',
    'overextended-with-informed-failure',
    'limited-mixed-results',
    'informed-assignment-failure',
    'early-departure-after-readiness',
    'all-declined-departure',
    'decline-then-reconsider',
    'non-linear-assignment-order',
    'selection-alone-does-not-close',
    'delegation-does-not-earn-asset',
    'premature-assignment-report',
    'premature-assignment-result',
    'premature-readiness-disclosure',
    'conclusion-before-readiness-report',
    'assistant-cannot-set-engagement',
    'user-cannot-self-certify-result',
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
    assert.equal(result.state.transitionReceipt?.target?.id || null, expected.transitionTargetId || null, scenario.id);
    if (result.state.status === 'terminal') {
        assert.equal(result.state.knownFacts.includes('fact.open-orders3.distributed-readiness'), true, `${scenario.id}:terminal without readiness report`);
    }
}

console.log('Ashes V1 Open Orders III mission tests passed.');
