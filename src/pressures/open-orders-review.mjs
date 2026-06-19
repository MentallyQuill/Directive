import { applyPressureLedgerDelta, cloneJson, normalizePressureRecord } from './pressure-ledger.mjs';
import { selectSideMissionCandidates } from './side-mission-candidates.mjs';

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

function byId(items = []) {
  return new Map((items || []).filter((item) => item?.id).map((item) => [item.id, item]));
}

function upsertById(items = [], record) {
  const byRecordId = byId(items);
  byRecordId.set(record.id, {
    ...(byRecordId.get(record.id) || {}),
    ...record
  });
  return [...byRecordId.values()];
}

function pressureById(campaignState, pressureId) {
  return (campaignState?.pressureLedger?.records || []).find((record) => record.id === pressureId) || null;
}

function intervalById(packageData, intervalId) {
  return (packageData?.sideMissionRules?.openOrders || []).find((interval) => interval.id === intervalId) || null;
}

function sideTemplateById(packageData, templateId) {
  return (packageData?.missionTemplates?.side || []).find((template) => template.id === templateId) || null;
}

function activeIntervalSummary(review) {
  const intervalIds = [...new Set((review.candidates || []).map((candidate) => candidate.intervalId).filter(Boolean))];
  if (intervalIds.length === 1) {
    const candidate = review.candidates.find((item) => item.intervalId === intervalIds[0]);
    return {
      intervalId: intervalIds[0],
      intervalTitle: candidate?.intervalTitle || intervalIds[0]
    };
  }
  return {
    intervalId: null,
    intervalTitle: null
  };
}

function normalizeDecision(decision) {
  const text = String(decision || 'start').trim().toLowerCase();
  if (['start', 'defer'].includes(text)) {
    return text;
  }
  throw new Error(`Unknown Open Orders review decision "${decision}".`);
}

export function buildOpenOrdersCandidateReview({
  campaignState,
  packageData,
  maxCandidates = 2
} = {}) {
  requireObject(campaignState, 'campaignState');
  requireObject(packageData, 'packageData');
  const review = selectSideMissionCandidates({
    campaignState,
    packageData,
    maxCandidates
  });
  const interval = activeIntervalSummary(review);
  return {
    kind: 'directive.openOrdersCandidateReview',
    generatedFrom: review.generatedFrom,
    intervalId: interval.intervalId,
    intervalTitle: interval.intervalTitle,
    maxCandidates: review.maxCandidates,
    candidates: cloneJson(review.candidates || []),
    waiting: cloneJson(review.waiting || []),
    suppressed: cloneJson(review.suppressed || []),
    rawValuesHidden: true
  };
}

export function buildOpenOrdersCandidateReviewDelta({
  campaignState,
  packageData,
  candidateId = null,
  sideAssignmentId = null,
  decision = 'start',
  reviewId,
  reviewedAt = null,
  reason = null,
  maxCandidates = 2
} = {}) {
  requireObject(campaignState, 'campaignState');
  requireObject(packageData, 'packageData');
  const normalizedDecision = normalizeDecision(decision);
  const id = requireNonEmptyString(reviewId, 'reviewId');
  const review = buildOpenOrdersCandidateReview({ campaignState, packageData, maxCandidates });
  const candidate = (review.candidates || []).find((item) => (
    (candidateId && item.id === candidateId)
    || (sideAssignmentId && item.sideAssignmentId === sideAssignmentId)
  ));
  if (!candidate) {
    throw new Error(`No eligible Open Orders candidate found for "${candidateId || sideAssignmentId || 'unspecified'}".`);
  }

  const pressure = pressureById(campaignState, candidate.pressureId);
  if (!pressure) {
    throw new Error(`Open Orders candidate references unknown pressure "${candidate.pressureId}".`);
  }
  const interval = intervalById(packageData, candidate.intervalId);
  const template = sideTemplateById(packageData, candidate.sideAssignmentId);
  const status = normalizedDecision === 'start' ? 'selected' : 'deferred';
  const visibleSummary = normalizedDecision === 'start'
    ? `${candidate.sideAssignmentTitle} selected from ${candidate.pressureTitle}.`
    : `${candidate.sideAssignmentTitle} deferred from ${candidate.pressureTitle}.`;
  const reviewRecord = {
    id,
    type: 'open-orders-candidate-review',
    status,
    decision: normalizedDecision,
    reviewedAt: reviewedAt || null,
    intervalId: candidate.intervalId,
    intervalTitle: candidate.intervalTitle,
    selectedCandidateId: candidate.id,
    selectedPressureId: candidate.pressureId,
    selectedPressureTitle: candidate.pressureTitle,
    selectedSideAssignmentId: candidate.sideAssignmentId,
    selectedSideAssignmentTitle: candidate.sideAssignmentTitle,
    visibleSummary,
    reason: reason || candidate.reason,
    candidatesPresented: (review.candidates || []).map((item) => ({
      id: item.id,
      pressureId: item.pressureId,
      sideAssignmentId: item.sideAssignmentId,
      sideAssignmentTitle: item.sideAssignmentTitle,
      intervalId: item.intervalId,
      score: item.score,
      reason: item.reason
    })),
    waiting: cloneJson(review.waiting || []),
    suppressed: cloneJson(review.suppressed || []),
    rawValuesHidden: true
  };

  const pressureDelta = {
    candidateReviewsAdd: [reviewRecord],
    rawValuesHidden: true
  };

  if (normalizedDecision === 'start') {
    pressureDelta.upsertRecords = [
      normalizePressureRecord({
        ...pressure,
        status: 'cooling',
        cooldown: {
          ...pressure.cooldown,
          eligibleAfterChapterId: interval?.id || candidate.intervalId
        },
        lastUpdatedByOutcomeId: id,
        history: [
          ...(pressure.history || []),
          {
            type: 'selected-for-open-orders',
            reviewId: id,
            intervalId: candidate.intervalId,
            sideAssignmentId: candidate.sideAssignmentId,
            reason: reason || candidate.reason
          }
        ]
      })
    ];
  } else {
    pressureDelta.suppressions = [{
      pressureId: candidate.pressureId,
      suppressedUntilChapterId: 'chapter-3-dead-letters',
      reason: reason || 'Player deferred this Open Orders candidate.',
      sourceOutcomeId: id
    }];
  }

  return {
    kind: 'directive.openOrdersCandidateReviewDelta',
    review,
    reviewRecord,
    candidate,
    interval: interval ? cloneJson(interval) : null,
    sideAssignmentTemplate: template ? cloneJson(template) : null,
    pressureDelta
  };
}

