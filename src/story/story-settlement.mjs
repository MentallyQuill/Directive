import {
    EMERGENT_FOCUS_KIND,
    STORY_EPISODE_KIND,
    STORY_SETTLEMENT_RECEIPT_KIND,
    validateStorySettlement,
} from './story-settlement-contracts.mjs';
import {
    createEpisodeHardBoundary,
    createInitialEpisodeBoundaryState,
} from './episode-boundary.mjs';

function activeEpisode(settlement) {
    return settlement.episodes.find((episode) => episode.id === settlement.activeEpisode) || null;
}

function assertValid(settlement) {
    const result = validateStorySettlement(settlement);
    if (!result.ok) throw new TypeError(result.errors.join('\n'));
    return settlement;
}

function normalizedEpisodeReferences(references = {}) {
    const unique = (value) => [...new Set((Array.isArray(value) ? value : []).filter(Boolean))];
    return {
        missionIds: unique(references.missionIds),
        questIds: unique(references.questIds),
        participantIds: unique(references.participantIds),
        locationIds: unique(references.locationIds),
    };
}

export function openStoryEpisode(settlement, { episodeId, sceneId, references = {} } = {}) {
    if (settlement.episodes.some((episode) => episode.sceneId === sceneId)) return structuredClone(settlement);
    if (settlement.receipts.some((receipt) => receipt.sceneId === sceneId)) return structuredClone(settlement);
    if (settlement.activeEpisode !== null) throw new TypeError('cannot open a second active episode');
    const next = structuredClone(settlement);
    next.revision += 1;
    next.activeEpisode = episodeId;
    next.episodes.push({
        kind: STORY_EPISODE_KIND,
        id: episodeId,
        branchId: next.branchId,
        sceneId,
        status: 'open',
        openedAtRevision: next.revision,
        sealedAtRevision: null,
        boundaryReason: null,
        summary: null,
        contributions: [],
        effects: [],
        unresolvedConsequences: [],
        boundaryState: createInitialEpisodeBoundaryState({ openedAtRevision: next.revision }),
        hardBoundary: null,
        references: normalizedEpisodeReferences(references),
    });
    return assertValid(next);
}

export function acceptStoryContribution(settlement, contribution) {
    const episode = activeEpisode(settlement);
    if (!episode) throw new TypeError('an active episode is required');
    if (settlement.episodes.some((item) => item.contributions.some((entry) => entry.id === contribution?.id))) {
        return structuredClone(settlement);
    }
    const next = structuredClone(settlement);
    activeEpisode(next).contributions.push(structuredClone(contribution));
    next.revision += 1;
    return assertValid(next);
}

export function acceptStoryContributions(settlement, contributions = []) {
    let next = structuredClone(settlement);
    for (const contribution of contributions) next = acceptStoryContribution(next, contribution);
    return next;
}

export function appendStoryEffects(settlement, effects = []) {
    if (!activeEpisode(settlement)) throw new TypeError('an active episode is required');
    const contributionIds = new Set(settlement.episodes.flatMap((episode) => episode.contributions.map((item) => item.id)));
    const existingEffectIds = new Set(settlement.episodes.flatMap((episode) => episode.effects.map((item) => item.id)));
    const additions = effects.filter((effect) => !existingEffectIds.has(effect?.id));
    for (const effect of additions) {
        for (const contributionId of effect?.sourceContributionIds || []) {
            if (!contributionIds.has(contributionId)) {
                throw new TypeError(`effect ${effect?.id} references unknown source contribution: ${contributionId}`);
            }
        }
    }
    if (additions.length === 0) return structuredClone(settlement);
    const next = structuredClone(settlement);
    activeEpisode(next).effects.push(...structuredClone(additions));
    next.revision += 1;
    return assertValid(next);
}

