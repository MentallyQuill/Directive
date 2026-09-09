import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createInitialMissionJourney } from '../../src/mission/v1/mission-journey.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { createTurnProgressReporter } from '../../src/runtime/turn-progress.mjs';
import {
    captureAcceptedPairAnalysis,
    createNarrationDirectionReuseKey,
    createNarrationGenerationTargetKey,
    createV1MissionRuntime,
} from '../../src/runtime/v1-mission-runtime.mjs';
import { createEpisodeEvaluationRequest } from '../../src/story/episode-evaluator.mjs';
import { createEmptyStorySettlement } from '../../src/story/story-settlement-contracts.mjs';
import {
    acceptStoryContributions,
    appendStoryEffects,
    appendStoryPeopleEvents,
    checkpointStoryEpisode,
    observeStoryWorkingEvidence,
    openStoryEpisode,
} from '../../src/story/story-settlement.mjs';
import { createAshesInitialState, loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

const definition = JSON.parse(fs.readFileSync(
    'packages/bundled/breckenridge/v1/prelude-a-ship-underway.mission-v1.json',
    'utf8',
));
const loaded = loadAshesRuntimeAssets();
const runtimeAssets = {
    ...loaded,
    missionDefinitions: [{ path: 'prelude.mission-v1.json', definition }],
    missionDefinitionsById: new Map([[definition.id, { path: 'prelude.mission-v1.json', definition }]]),
};

function deferred() {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
}

function createReviewableState() {
    const branchId = 'save.directed';
    let storySettlement = createEmptyStorySettlement({ branchId });
    storySettlement = openStoryEpisode(storySettlement, {
        episodeId: 'episode.prior-review',
        sceneId: 'scene.prior-review',
        references: {
            missionIds: [definition.id],
            participantIds: ['mara-whitaker'],
            locationIds: ['briefing-room'],
        },
    });
    const contributions = Array.from({ length: 4 }, (_, index) => ({
        id: `contribution.prior-${index}`,
        messageId: `message.prior-${index}`,
        swipeId: index % 2 === 0 ? `swipe.prior-${index}` : null,
        role: index % 2 === 0 ? 'assistant' : 'user',
        textHash: (index + 1).toString(16).repeat(64),
        acceptedAtRevision: index + 1,
    }));
    storySettlement = acceptStoryContributions(storySettlement, contributions);
    storySettlement = observeStoryWorkingEvidence(storySettlement, {
        branchId,
        observations: contributions.map((source, index) => ({
            contributionId: source.id,
            role: source.role,
            textHash: source.textHash,
            text: `Accepted prior episode evidence ${index}.`,
        })),
    });
    storySettlement = appendStoryEffects(storySettlement, [{
        id: 'effect.prior-visible',
        type: 'mission.decisionRecorded',
        targetId: 'outcome.prior-review',
        value: 'corrective-commitment',
        sourceContributionIds: ['contribution.prior-2'],
        playerVisibility: 'visible',
        status: 'active',
    }]);
    storySettlement = appendStoryPeopleEvents(storySettlement, [{
        id: 'people.relationship.prior-2',
        type: 'relationshipEvidence',
        personId: 'mara-whitaker',
        summary: 'Whitaker accepted a candid correction before the next exchange.',
        sourceContributionIds: ['contribution.prior-2'],
    }]);
    storySettlement = checkpointStoryEpisode(storySettlement, { force: true });

    const state = createAshesInitialState({
        campaignId: 'campaign.ashes',
        saveId: branchId,
        chatId: 'chat.directed',
    });
    const journey = createInitialMissionJourney({ definition, branchId });
    state.mission = {
        activeMissionId: definition.packageBinding.sourceId,
        v1: createMissionState({ definition, branchId }),
        v1Journey: journey.journey,
        v1History: journey.history,
    };
    state.mission.v1.outcomes['outcome.scene-pacing.prelude.staff-readiness.authorization'] = 'authorized';
    state.storySettlement = storySettlement;
    return state;
}

function snapshotFor(sourceRangeHash = 'range.directed') {
    return {
        kind: 'directive.acceptedPairSnapshot.v1',
        envelope: {
            campaignId: 'campaign.ashes',
            saveId: 'save.directed',
            chatId: 'chat.directed',
            packageId: definition.packageBinding.packageId,
            packageVersion: definition.packageBinding.packageVersion,
            activeMissionId: definition.packageBinding.sourceId,
        },
        source: {
            sourceRangeHash,
            previousAssistant: {
                hostMessageId: 'message.assistant.directed',
                role: 'assistant',
                text: 'Lieutenant Vale confirms the Ravenna transfer remains scheduled for fourteen hundred.',
                textHash: 'a'.repeat(64),
                sourceIntegrity: 'clean',
                selectedVariant: {
                    selectedSwipeId: 'swipe.directed',
                    selectedSwipeIndex: 0,
                    textHash: 'a'.repeat(64),
                },
            },
            currentPlayer: {
                hostMessageId: 'message.player.directed',
                role: 'user',
                text: 'I ask what flexibility we have with the Ravenna transfer.',
                textHash: 'b'.repeat(64),
                sourceIntegrity: 'clean',
            },
        },
    };
}

function interpretedFor({ candidatePacket, sourcePair }) {
    return {
        ok: true,
        status: 'interpreted',
        interpretation: {
            kind: 'directive.missionEvidenceInterpretation.v1',
            assistantAcceptance: 'accepted',
            claims: [],
            peopleEvents: [{
                type: 'personIntroduced',
                localRef: 'lieutenant-vale',
                name: 'Lieutenant Vale',
                introductionSummary: 'Vale is the Ravenna transfer liaison.',
                sourceSlot: 'previousAssistant',
                evidenceQuote: 'Lieutenant Vale confirms the Ravenna transfer remains scheduled for fourteen hundred.',
            }],
            abstained: false,
            time: {
                decision: 'unchanged',
                basis: 'noPassage',
                elapsedSeconds: 0,
                reason: 'same-second',
                confidence: 0.9,
            },
        },
        proposal: {
            kind: 'directive.missionEvidenceProposal.v1',
            branchId: candidatePacket.branchId,
            missionId: candidatePacket.missionId,
            baseRevision: candidatePacket.baseRevision,
            claims: [],
        },
        diagnostics: { candidateCount: candidatePacket.candidates.length, selectedClaimCount: 0 },
        sourcePair,
    };
}

function directorProposalFor(request) {
    const review = request.episodeReview;
    return {
        kind: 'directive.storyDirectorProposal.v1',
        envelope: structuredClone(request.envelope),
        coverage: 'complete',
        threadChanges: [{
            operation: 'open',
            localRef: 'ravenna-transfer',
            title: 'Ravenna transfer',
            category: 'schedule',
            sourceSlot: 'previousAssistant',
            evidenceQuote: 'Ravenna transfer remains scheduled for fourteen hundred.',
        }, {
            operation: 'addFact',
            threadRef: 'ravenna-transfer',
            text: 'The Ravenna transfer remains scheduled for fourteen hundred.',
            claimType: 'narrated-fact',
            authoredRef: null,
            supersedesFactId: null,
            sourceSlot: 'previousAssistant',
            evidenceQuote: 'Ravenna transfer remains scheduled for fourteen hundred.',
        }],
        direction: {
            move: 'respond-to-player',
            targetRef: null,
            newComplications: 'avoid',
            requires: [],
        },
        episodeReview: review ? {
            kind: 'directive.episodeEvaluationProposal.v1',
            ...review.envelope,
            decision: 'continue',
            boundaryReason: null,
            significanceCriteria: [],
            summary: 'Whitaker and the XO retain measured trust while the prior commitment remains open.',
            foregroundQuestion: 'Will the corrective commitment be completed?',
            sourceContributionIds: ['contribution.prior-2', 'contribution.prior-3'],
            effectIds: ['effect.prior-visible'],
            relationshipUpdates: [{
                personId: 'mara-whitaker',
                posture: 'Measured professional trust.',
                openMatter: 'Whether the corrective commitment is completed.',
                sourceContributionIds: ['contribution.prior-2'],
            }],
            characterMoments: [],
        } : null,
    };
}

function createHarness({ persistError = null } = {}) {
    let campaignState = createReviewableState();
    let persistCount = 0;
    const gateway = createStateDeltaGateway({
        getState: () => campaignState,
        setState: (next) => { campaignState = next; },
        persist: async () => {
            persistCount += 1;
            if (persistError) throw persistError;
        },
    });
    return {
        gateway,
        getState: () => campaignState,
        get persistCount() { return persistCount; },
    };
}

const snapshot = snapshotFor();
assert.equal(
    createNarrationGenerationTargetKey({ snapshot, generationType: 'normal' }),
    'normal:message.player.directed:range.directed',
);
const postTransitionState = createReviewableState();
const originalMissionSnapshot = snapshotFor('range.transition-reuse');
originalMissionSnapshot.envelope.packageId = 'directive:campaign-package:prior';
originalMissionSnapshot.envelope.packageVersion = '0.9.0';
originalMissionSnapshot.envelope.activeMissionId = 'prior-mission';
const successorMissionSnapshot = structuredClone(originalMissionSnapshot);
successorMissionSnapshot.envelope.packageId = postTransitionState.activeCampaignPackage.packageId;
successorMissionSnapshot.envelope.packageVersion = postTransitionState.activeCampaignPackage.packageVersion;
successorMissionSnapshot.envelope.activeMissionId = postTransitionState.mission.activeMissionId;
const reuseKeyInput = {
    campaignState: postTransitionState,
    runtimeAssets,
    generationType: 'normal',
    providerFingerprints: { interpreter: 'utility.1', director: 'reasoning.1' },
};
const capturedMissionReuseKey = await createNarrationDirectionReuseKey({
    ...reuseKeyInput,
    snapshot: originalMissionSnapshot,
});
const successorMissionReuseKey = await createNarrationDirectionReuseKey({
    ...reuseKeyInput,
    snapshot: successorMissionSnapshot,
});
assert.equal(
    capturedMissionReuseKey,
    successorMissionReuseKey,
    'post-transition reuse identity follows committed mission/package state rather than the captured envelope',
);
const changedPhysicalSource = structuredClone(successorMissionSnapshot);
changedPhysicalSource.source.currentPlayer.textHash = 'c'.repeat(64);
assert.notEqual(
    await createNarrationDirectionReuseKey({ ...reuseKeyInput, snapshot: changedPhysicalSource }),
    successorMissionReuseKey,
    'a changed physical narration source cannot reuse the prior direction',
);
const captured = captureAcceptedPairAnalysis({
    campaignState: createReviewableState(),
    runtimeAssets,
    snapshot,
    generationType: 'normal',
});
assert.deepEqual(captured.interpreterInput.sourcePair, captured.sourcePair);
assert.equal(captured.interpreterRequest.kind, 'directive.missionEvidenceInterpretationRequest.v1');
assert.equal(captured.directorRequest.envelope.generationType, 'normal');
assert.notEqual(captured.directorRequest.episodeReview, null);

const interpretationGate = deferred();
const directorGate = deferred();
const interpreterStarted = deferred();
const directorStarted = deferred();
let interpreterCalls = 0;
let directorCalls = 0;
let latestDirectorRequest = null;
let directorProviderFingerprint = 'reasoning.1';
const harness = createHarness();
const directedProgress = createTurnProgressReporter();
const directedProgressEvents = [];
directedProgress.subscribeTurnProgress((event) => directedProgressEvents.push(event));
const runtime = createV1MissionRuntime({
    getState: harness.getState,
    stateDeltaGateway: harness.gateway,
    interpretAcceptedPair: async ({ onAttempt, onPhase, ...input }) => {
        interpreterCalls += 1;
        onAttempt?.(1);
        interpreterStarted.resolve();
        await interpretationGate.promise;
        onPhase?.('validating-response');
        return interpretedFor(input);
    },
    directStory: async ({ request, onAttempt, onPhase }) => {
        directorCalls += 1;
        onAttempt?.(1);
        directorStarted.resolve();
        latestDirectorRequest = request;
        const result = directorCalls === 1
            ? await directorGate.promise
            : { ok: true, proposal: directorProposalFor(request), diagnostics: {} };
        if (result?.ok) onPhase?.('validating-response');
        return result;
    },
    turnProgress: directedProgress,
    providerFingerprints: () => ({ interpreter: 'utility.1', director: directorProviderFingerprint }),
    now: () => '2026-09-08T04:00:00.000Z',
});
const before = structuredClone(harness.getState());
const first = runtime.settleAcceptedPair({ runtimeAssets, snapshot, generationType: 'normal' });
await Promise.all([interpreterStarted.promise, directorStarted.promise]);
assert.equal(interpreterCalls, 1);
assert.equal(directorCalls, 1, 'both role requests start from immutable R');
assert.deepEqual(harness.getState(), before);
assert.equal(harness.persistCount, 0);
interpretationGate.resolve();
directorGate.resolve({ ok: false, reasonCode: 'director-invalid-output', diagnostics: {} });
const blocked = await first;
assert.equal(blocked.ok, false);
assert.deepEqual(blocked.diagnostics.blockedRoles, ['director']);
assert.equal(typeof blocked.diagnostics.turnKey, 'string');
assert.equal(harness.persistCount, 0);
assert.deepEqual(harness.getState(), before);
assert.deepEqual(
    directedProgressEvents.filter((event) => event.type === 'update' && event.stage === 'reviewing-events')
        .map(({ phase }) => phase),
    ['waiting-model', 'validating-response'],
    'the mission wrapper propagates interpreter phases',
);
assert.deepEqual(
    directedProgressEvents.filter((event) => event.type === 'update' && event.stage === 'directing-story')
        .map(({ phase }) => phase),
    ['waiting-model'],
    'a failed director result never claims response validation started',
);

const settled = await runtime.settleAcceptedPair({ runtimeAssets, snapshot, generationType: 'normal' });
assert.equal(settled.ok, true, JSON.stringify(settled));
assert.equal(interpreterCalls, 1, 'the exact successful interpreter result is reused');
assert.equal(directorCalls, 2);
assert.deepEqual(
    directedProgressEvents.filter((event) => event.type === 'update' && event.stage === 'directing-story')
        .map(({ phase }) => phase),
    ['waiting-model', 'waiting-model', 'validating-response'],
    'a successful retry reports validation on the same director operation',
);
assert.equal(harness.persistCount, 1, 'review, pair, continuity, receipt and dossier queue share one save');
assert.equal(harness.getState().stateCustody.revision, before.stateCustody.revision + 1);
assert.match(settled.instruction, /Respond to the player within the current scene/);
assert.equal(settled.diagnostics.turnKey, blocked.diagnostics.turnKey);
assert.equal(latestDirectorRequest.pendingPair.previousAssistant.text, snapshot.source.previousAssistant.text);
assert.equal(harness.getState().storySettlement.continuityEvents.length, 2);
assert.equal(harness.getState().storySettlement.directorReceipts.length, 1);
assert.equal(harness.getState().storySettlement.pendingDossiers.length, 1);
assert.equal(harness.getState().storySettlement.pendingDossiers[0].status, 'pending');
assert.equal(
    harness.getState().storySettlement.episodes[0].effects.some(({ type, targetId }) => (
        type === 'character.relationshipPosture' && targetId === 'mara-whitaker'
    )),
    true,
);
assert.equal(
    harness.getState().storySettlement.episodes[0].contributions.some(({ messageId }) => (
        messageId === 'message.player.directed'
    )),
    true,
);

const replayRevision = harness.getState().stateCustody.revision;
const replay = await runtime.settleAcceptedPair({ runtimeAssets, snapshot, generationType: 'normal' });
assert.equal(replay.status, 'already-settled');
assert.deepEqual(replay.instruction, settled.instruction);
assert.equal(harness.getState().stateCustody.revision, replayRevision);
assert.equal(harness.persistCount, 1);
assert.equal(interpreterCalls, 1);
assert.equal(directorCalls, 2);

const noBackfill = await runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot,
    generationType: 'continue',
    allowModelCall: false,
});
assert.equal(noBackfill.status, 'already-settled');
assert.equal(noBackfill.directorReceipt, undefined);
assert.equal(interpreterCalls, 1);
assert.equal(directorCalls, 2, 'historical accepted pairs do not receive new direction');
assert.equal(harness.persistCount, 1);

