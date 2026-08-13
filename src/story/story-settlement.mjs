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
import {
    appendStoryWorkingEvidence,
    createEmptyStoryWorkingCapsule,
    repairStoryWorkingCapsule,
    replaceStoryWorkingSemantics,
} from './working-capsule.mjs';
import { validatePeopleEvent } from '../people/people-event-contracts.mjs';

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
    assertValid(settlement);
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
        characterMoments: [],
        peopleEvents: [],
        workingCapsule: createEmptyStoryWorkingCapsule({ updatedAtRevision: next.revision }),
    });
    return assertValid(next);
}

export function acceptStoryContribution(settlement, contribution) {
    assertValid(settlement);
    const episode = activeEpisode(settlement);
    if (!episode) throw new TypeError('an active episode is required');
    if (settlement.episodes.some((item) => item.contributions.some((entry) => entry.id === contribution?.id))) {
        return structuredClone(settlement);
    }
    const next = structuredClone(settlement);
    next.revision += 1;
    const nextEpisode = activeEpisode(next);
    nextEpisode.contributions.push(structuredClone(contribution));
    return assertValid(next);
}

export function acceptStoryContributions(settlement, contributions = []) {
    let next = structuredClone(settlement);
    for (const contribution of contributions) next = acceptStoryContribution(next, contribution);
    return next;
}

export function appendStoryEffects(settlement, effects = []) {
    assertValid(settlement);
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
    next.revision += 1;
    const nextEpisode = activeEpisode(next);
    nextEpisode.effects.push(...structuredClone(additions));
    return assertValid(next);
}

export function appendStoryPeopleEvents(settlement, events = []) {
    assertValid(settlement);
    const episode = activeEpisode(settlement);
    if (!episode) throw new TypeError('an active episode is required');
    const contributionIds = episode.contributions.map((item) => item.id);
    const existingIds = new Set((episode.peopleEvents || []).map((event) => event.id));
    const additions = events.filter((event) => !existingIds.has(event?.id));
    const knownPersonIds = new Set([
        ...(episode.references?.participantIds || []),
        ...additions.filter((event) => event?.type === 'personIntroduced').map((event) => event.personId),
    ]);
    for (const event of additions) {
        const result = validatePeopleEvent(event, {
            knownContributionIds: contributionIds,
            knownPersonIds: [...knownPersonIds],
        });
        if (!result.ok) throw new TypeError(result.errors.join('\n'));
    }
    if (additions.length === 0) return structuredClone(settlement);
    const next = structuredClone(settlement);
    next.revision += 1;
    const nextEpisode = activeEpisode(next);
    if (!Array.isArray(nextEpisode.peopleEvents)) nextEpisode.peopleEvents = [];
    nextEpisode.peopleEvents.push(...structuredClone(additions));
    const participantIds = new Set(nextEpisode.references.participantIds || []);
    for (const event of additions) participantIds.add(event.personId);
    nextEpisode.references.participantIds = [...participantIds];
    return assertValid(next);
}

export function observeStoryWorkingEvidence(settlement, {
    branchId,
    observations = [],
} = {}) {
    assertValid(settlement);
    if (branchId !== settlement.branchId) throw new TypeError('working evidence branch does not match story settlement');
    const episode = activeEpisode(settlement);
    if (!episode) throw new TypeError('an active episode is required');
    const currentCapsule = episode.workingCapsule;
    const updatedAtRevision = settlement.revision + 1;
    const workingCapsule = appendStoryWorkingEvidence(currentCapsule, {
        episode,
        observations,
        updatedAtRevision,
    });
    if (episode.workingCapsule && JSON.stringify(workingCapsule) === JSON.stringify(episode.workingCapsule)) {
        return structuredClone(settlement);
    }
    const next = structuredClone(settlement);
    next.revision = updatedAtRevision;
    activeEpisode(next).workingCapsule = workingCapsule;
    return assertValid(next);
}

export function replaceStoryWorkingCapsule(settlement, options = {}) {
    assertValid(settlement);
    const episode = activeEpisode(settlement);
    if (!episode) throw new TypeError('an active episode is required');
    const currentCapsule = episode.workingCapsule;
    const updatedAtRevision = settlement.revision + 1;
    const workingCapsule = replaceStoryWorkingSemantics(currentCapsule, {
        ...options,
        episode,
        updatedAtRevision,
    });
    const comparable = { ...workingCapsule, updatedAtRevision: currentCapsule.updatedAtRevision };
    if (episode.workingCapsule && JSON.stringify(comparable) === JSON.stringify(currentCapsule)) {
        return structuredClone(settlement);
    }
    const next = structuredClone(settlement);
    next.revision = updatedAtRevision;
    activeEpisode(next).workingCapsule = workingCapsule;
    return assertValid(next);
}

