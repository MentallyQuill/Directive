import assert from 'node:assert/strict';

import {
  materializeContinuityChanges,
  projectContinuityThreads,
  pruneContinuityEvents,
  rebindContinuityEvents,
} from '../../src/story/continuity-events.mjs';
import {
  createDirectorReceipt,
  createPendingDossier,
} from '../../src/story/continuity-contracts.mjs';
import { createEmptyStorySettlement } from '../../src/story/story-settlement-contracts.mjs';
import {
  acceptStoryContributions,
  invalidateStorySource,
  openStoryEpisode,
} from '../../src/story/story-settlement.mjs';

function pair(previousAssistant, currentPlayer, suffix) {
  return {
    previousAssistant: {
      messageId: `assistant.${suffix}`, selectedSwipeId: '0', textHash: `hash.assistant.${suffix}`,
      text: previousAssistant,
    },
    currentPlayer: {
      messageId: `player.${suffix}`, selectedSwipeId: null, textHash: `hash.player.${suffix}`,
      text: currentPlayer,
    },
  };
}

const pairA = pair(
  'The rendezvous is set for 1400 aboard the tender.',
  'I acknowledge the scheduled rendezvous.',
  'a',
);
let events = await materializeContinuityChanges({
  changes: [
    {
      operation: 'open', localRef: 'rendezvous', title: 'Tender rendezvous', category: 'schedule',
      sourceSlot: 'previousAssistant', evidenceQuote: 'The rendezvous is set for 1400 aboard the tender.',
    },
    {
      operation: 'addFact', threadRef: 'rendezvous', text: 'The tender rendezvous is scheduled for 1400.',
      claimType: 'narrated-fact', authoredRef: null, supersedesFactId: null,
      sourceSlot: 'previousAssistant', evidenceQuote: 'The rendezvous is set for 1400 aboard the tender.',
    },
  ],
  sourcePair: pairA,
  assistantAccepted: true,
  contributionIds: { previousAssistant: 'contribution.a', currentPlayer: 'contribution.player-a' },
  branchId: 'save.parent', sourceRangeHash: 'pair.a', existingEvents: [], settledAtRevision: 1,
});
const created = projectContinuityThreads(events)[0];
const originalFactId = created.facts[0].id;

const pairB = pair(
  'Operations moves the tender rendezvous to 1500.',
  'I accept the revised rendezvous time.',
  'b',
);
events = await materializeContinuityChanges({
  changes: [{
    operation: 'addFact', threadRef: created.id, text: 'The tender rendezvous is now scheduled for 1500.',
    claimType: 'narrated-fact', authoredRef: null, supersedesFactId: originalFactId,
    sourceSlot: 'previousAssistant', evidenceQuote: 'Operations moves the tender rendezvous to 1500.',
  }],
  sourcePair: pairB,
  assistantAccepted: true,
  contributionIds: { previousAssistant: 'contribution.b', currentPlayer: 'contribution.player-b' },
  branchId: 'save.parent', sourceRangeHash: 'pair.b', existingEvents: events, settledAtRevision: 2,
});
const afterB = structuredClone(events);

const pairC = pair(
  'The tender rendezvous concludes with the transfer complete.',
  'I log the completed transfer.',
  'c',
);
events = await materializeContinuityChanges({
  changes: [{
    operation: 'setStatus', threadRef: created.id, status: 'resolved',
    sourceSlot: 'previousAssistant', evidenceQuote: 'The tender rendezvous concludes with the transfer complete.',
  }],
  sourcePair: pairC,
  assistantAccepted: true,
  contributionIds: { previousAssistant: 'contribution.c', currentPlayer: 'contribution.player-c' },
  branchId: 'save.parent', sourceRangeHash: 'pair.c', existingEvents: events, settledAtRevision: 3,
});
assert.equal(projectContinuityThreads(events)[0].status, 'resolved');

