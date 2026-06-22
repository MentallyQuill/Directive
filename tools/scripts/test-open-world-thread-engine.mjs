import assert from 'node:assert/strict';
import fs from 'node:fs';

import { initializeOpenWorldCampaignState } from '../../src/directors/director-coordinator.mjs';
import { extractSceneDelta } from '../../src/threads/scene-delta-extractor.mjs';
import {
  decayThreadLedger,
  eligibleThreadsForPromotion,
  processCommittedConversation
} from '../../src/threads/thread-engine.mjs';

const packageData = JSON.parse(fs.readFileSync(new URL('../../packages/bundled/breckenridge/ashes-of-peace.campaign-package.json', import.meta.url), 'utf8'));
const projection = JSON.parse(fs.readFileSync(new URL('../../packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json', import.meta.url), 'utf8'));
let clock = 0;
const now = () => `2026-06-22T12:${String(clock++).padStart(2, '0')}:00.000Z`;
let state = initializeOpenWorldCampaignState({ packageData, baseState: projection.initialState, now });
const knownActorIds = ['priya-nayar', 'player-commander'];

const mixed = extractSceneDelta({
  turnId: 'turn.mixed',
  committed: true,
  presentCharacterIds: knownActorIds,
  messages: [
    { id: 'mixed.assistant', role: 'assistant', text: 'Priya admits that her girlfriend and she have not spoken in weeks. She is also falling behind on a maintenance calibration.' },
    { id: 'mixed.user', role: 'user', text: 'Tell me what support you actually want. I will help with the maintenance plan and check in later.' }
  ]
}, { knownActorIds });
assert.equal(mixed.signals.length, 2, 'Relationship and maintenance concerns must remain distinct signals.');
assert.deepEqual(new Set(mixed.signals.map((item) => item.group)), new Set(['relationship', 'work-task']));

const first = processCommittedConversation({
  state,
  packageData,
  conversation: {
    turnId: 'turn.maintenance.1',
    committed: true,
    presentCharacterIds: knownActorIds,
    messages: [
      { id: 'm1.assistant', role: 'assistant', text: 'Priya says she is falling behind on routine EPS calibration checks and does not know why the sequence keeps drifting.' },
      { id: 'm1.user', role: 'user', text: 'I will help you establish the cause and build a workable maintenance plan.' }
    ]
  },
  now
});
state = first.state;
assert.equal(first.createdThreadIds.length, 1);
const dynamicThreadId = first.createdThreadIds[0];
let dynamicThread = state.threadLedger.records.find((item) => item.id === dynamicThreadId);
assert(dynamicThread);
assert.equal(dynamicThread.type, 'shipboard_maintenance');
assert.equal(dynamicThread.playerInterest, 1);
assert(['engaged', 'active'].includes(dynamicThread.status), 'Player engagement may immediately activate a thread when pacing bandwidth is available.');

const second = processCommittedConversation({
  state,
  packageData,
  conversation: {
    turnId: 'turn.maintenance.2',
    committed: true,
    presentCharacterIds: knownActorIds,
    messages: [
      { id: 'm2.assistant', role: 'assistant', text: 'The same calibration backlog is still causing Priya trouble during her routine maintenance shift.' },
      { id: 'm2.user', role: 'user', text: 'We will follow up now. Show me the maintenance records and the drift.' }
    ]
  },
  now
});
state = second.state;
assert.equal(second.createdThreadIds.length, 0, 'A paraphrase of the same concern must not create a duplicate thread.');
assert.equal(second.mergedThreads.length, 1);
dynamicThread = state.threadLedger.records.find((item) => item.id === dynamicThreadId);
assert.equal(dynamicThread.reinforcementCount, 2);
assert.equal(dynamicThread.evidence.length, 2);
assert.equal(eligibleThreadsForPromotion(state.threadLedger, packageData).length, 1);

const hidden = processCommittedConversation({
  state,
  packageData,
  conversation: {
    turnId: 'turn.private',
    committed: true,
    presentCharacterIds: knownActorIds,
    messages: [
      { id: 'private.assistant', role: 'assistant', text: 'Secretly, without telling Priya, someone read her private diary about the relationship.' }
    ]
  },
  now,
  allowPrivacyReview: false
});
assert(hidden.rejected.some((item) => item.reason === 'privacy-review-required'), 'Private/speculative evidence must not become a thread automatically.');

let decayed = state.threadLedger;
for (let index = 0; index < 13; index += 1) {
  decayed = decayThreadLedger(decayed, { packageData, boundaryType: 'time-advance', now }).ledger;
}
assert(['engaged', 'active'].includes(decayed.records.find((item) => item.id === dynamicThreadId).status), 'A player-engaged thread must not expire merely because time advances.');

// Remove player engagement to verify bounded decay/expiry behavior itself.
const passive = structuredClone(state.threadLedger);
const passiveIndex = passive.records.findIndex((item) => item.id === dynamicThreadId);
passive.records[passiveIndex].status = 'watchlisted';
passive.records[passiveIndex].playerInterest = 0;
passive.records[passiveIndex].boundaryLastReinforced = 0;
passive.pacing.boundaryIndex = 0;
let passiveLedger = passive;
for (let index = 0; index < 13; index += 1) passiveLedger = decayThreadLedger(passiveLedger, { packageData, boundaryType: 'time-advance', now }).ledger;
assert.equal(passiveLedger.records.find((item) => item.id === dynamicThreadId).status, 'expired');

console.log('test-open-world-thread-engine: ok');
