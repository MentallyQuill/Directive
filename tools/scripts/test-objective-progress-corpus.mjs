import assert from 'node:assert/strict';
import { loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
import { adjustMissionObjectiveProgress } from '../../src/mission/v1/objective-progress.mjs';
import { validateMissionStateAuthority } from '../../src/mission/v1/mission-state-authority.mjs';
// Mechanical control coverage: retain every authored disposition/predicate, isolate visibility and closure.
// This does not claim narrative evidence classification or actual chapter play coverage.
let objectives=0,dispositions=0;
for (const source of loadAshesRuntimeAssets().missionDefinitions) {
  const definition=structuredClone(source.definition || source);
  definition.closeWhen=false;
  for (const item of definition.objectives) {item.class='optional';item.activatedAs=null;item.activationWhen=true;item.visibleWhen=true;item.availableWhen=true;}
  for (const objective of definition.objectives) {
    objectives++;
    for (const disposition of new Set(objective.terminalWhen.map(rule=>rule.disposition))) {
      dispositions++;
      const initial=createMissionState({definition,branchId:'save.corpus'});
      const result=adjustMissionObjectiveProgress({definition,state:initial,objectiveId:objective.id,action:'resolve',disposition}).state;
      assert.equal(result.objectives[objective.id].disposition,disposition,objective.id);
      assert.equal(result.objectives[objective.id].visibility,'resolved');
      assert.deepEqual(result.events,initial.events);
      assert.deepEqual(result.outcomes,initial.outcomes);
      assert.deepEqual(result.evidenceLog,[]);
      const validation=validateMissionStateAuthority({definition,state:JSON.parse(JSON.stringify(result))});
      assert.equal(validation.ok,true,`${objective.id}: ${validation.errors.join('; ')}`);
    }
  }
}
assert.equal(objectives,50);
console.log(`Objective controls corpus passed: 13 missions, ${objectives} objectives, ${dispositions} dispositions (mechanical isolation).`);
