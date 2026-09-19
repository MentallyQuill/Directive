import assert from 'node:assert/strict';
import * as pacing from '../../src/narration/scene-pacing.mjs';
import fs from 'node:fs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
import { reduceMissionEvidence } from '../../src/mission/v1/mission-reducer.mjs';
import { createMissionAcceptedPairInterpretationPrompt } from '../../src/mission/v1/accepted-pair-interpreter.mjs';

assert.equal(typeof pacing.settleScenePacing, 'function', 'scene pacing must settle participation using the existing accepted pair');
const definition = { id: 'mission.test', objectives: [{ id: 'objective.test', playerText: {title:'Negotiate terms'}, scenePacing: {requirements: ['Discuss the proposed terms.', 'Choose how to proceed.']} }] };
const state = {objectives:{'objective.test':{state:'available',visibility:'visible'}}};
const sourcePair = {previousAssistant:{text:'What authority do you need?'},currentPlayer:{text:'I need authority over watch assignments.',messageId:'3'}};
const observation = {objectiveId:'objective.test',intent:'continue',intentQuote:'',unresolved:'Authority remains under discussion.',participation:[{requirement:0,playerQuote:'I need authority over watch assignments.',assistantQuote:'What authority do you need?'}]};
const result = pacing.settleScenePacing({definition,state,receipts:[],sourcePair,observation,assistantAccepted:true});
assert.equal(result.intent,'continue');
assert.equal(result.ready,false,'one substantive reply cannot resolve a protected scene');
assert.throws(() => pacing.settleScenePacing({definition,state,receipts:[],sourcePair,observation:{...observation, participation:[{...observation.participation[0], playerQuote:'The commander agrees to everything.'}]},assistantAccepted:true}), /quote/i, 'invented participation must not enter a receipt');
const receipt = {currentPlayer:{messageId:'3'},assistantAcceptance:'accepted',scenePacing:result};
const secondPair = {previousAssistant:{text:'Those watch assignments will be yours. Any other concerns?'},currentPlayer:{messageId:'5',text:'Those terms work for me. Let us complete the handover.'}};
const second = {objectiveId:'objective.test',intent:'resolve',intentQuote:'Let us complete the handover.',unresolved:'',participation:[{requirement:1,playerQuote:'Those terms work for me.',assistantQuote:'Those watch assignments will be yours.'}]};
assert.equal(pacing.settleScenePacing({definition,state,receipts:[receipt],sourcePair:secondPair,observation:second,assistantAccepted:true}).ready,true,'supported resolution after distinct participation can proceed');
assert.equal(pacing.settleScenePacing({definition,state,receipts:[receipt],sourcePair:{...secondPair,currentPlayer:{...secondPair.currentPlayer,messageId:'3'}},observation:second,assistantAccepted:true}).ready,false,'replaying one player message cannot supply two turns');
assert.equal(pacing.settleScenePacing({definition,state,receipts:[receipt],sourcePair:secondPair,observation:second,assistantAccepted:false}).ready,false,'rejected assistant prose cannot establish participation');
const correctedState={...state,objectiveDecisions:{'objective.test':{revision:1}}};
assert.equal(pacing.settleScenePacing({definition,state:correctedState,receipts:[receipt],sourcePair:secondPair,observation:second,assistantAccepted:true}).ready,false,'pre-correction participation cannot complete the reopened scene');
assert.deepEqual(
    pacing.createScenePacingContext({definition,state:correctedState,receipts:[receipt]}).currentScene,
    {...result,intent:'continue',unresolved:"The player changed this objective's progress.",participation:[],ready:false,departMission:false},
    'a reopened nonterminal scene stays current while stale participation and departure are cleared',
);
assert.equal(pacing.settleScenePacing({definition,state,receipts:[receipt],sourcePair:secondPair,observation:{...second,intent:'continue',intentQuote:''},assistantAccepted:true}).ready,false,'meeting requirements never automatically ends the scene');
const other = {...definition.objectives[0],id:'objective.other'};
const expanded = {...definition,objectives:[...definition.objectives,other]};
const expandedState = {objectives:{...state.objectives,[other.id]:{state:'available',visibility:'visible'}}};
assert.equal(pacing.settleScenePacing({definition:expanded,state:expandedState,receipts:[receipt],sourcePair:secondPair,observation:{...second,objectiveId:other.id},assistantAccepted:true}).objectiveId,'objective.test','an unresolved scene cannot be displaced by a different available objective');
const terminalFirstState = {
    objectives:{'objective.test':{state:'terminal',visibility:'resolved',disposition:'completed'},[other.id]:{state:'available',visibility:'visible',disposition:null}},
    objectiveDecisions:{'objective.test':{mode:'player_set',revision:5,disposition:'completed'}},
};
const correctedTerminalContext = pacing.createScenePacingContext({definition,state:terminalFirstState,receipts:[receipt]});
assert.equal(correctedTerminalContext.objectives[0].status,'terminal');
assert.doesNotMatch(correctedTerminalContext.currentScene.unresolved,/reopened/i,'a player-completed objective must not be described as reopened');
assert.equal(correctedTerminalContext.currentScene.objectiveId,'objective.test','completion alone preserves the current conversation');
assert.equal(correctedTerminalContext.allowDeparture,false,'a progress correction does not invent player departure');
assert.equal(correctedTerminalContext.allowMissionDeparture,false);
assert.deepEqual(correctedTerminalContext.currentScene.participation,[],'stale pre-correction participation remains invalid');
assert.deepEqual(
    pacing.createScenePacingContext({definition:expanded,state:terminalFirstState,receipts:[receipt]}).currentScene,
    {missionId:'mission.test',objectiveId:'objective.other',intent:'continue',unresolved:'',participation:[],ready:false,departMission:false},
    'a terminal scene must yield to the next visible nonterminal objective',
);
assert.equal(
    pacing.settleScenePacing({definition:expanded,state:terminalFirstState,receipts:[receipt],sourcePair:secondPair,observation:{...second,objectiveId:other.id,intent:'continue',intentQuote:''},assistantAccepted:true}).objectiveId,
    other.id,
    'a successor observation must not be displaced back to a terminal scene',
);
const allTerminalState = {objectives:{
    'objective.test':{state:'terminal',visibility:'resolved',disposition:'completed'},
    [other.id]:{state:'terminal',visibility:'resolved',disposition:'completed'},
}};
const missionDeparture = {...result,intent:'skip',departMission:true};
const staleDepartureContext = pacing.createScenePacingContext({definition:expanded,state:terminalFirstState,receipts:[{scenePacing:missionDeparture}]});
assert.equal(staleDepartureContext.currentScene.objectiveId,other.id,'a corrected terminal departure cannot keep its old scene ahead of a successor');
assert.equal(staleDepartureContext.allowMissionDeparture,false);
const currentMissionDeparture = {...missionDeparture,correctionRevision:5};
const departureWithOptionalContext = pacing.createScenePacingContext({definition:expanded,state:terminalFirstState,receipts:[{scenePacing:currentMissionDeparture}]});
assert.equal(departureWithOptionalContext.currentScene,currentMissionDeparture,'an explicit mission departure remains current across an unfinished optional successor');
assert.equal(departureWithOptionalContext.allowMissionDeparture,true);
const allTerminalContext = pacing.createScenePacingContext({definition:expanded,state:allTerminalState,receipts:[{scenePacing:missionDeparture}]});
assert.equal(allTerminalContext.currentScene,missionDeparture,'the final departure receipt remains current when no nonterminal successor exists');
assert.equal(allTerminalContext.allowDeparture,true);
assert.equal(allTerminalContext.allowMissionDeparture,true);
const gatedDefinition = {...definition,objectives:[{...definition.objectives[0],terminalWhen:[{when:{eventOccurred:'event.done'}}]}]};
const claims = [{claimType:'eventOccurred',targetId:'event.done',claimId:'done',sourceRef:{role:'assistant'}},{claimType:'decisionRecorded',targetId:'outcome.choice',sourceRef:{role:'user'}}];
assert.equal(typeof pacing.gateScenePacingClaims,'function');
assert.deepEqual(pacing.gateScenePacingClaims({definition:gatedDefinition,receipts:[receipt],claims}).acceptedClaims,[claims[1]],'a narrator cannot certify its own premature completion');
assert.equal(typeof pacing.createScenePacingContext,'function');
const context = pacing.createScenePacingContext({definition,state,receipts:[receipt]});
assert.equal(context.currentScene.objectiveId,'objective.test');
assert.equal(context.allowDeparture,false);
assert.equal(typeof pacing.sceneAllowsReport,'function');
assert.equal(pacing.sceneAllowsReport({definition:gatedDefinition,state,receipts:[receipt],route:{factId:'fact.emergency',urgency:'urgent'}}),false,'urgency alone cannot displace conversation');
const leavePair = {previousAssistant:{text:'Anything else before we finish?'},currentPlayer:{messageId:'7',text:'I leave the room to find my engineer.'}};
const left = pacing.settleScenePacing({definition,state,receipts:[receipt],sourcePair:leavePair,observation:{objectiveId:'objective.test',intent:'leave',intentQuote:leavePair.currentPlayer.text,unresolved:'Terms remain open.',participation:[]},assistantAccepted:true});
assert.equal(pacing.createScenePacingContext({definition,state,receipts:[{scenePacing:left}]}).allowDeparture,true);
assert.equal(pacing.createScenePacingContext({definition,state,receipts:[{scenePacing:left}]}).allowMissionDeparture,false,'leaving a room does not authorize leaving the mission');
const shared = {...gatedDefinition,objectives:[...gatedDefinition.objectives,{...gatedDefinition.objectives[0],id:'objective.followup'}]};
const readyReceipt={...receipt,scenePacing:{...result,intent:'resolve',unresolved:'',ready:true}};
assert.equal(pacing.scenePacingPermissions(definition,[readyReceipt],correctedState).size,0,'reopening revokes prior readiness');
assert.equal(pacing.gateScenePacingClaims({definition:shared,receipts:[readyReceipt],claims}).acceptedClaims.length,2,'a shared prerequisite must not deadlock the scene that earned it');
console.log('Scene pacing participation guard passed.');

