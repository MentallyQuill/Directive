const VALID_MODES = new Set(['Exploration', 'Command']);
const RESULT_ORDER = [
  'Great Failure',
  'Failure',
  'Partial Failure',
  'Partial Success',
  'Success',
  'Great Success'
];

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function normalizeSimulationMode(value) {
  const mode = String(value || '').trim();
  return VALID_MODES.has(mode) ? mode : 'Command';
}

function resultIndex(resultBand) {
  const index = RESULT_ORDER.indexOf(resultBand);
  return index === -1 ? RESULT_ORDER.indexOf('Partial Failure') : index;
}

function maxSeverity(resultBand, severityCeiling) {
  return resultIndex(resultBand) < resultIndex(severityCeiling) ? severityCeiling : resultBand;
}

export function simulationModeFrom({ campaignState = {}, sceneSnapshot = {} } = {}) {
  return normalizeSimulationMode(sceneSnapshot.simulationMode || campaignState?.settings?.simulationMode);
}

function hasExplicitSimulationMode({ campaignState = {}, sceneSnapshot = {} } = {}) {
  return Boolean(sceneSnapshot.simulationMode || campaignState?.settings?.simulationMode);
}

export function createSimulationModePolicy(mode = 'Command') {
  const simulationMode = normalizeSimulationMode(mode);
  if (simulationMode === 'Exploration') {
    return {
      mode: 'Exploration',
      fatalityAllowedForPlayerOrSeniorStaff: false,
      severeOutcomeFloor: 'Partial Failure',
      narratorConstraint: 'Exploration mode: keep causality intact, but do not kill the player character or senior staff; use injury, delay, temporary incapacitation, damaged trust, or lost position instead.',
      settingsSummary: 'Story-forward consequence ceiling: severe costs can still happen, but player and senior staff deaths are blocked.'
    };
  }
  return {
    mode: 'Command',
    fatalityAllowedForPlayerOrSeniorStaff: true,
    severeOutcomeFloor: 'Great Failure',
    narratorConstraint: 'Command mode: preserve full deterministic consequence severity when risk is established; do not cheat against the player or invent unsupported harm.',
    settingsSummary: 'Full deterministic simulation: severe outcomes remain possible when causally established.'
  };
}

function softenExplorationCost(cost) {
  return String(cost)
    .replace(/\bdeath\b/gi, 'temporary incapacitation')
    .replace(/\bfatality\b/gi, 'severe injury')
    .replace(/\bfatalities\b/gi, 'severe injuries')
    .replace(/\bkilled\b/gi, 'taken out of action')
    .replace(/\bdies\b/gi, 'is taken out of action');
}

export function applySimulationModePolicyToOutcome({
  outcomePacket,
  campaignState,
  sceneSnapshot,
  intentParse
}) {
  const mode = simulationModeFrom({ campaignState, sceneSnapshot });
  const explicitMode = hasExplicitSimulationMode({ campaignState, sceneSnapshot });
  const policy = createSimulationModePolicy(mode);
  const next = cloneJson(outcomePacket);
  if (!explicitMode && policy.mode === 'Command') {
    return next;
  }

  const policyRecord = {
    simulationMode: policy.mode,
    fatalityAllowedForPlayerOrSeniorStaff: policy.fatalityAllowedForPlayerOrSeniorStaff,
    severityCeilingApplied: false
  };

  if (policy.mode === 'Exploration') {
    const originalBand = next.resultBand;
    next.resultBand = maxSeverity(next.resultBand, policy.severeOutcomeFloor);
    policyRecord.severityCeilingApplied = originalBand !== next.resultBand;
    if (policyRecord.severityCeilingApplied) {
      policyRecord.originalResultBand = originalBand;
    }
    next.costs = (next.costs || []).map(softenExplorationCost);
    if (
      policyRecord.severityCeilingApplied
      || intentParse?.primaryIntent === 'resolve-combined-load-test'
      || /death|fatal|killed|dies/i.test((outcomePacket.costs || []).join(' '))
    ) {
      next.costs = [
        ...next.costs,
        'senior staff and the player remain protected from death, but injury, delay, and loss of readiness still stand'
      ];
    }
  }

  next.simulationPolicy = policyRecord;
  return next;
}

export function simulationModeNarratorConstraints({ campaignState, sceneSnapshot } = {}) {
  if (!hasExplicitSimulationMode({ campaignState, sceneSnapshot })) {
    return [];
  }
  const mode = simulationModeFrom({ campaignState, sceneSnapshot });
  return [createSimulationModePolicy(mode).narratorConstraint];
}

export function simulationModeSettingsRows(mode = 'Command') {
  const policy = createSimulationModePolicy(mode);
  return {
    mode: policy.mode,
    fatalityPolicy: policy.fatalityAllowedForPlayerOrSeniorStaff
      ? 'Full causal severity'
      : 'No player or senior staff death',
    summary: policy.settingsSummary
  };
}
