import { validateMissionEvidenceProposal } from '../mission/v1/evidence-contracts.mjs';
import { reduceMissionEvidence } from '../mission/v1/mission-reducer.mjs';
import { createMissionState } from '../mission/v1/mission-state.mjs';
import { createEmptyStorySettlement } from '../story/story-settlement-contracts.mjs';
import {
    acceptStoryContribution,
    appendStoryEffects,
    invalidateStorySource,
    openStoryEpisode,
    sealStoryEpisode,
    settleInsignificantScene,
} from '../story/story-settlement.mjs';

const MAX_SHADOW_DIAGNOSTICS = 20;

function revisionConflict(expected, current) {
    const error = new Error(`State delta revision conflict: expected ${expected}, current revision is ${current}.`);
    error.code = 'DIRECTIVE_STATE_REVISION_CONFLICT';
    error.details = { expectedRevision: Number(expected), currentRevision: Number(current) };
    return error;
}

function appendDiagnostic(state, diagnostic) {
    const diagnostics = Array.isArray(state.shadowDiagnostics) ? state.shadowDiagnostics : [];
    state.shadowDiagnostics = [...diagnostics, diagnostic].slice(-MAX_SHADOW_DIAGNOSTICS);
}

function initialMissionState(campaignState, definition, branchId) {
    const current = campaignState?.mission?.v1;
    if (current?.definitionId === definition.id && current?.branchId === branchId) return structuredClone(current);
    return createMissionState({ definition, branchId });
}

function initialStorySettlement(campaignState, branchId) {
    const current = campaignState?.storySettlement;
    if (current?.branchId === branchId) return structuredClone(current);
    return createEmptyStorySettlement({ branchId });
}

