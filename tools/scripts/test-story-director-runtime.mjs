import assert from 'node:assert/strict';
import {createFakeDirectiveHost,createFakeGenerationClient,createFakePromptAdapter} from '../../src/hosts/fake/fake-host.mjs';
import {createDirectiveRuntimeApp} from '../../src/runtime/runtime-app.mjs';
import {loadAshesRuntimeAssets} from './v1-test-fixtures.mjs';
const deferred = () => {let resolve; return {promise:new Promise(r=>{resolve=r;}),resolve:value=>resolve(value)};};
const directorStarted = deferred(); const interpreterStarted = deferred(); const gate = deferred();
const defaults = createFakeGenerationClient();
let directorCalls=0; let interpreterCalls=0; let failDirector=true; let failPrompt=false;
let holdBoth=false;
const heldStarts={interpreter:deferred(),director:deferred()};
const heldSignals={};
function holdRole(role,signal) {
  heldSignals[role]=signal; heldStarts[role].resolve();
  return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true}));
}
const generation=createFakeGenerationClient({responses:{
  storyDirector:async ({request,rawOptions})=>{directorCalls++; directorStarted.resolve(); if(holdBoth)return holdRole('director',rawOptions.signal); await gate.promise; if(failDirector) return {text:'{}'}; return defaults.generate('storyDirector',request);},
  acceptedPairMissionEvidence:async ({rawOptions})=>{interpreterCalls++; interpreterStarted.resolve(); if(holdBoth)return holdRole('interpreter',rawOptions.signal); return {text:JSON.stringify({kind:'directive.missionEvidenceInterpretation.v1',assistantAcceptance:'accepted',claims:[],abstained:true,time:{decision:'unchanged',basis:'noPassage',elapsedSeconds:0,reason:'same-second',confidence:0.9}})};},
}});
const prompt=createFakePromptAdapter();
const host=createFakeDirectiveHost({chatNative:true,generation,prompt:{...prompt,install:async request=>failPrompt?{ok:false}:prompt.install(request)}});
let sequence=0;
const app=createDirectiveRuntimeApp({host,packageLoader:async()=>loadAshesRuntimeAssets(),idFactory:prefix=>`${prefix}.${++sequence}`,now:()=> '2026-09-08T04:00:00.000Z'});
await app.initialize(); await app.startCreatorDraft();
await app.saveCreatorDraft({patch:{activeStep:'review',input:{
  identity:{name:'Director Tester',pronounsOrAddress:'they/them',speciesId:'human',ageBandId:'mid-career',appearance:'Attentive.'},
  service:{careerBackgroundId:'tactical-security',formativeExperienceId:'dominion-war-fleet-service',assignmentReasonId:'experienced-outsider-transfer'},
  personality:{traits:{insight:'perceptive',connection:'candid',execution:'decisive'},flawId:'impatient'},
  dossier:{briefBiography:'A command officer committed to reconstruction.',publicReputation:'An attentive command officer.'},
}}});
await app.acceptCreatorDraftAndStartCampaign();
const prior=host.chat.pushPlayerMessage({text:'I ask about the resupply schedule.'});
host.chat.pushAssistantMessage({text:'The fleet tender Ravenna offers a resupply transfer at fourteen hundred.',metadata:{promptingPlayerHostMessageId:prior.hostMessageId}});
host.chat.pushPlayerMessage({text:'What flexibility do we have with the transfer?'});
const stateBefore=(await app.getCurrentView({tabId:'mission'})).campaignState;
let handedOff=false;
const pending=app.getChatTurnOrchestrator().interceptGeneration({type:'normal'}).then(r=>{handedOff=r.abortDefaultGeneration===false; return r;});
await Promise.race([Promise.all([directorStarted.promise,interpreterStarted.promise]),pending.then(result=>{throw new Error(`Turn returned before both roles started: ${JSON.stringify(result)}`);})]);
assert.equal(handedOff,false);
assert.deepEqual((await app.getCurrentView({tabId:'mission'})).campaignState,stateBefore,'both analyses are read-only while director is pending');
gate.resolve(); assert.equal((await pending).abortDefaultGeneration,true);
assert.equal(interpreterCalls,1); assert.equal(directorCalls,1);
assert.equal((await app.getChatTurnOrchestrator().interceptGeneration({type:'normal'})).abortDefaultGeneration,true);
assert.equal(directorCalls,2,'Generate retries the failed role once, without a retry loop');
assert.equal(interpreterCalls,1,'Generate reuses the successful interpreter');
failDirector=false;
assert.equal((await app.getChatTurnOrchestrator().interceptGeneration({type:'normal'})).abortDefaultGeneration,false);
assert.equal(interpreterCalls,1,'retry reuses the successful exact-input interpreter');
assert.equal(directorCalls,3);
const committed=(await app.getCurrentView({tabId:'mission'})).campaignState;
assert.equal(committed.stateCustody.revision,stateBefore.stateCustody.revision+1,'both results share one custody commit');
assert.equal(committed.storySettlement.directorReceipts.length,1);
failPrompt=true;
await assert.rejects(()=>app.getChatTurnOrchestrator().interceptGeneration({type:'normal'}),/install/);
failPrompt=false;
assert.equal((await app.getChatTurnOrchestrator().interceptGeneration({type:'normal'})).abortDefaultGeneration,false);
assert.equal((await app.getCurrentView({tabId:'mission'})).campaignState.stateCustody.revision,committed.stateCustody.revision);
assert.equal(directorCalls,3,'prompt retries do not rerun committed analysis');
await app.handleHostGenerationEnded();
assert.equal(generation.calls().filter(c=>c.role==='episodeEvaluator').length,0);
holdBoth=true;
const latest=await host.chat.getLatestPlayerMessage();
host.chat.pushAssistantMessage({text:'The tender captain asks which supplies should take priority.',metadata:{promptingPlayerHostMessageId:latest.hostMessageId}});
host.chat.pushPlayerMessage({text:'I ask whether medical supplies can be transferred first.'});
const stopped=app.getChatTurnOrchestrator().interceptGeneration({type:'normal'});
await Promise.all([heldStarts.interpreter.promise,heldStarts.director.promise]);
await app.handleHostGenerationStopped();
assert.equal(heldSignals.interpreter.aborted,true); assert.equal(heldSignals.director.aborted,true);
assert.equal((await stopped).abortDefaultGeneration,true);
assert.equal((await app.getCurrentView({tabId:'mission'})).campaignState.stateCustody.revision,committed.stateCustody.revision);
console.log('Story director app gate, recovery and atomic commit tests passed.');

