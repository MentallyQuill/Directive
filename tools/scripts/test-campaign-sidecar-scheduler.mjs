import assert from 'node:assert/strict';

import {
  createCampaignSidecarScheduler,
  __campaignSidecarSchedulerTestHooks
} from '../../src/jobs/campaign-sidecar-scheduler.mjs';
import { parseStateDeltaProposalOutput } from '../../src/jobs/sidecar-output-contracts.mjs';
import {
  createStateDeltaGateway,
  initializeCampaignRuntimeTracking,
  recordTurnIngress,
  updateTurnIngress
} from '../../src/runtime/state-delta-gateway.mjs';

const cloneJson = (value) => JSON.parse(JSON.stringify(value));
let tick = 0;
const now = () => `2026-06-22T06:00:${String(tick++).padStart(2, '0')}.000Z`;
let state = initializeCampaignRuntimeTracking({
  campaign: { id: 'campaign-sidecar-test', status: 'active' },
  player: { name: 'Talia Serrin', rank: 'Commander', billet: 'Executive Officer' },
  mission: { activeMissionId: 'chapter-1', activePhaseId: 'arrival', knownFacts: [] },
  ship: { condition: 'Operational', damage: [] },
  crew: { casualties: [] },
  relationships: { seniorCrew: [] },
  commandBearing: {},
  pressureLedger: { records: [] },
  questLedger: { instances: [] },
  attentionState: { foregroundQuestId: null },
  worldState: { locations: [], actors: [], factions: [] },
  storyArcLedger: { arcs: [] },
  eventLedger: { events: [] },
  threadLedger: { threads: [] },
  dynamicQuestCatalog: { templates: [] },
  knowledgeLedger: {
    facts: [],
    components: {
      schemaVersion: 1,
      records: [{
        id: 'component.prompt.coolant',
        title: 'Prompt Coolant Seal Component',
        type: 'shipIssue',
        status: 'unresolved',
        summary: 'The coolant seal replacement part is fabricated but installation is pending.',
        verbatim: 'Coolant seal replacement part fabricated. Installation pending.',
        sourceAuthority: 'officialPacket',
        tags: ['engineering'],
        links: {
          crewIds: [],
          shipSystemIds: ['ship.coolant-system'],
          missionIds: ['chapter-1'],
          componentIds: []
        },
        source: {
          host: 'sillytavern',
          chatId: 'campaign-chat',
          hostMessageId: 'assistant-prompt-component',
          messageRole: 'assistant',
          selectionHash: 'prompt-component-selection',
          textHash: 'prompt-component-text',
          sourceStatus: 'active'
        },
        lifecycle: {
          createdAt: '2026-06-22T05:59:00.000Z',
          updatedAt: '2026-06-22T05:59:00.000Z',
          createdBy: 'player',
          reviewed: true
        }
      }]
    }
  },
  commandLog: { entries: [] },
  continuity: { notes: [] }
});
const persisted = [];
const promptSyncs = [];

const strictForbidden = parseStateDeltaProposalOutput(JSON.stringify({
  operations: [
    { op: 'set', path: 'relationships.seniorCrew', value: [] }
  ]
}), {
  workerKey: 'ship',
  allowedRoots: ['ship'],
  baseRevision: 0
});
assert.equal(strictForbidden.ok, false);
assert.equal(strictForbidden.error.code, 'DIRECTIVE_SIDECAR_SCHEMA_PATH_FORBIDDEN');

const droppedForbidden = parseStateDeltaProposalOutput(JSON.stringify({
  operations: [
    { op: 'set', path: 'relationships.seniorCrew', value: [] },
    { op: 'set', path: 'ship.condition', value: 'Operational' }
  ]
}), {
  workerKey: 'ship',
  allowedRoots: ['ship'],
  baseRevision: 0,
  forbiddenPathPolicy: 'drop'
});
assert.equal(droppedForbidden.ok, true);
assert.deepEqual(droppedForbidden.value.operations.map((operation) => operation.path), ['ship.condition']);
assert.equal(droppedForbidden.diagnostics.schema.droppedForbiddenOperationCount, 1);
assert.equal(droppedForbidden.diagnostics.schema.droppedForbiddenOperations[0].path, 'relationships.seniorCrew');

const arrayLikeMerge = parseStateDeltaProposalOutput(JSON.stringify({
  operations: [
    { op: 'merge', path: 'mission.knownFacts', value: { 0: 'Array-like model output must use append, not merge.' } }
  ]
}), {
  workerKey: 'continuity',
  allowedRoots: ['mission'],
  baseRevision: 0
});
assert.equal(arrayLikeMerge.ok, false);
assert.equal(arrayLikeMerge.error.code, 'DIRECTIVE_SIDECAR_SCHEMA_ARRAY_MERGE_FORBIDDEN');

const knownArrayPathMerge = parseStateDeltaProposalOutput(JSON.stringify({
  operations: [
    { op: 'merge', path: 'crew.relationshipModel.dimensions', value: { trust: 'higher' } }
  ]
}), {
  workerKey: 'crew',
  allowedRoots: ['crew'],
  baseRevision: 0
});
assert.equal(knownArrayPathMerge.ok, false);
assert.equal(knownArrayPathMerge.error.code, 'DIRECTIVE_SIDECAR_SCHEMA_ARRAY_MERGE_FORBIDDEN');
assert.equal(knownArrayPathMerge.error.details.path, 'crew.relationshipModel.dimensions');

const malformedShipTechnicalDebtMerge = parseStateDeltaProposalOutput(
  '{"id":"ship-delta","operations":[{"op":"merge","path":"ship.technicalDebt","value":{"ship.command-network-certificate-compatibility":{"owner":"Commander Cross","status":"active"}},{"op":"append","path":"ship.damage","value":{"id":"damage-1","summary":"Minor damage."}}],"summary":"Recovered missing operation closer."}',
  {
    workerKey: 'ship',
    allowedRoots: ['ship'],
    baseRevision: 0
  }
);
assert.equal(malformedShipTechnicalDebtMerge.ok, false);
assert.equal(malformedShipTechnicalDebtMerge.error.code, 'DIRECTIVE_SIDECAR_SCHEMA_ARRAY_MERGE_FORBIDDEN');
assert.equal(malformedShipTechnicalDebtMerge.error.details.path, 'ship.technicalDebt');
assert.equal(malformedShipTechnicalDebtMerge.diagnostics.parse.ok, true);

const allowedUpsert = parseStateDeltaProposalOutput(JSON.stringify({
  operations: [
    {
      op: 'upsert',
      path: 'relationships.seniorCrew',
      identityKey: 'crewId',
      value: { crewId: 'chief-engineer', summary: 'The chief engineer trusts the commander under pressure.' }
    }
  ]
}), {
  workerKey: 'relationship',
  allowedRoots: ['relationships'],
  baseRevision: 0
});
assert.equal(allowedUpsert.ok, true);
assert.equal(allowedUpsert.value.operations[0].op, 'upsert');
assert.equal(allowedUpsert.value.operations[0].identityKey, 'crewId');

