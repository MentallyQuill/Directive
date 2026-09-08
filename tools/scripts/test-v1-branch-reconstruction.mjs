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
import { createV1AcceptedPairReceipt } from '../../src/runtime/v1-accepted-pair-receipt.mjs';
import { reconstructV1BranchState } from '../../src/runtime/v1-branch-reconstruction.mjs';
import {
  acceptStoryContributions,
  openStoryEpisode,
  recordAcceptedPairReceipt,
} from '../../src/story/story-settlement.mjs';
import {
  materializeContinuityChanges,
  projectContinuityThreads,
} from '../../src/story/continuity-events.mjs';
import {
  createDirectorReceipt,
  createPendingDossier,
} from '../../src/story/continuity-contracts.mjs';
import { createAshesInitialState, loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

const runtimeAssets = loadAshesRuntimeAssets();
const parentState = createAshesInitialState({ saveId: 'save.parent', chatId: 'chat.parent' });
const parentMessages = [
  { id: 'player.1', role: 'user', mes: 'Report to the bridge.' },
  { id: 'assistant.1', role: 'assistant', mes: 'The lift doors open.' },
  { id: 'player.2', role: 'user', mes: 'Ask for the readiness report.' },
  { id: 'assistant.2', role: 'assistant', mes: 'Whitaker passes over the slate.' }
];
parentState.storySettlement = recordAcceptedPairReceipt(
  parentState.storySettlement,
  createV1AcceptedPairReceipt({
    branchId: 'save.parent',
    sourceRangeHash: 'range.discarded-player-2',
    sourcePair: {
      previousAssistant: {
        messageId: 'assistant.1',
        selectedSwipeId: null,
        textHash: hashStableJson({ text: 'The lift doors open.' }),
      },
      currentPlayer: {
        messageId: 'player.2',
        selectedSwipeId: null,
        textHash: hashStableJson({ text: 'Ask for the readiness report.' }),
      },
    },
    assistantAcceptance: 'corrected',
    sourceContributionIds: [],
  }),
);
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
assert.deepEqual(rebuilt.campaignState.storySettlement.acceptedPairReceipts, []);

const continuityMessages = [
  { id: 'player.c0', role: 'user', mes: 'Request rendezvous orders.' },
  { id: 'assistant.c1', role: 'assistant', mes: 'The rendezvous is set for 1400.' },
  { id: 'player.c2', role: 'user', mes: 'I commit to attend the rendezvous.' },
  { id: 'assistant.c3', role: 'assistant', mes: 'The rendezvous concludes successfully.' },
  { id: 'player.c4', role: 'user', mes: 'I record the completed rendezvous.' },
];
const continuityParent = createAshesInitialState({ saveId: 'save.continuity-parent', chatId: 'chat.continuity-parent' });
let continuitySettlement = openStoryEpisode(continuityParent.storySettlement, {
  episodeId: 'episode.continuity',
  sceneId: 'scene.continuity',
});
continuitySettlement = acceptStoryContributions(continuitySettlement, [
  {
    id: 'contribution.continuity-a', messageId: 'assistant.c1', swipeId: null,
    role: 'assistant', textHash: hashStableJson({ text: continuityMessages[1].mes }), acceptedAtRevision: 1,
  },
  {
    id: 'contribution.continuity-b', messageId: 'player.c2', swipeId: null,
    role: 'user', textHash: hashStableJson({ text: continuityMessages[2].mes }), acceptedAtRevision: 2,
  },
  {
    id: 'contribution.continuity-c', messageId: 'assistant.c3', swipeId: null,
    role: 'assistant', textHash: hashStableJson({ text: continuityMessages[3].mes }), acceptedAtRevision: 3,
  },
]);
const pairA = {
  previousAssistant: {
    messageId: 'assistant.c1', selectedSwipeId: null,
    textHash: hashStableJson({ text: continuityMessages[1].mes }), text: continuityMessages[1].mes,
  },
  currentPlayer: {
    messageId: 'player.c2', selectedSwipeId: null,
    textHash: hashStableJson({ text: continuityMessages[2].mes }), text: continuityMessages[2].mes,
  },
};
let continuityEvents = await materializeContinuityChanges({
  changes: [
    {
      operation: 'open', localRef: 'rendezvous', title: 'Scheduled rendezvous', category: 'schedule',
      sourceSlot: 'previousAssistant', evidenceQuote: 'The rendezvous is set for 1400.',
    },
    {
      operation: 'addFact', threadRef: 'rendezvous', text: 'The rendezvous is scheduled for 1400.',
      claimType: 'narrated-fact', authoredRef: null, supersedesFactId: null,
      sourceSlot: 'previousAssistant', evidenceQuote: 'The rendezvous is set for 1400.',
    },
    {
      operation: 'addFact', threadRef: 'rendezvous', text: 'The player committed to attend the rendezvous.',
      claimType: 'player-commitment', authoredRef: null, supersedesFactId: null,
      sourceSlot: 'currentPlayer', evidenceQuote: 'I commit to attend the rendezvous.',
    },
  ],
  sourcePair: pairA, assistantAccepted: true,
  contributionIds: {
    previousAssistant: 'contribution.continuity-a',
    currentPlayer: 'contribution.continuity-b',
  },
  branchId: 'save.continuity-parent', sourceRangeHash: 'pair.continuity-a',
  existingEvents: [], settledAtRevision: continuitySettlement.revision,
});
const continuityThreadId = projectContinuityThreads(continuityEvents)[0].id;
continuityEvents = await materializeContinuityChanges({
  changes: [{
    operation: 'setStatus', threadRef: continuityThreadId, status: 'resolved',
    sourceSlot: 'previousAssistant', evidenceQuote: 'The rendezvous concludes successfully.',
  }],
  sourcePair: {
    previousAssistant: {
      messageId: 'assistant.c3', selectedSwipeId: null,
      textHash: hashStableJson({ text: continuityMessages[3].mes }), text: continuityMessages[3].mes,
    },
    currentPlayer: {
      messageId: 'player.c4', selectedSwipeId: null,
      textHash: hashStableJson({ text: continuityMessages[4].mes }), text: continuityMessages[4].mes,
    },
  },
  assistantAccepted: true,
  contributionIds: {
    previousAssistant: 'contribution.continuity-c',
    currentPlayer: 'contribution.continuity-player-c',
  },
  branchId: 'save.continuity-parent', sourceRangeHash: 'pair.continuity-c',
  existingEvents: continuityEvents, settledAtRevision: continuitySettlement.revision,
});
const continuityReceipt = await createDirectorReceipt({
  branchId: 'save.continuity-parent',
  packageId: 'package.ashes',
  packageVersion: '1',
  missionId: 'mission.ashes',
  generationType: 'normal',
  generationTargetKey: 'target.continuity',
  requestKey: 'request.continuity',
  reuseKey: 'reuse.continuity',
  sourceRangeHash: 'pair.continuity-a',
  sourceContributionIds: ['contribution.continuity-b'],
  instruction: 'Keep the active rendezvous commitment in view.',
  dependencyIds: [continuityEvents[0].id, continuityEvents[0].threadId, 'contribution.continuity-b'],
  settledAtRevision: continuitySettlement.revision,
});
const continuityDossier = await createPendingDossier({
  personId: 'person.rendezvous-officer',
  introductionSourceContributionIds: ['contribution.continuity-b'],
  publicContext: { displayName: 'Rendezvous Officer', introductionSummary: 'Coordinates the rendezvous.' },
});
continuityParent.storySettlement = {
  ...continuitySettlement,
  continuityEvents,
  directorReceipts: [continuityReceipt],
  pendingDossiers: [continuityDossier],
};
const continuityOriginal = structuredClone(continuityParent);
const continuityChild = await reconstructV1BranchState({
  parentState: continuityParent,
  parentMessages: continuityMessages,
  childMessages: continuityMessages.slice(0, 3),
  lineageHash: 'lineage.continuity',
  targetSaveId: 'save.continuity-child',
  targetChatBinding: {
    kind: 'directive.campaignChatBinding.v1', version: 1,
    campaignId: continuityParent.campaign.id,
    saveId: 'save.continuity-child', chatId: 'chat.continuity-child', status: 'bound',
  },
  runtimeAssets,
  now: () => '2026-08-11T12:00:00.000Z',
});
assert.deepEqual(continuityParent, continuityOriginal);
const childContinuityEvents = continuityChild.campaignState.storySettlement.continuityEvents;
assert.equal(projectContinuityThreads(childContinuityEvents)[0].status, 'active');
assert.equal(childContinuityEvents.every((event) => event.branchId === 'save.continuity-child'), true);
assert.equal(childContinuityEvents.some((event) => event.sourceContributionIds.includes('contribution.continuity-c')), false);
assert.equal(childContinuityEvents.some((event) => continuityEvents.some((parentEvent) => parentEvent.id === event.id)), false);
const childEventIds = new Set(childContinuityEvents.map((event) => event.id));
assert.equal(childContinuityEvents.every((event) => event.dependsOnEventIds.every((id) => childEventIds.has(id))), true);
const [childDirectorReceipt] = continuityChild.campaignState.storySettlement.directorReceipts;
assert.equal(childDirectorReceipt.branchId, 'save.continuity-child');
assert.notEqual(childDirectorReceipt.id, continuityReceipt.id);
assert.equal(childDirectorReceipt.sourceContributionIds[0] === continuityReceipt.sourceContributionIds[0], false);
assert.equal(childDirectorReceipt.dependencyIds.every((id) => (
  childEventIds.has(id)
  || childContinuityEvents.some((event) => event.threadId === id)
  || childDirectorReceipt.sourceContributionIds.includes(id)
)), true);
const [childDossier] = continuityChild.campaignState.storySettlement.pendingDossiers;
assert.notEqual(childDossier.id, continuityDossier.id);
assert.equal(childDossier.introductionSourceContributionIds[0] === continuityDossier.introductionSourceContributionIds[0], false);

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

const longParent = Array.from({ length: 10000 }, (_, index) => ({
  id: `scale.${index}`,
  role: index % 2 === 0 ? 'assistant' : 'user',
  mes: `Long campaign message ${index}`
}));
const longRebuild = await reconstructV1BranchState({
  parentState,
  parentMessages: longParent,
  childMessages: longParent.slice(0, 7500),
  lineageHash: 'lineage.scale',
  targetSaveId: 'save.scale-child',
  targetChatBinding: {
    kind: 'directive.campaignChatBinding.v1', version: 1, campaignId: parentState.campaign.id,
    saveId: 'save.scale-child', chatId: 'chat.scale-child', status: 'bound'
  },
  runtimeAssets,
  now: () => '2026-08-11T12:00:00.000Z'
});
assert.equal(longRebuild.retainedSourceCount, 7500);
assert.equal(longRebuild.discardedHostMessageIds.length, 2500);
assert.equal(longRebuild.modelCallCount, 0);
assert.equal(longRebuild.projection.ok, true);

console.log('V1 branch reconstruction tests passed');
