import assert from 'node:assert/strict';

import { deriveShipMechanicsState } from '../../src/ship/v1/ship-mechanics-state.mjs';
import {
  appendShipWorkEvidenceToMissionState,
  createShipWorkInterpretationCandidates,
  SHIP_WORK_EVIDENCE_PROPOSAL_KIND,
  validateShipWorkEvidenceProposal,
} from '../../src/ship/v1/ship-work-evidence.mjs';

const shipDataset = {
  mechanics: {
    kind: 'directive.shipMechanics.v1',
    schemaVersion: 1,
    capabilities: [{
      id: 'ship-capability.correlation',
      playerText: { label: 'Correlation', summary: 'Compare independent readings.' },
      narratorGuidance: 'Treat independent correlation as viable when invoked.',
      limits: ['It does not identify an unknown actor.'],
    }, {
      id: 'ship-capability.reconstruction',
      playerText: { label: 'Reconstruction', summary: 'Reconstruct eligible signatures.' },
      narratorGuidance: 'Allow authored reconstruction routes when invoked.',
      limits: ['It is not universal deception detection.'],
    }],
    constraints: [{
      id: 'ship-constraint.corroboration',
      playerText: { label: 'Corroboration required', summary: 'Fine claims need an independent source.' },
      narratorGuidance: 'Require corroboration for fine identity claims.',
    }],
    systems: [{
      id: 'ship-system.sensors',
      playerText: { label: 'Sensor Calibration', summary: 'Post-refit correlation remains provisional.' },
      openingStateId: 'ship-state.sensors.provisional',
      states: [{
        id: 'ship-state.sensors.provisional', rank: 0, capabilityIds: [], constraintIds: ['ship-constraint.corroboration'],
        playerText: { label: 'Provisional', why: 'No independent baseline is accepted.', mechanicalEffect: 'Fine claims require corroboration.' },
      }, {
        id: 'ship-state.sensors.aligned', rank: 1, capabilityIds: ['ship-capability.correlation'], constraintIds: [],
        playerText: { label: 'Aligned', why: 'A clean baseline is accepted.', mechanicalEffect: 'Correlation is viable.' },
      }, {
        id: 'ship-state.sensors.validated', rank: 2, capabilityIds: ['ship-capability.correlation', 'ship-capability.reconstruction'], constraintIds: [],
        playerText: { label: 'Validated', why: 'Live-load validation is accepted.', mechanicalEffect: 'Eligible reconstruction routes are viable.' },
      }],
      milestones: [{
        id: 'ship-milestone.sensor-baseline',
        playerText: { label: 'Establish a clean baseline', summary: 'Compare against an independent reference.' },
        sourceRoles: ['assistant'],
        interpretation: {
          evidenceStandard: 'clearOutcome', guidance: 'Select after the completed controlled comparison.',
          exclusions: ['Ordering or beginning the comparison is not completion.'],
        },
      }, {
        id: 'ship-milestone.sensor-live-test',
        playerText: { label: 'Validate under live load', summary: 'Repeat correlation during sustained operations.' },
        revealWhen: { milestoneSatisfied: 'ship-milestone.sensor-baseline' },
        sourceRoles: ['assistant'],
        interpretation: {
          evidenceStandard: 'clearOutcome', guidance: 'Select after completed live-load validation.',
          exclusions: ['A proposed test is not completed validation.'],
        },
      }],
      transitions: [{
        id: 'ship-transition.sensors.aligned',
        fromStateId: 'ship-state.sensors.provisional', toStateId: 'ship-state.sensors.aligned',
        requiredMilestoneIds: ['ship-milestone.sensor-baseline'],
      }, {
        id: 'ship-transition.sensors.validated',
        fromStateId: 'ship-state.sensors.aligned', toStateId: 'ship-state.sensors.validated',
        requiredMilestoneIds: ['ship-milestone.sensor-live-test'],
      }],
    }],
  },
};

const emptySettlement = { branchId: 'save.1', episodes: [], receipts: [] };
const opening = deriveShipMechanicsState({ shipDataset, storySettlement: emptySettlement });
assert.equal(opening.systems[0].currentState.id, 'ship-state.sensors.provisional');
assert.deepEqual(opening.systems[0].workOrders, [{
  id: 'ship-milestone.sensor-baseline',
  status: 'known',
  label: 'Establish a clean baseline',
  summary: 'Compare against an independent reference.',
}, {
  id: 'ship-milestone.sensor-live-test',
  status: 'unknown',
}]);
assert.deepEqual([...opening.capabilities.keys()], []);
assert.deepEqual(
  createShipWorkInterpretationCandidates({ shipDataset, storySettlement: emptySettlement }).map(({ id }) => id),
  ['ship-milestone.sensor-baseline'],
);

