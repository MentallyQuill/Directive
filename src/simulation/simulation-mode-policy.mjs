const VALID_MODES = new Set(['Exploration', 'Command']);
const MODE_COPY = Object.freeze({
  Exploration: Object.freeze({
    label: 'Exploration',
    difficultyLabel: 'Story-forward',
    fatalityPolicy: 'No player or senior staff death',
    summary: 'Consequences still matter, but Directive softens the worst outcomes. Injury, delay, damaged trust, lost readiness, or lost position can happen; player and senior staff deaths are blocked.',
    bestFit: 'Choose this for a campaign that prioritizes continuity, recovery paths, and softer worst-case outcomes.',
    settingsSummary: 'Story-forward consequence ceiling: severe costs can still happen, but player and senior staff deaths are blocked.',
    requiresEscalationConfirmation: false
  }),
  Command: Object.freeze({
    label: 'Command',
    difficultyLabel: 'Full simulation',
    fatalityPolicy: 'Full causal severity',
    summary: 'Directive preserves full causal severity. Serious failure can include severe or fatal outcomes when the risk is established, but the system must stay fair and cannot invent unsupported harm.',
    bestFit: 'Choose this for the complete command simulation, where serious risk can produce serious consequences.',
    settingsSummary: 'Full deterministic simulation: severe outcomes remain possible when causally established.',
    requiresEscalationConfirmation: true
  })
});
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

export function normalizeSimulationMode(value) {
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
  const copy = MODE_COPY[simulationMode];
  if (simulationMode === 'Exploration') {
    return {
      mode: 'Exploration',
      fatalityAllowedForPlayerOrSeniorStaff: false,
      severeOutcomeFloor: 'Partial Failure',
      narratorConstraint: 'Exploration mode: keep causality intact, but do not kill the player character or senior staff; use injury, delay, temporary incapacitation, damaged trust, or lost position instead.',
      settingsSummary: copy.settingsSummary
    };
  }
  return {
    mode: 'Command',
    fatalityAllowedForPlayerOrSeniorStaff: true,
    severeOutcomeFloor: 'Great Failure',
    narratorConstraint: 'Command mode: preserve full deterministic consequence severity when risk is established; do not cheat against the player or invent unsupported harm.',
    settingsSummary: copy.settingsSummary
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

export function simulationModeDifficultyOption(mode = 'Command') {
  const normalizedMode = normalizeSimulationMode(mode);
  const policy = createSimulationModePolicy(normalizedMode);
  const copy = MODE_COPY[normalizedMode];
  return {
    id: policy.mode,
    mode: policy.mode,
    label: copy.label,
    difficultyLabel: copy.difficultyLabel,
    fatalityPolicy: copy.fatalityPolicy,
    summary: copy.summary,
    bestFit: copy.bestFit,
    settingsSummary: policy.settingsSummary,
    requiresEscalationConfirmation: copy.requiresEscalationConfirmation
  };
}

export function simulationModeDifficultyOptions(modes = ['Exploration', 'Command']) {
  const seen = new Set();
  return (Array.isArray(modes) && modes.length ? modes : ['Exploration', 'Command'])
    .map(normalizeSimulationMode)
    .filter((mode) => {
      if (seen.has(mode)) return false;
      seen.add(mode);
      return true;
    })
    .map(simulationModeDifficultyOption);
}
