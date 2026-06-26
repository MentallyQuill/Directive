import assert from 'node:assert/strict';
import fs from 'node:fs';

import { initializeOpenWorldCampaignState } from '../../src/directors/director-coordinator.mjs';
import { refreshCommandBearing } from '../../src/command/command-bearing.mjs';
import { extractSceneDelta, extractSceneDeltaWithModel } from '../../src/threads/scene-delta-extractor.mjs';
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
const stateBeforeThreadClosure = structuredClone(state);

state.commandBearing = refreshCommandBearing({
  ...(state.commandBearing || {}),
  evidenceLedger: {
    records: [{
      id: 'bearing-evidence.maintenance.resolve',
      sourceOutcomeId: 'outcome.maintenance.2',
      sourceTurnId: 'turn.maintenance.2',
      threadId: dynamicThreadId,
      primarySignal: 'resolve',
      trackSignals: ['resolve'],
      strength: 'strong',
      criteria: { agency: true, commitment: true, causality: true },
      actionSummary: 'Committed command attention to Priya maintenance drift.',
      consequenceSummary: 'The maintenance concern moved from background worry to command-owned follow-up.',
      playerFacingSummary: 'This may support Resolve because the commander accepted ownership of a persistent operational problem.',
      visible: true,
      status: 'open'
    }]
  }
});

const extractedFallbackClosure = await extractSceneDeltaWithModel({
  knownActorIds,
  currentThreads: [
    ...state.threadLedger.records,
    {
      id: 'thread.hesperus-intake-open',
      status: 'active',
      title: 'Hesperus Intake Follow-Up',
      summary: 'Nayar and Sato still need to complete the separate Hesperus intake review.',
      participantIds: ['priya-nayar']
    }
  ],
  scene: {
    turnId: 'turn.maintenance.close.fallback',
    committed: true,
    outcomePacket: { id: 'outcome.maintenance.close.fallback', summary: 'The maintenance calibration thread is closed while the Hesperus intake issue stays open.' },
    messages: [
      { id: 'close.fallback.user', role: 'user', text: 'The maintenance calibration thread is closed. Priya has a workable plan and no more command action is needed there. The separate Hesperus intake issue stays open until Nayar and Sato finish their review.' }
    ]
  },
  generationRouter: {
    async generate() {
      throw new Error('scene-delta-provider-timeout');
    }
  }
});
assert.equal(extractedFallbackClosure.fallback, true, 'Provider failure should fall back to deterministic scene-delta extraction.');
assert(
  extractedFallbackClosure.sceneDelta.threadClosures.some((closure) => closure.threadId === dynamicThreadId),
  'Explicit closure language should close a matching known current thread even when the model fails.'
);
assert(
  !extractedFallbackClosure.sceneDelta.threadClosures.some((closure) => closure.threadId === 'thread.hesperus-intake-open'),
  'A separately mentioned follow-up that stays open must not be closed by deterministic fallback.'
);

const modelClosureCalls = [];
const extractedClosure = await extractSceneDeltaWithModel({
  knownActorIds,
  currentThreads: state.threadLedger.records,
  scene: {
    turnId: 'turn.maintenance.close',
    committed: true,
    outcomePacket: { id: 'outcome.maintenance.close', summary: 'Priya has a workable calibration plan and no longer needs the issue held open.' },
    closureSignals: {
      possibleClosure: true,
      confidence: 'medium',
      closureTypes: ['thread'],
      playerFacingReason: 'The maintenance follow-up appears to have reached a stopping point.'
    },
    messages: [
      { id: 'close.assistant', role: 'assistant', text: 'Priya closes the final maintenance ticket and says the calibration sequence is stable now.' }
    ]
  },
  generationRouter: {
    async generate(roleId, request) {
      modelClosureCalls.push({ roleId, request });
      return {
        ok: true,
        response: {
          text: JSON.stringify({
            observableSummary: 'Priya closes the final maintenance ticket and the calibration sequence is stable.',
            signals: [],
            threadClosures: [{
              threadId: dynamicThreadId,
              resolved: true,
              summary: 'Priya has a workable calibration plan and no longer needs the issue held open.'
            }, {
              threadId: 'thread.not-known',
              resolved: true,
              summary: 'Unknown threads must not be closed by model output.'
            }]
          })
        }
      };
    }
  }
});
assert.equal(extractedClosure.fallback, false, 'A valid model-proposed thread closure should not fall back to deterministic extraction.');
assert.equal(extractedClosure.sceneDelta.threadClosures.length, 1, 'Only known current threads may be closed by scene-delta output.');
assert.equal(extractedClosure.sceneDelta.threadClosures[0].threadId, dynamicThreadId);
assert.equal(extractedClosure.sceneDelta.threadClosures[0].sourceOutcomeId, 'outcome.maintenance.close');
assert.match(modelClosureCalls[0].request.prompt, /currentThreads/, 'Scene-delta closure extraction must supply current thread ids to the model.');

const closed = processCommittedConversation({
  state,
  packageData,
  conversation: extractedClosure.sceneDelta,
  now
});
state = closed.state;
assert.equal(closed.threadClosureReviews.length, 1, 'Committed scene thread closures should update the thread ledger.');
assert.equal(state.threadLedger.records.find((item) => item.id === dynamicThreadId).status, 'resolved');
assert.equal(state.threadLedger.closureReviews[0].sourceOutcomeId, 'outcome.maintenance.close', 'Thread closure reviews must retain source outcome provenance.');
assert.equal(closed.commandBearingReviewPlan.reviewQueue.length, 1, 'Thread closure plus open Command Bearing evidence should queue a review candidate.');
assert.deepEqual(closed.commandBearingReviewPlan.reviewQueue[0].evidenceIds, ['bearing-evidence.maintenance.resolve']);
assert.equal(closed.commandBearingReviewPlan.reviewQueue[0].utilitySuggested, true);

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

let decayed = stateBeforeThreadClosure.threadLedger;
for (let index = 0; index < 13; index += 1) {
  decayed = decayThreadLedger(decayed, { packageData, boundaryType: 'time-advance', now }).ledger;
}
assert(['engaged', 'active'].includes(decayed.records.find((item) => item.id === dynamicThreadId).status), 'A player-engaged thread must not expire merely because time advances.');

// Remove player engagement to verify bounded decay/expiry behavior itself.
const passive = structuredClone(stateBeforeThreadClosure.threadLedger);
const passiveIndex = passive.records.findIndex((item) => item.id === dynamicThreadId);
passive.records[passiveIndex].status = 'watchlisted';
passive.records[passiveIndex].playerInterest = 0;
passive.records[passiveIndex].boundaryLastReinforced = 0;
passive.pacing.boundaryIndex = 0;
let passiveLedger = passive;
for (let index = 0; index < 13; index += 1) passiveLedger = decayThreadLedger(passiveLedger, { packageData, boundaryType: 'time-advance', now }).ledger;
assert.equal(passiveLedger.records.find((item) => item.id === dynamicThreadId).status, 'expired');

console.log('test-open-world-thread-engine: ok');
