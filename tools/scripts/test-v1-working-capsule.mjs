import assert from 'node:assert/strict';

import { createEmptyStorySettlement, validateStorySettlement } from '../../src/story/story-settlement-contracts.mjs';
import {
    acceptStoryContributions,
    appendStoryEffects,
    checkpointStoryEpisode,
    invalidateStorySource,
    observeStoryWorkingEvidence,
    openStoryEpisode,
    replaceStoryWorkingCapsule,
    sealStoryEpisode,
    settleInsignificantScene,
} from '../../src/story/story-settlement.mjs';

const branchId = 'save.capsule';
const empty = createEmptyStorySettlement({ branchId });
const opened = openStoryEpisode(empty, {
    episodeId: 'episode.capsule',
    sceneId: 'scene.capsule',
});

assert.deepEqual(opened.episodes[0].workingCapsule, {
    kind: 'directive.storyWorkingCapsule.v1',
    summary: '',
    foregroundQuestion: null,
    sourceContributionIds: [],
    effectIds: [],
    recentEvidence: [],
    observedContributionCount: 0,
    lastEvaluatedCheckpointSequence: 0,
    needsReview: false,
    updatedAtRevision: 1,
});

const names = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta'];
const contributions = names.map((name, index) => ({
    id: `contribution.${name}`,
    messageId: `message.${name}`,
    swipeId: index % 2 === 0 ? `swipe.${index}` : null,
    role: index % 2 === 0 ? 'assistant' : 'user',
    textHash: String(index + 1).repeat(64),
    acceptedAtRevision: index + 1,
}));
contributions[0].textHash = 'abcdef12';
const contributed = acceptStoryContributions(opened, contributions);
const longText = `  First\n\naccepted\tpassage ${'x'.repeat(300)}  `;
const observedAlpha = observeStoryWorkingEvidence(contributed, {
    branchId,
    observations: [{
        contributionId: 'contribution.alpha',
        role: 'assistant',
        textHash: 'abcdef12',
        text: longText,
    }],
});
assert.equal(observedAlpha.episodes[0].workingCapsule.recentEvidence.length, 1);
assert.deepEqual(observedAlpha.episodes[0].workingCapsule.recentEvidence[0], {
    contributionId: 'contribution.alpha',
    role: 'assistant',
    textHash: 'abcdef12',
    excerpt: `First accepted passage ${'x'.repeat(217)}`,
});
assert.equal(observedAlpha.episodes[0].workingCapsule.recentEvidence[0].excerpt.length, 240);
assert.equal(observedAlpha.episodes[0].workingCapsule.observedContributionCount, 1);
assert.deepEqual(observeStoryWorkingEvidence(observedAlpha, {
    branchId,
    observations: [{
        contributionId: 'contribution.alpha',
        role: 'assistant',
        textHash: 'abcdef12',
        text: longText,
    }],
}), observedAlpha, 'replaying an observation is idempotent');

for (const [label, input, pattern] of [
    ['wrong branch', { branchId: 'save.other', observations: [] }, /branch/i],
    ['unknown source', {
        branchId,
        observations: [{ contributionId: 'contribution.missing', role: 'user', textHash: 'a'.repeat(64), text: 'Missing.' }],
    }, /accepted contribution/i],
    ['wrong role', {
        branchId,
        observations: [{ contributionId: 'contribution.beta', role: 'assistant', textHash: '2'.repeat(64), text: 'Wrong role.' }],
    }, /role/i],
    ['wrong hash', {
        branchId,
        observations: [{ contributionId: 'contribution.beta', role: 'user', textHash: 'f'.repeat(64), text: 'Wrong hash.' }],
    }, /text hash/i],
    ['empty text', {
        branchId,
        observations: [{ contributionId: 'contribution.beta', role: 'user', textHash: '2'.repeat(64), text: ' \n ' }],
    }, /text/i],
    ['unknown field', {
        branchId,
        observations: [{ contributionId: 'contribution.beta', role: 'user', textHash: '2'.repeat(64), text: 'Valid.', rationale: 'store me' }],
    }, /unknown field/i],
]) {
    assert.throws(() => observeStoryWorkingEvidence(observedAlpha, input), pattern, label);
}

const observedAll = observeStoryWorkingEvidence(observedAlpha, {
    branchId,
    observations: contributions.slice(1).map((contribution, index) => ({
        contributionId: contribution.id,
        role: contribution.role,
        textHash: contribution.textHash,
        text: `Accepted evidence ${index + 2} ${'y'.repeat(72)}`,
    })),
});
const bounded = observedAll.episodes[0].workingCapsule;
assert.deepEqual(
    bounded.recentEvidence.map((item) => item.contributionId),
    contributions.slice(-6).map((item) => item.id),
);
assert.equal(bounded.observedContributionCount, contributions.length);
assert.ok(bounded.recentEvidence.length <= 6);
assert.ok(bounded.recentEvidence.every((item) => item.excerpt.length <= 240));
assert.ok(bounded.recentEvidence.reduce((total, item) => total + item.excerpt.length, 0) <= 1200);

