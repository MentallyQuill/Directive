import { createScenePacingContext, gateScenePacingClaims, settleScenePacing, sceneAllowsReport, scenePacingPermissions, scenePacingDependencies } from '../narration/scene-pacing.mjs';
import {
    createMissionAcceptedPairInterpretationPrompt,
    createMissionAcceptedPairInterpreter,
    MISSION_EVIDENCE_INTERPRETER_TIMEOUT_MS,
} from '../mission/v1/accepted-pair-interpreter.mjs';
import { createMissionInterpretationCandidatePacket } from '../mission/v1/interpretation-candidates.mjs';
import { validateMissionDefinition } from '../mission/v1/mission-contracts.mjs';
import {
    createShipWorkInterpretationCandidates,
    SHIP_WORK_EVIDENCE_PROPOSAL_KIND,
} from '../ship/v1/ship-work-evidence.mjs';
import {
    COHESION_EVIDENCE_PROPOSAL_KIND,
    createCohesionInterpretationCandidates,
} from '../ship/v1/cohesion-evidence.mjs';
import {
    createPendingEpisodeReviewToken,
    createV1StateSpine,
    resolveV1MissionState,
} from './v1-state-spine.mjs';
import { validateEpisodeHardBoundary } from '../story/episode-boundary.mjs';
import {
    createEpisodeEvaluationRequest,
    createEpisodeEvaluator,
    parseEpisodeEvaluationProposal,
} from '../story/episode-evaluator.mjs';
import {
    recordDirectorReceipt,
    recordEpisodeReviewAttempt,
    recordPendingDossier,
    selectDirectorReceipt,
} from '../story/story-settlement.mjs';
import {
    createDirectorReceipt,
    createPendingDossier,
} from '../story/continuity-contracts.mjs';
import {
    materializeContinuityChanges,
    projectContinuityThreads,
} from '../story/continuity-events.mjs';
import {
    createDirectorAuthoredContext,
    projectDirectorContinuity,
} from '../story/director-context.mjs';
import {
    createStoryDirectorRequest,
    parseStoryDirectorOutput,
    parseStoryDirectionOutput,
} from '../story/story-director.mjs';
import { parseContinuityAnalystOutput } from '../story/continuity-analyst.mjs';
import { lookupContinuityThreads } from '../story/thread-retrieval.mjs';
import { normalizeAnalysisLimits } from '../generation/analysis-limits.mjs';
import { compileDirectorInstruction } from '../narration/director-instructions.mjs';
import { createV1PlayerProjection } from '../projection/v1/player-projection.mjs';
import {
    createDutyReportVisibleSegment,
    materializeAcceptedDutyReportClaim,
} from '../mission/v1/duty-report-delivery.mjs';
import {
    deliveredDutyReportIds,
    selectPendingDutyReport,
} from '../mission/v1/duty-report-planner.mjs';
import { validateMissionStateAuthority } from '../mission/v1/mission-state-authority.mjs';
import { missionStateContext } from '../mission/v1/mission-state.mjs';
import { evaluateMissionPredicate } from '../mission/v1/predicate-evaluator.mjs';
import {
    createCampaignConclusionReceipt,
    inspectCampaignConclusionTarget,
} from '../mission/v1/campaign-conclusion.mjs';
import {
    resolveMissionTransitionTarget,
    validateMissionJourney,
} from '../mission/v1/mission-journey.mjs';
import {
    createMissionTransitionNarrationFallback,
    createMissionTransitionNarrationPacket,
    createMissionTransitionNarrationRequest,
} from '../mission/v1/mission-transition-narration.mjs';
import {
    createV1AcceptedPairReceipt,
    v1AcceptedPairReceiptMatches,
} from './v1-accepted-pair-receipt.mjs';
import {
    createPeopleInterpretationContext,
    materializeAcceptedPairPeopleEvents,
} from '../people/accepted-pair-people.mjs';
import { createPeopleDossierAuthor } from '../people/people-dossier-author.mjs';
import { adjustMissionObjectiveProgress } from '../mission/v1/objective-progress.mjs';
import { eligibleMissionCommandBearingAwards } from '../mission/v1/mission-reducer.mjs';
import { awardV1CommandBearing } from '../command/v1-command-bearing.mjs';
import { pruneStoryEffects } from '../story/story-settlement.mjs';
import { stableHash24 } from './v1-stable-hash.mjs';
import { createParallelTurnAnalysis } from './parallel-turn-analysis.mjs';
import { createTurnAnalysisKey } from './turn-analysis-key.mjs';
import { createTurnCommit } from './turn-state-reconciler.mjs';
import { assertV1CampaignState } from './v1-campaign-state.mjs';
import { sha256Json } from '../storage/v1-state-delta-codec.mjs';

function compact(value) {
    return String(value ?? '').trim();
}

function safeReasonCode(value) {
    const reason = compact(value).slice(0, 120);
    return /^[a-z0-9][a-z0-9._:-]*$/i.test(reason) ? reason : 'source-invalidated';
}