const componentProvenanceParse = parseStateDeltaProposalOutput(JSON.stringify({
  derivedFromComponentIds: ['component.prompt.coolant'],
  operations: [
    {
      op: 'append',
      path: 'ship.technicalDebt',
      sourceComponentIds: ['component.prompt.coolant'],
      value: { id: 'coolant-seal-work', summary: 'Coolant seal installation is pending.' }
    }
  ],
  summary: 'Promote a component-covered source into ship technical debt.'
}), {
  workerKey: 'ship',
  allowedRoots: ['ship'],
  baseRevision: 0
});
assert.equal(componentProvenanceParse.ok, true);
assert.deepEqual(componentProvenanceParse.value.derivedFromComponentIds, ['component.prompt.coolant']);
assert.deepEqual(componentProvenanceParse.value.operations[0].sourceComponentIds, ['component.prompt.coolant']);

const continuityPrompt = __campaignSidecarSchedulerTestHooks.proposalPrompt(
  'continuity',
  __campaignSidecarSchedulerTestHooks.WORKERS.continuity,
  state,
  {
    turnId: 'turn.prompt.continuity',
    outcomeId: 'outcome.prompt.continuity',
    continuityProjection: {
      kind: 'directive.continuityDirectorPacketDigest.v1',
      hash: 'matrix-digest-prompt',
      sourceHash: 'source-digest-prompt',
      selectedFactCount: 3
    }
  }
);
assert.match(continuityPrompt, /Array\/list fields must use append or upsert, never merge/);
assert.match(continuityPrompt, /mission\.knownFacts/);
assert.match(continuityPrompt, /crew\.relationshipModel\.dimensions/);
assert.match(continuityPrompt, /"continuityProjection"/);
assert.match(continuityPrompt, /matrix-digest-prompt/);
assert.match(continuityPrompt, /"missionComponents"/);
assert.match(continuityPrompt, /component\.prompt\.coolant/);
assert.match(continuityPrompt, /sourceComponentIds/);

const crewHydrationPrompt = __campaignSidecarSchedulerTestHooks.proposalPrompt(
  'crew',
  __campaignSidecarSchedulerTestHooks.WORKERS.crew,
  state,
  {
    turnId: 'turn.prompt.crew-hydration',
    outcomeId: 'outcome.prompt.crew-hydration',
    directorPackets: {
      crewDirector: {
        audience: 'crewDirector',
        runId: 'retrieval.prompt.crew-hydration',
        cardIds: ['crew.whitaker.voice.command-pressure'],
        hydratedCards: [{
          id: 'crew.whitaker.voice.command-pressure',
          type: 'crew.voice',
          visibility: 'playerKnown',
          narratorSafe: true,
          characters: ['mara-whitaker'],
          guidance: {
            summary: 'Whitaker is measured, attentive, and concise.',
            voiceCapsule: {
              coreEngine: 'Whitaker balances procedure, care, and institutional memory before she acts.',
              pressureShift: ['Under pressure, she gets quieter and asks shorter questions.'],
              warmthHumor: ['Her warmth arrives as precise support after someone has earned trust.'],
              exampleLineShapes: [{
                shape: 'I can work with an honest maybe; I cannot work with a decorative yes.',
                bibleAxes: ['warmth', 'role-pressure']
              }]
            }
          }
        }]
      }
    }
  }
);
assert.match(crewHydrationPrompt, /"directorCardHydration"/);
assert.match(crewHydrationPrompt, /Whitaker balances procedure, care, and institutional memory/);
assert.match(crewHydrationPrompt, /I can work with an honest maybe/);
assert.match(crewHydrationPrompt, /Example line shapes describe voice texture/);
assert.match(crewHydrationPrompt, /"directorRetrieval"/);
assert.doesNotMatch(crewHydrationPrompt, /"directorPackets"/);

const commandBearingPrompt = __campaignSidecarSchedulerTestHooks.proposalPrompt(
  'commandBearing',
  __campaignSidecarSchedulerTestHooks.WORKERS.commandBearing,
  state,
  {
    turnId: 'turn.prompt.command-bearing',
    outcomeId: 'outcome.prompt.command-bearing'
  }
);
assert.match(commandBearingPrompt, /Command Bearing evidence append shape/);
assert.match(commandBearingPrompt, /commandBearing\.evidenceLedger\.records/);
assert.match(commandBearingPrompt, /Do not use merge at commandBearing\.evidenceLedger\.records/);
assert.match(commandBearingPrompt, /Inspiration example:/);
assert.match(commandBearingPrompt, /Resolve example:/);
assert.match(commandBearingPrompt, /"primarySignal": "resolve"/);
assert.match(commandBearingPrompt, /Command Bearing track definitions:/);
assert.match(commandBearingPrompt, /Resolve: leadership through lawful authority, preparation, credible boundaries, discipline, deterrence, and accepted responsibility/);
assert.match(commandBearingPrompt, /Choose the primarySignal by the causal mechanism/);
assert.match(commandBearingPrompt, /Do not convert Resolve into Inspiration merely because the boundary is explained transparently/);
assert.match(commandBearingPrompt, /primarySignal must be exactly "inspiration" or "resolve"/);
assert.match(commandBearingPrompt, /criteria\.agency, criteria\.commitment, and criteria\.causality must be booleans/);
assert.match(commandBearingPrompt, /sourceOutcomeId must match the committed outcome id/);
assert.match(commandBearingPrompt, /Context\.narrativeRoots lists the only current quest, thread, story arc, and milestone ids you may cite/);
assert.match(commandBearingPrompt, /"narrativeRoots"/);
assert.match(commandBearingPrompt, /Return \{"operations":\[\]\} when the committed outcome is routine/);
assert.match(commandBearingPrompt, /"sourceOutcomeId": "outcome\.prompt\.command-bearing"/);
assert.doesNotMatch(commandBearingPrompt, /"path":"commandBearing\.example"/);

const getState = () => state;
const setState = (next) => { state = cloneJson(next); };
const persist = async (next, summary) => {
  state = cloneJson(next);
  persisted.push({
    revision: next.runtimeTracking?.revision || 0,
    summary: typeof summary === 'string' ? summary : summary?.summary || summary?.reason || ''
  });
};
const gateway = createStateDeltaGateway({ getState, setState, persist, now });

