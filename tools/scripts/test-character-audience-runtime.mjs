import { materializeContinuityChanges } from '../../src/story/continuity-events.mjs';
import assert from 'node:assert/strict';
import { createCharacterSceneCoordinator } from '../../src/runtime/character-scene-coordinator.mjs';
import { makeAudienceFixture } from './character-audience-test-fixtures.mjs';
import { materializeCharacterSceneAdmission } from '../../src/story/character-scene-admission.mjs';
import { createTurnAttemptBudget } from '../../src/generation/turn-attempt-budget.mjs';
const fixture=makeAudienceFixture();
const scene=materializeCharacterSceneAdmission(fixture.admission,{sourcePair:fixture.sourcePair,knownPersonIds:new Set(fixture.snapshot.characters.keys()),explicitAudience:new Map()});
let actorCalls=0;
assert.throws(()=>createCharacterSceneCoordinator({responder:{respond(){actorCalls++;}}}).createFlight({...fixture,participants:scene.participants,plan:scene.plan,playerId:fixture.admission.playerId,identity:{bindingKey:'chat.audit',branchId:'save.archive-audit',sourceDigest:'a'.repeat(64),settingsDigest:'b'.repeat(64),epoch:1},budget:createTurnAttemptBudget(),isCurrent:()=>true}),{code:'DIRECTIVE_CHARACTER_AUDIENCE_INVALID'});
assert.equal(actorCalls,0);
console.log('character audience runtime tests passed');
import { prepareProtectedCharacterTurn } from '../../src/runtime/protected-character-turn.mjs';
import { audienceTestCapacity, audienceTestResponse } from './character-audience-test-fixtures.mjs';
import { captureV1StorySource } from '../../src/runtime/v1-accepted-pair-source.mjs';
import { createV1AcceptedPairReceipt } from '../../src/runtime/v1-accepted-pair-receipt.mjs';
import { prepareCharacterAudienceInput } from '../../src/runtime/character-audience-preparation.mjs';
import { createCharacterAudienceReviewer } from '../../src/story/character-audience-reviewer.mjs';

