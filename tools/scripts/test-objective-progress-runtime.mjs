import assert from 'node:assert/strict';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
import { createInitialMissionJourney } from '../../src/mission/v1/mission-journey.mjs';
import { createV1MissionRuntime } from '../../src/runtime/v1-mission-runtime.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { createAshesInitialState,loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';
const runtimeAssets=loadAshesRuntimeAssets();
const definition=runtimeAssets.missionDefinitions[0].definition || runtimeAssets.missionDefinitions[0];
let state=createAshesInitialState({campaignId:'campaign.test',saveId:'save.test',chatId:'chat.test'});
const journey=createInitialMissionJourney({definition,branchId:'save.test'});
state.mission={activeMissionId:definition.packageBinding.sourceId,v1:createMissionState({definition,branchId:'save.test'}),v1Journey:journey.journey,v1History:journey.history};
let failPersistence=false;
const gateway=createStateDeltaGateway({getState:()=>state,setState:next=>{state=next;},persist:async()=>{if(failPersistence)throw new Error('write failed');}});
const runtime=createV1MissionRuntime({getState:()=>state,stateDeltaGateway:gateway});
const objective=definition.objectives.find(item=>state.mission.v1.objectives[item.id].visibility==='visible');
const args=()=>({runtimeAssets,missionId:definition.id,objectiveId:objective.id,expectedRevision:state.mission.v1.revision,expectedRunId:state.mission.v1Journey.activeRunId});
const resolved=await runtime.adjustObjectiveProgress({...args(),action:'resolve',disposition:objective.terminalWhen[0].disposition});
assert.equal(resolved.ok,true,JSON.stringify(resolved));
assert.equal(state.mission.v1.objectives[objective.id].state,'terminal');
const stale=await runtime.adjustObjectiveProgress({...args(),expectedRevision:0,action:'reopen'});
assert.equal(stale.reasonCode,'objective-stale');
const reopened=await runtime.adjustObjectiveProgress({...args(),action:'reopen'});
assert.equal(reopened.ok,true,JSON.stringify(reopened));
assert.notEqual(state.mission.v1.objectives[objective.id].state,'terminal');
const copy=structuredClone(state);
failPersistence=true;
const failed=await runtime.adjustObjectiveProgress({...args(),action:'resolve',disposition:objective.terminalWhen[0].disposition});
assert.equal(failed.ok,false);
assert.deepEqual(state,copy);


failPersistence=false;
for (const item of definition.objectives) { item.class = 'optional'; item.activatedAs = null; } definition.closeWhen = false;
definition.commandBearingAwards.push({id:'award.controlled-objective',sourceObjectiveId:objective.id,eligibleDispositions:[objective.terminalWhen[0].disposition],reason:'Controlled mechanical reward fixture.'});
{ const result = await runtime.adjustObjectiveProgress({...args(),action:'resolve',disposition:objective.terminalWhen[0].disposition}); assert.equal(result.ok,true,JSON.stringify(result)); }
assert.equal(state.commandBearing.balance,1);
{ const result = await runtime.adjustObjectiveProgress({...args(),action:'resolve',disposition:objective.terminalWhen[0].disposition}); assert.equal(result.ok,true,JSON.stringify(result)); }
assert.equal(state.commandBearing.balance,1);
assert.equal((await runtime.adjustObjectiveProgress({...args(),action:'reopen'})).ok,true);
assert.equal(state.commandBearing.balance,0);
{ const result = await runtime.adjustObjectiveProgress({...args(),action:'resolve',disposition:objective.terminalWhen[0].disposition}); assert.equal(result.ok,true,JSON.stringify(result)); }
assert.equal(state.commandBearing.balance,1);
const {reserveV1CommandBearingEdge}=await import('../../src/command/v1-command-bearing.mjs');
state.commandBearing=reserveV1CommandBearingEdge(state.commandBearing,{spendId:'spend.test',reason:'Controlled spending fixture.'}).commandBearing;
const beforeSpentCorrection=structuredClone(state);
assert.equal((await runtime.adjustObjectiveProgress({...args(),action:'reopen'})).reasonCode,'objective-checkpoint-required');
assert.deepEqual(state,beforeSpentCorrection);



const controller = new AbortController();
let interpreterEntered = false;
const abortIgnoringRuntime = createV1MissionRuntime({
    getState: () => state,
    stateDeltaGateway: gateway,
    interpretAcceptedPair: async () => {
        interpreterEntered = true;
        controller.abort();
        return { ok: true, proposal: { claims: [] } };
    },
});
const snapshot = {
    kind: 'directive.acceptedPairSnapshot.v1',
    envelope: {
        campaignId: 'campaign.test', saveId: 'save.test', chatId: 'chat.test',
        packageId: definition.packageBinding.packageId,
        packageVersion: definition.packageBinding.packageVersion,
        activeMissionId: definition.packageBinding.sourceId,
    },
    source: {
        sourceRangeHash: 'range.abort',
        previousAssistant: {
            hostMessageId: 'message.abort-assistant', role: 'assistant',
            text: 'The watch is ready to proceed.', textHash: 'a'.repeat(64),
            sourceIntegrity: 'clean', selectedVariant: { selectedSwipeId: 'swipe.abort', textHash: 'a'.repeat(64) },
        },
        currentPlayer: {
            hostMessageId: 'message.abort-player', role: 'user',
            text: 'I accept the watch.', textHash: 'b'.repeat(64), sourceIntegrity: 'clean',
        },
    },
};
const beforeAbort = structuredClone(state);
const aborted = await abortIgnoringRuntime.settleAcceptedPair({ runtimeAssets, snapshot, signal: controller.signal });
assert.equal(interpreterEntered, true);
assert.equal(aborted.reasonCode, 'provider-aborted');
assert.deepEqual(state, beforeAbort);
console.log('Objective progress runtime passed');