function recordSourceIngress(ingressId, {
  hostMessageId = ingressId,
  textHash = `${ingressId}-hash`,
  status = 'committed',
  outcomeId = null,
  sourceFrameId = null,
  sourceFrame = null,
  coreTransactionId = null
} = {}) {
  const frame = sourceFrame || (sourceFrameId ? {
    kind: 'directive.turnSourceFrame.v1',
    schemaVersion: 1,
    id: sourceFrameId,
    campaignId: 'campaign-sidecar-test',
    saveId: 'save-sidecar-test',
    chatId: 'campaign-chat',
    hostMessageId,
    textHash,
    selectedAssistantVariantHash: `${sourceFrameId}-selected-assistant-hash`,
    externalPromptEnvironmentRef: {
      kind: 'directive.externalPromptEnvironmentRef.v1',
      schemaVersion: 1,
      hash: 'b'.repeat(64),
      byteLength: 256,
      status: 'observed',
      observedAt: '2026-06-22T06:00:00.000Z',
      knownExternalPromptKeys: ['summaryception', '3_vectfox']
    },
    visibility: {
      visibilityMutationOnly: false,
      sourceMutation: false
    },
    rawPlayerText: `RAW_FRAME_TEXT_${ingressId}_MUST_NOT_PERSIST`,
    textPreview: `RAW_FRAME_PREVIEW_${ingressId}_MUST_NOT_PERSIST`
  } : null);
  state = recordTurnIngress(state, {
    id: ingressId,
    hostMessageId,
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-test',
    textHash,
    textPreview: `Source message for ${ingressId}.`,
    status,
    outcomeId,
    sourceFrameId,
    sourceFrame: frame,
    coreTransactionId
  });
}

const responses = [];
const generationRequests = [];
const coreDiagnostics = [];
const generationRouter = {
  async generate(roleId, request) {
    generationRequests.push({ roleId, request: cloneJson(request || {}) });
    const response = responses.shift();
    assert.ok(response, `Unexpected ${roleId} sidecar request.`);
    if (typeof response.beforeReturn === 'function') await response.beforeReturn();
    return {
      ok: response.ok !== false,
      response: response.ok === false ? null : {
        text: response.rawText !== undefined ? response.rawText : JSON.stringify(response.proposal)
      },
      error: response.ok === false ? { code: 'SIMULATED_FAILURE', message: 'Simulated provider failure.' } : null
    };
  }
};

const scheduler = createCampaignSidecarScheduler({
  generationRouter,
  stateDeltaGateway: gateway,
  getCampaignState: getState,
  setCampaignState: setState,
  persistCampaignState: persist,
  syncPromptContext: async (next, details, options = {}) => {
    promptSyncs.push({ revision: next.runtimeTracking.revision, workerKey: details.workerKey });
    options.activityReporter?.({
      phase: 'continuityProjectionBuilding',
      mode: options.activityMode || 'background',
      source: options.activitySource || 'sidecarPromptSync',
      workerKey: details.workerKey,
      ...(options.activityContext || {})
    });
    const synchronized = cloneJson(next);
    synchronized.campaignChatBinding = {
      ...(synchronized.campaignChatBinding || {}),
      promptContextRevision: (synchronized.campaignChatBinding?.promptContextRevision || 0) + 1
    };
    options.activityReporter?.({
      phase: 'continuityProjectionInstalled',
      mode: options.activityMode || 'background',
      source: options.activitySource || 'sidecarPromptSync',
      workerKey: details.workerKey,
      status: 'complete',
      revision: synchronized.campaignChatBinding.promptContextRevision,
      ...(options.activityContext || {})
    });
    return synchronized;
  },
  appendCoreDiagnostic: async (event) => {
    coreDiagnostics.push(cloneJson(event));
    return { ok: true };
  },
  now
});

const continuityProjectionDigest = {
  kind: 'directive.continuityDirectorPacketDigest.v1',
  audience: 'missionDirector',
  hash: 'matrix-digest-1',
  sourceHash: 'source-digest-1',
  selectedFactCount: 4,
  conflictCount: 0,
  selectedFactIdHashes: ['fact-hash-1']
};

recordSourceIngress('ingress-1', {
  outcomeId: 'outcome-1',
  sourceFrameId: 'frame-ingress-1',
  coreTransactionId: 'txn-ingress-1'
});
responses.push({
  proposal: {
    id: 'ship-proposal-valid',
    operations: [
      { op: 'set', path: 'ship.condition', value: 'Degraded but operational' },
      { op: 'append', path: 'ship.damage', value: { id: 'sensor-grid', summary: 'Sensor grid degraded.' } }
    ],
    summary: 'Record confirmed ship damage.'
  }
});
const firstActivityEvents = [];
let results = await scheduler.schedule({
  workerPlan: { ship: true },
  turnContext: {
    ingressId: 'ingress-1',
    turnId: 'turn-1',
    outcomeId: 'outcome-1',
    continuityProjection: continuityProjectionDigest,
    sourceAnchorRange: { startIndex: 4, endIndex: 5, rangeHash: 'range-ship-1' }
  },
  activityReporter: (event) => firstActivityEvents.push(cloneJson(event))
});
assert.equal(results[0].status, 'applied');
assert.deepEqual(firstActivityEvents.map((event) => event.phase), [
  'sidecarsQueued',
  'sidecarsRunning',
  'sidecarWorker',
  'continuityProjectionBuilding',
  'continuityProjectionInstalled',
  'sidecarWorker',
  'sidecarsSettled'
]);
assert.deepEqual(firstActivityEvents[0].requested, ['ship']);
assert.equal(firstActivityEvents[2].workerKey, 'ship');
assert.equal(firstActivityEvents[2].status, 'running');
assert.equal(firstActivityEvents[3].source, 'campaignSidecarScheduler');
assert.equal(firstActivityEvents[3].mode, 'background');
assert.equal(firstActivityEvents[3].workerKey, 'ship');
assert.equal(firstActivityEvents[4].source, 'campaignSidecarScheduler');
assert.equal(firstActivityEvents[4].status, 'complete');
assert.equal(firstActivityEvents[5].workerKey, 'ship');
assert.equal(firstActivityEvents[5].status, 'applied');
assert.equal(firstActivityEvents.at(-1).mode, 'background');
assert.equal(generationRequests.at(-1).request.prompt.includes('"continuityProjection"'), true);
assert.equal(generationRequests.at(-1).request.prompt.includes('matrix-digest-1'), true);
assert.equal(state.ship.condition, 'Degraded but operational');
assert.equal(state.ship.damage.length, 1);
assert.equal(state.runtimeTracking.revision, 1);
assert.equal(state.campaignChatBinding.promptContextRevision, 1);
assert.deepEqual(promptSyncs, [{ revision: 1, workerKey: 'ship' }]);
assert.equal(state.runtimeTracking.sidecarJournal.at(-1).status, 'applied');
assert.equal(state.runtimeTracking.sidecarJournal.at(-1).workerId, 'ship');
assert.equal(state.runtimeTracking.sidecarJournal.at(-1).ingressId, 'ingress-1');
assert.equal(state.runtimeTracking.sidecarJournal.at(-1).turnId, 'turn-1');
assert.equal(state.runtimeTracking.sidecarJournal.at(-1).outcomeId, 'outcome-1');
assert.equal(state.runtimeTracking.sidecarJournal.at(-1).anchorRangeHash, 'range-ship-1');
assert.deepEqual(state.runtimeTracking.sidecarJournal.at(-1).diagnostics.continuityProjection, continuityProjectionDigest);
assert.deepEqual(__campaignSidecarSchedulerTestHooks.WORKERS.ship.allowedRoots, ['ship']);
await scheduler.pending();
const firstShipDiagnostics = coreDiagnostics.filter((entry) => entry.worker === 'ship' && entry.ingressId === 'ingress-1');
assert.deepEqual(firstShipDiagnostics.map((entry) => entry.status), ['queued', 'running', 'applied']);
assert.equal(firstShipDiagnostics.every((entry) => entry.roleId === 'shipDirector'), true);
assert.equal(firstShipDiagnostics.every((entry) => entry.sourceFrameId === 'frame-ingress-1'), true);
assert.equal(firstShipDiagnostics.every((entry) => entry.sourceFrameRef?.kind === 'directive.turnSourceFrameRef.v1'), true);
assert.equal(firstShipDiagnostics.every((entry) => entry.sourceFrameRef?.id === 'frame-ingress-1'), true);
assert.equal(firstShipDiagnostics.every((entry) => entry.sourceFrameRef?.textHash === 'ingress-1-hash'), true);
assert.equal(firstShipDiagnostics.every((entry) => entry.sourceFrameRef?.externalPromptEnvironmentRef?.knownExternalPromptKeys.includes('summaryception')), true);
assert.equal(firstShipDiagnostics.every((entry) => entry.sourceToken === 'turnSourceFrame:frame-ingress-1'), true);
assert.equal(firstShipDiagnostics.every((entry) => entry.coreTransactionId === 'txn-ingress-1'), true);
assert.equal(JSON.stringify(firstShipDiagnostics).includes('Return one strict JSON state-delta proposal'), false, 'CORE sidecar diagnostics must not include raw sidecar prompts.');
assert.equal(JSON.stringify(firstShipDiagnostics).includes('RAW_FRAME_TEXT_ingress-1_MUST_NOT_PERSIST'), false, 'CORE sidecar diagnostics must not include raw Frame text.');
assert.equal(JSON.stringify(firstShipDiagnostics).includes('RAW_FRAME_PREVIEW_ingress-1_MUST_NOT_PERSIST'), false, 'CORE sidecar diagnostics must not include raw Frame previews.');

