import assert from 'node:assert/strict';

import {
  createCampaignSidecarScheduler,
  __campaignSidecarSchedulerTestHooks
} from '../../src/jobs/campaign-sidecar-scheduler.mjs';
import {
  createForgeCoordinator
} from '../../src/jobs/forge-coordinator.mjs';
import { parseStateDeltaProposalOutput } from '../../src/jobs/sidecar-output-contracts.mjs';
import { createLogicalStorageAdapter } from '../../src/storage/logical-storage-adapter.mjs';
import { createCoreStoreV2 } from '../../src/storage/core-store-v2.mjs';
import {
  createStateDeltaGateway,
  initializeCampaignRuntimeTracking,
  recordTurnIngress as recordTurnIngressStrict,
  updateTurnIngress
} from '../../src/runtime/state-delta-gateway.mjs';

const cloneJson = (value) => JSON.parse(JSON.stringify(value));
function coreProjection(state = {}) {
  return state?.directiveRuntimeEvidence?.coreStoreReadProjections || null;
}
function coreAuthority(state = {}) {
  return coreProjection(state)?.runtimeAuthority === 'coreStoreV2';
}
function activeTestRuntimeRevision(state = {}) {
  const projection = coreProjection(state);
  if (projection?.runtimeAuthority === 'coreStoreV2') {
    const revision = Number(projection?.revisions?.runtime);
    return Number.isFinite(revision) ? Math.max(0, revision) : 0;
  }
  return Math.max(0, Number(state?.runtimeTracking?.revision) || 0);
}
function activeTestMechanicsRevision(state = {}) {
  const projection = coreProjection(state);
  if (projection?.runtimeAuthority === 'coreStoreV2') {
    const revision = Number(projection?.revisions?.mechanics);
    return Number.isFinite(revision) ? Math.max(0, revision) : 0;
  }
  return Math.max(0, Number(state?.runtimeTracking?.mechanicsRevision) || 0);
}
function ensureTestCoreAuthority(state = {}) {
  state.directiveRuntimeEvidence = state.directiveRuntimeEvidence || {};
  state.directiveRuntimeEvidence.coreStoreReadProjections = {
    ...(state.directiveRuntimeEvidence.coreStoreReadProjections || {}),
    runtimeAuthority: 'coreStoreV2',
    revisions: {
      runtime: activeTestRuntimeRevision(state),
      mechanics: activeTestMechanicsRevision(state),
      ...(
        state.directiveRuntimeEvidence.coreStoreReadProjections?.revisions
        && typeof state.directiveRuntimeEvidence.coreStoreReadProjections.revisions === 'object'
          ? cloneJson(state.directiveRuntimeEvidence.coreStoreReadProjections.revisions)
          : {}
      )
    }
  };
  return state;
}
function advanceTestCoreRuntimeRevision(state = {}) {
  if (!coreAuthority(state)) {
    state.runtimeTracking = state.runtimeTracking || {};
    state.runtimeTracking.revision = (Number(state.runtimeTracking.revision) || 0) + 1;
    return state;
  }
  ensureTestCoreAuthority(state);
  state.directiveRuntimeEvidence.coreStoreReadProjections.revisions.runtime = activeTestRuntimeRevision(state) + 1;
  return state;
}
function createMemoryStorage() {
  const files = new Map();
  return {
    async readJson(filePath) {
      if (!files.has(filePath)) {
        const error = new Error(`not found: ${filePath}`);
        error.code = 'ENOENT';
        throw error;
      }
      return cloneJson(files.get(filePath));
    },
    async writeJson(filePath, value) {
      files.set(filePath, cloneJson(value));
      return { ok: true, path: filePath };
    },
    async verifyJsonFiles(paths) {
      return Object.fromEntries(paths.map((filePath) => [filePath, files.has(filePath)]));
    }
  };
}
function recordTurnIngress(campaignState, ingress, options = {}) {
  const hasCoreTransactionId = Object.prototype.hasOwnProperty.call(ingress, 'coreTransactionId');
  return recordTurnIngressStrict(campaignState, {
    ...ingress,
    coreTransactionId: hasCoreTransactionId ? ingress.coreTransactionId : `txn:${ingress.id || ingress.ingressId || 'fixture'}`
  }, options);
}
function assertNoTransientCommandBearingReviewTracking(scenario, reviewInputRevision, label) {
  const tracking = scenario.state.runtimeTracking || {};
  const expectedBaseRevision = Math.max(0, Number(reviewInputRevision || 0) - 1);
  assert.equal(tracking.revision, expectedBaseRevision, `${label}: runtime revision must roll back the transient review commit.`);
  assert.equal(tracking.mechanicsRevision, expectedBaseRevision, `${label}: mechanics revision must roll back the transient review commit.`);
  assert.equal(tracking.lastStableRevision, expectedBaseRevision, `${label}: stable revision must roll back the transient review commit.`);
  assert.equal(
    String(tracking.lastDelta?.reason || '').includes('Command Bearing closure review updated character progression'),
    false,
    `${label}: lastDelta must not retain the transient review commit.`
  );
  assert.equal(
    (tracking.history || []).some((entry) => String(entry?.reason || '').includes('Command Bearing closure review updated character progression')),
    false,
    `${label}: history must not retain the transient review commit.`
  );
  assert.equal(
    (tracking.history || []).some((entry) => {
      const snapshot = entry?.snapshot || {};
      return (snapshot.commandBearing?.reviewLedger?.records?.length || 0) > 0
        || (snapshot.commandBearing?.tracks?.resolve?.marks || 0) > 0;
    }),
    false,
    `${label}: history snapshots must not retain transient Command Bearing review roots.`
  );
  assert.equal(
    (tracking.history || []).some((entry) => (entry?.snapshot?.runtimeTracking?.history?.length || 0) > 0),
    false,
    `${label}: history snapshots must not nest runtimeTracking.history.`
  );
}
function assertNoCommandBearingReviewTrackingLeak(scenario, label) {
  const tracking = scenario.state.runtimeTracking || {};
  assert.equal(
    String(tracking.lastDelta?.reason || '').includes('Command Bearing closure review updated character progression'),
    false,
    `${label}: lastDelta must not retain the transient review commit.`
  );
  assert.equal(
    (tracking.history || []).some((entry) => String(entry?.reason || '').includes('Command Bearing closure review updated character progression')),
    false,
    `${label}: history must not retain the transient review commit.`
  );
  assert.equal(
    (tracking.history || []).some((entry) => {
      const snapshot = entry?.snapshot || {};
      return (snapshot.commandBearing?.reviewLedger?.records?.length || 0) > 0
        || (snapshot.commandBearing?.tracks?.resolve?.marks || 0) > 0;
    }),
    false,
    `${label}: history snapshots must not retain transient Command Bearing review roots.`
  );
  assert.equal(
    (tracking.history || []).some((entry) => (entry?.snapshot?.runtimeTracking?.history?.length || 0) > 0),
    false,
    `${label}: history snapshots must not nest runtimeTracking.history.`
  );
}
const forgeBackgroundTransaction = (transactionId, bundle = {}) => ({
  id: transactionId,
  backgroundBatchId: bundle.batchId || `background:${transactionId}`,
  backgroundBatchIds: [bundle.batchId || `background:${transactionId}`],
  backgroundIdempotencyKey: bundle.idempotencyKey || null,
  backgroundIdempotencyKeys: [bundle.idempotencyKey].filter(Boolean),
  backgroundBatches: [{
    batchId: bundle.batchId || `background:${transactionId}`,
    idempotencyKey: bundle.idempotencyKey || null,
    operationCount: Array.isArray(bundle.operations) ? bundle.operations.length : 0,
    workerCount: Array.isArray(bundle.workers) ? bundle.workers.length : 0,
    ...(bundle.forgeBatchRef ? { forgeBatchRef: cloneJson(bundle.forgeBatchRef) } : {})
  }]
});
let tick = 0;
const now = () => `2026-06-22T06:00:${String(tick++).padStart(2, '0')}.000Z`;

function createTestAcceptedForgeCoordinator({
  commits = [],
  diagnostics = [],
  acceptedBatchPromptFlusher = null,
  commandBearingReviewPromptFlusher = null,
  isSourceCurrent
} = {}) {
  return createForgeCoordinator({
    coreStore: {
      commitBackgroundBatch: async (transactionId, bundle) => {
        commits.push({ transactionId, bundle: cloneJson(bundle) });
        return forgeBackgroundTransaction(transactionId, bundle);
      },
      appendDiagnostics: async (event) => {
        diagnostics.push(cloneJson(event));
        return { ok: true };
      }
    },
    acceptedBatchPromptFlusher,
    commandBearingReviewPromptFlusher,
    ...(typeof isSourceCurrent === 'function' ? { isSourceCurrent } : {}),
    clock: now
  });
}

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
  coreTransactionId = undefined
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
  const ingressRecord = {
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
    ...(coreTransactionId === undefined ? {} : { coreTransactionId })
  };
  if (coreTransactionId === null) {
    state = initializeCampaignRuntimeTracking({
      ...cloneJson(state),
      runtimeTracking: {
        ...cloneJson(state.runtimeTracking || {}),
        ingressLedger: [
          ...(state.runtimeTracking?.ingressLedger || []),
          ingressRecord
        ]
      }
    });
    return;
  }
  state = recordTurnIngress(state, ingressRecord);
}

const sourceSnapshotDemotion = __campaignSidecarSchedulerTestHooks.sourceIngressSnapshot({
  campaignChatBinding: {
    saveId: 'save-sidecar-test'
  },
  directiveRuntimeEvidence: {
    coreStoreReadProjections: {
      ingressLedger: [{
        id: 'ingress-sidecar-core-projected',
        hostMessageId: 'host-sidecar-core-projected',
        chatId: 'campaign-chat',
        campaignId: 'campaign-sidecar-test',
        textHash: 'core-source-hash',
        status: 'committed',
        outcomeId: 'outcome-sidecar-core-projected',
        sourceFrameId: 'frame-sidecar-core-projected',
        coreTransactionId: 'txn-sidecar-core-projected'
      }],
      responseLedger: [],
      recoveryJournal: []
    }
  },
  runtimeTracking: {
    ingressLedger: [{
      id: 'ingress-sidecar-core-projected',
      hostMessageId: 'host-sidecar-stale-legacy',
      chatId: 'campaign-chat',
      textHash: 'stale-source-hash',
      status: 'staleLegacy',
      outcomeId: 'outcome-sidecar-stale-legacy',
      sourceFrameId: 'frame-sidecar-stale-legacy',
      coreTransactionId: 'txn-sidecar-stale-legacy'
    }]
  }
}, 'ingress-sidecar-core-projected');
assert.equal(
  sourceSnapshotDemotion.coreTransactionId,
  'txn-sidecar-core-projected',
  'Sidecar source ingress snapshot must prefer CORE projection over stale raw runtimeTracking.ingressLedger.'
);
assert.equal(sourceSnapshotDemotion.hostMessageId, 'host-sidecar-core-projected');
assert.equal(sourceSnapshotDemotion.outcomeId, 'outcome-sidecar-core-projected');
assert.equal(sourceSnapshotDemotion.sourceFrameId, 'frame-sidecar-core-projected');

const missingSourceSnapshot = __campaignSidecarSchedulerTestHooks.sourceIngressSnapshot({
  campaign: { id: 'campaign-sidecar-test' },
  campaignChatBinding: {
    saveId: 'save-sidecar-test',
    chatId: 'campaign-chat'
  },
  directiveRuntimeEvidence: {
    coreStoreReadProjections: {
      ingressLedger: [],
      responseLedger: [],
      recoveryJournal: []
    }
  },
  runtimeTracking: {
    ingressLedger: []
  }
}, 'ingress-sidecar-missing-core', {
  ingressId: 'ingress-sidecar-missing-core',
  sourceFrameId: 'frame-stale-turn-context-only',
  coreTransactionId: 'txn-stale-turn-context-only',
  sourceMessageId: 'player-stale-turn-context-only',
  playerTextHash: 'stale-turn-context-hash'
});
assert.equal(
  missingSourceSnapshot,
  null,
  'Sidecar source snapshot must not synthesize source authority from turnContext when CORE/SRE projection is missing.'
);

async function runCommandBearingReviewPromptScenario({
  suffix,
  closureId = null,
  awardSummary = 'The commander accepted visible operational cost to preserve a lawful command boundary.',
  reviewCommitBackground = null,
  mutateLiveStateDuringReviewFlush = false,
  trackedLiveStateDuringReviewFlush = false,
  seedBaseTrackingHistory = false,
  reviewForgePromptMethod = true,
  reviewFallbackReturnsState = true,
  reviewFlushThrows = false,
  reviewFlushReturnsState = true,
  rawCanary = 'RAW_COMMAND_BEARING_REVIEW_PROMPT_CANARY_MUST_NOT_PERSIST'
} = {}) {
  let localState = initializeCampaignRuntimeTracking({
    campaign: { id: `campaign-sidecar-command-bearing-${suffix}-test`, status: 'active' },
    campaignChatBinding: {
      campaignId: `campaign-sidecar-command-bearing-${suffix}-test`,
      saveId: `save-sidecar-command-bearing-${suffix}-test`,
      chatId: 'campaign-chat',
      branchId: 'main'
    },
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
      arcs: [{ id: `arc.sidecar.${suffix}`, status: 'active', completedMilestoneIds: [`milestone.sidecar.${suffix}`] }],
      milestones: [{
        id: `milestone.sidecar.${suffix}`,
        arcId: `arc.sidecar.${suffix}`,
        status: 'complete',
        sourceEventIds: [`outcome.sidecar.${suffix}`]
      }]
    },
    eventLedger: { events: [] },
    threadLedger: { records: [] },
    dynamicQuestCatalog: { templates: [] },
    knowledgeLedger: { facts: [] },
    commandLog: { entries: [] },
    continuity: { notes: [] }
  });
  localState = recordTurnIngress(localState, {
    id: `ingress-sidecar-command-bearing-${suffix}`,
    hostMessageId: `player-sidecar-command-bearing-${suffix}`,
    chatId: 'campaign-chat',
    campaignId: `campaign-sidecar-command-bearing-${suffix}-test`,
    textHash: `command-bearing-${suffix}-source-hash`,
    textPreview: `Source message for Command Bearing ${suffix}.`,
    status: 'committed',
    outcomeId: `outcome.sidecar.${suffix}`,
    sourceFrameId: `frame-sidecar-command-bearing-${suffix}`,
    sourceFrame: {
      kind: 'directive.turnSourceFrame.v1',
      schemaVersion: 1,
      id: `frame-sidecar-command-bearing-${suffix}`,
      campaignId: `campaign-sidecar-command-bearing-${suffix}-test`,
      saveId: `save-sidecar-command-bearing-${suffix}-test`,
      chatId: 'campaign-chat',
      hostMessageId: `player-sidecar-command-bearing-${suffix}`,
      textHash: `command-bearing-${suffix}-source-hash`,
      rawPlayerText: `SOURCE_FRAME_TEXT_${suffix}`
    },
    coreTransactionId: `txn-sidecar-command-bearing-${suffix}`
  });
  if (seedBaseTrackingHistory) {
    localState.runtimeTracking.revision = 1;
    localState.runtimeTracking.mechanicsRevision = 1;
    localState.runtimeTracking.history = [{
      revision: 0,
      committedAt: now(),
      reason: 'Seed base tracked history before Command Bearing review.',
      source: 'test',
      snapshot: {
        runtimeTracking: {
          history: [],
          historyIndex: -1
        },
        commandBearing: {
          evidenceLedger: {
            records: [{ id: 'base-history-sentinel', summary: 'Original base history snapshot.' }]
          }
        }
      }
    }];
    localState.runtimeTracking.historyIndex = 0;
    localState.runtimeTracking.lastDelta = {
      source: 'test',
      reason: 'Seed base tracked history before Command Bearing review.',
      domains: ['commandBearing'],
      revision: 1,
      committedAt: now()
    };
    localState.runtimeTracking.lastStableRevision = 1;
  }
  const expectedClosureId = closureId || `closure.milestone.milestone.sidecar.${suffix}.1`;
  const gatewayPersists = [];
  const localGateway = createStateDeltaGateway({
    getState: () => localState,
    setState: (next) => { localState = cloneJson(next); },
    persist: async (next, delta) => {
      gatewayPersists.push({ revision: next.runtimeTracking?.revision || 0, delta: cloneJson(delta) });
      localState = cloneJson(next);
    },
    now
  });
  const generationCalls = [];
  const coreCommits = [];
  const persistReasons = [];
  const promptFlushes = [];
  const schedulerPromptSyncs = [];
  const results = await createCampaignSidecarScheduler({
    generationRouter: {
      async generate(roleId) {
        generationCalls.push(roleId);
        if (generationCalls.length === 1) {
          return {
            ok: true,
            response: {
              text: JSON.stringify({
                id: `command-bearing-sidecar-${suffix}-evidence`,
                operations: [{
                  op: 'append',
                  path: 'commandBearing.evidenceLedger.records',
                  value: {
                    id: `bearing-evidence.sidecar.${suffix}`,
                    sourceOutcomeId: `outcome.sidecar.${suffix}`,
                    sourceTurnId: `turn.sidecar.${suffix}`,
                    arcId: `arc.sidecar.${suffix}`,
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
        return {
          ok: true,
          response: {
            text: JSON.stringify({
              closureId: expectedClosureId,
              markAwarded: true,
              awardedTrack: 'resolve',
              criteriaSatisfied: { agency: true, commitment: true, causality: true },
              evidenceIds: [`bearing-evidence.sidecar.${suffix}`],
              awardSummary
            })
          },
          diagnostics: { providerId: 'fake-command-bearing-reviewer' }
        };
      }
    },
    stateDeltaGateway: localGateway,
    getCampaignState: () => localState,
    setCampaignState: (next) => { localState = cloneJson(next); },
    persistCampaignState: async (next, reason) => {
      persistReasons.push(reason || null);
      localState = cloneJson(next);
    },
    commitCoreBackgroundBatch: async (transactionId, bundle) => {
      coreCommits.push({ transactionId, bundle: cloneJson(bundle) });
      if (coreCommits.length === 2 && typeof reviewCommitBackground === 'function') {
        return reviewCommitBackground(transactionId, cloneJson(bundle));
      }
      return forgeBackgroundTransaction(transactionId, bundle);
    },
    syncPromptContext: async (next, details, options = {}) => {
      schedulerPromptSyncs.push({
        workerKey: details?.workerKey || null,
        commandBearingReview: details?.commandBearingReview === true,
        promptSyncIdempotencyKey: options.activityContext?.promptSyncIdempotencyKey || null,
        revision: next?.runtimeTracking?.revision ?? null
      });
      if (details?.commandBearingReview === true && !reviewFallbackReturnsState) return null;
      return next;
    },
    forgeCoordinator: (() => {
      const coordinator = createTestAcceptedForgeCoordinator({
        commits: coreCommits,
        acceptedBatchPromptFlusher: async (input = {}) => {
          schedulerPromptSyncs.push({
            workerKey: input.workerKey || null,
            commandBearingReview: false,
            promptSyncIdempotencyKey: input.activityContext?.promptSyncIdempotencyKey || null
          });
          return { ok: true, status: 'rebuilt', campaignState: cloneJson(input.campaignState) };
        },
        commandBearingReviewPromptFlusher: async (input = {}) => {
          const promptFlush = {
            promptSyncIdempotencyKey: input.promptSyncIdempotencyKey || null,
            idempotencyKey: input.idempotencyKey || null,
            promptDirtyDomains: cloneJson(input.promptDirtyDomains || []),
            promptFrame: cloneJson(input.promptFrame || {}),
            commitRuntimeState: input.commitRuntimeState !== false,
            beforeInstallPrompt: typeof input.beforeInstallPrompt === 'function',
            beforeInstallPromptResult: null,
            coreCommitCountAtFlush: coreCommits.length,
            persistReasonsAtFlush: [...persistReasons],
            campaignRevision: activeTestRuntimeRevision(input.campaignState)
          };
          promptFlushes.push(promptFlush);
          if (reviewFlushThrows) {
            const error = new Error(`LENS review prompt flush failed. ${rawCanary}`);
            error.code = 'DIRECTIVE_LENS_REVIEW_FLUSH_FAILED';
            throw error;
          }
          if (!reviewFlushReturnsState) return { ok: true, status: 'noChange' };
          if (trackedLiveStateDuringReviewFlush) {
            const trackedDrift = cloneJson(input.campaignState);
            trackedDrift.commandLog = trackedDrift.commandLog || {};
            trackedDrift.commandLog.entries = Array.isArray(trackedDrift.commandLog.entries)
              ? trackedDrift.commandLog.entries
              : [];
            trackedDrift.commandLog.entries.push({
              id: `tracked-review-flush-race-${suffix}`,
              summary: 'Tracked state advanced while review prompt flush was in flight.'
            });
            trackedDrift.campaignChatBinding = {
              ...(trackedDrift.campaignChatBinding || {}),
              promptContextOwner: `tracked-review-flush-race-${suffix}`
            };
            await localGateway.commit(trackedDrift, {
              source: 'test-command-bearing-review-race',
              reason: 'Tracked external drift during Command Bearing review prompt flush.',
              summary: 'Tracked external drift during Command Bearing review prompt flush.',
              domains: ['commandLog', 'campaignChatBinding']
            }, { persist: false });
          } else if (mutateLiveStateDuringReviewFlush) {
            const externallyAdvanced = cloneJson(input.campaignState);
            advanceTestCoreRuntimeRevision(externallyAdvanced);
            externallyAdvanced.commandLog = externallyAdvanced.commandLog || {};
            externallyAdvanced.commandLog.entries = Array.isArray(externallyAdvanced.commandLog.entries)
              ? externallyAdvanced.commandLog.entries
              : [];
            externallyAdvanced.commandLog.entries.push({
              id: `external-review-flush-race-${suffix}`,
              summary: 'External state advanced while review prompt flush was in flight.'
            });
            externallyAdvanced.campaignChatBinding = {
              ...(externallyAdvanced.campaignChatBinding || {}),
              promptContextOwner: `external-review-flush-race-${suffix}`
            };
            localState = externallyAdvanced;
          }
          if (typeof input.beforeInstallPrompt === 'function') {
            const guardResult = await input.beforeInstallPrompt({
              lane: 'background',
              reason: 'test-command-bearing-review-before-install'
            });
            promptFlush.beforeInstallPromptResult = cloneJson(guardResult);
            if (guardResult === false || guardResult?.ok === false || guardResult?.allow === false || guardResult?.stale === true) {
              return {
                ok: true,
                status: 'installSkippedStale',
                promptInstallSkipped: true,
                lens: { status: 'installSkippedStale' }
              };
            }
          }
          const synchronized = cloneJson(input.campaignState);
          synchronized.campaignChatBinding = {
            ...(synchronized.campaignChatBinding || {}),
            promptContextRevision: (synchronized.campaignChatBinding?.promptContextRevision || 0) + 1,
            promptContextOwner: `forge-lens-command-bearing-${suffix}`
          };
          if (mutateLiveStateDuringReviewFlush && input.commitRuntimeState !== false) {
            localState = cloneJson(synchronized);
          }
          return { ok: true, status: 'rebuilt', campaignState: synchronized };
        }
      });
      if (!reviewForgePromptMethod) coordinator.flushCommandBearingReviewPrompt = undefined;
      return coordinator;
    })(),
    now
  }).schedule({
    workerPlan: { commandBearing: true },
    turnContext: {
      ingressId: `ingress-sidecar-command-bearing-${suffix}`,
      turnId: `turn.sidecar.${suffix}`,
      outcomeId: `outcome.sidecar.${suffix}`
    }
  });
  return {
    results,
    state: localState,
    generationCalls,
    coreCommits,
    persistReasons,
    promptFlushes,
    schedulerPromptSyncs,
    gatewayPersists,
    rawCanary
  };
}

const responses = [];
const generationRequests = [];
const coreDiagnostics = [];
const coreBackgroundCommits = [];
const generationRouter = {
  async generate(roleId, request) {
    generationRequests.push({ roleId, request: cloneJson(request || {}) });
    const response = responses.shift();
    assert.ok(response, `Unexpected ${roleId} sidecar request.`);
    if (typeof response.assertRequest === 'function') response.assertRequest(roleId, request);
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

const schedulerPromptSyncContext = async (next, details, options = {}) => {
  promptSyncs.push({
    revision: next.runtimeTracking.revision,
    workerKey: details.workerKey,
    promptDirtyDomains: cloneJson(details.promptDirtyDomains || []),
    activityPromptDirtyDomains: cloneJson(options.activityContext?.promptDirtyDomains || []),
    promptSyncIdempotencyKey: options.activityContext?.promptSyncIdempotencyKey || null
  });
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
};

const scheduler = createCampaignSidecarScheduler({
  generationRouter,
  stateDeltaGateway: gateway,
  getCampaignState: getState,
  setCampaignState: setState,
  persistCampaignState: persist,
  syncPromptContext: schedulerPromptSyncContext,
  appendCoreDiagnostic: async (event) => {
    coreDiagnostics.push(cloneJson(event));
    return { ok: true };
  },
  commitCoreBackgroundBatch: async (transactionId, bundle) => {
    coreBackgroundCommits.push({ transactionId, bundle: cloneJson(bundle) });
    return forgeBackgroundTransaction(transactionId, bundle);
  },
  forgeCoordinator: createTestAcceptedForgeCoordinator({
    commits: coreBackgroundCommits,
    diagnostics: coreDiagnostics,
    acceptedBatchPromptFlusher: async (input = {}) => {
      const campaignState = await schedulerPromptSyncContext(input.campaignState, {
        workerKey: input.workerKey,
        workerKeys: cloneJson(input.workerKeys || []),
        promptDirtyDomains: cloneJson(input.promptDirtyDomains || []),
        aggregateBatch: input.aggregateBatch === true
      }, input);
      return { ok: true, status: 'rebuilt', campaignState };
    }
  }),
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
assert.equal(state.ship.condition, 'Operational', 'FORGE-settled sidecars must not mutate v1 ship roots after CORE settlement.');
assert.equal(state.ship.damage.length, 0, 'FORGE-settled sidecars must leave v1 ship roots to CORE read projections.');
assert.equal(state.runtimeTracking.revision, 0);
assert.equal(state.campaignChatBinding.promptContextRevision, 1);
assert.deepEqual(promptSyncs, [{
  revision: 0,
  workerKey: 'ship',
  promptDirtyDomains: ['crewShipRelationship'],
  activityPromptDirtyDomains: ['crewShipRelationship'],
  promptSyncIdempotencyKey: promptSyncs[0].promptSyncIdempotencyKey
}]);
assert.match(promptSyncs[0].promptSyncIdempotencyKey, /^campaign-sidecar-provider:.*:prompt-sync:accepted:[a-f0-9]{64}$/);
assert.equal(state.runtimeTracking.sidecarJournal.length, 0, 'Accepted direct-CORE-settled sidecars must not write old v1 applied journals.');
assert.equal(coreBackgroundCommits.at(-1).transactionId, 'txn-ingress-1');
assert.equal(results[0].forgeSettlement?.status, 'settled');
assert.equal(results[0].forgeSettlement?.transactionId, 'txn-ingress-1');
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
assert.equal(firstShipDiagnostics.at(-1).forgeSettlement?.status, 'settled');
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
  outcomeId: 'outcome-component-source',
  sourceFrameId: 'frame-component-source',
  coreTransactionId: 'txn-component-source'
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
assert.equal((state.ship.technicalDebt || []).length, 0, 'FORGE-settled sidecars must not project component-derived ship roots into v1 state.');
assert.deepEqual(results[0].proposal.derivedFromComponentIds, ['component.source.coolant']);
await scheduler.pending();
const componentDiagnostics = coreDiagnostics.filter((entry) => entry.ingressId === 'ingress-component-source');
assert.deepEqual(componentDiagnostics.map((entry) => entry.status), ['queued', 'running', 'applied']);
assert.equal(componentDiagnostics.at(-1).forgeSettlement?.status, 'settled');

recordSourceIngress('ingress-2', {
  outcomeId: 'outcome-ingress-2',
  sourceFrameId: 'frame-ingress-2',
  coreTransactionId: 'txn-ingress-2'
});
const journalLengthBeforeOutOfScopeNoChange = state.runtimeTracking.sidecarJournal.length;
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
assert.equal(state.runtimeTracking.revision, 0, 'Out-of-scope-only sidecars must not advance campaign mechanics revision.');
assert.equal(state.runtimeTracking.sidecarJournal.length, journalLengthBeforeOutOfScopeNoChange, 'No-change sidecars must not append old v1 success journals.');
assert.deepEqual(
  coreDiagnostics.filter((entry) => entry.ingressId === 'ingress-2').map((entry) => entry.status),
  ['queued', 'running', 'noChange'],
  'No-change sidecars with CORE source evidence should emit compact CORE diagnostics without old journals.'
);

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
assert.equal(results[0].error.code, 'DIRECTIVE_FORGE_SIDECAR_WORKER_FAILED');
await scheduler.pending();
const failedDiagnostics = coreDiagnostics.filter((entry) => entry.ingressId === 'ingress-provider-failed');
assert.deepEqual(failedDiagnostics.map((entry) => entry.status), ['queued', 'running', 'failed']);
assert.equal(failedDiagnostics.at(-1).errorCode, 'DIRECTIVE_FORGE_SIDECAR_WORKER_FAILED');

recordSourceIngress('ingress-2b', {
  outcomeId: 'outcome-2b',
  sourceFrameId: 'frame-ingress-2b',
  coreTransactionId: 'txn-ingress-2b'
});
const journalLengthBeforeEmptyNoChange = state.runtimeTracking.sidecarJournal.length;
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
assert.equal(state.runtimeTracking.revision, 0, 'No-op sidecars must not advance campaign mechanics revision.');
assert.equal(state.runtimeTracking.sidecarJournal.length, journalLengthBeforeEmptyNoChange, 'No-op sidecars must not append old v1 success journals.');
await scheduler.pending();
const noChangeDiagnostics = coreDiagnostics.filter((entry) => entry.ingressId === 'ingress-2b');
assert.deepEqual(noChangeDiagnostics.map((entry) => entry.status), ['queued', 'running', 'noChange']);

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
assert.equal(state.runtimeTracking.revision, 0, 'Invalid JSON sidecars must not advance campaign mechanics revision.');
assert.equal(state.runtimeTracking.sidecarJournal.length, journalLengthBeforeEmptyNoChange, 'Invalid JSON sidecars must not append old v1 rejected journals.');
await scheduler.pending();
const rejectedDiagnostics = coreDiagnostics.filter((entry) => entry.ingressId === 'ingress-2c');
assert.deepEqual(rejectedDiagnostics.map((entry) => entry.status), ['queued', 'running', 'rejected']);
assert.equal(rejectedDiagnostics.at(-1).errorCode, 'DIRECTIVE_SIDECAR_JSON_INVALID');
assert.equal(rejectedDiagnostics.at(-1).parse?.ok, false);

{
  let repairState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-json-repair-test', status: 'active' },
    mission: { activeMissionId: 'chapter-1', activePhaseId: 'arrival', knownFacts: [] },
    ship: { condition: 'Operational', damage: [] },
    crew: { casualties: [] },
    relationships: { seniorCrew: [] },
    commandBearing: {},
    pressureLedger: { records: [] },
    commandLog: { entries: [] },
    continuity: { notes: [] }
  });
  repairState = recordTurnIngress(repairState, {
    id: 'ingress-sidecar-json-repair',
    hostMessageId: 'player-sidecar-json-repair',
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-json-repair-test',
    textHash: 'json-repair-source-hash',
    textPreview: 'Source message for truncated sidecar JSON.',
    status: 'committed',
    outcomeId: 'outcome-sidecar-json-repair',
    sourceFrameId: 'frame-sidecar-json-repair',
    coreTransactionId: 'txn-sidecar-json-repair'
  });
  const repairGateway = createStateDeltaGateway({
    getState: () => repairState,
    setState: (next) => { repairState = cloneJson(next); },
    persist: async (next) => { repairState = cloneJson(next); },
    now
  });
  const repairCalls = [];
  const repairPromptSyncs = [];
  const repairCoreCommits = [];
  const rawTruncatedMarker = 'RAW_TRUNCATED_SIDECAR_TEXT_MUST_NOT_PERSIST';
  const repairScheduler = createCampaignSidecarScheduler({
    generationRouter: {
      async generate(roleId, request) {
        repairCalls.push({ roleId, request: cloneJson(request || {}) });
        if (repairCalls.length === 1) {
          return {
            ok: true,
            response: {
              text: `{"id":"crew-truncated","workerId":"crew","baseRevision":0,"operations":[{"op":"append","path":"crew.casualties","value":{"id":"partial","summary":"${rawTruncatedMarker}`
            }
          };
        }
        assert.equal(roleId, 'crewDirector');
        assert.equal(request.metadata?.sidecarRepair, true);
        assert.match(request.prompt, /Repair Directive's crew sidecar output/);
        return {
          ok: true,
          response: {
            text: JSON.stringify({
              id: 'crew-repaired-json-proposal',
              workerId: 'crew',
              baseRevision: 0,
              operations: [
                { op: 'append', path: 'crew.casualties', value: { id: 'json-repair', summary: 'Repair team logged a bounded casualty follow-up.' } }
              ],
              summary: 'Recovered one compact crew update.'
            })
          },
          diagnostics: { providerId: 'fake-json-repair-provider' }
        };
      }
    },
    stateDeltaGateway: repairGateway,
    getCampaignState: () => repairState,
    setCampaignState: (next) => { repairState = cloneJson(next); },
    persistCampaignState: async (next) => { repairState = cloneJson(next); },
    syncPromptContext: async (next, details) => {
      repairPromptSyncs.push({ revision: next.runtimeTracking.revision, details: cloneJson(details) });
      return next;
    },
    commitCoreBackgroundBatch: async (transactionId, bundle) => {
      repairCoreCommits.push({ transactionId, bundle: cloneJson(bundle) });
      return forgeBackgroundTransaction(transactionId, bundle);
    },
    forgeCoordinator: createTestAcceptedForgeCoordinator({
      commits: repairCoreCommits,
      acceptedBatchPromptFlusher: async (input = {}) => {
        const campaignState = await (async (next, details) => {
          repairPromptSyncs.push({ revision: next.runtimeTracking.revision, details: cloneJson(details) });
          return next;
        })(input.campaignState, {
          workerKey: input.workerKey,
          workerKeys: cloneJson(input.workerKeys || []),
          promptDirtyDomains: cloneJson(input.promptDirtyDomains || []),
          aggregateBatch: input.aggregateBatch === true
        });
        return { ok: true, status: 'rebuilt', campaignState };
      }
    }),
    now
  });
  const repairResults = await repairScheduler.schedule({
    workerPlan: { crew: true },
    turnContext: {
      ingressId: 'ingress-sidecar-json-repair',
      turnId: 'turn-sidecar-json-repair',
      outcomeId: 'outcome-sidecar-json-repair'
    }
  });
  assert.equal(repairResults[0].status, 'applied');
  assert.equal(repairCalls.length, 2, 'Likely-truncated JSON should receive one strict repair attempt.');
  assert.equal(repairResults[0].proposal.operations.at(-1).value.id, 'json-repair');
  assert.equal(repairCoreCommits.length, 1);
  assert.equal(repairCoreCommits[0].transactionId, 'txn-sidecar-json-repair');
  assert.equal(repairState.crew.casualties.length, 0, 'Repaired FORGE-settled sidecars must not persist v1 crew roots.');
  assert.equal(repairState.runtimeTracking.sidecarJournal.length, 0);
  assert.equal(repairPromptSyncs.length, 1);
  assert.equal(JSON.stringify(repairResults).includes(rawTruncatedMarker), false, 'Accepted repair diagnostics must not persist malformed raw sidecar text.');
}

recordSourceIngress('ingress-3', {
  outcomeId: 'outcome-3',
  sourceFrameId: 'frame-ingress-3',
  coreTransactionId: 'txn-ingress-3'
});
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
    summary: 'This proposal should rebase after unrelated revision drift.'
  }
});
results = await scheduler.schedule({
  workerPlan: { continuity: true },
  turnContext: { ingressId: 'ingress-3', outcomeId: 'outcome-3' }
});
assert.equal(results[0].status, 'applied');
assert.equal(state.runtimeTracking.revision, 1, 'FORGE-settled sidecars must not advance v1 mechanics revision after unrelated drift.');
assert.equal(state.continuity.notes.includes('Stale continuity proposal.'), false, 'FORGE-settled sidecars must not persist v1 continuity roots.');
assert.equal(results[0].proposal.operations.at(-1).value, 'Stale continuity proposal.');
assert.equal(results[0].forgeSettlement?.status, 'settled');
assert.equal(coreBackgroundCommits.at(-1).transactionId, 'txn-ingress-3');
assert.equal(promptSyncs.length, 3, 'Rebased sidecars with unchanged source should rebuild prompt context after apply.');
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
assert.equal(state.runtimeTracking.sidecarJournal.length, 0, 'Stale-source sidecars must not append old v1 rejected journals.');
assert.equal(promptSyncs.length, 3, 'Source-stale sidecars must not rebuild prompt context.');
await scheduler.pending();
const staleDiagnostics = coreDiagnostics.filter((entry) => entry.ingressId === 'ingress-stale-edit');
assert.deepEqual(staleDiagnostics.map((entry) => entry.status), ['queued', 'running', 'stale']);
assert.equal(staleDiagnostics.at(-1).resultStatus, 'rejected');
assert.equal(staleDiagnostics.at(-1).errorCode, 'DIRECTIVE_SIDECAR_SOURCE_STALE');
assert.deepEqual(staleDiagnostics.at(-1).staleReasons, ['status:invalidated', 'invalidated', 'text-hash-changed']);
assert.equal(staleDiagnostics.at(-1).sourceFrameRef.id, 'frame-stale-edit');
assert.equal(staleDiagnostics.at(-1).sourceToken, 'turnSourceFrame:frame-stale-edit');
assert.equal(JSON.stringify(staleDiagnostics).includes('RAW_FRAME_TEXT_ingress-stale-edit_MUST_NOT_PERSIST'), false);

recordSourceIngress('ingress-continuity-commandlog-drop', {
  outcomeId: 'outcome-continuity-commandlog-drop',
  sourceFrameId: 'frame-continuity-commandlog-drop',
  coreTransactionId: 'txn-continuity-commandlog-drop'
});
const revisionBeforeContinuityDrop = state.runtimeTracking.revision;
const commandLogBeforeContinuityDrop = state.commandLog.entries.length;
const journalLengthBeforeContinuityDrop = state.runtimeTracking.sidecarJournal.length;
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
assert.equal(state.runtimeTracking.revision, revisionBeforeContinuityDrop, 'FORGE-settled continuity sidecars must not advance v1 mechanics revision.');
assert.equal(state.continuity.notes.includes('Serrin kept the bridge watch disciplined after the handoff.'), false);
assert.equal(results[0].proposal.operations.some((operation) => operation.path === 'continuity.notes'), true);
assert.equal(results[0].proposal.operations.some((operation) => operation.path === 'commandLog.entries'), false);
assert.equal(state.commandLog.entries.length, commandLogBeforeContinuityDrop, 'continuity sidecars must not append Command Log entries');
assert.equal(state.runtimeTracking.sidecarJournal.length, journalLengthBeforeContinuityDrop);
assert.equal(coreBackgroundCommits.at(-1).transactionId, 'txn-continuity-commandlog-drop');

{
  let reviewState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-command-bearing-review-test', status: 'active' },
    campaignChatBinding: {
      campaignId: 'campaign-sidecar-command-bearing-review-test',
      saveId: 'save-sidecar-command-bearing-review-test',
      chatId: 'campaign-chat',
      branchId: 'main'
    },
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
    outcomeId: 'outcome.sidecar.resolve',
    sourceFrameId: 'frame-sidecar-command-bearing-review',
    sourceFrame: {
      kind: 'directive.turnSourceFrame.v1',
      schemaVersion: 1,
      id: 'frame-sidecar-command-bearing-review',
      campaignId: 'campaign-sidecar-command-bearing-review-test',
      saveId: 'save-sidecar-command-bearing-review-test',
      chatId: 'campaign-chat',
      hostMessageId: 'player-sidecar-command-bearing-review',
      textHash: 'command-bearing-review-source-hash'
    },
    coreTransactionId: 'txn-sidecar-command-bearing-review'
  });
  const reviewGatewayPersists = [];
  const reviewGateway = createStateDeltaGateway({
    getState: () => reviewState,
    setState: (next) => { reviewState = cloneJson(next); },
    persist: async (next, delta) => {
      reviewGatewayPersists.push({ revision: next.runtimeTracking?.revision || 0, delta: cloneJson(delta) });
      reviewState = cloneJson(next);
    },
    now
  });
  const reviewCalls = [];
  const reviewPromptSyncs = [];
  const reviewPromptFlushes = [];
  const reviewCoreCommits = [];
  const reviewPersistReasons = [];
  const reviewPersistSnapshots = [];
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
    persistCampaignState: async (next, reason) => {
      reviewPersistReasons.push(reason || null);
      reviewPersistSnapshots.push(cloneJson(next));
      reviewState = cloneJson(next);
    },
    commitCoreBackgroundBatch: async (transactionId, bundle) => {
      reviewCoreCommits.push({ transactionId, bundle: cloneJson(bundle) });
      return forgeBackgroundTransaction(transactionId, bundle);
    },
    syncPromptContext: async (next, details, options = {}) => {
      reviewPromptSyncs.push({
        workerKey: details.workerKey,
        commandBearingReview: details.commandBearingReview === true,
        coreCommitCountAtSync: reviewCoreCommits.length,
        promptDirtyDomains: cloneJson(details.promptDirtyDomains || []),
        activityPromptDirtyDomains: cloneJson(options.activityContext?.promptDirtyDomains || []),
        promptSyncIdempotencyKey: options.activityContext?.promptSyncIdempotencyKey || null
      });
      return next;
    },
    forgeCoordinator: createTestAcceptedForgeCoordinator({
      commits: reviewCoreCommits,
      acceptedBatchPromptFlusher: async (input = {}) => {
        reviewPromptSyncs.push({
          workerKey: input.workerKey,
          commandBearingReview: false,
          coreCommitCountAtSync: reviewCoreCommits.length,
          promptDirtyDomains: cloneJson(input.promptDirtyDomains || []),
          activityPromptDirtyDomains: cloneJson(input.activityContext?.promptDirtyDomains || []),
          promptSyncIdempotencyKey: input.activityContext?.promptSyncIdempotencyKey || null,
          coreAcceptedBatchProjection: cloneJson(input.coreAcceptedBatchProjection || null)
        });
        return { ok: true, status: 'rebuilt', campaignState: cloneJson(input.campaignState) };
      },
      commandBearingReviewPromptFlusher: async (input = {}) => {
        reviewPromptFlushes.push({
          workerKey: input.workerKey || input.promptFrame?.workerKey || null,
          commandBearingReview: input.commandBearingReview === true || input.promptFrame?.commandBearingReview === true,
          coreCommitCountAtFlush: reviewCoreCommits.length,
          persistReasonsAtFlush: [...reviewPersistReasons],
          promptDirtyDomains: cloneJson(input.promptDirtyDomains || []),
          promptFrame: cloneJson(input.promptFrame || {}),
          activityContext: cloneJson(input.activityContext || {}),
          promptSyncIdempotencyKey: input.promptSyncIdempotencyKey || null,
          idempotencyKey: input.idempotencyKey || null,
          transactionId: input.transactionId || null,
          binding: cloneJson(input.binding || {}),
          campaignContext: cloneJson(input.campaignContext || {}),
          sourceFrameRef: cloneJson(input.sourceFrameRef || null),
          sourceToken: input.sourceToken || null,
          coreCommandBearingReviewProjection: cloneJson(input.coreCommandBearingReviewProjection || null),
          campaignRevision: input.campaignState?.runtimeTracking?.revision || 0
        });
        const synchronized = cloneJson(input.campaignState);
        synchronized.campaignChatBinding = {
          ...(synchronized.campaignChatBinding || {}),
          chatId: synchronized.campaignChatBinding?.chatId || 'campaign-chat',
          promptContextRevision: (synchronized.campaignChatBinding?.promptContextRevision || 0) + 1,
          promptContextOwner: 'forge-lens-command-bearing-review-test'
        };
        synchronized.ship = {
          ...(synchronized.ship || {}),
          condition: 'Illicit review prompt mutation'
        };
        synchronized.crew = {
          ...(synchronized.crew || {}),
          casualties: [
            ...(synchronized.crew?.casualties || []),
            { id: 'review-prompt-leak', summary: 'Must not persist from review prompt output.' }
          ]
        };
        synchronized.runtimeTracking = {
          ...(synchronized.runtimeTracking || {}),
          promptContext: {
            status: 'active',
            revision: 17,
            hash: 'command-bearing-review-prompt-hash'
          }
        };
        return {
          ok: true,
          status: 'rebuilt',
          campaignState: synchronized
        };
      }
    }),
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
  assert.equal(reviewState.commandBearing.evidenceLedger?.records?.length || 0, 0, 'Accepted Command Bearing evidence must not persist old v1 evidence roots.');
  assert.equal((reviewState.commandBearing.reviewLedger?.records || []).length, 0, 'Command Bearing review settlement must not persist old v1 review ledger roots.');
  assert.equal(reviewState.commandBearing.tracks?.resolve?.marks || 0, 0, 'Command Bearing review settlement must not persist old v1 track marks.');
  assert.equal(reviewState.ship.condition, 'Operational', 'Command Bearing review prompt output must not persist non-command ship roots.');
  assert.equal(reviewState.crew.casualties.length, 0, 'Command Bearing review prompt output must not persist non-command crew roots.');
  assert.equal(reviewState.runtimeTracking?.promptContext, undefined);
  assert.equal(reviewGatewayPersists.length, 0, 'Command Bearing sidecar bridge must not persist through StateDeltaGateway before CORE review settlement.');
  assert.equal(reviewCoreCommits.length, 2, 'Command Bearing closure review mutation needs its own durable CORE background evidence.');
  assert.equal(reviewCoreCommits[0].transactionId, 'txn-sidecar-command-bearing-review');
  assert.equal(reviewCoreCommits[1].transactionId, 'txn-sidecar-command-bearing-review');
  assert.match(reviewCoreCommits[1].bundle.batchId, /^command-bearing-review:txn-sidecar-command-bearing-review:/);
  assert.equal(reviewCoreCommits[1].bundle.forgeBatchRef.kind, 'directive.commandBearingReviewCommitRef.v1');
  assert.equal(reviewCoreCommits[1].bundle.backgroundEffectRefs[0].kind, 'directive.commandBearingReviewClosure.v1');
  assert.equal(reviewCoreCommits[1].bundle.backgroundEffectRefs[0].id, 'closure.milestone.milestone.sidecar.resolve.1');
  assert.equal(reviewState.runtimeTracking.sidecarJournal.length, 0);
  assert.deepEqual(reviewPromptSyncs.map((entry) => entry.promptDirtyDomains), [['command']]);
  assert.deepEqual(reviewPromptSyncs.map((entry) => entry.activityPromptDirtyDomains), [['command']]);
  assert.match(reviewPromptSyncs[0].promptSyncIdempotencyKey, /^campaign-sidecar-provider:.*:prompt-sync:accepted:[a-f0-9]{64}$/);
  assert.equal(reviewPromptSyncs[0].coreCommitCountAtSync, 1);
  assert.equal(reviewPromptSyncs[0].coreAcceptedBatchProjection.workerKeys.includes('commandBearing'), true);
  assert.equal(reviewPromptSyncs[0].coreAcceptedBatchProjection.commandBearingEvidence.length, 1);
  assert.equal(reviewPromptSyncs[0].coreAcceptedBatchProjection.commandBearingEvidence[0].evidenceId, 'bearing-evidence.sidecar.resolve');
  assert.equal(JSON.stringify(reviewPromptSyncs[0].coreAcceptedBatchProjection.commandBearingEvidence).includes('RAW_COMMAND_BEARING'), false);
  assert.equal(reviewPromptFlushes.length, 1);
  assert.equal(reviewPromptFlushes[0].workerKey, 'commandBearing');
  assert.equal(reviewPromptFlushes[0].commandBearingReview, true);
  assert.equal(reviewPromptFlushes[0].coreCommitCountAtFlush, 2, 'Review-specific prompt flush must run only after the review CORE settlement receipt is durable.');
  assert.deepEqual(reviewPromptFlushes[0].persistReasonsAtFlush, [
    'Campaign sidecar batch prompt context synchronized.'
  ]);
  assert.deepEqual(reviewPromptFlushes[0].promptDirtyDomains, ['commandBearing']);
  assert.deepEqual(reviewPromptFlushes[0].promptFrame.promptDirtyDomains, ['commandBearing']);
  assert.equal(reviewPromptFlushes[0].promptFrame.workerKey, 'commandBearing');
  assert.equal(reviewPromptFlushes[0].promptFrame.commandBearingReview, true);
  assert.deepEqual(reviewPromptFlushes[0].activityContext.promptDirtyDomains, ['commandBearing']);
  assert.equal(reviewPromptFlushes[0].activityContext.commandBearingReview, true);
  assert.equal(reviewPromptFlushes[0].transactionId, 'txn-sidecar-command-bearing-review');
  assert.equal(reviewPromptFlushes[0].sourceFrameRef.id, 'frame-sidecar-command-bearing-review');
  assert.ok(reviewPromptFlushes[0].sourceToken);
  assert.equal(reviewPromptFlushes[0].coreCommandBearingReviewProjection?.kind, 'directive.coreCommandBearingReviewProjection.v1');
  assert.equal(reviewPromptFlushes[0].coreCommandBearingReviewProjection.transactionId, 'txn-sidecar-command-bearing-review');
  assert.equal(reviewPromptFlushes[0].coreCommandBearingReviewProjection.batchId, reviewCoreCommits[1].bundle.batchId);
  assert.equal(reviewPromptFlushes[0].coreCommandBearingReviewProjection.reviewHash, reviewCoreCommits[1].bundle.forgeBatchRef.reviewHash);
  assert.deepEqual(reviewPromptFlushes[0].coreCommandBearingReviewProjection.closures.map((entry) => entry.closureId), ['closure.milestone.milestone.sidecar.resolve.1']);
  assert.equal(reviewPromptFlushes[0].binding.chatId, 'campaign-chat');
  assert.equal(reviewPromptFlushes[0].campaignContext.chatId, 'campaign-chat');
  assert.equal(reviewPromptFlushes[0].campaignContext.campaignId, 'campaign-sidecar-command-bearing-review-test');
  assert.match(reviewPromptFlushes[0].promptSyncIdempotencyKey, /^campaign-sidecar-provider:.*:prompt-sync:command-bearing-review:[a-f0-9]{16}$/);
  assert.equal(reviewPromptFlushes[0].idempotencyKey, reviewPromptFlushes[0].promptSyncIdempotencyKey);
  assert.equal(reviewPromptFlushes[0].promptSyncIdempotencyKey.endsWith(`:${reviewCoreCommits[1].bundle.forgeBatchRef.reviewHash}`), true);
  assert.deepEqual(reviewPersistReasons, [
    'Campaign sidecar batch prompt context synchronized.',
    'Command Bearing sidecar closure review prompt context synchronized.'
  ]);
  assert.equal(
    reviewPersistSnapshots.some((snapshot) => (snapshot.commandBearing?.reviewLedger?.records || []).length > 0),
    false,
    'No persisted Command Bearing review snapshot may carry old v1 review records.'
  );
}

{
  let mixedCommandBearingState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-mixed-command-bearing-test', status: 'active' },
    campaignChatBinding: {
      campaignId: 'campaign-sidecar-mixed-command-bearing-test',
      saveId: 'save-sidecar-mixed-command-bearing-test',
      chatId: 'campaign-chat',
      branchId: 'main'
    },
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
    storyArcLedger: { arcs: [], milestones: [] },
    eventLedger: { events: [] },
    threadLedger: { records: [] },
    dynamicQuestCatalog: { templates: [] },
    knowledgeLedger: { facts: [] },
    commandLog: { entries: [] },
    continuity: { notes: [] }
  });
  mixedCommandBearingState = recordTurnIngress(mixedCommandBearingState, {
    id: 'ingress-sidecar-mixed-command-bearing',
    hostMessageId: 'player-sidecar-mixed-command-bearing',
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-mixed-command-bearing-test',
    textHash: 'mixed-command-bearing-source-hash',
    textPreview: 'Source message for mixed Command Bearing batch.',
    status: 'committed',
    outcomeId: 'outcome.sidecar.mixed-command-bearing',
    sourceFrameId: 'frame-sidecar-mixed-command-bearing',
    coreTransactionId: 'txn-sidecar-mixed-command-bearing'
  });
  const mixedCommandBearingGateway = createStateDeltaGateway({
    getState: () => mixedCommandBearingState,
    setState: (next) => { mixedCommandBearingState = cloneJson(next); },
    persist: async () => {
      assert.fail('Mixed accepted sidecar bridge must not persist through StateDeltaGateway before CORE/FORGE settlement.');
    },
    now
  });
  const mixedCommandBearingCommits = [];
  const mixedCommandBearingPersistReasons = [];
  const mixedCommandBearingPromptFlushes = [];
  const mixedCommandBearingResults = await createCampaignSidecarScheduler({
    generationRouter: {
      async generate() {
        assert.fail('Mixed sidecar batch should not need a Command Bearing closure review.');
      },
      async batch(requests) {
        return requests.map((request) => {
          if (request.roleId === 'commandBearingEvaluator') {
            return {
              ok: true,
              response: {
                text: JSON.stringify({
                  id: 'mixed-command-bearing-evidence',
                  operations: [{
                    op: 'append',
                    path: 'commandBearing.evidenceLedger.records',
                    value: {
                      id: 'bearing-evidence.sidecar.mixed',
                      sourceOutcomeId: 'outcome.sidecar.mixed-command-bearing',
                      sourceTurnId: 'turn.sidecar.mixed-command-bearing',
                      primarySignal: 'resolve',
                      trackSignals: ['resolve'],
                      strength: 'moderate',
                      criteria: { agency: true, commitment: true, causality: true },
                      actionSummary: 'Held a mixed-batch boundary.',
                      consequenceSummary: 'Command evidence was recorded without owning crew or ship state.',
                      playerFacingSummary: 'This may support Resolve without applying unrelated sidecar roots.',
                      visible: true,
                      status: 'open'
                    }
                  }],
                  summary: 'Record mixed Command Bearing evidence.'
                })
              }
            };
          }
          return {
            ok: true,
            response: {
              text: JSON.stringify({
                id: `mixed-command-bearing-${request.roleId}`,
                operations: [{
                  op: request.roleId === 'shipDirector' ? 'set' : 'append',
                  path: request.roleId === 'shipDirector' ? 'ship.condition' : 'crew.casualties',
                  value: request.roleId === 'shipDirector'
                    ? 'Shield grid fluctuating'
                    : { id: 'mixed-command-bearing-crew', summary: 'Minor triage recorded by non-command sidecar.' }
                }],
                summary: 'Non-command sidecar must remain CORE-only.'
              })
            }
          };
        });
      }
    },
    stateDeltaGateway: mixedCommandBearingGateway,
    getCampaignState: () => mixedCommandBearingState,
    setCampaignState: (next) => { mixedCommandBearingState = cloneJson(next); },
    persistCampaignState: async (next, reason) => {
      mixedCommandBearingPersistReasons.push(reason || null);
      mixedCommandBearingState = cloneJson(next);
    },
    commitCoreBackgroundBatch: async (transactionId, bundle) => {
      mixedCommandBearingCommits.push({ transactionId, bundle: cloneJson(bundle) });
      return forgeBackgroundTransaction(transactionId, bundle);
    },
    forgeCoordinator: createTestAcceptedForgeCoordinator({
      commits: mixedCommandBearingCommits,
      acceptedBatchPromptFlusher: async (input = {}) => {
        const promptInput = cloneJson(input.campaignState || {});
        promptInput.coreAcceptedBatchProjection = cloneJson(input.coreAcceptedBatchProjection || null);
        mixedCommandBearingPromptFlushes.push(promptInput);
        const synchronized = cloneJson(input.campaignState);
        synchronized.campaignChatBinding = {
          ...(synchronized.campaignChatBinding || {}),
          promptContextRevision: (synchronized.campaignChatBinding?.promptContextRevision || 0) + 1,
          promptContextOwner: 'mixed-command-bearing-prompt'
        };
        return { ok: true, status: 'rebuilt', campaignState: synchronized };
      }
    }),
    now
  }).schedule({
    workerPlan: { crew: true, ship: true, commandBearing: true },
    turnContext: {
      ingressId: 'ingress-sidecar-mixed-command-bearing',
      turnId: 'turn.sidecar.mixed-command-bearing',
      outcomeId: 'outcome.sidecar.mixed-command-bearing'
    }
  });
  assert.deepEqual(mixedCommandBearingResults.map((result) => result.status), ['applied', 'applied', 'applied']);
  assert.equal(mixedCommandBearingPromptFlushes.length, 1);
  assert.equal(mixedCommandBearingPromptFlushes[0].crew.casualties.length, 0, 'Mixed batch prompt input must not see transient non-command v1 roots.');
  assert.equal(mixedCommandBearingPromptFlushes[0].ship.condition, 'Operational', 'Mixed batch prompt input must not see transient non-command v1 roots.');
  assert.equal(mixedCommandBearingState.commandBearing.evidenceLedger?.records?.length || 0, 0, 'Mixed Command Bearing batches must not persist old v1 evidence roots.');
  assert.equal(mixedCommandBearingPromptFlushes[0].coreAcceptedBatchProjection.commandBearingEvidence.length, 1);
  assert.equal(mixedCommandBearingPromptFlushes[0].coreAcceptedBatchProjection.commandBearingEvidence[0].evidenceId, 'bearing-evidence.sidecar.mixed');
  assert.equal(mixedCommandBearingState.crew.casualties.length, 0, 'Mixed Command Bearing batches must not persist non-command v1 crew roots.');
  assert.equal(mixedCommandBearingState.ship.condition, 'Operational', 'Mixed Command Bearing batches must not persist non-command v1 ship roots.');
  assert.equal(mixedCommandBearingState.campaignChatBinding.promptContextRevision, 1);
  assert.deepEqual(mixedCommandBearingPersistReasons, [
    'Campaign sidecar batch prompt context synchronized.'
  ]);
}

{
  let badReviewState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-command-bearing-bad-review-settlement-test', status: 'active' },
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
      arcs: [{ id: 'arc.sidecar.bad-review', status: 'active', completedMilestoneIds: ['milestone.sidecar.bad-review'] }],
      milestones: [{
        id: 'milestone.sidecar.bad-review',
        arcId: 'arc.sidecar.bad-review',
        status: 'complete',
        sourceEventIds: ['outcome.sidecar.bad-review']
      }]
    },
    eventLedger: { events: [] },
    threadLedger: { records: [] },
    dynamicQuestCatalog: { templates: [] },
    knowledgeLedger: { facts: [] },
    commandLog: { entries: [] },
    continuity: { notes: [] }
  });
  badReviewState = recordTurnIngress(badReviewState, {
    id: 'ingress-sidecar-command-bearing-bad-review-settlement',
    hostMessageId: 'player-sidecar-command-bearing-bad-review-settlement',
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-command-bearing-bad-review-settlement-test',
    textHash: 'command-bearing-bad-review-settlement-source-hash',
    textPreview: 'Source message for Command Bearing bad settlement.',
    status: 'committed',
    outcomeId: 'outcome.sidecar.bad-review',
    sourceFrameId: 'frame-sidecar-command-bearing-bad-review-settlement',
    coreTransactionId: 'txn-sidecar-command-bearing-bad-review-settlement'
  });
  const badReviewGatewayPersists = [];
  const badReviewGateway = createStateDeltaGateway({
    getState: () => badReviewState,
    setState: (next) => { badReviewState = cloneJson(next); },
    persist: async (next, delta) => {
      badReviewGatewayPersists.push({ revision: next.runtimeTracking?.revision || 0, delta: cloneJson(delta) });
      badReviewState = cloneJson(next);
    },
    now
  });
  const badReviewCalls = [];
  const badReviewPromptSyncs = [];
  const badReviewPromptFlushes = [];
  const badReviewCoreCommits = [];
  const badReviewPersistReasons = [];
  const badReviewResults = await createCampaignSidecarScheduler({
    generationRouter: {
      async generate(roleId, request) {
        badReviewCalls.push({ roleId, request });
        if (badReviewCalls.length === 1) {
          return {
            ok: true,
            response: {
              text: JSON.stringify({
                id: 'command-bearing-sidecar-bad-review-evidence',
                operations: [{
                  op: 'append',
                  path: 'commandBearing.evidenceLedger.records',
                  value: {
                    id: 'bearing-evidence.sidecar.bad-review',
                    sourceOutcomeId: 'outcome.sidecar.bad-review',
                    sourceTurnId: 'turn.sidecar.bad-review',
                    primarySignal: 'resolve',
                    trackSignals: ['resolve'],
                    strength: 'strong',
                    criteria: { agency: true, commitment: true, causality: true },
                    actionSummary: 'Held a boundary before bad settlement.',
                    consequenceSummary: 'The same outcome completed the milestone.',
                    playerFacingSummary: 'This may support Resolve.',
                    visible: true,
                    status: 'open'
                  }
                }],
                summary: 'Record Resolve evidence for bad review settlement.'
              })
            }
          };
        }
        assert.equal(roleId, 'commandBearingEvaluator');
        return {
          ok: true,
          response: {
            text: JSON.stringify({
              closureId: 'closure.milestone.milestone.sidecar.bad-review.1',
              markAwarded: true,
              awardedTrack: 'resolve',
              criteriaSatisfied: { agency: true, commitment: true, causality: true },
              evidenceIds: ['bearing-evidence.sidecar.bad-review'],
              awardSummary: 'The commander accepted visible cost.'
            })
          },
          diagnostics: { providerId: 'fake-command-bearing-reviewer' }
        };
      }
    },
    stateDeltaGateway: badReviewGateway,
    getCampaignState: () => badReviewState,
    setCampaignState: (next) => { badReviewState = cloneJson(next); },
    persistCampaignState: async (next, reason) => {
      badReviewPersistReasons.push(reason);
      badReviewState = cloneJson(next);
    },
    commitCoreBackgroundBatch: async (transactionId, bundle) => {
      badReviewCoreCommits.push({ transactionId, bundle: cloneJson(bundle) });
      if (badReviewCoreCommits.length === 2) {
        return {
          id: transactionId,
          backgroundBatchId: bundle.batchId,
          backgroundBatchIds: [bundle.batchId],
          backgroundBatches: [{
            batchId: bundle.batchId,
            forgeBatchRef: {
              ...cloneJson(bundle.forgeBatchRef || {}),
              reviewHash: 'stale-command-bearing-review-hash'
            }
          }]
        };
      }
      return forgeBackgroundTransaction(transactionId, bundle);
    },
    syncPromptContext: async (next, details, options = {}) => {
      badReviewPromptSyncs.push({
        workerKey: details.workerKey,
        commandBearingReview: details.commandBearingReview === true,
        coreCommitCountAtSync: badReviewCoreCommits.length,
        promptSyncIdempotencyKey: options.activityContext?.promptSyncIdempotencyKey || null
      });
      return next;
    },
    forgeCoordinator: createTestAcceptedForgeCoordinator({
      commits: badReviewCoreCommits,
      acceptedBatchPromptFlusher: async (input = {}) => {
        badReviewPromptSyncs.push({
          workerKey: input.workerKey,
          commandBearingReview: false,
          coreCommitCountAtSync: badReviewCoreCommits.length,
          promptSyncIdempotencyKey: input.activityContext?.promptSyncIdempotencyKey || null
        });
        return { ok: true, status: 'rebuilt', campaignState: cloneJson(input.campaignState) };
      },
      commandBearingReviewPromptFlusher: async () => {
        badReviewPromptFlushes.push(true);
        assert.fail('Failed Command Bearing review CORE settlement must not flush review prompt.');
      }
    }),
    now
  }).schedule({
    workerPlan: { commandBearing: true },
    turnContext: {
      ingressId: 'ingress-sidecar-command-bearing-bad-review-settlement',
      turnId: 'turn.sidecar.bad-review',
      outcomeId: 'outcome.sidecar.bad-review'
    }
  });
  assert.equal(badReviewResults[0].status, 'applied');
  assert.equal(badReviewState.commandBearing.evidenceLedger?.records?.length || 0, 0);
  assert.equal(badReviewState.commandBearing.reviewLedger?.records?.length || 0, 0);
  assert.equal(badReviewState.commandBearing.tracks?.resolve?.marks || 0, 0);
  assert.equal(badReviewCoreCommits.length, 2);
  assert.equal(badReviewGatewayPersists.length, 0, 'Failed Command Bearing review settlement must not have persisted the review mutation through StateDeltaGateway.');
  assert.deepEqual(badReviewPromptSyncs.map((entry) => entry.commandBearingReview), [false]);
  assert.equal(badReviewPromptFlushes.length, 0);
  assert.equal(badReviewPromptSyncs[0].coreCommitCountAtSync, 1);
  assert.equal(badReviewPersistReasons.some((reason) => String(reason || '').includes('closure review compatibility projection persisted')), false);
  assert.equal(badReviewPersistReasons.some((reason) => String(reason || '').includes('closure review prompt context synchronized')), false);
  assert.equal(badReviewState.runtimeTracking.sidecarJournal.length, 0);
  assert.equal(badReviewResults[0].postSettlementWarnings.length, 1);
  assert.equal(badReviewResults[0].postSettlementWarnings[0].stage, 'commandBearingReview');
  assert.equal(badReviewResults[0].postSettlementWarnings[0].code, 'DIRECTIVE_COMMAND_BEARING_REVIEW_SETTLEMENT_FAILED');
}

