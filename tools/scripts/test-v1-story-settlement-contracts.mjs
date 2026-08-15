import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
    createEmptyStorySettlement,
    validateStorySettlement,
} from '../../src/story/story-settlement-contracts.mjs';
import {
    createV1AcceptedPairReceipt,
    v1AcceptedPairReceiptMatches,
} from '../../src/runtime/v1-accepted-pair-receipt.mjs';

const schema = JSON.parse(fs.readFileSync('schemas/story/story-settlement.schema.json', 'utf8'));
assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
assert.equal(schema.additionalProperties, false);
assert.equal(schema.properties.kind.const, 'directive.storySettlement.v1');
assert.equal(schema.$defs.episode.additionalProperties, false);
assert.equal(schema.$defs.sourceContribution.additionalProperties, false);
assert.equal(schema.$defs.effect.additionalProperties, false);
assert.equal(schema.$defs.receipt.additionalProperties, false);
assert.equal(schema.$defs.acceptedPairReceipt.additionalProperties, false);
assert.equal(schema.$defs.acceptedPairSource.additionalProperties, false);
assert.equal(schema.$defs.focus.additionalProperties, false);
assert.equal(schema.$defs.episodeBoundaryState.additionalProperties, false);
assert.equal(schema.$defs.episodeHardBoundary.additionalProperties, false);
assert.equal(schema.$defs.episodeSoftBoundary.additionalProperties, false);
assert.equal(schema.$defs.episodeReferences.additionalProperties, false);
assert.equal(schema.$defs.characterMoment.additionalProperties, false);
assert.equal(schema.$defs.workingCapsule.additionalProperties, false);
assert.equal(schema.$defs.workingEvidence.additionalProperties, false);
assert.equal(schema.$defs.episode.properties.workingCapsule.$ref, '#/$defs/workingCapsule');
assert.equal(schema.$defs.episode.properties.softBoundary.anyOf[1].$ref, '#/$defs/episodeSoftBoundary');
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
    acceptedPairReceipts: [],
    focus: null,
});

assert.deepEqual(validateStorySettlement(empty), { ok: true, errors: [] });
const legacyEmpty = structuredClone(empty);
delete legacyEmpty.acceptedPairReceipts;
assert.deepEqual(
    validateStorySettlement(legacyEmpty),
    { ok: true, errors: [] },
    'schema-v1 saves without durable pair receipts remain valid',
);

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
    ['accepted-pair receipts collection', { ...empty, acceptedPairReceipts: null }, /acceptedPairReceipts/],
]) {
    assert.match(validateStorySettlement(value).errors.join('\n'), pattern, label);
}

const acceptedPairReceipt = {
    kind: 'directive.acceptedPairReceipt.v1',
    id: 'accepted-pair.aaaaaaaaaaaaaaaaaaaaaaaa.corrected',
    branchId: 'save.alpha',
    fingerprint: 'a'.repeat(24),
    sourceRangeHash: 'range.accepted-pair.alpha',
    previousAssistant: {
        messageId: 'message.assistant.1',
        selectedSwipeId: '0',
        textHash: 'b'.repeat(64),
    },
    currentPlayer: {
        messageId: 'message.player.2',
        selectedSwipeId: null,
        textHash: 'c'.repeat(64),
    },
    assistantAcceptance: 'corrected',
    sourceContributionIds: ['contribution.player.2'],
    settledAtRevision: 1,
};
assert.equal(validateStorySettlement({
    ...empty,
    revision: 1,
    acceptedPairReceipts: [acceptedPairReceipt],
}).ok, true);

