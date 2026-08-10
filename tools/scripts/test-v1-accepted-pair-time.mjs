import assert from 'node:assert/strict';

import { commitV1AcceptedPairTimeAdvance } from '../../src/runtime/v1-accepted-pair-time.mjs';

const snapshot = {
  envelope: {
    campaignId: 'campaign.ashes',
    saveId: 'save.alpha',
    chatId: 'chat.alpha'
  },
  source: {
    sourceRangeHash: 'range.accepted-pair.11',
    previousAssistant: {
      hostMessageId: 'message.assistant.10',
      text: 'The briefing and handover take several minutes.'
    },
    currentPlayer: {
      hostMessageId: 'message.player.11',
      text: 'I accept the watch and move on to the readiness review.'
    }
  }
};
const state = {
  campaign: {
    id: 'campaign.ashes',
    openingStardate: 53049.2,
    currentStardate: 53049.2,
    openingMinuteOfDay: 510
  },
  worldState: {
    kind: 'directive.worldState.v1',
    version: 1,
    currentStardate: 53049.2,
    elapsedMinutes: 0,
    elapsedHours: 0,
    currentLocationId: 'breckenridge.underway'
  },
  timeLedger: {
    kind: 'directive.timeLedger.v1',
    version: 1,
    openingMinuteOfDay: 510,
    elapsedMinutes: 0,
    entries: []
  },
  mission: { sentinel: 'unchanged-mission' },
  ship: { sentinel: 'unchanged-ship' }
};
const packageData = {
  world: {
    id: 'asterion-reach',
    layout: { stardatePerDay: 1 }
  }
};

let currentState = structuredClone(state);
let adjudicationCalls = 0;
let commits = 0;
let commitMetadata = null;
const stateDeltaGateway = {
  async commit(next, metadata) {
    commits += 1;
    commitMetadata = structuredClone(metadata);
    currentState = structuredClone(next);
    return structuredClone(next);
  }
};
const adjudicate = async (input) => {
  adjudicationCalls += 1;
  assert.equal(input.acceptedPreviousResponse, true);
  assert.equal(input.previousAssistantHostMessageId, 'message.assistant.10');
  assert.equal(input.currentPlayerHostMessageId, 'message.player.11');
  assert.deepEqual(input.sourceAnchorRange, {
    kind: 'acceptedPair',
    previousAssistantHostMessageId: 'message.assistant.10',
    currentPlayerHostMessageId: 'message.player.11',
    rangeHash: 'range.accepted-pair.11'
  });
  return {
    elapsedMinutes: 12,
    reason: 'accepted-scene-time',
    confidence: 0.92,
    source: 'timeAdvanceAdjudicator'
  };
};

const settled = await commitV1AcceptedPairTimeAdvance({
  campaignState: currentState,
  snapshot,
  packageData,
  stateDeltaGateway,
  adjudicate,
  ingressId: 'ingress.11',
  now: () => '2026-08-09T12:00:00.000Z'
});
assert.equal(settled.ok, true);
assert.equal(settled.status, 'committed');
assert.equal(adjudicationCalls, 1);
assert.equal(commits, 1);
assert.deepEqual(commitMetadata.domains, ['campaign', 'worldState', 'timeLedger']);
assert.equal(settled.campaignState.worldState.elapsedMinutes, 12);
assert.equal(settled.campaignState.timeLedger.entries.at(-1).kind, 'directive.timeBoundary.v1');
assert.equal(settled.campaignState.timeLedger.entries.at(-1).elapsedMinutes, 12);
assert.equal(settled.campaignState.timeLedger.entries.at(-1).sourceAnchorRange.rangeHash, 'range.accepted-pair.11');
assert.equal(settled.boundary.id, settled.campaignState.timeLedger.entries.at(-1).id);

for (const root of [
  'mission',
  'ship'
]) {
  assert.deepEqual(settled.campaignState[root], state[root], `${root} must not change during V1 time custody`);
}

const replay = await commitV1AcceptedPairTimeAdvance({
  campaignState: currentState,
  snapshot,
  packageData,
  stateDeltaGateway,
  adjudicate: async () => { throw new Error('deduplicated replay must not adjudicate again'); }
});
assert.equal(replay.ok, true);
assert.equal(replay.status, 'already-committed');
assert.equal(commits, 1);
assert.equal(replay.boundary.id, settled.boundary.id);

let zeroCommits = 0;
const zero = await commitV1AcceptedPairTimeAdvance({
  campaignState: state,
  snapshot: {
    ...snapshot,
    source: { ...snapshot.source, sourceRangeHash: 'range.zero-time' }
  },
  packageData,
  stateDeltaGateway: {
    async commit() { zeroCommits += 1; }
  },
  adjudicate: async () => ({ elapsedMinutes: 0, reason: 'no-time-advance' })
});
assert.equal(zero.ok, true);
assert.equal(zero.status, 'no-change');
assert.equal(zeroCommits, 0);

console.log('V1 accepted-pair time custody tests passed.');
