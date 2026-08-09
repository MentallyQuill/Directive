import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
    createMissionTransitionNarrationFallback,
    createMissionTransitionNarrationRequest,
    createMissionTransitionNarrationReviewRequest,
    parseMissionTransitionNarrationCandidate,
    parseMissionTransitionNarrationReviewProposal,
    resolveMissionTransitionNarrationReview,
    validateMissionTransitionNarrationPacket,
} from '../../src/mission/v1/mission-transition-narration.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { createV1MissionRuntime } from '../../src/runtime/v1-mission-runtime.mjs';

const fixture = JSON.parse(fs.readFileSync(
    'tests/fixtures/mission/v1/v1-hesperus-reference.fixture.json',
    'utf8',
));
const sourceDefinition = structuredClone(fixture);
sourceDefinition.id = 'mission.narration-source';
sourceDefinition.packageBinding.sourceId = 'narration-source';
sourceDefinition.transitions[0].target = {
    kind: 'mission',
    id: 'narration-target',
    playerSafeSetup: 'Captain Whitaker calls the senior staff into the command review.',
};
const targetDefinition = structuredClone(fixture);
targetDefinition.id = 'mission.narration-target';
targetDefinition.packageBinding.sourceId = 'narration-target';
targetDefinition.playerText = {
    title: 'Command Review',
    summary: 'Review the completed response with the senior staff.',
};
const runtimeAssets = {
    packageData: {
        manifest: {
            id: sourceDefinition.packageBinding.packageId,
            version: sourceDefinition.packageBinding.packageVersion,
        },
    },
    missionDefinitions: [sourceDefinition, targetDefinition].map((definition) => ({
        path: `${definition.id}.json`,
        definition,
    })),
};

let campaignState = {
    campaign: { id: 'campaign.ashes' },
    activeCampaignPackage: {
        packageId: sourceDefinition.packageBinding.packageId,
        packageVersion: sourceDefinition.packageBinding.packageVersion,
    },
    campaignChatBinding: { saveId: 'save.narration', chatId: 'chat.narration' },
    mission: {
        activeMissionId: sourceDefinition.packageBinding.sourceId,
        legacyHiddenTracker: 'HIDDEN_TRACKER_CANARY',
    },
    runtimeTracking: { providerDiagnostics: 'PROVIDER_DIAGNOSTIC_CANARY' },
    commandBearing: { current: 8 },
};
let persistCount = 0;
let generationCount = 0;
const gateway = createStateDeltaGateway({
    getState: () => campaignState,
    setState: (next) => { campaignState = next; },
    persist: async () => { persistCount += 1; },
    now: () => '2026-08-09T22:00:00.000Z',
});
const runtime = createV1MissionRuntime({
    getState: () => campaignState,
    stateDeltaGateway: gateway,
    generationRouter: {
        generate: async () => {
            generationCount += 1;
            return {
                ok: true,
                response: {
                    providerId: 'test-provider',
                    model: 'test-model',
                    text: JSON.stringify({
                        kind: 'directive.missionEvidenceInterpretation.v1',
                        assistantAcceptance: 'accepted',
                        claims: [{
                            candidateId: 'policy.hesperus-survivors-transferred',
                            sourceSlot: 'previousAssistant',
                        }],
                        abstained: false,
                    }),
                },
            };
        },
    },
    now: () => '2026-08-09T22:00:00.000Z',
});
const settled = await runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: {
        kind: 'directive.latestPairSceneSnapshot.v1',
        envelope: {
            campaignId: 'campaign.ashes',
            saveId: 'save.narration',
            chatId: 'chat.narration',
            packageId: sourceDefinition.packageBinding.packageId,
            packageVersion: sourceDefinition.packageBinding.packageVersion,
            activeMissionId: sourceDefinition.packageBinding.sourceId,
        },
        source: {
            sourceRangeHash: 'range.narration.1',
            previousAssistant: {
                hostMessageId: 'message.narration.assistant.1',
                role: 'assistant',
                text: 'The last Hesperus survivor reaches safety aboard the Breckenridge.',
                textHash: 'a'.repeat(64),
                sourceIntegrity: 'clean',
                selectedVariant: {
                    selectedSwipeId: 'swipe.1',
                    selectedTextHash: 'a'.repeat(64),
                },
            },
            currentPlayer: {
                hostMessageId: 'message.narration.player.1',
                role: 'user',
                text: 'I acknowledge the rescue and return to the bridge.',
                textHash: 'b'.repeat(64),
                sourceIntegrity: 'clean',
            },
        },
    },
});
assert.equal(settled.transitionActivated, true, JSON.stringify(settled));
const stateBeforePreparation = structuredClone(campaignState);
const persistenceBeforePreparation = persistCount;
const generationBeforePreparation = generationCount;

