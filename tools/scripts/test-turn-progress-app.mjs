import assert from 'node:assert/strict';
import { createFakeDirectiveHost, createFakePromptAdapter } from '../../src/hosts/fake/fake-host.mjs';
import * as runtimeAppModule from '../../src/runtime/runtime-app.mjs';
import { loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';
import * as bridge from '../../src/hosts/sillytavern/runtime-bridge.mjs';
import * as activity from '../../src/hosts/sillytavern/turn-activity-indicator.js';
import { __directiveEventTestHooks as hostEvents } from '../../src/hosts/sillytavern/shell-events.js';
import { __settlementRetryDialogTestHooks as retryDialog } from '../../src/ui/settlement-retry-dialog.js';

const { createDirectiveRuntimeApp } = runtimeAppModule;

const firstBinding = {
  hostId: 'fake', campaignId: 'campaign.first', saveId: 'save.first', chatId: 'chat.first',
  entityType: 'character', entityId: 'character.first', entityName: 'First',
};
const secondBinding = {
  hostId: 'fake', campaignId: 'campaign.second', saveId: 'save.second', chatId: 'chat.second',
  entityType: 'character', entityId: 'character.second', entityName: 'Second',
};
const firstBoundState = { stateCustody: { revision: 4 }, campaignChatBinding: firstBinding };
const secondBoundState = { stateCustody: { revision: 4 }, campaignChatBinding: secondBinding };
assert.equal(runtimeAppModule.__directiveRuntimeAppTestHooks?.promptTargetStatus?.(
  { campaignState: firstBoundState, revision: 4, binding: firstBinding },
  { campaignState: secondBoundState, revision: 4, binding: secondBinding, hostBinding: secondBinding },
), 'changed-bound-target', 'a different validly bound state cannot receive the captured prompt context or be cleared by its stale predecessor');

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
assert.equal(snapshot().presentation.title, 'Installing reply context...', 'actual app prompt install drives the bridge notification');
assert.deepEqual(
  progressEvents.filter(event => event.type === 'start').map(event => event.stage),
  ['building-context', 'assembling-prompt', 'installing-prompt'],
  'the app reports each actual prompt preparation boundary and skips unsupported preset activation',
);
assert.equal(progressEvents.some(event => event.type === 'finish' && event.stage === 'installing-prompt'), false, 'installing stage remains pending until actual install resolves');
installGate.resolve();
const result = await pending;
assert.equal(result.responseStrategy, 'injectAndContinue');
assert.equal(snapshot().presentation.title, 'Waiting for the reply...');
assert.equal(progressEvents.find(event => event.type === 'finish' && event.stage === 'installing-prompt').outcome, 'complete');
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
host.chat.getLatestPlayerMessage = originalLatest;
assert.equal((await app.getChatTurnOrchestrator().interceptGeneration({ type: 'normal' })).abortDefaultGeneration, false,
  'a fresh Generate can proceed while the canceled metadata read is still pending');
const afterMetadataStop = progressEvents.length;
const newerToken = activity.markDirectiveTurnActivity();
metadataGate.resolve();
assert.equal((await oldMetadata).responseStrategy, 'cancelStaleTurn');
assert.equal(progressEvents.slice(afterMetadataStop).some(event => event.type === 'start'), false, 'a canceled interceptor cannot start later child stages in a new turn');
assert.equal(snapshot().presentation.title, 'Processing the turn...');
activity.finishDirectiveTurnActivity(newerToken);
host.chat.getLatestPlayerMessage = originalLatest;
const queuedEdit = app.handleHostMessageEdited({hostMessageId: 'nonexistent-progress-source'});
app.resetTurnProgress();
const afterEditReset = progressEvents.length;
await queuedEdit;
assert.equal(progressEvents.slice(afterEditReset).some(event => event.type === 'start'), false, 'queued edit reconciliation retains its pre-reset progress scope');

const originalBinding = host.chat.getCurrentBinding();
const beforeRetarget = progressEvents.length;
let retargetedAfterContext = false;
const unsubscribeRetarget = app.subscribeTurnProgress((event) => {
  if (retargetedAfterContext || event.type !== 'finish' || event.stage !== 'building-context') return;
  retargetedAfterContext = true;
  void host.chat.createOrBindCampaignChat({
    campaignId: 'campaign.other',
    saveId: 'save.other',
    name: 'Other campaign',
    createNew: true,
  });
});
let staleAbort = null;
const retargeted = await bridge.directiveGenerationInterceptor([], 8192, (immediate) => { staleAbort = immediate; }, 'normal');
unsubscribeRetarget();
assert.equal(retargetedAfterContext, true);
assert.equal(host.chat.getCurrentBinding().saveId, 'save.other');
assert.deepEqual(
  {
    handled: retargeted.handled,
    abortDefaultGeneration: retargeted.abortDefaultGeneration,
    responseStrategy: retargeted.responseStrategy,
    reasonCode: retargeted.reasonCode,
  },
  {
    handled: true,
    abortDefaultGeneration: true,
    responseStrategy: 'cancelStaleTurn',
    reasonCode: 'prompt-target-changed',
  },
  'the actual interceptor blocks narration when prompt ownership changes after context building',
);
assert.equal(staleAbort, false);
assert.equal(snapshot().presentation, null, 'stale turn cancellation dismisses the activity instead of handing it to host narration');
assert.equal(retryDialog.active(), null, 'stale turn cancellation does not show settlement recovery');
assert.deepEqual(
  progressEvents.slice(beforeRetarget).filter(event => event.type === 'start').map(event => event.stage),
  ['building-context'],
  'a chat change after context construction prevents prompt assembly and installation for the stale target',
);
await host.chat.createOrBindCampaignChat({
  ...originalBinding,
  existingChatId: originalBinding.chatId,
  createNew: false,
});

const beforeAssemblyRetarget = progressEvents.length;
let retargetedAfterAssembly = false;
const unsubscribeAssemblyRetarget = app.subscribeTurnProgress((event) => {
  if (retargetedAfterAssembly || event.type !== 'finish' || event.stage !== 'assembling-prompt') return;
  retargetedAfterAssembly = true;
  void host.chat.createOrBindCampaignChat({
    campaignId: 'campaign.assembly-other',
    saveId: 'save.assembly-other',
    name: 'Assembly other campaign',
    createNew: true,
  });
});
const assemblyRetargeted = await bridge.directiveGenerationInterceptor([], 8192, () => {}, 'normal');
unsubscribeAssemblyRetarget();
assert.equal(assemblyRetargeted.responseStrategy, 'cancelStaleTurn');
assert.equal(assemblyRetargeted.abortDefaultGeneration, true);
assert.deepEqual(
  progressEvents.slice(beforeAssemblyRetarget).filter(event => event.type === 'start').map(event => event.stage),
  ['building-context', 'assembling-prompt'],
  'a chat change after prompt assembly blocks narration before installation',
);
assert.equal(retryDialog.active(), null);
await host.chat.createOrBindCampaignChat({
  ...originalBinding,
  existingChatId: originalBinding.chatId,
  createNew: false,
});
bridge.clearSillyTavernDirectiveRuntimeBridge();
console.log('PASS actual runtime-to-bridge turn progress and stopped prompt ownership');
