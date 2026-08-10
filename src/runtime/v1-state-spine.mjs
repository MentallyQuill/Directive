import { createHash } from 'node:crypto';

import {
    revalidateMissionEvidenceReplay,
    validateMissionEvidenceProposal,
} from '../mission/v1/evidence-contracts.mjs';
import { reduceMissionEvidence } from '../mission/v1/mission-reducer.mjs';
import { createMissionState } from '../mission/v1/mission-state.mjs';
import { deriveMissionEntryContext } from '../mission/v1/mission-entry-capabilities.mjs';
import {
    createInitialMissionJourney,
    createSuccessorMissionJourney,
    resolveMissionTransitionTarget,
    validateMissionJourney,
} from '../mission/v1/mission-journey.mjs';
import {
    createEmptyStorySettlement,
    validateStorySettlement,
} from '../story/story-settlement-contracts.mjs';
import {
    acceptStoryContributions,
    applyStoryWorkingCapsuleReview,
    appendStoryEffects,
    checkpointStoryEpisode,
    invalidateStorySources,
    invalidateStorySourcesAndDescendants,
    observeStoryWorkingEvidence,
    openStoryEpisode,
    pruneStoryEffects,
    sealStoryEpisode,
    settleInsignificantScene,
} from '../story/story-settlement.mjs';
import {
    createEpisodeHardBoundary,
    createEpisodeSoftBoundary,
    validateEpisodeHardBoundary,
} from '../story/episode-boundary.mjs';
import {
    createEpisodeEvaluationRequest,
    parseEpisodeEvaluationProposal,
} from '../story/episode-evaluator.mjs';

const MAX_SHADOW_DIAGNOSTICS = 20;
export const EPISODE_REVIEW_TOKEN_KIND = 'directive.episodeReviewToken.v1';

function stableHash(value = '') {
    return createHash('sha256').update(String(value)).digest('hex').slice(0, 24);
}

