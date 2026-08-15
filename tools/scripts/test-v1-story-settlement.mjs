import assert from 'node:assert/strict';

import { createEmptyStorySettlement } from '../../src/story/story-settlement-contracts.mjs';
import {
    acceptStoryContribution,
    acceptStoryContributions,
    appendStoryEffects,
    checkpointStoryEpisode,
    invalidateAcceptedPairReceipts,
    invalidateStorySource,
    openStoryEpisode,
    recordAcceptedPairReceipt,
    sealStoryEpisode,
    setEmergentFocus,
    settleInsignificantScene,
} from '../../src/story/story-settlement.mjs';
import { createV1AcceptedPairReceipt } from '../../src/runtime/v1-accepted-pair-receipt.mjs';

const empty = createEmptyStorySettlement({ branchId: 'save.alpha' });
const opened = openStoryEpisode(empty, {
    episodeId: 'episode.bridge-handover',
    sceneId: 'scene.bridge-handover',
});

assert.deepEqual(empty, createEmptyStorySettlement({ branchId: 'save.alpha' }));
assert.equal(opened.revision, 1);
assert.equal(opened.activeEpisode, 'episode.bridge-handover');
assert.equal(opened.episodes.length, 1);
assert.equal(opened.episodes[0].status, 'open');
assert.equal(opened.episodes[0].sceneId, 'scene.bridge-handover');
assert.equal(opened.episodes[0].openedAtRevision, 1);
assert.deepEqual(opened.episodes[0].boundaryState, {
    kind: 'directive.episodeBoundaryState.v1',
    checkpointSequence: 0,
    lastReviewedAtRevision: 1,
    contributionCountAtLastReview: 0,
    effectCountAtLastReview: 0,
    decision: 'continue',
    sourceContributionIds: [],
});
assert.equal(opened.episodes[0].workingCapsule.kind, 'directive.storyWorkingCapsule.v1');
assert.deepEqual(opened.episodes[0].workingCapsule.recentEvidence, []);

assert.deepEqual(openStoryEpisode(opened, {
    episodeId: 'episode.bridge-handover',
    sceneId: 'scene.bridge-handover',
}), opened);
assert.throws(
    () => openStoryEpisode(opened, {
        episodeId: 'episode.ready-room',
        sceneId: 'scene.ready-room',
    }),
    /active episode/,
);
assert.throws(
    () => openStoryEpisode(empty, {
        episodeId: 'bad episode id',
        sceneId: 'scene.valid',
    }),
    /episode id/,
);

const contribution = {
    id: 'contribution.bridge-handover',
    messageId: 'message.assistant-1',
    swipeId: 'swipe.2',
    role: 'assistant',
    textHash: 'a'.repeat(64),
    acceptedAtRevision: 1,
};
assert.throws(
    () => acceptStoryContribution(opened, { ...contribution, id: 'bad contribution id' }),
    /contribution id/,
);
const contributed = acceptStoryContribution(opened, contribution);
assert.equal(contributed.revision, 2);
assert.deepEqual(contributed.episodes[0].contributions, [contribution]);
assert.deepEqual(acceptStoryContribution(contributed, contribution), contributed);
const playerContribution = {
    id: 'contribution.bridge-player',
    messageId: 'message.player-2',
    swipeId: null,
    role: 'user',
    textHash: 'b'.repeat(64),
    acceptedAtRevision: 1,
};
const multiContributed = acceptStoryContributions(opened, [contribution, playerContribution, contribution]);
assert.deepEqual(multiContributed.episodes[0].contributions, [contribution, playerContribution]);
assert.equal(multiContributed.revision, 3);

assert.deepEqual(checkpointStoryEpisode(multiContributed, { minimumNewContributions: 3 }), multiContributed);
const checkpointed = checkpointStoryEpisode(multiContributed, { minimumNewContributions: 2 });
assert.equal(checkpointed.revision, 4);
assert.equal(checkpointed.episodes[0].status, 'open');
assert.equal(checkpointed.receipts.length, 0);
assert.deepEqual(checkpointed.episodes[0].boundaryState, {
    kind: 'directive.episodeBoundaryState.v1',
    checkpointSequence: 1,
    lastReviewedAtRevision: 4,
    contributionCountAtLastReview: 2,
    effectCountAtLastReview: 0,
    decision: 'continue',
    sourceContributionIds: ['contribution.bridge-handover', 'contribution.bridge-player'],
});
assert.deepEqual(checkpointStoryEpisode(checkpointed, { minimumNewContributions: 2 }), checkpointed);
assert.equal(JSON.stringify(checkpointed).includes('assistant prose'), false);

