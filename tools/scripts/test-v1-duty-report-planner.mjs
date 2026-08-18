import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
    deliveredDutyReportIds,
    selectPendingDutyReport,
} from '../../src/mission/v1/duty-report-planner.mjs';

const definition = JSON.parse(fs.readFileSync(
    'tests/fixtures/mission/v1/v1-hesperus-reference.fixture.json',
    'utf8',
));
definition.facts[0].directorText = 'Hidden maintenance fraud must never appear in a Duty Report packet.';

const state = {
    branchId: 'save.alpha',
    revision: 4,
    status: 'active',
    knownFacts: [],
    worldFacts: ['fact.hesperus-discrepancy-known'],
    events: [],
    outcomes: Object.fromEntries(definition.outcomes.map((outcome) => [outcome.id, outcome.initialValue])),
    objectives: Object.fromEntries(definition.objectives.map((objective) => [objective.id, {
        state: 'available',
        disposition: null,
    }])),
};

const bronn = {
    id: 'hadrik-bronn',
    capabilityRoles: ['engineering'],
};
const tilsen = {
    id: 'adal-tilsen',
    capabilityRoles: ['operations'],
};
const whitaker = {
    id: 'mara-whitaker',
    capabilityRoles: ['command'],
};

const inputSnapshot = structuredClone({ definition, state, availableActors: [bronn, tilsen, whitaker] });
const preferred = selectPendingDutyReport({
    definition,
    state,
    availableActors: [whitaker, tilsen, bronn],
    deliveredReportIds: [],
});
assert.deepEqual(preferred, {
    kind: 'directive.dutyReportPacket.v1',
    reportId: 'report.hesperus-discrepancy',
    reporterId: 'hadrik-bronn',
    factId: 'fact.hesperus-discrepancy-known',
    urgency: 'material',
    confidence: 'credible',
    deliveryRequirement: 'optional',
    playerText: { summary: 'Engineering has a material discrepancy to report.' },
    authorizedClaim: {
        claimType: 'factDisclosed',
        targetId: 'fact.hesperus-discrepancy-known',
        policyId: 'policy.hesperus-discrepancy-disclosed',
    },
});
assert.equal(JSON.stringify(preferred).includes('maintenance fraud'), false);
assert.deepEqual({ definition, state, availableActors: [bronn, tilsen, whitaker] }, inputSnapshot);

const capableNonPreferred = selectPendingDutyReport({
    definition,
    state,
    availableActors: [whitaker, { ...bronn, capabilityRoles: ['science'] }, tilsen],
});
assert.equal(capableNonPreferred.reporterId, 'adal-tilsen');

const stableCapableSelection = selectPendingDutyReport({
    definition,
    state,
    availableActors: [
        { id: 'zeta-engineer', capabilityRoles: ['engineering'] },
        { id: 'alpha-engineer', capabilityRoles: ['engineering'] },
    ],
});
assert.equal(stableCapableSelection.reporterId, 'alpha-engineer');

const captainFallback = selectPendingDutyReport({
    definition,
    state,
    availableActors: [whitaker, { ...bronn, capabilityRoles: ['science'] }],
});
assert.equal(captainFallback.reporterId, 'mara-whitaker');

for (const [label, options] of [
    ['no available reporter', { availableActors: [] }],
    ['truth not established', { availableActors: [bronn], state: { ...state, worldFacts: [] } }],
    ['fact already known', {
        availableActors: [bronn],
        state: { ...state, knownFacts: ['fact.hesperus-discrepancy-known'] },
    }],
    ['report already delivered', {
        availableActors: [bronn],
        deliveredReportIds: new Set(['report.hesperus-discrepancy']),
    }],
    ['preferred actor unavailable', {
        availableActors: [{ ...bronn, available: false }],
    }],
]) {
    assert.equal(selectPendingDutyReport({ definition, state, ...options }), null, label);
}

const routineRoute = {
    ...definition.reportRoutes[0],
    id: 'report.z-routine',
    urgency: 'routine',
};
const urgentRoute = {
    ...definition.reportRoutes[0],
    id: 'report.z-urgent',
    urgency: 'urgent',
};
for (const routes of [
    [routineRoute, urgentRoute],
    [urgentRoute, routineRoute],
]) {
    const selected = selectPendingDutyReport({
        definition: { ...definition, reportRoutes: routes },
        state,
        availableActors: [bronn],
    });
    assert.equal(selected.reportId, 'report.z-urgent');
}

const sameUrgencyRoutes = [
    { ...routineRoute, id: 'report.z-route', urgency: 'material' },
    { ...routineRoute, id: 'report.a-route', urgency: 'material' },
];
assert.equal(selectPendingDutyReport({
    definition: { ...definition, reportRoutes: sameUrgencyRoutes },
    state,
    availableActors: [bronn],
}).reportId, 'report.a-route');

const requiredSameUrgency = {
    ...routineRoute,
    id: 'report.z-required',
    urgency: 'material',
    deliveryRequirement: 'required',
};
assert.equal(selectPendingDutyReport({
    definition: {
        ...definition,
        reportRoutes: [{ ...routineRoute, id: 'report.a-optional', urgency: 'material' }, requiredSameUrgency],
    },
    state,
    availableActors: [bronn],
}).reportId, 'report.z-required');

const settledDelivery = {
    kind: 'directive.dutyReportDelivery.v1',
    contractVersion: 1,
    reportId: 'report.hesperus-discrepancy',
    factId: 'fact.hesperus-discrepancy-known',
    reporterId: 'hadrik-bronn',
    policyId: 'policy.hesperus-discrepancy-disclosed',
    responseId: 'response.1',
    hostMessageId: 'assistant.1',
    selectedSwipeId: '0',
    visibleTextHash: 'a1b2c3d4',
    segmentTextHash: 'b2c3d4e5',
    sourceTransactionId: 'txn.1',
};
const evidenceState = {
    evidenceLog: [{
        claimType: 'factDisclosed',
        targetId: 'fact.hesperus-discrepancy-known',
        policyId: 'policy.hesperus-discrepancy-disclosed',
        sourceContributionId: 'contribution.1',
        delivery: settledDelivery,
    }],
    invalidatedSourceContributionIds: [],
};
assert.deepEqual(deliveredDutyReportIds({ definition, state: evidenceState }), [
    'report.hesperus-discrepancy',
]);
assert.deepEqual(deliveredDutyReportIds({
    definition,
    state: { ...evidenceState, invalidatedSourceContributionIds: ['contribution.1'] },
}), []);
assert.deepEqual(deliveredDutyReportIds({
    definition,
    state: {
        ...evidenceState,
        evidenceLog: [{
            ...evidenceState.evidenceLog[0],
            delivery: { ...settledDelivery, policyId: 'policy.forged' },
        }],
    },
}), []);

console.log('V1 Duty Report planner tests passed.');
