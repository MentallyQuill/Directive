import { createMissionAcceptedPairInterpreter } from '../mission/v1/accepted-pair-interpreter.mjs';
import { createMissionInterpretationCandidatePacket } from '../mission/v1/interpretation-candidates.mjs';
import { validateMissionDefinition } from '../mission/v1/mission-contracts.mjs';
import {
    createPendingEpisodeReviewToken,
    createV1StateSpine,
    resolveV1MissionState,
} from './v1-state-spine.mjs';
import { validateEpisodeHardBoundary } from '../story/episode-boundary.mjs';
import {
    createEpisodeEvaluationRequest,
    createEpisodeEvaluator,
} from '../story/episode-evaluator.mjs';
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
import {
    resolveMissionTransitionTarget,
    validateMissionJourney,
} from '../mission/v1/mission-journey.mjs';

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
        const reasonCode = bindingReason(definition, packageId, packageVersion);
        if (reasonCode) return unavailable(reasonCode);
        const persistedBindingMatches = currentV1.definitionVersion === definition.version
            && currentV1.packageBinding?.packageId === definition.packageBinding.packageId
            && currentV1.packageBinding?.packageVersion === definition.packageBinding.packageVersion
            && currentV1.packageBinding?.sourceId === definition.packageBinding.sourceId;
        if (!persistedBindingMatches) return unavailable('definition-migration-required');
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

