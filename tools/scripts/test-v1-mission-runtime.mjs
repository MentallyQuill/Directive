import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import {
    createV1MissionRuntime,
    resolveActiveV1MissionDefinition,
} from '../../src/runtime/v1-mission-runtime.mjs';
import { createEpisodeHardBoundary } from '../../src/story/episode-boundary.mjs';
import {
    createDutyReportManifest,
    createDutyReportVisibleSegment,
    dutyReportTextHash,
} from '../../src/mission/v1/duty-report-delivery.mjs';
import { selectPendingDutyReport } from '../../src/mission/v1/duty-report-planner.mjs';
import { validateMissionStateAuthority } from '../../src/mission/v1/mission-state-authority.mjs';

const canonicalDefinition = JSON.parse(fs.readFileSync(
    'packages/bundled/breckenridge/v1/prelude-a-ship-underway.mission-v1.json',
    'utf8',
));
const transitionDefinition = JSON.parse(fs.readFileSync(
    'tests/fixtures/mission/v1/v1-hesperus-reference.fixture.json',
    'utf8',
));
const packageData = {
    manifest: {
        id: canonicalDefinition.packageBinding.packageId,
        version: canonicalDefinition.packageBinding.packageVersion,
    },
};

function runtimeAssetsFor(definitions = [canonicalDefinition], packageOverride = packageData) {
    const records = definitions.map((definition) => ({
        path: `${definition.id}.json`,
        definition,
    }));
    return {
        packageData: packageOverride,
        missionDefinitions: records,
        missionDefinitionsById: new Map(records.map((record) => [record.definition.id, record])),
    };
}

function campaignStateFor({ definition = canonicalDefinition, activeMissionId = definition.packageBinding.sourceId } = {}) {
    return {
        campaign: { id: 'campaign.ashes' },
        activeCampaignPackage: {
            packageId: definition.packageBinding.packageId,
            packageVersion: definition.packageBinding.packageVersion,
        },
        campaignChatBinding: { saveId: 'save.alpha', chatId: 'chat.alpha' },
        mission: {
            activeMissionId,
            legacyStatus: 'unchanged',
            openAssignments: [{ id: 'legacy.assignment', title: 'Do not alter' }],
        },
        ship: { technicalDebt: [{ id: 'legacy.ship-entry' }] },
        relationships: { people: [{ id: 'legacy.relationship' }] },
        threadLedger: { records: [{ id: 'legacy.thread' }] },
        quests: [{ id: 'legacy.quest' }],
        commandLog: { entries: [{ id: 'legacy.command' }] },
        commandBearing: { current: 3 },
    };
}

function snapshotFor({
    definition = canonicalDefinition,
    sourceRangeHash = 'range.001',
    assistantIntegrity = 'clean',
    playerIntegrity = 'clean',
    pairNumber = 10,
} = {}) {
    const assistantHash = (pairNumber % 15 + 1).toString(16).repeat(64);
    const playerHash = ((pairNumber + 1) % 15 + 1).toString(16).repeat(64);
    return {
        kind: 'directive.latestPairSceneSnapshot.v1',
        envelope: {
            campaignId: 'campaign.ashes',
            saveId: 'save.alpha',
            chatId: 'chat.alpha',
            packageId: definition.packageBinding.packageId,
            packageVersion: definition.packageBinding.packageVersion,
            activeMissionId: definition.packageBinding.sourceId,
        },
        source: {
            sourceRangeHash,
            previousAssistant: {
                hostMessageId: `message.assistant.${pairNumber}`,
                role: 'assistant',
                text: 'Captain Whitaker completes the command handover and places the watch in your hands.',
                textHash: assistantHash,
                sourceIntegrity: assistantIntegrity,
                selectedVariant: {
                    selectedSwipeId: `swipe.${pairNumber}`,
                    selectedSwipeIndex: 2,
                    textHash: assistantHash,
                },
            },
            currentPlayer: {
                hostMessageId: `message.player.${pairNumber + 1}`,
                role: 'user',
                text: 'I accept the watch and proceed.',
                textHash: playerHash,
                sourceIntegrity: playerIntegrity,
            },
        },
    };
}