const pacingLimits = { scenePacingTextCharacters: 500, scenePacingQuoteCharacters: 450 };
assert.equal(pacing.createScenePacingSchema({ objectives: definition.objectives }, { limits: pacingLimits }).properties.unresolved.maxLength, 500);
assert.equal(pacing.createScenePacingSchema({ objectives: definition.objectives }, { limits: pacingLimits }).properties.intentQuote.maxLength, 450);
const extendedPair = { previousAssistant: { text: 'Assistant offered terms. '.repeat(14) }, currentPlayer: { text: 'Player discussed terms. '.repeat(14) } };
const extendedObservation = { ...observation, unresolved: 'u'.repeat(400), participation: [{ requirement: 0, playerQuote: extendedPair.currentPlayer.text, assistantQuote: extendedPair.previousAssistant.text }] };
assert.deepEqual(pacing.pacingObservationErrors(extendedObservation, { objectives: definition.objectives, sourcePair: extendedPair, limits: pacingLimits }), []);
assert.ok(pacing.pacingObservationErrors(extendedObservation, { objectives: definition.objectives, sourcePair: extendedPair, limits: { scenePacingTextCharacters: 100, scenePacingQuoteCharacters: 100 } }).length);
const extendedReceipt = pacing.settleScenePacing({ definition, state, receipts: [], observation: extendedObservation, sourcePair: extendedPair, assistantAccepted: true });
assert.equal(extendedReceipt.unresolved.length, 400);

