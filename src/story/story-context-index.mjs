import {
  STORY_CONTEXT_INDEX_KIND,
  STORY_POSITION_CANDIDATE_KIND
} from './story-position-contracts.mjs';
import { materializeActiveStoryProjection } from './story-ledger.mjs';
import { hashStableJson } from '../runtime/architecture-redesign-contracts.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compact(value = '') {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function token(value = '') {
  return compact(value).replace(/[^A-Za-z0-9_.:-]+/g, '-').replace(/^-|-$/g, '');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values = []) {
  const out = [];
  const seen = new Set();
  for (const value of values.map(compact).filter(Boolean)) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function knownFactIds(campaignState = {}) {
  return asArray(campaignState.knowledgeLedger?.facts)
    .map((fact) => typeof fact === 'string' ? fact : (fact?.known === false || fact?.stale === true ? '' : fact?.id))
    .filter(Boolean);
}

function graphNodesFromMissionGraph(missionGraph = {}) {
  const phaseNodes = asArray(missionGraph.phases).map((phase) => ({
    id: `phase.${compact(phase.id)}`,
    sourceId: compact(phase.id),
    type: 'missionPhase',
    label: compact(phase.label || phase.title || phase.id),
    phaseId: compact(phase.id),
    summary: compact(phase.summary || phase.description).slice(0, 600)
  })).filter((node) => node.sourceId);
  const decisionNodes = asArray(missionGraph.decisionPoints).map((decision) => ({
    id: compact(decision.id),
    sourceId: compact(decision.id),
    type: 'decisionPoint',
    label: compact(decision.label || decision.title || decision.id),
    phaseId: compact(decision.phaseId || decision.activePhaseId),
    summary: compact(decision.summary || decision.description).slice(0, 600)
  })).filter((node) => node.id);
  const outcomeNodes = asArray(missionGraph.outcomes || missionGraph.outcomeOptions).map((outcome) => ({
    id: compact(outcome.id),
    sourceId: compact(outcome.id),
    type: 'outcomeOption',
    label: compact(outcome.label || outcome.title || outcome.id),
    phaseId: compact(outcome.phaseId),
    summary: compact(outcome.summary || outcome.description).slice(0, 600)
  })).filter((node) => node.id);
  return [...phaseNodes, ...decisionNodes, ...outcomeNodes];
}

function runtimeNodesFromProjection(projection = {}) {
  return [
    ...asArray(projection.activeThreadIds).map((id) => ({
      id,
      sourceId: id,
      type: 'activeThread',
      label: id
    })),
    ...asArray(projection.availableNodeIds).map((id) => ({
      id,
      sourceId: id,
      type: 'availableStoryNode',
      label: id
    })),
    ...asArray(projection.activeNodeIds).map((id) => ({
      id,
      sourceId: id,
      type: 'activeStoryNode',
      label: id
    }))
  ];
}

function mergeNodes(nodes = []) {
  const byId = new Map();
  for (const node of nodes) {
    if (!node?.id || byId.has(node.id)) continue;
    byId.set(node.id, node);
  }
  return [...byId.values()];
}

export function buildStoryContextIndex({
  campaignState = {},
  packageData = {},
  missionGraph = {},
  sourceFrameRef = null,
  branchId = 'main'
} = {}) {
  const projection = campaignState.activeStoryProjection || materializeActiveStoryProjection({
    events: campaignState.storyEventLedger?.events || [],
    branchId
  });
  const nodes = mergeNodes([...graphNodesFromMissionGraph(missionGraph), ...runtimeNodesFromProjection(projection)]);
  const index = {
    kind: STORY_CONTEXT_INDEX_KIND,
    schemaVersion: 1,
    campaignId: compact(campaignState.campaign?.id || campaignState.campaign?.templateCampaignId),
    packageId: compact(packageData.manifest?.id || packageData.id),
    branchId: compact(branchId) || 'main',
    current: {
      activeMissionId: compact(campaignState.mission?.activeMissionId),
      activeMissionGraphId: compact(campaignState.mission?.activeMissionGraphId || missionGraph.id),
      activePhaseId: compact(campaignState.mission?.activePhaseId),
      locationId: compact(campaignState.worldState?.currentLocationId || campaignState.attentionState?.scene?.locationId)
    },
    projection: cloneJson(projection),
    graph: {
      nodes,
      edges: asArray(missionGraph.edges || missionGraph.transitions).map(cloneJson)
    },
    knownFactIds: knownFactIds(campaignState),
    sourceFrameRef: cloneJson(sourceFrameRef || null)
  };
  return {
    ...index,
    indexHash: hashStableJson(index)
  };
}

function statusForNode(node = {}, storyContextIndex = {}) {
  const projection = storyContextIndex.projection || {};
  const active = new Set(asArray(projection.activeNodeIds));
  const available = new Set(asArray(projection.availableNodeIds));
  const completed = new Set(asArray(projection.completedNodeIds));
  const closed = new Set(asArray(projection.closedNodeIds));
  const blocked = new Set(asArray(projection.blockedNodeIds));
  const activeThreads = new Set(asArray(projection.activeThreadIds));
  const closedThreads = new Set(asArray(projection.closedThreadIds));
  if (active.has(node.id) || activeThreads.has(node.id)) return 'active';
  if (completed.has(node.id)) return 'completed';
  if (closed.has(node.id) || closedThreads.has(node.id)) return 'closed';
  if (blocked.has(node.id)) return 'blocked';
  if (available.has(node.id)) return 'available';
  if (node.phaseId && node.phaseId === storyContextIndex.current?.activePhaseId) return 'active';
  return 'available';
}

export function deriveStoryPositionCandidates({ storyContextIndex = {} } = {}) {
  const projection = storyContextIndex.projection || {};
  const knownFacts = unique(storyContextIndex.knownFactIds || []);
  const notYetTrue = unique(projection.notYetTrueFactIds || []);
  return asArray(storyContextIndex.graph?.nodes).map((node) => {
    const status = statusForNode(node, storyContextIndex);
    return {
      kind: STORY_POSITION_CANDIDATE_KIND,
      schemaVersion: 1,
      id: `candidate.${token(node.id)}.${status}`,
      nodeId: node.id,
      label: node.label || node.id,
      candidateType: node.type,
      status,
      mode: ['activeThread', 'availableStoryNode', 'activeStoryNode'].includes(node.type) ? 'openWorld' : 'mission',
      priorityBand: status === 'active' ? 'primary' : 'secondary',
      coordinates: {
        missionId: storyContextIndex.current?.activeMissionId || '',
        phaseId: node.phaseId || storyContextIndex.current?.activePhaseId || '',
        locationId: storyContextIndex.current?.locationId || '',
        threadId: node.type === 'activeThread' ? node.id : ''
      },
      evidenceRefs: [storyContextIndex.sourceFrameRef?.id, projection.lastStoryEventId].filter(Boolean),
      allowedFactIds: cloneJson(knownFacts),
      notYetTrueFactIds: cloneJson(notYetTrue),
      forbiddenAssertions: status === 'completed'
        ? [`Do not treat ${node.label || node.id} as pending.`]
        : notYetTrue.map((id) => `Do not assert ${id}.`),
      staleSetupGuards: status === 'completed'
        ? [`${node.label || node.id} is completed; reopening requires rerun branch authority.`]
        : []
    };
  });
}