{
  const reviewNoState = await runCommandBearingReviewPromptScenario({
    suffix: 'review-no-state',
    reviewFlushReturnsState: false,
    rawCanary: 'RAW_REVIEW_NO_STATE_MUST_NOT_PERSIST'
  });
  assert.deepEqual(reviewNoState.results.map((result) => result.status), ['applied']);
  assert.deepEqual(reviewNoState.generationCalls, ['commandBearingEvaluator', 'commandBearingEvaluator']);
  assert.equal(reviewNoState.coreCommits.length, 2);
  assert.equal(reviewNoState.promptFlushes.length, 1);
  assert.equal(reviewNoState.state.commandBearing.evidenceLedger?.records?.length || 0, 0);
  assert.equal(reviewNoState.state.commandBearing.reviewLedger?.records?.length || 0, 0, 'No-state review prompt flush must restore transient v1 review ledger roots.');
  assert.equal(reviewNoState.state.commandBearing.tracks?.resolve?.marks || 0, 0, 'No-state review prompt flush must restore transient v1 track marks.');
  assertNoTransientCommandBearingReviewTracking(reviewNoState, reviewNoState.promptFlushes[0].campaignRevision, 'No-state review prompt flush');
  assert.equal(reviewNoState.persistReasons.some((reason) => String(reason || '').includes('closure review prompt context synchronized')), false);
  assert.equal(reviewNoState.results[0].postSettlementWarnings.length, 1);
  assert.equal(reviewNoState.results[0].postSettlementWarnings[0].stage, 'lens');
  assert.equal(reviewNoState.results[0].postSettlementWarnings[0].code, 'DIRECTIVE_SIDECAR_POST_SETTLEMENT_LENS_FLUSH_NO_STATE');
  assert.equal(JSON.stringify(reviewNoState.results).includes(reviewNoState.rawCanary), false);
  assert.equal(JSON.stringify(reviewNoState.state).includes(reviewNoState.rawCanary), false);
}

{
  const reviewFallbackNoState = await runCommandBearingReviewPromptScenario({
    suffix: 'review-fallback-no-state',
    reviewForgePromptMethod: false,
    reviewFallbackReturnsState: false,
    rawCanary: 'RAW_REVIEW_FALLBACK_NO_STATE_MUST_NOT_PERSIST'
  });
  assert.deepEqual(reviewFallbackNoState.results.map((result) => result.status), ['applied']);
  assert.deepEqual(reviewFallbackNoState.generationCalls, ['commandBearingEvaluator', 'commandBearingEvaluator']);
  assert.equal(reviewFallbackNoState.coreCommits.length, 2);
  assert.equal(reviewFallbackNoState.promptFlushes.length, 0);
  assert.deepEqual(reviewFallbackNoState.schedulerPromptSyncs.map((entry) => entry.commandBearingReview), [false, true]);
  assert.equal(reviewFallbackNoState.state.commandBearing.evidenceLedger?.records?.length || 0, 0);
  assert.equal(reviewFallbackNoState.state.commandBearing.reviewLedger?.records?.length || 0, 0, 'Fallback no-state review prompt sync must restore transient v1 review ledger roots.');
  assert.equal(reviewFallbackNoState.state.commandBearing.tracks?.resolve?.marks || 0, 0, 'Fallback no-state review prompt sync must restore transient v1 track marks.');
  assertNoTransientCommandBearingReviewTracking(
    reviewFallbackNoState,
    reviewFallbackNoState.schedulerPromptSyncs.find((entry) => entry.commandBearingReview)?.revision,
    'Fallback no-state review prompt sync'
  );
  assert.equal(reviewFallbackNoState.persistReasons.some((reason) => String(reason || '').includes('closure review prompt context synchronized')), false);
  assert.equal(reviewFallbackNoState.results[0].postSettlementWarnings.length, 1);
  assert.equal(reviewFallbackNoState.results[0].postSettlementWarnings[0].stage, 'promptSync');
  assert.equal(reviewFallbackNoState.results[0].postSettlementWarnings[0].code, 'DIRECTIVE_SIDECAR_POST_SETTLEMENT_REVIEW_SYNC_NO_STATE');
  assert.equal(JSON.stringify(reviewFallbackNoState.results).includes(reviewFallbackNoState.rawCanary), false);
  assert.equal(JSON.stringify(reviewFallbackNoState.state).includes(reviewFallbackNoState.rawCanary), false);
}

{
  const reviewLensFailure = await runCommandBearingReviewPromptScenario({
    suffix: 'review-lens-failure',
    reviewFlushThrows: true,
    rawCanary: 'RAW_REVIEW_LENS_FAILURE_MUST_NOT_PERSIST'
  });
  assert.deepEqual(reviewLensFailure.results.map((result) => result.status), ['applied']);
  assert.deepEqual(reviewLensFailure.generationCalls, ['commandBearingEvaluator', 'commandBearingEvaluator']);
  assert.equal(reviewLensFailure.coreCommits.length, 2);
  assert.equal(reviewLensFailure.promptFlushes.length, 1);
  assert.deepEqual(reviewLensFailure.schedulerPromptSyncs.map((entry) => entry.commandBearingReview), [false]);
  assert.equal(reviewLensFailure.state.commandBearing.evidenceLedger?.records?.length || 0, 0);
  assert.equal(reviewLensFailure.state.commandBearing.reviewLedger?.records?.length || 0, 0, 'LENS prompt failure must not leave old v1 review roots applied.');
  assert.equal(reviewLensFailure.state.commandBearing.tracks?.resolve?.marks || 0, 0);
  assertNoTransientCommandBearingReviewTracking(reviewLensFailure, reviewLensFailure.promptFlushes[0].campaignRevision, 'LENS prompt failure');
  assert.deepEqual(reviewLensFailure.persistReasons, [
    'Campaign sidecar batch prompt context synchronized.'
  ]);
  assert.equal(reviewLensFailure.results[0].postSettlementWarnings.length, 1);
  assert.equal(reviewLensFailure.results[0].postSettlementWarnings[0].stage, 'lens');
  assert.equal(reviewLensFailure.results[0].postSettlementWarnings[0].code, 'DIRECTIVE_LENS_REVIEW_FLUSH_FAILED');
  assert.equal(JSON.stringify(reviewLensFailure.results).includes(reviewLensFailure.rawCanary), false);
  assert.equal(JSON.stringify(reviewLensFailure.state).includes(reviewLensFailure.rawCanary), false);
}

{
  const reviewKeyFirst = await runCommandBearingReviewPromptScenario({
    suffix: 'review-key-stable-source'
  });
  const reviewKeySecond = await runCommandBearingReviewPromptScenario({
    suffix: 'review-key-stable-source',
    awardSummary: 'The commander reframed the same completed milestone as a visible restraint under operational pressure.'
  });
  assert.equal(reviewKeyFirst.promptFlushes.length, 1);
  assert.equal(reviewKeySecond.promptFlushes.length, 1);
  const firstReviewHash = reviewKeyFirst.coreCommits[1].bundle.forgeBatchRef.reviewHash;
  const secondReviewHash = reviewKeySecond.coreCommits[1].bundle.forgeBatchRef.reviewHash;
  assert.notEqual(firstReviewHash, secondReviewHash, 'Review hash must distinguish distinct review content for the same source/base.');
  assert.equal(
    reviewKeyFirst.promptFlushes[0].promptSyncIdempotencyKey.split(':prompt-sync:command-bearing-review:')[0],
    reviewKeySecond.promptFlushes[0].promptSyncIdempotencyKey.split(':prompt-sync:command-bearing-review:')[0],
    'Review prompt keys should share the same provider/source base for identical reviewed state.'
  );
  assert.equal(reviewKeyFirst.promptFlushes[0].promptSyncIdempotencyKey.endsWith(`:${firstReviewHash}`), true);
  assert.equal(reviewKeySecond.promptFlushes[0].promptSyncIdempotencyKey.endsWith(`:${secondReviewHash}`), true);
  assert.notEqual(reviewKeyFirst.promptFlushes[0].promptSyncIdempotencyKey, reviewKeySecond.promptFlushes[0].promptSyncIdempotencyKey);
}

{
  const wrongReviewIdempotency = await runCommandBearingReviewPromptScenario({
    suffix: 'review-wrong-idempotency',
    reviewCommitBackground: (transactionId, bundle) => ({
      id: transactionId,
      backgroundBatchId: bundle.batchId,
      backgroundBatchIds: [bundle.batchId],
      backgroundIdempotencyKey: `${bundle.idempotencyKey}:stale`,
      backgroundIdempotencyKeys: [`${bundle.idempotencyKey}:stale`],
      backgroundBatches: [{
        batchId: bundle.batchId,
        idempotencyKey: `${bundle.idempotencyKey}:stale`,
        forgeBatchRef: cloneJson(bundle.forgeBatchRef || {})
      }],
      backgroundEffectRefs: cloneJson(bundle.backgroundEffectRefs || [])
    })
  });
  assert.deepEqual(wrongReviewIdempotency.results.map((result) => result.status), ['applied']);
  assert.equal(wrongReviewIdempotency.coreCommits.length, 2);
  assert.equal(wrongReviewIdempotency.promptFlushes.length, 0, 'Bad review CORE idempotency receipt must block review prompt flush.');
  assert.deepEqual(wrongReviewIdempotency.schedulerPromptSyncs.map((entry) => entry.commandBearingReview), [false]);
  assert.equal(wrongReviewIdempotency.state.commandBearing.evidenceLedger?.records?.length || 0, 0);
  assert.equal(wrongReviewIdempotency.state.commandBearing.reviewLedger?.records?.length || 0, 0);
  assert.equal(wrongReviewIdempotency.results[0].postSettlementWarnings.length, 1);
  assert.equal(wrongReviewIdempotency.results[0].postSettlementWarnings[0].stage, 'commandBearingReview');
  assert.equal(wrongReviewIdempotency.results[0].postSettlementWarnings[0].code, 'DIRECTIVE_COMMAND_BEARING_REVIEW_SETTLEMENT_FAILED');
}

{
  const reviewFlushRace = await runCommandBearingReviewPromptScenario({
    suffix: 'review-flush-race',
    mutateLiveStateDuringReviewFlush: true,
    rawCanary: 'RAW_REVIEW_FLUSH_RACE_MUST_NOT_PERSIST'
  });
  assert.deepEqual(reviewFlushRace.results.map((result) => result.status), ['applied']);
  assert.equal(reviewFlushRace.promptFlushes.length, 1);
  assert.equal(reviewFlushRace.promptFlushes[0].commitRuntimeState, false);
  assert.equal(reviewFlushRace.promptFlushes[0].beforeInstallPrompt, true);
  assert.equal(reviewFlushRace.promptFlushes[0].beforeInstallPromptResult?.ok, false);
  assert.equal(reviewFlushRace.promptFlushes[0].beforeInstallPromptResult?.code, 'DIRECTIVE_SIDECAR_POST_SETTLEMENT_STATE_STALE');
  assert.deepEqual(reviewFlushRace.schedulerPromptSyncs.map((entry) => entry.commandBearingReview), [false]);
  assert.equal(reviewFlushRace.state.commandBearing.evidenceLedger?.records?.length || 0, 0);
  assert.equal(reviewFlushRace.state.commandBearing.reviewLedger?.records?.length || 0, 0, 'Stale review prompt install must not leave old v1 review roots applied.');
  assert.equal(reviewFlushRace.state.commandBearing.tracks?.resolve?.marks || 0, 0);
  assertNoTransientCommandBearingReviewTracking(reviewFlushRace, reviewFlushRace.promptFlushes[0].campaignRevision, 'Stale review prompt install');
  assert.equal(reviewFlushRace.state.commandLog.entries.some((entry) => entry.id === 'external-review-flush-race-review-flush-race'), true);
  assert.equal(reviewFlushRace.state.campaignChatBinding.promptContextOwner, 'external-review-flush-race-review-flush-race');
  assert.equal(reviewFlushRace.persistReasons.includes('Command Bearing sidecar closure review prompt context synchronized.'), false);
  assert.equal(reviewFlushRace.results[0].postSettlementWarnings.length, 1);
  assert.equal(reviewFlushRace.results[0].postSettlementWarnings[0].stage, 'lens');
  assert.equal(reviewFlushRace.results[0].postSettlementWarnings[0].code, 'DIRECTIVE_SIDECAR_POST_SETTLEMENT_STATE_STALE');
  assert.equal(JSON.stringify(reviewFlushRace.results).includes(reviewFlushRace.rawCanary), false);
  assert.equal(JSON.stringify(reviewFlushRace.state).includes(reviewFlushRace.rawCanary), false);
}

