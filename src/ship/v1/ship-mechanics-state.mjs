import {
  indexShipMechanics,
  validateShipMechanics,
} from './ship-mechanics-contracts.mjs';

function clone(value) {
  return structuredClone(value);
}

export function activeShipMilestoneEffects(storySettlement = {}) {
  return (storySettlement?.episodes || [])
    .flatMap((episode) => episode?.effects || [])
    .filter((effect) => (
      effect?.type === 'ship.milestoneCompleted'
      && effect?.status === 'active'
      && typeof effect?.id === 'string'
      && typeof effect?.targetId === 'string'
    ))
    .map(clone);
}

function workOrderProjection(milestone, satisfiedIds) {
  if (satisfiedIds.has(milestone.id)) {
    return {
      id: milestone.id,
      status: 'satisfied',
      label: milestone.playerText.label,
      summary: milestone.playerText.summary,
    };
  }
  const revealId = milestone?.revealWhen?.milestoneSatisfied;
  if (revealId && !satisfiedIds.has(revealId)) return { id: milestone.id, status: 'unknown' };
  return {
    id: milestone.id,
    status: 'known',
    label: milestone.playerText.label,
    summary: milestone.playerText.summary,
  };
}

function effectIdsForMilestones(requiredMilestoneIds, effectsByMilestone) {
  return requiredMilestoneIds.flatMap((milestoneId) => (
    (effectsByMilestone.get(milestoneId) || []).map((effect) => effect.id)
  ));
}

export function deriveShipMechanicsState({ shipDataset = {}, storySettlement = {} } = {}) {
  const validation = validateShipMechanics(shipDataset);
  if (!validation.ok) throw new TypeError(validation.errors.join('\n'));
  const index = indexShipMechanics(shipDataset);
  if (!shipDataset?.mechanics) {
    return {
      systems: [],
      capabilities: new Map(),
      constraints: new Map(),
      capabilityEvidenceById: new Map(),
      activeEffectIds: new Set(),
    };
  }
  const effects = activeShipMilestoneEffects(storySettlement)
    .filter((effect) => index.milestones.has(effect.targetId));
  const effectsByMilestone = new Map();
  for (const effect of effects) {
    if (!effectsByMilestone.has(effect.targetId)) effectsByMilestone.set(effect.targetId, []);
    effectsByMilestone.get(effect.targetId).push(effect);
  }
  for (const values of effectsByMilestone.values()) values.sort((left, right) => left.id.localeCompare(right.id));
  const satisfiedIds = new Set(effectsByMilestone.keys());
  const capabilities = new Map();
  const constraints = new Map();
  const capabilityEvidenceById = new Map();
  const systems = [];

  for (const system of index.mechanics.systems || []) {
    const states = new Map(system.states.map((state) => [state.id, state]));
    const transitions = [...system.transitions].sort((left, right) => {
      const leftRank = states.get(left.toStateId)?.rank ?? 0;
      const rightRank = states.get(right.toStateId)?.rank ?? 0;
      return leftRank - rightRank || left.id.localeCompare(right.id);
    });
    let current = states.get(system.openingStateId);
    const establishingEffectIds = [];
    let advanced = true;
    while (advanced) {
      advanced = false;
      const transition = transitions.find((candidate) => (
        candidate.fromStateId === current.id
        && candidate.requiredMilestoneIds.every((id) => satisfiedIds.has(id))
      ));
      if (!transition) break;
      establishingEffectIds.push(...effectIdsForMilestones(transition.requiredMilestoneIds, effectsByMilestone));
      current = states.get(transition.toStateId);
      advanced = true;
    }
    const evidenceIds = [...new Set(establishingEffectIds)].sort();
    const activeCapabilities = current.capabilityIds.map((id) => {
      const capability = clone(index.capabilities.get(id));
      capabilities.set(id, capability);
      capabilityEvidenceById.set(id, [...evidenceIds]);
      return capability;
    });
    const activeConstraints = current.constraintIds.map((id) => {
      const constraint = clone(index.constraints.get(id));
      constraints.set(id, constraint);
      return constraint;
    });
    systems.push({
      id: system.id,
      label: system.playerText.label,
      summary: system.playerText.summary,
      currentState: clone(current),
      stateLadder: [...system.states]
        .sort((left, right) => left.rank - right.rank)
        .map((state) => ({ id: state.id, rank: state.rank, ...clone(state.playerText) })),
      activeCapabilities,
      activeConstraints,
      workOrders: system.milestones.map((milestone) => workOrderProjection(milestone, satisfiedIds)),
    });
  }

  return {
    systems,
    capabilities,
    constraints,
    capabilityEvidenceById,
    activeEffectIds: new Set(effects.map((effect) => effect.id)),
  };
}