function stableHash(value = '') {
    let hash = 0x811c9dc5;
    for (const character of String(value)) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function unavailable(reasonCode, diagnostics = {}, { attempted = false } = {}) {
    return {
        ok: false,
        attempted,
        status: 'unavailable',
        reasonCode,
        diagnostics,
        committedRoots: [],
        noChange: true,
    };
}

function definitionRecords(runtimeAssets = {}) {
    if (Array.isArray(runtimeAssets.missionDefinitions)) return runtimeAssets.missionDefinitions;
    if (runtimeAssets.missionDefinitionsById instanceof Map) {
        return [...runtimeAssets.missionDefinitionsById.values()];
    }
    return [];
}

function validDefinitionRecords(runtimeAssets = {}) {
    return definitionRecords(runtimeAssets)
        .map((record) => ({
            path: record?.path || '',
            definition: record?.definition || record,
        }))
        .filter((record) => validateMissionDefinition(record.definition).ok);
}

function bindingReason(definition, packageId, packageVersion) {
    if (definition?.packageBinding?.packageId !== packageId) return 'package-id-mismatch';
    if (definition?.packageBinding?.packageVersion !== packageVersion) return 'package-version-mismatch';
    return null;
}

export function resolveActiveV1MissionDefinition({ campaignState = {}, runtimeAssets = {} } = {}) {
    const packageId = compact(runtimeAssets?.packageData?.manifest?.id);
    const packageVersion = compact(runtimeAssets?.packageData?.manifest?.version);
    const rawRecords = definitionRecords(runtimeAssets);
    if (rawRecords.length === 0) return unavailable('definition-assets-missing');
    const records = validDefinitionRecords(runtimeAssets);
    if (records.length === 0) return unavailable('definition-invalid');

    const currentV1 = campaignState?.mission?.v1 || null;
    if (currentV1?.definitionId) {
        const matches = records.filter((record) => record.definition.id === currentV1.definitionId);
        if (matches.length === 0) return unavailable('definition-id-unavailable');
        if (matches.length > 1) return unavailable('definition-ambiguous');
        const definition = matches[0].definition;
        if (compact(campaignState?.mission?.activeMissionId) !== compact(definition.packageBinding?.sourceId)) {
            return unavailable('mission-locator-mismatch');
        }
        const reasonCode = bindingReason(definition, packageId, packageVersion);
        if (reasonCode) return unavailable(reasonCode);
        const persistedBindingMatches = currentV1.definitionVersion === definition.version
            && currentV1.packageBinding?.packageId === definition.packageBinding.packageId
            && currentV1.packageBinding?.packageVersion === definition.packageBinding.packageVersion
            && currentV1.packageBinding?.sourceId === definition.packageBinding.sourceId;
        if (!persistedBindingMatches) return unavailable('definition-mismatch');
        return { ok: true, definition, record: matches[0], packageId, packageVersion };
    }

    const activeMissionId = compact(campaignState?.mission?.activeMissionId);
    if (!activeMissionId) return unavailable('active-mission-unavailable');
    const matches = records.filter((record) => record.definition.packageBinding?.sourceId === activeMissionId);
    if (matches.length === 0) return unavailable('active-mission-unavailable');
    if (matches.length > 1) return unavailable('definition-ambiguous');
    const definition = matches[0].definition;
    const reasonCode = bindingReason(definition, packageId, packageVersion);
    if (reasonCode) return unavailable(reasonCode);
    return { ok: true, definition, record: matches[0], packageId, packageVersion };
}

export function inspectV1MissionTransition({ campaignState = {}, runtimeAssets = {} } = {}) {
    const resolved = resolveActiveV1MissionDefinition({ campaignState, runtimeAssets });
    if (!resolved.ok) return resolved;
    const missionState = campaignState?.mission?.v1;
    if (!missionState) return unavailable('mission-state-unavailable');
    if (missionState.status !== 'terminal') {
        return {
            ok: true,
            attempted: false,
            status: 'none',
            reasonCode: 'mission-not-terminal',
            activatable: false,
            sourceDefinitionId: resolved.definition.id,
            sourceRunId: campaignState?.mission?.v1Journey?.activeRunId || null,
            targetDefinitionId: null,
            committedRoots: [],
            noChange: true,
            diagnostics: {},
        };
    }
    if (!missionState.transitionReceipt?.packet) {
        return {
            ...unavailable('transition-receipt-missing'),
            status: 'invalid',
            sourceDefinitionId: resolved.definition.id,
            activatable: false,
        };
    }
    const authority = validateMissionStateAuthority({ definition: resolved.definition, state: missionState });
    if (!authority.ok) {
        return {
            ...unavailable('mission-state-invalid', { errorCount: authority.errors.length }),
            status: 'invalid',
            sourceDefinitionId: resolved.definition.id,
            activatable: false,
        };
    }
    const definitions = validDefinitionRecords(runtimeAssets).map((record) => record.definition);
    const journey = validateMissionJourney({ campaignState, definitions });
    if (!journey.ok) {
        return {
            ...unavailable('mission-journey-invalid', { errorCount: journey.errors.length }),
            status: 'invalid',
            sourceDefinitionId: resolved.definition.id,
            activatable: false,
        };
    }
    if (missionState.transitionReceipt.target?.kind === 'phase') {
        const conclusion = inspectCampaignConclusionTarget({
            campaignState,
            sourceDefinition: resolved.definition,
            packageData: runtimeAssets.packageData,
        });
        return {
            ok: conclusion.ok,
            attempted: false,
            status: conclusion.status,
            reasonCode: conclusion.reasonCode,
            activatable: conclusion.activatable,
            sourceDefinitionId: resolved.definition.id,
            sourceRunId: campaignState.mission.v1Journey.activeRunId,
            targetDefinitionId: null,
            targetPhaseId: conclusion.phaseId,
            endConditionId: conclusion.endConditionId,
            conclusionId: conclusion.receipt?.id || null,
            committedRoots: [],
            noChange: true,
            diagnostics: {},
        };
    }
    const target = resolveMissionTransitionTarget({
        sourceDefinition: resolved.definition,
        transitionPacket: missionState.transitionReceipt.packet,
        definitions,
    });
    return {
        ok: true,
        attempted: false,
        status: target.ok ? 'ready' : target.status,
        reasonCode: target.reasonCode,
        activatable: target.ok,
        sourceDefinitionId: resolved.definition.id,
        sourceRunId: campaignState.mission.v1Journey.activeRunId,
        targetDefinitionId: target.targetDefinition?.id || null,
        committedRoots: [],
        noChange: true,
        diagnostics: {},
    };
}

function selectedSwipeId(previousAssistant = {}) {
    const value = previousAssistant.selectedVariantId
        ?? previousAssistant.selectedVariant?.selectedSwipeId
        ?? previousAssistant.selectedVariant?.selectedVariantId
        ?? previousAssistant.selectedSwipeId
        ?? previousAssistant.selectedSwipeIndex
        ?? previousAssistant.selectedVariant?.selectedSwipeIndex
        ?? null;
    return value === null || value === undefined || value === '' ? null : String(value);
}

function sourcePairFromSnapshot(snapshot = {}) {
    const previous = snapshot?.source?.previousAssistant || {};
    const previousVariant = previous.selectedVariant || {};
    const player = snapshot?.source?.currentPlayer || {};
    return {
        previousAssistant: {
            messageId: compact(previous.hostMessageId),
            selectedSwipeId: selectedSwipeId(previous),
            textHash: compact(previous.textHash),
            text: String(previous.text || ''),
            responseId: compact(previousVariant.responseId),
            directiveOwned: previousVariant.directiveOwned === true,
            dutyReportCustodyOwned: previousVariant.dutyReportCustodyOwned === true,
            dutyReportManifest: previousVariant.dutyReportManifest || null,
        },
        currentPlayer: {
            messageId: compact(player.hostMessageId),
            selectedSwipeId: null,
            textHash: compact(player.textHash),
            text: String(player.text || ''),
        },
    };
}

function timeContextFromSnapshot(campaignState = {}, snapshot = {}, runtimeAssets = {}) {
    const ledger = campaignState?.timeLedger || {};
    const previousAssistant = snapshot?.source?.previousAssistant || {};
    const selectedVariant = previousAssistant.selectedVariant || {};
    const openingBaseline = selectedVariant.outcomeId === 'opening'
        || compact(selectedVariant.responseId).startsWith('directive.v1.opening.');
    const secondOfDay = ledger.shipClock?.secondOfDay
        ?? (Number(ledger.shipClock?.minuteOfDay || 0) * 60);
    const elapsedSeconds = ledger.elapsedSeconds
        ?? (Number(ledger.elapsedMinutes || campaignState?.worldState?.elapsedMinutes || 0) * 60);
    const promptingPlayerId = compact(previousAssistant.promptingPlayerHostMessageId);
    const priorTimeDecision = promptingPlayerId && (ledger.decisions || []).find(decision => (
        compact(decision.sourceAnchorRange?.currentPlayerHostMessageId) === promptingPlayerId
    ));
    return {
        alreadyCountedPlayer: priorTimeDecision && previousAssistant.promptingPlayerText ? {
            hostMessageId: promptingPlayerId,
            text: String(previousAssistant.promptingPlayerText),
            decision: priorTimeDecision.decision,
            acceptedPairElapsedSeconds: priorTimeDecision.elapsedSeconds,
        } : null,
        current: {
            stardate: ledger.stardate ?? campaignState?.worldState?.currentStardate ?? campaignState?.campaign?.currentStardate ?? null,
            secondOfDay,
            minuteOfDay: Math.floor(secondOfDay / 60),
            elapsedSeconds,
            elapsedMinutes: Math.floor(elapsedSeconds / 60),
        },
        scope: {
            kind: 'directive.acceptedPairTimeScope.v1',
            previousAssistantTiming: openingBaseline ? 'opening-baseline' : 'elapsed-from-current',
            countPreviousAssistant: !openingBaseline,
            countCurrentPlayer: true,
        },
        footer: snapshot?.source?.previousAssistant?.timeFooter || null,
        stardatePerDay: runtimeAssets?.packageData?.world?.layout?.stardatePerDay ?? 1,
    };
}

function sourceMessageMatchesHostMessage(sourceMessageId = '', hostMessageId = '') {
    const source = compact(sourceMessageId);
    const host = compact(hostMessageId);
    if (!source || !host) return false;
    return source === host || source.startsWith(`time-boundary:${stableHash(host)}:`);
}

function snapshotIntegrityReason(snapshot = {}) {
    const previous = snapshot?.source?.previousAssistant || {};
    const player = snapshot?.source?.currentPlayer || {};
    if (previous.sourceIntegrity !== 'clean') return 'source-integrity-unavailable';
    if (player.sourceIntegrity && player.sourceIntegrity !== 'clean') return 'source-integrity-unavailable';
    const sourcePair = sourcePairFromSnapshot(snapshot);
    if (!sourcePair.previousAssistant.messageId
        || !sourcePair.previousAssistant.textHash
        || !sourcePair.previousAssistant.text
        || !sourcePair.currentPlayer.messageId
        || !sourcePair.currentPlayer.textHash
        || !sourcePair.currentPlayer.text
        || !compact(snapshot?.source?.sourceRangeHash)) {
        return 'source-pair-incomplete';
    }
    const selectedTextHash = compact(previous.selectedVariant?.selectedTextHash || previous.selectedVariant?.textHash);
    if (selectedTextHash && selectedTextHash !== sourcePair.previousAssistant.textHash) {
        return 'source-integrity-unavailable';
    }
    return null;
}

function snapshotEnvelopeReason({ snapshot = {}, state = {}, definition } = {}) {
    const envelope = snapshot.envelope || {};
    if (compact(envelope.packageId) !== definition.packageBinding.packageId) return 'snapshot-package-mismatch';
    if (compact(envelope.packageVersion) !== definition.packageBinding.packageVersion) {
        return 'snapshot-package-version-mismatch';
    }
    const expectedMissionId = compact(state?.mission?.activeMissionId || definition.packageBinding.sourceId);
    if (compact(envelope.activeMissionId) !== expectedMissionId) return 'snapshot-mission-mismatch';
    const expectedSaveId = compact(state?.campaignChatBinding?.saveId);
    if (!expectedSaveId || compact(envelope.saveId) !== expectedSaveId) return 'snapshot-branch-mismatch';
    const expectedChatId = compact(state?.campaignChatBinding?.chatId);
    if (expectedChatId && compact(envelope.chatId) !== expectedChatId) return 'snapshot-chat-mismatch';
    const expectedCampaignId = compact(state?.campaign?.id);
    if (expectedCampaignId && compact(envelope.campaignId) !== expectedCampaignId) return 'snapshot-campaign-mismatch';
    return null;
}

function baseContributionId(branchId, source) {
    return `contribution.v1.${stableHash([
        branchId,
        source.messageId,
        source.selectedSwipeId || 'no-swipe',
        source.textHash,
    ].join('|'))}`;
}

function invalidatedContributionIds(campaignState = {}) {
    return new Set([
        ...(campaignState?.mission?.v1?.invalidatedSourceContributionIds || []),
        ...(campaignState?.mission?.v1History || [])
            .flatMap((archive) => archive?.state?.invalidatedSourceContributionIds || []),
        ...(campaignState?.storySettlement?.receipts || [])
            .filter((receipt) => receipt?.disposition === 'invalidated')
            .flatMap((receipt) => receipt?.sourceContributionIds || []),
    ]);
}

function activeContributionId(campaignState, branchId, source) {
    const baseId = baseContributionId(branchId, source);
    const invalidated = invalidatedContributionIds(campaignState);
    let epoch = 0;
    let id = baseId;
    while (invalidated.has(id)) {
        epoch += 1;
        id = `${baseId}.r${epoch}`;
    }
    return id;
}

function contributionLineageWasInvalidated(campaignState, branchId, source) {
    const baseId = baseContributionId(branchId, source);
    const messageId = compact(source?.messageId);
    const messageWasInvalidated = messageId && (campaignState?.storySettlement?.receipts || []).some((receipt) => (
        receipt.disposition === 'invalidated'
        && (receipt.sourceMessageIds || []).some((candidate) => compact(candidate) === messageId)
    ));
    return Boolean(messageWasInvalidated) || [...invalidatedContributionIds(campaignState)].some(
        (id) => id === baseId || id.startsWith(`${baseId}.r`),
    );
}

function contributionFor(branchId, role, source, acceptedAtRevision, id = baseContributionId(branchId, source)) {
    return {
        id,
        messageId: source.messageId,
        swipeId: source.selectedSwipeId,
        role,
        textHash: source.textHash,
        acceptedAtRevision,
    };
}

function sourceResolutionRecord(
    branchId,
    role,
    source,
    acceptedAtRevision,
    id,
    accepted = true,
) {
    const contribution = contributionFor(branchId, role, source, acceptedAtRevision, id);
    return {
        contributionId: contribution.id,
        messageId: contribution.messageId,
        branchId,
        accepted,
        selectedSwipeId: contribution.swipeId,
        textHash: contribution.textHash,
        role,
        acceptedAtRevision,
        responseId: compact(source.responseId) || null,
        directiveOwned: source.directiveOwned === true,
        dutyReportCustodyOwned: source.dutyReportCustodyOwned === true,
    };
}

function materializeDeterministicRuntimeEvidence({
    definition = {},
    missionState = {},
    campaignState = {},
    branchId = '',
    pacingReceipts = [],
    updatePacingAuthorization = true,
} = {}) {
    const permissions = scenePacingPermissions(definition,pacingReceipts,missionState);
    const pacingOutcomes = new Map((definition.objectives || [])
        .filter(objective=>updatePacingAuthorization && objective.scenePacing?.authorizationOutcomeId && missionState.objectives?.[objective.id]?.state !== 'terminal')
        .map(objective=>[objective.scenePacing.authorizationOutcomeId,{
            value:permissions.has(objective.id) ? 'authorized' : 'held',
            dependencies:scenePacingDependencies(definition,pacingReceipts,[objective.id],missionState),
            materiallyNewEvidence:permissions.has(objective.id) && Boolean(missionState.objectiveDecisions?.[objective.id]),
        }]));
    const eligible = (definition.evidencePolicies || [])
        .filter((policy) => (
            policy?.sourceRoles?.includes('runtime') && (
                policy?.claimType === 'worldFactEstablished' && !missionState.worldFacts?.includes(policy.targetId)
                || policy?.claimType === 'eventOccurred' && !missionState.events?.includes(policy.targetId)
                    && policy.targetId === definition.scenePacing?.activationEventId
                || policy?.claimType === 'outcomeObserved' && pacingOutcomes.has(policy.targetId)
                    && (missionState.outcomes?.[policy.targetId] ?? 'held') !== pacingOutcomes.get(policy.targetId).value
            )
        ))
        .filter((policy) => {
            const result = evaluateMissionPredicate(policy.when, missionStateContext(definition, missionState));
            return result.ok && result.value;
        })
        .sort((left, right) => left.id.localeCompare(right.id));
    const records = eligible.map((policy) => {
        const pacingAuthorization = pacingOutcomes.get(policy.targetId);
        const pacingDependencies = pacingAuthorization?.dependencies || [];
        const messageId = `runtime-policy:${definition.id}:${policy.id}`;
        const text = `Directive runtime policy ${policy.id} established ${policy.targetId}.`;
        const sourceInput = {
            messageId,
            selectedSwipeId: null,
            textHash: stableHash([branchId, definition.id, policy.id, policy.targetId,pacingAuthorization?.value || '',pacingAuthorization ? missionState.revision : '',...pacingDependencies].join('|')),
            text,
        };
        const contributionId = activeContributionId(campaignState, branchId, sourceInput);
        const source = sourceResolutionRecord(
            branchId,
            'runtime',
            sourceInput,
            missionState.revision,
            contributionId,
        );
        return {
            source,
            contribution: contributionFor(
                branchId,
                'runtime',
                sourceInput,
                missionState.revision,
                contributionId,
            ),
            observation: {
                contributionId,
                role: 'runtime',
                textHash: sourceInput.textHash,
                text: 'Deterministic runtime authority changed behind the scenes.',
            },
            claim: {
                claimId: `claim.runtime-policy.${stableHash([branchId, definition.id, policy.id,...(pacingAuthorization ? [sourceInput.textHash] : [])].join('|'))}`,
                policyId: policy.id,
                claimType: policy.claimType,
                targetId: policy.targetId,
                ...(pacingAuthorization ? {value:pacingAuthorization.value} : {}),
                ...(pacingAuthorization?.materiallyNewEvidence ? {materiallyNewEvidence:true} : {}),
                ...(pacingDependencies.length ? {pacingSourceContributionIds:pacingDependencies} : {}),
                sourceRef: {
                    messageId,
                    swipeId: null,
                    textHash: sourceInput.textHash,
                },
            },
        };
    });
    return {
        claims: records.map((record) => record.claim),
        sources: records.map((record) => record.source),
        contributions: records.map((record) => record.contribution),
        observations: records.map((record) => record.observation),
    };
}

function requiredDutyReportPolicyIds(definition = {}) {
    return new Set((definition.reportRoutes || [])
        .filter((route) => route?.deliveryRequirement === 'required')
        .map((route) => route.evidencePolicyId)
        .filter(Boolean));
}

function proposalWithDutyReportCustody({ definition, proposal, dutyReportResult } = {}) {
    const requiredPolicies = requiredDutyReportPolicyIds(definition);
    const deliveryPolicyId = dutyReportResult?.ok ? dutyReportResult.claim.policyId : null;
    let strippedRequiredClaimCount = 0;
    const claims = (proposal?.claims || []).filter((claim) => {
        if (deliveryPolicyId && claim.policyId === deliveryPolicyId) return false;
        if (requiredPolicies.has(claim.policyId)) {
            strippedRequiredClaimCount += 1;
            return false;
        }
        return true;
    });
    if (dutyReportResult?.ok) claims.push(dutyReportResult.claim);
    return {
        proposal: { ...structuredClone(proposal), claims },
        strippedRequiredClaimCount,
    };
}

function sourceMatchesRef(source, ref = {}) {
    return source.messageId === ref.messageId
        && (source.selectedSwipeId || null) === (ref.swipeId || null)
        && source.textHash === ref.textHash;
}

function settledContributionIds(campaignState = {}) {
    const ids = [];
    for (const episode of campaignState?.storySettlement?.episodes || []) {
        for (const contribution of episode.contributions || []) {
            if (contribution?.id) ids.push(contribution.id);
        }
    }
    for (const receipt of campaignState?.storySettlement?.receipts || []) {
        for (const id of receipt.sourceContributionIds || []) {
            if (id) ids.push(id);
        }
    }
    return new Set(ids);
}

function settledContributionMatchesSource(campaignState = {}, source = {}, role = 'user') {
    const settled = settledContributionIds(campaignState);
    const invalidated = invalidatedContributionIds(campaignState);
    return (campaignState?.storySettlement?.episodes || []).some((episode) => (
        (episode.contributions || []).some((contribution) => (
            settled.has(contribution?.id)
            && !invalidated.has(contribution.id)
            && contribution.role === role
            && compact(contribution.messageId) === compact(source.messageId)
            && compact(contribution.swipeId) === compact(source.selectedSwipeId)
            && compact(contribution.textHash) === compact(source.textHash)
        ))
    ));
}

function contributionIdsForHostMessage(campaignState = {}, hostMessageId = '') {
    const target = compact(hostMessageId);
    if (!target) return [];
    const ids = [];
    for (const entry of campaignState?.mission?.v1?.evidenceLog || []) {
        if (sourceMessageMatchesHostMessage(entry?.sourceRef?.messageId, target) && entry?.sourceContributionId) {
            ids.push(entry.sourceContributionId);
        }
    }
    for (const archive of campaignState?.mission?.v1History || []) {
        for (const entry of archive?.state?.evidenceLog || []) {
            if (sourceMessageMatchesHostMessage(entry?.sourceRef?.messageId, target) && entry?.sourceContributionId) {
                ids.push(entry.sourceContributionId);
            }
        }
    }
    for (const episode of campaignState?.storySettlement?.episodes || []) {
        for (const contribution of episode.contributions || []) {
            if (sourceMessageMatchesHostMessage(contribution?.messageId, target) && contribution?.id) {
                ids.push(contribution.id);
            }
        }
    }
    for (const receipt of campaignState?.storySettlement?.receipts || []) {
        for (const [index, messageId] of (receipt.sourceMessageIds || []).entries()) {
            if (sourceMessageMatchesHostMessage(messageId, target) && receipt.sourceContributionIds?.[index]) {
                ids.push(receipt.sourceContributionIds[index]);
            }
        }
    }
    const invalidated = invalidatedContributionIds(campaignState);
    return [...new Set(ids)].filter((id) => !invalidated.has(id));
}

function errorReasonCode(error) {
    if (error?.code === 'DIRECTIVE_V1_STATE_REVISION_CONFLICT'
        || error?.code === 'DIRECTIVE_STATE_REVISION_CONFLICT') return 'state-revision-conflict';
    if (error?.code === 'DIRECTIVE_MISSION_EVIDENCE_STALE') return 'mission-revision-conflict';
    if (error?.code === 'DIRECTIVE_MISSION_DEFINITION_MISMATCH') return 'definition-mismatch';
    if (error?.code === 'DIRECTIVE_MISSION_RECONSTRUCTION_SEQUENCE_INVALID') {
        return 'evidence-sequence-invalid';
    }
    if (error?.code === 'DIRECTIVE_MISSION_EVIDENCE_REJECTED') return 'evidence-rejected';
    if (error?.code === 'DIRECTIVE_MISSION_JOURNEY_INVALID') return 'mission-journey-invalid';
    if (error?.code === 'DIRECTIVE_EPISODE_REVIEW_STALE') return 'episode-review-stale';
    if (error?.code === 'DIRECTIVE_EPISODE_REVIEW_INVALID') return 'episode-review-invalid';
    if (error?.code === 'DIRECTIVE_V1_STATE_PERSISTENCE_FAILED') return 'persistence-failed';
    if (error?.code === 'DIRECTIVE_V1_STATE_PERSISTENCE_CONFLICT') return 'persistence-rollback-conflict';
    return 'settlement-failed';
}

function episodeReviewPreflightReason({ campaignState = {}, definition } = {}) {
    const branchId = compact(campaignState?.campaignChatBinding?.saveId);
    if (!branchId) return 'active-branch-unavailable';
    const missionState = campaignState?.mission?.v1;
    if (!missionState) return 'mission-state-unavailable';
    if (missionState.branchId !== branchId) return 'mission-branch-mismatch';
    if (campaignState?.storySettlement?.branchId !== branchId) return 'story-branch-mismatch';
    const activePackage = campaignState?.activeCampaignPackage;
    if (!activePackage
        || activePackage.packageId !== definition?.packageBinding?.packageId
        || activePackage.packageVersion !== definition?.packageBinding?.packageVersion) {
        return 'active-package-mismatch';
    }
    try {
        resolveV1MissionState({ campaignState, definition, branchId });
    } catch (error) {
        return errorReasonCode(error);
    }
    return null;
}

function safeEpisodeDiagnostics(diagnostics = {}) {
    return {
        providerId: compact(diagnostics?.providerId) || null,
        model: compact(diagnostics?.model) || null,
        latencyMs: Number.isFinite(diagnostics?.latencyMs) ? diagnostics.latencyMs : null,
        errorCount: Number.isInteger(diagnostics?.errorCount) ? diagnostics.errorCount : null,
        timeoutMs: Number.isInteger(diagnostics?.timeoutMs) ? diagnostics.timeoutMs : null,
    };
}

export function buildV1RuntimePlayerProjection({ campaignState = {}, runtimeAssets = {} } = {}) {
    const resolved = resolveActiveV1MissionDefinition({ campaignState, runtimeAssets });
    if (!resolved.ok) return resolved;
    try {
        return {
            ok: true,
            attempted: false,
            status: 'available',
            reasonCode: null,
            definitionId: resolved.definition.id,
            definitionVersion: resolved.definition.version,
            projection: createV1PlayerProjection({
                campaignState,
                runtimeAssets,
                definition: resolved.definition,
            }),
        };
    } catch (error) {
        const reasonCode = error?.code === 'DIRECTIVE_V1_PROJECTION_BRANCH_MISMATCH'
            ? 'projection-branch-mismatch'
            : (error?.code === 'DIRECTIVE_V1_PROJECTION_DEFINITION_MISMATCH'
                ? 'projection-definition-mismatch'
                : (error?.code === 'DIRECTIVE_V1_PROJECTION_STATE_INVALID'
                    ? 'projection-state-invalid'
                    : 'projection-unavailable'));
        return unavailable(reasonCode);
    }
}

const NARRATION_GENERATION_TYPES = new Set(['normal', 'continue', 'swipe', 'regenerate']);

function narrationGenerationType(value) {
    const normalized = compact(value || 'normal').toLowerCase();
    if (!NARRATION_GENERATION_TYPES.has(normalized)) {
        throw new TypeError('narration-generation-type-invalid');
    }
    return normalized;
}

export function createNarrationGenerationTargetKey({ snapshot = {}, generationType = 'normal' } = {}) {
    const type = narrationGenerationType(generationType);
    const playerMessageId = compact(snapshot?.source?.currentPlayer?.hostMessageId);
    const sourceRangeHash = compact(snapshot?.source?.sourceRangeHash);
    if (!playerMessageId || !sourceRangeHash) throw new TypeError('narration-generation-target-invalid');
    return `${type}:${playerMessageId}:${sourceRangeHash}`;
}

export async function createNarrationDirectionReuseKey({
    campaignState,
    runtimeAssets = {},
    snapshot = {},
    generationType = 'normal',
    providerFingerprints = {},
} = {}) {
    const acceptedState = structuredClone(campaignState || {});
    delete acceptedState.stateCustody;
    if (acceptedState.storySettlement) {
        delete acceptedState.storySettlement.directorReceipts;
        delete acceptedState.storySettlement.pendingDossiers;
    }
    const resolved = resolveActiveV1MissionDefinition({ campaignState, runtimeAssets });
    const reuseSource = (source = {}) => ({
        hostMessageId: compact(source.hostMessageId || source.messageId),
        selectedSwipeId: compact(
            source.selectedVariant?.selectedSwipeId ?? source.selectedSwipeId ?? source.swipeId,
        ) || null,
        textHash: compact(source.textHash || source.selectedVariant?.textHash),
    });
    return `direction-reuse.${await sha256Json({
        contract: 'directive.narrationDirectionReuse.v1',
        directorRequestContract: 'directive.storyDirectorRequest.v1',
        instructionContract: 'directive.directorInstruction.v1',
        generationType: narrationGenerationType(generationType),
        source: {
            envelope: {
                campaignId: compact(campaignState?.campaign?.id),
                saveId: compact(campaignState?.campaignChatBinding?.saveId),
                chatId: compact(campaignState?.campaignChatBinding?.chatId),
                packageId: compact(campaignState?.activeCampaignPackage?.packageId),
                packageVersion: compact(campaignState?.activeCampaignPackage?.packageVersion),
                activeMissionId: compact(campaignState?.mission?.activeMissionId),
            },
            sourceRangeHash: compact(snapshot?.source?.sourceRangeHash),
            previousAssistant: reuseSource(snapshot?.source?.previousAssistant),
            currentPlayer: reuseSource(snapshot?.source?.currentPlayer),
        },
        activeDefinition: resolved.ok ? resolved.definition : null,
        shipMechanics: runtimeAssets?.shipDataset?.mechanics || {},
        acceptedState,
        providerFingerprints: providerFingerprints || {},
    })}`;
}

function captureFailure(reasonCode) {
    const error = new TypeError(reasonCode);
    error.code = reasonCode;
    return error;
}

export function captureAcceptedPairAnalysis({
    campaignState,
    runtimeAssets = {},
    snapshot = {},
    generationType = 'normal',
    focused = false,
    analysisLimits = {},
} = {}) {
    const limits = normalizeAnalysisLimits(analysisLimits);
    const resolved = resolveActiveV1MissionDefinition({ campaignState, runtimeAssets });
    if (!resolved.ok) throw captureFailure(resolved.reasonCode || 'definition-unavailable');
    const { definition } = resolved;
    const integrityReason = snapshotIntegrityReason(snapshot);
    if (integrityReason) throw captureFailure(integrityReason);
    const envelopeReason = snapshotEnvelopeReason({ snapshot, state: campaignState, definition });
    if (envelopeReason) throw captureFailure(envelopeReason);
    const branchId = compact(snapshot.envelope.saveId);
    let missionState;
    try {
        missionState = resolveV1MissionState({ campaignState, definition, branchId });
    } catch (error) {
        throw captureFailure(errorReasonCode(error));
    }
    const sourcePair = sourcePairFromSnapshot(snapshot);
    const assistantContributionId = activeContributionId(
        campaignState,
        branchId,
        sourcePair.previousAssistant,
    );
    const playerContributionId = activeContributionId(
        campaignState,
        branchId,
        sourcePair.currentPlayer,
    );
    const assistantSource = sourceResolutionRecord(
        branchId,
        'assistant',
        sourcePair.previousAssistant,
        missionState.revision,
        assistantContributionId,
    );
    const playerSource = sourceResolutionRecord(
        branchId,
        'user',
        sourcePair.currentPlayer,
        missionState.revision,
        playerContributionId,
    );
    const alreadySettled = settledContributionIds(campaignState);
    const currentSources = [
        { id: assistantContributionId, role: 'assistant', source: sourcePair.previousAssistant },
        { id: playerContributionId, role: 'user', source: sourcePair.currentPlayer },
    ];
    const pairSourcesSettled = currentSources.every((source) => (
        alreadySettled.has(source.id)
        || settledContributionMatchesSource(campaignState, source.source, source.role)
    ));
    const settledPairReceipt = (campaignState?.storySettlement?.acceptedPairReceipts || []).find(
        (receipt) => v1AcceptedPairReceiptMatches(receipt, {
            branchId,
            sourceRangeHash: snapshot?.source?.sourceRangeHash,
            sourcePair,
        }),
    );
    const missionCandidatePacket = createMissionInterpretationCandidatePacket({ definition, state: missionState });
    const candidatePacket = {
        ...missionCandidatePacket,
        scenePacing: createScenePacingContext({
            definition,
            state: missionState,
            receipts: campaignState.storySettlement?.acceptedPairReceipts || [],
        }),
        candidates: [
            ...missionCandidatePacket.candidates,
            ...createShipWorkInterpretationCandidates({
                shipDataset: runtimeAssets?.shipDataset || {},
                storySettlement: campaignState?.storySettlement || {},
            }),
            ...(runtimeAssets?.cohesionCatalog
                ? createCohesionInterpretationCandidates({
                    catalog: runtimeAssets.cohesionCatalog,
                    shipDataset: runtimeAssets?.shipDataset || {},
                    storySettlement: campaignState?.storySettlement || {},
                    branchId,
                })
                : []),
        ].sort((left, right) => left.id.localeCompare(right.id)),
    };
    const peopleContext = createPeopleInterpretationContext({
        crewDataset: runtimeAssets?.crewDataset || {},
        storySettlement: campaignState?.storySettlement || {},
    });
    const timeContext = timeContextFromSnapshot(campaignState, snapshot, runtimeAssets);
    const interpreterInput = { candidatePacket, sourcePair, timeContext, peopleContext, limits };
    const interpreterRequest = createMissionAcceptedPairInterpretationPrompt(interpreterInput);
    let episodeReview = null;
    const reviewToken = createPendingEpisodeReviewToken(campaignState?.storySettlement);
    if (reviewToken) {
        try {
            episodeReview = createEpisodeEvaluationRequest({ settlement: campaignState.storySettlement, limits });
        } catch {
            throw captureFailure('episode-review-invalid');
        }
    }
    const authoredContext = createDirectorAuthoredContext({
        limits,
        definition,
        missionState,
        shipMechanics: runtimeAssets?.shipDataset?.mechanics || {},
        pendingTransition: null,
        pendingDutyReport: null,
    });
    const exchangeText = `${sourcePair.previousAssistant.text} ${sourcePair.currentPlayer.text}`.toLowerCase();
    const currentEpisode = (campaignState.storySettlement.episodes || []).find(episode => episode.id === campaignState.storySettlement.activeEpisode);
    const referenceCandidates = [
        ...(currentEpisode?.references?.locationIds || []).map(id => ({ id, name: id, kind: 'location', relevant: true })),
        ...peopleContext.knownPeople.map(person => ({ id: person.id, name: person.name, kind: 'person', relevant: exchangeText.includes(person.name.toLowerCase())
            || person.name.split(/\s+/).some(part => part.length >= 3 && exchangeText.includes(part.toLowerCase())) })),
    ];
    authoredContext.referenceIds = [...new Set(referenceCandidates.filter(item => /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(item.id))
        .sort((a, b) => Number(b.relevant) - Number(a.relevant) || a.id.localeCompare(b.id)).map(item => item.id))].slice(0, limits.storyReferenceCount);
    authoredContext.references = authoredContext.referenceIds.map(id => {
        const reference = referenceCandidates.find(item => item.id === id);
        return { id, name: reference.name.slice(0, limits.storyReferenceNameCharacters), kind: reference.kind };
    });
    authoredContext.temporalContext = {
        elapsedSeconds: timeContext.current.elapsedSeconds,
        secondOfDay: timeContext.current.secondOfDay,
    };
    const continuity = projectDirectorContinuity({
        limits,
        events: campaignState?.storySettlement?.continuityEvents || [],
        missionId: definition.id,
        referencedIds: referenceCandidates.filter(item => item.relevant && authoredContext.referenceIds.includes(item.id)).map(item => item.id),
        queryText: `${sourcePair.previousAssistant.text} ${sourcePair.currentPlayer.text}`,
        currentRevision: campaignState.storySettlement.revision,
        currentElapsedSeconds: timeContext.current.elapsedSeconds,
    });
    const type = narrationGenerationType(generationType);
    const directorSourcePair = Object.fromEntries(
        ['previousAssistant', 'currentPlayer'].map((slot) => [slot, {
            messageId: sourcePair[slot].messageId,
            selectedSwipeId: sourcePair[slot].selectedSwipeId ?? null,
            textHash: sourcePair[slot].textHash,
            text: sourcePair[slot].text,
        }]),
    );
    const directorRequest = createStoryDirectorRequest({
        analysisLimits: limits,
        envelope: {
            campaignId: compact(snapshot.envelope.campaignId),
            saveId: branchId,
            chatId: compact(snapshot.envelope.chatId),
            packageId: compact(snapshot.envelope.packageId),
            packageVersion: compact(snapshot.envelope.packageVersion),
            branchId,
            baseRevision: campaignState.stateCustody.revision,
            missionId: definition.id,
            sourceRangeHash: compact(snapshot.source.sourceRangeHash),
            generationType: type,
        },
        sourcePair: directorSourcePair,
        authoredContext,
        continuity,
        currentScene: null,
        episodeReview: focused ? null : episodeReview,
    });
    return {
        campaignState: structuredClone(campaignState),
        definition,
        missionState,
        branchId,
        sourcePair,
        assistantContributionId,
        playerContributionId,
        assistantSource,
        playerSource,
        pairAlreadySettled: pairSourcesSettled || Boolean(settledPairReceipt),
        settledPairReceipt: settledPairReceipt ? structuredClone(settledPairReceipt) : null,
        interpreterInput,
        interpreterRequest,
        directorRequest,
        episodeReviewRequest: episodeReview,
        reviewToken,
        generationType: type,
        generationTargetKey: createNarrationGenerationTargetKey({ snapshot, generationType: type }),
        snapshot: structuredClone(snapshot),
        runtimeAssets,
    };
}

export async function prepareInterpretedPair({
    captured,
    interpreted,
    campaignState,
    prepare,
} = {}) {
    if (!captured || !interpreted?.ok || !campaignState || typeof prepare !== 'function') {
        throw new TypeError('interpreted-pair-preparation-invalid');
    }
    return prepare({
        captured,
        interpreted: structuredClone(interpreted),
        campaignState: structuredClone(campaignState),
    });
}

export function createV1MissionRuntime({
    getState,
    stateDeltaGateway,
    generationRouter = null,
    interpretAcceptedPair = null,
    prepareAcceptedPairTime = null,
    now = () => new Date().toISOString(),
    timeoutMs = MISSION_EVIDENCE_INTERPRETER_TIMEOUT_MS,
    evaluateEpisode = null,
    episodeReviewTimeoutMs = 8000,
    checkpointEveryContributions = 8,
    authorPeopleDossiers = null,
    peopleDossierTimeoutMs = 30000,
    turnProgress = null,
    directStory = null,
    analyzeContinuity = null,
    providerFingerprints = () => ({}),
} = {}) {
    if (typeof getState !== 'function') throw new TypeError('getState is required');
    if (typeof stateDeltaGateway?.revision !== 'function'
        || typeof stateDeltaGateway?.applyProposal !== 'function') {
        throw new TypeError('stateDeltaGateway with revision and applyProposal is required');
    }
    const interpreter = interpretAcceptedPair || createMissionAcceptedPairInterpreter({ generationRouter, timeoutMs });
    let cachedInterpretation = null;
    let cachedPreparedPeopleEvents = null;
    let directedAnalysis = null;
    const peopleDossierAuthor = authorPeopleDossiers || createPeopleDossierAuthor({
        generationRouter,
        timeoutMs: peopleDossierTimeoutMs,
    });
    const episodeEvaluator = evaluateEpisode || createEpisodeEvaluator({
        generationRouter,
        timeoutMs: episodeReviewTimeoutMs,
    });

    const mandatoryEpisodeEvaluator = evaluateEpisode || createEpisodeEvaluator({
        generationRouter, timeoutMs: 60000, mandatory: true, maxTokens: 4096,
    });

    function runProgress(stage, task, progressScope) {
        return typeof turnProgress?.run === 'function'
            ? turnProgress.run(stage, task, { scope: progressScope })
            : task({ onAttempt: null, onPhase: null });
    }

    function gatewayForProgressScope(progressScope) {
        if (!progressScope) return stateDeltaGateway;
        return {
            revision: () => stateDeltaGateway.revision(),
            applyProposal: (proposal, options = {}) => stateDeltaGateway.applyProposal(proposal, {
                ...options,
                progressScope,
            }),
            commit: (campaignState, delta, options = {}) => stateDeltaGateway.commit?.(
                campaignState,
                delta,
                { ...options, progressScope },
            ),
        };
    }

    function buildPlayerProjection({ runtimeAssets = {} } = {}) {
        return buildV1RuntimePlayerProjection({ campaignState: getState(), runtimeAssets });
    }

    async function adjustObjectiveProgress({
        runtimeAssets = {}, missionId, objectiveId, action, disposition, proposalId,
        expectedRevision, expectedRunId,
    } = {}) {
        const failure = (reasonCode, message) => ({
            ok: false, status: 'rejected', reasonCode, message, noChange: true,
        });
        const campaignState = getState();
        const resolved = resolveActiveV1MissionDefinition({ campaignState, runtimeAssets });
        if (!resolved.ok || resolved.definition.id !== missionId) {
            return failure('objective-scope-changed',
                'This mission is no longer current. Use a checkpoint to correct an earlier mission.');
        }
        const current = campaignState.mission.v1;
        const runId = campaignState.mission.v1Journey?.activeRunId
            || (current && current.branchId + ':' + current.definitionId);
        if (!current || expectedRevision !== current.revision || expectedRunId !== runId) {
            return failure('objective-stale',
                'Progress changed while this control was open. Review the current Mission card and try again.');
        }
        const baseRevision = stateDeltaGateway.revision();
        try {
            const adjusted = adjustMissionObjectiveProgress({
                definition: resolved.definition, state: current, objectiveId, action, disposition, proposalId,
            });
            const commandBearing = structuredClone(campaignState.commandBearing);
            const nextAwards = eligibleMissionCommandBearingAwards(resolved.definition, adjusted.state);
            const eligibleIds = new Set(nextAwards.map(award => award.id));
            const removed = (resolved.definition.commandBearingAwards || []).filter(award =>
                commandBearing.awards[award.id] && !eligibleIds.has(award.id));
            const debit = removed.filter(award => commandBearing.awards[award.id].credited).length;
            if (debit > commandBearing.balance) {
                return failure('objective-checkpoint-required',
                    'The Command Bearing earned from this result has already been spent. Restore a checkpoint from before that spend to correct this objective.');
            }
            commandBearing.balance -= debit;
            for (const award of removed) {
                if (commandBearing.awards[award.id].credited) delete commandBearing.awards[award.id];
            }
            let reconciledBearing = commandBearing;
            for (const award of nextAwards) {
                reconciledBearing = awardV1CommandBearing(reconciledBearing, {
                    awardId: award.id, sourceId: award.sourceObjectiveId, reason: award.reason, now,
                }).commandBearing;
            }
            const rejectedKeys = new Set(Object.values(adjusted.state.objectiveDecisions || {})
                .flatMap(decision => decision.rejectedEvidenceKeys || []));
            const rejectedEffectIds = new Set(current.evidenceLog
                .filter(entry => rejectedKeys.has(entry.evidenceKey))
                .map(entry => `effect.v1.${stableHash24([entry.claimId, entry.sourceContributionId].join('|'))}`));
            const effects = (campaignState.storySettlement?.episodes || [])
                .flatMap(episode => episode.effects || []);
            const removedEffects = new Set(effects.filter(effect => rejectedEffectIds.has(effect.id))
                .map(effect => effect.id));
            for (let pass = 0; pass <= effects.length; pass += 1) {
                const size = removedEffects.size;
                for (const effect of effects) {
                    if ((effect.dependencyEffectIds || []).some(id => removedEffects.has(id))) {
                        removedEffects.add(effect.id);
                    }
                }
                if (size === removedEffects.size) break;
            }
            const storySettlement = campaignState.storySettlement && removedEffects.size
                ? pruneStoryEffects(campaignState.storySettlement, {
                    effectIds: [...removedEffects],
                    summarizeEffects: () => 'The remaining established progress is retained; the player corrected an objective result.',
                })
                : campaignState.storySettlement;
            await stateDeltaGateway.applyProposal({
                operations: [
                    { op: 'set', path: 'mission.v1', value: adjusted.state },
                    { op: 'set', path: 'commandBearing', value: reconciledBearing },
                    ...(storySettlement ? [{ op: 'set', path: 'storySettlement', value: storySettlement }] : []),
                ],
                domains: ['mission', 'commandBearing', ...(storySettlement ? ['storySettlement'] : [])],
                baseRevision,
                source: 'v1ObjectiveProgress',
                reason: 'Committed player objective progress decision.',
                metadata: { missionId, objectiveId, action },
            });
            cachedInterpretation = null;
            return {
                ok: true, status: 'committed', missionId, objectiveId,
                revision: adjusted.state.revision, noChange: false,
            };
        } catch (error) {
            return failure(error.code || 'objective-adjustment-failed', error.code
                ? 'The change could not be saved. Review current progress and try again.'
                : error.message);
        }
    }

    function inspectPendingTransition({ runtimeAssets = {} } = {}) {
        return inspectV1MissionTransition({ campaignState: getState(), runtimeAssets });
    }

    function prepareTransitionNarration({ runtimeAssets = {} } = {}) {
        const campaignState = getState();
        if (!campaignState) return unavailable('campaign-state-unavailable');
        const resolved = resolveActiveV1MissionDefinition({campaignState,runtimeAssets});
        if (resolved.ok && campaignState.mission.v1.status === 'terminal' && createScenePacingContext({definition:resolved.definition,state:campaignState.mission.v1,
            receipts:campaignState.storySettlement?.acceptedPairReceipts || []})?.allowMissionDeparture === false) return unavailable('scene-still-open');
        const definitions = validDefinitionRecords(runtimeAssets).map((record) => record.definition);
        if (definitions.length === 0) return unavailable('definition-assets-missing');
        try {
            const packet = createMissionTransitionNarrationPacket({ campaignState, definitions });
            return {
                ok: true,
                attempted: false,
                status: 'ready',
                reasonCode: null,
                packet,
                request: createMissionTransitionNarrationRequest(packet),
                fallback: createMissionTransitionNarrationFallback(packet),
                committedRoots: [],
                noChange: true,
                diagnostics: {},
            };
        } catch (error) {
            const reasonCode = error?.code === 'DIRECTIVE_MISSION_TRANSITION_NARRATION_UNAVAILABLE'
                ? error.reasonCode
                : 'transition-narration-packet-invalid';
            return unavailable(reasonCode);
        }
    }

    async function activatePendingTransition({ runtimeAssets = {} } = {}) {
        const inspection = inspectV1MissionTransition({ campaignState: getState(), runtimeAssets });
        if (!inspection.ok) return inspection;
        if (inspection.status === 'none') {
            return {
                ...inspection,
                status: 'no-pending-transition',
            };
        }
        if (inspection.status === 'concluded') {
            return {
                ...inspection,
                status: 'campaign-already-concluded',
            };
        }
        if (inspection.status !== 'ready') {
            return {
                ...inspection,
                ok: false,
            };
        }
        const gatewayBaseRevision = stateDeltaGateway.revision();
        const campaignState = getState();
        const resolved = resolveActiveV1MissionDefinition({ campaignState, runtimeAssets });
        if (!resolved.ok) return resolved;
        const definitions = validDefinitionRecords(runtimeAssets).map((record) => record.definition);
        if (createScenePacingContext({definition:resolved.definition,state:campaignState.mission.v1,
            receipts:campaignState.storySettlement?.acceptedPairReceipts || []})?.allowMissionDeparture === false) return unavailable('scene-still-open');
        if (inspection.targetPhaseId) {
            try {
                const receipt = createCampaignConclusionReceipt({
                    campaignState,
                    sourceDefinition: resolved.definition,
                    packageData: runtimeAssets.packageData,
                    completedAt: now(),
                });
                await stateDeltaGateway.applyProposal({
                    operations: [{ op: 'set', path: 'mission.v1Conclusion', value: receipt }],
                    domains: ['mission'],
                    baseRevision: gatewayBaseRevision,
                    source: 'v1CampaignConclusion',
                    reason: 'Committed an authored V1 campaign conclusion from exact terminal mission authority.',
                    metadata: {
                        conclusionId: receipt.id,
                        phaseId: receipt.phaseId,
                        endConditionId: receipt.endConditionId,
                        sourceRunId: receipt.source.runId,
                        sourceDefinitionId: receipt.source.definitionId,
                    },
                });
                return {
                    ok: true,
                    attempted: true,
                    status: 'concluded',
                    reasonCode: null,
                    activatable: false,
                    sourceDefinitionId: resolved.definition.id,
                    sourceRunId: receipt.source.runId,
                    targetDefinitionId: null,
                    targetPhaseId: receipt.phaseId,
                    endConditionId: receipt.endConditionId,
                    conclusionId: receipt.id,
                    committedRoots: ['mission'],
                    noChange: false,
                    diagnostics: {},
                };
            } catch (error) {
                const reasonCode = errorReasonCode(error);
                if (reasonCode === 'persistence-rollback-conflict') {
                    return {
                        ok: false,
                        attempted: true,
                        status: 'indeterminate',
                        reasonCode,
                        activatable: false,
                        sourceDefinitionId: resolved.definition.id,
                        sourceRunId: inspection.sourceRunId,
                        targetDefinitionId: null,
                        targetPhaseId: inspection.targetPhaseId,
                        endConditionId: inspection.endConditionId,
                        conclusionId: null,
                        committedRoots: ['mission'],
                        noChange: false,
                        requiresOperatorReview: true,
                        retrySafe: false,
                        diagnostics: {},
                    };
                }
                return {
                    ...unavailable(reasonCode, {}, { attempted: true }),
                    activatable: false,
                    sourceDefinitionId: resolved.definition.id,
                    sourceRunId: inspection.sourceRunId,
                    targetDefinitionId: null,
                    targetPhaseId: inspection.targetPhaseId,
                    endConditionId: inspection.endConditionId,
                    conclusionId: null,
                };
            }
        }
        const spine = createV1StateSpine({
            getAnalysisLimits: () => generationRouter?.getAnalysisLimits?.() || {},
            getState,
            stateDeltaGateway,
            resolveSourceRef: () => null,
            now,
            checkpointEveryContributions,
        });
        try {
            const activated = await spine.activatePendingTransition({
                definition: resolved.definition,
                missionDefinitions: definitions,
                gatewayBaseRevision,
            });
            return {
                ok: true,
                attempted: true,
                status: activated.transitionActivation.status,
                reasonCode: activated.transitionActivation.reasonCode,
                activatable: false,
                sourceDefinitionId: resolved.definition.id,
                sourceRunId: activated.transitionActivation.sourceRunId,
                targetDefinitionId: activated.transitionActivation.targetDefinitionId,
                targetRunId: activated.transitionActivation.targetRunId,
                committedRoots: activated.noChange ? [] : ['mission'],
                noChange: activated.noChange,
                diagnostics: {},
            };
        } catch (error) {
            const reasonCode = errorReasonCode(error);
            if (reasonCode === 'persistence-rollback-conflict') {
                return {
                    ok: false,
                    attempted: true,
                    status: 'indeterminate',
                    reasonCode,
                    activatable: false,
                    sourceDefinitionId: resolved.definition.id,
                    sourceRunId: inspection.sourceRunId,
                    targetDefinitionId: inspection.targetDefinitionId,
                    targetRunId: null,
                    committedRoots: ['mission'],
                    noChange: false,
                    requiresOperatorReview: true,
                    retrySafe: false,
                    diagnostics: {},
                };
            }
            return {
                ...unavailable(reasonCode, {}, { attempted: true }),
                activatable: false,
                sourceDefinitionId: resolved.definition.id,
                sourceRunId: inspection.sourceRunId,
                targetDefinitionId: inspection.targetDefinitionId,
                targetRunId: null,
            };
        }
    }

    function preparePendingDutyReport({
        runtimeAssets = {},
        availableActors = [],
        responseId = null,
        sourceTransactionId = null,
    } = {}) {
        const campaignState = getState();
        const resolved = resolveActiveV1MissionDefinition({ campaignState, runtimeAssets });
        if (!resolved.ok) return resolved;
        const branchId = compact(campaignState?.campaignChatBinding?.saveId);
        if (!branchId) return unavailable('active-branch-unavailable');
        const normalizedResponseId = compact(responseId);
        const normalizedTransactionId = compact(sourceTransactionId);
        if (!normalizedResponseId || normalizedResponseId.length > 300
            || !normalizedTransactionId || normalizedTransactionId.length > 300) {
            return unavailable('response-identity-invalid');
        }
        let missionState;
        try {
            missionState = resolveV1MissionState({
                campaignState,
                definition: resolved.definition,
                branchId,
            });
        } catch (error) {
            return unavailable(errorReasonCode(error));
        }
        if (!validateMissionStateAuthority({ definition: resolved.definition, state: missionState }).ok) {
            return unavailable('mission-state-invalid');
        }
        const deliveredReportIds = deliveredDutyReportIds({
            definition: resolved.definition,
            state: missionState,
        });
        const packet = selectPendingDutyReport({
            definition: resolved.definition,
            state: missionState,
            availableActors,
            deliveredReportIds,
            isReportAllowed: route => sceneAllowsReport({definition:resolved.definition,state:missionState,receipts:campaignState.storySettlement?.acceptedPairReceipts || [],route}),
        });
        if (!packet) {
            return {
                ok: true,
                attempted: false,
                status: 'no-pending-report',
                reasonCode: null,
                definitionId: resolved.definition.id,
                definitionVersion: resolved.definition.version,
                packet: null,
                segment: null,
                manifestInput: null,
                diagnostics: { deliveredReportCount: deliveredReportIds.length },
                committedRoots: [],
                noChange: true,
            };
        }
        let segment;
        try {
            segment = createDutyReportVisibleSegment(packet);
        } catch {
            return unavailable('duty-report-segment-invalid');
        }
        return {
            ok: true,
            attempted: false,
            status: 'ready',
            reasonCode: null,
            definitionId: resolved.definition.id,
            definitionVersion: resolved.definition.version,
            packet,
            segment,
            manifestInput: {
                branchId,
                responseId: normalizedResponseId,
                sourceTransactionId: normalizedTransactionId,
                reportId: packet.reportId,
                factId: packet.factId,
                reporterId: packet.reporterId,
                policyId: packet.authorizedClaim.policyId,
            },
            diagnostics: { deliveredReportCount: deliveredReportIds.length },
            committedRoots: [],
            noChange: true,
        };
    }

    function eligibleDirectionTargets(campaignState, captured) {
        const resolved = resolveActiveV1MissionDefinition({ campaignState, runtimeAssets: captured.runtimeAssets });
        if (!resolved.ok) throw captureFailure(resolved.reasonCode || 'definition-unavailable');
        const missionState = resolveV1MissionState({
            campaignState,
            definition: resolved.definition,
            branchId: captured.branchId,
        });
        const authoredContext = createDirectorAuthoredContext({
            definition: resolved.definition,
            missionState,
            shipMechanics: captured.runtimeAssets?.shipDataset?.mechanics || {},
            pendingTransition: null,
            pendingDutyReport: null,
        });
        const targets = new Map();
        for (const opportunity of authoredContext.opportunities) {
            const objective = missionState.objectives?.[opportunity.id];
            const isObjective = opportunity.kind === 'objective';
            if (isObjective && (
                objective?.visibility !== 'visible'
                || !new Set(['available', 'active']).has(objective?.state)
            )) continue;
            const conditionIds = opportunity.conditionIds || [];
            if (conditionIds.length > 0 && opportunity.permissionFlags?.completionAuthorized !== true) continue;
            targets.set(opportunity.id, {
                id: opportunity.id,
                playerSafeText: opportunity.playerSafeText,
                conditions: new Set(conditionIds),
                dependencyIds: [opportunity.id, ...conditionIds],
            });
        }
        const events = campaignState.storySettlement?.continuityEvents || [];
        for (const thread of projectContinuityThreads(events)) {
            if (!new Set(['active', 'deferred', 'dormant']).has(thread.status)) continue;
            targets.set(thread.id, {
                id: thread.id,
                playerSafeText: thread.title,
                conditions: new Set(),
                dependencyIds: [thread.id, ...(thread.sourceContributionIds || [])],
            });
        }
        return targets;
    }

    async function settleAcceptedPairLegacy({
        runtimeAssets = {},
        snapshot = {},
        hardBoundary = null,
        acceptedCommandBearingEdge = null,
        signal = null,
        allowModelCall = true,
        progressScope = null,
        preparedInterpretation = null,
        preparedCampaignState = null,
        prepareOnly = false,
        queuePeopleDossiers = false,
    } = {}) {
        let campaignState = preparedCampaignState || getState();
        const resolved = resolveActiveV1MissionDefinition({ campaignState, runtimeAssets });
        if (!resolved.ok) return resolved;
        const { definition } = resolved;
        const integrityReason = snapshotIntegrityReason(snapshot);
        if (integrityReason) return unavailable(integrityReason);
        const envelopeReason = snapshotEnvelopeReason({ snapshot, state: campaignState, definition });
        if (envelopeReason) return unavailable(envelopeReason);

        const branchId = compact(snapshot.envelope.saveId);
        if (hardBoundary !== null) {
            const boundaryResult = validateEpisodeHardBoundary(hardBoundary, { branchId });
            if (!boundaryResult.ok) return unavailable('hard-boundary-invalid');
        }
        let missionState;
        try {
            missionState = resolveV1MissionState({ campaignState, definition, branchId });
        } catch (error) {
            return unavailable(errorReasonCode(error));
        }
        const sourcePair = sourcePairFromSnapshot(snapshot);
        const interpretationKey = [
            branchId,
            definition.id,
            definition.version,
            missionState.revision,
            compact(snapshot?.source?.sourceRangeHash),
            compact(sourcePair.previousAssistant?.textHash),
            compact(sourcePair.currentPlayer?.textHash),
        ].join('|');
        const assistantContributionId = activeContributionId(
            campaignState,
            branchId,
            sourcePair.previousAssistant,
        );
        const playerContributionId = activeContributionId(
            campaignState,
            branchId,
            sourcePair.currentPlayer,
        );
        const assistantSource = sourceResolutionRecord(
            branchId,
            'assistant',
            sourcePair.previousAssistant,
            missionState.revision,
            assistantContributionId,
        );
        const playerSource = sourceResolutionRecord(
            branchId,
            'user',
            sourcePair.currentPlayer,
            missionState.revision,
            playerContributionId,
        );
        const alreadySettled = settledContributionIds(campaignState);
        const currentSources = [
            {
                id: assistantSource.contributionId,
                role: 'assistant',
                source: sourcePair.previousAssistant,
                lineageInvalidated: contributionLineageWasInvalidated(
                    campaignState,
                    branchId,
                    sourcePair.previousAssistant,
                ),
            },
            {
                id: playerSource.contributionId,
                role: 'user',
                source: sourcePair.currentPlayer,
                lineageInvalidated: contributionLineageWasInvalidated(
                    campaignState,
                    branchId,
                    sourcePair.currentPlayer,
                ),
            },
        ];
        const pairSourcesSettled = currentSources.every((source) => (
            alreadySettled.has(source.id)
            || settledContributionMatchesSource(campaignState, source.source, source.role)
        ));
        const pairReceiptSettled = (campaignState?.storySettlement?.acceptedPairReceipts || []).some(
            (receipt) => v1AcceptedPairReceiptMatches(receipt, {
                branchId,
                sourceRangeHash: snapshot?.source?.sourceRangeHash,
                sourcePair,
            }),
        );
        const pairAlreadySettled = pairSourcesSettled || pairReceiptSettled;
        if (pairAlreadySettled) {
            if (cachedInterpretation?.key === interpretationKey) cachedInterpretation = null;
            if (cachedPreparedPeopleEvents?.key === interpretationKey) cachedPreparedPeopleEvents = null;
            return {
                ok: true,
                attempted: false,
                status: 'already-settled',
                reasonCode: null,
                definitionId: definition.id,
                definitionVersion: definition.version,
                committedRoots: [],
                noChange: true,
                transitionCommitted: false,
                reviewToken: createPendingEpisodeReviewToken(campaignState?.storySettlement),
                diagnostics: {},
            };
        }

        const interpretationBaseRevision = stateDeltaGateway.revision();
        const missionCandidatePacket = createMissionInterpretationCandidatePacket({ definition, state: missionState });
        const candidatePacket = {
            ...missionCandidatePacket,
            scenePacing: createScenePacingContext({definition,state:missionState,receipts:campaignState.storySettlement?.acceptedPairReceipts || []}),
            candidates: [
                ...missionCandidatePacket.candidates,
                ...createShipWorkInterpretationCandidates({
                    shipDataset: runtimeAssets?.shipDataset || {},
                    storySettlement: campaignState?.storySettlement || {},
                }),
                ...(runtimeAssets?.cohesionCatalog
                    ? createCohesionInterpretationCandidates({
                        catalog: runtimeAssets.cohesionCatalog,
                        shipDataset: runtimeAssets?.shipDataset || {},
                        storySettlement: campaignState?.storySettlement || {},
                        branchId,
                    })
                    : []),
            ].sort((left, right) => left.id.localeCompare(right.id)),
        };
        const peopleContext = createPeopleInterpretationContext({
            crewDataset: runtimeAssets?.crewDataset || {},
            storySettlement: campaignState?.storySettlement || {},
        });
        let interpreted;
        const interpretationReused = Boolean(preparedInterpretation)
            || cachedInterpretation?.key === interpretationKey;
        if (preparedInterpretation) {
            interpreted = structuredClone(preparedInterpretation);
        } else if (interpretationReused) {
            interpreted = structuredClone(cachedInterpretation.value);
        } else {
            if (allowModelCall !== true) {
                return unavailable('model-call-budget-exhausted', {
                    candidateCount: candidatePacket.candidates.length,
                }, { attempted: false });
            }
            try {
                interpreted = await runProgress('reviewing-events', ({ onAttempt, onPhase }) => interpreter({
                    candidatePacket,
                    sourcePair,
                    timeContext: timeContextFromSnapshot(campaignState, snapshot, runtimeAssets),
                    peopleContext,
                    signal,
                    onAttempt,
                    onPhase,
                }), progressScope);
            } catch {
                return unavailable('interpretation-threw', {}, { attempted: true });
            }
        }
        if (!interpreted?.ok) {
            return unavailable(interpreted?.reasonCode || 'interpretation-unavailable', {
                status: interpreted?.status || 'unavailable',
                candidateCount: interpreted?.diagnostics?.candidateCount ?? candidatePacket.candidates.length,
                errorCount: interpreted?.diagnostics?.errorCount ?? null,
                latencyMs: interpreted?.diagnostics?.latencyMs ?? null,
            }, { attempted: true });
        }
        if (signal?.aborted) return unavailable('provider-aborted', {}, {attempted:true});
        if (stateDeltaGateway.revision() !== interpretationBaseRevision) {
            return unavailable('state-revision-conflict', {}, { attempted: true });
        }
        cachedInterpretation = {
            key: interpretationKey,
            value: structuredClone(interpreted),
        };

        let time = null;
        if (typeof prepareAcceptedPairTime === 'function') {
            try {
                time = await prepareAcceptedPairTime({
                    campaignState,
                    snapshot,
                    timeDecision: interpreted.interpretation?.time,
                    runtimeAssets,
                });
            } catch {
                return unavailable('time-custody-threw', {}, { attempted: true });
            }
            if (!time?.ok) {
                // Semantic timing failures need a fresh interpretation on manual
                // retry. Persistence failures below still reuse a valid result.
                cachedInterpretation = null;
                return unavailable(time?.reasonCode || 'time-custody-unavailable', {}, { attempted: true });
            }
        }
        const gatewayBaseRevision = stateDeltaGateway.revision();
        const plannedCampaignState = time?.patch
            ? { ...campaignState, ...structuredClone(time.patch) }
            : campaignState;

        const assistantAccepted = interpreted.interpretation?.assistantAcceptance === 'accepted';
        let scenePacing = null;
        if (candidatePacket.scenePacing) {
            try {
                scenePacing = settleScenePacing({definition,state:missionState,
                    receipts:campaignState.storySettlement?.acceptedPairReceipts || [],sourcePair,
                    observation:interpreted.interpretation?.scenePacing,assistantAccepted});
            } catch {
                cachedInterpretation = null;
                return unavailable('scene-pacing-invalid', {}, {attempted:true});
            }
        }
        assistantSource.accepted = assistantAccepted;
        let peopleEvents = [];
        let introductions = [];
        let peopleDossierAttempted = false;
        let peopleDossierStatus = 'not-needed';
        if (cachedPreparedPeopleEvents?.key === interpretationKey) {
            peopleEvents = structuredClone(cachedPreparedPeopleEvents.events);
            peopleDossierAttempted = cachedPreparedPeopleEvents.dossierAttempted;
            peopleDossierStatus = cachedPreparedPeopleEvents.dossierStatus;
        } else {
            try {
                peopleEvents = materializeAcceptedPairPeopleEvents({
                    observations: interpreted.interpretation?.peopleEvents || [],
                    peopleContext,
                    sourcePair,
                    sourceContributionIds: {
                        previousAssistant: assistantContributionId,
                        currentPlayer: playerContributionId,
                    },
                    branchId,
                });
            } catch {
                return unavailable('people-events-invalid', {}, { attempted: true });
            }
            introductions = peopleEvents
                .filter((event) => event.type === 'personIntroduced')
                .map((event) => ({
                    personId: event.personId,
                    name: event.name,
                    introductionSummary: event.introductionSummary,
                }));
            if (introductions.length > 0 && !queuePeopleDossiers) {
                peopleDossierAttempted = true;
                let authored;
                try {
                    authored = await runProgress('updating-characters', ({ onAttempt, onPhase }) => peopleDossierAuthor({
                        introductions,
                        campaignContext: {
                            campaignTitle: campaignState?.campaign?.title
                                || runtimeAssets?.packageData?.manifest?.title
                                || '',
                            shipName: runtimeAssets?.shipDataset?.manifest?.title || '',
                            shipSummary: runtimeAssets?.shipDataset?.profile?.summary || '',
                        },
                        signal,
                        onAttempt,
                        onPhase,
                    }), progressScope);
                } catch {
                    authored = { ok: false, status: 'unavailable', reasonCode: 'provider-threw' };
                }
                peopleDossierStatus = authored?.ok ? 'authored' : (authored?.reasonCode || 'unavailable');
                if (authored?.ok) {
                    try {
                        peopleEvents = materializeAcceptedPairPeopleEvents({
                            observations: interpreted.interpretation?.peopleEvents || [],
                            peopleContext,
                            sourcePair,
                            sourceContributionIds: {
                                previousAssistant: assistantContributionId,
                                currentPlayer: playerContributionId,
                            },
                            branchId,
                            dossiers: authored.dossiers,
                        });
                    } catch {
                        return unavailable('people-dossier-materialization-invalid', {}, { attempted: true });
                    }
                }
            }
            if (introductions.length > 0 && queuePeopleDossiers) {
                peopleDossierStatus = 'queued';
            }
            cachedPreparedPeopleEvents = {
                key: interpretationKey,
                events: structuredClone(peopleEvents),
                dossierAttempted: peopleDossierAttempted,
                dossierStatus: peopleDossierStatus,
            };
        }
        if (stateDeltaGateway.revision() !== interpretationBaseRevision) {
            return unavailable('state-revision-conflict', {}, { attempted: true });
        }
        let dutyReportResult = null;
        if (sourcePair.previousAssistant.dutyReportManifest) {
            dutyReportResult = assistantAccepted
                ? materializeAcceptedDutyReportClaim({
                    definition,
                    manifest: sourcePair.previousAssistant.dutyReportManifest,
                    branchId,
                    source: {
                        ...assistantSource,
                        text: sourcePair.previousAssistant.text,
                    },
                })
                : {
                    ok: false,
                    status: 'rejected',
                    reasonCode: 'assistant-not-accepted',
                    errors: [],
                };
        }
        const interpretedMissionProposal = {
            ...interpreted.proposal,
            claims: (interpreted.proposal?.claims || []).filter((claim) => !new Set(['shipWork', 'cohesion']).has(claim.domain)),
        };
        const shipProposal = {
            kind: SHIP_WORK_EVIDENCE_PROPOSAL_KIND,
            branchId,
            claims: (interpreted.proposal?.claims || []).filter((claim) => claim.domain === 'shipWork'),
        };
        const cohesionProposal = {
            kind: COHESION_EVIDENCE_PROPOSAL_KIND,
            branchId,
            claims: (interpreted.proposal?.claims || []).filter((claim) => claim.domain === 'cohesion'),
        };
        const dutyProposal = proposalWithDutyReportCustody({
            definition,
            proposal: interpretedMissionProposal,
            dutyReportResult,
        });
        const deterministicRuntime = materializeDeterministicRuntimeEvidence({
            definition,
            missionState,
            campaignState: plannedCampaignState,
            branchId,
            pacingReceipts: campaignState.storySettlement?.acceptedPairReceipts || [],
            updatePacingAuthorization: assistantAccepted,
        });
        const settlementProposal = {
            ...dutyProposal.proposal,
            claims: [
                ...(dutyProposal.proposal?.claims || []),
                ...deterministicRuntime.claims,
            ],
        };
        const pacingEvidence = gateScenePacingClaims({definition,state:missionState,
            receipts:campaignState.storySettlement?.acceptedPairReceipts || [],
            claims:settlementProposal.claims,assistantMessageId:sourcePair.previousAssistant.messageId});
        settlementProposal.claims = pacingEvidence.acceptedClaims;
        const sources = [
            assistantSource,
            playerSource,
            ...deterministicRuntime.sources,
        ];
        const contributions = [
            ...(assistantAccepted ? [contributionFor(
                branchId,
                'assistant',
                sourcePair.previousAssistant,
                missionState.revision,
                assistantContributionId,
            )] : []),
            contributionFor(
                branchId,
                'user',
                sourcePair.currentPlayer,
                missionState.revision,
                playerContributionId,
            ),
            ...deterministicRuntime.contributions,
        ];
        const acceptedPairReceipt = createV1AcceptedPairReceipt({
            branchId,
            sourceRangeHash: snapshot.source.sourceRangeHash,
            sourcePair,
            assistantAcceptance: interpreted.interpretation.assistantAcceptance,
            sourceContributionIds: [
                ...(assistantAccepted ? [assistantContributionId] : []),
                playerContributionId,
            ],
        });
        if (scenePacing) acceptedPairReceipt.scenePacing = scenePacing;
        const sourceObservations = [
            ...(assistantAccepted ? [{
                contributionId: assistantContributionId,
                role: 'assistant',
                textHash: sourcePair.previousAssistant.textHash,
                text: sourcePair.previousAssistant.text,
            }] : []),
            {
                contributionId: playerContributionId,
                role: 'user',
                textHash: sourcePair.currentPlayer.textHash,
                text: sourcePair.currentPlayer.text,
            },
            ...deterministicRuntime.observations,
        ];
        const resolveSourceRef = (ref) => sources.find((source) => sourceMatchesRef(source, ref)) || null;
        const spine = createV1StateSpine({
            getAnalysisLimits: () => generationRouter?.getAnalysisLimits?.() || {},
            getState: prepareOnly ? () => campaignState : getState,
            stateDeltaGateway: gatewayForProgressScope(progressScope),
            resolveSourceRef,
            now,
            checkpointEveryContributions,
        });
        const sourceRangeHash = compact(snapshot.source.sourceRangeHash);
        const sceneHash = stableHash([
            branchId,
            sourceRangeHash,
            assistantContributionId,
            playerContributionId,
        ].join('|'));
        try {
            if (signal?.aborted) return unavailable('provider-aborted', {}, {attempted:true});
            const prepared = prepareOnly
                ? await spine.prepareAcceptedPair({
                    definition,
                    proposal: settlementProposal,
                    sourceContributions: contributions,
                    sourceObservations,
                    acceptedPairReceipt,
                    gatewayBaseRevision,
                    scene: {
                        episodeId: `episode.v1.${sceneHash}`,
                        sceneId: `scene.v1.${sceneHash}`,
                    },
                    hardBoundary,
                    missionDefinitions: validDefinitionRecords(runtimeAssets).map((record) => record.definition),
                    authorityPatch: time?.patch || {},
                    authorityDomains: time?.domains || [],
                    acceptedCommandBearingEdge: assistantAccepted ? acceptedCommandBearingEdge : null,
                    shipDataset: runtimeAssets?.shipDataset || null,
                    shipProposal,
                    cohesionCatalog: runtimeAssets?.cohesionCatalog || null,
                    cohesionProposal,
                    peopleEvents,
                    knownPersonIds: peopleContext.knownPeople.map((person) => person.id),
                })
                : null;
            const settled = prepared?.result || await spine.settleAcceptedPair({
                definition,
                proposal: settlementProposal,
                sourceContributions: contributions,
                sourceObservations,
                acceptedPairReceipt,
                gatewayBaseRevision,
                scene: {
                    episodeId: `episode.v1.${sceneHash}`,
                    sceneId: `scene.v1.${sceneHash}`,
                },
                hardBoundary,
                missionDefinitions: validDefinitionRecords(runtimeAssets).map((record) => record.definition),
                authorityPatch: time?.patch || {},
                authorityDomains: time?.domains || [],
                acceptedCommandBearingEdge: assistantAccepted ? acceptedCommandBearingEdge : null,
                shipDataset: runtimeAssets?.shipDataset || null,
                shipProposal,
                cohesionCatalog: runtimeAssets?.cohesionCatalog || null,
                cohesionProposal,
                peopleEvents,
                knownPersonIds: peopleContext.knownPeople.map((person) => person.id),
            });
            const committedRoots = settled.noChange
                ? []
                : [
                    'mission',
                    'storySettlement',
                    ...(settled.commandBearingChanged ? ['commandBearing'] : []),
                    ...(time?.patch ? time.domains : []),
                ];
            const acceptedClaimCount = settled.evidence?.acceptedClaims?.length || 0;
            const rejectedClaimCount = settled.evidence?.rejectedClaims?.length || 0;
            const acceptedShipClaimCount = settled.shipEvidence?.acceptedClaims?.length || 0;
            const rejectedShipClaimCount = settled.shipEvidence?.rejectedClaims?.length || 0;
            const acceptedDutyReportCount = (settled.evidence?.acceptedClaims || [])
                .filter((claim) => claim?.delivery?.kind === 'directive.dutyReportDelivery.v1').length;
            const rejectedMaterializedReport = (settled.evidence?.rejectedClaims || [])
                .find((claim) => claim?.delivery?.kind === 'directive.dutyReportDelivery.v1');
            let rejectedDutyReportReasonCode = dutyReportResult?.ok === false
                ? dutyReportResult.reasonCode
                : null;
            if (!rejectedDutyReportReasonCode && dutyProposal.strippedRequiredClaimCount > 0 && !dutyReportResult?.ok) {
                rejectedDutyReportReasonCode = 'required-manifest-missing';
            }
            if (!rejectedDutyReportReasonCode && rejectedMaterializedReport) {
                rejectedDutyReportReasonCode = rejectedMaterializedReport.reasonCode || 'evidence-rejected';
            }
            if (cachedInterpretation?.key === interpretationKey) cachedInterpretation = null;
            if (cachedPreparedPeopleEvents?.key === interpretationKey) cachedPreparedPeopleEvents = null;
            return {
                ok: true,
                attempted: true,
                status: acceptedClaimCount > 0 || acceptedShipClaimCount > 0 || peopleEvents.length > 0
                    ? 'settled'
                    : 'settled-no-effect',
                reasonCode: null,
                definitionId: definition.id,
                definitionVersion: definition.version,
                committedRoots,
                noChange: settled.noChange,
                transitionCommitted: Boolean(settled.missionResult?.transitionPacket),
                transitionActivated: settled.transitionActivation?.status === 'activated',
                transitionActivation: settled.transitionActivation || null,
                reviewToken: settled.reviewToken || null,
                acceptedCommandBearingEdge: settled.acceptedCommandBearingEdge || null,
                diagnostics: {
                    candidateCount: candidatePacket.candidates.length,
                    selectedClaimCount: interpreted.diagnostics?.selectedClaimCount ?? interpreted.proposal?.claims?.length ?? 0,
                    acceptedClaimCount,
                    rejectedClaimCount,
                    pacingRejectedClaimCount: pacingEvidence.rejectedClaims.length,
                    acceptedShipClaimCount,
                    rejectedShipClaimCount,
                    discardedAssistantClaimCount: interpreted.diagnostics?.discardedAssistantClaimCount ?? 0,
                    peopleEventCount: peopleEvents.length,
                    peopleDossierAttempted,
                    peopleDossierStatus,
                    acceptedDutyReportCount,
                    commandBearingAwardCount: settled.commandBearingAwardCount || 0,
                    strippedRequiredDutyReportClaimCount: dutyProposal.strippedRequiredClaimCount,
                    rejectedDutyReportReasonCode,
                    providerId: interpreted.diagnostics?.providerId || null,
                    model: interpreted.diagnostics?.model || null,
                    latencyMs: interpreted.diagnostics?.latencyMs ?? null,
                    interpretationReused,
                },
                time: time?.patch ? {
                    ...time,
                    status: time.boundary ? 'committed' : 'recorded',
                    campaignState: settled.campaignState,
                    patch: null,
                } : time,
                ...(prepareOnly ? {
                    candidateState: prepared.candidateState,
                    commitProposal: prepared.proposal,
                    preparedResult: prepared.result,
                    pair: {
                        sourcePair: structuredClone(sourcePair),
                        assistantAccepted,
                        contributionIds: {
                            previousAssistant: assistantContributionId,
                            currentPlayer: playerContributionId,
                        },
                        peopleEvents: structuredClone(peopleEvents),
                        introductions: structuredClone(introductions),
                        acceptedPairReceipt: structuredClone(acceptedPairReceipt),
                    },
                } : {}),
            };
        } catch (error) {
            const reasonCode = errorReasonCode(error);
            if (reasonCode !== 'persistence-failed' && cachedInterpretation?.key === interpretationKey) {
                cachedInterpretation = null;
            }
            if (reasonCode !== 'persistence-failed' && cachedPreparedPeopleEvents?.key === interpretationKey) {
                cachedPreparedPeopleEvents = null;
            }
            return unavailable(reasonCode, { interpretationReused }, { attempted: true });
        }
    }

    function directionForMaterializedContinuity(direction, changes, beforeEvents, afterEvents) {
        if (!direction?.targetRef) return direction;
        const opened = changes.find((change) => (
            change?.operation === 'open' && change.localRef === direction.targetRef
        ));
        if (!opened) return direction;
        const priorIds = new Set((beforeEvents || []).map(({ id }) => id));
        const event = (afterEvents || []).find((candidate) => (
            !priorIds.has(candidate.id)
            && candidate.operation === 'open'
            && candidate.payload?.title === opened.title
            && candidate.payload?.category === opened.category
        ));
        return event ? { ...direction, targetRef: event.threadId } : direction;
    }

    function compiledInstructionText(compiled) {
        return [
            compiled.instruction,
            compiled.targetText ? `Approved target: ${compiled.targetText}` : null,
            compiled.complicationInstruction,
        ].filter(Boolean).join(' ');
    }

    function clearDirectedAnalysis() {
        if (!directedAnalysis) return;
        directedAnalysis.coordinator.clear();
        directedAnalysis = null;
    }

    async function runDirectedAnalysis(captured, {
        signal,
        progressScope,
        allowModelCall = true,
        resolvedProviderFingerprints = null,
    }) {
        const fingerprints = resolvedProviderFingerprints || await providerFingerprints({
            runtimeAssets: captured.runtimeAssets,
            snapshot: captured.snapshot,
            generationType: captured.generationType,
        });
        const turnKey = await createTurnAnalysisKey({
            envelope: captured.directorRequest.envelope,
            interpreterRequest: captured.interpreterRequest,
            directorRequest: { ...captured.directorRequest, episodeReview: captured.episodeReviewRequest },
            providerFingerprints: fingerprints || {},
        });
        if (directedAnalysis?.key !== turnKey) {
            const focused = typeof analyzeContinuity === 'function';
            const coordinator = createParallelTurnAnalysis({
                maxAttempts: role => generationRouter?.getMaxAttempts?.({
                    interpreter: 'acceptedPairMissionEvidence', director: focused ? 'storyDirectionAnalyst' : 'storyDirector',
                    continuity: 'continuityAnalyst', episode: 'episodeEvaluator',
                }[role], focused ? 2 : 1) ?? (focused ? 2 : 1),
                continuity: focused ? async ({ request, signal: roleSignal }) => runProgress(
                    'reviewing-continuity',
                    async ({ onAttempt, onPhase }) => {
                        let currentRequest = request;
                        const lookupPasses = normalizeAnalysisLimits(request.analysisLimits).continuityLookupPasses;
                        for (let pass = 0; pass < lookupPasses; pass++) {
                            const result = await analyzeContinuity({ request: currentRequest, signal: roleSignal, onAttempt, onPhase });
                            if (!result?.ok) return result;
                            const parsed = parseContinuityAnalystOutput(result.proposal, { request: currentRequest });
                            if (!parsed.ok) return { ok: false, reasonCode: 'continuity-invalid-output' };
                            if (parsed.value.coverage !== 'lookup-needed') return { ...result, proposal: parsed.value };
                            if (pass === lookupPasses - 1) return { ok: false, reasonCode: 'continuity-lookup-exhausted' };
                            const lookups = parsed.value.lookupRequests;
                            const lookup = lookupContinuityThreads({
                                limits: request.analysisLimits,
                                events: captured.campaignState.storySettlement.continuityEvents || [],
                                referencedIds: lookups.flatMap(item => item.threadIds),
                                queryText: lookups.map(item => item.query || '').join(' '),
                                currentRevision: captured.campaignState.storySettlement.revision,
                                currentElapsedSeconds: captured.campaignState.timeLedger?.elapsedSeconds,
                            });
                            const records = new Map(currentRequest.continuity.records.map(record => [record.id, structuredClone(record)]));
                            for (const record of lookup.records) {
                                const old = records.get(record.id);
                                if (!old) { records.set(record.id, record); continue; }
                                const facts = [...new Map([...old.facts, ...record.facts].map(fact => [fact.id, fact])).values()];
                                records.set(record.id, { ...record, facts,
                                    omittedFactCount: Math.max(0, old.facts.length + old.omittedFactCount - facts.length),
                                    sourceContributionIds: [...new Set(facts.flatMap(fact => fact.sourceContributionIds || []))],
                                });
                            }
                            const merged = [...records.values()];
                            currentRequest = { ...currentRequest, continuity: {
                                index: [...new Map([...currentRequest.continuity.index, ...lookup.index].map(record => [record.id, record])).values()],
                                records: merged,
                                retrieval: { ...lookup.retrieval,
                                    coverage: 'partial',
                                    omittedThreadCount: Math.max(0, lookup.retrieval.totalThreadCount - merged.length),
                                    omittedFactCount: Math.max(0, lookup.retrieval.omittedFactCount + lookup.records.reduce((n,r) => n+r.facts.length, 0) - merged.reduce((n,r) => n+r.facts.length, 0)),
                                },
                            } };
                        }
                    }, progressScope,
                ) : undefined,
                review: focused ? async ({ request, signal: roleSignal }) => runProgress(
                    'reviewing-episode', async ({ onAttempt, onPhase }) => {
                        const result = await mandatoryEpisodeEvaluator({ request, signal: roleSignal, onAttempt, onPhase });
                        if (!result?.ok) return result;
                        const parsed = parseEpisodeEvaluationProposal(result.proposal, { request });
                        return parsed.ok ? { ...result, proposal: parsed.value } : { ok: false, reasonCode: 'episode-review-invalid' };
                    }, progressScope,
                ) : undefined,
                interpret: async ({ signal: roleSignal }) => {
                    if (captured.pairAlreadySettled) {
                        return {
                            ok: true,
                            status: 'already-settled',
                            interpretation: {
                                assistantAcceptance: captured.settledPairReceipt?.assistantAcceptance || 'accepted',
                            },
                            proposal: null,
                            diagnostics: { reusedAcceptedPair: true },
                        };
                    }
                    return runProgress(
                        'reviewing-events',
                        ({ onAttempt, onPhase }) => interpreter({
                            ...captured.interpreterInput,
                            signal: roleSignal,
                            onAttempt,
                            onPhase,
                        }),
                        progressScope,
                    );
                },
                direct: async ({ request, signal: roleSignal }) => runProgress(
                    'directing-story',
                    async ({ onAttempt, onPhase }) => {
                        const result = await directStory({ request, signal: roleSignal, onAttempt, onPhase });
                        if (!result?.ok) return result;
                        const parsed = focused
                            ? parseStoryDirectionOutput(result.proposal, { request })
                            : parseStoryDirectorOutput(result.proposal, { request });
                        if (!parsed.ok) {
                            return {
                                ok: false,
                                reasonCode: 'director-invalid-output',
                                diagnostics: { errorCount: parsed.errors.length },
                            };
                        }
                        return { ...result, proposal: parsed.value };
                    },
                    progressScope,
                ),
            });
            directedAnalysis = { key: turnKey, coordinator, lastAnalysis: null };
        }
        if (allowModelCall !== true && directedAnalysis.lastAnalysis?.ok !== true) {
            return { analysis: null, turnKey, modelCallBudgetExhausted: true };
        }
        const analysis = await directedAnalysis.coordinator.run({
            key: turnKey,
            interpreterRequest: captured.interpreterRequest,
            directorRequest: typeof analyzeContinuity === 'function' ? { ...captured.directorRequest, episodeReview: null } : captured.directorRequest,
            episodeRequest: typeof analyzeContinuity === 'function' ? captured.episodeReviewRequest : null,
            signal,
        });
        if (analysis.ok && typeof analyzeContinuity === 'function') {
            analysis.director.proposal = {
                kind: 'directive.storyDirectorProposal.v1',
                envelope: analysis.director.proposal.envelope,
                coverage: analysis.continuity.proposal.coverage,
                threadChanges: analysis.continuity.proposal.threadChanges,
                direction: analysis.director.proposal.direction,
                episodeReview: analysis.episode?.proposal || null,
            };
        }
        directedAnalysis.lastAnalysis = analysis;
        return { analysis, turnKey };
    }

    async function prepareDirectedReview(captured, directorResult) {
        if (!captured.reviewToken) return structuredClone(captured.campaignState);
        const draft = structuredClone(captured.campaignState);
        const spine = createV1StateSpine({
            getAnalysisLimits: () => generationRouter?.getAnalysisLimits?.() || {},
            getState: () => draft,
            stateDeltaGateway,
            resolveSourceRef: () => null,
            now,
            checkpointEveryContributions,
        });
        const prepared = await spine.prepareEpisodeReview({
            definition: captured.definition,
            reviewToken: captured.reviewToken,
            request: captured.episodeReviewRequest,
            proposal: directorResult.proposal.episodeReview,
            gatewayBaseRevision: draft.stateCustody.revision,
        });
        return prepared.candidateState;
    }

    async function settleDirectedAcceptedPair(input = {}) {
        const baseState = structuredClone(getState());
        let captured;
        try {
            captured = captureAcceptedPairAnalysis({
                campaignState: baseState,
                runtimeAssets: input.runtimeAssets,
                snapshot: input.snapshot,
                generationType: input.generationType,
                focused: typeof analyzeContinuity === 'function',
                analysisLimits: generationRouter?.getAnalysisLimits?.() || {},
            });
        } catch (error) {
            return unavailable(error?.code || error?.message || 'turn-capture-invalid');
        }
        let resolvedProviderFingerprints;
        let currentReuseKey;
        try {
            resolvedProviderFingerprints = await providerFingerprints({
                runtimeAssets: captured.runtimeAssets,
                snapshot: captured.snapshot,
                generationType: captured.generationType,
            }) || {};
            currentReuseKey = await createNarrationDirectionReuseKey({
                campaignState: baseState,
                runtimeAssets: captured.runtimeAssets,
                snapshot: captured.snapshot,
                generationType: captured.generationType,
                providerFingerprints: resolvedProviderFingerprints,
            });
        } catch (error) {
            return unavailable(errorReasonCode(error));
        }
        const activePackage = baseState.activeCampaignPackage || {};
        const receiptEnvelope = {
            branchId: captured.branchId,
            packageId: activePackage.packageId || captured.definition.packageBinding.packageId,
            packageVersion: activePackage.packageVersion || captured.definition.packageBinding.packageVersion,
            missionId: baseState.mission.v1.definitionId,
            generationType: captured.generationType,
            generationTargetKey: captured.generationTargetKey,
        };
        const candidateReceipt = selectDirectorReceipt(baseState.storySettlement, receiptEnvelope);
        const existingReceipt = selectDirectorReceipt(baseState.storySettlement, {
            ...receiptEnvelope,
            reuseKey: currentReuseKey,
        });
        const receiptTargetStillEligible = !candidateReceipt?.dependencyIds?.length
            || eligibleDirectionTargets(baseState, {
                ...captured,
                runtimeAssets: input.runtimeAssets,
            }).has(candidateReceipt.dependencyIds[0]);
        if (existingReceipt && receiptTargetStillEligible) {
            return {
                ok: true,
                attempted: false,
                status: 'already-settled',
                reasonCode: null,
                definitionId: baseState.mission.v1.definitionId,
                definitionVersion: baseState.mission.v1.definitionVersion,
                committedRoots: [],
                noChange: true,
                transitionCommitted: false,
                reviewToken: createPendingEpisodeReviewToken(baseState.storySettlement),
                instruction: existingReceipt.instruction,
                directorReceipt: existingReceipt,
                diagnostics: { turnKey: existingReceipt.requestKey, blockedRoles: [] },
            };
        }
        if (captured.pairAlreadySettled && input.allowModelCall === false) {
            return {
                ok: true,
                attempted: false,
                status: 'already-settled',
                reasonCode: null,
                definitionId: baseState.mission.v1.definitionId,
                definitionVersion: baseState.mission.v1.definitionVersion,
                committedRoots: [],
                noChange: true,
                transitionCommitted: false,
                reviewToken: createPendingEpisodeReviewToken(baseState.storySettlement),
                diagnostics: { blockedRoles: [] },
            };
        }

        const { analysis, turnKey, modelCallBudgetExhausted } = await runDirectedAnalysis(captured, {
            ...input,
            resolvedProviderFingerprints,
        });
        if (modelCallBudgetExhausted) {
            return unavailable(
                'model-call-budget-exhausted',
                { blockedRoles: captured.pairAlreadySettled ? ['director'] : ['interpreter', 'director'], turnKey },
                { attempted: false },
            );
        }
        if (!analysis.ok) {
            const blockedRoles = analysis.blockedRoles || [];
            const failedRole = blockedRoles[0];
            const analysisReasonCode = analysis[failedRole]?.reasonCode
                || analysis.reasonCode
                || `${failedRole || 'turn-analysis'}-unavailable`;
            const reasonCode = input.signal?.aborted || analysisReasonCode === 'aborted'
                ? 'provider-aborted'
                : analysisReasonCode;
            if (reasonCode === 'provider-aborted') clearDirectedAnalysis();
            return unavailable(reasonCode, { blockedRoles, turnKey }, { attempted: true });
        }
        if (input.signal?.aborted) {
            clearDirectedAnalysis();
            return unavailable('provider-aborted', { blockedRoles: [], turnKey }, { attempted: true });
        }

        if (stateDeltaGateway.revision() !== captured.campaignState.stateCustody.revision) {
            clearDirectedAnalysis();
            return unavailable('state-revision-conflict', { blockedRoles: [], turnKey }, { attempted: true });
        }
        let reviewedState;
        let preparedPair;
        try {
            reviewedState = await prepareDirectedReview(captured, analysis.director);
            if (captured.pairAlreadySettled) {
                const acceptedIds = captured.settledPairReceipt?.sourceContributionIds || [
                    captured.assistantContributionId,
                    captured.playerContributionId,
                ];
                preparedPair = {
                    ok: true,
                    candidateState: reviewedState,
                    preparedResult: null,
                    pair: {
                        sourcePair: captured.sourcePair,
                        assistantAccepted: captured.settledPairReceipt
                            ? captured.settledPairReceipt.assistantAcceptance === 'accepted'
                            : acceptedIds.includes(captured.assistantContributionId),
                        contributionIds: {
                            previousAssistant: captured.assistantContributionId,
                            currentPlayer: captured.playerContributionId,
                        },
                        peopleEvents: [],
                        introductions: [],
                        acceptedPairReceipt: captured.settledPairReceipt,
                    },
                    noChange: true,
                    reviewToken: createPendingEpisodeReviewToken(reviewedState.storySettlement),
                };
            } else {
                preparedPair = await prepareInterpretedPair({
                    captured,
                    interpreted: analysis.interpreter,
                    campaignState: reviewedState,
                    prepare: ({ interpreted, campaignState }) => settleAcceptedPairLegacy({
                        ...input,
                        preparedInterpretation: interpreted,
                        preparedCampaignState: campaignState,
                        prepareOnly: true,
                        queuePeopleDossiers: true,
                    }),
                });
                if (!preparedPair?.ok || !preparedPair.candidateState) {
                    clearDirectedAnalysis();
                    return unavailable(
                        preparedPair?.reasonCode || 'interpreted-pair-preparation-failed',
                        { blockedRoles: ['interpreter'], turnKey },
                        { attempted: true },
                    );
                }
            }

            let candidateState = structuredClone(preparedPair.candidateState);
            if (candidateReceipt && (
                !existingReceipt
                || !receiptTargetStillEligible
            )) {
                candidateState.storySettlement.directorReceipts = (
                    candidateState.storySettlement.directorReceipts || []
                ).filter(({ generationTargetKey }) => generationTargetKey !== captured.generationTargetKey);
            }
            const priorEvents = candidateState.storySettlement.continuityEvents || [];
            const authoredIds = [
                ...captured.directorRequest.authoredContext.constraints,
                ...captured.directorRequest.authoredContext.opportunities,
            ].map(({ id }) => id).filter(Boolean);
            const continuityEvents = await materializeContinuityChanges({
                changes: analysis.director.proposal.threadChanges,
                sourcePair: captured.directorRequest.pendingPair,
                assistantAccepted: preparedPair.pair.assistantAccepted,
                contributionIds: preparedPair.pair.contributionIds,
                branchId: captured.branchId,
                sourceRangeHash: captured.snapshot.source.sourceRangeHash,
                existingEvents: priorEvents,
                settledAtRevision: candidateState.storySettlement.revision,
                authoredIds,
                authoredDeadlines: captured.directorRequest.authoredContext.deadlines || {},
                limits: captured.directorRequest.analysisLimits,
                knownLinkIds: captured.directorRequest.authoredContext.referenceIds || [],
                temporalContext: captured.directorRequest.authoredContext.temporalContext,
            });
            candidateState.storySettlement = {
                ...candidateState.storySettlement,
                continuityEvents,
            };
            for (const introduction of preparedPair.pair.introductions || []) {
                const event = (preparedPair.pair.peopleEvents || []).find((item) => (
                    item.type === 'personIntroduced' && item.personId === introduction.personId
                ));
                if (!event) continue;
                const job = await createPendingDossier({
                    personId: event.personId,
                    introductionSourceContributionIds: event.sourceContributionIds,
                    publicContext: {
                        displayName: event.name,
                        introductionSummary: event.introductionSummary,
                    },
                });
                candidateState.storySettlement = recordPendingDossier(candidateState.storySettlement, job);
            }
            const targets = eligibleDirectionTargets(candidateState, captured);
            let direction = directionForMaterializedContinuity(
                analysis.director.proposal.direction,
                analysis.director.proposal.threadChanges,
                priorEvents,
                continuityEvents,
            );
            let compiled = compileDirectorInstruction({ direction, eligibleTargets: targets });
            if (typeof analyzeContinuity === 'function' && direction.move !== compiled.move) {
                // The independent director can target a thread resolved by this same pair.
                // Reconcile against validated candidate findings, without committing them early.
                const request = {
                    ...captured.directorRequest,
                    episodeReview: null,
                    authoredContext: {
                        ...captured.directorRequest.authoredContext,
                        opportunities: captured.directorRequest.authoredContext.opportunities.filter(item => targets.has(item.id)),
                    },
                    continuity: projectDirectorContinuity({
                        limits: captured.directorRequest.analysisLimits,
                        events: continuityEvents,
                        missionId: captured.definition.id,
                        queryText: `${captured.sourcePair.previousAssistant.text} ${captured.sourcePair.currentPlayer.text}`,
                        currentRevision: candidateState.storySettlement.revision,
                        currentElapsedSeconds: candidateState.timeLedger?.elapsedSeconds,
                    }),
                };
                request.continuity = {
                    ...request.continuity,
                    records: request.continuity.records.filter(record => targets.has(record.id)),
                    index: request.continuity.index.filter(record => targets.has(record.id)),
                };
                if (input.signal?.aborted || stateDeltaGateway.revision() !== captured.campaignState.stateCustody.revision) {
                    clearDirectedAnalysis();
                    return unavailable(input.signal?.aborted ? 'provider-aborted' : 'state-revision-conflict', { blockedRoles: [], turnKey }, { attempted: true });
                }
                const result = await runProgress('directing-story', ({ onAttempt, onPhase }) => directStory({
                    request, signal: input.signal, onAttempt, onPhase,
                }), input.progressScope);
                const parsed = result?.ok ? parseStoryDirectionOutput(result.proposal, { request }) : null;
                if (!parsed?.ok) {
                    directedAnalysis.coordinator.invalidateRole(turnKey, 'director');
                    directedAnalysis.lastAnalysis = null;
                    return unavailable(result?.reasonCode || 'director-reconciliation-invalid', { blockedRoles: ['director'], turnKey }, { attempted: true });
                }
                direction = parsed.value.direction;
                compiled = compileDirectorInstruction({ direction, eligibleTargets: targets });
                if (direction.move !== compiled.move) {
                    directedAnalysis.coordinator.invalidateRole(turnKey, 'director');
                    directedAnalysis.lastAnalysis = null;
                    return unavailable('director-reconciliation-conflict', { blockedRoles: ['director'], turnKey }, { attempted: true });
                }
            }
            const instruction = compiledInstructionText(compiled);
            const target = compiled.targetRef ? targets.get(compiled.targetRef) : null;
            const postPackage = candidateState.activeCampaignPackage || {};
            if (captured.pairAlreadySettled
                && candidateState.storySettlement.revision === baseState.storySettlement.revision) {
                candidateState.storySettlement = {
                    ...candidateState.storySettlement,
                    revision: candidateState.storySettlement.revision + 1,
                };
            }
            const reuseKey = await createNarrationDirectionReuseKey({
                campaignState: candidateState,
                runtimeAssets: captured.runtimeAssets,
                snapshot: captured.snapshot,
                generationType: captured.generationType,
                providerFingerprints: resolvedProviderFingerprints,
            });
            const sourceContributionIds = preparedPair.pair.acceptedPairReceipt?.sourceContributionIds
                || [
                    ...(preparedPair.pair.assistantAccepted ? [captured.assistantContributionId] : []),
                    captured.playerContributionId,
                ];
            const receipt = await createDirectorReceipt({
                branchId: captured.branchId,
                packageId: postPackage.packageId || captured.definition.packageBinding.packageId,
                packageVersion: postPackage.packageVersion || captured.definition.packageBinding.packageVersion,
                missionId: candidateState.mission.v1.definitionId,
                generationType: captured.generationType,
                generationTargetKey: captured.generationTargetKey,
                requestKey: turnKey,
                sourceRangeHash: captured.snapshot.source.sourceRangeHash,
                sourceContributionIds,
                instruction,
                dependencyIds: target?.dependencyIds || [],
                settledAtRevision: candidateState.storySettlement.revision,
                reuseKey,
            });
            candidateState.storySettlement = recordDirectorReceipt(candidateState.storySettlement, receipt);
            assertV1CampaignState(candidateState);
            const commitProposal = createTurnCommit({ before: baseState, after: candidateState, turnKey });
            if (!commitProposal) throw captureFailure('turn-commit-empty');
            if (input.signal?.aborted) throw captureFailure('provider-aborted');
            const committed = await gatewayForProgressScope(input.progressScope).applyProposal(commitProposal);
            clearDirectedAnalysis();
            const pairResult = preparedPair;
            return {
                ...pairResult,
                ok: true,
                attempted: true,
                status: captured.pairAlreadySettled ? 'directed' : pairResult.status,
                reasonCode: null,
                definitionId: candidateState.mission.v1.definitionId,
                definitionVersion: candidateState.mission.v1.definitionVersion,
                committedRoots: commitProposal.domains,
                noChange: false,
                reviewToken: createPendingEpisodeReviewToken(candidateState.storySettlement),
                campaignState: committed.campaignState,
                time: pairResult.time?.campaignState
                    ? { ...pairResult.time, campaignState: committed.campaignState }
                    : pairResult.time,
                instruction,
                compiledDirection: compiled,
                directorReceipt: receipt,
                diagnostics: {
                    ...(pairResult.diagnostics || {}),
                    blockedRoles: [],
                    turnKey,
                },
            };
        } catch (error) {
            const reasonCode = errorReasonCode(error);
            if (reasonCode !== 'persistence-failed') clearDirectedAnalysis();
            return unavailable(reasonCode, { blockedRoles: [], turnKey }, { attempted: true });
        }
    }

    async function settleAcceptedPair(input = {}) {
        return typeof directStory === 'function'
            ? settleDirectedAcceptedPair(input)
            : settleAcceptedPairLegacy(input);
    }

    async function invalidateSourceMutation({
        runtimeAssets = {},
        hostMessageId = null,
        eventType = 'source-invalidated',
        authorityPatch = {},
        authorityDomains = [],
        progressScope = null,
    } = {}) {
        const campaignState = getState();
        const resolved = resolveActiveV1MissionDefinition({ campaignState, runtimeAssets });
        if (!resolved.ok) return resolved;
        const branchId = compact(campaignState?.campaignChatBinding?.saveId);
        if (!branchId) return unavailable('active-branch-unavailable');
        if (campaignState?.mission?.v1?.branchId && campaignState.mission.v1.branchId !== branchId) {
            return unavailable('mission-branch-mismatch');
        }
        if (campaignState?.storySettlement?.branchId && campaignState.storySettlement.branchId !== branchId) {
            return unavailable('story-branch-mismatch');
        }
        const contributionIds = contributionIdsForHostMessage(campaignState, hostMessageId);
        const acceptedPairReceiptMatchesMessage = (campaignState?.storySettlement?.acceptedPairReceipts || [])
            .some((receipt) => (
                compact(receipt?.previousAssistant?.messageId) === compact(hostMessageId)
                || compact(receipt?.currentPlayer?.messageId) === compact(hostMessageId)
            ));
        const authorityChangeRequested = (Array.isArray(authorityDomains) ? authorityDomains : []).some(
            (domain) => Object.hasOwn(authorityPatch || {}, domain),
        );
        if (contributionIds.length === 0 && !acceptedPairReceiptMatchesMessage && !authorityChangeRequested) {
            return {
                ok: true,
                attempted: true,
                status: 'no-change',
                reasonCode: null,
                definitionId: resolved.definition.id,
                definitionVersion: resolved.definition.version,
                invalidatedContributionCount: 0,
                committedRoots: [],
                noChange: true,
                reviewToken: createPendingEpisodeReviewToken(campaignState?.storySettlement),
                diagnostics: {},
            };
        }
        const reason = safeReasonCode(eventType);
        const spine = createV1StateSpine({
            getAnalysisLimits: () => generationRouter?.getAnalysisLimits?.() || {},
            getState,
            stateDeltaGateway: gatewayForProgressScope(progressScope),
            resolveSourceRef: () => null,
            now,
        });
        const gatewayBaseRevision = stateDeltaGateway.revision();
        try {
            const invalidated = await spine.invalidateSources({
                definition: resolved.definition,
                missionDefinitions: validDefinitionRecords(runtimeAssets).map((record) => record.definition),
                branchId,
                contributionIds,
                sourceMessageIds: [hostMessageId],
                gatewayBaseRevision,
                reason,
                authorityPatch,
                authorityDomains,
                shipDataset: runtimeAssets?.shipDataset || null,
            });
            return {
                ok: true,
                attempted: true,
                status: invalidated.noChange ? 'no-change' : 'invalidated',
                reasonCode: null,
                definitionId: invalidated.definitionId || resolved.definition.id,
                definitionVersion: invalidated.definitionVersion || resolved.definition.version,
                invalidatedContributionCount: invalidated.invalidatedContributionIds?.length || 0,
                committedRoots: invalidated.noChange
                    ? []
                    : [
                        ...(invalidated.missionChanged === false ? ['storySettlement'] : ['mission', 'storySettlement']),
                        ...authorityDomains,
                    ],
                noChange: invalidated.noChange === true,
                reviewToken: invalidated.reviewToken || null,
                journeyRollback: invalidated.journeyRollback || null,
                diagnostics: {},
            };
        } catch (error) {
            return unavailable(errorReasonCode(error), {}, { attempted: true });
        }
    }

    function sameReviewCheckpoint(left, right) {
        return left?.kind === 'directive.episodeReviewToken.v1'
            && right?.kind === 'directive.episodeReviewToken.v1'
            && left.branchId === right.branchId
            && left.episodeId === right.episodeId
            && left.checkpointSequence === right.checkpointSequence;
    }

    async function persistEpisodeReviewAttempt({
        token,
        status,
        automaticAttemptCount,
        reasonCode = null,
        progressScope = null,
    }) {
        const campaignState = getState();
        const settlement = campaignState?.storySettlement;
        const previousAttempt = settlement?.episodeReviewAttempt;
        const pendingToken = createPendingEpisodeReviewToken(settlement);
        if (status === 'pending' && !sameReviewCheckpoint(pendingToken, token)) {
            const error = new Error('Episode review checkpoint changed before its attempt could begin.');
            error.code = 'DIRECTIVE_EPISODE_REVIEW_STALE';
            throw error;
        }
        if (previousAttempt && !sameReviewCheckpoint(previousAttempt.token, token)) {
            const error = new Error('Episode review attempt belongs to a stale checkpoint.');
            error.code = 'DIRECTIVE_EPISODE_REVIEW_STALE';
            throw error;
        }
        const storySettlement = recordEpisodeReviewAttempt(settlement, {
            token,
            status,
            automaticAttemptCount,
            reasonCode,
        });
        const committed = await stateDeltaGateway.applyProposal({
            patch: { storySettlement },
            domains: ['storySettlement'],
            baseRevision: stateDeltaGateway.revision(),
            source: 'v1EpisodeReviewAttempt',
            reason: 'Persisted bounded episode-review attempt custody.',
            metadata: {
                episodeId: token.episodeId,
                checkpointSequence: token.checkpointSequence,
                status,
            },
        }, { progressScope });
        return committed.campaignState.storySettlement.episodeReviewAttempt;
    }

    async function reviewPendingEpisode({
        runtimeAssets = {},
        signal = null,
        automatic = false,
        runMutation = null,
        progressScope = null,
    } = {}) {
        const mutate = typeof runMutation === 'function'
            ? runMutation
            : async (task) => task();
        let campaignState = getState();
        const resolved = resolveActiveV1MissionDefinition({ campaignState, runtimeAssets });
        if (!resolved.ok) return { ...resolved, reviewToken: createPendingEpisodeReviewToken(campaignState?.storySettlement) };
        const preflightReason = episodeReviewPreflightReason({ campaignState, definition: resolved.definition });
        if (preflightReason) {
            return {
                ...unavailable(preflightReason, {}, { attempted: false }),
                reviewToken: createPendingEpisodeReviewToken(campaignState?.storySettlement),
            };
        }
        let reviewToken = createPendingEpisodeReviewToken(campaignState?.storySettlement);
        if (!reviewToken) {
            return {
                ok: true,
                attempted: false,
                status: 'no-pending-review',
                reasonCode: null,
                definitionId: resolved.definition.id,
                definitionVersion: resolved.definition.version,
                committedRoots: [],
                noChange: true,
                reviewToken: null,
                diagnostics: {},
            };
        }

        const previousAttempt = campaignState.storySettlement.episodeReviewAttempt;
        const previousAutomaticCount = sameReviewCheckpoint(previousAttempt?.token, reviewToken)
            ? previousAttempt.automaticAttemptCount
            : 0;
        if (automatic === true && previousAutomaticCount >= 1) {
            return {
                ok: false,
                attempted: false,
                status: 'automatic-attempt-exhausted',
                reasonCode: 'automatic-attempt-exhausted',
                definitionId: resolved.definition.id,
                definitionVersion: resolved.definition.version,
                committedRoots: [],
                noChange: true,
                reviewToken,
                diagnostics: {},
            };
        }

        let attempt;
        try {
            attempt = await mutate(() => persistEpisodeReviewAttempt({
                token: reviewToken,
                status: 'pending',
                automaticAttemptCount: previousAutomaticCount + (automatic === true ? 1 : 0),
                reasonCode: null,
                progressScope,
            }));
        } catch (error) {
            const reasonCode = errorReasonCode(error);
            if (reasonCode === 'persistence-rollback-conflict') {
                return {
                    ok: false,
                    attempted: false,
                    status: 'indeterminate',
                    reasonCode,
                    diagnostics: {},
                    committedRoots: ['storySettlement'],
                    noChange: false,
                    reviewToken: createPendingEpisodeReviewToken(getState()?.storySettlement),
                    requiresOperatorReview: true,
                    retrySafe: false,
                };
            }
            return {
                ...unavailable(reasonCode, {}, { attempted: false }),
                reviewToken: createPendingEpisodeReviewToken(getState()?.storySettlement),
            };
        }

        campaignState = getState();
        reviewToken = attempt.token;
        let request;
        try {
            request = createEpisodeEvaluationRequest({ settlement: campaignState.storySettlement, limits: generationRouter?.getAnalysisLimits?.() || {} });
        } catch {
            try {
                await mutate(() => persistEpisodeReviewAttempt({
                    token: reviewToken,
                    status: 'failed',
                    automaticAttemptCount: attempt.automaticAttemptCount,
                    reasonCode: 'episode-review-invalid',
                    progressScope,
                }));
            } catch { /* Pending custody still suppresses another automatic call. */ }
            return {
                ...unavailable('episode-review-invalid', {}, { attempted: false }),
                reviewToken: createPendingEpisodeReviewToken(getState()?.storySettlement),
            };
        }
        const gatewayBaseRevision = stateDeltaGateway.revision();
        let evaluated;
        try {
            evaluated = await runProgress('reviewing-episode', ({ onAttempt, onPhase }) => episodeEvaluator({
                request,
                signal,
                onAttempt,
                onPhase,
            }), progressScope);
        } catch {
            evaluated = { ok: false, status: 'unavailable', reasonCode: 'provider-threw', diagnostics: {} };
        }
        const diagnostics = safeEpisodeDiagnostics(evaluated?.diagnostics);
        if (!evaluated?.ok || !evaluated?.proposal) {
            const reasonCode = evaluated?.reasonCode || 'episode-review-unavailable';
            try {
                await mutate(() => persistEpisodeReviewAttempt({
                    token: reviewToken,
                    status: 'failed',
                    automaticAttemptCount: attempt.automaticAttemptCount,
                    reasonCode,
                    progressScope,
                }));
            } catch { /* Pending custody still suppresses another automatic call. */ }
            return {
                ...unavailable(reasonCode, diagnostics, { attempted: true }),
                reviewToken: createPendingEpisodeReviewToken(getState()?.storySettlement),
            };
        }

        const spine = createV1StateSpine({
            getAnalysisLimits: () => generationRouter?.getAnalysisLimits?.() || {},
            getState,
            stateDeltaGateway: gatewayForProgressScope(progressScope),
            resolveSourceRef: () => null,
            now,
            checkpointEveryContributions,
        });
        try {
            const applied = await mutate(async () => {
                const result = await spine.applyEpisodeReview({
                    definition: resolved.definition,
                    reviewToken,
                    request,
                    proposal: evaluated.proposal,
                    gatewayBaseRevision,
                });
                await persistEpisodeReviewAttempt({
                    token: reviewToken,
                    status: 'committed',
                    automaticAttemptCount: attempt.automaticAttemptCount,
                    reasonCode: null,
                    progressScope,
                });
                return result;
            });
            const decision = evaluated.proposal.decision;
            return {
                ok: true,
                attempted: true,
                status: decision === 'continue' ? 'continued' : (decision === 'seal' ? 'sealed' : 'abstained'),
                reasonCode: null,
                definitionId: resolved.definition.id,
                definitionVersion: resolved.definition.version,
                committedRoots: ['storySettlement'],
                noChange: false,
                reviewToken: createPendingEpisodeReviewToken(getState()?.storySettlement),
                diagnostics,
            };
        } catch (error) {
            const reasonCode = errorReasonCode(error);
            try {
                await mutate(() => persistEpisodeReviewAttempt({
                    token: reviewToken,
                    status: reasonCode === 'persistence-rollback-conflict' ? 'indeterminate' : 'failed',
                    automaticAttemptCount: attempt.automaticAttemptCount,
                    reasonCode,
                    progressScope,
                }));
            } catch { /* Preserve the strongest already-durable attempt state. */ }
            if (reasonCode === 'persistence-rollback-conflict') {
                return {
                    ok: false,
                    attempted: true,
                    status: 'indeterminate',
                    reasonCode,
                    diagnostics,
                    committedRoots: ['storySettlement'],
                    noChange: false,
                    reviewToken: createPendingEpisodeReviewToken(getState()?.storySettlement),
                    requiresOperatorReview: true,
                    retrySafe: false,
                };
            }
            return {
                ...unavailable(reasonCode, diagnostics, { attempted: true }),
                reviewToken: createPendingEpisodeReviewToken(getState()?.storySettlement),
            };
        }
    }

    return {
        resolveActiveDefinition: (runtimeAssets) => resolveActiveV1MissionDefinition({
            campaignState: getState(),
            runtimeAssets,
        }),
        preparePendingDutyReport,
        prepareTransitionNarration,
        inspectPendingTransition,
        activatePendingTransition,
        settleAcceptedPair,
        invalidateSourceMutation,
        buildPlayerProjection,
        adjustObjectiveProgress,
        pendingEpisodeReview: () => createPendingEpisodeReviewToken(getState()?.storySettlement),
        reviewPendingEpisode,
    };
}

export async function settleV1MissionAcceptedPair({
    getState,
    stateDeltaGateway,
    generationRouter,
    interpretAcceptedPair,
    prepareAcceptedPairTime,
    now,
    timeoutMs,
    checkpointEveryContributions,
    runtimeAssets,
    snapshot,
    hardBoundary,
} = {}) {
    return createV1MissionRuntime({
        getState,
        stateDeltaGateway,
        generationRouter,
        interpretAcceptedPair,
        prepareAcceptedPairTime,
        now,
        timeoutMs,
        checkpointEveryContributions,
    }).settleAcceptedPair({ runtimeAssets, snapshot, hardBoundary });
}
