import assert from 'node:assert/strict';
import {createFakeDirectiveHost,createFakeGenerationClient} from '../../src/hosts/fake/fake-host.mjs';
import {createDirectiveRuntimeApp} from '../../src/runtime/runtime-app.mjs';
import {loadAshesRuntimeAssets} from './v1-test-fixtures.mjs';
async function runScenario({ drain = false, ignoreAbort = false } = {}) {
let finishCanceledAuthor;
let signal; let started; let enrichmentStarted;
const authorStarted=new Promise(resolve=>{started=resolve;});
const enrichmentRequested=new Promise(resolve=>{enrichmentStarted=resolve;});
let authorCalls=0; let pairCalls=0; let authoredPersonId=null;
const introduction='I am Lieutenant Vale, the transfer liaison assigned to your resupply.';
const generation=createFakeGenerationClient({responses:{
  acceptedPairMissionEvidence:async()=>({text:JSON.stringify({
    kind:'directive.missionEvidenceInterpretation.v1',assistantAcceptance:'accepted',claims:[],abstained:true,
    time:{decision:'unchanged',basis:'noPassage',elapsedSeconds:0,reason:'same-second',confidence:0.9},
    peopleEvents:++pairCalls===1?[{type:'personIntroduced',localRef:'vale',name:'Lieutenant Vale',
      introductionSummary:'The transfer liaison introduced themself.',sourceSlot:'previousAssistant',evidenceQuote:introduction}]:[],
  })}),
  peopleDossierAuthor:({rawOptions})=>{
    authorCalls++; signal=rawOptions.signal; started();
    if(authorCalls>1){enrichmentStarted();return {text:JSON.stringify({
      kind:'directive.peopleDossierBatch.v1',dossiers:[{
        personId:authoredPersonId,displayName:'Lieutenant Vale',role:'Transfer liaison',
        affiliation:'Fleet Logistics',species:'Human',age:'Mid-career',birthplace:'Luna',
        serviceBackground:'Fleet logistics and transfer coordination.',
        assignmentHistory:'Resupply liaison assignments.',profileSummary:'A public-facing transfer liaison.',
      }],
    })};}
    return new Promise((resolve,reject)=>{
      finishCanceledAuthor = resolve;
      if (!ignoreAbort) signal.addEventListener('abort',()=>reject(new Error('canceled')),{once:true});
    });
  },
}});
const host=createFakeDirectiveHost({chatNative:true,generation});
let sequence=0;
const app=createDirectiveRuntimeApp({host,packageLoader:async()=>loadAshesRuntimeAssets(),idFactory:prefix=>`${prefix}.${++sequence}`,now:()=> '2026-09-08T04:00:00.000Z'});
await app.initialize(); await app.startCreatorDraft();
await app.saveCreatorDraft({patch:{activeStep:'review',input:{
  identity:{name:'Dossier Tester',pronounsOrAddress:'they/them',speciesId:'human',ageBandId:'mid-career',appearance:'Attentive.'},
  service:{careerBackgroundId:'tactical-security',formativeExperienceId:'dominion-war-fleet-service',assignmentReasonId:'experienced-outsider-transfer'},
  personality:{traits:{insight:'perceptive',connection:'candid',execution:'decisive'},flawId:'impatient'},
  dossier:{briefBiography:'A command officer committed to reconstruction.',publicReputation:'An attentive command officer.'},
}}});
await app.acceptCreatorDraftAndStartCampaign();
const first=host.chat.pushPlayerMessage({text:'I approach the transfer liaison.'});
host.chat.pushAssistantMessage({text:introduction,metadata:{promptingPlayerHostMessageId:first.hostMessageId}});
const second=host.chat.pushPlayerMessage({text:'I greet Lieutenant Vale and ask about the transfer.'});
assert.equal((await app.getChatTurnOrchestrator().interceptGeneration({type:'normal'})).abortDefaultGeneration,false);
assert.equal(authorCalls,0,'accepted identity and narration do not await full biography');
let state=(await app.getCurrentView({tabId:'people'})).campaignState;
assert.equal(state.storySettlement.pendingDossiers.length,1);
assert.equal(state.storySettlement.pendingDossiers[0].status,'pending');
authoredPersonId=state.storySettlement.pendingDossiers[0].personId;
assert.ok(state.storySettlement.episodes.flatMap(e=>e.peopleEvents).some(e=>e.type==='personIntroduced'&&e.name==='Lieutenant Vale'));
host.chat.pushAssistantMessage({text:'Vale asks which supplies should take priority.',metadata:{promptingPlayerHostMessageId:second.hostMessageId}});
await app.handleHostGenerationStopped();
await app.handleHostGenerationEnded();
await new Promise(resolve => setTimeout(resolve, 20));
assert.equal(authorCalls, 0, 'Stop followed by generation-ended must not restart pending background calls');
assert.equal((await app.getChatTurnOrchestrator().interceptGeneration({type:'normal'})).abortDefaultGeneration, false);
await app.handleHostGenerationEnded();
await authorStarted;
assert.equal(authorCalls,1);

assert.deepEqual(await app.retryPendingPeopleDossiers(), {ok:true,queued:0},
  'a genuinely running biography is not duplicated');
await app.handleHostGenerationStopped();
if (drain) await new Promise(resolve => setImmediate(resolve));
let releaseChatRead;
let chatReadStarted;
const chatReadGate = new Promise(resolve => { releaseChatRead = resolve; });
const chatRead = new Promise(resolve => { chatReadStarted = resolve; });
const originalGetBindingMetadata = host.chat.getBindingMetadata;
host.chat.getBindingMetadata = async (...args) => {
  chatReadStarted();
  await chatReadGate;
  return originalGetBindingMetadata.apply(host.chat, args);
};
const chatChange = app.handleHostChatChanged();
await chatRead;
app.handleHostGenerationStarted({type:'normal'});
releaseChatRead();
await chatChange;
host.chat.getBindingMetadata = originalGetBindingMetadata;
const retry = await app.retryPendingPeopleDossiers();
assert.deepEqual(retry, {ok:true,queued:1}, 'the first explicit Retry includes the staged canceled outcome');
await new Promise(resolve=>setTimeout(resolve,20));
assert.equal(authorCalls,1,'older chat reconciliation cannot release a newer native generation pause');
await app.handleHostGenerationEnded();
const deadline=Date.now()+2000;
while(Date.now()<deadline){
  state=(await app.getCurrentView({tabId:'people'})).campaignState;
  if(state.storySettlement.pendingDossiers.length===0)break;
  await new Promise(resolve=>setTimeout(resolve,10));
}
assert.equal(authorCalls,2,'one explicit retry starts exactly one replacement request');
assert.equal(state.storySettlement.pendingDossiers.length,0);
assert.deepEqual(await app.retryPendingPeopleDossiers(), {ok:true,queued:0});
const vale=state.storySettlement.episodes.flatMap(e=>e.peopleEvents)
  .find(e=>e.type==='personIntroduced'&&e.name==='Lieutenant Vale');
assert.equal(vale.publicFacts.role,'Transfer liaison');
await app.handleHostGenerationStopped();
finishCanceledAuthor({text:'late canceled transport'});
}
await runScenario();
await runScenario({drain:true,ignoreAbort:true});
console.log('Canceled dossier first-retry runtime tests passed (immediate and drained abort-ignoring transport).');