const settlementWithBaseline = {
  branchId: 'save.1',
  episodes: [{
    effects: [{
      id: 'effect.ship.baseline',
      type: 'ship.milestoneCompleted',
      targetId: 'ship-milestone.sensor-baseline',
      sourceContributionIds: ['contribution.assistant.1'],
      status: 'active',
      playerVisibility: 'visible',
    }],
  }],
  receipts: [],
};
const aligned = deriveShipMechanicsState({ shipDataset, storySettlement: settlementWithBaseline });
assert.equal(aligned.systems[0].currentState.id, 'ship-state.sensors.aligned');
assert.deepEqual(aligned.systems[0].workOrders.map(({ status }) => status), ['satisfied', 'known']);
assert.deepEqual(aligned.capabilityEvidenceById.get('ship-capability.correlation'), ['effect.ship.baseline']);

const validatedSettlement = structuredClone(settlementWithBaseline);
validatedSettlement.episodes[0].effects.push({
  id: 'effect.ship.live-test',
  type: 'ship.milestoneCompleted',
  targetId: 'ship-milestone.sensor-live-test',
  sourceContributionIds: ['contribution.assistant.2'],
  status: 'active',
  playerVisibility: 'visible',
});
const validated = deriveShipMechanicsState({ shipDataset, storySettlement: validatedSettlement });
assert.equal(validated.systems[0].currentState.id, 'ship-state.sensors.validated');
assert.deepEqual(validated.capabilityEvidenceById.get('ship-capability.reconstruction'), [
  'effect.ship.baseline',
  'effect.ship.live-test',
]);

const candidates = createShipWorkInterpretationCandidates({ shipDataset, storySettlement: settlementWithBaseline });
assert.deepEqual(candidates.map(({ id, domain, claimType, targetId, sourceSlots }) => ({
  id, domain, claimType, targetId, sourceSlots,
})), [{
  id: 'ship-milestone.sensor-live-test',
  domain: 'shipWork',
  claimType: 'shipMilestoneCompleted',
  targetId: 'ship-milestone.sensor-live-test',
  sourceSlots: ['previousAssistant'],
}]);

const assistantSource = {
  branchId: 'save.1',
  role: 'assistant',
  accepted: true,
  messageId: 'assistant.2',
  selectedSwipeId: 'swipe.0',
  textHash: 'abc12345',
  contributionId: 'contribution.assistant.2',
  acceptedAtRevision: 4,
};
const claim = {
  domain: 'shipWork',
  claimId: 'claim.ship.live-test',
  policyId: 'ship-milestone.sensor-live-test',
  claimType: 'shipMilestoneCompleted',
  targetId: 'ship-milestone.sensor-live-test',
  sourceRef: {
    role: 'assistant', messageId: 'assistant.2', swipeId: 'swipe.0', textHash: 'abc12345',
  },
};
const proposal = {
  kind: SHIP_WORK_EVIDENCE_PROPOSAL_KIND,
  branchId: 'save.1',
  claims: [claim],
};
const accepted = validateShipWorkEvidenceProposal({
  shipDataset,
  storySettlement: settlementWithBaseline,
  proposal,
  resolveSourceRef: () => assistantSource,
});
assert.equal(accepted.acceptedClaims.length, 1);
assert.equal(accepted.rejectedClaims.length, 0);
assert.deepEqual(accepted.effects.map(({ type, targetId, sourceContributionIds }) => ({
  type, targetId, sourceContributionIds,
})), [{
  type: 'ship.milestoneCompleted',
  targetId: 'ship-milestone.sensor-live-test',
  sourceContributionIds: ['contribution.assistant.2'],
}]);

const wrongHash = validateShipWorkEvidenceProposal({
  shipDataset,
  storySettlement: settlementWithBaseline,
  proposal: { ...proposal, claims: [{ ...claim, sourceRef: { ...claim.sourceRef, textHash: 'wrong123' } }] },
  resolveSourceRef: () => assistantSource,
});
assert.equal(wrongHash.acceptedClaims.length, 0);
assert.equal(wrongHash.rejectedClaims[0].reasonCode, 'hash-mismatch');

const repeated = validateShipWorkEvidenceProposal({
  shipDataset,
  storySettlement: validatedSettlement,
  proposal,
  resolveSourceRef: () => assistantSource,
});
assert.equal(repeated.acceptedClaims.length, 0);
assert.equal(repeated.rejectedClaims[0].reasonCode, 'duplicate-claim');

const hiddenMilestone = validateShipWorkEvidenceProposal({
  shipDataset,
  storySettlement: emptySettlement,
  proposal,
  resolveSourceRef: () => assistantSource,
});
assert.equal(hiddenMilestone.acceptedClaims.length, 0);
assert.equal(hiddenMilestone.rejectedClaims[0].reasonCode, 'precondition-not-met');

const missionState = {
  revision: 7,
  acceptedEvidenceKeys: [],
  evidenceLog: [],
};
const withShipEvidence = appendShipWorkEvidenceToMissionState(missionState, accepted.acceptedClaims);
assert.equal(withShipEvidence.revision, 8);
assert.equal(withShipEvidence.evidenceLog[0].domain, 'shipWork');
assert.equal(withShipEvidence.evidenceLog[0].targetId, 'ship-milestone.sensor-live-test');
assert.deepEqual(missionState.evidenceLog, []);

console.log('PASS V1 Ship mechanics state');
