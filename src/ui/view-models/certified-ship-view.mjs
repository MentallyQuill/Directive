import { createV1ShipPanelModel } from '../v1-player-facing-panel-model.mjs';

const clone = (value) => value === undefined
  ? undefined
  : JSON.parse(JSON.stringify(value));

export function buildCertifiedShipView(projection) {
  const ship = createV1ShipPanelModel(projection);
  const operational = ship.operationalStatus || {};
  return {
    id: ship.shipId,
    name: ship.name,
    className: ship.class,
    registry: ship.registry,
    summary: ship.capabilitySummary,
    operationalStatus: {
      status: operational.status,
      summary: operational.summary,
      readiness: clone(operational.readiness ?? null),
      readinessObjectiveLink: clone(operational.readinessObjectiveLink ?? null)
    },
    limitations: clone(operational.materialLimitations || []),
    capabilities: clone(ship.capabilities || [])
  };
}
