const VALID_MODES = new Set(['Exploration', 'Command']);

const MODE_COPY = Object.freeze({
  Exploration: Object.freeze({
    label: 'Exploration',
    difficultyLabel: 'Story-forward',
    fatalityPolicy: 'No player or senior staff death',
    summary: 'Consequences still matter, but Directive softens the worst outcomes. Injury, delay, damaged trust, lost readiness, or lost position can happen; player and senior staff deaths are blocked.',
    bestFit: 'Choose this for a campaign that prioritizes continuity, recovery paths, and softer worst-case outcomes.',
    settingsSummary: 'Story-forward consequence ceiling: severe costs can still happen, but player and senior staff deaths are blocked.',
    narratorConstraint: 'Exploration mode: keep causality intact, but do not kill the player character or senior staff; use injury, delay, temporary incapacitation, damaged trust, or lost position instead.',
    fatalityAllowedForPlayerOrSeniorStaff: false,
    requiresEscalationConfirmation: false,
  }),
  Command: Object.freeze({
    label: 'Command',
    difficultyLabel: 'Full simulation',
    fatalityPolicy: 'Full causal severity',
    summary: 'Directive preserves full causal severity. Serious failure can include severe or fatal outcomes when the risk is established, but the system must stay fair and cannot invent unsupported harm.',
    bestFit: 'Choose this for the complete command simulation, where serious risk can produce serious consequences.',
    settingsSummary: 'Full causal severity remains possible when risk is established.',
    narratorConstraint: 'Command mode: preserve full causal consequence severity when risk is established; do not cheat against the player or invent unsupported harm.',
    fatalityAllowedForPlayerOrSeniorStaff: true,
    requiresEscalationConfirmation: true,
  }),
});

export function normalizeSimulationMode(value) {
  const mode = String(value || '').trim();
  return VALID_MODES.has(mode) ? mode : 'Command';
}

export function createSimulationModePolicy(mode = 'Command') {
  const simulationMode = normalizeSimulationMode(mode);
  const copy = MODE_COPY[simulationMode];
  return {
    simulationMode,
    fatalityAllowedForPlayerOrSeniorStaff: copy.fatalityAllowedForPlayerOrSeniorStaff,
    narratorConstraint: copy.narratorConstraint,
    settingsSummary: copy.settingsSummary,
  };
}

export function simulationModeDifficultyOption(mode = 'Command') {
  const simulationMode = normalizeSimulationMode(mode);
  const copy = MODE_COPY[simulationMode];
  return {
    id: simulationMode,
    mode: simulationMode,
    label: copy.label,
    difficultyLabel: copy.difficultyLabel,
    fatalityPolicy: copy.fatalityPolicy,
    summary: copy.summary,
    bestFit: copy.bestFit,
    settingsSummary: copy.settingsSummary,
    requiresEscalationConfirmation: copy.requiresEscalationConfirmation,
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
