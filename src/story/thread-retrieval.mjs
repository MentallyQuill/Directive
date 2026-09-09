import { projectContinuityThreads, pruneContinuityEvents } from './continuity-events.mjs';

// Revision distance is an inactivity heuristic, not elapsed turns or ship time.
export const THREAD_INACTIVITY_REVISIONS = 12;
export const THREAD_RETRIEVAL_MAX_CHARACTERS = 12000;
const protectedCategories = new Set(['obligation', 'schedule', 'constraint']);
const terminal = new Set(['resolved', 'expired']);
const words = text => new Set(String(text ?? '').toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}.-]{2,}/gu) || []);
const stopWords = new Set(['the', 'and', 'with', 'that', 'this', 'about', 'from', 'have', 'what', 'will', 'would', 'could', 'should', 'into', 'then', 'there', 'they', 'were', 'was', 'had', 'for', 'you', 'your', 'his', 'her', 'she', 'has', 'not', 'but']);
const size = value => [...JSON.stringify(value)].length;

/** Read a focused projection from the captured event snapshot; never mutate the archive.
 * IDs may identify threads, facts, or authored references. queryText is lexical retrieval,
 * not semantic matching. Missing records/facts remain unknown, never negated or resolved.
 */
export function retrieveContinuityThreads({
  events = [], missionId = null, referencedIds = [], queryText = '', currentRevision,
  currentElapsedSeconds = null, deadlineLeadSeconds = 1800,
  maxCharacters = THREAD_RETRIEVAL_MAX_CHARACTERS, maxThreads = 12, lookupOnly = false,
} = {}) {
  if (!Number.isInteger(maxCharacters) || maxCharacters < 1 || !Number.isInteger(maxThreads) || maxThreads < 1 || maxThreads > 12) throw new TypeError('director-context-overflow');
  const surviving = pruneContinuityEvents(events);
  const threads = projectContinuityThreads(surviving);
  const requested = new Set([missionId, ...referencedIds].filter(id => typeof id === 'string' && id));
  const query = [...words(queryText)].filter(word => !stopWords.has(word));
  const relevance = text => { const tokens = words(text); return query.filter(word => tokens.has(word)).length; };
  const explicitFact = fact => requested.has(fact.id) || requested.has(fact.authoredRef) || (fact.linkedIds || []).some(id => requested.has(id));
  const explicit = thread => requested.has(thread.id) || thread.facts.some(explicitFact);
  const revisions = new Map();
  const eventOwners = new Map(surviving.map(event => [event.id, event.threadId]));
  for (const event of surviving) revisions.set(event.threadId, Math.max(revisions.get(event.threadId) ?? 0, event.settledAtRevision ?? 0));
  const revision = Number.isInteger(currentRevision) ? currentRevision : Math.max(0, ...revisions.values());
  const age = thread => Math.max(0, revision - (revisions.get(thread.id) ?? 0));
  const related = thread => relevance(`${thread.title} ${thread.facts.map(fact => fact.text).join(' ')}`);
  const protectedThread = thread => !terminal.has(thread.status) && (protectedCategories.has(thread.category) || thread.facts.some(fact => fact.claimType === 'player-commitment'));
  const dueFact = fact => Number.isSafeInteger(currentElapsedSeconds) && currentElapsedSeconds >= 0 && Number.isSafeInteger(deadlineLeadSeconds) && deadlineLeadSeconds >= 0 && Number.isSafeInteger(fact.deadlineElapsedSeconds) && fact.deadlineElapsedSeconds <= currentElapsedSeconds + deadlineLeadSeconds;
  const due = thread => !terminal.has(thread.status) && thread.facts.some(dueFact);
  const approachingFact = fact => dueFact(fact) && fact.deadlineElapsedSeconds >= currentElapsedSeconds;
  const approaching = thread => !terminal.has(thread.status) && thread.facts.some(approachingFact);
  const eligible = threads.filter(thread => explicit(thread) || related(thread) > 0 || (!lookupOnly && (due(thread) || (thread.status === 'active' && (protectedThread(thread) || age(thread) < THREAD_INACTIVITY_REVISIONS)))));
  const dependencyThreads = new Set();
  const eligibleIds = new Set(eligible.map(thread => thread.id));
  // Include transitive event dependencies of selected records, including cross-thread links.
  let changed = true;
  while (changed) {
    changed = false;
    for (const event of surviving) if (eligibleIds.has(event.threadId)) for (const dependency of event.dependsOnEventIds || []) {
      const owner = eventOwners.get(dependency);
      if (owner && !eligibleIds.has(owner)) { eligibleIds.add(owner); dependencyThreads.add(owner); changed = true; }
    }
  }
  const candidates = threads.filter(thread => eligibleIds.has(thread.id));
  // An overdue backlog must not permanently crowd out the current conversation.
  candidates.sort((a, b) => Number(explicit(b)) - Number(explicit(a)) || related(b) - related(a) || Number(approaching(b)) - Number(approaching(a)) || Number(dependencyThreads.has(b.id)) - Number(dependencyThreads.has(a.id)) || age(a) - age(b) || Number(due(b)) - Number(due(a)) || Number(protectedThread(b)) - Number(protectedThread(a)) || a.id.localeCompare(b.id));
  const records = [];
  const projection = () => ({
    index: records.filter(thread => !terminal.has(thread.status)).map(({id,title,category,status}) => ({id,title,category,status})).sort((a,b) => a.id.localeCompare(b.id)),
    records,
    retrieval: {
      coverage: records.length === threads.length && records.every(thread => thread.omittedFactCount === 0) ? 'complete' : 'partial',
      totalThreadCount: threads.length, omittedThreadCount: threads.length - records.length,
      omittedFactCount: threads.reduce((sum, thread) => sum + thread.facts.length, 0) - records.reduce((sum, thread) => sum + thread.facts.length, 0),
      omittedProtectedThreadCount: candidates.filter(thread => (protectedThread(thread) || due(thread) || dependencyThreads.has(thread.id)) && !records.some(record => record.id === thread.id)).length,
      ageBasis: 'settled-revision', snapshotRevision: revision, lookupAvailable: true,
      omissionMeaning: 'Not supplied; remains stored and unresolved unless evidence establishes otherwise.',
    },
  });
  if (size(projection()) > maxCharacters) throw new TypeError('director-context-overflow');
  for (const thread of candidates) {
    if (records.length >= maxThreads) break;
    // Reserve one leading fact for the attention trigger; otherwise explicit/query
    // matches could omit the very deadline that brought this thread into context.
    const attentionFact = due(thread) ? thread.facts.filter(dueFact).sort((a,b) => Number(approachingFact(b)) - Number(approachingFact(a)) || Math.abs(a.deadlineElapsedSeconds-currentElapsedSeconds) - Math.abs(b.deadlineElapsedSeconds-currentElapsedSeconds))[0] : null;
    const facts = thread.facts.map((fact,index) => ({fact,index})).sort((a,b) => Number(b.fact===attentionFact) - Number(a.fact===attentionFact) || Number(explicitFact(b.fact)) - Number(explicitFact(a.fact)) || relevance(b.fact.text) - relevance(a.fact.text) || b.index - a.index).slice(0,6).map(({fact}) => structuredClone(fact));
    const record = { id:thread.id, title:thread.title, category:thread.category, status:thread.status, lastRelevantRevision:revisions.get(thread.id) ?? 0, inactiveRevisionCount:age(thread), facts, omittedFactCount:thread.facts.length - facts.length, sourceContributionIds:[...new Set(facts.flatMap(fact => fact.sourceContributionIds || []))] };
    records.push(record);
    while (size(projection()) > maxCharacters && record.facts.length) { record.facts.pop(); record.omittedFactCount++; record.sourceContributionIds = [...new Set(record.facts.flatMap(fact => fact.sourceContributionIds || []))]; }
    if (size(projection()) > maxCharacters || (thread.facts.length && !record.facts.length)) records.pop();
  }
  return projection();
}

/** One targeted follow-up lookup against the same captured snapshot. */
export function lookupContinuityThreads(options = {}) {
  if (!(options.referencedIds?.length) && !String(options.queryText ?? '').trim()) throw new TypeError('continuity-lookup-query-required');
  return retrieveContinuityThreads({...options, missionId:null, maxThreads:options.maxThreads ?? 6, lookupOnly:true});
}
