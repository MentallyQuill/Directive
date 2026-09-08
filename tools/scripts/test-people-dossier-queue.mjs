import assert from 'node:assert/strict';

import { createPendingDossier } from '../../src/story/continuity-contracts.mjs';
import { createEmptyStorySettlement } from '../../src/story/story-settlement-contracts.mjs';
import {
  acceptStoryContribution,
  appendStoryPeopleEvents,
  openStoryEpisode,
  recordPendingDossier,
} from '../../src/story/story-settlement.mjs';
import {
  createPeopleDossierQueue,
  mergeMissingDossierFields,
  prepareDossierAttempt,
  prepareDossierEnrichment,
  prepareDossierRetries,
} from '../../src/runtime/people-dossier-queue.mjs';
import { stableSha256Hex } from '../../src/runtime/v1-stable-hash.mjs';

const merge = mergeMissingDossierFields({
  current: { species: 'Human', birthplace: null },
  generated: { species: 'Vulcan', birthplace: 'Earth' },
});
assert.deepEqual(merge.patch, { birthplace: 'Earth' });
assert.deepEqual(merge.conflicts, ['species']);

const sourceContribution = {
  id: 'contribution.whitaker',
  messageId: 'assistant.whitaker',
  swipeId: '0',
  role: 'assistant',
  textHash: 'a'.repeat(64),
  acceptedAtRevision: 1,
};
let settlement = openStoryEpisode(createEmptyStorySettlement({ branchId: 'save.people' }), {
  episodeId: 'episode.people',
  sceneId: 'scene.people',
});
settlement = acceptStoryContribution(settlement, sourceContribution);
settlement = appendStoryPeopleEvents(settlement, [{
  id: 'people-event.whitaker',
  type: 'personIntroduced',
  personId: 'mara-whitaker',
  name: 'Mara Whitaker',
  introductionSummary: 'Mara Whitaker reported aboard as chief engineer.',
  publicFacts: { displayName: 'Mara Whitaker', species: 'Human' },
  sourceContributionIds: ['contribution.whitaker'],
  evidenceQuote: 'Mara Whitaker reported aboard as chief engineer.',
  evidenceQuoteHash: stableSha256Hex('Mara Whitaker reported aboard as chief engineer.').slice(0, 8),
}], { knownPersonIds: ['mara-whitaker'] });
const job = await createPendingDossier({
  personId: 'mara-whitaker',
  introductionSourceContributionIds: ['contribution.whitaker'],
  publicContext: {
    displayName: 'Mara Whitaker',
    introductionSummary: 'Mara Whitaker reported aboard as chief engineer.',
    campaignContext: { campaignTitle: 'Ashes of Command', shipName: 'UES Breckenridge' },
  },
});
settlement = recordPendingDossier(settlement, job);
const campaignState = { storySettlement: settlement };

const attempted = prepareDossierAttempt({ campaignState, jobId: job.id });
assert.equal(attempted.status, 'started');
assert.equal(attempted.job.status, 'in-flight');
assert.equal(attempted.job.attemptCount, 1);
assert.equal(campaignState.storySettlement.pendingDossiers[0].status, 'pending');
assert.equal(attempted.candidateState.storySettlement.revision, settlement.revision + 1);
assert.equal(prepareDossierAttempt({
  campaignState: attempted.candidateState,
  jobId: job.id,
}).status, 'unavailable');

let releaseAuthor;
const authored = new Promise((resolve) => { releaseAuthor = resolve; });
const staged = [];
const authorCalls = [];
const queue = createPeopleDossierQueue({
  author: async (input) => {
    authorCalls.push(input);
    return authored;
  },
  stageResult: (result) => staged.push(result),
});
const activeJob = attempted.job;
const firstFlight = queue.run(activeJob);
const joinedFlight = queue.run(activeJob);
assert.equal(firstFlight, joinedFlight, 'duplicate jobs join one in-flight author request');
assert.equal(authorCalls.length, 1);
assert.deepEqual(authorCalls[0].introductions, [{
  personId: 'mara-whitaker',
  name: 'Mara Whitaker',
  introductionSummary: 'Mara Whitaker reported aboard as chief engineer.',
}]);
releaseAuthor({
  ok: true,
  dossiers: [{
    personId: 'mara-whitaker', displayName: 'Mara Whitaker', role: 'Chief engineer',
    affiliation: 'UES Breckenridge', species: 'Vulcan', age: null, birthplace: 'Earth',
    serviceBackground: null, assignmentHistory: null, profileSummary: 'Chief engineer aboard Breckenridge.',
  }],
});
const authorResult = await firstFlight;
assert.equal(authorResult.ok, true);
assert.equal(staged.length, 1);
assert.equal(staged[0].outcome.generated.personId, 'mara-whitaker');