function jsonEqual(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function activeStoryEpisode(settlement) {
    return settlement.episodes.find((episode) => episode.id === settlement.activeEpisode) || null;
}

export function createPendingEpisodeReviewToken(settlement = {}) {
    const validation = validateStorySettlement(settlement);
    if (!validation.ok) return null;
    const episode = activeStoryEpisode(settlement);
    const checkpointSequence = episode?.boundaryState?.checkpointSequence;
    const lastEvaluated = episode?.workingCapsule?.lastEvaluatedCheckpointSequence;
    if (!episode?.workingCapsule
        || !Number.isInteger(checkpointSequence)
        || !Number.isInteger(lastEvaluated)
        || checkpointSequence <= lastEvaluated) {
        return null;
    }
    return {
        kind: EPISODE_REVIEW_TOKEN_KIND,
        branchId: settlement.branchId,
        episodeId: episode.id,
        episodeRevision: settlement.revision,
        checkpointSequence,
    };
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

function deterministicEffectSummary(definition, effects = []) {
    return deterministicEpisodeSummary(definition, {
        activeEpisode: 'episode.recovery-summary',
        episodes: [{ id: 'episode.recovery-summary', effects }],
    });
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

function normalizedSourceObservations(sourceObservations = [], suppliedContributions = []) {
    if (!Array.isArray(sourceObservations)) throw new TypeError('sourceObservations must be an array');
    const suppliedIds = new Set(suppliedContributions.map((item) => item.id));
    const byId = new Map();
    for (const observation of sourceObservations) {
        if (!suppliedIds.has(observation?.contributionId)) {
            throw new TypeError(`source observation is not an accepted supplied contribution: ${observation?.contributionId || '<unknown>'}`);
        }
        if (byId.has(observation.contributionId)) {
            throw new TypeError(`duplicate source observation: ${observation.contributionId}`);
        }
        byId.set(observation.contributionId, observation);
    }
    const missing = suppliedContributions.filter((item) => !byId.has(item.id)).map((item) => item.id);
    if (missing.length > 0) {
        throw new TypeError(`accepted supplied contributions require source observations: ${missing.join(', ')}`);
    }
    return suppliedContributions.map((item) => structuredClone(byId.get(item.id)));
}

function instantiateStoryEffects(effects = [], referencedContributions = []) {
    const fallbackContributionIds = referencedContributions.map((item) => item.id).filter(Boolean).sort();
    return effects.map((effect) => {
        const sourceContributionIds = (effect.sourceContributionIds || []).length > 0
            ? [...new Set(effect.sourceContributionIds)].sort()
            : fallbackContributionIds;
        return {
            ...structuredClone(effect),
            id: `effect.v1.${stableHash([effect.id, ...sourceContributionIds].join('|'))}`,
            sourceContributionIds,
        };
    });
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

function reconstructionSequenceRequired() {
    const error = new Error('Mission evidence requires an explicit acceptance-sequence migration before reconstruction.');
    error.code = 'DIRECTIVE_MISSION_RECONSTRUCTION_SEQUENCE_REQUIRED';
    return error;
}

function invalidHardBoundary(errors = []) {
    const error = new Error(`Episode hard boundary is invalid: ${errors.join('; ')}.`);
    error.code = 'DIRECTIVE_EPISODE_HARD_BOUNDARY_INVALID';
    error.details = { errors: [...errors] };
    return error;
}

function invalidEpisodeReview(errors = []) {
    const error = new Error(`Episode review is invalid: ${errors.join('; ')}.`);
    error.code = 'DIRECTIVE_EPISODE_REVIEW_INVALID';
    error.details = { errors: [...errors] };
    return error;
}

function invalidMissionJourney(errors = []) {
    const error = new TypeError(`V1 mission journey is invalid: ${errors.join('; ')}`);
    error.code = 'DIRECTIVE_MISSION_JOURNEY_INVALID';
    error.details = { errors: [...errors] };
    return error;
}

function staleEpisodeReview(reason = 'episode review no longer matches current accepted state') {
    const error = new Error(`Episode review is stale: ${reason}.`);
    error.code = 'DIRECTIVE_EPISODE_REVIEW_STALE';
    error.details = { reason };
    return error;
}

function reviewTokenForRequest(request = {}) {
    return {
        kind: EPISODE_REVIEW_TOKEN_KIND,
        branchId: request?.envelope?.branchId,
        episodeId: request?.envelope?.episodeId,
        episodeRevision: request?.envelope?.baseRevision,
        checkpointSequence: request?.envelope?.checkpointSequence,
    };
}

function alreadyAppliedReview(settlement, reviewToken, proposal) {
    const episode = (settlement?.episodes || []).find((item) => item.id === reviewToken?.episodeId);
    if (!episode) return false;
    if (proposal.decision === 'continue'
        && episode.status === 'open'
        && episode.workingCapsule?.lastEvaluatedCheckpointSequence >= reviewToken.checkpointSequence) {
        const exact = episode.workingCapsule.lastEvaluatedCheckpointSequence === reviewToken.checkpointSequence
            && episode.workingCapsule.summary === proposal.summary
            && episode.workingCapsule.foregroundQuestion === proposal.foregroundQuestion
            && jsonEqual(episode.workingCapsule.sourceContributionIds, proposal.sourceContributionIds)
            && jsonEqual(episode.workingCapsule.effectIds, proposal.effectIds)
            && episode.workingCapsule.recentEvidence.length === 0
            && episode.workingCapsule.observedContributionCount === episode.contributions.length;
        if (exact) return true;
        throw staleEpisodeReview('the checkpoint was already consumed by a different continue decision');
    }
    if (proposal.decision === 'seal'
        && new Set(['sealed', 'invalidated']).has(episode.status)
        && episode.softBoundary?.checkpointSequence === reviewToken.checkpointSequence) {
        const expectedBoundary = createEpisodeSoftBoundary({
            reason: proposal.boundaryReason,
            significanceCriteria: proposal.significanceCriteria,
            sourceContributionIds: proposal.sourceContributionIds,
            effectIds: proposal.effectIds,
            checkpointSequence: reviewToken.checkpointSequence,
        });
        const exact = episode.boundaryReason === proposal.boundaryReason
            && episode.summary === proposal.summary
            && jsonEqual(episode.softBoundary, expectedBoundary);
        if (exact) return true;
        throw staleEpisodeReview('the checkpoint was already consumed by a different seal decision');
    }
    return false;
}

function orderedEvidenceBatches(evidenceLog = []) {
    const batches = [];
    let previousRevision = -1;
    for (const entry of evidenceLog) {
        const revision = entry?.acceptedAtMissionRevision;
        if (!Number.isInteger(revision) || revision < 0 || revision < previousRevision) {
            throw reconstructionSequenceRequired();
        }
        if (batches.length === 0 || batches.at(-1).acceptedAtMissionRevision !== revision) {
            batches.push({ acceptedAtMissionRevision: revision, claims: [] });
        }
        batches.at(-1).claims.push(entry);
        previousRevision = revision;
    }
    return batches;
}

function hasMatchingDefinitionBinding(current, definition) {
    return current?.definitionVersion === definition?.version
        && current?.packageBinding?.packageId === definition?.packageBinding?.packageId
        && current?.packageBinding?.packageVersion === definition?.packageBinding?.packageVersion
        && current?.packageBinding?.sourceId === definition?.packageBinding?.sourceId;
}

export function resolveV1MissionState({ campaignState, definition, branchId } = {}) {
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

function prepareMissionTransitionActivation({
    campaignState = {},
    definition = {},
    missionState = {},
    transitionPacket = null,
    missionDefinitions = [],
    branchId = null,
    allowJourneyInitialization = false,
} = {}) {
    let missionPatch = { v1: structuredClone(missionState) };
    if (!transitionPacket) {
        return {
            missionPatch,
            transitionActivation: {
                status: 'none',
                reasonCode: null,
                sourceRunId: null,
                targetRunId: null,
                targetDefinitionId: null,
            },
        };
    }
    const hasJourney = campaignState?.mission?.v1Journey !== undefined
        || campaignState?.mission?.v1History !== undefined;
    let journeyState;
    if (hasJourney) {
        const journeyValidation = validateMissionJourney({
            campaignState,
            definitions: missionDefinitions,
        });
        if (!journeyValidation.ok) throw invalidMissionJourney(journeyValidation.errors);
        journeyState = {
            journey: structuredClone(campaignState.mission.v1Journey),
            history: structuredClone(campaignState.mission.v1History),
        };
    } else if (allowJourneyInitialization) {
        journeyState = createInitialMissionJourney({ branchId, definition });
    } else {
        throw invalidMissionJourney(['pending transition requires an existing mission journey']);
    }
    missionPatch = {
        ...missionPatch,
        v1Journey: journeyState.journey,
        v1History: journeyState.history,
    };
    const target = resolveMissionTransitionTarget({
        sourceDefinition: definition,
        transitionPacket,
        definitions: missionDefinitions,
    });
    let transitionActivation = {
        status: target.ok ? 'ready' : target.status,
        reasonCode: target.reasonCode,
        sourceRunId: journeyState.journey.activeRunId,
        targetRunId: null,
        targetDefinitionId: target.targetDefinition?.id || null,
    };
    if (!target.ok) return { missionPatch, transitionActivation };

    const activated = createSuccessorMissionJourney({
        journey: journeyState.journey,
        history: journeyState.history,
        sourceState: missionState,
        sourceDefinition: definition,
        targetDefinition: target.targetDefinition,
    });
    missionPatch = {
        v1: activated.currentState,
        v1Journey: activated.journey,
        v1History: activated.history,
        activeMissionId: target.targetDefinition.packageBinding.sourceId,
    };
    transitionActivation = {
        status: 'activated',
        reasonCode: null,
        sourceRunId: journeyState.journey.activeRunId,
        targetRunId: activated.journey.activeRunId,
        targetDefinitionId: target.targetDefinition.id,
    };
    const candidateCampaignState = {
        ...structuredClone(campaignState),
        mission: {
            ...structuredClone(campaignState.mission || {}),
            ...structuredClone(missionPatch),
        },
    };
    const activatedValidation = validateMissionJourney({
        campaignState: candidateCampaignState,
        definitions: missionDefinitions,
    });
    if (!activatedValidation.ok) throw invalidMissionJourney(activatedValidation.errors);
    return { missionPatch, transitionActivation };
}

export function createV1StateSpine({
    getState,
    stateDeltaGateway,
    resolveSourceRef,
    now = () => new Date().toISOString(),
    checkpointEveryContributions = 8,
} = {}) {
    if (typeof getState !== 'function') throw new TypeError('getState is required');
    if (typeof stateDeltaGateway?.applyProposal !== 'function') throw new TypeError('stateDeltaGateway.applyProposal is required');
    if (typeof resolveSourceRef !== 'function') throw new TypeError('resolveSourceRef is required');
    if (!Number.isInteger(checkpointEveryContributions) || checkpointEveryContributions < 1) {
        throw new TypeError('checkpointEveryContributions must be a positive integer');
    }

    function assertGatewayRevision(expectedRevision) {
        const currentRevision = stateDeltaGateway.revision();
        if (expectedRevision !== null && expectedRevision !== undefined && Number(expectedRevision) !== currentRevision) {
            throw revisionConflict(expectedRevision, currentRevision);
        }
        return currentRevision;
    }

    function reduceMissionProposal({ definition, proposal, sourceContribution } = {}) {
        const campaignState = getState();
        const missionState = resolveV1MissionState({
            campaignState,
            definition,
            branchId: proposal.branchId,
        });
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
        sourceObservations = [],
        gatewayBaseRevision = null,
        scene = {},
        hardBoundary = null,
        legacyProjection = null,
        missionDefinitions = [],
    } = {}) {
        const capturedGatewayRevision = assertGatewayRevision(gatewayBaseRevision);
        const campaignState = getState();
        if (hardBoundary !== null) {
            const boundaryResult = validateEpisodeHardBoundary(hardBoundary, { branchId: proposal?.branchId });
            if (!boundaryResult.ok) throw invalidHardBoundary(boundaryResult.errors);
        }
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

        const transitionPlan = prepareMissionTransitionActivation({
            campaignState,
            definition,
            missionState,
            transitionPacket: missionResult.transitionPacket,
            missionDefinitions,
            branchId: proposal.branchId,
            allowJourneyInitialization: true,
        });
        const { missionPatch, transitionActivation } = transitionPlan;

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
        if (missionResult.effects.length > 0 && storySettlement.activeEpisode === null) {
            storySettlement = openStoryEpisode(storySettlement, {
                episodeId: scene.episodeId,
                sceneId: scene.sceneId,
                references: { missionIds: [definition.id] },
            });
        }
        if (storySettlement.activeEpisode !== null) {
            const observations = normalizedSourceObservations(sourceObservations, contributions.supplied);
            storySettlement = acceptStoryContributions(storySettlement, contributions.supplied);
            storySettlement = observeStoryWorkingEvidence(storySettlement, {
                branchId: proposal.branchId,
                observations,
            });
            if (missionResult.effects.length > 0) {
                storySettlement = appendStoryEffects(
                    storySettlement,
                    instantiateStoryEffects(missionResult.effects, contributions.referenced),
                );
            }
        } else if (!duplicateReplay) {
            storySettlement = settleInsignificantScene(storySettlement, {
                sceneId: scene.sceneId,
                sourceContributionIds: contributions.supplied.map((item) => item.id),
                sourceContributions: contributions.supplied,
            });
        }

        let effectiveHardBoundary = hardBoundary;
        if (storySettlement.activeEpisode !== null && missionResult.transitionPacket) {
            const transitionId = missionState.transitionReceipt?.transitionId || 'mission-transition';
            const transitionContributionIds = [...new Set(
                missionResult.effects.flatMap((effect) => effect.sourceContributionIds || []),
            )];
            effectiveHardBoundary = createEpisodeHardBoundary({
                id: `boundary.${transitionId}.${missionState.revision}`,
                branchId: proposal.branchId,
                code: 'mission-transition',
                source: { kind: 'missionReducer', id: transitionId },
                sourceContributionIds: transitionContributionIds,
            });
        }
        if (storySettlement.activeEpisode !== null && effectiveHardBoundary) {
            const currentContributionIds = activeStoryEpisode(storySettlement).contributions.map((item) => item.id);
            const boundaryResult = validateEpisodeHardBoundary(effectiveHardBoundary, {
                branchId: proposal.branchId,
                knownContributionIds: currentContributionIds,
            });
            if (!boundaryResult.ok) throw invalidHardBoundary(boundaryResult.errors);
        }
        const shouldSeal = storySettlement.activeEpisode !== null && Boolean(effectiveHardBoundary);
        if (shouldSeal) {
            storySettlement = sealStoryEpisode(storySettlement, {
                boundaryReason: effectiveHardBoundary.code,
                hardBoundary: effectiveHardBoundary,
                summary: deterministicEpisodeSummary(definition, storySettlement, missionResult.transitionPacket),
                unresolvedConsequences: [],
            });
        } else if (storySettlement.activeEpisode !== null && contributions.supplied.length > 0) {
            storySettlement = checkpointStoryEpisode(storySettlement, {
                minimumNewContributions: checkpointEveryContributions,
            });
        }
        const reviewToken = createPendingEpisodeReviewToken(storySettlement);

        const currentMissionRoot = campaignState?.mission || {};
        const nextMissionRoot = { ...structuredClone(currentMissionRoot), ...structuredClone(missionPatch) };
        if (jsonEqual(currentMissionRoot, nextMissionRoot) && jsonEqual(currentStorySettlement, storySettlement)) {
            return {
                evidence,
                missionResult,
                storySettlement,
                campaignState: structuredClone(campaignState),
                noChange: true,
                reviewToken,
                transitionActivation,
            };
        }

        const activationOperations = transitionActivation.status === 'activated'
            ? [
                { op: 'set', path: 'storySettlement', value: storySettlement },
                { op: 'set', path: 'mission.v1', value: missionPatch.v1 },
                { op: 'set', path: 'mission.v1Journey', value: missionPatch.v1Journey },
                { op: 'set', path: 'mission.v1History', value: missionPatch.v1History },
                { op: 'set', path: 'mission.activeMissionId', value: missionPatch.activeMissionId },
            ]
            : null;
        const committed = await stateDeltaGateway.applyProposal({
            ...(activationOperations
                ? { operations: activationOperations }
                : { patch: { storySettlement, mission: missionPatch } }),
            domains: ['storySettlement', 'mission'],
            baseRevision: capturedGatewayRevision,
            source: 'v1StateSpineShadow',
            reason: 'Settled accepted source pair into the shadow V1 state spine.',
            metadata: {
                missionId: definition.id,
                missionRevision: missionState.revision,
                acceptedClaimCount: evidence.acceptedClaims.length,
                rejectedClaimCount: evidence.rejectedClaims.length,
                transitionActivationStatus: transitionActivation.status,
                transitionTargetDefinitionId: transitionActivation.targetDefinitionId,
            },
        });
        return {
            evidence,
            missionResult,
            storySettlement,
            campaignState: committed.campaignState,
            noChange: false,
            reviewToken,
            transitionActivation,
        };
    }

    async function activatePendingTransition({
        definition,
        missionDefinitions = [],
        gatewayBaseRevision = null,
    } = {}) {
        const capturedGatewayRevision = assertGatewayRevision(gatewayBaseRevision);
        const campaignState = getState();
        const missionState = structuredClone(campaignState?.mission?.v1 || null);
        const transitionPacket = missionState?.transitionReceipt?.packet || null;
        const { missionPatch, transitionActivation } = prepareMissionTransitionActivation({
            campaignState,
            definition,
            missionState,
            transitionPacket,
            missionDefinitions,
            branchId: campaignState?.campaignChatBinding?.saveId,
            allowJourneyInitialization: false,
        });
        if (transitionActivation.status !== 'activated') {
            return {
                campaignState: structuredClone(campaignState),
                noChange: true,
                transitionActivation,
            };
        }
        const committed = await stateDeltaGateway.applyProposal({
            operations: [
                { op: 'set', path: 'mission.v1', value: missionPatch.v1 },
                { op: 'set', path: 'mission.v1Journey', value: missionPatch.v1Journey },
                { op: 'set', path: 'mission.v1History', value: missionPatch.v1History },
                { op: 'set', path: 'mission.activeMissionId', value: missionPatch.activeMissionId },
            ],
            domains: ['mission'],
            baseRevision: capturedGatewayRevision,
            source: 'v1PendingMissionTransition',
            reason: 'Activated an exact V1 successor from a committed pending transition.',
            metadata: {
                missionId: definition.id,
                sourceRunId: transitionActivation.sourceRunId,
                targetRunId: transitionActivation.targetRunId,
                targetDefinitionId: transitionActivation.targetDefinitionId,
            },
        });
        return {
            campaignState: committed.campaignState,
            noChange: false,
            transitionActivation,
        };
    }

    async function invalidateSources({
        definition,
        missionDefinitions = [],
        branchId,
        contributionIds = [],
        gatewayBaseRevision = null,
        reason = 'source-invalidated',
    } = {}) {
        const capturedGatewayRevision = assertGatewayRevision(gatewayBaseRevision);
        const campaignState = getState();
        const currentMission = resolveV1MissionState({ campaignState, definition, branchId });
        const currentStorySettlement = initialStorySettlement(campaignState, branchId);
        const hasJourney = campaignState?.mission?.v1Journey !== undefined
            || campaignState?.mission?.v1History !== undefined;
        const definitions = (Array.isArray(missionDefinitions) ? missionDefinitions : [])
            .map((entry) => entry?.definition || entry)
            .filter((entry) => entry && typeof entry === 'object');
        if (definition?.id && !definitions.some((entry) => entry.id === definition.id)) definitions.push(definition);
        if (hasJourney) {
            const validation = validateMissionJourney({ campaignState, definitions });
            if (!validation.ok) throw invalidMissionJourney(validation.errors);
        }
        const history = hasJourney ? structuredClone(campaignState.mission.v1History) : [];
        const runs = [
            ...history.map((archive, index) => ({
                kind: 'archived',
                index,
                runId: archive.runId,
                definitionId: archive.definitionId,
                state: archive.state,
            })),
            {
                kind: 'current',
                index: history.length,
                runId: hasJourney ? campaignState.mission.v1Journey.activeRunId : null,
                definitionId: currentMission.definitionId,
                state: currentMission,
            },
        ];
        const previouslyInvalidated = new Set([
            ...runs.flatMap((run) => run.state?.invalidatedSourceContributionIds || []),
            ...(currentStorySettlement.receipts || [])
                .filter((receipt) => receipt.disposition === 'invalidated')
                .flatMap((receipt) => receipt.sourceContributionIds || []),
        ]);
        const knownContributionIds = new Set([
            ...runs.flatMap((run) => (run.state?.evidenceLog || []).map((entry) => entry.sourceContributionId)).filter(Boolean),
            ...currentStorySettlement.episodes.flatMap(
                (episode) => episode.contributions.map((contribution) => contribution.id),
            ),
            ...currentStorySettlement.receipts.flatMap((receipt) => receipt.sourceContributionIds || []),
        ]);
        const newContributionIds = [...new Set(contributionIds)].filter(
            (id) => !previouslyInvalidated.has(id) && knownContributionIds.has(id),
        );
        if (newContributionIds.length === 0) {
            return {
                missionState: currentMission,
                storySettlement: currentStorySettlement,
                campaignState: structuredClone(campaignState),
                invalidatedContributionIds: [],
                noChange: true,
                reviewToken: createPendingEpisodeReviewToken(currentStorySettlement),
            };
        }
        const invalidated = new Set(newContributionIds);
        const matchingRuns = runs.filter((run) => (run.state?.evidenceLog || []).some(
            (entry) => invalidated.has(entry.sourceContributionId),
        ));
        if (matchingRuns.length > 1) {
            throw invalidMissionJourney(['source contribution is owned by more than one mission run']);
        }

        if (matchingRuns.length === 0) {
            const storySettlement = invalidateStorySources(currentStorySettlement, {
                contributionIds: [...invalidated],
                reason,
                summarizeEffects: (effects) => deterministicEffectSummary(definition, effects),
            });
            if (jsonEqual(currentStorySettlement, storySettlement)) {
                return {
                    missionState: currentMission,
                    storySettlement: currentStorySettlement,
                    campaignState: structuredClone(campaignState),
                    invalidatedContributionIds: [],
                    noChange: true,
                    reviewToken: createPendingEpisodeReviewToken(currentStorySettlement),
                };
            }
            const committed = await stateDeltaGateway.applyProposal({
                operations: [{ op: 'set', path: 'storySettlement', value: storySettlement }],
                domains: ['storySettlement'],
                baseRevision: capturedGatewayRevision,
                source: 'v1StateSpineShadow',
                reason: 'Rebuilt Story Settlement after a non-mission source invalidation.',
                metadata: { invalidatedContributionCount: invalidated.size },
            });
            return {
                missionState: currentMission,
                storySettlement,
                campaignState: committed.campaignState,
                invalidatedContributionIds: [...newContributionIds],
                noChange: false,
                reviewToken: createPendingEpisodeReviewToken(storySettlement),
                missionChanged: false,
            };
        }

        const matchedRun = matchingRuns[0];
        const matchedDefinitions = definitions.filter((candidate) => candidate.id === matchedRun.definitionId);
        const matchedDefinition = hasJourney
            ? (matchedDefinitions.length === 1 ? matchedDefinitions[0] : null)
            : definition;
        if (!matchedDefinition) throw invalidMissionJourney(['source mission definition is unavailable or ambiguous']);
        const missionInvalidatedIds = newContributionIds.filter((id) => (
            matchedRun.state.evidenceLog || []).some((entry) => entry.sourceContributionId === id)
        );
        const missionInvalidated = new Set(missionInvalidatedIds);
        const survivingEvidence = (matchedRun.state.evidenceLog || []).filter(
            (entry) => !missionInvalidated.has(entry.sourceContributionId),
        );
        const priorHistoryForRun = hasJourney ? history.slice(0, matchedRun.index) : [];
        const rebuiltEntryContext = deriveMissionEntryContext({
            targetDefinition: matchedDefinition,
            history: priorHistoryForRun,
        });
        let rebuiltMission = createMissionState({
            definition: matchedDefinition,
            branchId,
            ...(matchedDefinition.entryCapabilities?.length > 0
                ? { entryContext: rebuiltEntryContext }
                : {}),
        });
        const dependencyPrunedEvidence = [];
        for (const batch of orderedEvidenceBatches(survivingEvidence)) {
            const replayable = revalidateMissionEvidenceReplay({
                definition: matchedDefinition,
                state: rebuiltMission,
                claims: batch.claims,
            });
            dependencyPrunedEvidence.push(...replayable.rejectedClaims);
            if (replayable.acceptedClaims.length === 0) continue;
            rebuiltMission = reduceMissionEvidence({
                definition: matchedDefinition,
                state: rebuiltMission,
                acceptedClaims: replayable.acceptedClaims,
                sourceContribution: null,
            }).state;
        }
        rebuiltMission.revision = matchedRun.state.revision + 1;
        rebuiltMission.invalidatedSourceContributionIds = [
            ...(matchedRun.state.invalidatedSourceContributionIds || []),
            ...missionInvalidatedIds,
        ];
        rebuiltMission.shadowDiagnostics = structuredClone(matchedRun.state.shadowDiagnostics || []);
        if (rebuiltMission.transitionReceipt) rebuiltMission.transitionReceipt.committedAtRevision = rebuiltMission.revision;
        appendDiagnostic(rebuiltMission, {
            kind: 'directive.v1StateSpineDiagnostic.v1',
            code: matchedRun.kind === 'archived'
                ? 'historic-source-invalidation-rebuild'
                : 'source-invalidation-rebuild',
            missionRevision: rebuiltMission.revision,
            invalidatedContributionCount: missionInvalidatedIds.length,
            dependencyPrunedEvidenceCount: dependencyPrunedEvidence.length,
            observedAt: now(),
        });

        const crossedClosure = matchedRun.kind === 'archived' || matchedRun.state.status === 'terminal';
        let storySettlement = crossedClosure
            ? invalidateStorySourcesAndDescendants(currentStorySettlement, {
                contributionIds: [...invalidated],
                reason,
                cutoffMissionId: matchedDefinition.id,
                summarizeEffects: (effects) => deterministicEffectSummary(matchedDefinition, effects),
            })
            : invalidateStorySources(currentStorySettlement, {
                contributionIds: [...invalidated],
                reason,
                summarizeEffects: (effects) => deterministicEffectSummary(matchedDefinition, effects),
            });
        if (!crossedClosure && dependencyPrunedEvidence.length > 0) {
            const prunedEffectIds = dependencyPrunedEvidence.map((entry) => (
                `effect.v1.${stableHash([entry.claimId, entry.sourceContributionId].filter(Boolean).join('|'))}`
            ));
            storySettlement = pruneStoryEffects(storySettlement, {
                effectIds: prunedEffectIds,
                summarizeEffects: (effects) => deterministicEffectSummary(matchedDefinition, effects),
            });
        }

        let missionPatch = { v1: rebuiltMission };
        let journeyRollback = null;
        if (hasJourney) {
            const priorHistory = priorHistoryForRun;
            const baseJourney = {
                ...structuredClone(campaignState.mission.v1Journey),
                revision: matchedRun.index,
                activeRunId: matchedRun.runId,
            };
            missionPatch = {
                v1: rebuiltMission,
                v1Journey: baseJourney,
                v1History: priorHistory,
                activeMissionId: matchedDefinition.packageBinding.sourceId,
            };
            if (rebuiltMission.status === 'terminal' && rebuiltMission.transitionReceipt?.packet) {
                const target = resolveMissionTransitionTarget({
                    sourceDefinition: matchedDefinition,
                    transitionPacket: rebuiltMission.transitionReceipt.packet,
                    definitions,
                });
                if (target.ok) {
                    const successor = createSuccessorMissionJourney({
                        journey: baseJourney,
                        history: priorHistory,
                        sourceState: rebuiltMission,
                        sourceDefinition: matchedDefinition,
                        targetDefinition: target.targetDefinition,
                    });
                    missionPatch = {
                        v1: successor.currentState,
                        v1Journey: successor.journey,
                        v1History: successor.history,
                        activeMissionId: target.targetDefinition.packageBinding.sourceId,
                    };
                    journeyRollback = {
                        status: 'reactivated',
                        sourceRunId: matchedRun.runId,
                        targetRunId: successor.journey.activeRunId,
                        targetDefinitionId: target.targetDefinition.id,
                    };
                } else {
                    journeyRollback = {
                        status: 'pending',
                        reasonCode: target.reasonCode,
                        sourceRunId: matchedRun.runId,
                        targetRunId: null,
                        targetDefinitionId: null,
                    };
                }
            } else {
                journeyRollback = {
                    status: 'reactivated-source',
                    reasonCode: null,
                    sourceRunId: matchedRun.runId,
                    targetRunId: null,
                    targetDefinitionId: null,
                };
            }
            const candidateCampaignState = {
                ...structuredClone(campaignState),
                mission: {
                    ...structuredClone(campaignState.mission || {}),
                    ...structuredClone(missionPatch),
                },
            };
            const validation = validateMissionJourney({ campaignState: candidateCampaignState, definitions });
            if (!validation.ok) throw invalidMissionJourney(validation.errors);
        }
        const missionOperations = [
            { op: 'set', path: 'storySettlement', value: storySettlement },
            { op: 'set', path: 'mission.v1', value: missionPatch.v1 },
            ...(hasJourney ? [
                { op: 'set', path: 'mission.v1Journey', value: missionPatch.v1Journey },
                { op: 'set', path: 'mission.v1History', value: missionPatch.v1History },
                { op: 'set', path: 'mission.activeMissionId', value: missionPatch.activeMissionId },
            ] : []),
        ];
        const committed = await stateDeltaGateway.applyProposal({
            operations: missionOperations,
            domains: ['storySettlement', 'mission'],
            baseRevision: capturedGatewayRevision,
            source: 'v1StateSpineShadow',
            reason: crossedClosure
                ? 'Rebuilt a V1 mission journey after historic accepted-source invalidation.'
                : 'Rebuilt shadow V1 state after accepted-source invalidation.',
            metadata: {
                missionId: matchedDefinition.id,
                missionRunId: matchedRun.runId,
                invalidatedContributionCount: invalidated.size,
                dependencyPrunedEvidenceCount: dependencyPrunedEvidence.length,
                prunedMissionRunCount: hasJourney ? Math.max(0, history.length - matchedRun.index) : 0,
                journeyRollbackStatus: journeyRollback?.status || null,
            },
        });
        return {
            missionState: rebuiltMission,
            storySettlement,
            campaignState: committed.campaignState,
            invalidatedContributionIds: [...newContributionIds],
            noChange: false,
            reviewToken: createPendingEpisodeReviewToken(storySettlement),
            definitionId: matchedDefinition.id,
            definitionVersion: matchedDefinition.version,
            journeyRollback,
            missionChanged: true,
        };
    }

    async function applyEpisodeReview({
        definition,
        reviewToken,
        request,
        proposal,
        gatewayBaseRevision = null,
    } = {}) {
        const capturedGatewayRevision = assertGatewayRevision(gatewayBaseRevision);
        const parsed = parseEpisodeEvaluationProposal(proposal, { request });
        if (!parsed.ok) throw invalidEpisodeReview(parsed.errors);
        const acceptedProposal = parsed.value;
        if (!jsonEqual(reviewToken, reviewTokenForRequest(request))) {
            throw staleEpisodeReview('the review token does not match its evaluation request');
        }

        const campaignState = getState();
        const currentMission = campaignState?.mission?.v1;
        if (!currentMission
            || currentMission.definitionId !== definition?.id
            || currentMission.branchId !== reviewToken.branchId) {
            throw staleEpisodeReview('the active mission or branch changed');
        }
        resolveV1MissionState({ campaignState, definition, branchId: reviewToken.branchId });
        const activePackage = campaignState?.activeCampaignPackage;
        if (activePackage && (
            activePackage.packageId !== definition.packageBinding.packageId
            || activePackage.packageVersion !== definition.packageBinding.packageVersion
        )) {
            throw staleEpisodeReview('the active campaign package changed');
        }

        const currentSettlement = initialStorySettlement(campaignState, reviewToken.branchId);
        if (alreadyAppliedReview(currentSettlement, reviewToken, acceptedProposal)) {
            return {
                storySettlement: currentSettlement,
                campaignState: structuredClone(campaignState),
                noChange: true,
                reviewToken: createPendingEpisodeReviewToken(currentSettlement),
            };
        }
        const currentToken = createPendingEpisodeReviewToken(currentSettlement);
        if (!jsonEqual(currentToken, reviewToken)) {
            throw staleEpisodeReview('the active checkpoint changed');
        }
        let currentRequest;
        try {
            currentRequest = createEpisodeEvaluationRequest({ settlement: currentSettlement });
        } catch {
            throw staleEpisodeReview('the current episode is no longer reviewable');
        }
        if (!jsonEqual(currentRequest, request)) {
            throw staleEpisodeReview('accepted sources or visible effects changed during evaluation');
        }
        if (acceptedProposal.decision === 'abstain') {
            return {
                storySettlement: currentSettlement,
                campaignState: structuredClone(campaignState),
                noChange: true,
                reviewToken: currentToken,
            };
        }

        let storySettlement;
        if (acceptedProposal.decision === 'continue') {
            storySettlement = applyStoryWorkingCapsuleReview(currentSettlement, {
                checkpointSequence: reviewToken.checkpointSequence,
                summary: acceptedProposal.summary,
                foregroundQuestion: acceptedProposal.foregroundQuestion,
                sourceContributionIds: acceptedProposal.sourceContributionIds,
                effectIds: acceptedProposal.effectIds,
            });
        } else {
            const softBoundary = createEpisodeSoftBoundary({
                reason: acceptedProposal.boundaryReason,
                significanceCriteria: acceptedProposal.significanceCriteria,
                sourceContributionIds: acceptedProposal.sourceContributionIds,
                effectIds: acceptedProposal.effectIds,
                checkpointSequence: reviewToken.checkpointSequence,
            });
            const criteria = new Set(acceptedProposal.significanceCriteria);
            storySettlement = sealStoryEpisode(currentSettlement, {
                boundaryReason: acceptedProposal.boundaryReason,
                softBoundary,
                summary: acceptedProposal.summary,
                unresolvedConsequences: [],
                significance: {
                    meaningfulDisclosure: criteria.has('consequential-fact-learned'),
                    lastingChange: [...criteria].some((criterion) => criterion !== 'consequential-fact-learned'),
                },
            });
        }

        const committed = await stateDeltaGateway.applyProposal({
            patch: { storySettlement },
            domains: ['storySettlement'],
            baseRevision: capturedGatewayRevision,
            source: 'v1EpisodeReviewShadow',
            reason: 'Applied a bounded V1 episode review to the story settlement only.',
            metadata: {
                missionId: definition.id,
                episodeId: reviewToken.episodeId,
                checkpointSequence: reviewToken.checkpointSequence,
                decision: acceptedProposal.decision,
            },
        });
        return {
            storySettlement,
            campaignState: committed.campaignState,
            noChange: false,
            reviewToken: createPendingEpisodeReviewToken(storySettlement),
        };
    }

    return {
        settleAcceptedPair,
        activatePendingTransition,
        reduceMissionProposal,
        invalidateSources,
        applyEpisodeReview,
    };
}
