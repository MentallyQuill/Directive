import assert from 'node:assert/strict';

import {
  validateShipMechanics,
  validateShipMechanicsPackage,
} from '../../src/ship/v1/ship-mechanics-contracts.mjs';

function fixture() {
  return {
    manifest: {
      kind: 'directive.shipDataset.v1',
      schemaVersion: 1,
      id: 'ship.test',
      packageId: 'package:test',
      shipId: 'uss-test',
      version: '1.0.0',
    },
    profile: { summary: 'Test ship.' },
    mechanics: {
      kind: 'directive.shipMechanics.v1',
      schemaVersion: 1,
      capabilities: [{
        id: 'ship-capability.correlation',
        playerText: { label: 'Correlation', summary: 'Compare independent readings.' },
        narratorGuidance: 'Treat independent correlation as a viable approach when invoked.',
        limits: ['It does not identify an unknown actor.'],
      }],
      constraints: [{
        id: 'ship-constraint.corroboration-required',
        playerText: { label: 'Corroboration required', summary: 'Fine claims need an independent source.' },
        narratorGuidance: 'Do not let shipboard readings alone prove fine identity or provenance.',
      }],
      systems: [{
        id: 'ship-system.sensors',
        playerText: { label: 'Sensor Calibration', summary: 'Post-refit correlation remains provisional.' },
        openingStateId: 'ship-state.sensors.provisional',
        states: [{
          id: 'ship-state.sensors.provisional',
          rank: 0,
          capabilityIds: [],
          constraintIds: ['ship-constraint.corroboration-required'],
          playerText: {
            label: 'Provisional',
            why: 'The refit has not been checked against an independent baseline.',
            mechanicalEffect: 'Fine claims require corroboration.',
          },
        }, {
          id: 'ship-state.sensors.aligned',
          rank: 1,
          capabilityIds: ['ship-capability.correlation'],
          constraintIds: [],
          playerText: {
            label: 'Aligned',
            why: 'A controlled independent baseline has been accepted.',
            mechanicalEffect: 'Independent correlation is a viable approach.',
          },
        }],
        milestones: [{
          id: 'ship-milestone.sensor-baseline',
          playerText: { label: 'Establish a clean baseline', summary: 'Compare the array against an independent reference.' },
          sourceRoles: ['assistant'],
          interpretation: {
            evidenceStandard: 'clearOutcome',
            guidance: 'Select only after accepted prose depicts the completed controlled comparison.',
            exclusions: ['Ordering, scheduling, or beginning the comparison is not completion.'],
          },
        }, {
          id: 'ship-milestone.sensor-live-test',
          playerText: { label: 'Validate under live load', summary: 'Repeat correlation during sustained operations.' },
          revealWhen: { milestoneSatisfied: 'ship-milestone.sensor-baseline' },
          sourceRoles: ['assistant'],
          interpretation: {
            evidenceStandard: 'clearOutcome',
            guidance: 'Select only after accepted prose depicts completed live-load validation.',
            exclusions: ['A proposed live test is not completed validation.'],
          },
        }],
        transitions: [{
          id: 'ship-transition.sensors.aligned',
          fromStateId: 'ship-state.sensors.provisional',
          toStateId: 'ship-state.sensors.aligned',
          requiredMilestoneIds: ['ship-milestone.sensor-baseline'],
        }],
      }],
    },
  };
}

const valid = fixture();
assert.deepEqual(validateShipMechanics(valid), { ok: true, errors: [] });

const duplicate = fixture();
duplicate.mechanics.constraints[0].id = duplicate.mechanics.capabilities[0].id;
assert.match(validateShipMechanics(duplicate).errors.join('\n'), /duplicate id/i);

const cycle = fixture();
cycle.mechanics.systems[0].transitions.push({
  id: 'ship-transition.sensors.provisional',
  fromStateId: 'ship-state.sensors.aligned',
  toStateId: 'ship-state.sensors.provisional',
  requiredMilestoneIds: ['ship-milestone.sensor-live-test'],
});
assert.match(validateShipMechanics(cycle).errors.join('\n'), /forward|cycle/i);

const unknownMilestone = fixture();
unknownMilestone.mechanics.systems[0].transitions[0].requiredMilestoneIds = ['ship-milestone.missing'];
assert.match(validateShipMechanics(unknownMilestone).errors.join('\n'), /unknown milestone/i);

const undeclaredCapability = fixture();
undeclaredCapability.mechanics.systems[0].states[1].capabilityIds = ['ship-capability.missing'];
assert.match(validateShipMechanics(undeclaredCapability).errors.join('\n'), /unknown capability/i);

const mission = {
  id: 'mission.test',
  evidencePolicies: [{ id: 'policy.test' }],
  shipInteractions: [{
    id: 'interaction.test',
    capabilityId: 'ship-capability.correlation',
    evidencePolicyIds: ['policy.test'],
    narratorGuidance: 'Use the declared correlation route.',
    limits: ['Do not guarantee success.'],
  }],
};
assert.deepEqual(validateShipMechanicsPackage({ shipDataset: valid, missionDefinitions: [mission] }), {
  ok: true,
  errors: [],
});

const badCapabilityMission = structuredClone(mission);
badCapabilityMission.shipInteractions[0].capabilityId = 'ship-capability.missing';
assert.match(validateShipMechanicsPackage({
  shipDataset: valid,
  missionDefinitions: [badCapabilityMission],
}).errors.join('\n'), /unknown ship capability/i);

const badPolicyMission = structuredClone(mission);
badPolicyMission.shipInteractions[0].evidencePolicyIds = ['policy.missing'];
assert.match(validateShipMechanicsPackage({
  shipDataset: valid,
  missionDefinitions: [badPolicyMission],
}).errors.join('\n'), /unknown evidence policy/i);

console.log('PASS V1 Ship mechanics contracts');
