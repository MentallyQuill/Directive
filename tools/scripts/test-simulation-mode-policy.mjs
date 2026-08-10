import assert from 'node:assert/strict';

import {
  createSimulationModePolicy,
  simulationModeDifficultyOption
} from '../../src/simulation/simulation-mode-policy.mjs';

const command = createSimulationModePolicy('Command');
assert.equal(command.simulationMode, 'Command');
assert.equal(command.fatalityAllowedForPlayerOrSeniorStaff, true);
assert.match(command.narratorConstraint, /COMMAND MODE - FULL SIMULATION/);
assert.match(command.narratorConstraint, /no protagonist protection/i);
assert.match(command.narratorConstraint, /correct for that bias/i);
assert.match(command.narratorConstraint, /do not default to the safest credible outcome/i);
assert.match(command.narratorConstraint, /death, permanent injury, destruction, capture, disgrace, mission failure, or irreversible loss/i);
assert.match(command.narratorConstraint, /miraculous rescue or last-second intervention/i);
assert.match(command.narratorConstraint, /fatal injury reduced to unconsciousness or a survivable close call/i);
assert.match(command.narratorConstraint, /irreversible loss quietly restored/i);
assert.match(command.narratorConstraint, /unsupported medical, technological, or telepathic salvation/i);
assert.match(command.narratorConstraint, /fake-out death, ambiguous survival language, or an implied off-screen escape/i);
assert.match(command.narratorConstraint, /does not authorize arbitrary punishment/i);
assert.match(command.narratorConstraint, /supersedes any general instruction to keep uncommitted consequences local, reversible, or nonfatal/i);
assert.match(command.narratorConstraint, /selected response remains provisional/i);

const exploration = createSimulationModePolicy('Exploration');
assert.equal(exploration.simulationMode, 'Exploration');
assert.equal(exploration.fatalityAllowedForPlayerOrSeniorStaff, false);
assert.match(exploration.narratorConstraint, /EXPLORATION MODE - STORY-FORWARD/);
assert.match(exploration.narratorConstraint, /do not kill the player character or senior staff/i);
assert.match(exploration.narratorConstraint, /strongest causally adjacent nonfatal result/i);
assert.match(exploration.narratorConstraint, /do not erase danger, turn failure into success, or make opposition incompetent/i);
assert.match(exploration.narratorConstraint, /supersedes any conflicting fatality policy/i);

assert.equal(simulationModeDifficultyOption('Command').difficultyLabel, 'Full simulation');
assert.equal(simulationModeDifficultyOption('Exploration').difficultyLabel, 'Story-forward');
assert.doesNotMatch(
  `${command.narratorConstraint}\n${exploration.narratorConstraint}`,
  /\bdice\b|\bd20\b|\brandom(?:ness)?\b/i
);

console.log('Simulation mode policy tests passed.');