state.knowledgeLedger.components.records.push({
  id: 'component.source.coolant',
  title: 'Source Coolant Seal Component',
  type: 'shipIssue',
  status: 'unresolved',
  summary: 'The coolant seal replacement part is fabricated but installation remains pending.',
  verbatim: 'Replacement part fabricated. Installation pending.',
  sourceAuthority: 'officialPacket',
  tags: ['engineering'],
  links: {
    crewIds: [],
    shipSystemIds: ['ship.coolant-system'],
    missionIds: ['chapter-1'],
    componentIds: []
  },
  source: {
    host: 'sillytavern',
    chatId: 'campaign-chat',
    hostMessageId: 'assistant-component-source',
    messageRole: 'assistant',
    ingressId: 'ingress-component-source',
    outcomeId: 'outcome-component-source',
    selectionHash: 'component-source-selection',
    textHash: 'component-source-text',
    sourceStatus: 'active'
  },
  lifecycle: {
    createdAt: '2026-06-22T06:00:10.000Z',
    updatedAt: '2026-06-22T06:00:10.000Z',
    createdBy: 'player',
    reviewed: true
  }
});
recordSourceIngress('ingress-component-source', {
  hostMessageId: 'player-component-source',
  outcomeId: 'outcome-component-source'
});
responses.push({
  proposal: {
    id: 'ship-proposal-component-source',
    operations: [
      {
        op: 'append',
        path: 'ship.technicalDebt',
        value: {
          id: 'tech-debt-coolant-seal-installation',
          summary: 'Coolant seal installation remains pending.'
        }
      }
    ],
    summary: 'Promote component-covered coolant source into ship technical debt.'
  }
});
results = await scheduler.schedule({
  workerPlan: { ship: true },
  turnContext: {
    ingressId: 'ingress-component-source',
    turnId: 'turn-component-source',
    outcomeId: 'outcome-component-source',
    responseMessageId: 'assistant-component-source'
  }
});
assert.equal(results[0].status, 'applied');
assert.deepEqual(state.ship.technicalDebt.at(-1).sourceComponentIds, ['component.source.coolant']);
assert.deepEqual(results[0].proposal.derivedFromComponentIds, ['component.source.coolant']);
assert.equal(state.runtimeTracking.sidecarJournal.at(-1).diagnostics.feature.missionComponents.stampedOperationCount, 1);
assert.deepEqual(state.runtimeTracking.sidecarJournal.at(-1).diagnostics.feature.missionComponents.matchedSourceComponentIds, ['component.source.coolant']);

recordSourceIngress('ingress-2');
responses.push({
  proposal: {
    id: 'ship-proposal-unauthorized',
    operations: [
      { op: 'set', path: 'relationships.seniorCrew', value: [] }
    ],
    summary: 'Attempt an unauthorized relationship rewrite.'
  }
});
results = await scheduler.schedule({
  workerPlan: { ship: true },
  turnContext: { ingressId: 'ingress-2' }
});
assert.equal(results[0].status, 'noChange');
assert.equal(state.runtimeTracking.revision, 2, 'Out-of-scope-only sidecars must not advance campaign mechanics revision.');
assert.equal(state.runtimeTracking.sidecarJournal.at(-1).status, 'noChange');
assert.equal(state.runtimeTracking.sidecarJournal.at(-1).diagnostics.parse.ok, true);
assert.equal(state.runtimeTracking.sidecarJournal.at(-1).diagnostics.schema.ok, true);
assert.equal(state.runtimeTracking.sidecarJournal.at(-1).diagnostics.schema.droppedForbiddenOperationCount, 1);
assert.equal(state.runtimeTracking.sidecarJournal.at(-1).diagnostics.apply.skipped, true);
assert.equal(coreDiagnostics.some((entry) => entry.ingressId === 'ingress-2'), false, 'Sidecars without a CORE transaction must not emit CORE diagnostics.');

