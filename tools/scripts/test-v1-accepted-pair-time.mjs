import assert from 'node:assert/strict';

import {
  commitV1AcceptedPairTimeAdvance,
  invalidateV1AcceptedPairTimeByHostMessages,
  prepareV1AcceptedPairTimeAdvance
} from '../../src/runtime/v1-accepted-pair-time.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { createAshesInitialState } from './v1-test-fixtures.mjs';

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

const planned = prepareV1AcceptedPairTimeAdvance({
  campaignState: state,
  snapshot,
  packageData,
  timeDecision: {
    decision: 'advance',
    elapsedSeconds: 47,
    reason: 'accepted-scene-time',
    confidence: 0.92
  },
  now: () => '2026-08-09T12:00:00.000Z'
});
assert.equal(planned.ok, true);
assert.equal(planned.status, 'planned');
assert.deepEqual(planned.domains, ['campaign', 'worldState', 'timeLedger']);
assert.deepEqual(Object.keys(planned.patch).sort(), ['campaign', 'timeLedger', 'worldState']);
assert.equal(planned.patch.timeLedger.elapsedSeconds, 47);
assert.equal(planned.patch.timeLedger.entries.at(-1).id, planned.boundary.id);
assert.equal(planned.patch.timeLedger.decisions.at(-1).id, planned.decision.id);
assert.deepEqual(state.timeLedger.entries, [], 'planning must not mutate the input state');

const plannedZero = prepareV1AcceptedPairTimeAdvance({
  campaignState: state,
  snapshot: { ...snapshot, source: { ...snapshot.source, sourceRangeHash: 'range.plan-zero' } },
  packageData,
  timeDecision: { decision: 'unchanged', elapsedSeconds: 0, reason: 'same-second', confidence: 0.8 }
});
assert.equal(plannedZero.status, 'recorded');
assert.equal(plannedZero.patch.timeLedger.entries.length, 0);
assert.equal(plannedZero.patch.timeLedger.decisions.at(-1).decision, 'unchanged');

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
    elapsedSeconds: 47,
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
assert.equal(settled.campaignState.worldState.elapsedSeconds, 47);
assert.equal(settled.campaignState.worldState.elapsedMinutes, 0);
assert.equal(settled.campaignState.timeLedger.entries.at(-1).kind, 'directive.timeBoundary.v1');
assert.equal(settled.campaignState.timeLedger.entries.at(-1).elapsedSeconds, 47);
assert.equal(settled.campaignState.timeLedger.entries.at(-1).elapsedMinutes, 47 / 60);
assert.equal(settled.campaignState.timeLedger.entries.at(-1).sourceAnchorRange.rangeHash, 'range.accepted-pair.11');
assert.equal(settled.boundary.id, settled.campaignState.timeLedger.entries.at(-1).id);
assert.equal(settled.campaignState.timeLedger.elapsedSeconds, 47);
assert.equal(settled.campaignState.timeLedger.shipClock.secondOfDay, 30647);
assert.equal(settled.campaignState.timeLedger.shipClock.display, '08:30:47 hours');
assert.equal(settled.campaignState.timeLedger.decisions.length, 1);

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
    elapsedSeconds: 999,
    reason: 'deduplicated-replay',
    confidence: 1
  }
});
assert.equal(replay.ok, true);
assert.equal(replay.status, 'already-committed');
assert.equal(commits, 1);
assert.equal(replay.boundary.id, settled.boundary.id);

let zeroCommits = 0;
let zeroState = null;
const zero = await commitV1AcceptedPairTimeAdvance({
  campaignState: state,
  snapshot: {
    ...snapshot,
    source: { ...snapshot.source, sourceRangeHash: 'range.zero-time' }
  },
  packageData,
  stateDeltaGateway: {
    async commit(next) { zeroCommits += 1; zeroState = structuredClone(next); return structuredClone(next); }
  },
  timeDecision: {
    decision: 'unchanged',
    elapsedSeconds: 0,
    reason: 'same-minute',
    confidence: 0.9
  }
});
assert.equal(zero.ok, true);
assert.equal(zero.status, 'recorded');
assert.equal(zeroCommits, 1);
assert.equal(zeroState.timeLedger.decisions.at(-1).decision, 'unchanged');
assert.equal(zeroState.timeLedger.decisions.at(-1).elapsedSeconds, 0);
assert.equal(zeroState.timeLedger.entries.length, 0);

let indeterminateState = null;
const indeterminate = await commitV1AcceptedPairTimeAdvance({
  campaignState: state,
  snapshot: { ...snapshot, source: { ...snapshot.source, sourceRangeHash: 'range.indeterminate' } },
  packageData,
  stateDeltaGateway: {
    async commit(next) { indeterminateState = structuredClone(next); return structuredClone(next); }
  },
  timeDecision: {
    decision: 'indeterminate',
    elapsedSeconds: 0,
    reason: 'conflicting-visible-duration',
    confidence: 0.2
  }
});
assert.equal(indeterminate.status, 'recorded');
assert.equal(indeterminateState.timeLedger.decisions.at(-1).decision, 'indeterminate');

