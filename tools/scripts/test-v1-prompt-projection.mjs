import assert from 'node:assert/strict';

import {
    createV1PromptProjection,
    createV1WorkingStoryPromptProjection,
} from '../../src/projection/v1/prompt-projection.mjs';

const entries = [
    {
        id: 'episode.old-unrelated',
        sealedAtRevision: 2,
        summary: 'An older unrelated development.',
        lastingChanges: [],
        unresolvedConsequences: [],
        references: { missionIds: ['mission.other'], questIds: [], participantIds: [], locationIds: [] },
        sourceRefs: { episodeId: 'episode.old-unrelated', effectIds: [] },
    },
    {
        id: 'episode.current-mission',
        sealedAtRevision: 5,
        summary: 'The current mission advanced.',
        lastingChanges: [{ id: 'effect.current', type: 'mission.eventOccurred', targetId: 'event.current', value: true }],
        unresolvedConsequences: [],
        references: { missionIds: ['mission.prelude'], questIds: [], participantIds: [], locationIds: [] },
        sourceRefs: { episodeId: 'episode.current-mission', effectIds: ['effect.current'] },
    },
    {
        id: 'episode.current-cast',
        sealedAtRevision: 4,
        summary: 'Whitaker established a lasting boundary.',
        lastingChanges: [],
        unresolvedConsequences: [],
        references: { missionIds: [], questIds: [], participantIds: ['mara-whitaker'], locationIds: ['bridge'] },
        sourceRefs: { episodeId: 'episode.current-cast', effectIds: [] },
    },
    {
        id: 'episode.focused',
        sealedAtRevision: 3,
        summary: 'A parentless obligation remains unresolved.',
        lastingChanges: [],
        unresolvedConsequences: [{ id: 'consequence.focused', summary: 'Decide whether to answer the obligation.' }],
        references: { missionIds: [], questIds: [], participantIds: [], locationIds: [] },
        sourceRefs: { episodeId: 'episode.focused', effectIds: [] },
    },
];
const storyProjection = {
    kind: 'directive.storyPlayerProjection.v1',
    branchId: 'save.prompt',
    revision: 9,
    entries,
    focus: {
        id: 'focus.focused',
        episodeId: 'episode.focused',
        consequenceId: 'consequence.focused',
    },
};

const before = structuredClone(storyProjection);
const prompt = createV1PromptProjection({
    storyProjection,
    activeMissionId: 'mission.prelude',
    participantIds: ['mara-whitaker'],
    locationId: 'bridge',
    maxEntries: 3,
    maxCharacters: 1600,
});
assert.equal(prompt.kind, 'directive.promptStoryProjection.v1');
assert.deepEqual(prompt.entries.map((entry) => entry.id), [
    'episode.focused',
    'episode.current-cast',
    'episode.current-mission',
]);
assert.deepEqual(prompt.focus, storyProjection.focus);
assert.equal(prompt.truncated, true);
assert.equal(JSON.stringify(prompt).length <= 1600, true);
assert.deepEqual(storyProjection, before);
assert.deepEqual(createV1PromptProjection({
    storyProjection,
    activeMissionId: 'mission.prelude',
    participantIds: ['mara-whitaker'],
    locationId: 'bridge',
    maxEntries: 3,
    maxCharacters: 1600,
}), prompt);

const staleFocusProjection = {
    ...storyProjection,
    entries: entries.filter((entry) => entry.id !== 'episode.focused'),
};
const staleFocusPrompt = createV1PromptProjection({ storyProjection: staleFocusProjection });
assert.equal(staleFocusPrompt.focus, null);
assert.equal(JSON.stringify(staleFocusPrompt).includes('consequence.focused'), false);

const tiny = createV1PromptProjection({
    storyProjection,
    maxEntries: 4,
    maxCharacters: 280,
});
assert.equal(JSON.stringify(tiny).length <= 280, true);
assert.equal(tiny.entries.length >= 1, true);

const working = createV1WorkingStoryPromptProjection({
    settlement: {
        activeEpisode: 'episode.current',
        episodes: [{
            id: 'episode.current',
            status: 'open',
            workingCapsule: {
                summary: 'Whitaker and the commander are testing the tone of their new working relationship.',
                foregroundQuestion: 'Will the commander answer with candor or formality?',
                recentEvidence: [{ role: 'assistant', excerpt: 'Whitaker leaves the question open.' }, {
                    role: 'runtime', excerpt: 'SECRET RUNTIME AUTHORITY',
                }, {
                    role: 'user', excerpt: 'I answer her plainly.'
                }],
            },
        }],
    },
});
assert.deepEqual(working, {
    kind: 'directive.workingStoryPromptProjection.v1',
    episodeId: 'episode.current',
    summary: 'Whitaker and the commander are testing the tone of their new working relationship.',
    foregroundQuestion: 'Will the commander answer with candor or formality?',
    recentEvidence: [
        { role: 'assistant', excerpt: 'Whitaker leaves the question open.' },
        { role: 'user', excerpt: 'I answer her plainly.' },
    ],
    truncated: false,
});
assert.equal(JSON.stringify(working).includes('SECRET RUNTIME AUTHORITY'), false);
assert.equal(createV1WorkingStoryPromptProjection({ settlement: {} }), null);

console.log('V1 prompt-ready story projection tests passed.');
