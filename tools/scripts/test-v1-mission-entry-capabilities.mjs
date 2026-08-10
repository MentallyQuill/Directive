import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
    indexMissionDefinition,
    validateMissionDefinition,
} from '../../src/mission/v1/mission-contracts.mjs';
import {
    deriveMissionEntryContext,
    MISSION_ENTRY_CONTEXT_KIND,
    validateMissionEntryContext,
} from '../../src/mission/v1/mission-entry-capabilities.mjs';
import {
    createInitialMissionJourney,
    createMissionRunArchive,
    createSuccessorMissionJourney,
    validateMissionJourney,
} from '../../src/mission/v1/mission-journey.mjs';
import { createMissionPlayerProjection } from '../../src/mission/v1/player-projection.mjs';
import { evaluateMissionPredicate, validateMissionPredicate } from '../../src/mission/v1/predicate-evaluator.mjs';
import { reduceMissionEvidence } from '../../src/mission/v1/mission-reducer.mjs';
import {
    createMissionState,
    missionStateContext,
    validateMissionState,
} from '../../src/mission/v1/mission-state.mjs';
import { validateMissionStateAuthority } from '../../src/mission/v1/mission-state-authority.mjs';

const sourceDefinition = JSON.parse(fs.readFileSync(
    'tests/fixtures/mission/v1/v1-hesperus-reference.fixture.json',
    'utf8',
));
sourceDefinition.transitions[0].target = {
    kind: 'mission',
    id: 'chapter-8-entry-test',
    playerSafeSetup: 'Proceed to the final operation.',
};

const targetDefinition = structuredClone(sourceDefinition);
targetDefinition.id = 'mission.chapter-8-entry-test';
targetDefinition.packageBinding.sourceId = 'chapter-8-entry-test';
targetDefinition.playerText = {
    title: 'Chapter 8 Entry Test',
    summary: 'Use only capabilities actually earned in prior missions.',
};
targetDefinition.entryCapabilities = [
    {
        id: 'capability.hesperus-rescue-practice',
        source: {
            definitionId: sourceDefinition.id,
            definitionVersion: sourceDefinition.version,
            requirements: [{
                dimensionId: 'dimension.lives-protected',
                in: ['full', 'full-with-cost'],
            }],
        },
        playerText: {
            label: 'Hesperus rescue practice',
            summary: 'The crew can apply methods proven during the Hesperus rescue.',
        },
    },
    {
        id: 'capability.hesperus-accountability-chain',
        source: {
            definitionId: sourceDefinition.id,
            definitionVersion: sourceDefinition.version,
            requirements: [{
                dimensionId: 'dimension.accountability',
                in: ['handed-off'],
            }],
        },
        playerText: {
            label: 'Hesperus accountability chain',
            summary: 'The crew can reuse the accountability handoff established at Hesperus.',
        },
    },
];

assert.equal(validateMissionDefinition(sourceDefinition).ok, true);
assert.equal(validateMissionDefinition(targetDefinition).ok, true);
assert.deepEqual(
    [...indexMissionDefinition(targetDefinition).entryCapabilities.keys()],
    targetDefinition.entryCapabilities.map((capability) => capability.id),
);

for (const [label, mutate, pattern] of [
    ['self import', (definition) => { definition.entryCapabilities[0].source.definitionId = definition.id; }, /self/i],
    ['duplicate requirements', (definition) => {
        definition.entryCapabilities[0].source.requirements.push(
            structuredClone(definition.entryCapabilities[0].source.requirements[0]),
        );
    }, /duplicate|dimensionId/i],
    ['empty accepted values', (definition) => { definition.entryCapabilities[0].source.requirements[0].in = []; }, /at least one|non-empty/i],
    ['missing player label', (definition) => { definition.entryCapabilities[0].playerText.label = ''; }, /playerText/i],
]) {
    const candidate = structuredClone(targetDefinition);
    mutate(candidate);
    const result = validateMissionDefinition(candidate);
    assert.equal(result.ok, false, label);
    assert.match(result.errors.join('\n'), pattern, label);
}

const branchId = 'save.entry-capabilities';
const sourceState = createMissionState({ definition: sourceDefinition, branchId });
assert.equal(Object.hasOwn(sourceState, 'entryContext'), false, 'legacy-compatible definitions gain no state field');
const terminalSource = reduceMissionEvidence({
    definition: sourceDefinition,
    state: sourceState,
    acceptedClaims: [{
        claimId: 'claim.entry.survivors-transferred',
        policyId: 'policy.hesperus-survivors-transferred',
        claimType: 'eventOccurred',
        targetId: 'event.hesperus-survivors-transferred',
        evidenceKey: 'evidence.entry.survivors-transferred',
    }],
    sourceContribution: {
        id: 'contribution.entry.source',
        messageId: 'message.entry.source',
        swipeId: '0',
        role: 'assistant',
        textHash: '1234abcd',
        acceptedAtRevision: 1,
    },
}).state;
assert.equal(terminalSource.status, 'terminal');
assert.equal(terminalSource.outcomeDimensions['dimension.lives-protected'], 'full');
assert.equal(Object.hasOwn(terminalSource.outcomeDimensions, 'dimension.accountability'), false);