const sourceContributions = ['a', 'b', 'c'].map((suffix, index) => ({
  id: `contribution.${suffix}`,
  messageId: `assistant.${suffix}`,
  swipeId: '0',
  role: 'assistant',
  textHash: `hash.assistant.${suffix}`,
  acceptedAtRevision: index + 1,
}));
let settlement = openStoryEpisode(createEmptyStorySettlement({ branchId: 'save.parent' }), {
  episodeId: 'episode.continuity',
  sceneId: 'scene.continuity',
});
settlement = acceptStoryContributions(settlement, sourceContributions);
const statusEvent = events.find((event) => event.operation === 'setStatus');
const directorReceipt = await createDirectorReceipt({
  branchId: 'save.parent', packageId: 'package.breckenridge', packageVersion: '1',
  missionId: 'mission.prelude', generationType: 'normal',
  generationTargetKey: 'generation-target.c', requestKey: 'turn-analysis.c',
  reuseKey: 'reuse.c',
  sourceRangeHash: 'pair.c', sourceContributionIds: ['contribution.c'],
  instruction: 'Continue after the completed rendezvous.',
  dependencyIds: [statusEvent.id], settledAtRevision: 3,
});
const pendingDossier = await createPendingDossier({
  personId: 'contact.tender-master',
  introductionSourceContributionIds: ['contribution.a'],
  publicContext: { displayName: 'Tender master', introductionSummary: 'The tender master reported aboard.' },
});
settlement = {
  ...settlement,
  continuityEvents: events,
  directorReceipts: [directorReceipt],
  pendingDossiers: [pendingDossier],
};

const withoutResolution = invalidateStorySource(settlement, { contributionId: 'contribution.c' });
assert.equal(projectContinuityThreads(withoutResolution.continuityEvents)[0].status, 'active');
assert.deepEqual(withoutResolution.directorReceipts, []);
assert.deepEqual(withoutResolution.pendingDossiers, [pendingDossier]);

const withoutCreation = invalidateStorySource(settlement, { contributionId: 'contribution.a' });
assert.deepEqual(withoutCreation.continuityEvents, []);
assert.deepEqual(withoutCreation.directorReceipts, []);
assert.deepEqual(withoutCreation.pendingDossiers, []);

assert.deepEqual(
  projectContinuityThreads(pruneContinuityEvents(events, new Set(['contribution.a']))),
  [],
  'removing creation evidence removes the whole derived thread',
);
assert.equal(
  projectContinuityThreads(pruneContinuityEvents(events, new Set(['contribution.c'])))[0].status,
  'active',
  'removing resolution evidence reopens the surviving thread',
);
assert.deepEqual(
  pruneContinuityEvents(events, new Set(['contribution.unrelated'])),
  events,
  'unrelated source removal retains byte-equivalent events',
);

const beforeParent = JSON.stringify(afterB);
const rebound = await rebindContinuityEvents(afterB, {
  branchId: 'save.child',
  contributionMap: new Map([
    ['contribution.a', 'contribution.child-a'],
    ['contribution.b', 'contribution.child-b'],
  ]),
});
assert.equal(JSON.stringify(afterB), beforeParent, 'rebinding cannot mutate the parent timeline');
assert.equal(projectContinuityThreads(rebound.events)[0].status, 'active');
assert.equal(rebound.events.every((event) => event.branchId === 'save.child'), true);
assert.equal(rebound.events.some((event) => event.sourceContributionIds.includes('contribution.c')), false);
const reboundIds = new Set(rebound.events.map(({ id }) => id));
assert.equal(rebound.events.every((event) => event.dependsOnEventIds.every((id) => reboundIds.has(id))), true);
assert.equal(rebound.events.every((event) => event.sourceContributionIds.every((id) => id.startsWith('contribution.child-'))), true);
assert.equal(rebound.eventMap instanceof Map, true);
assert.equal(rebound.threadMap instanceof Map, true);
assert.equal(rebound.threadMap.get(created.id), projectContinuityThreads(rebound.events)[0].id);

await assert.rejects(
  rebindContinuityEvents(afterB, {
    branchId: 'save.child',
    contributionMap: new Map([['contribution.a', 'contribution.child-a']]),
  }),
  /contribution-map-missing/,
);

console.log('Continuity lineage tests passed.');
