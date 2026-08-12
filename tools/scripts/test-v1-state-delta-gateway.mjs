import assert from 'node:assert/strict';

import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import {
  assertV1CampaignState
} from '../../src/runtime/v1-campaign-state.mjs';
import { createAshesInitialState } from './v1-test-fixtures.mjs';

function state() {
  return createAshesInitialState({ campaignId: 'campaign.one', saveId: 'save.one', chatId: 'chat.one' });
}

let current = state();
const persisted = [];
const gateway = createStateDeltaGateway({
  getState: () => current,
  setState: (next) => { current = next; },
  persist: async (next) => { persisted.push(structuredClone(next)); },
  now: () => '2401-01-01T00:00:00.000Z'
});

assert.equal(assertV1CampaignState(current), current);
assert.equal(gateway.revision(), 0);

const legacyMinuteState = state();
delete legacyMinuteState.worldState.elapsedSeconds;
delete legacyMinuteState.timeLedger.elapsedSeconds;
delete legacyMinuteState.timeLedger.shipClock.secondOfDay;
delete legacyMinuteState.timeLedger.decisions;
assert.equal(assertV1CampaignState(legacyMinuteState), legacyMinuteState, 'Minute-only V1 saves remain valid.');

const invalidCampaign = state();
invalidCampaign.campaign.title = '';
assert.throws(
  () => assertV1CampaignState(invalidCampaign),
  (error) => error?.code === 'DIRECTIVE_V1_STATE_CAMPAIGN_INVALID'
);
const invalidPackageBinding = state();
invalidPackageBinding.activeCampaignPackage.unexpectedPackageId = 'other-package';
assert.throws(
  () => assertV1CampaignState(invalidPackageBinding),
  (error) => error?.code === 'DIRECTIVE_V1_STATE_PACKAGE_INVALID'
);

const first = await gateway.applyProposal({
  id: 'proposal.one',
  baseRevision: 0,
  domains: ['mission'],
  patch: { mission: { v1: { revision: 1 } } },
  source: 'v1StateSpine'
});
assert.equal(first.noChange, false);
assert.equal(first.campaignState.mission.v1.revision, 1);
assert.equal(first.campaignState.stateCustody.revision, 1);
assert.deepEqual(first.campaignState.stateCustody.recentCommitIds, ['proposal.one']);
assert.equal(Object.hasOwn(first.campaignState, 'runtimeTracking'), false);
assert.equal(persisted.length, 1);

const duplicate = await gateway.applyProposal({
  id: 'proposal.one',
  baseRevision: 0,
  domains: ['mission'],
  patch: { mission: { v1: { revision: 1 } } },
  source: 'v1StateSpine'
});
assert.equal(duplicate.noChange, true);
assert.equal(duplicate.reasonCode, 'already-committed');
assert.equal(gateway.revision(), 1);
assert.equal(persisted.length, 1);