recordSourceIngress('ingress-provider-failed', {
  outcomeId: 'outcome-provider-failed',
  sourceFrameId: 'frame-provider-failed',
  coreTransactionId: 'txn-provider-failed'
});
responses.push({ ok: false });
results = await scheduler.schedule({
  workerPlan: { crew: true },
  turnContext: {
    ingressId: 'ingress-provider-failed',
    turnId: 'turn-provider-failed',
    outcomeId: 'outcome-provider-failed'
  }
});
assert.equal(results[0].status, 'failed');
assert.equal(results[0].error.code, 'SIMULATED_FAILURE');
await scheduler.pending();
const failedDiagnostics = coreDiagnostics.filter((entry) => entry.ingressId === 'ingress-provider-failed');
assert.deepEqual(failedDiagnostics.map((entry) => entry.status), ['queued', 'running', 'failed']);
assert.equal(failedDiagnostics.at(-1).errorCode, 'SIMULATED_FAILURE');

recordSourceIngress('ingress-2b');
responses.push({
  proposal: {
    id: 'crew-proposal-no-change',
    operations: [],
    summary: 'No crew update warranted.'
  }
});
results = await scheduler.schedule({
  workerPlan: { crew: true },
  turnContext: { ingressId: 'ingress-2b' }
});
assert.equal(results[0].status, 'noChange');
assert.equal(state.runtimeTracking.revision, 2, 'No-op sidecars must not advance campaign mechanics revision.');
assert.equal(state.runtimeTracking.sidecarJournal.at(-1).status, 'noChange');
assert.equal(state.runtimeTracking.sidecarJournal.at(-1).diagnostics.schema.ok, true);
assert.equal(state.runtimeTracking.sidecarJournal.at(-1).diagnostics.apply.skipped, true);

recordSourceIngress('ingress-2c', {
  outcomeId: 'outcome-2c',
  sourceFrameId: 'frame-ingress-2c',
  coreTransactionId: 'txn-ingress-2c'
});
responses.push({
  rawText: 'not json'
});
results = await scheduler.schedule({
  workerPlan: { crew: true },
  turnContext: {
    ingressId: 'ingress-2c',
    turnId: 'turn-2c',
    outcomeId: 'outcome-2c'
  }
});
assert.equal(results[0].status, 'rejected');
assert.equal(results[0].error.code, 'DIRECTIVE_SIDECAR_JSON_INVALID');
assert.equal(state.runtimeTracking.revision, 2, 'Invalid JSON sidecars must not advance campaign mechanics revision.');
assert.equal(state.runtimeTracking.sidecarJournal.at(-1).diagnostics.parse.ok, false);
await scheduler.pending();
const rejectedDiagnostics = coreDiagnostics.filter((entry) => entry.ingressId === 'ingress-2c');
assert.deepEqual(rejectedDiagnostics.map((entry) => entry.status), ['queued', 'running', 'rejected']);
assert.equal(rejectedDiagnostics.at(-1).errorCode, 'DIRECTIVE_SIDECAR_JSON_INVALID');

recordSourceIngress('ingress-3');
responses.push({
  beforeReturn: async () => {
    const next = cloneJson(state);
    next.mission.knownFacts.push('A newer committed fact arrived while the sidecar was running.');
    await gateway.commit(next, {
      source: 'test-concurrent-turn',
      reason: 'Advance revision during sidecar generation.',
      summary: 'Concurrent authoritative update.',
      domains: ['mission'],
      stable: true
    });
  },
  proposal: {
    id: 'continuity-proposal-stale',
    operations: [
      { op: 'append', path: 'continuity.notes', value: 'Stale continuity proposal.' }
    ],
    summary: 'This proposal should lose its revision race.'
  }
});
results = await scheduler.schedule({
  workerPlan: { continuity: true },
  turnContext: { ingressId: 'ingress-3' }
});
assert.equal(results[0].status, 'rejected');
assert.equal(results[0].error.code, 'DIRECTIVE_STATE_REVISION_CONFLICT');
assert.equal(state.runtimeTracking.revision, 3);
assert.equal(state.continuity.notes.length, 0);
assert.equal(state.runtimeTracking.sidecarJournal.at(-1).status, 'rejected');
assert.equal(promptSyncs.length, 2, 'Rejected or stale sidecars must not rebuild prompt context.');
assert.equal(persisted.length > 0, true);

state = recordTurnIngress(state, {
  id: 'ingress-stale-edit',
  hostMessageId: 'player-stale-edit',
  chatId: 'campaign-chat',
  campaignId: 'campaign-sidecar-test',
  textHash: 'hash-before-edit',
  textPreview: 'Original order with typo.',
  status: 'committed',
  outcomeId: 'outcome-stale-edit',
  sourceFrameId: 'frame-stale-edit',
  coreTransactionId: 'txn-stale-edit'
});
const revisionBeforeStaleSource = state.runtimeTracking.revision;
responses.push({
  beforeReturn: async () => {
    state = updateTurnIngress(state, 'ingress-stale-edit', {
      status: 'invalidated',
      invalidatedAt: '2026-06-22T06:00:20.000Z',
      invalidationType: 'playerMessageEdited',
      replacementText: 'Corrected order.',
      textHash: 'hash-after-edit'
    });
  },
  proposal: {
    id: 'ship-proposal-stale-source',
    operations: [
      { op: 'append', path: 'ship.damage', value: { id: 'stale-edit', summary: 'This stale sidecar must not apply.' } }
    ],
    summary: 'This proposal targets an edited player message.'
  }
});
results = await scheduler.schedule({
  workerPlan: { ship: true },
  turnContext: {
    ingressId: 'ingress-stale-edit',
    turnId: 'turn-stale-edit',
    outcomeId: 'outcome-stale-edit'
  }
});
assert.equal(results[0].status, 'rejected');
assert.equal(results[0].error.code, 'DIRECTIVE_SIDECAR_SOURCE_STALE');
assert.equal(state.runtimeTracking.revision, revisionBeforeStaleSource, 'Stale-source sidecars must not advance campaign revision.');
assert.equal(state.ship.damage.some((entry) => entry.id === 'stale-edit'), false);
assert.equal(state.runtimeTracking.sidecarJournal.at(-1).status, 'rejected');
assert.equal(state.runtimeTracking.sidecarJournal.at(-1).error.code, 'DIRECTIVE_SIDECAR_SOURCE_STALE');
assert.equal(promptSyncs.length, 2, 'Source-stale sidecars must not rebuild prompt context.');
await scheduler.pending();
const staleDiagnostics = coreDiagnostics.filter((entry) => entry.ingressId === 'ingress-stale-edit');
assert.deepEqual(staleDiagnostics.map((entry) => entry.status), ['queued', 'running', 'stale']);
assert.equal(staleDiagnostics.at(-1).resultStatus, 'rejected');
assert.equal(staleDiagnostics.at(-1).errorCode, 'DIRECTIVE_SIDECAR_SOURCE_STALE');
assert.deepEqual(staleDiagnostics.at(-1).staleReasons, ['status:invalidated', 'invalidated', 'text-hash-changed']);
assert.equal(staleDiagnostics.at(-1).sourceFrameRef.id, 'frame-stale-edit');
assert.equal(staleDiagnostics.at(-1).sourceToken, 'turnSourceFrame:frame-stale-edit');
assert.equal(JSON.stringify(staleDiagnostics).includes('RAW_FRAME_TEXT_ingress-stale-edit_MUST_NOT_PERSIST'), false);