export function checkpointStoryEpisode(settlement, {
    minimumNewContributions = 8,
    force = false,
} = {}) {
    const episode = activeEpisode(settlement);
    if (!episode) throw new TypeError('an active episode is required');
    if (!Number.isInteger(minimumNewContributions) || minimumNewContributions < 1) {
        throw new TypeError('minimumNewContributions must be a positive integer');
    }
    const previous = episode.boundaryState || createInitialEpisodeBoundaryState({
        openedAtRevision: episode.openedAtRevision,
    });
    const newContributionCount = episode.contributions.length - previous.contributionCountAtLastReview;
    if (!force && newContributionCount < minimumNewContributions) return structuredClone(settlement);

    const next = structuredClone(settlement);
    next.revision += 1;
    const nextEpisode = activeEpisode(next);
    const start = Math.max(0, previous.contributionCountAtLastReview);
    nextEpisode.boundaryState = {
        kind: previous.kind,
        checkpointSequence: previous.checkpointSequence + 1,
        lastReviewedAtRevision: next.revision,
        contributionCountAtLastReview: nextEpisode.contributions.length,
        effectCountAtLastReview: nextEpisode.effects.length,
        decision: 'continue',
        sourceContributionIds: nextEpisode.contributions.slice(start).map((item) => item.id),
    };
    return assertValid(next);
}

export function sealStoryEpisode(settlement, {
    boundaryReason,
    hardBoundary = null,
    summary,
    unresolvedConsequences = [],
    significance = {},
} = {}) {
    const episode = activeEpisode(settlement);
    if (!episode) throw new TypeError('an active episode is required');
    const isSignificant = episode.effects.length > 0
        || unresolvedConsequences.length > 0
        || significance.lastingChange === true
        || significance.meaningfulDisclosure === true;
    if (!isSignificant) throw new TypeError('episode does not meet semantic significance requirements');

    const next = structuredClone(settlement);
    next.revision += 1;
    const nextEpisode = activeEpisode(next);
    nextEpisode.status = 'sealed';
    nextEpisode.sealedAtRevision = next.revision;
    nextEpisode.boundaryReason = boundaryReason;
    nextEpisode.hardBoundary = hardBoundary ? structuredClone(hardBoundary) : null;
    nextEpisode.summary = summary;
    nextEpisode.unresolvedConsequences = structuredClone(unresolvedConsequences);
    next.activeEpisode = null;
    next.receipts.push({
        kind: STORY_SETTLEMENT_RECEIPT_KIND,
        id: `receipt.${nextEpisode.id}.sealed`,
        branchId: next.branchId,
        sceneId: nextEpisode.sceneId,
        disposition: 'sealed',
        episodeId: nextEpisode.id,
        sourceContributionIds: nextEpisode.contributions.map((item) => item.id),
        sourceMessageIds: nextEpisode.contributions.map((item) => item.messageId),
        settledAtRevision: next.revision,
    });
    return assertValid(next);
}

export function settleInsignificantScene(settlement, {
    sceneId,
    sourceContributionIds = [],
    sourceContributions = [],
} = {}) {
    if (settlement.episodes.some((episode) => episode.sceneId === sceneId)) return structuredClone(settlement);
    if (settlement.receipts.some((receipt) => receipt.sceneId === sceneId)) return structuredClone(settlement);
    if (settlement.activeEpisode !== null) throw new TypeError('cannot settle another scene while an episode is active');
    const next = structuredClone(settlement);
    next.revision += 1;
    const contributionsById = new Map((Array.isArray(sourceContributions) ? sourceContributions : [])
        .filter((item) => item?.id)
        .map((item) => [item.id, item]));
    const contributionIds = [...new Set([
        ...sourceContributionIds,
        ...contributionsById.keys(),
    ])];
    const sourceMessageIds = contributionIds.map((id) => contributionsById.get(id)?.messageId || null);
    next.receipts.push({
        kind: STORY_SETTLEMENT_RECEIPT_KIND,
        id: `receipt.${sceneId}.insignificant`,
        branchId: next.branchId,
        sceneId,
        disposition: 'insignificant',
        episodeId: null,
        sourceContributionIds: contributionIds,
        sourceMessageIds,
        settledAtRevision: next.revision,
    });
    return assertValid(next);
}

export function setEmergentFocus(settlement, focus) {
    if (focus === null) {
        if (settlement.focus === null) return structuredClone(settlement);
        const next = structuredClone(settlement);
        next.revision += 1;
        next.focus = null;
        return assertValid(next);
    }
    if (
        settlement.focus?.id === focus?.focusId
        && settlement.focus?.episodeId === focus?.episodeId
        && settlement.focus?.consequenceId === focus?.consequenceId
    ) {
        return structuredClone(settlement);
    }
    const next = structuredClone(settlement);
    next.revision += 1;
    next.focus = {
        kind: EMERGENT_FOCUS_KIND,
        id: focus?.focusId,
        branchId: next.branchId,
        episodeId: focus?.episodeId,
        consequenceId: focus?.consequenceId,
        setAtRevision: next.revision,
    };
    return assertValid(next);
}

