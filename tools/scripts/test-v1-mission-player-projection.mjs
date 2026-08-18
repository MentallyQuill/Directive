import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createMissionPlayerProjection } from '../../src/mission/v1/player-projection.mjs';
import { reduceMissionEvidence } from '../../src/mission/v1/mission-reducer.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';

const definition = JSON.parse(fs.readFileSync(
    'packages/bundled/breckenridge/v1/prelude-a-ship-underway.mission-v1.json',
    'utf8',
));
const initialState = createMissionState({ definition, branchId: 'save.projection' });
const initialSnapshot = structuredClone(initialState);
const initial = createMissionPlayerProjection({ definition, state: initialState });

assert.equal(initial.kind, 'directive.missionPlayerProjection.v1');
assert.equal(initial.missionId, definition.id);
assert.equal(initial.title, 'Prelude: A Ship Underway');
assert.equal(
    initial.summary,
    'Complete the command handover, establish a working command rhythm, and bring the Breckenridge to the Asterion Reach.',
);
assert.deepEqual(initial.objectives.map((objective) => objective.id), [
    'objective.prelude.command-handover',
    'objective.prelude.staff-readiness',
]);
assert.deepEqual(initial.progress, {
    requiredCompleted: 0,
    requiredTotal: 2,
    optionalCompleted: 0,
    optionalTotal: 0,
});
assert.deepEqual(initial.facts, []);
assert.equal(Object.hasOwn(initial, 'clocks'), false);
assert.deepEqual(initial.outcomeDimensions, []);
assert.equal(initial.terminal, null);
assert.doesNotMatch(JSON.stringify(initial), /Hesperus|Kieran/i);
assert.equal(/fraud|falsif|corrupt|inspection|unknown objective/i.test(JSON.stringify(initial)), false);
assert.deepEqual(initialState, initialSnapshot);

function claim(claimId, claimType, targetId, extra = {}) {
    return {
        claimId,
        policyId: extra.policyId || `policy.${claimId}`,
        claimType,
        targetId,
        evidenceKey: `evidence.${claimId}`,
        ...(Object.hasOwn(extra, 'value') ? { value: extra.value } : {}),
    };
}

const pokerInvitationKnown = reduceMissionEvidence({
    definition,
    state: initialState,
    acceptedClaims: [claim(
        'prelude-poker-invitation-disclosed',
        'factDisclosed',
        'fact.prelude.poker-invitation',
        { policyId: 'policy.prelude.poker-invitation-disclosed' },
    )],
}).state;
const pokerInvitationProjection = createMissionPlayerProjection({
    definition,
    state: pokerInvitationKnown,
});
assert.match(JSON.stringify(pokerInvitationProjection), /Kieran Vale has invited/i);

const distressKnown = reduceMissionEvidence({
    definition,
    state: initialState,
    acceptedClaims: [
        claim(
            'hesperus-distress-established',
            'worldFactEstablished',
            'fact.hesperus.distress-established',
            { policyId: 'policy.hesperus.distress-established' },
        ),
        claim(
            'hesperus-distress-disclosed',
            'factDisclosed',
            'fact.hesperus.distress-established',
            { policyId: 'policy.hesperus.distress-disclosed' },
        ),
    ],
}).state;
const distressProjection = createMissionPlayerProjection({ definition, state: distressKnown });
assert.equal(distressProjection.progress.requiredTotal, 3);
assert.equal(distressProjection.objectives.some((objective) => objective.id === 'objective.prelude.hesperus-rescue'), true);
assert.equal(Object.hasOwn(distressProjection, 'clocks'), false);

const riskKnown = reduceMissionEvidence({
    definition,
    state: distressKnown,
    acceptedClaims: [claim(
        'hesperus-passenger-risk-disclosed',
        'factDisclosed',
        'fact.hesperus.passenger-risk',
        { policyId: 'policy.hesperus.passenger-risk-disclosed' },
    )],
}).state;
const riskProjection = createMissionPlayerProjection({ definition, state: riskKnown });
assert.equal(Object.hasOwn(riskProjection, 'clocks'), false);
assert.equal(riskProjection.facts.some((fact) => fact.id === 'fact.hesperus.passenger-risk'), true);

const confirmedState = reduceMissionEvidence({
    definition,
    state: riskKnown,
    acceptedClaims: [claim(
        'hesperus-record-falsified-disclosed',
        'factDisclosed',
        'fact.hesperus.record-falsified',
        { policyId: 'policy.hesperus.record-falsified-disclosed' },
    )],
}).state;
const confirmed = createMissionPlayerProjection({ definition, state: confirmedState });
assert.equal(confirmed.progress.requiredTotal, riskProjection.progress.requiredTotal);
assert.equal(confirmed.progress.optionalTotal, 1);
assert.equal(confirmed.objectives.some((objective) => objective.id === 'objective.prelude.hesperus-accountability'), true);
assert.equal(confirmed.facts.some((fact) => fact.id === 'fact.hesperus.record-falsified'), true);

const serialized = JSON.stringify(confirmed);
for (const forbidden of [
    'worldFacts',
    'evidencePolicies',
    'reportRoutes',
    'mustNotReveal',
    'diagnostics',
    'activationWhen',
    'visibleWhen',
]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
}

const terminalState = structuredClone(confirmedState);
terminalState.status = 'terminal';
terminalState.terminalDisposition = 'primarySuccess';
terminalState.transitionReceipt = {
    kind: 'directive.missionTransitionReceipt.v1',
    transitionId: 'transition.prelude.chapter-1-empty-convoy',
    committedAtRevision: terminalState.revision,
    target: structuredClone(definition.transitions[0].target),
    packet: { mustNotReveal: ['hidden canary must not project'] },
};
const terminal = createMissionPlayerProjection({ definition, state: terminalState });
assert.equal(terminal.terminal.disposition, 'primarySuccess');
assert.equal(terminal.terminal.next.id, 'chapter-1-the-empty-convoy');
assert.equal(JSON.stringify(terminal).includes('hidden canary'), false);

console.log('V1 mission player projection tests passed.');
