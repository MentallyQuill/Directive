import {
  SHIP_WORK_CLAIM_TYPE,
  indexShipMechanics,
  validateShipMechanics,
} from './ship-mechanics-contracts.mjs';
import {
  activeShipMilestoneEffects,
  deriveShipMechanicsState,
} from './ship-mechanics-state.mjs';

export const SHIP_WORK_EVIDENCE_PROPOSAL_KIND = 'directive.shipWorkEvidenceProposal.v1';

const SOURCE_SLOT_BY_ROLE = Object.freeze({
  assistant: 'previousAssistant',
});

function stableId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
}

function evidenceKey(branchId, claim, source) {
  return [
    branchId,
    source.messageId,
    source.selectedSwipeId || 'no-swipe',
    source.textHash,
    SHIP_WORK_CLAIM_TYPE,
    claim.targetId,
  ].join('|');
}

function milestoneSystemId(index, milestoneId) {
  return [...index.systems.values()].find((system) => (
    (system.milestones || []).some((milestone) => milestone.id === milestoneId)
  ))?.id || null;
}

export function createShipWorkInterpretationCandidates({ shipDataset = {}, storySettlement = {} } = {}) {
  const validation = validateShipMechanics(shipDataset);
  if (!validation.ok) throw new TypeError(validation.errors.join('\n'));
  if (!shipDataset?.mechanics) return [];
  const index = indexShipMechanics(shipDataset);
  const completed = new Set(activeShipMilestoneEffects(storySettlement).map((effect) => effect.targetId));
  const mechanicsState = deriveShipMechanicsState({ shipDataset, storySettlement });
  const available = new Set(mechanicsState.systems.flatMap((system) => (
    system.workOrders.filter((order) => order.status === 'known').map((order) => order.id)
  )));
  return [...index.milestones.values()]
    .filter((milestone) => !completed.has(milestone.id) && available.has(milestone.id))
    .map((milestone) => ({
      id: milestone.id,
      domain: 'shipWork',
      claimType: SHIP_WORK_CLAIM_TYPE,
      targetId: milestone.id,
      sourceSlots: [...new Set(
        milestone.sourceRoles.map((role) => SOURCE_SLOT_BY_ROLE[role]).filter(Boolean),
      )].sort(),
      evidenceStandard: milestone.interpretation.evidenceStandard,
      guidance: milestone.interpretation.guidance,
      exclusions: [...milestone.interpretation.exclusions],
    }))
    .filter((candidate) => candidate.sourceSlots.length > 0)
    .sort((left, right) => left.id.localeCompare(right.id));
}

function rejected(claim, reasonCode) {
  return { ...structuredClone(claim), reasonCode };
}

export function validateShipWorkEvidenceProposal({
  shipDataset = {},
  storySettlement = {},
  proposal = {},
  resolveSourceRef,
} = {}) {
  const validation = validateShipMechanics(shipDataset);
  const claims = Array.isArray(proposal?.claims) ? proposal.claims : [];
  if (!validation.ok) {
    return { acceptedClaims: [], rejectedClaims: claims.map((claim) => rejected(claim, 'definition-invalid')), effects: [] };
  }
  if (proposal.kind !== SHIP_WORK_EVIDENCE_PROPOSAL_KIND) {
    return { acceptedClaims: [], rejectedClaims: claims.map((claim) => rejected(claim, 'effect-not-allowed')), effects: [] };
  }
  const index = indexShipMechanics(shipDataset);
  const completed = new Set(activeShipMilestoneEffects(storySettlement).map((effect) => effect.targetId));
  const acceptedClaims = [];
  const rejectedClaims = [];
  const effects = [];
  const seenClaims = new Set();
  const stagedMilestones = new Set(completed);
  const mechanicsState = deriveShipMechanicsState({ shipDataset, storySettlement });
  const workStatus = new Map(mechanicsState.systems.flatMap((system) => (
    system.workOrders.map((order) => [order.id, order.status])
  )));

  for (const claim of claims) {
    let reasonCode = null;
    const milestone = index.milestones.get(claim?.targetId);
    const source = typeof resolveSourceRef === 'function' ? resolveSourceRef(claim?.sourceRef) : null;
    if (!stableId(claim?.claimId)) reasonCode = 'effect-not-allowed';
    else if (seenClaims.has(claim.claimId)) reasonCode = 'duplicate-claim';
    else if (claim?.domain !== 'shipWork' || claim?.claimType !== SHIP_WORK_CLAIM_TYPE) reasonCode = 'effect-not-allowed';
    else if (!milestone) reasonCode = 'unknown-target';
    else if (claim?.policyId !== milestone.id) reasonCode = 'policy-mismatch';
    else if (stagedMilestones.has(milestone.id)) reasonCode = 'duplicate-claim';
    else if (workStatus.get(milestone.id) !== 'known') reasonCode = 'precondition-not-met';
    else if (!source) reasonCode = 'source-missing';
    else if (source.branchId !== proposal.branchId) reasonCode = 'wrong-branch';
    else if (source.accepted !== true) reasonCode = 'source-not-accepted';
    else if (!milestone.sourceRoles.includes(source.role)) reasonCode = 'source-role-not-authorized';
    else if ((claim?.sourceRef?.swipeId || null) !== (source.selectedSwipeId || null)) reasonCode = 'swipe-mismatch';
    else if (claim?.sourceRef?.textHash !== source.textHash) reasonCode = 'hash-mismatch';
    if (claim?.claimId) seenClaims.add(claim.claimId);
    if (reasonCode) {
      rejectedClaims.push(rejected(claim, reasonCode));
      continue;
    }
    const accepted = {
      ...structuredClone(claim),
      evidenceKey: evidenceKey(proposal.branchId, claim, source),
      sourceContributionId: source.contributionId,
    };
    acceptedClaims.push(accepted);
    stagedMilestones.add(milestone.id);
    effects.push({
      id: claim.claimId,
      type: 'ship.milestoneCompleted',
      targetId: milestone.id,
      value: milestoneSystemId(index, milestone.id),
      sourceContributionIds: [source.contributionId],
      playerVisibility: workStatus.get(milestone.id) === 'unknown' ? 'hidden' : 'visible',
      status: 'active',
    });
  }
  return { acceptedClaims, rejectedClaims, effects };
}

export function appendShipWorkEvidenceToMissionState(inputState = {}, acceptedClaims = []) {
  const claims = (Array.isArray(acceptedClaims) ? acceptedClaims : [])
    .filter((claim) => claim?.evidenceKey && !(inputState.acceptedEvidenceKeys || []).includes(claim.evidenceKey));
  if (claims.length === 0) return structuredClone(inputState);
  const state = structuredClone(inputState);
  state.acceptedEvidenceKeys = [...(state.acceptedEvidenceKeys || [])];
  state.evidenceLog = [...(state.evidenceLog || [])];
  const acceptedAtMissionRevision = state.revision;
  for (const claim of claims) {
    state.acceptedEvidenceKeys.push(claim.evidenceKey);
    state.evidenceLog.push({
      ...structuredClone(claim),
      domain: 'shipWork',
      acceptedAtMissionRevision,
    });
  }
  state.revision += 1;
  return state;
}