assert.throws(
  () => assertV1CampaignState({ ...state(), unsupportedTracker: {} }),
  (error) => error?.code === 'DIRECTIVE_V1_STATE_FORBIDDEN_ROOT'
);
assert.throws(
  () => assertV1CampaignState({ ...state(), commandBearing: {} }),
  (error) => error?.code === 'DIRECTIVE_V1_STATE_COMMAND_BEARING_INVALID'
);
assert.throws(
  () => assertV1CampaignState({ ...state(), player: {} }),
  (error) => error?.code === 'DIRECTIVE_V1_STATE_PLAYER_INVALID'
);
const numericPlayerName = state();
numericPlayerName.player.name = 7;
assert.throws(
  () => assertV1CampaignState(numericPlayerName),
  (error) => error?.code === 'DIRECTIVE_V1_STATE_PLAYER_INVALID'
);
assert.throws(
  () => assertV1CampaignState({ ...state(), ship: {} }),
  (error) => error?.code === 'DIRECTIVE_V1_STATE_SHIP_INVALID'
);
assert.throws(
  () => assertV1CampaignState({ ...state(), worldState: {} }),
  (error) => error?.code === 'DIRECTIVE_V1_STATE_WORLD_INVALID'
);
assert.throws(
  () => assertV1CampaignState({ ...state(), timeLedger: {} }),
  (error) => error?.code === 'DIRECTIVE_V1_STATE_TIME_INVALID'
);
const nonAuthoritativeTime = state();
nonAuthoritativeTime.timeLedger.entries = [{
  id: 'time.proposal.invalid',
  kind: 'directive.timeProposal.v1',
  elapsedMinutes: 30
}];
assert.throws(
  () => assertV1CampaignState(nonAuthoritativeTime),
  (error) => error?.code === 'DIRECTIVE_V1_STATE_TIME_INVALID'
);
const inconsistentTime = state();
inconsistentTime.timeLedger.elapsedMinutes = 5;
inconsistentTime.timeLedger.elapsedSeconds = 300;
inconsistentTime.timeLedger.shipClock = {
  secondOfDay: 30900,
  minuteOfDay: 515,
  display: '08:35:00 hours'
};
assert.throws(
  () => assertV1CampaignState(inconsistentTime),
  (error) => error?.code === 'DIRECTIVE_V1_STATE_TIME_MISMATCH'
);
const invalidBinding = state();
invalidBinding.campaignChatBinding.kind = 'directive.campaignChatBinding.old';
assert.throws(
  () => assertV1CampaignState(invalidBinding),
  (error) => error?.code === 'DIRECTIVE_V1_STATE_CHAT_BINDING_INVALID'
);
const withoutStorySettlement = state();
delete withoutStorySettlement.storySettlement;
assert.throws(
  () => assertV1CampaignState(withoutStorySettlement),
  (error) => error?.code === 'DIRECTIVE_V1_STATE_REQUIRED_ROOT_MISSING'
);
const withoutMissionAuthority = state();
delete withoutMissionAuthority.mission.v1;
assert.throws(
  () => assertV1CampaignState(withoutMissionAuthority),
  (error) => error?.code === 'DIRECTIVE_V1_STATE_MISSION_INVALID'
);
await assert.rejects(
  gateway.applyProposal({
    id: 'proposal.bad-root',
    baseRevision: 1,
    domains: ['unsupportedTracker'],
    patch: { unsupportedTracker: {} }
  }),
  (error) => error?.code === 'DIRECTIVE_V1_STATE_DOMAIN_FORBIDDEN'
);
await assert.rejects(
  gateway.applyProposal({
    id: 'proposal.bad-player-name',
    baseRevision: 1,
    domains: ['playerPortrait'],
    operations: [{ op: 'set', path: ['player', 'name'], value: 'Another Commander' }]
  }),
  (error) => error?.code === 'DIRECTIVE_V1_STATE_PATH_FORBIDDEN'
);
await assert.rejects(
  gateway.applyProposal({
    id: 'proposal.stale',
    baseRevision: 0,
    domains: ['mission'],
    patch: { mission: { activeMissionId: 'other' } }
  }),
  (error) => error?.code === 'DIRECTIVE_V1_STATE_REVISION_CONFLICT'
);

let rollbackState = state();
const failingGateway = createStateDeltaGateway({
  getState: () => rollbackState,
  setState: (next) => { rollbackState = next; },
  persist: async () => { throw new Error('disk unavailable'); }
});
await assert.rejects(
  failingGateway.applyProposal({
    id: 'proposal.rollback',
    baseRevision: 0,
    domains: ['mission'],
    patch: { mission: { v1: { revision: 1 } } }
  }),
  (error) => error?.code === 'DIRECTIVE_V1_STATE_PERSISTENCE_FAILED'
);
assert.deepEqual(rollbackState, state());

console.log('PASS V1 state delta gateway');
