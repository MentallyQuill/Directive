import { applyPressureLedgerDelta, cloneJson, normalizePressureRecord } from './pressure-ledger.mjs';

const OPEN_ORDERS_REWARDS = Object.freeze({
  'side-the-long-repair': {
    assetId: 'helix-yard-support',
    assetLabel: 'Helix Yard Support',
    summary: 'The Breckinridge helps turn Helix Yard repair pressure into an accountable stabilization plan.',
    consequence: 'Helix Yard Support is earned for future repair or reconfiguration work.'
  },
  'side-borrowed-wings': {
    assetId: 'civilian-rescue-wing',
    assetLabel: 'Civilian Rescue Wing',
    summary: 'The Breckinridge helps relief pilots set honest qualification limits without discarding capable people.',
    consequence: 'Civilian Rescue Wing is earned for future evacuation, courier, or search work.'
  },
  'side-quiet-channels': {
    assetId: 'quiet-channels-network',
    assetLabel: 'Quiet Channels Network',
    summary: 'The Breckinridge helps turn informal mutual-aid traffic into a more accountable communications channel.',
    consequence: 'Quiet Channels Network is earned for future resilient civilian communication.'
  }
});

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

function upsertById(items = [], record) {
  const byId = new Map((items || []).filter((item) => item?.id).map((item) => [item.id, item]));
  byId.set(record.id, {
    ...(byId.get(record.id) || {}),
    ...record
  });
  return [...byId.values()];
}

function sideTemplateById(packageData, templateId) {
  return (packageData?.missionTemplates?.side || []).find((template) => template.id === templateId) || null;
}

function openOrdersIntervalById(packageData, intervalId) {
  return (packageData?.sideMissionRules?.openOrders || []).find((interval) => interval.id === intervalId) || null;
}

function pressureById(campaignState, pressureId) {
  return (campaignState?.pressureLedger?.records || []).find((record) => record.id === pressureId) || null;
}

function selectedAssignmentById(campaignState, assignmentId) {
  return (campaignState?.sideMissions?.availableAssignments || []).find((assignment) => assignment.id === assignmentId) || null;
}

function authoredRewardForTemplate(template) {
  const mvp = template?.openOrdersMvp;
  const resolution = mvp && typeof mvp === 'object' ? mvp.resolution : null;
  if (!resolution || typeof resolution !== 'object') {
    return null;
  }
  if (!resolution.assetId || !resolution.assetLabel) {
    return null;
  }
  return {
    assetId: resolution.assetId,
    assetLabel: resolution.assetLabel,
    summary: resolution.summary || `${template.title} is completed as Open Orders work.`,
    consequence: resolution.consequence || `${resolution.assetLabel} is earned for later continuity.`
  };
}

function rewardForAssignment(assignmentId, template = null) {
  return authoredRewardForTemplate(template) || OPEN_ORDERS_REWARDS[assignmentId] || null;
}

function normalizeOutcomeBand(value) {
  const text = String(value || 'Success').trim();
  return [
    'Great Success',
    'Success',
    'Partial Success',
    'Partial Failure',
    'Failure',
    'Great Failure'
  ].includes(text) ? text : 'Success';
}

function normalizeAssignmentMode(value) {
  const text = String(value || 'direct').trim().toLowerCase();
  return text === 'delegated' ? 'delegated' : 'direct';
}

function ensureSideMissions(state) {
  state.sideMissions = {
    openOrdersIntervals: [],
    availableAssignments: [],
    completedAssignments: [],
    ...(state.sideMissions || {})
  };
  if (!Array.isArray(state.sideMissions.openOrdersIntervals)) state.sideMissions.openOrdersIntervals = [];
  if (!Array.isArray(state.sideMissions.availableAssignments)) state.sideMissions.availableAssignments = [];
  if (!Array.isArray(state.sideMissions.completedAssignments)) state.sideMissions.completedAssignments = [];
  return state.sideMissions;
}