for (const [label, receiptValue, pattern] of [
    ['kind', { ...acceptedPairReceipt, kind: 'directive.acceptedPairReceipt.v0' }, /kind/],
    ['branch', { ...acceptedPairReceipt, branchId: 'save.beta' }, /branchId/],
    ['fingerprint', { ...acceptedPairReceipt, fingerprint: 'not-a-fingerprint' }, /fingerprint/],
    ['range', { ...acceptedPairReceipt, sourceRangeHash: '' }, /sourceRangeHash/],
    ['assistant source', { ...acceptedPairReceipt, previousAssistant: { ...acceptedPairReceipt.previousAssistant, textHash: '' } }, /previousAssistant/],
    ['player source', { ...acceptedPairReceipt, currentPlayer: { ...acceptedPairReceipt.currentPlayer, selectedSwipeId: '' } }, /currentPlayer/],
    ['acceptance', { ...acceptedPairReceipt, assistantAcceptance: 'probably' }, /assistantAcceptance/],
    ['source contributions', { ...acceptedPairReceipt, sourceContributionIds: ['bad contribution id'] }, /sourceContributionIds/],
    ['revision', { ...acceptedPairReceipt, settledAtRevision: -1 }, /settledAtRevision/],
]) {
    assert.match(validateStorySettlement({
        ...empty,
        acceptedPairReceipts: [receiptValue],
    }).errors.join('\n'), pattern, label);
}
assert.match(validateStorySettlement({
    ...empty,
    acceptedPairReceipts: [
        acceptedPairReceipt,
        { ...acceptedPairReceipt, id: 'accepted-pair.aaaaaaaaaaaaaaaaaaaaaaaa.accepted', assistantAcceptance: 'accepted' },
    ],
}).errors.join('\n'), /duplicate accepted-pair fingerprint/);

const sourcePair = {
    previousAssistant: {
        messageId: 'message.assistant.1',
        selectedSwipeId: '0',
        textHash: 'b'.repeat(64),
    },
    currentPlayer: {
        messageId: 'message.player.2',
        selectedSwipeId: null,
        textHash: 'c'.repeat(64),
    },
};
const createdAcceptedPairReceipt = createV1AcceptedPairReceipt({
    branchId: 'save.alpha',
    sourceRangeHash: 'range.accepted-pair.alpha',
    sourcePair,
    assistantAcceptance: 'corrected',
    sourceContributionIds: ['contribution.player.2'],
});
assert.equal(createdAcceptedPairReceipt.kind, 'directive.acceptedPairReceipt.v1');
assert.match(createdAcceptedPairReceipt.fingerprint, /^[a-f0-9]{24}$/);
assert.equal(createdAcceptedPairReceipt.id, `accepted-pair.${createdAcceptedPairReceipt.fingerprint}.corrected`);
assert.equal(v1AcceptedPairReceiptMatches(createdAcceptedPairReceipt, {
    branchId: 'save.alpha',
    sourceRangeHash: 'range.accepted-pair.alpha',
    sourcePair,
}), true);
assert.equal(v1AcceptedPairReceiptMatches(createdAcceptedPairReceipt, {
    branchId: 'save.alpha',
    sourceRangeHash: 'range.accepted-pair.alpha',
    sourcePair: {
        ...sourcePair,
        previousAssistant: { ...sourcePair.previousAssistant, selectedSwipeId: '1' },
    },
}), false, 'identical text under another swipe is a different accepted-pair source');
assert.equal(v1AcceptedPairReceiptMatches(createdAcceptedPairReceipt, {
    branchId: 'save.beta',
    sourceRangeHash: 'range.accepted-pair.alpha',
    sourcePair,
}), false);

const boundaryState = {
    kind: 'directive.episodeBoundaryState.v1',
    checkpointSequence: 0,
    lastReviewedAtRevision: 1,
    contributionCountAtLastReview: 0,
    effectCountAtLastReview: 0,
    decision: 'continue',
    sourceContributionIds: [],
};
const references = {
    missionIds: ['mission.prelude'],
    questIds: [],
    participantIds: ['mara-whitaker'],
    locationIds: ['bridge'],
};
const workingCapsule = {
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
};

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
    boundaryState,
    hardBoundary: null,
    references,
    characterMoments: [],
    workingCapsule,
};
function asTerminal(overrides = {}) {
    const episode = { ...openEpisode, ...overrides };
    delete episode.workingCapsule;
    return episode;
}

