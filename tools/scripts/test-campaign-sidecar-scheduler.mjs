import assert from 'node:assert/strict';

import { createCampaignSidecarScheduler } from '../../src/jobs/campaign-sidecar-scheduler.mjs';
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
  commandStyle: {},
  pressureLedger: { records: [] },
  questLedger: { instances: [] },
  attentionState: { foregroundQuestId: null },
  worldState: { locations: [], actors: [], factions: [] },
  storyArcLedger: { arcs: [] },
  eventLedger: { events: [] },
  threadLedger: { threads: [] },
  dynamicQuestCatalog: { templates: [] },
  knowledgeLedger: { facts: [] },
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
  outcomeId = null
} = {}) {
  state = recordTurnIngress(state, {
    id: ingressId,
    hostMessageId,
    chatId: 'campaign-chat',
    campaignId: 'campaign-sidecar-test',
    textHash,
    textPreview: `Source message for ${ingressId}.`,
    status,
    outcomeId
  });
}

const responses = [];
const generationRouter = {
  async generate(roleId) {
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
  syncPromptContext: async (next, details) => {
    promptSyncs.push({ revision: next.runtimeTracking.revision, workerKey: details.workerKey });
    const synchronized = cloneJson(next);
    synchronized.campaignChatBinding = {
      ...(synchronized.campaignChatBinding || {}),
      promptContextRevision: (synchronized.campaignChatBinding?.promptContextRevision || 0) + 1
    };
    return synchronized;
  },
  now
});

recordSourceIngress('ingress-1', { outcomeId: 'outcome-1' });
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
let results = await scheduler.schedule({
  workerPlan: { ship: true },
  turnContext: {
    ingressId: 'ingress-1',
    turnId: 'turn-1',
    outcomeId: 'outcome-1',
    sourceAnchorRange: { startIndex: 4, endIndex: 5, rangeHash: 'range-ship-1' }
  }
});
assert.equal(results[0].status, 'applied');
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
assert.equal(state.runtimeTracking.revision, 1, 'Out-of-scope-only sidecars must not advance campaign mechanics revision.');
assert.equal(state.runtimeTracking.sidecarJournal.at(-1).status, 'noChange');
assert.equal(state.runtimeTracking.sidecarJournal.at(-1).diagnostics.parse.ok, true);
assert.equal(state.runtimeTracking.sidecarJournal.at(-1).diagnostics.schema.ok, true);
assert.equal(state.runtimeTracking.sidecarJournal.at(-1).diagnostics.schema.droppedForbiddenOperationCount, 1);
assert.equal(state.runtimeTracking.sidecarJournal.at(-1).diagnostics.apply.skipped, true);

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
assert.equal(state.runtimeTracking.revision, 1, 'No-op sidecars must not advance campaign mechanics revision.');
assert.equal(state.runtimeTracking.sidecarJournal.at(-1).status, 'noChange');
assert.equal(state.runtimeTracking.sidecarJournal.at(-1).diagnostics.schema.ok, true);
assert.equal(state.runtimeTracking.sidecarJournal.at(-1).diagnostics.apply.skipped, true);

recordSourceIngress('ingress-2c');
responses.push({
  rawText: 'not json'
});
results = await scheduler.schedule({
  workerPlan: { crew: true },
  turnContext: { ingressId: 'ingress-2c' }
});
assert.equal(results[0].status, 'rejected');
assert.equal(results[0].error.code, 'DIRECTIVE_SIDECAR_JSON_INVALID');
assert.equal(state.runtimeTracking.revision, 1, 'Invalid JSON sidecars must not advance campaign mechanics revision.');
assert.equal(state.runtimeTracking.sidecarJournal.at(-1).diagnostics.parse.ok, false);

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
assert.equal(state.runtimeTracking.revision, 2);
assert.equal(state.continuity.notes.length, 0);
assert.equal(state.runtimeTracking.sidecarJournal.at(-1).status, 'rejected');
assert.equal(promptSyncs.length, 1, 'Rejected or stale sidecars must not rebuild prompt context.');
assert.equal(persisted.length > 0, true);

state = recordTurnIngress(state, {
  id: 'ingress-stale-edit',
  hostMessageId: 'player-stale-edit',
  chatId: 'campaign-chat',
  campaignId: 'campaign-sidecar-test',
  textHash: 'hash-before-edit',
  textPreview: 'Original order with typo.',
  status: 'committed',
  outcomeId: 'outcome-stale-edit'
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
assert.equal(promptSyncs.length, 1, 'Source-stale sidecars must not rebuild prompt context.');

{
  let batchState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-batch-test', status: 'active' },
    player: { name: 'Talia Serrin', rank: 'Commander', billet: 'Executive Officer' },
    mission: { activeMissionId: 'chapter-1', activePhaseId: 'arrival', knownFacts: [] },
    ship: { condition: 'Operational', damage: [] },
    crew: { casualties: [] },
    relationships: { seniorCrew: [] },
    commandStyle: {},
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
    outcomeId: 'outcome-batch-1'
  });
  const batchCalls = [];
  const batchGateway = createStateDeltaGateway({
    getState: () => batchState,
    setState: (next) => { batchState = cloneJson(next); },
    persist: async (next) => { batchState = cloneJson(next); },
    now
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
    setCampaignState: (next) => { batchState = cloneJson(next); },
    persistCampaignState: async (next) => { batchState = cloneJson(next); },
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
  assert.equal(batchCalls[0].options.concurrent, true);
  assert.deepEqual(batchResults.map((result) => result.status), ['applied', 'applied', 'applied']);
  assert.equal(batchState.runtimeTracking.revision, 3);
  assert.equal(batchState.relationships.seniorCrew.length, 1);
  assert.equal(batchState.crew.casualties.length, 1);
  assert.equal(batchState.ship.condition, 'Damaged but mobile');
  const batchJournal = batchState.runtimeTracking.sidecarJournal.slice(-3);
  assert.deepEqual(batchJournal.map((entry) => entry.status), ['applied', 'applied', 'applied']);
  assert.deepEqual(batchJournal.map((entry) => entry.diagnostics.sidecarGeneration.rebased), [false, true, true]);
}

{
  let conflictState = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-sidecar-conflict-test', status: 'active' },
    mission: { activeMissionId: 'chapter-1', activePhaseId: 'arrival', knownFacts: [] },
    ship: { condition: 'Operational', damage: [] },
    crew: { casualties: [] },
    relationships: { seniorCrew: [] },
    commandStyle: {},
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
    now
  });
  const conflictResults = await conflictScheduler.schedule({
    workerPlan: { relationship: true, crew: true },
    turnContext: { ingressId: 'ingress-conflict-1' }
  });
  assert.deepEqual(conflictResults.map((result) => result.status), ['applied', 'rejected']);
  assert.equal(conflictResults[1].error.code, 'DIRECTIVE_SIDECAR_BATCH_PATH_CONFLICT');
  assert.equal(conflictState.runtimeTracking.revision, 1);
  assert.equal(conflictState.crew.casualties.length, 1);
  assert.equal(conflictState.runtimeTracking.sidecarJournal.at(-1).error.code, 'DIRECTIVE_SIDECAR_BATCH_PATH_CONFLICT');
}

console.log('Campaign sidecar scheduler tests passed: batched generation, root authorization, stale-revision/source rejection, accepted prompt synchronization, conflict handling, and durable journaling');