{
  const reviewTrackedFlushRace = await runCommandBearingReviewPromptScenario({
    suffix: 'review-tracked-flush-race',
    trackedLiveStateDuringReviewFlush: true,
    seedBaseTrackingHistory: true,
    rawCanary: 'RAW_REVIEW_TRACKED_FLUSH_RACE_MUST_NOT_PERSIST'
  });
  assert.deepEqual(reviewTrackedFlushRace.results.map((result) => result.status), ['applied']);
  assert.equal(reviewTrackedFlushRace.promptFlushes.length, 1);
  assert.equal(reviewTrackedFlushRace.promptFlushes[0].commitRuntimeState, false);
  assert.equal(reviewTrackedFlushRace.promptFlushes[0].beforeInstallPrompt, true);
  assert.equal(reviewTrackedFlushRace.promptFlushes[0].beforeInstallPromptResult?.ok, false);
  assert.deepEqual(reviewTrackedFlushRace.schedulerPromptSyncs.map((entry) => entry.commandBearingReview), [false]);
  assert.equal(reviewTrackedFlushRace.state.commandBearing.evidenceLedger?.records?.length || 0, 0);
  assert.equal(reviewTrackedFlushRace.state.commandBearing.reviewLedger?.records?.length || 0, 0);
  assert.equal(reviewTrackedFlushRace.state.commandBearing.tracks?.resolve?.marks || 0, 0);
  assert.equal(reviewTrackedFlushRace.state.commandLog.entries.some((entry) => entry.id === 'tracked-review-flush-race-review-tracked-flush-race'), true);
  assert.equal(reviewTrackedFlushRace.state.campaignChatBinding.promptContextOwner, 'tracked-review-flush-race-review-tracked-flush-race');
  assert.equal(reviewTrackedFlushRace.state.runtimeTracking.revision, reviewTrackedFlushRace.promptFlushes[0].campaignRevision + 1);
  assert.equal(reviewTrackedFlushRace.state.runtimeTracking.lastDelta?.reason, 'Tracked external drift during Command Bearing review prompt flush.');
  assertNoCommandBearingReviewTrackingLeak(reviewTrackedFlushRace, 'Tracked stale review prompt install');
  assert.deepEqual(
    reviewTrackedFlushRace.state.runtimeTracking.history,
    [],
    'Review snapshot scrub must not retain pre-existing base history rows.'
  );
  assert.equal(reviewTrackedFlushRace.persistReasons.includes('Command Bearing sidecar closure review prompt context synchronized.'), false);
  assert.equal(reviewTrackedFlushRace.results[0].postSettlementWarnings.length, 1);
  assert.equal(reviewTrackedFlushRace.results[0].postSettlementWarnings[0].stage, 'lens');
  assert.equal(reviewTrackedFlushRace.results[0].postSettlementWarnings[0].code, 'DIRECTIVE_SIDECAR_POST_SETTLEMENT_STATE_STALE');
  assert.equal(JSON.stringify(reviewTrackedFlushRace.results).includes(reviewTrackedFlushRace.rawCanary), false);
  assert.equal(JSON.stringify(reviewTrackedFlushRace.state).includes(reviewTrackedFlushRace.rawCanary), false);
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
  const batchValidateCalls = [];
  const batchGatewayPersists = [];
  const batchPersistReasons = [];
  const batchPromptSyncs = [];
  const batchForgeBackgroundBatches = [];
  const batchForgeDiagnostics = [];
  const batchSchedulerDiagnosticBatches = [];
  const batchSetStateSnapshots = [];
  const batchGateway = createStateDeltaGateway({
    getState: () => batchState,
    setState: (next) => { batchState = cloneJson(next); },
    persist: async (next, proposal) => {
      batchGatewayPersists.push({ revision: next.runtimeTracking?.revision || 0, proposal: cloneJson(proposal) });
      batchState = cloneJson(next);
    },
    now
  });
  const originalBatchApplyOperations = batchGateway.applyOperations;
  const originalBatchValidateOperations = batchGateway.validateOperations;
  batchGateway.applyOperations = async (proposal, policy) => {
    batchApplyCalls.push({ proposal: cloneJson(proposal), policy: cloneJson(policy || {}) });
    assert.fail('Accepted sidecar bridge must not mutate runtime state through old applyOperations before CORE/FORGE settlement.');
    return originalBatchApplyOperations(proposal, policy);
  };
  batchGateway.validateOperations = async (proposal, policy) => {
    batchValidateCalls.push({ proposal: cloneJson(proposal), policy: cloneJson(policy || {}) });
    return originalBatchValidateOperations(proposal, policy);
  };
  const batchForgeCoordinator = createForgeCoordinator({
    coreStore: {
      async commitBackgroundBatch(transactionId, bundle) {
        batchForgeBackgroundBatches.push({ transactionId, bundle: cloneJson(bundle) });
        return forgeBackgroundTransaction(transactionId, bundle);
      },
      async appendDiagnostics(transactionId, diagnostic) {
        batchForgeDiagnostics.push({ transactionId, diagnostic: cloneJson(diagnostic) });
        return { id: `forge-diagnostic-${batchForgeDiagnostics.length}`, transactionId, diagnostic: cloneJson(diagnostic) };
      }
    },
    clock: now
  });
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
    setCampaignState: (next) => {
      batchSetStateSnapshots.push(cloneJson(next));
      batchState = cloneJson(next);
    },
    persistCampaignState: async (next, reason) => {
      batchPersistReasons.push(reason || null);
      batchState = cloneJson(next);
    },
    syncPromptContext: async (next, details, options = {}) => {
      batchPromptSyncs.push({
        revision: next.runtimeTracking.revision,
        details: cloneJson(details),
        activityContext: cloneJson(options.activityContext || {})
      });
      const synchronized = cloneJson(next);
      synchronized.campaignChatBinding = {
        ...(synchronized.campaignChatBinding || {}),
        promptContextRevision: (synchronized.campaignChatBinding?.promptContextRevision || 0) + 1
      };
      return synchronized;
    },
    appendCoreDiagnosticsBatch: async (events) => {
      batchSchedulerDiagnosticBatches.push(cloneJson(events));
      return events.map((event, index) => ({ id: `scheduler-batch-diagnostic-${index + 1}`, event: cloneJson(event) }));
    },
    forgeCoordinator: batchForgeCoordinator,
    commitCoreBackgroundBatch: async () => {
      assert.fail('Campaign sidecar accepted batches should settle through FORGE before the direct CORE fallback.');
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
  assert.equal(batchApplyCalls.length, 0);
  assert.equal(batchValidateCalls.length, 1);
  assert.deepEqual(batchValidateCalls[0].proposal.workerId, 'campaignSidecarBatch');
  assert.equal(batchValidateCalls[0].proposal.operations.length, 3);
  assert.deepEqual(batchValidateCalls[0].policy.allowedRoots.sort(), ['crew', 'relationships', 'ship']);
  assert.equal(batchGatewayPersists.length, 0, 'StateDeltaGateway must not persist accepted sidecar projection before final CORE/FORGE settlement.');
  assert.equal(batchPromptSyncs.length, 0, 'FORGE-settled batches without a LENS prompt helper must not call scheduler-owned syncPromptContext.');
  assert.deepEqual(batchPersistReasons, [], 'FORGE-settled accepted sidecars must not persist v1 compatibility projection roots.');
  assert.equal(
    batchSetStateSnapshots.some((snapshot) => (
      (snapshot.relationships?.seniorCrew || []).length > 0
      || (snapshot.crew?.casualties || []).length > 0
      || snapshot.ship?.condition === 'Damaged but mobile'
    )),
    false,
    'FORGE-settled accepted sidecars must not assign projected v1 roots into runtime state.'
  );
  assert.equal(batchResults.every((result) => result.postSettlementWarnings?.[0]?.stage === 'lens'), true);
  assert.equal(batchResults.every((result) => result.postSettlementWarnings?.[0]?.code === 'DIRECTIVE_SIDECAR_POST_SETTLEMENT_LENS_FLUSH_UNAVAILABLE'), true);
  assert.equal(batchForgeBackgroundBatches.length, 1);
  assert.equal(batchForgeBackgroundBatches[0].transactionId, 'txn-batch-1');
  assert.equal(batchForgeBackgroundBatches[0].bundle.sourceToken, 'turnSourceFrame:frame-batch-1');
  assert.equal(batchForgeBackgroundBatches[0].bundle.sourceFrameRef.id, 'frame-batch-1');
  assert.equal(batchForgeBackgroundBatches[0].bundle.sourceFrameRef.textHash, 'batch-source-hash');
  assert.equal(batchForgeBackgroundBatches[0].bundle.sourceFrameRef.selectedAssistantVariantHash, 'batch-selected-assistant-hash');
  assert.equal(batchForgeBackgroundBatches[0].bundle.sourceFrameRef.externalPromptEnvironmentRef.knownExternalPromptKeys.includes('summaryception'), true);
  assert.equal(batchForgeBackgroundBatches[0].bundle.operations.length, 3);
  assert.deepEqual(batchForgeBackgroundBatches[0].bundle.promptDirtyDomains, ['crewShipRelationship']);
  assert.equal(batchForgeBackgroundBatches[0].bundle.forgeBatchRef.kind, 'directive.forgeBatchCommitRef.v1');
  assert.match(batchForgeBackgroundBatches[0].bundle.forgeBatchRef.operationBundleHash, /^[a-f0-9]{64}$/);
  assert.equal(batchForgeBackgroundBatches[0].bundle.forgeBatchRef.workerCount, 3);
  assert.equal(batchForgeBackgroundBatches[0].bundle.forgeBatchRef.operationCount, 3);
  assert.deepEqual(batchForgeBackgroundBatches[0].bundle.workers.map((entry) => entry.workerId), ['relationship', 'crew', 'ship']);
  assert.equal(batchForgeBackgroundBatches[0].bundle.workers.every((entry) => entry.status === 'accepted'), true);
  assert.equal(batchForgeDiagnostics.length, 0, 'Scheduler-owned FORGE settlement diagnostics should join the scheduler diagnostics batch instead of writing a separate segment.');
  assert.equal(batchSchedulerDiagnosticBatches.length, 1, 'scheduler should flush one CORE diagnostics batch for the sidecar job.');
  const batchSchedulerDiagnosticStatuses = batchSchedulerDiagnosticBatches[0].map((entry) => entry.status);
  assert.equal(
    batchSchedulerDiagnosticStatuses.includes('providerBatchComplete'),
    true,
    'scheduler diagnostics batch should include FORGE provider-batch completion with worker lifecycle diagnostics.'
  );
  assert.equal(
    batchSchedulerDiagnosticStatuses.includes('settled'),
    true,
    'scheduler diagnostics batch should include FORGE accepted-batch settlement with worker lifecycle diagnostics.'
  );
  assert.equal(batchSchedulerDiagnosticBatches[0].filter((entry) => entry.type === 'forge').length, 2);
  assert.equal(batchSchedulerDiagnosticBatches[0].filter((entry) => entry.type === 'sidecar').length, 9);
  const schedulerProviderDiagnostic = batchSchedulerDiagnosticBatches[0].find((entry) => entry.type === 'forge' && entry.status === 'providerBatchComplete');
  assert.equal(schedulerProviderDiagnostic.providerCallAttempted, true);
  assert.equal(schedulerProviderDiagnostic.providerOwner, 'forge');
  assert.equal(schedulerProviderDiagnostic.upstreamOwner, 'campaignSidecarScheduler');
  assert.equal(schedulerProviderDiagnostic.jobCount, 3);
  assert.equal(schedulerProviderDiagnostic.results.every((entry) => entry.packetHash), true);
  const schedulerSettlementDiagnostic = batchSchedulerDiagnosticBatches[0].find((entry) => entry.type === 'forge' && entry.status === 'settled');
  assert.equal(schedulerSettlementDiagnostic.providerCallAttempted, false);
  assert.equal(schedulerSettlementDiagnostic.providerOwner, 'campaignSidecarScheduler');
  assert.equal(schedulerSettlementDiagnostic.operationCount, 3);
  assert.equal(JSON.stringify(batchForgeBackgroundBatches).includes('RAW_BATCH_FRAME_TEXT_MUST_NOT_PERSIST'), false);
  assert.equal(JSON.stringify(batchForgeDiagnostics).includes('RAW_BATCH_FRAME_TEXT_MUST_NOT_PERSIST'), false);
  const batchReplayWithoutEvidence = await batchForgeCoordinator.settleAcceptedBatch({
    transactionId: 'txn-batch-1',
    idempotencyKey: 'campaign-sidecar:txn-batch-1:outcome-batch-1',
    workerResults: []
  });
  assert.equal(batchReplayWithoutEvidence.status, 'rejected');
  assert.equal(batchReplayWithoutEvidence.reason, 'accepted-batch-replay-mismatch');
  const batchReplay = await batchForgeCoordinator.settleAcceptedBatch({
    transactionId: 'txn-batch-1',
    idempotencyKey: 'campaign-sidecar:txn-batch-1:outcome-batch-1',
    acceptedBatchHash: batchResults[0].forgeSettlement.acceptedBatchHash,
    workerResults: []
  });
  assert.equal(batchReplay.status, 'replayed');
  assert.equal(batchForgeBackgroundBatches.length, 1);
  assert.equal(batchForgeDiagnostics.length, 1, 'Only direct replay-mismatch evidence should bypass the scheduler diagnostics batch.');
  assert.equal(batchState.runtimeTracking.revision, 0);
  assert.equal(batchState.campaignChatBinding?.promptContextRevision || 0, 0);
  assert.equal(batchState.relationships.seniorCrew.length, 0);
  assert.equal(batchState.crew.casualties.length, 0);
  assert.equal(batchState.ship.condition, 'Operational');
  assert.equal(batchState.runtimeTracking.sidecarJournal.length, 0, 'Accepted FORGE-settled sidecar batches must not duplicate applied entries into the old v1 sidecar journal.');
  assert.equal(JSON.stringify(batchResults).includes('RAW_BATCH_FRAME_TEXT_MUST_NOT_PERSIST'), false);
  const duplicateBatchResults = await batchScheduler.schedule({
    workerPlan: { relationship: true, crew: true, ship: true },
    turnContext: {
      ingressId: 'ingress-batch-1',
      turnId: 'turn-batch-1',
      outcomeId: 'outcome-batch-1'
    }
  });
  assert.deepEqual(duplicateBatchResults.map((result) => result.status), ['applied', 'applied', 'applied']);
  assert.equal(batchCalls.length, 1, 'Clean accepted-batch replay must reuse provider batch result instead of regenerating sidecars.');
  assert.equal(batchApplyCalls.length, 0);
  assert.equal(batchValidateCalls.length, 1);
  assert.equal(batchPromptSyncs.length, 0);
  assert.equal(batchForgeBackgroundBatches.length, 1);
  assert.equal(batchForgeDiagnostics.length, 1);
  assert.equal(batchState.runtimeTracking.sidecarJournal.length, 0);
  batchState = updateTurnIngress(batchState, 'ingress-batch-1', {
    status: 'invalidated',
    invalidatedAt: '2026-06-22T06:04:00.000Z',
    invalidationType: 'playerMessageEdited',
    replacementText: 'Edited source after accepted provider cache.',
    textHash: 'batch-1-edited-hash'
  });
  const staleCachedBatchResults = await batchScheduler.schedule({
    workerPlan: { relationship: true, crew: true, ship: true },
    turnContext: {
      ingressId: 'ingress-batch-1',
      turnId: 'turn-batch-1',
      outcomeId: 'outcome-batch-1'
    }
  });
  assert.deepEqual(staleCachedBatchResults.map((result) => result.status), ['rejected', 'rejected', 'rejected']);
  assert.equal(staleCachedBatchResults.every((result) => result.error.code === 'DIRECTIVE_SIDECAR_SOURCE_STALE'), true);
  assert.equal(batchCalls.length, 1, 'Stale provider-batch replay must reject before provider generation.');
  assert.equal(batchValidateCalls.length, 1, 'Stale provider-batch replay must not revalidate cached accepted operations.');
}

{
  const campaignId = 'campaign-sidecar-real-core-replay-test';
  const saveId = 'save-sidecar-real-core-replay-test';
  const chatId = 'campaign-chat';
  const coreStore = createCoreStoreV2({
    adapter: createLogicalStorageAdapter({ storage: createMemoryStorage(), hostId: 'fake' }),
    campaignId,
    saveId,
    now
  });
  const sourceFrame = {
    id: 'frame-real-core-batch',
    campaignId,
    saveId,
    chatId,
    hostMessageId: 'player-real-core-batch',
    textHash: 'real-core-source-hash',
    createdAt: now()
  };
  const coreTransaction = await coreStore.beginTurn(sourceFrame, {
    transactionId: 'txn-real-core-batch',
    ingressId: 'ingress-real-core-batch',
    idempotencyKey: 'begin-real-core-batch'
  });
  await coreStore.advanceTurn(coreTransaction.id, {
    phase: 'routePending',
    route: 'directiveCommit',
    idempotencyKey: 'route-real-core-batch'
  });
  let realCoreState = initializeCampaignRuntimeTracking({
    campaign: { id: campaignId, status: 'active' },
    campaignChatBinding: { campaignId, saveId, chatId, branchId: 'main' },
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
  realCoreState = recordTurnIngress(realCoreState, {
    id: 'ingress-real-core-batch',
    hostMessageId: 'player-real-core-batch',
    chatId,
    campaignId,
    textHash: 'real-core-source-hash',
    textPreview: 'Source message for real CORE replay.',
    status: 'committed',
    outcomeId: 'outcome-real-core-batch',
    sourceFrameId: sourceFrame.id,
    sourceFrame,
    coreTransactionId: coreTransaction.id
  });
  const realCoreGateway = createStateDeltaGateway({
    getState: () => realCoreState,
    setState: (next) => { realCoreState = cloneJson(next); },
    persist: async (next) => { realCoreState = cloneJson(next); },
    now
  });
  const realCoreValidateCalls = [];
  const originalRealCoreValidate = realCoreGateway.validateOperations;
  realCoreGateway.validateOperations = async (proposal, policy) => {
    realCoreValidateCalls.push({ proposal: cloneJson(proposal), policy: cloneJson(policy || {}) });
    return originalRealCoreValidate(proposal, policy);
  };
  let realCoreProviderBatchCalls = 0;
  const realCoreScheduler = createCampaignSidecarScheduler({
    generationRouter: {
      async generate() {
        assert.fail('Real CORE replay fixture should use batch sidecar generation.');
      },
      async batch(requests) {
        realCoreProviderBatchCalls += 1;
        return requests.map((request) => ({
          ok: true,
          response: {
            text: JSON.stringify({
              id: `real-core-${request.roleId}`,
              operations: request.roleId === 'relationshipEvaluator'
                ? [{
                    op: 'append',
                    path: 'relationships.memoryLedger',
                    value: { id: 'real-core-relationship-memory-1', summary: 'First relationship memory append.' }
                  }, {
                    op: 'append',
                    path: 'relationships.memoryLedger',
                    value: { id: 'real-core-relationship-memory-2', summary: 'Second relationship memory append.' }
                  }]
                : [{
                    op: 'append',
                    path: 'crew.casualties',
                    value: { id: `real-core-${request.roleId}`, summary: 'Real CORE replay must not mutate v1 roots.' }
                  }],
              summary: 'Accepted proposal for real CORE replay.'
            })
          }
        }));
      }
    },
    stateDeltaGateway: realCoreGateway,
    getCampaignState: () => realCoreState,
    setCampaignState: (next) => { realCoreState = cloneJson(next); },
    persistCampaignState: async (next) => { realCoreState = cloneJson(next); },
    forgeCoordinator: createForgeCoordinator({
      coreStore: {
        commitBackgroundBatch: (transactionId, bundle) => coreStore.commitBackgroundBatch(transactionId, bundle),
        appendDiagnostics: (transactionId, event) => coreStore.appendDiagnostics(transactionId, event)
      },
      clock: now
    }),
    now
  });
  const realCoreFirst = await realCoreScheduler.schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-real-core-batch',
      turnId: 'turn-real-core-batch',
      outcomeId: 'outcome-real-core-batch'
    }
  });
  const realCoreReplay = await realCoreScheduler.schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-real-core-batch',
      turnId: 'turn-real-core-batch',
      outcomeId: 'outcome-real-core-batch'
    }
  });
  assert.deepEqual(realCoreFirst.map((result) => result.status), ['applied', 'applied']);
  assert.deepEqual(realCoreReplay.map((result) => result.status), ['applied', 'applied']);
  assert.equal(realCoreReplay.every((result) => result.replayed === true), true);
  assert.equal(realCoreReplay.every((result) => result.forgeSettlement?.status === 'settled'), true);
  assert.equal(realCoreProviderBatchCalls, 1, 'Real CORE accepted-batch replay must not regenerate provider sidecars.');
  assert.equal(realCoreValidateCalls.length, 1, 'Real CORE accepted-batch replay must not revalidate cached accepted operations.');
  assert.equal(realCoreState.relationships.seniorCrew.length, 0);
  assert.equal(realCoreState.crew.casualties.length, 0);
  assert.equal(realCoreState.runtimeTracking.sidecarJournal.length, 0);
}

{
  let staleReplayState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-stale-provider-replay-test', status: 'active' },
    campaignChatBinding: {
      campaignId: 'campaign-sidecar-stale-provider-replay-test',
      saveId: 'save-sidecar-stale-provider-replay-test',
      chatId: 'campaign-chat',
      branchId: 'main'
    },
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
  staleReplayState = recordTurnIngress(staleReplayState, {
    id: 'ingress-stale-provider-replay',
    hostMessageId: 'player-stale-provider-replay',
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-stale-provider-replay-test',
    textHash: 'stale-provider-replay-source-hash',
    textPreview: 'Source message for stale provider replay.',
    status: 'committed',
    outcomeId: 'outcome-stale-provider-replay',
    sourceFrameId: 'frame-stale-provider-replay',
    sourceFrame: {
      kind: 'directive.turnSourceFrame.v1',
      schemaVersion: 1,
      id: 'frame-stale-provider-replay',
      campaignId: 'campaign-sidecar-stale-provider-replay-test',
      saveId: 'save-sidecar-stale-provider-replay-test',
      chatId: 'campaign-chat',
      hostMessageId: 'player-stale-provider-replay',
      textHash: 'stale-provider-replay-source-hash'
    },
    coreTransactionId: 'txn-stale-provider-replay'
  });
  const staleReplayGateway = createStateDeltaGateway({
    getState: () => staleReplayState,
    setState: (next) => { staleReplayState = cloneJson(next); },
    persist: async (next) => { staleReplayState = cloneJson(next); },
    now
  });
  const staleReplayBatchCalls = [];
  const staleReplayCommits = [];
  const staleReplayPromptFlushes = [];
  const staleReplayScheduler = createCampaignSidecarScheduler({
    generationRouter: {
      async generate() {
        assert.fail('Multiple requested campaign sidecars should use the batch generation path.');
      },
      async batch(requests) {
        staleReplayBatchCalls.push(requests.map((request) => request.roleId));
        return requests.map((request) => ({
          ok: true,
          response: {
            text: JSON.stringify({
              id: `stale-provider-replay-${request.roleId}`,
              operations: [{
                op: 'append',
                path: request.roleId === 'crewDirector' ? 'crew.casualties' : 'relationships.seniorCrew',
                value: { id: `stale-provider-replay-${request.roleId}`, summary: 'Cacheable accepted sidecar result.' }
              }],
              summary: 'Cacheable accepted provider replay result.'
            })
          }
        }));
      }
    },
    stateDeltaGateway: staleReplayGateway,
    getCampaignState: () => staleReplayState,
    setCampaignState: (next) => { staleReplayState = cloneJson(next); },
    persistCampaignState: async (next) => { staleReplayState = cloneJson(next); },
    commitCoreBackgroundBatch: async (transactionId, bundle) => {
      staleReplayCommits.push({ transactionId, bundle: cloneJson(bundle) });
      return forgeBackgroundTransaction(transactionId, bundle);
    },
    forgeCoordinator: createTestAcceptedForgeCoordinator({
      commits: staleReplayCommits,
      acceptedBatchPromptFlusher: async (input = {}) => {
        staleReplayPromptFlushes.push(cloneJson(input.coreAcceptedBatchProjection || null));
        const synchronized = cloneJson(input.campaignState);
        synchronized.campaignChatBinding = {
          ...(synchronized.campaignChatBinding || {}),
          promptContextRevision: (synchronized.campaignChatBinding?.promptContextRevision || 0) + 1,
          promptContextOwner: 'stale-provider-replay'
        };
        return { ok: true, status: 'rebuilt', campaignState: synchronized };
      }
    }),
    now
  });
  const staleReplayFirst = await staleReplayScheduler.schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-stale-provider-replay',
      turnId: 'turn-stale-provider-replay',
      outcomeId: 'outcome-stale-provider-replay'
    }
  });
  staleReplayState = updateTurnIngress(staleReplayState, 'ingress-stale-provider-replay', {
    status: 'committed',
    replacementText: 'Edited after cacheable accepted provider batch.',
    textHash: null
  });
  const staleReplaySecond = await staleReplayScheduler.schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-stale-provider-replay',
      turnId: 'turn-stale-provider-replay',
      outcomeId: 'outcome-stale-provider-replay'
    }
  });
  assert.deepEqual(staleReplayFirst.map((result) => result.status), ['applied', 'applied']);
  assert.deepEqual(staleReplaySecond.map((result) => result.status), ['rejected', 'rejected']);
  assert.equal(staleReplaySecond.every((result) => result.error.code === 'DIRECTIVE_SIDECAR_SOURCE_STALE'), true);
  assert.equal(staleReplayBatchCalls.length, 1, 'Stale cacheable provider replay must reject before a second provider call.');
  assert.equal(staleReplayCommits.length, 1, 'Stale cacheable provider replay must not create a second CORE/FORGE settlement.');
  assert.equal(staleReplayPromptFlushes.length, 1, 'Stale cacheable provider replay must not rebuild prompt context.');
}

{
  let forgeLensPromptState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-forge-lens-prompt-test', status: 'active' },
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
  forgeLensPromptState = recordTurnIngress(forgeLensPromptState, {
    id: 'ingress-forge-lens-prompt',
    hostMessageId: 'player-forge-lens-prompt',
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-forge-lens-prompt-test',
    textHash: 'forge-lens-prompt-source-hash',
    textPreview: 'Source message for FORGE LENS prompt flush.',
    status: 'committed',
    outcomeId: 'outcome-forge-lens-prompt',
    sourceFrameId: 'frame-forge-lens-prompt',
    sourceFrame: {
      kind: 'directive.turnSourceFrame.v1',
      schemaVersion: 1,
      id: 'frame-forge-lens-prompt',
      campaignId: 'campaign-sidecar-forge-lens-prompt-test',
      saveId: 'save-sidecar-forge-lens-prompt-test',
      chatId: 'campaign-chat',
      hostMessageId: 'player-forge-lens-prompt',
      textHash: 'forge-lens-prompt-source-hash',
      selectedAssistantVariantHash: 'forge-lens-prompt-selected-assistant-hash',
      externalPromptEnvironmentRef: {
        kind: 'directive.externalPromptEnvironmentRef.v1',
        schemaVersion: 1,
        hash: 'd'.repeat(64),
        byteLength: 192,
        status: 'observed',
        observedAt: '2026-06-22T06:02:00.000Z',
        knownExternalPromptKeys: ['worldInfoBefore', 'summaryception']
      },
      rawPlayerText: 'RAW_FORGE_LENS_FRAME_TEXT_MUST_NOT_PERSIST'
    },
    coreTransactionId: 'txn-forge-lens-prompt'
  });
  const forgeLensGateway = createStateDeltaGateway({
    getState: () => forgeLensPromptState,
    setState: (next) => { forgeLensPromptState = cloneJson(next); },
    persist: async () => {
      assert.fail('Accepted sidecar bridge must not persist the old projection through StateDeltaGateway before CORE/FORGE settlement.');
    },
    now
  });
  const forgeLensPersistReasons = [];
  const forgeLensSchedulerPromptSyncs = [];
  const forgeLensBackgroundBatches = [];
  const forgeLensDiagnostics = [];
  const forgeLensPromptFlushCalls = [];
  const forgeLensPromptFlushPersistReasons = [];
  const forgeLensBatchCalls = [];
  const forgeLensCoordinator = {
    async prepareAcceptedBatch() {
      return { status: 'prepared' };
    },
    async settleAcceptedBatch(input = {}) {
      const background = forgeBackgroundTransaction(input.transactionId, {
        batchId: input.batchId,
        idempotencyKey: input.idempotencyKey,
        forgeBatchRef: { acceptedBatchHash: input.acceptedBatchHash }
      });
      forgeLensBackgroundBatches.push({
        transactionId: input.transactionId,
        bundle: {
          batchId: input.batchId,
          idempotencyKey: input.idempotencyKey,
          acceptedBatchHash: input.acceptedBatchHash,
          workerCount: input.workerResults?.length || 0
        }
      });
      return {
        status: 'settled',
        transactionId: input.transactionId,
        acceptedBatchHash: input.acceptedBatchHash,
        background
      };
    },
    async flushAcceptedBatchPrompt(input = {}) {
      forgeLensPromptFlushCalls.push({
        transactionId: input.transactionId || null,
        promptDirtyDomains: cloneJson(input.promptDirtyDomains || []),
        promptSyncIdempotencyKey: input.promptSyncIdempotencyKey || null,
        idempotencyKey: input.idempotencyKey || null,
        workerKey: input.workerKey || null,
        workerKeys: cloneJson(input.workerKeys || []),
        aggregateBatch: input.aggregateBatch === true,
        binding: cloneJson(input.binding || {}),
        campaignContext: cloneJson(input.campaignContext || {}),
        sourceFrameRef: cloneJson(input.sourceFrameRef || null),
        sourceToken: input.sourceToken || null,
        coreAcceptedBatchProjection: cloneJson(input.coreAcceptedBatchProjection || null),
        campaignRevision: input.campaignState?.runtimeTracking?.revision || 0,
        activityContext: cloneJson(input.activityContext || {})
      });
      forgeLensPromptFlushPersistReasons.push([...forgeLensPersistReasons]);
      const synchronized = cloneJson(input.campaignState);
      synchronized.campaignChatBinding = {
        ...(synchronized.campaignChatBinding || {}),
        chatId: synchronized.campaignChatBinding?.chatId || 'campaign-chat',
        promptContextRevision: (synchronized.campaignChatBinding?.promptContextRevision || 0) + 1,
        promptContextOwner: 'forge-lens-accepted-batch-test'
      };
      return {
        ok: true,
        status: 'rebuilt',
        campaignState: synchronized,
        lens: { status: 'rebuilt', rebuilt: true, lane: 'background' }
      };
    },
  };
  const forgeLensResults = await createCampaignSidecarScheduler({
    generationRouter: {
      async generate() {
        assert.fail('Multiple requested campaign sidecars should use the batch generation path.');
      },
      async batch(requests) {
        const callIndex = forgeLensBatchCalls.length;
        forgeLensBatchCalls.push(requests.map((request) => request.roleId));
        return requests.map((request) => ({
          ok: true,
          response: {
            text: JSON.stringify({
              id: `forge-lens-${request.roleId}-${callIndex}`,
              operations: [{
                op: 'append',
                path: request.roleId === 'crewDirector' ? 'crew.casualties' : 'relationships.seniorCrew',
                value: { id: `forge-lens-${request.roleId}-${callIndex}`, summary: `FORGE LENS prompt flush sidecar result ${callIndex}.` }
              }],
              summary: `Record FORGE LENS prompt flush evidence ${callIndex}.`
            })
          }
        }));
      }
    },
    stateDeltaGateway: forgeLensGateway,
    getCampaignState: () => forgeLensPromptState,
    setCampaignState: (next) => { forgeLensPromptState = cloneJson(next); },
    persistCampaignState: async (next, reason) => {
      forgeLensPersistReasons.push(reason || null);
      forgeLensPromptState = cloneJson(next);
    },
    syncPromptContext: async (next, details, options = {}) => {
      forgeLensSchedulerPromptSyncs.push({
        revision: next.runtimeTracking?.revision || 0,
        details: cloneJson(details || {}),
        activityContext: cloneJson(options.activityContext || {})
      });
      return null;
    },
    forgeCoordinator: forgeLensCoordinator,
    now
  }).schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-forge-lens-prompt',
      turnId: 'turn-forge-lens-prompt',
      outcomeId: 'outcome-forge-lens-prompt'
    }
  });
  forgeLensPromptState.player.rank = 'Captain';
  const forgeLensRetryResults = await createCampaignSidecarScheduler({
    generationRouter: {
      async generate() {
        assert.fail('Multiple requested campaign sidecars should use the batch generation path.');
      },
      async batch(requests) {
        const callIndex = forgeLensBatchCalls.length;
        forgeLensBatchCalls.push(requests.map((request) => request.roleId));
        return requests.map((request) => ({
          ok: true,
          response: {
            text: JSON.stringify({
              id: `forge-lens-${request.roleId}-${callIndex}`,
              operations: [{
                op: 'append',
                path: request.roleId === 'crewDirector' ? 'crew.casualties' : 'relationships.seniorCrew',
                value: { id: `forge-lens-${request.roleId}-${callIndex}`, summary: `Changed FORGE LENS prompt flush sidecar result ${callIndex}.` }
              }],
              summary: `Record changed FORGE LENS prompt flush evidence ${callIndex}.`
            })
          }
        }));
      }
    },
    stateDeltaGateway: forgeLensGateway,
    getCampaignState: () => forgeLensPromptState,
    setCampaignState: (next) => { forgeLensPromptState = cloneJson(next); },
    persistCampaignState: async (next, reason) => {
      forgeLensPersistReasons.push(reason || null);
      forgeLensPromptState = cloneJson(next);
    },
    syncPromptContext: async (next, details, options = {}) => {
      forgeLensSchedulerPromptSyncs.push({
        revision: next.runtimeTracking?.revision || 0,
        details: cloneJson(details || {}),
        activityContext: cloneJson(options.activityContext || {})
      });
      return null;
    },
    forgeCoordinator: forgeLensCoordinator,
    now
  }).schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-forge-lens-prompt',
      turnId: 'turn-forge-lens-prompt-retry',
      outcomeId: 'outcome-forge-lens-prompt'
    }
  });
  assert.deepEqual(forgeLensResults.map((result) => result.status), ['applied', 'applied']);
  assert.deepEqual(forgeLensRetryResults.map((result) => result.status), ['applied', 'applied']);
  assert.equal(forgeLensBackgroundBatches.length, 2);
  assert.deepEqual(forgeLensPersistReasons, [
    'Campaign sidecar batch prompt context synchronized.',
    'Campaign sidecar batch prompt context synchronized.'
  ]);
  assert.equal(forgeLensSchedulerPromptSyncs.length, 0, 'Accepted FORGE/LENS sidecar batches must not call scheduler-owned syncPromptContext.');
  assert.equal(forgeLensBatchCalls.length, 2);
  assert.equal(forgeLensPromptFlushCalls.length, 2);
  assert.deepEqual(forgeLensPromptFlushPersistReasons[0], []);
  assert.deepEqual(forgeLensPromptFlushPersistReasons[1], ['Campaign sidecar batch prompt context synchronized.']);
  assert.equal(forgeLensPromptFlushCalls[0].transactionId, 'txn-forge-lens-prompt');
  assert.equal(forgeLensPromptFlushCalls[1].transactionId, 'txn-forge-lens-prompt');
  assert.equal(forgeLensPromptFlushCalls[0].coreAcceptedBatchProjection.kind, 'directive.coreAcceptedSidecarBatchProjection.v1');
  assert.equal(forgeLensPromptFlushCalls[0].coreAcceptedBatchProjection.transactionId, 'txn-forge-lens-prompt');
  assert.equal(forgeLensPromptFlushCalls[0].coreAcceptedBatchProjection.batchId, 'campaign-sidecar:txn-forge-lens-prompt:outcome-forge-lens-prompt');
  assert.equal(forgeLensPromptFlushCalls[0].coreAcceptedBatchProjection.idempotencyKey, 'campaign-sidecar:txn-forge-lens-prompt:outcome-forge-lens-prompt');
  assert.equal(forgeLensPromptFlushCalls[0].coreAcceptedBatchProjection.acceptedBatchHash, forgeLensResults[0].forgeSettlement.acceptedBatchHash);
  assert.deepEqual(forgeLensPromptFlushCalls[0].coreAcceptedBatchProjection.workerKeys, ['relationship', 'crew']);
  assert.deepEqual(forgeLensPromptFlushCalls[0].coreAcceptedBatchProjection.dirtyDomains, ['crewShipRelationship']);
  assert.equal(forgeLensPromptFlushCalls[0].coreAcceptedBatchProjection.operationCount, 2);
  assert.equal(forgeLensPromptFlushCalls[0].coreAcceptedBatchProjection.sourceFrameRef.id, 'frame-forge-lens-prompt');
  assert.equal(forgeLensPromptFlushCalls[0].coreAcceptedBatchProjection.sourceFrameRef.textHash, 'forge-lens-prompt-source-hash');
  assert.equal(forgeLensPromptFlushCalls[0].coreAcceptedBatchProjection.runtimeTracking, undefined);
  assert.equal(forgeLensPromptFlushCalls[1].coreAcceptedBatchProjection.acceptedBatchHash, forgeLensRetryResults[0].forgeSettlement.acceptedBatchHash);
  assert.notEqual(forgeLensPromptFlushCalls[0].coreAcceptedBatchProjection.acceptedBatchHash, forgeLensPromptFlushCalls[1].coreAcceptedBatchProjection.acceptedBatchHash);
  assert.deepEqual(forgeLensPromptFlushCalls[0].promptDirtyDomains, ['crewShipRelationship']);
  assert.deepEqual(forgeLensPromptFlushCalls[1].promptDirtyDomains, ['crewShipRelationship']);
  assert.equal(forgeLensPromptFlushCalls[0].workerKey, 'campaignSidecarBatch');
  assert.equal(forgeLensPromptFlushCalls[1].workerKey, 'campaignSidecarBatch');
  assert.deepEqual(forgeLensPromptFlushCalls[0].workerKeys, ['relationship', 'crew']);
  assert.deepEqual(forgeLensPromptFlushCalls[1].workerKeys, ['relationship', 'crew']);
  assert.equal(forgeLensPromptFlushCalls[0].aggregateBatch, true);
  assert.equal(forgeLensPromptFlushCalls[1].aggregateBatch, true);
  assert.equal(forgeLensPromptFlushCalls[0].campaignRevision, 0);
  assert.equal(forgeLensPromptFlushCalls[1].campaignRevision, 0);
  assert.equal(forgeLensPromptState.campaignChatBinding.promptContextRevision, 2);
  assert.equal(forgeLensPromptState.campaignChatBinding.promptContextOwner, 'forge-lens-accepted-batch-test');
  assert.match(forgeLensPromptFlushCalls[0].promptSyncIdempotencyKey, /^campaign-sidecar-provider:txn-forge-lens-prompt:.*:prompt-sync:accepted:[a-f0-9]{64}$/);
  assert.match(forgeLensPromptFlushCalls[1].promptSyncIdempotencyKey, /^campaign-sidecar-provider:txn-forge-lens-prompt:.*:prompt-sync:accepted:[a-f0-9]{64}$/);
  assert.notEqual(forgeLensPromptFlushCalls[0].promptSyncIdempotencyKey, forgeLensPromptFlushCalls[1].promptSyncIdempotencyKey);
  assert.equal(forgeLensPromptFlushCalls[0].idempotencyKey, forgeLensPromptFlushCalls[0].promptSyncIdempotencyKey);
  assert.equal(forgeLensPromptFlushCalls[1].idempotencyKey, forgeLensPromptFlushCalls[1].promptSyncIdempotencyKey);
  assert.deepEqual(forgeLensPromptFlushCalls[0].activityContext.promptDirtyDomains, ['crewShipRelationship']);
  assert.deepEqual(forgeLensPromptFlushCalls[1].activityContext.promptDirtyDomains, ['crewShipRelationship']);
  assert.equal(JSON.stringify(forgeLensBackgroundBatches).includes('RAW_FORGE_LENS_FRAME_TEXT_MUST_NOT_PERSIST'), false);
  assert.equal(JSON.stringify(forgeLensDiagnostics).includes('RAW_FORGE_LENS_FRAME_TEXT_MUST_NOT_PERSIST'), false);
  assert.equal(JSON.stringify(forgeLensPromptFlushCalls).includes('RAW_FORGE_LENS_FRAME_TEXT_MUST_NOT_PERSIST'), false);
}

