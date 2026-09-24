import assert from 'node:assert/strict';
import { createEmptyStorySettlement } from '../../src/story/story-settlement-contracts.mjs';
import { openStoryEpisode, acceptStoryContribution, appendStoryEffects, appendStoryPeopleEvents, invalidateStorySource, sealStoryEpisode, checkpointStoryEpisode } from '../../src/story/story-settlement.mjs';
import { createPeopleInterpretationContext, materializeAcceptedPairPeopleEvents } from '../../src/people/accepted-pair-people.mjs';
import { createPeoplePlayerProjection, createPeoplePromptProjection } from '../../src/projection/v1/people-projection.mjs';
import { parseMissionAcceptedPairInterpretationOutput, MISSION_EVIDENCE_INTERPRETATION_KIND } from '../../src/mission/v1/accepted-pair-interpreter.mjs';

const crewDataset = { officers: [{ id: 'cross', name: 'Cross' }, { id: 'saye', name: 'Saye' }] };
let state = openStoryEpisode(createEmptyStorySettlement({ branchId: 'save.test' }), { episodeId: 'episode.one', sceneId: 'scene.one', references: { participantIds: ['cross','saye'] } });
const contribute = (s,id,role='assistant') => acceptStoryContribution(s,{id,messageId:id,role,textHash:'a'.repeat(64),acceptedAtRevision:s.revision});
state = contribute(state,'source.promise');
const matter = {id:'matter.cross',type:'character.relationshipOpenMatter',targetId:'cross',value:'Bring the test conditions to Saye.',sourceContributionIds:['source.promise'],playerVisibility:'visible',status:'active'};
state = appendStoryEffects(state,[matter,{...matter,id:'posture.cross',type:'character.relationshipPosture',value:'Cautious cooperation.'}]);
const context = createPeopleInterpretationContext({crewDataset,storySettlement:state});
assert.ok(Array.isArray(context.openMatters), 'interpreter must receive unresolved matters');
assert.equal(context.openMatters[0].matterEffectId,'matter.cross');
assert.equal(context.openMatters[0].personId,'cross');
const quote = 'Saye accepted the test conditions and finalized the schedule.';
const sourcePair = {previousAssistant:{messageId:'message.outcome',textHash:'b'.repeat(64),text:quote},currentPlayer:{messageId:'message.reply',textHash:'c'.repeat(64),text:'I will bring the conditions to Saye.'}};
const observation = {type:'relationshipMatterResolved',personRef:'cross',matterEffectId:'matter.cross',sourceSlot:'previousAssistant',evidenceQuote:quote};
const output = {kind:MISSION_EVIDENCE_INTERPRETATION_KIND,assistantAcceptance:'accepted',claims:[],peopleEvents:[observation],abstained:true,time:{decision:'unchanged',basis:'noPassage',elapsedSeconds:0,reason:'No passage.',confidence:0.9}};
assert.equal(parseMissionAcceptedPairInterpretationOutput(output,{sourcePair,peopleContext:context}).ok,true);
for (const bad of [{...observation,personRef:'saye'},{...observation,matterEffectId:'matter.missing'},{...observation,sourceSlot:'currentPlayer',evidenceQuote:sourcePair.currentPlayer.text}]) {
 assert.equal(parseMissionAcceptedPairInterpretationOutput({...output,peopleEvents:[bad]},{sourcePair,peopleContext:context}).ok,false);
}
const args={observations:[observation],peopleContext:context,sourcePair,sourceContributionIds:{previousAssistant:'source.outcome',currentPlayer:'source.reply'},branchId:'save.test'};
const events=materializeAcceptedPairPeopleEvents(args);
state=contribute(state,'source.outcome');
const before=structuredClone(state);
state=appendStoryPeopleEvents(state,events);
const project=s=>createPeoplePlayerProjection({runtimeAssets:{crewDataset},storySettlement:s});
assert.equal(project(state).people[0].relationshipOpenMatter,null);
assert.equal(project(state).people[0].relationshipPosture,'Cautious cooperation.');
assert.equal(createPeoplePromptProjection({peopleProjection:project(state)}).people[0].relationshipOpenMatter,null);
assert.deepEqual(appendStoryPeopleEvents(state,events),state,'exact replay is idempotent');
assert.throws(()=>appendStoryPeopleEvents(before,[{...events[0],personId:'saye'}]),/matter/i);
assert.throws(()=>appendStoryPeopleEvents(before,[{...events[0],matterEffectId:'matter.unknown'}]),/matter/i);
assert.equal(project(invalidateStorySource(state,{contributionId:'source.outcome',reason:'edit'})).people[0].relationshipOpenMatter,matter.value);
const later=appendStoryEffects(state,[{...matter,id:'matter.cross.next',value:'Report the test results.'}]);
assert.equal(project(later).people[0].relationshipOpenMatter,'Report the test results.');
assert.equal(project(invalidateStorySource(later,{contributionId:'source.promise',reason:'edit'})).people[0].relationshipOpenMatter,null);
const sealed=sealStoryEpisode(state,{boundaryReason:'authored-scene-closure',summary:'The scheduling matter was settled.'});
assert.equal(project(invalidateStorySource(sealed,{contributionId:'source.outcome',reason:'swipe'})).people[0].relationshipOpenMatter,matter.value);
const second=openStoryEpisode(sealStoryEpisode(before,{boundaryReason:'authored-scene-closure',summary:'The original discussion ended.'}),{episodeId:'episode.two',sceneId:'scene.two',references:{participantIds:['cross','saye']}});
const across=appendStoryPeopleEvents(contribute(second,'source.later-outcome'),[{...events[0],id:'people.resolution.later',sourceContributionIds:['source.later-outcome']}]);
assert.equal(project(across).people[0].relationshipOpenMatter,null,'resolution may occur in a later episode');
assert.equal(project(invalidateStorySource(across,{contributionId:'source.later-outcome',reason:'edit'})).people[0].relationshipOpenMatter,matter.value);
assert.equal(createPeopleInterpretationContext({crewDataset,storySettlement:state}).openMatters.length,0);
console.log('People exact matter resolution, source custody and rollback passed.');


