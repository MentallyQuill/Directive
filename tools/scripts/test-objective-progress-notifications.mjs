import assert from 'node:assert/strict';
import { deriveGameplayNotifications } from '../../src/projection/v1/gameplay-notifications.mjs';
const projection = (objectives, revision = 1) => ({
  kind: 'directive.playerProjection.v1', revisions: {mission:revision,story:revision},
  mission: {kind:'directive.missionPlayerProjection.v1',missionId:'mission.remote',runId:'run.remote',revision,status:'active',objectives},
  people:{kind:'directive.peoplePlayerProjection.v1',people:[]}, ship:{kind:'directive.shipPlayerProjection.v1'}
});
const objective = {id:'objective.remote',title:'Resolve the dispute',status:'available',progressControl:{mode:'automatic',origin:'automatic',expectedRevision:2}};
const completed = {...objective,status:'terminal',disposition:'completed'};
let records = deriveGameplayNotifications({previousProjection:projection([objective]),nextProjection:projection([completed],2)});
assert.equal(records[0].progressAction.objectiveId, objective.id);
assert.equal(records[0].progressAction.expectedRunId,'run.remote');
assert.deepEqual(records[0].objectiveIds,[objective.id]);
const reopened = {...objective,progressControl:{mode:'confirmation_required',origin:'player',expectedRevision:3,decisionRevision:3}};
records = deriveGameplayNotifications({previousProjection:projection([completed],2),nextProjection:projection([reopened],3)});
assert.equal(records[0].title,'Objective reopened');
assert.equal(records[0].progressAction,undefined);
const proposed = {...reopened,progressControl:{...reopened.progressControl,proposal:{id:'proposal.1',disposition:'completed',label:'Completed'}}};
records=deriveGameplayNotifications({previousProjection:projection([reopened],3),nextProjection:projection([proposed],4)});
assert.equal(records[0].title,'Ready to complete?');
assert.equal(deriveGameplayNotifications({previousProjection:projection([proposed],4),nextProjection:projection([proposed],5)}).length,0);
records=deriveGameplayNotifications({previousProjection:projection([objective,{...objective,id:'objective.two'}]),nextProjection:projection([completed,{...completed,id:'objective.two'}],2)});
assert.equal(records[0].reviewObjectives,true);
assert.equal(records[0].progressAction,undefined);
const terminalMission = projection([completed], 8);
terminalMission.mission.status = 'terminal';
records = deriveGameplayNotifications({previousProjection:projection([objective],7),nextProjection:terminalMission});
assert.deepEqual(records[0].objectiveIds,[objective.id], 'mission completion must retire when a contributing objective is reopened');
console.log('Objective progress notification identities and feedback passed.');
