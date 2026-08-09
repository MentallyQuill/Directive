import {
    EMERGENT_FOCUS_KIND,
    STORY_EPISODE_KIND,
    STORY_SETTLEMENT_RECEIPT_KIND,
    validateStorySettlement,
} from './story-settlement-contracts.mjs';

function activeEpisode(settlement) {
    return settlement.episodes.find((episode) => episode.id === settlement.activeEpisode) || null;
}

function assertValid(settlement) {
    const result = validateStorySettlement(settlement);
    if (!result.ok) throw new TypeError(result.errors.join('\n'));
    return settlement;
}

export function openStoryEpisode(settlement, { episodeId, sceneId } = {}) {
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

export function sealStoryEpisode(settlement, {
    boundaryReason,
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
        settledAtRevision: next.revision,
    });
    return assertValid(next);
}

export function settleInsignificantScene(settlement, { sceneId, sourceContributionIds = [] } = {}) {
    if (settlement.episodes.some((episode) => episode.sceneId === sceneId)) return structuredClone(settlement);
    if (settlement.receipts.some((receipt) => receipt.sceneId === sceneId)) return structuredClone(settlement);
    if (settlement.activeEpisode !== null) throw new TypeError('cannot settle another scene while an episode is active');
    const next = structuredClone(settlement);
    next.revision += 1;
    next.receipts.push({
        kind: STORY_SETTLEMENT_RECEIPT_KIND,
        id: `receipt.${sceneId}.insignificant`,
        branchId: next.branchId,
        sceneId,
        disposition: 'insignificant',
        episodeId: null,
        sourceContributionIds: [...new Set(sourceContributionIds)],
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

export function invalidateStorySource(settlement, { contributionId, reason } = {}) {
    const dependentEpisodeIds = new Set(
        settlement.episodes
            .filter((episode) => episode.contributions.some((contribution) => contribution.id === contributionId))
            .map((episode) => episode.id),
    );
    if (dependentEpisodeIds.size === 0) return structuredClone(settlement);
    const alreadyInvalidated = [...dependentEpisodeIds].every((episodeId) => (
        settlement.episodes.find((episode) => episode.id === episodeId)?.status === 'invalidated'
    ));
    if (alreadyInvalidated) return structuredClone(settlement);

    const next = structuredClone(settlement);
    next.revision += 1;
    for (const episode of next.episodes) {
        if (!dependentEpisodeIds.has(episode.id)) continue;
        episode.status = 'invalidated';
        episode.invalidationReason = reason;
        for (const effect of episode.effects) {
            if (effect.sourceContributionIds.includes(contributionId)) effect.status = 'invalidated';
        }
        for (const consequence of episode.unresolvedConsequences) consequence.status = 'invalidated';
        if (next.activeEpisode === episode.id) next.activeEpisode = null;
        next.receipts.push({
            kind: STORY_SETTLEMENT_RECEIPT_KIND,
            id: `receipt.${episode.id}.invalidated`,
            branchId: next.branchId,
            sceneId: episode.sceneId,
            disposition: 'invalidated',
            episodeId: episode.id,
            sourceContributionIds: [contributionId],
            settledAtRevision: next.revision,
        });
    }
    if (next.focus && dependentEpisodeIds.has(next.focus.episodeId)) next.focus = null;
    return assertValid(next);
}