// Source excerpts from the 2026-09-19 live handover. Observations below are
// explicit fixtures: this verifies the runtime contract, not model classification.
const ashes = JSON.parse(fs.readFileSync('packages/bundled/breckenridge/v1/prelude-a-ship-underway.mission-v1.json','utf8'));
const handover = 'objective.prelude.command-handover';
let handoverState = createMissionState({definition:ashes,branchId:'pacing-live-regression'});
handoverState.events.push('event.prelude.command-handover-terms-settled');
const discussionPair = {
    previousAssistant:{text:"What I want to know is where you'd draw the line — what you'd bring to me versus what you'd handle on your own."},
    currentPlayer:{messageId:'6',text:"I'd handle anything where the authority is clearly mine and the consequences stay within the ship's normal operating envelope"},
};
const discussion = pacing.settleScenePacing({definition:ashes,state:handoverState,sourcePair:discussionPair,assistantAccepted:true,
    observation:{objectiveId:handover,intent:'continue',intentQuote:'',unresolved:'Discuss the practical transfer.',
        participation:[{requirement:0,playerQuote:discussionPair.currentPlayer.text,assistantQuote:discussionPair.previousAssistant.text}]}});
const history = [{currentPlayer:discussionPair.currentPlayer,assistantAcceptance:'accepted',scenePacing:discussion}];
const resolutionPair = {
    previousAssistant:{text:"What you do with it is yours to determine — but I'd rather you walked into those department conversations knowing what I already know"},
    currentPlayer:{messageId:'10',text:'For the handover, should I assume I own the daily readiness brief, watch and rotation changes, and department priority calls immediately?'},
};
const resolving = pacing.settleScenePacing({definition:ashes,state:handoverState,receipts:history,sourcePair:resolutionPair,assistantAccepted:true,
    observation:{objectiveId:handover,intent:'resolve',intentQuote:resolutionPair.currentPlayer.text,unresolved:'',
        participation:[{requirement:1,playerQuote:resolutionPair.currentPlayer.text,assistantQuote:resolutionPair.previousAssistant.text}]}});
