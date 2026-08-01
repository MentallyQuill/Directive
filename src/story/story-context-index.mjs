import {
  STORY_CONTEXT_INDEX_KIND,
  STORY_POSITION_CANDIDATE_KIND
} from './story-position-contracts.mjs';
import { materializeActiveStoryProjection } from './story-ledger.mjs';
import { hashStableJson } from '../runtime/architecture-redesign-contracts.mjs';
import { classifyPlayerClaims } from '../continuity/claim-authority.mjs';

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

function boundedTranscript(value) {
  return asArray(value)
    .map((entry) => typeof entry === 'string' ? compact(entry) : compact(entry?.summary || entry?.text || entry?.content))
    .filter(Boolean)
    .slice(-12)
    .map((entry) => entry.slice(0, 800));
}

function normalizeEdge(edge = {}) {
  return {
    from: compact(edge.from || edge.source || edge.sourceId || edge.fromNodeId),
    to: compact(edge.to || edge.target || edge.targetId || edge.toNodeId),
    prerequisites: unique([
      ...asArray(edge.prerequisites),
      ...asArray(edge.requiredFactIds),
      ...asArray(edge.evidenceGates)
    ]),
    mandatory: edge.mandatory === true || edge.required === true
  };
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
    summary: compact(phase.summary || phase.description).slice(0, 600),
    dramaticPurpose: compact(phase.directorPurpose),
    obligationType: phase.mandatory === true || ['arrival', 'handover', 'briefing', 'test', 'review', 'transition'].includes(compact(phase.type))
      ? 'mandatory-to-surface'
      : (compact(phase.type) === 'freeform' ? 'supporting' : 'optional'),
    prerequisites: unique(phase.prerequisites || phase.requiredFactIds),
    evidenceGates: unique(phase.evidenceGates),
    timing: cloneJson(phase.actionWindow || phase.timing || null),
    pressureIds: unique(phase.pressureIds || phase.linkedPressureIds)
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
  branchId = 'main',
  playerInput = '',
  recentTranscript = []
} = {}) {
  const projection = campaignState.activeStoryProjection || materializeActiveStoryProjection({
    events: campaignState.storyEventLedger?.events || [],
    branchId
  });
  const nodes = mergeNodes([...graphNodesFromMissionGraph(missionGraph), ...runtimeNodesFromProjection(projection)]);
  const edges = asArray(missionGraph.edges || missionGraph.transitions).map(normalizeEdge).filter((edge) => edge.from || edge.to);
  const pressures = asArray(missionGraph.pressures).map(cloneJson);
  const obligations = nodes
    .filter((node) => node.type === 'missionPhase' || node.type === 'decisionPoint' || node.type === 'outcomeOption')
    .map((node) => ({
      id: node.id,
      nodeId: node.id,
      type: node.obligationType || 'optional',
      dramaticPurpose: node.dramaticPurpose || '',
      prerequisites: cloneJson(node.prerequisites || []),
      evidenceGates: cloneJson(node.evidenceGates || []),
      timing: cloneJson(node.timing || null),
      pressureIds: cloneJson(node.pressureIds || [])
    }));
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
    turn: {
      playerInput: compact(playerInput).slice(0, 2000),
      recentTranscript: boundedTranscript(recentTranscript),
      claimAuthority: classifyPlayerClaims({
        text: compact(playerInput).slice(0, 2000),
        source: { kind: 'playerInput', turnId: compact(campaignState.turnId || campaignState.runtime?.turnId) || null }
      })
    },
    obligations,
    pressures,
    projection: cloneJson(projection),
    graph: {
      nodes,
      edges
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

export function deriveStoryEligibility({ node = {}, storyContextIndex = {} } = {}) {
  const status = statusForNode(node, storyContextIndex);
  const projection = storyContextIndex.projection || {};
  const knownFacts = new Set(unique(storyContextIndex.knownFactIds || []));
  const edges = asArray(storyContextIndex.graph?.edges);
  const incoming = edges.filter((edge) => edge.to === node.id);
  const prerequisites = unique([
    ...asArray(node.prerequisites),
    ...incoming.flatMap((edge) => edge.prerequisites || [])
  ]);
  const evidenceGates = unique(node.evidenceGates || []);
  const reasons = [];
  if (['completed', 'closed'].includes(status)) reasons.push('completed');
  if (status === 'blocked') reasons.push('blocked');
  const missingPrerequisite = prerequisites.some((id) => !knownFacts.has(id));
  if (missingPrerequisite) reasons.push('missing-prerequisite');
  const activeNodeIds = new Set([
    ...asArray(projection.activeNodeIds),
    ...asArray(projection.activeThreadIds)
  ]);
  if (incoming.length && !incoming.some((edge) => activeNodeIds.has(edge.from) || edge.from === storyContextIndex.graph?.nodes?.find((candidate) => candidate.phaseId === storyContextIndex.current?.activePhaseId)?.id)) {
    reasons.push('no-edge');
  }
  if (!incoming.length && node.type === 'missionPhase' && node.phaseId && node.phaseId !== storyContextIndex.current?.activePhaseId && status !== 'active') {
    reasons.push('no-edge');
  }
  const pressure = asArray(storyContextIndex.pressures).find((entry) => entry.phaseId === node.sourceId || entry.phaseId === node.phaseId) || null;
  return {
    ok: reasons.length === 0 || status === 'active',
    reasons: unique(reasons),
    prerequisites,
    evidenceGates,
    timing: cloneJson(node.timing || pressure?.actionWindow || null),
    pressure: cloneJson(pressure),
    consequenceOfDelay: compact(pressure?.readinessGates?.timing || pressure?.actionWindow?.latestUsefulAction),
    activePressure: Boolean(pressure)
  };
}

export function deriveStoryPositionCandidates({ storyContextIndex = {} } = {}) {
  const projection = storyContextIndex.projection || {};
  const knownFacts = unique(storyContextIndex.knownFactIds || []);
  const notYetTrue = unique(projection.notYetTrueFactIds || []);
  return asArray(storyContextIndex.graph?.nodes).map((node) => {
    const status = statusForNode(node, storyContextIndex);
    const eligibility = deriveStoryEligibility({ node, storyContextIndex });
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
      obligationType: node.obligationType || 'optional',
      dramaticPurpose: node.dramaticPurpose || '',
      eligibility,
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