function interpretationOutput({ assistantAcceptance = 'accepted', claims = [], abstained = false } = {}) {
    return JSON.stringify({
        kind: 'directive.missionEvidenceInterpretation.v1',
        assistantAcceptance,
        claims,
        abstained,
    });
}

function createHarness({
    definition = canonicalDefinition,
    state = campaignStateFor({ definition }),
    assets = runtimeAssetsFor([definition]),
    outputs = [],
    generation = null,
    checkpointEveryContributions = 8,
} = {}) {
    let campaignState = structuredClone(state);
    let persistCount = 0;
    let generationCount = 0;
    const gateway = createStateDeltaGateway({
        getState: () => campaignState,
        setState: (next) => { campaignState = next; },
        persist: async () => { persistCount += 1; },
        now: () => '2026-08-09T14:00:00.000Z',
    });
    const generationRouter = generation || {
        generate: async () => {
            const text = outputs[generationCount] ?? outputs.at(-1) ?? '';
            generationCount += 1;
            return { ok: true, response: { text, providerId: 'test', model: 'test-model' } };
        },
    };
    const runtime = createV1MissionRuntime({
        getState: () => campaignState,
        stateDeltaGateway: gateway,
        generationRouter,
        now: () => '2026-08-09T14:00:00.000Z',
        timeoutMs: 200,
        checkpointEveryContributions,
    });
    return {
        assets,
        gateway,
        runtime,
        get campaignState() { return campaignState; },
        get persistCount() { return persistCount; },
        get generationCount() { return generationCount; },
    };
}

const exactResolution = resolveActiveV1MissionDefinition({
    campaignState: campaignStateFor(),
    runtimeAssets: runtimeAssetsFor(),
});
assert.equal(exactResolution.ok, true);
assert.equal(exactResolution.definition.id, canonicalDefinition.id);

const projectionHarness = createHarness();
const projectionStateBefore = structuredClone(projectionHarness.campaignState);
const builtProjection = projectionHarness.runtime.buildPlayerProjection({
    runtimeAssets: projectionHarness.assets,
});
assert.equal(builtProjection.ok, true);
assert.equal(builtProjection.status, 'available');
assert.equal(builtProjection.projection.kind, 'directive.playerProjection.v1');
assert.equal(Object.hasOwn(builtProjection.projection.ship, 'technicalDebt'), false);
assert.equal(projectionHarness.persistCount, 0);
assert.equal(projectionHarness.generationCount, 0);
assert.deepEqual(projectionHarness.campaignState, projectionStateBefore);

const unavailableProjection = projectionHarness.runtime.buildPlayerProjection({
    runtimeAssets: runtimeAssetsFor([], packageData),
});
assert.equal(unavailableProjection.ok, false);
assert.equal(unavailableProjection.reasonCode, 'definition-assets-missing');

const malformedProjectionHarness = createHarness();
malformedProjectionHarness.campaignState.mission.v1 = createMissionState({
    definition: canonicalDefinition,
    branchId: 'save.alpha',
});
malformedProjectionHarness.campaignState.mission.v1.revision = 'forged';
const malformedProjection = malformedProjectionHarness.runtime.buildPlayerProjection({
    runtimeAssets: malformedProjectionHarness.assets,
});
assert.equal(malformedProjection.ok, false);
assert.equal(malformedProjection.reasonCode, 'projection-state-invalid');

const v1BoundState = campaignStateFor();
v1BoundState.mission.v1 = createMissionState({ definition: canonicalDefinition, branchId: 'save.alpha' });
v1BoundState.mission.activeMissionId = 'legacy-wrong-id';
assert.equal(resolveActiveV1MissionDefinition({
    campaignState: v1BoundState,
    runtimeAssets: runtimeAssetsFor(),
}).ok, true, 'persisted V1 definition identity outranks the legacy active mission mirror');

