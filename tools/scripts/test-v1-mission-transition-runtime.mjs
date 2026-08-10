import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
    createInitialMissionJourney,
    validateMissionJourney,
} from '../../src/mission/v1/mission-journey.mjs';
import { reduceMissionEvidence } from '../../src/mission/v1/mission-reducer.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
import { validateMissionStateAuthority } from '../../src/mission/v1/mission-state-authority.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { createV1MissionRuntime } from '../../src/runtime/v1-mission-runtime.mjs';
import { createAshesInitialState, loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

const fixture = JSON.parse(fs.readFileSync(
    'tests/fixtures/mission/v1/v1-hesperus-reference.fixture.json',
    'utf8',
));
const sourceDefinition = structuredClone(fixture);
sourceDefinition.id = 'mission.pending-source';
sourceDefinition.packageBinding.sourceId = 'pending-source';
sourceDefinition.transitions[0].target = {
    kind: 'mission',
    id: 'pending-target',
    playerSafeSetup: 'Proceed to the next authored mission.',
};
const targetDefinition = structuredClone(fixture);
targetDefinition.id = 'mission.pending-target';
targetDefinition.packageBinding.sourceId = 'pending-target';
targetDefinition.playerText = {
    title: 'Pending Target',
    summary: 'Continue from the committed source outcome.',
};
const branchId = 'save.pending-transition';

function terminalState(definition = sourceDefinition) {
    return reduceMissionEvidence({
        definition,
        state: createMissionState({ definition, branchId }),
        acceptedClaims: [{
            claimId: 'claim.pending.survivors-transferred',
            policyId: 'policy.hesperus-survivors-transferred',
            claimType: 'eventOccurred',
            targetId: 'event.hesperus-survivors-transferred',
            evidenceKey: 'evidence.pending.survivors-transferred',
        }],
        sourceContribution: {
            id: 'contribution.pending.source',
            messageId: 'message.pending.source',
            swipeId: '0',
            role: 'assistant',
            textHash: 'abcdef12',
            acceptedAtRevision: 1,
        },
    }).state;
}

function stateFor({ definition = sourceDefinition, missionState = terminalState(definition) } = {}) {
    const journey = createInitialMissionJourney({ branchId, definition });
    const state = createAshesInitialState({
        campaignId: 'campaign.ashes',
        saveId: branchId,
        chatId: 'chat.pending-transition',
    });
    state.mission = {
            activeMissionId: definition.packageBinding.sourceId,
            v1: structuredClone(missionState),
            v1Journey: journey.journey,
            v1History: journey.history,
        };
    return state;
}

function assetsFor(definitions, packageVersion = sourceDefinition.packageBinding.packageVersion) {
    const ashesAssets = loadAshesRuntimeAssets();
    return {
        packageData: packageVersion === sourceDefinition.packageBinding.packageVersion
            ? ashesAssets.packageData
            : { ...ashesAssets.packageData, manifest: { ...ashesAssets.packageData.manifest, version: packageVersion } },
        crewDataset: ashesAssets.crewDataset,
        shipDataset: ashesAssets.shipDataset,
        missionDefinitions: definitions.map((definition) => ({
            path: `${definition.id}.json`,
            definition,
        })),
    };
}

function createHarness({
    initialState = stateFor(),
    persist = async () => {},
    beforeApply = null,
} = {}) {
    let campaignState = structuredClone(initialState);
    let persistCount = 0;
    let generationCount = 0;
    const baseGateway = createStateDeltaGateway({
        getState: () => campaignState,
        setState: (next) => { campaignState = next; },
        persist: async (...args) => {
            persistCount += 1;
            await persist(...args, {
                getState: () => campaignState,
                setState: (next) => { campaignState = next; },
            });
        },
        now: () => '2026-08-09T18:00:00.000Z',
    });
    const gateway = beforeApply
        ? {
            ...baseGateway,
            applyProposal: async (proposal) => {
                await beforeApply({ baseGateway, proposal });
                return baseGateway.applyProposal(proposal);
            },
        }
        : baseGateway;
    const runtime = createV1MissionRuntime({
        getState: () => campaignState,
        stateDeltaGateway: gateway,
        generationRouter: {
            generate: async () => {
                generationCount += 1;
                throw new Error('TRANSITION_RECOVERY_MUST_NOT_CALL_PROVIDER');
            },
        },
        now: () => '2026-08-09T18:00:00.000Z',
    });
    return {
        runtime,
        gateway,
        get campaignState() { return campaignState; },
        get persistCount() { return persistCount; },
        get generationCount() { return generationCount; },
    };
}

const sourceOnlyAssets = assetsFor([sourceDefinition]);
const completeAssets = assetsFor([sourceDefinition, targetDefinition]);
const inspectionHarness = createHarness();
const beforeInspection = structuredClone(inspectionHarness.campaignState);
const missing = inspectionHarness.runtime.inspectPendingTransition({ runtimeAssets: sourceOnlyAssets });
assert.equal(missing.ok, true);
assert.equal(missing.attempted, false);
assert.equal(missing.status, 'pending');
assert.equal(missing.reasonCode, 'transition-target-definition-unavailable');
assert.equal(missing.activatable, false);
assert.deepEqual(inspectionHarness.campaignState, beforeInspection, 'inspection is pure');
assert.equal(inspectionHarness.persistCount, 0);
assert.equal(inspectionHarness.generationCount, 0);
const unavailableActivation = await inspectionHarness.runtime.activatePendingTransition({
    runtimeAssets: sourceOnlyAssets,
});
assert.equal(unavailableActivation.ok, false);
assert.equal(unavailableActivation.attempted, false);
assert.equal(unavailableActivation.status, 'pending');
assert.equal(unavailableActivation.reasonCode, 'transition-target-definition-unavailable');
assert.equal(inspectionHarness.persistCount, 0);

const ready = inspectionHarness.runtime.inspectPendingTransition({ runtimeAssets: completeAssets });
assert.equal(ready.ok, true);
assert.equal(ready.status, 'ready');
assert.equal(ready.reasonCode, null);
assert.equal(ready.activatable, true);
assert.equal(ready.sourceDefinitionId, sourceDefinition.id);
assert.equal(ready.targetDefinitionId, targetDefinition.id);
assert.equal(JSON.stringify(ready).includes('mustNotReveal'), false);
assert.equal(JSON.stringify(ready).includes('committedEffects'), false);

const activeHarness = createHarness({
    initialState: stateFor({ missionState: createMissionState({ definition: sourceDefinition, branchId }) }),
});
const activeInspection = activeHarness.runtime.inspectPendingTransition({ runtimeAssets: completeAssets });
assert.equal(activeInspection.ok, true);
assert.equal(activeInspection.status, 'none');
assert.equal(activeInspection.reasonCode, 'mission-not-terminal');

const missingReceiptState = stateFor();
missingReceiptState.mission.v1.transitionReceipt = null;
const missingReceipt = createHarness({ initialState: missingReceiptState }).runtime.inspectPendingTransition({
    runtimeAssets: completeAssets,
});
assert.equal(missingReceipt.ok, false);
assert.equal(missingReceipt.status, 'invalid');
assert.equal(missingReceipt.reasonCode, 'transition-receipt-missing');

const phaseDefinition = structuredClone(sourceDefinition);
phaseDefinition.id = 'mission.phase-source';
phaseDefinition.packageBinding.sourceId = 'phase-source';
phaseDefinition.transitions[0].target = {
    kind: 'phase',
    id: 'phase.command-review',
    playerSafeSetup: 'Return to command review.',
};
const phaseInspection = createHarness({
    initialState: stateFor({ definition: phaseDefinition, missionState: terminalState(phaseDefinition) }),
}).runtime.inspectPendingTransition({ runtimeAssets: assetsFor([phaseDefinition]) });
assert.equal(phaseInspection.ok, true);
assert.equal(phaseInspection.status, 'pending');
assert.equal(phaseInspection.reasonCode, 'phase-target-contract-unavailable');

const selfDefinition = structuredClone(sourceDefinition);
selfDefinition.id = 'mission.self-source';
selfDefinition.packageBinding.sourceId = 'self-source';
selfDefinition.transitions[0].target = {
    kind: 'mission',
    id: selfDefinition.id,
    playerSafeSetup: 'This invalid mission attempts to target itself.',
};
const selfInspection = createHarness({
    initialState: stateFor({ definition: selfDefinition, missionState: terminalState(selfDefinition) }),
}).runtime.inspectPendingTransition({ runtimeAssets: assetsFor([selfDefinition]) });
assert.equal(selfInspection.ok, true);
assert.equal(selfInspection.status, 'pending');
assert.equal(selfInspection.reasonCode, 'transition-target-self-reference');

const invalidJourneyState = stateFor();
invalidJourneyState.mission.v1Journey.activeRunId = 'mission-run.forged';
const invalidJourney = createHarness({ initialState: invalidJourneyState }).runtime.inspectPendingTransition({
    runtimeAssets: completeAssets,
});
assert.equal(invalidJourney.ok, false);
assert.equal(invalidJourney.status, 'invalid');
assert.equal(invalidJourney.reasonCode, 'mission-journey-invalid');
assert.equal(invalidJourney.diagnostics.errorCount > 0, true);

const activationHarness = createHarness();
const beforeActivation = structuredClone(activationHarness.campaignState);
const activated = await activationHarness.runtime.activatePendingTransition({ runtimeAssets: completeAssets });
assert.equal(activated.ok, true, JSON.stringify(activated));
assert.equal(activated.attempted, true);
assert.equal(activated.status, 'activated');
assert.equal(activated.reasonCode, null);
assert.equal(activated.noChange, false);
assert.deepEqual(activated.committedRoots, ['mission']);
assert.equal(activationHarness.persistCount, 1);
assert.equal(activationHarness.generationCount, 0);
assert.equal(activationHarness.campaignState.mission.v1.definitionId, targetDefinition.id);
assert.equal(activationHarness.campaignState.mission.v1.status, 'active');
assert.equal(activationHarness.campaignState.mission.v1History.length, 1);
assert.equal(activationHarness.campaignState.mission.v1History[0].definitionId, sourceDefinition.id);
assert.equal(activationHarness.campaignState.mission.v1Journey.revision, 1);
const activatedAuthority = validateMissionStateAuthority({
    definition: targetDefinition,
    state: activationHarness.campaignState.mission.v1,
});
assert.deepEqual(activatedAuthority, { ok: true, errors: [] }, JSON.stringify(activatedAuthority));
assert.deepEqual(validateMissionJourney({
    campaignState: activationHarness.campaignState,
    definitions: [sourceDefinition, targetDefinition],
}), { ok: true, errors: [] });
for (const root of ['storySettlement', 'ship', 'commandBearing']) {
    assert.deepEqual(activationHarness.campaignState[root], beforeActivation[root], `${root} is unchanged by recovery activation`);
}

const repeated = await activationHarness.runtime.activatePendingTransition({ runtimeAssets: completeAssets });
assert.equal(repeated.ok, true);
assert.equal(repeated.attempted, false);
assert.equal(repeated.status, 'no-pending-transition');
assert.equal(repeated.reasonCode, 'mission-not-terminal');
assert.equal(repeated.noChange, true);
assert.equal(activationHarness.persistCount, 1);
assert.equal(activationHarness.campaignState.mission.v1History.length, 1);

const restartedState = JSON.parse(JSON.stringify(activationHarness.campaignState));
const restartInspection = createHarness({ initialState: restartedState }).runtime.inspectPendingTransition({
    runtimeAssets: completeAssets,
});
assert.equal(restartInspection.status, 'none');
assert.equal(restartInspection.reasonCode, 'mission-not-terminal');

const driftInspection = createHarness().runtime.inspectPendingTransition({
    runtimeAssets: assetsFor([sourceDefinition, targetDefinition], '99.0.0'),
});
assert.equal(driftInspection.ok, false);
assert.equal(driftInspection.reasonCode, 'package-version-mismatch');

const rollbackState = stateFor();
const rollbackHarness = createHarness({
    initialState: rollbackState,
    persist: async () => { throw new Error('SECRET_PERSISTENCE_FAILURE'); },
});
const rollbackFailure = await rollbackHarness.runtime.activatePendingTransition({ runtimeAssets: completeAssets });
assert.equal(rollbackFailure.ok, false);
assert.equal(rollbackFailure.reasonCode, 'persistence-failed');
assert.equal(rollbackFailure.noChange, true);
assert.deepEqual(rollbackHarness.campaignState, rollbackState, 'ordinary persistence failure restores previous state');
assert.equal(JSON.stringify(rollbackFailure).includes('SECRET_PERSISTENCE_FAILURE'), false);

let conflictInjected = false;
const conflictHarness = createHarness({
    beforeApply: async ({ baseGateway }) => {
        if (conflictInjected) return;
        conflictInjected = true;
        await baseGateway.applyProposal({
            patch: { campaign: { externalRevisionMarker: true } },
            domains: ['campaign'],
            baseRevision: baseGateway.revision(),
            source: 'test.concurrent-state',
            reason: 'Simulate a concurrent state mutation.',
        });
    },
});
const conflicted = await conflictHarness.runtime.activatePendingTransition({ runtimeAssets: completeAssets });
assert.equal(conflicted.ok, false);
assert.equal(conflicted.reasonCode, 'state-revision-conflict');
assert.equal(conflictHarness.campaignState.mission.v1.definitionId, sourceDefinition.id);
assert.equal(conflictHarness.campaignState.campaign.externalRevisionMarker, true);

const rollbackConflictHarness = createHarness({
    persist: async (_state, _proposal, controls) => {
        controls.setState({ ...controls.getState(), externalConcurrentChange: { preserved: true } });
        throw new Error('SECRET_ROLLBACK_CONFLICT');
    },
});
const rollbackConflict = await rollbackConflictHarness.runtime.activatePendingTransition({ runtimeAssets: completeAssets });
assert.equal(rollbackConflict.ok, false);
assert.equal(rollbackConflict.status, 'indeterminate');
assert.equal(rollbackConflict.reasonCode, 'persistence-rollback-conflict');
assert.equal(rollbackConflict.requiresOperatorReview, true);
assert.equal(rollbackConflict.retrySafe, false);
assert.equal(JSON.stringify(rollbackConflict).includes('SECRET_ROLLBACK_CONFLICT'), false);

console.log('V1 pending mission transition runtime tests passed.');
