import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
    createEmptyStorySettlement,
    validateStorySettlement,
} from '../../src/story/story-settlement-contracts.mjs';

const schema = JSON.parse(fs.readFileSync('schemas/story/story-settlement.schema.json', 'utf8'));
assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
assert.equal(schema.additionalProperties, false);
assert.equal(schema.properties.kind.const, 'directive.storySettlement.v1');
assert.equal(schema.$defs.episode.additionalProperties, false);
assert.equal(schema.$defs.sourceContribution.additionalProperties, false);
assert.equal(schema.$defs.effect.additionalProperties, false);
assert.equal(schema.$defs.receipt.additionalProperties, false);
assert.equal(schema.$defs.focus.additionalProperties, false);
assert.equal(Object.hasOwn(schema.properties, 'rawTranscript'), false);

const empty = createEmptyStorySettlement({ branchId: 'save.alpha' });

assert.deepEqual(empty, {
    kind: 'directive.storySettlement.v1',
    schemaVersion: 1,
    branchId: 'save.alpha',
    revision: 0,
    activeEpisode: null,
    episodes: [],
    receipts: [],
    focus: null,
});

assert.deepEqual(validateStorySettlement(empty), { ok: true, errors: [] });

assert.match(
    validateStorySettlement({ ...empty, branchId: '' }).errors.join('\n'),
    /branchId/,
);

assert.match(
    validateStorySettlement({ ...empty, branchId: 'bad branch id' }).errors.join('\n'),
    /branchId/,
);

assert.match(
    validateStorySettlement({ ...empty, kind: 'directive.storySettlement.v0' }).errors.join('\n'),
    /kind/,
);

for (const [label, value, pattern] of [
    ['schema version', { ...empty, schemaVersion: 2 }, /schemaVersion/],
    ['revision', { ...empty, revision: -1 }, /revision/],
    ['episodes collection', { ...empty, episodes: null }, /episodes/],
    ['receipts collection', { ...empty, receipts: null }, /receipts/],
]) {
    assert.match(validateStorySettlement(value).errors.join('\n'), pattern, label);
}

const openEpisode = {
    kind: 'directive.storyEpisode.v1',
    id: 'episode.alpha',
    branchId: 'save.alpha',
    sceneId: 'scene.bridge-handover',
    status: 'open',
    openedAtRevision: 1,
    sealedAtRevision: null,
    boundaryReason: null,
    summary: null,
    contributions: [],
    effects: [],
    unresolvedConsequences: [],
};

assert.match(
    validateStorySettlement({
        ...empty,
        activeEpisode: 'episode.alpha',
        episodes: [
            openEpisode,
            { ...openEpisode, id: 'episode.beta', sceneId: 'scene.ready-room' },
        ],
    }).errors.join('\n'),
    /more than one nonterminal episode/,
);

for (const [label, settlement, pattern] of [
    [
        'episode kind',
        { ...empty, activeEpisode: 'episode.alpha', episodes: [{ ...openEpisode, kind: 'story.episode' }] },
        /episode\.alpha kind/,
    ],
    [
        'episode status',
        { ...empty, activeEpisode: 'episode.alpha', episodes: [{ ...openEpisode, status: 'done' }] },
        /episode\.alpha status/,
    ],
    [
        'active episode pointer',
        { ...empty, activeEpisode: 'episode.missing', episodes: [openEpisode] },
        /activeEpisode/,
    ],
]) {
    assert.match(validateStorySettlement(settlement).errors.join('\n'), pattern, label);
}

assert.match(
    validateStorySettlement({
        ...empty,
        episodes: [{
            ...openEpisode,
            id: '',
            branchId: 'save.beta',
            sceneId: '',
            openedAtRevision: -1,
            contributions: null,
            effects: null,
            unresolvedConsequences: null,
        }],
    }).errors.join('\n'),
    /episode id.*branchId.*sceneId.*openedAtRevision.*contributions.*effects.*unresolvedConsequences/s,
);

assert.match(
    validateStorySettlement({ ...empty, episodes: [openEpisode] }).errors.join('\n'),
    /activeEpisode must reference the current nonterminal episode/,
);

assert.match(
    validateStorySettlement({
        ...empty,
        episodes: [
            { ...openEpisode, status: 'invalidated' },
            { ...openEpisode, status: 'sealed', sealedAtRevision: 2, boundaryReason: 'scene-change', summary: 'Bridge handover completed.' },
        ],
    }).errors.join('\n'),
    /duplicate episode id/,
);

assert.match(
    validateStorySettlement({
        ...empty,
        episodes: [{ ...openEpisode, status: 'sealed' }],
    }).errors.join('\n'),
    /sealedAtRevision.*boundaryReason.*summary/s,
);