function intervalCompletedRecordsAfter(campaignState, completedRecord) {
  return [
    ...((campaignState?.sideMissions?.completedAssignments || [])
      .filter((assignment) => (
        assignment?.intervalId === completedRecord.intervalId
        && assignment.id !== completedRecord.id
      ))),
    completedRecord
  ];
}

function buildIntervalProgress(campaignState, interval, completedRecord) {
  const templateIds = Array.isArray(interval?.sideAssignments) ? interval.sideAssignments.filter(Boolean) : [];
  const templateIdSet = new Set(templateIds);
  const completedRecords = intervalCompletedRecordsAfter(campaignState, completedRecord)
    .filter((assignment) => templateIdSet.size === 0 || templateIdSet.has(assignment.id));
  const completedAssignmentIds = [...new Set(completedRecords.map((assignment) => assignment.id).filter(Boolean))];
  const directCompletedAssignmentIds = [...new Set(completedRecords
    .filter((assignment) => normalizeAssignmentMode(assignment.assignmentMode) === 'direct')
    .map((assignment) => assignment.id)
    .filter(Boolean))];
  const delegatedAssignmentIds = [...new Set(completedRecords
    .filter((assignment) => normalizeAssignmentMode(assignment.assignmentMode) === 'delegated')
    .map((assignment) => assignment.id)
    .filter(Boolean))];
  const totalAssignmentCount = templateIds.length || completedAssignmentIds.length;
  const requiredCompletionCount = Math.min(2, Math.max(1, totalAssignmentCount || 1));
  const allAssignmentsCompleted = totalAssignmentCount > 0 && completedAssignmentIds.length >= totalAssignmentCount;
  const overextended = allAssignmentsCompleted && directCompletedAssignmentIds.length >= totalAssignmentCount;
  const status = overextended
    ? 'overextended'
    : completedAssignmentIds.length >= requiredCompletionCount
      ? 'satisfied'
      : completedAssignmentIds.length > 0
        ? 'partial'
        : 'active';
  const playerSummary = status === 'overextended'
    ? `${interval.title || interval.id} is complete, but every assignment was handled directly and the crew command load is visible for later consequences.`
    : status === 'satisfied'
      ? `${interval.title || interval.id} has enough completed Open Orders work to continue cleanly.`
      : `${interval.title || interval.id} has begun, but more Open Orders work remains available.`;

  return {
    id: completedRecord.intervalId,
    title: completedRecord.intervalTitle,
    status,
    requiredCompletionCount,
    totalAssignmentCount,
    completedAssignmentIds,
    directCompletedAssignmentIds,
    delegatedAssignmentIds,
    directCompletionCount: directCompletedAssignmentIds.length,
    delegatedCompletionCount: delegatedAssignmentIds.length,
    allAssignmentsCompleted,
    overextended,
    lastCompletedAssignmentId: completedRecord.id,
    lastCompletedAt: completedRecord.resolvedAt,
    playerSummary,
    rawValuesHidden: true
  };
}

function awardCampaignAsset(state, {
  assetId,
  resolutionId,
  resolvedAt,
  sideAssignmentId,
  summary
}) {
  if (!assetId) return null;
  const assets = Array.isArray(state.campaignAssets) ? state.campaignAssets : [];
  const index = assets.findIndex((asset) => asset.id === assetId);
  if (index < 0) {
    return null;
  }
  const awarded = {
    ...assets[index],
    state: 'earned',
    earnedByResolutionId: resolutionId,
    earnedAt: resolvedAt || null,
    sourceSideAssignmentId: sideAssignmentId,
    playerSummary: summary,
    rawValuesHidden: true
  };
  state.campaignAssets = [
    ...assets.slice(0, index),
    awarded,
    ...assets.slice(index + 1)
  ];
  return awarded;
}