recordSourceIngress('ingress-continuity-commandlog-drop', { outcomeId: 'outcome-continuity-commandlog-drop' });
const revisionBeforeContinuityDrop = state.runtimeTracking.revision;
const commandLogBeforeContinuityDrop = state.commandLog.entries.length;
responses.push({
  proposal: {
    id: 'continuity-commandlog-drop',
    operations: [
      { op: 'append', path: 'continuity.notes', value: 'Serrin kept the bridge watch disciplined after the handoff.' },
      {
        op: 'append',
        path: 'commandLog.entries',
        value: {
          turnId: 'turn-continuity-commandlog-drop',
          classification: 'consequentialCommand',
          summaryInputs: ['Duplicative sidecar Command Log row.'],
          visibleConsequences: []
        }
      }
    ],
    summary: 'Record continuity without rewriting Command Log.'
  }
});
results = await scheduler.schedule({
  workerPlan: { continuity: true },
  turnContext: {
    ingressId: 'ingress-continuity-commandlog-drop',
    turnId: 'turn-continuity-commandlog-drop',
    outcomeId: 'outcome-continuity-commandlog-drop'
  }
});
assert.equal(results[0].status, 'applied');
assert.equal(state.runtimeTracking.revision, revisionBeforeContinuityDrop + 1);
assert.equal(state.continuity.notes.at(-1), 'Serrin kept the bridge watch disciplined after the handoff.');
assert.equal(state.commandLog.entries.length, commandLogBeforeContinuityDrop, 'continuity sidecars must not append Command Log entries');
assert.equal(state.runtimeTracking.sidecarJournal.at(-1).workerId, 'continuity');
assert.equal(state.runtimeTracking.sidecarJournal.at(-1).diagnostics.schema.droppedForbiddenOperationCount, 1);
assert.equal(state.runtimeTracking.sidecarJournal.at(-1).diagnostics.schema.droppedForbiddenOperations[0].path, 'commandLog.entries');

{
  let reviewState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-command-bearing-review-test', status: 'active' },
    player: { name: 'Talia Serrin', rank: 'Commander', billet: 'Executive Officer' },
    mission: { activeMissionId: 'chapter-1', activePhaseId: 'arrival', knownFacts: [] },
    ship: { condition: 'Operational', damage: [] },
    crew: { casualties: [] },
    relationships: { seniorCrew: [] },
    commandBearing: {},
    pressureLedger: { records: [] },
    questLedger: { instances: [] },
    attentionState: { foregroundQuestId: null },
    worldState: { locations: [], actors: [], factions: [] },
    storyArcLedger: {
      arcs: [{ id: 'arc.sidecar', status: 'active', completedMilestoneIds: ['milestone.sidecar.resolve'] }],
      milestones: [{
        id: 'milestone.sidecar.resolve',
        arcId: 'arc.sidecar',
        status: 'complete',
        sourceEventIds: ['event.outcome.sidecar.resolve']
      }]
    },
    eventLedger: { events: [] },
    threadLedger: { records: [] },
    dynamicQuestCatalog: { templates: [] },
    knowledgeLedger: { facts: [] },
    commandLog: { entries: [] },
    continuity: { notes: [] }
  });
  reviewState = recordTurnIngress(reviewState, {
    id: 'ingress-sidecar-command-bearing-review',
    hostMessageId: 'player-sidecar-command-bearing-review',
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-command-bearing-review-test',
    textHash: 'command-bearing-review-source-hash',
    textPreview: 'Source message for Command Bearing evidence.',
    status: 'committed',
    outcomeId: 'outcome.sidecar.resolve'
  });
  const reviewGateway = createStateDeltaGateway({
    getState: () => reviewState,
    setState: (next) => { reviewState = cloneJson(next); },
    persist: async (next) => { reviewState = cloneJson(next); },
    now
  });
  const reviewCalls = [];
  const reviewScheduler = createCampaignSidecarScheduler({
    generationRouter: {
      async generate(roleId, request) {
        reviewCalls.push({ roleId, request });
        if (reviewCalls.length === 1) {
          return {
            ok: true,
            response: {
              text: JSON.stringify({
                id: 'command-bearing-sidecar-evidence',
                operations: [{
                  op: 'append',
                  path: 'commandBearing.evidenceLedger.records',
                  value: {
                    id: 'bearing-evidence.sidecar.resolve',
                    sourceOutcomeId: 'outcome.sidecar.resolve',
                    sourceTurnId: 'turn.sidecar.resolve',
                    primarySignal: 'resolve',
                    trackSignals: ['resolve'],
                    strength: 'strong',
                    criteria: { agency: true, commitment: true, causality: true },
                    actionSummary: 'Held a lawful operating boundary through visible cost.',
                    consequenceSummary: 'The same committed outcome completed the active milestone.',
                    playerFacingSummary: 'This may support Resolve because the command preserved a lawful boundary under cost.',
                    visible: true,
                    status: 'open'
                  }
                }],
                summary: 'Record Resolve evidence from the committed outcome.'
              })
            }
          };
        }
        assert.equal(roleId, 'commandBearingEvaluator');
        assert.match(request.prompt, /milestone\.sidecar\.resolve/);
        return {
          ok: true,
          response: {
            text: JSON.stringify({
              closureId: 'closure.milestone.milestone.sidecar.resolve.1',
              markAwarded: true,
              awardedTrack: 'resolve',
              criteriaSatisfied: { agency: true, commitment: true, causality: true },
              evidenceIds: ['bearing-evidence.sidecar.resolve'],
              awardSummary: 'The commander accepted visible operational cost to preserve a lawful command boundary.'
            })
          },
          diagnostics: { providerId: 'fake-command-bearing-reviewer' }
        };
      }
    },
    stateDeltaGateway: reviewGateway,
    getCampaignState: () => reviewState,
    setCampaignState: (next) => { reviewState = cloneJson(next); },
    persistCampaignState: async (next) => { reviewState = cloneJson(next); },
    now
  });
  const reviewResults = await reviewScheduler.schedule({
    workerPlan: { commandBearing: true },
    turnContext: {
      ingressId: 'ingress-sidecar-command-bearing-review',
      turnId: 'turn.sidecar.resolve',
      outcomeId: 'outcome.sidecar.resolve'
    }
  });
  assert.equal(reviewResults[0].status, 'applied');
  assert.equal(reviewCalls.length, 2, 'accepted Command Bearing evidence should trigger same-source closure review');
  assert.equal(reviewState.commandBearing.evidenceLedger.records.length, 1);
  assert.equal(reviewState.commandBearing.reviewLedger.records.length, 1);
  assert.equal(reviewState.commandBearing.reviewLedger.records[0].awardedTrack, 'resolve');
  assert.equal(reviewState.commandBearing.tracks.resolve.marks, 1);
  const reviewJournal = reviewState.runtimeTracking.sidecarJournal.at(-1);
  assert.equal(reviewJournal.workerId, 'commandBearing');
  assert.equal(reviewJournal.diagnostics.feature.commandBearingReview.status, 'appliedReviews');
  assert.equal(reviewJournal.diagnostics.feature.commandBearingReview.reviewPlan.reviewQueue.length, 1);
}

