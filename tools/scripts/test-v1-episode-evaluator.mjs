import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createEmptyStorySettlement } from '../../src/story/story-settlement-contracts.mjs';
import {
    acceptStoryContributions,
    appendStoryEffects,
    appendStoryPeopleEvents,
    checkpointStoryEpisode,
    observeStoryWorkingEvidence,
    openStoryEpisode,
    replaceStoryWorkingCapsule,
    sealStoryEpisode,
} from '../../src/story/story-settlement.mjs';
import {
    createEpisodeEvaluationPrompt,
    createEpisodeEvaluationRequest,
    createEpisodeEvaluator,
    EPISODE_EVALUATION_PROPOSAL_KIND,
    parseEpisodeEvaluationProposal,
    validateEpisodeEvaluationRequest,
} from '../../src/story/episode-evaluator.mjs';

function contribution(suffix, index, role = 'assistant') {
    return {
        id: `contribution.${suffix}`,
        messageId: `message.${suffix}`,
        swipeId: role === 'assistant' ? `swipe.${index}` : null,
        role,
        textHash: (index + 1).toString(16).repeat(64),
        acceptedAtRevision: index + 1,
    };
}

function addSealedEpisode(settlement, suffix, summary, { hidden = false } = {}) {
    let next = openStoryEpisode(settlement, {
        episodeId: `episode.${suffix}`,
        sceneId: `scene.${suffix}`,
        references: { missionIds: ['mission.prelude'], locationIds: [`location.${suffix}`] },
    });
    const source = contribution(suffix, suffix.charCodeAt(0) % 15);
    next = acceptStoryContributions(next, [source]);
    next = appendStoryEffects(next, [{
        id: `effect.${suffix}.visible`,
        type: 'mission.eventOccurred',
        targetId: `event.${suffix}`,
        value: true,
        sourceContributionIds: [source.id],
        playerVisibility: 'visible',
        status: 'active',
    }, ...(hidden ? [{
        id: `effect.${suffix}.hidden`,
        type: 'mission.worldFactEstablished',
        targetId: `fact.${suffix}.hidden`,
        value: 'HIDDEN-SEALED-CANARY',
        sourceContributionIds: [source.id],
        playerVisibility: 'hidden',
        status: 'active',
    }] : [])]);
    return sealStoryEpisode(next, {
        boundaryReason: 'authored-scene-closure',
        summary,
    });
}

let settlement = createEmptyStorySettlement({ branchId: 'save.evaluator' });
settlement = addSealedEpisode(settlement, 'one', 'The command handover concluded.');
settlement = addSealedEpisode(settlement, 'two', 'The senior staff established delegation procedures.', { hidden: true });
settlement = addSealedEpisode(settlement, 'three', 'The ship began its integrated readiness review.');
settlement = openStoryEpisode(settlement, {
    episodeId: 'episode.active',
    sceneId: 'scene.active',
    references: {
        missionIds: ['mission.prelude'],
        questIds: [],
        participantIds: ['mara-whitaker'],
        locationIds: ['briefing-room'],
    },
});
const activeContributions = Array.from({ length: 7 }, (_, index) => contribution(
    `active-${index}`,
    index + 8,
    index % 2 === 0 ? 'assistant' : 'user',
));
settlement = acceptStoryContributions(settlement, activeContributions);
settlement = observeStoryWorkingEvidence(settlement, {
    branchId: settlement.branchId,
    observations: activeContributions.map((source, index) => ({
        contributionId: source.id,
        role: source.role,
        textHash: source.textHash,
        text: `Accepted scene evidence ${index}. ${'context '.repeat(42)}`,
    })),
});
settlement = appendStoryEffects(settlement, [{
    id: 'effect.active-visible',
    type: 'mission.decisionRecorded',
    targetId: 'outcome.readiness-review',
    value: 'corrective-commitment',
    sourceContributionIds: ['contribution.active-5'],
    playerVisibility: 'visible',
    status: 'active',
}, {
    id: 'effect.active-relationship',
    type: 'character.relationshipPosture',
    targetId: 'mara-whitaker',
    value: 'Watchful professional respect.',
    sourceContributionIds: ['contribution.active-3'],
    playerVisibility: 'visible',
    status: 'active',
}, {
    id: 'effect.active-hidden',
    type: 'mission.worldFactEstablished',
    targetId: 'fact.hidden-fraud',
    value: 'HIDDEN-ACTIVE-CANARY',
    sourceContributionIds: ['contribution.active-6'],
    playerVisibility: 'hidden',
    status: 'active',
}]);
settlement = appendStoryPeopleEvents(settlement, [{
    id: 'people.relationship.active-5',
    type: 'relationshipEvidence',
    personId: 'mara-whitaker',
    summary: 'Whitaker accepted the XO\'s candid correction and offered another chance.',
    sourceContributionIds: ['contribution.active-5'],
}]);
settlement = replaceStoryWorkingCapsule(settlement, {
    summary: 'Whitaker and the XO are reviewing readiness.',
    foregroundQuestion: 'Will the readiness concern be resolved before departure?',
    sourceContributionIds: ['contribution.active-1'],
    effectIds: ['effect.active-visible'],
});
settlement = checkpointStoryEpisode(settlement, { force: true });

