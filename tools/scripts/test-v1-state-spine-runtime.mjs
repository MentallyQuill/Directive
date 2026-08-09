import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
    createStateDeltaGateway,
    DIRECTIVE_MUTABLE_STATE_DOMAINS,
} from '../../src/runtime/state-delta-gateway.mjs';
import { createV1StateSpine } from '../../src/runtime/v1-state-spine.mjs';

assert.equal(DIRECTIVE_MUTABLE_STATE_DOMAINS.includes('storySettlement'), true);
const projectionSchema = JSON.parse(fs.readFileSync('schemas/campaign/campaign-state-projection.schema.json', 'utf8'));
assert.equal(Boolean(projectionSchema.$defs.initialState.properties.storySettlement), true);
assert.equal(Boolean(projectionSchema.$defs.initialState.properties.mission.properties.v1), true);
assert.equal(projectionSchema.$defs.initialState.required.includes('storySettlement'), false);

const definition = JSON.parse(fs.readFileSync('tests/fixtures/mission/v1/v1-hesperus-reference.fixture.json', 'utf8'));
let campaignState = {
    campaign: { id: 'campaign.ashes' },
    mission: { legacyStatus: 'unchanged', activePhaseId: 'phase.hesperus-legacy' },
    ship: { legacyCondition: 'unchanged' },
    relationships: { legacyRelationship: 'unchanged' },
    commandBearing: { current: 2 },
};
let persistCount = 0;
const gateway = createStateDeltaGateway({
    getState: () => campaignState,
    setState: (next) => { campaignState = next; },
    persist: async () => { persistCount += 1; },
    now: () => '2026-08-09T12:00:00.000Z',
});
const source = {
    contributionId: 'contribution.hesperus-rescue',
    messageId: 'message.assistant-rescue',
    branchId: 'save.alpha',
    accepted: true,
    selectedSwipeId: 'swipe.1',
    textHash: 'a'.repeat(64),
    role: 'assistant',
    acceptedAtRevision: 0,
};
const spine = createV1StateSpine({
    getState: () => campaignState,
    stateDeltaGateway: gateway,
    resolveSourceRef: (ref) => ref.messageId === source.messageId ? source : null,
    now: () => '2026-08-09T12:00:00.000Z',
});
const sourceContribution = {
    id: 'contribution.hesperus-rescue',
    messageId: source.messageId,
    swipeId: source.selectedSwipeId,
    role: source.role,
    textHash: source.textHash,
    acceptedAtRevision: source.acceptedAtRevision,
};
const proposal = {
    kind: 'directive.missionEvidenceProposal.v1',
    branchId: 'save.alpha',
    missionId: definition.id,
    baseRevision: 0,
    claims: [{
        claimId: 'claim.survivors-transferred',
        policyId: 'policy.hesperus-survivors-transferred',
        claimType: 'eventOccurred',
        targetId: 'event.hesperus-survivors-transferred',
        sourceRef: {
            messageId: source.messageId,
            swipeId: source.selectedSwipeId,
            textHash: source.textHash,
        },
    }],
};

const settled = await spine.settleAcceptedPair({
    definition,
    proposal,
    sourceContribution,
    gatewayBaseRevision: 0,
    scene: {
        episodeId: 'episode.hesperus-rescue',
        sceneId: 'scene.hesperus-rescue',
        boundaryReason: 'accepted-next-player-ingress',
        summary: 'The Hesperus survivors reached safety and the diversion concluded.',
        unresolvedConsequences: [],
    },
    legacyProjection: { status: 'active', activePhaseId: 'phase.hesperus-legacy' },
});
assert.equal(persistCount, 1);
assert.equal(gateway.revision(), 1);
assert.equal(settled.evidence.acceptedClaims.length, 1);
assert.equal(campaignState.storySettlement.episodes.length, 1);
assert.equal(campaignState.storySettlement.episodes[0].status, 'sealed');
assert.equal(campaignState.mission.v1.status, 'terminal');
assert.equal(campaignState.mission.v1.terminalDisposition, 'primarySuccess');
assert.equal(campaignState.mission.v1.shadowDiagnostics[0].code, 'legacy-v1-status-divergence');
assert.equal(campaignState.mission.legacyStatus, 'unchanged');
assert.deepEqual(campaignState.ship, { legacyCondition: 'unchanged' });
assert.deepEqual(campaignState.relationships, { legacyRelationship: 'unchanged' });
assert.deepEqual(campaignState.commandBearing, { current: 2 });

