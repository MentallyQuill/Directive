import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { commitDirectorTurn } from '../../src/campaign/transaction-state.mjs';
import { stableJsonByteLength } from '../../src/runtime/architecture-redesign-contracts.mjs';
import {
  applyOpenWorldReducerBundle,
  compactOpenWorldReducerBundleRef,
  createOpenWorldReducerBundle,
  pickOpenWorldReducerState,
  validateOpenWorldReducerBundle
} from '../../src/directors/open-world-event-reducers.mjs';
import { createDirectorCoordinatorTurn } from '../../src/directors/open-world-turn-coordinator.mjs';
import {
  chooseForegroundQuest,
  initializeOpenWorldCampaignState,
  timeAdvanceBoundary,
  travelBoundary
} from '../../src/directors/director-coordinator.mjs';
import { transitionQuest } from '../../src/quests/quest-ledger.mjs';

const root = process.cwd();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function assertNoForbiddenPayload(value, label) {
  const text = JSON.stringify(value);
  for (const forbidden of ['"rootsSet"', '"snapshotBefore"', '"ingressLedger"', '"responseLedger"', '"sidecarJournal"', '"modelCallJournal"', '"pendingInteractions"']) {
    assert.equal(text.includes(forbidden), false, `${label} must not retain ${forbidden}`);
  }
}

function assertReducerReplay({ beforeState, boundaryResult, label }) {
  const afterState = boundaryResult.state;
  const bundle = createOpenWorldReducerBundle({
    beforeState,
    afterState,
    boundaryResult,
    sourceOutcomeId: `outcome.${label}`,
    now: '2026-06-28T12:00:00.000Z'
  });
  assertNoForbiddenPayload(bundle, `${label} bundle`);
  assert.ok(bundle.operations.length > 0, `${label} should produce reducer operations`);
  assert.ok(bundle.operations.every((operation) => operation.type !== 'root.replace'), `${label} should not use root replacement operations`);
  assert.ok(bundle.operations.every((operation) => Array.isArray(operation.path) && operation.path.length > 0), `${label} operations should be path-bounded`);

  const replayed = applyOpenWorldReducerBundle(beforeState, bundle);
  assert.deepEqual(
    pickOpenWorldReducerState(replayed),
    pickOpenWorldReducerState(afterState),
    `${label} reducer replay should match projected open-world state`
  );

  const broadRootSetBytes = stableJsonByteLength({ rootsSet: pickOpenWorldReducerState(afterState) });
  assert.ok(
    bundle.diagnostics.byteLength < broadRootSetBytes,
    `${label} reducer bundle should be smaller than broad rootsSet replacement`
  );
  return bundle;
}

const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const crewDataset = readJson('packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json');
let state = initializeOpenWorldCampaignState({
  packageData,
  baseState: projection.initialState,
  now: '2026-06-22T00:00:00.000Z'
});

const initialLocation = state.worldState.currentLocationId;
const destinationId = packageData.world.locations.find((location) => location.id !== initialLocation)?.id;
assert.ok(destinationId, 'expected a travel destination fixture');

const travelBefore = cloneJson(state);
const travelResult = travelBoundary({
  state,
  packageData,
  destinationId,
  sourceAnchorRange: { rangeHash: 'range.travel.stage11', hostMessageIds: ['m1', 'm2'] },
  now: '2026-06-22T00:01:00.000Z'
});
const travelBundle = assertReducerReplay({ beforeState: travelBefore, boundaryResult: travelResult, label: 'travel' });
assert.equal(
  travelBundle.operations.some((operation) => operation.path.join('.') === 'worldState.currentLocationId'),
  true,
  'travel reducer should set only the bounded current location field'
);
state = travelResult.state;

const timeBefore = cloneJson(state);
const timeResult = timeAdvanceBoundary({
  state,
  packageData,
  minutes: 17,
  reason: 'intra-ship-transition',
  sourceAnchorRange: { rangeHash: 'range.time.stage11', hostMessageIds: ['m3'] },
  now: '2026-06-22T00:02:00.000Z'
});
const timeBundle = assertReducerReplay({ beforeState: timeBefore, boundaryResult: timeResult, label: 'time' });
assert.equal(
  timeBundle.operations.some((operation) => operation.path.join('.') === 'timeLedger.entries'),
  true,
  'time reducer should append or upsert time ledger entries without replacing the save'
);
state = timeResult.state;

state.questLedger = transitionQuest(state.questLedger, 'side-the-long-repair', 'available', {
  now: '2026-06-22T00:02:30.000Z',
  reason: 'stage11-reducer-fixture'
});
const questId = state.questLedger.instances.find((quest) => (
  quest.id !== state.questLedger.foregroundQuestId
  && ['available', 'offered', 'accepted', 'active'].includes(quest.status)
))?.id;
assert.ok(questId, 'expected a non-foreground open-world quest fixture');

const questBefore = cloneJson(state);
const questResult = chooseForegroundQuest({
  state,
  packageData,
  questId,
  sourceAnchorRange: { rangeHash: 'range.quest.stage11', hostMessageIds: ['m4'] },
  now: '2026-06-22T00:03:00.000Z'
});
const questBundle = assertReducerReplay({ beforeState: questBefore, boundaryResult: questResult, label: 'quest' });
assert.equal(
  questBundle.operations.some((operation) => operation.path.join('.') === 'questLedger.instances'),
  true,
  'quest reducer should upsert changed quest instances'
);

