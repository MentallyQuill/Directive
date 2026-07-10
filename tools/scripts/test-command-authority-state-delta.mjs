import assert from 'node:assert/strict';
import {
  createStateDeltaGateway
} from '../../src/runtime/state-delta-gateway.mjs';

const now = '2026-07-10T12:00:00.000Z';

function baseCampaignState() {
  return {
    campaign: { id: 'campaign-command-authority-test' },
    player: { id: 'player-commander', name: 'Test Commander', rank: 'Commander', billet: 'Executive Officer' },
    captainState: { crewId: 'mara-whitaker' },
    crew: {
      seniorCrewIds: ['mara-whitaker', 'player-commander', 'priya-nayar']
    },
    runtimeTracking: {
      revision: 0,
      mechanicsRevision: 0
    }
  };
}

function gatewayFor(state = baseCampaignState()) {
  let current = state;
  const persisted = [];
  return {
    get current() { return current; },
    persisted,
    gateway: createStateDeltaGateway({
      getState: () => current,
      setState: (next) => { current = next; },
      persist: async (next, proposal) => persisted.push({ next, proposal }),
      now
    })
  };
}

const valid = gatewayFor();
const validResult = await valid.gateway.applyOperations({
  id: 'command-authority-valid',
  workerId: 'test',
  allowedRoots: ['commandAuthority'],
  operations: [{
    op: 'set',
    path: 'commandAuthority',
    value: {
      version: 1,
      connHolderId: 'player-commander',
      commandRecipientId: 'player-commander',
      majorDecisionAuthorityId: 'mara-whitaker',
      legalCommanderId: 'mara-whitaker',
      operationalCommanderId: 'player-commander',
      delegationSourceId: 'mara-whitaker',
      delegationScope: 'conn',
      playerAuthorityMode: 'delegated-xo',
      commanderPresence: 'offscreen',
      commanderStatus: 'active',
      sourceOutcomeId: 'outcome-conn'
    }
  }]
});
assert.equal(validResult.applied, true);
assert.equal(valid.current.commandAuthority.commandRecipientId, 'player-commander');
assert.equal(valid.current.commandAuthority.majorDecisionAuthorityId, 'mara-whitaker');
assert.equal(valid.current.commandAuthority.lastUpdatedAt, now);
assert.equal(valid.persisted.length, 1);

const invalidEnum = gatewayFor();
await assert.rejects(
  () => invalidEnum.gateway.validateOperations({
    id: 'command-authority-invalid-enum',
    allowedRoots: ['commandAuthority'],
    operations: [{
      op: 'set',
      path: 'commandAuthority',
      value: {
        delegationScope: 'magic-chair',
        playerAuthorityMode: 'delegated-xo',
        commanderPresence: 'offscreen',
        commanderStatus: 'active'
      }
    }]
  }),
  /commandAuthority\.delegationScope has invalid value/
);

const unknownActor = gatewayFor();
await assert.rejects(
  () => unknownActor.gateway.validateOperations({
    id: 'command-authority-unknown-actor',
    allowedRoots: ['commandAuthority'],
    operations: [{
      op: 'set',
      path: 'commandAuthority',
      value: {
        connHolderId: 'unknown-captain',
        delegationScope: 'conn',
        playerAuthorityMode: 'delegated-xo',
        commanderPresence: 'offscreen',
        commanderStatus: 'active'
      }
    }]
  }),
  /commandAuthority\.connHolderId references unknown actor/
);

console.log('Command authority state-delta tests passed.');
