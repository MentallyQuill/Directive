import assert from 'node:assert/strict';

import { createInitialMissionJourney } from '../../src/mission/v1/mission-journey.mjs';
import { reduceMissionEvidence } from '../../src/mission/v1/mission-reducer.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
import { createMissionPlayerProjection } from '../../src/mission/v1/player-projection.mjs';
import { appendShipWorkEvidenceToMissionState } from '../../src/ship/v1/ship-work-evidence.mjs';
import {
    acceptStoryContributions,
    appendStoryEffects,
    openStoryEpisode,
    recordAcceptedPairReceipt,
} from '../../src/story/story-settlement.mjs';
import { createV1AcceptedPairReceipt } from '../../src/runtime/v1-accepted-pair-receipt.mjs';
import { createAshesInitialState, loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';
import {
    SAM_VICKERS_PREMATURE_EVIDENCE_REPAIR,
    inspectSamVickersPrematureEvidenceRepair,
    prepareSamVickersPrematureEvidenceRepair,
} from './repair-sam-vickers-premature-evidence.mjs';

const { missionDefinitions, shipDataset } = loadAshesRuntimeAssets();
const definition = missionDefinitions.find((entry) => entry.id === SAM_VICKERS_PREMATURE_EVIDENCE_REPAIR.missionId);
const contributionById = new Map(
    SAM_VICKERS_PREMATURE_EVIDENCE_REPAIR.contributions.map((entry) => [entry.id, entry]),
);

function claimFor([sourceContributionId, policyId, claimType, targetId, value], index) {
    const source = contributionById.get(sourceContributionId);
    return {
        ...(claimType === 'shipMilestoneCompleted' ? { domain: 'shipWork' } : {}),
        claimId: `claim.repair-regression.${index}`,
        policyId,
        claimType,
        targetId,
        value,
        evidenceKey: [
            SAM_VICKERS_PREMATURE_EVIDENCE_REPAIR.saveId,
            source.messageId,
            source.swipeId,
            source.textHash,
            claimType,
            targetId,
        ].join('|'),
        sourceContributionId,
        ...(claimType === 'shipMilestoneCompleted' ? {
            sourceRef: {
                messageId: source.messageId,
                swipeId: source.swipeId,
                textHash: source.textHash,
            },
        } : {}),
    };
}

function createRegressionSave() {
    const state = createAshesInitialState({
        campaignId: SAM_VICKERS_PREMATURE_EVIDENCE_REPAIR.campaignId,
        saveId: SAM_VICKERS_PREMATURE_EVIDENCE_REPAIR.saveId,
        chatId: SAM_VICKERS_PREMATURE_EVIDENCE_REPAIR.chatId,
    });
    state.player.name = 'Sam Vickers';
    const journey = createInitialMissionJourney({
        definition,
        branchId: SAM_VICKERS_PREMATURE_EVIDENCE_REPAIR.saveId,
    });
    let mission = createMissionState({
        definition,
        branchId: SAM_VICKERS_PREMATURE_EVIDENCE_REPAIR.saveId,
    });
    mission = reduceMissionEvidence({
        definition,
        state: mission,
        acceptedClaims: [
            {
                claimId: 'claim.legitimate.distress-world',
                policyId: 'policy.hesperus.distress-established',
                claimType: 'worldFactEstablished',
                targetId: 'fact.hesperus.distress-established',
                value: null,
                evidenceKey: 'legitimate|distress-world',
                sourceContributionId: 'contribution.legitimate.distress',
            },
            {
                claimId: 'claim.legitimate.distress-known',
                policyId: 'policy.hesperus.distress-disclosed',
                claimType: 'factDisclosed',
                targetId: 'fact.hesperus.distress-established',
                value: null,
                evidenceKey: 'legitimate|distress-known',
                sourceContributionId: 'contribution.legitimate.distress',
            },
        ],
    }).state;
    mission = reduceMissionEvidence({
        definition,
        state: mission,
        acceptedClaims: [{
            claimId: 'claim.legitimate.response-begun',
            policyId: 'policy.hesperus.rescue-response-begun',
            claimType: 'eventOccurred',
            targetId: 'event.hesperus.rescue-response-begun',
            value: null,
            evidenceKey: 'legitimate|response-begun',
            sourceContributionId: 'contribution.legitimate.response',
        }],
    }).state;

    const falseClaims = SAM_VICKERS_PREMATURE_EVIDENCE_REPAIR.evidence.map(claimFor);
    for (const contribution of SAM_VICKERS_PREMATURE_EVIDENCE_REPAIR.contributions) {
        const batch = falseClaims.filter((claim) => claim.sourceContributionId === contribution.id);
        const missionClaims = batch.filter((claim) => claim.domain !== 'shipWork');
        const shipClaims = batch.filter((claim) => claim.domain === 'shipWork');
        if (missionClaims.length > 0) {
            mission = reduceMissionEvidence({ definition, state: mission, acceptedClaims: missionClaims }).state;
        }
        if (shipClaims.length > 0) mission = appendShipWorkEvidenceToMissionState(mission, shipClaims);
    }
    state.mission = {
        activeMissionId: definition.packageBinding.sourceId,
        v1: mission,
        v1Journey: journey.journey,
        v1History: journey.history,
    };

    let settlement = openStoryEpisode(state.storySettlement, {
        episodeId: 'episode.v1.b4f7dc17',
        sceneId: 'scene.repair-regression',
        references: { missionIds: [definition.id] },
    });
    settlement = acceptStoryContributions(settlement, SAM_VICKERS_PREMATURE_EVIDENCE_REPAIR.contributions.map(
        (contribution) => ({ ...contribution, role: 'assistant' }),
    ));
    settlement = appendStoryEffects(settlement, SAM_VICKERS_PREMATURE_EVIDENCE_REPAIR.effects.map(
        ([id, type, targetId, value, sourceContributionId]) => ({
            id,
            type,
            targetId,
            value,
            sourceContributionIds: [sourceContributionId],
            playerVisibility: 'visible',
            status: 'active',
        }),
    ));
    settlement = recordAcceptedPairReceipt(settlement, createV1AcceptedPairReceipt({
        branchId: SAM_VICKERS_PREMATURE_EVIDENCE_REPAIR.saveId,
        sourceRangeHash: 'repair-regression-range',
        sourcePair: {
            previousAssistant: { messageId: '36', selectedSwipeId: '0', textHash: 'c58333e5' },
            currentPlayer: { messageId: '37', selectedSwipeId: null, textHash: '43592a4a' },
        },
        assistantAcceptance: 'accepted',
        sourceContributionIds: ['contribution.v1.a8f4f5a6'],
    }));
    state.storySettlement = settlement;
    state.stateCustody.revision = SAM_VICKERS_PREMATURE_EVIDENCE_REPAIR.expectedCustodyRevision;

    return {
        kind: 'directive.campaignSave.v1',
        version: 1,
        id: SAM_VICKERS_PREMATURE_EVIDENCE_REPAIR.saveId,
        name: 'Sam Vickers - Ashes of Peace',
        slotType: 'active',
        campaignId: SAM_VICKERS_PREMATURE_EVIDENCE_REPAIR.campaignId,
        packageId: SAM_VICKERS_PREMATURE_EVIDENCE_REPAIR.packageId,
        packageVersion: SAM_VICKERS_PREMATURE_EVIDENCE_REPAIR.packageVersion,
        parentSaveId: null,
        createdAt: '2026-08-10T20:51:27.827Z',
        updatedAt: '2026-08-16T04:00:00.000Z',
        state,
    };
}

const before = createRegressionSave();
assert.deepEqual(inspectSamVickersPrematureEvidenceRepair(before), {
    ok: true,
    errors: [],
    evidenceCount: 14,
    effectCount: 14,
    contributionCount: 3,
});

const beforeContributions = structuredClone(before.state.storySettlement.episodes[0].contributions);
const beforeReceipts = structuredClone(before.state.storySettlement.acceptedPairReceipts);
const beforeLegitimateKeys = before.state.mission.v1.acceptedEvidenceKeys.filter((entry) => entry.startsWith('legitimate|'));
const repaired = await prepareSamVickersPrematureEvidenceRepair(before, {
    definition,
    missionDefinitions,
    shipDataset,
    now: '2026-08-16T05:00:00.000Z',
});

assert.equal(repaired.report.removedEvidenceCount, 14);
assert.equal(repaired.report.removedEffectCount, 14);
assert.equal(repaired.save.state.stateCustody.revision, 52);
assert.equal(repaired.save.state.mission.v1.revision, before.state.mission.v1.revision + 1);
assert.deepEqual(repaired.save.state.storySettlement.episodes[0].contributions, beforeContributions);
assert.deepEqual(repaired.save.state.storySettlement.acceptedPairReceipts, beforeReceipts);
assert.deepEqual(
    repaired.save.state.mission.v1.acceptedEvidenceKeys.filter((entry) => entry.startsWith('legitimate|')),
    beforeLegitimateKeys,
);
assert.equal(repaired.save.state.mission.v1.evidenceLog.some(
    (entry) => SAM_VICKERS_PREMATURE_EVIDENCE_REPAIR.contributions.some(
        (contribution) => contribution.id === entry.sourceContributionId,
    ),
), false);
assert.equal(repaired.save.state.storySettlement.episodes.flatMap((episode) => episode.effects).some(
    (effect) => SAM_VICKERS_PREMATURE_EVIDENCE_REPAIR.effects.some(([id]) => id === effect.id),
), false);

const projection = createMissionPlayerProjection({ definition, state: repaired.save.state.mission.v1 });
assert.deepEqual(projection.objectives.slice(0, 3).map(({ id, status, disposition }) => ({
    id,
    status,
    disposition,
})), [
    { id: 'objective.prelude.command-handover', status: 'available', disposition: null },
    { id: 'objective.prelude.staff-readiness', status: 'available', disposition: null },
    { id: 'objective.prelude.hesperus-rescue', status: 'inProgress', disposition: null },
]);

const drifted = createRegressionSave();
drifted.state.storySettlement.episodes[0].contributions[0].textHash = 'changed';
await assert.rejects(
    prepareSamVickersPrematureEvidenceRepair(drifted, {
        definition,
        missionDefinitions,
        shipDataset,
        now: '2026-08-16T05:00:00.000Z',
    }),
    (error) => error.code === 'DIRECTIVE_SAM_VICKERS_REPAIR_GUARD_FAILED',
);

console.log('Sam Vickers guarded premature-evidence repair tests passed.');
