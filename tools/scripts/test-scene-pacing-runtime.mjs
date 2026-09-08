import assert from 'node:assert/strict';
import {createV1MissionRuntime,buildV1RuntimePlayerProjection} from '../../src/runtime/v1-mission-runtime.mjs';
import {encodeV1StateDelta,applyV1StateDelta} from '../../src/storage/v1-state-delta-codec.mjs';
import {createStateDeltaGateway} from '../../src/runtime/state-delta-gateway.mjs';
import {createMissionState} from '../../src/mission/v1/mission-state.mjs';
import {createInitialMissionJourney} from '../../src/mission/v1/mission-journey.mjs';
import {createAshesInitialState,loadAshesRuntimeAssets} from './v1-test-fixtures.mjs';
const runtimeAssets = loadAshesRuntimeAssets();
const definition = runtimeAssets.missionDefinitions[0];
// Shorten only this fixture's mission closure to exercise the real transition
// boundary after the canonical handover scene and its aftermath.
definition.closeWhen={any:[{objectiveDisposition:{id:'objective.prelude.command-handover',in:['completed']}},definition.closeWhen]};
definition.terminalDispositions[0].when=true;
definition.transitions[0].when=true;
let state = createAshesInitialState({campaignId:'campaign.pacing',saveId:'save.pacing',chatId:'chat.pacing'});
const journey = createInitialMissionJourney({definition,branchId:'save.pacing'});
state.mission = {activeMissionId:definition.packageBinding.sourceId,v1:createMissionState({definition,branchId:'save.pacing'}),v1Journey:journey.journey,v1History:journey.history};
let calls = 0;
let nextObservation = null;
let nextClaims = [];
const gateway = createStateDeltaGateway({getState:()=>state,setState:next=>{state=next;},persist:async()=>{},now:()=> '2026-09-08T15:00:00.000Z'});
const runtime = createV1MissionRuntime({getState:()=>state,stateDeltaGateway:gateway,generationRouter:{async generate(role,request){
    calls++;
    assert.equal(role,'acceptedPairMissionEvidence','pacing must not add a role or call');
    assert.ok(request.jsonSchema.properties.scenePacing,'runtime supplies pacing context to the existing Utility call');
    return {ok:true,response:{text:JSON.stringify({kind:'directive.missionEvidenceInterpretation.v1',assistantAcceptance:'accepted',claims:nextClaims,peopleEvents:[],abstained:!nextClaims.length,time:{decision:'unchanged',basis:'noPassage',elapsedSeconds:0,reason:'same instant in scripted test',confidence:0.9},scenePacing:nextObservation || {objectiveId:'objective.prelude.command-handover',intent:'continue',intentQuote:'',unresolved:'The command handover has not begun.',participation:[]}})}};
}}});
const snapshot = {kind:'directive.acceptedPairSnapshot.v1',envelope:{campaignId:'campaign.pacing',saveId:'save.pacing',chatId:'chat.pacing',packageId:definition.packageBinding.packageId,packageVersion:definition.packageBinding.packageVersion,activeMissionId:definition.packageBinding.sourceId},source:{sourceRangeHash:'range.pacing.1',previousAssistant:{hostMessageId:'2',text:'What are your first impressions of the ship?',textHash:'a1b2c3d4',sourceIntegrity:'clean',selectedVariant:{selectedTextHash:'a1b2c3d4',sourceIntegrity:'clean'}},currentPlayer:{hostMessageId:'3',text:'The refit looks rushed. I would like to know how deep it goes.',textHash:'b1c2d3e4',sourceIntegrity:'clean'}}};
const beforeFirstPair = structuredClone(state);
const result = await runtime.settleAcceptedPair({runtimeAssets,snapshot});
assert.equal(result.ok,true,JSON.stringify(result));
const persistedDelta = await encodeV1StateDelta({
    saveId:'save.pacing',before:beforeFirstPair,after:state,
    changedRoots:Object.keys(state),createdAt:'2026-09-08T15:00:00.000Z',
});
const reloaded = await applyV1StateDelta({saveId:'save.pacing',state:beforeFirstPair,delta:persistedDelta});
assert.deepEqual(reloaded,state,'storage preserves the settled campaign values');
const reloadedProjection = buildV1RuntimePlayerProjection({campaignState:reloaded,runtimeAssets});
assert.equal(reloadedProjection.ok,true,JSON.stringify(reloadedProjection));
const alteredOutcome = structuredClone(reloaded);
alteredOutcome.mission.v1.outcomes['outcome.scene-pacing.prelude.command-handover.authorization'] = 'authorized';
assert.equal(buildV1RuntimePlayerProjection({campaignState:alteredOutcome,runtimeAssets}).reasonCode,'projection-state-invalid',
    'a real outcome change without accepted evidence must still fail');
