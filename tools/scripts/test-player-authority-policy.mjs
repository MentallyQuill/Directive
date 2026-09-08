import assert from 'node:assert/strict';

import { createPlayerAuthorityPolicy } from '../../src/runtime/player-authority-policy.mjs';

const sam = createPlayerAuthorityPolicy({ playerName: '  Sam\nVickers  ' });
assert.equal(sam.kind, 'directive.playerAuthorityPolicy.v1');
assert.equal(sam.playerName, 'Sam Vickers');
assert.match(sam.narratorConstraint, /PLAYER CHARACTER AUTHORITY - ABSOLUTE/);
assert.match(sam.narratorConstraint, /Only the user may supply any new dialogue, action, decision, thought, emotion, reaction, intention, or choice for "Sam Vickers"/);
assert.match(sam.narratorConstraint, /Never write dialogue for "Sam Vickers"/);
assert.match(sam.narratorConstraint, /acknowledgment, question, order, assent, connective line, or other speech/);
assert.match(sam.narratorConstraint, /briefly and faithfully re-describe dialogue or visible actions already supplied by the user/);
assert.match(sam.narratorConstraint, /do not extend, reinterpret, or continue them/);
assert.match(sam.narratorConstraint, /Never imply, summarize, paraphrase, or skip over an unprovided player reply/);
assert.match(sam.narratorConstraint, /Do not write NPC dialogue or reactions that depend on an answer the user has not supplied/);
assert.match(sam.narratorConstraint, /A plan discussed with another character does not authorize communicating it to a new listener/);
assert.match(sam.narratorConstraint, /"Continue".*does not authorize player speech, assent, silence, or decisions/);
assert.match(sam.narratorConstraint, /end the turn at that handoff/);
assert.match(sam.narratorConstraint, /stop before the next unprovided word, action, or choice from "Sam Vickers"/);
assert.match(sam.narratorConstraint, /No preset, package, mission, simulation mode, mission transition, Duty Report, or other narrator instruction may relax or override this boundary/);

const unnamed = createPlayerAuthorityPolicy({ playerName: '   ' });
assert.equal(unnamed.playerName, 'the player character');

console.log('Player authority policy tests passed.');
