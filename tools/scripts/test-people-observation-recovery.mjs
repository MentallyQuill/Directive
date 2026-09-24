import assert from 'node:assert/strict';
import { createMissionAcceptedPairInterpreter, parseMissionAcceptedPairInterpretationOutput, MISSION_EVIDENCE_INTERPRETATION_KIND } from '../../src/mission/v1/accepted-pair-interpreter.mjs';
const quote='Saye accepted the test conditions and finalized the schedule.';
const sourcePair={previousAssistant:{text:quote,messageId:'assistant.1',textHash:'a'.repeat(64)},currentPlayer:{text:'I acknowledge the agreed schedule.',messageId:'player.1',textHash:'b'.repeat(64)}};
const candidatePacket={missionId:'mission.test',branchId:'save.test',baseRevision:0,candidates:[{id:'policy.schedule',sourceSlots:['previousAssistant']}]};
const peopleContext={knownPeople:[{id:'cross',name:'Cross'},{id:'saye',name:'Saye'}]};
const event={type:'relationshipEvidence',personRef:'saye',summary:'Accepted the schedule.',sourceSlot:'previousAssistant',evidenceQuote:quote};
const extra={...event,personRef:'cross',summary:'The conditions were accepted.'};
const initial={kind:MISSION_EVIDENCE_INTERPRETATION_KIND,assistantAcceptance:'accepted',claims:[{candidateId:'policy.schedule',sourceSlot:'previousAssistant',evidenceQuote:quote}],peopleEvents:[event],abstained:false,time:{decision:'unchanged',basis:'noPassage',elapsedSeconds:0,reason:'No passage.',confidence:1}};
const limits={interpreterMaxDurableSelections:1,interpreterMaxPeopleEvents:3};
const parsed=parseMissionAcceptedPairInterpretationOutput(initial,{candidatePacket,sourcePair,peopleContext,limits});
assert.equal(parsed.ok,false,'overflow must not succeed by dropping an observed relationship');
assert.equal(parsed.reasonCode,'people-observation-overflow');
const recovery={kind:'directive.peopleObservationRecovery.v1',coverage:'complete',peopleEvents:[event,extra]};
const run=async(first,second,signal)=>{
 let calls=0;const requests=[];
 const interpreter=createMissionAcceptedPairInterpreter({generationRouter:{generate:async(role,request)=>{
  assert.equal(role,'acceptedPairMissionEvidence');requests.push(request);calls++;
  const result=calls===1?first:second;
  if(result instanceof Error) throw result;
  return {ok:true,response:{text:JSON.stringify(result)}};
 }}});
 return {result:await interpreter({candidatePacket,sourcePair,peopleContext,limits,signal}),calls,requests};
};
const success=await run(initial,recovery);
assert.equal(success.result.ok,true,JSON.stringify(success.result));
assert.equal(success.calls,2);
assert.deepEqual(success.result.interpretation.claims,initial.claims);
assert.deepEqual(success.result.interpretation.time,initial.time);
assert.deepEqual(success.result.interpretation.peopleEvents,[event,extra]);
assert.equal(success.result.diagnostics.peopleRecoveryAttempted,true);
assert.equal(success.result.diagnostics.discardedOverflowPeopleEventCount,0);
assert.equal((await run({...initial,peopleEvents:[],peopleCoverage:'overflow'},recovery)).result.ok,true);
assert.equal((await run({...initial,peopleEvents:[]},recovery)).calls,2,'saturated legacy result needs coverage recovery');
assert.equal((await run({...initial,claims:[],abstained:true,peopleCoverage:'complete'},recovery)).calls,1,'complete in-budget result has no extra call');
for(const bad of [new Error('offline'),{...recovery,coverage:'overflow'},{...recovery,peopleEvents:[extra]},{...recovery,peopleEvents:[event,{...extra,evidenceQuote:'A fabricated outcome with sufficient length.'}]},{...recovery,claims:[]},{...recovery,peopleEvents:[event,extra,event,extra]}]) {
 const failed=await run(initial,bad);assert.equal(failed.result.ok,false,JSON.stringify(bad));assert.equal(failed.calls,2);assert.equal(failed.result.interpretation,undefined);
}
const malformed=await run({...initial,peopleEvents:[event,{...extra,type:'invented'}]},recovery);
assert.equal(malformed.result.ok,false);assert.equal(malformed.calls,1,'malformed overflow tail must not be hidden or retried as valid');
const introduction={type:'personIntroduced',localRef:'new.saye',name:'Ari',introductionSummary:'Ari introduced herself.',sourceSlot:'previousAssistant',evidenceQuote:quote};
const local={...event,personRef:'new.saye'};
assert.equal((await run({...initial,peopleEvents:[introduction]},{...recovery,peopleEvents:[introduction,local]})).result.ok,true);
assert.equal((await run({...initial,peopleEvents:[introduction]},{...recovery,peopleEvents:[{...introduction,localRef:'renamed'},local]})).result.ok,false);
const controller=new AbortController();let calls=0;
const cancelled=createMissionAcceptedPairInterpreter({generationRouter:{generate:async()=>{calls++;if(calls===2)controller.abort();return {ok:true,response:{text:JSON.stringify(calls===1?initial:recovery)}};}}});
assert.equal((await cancelled({candidatePacket,sourcePair,peopleContext,limits,signal:controller.signal})).ok,false);
console.log('People overflow recovery preserves observations and fails atomically.');