const beforeRequest = structuredClone(settlement);
const request = createEpisodeEvaluationRequest({ settlement });
assert.deepEqual(validateEpisodeEvaluationRequest(request), { ok: true, errors: [] });
const shortHostHashRequest = structuredClone(request);
shortHostHashRequest.recentEvidence[0].textHash = 'abcdef12';
assert.deepEqual(
    validateEpisodeEvaluationRequest(shortHostHashRequest),
    { ok: true, errors: [] },
    'accepted host source frames use eight-character text hashes',
);
assert.deepEqual(settlement, beforeRequest, 'request projection is pure');
assert.equal(request.kind, 'directive.episodeEvaluationRequest.v1');
assert.deepEqual(request.envelope, {
    branchId: 'save.evaluator',
    episodeId: 'episode.active',
    baseRevision: settlement.revision,
    checkpointSequence: 1,
});
assert.deepEqual(request.pendingSourceContributionIds, activeContributions.map((item) => item.id));
assert.equal(request.recentEvidence.length, 5, 'the 1,200-character aggregate cap may be stricter than the six-row cap');
assert.ok(request.recentEvidence.length <= 6);
assert.ok(request.recentEvidence.reduce((total, item) => total + item.excerpt.length, 0) <= 1200);
assert.deepEqual(request.visibleEffects.map((item) => item.id), ['effect.active-visible', 'effect.active-relationship']);
assert.deepEqual(request.peopleEvents, [{
    id: 'people.relationship.active-5',
    type: 'relationshipEvidence',
    personId: 'mara-whitaker',
    summary: 'Whitaker accepted the XO\'s candid correction and offered another chance.',
    sourceContributionIds: ['contribution.active-5'],
}]);
assert.deepEqual(request.currentRelationships, [{
    personId: 'mara-whitaker',
    posture: 'Watchful professional respect.',
    openMatter: null,
}]);
assert.deepEqual(request.recentSealedSummaries.map((item) => item.episodeId), ['episode.two', 'episode.three']);
assert.deepEqual(request.references, {
    missionIds: ['mission.prelude'],
    questIds: [],
    participantIds: ['mara-whitaker'],
    locationIds: ['briefing-room'],
});
for (const forbidden of [
    'HIDDEN-SEALED-CANARY',
    'HIDDEN-ACTIVE-CANARY',
    'effect.active-hidden',
    'message.active',
    'swipe.',
    'rawTranscript',
    'evidenceQueue',
    'providerDiagnostic',
    'receipts',
]) {
    assert.equal(JSON.stringify(request).includes(forbidden), false, forbidden);
}

const proposalFor = (fields = {}) => ({
    kind: EPISODE_EVALUATION_PROPOSAL_KIND,
    ...request.envelope,
    decision: 'continue',
    boundaryReason: null,
    significanceCriteria: [],
    summary: 'The readiness review continues.',
    foregroundQuestion: 'Will the readiness concern be resolved before departure?',
    sourceContributionIds: ['contribution.active-5'],
    effectIds: ['effect.active-visible'],
    relationshipUpdates: [],
    characterMoments: [],
    ...fields,
});