export function buildOpenOrdersAssignmentResolutionDelta({
  campaignState,
  packageData,
  assignmentId = null,
  resolutionId,
  resolvedAt = null,
  outcomeBand = 'Success',
  summary = null,
  reason = null,
  assignmentMode = 'direct',
  delegatedTo = null
} = {}) {
  requireObject(campaignState, 'campaignState');
  requireObject(packageData, 'packageData');
  const id = requireNonEmptyString(resolutionId, 'resolutionId');
  const selectedId = requireNonEmptyString(assignmentId || campaignState.sideMissions?.activeAssignmentId, 'assignmentId');
  const assignment = selectedAssignmentById(campaignState, selectedId);
  if (!assignment) {
    throw new Error(`No selected Open Orders assignment found for "${selectedId}".`);
  }
  if (!['selected', 'active'].includes(assignment.status)) {
    throw new Error(`Open Orders assignment "${selectedId}" is not selected or active.`);
  }

  const template = sideTemplateById(packageData, assignment.id);
  if (!template) {
    throw new Error(`Open Orders assignment "${assignment.id}" has no package side template.`);
  }
  const interval = openOrdersIntervalById(packageData, assignment.intervalId);
  if (!interval) {
    throw new Error(`Open Orders assignment "${assignment.id}" has no package interval.`);
  }
  const pressure = assignment.pressureId ? pressureById(campaignState, assignment.pressureId) : null;
  const reward = rewardForAssignment(assignment.id, template);
  const normalizedBand = normalizeOutcomeBand(outcomeBand);
  const normalizedAssignmentMode = normalizeAssignmentMode(assignmentMode);
  const delegatedToText = String(delegatedTo || '').trim() || null;
  const playerSummary = String(summary || reward?.summary || `${assignment.title || template.title} is completed as Open Orders work.`).trim();
  const completedRecord = {
    id: assignment.id,
    title: assignment.title || template.title,
    intervalId: assignment.intervalId,
    intervalTitle: interval.title || assignment.intervalId,
    pressureId: assignment.pressureId || null,
    status: 'completed',
    outcomeBand: normalizedBand,
    assignmentMode: normalizedAssignmentMode,
    directCommandLoad: normalizedAssignmentMode === 'direct',
    delegatedTo: normalizedAssignmentMode === 'delegated' ? delegatedToText : null,
    sceneStatus: assignment.sceneStatus || null,
    sceneStartedById: assignment.sceneStartedById || null,
    sceneStartedAt: assignment.sceneStartedAt || null,
    sceneBrief: assignment.sceneBrief ? cloneJson(assignment.sceneBrief) : null,
    sceneBeats: Array.isArray(assignment.sceneBeats) ? cloneJson(assignment.sceneBeats) : [],
    lastSceneBeatId: assignment.lastSceneBeatId || null,
    lastSceneBeatAt: assignment.lastSceneBeatAt || null,
    resolvedById: id,
    resolvedAt: resolvedAt || null,
    selectedByReviewId: assignment.selectedByReviewId || null,
    rewardAssetId: reward?.assetId || null,
    rewardAssetLabel: reward?.assetLabel || null,
    playerSummary,
    visibleConsequences: [
      `${assignment.title || template.title} is completed under ${interval.title || assignment.intervalId}.`,
      normalizedAssignmentMode === 'delegated'
        ? 'The assignment is delegated through accountable Open Orders support instead of direct command load.'
        : 'The assignment is handled directly by the Breckinridge command team.',
      reward?.consequence || null
    ].filter(Boolean),
    reason: reason || assignment.playerSummary || null,
    rawValuesHidden: true
  };

  const pressureDelta = {
    rawValuesHidden: true
  };
  if (pressure) {
    pressureDelta.upsertRecords = [
      normalizePressureRecord({
        id: pressure.id,
        type: pressure.type,
        title: pressure.title,
        playerSummary: pressure.playerSummary,
        directorSummary: pressure.directorSummary,
        status: 'resolved',
        urgencyBand: pressure.urgencyBand,
        escalationBand: pressure.escalationBand,
        lastUpdatedByOutcomeId: id,
        linkedCrewIds: pressure.linkedCrewIds,
        linkedSystemIds: pressure.linkedSystemIds,
        linkedFactIds: pressure.linkedFactIds,
        linkedPhaseIds: pressure.linkedPhaseIds,
        linkedDecisionPointIds: pressure.linkedDecisionPointIds,
        linkedChapterIds: pressure.linkedChapterIds,
        linkedTemplateIds: pressure.linkedTemplateIds,
        tags: pressure.tags,
        cooldown: pressure.cooldown,
        history: [
          {
            type: 'resolved-by-open-orders-assignment',
            resolutionId: id,
            sideAssignmentId: assignment.id,
            reason: reason || playerSummary
          }
        ]
      })
    ];
  }
  const intervalProgress = buildIntervalProgress(campaignState, interval, completedRecord);

  return {
    kind: 'directive.openOrdersAssignmentResolutionDelta',
    resolutionRecord: completedRecord,
    intervalProgress,
    assignment: cloneJson(assignment),
    sideAssignmentTemplate: cloneJson(template),
    interval: cloneJson(interval),
    pressureDelta,
    reward: reward ? cloneJson(reward) : null
  };
}