assert.equal(resolving.ready,true,'a concrete transfer request can authorize the next answer after discussion');
for (const alternative of [
    {intent:'continue',intentQuote:'',unresolved:'The player requested general background information.'},
    {intent:'resolve',intentQuote:resolutionPair.currentPlayer.text,unresolved:'The captain and XO still disagree about escalation authority.'},
]) {
    const held = pacing.settleScenePacing({definition:ashes,state:handoverState,receipts:history,sourcePair:resolutionPair,assistantAccepted:true,
        observation:{objectiveId:handover,...alternative,participation:[{requirement:1,playerQuote:resolutionPair.currentPlayer.text,assistantQuote:resolutionPair.previousAssistant.text}]}});
    assert.equal(held.ready,false,'general information or a material current-objective objection keeps resolution held');
}
const completion = {claimId:'captured-handover',evidenceKey:'captured-handover',claimType:'eventOccurred',
    targetId:'event.prelude.command-handover-completed',sourceRef:{role:'assistant'},
    evidenceQuote:'You own them as of this conversation.'};
const premature = pacing.gateScenePacingClaims({definition:ashes,state:handoverState,receipts:history,claims:[completion]});
assert.equal(premature.acceptedClaims.length,0,'current resolution cannot retroactively authorize a prior narrator outcome');
assert.notEqual(reduceMissionEvidence({definition:ashes,state:handoverState,acceptedClaims:premature.acceptedClaims}).state.objectives[handover].state,'terminal');
history.push({currentPlayer:resolutionPair.currentPlayer,assistantAcceptance:'accepted',scenePacing:resolving});
const authorized = pacing.gateScenePacingClaims({definition:ashes,state:handoverState,receipts:history,claims:[completion]});
handoverState = reduceMissionEvidence({definition:ashes,state:handoverState,acceptedClaims:authorized.acceptedClaims}).state;
assert.equal(handoverState.objectives[handover].disposition,'completed');
assert.equal(pacing.createScenePacingContext({definition:ashes,state:handoverState,receipts:history}).currentScene.objectiveId,'objective.prelude.staff-readiness');
const departurePair = {previousAssistant:{text:'Anything else you need from me before you begin?'},
    currentPlayer:{messageId:'12',text:'Nothing else, Captain. I have enough to begin. Elena closed her folder and rose. Could you let Lieutenant Nayar know Commander Venn is looking for her?'}};
const leaving = pacing.settleScenePacing({definition:ashes,state:handoverState,receipts:history,sourcePair:departurePair,assistantAccepted:true,
    observation:{objectiveId:handover,intent:'leave',intentQuote:'Elena closed her folder and rose.',unresolved:'',participation:[]}});
assert.equal(leaving.intent,'leave','an upcoming meeting does not erase explicit departure from the handover');
assert.equal(leaving.ready,false,'departure alone is not resolution');
assert.equal(leaving.departMission,false,'leaving the captain does not leave the mission');
const prompt = createMissionAcceptedPairInterpretationPrompt({sourcePair:resolutionPair,
    candidatePacket:{candidates:[],scenePacing:pacing.createScenePacingContext({definition:ashes,state:handoverState,receipts:history})}});
assert.match(prompt.systemPrompt,/Scope unresolved to material questions or objections about the selected objective/);
assert.match(prompt.systemPrompt,/a player request to enact or confirm the concrete final decision or authority transfer may be resolve/);
assert.match(prompt.systemPrompt,/leaving alone never proves objective completion/);
assert.match(prompt.systemPrompt,/When the authored objective is to establish an agreement, delegation, or procedure/);
assert.match(prompt.systemPrompt,/pending execution alone is not unresolved unless the authored objective requires that execution/);
console.log('Captured handover resolution, prior-only completion, and departure contract passed (model behavior not asserted).');

