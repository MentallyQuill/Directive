import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createFakeDirectiveHost } from '../../src/hosts/fake/fake-host.mjs';
import { createInitialMissionJourney } from '../../src/mission/v1/mission-journey.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
import { createDirectiveRuntimeApp } from '../../src/runtime/runtime-app.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { createTurnProgressReporter } from '../../src/runtime/turn-progress.mjs';
import { createV1MissionRuntime } from '../../src/runtime/v1-mission-runtime.mjs';
import { createAshesInitialState, loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

function deferred() {
  let resolve;
  const promise = new Promise((settle) => { resolve = settle; });
  return { promise, resolve };
}

let clock = 100;
const reporter = createTurnProgressReporter({
  clock: () => clock,
  idFactory: (sequence) => `operation-${sequence}`,
});
const events = [];
reporter.subscribeTurnProgress((event) => events.push(event));
reporter.subscribeTurnProgress(() => { throw new Error('presentation failed'); });

const firstGate = deferred();
const firstScope = reporter.createScope();
const first = reporter.run('reviewing-events', async ({ onAttempt }) => {
  onAttempt(1);
  await firstGate.promise;
  return { ok: true, secret: 'PRIVATE RESPONSE' };
}, { scope: firstScope });
assert.deepEqual(events, [
  { type: 'start', operationId: 'operation-1', stage: 'reviewing-events', startedAt: 100 },
  { type: 'update', operationId: 'operation-1', stage: 'reviewing-events', startedAt: 100, attempt: 1 },
]);

clock = 125;
const secondGate = deferred();
const second = reporter.run('updating-characters', async () => {
  await secondGate.promise;
  return { ok: false, reasonCode: 'invalid-output', secret: 'STORY SECRET' };
}, { scope: firstScope });
assert.equal(events.filter((event) => event.type === 'start').length, 2, 'concurrent operations retain distinct ownership');

const replayed = [];
reporter.subscribeTurnProgress((event) => replayed.push(event));
assert.deepEqual(replayed, [
  { type: 'start', operationId: 'operation-1', stage: 'reviewing-events', startedAt: 100, attempt: 1 },
  { type: 'start', operationId: 'operation-2', stage: 'updating-characters', startedAt: 125 },
]);

clock = 150;
secondGate.resolve();
assert.deepEqual(await second, { ok: false, reasonCode: 'invalid-output', secret: 'STORY SECRET' });
assert.deepEqual(events.at(-1), {
  type: 'finish',
  operationId: 'operation-2',
  stage: 'updating-characters',
  startedAt: 125,
  endedAt: 150,
  outcome: 'failed',
});
assert.doesNotMatch(JSON.stringify(events), /PRIVATE RESPONSE|STORY SECRET/);

clock = 175;
firstGate.resolve();
assert.deepEqual(await first, { ok: true, secret: 'PRIVATE RESPONSE' });
assert.equal(events.at(-1).outcome, 'complete');

const staleGate = deferred();
const staleScope = reporter.createScope();
const stale = reporter.run('reviewing-episode', async () => {
  await staleGate.promise;
  await reporter.run('saving', async () => ({ ok: true }), { scope: staleScope });
  return { ok: true };
}, { scope: staleScope });
clock = 200;
reporter.resetTurnProgress();
const resetIndex = events.findLastIndex((event) => event.type === 'reset');
assert.equal(resetIndex >= 0, true);
staleGate.resolve();
await stale;
assert.deepEqual(events.slice(resetIndex + 1), [], 'reset suppresses stale finishes and later child operations');

let invalidStageRan = false;
await reporter.run('reading-minds', async () => {
  invalidStageRan = true;
  return { ok: true };
});
assert.equal(invalidStageRan, true, 'presentation metadata cannot block the underlying operation');
assert.deepEqual(events.slice(resetIndex + 1), []);

const app = createDirectiveRuntimeApp({ host: createFakeDirectiveHost() });
const appEvents = [];
const unsubscribeAppProgress = app.subscribeTurnProgress((event) => appEvents.push(event));
assert.equal(typeof unsubscribeAppProgress, 'function');
app.resetTurnProgress();
assert.equal(appEvents.at(-1).type, 'reset', 'the app owns the reporter lifecycle before initialization');
unsubscribeAppProgress();
app.resetTurnProgress();
assert.equal(appEvents.length, 1, 'app subscriptions can be removed');

const definition = JSON.parse(fs.readFileSync(
  'packages/bundled/breckenridge/v1/prelude-a-ship-underway.mission-v1.json',
  'utf8',
));
const ashesAssets = loadAshesRuntimeAssets();
const definitionRecord = { path: 'prelude.mission-v1.json', definition };
const runtimeAssets = {
  ...ashesAssets,
  missionDefinitions: [definitionRecord],
  missionDefinitionsById: new Map([[definition.id, definitionRecord]]),
};

function activeState() {
  const state = createAshesInitialState({
    campaignId: 'campaign.progress',
    saveId: 'save.progress',
    chatId: 'chat.progress',
  });
  const journey = createInitialMissionJourney({ definition, branchId: 'save.progress' });
  state.mission = {
    activeMissionId: definition.packageBinding.sourceId,
    v1: createMissionState({ definition, branchId: 'save.progress' }),
    v1Journey: journey.journey,
    v1History: journey.history,
  };
  return state;
}

function acceptedSnapshot(sourceRangeHash) {
  return {
    kind: 'directive.acceptedPairSnapshot.v1',
    envelope: {
      campaignId: 'campaign.progress',
      saveId: 'save.progress',
      chatId: 'chat.progress',
      packageId: definition.packageBinding.packageId,
      packageVersion: definition.packageBinding.packageVersion,
      activeMissionId: definition.packageBinding.sourceId,
    },
    source: {
      sourceRangeHash,
      previousAssistant: {
        hostMessageId: `assistant.${sourceRangeHash}`,
        role: 'assistant',
        text: 'Captain Whitaker completes the handover.',
        textHash: 'a'.repeat(64),
        sourceIntegrity: 'clean',
        selectedVariant: { selectedSwipeId: '0', selectedSwipeIndex: 0, textHash: 'a'.repeat(64) },
      },
      currentPlayer: {
        hostMessageId: `player.${sourceRangeHash}`,
        role: 'user',
        text: 'I accept the watch.',
        textHash: 'b'.repeat(64),
        sourceIntegrity: 'clean',
      },
    },
  };
}

function interpretationOutput({ peopleEvents = [] } = {}) {
  return JSON.stringify({
    kind: 'directive.missionEvidenceInterpretation.v1',
    assistantAcceptance: 'accepted',
    claims: [],
    peopleEvents,
    abstained: true,
    time: { decision: 'unchanged', basis: 'noPassage', elapsedSeconds: 0, reason: 'same-second', confidence: 0.9 },
  });
}

function runtimeHarness({ generationResult = null, generate = null } = {}) {
  let state = activeState();
  const progress = createTurnProgressReporter();
  const progressEvents = [];
  progress.subscribeTurnProgress((event) => progressEvents.push(event));
  const gateway = createStateDeltaGateway({
    getState: () => state,
    setState: (next) => { state = next; },
    persist: async (_next, _descriptor, { progressScope = null } = {}) => (
      progress.run('saving', async () => ({ ok: true }), { scope: progressScope })
    ),
  });
  const runtime = createV1MissionRuntime({
    getState: () => state,
    stateDeltaGateway: gateway,
    generationRouter: {
      async generate(roleId, request, options) {
        options.onAttempt?.(1);
        if (generate) return generate(roleId, request, options);
        return generationResult || { ok: true, response: { text: interpretationOutput(), providerId: 'test' } };
      },
    },
    turnProgress: progress,
  });
  return { runtime, progress, progressEvents };
}

const wired = runtimeHarness();
const wiredScope = wired.progress.createScope();
const wiredResult = await wired.runtime.settleAcceptedPair({
  runtimeAssets,
  snapshot: acceptedSnapshot('range.progress'),
  progressScope: wiredScope,
});
assert.equal(wiredResult.ok, true, JSON.stringify(wiredResult));
assert.deepEqual(
  wired.progressEvents.filter((event) => event.type === 'start').map((event) => event.stage),
  ['reviewing-events', 'saving'],
  'real interpretation and durable settlement publish their observed wait boundaries',
);
assert.equal(wired.progressEvents.find((event) => event.type === 'update').attempt, 1);
const eventCountBeforeReplay = wired.progressEvents.length;
const replay = await wired.runtime.settleAcceptedPair({
  runtimeAssets,
  snapshot: acceptedSnapshot('range.progress'),
  progressScope: wired.progress.createScope(),
});
assert.equal(replay.status, 'already-settled');
assert.equal(wired.progressEvents.length, eventCountBeforeReplay, 'cached settlement emits no model or saving stage');

const failedWiring = runtimeHarness({
  generationResult: { ok: false, reasonCode: 'provider-empty', diagnostics: {} },
});
const failedResult = await failedWiring.runtime.settleAcceptedPair({
  runtimeAssets,
  snapshot: acceptedSnapshot('range.failed'),
  progressScope: failedWiring.progress.createScope(),
});
assert.equal(failedResult.ok, false);
assert.deepEqual(
  failedWiring.progressEvents.filter((event) => event.type === 'finish').map(({ stage, outcome }) => ({ stage, outcome })),
  [{ stage: 'reviewing-events', outcome: 'failed' }],
  'provider result failures cannot produce a successful progress completion',
);

let noChangeState = activeState();
const noChangeProgress = createTurnProgressReporter();
const noChangeEvents = [];
noChangeProgress.subscribeTurnProgress((event) => noChangeEvents.push(event));
const noChangeGateway = createStateDeltaGateway({
  getState: () => noChangeState,
  setState: (next) => { noChangeState = next; },
  persist: async (_next, _descriptor, { progressScope = null } = {}) => (
    noChangeProgress.run('saving', async () => ({ ok: true }), { scope: progressScope })
  ),
});
const noChange = await noChangeGateway.applyProposal({
  patch: { commandBearing: structuredClone(noChangeState.commandBearing) },
  domains: ['commandBearing'],
}, { progressScope: noChangeProgress.createScope() });
assert.equal(noChange.noChange, true);
assert.equal(noChangeEvents.length, 0, 'a no-change proposal never claims that persistence started');
await assert.rejects(
  noChangeGateway.applyProposal({ patch: {}, domains: [] }, {
    progressScope: noChangeProgress.createScope(),
  }),
  /mutable domains/,
);
assert.equal(noChangeEvents.length, 0, 'a rejected proposal never claims that persistence started');

const dossierWiring = runtimeHarness({
  generate(roleId, request) {
    if (roleId === 'acceptedPairMissionEvidence') {
      return {
        ok: true,
        response: {
          providerId: 'test',
          text: interpretationOutput({
            peopleEvents: [{
              type: 'personIntroduced',
              localRef: 'new-1',
              name: 'Ari Sol',
              introductionSummary: 'Ari gave her name during the handover.',
              sourceSlot: 'previousAssistant',
              evidenceQuote: 'Captain Whitaker completes the handover.',
            }],
          }),
        },
      };
    }
    const variant = request.jsonSchema.properties.dossiers.items.oneOf[0];
    return {
      ok: true,
      response: {
        providerId: 'test',
        text: JSON.stringify({
          kind: 'directive.peopleDossierBatch.v1',
          dossiers: [{
            personId: variant.properties.personId.const,
            displayName: variant.properties.displayName.const,
            role: 'Damage-control technician',
            affiliation: 'U.S.S. Breckenridge',
            species: 'Human',
            age: 'Adult',
            birthplace: 'Nairobi, Earth',
            serviceBackground: 'Starship systems repair',
            assignmentHistory: 'Assigned to the Breckenridge engineering department',
            profileSummary: 'Ari Sol serves in the Breckenridge engineering department.',
          }],
        }),
      },
    };
  },
});
const dossierResult = await dossierWiring.runtime.settleAcceptedPair({
  runtimeAssets,
  snapshot: acceptedSnapshot('range.dossier'),
  progressScope: dossierWiring.progress.createScope(),
});
assert.equal(dossierResult.ok, true, JSON.stringify(dossierResult));
assert.deepEqual(
  dossierWiring.progressEvents.filter((event) => event.type === 'start').map((event) => event.stage),
  ['reviewing-events', 'updating-characters', 'saving'],
  'conditional dossier authoring reports only when introductions require it',
);

console.log('Turn progress runtime tests passed.');