const illegalAfter = cloneJson(timeResult.state);
illegalAfter.runtimeTracking.ingressLedger = [{ id: 'ingress.must.not.ride.open.world.reducer' }];
assert.throws(
  () => createOpenWorldReducerBundle({
    beforeState: timeBefore,
    afterState: illegalAfter,
    boundaryResult: timeResult,
    now: '2026-06-22T00:04:00.000Z'
  }),
  /runtimeTracking\.ingressLedger/,
  'open-world reducer should reject runtime journals'
);

const noForegroundState = cloneJson(state);
noForegroundState.questLedger.foregroundQuestId = null;
noForegroundState.questLedger.instances = noForegroundState.questLedger.instances.map((quest) => ({ ...quest, foreground: false }));
noForegroundState.attentionState = {
  ...(noForegroundState.attentionState || {}),
  mode: 'open-operations',
  foregroundQuestId: null,
  scene: null
};
const coordinated = createDirectorCoordinatorTurn({
  campaignState: noForegroundState,
  packageData,
  projection,
  crewDataset,
  turnId: 'turn.stage11.open-operations',
  playerInput: 'Sam asked operations to keep scanning the civilian channel and tell him if any of the quiet signals started to repeat.'
});
assert.equal(coordinated.turnPacket.stateDelta.openWorld.rootsSet, undefined, 'coordinated turn packet must not emit openWorld.rootsSet');
assert.equal(coordinated.turnPacket.stateDelta.openWorld.reducerBundle.kind, 'directive.openWorldReducerBundle.v1');
assertNoForbiddenPayload(coordinated.turnPacket.stateDelta.openWorld.reducerBundle, 'coordinated reducer bundle');
const committed = commitDirectorTurn(noForegroundState, coordinated.turnPacket);
assert.deepEqual(
  pickOpenWorldReducerState(committed),
  pickOpenWorldReducerState(coordinated.projectedState),
  'committing a coordinated open-world reducer packet should match projected state'
);
const invalidMigratedPacket = cloneJson(coordinated.turnPacket);
invalidMigratedPacket.stateDelta.openWorld.rootsSet = { runtimeTracking: {} };
assert.throws(
  () => commitDirectorTurn(noForegroundState, invalidMigratedPacket),
  /rootsSet replacement is no longer supported/,
  'migrated reducer packets must reject legacy rootsSet even when reducerBundle exists'
);

const validRef = compactOpenWorldReducerBundleRef(coordinated.turnPacket.stateDelta.openWorld.reducerBundle, {
  outcomeId: coordinated.turnPacket.outcomePacket.id
});
assert.equal(validRef.sourceKind, 'directive.openWorldReducerBundle.v1');
assert.equal(validRef.operationCount, coordinated.turnPacket.stateDelta.openWorld.reducerBundle.operations.length);
assert.deepEqual(
  validRef.changedRoots,
  [...validRef.changedRoots].sort(),
  'compact reducer refs should expose stable changed roots without raw operation values'
);
assert.equal(JSON.stringify(validRef).includes('value.set'), false);
assert.equal(JSON.stringify(validRef).includes('"value"'), false);
assert.equal(JSON.stringify(validRef).includes('"upsert"'), false);
assert.equal(JSON.stringify(validRef).includes('"remove"'), false);
assert.equal(JSON.stringify(validRef).includes('"hostMessageIds"'), false);
assertNoForbiddenPayload(validRef, 'compact reducer ref');

const invalidRootBundle = cloneJson(coordinated.turnPacket.stateDelta.openWorld.reducerBundle);
invalidRootBundle.operations[0].path = ['turnLedger', 'entries'];
invalidRootBundle.diagnostics.changedRoots = ['turnLedger'];
assert.throws(
  () => validateOpenWorldReducerBundle(invalidRootBundle),
  /invalid root "turnLedger"/,
  'reducer validator rejects roots outside the open-world reducer allowlist'
);

const rootReplaceBundle = cloneJson(coordinated.turnPacket.stateDelta.openWorld.reducerBundle);
rootReplaceBundle.operations[0].type = 'root.replace';
assert.throws(
  () => validateOpenWorldReducerBundle(rootReplaceBundle),
  /Unknown open-world reducer operation "root\.replace"/,
  'reducer validator rejects broad root replacement operations'
);

const runtimeJournalBundle = cloneJson(coordinated.turnPacket.stateDelta.openWorld.reducerBundle);
runtimeJournalBundle.operations[0].path = ['runtimeTracking', 'ingressLedger'];
runtimeJournalBundle.diagnostics.changedRoots = ['runtimeTracking'];
assert.throws(
  () => validateOpenWorldReducerBundle(runtimeJournalBundle),
  /runtimeTracking\.ingressLedger/,
  'reducer validator rejects runtime journal writes even when represented as path segments'
);

const mismatchedOperationCountBundle = cloneJson(coordinated.turnPacket.stateDelta.openWorld.reducerBundle);
mismatchedOperationCountBundle.diagnostics.operationCount += 1;
assert.throws(
  () => validateOpenWorldReducerBundle(mismatchedOperationCountBundle),
  /operationCount mismatch/,
  'reducer validator rejects stale operation-count diagnostics'
);

const mismatchedRootsBundle = cloneJson(coordinated.turnPacket.stateDelta.openWorld.reducerBundle);
mismatchedRootsBundle.diagnostics.changedRoots = ['worldState'];
assert.throws(
  () => validateOpenWorldReducerBundle(mismatchedRootsBundle),
  /changedRoots mismatch/,
  'reducer validator rejects stale changed-root diagnostics'
);

console.log('test-open-world-event-reducers: ok');