const { createEpisodeEvaluationRequest, parseEpisodeEvaluationProposal, EPISODE_EVALUATION_PROPOSAL_KIND } = await import('../../src/story/episode-evaluator.mjs');
const { stableSha256Hex } = await import('../../src/runtime/v1-stable-hash.mjs');
let reviewState=appendStoryPeopleEvents(before,[{id:'evidence.saye',type:'relationshipEvidence',personId:'saye',summary:quote,sourceContributionIds:['source.outcome'],evidenceQuote:quote,evidenceQuoteHash:stableSha256Hex(quote).slice(0,8)}]);
reviewState=checkpointStoryEpisode(reviewState,{force:true});
const request=createEpisodeEvaluationRequest({settlement:reviewState});
const resolution={personId:'cross',matterEffectId:'matter.cross',evidenceEventId:'evidence.saye'};
const proposal={kind:EPISODE_EVALUATION_PROPOSAL_KIND,...request.envelope,decision:'continue',boundaryReason:null,significanceCriteria:[],summary:'Saye finalized the schedule.',foregroundQuestion:null,sourceContributionIds:['source.outcome'],effectIds:[],relationshipUpdates:[],characterMoments:[],openMatterResolutions:[resolution]};
const parsedReview=parseEpisodeEvaluationProposal(proposal,{request});
assert.equal(parsedReview.ok,true,JSON.stringify(parsedReview.errors));
for(const change of [{personId:'saye'},{matterEffectId:'missing'},{evidenceEventId:'missing'}]) {
 assert.equal(parseEpisodeEvaluationProposal({...proposal,openMatterResolutions:[{...resolution,...change}]},{request}).ok,false);
}
assert.equal(parseEpisodeEvaluationProposal({...proposal,openMatterResolutions:[resolution,resolution]},{request}).ok,false);
assert.equal(parseEpisodeEvaluationProposal({...proposal,relationshipUpdates:[{personId:'cross',posture:'Warm.',openMatter:'Another matter.',sourceContributionIds:['source.outcome']}]},{request}).ok,false);
const userRequest=structuredClone(request);userRequest.assistantSourceContributionIds=[];
assert.equal(parseEpisodeEvaluationProposal(proposal,{request:userRequest}).ok,false,'a player intent cannot complete an obligation');
let resolvedWithEvidence=appendStoryPeopleEvents(reviewState,events);
resolvedWithEvidence=checkpointStoryEpisode(resolvedWithEvidence,{force:true});
const resolvedRequest=createEpisodeEvaluationRequest({settlement:resolvedWithEvidence});
assert.equal(resolvedRequest.currentRelationships.find(p=>p.personId==='cross').openMatter,null);
// Old Cross evidence must not recreate unfinished business at a later checkpoint.
const oldQuote='Cross requested that the conditions be brought to Saye.';
resolvedWithEvidence=appendStoryPeopleEvents(resolvedWithEvidence,[{id:'evidence.cross.old',type:'relationshipEvidence',personId:'cross',summary:oldQuote,sourceContributionIds:['source.promise'],evidenceQuote:oldQuote,evidenceQuoteHash:stableSha256Hex(oldQuote).slice(0,8)}]);
const oldRequest=createEpisodeEvaluationRequest({settlement:resolvedWithEvidence});
const reopen={...proposal,...oldRequest.envelope,openMatterResolutions:[],relationshipUpdates:[{personId:'cross',posture:'Cautious cooperation.',openMatter:matter.value,sourceContributionIds:['source.promise']}]};
assert.equal(parseEpisodeEvaluationProposal(reopen,{request:oldRequest}).ok,false,'old evidence cannot reopen a resolved matter');
console.log('Episode cross-person reconciliation and stale evidence tests passed.');