const aggregateOpened = openStoryEpisode(createEmptyStorySettlement({ branchId: 'save.aggregate' }), {
    episodeId: 'episode.aggregate',
    sceneId: 'scene.aggregate',
});
const aggregateContributions = Array.from({ length: 6 }, (_, index) => ({
    id: `contribution.aggregate-${index}`,
    messageId: `message.aggregate-${index}`,
    swipeId: null,
    role: 'user',
    textHash: (index + 2).toString(16).repeat(64),
    acceptedAtRevision: index + 1,
}));
const aggregateContributed = acceptStoryContributions(aggregateOpened, aggregateContributions);
const aggregateObserved = observeStoryWorkingEvidence(aggregateContributed, {
    branchId: 'save.aggregate',
    observations: aggregateContributions.map((contribution) => ({
        contributionId: contribution.id,
        role: contribution.role,
        textHash: contribution.textHash,
        text: 'z'.repeat(300),
    })),
});
assert.equal(aggregateObserved.episodes[0].workingCapsule.recentEvidence.length, 5);
assert.equal(
    aggregateObserved.episodes[0].workingCapsule.recentEvidence.reduce((total, item) => total + item.excerpt.length, 0),
    1200,
);

const effect = {
    id: 'effect.gamma-survives',
    type: 'mission.eventOccurred',
    targetId: 'event.gamma',
    value: true,
    sourceContributionIds: ['contribution.gamma'],
    playerVisibility: 'visible',
    status: 'active',
};
const effected = appendStoryEffects(observedAll, [effect]);
const summarized = replaceStoryWorkingCapsule(effected, {
    summary: 'The crew identified a material readiness concern.',
    foregroundQuestion: 'Will the concern be resolved before departure?',
    sourceContributionIds: ['contribution.gamma', 'contribution.delta'],
    effectIds: ['effect.gamma-survives'],
});
assert.equal(summarized.episodes[0].workingCapsule.summary, 'The crew identified a material readiness concern.');
assert.equal(summarized.episodes[0].workingCapsule.needsReview, false);
assert.throws(() => replaceStoryWorkingCapsule(effected, {
    summary: 'Unsupported.',
    sourceContributionIds: ['contribution.missing'],
}), /accepted contribution/i);
assert.throws(() => replaceStoryWorkingCapsule(effected, {
    summary: 'Unsupported.',
    sourceContributionIds: ['contribution.gamma'],
    effectIds: ['effect.missing'],
}), /active effect/i);

const restarted = JSON.parse(JSON.stringify(summarized));
assert.deepEqual(restarted, summarized);
assert.deepEqual(validateStorySettlement(restarted), { ok: true, errors: [] });

const checkpointed = checkpointStoryEpisode(restarted, { force: true });
assert.equal(checkpointed.episodes.length, 1);
assert.deepEqual(checkpointed.episodes[0].workingCapsule, restarted.episodes[0].workingCapsule);

const repaired = invalidateStorySource(checkpointed, {
    contributionId: 'contribution.delta',
    reason: 'selected-swipe-changed',
});
assert.equal(repaired.activeEpisode, 'episode.capsule');
assert.equal(repaired.episodes[0].workingCapsule.summary, '');
assert.equal(repaired.episodes[0].workingCapsule.foregroundQuestion, null);
assert.deepEqual(repaired.episodes[0].workingCapsule.sourceContributionIds, []);
assert.deepEqual(repaired.episodes[0].workingCapsule.effectIds, []);
assert.equal(repaired.episodes[0].workingCapsule.needsReview, true);
assert.deepEqual(
    repaired.episodes[0].workingCapsule.recentEvidence.map((item) => item.contributionId),
    ['contribution.gamma', 'contribution.epsilon', 'contribution.zeta', 'contribution.eta', 'contribution.theta'],
);
assert.equal(repaired.episodes[0].workingCapsule.observedContributionCount, 7);
assert.equal(repaired.episodes[0].workingCapsule.summary.includes('material'), false, 'repair never regenerates prose');

const sealReady = appendStoryEffects(observedAlpha, [{
    id: 'effect.alpha',
    type: 'mission.eventOccurred',
    targetId: 'event.alpha',
    value: true,
    sourceContributionIds: ['contribution.alpha'],
    playerVisibility: 'visible',
    status: 'active',
}]);
const sealed = sealStoryEpisode(sealReady, {
    boundaryReason: 'scene-change',
    summary: 'A material event concluded.',
});
assert.equal(Object.hasOwn(sealed.episodes[0], 'workingCapsule'), false);
assert.equal(JSON.stringify(sealed).includes('First accepted passage'), false);

const insignificant = settleInsignificantScene(empty, {
    sceneId: 'scene.routine-acknowledgement',
    sourceContributionIds: ['contribution.routine'],
    sourceContributions: [{ id: 'contribution.routine', messageId: 'message.routine' }],
});
assert.equal(insignificant.episodes.length, 0);
assert.equal(JSON.stringify(insignificant).includes('storyWorkingCapsule'), false);

const legacyOpen = structuredClone(opened);
delete legacyOpen.episodes[0].workingCapsule;
assert.equal(validateStorySettlement(legacyOpen).ok, true, 'legacy V1 open episodes remain readable');
const normalizedLegacy = checkpointStoryEpisode(legacyOpen, { force: true });
assert.equal(normalizedLegacy.episodes[0].workingCapsule.kind, 'directive.storyWorkingCapsule.v1');

console.log('V1 working capsule tests passed.');
