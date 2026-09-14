import assert from 'node:assert/strict';

import { createFakeDirectiveHost, createFakeEventAdapter, createFakeGenerationClient } from '../../src/hosts/fake/fake-host.mjs';
import { createDirectiveRuntimeApp } from '../../src/runtime/runtime-app.mjs';
import { installFakeDom } from './helpers/fake-dom.mjs';
import { loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

installFakeDom();

const bridge = await import('../../src/hosts/sillytavern/runtime-bridge.mjs');
const { wireEvents, disposeSillyTavernDirectiveEventLifecycle, __directiveEventTestHooks } = await import('../../src/hosts/sillytavern/shell-events.js');
const { __settlementRetryDialogTestHooks } = await import('../../src/ui/settlement-retry-dialog.js');

function deferred() {
  let resolve;
  const promise = new Promise(settle => { resolve = settle; });
  return { promise, resolve };
}

async function waitFor(check, message) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (check()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  throw new Error(message);
}

async function createHarness({ holdFirstContinuity = false, holdRetryContinuity = false } = {}) {
  const defaults = createFakeGenerationClient();
  const firstContinuityStarted = deferred();
  const releaseFirstContinuity = deferred();
  const retryContinuityStarted = deferred();
  const releaseRetryContinuity = deferred();
  const freshContinuityStarted = deferred();
  const releaseFreshContinuity = deferred();
  let retrySignal;
  let freshSignal;
  let continuityCalls = 0;
  let continuityMode = 'recover-on-third';
  const generation = createFakeGenerationClient({ responses: {
    acceptedPairMissionEvidence: () => ({ text: JSON.stringify({
      kind: 'directive.missionEvidenceInterpretation.v1',
      assistantAcceptance: 'accepted',
      claims: [],
      abstained: true,
      time: { decision: 'unchanged', basis: 'noPassage', elapsedSeconds: 0, reason: 'same-second', confidence: 0.9 },
    }) }),
    storyDirectionAnalyst: ({ request }) => defaults.generate('storyDirectionAnalyst', request),
    episodeEvaluator: ({ request }) => defaults.generate('episodeEvaluator', request),
    continuityAnalyst: async ({ request, rawRequest, rawOptions }) => {
      continuityCalls += 1;
      const callNumber = continuityCalls;
      if (holdRetryContinuity && callNumber === 3) {
        retrySignal = rawOptions.signal || rawRequest.signal;
        retryContinuityStarted.resolve();
        // Deliberately ignore abort; cancellation must release runtime ownership
        // without accepting a late provider response.
        await releaseRetryContinuity.promise;
      }
      if (holdRetryContinuity && callNumber === 4) {
        freshSignal = rawOptions.signal || rawRequest.signal;
        freshContinuityStarted.resolve();
        await releaseFreshContinuity.promise;
      }
      if (continuityCalls === 1) {
        firstContinuityStarted.resolve();
        if (holdFirstContinuity) await releaseFirstContinuity.promise;
      }
      if (continuityMode === 'recover-on-third' && continuityCalls >= 3) {
        return defaults.generate('continuityAnalyst', request);
      }
      const sent = JSON.parse(request.messages.findLast(message => message.role === 'user').content);
      return { text: JSON.stringify({
        kind: 'directive.continuityAnalystProposal.v1',
        envelope: sent.envelope,
        coverage: 'complete',
        threadChanges: [{
          operation: 'open',
          localRef: 'invalid-quote',
          title: 'Invalid quote probe',
          category: 'schedule',
          sourceSlot: 'previousAssistant',
          evidenceQuote: 'This quote does not occur in the selected source.',
        }],
        lookupRequests: [],
      }) };
    },
  } });
  const host = createFakeDirectiveHost({ chatNative: true, generation });
  host.chat.continueHostGeneration = async () => ({ ok: true });
  let sequence = 0;
  const app = createDirectiveRuntimeApp({
    host,
    packageLoader: async () => loadAshesRuntimeAssets(),
    idFactory: prefix => `${prefix}.${++sequence}`,
    now: () => '2026-09-14T20:00:00.000Z',
  });
  await app.initialize();
  await app.startCreatorDraft();
  await app.saveCreatorDraft({ patch: { activeStep: 'review', input: {
    identity: { name: 'Gesture Tester', pronounsOrAddress: 'they/them', speciesId: 'human', ageBandId: 'mid-career', appearance: 'Attentive.' },
    service: { careerBackgroundId: 'tactical-security', formativeExperienceId: 'dominion-war-fleet-service', assignmentReasonId: 'experienced-outsider-transfer' },
    personality: { traits: { insight: 'perceptive', connection: 'candid', execution: 'decisive' }, flawId: 'impatient' },
    dossier: { briefBiography: 'A command officer committed to reconstruction.', publicReputation: 'An attentive command officer.' },
  } } });
  await app.acceptCreatorDraftAndStartCampaign();
  const promptingPlayer = host.chat.pushPlayerMessage({ text: 'I ask about the transfer schedule.' });
  host.chat.pushAssistantMessage({
    text: 'The Ravenna transfer remains scheduled for fourteen hundred.',
    metadata: { promptingPlayerHostMessageId: promptingPlayer.hostMessageId },
  });
  const currentPlayer = host.chat.pushPlayerMessage({ text: 'What flexibility do we have?' });
  const eventSource = createFakeEventAdapter();
  wireEvents({ eventSource, eventTypes: {
    GENERATION_STARTED: 'generation-started',
    MESSAGE_SENT: 'message-sent',
    GENERATION_STOPPED: 'generation-stopped',
    GENERATION_ENDED: 'generation-ended',
  } });
  bridge.setSillyTavernDirectiveRuntimeBridge({ app, turnOrchestrator: app.getChatTurnOrchestrator(), directiveHost: host });
  return {
    app,
    host,
    currentPlayer,
    eventSource,
    firstContinuityStarted,
    releaseFirstContinuity,
    retryContinuityStarted,
    releaseRetryContinuity,
    freshContinuityStarted,
    releaseFreshContinuity,
    retrySignal: () => retrySignal,
    freshSignal: () => freshSignal,
    continuityCalls: () => continuityCalls,
    setContinuityMode: value => { continuityMode = value; },
    dispose() {
      disposeSillyTavernDirectiveEventLifecycle();
      bridge.clearSillyTavernDirectiveRuntimeBridge();
    },
  };
}

async function beginObservedGeneration(harness) {
  harness.eventSource.emit('generation-started', { type: 'normal', dryRun: false });
  harness.eventSource.emit('message-sent', { message: harness.currentPlayer });
}

// A fast observer failure can settle before the same native Generate reaches its interceptor.
{
  const harness = await createHarness();
  try {
    await beginObservedGeneration(harness);
    await waitFor(() => harness.continuityCalls() === 2, 'fast observer did not exhaust its continuity attempts');
    await new Promise(resolve => setImmediate(resolve));
    const blocked = await bridge.directiveGenerationInterceptor([], 8192, () => {}, 'normal');
    assert.equal(blocked.abortDefaultGeneration, true, 'the same native gesture must remain blocked after its observer fails');
    assert.equal(harness.continuityCalls(), 2, 'the same native gesture must not consume the manual recovery pass');
    const dialog = __settlementRetryDialogTestHooks.active();
    assert.ok(dialog, 'the blocked gesture exposes explicit recovery');
    await dialog.retry.listeners.get('click')[0]({ preventDefault() {} });
    assert.equal(harness.continuityCalls(), 3, 'dialog Retry receives one new failed-role pass');
    assert.equal(__settlementRetryDialogTestHooks.active(), null);
    harness.eventSource.emit('generation-started', { type: 'normal', automaticTrigger: true, dryRun: false });
    const nativeHandoff = await bridge.directiveGenerationInterceptor([], 8192, () => {}, 'normal');
    assert.equal(nativeHandoff.abortDefaultGeneration, false, 'prepared Retry may hand off through automatic native narration');
    assert.equal(harness.continuityCalls(), 3, 'the prepared native handoff does not reopen settled analysis');
  } finally {
    harness.dispose();
  }
}

// An interceptor already waiting behind the observer has the same ownership and cannot steal Retry.
{
  const harness = await createHarness({ holdFirstContinuity: true });
  try {
    await beginObservedGeneration(harness);
    await harness.firstContinuityStarted.promise;
    const interception = bridge.directiveGenerationInterceptor([], 8192, () => {}, 'normal');
    harness.releaseFirstContinuity.resolve();
    const blocked = await interception;
    assert.equal(blocked.abortDefaultGeneration, true);
    assert.equal(harness.continuityCalls(), 2, 'the in-flight observer owns the original gesture attempt budget');
    harness.eventSource.emit('generation-started', { type: 'normal', dryRun: false });
    const recovered = await bridge.directiveGenerationInterceptor([], 8192, () => {}, 'normal');
    assert.equal(recovered.abortDefaultGeneration, false, 'a later native Generate receives a manual recovery pass');
    assert.equal(harness.continuityCalls(), 3);
  } finally {
    harness.dispose();
  }
}

// Stop invalidates an observed native gesture before its late interceptor can resume recovery.
{
  const harness = await createHarness();
  try {
    await beginObservedGeneration(harness);
    await waitFor(() => harness.continuityCalls() === 2, 'stopped observer did not reach its blocked state');
    await new Promise(resolve => setImmediate(resolve));
    await __directiveEventTestHooks.handleGenerationStopped();
    await __directiveEventTestHooks.handleGenerationEnded();
    const stopped = await bridge.directiveGenerationInterceptor([], 8192, () => {}, 'normal');
    assert.equal(stopped.responseStrategy, 'cancelStaleTurn');
    assert.equal(harness.continuityCalls(), 2, 'Stop prevents the late interceptor from reviving recovery');
    harness.eventSource.emit('generation-started', { type: 'normal', automaticTrigger: true, dryRun: false });
    const automaticAfterStop = await bridge.directiveGenerationInterceptor([], 8192, () => {}, 'normal');
    assert.equal(automaticAfterStop.responseStrategy, 'cancelStaleTurn', 'automatic generation cannot reopen a stopped session');
    assert.equal(harness.continuityCalls(), 2);
  } finally {
    harness.dispose();
  }
}

// Background and quiet host generations cannot manufacture a manual retry gesture.
for (const generationStart of [
  { type: 'normal', automaticTrigger: true, dryRun: false },
  { type: 'quiet', automaticTrigger: false, dryRun: false },
]) {
  const harness = await createHarness();
  try {
    await beginObservedGeneration(harness);
    await waitFor(() => harness.continuityCalls() === 2, 'observer did not reach its blocked state');
    await new Promise(resolve => setImmediate(resolve));
    harness.eventSource.emit('generation-started', generationStart);
    const blocked = await bridge.directiveGenerationInterceptor([], 8192, () => {}, generationStart.type);
    assert.equal(blocked.abortDefaultGeneration, true);
    assert.equal(
      harness.continuityCalls(),
      2,
      `${generationStart.automaticTrigger ? 'automatic' : generationStart.type} generation must not consume manual recovery`,
    );
  } finally {
    harness.dispose();
  }
}

// A failed later Generate owns its new pass; duplicate interceptors under that gesture cannot spend again.
{
  const harness = await createHarness();
  try {
    await beginObservedGeneration(harness);
    await waitFor(() => harness.continuityCalls() === 2, 'observer did not reach its blocked state');
    await new Promise(resolve => setImmediate(resolve));
    harness.setContinuityMode('always-invalid');
    harness.eventSource.emit('generation-started', { type: 'normal', automaticTrigger: false, dryRun: false });
    const [retried, concurrentDuplicate] = await Promise.all([
      bridge.directiveGenerationInterceptor([], 8192, () => {}, 'normal'),
      bridge.directiveGenerationInterceptor([], 8192, () => {}, 'normal'),
    ]);
    assert.equal(retried.abortDefaultGeneration, true);
    assert.equal(concurrentDuplicate.abortDefaultGeneration, true);
    assert.equal(harness.continuityCalls(), 4, 'the later Generate receives one two-attempt pass');
    const duplicate = await bridge.directiveGenerationInterceptor([], 8192, () => {}, 'normal');
    assert.equal(duplicate.abortDefaultGeneration, true);
    assert.equal(harness.continuityCalls(), 4, 'the same native gesture cannot spend its failed retry twice');
  } finally {
    harness.dispose();
  }
}

// Existing source validation still rejects a changed pair before granting a model call.
{
  const harness = await createHarness();
  try {
    harness.eventSource.emit('generation-started', { type: 'normal', dryRun: false });
    const failed = await harness.app.observeHostPlayerMessage({ message: harness.currentPlayer });
    assert.equal(failed.settlementBlocked, true);
    const originalLatest = harness.host.chat.getLatestPlayerMessage.bind(harness.host.chat);
    const originalRecent = harness.host.chat.getRecentMessages.bind(harness.host.chat);
    harness.host.chat.getLatestPlayerMessage = () => ({ ...originalLatest(), text: 'Changed after the failed observation.' });
    harness.host.chat.getRecentMessages = options => originalRecent(options).map(message => (
      message.hostMessageId === harness.currentPlayer.hostMessageId
        ? { ...message, text: 'Changed after the failed observation.' }
        : message
    ));
    const callsBeforeRetry = harness.continuityCalls();
    const stale = await harness.app.retryPendingAcceptedPairSettlement();
    assert.equal(stale.reasonCode, 'pending-source-stale');
    assert.equal(harness.continuityCalls(), callsBeforeRetry, 'changed source is rejected before manual model work');
  } finally {
    harness.dispose();
  }
}

for (const dismissal of ['close', 'escape', 'backdrop']) {
  const harness = await createHarness({ holdRetryContinuity: true });
  let narrationStarts = 0;
  harness.host.chat.continueHostGeneration = async () => { narrationStarts++; return { ok: true }; };
  try {
    await bridge.directiveGenerationInterceptor([], 8192, () => {}, 'normal');
    const before = (await harness.app.getCurrentView({ tabId: 'mission' })).campaignState;
    const beforeStorage = harness.host.storage.snapshot();
    const dialog = __settlementRetryDialogTestHooks.active();
    const retrying = dialog.retry.listeners.get('click')[0]({});
    await harness.retryContinuityStarted.promise;
    if (dismissal === 'close') await dialog.close.listeners.get('click')[0]({});
    if (dismissal === 'escape') await dialog.dialog.dispatch('keydown', { key: 'Escape' });
    if (dismissal === 'backdrop') await dialog.overlay.dispatch('click', { target: dialog.overlay });
    assert.equal(harness.retrySignal()?.aborted, true, `${dismissal} must abort the active continuity transport`);
    await retrying;
    assert.equal(harness.continuityCalls(), 3, 'dismissal must not launch another provider attempt');
    assert.equal(narrationStarts, 0);
    assert.equal(__settlementRetryDialogTestHooks.active(), null);
    assert.deepEqual((await harness.app.getCurrentView({ tabId: 'mission' })).campaignState, before,
      `${dismissal} must not commit a canceled turn`);
    assert.deepEqual(harness.host.storage.snapshot(), beforeStorage, 'canceled analysis must not persist any state');
    // The old provider is still unresolved. A new explicit gesture must own an
    // independent attempt, and the old result must not disturb its commit.
    harness.eventSource.emit('generation-started', { type: 'normal', dryRun: false });
    const fresh = bridge.directiveGenerationInterceptor([], 8192, () => {}, 'normal');
    await harness.freshContinuityStarted.promise;
    harness.releaseRetryContinuity.resolve();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(harness.freshSignal().aborted, false, 'the stale response cannot cancel the new gesture');
    assert.deepEqual((await harness.app.getCurrentView({ tabId: 'mission' })).campaignState, before);
    harness.releaseFreshContinuity.resolve();
    assert.equal((await fresh).abortDefaultGeneration, false);
    const recovered = (await harness.app.getCurrentView({ tabId: 'mission' })).campaignState;
    assert.equal(recovered.stateCustody.revision, before.stateCustody.revision + 1);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual((await harness.app.getCurrentView({ tabId: 'mission' })).campaignState, recovered);
    assert.equal(narrationStarts, 0, 'late canceled Retry cannot start narration');
    assert.equal(__settlementRetryDialogTestHooks.active(), null, 'late canceled Retry cannot reopen recovery');
  } finally {
    harness.releaseRetryContinuity.resolve();
    harness.releaseFreshContinuity.resolve();
    harness.dispose();
  }
}

console.log('PASS native generation gesture retry accounting');
