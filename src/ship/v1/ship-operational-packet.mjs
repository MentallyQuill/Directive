import { deriveShipMechanicsState } from './ship-mechanics-state.mjs';

function clone(value) {
  return structuredClone(value);
}

function byId(left, right) {
  return left.id.localeCompare(right.id);
}

export function createShipOperationalPacket({
  shipDataset = {},
  storySettlement = {},
  missionDefinition = {},
} = {}) {
  if (!shipDataset?.mechanics) return null;
  const mechanics = deriveShipMechanicsState({ shipDataset, storySettlement });
  const capabilities = [...mechanics.capabilities.values()].map((capability) => ({
    id: capability.id,
    label: capability.playerText.label,
    summary: capability.playerText.summary,
    narratorGuidance: capability.narratorGuidance,
    limits: [...capability.limits],
    evidenceEffectIds: [...(mechanics.capabilityEvidenceById.get(capability.id) || [])],
  })).sort(byId);
  const capabilityIds = new Set(capabilities.map(({ id }) => id));
  const constraints = [...mechanics.constraints.values()].map((constraint) => ({
    id: constraint.id,
    label: constraint.playerText.label,
    summary: constraint.playerText.summary,
    narratorGuidance: constraint.narratorGuidance,
  })).sort(byId);

  return {
    kind: 'directive.shipOperationalMechanics.v1',
    systems: mechanics.systems.map((system) => ({
      id: system.id,
      label: system.label,
      summary: system.summary,
      state: {
        id: system.currentState.id,
        label: system.currentState.playerText.label,
        why: system.currentState.playerText.why,
        mechanicalEffect: system.currentState.playerText.mechanicalEffect,
      },
      workOrders: clone(system.workOrders),
    })),
    capabilities,
    constraints,
    interactions: (missionDefinition.shipInteractions || [])
      .filter((interaction) => capabilityIds.has(interaction.capabilityId))
      .map(clone)
      .sort(byId),
  };
}
