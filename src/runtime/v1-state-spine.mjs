import { validateMissionEvidenceProposal } from '../mission/v1/evidence-contracts.mjs';
import { reduceMissionEvidence } from '../mission/v1/mission-reducer.mjs';
import { createMissionState } from '../mission/v1/mission-state.mjs';
import { createEmptyStorySettlement } from '../story/story-settlement-contracts.mjs';
import {
    acceptStoryContributions,
    appendStoryEffects,
    invalidateStorySource,
    openStoryEpisode,
    sealStoryEpisode,
    settleInsignificantScene,
} from '../story/story-settlement.mjs';

const MAX_SHADOW_DIAGNOSTICS = 20;

function jsonEqual(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function activeStoryEpisode(settlement) {
    return settlement.episodes.find((episode) => episode.id === settlement.activeEpisode) || null;
}

function deterministicEpisodeSummary(definition, settlement, transitionPacket = null) {
    const facts = new Map((definition.facts || []).map((item) => [item.id, item]));
    const events = new Map((definition.events || []).map((item) => [item.id, item]));
    const outcomes = new Map((definition.outcomes || []).map((item) => [item.id, item]));
    const visibleSummaries = [];
    const add = (value) => {
        const summary = String(value || '').replace(/\s+/g, ' ').trim();
        if (summary && !visibleSummaries.includes(summary)) visibleSummaries.push(summary);
    };
    for (const summary of transitionPacket?.playerKnownOutcomeSummary || []) add(summary);
    for (const summary of transitionPacket?.optionalOutcomeSummaries || []) add(summary);
    for (const effect of activeStoryEpisode(settlement)?.effects || []) {
        if (effect.status !== 'active' || effect.playerVisibility !== 'visible') continue;
        if (effect.type === 'mission.factDisclosed') add(facts.get(effect.targetId)?.playerText?.summary);
        if (effect.type === 'mission.eventOccurred') add(events.get(effect.targetId)?.playerText?.summary);
        if (new Set(['mission.outcomeObserved', 'mission.decisionRecorded']).has(effect.type)) {
            add(outcomes.get(effect.targetId)?.playerText?.summary);
        }
    }
    return visibleSummaries.slice(0, 8).join(' ').slice(0, 1024)
        || 'A material mission development was settled from accepted evidence.';
}

function normalizedSourceContributions({ acceptedClaims = [], sourceContribution = null, sourceContributions = [] } = {}) {
    const supplied = [
        ...(Array.isArray(sourceContributions) ? sourceContributions : []),
        ...(sourceContribution ? [sourceContribution] : []),
    ];
    const byId = new Map(supplied.filter((item) => item?.id).map((item) => [item.id, item]));
    const referencedIds = [...new Set(acceptedClaims.map((claim) => claim.sourceContributionId).filter(Boolean))];
    if (referencedIds.length === 0 && acceptedClaims.length > 0 && sourceContribution?.id) {
        referencedIds.push(sourceContribution.id);
    }
    const missingIds = referencedIds.filter((id) => !byId.has(id));
    if (missingIds.length > 0) {
        const error = new Error(`Accepted mission evidence references missing source contributions: ${missingIds.join(', ')}.`);
        error.code = 'DIRECTIVE_STORY_SOURCE_CONTRIBUTION_MISSING';
        error.details = { contributionIds: missingIds };
        throw error;
    }
    return {
        referenced: referencedIds.map((id) => structuredClone(byId.get(id))),
        supplied: [...byId.values()].map((item) => structuredClone(item)),
    };
}

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

function missionDefinitionMigrationRequired(current, definition) {
    const error = new Error(`Mission ${definition.id} requires an explicit definition migration before it can resume.`);
    error.code = 'DIRECTIVE_MISSION_DEFINITION_MIGRATION_REQUIRED';
    error.details = {
        definitionId: definition.id,
        currentDefinitionVersion: current?.definitionVersion || null,
        requestedDefinitionVersion: definition?.version || null,
        currentPackageId: current?.packageBinding?.packageId || null,
        requestedPackageId: definition?.packageBinding?.packageId || null,
        currentPackageVersion: current?.packageBinding?.packageVersion || null,
        requestedPackageVersion: definition?.packageBinding?.packageVersion || null,
        currentSourceId: current?.packageBinding?.sourceId || null,
        requestedSourceId: definition?.packageBinding?.sourceId || null,
    };
    return error;
}

function hasMatchingDefinitionBinding(current, definition) {
    return current?.definitionVersion === definition?.version
        && current?.packageBinding?.packageId === definition?.packageBinding?.packageId
        && current?.packageBinding?.packageVersion === definition?.packageBinding?.packageVersion
        && current?.packageBinding?.sourceId === definition?.packageBinding?.sourceId;
}

function initialMissionState(campaignState, definition, branchId) {
    const current = campaignState?.mission?.v1;
    if (current?.definitionId === definition.id && current?.branchId === branchId) {
        if (!hasMatchingDefinitionBinding(current, definition)) {
            throw missionDefinitionMigrationRequired(current, definition);
        }
        return structuredClone(current);
    }
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
        sourceContributions = [],
        gatewayBaseRevision = null,
        scene = {},
        hardBoundary = null,
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

        const currentStorySettlement = initialStorySettlement(campaignState, proposal.branchId);
        let storySettlement = currentStorySettlement;
        const contributions = normalizedSourceContributions({
            acceptedClaims: evidence.acceptedClaims,
            sourceContribution,
            sourceContributions,
        });
        const duplicateReplay = (proposal.claims || []).length > 0
            && evidence.acceptedClaims.length === 0
            && evidence.rejectedClaims.length === proposal.claims.length
            && evidence.rejectedClaims.every((claim) => claim.reasonCode === 'duplicate-claim');
        if (missionResult.effects.length > 0) {
            if (storySettlement.activeEpisode === null) {
                storySettlement = openStoryEpisode(storySettlement, {
                    episodeId: scene.episodeId,
                    sceneId: scene.sceneId,
                });
            }
            storySettlement = acceptStoryContributions(storySettlement, contributions.referenced);
            storySettlement = appendStoryEffects(storySettlement, missionResult.effects);
        } else if (storySettlement.activeEpisode === null && !duplicateReplay) {
            storySettlement = settleInsignificantScene(storySettlement, {
                sceneId: scene.sceneId,
                sourceContributionIds: contributions.supplied.map((item) => item.id),
            });
        }

        const shouldSeal = storySettlement.activeEpisode !== null
            && (Boolean(missionResult.transitionPacket) || Boolean(hardBoundary));
        if (shouldSeal) {
            storySettlement = sealStoryEpisode(storySettlement, {
                boundaryReason: hardBoundary?.reason
                    || (missionResult.transitionPacket ? 'mission-transition-committed' : 'deterministic-hard-boundary'),
                summary: deterministicEpisodeSummary(definition, storySettlement, missionResult.transitionPacket),
                unresolvedConsequences: [],
            });
        }

        const currentMissionState = campaignState?.mission?.v1 || null;
        if (jsonEqual(currentMissionState, missionState) && jsonEqual(currentStorySettlement, storySettlement)) {
            return {
                evidence,
                missionResult,
                storySettlement,
                campaignState: structuredClone(campaignState),
                noChange: true,
            };
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
            noChange: false,
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