directorProviderFingerprint = 'reasoning.2';
const providerRefreshSettlementRevision = harness.getState().storySettlement.revision;
const providerRefreshCustodyRevision = harness.getState().stateCustody.revision;
const providerRefresh = await runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot,
    generationType: 'normal',
});
assert.equal(providerRefresh.status, 'directed');
assert.equal(interpreterCalls, 1);
assert.equal(directorCalls, 3, 'provider changes invalidate the postcommit direction reuse key');
assert.equal(harness.persistCount, 2);
assert.equal(harness.getState().storySettlement.revision, providerRefreshSettlementRevision + 1);
assert.equal(harness.getState().stateCustody.revision, providerRefreshCustodyRevision + 1);

const swipeSettlementRevision = harness.getState().storySettlement.revision;
const swipeCustodyRevision = harness.getState().stateCustody.revision;
const swipe = await runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot,
    generationType: 'swipe',
});
assert.equal(swipe.ok, true, JSON.stringify(swipe));
assert.equal(swipe.status, 'directed');
assert.equal(interpreterCalls, 1, 'a changed narration type on a settled pair does not re-interpret evidence');
assert.equal(directorCalls, 4, 'a changed narration type receives its own direction');
assert.equal(harness.persistCount, 3);
assert.equal(harness.getState().storySettlement.revision, swipeSettlementRevision + 1);
assert.equal(harness.getState().stateCustody.revision, swipeCustodyRevision + 1);
assert.equal(
    swipe.directorReceipt.generationTargetKey,
    'swipe:message.player.directed:range.directed',
);