const ambiguousDefinition = {
    ...structuredClone(canonicalDefinition),
    id: 'mission.ambiguous-prelude',
};
assert.equal(resolveActiveV1MissionDefinition({
    campaignState: campaignStateFor(),
    runtimeAssets: runtimeAssetsFor([canonicalDefinition, ambiguousDefinition]),
}).reasonCode, 'definition-ambiguous');
assert.equal(resolveActiveV1MissionDefinition({
    campaignState: campaignStateFor(),
    runtimeAssets: runtimeAssetsFor([], packageData),
}).reasonCode, 'definition-assets-missing');
assert.equal(resolveActiveV1MissionDefinition({
    campaignState: campaignStateFor(),
    runtimeAssets: runtimeAssetsFor([{ ...canonicalDefinition, kind: 'directive.invalid' }]),
}).reasonCode, 'definition-invalid');
assert.equal(resolveActiveV1MissionDefinition({
    campaignState: campaignStateFor({ activeMissionId: 'chapter-1-the-empty-convoy' }),
    runtimeAssets: runtimeAssetsFor(),
}).reasonCode, 'active-mission-unavailable');
assert.equal(resolveActiveV1MissionDefinition({
    campaignState: campaignStateFor(),
    runtimeAssets: runtimeAssetsFor([canonicalDefinition], {
        manifest: { ...packageData.manifest, version: '0.4.0' },
    }),
}).reasonCode, 'package-version-mismatch');

const settlementHarness = createHarness({
    outputs: [interpretationOutput({
        claims: [{
            candidateId: 'policy.prelude.command-handover-completed',
            sourceSlot: 'previousAssistant',
        }],
    })],
});
const legacyBefore = structuredClone(settlementHarness.campaignState);
const settlement = await settlementHarness.runtime.settleAcceptedPair({
    runtimeAssets: settlementHarness.assets,
    snapshot: snapshotFor(),
});
assert.equal(settlement.ok, true);
assert.equal(settlement.attempted, true);
assert.equal(settlement.status, 'settled');
assert.deepEqual(settlement.committedRoots, ['mission', 'storySettlement']);
assert.equal(settlementHarness.persistCount, 1);
assert.equal(settlementHarness.campaignState.mission.v1.events.includes('event.prelude.command-handover-completed'), true);
assert.equal(settlementHarness.campaignState.storySettlement.episodes[0].contributions[0].messageId, 'message.assistant.10');
assert.equal(settlementHarness.campaignState.storySettlement.episodes[0].contributions[0].swipeId, 'swipe.10');
assert.equal(settlementHarness.campaignState.storySettlement.episodes[0].contributions[0].role, 'assistant');
assert.deepEqual(
    settlementHarness.campaignState.storySettlement.episodes[0].contributions.map((item) => item.role),
    ['assistant', 'user'],
);
assert.deepEqual(
    settlementHarness.campaignState.storySettlement.episodes[0].workingCapsule.recentEvidence.map((item) => item.role),
    ['assistant', 'user'],
);
assert.equal(settlement.reviewToken, null);
assert.deepEqual(settlementHarness.campaignState.mission.openAssignments, legacyBefore.mission.openAssignments);
for (const root of ['ship', 'relationships', 'threadLedger', 'quests', 'commandLog', 'commandBearing']) {
    assert.deepEqual(settlementHarness.campaignState[root], legacyBefore[root], `${root} remains legacy-authoritative in shadow mode`);
}
assert.equal(
    settlementHarness.campaignState.storySettlement.episodes[0].workingCapsule.recentEvidence[0].excerpt,
    'Captain Whitaker completes the command handover and places the watch in your hands.',
    'only a capped active-episode excerpt is retained',
);

const invalidBoundaryHarness = createHarness({
    outputs: [interpretationOutput({ claims: [] })],
});
const invalidBoundary = await invalidBoundaryHarness.runtime.settleAcceptedPair({
    runtimeAssets: invalidBoundaryHarness.assets,
    snapshot: snapshotFor({ sourceRangeHash: 'range.invalid-boundary' }),
    hardBoundary: { reason: 'topic change' },
});
assert.equal(invalidBoundary.reasonCode, 'hard-boundary-invalid');
assert.equal(invalidBoundary.attempted, false);
assert.equal(invalidBoundaryHarness.generationCount, 0);
assert.equal(invalidBoundaryHarness.persistCount, 0);