// A repaired older episode must not outrank a newer relationship effect.
let history=contribute(before,'source.unrelated');
history=appendStoryEffects(history,[{...matter,id:'effect.unrelated',targetId:'saye',value:'An unrelated matter.',sourceContributionIds:['source.unrelated']}]);
history=sealStoryEpisode(history,{boundaryReason:'authored-scene-closure',summary:'First discussion.'});
history=openStoryEpisode(history,{episodeId:'episode.next',sceneId:'scene.next',references:{participantIds:['cross']}});
history=contribute(history,'source.newer');
history=appendStoryEffects(history,[{...matter,id:'matter.newer',value:'Report the measured test results.',sourceContributionIds:['source.newer']}]);
history=sealStoryEpisode(history,{boundaryReason:'authored-scene-closure',summary:'Newer discussion.'});
assert.equal(project(invalidateStorySource(history,{contributionId:'source.unrelated',reason:'edit'})).people[0].relationshipOpenMatter,'Report the measured test results.','repair time is not story order');
assert.throws(()=>appendStoryPeopleEvents(state,[{...events[0],matterEffectId:'changed.target'}]),/conflict|different/i,'event replay cannot silently change its payload');

const boundedContext=createPeopleInterpretationContext({crewDataset,storySettlement:history,limits:{episodeMaxRelationships:1}});
assert.equal(boundedContext.openMatters[0].matterEffectId,'matter.newer','bounded context prioritizes the latest matter, not the last person first introduced');
const incompleteContext=createPeopleInterpretationContext({crewDataset,storySettlement:history,limits:{episodeMaxRelationshipTextCharacters:8}});
assert.equal(incompleteContext.openMatters.length,0,'a truncated obligation must not become a resolution target');
assert.equal(incompleteContext.omittedOpenMatterCount,2);

let renewed=appendStoryEffects(reviewState,[{...matter,id:'matter.renewed',value:'Bring the revised conditions to Saye.',sourceContributionIds:['source.outcome']}]);
renewed=appendStoryPeopleEvents(renewed,[{id:'evidence.old-outcome',type:'relationshipEvidence',personId:'saye',summary:quote,evidenceQuote:quote,evidenceQuoteHash:stableSha256Hex(quote).slice(0,8),sourceContributionIds:['source.promise']}]);
const renewedRequest=createEpisodeEvaluationRequest({settlement:renewed});
assert.equal(parseEpisodeEvaluationProposal({...proposal,...renewedRequest.envelope,openMatterResolutions:[{personId:'cross',matterEffectId:'matter.renewed',evidenceEventId:'evidence.old-outcome'}]},{request:renewedRequest}).ok,false,'an older outcome cannot resolve a renewed obligation');
assert.throws(()=>appendStoryPeopleEvents(renewed,[{...events[0],id:'resolution.too-early',matterEffectId:'matter.renewed',sourceContributionIds:['source.promise']}]),/source|earlier|matter/i);