assert.throws(
    () => spine.reduceMissionProposal({
        definition: {
            ...definition,
            packageBinding: {
                ...definition.packageBinding,
                packageVersion: '0.4.0',
            },
        },
        proposal: { ...proposal, baseRevision: 1 },
        sourceContribution,
    }),
    (error) => error.code === 'DIRECTIVE_MISSION_DEFINITION_MIGRATION_REQUIRED',
);

await assert.rejects(
    () => spine.settleAcceptedPair({
        definition,
        proposal: { ...proposal, baseRevision: 1 },
        sourceContribution,
        gatewayBaseRevision: 0,
        scene: {
            episodeId: 'episode.stale',
            sceneId: 'scene.stale',
            boundaryReason: 'accepted-next-player-ingress',
            summary: 'This stale scene must not commit.',
        },
    }),
    (error) => error.code === 'DIRECTIVE_STATE_REVISION_CONFLICT',
);
assert.equal(persistCount, 1);

await assert.rejects(
    () => spine.settleAcceptedPair({
        definition,
        proposal: { ...proposal, baseRevision: 0 },
        sourceContribution,
        gatewayBaseRevision: 1,
        scene: {
            episodeId: 'episode.mission-stale',
            sceneId: 'scene.mission-stale',
            boundaryReason: 'accepted-next-player-ingress',
            summary: 'Mission-stale analysis must not settle.',
        },
    }),
    (error) => error.code === 'DIRECTIVE_MISSION_EVIDENCE_STALE',
);
assert.equal(persistCount, 1);
assert.equal(gateway.revision(), 1);

await spine.invalidateSources({
    definition,
    branchId: 'save.alpha',
    contributionIds: ['contribution.hesperus-rescue'],
    gatewayBaseRevision: 1,
    reason: 'selected-swipe-changed',
});
assert.equal(persistCount, 2);
assert.equal(gateway.revision(), 2);
assert.equal(campaignState.storySettlement.episodes[0].status, 'invalidated');
assert.equal(campaignState.mission.v1.status, 'active');
assert.equal(campaignState.mission.v1.transitionReceipt, null);
assert.equal(campaignState.mission.v1.shadowDiagnostics.some((entry) => entry.code === 'legacy-v1-status-divergence'), true);
assert.equal(campaignState.mission.v1.shadowDiagnostics.some((entry) => entry.code === 'source-invalidation-rebuild'), true);
assert.equal(campaignState.mission.legacyStatus, 'unchanged');

await spine.invalidateSources({
    definition,
    branchId: 'save.alpha',
    contributionIds: ['contribution.hesperus-rescue'],
    gatewayBaseRevision: 2,
    reason: 'selected-swipe-changed',
});
assert.equal(persistCount, 2);
assert.equal(gateway.revision(), 2);
await spine.invalidateSources({
    definition,
    branchId: 'save.alpha',
    contributionIds: ['contribution.unrelated'],
    gatewayBaseRevision: 2,
    reason: 'unrelated-source-event',
});
assert.equal(persistCount, 2);
assert.equal(gateway.revision(), 2);

