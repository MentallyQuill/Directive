import { createPlayerSafeCampaignProjection } from '../generation/player-safe-prompt-context-builder.mjs';
import { timeAdvanceBoundary } from '../directors/director-coordinator.mjs';
import {
  adjudicateTimeAdvance,
  findTimeBoundaryForPlayerMessage,
  findTimeBoundaryForSourceAnchorRange
} from '../time/time-advance-adjudicator.mjs';
import {
  formatShipTime,
  resolveCampaignMinuteOfDay,
  stripCampaignReplyHeader
} from '../time/campaign-time-header.mjs';
import { createRuntimeLedgerView } from './runtime-ledger-view.mjs';
import {
  SOURCE_SETTLEMENT_LATEST_PAIR_ROLE_ID,
  latestPairSourceSettlementAuthority,
  latestPairSourceSettlementMetadata
} from './source-settlement-latest-pair-contract.mjs';
import { settleLatestPairSceneHandshakeSource } from './source-settlement-latest-pair-owner.mjs';

const ROLE_ID = 'sceneHandshakeSettler';
const MAX_PREVIOUS_TEXT = 7000;
const MAX_PLAYER_TEXT = 2500;
const MAX_LIST_ITEMS = 12;
const OPEN_THREAD_STATUSES = new Set(['available', 'engaged', 'active']);
const CLOSED_THREAD_STATUSES = new Set(['resolved', 'transformed', 'dormant', 'expired', 'echo']);

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function compact(value, maxLength = 1000) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function compactList(values = [], maxItems = MAX_LIST_ITEMS, maxLength = 220) {
  return (Array.isArray(values) ? values : [])
    .map((value) => compact(typeof value === 'string' ? value : (
      value?.summary || value?.label || value?.title || value?.name || value?.id || ''
    ), maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function asArray(value) {
  return Array.isArray(value) ? value.filter((item) => item !== undefined && item !== null) : [];
}

function timestamp(now) {
  return typeof now === 'function' ? now() : (now || new Date().toISOString());
}

function latestPairSceneHash(text = '') {
  let hash = 0x811c9dc5;
  for (const char of String(text || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function sourceText(message = {}) {
  return stripCampaignReplyHeader(message?.text || message?.mes || message?.content || '').trim();
}

function sourceTextFromValue(value = '') {
  return stripCampaignReplyHeader(String(value || '')).trim();
}

function messageId(message = {}) {
  return compact(message?.hostMessageId || message?.id || String(message?.index ?? ''), 180) || null;
}

function messageTimestamp(message = {}) {
  return message?.createdAt
    || message?.sentAt
    || message?.timestamp
    || message?.raw?.send_date
    || message?.raw?.sendDate
    || message?.raw?.extra?.timestamp
    || null;
}

function isUser(message = {}) {
  return message?.isUser === true || message?.role === 'user' || message?.is_user === true;
}

function isSystem(message = {}) {
  return message?.isSystem === true || message?.role === 'system' || message?.is_system === true;
}

function isDirectiveOwned(message = {}) {
  return Boolean(
    message?.isDirectiveOwned === true
    || message?.directiveOwned === true
    || message?.metadata?.idempotencyKey
    || message?.raw?.extra?.directive
    || message?.raw?.metadata?.directive
  );
}

function unsafeAssistantMessageReason(message = {}) {
  const status = compact(message.status || message.raw?.status || message.metadata?.status || '', 120).toLowerCase();
  if (['deleted', 'invalidated', 'superseded', 'interrupted', 'streaming', 'control', 'terminal'].includes(status)) {
    return `previous-assistant-${status}`;
  }
  if (message.deletedAt || message.raw?.deletedAt || message.raw?.deleted_at) return 'previous-assistant-deleted';
  if (message.invalidatedAt || message.raw?.invalidatedAt) return 'previous-assistant-invalidated';
  if (message.supersededAt || message.raw?.supersededAt) return 'previous-assistant-superseded';
  if (message.interrupted === true || message.raw?.interrupted === true) return 'previous-assistant-interrupted';
  if (message.streaming === true || message.raw?.streaming === true || message.raw?.is_streaming === true) return 'previous-assistant-streaming';
  if (message.control === true || message.raw?.control === true || message.responseKind === 'control') return 'previous-assistant-control';
  if (message.responseKind === 'terminalCheckpoint' || message.metadata?.responseKind === 'terminalCheckpoint') return 'previous-assistant-terminal';
  return null;
}

function selectedAssistantVariantId(message = {}) {
  const swipeId = message?.raw?.swipe_id
    ?? message?.raw?.swipeId
    ?? message?.raw?.swipeIndex
    ?? message?.metadata?.selectedSwipeIndex
    ?? message?.metadata?.swipeId;
  return swipeId === undefined || swipeId === null ? null : String(swipeId);
}

function directiveMetadataForMessage(message = {}) {
  if (isObject(message.metadata)) return message.metadata;
  if (isObject(message.raw?.extra?.directive)) return message.raw.extra.directive;
  if (isObject(message.raw?.metadata?.directive)) return message.raw.metadata.directive;
  if (isObject(message.raw?.metadata)) return message.raw.metadata;
  return {};
}

function selectedSwipeIndexForMessage(message = {}) {
  const metadata = directiveMetadataForMessage(message);
  const rawValue = message?.raw?.swipe_id
    ?? message?.raw?.swipeId
    ?? message?.raw?.swipeIndex
    ?? metadata.selectedSwipeIndex
    ?? metadata.swipeId;
  const value = Number(rawValue);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function assistantSwipes(message = {}) {
  const rawSwipes = Array.isArray(message?.raw?.swipes)
    ? message.raw.swipes
    : (Array.isArray(message?.swipes) ? message.swipes : []);
  return rawSwipes.map((entry) => String(entry || '')).filter(Boolean);
}

function selectedAssistantVariant(message = {}) {
  const metadata = directiveMetadataForMessage(message);
  const hostMessageId = messageId(message);
  const swipes = assistantSwipes(message);
  const selectedSwipeIndex = selectedSwipeIndexForMessage(message);
  const hasSelectedSwipe = Number.isInteger(selectedSwipeIndex)
    && selectedSwipeIndex >= 0
    && selectedSwipeIndex < swipes.length;
  const visibleText = sourceText(message);
  const selectedText = sourceTextFromValue(hasSelectedSwipe ? swipes[selectedSwipeIndex] : visibleText).slice(0, MAX_PREVIOUS_TEXT);
  const selectedTextHash = latestPairSceneHash(selectedText);
  const visibleTextHash = latestPairSceneHash(visibleText);
  let sourceIntegrity = 'clean';
  if (swipes.length && !hasSelectedSwipe) sourceIntegrity = 'stale';
  if (hasSelectedSwipe && visibleText && selectedTextHash !== visibleTextHash) sourceIntegrity = 'mismatch';
  return {
    kind: 'directive.selectedAssistantVariant.v1',
    hostMessageId,
    selectedVariantId: hasSelectedSwipe ? String(selectedSwipeIndex) : selectedAssistantVariantId(message),
    selectedSwipeIndex: hasSelectedSwipe ? selectedSwipeIndex : null,
    swipeCount: swipes.length,
    selectedTextHash,
    visibleTextHash,
    sourceIntegrity,
    directiveOwned: isDirectiveOwned(message),
    responseId: compact(metadata.responseId || metadata.sourceResponseId || metadata.idempotencyKey || '', 180) || null,
    outcomeId: compact(metadata.outcomeId || '', 180) || null,
    responseKind: compact(metadata.responseKind || '', 80) || null,
    observedAt: messageTimestamp(message),
    text: selectedText
  };
}

function selectedAssistantVariantLedgerRecord(variant = null) {
  if (!variant) return null;
  return {
    kind: variant.kind || 'directive.selectedAssistantVariant.v1',
    hostMessageId: variant.hostMessageId || null,
    selectedVariantId: variant.selectedVariantId || null,
    selectedSwipeIndex: Number.isInteger(variant.selectedSwipeIndex) ? variant.selectedSwipeIndex : null,
    swipeCount: Number.isInteger(variant.swipeCount) ? variant.swipeCount : 0,
    selectedTextHash: variant.selectedTextHash || null,
    visibleTextHash: variant.visibleTextHash || null,
    sourceIntegrity: variant.sourceIntegrity || 'clean',
    directiveOwned: variant.directiveOwned === true,
    responseId: variant.responseId || null,
    outcomeId: variant.outcomeId || null,
    responseKind: variant.responseKind || null,
    observedAt: variant.observedAt || null
  };
}

function findCurrentPlayerIndex(messages = [], currentPlayerMessage = {}) {
  const currentId = messageId(currentPlayerMessage);
  if (currentId) {
    const index = messages.findIndex((entry) => messageId(entry) === currentId);
    if (index >= 0) return index;
  }
  const currentHash = latestPairSceneHash(sourceText(currentPlayerMessage));
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const entry = messages[index];
    if (isUser(entry) && latestPairSceneHash(sourceText(entry)) === currentHash) return index;
  }
  return messages.length;
}

function resolvePreviousAssistantMessage({
  recentMessages = [],
  currentPlayerMessage = {}
} = {}) {
  const messages = (Array.isArray(recentMessages) ? recentMessages : []).filter(Boolean);
  const currentIndex = findCurrentPlayerIndex(messages, currentPlayerMessage);
  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const candidate = messages[index];
    if (!candidate || isSystem(candidate)) continue;
    if (isUser(candidate)) {
      return { message: null, index, skippedReason: 'previous-message-not-assistant' };
    }
    const text = selectedAssistantVariant(candidate).text || sourceText(candidate);
    if (!text) continue;
    const unsafeReason = unsafeAssistantMessageReason(candidate);
    if (unsafeReason) return { message: null, index, skippedReason: unsafeReason };
    return {
      message: candidate,
      index,
      skippedReason: isDirectiveOwned(candidate) ? 'previous-assistant-directive-owned' : null
    };
  }
  return { message: null, index: -1, skippedReason: 'no-previous-assistant' };
}

function unsafePreviousAssistantSkipReason(message = {}) {
  if (!message) return 'no-previous-assistant';
  if (isSystem(message)) return 'previous-message-system';
  if (isUser(message)) return 'previous-message-not-assistant';
  if (!sourceText(message)) return 'previous-assistant-empty';
  const unsafeReason = unsafeAssistantMessageReason(message);
  if (unsafeReason) return unsafeReason;
  if (isDirectiveOwned(message)) return 'previous-assistant-directive-owned';
  return null;
}

function fingerprintRecord(value = {}) {
  if (typeof value === 'string') {
    return {
      id: null,
      title: compact(value, 180),
      status: null,
      fingerprint: latestPairSceneHash(value)
    };
  }
  const title = compact(value.title || value.label || value.summary || value.name || value.id || '', 180);
  const summary = compact(value.summary || value.playerSafeSummary || value.detail || '', 220);
  return {
    id: value.id || null,
    title,
    status: value.status || value.state || null,
    dueWindow: value.dueWindow || value.deadline || null,
    linkedIds: [
      ...asArray(value.linkedCrewIds),
      ...asArray(value.linkedShipSystemIds),
      ...asArray(value.linkedThreadIds),
      ...asArray(value.linkedQuestIds)
    ].slice(0, 10),
    sourceHashes: asArray(value.sourceTextHashes || value.sourceHashes).slice(0, 4),
    fingerprint: value.fingerprint || latestPairSceneHash(`${title}\n${summary}`)
  };
}

function visibleFactFingerprints(campaignState = {}, safe = {}) {
  return compactList(safe?.mission?.knownFacts || campaignState?.knowledgeLedger?.facts || [], 8, 180)
    .map((title) => ({ title, fingerprint: latestPairSceneHash(title) }));
}

function commandLogFingerprints(campaignState = {}) {
  return asArray(campaignState.commandLog?.entries).slice(-8).map((entry) => ({
    id: entry.id || entry.sourceOutcomeId || null,
    type: entry.type || null,
    stardate: entry.stardate || entry.createdAtStardate || null,
    sourceIds: asArray(entry.sourceMessageIds || entry.evidenceMessageIds || [entry.sourceOutcomeId]).filter(Boolean).slice(0, 6),
    fingerprint: latestPairSceneHash([
      ...(entry.summaryInputs || []),
      ...(entry.visibleConsequences || []),
      entry.summary || '',
      entry.assistedSummary?.summary || ''
    ].join('\n'))
  }));
}

function threadFingerprints(campaignState = {}) {
  return asArray(campaignState.threadLedger?.records)
    .filter((record) => OPEN_THREAD_STATUSES.has(compact(record?.status, 80).toLowerCase()))
    .filter((record) => record?.metadata?.stale !== true)
    .slice(-12)
    .map((record) => ({
      id: record.id || null,
      title: compact(record.title || record.playerSummary || record.observableSeed || '', 180),
      status: record.status || null,
      participantIds: asArray(record.participantIds || record.participants || record.linkedCrewIds).slice(0, 8),
      fingerprint: record.semanticFingerprint || latestPairSceneHash([
        record.type || '',
        record.title || '',
        record.playerSummary || record.summary || record.observableSeed || '',
        ...asArray(record.participantIds || record.participants || record.linkedCrewIds)
      ].join('\n'))
    }))
    .filter((record) => record.title);
}

function mentionedResolverRecords(campaignState = {}, text = '') {
  const haystack = String(text || '').toLowerCase();
  const crew = asArray(campaignState?.crew?.senior || campaignState?.crew?.records || campaignState?.crew?.officers)
    .filter((entry) => {
      const name = compact(entry.name || entry.displayName || entry.id).toLowerCase();
      return name && haystack.includes(name.split(/\s+/).at(-1) || name);
    })
    .slice(0, 8)
    .map((entry) => ({
      id: entry.id || null,
      displayName: entry.name || entry.displayName || entry.id || null,
      rank: entry.rank || null,
      billet: entry.billet || entry.role || entry.position || null,
      division: entry.division || entry.department || null
    }));
  const systems = asArray(campaignState?.ship?.systems || campaignState?.ship?.systemNotes || campaignState?.ship?.technicalDebt)
    .filter((entry) => {
      const label = compact(entry.name || entry.label || entry.title || entry.systemId || entry.id).toLowerCase();
      return label && haystack.includes(label.split(/\s+/)[0]);
    })
    .slice(0, 8)
    .map((entry) => ({
      id: entry.id || entry.systemId || null,
      displayName: entry.name || entry.label || entry.title || entry.systemId || entry.id || null,
      status: entry.status || entry.condition || null,
      note: compact(entry.summary || entry.detail || entry.playerSafeSummary || '', 180) || null
    }));
  return { crew, shipSystems: systems };
}

function buildLatestPairSceneSnapshot({
  campaignState,
  previousAssistantMessage,
  currentPlayerMessage,
  chatId = null,
  ingressId = null,
  recentMessages = []
} = {}) {
  const state = campaignState || {};
  const safe = createPlayerSafeCampaignProjection({ campaignState: state }) || {};
  const runtimeLedgerView = createRuntimeLedgerView(state);
  const previousVariant = selectedAssistantVariant(previousAssistantMessage);
  const previousText = previousVariant.text.slice(0, MAX_PREVIOUS_TEXT);
  const playerText = sourceText(currentPlayerMessage).slice(0, MAX_PLAYER_TEXT);
  const combinedText = `${previousText}\n${playerText}`;
  const previousId = messageId(previousAssistantMessage);
  const playerId = messageId(currentPlayerMessage);
  const previousTextHash = latestPairSceneHash(previousText);
  const playerTextHash = latestPairSceneHash(playerText);
  const sourceRangeHash = latestPairSceneHash(`${previousId || ''}:${previousTextHash}:${playerId || ''}:${playerTextHash}`);
  const resolver = mentionedResolverRecords(state, combinedText);
  return {
    kind: 'directive.sceneHandshakeSnapshot.v1',
    budget: {
      maxPreviousAssistantChars: MAX_PREVIOUS_TEXT,
      maxCurrentPlayerChars: MAX_PLAYER_TEXT,
      recentMessageCount: Array.isArray(recentMessages) ? recentMessages.length : 0,
      optionalSlicesIncluded: [
        resolver.crew.length ? 'crewResolver' : null,
        resolver.shipSystems.length ? 'shipResolver' : null
      ].filter(Boolean)
    },
    envelope: {
      campaignId: state.campaign?.id || null,
      saveId: state.campaignChatBinding?.saveId || null,
      chatId: chatId || state.campaignChatBinding?.chatId || null,
      packageId: state.activeCampaignPackage?.packageId || state.campaign?.packageId || null,
      packageVersion: state.activeCampaignPackage?.version || state.campaign?.packageVersion || null,
      activeMissionId: state.mission?.activeMissionId || null,
      activeMissionTitle: safe.mission?.activeMissionId || state.mission?.activeMissionId || null,
      activePhaseId: state.mission?.activePhaseId || state.mission?.phase || null,
      runtimeRevision: null,
      mechanicsRevision: null,
      promptContextRevision: state.campaignChatBinding?.promptContextRevision || 0,
      ingressId
    },
    timeAndLocation: {
      currentStardate: state.worldState?.currentStardate ?? state.campaign?.currentStardate ?? safe.campaign?.currentStardate ?? null,
      currentShipTime: state.worldState?.shipTime || state.worldState?.shipClock || state.campaignTime?.shipTime || formatShipTime(resolveCampaignMinuteOfDay(state)),
      previousAssistantObservedAt: messageTimestamp(previousAssistantMessage),
      currentPlayerObservedAt: messageTimestamp(currentPlayerMessage),
      activeLocationId: state.worldState?.currentLocationId || safe.campaign?.locationId || null,
      activeLocationName: state.worldState?.currentLocationName || state.worldState?.locationName || null,
      routeContext: state.worldState?.routeContext || state.campaign?.routeContext || null,
      destination: state.worldState?.destination || state.campaign?.destination || null
    },
    source: {
      previousAssistant: {
        hostMessageId: previousId,
        ordinal: previousAssistantMessage?.index ?? null,
        selectedVariantId: previousVariant.selectedVariantId,
        selectedSwipeIndex: previousVariant.selectedSwipeIndex,
        swipeCount: previousVariant.swipeCount,
        sourceIntegrity: previousVariant.sourceIntegrity,
        textHash: previousTextHash,
        text: previousText,
        selectedVariant: previousVariant
      },
      currentPlayer: {
        hostMessageId: playerId,
        ordinal: currentPlayerMessage?.index ?? null,
        textHash: playerTextHash,
        text: playerText
      },
      sourceRangeHash
    },
    existingStateFingerprints: {
      formalObjectives: asArray(state.mission?.formalObjectives).map(fingerprintRecord).slice(0, 10),
      openAssignments: asArray(state.mission?.openAssignments).map(fingerprintRecord).slice(0, 12),
      activeDirectives: asArray(state.directives?.active).map(fingerprintRecord).slice(0, 8),
      recentCommandLog: commandLogFingerprints(state),
      visibleThreads: threadFingerprints(state),
      visiblePressures: asArray(safe.pressures || state.pressureLedger?.records).map(fingerprintRecord).slice(0, 8),
      visibleKnownFacts: visibleFactFingerprints(state, safe)
    },
    referenceResolver: {
      player: {
        id: state.player?.id || null,
        name: state.player?.name || null,
        rank: state.player?.rank || null,
        billet: state.player?.billet || null
      },
      crew: resolver.crew,
      shipSystems: resolver.shipSystems,
      location: {
        id: state.worldState?.currentLocationId || null,
        name: state.worldState?.currentLocationName || null
      }
    },
    safety: {
      currentChatGuardStatus: 'clean',
      saveGuardStatus: 'clean',
      pendingRecoveryCount: asArray(runtimeLedgerView.recoveryJournal).filter((entry) => !['resolved', 'applied'].includes(entry?.status)).length,
      pendingSceneReconciliationCount: asArray(state.sceneReconciliation?.pending).length,
      staleSourceWarnings: []
    }
  };
}

function sceneHandshakeLedgerAuthority({
  settlementId,
  snapshot,
  status = null,
  disposition = null,
  operationCount = 0
} = {}) {
  return latestPairSourceSettlementAuthority({
    settlementId,
    campaignId: snapshot?.envelope?.campaignId,
    saveId: snapshot?.envelope?.saveId,
    chatId: snapshot?.envelope?.chatId,
    previousAssistantHostMessageId: snapshot?.source?.previousAssistant?.hostMessageId,
    currentPlayerHostMessageId: snapshot?.source?.currentPlayer?.hostMessageId,
    sourceRangeHash: snapshot?.source?.sourceRangeHash,
    status,
    disposition,
    operationCount
  });
}

function createLatestPairSceneHandshakeLedgerRecord({
  settlementId,
  idempotencyKey,
  disposition,
  status,
  reasons = [],
  snapshot,
  settlement = null,
  operations = [],
  generation = null,
  parse = null,
  applied = null,
  error = null,
  metadata = null,
  modelRoleId = SOURCE_SETTLEMENT_LATEST_PAIR_ROLE_ID,
  recordedAt = null
}) {
  const authority = sceneHandshakeLedgerAuthority({
    settlementId,
    snapshot,
    status,
    disposition,
    operationCount: operations.length
  });
  const sourceMetadata = latestPairSourceSettlementMetadata(metadata || {});
  return {
    id: settlementId,
    idempotencyKey,
    status,
    disposition,
    reasons: cloneJson(reasons || []),
    campaignId: snapshot.envelope.campaignId,
    saveId: snapshot.envelope.saveId,
    chatId: snapshot.envelope.chatId,
    previousAssistantHostMessageId: snapshot.source.previousAssistant.hostMessageId,
    currentPlayerHostMessageId: snapshot.source.currentPlayer.hostMessageId,
    sourceTextHashes: cloneJson({
      previousAssistant: snapshot.source.previousAssistant.textHash,
      selectedAssistantVariant: snapshot.source.previousAssistant.selectedVariant?.selectedTextHash || snapshot.source.previousAssistant.textHash,
      currentPlayer: snapshot.source.currentPlayer.textHash,
      range: snapshot.source.sourceRangeHash
    }),
    selectedAssistantVariant: selectedAssistantVariantLedgerRecord(snapshot.source.previousAssistant.selectedVariant),
    promptContextRevisionBefore: snapshot.envelope.promptContextRevision || 0,
    runtimeRevisionBefore: snapshot.envelope.runtimeRevision ?? null,
    modelRoleId,
    providerId: generation?.diagnostics?.providerId || generation?.response?.providerId || null,
    model: generation?.diagnostics?.model || generation?.response?.model || null,
    latencyMs: generation?.diagnostics?.latencyMs ?? null,
    confidence: settlement?.confidence ?? null,
    playerReplyRelation: settlement?.playerReplyRelation || null,
    operationCount: operations.length,
    committedRoots: [...new Set(operations.map((operation) => operation.path.split('.')[0]))],
    parseStatus: parse?.ok === false ? 'failed' : (parse ? 'ok' : null),
    appliedRevision: applied?.revision || null,
    appliedMechanicsRevision: applied?.mechanicsRevision || null,
    authority: authority.authority,
    projectionSource: authority.projectionSource,
    compatibilityMirror: authority.compatibilityMirror,
    error: error ? {
      code: error.code || 'DIRECTIVE_SCENE_HANDSHAKE_FAILED',
      message: compact(error.message || String(error), 300)
    } : null,
    metadata: cloneJson(sourceMetadata),
    recordedAt: recordedAt || timestamp()
  };
}

function ledgerPathFor(disposition, status) {
  if (status === 'settled') return 'sceneHandshake.settled';
  if (disposition === 'operatorRecovery') return 'sceneHandshake.operatorRecovery';
  if (disposition === 'internalReview') return 'sceneHandshake.pendingInternalReview';
  if (status === 'rejected') return 'sceneHandshake.rejected';
  return 'sceneHandshake.deferred';
}

function latestPairSceneHandshakeResultOperations(record) {
  const path = ledgerPathFor(record.disposition, record.status);
  return [
    { op: 'upsert', path, identityKey: 'id', value: record },
    { op: 'set', path: 'sceneHandshake.lastResult', value: record }
  ];
}

function existingSceneHandshakeRecord(campaignState = {}, idempotencyKey = '') {
  const ledger = campaignState?.sceneHandshake || {};
  const records = [
    ...asArray(ledger.settled),
    ...asArray(ledger.pendingInternalReview),
    ...asArray(ledger.deferred),
    ...asArray(ledger.operatorRecovery),
    ...asArray(ledger.rejected)
  ];
  return records.find((entry) => entry?.idempotencyKey === idempotencyKey) || null;
}

function latestPairSceneIdempotencyKey(snapshot) {
  return [
    'scene-handshake',
    snapshot.envelope.campaignId || 'campaign',
    snapshot.envelope.saveId || 'save',
    snapshot.envelope.chatId || 'chat',
    snapshot.source.previousAssistant.hostMessageId || 'assistant',
    snapshot.source.previousAssistant.textHash,
    snapshot.source.currentPlayer.hostMessageId || 'player',
    snapshot.source.currentPlayer.textHash
  ].join(':');
}

const TIME_BOUNDARY_DOMAINS = Object.freeze([
  'campaign',
  'worldState',
  'timeLedger',
  'eventLedger',
  'storyArcLedger',
  'questLedger',
  'dynamicQuestCatalog',
  'attentionState',
  'mission',
  'threadLedger',
  'runtimeTracking'
]);

function timeSourceAnchorRange(snapshot = {}) {
  return {
    kind: 'sceneHandshakePair',
    previousAssistantHostMessageId: snapshot.source?.previousAssistant?.hostMessageId || null,
    currentPlayerHostMessageId: snapshot.source?.currentPlayer?.hostMessageId || null,
    rangeHash: snapshot.source?.sourceRangeHash || null
  };
}

async function commitAcceptedSceneTimeAdvance({
  campaignState,
  snapshot,
  settlement,
  stateDeltaGateway,
  packageData,
  generationRouter,
  ingressId = null,
  settlementId = null,
  now = null
} = {}) {
  if (!campaignState || !snapshot || !stateDeltaGateway?.commit || !packageData?.world) {
    return { campaignState, promptDirty: false, proposal: null, boundary: null };
  }
  const sourceAnchorRange = timeSourceAnchorRange(snapshot);
  const currentPlayerHostMessageId = snapshot.source?.currentPlayer?.hostMessageId || null;
  const existingBoundary = findTimeBoundaryForPlayerMessage(campaignState, currentPlayerHostMessageId)
    || findTimeBoundaryForSourceAnchorRange(campaignState, sourceAnchorRange);
  if (existingBoundary) {
    return { campaignState, promptDirty: false, proposal: null, boundary: null, existingBoundary };
  }
  const beforeMinute = resolveCampaignMinuteOfDay(campaignState);
  const proposal = await adjudicateTimeAdvance({
    campaignState,
    packageData,
    generationRouter,
    acceptedPreviousResponse: settlement?.acceptedPreviousResponse !== false,
    playerReplyRelation: settlement?.playerReplyRelation || null,
    previousAssistantText: snapshot.source.previousAssistant.text,
    currentPlayerText: snapshot.source.currentPlayer.text,
    previousAssistantHostMessageId: snapshot.source.previousAssistant.hostMessageId,
    currentPlayerHostMessageId: snapshot.source.currentPlayer.hostMessageId,
    sourceAnchorRange
  });
  if (!proposal?.elapsedMinutes || proposal.elapsedMinutes <= 0) {
    return { campaignState, promptDirty: false, proposal, boundary: null };
  }
  const boundary = timeAdvanceBoundary({
    state: campaignState,
    packageData,
    minutes: proposal.elapsedMinutes,
    reason: proposal.reason || 'accepted-scene-time',
    sourceAnchorRange,
    adjudication: {
      ...proposal,
      settlementId,
      beforeShipMinute: beforeMinute
    },
    now
  });
  const committed = await stateDeltaGateway.commit(boundary.state, {
    id: `${settlementId || 'scene-handshake'}:time`,
    source: 'timeAdvanceAdjudicator',
    reason: `Accepted scene advanced campaign time by ${proposal.elapsedMinutes} minutes.`,
    summary: `Accepted scene advanced campaign time by ${proposal.elapsedMinutes} minutes.`,
    domains: TIME_BOUNDARY_DOMAINS,
    ingressId,
    sourceAnchorRange,
    stable: true,
    metadata: {
      settlementId,
      timeAdvance: cloneJson(proposal),
      boundaryEventId: boundary.event?.id || null,
      beforeShipMinute: beforeMinute,
      afterShipMinute: resolveCampaignMinuteOfDay(boundary.state)
    }
  });
  return {
    campaignState: committed,
    promptDirty: true,
    proposal,
    boundary
  };
}

export async function runLatestPairSceneHandshakeSettlement({
  campaignState,
  currentPlayerMessage,
  previousAssistantMessage = null,
  recentMessages = [],
  chatId = null,
  ingressId = null,
  generationRouter = null,
  stateDeltaGateway = null,
  runLatestPairSettlementProvider = null,
  validateLatestPairSettlementBeforeApply = null,
  latestPairSourceFrame = null,
  packageData = null,
  coreStore = null,
  now = null
} = {}) {
  if (!campaignState || !currentPlayerMessage?.text) {
    return { attempted: false, reason: 'missing-state-or-message', campaignState };
  }
  const boundChatId = compact(campaignState.campaignChatBinding?.chatId || '', 300);
  const observedChatId = compact(chatId || currentPlayerMessage.chatId || '', 300);
  if (boundChatId && observedChatId && boundChatId !== observedChatId) {
    return {
      attempted: false,
      reason: 'wrong-chat',
      boundChatId,
      chatId: observedChatId,
      campaignState
    };
  }
  const boundSaveId = compact(campaignState.campaignChatBinding?.saveId || '', 300);
  const observedSaveId = compact(currentPlayerMessage.saveId || '', 300);
  if (boundSaveId && observedSaveId && boundSaveId !== observedSaveId) {
    return {
      attempted: false,
      reason: 'wrong-save',
      boundSaveId,
      saveId: observedSaveId,
      campaignState
    };
  }
  const resolved = previousAssistantMessage
    ? { message: previousAssistantMessage, skippedReason: unsafePreviousAssistantSkipReason(previousAssistantMessage) }
    : resolvePreviousAssistantMessage({ recentMessages, currentPlayerMessage });
  if (!resolved.message) {
    return { attempted: false, reason: resolved.skippedReason || 'no-previous-assistant', campaignState };
  }
  if (resolved.skippedReason) {
    return { attempted: false, reason: resolved.skippedReason, campaignState };
  }

  const snapshot = buildLatestPairSceneSnapshot({
    campaignState,
    previousAssistantMessage: resolved.message,
    currentPlayerMessage,
    chatId,
    ingressId,
    recentMessages
  });
  const idempotencyKey = latestPairSceneIdempotencyKey(snapshot);
  const existing = existingSceneHandshakeRecord(campaignState, idempotencyKey);
  if (existing) {
    return {
      attempted: false,
      deduplicated: true,
      reason: 'already-settled',
      record: cloneJson(existing),
      campaignState
    };
  }
  const settlementId = `settlement:${snapshot.envelope.campaignId || 'campaign'}:${snapshot.source.sourceRangeHash}`;
  const terminalSourceSettlement = await settleLatestPairSceneHandshakeSource({
    campaignState,
    snapshot,
    idempotencyKey,
    settlementId,
    stateDeltaGateway,
    runLatestPairSettlementProvider,
    validateLatestPairSettlementBeforeApply,
    latestPairSourceFrame,
    packageData,
    generationRouter,
    coreStore,
    ingressId,
    now,
    selectedAssistantVariantLedgerRecord,
    createSceneHandshakeLedgerRecord: createLatestPairSceneHandshakeLedgerRecord,
    sceneHandshakeResultOperations: latestPairSceneHandshakeResultOperations,
    commitAcceptedSceneTimeAdvance
  });
  if (terminalSourceSettlement) return terminalSourceSettlement;
  return {
    attempted: true,
    ok: false,
    disposition: 'repairRequired',
    promptDirty: false,
    sourceSettlement: {
      status: 'repairRequired',
      providerCalled: false,
      applied: false,
      reasons: ['source-settlement-latest-pair-unavailable']
    },
    reasons: ['source-settlement-latest-pair-unavailable'],
    campaignState
  };
}

export const __latestPairSceneAdapterTestHooks = Object.freeze({
  buildLatestPairSceneSnapshot,
  createLatestPairSceneHandshakeLedgerRecord,
  latestPairSceneHandshakeResultOperations,
  latestPairSceneIdempotencyKey,
  resolvePreviousAssistantMessage
});
