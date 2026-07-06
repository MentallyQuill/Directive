import {
  cloneJson,
  compact,
  hashContinuityText
} from './fact-schema.mjs';
import { normalizeContinuityState } from './state.mjs';

function coreRevisions(campaignState) {
  const projection = campaignState?.directiveRuntimeEvidence?.coreStoreReadProjections;
  if (projection?.runtimeAuthority !== 'coreStoreV2') return null;
  const runtime = Number(projection?.revisions?.runtime);
  const mechanics = Number(projection?.revisions?.mechanics);
  return {
    runtime: Number.isFinite(runtime) ? runtime : 0,
    mechanics: Number.isFinite(mechanics) ? mechanics : 0
  };
}

function revisionOf(campaignState) {
  const revisions = coreRevisions(campaignState);
  return Number(revisions?.runtime ?? campaignState?.runtimeTracking?.revision ?? campaignState?.turnLedger?.entries?.length ?? 0) || 0;
}

function mechanicsRevisionOf(campaignState) {
  const revisions = coreRevisions(campaignState);
  return Number(revisions?.mechanics ?? campaignState?.runtimeTracking?.mechanicsRevision ?? 0) || 0;
}

function currentLocationId(campaignState, packageData) {
  return compact(
    campaignState?.worldState?.currentLocationId
    || campaignState?.location?.id
    || campaignState?.mission?.locationId
    || campaignState?.attentionState?.scene?.locationId
    || packageData?.world?.openingLocationId
  ) || null;
}

function recentMessages(messages, limit = 8) {
  const source = Array.isArray(messages) ? messages : [];
  return source.slice(Math.max(0, source.length - limit)).map((message) => ({
    id: compact(message?.id || message?.messageId || message?.hostMessageId) || null,
    role: compact(message?.role || message?.speaker || message?.name) || null,
    text: compact(message?.text || message?.content || message?.mes || '').slice(0, 1400),
    hash: hashContinuityText(message?.text || message?.content || message?.mes || '')
  }));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function normalizeAcceptedAssistantVariant(value = null) {
  if (!isObject(value)) return null;
  const text = compact(value.text || value.selectedText || value.previousAssistantText || '').slice(0, 1400);
  const selectedTextHash = compact(value.selectedTextHash || value.textHash || (text ? hashContinuityText(text) : '')) || null;
  return {
    kind: compact(value.kind || 'directive.acceptedAssistantVariant.v1'),
    hostMessageId: compact(value.hostMessageId || value.messageId || value.id) || null,
    selectedVariantId: compact(value.selectedVariantId || value.variantId || '') || null,
    selectedSwipeIndex: numberOrNull(value.selectedSwipeIndex ?? value.swipeIndex),
    swipeCount: numberOrNull(value.swipeCount) ?? 0,
    selectedTextHash,
    visibleTextHash: compact(value.visibleTextHash || '') || null,
    sourceIntegrity: compact(value.sourceIntegrity || 'clean') || 'clean',
    directiveOwned: value.directiveOwned === true,
    responseId: compact(value.responseId || '') || null,
    outcomeId: compact(value.outcomeId || '') || null,
    responseKind: compact(value.responseKind || '') || null,
    observedAt: compact(value.observedAt || '') || null,
    acceptedAt: compact(value.acceptedAt || value.recordedAt || '') || null,
    text
  };
}

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(compact).filter(Boolean))];
}

function crewRecords(packageData = null, crewDataset = null) {
  const byId = new Map();
  for (const record of Array.isArray(crewDataset?.officers) ? crewDataset.officers : []) {
    if (record?.id) byId.set(record.id, { ...record });
  }
  for (const record of Array.isArray(packageData?.crew?.senior) ? packageData.crew.senior : []) {
    if (!record?.id) continue;
    byId.set(record.id, {
      ...(byId.get(record.id) || {}),
      ...record
    });
  }
  return [...byId.values()].filter((record) => compact(record?.id));
}

function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function actorSearchTerms(record = {}) {
  const terms = [
    record.id,
    record.name,
    ...(compact(record.id).split(/[-_\s]+/)),
    ...(compact(record.name).split(/\s+/))
  ].map(compact).filter((term) => term.length >= 3);
  return unique(terms);
}

function textReferencesTerm(text = '', term = '') {
  const value = compact(term);
  if (!value) return false;
  return new RegExp(`(^|[^a-z0-9])${escapeRegex(value.toLowerCase())}([^a-z0-9]|$)`, 'i')
    .test(String(text || '').toLowerCase());
}

function referencedActorIds({
  packageData = null,
  crewDataset = null,
  playerText = '',
  recentMessageSummary = '',
  recentChatMessages = [],
  acceptedAssistantVariant = null
} = {}) {
  const recentText = recentMessages(recentChatMessages, 8).map((message) => message.text).join('\n');
  const acceptedText = compact(acceptedAssistantVariant?.text || '');
  const haystack = [playerText, recentMessageSummary, recentText, acceptedText].map(compact).filter(Boolean).join('\n');
  if (!haystack) return [];
  const ids = [];
  for (const record of crewRecords(packageData, crewDataset)) {
    if (actorSearchTerms(record).some((term) => textReferencesTerm(haystack, term))) ids.push(record.id);
  }
  return unique(ids);
}

