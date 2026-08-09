import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
    indexMissionDefinition,
    validateMissionDefinition,
} from '../../src/mission/v1/mission-contracts.mjs';

const missionSchema = JSON.parse(fs.readFileSync('schemas/mission/mission-v1.schema.json', 'utf8'));
assert.equal(missionSchema.$schema, 'https://json-schema.org/draft/2020-12/schema');
assert.equal(missionSchema.additionalProperties, false);
assert.equal(missionSchema.properties.kind.const, 'directive.missionDefinition.v1');
for (const boundary of [
    'playerText',
    'objective',
    'fact',
    'event',
    'outcome',
    'outcomeDimension',
    'clock',
    'terminalDisposition',
    'transition',
]) {
    assert.equal(missionSchema.$defs[boundary].additionalProperties, false, `${boundary} must be strict`);
}
assert.equal(Array.isArray(missionSchema.$defs.predicate.oneOf), true);
assert.equal(JSON.stringify(missionSchema.$defs.predicate).includes('modelInstructions'), false);
assert.equal(JSON.stringify(missionSchema.$defs.predicate).includes('sourceCode'), false);

const referenceMission = {
    kind: 'directive.missionDefinition.v1',
    schemaVersion: 1,
    id: 'mission.hesperus-reference',
    version: '1.0.0',
    playerText: {
        title: 'Hesperus Diversion',
        summary: 'Protect the people aboard the disabled vessel and secure a safe disposition.',
    },
    facts: [
        {
            id: 'fact.hesperus-discrepancy-known',
            visibility: 'discoverable',
            playerText: { summary: 'Inspection records contain discrepancies.' },
        },
    ],
    events: [
        {
            id: 'event.hesperus-survivors-transferred',
            playerVisibility: 'visible',
            playerText: { summary: 'The Hesperus survivors are safely transferred.' },
        },
    ],
    outcomes: [
        {
            id: 'outcome.hesperus-evidence-preserved',
            allowedValues: ['unknown', 'yes', 'no'],
            initialValue: 'unknown',
            playerVisibility: 'hidden',
        },
    ],
    objectives: [
        {
            id: 'objective.hesperus-rescue',
            class: 'required',
            activatedAs: null,
            activationWhen: true,
            availableWhen: true,
            visibleWhen: true,
            progressWhen: { eventOccurred: 'event.hesperus-survivors-transferred' },
            terminalWhen: [
                {
                    disposition: 'completed',
                    when: { eventOccurred: 'event.hesperus-survivors-transferred' },
                },
            ],
            supportedDispositions: ['completed', 'completedWithCost', 'handedOff'],
            playerText: {
                title: 'Protect the people aboard Hesperus',
                summary: 'Reach a safe disposition for everyone aboard the disabled ship.',
                terminal: [
                    { disposition: 'completed', text: 'Everyone aboard reached safety.' },
                ],
            },
        },
        {
            id: 'objective.hesperus-readiness',
            class: 'optional',
            activatedAs: null,
            activationWhen: true,
            availableWhen: true,
            visibleWhen: true,
            progressWhen: false,
            terminalWhen: [],
            supportedDispositions: ['completed', 'waived'],
            playerText: {
                title: 'Review readiness implications',
                summary: 'Consider what the diversion reveals about ship readiness.',
                terminal: [],
            },
        },
        {
            id: 'objective.hesperus-accountability',
            class: 'conditional',
            activatedAs: 'optional',
            activationWhen: { factKnown: 'fact.hesperus-discrepancy-known' },
            availableWhen: { factKnown: 'fact.hesperus-discrepancy-known' },
            visibleWhen: { factKnown: 'fact.hesperus-discrepancy-known' },
            progressWhen: { outcomeIs: { id: 'outcome.hesperus-evidence-preserved', equals: 'yes' } },
            terminalWhen: [
                {
                    disposition: 'handedOff',
                    when: { outcomeIs: { id: 'outcome.hesperus-evidence-preserved', equals: 'yes' } },
                },
            ],
            supportedDispositions: ['completed', 'handedOff', 'knowinglyDeclined', 'waived', 'failedAfterInformedAction'],
            playerText: {
                title: 'Review the inspection discrepancies',
                summary: 'Determine the appropriate disposition of the known record discrepancies.',
                terminal: [
                    { disposition: 'handedOff', text: 'Evidence was preserved for review.' },
                ],
            },
        },
    ],
    outcomeDimensions: [
        {
            id: 'dimension.lives-protected',
            playerText: { label: 'Lives protected' },
            derive: [
                {
                    value: 'full',
                    priority: 100,
                    when: { objectiveDisposition: { id: 'objective.hesperus-rescue', in: ['completed'] } },
                },
            ],
        },
    ],
    clocks: [
        {
            id: 'clock.hesperus-life-support',
            unit: 'minutes',
            direction: 'down',
            initialValue: 30,
            startWhen: true,
            advanceSources: ['authoritativeStoryTime'],
            pauseWhen: false,
            resumeWhen: false,
            expireWhen: { clockState: { id: 'clock.hesperus-life-support', in: ['expired'] } },
            resolveWhen: { eventOccurred: 'event.hesperus-survivors-transferred' },
            visibleWhen: true,
            consequence: {
                effectType: 'mission.clockExpired',
                targetId: 'clock.hesperus-life-support',
                value: 'life-support-exhausted',
            },
            playerText: {
                label: 'Life support reserve',
                deadline: '{value} minutes remaining',
                consequence: 'Conditions aboard Hesperus will become critical.',
            },
        },
    ],
    closeWhen: {
        objectiveDisposition: {
            id: 'objective.hesperus-rescue',
            in: ['completed', 'completedWithCost', 'handedOff'],
        },
    },
    terminalDispositions: [
        {
            id: 'primarySuccess',
            priority: 100,
            when: { objectiveDisposition: { id: 'objective.hesperus-rescue', in: ['completed'] } },
            playerText: { title: 'Primary success', summary: 'The people aboard Hesperus are safe.' },
        },
        {
            id: 'primarySuccessWithCost',
            priority: 90,
            when: { objectiveDisposition: { id: 'objective.hesperus-rescue', in: ['completedWithCost', 'handedOff'] } },
            playerText: { title: 'Success with cost', summary: 'The rescue reached a safe but costly resolution.' },
        },
    ],
    transitions: [
        {
            id: 'transition.hesperus-command-review',
            priority: 100,
            when: { missionStatus: { in: ['terminal'] } },
            target: {
                kind: 'phase',
                id: 'phase.command-review',
                playerSafeSetup: 'Return to the command handover and readiness review.',
            },
            mustNarrate: ['Acknowledge the committed rescue disposition.'],
            mustNotReveal: ['Do not mention undiscovered inspection misconduct.'],
        },
    ],
};

