import assert from 'node:assert/strict';

import {
    collectMissionPredicateRefs,
    evaluateMissionPredicate,
    validateMissionPredicate,
} from '../../src/mission/v1/predicate-evaluator.mjs';

const index = {
    facts: new Map([['fact.manifest-reconciled', { id: 'fact.manifest-reconciled' }]]),
    events: new Map([['event.survivors-transferred', { id: 'event.survivors-transferred' }]]),
    outcomes: new Map([['outcome.evidence-preserved', {
        id: 'outcome.evidence-preserved',
        allowedValues: ['unknown', 'yes', 'no'],
    }]]),
    objectives: new Map([['objective.account-crew', {
        id: 'objective.account-crew',
        supportedDispositions: ['handedOff'],
    }]]),
    clocks: new Map([['clock.life-support', { id: 'clock.life-support' }]]),
};

const predicate = {
    all: [
        { eventOccurred: 'event.survivors-transferred' },
        {
            any: [
                { factKnown: 'fact.manifest-reconciled' },
                { objectiveDisposition: { id: 'objective.account-crew', in: ['handedOff'] } },
            ],
        },
    ],
};
const context = {
    index,
    knownFacts: new Set(['fact.manifest-reconciled']),
    worldFacts: new Set(['fact.manifest-reconciled']),
    events: new Set(['event.survivors-transferred']),
    outcomes: new Map([['outcome.evidence-preserved', 'yes']]),
    objectives: new Map([['objective.account-crew', { state: 'terminal', disposition: 'handedOff' }]]),
    clocks: new Map([['clock.life-support', { state: 'running' }]]),
    missionStatus: 'active',
};

const evaluated = evaluateMissionPredicate(predicate, context);
assert.equal(evaluated.ok, true, evaluated.errors.join('\n'));
assert.equal(evaluated.value, true);
assert.equal(evaluated.reasons.some((reason) => reason.includes('event.survivors-transferred')), true);
assert.equal(evaluated.reasons.some((reason) => reason.includes('fact.manifest-reconciled')), true);

const shortCircuitContext = { ...context };
Object.defineProperty(shortCircuitContext, 'knownFacts', {
    get() {
        throw new Error('short-circuited branch was evaluated');
    },
});
assert.equal(
    evaluateMissionPredicate({ any: [true, { factKnown: 'fact.manifest-reconciled' }] }, shortCircuitContext).value,
    true,
);

for (const [label, candidate, expected] of [
    ['true constant', true, true],
    ['false constant', false, false],
    ['not', { not: false }, true],
    ['world fact', { worldFact: 'fact.manifest-reconciled' }, true],
    ['outcome equals', { outcomeIs: { id: 'outcome.evidence-preserved', equals: 'yes' } }, true],
    ['outcome in', { outcomeIs: { id: 'outcome.evidence-preserved', in: ['unknown', 'yes'] } }, true],
    ['objective state', { objectiveState: { id: 'objective.account-crew', in: ['terminal'] } }, true],
    ['objective disposition', { objectiveDisposition: { id: 'objective.account-crew', equals: 'handedOff' } }, true],
    ['clock state', { clockState: { id: 'clock.life-support', equals: 'running' } }, true],
    ['mission status', { missionStatus: { in: ['terminal', 'active'] } }, true],
    ['false conjunction', { all: [true, false] }, false],
]) {
    const result = evaluateMissionPredicate(candidate, context);
    assert.equal(result.ok, true, `${label}: ${result.errors.join('\n')}`);
    assert.equal(result.value, expected, label);
}

for (const [label, candidate, pattern] of [
    ['unknown operator', { modelDecides: 'anything' }, /unknown predicate operator/],
    ['mixed operators', { factKnown: 'fact.manifest-reconciled', eventOccurred: 'event.survivors-transferred' }, /exactly one predicate operator/],
    ['empty all', { all: [] }, /non-empty array/],
    ['malformed match', { outcomeIs: { id: 'outcome.evidence-preserved', equals: 'yes', in: ['yes'] } }, /exactly one of equals or in/],
    ['unknown fact', { factKnown: 'fact.unknown' }, /unknown fact/],
    ['unknown event', { eventOccurred: 'event.unknown' }, /unknown event/],
    ['unknown outcome', { outcomeIs: { id: 'outcome.unknown', equals: 'yes' } }, /unknown outcome/],
    ['unknown objective', { objectiveState: { id: 'objective.unknown', equals: 'terminal' } }, /unknown objective/],
    ['unknown clock', { clockState: { id: 'clock.unknown', equals: 'running' } }, /unknown clock/],
    ['invalid state', { objectiveState: { id: 'objective.account-crew', equals: 'done' } }, /unknown value/],
    ['mission status extra field', { missionStatus: { id: 'model-owned', equals: 'active' } }, /unknown match field/],
]) {
    const result = validateMissionPredicate(candidate, index);
    assert.equal(result.ok, false, label);
    assert.match(result.errors.join('\n'), pattern, label);
}

const invalidEvaluation = evaluateMissionPredicate({ modelDecides: 'anything' }, context);
assert.equal(invalidEvaluation.ok, false);
assert.equal(invalidEvaluation.value, false);
assert.match(invalidEvaluation.errors.join('\n'), /unknown predicate operator/);

const absentState = evaluateMissionPredicate({ factKnown: 'fact.manifest-reconciled' }, { index });
assert.equal(absentState.ok, true);
assert.equal(absentState.value, false);

const refs = collectMissionPredicateRefs(predicate);
assert.deepEqual([...refs.facts], ['fact.manifest-reconciled']);
assert.deepEqual([...refs.events], ['event.survivors-transferred']);
assert.deepEqual([...refs.objectives], ['objective.account-crew']);
assert.deepEqual([...refs.outcomes], []);
assert.deepEqual([...refs.clocks], []);

const contextBefore = {
    knownFacts: [...context.knownFacts],
    worldFacts: [...context.worldFacts],
    events: [...context.events],
    outcomes: [...context.outcomes.entries()],
    objectives: [...context.objectives.entries()].map(([id, value]) => [id, { ...value }]),
    clocks: [...context.clocks.entries()].map(([id, value]) => [id, { ...value }]),
    missionStatus: context.missionStatus,
};
evaluateMissionPredicate(predicate, context);
assert.deepEqual({
    knownFacts: [...context.knownFacts],
    worldFacts: [...context.worldFacts],
    events: [...context.events],
    outcomes: [...context.outcomes.entries()],
    objectives: [...context.objectives.entries()].map(([id, value]) => [id, { ...value }]),
    clocks: [...context.clocks.entries()].map(([id, value]) => [id, { ...value }]),
    missionStatus: context.missionStatus,
}, contextBefore);
assert.equal(evaluated.reasons.every((reason) => /^[A-Za-z]+:[A-Za-z0-9._:-]+=(true|false)$/.test(reason)), true);

console.log('V1 mission predicate tests passed.');
