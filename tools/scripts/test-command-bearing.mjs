import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  applyCommandMarkAwards,
  createCommandBearingInterventionPrompt,
  evaluateCommandBearingSpend,
  improveOutcomeByCommandPoint,
  recoverCommandBearing,
  refreshCommandBearing,
  spendCommandBearingPoint
} from '../../src/command/command-bearing.mjs';

const root = process.cwd();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');

let command = refreshCommandBearing(projection.initialState.commandStyle);
assert.equal(command.inspiration.rank, 1);
assert.equal(command.resolve.rank, 1);
assert.equal(command.reserve.capacity, 1);

command = applyCommandMarkAwards(command, [{
  track: 'Resolve',
  decisionId: 'command.test.1',
  summary: 'The commander accepted responsibility for a bounded delay.'
}]);
assert.equal(command.resolve.marks, 1);
assert.equal(command.resolve.rank, 1);
assert.equal(command.resolve.rankTitle, 'Practiced');

command = applyCommandMarkAwards(command, [{
  track: 'Resolve',
  decisionId: 'command.test.1',
  summary: 'Duplicate awards do not add Marks.'
}]);
assert.equal(command.resolve.marks, 1, 'duplicate award source must not add another Mark');

command = applyCommandMarkAwards(command, [{
  track: 'Inspiration',
  decisionId: 'command.test.1',
  summary: 'The same command decision can also demonstrate Inspiration once.'
}]);
assert.equal(command.inspiration.marks, 1, 'same decision can award the other Command Bearing track');
assert.equal(command.resolve.marks, 1, 'dual-track award must not duplicate the existing Resolve Mark');

command = applyCommandMarkAwards(command, [{
  track: 'Resolve',
  decisionId: 'command.test.2',
  summary: 'The commander set a credible boundary.'
}]);
assert.equal(command.resolve.marks, 2);
assert.equal(command.resolve.rank, 2);
assert.equal(command.resolve.rankTitle, 'Established');
assert.equal(command.resolve.pointCap, 1);

command = applyCommandMarkAwards(command, [
  { track: 'Resolve', decisionId: 'command.test.3', summary: 'Sustained commitment.' },
  { track: 'Resolve', decisionId: 'command.test.4', summary: 'Prepared contingency.' },
  { track: 'Resolve', decisionId: 'command.test.5', summary: 'Public accountability.' }
]);
assert.equal(command.resolve.marks, 5);
assert.equal(command.resolve.rank, 3);
assert.equal(command.resolve.rankTitle, 'Proven');
assert.equal(command.resolve.pointCap, 2);
assert.equal(command.reserve.capacity, 2);

let recovery = recoverCommandBearing(command, {
  recoveryId: 'recovery.duty-cycle.001',
  track: 'Resolve'
});
assert.equal(recovery.applied, true);
command = recovery.commandStyle;
assert.equal(command.resolve.points, 1);
assert.equal(command.reserve.lastRecoveryId, 'recovery.duty-cycle.001');

recovery = recoverCommandBearing(command, {
  recoveryId: 'recovery.duty-cycle.001',
  track: 'Resolve'
});
assert.equal(recovery.applied, false);
assert.equal(recovery.commandStyle.resolve.points, 1);

recovery = recoverCommandBearing(command, {
  recoveryId: 'recovery.duty-cycle.002',
  track: 'Resolve'
});
assert.equal(recovery.applied, true);
command = recovery.commandStyle;
assert.equal(command.resolve.points, 2);

recovery = recoverCommandBearing(command, {
  recoveryId: 'recovery.duty-cycle.003',
  track: 'Inspiration'
});
assert.equal(recovery.applied, false, 'shared reserve cap prevents extra points');
assert.equal(recovery.commandStyle.inspiration.points, 0);

assert.equal(improveOutcomeByCommandPoint('Great Failure'), 'Partial Failure');
assert.equal(improveOutcomeByCommandPoint('Failure'), 'Partial Success');
assert.equal(improveOutcomeByCommandPoint('Partial Failure'), 'Success');
assert.equal(improveOutcomeByCommandPoint('Partial Success'), 'Great Success');

const eligibility = evaluateCommandBearingSpend(command, {
  outcomeId: 'outcome.command-bearing.test',
  resultBand: 'Partial Success',
  eligibleTracks: ['Resolve'],
  rationale: {
    resolve: 'The commander has lawful authority and accepted the cost.'
  }
});
assert.equal(eligibility.eligible, true);
assert.equal(eligibility.options[0].to, 'Great Success');

const prompt = createCommandBearingInterventionPrompt(command, {
  outcomeId: 'outcome.command-bearing.test',
  resultBand: 'Partial Success',
  eligibleTracks: ['Resolve'],
  rationale: {
    resolve: 'The commander has lawful authority and accepted the cost.'
  }
});
assert.equal(prompt.eligible, true);
assert.deepEqual(prompt.actions.map((action) => action.label), ['Invoke Resolve', 'Accept Outcome']);

const spend = spendCommandBearingPoint(command, {
  outcomeId: 'outcome.command-bearing.test',
  track: 'Resolve',
  resultBand: 'Partial Success',
  eligibleTracks: ['Resolve'],
  rationale: 'The commander has lawful authority and accepted the cost.'
});
assert.equal(spend.applied, true);
assert.equal(spend.to, 'Great Success');
assert.equal(spend.commandStyle.resolve.points, 1);
assert.equal(spend.commandStyle.spendLedger['outcome.command-bearing.test'].track, 'resolve');

const duplicateSpend = spendCommandBearingPoint(spend.commandStyle, {
  outcomeId: 'outcome.command-bearing.test',
  track: 'Resolve',
  resultBand: 'Partial Success',
  eligibleTracks: ['Resolve']
});
assert.equal(duplicateSpend.applied, false);

const successEligibility = evaluateCommandBearingSpend(spend.commandStyle, {
  outcomeId: 'outcome.command-bearing.success',
  resultBand: 'Success',
  eligibleTracks: ['Resolve']
});
assert.equal(successEligibility.eligible, false);

console.log('Command Bearing tests passed: Marks, ranks, Recovery, reserve caps, spend eligibility, intervention prompt');
