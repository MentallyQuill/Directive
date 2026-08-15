import assert from 'node:assert/strict';

import { createEpisodeReviewScheduler } from '../../src/runtime/episode-review-scheduler.mjs';

const token = {
  kind: 'directive.episodeReviewToken.v1',
  branchId: 'save.scheduler',
  episodeId: 'episode.scheduler',
  episodeRevision: 12,
  checkpointSequence: 3,
};
let currentToken = token;
let reviewCount = 0;
let releaseReview;
const heldReview = new Promise((resolve) => { releaseReview = resolve; });
const scheduler = createEpisodeReviewScheduler({
  getToken: () => currentToken,
  review: async () => {
    reviewCount += 1;
    await heldReview;
    return { ok: true, attempted: true, status: 'continued' };
  },
});

const first = scheduler.schedule();
const duplicate = scheduler.schedule();
assert.equal(first, duplicate, 'duplicate generation-ended events must share one checkpoint flight');
await Promise.resolve();
assert.equal(reviewCount, 1);
assert.equal(scheduler.inFlightCount(), 1);
currentToken = { ...token, episodeRevision: 13, checkpointSequence: 4 };
const laterCheckpoint = scheduler.schedule();
const laterCheckpointDuplicate = scheduler.schedule();
assert.equal(laterCheckpoint, laterCheckpointDuplicate);
assert.equal(reviewCount, 1, 'a later checkpoint must wait behind the current single flight');
releaseReview();
assert.equal((await first).status, 'continued');
assert.equal((await laterCheckpoint).status, 'continued');
assert.equal(reviewCount, 2, 'the latest queued checkpoint runs once after the first flight');
assert.equal(scheduler.inFlightCount(), 0);

currentToken = null;
assert.equal((await scheduler.schedule()).status, 'no-pending-review');
assert.equal(reviewCount, 2);

console.log('Episode review scheduler passed.');