const prepared = prepareDossierEnrichment({
  campaignState: attempted.candidateState,
  job: activeJob,
  outcome: staged[0].outcome,
});
assert.equal(prepared.status, 'merged');
assert.deepEqual(prepared.patch, {
  role: 'Chief engineer',
  affiliation: 'UES Breckenridge',
  birthplace: 'Earth',
  profileSummary: 'Chief engineer aboard Breckenridge.',
});
assert.deepEqual(prepared.conflicts, ['species']);
assert.equal(prepared.candidateState.storySettlement.pendingDossiers.length, 0);
assert.equal(
  prepared.candidateState.storySettlement.episodes[0].peopleEvents[0].publicFacts.species,
  'Human',
);

const failed = prepareDossierEnrichment({
  campaignState: attempted.candidateState,
  job: activeJob,
  outcome: { ok: false, reasonCode: 'provider-empty' },
});
assert.equal(failed.status, 'failed');
assert.equal(failed.candidateState.storySettlement.pendingDossiers[0].status, 'failed');
assert.equal(failed.candidateState.storySettlement.pendingDossiers[0].attemptCount, 1);

const cancelStages = [];
let aborted = false;
const cancelQueue = createPeopleDossierQueue({
  author: ({ signal }) => new Promise((resolve) => {
    signal.addEventListener('abort', () => { aborted = true; resolve({ ok: false, reasonCode: 'aborted' }); });
  }),
  stageResult: (result) => cancelStages.push(result),
});
const canceledFlight = cancelQueue.run(activeJob);
assert.equal(cancelQueue.cancel(activeJob.id), true);
await canceledFlight;
assert.equal(aborted, true);
assert.deepEqual(cancelStages, []);

const ignoredAbortStages = [];
const ignoredAbortQueue = createPeopleDossierQueue({
  author: () => new Promise(() => {}),
  stageResult: (result) => ignoredAbortStages.push(result),
});
const ignoredAbortFlight = ignoredAbortQueue.run(activeJob);
ignoredAbortQueue.clear();
assert.deepEqual(await Promise.race([
  ignoredAbortFlight,
  new Promise((resolve) => setTimeout(() => resolve('timeout'), 50)),
]), {
  ok: false,
  jobId: activeJob.id,
  reasonCode: 'aborted',
});
assert.deepEqual(ignoredAbortStages, []);

const orphanedState = structuredClone(attempted.candidateState);
const orphanedRevision = orphanedState.storySettlement.revision;
const recoveredOrphan = prepareDossierRetries({ campaignState: orphanedState });
assert.equal(recoveredOrphan.status, 'queued');
assert.deepEqual(recoveredOrphan.queuedJobIds, [activeJob.id]);
assert.equal(recoveredOrphan.candidateState.storySettlement.revision, orphanedRevision + 1);
assert.equal(recoveredOrphan.candidateState.storySettlement.pendingDossiers[0].status, 'pending');
assert.equal(recoveredOrphan.candidateState.storySettlement.pendingDossiers[0].attemptCount, 0);
assert.equal(orphanedState.storySettlement.pendingDossiers[0].status, 'in-flight');
const activeOrphan = prepareDossierRetries({
  campaignState: orphanedState,
  activeJobIds: [activeJob.id],
});
assert.equal(activeOrphan.status, 'unchanged');
assert.deepEqual(activeOrphan.queuedJobIds, []);
assert.equal(activeOrphan.candidateState.storySettlement.revision, orphanedRevision);

assert.deepEqual(await queue.run({ ...activeJob, status: 'failed' }), {
  ok: false,
  jobId: activeJob.id,
  reasonCode: 'attempt-unavailable',
});

console.log('People dossier queue tests passed.');