for(const mode of ['scene-attack','archive-attack','pass','budget','stop','stale','long-source','missing-history','over-budget']) {
 const f=makeAudienceFixture();
 // Source-backed historical public schedule, distinct from the current private revision.
 const oldText='Captain Whitaker says, "Your current check-in is 21:17 in the observation lounge, Commander."';
 const oldRows=[{id:'old.assistant',mes:oldText,is_user:false,swipe_id:0,swipes:[oldText]},{id:'old.player',mes:'I acknowledge the old schedule.',is_user:true}];
 const oldPair=Object.fromEntries(['previousAssistant','currentPlayer'].map((slot,i)=>{const {role,...source}=captureV1StorySource(oldRows[i]).value;return [slot,source];}));
 const oldQuote='Your current check-in is 21:17 in the observation lounge, Commander.';
 const oldChanges=[{operation:'open',localRef:'old-schedule',title:'Old schedule',category:'schedule',sourceSlot:'previousAssistant',evidenceQuote:oldQuote},{operation:'addFact',threadRef:'old-schedule',text:oldQuote,claimType:'character-claim',authoredRef:null,supersedesFactId:null,sourceSlot:'previousAssistant',evidenceQuote:oldQuote,informationAccess:{recipientIds:['mara-whitaker'],acquisition:'heard',audienceEvidence:[{sourceSlot:'previousAssistant',evidenceQuote:oldText}]}}];
 const oldEvents=await materializeContinuityChanges({changes:oldChanges,sourcePair:oldPair,assistantAccepted:true,contributionIds:{previousAssistant:'old.source.assistant',currentPlayer:'old.source.player'},branchId:'save.archive-audit',sourceRangeHash:'old.pair',existingEvents:[],settledAtRevision:1,knownLinkIds:['mara-whitaker','priya-nayar']});
 f.snapshot.state.storySettlement.continuityEvents.push(...oldEvents);
 f.snapshot.state.storySettlement.acceptedPairReceipts.push(createV1AcceptedPairReceipt({branchId:'save.archive-audit',sourceRangeHash:'old.pair',sourcePair:oldPair,assistantAcceptance:'accepted',sourceContributionIds:['old.source.assistant','old.source.player']}));
 f.snapshot.sourceIdentities.set('old.source.assistant',oldPair.previousAssistant);f.snapshot.sourceIdentities.set('old.source.player',oldPair.currentPlayer);f.messages.push(...oldRows);
 const nayar=f.admission.proposal.participants.find(p=>p.personId==='priya-nayar');
 const whitaker=f.admission.proposal.participants.find(p=>p.personId==='mara-whitaker');
 const privateQuote='Provisional revised check-in: 22:43, observation lounge.';
 const confirmation='Please text back the time and location you have recorded for me. Keep this off the shared calendar; do not relay it to Captain Whitaker yet.';
 nayar.perception=[{acquisition:'read',evidence:{sourceSlot:'currentPlayer',evidenceQuote:privateQuote}},{acquisition:'read',evidence:{sourceSlot:'currentPlayer',evidenceQuote:confirmation}},{acquisition:'heard',evidence:{sourceSlot:'previousAssistant',evidenceQuote:'Commander, I have no private check-in recorded on your evening schedule.'}}];
 nayar.audience=[{personId:f.admission.playerId,acquisition:'read',evidence:[{sourceSlot:'currentPlayer',evidenceQuote:'Please text back the time and location you have recorded for me.'}]}];
 if(mode==='scene-attack') whitaker.perception.push({acquisition:'read',evidence:{sourceSlot:'currentPlayer',evidenceQuote:privateQuote}});
 if(mode==='archive-attack') f.snapshot.state.storySettlement.continuityEvents.find(e=>e.operation==='addFact').payload.informationAccess.recipientIds=['mara-whitaker'];
 if(mode==='long-source') {
  f.messages[1].mes += ' padding'.repeat(400)+' The complete confidentiality qualifier remains here.';
  const {role,...full}=captureV1StorySource(f.messages[1]).value;
  f.sourcePair.currentPlayer=full;
  f.admission.sources.currentPlayer={messageId:full.messageId,selectedSwipeId:full.selectedSwipeId,textHash:full.textHash};
  f.snapshot.state.storySettlement.continuityEvents=[];
 }
 const campaignState={player:{name:'Jonah'},storySettlement:{...f.snapshot.state.storySettlement,activeEpisode:'episode.audit',episodes:[{id:'episode.audit',status:'open',peopleEvents:[],contributions:[...f.snapshot.sourceIdentities].map(([id,source])=>({id,messageId:source.messageId,swipeId:source.selectedSwipeId,textHash:source.textHash,role:source.selectedSwipeId===null?'user':'assistant'}))}]}};
 if(mode==='missing-history') campaignState.storySettlement.acceptedPairReceipts=[];
 const crewDataset={officers:[...f.snapshot.characters].map(([id,person])=>({id,name:person.name,billet:person.role}))};
 const identity={bindingKey:'chat.audit',branchId:'save.archive-audit',sourceDigest:'a'.repeat(64),settingsDigest:'b'.repeat(64),epoch:1};
 let current=true;const stop=new AbortController(),roles=[],packets=[];
 const generation={getRequestCapacity:audienceTestCapacity,async generate(role,request,options){
  roles.push(role);const input=JSON.parse(request.messages[1].content);
  if(role==='characterAudienceReviewer') {
   assert.equal(options.attemptBudget.available,7,'audience and both finalization attempts are reserved before preflight');
   assert.ok(input.evidence.sources.some(s=>s.text.includes('do not relay it to Captain Whitaker yet')));
   if(mode==='long-source')assert.ok(input.evidence.sources.some(s=>s.text.endsWith('The complete confidentiality qualifier remains here.')));
   if(mode==='archive-attack')assert.ok(input.manifest.entries.some(e=>e.origin==='archive'&&e.personId==='mara-whitaker'));
   const response=audienceTestResponse(request,options,mode.endsWith('attack')?'reject':'pass');
   if(mode==='stop')stop.abort();if(mode==='stale')current=false;return response;
  }
  options.attemptBudget.claim();
  if(role==='characterResponder') {
   packets.push(input.packet);
   if(input.packet.personId==='priya-nayar') {assert.ok(JSON.stringify(input.packet).includes(confirmation));assert.ok(JSON.stringify(input.packet).includes(privateQuote));}
   else {assert.ok(!JSON.stringify(input.packet).includes('22:43'));if(mode!=='long-source')assert.ok(JSON.stringify(input.packet).includes('21:17'));}
   const p=input.schema.properties;
   return {text:JSON.stringify({id:p.id.const,personId:input.packet.personId,kind:input.packet.personId==='priya-nayar'?'message':'speech',mode:'ordinary',text:input.packet.personId==='priya-nayar'?'Commander, I have your provisional request for 22:43 in the observation lounge. I will keep it private.':'I still have the old check-in time.',basisIds:[],recipientIds:p.recipientIds.items.enum,dependsOnIds:[]})};
  }
  if(role==='sceneNarrator'){assert.equal(input.contributions.find(c=>c.personId==='priya-nayar').kind,'message');return {text:JSON.stringify({segments:input.contributions.map(c=>({kind:'character',id:c.id}))})};}
  assert.equal(role,'characterKnowledgeReviewer');return {text:JSON.stringify({kind:'directive.characterKnowledgeReview.v1',candidateDigest:input.candidateDigest,supportDigest:input.supportDigest,verdict:'pass',findings:[]})};
 }};
 const sourcePair=structuredClone(f.sourcePair);if(mode==='long-source')sourcePair.currentPlayer.text=sourcePair.currentPlayer.text.slice(0,2500);
 const run=()=>prepareProtectedCharacterTurn({generation,campaignState,crewDataset,messages:f.messages,sourcePair,admission:f.admission,identity,guard:{isCurrent:()=>current},publicationId:'publication.audit',signal:stop.signal,limits:{maxAttempts:mode==='budget'?4:mode==='over-budget'?100:10}});
 if(['pass','long-source','over-budget'].includes(mode)){const turn=await run();assert.deepEqual(roles,['characterAudienceReviewer','characterResponder','characterResponder','sceneNarrator','characterKnowledgeReviewer']);assert.equal(turn.attempts,5);turn.dispose();}
 else {await assert.rejects(run);assert.equal(packets.length,0);assert.equal(roles.length,['budget','missing-history'].includes(mode)?0:1);}
}
console.log('PASS actual protected pipeline rejects scene/archive attacks before actors and admits complete private typed request');

