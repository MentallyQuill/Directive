import assert from 'node:assert/strict';
import { materializeContinuityChanges, projectContinuityThreads, pruneContinuityEvents, rebindContinuityEventsSync } from '../../src/story/continuity-events.mjs';
import { validateContinuityEvent } from '../../src/story/continuity-contracts.mjs';
import { projectDirectorContinuity } from '../../src/story/director-context.mjs';
import { lookupContinuityThreads } from '../../src/story/thread-retrieval.mjs';
import { makeMaterializeInput } from './story-director-test-fixtures.mjs';

const input = makeMaterializeInput();
const events = await materializeContinuityChanges(input);
const id = projectContinuityThreads(events)[0].id;
const statusChange = (status, sourceSlot = 'previousAssistant') => ({ operation: 'setStatus', threadRef: id, status, sourceSlot, evidenceQuote: sourceSlot === 'previousAssistant' ? 'Rendezvous 1400.' : 'What flexibility do we have?' });
const dormant = await materializeContinuityChanges({ ...input, existingEvents: events, changes: [statusChange('dormant')], settledAtRevision: 2 });
assert.equal(projectContinuityThreads(dormant)[0].status, 'dormant');
assert.equal(projectDirectorContinuity({ events: dormant, currentRevision: 100 }).records.length, 0, 'dormant obligations remain stored without appearing on unrelated turns');
assert.equal(projectDirectorContinuity({ events: dormant, currentRevision: 100, queryText: 'Ravenna rendezvous' }).records[0].status, 'dormant');
assert.equal(projectDirectorContinuity({ events, currentRevision: 100 }).records[0].status, 'active', 'active scheduled obligations cannot be retired by age alone');
await assert.rejects(materializeContinuityChanges({ ...input, existingEvents: dormant, changes: [statusChange('expired', 'currentPlayer')] }), /expired-source-invalid/);
const expired = await materializeContinuityChanges({ ...input, existingEvents: dormant, changes: [statusChange('expired')], settledAtRevision: 3 });
assert.equal(projectDirectorContinuity({ events: expired }).records.length, 0);
assert.equal(lookupContinuityThreads({ events: expired, referencedIds: [id] }).records[0].status, 'expired');
assert.equal(pruneContinuityEvents(expired, new Set(['contribution.a7'])).length, 0);

const archive = Array.from({ length: 100 }, (_, i) => events.map(event => ({ ...event, id: `${event.id}.${i}`, threadId: `thread.${i}`, dependsOnEventIds: event.dependsOnEventIds.map(ref => `${ref}.${i}`), payload: event.operation === 'open' ? { title: `Investigation ${i}`, category: 'unresolved-problem' } : { ...event.payload, text: i === 0 ? 'Cross reported a phase discriminator fault.' : `Unrelated established detail ${i}.` } }))).flat();
const before = structuredClone(archive);
const focused = projectDirectorContinuity({ events: archive, currentRevision: 100, queryText: 'Ask Cross about the discriminator' });
assert.deepEqual(focused.records.map(t => t.id), ['thread.0']);
assert.equal(focused.retrieval.omittedThreadCount, 99);
assert.deepEqual(archive, before, 'retrieval never modifies authoritative state');
const lookup = lookupContinuityThreads({ events: archive, referencedIds: ['thread.75'], currentRevision: 100 });
assert.deepEqual(lookup.records.map(t => t.id), ['thread.75']);
assert.throws(() => lookupContinuityThreads({ events: archive }), /lookup-query-required/);
const manyFacts = [...events, ...Array.from({length: 200}, (_, i) => ({ ...events[1], id: `fact.${i}`, payload: { ...events[1].payload, text: `Recorded detail ${i}.` } }))];
const bounded = projectDirectorContinuity({events: manyFacts});
assert.ok(bounded.records[0].facts.length <= 6);
assert.ok(bounded.retrieval.omittedFactCount > 190);
assert.equal(lookupContinuityThreads({events: manyFacts, referencedIds:['fact.2']}).records[0].facts[0].id, 'fact.2');

const deadlineInput = { ...input, changes: [input.changes[0], { ...input.changes[1], linkedIds: ['person.cross'], authoredRef:'schedule.return', deadlineElapsedSeconds:7200 }], authoredIds:['person.cross','schedule.return'], authoredDeadlines:{'schedule.return':7200} };
const deadlineEvents = await materializeContinuityChanges(deadlineInput);
assert.ok(deadlineEvents.every(event => validateContinuityEvent(event).ok), 'new optional fact metadata validates on persisted events');
assert.deepEqual(await materializeContinuityChanges({...deadlineInput,existingEvents:deadlineEvents,settledAtRevision:99}),deadlineEvents);
await assert.rejects(materializeContinuityChanges({...deadlineInput,authoredDeadlines:{}}),/deadline-authority-invalid/);
await assert.rejects(materializeContinuityChanges({...deadlineInput,authoredIds:['schedule.return']}),/linked-id-unknown/);
const deadlineId = projectContinuityThreads(deadlineEvents)[0].id;
const sleeping = await materializeContinuityChanges({...input,existingEvents:deadlineEvents,changes:[{...statusChange('dormant'),threadRef:deadlineId}],settledAtRevision:2});
assert.equal(projectDirectorContinuity({events:sleeping,currentRevision:100,currentElapsedSeconds:1000}).records.length,0);
const waking = projectDirectorContinuity({events:sleeping,currentRevision:100,currentElapsedSeconds:5500});
assert.equal(waking.records[0].facts[0].deadlineElapsedSeconds,7200);
assert.deepEqual(waking.records[0].facts[0].linkedIds,['person.cross']);
assert.equal(projectDirectorContinuity({events:sleeping,currentElapsedSeconds:9000}).records[0].status,'dormant','passing deadline triggers retrieval but never expiry');
assert.equal(lookupContinuityThreads({events:sleeping,referencedIds:['person.cross']}).records[0].id,deadlineId);
const rebound = rebindContinuityEventsSync(deadlineEvents,{branchId:'save.fork',contributionMap:new Map([['contribution.a7','contribution.fork']])});
assert.equal(projectContinuityThreads(rebound.events)[0].facts[0].deadlineElapsedSeconds,7200);
assert.deepEqual(projectContinuityThreads(rebound.events)[0].facts[0].linkedIds,['person.cross']);

