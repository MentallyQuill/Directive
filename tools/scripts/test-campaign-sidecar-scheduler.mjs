import assert from 'node:assert/strict';

import { createCampaignSidecarScheduler } from '../../src/jobs/campaign-sidecar-scheduler.mjs';
import { parseStateDeltaProposalOutput } from '../../src/jobs/sidecar-output-contracts.mjs';
import {
  createStateDeltaGateway,
  initializeCampaignRuntimeTracking
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
  sideMissions: { availableAssignments: [] },
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

console.log('Campaign sidecar scheduler tests passed: root authorization, stale-revision rejection, accepted prompt synchronization, and durable journaling');
