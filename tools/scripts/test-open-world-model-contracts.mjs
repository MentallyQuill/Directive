import assert from 'node:assert/strict';
import fs from 'node:fs';

import { initializeOpenWorldCampaignState } from '../../src/directors/director-coordinator.mjs';
import { createGenerationRoleRegistry, GENERATION_ROLE_IDS } from '../../src/generation/generation-roles.mjs';
import { authorityForRole, listModelCallAuthorityMatrix } from '../../src/generation/model-call-authority-matrix.mjs';
import { buildQuestArchitectRequest, validateQuestArchitectureProposal } from '../../src/quests/quest-architect.mjs';
import { deterministicQuestActionInterpretation, validateQuestActionInterpretation } from '../../src/quests/action-interpreter.mjs';
import { questInstanceById } from '../../src/quests/quest-ledger.mjs';

const packageData = JSON.parse(fs.readFileSync(new URL('../../packages/bundled/breckenridge/ashes-of-peace.campaign-package.json', import.meta.url), 'utf8'));
const projection = JSON.parse(fs.readFileSync(new URL('../../packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json', import.meta.url), 'utf8'));
const now = () => '2026-06-22T15:00:00.000Z';
const state = initializeOpenWorldCampaignState({ packageData, baseState: projection.initialState, now });

const registry = createGenerationRoleRegistry();
const matrix = listModelCallAuthorityMatrix();
assert.equal(matrix.length, GENERATION_ROLE_IDS.length);
for (const entry of matrix) {
  const role = registry.get(entry.roleId);
  assert.equal(entry.providerKind, role.providerKind);
  assert.equal(entry.mayProposeState, role.mayProposeState === true);
  assert(Array.isArray(entry.tests) && entry.tests.length > 0, `${entry.roleId} must name maintained coverage.`);
}
for (const roleId of ['questActionInterpreter', 'questArchitect', 'sceneDeltaExtractor', 'sceneReconciliationExtractor']) {
  const authority = authorityForRole(roleId);
  assert.equal(authority.mayProposeState, false, `${roleId} may propose structured observations but never direct state deltas.`);
  assert.deepEqual(authority.allowedRoots, []);
}

const thread = {
  id: 'thread.dynamic.fixture',
  type: 'shipboard_maintenance',
  title: 'Calibration Drift',
  summary: 'Priya reported a repeated calibration drift.',
  participantIds: ['priya-nayar'],
  reinforcementCount: 2,
  playerInterest: 2,
  evidence: [{
    id: 'evidence.fixture',
    excerpt: 'Priya reported a repeated calibration drift.',
    observable: true,
    actorIds: ['priya-nayar'],
    sourceMessageIds: ['message.fixture'],
    anchorRange: { rangeHash: 'fixture-range' }
  }]
};
const request = buildQuestArchitectRequest({ thread, state, packageData });
assert(request.constraints.allowedActorIds.includes('priya-nayar'));
assert(!request.instruction.join(' ').toLowerCase().includes('decide success'));

const unauthorized = validateQuestArchitectureProposal({
  id: 'quest.emergent.bad-anchor',
  title: 'Unauthorized Proposal',
  anchors: { actorIds: ['invented-person'], locationIds: ['invented-place'], factionIds: [] },
  objectives: [{ label: 'One' }, { label: 'Two' }],
  approaches: ['One way', 'Another way'],
  outcomes: [{ id: 'done', summary: 'Done.', effects: [] }]
}, { thread, state, packageData, now });
assert.equal(unauthorized.ok, false);
assert.equal(unauthorized.diagnostics[0].code, 'unauthorized-anchor-reference');

const unauthorizedEffect = validateQuestArchitectureProposal({
  id: 'quest.emergent.bad-effect',
  title: 'Unauthorized Effect',
  anchors: { actorIds: ['priya-nayar'], locationIds: [state.worldState.currentLocationId], factionIds: [] },
  objectives: [{ label: 'Understand' }, { label: 'Respond' }],
  approaches: ['Review the logs', 'Ask the specialist'],
  outcomes: [{ id: 'done', summary: 'Done.', effects: [{ type: 'addFact', fact: { id: 'invented-secret', summary: 'Invented secret.' } }] }]
}, { thread, state, packageData, now });
assert.equal(unauthorizedEffect.ok, false);
assert.equal(unauthorizedEffect.diagnostics.at(-1).code, 'unauthorized-world-effect');

const fallback = deterministicQuestActionInterpretation({
  playerInput: 'Inspect the shuttle approach and confirm our rendezvous procedure.',
  state,
  packageData,
  questId: 'prelude-a-ship-underway'
});
assert.equal(fallback.ok, true);
const validObjectiveIds = new Set(questInstanceById(state.questLedger, 'prelude-a-ship-underway').objectiveStates.map((item) => item.id));
const validated = validateQuestActionInterpretation({
  intentKind: 'investigate',
  targetObjectiveIds: ['objective.invented-by-model'],
  approachTags: ['not-an-authorized-approach'],
  riskPosture: 'impossible',
  declaredMethod: 'Model-invented target.'
}, {
  playerInput: 'Inspect the shuttle approach and confirm our rendezvous procedure.',
  state,
  packageData,
  questId: 'prelude-a-ship-underway'
});
assert.equal(validated.ok, true);
assert(validated.interpretation.targetObjectiveIds.every((id) => validObjectiveIds.has(id)), 'Unknown objective ids must be discarded in favor of deterministic authorized targets.');
assert.notEqual(validated.interpretation.riskPosture, 'impossible');
assert(!validated.interpretation.approachTags.includes('not-an-authorized-approach'));

console.log('test-open-world-model-contracts: ok');