export function applyStoryWorkingCapsuleReview(settlement, {
    checkpointSequence,
    summary = '',
    foregroundQuestion = null,
    sourceContributionIds = [],
    effectIds = [],
} = {}) {
    assertValid(settlement);
    const episode = activeEpisode(settlement);
    if (!episode?.workingCapsule) throw new TypeError('an active episode with a working capsule is required');
    if (!Number.isInteger(checkpointSequence) || checkpointSequence < 1) {
        throw new TypeError('checkpointSequence must be a positive integer');
    }
    if (episode.boundaryState?.checkpointSequence !== checkpointSequence) {
        throw new TypeError('working capsule review checkpoint is stale');
    }
    if (episode.workingCapsule.lastEvaluatedCheckpointSequence >= checkpointSequence) {
        return structuredClone(settlement);
    }

    const next = structuredClone(settlement);
    next.revision += 1;
    const nextEpisode = activeEpisode(next);
    const reviewed = replaceStoryWorkingSemantics(nextEpisode.workingCapsule, {
        episode: nextEpisode,
        summary,
        foregroundQuestion,
        sourceContributionIds,
        effectIds,
        needsReview: false,
        lastEvaluatedCheckpointSequence: checkpointSequence,
        updatedAtRevision: next.revision,
    });
    reviewed.recentEvidence = [];
    reviewed.observedContributionCount = nextEpisode.contributions.length;
    nextEpisode.workingCapsule = reviewed;
    return assertValid(next);
}