// Captured staff-round excerpts; these modeled observations test the downstream
// contract, not whether a provider will classify the scene correctly.
const staffId = 'objective.prelude.staff-readiness';
const staffState = structuredClone(handoverState);
staffState.events.push(...['operations','engineering','science','medical','security'].map(role=>`event.prelude.${role}-readiness-exchange`));
const staffDiscussionPair = {
    previousAssistant:{text:'Two officers per window, passive internal scan on the test decks only, evacuation routes confirmed clear by Nayar and Cross, closed personnel lists, and four stop conditions that are mine to call.'},
    currentPlayer:{messageId:'36',text:'Two officers covering the test-deck corridor and Deck 5 Sickbay, passive internal scans on Decks 8 and 11, and normal coverage elsewhere gives us a clear baseline.'},
};
const staffDiscussion = pacing.settleScenePacing({definition:ashes,state:staffState,sourcePair:staffDiscussionPair,assistantAccepted:true,
    observation:{objectiveId:staffId,intent:'continue',intentQuote:'',unresolved:'Set bridge-watch authority.',participation:[
        {requirement:0,playerQuote:staffDiscussionPair.currentPlayer.text,assistantQuote:staffDiscussionPair.previousAssistant.text}]}});
const staffHistory = [{currentPlayer:staffDiscussionPair.currentPlayer,assistantAcceptance:'accepted',scenePacing:staffDiscussion}];
const staffResolutionPair = {
    previousAssistant:{text:'Have you thought about who briefs the bridge watch, and when, and what authority they have to override the quiet period'},
    currentPlayer:{messageId:'38',text:"I'll brief the incoming bridge watch personally before 1900. The watch may pause or interrupt for a navigational or tactical need without waiting for permission. With those tracks assigned and visible, I'm asking authorization for the proposed windows, subject to the listed engineering, medical, science, security, and bridge-watch conditions."},
};
const staffObservation = {objectiveId:staffId,intent:'resolve',intentQuote:"I'm asking authorization for the proposed windows",unresolved:'',participation:[
    {requirement:1,playerQuote:'The watch may pause or interrupt for a navigational or tactical need without waiting for permission.',assistantQuote:staffResolutionPair.previousAssistant.text}]};
const staffResolution = pacing.settleScenePacing({definition:ashes,state:staffState,receipts:staffHistory,sourcePair:staffResolutionPair,assistantAccepted:true,observation:staffObservation});
assert.equal(staffResolution.ready,true,'a procedure can be agreed before its scheduled work is executed');
const staffHeld = pacing.settleScenePacing({definition:ashes,state:staffState,receipts:staffHistory,sourcePair:staffResolutionPair,assistantAccepted:true,
    observation:{...staffObservation,unresolved:'Bridge-watch interrupt authority remains disputed.'}});
assert.equal(staffHeld.ready,false,'an unresolved term of the procedure still holds completion');
const staffClaim = {claimId:'staff-agreed',evidenceKey:'staff-agreed',claimType:'eventOccurred',targetId:'event.prelude.staff-readiness-established',sourceRef:{role:'assistant'},evidenceQuote:'Authorized.'};
assert.equal(pacing.gateScenePacingClaims({definition:ashes,state:staffState,receipts:staffHistory,claims:[staffClaim]}).acceptedClaims.length,0,'current evidence cannot bypass the prior-receipt gate');
staffHistory.push({currentPlayer:staffResolutionPair.currentPlayer,assistantAcceptance:'accepted',scenePacing:staffResolution});
const staffAuthorized = pacing.gateScenePacingClaims({definition:ashes,state:staffState,receipts:staffHistory,claims:[staffClaim]});
const staffReduced = reduceMissionEvidence({definition:ashes,state:staffState,acceptedClaims:staffAuthorized.acceptedClaims}).state;
assert.equal(staffReduced.objectives[staffId].disposition,'completed');
assert.notEqual(staffReduced.objectives['objective.prelude.final-readiness-arrival'].state,'terminal','agreeing procedures never completes final readiness execution');
console.log('Staff procedure scope and prior-only completion contract passed (model behavior not asserted).');
