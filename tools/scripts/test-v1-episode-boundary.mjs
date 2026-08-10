import assert from 'node:assert/strict';

import {
    EPISODE_HARD_BOUNDARY_CODES,
    EPISODE_SIGNIFICANCE_CRITERIA,
    EPISODE_SOFT_BOUNDARY_REASONS,
    createEpisodeHardBoundary,
    createEpisodeSoftBoundary,
    validateEpisodeHardBoundary,
    validateEpisodeSoftBoundary,
} from '../../src/story/episode-boundary.mjs';

const sourceKindByCode = {
    'mission-transition': 'missionReducer',
    'authored-scene-closure': 'campaignReducer',
    'save-branch-change': 'branchRuntime',
    'major-time-jump': 'timeAdjudicator',
    'meaningful-location-transition': 'locationRuntime',
    'world-settlement': 'campaignReducer',
    'source-recovery': 'sourceRecovery',
};

assert.deepEqual([...EPISODE_HARD_BOUNDARY_CODES], Object.keys(sourceKindByCode));

for (const [code, sourceKind] of Object.entries(sourceKindByCode)) {
    const boundary = createEpisodeHardBoundary({
        id: `boundary.${code}`,
        branchId: 'save.alpha',
        code,
        source: {
            kind: sourceKind,
            id: `source.${code}`,
        },
        sourceContributionIds: ['contribution.alpha'],
    });
    assert.deepEqual(validateEpisodeHardBoundary(boundary, {
        branchId: 'save.alpha',
        knownContributionIds: ['contribution.alpha'],
    }), { ok: true, errors: [] });
    assert.equal(Object.hasOwn(boundary, 'reason'), false);
}

const valid = createEpisodeHardBoundary({
    id: 'boundary.mission-transition.1',
    branchId: 'save.alpha',
    code: 'mission-transition',
    source: { kind: 'missionReducer', id: 'transition.prelude.chapter-1' },
    sourceContributionIds: ['contribution.alpha'],
});

for (const [label, value, options, pattern] of [
    ['unknown code', { ...valid, code: 'speaker-change' }, {}, /code is unknown/],
    ['wrong source kind', { ...valid, source: { kind: 'timeAdjudicator', id: 'time.1' } }, {}, /source kind/],
    ['wrong branch', valid, { branchId: 'save.beta' }, /branchId must match/],
    ['unknown contribution', valid, { knownContributionIds: [] }, /unknown contribution/],
    ['duplicate contribution', { ...valid, sourceContributionIds: ['contribution.alpha', 'contribution.alpha'] }, {}, /duplicates/],
    ['free-form authority', { ...valid, reason: 'The topic changed.' }, {}, /unknown field: reason/],
    ['source extra field', { ...valid, source: { ...valid.source, label: 'Mission ended' } }, {}, /source unknown field/],
]) {
    assert.match(validateEpisodeHardBoundary(value, options).errors.join('\n'), pattern, label);
}

assert.equal(validateEpisodeHardBoundary({
    kind: 'directive.timeBoundary.v1',
    id: 'time.advance.1',
    branchId: 'save.alpha',
    elapsedMinutes: 5,
    reason: 'conversation elapsed',
}).ok, false, 'an ordinary time advance is not a semantic hard boundary');

assert.equal(validateEpisodeHardBoundary({
    ...valid,
    code: 'room-movement',
    source: { kind: 'locationRuntime', id: 'location.ready-room' },
}).ok, false, 'ordinary room movement is not a hard-boundary code');

assert.throws(
    () => createEpisodeHardBoundary({ ...valid, code: 'topic-change' }),
    /code is unknown/,
);

assert.deepEqual([...EPISODE_SOFT_BOUNDARY_REASONS], [
    'foreground-question-resolved',
    'foreground-question-abandoned',
    'encounter-departure',
    'material-situation-shift',
    'sustained-context-replacement',
]);
assert.deepEqual([...EPISODE_SIGNIFICANCE_CRITERIA], [
    'material-state-change',
    'consequential-fact-learned',
    'commitment-created-or-resolved',
    'relationship-turning-point',
    'future-constraining-decision',
    'lasting-cost-gain-or-loss',
    'unresolved-consequence',
]);
const softBoundary = createEpisodeSoftBoundary({
    reason: 'foreground-question-resolved',
    significanceCriteria: ['commitment-created-or-resolved'],
    sourceContributionIds: ['contribution.alpha'],
    effectIds: ['effect.alpha'],
    checkpointSequence: 2,
});
assert.deepEqual(validateEpisodeSoftBoundary(softBoundary, {
    knownContributionIds: ['contribution.alpha'],
    knownEffectIds: ['effect.alpha'],
}), { ok: true, errors: [] });
for (const [label, value, options, pattern] of [
    ['unknown reason', { ...softBoundary, reason: 'topic-change' }, {}, /reason is unknown/],
    ['unknown criterion', { ...softBoundary, significanceCriteria: ['interesting-detail'] }, {}, /criterion is unknown/],
    ['empty criteria', { ...softBoundary, significanceCriteria: [] }, {}, /non-empty array/],
    ['unknown source', softBoundary, { knownContributionIds: [] }, /unknown id/],
    ['unknown effect', softBoundary, { knownEffectIds: [] }, /unknown id/],
    ['invalid checkpoint', { ...softBoundary, checkpointSequence: 0 }, {}, /positive integer/],
    ['free-form rationale', { ...softBoundary, rationale: 'The scene feels complete.' }, {}, /unknown field: rationale/],
]) {
    assert.match(validateEpisodeSoftBoundary(value, options).errors.join('\n'), pattern, label);
}

console.log('V1 episode boundary contract tests passed.');