const budgetHarness = createHarness();
let budgetInterpreterCalls = 0;
let budgetDirectorCalls = 0;
const budgetRuntime = createV1MissionRuntime({
    getState: budgetHarness.getState,
    stateDeltaGateway: budgetHarness.gateway,
    interpretAcceptedPair: async (input) => {
        budgetInterpreterCalls += 1;
        return interpretedFor(input);
    },
    directStory: async ({ request }) => {
        budgetDirectorCalls += 1;
        return { ok: true, proposal: directorProposalFor(request), diagnostics: {} };
    },
    providerFingerprints: () => ({ interpreter: 'utility.1', director: 'reasoning.1' }),
});
const budgetBlocked = await budgetRuntime.settleAcceptedPair({
    runtimeAssets,
    snapshot,
    generationType: 'normal',
    allowModelCall: false,
});
assert.equal(budgetBlocked.ok, false);
assert.equal(budgetBlocked.reasonCode, 'model-call-budget-exhausted');
assert.deepEqual(budgetBlocked.diagnostics.blockedRoles, ['interpreter', 'director']);
assert.equal(budgetInterpreterCalls, 0, 'historical reconciliation never starts an interpreter call');
assert.equal(budgetDirectorCalls, 0, 'historical reconciliation never starts a director call');
assert.equal(budgetHarness.persistCount, 0);