function supersededEpisodeIds(episode) {
    return [
        ...(Array.isArray(episode?.supersedesEpisodeIds) ? episode.supersedesEpisodeIds : []),
        ...(episode?.supersedesEpisodeId ? [episode.supersedesEpisodeId] : []),
    ];
}

export function selectCurrentStoryEpisodes(settlement = {}) {
    const sealed = (settlement.episodes || []).filter((episode) => episode.status === 'sealed');
    const superseded = new Set(sealed.flatMap(supersededEpisodeIds));
    return sealed
        .filter((episode) => !superseded.has(episode.id))
        .sort((left, right) => (
            left.sealedAtRevision - right.sealedAtRevision
            || left.openedAtRevision - right.openedAtRevision
            || left.id.localeCompare(right.id)
        ))
        .map((episode) => structuredClone(episode));
}

function hasInvalidationReceipt(settlement, sceneId, episodeId, contributionId) {
    return settlement.receipts.some((candidate) => (
        candidate.disposition === 'invalidated'
        && candidate.sceneId === sceneId
        && candidate.episodeId === episodeId
        && candidate.sourceContributionIds.includes(contributionId)
    ));
}

function replacementForEpisode(next, episode, invalidated, summarizeEffects) {
    const survivorEffects = episode.effects.filter((effect) => (
        effect.status === 'active'
        && !(effect.sourceContributionIds || []).some((id) => invalidated.has(id))
    ));
    if (survivorEffects.length === 0) return null;
    const referenced = new Set(survivorEffects.flatMap((effect) => effect.sourceContributionIds || []));
    const survivorContributions = episode.contributions.filter((item) => referenced.has(item.id));
    const replacementId = `${episode.id}.supersession.${next.revision}`;
    const sceneId = `${episode.sceneId}.recovery.${next.revision}`;
    const summary = String(summarizeEffects?.(structuredClone(survivorEffects), structuredClone(episode)) || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 1024)
        || 'A material story development remains after source recovery.';
    const boundary = createEpisodeHardBoundary({
        id: `boundary.source-recovery.${episode.id}.${next.revision}`,
        branchId: next.branchId,
        code: 'source-recovery',
        source: {
            kind: 'sourceRecovery',
            id: `source-recovery.${episode.id}.${next.revision}`,
        },
        sourceContributionIds: survivorContributions.map((item) => item.id),
    });
    return {
        kind: STORY_EPISODE_KIND,
        id: replacementId,
        branchId: next.branchId,
        sceneId,
        status: 'sealed',
        openedAtRevision: episode.openedAtRevision,
        sealedAtRevision: next.revision,
        boundaryReason: boundary.code,
        summary,
        contributions: structuredClone(survivorContributions),
        effects: structuredClone(survivorEffects),
        unresolvedConsequences: [],
        boundaryState: {
            ...createInitialEpisodeBoundaryState({ openedAtRevision: episode.openedAtRevision }),
            checkpointSequence: (episode.boundaryState?.checkpointSequence || 0) + 1,
            lastReviewedAtRevision: next.revision,
            contributionCountAtLastReview: survivorContributions.length,
            effectCountAtLastReview: survivorEffects.length,
            sourceContributionIds: survivorContributions.map((item) => item.id),
        },
        hardBoundary: boundary,
        supersedesEpisodeIds: [episode.id],
        references: normalizedEpisodeReferences(episode.references),
    };
}