function activeContributionId(campaignState, branchId, source) {
    const baseId = baseContributionId(branchId, source);
    const invalidated = new Set(campaignState?.mission?.v1?.invalidatedSourceContributionIds || []);
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
    return Boolean(messageWasInvalidated) || (campaignState?.mission?.v1?.invalidatedSourceContributionIds || []).some(
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

function contributionIdsForHostMessage(campaignState = {}, hostMessageId = '') {
    const target = compact(hostMessageId);
    if (!target) return [];
    const ids = [];
    for (const entry of campaignState?.mission?.v1?.evidenceLog || []) {
        if (compact(entry?.sourceRef?.messageId) === target && entry?.sourceContributionId) {
            ids.push(entry.sourceContributionId);
        }
    }
    for (const episode of campaignState?.storySettlement?.episodes || []) {
        for (const contribution of episode.contributions || []) {
            if (compact(contribution?.messageId) === target && contribution?.id) ids.push(contribution.id);
        }
    }
    for (const receipt of campaignState?.storySettlement?.receipts || []) {
        for (const [index, messageId] of (receipt.sourceMessageIds || []).entries()) {
            if (compact(messageId) === target && receipt.sourceContributionIds?.[index]) {
                ids.push(receipt.sourceContributionIds[index]);
            }
        }
    }
    const invalidated = new Set(campaignState?.mission?.v1?.invalidatedSourceContributionIds || []);
    return [...new Set(ids)].filter((id) => !invalidated.has(id));
}

function storySourceProvenanceMigrationRequired(campaignState = {}) {
    return (campaignState?.storySettlement?.receipts || []).some((receipt) => (
        !Array.isArray(receipt?.sourceContributionIds)
        || !Array.isArray(receipt?.sourceMessageIds)
        || receipt.sourceMessageIds.length !== receipt.sourceContributionIds.length
    ));
}

function missionEvidenceSequenceMigrationRequired(missionState = {}) {
    return (missionState?.evidenceLog || []).some(
        (entry) => !Number.isInteger(entry?.acceptedAtMissionRevision)
            || entry.acceptedAtMissionRevision < 0,
    );
}

function errorReasonCode(error) {
    if (error?.code === 'DIRECTIVE_STATE_REVISION_CONFLICT') return 'state-revision-conflict';
    if (error?.code === 'DIRECTIVE_MISSION_EVIDENCE_STALE') return 'mission-revision-conflict';
    if (error?.code === 'DIRECTIVE_MISSION_DEFINITION_MIGRATION_REQUIRED') return 'definition-migration-required';
    if (error?.code === 'DIRECTIVE_MISSION_RECONSTRUCTION_SEQUENCE_REQUIRED') {
        return 'evidence-sequence-migration-required';
    }
    if (error?.code === 'DIRECTIVE_MISSION_EVIDENCE_REJECTED') return 'evidence-rejected';
    if (error?.code === 'DIRECTIVE_MISSION_JOURNEY_INVALID') return 'mission-journey-invalid';
    if (error?.code === 'DIRECTIVE_EPISODE_REVIEW_STALE') return 'episode-review-stale';
    if (error?.code === 'DIRECTIVE_EPISODE_REVIEW_INVALID') return 'episode-review-invalid';
    if (error?.code === 'DIRECTIVE_STATE_PERSISTENCE_FAILED') return 'persistence-failed';
    if (error?.code === 'DIRECTIVE_STATE_PERSISTENCE_ROLLBACK_CONFLICT') return 'persistence-rollback-conflict';
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

export function createV1MissionRuntime({
    getState,
    stateDeltaGateway,
    generationRouter = null,
    interpretAcceptedPair = null,
    now = () => new Date().toISOString(),
    timeoutMs = 10000,
    evaluateEpisode = null,
    episodeReviewTimeoutMs = 8000,
    checkpointEveryContributions = 8,
} = {}) {
    if (typeof getState !== 'function') throw new TypeError('getState is required');
    if (typeof stateDeltaGateway?.revision !== 'function'
        || typeof stateDeltaGateway?.applyProposal !== 'function') {
        throw new TypeError('stateDeltaGateway with revision and applyProposal is required');
    }
    const interpreter = interpretAcceptedPair || createMissionAcceptedPairInterpreter({ generationRouter, timeoutMs });
    const episodeEvaluator = evaluateEpisode || createEpisodeEvaluator({
        generationRouter,
        timeoutMs: episodeReviewTimeoutMs,
    });

    function buildPlayerProjection({ runtimeAssets = {} } = {}) {
        return buildV1RuntimePlayerProjection({ campaignState: getState(), runtimeAssets });
    }

    function inspectPendingTransition({ runtimeAssets = {} } = {}) {
        return inspectV1MissionTransition({ campaignState: getState(), runtimeAssets });
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
        const spine = createV1StateSpine({
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
                    requiresReconciliation: true,
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
        if (missionEvidenceSequenceMigrationRequired(missionState)) {
            return unavailable('evidence-sequence-migration-required');
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

    async function settleAcceptedPair({ runtimeAssets = {}, snapshot = {}, hardBoundary = null } = {}) {
        const campaignState = getState();
        const resolved = resolveActiveV1MissionDefinition({ campaignState, runtimeAssets });
        if (!resolved.ok) return resolved;
        if (storySourceProvenanceMigrationRequired(campaignState)) {
            return unavailable('source-provenance-migration-required');
        }
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
        if (missionEvidenceSequenceMigrationRequired(missionState)) {
            return unavailable('evidence-sequence-migration-required');
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
            {
                id: assistantSource.contributionId,
                lineageInvalidated: contributionLineageWasInvalidated(
                    campaignState,
                    branchId,
                    sourcePair.previousAssistant,
                ),
            },
            {
                id: playerSource.contributionId,
                lineageInvalidated: contributionLineageWasInvalidated(
                    campaignState,
                    branchId,
                    sourcePair.currentPlayer,
                ),
            },
        ];
        const restoredSources = currentSources.filter((source) => source.lineageInvalidated);
        const pairAlreadySettled = restoredSources.length > 0
            ? restoredSources.every((source) => alreadySettled.has(source.id))
            : alreadySettled.has(playerSource.contributionId);
        if (pairAlreadySettled) {
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

        const gatewayBaseRevision = stateDeltaGateway.revision();
        const candidatePacket = createMissionInterpretationCandidatePacket({ definition, state: missionState });
        let interpreted;
        try {
            interpreted = await interpreter({ candidatePacket, sourcePair });
        } catch {
            return unavailable('interpretation-threw', {}, { attempted: true });
        }
        if (!interpreted?.ok) {
            return unavailable(interpreted?.reasonCode || 'interpretation-unavailable', {
                status: interpreted?.status || 'unavailable',
                candidateCount: interpreted?.diagnostics?.candidateCount ?? candidatePacket.candidates.length,
                errorCount: interpreted?.diagnostics?.errorCount ?? null,
                latencyMs: interpreted?.diagnostics?.latencyMs ?? null,
            }, { attempted: true });
        }

        const assistantAccepted = interpreted.interpretation?.assistantAcceptance === 'accepted';
        assistantSource.accepted = assistantAccepted;
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
        const dutyProposal = proposalWithDutyReportCustody({
            definition,
            proposal: interpreted.proposal,
            dutyReportResult,
        });
        const sources = [assistantSource, playerSource];
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
        ];
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
        ];
        const resolveSourceRef = (ref) => sources.find((source) => sourceMatchesRef(source, ref)) || null;
        const spine = createV1StateSpine({
            getState,
            stateDeltaGateway,
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
            const settled = await spine.settleAcceptedPair({
                definition,
                proposal: dutyProposal.proposal,
                sourceContributions: contributions,
                sourceObservations,
                gatewayBaseRevision,
                scene: {
                    episodeId: `episode.v1.${sceneHash}`,
                    sceneId: `scene.v1.${sceneHash}`,
                },
                hardBoundary,
                legacyProjection: {
                    status: campaignState?.mission?.status || campaignState?.mission?.legacyStatus || null,
                    activePhaseId: campaignState?.mission?.activePhaseId || null,
                },
                missionDefinitions: validDefinitionRecords(runtimeAssets).map((record) => record.definition),
            });
            const committedRoots = settled.noChange ? [] : ['mission', 'storySettlement'];
            const acceptedClaimCount = settled.evidence?.acceptedClaims?.length || 0;
            const rejectedClaimCount = settled.evidence?.rejectedClaims?.length || 0;
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
            return {
                ok: true,
                attempted: true,
                status: acceptedClaimCount > 0 ? 'settled' : 'settled-no-effect',
                reasonCode: null,
                definitionId: definition.id,
                definitionVersion: definition.version,
                committedRoots,
                noChange: settled.noChange,
                transitionCommitted: Boolean(settled.missionResult?.transitionPacket),
                transitionActivated: settled.transitionActivation?.status === 'activated',
                transitionActivation: settled.transitionActivation || null,
                reviewToken: settled.reviewToken || null,
                diagnostics: {
                    candidateCount: candidatePacket.candidates.length,
                    selectedClaimCount: interpreted.diagnostics?.selectedClaimCount ?? interpreted.proposal?.claims?.length ?? 0,
                    acceptedClaimCount,
                    rejectedClaimCount,
                    discardedAssistantClaimCount: interpreted.diagnostics?.discardedAssistantClaimCount ?? 0,
                    acceptedDutyReportCount,
                    strippedRequiredDutyReportClaimCount: dutyProposal.strippedRequiredClaimCount,
                    rejectedDutyReportReasonCode,
                    providerId: interpreted.diagnostics?.providerId || null,
                    model: interpreted.diagnostics?.model || null,
                    latencyMs: interpreted.diagnostics?.latencyMs ?? null,
                },
            };
        } catch (error) {
            return unavailable(errorReasonCode(error), {}, { attempted: true });
        }
    }

    async function invalidateSourceMutation({
        runtimeAssets = {},
        hostMessageId = null,
        eventType = 'source-invalidated',
    } = {}) {
        const campaignState = getState();
        const resolved = resolveActiveV1MissionDefinition({ campaignState, runtimeAssets });
        if (!resolved.ok) return resolved;
        if (storySourceProvenanceMigrationRequired(campaignState)) {
            return unavailable('source-provenance-migration-required');
        }
        const branchId = compact(campaignState?.campaignChatBinding?.saveId);
        if (!branchId) return unavailable('active-branch-unavailable');
        if (campaignState?.mission?.v1?.branchId && campaignState.mission.v1.branchId !== branchId) {
            return unavailable('mission-branch-mismatch');
        }
        if (campaignState?.storySettlement?.branchId && campaignState.storySettlement.branchId !== branchId) {
            return unavailable('story-branch-mismatch');
        }
        if (missionEvidenceSequenceMigrationRequired(campaignState?.mission?.v1)) {
            return unavailable('evidence-sequence-migration-required');
        }
        const contributionIds = contributionIdsForHostMessage(campaignState, hostMessageId);
        if (contributionIds.length === 0) {
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
            getState,
            stateDeltaGateway,
            resolveSourceRef: () => null,
            now,
        });
        const gatewayBaseRevision = stateDeltaGateway.revision();
        try {
            const invalidated = await spine.invalidateSources({
                definition: resolved.definition,
                branchId,
                contributionIds,
                gatewayBaseRevision,
                reason,
            });
            return {
                ok: true,
                attempted: true,
                status: invalidated.noChange ? 'no-change' : 'invalidated',
                reasonCode: null,
                definitionId: resolved.definition.id,
                definitionVersion: resolved.definition.version,
                invalidatedContributionCount: invalidated.invalidatedContributionIds?.length || 0,
                committedRoots: invalidated.noChange ? [] : ['mission', 'storySettlement'],
                noChange: invalidated.noChange === true,
                reviewToken: invalidated.reviewToken || null,
                diagnostics: {},
            };
        } catch (error) {
            return unavailable(errorReasonCode(error), {}, { attempted: true });
        }
    }

    async function reviewPendingEpisode({ runtimeAssets = {} } = {}) {
        const campaignState = getState();
        const resolved = resolveActiveV1MissionDefinition({ campaignState, runtimeAssets });
        if (!resolved.ok) return { ...resolved, reviewToken: createPendingEpisodeReviewToken(campaignState?.storySettlement) };
        const preflightReason = episodeReviewPreflightReason({ campaignState, definition: resolved.definition });
        if (preflightReason) {
            return {
                ...unavailable(preflightReason, {}, { attempted: false }),
                reviewToken: createPendingEpisodeReviewToken(campaignState?.storySettlement),
            };
        }
        const reviewToken = createPendingEpisodeReviewToken(campaignState?.storySettlement);
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

        let request;
        try {
            request = createEpisodeEvaluationRequest({ settlement: campaignState.storySettlement });
        } catch {
            return {
                ...unavailable('episode-review-invalid', {}, { attempted: false }),
                reviewToken,
            };
        }
        const gatewayBaseRevision = stateDeltaGateway.revision();
        let evaluated;
        try {
            evaluated = await episodeEvaluator({ request });
        } catch {
            evaluated = { ok: false, status: 'unavailable', reasonCode: 'provider-threw', diagnostics: {} };
        }
        const diagnostics = safeEpisodeDiagnostics(evaluated?.diagnostics);
        if (!evaluated?.ok || !evaluated?.proposal) {
            return {
                ...unavailable(evaluated?.reasonCode || 'episode-review-unavailable', diagnostics, { attempted: true }),
                reviewToken: createPendingEpisodeReviewToken(getState()?.storySettlement),
            };
        }

        const spine = createV1StateSpine({
            getState,
            stateDeltaGateway,
            resolveSourceRef: () => null,
            now,
            checkpointEveryContributions,
        });
        try {
            const applied = await spine.applyEpisodeReview({
                definition: resolved.definition,
                reviewToken,
                request,
                proposal: evaluated.proposal,
                gatewayBaseRevision,
            });
            const decision = evaluated.proposal.decision;
            return {
                ok: true,
                attempted: true,
                status: decision === 'continue' ? 'continued' : (decision === 'seal' ? 'sealed' : 'abstained'),
                reasonCode: null,
                definitionId: resolved.definition.id,
                definitionVersion: resolved.definition.version,
                committedRoots: applied.noChange ? [] : ['storySettlement'],
                noChange: applied.noChange,
                reviewToken: applied.reviewToken || null,
                diagnostics,
            };
        } catch (error) {
            const reasonCode = errorReasonCode(error);
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
                    requiresReconciliation: true,
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
        inspectPendingTransition,
        activatePendingTransition,
        settleAcceptedPair,
        invalidateSourceMutation,
        buildPlayerProjection,
        pendingEpisodeReview: () => createPendingEpisodeReviewToken(getState()?.storySettlement),
        reviewPendingEpisode,
    };
}

export async function settleV1MissionAcceptedPair({
    getState,
    stateDeltaGateway,
    generationRouter,
    interpretAcceptedPair,
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
        now,
        timeoutMs,
        checkpointEveryContributions,
    }).settleAcceptedPair({ runtimeAssets, snapshot, hardBoundary });
}
