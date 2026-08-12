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
const settled = await commitV1AcceptedPairTimeAdvance({
  campaignState: currentState,
  snapshot,
  packageData,
  stateDeltaGateway,
  timeDecision: {
    decision: 'advance',
    elapsedMinutes: 12,
    reason: 'accepted-scene-time',
    confidence: 0.92
  },
  ingressId: 'ingress.11',
  now: () => '2026-08-09T12:00:00.000Z'
});
assert.equal(settled.ok, true);
assert.equal(settled.status, 'committed');
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
  timeDecision: {
    decision: 'advance',
    elapsedMinutes: 999,
    reason: 'deduplicated-replay',
    confidence: 1
  }
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
  timeDecision: {
    decision: 'unchanged',
    elapsedMinutes: 0,
    reason: 'same-minute',
    confidence: 0.9
  }
});
assert.equal(zero.ok, true);
assert.equal(zero.status, 'no-change');
assert.equal(zeroCommits, 0);

for (const [label, timeDecision] of [
  ['indeterminate', { decision: 'indeterminate', elapsedMinutes: 0, reason: 'unclear', confidence: 0.2 }],
  ['malformed fractional minutes', { decision: 'advance', elapsedMinutes: 1.5, reason: 'invalid', confidence: 0.8 }],
  ['excessive advance', { decision: 'advance', elapsedMinutes: 44641, reason: 'invalid', confidence: 0.8 }],
  ['missing decision', { elapsedMinutes: 12, reason: 'invalid', confidence: 0.8 }],
  ['missing time output', null]
]) {
  let invalidCommits = 0;
  const result = await commitV1AcceptedPairTimeAdvance({
    campaignState: state,
    snapshot: {
      ...snapshot,
      source: { ...snapshot.source, sourceRangeHash: `range.${label}` }
    },
    packageData,
    stateDeltaGateway: { async commit() { invalidCommits += 1; } },
    timeDecision
  });
  assert.equal(result.status, 'no-change', label);
  assert.equal(invalidCommits, 0, label);
}

const rolloverState = structuredClone(state);
rolloverState.campaign.openingStardate = 53068.4;
rolloverState.campaign.currentStardate = 53068.4;
rolloverState.campaign.openingMinuteOfDay = 1438;
rolloverState.worldState.currentStardate = 53068.4;
rolloverState.timeLedger.openingMinuteOfDay = 1438;
rolloverState.timeLedger.stardate = 53068.4;
rolloverState.timeLedger.shipClock = { minuteOfDay: 1438, display: '2358 hours' };
const rollover = await commitV1AcceptedPairTimeAdvance({
  campaignState: rolloverState,
  snapshot: { ...snapshot, source: { ...snapshot.source, sourceRangeHash: 'range.rollover' } },
  packageData,
  stateDeltaGateway: { async commit(next) { return structuredClone(next); } },
  timeDecision: { decision: 'advance', elapsedMinutes: 5, reason: 'continuous-action', confidence: 0.9 },
  now: '2026-08-09T12:00:00.000Z'
});
assert.equal(rollover.campaignState.timeLedger.shipClock.minuteOfDay, 3);
assert.equal(rollover.campaignState.timeLedger.shipClock.display, '0003 hours');
assert.equal(rollover.campaignState.campaign.currentStardate, 53068.403);

const longSkip = await commitV1AcceptedPairTimeAdvance({
  campaignState: rolloverState,
  snapshot: { ...snapshot, source: { ...snapshot.source, sourceRangeHash: 'range.long-skip' } },
  packageData,
  stateDeltaGateway: { async commit(next) { return structuredClone(next); } },
  timeDecision: { decision: 'advance', elapsedMinutes: 4320, reason: 'three-day-scene-cut', confidence: 0.95 },
  now: '2026-08-09T12:00:00.000Z'
});
assert.equal(longSkip.campaignState.timeLedger.shipClock.minuteOfDay, 1438);
assert.equal(longSkip.campaignState.campaign.currentStardate, 53071.4);

console.log('V1 accepted-pair time custody tests passed.');
