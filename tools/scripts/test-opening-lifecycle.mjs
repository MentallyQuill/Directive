import assert from 'node:assert/strict';
import { createOpeningLifecycle } from '../../src/narration/opening-lifecycle.mjs';
import fs from 'node:fs';
const premise=JSON.parse(fs.readFileSync(new URL('../../packages/bundled/breckenridge/ashes-of-peace.campaign-package.json',import.meta.url))).campaign.openingPremise;
let identity='save-a',record=null, messages=[], directorCalls=0,narratorCalls=0,fail=false,release=null;
const binding=()=>({campaignId:'c',saveId:identity,chatId:identity});
const lifecycle=createOpeningLifecycle({
 chat:{getRecentMessages:async()=>messages,getOpeningRecord:()=>record,setOpeningRecord:async r=>{record=structuredClone(r)},postAssistantMessage:async r=>{messages.push({role:'assistant',text:r.text});return {posted:true}}},
 getBinding:binding,isCurrent:b=>b.saveId===identity,
 generateDirector:async()=>{directorCalls++;return {text:JSON.stringify({kind:'directive.openingDirection.v1',sceneMaterialIds:['scene:0'],backgroundIds:['background:serviceSummary'],emphasis:'balanced'})}},
 generateNarration:async()=>{narratorCalls++;if(fail)throw Error('offline');if(release)await release;return {text:'Sam stood outside the ready room.'}},
 getProseGuidance:async()=>'Concrete prose.',
});
const input={premise,player:{name:'Sam',dossier:{serviceSummary:'An engineer.'}},settings:{pov:'third-person-limited',tense:'past'}};
fail=true;assert.equal((await lifecycle.generate(input)).ok,false);assert(record.direction);assert.equal(messages.length,0);
fail=false;await Promise.all([lifecycle.generate(input),lifecycle.generate(input)]);assert.equal(messages.length,1);assert.equal(directorCalls,1);assert.equal(narratorCalls,2);
await lifecycle.generate(input);assert.equal(narratorCalls,2);
messages=[];let done;release=new Promise(r=>{done=r});const flight=lifecycle.generate(input);while(narratorCalls<3)await new Promise(r=>setTimeout(r,0));identity='save-b';done();assert.equal((await flight).ok,false);assert.equal(messages.length,0);
console.log('Opening lifecycle retry, deduplication and chat race passed.');
messages = [];
let releaseStopped;
release = new Promise(resolve => { releaseStopped = resolve; });
const beforeStopCalls = narratorCalls;
const stoppedOpening = lifecycle.generate(input);
while (narratorCalls === beforeStopCalls) await new Promise(resolve => setTimeout(resolve, 0));
lifecycle.cancel();
releaseStopped();
assert.equal((await stoppedOpening).ok, false);
assert.equal(messages.length, 0, 'a stopped opening cannot post a late model response');
release = null;
assert.equal((await lifecycle.generate(input)).ok, true, 'explicit retry starts a new opening');
let lateMessages=[],writes=0;
const late=createOpeningLifecycle({chat:{getRecentMessages:async()=>lateMessages,getOpeningRecord:()=>null,setOpeningRecord:async()=>{if(++writes===2)lateMessages.push({role:'user',text:'Wait.'})},postAssistantMessage:async r=>{lateMessages.push({role:'assistant',text:r.text});return {posted:true}}},getBinding:()=>({campaignId:'late',saveId:'late',chatId:'late'}),isCurrent:()=>true,generateDirector:async()=>({text:JSON.stringify({kind:'directive.openingDirection.v1',sceneMaterialIds:['scene:0'],backgroundIds:['background:serviceSummary'],emphasis:'setting'})}),generateNarration:async()=>({text:'Opening.'}),getProseGuidance:async()=>''});
await late.generate(input);assert.equal(lateMessages.length,1,'user message during metadata persistence prevents opening append');assert.notEqual(late.currentStatus()?.status,'generating');
