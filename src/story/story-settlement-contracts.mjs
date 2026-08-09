export const STORY_SETTLEMENT_KIND = 'directive.storySettlement.v1';
export const STORY_EPISODE_KIND = 'directive.storyEpisode.v1';
export const STORY_SETTLEMENT_RECEIPT_KIND = 'directive.storySettlementReceipt.v1';
export const EMERGENT_FOCUS_KIND = 'directive.emergentFocus.v1';
export const STORY_EPISODE_STATUSES = Object.freeze(new Set([
    'open',
    'sealPending',
    'recoveryRequired',
    'sealed',
    'invalidated',
]));

const TERMINAL_EPISODE_STATUSES = new Set(['sealed', 'invalidated']);
const SOURCE_CONTRIBUTION_ROLES = new Set(['user', 'assistant', 'runtime', 'adjudicator']);
const SETTLEMENT_RECEIPT_DISPOSITIONS = new Set(['sealed', 'insignificant', 'invalidated']);

function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

function isStableId(value) {
    return isNonEmptyString(value) && /^[a-z0-9][a-z0-9._:-]*$/.test(value);
}

export function createEmptyStorySettlement({ branchId = 'main' } = {}) {
    return {
        kind: STORY_SETTLEMENT_KIND,
        schemaVersion: 1,
        branchId,
        revision: 0,
        activeEpisode: null,
        episodes: [],
        receipts: [],
        focus: null,
    };
}

