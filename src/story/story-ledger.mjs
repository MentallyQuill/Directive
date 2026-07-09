import { ACTIVE_STORY_PROJECTION_KIND } from './story-position-contracts.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compact(value = '') {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function uniqueSorted(values = []) {
  return [...new Set(values.map(compact).filter(Boolean))].sort();
}

function applyStatus(map, id, status) {
  const key = compact(id);
  const value = compact(status);
  if (key && value) map.set(key, value);
}

function idsWithStatus(map, status) {
  return uniqueSorted([...map.entries()].filter(([, value]) => value === status).map(([id]) => id));
}

export function createEmptyActiveStoryProjection({ branchId = 'main' } = {}) {
  return {
    kind: ACTIVE_STORY_PROJECTION_KIND,
    schemaVersion: 1,
    revision: 0,
    branchId: compact(branchId) || 'main',
    activeNodeIds: [],
    availableNodeIds: [],
    completedNodeIds: [],
    closedNodeIds: [],
    blockedNodeIds: [],
    knownFactIds: [],
    notYetTrueFactIds: [],
    staleNodeIds: [],
    rerunOnlyNodeIds: [],
    activeThreadIds: [],
    closedThreadIds: [],
    lastOutcomeId: '',
    lastStoryEventId: ''
  };
}

export function materializeActiveStoryProjection({ events = [], branchId = 'main' } = {}) {
  const nodeStatus = new Map();
  const factStatus = new Map();
  const threadStatus = new Map();
  const activeBranchId = compact(branchId) || 'main';
  let revision = 0;
  let lastOutcomeId = '';
  let lastStoryEventId = '';
  for (const event of Array.isArray(events) ? events : []) {
    if (compact(event.branchId || 'main') !== activeBranchId) continue;
    revision += 1;
    lastOutcomeId = compact(event.outcomeId) || lastOutcomeId;
    lastStoryEventId = compact(event.id) || lastStoryEventId;
    for (const transition of Array.isArray(event.nodeTransitions) ? event.nodeTransitions : []) {
      applyStatus(nodeStatus, transition.nodeId, transition.to);
    }
    for (const transition of Array.isArray(event.factTransitions) ? event.factTransitions : []) {
      applyStatus(factStatus, transition.factId, transition.to);
    }
    for (const transition of Array.isArray(event.threadTransitions) ? event.threadTransitions : []) {
      applyStatus(threadStatus, transition.threadId, transition.to);
    }
  }
  const completedNodeIds = idsWithStatus(nodeStatus, 'completed');
  const closedNodeIds = idsWithStatus(nodeStatus, 'closed');
  return {
    ...createEmptyActiveStoryProjection({ branchId: activeBranchId }),
    revision,
    activeNodeIds: idsWithStatus(nodeStatus, 'active'),
    availableNodeIds: idsWithStatus(nodeStatus, 'available'),
    completedNodeIds,
    closedNodeIds,
    blockedNodeIds: idsWithStatus(nodeStatus, 'blocked'),
    knownFactIds: idsWithStatus(factStatus, 'known'),
    notYetTrueFactIds: idsWithStatus(factStatus, 'notYetTrue'),
    staleNodeIds: uniqueSorted([...completedNodeIds, ...closedNodeIds]),
    rerunOnlyNodeIds: completedNodeIds,
    activeThreadIds: idsWithStatus(threadStatus, 'active'),
    closedThreadIds: idsWithStatus(threadStatus, 'closed'),
    lastOutcomeId,
    lastStoryEventId
  };
}

export function appendReviewedStoryEvents(campaignState = {}, eventDrafts = [], {
  outcomeId = '',
  turnId = '',
  sourceFrameRef = null,
  branchId = 'main',
  now = () => new Date().toISOString()
} = {}) {
  const next = cloneJson(campaignState || {});
  const existing = Array.isArray(next.storyEventLedger?.events) ? next.storyEventLedger.events : [];
  const activeBranchId = compact(branchId) || 'main';
  const appended = (Array.isArray(eventDrafts) ? eventDrafts : []).map((draft, index) => ({
    id: `storyEvent.${compact(outcomeId) || 'outcome'}.${existing.length + index + 1}`,
    outcomeId: compact(outcomeId),
    turnId: compact(turnId),
    sourceFrameRef: cloneJson(sourceFrameRef || null),
    eventType: compact(draft.eventType) || 'missionOutcomeCommitted',
    occurredAt: now(),
    branchId: activeBranchId,
    nodeTransitions: cloneJson(draft.nodeTransitions || []),
    factTransitions: cloneJson(draft.factTransitions || []),
    threadTransitions: cloneJson(draft.threadTransitions || []),
    commandLogRefs: cloneJson(draft.commandLogRefs || []),
    supersedesEventIds: cloneJson(draft.supersedesEventIds || [])
  }));
  next.storyEventLedger = {
    kind: 'directive.storyEventLedger.v1',
    schemaVersion: 1,
    events: [...existing, ...appended]
  };
  next.activeStoryProjection = materializeActiveStoryProjection({
    events: next.storyEventLedger.events,
    branchId: activeBranchId
  });
  return next;
}