const prepared = runtime.prepareTransitionNarration({ runtimeAssets });
assert.equal(prepared.ok, true, JSON.stringify(prepared));
assert.equal(prepared.attempted, false);
assert.equal(prepared.status, 'ready');
assert.equal(prepared.reasonCode, null);
assert.equal(prepared.packet.sourceMissionId, sourceDefinition.id);
assert.equal(
    prepared.packet.sourceDisposition,
    stateBeforePreparation.mission.v1History[0].state.terminalDisposition,
);
assert.equal(prepared.packet.next.kind, 'mission');
assert.equal(prepared.packet.next.id, targetDefinition.packageBinding.sourceId);
assert.equal(prepared.packet.next.playerSafeSetup, sourceDefinition.transitions[0].target.playerSafeSetup);
assert.equal(prepared.packet.visibleEffects.some((effect) => effect.targetId === 'event.hesperus-survivors-transferred'), true);
assert.equal(prepared.fallback.text.includes(sourceDefinition.transitions[0].target.playerSafeSetup), true);
assert.deepEqual(validateMissionTransitionNarrationPacket(prepared.packet), { ok: true, errors: [] });
assert.equal(validateMissionTransitionNarrationPacket({
    ...prepared.packet,
    evidenceLog: [{ rawText: 'must never enter narration authority' }],
}).ok, false);
assert.deepEqual(campaignState, stateBeforePreparation, 'preparation is pure');
assert.equal(persistCount, persistenceBeforePreparation);
assert.equal(generationCount, generationBeforePreparation, 'preparation calls no model');

const serialized = JSON.stringify(prepared);
for (const forbidden of [
    'HIDDEN_TRACKER_CANARY',
    'PROVIDER_DIAGNOSTIC_CANARY',
    'evidenceLog',
    'acceptedEvidenceKeys',
    'textHash',
    'sourceContributionIds',
    'dutyReportManifest',
    'openAssignments',
]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
}
assert.equal(serialized.includes('mustNotReveal'), true, 'authored spoiler guardrails remain narrator constraints');

const request = createMissionTransitionNarrationRequest(prepared.packet);
assert.deepEqual(request, prepared.request);
assert.equal(request.outputContract.additionalProperties, false);
assert.deepEqual(request.authority.may, ['voice', 'pacing', 'dialogue', 'sensory-detail', 'connective-prose']);
assert.equal(request.authority.mustNot.includes('change-transition-target'), true);

const candidateText = 'The final survivor is safe. Captain Whitaker gathers the senior staff for the command review.';
const parsedCandidate = parseMissionTransitionNarrationCandidate(JSON.stringify({
    kind: 'directive.missionTransitionNarrationCandidate.v1',
    transitionKey: prepared.packet.transitionKey,
    text: candidateText,
}), { packet: prepared.packet });
assert.equal(parsedCandidate.ok, true, JSON.stringify(parsedCandidate));
assert.equal(parsedCandidate.value.text, candidateText);
const multilineCandidate = `The final survivor is safe.\n\n${sourceDefinition.transitions[0].target.playerSafeSetup}`;
assert.equal(parseMissionTransitionNarrationCandidate(JSON.stringify({
    kind: 'directive.missionTransitionNarrationCandidate.v1',
    transitionKey: prepared.packet.transitionKey,
    text: multilineCandidate,
}), { packet: prepared.packet }).ok, true, 'legitimate paragraphing remains available to the narrator');
for (const invalid of [
    candidateText,
    JSON.stringify({
        kind: 'directive.missionTransitionNarrationCandidate.v1',
        transitionKey: 'transition.wrong',
        text: candidateText,
    }),
    JSON.stringify({
        kind: 'directive.missionTransitionNarrationCandidate.v1',
        transitionKey: prepared.packet.transitionKey,
        text: candidateText,
        newDisposition: 'totalVictory',
    }),
    JSON.stringify({
        kind: 'directive.missionTransitionNarrationCandidate.v1',
        transitionKey: prepared.packet.transitionKey,
        text: 'x'.repeat(4001),
    }),
]) {
    assert.equal(parseMissionTransitionNarrationCandidate(invalid, { packet: prepared.packet }).ok, false);
}