const result = validateMissionDefinition(referenceMission);
assert.equal(result.ok, true, result.errors.join('\n'));

const index = indexMissionDefinition(referenceMission);
assert.equal(index.objectives.get('objective.hesperus-rescue')?.class, 'required');
assert.equal(index.facts.has('fact.hesperus-discrepancy-known'), true);
assert.equal(index.events.has('event.hesperus-survivors-transferred'), true);
assert.equal(index.outcomes.has('outcome.hesperus-evidence-preserved'), true);
assert.equal(index.clocks.has('clock.hesperus-life-support'), true);
assert.equal(index.terminalDispositions.has('primarySuccess'), true);
assert.equal(index.transitions.has('transition.hesperus-command-review'), true);

for (const [label, definition, pattern] of [
    ['kind', { ...referenceMission, kind: 'directive.missionDefinition.v0' }, /kind/],
    ['schema version', { ...referenceMission, schemaVersion: 2 }, /schemaVersion/],
    ['id', { ...referenceMission, id: '' }, /mission id/],
    ['version', { ...referenceMission, version: '' }, /version/],
    ['player text', { ...referenceMission, playerText: { title: '', summary: '' } }, /playerText/],
    ['objectives', { ...referenceMission, objectives: null }, /objectives/],
    ['facts', { ...referenceMission, facts: null }, /facts/],
    ['events', { ...referenceMission, events: null }, /events/],
    ['outcomes', { ...referenceMission, outcomes: null }, /outcomes/],
    ['outcome dimensions', { ...referenceMission, outcomeDimensions: null }, /outcomeDimensions/],
    ['clocks', { ...referenceMission, clocks: null }, /clocks/],
    ['terminal dispositions', { ...referenceMission, terminalDispositions: null }, /terminalDispositions/],
    ['transitions', { ...referenceMission, transitions: null }, /transitions/],
]) {
    assert.match(validateMissionDefinition(definition).errors.join('\n'), pattern, label);
}

const clockWithoutOptionalPredicates = { ...referenceMission.clocks[0] };
delete clockWithoutOptionalPredicates.pauseWhen;
delete clockWithoutOptionalPredicates.resumeWhen;
delete clockWithoutOptionalPredicates.resolveWhen;
const optionalClockResult = validateMissionDefinition({
    ...referenceMission,
    clocks: [clockWithoutOptionalPredicates],
});
assert.equal(optionalClockResult.ok, true, optionalClockResult.errors.join('\n'));

assert.match(
    validateMissionDefinition({
        ...referenceMission,
        objectives: [referenceMission.objectives[0], { ...referenceMission.objectives[0] }],
    }).errors.join('\n'),
    /duplicate id: objective\.hesperus-rescue/,
);

