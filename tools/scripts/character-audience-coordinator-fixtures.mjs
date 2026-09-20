import { createCharacterSceneAdmission, materializeCharacterSceneAdmission } from '../../src/story/character-scene-admission.mjs';
import { prepareCharacterAudienceInput } from '../../src/runtime/character-audience-preparation.mjs';
import { captureV1StorySource } from '../../src/runtime/v1-accepted-pair-source.mjs';
import { parseCharacterAudienceReview, createCharacterAudienceAdmission } from '../../src/story/character-audience-admission.mjs';

export function admitCoordinatorFixture(input) {
 const args={...input};
 let messages=input.messages;
 if(!args.sceneEvidence) {
  const priorText='The officers are awake together with the player. They can hear each other, read shared messages and see gestures.';
  messages=[{id:'fixture.scene',mes:priorText,is_user:false,swipe_id:0,swipes:[priorText]},{id:'fixture.player',mes:'I ask for a report.',is_user:true}];
  args.sourcePair=Object.fromEntries(['previousAssistant','currentPlayer'].map((slot,i)=>{const {role,...source}=captureV1StorySource(messages[i]).value;return [slot,source];}));
  const evidence={sourceSlot:'previousAssistant',evidenceQuote:priorText};
  const participants=input.participants.map(p=>({personId:p.personId,presence:'present',evidence:[evidence],perception:[],audience:[...p.audience,...(p.audience.some(r=>r.personId===input.playerId)?[]:[{personId:input.playerId,acquisition:'heard'}])].map(r=>({...r,evidence:[evidence]}))}));
  const proposal={participants,reactions:input.plan.map(n=>({personId:n.personId,after:n.dependsOnIds.map(id=>input.plan.findIndex(p=>p.id===id))})),playerContext:[{sourceSlot:'currentPlayer',evidenceQuote:messages[1].mes}]};
  const admission=createCharacterSceneAdmission({proposal,sourcePair:args.sourcePair,playerId:input.playerId,knownPersonIds:new Set(input.snapshot.characters.keys())});
  const scene=materializeCharacterSceneAdmission(admission,{sourcePair:args.sourcePair,knownPersonIds:new Set(input.snapshot.characters.keys())});
  args.participants=scene.participants;args.plan=scene.plan;args.playerInformation=scene.playerInformation;
  args.sceneEvidence={admission,sourcePair:args.sourcePair};
 } else if(!messages) messages=Object.values(args.sourcePair).map((s,i)=>({id:s.messageId,mes:s.text,is_user:i===1,...(i===0?{swipe_id:Number(s.selectedSwipeId),swipes:[s.text]}:{})}));
 const prepared=prepareCharacterAudienceInput({snapshot:args.snapshot,messages,sourcePair:args.sourcePair,admission:args.sceneEvidence.admission,identity:args.identity,limits:input.limits,provisionalExposures:args.provisionalExposures});
 const review=parseCharacterAudienceReview({kind:'directive.characterAudienceReview.v1',manifestDigest:prepared.manifestDigest,evidenceDigest:prepared.evidenceDigest,identityDigest:prepared.identityDigest,verdict:'pass',checkedEntryIds:prepared.manifest.entries.map(e=>e.id),findings:[]},{...prepared,entryIds:prepared.manifest.entries.map(e=>e.id)});
 return {...args,audiencePreparation:prepared,audienceAdmission:createCharacterAudienceAdmission(prepared,review)};
}
