export const SHIP_PLAYER_PROJECTION_KIND = 'directive.shipPlayerProjection.v1';

function compact(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function baselineShip(runtimeAssets = {}) {
    return runtimeAssets?.projection?.initialState?.ship || {};
}

function firstValue(primary, fallback) {
    const value = compact(primary);
    return value || compact(fallback);
}

function activeRecord(record = {}) {
    const status = compact(record.status || 'active');
    return !new Set(['resolved', 'inactive', 'cleared', 'invalidated']).has(status);
}

function projectedOperationalRecord(record = {}) {
    if (!record || typeof record !== 'object' || Array.isArray(record) || !compact(record.id) || !activeRecord(record)) {
        return null;
    }
    const label = firstValue(record.label || record.title, record.id);
    const summary = firstValue(record.playerSafeSummary || record.summary, label);
    return {
        id: compact(record.id),
        label,
        summary,
        severity: compact(record.severity) || null,
        status: compact(record.status) || 'active',
    };
}

function operationalRecords(records) {
    return (Array.isArray(records) ? records : [])
        .map(projectedOperationalRecord)
        .filter(Boolean)
        .sort((left, right) => left.id.localeCompare(right.id));
}

function capabilityCard(shipDataset = {}) {
    return (shipDataset.cards || []).find((card) => (
        card?.type === 'ship.profile'
        && card?.visibility === 'publicPackage'
        && card?.payload?.narratorSafe === true
        && compact(card?.payload?.summary)
    )) || null;
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
    const baseline = baselineShip(runtimeAssets);
    const current = campaignState.ship || {};
    const capability = capabilityCard(runtimeAssets.shipDataset);
    const readiness = readinessProjection(definition, missionProjection);
    const readinessObjective = readinessObjectiveLink(definition, missionProjection);
    const missionIds = [readinessObjective?.id, readiness?.id].filter(Boolean);
    return {
        kind: SHIP_PLAYER_PROJECTION_KIND,
        shipId: firstValue(current.id, baseline.id) || null,
        name: firstValue(current.name, baseline.name),
        class: firstValue(current.class, baseline.class),
        registry: firstValue(current.registry, baseline.registry),
        capabilitySummary: compact(capability?.payload?.summary),
        operationalStatus: {
            conditionSummary: firstValue(current.condition, baseline.condition),
            readiness,
            damage: operationalRecords(current.damage ?? baseline.damage),
            restrictions: operationalRecords(current.activeRestrictions ?? baseline.activeRestrictions),
            readinessObjectiveLink: readinessObjective,
        },
        sourceRefs: {
            packageIds: [
                runtimeAssets?.projection?.manifest?.id,
                runtimeAssets?.shipDataset?.manifest?.id,
                capability?.id,
            ].filter(Boolean),
            statePaths: ['ship.condition', 'ship.damage', 'ship.activeRestrictions'],
            missionIds,
        },
    };
}