for (const mutation of ['source-edit', 'chat-switch']) {
  const starts = { interpreter: deferred(), director: deferred() };
  const signals = {};
  const hold = (role, signal) => {
    signals[role] = signal;
    starts[role].resolve();
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => {
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    }, { once: true }));
  };
  const mutationHost = createFakeDirectiveHost({ chatNative: true, generation: createFakeGenerationClient({ responses: {
    acceptedPairMissionEvidence: ({ rawOptions }) => hold('interpreter', rawOptions.signal),
    storyDirector: ({ rawOptions }) => hold('director', rawOptions.signal),
  } }) });
  const mutationApp = createDirectiveRuntimeApp({ host: mutationHost, packageLoader: async () => loadAshesRuntimeAssets(),
    idFactory: prefix => `${prefix}.${++sequence}`, now: () => '2026-09-08T04:00:00.000Z' });
  await mutationApp.initialize();
  await mutationApp.startCreatorDraft();
  await mutationApp.saveCreatorDraft({ patch: { activeStep: 'review', input: {
    identity: { name: 'Mutation Tester', pronounsOrAddress: 'they/them', speciesId: 'human', ageBandId: 'mid-career', appearance: 'Attentive.' },
    service: { careerBackgroundId: 'tactical-security', formativeExperienceId: 'dominion-war-fleet-service', assignmentReasonId: 'experienced-outsider-transfer' },
    personality: { traits: { insight: 'perceptive', connection: 'candid', execution: 'decisive' }, flawId: 'impatient' },
    dossier: { briefBiography: 'A command officer committed to reconstruction.', publicReputation: 'An attentive command officer.' },
  } } });
  await mutationApp.acceptCreatorDraftAndStartCampaign();
  const firstPlayer = mutationHost.chat.pushPlayerMessage({ text: 'I ask about the transfer.' });
  const source = mutationHost.chat.pushAssistantMessage({ text: 'The tender awaits instructions.', metadata: { promptingPlayerHostMessageId: firstPlayer.hostMessageId } });
  mutationHost.chat.pushPlayerMessage({ text: 'I request medical supplies.' });
  const beforeMutation = (await mutationApp.getCurrentView({ tabId: 'mission' })).campaignState;
  const analyzing = mutationApp.getChatTurnOrchestrator().interceptGeneration({ type: 'normal' });
  await Promise.all([starts.interpreter.promise, starts.director.promise]);
  if (mutation === 'chat-switch') mutationHost.chat.setCurrentChatId('unbound-mutation-test');
  const changed = mutation === 'source-edit'
    ? mutationApp.handleHostMessageEdited({ message: source })
    : mutationApp.handleHostChatChanged();
  assert.equal(signals.interpreter.aborted, true, `${mutation} cancels interpreter before queued reconciliation`);
  assert.equal(signals.director.aborted, true, `${mutation} cancels director before queued reconciliation`);
  assert.equal((await analyzing).abortDefaultGeneration, true);
  await changed;
  const afterMutation = (await mutationApp.getCurrentView({ tabId: 'mission' })).campaignState;
  if (afterMutation) {
    assert.deepEqual(afterMutation.storySettlement.directorReceipts || [], beforeMutation.storySettlement.directorReceipts || [], 'stale direction is never committed');
    assert.deepEqual(afterMutation.storySettlement.episodes, beforeMutation.storySettlement.episodes, 'stale accepted pair is never committed');
  }
}
console.log('Source mutation and chat-switch cancellation tests passed.');
