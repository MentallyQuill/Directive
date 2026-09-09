import assert from 'node:assert/strict';
import { createMissionAcceptedPairInterpretationSchema, createMissionAcceptedPairInterpretationPrompt, createMissionAcceptedPairInterpreter, parseMissionAcceptedPairInterpretationOutput, materializeMissionEvidenceProposal } from '../../src/mission/v1/accepted-pair-interpreter.mjs';
import { materializeAcceptedPairPeopleEvents } from '../../src/people/accepted-pair-people.mjs';
import { validatePeopleEvent } from '../../src/people/people-event-contracts.mjs';
import { validateMissionEvidenceProposal } from '../../src/mission/v1/evidence-contracts.mjs';

const text = 'The accepted crew report established this observed event. '.repeat(12).trim();
const sourcePair = {
  previousAssistant:{messageId:'a1',selectedSwipeId:null,textHash:'a'.repeat(64),text},
  currentPlayer:{messageId:'u1',selectedSwipeId:null,textHash:'b'.repeat(64),text:'I wait here.'},
};
const candidatePacket={branchId:'save.test',missionId:'mission.test',baseRevision:1,candidates:Array.from({length:6},(_,i)=>({id:`policy.${i}`,claimType:'eventOccurred',targetId:`event.${i}`,sourceSlots:['previousAssistant']}))};
const interpretation={kind:'directive.missionEvidenceInterpretation.v1',assistantAcceptance:'accepted',claims:candidatePacket.candidates.map(candidate=>({candidateId:candidate.id,sourceSlot:'previousAssistant',evidenceQuote:text.slice(0,300)})),peopleEvents:[],abstained:false,time:{decision:'unchanged',basis:'noPassage',elapsedSeconds:0,reason:'No passage.',confidence:1}};
const limits={interpreterMaxDurableSelections:8,interpreterMaxClaims:6,interpreterEvidenceQuoteCharacters:350};
const parsed=parseMissionAcceptedPairInterpretationOutput(interpretation,{candidatePacket,sourcePair,limits});
assert.equal(parsed.ok,true,JSON.stringify(parsed.errors));
assert.equal(materializeMissionEvidenceProposal({interpretation:parsed.value,candidatePacket,sourcePair}).claims.length,6);
const evidenceDefinition={id:'mission.test',objectives:[],facts:[],outcomes:[],events:candidatePacket.candidates.map(c=>({id:c.targetId})),evidencePolicies:candidatePacket.candidates.map(c=>({id:c.id,claimType:c.claimType,targetId:c.targetId,sourceRoles:['assistant'],when:true}))};
const acceptedSource={...sourcePair.previousAssistant,branchId:'save.test',role:'assistant',accepted:true,acceptedAtRevision:1,contributionId:'contribution.a1'};
const evidenceValidation=validateMissionEvidenceProposal({definition:evidenceDefinition,state:{branchId:'save.test',revision:1,knownFacts:[],worldFacts:[],events:[],outcomes:{},objectives:{},evidenceLog:[]},proposal:materializeMissionEvidenceProposal({interpretation:parsed.value,candidatePacket,sourcePair}),resolveSourceRef:()=>acceptedSource});
assert.equal(evidenceValidation.acceptedClaims.length,6,JSON.stringify(evidenceValidation));
assert.equal(createMissionAcceptedPairInterpretationSchema({candidatePacket,limits}).properties.claims.maxItems,6);
assert.equal(parseMissionAcceptedPairInterpretationOutput(interpretation,{candidatePacket,sourcePair,limits:{...limits,interpreterMaxClaims:2}}).ok,false);
assert.equal(parseMissionAcceptedPairInterpretationOutput(interpretation,{candidatePacket,sourcePair,limits:{...limits,interpreterEvidenceQuoteCharacters:100}}).ok,false);
assert.equal(parseMissionAcceptedPairInterpretationOutput({...interpretation,claims:[{...interpretation.claims[0],candidateId:'policy.invented'}]},{candidatePacket,sourcePair,limits}).ok,false,'settings cannot authorize unknown claims');

const peopleLimits={...limits,interpreterMaxDurableSelections:7,interpreterMaxPeopleEvents:6,interpreterPeopleNameCharacters:180,interpreterPeopleSummaryCharacters:900};
const peopleOutput={...interpretation,claims:[],abstained:true,peopleEvents:Array.from({length:6},(_,i)=>({type:'personIntroduced',localRef:`crew.${i}`,name:'Named officer '.repeat(10).trim(),introductionSummary:text,sourceSlot:'previousAssistant',evidenceQuote:text.slice(0,300)}))};
const parsedPeople=parseMissionAcceptedPairInterpretationOutput(peopleOutput,{candidatePacket,sourcePair,limits:peopleLimits});
assert.equal(parsedPeople.ok,true,JSON.stringify(parsedPeople.errors));
assert.equal(parsedPeople.value.peopleEvents.length,6);
const peopleEvents=materializeAcceptedPairPeopleEvents({observations:parsedPeople.value.peopleEvents,sourcePair,sourceContributionIds:{previousAssistant:'contribution.a1',currentPlayer:'contribution.u1'},branchId:'save.test'});
assert.ok(peopleEvents.every(event=>validatePeopleEvent(event).ok),'raised generation limits survive historical validation');
assert.equal(peopleEvents[0].introductionSummary,text);
assert.equal(parseMissionAcceptedPairInterpretationOutput(peopleOutput,{candidatePacket,sourcePair,limits:{...peopleLimits,interpreterPeopleSummaryCharacters:200}}).ok,false);
const reduced=parseMissionAcceptedPairInterpretationOutput(peopleOutput,{candidatePacket,sourcePair,limits:{...peopleLimits,interpreterMaxPeopleEvents:2}});
assert.equal(reduced.value.peopleEvents.length,2,'existing deterministic people-overflow handling honors configured capacity');

let payload;
const interpreter=createMissionAcceptedPairInterpreter({generationRouter:{getAnalysisLimits:()=>limits,generate:async(role,request)=>{payload=request;return {ok:true,response:{text:JSON.stringify(interpretation)}};}}});
assert.equal((await interpreter({candidatePacket,sourcePair})).ok,true);
assert.equal(payload.jsonSchema.properties.claims.maxItems,6);
assert.match(payload.systemPrompt,/no more than 8 durable selections/);
assert.throws(()=>createMissionAcceptedPairInterpretationPrompt({candidatePacket,sourcePair,limits:{requestContextCharacters:10}}),/interpreter-context-overflow/);
console.log('Configurable interpreter content limit tests passed.');