state = reloaded;
assert.equal(calls,1);
assert.equal(state.storySettlement.acceptedPairReceipts.at(-1).scenePacing.objectiveId,'objective.prelude.command-handover');
assert.equal(state.storySettlement.acceptedPairReceipts.at(-1).scenePacing.ready,false);
assert.equal(state.mission.v1.worldFacts.includes('fact.hesperus.distress-established'),false,'distress must not exist merely because one pair settled');
assert.equal((await runtime.settleAcceptedPair({runtimeAssets,snapshot})).ok,true);
assert.equal(calls,1,'duplicate settlement does not repeat the Utility call');
async function pair(number,assistant,player,observation,claims=[]) {
    nextObservation={objectiveId:'objective.prelude.command-handover',intent:'continue',intentQuote:'',unresolved:'',participation:[],...observation};
    nextClaims=claims;
    const next=structuredClone(snapshot);
    next.source.sourceRangeHash=`range.pacing.${number}`;
    next.source.previousAssistant={...next.source.previousAssistant,hostMessageId:String(number*2),text:assistant};
    next.source.currentPlayer={...next.source.currentPlayer,hostMessageId:String(number*2+1),text:player};
    const result=await runtime.settleAcceptedPair({runtimeAssets,snapshot:next});
    assert.equal(result.ok,true,JSON.stringify(result));
    return result;
}
await pair(2,'Which authority and escalation boundaries do you need?','I need watch assignments and personnel coordination; I will escalate tactical orders.',{
    unresolved:'Whitaker must respond to the requested authority.',participation:[{requirement:0,playerQuote:'I need watch assignments and personnel coordination;',assistantQuote:'Which authority and escalation boundaries do you need?'}],
});
await pair(3,'Whitaker and the XO settle authority, escalation, and working-boundary terms. The proposed watch assignments are yours.','I accept these terms. Please complete the authority transfer.',{
    intent:'resolve',intentQuote:'Please complete the authority transfer.',participation:[{requirement:1,playerQuote:'I accept these terms.',assistantQuote:'The proposed watch assignments are yours.'}],
},[{candidateId:'policy.prelude.command-handover-terms-settled',sourceSlot:'previousAssistant',evidenceQuote:'Whitaker and the XO settle authority, escalation, and working-boundary terms.'}]);
assert.equal(state.storySettlement.acceptedPairReceipts.at(-1).scenePacing.ready,true);
await pair(4,'Whitaker completes the practical XO authority and watch transfer.','Before we leave, I have another question about the crew.',{
    unresolved:'The player has another crew question.',
},[{candidateId:'policy.prelude.command-handover-completed',sourceSlot:'previousAssistant',evidenceQuote:'Whitaker completes the practical XO authority and watch transfer.'}]);
assert.equal(state.mission.v1.objectives['objective.prelude.command-handover'].state,'terminal','earned completion remains complete while conversation continues');
await pair(5,'Whitaker answers the question and waits for a follow-up.','Tell me more about the engineering staff.',{unresolved:'The player is continuing the conversation.'});
assert.equal(state.mission.v1.worldFacts.includes('fact.hesperus.distress-established'),true,'the disturbance can arise after the actual handover');
const report = runtime.preparePendingDutyReport({runtimeAssets,availableActors:[{id:'priya-nayar',capabilityRoles:['operations']}],responseId:'response.test',sourceTransactionId:'generation.test'});
assert.equal(report.status,'no-pending-report','completed handover does not interrupt an ongoing follow-up');
await pair(6,'Whitaker finishes explaining the engineering team.','Thank you. Let us finish this meeting and return to duty.',{intent:'leave',intentQuote:'Let us finish this meeting and return to duty.'});
assert.equal(runtime.preparePendingDutyReport({runtimeAssets,availableActors:[{id:'priya-nayar',capabilityRoles:['operations']}],responseId:'response.next',sourceTransactionId:'generation.next'}).status,'ready','departure can release the next development');
assert.equal(calls,6,'six accepted pairs used six Utility calls total');
const reorderedEvidence = structuredClone(state);
reorderedEvidence.mission.v1.acceptedEvidenceKeys.reverse();
assert.equal(buildV1RuntimePlayerProjection({campaignState:reorderedEvidence,runtimeAssets}).reasonCode,'projection-state-invalid',
    'ordered evidence arrays must still match replay');
assert.equal(state.mission.v1.status,'terminal');
assert.equal(runtime.prepareTransitionNarration({runtimeAssets}).reasonCode,'scene-still-open');
assert.equal((await runtime.activatePendingTransition({runtimeAssets})).reasonCode,'scene-still-open');
await pair(7,'Whitaker confirms the assignment is concluded and awaits your departure.','Let us conclude this assignment and move on to the next mission.',{
    intent:'leave',intentQuote:'Let us conclude this assignment and move on to the next mission.',missionDepartureQuote:'Let us conclude this assignment and move on to the next mission.',
});
assert.notEqual(state.mission.v1.definitionId,definition.id,'explicit mission departure activates the successor');
assert.equal(runtime.prepareTransitionNarration({runtimeAssets}).status,'ready','successor pacing must not block the authorized source transition');
assert.equal(calls,7,'transition authorization still reuses the same one-call-per-pair path');
const participant = state.storySettlement.acceptedPairReceipts.find(receipt=>receipt.currentPlayer.messageId==='5').sourceContributionIds.at(-1);
const completion = state.mission.v1History[0].state.evidenceLog.find(entry=>entry.targetId==='event.prelude.command-handover-completed');
assert.ok(completion.pacingSourceContributionIds?.includes(participant),'completion retains its participation dependencies for source recovery');
const beforeInvalidation=structuredClone(state);
for (const hostMessageId of ['5','3']) {
    state=structuredClone(beforeInvalidation);
    const invalidated = await runtime.invalidateSourceMutation({runtimeAssets,hostMessageId});
    assert.equal(invalidated.ok,true,JSON.stringify(invalidated));
    assert.equal(state.mission.v1.events.includes('event.prelude.command-handover-completed'),false,'invalidating participation or its prior scene context retracts dependent completion');
    assert.equal(state.storySettlement.acceptedPairReceipts.some(receipt=>receipt.scenePacing?.ready),false,'dependent readiness cannot survive invalidation');
}
console.log('Runtime pacing persists with exactly one existing Utility call.');
