import assert from 'node:assert/strict';

import { compileDirectorInstruction } from '../../src/narration/director-instructions.mjs';

const direction = {
  move: 'surface-opportunity',
  targetRef: 'opportunity.1',
  requires: ['handover-complete'],
  newComplications: 'avoid',
};
const eligibleTargets = new Map([['opportunity.1', {
  id: 'opportunity.1',
  playerSafeText: 'Discuss the outstanding assignment.',
  conditions: new Set(),
}]]);
assert.deepEqual(compileDirectorInstruction({ direction, eligibleTargets }), {
  move: 'respond-to-player',
  targetRef: null,
  targetText: null,
  instruction: 'Respond to the player within the current scene and reconciled state.',
  complicationInstruction: 'Do not introduce a new consequential complication in this beat.',
});
eligibleTargets.get('opportunity.1').conditions.add('handover-complete');
assert.equal(compileDirectorInstruction({ direction, eligibleTargets }).move, 'surface-opportunity');
assert.equal(compileDirectorInstruction({ direction, eligibleTargets }).targetText, 'Discuss the outstanding assignment.');

assert.deepEqual(compileDirectorInstruction({
  direction: { move: 'respond-to-player', targetRef: null, requires: [], newComplications: 'allowed' },
  eligibleTargets: new Map(),
}), {
  move: 'respond-to-player',
  targetRef: null,
  targetText: null,
  instruction: 'Respond to the player within the current scene and reconciled state.',
  complicationInstruction: 'Any new complication must fit the supplied campaign constraints.',
});

assert.throws(() => compileDirectorInstruction({
  direction: { move: 'invent-plot', targetRef: null, requires: [], newComplications: 'avoid' },
  eligibleTargets: new Map(),
}), /director-move-invalid/);
assert.throws(() => compileDirectorInstruction({
  direction: { move: 'respond-to-player', targetRef: null, requires: [], newComplications: 'escalate' },
  eligibleTargets: new Map(),
}), /director-complication-policy-invalid/);
assert.equal(JSON.stringify(compileDirectorInstruction({
  direction: { move: 'surface-opportunity', targetRef: 'unknown', requires: [], newComplications: 'avoid' },
  eligibleTargets: new Map([['unknown', { id: 'unknown', playerSafeText: '', conditions: new Set() }]]),
})).includes('unknown'), false);

console.log('Director instruction tests passed.');
