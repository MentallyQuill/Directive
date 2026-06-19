import { applyPressureLedgerDelta, cloneJson, normalizePressureRecord } from './pressure-ledger.mjs';

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

function compactText(value, maxLength = 260) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return '';
  }
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`;
}

function normalizeSceneApproach(value) {
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
    ...(state.sideMissions || {})
  };
  if (!Array.isArray(state.sideMissions.openOrdersIntervals)) state.sideMissions.openOrdersIntervals = [];
  if (!Array.isArray(state.sideMissions.availableAssignments)) state.sideMissions.availableAssignments = [];
  if (!Array.isArray(state.sideMissions.completedAssignments)) state.sideMissions.completedAssignments = [];
  return state.sideMissions;
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

function assignmentById(campaignState, assignmentId) {
  return (campaignState?.sideMissions?.availableAssignments || []).find((assignment) => assignment.id === assignmentId) || null;
}

function buildSceneBrief({ assignment, template, interval, pressure }) {
  const title = assignment.title || template.title || assignment.id;
  const intervalTitle = interval.title || assignment.intervalId;
  return {
    title,
    sceneStatus: 'briefing',
    intervalId: assignment.intervalId,
    intervalTitle,
    pressureId: assignment.pressureId || null,
    pressureTitle: pressure?.title || null,
    playerSummary: `${title} is active Open Orders work under ${intervalTitle}.`,
    sceneQuestion: `How does the Breckinridge handle ${title} while preserving command continuity and local accountability?`,
    supportingContext: [
      pressure?.playerSummary || assignment.playerSummary || null,
      `This assignment belongs to ${intervalTitle}.`
    ].filter(Boolean),
    expectedOutputs: [
      'Name the responsible Starfleet owner or delegation path.',
      'Protect the linked pressure instead of treating the assignment as isolated work.',
      'Leave a player-facing completion record that can feed later continuity.'
    ],
    rawValuesHidden: true
  };
}

export function buildOpenOrdersAssignmentSceneStartDelta({
  campaignState,
  packageData,
  assignmentId = null,
  sceneId,
  sceneStartedAt = null,
  reason = null
} = {}) {
  requireObject(campaignState, 'campaignState');
  requireObject(packageData, 'packageData');
  const id = requireNonEmptyString(sceneId, 'sceneId');
  const selectedId = requireNonEmptyString(assignmentId || campaignState.sideMissions?.activeAssignmentId, 'assignmentId');
  const assignment = assignmentById(campaignState, selectedId);
  if (!assignment) {
    throw new Error(`No selected Open Orders assignment found for "${selectedId}".`);
  }
  if (assignment.status === 'active') {
    throw new Error(`Open Orders assignment "${selectedId}" is already active.`);
  }
  if (assignment.status !== 'selected') {
    throw new Error(`Open Orders assignment "${selectedId}" is not selected.`);
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
  const sceneBrief = buildSceneBrief({
    assignment,
    template,
    interval,
    pressure
  });
  const activeAssignment = {
    ...cloneJson(assignment),
    status: 'active',
    sceneStatus: 'briefing',
    intervalTitle: sceneBrief.intervalTitle,
    sceneStartedById: id,
    sceneStartedAt: sceneStartedAt || null,
    sceneBrief,
    visibleConsequences: [
      `${sceneBrief.title} is active under ${sceneBrief.intervalTitle}.`,
      pressure?.playerSummary || null
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
        ...pressure,
        lastUpdatedByOutcomeId: id,
        history: [
          {
            type: 'opened-as-open-orders-scene',
            sceneId: id,
            intervalId: assignment.intervalId,
            sideAssignmentId: assignment.id,
            reason: reason || sceneBrief.playerSummary
          }
        ]
      })
    ];
  }

  return {
    kind: 'directive.openOrdersAssignmentSceneStartDelta',
    sceneRecord: activeAssignment,
    sceneBrief: cloneJson(sceneBrief),
    assignment: cloneJson(assignment),
    sideAssignmentTemplate: cloneJson(template),
    interval: cloneJson(interval),
    pressureDelta
  };
}

export function buildOpenOrdersAssignmentSceneBeatDelta({
  campaignState,
  packageData,
  assignmentId = null,
  beatId,
  beatAt = null,
  playerIntent = null,
  approach = 'coordination',
  reason = null
} = {}) {
  requireObject(campaignState, 'campaignState');
  requireObject(packageData, 'packageData');
  const id = requireNonEmptyString(beatId, 'beatId');
  const selectedId = requireNonEmptyString(assignmentId || campaignState.sideMissions?.activeAssignmentId, 'assignmentId');
  const assignment = assignmentById(campaignState, selectedId);
  if (!assignment) {
    throw new Error(`No active Open Orders assignment found for "${selectedId}".`);
  }
  if (assignment.status !== 'active') {
    throw new Error(`Open Orders assignment "${selectedId}" is not active.`);
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
  const title = assignment.title || template.title || assignment.id;
  const sceneId = assignment.sceneStartedById || campaignState.sideMissions?.activeAssignmentSceneId || null;
  if (!sceneId) {
    throw new Error(`Open Orders assignment "${selectedId}" has no active scene id.`);
  }
  const priorBeats = Array.isArray(assignment.sceneBeats) ? assignment.sceneBeats : [];
  const sequence = priorBeats.length + 1;
  const intent = compactText(
    playerIntent || reason || 'The crew advances the assignment with accountable follow-through.'
  );
  const normalizedApproach = normalizeSceneApproach(approach);
  const sceneBrief = assignment.sceneBrief
    ? {
        ...cloneJson(assignment.sceneBrief),
        sceneStatus: 'in-progress'
      }
    : {
        ...buildSceneBrief({
          assignment,
          template,
          interval,
          pressure
        }),
        sceneStatus: 'in-progress'
      };
  const expectedOutputs = Array.isArray(sceneBrief.expectedOutputs) ? sceneBrief.expectedOutputs : [];
  const expectedFollowUp = expectedOutputs[Math.min(sequence - 1, Math.max(expectedOutputs.length - 1, 0))]
    || 'Keep the assignment tied to its pressure and completion record.';
  const beatRecord = {
    id,
    type: 'open-orders-assignment-scene-beat',
    sequence,
    assignmentId: assignment.id,
    title: `Scene beat ${sequence}`,
    intervalId: assignment.intervalId,
    intervalTitle: interval.title || assignment.intervalId,
    sceneId,
    beatAt: beatAt || null,
    approach: normalizedApproach,
    playerIntent: intent,
    playerSummary: `${title}: ${intent}`,
    expectedFollowUp,
    visibleConsequences: [
      `${title} has an active Open Orders scene beat on record.`,
      normalizedApproach === 'delegated'
        ? 'The beat emphasizes accountable delegation instead of direct command load.'
        : 'The beat keeps the assignment tied to command continuity and local accountability.'
    ],
    reason: reason || intent,
    rawValuesHidden: true
  };
  const sceneBeats = [
    ...cloneJson(priorBeats),
    beatRecord
  ];
  const sceneRecord = {
    ...cloneJson(assignment),
    status: 'active',
    sceneStatus: 'in-progress',
    intervalTitle: interval.title || assignment.intervalId,
    sceneBrief,
    sceneBeats,
    lastSceneBeatId: id,
    lastSceneBeatAt: beatAt || null,
    visibleConsequences: [
      ...(assignment.visibleConsequences || []),
      beatRecord.playerSummary
    ].filter(Boolean).slice(-6),
    rawValuesHidden: true
  };

  const pressureDelta = {
    rawValuesHidden: true
  };
  if (pressure) {
    pressureDelta.upsertRecords = [
      normalizePressureRecord({
        ...pressure,
        lastUpdatedByOutcomeId: id,
        history: [
          {
            type: 'advanced-open-orders-scene',
            sceneBeatId: id,
            sceneId,
            sequence,
            intervalId: assignment.intervalId,
            sideAssignmentId: assignment.id,
            reason: reason || beatRecord.playerSummary
          }
        ]
      })
    ];
  }

  return {
    kind: 'directive.openOrdersAssignmentSceneBeatDelta',
    sceneRecord: cloneJson(sceneRecord),
    sceneBeat: cloneJson(beatRecord),
    assignment: cloneJson(assignment),
    sideAssignmentTemplate: cloneJson(template),
    interval: cloneJson(interval),
    pressureDelta
  };
}

export function applyOpenOrdersAssignmentSceneStart({
  campaignState,
  packageData,
  assignmentId = null,
  sceneId,
  sceneStartedAt = null,
  reason = null
} = {}) {
  const built = buildOpenOrdersAssignmentSceneStartDelta({
    campaignState,
    packageData,
    assignmentId,
    sceneId,
    sceneStartedAt,
    reason
  });
  const nextState = cloneJson(campaignState);
  const sideMissions = ensureSideMissions(nextState);

  applyPressureLedgerDelta(nextState, built.pressureDelta);
  sideMissions.availableAssignments = upsertById(sideMissions.availableAssignments, built.sceneRecord);
  sideMissions.activeAssignmentId = built.sceneRecord.id;
  sideMissions.activeAssignmentSceneId = built.sceneRecord.sceneStartedById;
  sideMissions.lastStartedAssignmentId = built.sceneRecord.id;

  const existingInterval = (sideMissions.openOrdersIntervals || [])
    .find((interval) => interval.id === built.sceneRecord.intervalId);
  sideMissions.openOrdersIntervals = upsertById(sideMissions.openOrdersIntervals, {
    ...(existingInterval || {}),
    id: built.sceneRecord.intervalId,
    title: built.sceneRecord.intervalTitle,
    status: existingInterval?.status || 'active',
    activeAssignmentId: built.sceneRecord.id,
    lastStartedAssignmentId: built.sceneRecord.id,
    lastStartedAt: built.sceneRecord.sceneStartedAt,
    rawValuesHidden: true
  });

  nextState.commandLog = nextState.commandLog || { entries: [], summariesGeneratedFromCommittedStateOnly: true };
  nextState.commandLog.entries = [
    ...(nextState.commandLog.entries || []),
    {
      id: `command-log.${built.sceneRecord.sceneStartedById}`,
      type: 'openOrdersAssignmentScene',
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
    kind: 'directive.committedOpenOrdersAssignmentSceneStart',
    sceneRecord: cloneJson(built.sceneRecord),
    sceneBrief: cloneJson(built.sceneBrief),
    pressureDelta: cloneJson(built.pressureDelta),
    campaignState: nextState
  };
}

export function applyOpenOrdersAssignmentSceneBeat({
  campaignState,
  packageData,
  assignmentId = null,
  beatId,
  beatAt = null,
  playerIntent = null,
  approach = 'coordination',
  reason = null
} = {}) {
  const built = buildOpenOrdersAssignmentSceneBeatDelta({
    campaignState,
    packageData,
    assignmentId,
    beatId,
    beatAt,
    playerIntent,
    approach,
    reason
  });
  const nextState = cloneJson(campaignState);
  const sideMissions = ensureSideMissions(nextState);

  applyPressureLedgerDelta(nextState, built.pressureDelta);
  sideMissions.availableAssignments = upsertById(sideMissions.availableAssignments, built.sceneRecord);
  sideMissions.activeAssignmentId = built.sceneRecord.id;
  sideMissions.activeAssignmentSceneId = built.sceneRecord.sceneStartedById;
  sideMissions.lastSceneBeatId = built.sceneBeat.id;

  const existingInterval = (sideMissions.openOrdersIntervals || [])
    .find((interval) => interval.id === built.sceneRecord.intervalId);
  sideMissions.openOrdersIntervals = upsertById(sideMissions.openOrdersIntervals, {
    ...(existingInterval || {}),
    id: built.sceneRecord.intervalId,
    title: built.sceneRecord.intervalTitle,
    status: existingInterval?.status || 'active',
    activeAssignmentId: built.sceneRecord.id,
    lastSceneBeatId: built.sceneBeat.id,
    lastSceneBeatAt: built.sceneBeat.beatAt,
    rawValuesHidden: true
  });

  nextState.commandLog = nextState.commandLog || { entries: [], summariesGeneratedFromCommittedStateOnly: true };
  nextState.commandLog.entries = [
    ...(nextState.commandLog.entries || []),
    {
      id: `command-log.${built.sceneBeat.id}`,
      type: 'openOrdersAssignmentSceneBeat',
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
    kind: 'directive.committedOpenOrdersAssignmentSceneBeat',
    sceneRecord: cloneJson(built.sceneRecord),
    sceneBeat: cloneJson(built.sceneBeat),
    pressureDelta: cloneJson(built.pressureDelta),
    campaignState: nextState
  };
}
