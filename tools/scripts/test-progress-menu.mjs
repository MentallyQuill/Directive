import assert from 'node:assert/strict';
import * as activity from '../../src/hosts/sillytavern/turn-activity-indicator.js';
const snapshot = () => activity.__directiveTurnActivityTestHooks.progress();
activity.markDirectiveTurnActivity({hostGeneration:true});
for(let run=0;run<3;run++) {
  for(const stage of ['building-context','assembling-prompt','installing-prompt']) {
    const operationId=`${stage}-${run}`;
    activity.recordDirectiveTurnProgress({type:'start',operationId,stage,startedAt:performance.now()});
    activity.recordDirectiveTurnProgress({type:'finish',operationId,outcome:'complete',endedAt:performance.now()});
  }
}
assert.ok(Array.isArray(snapshot().rows), 'activity exposes purposeful grouped rows rather than a flat audit log');
const context=snapshot().rows.find(row=>row.id==='turn-context');
assert.equal(context.children.length,3,'only observed context steps appear');
assert.deepEqual(context.children.map(row=>row.label),['Read campaign state','Assemble reply context','Install reply context']);
assert.equal(context.children.every(row=>row.count===3),true,'repeated refreshes retain honest counts without duplicate parent rows');
assert.equal(context.children.every(row=>row.duration==='<1s'),true,'subsecond work is not presented as multiple zero-second steps');
activity.recordDirectiveTurnProgress({type:'start',operationId:'interpret',stage:'reviewing-events',startedAt:performance.now()});
activity.recordDirectiveTurnProgress({type:'update',operationId:'interpret',phase:'waiting-model',phaseStartedAt:performance.now(),attempt:1});
activity.recordDirectiveTurnProgress({type:'update',operationId:'interpret',phase:'validating-response',phaseStartedAt:performance.now()});
activity.recordDirectiveTurnProgress({type:'finish',operationId:'interpret',outcome:'failed',endedAt:performance.now()});
const model=snapshot().rows.find(row=>row.id==='interpret');
assert.deepEqual(model.children.map(row=>row.label),['Wait for model response','Validate model response']);
assert.equal(model.state,'failed');
assert.equal(model.children[1].state,'failed','failed validation is never labeled done');
assert.equal(model.children[0].state,'complete','validation beginning proves response received');
activity.recordDirectiveTurnProgress({type:'start',operationId:'install-failed',stage:'installing-prompt',startedAt:performance.now()});
activity.recordDirectiveTurnProgress({type:'finish',operationId:'install-failed',outcome:'failed',endedAt:performance.now()});
assert.equal(snapshot().rows.find(row=>row.id==='turn-context').state,'failed','aggregation does not hide earlier failures');
activity.recordDirectiveTurnProgress({type:'start',operationId:'director',stage:'directing-story',startedAt:performance.now()});
activity.recordDirectiveTurnProgress({type:'update',operationId:'director',phase:'waiting-model',phaseStartedAt:performance.now(),attempt:1});
activity.recordDirectiveTurnProgress({type:'update',operationId:'director',phase:'waiting-model',phaseStartedAt:performance.now(),attempt:2});
const retry=snapshot().rows.find(row=>row.id==='director');
assert.deepEqual(retry.children.map(row=>row.attempt),[1,2]);
assert.equal(retry.children[0].state,'ended','a retry does not imply the prior attempt succeeded');
assert.equal(retry.children[1].state,'active');
activity.recordDirectiveTurnProgress({type:'update',operationId:'director',phase:'fabricated-secret',phaseStartedAt:performance.now(),text:'PRIVATE'});
assert.doesNotMatch(JSON.stringify(snapshot()),/PRIVATE|fabricated-secret/);
for (let run = 0; run < 45; run++) {
  const operationId = `overflow-${run}`;
  activity.recordDirectiveTurnProgress({type:'start',operationId,stage:'installing-prompt',startedAt:performance.now()});
  activity.recordDirectiveTurnProgress({type:'finish',operationId,outcome:'complete',endedAt:performance.now()});
}
const retainedContext = snapshot().rows.find(row => row.id === 'turn-context');
assert.equal(retainedContext.state, 'failed', 'trimming history preserves context failures');
assert.equal(retainedContext.children.find(row => row.id === 'installing-prompt').count, 49, 'counts include compacted context history');
assert.equal(retainedContext.failures, 1);
assert.ok(snapshot().history.length <= 40);
activity.disposeDirectiveTurnActivity();
activity.markDirectiveTurnActivity({hostGeneration:true});
assert.equal(snapshot().rows.length, 0, 'new activity does not inherit archived context');
activity.disposeDirectiveTurnActivity();
console.log('PASS purposeful progress menu grouping and observed model phases');
