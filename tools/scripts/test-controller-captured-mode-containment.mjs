import assert from 'node:assert/strict';
import * as storage from '../../src/storage/v1-storage-repository.mjs';
import { createCampaignStartController } from '../../src/runtime/campaign-start-controller.mjs';
import { persistActiveCampaign } from '../../src/campaign/campaign-start-service.mjs';
import { createAshesInitialState,loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';
import { sha256Json } from '../../src/storage/v1-state-delta-codec.mjs';
const assets=loadAshesRuntimeAssets(), now='2026-09-15T12:00:00.000Z', id='save.mode.captured';
const files=new Map(),writes=[];
const adapter={async readJson(path){if(!files.has(path))throw Object.assign(Error('not found'),{code:'ENOENT'});return structuredClone(files.get(path));},async writeJson(path,value){writes.push(path);files.set(path,structuredClone(value));},async deleteJsonFile(path){writes.push(path);files.delete(path);}};
const state=createAshesInitialState({campaignId:'campaign.mode',saveId:id,chatId:'chat.mode'});
state.campaignChatBinding.entityType='character';state.campaignChatBinding.entityId='0';
const save=storage.createV1CampaignSave({id,state,createdAt:now});
await storage.storeV1CampaignSave(adapter,save);
const boundary={revision:0,stateHash:await sha256Json(state)},rows=[await sha256Json('row')];
const result=await storage.storeV1CampaignSaveWithCapture(adapter,save,{expectedManifest:await adapter.readJson(storage.V1_STORAGE_PATHS.save(id)),previousSave:save,expectedActiveSaveId:id,capture:{kind:'directive.authorityBoundaryCapture.v1',version:1,mode:'baseline',operationId:'mode.baseline',writerKind:'test',origin:{campaignId:state.campaign.id,saveId:id,chatId:'chat.mode',entityType:'character',entityId:'0'},packageFingerprint:'a'.repeat(64),before:boundary,after:boundary,transcript:{projectionVersion:1,rowCount:1,rowHashes:rows,vectorHash:await sha256Json(rows)}}});
await storage.acknowledgeV1CampaignSavePublication(adapter,{saveId:id,requestHash:result.intent.requestHash});
const controller=createCampaignStartController({adapter,packages:[assets.packageData],missionDefinitions:assets.missionDefinitions,now:()=>now});
await controller.initialize();
const start=writes.length;
await assert.rejects(controller.persistActiveCampaign({campaignState:state}),error=>error.code==='DIRECTIVE_V1_CAPTURE_REQUIRED');
assert.equal(writes.length,start);assert.equal(controller.getSavePublicationStatus(),null,'unsupported writer must not invent publication uncertainty');
assert.equal(controller.getSaveHistoryStatus().mode,'captured');
await assert.rejects(persistActiveCampaign({adapter,saveId:id,previousSave:save,campaignState:state,now,publicationOutcomes:true,expectedActiveSaveId:id}),error=>error.code==='DIRECTIVE_V1_CAPTURE_REQUIRED');
assert.equal(writes.length,start);
for(const action of [
 ()=>controller.createCheckpoint({name:'unsafe checkpoint',campaignState:state}),
 ()=>controller.prepareTimelineCheckpoint({name:'unsafe timeline checkpoint',checkpointId:'checkpoint.unsafe',campaignState:state}),
 ()=>controller.persistInactiveTimeline({save:{...save,id:'save.unsafe'}}),
]) {await assert.rejects(action,error=>error.code==='DIRECTIVE_V1_CAPTURE_REQUIRED');assert.equal(writes.length,start);}
assert.deepEqual((await controller.loadSaveRecord({saveId:id})).state,state);
assert.deepEqual((await controller.getCampaignView()).activeSaveId,id);
console.log('PASS captured controller/service mode containment before ordinary writes');

function memory(){const files=new Map(),writes=[];return {files,writes,async readJson(path){if(!files.has(path))throw Object.assign(Error('not found'),{code:'ENOENT'});return structuredClone(files.get(path));},async writeJson(path,value){writes.push(path);files.set(path,structuredClone(value));},async deleteJsonFile(path){writes.push(path);files.delete(path);}};}
const makeController=a=>createCampaignStartController({adapter:a,packages:[assets.packageData],missionDefinitions:assets.missionDefinitions,now:()=>now});
async function seed(a,value,{captured=false,makeActive=true}={}) {
 const record=storage.createV1CampaignSave({id:value.campaignChatBinding.saveId,state:value,createdAt:now});
 await storage.storeV1CampaignSave(a,record,{makeActive});
 if(captured){const boundary={revision:value.stateCustody.revision,stateHash:await sha256Json(value)};
 const result=await storage.storeV1CampaignSaveWithCapture(a,record,{expectedManifest:await a.readJson(storage.V1_STORAGE_PATHS.save(record.id)),previousSave:record,expectedActiveSaveId:makeActive?record.id:(await storage.getV1StorageIndex(a)).activeSaveId,
 capture:{kind:'directive.authorityBoundaryCapture.v1',version:1,mode:'baseline',operationId:`mode.${record.id}`,writerKind:'test',origin:{campaignId:record.campaignId,saveId:record.id,chatId:value.campaignChatBinding.chatId,entityType:'character',entityId:'0'},packageFingerprint:'a'.repeat(64),before:boundary,after:boundary,transcript:{projectionVersion:1,rowCount:1,rowHashes:rows,vectorHash:await sha256Json(rows)}}});
 assert.equal(result.publication,'committed',JSON.stringify(result));await storage.acknowledgeV1CampaignSavePublication(a,{saveId:record.id,requestHash:result.intent.requestHash});}
 return record;
}
{
 const a=memory(), ordinary=createAshesInitialState({campaignId:'campaign.ordinary',saveId:'save.mode.ordinary',chatId:'chat.ordinary'});
 const record=await seed(a,ordinary), c=makeController(a);await c.initialize();assert.equal(c.getSaveHistoryStatus().mode,'ordinary');
 let release, entered;const gate=new Promise(resolve=>{release=resolve;}), waiting=new Promise(resolve=>{entered=resolve;});const read=a.readJson;
 let hold=true;
 a.readJson=async path=>{if(hold&&path===storage.V1_STORAGE_PATHS.save(record.id)&&c.getSaveHistoryStatus()?.mode==='unknown'){hold=false;entered();await gate;}return read(path);};
 const first=c.loadSaveRecord({saveId:record.id});await waiting;
 assert.equal(c.getSaveHistoryStatus().mode,'unknown');const writesBefore=a.writes.length;
 await assert.rejects(c.persistActiveCampaign({campaignState:ordinary}),error=>error.code==='DIRECTIVE_V1_CAPTURE_MODE_UNAVAILABLE');assert.equal(a.writes.length,writesBefore);
 release();assert.deepEqual((await first).state,ordinary);assert.equal(c.getSaveHistoryStatus().mode,'ordinary');
 assert.deepEqual((await c.persistActiveCampaign({campaignState:ordinary})).state,ordinary);
 const checkpoint=await c.createCheckpoint({name:'ordinary checkpoint'});assert.equal(checkpoint.slotType,'checkpoint');
 assert.equal((await c.renameSavedGame({savedGameId:checkpoint.id,name:'renamed'})).name,'renamed');
}
console.log('PASS ordinary behavior and in-flight unknown-mode containment');
{
 const a=memory();await seed(a,state,{captured:true});
 const other=createAshesInitialState({campaignId:'campaign.other',saveId:'save.mode.other',chatId:'chat.other'});await seed(a,other,{makeActive:false});
 const c=makeController(a);await c.initialize();
 let release,entered;const gate=new Promise(resolve=>{release=resolve;}),waiting=new Promise(resolve=>{entered=resolve;});const read=a.readJson;let hold=true;
 a.readJson=async path=>{if(hold&&path===storage.V1_STORAGE_PATHS.save(id)&&c.getSaveHistoryStatus(id)?.mode==='unknown'){hold=false;entered();await gate;}return read(path);};
 const stale=c.loadSaveRecord({saveId:id});stale.catch(()=>{});await waiting;
 await c.loadGame({saveId:'save.mode.other'});release();
 await assert.rejects(stale,error=>error.code==='DIRECTIVE_V1_STATE_PERSISTENCE_CONFLICT');
 assert.equal(c.getActiveSave().id,'save.mode.other');assert.equal(c.getSaveHistoryStatus().mode,'ordinary');assert.equal(c.getSaveHistoryStatus(id).mode,'unknown');
 assert.deepEqual(c.getActiveCampaignState(),other);
}
console.log('PASS stale history read cannot adopt mode across selection');
{
 const old=structuredClone(state), version='0.3.0-pre-alpha.1';old.campaign.runtimeArchitecture.packageVersion=version;old.activeCampaignPackage.packageVersion=version;old.mission.v1.definitionVersion='1.0.0';old.mission.v1.packageBinding.packageVersion=version;
 const {migrateV1MissionClockRemoval}=await import('../../src/runtime/v1-mission-clock-removal-migration.mjs');
 assert.equal(migrateV1MissionClockRemoval({campaignState:old,packageData:assets.packageData,missionDefinitions:assets.missionDefinitions}).migrated,true,'fixture genuinely needs migration');
 const a=memory();await seed(a,old,{captured:true});const c=makeController(a), before=structuredClone(Object.fromEntries(a.files)), count=a.writes.length;
 await assert.rejects(c.initialize(),error=>error.code==='DIRECTIVE_V1_CAPTURE_REQUIRED');assert.equal(a.writes.length,count);assert.deepEqual(Object.fromEntries(a.files),before);
 assert.equal(c.getSaveHistoryStatus(id).mode,'captured');
 await assert.rejects(c.loadSaveRecord({saveId:id}),error=>error.code==='DIRECTIVE_V1_CAPTURE_REQUIRED');assert.equal(a.writes.length,count);
 const ordinary=memory();await seed(ordinary,old);const control=makeController(ordinary);await control.initialize();assert.equal(control.getActiveCampaignState().activeCampaignPackage.packageVersion,assets.packageData.manifest.version);
 assert.equal(control.getSaveHistoryStatus().mode,'ordinary');
}
console.log('PASS actual captured migration refusal and ordinary migration control');

{
 const a=memory();await seed(a,state);const c=makeController(a);await c.initialize();assert.equal(c.getSaveHistoryStatus().mode,'ordinary');
 await seed(a,state,{captured:true});const count=a.writes.length;
 await assert.rejects(c.persistActiveCampaign({campaignState:state}),error=>error.code==='DIRECTIVE_V1_CAPTURE_REQUIRED');
 assert.equal(a.writes.length,count);assert.equal(c.getSavePublicationStatus(),null);assert.equal(c.getSaveHistoryStatus().mode,'captured');
}
{
 const a=memory(),old=structuredClone(state),version='0.3.0-pre-alpha.1';old.campaign.runtimeArchitecture.packageVersion=version;old.activeCampaignPackage.packageVersion=version;old.mission.v1.definitionVersion='1.0.0';old.mission.v1.packageBinding.packageVersion=version;
 await seed(a,old,{captured:true});const other=createAshesInitialState({campaignId:'campaign.mode.selected',saveId:'save.mode.selected',chatId:'chat.selected'});await seed(a,other);
 const c=makeController(a);await c.initialize();const count=a.writes.length,index=await storage.getV1StorageIndex(a);
 await assert.rejects(c.loadGame({saveId:id}),error=>error.code==='DIRECTIVE_V1_CAPTURE_REQUIRED');assert.equal(a.writes.length,count);assert.deepEqual(await storage.getV1StorageIndex(a),index);assert.equal(c.getActiveSave().id,other.campaignChatBinding.saveId);
}
console.log('PASS external capture detection and migration refusal before selection writes');

{
 const a=memory();await seed(a,state);const other=createAshesInitialState({campaignId:'campaign.selection',saveId:'save.mode.selection',chatId:'chat.selection'});await seed(a,other,{makeActive:false});
 const c=makeController(a);await c.initialize();const read=a.readJson;let entered,release,hold=true;
 const waiting=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
 a.readJson=async path=>{if(hold&&path===storage.V1_STORAGE_PATHS.save(other.campaignChatBinding.saveId)){hold=false;entered();await gate;}return read(path);};
 const first=c.loadGame({saveId:other.campaignChatBinding.saveId});await waiting;const count=a.writes.length;
 await assert.rejects(c.loadGame({saveId:id}),error=>error.code==='DIRECTIVE_V1_STATE_PERSISTENCE_CONFLICT');assert.equal(a.writes.length,count);
 release();await first;assert.equal(c.getActiveSave().id,other.campaignChatBinding.saveId);assert.equal(c.getSaveHistoryStatus().mode,'ordinary');
}
console.log('PASS overlapping selection cannot overtake a pending load');

{
 const a=memory(),parent=createAshesInitialState({campaignId:'campaign.activation',saveId:'save.activation.parent',chatId:'chat.parent'}),old=createAshesInitialState({campaignId:'campaign.activation',saveId:'save.activation.old',chatId:'chat.old'});
 old.campaignChatBinding.entityType='character';old.campaignChatBinding.entityId='0';const version='0.3.0-pre-alpha.1';old.campaign.runtimeArchitecture.packageVersion=version;old.activeCampaignPackage.packageVersion=version;old.mission.v1.definitionVersion='1.0.0';old.mission.v1.packageBinding.packageVersion=version;
 await seed(a,parent);await seed(a,old,{captured:true,makeActive:false});const c=makeController(a);await c.initialize();const count=a.writes.length,index=await storage.getV1StorageIndex(a);
 await assert.rejects(c.activatePersistedTimeline({expectedSaveId:parent.campaignChatBinding.saveId,nextSaveId:old.campaignChatBinding.saveId}),error=>error.code==='DIRECTIVE_V1_CAPTURE_REQUIRED');
 assert.equal(a.writes.length,count);assert.deepEqual(await storage.getV1StorageIndex(a),index);assert.deepEqual(c.getActiveCampaignState(),parent);assert.equal(c.getActiveSave().id,parent.campaignChatBinding.saveId);
}
{
 const a=memory(),parent=createAshesInitialState({campaignId:'campaign.load-race',saveId:'save.load.parent',chatId:'chat.parent'}),target=createAshesInitialState({campaignId:'campaign.load-race',saveId:'save.load.target',chatId:'chat.target'});
 await seed(a,parent);const record=await seed(a,target,{makeActive:false}),oldMap=structuredClone(Object.fromEntries(a.files));
 const changed=structuredClone(target);changed.stateCustody.revision++;changed.stateCustody.recentCommitIds.push('probe.update');
 await storage.storeV1CampaignSave(a,{...record,state:changed},{makeActive:false,previousSave:record});const newMap=structuredClone(Object.fromEntries(a.files));a.files.clear();for(const [key,value]of Object.entries(oldMap))a.files.set(key,value);
 const c=makeController(a);await c.initialize();const read=a.readJson;let reads=0;
 a.readJson=async path=>{if(path===storage.V1_STORAGE_PATHS.save(record.id)&&++reads===3){a.files.clear();for(const [key,value]of Object.entries(newMap))a.files.set(key,value);}return read(path);};
 await assert.rejects(c.loadGame({saveId:record.id}),error=>error.code==='DIRECTIVE_V1_STATE_PERSISTENCE_CONFLICT');
 assert.deepEqual(c.getActiveCampaignState(),parent);assert.equal(c.getActiveSave().id,parent.campaignChatBinding.saveId);
 assert.equal((await storage.loadV1CampaignSave(a,record.id)).state.stateCustody.revision,1);
}
console.log('PASS migration eligibility before CAS and no stale activation-load adoption');

for(const method of ['loadGame','activatePersistedTimeline']) for(const swapRead of [3,4]) {
 const a=memory(),parent=createAshesInitialState({campaignId:'campaign.mode.swap',saveId:'save.swap.parent',chatId:'chat.parent'}),target=createAshesInitialState({campaignId:'campaign.mode.swap',saveId:'save.swap.target',chatId:'chat.target'});
 target.campaignChatBinding.entityType='character';target.campaignChatBinding.entityId='0';await seed(a,parent);await seed(a,target,{makeActive:false});
 const ordinaryMap=structuredClone(Object.fromEntries(a.files));await seed(a,target,{makeActive:false,captured:true});const capturedMap=structuredClone(Object.fromEntries(a.files));a.files.clear();for(const [key,value]of Object.entries(ordinaryMap))a.files.set(key,value);
 const c=makeController(a);await c.initialize();const index=await storage.getV1StorageIndex(a),count=a.writes.length,read=a.readJson;let reads=0;
 a.readJson=async path=>{if(path===storage.V1_STORAGE_PATHS.save(target.campaignChatBinding.saveId)&&++reads===swapRead){a.files.clear();for(const [key,value]of Object.entries(capturedMap))a.files.set(key,value);}return read(path);};
 await assert.rejects(method==='loadGame'?c.loadGame({saveId:target.campaignChatBinding.saveId}):c.activatePersistedTimeline({expectedSaveId:parent.campaignChatBinding.saveId,nextSaveId:target.campaignChatBinding.saveId}),error=>error.code==='DIRECTIVE_V1_STATE_PERSISTENCE_CONFLICT');
 assert.equal(a.writes.length,count,`${method}/${swapRead}`);assert.deepEqual(await storage.getV1StorageIndex(a),index);assert.equal(c.getActiveSave().id,parent.campaignChatBinding.saveId);assert.deepEqual(c.getActiveCampaignState(),parent);
}
console.log('PASS same-state captured target swaps rejected before activation writes');

{
 const a=memory(),parent=createAshesInitialState({campaignId:'campaign.cas.race',saveId:'save.cas.parent',chatId:'chat.parent'}),target=createAshesInitialState({campaignId:'campaign.cas.race',saveId:'save.cas.target',chatId:'chat.target'}),newer=createAshesInitialState({campaignId:'campaign.cas.race',saveId:'save.cas.newer',chatId:'chat.newer'});
 await seed(a,parent);const record=await seed(a,target,{makeActive:false});await seed(a,newer,{makeActive:false});
 const manifest=await a.readJson(storage.V1_STORAGE_PATHS.save(record.id)),read=a.readJson;let reads=0,countAfterSelection;
 a.readJson=async path=>{if(path===storage.V1_STORAGE_PATHS.save(record.id)&&++reads===2){await storage.loadV1CampaignSave(a,newer.campaignChatBinding.saveId,{makeActive:true});countAfterSelection=a.writes.length;}return read(path);};
 await assert.rejects(storage.compareAndSwapActiveV1CampaignSave(a,{expectedSaveId:parent.campaignChatBinding.saveId,nextSaveId:record.id,expectedTargetSave:record,expectedTargetManifest:manifest}),error=>error.code==='DIRECTIVE_V1_ACTIVE_SAVE_CAS_MISMATCH');
 assert.equal((await storage.getV1StorageIndex(a)).activeSaveId,newer.campaignChatBinding.saveId);assert.equal(a.writes.length,countAfterSelection,'failed CAS must not write after newer selection');
}
console.log('PASS guarded CAS preserves newer selection during target verification');