// Frozen packets survive caller archive expansion; preparation mutation invalidates capability.
const frozen=makeAudienceFixture();frozen.identity={bindingKey:'chat.audit',branchId:'save.archive-audit',sourceDigest:'a'.repeat(64),settingsDigest:'b'.repeat(64),epoch:1};
const prepared=prepareCharacterAudienceInput(frozen), budget=createTurnAttemptBudget();
const {capability}=await createCharacterAudienceReviewer({generation:{getRequestCapacity:audienceTestCapacity,generate:async(_role,request,options)=>audienceTestResponse(request,options)}}).review({prepared,budget,reservation:budget.reserve('audience',1),isCurrent:()=>true});
const approvedScene=materializeCharacterSceneAdmission(frozen.admission,{sourcePair:frozen.sourcePair,knownPersonIds:new Set(frozen.snapshot.characters.keys())});
const flightArgs={...frozen,...approvedScene,playerId:frozen.admission.playerId,budget,isCurrent:()=>true,audiencePreparation:prepared,audienceAdmission:capability};
assert.throws(()=>createCharacterSceneCoordinator({responder:{respond(){}}}).createFlight({...flightArgs,plan:approvedScene.plan.slice(0,1)}),{code:'DIRECTIVE_CHARACTER_SCENE_STALE'});
assert.throws(()=>createCharacterSceneCoordinator({responder:{respond(){}}}).createFlight({...flightArgs,audienceAdmission:{}}),{code:'DIRECTIVE_CHARACTER_AUDIENCE_INVALID'});
prepared.preparedByPerson.get('priya-nayar').information.push({id:'injected',text:'Private new grant'});
assert.throws(()=>createCharacterSceneCoordinator({responder:{respond(){}}}).createFlight(flightArgs),{code:'DIRECTIVE_CHARACTER_SCENE_STALE'});
budget.dispose();
console.log('PASS forged capability, changed plan and post-approval packet injection reject');
// The same wrong-recipient attack in an uncommitted current-pair grant is checked.
const provisional=makeAudienceFixture();
provisional.snapshot.state.storySettlement.continuityEvents.find(e=>e.operation==='addFact').payload.informationAccess.recipientIds=['mara-whitaker'];
provisional.provisionalExposures=provisional.snapshot.state.storySettlement.continuityEvents.map((event,order)=>({event,position:{source:{messageId:provisional.sourcePair.currentPlayer.messageId,selectedSwipeId:null,textHash:provisional.sourcePair.currentPlayer.textHash},order}}));
provisional.snapshot.state.storySettlement.continuityEvents=[];provisional.snapshot.state.storySettlement.acceptedPairReceipts=[];provisional.snapshot.sourceIdentities=new Map();
const provisionalPrepared=prepareCharacterAudienceInput(provisional),provisionalBudget=createTurnAttemptBudget();let provisionalCalls=0;
await assert.rejects(()=>createCharacterAudienceReviewer({generation:{getRequestCapacity:audienceTestCapacity,async generate(role,request,options){provisionalCalls++;assert.equal(role,'characterAudienceReviewer');assert.ok(JSON.parse(request.messages[1].content).manifest.entries.some(e=>e.origin==='archive'&&e.personId==='mara-whitaker'));return audienceTestResponse(request,options,'reject');}}}).review({prepared:provisionalPrepared,budget:provisionalBudget,reservation:provisionalBudget.reserve('provisional',1),isCurrent:()=>true}),{code:'DIRECTIVE_CHARACTER_AUDIENCE_REJECTED'});
assert.equal(provisionalCalls,1);provisionalBudget.dispose();
console.log('PASS provisional wrong-recipient grant rejects without actor authority');
