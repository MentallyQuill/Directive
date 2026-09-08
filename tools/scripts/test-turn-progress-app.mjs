import assert from 'node:assert/strict';
import { createFakeDirectiveHost, createFakePromptAdapter } from '../../src/hosts/fake/fake-host.mjs';
import { createDirectiveRuntimeApp } from '../../src/runtime/runtime-app.mjs';
import { loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';
import * as bridge from '../../src/hosts/sillytavern/runtime-bridge.mjs';
import * as activity from '../../src/hosts/sillytavern/turn-activity-indicator.js';
import { __directiveEventTestHooks as hostEvents } from '../../src/hosts/sillytavern/shell-events.js';

function deferred() {
  let resolve;
  const promise = new Promise(settle => { resolve = settle; });
  return { promise, resolve };
}
const prompt = createFakePromptAdapter();
let installGate = null;
let enteredInstall = null;
const host = createFakeDirectiveHost({chatNative: true, prompt: {
  ...prompt,
  async install(request) {
    enteredInstall?.resolve();
    if (installGate) await installGate.promise;
    return prompt.install(request);
  },
}});
let sequence = 0;
const app = createDirectiveRuntimeApp({host, packageLoader: async () => loadAshesRuntimeAssets(), idFactory: prefix => `${prefix}.${++sequence}`, now: () => '2026-09-08T04:00:00.000Z'});
await app.initialize();
await app.startCreatorDraft();
await app.saveCreatorDraft({patch: {activeStep: 'review', input: {
  identity: {name: 'Progress Tester', pronounsOrAddress: 'they/them', speciesId: 'human', ageBandId: 'mid-career', appearance: 'Attentive.'},
  service: {careerBackgroundId: 'tactical-security', formativeExperienceId: 'dominion-war-fleet-service', assignmentReasonId: 'experienced-outsider-transfer'},
  personality: {traits: {insight: 'perceptive', connection: 'candid', execution: 'decisive'}, flawId: 'impatient'},
  dossier: {briefBiography: 'A command officer committed to reconstruction.', publicReputation: 'An attentive command officer.'},
}}});
await app.acceptCreatorDraftAndStartCampaign();
const progressEvents = [];
app.subscribeTurnProgress(event => progressEvents.push(event));
bridge.setSillyTavernDirectiveRuntimeBridge({app, turnOrchestrator: app.getChatTurnOrchestrator(), directiveHost: host});
const snapshot = () => activity.__directiveTurnActivityTestHooks.progress();
installGate = deferred();
enteredInstall = deferred();
const pending = bridge.directiveGenerationInterceptor([], 8192, () => {}, 'normal');
await enteredInstall.promise;
assert.equal(snapshot().presentation.title, 'Preparing the reply...', 'actual app prompt install drives the bridge notification');
assert.equal(progressEvents.some(event => event.type === 'start' && event.stage === 'preparing'), true);
assert.equal(progressEvents.some(event => event.type === 'finish' && event.stage === 'preparing'), false, 'stage remains pending until actual install resolves');
installGate.resolve();
const result = await pending;
assert.equal(result.responseStrategy, 'injectAndContinue');
assert.equal(snapshot().presentation.title, 'Waiting for the reply...');
assert.equal(progressEvents.find(event => event.type === 'finish' && event.stage === 'preparing').outcome, 'complete');
assert.equal(progressEvents.some(event => event.stage === 'reviewing-events'), false, 'no previous accepted exchange means no fabricated model stage');
activity.finishDirectiveHostGenerationActivities();

installGate = deferred();
enteredInstall = deferred();
const stopped = bridge.directiveGenerationInterceptor([], 8192, () => {}, 'normal');
await enteredInstall.promise;
await hostEvents.handleGenerationStopped();
const afterStop = progressEvents.length;
assert.equal(snapshot().presentation, null);
installGate.resolve();
await stopped;
assert.equal(snapshot().presentation, null, 'late real prompt completion cannot revive a stopped turn');
assert.equal(progressEvents.slice(afterStop).some(event => event.type === 'finish'), false, 'reset suppresses old app operation completion');
// A canceled interceptor may still be awaiting host metadata before it reaches
// the first operation. Its later child stages must keep the original scope.
installGate = null;
const metadataGate = deferred();
const enteredMetadata = deferred();
const originalLatest = host.chat.getLatestPlayerMessage;
host.chat.getLatestPlayerMessage = async (...args) => {
  enteredMetadata.resolve();
  await metadataGate.promise;
  return originalLatest.apply(host.chat, args);
};
const oldMetadata = bridge.directiveGenerationInterceptor([], 8192, () => {}, 'normal');
await enteredMetadata.promise;
await hostEvents.handleGenerationStopped();
const afterMetadataStop = progressEvents.length;
const newerToken = activity.markDirectiveTurnActivity();
metadataGate.resolve();
assert.equal((await oldMetadata).responseStrategy, 'injectAndContinue');
assert.equal(progressEvents.slice(afterMetadataStop).some(event => event.type === 'start'), false, 'a canceled interceptor cannot start later child stages in a new turn');
assert.equal(snapshot().presentation.title, 'Processing the turn...');
activity.finishDirectiveTurnActivity(newerToken);
host.chat.getLatestPlayerMessage = originalLatest;
const queuedEdit = app.handleHostMessageEdited({hostMessageId: 'nonexistent-progress-source'});
app.resetTurnProgress();
const afterEditReset = progressEvents.length;
await queuedEdit;
assert.equal(progressEvents.slice(afterEditReset).some(event => event.type === 'start'), false, 'queued edit reconciliation retains its pre-reset progress scope');
bridge.clearSillyTavernDirectiveRuntimeBridge();
console.log('PASS actual runtime-to-bridge turn progress and stopped prompt ownership');
