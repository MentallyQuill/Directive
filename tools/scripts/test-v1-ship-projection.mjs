import assert from 'node:assert/strict';
import fs from 'node:fs';

import { validateMissionDefinition } from '../../src/mission/v1/mission-contracts.mjs';
import { createShipPlayerProjection } from '../../src/projection/v1/ship-projection.mjs';

const definition = JSON.parse(fs.readFileSync(
    'packages/bundled/breckenridge/v1/prelude-a-ship-underway.mission-v1.json',
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

const campaignState = {
    ship: {
        id: 'uss-breckenridge',
        name: 'U.S.S. Breckenridge',
        class: 'Intrepid-class',
        registry: 'NCC-74638',
        operationalOverview: {
            kind: 'directive.shipOperationalOverview.v1',
            status: 'serviceable-with-limitations',
            summary: 'The Breckenridge is serviceable after refit, with one material sensor limitation under active command review.',
            materialLimitations: [{
                id: 'limitation.port-sensor-array',
                summary: 'The port sensor array is operating at reduced sensitivity.',
                status: 'active',
            }, {
                id: 'limitation.resolved-scratch',
                summary: 'A cosmetic scratch was repaired.',
                status: 'resolved',
            }],
            history: [],
        },
    },
};
const unsupportedShipState = {
    ship: {
        id: 'uss-breckenridge',
        condition: 'Untrusted condition text.',
        damage: [{
            id: 'damage.port-sensor-array',
            label: 'Port sensor array degraded',
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
assert.equal(ship.operationalStatus.status, 'serviceable-with-limitations');
assert.equal(ship.operationalStatus.summary, campaignState.ship.operationalOverview.summary);
assert.deepEqual(ship.operationalStatus.readiness, {
    id: 'dimension.prelude.command-readiness',
    label: 'Command readiness',
    value: 'ready-with-limitation',
});
assert.deepEqual(ship.operationalStatus.readinessObjectiveLink, {
    id: 'objective.prelude.final-readiness-arrival',
});
assert.equal(JSON.stringify(ship).includes(missionProjection.objectives[0].title), false);
assert.equal(JSON.stringify(ship).includes(missionProjection.objectives[0].summary), false);
assert.deepEqual(ship.operationalStatus.materialLimitations, [{
    id: 'limitation.port-sensor-array',
    summary: 'The port sensor array is operating at reduced sensitivity.',
}]);
assert.equal(Object.hasOwn(ship.operationalStatus, 'issues'), false);
assert.equal(Object.hasOwn(ship.operationalStatus, 'damage'), false);
assert.equal(Object.hasOwn(ship.operationalStatus, 'restrictions'), false);
assert.equal(Object.hasOwn(ship, 'technicalDebt'), false);
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

assert.throws(
    () => createShipPlayerProjection({
        campaignState: unsupportedShipState,
        runtimeAssets,
        definition,
        missionProjection: { objectives: [], outcomeDimensions: [] },
    }),
    (error) => error.code === 'DIRECTIVE_V1_SHIP_STATE_REQUIRED',
);

for (const badHints of [
    { ...definition.projectionHints, shipReadinessObjectiveId: 'objective.missing' },
    { ...definition.projectionHints, shipReadinessDimensionId: 'dimension.missing' },
]) {
    const result = validateMissionDefinition({ ...definition, projectionHints: badHints });
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /projectionHints/);
}

console.log('V1 consolidated ship projection tests passed.');