{
  let requestHashPromptState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-request-hash-prompt-test', status: 'active' },
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
  requestHashPromptState = recordTurnIngress(requestHashPromptState, {
    id: 'ingress-request-hash-prompt',
    hostMessageId: 'player-request-hash-prompt',
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-request-hash-prompt-test',
    textHash: 'request-hash-prompt-source-hash',
    textPreview: 'Source message for provider request hash prompt sync.',
    status: 'committed',
    outcomeId: 'outcome-request-hash-prompt',
    sourceFrameId: 'frame-request-hash-prompt',
    sourceFrame: {
      kind: 'directive.turnSourceFrame.v1',
      schemaVersion: 1,
      id: 'frame-request-hash-prompt',
      campaignId: 'campaign-sidecar-request-hash-prompt-test',
      saveId: 'save-sidecar-request-hash-prompt-test',
      chatId: 'campaign-chat',
      hostMessageId: 'player-request-hash-prompt',
      textHash: 'request-hash-prompt-source-hash',
      rawPlayerText: 'RAW_REQUEST_HASH_PROMPT_FRAME_TEXT_MUST_NOT_PERSIST'
    },
    coreTransactionId: 'txn-request-hash-prompt'
  });
  const requestHashPromptGateway = createStateDeltaGateway({
    getState: () => requestHashPromptState,
    setState: (next) => { requestHashPromptState = cloneJson(next); },
    persist: async () => {
      assert.fail('Accepted sidecar bridge must not persist the old projection through StateDeltaGateway before CORE/FORGE settlement.');
    },
    now
  });
  const originalRequestHashPromptApplyOperations = requestHashPromptGateway.applyOperations;
  requestHashPromptGateway.applyOperations = async (proposal, policy) => originalRequestHashPromptApplyOperations(proposal, policy);
  const requestHashPromptFlushCalls = [];
  const requestHashPromptProviderCalls = [];
  const requestHashPromptCoordinator = {
    async prepareAcceptedBatch() {
      return { status: 'prepared' };
    },
    async settleAcceptedBatch(input = {}) {
      return {
        status: 'settled',
        transactionId: input.transactionId,
        acceptedBatchHash: input.acceptedBatchHash,
        background: forgeBackgroundTransaction(input.transactionId, {
          batchId: input.batchId,
          idempotencyKey: input.idempotencyKey,
          forgeBatchRef: { acceptedBatchHash: input.acceptedBatchHash }
        })
      };
    },
    async flushAcceptedBatchPrompt(input = {}) {
      requestHashPromptFlushCalls.push({
        promptSyncIdempotencyKey: input.promptSyncIdempotencyKey || null,
        idempotencyKey: input.idempotencyKey || null,
        promptDirtyDomains: cloneJson(input.promptDirtyDomains || []),
        campaignRevision: input.campaignState?.runtimeTracking?.revision || 0
      });
      const synchronized = cloneJson(input.campaignState);
      synchronized.campaignChatBinding = {
        ...(synchronized.campaignChatBinding || {}),
        chatId: synchronized.campaignChatBinding?.chatId || 'campaign-chat',
        promptContextRevision: (synchronized.campaignChatBinding?.promptContextRevision || 0) + 1
      };
      return { status: 'rebuilt', campaignState: synchronized };
    }
  };
  const requestHashPromptScheduler = createCampaignSidecarScheduler({
    generationRouter: {
      async generate() {
        assert.fail('Multiple requested campaign sidecars should use the batch generation path.');
      },
      async batch(requests) {
        requestHashPromptProviderCalls.push(requests.map((request) => ({
          roleId: request.roleId,
          promptLength: String(request.request?.prompt || '').length
        })));
        return requests.map((request) => ({
          ok: true,
          response: {
            text: JSON.stringify({
              id: `request-hash-prompt-${request.roleId}`,
              operations: [{
                op: 'append',
                path: request.roleId === 'crewDirector' ? 'crew.casualties' : 'relationships.seniorCrew',
                value: { id: `request-hash-prompt-${request.roleId}`, summary: 'Stable accepted worker result for request-hash prompt key.' }
              }],
              summary: 'Stable accepted worker result for request-hash prompt key.'
            })
          }
        }));
      }
    },
    stateDeltaGateway: requestHashPromptGateway,
    getCampaignState: () => requestHashPromptState,
    setCampaignState: (next) => { requestHashPromptState = cloneJson(next); },
    persistCampaignState: async (next) => { requestHashPromptState = cloneJson(next); },
    syncPromptContext: async () => {
      assert.fail('FORGE/LENS-owned prompt flush must not fall back to scheduler syncPromptContext.');
    },
    forgeCoordinator: requestHashPromptCoordinator,
    now
  });
  const requestHashPromptFirst = await requestHashPromptScheduler.schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-request-hash-prompt',
      turnId: 'turn-request-hash-prompt',
      outcomeId: 'outcome-request-hash-prompt'
    }
  });
  requestHashPromptState.player.rank = 'Captain';
  const requestHashPromptSecond = await requestHashPromptScheduler.schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-request-hash-prompt',
      turnId: 'turn-request-hash-prompt-retry',
      outcomeId: 'outcome-request-hash-prompt'
    }
  });
  assert.deepEqual(requestHashPromptFirst.map((result) => result.status), ['applied', 'applied']);
  assert.deepEqual(requestHashPromptSecond.map((result) => result.status), ['applied', 'applied']);
  assert.equal(requestHashPromptProviderCalls.length, 2);
  assert.equal(requestHashPromptFlushCalls.length, 2);
  assert.deepEqual(requestHashPromptFlushCalls[0].promptDirtyDomains, ['crewShipRelationship']);
  assert.deepEqual(requestHashPromptFlushCalls[1].promptDirtyDomains, ['crewShipRelationship']);
  assert.match(requestHashPromptFlushCalls[0].promptSyncIdempotencyKey, /^campaign-sidecar-provider:txn-request-hash-prompt:.*:prompt-sync:accepted:[a-f0-9]{64}$/);
  assert.match(requestHashPromptFlushCalls[1].promptSyncIdempotencyKey, /^campaign-sidecar-provider:txn-request-hash-prompt:.*:prompt-sync:accepted:[a-f0-9]{64}$/);
  assert.notEqual(requestHashPromptFlushCalls[0].promptSyncIdempotencyKey, requestHashPromptFlushCalls[1].promptSyncIdempotencyKey);
  assert.equal(requestHashPromptFlushCalls[0].idempotencyKey, requestHashPromptFlushCalls[0].promptSyncIdempotencyKey);
  assert.equal(requestHashPromptFlushCalls[1].idempotencyKey, requestHashPromptFlushCalls[1].promptSyncIdempotencyKey);
  const requestHashPromptAcceptedSuffixes = requestHashPromptFlushCalls.map((call) => call.promptSyncIdempotencyKey.split(':prompt-sync:accepted:')[1]);
  assert.equal(requestHashPromptAcceptedSuffixes[0], requestHashPromptAcceptedSuffixes[1], 'Accepted worker-result evidence should remain identical in this request-hash regression.');
  assert.equal(JSON.stringify(requestHashPromptFlushCalls).includes('RAW_REQUEST_HASH_PROMPT_FRAME_TEXT_MUST_NOT_PERSIST'), false);
}

{
  let forgeLensFailureState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-forge-lens-failure-test', status: 'active' },
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
  forgeLensFailureState = recordTurnIngress(forgeLensFailureState, {
    id: 'ingress-forge-lens-failure',
    hostMessageId: 'player-forge-lens-failure',
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-forge-lens-failure-test',
    textHash: 'forge-lens-failure-source-hash',
    textPreview: 'Source message for FORGE LENS failure.',
    status: 'committed',
    outcomeId: 'outcome-forge-lens-failure',
    sourceFrameId: 'frame-forge-lens-failure',
    sourceFrame: {
      kind: 'directive.turnSourceFrame.v1',
      schemaVersion: 1,
      id: 'frame-forge-lens-failure',
      campaignId: 'campaign-sidecar-forge-lens-failure-test',
      saveId: 'save-sidecar-forge-lens-failure-test',
      chatId: 'campaign-chat',
      hostMessageId: 'player-forge-lens-failure',
      textHash: 'forge-lens-failure-source-hash',
      rawPlayerText: 'RAW_FORGE_LENS_FAILURE_FRAME_TEXT_MUST_NOT_PERSIST'
    },
    coreTransactionId: 'txn-forge-lens-failure'
  });
  const forgeLensFailureGateway = createStateDeltaGateway({
    getState: () => forgeLensFailureState,
    setState: (next) => { forgeLensFailureState = cloneJson(next); },
    persist: async () => {
      assert.fail('Accepted sidecar bridge must not persist the old projection through StateDeltaGateway before CORE/FORGE settlement.');
    },
    now
  });
  const forgeLensFailurePromptSyncs = [];
  const forgeLensFailureDiagnostics = [];
  const forgeLensFailureBackgroundBatches = [];
  const forgeLensFailureError = new Error('FORGE LENS prompt flush failed.');
  forgeLensFailureError.code = 'DIRECTIVE_LENS_FLUSH_FAILED';
  const forgeLensFailureResults = await createCampaignSidecarScheduler({
    generationRouter: {
      async generate() {
        return {
          ok: true,
          response: {
            text: JSON.stringify({
              id: 'forge-lens-failure-relationship',
              operations: [{
                op: 'append',
                path: 'relationships.seniorCrew',
                value: { id: 'forge-lens-failure-relationship', summary: 'FORGE LENS failure path relationship result.' }
              }],
              summary: 'Record FORGE LENS failure path evidence.'
            })
          }
        };
      }
    },
    stateDeltaGateway: forgeLensFailureGateway,
    getCampaignState: () => forgeLensFailureState,
    setCampaignState: (next) => { forgeLensFailureState = cloneJson(next); },
    persistCampaignState: async (next) => { forgeLensFailureState = cloneJson(next); },
    syncPromptContext: async () => {
      forgeLensFailurePromptSyncs.push(true);
      return null;
    },
    forgeCoordinator: createForgeCoordinator({
      coreStore: {
        async commitBackgroundBatch(transactionId, bundle) {
          forgeLensFailureBackgroundBatches.push({ transactionId, bundle: cloneJson(bundle) });
          return forgeBackgroundTransaction(transactionId, bundle);
        },
        async appendDiagnostics(transactionId, diagnostic) {
          forgeLensFailureDiagnostics.push({ transactionId, diagnostic: cloneJson(diagnostic) });
          return { id: `forge-lens-failure-diagnostic-${forgeLensFailureDiagnostics.length}`, transactionId, diagnostic: cloneJson(diagnostic) };
        }
      },
      acceptedBatchPromptFlusher: async () => {
        throw forgeLensFailureError;
      },
      clock: now
    }),
    now
  }).schedule({
    workerPlan: { relationship: true },
    turnContext: {
      ingressId: 'ingress-forge-lens-failure',
      turnId: 'turn-forge-lens-failure',
      outcomeId: 'outcome-forge-lens-failure'
    }
  });
  assert.deepEqual(forgeLensFailureResults.map((result) => result.status), ['applied']);
  assert.equal(forgeLensFailurePromptSyncs.length, 0, 'Scheduler syncPromptContext must remain fallback-only after a FORGE/LENS prompt flush failure.');
  assert.equal(forgeLensFailureBackgroundBatches.length, 1);
  assert.equal(forgeLensFailureResults[0].postSettlementWarnings.length, 1);
  assert.equal(forgeLensFailureResults[0].postSettlementWarnings[0].stage, 'lens');
  assert.equal(forgeLensFailureResults[0].postSettlementWarnings[0].code, 'DIRECTIVE_LENS_FLUSH_FAILED');
  assert.equal(JSON.stringify(forgeLensFailureResults).includes('RAW_FORGE_LENS_FAILURE_FRAME_TEXT_MUST_NOT_PERSIST'), false);
  assert.equal(JSON.stringify(forgeLensFailureDiagnostics).includes('RAW_FORGE_LENS_FAILURE_FRAME_TEXT_MUST_NOT_PERSIST'), false);
}

{
  let replayKeyState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-provider-cache-key-test', status: 'active' },
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
  replayKeyState = recordTurnIngress(replayKeyState, {
    id: 'ingress-provider-cache-key',
    hostMessageId: 'player-provider-cache-key',
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-provider-cache-key-test',
    textHash: 'provider-cache-key-source-hash',
    textPreview: 'Source message for provider cache key replay.',
    status: 'committed',
    outcomeId: 'outcome-provider-cache-key',
    sourceFrameId: 'frame-provider-cache-key',
    sourceFrame: {
      kind: 'directive.turnSourceFrame.v1',
      schemaVersion: 1,
      id: 'frame-provider-cache-key',
      campaignId: 'campaign-sidecar-provider-cache-key-test',
      saveId: 'save-sidecar-provider-cache-key-test',
      chatId: 'campaign-chat',
      hostMessageId: 'player-provider-cache-key',
      textHash: 'provider-cache-key-source-hash'
    },
    coreTransactionId: 'txn-provider-cache-key'
  });
  const replayKeyGateway = createStateDeltaGateway({
    getState: () => replayKeyState,
    setState: (next) => { replayKeyState = cloneJson(next); },
    persist: async (next) => { replayKeyState = cloneJson(next); },
    now
  });
  const replayKeyApplyCalls = [];
  const replayKeyValidateCalls = [];
  const originalReplayKeyApplyOperations = replayKeyGateway.applyOperations;
  const originalReplayKeyValidateOperations = replayKeyGateway.validateOperations;
  replayKeyGateway.applyOperations = async (proposal, policy) => {
    replayKeyApplyCalls.push({ proposal: cloneJson(proposal), policy: cloneJson(policy || {}) });
    return originalReplayKeyApplyOperations(proposal, policy);
  };
  replayKeyGateway.validateOperations = async (proposal, policy) => {
    replayKeyValidateCalls.push({ proposal: cloneJson(proposal), policy: cloneJson(policy || {}) });
    return originalReplayKeyValidateOperations(proposal, policy);
  };
  const replayKeyCoreCommits = [];
  const replayKeyCoordinator = createForgeCoordinator({
    coreStore: {
      async commitBackgroundBatch(transactionId, bundle) {
        replayKeyCoreCommits.push({ transactionId, bundle: cloneJson(bundle) });
        return forgeBackgroundTransaction(transactionId, bundle);
      },
      async appendDiagnostics(transactionId, diagnostic) {
        return { id: `provider-cache-key-diagnostic-${transactionId}-${replayKeyCoreCommits.length}`, transactionId, diagnostic: cloneJson(diagnostic) };
      }
    },
    clock: now
  });
  const replayKeyBatchCalls = [];
  const replayKeyScheduler = createCampaignSidecarScheduler({
    generationRouter: {
      async generate() {
        assert.fail('Multiple requested campaign sidecars should use the batch generation path.');
      },
      async batch(requests) {
        const callIndex = replayKeyBatchCalls.length;
        replayKeyBatchCalls.push(requests.map((request) => ({
          roleId: request.roleId,
          promptHash: String(request.request?.prompt || '').length
        })));
        return requests.map((request) => ({
          ok: true,
          response: {
            text: JSON.stringify({
              id: `provider-cache-key-${request.roleId}-${callIndex}`,
              operations: [{
                op: 'append',
                path: request.roleId === 'crewDirector' ? 'crew.casualties' : 'relationships.seniorCrew',
                value: {
                  id: `provider-cache-key-${request.roleId}-${callIndex}`,
                  summary: callIndex === 0
                    ? 'Initial accepted provider cache key operation.'
                    : 'Changed accepted provider cache key operation must not replay stale final results.'
                }
              }],
              summary: 'Provider cache key replay probe.'
            })
          }
        }));
      }
    },
    stateDeltaGateway: replayKeyGateway,
    getCampaignState: () => replayKeyState,
    setCampaignState: (next) => { replayKeyState = cloneJson(next); },
    persistCampaignState: async (next) => { replayKeyState = cloneJson(next); },
    forgeCoordinator: replayKeyCoordinator,
    now
  });
  const replayKeyFirst = await replayKeyScheduler.schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-provider-cache-key',
      turnId: 'turn-provider-cache-key-first',
      outcomeId: 'outcome-provider-cache-key'
    }
  });
  replayKeyState.player.rank = 'Captain';
  const replayKeySecond = await replayKeyScheduler.schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-provider-cache-key',
      turnId: 'turn-provider-cache-key-second',
      outcomeId: 'outcome-provider-cache-key'
    }
  });
  assert.deepEqual(replayKeyFirst.map((result) => result.status), ['applied', 'applied']);
  assert.deepEqual(replayKeySecond.map((result) => result.status), ['rejected', 'rejected']);
  assert.equal(replayKeySecond.every((result) => result.error.code === 'DIRECTIVE_FORGE_PREFLIGHT_FAILED'), true);
  assert.equal(replayKeyBatchCalls.length, 2);
  assert.equal(replayKeyApplyCalls.length, 0);
  assert.equal(replayKeyValidateCalls.length, 1);
  assert.equal(replayKeyCoreCommits.length, 1);
  assert.equal(replayKeyState.relationships.seniorCrew.length, 0);
  assert.equal(replayKeyState.crew.casualties.length, 0);
}

{
  let rejectedReplayState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-rejected-provider-cache-test', status: 'active' },
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
  rejectedReplayState = recordTurnIngress(rejectedReplayState, {
    id: 'ingress-rejected-provider-cache',
    hostMessageId: 'player-rejected-provider-cache',
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-rejected-provider-cache-test',
    textHash: 'rejected-provider-cache-source-hash',
    textPreview: 'Source message for rejected provider cache replay.',
    status: 'committed',
    outcomeId: 'outcome-rejected-provider-cache',
    sourceFrameId: 'frame-rejected-provider-cache',
    sourceFrame: {
      kind: 'directive.turnSourceFrame.v1',
      schemaVersion: 1,
      id: 'frame-rejected-provider-cache',
      campaignId: 'campaign-sidecar-rejected-provider-cache-test',
      saveId: 'save-sidecar-rejected-provider-cache-test',
      chatId: 'campaign-chat',
      hostMessageId: 'player-rejected-provider-cache',
      textHash: 'rejected-provider-cache-source-hash',
      rawPlayerText: 'RAW_REJECTED_PROVIDER_CACHE_FRAME_TEXT_MUST_NOT_PERSIST'
    },
    coreTransactionId: 'txn-rejected-provider-cache'
  });
  const rejectedReplayInitialState = cloneJson(rejectedReplayState);
  const rejectedReplayGateway = createStateDeltaGateway({
    getState: () => rejectedReplayState,
    setState: (next) => { rejectedReplayState = cloneJson(next); },
    persist: async (next) => { rejectedReplayState = cloneJson(next); },
    now
  });
  const rejectedReplayApplyCalls = [];
  const rejectedReplayValidateCalls = [];
  const originalRejectedReplayApplyOperations = rejectedReplayGateway.applyOperations;
  const originalRejectedReplayValidateOperations = rejectedReplayGateway.validateOperations;
  rejectedReplayGateway.applyOperations = async (proposal, policy) => {
    rejectedReplayApplyCalls.push({ proposal: cloneJson(proposal), policy: cloneJson(policy || {}) });
    return originalRejectedReplayApplyOperations(proposal, policy);
  };
  rejectedReplayGateway.validateOperations = async (proposal, policy) => {
    rejectedReplayValidateCalls.push({ proposal: cloneJson(proposal), policy: cloneJson(policy || {}) });
    return originalRejectedReplayValidateOperations(proposal, policy);
  };
  const rejectedReplayBatchCalls = [];
  let rejectedReplayForgeAvailable = false;
  let rejectedReplayPrepareCalls = 0;
  let rejectedReplaySettleCalls = 0;
  const rejectedReplayScheduler = createCampaignSidecarScheduler({
    generationRouter: {
      async generate() {
        assert.fail('Multiple requested campaign sidecars should use the batch generation path.');
      },
      async batch(requests) {
        const callIndex = rejectedReplayBatchCalls.length;
        rejectedReplayBatchCalls.push(requests.map((request) => request.roleId));
        return requests.map((request) => ({
          ok: true,
          response: {
            text: JSON.stringify({
              id: `rejected-provider-cache-${request.roleId}-${callIndex}`,
              operations: [{
                op: 'append',
                path: request.roleId === 'crewDirector' ? 'crew.casualties' : 'relationships.seniorCrew',
                value: { id: `rejected-provider-cache-${request.roleId}-${callIndex}`, summary: 'Accepted after transient FORGE bridge recovery.' }
              }],
              summary: 'Rejected provider cache replay probe.'
            })
          }
        }));
      }
    },
    stateDeltaGateway: rejectedReplayGateway,
    getCampaignState: () => rejectedReplayState,
    setCampaignState: (next) => { rejectedReplayState = cloneJson(next); },
    persistCampaignState: async (next) => { rejectedReplayState = cloneJson(next); },
    forgeCoordinator: {
      async prepareAcceptedBatch() {
        rejectedReplayPrepareCalls += 1;
        if (!rejectedReplayForgeAvailable) {
          const error = new Error('Transient FORGE preflight failure for provider replay cache test.');
          error.code = 'DIRECTIVE_FORGE_PREFLIGHT_FAILED';
          throw error;
        }
        return { status: 'prepared' };
      },
      async settleAcceptedBatch(input = {}) {
        rejectedReplaySettleCalls += 1;
        const background = forgeBackgroundTransaction(input.transactionId, {
          batchId: input.batchId,
          idempotencyKey: input.idempotencyKey,
          forgeBatchRef: { acceptedBatchHash: input.acceptedBatchHash }
        });
        return {
          status: 'settled',
          transactionId: input.transactionId,
          acceptedBatchHash: input.acceptedBatchHash,
          background
        };
      }
    },
    now
  });
  const rejectedReplayFirst = await rejectedReplayScheduler.schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-rejected-provider-cache',
      turnId: 'turn-rejected-provider-cache',
      outcomeId: 'outcome-rejected-provider-cache'
    }
  });
  rejectedReplayState = cloneJson(rejectedReplayInitialState);
  rejectedReplayForgeAvailable = true;
  const rejectedReplaySecond = await rejectedReplayScheduler.schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-rejected-provider-cache',
      turnId: 'turn-rejected-provider-cache',
      outcomeId: 'outcome-rejected-provider-cache'
    }
  });
  assert.deepEqual(rejectedReplayFirst.map((result) => result.status), ['rejected', 'rejected']);
  assert.equal(rejectedReplayFirst.every((result) => result.error.code === 'DIRECTIVE_FORGE_PREFLIGHT_FAILED'), true);
  assert.deepEqual(rejectedReplaySecond.map((result) => result.status), ['applied', 'applied']);
  assert.equal(rejectedReplayBatchCalls.length, 2);
  assert.equal(rejectedReplayPrepareCalls, 2);
  assert.equal(rejectedReplaySettleCalls, 1);
  assert.equal(rejectedReplayApplyCalls.length, 0);
  assert.equal(rejectedReplayValidateCalls.length, 1);
  assert.equal(rejectedReplayState.relationships.seniorCrew.length, 0);
  assert.equal(rejectedReplayState.crew.casualties.length, 0);
  assert.equal(JSON.stringify(rejectedReplayFirst).includes('RAW_REJECTED_PROVIDER_CACHE_FRAME_TEXT_MUST_NOT_PERSIST'), false);
  assert.equal(JSON.stringify(rejectedReplaySecond).includes('RAW_REJECTED_PROVIDER_CACHE_FRAME_TEXT_MUST_NOT_PERSIST'), false);
}

{
  let postCommitWarningState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-forge-post-commit-warning-test', status: 'active' },
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
  postCommitWarningState = recordTurnIngress(postCommitWarningState, {
    id: 'ingress-forge-post-commit-warning',
    hostMessageId: 'player-forge-post-commit-warning',
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-forge-post-commit-warning-test',
    textHash: 'forge-post-commit-warning-source-hash',
    textPreview: 'Source message for post-commit diagnostic failure.',
    status: 'committed',
    outcomeId: 'outcome-forge-post-commit-warning',
    sourceFrameId: 'frame-forge-post-commit-warning',
    sourceFrame: {
      kind: 'directive.turnSourceFrame.v1',
      schemaVersion: 1,
      id: 'frame-forge-post-commit-warning',
      campaignId: 'campaign-sidecar-forge-post-commit-warning-test',
      saveId: 'save-sidecar-forge-post-commit-warning-test',
      chatId: 'campaign-chat',
      hostMessageId: 'player-forge-post-commit-warning',
      textHash: 'forge-post-commit-warning-source-hash',
      rawPlayerText: 'RAW_POST_COMMIT_WARNING_FRAME_TEXT_MUST_NOT_PERSIST'
    },
    coreTransactionId: 'txn-forge-post-commit-warning'
  });
  const postCommitWarningGateway = createStateDeltaGateway({
    getState: () => postCommitWarningState,
    setState: (next) => { postCommitWarningState = cloneJson(next); },
    persist: async (next) => { postCommitWarningState = cloneJson(next); },
    now
  });
  const postCommitWarningCoreCommits = [];
  const postCommitWarningDiagnostics = [];
  const postCommitWarningPromptSyncs = [];
  const postCommitWarningForgeCoordinator = createForgeCoordinator({
    coreStore: {
      async commitBackgroundBatch(transactionId, bundle) {
        postCommitWarningCoreCommits.push({ transactionId, bundle: cloneJson(bundle) });
        return forgeBackgroundTransaction(transactionId, bundle);
      },
      async appendDiagnostics(transactionId, diagnostic) {
        if (diagnostic?.status === 'settled') {
          const error = new Error('Diagnostic append failed after CORE accepted background batch. RAW_WARNING_MESSAGE_MUST_NOT_PERSIST');
          error.code = 'DIRECTIVE_TEST_POST_COMMIT_DIAGNOSTIC_FAILED';
          throw error;
        }
        postCommitWarningDiagnostics.push({ transactionId, diagnostic: cloneJson(diagnostic) });
        return { id: `post-commit-diagnostic-${postCommitWarningDiagnostics.length}`, transactionId, diagnostic: cloneJson(diagnostic) };
      }
    },
    clock: now
  });
  const postCommitWarningScheduler = createCampaignSidecarScheduler({
    generationRouter: {
      async generate() {
        assert.fail('Multiple requested campaign sidecars should use the batch generation path.');
      },
      async batch(requests) {
        return requests.map((request) => ({
          ok: true,
          response: {
            text: JSON.stringify({
              id: `post-commit-warning-${request.roleId}`,
              operations: [{
                op: 'append',
                path: request.roleId === 'crewDirector' ? 'crew.casualties' : 'relationships.seniorCrew',
                value: { id: `post-commit-warning-${request.roleId}`, summary: 'This must stay accepted after post-commit diagnostic failure.' }
              }],
              summary: 'Accepted proposal with post-commit diagnostic failure.'
            })
          }
        }));
      }
    },
    stateDeltaGateway: postCommitWarningGateway,
    getCampaignState: () => postCommitWarningState,
    setCampaignState: (next) => { postCommitWarningState = cloneJson(next); },
    persistCampaignState: async (next) => { postCommitWarningState = cloneJson(next); },
    syncPromptContext: async (next, details, options = {}) => {
      postCommitWarningPromptSyncs.push({
        revision: next.runtimeTracking.revision,
        details: cloneJson(details),
        activityContext: cloneJson(options.activityContext || {})
      });
      const synchronized = cloneJson(next);
      synchronized.campaignChatBinding = {
        ...(synchronized.campaignChatBinding || {}),
        promptContextRevision: (synchronized.campaignChatBinding?.promptContextRevision || 0) + 1
      };
      return synchronized;
    },
    forgeCoordinator: postCommitWarningForgeCoordinator,
    now
  });
  const postCommitWarningResults = await postCommitWarningScheduler.schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-forge-post-commit-warning',
      turnId: 'turn-forge-post-commit-warning',
      outcomeId: 'outcome-forge-post-commit-warning'
    }
  });
  assert.deepEqual(postCommitWarningResults.map((result) => result.status), ['applied', 'applied']);
  assert.equal(postCommitWarningCoreCommits.length, 1);
  assert.equal(postCommitWarningPromptSyncs.length, 0);
  assert.equal(postCommitWarningState.relationships.seniorCrew.length, 0);
  assert.equal(postCommitWarningState.crew.casualties.length, 0);
  assert.equal(postCommitWarningState.campaignChatBinding?.promptContextRevision || 0, 0);
  assert.equal(postCommitWarningState.runtimeTracking.sidecarJournal.length, 0, 'Accepted FORGE-settled batches with compact CORE diagnostic warnings must not write old applied journals.');
  assert.equal(postCommitWarningResults.every((result) => result.forgeSettlement?.warning?.code === 'DIRECTIVE_TEST_POST_COMMIT_DIAGNOSTIC_FAILED'), true);
  assert.equal(postCommitWarningResults.every((result) => result.postSettlementWarnings?.[0]?.stage === 'lens'), true);
  assert.equal(postCommitWarningResults.every((result) => result.postSettlementWarnings?.[0]?.code === 'DIRECTIVE_SIDECAR_POST_SETTLEMENT_LENS_FLUSH_UNAVAILABLE'), true);
  assert.equal(JSON.stringify(postCommitWarningResults).includes('RAW_WARNING_MESSAGE_MUST_NOT_PERSIST'), false);
  assert.equal(JSON.stringify(postCommitWarningResults).includes('RAW_POST_COMMIT_WARNING_FRAME_TEXT_MUST_NOT_PERSIST'), false);
}

{
  let forgeReplayState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-forge-replay-test', status: 'active' },
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
  for (const suffix of ['first', 'replay', 'mismatch']) {
    forgeReplayState = recordTurnIngress(forgeReplayState, {
      id: `ingress-forge-replay-${suffix}`,
      hostMessageId: `player-forge-replay-${suffix}`,
      chatId: 'campaign-chat',
      campaignId: 'campaign-sidecar-forge-replay-test',
      textHash: `forge-replay-${suffix}-source-hash`,
      textPreview: `Source message for ${suffix} Forge replay.`,
      status: 'committed',
      outcomeId: 'outcome-forge-replay-shared',
      sourceFrameId: `frame-forge-replay-${suffix}`,
      sourceFrame: {
        kind: 'directive.turnSourceFrame.v1',
        schemaVersion: 1,
        id: `frame-forge-replay-${suffix}`,
        campaignId: 'campaign-sidecar-forge-replay-test',
        saveId: 'save-sidecar-forge-replay-test',
        chatId: 'campaign-chat',
        hostMessageId: `player-forge-replay-${suffix}`,
        textHash: `forge-replay-${suffix}-source-hash`
      },
      coreTransactionId: 'txn-forge-replay-shared'
    });
  }
  const forgeReplayGateway = createStateDeltaGateway({
    getState: () => forgeReplayState,
    setState: (next) => { forgeReplayState = cloneJson(next); },
    persist: async (next) => { forgeReplayState = cloneJson(next); },
    now
  });
  const forgeReplayApplyCalls = [];
  const forgeReplayValidateCalls = [];
  const originalForgeReplayApplyOperations = forgeReplayGateway.applyOperations;
  const originalForgeReplayValidateOperations = forgeReplayGateway.validateOperations;
  forgeReplayGateway.applyOperations = async (proposal, policy) => {
    forgeReplayApplyCalls.push({ proposal: cloneJson(proposal), policy: cloneJson(policy || {}) });
    return originalForgeReplayApplyOperations(proposal, policy);
  };
  forgeReplayGateway.validateOperations = async (proposal, policy) => {
    forgeReplayValidateCalls.push({ proposal: cloneJson(proposal), policy: cloneJson(policy || {}) });
    return originalForgeReplayValidateOperations(proposal, policy);
  };
  const forgeReplayCoreCommits = [];
  const forgeReplayCoordinator = createForgeCoordinator({
    coreStore: {
      async commitBackgroundBatch(transactionId, bundle) {
        forgeReplayCoreCommits.push({ transactionId, bundle: cloneJson(bundle) });
        return forgeBackgroundTransaction(transactionId, bundle);
      },
      async appendDiagnostics(transactionId, diagnostic) {
        return { id: `forge-replay-diagnostic-${transactionId}`, transactionId, diagnostic: cloneJson(diagnostic) };
      }
    },
    clock: now
  });
  const forgeReplayBatchCalls = [];
  const forgeReplayScheduler = createCampaignSidecarScheduler({
    generationRouter: {
      async generate() {
        assert.fail('Multiple requested campaign sidecars should use the batch generation path.');
      },
      async batch(requests) {
        const callIndex = forgeReplayBatchCalls.length;
        forgeReplayBatchCalls.push(requests.map((request) => request.source?.ingressId || null));
        return requests.map((request) => ({
          ok: true,
          response: {
            text: JSON.stringify({
              id: `forge-replay-${request.roleId}-${request.source?.ingressId}`,
              operations: [{
                op: 'append',
                path: request.roleId === 'crewDirector' ? 'crew.casualties' : 'relationships.seniorCrew',
                value: callIndex >= 2
                  ? { id: `forge-replay-mutated-${request.roleId}`, summary: 'Changed accepted operation must not be hidden by Forge replay.' }
                  : { id: `forge-replay-${request.roleId}`, summary: 'This must not duplicate during Forge replay.' }
              }],
              summary: 'Accepted proposal for Forge replay.'
            })
          }
        }));
      }
    },
    stateDeltaGateway: forgeReplayGateway,
    getCampaignState: () => forgeReplayState,
    setCampaignState: (next) => { forgeReplayState = cloneJson(next); },
    persistCampaignState: async (next) => { forgeReplayState = cloneJson(next); },
    forgeCoordinator: forgeReplayCoordinator,
    now
  });
  const forgeReplayFirst = await forgeReplayScheduler.schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-forge-replay-first',
      turnId: 'turn-forge-replay-first',
      outcomeId: 'outcome-forge-replay-shared'
    }
  });
  const forgeReplayJournalLength = forgeReplayState.runtimeTracking.sidecarJournal.length;
  const forgeReplaySecond = await forgeReplayScheduler.schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-forge-replay-replay',
      turnId: 'turn-forge-replay-replay',
      outcomeId: 'outcome-forge-replay-shared'
    }
  });
  assert.deepEqual(forgeReplayFirst.map((result) => result.status), ['applied', 'applied']);
  assert.deepEqual(forgeReplaySecond.map((result) => result.status), ['applied', 'applied']);
  assert.equal(forgeReplaySecond.every((result) => result.replayed === true), true);
  assert.equal(forgeReplaySecond.every((result) => result.forgeSettlement?.status === 'settled'), true);
  assert.equal(forgeReplaySecond.every((result) => result.forgeSettlement?.replayed === true), true);
  assert.equal(forgeReplayBatchCalls.length, 2, 'provider work should run again so this exercises the FORGE accepted replay path, not the provider-batch barrier');
  assert.equal(forgeReplayApplyCalls.length, 0);
  assert.equal(forgeReplayValidateCalls.length, 1);
  assert.equal(forgeReplayCoreCommits.length, 1);
  assert.equal(forgeReplayState.relationships.seniorCrew.length, 0);
  assert.equal(forgeReplayState.crew.casualties.length, 0);
  assert.equal(forgeReplayState.runtimeTracking.sidecarJournal.length, forgeReplayJournalLength);
  const forgeReplayMismatch = await forgeReplayScheduler.schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-forge-replay-mismatch',
      turnId: 'turn-forge-replay-mismatch',
      outcomeId: 'outcome-forge-replay-shared'
    }
  });
  assert.deepEqual(forgeReplayMismatch.map((result) => result.status), ['rejected', 'rejected']);
  assert.equal(forgeReplayMismatch.every((result) => result.error.code === 'DIRECTIVE_FORGE_PREFLIGHT_FAILED'), true);
  assert.equal(forgeReplayMismatch.every((result) => result.error.details?.reason === 'accepted-batch-replay-mismatch'), true);
  assert.equal(forgeReplayApplyCalls.length, 0);
  assert.equal(forgeReplayValidateCalls.length, 1);
  assert.equal(forgeReplayCoreCommits.length, 1);
  assert.equal(forgeReplayState.relationships.seniorCrew.length, 0);
  assert.equal(forgeReplayState.crew.casualties.length, 0);
}

