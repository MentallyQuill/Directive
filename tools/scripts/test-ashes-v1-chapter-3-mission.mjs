import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

import { validateMissionEvidenceProposal } from '../../src/mission/v1/evidence-contracts.mjs';
import { validateMissionDefinition } from '../../src/mission/v1/mission-contracts.mjs';
import { reduceMissionEvidence } from '../../src/mission/v1/mission-reducer.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
import { createMissionPlayerProjection } from '../../src/mission/v1/player-projection.mjs';

const DEFINITION_PATH = 'packages/bundled/breckenridge/v1/chapter-3-dead-letters.mission-v1.json';
const SCENARIOS_PATH = 'tests/fixtures/mission/v1/chapter-3-dead-letters-scenarios.fixture.json';
const PACKAGE_PATH = 'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json';
const PREDECESSOR_PATH = 'packages/bundled/breckenridge/v1/open-orders-1-work-worth-doing.mission-v1.json';
const INITIAL_SPOILER_PATTERN = /dominion|pale lantern|private (?:archive|communication)|distributed|predictive|starfleet intelligence|farwatch|holt|rourke|demeris|mira solenn|wayward sun|compromised salvager|hidden objective|unknown objective|\b\d+%/i;
const LEGACY_SHAPE_PATTERN = /progressModel|initialProgress|pressure\.|revelation\.|event-template|systemicResolution|maxObjectiveProgressPerTurn/i;

assert.equal(fs.existsSync(DEFINITION_PATH), true, `missing ${DEFINITION_PATH}`);

const definition = JSON.parse(fs.readFileSync(DEFINITION_PATH, 'utf8'));
const scenarios = JSON.parse(fs.readFileSync(SCENARIOS_PATH, 'utf8'));
const packageData = JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'));
const predecessor = JSON.parse(fs.readFileSync(PREDECESSOR_PATH, 'utf8'));
const quest = packageData.questTemplates.templates.find((candidate) => candidate.id === 'chapter-3-dead-letters');
const chapter4 = packageData.questTemplates.templates.find((candidate) => candidate.id === 'chapter-4-the-colony-that-stayed');

const contract = validateMissionDefinition(definition);
assert.equal(contract.ok, true, contract.errors.join('\n'));
assert.equal(definition.kind, 'directive.missionDefinition.v1');
assert.equal(definition.id, 'mission.chapter-3-dead-letters');
assert.equal(definition.packageBinding.packageId, packageData.manifest.id);
assert.equal(definition.packageBinding.packageVersion, packageData.manifest.version);
assert.equal(definition.packageBinding.sourceId, quest.id);
assert.equal(predecessor.transitions[0].target.id, quest.id);
assert.deepEqual(quest.missionGraph, {}, 'legacy Dead Letters has no mission graph to import');
assert.ok(chapter4, 'Chapter 4 package target exists');
assert.equal(definition.transitions.length, 1);
assert.equal(definition.transitions[0].target.id, chapter4.id);
assert.equal(definition.clocks.length, 0, 'legacy pressures are not synthetic clocks');
assert.equal(LEGACY_SHAPE_PATTERN.test(JSON.stringify(definition)), false, 'V1 cannot embed legacy progress or pressure state');

assert.deepEqual(definition.objectives.map((objective) => [objective.id, objective.class]), [
    ['objective.chapter3.access', 'required'],
    ['objective.chapter3.evidence', 'required'],
    ['objective.chapter3.custody', 'required'],
]);
assert.deepEqual(definition.facts.map((fact) => fact.id), [
    'fact.chapter3.hecate-route',
    'fact.chapter3.relay-archive-character',
    'fact.chapter3.network-architecture-picture',
    'fact.chapter3.access-history-and-demeris-route',
]);
assert.equal(definition.reportRoutes.length, 3, 'one aggregate report per discoverable fact');
assert.deepEqual(definition.outcomeDimensions.map((dimension) => dimension.id), [
    'dimension.chapter3.access',
    'dimension.chapter3.evidence',
    'dimension.chapter3.relay',
    'dimension.chapter3.archive',
]);