assert.equal(validateStorySettlement({
    ...empty,
    revision: 1,
    activeEpisode: 'episode.alpha',
    episodes: [openEpisode],
}).ok, true);

for (const [field, pattern] of [
    ['boundaryState', /boundaryState must be an object/],
    ['references', /references must be an object/],
    ['characterMoments', /characterMoments must be an array/],
    ['workingCapsule', /workingCapsule is required/],
    ['hardBoundary', /hardBoundary is required/],
]) {
    const incompleteEpisode = { ...openEpisode };
    delete incompleteEpisode[field];
    assert.match(validateStorySettlement({
        ...empty,
        revision: 1,
        activeEpisode: 'episode.alpha',
        episodes: [incompleteEpisode],
    }).errors.join('\n'), pattern, `missing ${field}`);
}
assert.equal(validateStorySettlement({
    ...empty,
    revision: 1,
    activeEpisode: 'episode.alpha',
    episodes: [{ ...openEpisode, references }],
}).ok, true);
assert.equal(validateStorySettlement({
    ...empty,
    revision: 1,
    activeEpisode: 'episode.alpha',
    episodes: [{ ...openEpisode, workingCapsule }],
}).ok, true);
assert.match(validateStorySettlement({
    ...empty,
    revision: 1,
    episodes: [{
        ...openEpisode,
        status: 'sealed',
        sealedAtRevision: 1,
        boundaryReason: 'scene-change',
        summary: 'A sealed scene.',
        workingCapsule,
    }],
}).errors.join('\n'), /terminal episodes cannot retain workingCapsule/);
assert.match(validateStorySettlement({
    ...empty,
    revision: 1,
    activeEpisode: 'episode.alpha',
    episodes: [{ ...openEpisode, workingCapsule: { ...workingCapsule, rawTranscript: 'forbidden' } }],
}).errors.join('\n'), /workingCapsule contains unknown field: rawTranscript/);
assert.match(validateStorySettlement({
    ...empty,
    activeEpisode: 'episode.alpha',
    episodes: [{ ...openEpisode, references: { ...references, participantIds: ['bad participant id'] } }],
}).errors.join('\n'), /references participantIds contains an invalid id/);
assert.match(validateStorySettlement({
    ...empty,
    activeEpisode: 'episode.alpha',
    episodes: [{ ...openEpisode, references: { ...references, extra: [] } }],
}).errors.join('\n'), /references contains unknown field/);

for (const [label, badBoundaryState, pattern] of [
    ['kind', { ...boundaryState, kind: 'directive.episodeBoundaryState.v0' }, /boundaryState kind/],
    ['sequence', { ...boundaryState, checkpointSequence: -1 }, /checkpointSequence/],
    ['review revision', { ...boundaryState, lastReviewedAtRevision: 0 }, /lastReviewedAtRevision/],
    ['count', { ...boundaryState, contributionCountAtLastReview: -1 }, /contributionCountAtLastReview/],
    ['decision', { ...boundaryState, decision: 'seal' }, /decision/],
    ['source ids', { ...boundaryState, sourceContributionIds: ['bad contribution id'] }, /sourceContributionIds/],
]) {
    assert.match(validateStorySettlement({
        ...empty,
        activeEpisode: 'episode.alpha',
        episodes: [{ ...openEpisode, boundaryState: badBoundaryState }],
    }).errors.join('\n'), pattern, label);
}

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
            asTerminal({ status: 'invalidated' }),
            asTerminal({ status: 'sealed', sealedAtRevision: 2, boundaryReason: 'scene-change', summary: 'Bridge handover completed.' }),
        ],
    }).errors.join('\n'),
    /duplicate episode id/,
);

