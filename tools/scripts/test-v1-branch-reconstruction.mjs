import assert from 'node:assert/strict';

import {
  armV1CommandBearingEdge,
  awardV1CommandBearing,
  commitV1CommandBearingEdge,
  createV1CommandBearing,
  rebuildV1CommandBearingForLineage,
  reserveV1CommandBearingEdge
} from '../../src/command/v1-command-bearing.mjs';
import { hashStableJson } from '../../src/runtime/v1-host-message-contracts.mjs';
import { reconstructV1BranchState } from '../../src/runtime/v1-branch-reconstruction.mjs';
import { createAshesInitialState, loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

const runtimeAssets = loadAshesRuntimeAssets();
const parentState = createAshesInitialState({ saveId: 'save.parent', chatId: 'chat.parent' });
const parentMessages = [
  { id: 'player.1', role: 'user', mes: 'Report to the bridge.' },
  { id: 'assistant.1', role: 'assistant', mes: 'The lift doors open.' },
  { id: 'player.2', role: 'user', mes: 'Ask for the readiness report.' },
  { id: 'assistant.2', role: 'assistant', mes: 'Whitaker passes over the slate.' }
];
const original = structuredClone(parentState);
const rebuilt = await reconstructV1BranchState({
  parentState,
  parentMessages,
  childMessages: parentMessages.slice(0, 2),
  lineageHash: 'lineage.1',
  targetSaveId: 'save.child',
  targetChatBinding: {
    kind: 'directive.campaignChatBinding.v1',
    version: 1,
    campaignId: parentState.campaign.id,
    saveId: 'save.child',
    chatId: 'chat.child',
    status: 'bound'
  },
  runtimeAssets,
  now: () => '2026-08-11T12:00:00.000Z'
});

assert.deepEqual(parentState, original, 'parent authority remains immutable');
assert.equal(rebuilt.campaignState.campaignChatBinding.saveId, 'save.child');
assert.equal(rebuilt.campaignState.campaignChatBinding.chatId, 'chat.child');
assert.equal(rebuilt.campaignState.mission.v1.branchId, 'save.child');
assert.equal(rebuilt.campaignState.mission.v1Journey.branchId, 'save.child');
assert.equal(rebuilt.campaignState.storySettlement.branchId, 'save.child');
assert.notEqual(rebuilt.campaignState.mission.v1Journey.activeRunId, parentState.mission.v1Journey.activeRunId);
assert.deepEqual(rebuilt.discardedHostMessageIds, ['player.2', 'assistant.2']);
assert.equal(rebuilt.retainedSourceCount, 2);
assert.equal(rebuilt.lineageHash, 'lineage.1');
assert.equal(rebuilt.modelCallCount, 0);
assert.equal(rebuilt.projection.ok, true);

let bearing = createV1CommandBearing({ capacity: 3 });
bearing = awardV1CommandBearing(bearing, { awardId: 'award.keep.1', sourceId: 'objective.keep.1', reason: 'Kept one', now: '2026-08-11T01:00:00.000Z' }).commandBearing;
bearing = awardV1CommandBearing(bearing, { awardId: 'award.drop', sourceId: 'objective.drop', reason: 'Discarded', now: '2026-08-11T02:00:00.000Z' }).commandBearing;
bearing = awardV1CommandBearing(bearing, { awardId: 'award.keep.2', sourceId: 'objective.keep.2', reason: 'Kept two', now: '2026-08-11T03:00:00.000Z' }).commandBearing;
bearing = reserveV1CommandBearingEdge(bearing, { spendId: 'spend.safe', reason: 'Safe edge', now: '2026-08-11T04:00:00.000Z' }).commandBearing;
bearing = armV1CommandBearingEdge(bearing, { spendId: 'spend.safe', playerMessageId: 'player.safe', now: '2026-08-11T04:01:00.000Z' }).commandBearing;
bearing = commitV1CommandBearingEdge(bearing, {
  spendId: 'spend.safe',
  assistantMessageId: 'assistant.safe',
  assistantTextHash: hashStableJson({ text: 'Safe response' }),
  acceptedByPlayerMessageId: 'player.accepted',
  now: '2026-08-11T04:02:00.000Z'
}).commandBearing;
bearing = reserveV1CommandBearingEdge(bearing, { spendId: 'spend.unsafe', reason: 'Unsafe edge', now: '2026-08-11T05:00:00.000Z' }).commandBearing;
bearing = armV1CommandBearingEdge(bearing, { spendId: 'spend.unsafe', playerMessageId: 'player.discarded', now: '2026-08-11T05:01:00.000Z' }).commandBearing;

const rebuiltBearing = rebuildV1CommandBearingForLineage(bearing, {
  retainedMessages: [
    { hostMessageId: 'player.safe', text: 'Use the edge' },
    { hostMessageId: 'assistant.safe', text: 'Safe response' },
    { hostMessageId: 'player.accepted', text: 'Continue' }
  ],
  completedObjectiveIds: ['objective.keep.1', 'objective.keep.2'],
  now: '2026-08-11T12:00:00.000Z'
});
assert.deepEqual(Object.keys(rebuiltBearing.awards), ['award.keep.1', 'award.keep.2']);
assert.equal(rebuiltBearing.spends['spend.safe'].status, 'committed');
assert.equal(rebuiltBearing.spends['spend.unsafe'].status, 'refunded');
assert.equal(rebuiltBearing.balance, 1);

const changedHash = rebuildV1CommandBearingForLineage(bearing, {
  retainedMessages: [
    { hostMessageId: 'player.safe', text: 'Use the edge' },
    { hostMessageId: 'assistant.safe', text: 'Changed response' },
    { hostMessageId: 'player.accepted', text: 'Continue' }
  ],
  completedObjectiveIds: ['objective.keep.1', 'objective.keep.2'],
  now: '2026-08-11T12:00:00.000Z'
});
assert.equal(changedHash.spends['spend.safe'].status, 'refunded');

console.log('V1 branch reconstruction tests passed');
