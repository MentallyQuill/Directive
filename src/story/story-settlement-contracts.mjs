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

function validateBoundaryState(boundaryState, episode, errors, episodeId) {
    if (boundaryState === undefined) return;
    if (!boundaryState || typeof boundaryState !== 'object' || Array.isArray(boundaryState)) {
        errors.push(`${episodeId} boundaryState must be an object`);
        return;
    }
    if (boundaryState.kind !== EPISODE_BOUNDARY_STATE_KIND) {
        errors.push(`${episodeId} boundaryState kind must be ${EPISODE_BOUNDARY_STATE_KIND}`);
    }
    for (const field of ['checkpointSequence', 'lastReviewedAtRevision', 'contributionCountAtLastReview', 'effectCountAtLastReview']) {
        if (!Number.isInteger(boundaryState[field]) || boundaryState[field] < 0) {
            errors.push(`${episodeId} boundaryState ${field} must be a non-negative integer`);
        }
    }
    if (Number.isInteger(boundaryState.lastReviewedAtRevision)
        && boundaryState.lastReviewedAtRevision < episode.openedAtRevision) {
        errors.push(`${episodeId} boundaryState lastReviewedAtRevision must be at or after openedAtRevision`);
    }
    if (Number.isInteger(boundaryState.contributionCountAtLastReview)
        && boundaryState.contributionCountAtLastReview > (episode.contributions?.length || 0)) {
        errors.push(`${episodeId} boundaryState contributionCountAtLastReview exceeds contributions`);
    }
    if (Number.isInteger(boundaryState.effectCountAtLastReview)
        && boundaryState.effectCountAtLastReview > (episode.effects?.length || 0)) {
        errors.push(`${episodeId} boundaryState effectCountAtLastReview exceeds effects`);
    }
    if (boundaryState.decision !== 'continue') {
        errors.push(`${episodeId} boundaryState decision must be continue`);
    }
    if (!Array.isArray(boundaryState.sourceContributionIds)) {
        errors.push(`${episodeId} boundaryState sourceContributionIds must be an array`);
    } else {
        if (new Set(boundaryState.sourceContributionIds).size !== boundaryState.sourceContributionIds.length) {
            errors.push(`${episodeId} boundaryState sourceContributionIds must be unique`);
        }
        for (const contributionId of boundaryState.sourceContributionIds) {
            if (!isStableId(contributionId)) {
                errors.push(`${episodeId} boundaryState sourceContributionIds contains an invalid id`);
            }
        }
    }
}