const accumulationEvents = Array.from({ length: 6 }, (_, index) => ({
    id: `event.accumulation-${index + 1}`,
    playerVisibility: 'visible',
    playerText: { summary: `Milestone ${index + 1} settled.` },
}));
const accumulationDefinition = {
    kind: 'directive.missionDefinition.v1',
    schemaVersion: 1,
    id: 'mission.accumulation-reference',
    version: '1.0.0',
    packageBinding: {
        packageId: 'directive:campaign-package:accumulation-reference',
        packageVersion: '1.0.0',
        sourceId: 'accumulation-reference',
    },
    playerText: { title: 'Accumulation', summary: 'Accumulate a semantic scene.' },
    facts: [],
    evidencePolicies: accumulationEvents.map((event) => ({
        id: `policy.${event.id}`,
        claimType: 'eventOccurred',
        targetId: event.id,
        sourceRoles: ['assistant'],
        when: true,
    })),
    reportRoutes: [],
    events: accumulationEvents,
    outcomes: [],
    objectives: [],
    outcomeDimensions: [],
    clocks: [],
    closeWhen: false,
    terminalDispositions: [],
    transitions: [],
};
let accumulationState = {
    campaign: { id: 'campaign.accumulation' },
    mission: { legacyStatus: 'unchanged' },
};
let accumulationPersistCount = 0;
const accumulationSources = new Map();
const accumulationGateway = createStateDeltaGateway({
    getState: () => accumulationState,
    setState: (next) => { accumulationState = next; },
    persist: async () => { accumulationPersistCount += 1; },
    now: () => '2026-08-09T13:00:00.000Z',
});
const accumulationSpine = createV1StateSpine({
    getState: () => accumulationState,
    stateDeltaGateway: accumulationGateway,
    resolveSourceRef: (ref) => accumulationSources.get(ref.messageId) || null,
    now: () => '2026-08-09T13:00:00.000Z',
});

async function settleAccumulationEvent(number, { hardBoundary = null } = {}) {
    const sourceRecord = {
        contributionId: `contribution.accumulation-${number}`,
        messageId: `message.accumulation-${number}`,
        branchId: 'save.accumulation',
        accepted: true,
        selectedSwipeId: `swipe.${number}`,
        textHash: String(number).repeat(64),
        role: 'assistant',
        acceptedAtRevision: number - 1,
    };
    accumulationSources.set(sourceRecord.messageId, sourceRecord);
    const contribution = {
        id: sourceRecord.contributionId,
        messageId: sourceRecord.messageId,
        swipeId: sourceRecord.selectedSwipeId,
        role: sourceRecord.role,
        textHash: sourceRecord.textHash,
        acceptedAtRevision: sourceRecord.acceptedAtRevision,
    };
    const eventProposal = {
        kind: 'directive.missionEvidenceProposal.v1',
        branchId: 'save.accumulation',
        missionId: accumulationDefinition.id,
        baseRevision: number - 1,
        claims: [{
            claimId: `claim.accumulation-${number}`,
            policyId: `policy.event.accumulation-${number}`,
            claimType: 'eventOccurred',
            targetId: `event.accumulation-${number}`,
            sourceRef: {
                messageId: sourceRecord.messageId,
                swipeId: sourceRecord.selectedSwipeId,
                textHash: sourceRecord.textHash,
            },
        }],
    };
    const result = await accumulationSpine.settleAcceptedPair({
        definition: accumulationDefinition,
        proposal: eventProposal,
        sourceContributions: [contribution],
        gatewayBaseRevision: number - 1,
        scene: {
            episodeId: 'episode.accumulated-scene',
            sceneId: 'scene.accumulated-scene',
            boundaryReason: 'accepted-next-player-ingress',
            summary: `Untrusted caller summary ${number}`,
        },
        hardBoundary,
    });
    return { result, eventProposal, contribution };
}

const firstAccumulation = await settleAccumulationEvent(1);
assert.equal(accumulationPersistCount, 1);
assert.equal(accumulationState.storySettlement.episodes.length, 1);
assert.equal(accumulationState.storySettlement.episodes[0].status, 'open');

const insignificantDuringActive = await accumulationSpine.settleAcceptedPair({
    definition: accumulationDefinition,
    proposal: {
        kind: 'directive.missionEvidenceProposal.v1',
        branchId: 'save.accumulation',
        missionId: accumulationDefinition.id,
        baseRevision: 1,
        claims: [],
    },
    sourceContributions: [{
        id: 'contribution.accumulation-small-talk',
        messageId: 'message.accumulation-small-talk',
        swipeId: null,
        role: 'user',
        textHash: 'f'.repeat(64),
        acceptedAtRevision: 1,
    }],
    gatewayBaseRevision: 1,
    scene: { episodeId: 'episode.ignored', sceneId: 'scene.ignored' },
});
assert.equal(insignificantDuringActive.noChange, true);
assert.equal(accumulationPersistCount, 1);
assert.equal(accumulationState.storySettlement.receipts.length, 0);

