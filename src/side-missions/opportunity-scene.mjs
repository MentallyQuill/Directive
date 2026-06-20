import { cloneJson } from '../pressures/pressure-ledger.mjs';

const FOLLOW_UP_SCENE_TEMPLATES = Object.freeze({
  'chapter1-missing-hardware-audit': {
    openingSituation: 'Engineering, operations, and security can turn recovered hardware custody into an accountable audit before Chapter 2 pressure hardens.',
    sceneQuestion: 'Who owns the inventory, custody chain, and command-system review while Starfleet and Compact records stay aligned?',
    expectedOutputs: [
      'Name the responsible owner for the audit.',
      'Keep Starfleet and Compact custody records aligned.',
      'Leave a clear record for later command-authentication questions.'
    ],
    resolutionSummary: 'The recovered hardware audit has an accountable owner and a clean custody record for later review.',
    delegatedSummary: 'The recovered hardware audit is delegated with an accountable reporting path and custody constraints.'
  },
  'chapter1-quarantine-review': {
    openingSituation: 'Medical and operations can document the quarantine exception without turning a justified rescue choice into blame.',
    sceneQuestion: 'How does the ship explain the accepted risk, preserve lessons learned, and keep the review bounded?',
    expectedOutputs: [
      'Define the medical owner for the after-action record.',
      'Separate justified exception handling from ordinary procedure drift.',
      'Record what must change before the next emergency boarding.'
    ],
    resolutionSummary: 'The quarantine review is bounded, documented, and tied to future emergency procedure.',
    delegatedSummary: 'The quarantine review is delegated with medical ownership and command-visible reporting.'
  },
  'chapter1-pell-terms-follow-up': {
    openingSituation: 'Operations and legal channels can keep Pell cooperation lawful after the immediate convoy crisis.',
    sceneQuestion: 'How does the Breckenridge keep cooperation durable without overpromising access or authority?',
    expectedOutputs: [
      'Name the officer responsible for Pell-facing follow-up.',
      'Keep the joint record lawful and limited to known facts.',
      'Protect regional trust without resolving Chapter 2 questions early.'
    ],
    resolutionSummary: 'The Pell terms follow-up has a lawful owner and a limited cooperation record.',
    delegatedSummary: 'The Pell terms follow-up is delegated through lawful operations support and command-visible limits.'
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

function compactText(value, maxLength = 300) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`;
}

function normalizeApproach(value) {
  const text = String(value || 'coordination').trim().toLowerCase();
  return [
    'coordination',
    'technical',
    'medical',
    'security',
    'diplomatic',
    'delegated'
  ].includes(text) ? text : 'coordination';
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
    completedOpportunities: [],
    ...(state.sideMissions || {})
  };
  if (!Array.isArray(state.sideMissions.openOrdersIntervals)) state.sideMissions.openOrdersIntervals = [];
  if (!Array.isArray(state.sideMissions.availableAssignments)) state.sideMissions.availableAssignments = [];
  if (!Array.isArray(state.sideMissions.completedAssignments)) state.sideMissions.completedAssignments = [];
  if (!Array.isArray(state.sideMissions.opportunityReviews)) state.sideMissions.opportunityReviews = [];
  if (!Array.isArray(state.sideMissions.opportunityCooldowns)) state.sideMissions.opportunityCooldowns = [];
  if (!Array.isArray(state.sideMissions.scheduledOpportunities)) state.sideMissions.scheduledOpportunities = [];
  if (!Array.isArray(state.sideMissions.completedOpportunities)) state.sideMissions.completedOpportunities = [];
  return state.sideMissions;
}

function opportunityById(campaignState, opportunityId) {
  return (campaignState?.sideMissions?.scheduledOpportunities || [])
    .find((opportunity) => opportunity.id === opportunityId || opportunity.opportunityId === opportunityId) || null;
}

function requireOpportunity(campaignState, opportunityId) {
  const id = requireNonEmptyString(opportunityId || campaignState?.sideMissions?.activeOpportunityId, 'opportunityId');
  const opportunity = opportunityById(campaignState, id);
  if (!opportunity) {
    throw new Error(`No scheduled follow-up opportunity found for "${id}".`);
  }
  return opportunity;
}

function templateFor(opportunity) {
  return FOLLOW_UP_SCENE_TEMPLATES[opportunity?.opportunityId || opportunity?.id] || {
    openingSituation: opportunity?.playerSummary || `${opportunity?.title || 'This follow-up'} needs accountable work.`,
    sceneQuestion: opportunity?.commandQuestion || `How does the Breckenridge handle ${opportunity?.title || 'this follow-up'} cleanly?`,
    expectedOutputs: [
      'Name the responsible owner.',
      'Keep the follow-up tied to committed state.',
      'Leave a player-facing record for later continuity.'
    ],
    resolutionSummary: `${opportunity?.title || 'The follow-up'} has an accountable owner and record.`,
    delegatedSummary: `${opportunity?.title || 'The follow-up'} is delegated with command-visible accountability.`
  };
}

function buildSceneBrief({ opportunity }) {
  const template = templateFor(opportunity);
  return {
    title: opportunity.title,
    sceneStatus: 'briefing',
    opportunityId: opportunity.opportunityId || opportunity.id,
    intervalId: opportunity.intervalId || null,
    intervalTitle: opportunity.intervalTitle || 'Follow-Up Opportunities',
    scope: opportunity.scope || 'small',
    playerSummary: template.openingSituation,
    sceneQuestion: template.sceneQuestion,
    supportingContext: [
      opportunity.playerSummary || null,
      opportunity.reason || null
    ].filter(Boolean),
    expectedOutputs: cloneJson(template.expectedOutputs),
    rawValuesHidden: true
  };
}

export function buildSideMissionOpportunitySceneStartDelta({
  campaignState,
  opportunityId = null,
  sceneId,
  sceneStartedAt = null,
  reason = null
} = {}) {
  requireObject(campaignState, 'campaignState');
  const id = requireNonEmptyString(sceneId, 'sceneId');
  const opportunity = requireOpportunity(campaignState, opportunityId);
  if (opportunity.status === 'active') {
    throw new Error(`Follow-up opportunity "${opportunity.id}" is already active.`);
  }
  if (opportunity.status === 'completed') {
    throw new Error(`Follow-up opportunity "${opportunity.id}" is already completed.`);
  }
  if (opportunity.status !== 'scheduled') {
    throw new Error(`Follow-up opportunity "${opportunity.id}" is not scheduled.`);
  }

  const sceneBrief = buildSceneBrief({ opportunity });
  const sceneRecord = {
    ...cloneJson(opportunity),
    status: 'active',
    sceneStatus: 'briefing',
    sceneStartedById: id,
    sceneStartedAt: sceneStartedAt || null,
    sceneBrief,
    sceneBeats: [],
    visibleConsequences: [
      `${opportunity.title} is active follow-up work.`,
      sceneBrief.playerSummary
    ],
    reason: reason || opportunity.reason || null,
    rawValuesHidden: true
  };

  return {
    kind: 'directive.sideMissionOpportunitySceneStartDelta',
    sceneRecord,
    sceneBrief: cloneJson(sceneBrief)
  };
}

export function buildSideMissionOpportunitySceneBeatDelta({
  campaignState,
  opportunityId = null,
  beatId,
  beatAt = null,
  playerIntent = null,
  approach = 'coordination',
  reason = null
} = {}) {
  requireObject(campaignState, 'campaignState');
  const id = requireNonEmptyString(beatId, 'beatId');
  const opportunity = requireOpportunity(campaignState, opportunityId);
  if (opportunity.status !== 'active') {
    throw new Error(`Follow-up opportunity "${opportunity.id}" is not active.`);
  }
  const sceneId = opportunity.sceneStartedById || campaignState.sideMissions?.activeOpportunitySceneId || null;
  if (!sceneId) {
    throw new Error(`Follow-up opportunity "${opportunity.id}" has no active scene id.`);
  }
  const sceneBrief = opportunity.sceneBrief
    ? {
        ...cloneJson(opportunity.sceneBrief),
        sceneStatus: 'in-progress'
      }
    : {
        ...buildSceneBrief({ opportunity }),
        sceneStatus: 'in-progress'
      };
  const priorBeats = Array.isArray(opportunity.sceneBeats) ? opportunity.sceneBeats : [];
  const sequence = priorBeats.length + 1;
  const expectedOutputs = Array.isArray(sceneBrief.expectedOutputs) ? sceneBrief.expectedOutputs : [];
  const intent = compactText(
    playerIntent || reason || 'The crew advances this follow-up with accountable next steps.'
  );
  const normalizedApproach = normalizeApproach(approach);
  const beatRecord = {
    id,
    type: 'side-mission-opportunity-scene-beat',
    sequence,
    opportunityId: opportunity.opportunityId || opportunity.id,
    title: sequence === 1 ? 'Initial follow-up work' : `Follow-up beat ${sequence}`,
    sceneId,
    beatAt: beatAt || null,
    approach: normalizedApproach,
    playerIntent: intent,
    playerSummary: `${opportunity.title}: ${intent}`,
    expectedFollowUp: expectedOutputs[Math.min(sequence - 1, Math.max(expectedOutputs.length - 1, 0))]
      || 'Keep the follow-up tied to committed state and later continuity.',
    visibleConsequences: [
      `${opportunity.title} has an active follow-up scene beat on record.`,
      normalizedApproach === 'delegated'
        ? 'The beat emphasizes accountable delegation instead of direct command load.'
        : 'The beat keeps the follow-up tied to command continuity and local accountability.'
    ],
    reason: reason || intent,
    rawValuesHidden: true
  };
  const sceneRecord = {
    ...cloneJson(opportunity),
    status: 'active',
    sceneStatus: 'in-progress',
    sceneBrief,
    sceneBeats: [
      ...cloneJson(priorBeats),
      beatRecord
    ],
    lastSceneBeatId: id,
    lastSceneBeatAt: beatAt || null,
    visibleConsequences: [
      ...(opportunity.visibleConsequences || []),
      beatRecord.playerSummary
    ].filter(Boolean).slice(-6),
    rawValuesHidden: true
  };

  return {
    kind: 'directive.sideMissionOpportunitySceneBeatDelta',
    sceneRecord,
    sceneBeat: cloneJson(beatRecord)
  };
}

export function buildSideMissionOpportunityResolutionDelta({
  campaignState,
  opportunityId = null,
  resolutionId,
  resolvedAt = null,
  outcomeBand = 'Success',
  summary = null,
  reason = null,
  assignmentMode = 'direct',
  delegatedTo = null
} = {}) {
  requireObject(campaignState, 'campaignState');
  const id = requireNonEmptyString(resolutionId, 'resolutionId');
  const opportunity = requireOpportunity(campaignState, opportunityId);
  if (!['active', 'scheduled'].includes(opportunity.status)) {
    throw new Error(`Follow-up opportunity "${opportunity.id}" is not active or scheduled.`);
  }
  const template = templateFor(opportunity);
  const normalizedBand = normalizeOutcomeBand(outcomeBand);
  const normalizedAssignmentMode = normalizeAssignmentMode(assignmentMode);
  const delegatedToText = String(delegatedTo || '').trim() || null;
  const playerSummary = compactText(
    summary
      || (normalizedAssignmentMode === 'delegated' ? template.delegatedSummary : template.resolutionSummary)
      || `${opportunity.title} is resolved as follow-up side work.`
  );
  const resolutionRecord = {
    ...cloneJson(opportunity),
    status: 'completed',
    sceneStatus: 'resolved',
    outcomeBand: normalizedBand,
    assignmentMode: normalizedAssignmentMode,
    directCommandLoad: normalizedAssignmentMode === 'direct',
    delegatedTo: normalizedAssignmentMode === 'delegated' ? delegatedToText : null,
    resolvedById: id,
    resolvedAt: resolvedAt || null,
    playerSummary,
    visibleConsequences: [
      `${opportunity.title} is completed as follow-up side work.`,
      normalizedAssignmentMode === 'delegated'
        ? 'The follow-up is delegated through accountable support instead of direct command load.'
        : 'The follow-up is handled directly by the Breckenridge command team.'
    ],
    reason: reason || opportunity.reason || null,
    rawValuesHidden: true
  };
  return {
    kind: 'directive.sideMissionOpportunityResolutionDelta',
    resolutionRecord
  };
}

export function applySideMissionOpportunitySceneStart({
  campaignState,
  opportunityId = null,
  sceneId,
  sceneStartedAt = null,
  reason = null
} = {}) {
  const built = buildSideMissionOpportunitySceneStartDelta({
    campaignState,
    opportunityId,
    sceneId,
    sceneStartedAt,
    reason
  });
  const nextState = cloneJson(campaignState);
  const sideMissions = ensureSideMissions(nextState);
  sideMissions.scheduledOpportunities = upsertById(sideMissions.scheduledOpportunities, built.sceneRecord);
  sideMissions.activeOpportunityId = built.sceneRecord.id;
  sideMissions.activeOpportunitySceneId = built.sceneRecord.sceneStartedById;
  sideMissions.lastStartedOpportunityId = built.sceneRecord.id;

  nextState.commandLog = nextState.commandLog || { entries: [], summariesGeneratedFromCommittedStateOnly: true };
  nextState.commandLog.entries = [
    ...(nextState.commandLog.entries || []),
    {
      id: `command-log.${built.sceneRecord.sceneStartedById}`,
      type: 'sideMissionOpportunityScene',
      sourceOutcomeId: null,
      summaryInputs: [
        built.sceneBrief.playerSummary,
        built.sceneBrief.sceneQuestion,
        built.sceneRecord.reason
      ].filter(Boolean),
      visibleConsequences: cloneJson(built.sceneRecord.visibleConsequences)
    }
  ];

  return {
    kind: 'directive.committedSideMissionOpportunitySceneStart',
    sceneRecord: cloneJson(built.sceneRecord),
    sceneBrief: cloneJson(built.sceneBrief),
    campaignState: nextState
  };
}

export function applySideMissionOpportunitySceneBeat({
  campaignState,
  opportunityId = null,
  beatId,
  beatAt = null,
  playerIntent = null,
  approach = 'coordination',
  reason = null
} = {}) {
  const built = buildSideMissionOpportunitySceneBeatDelta({
    campaignState,
    opportunityId,
    beatId,
    beatAt,
    playerIntent,
    approach,
    reason
  });
  const nextState = cloneJson(campaignState);
  const sideMissions = ensureSideMissions(nextState);
  sideMissions.scheduledOpportunities = upsertById(sideMissions.scheduledOpportunities, built.sceneRecord);
  sideMissions.activeOpportunityId = built.sceneRecord.id;
  sideMissions.activeOpportunitySceneId = built.sceneRecord.sceneStartedById;
  sideMissions.lastOpportunitySceneBeatId = built.sceneBeat.id;

  nextState.commandLog = nextState.commandLog || { entries: [], summariesGeneratedFromCommittedStateOnly: true };
  nextState.commandLog.entries = [
    ...(nextState.commandLog.entries || []),
    {
      id: `command-log.${built.sceneBeat.id}`,
      type: 'sideMissionOpportunitySceneBeat',
      sourceOutcomeId: null,
      summaryInputs: [
        built.sceneBeat.playerSummary,
        built.sceneBeat.expectedFollowUp,
        built.sceneBeat.reason
      ].filter(Boolean),
      visibleConsequences: cloneJson(built.sceneBeat.visibleConsequences)
    }
  ];

  return {
    kind: 'directive.committedSideMissionOpportunitySceneBeat',
    sceneRecord: cloneJson(built.sceneRecord),
    sceneBeat: cloneJson(built.sceneBeat),
    campaignState: nextState
  };
}

export function applySideMissionOpportunityResolution({
  campaignState,
  opportunityId = null,
  resolutionId,
  resolvedAt = null,
  outcomeBand = 'Success',
  summary = null,
  reason = null,
  assignmentMode = 'direct',
  delegatedTo = null
} = {}) {
  const built = buildSideMissionOpportunityResolutionDelta({
    campaignState,
    opportunityId,
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
  sideMissions.scheduledOpportunities = upsertById(sideMissions.scheduledOpportunities, built.resolutionRecord);
  sideMissions.completedOpportunities = upsertById(sideMissions.completedOpportunities, built.resolutionRecord);
  sideMissions.activeOpportunityId = null;
  sideMissions.activeOpportunitySceneId = null;
  sideMissions.lastCompletedOpportunityId = built.resolutionRecord.id;

  nextState.commandLog = nextState.commandLog || { entries: [], summariesGeneratedFromCommittedStateOnly: true };
  nextState.commandLog.entries = [
    ...(nextState.commandLog.entries || []),
    {
      id: `command-log.${built.resolutionRecord.resolvedById}`,
      type: 'sideMissionOpportunityResolution',
      sourceOutcomeId: null,
      summaryInputs: [
        built.resolutionRecord.playerSummary,
        built.resolutionRecord.reason
      ].filter(Boolean),
      visibleConsequences: cloneJson(built.resolutionRecord.visibleConsequences)
    }
  ];

  return {
    kind: 'directive.committedSideMissionOpportunityResolution',
    resolutionRecord: cloneJson(built.resolutionRecord),
    campaignState: nextState
  };
}
