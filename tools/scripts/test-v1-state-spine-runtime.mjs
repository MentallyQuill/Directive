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

const definition = JSON.parse(fs.readFileSync('tests/fixtures/mission/v1-hesperus-reference.fixture.json', 'utf8'));
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

console.log('V1 state spine runtime tests passed.');
