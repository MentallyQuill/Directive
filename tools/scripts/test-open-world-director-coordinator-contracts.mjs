import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  coordinatorSnapshot,
  initializeOpenWorldCampaignState,
  timeAdvanceBoundary,
  travelBoundary
} from '../../src/directors/director-coordinator.mjs';

const root = process.cwd();
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
let state = initializeOpenWorldCampaignState({
  packageData,
  baseState: readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json').initialState,
  now: '2026-06-22T00:00:00.000Z'
});
const initialLocation = state.worldState.currentLocationId;
const destination = packageData.world.locations.find((location) => location.id !== initialLocation)?.id;
assert.ok(destination, 'expected a travel destination');

state = travelBoundary({
  state,
  packageData,
  destinationId: destination,
  now: '2026-06-22T00:01:00.000Z'
}).state;
assert.equal(state.worldState.currentLocationId, destination);
assert.ok(state.timeLedger.entries.some((entry) => entry.type === 'travel'));

const beforeStardate = state.worldState.currentStardate;
state = timeAdvanceBoundary({
  state,
  packageData,
  hours: 2,
  reason: 'test-time',
  now: '2026-06-22T00:02:00.000Z'
}).state;
assert.ok(state.worldState.currentStardate > beforeStardate);
assert.equal(state.worldState.currentStardate, Number((beforeStardate + (2 / 24)).toFixed(3)));
assert.equal(state.timeLedger.lastBoundary.elapsedMinutes, 120);

const beforeMinuteAdvance = state.worldState.elapsedMinutes;
state = timeAdvanceBoundary({
  state,
  packageData,
  minutes: 5,
  reason: 'intra-ship-transition',
  now: '2026-06-22T00:03:00.000Z'
}).state;
assert.equal(state.worldState.elapsedMinutes, beforeMinuteAdvance + 5);
assert.equal(state.timeLedger.lastBoundary.elapsedMinutes, 5);
assert.equal(state.timeLedger.lastBoundary.reason, 'intra-ship-transition');

const snapshot = coordinatorSnapshot(state, packageData);
assert.equal(snapshot.locationId, destination);
assert.equal(snapshot.foregroundQuestId, state.questLedger.foregroundQuestId);

console.log('Open-world director coordinator contracts passed: initialize, travel, time, and snapshot');
