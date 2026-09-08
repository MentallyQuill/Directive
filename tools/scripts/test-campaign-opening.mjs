import assert from 'node:assert/strict';
import { createOpeningDirectorRequest, parseOpeningDirection, createOpeningNarrationRequest } from '../../src/narration/campaign-opening.mjs';
import { createGenerationRoleRegistry } from '../../src/generation/generation-roles.mjs';
assert.equal(createGenerationRoleRegistry().get('openingSceneDirector').providerKind, 'reasoning');
const makePremise = (place) => ({continuitySummary:`Arrival at ${place}.`,firstPlayableScene:`Wait at ${place} gate.`,requiredContext:[`The ${place} gate is closed.`],sceneMaterial:[`${place} stone walls.`],personalization:['Use a relevant accepted service reference.'],forbiddenFacts:['Do not reveal hidden motives.'],firstSceneGuidance:['Greet the player.'],continuationGuidance:['Wait for their answer.']});
for (const [place,background] of [['Harbor','Surveyed distant coasts.'],['Observatory','Repaired orbital telescopes.']]) {
 const premise=makePremise(place), player={name:'Ari',dossier:{serviceSummary:background,privateHistory:'SECRET_SENTINEL',optionalOpenThread:'HIDDEN_SENTINEL'},hiddenKnowledge:'HIDDEN_SENTINEL'};
 const request=createOpeningDirectorRequest({premise,player,narrationPolicy:{instruction:'Third person past tense.'}});
 const promptContract = JSON.parse(request.messages.at(-1).content).outputSchema;
 assert.deepEqual(promptContract, request.jsonSchema, 'prompt-json lanes must receive the entire output contract in messages');
 assert.doesNotMatch(JSON.stringify(request),/SECRET_SENTINEL|HIDDEN_SENTINEL/);
 const output={kind:'directive.openingDirection.v1',sceneMaterialIds:['scene:0'],backgroundIds:['background:serviceSummary'],emphasis:'balanced'};
 assert.equal(request.jsonSchema.properties.sceneMaterialIds.minItems,1);
 assert.equal(request.jsonSchema.properties.backgroundIds.minItems,1);
 assert.equal(parseOpeningDirection({...output,sceneMaterialIds:[]},{request}).ok,false);
 assert.equal(parseOpeningDirection({...output,backgroundIds:[]},{request}).ok,false);
 assert.deepEqual(parseOpeningDirection(output,{request}),{ok:true,value:output});
 for(const invalid of [{...output,extra:'invented'},{...output,backgroundIds:['background:privateHistory']},{...output,sceneMaterialIds:['scene:999']},{...output,emphasis:'invent thoughts'},{...output,sceneMaterialIds:['scene:0','scene:0']},{...output,backgroundIds:null}]) assert.equal(parseOpeningDirection(invalid,{request}).ok,false);
 assert.equal(parseOpeningDirection('not JSON',{request}).ok,false);
 const narration=createOpeningNarrationRequest({premise,player,narrationPolicy:{instruction:'Third person past tense.'},direction:output,proseGuidance:'Measured prose.'});
 assert.match(JSON.stringify(narration),new RegExp(background));
 assert.match(JSON.stringify(narration),new RegExp(place));
 assert.doesNotMatch(JSON.stringify(narration),/SECRET_SENTINEL|HIDDEN_SENTINEL/);
 assert.throws(()=>createOpeningNarrationRequest({premise,player,direction:{...output,backgroundIds:['unbound']}}));
}
assert.doesNotThrow(()=>createOpeningDirectorRequest({premise:{...makePremise('Island'),firstSceneEndObjectiveId:'objective.greeting'}}));
assert.throws(()=>createOpeningDirectorRequest({premise:{...makePremise('Island'),firstSceneEndObjectiveId:''}}),/firstSceneEndObjectiveId/);
const emptyPlayerRequest = createOpeningDirectorRequest({premise:makePremise('Island'),player:{}});
assert.equal(emptyPlayerRequest.jsonSchema.properties.backgroundIds.maxItems,0);
assert.equal(emptyPlayerRequest.jsonSchema.properties.backgroundIds.minItems,0);
assert.equal(parseOpeningDirection({kind:'directive.openingDirection.v1',sceneMaterialIds:['scene:0'],backgroundIds:[],emphasis:'balanced'},{request:emptyPlayerRequest}).ok,true);
assert.equal(parseOpeningDirection({kind:'directive.openingDirection.v1',sceneMaterialIds:[],backgroundIds:['background:serviceSummary'],emphasis:'balanced'},{request:emptyPlayerRequest}).ok,false);
for(const field of ['requiredContext','sceneMaterial','personalization','forbiddenFacts','firstSceneGuidance']) {
 const premise=makePremise('Island'); delete premise[field];
 assert.throws(()=>createOpeningDirectorRequest({premise}),new RegExp(field));
}
const biographyPlayer = {name:'Ari',dossier:{briefBiography:'Ari grew up on a quiet colony and disliked confrontation.'}};
const biographyRequest = createOpeningDirectorRequest({premise:makePremise('Island'),player:biographyPlayer});
assert.equal(biographyRequest.context.backgroundReferences[0].visibility,'player-known');
const biographyNarration = createOpeningNarrationRequest({premise:makePremise('Island'),player:biographyPlayer,direction:{kind:'directive.openingDirection.v1',sceneMaterialIds:['scene:0'],backgroundIds:['background:briefBiography'],emphasis:'character-background'}});
assert.equal(JSON.parse(biographyNarration.messages[1].content).background[0].visibility,'player-known');
assert.match(biographyNarration.messages[0].content,/player-known.*not.*NPC/i);
console.log('PASS campaign opening bounded Director and narration contracts');
