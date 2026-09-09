import assert from 'node:assert/strict';
import {createFakeDirectiveHost,createFakeGenerationClient} from '../../src/hosts/fake/fake-host.mjs';
import {createDirectiveRuntimeApp} from '../../src/runtime/runtime-app.mjs';
import {loadAshesRuntimeAssets} from './v1-test-fixtures.mjs';
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
    return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('canceled')),{once:true}));
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
const third=host.chat.pushPlayerMessage({text:'I ask whether the medical supplies can be transferred first.'});
const next=await app.getChatTurnOrchestrator().interceptGeneration({type:'normal'});
assert.equal(signal.aborted,true,'next turn cancels optional authoring');
assert.equal(next.abortDefaultGeneration,false,'a stalled biography cannot block the next narration gate');
assert.equal(authorCalls,1);
state=(await app.getCurrentView({tabId:'people'})).campaignState;
assert.ok(state.storySettlement.episodes.flatMap(e=>e.peopleEvents).some(e=>e.type==='personIntroduced'&&e.name==='Lieutenant Vale'));
assert.equal(generation.calls().filter(c=>c.role==='episodeEvaluator').length,0);

const reloaded=createDirectiveRuntimeApp({host,packageLoader:async()=>loadAshesRuntimeAssets(),idFactory:prefix=>`${prefix}.reload.${++sequence}`,now:()=> '2026-09-08T04:01:00.000Z'});
await reloaded.initialize();
const retry=await reloaded.retryPendingPeopleDossiers();
assert.deepEqual(retry,{ok:true,queued:1},'explicit retry recovers one persisted orphaned in-flight job');
host.chat.pushAssistantMessage({text:'Vale agrees to prioritize the medical transfer.',metadata:{promptingPlayerHostMessageId:third.hostMessageId}});
await reloaded.handleHostGenerationEnded();
await enrichmentRequested;
const enrichmentDeadline=Date.now()+2000;
while(Date.now()<enrichmentDeadline){
  state=(await reloaded.getCurrentView({tabId:'people'})).campaignState;
  if(state.storySettlement.pendingDossiers.length===0)break;
  await new Promise(resolve=>setTimeout(resolve,10));
}
const vale=state.storySettlement.episodes.flatMap(e=>e.peopleEvents)
  .find(e=>e.type==='personIntroduced'&&e.name==='Lieutenant Vale');
assert.equal(authorCalls,2,'reload does not automatically retry the orphan; the explicit action makes one request');
assert.equal(state.storySettlement.pendingDossiers.length,0);
assert.equal(vale.publicFacts.role,'Transfer liaison');
assert.equal(vale.publicFacts.profileSummary,'A public-facing transfer liaison.');
console.log('Idle dossier runtime scheduling and next-turn cancellation tests passed.');
