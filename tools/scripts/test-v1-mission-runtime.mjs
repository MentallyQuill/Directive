import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import {
    createV1MissionRuntime,
    resolveActiveV1MissionDefinition,
} from '../../src/runtime/v1-mission-runtime.mjs';
import { createEpisodeHardBoundary } from '../../src/story/episode-boundary.mjs';

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
} = {}) {
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
                hostMessageId: 'message.assistant.10',
                role: 'assistant',
                text: 'Captain Whitaker completes the command handover and places the watch in your hands.',
                textHash: 'a'.repeat(64),
                sourceIntegrity: assistantIntegrity,
                selectedVariant: {
                    selectedSwipeId: 'swipe.2',
                    selectedSwipeIndex: 2,
                    textHash: 'a'.repeat(64),
                },
            },
            currentPlayer: {
                hostMessageId: 'message.player.11',
                role: 'user',
                text: 'I accept the watch and proceed.',
                textHash: 'b'.repeat(64),
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
assert.equal(settlementHarness.campaignState.storySettlement.episodes[0].contributions[0].swipeId, 'swipe.2');
assert.equal(settlementHarness.campaignState.storySettlement.episodes[0].contributions[0].role, 'assistant');
assert.deepEqual(settlementHarness.campaignState.mission.openAssignments, legacyBefore.mission.openAssignments);
for (const root of ['ship', 'relationships', 'threadLedger', 'quests', 'commandLog', 'commandBearing']) {
    assert.deepEqual(settlementHarness.campaignState[root], legacyBefore[root], `${root} remains legacy-authoritative in shadow mode`);
}
assert.equal(JSON.stringify(settlementHarness.campaignState).includes('Captain Whitaker completes'), false, 'raw prose is not retained');

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

console.log('V1 mission runtime tests passed.');