assert.match(
    validateStorySettlement({
        ...empty,
        episodes: [asTerminal({ status: 'sealed' })],
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

const softBoundary = {
    kind: 'directive.episodeSoftBoundary.v1',
    reason: 'foreground-question-resolved',
    significanceCriteria: ['material-state-change'],
    sourceContributionIds: ['contribution.alpha'],
    effectIds: ['effect.alpha'],
    checkpointSequence: 1,
};
const softSealedEpisode = asTerminal({
    status: 'sealed',
    sealedAtRevision: 2,
    boundaryReason: softBoundary.reason,
    summary: 'The readiness review reached a durable conclusion.',
    contributions: [contribution],
    effects: [{ ...effect, sourceContributionIds: ['contribution.alpha'] }],
    softBoundary,
});
assert.equal(validateStorySettlement({
    ...empty,
    revision: 2,
    episodes: [softSealedEpisode],
}).ok, true);
for (const [label, episodeValue, pattern] of [
    ['open soft boundary', { ...softSealedEpisode, status: 'open', sealedAtRevision: null }, /allowed only on sealed or invalidated/],
    ['reason mismatch', { ...softSealedEpisode, boundaryReason: 'encounter-departure' }, /boundaryReason must match/],
    ['unknown source', { ...softSealedEpisode, softBoundary: { ...softBoundary, sourceContributionIds: ['contribution.missing'] } }, /unknown id/],
    ['unknown effect', { ...softSealedEpisode, softBoundary: { ...softBoundary, effectIds: ['effect.missing'] } }, /unknown id/],
    ['unknown field', { ...softSealedEpisode, softBoundary: { ...softBoundary, rationale: 'No.' } }, /unknown field: rationale/],
    ['hard and soft', {
        ...softSealedEpisode,
        hardBoundary: {
            kind: 'directive.episodeHardBoundary.v1',
            id: 'boundary.transition',
            branchId: 'save.alpha',
            code: 'mission-transition',
            source: { kind: 'missionReducer', id: 'transition.alpha' },
            sourceContributionIds: ['contribution.alpha'],
        },
    }, /cannot have both/],
]) {
    assert.match(validateStorySettlement({
        ...empty,
        revision: 2,
        activeEpisode: episodeValue.status === 'open' ? episodeValue.id : null,
        episodes: [episodeValue],
    }).errors.join('\n'), pattern, label);
}

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
    sourceMessageIds: [],
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

assert.match(
    validateStorySettlement({
        ...empty,
        receipts: [{
            ...receipt,
            sourceContributionIds: ['contribution.alpha'],
            sourceMessageIds: [],
        }],
    }).errors.join('\n'),
    /sourceMessageIds must align/,
);

assert.match(
    validateStorySettlement({
        ...empty,
        receipts: [{
            ...receipt,
            sourceContributionIds: ['contribution.alpha', 'contribution.beta'],
            sourceMessageIds: ['message.1', 'message.1'],
        }],
    }).errors.join('\n'),
    /sourceMessageIds must be unique/,
);

const sealedEpisode = asTerminal({
    status: 'sealed',
    sealedAtRevision: 2,
    boundaryReason: 'scene-change',
    summary: 'Bridge handover completed with one unresolved readiness concern.',
    unresolvedConsequences: [{
        id: 'consequence.readiness-review',
        status: 'unresolved',
        playerVisibility: 'visible',
    }],
});

const supersededEpisode = {
    ...sealedEpisode,
    id: 'episode.beta',
    sceneId: 'scene.beta',
    supersedesEpisodeIds: ['episode.alpha'],
};
assert.equal(validateStorySettlement({
    ...empty,
    episodes: [
        { ...sealedEpisode, status: 'invalidated', invalidationReason: 'source changed' },
        supersededEpisode,
    ],
}).ok, true);

assert.match(validateStorySettlement({
    ...empty,
    episodes: [
        sealedEpisode,
        { ...supersededEpisode, supersedesEpisodeIds: ['episode.alpha', 'episode.alpha'] },
    ],
}).errors.join('\n'), /supersedesEpisodeIds must be unique/);
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
