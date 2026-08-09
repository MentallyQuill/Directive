import assert from 'node:assert/strict';

import { createEpisodeHardBoundary } from '../../src/story/episode-boundary.mjs';
import { createEmptyStorySettlement, validateStorySettlement } from '../../src/story/story-settlement-contracts.mjs';
import {
    acceptStoryContributions,
    appendStoryEffects,
    invalidateStorySources,
    openStoryEpisode,
    sealStoryEpisode,
    selectCurrentStoryEpisodes,
} from '../../src/story/story-settlement.mjs';

function contribution(suffix) {
    return {
        id: `contribution.${suffix}`,
        messageId: `message.${suffix}`,
        swipeId: suffix === 'player' ? null : `swipe.${suffix}`,
        role: suffix === 'player' ? 'user' : 'assistant',
        textHash: suffix.repeat(64).slice(0, 64),
        acceptedAtRevision: 1,
    };
}

function effect(suffix) {
    return {
        id: `effect.${suffix}`,
        type: 'mission.eventOccurred',
        targetId: `event.${suffix}`,
        value: true,
        sourceContributionIds: [`contribution.${suffix}`],
        playerVisibility: 'visible',
        status: 'active',
    };
}

const contributions = [contribution('alpha'), contribution('beta'), contribution('gamma')];
let settlement = createEmptyStorySettlement({ branchId: 'save.alpha' });
settlement = openStoryEpisode(settlement, {
    episodeId: 'episode.multi-source',
    sceneId: 'scene.multi-source',
});
settlement = acceptStoryContributions(settlement, contributions);
settlement = appendStoryEffects(settlement, ['alpha', 'beta', 'gamma'].map(effect));
const originalBoundary = createEpisodeHardBoundary({
    id: 'boundary.original-transition',
    branchId: 'save.alpha',
    code: 'mission-transition',
    source: { kind: 'missionReducer', id: 'transition.original' },
    sourceContributionIds: ['contribution.beta'],
});
settlement = sealStoryEpisode(settlement, {
    boundaryReason: originalBoundary.code,
    hardBoundary: originalBoundary,
    summary: 'Alpha, beta, and gamma were all settled.',
    characterMoments: [{
        id: 'moment.alpha',
        characterId: 'mara-whitaker',
        summary: 'Whitaker remembers alpha.',
        playerVisibility: 'visible',
        sourceContributionIds: ['contribution.alpha'],
    }, {
        id: 'moment.beta',
        characterId: 'hadrik-bronn',
        summary: 'Bronn remembers beta.',
        playerVisibility: 'visible',
        sourceContributionIds: ['contribution.beta'],
    }],
});

const superseded = invalidateStorySources(settlement, {
    contributionIds: ['contribution.beta'],
    reason: 'selected-swipe-changed',
    summarizeEffects: (effects) => effects.map((item) => item.targetId).join(' and '),
});
assert.equal(superseded.revision, settlement.revision + 1);
assert.equal(superseded.episodes.length, 2);
const [stale, replacement] = superseded.episodes;
assert.equal(stale.status, 'invalidated');
assert.equal(stale.invalidationReason, 'selected-swipe-changed');
assert.deepEqual(stale.hardBoundary, originalBoundary, 'stale history retains its original boundary for audit');
assert.equal(stale.effects.every((item) => item.status === 'invalidated'), true);
assert.equal(replacement.status, 'sealed');
assert.deepEqual(replacement.supersedesEpisodeIds, ['episode.multi-source']);
assert.deepEqual(replacement.contributions.map((item) => item.id), ['contribution.alpha', 'contribution.gamma']);
assert.deepEqual(replacement.effects.map((item) => item.targetId), ['event.alpha', 'event.gamma']);
assert.deepEqual(replacement.characterMoments.map((item) => item.id), ['moment.alpha']);
assert.equal(replacement.summary, 'event.alpha and event.gamma');
assert.equal(replacement.summary.includes('beta'), false);
assert.equal(replacement.hardBoundary.code, 'source-recovery');
assert.equal(replacement.hardBoundary.source.kind, 'sourceRecovery');
assert.deepEqual(replacement.hardBoundary.sourceContributionIds, ['contribution.alpha', 'contribution.gamma']);
assert.deepEqual(selectCurrentStoryEpisodes(superseded).map((episode) => episode.id), [replacement.id]);
assert.equal(validateStorySettlement(superseded).ok, true);
assert.equal(
    superseded.receipts.filter((receipt) => receipt.disposition === 'sealed').length,
    2,
    'the replacement receives its own immutable seal receipt',
);
assert.equal(
    superseded.receipts.filter((receipt) => receipt.disposition === 'invalidated').length,
    1,
);

assert.deepEqual(invalidateStorySources(superseded, {
    contributionIds: ['contribution.beta'],
    reason: 'selected-swipe-changed',
    summarizeEffects: () => 'must not run',
}), superseded, 'repeating one invalidation is idempotent');

const noSurvivor = invalidateStorySources(settlement, {
    contributionIds: ['contribution.alpha', 'contribution.beta', 'contribution.gamma'],
    reason: 'source-range-deleted',
    summarizeEffects: () => 'must not create a replacement',
});
assert.equal(noSurvivor.episodes.length, 1);
assert.equal(noSurvivor.episodes[0].status, 'invalidated');
assert.deepEqual(selectCurrentStoryEpisodes(noSurvivor), []);

const atomic = invalidateStorySources(settlement, {
    contributionIds: ['contribution.alpha', 'contribution.beta'],
    reason: 'source-range-replaced',
    summarizeEffects: (effects) => effects.map((item) => item.targetId).join(' '),
});
assert.equal(atomic.episodes.length, 2, 'one host mutation creates one replacement, not a chain');
assert.deepEqual(atomic.episodes[1].effects.map((item) => item.targetId), ['event.gamma']);
assert.deepEqual(atomic.episodes[1].supersedesEpisodeIds, ['episode.multi-source']);

const roundTripped = JSON.parse(JSON.stringify(superseded));
assert.deepEqual(selectCurrentStoryEpisodes(roundTripped), [roundTripped.episodes[1]]);
assert.equal(validateStorySettlement(roundTripped).ok, true);

for (const [label, episodes, pattern] of [
    ['self reference', [{ ...replacement, supersedesEpisodeIds: [replacement.id] }], /cannot supersede itself/],
    ['missing reference', [{ ...replacement, supersedesEpisodeIds: ['episode.missing'] }], /unknown episode/],
    ['cycle', [
        { ...stale, status: 'invalidated', supersedesEpisodeIds: [replacement.id] },
        { ...replacement, supersedesEpisodeIds: [stale.id] },
    ], /supersession cycle/],
]) {
    assert.match(validateStorySettlement({
        ...createEmptyStorySettlement({ branchId: 'save.alpha' }),
        episodes,
    }).errors.join('\n'), pattern, label);
}

console.log('V1 sealed story supersession tests passed.');
