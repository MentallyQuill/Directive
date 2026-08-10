import assert from 'node:assert/strict';

import { createEpisodeHardBoundary } from '../../src/story/episode-boundary.mjs';
import { createStoryPlayerProjection } from '../../src/projection/v1/story-projection.mjs';
import { createEmptyStorySettlement } from '../../src/story/story-settlement-contracts.mjs';
import {
    acceptStoryContribution,
    appendStoryEffects,
    invalidateStorySource,
    openStoryEpisode,
    sealStoryEpisode,
    setEmergentFocus,
} from '../../src/story/story-settlement.mjs';

function addSealedEpisode(settlement, {
    suffix,
    summary,
    references = {},
    consequence = null,
    hiddenValue = null,
} = {}) {
    let next = openStoryEpisode(settlement, {
        episodeId: `episode.${suffix}`,
        sceneId: `scene.${suffix}`,
        references,
    });
    next = acceptStoryContribution(next, {
        id: `contribution.${suffix}`,
        messageId: `message.${suffix}`,
        swipeId: `swipe.${suffix}`,
        role: 'assistant',
        textHash: suffix.repeat(64).slice(0, 64),
        acceptedAtRevision: next.revision,
    });
    const visibleEffect = {
        id: `effect.${suffix}`,
        type: 'mission.eventOccurred',
        targetId: `event.${suffix}`,
        value: true,
        sourceContributionIds: [`contribution.${suffix}`],
        playerVisibility: 'visible',
        status: 'active',
    };
    const effects = hiddenValue === null ? [visibleEffect] : [visibleEffect, {
        id: `effect.${suffix}.hidden`,
        type: 'mission.worldFactEstablished',
        targetId: `fact.${suffix}.hidden`,
        value: hiddenValue,
        sourceContributionIds: [`contribution.${suffix}`],
        playerVisibility: 'hidden',
        status: 'active',
    }];
    next = appendStoryEffects(next, effects);
    const boundary = createEpisodeHardBoundary({
        id: `boundary.${suffix}`,
        branchId: next.branchId,
        code: 'authored-scene-closure',
        source: { kind: 'campaignReducer', id: `campaign.${suffix}` },
        sourceContributionIds: [`contribution.${suffix}`],
    });
    return sealStoryEpisode(next, {
        boundaryReason: boundary.code,
        hardBoundary: boundary,
        summary,
        unresolvedConsequences: consequence ? [{
            id: `consequence.${suffix}`,
            status: 'unresolved',
            playerVisibility: 'visible',
            summary: consequence,
        }] : [],
    });
}

let settlement = createEmptyStorySettlement({ branchId: 'save.projection' });
settlement = addSealedEpisode(settlement, {
    suffix: 'handover',
    summary: 'The command handover was completed.',
    references: {
        missionIds: ['mission.prelude'],
        questIds: [],
        participantIds: ['mara-whitaker'],
        locationIds: ['bridge'],
    },
    consequence: 'The final readiness review remains ahead.',
    hiddenValue: 'HIDDEN-CANARY-MUST-NOT-PROJECT',
});
settlement = addSealedEpisode(settlement, {
    suffix: 'briefing',
    summary: 'The staff agreed on delegation procedures.',
    references: {
        missionIds: ['mission.prelude'],
        questIds: [],
        participantIds: ['mara-whitaker', 'hadrik-bronn'],
        locationIds: ['briefing-room'],
    },
});

const focused = setEmergentFocus(settlement, {
    focusId: 'focus.handover',
    episodeId: 'episode.handover',
    consequenceId: 'consequence.handover',
});
const snapshot = structuredClone(focused);
const projection = createStoryPlayerProjection({ settlement: focused });
assert.equal(projection.kind, 'directive.storyPlayerProjection.v1');
assert.equal(projection.branchId, 'save.projection');
assert.deepEqual(projection.entries.map((entry) => entry.id), ['episode.handover', 'episode.briefing']);
assert.deepEqual(projection.entries[0].lastingChanges, [{
    id: 'effect.handover',
    type: 'mission.eventOccurred',
    targetId: 'event.handover',
    value: true,
}]);
assert.deepEqual(projection.entries[0].unresolvedConsequences, [{
    id: 'consequence.handover',
    summary: 'The final readiness review remains ahead.',
}]);
assert.deepEqual(projection.entries[0].references, {
    missionIds: ['mission.prelude'],
    questIds: [],
    participantIds: ['mara-whitaker'],
    locationIds: ['bridge'],
});
assert.deepEqual(projection.entries[0].sourceRefs, {
    episodeId: 'episode.handover',
    effectIds: ['effect.handover'],
});
assert.deepEqual(projection.focus, {
    id: 'focus.handover',
    episodeId: 'episode.handover',
    consequenceId: 'consequence.handover',
});
for (const forbidden of [
    'HIDDEN-CANARY-MUST-NOT-PROJECT',
    'message.handover',
    'textHash',
    'contributions',
    'hardBoundary',
    'diagnostics',
]) {
    assert.equal(JSON.stringify(projection).includes(forbidden), false, forbidden);
}
assert.deepEqual(focused, snapshot, 'projection is pure');
assert.deepEqual(createStoryPlayerProjection({ settlement: focused }), projection, 'projection is deterministic');

const invalidated = invalidateStorySource(focused, {
    contributionId: 'contribution.handover',
    reason: 'selected-swipe-changed',
});
const afterInvalidation = createStoryPlayerProjection({ settlement: invalidated });
assert.deepEqual(afterInvalidation.entries.map((entry) => entry.id), ['episode.briefing']);
assert.equal(afterInvalidation.focus, null);

let withActive = openStoryEpisode(focused, {
    episodeId: 'episode.active',
    sceneId: 'scene.active',
    references: { missionIds: ['mission.prelude'] },
});
withActive = acceptStoryContribution(withActive, {
    id: 'contribution.active',
    messageId: 'message.active',
    swipeId: null,
    role: 'user',
    textHash: 'a'.repeat(64),
    acceptedAtRevision: withActive.revision,
});
withActive = appendStoryEffects(withActive, [{
    id: 'effect.active',
    type: 'mission.decisionRecorded',
    targetId: 'outcome.active',
    value: 'pending',
    sourceContributionIds: ['contribution.active'],
    playerVisibility: 'visible',
    status: 'active',
}]);
assert.equal(
    createStoryPlayerProjection({ settlement: withActive }).entries.some((entry) => entry.id === 'episode.active'),
    false,
    'open episodes are not durable story history yet',
);

console.log('V1 story player projection tests passed.');
