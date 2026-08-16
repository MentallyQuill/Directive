import assert from 'node:assert/strict';
import fs from 'node:fs';

import { lintMissionPackage } from '../../src/mission/v1/mission-package-linter.mjs';

const definition = JSON.parse(fs.readFileSync(
    'packages/bundled/breckenridge/v1/prelude-a-ship-underway.mission-v1.json',
    'utf8',
));
const scenarioFixture = JSON.parse(fs.readFileSync(
    'tests/fixtures/mission/v1/prelude-hesperus-scenarios.fixture.json',
    'utf8',
));
const scenarioExpectations = scenarioFixture.scenarios.map((scenario) => scenario.expected);
const knownTransitionTargetIds = new Set(['chapter-1-the-empty-convoy']);
const openOrdersDefinition = JSON.parse(fs.readFileSync(
    'packages/bundled/breckenridge/v1/open-orders-1-work-worth-doing.mission-v1.json',
    'utf8',
));
const openOrdersScenarios = JSON.parse(fs.readFileSync(
    'tests/fixtures/mission/v1/open-orders-1-scenarios.fixture.json',
    'utf8',
));
const chapter2Definition = JSON.parse(fs.readFileSync(
    'packages/bundled/breckenridge/v1/chapter-2-false-colors.mission-v1.json',
    'utf8',
));
const openOrders2Definition = JSON.parse(fs.readFileSync(
    'packages/bundled/breckenridge/v1/open-orders-2-what-survives.mission-v1.json',
    'utf8',
));
const openOrders2Scenarios = JSON.parse(fs.readFileSync(
    'tests/fixtures/mission/v1/open-orders-2-scenarios.fixture.json',
    'utf8',
));
const chapter5Definition = JSON.parse(fs.readFileSync(
    'packages/bundled/breckenridge/v1/chapter-5-old-lessons.mission-v1.json',
    'utf8',
));

function lint(candidate, overrides = {}) {
    return lintMissionPackage({
        definition: candidate,
        knownTransitionTargetIds,
        scenarioExpectations,
        ...overrides,
    });
}

const valid = lint(definition);
assert.equal(valid.ok, true, valid.errors.join('\n'));
assert.deepEqual(valid.errors, []);
assert.deepEqual(valid, lint(definition), 'lint order and output must be deterministic');

const initiallyKnown = lintMissionPackage({
    definition: openOrdersDefinition,
    knownDefinitions: [definition, chapter2Definition, openOrdersDefinition],
    knownTransitionTargetIds: new Set(['chapter-3-dead-letters']),
    scenarioExpectations: openOrdersScenarios.scenarios.map((scenario) => scenario.expected),
});
assert.equal(initiallyKnown.ok, true, initiallyKnown.errors.join('\n'));
assert.equal(
    openOrdersDefinition.evidencePolicies.some((policy) => (
        policy.claimType === 'factDisclosed' && policy.targetId === 'fact.open-orders1.opportunities'
    )),
    false,
    'an initially known fact does not need a redundant disclosure policy',
);

const credentialGatedInterval = lintMissionPackage({
    definition: openOrders2Definition,
    knownDefinitions: [definition, chapter5Definition, openOrders2Definition],
    knownTransitionTargetIds: new Set(['chapter-6-the-cost-of-knowing']),
    scenarioExpectations: openOrders2Scenarios.scenarios.map((scenario) => scenario.expected),
});
assert.equal(credentialGatedInterval.ok, true, credentialGatedInterval.errors.join('\n'));
assert.equal(
    openOrders2Definition.evidencePolicies
        .filter((policy) => policy.targetId === 'outcome.open-orders2.conclusion')
        .every((policy) => JSON.stringify(policy.when).includes('fact.open-orders2.current-starfleet-credential-path')),
    true,
    'every Open Orders II conclusion route requires the campaign-critical report',
);

const spoilerDefinition = structuredClone(definition);
spoilerDefinition.playerText.summary = 'Complete the command handover and uncover the Hesperus fraud.';
assert.match(lint(spoilerDefinition).errors.join('\n'), /initial player projection contains spoiler term.*fraud/i);

const missingFixtureExpectations = scenarioExpectations.map((expected) => ({
    ...expected,
    objectiveDispositions: Object.fromEntries(
        Object.entries(expected.objectiveDispositions || {})
            .filter(([objectiveId]) => objectiveId !== 'objective.prelude.final-readiness-arrival'),
    ),
}));
assert.match(
    lint(definition, { scenarioExpectations: missingFixtureExpectations }).errors.join('\n'),
    /objective\.prelude\.final-readiness-arrival has no reachable terminal scenario fixture/,
);

const ungroundedClock = structuredClone(definition);
ungroundedClock.clocks[0].visibleWhen = true;
assert.match(
    lint(ungroundedClock).errors.join('\n'),
    /clock\.hesperus-life-support lacks a player-known visibility basis/,
);

assert.match(
    lint(definition, { knownTransitionTargetIds: new Set(['mission.somewhere-else']) }).errors.join('\n'),
    /transition.*targets unknown package mission: chapter-1-the-empty-convoy/,
);

const optionalClosure = structuredClone(definition);
optionalClosure.closeWhen = {
    objectiveDisposition: {
        id: 'objective.prelude.hesperus-accountability',
        in: ['completed', 'handedOff'],
    },
};
assert.match(lint(optionalClosure).errors.join('\n'), /optional objective cannot participate in closeWhen/);

const missingOutcomePolicy = structuredClone(definition);
missingOutcomePolicy.evidencePolicies = missingOutcomePolicy.evidencePolicies.filter(
    (policy) => policy.id !== 'policy.hesperus.rescue-result',
);
assert.match(
    lint(missingOutcomePolicy).errors.join('\n'),
    /outcome\.hesperus\.rescue-result has no usable outcome evidence policy/,
);

const unconditionalTerminalPolicy = structuredClone(definition);
unconditionalTerminalPolicy.evidencePolicies.find(
    (policy) => policy.id === 'policy.hesperus.rescue-result',
).when = true;
assert.match(
    lint(unconditionalTerminalPolicy).errors.join('\n'),
    /objective\.prelude\.hesperus-rescue terminal evidence policy policy\.hesperus\.rescue-result requires a causal gate/,
);

const impossibleDisclosure = structuredClone(definition);
impossibleDisclosure.evidencePolicies = impossibleDisclosure.evidencePolicies.filter(
    (policy) => policy.id !== 'policy.hesperus.distress-established',
);
assert.match(
    lint(impossibleDisclosure).errors.join('\n'),
    /report\.hesperus\.distress fact can never become true/,
);

console.log('V1 mission package linter tests passed.');