export function checkpointStoryEpisode(settlement, {
    minimumNewContributions = 8,
    force = false,
} = {}) {
    assertValid(settlement);
    const episode = activeEpisode(settlement);
    if (!episode) throw new TypeError('an active episode is required');
    if (!Number.isInteger(minimumNewContributions) || minimumNewContributions < 1) {
        throw new TypeError('minimumNewContributions must be a positive integer');
    }
    const previous = episode.boundaryState;
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
    softBoundary = null,
    summary,
    unresolvedConsequences = [],
    characterMoments = [],
    significance = {},
} = {}) {
    assertValid(settlement);
    const episode = activeEpisode(settlement);
    if (!episode) throw new TypeError('an active episode is required');
    if (hardBoundary && softBoundary) throw new TypeError('episode cannot have both hard and soft boundaries');
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
    if (softBoundary) nextEpisode.softBoundary = structuredClone(softBoundary);
    nextEpisode.summary = summary;
    nextEpisode.unresolvedConsequences = structuredClone(unresolvedConsequences);
    nextEpisode.characterMoments = structuredClone(characterMoments);
    delete nextEpisode.workingCapsule;
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
    assertValid(settlement);
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
    assertValid(settlement);
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
    const survivorPeopleEvents = (episode.peopleEvents || []).filter((event) => (
        !(event.sourceContributionIds || []).some((id) => invalidated.has(id))
    ));
    if (survivorEffects.length === 0 && survivorPeopleEvents.length === 0) return null;
    const referenced = new Set([
        ...survivorEffects.flatMap((effect) => effect.sourceContributionIds || []),
        ...survivorPeopleEvents.flatMap((event) => event.sourceContributionIds || []),
    ]);
    const survivorContributions = episode.contributions.filter((item) => referenced.has(item.id));
    const survivorContributionIds = new Set(survivorContributions.map((item) => item.id));
    const survivorMoments = (episode.characterMoments || []).filter((moment) => (
        Array.isArray(moment.sourceContributionIds)
        && moment.sourceContributionIds.length > 0
        && moment.sourceContributionIds.every((id) => survivorContributionIds.has(id))
    ));
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
        characterMoments: structuredClone(survivorMoments),
        peopleEvents: structuredClone(survivorPeopleEvents),
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

function replacementForPrunedEffects(next, episode, survivorEffects, summarizeEffects) {
    const survivorPeopleEvents = structuredClone(episode.peopleEvents || []);
    if (survivorEffects.length === 0 && survivorPeopleEvents.length === 0) return null;
    const referenced = new Set([
        ...survivorEffects.flatMap((effect) => effect.sourceContributionIds || []),
        ...survivorPeopleEvents.flatMap((event) => event.sourceContributionIds || []),
    ]);
    const survivorContributions = episode.contributions.filter((item) => referenced.has(item.id));
    const survivorContributionIds = new Set(survivorContributions.map((item) => item.id));
    const survivorMoments = (episode.characterMoments || []).filter((moment) => (
        Array.isArray(moment.sourceContributionIds)
        && moment.sourceContributionIds.length > 0
        && moment.sourceContributionIds.every((id) => survivorContributionIds.has(id))
    ));
    const replacementId = `${episode.id}.effect-prune.${next.revision}`;
    const sceneId = `${episode.sceneId}.effect-prune.${next.revision}`;
    const summary = String(summarizeEffects?.(structuredClone(survivorEffects), structuredClone(episode)) || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 1024)
        || 'A material story development remains after dependent evidence was withdrawn.';
    const boundary = createEpisodeHardBoundary({
        id: `boundary.effect-prune.${episode.id}.${next.revision}`,
        branchId: next.branchId,
        code: 'source-recovery',
        source: {
            kind: 'sourceRecovery',
            id: `effect-prune.${episode.id}.${next.revision}`,
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
        characterMoments: structuredClone(survivorMoments),
        peopleEvents: survivorPeopleEvents,
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

export function pruneStoryEffects(settlement, {
    effectIds = [],
    summarizeEffects = null,
} = {}) {
    assertValid(settlement);
    const requested = new Set((Array.isArray(effectIds) ? effectIds : []).filter(Boolean));
    if (requested.size === 0) return structuredClone(settlement);
    const affected = (settlement.episodes || []).filter((episode) => (
        new Set(['open', 'sealPending', 'sealed']).has(episode.status)
        && (episode.effects || []).some((effect) => effect.status === 'active' && requested.has(effect.id))
    ));
    if (affected.length === 0) return structuredClone(settlement);

    const affectedIds = new Set(affected.map((episode) => episode.id));
    const next = structuredClone(settlement);
    next.revision += 1;
    const replacements = [];
    for (const episode of next.episodes) {
        if (!affectedIds.has(episode.id)) continue;
        const survivorEffects = episode.effects.filter(
            (effect) => effect.status === 'active' && !requested.has(effect.id),
        );
        if (next.activeEpisode === episode.id) {
            episode.effects = survivorEffects;
            episode.workingCapsule = repairStoryWorkingCapsule(episode.workingCapsule, {
                episode,
                updatedAtRevision: next.revision,
            });
            const boundaryState = episode.boundaryState;
            episode.boundaryState = {
                ...boundaryState,
                checkpointSequence: boundaryState.checkpointSequence + 1,
                lastReviewedAtRevision: next.revision,
                contributionCountAtLastReview: Math.min(
                    boundaryState.contributionCountAtLastReview,
                    episode.contributions.length,
                ),
                effectCountAtLastReview: Math.min(boundaryState.effectCountAtLastReview, episode.effects.length),
                decision: 'continue',
                sourceContributionIds: episode.workingCapsule.recentEvidence.map((item) => item.contributionId),
            };
        } else {
            const replacement = replacementForPrunedEffects(next, episode, survivorEffects, summarizeEffects);
            episode.status = 'invalidated';
            episode.invalidationReason = 'dependent-evidence-pruned';
            for (const effect of episode.effects) effect.status = 'invalidated';
            for (const consequence of episode.unresolvedConsequences) consequence.status = 'invalidated';
            if (replacement) replacements.push(replacement);
        }
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
    if (next.focus && affectedIds.has(next.focus.episodeId)) next.focus = null;
    return assertValid(next);
}

export function invalidateStorySources(settlement, {
    contributionIds = [],
    reason = 'source-invalidated',
    summarizeEffects = null,
} = {}) {
    assertValid(settlement);
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
            episode.peopleEvents = (episode.peopleEvents || []).filter(
                (event) => !(event.sourceContributionIds || []).some((id) => invalidated.has(id)),
            );
            episode.contributions = episode.contributions.filter((item) => !invalidated.has(item.id));
            episode.unresolvedConsequences = [];
            if (episode.boundaryState) {
                const survivingContributionIds = new Set(episode.contributions.map((item) => item.id));
                episode.boundaryState.contributionCountAtLastReview = Math.min(
                    episode.boundaryState.contributionCountAtLastReview,
                    episode.contributions.length,
                );
                episode.boundaryState.effectCountAtLastReview = Math.min(
                    episode.boundaryState.effectCountAtLastReview,
                    episode.effects.length,
                );
                episode.boundaryState.sourceContributionIds = episode.boundaryState.sourceContributionIds.filter(
                    (id) => survivingContributionIds.has(id),
                );
            }
            if (episode.contributions.length === 0
                && episode.effects.length === 0
                && episode.peopleEvents.length === 0) {
                activeEpisodeIdsToRemove.add(episode.id);
                next.activeEpisode = null;
            } else {
                episode.workingCapsule = repairStoryWorkingCapsule(episode.workingCapsule, {
                    episode,
                    invalidatedContributionIds: pending,
                    updatedAtRevision: next.revision,
                });
                const boundaryState = episode.boundaryState;
                episode.boundaryState = {
                    ...boundaryState,
                    checkpointSequence: boundaryState.checkpointSequence + 1,
                    lastReviewedAtRevision: next.revision,
                    contributionCountAtLastReview: episode.contributions.length,
                    effectCountAtLastReview: episode.effects.length,
                    decision: 'continue',
                    sourceContributionIds: episode.workingCapsule.recentEvidence.map((item) => item.contributionId),
                };
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

export function invalidateStorySourcesAndDescendants(settlement, {
    contributionIds = [],
    reason = 'source-invalidated',
    summarizeEffects = null,
    cutoffMissionId = null,
} = {}) {
    assertValid(settlement);
    const requested = new Set((Array.isArray(contributionIds) ? contributionIds : []).filter(Boolean));
    const alreadyInvalidated = requested.size > 0 && [...requested].every((contributionId) => (
        (settlement.receipts || []).some((receipt) => (
            receipt.disposition === 'invalidated'
            && (receipt.sourceContributionIds || []).includes(contributionId)
        ))
    ));
    if (alreadyInvalidated) return structuredClone(settlement);
    const originalEpisodes = (settlement.episodes || [])
        .map((episode, index) => ({ episode, index }))
        .sort((left, right) => (
            (left.episode.openedAtRevision ?? Number.MAX_SAFE_INTEGER)
                - (right.episode.openedAtRevision ?? Number.MAX_SAFE_INTEGER)
            || left.index - right.index
        ));
    const currentStatuses = new Set(['open', 'sealPending', 'sealed']);
    const contributionAffected = originalEpisodes.filter(({ episode }) => (
        currentStatuses.has(episode.status)
        && (episode.contributions || []).some((item) => requested.has(item.id))
    ));
    const affected = contributionAffected.length > 0
        ? contributionAffected
        : originalEpisodes.filter(({ episode }) => (
            currentStatuses.has(episode.status)
            && cutoffMissionId
            && (episode.references?.missionIds || []).includes(cutoffMissionId)
        ));
    if (affected.length === 0) {
        return invalidateStorySources(settlement, { contributionIds, reason, summarizeEffects });
    }
    const cutoffIndex = Math.min(...affected.map((entry) => originalEpisodes.indexOf(entry)));
    const rollbackEpisodeIds = new Set(originalEpisodes
        .filter(({ episode }, index) => index >= cutoffIndex && currentStatuses.has(episode.status))
        .map(({ episode }) => episode.id));
    const affectedEpisodeIds = new Set(affected.map(({ episode }) => episode.id));
    const next = invalidateStorySources(settlement, { contributionIds, reason, summarizeEffects });
    if (next.revision === settlement.revision) next.revision += 1;
    let expanded = true;
    while (expanded) {
        expanded = false;
        for (const episode of next.episodes || []) {
            const supersededIds = [
                ...(Array.isArray(episode.supersedesEpisodeIds) ? episode.supersedesEpisodeIds : []),
                ...(episode.supersedesEpisodeId ? [episode.supersedesEpisodeId] : []),
            ];
            if (!rollbackEpisodeIds.has(episode.id)
                && supersededIds.some((episodeId) => rollbackEpisodeIds.has(episodeId))) {
                rollbackEpisodeIds.add(episode.id);
                expanded = true;
            }
        }
    }
    for (const episode of next.episodes || []) {
        if (!rollbackEpisodeIds.has(episode.id)) continue;
        const sourcePairs = (episode.contributions || []).filter((item) => item.id && item.messageId);
        const sourceContributionIds = sourcePairs.map((item) => item.id);
        const sourceMessageIds = sourcePairs.map((item) => item.messageId);
        if (!affectedEpisodeIds.has(episode.id) && sourceContributionIds.length > 0) {
            next.receipts.push({
                kind: STORY_SETTLEMENT_RECEIPT_KIND,
                id: `receipt.${episode.id}.causal-rollback.${next.revision}`,
                branchId: next.branchId,
                sceneId: episode.sceneId,
                disposition: 'invalidated',
                episodeId: episode.id,
                sourceContributionIds,
                sourceMessageIds,
                settledAtRevision: next.revision,
            });
        }
        episode.status = 'invalidated';
        episode.invalidationReason = reason;
        episode.summary = 'Story material invalidated by causal mission rollback.';
        episode.contributions = [];
        episode.effects = [];
        episode.unresolvedConsequences = [];
        episode.characterMoments = [];
        episode.peopleEvents = [];
        delete episode.workingCapsule;
        if (episode.boundaryState) {
            episode.boundaryState.sourceContributionIds = [];
            episode.boundaryState.contributionCountAtLastReview = 0;
            episode.boundaryState.effectCountAtLastReview = 0;
        }
        if (episode.hardBoundary) episode.hardBoundary.sourceContributionIds = [];
        if (next.activeEpisode === episode.id) next.activeEpisode = null;
    }
    if (next.focus && rollbackEpisodeIds.has(next.focus.episodeId)) next.focus = null;
    return assertValid(next);
}
