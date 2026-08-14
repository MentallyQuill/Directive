import {
  activeCohesionEffects,
  createCohesionGenerationGuardEffect,
  createCohesionIssueResolvedEffect,
  createCohesionPhaseCompletedEffect,
  deriveCohesionState,
} from './cohesion-state.mjs';

export const COHESION_EVIDENCE_PROPOSAL_KIND = 'directive.cohesionEvidenceProposal.v1';
export const COHESION_PHASE_CLAIM_TYPE = 'completeCohesionPhase';

function stableId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
}

function candidateId(issue) {
  return `cohesion-phase:${issue.id}:${issue.currentPhase.id}`;
}

export function createCohesionInterpretationCandidates({
  catalog = {}, shipDataset = {}, storySettlement = {}, branchId = '',
} = {}) {
  const state = deriveCohesionState({ catalog, shipDataset, storySettlement, branchId });
  return state.visibleTasks
    .filter((issue) => !issue.authored && issue.currentPhase)
    .map((issue) => ({
      id: candidateId(issue),
      domain: 'cohesion',
      claimType: COHESION_PHASE_CLAIM_TYPE,
      targetId: issue.id,
      phaseId: issue.currentPhase.id,
      sourceSlots: ['previousAssistant'],
      evidenceStandard: 'clearOutcome',
      guidance: `Complete only when: ${issue.completion.guidance} Current phase: ${issue.currentPhase.label}.`,
      exclusions: [...issue.completion.exclusions],
    }));
}

function rejected(claim, reasonCode) {
  return { ...structuredClone(claim), reasonCode };
}

function evidenceKey(branchId, claim, source, phaseId) {
  return [
    branchId,
    source.messageId,
    source.selectedSwipeId || 'no-swipe',
    source.textHash,
    COHESION_PHASE_CLAIM_TYPE,
    claim.targetId,
    phaseId,
  ].join('|');
}

export function validateCohesionEvidenceProposal({
  catalog = {}, shipDataset = {}, storySettlement = {}, proposal = {}, resolveSourceRef,
} = {}) {
  const claims = Array.isArray(proposal?.claims) ? proposal.claims : [];
  if (proposal.kind !== COHESION_EVIDENCE_PROPOSAL_KIND) {
    return { acceptedClaims: [], rejectedClaims: claims.map((claim) => rejected(claim, 'effect-not-allowed')), effects: [] };
  }
  let candidates;
  let state;
  try {
    state = deriveCohesionState({ catalog, shipDataset, storySettlement, branchId: proposal.branchId });
    candidates = new Map(createCohesionInterpretationCandidates({
      catalog, shipDataset, storySettlement, branchId: proposal.branchId,
    }).map((candidate) => [candidate.id, candidate]));
  } catch {
    return { acceptedClaims: [], rejectedClaims: claims.map((claim) => rejected(claim, 'definition-invalid')), effects: [] };
  }
  const issues = new Map(state.visibleTasks.map((issue) => [issue.id, issue]));
  const acceptedClaims = [];
  const rejectedClaims = [];
  const effects = [];
  const seenClaims = new Set();
  let nextSequence = Math.max(0, ...activeCohesionEffects(storySettlement).map(({ sequence }) => Number(sequence) || 0)) + 1;

  for (const claim of claims) {
    const issue = issues.get(claim?.targetId);
    const candidate = candidates.get(claim?.policyId);
    const source = typeof resolveSourceRef === 'function' ? resolveSourceRef(claim?.sourceRef) : null;
    let reasonCode = null;
    if (!stableId(claim?.claimId)) reasonCode = 'effect-not-allowed';
    else if (seenClaims.has(claim.claimId)) reasonCode = 'duplicate-claim';
    else if (claim?.domain !== 'cohesion' || claim?.claimType !== COHESION_PHASE_CLAIM_TYPE) reasonCode = 'effect-not-allowed';
    else if (!issue || issue.authored || !issue.currentPhase) reasonCode = 'unknown-target';
    else if (!candidate || candidate.targetId !== issue.id || candidate.phaseId !== issue.currentPhase.id) reasonCode = 'policy-mismatch';
    else if (!source) reasonCode = 'source-missing';
    else if (source.branchId !== proposal.branchId) reasonCode = 'wrong-branch';
    else if (source.accepted !== true) reasonCode = 'source-not-accepted';
    else if (source.role !== 'assistant') reasonCode = 'source-role-not-authorized';
    else if ((claim?.sourceRef?.swipeId || null) !== (source.selectedSwipeId || null)) reasonCode = 'swipe-mismatch';
    else if (claim?.sourceRef?.textHash !== source.textHash) reasonCode = 'hash-mismatch';
    if (claim?.claimId) seenClaims.add(claim.claimId);
    if (reasonCode) {
      rejectedClaims.push(rejected(claim, reasonCode));
      continue;
    }
    const accepted = {
      ...structuredClone(claim),
      phaseId: issue.currentPhase.id,
      evidenceKey: evidenceKey(proposal.branchId, claim, source, issue.currentPhase.id),
      sourceContributionId: source.contributionId,
    };
    acceptedClaims.push(accepted);
    effects.push(createCohesionPhaseCompletedEffect({
      id: claim.claimId,
      issueId: issue.id,
      phaseId: issue.currentPhase.id,
      sequence: nextSequence++,
      sourceContributionIds: [source.contributionId],
    }));
    const finalPhase = issue.phases.at(-1)?.id === issue.currentPhase.id;
    if (finalPhase) {
      effects.push(createCohesionIssueResolvedEffect({
        id: `${claim.claimId}.resolved`,
        issueId: issue.id,
        cohesionRestored: issue.cohesion,
        sequence: nextSequence++,
        sourceContributionIds: [source.contributionId],
      }));
      const guard = issue.completion?.generationGuard;
      if (guard) {
        const activatedAtOpportunitySequence = Math.max(
          0,
          ...state.opportunityChecks.map(({ sequence }) => Number(sequence) || 0),
        );
        effects.push(createCohesionGenerationGuardEffect({
          id: `${claim.claimId}.guard`,
          guardId: guard.id,
          activatedAtOpportunitySequence,
          remainingChecks: guard.remainingChecks,
          suppressedTags: guard.suppressTags,
          sequence: nextSequence++,
          sourceContributionIds: [source.contributionId],
        }));
      }
    }
  }
  return { acceptedClaims, rejectedClaims, effects };
}