{
  let batchState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-batch-test', status: 'active' },
    player: { name: 'Talia Serrin', rank: 'Commander', billet: 'Executive Officer' },
    mission: { activeMissionId: 'chapter-1', activePhaseId: 'arrival', knownFacts: [] },
    ship: { condition: 'Operational', damage: [] },
    crew: { casualties: [] },
    relationships: { seniorCrew: [] },
    commandBearing: {},
    pressureLedger: { records: [] },
    commandLog: { entries: [] },
    continuity: { notes: [] }
  });
  batchState = recordTurnIngress(batchState, {
    id: 'ingress-batch-1',
    hostMessageId: 'player-batch-1',
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-batch-test',
    textHash: 'batch-source-hash',
    textPreview: 'Source message for batch sidecars.',
    status: 'committed',
    outcomeId: 'outcome-batch-1',
    sourceFrameId: 'frame-batch-1',
    sourceFrame: {
      kind: 'directive.turnSourceFrame.v1',
      schemaVersion: 1,
      id: 'frame-batch-1',
      campaignId: 'campaign-sidecar-batch-test',
      saveId: 'save-sidecar-batch-test',
      chatId: 'campaign-chat',
      hostMessageId: 'player-batch-1',
      textHash: 'batch-source-hash',
      selectedAssistantVariantHash: 'batch-selected-assistant-hash',
      externalPromptEnvironmentRef: {
        kind: 'directive.externalPromptEnvironmentRef.v1',
        schemaVersion: 1,
        hash: 'c'.repeat(64),
        byteLength: 384,
        status: 'observed',
        observedAt: '2026-06-22T06:01:00.000Z',
        knownExternalPromptKeys: ['worldInfoBefore', 'summaryception']
      },
      rawPlayerText: 'RAW_BATCH_FRAME_TEXT_MUST_NOT_PERSIST'
    },
    coreTransactionId: 'txn-batch-1'
  });
  const batchCalls = [];
  const batchApplyCalls = [];
  const batchPromptSyncs = [];
  const batchCoreBackgroundBatches = [];
  const batchGateway = createStateDeltaGateway({
    getState: () => batchState,
    setState: (next) => { batchState = cloneJson(next); },
    persist: async (next) => { batchState = cloneJson(next); },
    now
  });
  const originalBatchApplyOperations = batchGateway.applyOperations;
  batchGateway.applyOperations = async (proposal, policy) => {
    batchApplyCalls.push({ proposal: cloneJson(proposal), policy: cloneJson(policy || {}) });
    return originalBatchApplyOperations(proposal, policy);
  };
  const proposalsByRole = {
    relationshipEvaluator: {
      id: 'relationship-batch-proposal',
      operations: [
        { op: 'append', path: 'relationships.seniorCrew', value: { id: 'xo-chief', summary: 'The chief engineer trusts the commander under pressure.' } }
      ],
      summary: 'Record relationship movement.'
    },
    crewDirector: {
      id: 'crew-batch-proposal',
      operations: [
        { op: 'append', path: 'crew.casualties', value: { id: 'crew-bruise-1', summary: 'One crew member took a minor injury.' } }
      ],
      summary: 'Record a minor crew injury.'
    },
    shipDirector: {
      id: 'ship-batch-proposal',
      operations: [
        { op: 'set', path: 'ship.condition', value: 'Damaged but mobile' }
      ],
      summary: 'Record ship damage.'
    }
  };
  const batchScheduler = createCampaignSidecarScheduler({
    generationRouter: {
      async generate() {
        assert.fail('Multiple requested campaign sidecars should use the batch generation path.');
      },
      async batch(requests, options) {
        batchCalls.push({ requests, options });
        return requests.map((request) => ({
          ok: true,
          response: {
            text: JSON.stringify(proposalsByRole[request.roleId])
          },
          diagnostics: {
            providerId: 'batch-test-provider',
            latencyMs: 25
          }
        }));
      }
    },
    stateDeltaGateway: batchGateway,
    getCampaignState: () => batchState,
    setCampaignState: (next) => { batchState = cloneJson(next); },
    persistCampaignState: async (next) => { batchState = cloneJson(next); },
    syncPromptContext: async (next, details) => {
      batchPromptSyncs.push({ revision: next.runtimeTracking.revision, details: cloneJson(details) });
      const synchronized = cloneJson(next);
      synchronized.campaignChatBinding = {
        ...(synchronized.campaignChatBinding || {}),
        promptContextRevision: (synchronized.campaignChatBinding?.promptContextRevision || 0) + 1
      };
      return synchronized;
    },
    commitCoreBackgroundBatch: async (transactionId, bundle) => {
      batchCoreBackgroundBatches.push({ transactionId, bundle: cloneJson(bundle) });
      return { transactionId, ok: true };
    },
    now
  });
  const batchResults = await batchScheduler.schedule({
    workerPlan: { relationship: true, crew: true, ship: true },
    turnContext: {
      ingressId: 'ingress-batch-1',
      turnId: 'turn-batch-1',
      outcomeId: 'outcome-batch-1'
    }
  });
  assert.deepEqual(batchCalls[0].requests.map((request) => request.roleId), [
    'relationshipEvaluator',
    'crewDirector',
    'shipDirector'
  ]);
  assert.equal(batchCalls[0].requests.every((request) => /strict JSON-safe/.test(request.request.prompt)), true);
  assert.equal(batchCalls[0].options.concurrent, true);
  assert.deepEqual(batchResults.map((result) => result.status), ['applied', 'applied', 'applied']);
  assert.equal(batchApplyCalls.length, 1);
  assert.deepEqual(batchApplyCalls[0].proposal.workerId, 'campaignSidecarBatch');
  assert.equal(batchApplyCalls[0].proposal.operations.length, 3);
  assert.deepEqual(batchApplyCalls[0].policy.allowedRoots.sort(), ['crew', 'relationships', 'ship']);
  assert.equal(batchPromptSyncs.length, 1);
  assert.equal(batchPromptSyncs[0].details.workerKey, 'campaignSidecarBatch');
  assert.deepEqual(batchPromptSyncs[0].details.workerKeys, ['relationship', 'crew', 'ship']);
  assert.equal(batchCoreBackgroundBatches.length, 1);
  assert.equal(batchCoreBackgroundBatches[0].transactionId, 'txn-batch-1');
  assert.equal(batchCoreBackgroundBatches[0].bundle.sourceToken, 'turnSourceFrame:frame-batch-1');
  assert.equal(batchCoreBackgroundBatches[0].bundle.sourceFrameRef.id, 'frame-batch-1');
  assert.equal(batchCoreBackgroundBatches[0].bundle.sourceFrameRef.textHash, 'batch-source-hash');
  assert.equal(batchCoreBackgroundBatches[0].bundle.sourceFrameRef.selectedAssistantVariantHash, 'batch-selected-assistant-hash');
  assert.equal(batchCoreBackgroundBatches[0].bundle.sourceFrameRef.externalPromptEnvironmentRef.knownExternalPromptKeys.includes('summaryception'), true);
  assert.equal(batchCoreBackgroundBatches[0].bundle.operations.length, 3);
  assert.deepEqual(batchCoreBackgroundBatches[0].bundle.workers.map((entry) => entry.workerId), ['relationship', 'crew', 'ship']);
  assert.equal(JSON.stringify(batchCoreBackgroundBatches).includes('RAW_BATCH_FRAME_TEXT_MUST_NOT_PERSIST'), false);
  assert.equal(batchState.runtimeTracking.revision, 1);
  assert.equal(batchState.campaignChatBinding.promptContextRevision, 1);
  assert.equal(batchState.relationships.seniorCrew.length, 1);
  assert.equal(batchState.crew.casualties.length, 1);
  assert.equal(batchState.ship.condition, 'Damaged but mobile');
  const batchJournal = batchState.runtimeTracking.sidecarJournal.slice(-3);
  assert.deepEqual(batchJournal.map((entry) => entry.status), ['applied', 'applied', 'applied']);
  assert.deepEqual(batchJournal.map((entry) => entry.diagnostics.sidecarGeneration.rebased), [false, false, false]);
  assert.equal(batchJournal.every((entry) => entry.diagnostics.sidecarGeneration.aggregateBatch === true), true);
  assert.equal(batchJournal.every((entry) => entry.diagnostics.sidecarGeneration.aggregateWorkerCount === 3), true);
  assert.equal(batchJournal.every((entry) => entry.diagnostics.source.sourceFrameRef.id === 'frame-batch-1'), true);
  assert.equal(batchJournal.every((entry) => entry.diagnostics.source.sourceToken === 'turnSourceFrame:frame-batch-1'), true);
  assert.equal(JSON.stringify(batchJournal).includes('RAW_BATCH_FRAME_TEXT_MUST_NOT_PERSIST'), false);
}