export function invalidateStorySources(settlement, {
    contributionIds = [],
    reason = 'source-invalidated',
    summarizeEffects = null,
} = {}) {
    const requested = new Set((Array.isArray(contributionIds) ? contributionIds : []).filter(Boolean));
    if (requested.size === 0) return structuredClone(settlement);
    const episodeWork = new Map();
    for (const episode of settlement.episodes || []) {
        if (!new Set(['open', 'sealPending', 'sealed']).has(episode.status)) continue;
        const pending = episode.contributions
            .map((item) => item.id)
            .filter((id) => requested.has(id) && !hasInvalidationReceipt(settlement, episode.sceneId, episode.id, id));
        if (pending.length > 0) episodeWork.set(episode.id, pending);
    }
    const receiptWork = [];
    for (const receipt of settlement.receipts || []) {
        if (receipt.disposition !== 'insignificant') continue;
        for (const contributionId of receipt.sourceContributionIds || []) {
            if (requested.has(contributionId)
                && !hasInvalidationReceipt(settlement, receipt.sceneId, null, contributionId)) {
                receiptWork.push({ receipt, contributionId });
            }
        }
    }
    if (episodeWork.size === 0 && receiptWork.length === 0) return structuredClone(settlement);

    const next = structuredClone(settlement);
    next.revision += 1;
    const activeEpisodeIdsToRemove = new Set();
    const replacements = [];
    for (const episode of next.episodes) {
        const pending = episodeWork.get(episode.id);
        if (!pending) continue;
        const invalidated = new Set(pending);
        const sourceMessageByContributionId = new Map(
            episode.contributions.map((item) => [item.id, item.messageId]),
        );
        if (next.activeEpisode === episode.id) {
            episode.effects = episode.effects.filter(
                (effect) => !(effect.sourceContributionIds || []).some((id) => invalidated.has(id)),
            );
            const stillReferenced = new Set(episode.effects.flatMap((effect) => effect.sourceContributionIds || []));
            episode.contributions = episode.contributions.filter((item) => stillReferenced.has(item.id));
            episode.unresolvedConsequences = [];
            if (episode.effects.length === 0) {
                activeEpisodeIdsToRemove.add(episode.id);
                next.activeEpisode = null;
            }
        } else {
            const replacement = replacementForEpisode(next, episode, invalidated, summarizeEffects);
            episode.status = 'invalidated';
            episode.invalidationReason = reason;
            for (const effect of episode.effects) effect.status = 'invalidated';
            for (const consequence of episode.unresolvedConsequences) consequence.status = 'invalidated';
            if (replacement) replacements.push(replacement);
        }
        for (const contributionId of pending) {
            const sourceMessageId = sourceMessageByContributionId.get(contributionId);
            next.receipts.push({
                kind: STORY_SETTLEMENT_RECEIPT_KIND,
                id: `receipt.${episode.id}.invalidated.${contributionId}`,
                branchId: next.branchId,
                sceneId: episode.sceneId,
                disposition: 'invalidated',
                episodeId: episode.id,
                sourceContributionIds: [contributionId],
                sourceMessageIds: sourceMessageId ? [sourceMessageId] : [],
                settledAtRevision: next.revision,
            });
        }
    }
    if (activeEpisodeIdsToRemove.size > 0) {
        next.episodes = next.episodes.filter((episode) => !activeEpisodeIdsToRemove.has(episode.id));
    }
    for (const replacement of replacements) {
        next.episodes.push(replacement);
        next.receipts.push({
            kind: STORY_SETTLEMENT_RECEIPT_KIND,
            id: `receipt.${replacement.id}.sealed`,
            branchId: next.branchId,
            sceneId: replacement.sceneId,
            disposition: 'sealed',
            episodeId: replacement.id,
            sourceContributionIds: replacement.contributions.map((item) => item.id),
            sourceMessageIds: replacement.contributions.map((item) => item.messageId),
            settledAtRevision: next.revision,
        });
    }
    for (const { receipt, contributionId } of receiptWork) {
        const index = receipt.sourceContributionIds.indexOf(contributionId);
        const sourceMessageId = receipt.sourceMessageIds?.[index] || null;
        next.receipts.push({
            kind: STORY_SETTLEMENT_RECEIPT_KIND,
            id: `receipt.${receipt.sceneId}.invalidated.${contributionId}`,
            branchId: next.branchId,
            sceneId: receipt.sceneId,
            disposition: 'invalidated',
            episodeId: null,
            sourceContributionIds: [contributionId],
            sourceMessageIds: sourceMessageId ? [sourceMessageId] : [],
            settledAtRevision: next.revision,
        });
    }
    if (next.focus && episodeWork.has(next.focus.episodeId)) next.focus = null;
    return assertValid(next);
}

export function invalidateStorySource(settlement, { contributionId, reason } = {}) {
    return invalidateStorySources(settlement, {
        contributionIds: [contributionId],
        reason,
    });
}
