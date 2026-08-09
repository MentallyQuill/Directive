import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
    createInitialMissionJourney,
    createMissionRunArchive,
    createSuccessorMissionJourney,
    initialMissionRunId,
    resolveMissionTransitionTarget,
    successorMissionRunId,
    validateMissionJourney,
} from '../../src/mission/v1/mission-journey.mjs';
import { reduceMissionEvidence } from '../../src/mission/v1/mission-reducer.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';

const sourceDefinition = JSON.parse(fs.readFileSync(
    'tests/fixtures/mission/v1/v1-hesperus-reference.fixture.json',
    'utf8',
));
sourceDefinition.transitions[0].target = {
    kind: 'mission',
    id: 'command-review',
    playerSafeSetup: 'Return to the command review.',
};
const targetDefinition = structuredClone(sourceDefinition);
targetDefinition.id = 'mission.command-review';
targetDefinition.packageBinding.sourceId = 'command-review';
targetDefinition.playerText = {
    title: 'Command Review',
    summary: 'Review the completed response and continue the handover.',
};

function transitionPacket(next) {
    return { next };
}

const resolvedTarget = resolveMissionTransitionTarget({
    sourceDefinition,
    transitionPacket: transitionPacket({ kind: 'mission', id: targetDefinition.packageBinding.sourceId }),
    definitions: [sourceDefinition, targetDefinition],
});
assert.equal(resolvedTarget.ok, true);
assert.equal(resolvedTarget.status, 'ready');
assert.deepEqual(resolvedTarget.targetDefinition, targetDefinition);
assert.notEqual(resolvedTarget.targetDefinition, targetDefinition, 'resolver does not leak mutable definition authority');

for (const [label, packet, definitions, reasonCode] of [
    ['missing packet', null, [sourceDefinition, targetDefinition], 'transition-packet-missing'],
    ['phase target', transitionPacket({ kind: 'phase', id: 'phase.command-review' }), [sourceDefinition], 'phase-target-contract-unavailable'],
    ['unsupported target', transitionPacket({ kind: 'chapter', id: 'chapter.command-review' }), [sourceDefinition], 'transition-target-kind-unsupported'],
    ['missing target', transitionPacket({ kind: 'mission', id: 'mission.missing' }), [sourceDefinition], 'transition-target-definition-unavailable'],
    ['self target', transitionPacket({ kind: 'mission', id: sourceDefinition.id }), [sourceDefinition], 'transition-target-self-reference'],
]) {
    const result = resolveMissionTransitionTarget({ sourceDefinition, transitionPacket: packet, definitions });
    assert.equal(result.ok, false, label);
    assert.equal(result.targetDefinition, null, label);
    assert.equal(result.reasonCode, reasonCode, label);
}

const ambiguousTargetDefinition = structuredClone(targetDefinition);
ambiguousTargetDefinition.id = targetDefinition.packageBinding.sourceId;
assert.equal(resolveMissionTransitionTarget({
    sourceDefinition,
    transitionPacket: transitionPacket({ kind: 'mission', id: targetDefinition.packageBinding.sourceId }),
    definitions: [targetDefinition, ambiguousTargetDefinition],
}).reasonCode, 'transition-target-definition-ambiguous');

const foreignTargetDefinition = structuredClone(targetDefinition);
foreignTargetDefinition.packageBinding.packageId = 'campaign.other';
assert.equal(resolveMissionTransitionTarget({
    sourceDefinition,
    transitionPacket: transitionPacket({ kind: 'mission', id: foreignTargetDefinition.id }),
    definitions: [foreignTargetDefinition],
}).reasonCode, 'transition-target-package-mismatch');

const branchId = 'save.journey';
const sourceState = createMissionState({ definition: sourceDefinition, branchId });
const terminalSource = reduceMissionEvidence({
    definition: sourceDefinition,
    state: sourceState,
    acceptedClaims: [{
        claimId: 'claim.journey.survivors-transferred',
        policyId: 'policy.hesperus-survivors-transferred',
        claimType: 'eventOccurred',
        targetId: 'event.hesperus-survivors-transferred',
        evidenceKey: 'evidence.journey.survivors-transferred',
    }],
    sourceContribution: {
        id: 'contribution.journey.source',
        messageId: 'message.journey.source',
        swipeId: '0',
        role: 'assistant',
        textHash: 'a1b2c3d4',
        acceptedAtRevision: 1,
    },
}).state;
assert.equal(terminalSource.status, 'terminal');

const initial = createInitialMissionJourney({ branchId, definition: sourceDefinition });
assert.deepEqual(initial, {
    journey: {
        kind: 'directive.missionJourney.v1',
        contractVersion: 1,
        branchId,
        revision: 0,
        activeRunId: initialMissionRunId({ branchId, definition: sourceDefinition }),
    },
    history: [],
});
assert.equal(initial.journey.activeRunId.startsWith('mission-run.'), true);
assert.deepEqual(
    createInitialMissionJourney({ branchId, definition: sourceDefinition }),
    initial,
    'initial run identity is deterministic',
);

