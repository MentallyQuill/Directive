import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
import { reduceMissionEvidence } from '../../src/mission/v1/mission-reducer.mjs';
import { adjustMissionObjectiveProgress, rebuildObjectiveProgress } from '../../src/mission/v1/objective-progress.mjs';
import { validateMissionStateAuthority } from '../../src/mission/v1/mission-state-authority.mjs';
const definition = JSON.parse(fs.readFileSync('tests/fixtures/mission/v1/v1-hesperus-reference.fixture.json'));
const objectiveId = 'objective.hesperus-rescue';
const initial = createMissionState({definition, branchId:'save.test'});
const manual = adjustMissionObjectiveProgress({definition,state:initial,objectiveId,action:'resolve',disposition:'completed'}).state;
assert.equal(manual.objectives[objectiveId].state,'terminal');
assert.deepEqual(manual.events,[]);
assert.deepEqual(manual.evidenceLog,[]);
assert.equal(validateMissionStateAuthority({definition,state:manual}).ok,true);
const claim = {claimId:'claim.rescue',claimType:'eventOccurred',targetId:'event.hesperus-survivors-transferred',evidenceKey:'evidence.rescue',sourceContributionId:'source.rescue'};
const automatic = reduceMissionEvidence({definition,state:initial,acceptedClaims:[claim]}).state;
const reopened = adjustMissionObjectiveProgress({definition,state:automatic,objectiveId,action:'reopen'}).state;
assert.notEqual(reopened.objectives[objectiveId].state,'terminal');
assert.equal(validateMissionStateAuthority({definition,state:reopened}).ok,true);
assert.notEqual(reduceMissionEvidence({definition,state:reopened,acceptedClaims:[claim]}).state.objectives[objectiveId].state,'terminal');
const proposed = reduceMissionEvidence({definition,state:reopened,acceptedClaims:[{...claim,claimId:'claim.new',evidenceKey:'evidence.new',sourceContributionId:'source.new',materiallyNewEvidence:true}]}).state;
assert.notEqual(proposed.objectives[objectiveId].state,'terminal');
assert.ok(proposed.objectiveDecisions[objectiveId].proposal);
const accepted=adjustMissionObjectiveProgress({definition,state:proposed,objectiveId,action:'acceptProposal',proposalId:proposed.objectiveDecisions[objectiveId].proposal.id}).state;
assert.equal(accepted.objectives[objectiveId].state,'terminal');
assert.equal(validateMissionStateAuthority({definition,state:accepted}).ok,true);


const repeated = reduceMissionEvidence({definition,state:reopened,acceptedClaims:[{...claim,evidenceKey:'repeat.other-message',sourceContributionId:'source.repeat'}]}).state;
assert.equal(repeated.objectiveDecisions[objectiveId].proposal,null);
assert.notEqual(repeated.objectives[objectiveId].state,'terminal');
assert.equal(validateMissionStateAuthority({definition,state:repeated}).ok,true);
const resumed=adjustMissionObjectiveProgress({definition,state:reopened,objectiveId,action:'resume'}).state;
const oldAfterResume=reduceMissionEvidence({definition,state:resumed,acceptedClaims:[{...claim,evidenceKey:'repeat.after-resume'}]}).state;
assert.notEqual(oldAfterResume.objectives[objectiveId].state,'terminal');
const dismissed=adjustMissionObjectiveProgress({definition,state:proposed,objectiveId,action:'dismissProposal'}).state;
assert.equal(dismissed.objectiveDecisions[objectiveId].proposal,null);
assert.equal(validateMissionStateAuthority({definition,state:dismissed}).ok,true);