assert.match(
    validateMissionDefinition({
        ...referenceMission,
        facts: [{ ...referenceMission.facts[0], id: '' }],
    }).errors.join('\n'),
    /facts item requires a stable id/,
);

assert.match(
    validateMissionDefinition({
        ...referenceMission,
        events: [{ ...referenceMission.events[0], id: 'bad event id' }],
    }).errors.join('\n'),
    /events item requires a stable id/,
);

function replaceObjective(indexToReplace, replacement) {
    return {
        ...referenceMission,
        objectives: referenceMission.objectives.map((objective, index) => (
            index === indexToReplace ? { ...objective, ...replacement } : objective
        )),
    };
}

for (const [label, definition, pattern] of [
    ['objective class', replaceObjective(0, { class: 'main' }), /objective\.hesperus-rescue class/],
    ['required activation mode', replaceObjective(0, { activatedAs: 'optional' }), /objective\.hesperus-rescue activatedAs/],
    ['conditional activation mode', replaceObjective(2, { activatedAs: null }), /objective\.hesperus-accountability activatedAs/],
    ['supported disposition', replaceObjective(0, { supportedDispositions: ['victorious'] }), /unknown disposition/],
    ['terminal disposition support', replaceObjective(0, {
        terminalWhen: [{ disposition: 'knowinglyDeclined', when: true }],
    }), /terminal disposition knowinglyDeclined is not supported/],
    ['objective player text', replaceObjective(0, { playerText: { title: '', summary: '', terminal: [] } }), /playerText/],
]) {
    assert.match(validateMissionDefinition(definition).errors.join('\n'), pattern, label);
}

for (const [label, predicate, pattern] of [
    ['unknown fact', { factKnown: 'fact.unknown' }, /unknown fact/],
    ['unknown event', { eventOccurred: 'event.unknown' }, /unknown event/],
    ['unknown outcome', { outcomeIs: { id: 'outcome.unknown', equals: 'yes' } }, /unknown outcome/],
    ['unknown objective', { objectiveState: { id: 'objective.unknown', in: ['terminal'] } }, /unknown objective/],
    ['unknown clock', { clockState: { id: 'clock.unknown', in: ['running'] } }, /unknown clock/],
    ['unknown operator', { modelDecides: 'anything' }, /unknown predicate operator: modelDecides/],
]) {
    assert.match(
        validateMissionDefinition(replaceObjective(0, { availableWhen: predicate })).errors.join('\n'),
        pattern,
        label,
    );
}

const cycleObjectiveBase = {
    class: 'optional',
    activatedAs: null,
    activationWhen: true,
    visibleWhen: true,
    progressWhen: false,
    terminalWhen: [],
    supportedDispositions: ['waived'],
    playerText: { title: 'Parallel work', summary: 'Complete available parallel work.', terminal: [] },
};
assert.match(
    validateMissionDefinition({
        ...referenceMission,
        objectives: [
            ...referenceMission.objectives,
            {
                ...cycleObjectiveBase,
                id: 'objective.cycle-a',
                availableWhen: { objectiveState: { id: 'objective.cycle-b', in: ['terminal'] } },
            },
            {
                ...cycleObjectiveBase,
                id: 'objective.cycle-b',
                availableWhen: { objectiveState: { id: 'objective.cycle-a', in: ['terminal'] } },
            },
        ],
    }).errors.join('\n'),
    /objective dependency cycle/,
);

for (const [label, activationRoute, pattern] of [
    ['missing route', undefined, /conditional-required.*mandatory player-visible activation route/],
    ['unknown route fact', { factId: 'fact.unknown', mandatory: true, playerVisible: true }, /activation route references unknown fact/],
    ['hidden route', { factId: 'fact.hesperus-discrepancy-known', mandatory: true, playerVisible: false }, /mandatory player-visible activation route/],
]) {
    assert.match(
        validateMissionDefinition(replaceObjective(2, {
            activatedAs: 'required',
            activationRoute,
        })).errors.join('\n'),
        pattern,
        label,
    );
}

assert.match(
    validateMissionDefinition({
        ...replaceObjective(2, {
            activatedAs: 'required',
            activationRoute: {
                factId: 'fact.hesperus-discrepancy-known',
                mandatory: true,
                playerVisible: true,
            },
        }),
        facts: [{
            ...referenceMission.facts[0],
            visibility: 'hidden',
            playerText: undefined,
        }],
    }).errors.join('\n'),
    /activation route fact must be player-visible/,
);

assert.match(
    validateMissionDefinition({
        ...referenceMission,
        closeWhen: {
            objectiveDisposition: {
                id: 'objective.hesperus-accountability',
                in: ['completed', 'handedOff', 'waived'],
            },
        },
    }).errors.join('\n'),
    /optional objective cannot participate in closeWhen/,
);