{
  for (const variant of [
    { suffix: 'missing-hash', result: { status: 'settled', transactionId: 'txn-replay-hash-missing', background: forgeBackgroundTransaction('txn-replay-hash-missing', { batchId: 'campaign-sidecar:txn-replay-hash-missing:outcome-replay-hash-missing' }) } },
    { suffix: 'mismatch-hash', result: { status: 'settled', transactionId: 'txn-replay-hash-mismatch', acceptedBatchHash: 'mismatched-accepted-batch-hash', background: forgeBackgroundTransaction('txn-replay-hash-mismatch', { batchId: 'campaign-sidecar:txn-replay-hash-mismatch:outcome-replay-hash-mismatch' }) } }
  ]) {
    let replayHashState = initializeCampaignRuntimeTracking({
      campaign: { id: `campaign-sidecar-replay-${variant.suffix}-test`, status: 'active' },
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
    const transactionId = `txn-replay-hash-${variant.suffix === 'missing-hash' ? 'missing' : 'mismatch'}`;
    replayHashState = recordTurnIngress(replayHashState, {
      id: `ingress-replay-${variant.suffix}`,
      hostMessageId: `player-replay-${variant.suffix}`,
      chatId: 'campaign-chat',
      campaignId: `campaign-sidecar-replay-${variant.suffix}-test`,
      textHash: `replay-${variant.suffix}-source-hash`,
      textPreview: `Source message for replay ${variant.suffix}.`,
      status: 'committed',
      outcomeId: `outcome-replay-hash-${variant.suffix === 'missing-hash' ? 'missing' : 'mismatch'}`,
      sourceFrameId: `frame-replay-${variant.suffix}`,
      sourceFrame: {
        id: `frame-replay-${variant.suffix}`,
        campaignId: `campaign-sidecar-replay-${variant.suffix}-test`,
        saveId: `save-sidecar-replay-${variant.suffix}-test`,
        chatId: 'campaign-chat',
        hostMessageId: `player-replay-${variant.suffix}`,
        textHash: `replay-${variant.suffix}-source-hash`
      },
      coreTransactionId: transactionId
    });
    const replayHashGateway = createStateDeltaGateway({
      getState: () => replayHashState,
      setState: (next) => { replayHashState = cloneJson(next); },
      persist: async (next) => { replayHashState = cloneJson(next); },
      now
    });
    const replayHashApplyCalls = [];
    const originalReplayHashApplyOperations = replayHashGateway.applyOperations;
    replayHashGateway.applyOperations = async (proposal, policy) => {
      replayHashApplyCalls.push({ proposal: cloneJson(proposal), policy: cloneJson(policy || {}) });
      return originalReplayHashApplyOperations(proposal, policy);
    };
    const replayHashResults = await createCampaignSidecarScheduler({
      generationRouter: {
        async generate() {
          assert.fail('Multiple requested campaign sidecars should use the batch generation path.');
        },
        async batch(requests) {
          return requests.map((request) => ({
            ok: true,
            response: {
              text: JSON.stringify({
                id: `replay-${variant.suffix}-${request.roleId}`,
                operations: [{
                  op: 'append',
                  path: request.roleId === 'crewDirector' ? 'crew.casualties' : 'relationships.seniorCrew',
                  value: { id: `replay-${variant.suffix}-${request.roleId}`, summary: 'This must reject unsafe replay evidence.' }
                }],
                summary: 'Unsafe replay hash proposal.'
              })
            }
          }));
        }
      },
      stateDeltaGateway: replayHashGateway,
      getCampaignState: () => replayHashState,
      setCampaignState: (next) => { replayHashState = cloneJson(next); },
      persistCampaignState: async (next) => { replayHashState = cloneJson(next); },
      forgeCoordinator: {
        async prepareAcceptedBatch() {
          return {
            status: 'replayed',
            result: cloneJson(variant.result)
          };
        }
      },
      now
    }).schedule({
      workerPlan: { relationship: true, crew: true },
      turnContext: {
        ingressId: `ingress-replay-${variant.suffix}`,
        turnId: `turn-replay-${variant.suffix}`,
        outcomeId: `outcome-replay-hash-${variant.suffix === 'missing-hash' ? 'missing' : 'mismatch'}`
      }
    });
    assert.deepEqual(replayHashResults.map((result) => result.status), ['rejected', 'rejected']);
    assert.equal(replayHashApplyCalls.length, 0);
    assert.equal(replayHashState.relationships.seniorCrew.length, 0);
    assert.equal(replayHashState.crew.casualties.length, 0);
  }
}

{
  const directReplayDiagnostics = [];
  const directReplayCommits = [];
  const directReplayCoordinator = createForgeCoordinator({
    coreStore: {
      async commitBackgroundBatch(transactionId, bundle) {
        directReplayCommits.push({ transactionId, bundle: cloneJson(bundle) });
        return forgeBackgroundTransaction(transactionId, bundle);
      },
      async appendDiagnostics(transactionId, diagnostic) {
        directReplayDiagnostics.push({ transactionId, diagnostic: cloneJson(diagnostic) });
        return { id: `direct-replay-diagnostic-${directReplayDiagnostics.length}`, transactionId, diagnostic: cloneJson(diagnostic) };
      }
    },
    clock: now
  });
  const directReplayBase = {
    transactionId: 'txn-direct-forge-replay-no-hash',
    idempotencyKey: 'campaign-sidecar:txn-direct-forge-replay-no-hash:outcome',
    batchId: 'campaign-sidecar:txn-direct-forge-replay-no-hash:outcome',
    providerOwner: 'campaignSidecarScheduler',
    sourceToken: 'turnSourceFrame:direct-forge-replay-no-hash',
    sourceFrameRef: { id: 'frame-direct-forge-replay-no-hash' },
    promptDirtyDomains: ['relationships']
  };
  const directReplayFirst = await directReplayCoordinator.settleAcceptedBatch({
    ...directReplayBase,
    workerResults: [{
      workerId: 'relationship',
      roleId: 'relationshipEvaluator',
      allowedRoots: ['relationships'],
      status: 'accepted',
      operations: [{
        op: 'append',
        path: 'relationships.seniorCrew',
        value: { id: 'direct-replay-first', summary: 'First direct accepted replay operation.' }
      }]
    }]
  });
  const directReplayMismatch = await directReplayCoordinator.settleAcceptedBatch({
    ...directReplayBase,
    workerResults: [{
      workerId: 'relationship',
      roleId: 'relationshipEvaluator',
      allowedRoots: ['relationships'],
      status: 'accepted',
      operations: [{
        op: 'append',
        path: 'relationships.seniorCrew',
        value: { id: 'direct-replay-second', summary: 'Changed direct operation must not replay as accepted.' }
      }]
    }]
  });
  const directSuppliedHashMismatch = await directReplayCoordinator.settleAcceptedBatch({
    ...directReplayBase,
    acceptedBatchHash: 'spoofed-direct-replay-accepted-batch-hash',
    workerResults: [{
      workerId: 'relationship',
      roleId: 'relationshipEvaluator',
      allowedRoots: ['relationships'],
      status: 'accepted',
      operations: [{
        op: 'append',
        path: 'relationships.seniorCrew',
        value: { id: 'direct-replay-first', summary: 'First direct accepted replay operation.' }
      }]
    }]
  });
  assert.equal(directReplayFirst.status, 'settled');
  assert.equal(directReplayMismatch.status, 'rejected');
  assert.equal(directReplayMismatch.reason, 'accepted-batch-replay-mismatch');
  assert.equal(directSuppliedHashMismatch.status, 'rejected');
  assert.equal(directSuppliedHashMismatch.reason, 'accepted-batch-hash-mismatch');
  assert.equal(directReplayCommits.length, 1);
  assert.equal(directReplayDiagnostics[0].diagnostic.workerResults, undefined);
  assert.equal(directReplayDiagnostics[0].diagnostic.workerResultSummary.kind, 'directive.forgeWorkerResultSummary.v1');
  assert.equal(directReplayDiagnostics[0].diagnostic.workerResultSummary.workerCount, 1);
  assert.equal(directReplayDiagnostics[0].diagnostic.workerResultSummary.operationCount, 1);
  assert.equal(directReplayDiagnostics.at(-2).diagnostic.reason, 'accepted-batch-replay-mismatch');
  assert.equal(directReplayDiagnostics.at(-1).diagnostic.reason, 'accepted-batch-hash-mismatch');
}

{
  let rejectedReplayState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-forge-rejected-replay-test', status: 'active' },
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
  rejectedReplayState = recordTurnIngress(rejectedReplayState, {
    id: 'ingress-forge-rejected-replay',
    hostMessageId: 'player-forge-rejected-replay',
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-forge-rejected-replay-test',
    textHash: 'forge-rejected-replay-source-hash',
    textPreview: 'Source message for rejected Forge replay.',
    status: 'committed',
    outcomeId: 'outcome-forge-rejected-replay',
    sourceFrameId: 'frame-forge-rejected-replay',
    sourceFrame: {
      kind: 'directive.turnSourceFrame.v1',
      schemaVersion: 1,
      id: 'frame-forge-rejected-replay',
      campaignId: 'campaign-sidecar-forge-rejected-replay-test',
      saveId: 'save-sidecar-forge-rejected-replay-test',
      chatId: 'campaign-chat',
      hostMessageId: 'player-forge-rejected-replay',
      textHash: 'forge-rejected-replay-source-hash'
    },
    coreTransactionId: 'txn-forge-rejected-replay'
  });
  const rejectedReplayGateway = createStateDeltaGateway({
    getState: () => rejectedReplayState,
    setState: (next) => { rejectedReplayState = cloneJson(next); },
    persist: async (next) => { rejectedReplayState = cloneJson(next); },
    now
  });
  const rejectedReplayApplyCalls = [];
  const originalRejectedReplayApplyOperations = rejectedReplayGateway.applyOperations;
  rejectedReplayGateway.applyOperations = async (proposal, policy) => {
    rejectedReplayApplyCalls.push({ proposal: cloneJson(proposal), policy: cloneJson(policy || {}) });
    return originalRejectedReplayApplyOperations(proposal, policy);
  };
  const rejectedReplayScheduler = createCampaignSidecarScheduler({
    generationRouter: {
      async generate() {
        assert.fail('Multiple requested campaign sidecars should use the batch generation path.');
      },
      async batch(requests) {
        return requests.map((request) => ({
          ok: true,
          response: {
            text: JSON.stringify({
              id: `forge-rejected-replay-${request.roleId}`,
              operations: [{
                op: 'append',
                path: request.roleId === 'crewDirector' ? 'crew.casualties' : 'relationships.seniorCrew',
                value: { id: `forge-rejected-replay-${request.roleId}`, summary: 'Rejected replay must not apply.' }
              }],
              summary: 'Proposal blocked by rejected replay.'
            })
          }
        }));
      }
    },
    stateDeltaGateway: rejectedReplayGateway,
    getCampaignState: () => rejectedReplayState,
    setCampaignState: (next) => { rejectedReplayState = cloneJson(next); },
    persistCampaignState: async (next) => { rejectedReplayState = cloneJson(next); },
    forgeCoordinator: {
      async prepareAcceptedBatch() {
        return {
          status: 'replayed',
          replayed: true,
          result: { status: 'rejected', applied: false, conflict: { path: 'crew.casualties' } }
        };
      },
      async settleAcceptedBatch() {
        assert.fail('Rejected Forge replay must fail before old mutation and final settlement.');
      }
    },
    now
  });
  const rejectedReplayResults = await rejectedReplayScheduler.schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-forge-rejected-replay',
      turnId: 'turn-forge-rejected-replay',
      outcomeId: 'outcome-forge-rejected-replay'
    }
  });
  assert.deepEqual(rejectedReplayResults.map((result) => result.status), ['rejected', 'rejected']);
  assert.equal(rejectedReplayResults.every((result) => result.error.code === 'DIRECTIVE_FORGE_PREFLIGHT_FAILED'), true);
  assert.equal(rejectedReplayApplyCalls.length, 0);
  assert.equal(rejectedReplayState.relationships.seniorCrew.length, 0);
  assert.equal(rejectedReplayState.crew.casualties.length, 0);
}

{
  let realUnsafeReplayState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-real-unsafe-replay-test', status: 'active' },
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
  for (const suffix of ['first', 'retry']) {
    realUnsafeReplayState = recordTurnIngress(realUnsafeReplayState, {
      id: `ingress-real-unsafe-replay-${suffix}`,
      hostMessageId: `player-real-unsafe-replay-${suffix}`,
      chatId: 'campaign-chat',
      campaignId: 'campaign-sidecar-real-unsafe-replay-test',
      textHash: `real-unsafe-replay-${suffix}-source-hash`,
      textPreview: `Source message for ${suffix} real unsafe replay.`,
      status: 'committed',
      outcomeId: 'outcome-real-unsafe-replay',
      sourceFrameId: `frame-real-unsafe-replay-${suffix}`,
      sourceFrame: {
        kind: 'directive.turnSourceFrame.v1',
        schemaVersion: 1,
        id: `frame-real-unsafe-replay-${suffix}`,
        campaignId: 'campaign-sidecar-real-unsafe-replay-test',
        saveId: 'save-sidecar-real-unsafe-replay-test',
        chatId: 'campaign-chat',
        hostMessageId: `player-real-unsafe-replay-${suffix}`,
        textHash: `real-unsafe-replay-${suffix}-source-hash`
      },
      coreTransactionId: 'txn-real-unsafe-replay'
    });
  }
  const realUnsafeReplayGateway = createStateDeltaGateway({
    getState: () => realUnsafeReplayState,
    setState: (next) => { realUnsafeReplayState = cloneJson(next); },
    persist: async (next) => { realUnsafeReplayState = cloneJson(next); },
    now
  });
  const realUnsafeReplayApplyCalls = [];
  const originalRealUnsafeReplayApplyOperations = realUnsafeReplayGateway.applyOperations;
  realUnsafeReplayGateway.applyOperations = async (proposal, policy) => {
    realUnsafeReplayApplyCalls.push({ proposal: cloneJson(proposal), policy: cloneJson(policy || {}) });
    return originalRealUnsafeReplayApplyOperations(proposal, policy);
  };
  const realUnsafeReplayFinalSettlements = [];
  let realUnsafeReplayChecks = 0;
  const realUnsafeReplayCoordinator = createForgeCoordinator({
    coreStore: {
      async commitBackgroundBatch(transactionId, bundle) {
        realUnsafeReplayFinalSettlements.push({ transactionId, bundle: cloneJson(bundle) });
        return forgeBackgroundTransaction(transactionId, bundle);
      },
      async appendDiagnostics(transactionId, diagnostic) {
        return { id: `real-unsafe-replay-diagnostic-${transactionId}-${realUnsafeReplayChecks}`, transactionId, diagnostic: cloneJson(diagnostic) };
      }
    },
    isSourceCurrent: async () => {
      realUnsafeReplayChecks += 1;
      return { ok: realUnsafeReplayChecks > 1, reason: 'first-check-stale' };
    },
    clock: now
  });
  const realUnsafeReplayScheduler = createCampaignSidecarScheduler({
    generationRouter: {
      async generate() {
        assert.fail('Multiple requested campaign sidecars should use the batch generation path.');
      },
      async batch(requests) {
        return requests.map((request) => ({
          ok: true,
          response: {
            text: JSON.stringify({
              id: `real-unsafe-replay-${request.roleId}`,
              operations: [{
                op: 'append',
                path: request.roleId === 'crewDirector' ? 'crew.casualties' : 'relationships.seniorCrew',
                value: { id: `real-unsafe-replay-${request.roleId}`, summary: 'Unsafe prepare replay must not apply.' }
              }],
              summary: 'Proposal blocked by cached unsafe prepare replay.'
            })
          }
        }));
      }
    },
    stateDeltaGateway: realUnsafeReplayGateway,
    getCampaignState: () => realUnsafeReplayState,
    setCampaignState: (next) => { realUnsafeReplayState = cloneJson(next); },
    persistCampaignState: async (next) => { realUnsafeReplayState = cloneJson(next); },
    forgeCoordinator: realUnsafeReplayCoordinator,
    now
  });
  const realUnsafeReplayFirst = await realUnsafeReplayScheduler.schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-real-unsafe-replay-first',
      turnId: 'turn-real-unsafe-replay-first',
      outcomeId: 'outcome-real-unsafe-replay'
    }
  });
  const realUnsafeReplaySecond = await realUnsafeReplayScheduler.schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-real-unsafe-replay-retry',
      turnId: 'turn-real-unsafe-replay-retry',
      outcomeId: 'outcome-real-unsafe-replay'
    }
  });
  assert.deepEqual(realUnsafeReplayFirst.map((result) => result.status), ['rejected', 'rejected']);
  assert.deepEqual(realUnsafeReplaySecond.map((result) => result.status), ['rejected', 'rejected']);
  assert.equal(realUnsafeReplayApplyCalls.length, 0);
  assert.equal(realUnsafeReplayFinalSettlements.length, 0);
  assert.equal(realUnsafeReplayChecks, 1);
  assert.equal(realUnsafeReplayState.relationships.seniorCrew.length, 0);
  assert.equal(realUnsafeReplayState.crew.casualties.length, 0);
}

{
  let postSettlementPromptState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-post-settlement-prompt-test', status: 'active' },
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
  postSettlementPromptState = recordTurnIngress(postSettlementPromptState, {
    id: 'ingress-post-settlement-prompt',
    hostMessageId: 'player-post-settlement-prompt',
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-post-settlement-prompt-test',
    textHash: 'post-settlement-prompt-source-hash',
    textPreview: 'Source message for post-settlement prompt failure.',
    status: 'committed',
    outcomeId: 'outcome-post-settlement-prompt',
    sourceFrameId: 'frame-post-settlement-prompt',
    sourceFrame: {
      kind: 'directive.turnSourceFrame.v1',
      schemaVersion: 1,
      id: 'frame-post-settlement-prompt',
      campaignId: 'campaign-sidecar-post-settlement-prompt-test',
      saveId: 'save-sidecar-post-settlement-prompt-test',
      chatId: 'campaign-chat',
      hostMessageId: 'player-post-settlement-prompt',
      textHash: 'post-settlement-prompt-source-hash'
    },
    coreTransactionId: 'txn-post-settlement-prompt'
  });
  const postSettlementPromptGateway = createStateDeltaGateway({
    getState: () => postSettlementPromptState,
    setState: (next) => { postSettlementPromptState = cloneJson(next); },
    persist: async (next) => { postSettlementPromptState = cloneJson(next); },
    now
  });
  const postSettlementPromptCoreCommits = [];
  const postSettlementPromptCoreDiagnostics = [];
  const postSettlementPromptSchedulerSyncs = [];
  const postSettlementPromptBatchCalls = [];
  const postSettlementPromptRawCanary = 'RAW_MISSING_FORGE_LENS_HELPER_SYNC_MUST_NOT_PERSIST';
  const postSettlementPromptForgeCoordinator = createForgeCoordinator({
    coreStore: {
      async commitBackgroundBatch(transactionId, bundle) {
        postSettlementPromptCoreCommits.push({ transactionId, bundle: cloneJson(bundle) });
        return forgeBackgroundTransaction(transactionId, bundle);
      },
      async appendDiagnostics(transactionId, diagnostic) {
        return { id: `post-settlement-prompt-diagnostic-${transactionId}`, transactionId, diagnostic: cloneJson(diagnostic) };
      }
    },
    clock: now
  });
  const postSettlementPromptScheduler = createCampaignSidecarScheduler({
    generationRouter: {
      async generate() {
        assert.fail('Multiple requested campaign sidecars should use the batch generation path.');
      },
      async batch(requests) {
        postSettlementPromptBatchCalls.push(requests.map((request) => request.roleId));
        return requests.map((request) => ({
          ok: true,
          response: {
            text: JSON.stringify({
              id: `post-settlement-prompt-${request.roleId}`,
              operations: [{
                op: 'append',
                path: request.roleId === 'crewDirector' ? 'crew.casualties' : 'relationships.seniorCrew',
                value: { id: `post-settlement-prompt-${request.roleId}`, summary: 'This must stay accepted after prompt sync failure.' }
              }],
              summary: 'Accepted proposal with post-settlement prompt failure.'
            })
          }
        }));
      }
    },
    stateDeltaGateway: postSettlementPromptGateway,
    getCampaignState: () => postSettlementPromptState,
    setCampaignState: (next) => { postSettlementPromptState = cloneJson(next); },
    persistCampaignState: async (next) => { postSettlementPromptState = cloneJson(next); },
    appendCoreDiagnostic: async (event) => {
      postSettlementPromptCoreDiagnostics.push(cloneJson(event));
      return { ok: true };
    },
    syncPromptContext: async (next, details, options = {}) => {
      postSettlementPromptSchedulerSyncs.push({
        revision: next.runtimeTracking?.revision || 0,
        details: cloneJson(details || {}),
        activityContext: cloneJson(options.activityContext || {})
      });
      const synchronized = cloneJson(next);
      synchronized.campaignChatBinding = {
        ...(synchronized.campaignChatBinding || {}),
        promptContextRevision: (synchronized.campaignChatBinding?.promptContextRevision || 0) + 1,
        promptContextOwner: postSettlementPromptRawCanary
      };
      return synchronized;
    },
    forgeCoordinator: postSettlementPromptForgeCoordinator,
    now
  });
  const postSettlementPromptResults = await postSettlementPromptScheduler.schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-post-settlement-prompt',
      turnId: 'turn-post-settlement-prompt',
      outcomeId: 'outcome-post-settlement-prompt'
    }
  });
  const postSettlementPromptReplayResults = await postSettlementPromptScheduler.schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-post-settlement-prompt',
      turnId: 'turn-post-settlement-prompt-replay',
      outcomeId: 'outcome-post-settlement-prompt'
    }
  });
  const postSettlementPromptThirdResults = await postSettlementPromptScheduler.schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-post-settlement-prompt',
      turnId: 'turn-post-settlement-prompt-third',
      outcomeId: 'outcome-post-settlement-prompt'
    }
  });
  assert.deepEqual(postSettlementPromptResults.map((result) => result.status), ['applied', 'applied']);
  assert.deepEqual(postSettlementPromptReplayResults.map((result) => result.status), ['applied', 'applied']);
  assert.deepEqual(postSettlementPromptThirdResults.map((result) => result.status), ['applied', 'applied']);
  assert.equal(postSettlementPromptBatchCalls.length, 3, 'LENS-unavailable accepted-batch replay must not become a clean provider-cache replay.');
  assert.equal(postSettlementPromptCoreCommits.length, 1);
  assert.equal(postSettlementPromptState.relationships.seniorCrew.length, 0);
  assert.equal(postSettlementPromptState.crew.casualties.length, 0);
  assert.equal(postSettlementPromptState.runtimeTracking.sidecarJournal.length, 0, 'Accepted FORGE-settled batches with prompt-sync warnings must not write old applied journals.');
  assert.equal(postSettlementPromptSchedulerSyncs.length, 0, 'Accepted FORGE-settled batches with no FORGE/LENS prompt helper must not call scheduler-owned syncPromptContext.');
  assert.equal(postSettlementPromptState.campaignChatBinding?.promptContextRevision || 0, 0, 'Missing FORGE/LENS prompt helper should not update prompt revision through scheduler fallback.');
  assert.equal(postSettlementPromptResults.every((result) => result.postSettlementWarnings?.[0]?.stage === 'lens'), true);
  assert.equal(postSettlementPromptResults.every((result) => result.postSettlementWarnings?.[0]?.code === 'DIRECTIVE_SIDECAR_POST_SETTLEMENT_LENS_FLUSH_UNAVAILABLE'), true);
  assert.equal(postSettlementPromptReplayResults.every((result) => result.replayed === true), true);
  assert.equal(postSettlementPromptReplayResults.every((result) => result.postSettlementWarnings?.[0]?.stage === 'lens'), true);
  assert.equal(postSettlementPromptReplayResults.every((result) => result.postSettlementWarnings?.[0]?.code === 'DIRECTIVE_SIDECAR_POST_SETTLEMENT_LENS_FLUSH_UNAVAILABLE'), true);
  assert.equal(postSettlementPromptThirdResults.every((result) => result.replayed === true), true);
  assert.equal(postSettlementPromptThirdResults.every((result) => result.postSettlementWarnings?.[0]?.stage === 'lens'), true);
  assert.equal(postSettlementPromptThirdResults.every((result) => result.postSettlementWarnings?.[0]?.code === 'DIRECTIVE_SIDECAR_POST_SETTLEMENT_LENS_FLUSH_UNAVAILABLE'), true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const postSettlementPromptAppliedDiagnostics = postSettlementPromptCoreDiagnostics.filter((entry) => entry.status === 'applied');
  assert.equal(postSettlementPromptAppliedDiagnostics.length, 6);
  assert.equal(postSettlementPromptAppliedDiagnostics.every((entry) => entry.forgeSettlement?.status === 'settled'), true);
  assert.equal(postSettlementPromptAppliedDiagnostics.every((entry) => entry.postSettlementWarnings?.[0]?.stage === 'lens'), true);
  assert.equal(postSettlementPromptAppliedDiagnostics.every((entry) => entry.postSettlementWarnings?.[0]?.code === 'DIRECTIVE_SIDECAR_POST_SETTLEMENT_LENS_FLUSH_UNAVAILABLE'), true);
  assert.equal(JSON.stringify(postSettlementPromptAppliedDiagnostics).includes(postSettlementPromptRawCanary), false);
  assert.equal(JSON.stringify(postSettlementPromptResults).includes(postSettlementPromptRawCanary), false);
  assert.equal(JSON.stringify(postSettlementPromptReplayResults).includes(postSettlementPromptRawCanary), false);
  assert.equal(JSON.stringify(postSettlementPromptThirdResults).includes(postSettlementPromptRawCanary), false);
  assert.equal(JSON.stringify(postSettlementPromptState).includes(postSettlementPromptRawCanary), false);
}

{
  let postSettlementJournalState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-post-settlement-journal-test', status: 'active' },
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
  postSettlementJournalState = recordTurnIngress(postSettlementJournalState, {
    id: 'ingress-post-settlement-journal',
    hostMessageId: 'player-post-settlement-journal',
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-post-settlement-journal-test',
    textHash: 'post-settlement-journal-source-hash',
    textPreview: 'Source message for post-settlement journal failure.',
    status: 'committed',
    outcomeId: 'outcome-post-settlement-journal',
    sourceFrameId: 'frame-post-settlement-journal',
    sourceFrame: {
      kind: 'directive.turnSourceFrame.v1',
      schemaVersion: 1,
      id: 'frame-post-settlement-journal',
      campaignId: 'campaign-sidecar-post-settlement-journal-test',
      saveId: 'save-sidecar-post-settlement-journal-test',
      chatId: 'campaign-chat',
      hostMessageId: 'player-post-settlement-journal',
      textHash: 'post-settlement-journal-source-hash'
    },
    coreTransactionId: 'txn-post-settlement-journal'
  });
  const postSettlementJournalGateway = createStateDeltaGateway({
    getState: () => postSettlementJournalState,
    setState: (next) => { postSettlementJournalState = cloneJson(next); },
    persist: async (next) => { postSettlementJournalState = cloneJson(next); },
    now
  });
  const postSettlementJournalCoreCommits = [];
  const postSettlementJournalForgeCoordinator = createForgeCoordinator({
    coreStore: {
      async commitBackgroundBatch(transactionId, bundle) {
        postSettlementJournalCoreCommits.push({ transactionId, bundle: cloneJson(bundle) });
        return forgeBackgroundTransaction(transactionId, bundle);
      },
      async appendDiagnostics(transactionId, diagnostic) {
        return { id: `post-settlement-journal-diagnostic-${transactionId}`, transactionId, diagnostic: cloneJson(diagnostic) };
      }
    },
    clock: now
  });
  const postSettlementJournalRawCanary = 'RAW_WARNING_MESSAGE_MUST_NOT_PERSIST';
  let postSettlementJournalPersistCount = 0;
  const postSettlementJournalPersistReasons = [];
  let postSettlementJournalPersistedState = cloneJson(postSettlementJournalState);
  const postSettlementJournalScheduler = createCampaignSidecarScheduler({
    generationRouter: {
      async generate() {
        assert.fail('Multiple requested campaign sidecars should use the batch generation path.');
      },
      async batch(requests) {
        return requests.map((request) => ({
          ok: true,
          response: {
            text: JSON.stringify({
              id: `post-settlement-journal-${request.roleId}`,
              operations: [{
                op: 'append',
                path: request.roleId === 'crewDirector' ? 'crew.casualties' : 'relationships.seniorCrew',
                value: { id: `post-settlement-journal-${request.roleId}`, summary: 'This must stay accepted after journal failure.' }
              }],
              summary: 'Accepted proposal with post-settlement journal failure.'
            })
          }
        }));
      }
    },
    stateDeltaGateway: postSettlementJournalGateway,
    getCampaignState: () => postSettlementJournalState,
    setCampaignState: (next) => { postSettlementJournalState = cloneJson(next); },
    persistCampaignState: async (next, reason) => {
      postSettlementJournalPersistCount += 1;
      postSettlementJournalPersistReasons.push(reason || null);
      if (reason === 'Recorded accepted campaign sidecar batch results.') {
        const error = new Error(`Accepted journal persist failed after final FORGE settlement. ${postSettlementJournalRawCanary}`);
        error.code = 'DIRECTIVE_TEST_POST_SETTLEMENT_JOURNAL_FAILED';
        throw error;
      }
      postSettlementJournalPersistedState = cloneJson(next);
      postSettlementJournalState = cloneJson(next);
    },
    forgeCoordinator: postSettlementJournalForgeCoordinator,
    now
  });
  const postSettlementJournalResults = await postSettlementJournalScheduler.schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-post-settlement-journal',
      turnId: 'turn-post-settlement-journal',
      outcomeId: 'outcome-post-settlement-journal'
    }
  });
  assert.deepEqual(postSettlementJournalResults.map((result) => result.status), ['applied', 'applied']);
  assert.equal(postSettlementJournalResults.every((result) => result.recoveryRequired == null), true);
  assert.equal(JSON.stringify(postSettlementJournalResults).includes(postSettlementJournalRawCanary), false);
  assert.equal(postSettlementJournalCoreCommits.length, 1);
  assert.equal(postSettlementJournalPersistCount, 0);
  assert.deepEqual(postSettlementJournalPersistReasons, []);
  assert.equal(postSettlementJournalState.relationships.seniorCrew.length, 0);
  assert.equal(postSettlementJournalState.crew.casualties.length, 0);
  assert.equal(postSettlementJournalState.runtimeTracking.sidecarJournal.length, 0, 'Accepted FORGE-settled batches should not attempt the old accepted journal persistence path.');
  const postSettlementJournalRecovery = postSettlementJournalPersistedState.runtimeTracking.recoveryJournal.at(-1);
  assert.equal(postSettlementJournalRecovery?.type === 'sidecarAcceptedJournalProjection', false);
  assert.equal(JSON.stringify(postSettlementJournalPersistedState).includes(postSettlementJournalRawCanary), false);
}

{
  const providerBatchFailureRawCanary = 'RAW_PROVIDER_BATCH_EXCEPTION_MUST_NOT_PERSIST';
  const providerBatchFailureCodeCanary = 'DIRECTIVE_RAW_CODE_CANARY_MUST_NOT_PERSIST';
  const providerBatchDiagnostics = [];
  const providerBatchCoordinator = createForgeCoordinator({
    coreStore: {
      async appendDiagnostics(transactionId, diagnostic) {
        providerBatchDiagnostics.push({ transactionId, diagnostic: cloneJson(diagnostic) });
        return { id: `provider-batch-failure-diagnostic-${providerBatchDiagnostics.length}`, transactionId, diagnostic: cloneJson(diagnostic) };
      }
    },
    clock: now
  });
  const providerBatchJobs = [{
    id: 'provider-batch-failure-job',
    workerKey: 'crew',
    roleId: 'crewDirector',
    policy: { timeoutMs: 1000 },
    sourceIngress: {
      sourceToken: 'turnSourceFrame:provider-batch-failure',
      sourceFrameRef: { id: 'frame-provider-batch-failure' },
      coreTransactionId: 'txn-provider-batch-failure'
    },
    request: {
      systemPrompt: 'Return JSON.',
      prompt: 'Provider batch failure redaction test.',
      maxTokens: 64
    }
  }];
  const providerBatchInput = {
    jobs: providerBatchJobs,
    transactionId: 'txn-provider-batch-failure',
    idempotencyKey: 'provider-batch-failure-redaction-key',
    sourceToken: 'turnSourceFrame:provider-batch-failure',
    sourceFrameRef: { id: 'frame-provider-batch-failure' },
    upstreamOwner: 'campaignSidecarScheduler',
    runProviderBatch: async () => {
      const error = new Error(`Provider batch failed with raw transport text. ${providerBatchFailureRawCanary}`);
      error.code = providerBatchFailureCodeCanary;
      throw error;
    }
  };
  let providerBatchFirstError = null;
  try {
    await providerBatchCoordinator.runProviderBatch(providerBatchInput);
  } catch (error) {
    providerBatchFirstError = error;
  }
  assert.equal(providerBatchFirstError?.code, 'DIRECTIVE_FORGE_SIDECAR_PROVIDER_FAILED');
  assert.equal(JSON.stringify(providerBatchFirstError).includes(providerBatchFailureRawCanary), false);
  assert.equal(JSON.stringify(providerBatchFirstError).includes(providerBatchFailureCodeCanary), false);
  assert.equal(String(providerBatchFirstError?.message || '').includes(providerBatchFailureRawCanary), false);
  assert.equal(String(providerBatchFirstError?.message || '').includes(providerBatchFailureCodeCanary), false);
  const providerBatchReplay = await providerBatchCoordinator.runProviderBatch(providerBatchInput);
  assert.equal(providerBatchReplay.status, 'replayed');
  assert.equal(providerBatchReplay.originalStatus, 'failed');
  assert.equal(providerBatchReplay.error.code, 'DIRECTIVE_FORGE_SIDECAR_PROVIDER_FAILED');
  assert.equal(JSON.stringify(providerBatchDiagnostics).includes(providerBatchFailureRawCanary), false);
  assert.equal(JSON.stringify(providerBatchDiagnostics).includes(providerBatchFailureCodeCanary), false);
  assert.equal(JSON.stringify(providerBatchReplay).includes(providerBatchFailureRawCanary), false);
  assert.equal(JSON.stringify(providerBatchReplay).includes(providerBatchFailureCodeCanary), false);
}

{
  const providerWorkerErrorRawCanary = 'RAW_PROVIDER_WORKER_ERROR_MUST_NOT_PERSIST';
  const providerWorkerErrorCodeCanary = 'DIRECTIVE_RAW_WORKER_CODE_CANARY_MUST_NOT_PERSIST';
  const providerWorkerDiagnosticRawCanary = 'RAW_PROVIDER_DIAGNOSTIC_MUST_NOT_PERSIST';
  const providerWorkerDiagnostics = [];
  const providerWorkerCoordinator = createForgeCoordinator({
    coreStore: {
      async appendDiagnostics(transactionId, diagnostic) {
        providerWorkerDiagnostics.push({ transactionId, diagnostic: cloneJson(diagnostic) });
        return { id: `provider-worker-diagnostic-${providerWorkerDiagnostics.length}`, transactionId, diagnostic: cloneJson(diagnostic) };
      }
    },
    clock: now
  });
  const providerWorkerInput = {
    jobs: [{
      id: 'provider-worker-error-job',
      workerKey: 'crew',
      roleId: 'crewDirector',
      policy: { timeoutMs: 1000 },
      sourceIngress: {
        sourceToken: 'turnSourceFrame:provider-worker-error',
        sourceFrameRef: { id: 'frame-provider-worker-error' },
        coreTransactionId: 'txn-provider-worker-error'
      },
      request: {
        systemPrompt: 'Return JSON.',
        prompt: 'Provider worker error redaction test.',
        maxTokens: 64
      }
    }],
    transactionId: 'txn-provider-worker-error',
    idempotencyKey: 'provider-worker-error-redaction-key',
    sourceToken: 'turnSourceFrame:provider-worker-error',
    sourceFrameRef: { id: 'frame-provider-worker-error' },
    upstreamOwner: 'campaignSidecarScheduler',
    runProviderBatch: async () => ({
      concurrent: false,
      results: [{
        jobId: 'provider-worker-error-job',
        type: 'crew',
        roleId: 'crewDirector',
        status: 'failed',
        error: {
          code: providerWorkerErrorCodeCanary,
          message: `Provider worker failed with raw text. ${providerWorkerErrorRawCanary}`
        },
        diagnostics: {
          transport: { ok: false, status: 502 },
          feature: { status: 'failed' },
          providerId: 'utility-provider',
          providerKind: 'utility',
          model: 'utility-test-model',
          latencyMs: 17,
          rawProviderMessage: `Raw provider diagnostic. ${providerWorkerDiagnosticRawCanary}`,
          providerBody: {
            text: `Raw body text. ${providerWorkerDiagnosticRawCanary}`,
            nested: { detail: providerWorkerDiagnosticRawCanary }
          }
        }
      }]
    })
  };
  const providerWorkerFirst = await providerWorkerCoordinator.runProviderBatch(providerWorkerInput);
  assert.equal(providerWorkerFirst.batch.results[0].error.code, 'DIRECTIVE_FORGE_SIDECAR_WORKER_FAILED');
  assert.equal(JSON.stringify(providerWorkerFirst).includes(providerWorkerErrorRawCanary), false);
  assert.equal(JSON.stringify(providerWorkerFirst).includes(providerWorkerErrorCodeCanary), false);
  assert.equal(JSON.stringify(providerWorkerFirst).includes(providerWorkerDiagnosticRawCanary), false);
  const providerWorkerReplay = await providerWorkerCoordinator.runProviderBatch(providerWorkerInput);
  assert.equal(providerWorkerReplay.status, 'replayed');
  assert.equal(providerWorkerReplay.batch.results[0].error.code, 'DIRECTIVE_FORGE_SIDECAR_WORKER_FAILED');
  assert.equal(JSON.stringify(providerWorkerReplay).includes(providerWorkerErrorRawCanary), false);
  assert.equal(JSON.stringify(providerWorkerReplay).includes(providerWorkerErrorCodeCanary), false);
  assert.equal(JSON.stringify(providerWorkerReplay).includes(providerWorkerDiagnosticRawCanary), false);
  assert.equal(JSON.stringify(providerWorkerDiagnostics).includes(providerWorkerErrorRawCanary), false);
  assert.equal(JSON.stringify(providerWorkerDiagnostics).includes(providerWorkerErrorCodeCanary), false);
  assert.equal(JSON.stringify(providerWorkerDiagnostics).includes(providerWorkerDiagnosticRawCanary), false);
}

{
  const schedulerWorkerErrorRawCanary = 'RAW_PROVIDER_WORKER_ERROR_MUST_NOT_PERSIST';
  const schedulerWorkerDiagnosticRawCanary = 'RAW_PROVIDER_DIAGNOSTIC_MUST_NOT_PERSIST';
  let schedulerWorkerErrorState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-provider-worker-error-test', status: 'active' },
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
  schedulerWorkerErrorState = recordTurnIngress(schedulerWorkerErrorState, {
    id: 'ingress-provider-worker-error',
    hostMessageId: 'player-provider-worker-error',
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-provider-worker-error-test',
    textHash: 'provider-worker-error-source-hash',
    textPreview: 'Source message for provider worker error.',
    status: 'committed',
    outcomeId: 'outcome-provider-worker-error',
    sourceFrameId: 'frame-provider-worker-error',
    sourceFrame: {
      kind: 'directive.turnSourceFrame.v1',
      schemaVersion: 1,
      id: 'frame-provider-worker-error',
      campaignId: 'campaign-sidecar-provider-worker-error-test',
      saveId: 'save-sidecar-provider-worker-error-test',
      chatId: 'campaign-chat',
      hostMessageId: 'player-provider-worker-error',
      textHash: 'provider-worker-error-source-hash'
    },
    coreTransactionId: 'txn-provider-worker-error'
  });
  const schedulerWorkerErrorGateway = createStateDeltaGateway({
    getState: () => schedulerWorkerErrorState,
    setState: (next) => { schedulerWorkerErrorState = cloneJson(next); },
    persist: async (next) => { schedulerWorkerErrorState = cloneJson(next); },
    now
  });
  const schedulerWorkerErrorCoreDiagnostics = [];
  const schedulerWorkerErrorActivity = [];
  const schedulerWorkerErrorCoordinator = createForgeCoordinator({
    coreStore: {
      async appendDiagnostics(transactionId, diagnostic) {
        return { id: `scheduler-worker-error-diagnostic-${transactionId}`, transactionId, diagnostic: cloneJson(diagnostic) };
      }
    },
    clock: now
  });
  const schedulerWorkerErrorScheduler = createCampaignSidecarScheduler({
    generationRouter: {
      async generate() {
        assert.fail('Multiple requested campaign sidecars should use the batch generation path.');
      },
      async batch(requests) {
        return requests.map((request) => ({
          jobId: request.id,
          type: request.type,
          roleId: request.roleId,
          status: 'failed',
          error: {
            code: 'DIRECTIVE_TEST_PROVIDER_WORKER_FAILED',
            message: `Provider worker failed with raw text. ${schedulerWorkerErrorRawCanary}`
          },
          diagnostics: {
            transport: { ok: false, status: 503 },
            feature: { status: 'failed' },
            providerId: 'utility-provider',
            providerKind: 'utility',
            model: 'utility-test-model',
            latencyMs: 23,
            rawProviderMessage: `Raw provider diagnostic. ${schedulerWorkerDiagnosticRawCanary}`,
            providerBody: {
              text: `Raw body text. ${schedulerWorkerDiagnosticRawCanary}`,
              nested: { detail: schedulerWorkerDiagnosticRawCanary }
            }
          }
        }));
      }
    },
    stateDeltaGateway: schedulerWorkerErrorGateway,
    getCampaignState: () => schedulerWorkerErrorState,
    setCampaignState: (next) => { schedulerWorkerErrorState = cloneJson(next); },
    persistCampaignState: async (next) => { schedulerWorkerErrorState = cloneJson(next); },
    appendCoreDiagnostic: async (event) => {
      schedulerWorkerErrorCoreDiagnostics.push(cloneJson(event));
      return { ok: true };
    },
    forgeCoordinator: schedulerWorkerErrorCoordinator,
    now
  });
  const schedulerWorkerFirst = await schedulerWorkerErrorScheduler.schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-provider-worker-error',
      turnId: 'turn-provider-worker-error',
      outcomeId: 'outcome-provider-worker-error'
    },
    activityReporter: (event) => schedulerWorkerErrorActivity.push(cloneJson(event))
  });
  assert.deepEqual(schedulerWorkerFirst.map((result) => result.status), ['failed', 'failed']);
  assert.equal(schedulerWorkerFirst.every((result) => result.error.code === 'DIRECTIVE_SIDECAR_WORKER_FAILED'), true);
  assert.equal(JSON.stringify(schedulerWorkerFirst).includes(schedulerWorkerErrorRawCanary), false);
  assert.equal(JSON.stringify(schedulerWorkerFirst).includes(schedulerWorkerDiagnosticRawCanary), false);
  assert.equal(JSON.stringify(schedulerWorkerErrorState.runtimeTracking.sidecarJournal).includes(schedulerWorkerErrorRawCanary), false);
  assert.equal(JSON.stringify(schedulerWorkerErrorState.runtimeTracking.sidecarJournal).includes(schedulerWorkerDiagnosticRawCanary), false);
  assert.equal(JSON.stringify(schedulerWorkerErrorCoreDiagnostics).includes(schedulerWorkerErrorRawCanary), false);
  assert.equal(JSON.stringify(schedulerWorkerErrorCoreDiagnostics).includes(schedulerWorkerDiagnosticRawCanary), false);
  assert.equal(JSON.stringify(schedulerWorkerErrorActivity).includes(schedulerWorkerErrorRawCanary), false);
  assert.equal(JSON.stringify(schedulerWorkerErrorActivity).includes(schedulerWorkerDiagnosticRawCanary), false);
  const schedulerWorkerReplay = await schedulerWorkerErrorScheduler.schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-provider-worker-error',
      turnId: 'turn-provider-worker-error-replay',
      outcomeId: 'outcome-provider-worker-error'
    },
    activityReporter: (event) => schedulerWorkerErrorActivity.push(cloneJson(event))
  });
  assert.deepEqual(schedulerWorkerReplay.map((result) => result.status), ['failed', 'failed']);
  assert.equal(JSON.stringify(schedulerWorkerReplay).includes(schedulerWorkerErrorRawCanary), false);
  assert.equal(JSON.stringify(schedulerWorkerReplay).includes(schedulerWorkerDiagnosticRawCanary), false);
  assert.equal(JSON.stringify(schedulerWorkerErrorState.runtimeTracking.sidecarJournal).includes(schedulerWorkerErrorRawCanary), false);
  assert.equal(JSON.stringify(schedulerWorkerErrorState.runtimeTracking.sidecarJournal).includes(schedulerWorkerDiagnosticRawCanary), false);
}

