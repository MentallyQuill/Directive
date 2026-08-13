import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createMissionInterpretationCandidatePacket } from '../../src/mission/v1/interpretation-candidates.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';

const definition = JSON.parse(fs.readFileSync(
    'packages/bundled/breckenridge/v1/prelude-a-ship-underway.mission-v1.json',
    'utf8',
));
const initialState = createMissionState({ definition, branchId: 'save.alpha' });
const initial = createMissionInterpretationCandidatePacket({ definition, state: initialState });

assert.equal(initial.kind, 'directive.missionInterpretationCandidates.v1');
assert.equal(initial.missionId, definition.id);
assert.equal(initial.definitionVersion, definition.version);
assert.equal(initial.branchId, 'save.alpha');
assert.equal(initial.baseRevision, 0);
assert.equal(initial.candidates.length, 4, 'only currently eligible policies enter the opening model envelope');
assert.deepEqual(
    initial.candidates.map((candidate) => candidate.id),
    [...initial.candidates.map((candidate) => candidate.id)].sort(),
);
assert.equal(initial.candidates.some((candidate) => candidate.claimType === 'worldFactEstablished'), false);
assert.equal(initial.candidates.some((candidate) => candidate.claimType === 'timeAdvanced'), false);
assert.equal(initial.candidates.some((candidate) => candidate.sourceSlots.includes('runtime')), false);
assert.equal(initial.candidates.some((candidate) => candidate.sourceSlots.includes('adjudicator')), false);
assert.equal(
    initial.candidates.some((candidate) => candidate.id === 'policy.hesperus.rescue-risk-decision'),
    false,
    'predicate-ineligible evidence must not be sent to the model',
);
assert.deepEqual(
    initial.candidates.find((candidate) => candidate.id === 'policy.prelude.command-handover-completed')?.sourceSlots,
    ['previousAssistant'],
);

const serialized = JSON.stringify(initial);
for (const forbidden of ['objectives', 'closeWhen', 'transitions', 'mustNotReveal', 'hiddenCount', 'reportRoutes']) {
    assert.equal(serialized.includes(forbidden), false, `candidate packet leaked ${forbidden}`);
}
for (const candidate of initial.candidates) {
    assert.ok(candidate.guidance.length > 0, candidate.id);
    assert.ok(['explicit', 'clearOutcome'].includes(candidate.evidenceStandard), candidate.id);
    assert.equal(Object.hasOwn(candidate, 'when'), false, candidate.id);
    assert.equal(Object.hasOwn(candidate, 'playerText'), false, candidate.id);
}

const reordered = createMissionInterpretationCandidatePacket({
    definition: {
        ...definition,
        evidencePolicies: [...definition.evidencePolicies].reverse(),
    },
    state: initialState,
});
assert.deepEqual(reordered, initial);

const progressedState = structuredClone(initialState);
progressedState.knownFacts.push('fact.hesperus.distress-established');
progressedState.knownFacts.push('fact.hesperus.passenger-risk');
progressedState.events.push('event.prelude.command-handover-completed');
progressedState.outcomes['outcome.hesperus.rescue-risk-decision'] = 'saferPlan';
const progressed = createMissionInterpretationCandidatePacket({ definition, state: progressedState });
assert.equal(progressed.candidates.some((candidate) => candidate.id === 'policy.hesperus.distress-disclosed'), false);
assert.equal(progressed.candidates.some((candidate) => candidate.id === 'policy.prelude.command-handover-completed'), false);
const rescueDecision = progressed.candidates.find((candidate) => candidate.id === 'policy.hesperus.rescue-risk-decision');
assert.deepEqual(rescueDecision?.sourceSlots, ['currentPlayer']);
assert.equal(rescueDecision.currentValue, 'saferPlan');
assert.equal(rescueDecision.values.some((entry) => entry.value === 'saferPlan'), false);

console.log('V1 mission interpretation candidate tests passed.');
