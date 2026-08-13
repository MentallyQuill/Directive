export const SHIP_MECHANICS_KIND = 'directive.shipMechanics.v1';
export const SHIP_WORK_CLAIM_TYPE = 'shipMilestoneCompleted';

const SOURCE_ROLES = new Set(['assistant', 'runtime', 'adjudicator']);
const EVIDENCE_STANDARDS = new Set(['explicit', 'clearOutcome']);

function stableId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
}

function text(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function byId(values = []) {
  return new Map((Array.isArray(values) ? values : []).filter((item) => item?.id).map((item) => [item.id, item]));
}

function requirePlayerText(value, path, fields, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${path} playerText is required`);
    return;
  }
  for (const field of fields) {
    if (!text(value[field])) errors.push(`${path} playerText.${field} is required`);
  }
}

function requireStringArray(value, path, errors, { nonEmpty = false } = {}) {
  if (!Array.isArray(value) || (nonEmpty && value.length === 0)) {
    errors.push(`${path} must be ${nonEmpty ? 'a non-empty' : 'an'} array`);
    return [];
  }
  if (new Set(value).size !== value.length) errors.push(`${path} must not contain duplicates`);
  for (const item of value) if (!text(item)) errors.push(`${path} must contain non-empty strings`);
  return value;
}

function mechanicsOf(shipDataset = {}) {
  return shipDataset?.mechanics;
}

export function indexShipMechanics(shipDataset = {}) {
  const mechanics = mechanicsOf(shipDataset) || {};
  const systems = byId(mechanics.systems);
  return {
    mechanics,
    capabilities: byId(mechanics.capabilities),
    constraints: byId(mechanics.constraints),
    systems,
    states: new Map([...systems.values()].flatMap((system) => [...byId(system.states).entries()])),
    milestones: new Map([...systems.values()].flatMap((system) => [...byId(system.milestones).entries()])),
    transitions: new Map([...systems.values()].flatMap((system) => [...byId(system.transitions).entries()])),
  };
}

function validateNarrativeRule(record, path, errors) {
  if (!text(record?.narratorGuidance)) errors.push(`${path} narratorGuidance is required`);
  requireStringArray(record?.limits || [], `${path} limits`, errors);
}

function validateMilestone(milestone, system, milestoneIndex, errors) {
  const path = milestone?.id || `${system.id}.milestones[${milestoneIndex}]`;
  requirePlayerText(milestone?.playerText, path, ['label', 'summary'], errors);
  const roles = requireStringArray(milestone?.sourceRoles, `${path} sourceRoles`, errors, { nonEmpty: true });
  for (const role of roles) if (!SOURCE_ROLES.has(role)) errors.push(`${path} sourceRoles contains unknown role: ${role}`);
  const interpretation = milestone?.interpretation;
  if (!interpretation || typeof interpretation !== 'object' || Array.isArray(interpretation)) {
    errors.push(`${path} interpretation is required`);
  } else {
    if (!EVIDENCE_STANDARDS.has(interpretation.evidenceStandard)) {
      errors.push(`${path} interpretation evidenceStandard is unknown`);
    }
    if (!text(interpretation.guidance)) errors.push(`${path} interpretation guidance is required`);
    requireStringArray(interpretation.exclusions, `${path} interpretation exclusions`, errors, { nonEmpty: true });
  }
  if (milestone?.revealWhen !== undefined) {
    const reveal = milestone.revealWhen;
    if (!reveal || typeof reveal !== 'object' || Array.isArray(reveal)
      || Object.keys(reveal).length !== 1 || !stableId(reveal.milestoneSatisfied)) {
      errors.push(`${path} revealWhen must contain one milestoneSatisfied id`);
    }
  }
}

function duplicateIds(index, errors) {
  const seen = new Map();
  const groups = [
    ['capabilities', index.mechanics.capabilities],
    ['constraints', index.mechanics.constraints],
    ['systems', index.mechanics.systems],
    ['states', [...index.systems.values()].flatMap((item) => item.states || [])],
    ['milestones', [...index.systems.values()].flatMap((item) => item.milestones || [])],
    ['transitions', [...index.systems.values()].flatMap((item) => item.transitions || [])],
  ];
  for (const [group, records] of groups) {
    for (const record of Array.isArray(records) ? records : []) {
      if (!stableId(record?.id)) {
        errors.push(`${group} item requires a stable id`);
        continue;
      }
      if (seen.has(record.id)) errors.push(`duplicate id: ${record.id}`);
      else seen.set(record.id, group);
    }
  }
}

function validateSystem(system, systemIndex, index, errors) {
  const path = system?.id || `systems[${systemIndex}]`;
  requirePlayerText(system?.playerText, path, ['label', 'summary'], errors);
  for (const field of ['states', 'milestones', 'transitions']) {
    if (!Array.isArray(system?.[field])) errors.push(`${path}.${field} must be an array`);
  }
  const states = byId(system?.states);
  const milestones = byId(system?.milestones);
  const transitions = Array.isArray(system?.transitions) ? system.transitions : [];
  if (!states.has(system?.openingStateId)) errors.push(`${path} openingStateId references unknown state`);
  const ranks = new Set();
  for (const [stateIndex, state] of (system?.states || []).entries()) {
    const statePath = state?.id || `${path}.states[${stateIndex}]`;
    if (!Number.isInteger(state?.rank) || state.rank < 0) errors.push(`${statePath} rank must be a non-negative integer`);
    else if (ranks.has(state.rank)) errors.push(`${path} state ranks must be unique`);
    ranks.add(state?.rank);
    requirePlayerText(state?.playerText, statePath, ['label', 'why', 'mechanicalEffect'], errors);
    for (const capabilityId of requireStringArray(state?.capabilityIds, `${statePath} capabilityIds`, errors)) {
      if (!index.capabilities.has(capabilityId)) errors.push(`${statePath} references unknown capability: ${capabilityId}`);
    }
    for (const constraintId of requireStringArray(state?.constraintIds, `${statePath} constraintIds`, errors)) {
      if (!index.constraints.has(constraintId)) errors.push(`${statePath} references unknown constraint: ${constraintId}`);
    }
  }
  for (const [milestoneIndex, milestone] of (system?.milestones || []).entries()) {
    validateMilestone(milestone, system, milestoneIndex, errors);
    const revealId = milestone?.revealWhen?.milestoneSatisfied;
    if (revealId && !milestones.has(revealId)) {
      errors.push(`${milestone.id} revealWhen references unknown milestone: ${revealId}`);
    }
  }
  const incoming = new Map([...states.keys()].map((id) => [id, []]));
  for (const [transitionIndex, transition] of transitions.entries()) {
    const transitionPath = transition?.id || `${path}.transitions[${transitionIndex}]`;
    const from = states.get(transition?.fromStateId);
    const to = states.get(transition?.toStateId);
    if (!from) errors.push(`${transitionPath} references unknown from state: ${transition?.fromStateId}`);
    if (!to) errors.push(`${transitionPath} references unknown to state: ${transition?.toStateId}`);
    if (from && to && to.rank <= from.rank) errors.push(`${transitionPath} must move forward to a higher-ranked state`);
    const required = requireStringArray(
      transition?.requiredMilestoneIds,
      `${transitionPath} requiredMilestoneIds`,
      errors,
      { nonEmpty: true },
    );
    for (const milestoneId of required) {
      if (!milestones.has(milestoneId)) errors.push(`${transitionPath} references unknown milestone: ${milestoneId}`);
    }
    if (to) incoming.get(to.id)?.push(transition);
  }
  const opening = states.get(system?.openingStateId);
  if (opening && opening.rank !== Math.min(...[...states.values()].map((state) => state.rank))) {
    errors.push(`${path} opening state must have the lowest rank`);
  }
  const reachable = new Set(opening ? [opening.id] : []);
  let changed = true;
  while (changed) {
    changed = false;
    for (const transition of transitions) {
      if (reachable.has(transition.fromStateId) && !reachable.has(transition.toStateId)) {
        reachable.add(transition.toStateId);
        changed = true;
      }
    }
  }
  for (const stateId of states.keys()) {
    if (!reachable.has(stateId)) errors.push(`${path} contains unreachable state: ${stateId}`);
  }
}

export function validateShipMechanics(shipDataset = {}) {
  const mechanics = mechanicsOf(shipDataset);
  if (mechanics === undefined) return { ok: true, errors: [] };
  const errors = [];
  if (!mechanics || typeof mechanics !== 'object' || Array.isArray(mechanics)) {
    return { ok: false, errors: ['ship mechanics must be an object'] };
  }
  if (mechanics.kind !== SHIP_MECHANICS_KIND) errors.push(`ship mechanics kind must be ${SHIP_MECHANICS_KIND}`);
  if (mechanics.schemaVersion !== 1) errors.push('ship mechanics schemaVersion must be 1');
  for (const field of ['capabilities', 'constraints', 'systems']) {
    if (!Array.isArray(mechanics[field])) errors.push(`ship mechanics ${field} must be an array`);
  }
  const index = indexShipMechanics(shipDataset);
  duplicateIds(index, errors);
  for (const capability of mechanics.capabilities || []) {
    requirePlayerText(capability?.playerText, capability?.id || 'capability', ['label', 'summary'], errors);
    validateNarrativeRule(capability, capability?.id || 'capability', errors);
  }
  for (const constraint of mechanics.constraints || []) {
    requirePlayerText(constraint?.playerText, constraint?.id || 'constraint', ['label', 'summary'], errors);
    if (!text(constraint?.narratorGuidance)) {
      errors.push(`${constraint?.id || 'constraint'} narratorGuidance is required`);
    }
  }
  for (const [systemIndex, system] of (mechanics.systems || []).entries()) {
    validateSystem(system, systemIndex, index, errors);
  }
  return { ok: errors.length === 0, errors };
}

export function validateShipMechanicsPackage({ shipDataset = {}, missionDefinitions = [] } = {}) {
  const mechanicsResult = validateShipMechanics(shipDataset);
  const errors = [...mechanicsResult.errors];
  if (!mechanicsResult.ok || mechanicsOf(shipDataset) === undefined) {
    return { ok: errors.length === 0, errors };
  }
  const index = indexShipMechanics(shipDataset);
  for (const definition of Array.isArray(missionDefinitions) ? missionDefinitions : []) {
    const policies = byId(definition?.evidencePolicies);
    const interactionIds = new Set();
    for (const [interactionIndex, interaction] of (definition?.shipInteractions || []).entries()) {
      const path = interaction?.id || `${definition?.id || 'mission'}.shipInteractions[${interactionIndex}]`;
      if (!stableId(interaction?.id)) errors.push(`${path} requires a stable id`);
      else if (interactionIds.has(interaction.id)) errors.push(`${definition.id} contains duplicate ship interaction id: ${interaction.id}`);
      interactionIds.add(interaction?.id);
      if (!index.capabilities.has(interaction?.capabilityId)) {
        errors.push(`${path} references unknown ship capability: ${interaction?.capabilityId}`);
      }
      const evidencePolicyIds = requireStringArray(
        interaction?.evidencePolicyIds,
        `${path} evidencePolicyIds`,
        errors,
        { nonEmpty: true },
      );
      for (const policyId of evidencePolicyIds) {
        if (!policies.has(policyId)) errors.push(`${path} references unknown evidence policy: ${policyId}`);
      }
      validateNarrativeRule(interaction, path, errors);
    }
  }
  return { ok: errors.length === 0, errors };
}