export function createV1StateSpine({
    getState,
    stateDeltaGateway,
    resolveSourceRef,
    now = () => new Date().toISOString(),
} = {}) {
    if (typeof getState !== 'function') throw new TypeError('getState is required');
    if (typeof stateDeltaGateway?.applyProposal !== 'function') throw new TypeError('stateDeltaGateway.applyProposal is required');
    if (typeof resolveSourceRef !== 'function') throw new TypeError('resolveSourceRef is required');

    function assertGatewayRevision(expectedRevision) {
        const currentRevision = stateDeltaGateway.revision();
        if (expectedRevision !== null && expectedRevision !== undefined && Number(expectedRevision) !== currentRevision) {
            throw revisionConflict(expectedRevision, currentRevision);
        }
        return currentRevision;
    }

    function reduceMissionProposal({ definition, proposal, sourceContribution } = {}) {
        const campaignState = getState();
        const missionState = initialMissionState(campaignState, definition, proposal.branchId);
        const evidence = validateMissionEvidenceProposal({
            definition,
            state: missionState,
            proposal,
            resolveSourceRef,
        });
        const missionResult = reduceMissionEvidence({
            definition,
            state: missionState,
            acceptedClaims: evidence.acceptedClaims,
            sourceContribution,
        });
        return { evidence, missionResult };
    }

    async function settleAcceptedPair({
        definition,
        proposal,
        sourceContribution,
        gatewayBaseRevision = null,
        scene = {},
        legacyProjection = null,
    } = {}) {
        const capturedGatewayRevision = assertGatewayRevision(gatewayBaseRevision);
        const campaignState = getState();
        const { evidence, missionResult } = reduceMissionProposal({ definition, proposal, sourceContribution });
        if (evidence.proposalRejected) {
            const error = new Error(`Mission evidence proposal rejected: ${evidence.rejectionReasonCode}.`);
            error.code = evidence.rejectionReasonCode === 'stale-revision'
                ? 'DIRECTIVE_MISSION_EVIDENCE_STALE'
                : 'DIRECTIVE_MISSION_EVIDENCE_REJECTED';
            error.details = { reasonCode: evidence.rejectionReasonCode };
            throw error;
        }
        const missionState = missionResult.state;
        if (legacyProjection?.status && legacyProjection.status !== missionState.status) {
            appendDiagnostic(missionState, {
                kind: 'directive.v1StateSpineDiagnostic.v1',
                code: 'legacy-v1-status-divergence',
                missionRevision: missionState.revision,
                legacyStatus: legacyProjection.status,
                v1Status: missionState.status,
                observedAt: now(),
            });
        }

        let storySettlement = initialStorySettlement(campaignState, proposal.branchId);
        if (missionResult.effects.length > 0) {
            storySettlement = openStoryEpisode(storySettlement, {
                episodeId: scene.episodeId,
                sceneId: scene.sceneId,
            });
            storySettlement = acceptStoryContribution(storySettlement, sourceContribution);
            storySettlement = appendStoryEffects(storySettlement, missionResult.effects);
            storySettlement = sealStoryEpisode(storySettlement, {
                boundaryReason: scene.boundaryReason,
                summary: String(scene.summary || '').slice(0, 1024),
                unresolvedConsequences: scene.unresolvedConsequences || [],
            });
        } else {
            storySettlement = settleInsignificantScene(storySettlement, {
                sceneId: scene.sceneId,
                sourceContributionIds: sourceContribution?.id ? [sourceContribution.id] : [],
            });
        }

        const committed = await stateDeltaGateway.applyProposal({
            patch: {
                storySettlement,
                mission: { v1: missionState },
            },
            domains: ['storySettlement', 'mission'],
            baseRevision: capturedGatewayRevision,
            source: 'v1StateSpineShadow',
            reason: 'Settled accepted source pair into the shadow V1 state spine.',
            metadata: {
                missionId: definition.id,
                missionRevision: missionState.revision,
                acceptedClaimCount: evidence.acceptedClaims.length,
                rejectedClaimCount: evidence.rejectedClaims.length,
            },
        });
        return {
            evidence,
            missionResult,
            storySettlement,
            campaignState: committed.campaignState,
        };
    }

    async function invalidateSources({
        definition,
        branchId,
        contributionIds = [],
        gatewayBaseRevision = null,
        reason = 'source-invalidated',
    } = {}) {
        const capturedGatewayRevision = assertGatewayRevision(gatewayBaseRevision);
        const campaignState = getState();
        const currentMission = initialMissionState(campaignState, definition, branchId);
        const currentStorySettlement = initialStorySettlement(campaignState, branchId);
        const previouslyInvalidated = new Set(currentMission.invalidatedSourceContributionIds || []);
        const knownContributionIds = new Set([
            ...(currentMission.evidenceLog || []).map((entry) => entry.sourceContributionId).filter(Boolean),
            ...currentStorySettlement.episodes.flatMap(
                (episode) => episode.contributions.map((contribution) => contribution.id),
            ),
        ]);
        const newContributionIds = [...new Set(contributionIds)].filter(
            (id) => !previouslyInvalidated.has(id) && knownContributionIds.has(id),
        );
        if (newContributionIds.length === 0) {
            return {
                missionState: currentMission,
                storySettlement: currentStorySettlement,
                campaignState: structuredClone(campaignState),
            };
        }
        const invalidated = new Set(newContributionIds);
        const survivingEvidence = (currentMission.evidenceLog || []).filter(
            (entry) => !invalidated.has(entry.sourceContributionId),
        );
        let rebuiltMission = createMissionState({ definition, branchId });
        if (survivingEvidence.length > 0) {
            rebuiltMission = reduceMissionEvidence({
                definition,
                state: rebuiltMission,
                acceptedClaims: survivingEvidence.map((entry) => ({ ...entry })),
                sourceContribution: null,
            }).state;
        }
        rebuiltMission.revision = currentMission.revision + 1;
        rebuiltMission.invalidatedSourceContributionIds = [
            ...previouslyInvalidated,
            ...newContributionIds,
        ];
        rebuiltMission.shadowDiagnostics = structuredClone(currentMission.shadowDiagnostics || []);
        if (rebuiltMission.transitionReceipt) {
            rebuiltMission.transitionReceipt.committedAtRevision = rebuiltMission.revision;
        }
        appendDiagnostic(rebuiltMission, {
            kind: 'directive.v1StateSpineDiagnostic.v1',
            code: 'source-invalidation-rebuild',
            missionRevision: rebuiltMission.revision,
            invalidatedContributionCount: invalidated.size,
            observedAt: now(),
        });

        let storySettlement = currentStorySettlement;
        for (const contributionId of invalidated) {
            storySettlement = invalidateStorySource(storySettlement, { contributionId, reason });
        }
        const committed = await stateDeltaGateway.applyProposal({
            patch: {
                storySettlement,
                mission: { v1: rebuiltMission },
            },
            domains: ['storySettlement', 'mission'],
            baseRevision: capturedGatewayRevision,
            source: 'v1StateSpineShadow',
            reason: 'Rebuilt shadow V1 state after accepted-source invalidation.',
            metadata: {
                missionId: definition.id,
                invalidatedContributionCount: invalidated.size,
            },
        });
        return {
            missionState: rebuiltMission,
            storySettlement,
            campaignState: committed.campaignState,
        };
    }

    return {
        settleAcceptedPair,
        reduceMissionProposal,
        invalidateSources,
    };
}
