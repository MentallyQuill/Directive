import assert from 'node:assert/strict';

import { createShipOperationalPacket } from '../../src/ship/v1/ship-operational-packet.mjs';

const shipDataset = {
  mechanics: {
    kind: 'directive.shipMechanics.v1',
    schemaVersion: 1,
    capabilities: [{
      id: 'ship-capability.isolation',
      playerText: { label: 'Segmented isolation', summary: 'Isolate one subsystem for controlled work.' },
      narratorGuidance: 'Allow an authored isolation route when the player invokes it.',
      limits: ['Isolation creates an option; it does not guarantee success.'],
    }],
    constraints: [{
      id: 'ship-constraint.cascade-risk',
      playerText: { label: 'Cascade risk', summary: 'Combined-load work can propagate failures.' },
      narratorGuidance: 'Do not allow a full combined-load shortcut while this constraint is active.',
    }],
    systems: [{
      id: 'ship-system.integration',
      playerText: { label: 'Systems Integration', summary: 'Post-refit integration is unvalidated.' },
      openingStateId: 'ship-state.integration.unvalidated',
      states: [{
        id: 'ship-state.integration.unvalidated', rank: 0,
        capabilityIds: [], constraintIds: ['ship-constraint.cascade-risk'],
        playerText: {
          label: 'Unvalidated', why: 'No isolation test is accepted.',
          mechanicalEffect: 'Combined-load shortcuts remain unsafe.',
        },
      }, {
        id: 'ship-state.integration.segmented', rank: 1,
        capabilityIds: ['ship-capability.isolation'], constraintIds: [],
        playerText: {
          label: 'Segmented', why: 'The isolation test is accepted.',
          mechanicalEffect: 'Authored isolated-system routes are viable.',
        },
      }],
      milestones: [{
        id: 'ship-milestone.integration-isolation-test',
        playerText: { label: 'Complete isolation test', summary: 'Prove one segment can run independently.' },
        sourceRoles: ['assistant'],
        interpretation: {
          evidenceStandard: 'clearOutcome', guidance: 'Select only after completion.',
          exclusions: ['Planning the test is not completion.'],
        },
      }],
      transitions: [{
        id: 'ship-transition.integration.segmented',
        fromStateId: 'ship-state.integration.unvalidated',
        toStateId: 'ship-state.integration.segmented',
        requiredMilestoneIds: ['ship-milestone.integration-isolation-test'],
      }],
    }],
  },
};
const missionDefinition = {
  shipInteractions: [{
    id: 'ship-interaction.isolated-rescue',
    capabilityId: 'ship-capability.isolation',
    evidencePolicyIds: ['policy.isolated-rescue'],
    narratorGuidance: 'When invoked during the rescue, permit the isolated route without deciding its outcome.',
    limits: ['The route remains subject to scene causality.'],
  }],
};

const opening = createShipOperationalPacket({
  shipDataset,
  storySettlement: { episodes: [], receipts: [] },
  missionDefinition,
});
assert.equal(opening.systems[0].state.id, 'ship-state.integration.unvalidated');
assert.deepEqual(opening.capabilities, []);
assert.deepEqual(opening.constraints.map(({ id }) => id), ['ship-constraint.cascade-risk']);
assert.deepEqual(opening.interactions, []);

const improved = createShipOperationalPacket({
  shipDataset,
  storySettlement: {
    episodes: [{ effects: [{
      id: 'effect.ship.isolation', type: 'ship.milestoneCompleted',
      targetId: 'ship-milestone.integration-isolation-test', status: 'active',
      sourceContributionIds: ['contribution.isolation'],
    }] }],
    receipts: [],
  },
  missionDefinition,
});
assert.equal(improved.kind, 'directive.shipOperationalMechanics.v1');
assert.equal(improved.systems[0].state.id, 'ship-state.integration.segmented');
assert.deepEqual(improved.capabilities.map(({ id }) => id), ['ship-capability.isolation']);
assert.deepEqual(improved.constraints, []);
assert.deepEqual(improved.interactions, missionDefinition.shipInteractions);
assert.deepEqual(improved.capabilities[0].evidenceEffectIds, ['effect.ship.isolation']);
assert.equal(JSON.stringify(improved).includes('interpretation'), false);

assert.equal(createShipOperationalPacket({ shipDataset: {}, storySettlement: {} }), null);

console.log('V1 Ship operational packet tests passed.');