const malformedOpen = structuredClone(opened);
delete malformedOpen.episodes[0].boundaryState;
assert.throws(
    () => checkpointStoryEpisode(malformedOpen, { minimumNewContributions: 1, force: true }),
    /boundaryState must be an object/,
);

const effect = {
    id: 'effect.handover-complete',
    type: 'mission.eventOccurred',
    targetId: 'event.handover-complete',
    value: true,
    sourceContributionIds: ['contribution.bridge-handover'],
    playerVisibility: 'visible',
    status: 'active',
};
const effected = appendStoryEffects(contributed, [effect]);
assert.equal(effected.revision, 3);
assert.deepEqual(effected.episodes[0].effects, [effect]);
assert.deepEqual(appendStoryEffects(effected, [effect]), effected);
assert.throws(
    () => appendStoryEffects(contributed, [{ ...effect, id: 'bad effect id' }]),
    /effect id/,
);
assert.throws(
    () => appendStoryEffects(contributed, [{ ...effect, id: 'effect.unknown-source', sourceContributionIds: ['contribution.missing'] }]),
    /unknown source contribution/,
);

const sealed = sealStoryEpisode(effected, {
    boundaryReason: 'scene-change',
    summary: 'The command handover completed and the ship accepted its next duty.',
    unresolvedConsequences: [{
        id: 'consequence.readiness-review',
        status: 'unresolved',
        playerVisibility: 'visible',
        summary: 'Review what the handover revealed about readiness.',
    }],
});
assert.equal(sealed.revision, 4);
assert.equal(sealed.activeEpisode, null);
assert.equal(sealed.episodes[0].status, 'sealed');
assert.equal(sealed.episodes[0].sealedAtRevision, 4);
assert.equal(sealed.receipts.length, 1);
assert.equal(sealed.receipts[0].disposition, 'sealed');
assert.equal(Object.hasOwn(sealed.episodes[0], 'workingCapsule'), false);
assert.throws(
    () => sealStoryEpisode(contributed, {
        boundaryReason: 'scene-change',
        summary: 'Nothing lasting happened.',
    }),
    /semantic significance/,
);

const insignificant = settleInsignificantScene(empty, {
    sceneId: 'scene.small-talk',
    sourceContributionIds: ['contribution.small-talk'],
    sourceContributions: [{
        id: 'contribution.small-talk',
        messageId: 'message.small-talk',
    }],
});
assert.equal(insignificant.revision, 1);
assert.equal(insignificant.episodes.length, 0);
assert.equal(insignificant.receipts[0].disposition, 'insignificant');
assert.deepEqual(settleInsignificantScene(insignificant, {
    sceneId: 'scene.small-talk',
    sourceContributionIds: ['contribution.small-talk'],
    sourceContributions: [{
        id: 'contribution.small-talk',
        messageId: 'message.small-talk',
    }],
}), insignificant);
assert.throws(
    () => settleInsignificantScene(empty, { sceneId: 'bad scene id' }),
    /sceneId/,
);

const focused = setEmergentFocus(sealed, {
    focusId: 'focus.readiness-review',
    episodeId: 'episode.bridge-handover',
    consequenceId: 'consequence.readiness-review',
});
assert.equal(focused.revision, 5);
assert.equal(focused.focus.kind, 'directive.emergentFocus.v1');
assert.equal(focused.focus.consequenceId, 'consequence.readiness-review');
assert.throws(
    () => setEmergentFocus(sealed, {
        focusId: 'focus.missing',
        episodeId: 'episode.bridge-handover',
        consequenceId: 'consequence.missing',
    }),
    /unresolved consequence/,
);
assert.throws(
    () => setEmergentFocus(sealed, {
        focusId: 'bad focus id',
        episodeId: 'episode.bridge-handover',
        consequenceId: 'consequence.readiness-review',
    }),
    /Focus id/,
);
const clearedFocus = setEmergentFocus(focused, null);
assert.equal(clearedFocus.focus, null);
assert.equal(clearedFocus.revision, 6);