// Explicit narrative schedules can wake attention without an authored mechanics ID.
const narrativeQuote = 'Cross wants the staff back by 10:30 today.';
const narrativeInput = {
  ...input,
  sourcePair: { ...input.sourcePair, previousAssistant:{...input.sourcePair.previousAssistant,text:narrativeQuote} },
  sourceRangeHash:'pair.narrative-deadline',
  changes: [
    {...input.changes[0],evidenceQuote:narrativeQuote},
    {...input.changes[1],text:narrativeQuote,evidenceQuote:narrativeQuote,authoredRef:null,linkedIds:['person.cross'],deadlineElapsedSeconds:9000},
  ],
  knownLinkIds:['person.cross'],
  temporalContext:{elapsedSeconds:3600,secondOfDay:9*3600},
};
const narrativeEvents = await materializeContinuityChanges(narrativeInput);
const narrativeId = projectContinuityThreads(narrativeEvents)[0].id;
const narrativeSleeping = await materializeContinuityChanges({...narrativeInput,existingEvents:narrativeEvents,changes:[{...statusChange('dormant'),threadRef:narrativeId,evidenceQuote:narrativeQuote}],settledAtRevision:2});
assert.equal(projectDirectorContinuity({events:narrativeSleeping,currentElapsedSeconds:4000}).records.length,0);
assert.equal(projectDirectorContinuity({events:narrativeSleeping,currentElapsedSeconds:7500}).records[0].facts[0].deadlineElapsedSeconds,9000);
assert.equal(projectDirectorContinuity({events:narrativeSleeping,currentElapsedSeconds:10000}).records[0].status,'dormant');
await assert.rejects(materializeContinuityChanges({...narrativeInput,knownLinkIds:[]}),/linked-id-unknown/);
await assert.rejects(materializeContinuityChanges({...narrativeInput,changes:[narrativeInput.changes[0],{...narrativeInput.changes[1],authoredRef:'person.cross'}]}),/authored-ref-unknown/);
await assert.rejects(materializeContinuityChanges({...narrativeInput,changes:[narrativeInput.changes[0],{...narrativeInput.changes[1],deadlineElapsedSeconds:9000000}]}),/deadline-authority-invalid/);
await assert.rejects(materializeContinuityChanges({...narrativeInput,temporalContext:{elapsedSeconds:3600,secondOfDay:86400}}),/deadline-authority-invalid/);
await assert.rejects(materializeContinuityChanges({...deadlineInput,temporalContext:narrativeInput.temporalContext,authoredDeadlines:{'schedule.return':6000}}),/deadline-authority-invalid/);

const overdueBacklog = Array.from({length:12}, (_,i) => deadlineEvents.map(event => ({
  ...event,id:`${event.id}.old.${i}`,threadId:`thread.old.${i}`,
  dependsOnEventIds:event.dependsOnEventIds.map(ref=>`${ref}.old.${i}`),
  payload:event.operation==='open'?{title:`Old appointment ${i}`,category:'schedule'}:{...event.payload,text:'An old appointment remains unsettled.',deadlineElapsedSeconds:100},
}))).flat();
const backlogWithCurrent = [...overdueBacklog,...archive.filter(event=>event.threadId==='thread.0')];
const requestedCurrent = projectDirectorContinuity({events:backlogWithCurrent,referencedIds:['thread.0'],currentElapsedSeconds:10000});
assert.equal(requestedCurrent.records[0].id,'thread.0','explicit current thread outranks twelve overdue records');
assert.ok(requestedCurrent.retrieval.omittedProtectedThreadCount>0);
assert.equal(projectDirectorContinuity({events:backlogWithCurrent,queryText:'Cross discriminator',currentElapsedSeconds:10000}).records[0].id,'thread.0','current lexical relevance outranks overdue backlog');
const approaching = deadlineEvents.map(event=>({...event,id:`${event.id}.upcoming`,threadId:'thread.upcoming',dependsOnEventIds:event.dependsOnEventIds.map(ref=>`${ref}.upcoming`),payload:event.operation==='addFact'?{...event.payload,deadlineElapsedSeconds:11000}:event.payload}));
assert.equal(projectDirectorContinuity({events:[...overdueBacklog,...approaching],currentElapsedSeconds:10000}).records[0].id,'thread.upcoming','approaching appointment outranks unrelated overdue backlog');
const crowdedDeadline = [...narrativeEvents,...Array.from({length:10},(_,i)=>({...narrativeEvents[1],id:`fact.crowded.${i}`,payload:{...narrativeEvents[1].payload,deadlineElapsedSeconds:null,text:`Cross related update ${i}.`}}))];
const attention = projectDirectorContinuity({events:crowdedDeadline,queryText:'Cross related update',referencedIds:Array.from({length:10},(_,i)=>`fact.crowded.${i}`),currentElapsedSeconds:7500});
assert.ok(attention.records[0].facts.some(fact=>fact.deadlineElapsedSeconds===9000),'attention hint survives six-fact selection even when many other facts explicitly match');
console.log('Thread lifecycle and retrieval tests passed.');
