import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createEpisodeHardBoundary } from '../../src/story/episode-boundary.mjs';
import { createPeoplePlayerProjection } from '../../src/projection/v1/people-projection.mjs';
import { createEmptyStorySettlement, validateStorySettlement } from '../../src/story/story-settlement-contracts.mjs';
import {
    acceptStoryContribution,
    appendStoryEffects,
    invalidateStorySource,
    openStoryEpisode,
    sealStoryEpisode,
} from '../../src/story/story-settlement.mjs';

const definition = JSON.parse(fs.readFileSync(
    'packages/bundled/breckenridge/v1/prelude-a-ship-underway.mission-v1.json',
    'utf8',
));
const crewDataset = JSON.parse(fs.readFileSync(
    'packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json',
    'utf8',
));
const runtimeAssets = { crewDataset };
const missionProjection = {
    kind: 'directive.missionPlayerProjection.v1',
    missionId: definition.id,
    title: definition.playerText.title,
};
const emptySettlement = createEmptyStorySettlement({ branchId: 'save.people' });
const baseline = createPeoplePlayerProjection({
    runtimeAssets,
    definition,
    missionProjection,
    storySettlement: emptySettlement,
});
assert.equal(baseline.kind, 'directive.peoplePlayerProjection.v1');
assert.equal(baseline.people.length, 7);
assert.equal(baseline.people.every((person) => person.moments.length === 0), true);
assert.equal(baseline.people.every((person) => person.relationshipPosture === null), true);
assert.equal(
    baseline.people.every((person) => !Object.hasOwn(person, 'missionLink')),
    true,
    'the People page does not duplicate the active mission',
);
const baselineWhitaker = baseline.people.find((person) => person.id === 'mara-whitaker');
assert.match(baselineWhitaker.profileSummary, /first and current commanding officer/i);
assert.deepEqual(baselineWhitaker.portrait, {
    kind: 'crew.portrait.formal',
    subjectId: 'mara-whitaker',
});
assert.deepEqual(baselineWhitaker.service, {
    organization: 'starfleet',
    department: 'command',
    rankCode: 'captain',
    rankLabel: 'Captain',
});
assert.equal(baselineWhitaker.categoryId, 'ships-company');
for (const forbidden of [
    'professionalConfidence',
    'integrityTrust',
    'personalRapport',
    'hiddenQuestion',
    'supports-with-reservations',
    'memoryLedger',
]) {
    assert.equal(JSON.stringify(baseline).includes(forbidden), false, forbidden);
}

let settlement = openStoryEpisode(emptySettlement, {
    episodeId: 'episode.handover',
    sceneId: 'scene.handover',
    references: {
        missionIds: [definition.id],
        participantIds: ['mara-whitaker', 'hadrik-bronn'],
    },
});
settlement = acceptStoryContribution(settlement, {
    id: 'contribution.handover',
    messageId: 'message.handover',
    swipeId: 'swipe.1',
    role: 'assistant',
    textHash: 'a'.repeat(64),
    acceptedAtRevision: settlement.revision,
});
settlement = appendStoryEffects(settlement, [{
    id: 'effect.handover',
    type: 'mission.eventOccurred',
    targetId: 'event.prelude.command-handover-completed',
    value: true,
    sourceContributionIds: ['contribution.handover'],
    playerVisibility: 'visible',
    status: 'active',
}, {
    id: 'effect.whitaker.relationship-posture',
    type: 'character.relationshipPosture',
    targetId: 'mara-whitaker',
    value: 'Whitaker extends cautious professional trust.',
    sourceContributionIds: ['contribution.handover'],
    playerVisibility: 'visible',
    status: 'active',
}]);
const boundary = createEpisodeHardBoundary({
    id: 'boundary.handover',
    branchId: 'save.people',
    code: 'authored-scene-closure',
    source: { kind: 'campaignReducer', id: 'campaign.handover' },
    sourceContributionIds: ['contribution.handover'],
});
settlement = sealStoryEpisode(settlement, {
    boundaryReason: boundary.code,
    hardBoundary: boundary,
    summary: 'Whitaker and the XO completed the handover.',
    characterMoments: [{
        id: 'moment.whitaker.handover',
        characterId: 'mara-whitaker',
        summary: 'Whitaker entrusted the new XO with the watch after establishing clear command boundaries.',
        playerVisibility: 'visible',
        sourceContributionIds: ['contribution.handover'],
    }, {
        id: 'moment.bronn.private',
        characterId: 'hadrik-bronn',
        summary: 'PRIVATE-CANARY-BRONN-INTERPRETATION',
        playerVisibility: 'hidden',
        sourceContributionIds: ['contribution.handover'],
    }],
});
assert.equal(validateStorySettlement(settlement).ok, true);

const projected = createPeoplePlayerProjection({
    runtimeAssets,
    definition,
    missionProjection,
    storySettlement: settlement,
});
const whitaker = projected.people.find((person) => person.id === 'mara-whitaker');
const bronn = projected.people.find((person) => person.id === 'hadrik-bronn');
assert.equal(whitaker.relationshipPosture, 'Whitaker extends cautious professional trust.');
assert.deepEqual(whitaker.moments, [{
    id: 'moment.whitaker.handover',
    episodeId: 'episode.handover',
    sealedAtRevision: settlement.episodes[0].sealedAtRevision,
    summary: 'Whitaker entrusted the new XO with the watch after establishing clear command boundaries.',
    sourceRefs: {
        episodeId: 'episode.handover',
        sourceContributionIds: ['contribution.handover'],
    },
}]);
assert.deepEqual(bronn.moments, []);
assert.equal(JSON.stringify(projected).includes('PRIVATE-CANARY'), false);
assert.equal(JSON.stringify(projected).includes('professionalConfidence'), false);

const invalidated = invalidateStorySource(settlement, {
    contributionId: 'contribution.handover',
    reason: 'selected-swipe-changed',
});
const afterInvalidation = createPeoplePlayerProjection({
    runtimeAssets,
    definition,
    missionProjection,
    storySettlement: invalidated,
});
assert.equal(afterInvalidation.people.every((person) => person.moments.length === 0), true);

const duplicateMoment = structuredClone(settlement);
duplicateMoment.episodes[0].characterMoments.push({
    ...duplicateMoment.episodes[0].characterMoments[0],
    id: 'moment.whitaker.duplicate',
});
assert.match(validateStorySettlement(duplicateMoment).errors.join('\n'), /one character moment per character/);

const badSourceMoment = structuredClone(settlement);
badSourceMoment.episodes[0].characterMoments[0].sourceContributionIds = ['contribution.missing'];
assert.match(validateStorySettlement(badSourceMoment).errors.join('\n'), /unknown source contribution/);

console.log('V1 concise people projection tests passed.');