{
  const schedulerProviderFailureRawCanary = 'RAW_PROVIDER_BATCH_EXCEPTION_MUST_NOT_PERSIST';
  let schedulerProviderFailureState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-provider-failure-test', status: 'active' },
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
  schedulerProviderFailureState = recordTurnIngress(schedulerProviderFailureState, {
    id: 'ingress-provider-failure',
    hostMessageId: 'player-provider-failure',
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-provider-failure-test',
    textHash: 'provider-failure-source-hash',
    textPreview: 'Source message for provider failure.',
    status: 'committed',
    outcomeId: 'outcome-provider-failure',
    sourceFrameId: 'frame-provider-failure',
    sourceFrame: {
      kind: 'directive.turnSourceFrame.v1',
      schemaVersion: 1,
      id: 'frame-provider-failure',
      campaignId: 'campaign-sidecar-provider-failure-test',
      saveId: 'save-sidecar-provider-failure-test',
      chatId: 'campaign-chat',
      hostMessageId: 'player-provider-failure',
      textHash: 'provider-failure-source-hash'
    },
    coreTransactionId: 'txn-provider-failure'
  });
  const schedulerProviderFailureGateway = createStateDeltaGateway({
    getState: () => schedulerProviderFailureState,
    setState: (next) => { schedulerProviderFailureState = cloneJson(next); },
    persist: async (next) => { schedulerProviderFailureState = cloneJson(next); },
    now
  });
  const schedulerProviderForgeDiagnostics = [];
  const schedulerProviderCoreDiagnostics = [];
  const schedulerProviderActivity = [];
  const schedulerProviderFailureCoordinator = createForgeCoordinator({
    coreStore: {
      async appendDiagnostics(transactionId, diagnostic) {
        schedulerProviderForgeDiagnostics.push({ transactionId, diagnostic: cloneJson(diagnostic) });
        return { id: `scheduler-provider-failure-diagnostic-${schedulerProviderForgeDiagnostics.length}`, transactionId, diagnostic: cloneJson(diagnostic) };
      }
    },
    clock: now
  });
  const schedulerProviderFailureScheduler = createCampaignSidecarScheduler({
    generationRouter: {
      async generate() {
        assert.fail('Multiple requested campaign sidecars should use the batch generation path.');
      },
      async batch() {
        const error = new Error(`Provider batch failed before first result. ${schedulerProviderFailureRawCanary}`);
        error.code = 'DIRECTIVE_TEST_SCHEDULER_PROVIDER_BATCH_FAILED';
        throw error;
      }
    },
    stateDeltaGateway: schedulerProviderFailureGateway,
    getCampaignState: () => schedulerProviderFailureState,
    setCampaignState: (next) => { schedulerProviderFailureState = cloneJson(next); },
    persistCampaignState: async (next) => { schedulerProviderFailureState = cloneJson(next); },
    appendCoreDiagnostic: async (event) => {
      schedulerProviderCoreDiagnostics.push(cloneJson(event));
      return { ok: true };
    },
    forgeCoordinator: schedulerProviderFailureCoordinator,
    now
  });
  const schedulerProviderFailureResults = await schedulerProviderFailureScheduler.schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-provider-failure',
      turnId: 'turn-provider-failure',
      outcomeId: 'outcome-provider-failure'
    },
    activityReporter: (event) => schedulerProviderActivity.push(cloneJson(event))
  });
  assert.deepEqual(schedulerProviderFailureResults.map((result) => result.status), ['failed', 'failed']);
  assert.equal(schedulerProviderFailureResults.every((result) => result.error.code === 'DIRECTIVE_SIDECAR_BATCH_FAILED'), true);
  assert.equal(JSON.stringify(schedulerProviderFailureResults).includes(schedulerProviderFailureRawCanary), false);
  assert.equal(JSON.stringify(schedulerProviderActivity).includes(schedulerProviderFailureRawCanary), false);
  assert.equal(JSON.stringify(schedulerProviderCoreDiagnostics).includes(schedulerProviderFailureRawCanary), false);
  assert.equal(JSON.stringify(schedulerProviderForgeDiagnostics).includes(schedulerProviderFailureRawCanary), false);
}

{
  const directWorkerCodeCanary = 'RAW_DIRECT_WORKER_CODE_MUST_NOT_PERSIST';
  const directWorkerDiagnosticCanary = 'RAW_DIRECT_WORKER_DIAGNOSTIC_MUST_NOT_PERSIST';
  let directWorkerFailureState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-direct-worker-failure-test', status: 'active' },
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
  directWorkerFailureState = recordTurnIngress(directWorkerFailureState, {
    id: 'ingress-direct-worker-failure',
    hostMessageId: 'player-direct-worker-failure',
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-direct-worker-failure-test',
    textHash: 'direct-worker-failure-source-hash',
    textPreview: 'Source message for direct worker failure.',
    status: 'committed',
    outcomeId: 'outcome-direct-worker-failure',
    sourceFrameId: 'frame-direct-worker-failure',
    sourceFrame: {
      kind: 'directive.turnSourceFrame.v1',
      schemaVersion: 1,
      id: 'frame-direct-worker-failure',
      campaignId: 'campaign-sidecar-direct-worker-failure-test',
      saveId: 'save-sidecar-direct-worker-failure-test',
      chatId: 'campaign-chat',
      hostMessageId: 'player-direct-worker-failure',
      textHash: 'direct-worker-failure-source-hash'
    },
    coreTransactionId: 'txn-direct-worker-failure'
  });
  const directWorkerFailureGateway = createStateDeltaGateway({
    getState: () => directWorkerFailureState,
    setState: (next) => { directWorkerFailureState = cloneJson(next); },
    persist: async (next) => { directWorkerFailureState = cloneJson(next); },
    now
  });
  const directWorkerFailureCoreDiagnostics = [];
  const directWorkerFailureActivity = [];
  const directWorkerFailureResults = await createCampaignSidecarScheduler({
    generationRouter: {
      async generate() {
        return {
          ok: false,
          error: {
            code: `DIRECTIVE_${directWorkerCodeCanary}`,
            message: `Direct worker failed with raw text. ${directWorkerCodeCanary}`
          },
          diagnostics: {
            providerId: 'direct-provider',
            providerRawText: directWorkerDiagnosticCanary,
            nested: { privateText: directWorkerDiagnosticCanary }
          }
        };
      }
    },
    stateDeltaGateway: directWorkerFailureGateway,
    getCampaignState: () => directWorkerFailureState,
    setCampaignState: (next) => { directWorkerFailureState = cloneJson(next); },
    persistCampaignState: async (next) => { directWorkerFailureState = cloneJson(next); },
    appendCoreDiagnostic: async (event) => {
      directWorkerFailureCoreDiagnostics.push(cloneJson(event));
      return { ok: true };
    },
    now
  }).schedule({
    workerPlan: { relationship: true },
    turnContext: {
      ingressId: 'ingress-direct-worker-failure',
      turnId: 'turn-direct-worker-failure',
      outcomeId: 'outcome-direct-worker-failure'
    },
    activityReporter: (event) => directWorkerFailureActivity.push(cloneJson(event))
  });
  assert.deepEqual(directWorkerFailureResults.map((result) => result.status), ['failed']);
  assert.equal(directWorkerFailureResults[0].error.code, 'DIRECTIVE_SIDECAR_WORKER_FAILED');
  assert.equal(JSON.stringify(directWorkerFailureResults).includes(directWorkerCodeCanary), false);
  assert.equal(JSON.stringify(directWorkerFailureResults).includes(directWorkerDiagnosticCanary), false);
  assert.equal(JSON.stringify(directWorkerFailureState.runtimeTracking.sidecarJournal).includes(directWorkerCodeCanary), false);
  assert.equal(JSON.stringify(directWorkerFailureState.runtimeTracking.sidecarJournal).includes(directWorkerDiagnosticCanary), false);
  assert.equal(JSON.stringify(directWorkerFailureCoreDiagnostics).includes(directWorkerCodeCanary), false);
  assert.equal(JSON.stringify(directWorkerFailureCoreDiagnostics).includes(directWorkerDiagnosticCanary), false);
  assert.equal(JSON.stringify(directWorkerFailureActivity).includes(directWorkerCodeCanary), false);
  assert.equal(JSON.stringify(directWorkerFailureActivity).includes(directWorkerDiagnosticCanary), false);
}

{
  let fallbackState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-direct-fallback-test', status: 'active' },
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
  fallbackState = recordTurnIngress(fallbackState, {
    id: 'ingress-direct-fallback',
    hostMessageId: 'player-direct-fallback',
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-direct-fallback-test',
    textHash: 'direct-fallback-source-hash',
    textPreview: 'Source message for direct CORE fallback.',
    status: 'committed',
    outcomeId: 'outcome-direct-fallback',
    sourceFrameId: 'frame-direct-fallback',
    sourceFrame: {
      kind: 'directive.turnSourceFrame.v1',
      schemaVersion: 1,
      id: 'frame-direct-fallback',
      campaignId: 'campaign-sidecar-direct-fallback-test',
      saveId: 'save-sidecar-direct-fallback-test',
      chatId: 'campaign-chat',
      hostMessageId: 'player-direct-fallback',
      textHash: 'direct-fallback-source-hash'
    },
    coreTransactionId: 'txn-direct-fallback'
  });
  const fallbackGateway = createStateDeltaGateway({
    getState: () => fallbackState,
    setState: (next) => { fallbackState = cloneJson(next); },
    persist: async (next) => { fallbackState = cloneJson(next); },
    now
  });
  const fallbackCoreCommits = [];
  const fallbackPromptSyncs = [];
  const fallbackScheduler = createCampaignSidecarScheduler({
    generationRouter: {
      async generate() {
        assert.fail('Multiple requested campaign sidecars should use the batch generation path.');
      },
      async batch(requests) {
        return requests.map((request) => ({
          ok: true,
          response: {
            text: JSON.stringify({
              id: `direct-fallback-${request.roleId}`,
              operations: [{
                op: 'append',
                path: request.roleId === 'crewDirector' ? 'crew.casualties' : 'relationships.seniorCrew',
                value: { id: `direct-fallback-${request.roleId}`, summary: 'Direct fallback accepted work.' }
              }],
              summary: 'Direct fallback accepted proposal.'
            })
          }
        }));
      }
    },
    stateDeltaGateway: fallbackGateway,
    getCampaignState: () => fallbackState,
    setCampaignState: (next) => { fallbackState = cloneJson(next); },
    persistCampaignState: async (next) => { fallbackState = cloneJson(next); },
    syncPromptContext: async () => {
      fallbackPromptSyncs.push(true);
      return null;
    },
    commitCoreBackgroundBatch: async (transactionId, bundle) => {
      fallbackCoreCommits.push({ transactionId, bundle: cloneJson(bundle) });
      return forgeBackgroundTransaction(transactionId, bundle);
    },
    now
  });
  const fallbackResults = await fallbackScheduler.schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-direct-fallback',
      turnId: 'turn-direct-fallback',
      outcomeId: 'outcome-direct-fallback'
    }
  });
  assert.deepEqual(fallbackResults.map((result) => result.status), ['rejected', 'rejected']);
  assert.equal(fallbackResults.every((result) => result.error.code === 'DIRECTIVE_FORGE_FINAL_SETTLEMENT_FAILED'), true);
  assert.equal(fallbackCoreCommits.length, 0, 'No-FORGE accepted batches must not settle through scheduler-owned direct CORE fallback.');
  assert.equal(fallbackPromptSyncs.length, 0);
  assert.equal(fallbackState.relationships.seniorCrew.length, 0);
  assert.equal(fallbackState.crew.casualties.length, 0);
  const fallbackRejectedJournal = fallbackState.runtimeTracking.sidecarJournal.slice(-2);
  assert.deepEqual(fallbackRejectedJournal.map((entry) => entry.status), []);
}

{
  for (const variant of [
    { suffix: 'null', receipt: null },
    { suffix: 'ok-false', receipt: { id: 'txn-direct-fallback-ok-false', ok: false, backgroundBatchIds: ['background:ok-false'] } },
    { suffix: 'mismatched', receipt: { id: 'wrong-direct-fallback-txn', backgroundBatchIds: ['background:wrong-direct-fallback-txn'], backgroundBatches: [{ batchId: 'background:wrong-direct-fallback-txn', operationCount: 2 }] } },
    { suffix: 'no-batch', receipt: { id: 'txn-direct-fallback-no-batch' } },
    { suffix: 'wrong-batch', receipt: { id: 'txn-direct-fallback-wrong-batch', backgroundBatchIds: ['campaign-sidecar:txn-direct-fallback-wrong-batch:other-outcome'], backgroundBatches: [{ batchId: 'campaign-sidecar:txn-direct-fallback-wrong-batch:other-outcome', operationCount: 2 }] } },
    {
      suffix: 'missing-idempotency-key',
      receiptFor: (transactionId, bundle) => ({
        id: transactionId,
        backgroundBatchIds: [bundle.batchId],
        backgroundBatches: [{
          batchId: bundle.batchId,
          operationCount: 2,
          forgeBatchRef: cloneJson(bundle.forgeBatchRef || {})
        }]
      })
    },
    {
      suffix: 'missing-accepted-hash',
      receiptFor: (transactionId, bundle) => ({
        id: transactionId,
        backgroundIdempotencyKey: bundle.idempotencyKey,
        backgroundIdempotencyKeys: [bundle.idempotencyKey],
        backgroundBatchIds: [bundle.batchId],
        backgroundBatches: [{
          batchId: bundle.batchId,
          idempotencyKey: bundle.idempotencyKey,
          operationCount: 2
        }]
      })
    },
    {
      suffix: 'mismatched-accepted-hash',
      receiptFor: (transactionId, bundle) => ({
        id: transactionId,
        backgroundIdempotencyKey: bundle.idempotencyKey,
        backgroundIdempotencyKeys: [bundle.idempotencyKey],
        backgroundBatchIds: [bundle.batchId],
        backgroundBatches: [{
          batchId: bundle.batchId,
          idempotencyKey: bundle.idempotencyKey,
          operationCount: 2,
          forgeBatchRef: {
            ...cloneJson(bundle.forgeBatchRef || {}),
            acceptedBatchHash: 'mismatched-direct-fallback-accepted-hash'
          }
        }]
      })
    }
  ]) {
    const transactionId = `txn-direct-fallback-${variant.suffix}`;
    let badFallbackState = initializeCampaignRuntimeTracking({
      campaign: { id: `campaign-sidecar-direct-fallback-${variant.suffix}-test`, status: 'active' },
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
    badFallbackState = recordTurnIngress(badFallbackState, {
      id: `ingress-direct-fallback-${variant.suffix}`,
      hostMessageId: `player-direct-fallback-${variant.suffix}`,
      chatId: 'campaign-chat',
      campaignId: `campaign-sidecar-direct-fallback-${variant.suffix}-test`,
      textHash: `direct-fallback-${variant.suffix}-source-hash`,
      textPreview: `Source message for bad direct CORE fallback ${variant.suffix}.`,
      status: 'committed',
      outcomeId: `outcome-direct-fallback-${variant.suffix}`,
      sourceFrameId: `frame-direct-fallback-${variant.suffix}`,
      sourceFrame: {
        kind: 'directive.turnSourceFrame.v1',
        schemaVersion: 1,
        id: `frame-direct-fallback-${variant.suffix}`,
        campaignId: `campaign-sidecar-direct-fallback-${variant.suffix}-test`,
        saveId: `save-sidecar-direct-fallback-${variant.suffix}`,
        chatId: 'campaign-chat',
        hostMessageId: `player-direct-fallback-${variant.suffix}`,
        textHash: `direct-fallback-${variant.suffix}-source-hash`
      },
      coreTransactionId: transactionId
    });
    const badFallbackGateway = createStateDeltaGateway({
      getState: () => badFallbackState,
      setState: (next) => { badFallbackState = cloneJson(next); },
      persist: async (next) => { badFallbackState = cloneJson(next); },
      now
    });
    const badFallbackPromptSyncs = [];
    const badFallbackCoreCommits = [];
    const badFallbackResults = await createCampaignSidecarScheduler({
      generationRouter: {
        async generate() {
          assert.fail('Multiple requested campaign sidecars should use the batch generation path.');
        },
        async batch(requests) {
          return requests.map((request) => ({
            ok: true,
            response: {
              text: JSON.stringify({
                id: `direct-fallback-${variant.suffix}-${request.roleId}`,
                operations: [{
                  op: 'append',
                  path: request.roleId === 'crewDirector' ? 'crew.casualties' : 'relationships.seniorCrew',
                  value: { id: `direct-fallback-${variant.suffix}-${request.roleId}`, summary: 'This must reject when direct CORE receipt is not durable.' }
                }],
                summary: 'Bad direct fallback proposal.'
              })
            }
          }));
        }
      },
      stateDeltaGateway: badFallbackGateway,
      getCampaignState: () => badFallbackState,
      setCampaignState: (next) => { badFallbackState = cloneJson(next); },
      persistCampaignState: async (next) => { badFallbackState = cloneJson(next); },
      syncPromptContext: async () => {
        badFallbackPromptSyncs.push(true);
        return null;
      },
      commitCoreBackgroundBatch: async (commitTransactionId, bundle) => {
        badFallbackCoreCommits.push({ transactionId: commitTransactionId, bundle: cloneJson(bundle) });
        return cloneJson(
          typeof variant.receiptFor === 'function'
            ? variant.receiptFor(commitTransactionId, bundle)
            : variant.receipt
        );
      },
      now
    }).schedule({
      workerPlan: { relationship: true, crew: true },
      turnContext: {
        ingressId: `ingress-direct-fallback-${variant.suffix}`,
        turnId: `turn-direct-fallback-${variant.suffix}`,
        outcomeId: `outcome-direct-fallback-${variant.suffix}`
      }
    });
    assert.deepEqual(badFallbackResults.map((result) => result.status), ['rejected', 'rejected']);
    assert.equal(badFallbackResults.every((result) => result.error.code === 'DIRECTIVE_FORGE_FINAL_SETTLEMENT_FAILED'), true);
    assert.equal(badFallbackCoreCommits.length, 0);
    assert.equal(badFallbackPromptSyncs.length, 0);
    assert.equal(badFallbackState.relationships.seniorCrew.length, 0);
    assert.equal(badFallbackState.crew.casualties.length, 0);
    const badFallbackJournal = badFallbackState.runtimeTracking.sidecarJournal.slice(-2);
    assert.deepEqual(badFallbackJournal.map((entry) => entry.status), []);
  }
}

{
  for (const variant of [
    { suffix: 'id-only', background: { transactionId: 'txn-weak-background-id-only' } },
    { suffix: 'ok-false', background: { transactionId: 'txn-weak-background-ok-false', ok: false } },
    { suffix: 'ok-true-no-batch', background: { transactionId: 'txn-weak-background-ok-true-no-batch', ok: true } }
  ]) {
    let weakBackgroundState = initializeCampaignRuntimeTracking({
      campaign: { id: `campaign-sidecar-weak-background-${variant.suffix}`, status: 'active' },
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
    const transactionId = `txn-weak-background-${variant.suffix}`;
    weakBackgroundState = recordTurnIngress(weakBackgroundState, {
      id: `ingress-weak-background-${variant.suffix}`,
      hostMessageId: `player-weak-background-${variant.suffix}`,
      chatId: 'campaign-chat',
      campaignId: `campaign-sidecar-weak-background-${variant.suffix}`,
      textHash: `weak-background-${variant.suffix}-source-hash`,
      textPreview: `Source message for weak ${variant.suffix} background evidence.`,
      status: 'committed',
      outcomeId: `outcome-weak-background-${variant.suffix}`,
      sourceFrameId: `frame-weak-background-${variant.suffix}`,
      sourceFrame: {
        kind: 'directive.turnSourceFrame.v1',
        schemaVersion: 1,
        id: `frame-weak-background-${variant.suffix}`,
        campaignId: `campaign-sidecar-weak-background-${variant.suffix}`,
        saveId: `save-sidecar-weak-background-${variant.suffix}`,
        chatId: 'campaign-chat',
        hostMessageId: `player-weak-background-${variant.suffix}`,
        textHash: `weak-background-${variant.suffix}-source-hash`
      },
      coreTransactionId: transactionId
    });
    const weakBackgroundGateway = createStateDeltaGateway({
      getState: () => weakBackgroundState,
      setState: (next) => { weakBackgroundState = cloneJson(next); },
      persist: async (next) => { weakBackgroundState = cloneJson(next); },
      now
    });
    const weakBackgroundResults = await createCampaignSidecarScheduler({
      generationRouter: {
        async generate() {
          assert.fail('Multiple requested campaign sidecars should use the batch generation path.');
        },
        async batch(requests) {
          return requests.map((request) => ({
            ok: true,
            response: {
              text: JSON.stringify({
                id: `weak-background-${variant.suffix}-${request.roleId}`,
                operations: [{
                  op: 'append',
                  path: request.roleId === 'crewDirector' ? 'crew.casualties' : 'relationships.seniorCrew',
                  value: { id: `weak-background-${variant.suffix}-${request.roleId}`, summary: 'This must reject without explicit durable background success.' }
                }],
                summary: 'Weak background proposal.'
              })
            }
          }));
        }
      },
      stateDeltaGateway: weakBackgroundGateway,
      getCampaignState: () => weakBackgroundState,
      setCampaignState: (next) => { weakBackgroundState = cloneJson(next); },
      persistCampaignState: async (next) => { weakBackgroundState = cloneJson(next); },
      forgeCoordinator: {
        async prepareAcceptedBatch() {
          return { status: 'prepared' };
        },
        async settleAcceptedBatch() {
          return { status: 'settled', transactionId, background: variant.background };
        }
      },
      now
    }).schedule({
      workerPlan: { relationship: true, crew: true },
      turnContext: {
        ingressId: `ingress-weak-background-${variant.suffix}`,
        turnId: `turn-weak-background-${variant.suffix}`,
        outcomeId: `outcome-weak-background-${variant.suffix}`
      }
    });
    assert.deepEqual(weakBackgroundResults.map((result) => result.status), ['rejected', 'rejected']);
    assert.equal(weakBackgroundResults.every((result) => result.error.code === 'DIRECTIVE_FORGE_FINAL_SETTLEMENT_FAILED'), true);
    assert.equal(weakBackgroundState.relationships.seniorCrew.length, 0);
    assert.equal(weakBackgroundState.crew.casualties.length, 0);
    const weakBackgroundJournal = weakBackgroundState.runtimeTracking.sidecarJournal.slice(-2);
    assert.deepEqual(weakBackgroundJournal.map((entry) => entry.status), []);
  }
}

{
  let mismatchedBackgroundState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-mismatched-background-test', status: 'active' },
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
  mismatchedBackgroundState = recordTurnIngress(mismatchedBackgroundState, {
    id: 'ingress-mismatched-background',
    hostMessageId: 'player-mismatched-background',
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-mismatched-background-test',
    textHash: 'mismatched-background-source-hash',
    textPreview: 'Source message for mismatched background receipt.',
    status: 'committed',
    outcomeId: 'outcome-mismatched-background',
    sourceFrameId: 'frame-mismatched-background',
    sourceFrame: {
      kind: 'directive.turnSourceFrame.v1',
      schemaVersion: 1,
      id: 'frame-mismatched-background',
      campaignId: 'campaign-sidecar-mismatched-background-test',
      saveId: 'save-sidecar-mismatched-background-test',
      chatId: 'campaign-chat',
      hostMessageId: 'player-mismatched-background',
      textHash: 'mismatched-background-source-hash'
    },
    coreTransactionId: 'txn-mismatched-background'
  });
  const mismatchedBackgroundGateway = createStateDeltaGateway({
    getState: () => mismatchedBackgroundState,
    setState: (next) => { mismatchedBackgroundState = cloneJson(next); },
    persist: async (next) => { mismatchedBackgroundState = cloneJson(next); },
    now
  });
  const mismatchedBackgroundResults = await createCampaignSidecarScheduler({
    generationRouter: {
      async generate() {
        assert.fail('Multiple requested campaign sidecars should use the batch generation path.');
      },
      async batch(requests) {
        return requests.map((request) => ({
          ok: true,
          response: {
            text: JSON.stringify({
              id: `mismatched-background-${request.roleId}`,
              operations: [{
                op: 'append',
                path: request.roleId === 'crewDirector' ? 'crew.casualties' : 'relationships.seniorCrew',
                value: { id: `mismatched-background-${request.roleId}`, summary: 'This must reject because background belongs to another CORE transaction.' }
              }],
              summary: 'Mismatched background receipt proposal.'
            })
          }
        }));
      }
    },
    stateDeltaGateway: mismatchedBackgroundGateway,
    getCampaignState: () => mismatchedBackgroundState,
    setCampaignState: (next) => { mismatchedBackgroundState = cloneJson(next); },
    persistCampaignState: async (next) => { mismatchedBackgroundState = cloneJson(next); },
    forgeCoordinator: {
      async prepareAcceptedBatch() {
        return { status: 'prepared' };
      },
      async settleAcceptedBatch() {
        return {
          status: 'settled',
          background: {
            transactionId: 'wrong-txn-mismatched-background',
            backgroundBatchIds: ['background:wrong-txn-mismatched-background'],
            backgroundBatches: [{ batchId: 'background:wrong-txn-mismatched-background', operationCount: 2 }]
          }
        };
      }
    },
    now
  }).schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-mismatched-background',
      turnId: 'turn-mismatched-background',
      outcomeId: 'outcome-mismatched-background'
    }
  });
  assert.deepEqual(mismatchedBackgroundResults.map((result) => result.status), ['rejected', 'rejected']);
  assert.equal(mismatchedBackgroundResults.every((result) => result.error.code === 'DIRECTIVE_FORGE_FINAL_SETTLEMENT_FAILED'), true);
  assert.equal(mismatchedBackgroundState.relationships.seniorCrew.length, 0);
  assert.equal(mismatchedBackgroundState.crew.casualties.length, 0);
  const mismatchedBackgroundJournal = mismatchedBackgroundState.runtimeTracking.sidecarJournal.slice(-2);
  assert.deepEqual(mismatchedBackgroundJournal.map((entry) => entry.status), []);
}

{
  let wrongBatchBackgroundState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-wrong-batch-background-test', status: 'active' },
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
  wrongBatchBackgroundState = recordTurnIngress(wrongBatchBackgroundState, {
    id: 'ingress-wrong-batch-background',
    hostMessageId: 'player-wrong-batch-background',
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-wrong-batch-background-test',
    textHash: 'wrong-batch-background-source-hash',
    textPreview: 'Source message for wrong batch background receipt.',
    status: 'committed',
    outcomeId: 'outcome-wrong-batch-background',
    sourceFrameId: 'frame-wrong-batch-background',
    sourceFrame: {
      kind: 'directive.turnSourceFrame.v1',
      schemaVersion: 1,
      id: 'frame-wrong-batch-background',
      campaignId: 'campaign-sidecar-wrong-batch-background-test',
      saveId: 'save-sidecar-wrong-batch-background-test',
      chatId: 'campaign-chat',
      hostMessageId: 'player-wrong-batch-background',
      textHash: 'wrong-batch-background-source-hash'
    },
    coreTransactionId: 'txn-wrong-batch-background'
  });
  const wrongBatchBackgroundGateway = createStateDeltaGateway({
    getState: () => wrongBatchBackgroundState,
    setState: (next) => { wrongBatchBackgroundState = cloneJson(next); },
    persist: async (next) => { wrongBatchBackgroundState = cloneJson(next); },
    now
  });
  const wrongBatchBackgroundResults = await createCampaignSidecarScheduler({
    generationRouter: {
      async generate() {
        assert.fail('Multiple requested campaign sidecars should use the batch generation path.');
      },
      async batch(requests) {
        return requests.map((request) => ({
          ok: true,
          response: {
            text: JSON.stringify({
              id: `wrong-batch-background-${request.roleId}`,
              operations: [{
                op: 'append',
                path: request.roleId === 'crewDirector' ? 'crew.casualties' : 'relationships.seniorCrew',
                value: { id: `wrong-batch-background-${request.roleId}`, summary: 'This must reject because background evidence is for another batch.' }
              }],
              summary: 'Wrong batch background receipt proposal.'
            })
          }
        }));
      }
    },
    stateDeltaGateway: wrongBatchBackgroundGateway,
    getCampaignState: () => wrongBatchBackgroundState,
    setCampaignState: (next) => { wrongBatchBackgroundState = cloneJson(next); },
    persistCampaignState: async (next) => { wrongBatchBackgroundState = cloneJson(next); },
    forgeCoordinator: {
      async prepareAcceptedBatch() {
        return { status: 'prepared' };
      },
      async settleAcceptedBatch() {
        return {
          status: 'settled',
          transactionId: 'txn-wrong-batch-background',
          background: {
            id: 'txn-wrong-batch-background',
            backgroundBatchIds: ['campaign-sidecar:txn-wrong-batch-background:other-outcome'],
            backgroundBatches: [{ batchId: 'campaign-sidecar:txn-wrong-batch-background:other-outcome', operationCount: 2 }]
          }
        };
      }
    },
    now
  }).schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-wrong-batch-background',
      turnId: 'turn-wrong-batch-background',
      outcomeId: 'outcome-wrong-batch-background'
    }
  });
  assert.deepEqual(wrongBatchBackgroundResults.map((result) => result.status), ['rejected', 'rejected']);
  assert.equal(wrongBatchBackgroundState.relationships.seniorCrew.length, 0);
  assert.equal(wrongBatchBackgroundState.crew.casualties.length, 0);
  const wrongBatchBackgroundJournal = wrongBatchBackgroundState.runtimeTracking.sidecarJournal.slice(-2);
  assert.deepEqual(wrongBatchBackgroundJournal.map((entry) => entry.status), []);
}

{
  let missingHashBackgroundState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-missing-hash-background-test', status: 'active' },
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
  missingHashBackgroundState = recordTurnIngress(missingHashBackgroundState, {
    id: 'ingress-missing-hash-background',
    hostMessageId: 'player-missing-hash-background',
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-missing-hash-background-test',
    textHash: 'missing-hash-background-source-hash',
    textPreview: 'Source message for missing accepted hash background receipt.',
    status: 'committed',
    outcomeId: 'outcome-missing-hash-background',
    sourceFrameId: 'frame-missing-hash-background',
    sourceFrame: {
      kind: 'directive.turnSourceFrame.v1',
      schemaVersion: 1,
      id: 'frame-missing-hash-background',
      campaignId: 'campaign-sidecar-missing-hash-background-test',
      saveId: 'save-sidecar-missing-hash-background-test',
      chatId: 'campaign-chat',
      hostMessageId: 'player-missing-hash-background',
      textHash: 'missing-hash-background-source-hash'
    },
    coreTransactionId: 'txn-missing-hash-background'
  });
  const missingHashBackgroundGateway = createStateDeltaGateway({
    getState: () => missingHashBackgroundState,
    setState: (next) => { missingHashBackgroundState = cloneJson(next); },
    persist: async (next) => { missingHashBackgroundState = cloneJson(next); },
    now
  });
  const missingHashBackgroundResults = await createCampaignSidecarScheduler({
    generationRouter: {
      async generate() {
        assert.fail('Multiple requested campaign sidecars should use the batch generation path.');
      },
      async batch(requests) {
        return requests.map((request) => ({
          ok: true,
          response: {
            text: JSON.stringify({
              id: `missing-hash-background-${request.roleId}`,
              operations: [{
                op: 'append',
                path: request.roleId === 'crewDirector' ? 'crew.casualties' : 'relationships.seniorCrew',
                value: { id: `missing-hash-background-${request.roleId}`, summary: 'This must reject because accepted batch hash is missing.' }
              }],
              summary: 'Missing accepted batch hash proposal.'
            })
          }
        }));
      }
    },
    stateDeltaGateway: missingHashBackgroundGateway,
    getCampaignState: () => missingHashBackgroundState,
    setCampaignState: (next) => { missingHashBackgroundState = cloneJson(next); },
    persistCampaignState: async (next) => { missingHashBackgroundState = cloneJson(next); },
    forgeCoordinator: {
      async prepareAcceptedBatch() {
        return { status: 'prepared' };
      },
      async settleAcceptedBatch() {
        return {
          status: 'settled',
          transactionId: 'txn-missing-hash-background',
          background: {
            id: 'txn-missing-hash-background',
            backgroundBatchIds: ['campaign-sidecar:txn-missing-hash-background:outcome-missing-hash-background'],
            backgroundBatches: [{ batchId: 'campaign-sidecar:txn-missing-hash-background:outcome-missing-hash-background', operationCount: 2 }]
          }
        };
      }
    },
    now
  }).schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-missing-hash-background',
      turnId: 'turn-missing-hash-background',
      outcomeId: 'outcome-missing-hash-background'
    }
  });
  assert.deepEqual(missingHashBackgroundResults.map((result) => result.status), ['rejected', 'rejected']);
  assert.equal(missingHashBackgroundState.relationships.seniorCrew.length, 0);
  assert.equal(missingHashBackgroundState.crew.casualties.length, 0);
  const missingHashBackgroundJournal = missingHashBackgroundState.runtimeTracking.sidecarJournal.slice(-2);
  assert.deepEqual(missingHashBackgroundJournal.map((entry) => entry.status), []);
}

{
  let realBackgroundState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-real-background-test', status: 'active' },
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
  realBackgroundState = recordTurnIngress(realBackgroundState, {
    id: 'ingress-real-background',
    hostMessageId: 'player-real-background',
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-real-background-test',
    textHash: 'real-background-source-hash',
    textPreview: 'Source message for real transaction-shaped background evidence.',
    status: 'committed',
    outcomeId: 'outcome-real-background',
    sourceFrameId: 'frame-real-background',
    sourceFrame: {
      kind: 'directive.turnSourceFrame.v1',
      schemaVersion: 1,
      id: 'frame-real-background',
      campaignId: 'campaign-sidecar-real-background-test',
      saveId: 'save-sidecar-real-background-test',
      chatId: 'campaign-chat',
      hostMessageId: 'player-real-background',
      textHash: 'real-background-source-hash'
    },
    coreTransactionId: 'txn-real-background'
  });
  const realBackgroundGateway = createStateDeltaGateway({
    getState: () => realBackgroundState,
    setState: (next) => { realBackgroundState = cloneJson(next); },
    persist: async (next) => { realBackgroundState = cloneJson(next); },
    now
  });
  const realBackgroundResults = await createCampaignSidecarScheduler({
    generationRouter: {
      async generate() {
        assert.fail('Multiple requested campaign sidecars should use the batch generation path.');
      },
      async batch(requests) {
        return requests.map((request) => ({
          ok: true,
          response: {
            text: JSON.stringify({
              id: `real-background-${request.roleId}`,
              operations: [{
                op: 'append',
                path: request.roleId === 'crewDirector' ? 'crew.casualties' : 'relationships.seniorCrew',
                value: { id: `real-background-${request.roleId}`, summary: 'This can apply with transaction-shaped background evidence.' }
              }],
              summary: 'Real background proposal.'
            })
          }
        }));
      }
    },
    stateDeltaGateway: realBackgroundGateway,
    getCampaignState: () => realBackgroundState,
    setCampaignState: (next) => { realBackgroundState = cloneJson(next); },
    persistCampaignState: async (next) => { realBackgroundState = cloneJson(next); },
    forgeCoordinator: {
      async prepareAcceptedBatch() {
        return { status: 'prepared' };
      },
      async settleAcceptedBatch(input) {
        return {
          status: 'settled',
          transactionId: 'txn-real-background',
          acceptedBatchHash: input.acceptedBatchHash,
          background: {
            id: 'txn-real-background',
            backgroundIdempotencyKey: input.idempotencyKey,
            backgroundIdempotencyKeys: [input.idempotencyKey],
            backgroundBatchIds: ['campaign-sidecar:txn-real-background:outcome-real-background'],
            backgroundBatches: [{
              batchId: 'campaign-sidecar:txn-real-background:outcome-real-background',
              idempotencyKey: input.idempotencyKey,
              operationCount: 2,
              forgeBatchRef: { acceptedBatchHash: input.acceptedBatchHash }
            }]
          }
        };
      }
    },
    now
  }).schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-real-background',
      turnId: 'turn-real-background',
      outcomeId: 'outcome-real-background'
    }
  });
  assert.deepEqual(realBackgroundResults.map((result) => result.status), ['applied', 'applied']);
  assert.equal(realBackgroundState.relationships.seniorCrew.length, 0);
  assert.equal(realBackgroundState.crew.casualties.length, 0);
  assert.equal(realBackgroundState.runtimeTracking.sidecarJournal.length, 0);
}

