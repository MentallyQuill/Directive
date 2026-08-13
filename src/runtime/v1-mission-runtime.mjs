import {
    createMissionAcceptedPairInterpreter,
    MISSION_EVIDENCE_INTERPRETER_TIMEOUT_MS,
} from '../mission/v1/accepted-pair-interpreter.mjs';
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
    findTimeBoundaryForPlayerMessage,
    findTimeBoundaryForSourceAnchorRange,
} from './v1-accepted-pair-time.mjs';

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
    const secondOfDay = ledger.shipClock?.secondOfDay
        ?? (Number(ledger.shipClock?.minuteOfDay || 0) * 60);
    const elapsedSeconds = ledger.elapsedSeconds
        ?? (Number(ledger.elapsedMinutes || campaignState?.worldState?.elapsedMinutes || 0) * 60);
    return {
        current: {
            stardate: ledger.stardate ?? campaignState?.worldState?.currentStardate ?? campaignState?.campaign?.currentStardate ?? null,
            secondOfDay,
            minuteOfDay: Math.floor(secondOfDay / 60),
            elapsedSeconds,
            elapsedMinutes: Math.floor(elapsedSeconds / 60),
        },
        footer: snapshot?.source?.previousAssistant?.timeFooter || null,
        stardatePerDay: runtimeAssets?.packageData?.world?.layout?.stardatePerDay ?? 1,
    };
}

function timeBoundaryAnchorRange(boundary = {}) {
    return boundary.sourceAnchorRange
        || boundary.adjudication?.sourceAnchorRange
        || boundary.metadata?.sourceAnchorRange
        || null;
}

function timeBoundaryElapsedSeconds(boundary = {}) {
    const seconds = Number(boundary?.elapsedSeconds);
    if (Number.isInteger(seconds) && seconds >= 0) return seconds;
    const minutes = Number(boundary?.elapsedMinutes);
    return Number.isFinite(minutes) && minutes >= 0 ? Math.round(minutes * 60) : 0;
}

function acceptedSceneTimeBoundary(campaignState = {}, snapshot = {}) {
    const currentPlayerHostMessageId = compact(snapshot?.source?.currentPlayer?.hostMessageId);
    const byPlayer = findTimeBoundaryForPlayerMessage(campaignState, currentPlayerHostMessageId);
    const expectedAnchor = {
        kind: 'acceptedPair',
        previousAssistantHostMessageId: compact(snapshot?.source?.previousAssistant?.hostMessageId) || null,
        currentPlayerHostMessageId: currentPlayerHostMessageId || null,
        rangeHash: compact(snapshot?.source?.sourceRangeHash) || null,
    };
    const byRange = findTimeBoundaryForSourceAnchorRange(campaignState, expectedAnchor);
    const ledger = campaignState?.timeLedger || {};
    const candidates = [
        byPlayer,
        byRange,
        ...(Array.isArray(ledger.entries) ? ledger.entries : []),
        ledger.lastBoundary,
    ].filter(Boolean);
    return candidates.find((boundary) => {
        if (boundary?.kind !== 'directive.timeBoundary.v1') return false;
        if (timeBoundaryElapsedSeconds(boundary) <= 0) return false;
        const anchor = timeBoundaryAnchorRange(boundary);
        if (!anchor) return false;
        return compact(anchor.previousAssistantHostMessageId) === compact(expectedAnchor.previousAssistantHostMessageId)
            && compact(anchor.currentPlayerHostMessageId) === compact(expectedAnchor.currentPlayerHostMessageId)
            && compact(anchor.rangeHash) === compact(expectedAnchor.rangeHash);
    }) || null;
}

function clockAdvanceValue(clockDefinition = {}, elapsedMinutes = 0) {
    const minutes = Number(elapsedMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) return null;
    const unit = compact(clockDefinition.unit).toLowerCase();
    if (new Set(['minute', 'minutes']).has(unit)) return minutes;
    if (new Set(['hour', 'hours']).has(unit)) return minutes / 60;
    if (new Set(['day', 'days']).has(unit)) return minutes / 1440;
    return null;
}

function timeBoundaryAdvanceSources(boundary = {}) {
    return new Set([
        'authoritativeStoryTime',
        compact(boundary.source),
        compact(boundary.type),
        compact(boundary.reason),
        compact(boundary.adjudication?.source),
    ].filter(Boolean));
}

function boundaryCurrentPlayerHostMessageId(boundary = {}) {
    return compact(timeBoundaryAnchorRange(boundary)?.currentPlayerHostMessageId);
}

