import assert from 'node:assert/strict';
import {createMissionAcceptedPairInterpretationPrompt,parseMissionAcceptedPairInterpretationOutput} from '../../src/mission/v1/accepted-pair-interpreter.mjs';
const sourcePair = {previousAssistant:{text:'Which authority do you need?'},currentPlayer:{text:'I need authority over watch assignments.'}};
const scenePacing = {objectives:[{id:'objective.test',scenePacing:{requirements:['Discuss terms.','Choose terms.']}}],currentScene:null};
const candidatePacket = {candidates:[],scenePacing};
const request = createMissionAcceptedPairInterpretationPrompt({candidatePacket,sourcePair});
assert.ok(request.jsonSchema.properties.scenePacing,'pacing belongs in the existing Utility schema');
const output = {kind:'directive.missionEvidenceInterpretation.v1',assistantAcceptance:'accepted',claims:[],peopleEvents:[],abstained:true,time:{decision:'unchanged',basis:'noPassage',elapsedSeconds:0,reason:'same instant',confidence:1},scenePacing:{objectiveId:'objective.test',intent:'continue',intentQuote:'',unresolved:'Terms remain open.',participation:[{requirement:0,playerQuote:sourcePair.currentPlayer.text,assistantQuote:sourcePair.previousAssistant.text}]}};
const parsed = parseMissionAcceptedPairInterpretationOutput(output,{candidatePacket,sourcePair});
assert.equal(parsed.ok,true,parsed.errors?.join('; '));
assert.deepEqual(parsed.value.scenePacing,output.scenePacing);
// The declared contract must reject the exact structural mistakes seen in live
// request 227: an empty player quote and requirement 2 for two requirements.
const participationSchema = request.jsonSchema.properties.scenePacing.properties.participation.items.properties;
assert.equal(participationSchema.playerQuote.minLength,4);
assert.equal(participationSchema.assistantQuote.minLength,4);
assert.equal(participationSchema.requirement.maximum,1);
assert.match(participationSchema.requirement.description,/zero-based/i);
assert.equal(request.jsonSchema.properties.scenePacing.properties.intentQuote.minLength,undefined,
    'continue and absent mission departure still permit empty optional quotes');
const malformed = structuredClone(output);
malformed.scenePacing.participation = [{requirement:2,playerQuote:'',assistantQuote:sourcePair.previousAssistant.text}];
const rejected = parseMissionAcceptedPairInterpretationOutput(malformed,{candidatePacket,sourcePair});
assert.equal(rejected.ok,false);
assert.ok(rejected.errors.some(error=>error.includes('participation[0].requirement') && error.includes('[0,1]')),
    'retry feedback identifies the exact authored indices for the selected objective');
assert.ok(rejected.errors.some(error=>error.includes('participation[0].playerQuote') && error.includes('currentPlayer')),
    'retry feedback identifies the missing player evidence rather than blaming both speakers');
const retry = createMissionAcceptedPairInterpretationPrompt({candidatePacket,sourcePair,validationErrors:rejected.errors});
assert.match(retry.systemPrompt,/zero-based/);
assert.match(retry.systemPrompt,/omit the participation item/i);
assert.ok(retry.prompt.includes('participation[0].playerQuote'));
const mixed = createMissionAcceptedPairInterpretationPrompt({sourcePair,candidatePacket:{candidates:[],scenePacing:{
    ...scenePacing,objectives:[...scenePacing.objectives,{id:'objective.four',scenePacing:{requirements:['One','Two','Three','Four']}}],
}}});
assert.equal(mixed.jsonSchema.properties.scenePacing.properties.participation.items.properties.requirement.maximum,3,
    'longer authored requirement lists remain representable');
console.log('Existing Utility schema carries bounded scene pacing.');
