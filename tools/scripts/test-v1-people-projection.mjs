import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createEpisodeHardBoundary } from '../../src/story/episode-boundary.mjs';
import {
    createPeoplePlayerProjection,
    createPeoplePromptProjection,
} from '../../src/projection/v1/people-projection.mjs';
import { createEmptyStorySettlement, validateStorySettlement } from '../../src/story/story-settlement-contracts.mjs';
import {
    acceptStoryContribution,
    appendStoryEffects,
    appendStoryPeopleEvents,
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
assert.equal(baseline.people.every((person) => person.relationshipOpenMatter === null), true);
assert.equal(baseline.people.every((person) => person.knownSince === null), true);
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
assert.equal(baselineWhitaker.species, 'Human');
assert.deepEqual(baselineWhitaker.publicRecord, {
    age: '47',
    birthplace: 'Kingston, Ontario, Earth',
    serviceBackground: 'Science operations, diplomacy, executive command',
    assignmentHistory: "Commanding officer since the Breckenridge's 2372 commission",
});
const baselineBronn = baseline.people.find((person) => person.id === 'hadrik-bronn');
assert.equal(baselineBronn.species, 'Tellarite');
assert.equal(baseline.people.every((person) => (
    Boolean(person.species)
    && Boolean(person.publicRecord?.age)
    && Boolean(person.publicRecord?.birthplace)
    && Boolean(person.publicRecord?.serviceBackground)
)), true);
assert.equal(baselineWhitaker.categoryId, 'ships-company');
for (const forbidden of [
    'professionalConfidence',
    'integrityTrust',
    'personalRapport',
    'hiddenQuestion',
    'supports-with-reservations',
    'memoryLedger',
    'publicReputation',
    'centralStrength',
    'centralFlaw',
    'campaignFunction',
    'narrationGuide',
    'distinguishingHistory',
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
        title: 'The handover watch',
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
    title: 'The handover watch',
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

let emergent = openStoryEpisode(emptySettlement, {
    episodeId: 'episode.emergent',
    sceneId: 'scene.emergent',
    references: { participantIds: [] },
});
emergent = acceptStoryContribution(emergent, {
    id: 'contribution.emergent',
    messageId: 'message.emergent',
    swipeId: 'swipe.emergent',
    role: 'assistant',
    textHash: 'e'.repeat(64),
    acceptedAtRevision: emergent.revision,
});
emergent = appendStoryPeopleEvents(emergent, [{
    id: 'people-event.emergent-intro',
    type: 'personIntroduced',
    personId: 'person.emergent.1234abcd',
    name: 'Ari Sol',
    introductionSummary: 'Ari gave her name during a direct engineering-deck conversation.',
    publicFacts: {
        displayName: 'Ari Sol',
        role: 'Damage Control Specialist',
        affiliation: 'U.S.S. Breckenridge engineering division',
        species: 'Human',
        age: '31',
        birthplace: 'Palo Alto, Earth',
        serviceBackground: 'Damage control and EPS repair',
        assignmentHistory: 'Third engineering watch',
        profileSummary: 'A public-facing damage-control specialist known for calm repair work.',
    },
    sourceContributionIds: ['contribution.emergent'],
}, {
    id: 'people-event.emergent-fact',
    type: 'publicFactLearned',
    personId: 'person.emergent.1234abcd',
    field: 'role',
    value: 'Senior Damage Control Specialist',
    sourceContributionIds: ['contribution.emergent'],
}]);
emergent = appendStoryEffects(emergent, [{
    id: 'effect.emergent-posture',
    type: 'character.relationshipPosture',
    targetId: 'person.emergent.1234abcd',
    value: 'Friendly professional curiosity.',
    sourceContributionIds: ['contribution.emergent'],
    playerVisibility: 'visible',
    status: 'active',
}, {
    id: 'effect.emergent-open-matter',
    type: 'character.relationshipOpenMatter',
    targetId: 'person.emergent.1234abcd',
    value: 'Whether Ari will join the next inspection.',
    sourceContributionIds: ['contribution.emergent'],
    playerVisibility: 'visible',
    status: 'active',
}]);
const emergentProjection = createPeoplePlayerProjection({
    runtimeAssets,
    missionProjection,
    storySettlement: emergent,
});
const ari = emergentProjection.people.find((person) => person.id === 'person.emergent.1234abcd');
assert.ok(ari, 'a named direct introduction creates an immediate People card');
assert.equal(ari.name, 'Ari Sol');
assert.equal(ari.billet, 'Senior Damage Control Specialist');
assert.equal(ari.publicRecord.affiliation, 'U.S.S. Breckenridge engineering division');
assert.equal(ari.publicRecord.age, '31');
assert.equal(ari.profileSummary, 'A public-facing damage-control specialist known for calm repair work.');
assert.equal(ari.knownSince, 'Ari gave her name during a direct engineering-deck conversation.');
assert.equal(ari.relationshipPosture, 'Friendly professional curiosity.');
assert.equal(ari.relationshipOpenMatter, 'Whether Ari will join the next inspection.');
assert.equal(ari.portrait.kind, 'people.portrait.none');
assert.equal(emergentProjection.people.length, baseline.people.length + 1);

const emergentInvalidated = invalidateStorySource(emergent, {
    contributionId: 'contribution.emergent',
    reason: 'selected-swipe-changed',
});
assert.equal(createPeoplePlayerProjection({
    runtimeAssets,
    missionProjection,
    storySettlement: emergentInvalidated,
}).people.some((person) => person.id === 'person.emergent.1234abcd'), false);

let relationshipHistory = createEmptyStorySettlement({ branchId: 'save.people-history' });
for (let index = 0; index < 5; index += 1) {
    relationshipHistory = openStoryEpisode(relationshipHistory, {
        episodeId: `episode.history-${index}`,
        sceneId: `scene.history-${index}`,
        references: { participantIds: ['mara-whitaker'] },
    });
    relationshipHistory = acceptStoryContribution(relationshipHistory, {
        id: `contribution.history-${index}`,
        messageId: `message.history-${index}`,
        swipeId: `swipe.history-${index}`,
        role: 'assistant',
        textHash: String(index + 1).repeat(64),
        acceptedAtRevision: relationshipHistory.revision,
    });
    relationshipHistory = appendStoryEffects(relationshipHistory, [{
        id: `effect.history-${index}`,
        type: 'mission.eventOccurred',
        targetId: `event.history-${index}`,
        value: true,
        sourceContributionIds: [`contribution.history-${index}`],
        playerVisibility: 'visible',
        status: 'active',
    }]);
    relationshipHistory = sealStoryEpisode(relationshipHistory, {
        boundaryReason: 'authored-scene-closure',
        summary: `Relationship episode ${index} concluded.`,
        characterMoments: [{
            id: `moment.history-${index}`,
            characterId: 'mara-whitaker',
            title: `Development ${index}`,
            summary: `A durable relationship development occurred in episode ${index}.`,
            playerVisibility: 'visible',
            sourceContributionIds: [`contribution.history-${index}`],
        }],
    });
}
const fullHistoryProjection = createPeoplePlayerProjection({
    runtimeAssets,
    missionProjection,
    storySettlement: relationshipHistory,
});
assert.equal(
    fullHistoryProjection.people.find((person) => person.id === 'mara-whitaker').moments.length,
    5,
    'the People page retains every defining relationship moment',
);

const promptSource = structuredClone(emergentProjection);
promptSource.people.find((person) => person.id === 'mara-whitaker').moments = Array.from(
    { length: 12 },
    (_, index) => ({
        id: `moment.prompt-${index}`,
        episodeId: `episode.prompt-${index}`,
        sealedAtRevision: index + 1,
        title: `Moment ${index}`,
        summary: `Defining relationship development ${index}.`,
        sourceRefs: { episodeId: `episode.prompt-${index}`, sourceContributionIds: [`contribution.prompt-${index}`] },
    }),
);
const promptProjection = createPeoplePromptProjection({ peopleProjection: promptSource });
assert.equal(promptSource.people.find((person) => person.id === 'mara-whitaker').moments.length, 12);
assert.equal(promptProjection.recentDefiningMoments.length, 8, 'prompt context is bounded independently of stored history');
assert.equal(Object.hasOwn(promptProjection.people[0], 'publicRecord'), false, 'the prompt uses compact identity and relationship state');

console.log('V1 concise people projection tests passed.');