const initialJourney = createInitialMissionJourney({ branchId, definition: sourceDefinition });
const sourceArchive = createMissionRunArchive({
    runId: initialJourney.journey.activeRunId,
    state: terminalSource,
    definition: sourceDefinition,
    archivedAtJourneyRevision: 1,
});
const derived = deriveMissionEntryContext({
    targetDefinition,
    history: [sourceArchive],
});
assert.deepEqual(derived, {
    kind: MISSION_ENTRY_CONTEXT_KIND,
    capabilities: [{
        id: 'capability.hesperus-rescue-practice',
        sourceRunId: sourceArchive.runId,
        sourceDefinitionId: sourceDefinition.id,
        sourceDefinitionVersion: sourceDefinition.version,
        dimensions: [{ id: 'dimension.lives-protected', value: 'full' }],
    }],
});
assert.deepEqual(validateMissionEntryContext({
    definition: targetDefinition,
    entryContext: derived,
    history: [sourceArchive],
}), { ok: true, errors: [] });

const standaloneTarget = createMissionState({ definition: targetDefinition, branchId });
assert.deepEqual(standaloneTarget.entryContext, {
    kind: MISSION_ENTRY_CONTEXT_KIND,
    capabilities: [],
});
assert.equal(validateMissionState({ definition: targetDefinition, state: standaloneTarget }).ok, true);
assert.equal(evaluateMissionPredicate(
    { capabilityAvailable: 'capability.hesperus-rescue-practice' },
    missionStateContext(targetDefinition, standaloneTarget),
).value, false);

const successor = createSuccessorMissionJourney({
    journey: initialJourney.journey,
    history: initialJourney.history,
    sourceState: terminalSource,
    sourceDefinition,
    targetDefinition,
});
assert.deepEqual(successor.currentState.entryContext, derived);
assert.equal(validateMissionStateAuthority({
    definition: targetDefinition,
    state: successor.currentState,
}).ok, true, 'authority replay retains immutable mission-entry context');

const predicate = { capabilityAvailable: 'capability.hesperus-rescue-practice' };
assert.equal(validateMissionPredicate(predicate, indexMissionDefinition(targetDefinition)).ok, true);
assert.equal(evaluateMissionPredicate(
    predicate,
    missionStateContext(targetDefinition, successor.currentState),
).value, true);
assert.equal(evaluateMissionPredicate(
    { capabilityAvailable: 'capability.hesperus-accountability-chain' },
    missionStateContext(targetDefinition, successor.currentState),
).value, false);
assert.match(
    validateMissionPredicate(
        { capabilityAvailable: 'capability.unwritten' },
        indexMissionDefinition(targetDefinition),
    ).errors.join('\n'),
    /unknown capability/i,
);

const projection = createMissionPlayerProjection({
    definition: targetDefinition,
    state: successor.currentState,
});
assert.deepEqual(projection.capabilities, [{
    id: 'capability.hesperus-rescue-practice',
    label: 'Hesperus rescue practice',
    summary: 'The crew can apply methods proven during the Hesperus rescue.',
}]);
assert.equal(JSON.stringify(projection).includes(sourceArchive.runId), false, 'player projection hides authority metadata');
assert.equal(JSON.stringify(projection).includes('dimension.lives-protected'), false);

const campaignState = {
    activeCampaignPackage: {
        packageId: sourceDefinition.packageBinding.packageId,
        packageVersion: sourceDefinition.packageBinding.packageVersion,
    },
    campaignChatBinding: { saveId: branchId, chatId: 'chat.entry-capabilities' },
    mission: {
        activeMissionId: targetDefinition.packageBinding.sourceId,
        v1: structuredClone(successor.currentState),
        v1Journey: structuredClone(successor.journey),
        v1History: structuredClone(successor.history),
    },
};
assert.deepEqual(validateMissionJourney({
    campaignState,
    definitions: [sourceDefinition, targetDefinition],
}), { ok: true, errors: [] });

for (const [label, mutate] of [
    ['missing context', (state) => { delete state.mission.v1.entryContext; }],
    ['forged capability', (state) => { state.mission.v1.entryContext.capabilities[0].id = 'capability.hesperus-accountability-chain'; }],
    ['forged source run', (state) => { state.mission.v1.entryContext.capabilities[0].sourceRunId = 'mission-run.forged'; }],
    ['forged source dimension', (state) => { state.mission.v1.entryContext.capabilities[0].dimensions[0].value = 'full-with-cost'; }],
    ['mutated history', (state) => { state.mission.v1History[0].state.outcomeDimensions['dimension.lives-protected'] = 'full-with-cost'; }],
]) {
    const candidate = structuredClone(campaignState);
    mutate(candidate);
    const result = validateMissionJourney({
        campaignState: candidate,
        definitions: [sourceDefinition, targetDefinition],
    });
    assert.equal(result.ok, false, label);
    assert.match(result.errors.join('\n'), /entry|capabilit|authority|history/i, label);
}

const missingContext = structuredClone(successor.currentState);
delete missingContext.entryContext;
assert.equal(validateMissionState({ definition: targetDefinition, state: missingContext }).ok, false);
assert.equal(validateMissionState({ definition: sourceDefinition, state: terminalSource }).ok, true);

console.log('V1 mission-entry capability tests passed.');