function validateEpisodeReferences(references, errors, episodeId) {
    if (references === undefined) return;
    if (!references || typeof references !== 'object' || Array.isArray(references)) {
        errors.push(`${episodeId} references must be an object`);
        return;
    }
    const fields = ['missionIds', 'questIds', 'participantIds', 'locationIds'];
    for (const field of Object.keys(references)) {
        if (!fields.includes(field)) errors.push(`${episodeId} references contains unknown field: ${field}`);
    }
    for (const field of fields) {
        const ids = references[field];
        if (!Array.isArray(ids)) {
            errors.push(`${episodeId} references ${field} must be an array`);
            continue;
        }
        if (new Set(ids).size !== ids.length) errors.push(`${episodeId} references ${field} must be unique`);
        for (const id of ids) {
            if (!isStableId(id)) errors.push(`${episodeId} references ${field} contains an invalid id`);
        }
    }
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
        for (const episode of value.episodes) {
            const contributionIds = new Set();
            const effectIds = new Set();
            const episodeId = isStableId(episode?.id) ? episode.id : '<unknown>';
            if (episodeId === '<unknown>') errors.push('episode id must be a stable id');
            if (episodeIds.has(episodeId)) errors.push(`duplicate episode id: ${episodeId}`);
            episodeIds.add(episodeId);
            if (episode?.branchId !== value.branchId) {
                errors.push(`${episodeId} branchId must match the settlement branch`);
            }
            if (!isStableId(episode?.sceneId)) {
                errors.push(`${episodeId} sceneId must be a stable id`);
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
            validateBoundaryState(episode?.boundaryState, episode, errors, episodeId);
            validateEpisodeReferences(episode?.references, errors, episodeId);
            const workingCapsuleResult = validateStoryWorkingCapsule(episode?.workingCapsule, {
                episode,
                settlementRevision: value.revision,
            });
            errors.push(...workingCapsuleResult.errors);
            if (episode?.hardBoundary !== undefined && episode.hardBoundary !== null) {
                const boundaryResult = validateEpisodeHardBoundary(episode.hardBoundary, {
                    branchId: value.branchId,
                    knownContributionIds: (episode.contributions || []).map((item) => item.id),
                });
                errors.push(...boundaryResult.errors.map((error) => `${episodeId} hardBoundary ${error}`));
            }
            if (episode?.softBoundary !== undefined && episode.softBoundary !== null) {
                const boundaryResult = validateEpisodeSoftBoundary(episode.softBoundary, {
                    knownContributionIds: (episode.contributions || []).map((item) => item.id),
                    knownEffectIds: (episode.effects || []).map((item) => item.id),
                });
                errors.push(...boundaryResult.errors.map((error) => `${episodeId} ${error}`));
                if (!new Set(['sealed', 'invalidated']).has(episode.status)) {
                    errors.push(`${episodeId} softBoundary is allowed only on sealed or invalidated episodes`);
                }
                if (episode.hardBoundary) errors.push(`${episodeId} cannot have both hardBoundary and softBoundary`);
                if (episode.boundaryReason !== episode.softBoundary.reason) {
                    errors.push(`${episodeId} boundaryReason must match softBoundary reason`);
                }
            }
            if (episode?.supersedesEpisodeIds !== undefined) {
                if (!Array.isArray(episode.supersedesEpisodeIds)) {
                    errors.push(`${episodeId} supersedesEpisodeIds must be an array`);
                } else {
                    if (new Set(episode.supersedesEpisodeIds).size !== episode.supersedesEpisodeIds.length) {
                        errors.push(`${episodeId} supersedesEpisodeIds must be unique`);
                    }
                    for (const supersededId of episode.supersedesEpisodeIds) {
                        if (!isStableId(supersededId)) {
                            errors.push(`${episodeId} supersedesEpisodeIds contains an invalid id`);
                        }
                    }
                }
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
                const contributionId = isStableId(contribution?.id) ? contribution.id : '<unknown contribution>';
                if (contributionId === '<unknown contribution>') errors.push('contribution id must be a stable id');
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
                const effectId = isStableId(effect?.id) ? effect.id : '<unknown effect>';
                if (effectId === '<unknown effect>') errors.push('effect id must be a stable id');
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
            if (episode?.characterMoments !== undefined) {
                if (!Array.isArray(episode.characterMoments)) {
                    errors.push(`${episodeId} characterMoments must be an array`);
                } else {
                    if (!new Set(['sealed', 'invalidated']).has(episode.status) && episode.characterMoments.length > 0) {
                        errors.push(`${episodeId} characterMoments are allowed only after sealing`);
                    }
                    const characterIds = new Set();
                    const characterMomentIds = new Set();
                    const allowedFields = new Set([
                        'id',
                        'characterId',
                        'summary',
                        'playerVisibility',
                        'sourceContributionIds',
                    ]);
                    for (const moment of episode.characterMoments) {
                        const momentId = isStableId(moment?.id) ? moment.id : '<unknown character moment>';
                        if (momentId === '<unknown character moment>') errors.push(`${episodeId} character moment id must be stable`);
                        if (characterMomentIds.has(momentId)) errors.push(`duplicate character moment id: ${momentId}`);
                        characterMomentIds.add(momentId);
                        for (const field of Object.keys(moment || {})) {
                            if (!allowedFields.has(field)) errors.push(`${momentId} contains unknown field: ${field}`);
                        }
                        if (!isStableId(moment?.characterId)) {
                            errors.push(`${momentId} characterId must be stable`);
                        } else if (characterIds.has(moment.characterId)) {
                            errors.push(`${episodeId} allows one character moment per character`);
                        }
                        characterIds.add(moment?.characterId);
                        if (!isNonEmptyString(moment?.summary) || moment.summary.length > 512) {
                            errors.push(`${momentId} summary must be a non-empty string of at most 512 characters`);
                        }
                        if (!new Set(['visible', 'hidden']).has(moment?.playerVisibility)) {
                            errors.push(`${momentId} playerVisibility is unknown`);
                        }
                        if (!Array.isArray(moment?.sourceContributionIds) || moment.sourceContributionIds.length === 0) {
                            errors.push(`${momentId} sourceContributionIds must be non-empty`);
                        } else {
                            if (new Set(moment.sourceContributionIds).size !== moment.sourceContributionIds.length) {
                                errors.push(`${momentId} sourceContributionIds must be unique`);
                            }
                            for (const contributionId of moment.sourceContributionIds) {
                                if (!contributionIds.has(contributionId)) {
                                    errors.push(`${momentId} references unknown source contribution: ${contributionId}`);
                                }
                            }
                        }
                    }
                }
            }
        }
        const episodeById = new Map(value.episodes.filter((episode) => isStableId(episode?.id)).map((episode) => [episode.id, episode]));
        const supersessionGraph = new Map();
        for (const episode of value.episodes) {
            if (!isStableId(episode?.id)) continue;
            const supersededIds = [
                ...(Array.isArray(episode.supersedesEpisodeIds) ? episode.supersedesEpisodeIds : []),
                ...(isStableId(episode.supersedesEpisodeId) ? [episode.supersedesEpisodeId] : []),
            ];
            supersessionGraph.set(episode.id, supersededIds);
            for (const supersededId of supersededIds) {
                if (supersededId === episode.id) {
                    errors.push(`${episode.id} cannot supersede itself`);
                } else if (!episodeById.has(supersededId)) {
                    errors.push(`${episode.id} supersedes unknown episode: ${supersededId}`);
                }
            }
        }
        const visited = new Set();
        const visiting = new Set();
        let cycleReported = false;
        const visit = (episodeId) => {
            if (visiting.has(episodeId)) {
                if (!cycleReported) errors.push('story settlement contains a supersession cycle');
                cycleReported = true;
                return;
            }
            if (visited.has(episodeId)) return;
            visiting.add(episodeId);
            for (const supersededId of supersessionGraph.get(episodeId) || []) {
                if (episodeById.has(supersededId)) visit(supersededId);
            }
            visiting.delete(episodeId);
            visited.add(episodeId);
        };
        for (const episodeId of episodeById.keys()) visit(episodeId);
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
            const receiptId = isStableId(receipt?.id) ? receipt.id : '<unknown receipt>';
            if (receiptId === '<unknown receipt>') errors.push('receipt id must be a stable id');
            if (receiptIds.has(receiptId)) errors.push(`duplicate receipt id: ${receiptId}`);
            receiptIds.add(receiptId);
            if (receipt?.kind !== STORY_SETTLEMENT_RECEIPT_KIND) {
                errors.push(`${receiptId} kind must be ${STORY_SETTLEMENT_RECEIPT_KIND}`);
            }
            if (receipt?.branchId !== value.branchId) {
                errors.push(`${receiptId} branchId must match the settlement branch`);
            }
            if (!isStableId(receipt?.sceneId)) {
                errors.push(`${receiptId} sceneId must be a stable id`);
            }
            if (!SETTLEMENT_RECEIPT_DISPOSITIONS.has(receipt?.disposition)) {
                errors.push(`${receiptId} disposition is unknown`);
            }
            if (!Array.isArray(receipt?.sourceContributionIds)) {
                errors.push(`${receiptId} sourceContributionIds must be an array`);
            }
            if (!Array.isArray(receipt?.sourceMessageIds)
                || receipt.sourceMessageIds.some((id) => !isNonEmptyString(id) || id.length > 300)) {
                errors.push(`${receiptId} sourceMessageIds must be an array of non-empty strings`);
            } else if (receipt.sourceMessageIds.length !== receipt.sourceContributionIds?.length) {
                errors.push(`${receiptId} sourceMessageIds must align with sourceContributionIds`);
            } else if (new Set(receipt.sourceMessageIds).size !== receipt.sourceMessageIds.length) {
                errors.push(`${receiptId} sourceMessageIds must be unique`);
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
        if (!isStableId(value.focus.id)) {
            errors.push('Focus id must be a stable id');
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
import {
    EPISODE_BOUNDARY_STATE_KIND,
    validateEpisodeHardBoundary,
    validateEpisodeSoftBoundary,
} from './episode-boundary.mjs';
import { validateStoryWorkingCapsule } from './working-capsule.mjs';