const validContinue = parseEpisodeEvaluationProposal(proposalFor(), { request });
assert.equal(validContinue.ok, true);
assert.equal(validContinue.value.decision, 'continue');
const validRelationshipUpdate = parseEpisodeEvaluationProposal(proposalFor({
    relationshipUpdates: [{
        personId: 'mara-whitaker',
        posture: 'Cautious professional trust is growing.',
        openMatter: 'Whether the XO will follow through before departure.',
        sourceContributionIds: ['contribution.active-5'],
    }],
}), { request });
assert.equal(validRelationshipUpdate.ok, true);
const validSeal = parseEpisodeEvaluationProposal(proposalFor({
    decision: 'seal',
    boundaryReason: 'foreground-question-resolved',
    significanceCriteria: ['material-state-change', 'commitment-created-or-resolved'],
    summary: 'The readiness review concluded with a recorded corrective commitment.',
    foregroundQuestion: null,
    relationshipUpdates: [{
        personId: 'mara-whitaker',
        posture: 'Whitaker now extends measured professional trust.',
        openMatter: null,
        sourceContributionIds: ['contribution.active-5'],
    }],
    characterMoments: [{
        personId: 'mara-whitaker',
        title: 'A measured second chance',
        summary: 'Whitaker accepted the XO\'s candid correction and extended a measured second chance.',
        sourceContributionIds: ['contribution.active-5'],
    }],
}), { request });
assert.equal(validSeal.ok, true);
const laterCheckpointRequest = {
    ...structuredClone(request),
    pendingSourceContributionIds: ['contribution.active-5'],
};
assert.deepEqual(validateEpisodeEvaluationRequest(laterCheckpointRequest), { ok: true, errors: [] });
const staleHistorySeal = parseEpisodeEvaluationProposal(proposalFor({
    decision: 'seal',
    boundaryReason: 'foreground-question-resolved',
    significanceCriteria: ['commitment-created-or-resolved'],
    summary: 'The older handover discussion is reinterpreted as complete.',
    foregroundQuestion: null,
    sourceContributionIds: ['contribution.active-1'],
    effectIds: [],
}), { request: laterCheckpointRequest });
assert.equal(staleHistorySeal.ok, false);
assert.match(staleHistorySeal.errors.join('\n'), /pending checkpoint/i);
const validAbstain = parseEpisodeEvaluationProposal(proposalFor({
    decision: 'abstain',
    summary: null,
    foregroundQuestion: null,
    sourceContributionIds: [],
    effectIds: [],
}), { request });
assert.equal(validAbstain.ok, true);

for (const [label, value, pattern] of [
    ['unknown source', proposalFor({ sourceContributionIds: ['contribution.missing'] }), /unknown source/i],
    ['unknown effect', proposalFor({ effectIds: ['effect.missing'] }), /unknown effect/i],
    ['unknown relationship person', proposalFor({ relationshipUpdates: [{
        personId: 'person.missing', posture: 'Trusting.', openMatter: null,
        sourceContributionIds: ['contribution.active-5'],
    }] }), /unknown person/i],
    ['uncited relationship update', proposalFor({ relationshipUpdates: [{
        personId: 'mara-whitaker', posture: 'Trusting.', openMatter: null, sourceContributionIds: [],
    }] }), /relationship.*source/i],
    ['moment on continue', proposalFor({ characterMoments: [{
        personId: 'mara-whitaker', title: 'Too soon', summary: 'This is not sealed.',
        sourceContributionIds: ['contribution.active-5'],
    }] }), /moment.*seal/i],
    ['uncited summary', proposalFor({ sourceContributionIds: [] }), /source/i],
    ['unsupported criterion', proposalFor({
        decision: 'seal',
        boundaryReason: 'foreground-question-resolved',
        significanceCriteria: ['interesting-vibes'],
        foregroundQuestion: null,
    }), /significance/i],
    ['unsupported boundary', proposalFor({
        decision: 'seal',
        boundaryReason: 'topic-changed',
        significanceCriteria: ['material-state-change'],
        foregroundQuestion: null,
    }), /boundary/i],
    ['arbitrary rationale', { ...proposalFor(), rationale: 'Trust me.' }, /unknown field/i],
    ['over-budget summary', proposalFor({ summary: 'x'.repeat(769) }), /summary/i],
    ['whitespace seal summary', proposalFor({
        decision: 'seal',
        boundaryReason: 'foreground-question-resolved',
        significanceCriteria: ['material-state-change'],
        summary: '   ',
        foregroundQuestion: null,
    }), /summary/i],
    ['duplicate refs', proposalFor({ sourceContributionIds: ['contribution.active-5', 'contribution.active-5'] }), /unique/i],
    ['seal without significance', proposalFor({
        decision: 'seal',
        boundaryReason: 'foreground-question-resolved',
        significanceCriteria: [],
        foregroundQuestion: null,
    }), /significance/i],
    ['seal without boundary', proposalFor({
        decision: 'seal',
        boundaryReason: null,
        significanceCriteria: ['material-state-change'],
        foregroundQuestion: null,
    }), /boundary/i],
    ['stale revision', proposalFor({ baseRevision: request.envelope.baseRevision - 1 }), /baseRevision/i],
]) {
    const parsed = parseEpisodeEvaluationProposal(value, { request });
    assert.equal(parsed.ok, false, label);
    assert.match(parsed.errors.join('\n'), pattern, label);
}
assert.equal(parseEpisodeEvaluationProposal(`\`\`\`json\n${JSON.stringify(proposalFor())}\n\`\`\``, { request }).ok, false);

