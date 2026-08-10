import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
    runAcceptedPairSettlementSequence,
    runV1MissionSettlement,
} from '../../src/runtime/chat-turn-orchestrator.mjs';
import { prepareLatestPairSceneSnapshot } from '../../src/runtime/source-settlement-latest-pair-scene-adapter.mjs';
import { createEpisodeHardBoundary } from '../../src/story/episode-boundary.mjs';

const campaignState = {
    campaign: {
        id: 'campaign.ashes',
        packageId: 'directive:campaign-package:breckenridge-ashes-of-peace',
        packageVersion: '0.3.0-pre-alpha.1',
    },
    activeCampaignPackage: {
        packageId: 'directive:campaign-package:breckenridge-ashes-of-peace',
        packageVersion: '0.3.0-pre-alpha.1',
    },
    campaignChatBinding: { saveId: 'save.alpha', chatId: 'chat.alpha' },
    mission: { activeMissionId: 'prelude-a-ship-underway' },
};
const previousAssistant = {
    id: 'message.assistant.10',
    role: 'assistant',
    isUser: false,
    text: 'Selected visible response.',
    raw: {
        mes: 'Selected visible response.',
        swipes: ['Unselected first response.', 'Selected visible response.'],
        swipe_id: 1,
    },
};
const currentPlayer = {
    id: 'message.player.11',
    hostMessageId: 'message.player.11',
    role: 'user',
    isUser: true,
    text: 'I accept the handover and take the watch.',
    chatId: 'chat.alpha',
    saveId: 'save.alpha',
};
const recentMessages = [previousAssistant, currentPlayer];

const prepared = prepareLatestPairSceneSnapshot({
    campaignState,
    currentPlayerMessage: currentPlayer,
    recentMessages,
    chatId: 'chat.alpha',
    ingressId: 'ingress.11',
});
assert.equal(prepared.ok, true);
assert.equal(prepared.snapshot.source.previousAssistant.text, 'Selected visible response.');
assert.equal(prepared.snapshot.source.previousAssistant.selectedVariantId, '1');
assert.equal(prepared.snapshot.source.previousAssistant.sourceIntegrity, 'clean');
assert.equal(prepared.snapshot.source.currentPlayer.hostMessageId, 'message.player.11');
assert.equal(prepared.snapshot.envelope.packageVersion, '0.3.0-pre-alpha.1');
assert.equal(prepared.snapshot.source.sourceRangeHash.length > 0, true);