const reviewRequest = createMissionTransitionNarrationReviewRequest({
    packet: prepared.packet,
    candidate: parsedCandidate.value,
    attemptNumber: 1,
});
assert.equal(reviewRequest.candidate.text, candidateText);
assert.equal(reviewRequest.authority.mustNotReveal.length, prepared.packet.mustNotReveal.length);
const retryReview = parseMissionTransitionNarrationReviewProposal(JSON.stringify({
    kind: 'directive.missionTransitionNarrationReview.v1',
    transitionKey: prepared.packet.transitionKey,
    decision: 'retry',
    reasonCodes: ['missing-required-beat'],
    guidance: 'Mention the authored next setup without adding outcomes.',
}), { request: reviewRequest });
assert.equal(retryReview.ok, true, JSON.stringify(retryReview));
assert.equal(resolveMissionTransitionNarrationReview({
    review: retryReview.value,
    attemptNumber: 1,
    fallback: prepared.fallback,
}).action, 'retry');
const bounded = resolveMissionTransitionNarrationReview({
    review: retryReview.value,
    attemptNumber: 2,
    fallback: prepared.fallback,
});
assert.equal(bounded.action, 'fallback');
assert.deepEqual(bounded.output, prepared.fallback);

const acceptedReview = parseMissionTransitionNarrationReviewProposal(JSON.stringify({
    kind: 'directive.missionTransitionNarrationReview.v1',
    transitionKey: prepared.packet.transitionKey,
    decision: 'accept',
    reasonCodes: [],
    guidance: null,
}), { request: reviewRequest });
assert.equal(acceptedReview.ok, true);
assert.equal(resolveMissionTransitionNarrationReview({
    review: acceptedReview.value,
    attemptNumber: 1,
    candidate: parsedCandidate.value,
    fallback: prepared.fallback,
}).action, 'accept');

for (const invalidReview of [
    JSON.stringify({
        kind: 'directive.missionTransitionNarrationReview.v1',
        transitionKey: prepared.packet.transitionKey,
        decision: 'rewrite-state',
        reasonCodes: [],
        guidance: null,
    }),
    JSON.stringify({
        kind: 'directive.missionTransitionNarrationReview.v1',
        transitionKey: prepared.packet.transitionKey,
        decision: 'retry',
        reasonCodes: ['unknown-reason'],
        guidance: 'Invent a better target.',
    }),
]) {
    assert.equal(parseMissionTransitionNarrationReviewProposal(invalidReview, { request: reviewRequest }).ok, false);
}

assert.deepEqual(createMissionTransitionNarrationFallback(prepared.packet), prepared.fallback);
const activeOnlyState = structuredClone(campaignState);
activeOnlyState.mission.v1History = [];
activeOnlyState.mission.v1Journey.revision = 0;
const noTransitionGateway = createStateDeltaGateway({
    getState: () => activeOnlyState,
    setState: () => {},
});
const noTransitionRuntime = createV1MissionRuntime({
    getState: () => activeOnlyState,
    stateDeltaGateway: noTransitionGateway,
    generationRouter: { generate: async () => { throw new Error('must not run'); } },
});
assert.equal(noTransitionRuntime.prepareTransitionNarration({ runtimeAssets }).reasonCode, 'transition-source-unavailable');

console.log('V1 mission transition narration contract tests passed.');
