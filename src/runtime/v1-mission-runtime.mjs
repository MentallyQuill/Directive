import { createMissionAcceptedPairInterpreter } from '../mission/v1/accepted-pair-interpreter.mjs';
import { createMissionInterpretationCandidatePacket } from '../mission/v1/interpretation-candidates.mjs';
import { validateMissionDefinition } from '../mission/v1/mission-contracts.mjs';
import { createV1StateSpine, resolveV1MissionState } from './v1-state-spine.mjs';

const SETTLED_SOURCE_SCAN_LIMIT = 256;

function compact(value) {
    return String(value ?? '').trim();
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
    const player = snapshot?.source?.currentPlayer || {};
    return {
        previousAssistant: {
            messageId: compact(previous.hostMessageId),
            selectedSwipeId: selectedSwipeId(previous),
            textHash: compact(previous.textHash),
            text: String(previous.text || ''),
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

function contributionId(branchId, source) {
    return `contribution.v1.${stableHash([
        branchId,
        source.messageId,
        source.selectedSwipeId || 'no-swipe',
        source.textHash,
    ].join('|'))}`;
}

function contributionFor(branchId, role, source, acceptedAtRevision) {
    return {
        id: contributionId(branchId, source),
        messageId: source.messageId,
        swipeId: source.selectedSwipeId,
        role,
        textHash: source.textHash,
        acceptedAtRevision,
    };
}

function sourceResolutionRecord(branchId, role, source, acceptedAtRevision, accepted = true) {
    const contribution = contributionFor(branchId, role, source, acceptedAtRevision);
    return {
        contributionId: contribution.id,
        messageId: contribution.messageId,
        branchId,
        accepted,
        selectedSwipeId: contribution.swipeId,
        textHash: contribution.textHash,
        role,
        acceptedAtRevision,
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
    return new Set(ids.slice(-SETTLED_SOURCE_SCAN_LIMIT));
}

function errorReasonCode(error) {
    if (error?.code === 'DIRECTIVE_STATE_REVISION_CONFLICT') return 'state-revision-conflict';
    if (error?.code === 'DIRECTIVE_MISSION_EVIDENCE_STALE') return 'mission-revision-conflict';
    if (error?.code === 'DIRECTIVE_MISSION_DEFINITION_MIGRATION_REQUIRED') return 'definition-migration-required';
    if (error?.code === 'DIRECTIVE_MISSION_EVIDENCE_REJECTED') return 'evidence-rejected';
    return 'settlement-failed';
}

export function createV1MissionRuntime({
    getState,
    stateDeltaGateway,
    generationRouter = null,
    interpretAcceptedPair = null,
    now = () => new Date().toISOString(),
    timeoutMs = 10000,
} = {}) {
    if (typeof getState !== 'function') throw new TypeError('getState is required');
    if (typeof stateDeltaGateway?.revision !== 'function'
        || typeof stateDeltaGateway?.applyProposal !== 'function') {
        throw new TypeError('stateDeltaGateway with revision and applyProposal is required');
    }
    const interpreter = interpretAcceptedPair || createMissionAcceptedPairInterpreter({ generationRouter, timeoutMs });

    async function settleAcceptedPair({ runtimeAssets = {}, snapshot = {}, hardBoundary = null } = {}) {
        const campaignState = getState();
        const resolved = resolveActiveV1MissionDefinition({ campaignState, runtimeAssets });
        if (!resolved.ok) return resolved;
        const { definition } = resolved;
        const integrityReason = snapshotIntegrityReason(snapshot);
        if (integrityReason) return unavailable(integrityReason);
        const envelopeReason = snapshotEnvelopeReason({ snapshot, state: campaignState, definition });
        if (envelopeReason) return unavailable(envelopeReason);

        const branchId = compact(snapshot.envelope.saveId);
        let missionState;
        try {
            missionState = resolveV1MissionState({ campaignState, definition, branchId });
        } catch (error) {
            return unavailable(errorReasonCode(error));
        }
        const sourcePair = sourcePairFromSnapshot(snapshot);
        const assistantSource = sourceResolutionRecord(
            branchId,
            'assistant',
            sourcePair.previousAssistant,
            missionState.revision,
        );
        const playerSource = sourceResolutionRecord(
            branchId,
            'user',
            sourcePair.currentPlayer,
            missionState.revision,
        );
        const alreadySettled = settledContributionIds(campaignState);
        if (alreadySettled.has(assistantSource.contributionId)
            || alreadySettled.has(playerSource.contributionId)) {
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
        const sources = [assistantSource, playerSource];
        const contributions = [
            ...(assistantAccepted ? [contributionFor(
                branchId,
                'assistant',
                sourcePair.previousAssistant,
                missionState.revision,
            )] : []),
            contributionFor(branchId, 'user', sourcePair.currentPlayer, missionState.revision),
        ];
        const resolveSourceRef = (ref) => sources.find((source) => sourceMatchesRef(source, ref)) || null;
        const spine = createV1StateSpine({
            getState,
            stateDeltaGateway,
            resolveSourceRef,
            now,
        });
        const sourceRangeHash = compact(snapshot.source.sourceRangeHash);
        const sceneHash = stableHash(`${branchId}|${sourceRangeHash}`);
        try {
            const settled = await spine.settleAcceptedPair({
                definition,
                proposal: interpreted.proposal,
                sourceContributions: contributions,
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
            });
            const committedRoots = settled.noChange ? [] : ['mission', 'storySettlement'];
            const acceptedClaimCount = settled.evidence?.acceptedClaims?.length || 0;
            const rejectedClaimCount = settled.evidence?.rejectedClaims?.length || 0;
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
                diagnostics: {
                    candidateCount: candidatePacket.candidates.length,
                    selectedClaimCount: interpreted.diagnostics?.selectedClaimCount ?? interpreted.proposal?.claims?.length ?? 0,
                    acceptedClaimCount,
                    rejectedClaimCount,
                    discardedAssistantClaimCount: interpreted.diagnostics?.discardedAssistantClaimCount ?? 0,
                    providerId: interpreted.diagnostics?.providerId || null,
                    model: interpreted.diagnostics?.model || null,
                    latencyMs: interpreted.diagnostics?.latencyMs ?? null,
                },
            };
        } catch (error) {
            return unavailable(errorReasonCode(error), {}, { attempted: true });
        }
    }

    return {
        resolveActiveDefinition: (runtimeAssets) => resolveActiveV1MissionDefinition({
            campaignState: getState(),
            runtimeAssets,
        }),
        settleAcceptedPair,
    };
}

export async function settleV1MissionAcceptedPair({
    getState,
    stateDeltaGateway,
    generationRouter,
    interpretAcceptedPair,
    now,
    timeoutMs,
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
    }).settleAcceptedPair({ runtimeAssets, snapshot, hardBoundary });
}
