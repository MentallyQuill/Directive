import assert from 'node:assert/strict';
import {loadAshesRuntimeAssets} from './v1-test-fixtures.mjs';
import {createMissionState} from '../../src/mission/v1/mission-state.mjs';
import {reduceMissionEvidence} from '../../src/mission/v1/mission-reducer.mjs';
import {adjustMissionObjectiveProgress} from '../../src/mission/v1/objective-progress.mjs';
import {validateMissionStateAuthority} from '../../src/mission/v1/mission-state-authority.mjs';
import {disableScenePacingForFixture} from './unpaced-mission-fixture.mjs';
import {sceneAllowsReport,gateScenePacingClaims} from '../../src/narration/scene-pacing.mjs';
const definitions=loadAshesRuntimeAssets().missionDefinitions;
for (const definition of definitions) {
    const legacy=disableScenePacingForFixture(structuredClone(definition));
    const oldState=createMissionState({definition:legacy,branchId:'legacy'});
    assert.equal(validateMissionStateAuthority({definition,state:oldState}).ok,true,`${definition.id}: additive pacing must preserve old initial authority`);
    assert.ok(definition.scenePacing?.activationEventId,`${definition.id} needs pacing authority`);
    for (const route of definition.reportRoutes) {
        assert.ok(route.sceneObjectiveIds?.length,`${route.id} needs authored scene membership`);
        for (const objectiveId of route.sceneObjectiveIds) {
            assert.ok(definition.objectives.some(objective=>objective.id===objectiveId));
            const state=createMissionState({definition,branchId:'test'});
            const receipts=[{scenePacing:{missionId:definition.id,objectiveId,intent:'continue',ready:false}}];
            assert.equal(sceneAllowsReport({definition,state,receipts,route}),true,`${route.id} can enter its scene before completion`);
        }
    }
}
const definition=definitions.find(item=>item.id==='mission.epilogue-the-terms-we-keep');
const objective=definition.objectives[0];
let state=createMissionState({definition,branchId:'test'});
const claim=(type,target,id)=>({claimId:id,claimType:type,targetId:target,evidenceKey:id,sourceContributionId:id});
const finding=claim('factDisclosed','fact.epilogue.aftermath-record','finding');
const oldDefinition=disableScenePacingForFixture(structuredClone(definition));
const oldCompleted=reduceMissionEvidence({definition:oldDefinition,state:createMissionState({definition:oldDefinition,branchId:'test'}),acceptedClaims:[finding]}).state;
assert.equal(validateMissionStateAuthority({definition,state:oldCompleted}).ok,true,'old completed evidence replays before pacing activation');
const upgraded=reduceMissionEvidence({definition,state:oldCompleted,acceptedClaims:[claim('eventOccurred',definition.scenePacing.activationEventId,'upgrade')]}).state;
assert.equal(upgraded.objectives[objective.id].state,'terminal','activation must not erase an existing completed scene');
state=reduceMissionEvidence({definition,state,acceptedClaims:[claim('eventOccurred',definition.scenePacing.activationEventId,'activation'),finding]}).state;
assert.ok(state.knownFacts.includes(finding.targetId));
assert.notEqual(state.objectives[objective.id].state,'terminal','a finding alone must not finish an unplayed scene');
state=reduceMissionEvidence({definition,state,acceptedClaims:[{...claim('outcomeObserved',objective.scenePacing.authorizationOutcomeId,'participation'),value:'authorized'}]}).state;
assert.equal(state.objectives[objective.id].state,'terminal','earned participation releases completion after findings');
const reopened=adjustMissionObjectiveProgress({definition,state,objectiveId:objective.id,action:'reopen'}).state;
assert.ok(reopened.objectiveDecisions[objective.id].rejectedEvidenceKeys.includes('participation'));
const resumed=adjustMissionObjectiveProgress({definition,state:reopened,objectiveId:objective.id,action:'resume'}).state;
assert.notEqual(resumed.objectives[objective.id].state,'terminal','resuming cannot reuse rejected pacing authorization');
const chapter3=definitions.find(item=>item.id==='mission.chapter-3-dead-letters');
for (const interval of definitions.filter(item=>item.id.includes('open-orders-'))) {
    const conclusion=interval.objectives[0];
    const prefix=conclusion.id.split('.')[1];
    const ended=reduceMissionEvidence({definition:{...interval,closeWhen:false},state:createMissionState({definition:interval,branchId:'departure'}),acceptedClaims:[
        claim('eventOccurred',interval.scenePacing.activationEventId,'active'),
        {...claim('decisionRecorded',`outcome.${prefix}.conclusion`,'player-departure'),value:'departEarly'},
    ]}).state;
    assert.equal(ended.objectives[conclusion.id].disposition,'completedWithCost','explicit authored early departure must not require playing declined assignments');
}
const withdrawal=['leftInPlace','notRecovered'].map((value,index)=>({claimType:'outcomeObserved',targetId:`outcome.chapter3.${index?'archive':'relay'}-result`,value,sourceRef:{role:'assistant'}}));
assert.equal(gateScenePacingClaims({definition:chapter3,claims:withdrawal}).acceptedClaims.length,2,'supported withdrawal consequences remain possible');
console.log('All reports admit current-scene findings; completion and withdrawal remain distinct.');