{
  let unsafeSettledState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-unsafe-settled-test', status: 'active' },
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
  unsafeSettledState = recordTurnIngress(unsafeSettledState, {
    id: 'ingress-unsafe-settled',
    hostMessageId: 'player-unsafe-settled',
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-unsafe-settled-test',
    textHash: 'unsafe-settled-source-hash',
    textPreview: 'Source message for unsafe settled bridge.',
    status: 'committed',
    outcomeId: 'outcome-unsafe-settled',
    sourceFrameId: 'frame-unsafe-settled',
    sourceFrame: {
      kind: 'directive.turnSourceFrame.v1',
      schemaVersion: 1,
      id: 'frame-unsafe-settled',
      campaignId: 'campaign-sidecar-unsafe-settled-test',
      saveId: 'save-sidecar-unsafe-settled-test',
      chatId: 'campaign-chat',
      hostMessageId: 'player-unsafe-settled',
      textHash: 'unsafe-settled-source-hash'
    },
    coreTransactionId: 'txn-unsafe-settled'
  });
  const unsafeSettledGateway = createStateDeltaGateway({
    getState: () => unsafeSettledState,
    setState: (next) => { unsafeSettledState = cloneJson(next); },
    persist: async (next) => { unsafeSettledState = cloneJson(next); },
    now
  });
  const unsafeSettledResults = await createCampaignSidecarScheduler({
    generationRouter: {
      async generate() {
        assert.fail('Multiple requested campaign sidecars should use the batch generation path.');
      },
      async batch(requests) {
        return requests.map((request) => ({
          ok: true,
          response: {
            text: JSON.stringify({
              id: `unsafe-settled-${request.roleId}`,
              operations: [{
                op: 'append',
                path: request.roleId === 'crewDirector' ? 'crew.casualties' : 'relationships.seniorCrew',
                value: { id: `unsafe-settled-${request.roleId}`, summary: 'This must fail closed without durable background evidence.' }
              }],
              summary: 'Unsafe settled proposal.'
            })
          }
        }));
      }
    },
    stateDeltaGateway: unsafeSettledGateway,
    getCampaignState: () => unsafeSettledState,
    setCampaignState: (next) => { unsafeSettledState = cloneJson(next); },
    persistCampaignState: async (next) => { unsafeSettledState = cloneJson(next); },
    forgeCoordinator: {
      async prepareAcceptedBatch() {
        return { status: 'prepared' };
      },
      async settleAcceptedBatch() {
        return { status: 'settled', transactionId: 'txn-unsafe-settled', background: null };
      }
    },
    now
  }).schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-unsafe-settled',
      turnId: 'turn-unsafe-settled',
      outcomeId: 'outcome-unsafe-settled'
    }
  });
  assert.deepEqual(unsafeSettledResults.map((result) => result.status), ['rejected', 'rejected']);
  assert.equal(unsafeSettledResults.every((result) => result.error.code === 'DIRECTIVE_FORGE_FINAL_SETTLEMENT_FAILED'), true);
  assert.equal(unsafeSettledState.relationships.seniorCrew.length, 0);
  assert.equal(unsafeSettledState.crew.casualties.length, 0);
  const unsafeSettledJournal = unsafeSettledState.runtimeTracking.sidecarJournal.slice(-2);
  assert.deepEqual(unsafeSettledJournal.map((entry) => entry.status), []);
}

{
  for (const variant of [
    {
      suffix: 'idempotency-no-batch',
      backgroundFor: (transactionId, input) => ({
        id: transactionId,
        backgroundIdempotencyKey: input.idempotencyKey,
        backgroundBatches: [{ idempotencyKey: input.idempotencyKey, operationCount: 2 }]
      })
    },
    {
      suffix: 'idempotency-wrong-batch',
      backgroundFor: (transactionId, input) => ({
        id: transactionId,
        backgroundBatchIds: [`campaign-sidecar:${transactionId}:wrong-outcome`],
        backgroundBatches: [{
          batchId: `campaign-sidecar:${transactionId}:wrong-outcome`,
          idempotencyKey: input.idempotencyKey,
          operationCount: 2
        }]
      })
    }
  ]) {
    const transactionId = `txn-forge-${variant.suffix}`;
    let idempotencyState = initializeCampaignRuntimeTracking({
      campaign: { id: `campaign-sidecar-forge-${variant.suffix}-test`, status: 'active' },
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
    idempotencyState = recordTurnIngress(idempotencyState, {
      id: `ingress-forge-${variant.suffix}`,
      hostMessageId: `player-forge-${variant.suffix}`,
      chatId: 'campaign-chat',
      campaignId: `campaign-sidecar-forge-${variant.suffix}-test`,
      textHash: `forge-${variant.suffix}-source-hash`,
      textPreview: `Source message for ${variant.suffix}.`,
      status: 'committed',
      outcomeId: `outcome-forge-${variant.suffix}`,
      sourceFrameId: `frame-forge-${variant.suffix}`,
      sourceFrame: {
        kind: 'directive.turnSourceFrame.v1',
        schemaVersion: 1,
        id: `frame-forge-${variant.suffix}`,
        campaignId: `campaign-sidecar-forge-${variant.suffix}-test`,
        saveId: `save-sidecar-forge-${variant.suffix}-test`,
        chatId: 'campaign-chat',
        hostMessageId: `player-forge-${variant.suffix}`,
        textHash: `forge-${variant.suffix}-source-hash`
      },
      coreTransactionId: transactionId
    });
    const idempotencyGateway = createStateDeltaGateway({
      getState: () => idempotencyState,
      setState: (next) => { idempotencyState = cloneJson(next); },
      persist: async (next) => { idempotencyState = cloneJson(next); },
      now
    });
    const idempotencyResults = await createCampaignSidecarScheduler({
      generationRouter: {
        async generate() {
          assert.fail('Multiple requested campaign sidecars should use the batch generation path.');
        },
        async batch(requests) {
          return requests.map((request) => ({
            ok: true,
            response: {
              text: JSON.stringify({
                id: `forge-${variant.suffix}-${request.roleId}`,
                operations: [{
                  op: 'append',
                  path: request.roleId === 'crewDirector' ? 'crew.casualties' : 'relationships.seniorCrew',
                  value: { id: `forge-${variant.suffix}-${request.roleId}`, summary: 'This must reject without matching batch id.' }
                }],
                summary: 'Idempotency-only receipt proposal.'
              })
            }
          }));
        }
      },
      stateDeltaGateway: idempotencyGateway,
      getCampaignState: () => idempotencyState,
      setCampaignState: (next) => { idempotencyState = cloneJson(next); },
      persistCampaignState: async (next) => { idempotencyState = cloneJson(next); },
      forgeCoordinator: {
        async prepareAcceptedBatch() {
          return { status: 'prepared' };
        },
        async settleAcceptedBatch(input) {
          return {
            status: 'settled',
            transactionId,
            acceptedBatchHash: input.acceptedBatchHash,
            background: variant.backgroundFor(transactionId, input)
          };
        }
      },
      now
    }).schedule({
      workerPlan: { relationship: true, crew: true },
      turnContext: {
        ingressId: `ingress-forge-${variant.suffix}`,
        turnId: `turn-forge-${variant.suffix}`,
        outcomeId: `outcome-forge-${variant.suffix}`
      }
    });
    assert.deepEqual(idempotencyResults.map((result) => result.status), ['rejected', 'rejected']);
    assert.equal(idempotencyState.relationships.seniorCrew.length, 0);
    assert.equal(idempotencyState.crew.casualties.length, 0);
    const idempotencyJournal = idempotencyState.runtimeTracking.sidecarJournal.slice(-2);
    assert.deepEqual(idempotencyJournal.map((entry) => entry.status), []);
  }
}

{
  let rawWarningState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-raw-warning-test', status: 'active' },
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
  rawWarningState = recordTurnIngress(rawWarningState, {
    id: 'ingress-raw-warning',
    hostMessageId: 'player-raw-warning',
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-raw-warning-test',
    textHash: 'raw-warning-source-hash',
    textPreview: 'Source message for raw warning redaction.',
    status: 'committed',
    outcomeId: 'outcome-raw-warning',
    sourceFrameId: 'frame-raw-warning',
    sourceFrame: {
      kind: 'directive.turnSourceFrame.v1',
      schemaVersion: 1,
      id: 'frame-raw-warning',
      campaignId: 'campaign-sidecar-raw-warning-test',
      saveId: 'save-sidecar-raw-warning-test',
      chatId: 'campaign-chat',
      hostMessageId: 'player-raw-warning',
      textHash: 'raw-warning-source-hash'
    },
    coreTransactionId: 'txn-raw-warning'
  });
  const rawWarningGateway = createStateDeltaGateway({
    getState: () => rawWarningState,
    setState: (next) => { rawWarningState = cloneJson(next); },
    persist: async (next) => { rawWarningState = cloneJson(next); },
    now
  });
  const rawWarningCanary = 'RAW_FORGE_WARNING_DETAIL_MUST_NOT_PERSIST';
  const rawWarningCoreDiagnostics = [];
  const rawWarningResults = await createCampaignSidecarScheduler({
    generationRouter: {
      async generate() {
        assert.fail('Multiple requested campaign sidecars should use the batch generation path.');
      },
      async batch(requests) {
        return requests.map((request) => ({
          ok: true,
          response: {
            text: JSON.stringify({
              id: `raw-warning-${request.roleId}`,
              operations: [{
                op: 'append',
                path: request.roleId === 'crewDirector' ? 'crew.casualties' : 'relationships.seniorCrew',
                value: { id: `raw-warning-${request.roleId}`, summary: 'This must apply with redacted warning diagnostics.' }
              }],
              summary: 'Raw warning proposal.'
            })
          }
        }));
      }
    },
    stateDeltaGateway: rawWarningGateway,
    getCampaignState: () => rawWarningState,
    setCampaignState: (next) => { rawWarningState = cloneJson(next); },
    persistCampaignState: async (next) => { rawWarningState = cloneJson(next); },
    appendCoreDiagnostic: async (event) => {
      rawWarningCoreDiagnostics.push(cloneJson(event));
      return { ok: true };
    },
    forgeCoordinator: {
      async prepareAcceptedBatch() {
        return { status: 'prepared' };
      },
      async settleAcceptedBatch(input) {
        return {
          status: 'settled',
          transactionId: 'txn-raw-warning',
          acceptedBatchHash: input.acceptedBatchHash,
          background: {
            id: 'txn-raw-warning',
            backgroundIdempotencyKey: input.idempotencyKey,
            backgroundIdempotencyKeys: [input.idempotencyKey],
            backgroundBatchIds: ['campaign-sidecar:txn-raw-warning:outcome-raw-warning'],
            backgroundBatches: [{
              batchId: 'campaign-sidecar:txn-raw-warning:outcome-raw-warning',
              idempotencyKey: input.idempotencyKey,
              operationCount: 2,
              forgeBatchRef: { acceptedBatchHash: input.acceptedBatchHash }
            }]
          },
          warning: {
            stage: `diagnostics-${rawWarningCanary}`,
            code: `DIRECTIVE_TEST_RAW_WARNING_${rawWarningCanary}`,
            status: `warning-${rawWarningCanary}`,
            rawProviderText: rawWarningCanary
          }
        };
      }
    },
    now
  }).schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-raw-warning',
      turnId: 'turn-raw-warning',
      outcomeId: 'outcome-raw-warning'
    }
  });
  assert.deepEqual(rawWarningResults.map((result) => result.status), ['applied', 'applied']);
  assert.equal(rawWarningResults.every((result) => result.forgeSettlement?.warning?.stage === 'unknown'), true);
  assert.equal(rawWarningResults.every((result) => result.forgeSettlement?.warning?.code === 'DIRECTIVE_FORGE_SETTLEMENT_WARNING'), true);
  assert.equal(JSON.stringify(rawWarningResults).includes(rawWarningCanary), false);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(JSON.stringify(rawWarningCoreDiagnostics).includes(rawWarningCanary), false);
  assert.equal(rawWarningState.runtimeTracking.sidecarJournal.length, 0);
}

{
  let rawReasonState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-raw-reason-test', status: 'active' },
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
  rawReasonState = recordTurnIngress(rawReasonState, {
    id: 'ingress-raw-reason',
    hostMessageId: 'player-raw-reason',
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-raw-reason-test',
    textHash: 'raw-reason-source-hash',
    textPreview: 'Source message for raw rejection reason redaction.',
    status: 'committed',
    outcomeId: 'outcome-raw-reason',
    sourceFrameId: 'frame-raw-reason',
    sourceFrame: {
      kind: 'directive.turnSourceFrame.v1',
      schemaVersion: 1,
      id: 'frame-raw-reason',
      campaignId: 'campaign-sidecar-raw-reason-test',
      saveId: 'save-sidecar-raw-reason-test',
      chatId: 'campaign-chat',
      hostMessageId: 'player-raw-reason',
      textHash: 'raw-reason-source-hash'
    },
    coreTransactionId: 'txn-raw-reason'
  });
  const rawReasonGateway = createStateDeltaGateway({
    getState: () => rawReasonState,
    setState: (next) => { rawReasonState = cloneJson(next); },
    persist: async (next) => { rawReasonState = cloneJson(next); },
    now
  });
  const rawReasonCanary = 'RAW_REASON_CANARY_MUST_NOT_PERSIST';
  const rawBridgeMetadataCanary = 'RAW_BRIDGE_METADATA_MUST_NOT_PERSIST';
  const rawReasonCoreDiagnostics = [];
  const rawReasonResults = await createCampaignSidecarScheduler({
    generationRouter: {
      async generate() {
        assert.fail('Multiple requested campaign sidecars should use the batch generation path.');
      },
      async batch(requests) {
        return requests.map((request) => ({
          ok: true,
          response: {
            text: JSON.stringify({
              id: `raw-reason-${request.roleId}`,
              operations: [{
                op: 'append',
                path: request.roleId === 'crewDirector' ? 'crew.casualties' : 'relationships.seniorCrew',
                value: { id: `raw-reason-${request.roleId}`, summary: 'This must reject with redacted reason evidence.' }
              }],
              summary: 'Raw rejection reason proposal.'
            })
          }
        }));
      }
    },
    stateDeltaGateway: rawReasonGateway,
    getCampaignState: () => rawReasonState,
    setCampaignState: (next) => { rawReasonState = cloneJson(next); },
    persistCampaignState: async (next) => { rawReasonState = cloneJson(next); },
    appendCoreDiagnostic: async (event) => {
      rawReasonCoreDiagnostics.push(cloneJson(event));
      return { ok: true };
    },
    forgeCoordinator: {
      async prepareAcceptedBatch() {
        return { status: 'prepared' };
      },
      async settleAcceptedBatch() {
        return {
          status: `rejected-${rawBridgeMetadataCanary}`,
          transactionId: 'txn-raw-reason',
          providerOwner: `provider-${rawBridgeMetadataCanary}`,
          diagnostic: { id: `diagnostic-${rawBridgeMetadataCanary}` },
          reason: `provider returned unsafe reason ${rawReasonCanary}`
        };
      }
    },
    now
  }).schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-raw-reason',
      turnId: 'turn-raw-reason',
      outcomeId: 'outcome-raw-reason'
    }
  });
  assert.deepEqual(rawReasonResults.map((result) => result.status), ['rejected', 'rejected']);
  assert.equal(rawReasonResults.every((result) => result.error.details?.reason === 'unsafe-reason-redacted'), true);
  const rawReasonJournal = rawReasonState.runtimeTracking.sidecarJournal.slice(-2);
  assert.deepEqual(rawReasonJournal.map((entry) => entry.status), []);
  assert.equal(JSON.stringify(rawReasonResults).includes(rawReasonCanary), false);
  assert.equal(JSON.stringify(rawReasonResults).includes(rawBridgeMetadataCanary), false);
  assert.equal(JSON.stringify(rawReasonJournal).includes(rawReasonCanary), false);
  assert.equal(JSON.stringify(rawReasonJournal).includes(rawBridgeMetadataCanary), false);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(JSON.stringify(rawReasonCoreDiagnostics).includes(rawReasonCanary), false);
  assert.equal(JSON.stringify(rawReasonCoreDiagnostics).includes(rawBridgeMetadataCanary), false);
  assert.equal(rawReasonCoreDiagnostics.filter((entry) => entry.status === 'rejected').length, 2);
  assert.equal(rawReasonCoreDiagnostics.filter((entry) => entry.status === 'rejected').every((entry) => entry.bridgeReason === 'unsafe-reason-redacted'), true);
}

{
  let rawCodeState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-raw-code-test', status: 'active' },
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
  rawCodeState = recordTurnIngress(rawCodeState, {
    id: 'ingress-raw-code',
    hostMessageId: 'player-raw-code',
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-raw-code-test',
    textHash: 'raw-code-source-hash',
    textPreview: 'Source message for raw bridge code redaction.',
    status: 'committed',
    outcomeId: 'outcome-raw-code',
    sourceFrameId: 'frame-raw-code',
    sourceFrame: { id: 'frame-raw-code', campaignId: 'campaign-sidecar-raw-code-test', saveId: 'save-sidecar-raw-code-test', chatId: 'campaign-chat', hostMessageId: 'player-raw-code', textHash: 'raw-code-source-hash' },
    coreTransactionId: 'txn-raw-code'
  });
  const rawCodeGateway = createStateDeltaGateway({
    getState: () => rawCodeState,
    setState: (next) => { rawCodeState = cloneJson(next); },
    persist: async (next) => { rawCodeState = cloneJson(next); },
    now
  });
  const rawCodeCanary = 'RAW_CODE_CANARY_MUST_NOT_PERSIST';
  const rawCodeCoreDiagnostics = [];
  const rawCodeResults = await createCampaignSidecarScheduler({
    generationRouter: {
      async generate() {
        assert.fail('Multiple requested campaign sidecars should use the batch generation path.');
      },
      async batch(requests) {
        return requests.map((request) => ({
          ok: true,
          response: { text: JSON.stringify({ id: `raw-code-${request.roleId}`, operations: [{ op: 'append', path: request.roleId === 'crewDirector' ? 'crew.casualties' : 'relationships.seniorCrew', value: { id: `raw-code-${request.roleId}`, summary: 'This must reject with redacted code.' } }], summary: 'Raw code proposal.' }) }
        }));
      }
    },
    stateDeltaGateway: rawCodeGateway,
    getCampaignState: () => rawCodeState,
    setCampaignState: (next) => { rawCodeState = cloneJson(next); },
    persistCampaignState: async (next) => { rawCodeState = cloneJson(next); },
    appendCoreDiagnostic: async (event) => {
      rawCodeCoreDiagnostics.push(cloneJson(event));
      return { ok: true };
    },
    forgeCoordinator: {
      async prepareAcceptedBatch() {
        return { status: 'prepared' };
      },
      async settleAcceptedBatch() {
        const error = new Error(`Bridge failed with raw code ${rawCodeCanary}`);
        error.code = `DIRECTIVE_RAW_${rawCodeCanary}`;
        throw error;
      }
    },
    now
  }).schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: { ingressId: 'ingress-raw-code', turnId: 'turn-raw-code', outcomeId: 'outcome-raw-code' }
  });
  assert.deepEqual(rawCodeResults.map((result) => result.status), ['rejected', 'rejected']);
  const rawCodeJournal = rawCodeState.runtimeTracking.sidecarJournal.slice(-2);
  assert.equal(JSON.stringify(rawCodeResults).includes(rawCodeCanary), false);
  assert.equal(JSON.stringify(rawCodeJournal).includes(rawCodeCanary), false);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(rawCodeCoreDiagnostics.filter((entry) => entry.status === 'rejected').length, 2);
  assert.equal(JSON.stringify(rawCodeCoreDiagnostics).includes(rawCodeCanary), false);
}

{
  let preflightState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-forge-preflight-test', status: 'active' },
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
  preflightState = recordTurnIngress(preflightState, {
    id: 'ingress-forge-preflight-fails',
    hostMessageId: 'player-forge-preflight-fails',
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-forge-preflight-test',
    textHash: 'forge-preflight-source-hash',
    textPreview: 'Source message for failing Forge preflight.',
    status: 'committed',
    outcomeId: 'outcome-forge-preflight-fails',
    sourceFrameId: 'frame-forge-preflight-fails',
    sourceFrame: {
      kind: 'directive.turnSourceFrame.v1',
      schemaVersion: 1,
      id: 'frame-forge-preflight-fails',
      campaignId: 'campaign-sidecar-forge-preflight-test',
      saveId: 'save-sidecar-forge-preflight-test',
      chatId: 'campaign-chat',
      hostMessageId: 'player-forge-preflight-fails',
      textHash: 'forge-preflight-source-hash',
      rawPlayerText: 'RAW_PREFLIGHT_FRAME_TEXT_MUST_NOT_PERSIST'
    },
    coreTransactionId: 'txn-forge-preflight-fails'
  });
  const preflightGateway = createStateDeltaGateway({
    getState: () => preflightState,
    setState: (next) => { preflightState = cloneJson(next); },
    persist: async (next) => { preflightState = cloneJson(next); },
    now
  });
  const preflightApplyCalls = [];
  const originalPreflightApplyOperations = preflightGateway.applyOperations;
  preflightGateway.applyOperations = async (proposal, policy) => {
    preflightApplyCalls.push({ proposal: cloneJson(proposal), policy: cloneJson(policy || {}) });
    return originalPreflightApplyOperations(proposal, policy);
  };
  const preflightPromptSyncs = [];
  const preflightCoreBackgroundBatches = [];
  const preflightRawExceptionCanary = 'RAW_REJECTED_BRIDGE_EXCEPTION_MUST_NOT_PERSIST_PREFLIGHT';
  const preflightCoreDiagnostics = [];
  const preflightError = new Error(`Forge preflight rejected the accepted sidecar batch. ${preflightRawExceptionCanary}`);
  preflightError.code = 'DIRECTIVE_FORGE_PREFLIGHT_FAILED';
  const preflightScheduler = createCampaignSidecarScheduler({
    generationRouter: {
      async generate() {
        assert.fail('Multiple requested campaign sidecars should use the batch generation path.');
      },
      async batch(requests) {
        return requests.map((request) => ({
          ok: true,
          response: {
            text: JSON.stringify({
              id: `preflight-${request.roleId}`,
              operations: [{
                op: 'append',
                path: request.roleId === 'crewDirector' ? 'crew.casualties' : 'relationships.seniorCrew',
                value: { id: `preflight-${request.roleId}`, summary: 'This must not apply after Forge preflight failure.' }
              }],
              summary: 'Proposal must be rejected by Forge preflight.'
            })
          }
        }));
      }
    },
    stateDeltaGateway: preflightGateway,
    getCampaignState: () => preflightState,
    setCampaignState: (next) => { preflightState = cloneJson(next); },
    persistCampaignState: async (next) => { preflightState = cloneJson(next); },
    syncPromptContext: async () => {
      preflightPromptSyncs.push(true);
      return null;
    },
    appendCoreDiagnostic: async (event) => {
      preflightCoreDiagnostics.push(cloneJson(event));
      return { ok: true };
    },
    forgeCoordinator: {
      async prepareAcceptedBatch() {
        throw preflightError;
      },
      async settleAcceptedBatch() {
        preflightCoreBackgroundBatches.push(true);
        throw new Error('Final settlement must not run after failed preflight.');
      }
    },
    now
  });
  const preflightResults = await preflightScheduler.schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-forge-preflight-fails',
      turnId: 'turn-forge-preflight-fails',
      outcomeId: 'outcome-forge-preflight-fails'
    }
  });
  await preflightScheduler.pending();
  assert.deepEqual(preflightResults.map((result) => result.status), ['rejected', 'rejected']);
  assert.equal(preflightResults.every((result) => result.error.code === 'DIRECTIVE_FORGE_PREFLIGHT_FAILED'), true);
  assert.equal(preflightApplyCalls.length, 0);
  assert.equal(preflightPromptSyncs.length, 0);
  assert.equal(preflightCoreBackgroundBatches.length, 0);
  assert.equal(preflightState.relationships.seniorCrew.length, 0);
  assert.equal(preflightState.crew.casualties.length, 0);
  assert.equal(preflightState.runtimeTracking.revision, 0);
  const preflightJournal = preflightState.runtimeTracking.sidecarJournal.slice(-2);
  assert.deepEqual(preflightJournal.map((entry) => entry.status), []);
  const preflightRejectedDiagnostics = preflightCoreDiagnostics.filter((entry) => entry.ingressId === 'ingress-forge-preflight-fails' && entry.status === 'rejected');
  assert.deepEqual(preflightRejectedDiagnostics.map((entry) => entry.errorCode), ['DIRECTIVE_FORGE_PREFLIGHT_FAILED', 'DIRECTIVE_FORGE_PREFLIGHT_FAILED']);
  assert.equal(JSON.stringify(preflightResults).includes(preflightRawExceptionCanary), false);
  assert.equal(JSON.stringify(preflightJournal).includes(preflightRawExceptionCanary), false);
  assert.equal(JSON.stringify(preflightCoreDiagnostics).includes(preflightRawExceptionCanary), false);
  assert.equal(JSON.stringify(preflightJournal).includes('RAW_PREFLIGHT_FRAME_TEXT_MUST_NOT_PERSIST'), false);
}

{
  let finalSettlementState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-forge-final-test', status: 'active' },
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
  finalSettlementState = recordTurnIngress(finalSettlementState, {
    id: 'ingress-forge-final-fails',
    hostMessageId: 'player-forge-final-fails',
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-forge-final-test',
    textHash: 'forge-final-source-hash',
    textPreview: 'Source message for failing final Forge settlement.',
    status: 'committed',
    outcomeId: 'outcome-forge-final-fails',
    sourceFrameId: 'frame-forge-final-fails',
    sourceFrame: {
      kind: 'directive.turnSourceFrame.v1',
      schemaVersion: 1,
      id: 'frame-forge-final-fails',
      campaignId: 'campaign-sidecar-forge-final-test',
      saveId: 'save-sidecar-forge-final-test',
      chatId: 'campaign-chat',
      hostMessageId: 'player-forge-final-fails',
      textHash: 'forge-final-source-hash',
      rawPlayerText: 'RAW_FINAL_FRAME_TEXT_MUST_NOT_PERSIST'
    },
    coreTransactionId: 'txn-forge-final-fails'
  });
  const finalSettlementGateway = createStateDeltaGateway({
    getState: () => finalSettlementState,
    setState: (next) => { finalSettlementState = cloneJson(next); },
    persist: async (next) => { finalSettlementState = cloneJson(next); },
    now
  });
  const finalApplyCalls = [];
  const finalValidateCalls = [];
  const originalFinalApplyOperations = finalSettlementGateway.applyOperations;
  const originalFinalValidateOperations = finalSettlementGateway.validateOperations;
  finalSettlementGateway.applyOperations = async (proposal, policy) => {
    finalApplyCalls.push({ proposal: cloneJson(proposal), policy: cloneJson(policy || {}) });
    return originalFinalApplyOperations(proposal, policy);
  };
  finalSettlementGateway.validateOperations = async (proposal, policy) => {
    finalValidateCalls.push({ proposal: cloneJson(proposal), policy: cloneJson(policy || {}) });
    const projected = await originalFinalValidateOperations(proposal, policy);
    assert.equal(projected.campaignState.relationships.seniorCrew.length, 1);
    assert.equal(projected.campaignState.crew.casualties.length, 1);
    assert.equal(finalSettlementState.relationships.seniorCrew.length, 0);
    assert.equal(finalSettlementState.crew.casualties.length, 0);
    return projected;
  };
  const finalPromptSyncs = [];
  const finalCoreCommits = [];
  const finalSettlementRawExceptionCanary = 'RAW_REJECTED_BRIDGE_EXCEPTION_MUST_NOT_PERSIST_FINAL';
  const finalSettlementCoreDiagnostics = [];
  const finalSettlementError = new Error(`Forge final settlement failed after compatibility validation. ${finalSettlementRawExceptionCanary}`);
  finalSettlementError.code = 'DIRECTIVE_FORGE_FINAL_SETTLEMENT_FAILED';
  const finalSettlementScheduler = createCampaignSidecarScheduler({
    generationRouter: {
      async generate() {
        assert.fail('Multiple requested campaign sidecars should use the batch generation path.');
      },
      async batch(requests) {
        return requests.map((request) => ({
          ok: true,
          response: {
            text: JSON.stringify({
              id: `final-${request.roleId}`,
              operations: [{
                op: 'append',
                path: request.roleId === 'crewDirector' ? 'crew.casualties' : 'relationships.seniorCrew',
                value: { id: `final-${request.roleId}`, summary: 'This must be compensated if Forge final settlement fails.' }
              }],
              summary: 'Proposal must be compensated by final settlement failure.'
            })
          }
        }));
      }
    },
    stateDeltaGateway: finalSettlementGateway,
    getCampaignState: () => finalSettlementState,
    setCampaignState: (next) => { finalSettlementState = cloneJson(next); },
    persistCampaignState: async (next) => { finalSettlementState = cloneJson(next); },
    syncPromptContext: async () => {
      finalPromptSyncs.push(true);
      return null;
    },
    appendCoreDiagnostic: async (event) => {
      finalSettlementCoreDiagnostics.push(cloneJson(event));
      return { ok: true };
    },
    forgeCoordinator: {
      async prepareAcceptedBatch() {
        return { status: 'prepared', durable: false };
      },
      async settleAcceptedBatch() {
        finalCoreCommits.push(true);
        throw finalSettlementError;
      }
    },
    now
  });
  const finalSettlementResults = await finalSettlementScheduler.schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-forge-final-fails',
      turnId: 'turn-forge-final-fails',
      outcomeId: 'outcome-forge-final-fails'
    }
  });
  await finalSettlementScheduler.pending();
  assert.deepEqual(finalSettlementResults.map((result) => result.status), ['rejected', 'rejected']);
  assert.equal(finalSettlementResults.every((result) => result.error.code === 'DIRECTIVE_FORGE_FINAL_SETTLEMENT_FAILED'), true);
  assert.equal(finalApplyCalls.length, 0);
  assert.equal(finalValidateCalls.length, 1);
  assert.equal(finalCoreCommits.length, 1);
  assert.equal(finalPromptSyncs.length, 0);
  assert.equal(finalSettlementState.relationships.seniorCrew.length, 0);
  assert.equal(finalSettlementState.crew.casualties.length, 0);
  assert.equal(finalSettlementState.runtimeTracking.revision, 0);
  const finalSettlementJournal = finalSettlementState.runtimeTracking.sidecarJournal.slice(-2);
  assert.deepEqual(finalSettlementJournal.map((entry) => entry.status), []);
  const finalSettlementRejectedDiagnostics = finalSettlementCoreDiagnostics.filter((entry) => entry.ingressId === 'ingress-forge-final-fails' && entry.status === 'rejected');
  assert.deepEqual(finalSettlementRejectedDiagnostics.map((entry) => entry.errorCode), ['DIRECTIVE_FORGE_FINAL_SETTLEMENT_FAILED', 'DIRECTIVE_FORGE_FINAL_SETTLEMENT_FAILED']);
  assert.equal(JSON.stringify(finalSettlementResults).includes(finalSettlementRawExceptionCanary), false);
  assert.equal(JSON.stringify(finalSettlementJournal).includes(finalSettlementRawExceptionCanary), false);
  assert.equal(JSON.stringify(finalSettlementCoreDiagnostics).includes(finalSettlementRawExceptionCanary), false);
  assert.equal(JSON.stringify(finalSettlementJournal).includes('RAW_FINAL_FRAME_TEXT_MUST_NOT_PERSIST'), false);
}

{
  let oldApplyFailureState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-old-apply-failure-test', status: 'active' },
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
  oldApplyFailureState = recordTurnIngress(oldApplyFailureState, {
    id: 'ingress-old-apply-fails',
    hostMessageId: 'player-old-apply-fails',
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-old-apply-failure-test',
    textHash: 'old-apply-failure-source-hash',
    textPreview: 'Source message for old apply failure.',
    status: 'committed',
    outcomeId: 'outcome-old-apply-fails',
    sourceFrameId: 'frame-old-apply-fails',
    sourceFrame: {
      kind: 'directive.turnSourceFrame.v1',
      schemaVersion: 1,
      id: 'frame-old-apply-fails',
      campaignId: 'campaign-sidecar-old-apply-failure-test',
      saveId: 'save-sidecar-old-apply-failure-test',
      chatId: 'campaign-chat',
      hostMessageId: 'player-old-apply-fails',
      textHash: 'old-apply-failure-source-hash',
      rawPlayerText: 'RAW_OLD_APPLY_FAILURE_FRAME_TEXT_MUST_NOT_PERSIST'
    },
      coreTransactionId: 'txn-old-apply-fails'
  });
  const oldApplyGatewayPersists = [];
  const oldApplyFailureGateway = createStateDeltaGateway({
    getState: () => oldApplyFailureState,
    setState: (next) => { oldApplyFailureState = cloneJson(next); },
    persist: async (next, proposal) => {
      oldApplyGatewayPersists.push({ revision: next.runtimeTracking?.revision || 0, proposal: cloneJson(proposal) });
      oldApplyFailureState = cloneJson(next);
    },
    now
  });
  const oldApplyRawExceptionCanary = 'RAW_REJECTED_BRIDGE_EXCEPTION_MUST_NOT_PERSIST_OLD_APPLY';
  const oldApplyFailure = new Error(`Compatibility projection validation failed before final Forge settlement. ${oldApplyRawExceptionCanary}`);
  oldApplyFailure.code = 'DIRECTIVE_COMPATIBILITY_VALIDATION_FAILED';
  const originalOldApplyFailureValidateOperations = oldApplyFailureGateway.validateOperations;
  const oldApplyValidatedSnapshots = [];
  oldApplyFailureGateway.applyOperations = async (proposal, policy) => {
    assert.fail('Compatibility validation failure test must not call old applyOperations.');
  };
  oldApplyFailureGateway.validateOperations = async (proposal, policy) => {
    const projected = await originalOldApplyFailureValidateOperations(proposal, policy);
    oldApplyValidatedSnapshots.push(cloneJson(projected.campaignState));
    assert.equal(projected.campaignState.relationships.seniorCrew.length, 1);
    assert.equal(projected.campaignState.crew.casualties.length, 1);
    assert.equal(oldApplyFailureState.relationships.seniorCrew.length, 0);
    assert.equal(oldApplyFailureState.crew.casualties.length, 0);
    throw oldApplyFailure;
  };
  const oldApplyFinalSettlements = [];
  const oldApplyPromptSyncs = [];
  const oldApplyCoreDiagnostics = [];
  const oldApplyFailureScheduler = createCampaignSidecarScheduler({
    generationRouter: {
      async generate() {
        assert.fail('Multiple requested campaign sidecars should use the batch generation path.');
      },
      async batch(requests) {
        return requests.map((request) => ({
          ok: true,
          response: {
            text: JSON.stringify({
              id: `old-apply-${request.roleId}`,
              operations: [{
                op: 'append',
                path: request.roleId === 'crewDirector' ? 'crew.casualties' : 'relationships.seniorCrew',
                value: { id: `old-apply-${request.roleId}`, summary: 'This must not reach Forge final settlement.' }
              }],
              summary: 'Proposal must stop before final settlement.'
            })
          }
        }));
      }
    },
    stateDeltaGateway: oldApplyFailureGateway,
    getCampaignState: () => oldApplyFailureState,
    setCampaignState: (next) => { oldApplyFailureState = cloneJson(next); },
    persistCampaignState: async (next) => { oldApplyFailureState = cloneJson(next); },
    syncPromptContext: async () => {
      oldApplyPromptSyncs.push(true);
      return null;
    },
    appendCoreDiagnostic: async (event) => {
      oldApplyCoreDiagnostics.push(cloneJson(event));
      return { ok: true };
    },
    forgeCoordinator: {
      async prepareAcceptedBatch() {
        return { status: 'prepared', durable: false };
      },
      async settleAcceptedBatch() {
        oldApplyFinalSettlements.push(true);
        return { status: 'settled' };
      }
    },
    now
  });
  const oldApplyFailureResults = await oldApplyFailureScheduler.schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-old-apply-fails',
      turnId: 'turn-old-apply-fails',
      outcomeId: 'outcome-old-apply-fails'
    }
  });
  await oldApplyFailureScheduler.pending();
  assert.deepEqual(oldApplyFailureResults.map((result) => result.status), ['rejected', 'rejected']);
  assert.equal(oldApplyFailureResults.every((result) => result.error.code === 'DIRECTIVE_COMPATIBILITY_VALIDATION_FAILED'), true);
  assert.equal(oldApplyValidatedSnapshots.length, 1);
  assert.equal(oldApplyGatewayPersists.length, 0);
  assert.equal(oldApplyFinalSettlements.length, 0);
  assert.equal(oldApplyPromptSyncs.length, 0);
  assert.equal(oldApplyFailureState.relationships.seniorCrew.length, 0);
  assert.equal(oldApplyFailureState.crew.casualties.length, 0);
  assert.equal(oldApplyFailureState.runtimeTracking.revision, 0);
  const oldApplyFailureJournal = oldApplyFailureState.runtimeTracking.sidecarJournal.slice(-2);
  assert.deepEqual(oldApplyFailureJournal.map((entry) => entry.status), []);
  const oldApplyRejectedDiagnostics = oldApplyCoreDiagnostics.filter((entry) => entry.ingressId === 'ingress-old-apply-fails' && entry.status === 'rejected');
  assert.deepEqual(oldApplyRejectedDiagnostics.map((entry) => entry.errorCode), ['DIRECTIVE_COMPATIBILITY_VALIDATION_FAILED', 'DIRECTIVE_COMPATIBILITY_VALIDATION_FAILED']);
  assert.equal(JSON.stringify(oldApplyFailureResults).includes(oldApplyRawExceptionCanary), false);
  assert.equal(JSON.stringify(oldApplyFailureJournal).includes(oldApplyRawExceptionCanary), false);
  assert.equal(JSON.stringify(oldApplyCoreDiagnostics).includes(oldApplyRawExceptionCanary), false);
  assert.equal(JSON.stringify(oldApplyFailureJournal).includes('RAW_OLD_APPLY_FAILURE_FRAME_TEXT_MUST_NOT_PERSIST'), false);
}

