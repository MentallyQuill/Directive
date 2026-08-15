import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createInitialMissionJourney } from '../../src/mission/v1/mission-journey.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { createV1MissionRuntime } from '../../src/runtime/v1-mission-runtime.mjs';
import {
    createPendingEpisodeReviewToken,
    createV1StateSpine,
} from '../../src/runtime/v1-state-spine.mjs';
import { createEpisodeEvaluationRequest } from '../../src/story/episode-evaluator.mjs';
import { createEmptyStorySettlement } from '../../src/story/story-settlement-contracts.mjs';
import {
    acceptStoryContributions,
    appendStoryEffects,
    appendStoryPeopleEvents,
    checkpointStoryEpisode,
    observeStoryWorkingEvidence,
    openStoryEpisode,
} from '../../src/story/story-settlement.mjs';
import { createAshesInitialState, loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

const definition = JSON.parse(fs.readFileSync(
    'packages/bundled/breckenridge/v1/prelude-a-ship-underway.mission-v1.json',
    'utf8',
));
const runtimeAssets = {
    ...loadAshesRuntimeAssets(),
    missionDefinitions: [{ path: 'prelude.mission-v1.json', definition }],
    missionDefinitionsById: new Map([[definition.id, { path: 'prelude.mission-v1.json', definition }]]),
};

function createActiveCampaignState() {
    const branchId = 'save.soft-review';
    let storySettlement = createEmptyStorySettlement({ branchId });
    storySettlement = openStoryEpisode(storySettlement, {
        episodeId: 'episode.soft-review',
        sceneId: 'scene.soft-review',
        references: {
            missionIds: [definition.id],
            participantIds: ['mara-whitaker'],
            locationIds: ['briefing-room'],
        },
    });
    const contributions = Array.from({ length: 4 }, (_, index) => ({
        id: `contribution.soft-${index}`,
        messageId: `message.soft-${index}`,
        swipeId: index % 2 === 0 ? `swipe.${index}` : null,
        role: index % 2 === 0 ? 'assistant' : 'user',
        textHash: (index + 1).toString(16).repeat(64),
        acceptedAtRevision: index + 1,
    }));
    storySettlement = acceptStoryContributions(storySettlement, contributions);
    storySettlement = observeStoryWorkingEvidence(storySettlement, {
        branchId,
        observations: contributions.map((source, index) => ({
            contributionId: source.id,
            role: source.role,
            textHash: source.textHash,
            text: `Accepted readiness-review evidence ${index}.`,
        })),
    });
    storySettlement = appendStoryEffects(storySettlement, [{
        id: 'effect.soft-visible',
        type: 'mission.decisionRecorded',
        targetId: 'outcome.readiness-review',
        value: 'corrective-commitment',
        sourceContributionIds: ['contribution.soft-2'],
        playerVisibility: 'visible',
        status: 'active',
    }]);
    storySettlement = appendStoryPeopleEvents(storySettlement, [{
        id: 'people.relationship.soft-2',
        type: 'relationshipEvidence',
        personId: 'mara-whitaker',
        summary: 'Whitaker accepted a candid correction and left the XO a measured path forward.',
        sourceContributionIds: ['contribution.soft-2'],
    }]);
    storySettlement = checkpointStoryEpisode(storySettlement, { force: true });
    const state = createAshesInitialState({
        campaignId: 'campaign.ashes',
        saveId: branchId,
        chatId: 'chat.soft-review',
    });
    const journey = createInitialMissionJourney({ branchId, definition });
    state.mission = {
            activeMissionId: definition.packageBinding.sourceId,
            v1: createMissionState({ definition, branchId }),
            v1Journey: journey.journey,
            v1History: journey.history,
    };
    state.storySettlement = storySettlement;
    state.commandBearing.balance = 3;
    return state;
}

function proposalFor(request, decision = 'continue') {
    const shared = {
        kind: 'directive.episodeEvaluationProposal.v1',
        ...request.envelope,
        decision,
        boundaryReason: null,
        significanceCriteria: [],
        summary: 'Whitaker and the XO continue the readiness review with a corrective commitment recorded.',
        foregroundQuestion: 'Will the corrective commitment be completed before departure?',
        sourceContributionIds: ['contribution.soft-2', 'contribution.soft-3'],
        effectIds: ['effect.soft-visible'],
        relationshipUpdates: [{
            personId: 'mara-whitaker',
            posture: 'Measured professional trust.',
            openMatter: 'Whether the XO completes the corrective commitment.',
            sourceContributionIds: ['contribution.soft-2'],
        }],
        characterMoments: [],
    };
    if (decision === 'seal') {
        return {
            ...shared,
            boundaryReason: 'foreground-question-resolved',
            significanceCriteria: ['material-state-change', 'commitment-created-or-resolved'],
            summary: 'The readiness review concluded with a recorded corrective commitment.',
            foregroundQuestion: null,
            characterMoments: [{
                personId: 'mara-whitaker',
                title: 'A measured path forward',
                summary: 'Whitaker accepted the candid correction and left the XO a measured path forward.',
                sourceContributionIds: ['contribution.soft-2'],
            }],
        };
    }
    if (decision === 'abstain') {
        return {
            ...shared,
            boundaryReason: null,
            significanceCriteria: [],
            summary: null,
            foregroundQuestion: null,
            sourceContributionIds: [],
            effectIds: [],
            relationshipUpdates: [],
            characterMoments: [],
        };
    }
    return shared;
}

function createHarness({
    state = createActiveCampaignState(),
    evaluator = null,
    persistError = null,
    persistConflict = false,
} = {}) {
    let campaignState = structuredClone(state);
    let persistCount = 0;
    const persistDescriptors = [];
    let evaluationCount = 0;
    const gateway = createStateDeltaGateway({
        getState: () => campaignState,
        setState: (next) => { campaignState = next; },
        persist: async (_next, descriptor) => {
            persistCount += 1;
            persistDescriptors.push(structuredClone(descriptor));
            if (persistConflict) {
                campaignState = {
                    ...structuredClone(campaignState),
                    commandBearing: { ...campaignState.commandBearing, balance: 2 },
                };
            }
            if (persistError) throw persistError;
        },
        now: () => '2026-08-09T16:00:00.000Z',
    });
    const evaluateEpisode = async ({ request }) => {
        evaluationCount += 1;
        return evaluator
            ? evaluator({ request, gateway, getState: () => campaignState })
            : { ok: true, status: 'continue', proposal: proposalFor(request, 'continue'), diagnostics: {} };
    };
    const runtime = createV1MissionRuntime({
        getState: () => campaignState,
        stateDeltaGateway: gateway,
        evaluateEpisode,
        now: () => '2026-08-09T16:00:00.000Z',
    });
    return {
        gateway,
        runtime,
        get campaignState() { return campaignState; },
        get persistCount() { return persistCount; },
        get persistDescriptors() { return structuredClone(persistDescriptors); },
        get evaluationCount() { return evaluationCount; },
    };
}

const continueHarness = createHarness();
const continueBefore = structuredClone(continueHarness.campaignState);
const continueToken = createPendingEpisodeReviewToken(continueHarness.campaignState.storySettlement);
const continueRequest = createEpisodeEvaluationRequest({ settlement: continueHarness.campaignState.storySettlement });
const continueProposal = proposalFor(continueRequest, 'continue');
assert.deepEqual(continueHarness.runtime.pendingEpisodeReview(), continueToken);
const continueProjectionBefore = continueHarness.runtime.buildPlayerProjection({ runtimeAssets });
assert.equal(continueProjectionBefore.ok, true);
assert.equal(continueHarness.evaluationCount, 0, 'ordinary projection never invokes episode evaluation');
const continued = await continueHarness.runtime.reviewPendingEpisode({ runtimeAssets });
assert.equal(continued.ok, true);
assert.equal(continued.status, 'continued');
assert.deepEqual(continued.committedRoots, ['storySettlement']);
assert.equal(continued.reviewToken, null);
assert.equal(continueHarness.persistCount, 3);
assert.deepEqual(
    continueHarness.persistDescriptors.map((descriptor) => descriptor.source),
    ['v1EpisodeReviewAttempt', 'v1EpisodeReviewAuthority', 'v1EpisodeReviewAttempt'],
);
assert.doesNotMatch(continueHarness.persistDescriptors[1].source, /shadow/i);
assert.equal(continueHarness.evaluationCount, 1);
const continuedEpisode = continueHarness.campaignState.storySettlement.episodes[0];
assert.equal(continuedEpisode.status, 'open');
assert.equal(continuedEpisode.workingCapsule.summary, continueProposal.summary);
assert.equal(continuedEpisode.workingCapsule.foregroundQuestion, continueProposal.foregroundQuestion);
assert.deepEqual(continuedEpisode.workingCapsule.sourceContributionIds, continueProposal.sourceContributionIds);
assert.deepEqual(continuedEpisode.workingCapsule.effectIds, continueProposal.effectIds);
assert.deepEqual(continuedEpisode.workingCapsule.recentEvidence, []);
assert.equal(continuedEpisode.workingCapsule.observedContributionCount, continuedEpisode.contributions.length);
assert.equal(continuedEpisode.workingCapsule.lastEvaluatedCheckpointSequence, 1);
assert.equal(continuedEpisode.workingCapsule.needsReview, false);
assert.equal(continueHarness.campaignState.storySettlement.episodeReviewAttempt.status, 'committed');
assert.deepEqual(
    continueHarness.runtime.buildPlayerProjection({ runtimeAssets }).projection.mission,
    continueProjectionBefore.projection.mission,
    'episode review must not change the Mission page projection',
);
assert.deepEqual(
    continuedEpisode.effects
        .filter((effect) => effect.targetId === 'mara-whitaker')
        .map((effect) => ({ type: effect.type, value: effect.value, sources: effect.sourceContributionIds })),
    [{
        type: 'character.relationshipPosture',
        value: 'Measured professional trust.',
        sources: ['contribution.soft-2'],
    }, {
        type: 'character.relationshipOpenMatter',
        value: 'Whether the XO completes the corrective commitment.',
        sources: ['contribution.soft-2'],
    }],
);
assert.deepEqual(continueHarness.campaignState.mission, continueBefore.mission);
for (const root of ['ship', 'commandBearing']) {
    assert.deepEqual(continueHarness.campaignState[root], continueBefore[root], `${root} is outside soft review authority`);
}

const replaySpine = createV1StateSpine({
    getState: () => continueHarness.campaignState,
    stateDeltaGateway: continueHarness.gateway,
    resolveSourceRef: () => null,
});
const replayedContinue = await replaySpine.applyEpisodeReview({
    definition,
    reviewToken: continueToken,
    request: continueRequest,
    proposal: continueProposal,
    gatewayBaseRevision: continueHarness.gateway.revision(),
});
assert.equal(replayedContinue.noChange, true);
assert.equal(continueHarness.persistCount, 3, 'replaying an applied continue proposal is idempotent');

const sealHarness = createHarness({
    evaluator: ({ request }) => ({
        ok: true,
        status: 'seal',
        proposal: proposalFor(request, 'seal'),
        diagnostics: {},
    }),
});
const sealToken = sealHarness.runtime.pendingEpisodeReview();
const sealRequest = createEpisodeEvaluationRequest({ settlement: sealHarness.campaignState.storySettlement });
const sealProposal = proposalFor(sealRequest, 'seal');
const sealed = await sealHarness.runtime.reviewPendingEpisode({ runtimeAssets });
assert.equal(sealed.ok, true);
assert.equal(sealed.status, 'sealed');
assert.deepEqual(sealed.committedRoots, ['storySettlement']);
assert.equal(sealed.reviewToken, null);
assert.equal(sealHarness.campaignState.storySettlement.activeEpisode, null);
const sealedEpisode = sealHarness.campaignState.storySettlement.episodes[0];
assert.equal(sealedEpisode.status, 'sealed');
assert.equal(sealedEpisode.boundaryReason, 'foreground-question-resolved');
assert.equal(sealedEpisode.summary, sealProposal.summary);
assert.equal(sealedEpisode.characterMoments.length, 1);
assert.deepEqual(
    {
        characterId: sealedEpisode.characterMoments[0].characterId,
        title: sealedEpisode.characterMoments[0].title,
        summary: sealedEpisode.characterMoments[0].summary,
        sources: sealedEpisode.characterMoments[0].sourceContributionIds,
    },
    {
        characterId: 'mara-whitaker',
        title: 'A measured path forward',
        summary: 'Whitaker accepted the candid correction and left the XO a measured path forward.',
        sources: ['contribution.soft-2'],
    },
);
assert.equal(Object.hasOwn(sealedEpisode, 'workingCapsule'), false);
assert.deepEqual(sealedEpisode.softBoundary, {
    kind: 'directive.episodeSoftBoundary.v1',
    reason: 'foreground-question-resolved',
    significanceCriteria: ['material-state-change', 'commitment-created-or-resolved'],
    sourceContributionIds: ['contribution.soft-2', 'contribution.soft-3'],
    effectIds: ['effect.soft-visible'],
    checkpointSequence: 1,
});
assert.equal(sealHarness.campaignState.storySettlement.receipts.length, 1);
assert.equal(sealHarness.campaignState.storySettlement.episodeReviewAttempt.status, 'committed');

const sealReplaySpine = createV1StateSpine({
    getState: () => sealHarness.campaignState,
    stateDeltaGateway: sealHarness.gateway,
    resolveSourceRef: () => null,
});
const replayedSeal = await sealReplaySpine.applyEpisodeReview({
    definition,
    reviewToken: sealToken,
    request: sealRequest,
    proposal: sealProposal,
    gatewayBaseRevision: sealHarness.gateway.revision(),
});
assert.equal(replayedSeal.noChange, true);
assert.equal(sealHarness.persistCount, 3, 'replaying an applied seal proposal is idempotent');

const abstainHarness = createHarness({
    evaluator: ({ request }) => ({
        ok: true,
        status: 'abstain',
        proposal: proposalFor(request, 'abstain'),
        diagnostics: {},
    }),
});
const abstainToken = abstainHarness.runtime.pendingEpisodeReview();
const abstained = await abstainHarness.runtime.reviewPendingEpisode({ runtimeAssets });
assert.equal(abstained.ok, true);
assert.equal(abstained.status, 'abstained');
assert.equal(abstained.noChange, false);
assert.equal(abstained.reviewToken.checkpointSequence, abstainToken.checkpointSequence);
assert.equal(abstainHarness.campaignState.storySettlement.episodeReviewAttempt.status, 'committed');
assert.equal(abstainHarness.persistCount, 2);

const failedHarness = createHarness({
    evaluator: async () => ({
        ok: false,
        status: 'unavailable',
        reasonCode: 'provider-timeout',
        diagnostics: { timeoutMs: 5, rawError: 'SECRET-ERROR' },
    }),
});
const failedToken = failedHarness.runtime.pendingEpisodeReview();
const failed = await failedHarness.runtime.reviewPendingEpisode({ runtimeAssets, automatic: true });
assert.equal(failed.ok, false);
assert.equal(failed.reasonCode, 'provider-timeout');
assert.equal(failed.reviewToken.checkpointSequence, failedToken.checkpointSequence);
assert.equal(failedHarness.campaignState.storySettlement.episodeReviewAttempt.status, 'failed');
assert.equal(failedHarness.campaignState.storySettlement.episodeReviewAttempt.automaticAttemptCount, 1);
const suppressedAutomaticRetry = await failedHarness.runtime.reviewPendingEpisode({ runtimeAssets, automatic: true });
assert.equal(suppressedAutomaticRetry.status, 'automatic-attempt-exhausted');
assert.equal(failedHarness.evaluationCount, 1);
const manualFailedRetry = await failedHarness.runtime.reviewPendingEpisode({ runtimeAssets, automatic: false });
assert.equal(manualFailedRetry.reasonCode, 'provider-timeout');
assert.equal(failedHarness.evaluationCount, 2);
assert.equal(failedHarness.campaignState.storySettlement.episodeReviewAttempt.automaticAttemptCount, 1);
assert.equal(JSON.stringify(failed).includes('SECRET-ERROR'), false);

const conflictHarness = createHarness({
    evaluator: async ({ request, gateway }) => {
        await gateway.applyProposal({
            patch: { commandBearing: { balance: 2 } },
            domains: ['commandBearing'],
            baseRevision: gateway.revision(),
            source: 'test.concurrent-change',
            reason: 'Simulate concurrent state change.',
        });
        return { ok: true, status: 'continue', proposal: proposalFor(request, 'continue'), diagnostics: {} };
    },
});
const conflict = await conflictHarness.runtime.reviewPendingEpisode({ runtimeAssets });
assert.equal(conflict.ok, false);
assert.equal(conflict.reasonCode, 'state-revision-conflict');
assert.equal(conflictHarness.campaignState.storySettlement.activeEpisode, 'episode.soft-review');
assert.notEqual(conflictHarness.runtime.pendingEpisodeReview(), null);
assert.equal(conflictHarness.persistCount, 3, 'attempt custody brackets the simulated concurrent change');

const staleHarness = createHarness();
const staleToken = staleHarness.runtime.pendingEpisodeReview();
const staleRequest = createEpisodeEvaluationRequest({ settlement: staleHarness.campaignState.storySettlement });
const staleProposal = proposalFor(staleRequest, 'continue');
const staleSpine = createV1StateSpine({
    getState: () => staleHarness.campaignState,
    stateDeltaGateway: staleHarness.gateway,
    resolveSourceRef: () => null,
});
await staleSpine.invalidateSources({
    definition,
    branchId: 'save.soft-review',
    contributionIds: ['contribution.soft-2'],
    gatewayBaseRevision: staleHarness.gateway.revision(),
    reason: 'selected-swipe-changed',
});
await assert.rejects(
    () => staleSpine.applyEpisodeReview({
        definition,
        reviewToken: staleToken,
        request: staleRequest,
        proposal: staleProposal,
        gatewayBaseRevision: staleHarness.gateway.revision(),
    }),
    (error) => error.code === 'DIRECTIVE_EPISODE_REVIEW_STALE',
);
assert.equal(staleHarness.campaignState.storySettlement.activeEpisode, 'episode.soft-review');
assert.notEqual(staleHarness.runtime.pendingEpisodeReview(), null);
assert.equal(staleHarness.persistCount, 1);

const restartedState = JSON.parse(JSON.stringify(createActiveCampaignState()));
const restartHarness = createHarness({ state: restartedState });
assert.notEqual(restartHarness.runtime.pendingEpisodeReview(), null);
const restarted = await restartHarness.runtime.reviewPendingEpisode({ runtimeAssets });
assert.equal(restarted.status, 'continued');
assert.equal(restartHarness.campaignState.storySettlement.episodes[0].workingCapsule.lastEvaluatedCheckpointSequence, 1);

const noPending = await continueHarness.runtime.reviewPendingEpisode({ runtimeAssets });
assert.equal(noPending.ok, true);
assert.equal(noPending.status, 'no-pending-review');
assert.equal(noPending.noChange, true);
assert.equal(continueHarness.evaluationCount, 1, 'no pending checkpoint means no provider invocation');

for (const [label, mutate, expectedReason] of [
    ['mission branch', (state) => { state.mission.v1.branchId = 'save.wrong'; }, 'mission-branch-mismatch'],
    ['story branch', (state) => { state.storySettlement.branchId = 'save.wrong'; }, 'story-branch-mismatch'],
    ['active package', (state) => { state.activeCampaignPackage.packageVersion = '999.0.0'; }, 'active-package-mismatch'],
]) {
    const state = createActiveCampaignState();
    mutate(state);
    const harness = createHarness({ state });
    const result = await harness.runtime.reviewPendingEpisode({ runtimeAssets });
    assert.equal(result.ok, false, label);
    assert.equal(result.reasonCode, expectedReason, label);
    assert.equal(harness.evaluationCount, 0, `${label} drift must fail before exposing excerpts to the evaluator`);
    assert.equal(harness.persistCount, 0, label);
}

const persistenceState = createActiveCampaignState();
const persistenceBefore = structuredClone(persistenceState);
const persistenceHarness = createHarness({
    state: persistenceState,
    persistError: new Error('SECRET-PERSISTENCE-FAILURE'),
});
const persistenceToken = persistenceHarness.runtime.pendingEpisodeReview();
const persistenceFailure = await persistenceHarness.runtime.reviewPendingEpisode({ runtimeAssets });
assert.equal(persistenceFailure.ok, false);
assert.equal(persistenceFailure.reasonCode, 'persistence-failed');
assert.deepEqual(persistenceFailure.reviewToken, persistenceToken);
assert.deepEqual(persistenceHarness.campaignState, persistenceBefore, 'rejected persistence must restore in-memory state');
assert.equal(persistenceHarness.persistCount, 1);
assert.equal(JSON.stringify(persistenceFailure).includes('SECRET-PERSISTENCE-FAILURE'), false);

const indeterminateHarness = createHarness({
    persistConflict: true,
    persistError: new Error('SECRET-CONCURRENT-PERSISTENCE-FAILURE'),
});
const indeterminate = await indeterminateHarness.runtime.reviewPendingEpisode({ runtimeAssets });
assert.equal(indeterminate.ok, false);
assert.equal(indeterminate.status, 'indeterminate');
assert.equal(indeterminate.reasonCode, 'persistence-rollback-conflict');
assert.equal(indeterminate.noChange, false);
assert.deepEqual(indeterminate.committedRoots, ['storySettlement']);
assert.equal(indeterminate.requiresOperatorReview, true);
assert.equal(indeterminate.retrySafe, false);
assert.notEqual(indeterminate.reviewToken, null);
assert.equal(indeterminateHarness.campaignState.storySettlement.episodes[0].workingCapsule.lastEvaluatedCheckpointSequence, 0);
assert.equal(indeterminateHarness.campaignState.storySettlement.episodeReviewAttempt.status, 'pending');
assert.equal(indeterminateHarness.evaluationCount, 0);
assert.equal(indeterminateHarness.campaignState.commandBearing.balance, 2);
assert.equal(JSON.stringify(indeterminate).includes('SECRET-CONCURRENT-PERSISTENCE-FAILURE'), false);

console.log('V1 soft-boundary runtime tests passed.');