const archived = createMissionRunArchive({
    runId: initial.journey.activeRunId,
    state: terminalSource,
    definition: sourceDefinition,
    archivedAtJourneyRevision: 1,
});
const expectedTargetRunId = successorMissionRunId({
    branchId,
    sourceRunId: initial.journey.activeRunId,
    transitionId: terminalSource.transitionReceipt.transitionId,
    sourceMissionRevision: terminalSource.revision,
    targetDefinition,
});
const successor = createSuccessorMissionJourney({
    journey: initial.journey,
    history: initial.history,
    sourceState: terminalSource,
    sourceDefinition,
    targetDefinition,
});
assert.deepEqual(successor.history, [archived]);
assert.equal(successor.journey.revision, 1);
assert.equal(successor.journey.activeRunId, expectedTargetRunId);
assert.equal(successor.currentState.definitionId, targetDefinition.id);
assert.equal(successor.currentState.status, 'active');
assert.equal(successor.currentState.revision, 0);

function campaignStateFor({
    journey = successor.journey,
    history = successor.history,
    currentState = successor.currentState,
    activeMissionId = targetDefinition.packageBinding.sourceId,
} = {}) {
    return {
        activeCampaignPackage: {
            packageId: sourceDefinition.packageBinding.packageId,
            packageVersion: sourceDefinition.packageBinding.packageVersion,
        },
        campaignChatBinding: { saveId: branchId, chatId: 'chat.journey' },
        mission: {
            activeMissionId,
            v1: structuredClone(currentState),
            v1Journey: structuredClone(journey),
            v1History: structuredClone(history),
        },
    };
}

const validCampaign = campaignStateFor();
assert.deepEqual(validateMissionJourney({
    campaignState: validCampaign,
    definitions: [sourceDefinition, targetDefinition],
}), { ok: true, errors: [] });
assert.deepEqual(
    validateMissionJourney({
        campaignState: JSON.parse(JSON.stringify(validCampaign)),
        definitions: [sourceDefinition, targetDefinition],
    }),
    { ok: true, errors: [] },
    'journey survives JSON restart',
);

for (const [label, mutate, pattern] of [
    ['wrong branch', (state) => { state.mission.v1Journey.branchId = 'save.other'; }, /branch/i],
    ['wrong package', (state) => { state.mission.v1History[0].packageBinding.packageVersion = '9.9.9'; }, /package/i],
    ['duplicate run', (state) => { state.mission.v1Journey.activeRunId = state.mission.v1History[0].runId; }, /run/i],
    ['duplicate definition', (state) => { state.mission.v1.definitionId = sourceDefinition.id; }, /definition/i],
    ['nonterminal archive', (state) => { state.mission.v1History[0].state.status = 'active'; }, /terminal|authority/i],
    ['active pointer mismatch', (state) => { state.mission.v1Journey.activeRunId = 'mission-run.forged'; }, /activeRunId|run/i],
    ['active mission mismatch', (state) => { state.mission.activeMissionId = 'wrong-mission'; }, /activeMissionId/i],
    ['broken lineage', (state) => { state.mission.v1History[0].state.transitionReceipt.target.id = 'wrong-target'; }, /lineage|authority/i],
    ['unknown journey field', (state) => { state.mission.v1Journey.rawTranscript = 'SECRET'; }, /unknown field/i],
    ['unknown archive field', (state) => { state.mission.v1History[0].providerRationale = 'SECRET'; }, /unknown field/i],
]) {
    const candidate = structuredClone(validCampaign);
    mutate(candidate);
    const result = validateMissionJourney({
        campaignState: candidate,
        definitions: [sourceDefinition, targetDefinition],
    });
    assert.equal(result.ok, false, label);
    assert.match(result.errors.join('\n'), pattern, label);
    assert.equal(JSON.stringify(result).includes('SECRET'), false, `${label}: validation errors are sanitized`);
}

const missingReceipt = structuredClone(validCampaign);
missingReceipt.mission.v1History[0].state.transitionReceipt = null;
assert.doesNotThrow(() => validateMissionJourney({
    campaignState: missingReceipt,
    definitions: [sourceDefinition, targetDefinition],
}));
assert.equal(validateMissionJourney({
    campaignState: missingReceipt,
    definitions: [sourceDefinition, targetDefinition],
}).ok, false);

assert.throws(() => createSuccessorMissionJourney({
    journey: initial.journey,
    history: initial.history,
    sourceState,
    sourceDefinition,
    targetDefinition,
}), /terminal/i);
assert.throws(() => createSuccessorMissionJourney({
    journey: initial.journey,
    history: initial.history,
    sourceState: terminalSource,
    sourceDefinition,
    targetDefinition: sourceDefinition,
}), /self|duplicate/i);
assert.throws(() => createSuccessorMissionJourney({
    journey: successor.journey,
    history: successor.history,
    sourceState: terminalSource,
    sourceDefinition,
    targetDefinition,
}), /history|current|revision|duplicate/i);

console.log('V1 mission journey contract tests passed.');
