import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createInitialMissionJourney } from '../../src/mission/v1/mission-journey.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import {
    createPendingEpisodeReviewToken,
    createV1StateSpine,
} from '../../src/runtime/v1-state-spine.mjs';
import { createEpisodeHardBoundary } from '../../src/story/episode-boundary.mjs';
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
import { createAshesInitialState } from './v1-test-fixtures.mjs';

const NOW = '2026-08-09T16:00:00.000Z';

async function assertPreparationIsPure({ prepare, input, getState, getCommits }) {
    const before = structuredClone(getState());
    const calls = getCommits();
    const prepared = await prepare(input);
    assert.deepEqual(getState(), before);
    assert.equal(getCommits(), calls);
    assert.equal(prepared.candidateState.stateCustody.revision, before.stateCustody.revision);
    return prepared;
}

function createGatewayHarness(state) {
    let campaignState = structuredClone(state);
    let commits = 0;
    const gateway = createStateDeltaGateway({
        getState: () => campaignState,
        setState: (next) => { campaignState = next; },
        persist: async () => {},
    });
    const countingGateway = {
        revision: () => gateway.revision(),
        applyProposal: async (proposal) => {
            commits += 1;
            return gateway.applyProposal(proposal);
        },
    };
    return {
        gateway: countingGateway,
        getState: () => campaignState,
        getCommits: () => commits,
    };
}

function createSettlementFixture() {
    const definition = JSON.parse(fs.readFileSync(
        'tests/fixtures/mission/v1/v1-hesperus-reference.fixture.json',
        'utf8',
    ));
    const objective = definition.objectives.find(({ id }) => id === 'objective.hesperus-accountability');
    objective.class = 'optional';
    objective.activatedAs = null;
    objective.activationWhen = true;
    objective.availableWhen = true;
    objective.visibleWhen = true;
    objective.progressWhen = { eventOccurred: 'event.hesperus-survivors-transferred' };
    objective.terminalWhen = [{
        disposition: 'completed',
        when: { eventOccurred: 'event.hesperus-survivors-transferred' },
    }];
    objective.playerText.terminal = [{
        disposition: 'completed',
        text: 'The accountability implications were addressed.',
    }];

    const branchId = 'save.alpha';
    const state = createAshesInitialState({
        campaignId: 'campaign.ashes',
        saveId: branchId,
        chatId: 'chat.alpha',
    });
    const journey = createInitialMissionJourney({ definition, branchId });
    state.mission = {
        activeMissionId: definition.packageBinding.sourceId,
        v1: createMissionState({ definition, branchId }),
        v1Journey: journey.journey,
        v1History: journey.history,
    };
    const source = {
        contributionId: 'contribution.hesperus-rescue',
        messageId: 'message.assistant-rescue',
        branchId,
        accepted: true,
        selectedSwipeId: 'swipe.1',
        textHash: 'a'.repeat(64),
        role: 'assistant',
        acceptedAtRevision: 0,
    };
    const sourceContribution = {
        id: source.contributionId,
        messageId: source.messageId,
        swipeId: source.selectedSwipeId,
        role: source.role,
        textHash: source.textHash,
        acceptedAtRevision: source.acceptedAtRevision,
    };
    const input = {
        definition,
        missionDefinitions: [definition],
        proposal: {
            kind: 'directive.missionEvidenceProposal.v1',
            branchId,
            missionId: definition.id,
            baseRevision: 0,
            claims: [{
                claimId: 'claim.survivors-transferred',
                policyId: 'policy.hesperus-survivors-transferred',
                claimType: 'eventOccurred',
                targetId: 'event.hesperus-survivors-transferred',
                sourceRef: {
                    messageId: source.messageId,
                    swipeId: source.selectedSwipeId,
                    textHash: source.textHash,
                },
            }],
        },
        sourceContribution,
        sourceObservations: [{
            contributionId: sourceContribution.id,
            role: sourceContribution.role,
            textHash: sourceContribution.textHash,
            text: 'The Hesperus survivors reached safety.',
        }],
        gatewayBaseRevision: 0,
        scene: {
            episodeId: 'episode.hesperus-rescue',
            sceneId: 'scene.hesperus-rescue',
        },
        hardBoundary: createEpisodeHardBoundary({
            id: 'boundary.hesperus-rescue',
            branchId,
            code: 'authored-scene-closure',
            source: { kind: 'missionReducer', id: definition.id },
            sourceContributionIds: [sourceContribution.id],
        }),
    };

    return {
        state,
        definition,
        source,
        input,
    };
}

