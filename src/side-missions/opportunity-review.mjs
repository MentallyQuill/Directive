import { cloneJson } from '../pressures/pressure-ledger.mjs';
import { detectPostChapter1SideMissionOpportunities } from './opportunity-detector.mjs';

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireObject(value, label) {
  if (!isObject(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function requireNonEmptyString(value, label) {
  const text = String(value || '').trim();
  if (!text) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return text;
}

function normalizeDecision(decision) {
  const text = String(decision || 'schedule').trim().toLowerCase();
  if (['schedule', 'defer'].includes(text)) {
    return text;
  }
  throw new Error(`Unknown side-mission opportunity decision "${decision}".`);
}

function upsertById(items = [], record) {
  const byId = new Map((items || []).filter((item) => item?.id).map((item) => [item.id, item]));
  byId.set(record.id, {
    ...(byId.get(record.id) || {}),
    ...record
  });
  return [...byId.values()];
}

function ensureSideMissions(state) {
  state.sideMissions = {
    openOrdersIntervals: [],
    availableAssignments: [],
    completedAssignments: [],
    opportunityReviews: [],
    opportunityCooldowns: [],
    scheduledOpportunities: [],
    ...(state.sideMissions || {})
  };
  if (!Array.isArray(state.sideMissions.openOrdersIntervals)) state.sideMissions.openOrdersIntervals = [];
  if (!Array.isArray(state.sideMissions.availableAssignments)) state.sideMissions.availableAssignments = [];
  if (!Array.isArray(state.sideMissions.completedAssignments)) state.sideMissions.completedAssignments = [];
  if (!Array.isArray(state.sideMissions.opportunityReviews)) state.sideMissions.opportunityReviews = [];
  if (!Array.isArray(state.sideMissions.opportunityCooldowns)) state.sideMissions.opportunityCooldowns = [];
  if (!Array.isArray(state.sideMissions.scheduledOpportunities)) state.sideMissions.scheduledOpportunities = [];
  return state.sideMissions;
}

function intervalTitle(review, candidate) {
  return review?.packageGuard?.interval?.title
    || candidate?.intervalScope
    || candidate?.intervalId
    || 'Follow-Up Opportunities';
}

function safePresentedCandidate(candidate) {
  return {
    id: candidate.id,
    opportunityId: candidate.opportunityId,
    cooldownKey: candidate.cooldownKey,
    title: candidate.title,
    scope: candidate.scope,
    intervalId: candidate.intervalId,
    playerSummary: candidate.playerSummary,
    reviewQuestion: candidate.reviewQuestion,
    reason: candidate.reason,
    rawValuesHidden: true
  };
}

function scheduledOpportunityFromReview(reviewRecord, candidate) {
  return {
    id: candidate.opportunityId,
    opportunityId: candidate.opportunityId,
    reviewId: reviewRecord.id,
    title: candidate.title,
    scope: candidate.scope,
    status: 'scheduled',
    intervalId: candidate.intervalId,
    intervalTitle: reviewRecord.intervalTitle,
    scheduledAt: reviewRecord.reviewedAt,
    cooldownKey: candidate.cooldownKey,
    playerSummary: candidate.playerSummary,
    commandQuestion: candidate.reviewQuestion,
    reason: reviewRecord.reason,
    sourceEventIds: cloneJson(candidate.sourceEventIds || []),
    sourcePressureIds: cloneJson(candidate.sourcePressureIds || []),
    sourceFlagIds: cloneJson(candidate.sourceFlagIds || []),
    sourceFactIds: cloneJson(candidate.sourceFactIds || []),
    sourceCommandLogIds: cloneJson(candidate.sourceCommandLogIds || []),
    rawValuesHidden: true
  };
}

export function buildSideMissionOpportunityReviewDelta({
  campaignState,
  packageData,
  candidateId = null,
  opportunityId = null,
  decision = 'schedule',
  reviewId,
  reviewedAt = null,
  reason = null,
  maxCandidates = 2
} = {}) {
  requireObject(campaignState, 'campaignState');
  requireObject(packageData, 'packageData');
  const normalizedDecision = normalizeDecision(decision);
  const id = requireNonEmptyString(reviewId, 'reviewId');
  const review = detectPostChapter1SideMissionOpportunities({
    campaignState,
    packageData,
    maxCandidates
  });
  const candidate = (review.candidates || []).find((item) => (
    (candidateId && item.id === candidateId)
    || (opportunityId && item.opportunityId === opportunityId)
  ));
  if (!candidate) {
    throw new Error(`No eligible side-mission opportunity found for "${candidateId || opportunityId || 'unspecified'}".`);
  }

  const status = normalizedDecision === 'schedule' ? 'scheduled' : 'deferred';
  const title = candidate.title || candidate.opportunityId;
  const visibleSummary = normalizedDecision === 'schedule'
    ? `${title} scheduled as follow-up side work.`
    : `${title} deferred for now.`;
  const reviewRecord = {
    id,
    type: 'side-mission-opportunity-review',
    status,
    decision: normalizedDecision,
    reviewedAt: reviewedAt || null,
    intervalId: candidate.intervalId,
    intervalTitle: intervalTitle(review, candidate),
    selectedCandidateId: candidate.id,
    opportunityId: candidate.opportunityId,
    opportunityTitle: title,
    cooldownKey: candidate.cooldownKey,
    scope: candidate.scope,
    visibleSummary,
    playerSummary: candidate.playerSummary,
    commandQuestion: candidate.reviewQuestion,
    reason: reason || candidate.reason,
    sourceEventIds: cloneJson(candidate.sourceEventIds || []),
    sourcePressureIds: cloneJson(candidate.sourcePressureIds || []),
    sourceFlagIds: cloneJson(candidate.sourceFlagIds || []),
    sourceFactIds: cloneJson(candidate.sourceFactIds || []),
    sourceCommandLogIds: cloneJson(candidate.sourceCommandLogIds || []),
    candidatesPresented: (review.candidates || []).map(safePresentedCandidate),
    waiting: cloneJson(review.waiting || []),
    suppressed: cloneJson(review.suppressed || []),
    rawValuesHidden: true
  };
  const cooldownRecord = {
    id: `cooldown.${id}`,
    type: 'side-mission-opportunity-cooldown',
    opportunityId: candidate.opportunityId,
    cooldownKey: candidate.cooldownKey,
    status,
    decision: normalizedDecision,
    sourceReviewId: id,
    suppressedUntilChapterId: normalizedDecision === 'defer'
      ? 'open-orders-1-work-worth-doing'
      : null,
    reason: reviewRecord.reason,
    rawValuesHidden: true
  };

  return {
    kind: 'directive.sideMissionOpportunityReviewDelta',
    review,
    reviewRecord,
    cooldownRecord,
    scheduledOpportunity: normalizedDecision === 'schedule'
      ? scheduledOpportunityFromReview(reviewRecord, candidate)
      : null
  };
}

export function applySideMissionOpportunityReview({
  campaignState,
  packageData,
  candidateId = null,
  opportunityId = null,
  decision = 'schedule',
  reviewId,
  reviewedAt = null,
  reason = null,
  maxCandidates = 2
} = {}) {
  const built = buildSideMissionOpportunityReviewDelta({
    campaignState,
    packageData,
    candidateId,
    opportunityId,
    decision,
    reviewId,
    reviewedAt,
    reason,
    maxCandidates
  });
  const nextState = cloneJson(campaignState);
  const sideMissions = ensureSideMissions(nextState);
  const reviewRecord = built.reviewRecord;

  sideMissions.opportunityReviews = upsertById(sideMissions.opportunityReviews, reviewRecord);
  sideMissions.opportunityCooldowns = upsertById(sideMissions.opportunityCooldowns, built.cooldownRecord);
  if (built.scheduledOpportunity) {
    sideMissions.scheduledOpportunities = upsertById(
      sideMissions.scheduledOpportunities,
      built.scheduledOpportunity
    );
    sideMissions.lastScheduledOpportunityId = built.scheduledOpportunity.id;
    sideMissions.generationPausedUntil = null;
  } else {
    sideMissions.lastDeferredOpportunityId = reviewRecord.opportunityId;
  }

  nextState.commandLog = nextState.commandLog || { entries: [], summariesGeneratedFromCommittedStateOnly: true };
  nextState.commandLog.entries = [
    ...(nextState.commandLog.entries || []),
    {
      id: `command-log.${reviewRecord.id}`,
      type: 'sideMissionOpportunityReview',
      sourceOutcomeId: null,
      summaryInputs: [
        reviewRecord.visibleSummary,
        reviewRecord.playerSummary,
        reviewRecord.commandQuestion,
        reviewRecord.reason
      ].filter(Boolean),
      visibleConsequences: [
        reviewRecord.decision === 'schedule'
          ? `${reviewRecord.opportunityTitle} is scheduled as follow-up side work.`
          : `${reviewRecord.opportunityTitle} is deferred; the underlying obligation remains recorded.`,
        reviewRecord.scope ? `Scope: ${reviewRecord.scope}.` : null
      ].filter(Boolean)
    }
  ];

  return {
    kind: 'directive.committedSideMissionOpportunityReview',
    reviewRecord: cloneJson(reviewRecord),
    cooldownRecord: cloneJson(built.cooldownRecord),
    scheduledOpportunity: cloneJson(built.scheduledOpportunity),
    campaignState: nextState
  };
}
