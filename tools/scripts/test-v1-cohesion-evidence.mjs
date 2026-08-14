import assert from 'node:assert/strict';

import { loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';
import {
  createCohesionIssueCreatedEffect,
  createCohesionOpportunityCheckedEffect,
  createCohesionPhaseCompletedEffect,
} from '../../src/ship/v1/cohesion-state.mjs';
import {
  COHESION_EVIDENCE_PROPOSAL_KIND,
  COHESION_PHASE_CLAIM_TYPE,
  createCohesionInterpretationCandidates,
  validateCohesionEvidenceProposal,
} from '../../src/ship/v1/cohesion-evidence.mjs';

const { cohesionCatalog: catalog, shipDataset } = loadAshesRuntimeAssets();
const branchId = 'branch.cohesion';
const created = createCohesionIssueCreatedEffect({
  id: 'effect.created',
  issueId: 'issue.missed-watch',
  templateId: 'cohesion.l1.missed-watch',
  segmentIds: [5],
  sequence: 1,
  opportunitySequence: 1,
  binding: { mode: 'backgroundOnly', crew: { id: 'crew.a', name: 'Ari Chen' } },
  sourceContributionIds: ['contribution.created'],
});

function settlement(effects) {
  return { episodes: [{ id: 'episode.a', status: 'sealed', effects }] };
}

const openingCandidates = createCohesionInterpretationCandidates({
  catalog,
  shipDataset,
  storySettlement: settlement([created]),
  branchId,
});
assert.equal(openingCandidates.length, 1);
assert.equal(openingCandidates[0].domain, 'cohesion');
assert.equal(openingCandidates[0].claimType, COHESION_PHASE_CLAIM_TYPE);
assert.equal(openingCandidates[0].targetId, created.targetId);
assert.equal(openingCandidates[0].phaseId, 'understand-absence');
assert.deepEqual(openingCandidates[0].sourceSlots, ['previousAssistant']);
assert.match(openingCandidates[0].guidance, /Complete only/i);
assert.equal(JSON.stringify(openingCandidates).includes('queued'), false);

const source = {
  messageId: 'message.assistant.1',
  selectedSwipeId: 'swipe.1',
  textHash: 'hash.1',
  branchId,
  accepted: true,
  role: 'assistant',
  contributionId: 'contribution.assistant.1',
};
const candidate = openingCandidates[0];
const proposal = {
  kind: COHESION_EVIDENCE_PROPOSAL_KIND,
  branchId,
  claims: [{
    claimId: 'claim.cohesion.1',
    domain: 'cohesion',
    claimType: COHESION_PHASE_CLAIM_TYPE,
    policyId: candidate.id,
    targetId: candidate.targetId,
    sourceRef: { messageId: source.messageId, swipeId: source.selectedSwipeId, textHash: source.textHash },
  }],
};
const accepted = validateCohesionEvidenceProposal({
  catalog,
  shipDataset,
  storySettlement: settlement([created]),
  proposal,
  resolveSourceRef: () => source,
});
assert.equal(accepted.acceptedClaims.length, 1);
assert.equal(accepted.rejectedClaims.length, 0);
assert.equal(accepted.effects.length, 1);
assert.equal(accepted.effects[0].type, 'ship.cohesionPhaseCompleted');
assert.equal(accepted.effects[0].phaseId, 'understand-absence');
assert.deepEqual(
  validateCohesionEvidenceProposal({
    catalog,
    shipDataset,
    storySettlement: settlement([created]),
    proposal,
    resolveSourceRef: () => source,
  }).effects,
  accepted.effects,
  'retry materializes identical effects',
);

const firstPhase = createCohesionPhaseCompletedEffect({
  id: 'effect.phase.first',
  issueId: created.targetId,
  phaseId: 'understand-absence',
  sequence: 2,
  sourceContributionIds: ['contribution.assistant.0'],
});
const finalCandidates = createCohesionInterpretationCandidates({
  catalog,
  shipDataset,
  storySettlement: settlement([created, firstPhase]),
  branchId,
});
assert.equal(finalCandidates.length, 1);
assert.equal(finalCandidates[0].phaseId, 'restore-coverage');
const finalProposal = {
  ...proposal,
  claims: [{ ...proposal.claims[0], claimId: 'claim.cohesion.2', policyId: finalCandidates[0].id }],
};
const final = validateCohesionEvidenceProposal({
  catalog,
  shipDataset,
  storySettlement: settlement([created, firstPhase]),
  proposal: finalProposal,
  resolveSourceRef: () => source,
});
assert.deepEqual(final.effects.map(({ type }) => type), [
  'ship.cohesionPhaseCompleted',
  'ship.cohesionIssueResolved',
]);
assert.equal(final.effects[1].cohesionRestored, 5);

const skipped = validateCohesionEvidenceProposal({
  catalog,
  shipDataset,
  storySettlement: settlement([created]),
  proposal: finalProposal,
  resolveSourceRef: () => source,
});
assert.equal(skipped.acceptedClaims.length, 0);
assert.equal(skipped.rejectedClaims[0].reasonCode, 'policy-mismatch');

const wrongSource = validateCohesionEvidenceProposal({
  catalog,
  shipDataset,
  storySettlement: settlement([created]),
  proposal,
  resolveSourceRef: () => ({ ...source, accepted: false }),
});
assert.equal(wrongSource.rejectedClaims[0].reasonCode, 'source-not-accepted');

const manyCreated = Array.from({ length: 6 }, (_, index) => createCohesionIssueCreatedEffect({
  id: `effect.more.${index}`,
  issueId: `issue.more.${index}`,
  templateId: 'cohesion.l1.new-to-ship',
  segmentIds: [6 + index],
  sequence: 10 + index,
  opportunitySequence: 10 + index,
  binding: { mode: 'backgroundOnly', crew: { id: `crew.${index}`, name: 'Ari Chen' } },
  sourceContributionIds: [`contribution.${index}`],
}));
const visibleOnly = createCohesionInterpretationCandidates({
  catalog,
  shipDataset,
  storySettlement: settlement([created, ...manyCreated]),
  branchId,
});
assert.equal(visibleOnly.length, 3, 'two authored task slots leave three visible generated phases');
assert.equal(visibleOnly.some(({ targetId }) => targetId === 'issue.more.5'), false);

const longWatchCreated = createCohesionIssueCreatedEffect({
  id: 'effect.long-watch.created',
  issueId: 'issue.long-watch',
  templateId: 'cohesion.l4.long-watch',
  segmentIds: [5, 6, 7, 8],
  sequence: 21,
  opportunitySequence: 7,
  majorArcId: 'arc.long-watch',
  binding: { mode: 'roleOnly', roles: { sections: 'shipwide' } },
  sourceContributionIds: ['contribution.long-watch.created'],
});
const longWatchOpportunity = createCohesionOpportunityCheckedEffect({
  id: 'effect.long-watch.opportunity',
  sequence: 7,
  elapsedSeconds: 28 * 3600,
  outcome: 'created',
  chancePercent: 35,
  roll: 10,
});
const longWatchPriorPhases = [
  'strain-audit',
  'operational-triage',
  'recovery-plan',
  'first-cycle',
  'adjust-continue',
].map((phaseId, index) => createCohesionPhaseCompletedEffect({
  id: `effect.long-watch.phase.${index}`,
  issueId: longWatchCreated.targetId,
  phaseId,
  sequence: 22 + index,
  sourceContributionIds: [`contribution.long-watch.${index}`],
}));
const longWatchCandidates = createCohesionInterpretationCandidates({
  catalog,
  shipDataset,
  storySettlement: settlement([longWatchOpportunity, longWatchCreated, ...longWatchPriorPhases]),
  branchId,
});
const longWatchCandidate = longWatchCandidates.find(({ targetId }) => targetId === longWatchCreated.targetId);
assert.equal(longWatchCandidate.phaseId, 'sustainability-review');
const longWatchFinal = validateCohesionEvidenceProposal({
  catalog,
  shipDataset,
  storySettlement: settlement([longWatchOpportunity, longWatchCreated, ...longWatchPriorPhases]),
  proposal: {
    kind: COHESION_EVIDENCE_PROPOSAL_KIND,
    branchId,
    claims: [{
      claimId: 'claim.cohesion.long-watch.final',
      domain: 'cohesion',
      claimType: COHESION_PHASE_CLAIM_TYPE,
      policyId: longWatchCandidate.id,
      targetId: longWatchCandidate.targetId,
      sourceRef: { messageId: source.messageId, swipeId: source.selectedSwipeId, textHash: source.textHash },
    }],
  },
  resolveSourceRef: () => source,
});
assert.deepEqual(longWatchFinal.effects.map(({ type }) => type), [
  'ship.cohesionPhaseCompleted',
  'ship.cohesionIssueResolved',
  'ship.cohesionGenerationGuardActivated',
]);
assert.deepEqual({
  targetId: longWatchFinal.effects[2].targetId,
  activatedAtOpportunitySequence: longWatchFinal.effects[2].activatedAtOpportunitySequence,
  remainingChecks: longWatchFinal.effects[2].remainingChecks,
  suppressedTags: longWatchFinal.effects[2].suppressedTags,
}, {
  targetId: 'long-watch-recovery',
  activatedAtOpportunitySequence: 7,
  remainingChecks: 2,
  suppressedTags: ['fatigue', 'workload'],
});

console.log('V1 Cohesion evidence passed.');
