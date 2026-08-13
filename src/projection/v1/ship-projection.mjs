export const SHIP_PLAYER_PROJECTION_KIND = 'directive.shipPlayerProjection.v1';

import { deriveShipMechanicsState } from '../../ship/v1/ship-mechanics-state.mjs';

function compact(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function requireV1ShipState(campaignState = {}) {
    const ship = campaignState.ship;
    const overview = ship?.operationalOverview;
    const validIdentity = compact(ship?.id)
        && compact(ship?.name)
        && compact(ship?.class)
        && compact(ship?.registry);
    const validOverview = overview?.kind === 'directive.shipOperationalOverview.v1'
        && compact(overview.status)
        && compact(overview.summary)
        && Array.isArray(overview.materialLimitations);
    if (!validIdentity || !validOverview) {
        const error = new Error('The V1 ship projection requires an exact directive.shipOperationalOverview.v1 state.');
        error.code = 'DIRECTIVE_V1_SHIP_STATE_REQUIRED';
        throw error;
    }
    return ship;
}

function materialLimitations(records = []) {
    return records
        .filter((record) => record?.status === 'active' && compact(record?.id) && compact(record?.summary))
        .map((record) => ({
            id: compact(record.id),
            summary: compact(record.summary),
        }))
        .sort((left, right) => left.id.localeCompare(right.id));
}

function readinessProjection(definition = {}, missionProjection = {}) {
    const dimensionId = definition?.projectionHints?.shipReadinessDimensionId;
    const dimension = (missionProjection.outcomeDimensions || []).find((item) => item.id === dimensionId);
    return dimension ? {
        id: dimension.id,
        label: dimension.label,
        value: structuredClone(dimension.value),
    } : null;
}

function readinessObjectiveLink(definition = {}, missionProjection = {}) {
    const objectiveId = definition?.projectionHints?.shipReadinessObjectiveId;
    const objective = (missionProjection.objectives || []).find((item) => item.id === objectiveId);
    return objective ? { id: objective.id } : null;
}

export function createShipPlayerProjection({
    campaignState = {},
    runtimeAssets = {},
    definition = {},
    missionProjection = {},
} = {}) {
    const current = requireV1ShipState(campaignState);
    const overview = current.operationalOverview;
    const capability = runtimeAssets.shipDataset?.profile || {};
    const readiness = readinessProjection(definition, missionProjection);
    const readinessObjective = readinessObjectiveLink(definition, missionProjection);
    const missionIds = [readinessObjective?.id, readiness?.id].filter(Boolean);
    const mechanics = deriveShipMechanicsState({
        shipDataset: runtimeAssets.shipDataset || {},
        storySettlement: campaignState.storySettlement || {},
    });
    return {
        kind: SHIP_PLAYER_PROJECTION_KIND,
        shipId: compact(current.id),
        name: compact(current.name),
        class: compact(current.class),
        registry: compact(current.registry),
        capabilitySummary: compact(capability.summary),
        operationalStatus: {
            status: compact(overview.status),
            summary: compact(overview.summary),
            readiness,
            materialLimitations: materialLimitations(overview.materialLimitations),
            readinessObjectiveLink: readinessObjective,
        },
        systems: mechanics.systems.map((system) => ({
            id: system.id,
            label: system.label,
            summary: system.summary,
            currentState: {
                id: system.currentState.id,
                label: system.currentState.playerText.label,
                why: system.currentState.playerText.why,
                mechanicalEffect: system.currentState.playerText.mechanicalEffect,
            },
            stateLadder: structuredClone(system.stateLadder),
            workOrders: structuredClone(system.workOrders),
        })),
        capabilities: [...mechanics.capabilities.values()].map((capability) => ({
            id: capability.id,
            label: capability.playerText.label,
            summary: capability.playerText.summary,
        })).sort((left, right) => left.id.localeCompare(right.id)),
        constraints: [...mechanics.constraints.values()].map((constraint) => ({
            id: constraint.id,
            label: constraint.playerText.label,
            summary: constraint.playerText.summary,
        })).sort((left, right) => left.id.localeCompare(right.id)),
        sourceRefs: {
            packageIds: [
                runtimeAssets?.shipDataset?.manifest?.id,
            ].filter(Boolean),
            statePaths: ['ship.operationalOverview', 'storySettlement'],
            missionIds,
        },
    };
}