const explicitBoundaryHarness = createHarness({
    outputs: [interpretationOutput({ claims: [{
        candidateId: 'policy.prelude.command-handover-completed',
        sourceSlot: 'previousAssistant',
    }] })],
});
const explicitHardBoundary = createEpisodeHardBoundary({
    id: 'boundary.authored-handover',
    branchId: 'save.alpha',
    code: 'authored-scene-closure',
    source: { kind: 'campaignReducer', id: 'campaign.handover-closed' },
    sourceContributionIds: [],
});
const explicitlySealed = await explicitBoundaryHarness.runtime.settleAcceptedPair({
    runtimeAssets: explicitBoundaryHarness.assets,
    snapshot: snapshotFor({ sourceRangeHash: 'range.explicit-boundary' }),
    hardBoundary: explicitHardBoundary,
});
assert.equal(explicitlySealed.ok, true);
assert.equal(explicitBoundaryHarness.campaignState.storySettlement.episodes[0].status, 'sealed');
assert.deepEqual(explicitBoundaryHarness.campaignState.storySettlement.episodes[0].hardBoundary, explicitHardBoundary);
assert.equal(explicitlySealed.reviewToken, null);

const continuationHarness = createHarness({
    checkpointEveryContributions: 4,
    outputs: [
        interpretationOutput({ claims: [{
            candidateId: 'policy.prelude.command-handover-completed',
            sourceSlot: 'previousAssistant',
        }] }),
        interpretationOutput({ claims: [] }),
    ],
});
const continuationFirst = await continuationHarness.runtime.settleAcceptedPair({
    runtimeAssets: continuationHarness.assets,
    snapshot: snapshotFor({ sourceRangeHash: 'range.continuation-1', pairNumber: 20 }),
});
assert.equal(continuationFirst.reviewToken, null);
const missionRevisionBeforeContinuation = continuationHarness.campaignState.mission.v1.revision;
const continuation = await continuationHarness.runtime.settleAcceptedPair({
    runtimeAssets: continuationHarness.assets,
    snapshot: snapshotFor({ sourceRangeHash: 'range.continuation-2', pairNumber: 30 }),
});
assert.equal(continuation.status, 'settled-no-effect');
assert.equal(continuationHarness.campaignState.mission.v1.revision, missionRevisionBeforeContinuation);
assert.equal(continuationHarness.campaignState.storySettlement.episodes.length, 1);
assert.equal(continuationHarness.campaignState.storySettlement.receipts.length, 0);
assert.equal(continuationHarness.campaignState.storySettlement.episodes[0].contributions.length, 4);
assert.equal(continuationHarness.campaignState.storySettlement.episodes[0].effects.length, 1);
assert.equal(continuationHarness.campaignState.storySettlement.episodes[0].workingCapsule.recentEvidence.length, 4);
assert.deepEqual(continuation.reviewToken, {
    kind: 'directive.episodeReviewToken.v1',
    branchId: 'save.alpha',
    episodeId: continuationHarness.campaignState.storySettlement.activeEpisode,
    episodeRevision: continuationHarness.campaignState.storySettlement.revision,
    checkpointSequence: 1,
});
assert.equal(continuationHarness.campaignState.ship.technicalDebt.length, 1);
assert.equal(continuationHarness.campaignState.relationships.people.length, 1);
assert.equal(continuationHarness.campaignState.quests.length, 1);
assert.equal(continuationHarness.campaignState.commandLog.entries.length, 1);
const replayedContinuation = await continuationHarness.runtime.settleAcceptedPair({
    runtimeAssets: continuationHarness.assets,
    snapshot: snapshotFor({ sourceRangeHash: 'range.continuation-2', pairNumber: 30 }),
});
assert.equal(replayedContinuation.status, 'already-settled');
assert.deepEqual(replayedContinuation.reviewToken, continuation.reviewToken);
assert.equal(continuationHarness.persistCount, 2);
assert.equal(continuationHarness.generationCount, 2);

