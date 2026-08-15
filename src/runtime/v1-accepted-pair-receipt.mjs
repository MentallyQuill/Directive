import { ACCEPTED_PAIR_RECEIPT_KIND } from '../story/story-settlement-contracts.mjs';
import { stableHash24 } from './v1-stable-hash.mjs';

const ASSISTANT_ACCEPTANCE_OUTCOMES = new Set(['accepted', 'rejected', 'corrected', 'ambiguous']);

function compact(value) {
    return String(value ?? '').trim();
}

function normalizedSwipeId(value) {
    const swipeId = compact(value);
    return swipeId || null;
}

function normalizedSource(source = {}, label = 'source') {
    const messageId = compact(source?.messageId);
    const textHash = compact(source?.textHash);
    if (!messageId || !textHash) throw new TypeError(`${label} requires messageId and textHash`);
    return {
        messageId,
        selectedSwipeId: normalizedSwipeId(source?.selectedSwipeId),
        textHash,
    };
}

function normalizedPair({ sourceRangeHash, sourcePair } = {}) {
    const rangeHash = compact(sourceRangeHash);
    if (!rangeHash) throw new TypeError('accepted-pair receipt requires sourceRangeHash');
    return {
        sourceRangeHash: rangeHash,
        previousAssistant: normalizedSource(sourcePair?.previousAssistant, 'previousAssistant'),
        currentPlayer: normalizedSource(sourcePair?.currentPlayer, 'currentPlayer'),
    };
}

function pairFingerprint(pair) {
    return stableHash24(JSON.stringify([
        pair.sourceRangeHash,
        pair.previousAssistant.messageId,
        pair.previousAssistant.selectedSwipeId,
        pair.previousAssistant.textHash,
        pair.currentPlayer.messageId,
        pair.currentPlayer.selectedSwipeId,
        pair.currentPlayer.textHash,
    ]));
}

function sameSource(left = {}, right = {}) {
    return compact(left.messageId) === compact(right.messageId)
        && normalizedSwipeId(left.selectedSwipeId) === normalizedSwipeId(right.selectedSwipeId)
        && compact(left.textHash) === compact(right.textHash);
}

export function createV1AcceptedPairReceipt({
    branchId,
    sourceRangeHash,
    sourcePair,
    assistantAcceptance,
    sourceContributionIds = [],
} = {}) {
    const normalizedBranchId = compact(branchId);
    const acceptance = compact(assistantAcceptance);
    if (!normalizedBranchId) throw new TypeError('accepted-pair receipt requires branchId');
    if (!ASSISTANT_ACCEPTANCE_OUTCOMES.has(acceptance)) {
        throw new TypeError('accepted-pair receipt requires a supported assistantAcceptance');
    }
    const pair = normalizedPair({ sourceRangeHash, sourcePair });
    const fingerprint = pairFingerprint(pair);
    return {
        kind: ACCEPTED_PAIR_RECEIPT_KIND,
        id: `accepted-pair.${fingerprint}.${acceptance}`,
        branchId: normalizedBranchId,
        fingerprint,
        sourceRangeHash: pair.sourceRangeHash,
        previousAssistant: pair.previousAssistant,
        currentPlayer: pair.currentPlayer,
        assistantAcceptance: acceptance,
        sourceContributionIds: [...new Set(sourceContributionIds.map(compact).filter(Boolean))],
        settledAtRevision: 0,
    };
}

export function v1AcceptedPairReceiptMatches(receipt = {}, {
    branchId,
    sourceRangeHash,
    sourcePair,
} = {}) {
    if (receipt?.kind !== ACCEPTED_PAIR_RECEIPT_KIND || compact(receipt.branchId) !== compact(branchId)) return false;
    let pair;
    try {
        pair = normalizedPair({ sourceRangeHash, sourcePair });
    } catch {
        return false;
    }
    return receipt.fingerprint === pairFingerprint(pair)
        && compact(receipt.sourceRangeHash) === pair.sourceRangeHash
        && sameSource(receipt.previousAssistant, pair.previousAssistant)
        && sameSource(receipt.currentPlayer, pair.currentPlayer);
}