const targetHarness = createHarness();
let targetInterpreterCalls = 0;
let targetDirectorCalls = 0;
const targetRuntime = createV1MissionRuntime({
    getState: targetHarness.getState,
    stateDeltaGateway: targetHarness.gateway,
    interpretAcceptedPair: async (input) => {
        targetInterpreterCalls += 1;
        return interpretedFor(input);
    },
    directStory: async ({ request }) => {
        targetDirectorCalls += 1;
        const target = request.authoredContext.opportunities.find(
            ({ id }) => id === 'objective.prelude.staff-readiness',
        );
        return {
            ok: true,
            proposal: {
                ...directorProposalFor(request),
                direction: target ? {
                    move: 'surface-opportunity',
                    targetRef: target.id,
                    newComplications: 'avoid',
                    requires: [],
                } : {
                    move: 'respond-to-player',
                    targetRef: null,
                    newComplications: 'avoid',
                    requires: [],
                },
            },
            diagnostics: {},
        };
    },
    providerFingerprints: () => ({ interpreter: 'utility.1', director: 'reasoning.1' }),
});
const targeted = await targetRuntime.settleAcceptedPair({ runtimeAssets, snapshot, generationType: 'normal' });
assert.match(targeted.instruction, /Approved target:/);
const changedMission = structuredClone(targetHarness.getState().mission.v1);
changedMission.objectives['objective.prelude.staff-readiness'] = {
    state: 'inactive',
    visibility: 'hidden',
    disposition: null,
};
await targetHarness.gateway.applyProposal({
    operations: [{ op: 'set', path: 'mission.v1', value: changedMission }],
    domains: ['mission'],
    baseRevision: targetHarness.gateway.revision(),
    source: 'test.story-director-target-change',
    reason: 'Make the previously selected objective unavailable.',
});
const redirected = await targetRuntime.settleAcceptedPair({
    runtimeAssets,
    snapshot,
    generationType: 'normal',
});
assert.match(redirected.instruction, /Respond to the player within the current scene/);
assert.doesNotMatch(redirected.instruction, /Approved target:/);
assert.equal(targetInterpreterCalls, 1, 'settled evidence remains accepted when direction authority changes');
assert.equal(targetDirectorCalls, 2, 'stale target authority requires fresh direction');
assert.equal(
    targetHarness.getState().storySettlement.directorReceipts.filter(
        ({ generationTargetKey }) => generationTargetKey === 'normal:message.player.directed:range.directed',
    ).length,
    1,
    'stale target receipts are replaced atomically',
);