for (let number = 2; number <= 5; number += 1) await settleAccumulationEvent(number);
assert.equal(accumulationPersistCount, 5);
assert.equal(accumulationState.storySettlement.episodes.length, 1);
assert.equal(accumulationState.storySettlement.episodes[0].status, 'open');
assert.equal(accumulationState.storySettlement.episodes[0].contributions.length, 5);
assert.equal(accumulationState.storySettlement.episodes[0].effects.length, 5);
assert.equal(JSON.stringify(accumulationState.storySettlement).includes('Untrusted caller summary'), false);

const sixthAccumulation = await settleAccumulationEvent(6, {
    hardBoundary: { reason: 'authored-scene-boundary' },
});
assert.equal(accumulationPersistCount, 6);
assert.equal(accumulationState.storySettlement.episodes.length, 1);
assert.equal(accumulationState.storySettlement.episodes[0].status, 'sealed');
assert.match(accumulationState.storySettlement.episodes[0].summary, /Milestone 1 settled/);
assert.match(accumulationState.storySettlement.episodes[0].summary, /Milestone 6 settled/);
assert.equal(accumulationState.storySettlement.episodes[0].summary.includes('Untrusted caller summary'), false);

const replayProposal = {
    ...sixthAccumulation.eventProposal,
    baseRevision: 6,
};
const replay = await accumulationSpine.settleAcceptedPair({
    definition: accumulationDefinition,
    proposal: replayProposal,
    sourceContributions: [sixthAccumulation.contribution],
    gatewayBaseRevision: 6,
    scene: { episodeId: 'episode.accumulated-scene', sceneId: 'scene.accumulated-scene' },
    hardBoundary: { reason: 'authored-scene-boundary' },
});
assert.equal(replay.noChange, true);
assert.equal(accumulationPersistCount, 6);

await accumulationSpine.invalidateSources({
    definition: accumulationDefinition,
    branchId: 'save.accumulation',
    contributionIds: ['contribution.accumulation-2'],
    gatewayBaseRevision: 6,
    reason: 'selected-swipe-changed',
});
assert.equal(accumulationPersistCount, 7);
assert.equal(accumulationState.storySettlement.episodes[0].status, 'invalidated');
assert.equal(accumulationState.mission.v1.events.includes('event.accumulation-2'), false);
assert.equal(accumulationState.mission.v1.events.includes('event.accumulation-1'), true);
assert.equal(accumulationState.mission.v1.events.includes('event.accumulation-6'), true);

let insignificantState = { campaign: { id: 'campaign.insignificant' }, mission: {} };
let insignificantPersistCount = 0;
const insignificantGateway = createStateDeltaGateway({
    getState: () => insignificantState,
    setState: (next) => { insignificantState = next; },
    persist: async () => { insignificantPersistCount += 1; },
});
const insignificantSpine = createV1StateSpine({
    getState: () => insignificantState,
    stateDeltaGateway: insignificantGateway,
    resolveSourceRef: () => null,
});
const insignificantProposal = {
    kind: 'directive.missionEvidenceProposal.v1',
    branchId: 'save.insignificant',
    missionId: accumulationDefinition.id,
    baseRevision: 0,
    claims: [],
};
await insignificantSpine.settleAcceptedPair({
    definition: accumulationDefinition,
    proposal: insignificantProposal,
    sourceContributions: [],
    gatewayBaseRevision: 0,
    scene: { episodeId: 'episode.small-talk', sceneId: 'scene.small-talk' },
});
assert.equal(insignificantPersistCount, 1);
assert.equal(insignificantState.storySettlement.episodes.length, 0);
assert.equal(insignificantState.storySettlement.receipts[0].disposition, 'insignificant');
const replayInsignificant = await insignificantSpine.settleAcceptedPair({
    definition: accumulationDefinition,
    proposal: insignificantProposal,
    sourceContributions: [],
    gatewayBaseRevision: 1,
    scene: { episodeId: 'episode.small-talk', sceneId: 'scene.small-talk' },
});
assert.equal(replayInsignificant.noChange, true);
assert.equal(insignificantPersistCount, 1);

console.log('V1 state spine runtime tests passed.');
