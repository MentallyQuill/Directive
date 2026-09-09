import assert from 'node:assert/strict';
import { projectDirectorContinuity } from '../../src/story/director-context.mjs';
import { lookupContinuityThreads } from '../../src/story/thread-retrieval.mjs';
import { materializeContinuityChanges, projectContinuityThreads } from '../../src/story/continuity-events.mjs';
import { validateContinuityEvent, createDirectorReceipt } from '../../src/story/continuity-contracts.mjs';
import { compileDirectorInstruction } from '../../src/narration/director-instructions.mjs';
import { makeMaterializeInput } from './story-director-test-fixtures.mjs';

const input = makeMaterializeInput();
const base = await materializeContinuityChanges(input);
const events = Array.from({length:18},(_,i)=>base.map(event=>({
  ...event,id:`${event.id}.${i}`,threadId:`thread.${i}`,dependsOnEventIds:event.dependsOnEventIds.map(id=>`${id}.${i}`),
}))).flat();
assert.equal(projectDirectorContinuity({events,limits:{threadMaxRecords:2}}).records.length,2);
assert.equal(projectDirectorContinuity({events,limits:{threadMaxRecords:18,threadContextCharacters:50000}}).records.length,18,'raised count is not clipped at former twelve-thread ceiling');
assert.equal(lookupContinuityThreads({events,queryText:'Ravenna',limits:{threadLookupMaxRecords:9,threadContextCharacters:50000}}).records.length,9);
const facts = [...base,...Array.from({length:12},(_,i)=>({...base[1],id:`fact.extra.${i}`}))];
assert.equal(projectDirectorContinuity({events:facts,limits:{threadMaxFactsPerRecord:2}}).records[0].facts.length,2);
assert.equal(projectDirectorContinuity({events:facts,limits:{threadMaxFactsPerRecord:10}}).records[0].facts.length,10);
const oldProblem = base.map(event=>event.operation==='open'?{...event,payload:{...event.payload,category:'unresolved-problem'}}:event);
assert.equal(projectDirectorContinuity({events:oldProblem,currentRevision:30}).records.length,0);
assert.equal(projectDirectorContinuity({events:oldProblem,currentRevision:30,limits:{threadInactivityRevisions:40}}).records.length,1);

const title = 'Thread '.repeat(30).trim();
const text = 'Established source fact. '.repeat(30).trim();
const quote = text.slice(0,300);
const extended = {...input,
  sourcePair:{...input.sourcePair,previousAssistant:{...input.sourcePair.previousAssistant,text}},
  changes:[{...input.changes[0],title,evidenceQuote:quote},{...input.changes[1],text,evidenceQuote:quote}],
  limits:{continuityTitleCharacters:250,continuityFactCharacters:900,continuityEvidenceQuoteCharacters:350},
};
const largeEvents = await materializeContinuityChanges(extended);
assert.ok(largeEvents.every(event=>validateContinuityEvent(event).ok),'persisted content validates independently of later generation limits');
assert.equal(projectContinuityThreads(largeEvents)[0].facts[0].text,text);
await assert.rejects(materializeContinuityChanges({...extended,limits:{continuityMaxChanges:1}}),/change-count-exceeded/);
await assert.rejects(materializeContinuityChanges({...extended,limits:{...extended.limits,continuityFactCharacters:30}}),/fact-text-invalid/);
await assert.rejects(materializeContinuityChanges({...extended,limits:{...extended.limits,continuityTitleCharacters:30}}),/title-invalid/);
await assert.rejects(materializeContinuityChanges({...extended,limits:{...extended.limits,continuityEvidenceQuoteCharacters:20}}),/quote-invalid/);
const longTitle = 'Established detail '.repeat(300);
const compiled = compileDirectorInstruction({direction:{move:'continue-thread',targetRef:'thread.long',newComplications:'avoid',requires:[]},eligibleTargets:new Map([['thread.long',{id:'thread.long',playerSafeText:longTitle,conditions:new Set()}]])});
assert.equal(compiled.targetText,longTitle.trim(),'derived narration preserves configured content');
const receipt = await createDirectorReceipt({branchId:'save.test',packageId:'package.test',packageVersion:'1',missionId:'mission.test',generationType:'normal',generationTargetKey:'target.test',requestKey:'request.test',reuseKey:'reuse.test',sourceRangeHash:'range.test',sourceContributionIds:['contribution.a7'],instruction:compiled.targetText,dependencyIds:[],settledAtRevision:1});
assert.equal(receipt.instruction,compiled.targetText);
console.log('Configurable continuity limit tests passed.');
const dueWithRequestedFact = [...base.map(event => event.operation === 'addFact' ? { ...event, payload: { ...event.payload, deadlineElapsedSeconds: 5 } } : event), { ...base[1], id: 'fact.requested', payload: { ...base[1].payload, text: 'The explicit fact needed by this lookup.' } }];
const requestedFact = lookupContinuityThreads({ events: dueWithRequestedFact, referencedIds: ['fact.requested'], currentElapsedSeconds: 100, limits: { threadMaxFactsPerRecord: 1 } });
assert.equal(requestedFact.records[0].facts[0].id, 'fact.requested', 'one-fact lookup must honor explicit fact instead of returning its thread deadline again');