const failingHarness = createHarness({ persistError: new Error('disk unavailable') });
const failingBefore = structuredClone(failingHarness.getState());
let failingInterpreterCalls = 0;
let failingDirectorCalls = 0;
const failingRuntime = createV1MissionRuntime({
    getState: failingHarness.getState,
    stateDeltaGateway: failingHarness.gateway,
    interpretAcceptedPair: async (input) => {
        failingInterpreterCalls += 1;
        return interpretedFor(input);
    },
    directStory: async ({ request }) => {
        failingDirectorCalls += 1;
        return {
            ok: true,
            proposal: directorProposalFor(request),
            diagnostics: {},
        };
    },
    providerFingerprints: () => ({ interpreter: 'utility.1', director: 'reasoning.1' }),
});
const persistenceFailure = await failingRuntime.settleAcceptedPair({
    runtimeAssets,
    snapshot,
    generationType: 'normal',
});
assert.equal(persistenceFailure.ok, false);
assert.equal(persistenceFailure.reasonCode, 'persistence-failed');
assert.equal(failingHarness.persistCount, 1);
assert.deepEqual(failingHarness.getState(), failingBefore, 'a failed one-save commit rolls back the full candidate');
const persistenceRetry = await failingRuntime.settleAcceptedPair({
    runtimeAssets,
    snapshot,
    generationType: 'normal',
    allowModelCall: false,
});
assert.equal(persistenceRetry.reasonCode, 'persistence-failed');
assert.equal(failingHarness.persistCount, 2, 'an explicit retry can retry only persistence');
assert.equal(failingInterpreterCalls, 1, 'the successful interpretation survives a persistence failure');
assert.equal(failingDirectorCalls, 1, 'the successful direction survives a persistence failure');

console.log('Story director mission runtime tests passed.');
