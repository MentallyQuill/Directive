import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
    runAcceptedPairSettlementSequence,
    runV1MissionShadowSettlement,
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

const order = [];
const exactSnapshot = prepared.snapshot;
const exactHardBoundary = createEpisodeHardBoundary({
    id: 'boundary.authored.11',
    branchId: 'save.alpha',
    code: 'authored-scene-closure',
    source: { kind: 'campaignReducer', id: 'campaign.scene.11' },
    sourceContributionIds: [],
});
const sequence = await runAcceptedPairSettlementSequence({
    campaignState,
    settleLegacy: async () => {
        order.push('legacy');
        return {
            campaignState: { ...campaignState, legacySettled: true },
            snapshot: exactSnapshot,
            hardBoundary: exactHardBoundary,
        };
    },
    settleV1: async ({ campaignState: legacyState, snapshot, hardBoundary }) => {
        order.push('v1');
        assert.equal(legacyState.legacySettled, true);
        assert.equal(snapshot, exactSnapshot, 'V1 receives the identical prepared snapshot object');
        assert.equal(hardBoundary, exactHardBoundary, 'V1 receives the exact trusted boundary object');
        return {
            campaignState: { ...legacyState, v1Settled: true },
            result: { ok: true, status: 'settled' },
        };
    },
});
order.push('classification');
assert.deepEqual(order, ['legacy', 'v1', 'classification']);
assert.equal(sequence.campaignState.v1Settled, true);
assert.equal(sequence.snapshot, exactSnapshot);
assert.equal(sequence.hardBoundary, exactHardBoundary);

let genericTimeBoundaryForwarded = false;
await runAcceptedPairSettlementSequence({
    campaignState,
    settleLegacy: async () => ({
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
    settleLegacy: async () => {
        failureOrder.push('legacy');
        return { campaignState: { ...campaignState, legacySettled: true }, snapshot: exactSnapshot };
    },
    settleV1: async () => {
        failureOrder.push('v1-failed');
        throw new Error('raw V1 failure detail');
    },
});
failureOrder.push('classification');
assert.deepEqual(failureOrder, ['legacy', 'v1-failed', 'classification']);
assert.equal(failureSequence.campaignState.legacySettled, true);
assert.equal(failureSequence.shadow.result.reasonCode, 'shadow-threw');
assert.equal(JSON.stringify(failureSequence).includes('raw V1 failure detail'), false);

const runtimeAssets = { packageData: { manifest: { id: campaignState.activeCampaignPackage.packageId } } };
let shadowCalls = 0;
const shadow = await runV1MissionShadowSettlement({
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

const malformedBoundary = await runV1MissionShadowSettlement({
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
    [{ enabled: false }, 'shadow-disabled'],
    [{ snapshot: null }, 'snapshot-unavailable'],
    [{ message: { ...currentPlayer, source: 'chat-poll' } }, 'historical-replay'],
    [{ message: { ...currentPlayer, isDirectiveOwned: true } }, 'directive-owned-source'],
]) {
    const result = await runV1MissionShadowSettlement({
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

const preflightBlocked = await runV1MissionShadowSettlement({
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

const providerFailure = await runV1MissionShadowSettlement({
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

const timeout = await runV1MissionShadowSettlement({
    enabled: true,
    campaignState,
    snapshot: exactSnapshot,
    message: currentPlayer,
    runtimeAssets,
    timeoutMs: 5,
    settleV1MissionAcceptedPair: async () => new Promise(() => {}),
});
assert.equal(timeout.result.reasonCode, 'shadow-timeout');
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
assert.match(runtimeAppSource, /enableV1MissionShadow/);
assert.match(runtimeAppSource, /getRuntimeAssets/);
assert.match(runtimeAppSource, /buildV1ShadowPlayerProjection/);
assert.match(runtimeAppSource, /buildV1RuntimePlayerProjection/);
assert.match(runtimeAppSource, /optionalActiveRuntimeAssets/);

console.log('V1 accepted-pair orchestrator tests passed.');
