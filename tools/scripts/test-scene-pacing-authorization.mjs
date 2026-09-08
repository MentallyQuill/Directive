import assert from 'node:assert/strict';
import {createV1MissionRuntime} from '../../src/runtime/v1-mission-runtime.mjs';
import {createStateDeltaGateway} from '../../src/runtime/state-delta-gateway.mjs';
import {createAshesInitialState,loadAshesRuntimeAssets} from './v1-test-fixtures.mjs';

const runtimeAssets=loadAshesRuntimeAssets();
const definition=runtimeAssets.missionDefinitions[0];
const objectiveId='objective.prelude.staff-readiness';
const authorizationId=definition.objectives.find(objective=>objective.id===objectiveId).scenePacing.authorizationOutcomeId;
let state=createAshesInitialState({campaignId:'pacing.authorization',saveId:'pacing.authorization',chatId:'pacing.authorization'});
const gateway=createStateDeltaGateway({getState:()=>state,setState:next=>{state=next;},persist:async()=>{}});
let output;
let calls=0;
const runtime=createV1MissionRuntime({getState:()=>state,stateDeltaGateway:gateway,generationRouter:{generate:async()=>{calls++;return {ok:true,response:{text:JSON.stringify(output)}};}}});
async function pair(number,{objective=objectiveId,intent='continue',accepted=true}={}) {
    const player=intent==='delegate' ? 'I delegate this assessment to my staff.' : intent==='leave' ? 'Let us leave this discussion and return to readiness.' : 'I want to discuss the work before proceeding.';
    output={kind:'directive.missionEvidenceInterpretation.v1',assistantAcceptance:accepted?'accepted':'rejected',claims:[],peopleEvents:[],abstained:true,
        time:{decision:'unchanged',basis:'noPassage',elapsedSeconds:0,reason:'scripted instant',confidence:0.9},
        scenePacing:{objectiveId:objective,intent,intentQuote:intent==='continue'?'':player,missionDepartureQuote:'',unresolved:'Discussion remains open.',participation:[]}};
    const result=await runtime.settleAcceptedPair({runtimeAssets,snapshot:{kind:'directive.acceptedPairSnapshot.v1',
        envelope:{campaignId:'pacing.authorization',saveId:'pacing.authorization',chatId:'pacing.authorization',packageId:definition.packageBinding.packageId,packageVersion:definition.packageBinding.packageVersion,activeMissionId:definition.packageBinding.sourceId},
        source:{sourceRangeHash:`authorization.${number}`,previousAssistant:{hostMessageId:`a${number}`,text:'The staff await a decision about the work.',textHash:'abcd1234',sourceIntegrity:'clean',selectedVariant:{selectedTextHash:'abcd1234',sourceIntegrity:'clean'}},
            currentPlayer:{hostMessageId:`p${number}`,text:player,textHash:'abcd5678',sourceIntegrity:'clean'}}}});
    assert.equal(result.ok,true,JSON.stringify(result));
}
await pair(1,{intent:'delegate'});
await pair(2,{objective:'objective.prelude.command-handover'});
assert.equal(state.mission.v1.outcomes[authorizationId],'authorized');
await pair(3,{objective:'objective.prelude.command-handover',accepted:false});
assert.equal(state.mission.v1.outcomes[authorizationId],'authorized','rejecting another response must not revoke an off-scene delegation');
await pair(4,{objective:'objective.prelude.command-handover',intent:'leave'});
assert.equal(state.storySettlement.episodes.find(episode=>episode.id===state.storySettlement.activeEpisode).boundaryState.checkpointSequence,0,
    'pacing bookkeeping must not accelerate the existing model review cadence');
await pair(5);
await pair(6);
assert.equal(state.mission.v1.outcomes[authorizationId],'held','returning to discuss delegated work revokes completion permission');
await pair(7,{intent:'delegate'});
await pair(8);
assert.equal(state.mission.v1.outcomes[authorizationId],'authorized','a renewed delegation must not collide with the earlier authorization evidence key');
const authorizations=state.mission.v1.evidenceLog.filter(entry=>entry.targetId===authorizationId && entry.value==='authorized');
assert.equal(authorizations.length,2);
assert.notEqual(authorizations[0].evidenceKey,authorizations[1].evidenceKey);
assert.equal(calls,8,'authorization transitions do not add Utility calls');
console.log('Delegation, revocation, rejection, and renewed authorization retain distinct custody.');
