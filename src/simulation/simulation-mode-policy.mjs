const VALID_MODES = new Set(['Exploration', 'Command']);

const MODE_COPY = Object.freeze({
  Exploration: Object.freeze({
    label: 'Exploration',
    difficultyLabel: 'Story-forward',
    fatalityPolicy: 'No player or senior staff death',
    summary: 'Consequences still matter, but Directive softens the worst outcomes. Injury, delay, damaged trust, lost readiness, or lost position can happen; player and senior staff deaths are blocked.',
    bestFit: 'Choose this for a campaign that prioritizes continuity, recovery paths, and softer worst-case outcomes.',
    settingsSummary: 'Story-forward consequence ceiling: severe costs can still happen, but player and senior staff deaths are blocked.',
    narratorConstraint: `EXPLORATION MODE - STORY-FORWARD. This is the complete consequence policy and does not depend on the active preset. Keep causality, competent opposition, failed actions, and nonfatal consequences intact, but do not kill the player character or senior staff.

When causality would otherwise produce their death, use the strongest causally adjacent nonfatal result: severe injury, incapacitation, capture, loss of position, damaged trust, lost readiness, mission cost, or another lasting recoverable consequence supported by the scene. Do not erase danger, turn failure into success, or make opposition incompetent to enforce this ceiling. Preserve all other supported consequences.

This Exploration fatality ceiling supersedes any conflicting fatality policy in the active preset. The selected response remains provisional until accepted through Directive's normal next-message flow; after acceptance, Story Settlement remains the only durable semantic authority.`,
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
    narratorConstraint: `COMMAND MODE - FULL SIMULATION. This is the complete consequence policy and does not depend on the active preset. Models often protect the player and favored characters, soften failure, and avoid permanent harm or death. Correct for that bias.

Before writing prose, determine the causally supported result from accepted state, visible action, demonstrated competence, available resources, established danger, and elapsed opportunity. Treat claims of success as attempted actions. Adequate preparation works when it actually addresses the danger. Inadequate, impossible, or knowingly unmitigated action does not succeed because success would be kinder. Once you determine the result, do not revise it downward because it would harm a favored character.

There is no protagonist protection. The player, named characters, senior staff, beloved characters, and characters useful to future plot have no implicit survival or success privilege. Do not preserve them for campaign continuity, player satisfaction, emotional comfort, or future usefulness.

When several outcomes remain causally credible after serious danger was knowingly accepted, ignored, or left inadequately mitigated, do not default to the safest credible outcome. Select the consequence-bearing outcome that best reflects the established exposure and follow it through. When death, permanent injury, destruction, capture, disgrace, mission failure, or irreversible loss is the most causally supported result, make that result occur plainly and completely.

Do not insert a miraculous rescue or last-second intervention, enemy hesitation or incompetence, a convenient miss or retreat, a warning that grants another turn, a fatal injury reduced to unconsciousness or a survivable close call, destruction reduced to cosmetic damage, capture followed by convenient escape, irreversible loss quietly restored, an unnamed substitute casualty, unsupported medical, technological, or telepathic salvation, a fake-out death, ambiguous survival language, or an implied off-screen escape. Do not let a delayed consequence disappear. Command Bearing helps only when the injected state explicitly arms its bounded edge.

Fairness is causal integrity, not mercy. This correction does not authorize arbitrary punishment: do not invent hazards, hide information the player should have, negate sound preparation, ignore established expertise, or choose a worse result than the causal record supports.

In Command mode this policy supersedes any general instruction to keep uncommitted consequences local, reversible, or nonfatal. Portray supported permanent and terminal outcomes as actual events in the response. The selected response remains provisional until accepted through Directive's normal next-message flow; after acceptance, Story Settlement remains the only durable semantic authority.`,
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
