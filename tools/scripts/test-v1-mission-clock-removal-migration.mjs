import assert from 'node:assert/strict';

import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
import { validateMissionStateAuthority } from '../../src/mission/v1/mission-state-authority.mjs';
import { createCampaignStartController } from '../../src/runtime/campaign-start-controller.mjs';
import {
  migrateV1MissionClockRemoval,
  MISSION_CLOCK_REMOVAL_SOURCE_VERSION,
  MISSION_CLOCK_REMOVAL_TARGET_VERSION,
} from '../../src/runtime/v1-mission-clock-removal-migration.mjs';
import {
  createV1CampaignSave,
  loadV1CampaignSave,
  storeV1CampaignSave,
} from '../../src/storage/v1-storage-repository.mjs';
import { createAshesInitialState, loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

const assets = loadAshesRuntimeAssets();
const prelude = assets.missionDefinitions.find((definition) => definition.id === 'mission.prelude-a-ship-underway');

function oldClockBearingState() {
  const campaignState = createAshesInitialState({
    campaignId: 'campaign.clock-migration',
    saveId: 'save.clock-migration',
    chatId: 'chat.clock-migration',
  });
  campaignState.campaign.runtimeArchitecture.packageVersion = MISSION_CLOCK_REMOVAL_SOURCE_VERSION;
  campaignState.activeCampaignPackage.packageVersion = MISSION_CLOCK_REMOVAL_SOURCE_VERSION;
  campaignState.mission.v1.definitionVersion = '1.0.0';
  campaignState.mission.v1.packageBinding.packageVersion = MISSION_CLOCK_REMOVAL_SOURCE_VERSION;
  campaignState.mission.v1.clocks = {
    'clock.hesperus-life-support': {
      state: 'running',
      value: 28.5,
      visibility: 'visible',
      lastAdvancementEvidenceKey: 'evidence.old-time',
      expiryApplied: false,
    },
  };
  campaignState.mission.v1.revision = 1;
  campaignState.mission.v1.acceptedEvidenceKeys = ['evidence.old-time'];
  campaignState.mission.v1.evidenceLog = [{
    claimId: 'claim.old-time',
    policyId: 'policy.hesperus.authoritative-time',
    evidenceKey: 'evidence.old-time',
    claimType: 'timeAdvanced',
    targetId: 'clock.hesperus-life-support',
    value: 1.5,
    sourceContributionId: 'contribution.old-time',
    acceptedAtMissionRevision: 1,
  }];
  return campaignState;
}

assert.equal(MISSION_CLOCK_REMOVAL_SOURCE_VERSION, '0.3.0-pre-alpha.1');
assert.equal(MISSION_CLOCK_REMOVAL_TARGET_VERSION, '0.3.0-pre-alpha.2');

const current = createAshesInitialState();
const currentResult = migrateV1MissionClockRemoval({
  campaignState: current,
  packageData: assets.packageData,
  missionDefinitions: assets.missionDefinitions,
});
assert.equal(currentResult.ok, true);
assert.equal(currentResult.migrated, false);
assert.deepEqual(currentResult.campaignState, current);

const oldState = oldClockBearingState();
const oldSnapshot = structuredClone(oldState);
const timeLedgerSnapshot = structuredClone(oldState.timeLedger);
const migrated = migrateV1MissionClockRemoval({
  campaignState: oldState,
  packageData: assets.packageData,
  missionDefinitions: assets.missionDefinitions,
});
assert.equal(migrated.ok, true, JSON.stringify(migrated));
assert.equal(migrated.migrated, true);
assert.deepEqual(oldState, oldSnapshot, 'migration must be pure');
assert.deepEqual(migrated.campaignState.timeLedger, timeLedgerSnapshot, 'migration must not rewrite canonical chronology');
assert.equal(migrated.campaignState.activeCampaignPackage.packageVersion, MISSION_CLOCK_REMOVAL_TARGET_VERSION);
assert.equal(migrated.campaignState.campaign.runtimeArchitecture.packageVersion, MISSION_CLOCK_REMOVAL_TARGET_VERSION);
assert.equal(migrated.campaignState.mission.v1.definitionVersion, '1.1.0');
assert.equal(Object.hasOwn(migrated.campaignState.mission.v1, 'clocks'), false);
assert.equal(migrated.campaignState.mission.v1.evidenceLog.some((entry) => entry.claimType === 'timeAdvanced'), false);
assert.deepEqual(migrated.campaignState.mission.v1.acceptedEvidenceKeys, []);
assert.equal(migrated.diagnostics.removedTimeEvidenceCount, 1);
assert.equal(validateMissionStateAuthority({ definition: prelude, state: migrated.campaignState.mission.v1 }).ok, true);

const repeated = migrateV1MissionClockRemoval({
  campaignState: migrated.campaignState,
  packageData: assets.packageData,
  missionDefinitions: assets.missionDefinitions,
});
assert.equal(repeated.ok, true);
assert.equal(repeated.migrated, false);
assert.deepEqual(repeated.campaignState, migrated.campaignState);

const ambiguous = oldClockBearingState();
ambiguous.mission.v1.objectives['objective.prelude.hesperus-rescue'] = {
  state: 'terminal',
  visibility: 'resolved',
  disposition: 'expiredAfterKnownDeadline',
};
const ambiguousSnapshot = structuredClone(ambiguous);
const ambiguousResult = migrateV1MissionClockRemoval({
  campaignState: ambiguous,
  packageData: assets.packageData,
  missionDefinitions: assets.missionDefinitions,
});
assert.equal(ambiguousResult.ok, false);
assert.equal(ambiguousResult.reasonCode, 'clock-removal-narrative-ambiguity');
assert.deepEqual(ambiguous, ambiguousSnapshot);

const future = oldClockBearingState();
future.activeCampaignPackage.packageVersion = '0.3.0-pre-alpha.99';
future.campaign.runtimeArchitecture.packageVersion = '0.3.0-pre-alpha.99';
future.mission.v1.packageBinding.packageVersion = '0.3.0-pre-alpha.99';
const futureResult = migrateV1MissionClockRemoval({
  campaignState: future,
  packageData: assets.packageData,
  missionDefinitions: assets.missionDefinitions,
});
assert.equal(futureResult.ok, false);
assert.equal(futureResult.reasonCode, 'clock-removal-source-version-unsupported');

const cleanState = createMissionState({ definition: prelude, branchId: 'save.clean' });
assert.equal(Object.hasOwn(cleanState, 'clocks'), false);

function memoryAdapter() {
  const files = new Map();
  return {
    async readJson(key) {
      if (!files.has(key)) {
        const error = new Error(`not found: ${key}`);
        error.code = 'ENOENT';
        throw error;
      }
      return structuredClone(files.get(key));
    },
    async writeJson(key, value) { files.set(key, structuredClone(value)); },
    async deleteJsonFile(key) { files.delete(key); },
  };
}

const adapter = memoryAdapter();
const persistedOldState = oldClockBearingState();
const oldSave = createV1CampaignSave({
  id: 'save.clock-migration',
  name: 'Clock migration',
  state: persistedOldState,
  createdAt: '2026-08-17T20:00:00.000Z',
});
await storeV1CampaignSave(adapter, oldSave, { makeActive: true });
const controller = createCampaignStartController({
  adapter,
  packages: [assets.packageData],
  missionDefinitions: assets.missionDefinitions,
  now: () => '2026-08-17T20:01:00.000Z',
});
const recovered = await controller.initialize();
assert.equal(recovered.campaignState.activeCampaignPackage.packageVersion, MISSION_CLOCK_REMOVAL_TARGET_VERSION);
assert.equal(Object.hasOwn(recovered.campaignState.mission.v1, 'clocks'), false);
assert.deepEqual(recovered.campaignState.timeLedger, persistedOldState.timeLedger);
const persistedMigration = await loadV1CampaignSave(adapter, oldSave.id);
assert.equal(persistedMigration.packageVersion, MISSION_CLOCK_REMOVAL_TARGET_VERSION);
assert.equal(persistedMigration.state.activeCampaignPackage.packageVersion, MISSION_CLOCK_REMOVAL_TARGET_VERSION);
const custodyRevision = persistedMigration.state.stateCustody.revision;
await controller.initialize();
assert.equal((await loadV1CampaignSave(adapter, oldSave.id)).state.stateCustody.revision, custodyRevision);

console.log('V1 mission clock-removal migration tests passed.');