{
  let conflictState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-conflict-test', status: 'active' },
    mission: { activeMissionId: 'chapter-1', activePhaseId: 'arrival', knownFacts: [] },
    ship: { condition: 'Operational', damage: [] },
    crew: { casualties: [] },
    relationships: { seniorCrew: [] },
    commandBearing: {},
    pressureLedger: { records: [] },
    commandLog: { entries: [] },
    continuity: { notes: [] }
  });
  conflictState = recordTurnIngress(conflictState, {
    id: 'ingress-conflict-1',
    hostMessageId: 'player-conflict-1',
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-conflict-test',
    textHash: 'conflict-source-hash',
    textPreview: 'Source message for conflicting sidecars.',
    status: 'committed',
    outcomeId: 'outcome-conflict-1'
  });
  const conflictGateway = createStateDeltaGateway({
    getState: () => conflictState,
    setState: (next) => { conflictState = cloneJson(next); },
    persist: async (next) => { conflictState = cloneJson(next); },
    now
  });
  const conflictApplyCalls = [];
  const conflictPromptSyncs = [];
  const conflictCoreBackgroundBatches = [];
  const originalConflictApplyOperations = conflictGateway.applyOperations;
  conflictGateway.applyOperations = async (proposal, policy) => {
    conflictApplyCalls.push({ proposal: cloneJson(proposal), policy: cloneJson(policy || {}) });
    return originalConflictApplyOperations(proposal, policy);
  };
  const conflictScheduler = createCampaignSidecarScheduler({
    generationRouter: {
      async generate() {
        assert.fail('Multiple requested campaign sidecars should use the batch generation path.');
      },
      async batch(requests) {
        return requests.map((request) => ({
          ok: true,
          response: {
            text: JSON.stringify({
              id: `${request.roleId}-conflict-proposal`,
              operations: [
                { op: 'append', path: 'crew.casualties', value: { id: request.roleId, summary: 'Conflicting crew casualty write.' } }
              ],
              summary: 'Write the same crew path.'
            })
          }
        }));
      }
    },
    stateDeltaGateway: conflictGateway,
    getCampaignState: () => conflictState,
    setCampaignState: (next) => { conflictState = cloneJson(next); },
    persistCampaignState: async (next) => { conflictState = cloneJson(next); },
    syncPromptContext: async (next, details) => {
      conflictPromptSyncs.push({ revision: next.runtimeTracking.revision, details: cloneJson(details) });
      return next;
    },
    commitCoreBackgroundBatch: async (transactionId, bundle) => {
      conflictCoreBackgroundBatches.push({ transactionId, bundle: cloneJson(bundle) });
      return { ok: true };
    },
    now
  });
  const conflictResults = await conflictScheduler.schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: { ingressId: 'ingress-conflict-1' }
  });
  assert.deepEqual(conflictResults.map((result) => result.status), ['rejected', 'rejected']);
  assert.equal(conflictResults.every((result) => result.error.code === 'DIRECTIVE_SIDECAR_BATCH_PATH_CONFLICT'), true);
  assert.equal(conflictApplyCalls.length, 0);
  assert.equal(conflictPromptSyncs.length, 0);
  assert.equal(conflictCoreBackgroundBatches.length, 0);
  assert.equal(conflictState.runtimeTracking.revision, 0);
  assert.equal(conflictState.crew.casualties.length, 0);
  const conflictJournal = conflictState.runtimeTracking.sidecarJournal.slice(-2);
  assert.deepEqual(conflictJournal.map((entry) => entry.status), ['rejected', 'rejected']);
  assert.equal(conflictJournal.every((entry) => entry.error.code === 'DIRECTIVE_SIDECAR_BATCH_PATH_CONFLICT'), true);
}

console.log('Campaign sidecar scheduler tests passed: batched generation, root authorization, Mission Component provenance, stale-revision/source rejection, accepted prompt synchronization, conflict handling, and durable journaling');