const revisionAfterFirstSettlement = settlementHarness.gateway.revision();
const replay = await settlementHarness.runtime.settleAcceptedPair({
    runtimeAssets: settlementHarness.assets,
    snapshot: snapshotFor(),
});
assert.equal(replay.ok, true);
assert.equal(replay.status, 'already-settled');
assert.equal(replay.noChange, true);
assert.equal(settlementHarness.gateway.revision(), revisionAfterFirstSettlement);
assert.equal(settlementHarness.persistCount, 1);
assert.equal(settlementHarness.generationCount, 1, 'dedupe happens before another model call');

const correctedState = campaignStateFor();
correctedState.mission.v1 = createMissionState({ definition: canonicalDefinition, branchId: 'save.alpha' });
correctedState.mission.v1.knownFacts.push('fact.hesperus.passenger-risk');
const correctionHarness = createHarness({
    state: correctedState,
    outputs: [interpretationOutput({
        assistantAcceptance: 'corrected',
        claims: [{
            candidateId: 'policy.prelude.command-handover-completed',
            sourceSlot: 'previousAssistant',
        }, {
            candidateId: 'policy.hesperus.rescue-risk-decision',
            sourceSlot: 'currentPlayer',
            value: 'saferPlan',
        }],
    })],
});
const correction = await correctionHarness.runtime.settleAcceptedPair({
    runtimeAssets: correctionHarness.assets,
    snapshot: snapshotFor({ sourceRangeHash: 'range.correction' }),
});
assert.equal(correction.ok, true);
assert.equal(correctionHarness.campaignState.mission.v1.events.includes('event.prelude.command-handover-completed'), false);
assert.equal(correctionHarness.campaignState.mission.v1.outcomes['outcome.hesperus.rescue-risk-decision'], 'saferPlan');
assert.deepEqual(
    correctionHarness.campaignState.storySettlement.episodes[0].contributions.map((item) => item.role),
    ['user'],
    'corrected assistant prose cannot become source custody',
);
assert.deepEqual(
    correctionHarness.campaignState.storySettlement.episodes[0].workingCapsule.recentEvidence.map((item) => item.role),
    ['user'],
);

const abstentionHarness = createHarness({
    outputs: [interpretationOutput({ assistantAcceptance: 'ambiguous', claims: [], abstained: true })],
});
const abstention = await abstentionHarness.runtime.settleAcceptedPair({
    runtimeAssets: abstentionHarness.assets,
    snapshot: snapshotFor({ sourceRangeHash: 'range.abstain' }),
});
assert.equal(abstention.ok, true);
assert.equal(abstention.status, 'settled-no-effect');
assert.equal(abstentionHarness.campaignState.storySettlement.episodes.length, 0);
assert.equal(abstentionHarness.campaignState.storySettlement.receipts.length, 1);
assert.equal(abstentionHarness.campaignState.mission.v1.revision, 0);

const staleHarness = createHarness({ outputs: [interpretationOutput({ claims: [] })] });
const stale = await staleHarness.runtime.settleAcceptedPair({
    runtimeAssets: staleHarness.assets,
    snapshot: snapshotFor({ assistantIntegrity: 'stale' }),
});
assert.equal(stale.ok, false);
assert.equal(stale.attempted, false);
assert.equal(stale.reasonCode, 'source-integrity-unavailable');
assert.equal(staleHarness.persistCount, 0);
assert.equal(staleHarness.generationCount, 0);

const failedProviderHarness = createHarness({
    generation: { generate: async () => { throw new Error('secret provider detail'); } },
});
const failedProvider = await failedProviderHarness.runtime.settleAcceptedPair({
    runtimeAssets: failedProviderHarness.assets,
    snapshot: snapshotFor({ sourceRangeHash: 'range.provider-failure' }),
});
assert.equal(failedProvider.ok, false);
assert.equal(failedProvider.attempted, true);
assert.equal(failedProvider.reasonCode, 'provider-threw');
assert.equal(JSON.stringify(failedProvider).includes('secret provider detail'), false);
assert.equal(failedProviderHarness.persistCount, 0);