const initialState = createMissionState({ definition, branchId: 'scenario.initial' });
const initialProjection = createMissionPlayerProjection({ definition, state: initialState });
assert.deepEqual(initialState.knownFacts, ['fact.chapter3.hecate-route']);
assert.equal(initialProjection.objectives.length, 3);
assert.equal(INITIAL_SPOILER_PATTERN.test(JSON.stringify(initialProjection)), false);
assert.equal(INITIAL_SPOILER_PATTERN.test(JSON.stringify(definition.playerText)), false);

assert.equal(scenarios.kind, 'directive.ashesV1Chapter3Scenarios.v1');
assert.equal(scenarios.definitionId, definition.id);
assert.deepEqual(scenarios.scenarios.map((scenario) => scenario.id), [
    'accountable-isolation',
    'bounded-observation',
    'destroyed-after-copy-broad-release',
    'privacy-first-destruction-alternate-route',
    'responsible-withdrawal',
    'lost-or-seized-after-discovery',
    'forced-off-partial-alternate',
    'loss-before-informed-choice',
    'non-linear-custody-before-full-analysis',
    'lead-before-full-analysis',
    'choice-alone-does-not-resolve',
    'site-contact-plan-only',
    'archive-policy-before-discovery',
    'unsupported-player-relay-result',
    'premature-architecture-report',
    'premature-demeris-report',
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

function selectedSwipe(source) {
    return source.selectedSwipeId || null;
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

const pairedBranchId = 'branch.paired-withdrawal';
let pairedState = createMissionState({ definition, branchId: pairedBranchId });
const pairedSource = {
    messageId: 'source.paired-withdrawal.player',
    branchId: pairedBranchId,
    accepted: true,
    selectedSwipeId: null,
    textHash: createHash('sha256').update('paired-withdrawal').digest('hex'),
    role: 'user',
    acceptedAtRevision: pairedState.revision,
};
const pairedProposal = {
    kind: 'directive.missionEvidenceProposal.v1',
    branchId: pairedBranchId,
    missionId: definition.id,
    baseRevision: pairedState.revision,
    providerConfidence: 0.99,
    claims: [
        {
            claimId: 'claim.chapter3.paired-withdrawal-access',
            policyId: 'policy.chapter3.withdraw-responsibly',
            claimType: 'decisionRecorded',
            targetId: 'outcome.chapter3.access-result',
            value: 'withdrewResponsibly',
            sourceRef: {
                messageId: pairedSource.messageId,
                swipeId: null,
                textHash: pairedSource.textHash,
            },
        },
        {
            claimId: 'claim.chapter3.paired-withdrawal-relay',
            policyId: 'policy.chapter3.withdraw-relay-decision',
            claimType: 'decisionRecorded',
            targetId: 'outcome.chapter3.relay-decision',
            value: 'withdraw',
            sourceRef: {
                messageId: pairedSource.messageId,
                swipeId: null,
                textHash: pairedSource.textHash,
            },
        },
    ],
};
const pairedEvidence = validateMissionEvidenceProposal({
    definition,
    state: pairedState,
    proposal: pairedProposal,
    resolveSourceRef: (ref) => ref?.messageId === pairedSource.messageId ? pairedSource : null,
});
assert.equal(pairedEvidence.acceptedClaims.length, 2, 'one explicit withdrawal message can record both coupled decisions');
assert.deepEqual(pairedEvidence.rejectedClaims, []);
pairedState = reduceMissionEvidence({
    definition,
    state: pairedState,
    acceptedClaims: pairedEvidence.acceptedClaims,
    sourceContribution: { id: 'contribution.paired-withdrawal' },
}).state;
assert.equal(pairedState.outcomes['outcome.chapter3.access-result'], 'withdrewResponsibly');
assert.equal(pairedState.outcomes['outcome.chapter3.relay-decision'], 'withdraw');

console.log('Ashes V1 Chapter 3 mission tests passed.');