export function applyOpenOrdersCandidateReview({
  campaignState,
  packageData,
  candidateId = null,
  sideAssignmentId = null,
  decision = 'start',
  reviewId,
  reviewedAt = null,
  reason = null,
  maxCandidates = 2
} = {}) {
  const built = buildOpenOrdersCandidateReviewDelta({
    campaignState,
    packageData,
    candidateId,
    sideAssignmentId,
    decision,
    reviewId,
    reviewedAt,
    reason,
    maxCandidates
  });
  const nextState = cloneJson(campaignState);
  applyPressureLedgerDelta(nextState, built.pressureDelta);

  nextState.sideMissions = {
    openOrdersIntervals: [],
    availableAssignments: [],
    completedAssignments: [],
    ...(nextState.sideMissions || {})
  };
  if (!Array.isArray(nextState.sideMissions.openOrdersIntervals)) nextState.sideMissions.openOrdersIntervals = [];
  if (!Array.isArray(nextState.sideMissions.availableAssignments)) nextState.sideMissions.availableAssignments = [];
  if (!Array.isArray(nextState.sideMissions.completedAssignments)) nextState.sideMissions.completedAssignments = [];

  const reviewRecord = built.reviewRecord;
  if (reviewRecord.decision === 'start') {
    nextState.sideMissions.openOrdersIntervals = upsertById(nextState.sideMissions.openOrdersIntervals, {
      id: reviewRecord.intervalId,
      title: reviewRecord.intervalTitle,
      status: 'active',
      openedByReviewId: reviewRecord.id,
      openedAt: reviewRecord.reviewedAt,
      rawValuesHidden: true
    });
    nextState.sideMissions.availableAssignments = upsertById(nextState.sideMissions.availableAssignments, {
      id: reviewRecord.selectedSideAssignmentId,
      title: reviewRecord.selectedSideAssignmentTitle,
      intervalId: reviewRecord.intervalId,
      pressureId: reviewRecord.selectedPressureId,
      status: 'selected',
      selectedByReviewId: reviewRecord.id,
      selectedAt: reviewRecord.reviewedAt,
      playerSummary: reviewRecord.visibleSummary,
      rawValuesHidden: true
    });
    nextState.sideMissions.activeAssignmentId = reviewRecord.selectedSideAssignmentId;
    nextState.sideMissions.generationPausedUntil = null;
  }

  nextState.commandLog = nextState.commandLog || { entries: [], summariesGeneratedFromCommittedStateOnly: true };
  nextState.commandLog.entries = [
    ...(nextState.commandLog.entries || []),
    {
      id: `command-log.${reviewRecord.id}`,
      type: 'openOrdersReview',
      sourceOutcomeId: null,
      summaryInputs: [
        reviewRecord.visibleSummary,
        reviewRecord.reason
      ].filter(Boolean),
      visibleConsequences: reviewRecord.decision === 'start'
        ? [`${reviewRecord.selectedSideAssignmentTitle} is available under ${reviewRecord.intervalTitle}.`]
        : [`${reviewRecord.selectedSideAssignmentTitle} is deferred; the pressure remains recorded.`]
    }
  ];

  return {
    kind: 'directive.committedOpenOrdersCandidateReview',
    reviewRecord: cloneJson(reviewRecord),
    pressureDelta: cloneJson(built.pressureDelta),
    campaignState: nextState
  };
}