const invalidated = invalidateStorySource(focused, {
    contributionId: 'contribution.bridge-handover',
    reason: 'selected-swipe-changed',
});
assert.equal(invalidated.revision, 6);
assert.equal(invalidated.episodes[0].status, 'invalidated');
assert.equal(invalidated.episodes[0].invalidationReason, 'selected-swipe-changed');
assert.equal(invalidated.episodes[0].effects[0].status, 'invalidated');
assert.equal(invalidated.episodes[0].unresolvedConsequences[0].status, 'invalidated');
assert.equal(invalidated.focus, null);
assert.equal(invalidated.receipts.at(-1).disposition, 'invalidated');
assert.deepEqual(invalidateStorySource(invalidated, {
    contributionId: 'contribution.bridge-handover',
    reason: 'selected-swipe-changed',
}), invalidated);

const pairSource = {
    previousAssistant: {
        messageId: 'message.assistant-1',
        selectedSwipeId: '0',
        textHash: 'a'.repeat(64),
    },
    currentPlayer: {
        messageId: 'message.player-2',
        selectedSwipeId: null,
        textHash: 'b'.repeat(64),
    },
};
const correctedPairReceipt = createV1AcceptedPairReceipt({
    branchId: 'save.alpha',
    sourceRangeHash: 'range.corrected-pair',
    sourcePair: pairSource,
    assistantAcceptance: 'corrected',
    sourceContributionIds: ['contribution.bridge-player'],
});
const pairRecorded = recordAcceptedPairReceipt(empty, correctedPairReceipt);
assert.equal(pairRecorded.revision, 1);
assert.equal(pairRecorded.acceptedPairReceipts.length, 1);
assert.equal(pairRecorded.acceptedPairReceipts[0].settledAtRevision, 1);
assert.deepEqual(recordAcceptedPairReceipt(pairRecorded, correctedPairReceipt), pairRecorded);

const acceptedReplacement = createV1AcceptedPairReceipt({
    branchId: 'save.alpha',
    sourceRangeHash: 'range.corrected-pair',
    sourcePair: pairSource,
    assistantAcceptance: 'accepted',
    sourceContributionIds: ['contribution.bridge-handover', 'contribution.bridge-player'],
});
const pairReplaced = recordAcceptedPairReceipt(pairRecorded, acceptedReplacement);
assert.equal(pairReplaced.revision, 2);
assert.equal(pairReplaced.acceptedPairReceipts.length, 1);
assert.equal(pairReplaced.acceptedPairReceipts[0].assistantAcceptance, 'accepted');
assert.equal(pairReplaced.acceptedPairReceipts[0].settledAtRevision, 2);

const otherPairReceipt = createV1AcceptedPairReceipt({
    branchId: 'save.alpha',
    sourceRangeHash: 'range.other-pair',
    sourcePair: {
        previousAssistant: { ...pairSource.previousAssistant, messageId: 'message.assistant-3' },
        currentPlayer: { ...pairSource.currentPlayer, messageId: 'message.player-4' },
    },
    assistantAcceptance: 'accepted',
    sourceContributionIds: ['contribution.other-assistant', 'contribution.other-player'],
});
const twoPairs = recordAcceptedPairReceipt(pairReplaced, otherPairReceipt);
assert.equal(twoPairs.acceptedPairReceipts.length, 2);
assert.deepEqual(invalidateAcceptedPairReceipts(twoPairs, {
    sourceMessageIds: ['message.unrelated'],
}), twoPairs);
const pairInvalidated = invalidateAcceptedPairReceipts(twoPairs, {
    sourceMessageIds: ['message.assistant-1'],
});
assert.equal(pairInvalidated.revision, twoPairs.revision + 1);
assert.deepEqual(
    pairInvalidated.acceptedPairReceipts.map((receipt) => receipt.fingerprint),
    [otherPairReceipt.fingerprint],
);
const descendantPairInvalidated = invalidateAcceptedPairReceipts(twoPairs, {
    sourceContributionIds: ['contribution.other-assistant'],
});
assert.deepEqual(
    descendantPairInvalidated.acceptedPairReceipts.map((receipt) => receipt.fingerprint),
    [acceptedReplacement.fingerprint],
);

const legacySettlement = structuredClone(empty);
delete legacySettlement.acceptedPairReceipts;
const upgradedPairSettlement = recordAcceptedPairReceipt(legacySettlement, correctedPairReceipt);
assert.equal(upgradedPairSettlement.acceptedPairReceipts.length, 1);
assert.equal(upgradedPairSettlement.revision, 1);

console.log('V1 Story Settlement lifecycle tests passed.');