// A later related cost must not replace the actual first resolution cause.
const laterCost=reduceMissionEvidence({definition,state:automatic,acceptedClaims:[{claimId:'claim.cost',claimType:'outcomeObserved',targetId:'outcome.hesperus-rescue-cost',value:'material',evidenceKey:'evidence.cost',sourceContributionId:'source.cost'}]}).state;
const correctedCost=adjustMissionObjectiveProgress({definition,state:laterCost,objectiveId,action:'reopen'}).state;
assert.equal(correctedCost.objectiveDecisions[objectiveId].proposal,null);
assert.equal(correctedCost.outcomes['outcome.hesperus-rescue-cost'],'material');
assert.ok(correctedCost.objectiveDecisions[objectiveId].rejectedEvidenceKeys.includes(claim.evidenceKey));
assert.ok(!correctedCost.objectiveDecisions[objectiveId].rejectedEvidenceKeys.includes('evidence.cost'));
const conditional=structuredClone(definition);
conditional.objectives.find(item=>item.id===objectiveId).visibleWhen={eventOccurred:claim.targetId};
const revealed=reduceMissionEvidence({definition:conditional,state:createMissionState({definition:conditional,branchId:'save.test'}),acceptedClaims:[claim]}).state;
const setConditional=adjustMissionObjectiveProgress({definition:conditional,state:revealed,objectiveId,action:'resolve',disposition:'completed'}).state;
assert.equal(setConditional.objectives[objectiveId].visibility,'resolved');
// Independent package and objective identifiers exercise the same control implementation.
const independent=JSON.parse(JSON.stringify(definition).replaceAll('hesperus','survey').replaceAll('breckenridge','science-vessel'));
const independentState=adjustMissionObjectiveProgress({definition:independent,state:createMissionState({definition:independent,branchId:'save.independent'}),objectiveId:'objective.survey-rescue',action:'resolve',disposition:'completed'}).state;
assert.equal(independentState.objectives['objective.survey-rescue'].disposition,'completed');
assert.deepEqual(independentState.evidenceLog,[]);
const reversed = structuredClone(definition);
const dependent = structuredClone(reversed.objectives.find(item => item.id === objectiveId));
dependent.id = 'objective.dependent';
dependent.terminalWhen = [{ disposition: 'completed', when: { objectiveDisposition: { id: objectiveId, equals: 'completed' } } }];
reversed.objectives.unshift(dependent);
const dependencyResolved = adjustMissionObjectiveProgress({
    definition: reversed, state: createMissionState({ definition: reversed, branchId: 'save.dependencies' }),
    objectiveId, action: 'resolve', disposition: 'completed',
}).state;
assert.equal(dependencyResolved.objectives[dependent.id].state, 'terminal');
// A manual replacement must retire the automatic result, without inventing another outcome.
const replaced = adjustMissionObjectiveProgress({
    definition, state: laterCost, objectiveId, action: 'resolve', disposition: 'completedWithCost',
}).state;
assert.equal(replaced.objectives[objectiveId].disposition, 'completedWithCost');
assert.ok(!replaced.events.includes(claim.targetId));
assert.equal(replaced.outcomes['outcome.hesperus-rescue-cost'], 'material');
assert.ok(replaced.objectiveDecisions[objectiveId].rejectedEvidenceKeys.includes(claim.evidenceKey));
assert.equal(validateMissionStateAuthority({ definition, state: replaced }).ok, true);
assert.equal(replaced.outcomeDimensions['dimension.lives-protected'], 'full-with-cost');
const evidenceDimensionDefinition = structuredClone(definition);
evidenceDimensionDefinition.outcomeDimensions.push({
    id: 'dimension.direct-evidence', playerText: { label: 'Reported transfer' },
    derive: [{ value: 'reported', priority: 1, when: { eventOccurred: claim.targetId } }],
});
const evidenceDimensionState = reduceMissionEvidence({
    definition: evidenceDimensionDefinition,
    state: createMissionState({ definition: evidenceDimensionDefinition, branchId: 'save.dimension' }),
    acceptedClaims: [claim],
}).state;
assert.equal(evidenceDimensionState.outcomeDimensions['dimension.direct-evidence'], 'reported');
const correctedDimensionState = adjustMissionObjectiveProgress({
    definition: evidenceDimensionDefinition, state: evidenceDimensionState,
    objectiveId, action: 'resolve', disposition: 'completedWithCost',
}).state;
assert.equal(Object.hasOwn(correctedDimensionState.outcomeDimensions, 'dimension.direct-evidence'), false);
// Player-set progress is authority before replay checks later policy prerequisites.
const gatedDefinition = structuredClone(definition);
gatedDefinition.evidencePolicies.find(policy => policy.id === 'policy.hesperus-discrepancy-established').when = {
    objectiveState: { id: objectiveId, equals: 'terminal' },
};
const manualGate = adjustMissionObjectiveProgress({
    definition: gatedDefinition,
    state: createMissionState({ definition: gatedDefinition, branchId: 'save.gated' }),
    objectiveId, action: 'resolve', disposition: 'completed',
}).state;
const gatedClaim = {
    claimId: 'claim.after-manual', policyId: 'policy.hesperus-discrepancy-established',
    claimType: 'worldFactEstablished', targetId: 'fact.hesperus-discrepancy-known',
    evidenceKey: 'evidence.after-manual', sourceContributionId: 'source.after-manual',
};
const afterManual = reduceMissionEvidence({ definition: gatedDefinition, state: manualGate, acceptedClaims: [gatedClaim] }).state;
assert.ok(afterManual.worldFacts.includes(gatedClaim.targetId));
const rebuiltManualGate = rebuildObjectiveProgress(gatedDefinition, afterManual);
assert.ok(rebuiltManualGate.worldFacts.includes(gatedClaim.targetId));
assert.ok(!rebuiltManualGate.objectiveDecisions[objectiveId].rejectedEvidenceKeys.includes(gatedClaim.evidenceKey));
assert.equal(validateMissionStateAuthority({ definition: gatedDefinition, state: afterManual }).ok, true);
console.log('Objective progress core passed');
