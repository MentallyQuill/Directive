import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  coordinatorSnapshot,
  initializeOpenWorldCampaignState,
  invalidateOpenWorldCausalityForReconciliation,
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
assert.equal(state.runtimeTracking.lastWorldBoundary.authority, 'openWorldBoundaryProjection');
assert.equal(state.runtimeTracking.lastWorldBoundary.projectionSource, 'directorCoordinator');
assert.equal(state.runtimeTracking.lastWorldBoundary.compatibilityMirror.kind, 'directive.openWorldBoundaryProjectionRef.v1');

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
assert.equal(snapshot.pendingReconciliationCount, 0);

const nestedOnlySceneState = initializeOpenWorldCampaignState({
  packageData,
  baseState: {
    campaign: { id: 'nested-scene-reconciliation-must-not-promote' },
    runtimeTracking: {
      schemaVersion: 2,
      revision: 0,
      sceneReconciliation: {
        pending: [{ id: 'legacy-nested-sre-pending', status: 'pending' }]
      }
    }
  },
  now: '2026-06-22T00:04:00.000Z'
});
assert.deepEqual(
  nestedOnlySceneState.sceneReconciliation.pending,
  [],
  'Open-world initialization must not promote nested runtimeTracking.sceneReconciliation into top-level SRE authority.'
);
assert.equal(
  coordinatorSnapshot(nestedOnlySceneState, packageData).pendingReconciliationCount,
  0,
  'Open-world snapshot must ignore nested runtimeTracking.sceneReconciliation pending rows.'
);

const topLevelSceneState = initializeOpenWorldCampaignState({
  packageData,
  baseState: {
    campaign: { id: 'top-level-scene-reconciliation-survives' },
    sceneReconciliation: {
      pending: [{ id: 'top-level-sre-pending', status: 'pending' }]
    },
    runtimeTracking: {
      schemaVersion: 2,
      revision: 0
    }
  },
  now: '2026-06-22T00:05:00.000Z'
});
assert.deepEqual(topLevelSceneState.sceneReconciliation.pending.map((entry) => entry.id), ['top-level-sre-pending']);
assert.equal(coordinatorSnapshot(topLevelSceneState, packageData).pendingReconciliationCount, 1);

const invalidationRange = {
  chatId: 'chat-open-world-invalidations',
  startHostMessageId: 'source-1',
  endHostMessageId: 'source-2',
  rangeHash: 'range-open-world-invalidation'
};
const staleMutationState = initializeOpenWorldCampaignState({
  packageData,
  baseState: {
    campaign: { id: 'old-ledger-stale-mutation-must-not-return' },
    runtimeTracking: {
      schemaVersion: 2,
      revision: 0,
      responseLedger: [{
        id: 'old-response-row',
        outcomeId: 'outcome.open-world.old',
        sourceAnchorRange: invalidationRange
      }],
      sidecarJournal: [{
        id: 'old-sidecar-row',
        sourceOutcomeId: 'outcome.open-world.old',
        sourceAnchorRange: invalidationRange
      }],
      modelCallJournal: [{
        id: 'old-model-call-row',
        outcomeId: 'outcome.open-world.old',
        sourceAnchorRange: invalidationRange
      }]
    }
  },
  now: '2026-06-22T00:06:00.000Z'
});
staleMutationState.eventLedger.committedEvents.push({
  id: 'event.open-world.old',
  sequence: staleMutationState.eventLedger.nextSequence++,
  type: 'test.anchor',
  status: 'committed',
  invalidated: false,
  sourceOutcomeId: 'outcome.open-world.old',
  sourceAnchorRange: invalidationRange,
  causalParentIds: [],
  actorIds: [],
  factionIds: [],
  locationIds: [],
  tags: [],
  payload: {}
});
staleMutationState.dynamicQuestCatalog.templates.push({
  id: 'quest.open-world.old',
  title: 'Old anchored quest',
  provenance: { anchorRange: invalidationRange }
});
staleMutationState.questLedger.instances.push({
  id: 'quest.open-world.old',
  templateId: 'quest.open-world.old',
  sourceEventIds: ['event.open-world.old'],
  sourceAnchorRange: invalidationRange,
  metadata: {}
});
const invalidation = invalidateOpenWorldCausalityForReconciliation(staleMutationState, {
  anchorRange: invalidationRange,
  outcomeIds: ['outcome.open-world.old'],
  reason: 'test-source-changed',
  now: '2026-06-22T00:07:00.000Z'
});
assert.equal(invalidation.state.eventLedger.committedEvents[0].invalidated, true);
assert.equal(invalidation.state.dynamicQuestCatalog.templates.find((item) => item.id === 'quest.open-world.old').stale, true);
assert.equal(invalidation.state.questLedger.instances.find((item) => item.id === 'quest.open-world.old').metadata.stale, true);
assert.equal(invalidation.state.runtimeTracking.responseLedger[0].stale, undefined);
assert.equal(invalidation.state.runtimeTracking.sidecarJournal[0].stale, undefined);
assert.equal(invalidation.state.runtimeTracking.modelCallJournal[0].stale, undefined);
assert.ok(
  invalidation.state.sceneReconciliation.invalidations.some((entry) => (
    entry.reason === 'test-source-changed'
    && entry.anchorRange?.rangeHash === invalidationRange.rangeHash
    && entry.outcomeIds?.includes('outcome.open-world.old')
  )),
  'Open-world invalidation evidence must stay in top-level Scene Reconciliation instead of mutating old runtime ledgers.'
);

console.log('Open-world director coordinator contracts passed: initialize, travel, time, and snapshot');