let conflictRevision = 0;
const conflictState = campaignStateFor();
const conflictGateway = {
    revision: () => conflictRevision,
    applyProposal: async () => { throw new Error('must not apply stale interpretation'); },
};
const conflictRuntime = createV1MissionRuntime({
    getState: () => conflictState,
    stateDeltaGateway: conflictGateway,
    generationRouter: {
        generate: async () => {
            conflictRevision = 1;
            return {
                ok: true,
                response: { text: interpretationOutput({ claims: [{
                    candidateId: 'policy.prelude.command-handover-completed',
                    sourceSlot: 'previousAssistant',
                }] }) },
            };
        },
    },
});
const conflict = await conflictRuntime.settleAcceptedPair({
    runtimeAssets: runtimeAssetsFor(),
    snapshot: snapshotFor({ sourceRangeHash: 'range.conflict' }),
});
assert.equal(conflict.ok, false);
assert.equal(conflict.reasonCode, 'state-revision-conflict');
assert.equal(conflictState.mission.v1, undefined);

const wrongEnvelopeHarness = createHarness({ outputs: [interpretationOutput({ claims: [] })] });
for (const [field, value, reasonCode] of [
    ['packageId', 'directive:campaign-package:other', 'snapshot-package-mismatch'],
    ['packageVersion', '0.0.0', 'snapshot-package-version-mismatch'],
    ['activeMissionId', 'chapter-1-the-empty-convoy', 'snapshot-mission-mismatch'],
    ['saveId', 'save.other', 'snapshot-branch-mismatch'],
    ['chatId', 'chat.other', 'snapshot-chat-mismatch'],
]) {
    const snapshot = snapshotFor({ sourceRangeHash: `range.wrong-${field}` });
    snapshot.envelope[field] = value;
    const result = await wrongEnvelopeHarness.runtime.settleAcceptedPair({
        runtimeAssets: wrongEnvelopeHarness.assets,
        snapshot,
    });
    assert.equal(result.reasonCode, reasonCode, `${field} mismatch is explicit`);
    assert.equal(result.attempted, false);
}
assert.equal(wrongEnvelopeHarness.generationCount, 0);

const transitionHarness = createHarness({
    definition: transitionDefinition,
    assets: runtimeAssetsFor([transitionDefinition]),
    state: campaignStateFor({ definition: transitionDefinition }),
    outputs: [interpretationOutput({ claims: [{
        candidateId: 'policy.hesperus-survivors-transferred',
        sourceSlot: 'previousAssistant',
    }] })],
});
const transition = await transitionHarness.runtime.settleAcceptedPair({
    runtimeAssets: transitionHarness.assets,
    snapshot: snapshotFor({ definition: transitionDefinition, sourceRangeHash: 'range.transition' }),
});
assert.equal(transition.ok, true);
assert.equal(transition.transitionCommitted, true);
assert.equal(transitionHarness.campaignState.mission.v1.status, 'terminal');
assert.equal(transitionHarness.campaignState.storySettlement.episodes[0].status, 'sealed');
assert.equal(transitionHarness.campaignState.storySettlement.activeEpisode, null);
assert.equal(transitionHarness.campaignState.storySettlement.episodes[0].hardBoundary.code, 'mission-transition');
assert.equal(transitionHarness.campaignState.storySettlement.episodes[0].hardBoundary.source.kind, 'missionReducer');

function reportDefinitionFor(requirement) {
    const definition = structuredClone(transitionDefinition);
    definition.facts[0].initiallyTrue = true;
    definition.reportRoutes[0].deliveryRequirement = requirement;
    return definition;
}

function reportHarnessFor({ requirement = 'required', outputs = [] } = {}) {
    const definition = reportDefinitionFor(requirement);
    const state = campaignStateFor({ definition });
    state.mission.v1 = createMissionState({ definition, branchId: 'save.alpha' });
    return createHarness({
        definition,
        state,
        assets: runtimeAssetsFor([definition]),
        outputs,
    });
}