assert.match(
    validateMissionDefinition({
        ...referenceMission,
        objectives: [
            ...referenceMission.objectives,
            {
                ...cycleObjectiveBase,
                id: 'objective.required-unreferenced',
                class: 'required',
                availableWhen: true,
            },
        ],
    }).errors.join('\n'),
    /required objective is not represented in closeWhen/,
);

assert.match(
    validateMissionDefinition(replaceObjective(0, { terminalWhen: [] })).errors.join('\n'),
    /required objective has no terminal rule/,
);

assert.match(
    validateMissionDefinition({
        ...referenceMission,
        closeWhen: {
            objectiveDisposition: {
                id: 'objective.hesperus-rescue',
                in: ['knowinglyDeclined'],
            },
        },
    }).errors.join('\n'),
    /objective disposition is not supported: knowinglyDeclined/,
);

function replaceClock(replacement) {
    return {
        ...referenceMission,
        clocks: [{ ...referenceMission.clocks[0], ...replacement }],
    };
}

for (const [label, definition, pattern] of [
    ['unit', replaceClock({ unit: '' }), /clock\.hesperus-life-support unit/],
    ['direction', replaceClock({ direction: 'sideways' }), /direction/],
    ['initial value', replaceClock({ initialValue: Number.NaN }), /initialValue/],
    ['advance sources', replaceClock({ advanceSources: [] }), /advanceSources/],
    ['start predicate', replaceClock({ startWhen: undefined }), /startWhen/],
    ['expiry predicate', replaceClock({ expireWhen: undefined }), /expireWhen/],
    ['visibility predicate', replaceClock({ visibleWhen: undefined }), /visibleWhen/],
    ['consequence', replaceClock({ consequence: null }), /consequence/],
    ['player text', replaceClock({ playerText: null }), /playerText/],
]) {
    assert.match(validateMissionDefinition(definition).errors.join('\n'), pattern, label);
}

assert.match(
    validateMissionDefinition({
        ...referenceMission,
        transitions: [
            referenceMission.transitions[0],
            {
                ...referenceMission.transitions[0],
                id: 'transition.hesperus-alternate',
                when: false,
            },
        ],
    }).errors.join('\n'),
    /ambiguous transition priority 100/,
);

for (const [label, target, pattern] of [
    ['target kind', { kind: 'chapter', id: 'chapter.next', playerSafeSetup: 'Continue.' }, /target kind/],
    ['target id', { kind: 'phase', id: '', playerSafeSetup: 'Continue.' }, /target id/],
    ['target setup', { kind: 'phase', id: 'phase.next', playerSafeSetup: '' }, /playerSafeSetup/],
]) {
    assert.match(
        validateMissionDefinition({
            ...referenceMission,
            transitions: [{ ...referenceMission.transitions[0], target }],
        }).errors.join('\n'),
        pattern,
        label,
    );
}

for (const [label, terminalDispositions, pattern] of [
    ['missing terminal dispositions', [], /at least one terminal disposition/],
    ['terminal priority', [{ ...referenceMission.terminalDispositions[0], priority: 1.5 }], /priority/],
    ['terminal player text', [{ ...referenceMission.terminalDispositions[0], playerText: null }], /playerText/],
    ['ambiguous terminal priority', [
        referenceMission.terminalDispositions[0],
        { ...referenceMission.terminalDispositions[1], priority: 100 },
    ], /ambiguous terminal disposition priority 100/],
]) {
    assert.match(
        validateMissionDefinition({ ...referenceMission, terminalDispositions }).errors.join('\n'),
        pattern,
        label,
    );
}

for (const [label, definition, pattern] of [
    ['fact visibility', { ...referenceMission, facts: [{ ...referenceMission.facts[0], visibility: 'secret' }] }, /fact.*visibility/],
    ['discoverable fact text', { ...referenceMission, facts: [{ ...referenceMission.facts[0], playerText: null }] }, /fact.*playerText/],
    ['visible event text', { ...referenceMission, events: [{ ...referenceMission.events[0], playerText: null }] }, /event.*playerText/],
    ['outcome values', { ...referenceMission, outcomes: [{ ...referenceMission.outcomes[0], allowedValues: [] }] }, /allowedValues/],
    ['outcome initial value', { ...referenceMission, outcomes: [{ ...referenceMission.outcomes[0], initialValue: 'maybe' }] }, /initialValue/],
    ['dimension derivation', { ...referenceMission, outcomeDimensions: [{ ...referenceMission.outcomeDimensions[0], derive: [] }] }, /derive/],
    ['dimension player text', { ...referenceMission, outcomeDimensions: [{ ...referenceMission.outcomeDimensions[0], playerText: null }] }, /playerText/],
]) {
    assert.match(validateMissionDefinition(definition).errors.join('\n'), pattern, label);
}

console.log('V1 mission contract tests passed.');
