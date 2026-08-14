export const SHIP_PLAYER_PROJECTION_KIND = 'directive.shipPlayerProjection.v1';

import { deriveShipMechanicsState } from '../../ship/v1/ship-mechanics-state.mjs';
import { deriveCohesionState } from '../../ship/v1/cohesion-state.mjs';

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
    const cohesionState = runtimeAssets.cohesionCatalog
        ? deriveCohesionState({
            catalog: runtimeAssets.cohesionCatalog,
            shipDataset: runtimeAssets.shipDataset || {},
            storySettlement: campaignState.storySettlement || {},
            branchId: campaignState?.campaignChatBinding?.saveId || '',
        })
        : null;
    const visibleTaskIds = new Set(cohesionState?.visibleTasks?.map(({ id }) => id) || []);
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
        ...(cohesionState ? {
            cohesion: {
                total: cohesionState.total,
                band: structuredClone(cohesionState.band),
                segments: cohesionState.segments.map((segment) => ({
                    index: segment.index,
                    filled: segment.filled,
                    visible: segment.visible,
                    ...(segment.issueId && visibleTaskIds.has(segment.issueId) ? { taskId: segment.issueId } : {}),
                    ...(!segment.filled && !segment.visible ? { queued: true } : {}),
                })),
                visibleTasks: cohesionState.visibleTasks.map((task) => ({
                    id: task.id,
                    authored: task.authored,
                    title: task.playerText.title,
                    level: task.level,
                    primaryFamily: task.primaryFamily,
                    reward: { cohesion: task.cohesion, segments: task.level },
                    anchor: task.anchor,
                    segmentIds: structuredClone(task.segmentIds),
                    playerText: structuredClone(task.playerText),
                    currentPhase: structuredClone(task.currentPhase),
                    phases: structuredClone(task.phases),
                    approaches: structuredClone(task.approaches),
                    computerHelp: task.computerHelp,
                    completion: task.completion ? {
                        guidance: task.completion.guidance,
                        exclusions: structuredClone(task.completion.exclusions),
                    } : null,
                    binding: structuredClone(task.binding),
                })),
                backlog: {
                    count: cohesionState.queuedCount,
                    cohesion: cohesionState.queuedCohesion,
                },
                completedHistory: structuredClone(cohesionState.completedHistory),
            },
        } : {}),
        sourceRefs: {
            packageIds: [
                runtimeAssets?.shipDataset?.manifest?.id,
                runtimeAssets?.cohesionCatalog?.id,
            ].filter(Boolean),
            statePaths: ['ship.operationalOverview', 'storySettlement'],
            missionIds,
        },
    };
}
