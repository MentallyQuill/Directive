import assert from 'node:assert/strict';
import { buildCertifiedMissionView } from '../../src/ui/view-models/certified-mission-view.mjs';
const progressControl = { mode:'player_set', expectedRevision:4, allowedResolutions:[{disposition:'handedOff',label:'Handed over'}] };
const model = buildCertifiedMissionView({mission:{kind:'directive.missionPlayerProjection.v1',missionId:'different-mission',runId:'occurrence-2',objectives:[{id:'different-objective',class:'required',progressControl}]}});
assert.deepEqual(model.missions[0].requiredObjectives[0].progressControl, progressControl, 'Certified view must preserve canonical controls');
assert.equal(model.missions[0].runId,'occurrence-2');
console.log('Objective progress UI projection passed');
