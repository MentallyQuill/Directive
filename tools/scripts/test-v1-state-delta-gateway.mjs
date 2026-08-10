import assert from 'node:assert/strict';

import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import {
  assertV1CampaignState,
  createV1StateCustody
} from '../../src/runtime/v1-campaign-state.mjs';

function state() {
  return {
    campaign: {
      id: 'campaign.one',
      runtimeArchitecture: {
        kind: 'directive.gameplayArchitecture.v1',
        contractVersion: 1,
        semanticAuthority: 'storySettlement',
        packageId: 'package.ashes',
        packageVersion: '1.0.0',
        createdForNewSave: true
      }
    },
    activeCampaignPackage: { packageId: 'package.ashes', packageVersion: '1.0.0' },
    player: {},
    crew: {},
    ship: {},
    mission: { activeMissionId: 'prelude' },
    commandBearing: {},
    values: {},
    turnLedger: {},
    ui: {},
    settings: {},
    captainState: {},
    worldState: {},
    timeLedger: {},
    stateCustody: createV1StateCustody()
  };
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
  () => assertV1CampaignState({ ...state(), questLedger: {} }),
  (error) => error?.code === 'DIRECTIVE_V1_STATE_FORBIDDEN_ROOT'
);
await assert.rejects(
  gateway.applyProposal({
    id: 'proposal.bad-root',
    baseRevision: 1,
    domains: ['questLedger'],
    patch: { questLedger: {} }
  }),
  (error) => error?.code === 'DIRECTIVE_V1_STATE_DOMAIN_FORBIDDEN'
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