const fixture = JSON.parse(fs.readFileSync('tests/fixtures/story/v1/episode-evaluator-borrowed-behavior.fixture.json', 'utf8'));
assert.deepEqual(fixture.pinnedSources, {
    summaryception: { version: '5.5.3', revision: 'c67626ab83ee86ec1be4f55b9b3d1d19adb79999' },
    vectfox: { version: '3.6.8', revision: '886a0144ff8608aabcef4fe1b408a13260c1a730' },
    charMemory: { version: '2.3.1', revision: '37b21025e120acfbe1dcdeaa8becb05efe7188b4' },
});
for (const scenario of fixture.cases) {
    const parsed = parseEpisodeEvaluationProposal(proposalFor(scenario.proposal), { request });
    assert.equal(parsed.ok, true, `${scenario.id}: ${parsed.errors?.join('; ')}`);
}
const repeated = fixture.cases.find((item) => item.id === 'repeat-prior-memory').proposal.summary;
assert.equal(repeated, request.workingCapsule.summary);
assert.equal(repeated.includes(`${request.workingCapsule.summary} ${request.workingCapsule.summary}`), false);
assert.equal(fixture.cases.find((item) => item.id === 'routine-light-flicker').proposal.decision, 'abstain');
assert.equal(fixture.cases.find((item) => item.id === 'continuous-encounter').proposal.decision, 'continue');
assert.equal(fixture.cases.find((item) => item.id === 'resolved-lasting-encounter').proposal.decision, 'seal');
assert.equal(fixture.cases.find((item) => item.id === 'no-lasting-development').proposal.summary, '');

const prompt = createEpisodeEvaluationPrompt({ request });
assert.match(prompt.systemPrompt, /retain only new narrative understanding/i);
assert.match(prompt.systemPrompt, /lasting significance/i);
assert.match(prompt.systemPrompt, /no memory/i);
assert.match(prompt.systemPrompt, /relationship posture/i);
assert.match(prompt.systemPrompt, /defining moment/i);
assert.match(prompt.systemPrompt, /one.*person.*sealed episode/i);
assert.match(prompt.systemPrompt, /never use topic, keyword, speaker, sentiment, token count, or elapsed time/i);
assert.equal(prompt.metadata.roleId, 'episodeEvaluator');
assert.equal(prompt.kind, 'directive.episodeEvaluationRequest.v1');
assert.equal(prompt.jsonSchema.additionalProperties, false);
assert.equal(prompt.jsonSchema.properties.kind.const, 'directive.episodeEvaluationProposal.v1');
assert.equal(prompt.jsonSchema.properties.branchId.const, request.envelope.branchId);
assert.equal(prompt.jsonSchema.properties.episodeId.const, request.envelope.episodeId);
assert.deepEqual(prompt.jsonSchema.properties.decision.enum, ['continue', 'seal', 'abstain']);
for (const forbidden of ['HIDDEN-ACTIVE-CANARY', 'rawTranscript', 'providerDiagnostic']) {
    assert.equal(JSON.stringify(prompt).includes(forbidden), false, forbidden);
}
const contaminatedRequest = { ...request, rawTranscript: 'HIDDEN-REQUEST-CANARY' };
assert.match(validateEpisodeEvaluationRequest(contaminatedRequest).errors.join('\n'), /unknown field: rawTranscript/);
assert.throws(() => createEpisodeEvaluationPrompt({ request: contaminatedRequest }), /rawTranscript/);
assert.match(
    parseEpisodeEvaluationProposal(proposalFor(), { request: contaminatedRequest }).errors.join('\n'),
    /invalid request.*rawTranscript/i,
);