for (const [overrides, reason] of [
    [{ chatId: 'chat.other' }, 'wrong-chat'],
    [{ currentPlayerMessage: { ...currentPlayer, saveId: 'save.other' } }, 'wrong-save'],
    [{ recentMessages: [currentPlayer] }, 'no-previous-assistant'],
    [{ recentMessages: [{ ...previousAssistant, isDirectiveOwned: true }, currentPlayer] }, 'previous-assistant-directive-owned'],
]) {
    const result = prepareLatestPairSceneSnapshot({
        campaignState,
        currentPlayerMessage: currentPlayer,
        recentMessages,
        chatId: 'chat.alpha',
        ...overrides,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, reason);
}

const exactSnapshot = prepared.snapshot;
const exactHardBoundary = createEpisodeHardBoundary({
    id: 'boundary.authored.11',
    branchId: 'save.alpha',
    code: 'authored-scene-closure',
    source: { kind: 'campaignReducer', id: 'campaign.scene.11' },
    sourceContributionIds: [],
});
const legacyOrder = [];
const legacySequence = await runAcceptedPairSettlementSequence({
    campaignState,
    authorityMode: 'legacy',
    settleLegacy: async () => {
        legacyOrder.push('legacy');
        return {
            campaignState: { ...campaignState, legacySettled: true },
            snapshot: exactSnapshot,
            hardBoundary: exactHardBoundary,
        };
    },
    prepareV1: async () => { throw new Error('legacy saves must not prepare V1 settlement'); },
    settleV1: async () => { throw new Error('legacy saves must not invoke V1 settlement'); },
});
legacyOrder.push('classification');
assert.deepEqual(legacyOrder, ['legacy', 'classification']);
assert.equal(legacySequence.authorityMode, 'legacy');
assert.equal(legacySequence.campaignState.legacySettled, true);
assert.equal(legacySequence.snapshot, exactSnapshot);

const authoritativeOrder = [];
const sequence = await runAcceptedPairSettlementSequence({
    campaignState,
    authorityMode: 'authoritative',
    settleLegacy: async () => { throw new Error('V1 saves must not invoke legacy settlement'); },
    prepareV1: async () => {
        authoritativeOrder.push('prepare-v1');
        return {
            campaignState,
            snapshot: exactSnapshot,
            hardBoundary: exactHardBoundary,
        };
    },
    settleV1: async ({ campaignState: preparedState, snapshot, hardBoundary }) => {
        authoritativeOrder.push('v1');
        assert.equal(preparedState, campaignState, 'V1 receives state without legacy semantic mutations');
        assert.equal(snapshot, exactSnapshot, 'V1 receives the identical prepared snapshot object');
        assert.equal(hardBoundary, exactHardBoundary, 'V1 receives the exact trusted boundary object');
        return {
            campaignState: { ...preparedState, v1Settled: true },
            result: { ok: true, status: 'settled' },
        };
    },
});
authoritativeOrder.push('classification');
assert.deepEqual(authoritativeOrder, ['prepare-v1', 'v1', 'classification']);
assert.equal(sequence.authorityMode, 'authoritative');
assert.equal(sequence.campaignState.v1Settled, true);
assert.equal(sequence.snapshot, exactSnapshot);
assert.equal(sequence.hardBoundary, exactHardBoundary);
assert.equal(sequence.legacy, null);

let genericTimeBoundaryForwarded = false;
await runAcceptedPairSettlementSequence({
    campaignState,
    authorityMode: 'authoritative',
    prepareV1: async () => ({
        campaignState,
        snapshot: exactSnapshot,
        timeBoundary: {
            kind: 'directive.timeBoundary.v1',
            id: 'time.ordinary.11',
            elapsedMinutes: 5,
        },
    }),
    settleV1: async ({ hardBoundary }) => {
        genericTimeBoundaryForwarded = hardBoundary !== null;
        return { campaignState, result: { ok: true, status: 'settled-no-effect' } };
    },
});
assert.equal(genericTimeBoundaryForwarded, false, 'generic legacy time advancement is not forwarded as a semantic boundary');

const failureOrder = [];
const failureSequence = await runAcceptedPairSettlementSequence({
    campaignState,
    authorityMode: 'authoritative',
    settleLegacy: async () => { throw new Error('legacy fallback forbidden'); },
    prepareV1: async () => {
        failureOrder.push('prepare-v1');
        return { campaignState, snapshot: exactSnapshot };
    },
    settleV1: async () => {
        failureOrder.push('v1-failed');
        throw new Error('raw V1 failure detail');
    },
});
failureOrder.push('classification');
assert.deepEqual(failureOrder, ['prepare-v1', 'v1-failed', 'classification']);
assert.equal(failureSequence.campaignState, campaignState);
assert.equal(failureSequence.v1.result.reasonCode, 'v1-threw');
assert.equal(JSON.stringify(failureSequence).includes('raw V1 failure detail'), false);

let blockedCalls = 0;
const blockedSequence = await runAcceptedPairSettlementSequence({
    campaignState,
    authorityMode: 'blocked',
    blockedReasonCode: 'definition-assets-missing',
    settleLegacy: async () => { blockedCalls += 1; },
    prepareV1: async () => { blockedCalls += 1; },
    settleV1: async () => { blockedCalls += 1; },
});
assert.equal(blockedCalls, 0);
assert.equal(blockedSequence.authorityMode, 'blocked');
assert.equal(blockedSequence.v1.result.reasonCode, 'definition-assets-missing');
assert.equal(blockedSequence.campaignState, campaignState);

const runtimeAssets = { packageData: { manifest: { id: campaignState.activeCampaignPackage.packageId } } };
let shadowCalls = 0;
const shadow = await runV1MissionSettlement({
    enabled: true,
    campaignState,
    snapshot: exactSnapshot,
    message: currentPlayer,
    runtimeAssets,
    hardBoundary: exactHardBoundary,
    settleV1MissionAcceptedPair: async (input) => {
        shadowCalls += 1;
        assert.equal(input.snapshot, exactSnapshot);
        assert.equal(input.runtimeAssets, runtimeAssets);
        assert.equal(input.hardBoundary, exactHardBoundary);
        return {
            ok: true,
            attempted: true,
            status: 'settled',
            definitionId: 'mission.prelude-a-ship-underway',
            definitionVersion: '1.0.0',
            committedRoots: ['mission', 'storySettlement'],
            noChange: false,
            transitionCommitted: false,
            reviewToken: {
                kind: 'directive.episodeReviewToken.v1',
                branchId: 'save.alpha',
                episodeId: 'episode.active',
                episodeRevision: 7,
                checkpointSequence: 1,
            },
            diagnostics: {
                candidateCount: 21,
                selectedClaimCount: 1,
                acceptedClaimCount: 1,
                rejectedClaimCount: 0,
                providerId: 'must-not-be-reported',
                rawResponse: 'must-not-escape',
            },
        };
    },
    getCampaignState: () => ({ ...campaignState, mission: { ...campaignState.mission, v1: { revision: 1 } } }),
});
assert.equal(shadowCalls, 1);
assert.equal(shadow.result.ok, true);
assert.equal(shadow.result.definitionId, 'mission.prelude-a-ship-underway');
assert.deepEqual(shadow.result.committedRoots, ['mission', 'storySettlement']);
assert.deepEqual(shadow.result.reviewToken, {
    kind: 'directive.episodeReviewToken.v1',
    branchId: 'save.alpha',
    episodeId: 'episode.active',
    episodeRevision: 7,
    checkpointSequence: 1,
});
assert.deepEqual(shadow.result.diagnostics, {
    candidateCount: 21,
    selectedClaimCount: 1,
    acceptedClaimCount: 1,
    rejectedClaimCount: 0,
    discardedAssistantClaimCount: 0,
    latencyMs: null,
});
assert.equal(JSON.stringify(shadow).includes('must-not-escape'), false);
assert.equal(JSON.stringify(shadow).includes('must-not-be-reported'), false);
assert.equal(shadow.campaignState.mission.v1.revision, 1);

const malformedBoundary = await runV1MissionSettlement({
    enabled: true,
    campaignState,
    snapshot: exactSnapshot,
    message: currentPlayer,
    runtimeAssets,
    hardBoundary: { reason: 'speaker changed' },
    settleV1MissionAcceptedPair: async () => { shadowCalls += 1; },
});
assert.equal(malformedBoundary.result.reasonCode, 'hard-boundary-invalid');
assert.equal(malformedBoundary.result.attempted, false);
assert.equal(shadowCalls, 1);

for (const [input, reasonCode] of [
    [{ enabled: false }, 'v1-disabled'],
    [{ snapshot: null }, 'snapshot-unavailable'],
    [{ message: { ...currentPlayer, source: 'chat-poll' } }, 'historical-replay'],
    [{ message: { ...currentPlayer, isDirectiveOwned: true } }, 'directive-owned-source'],
]) {
    const result = await runV1MissionSettlement({
        enabled: true,
        campaignState,
        snapshot: exactSnapshot,
        message: currentPlayer,
        runtimeAssets,
        settleV1MissionAcceptedPair: async () => { shadowCalls += 1; },
        ...input,
    });
    assert.equal(result.result.reasonCode, reasonCode);
    assert.equal(result.result.attempted, false);
}
assert.equal(shadowCalls, 1, 'skip conditions do not invoke V1');

const preflightBlocked = await runV1MissionSettlement({
    enabled: true,
    campaignState,
    snapshot: exactSnapshot,
    message: currentPlayer,
    runtimeAssets,
    preflight: async () => ({ status: 'hardSkipped', reasons: ['source-frame-stale'] }),
    settleV1MissionAcceptedPair: async () => { shadowCalls += 1; },
});
assert.equal(preflightBlocked.result.reasonCode, 'source-preflight-blocked');
assert.deepEqual(preflightBlocked.result.reasons, ['source-frame-stale']);
assert.equal(shadowCalls, 1);

const providerFailure = await runV1MissionSettlement({
    enabled: true,
    campaignState,
    snapshot: exactSnapshot,
    message: currentPlayer,
    runtimeAssets,
    settleV1MissionAcceptedPair: async () => ({
        ok: false,
        attempted: true,
        status: 'unavailable',
        reasonCode: 'provider-threw',
        rawPrompt: 'secret prompt',
        diagnostics: { error: 'secret provider error', candidateCount: 21 },
    }),
});
assert.equal(providerFailure.result.reasonCode, 'provider-threw');
assert.equal(providerFailure.campaignState, campaignState);
assert.equal(JSON.stringify(providerFailure).includes('secret'), false);

const timeout = await runV1MissionSettlement({
    enabled: true,
    campaignState,
    snapshot: exactSnapshot,
    message: currentPlayer,
    runtimeAssets,
    timeoutMs: 5,
    settleV1MissionAcceptedPair: async () => new Promise(() => {}),
});
assert.equal(timeout.result.reasonCode, 'v1-timeout');
assert.equal(timeout.result.attempted, true);

const orchestratorSource = fs.readFileSync('src/runtime/chat-turn-orchestrator.mjs', 'utf8');
const processStart = orchestratorSource.indexOf('async function processMessage');
const processSource = orchestratorSource.slice(processStart, orchestratorSource.indexOf('async function processGenerationStarted', processStart));
assert.ok(processSource.indexOf('runAcceptedPairSettlementSequence') >= 0, 'real process path uses the accepted-pair sequence');
assert.ok(
    processSource.indexOf('runAcceptedPairSettlementSequence') < processSource.indexOf('decision = await classify'),
    'V1 shadow settlement occurs before classification',
);

const runtimeAppSource = fs.readFileSync('src/runtime/runtime-app.mjs', 'utf8');
assert.match(runtimeAppSource, /createV1MissionRuntime/);
assert.match(runtimeAppSource, /settleV1MissionAcceptedPair/);
assert.match(runtimeAppSource, /resolveV1SemanticAuthority/);
assert.match(runtimeAppSource, /getRuntimeAssets/);
assert.match(runtimeAppSource, /buildV1ShadowPlayerProjection/);
assert.match(runtimeAppSource, /buildV1RuntimePlayerProjection/);
assert.match(runtimeAppSource, /optionalActiveRuntimeAssets/);

console.log('V1 accepted-pair orchestrator tests passed.');