function shipDatasetSummary(shipDataset = null) {
  if (!shipDataset || typeof shipDataset !== 'object') return null;
  return {
    datasetId: compact(shipDataset?.manifest?.id) || null,
    shipId: compact(shipDataset?.manifest?.shipId) || null,
    classId: compact(shipDataset?.manifest?.classId) || null,
    areaIds: unique((Array.isArray(shipDataset?.areas) ? shipDataset.areas : []).map((area) => area?.id)),
    systemIds: unique((Array.isArray(shipDataset?.systems) ? shipDataset.systems : []).map((system) => system?.id))
  };
}

function sceneActorIds(scene = {}) {
  return unique([
    ...(Array.isArray(scene?.presentActorIds) ? scene.presentActorIds : []),
    ...(Array.isArray(scene?.presentCharacterIds) ? scene.presentCharacterIds : []),
    ...(Array.isArray(scene?.presentCharacters) ? scene.presentCharacters : []),
    ...(Array.isArray(scene?.relevantActorIds) ? scene.relevantActorIds : []),
    ...(Array.isArray(scene?.relevantCrewIds) ? scene.relevantCrewIds : [])
  ]);
}

function sceneGroupIds(scene = {}) {
  return unique([
    ...(Array.isArray(scene?.presentGroupIds) ? scene.presentGroupIds : []),
    ...(Array.isArray(scene?.relevantGroupIds) ? scene.relevantGroupIds : []),
    ...(Array.isArray(scene?.referencedGroupIds) ? scene.referencedGroupIds : []),
    ...(scene?.actorGroups && typeof scene.actorGroups === 'object' ? Object.keys(scene.actorGroups) : []),
    ...(scene?.actorGroupMap && typeof scene.actorGroupMap === 'object' ? Object.keys(scene.actorGroupMap) : []),
    ...(scene?.groupActorIds && typeof scene.groupActorIds === 'object' ? Object.keys(scene.groupActorIds) : [])
  ]);
}

export function buildContinuitySourceFrame({
  campaignState,
  packageData = null,
  crewDataset = null,
  shipDataset = null,
  campaignProjection = null,
  scene = {},
  playerText = '',
  recentMessageSummary = '',
  recentChatMessages = [],
  acceptedAssistantVariant = null,
  sourceDocuments = []
} = {}) {
  if (!campaignState || typeof campaignState !== 'object') throw new Error('campaignState must be an object.');
  const continuity = normalizeContinuityState(campaignState.continuity);
  const acceptedVariant = normalizeAcceptedAssistantVariant(acceptedAssistantVariant);
  const shipSummary = shipDatasetSummary(shipDataset);
  const presentActorIds = sceneActorIds(scene);
  const presentGroupIds = sceneGroupIds(scene);
  const referencedActors = referencedActorIds({
    packageData,
    crewDataset,
    playerText,
    recentMessageSummary,
    recentChatMessages,
    acceptedAssistantVariant: acceptedVariant
  });
  const relevantActorIds = unique([...presentActorIds, ...referencedActors]);
  const frame = {
    kind: 'directive.continuitySourceFrame.v1',
    campaignId: campaignState.campaign?.id || packageData?.manifest?.id || null,
    packageId: packageData?.manifest?.id || campaignState.campaign?.packageId || null,
    saveId: campaignState.saveId || campaignState.metadata?.saveId || campaignState.campaign?.saveId || null,
    branchId: campaignState.campaignChatBinding?.branchId || campaignState.runtimeTracking?.branchId || null,
    chatId: campaignState.campaignChatBinding?.chatId || null,
    revision: revisionOf(campaignState),
    mechanicsRevision: mechanicsRevisionOf(campaignState),
    locationId: currentLocationId(campaignState, packageData),
    activeQuestId: campaignState.attentionState?.foregroundQuestId || campaignState.mission?.activeQuestId || null,
    activePhaseId: scene?.activePhaseId || campaignState.attentionState?.scene?.activePhaseId || campaignProjection?.runtime?.activePhaseId || null,
    playerText: compact(playerText),
    recentMessageSummary: compact(recentMessageSummary),
    recentMessages: recentMessages(recentChatMessages),
    acceptedAssistantVariant: acceptedVariant,
    presentActorIds,
    presentGroupIds,
    relevantGroupIds: presentGroupIds,
    referencedActorIds: referencedActors,
    referencedGroupIds: [],
    relevantActorIds,
    actorGroups: cloneJson(scene?.actorGroups || scene?.actorGroupMap || scene?.groupActorIds || {}),
    scene: cloneJson(scene || {}),
    packageRevision: packageData?.manifest?.version || null,
    crewDatasetRevision: crewDataset?.manifest?.version || null,
    shipDatasetRevision: shipDataset?.manifest?.version || null,
    shipDatasetId: shipSummary?.datasetId || null,
    shipId: shipSummary?.shipId || packageData?.ship?.id || campaignState?.ship?.id || null,
    shipClassId: shipSummary?.classId || packageData?.ship?.classId || null,
    shipDatasetAreaIds: cloneJson(shipSummary?.areaIds || []),
    shipDatasetSystemIds: cloneJson(shipSummary?.systemIds || []),
    projectionRevision: campaignProjection?.metadata?.revision || campaignProjection?.manifest?.version || null,
    projectionHints: cloneJson(continuity.projectionHints),
    rejectedClaims: cloneJson(continuity.rejectedClaims),
    factUseStats: cloneJson(continuity.factUseStats),
    sourceDocuments: Array.isArray(sourceDocuments) ? sourceDocuments.map((source) => ({
      title: compact(source?.title),
      path: compact(source?.path),
      version: compact(source?.version),
      hash: source?.hash || null
    })).filter((source) => source.title || source.path) : []
  };
  frame.sourceHash = hashContinuityText(frame);
  return frame;
}