for (const [label, timeDecision] of [
  ['malformed fractional seconds', { decision: 'advance', elapsedSeconds: 1.5, reason: 'invalid', confidence: 0.8 }],
  ['excessive advance', { decision: 'advance', elapsedSeconds: 2678401, reason: 'invalid', confidence: 0.8 }],
  ['missing decision', { elapsedSeconds: 12, reason: 'invalid', confidence: 0.8 }],
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
rolloverState.timeLedger.shipClock = { minuteOfDay: 1438, display: '23:58:00 hours' };
const rollover = await commitV1AcceptedPairTimeAdvance({
  campaignState: rolloverState,
  snapshot: { ...snapshot, source: { ...snapshot.source, sourceRangeHash: 'range.rollover' } },
  packageData,
  stateDeltaGateway: { async commit(next) { return structuredClone(next); } },
  timeDecision: { decision: 'advance', elapsedSeconds: 125, reason: 'continuous-action', confidence: 0.9 },
  now: '2026-08-09T12:00:00.000Z'
});
assert.equal(rollover.campaignState.timeLedger.shipClock.minuteOfDay, 0);
assert.equal(rollover.campaignState.timeLedger.shipClock.secondOfDay, 5);
assert.equal(rollover.campaignState.timeLedger.shipClock.display, '00:00:05 hours');
assert.equal(rollover.campaignState.campaign.currentStardate, 53068.401447);

const longSkip = await commitV1AcceptedPairTimeAdvance({
  campaignState: rolloverState,
  snapshot: { ...snapshot, source: { ...snapshot.source, sourceRangeHash: 'range.long-skip' } },
  packageData,
  stateDeltaGateway: { async commit(next) { return structuredClone(next); } },
  timeDecision: { decision: 'advance', elapsedSeconds: 259200, reason: 'three-day-scene-cut', confidence: 0.95 },
  now: '2026-08-09T12:00:00.000Z'
});
assert.equal(longSkip.campaignState.timeLedger.shipClock.minuteOfDay, 1438);
assert.equal(longSkip.campaignState.campaign.currentStardate, 53071.4);

let cumulativeState = structuredClone(settled.campaignState);
const cumulative = await commitV1AcceptedPairTimeAdvance({
  campaignState: cumulativeState,
  snapshot: {
    ...snapshot,
    source: {
      ...snapshot.source,
      sourceRangeHash: 'range.second-sub-minute',
      previousAssistant: { ...snapshot.source.previousAssistant, hostMessageId: 'message.assistant.12' },
      currentPlayer: { ...snapshot.source.currentPlayer, hostMessageId: 'message.player.13' }
    }
  },
  packageData,
  stateDeltaGateway: { async commit(next) { cumulativeState = structuredClone(next); return structuredClone(next); } },
  timeDecision: { decision: 'advance', elapsedSeconds: 35, reason: 'continued-dialogue', confidence: 0.86 },
  now: '2026-08-09T12:01:00.000Z'
});
assert.equal(cumulative.campaignState.timeLedger.elapsedSeconds, 82);
assert.equal(cumulative.campaignState.timeLedger.elapsedMinutes, 1);
assert.equal(cumulative.campaignState.timeLedger.shipClock.secondOfDay, 30682);
assert.equal(cumulative.campaignState.timeLedger.shipClock.display, '08:31:22 hours');

let rebuiltState = null;
const rebuilt = await invalidateV1AcceptedPairTimeByHostMessages({
  campaignState: cumulative.campaignState,
  hostMessageIds: ['message.player.11'],
  packageData,
  stateDeltaGateway: { async commit(next) { rebuiltState = structuredClone(next); return structuredClone(next); } },
  now: '2026-08-09T12:02:00.000Z'
});
assert.equal(rebuilt.status, 'invalidated');
assert.equal(rebuilt.invalidatedBoundaryCount, 1);
assert.equal(rebuilt.invalidatedDecisionCount, 1);
assert.equal(rebuiltState.timeLedger.elapsedSeconds, 35);
assert.equal(rebuiltState.timeLedger.elapsedMinutes, 0);
assert.equal(rebuiltState.timeLedger.shipClock.display, '08:30:35 hours');
assert.equal(rebuiltState.timeLedger.entries.length, 1);
assert.equal(rebuiltState.timeLedger.decisions.length, 1);

let legacyState = createAshesInitialState({
  campaignId: 'campaign.legacy',
  saveId: 'save.legacy',
  chatId: 'chat.legacy'
});
delete legacyState.worldState.elapsedSeconds;
delete legacyState.timeLedger.elapsedSeconds;
delete legacyState.timeLedger.shipClock.secondOfDay;
delete legacyState.timeLedger.decisions;
const legacyGateway = createStateDeltaGateway({
  getState: () => legacyState,
  setState: (next) => { legacyState = next; },
  persist: async () => {},
  now: () => '2026-08-09T12:03:00.000Z'
});
const upgradedLegacy = await commitV1AcceptedPairTimeAdvance({
  campaignState: legacyState,
  snapshot: {
    ...snapshot,
    source: {
      ...snapshot.source,
      sourceRangeHash: 'range.legacy-upgrade',
      previousAssistant: { ...snapshot.source.previousAssistant, hostMessageId: 'message.legacy.assistant' },
      currentPlayer: { ...snapshot.source.currentPlayer, hostMessageId: 'message.legacy.player' }
    }
  },
  packageData,
  stateDeltaGateway: legacyGateway,
  timeDecision: { decision: 'unchanged', elapsedSeconds: 0, reason: 'legacy-same-second', confidence: 0.9 },
  now: '2026-08-09T12:03:00.000Z'
});
assert.equal(upgradedLegacy.status, 'recorded');
assert.equal(legacyState.timeLedger.elapsedSeconds, 0);
assert.equal(legacyState.timeLedger.shipClock.secondOfDay, 30600);
assert.equal(legacyState.timeLedger.decisions.length, 1);

console.log('V1 accepted-pair time custody tests passed.');
