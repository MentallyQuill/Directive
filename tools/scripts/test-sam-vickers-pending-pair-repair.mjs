import assert from 'node:assert/strict';

import { reduceMissionEvidence } from '../../src/mission/v1/mission-reducer.mjs';
import { createMissionPlayerProjection } from '../../src/mission/v1/player-projection.mjs';
import { createV1AcceptedPairReceipt } from '../../src/runtime/v1-accepted-pair-receipt.mjs';
import {
    acceptStoryContributions,
    openStoryEpisode,
    recordAcceptedPairReceipt,
} from '../../src/story/story-settlement.mjs';
import { createAshesInitialState, loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';
import {
    SAM_VICKERS_PENDING_PAIR_REPAIR,
    prepareSamVickersPendingPairRepair,
} from './repair-sam-vickers-pending-pair.mjs';

const runtimeAssets = loadAshesRuntimeAssets();
const definition = runtimeAssets.missionDefinitions.find(
    ({ id }) => id === SAM_VICKERS_PENDING_PAIR_REPAIR.missionId,
);

function seedMission(mission) {
    let next = reduceMissionEvidence({
        definition,
        state: mission,
        acceptedClaims: [{
            claimId: 'claim.pending-repair.distress-world',
            policyId: 'policy.hesperus.distress-established',
            claimType: 'worldFactEstablished',
            targetId: 'fact.hesperus.distress-established',
            evidenceKey: 'pending-repair|distress-world',
            sourceContributionId: 'contribution.pending-repair.distress',
        }, {
            claimId: 'claim.pending-repair.distress-known',
            policyId: 'policy.hesperus.distress-disclosed',
            claimType: 'factDisclosed',
            targetId: 'fact.hesperus.distress-established',
            evidenceKey: 'pending-repair|distress-known',
            sourceContributionId: 'contribution.pending-repair.distress',
        }],
    }).state;
    next = reduceMissionEvidence({
        definition,
        state: next,
        acceptedClaims: [{
            claimId: 'claim.pending-repair.response-begun',
            policyId: 'policy.hesperus.rescue-response-begun',
            claimType: 'eventOccurred',
            targetId: 'event.hesperus.rescue-response-begun',
            evidenceKey: 'pending-repair|response-begun',
            sourceContributionId: 'contribution.pending-repair.response',
        }],
    }).state;
    next.revision = SAM_VICKERS_PENDING_PAIR_REPAIR.expectedMissionRevision;
    return next;
}

function createRegressionSave() {
    const state = createAshesInitialState({
        campaignId: SAM_VICKERS_PENDING_PAIR_REPAIR.campaignId,
        saveId: SAM_VICKERS_PENDING_PAIR_REPAIR.saveId,
        chatId: SAM_VICKERS_PENDING_PAIR_REPAIR.chatId,
    });
    state.player.name = 'Sam Vickers';
    state.mission.v1 = seedMission(state.mission.v1);
    state.stateCustody.revision = SAM_VICKERS_PENDING_PAIR_REPAIR.expectedCustodyRevision;

    let settlement = openStoryEpisode(state.storySettlement, {
        episodeId: 'episode.v1.pending-repair',
        sceneId: 'scene.v1.pending-repair',
        references: { missionIds: [definition.id] },
    });
    settlement = acceptStoryContributions(settlement, [{
        id: 'contribution.v1.b385057f',
        messageId: '38',
        swipeId: '0',
        role: 'assistant',
        textHash: 'f276e334',
        acceptedAtRevision: 18,
    }, {
        id: 'contribution.v1.0c5db096',
        messageId: '39',
        swipeId: null,
        role: 'user',
        textHash: '2864bb9e',
        acceptedAtRevision: 18,
    }]);
    settlement = recordAcceptedPairReceipt(settlement, createV1AcceptedPairReceipt({
        branchId: SAM_VICKERS_PENDING_PAIR_REPAIR.saveId,
        sourceRangeHash: '120ea681',
        sourcePair: {
            previousAssistant: { messageId: '38', selectedSwipeId: '0', textHash: 'f276e334' },
            currentPlayer: { messageId: '39', selectedSwipeId: null, textHash: '2864bb9e' },
        },
        assistantAcceptance: 'accepted',
        sourceContributionIds: ['contribution.v1.b385057f', 'contribution.v1.0c5db096'],
    }));
    state.storySettlement = settlement;

    return {
        kind: 'directive.campaignSave.v1',
        version: 1,
        id: SAM_VICKERS_PENDING_PAIR_REPAIR.saveId,
        name: 'Sam Vickers - Ashes of Peace',
        slotType: 'active',
        campaignId: SAM_VICKERS_PENDING_PAIR_REPAIR.campaignId,
        packageId: SAM_VICKERS_PENDING_PAIR_REPAIR.packageId,
        packageVersion: SAM_VICKERS_PENDING_PAIR_REPAIR.packageVersion,
        parentSaveId: null,
        createdAt: '2026-08-10T20:51:27.827Z',
        updatedAt: '2026-08-17T16:01:05.833Z',
        state,
    };
}

const pendingSnapshot = {
    kind: 'directive.acceptedPairSnapshot.v1',
    envelope: {
        campaignId: SAM_VICKERS_PENDING_PAIR_REPAIR.campaignId,
        saveId: SAM_VICKERS_PENDING_PAIR_REPAIR.saveId,
        chatId: SAM_VICKERS_PENDING_PAIR_REPAIR.chatId,
        packageId: SAM_VICKERS_PENDING_PAIR_REPAIR.packageId,
        packageVersion: SAM_VICKERS_PENDING_PAIR_REPAIR.packageVersion,
        activeMissionId: 'prelude-a-ship-underway',
    },
    source: {
        previousAssistant: {
            hostMessageId: '40',
            promptingPlayerHostMessageId: '39',
            selectedVariantId: '0',
            selectedSwipeIndex: 0,
            sourceIntegrity: 'clean',
            textHash: 'ff33f510',
            text: 'It is. As of now, Commander Vickers assumes the duties of executive officer of this ship. Effective now. You have the deck, Commander.',
            selectedVariant: {
                selectedVariantId: '0',
                selectedSwipeIndex: 0,
                selectedTextHash: 'ff33f510',
                responseId: 'host-response.40',
                directiveOwned: false,
                dutyReportCustodyOwned: false,
                dutyReportManifest: null,
            },
        },
        currentPlayer: {
            hostMessageId: '41',
            sourceIntegrity: 'clean',
            textHash: '1efb5a69',
            text: 'Understood Captain. Medical needs personnel, so fifteen security staff will report to medical.',
        },
        sourceRangeHash: '316f56eb',
    },
};
const acceptedTermsSource = {
    contributionId: 'contribution.v1.b385057f',
    messageId: '38',
    selectedSwipeId: '0',
    textHash: 'f276e334',
    text: 'Commander Vickers, I have committed the ship. Everything between here and the storm boundary is yours.',
};

const before = createRegressionSave();
const repaired = await prepareSamVickersPendingPairRepair(before, {
    runtimeAssets,
    acceptedTermsSource,
    pendingSnapshot,
    now: '2026-08-17T19:00:00.000Z',
});

assert.equal(repaired.report.usedModelCall, false);
assert.equal(repaired.report.stagedTermsFromMessageId, '38');
assert.equal(repaired.report.settledAssistantMessageId, '40');
assert.equal(repaired.report.settledPlayerMessageId, '41');
assert.equal(repaired.save.state.stateCustody.revision, 56);
assert.equal(repaired.save.state.mission.v1.revision, 21);
assert.deepEqual(
    repaired.persistenceCheckpoints.map((checkpoint) => checkpoint.state.stateCustody.revision),
    [55, 56],
    'Each persisted checkpoint must advance exactly one custody revision.',
);
assert.equal(repaired.save.state.mission.v1.events.includes('event.prelude.command-handover-terms-settled'), true);
assert.equal(repaired.save.state.mission.v1.events.includes('event.prelude.command-handover-completed'), true);
assert.equal(repaired.save.state.mission.v1.events.includes('event.prelude.staff-readiness-established'), false);
assert.equal(repaired.save.state.mission.v1.outcomes['outcome.hesperus.rescue-result'], 'unresolved');
assert.equal(repaired.save.state.mission.v1.outcomes['outcome.hesperus.rescue-cost'], 'unassessed');
assert.equal(repaired.save.state.storySettlement.acceptedPairReceipts.at(-1).sourceRangeHash, '316f56eb');
assert.deepEqual(
    repaired.save.state.storySettlement.acceptedPairReceipts.at(-1).sourceContributionIds.length,
    2,
);

const projection = createMissionPlayerProjection({ definition, state: repaired.save.state.mission.v1 });
const objectiveById = new Map(projection.objectives.map((objective) => [objective.id, objective]));
assert.equal(objectiveById.get('objective.prelude.command-handover').disposition, 'completed');
assert.equal(objectiveById.get('objective.prelude.staff-readiness').disposition, null);
assert.equal(objectiveById.get('objective.prelude.hesperus-rescue').disposition, null);

const drifted = createRegressionSave();
drifted.state.stateCustody.revision += 1;
await assert.rejects(
    prepareSamVickersPendingPairRepair(drifted, {
        runtimeAssets,
        acceptedTermsSource,
        pendingSnapshot,
    }),
    (error) => error.code === 'DIRECTIVE_SAM_VICKERS_PENDING_REPAIR_GUARD_FAILED',
);

console.log('Sam Vickers guarded pending-pair repair tests passed.');
