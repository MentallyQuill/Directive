import assert from 'node:assert/strict';
import fs from 'node:fs';

import { validateMissionDefinition } from '../../src/mission/v1/mission-contracts.mjs';
import { createShipPlayerProjection } from '../../src/projection/v1/ship-projection.mjs';

const definition = JSON.parse(fs.readFileSync(
    'packages/bundled/breckenridge/v1/prelude-a-ship-underway.mission-v1.json',
    'utf8',
));
const campaignProjection = JSON.parse(fs.readFileSync(
    'packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json',
    'utf8',
));
const shipDataset = JSON.parse(fs.readFileSync(
    'packages/bundled/breckenridge/breckenridge-intrepid-class.ship-dataset.json',
    'utf8',
));

assert.equal(validateMissionDefinition(definition).ok, true);
assert.deepEqual(definition.projectionHints, {
    shipReadinessObjectiveId: 'objective.prelude.final-readiness-arrival',
    shipReadinessDimensionId: 'dimension.prelude.command-readiness',
});

const baselineShip = campaignProjection.initialState.ship;
const campaignState = {
    ship: {
        ...structuredClone(baselineShip),
        technicalDebt: [
            { id: 'ship.smell', label: 'Ship still has new-plating smell', playerSafeSummary: 'A smell was mentioned.' },
            { id: 'ship.flicker', label: 'Corridor light cycling anomaly', playerSafeSummary: 'A light flickered once.' },
            { id: 'ship.sensor', label: 'Sensor array calibration concern', playerSafeSummary: 'An officer mentioned calibration.' },
            { id: 'ship.refit-one', label: 'Refit systems not stressed together' },
            { id: 'ship.refit-two', label: 'Integrated validation pending' },
            { id: 'ship.refit-three', label: 'Combined refit load untested' },
        ],
        damage: [{
            id: 'damage.port-sensor-array',
            label: 'Port sensor array degraded',
            playerSafeSummary: 'The port sensor array is operating at reduced sensitivity.',
            severity: 'material',
            status: 'active',
        }, {
            id: 'damage.resolved-scratch',
            label: 'Resolved scratch',
            status: 'resolved',
        }],
        activeRestrictions: [{
            id: 'restriction.secure-command-handoff',
            label: 'Secure handoffs require verification',
            playerSafeSummary: 'Secure command handoffs require an additional verification step.',
            status: 'active',
        }],
    },
};
const missionProjection = {
    kind: 'directive.missionPlayerProjection.v1',
    missionId: definition.id,
    objectives: [{
        id: 'objective.prelude.final-readiness-arrival',
        class: 'required',
        status: 'inProgress',
        disposition: null,
        title: 'Complete final readiness review and reach the Asterion Reach',
        summary: 'Record the ship\'s honest readiness disposition and complete the transit to the Reach.',
        terminalText: null,
    }],
    outcomeDimensions: [{
        id: 'dimension.prelude.command-readiness',
        label: 'Command readiness',
        value: 'ready-with-limitation',
    }],
};
const runtimeAssets = {
    projection: campaignProjection,
    shipDataset,
};
const beforeState = structuredClone(campaignState);
const beforeAssets = structuredClone(runtimeAssets);
const ship = createShipPlayerProjection({
    campaignState,
    runtimeAssets,
    definition,
    missionProjection,
    storyProjection: {
        entries: [{
            id: 'episode.atmosphere',
            lastingChanges: [
                { id: 'effect.smell', type: 'ship.observation', targetId: 'ship.smell', value: true },
                { id: 'effect.flicker', type: 'ship.observation', targetId: 'ship.flicker', value: true },
            ],
        }],
    },
});

assert.equal(ship.kind, 'directive.shipPlayerProjection.v1');
assert.equal(ship.shipId, 'uss-breckenridge');
assert.equal(ship.name, 'U.S.S. Breckenridge');
assert.equal(ship.class, 'Intrepid-class');
assert.equal(ship.registry, 'NCC-74638');
assert.match(ship.capabilitySummary, /compact, advanced, fast/i);
assert.equal(ship.operationalStatus.conditionSummary, baselineShip.condition);
assert.deepEqual(ship.operationalStatus.readiness, {
    id: 'dimension.prelude.command-readiness',
    label: 'Command readiness',
    value: 'ready-with-limitation',
});
assert.deepEqual(ship.operationalStatus.readinessObjective, missionProjection.objectives[0]);
assert.deepEqual(ship.operationalStatus.damage, [{
    id: 'damage.port-sensor-array',
    label: 'Port sensor array degraded',
    summary: 'The port sensor array is operating at reduced sensitivity.',
    severity: 'material',
    status: 'active',
}]);
assert.deepEqual(ship.operationalStatus.restrictions, [{
    id: 'restriction.secure-command-handoff',
    label: 'Secure handoffs require verification',
    summary: 'Secure command handoffs require an additional verification step.',
    severity: null,
    status: 'active',
}]);
assert.equal(Object.hasOwn(ship.operationalStatus, 'issues'), false);
assert.equal(Object.hasOwn(ship, 'technicalDebt'), false);
for (const forbidden of ['new-plating smell', 'light cycling', 'calibration concern', 'ship.refit-two']) {
    assert.equal(JSON.stringify(ship).toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
}
assert.deepEqual(ship.sourceRefs.missionIds, [
    'objective.prelude.final-readiness-arrival',
    'dimension.prelude.command-readiness',
]);
assert.deepEqual(campaignState, beforeState);
assert.deepEqual(runtimeAssets, beforeAssets);
assert.deepEqual(createShipPlayerProjection({
    campaignState,
    runtimeAssets,
    definition,
    missionProjection,
}), ship);

const fallback = createShipPlayerProjection({
    campaignState: { ship: {} },
    runtimeAssets,
    definition,
    missionProjection: { objectives: [], outcomeDimensions: [] },
});
assert.equal(fallback.operationalStatus.conditionSummary, baselineShip.condition);
assert.equal(fallback.operationalStatus.readiness, null);
assert.equal(fallback.operationalStatus.readinessObjective, null);
assert.deepEqual(fallback.operationalStatus.damage, []);
assert.deepEqual(fallback.operationalStatus.restrictions, []);

for (const badHints of [
    { ...definition.projectionHints, shipReadinessObjectiveId: 'objective.missing' },
    { ...definition.projectionHints, shipReadinessDimensionId: 'dimension.missing' },
]) {
    const result = validateMissionDefinition({ ...definition, projectionHints: badHints });
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /projectionHints/);
}

console.log('V1 consolidated ship projection tests passed.');