{
  let postCorePersistState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-post-core-persist-failure-test', status: 'active' },
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
  postCorePersistState = recordTurnIngress(postCorePersistState, {
    id: 'ingress-post-core-persist-fails',
    hostMessageId: 'player-post-core-persist-fails',
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-post-core-persist-failure-test',
    textHash: 'post-core-persist-failure-source-hash',
    textPreview: 'Source message for post-CORE prompt projection.',
    status: 'committed',
    outcomeId: 'outcome-post-core-persist-fails',
    sourceFrameId: 'frame-post-core-persist-fails',
    sourceFrame: {
      kind: 'directive.turnSourceFrame.v1',
      schemaVersion: 1,
      id: 'frame-post-core-persist-fails',
      campaignId: 'campaign-sidecar-post-core-persist-failure-test',
      saveId: 'save-sidecar-post-core-persist-failure-test',
      chatId: 'campaign-chat',
      hostMessageId: 'player-post-core-persist-fails',
      textHash: 'post-core-persist-failure-source-hash'
    },
    coreTransactionId: 'txn-post-core-persist-fails'
  });
  const postCorePersistGateway = createStateDeltaGateway({
    getState: () => postCorePersistState,
    setState: (next) => { postCorePersistState = cloneJson(next); },
    persist: async () => {
      assert.fail('Accepted sidecar old projection must not persist through StateDeltaGateway before CORE settlement.');
    },
    now
  });
  const postCorePersistReasons = [];
  const postCorePromptSyncs = [];
  const postCoreForgePromptFlushes = [];
  const postCoreCommits = [];
  const postCorePersistCanary = 'RAW_POST_CORE_PERSIST_FAILURE_MUST_NOT_PERSIST';
  const postCorePersistResults = await createCampaignSidecarScheduler({
    generationRouter: {
      async generate() {
        assert.fail('Multiple requested campaign sidecars should use the batch generation path.');
      },
      async batch(requests) {
        return requests.map((request) => ({
          ok: true,
          response: {
            text: JSON.stringify({
              id: `post-core-persist-${request.roleId}`,
              operations: [{
                op: 'append',
                path: request.roleId === 'crewDirector' ? 'crew.casualties' : 'relationships.seniorCrew',
                value: { id: `post-core-persist-${request.roleId}`, summary: 'This CORE-settled result has a prompt warning.' }
              }],
              summary: 'Post-CORE prompt warning proposal.'
            })
          }
        }));
      }
    },
    stateDeltaGateway: postCorePersistGateway,
    getCampaignState: () => postCorePersistState,
    setCampaignState: (next) => { postCorePersistState = cloneJson(next); },
    persistCampaignState: async (next, reason) => {
      postCorePersistReasons.push(reason || null);
      postCorePersistState = cloneJson(next);
    },
    syncPromptContext: async () => {
      postCorePromptSyncs.push(true);
      return null;
    },
    commitCoreBackgroundBatch: async (transactionId, bundle) => {
      postCoreCommits.push({ transactionId, bundle: cloneJson(bundle) });
      return forgeBackgroundTransaction(transactionId, bundle);
    },
    forgeCoordinator: createTestAcceptedForgeCoordinator({
      commits: postCoreCommits,
      acceptedBatchPromptFlusher: async (input = {}) => {
        postCoreForgePromptFlushes.push({
          transactionId: input.transactionId || null,
          promptDirtyDomains: cloneJson(input.promptDirtyDomains || []),
          coreAcceptedBatchProjection: cloneJson(input.coreAcceptedBatchProjection || null),
          campaignRevision: input.campaignState?.runtimeTracking?.revision || 0
        });
        const synchronized = cloneJson(input.campaignState);
        synchronized.campaignChatBinding = {
          ...(synchronized.campaignChatBinding || {}),
          chatId: synchronized.campaignChatBinding?.chatId || 'campaign-chat',
          promptContextRevision: (synchronized.campaignChatBinding?.promptContextRevision || 0) + 1,
          promptContextOwner: 'forge-lens-post-core-persist-warning-test'
        };
        synchronized.runtimeResume = {
          ...(synchronized.runtimeResume || {}),
          promptContextRevision: 9,
          externalPromptEnvironmentRef: {
            kind: 'directive.externalPromptEnvironmentRef.v1',
            schemaVersion: 1,
            hash: 'e'.repeat(64),
            byteLength: 256,
            status: 'observed'
          }
        };
        synchronized.runtimeTracking = {
          ...(synchronized.runtimeTracking || {}),
          promptContext: {
            status: 'active',
            revision: 9,
            hash: 'post-core-prompt-context-hash',
            blockCount: 3,
            continuityProjection: {
              sourceHash: 'post-core-continuity-source-hash'
            }
          }
        };
        return {
          ok: true,
          status: 'rebuilt',
          campaignState: synchronized,
          lens: { status: 'rebuilt', rebuilt: true, lane: 'background' }
        };
      }
    }),
    now
  }).schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-post-core-persist-fails',
      turnId: 'turn-post-core-persist-fails',
      outcomeId: 'outcome-post-core-persist-fails'
    }
  });
  assert.deepEqual(postCorePersistResults.map((result) => result.status), ['applied', 'applied']);
  assert.equal(postCoreCommits.length, 1);
  assert.deepEqual(postCorePersistReasons, ['Campaign sidecar batch prompt context synchronized.']);
  assert.equal(postCorePromptSyncs.length, 0, 'Accepted FORGE/LENS sidecar batches must not fall back to scheduler-owned syncPromptContext after CORE settlement.');
  assert.equal(postCoreForgePromptFlushes.length, 1, 'Accepted CORE-settled sidecar prompt sync must stay on the FORGE/LENS flusher without old v1 projection writes.');
  assert.equal(postCoreForgePromptFlushes[0].transactionId, 'txn-post-core-persist-fails');
  assert.deepEqual(postCoreForgePromptFlushes[0].promptDirtyDomains, ['crewShipRelationship']);
  assert.equal(postCoreForgePromptFlushes[0].campaignRevision, 0);
  assert.equal(postCoreForgePromptFlushes[0].coreAcceptedBatchProjection.kind, 'directive.coreAcceptedSidecarBatchProjection.v1');
  assert.equal(postCoreForgePromptFlushes[0].coreAcceptedBatchProjection.transactionId, 'txn-post-core-persist-fails');
  assert.equal(postCorePersistResults.every((result) => result.postSettlementWarnings.length === 0), true);
  assert.equal(postCorePersistState.campaignChatBinding.promptContextRevision, 1);
  assert.equal(postCorePersistState.campaignChatBinding.promptContextOwner, 'forge-lens-post-core-persist-warning-test');
  assert.equal(postCorePersistState.runtimeResume.promptContextRevision, 9);
  assert.equal(postCorePersistState.runtimeResume.externalPromptEnvironmentRef.hash, 'e'.repeat(64));
  assert.equal(postCorePersistState.runtimeTracking?.promptContext, undefined);
  assert.equal(postCorePersistState.relationships.seniorCrew.length, 0);
  assert.equal(postCorePersistState.crew.casualties.length, 0);
  assert.equal(postCorePersistState.runtimeTracking.sidecarJournal.length, 0);
  assert.equal(JSON.stringify(postCorePersistResults).includes(postCorePersistCanary), false);
}

{
  let postCoreCommandBearingState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-post-core-command-bearing-skip-test', status: 'active' },
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
      arcs: [{ id: 'arc.post-core.command-bearing', status: 'active', completedMilestoneIds: ['milestone.post-core.command-bearing'] }],
      milestones: [{
        id: 'milestone.post-core.command-bearing',
        arcId: 'arc.post-core.command-bearing',
        status: 'complete',
        sourceEventIds: ['outcome.post-core.command-bearing']
      }]
    },
    eventLedger: { events: [] },
    threadLedger: { records: [] },
    dynamicQuestCatalog: { templates: [] },
    knowledgeLedger: { facts: [] },
    commandLog: { entries: [] },
    continuity: { notes: [] }
  });
  postCoreCommandBearingState = recordTurnIngress(postCoreCommandBearingState, {
    id: 'ingress-post-core-command-bearing',
    hostMessageId: 'player-post-core-command-bearing',
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-post-core-command-bearing-skip-test',
    textHash: 'post-core-command-bearing-source-hash',
    textPreview: 'Source message for Command Bearing review without old compatibility persist.',
    status: 'committed',
    outcomeId: 'outcome.post-core.command-bearing',
    sourceFrameId: 'frame-post-core-command-bearing',
    coreTransactionId: 'txn-post-core-command-bearing'
  });
  const postCoreCommandBearingGateway = createStateDeltaGateway({
    getState: () => postCoreCommandBearingState,
    setState: (next) => { postCoreCommandBearingState = cloneJson(next); },
    persist: async () => {
      assert.fail('Command Bearing aggregate apply must not persist through StateDeltaGateway before CORE settlement.');
    },
    now
  });
  const postCoreCommandBearingCalls = [];
  const postCoreCommandBearingCommits = [];
  const postCoreCommandBearingPromptSyncs = [];
  const postCoreCommandBearingResults = await createCampaignSidecarScheduler({
    generationRouter: {
      async generate(roleId) {
        postCoreCommandBearingCalls.push(roleId);
        if (postCoreCommandBearingCalls.length === 1) {
          return {
            ok: true,
            response: {
              text: JSON.stringify({
                id: 'command-bearing-post-core-skip-evidence',
                operations: [{
                  op: 'append',
                  path: 'commandBearing.evidenceLedger.records',
                  value: {
                    id: 'bearing-evidence.post-core.skip',
                    sourceOutcomeId: 'outcome.post-core.command-bearing',
                    sourceTurnId: 'turn.post-core.command-bearing',
                    primarySignal: 'resolve',
                    trackSignals: ['resolve'],
                    strength: 'strong',
                    criteria: { agency: true, commitment: true, causality: true },
                    actionSummary: 'Held a boundary before accepted-batch prompt sync completed.',
                    consequenceSummary: 'The same outcome completed the milestone.',
                    playerFacingSummary: 'This may support Resolve.',
                    visible: true,
                    status: 'open'
                  }
                }],
                summary: 'Record Resolve evidence while accepted-batch prompt sync completes.'
              })
            }
          };
        }
        return {
          ok: true,
          response: {
            text: JSON.stringify({
              closureId: 'closure.milestone.post-core.command-bearing',
              markAwarded: true,
              awardedTrack: 'resolve',
              criteriaSatisfied: { agency: true, commitment: true, causality: true },
              evidenceIds: ['bearing-evidence.post-core.skip'],
              awardSummary: 'Resolve evidence closed through CORE settlement.'
            })
          }
        };
      }
    },
    stateDeltaGateway: postCoreCommandBearingGateway,
    getCampaignState: () => postCoreCommandBearingState,
    setCampaignState: (next) => { postCoreCommandBearingState = cloneJson(next); },
    persistCampaignState: async (next, reason) => {
      postCoreCommandBearingState = cloneJson(next);
    },
    syncPromptContext: async () => {
      postCoreCommandBearingPromptSyncs.push(true);
      return null;
    },
    commitCoreBackgroundBatch: async (transactionId, bundle) => {
      postCoreCommandBearingCommits.push({ transactionId, bundle: cloneJson(bundle) });
      return forgeBackgroundTransaction(transactionId, bundle);
    },
    forgeCoordinator: createTestAcceptedForgeCoordinator({
      commits: postCoreCommandBearingCommits
    }),
    now
  }).schedule({
    workerPlan: { commandBearing: true },
    turnContext: {
      ingressId: 'ingress-post-core-command-bearing',
      turnId: 'turn.post-core.command-bearing',
      outcomeId: 'outcome.post-core.command-bearing'
    }
  });
  assert.deepEqual(postCoreCommandBearingResults.map((result) => result.status), ['applied']);
  assert.deepEqual(postCoreCommandBearingCalls, ['commandBearingEvaluator', 'commandBearingEvaluator']);
  assert.equal(postCoreCommandBearingCommits.length, 1);
  assert.equal(postCoreCommandBearingPromptSyncs.length, 0);
  assert.equal(postCoreCommandBearingState.commandBearing.evidenceLedger?.records?.length || 0, 0);
  assert.equal(postCoreCommandBearingState.commandBearing.reviewLedger?.records?.length || 0, 0);
  assert.equal(
    postCoreCommandBearingResults[0].postSettlementWarnings.some((warning) => warning.stage === 'oldProjectionPersist'),
    false
  );
}

{
  let noCoreState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-no-core-test', status: 'active' },
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
  noCoreState = initializeCampaignRuntimeTracking({
    ...cloneJson(noCoreState),
    runtimeTracking: {
      ...cloneJson(noCoreState.runtimeTracking || {}),
      ingressLedger: [{
        id: 'no-core-ingress-1',
        hostMessageId: 'player-no-core-1',
        chatId: 'campaign-chat',
        campaignId: 'campaign-sidecar-no-core-test',
        textHash: 'no-core-source-hash-1',
        textPreview: 'Source message without CORE transaction one.',
        status: 'committed',
        outcomeId: 'no-core-outcome-1',
        sourceFrameId: 'frame-no-core-1',
        sourceFrame: {
          kind: 'directive.turnSourceFrame.v1',
          schemaVersion: 1,
          id: 'frame-no-core-1',
          campaignId: 'campaign-sidecar-no-core-test',
          saveId: 'save-sidecar-no-core-test',
          chatId: 'campaign-chat',
          hostMessageId: 'player-no-core-1',
          textHash: 'no-core-source-hash-1'
        }
      }, {
        id: 'no-core-ingress-2',
        hostMessageId: 'player-no-core-2',
        chatId: 'campaign-chat',
        campaignId: 'campaign-sidecar-no-core-test',
        textHash: 'no-core-source-hash-2',
        textPreview: 'Source message without CORE transaction two.',
        status: 'committed',
        outcomeId: 'no-core-outcome-2',
        sourceFrameId: 'frame-no-core-2',
        sourceFrame: {
          kind: 'directive.turnSourceFrame.v1',
          schemaVersion: 1,
          id: 'frame-no-core-2',
          campaignId: 'campaign-sidecar-no-core-test',
          saveId: 'save-sidecar-no-core-test',
          chatId: 'campaign-chat',
          hostMessageId: 'player-no-core-2',
          textHash: 'no-core-source-hash-2'
        }
      }]
    }
  });
  const noCoreGateway = createStateDeltaGateway({
    getState: () => noCoreState,
    setState: (next) => { noCoreState = cloneJson(next); },
    persist: async (next) => { noCoreState = cloneJson(next); },
    now
  });
  const noCoreApplyCalls = [];
  const originalNoCoreApplyOperations = noCoreGateway.applyOperations;
  noCoreGateway.applyOperations = async (proposal, policy) => {
    noCoreApplyCalls.push({ proposal: cloneJson(proposal), policy: cloneJson(policy || {}) });
    return originalNoCoreApplyOperations(proposal, policy);
  };
  const noCoreProviderCalls = [];
  const noCoreSetCampaignStateCalls = [];
  const noCorePersistReasons = [];
  const noCoreScheduler = createCampaignSidecarScheduler({
    generationRouter: {
      async generate(roleId, request) {
        noCoreProviderCalls.push({ roleId, ingressId: request.source?.ingressId || null });
        return {
          ok: true,
          response: {
            text: JSON.stringify({
              id: `no-core-${request.source?.ingressId || noCoreProviderCalls.length}`,
              workerId: 'relationship',
              baseRevision: request.snapshot?.campaignState?.runtimeTracking?.revision || 0,
              operations: [{
                op: 'append',
                path: 'relationships.seniorCrew',
                value: { id: `no-core-${noCoreProviderCalls.length}`, summary: 'No-core relationship observation.' }
              }],
              summary: 'No-core source boundary provider proof.'
            })
          }
        };
      }
    },
    stateDeltaGateway: noCoreGateway,
    getCampaignState: () => noCoreState,
    setCampaignState: (next) => {
      noCoreSetCampaignStateCalls.push(cloneJson(next));
      noCoreState = cloneJson(next);
    },
    persistCampaignState: async (next, reason) => {
      noCorePersistReasons.push(reason || null);
      noCoreState = cloneJson(next);
    },
    forgeCoordinator: createForgeCoordinator({
      coreStore: {
        async appendDiagnostics() {
          return null;
        }
      },
      clock: now
    }),
    now
  });
  const noCoreFirst = await noCoreScheduler.schedule({
    workerPlan: { relationship: true },
    turnContext: { ingressId: 'no-core-ingress-1', outcomeId: 'no-core-outcome-1' }
  });
  const noCoreSecond = await noCoreScheduler.schedule({
    workerPlan: { relationship: true },
    turnContext: { ingressId: 'no-core-ingress-2', outcomeId: 'no-core-outcome-2' }
  });
  assert.deepEqual(noCoreFirst.map((result) => result.status), ['rejected']);
  assert.deepEqual(noCoreSecond.map((result) => result.status), ['rejected']);
  assert.deepEqual(noCoreProviderCalls.map((call) => call.ingressId), ['no-core-ingress-1', 'no-core-ingress-2']);
  assert.equal(noCoreProviderCalls.length, 2);
  assert.equal(noCoreApplyCalls.length, 0, 'No-settlement accepted sidecars must reject before old projection assignment.');
  assert.equal(noCoreSetCampaignStateCalls.length, 0, 'No-settlement accepted sidecars must not assign old rejected journal state.');
  assert.equal(noCoreState.relationships.seniorCrew.length, 0);
  assert.equal(noCorePersistReasons.includes('Compensated rejected campaign sidecar batch bridge mutation.'), false);
  assert.deepEqual(noCorePersistReasons, []);
}

{
  let preparedNoFinalState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-prepared-no-final-test', status: 'active' },
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
  preparedNoFinalState = recordTurnIngress(preparedNoFinalState, {
    id: 'ingress-prepared-no-final',
    hostMessageId: 'player-prepared-no-final',
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-prepared-no-final-test',
    textHash: 'prepared-no-final-source-hash',
    textPreview: 'Source message for prepared bridge without final settlement.',
    status: 'committed',
    outcomeId: 'outcome-prepared-no-final',
    sourceFrameId: 'frame-prepared-no-final',
    sourceFrame: {
      id: 'frame-prepared-no-final',
      campaignId: 'campaign-sidecar-prepared-no-final-test',
      saveId: 'save-sidecar-prepared-no-final-test',
      chatId: 'campaign-chat',
      hostMessageId: 'player-prepared-no-final',
      textHash: 'prepared-no-final-source-hash'
    },
    coreTransactionId: 'txn-prepared-no-final'
  });
  const preparedNoFinalGateway = createStateDeltaGateway({
    getState: () => preparedNoFinalState,
    setState: (next) => { preparedNoFinalState = cloneJson(next); },
    persist: async (next) => { preparedNoFinalState = cloneJson(next); },
    now
  });
  const preparedNoFinalApplyCalls = [];
  const preparedNoFinalDirectCoreCalls = [];
  const originalPreparedNoFinalApplyOperations = preparedNoFinalGateway.applyOperations;
  preparedNoFinalGateway.applyOperations = async (proposal, policy) => {
    preparedNoFinalApplyCalls.push({ proposal: cloneJson(proposal), policy: cloneJson(policy || {}) });
    return originalPreparedNoFinalApplyOperations(proposal, policy);
  };
  const preparedNoFinalPromptSyncs = [];
  const preparedNoFinalCoreDiagnostics = [];
  const preparedNoFinalRawCanary = 'RAW_PREPARED_NO_FINAL_MUST_NOT_PERSIST';
  const preparedNoFinalScheduler = createCampaignSidecarScheduler({
    generationRouter: {
      async generate() {
        assert.fail('Multiple requested campaign sidecars should use the batch generation path.');
      },
      async batch(requests) {
        return requests.map((request) => ({
          ok: true,
          response: {
            text: JSON.stringify({
              id: `prepared-no-final-${request.roleId}`,
              operations: [{
                op: 'append',
                path: request.roleId === 'crewDirector' ? 'crew.casualties' : 'relationships.seniorCrew',
                value: { id: `prepared-no-final-${request.roleId}`, summary: 'This must not apply without final settlement.' }
              }],
              summary: 'Prepared bridge without final settlement proposal.'
            })
          }
        }));
      }
    },
    stateDeltaGateway: preparedNoFinalGateway,
    getCampaignState: () => preparedNoFinalState,
    setCampaignState: (next) => { preparedNoFinalState = cloneJson(next); },
    persistCampaignState: async (next) => { preparedNoFinalState = cloneJson(next); },
    syncPromptContext: async () => {
      preparedNoFinalPromptSyncs.push(true);
      return null;
    },
    appendCoreDiagnostic: async (event) => {
      preparedNoFinalCoreDiagnostics.push(cloneJson(event));
      return { ok: true };
    },
    forgeCoordinator: {
      async prepareAcceptedBatch() {
        return {
          status: 'prepared',
          diagnostic: { rawProviderText: preparedNoFinalRawCanary }
        };
      }
    },
    commitCoreBackgroundBatch: async (transactionId, bundle) => {
      preparedNoFinalDirectCoreCalls.push({ transactionId, bundle: cloneJson(bundle) });
      return forgeBackgroundTransaction(transactionId, bundle);
    },
    now
  });
  const preparedNoFinalResults = await preparedNoFinalScheduler.schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-prepared-no-final',
      turnId: 'turn-prepared-no-final',
      outcomeId: 'outcome-prepared-no-final'
    }
  });
  await preparedNoFinalScheduler.pending();
  assert.deepEqual(preparedNoFinalResults.map((result) => result.status), ['rejected', 'rejected']);
  assert.equal(preparedNoFinalResults.every((result) => result.error.code === 'DIRECTIVE_FORGE_FINAL_SETTLEMENT_FAILED'), true);
  assert.equal(preparedNoFinalDirectCoreCalls.length, 0);
  assert.equal(preparedNoFinalApplyCalls.length, 0);
  assert.equal(preparedNoFinalPromptSyncs.length, 0);
  assert.equal(preparedNoFinalState.relationships.seniorCrew.length, 0);
  assert.equal(preparedNoFinalState.crew.casualties.length, 0);
  const preparedNoFinalJournal = preparedNoFinalState.runtimeTracking.sidecarJournal.slice(-2);
  assert.deepEqual(preparedNoFinalJournal.map((entry) => entry.status), []);
  const preparedNoFinalRejectedDiagnostics = preparedNoFinalCoreDiagnostics.filter((entry) => entry.ingressId === 'ingress-prepared-no-final' && entry.status === 'rejected');
  assert.deepEqual(preparedNoFinalRejectedDiagnostics.map((entry) => entry.errorCode), ['DIRECTIVE_FORGE_FINAL_SETTLEMENT_FAILED', 'DIRECTIVE_FORGE_FINAL_SETTLEMENT_FAILED']);
  assert.equal(JSON.stringify(preparedNoFinalResults).includes(preparedNoFinalRawCanary), false);
  assert.equal(JSON.stringify(preparedNoFinalJournal).includes(preparedNoFinalRawCanary), false);
}

{
  let settledPreflightState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-settled-preflight-test', status: 'active' },
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
  settledPreflightState = recordTurnIngress(settledPreflightState, {
    id: 'ingress-settled-preflight',
    hostMessageId: 'player-settled-preflight',
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-settled-preflight-test',
    textHash: 'settled-preflight-source-hash',
    textPreview: 'Source message for unsafe settled preflight.',
    status: 'committed',
    outcomeId: 'outcome-settled-preflight',
    sourceFrameId: 'frame-settled-preflight',
    sourceFrame: {
      id: 'frame-settled-preflight',
      campaignId: 'campaign-sidecar-settled-preflight-test',
      saveId: 'save-sidecar-settled-preflight-test',
      chatId: 'campaign-chat',
      hostMessageId: 'player-settled-preflight',
      textHash: 'settled-preflight-source-hash'
    },
    coreTransactionId: 'txn-settled-preflight'
  });
  const settledPreflightGateway = createStateDeltaGateway({
    getState: () => settledPreflightState,
    setState: (next) => { settledPreflightState = cloneJson(next); },
    persist: async (next) => { settledPreflightState = cloneJson(next); },
    now
  });
  const settledPreflightApplyCalls = [];
  const originalSettledPreflightApplyOperations = settledPreflightGateway.applyOperations;
  settledPreflightGateway.applyOperations = async (proposal, policy) => {
    settledPreflightApplyCalls.push({ proposal: cloneJson(proposal), policy: cloneJson(policy || {}) });
    return originalSettledPreflightApplyOperations(proposal, policy);
  };
  let settledPreflightFinalCalls = 0;
  const settledPreflightCoreDiagnostics = [];
  const settledPreflightScheduler = createCampaignSidecarScheduler({
    generationRouter: {
      async generate() {
        assert.fail('Multiple requested campaign sidecars should use the batch generation path.');
      },
      async batch(requests) {
        return requests.map((request) => ({
          ok: true,
          response: {
            text: JSON.stringify({
              id: `settled-preflight-${request.roleId}`,
              operations: [{
                op: 'append',
                path: request.roleId === 'crewDirector' ? 'crew.casualties' : 'relationships.seniorCrew',
                value: { id: `settled-preflight-${request.roleId}`, summary: 'This must reject before old apply.' }
              }],
              summary: 'Unsafe settled preflight proposal.'
            })
          }
        }));
      }
    },
    stateDeltaGateway: settledPreflightGateway,
    getCampaignState: () => settledPreflightState,
    setCampaignState: (next) => { settledPreflightState = cloneJson(next); },
    persistCampaignState: async (next) => { settledPreflightState = cloneJson(next); },
    appendCoreDiagnostic: async (event) => {
      settledPreflightCoreDiagnostics.push(cloneJson(event));
      return { ok: true };
    },
    forgeCoordinator: {
      async prepareAcceptedBatch(input) {
        return {
          status: 'settled',
          transactionId: 'txn-settled-preflight',
          acceptedBatchHash: input.acceptedBatchHash,
          background: forgeBackgroundTransaction('txn-settled-preflight', input)
        };
      },
      async settleAcceptedBatch() {
        settledPreflightFinalCalls += 1;
        return { status: 'settled' };
      }
    },
    now
  });
  const settledPreflightResults = await settledPreflightScheduler.schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: {
      ingressId: 'ingress-settled-preflight',
      turnId: 'turn-settled-preflight',
      outcomeId: 'outcome-settled-preflight'
    }
  });
  await settledPreflightScheduler.pending();
  assert.deepEqual(settledPreflightResults.map((result) => result.status), ['rejected', 'rejected']);
  assert.equal(settledPreflightApplyCalls.length, 0);
  assert.equal(settledPreflightFinalCalls, 0);
  assert.equal(settledPreflightState.relationships.seniorCrew.length, 0);
  assert.equal(settledPreflightState.crew.casualties.length, 0);
  const settledPreflightJournal = settledPreflightState.runtimeTracking.sidecarJournal.slice(-2);
  assert.deepEqual(settledPreflightJournal.map((entry) => entry.status), []);
  const settledPreflightRejectedDiagnostics = settledPreflightCoreDiagnostics.filter((entry) => entry.ingressId === 'ingress-settled-preflight' && entry.status === 'rejected');
  assert.deepEqual(settledPreflightRejectedDiagnostics.map((entry) => entry.errorCode), ['DIRECTIVE_FORGE_PREFLIGHT_FAILED', 'DIRECTIVE_FORGE_PREFLIGHT_FAILED']);
  assert.deepEqual(settledPreflightRejectedDiagnostics.map((entry) => entry.bridgeStatus), ['settled', 'settled']);
  assert.deepEqual(settledPreflightRejectedDiagnostics.map((entry) => entry.bridgeEffectiveStatus), ['settled', 'settled']);
}

{
  let coreRevisionSidecarState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-core-revision-test', status: 'active' },
    player: { name: 'Talia Serrin', rank: 'Commander', billet: 'Executive Officer' },
    mission: { activeMissionId: 'chapter-1', activePhaseId: 'arrival', knownFacts: [] },
    ship: { condition: 'Operational', damage: [] },
    crew: { casualties: [] },
    relationships: { seniorCrew: [] },
    commandBearing: {},
    pressureLedger: { records: [] },
    commandLog: { entries: [] },
    continuity: { notes: [] },
    runtimeTracking: {
      revision: 99,
      mechanicsRevision: 99
    }
  });
  coreRevisionSidecarState = recordTurnIngress(coreRevisionSidecarState, {
    id: 'ingress-core-revision-1',
    hostMessageId: 'player-core-revision-1',
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-core-revision-test',
    textHash: 'core-revision-source-hash',
    textPreview: 'Source message for CORE revision sidecars.',
    status: 'committed',
    outcomeId: 'outcome-core-revision-1',
    sourceFrameId: 'frame-core-revision-1',
    sourceFrame: {
      id: 'frame-core-revision-1',
      campaignId: 'campaign-sidecar-core-revision-test',
      saveId: 'save-sidecar-core-revision-test',
      chatId: 'campaign-chat',
      hostMessageId: 'player-core-revision-1',
      textHash: 'core-revision-source-hash'
    },
    coreTransactionId: 'txn-core-revision-1'
  });
  coreRevisionSidecarState.directiveRuntimeEvidence.coreStoreReadProjections.runtimeAuthority = 'coreStoreV2';
  coreRevisionSidecarState.directiveRuntimeEvidence.coreStoreReadProjections.revisions = { runtime: 7, mechanics: 3 };
  const coreRevisionGateway = createStateDeltaGateway({
    getState: () => coreRevisionSidecarState,
    setState: (next) => { coreRevisionSidecarState = cloneJson(next); },
    persist: async (next) => { coreRevisionSidecarState = cloneJson(next); },
    now
  });
  const coreRevisionRequests = [];
  const coreRevisionScheduler = createCampaignSidecarScheduler({
    generationRouter: {
      async generate() {
        assert.fail('Single requested sidecar should still use batch generation in this scheduler path.');
      },
      async batch(requests) {
        coreRevisionRequests.push(...requests.map(cloneJson));
        return requests.map((request) => ({
          ok: true,
          response: {
            text: JSON.stringify({
              id: `${request.roleId}-core-revision-proposal`,
              baseRevision: 7,
              operations: [],
              summary: 'No mutation needed; CORE revision authority should still drive worker base.'
            })
          }
        }));
      }
    },
    stateDeltaGateway: coreRevisionGateway,
    getCampaignState: () => coreRevisionSidecarState,
    setCampaignState: (next) => { coreRevisionSidecarState = cloneJson(next); },
    persistCampaignState: async (next) => { coreRevisionSidecarState = cloneJson(next); },
    now
  });
  const coreRevisionResults = await coreRevisionScheduler.schedule({
    workerPlan: { crew: true, ship: true },
    turnContext: {
      ingressId: 'ingress-core-revision-1',
      turnId: 'turn-core-revision-1',
      outcomeId: 'outcome-core-revision-1'
    }
  });
  assert.equal(coreRevisionRequests.length, 2);
  assert.match(JSON.stringify(coreRevisionRequests), /baseRevision[^0-9]+7/);
  assert.deepEqual(coreRevisionResults.map((result) => result.status), ['noChange', 'noChange']);
  assert.equal(coreRevisionResults.every((result) => result.proposal.baseRevision === 7), true);
  assert.equal(coreRevisionSidecarState.runtimeTracking.revision, 99, 'no-change sidecar must not mutate stale old runtime revision');
}

{
  let coreAuthorityNoVectorState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-core-authority-no-vector-test', status: 'active' },
    player: { name: 'Talia Serrin', rank: 'Commander', billet: 'Executive Officer' },
    mission: { activeMissionId: 'chapter-1', activePhaseId: 'arrival', knownFacts: [] },
    ship: { condition: 'Operational', damage: [] },
    crew: { casualties: [] },
    relationships: { seniorCrew: [] },
    commandBearing: {},
    pressureLedger: { records: [] },
    commandLog: { entries: [] },
    continuity: { notes: [] },
    runtimeTracking: {
      revision: 99,
      mechanicsRevision: 88
    }
  });
  coreAuthorityNoVectorState = recordTurnIngress(coreAuthorityNoVectorState, {
    id: 'ingress-core-authority-no-vector-1',
    hostMessageId: 'player-core-authority-no-vector-1',
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-core-authority-no-vector-test',
    textHash: 'core-authority-no-vector-source-hash',
    textPreview: 'Source message for CORE authority without revisions.',
    status: 'committed',
    outcomeId: 'outcome-core-authority-no-vector-1',
    sourceFrameId: 'frame-core-authority-no-vector-1',
    sourceFrame: {
      id: 'frame-core-authority-no-vector-1',
      campaignId: 'campaign-sidecar-core-authority-no-vector-test',
      saveId: 'save-sidecar-core-authority-no-vector-test',
      chatId: 'campaign-chat',
      hostMessageId: 'player-core-authority-no-vector-1',
      textHash: 'core-authority-no-vector-source-hash'
    },
    coreTransactionId: 'txn-core-authority-no-vector-1'
  });
  coreAuthorityNoVectorState.directiveRuntimeEvidence.coreStoreReadProjections.runtimeAuthority = 'coreStoreV2';
  delete coreAuthorityNoVectorState.directiveRuntimeEvidence.coreStoreReadProjections.revisions;
  const coreAuthorityNoVectorGateway = createStateDeltaGateway({
    getState: () => coreAuthorityNoVectorState,
    setState: (next) => { coreAuthorityNoVectorState = cloneJson(next); },
    persist: async (next) => { coreAuthorityNoVectorState = cloneJson(next); },
    now
  });
  const coreAuthorityNoVectorRequests = [];
  const coreAuthorityNoVectorScheduler = createCampaignSidecarScheduler({
    generationRouter: {
      async generate() {
        assert.fail('Single requested sidecar should still use batch generation in this scheduler path.');
      },
      async batch(requests) {
        coreAuthorityNoVectorRequests.push(...requests.map(cloneJson));
        return requests.map((request) => ({
          ok: true,
          response: {
            text: JSON.stringify({
              id: `${request.roleId}-core-authority-no-vector-proposal`,
              baseRevision: 0,
              operations: [],
              summary: 'No mutation needed; CORE authority without revision vector should use zero base.'
            })
          }
        }));
      }
    },
    stateDeltaGateway: coreAuthorityNoVectorGateway,
    getCampaignState: () => coreAuthorityNoVectorState,
    setCampaignState: (next) => { coreAuthorityNoVectorState = cloneJson(next); },
    persistCampaignState: async (next) => { coreAuthorityNoVectorState = cloneJson(next); },
    now
  });
  const coreAuthorityNoVectorResults = await coreAuthorityNoVectorScheduler.schedule({
    workerPlan: { crew: true, ship: true },
    turnContext: {
      ingressId: 'ingress-core-authority-no-vector-1',
      turnId: 'turn-core-authority-no-vector-1',
      outcomeId: 'outcome-core-authority-no-vector-1'
    }
  });
  assert.equal(coreAuthorityNoVectorRequests.length, 2);
  assert.match(JSON.stringify(coreAuthorityNoVectorRequests), /baseRevision[^0-9]+0/);
  assert.deepEqual(coreAuthorityNoVectorResults.map((result) => result.status), ['noChange', 'noChange']);
  assert.equal(coreAuthorityNoVectorResults.every((result) => result.proposal.baseRevision === 0), true);
  assert.equal(coreAuthorityNoVectorState.runtimeTracking.revision, 99, 'no-change sidecar must not normalize stale old runtime revision when CORE owns authority.');
}

{
  let driftState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-rebase-test', status: 'active' },
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
  driftState = recordTurnIngress(driftState, {
    id: 'ingress-rebase-1',
    hostMessageId: 'player-rebase-1',
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-rebase-test',
    textHash: 'rebase-source-hash',
    textPreview: 'Source message for rebased sidecars.',
    status: 'committed',
    outcomeId: 'outcome-rebase-1',
    sourceFrameId: 'frame-rebase-1',
    sourceFrame: {
      id: 'frame-rebase-1',
      campaignId: 'campaign-sidecar-rebase-test',
      saveId: 'save-sidecar-rebase-test',
      chatId: 'campaign-chat',
      hostMessageId: 'player-rebase-1',
      textHash: 'rebase-source-hash'
    },
    coreTransactionId: 'txn-rebase-1'
  });
  const driftGateway = createStateDeltaGateway({
    getState: () => driftState,
    setState: (next) => { driftState = cloneJson(next); },
    persist: async (next) => { driftState = cloneJson(next); },
    now
  });
  const driftApplyCalls = [];
  const driftValidateCalls = [];
  const originalDriftApplyOperations = driftGateway.applyOperations;
  const originalDriftValidateOperations = driftGateway.validateOperations;
  driftGateway.applyOperations = async (proposal, policy) => {
    driftApplyCalls.push({ proposal: cloneJson(proposal), policy: cloneJson(policy || {}) });
    return originalDriftApplyOperations(proposal, policy);
  };
  driftGateway.validateOperations = async (proposal, policy) => {
    driftValidateCalls.push({ proposal: cloneJson(proposal), policy: cloneJson(policy || {}) });
    return originalDriftValidateOperations(proposal, policy);
  };
  let driftInjected = false;
  const driftCoreCommits = [];
  const driftScheduler = createCampaignSidecarScheduler({
    generationRouter: {
      async generate() {
        assert.fail('Multiple requested campaign sidecars should use the batch generation path.');
      },
      async batch(requests) {
        if (!driftInjected) {
          driftInjected = true;
          await driftGateway.applyOperations({
            id: 'background-drift-before-sidecar-apply',
            workerId: 'testBackground',
            baseRevision: driftState.runtimeTracking.revision,
            operations: [{
              op: 'append',
              path: 'pressureLedger.records',
              value: { id: 'pressure-background-drift', summary: 'Background state changed while sidecars were generating.' }
            }],
            summary: 'Simulate unrelated background revision drift.'
          }, { allowedRoots: ['pressureLedger'] });
        }
        return requests.map((request) => ({
          ok: true,
          response: {
            text: JSON.stringify({
              id: `${request.roleId}-rebase-proposal`,
              operations: request.roleId === 'crewDirector'
                ? [{ op: 'append', path: 'crew.casualties', value: { id: 'crew-rebase', summary: 'Minor injury recorded after rebase.' } }]
                : [{ op: 'set', path: 'ship.condition', value: 'Operational with watch notes' }],
              summary: 'Apply after unrelated revision drift.'
            })
          }
        }));
      }
    },
    stateDeltaGateway: driftGateway,
    getCampaignState: () => driftState,
    setCampaignState: (next) => { driftState = cloneJson(next); },
    persistCampaignState: async (next) => { driftState = cloneJson(next); },
    commitCoreBackgroundBatch: async (transactionId, bundle) => {
      driftCoreCommits.push({ transactionId, bundle: cloneJson(bundle) });
      return forgeBackgroundTransaction(transactionId, bundle);
    },
    forgeCoordinator: createTestAcceptedForgeCoordinator({
      commits: driftCoreCommits
    }),
    now
  });
  const driftResults = await driftScheduler.schedule({
    workerPlan: { crew: true, ship: true },
    turnContext: {
      ingressId: 'ingress-rebase-1',
      turnId: 'turn-rebase-1',
      outcomeId: 'outcome-rebase-1'
    }
  });
  assert.deepEqual(driftResults.map((result) => result.status), ['applied', 'applied']);
  assert.equal(driftApplyCalls.length, 1, 'only the unrelated drift apply should use applyOperations');
  assert.equal(driftValidateCalls.length, 1, 'aggregate sidecar projection should be validated without old mutation');
  assert.equal(driftValidateCalls[0].proposal.workerId, 'campaignSidecarBatch');
  assert.equal(driftValidateCalls[0].proposal.baseRevision, 1);
  assert.equal(driftValidateCalls[0].proposal.operations.length, 2);
  assert.equal(driftState.pressureLedger.records.length, 1);
  assert.equal(driftState.crew.casualties.length, 0);
  assert.equal(driftState.ship.condition, 'Operational');
  assert.equal(driftResults.some((result) => result.proposal.operations.some((operation) => operation.path === 'crew.casualties')), true);
  assert.equal(driftResults.some((result) => result.proposal.operations.some((operation) => operation.path === 'ship.condition')), true);
  assert.equal(driftCoreCommits.length, 1);
  assert.equal(driftCoreCommits[0].transactionId, 'txn-rebase-1');
  assert.equal(driftState.runtimeTracking.sidecarJournal.length, 0);
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
    outcomeId: 'outcome-conflict-1',
    sourceFrameId: 'frame-conflict-1',
    sourceFrame: {
      id: 'frame-conflict-1',
      campaignId: 'campaign-sidecar-conflict-test',
      saveId: 'save-sidecar-conflict-test',
      chatId: 'campaign-chat',
      hostMessageId: 'player-conflict-1',
      textHash: 'conflict-source-hash'
    },
    coreTransactionId: 'txn-conflict-1'
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
  const conflictCoreDiagnostics = [];
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
    appendCoreDiagnostic: async (event) => {
      conflictCoreDiagnostics.push(cloneJson(event));
      return { ok: true };
    },
    now
  });
  const conflictResults = await conflictScheduler.schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: { ingressId: 'ingress-conflict-1' }
  });
  await conflictScheduler.pending();
  assert.deepEqual(conflictResults.map((result) => result.status), ['rejected', 'rejected']);
  assert.equal(conflictResults.every((result) => result.error.code === 'DIRECTIVE_SIDECAR_BATCH_PATH_CONFLICT'), true);
  assert.equal(conflictApplyCalls.length, 0);
  assert.equal(conflictPromptSyncs.length, 0);
  assert.equal(conflictCoreBackgroundBatches.length, 0);
  assert.equal(conflictState.runtimeTracking.revision, 0);
  assert.equal(conflictState.crew.casualties.length, 0);
  const conflictJournal = conflictState.runtimeTracking.sidecarJournal.slice(-2);
  assert.deepEqual(conflictJournal.map((entry) => entry.status), []);
  const conflictRejectedDiagnostics = conflictCoreDiagnostics.filter((entry) => entry.ingressId === 'ingress-conflict-1' && entry.status === 'rejected');
  assert.deepEqual(conflictRejectedDiagnostics.map((entry) => entry.errorCode), ['DIRECTIVE_SIDECAR_BATCH_PATH_CONFLICT', 'DIRECTIVE_SIDECAR_BATCH_PATH_CONFLICT']);
}

console.log('Campaign sidecar scheduler tests passed: batched generation, root authorization, Mission Component provenance, stale-revision/source rejection, accepted prompt synchronization, conflict handling, and CORE diagnostics/projections');