function timeBoundarySourceMessageId(boundary = {}, role = 'runtime') {
    const anchor = timeBoundaryAnchorRange(boundary);
    const hostToken = stableHash(boundaryCurrentPlayerHostMessageId(boundary) || 'no-player-source');
    const boundaryToken = stableHash([
        compact(boundary.id),
        compact(anchor?.rangeHash),
        timeBoundaryElapsedSeconds(boundary),
    ].join('|'));
    return `time-boundary:${hostToken}:${boundaryToken}:${role}`;
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

function materializeAuthoritativeTimeEvidence({
    definition = {},
    missionState = {},
    campaignState = {},
    snapshot = {},
    branchId = '',
} = {}) {
    const boundary = acceptedSceneTimeBoundary(campaignState, snapshot);
    const elapsedSeconds = timeBoundaryElapsedSeconds(boundary);
    const elapsedMinutes = elapsedSeconds / 60;
    if (!boundary || elapsedSeconds <= 0) {
        return { boundary: null, claims: [], sources: [], contributions: [], observations: [] };
    }
    const acceptedAdvanceSources = timeBoundaryAdvanceSources(boundary);
    const policies = (definition.evidencePolicies || []).filter((policy) => policy?.claimType === 'timeAdvanced');
    const eligible = [];
    for (const clock of definition.clocks || []) {
        if (missionState.clocks?.[clock.id]?.state !== 'running') continue;
        if (!(clock.advanceSources || []).some((source) => acceptedAdvanceSources.has(compact(source)))) continue;
        const value = clockAdvanceValue(clock, elapsedMinutes);
        if (!Number.isFinite(value) || value <= 0) continue;
        const policy = policies.find((candidate) => candidate.targetId === clock.id);
        const role = policy?.sourceRoles?.includes('runtime')
            ? 'runtime'
            : (policy?.sourceRoles?.includes('adjudicator') ? 'adjudicator' : null);
        if (!policy || !role) continue;
        eligible.push({ clock, policy, role, value });
    }
    if (eligible.length === 0) {
        return { boundary, claims: [], sources: [], contributions: [], observations: [] };
    }

    const sourceByRole = new Map();
    const boundaryAnchor = timeBoundaryAnchorRange(boundary);
    for (const role of new Set(eligible.map((item) => item.role))) {
        const messageId = timeBoundarySourceMessageId(boundary, role);
        const text = `Authoritative story time advanced by ${elapsedSeconds} seconds at ${compact(boundary.id) || 'the accepted scene boundary'}.`;
        const sourceInput = {
            messageId,
            selectedSwipeId: null,
            textHash: stableHash([
                compact(boundary.id),
                compact(boundaryAnchor?.rangeHash),
                elapsedSeconds,
                role,
            ].join('|')),
            text,
        };
        const contributionId = activeContributionId(campaignState, branchId, sourceInput);
        const source = sourceResolutionRecord(
            branchId,
            role,
            sourceInput,
            missionState.revision,
            contributionId,
        );
        sourceByRole.set(role, {
            source,
            contribution: contributionFor(
                branchId,
                role,
                sourceInput,
                missionState.revision,
                contributionId,
            ),
            observation: {
                contributionId,
                role,
                textHash: sourceInput.textHash,
                text,
            },
        });
    }

    const claims = eligible.map(({ clock, policy, role, value }) => {
        const source = sourceByRole.get(role).source;
        return {
            claimId: `claim.authoritative-time.${stableHash([
                compact(boundary.id),
                compact(boundaryAnchor?.rangeHash),
                clock.id,
            ].join('|'))}.${clock.id}`,
            policyId: policy.id,
            claimType: 'timeAdvanced',
            targetId: clock.id,
            value,
            sourceRef: {
                messageId: source.messageId,
                swipeId: null,
                textHash: source.textHash,
            },
        };
    });
    return {
        boundary,
        claims,
        sources: [...sourceByRole.values()].map((record) => record.source),
        contributions: [...sourceByRole.values()].map((record) => record.contribution),
        observations: [...sourceByRole.values()].map((record) => record.observation),
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
} = {}) {
    if (typeof getState !== 'function') throw new TypeError('getState is required');
    if (typeof stateDeltaGateway?.revision !== 'function'
        || typeof stateDeltaGateway?.applyProposal !== 'function') {
        throw new TypeError('stateDeltaGateway with revision and applyProposal is required');
    }
    const interpreter = interpretAcceptedPair || createMissionAcceptedPairInterpreter({ generationRouter, timeoutMs });
    let cachedInterpretation = null;
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

    function prepareTransitionNarration({ runtimeAssets = {} } = {}) {
        const campaignState = getState();
        if (!campaignState) return unavailable('campaign-state-unavailable');
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

    async function settleAcceptedPair({
        runtimeAssets = {},
        snapshot = {},
        hardBoundary = null,
        acceptedCommandBearingEdge = null,
    } = {}) {
        let campaignState = getState();
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
            if (cachedInterpretation?.key === interpretationKey) cachedInterpretation = null;
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
        const candidatePacket = createMissionInterpretationCandidatePacket({ definition, state: missionState });
        let interpreted;
        const interpretationReused = cachedInterpretation?.key === interpretationKey;
        if (interpretationReused) {
            interpreted = structuredClone(cachedInterpretation.value);
        } else {
            try {
                interpreted = await interpreter({
                    candidatePacket,
                    sourcePair,
                    timeContext: timeContextFromSnapshot(campaignState, snapshot, runtimeAssets),
                });
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
                return unavailable(time?.reasonCode || 'time-custody-unavailable', {}, { attempted: true });
            }
        }
        const gatewayBaseRevision = stateDeltaGateway.revision();
        const plannedCampaignState = time?.patch
            ? { ...campaignState, ...structuredClone(time.patch) }
            : campaignState;

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
        const authoritativeTime = materializeAuthoritativeTimeEvidence({
            definition,
            missionState,
            campaignState: plannedCampaignState,
            snapshot,
            branchId,
        });
        const settlementProposal = {
            ...dutyProposal.proposal,
            claims: [
                ...(dutyProposal.proposal?.claims || []),
                ...authoritativeTime.claims,
            ],
        };
        const sources = [assistantSource, playerSource, ...authoritativeTime.sources];
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
            ...authoritativeTime.contributions,
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
            ...authoritativeTime.observations,
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
                proposal: settlementProposal,
                sourceContributions: contributions,
                sourceObservations,
                gatewayBaseRevision,
                scene: {
                    episodeId: `episode.v1.${sceneHash}`,
                    sceneId: `scene.v1.${sceneHash}`,
                },
                hardBoundary,
                missionDefinitions: validDefinitionRecords(runtimeAssets).map((record) => record.definition),
                authorityPatch: time?.patch || {},
                authorityDomains: time?.domains || [],
                acceptedCommandBearingEdge,
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
                acceptedCommandBearingEdge: settled.acceptedCommandBearingEdge || null,
                diagnostics: {
                    candidateCount: candidatePacket.candidates.length,
                    selectedClaimCount: interpreted.diagnostics?.selectedClaimCount ?? interpreted.proposal?.claims?.length ?? 0,
                    acceptedClaimCount,
                    rejectedClaimCount,
                    discardedAssistantClaimCount: interpreted.diagnostics?.discardedAssistantClaimCount ?? 0,
                    acceptedDutyReportCount,
                    acceptedTimeAdvanceCount: (settled.evidence?.acceptedClaims || [])
                        .filter((claim) => claim?.claimType === 'timeAdvanced').length,
                    commandBearingAwardCount: settled.commandBearingAwardCount || 0,
                    strippedRequiredDutyReportClaimCount: dutyProposal.strippedRequiredClaimCount,
                    rejectedDutyReportReasonCode,
                    authoritativeTimeBoundaryId: authoritativeTime.boundary?.id || null,
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
            };
        } catch (error) {
            const reasonCode = errorReasonCode(error);
            if (reasonCode !== 'persistence-failed' && cachedInterpretation?.key === interpretationKey) {
                cachedInterpretation = null;
            }
            return unavailable(reasonCode, { interpretationReused }, { attempted: true });
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
        const branchId = compact(campaignState?.campaignChatBinding?.saveId);
        if (!branchId) return unavailable('active-branch-unavailable');
        if (campaignState?.mission?.v1?.branchId && campaignState.mission.v1.branchId !== branchId) {
            return unavailable('mission-branch-mismatch');
        }
        if (campaignState?.storySettlement?.branchId && campaignState.storySettlement.branchId !== branchId) {
            return unavailable('story-branch-mismatch');
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
                missionDefinitions: validDefinitionRecords(runtimeAssets).map((record) => record.definition),
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
                definitionId: invalidated.definitionId || resolved.definition.id,
                definitionVersion: invalidated.definitionVersion || resolved.definition.version,
                invalidatedContributionCount: invalidated.invalidatedContributionIds?.length || 0,
                committedRoots: invalidated.noChange
                    ? []
                    : (invalidated.missionChanged === false ? ['storySettlement'] : ['mission', 'storySettlement']),
                noChange: invalidated.noChange === true,
                reviewToken: invalidated.reviewToken || null,
                journeyRollback: invalidated.journeyRollback || null,
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