function reportPacketAndSnapshot(definition, { manifestMode = 'valid', pairNumber = 80, edited = false } = {}) {
    const state = createMissionState({ definition, branchId: 'save.alpha' });
    const packet = selectPendingDutyReport({
        definition,
        state,
        availableActors: [{ id: 'hadrik-bronn', capabilityRoles: ['engineering'] }],
    });
    const segment = createDutyReportVisibleSegment(packet);
    const authoredText = `Bronn opens the reviewed file. ${segment.canonicalText} He waits for your direction.`;
    const responseId = `directive-response.report.${pairNumber}`;
    const manifest = createDutyReportManifest({
        definition,
        packet,
        branchId: 'save.alpha',
        responseId,
        sourceTransactionId: `txn.report.${pairNumber}`,
        responseText: authoredText,
        segment,
    });
    const selectedText = edited ? `${authoredText} The displayed report was edited.` : authoredText;
    const snapshot = snapshotFor({
        definition,
        sourceRangeHash: `range.report.${pairNumber}`,
        pairNumber,
    });
    snapshot.source.previousAssistant.text = selectedText;
    const acceptedSourceTextHash = (edited ? 'e' : 'd').repeat(8);
    snapshot.source.previousAssistant.textHash = acceptedSourceTextHash;
    snapshot.source.previousAssistant.selectedVariant = {
        selectedSwipeId: '0',
        selectedSwipeIndex: 0,
        selectedTextHash: acceptedSourceTextHash,
        textHash: acceptedSourceTextHash,
        responseId,
        directiveOwned: true,
        dutyReportCustodyOwned: true,
        dutyReportManifest: manifestMode === 'none'
            ? null
            : (manifestMode === 'invalid' ? { ...manifest, policyId: 'policy.forged' } : manifest),
    };
    return { packet, segment, authoredText, responseId, manifest, snapshot };
}

const requiredReportHarness = reportHarnessFor({
    outputs: [interpretationOutput({ assistantAcceptance: 'accepted', claims: [] })],
});
const requiredReportSource = reportPacketAndSnapshot(
    requiredReportHarness.assets.missionDefinitions[0].definition,
);
const requiredReportSettlement = await requiredReportHarness.runtime.settleAcceptedPair({
    runtimeAssets: requiredReportHarness.assets,
    snapshot: requiredReportSource.snapshot,
});
assert.equal(requiredReportSettlement.ok, true, JSON.stringify(requiredReportSettlement));
assert.equal(requiredReportSettlement.status, 'settled');
assert.equal(
    requiredReportHarness.campaignState.mission.v1.knownFacts.includes('fact.hesperus-discrepancy-known'),
    true,
);
assert.equal(requiredReportSettlement.diagnostics.acceptedDutyReportCount, 1);
assert.equal(requiredReportSettlement.diagnostics.rejectedDutyReportReasonCode, null);
const reportEvidence = requiredReportHarness.campaignState.mission.v1.evidenceLog.find(
    (entry) => entry.delivery?.reportId === 'report.hesperus-discrepancy',
);
assert.deepEqual(reportEvidence.delivery, {
    kind: 'directive.dutyReportDelivery.v1',
    contractVersion: 1,
    reportId: 'report.hesperus-discrepancy',
    factId: 'fact.hesperus-discrepancy-known',
    reporterId: 'hadrik-bronn',
    policyId: 'policy.hesperus-discrepancy-disclosed',
    responseId: requiredReportSource.responseId,
    hostMessageId: 'message.assistant.80',
    selectedSwipeId: '0',
    visibleTextHash: 'd'.repeat(8),
    segmentTextHash: requiredReportSource.manifest.segmentTextHash,
    sourceTransactionId: 'txn.report.80',
});
assert.equal(validateMissionStateAuthority({
    definition: requiredReportHarness.assets.missionDefinitions[0].definition,
    state: requiredReportHarness.campaignState.mission.v1,
}).ok, true);
const restartedReportState = JSON.parse(JSON.stringify(requiredReportHarness.campaignState.mission.v1));
assert.deepEqual(restartedReportState.evidenceLog[0].delivery, reportEvidence.delivery);
assert.equal(validateMissionStateAuthority({
    definition: requiredReportHarness.assets.missionDefinitions[0].definition,
    state: restartedReportState,
}).ok, true);
const reportRevision = requiredReportHarness.campaignState.mission.v1.revision;
const replayedReport = await requiredReportHarness.runtime.settleAcceptedPair({
    runtimeAssets: requiredReportHarness.assets,
    snapshot: requiredReportSource.snapshot,
});
assert.equal(replayedReport.status, 'already-settled');
assert.equal(requiredReportHarness.campaignState.mission.v1.revision, reportRevision);
assert.equal(requiredReportHarness.campaignState.mission.v1.evidenceLog.length, 1);