let contaminatedProviderCalled = false;
const contaminatedEvaluator = createEpisodeEvaluator({
    generationRouter: {
        async generate() {
            contaminatedProviderCalled = true;
            return { ok: true, response: { text: '{}' } };
        },
    },
});
const contaminatedResult = await contaminatedEvaluator({ request: contaminatedRequest });
assert.equal(contaminatedResult.reasonCode, 'invalid-request');
assert.equal(contaminatedProviderCalled, false);
assert.equal(JSON.stringify(contaminatedResult).includes('HIDDEN-REQUEST-CANARY'), false);

let invocation = null;
const evaluator = createEpisodeEvaluator({
    generationRouter: {
        async generate(roleId, providerRequest, options) {
            invocation = { roleId, providerRequest, options };
            return {
                ok: true,
                response: { text: JSON.stringify(proposalFor()) },
                diagnostics: { providerId: 'provider.safe', latencyMs: 12 },
            };
        },
    },
    timeoutMs: 50,
});
const evaluated = await evaluator({ request });
assert.equal(evaluated.ok, true);
assert.equal(evaluated.proposal.decision, 'continue');
assert.equal(invocation.roleId, 'episodeEvaluator');
assert.equal(invocation.options.timeoutMs, 50);
assert.equal(invocation.options.allowVisibleOutputRetry, false);
assert.ok(invocation.options.signal instanceof AbortSignal);
assert.deepEqual(settlement, beforeRequest, 'evaluation never mutates settlement state');

let cappedTimeout = null;
const cappedEvaluator = createEpisodeEvaluator({
    generationRouter: {
        async generate(_roleId, _providerRequest, options) {
            cappedTimeout = options.timeoutMs;
            return { ok: true, response: { text: JSON.stringify(proposalFor()) } };
        },
    },
    timeoutMs: 99999,
});
assert.equal((await cappedEvaluator({ request })).ok, true);
assert.equal(cappedTimeout, 10000);

let timeoutSignal = null;
const timeoutEvaluator = createEpisodeEvaluator({
    generationRouter: {
        generate(_roleId, _request, options) {
            timeoutSignal = options.signal;
            return new Promise(() => {});
        },
    },
    timeoutMs: 5,
});
const timedOut = await timeoutEvaluator({ request });
assert.deepEqual(timedOut, {
    ok: false,
    status: 'unavailable',
    reasonCode: 'provider-timeout',
    diagnostics: { timeoutMs: 5 },
});
assert.equal(timeoutSignal?.aborted, true);

let externalSignal = null;
const externallyCanceledEvaluator = createEpisodeEvaluator({
    generationRouter: {
        generate(_roleId, _request, options) {
            externalSignal = options.signal;
            return new Promise(() => {});
        },
    },
    timeoutMs: 500,
});
const externalController = new AbortController();
const externalPending = externallyCanceledEvaluator({ request, signal: externalController.signal });
externalController.abort();
assert.deepEqual(await externalPending, {
    ok: false,
    status: 'unavailable',
    reasonCode: 'provider-aborted',
    diagnostics: {},
});
assert.equal(externalSignal?.aborted, true);

const thrownEvaluator = createEpisodeEvaluator({
    generationRouter: { generate: async () => { throw new Error('SECRET-PROVIDER-FAILURE'); } },
    timeoutMs: 50,
});
const thrown = await thrownEvaluator({ request });
assert.equal(thrown.ok, false);
assert.equal(thrown.reasonCode, 'provider-threw');
assert.equal(JSON.stringify(thrown).includes('SECRET-PROVIDER-FAILURE'), false);

console.log('V1 episode evaluator tests passed.');