function createReviewFixture() {
    const definition = JSON.parse(fs.readFileSync(
        'packages/bundled/breckenridge/v1/prelude-a-ship-underway.mission-v1.json',
        'utf8',
    ));
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

    const reviewToken = createPendingEpisodeReviewToken(storySettlement);
    const request = createEpisodeEvaluationRequest({ settlement: storySettlement });
    const proposal = {
        kind: 'directive.episodeEvaluationProposal.v1',
        ...request.envelope,
        decision: 'continue',
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
    return {
        state,
        definition,
        input: {
            definition,
            reviewToken,
            request,
            proposal,
            gatewayBaseRevision: state.stateCustody.revision,
        },
    };
}

function createSpine(harness, resolveSourceRef = () => null) {
    return createV1StateSpine({
        getState: harness.getState,
        stateDeltaGateway: harness.gateway,
        resolveSourceRef,
        now: () => NOW,
    });
}

const settlementFixture = createSettlementFixture();
const settlementHarness = createGatewayHarness(settlementFixture.state);
const settlementSpine = createSpine(
    settlementHarness,
    (ref) => ref.messageId === settlementFixture.source.messageId ? settlementFixture.source : null,
);
const preparedSettlement = await assertPreparationIsPure({
    prepare: settlementSpine.prepareAcceptedPair,
    input: settlementFixture.input,
    getState: settlementHarness.getState,
    getCommits: settlementHarness.getCommits,
});
assert.notEqual(preparedSettlement.proposal, null);
assert.equal(preparedSettlement.result.noChange, false);
assert.equal(preparedSettlement.result.evidence.acceptedClaims.length, 1);
assert.equal(preparedSettlement.candidateState.mission.v1.status, 'terminal');
assert.equal(preparedSettlement.candidateState.mission.v1.terminalDisposition, 'primarySuccess');
assert.equal(
    preparedSettlement.candidateState.mission.v1Journey.activeRunId,
    settlementFixture.state.mission.v1Journey.activeRunId,
);
assert.equal(preparedSettlement.candidateState.storySettlement.episodes[0].status, 'sealed');
assert.deepEqual(
    preparedSettlement.result,
    { ...preparedSettlement.result, campaignState: preparedSettlement.candidateState },
);

const settlementWrapperFixture = createSettlementFixture();
const settlementWrapperHarness = createGatewayHarness(settlementWrapperFixture.state);
const settlementWrapperSpine = createSpine(
    settlementWrapperHarness,
    (ref) => ref.messageId === settlementWrapperFixture.source.messageId ? settlementWrapperFixture.source : null,
);
const settled = await settlementWrapperSpine.settleAcceptedPair(settlementWrapperFixture.input);
assert.equal(settlementWrapperHarness.getCommits(), 1);
assert.deepEqual(
    { ...settled, campaignState: preparedSettlement.result.campaignState },
    preparedSettlement.result,
);
for (const root of ['mission', 'storySettlement', 'commandBearing', 'worldState', 'timeLedger']) {
    assert.deepEqual(settled.campaignState[root], preparedSettlement.candidateState[root]);
}
assert.equal(settled.campaignState.stateCustody.revision, preparedSettlement.candidateState.stateCustody.revision + 1);

const reviewFixture = createReviewFixture();
const reviewHarness = createGatewayHarness(reviewFixture.state);
const reviewSpine = createSpine(reviewHarness);
const preparedReview = await assertPreparationIsPure({
    prepare: reviewSpine.prepareEpisodeReview,
    input: reviewFixture.input,
    getState: reviewHarness.getState,
    getCommits: reviewHarness.getCommits,
});
assert.notEqual(preparedReview.proposal, null);
assert.equal(preparedReview.result.noChange, false);
assert.deepEqual(
    preparedReview.candidateState.storySettlement.episodes[0].effects
        .filter(({ targetId }) => targetId === 'mara-whitaker')
        .map(({ type, value, sourceContributionIds }) => ({ type, value, sourceContributionIds })),
    [{
        type: 'character.relationshipPosture',
        value: 'Measured professional trust.',
        sourceContributionIds: ['contribution.soft-2'],
    }, {
        type: 'character.relationshipOpenMatter',
        value: 'Whether the XO completes the corrective commitment.',
        sourceContributionIds: ['contribution.soft-2'],
    }],
);

const reviewWrapperFixture = createReviewFixture();
const reviewWrapperHarness = createGatewayHarness(reviewWrapperFixture.state);
const reviewed = await createSpine(reviewWrapperHarness).applyEpisodeReview(reviewWrapperFixture.input);
assert.equal(reviewWrapperHarness.getCommits(), 1);
assert.deepEqual(
    { ...reviewed, campaignState: preparedReview.result.campaignState },
    preparedReview.result,
);
assert.deepEqual(reviewed.campaignState.storySettlement, preparedReview.candidateState.storySettlement);
assert.equal(reviewed.campaignState.stateCustody.revision, preparedReview.candidateState.stateCustody.revision + 1);

const abstainFixture = createReviewFixture();
abstainFixture.input.proposal = {
    ...abstainFixture.input.proposal,
    decision: 'abstain',
    summary: null,
    foregroundQuestion: null,
    sourceContributionIds: [],
    effectIds: [],
    relationshipUpdates: [],
};
const abstainHarness = createGatewayHarness(abstainFixture.state);
const abstainSpine = createSpine(abstainHarness);
const preparedAbstention = await assertPreparationIsPure({
    prepare: abstainSpine.prepareEpisodeReview,
    input: abstainFixture.input,
    getState: abstainHarness.getState,
    getCommits: abstainHarness.getCommits,
});
assert.equal(preparedAbstention.proposal, null);
assert.equal(preparedAbstention.result.noChange, true);
assert.deepEqual(preparedAbstention.candidateState, abstainFixture.state);
const abstained = await abstainSpine.applyEpisodeReview(abstainFixture.input);
assert.equal(abstainHarness.getCommits(), 0);
assert.deepEqual(abstained, preparedAbstention.result);

console.log('V1 spine preparation tests passed.');