assert.match(
    validateStorySettlement({
        ...empty,
        activeEpisode: 'episode.alpha',
        episodes: [{
            ...openEpisode,
            contributions: [{ id: 'contribution.alpha' }],
        }],
    }).errors.join('\n'),
    /messageId.*role.*textHash.*acceptedAtRevision/s,
);

const contribution = {
    id: 'contribution.alpha',
    messageId: 'message.1',
    swipeId: null,
    role: 'assistant',
    textHash: 'a'.repeat(64),
    acceptedAtRevision: 1,
};
assert.match(
    validateStorySettlement({
        ...empty,
        activeEpisode: 'episode.alpha',
        episodes: [{ ...openEpisode, contributions: [contribution, { ...contribution }] }],
    }).errors.join('\n'),
    /duplicate contribution id/,
);

const effect = {
    id: 'effect.alpha',
    type: 'mission.eventOccurred',
    targetId: 'event.handover-complete',
    sourceContributionIds: [],
    playerVisibility: 'visible',
    status: 'active',
};

assert.match(
    validateStorySettlement({
        ...empty,
        activeEpisode: 'episode.alpha',
        episodes: [{ ...openEpisode, effects: [effect, { ...effect }] }],
    }).errors.join('\n'),
    /duplicate effect id/,
);

assert.match(
    validateStorySettlement({
        ...empty,
        activeEpisode: 'episode.alpha',
        episodes: [{ ...openEpisode, effects: [{ id: 'effect.invalid' }] }],
    }).errors.join('\n'),
    /effect\.invalid type.*targetId.*sourceContributionIds.*playerVisibility.*status/s,
);

assert.match(
    validateStorySettlement({
        ...empty,
        receipts: [{ id: 'receipt.alpha' }],
    }).errors.join('\n'),
    /kind.*branchId.*sceneId.*disposition.*sourceContributionIds.*settledAtRevision/s,
);

const receipt = {
    kind: 'directive.storySettlementReceipt.v1',
    id: 'receipt.alpha',
    branchId: 'save.alpha',
    sceneId: 'scene.bridge-handover',
    disposition: 'insignificant',
    episodeId: null,
    sourceContributionIds: [],
    settledAtRevision: 1,
};

assert.match(
    validateStorySettlement({ ...empty, receipts: [receipt, { ...receipt }] }).errors.join('\n'),
    /duplicate receipt id/,
);

assert.match(
    validateStorySettlement({
        ...empty,
        receipts: [{ ...receipt, branchId: 'save.beta' }],
    }).errors.join('\n'),
    /receipt\.alpha branchId must match the settlement branch/,
);

const sealedEpisode = {
    ...openEpisode,
    status: 'sealed',
    sealedAtRevision: 2,
    boundaryReason: 'scene-change',
    summary: 'Bridge handover completed with one unresolved readiness concern.',
    unresolvedConsequences: [{
        id: 'consequence.readiness-review',
        status: 'unresolved',
        playerVisibility: 'visible',
    }],
};
const focus = {
    kind: 'directive.emergentFocus.v1',
    id: 'focus.readiness-review',
    branchId: 'save.alpha',
    episodeId: 'episode.alpha',
    consequenceId: 'consequence.readiness-review',
    setAtRevision: 3,
};

assert.equal(validateStorySettlement({ ...empty, episodes: [sealedEpisode], focus }).ok, true);

for (const [label, settlement, pattern] of [
    ['focus branch', { ...empty, episodes: [sealedEpisode], focus: { ...focus, branchId: 'save.beta' } }, /Focus.*current branch/],
    ['focus episode', { ...empty, episodes: [sealedEpisode], focus: { ...focus, episodeId: 'episode.missing' } }, /Focus.*sealed episode/],
    ['focus consequence', { ...empty, episodes: [sealedEpisode], focus: { ...focus, consequenceId: 'consequence.missing' } }, /Focus.*unresolved consequence/],
    ['focus resolved consequence', {
        ...empty,
        episodes: [{
            ...sealedEpisode,
            unresolvedConsequences: [{
                id: 'consequence.readiness-review',
                status: 'resolved',
                playerVisibility: 'visible',
            }],
        }],
        focus,
    }, /Focus.*unresolved consequence/],
]) {
    assert.match(validateStorySettlement(settlement).errors.join('\n'), pattern, label);
}

assert.match(
    validateStorySettlement({
        ...empty,
        episodes: [sealedEpisode],
        focus: { ...focus, kind: 'directive.emergentFocus.v0', id: '', setAtRevision: -1 },
    }).errors.join('\n'),
    /Focus kind.*Focus id.*setAtRevision/s,
);

assert.match(
    validateStorySettlement({ ...empty, focus: 'consequence.readiness-review' }).errors.join('\n'),
    /focus must be an object or null/,
);

console.log('V1 Story Settlement contract tests passed.');
