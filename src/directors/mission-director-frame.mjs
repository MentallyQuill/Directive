import { MISSION_DIRECTOR_FRAME_KIND } from './mission-director-model-contracts.mjs';
import { hashStableJson } from '../runtime/architecture-redesign-contracts.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compact(value = '') {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function textHash(text) {
  return hashStableJson({ text: String(text || '') });
}

function templates(packageData = {}) {
  const source = packageData.questTemplates?.templates || packageData.questTemplates || [];
  return asArray(source);
}

function missionGraphFor(campaignState = {}, packageData = {}) {
  const activeMissionId = campaignState.mission?.activeMissionId || campaignState.attentionState?.foregroundQuestId || '';
  const template = templates(packageData).find((item) => item.id === activeMissionId || item.missionGraph?.id === campaignState.mission?.activeMissionGraphId);
  return template?.missionGraph || null;
}

function knownFactIds(campaignState = {}) {
  return asArray(campaignState.knowledgeLedger?.facts)
    .map((fact) => typeof fact === 'string' ? fact : (fact?.known === false || fact?.stale === true ? '' : fact?.id))
    .filter(Boolean);
}

function compactTranscript(entries = []) {
  return asArray(entries).slice(-12).map((entry, index) => ({
    id: compact(entry.id || entry.hostMessageId || `message:${index}`),
    role: compact(entry.role || (entry.isUser ? 'user' : 'assistant')),
    text: compact(entry.text || entry.mes || entry.content).slice(0, 900),
    textHash: compact(entry.textHash) || textHash(entry.text || entry.mes || entry.content)
  })).filter((entry) => entry.text);
}

function packageStoryMap(campaignState = {}, packageData = {}) {
  const graph = missionGraphFor(campaignState, packageData) || {};
  const phases = asArray(graph.phases).map((phase) => ({
    id: compact(phase.id),
    label: compact(phase.label || phase.title || phase.id),
    summary: compact(phase.summary || phase.description).slice(0, 500)
  })).filter((phase) => phase.id);
  const decisionPoints = asArray(graph.decisionPoints).map((decision) => ({
    id: compact(decision.id),
    label: compact(decision.label || decision.title || decision.id),
    phaseId: compact(decision.phaseId || decision.activePhaseId),
    summary: compact(decision.summary || decision.description).slice(0, 500)
  })).filter((decision) => decision.id);
  const outcomeOptions = asArray(graph.outcomes || graph.outcomeOptions).map((outcome) => ({
    id: compact(outcome.id),
    label: compact(outcome.label || outcome.title || outcome.id),
    phaseId: compact(outcome.phaseId),
    summary: compact(outcome.summary || outcome.description).slice(0, 500)
  })).filter((outcome) => outcome.id);
  return {
    missions: templates(packageData).map((template) => ({
      id: compact(template.id),
      title: compact(template.title),
      missionGraphId: compact(template.missionGraph?.id)
    })).filter((mission) => mission.id),
    phases,
    decisionPoints,
    outcomeOptions,
    knownFacts: knownFactIds(campaignState),
    revealBoundaries: asArray(graph.revealBoundaries).map(cloneJson)
  };
}

export function buildMissionDirectorFrame({
  campaignState = {},
  packageData = {},
  message = {},
  chatId = '',
  ingressId = '',
  arbiterPlan = null,
  sourceFrameRef = null,
  recentTranscript = [],
  sourceSettlement = null,
  promptStatus = null,
  recoverySummary = null
} = {}) {
  const graph = missionGraphFor(campaignState, packageData) || {};
  const map = packageStoryMap(campaignState, packageData);
  const activeStoryState = {
    activeMissionId: compact(campaignState.mission?.activeMissionId),
    activeMissionGraphId: compact(campaignState.mission?.activeMissionGraphId || graph.id),
    activePhaseId: compact(campaignState.mission?.activePhaseId || campaignState.attentionState?.scene?.phaseId),
    foregroundQuestId: compact(campaignState.attentionState?.foregroundQuestId || campaignState.questLedger?.foregroundQuestId),
    locationId: compact(campaignState.worldState?.currentLocationId || campaignState.attentionState?.scene?.locationId),
    stardate: campaignState.worldState?.currentStardate ?? campaignState.campaign?.currentStardate ?? null,
    presentCharacterIds: asArray(campaignState.attentionState?.scene?.presentCharacterIds).map(compact).filter(Boolean)
  };
  const frame = {
    kind: MISSION_DIRECTOR_FRAME_KIND,
    schemaVersion: 1,
    campaignId: compact(campaignState.campaign?.id || campaignState.campaign?.templateCampaignId),
    saveId: compact(campaignState.saveId || campaignState.campaign?.saveId),
    chatId: compact(chatId || message.chatId),
    ingress: {
      ingressId: compact(ingressId),
      hostMessageId: compact(message.hostMessageId || message.id),
      textHash: compact(message.textHash) || textHash(message.text || message.mes || message.content),
      sourceFrameRef: cloneJson(sourceFrameRef || null)
    },
    turnArbiterPlan: cloneJson(arbiterPlan || null),
    recentTranscript: compactTranscript(recentTranscript),
    sourceSettlement: cloneJson(sourceSettlement || null),
    currentStoryState: activeStoryState,
    packageStoryMap: map,
    continuityProjection: cloneJson(campaignState.runtimeTracking?.lastContinuityProjection || null),
    promptStatus: cloneJson(promptStatus || null),
    recoverySummary: cloneJson(recoverySummary || null)
  };
  return {
    frame,
    sourceHash: hashStableJson(frame),
    allowedRoots: ['mission', 'commandLog', 'questLedger', 'threadLedger', 'eventLedger', 'storyArcLedger', 'attentionState', 'openWorld'],
    allowedFactIds: map.knownFacts,
    allowedDecisionIds: map.decisionPoints.map((decision) => decision.id)
  };
}
