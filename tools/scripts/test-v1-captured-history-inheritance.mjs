import assert from 'node:assert/strict';
import * as storage from '../../src/storage/v1-storage-repository.mjs';
import { createV1CapturedHistoryArchive } from '../../src/storage/v1-captured-history-archive.mjs';
import { assertV1CampaignSaveManifest } from '../../src/storage/v1-segmented-save-contracts.mjs';
import { sha256Json, canonicalJson } from '../../src/storage/v1-state-delta-codec.mjs';
import { createAshesInitialState, loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';
import { rebindV1CampaignStateCustody } from '../../src/runtime/v1-branch-reconstruction.mjs';
import { computeBranchHistoryPackageFingerprintV1 } from '../../src/runtime/branch-history-package-fingerprint.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { projectBranchHistoryTranscriptV1 } from '../../src/runtime/v1-branch-history-transcript.mjs';
import { createNativeBranchTranscriptAttestation } from '../../src/runtime/native-branch-lineage.mjs';
const store = storage.storeV1CampaignSaveWithInheritance;
assert.equal(typeof store, 'function', 'explicit inherited baseline creator required');
const now = '2026-09-15T12:00:00.000Z', id = 'save.inheritance.parent';
function memory(seed = {}) {
  const files = new Map(Object.entries(structuredClone(seed))), writes = [];
  return { files, writes, async readJson(path) { if (!files.has(path)) throw Object.assign(Error('missing'), {code:'ENOENT'}); return structuredClone(files.get(path)); },
    async writeJson(path,value) { writes.push(path); files.set(path,structuredClone(value)); },
    async deleteJsonFile(path) { files.delete(path); }, snapshot:()=>structuredClone(Object.fromEntries(files)) };
}
const adapter=memory(), runtimeAssets=loadAshesRuntimeAssets();
const state=createAshesInitialState({campaignId:'campaign.inheritance',saveId:id,chatId:'chat.parent'});
state.campaignChatBinding.hostId='sillytavern';
state.campaignChatBinding.entityType='character'; state.campaignChatBinding.entityId='entity.parent';
const parent=storage.createV1CampaignSave({id,state,createdAt:now});
await storage.storeV1CampaignSave(adapter,parent);
const sourceSnapshot={kind:'directive.hostTranscriptSnapshot.v1',version:1,representation:'sillytavern.persistable-row-data.v1',hostId:'sillytavern',
 nativeIdentity:{entityType:'character',entityId:'entity.parent',chatId:'chat.parent'},directiveBinding:structuredClone(state.campaignChatBinding),rowCount:1,rows:[{id:'message.1',mes:'One',is_user:true,extra:{}}]};
const transcript=(await projectBranchHistoryTranscriptV1(sourceSnapshot)).transcript, rows=transcript.rowHashes;
const expectedManifest=await adapter.readJson(storage.V1_STORAGE_PATHS.save(id));
const boundary={revision:state.stateCustody.revision,stateHash:await sha256Json(state)};
const result=await storage.storeV1CampaignSaveWithCapture(adapter,parent,{expectedManifest,previousSave:parent,expectedActiveSaveId:id,
 capture:{kind:'directive.authorityBoundaryCapture.v1',version:1,mode:'baseline',operationId:'inheritance.baseline',writerKind:'test',
 origin:{campaignId:state.campaign.id,saveId:id,chatId:'chat.parent',entityType:'character',entityId:'entity.parent'},packageFingerprint:await computeBranchHistoryPackageFingerprintV1(runtimeAssets),before:boundary,after:boundary,transcript}});
assert.equal(result.publication,'committed');
await storage.acknowledgeV1CampaignSavePublication(adapter,{saveId:id,requestHash:result.intent.requestHash});
const archived=await createV1CapturedHistoryArchive(adapter,id,{expectedManifest:await adapter.readJson(storage.V1_STORAGE_PATHS.save(id)),transcript});
const selected=await storage.loadV1CampaignStateAtTranscriptCut(archived.adapter,id,{expectedManifest:archived.expectedManifest,transcript,retainedRowCount:1});
async function candidate(slotType='active') {
 const targetId=slotType==='active'?'save.inheritance.child':'checkpoint.inheritance';
 const binding={...state.campaignChatBinding,saveId:targetId,chatId:'chat.child'};
 const next=slotType==='active'?rebindV1CampaignStateCustody({campaignState:selected.state,targetSaveId:targetId,targetChatBinding:binding,runtimeAssets}).campaignState:selected.state;
 const save=storage.createV1CampaignSave({id:targetId,slotType,parentSaveId:slotType==='checkpoint'?id:null,state:next,createdAt:now});
 const inheritance={kind:'directive.capturedHistoryInheritance.v1',version:1,archive:archived.reference,
 source:{saveId:id,manifestHash:selected.provenance.manifestHash,recordIndex:selected.capture.selected.index,operationId:selected.capture.selected.operationId,
 revision:selected.revision,stateHash:selected.stateHash,vectorHash:selected.capture.selected.vectorHash,rowCount:selected.capture.selected.rowCount},
 cut:selected.capture.cut,target:{saveId:targetId,slotType,baselineRevision:next.stateCustody.revision,baselineStateHash:await sha256Json(next),bindingHash:await sha256Json(next.campaignChatBinding)},derivationVersion:1};
 return {save,options:structuredClone({inheritance,expectedActiveSaveId:id,runtimeAssets})};
}
const baseline=adapter.snapshot();
for (const type of ['active','checkpoint']) {
 const {save,options}=await candidate(type), a=memory(baseline);
 const created=await store(a,save,options);
 assert.equal(created.publication,'committed'); assert.equal(created.indexPending,false);
 const manifest=await a.readJson(storage.V1_STORAGE_PATHS.save(save.id));
 assert.deepEqual(manifest.historyInheritance,options.inheritance); assertV1CampaignSaveManifest(manifest);
 assert.deepEqual((await storage.loadV1CampaignSave(a,save.id)).state,save.state);
 assert.equal((await storage.getV1StorageIndex(a)).activeSaveId,id);
 const before=a.snapshot(); assert.equal((await store(a,save,options)).publication,'committed'); assert.deepEqual(a.snapshot(),before);
}
console.log('PASS inherited child and checkpoint first manifest / exact retry');

// Every declared identity is independently checked before target writes.
for (const mutate of [
 edge=>{edge.extra=true;}, edge=>{delete edge.version;}, edge=>{edge.derivationVersion=2;},
 edge=>{edge.source.extra=1;}, edge=>{edge.source.saveId='save.foreign';}, edge=>{edge.source.manifestHash='b'.repeat(64);},
 edge=>{edge.source.recordIndex=1;}, edge=>{edge.source.operationId='wrong';}, edge=>{edge.source.revision++;},
 edge=>{edge.source.stateHash='b'.repeat(64);}, edge=>{edge.source.vectorHash='b'.repeat(64);}, edge=>{edge.source.rowCount=0;},
 edge=>{edge.cut.rowCount=0;}, edge=>{edge.cut.vectorHash='b'.repeat(64);},
 edge=>{edge.target.baselineRevision++;}, edge=>{edge.target.baselineStateHash='b'.repeat(64);}, edge=>{edge.target.bindingHash='b'.repeat(64);},
 edge=>{edge.target.saveId='save.foreign';}, edge=>{edge.target.slotType='checkpoint';},
 edge=>{edge.source.recordIndex=Number.MAX_SAFE_INTEGER+1;}, edge=>{edge.cut.rowCount=20001;},
 edge=>{edge.archive.path='v1/history-archives/../bad.json';}, edge=>{edge.archive.contentHash='b'.repeat(64);},
]) {
 const {save,options}=await candidate(), a=memory(baseline); mutate(options.inheritance);
 await assert.rejects(store(a,save,options)); assert.equal(a.writes.length,0);
}
for(const type of ['active','checkpoint']) {
 const {save,options}=await candidate(type), a=memory(baseline);
 save.state.campaign.title='forged narrative'; options.inheritance.target.baselineStateHash=await sha256Json(save.state);
 await assert.rejects(store(a,save,options), /exact derived state/); assert.equal(a.writes.length,0);
}
{
 const {save,options}=await candidate(), a=memory(baseline);
 options.runtimeAssets.packageData.name='other package with same ID';
 await assert.rejects(store(a,save,options), /Runtime assets differ/); assert.equal(a.writes.length,0);
}
for(const mode of ['missing','corrupt']) {
 const {save,options}=await candidate(), a=memory(baseline);
 if(mode==='missing') a.files.delete(archived.reference.path); else a.files.get(archived.reference.path).source.saveId='save.other';
 await assert.rejects(store(a,save,options)); assert.equal(a.writes.length,0);
}
for(const kind of ['base','manifest']) {
 const {save,options}=await candidate(), a=memory(baseline);
 a.files.set(kind==='base'?storage.V1_STORAGE_PATHS.saveBase(save.id):storage.V1_STORAGE_PATHS.save(save.id),{conflict:true});
 const before=a.snapshot(); await assert.rejects(store(a,save,options),/conflicts/); assert.deepEqual(a.snapshot(),before);
}
{
 const {save,options}=await candidate(), a=memory(baseline);
 // No live parent graph may be consulted during archive derivation.
 for(const path of [...a.files.keys()]) if(path.startsWith('v1/saves/')) a.files.delete(path);
 assert.equal((await store(a,save,options)).publication,'committed');
}
{
 const {save,options}=await candidate(), a=memory(baseline), expected=structuredClone(save), originalRead=a.readJson;
 let mutate=true;
 a.readJson=async path=>{ if(mutate){mutate=false; save.state.campaign.title='caller changed'; options.inheritance.source.operationId='changed'; options.runtimeAssets.packageData.name='changed';} return originalRead(path); };
 const published=await store(a,save,options); assert.equal(published.publication,'committed'); assert.deepEqual(published.save,expected);
}
console.log('PASS inheritance strict identities, complete derivation, archive isolation and detached inputs');

// Interrupted writes retain exact artifacts; canonical retry never reapplies custody.
for(const phase of ['base','manifest','index']) for(const mode of ['before','after','unreadable']) {
 const {save,options}=await candidate(), a=memory(baseline), path=phase==='base'?storage.V1_STORAGE_PATHS.saveBase(save.id):phase==='manifest'?storage.V1_STORAGE_PATHS.save(save.id):storage.V1_STORAGE_PATHS.index;
 const originalWrite=a.writeJson, originalRead=a.readJson; let fault=true, unreadable=false;
 a.writeJson=async (key,value)=>{if(key===path&&fault){fault=false;if(mode!=='before') await originalWrite(key,value); if(mode==='unreadable')unreadable=true;throw Error(`write ${phase} ${mode}`);}return originalWrite(key,value);};
 a.readJson=async key=>{if(unreadable && key===storage.V1_STORAGE_PATHS.save(save.id))throw Error('read unavailable');return originalRead(key);};
 const outcome=await store(a,save,options);
 assert.equal(outcome.publication,mode==='unreadable'?'uncertain':phase==='index'||(phase==='manifest'&&mode==='after')?'committed':'not-committed', `${phase}/${mode}`);
 assert.deepEqual(outcome.attemptedManifest.historyInheritance,options.inheritance); assert(outcome.error);
 if(outcome.publication==='committed') assert.equal(outcome.indexPending,phase==='index'&&mode==='after'?false:true);
 unreadable=false;
 const retry=await store(a,save,options); assert.equal(retry.publication,'committed'); assert.equal(retry.indexPending,false);
 assert.deepEqual(retry.save,save); assert.equal((await storage.getV1StorageIndex(a)).activeSaveId,id);
}
for(const drift of ['before','afterBase','afterManifest']) {
 const {save,options}=await candidate(), a=memory(baseline), originalWrite=a.writeJson;
 const change=()=>{a.files.get(storage.V1_STORAGE_PATHS.index).activeSaveId=null;};
 if(drift==='before')change();
 a.writeJson=async (key,value)=>{await originalWrite(key,value);if(key===(drift==='afterBase'?storage.V1_STORAGE_PATHS.saveBase(save.id):storage.V1_STORAGE_PATHS.save(save.id)))change();};
 if(drift==='before'){await assert.rejects(store(a,save,options),/pointer/);assert.equal(a.writes.length,0);}
 else {const result=await store(a,save,options);assert.equal(result.publication,drift==='afterBase'?'not-committed':'committed');assert.equal(result.indexPending,true);assert(!a.writes.includes(storage.V1_STORAGE_PATHS.index));}
 assert.equal((await storage.getV1StorageIndex(a)).activeSaveId,null);
}
console.log('PASS inheritance interrupted/write-then-throw outcomes, exact repair and pointer races');


// Preservation across ordinary publication, captured baseline/commit and neutral recovery.
{
 const {save,options}=await candidate(), a=memory(baseline), edge=structuredClone(options.inheritance);
 await store(a,save,options);
 await storage.storeV1CampaignSave(a,save,{makeActive:true}); // isolated fixture selects its child
 let current=save;
 const evolve=async()=>{
   let next=structuredClone(current.state);
   await createStateDeltaGateway({getState:()=>next,setState:value=>{next=value;}}).applyProposal({id:`inheritance.update.${next.stateCustody.revision}`,domains:['mission'],patch:{mission:{v1:{revision:next.mission.v1.revision+1}}}});
   return {...current,state:next};
 };
 const path=storage.V1_STORAGE_PATHS.save(save.id), ticket=storage.V1_STORAGE_PATHS.publicationIntent(save.id);
 let previous=current; current=await evolve();
 const ordinary=await storage.storeV1ActiveCampaignSaveWithOutcome(a,current,{expectedManifest:await a.readJson(path),previousSave:previous,expectedActiveSaveId:save.id});
 assert.equal(ordinary.publication,'committed'); assert.deepEqual(ordinary.manifest.historyInheritance,edge);
 async function rejectForgedIntent(original) {
   for(const mode of ['remove','replace','add']) {
     const intent=structuredClone(original);
     if(mode==='remove') delete intent.attemptedManifest.historyInheritance;
     if(mode==='replace') intent.attemptedManifest.historyInheritance.source.operationId='forged';
     if(mode==='add') delete intent.expectedManifest.historyInheritance;
     const {requestHash,...identity}=intent; intent.requestHash=await sha256Json(identity);
     a.files.set(ticket,intent);
     const rejected=await storage.resolveV1CampaignSavePublication(a,{saveId:save.id,requestHash:intent.requestHash});
     assert.equal(rejected.publication,'uncertain',mode);
     assert.equal((await storage.acknowledgeV1CampaignSavePublication(a,{saveId:save.id,requestHash:intent.requestHash})).acknowledged,false);
     assert(a.files.has(ticket));
   }
   a.files.set(ticket,original);
 }
 await rejectForgedIntent(ordinary.intent);
 assert.equal((await storage.acknowledgeV1CampaignSavePublication(a,{saveId:save.id,requestHash:ordinary.intent.requestHash})).acknowledged,true);
 current={...current,name:'Renamed child'};
 await storage.storeV1CampaignSave(a,current,{makeActive:false}); assert.deepEqual((await a.readJson(path)).historyInheritance,edge);
 const rowHashes=[...rows,await sha256Json('child row')];
 for(const mode of ['baseline','commit']) {
   const expectedManifest=await a.readJson(path);previous=current;
   if(mode==='commit')current=await evolve();
   const count=mode==='baseline'?1:2, hashes=rowHashes.slice(0,count);
   const captured=await storage.storeV1CampaignSaveWithCapture(a,current,{expectedManifest,previousSave:previous,expectedActiveSaveId:save.id,
     capture:{kind:'directive.authorityBoundaryCapture.v1',version:1,mode,operationId:`child.${mode}`,writerKind:'test',
       origin:{campaignId:current.campaignId,saveId:save.id,chatId:current.state.campaignChatBinding.chatId,entityType:'character',entityId:current.state.campaignChatBinding.entityId},
       packageFingerprint:await computeBranchHistoryPackageFingerprintV1(runtimeAssets),before:{revision:previous.state.stateCustody.revision,stateHash:await sha256Json(previous.state)},
       after:{revision:current.state.stateCustody.revision,stateHash:await sha256Json(current.state)},
       transcript:{projectionVersion:1,rowCount:count,rowHashes:hashes,vectorHash:await sha256Json(hashes)}}});
   assert.equal(captured.publication,'committed',JSON.stringify(captured));
   assert.deepEqual((await a.readJson(path)).historyInheritance,edge);
   await rejectForgedIntent(captured.intent);
   assert.equal((await storage.acknowledgeV1CampaignSavePublication(a,{saveId:save.id,requestHash:captured.intent.requestHash})).acknowledged,true);
 }
 current={...current,name:'Captured renamed child'};
 await storage.storeV1CampaignSave(a,current,{makeActive:false}); assert.deepEqual((await a.readJson(path)).historyInheritance,edge);
 const second=await createV1CapturedHistoryArchive(a,save.id,{expectedManifest:await a.readJson(path),transcript:{projectionVersion:1,rowCount:2,rowHashes,vectorHash:await sha256Json(rowHashes)}});
 assert.deepEqual(second.expectedManifest.historyInheritance,edge);
 // A local child archive remains self-contained; its inherited reference is retained, not recursively fetched.
 a.files.delete(archived.reference.path);
 const {loadV1CapturedHistoryArchive}=await import('../../src/storage/v1-captured-history-archive.mjs');
 const reopened=await loadV1CapturedHistoryArchive(a,second.reference);
 assert.deepEqual(reopened.expectedManifest.historyInheritance,edge);
 const cut=await storage.loadV1CampaignStateAtTranscriptCut(reopened.adapter,save.id,{expectedManifest:reopened.expectedManifest,transcript:reopened.transcript,retainedRowCount:1});
 assert.equal(cut.revision,1); assert.equal(cut.packageFingerprint,await computeBranchHistoryPackageFingerprintV1(runtimeAssets));
}
console.log('PASS ordinary/captured intent inheritance immutability and second-generation local archive');

for(const kind of ['base','manifest','foreign-index','dangling-index','accessor']) {
 const {save,options}=await candidate(), a=memory(baseline); let accessed=false;
 if(kind==='base'||kind==='manifest') a.files.set(kind==='base'?storage.V1_STORAGE_PATHS.saveBase(save.id):storage.V1_STORAGE_PATHS.save(save.id),null);
 if(kind==='foreign-index'||kind==='dangling-index') {
   if(kind==='foreign-index') await store(a,save,options);
   a.files.get(storage.V1_STORAGE_PATHS.index).saves[save.id]={id:'save.foreign',kind:save.kind};
 }
 if(kind==='accessor') Object.defineProperty(options.inheritance.source,'operationId',{enumerable:true,get(){accessed=true;return 'inheritance.baseline';}});
 const before=a.snapshot(), writes=a.writes.length;
 await assert.rejects(store(a,save,options)); assert.equal(a.writes.length,writes,kind); assert.deepEqual(a.snapshot(),before); assert.equal(accessed,false);
}
console.log('PASS null-object/index collisions and accessor rejection');

{
 const {save,options}=await candidate(), a=memory(baseline), read=a.readJson;
 let changed=false;
 a.readJson=async path=>{const value=await read(path);return value;};
 // Pointer drift during an awaited missing intent read must be seen before any target write.
 a.readJson=async path=>{if(!changed && path===storage.V1_STORAGE_PATHS.publicationIntent(id)){changed=true;a.files.get(storage.V1_STORAGE_PATHS.index).activeSaveId=null;}return read(path);};
 await assert.rejects(store(a,save,options), /pointer/); assert.equal(a.writes.length,0);
}
for(const place of ['options','assets']) {
 const {save,options}=await candidate(), a=memory(baseline); let accessed=false;
 if(place==='options')Object.defineProperty(options,'expectedActiveSaveId',{enumerable:true,get(){accessed=true;return id;}});
 else Object.defineProperty(options.runtimeAssets.packageData,'name',{enumerable:true,get(){accessed=true;return 'bad';}});
 await assert.rejects(store(a,save,options), /accessors/); assert.equal(accessed,false);assert.equal(a.writes.length,0);
}
console.log('PASS late intent-read pointer drift and descriptor-safe options/assets');

{
 const {save,options}=await candidate(), a=memory(baseline), read=a.readJson;
 let changed=false;
 a.readJson=async path=>{if(!changed && path===storage.V1_STORAGE_PATHS.save(save.id) && a.files.has(storage.V1_STORAGE_PATHS.saveBase(save.id))){changed=true;a.files.get(storage.V1_STORAGE_PATHS.index).activeSaveId=null;}return read(path);};
 const result=await store(a,save,options);assert.equal(result.publication,'not-committed');assert(!a.files.has(storage.V1_STORAGE_PATHS.save(save.id)));
}
console.log('PASS pointer drift during target collision read before first manifest');

// Existing controller-style checkpoint attestation is derived only from the exact retained rows.
const extendedSnapshot=structuredClone(sourceSnapshot);
extendedSnapshot.rows.push({id:'message.2',mes:'Uncaptured tail',is_user:false,extra:{futureField:1}});extendedSnapshot.rowCount++;
const extendedTranscript=(await projectBranchHistoryTranscriptV1(extendedSnapshot)).transcript;
const attestationAdapter=memory(baseline);
const extendedArchive=await createV1CapturedHistoryArchive(attestationAdapter,id,{expectedManifest:archived.expectedManifest,transcript:extendedTranscript});
async function attestedCandidate(){
 const item=await candidate('checkpoint');
 item.options.inheritance.archive=extendedArchive.reference;
 item.options.sourceSnapshot=structuredClone(extendedSnapshot);
 item.save.state.campaignChatBinding.transcriptAttestation=createNativeBranchTranscriptAttestation(extendedSnapshot.rows.slice(0,1));
 item.options.inheritance.target.baselineStateHash=await sha256Json(item.save.state);
 item.options.inheritance.target.bindingHash=await sha256Json(item.save.state.campaignChatBinding);
 return item;
}
{
 const {save,options}=await attestedCandidate(), a=memory(attestationAdapter.snapshot());
 const outcome=await store(a,save,options);assert.equal(outcome.publication,'committed');assert.deepEqual(outcome.save,save);
 assert.equal(outcome.save.state.campaignChatBinding.transcriptAttestation.messageCount,1);
 assert.equal((await store(a,save,options)).publication,'committed');
}
console.log('PASS exact retained-prefix checkpoint transcript attestation');

for(const mutate of [
 item=>{delete item.options.sourceSnapshot;},
 item=>{item.options.sourceSnapshot.rows[1].extra.futureField=2;},
 item=>{item.options.sourceSnapshot.rows.pop();item.options.sourceSnapshot.rowCount--;},
 item=>{item.options.sourceSnapshot.directiveBinding.entityName='forged display name';},
 item=>{item.options.sourceSnapshot.directiveBinding.saveId='save.foreign';},
 item=>{item.options.sourceSnapshot.nativeIdentity.chatId='chat.foreign';},
 item=>{item.options.sourceSnapshot.nativeIdentity.extra='unexpected';},
 item=>{item.options.sourceSnapshot.hostId='fake';},
 item=>{item.save.state.campaignChatBinding.transcriptAttestation=createNativeBranchTranscriptAttestation(extendedSnapshot.rows);},
 item=>{item.save.state.campaignChatBinding.transcriptAttestation.lineageHash='0'.repeat(16);},
 item=>{item.save.state.campaign.title='unauthorized narrative';},
]) {
 const item=await attestedCandidate(), a=memory(attestationAdapter.snapshot());mutate(item);
 item.options.inheritance.target.baselineStateHash=await sha256Json(item.save.state);
 item.options.inheritance.target.bindingHash=await sha256Json(item.save.state.campaignChatBinding);
 await assert.rejects(store(a,item.save,item.options));assert.equal(a.writes.length,0);
}
{
 const {save,options}=await attestedCandidate(), a=memory(attestationAdapter.snapshot()), read=a.readJson;
 let mutated=false;
 a.readJson=async path=>{if(!mutated){mutated=true;options.sourceSnapshot.rows[0].mes='caller mutation';options.sourceSnapshot.directiveBinding.chatId='chat.other';}return read(path);};
 const result=await store(a,save,options);assert.equal(result.publication,'committed');assert.deepEqual(result.save,save);
}
{
 const a=memory(baseline);let renamed=structuredClone(state);
 await createStateDeltaGateway({getState:()=>renamed,setState:value=>{renamed=value;}}).applyProposal({id:'inheritance.rename-binding',domains:['campaignChatBinding'],patch:{campaignChatBinding:{entityName:'New display name'}}});
 const save=storage.createV1CampaignSave({id,state:renamed,createdAt:now}), before=await a.readJson(storage.V1_STORAGE_PATHS.save(id));
 const captured=await storage.storeV1CampaignSaveWithCapture(a,save,{expectedManifest:before,previousSave:parent,expectedActiveSaveId:id,
 capture:{kind:'directive.authorityBoundaryCapture.v1',version:1,mode:'commit',operationId:'inheritance.renamed',writerKind:'test',
 origin:{campaignId:state.campaign.id,saveId:id,chatId:'chat.parent',entityType:'character',entityId:'entity.parent'},packageFingerprint:await computeBranchHistoryPackageFingerprintV1(runtimeAssets),
 before:boundary,after:{revision:renamed.stateCustody.revision,stateHash:await sha256Json(renamed)},transcript:extendedTranscript}});
 assert.equal(captured.publication,'not-committed');
 assert.equal(captured.error.code,'DIRECTIVE_V1_CAPTURE_INVALID');
 assert.match(captured.error.message,/ownership differs/);
 assert.deepEqual(await a.readJson(storage.V1_STORAGE_PATHS.save(id)),before);
 // Current captured writer disallows even ancillary binding changes; do not weaken it for this fixture.
}
console.log('PASS attestation forgeries, detached snapshot, and existing binding-mutation containment');
