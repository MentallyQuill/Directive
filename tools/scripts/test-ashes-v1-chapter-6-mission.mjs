import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

import { validateMissionDefinition } from '../../src/mission/v1/mission-contracts.mjs';
import { validateMissionEvidenceProposal } from '../../src/mission/v1/evidence-contracts.mjs';
import { reduceMissionEvidence } from '../../src/mission/v1/mission-reducer.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';

const DEFINITION_PATH = 'packages/bundled/breckenridge/v1/chapter-6-the-cost-of-knowing.mission-v1.json';
const SCENARIOS_PATH = 'tests/fixtures/mission/v1/chapter-6-cost-of-knowing-scenarios.fixture.json';
const PACKAGE_PATH = 'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json';
const PREDECESSOR_PATH = 'packages/bundled/breckenridge/v1/open-orders-2-what-survives.mission-v1.json';
const PACKAGE_ID = 'directive:campaign-package:breckenridge-ashes-of-peace';
const PACKAGE_VERSION = '0.3.0-pre-alpha.1';
const SOURCE_ID = 'chapter-6-the-cost-of-knowing';
const INITIAL_SPOILER_PATTERN = /eighty-three|left the node active|monitored local|without warrant|introduced current|rourke.*warn|superior.*continued|false recall|unauthorized purge|defense and evacuation|nightfall model|hidden objective|unknown objective|\b\d+%/i;
const LEGACY_KEYS = new Set([
    'progressModel', 'initialProgress', 'completionThreshold', 'phases', 'phaseId',
    'outcomeFlags', 'pressures', 'pressureIds', 'revelations', 'systemicResolution',
]);

assert.equal(fs.existsSync(DEFINITION_PATH), true, `Chapter 6 V1 definition is required at ${DEFINITION_PATH}`);

const definition = JSON.parse(fs.readFileSync(DEFINITION_PATH, 'utf8'));
const scenarios = JSON.parse(fs.readFileSync(SCENARIOS_PATH, 'utf8'));
const packageData = JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'));
const predecessor = JSON.parse(fs.readFileSync(PREDECESSOR_PATH, 'utf8'));
const validation = validateMissionDefinition(definition);
assert.equal(validation.ok, true, validation.errors.join('\n'));
assert.deepEqual(definition.packageBinding, { packageId: PACKAGE_ID, packageVersion: PACKAGE_VERSION, sourceId: SOURCE_ID });
assert.equal(definition.id, 'mission.chapter-6-the-cost-of-knowing');
assert.equal(predecessor.transitions?.[0]?.target?.id, SOURCE_ID);
assert.equal(definition.transitions?.[0]?.target?.id, 'chapter-7-a-peace-of-their-own');

const questTemplates = Array.isArray(packageData.questTemplates)
    ? packageData.questTemplates.flatMap((collection) => collection?.templates || [])
    : packageData.questTemplates?.templates || [];
const quest = questTemplates.find((template) => template.id === SOURCE_ID);
assert.ok(quest, 'Chapter 6 must bind to the exact package quest');
assert.deepEqual(quest.missionGraph, {}, 'legacy Chapter 6 mission graph remains empty migration input');
assert.equal(questTemplates.some((template) => template.id === definition.transitions?.[0]?.target?.id), true);

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
assert.deepEqual(definition.clocks, [], 'Chapter 6 has no authored player-known failure deadline');
assert.equal(definition.objectives.length, 3);
assert.deepEqual(definition.objectives.map((objective) => objective.id), [
    'objective.chapter6.command-network',
    'objective.chapter6.farwatch-truth',
    'objective.chapter6.evidence-authority',
]);
assert.equal(definition.objectives.every((objective) => objective.class === 'required'), true);
assert.equal(definition.reportRoutes.length, 2, 'eight revelations collapse into two aggregate reports');
assert.equal(definition.outcomeDimensions.length, 4, 'persistent consequences project through four concise dimensions');
for (const factId of [
    'fact.chapter6.farwatch-operational-account',
    'fact.chapter6.authenticated-pathway-nightfall-risk',
]) {
    assert.equal(definition.reportRoutes.filter((route) => route.factId === factId).length, 1, factId);
    assert.equal(definition.evidencePolicies.filter((policy) => policy.claimType === 'factDisclosed' && policy.targetId === factId).length, 1, factId);
}

const initialState = createMissionState({ definition, branchId: 'scenario.initial' });
assert.deepEqual(initialState.knownFacts, ['fact.chapter6.classified-confrontation']);
assert.equal(initialState.objectives['objective.chapter6.command-network'].visibility, 'visible');
assert.equal(initialState.objectives['objective.chapter6.farwatch-truth'].visibility, 'visible');
assert.equal(initialState.objectives['objective.chapter6.evidence-authority'].visibility, 'visible');
const initialVisibleText = [definition.playerText, ...definition.facts.filter((fact) => fact.visibility === 'known').map((fact) => fact.playerText), ...definition.objectives.map((objective) => objective.playerText)];
assert.equal(INITIAL_SPOILER_PATTERN.test(JSON.stringify(initialVisibleText)), false);

assert.equal(scenarios.kind, 'directive.ashesV1Chapter6Scenarios.v1');
assert.equal(scenarios.definitionId, definition.id);
assert.deepEqual(scenarios.scenarios.map((scenario) => scenario.id), [
    'accountable-preservation',
    'controlled-secrecy',
    'public-rupture',
    'evidence-lost-before-knowledge',
    'evidence-lost-after-informed-choice',
    'operational-rupture',
    'responsible-mixed-handoff',
    'non-linear-world-results-before-reports',
    'choices-alone-do-not-close',
    'evidence-choice-before-account-report',
    'crisis-alone-does-not-settle-network',
    'network-result-before-crisis',
    'premature-account-report',
    'premature-nightfall-report',
    'assistant-cannot-set-rourke-boundary',
    'user-cannot-self-certify-world-result',
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
    for (const factId of expected.knownFactsExcludes || []) {
        assert.equal(result.state.knownFacts.includes(factId), false, `${scenario.id}:${factId}`);
    }
    assert.equal(result.state.transitionReceipt?.target?.id || null, expected.transitionTargetId || null, scenario.id);
}

assert.equal(
    scenarios.scenarios.find((scenario) => scenario.id === 'evidence-lost-before-knowledge')
        .expected.objectiveDispositions['objective.chapter6.evidence-authority'],
    'completedWithCost',
    'early archive loss is cost rather than player failure',
);

console.log('Ashes V1 Chapter 6 mission tests passed.');
