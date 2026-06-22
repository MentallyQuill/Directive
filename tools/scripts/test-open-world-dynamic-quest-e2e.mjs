import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  initializeOpenWorldCampaignState,
  resolveQuestBoundary
} from '../../src/directors/director-coordinator.mjs';
import { processCommittedConversation, eligibleThreadsForPromotion } from '../../src/threads/thread-engine.mjs';
import { architectQuestFromThread, registerArchitectedQuest } from '../../src/quests/quest-architect.mjs';
import { activateQuest, openWorldQuestView } from '../../src/quests/quest-director.mjs';
import { deterministicQuestActionInterpretation } from '../../src/quests/action-interpreter.mjs';
import { applySystemicQuestProgress, resolveSystemicQuestAction } from '../../src/quests/systemic-quest-resolver.mjs';
import { questInstanceById, questTemplateById } from '../../src/quests/quest-ledger.mjs';

const packageData = JSON.parse(fs.readFileSync(new URL('../../packages/bundled/breckenridge/ashes-of-peace.campaign-package.json', import.meta.url), 'utf8'));
const projection = JSON.parse(fs.readFileSync(new URL('../../packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json', import.meta.url), 'utf8'));
let tick = 0;
const now = () => `2026-06-22T13:${String(tick++).padStart(2, '0')}:00.000Z`;
let state = initializeOpenWorldCampaignState({ packageData, baseState: projection.initialState, now });
const participants = ['priya-nayar', 'player-commander'];

for (const [index, texts] of [
  ['Priya says her routine sensor calibration checks are falling behind and she cannot identify the source of the drift.', 'I will help. Show me the logs so we can understand the problem.'],
  ['Priya reports that the same maintenance calibration backlog is still interfering with her shift.', 'We will follow through, build a support plan, and verify the result later.']
].entries()) {
  const processed = processCommittedConversation({
    state,
    packageData,
    conversation: {
      turnId: `turn.seed.${index + 1}`,
      committed: true,
      presentCharacterIds: participants,
      messages: [
        { id: `seed.${index + 1}.assistant`, role: 'assistant', text: texts[0] },
        { id: `seed.${index + 1}.user`, role: 'user', text: texts[1] }
      ]
    },
    now
  });
  state = processed.state;
}

const eligible = eligibleThreadsForPromotion(state.threadLedger, packageData);
assert.equal(eligible.length, 1);
const thread = eligible[0];
const architecture = await architectQuestFromThread({ thread, state, packageData, generationRouter: null, now });
assert.equal(architecture.ok, true);
assert.equal(architecture.template.objectives.length, 3);
assert(architecture.template.approaches.length >= 2);
assert.equal(architecture.template.systemicResolution.failureForward, true);

const registered = registerArchitectedQuest({ state, threadId: thread.id, architecture, now });
state = registered.state;
const questId = registered.instance.id;
assert(questTemplateById(packageData, questId, state), 'Dynamic template must be retrievable from save-owned catalog.');
assert(questInstanceById(state.questLedger, questId), 'Dynamic quest instance must be persistent.');
assert.equal(state.threadLedger.records.find((item) => item.id === thread.id).promotedQuestId, questId);

state = activateQuest(state, packageData, questId, { now, reason: 'test-activate' });
assert.equal(state.questLedger.foregroundQuestId, questId);
assert.deepEqual(state.attentionState.questFocusStack, ['prelude-a-ship-underway']);

const actionTexts = [
  'Carefully inspect the logs and diagnose the source of the calibration drift.',
  'Reallocate time and resources to implement a workable support plan.',
  'Verify the result, follow up with Priya, and confirm the calibration remains stable.'
];
let completedPacket = null;
let turn = 0;
for (const action of actionTexts) {
  // Repeat each stage as needed; deterministic failure-forward always makes bounded progress.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    turn += 1;
    const interpreted = deterministicQuestActionInterpretation({ playerInput: action, state, packageData, questId });
    assert.equal(interpreted.ok, true);
    const packet = resolveSystemicQuestAction({
      state,
      packageData,
      turnId: `turn.dynamic.${turn}`,
      playerInput: action,
      interpretation: interpreted.interpretation,
      questId
    });
    state = applySystemicQuestProgress(state, packet, { now });
    if (packet.outcomePacket.questCompleted) {
      completedPacket = packet;
      break;
    }
    const target = interpreted.interpretation.targetObjectiveIds[0];
    if (questInstanceById(state.questLedger, questId).objectiveStates.find((item) => item.id === target)?.status === 'complete') break;
  }
  if (completedPacket) break;
}
assert(completedPacket, 'Systemic resolver must complete all required objectives in bounded turns.');

const resolution = resolveQuestBoundary({
  state,
  packageData,
  questId,
  outcomeId: completedPacket.outcomePacket.id,
  outcomeKey: completedPacket.outcomePacket.questOutcomeKey,
  now
});
state = resolution.state;
const resolved = questInstanceById(state.questLedger, questId);
assert.equal(resolved.status, 'resolved');
assert.equal(state.questLedger.foregroundQuestId, 'prelude-a-ship-underway', 'Completing a side quest must resume the prior foreground quest.');
assert.equal(state.attentionState.questFocusStack.length, 0);
assert(resolution.events.some((item) => item.type === 'quest.emergent.resolved'));
assert(state.attentionState.flags.some((item) => item.id === 'emergent-quest-consequence-recorded'), 'World reaction must persist the generated quest consequence.');
assert(state.eventLedger.committedEvents.some((item) => item.sourceQuestId === questId));

const view = openWorldQuestView(state, packageData);
assert(view.quests.some((item) => item.id === questId && item.status === 'resolved'));

console.log('test-open-world-dynamic-quest-e2e: ok');