for (const [label, assistantAcceptance, sourceOptions, expectedReason] of [
    ['rejected response', 'rejected', {}, 'assistant-not-accepted'],
    ['corrected response', 'corrected', {}, 'assistant-not-accepted'],
    ['ambiguous response', 'ambiguous', {}, 'assistant-not-accepted'],
    ['edited response', 'accepted', { edited: true }, 'manifest-response-mismatch'],
    ['invalid manifest', 'accepted', { manifestMode: 'invalid' }, 'manifest-invalid'],
    ['missing manifest', 'accepted', { manifestMode: 'none' }, 'required-manifest-missing'],
]) {
    const harness = reportHarnessFor({
        outputs: [interpretationOutput({
            assistantAcceptance,
            claims: [{
                candidateId: 'policy.hesperus-discrepancy-disclosed',
                sourceSlot: 'previousAssistant',
            }],
        })],
    });
    const source = reportPacketAndSnapshot(harness.assets.missionDefinitions[0].definition, {
        pairNumber: 90 + label.length,
        ...sourceOptions,
    });
    const result = await harness.runtime.settleAcceptedPair({
        runtimeAssets: harness.assets,
        snapshot: source.snapshot,
    });
    assert.equal(result.ok, true, label);
    assert.equal(harness.campaignState.mission.v1.knownFacts.length, 0, label);
    assert.equal(harness.campaignState.mission.v1.evidenceLog.length, 0, label);
    assert.equal(result.diagnostics.acceptedDutyReportCount, 0, label);
    assert.equal(result.diagnostics.rejectedDutyReportReasonCode, expectedReason, label);
}

const optionalProseHarness = reportHarnessFor({
    requirement: 'optional',
    outputs: [interpretationOutput({
        assistantAcceptance: 'accepted',
        claims: [{
            candidateId: 'policy.hesperus-discrepancy-disclosed',
            sourceSlot: 'previousAssistant',
        }],
    })],
});
const optionalProseSource = reportPacketAndSnapshot(
    optionalProseHarness.assets.missionDefinitions[0].definition,
    { manifestMode: 'none', pairNumber: 120 },
);
const optionalProse = await optionalProseHarness.runtime.settleAcceptedPair({
    runtimeAssets: optionalProseHarness.assets,
    snapshot: optionalProseSource.snapshot,
});
assert.equal(optionalProse.ok, true);
assert.equal(optionalProseHarness.campaignState.mission.v1.knownFacts.length, 1);
assert.equal(optionalProseHarness.campaignState.mission.v1.evidenceLog[0].delivery, undefined);
assert.equal(optionalProse.diagnostics.acceptedDutyReportCount, 0);

const optionalInvalidHarness = reportHarnessFor({
    requirement: 'optional',
    outputs: [interpretationOutput({
        assistantAcceptance: 'accepted',
        claims: [{
            candidateId: 'policy.hesperus-discrepancy-disclosed',
            sourceSlot: 'previousAssistant',
        }],
    })],
});
const optionalInvalidSource = reportPacketAndSnapshot(
    optionalInvalidHarness.assets.missionDefinitions[0].definition,
    { manifestMode: 'invalid', pairNumber: 121 },
);
const optionalInvalid = await optionalInvalidHarness.runtime.settleAcceptedPair({
    runtimeAssets: optionalInvalidHarness.assets,
    snapshot: optionalInvalidSource.snapshot,
});
assert.equal(optionalInvalid.ok, true);
assert.equal(optionalInvalidHarness.campaignState.mission.v1.knownFacts.length, 1);
assert.equal(optionalInvalidHarness.campaignState.mission.v1.evidenceLog[0].delivery, undefined);
assert.equal(optionalInvalid.diagnostics.acceptedDutyReportCount, 0);
assert.equal(optionalInvalid.diagnostics.rejectedDutyReportReasonCode, 'manifest-invalid');

console.log('V1 mission runtime tests passed.');