export function applyOpenOrdersAssignmentResolution({
  campaignState,
  packageData,
  assignmentId = null,
  resolutionId,
  resolvedAt = null,
  outcomeBand = 'Success',
  summary = null,
  reason = null,
  assignmentMode = 'direct',
  delegatedTo = null
} = {}) {
  const built = buildOpenOrdersAssignmentResolutionDelta({
    campaignState,
    packageData,
    assignmentId,
    resolutionId,
    resolvedAt,
    outcomeBand,
    summary,
    reason,
    assignmentMode,
    delegatedTo
  });
  const nextState = cloneJson(campaignState);
  const sideMissions = ensureSideMissions(nextState);

  applyPressureLedgerDelta(nextState, built.pressureDelta);
  sideMissions.availableAssignments = sideMissions.availableAssignments
    .filter((assignment) => assignment.id !== built.resolutionRecord.id);
  sideMissions.completedAssignments = upsertById(sideMissions.completedAssignments, built.resolutionRecord);
  sideMissions.activeAssignmentId = sideMissions.availableAssignments[0]?.id || null;
  sideMissions.lastCompletedAssignmentId = built.resolutionRecord.id;

  sideMissions.openOrdersIntervals = upsertById(sideMissions.openOrdersIntervals, built.intervalProgress);

  const awardedAsset = built.reward?.assetId
    ? awardCampaignAsset(nextState, {
        assetId: built.reward.assetId,
        resolutionId: built.resolutionRecord.resolvedById,
        resolvedAt: built.resolutionRecord.resolvedAt,
        sideAssignmentId: built.resolutionRecord.id,
        summary: built.resolutionRecord.playerSummary
      })
    : null;

  nextState.commandLog = nextState.commandLog || { entries: [], summariesGeneratedFromCommittedStateOnly: true };
  nextState.commandLog.entries = [
    ...(nextState.commandLog.entries || []),
    {
      id: `command-log.${built.resolutionRecord.resolvedById}`,
      type: 'openOrdersAssignment',
      sourceOutcomeId: null,
      summaryInputs: [
        built.resolutionRecord.playerSummary,
        built.resolutionRecord.reason,
        built.intervalProgress.overextended ? built.intervalProgress.playerSummary : null
      ].filter(Boolean),
      visibleConsequences: [
        ...built.resolutionRecord.visibleConsequences,
        built.intervalProgress.overextended ? built.intervalProgress.playerSummary : null
      ].filter(Boolean)
    }
  ];

  return {
    kind: 'directive.committedOpenOrdersAssignmentResolution',
    resolutionRecord: cloneJson(built.resolutionRecord),
    intervalProgress: cloneJson(built.intervalProgress),
    pressureDelta: cloneJson(built.pressureDelta),
    awardedAsset: cloneJson(awardedAsset),
    campaignState: nextState
  };
}