export function validateStorySettlement(value = {}) {
    const errors = [];
    if (value?.kind !== STORY_SETTLEMENT_KIND) {
        errors.push(`kind must be ${STORY_SETTLEMENT_KIND}`);
    }
    if (value?.schemaVersion !== 1) errors.push('schemaVersion must be 1');
    if (!isStableId(value?.branchId)) {
        errors.push('branchId must be a stable id');
    }
    if (!Number.isInteger(value?.revision) || value.revision < 0) {
        errors.push('revision must be a non-negative integer');
    }
    if (!Array.isArray(value?.episodes)) errors.push('episodes must be an array');
    if (!Array.isArray(value?.receipts)) errors.push('receipts must be an array');
    if (Array.isArray(value?.episodes)) {
        const episodeIds = new Set();
        const contributionIds = new Set();
        const effectIds = new Set();
        for (const episode of value.episodes) {
            const episodeId = typeof episode?.id === 'string' && episode.id ? episode.id : '<unknown>';
            if (episodeId === '<unknown>') errors.push('episode id must be a non-empty string');
            if (episodeIds.has(episodeId)) errors.push(`duplicate episode id: ${episodeId}`);
            episodeIds.add(episodeId);
            if (episode?.branchId !== value.branchId) {
                errors.push(`${episodeId} branchId must match the settlement branch`);
            }
            if (typeof episode?.sceneId !== 'string' || episode.sceneId.length === 0) {
                errors.push(`${episodeId} sceneId must be a non-empty string`);
            }
            if (!Number.isInteger(episode?.openedAtRevision) || episode.openedAtRevision < 0) {
                errors.push(`${episodeId} openedAtRevision must be a non-negative integer`);
            }
            if (!Array.isArray(episode?.contributions)) errors.push(`${episodeId} contributions must be an array`);
            if (!Array.isArray(episode?.effects)) errors.push(`${episodeId} effects must be an array`);
            if (!Array.isArray(episode?.unresolvedConsequences)) {
                errors.push(`${episodeId} unresolvedConsequences must be an array`);
            }
            if (episode?.kind !== STORY_EPISODE_KIND) {
                errors.push(`${episodeId} kind must be ${STORY_EPISODE_KIND}`);
            }
            if (!STORY_EPISODE_STATUSES.has(episode?.status)) {
                errors.push(`${episodeId} status is unknown`);
            }
            if (episode?.status === 'sealed') {
                if (!Number.isInteger(episode.sealedAtRevision) || episode.sealedAtRevision < episode.openedAtRevision) {
                    errors.push(`${episodeId} sealedAtRevision must be at or after openedAtRevision`);
                }
                if (typeof episode.boundaryReason !== 'string' || episode.boundaryReason.length === 0) {
                    errors.push(`${episodeId} boundaryReason is required when sealed`);
                }
                if (typeof episode.summary !== 'string' || episode.summary.length === 0) {
                    errors.push(`${episodeId} summary is required when sealed`);
                }
            }
            for (const contribution of Array.isArray(episode?.contributions) ? episode.contributions : []) {
                const contributionId = contribution?.id || '<unknown contribution>';
                if (contributionIds.has(contributionId)) {
                    errors.push(`duplicate contribution id: ${contributionId}`);
                }
                contributionIds.add(contributionId);
                if (typeof contribution?.messageId !== 'string' || contribution.messageId.length === 0) {
                    errors.push(`${contributionId} messageId is required`);
                }
                if (!SOURCE_CONTRIBUTION_ROLES.has(contribution?.role)) {
                    errors.push(`${contributionId} role is unknown`);
                }
                if (typeof contribution?.textHash !== 'string' || contribution.textHash.length === 0) {
                    errors.push(`${contributionId} textHash is required`);
                }
                if (!Number.isInteger(contribution?.acceptedAtRevision) || contribution.acceptedAtRevision < 0) {
                    errors.push(`${contributionId} acceptedAtRevision must be a non-negative integer`);
                }
            }
            for (const effect of Array.isArray(episode?.effects) ? episode.effects : []) {
                const effectId = effect?.id || '<unknown effect>';
                if (effectIds.has(effectId)) errors.push(`duplicate effect id: ${effectId}`);
                effectIds.add(effectId);
                if (typeof effect?.type !== 'string' || effect.type.length === 0) {
                    errors.push(`${effectId} type is required`);
                }
                if (!Object.hasOwn(effect || {}, 'targetId') || (effect.targetId !== null && !isNonEmptyString(effect.targetId))) {
                    errors.push(`${effectId} targetId must be a non-empty string or null`);
                }
                if (!Array.isArray(effect?.sourceContributionIds)) {
                    errors.push(`${effectId} sourceContributionIds must be an array`);
                }
                if (!new Set(['visible', 'hidden']).has(effect?.playerVisibility)) {
                    errors.push(`${effectId} playerVisibility is unknown`);
                }
                if (!new Set(['active', 'invalidated']).has(effect?.status)) {
                    errors.push(`${effectId} status is unknown`);
                }
            }
        }
        const nonterminalEpisodes = value.episodes.filter(
            (episode) => !TERMINAL_EPISODE_STATUSES.has(episode?.status),
        );
        if (nonterminalEpisodes.length > 1) errors.push('story settlement cannot contain more than one nonterminal episode');
        if (nonterminalEpisodes.length === 1 && value.activeEpisode === null) {
            errors.push('activeEpisode must reference the current nonterminal episode');
        } else if (value.activeEpisode !== null) {
            const active = value.episodes.find((episode) => episode?.id === value.activeEpisode);
            if (!active || TERMINAL_EPISODE_STATUSES.has(active.status)) {
                errors.push('activeEpisode must reference the current nonterminal episode');
            }
        }
    }
    if (Array.isArray(value?.receipts)) {
        const receiptIds = new Set();
        for (const receipt of value.receipts) {
            const receiptId = receipt?.id || '<unknown receipt>';
            if (receiptIds.has(receiptId)) errors.push(`duplicate receipt id: ${receiptId}`);
            receiptIds.add(receiptId);
            if (receipt?.kind !== STORY_SETTLEMENT_RECEIPT_KIND) {
                errors.push(`${receiptId} kind must be ${STORY_SETTLEMENT_RECEIPT_KIND}`);
            }
            if (receipt?.branchId !== value.branchId) {
                errors.push(`${receiptId} branchId must match the settlement branch`);
            }
            if (typeof receipt?.sceneId !== 'string' || receipt.sceneId.length === 0) {
                errors.push(`${receiptId} sceneId is required`);
            }
            if (!SETTLEMENT_RECEIPT_DISPOSITIONS.has(receipt?.disposition)) {
                errors.push(`${receiptId} disposition is unknown`);
            }
            if (!Array.isArray(receipt?.sourceContributionIds)) {
                errors.push(`${receiptId} sourceContributionIds must be an array`);
            }
            if (!Number.isInteger(receipt?.settledAtRevision) || receipt.settledAtRevision < 0) {
                errors.push(`${receiptId} settledAtRevision must be a non-negative integer`);
            }
        }
    }
    if (value?.focus !== null && (typeof value?.focus !== 'object' || Array.isArray(value.focus))) {
        errors.push('focus must be an object or null');
    } else if (value?.focus !== null && typeof value?.focus === 'object') {
        if (value.focus.kind !== EMERGENT_FOCUS_KIND) {
            errors.push(`Focus kind must be ${EMERGENT_FOCUS_KIND}`);
        }
        if (typeof value.focus.id !== 'string' || value.focus.id.length === 0) {
            errors.push('Focus id is required');
        }
        if (!Number.isInteger(value.focus.setAtRevision) || value.focus.setAtRevision < 0) {
            errors.push('Focus setAtRevision must be a non-negative integer');
        }
        if (value.focus.branchId !== value.branchId) {
            errors.push('Focus must belong to the current branch');
        }
        const focusEpisode = Array.isArray(value.episodes)
            ? value.episodes.find((episode) => episode?.id === value.focus.episodeId)
            : null;
        if (!focusEpisode || focusEpisode.status !== 'sealed' || focusEpisode.branchId !== value.branchId) {
            errors.push('Focus must reference a sealed episode on the current branch');
        } else {
            const consequence = Array.isArray(focusEpisode.unresolvedConsequences)
                ? focusEpisode.unresolvedConsequences.find((item) => item?.id === value.focus.consequenceId)
                : null;
            if (!consequence || consequence.status !== 'unresolved') {
                errors.push('Focus must reference an unresolved consequence');
            }
        }
    }
    return { ok: errors.length === 0, errors };
}
