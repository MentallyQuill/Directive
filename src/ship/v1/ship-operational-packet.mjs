import { deriveShipMechanicsState } from './ship-mechanics-state.mjs';
import { deriveCohesionState } from './cohesion-state.mjs';

function clone(value) {
  return structuredClone(value);
}

function byId(left, right) {
  return left.id.localeCompare(right.id);
}

const COHESION_CAUSAL_INSTRUCTIONS = Object.freeze({
  ready: 'Apply only each issue-specific visible condition. Cohesion creates no general penalty.',
  strained: 'When a relevant visible condition materially affects the scene, express one causal limitation such as delay, reduced detail, an unavailable shortcut, or an explicit tradeoff. Do not apply an unrelated or blanket penalty.',
  critical: 'When a demanding relevant action meets a visible condition, expose a meaningful causal cost or unavailable option. Do not create unrelated random failures or a universal success penalty.',
});

export function createShipOperationalPacket({
  shipDataset = {},
  cohesionCatalog = null,
  storySettlement = {},
  missionDefinition = {},
  branchId = '',
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
  const cohesion = cohesionCatalog
    ? deriveCohesionState({ catalog: cohesionCatalog, shipDataset, storySettlement, branchId })
    : null;

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
    ...(cohesion ? {
      cohesion: {
        total: cohesion.total,
        band: cohesion.band.id,
        causalInstruction: COHESION_CAUSAL_INSTRUCTIONS[cohesion.band.id],
        visibleConditions: cohesion.visibleTasks.map((task) => ({
          id: task.id,
          title: task.playerText.title,
          condition: task.playerText.operationalEffect,
          currentPhase: clone(task.currentPhase),
          computerHelp: task.computerHelp,
        })),
        backlog: { count: cohesion.queuedCount, cohesion: cohesion.queuedCohesion },
      },
    } : {}),
  };
}
