import { parseStructuredJsonText } from '../providers/structured-output-parser.mjs';
import { createPlayerSafeCampaignProjection } from '../generation/player-safe-prompt-context-builder.mjs';
import { timeAdvanceBoundary } from '../directors/director-coordinator.mjs';
import {
  adjudicateTimeAdvance,
  findTimeBoundaryForPlayerMessage
} from '../time/time-advance-adjudicator.mjs';
import {
  formatShipTime,
  resolveCampaignMinuteOfDay
} from '../time/campaign-time-header.mjs';
import { stripCampaignReplyHeader } from '../time/campaign-time-header.mjs';
import {
  normalizeThreadRecord,
  threadSemanticFingerprint,
  THREAD_TYPES
} from '../threads/thread-ledger.mjs';
import {
  createRuntimeLedgerView,
  readRuntimeCoreProjections
} from './runtime-ledger-view.mjs';
import {
  SOURCE_SETTLEMENT_LATEST_PAIR_ROLE_ID,
  latestPairSourceSettlementAuthority,
  latestPairSourceSettlementMetadata
} from './source-settlement-latest-pair-contract.mjs';
import { settleLatestPairSceneHandshakeSource } from './source-settlement-latest-pair-owner.mjs';
import {
  createLatestPairSourceSettlementProvider as createLatestPairSourceSettlementProviderRuntime
} from './source-settlement-latest-pair-provider.mjs';
import { validateLatestPairSettlement } from './source-settlement-latest-pair-validation.mjs';

const KIND = 'directive.sceneHandshakeSettlement.v1';
const ACCEPTED_RELATIONS = new Set(['acknowledges', 'continues', 'acts-on', 'asks-followup']);
const REJECTING_RELATIONS = new Set(['rejects', 'corrects']);
const DISPOSITIONS = new Set(['autoCommit', 'internalReview', 'defer', 'operatorRecovery']);
const MAX_PREVIOUS_TEXT = 7000;
const MAX_PLAYER_TEXT = 2500;
const MAX_LIST_ITEMS = 12;
const MAX_ASSIGNMENT_PROPOSALS = 5;
const MAX_COMMAND_LOG_PROPOSALS = 3;
const MAX_SHIP_READINESS_PROPOSALS = 5;
const MAX_THREAD_SIGNALS = 6;
const MAX_ASSIGNMENT_SUMMARY_LENGTH = 220;
const PLAYER_CURRENT_ORDER_SCOPE = 'playerCurrentOrder';
const LOW_RISK_SHIP_KINDS = new Set(['technicalDebt', 'readinessNote', 'systemNote']);
const OPEN_THREAD_STATUSES = new Set(['available', 'engaged', 'active']);
const CLOSED_THREAD_STATUSES = new Set(['resolved', 'transformed', 'dormant', 'expired', 'echo']);

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function activeRuntimeRevisionState(campaignState = null) {
  const projection = readRuntimeCoreProjections(campaignState || {});
  if (projection?.runtimeAuthority === 'coreStoreV2') {
    const runtime = Number(projection?.revisions?.runtime);
    const mechanics = Number(projection?.revisions?.mechanics);
    return {
      runtime: Number.isFinite(runtime) ? Math.max(0, runtime) : 0,
      mechanics: Number.isFinite(mechanics) ? Math.max(0, mechanics) : 0
    };
  }
  return {
    runtime: Math.max(0, Number(campaignState?.runtimeTracking?.revision) || 0),
    mechanics: Math.max(0, Number(campaignState?.runtimeTracking?.mechanicsRevision) || 0)
  };
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

function cleanList(values = [], maxItems = MAX_LIST_ITEMS) {
  return (Array.isArray(values) ? values : [])
    .map((value) => compact(typeof value === 'string' ? value : (
      value?.summary || value?.label || value?.title || value?.name || value?.id || ''
    ), Number.POSITIVE_INFINITY))
    .filter(Boolean)
    .slice(0, maxItems);
}

function asArray(value) {
  return Array.isArray(value) ? value.filter((item) => item !== undefined && item !== null) : [];
}

function timestamp(now) {
  return typeof now === 'function' ? now() : (now || new Date().toISOString());
}

export function sceneHandshakeHash(text = '') {
  let hash = 0x811c9dc5;
  for (const char of String(text || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function slug(value = '', fallback = 'item') {
  const text = compact(value, 120).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return text || fallback;
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
  const selectedTextHash = sceneHandshakeHash(selectedText);
  const visibleTextHash = sceneHandshakeHash(visibleText);
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
  const currentHash = sceneHandshakeHash(sourceText(currentPlayerMessage));
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const entry = messages[index];
    if (isUser(entry) && sceneHandshakeHash(sourceText(entry)) === currentHash) return index;
  }
  return messages.length;
}

export function resolvePreviousAssistantMessage({
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
      fingerprint: sceneHandshakeHash(value)
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
    fingerprint: value.fingerprint || sceneHandshakeHash(`${title}\n${summary}`)
  };
}

function visibleFactFingerprints(campaignState = {}, safe = {}) {
  return compactList(safe?.mission?.knownFacts || campaignState?.knowledgeLedger?.facts || [], 8, 180)
    .map((title) => ({ title, fingerprint: sceneHandshakeHash(title) }));
}

function commandLogFingerprints(campaignState = {}) {
  return asArray(campaignState.commandLog?.entries).slice(-8).map((entry) => ({
    id: entry.id || entry.sourceOutcomeId || null,
    type: entry.type || null,
    stardate: entry.stardate || entry.createdAtStardate || null,
    sourceIds: asArray(entry.sourceMessageIds || entry.evidenceMessageIds || [entry.sourceOutcomeId]).filter(Boolean).slice(0, 6),
    fingerprint: sceneHandshakeHash([
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
      fingerprint: record.semanticFingerprint || sceneHandshakeHash([
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

export function buildSceneHandshakeSnapshot({
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
  const previousTextHash = sceneHandshakeHash(previousText);
  const playerTextHash = sceneHandshakeHash(playerText);
  const sourceRangeHash = sceneHandshakeHash(`${previousId || ''}:${previousTextHash}:${playerId || ''}:${playerTextHash}`);
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

function createPrompt(snapshot) {
  const system = [
    'You are Directive Scene Handshake, a Utility-lane state settlement checker.',
    'Decide whether the current player reply accepts the immediately previous assistant response as current fiction.',
    'Extract only explicit player-visible command-log-worthy facts, low-risk ship technical-debt/readiness notes, thread evidence, and current orders placed on the player command character from that previous assistant response.',
    'openAssignmentProposals is only for obligations assigned to the player character. Do not put orders the player gave to crew, crew acknowledgements, delegated department tasks, or subordinate work items in openAssignmentProposals.',
    'For each openAssignmentProposals item, include a brief headline title, one concise detail sentence, assignedByActorId when known, and assignedActorIds containing the player id when the order is on the player.',
    'If the previous assistant response gives numbered, ordinal, or clearly stated assignments to the player and the player accepts or acts on them, openAssignmentProposals must contain one proposal per accepted player assignment.',
    'Do not return acceptedPreviousResponse true with empty proposal arrays when explicit current orders on the player, objectives, or readiness issues were accepted.',
    'Do not infer hidden motives, private relationship values, terminal outcomes, formal objective progress, Command Bearing awards, damage, casualties, or mission phase changes.',
    'Return one strict JSON object only. Do not narrate and do not include markdown.',
    'If the player rejects, corrects, rerolls, or challenges the previous assistant response, return acceptedPreviousResponse false and disposition "defer".',
    'Use this shape:',
    '{"kind":"directive.sceneHandshakeSettlement.v1","acceptedPreviousResponse":true,"playerReplyRelation":"acknowledges","confidence":0.9,"disposition":"autoCommit","needsInternalReview":false,"internalReviewReasons":[],"deferReason":null,"operatorRecoveryOnly":false,"openAssignmentProposals":[],"commandLogProposals":[],"shipReadinessProposals":[],"threadSignals":[]}'
  ].join('\n');
  const user = [
    'Scene Handshake snapshot:',
    JSON.stringify(snapshot, null, 2)
  ].join('\n');
  return {
    prompt: `${system}\n\n${user}`,
    systemPrompt: system,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    metadata: {
      source: 'scene-handshake',
      snapshotKind: snapshot.kind,
      campaignId: snapshot.envelope.campaignId,
      chatId: snapshot.envelope.chatId,
      previousAssistantHostMessageId: snapshot.source.previousAssistant.hostMessageId,
      currentPlayerHostMessageId: snapshot.source.currentPlayer.hostMessageId,
      selectedAssistantVariant: selectedAssistantVariantLedgerRecord(snapshot.source.previousAssistant.selectedVariant),
      promptBudget: cloneJson(snapshot.budget),
      optionalSlicesIncluded: cloneJson(snapshot.budget?.optionalSlicesIncluded || []),
      sourceTextHashes: cloneJson({
        previousAssistant: snapshot.source.previousAssistant.textHash,
        selectedAssistantVariant: snapshot.source.previousAssistant.selectedVariant?.selectedTextHash || snapshot.source.previousAssistant.textHash,
        currentPlayer: snapshot.source.currentPlayer.textHash,
        range: snapshot.source.sourceRangeHash
      })
    }
  };
}

function responseText(generated = {}) {
  return generated?.response?.text
    || generated?.response?.content
    || generated?.response?.raw?.text
    || generated?.text
    || generated?.content
    || '';
}

function parseSceneHandshakeSettlementOutput(value) {
  const parsed = typeof value === 'string'
    ? parseStructuredJsonText(value)
    : { ok: isObject(value), value };
  if (!parsed.ok) {
    return {
      ok: false,
      error: {
        code: 'DIRECTIVE_SCENE_HANDSHAKE_PARSE_FAILED',
        message: parsed.error || parsed.diagnostic?.message || 'Scene Handshake output was not valid JSON.',
        diagnostic: cloneJson(parsed.diagnostic || null)
      }
    };
  }
  if (!isObject(parsed.value)) {
    return {
      ok: false,
      error: {
        code: 'DIRECTIVE_SCENE_HANDSHAKE_OBJECT_REQUIRED',
        message: 'Scene Handshake output must be a JSON object.'
      }
    };
  }
  return { ok: true, value: cloneJson(parsed.value) };
}

function normalizeRelation(value) {
  const text = compact(value).toLowerCase();
  if (text === 'acts on' || text === 'actson') return 'acts-on';
  if (ACCEPTED_RELATIONS.has(text) || REJECTING_RELATIONS.has(text) || ['ambiguous', 'unrelated'].includes(text)) return text;
  return 'ambiguous';
}

function normalizeDisposition(value, fallback = 'defer') {
  const text = compact(value) || fallback;
  return DISPOSITIONS.has(text) ? text : fallback;
}

function normalizeSettlement(raw = {}) {
  const playerReplyRelation = normalizeRelation(raw.playerReplyRelation);
  const acceptedPreviousResponse = raw.acceptedPreviousResponse === true
    && ACCEPTED_RELATIONS.has(playerReplyRelation)
    && !REJECTING_RELATIONS.has(playerReplyRelation);
  const confidence = Math.max(0, Math.min(1, Number(raw.confidence ?? (acceptedPreviousResponse ? 0.7 : 0.4)) || 0));
  const disposition = normalizeDisposition(raw.disposition, acceptedPreviousResponse ? 'autoCommit' : 'defer');
  return {
    kind: raw.kind || KIND,
    acceptedPreviousResponse,
    playerReplyRelation,
    confidence,
    disposition,
    needsInternalReview: raw.needsInternalReview === true || disposition === 'internalReview',
    internalReviewReasons: compactList(raw.internalReviewReasons || raw.reviewReasons || [], 8, 240),
    deferReason: compact(raw.deferReason || '', 240) || null,
    operatorRecoveryOnly: raw.operatorRecoveryOnly === true || disposition === 'operatorRecovery',
    openAssignmentProposals: asArray(raw.openAssignmentProposals).slice(0, MAX_ASSIGNMENT_PROPOSALS),
    commandLogProposals: asArray(raw.commandLogProposals).slice(0, MAX_COMMAND_LOG_PROPOSALS),
    shipReadinessProposals: asArray(raw.shipReadinessProposals).slice(0, MAX_SHIP_READINESS_PROPOSALS),
    threadSignals: asArray(raw.threadSignals).slice(0, MAX_THREAD_SIGNALS)
  };
}

function normalizedText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function taskCueText(snapshot = {}) {
  return normalizedText(snapshot.source?.previousAssistant?.text || '');
}

function playerActorIds(snapshot = {}) {
  const player = snapshot.referenceResolver?.player || {};
  return new Set([
    player.id,
    player.name,
    'player-commander'
  ].map((value) => compact(value, 180).toLowerCase()).filter(Boolean));
}

function actorValueMatchesPlayer(value = '', snapshot = {}) {
  const actor = compact(value, 180).toLowerCase();
  return Boolean(actor && playerActorIds(snapshot).has(actor));
}

function sourceLooksLikePlayerIssuedOrders(snapshot = {}) {
  const text = taskCueText(snapshot);
  if (!text) return false;
  if (/\b(whitaker|captain|starfleet command|admiral)\b/i.test(text)) return false;
  if (/\b(?:aye|understood|yes|copy),?\s+(?:sir|commander)\b/i.test(text)) return true;
  if (/\b(?:draft by|completed within|i'll|i will|we'll|report exceptions|diagnostic|audit|inspection)\b/i.test(text)
    && /\b(?:sir|commander)\b/i.test(text)) {
    return true;
  }
  return false;
}

function sourceHasPlayerAssignmentAuthority(snapshot = {}) {
  const text = taskCueText(snapshot);
  if (!text || sourceLooksLikePlayerIssuedOrders(snapshot)) return false;
  return /\b(whitaker|captain|starfleet command|admiral)\b/i.test(text)
    && /\b(i want|i need|you need|your assignment|your orders|your assessment|use it|walk the ship|meet your|if they ask|get down to|report back|provide|prepare)\b/i.test(text);
}

function cleanTaskSegment(value = '') {
  return normalizedText(value)
    .replace(/^[\s"'`]+|[\s"'`.]+$/g, '')
    .replace(/^[,:;.\-\u2013\u2014]+/, '')
    .trim();
}

function splitTaskSentences(value = '') {
  return cleanTaskSegment(value)
    .split(/(?:[.!?]\s+|;\s+)/)
    .map(cleanTaskSegment)
    .filter(Boolean);
}

function directSpeechSegments(text = '') {
  const quoted = [...String(text || '').matchAll(/"([^"]{2,1400})"/g)]
    .map((match) => cleanTaskSegment(match[1]))
    .filter(Boolean);
  if (quoted.length) return quoted;
  return String(text || '')
    .split(/\n{2,}|\r?\n/)
    .map(cleanTaskSegment)
    .filter(Boolean);
}

function splitOrdinalSegments(paragraph = '') {
  const text = cleanTaskSegment(paragraph);
  const ordinal = /(?:^|[\s"'(])((?:first|second|third|fourth|fifth)\s*[,;:.\-\u2013\u2014]+|[1-5][.)]\s*)/gi;
  const matches = [...text.matchAll(ordinal)];
  if (!matches.length) return [];
  return matches.map((match, index) => cleanTaskSegment(
    text.slice(match.index + match[0].length, matches[index + 1]?.index ?? text.length)
  )).filter(Boolean);
}

function playerOrderCue(segment = '') {
  const text = cleanTaskSegment(segment);
  if (!text) return false;
  if (text.length < 12 && !/\b(walk|meet|report)\b/i.test(text)) return false;
  return /\b(i want|i need|you need|your assignment|your orders|your priority|your assessment|get down to|walk the ship|meet your|meet bronn|talk to|find out|check with|follow up|look into|take point|give me|bring me|prepare|provide|report back|if they ask|tell them)\b/i.test(text);
}

function explicitTaskSegments(snapshot = {}) {
  const text = taskCueText(snapshot);
  if (!text) return [];
  if (sourceLooksLikePlayerIssuedOrders(snapshot)) return [];
  const paragraphs = directSpeechSegments(text);
  const ordinalSegments = [];
  for (const paragraph of paragraphs) {
    ordinalSegments.push(...splitOrdinalSegments(paragraph));
  }
  if (ordinalSegments.length) {
    return ordinalSegments
      .filter(playerOrderCue)
      .slice(0, MAX_ASSIGNMENT_PROPOSALS);
  }

  return paragraphs
    .flatMap(splitTaskSentences)
    .filter(playerOrderCue)
    .slice(0, MAX_ASSIGNMENT_PROPOSALS);
}

function resolverCrewId(snapshot = {}, pattern) {
  const records = asArray(snapshot.referenceResolver?.crew);
  const match = records.find((entry) => pattern.test(`${entry?.id || ''} ${entry?.displayName || ''} ${entry?.billet || ''}`));
  return match?.id || null;
}

function fallbackCrewIdsForSegment(segment = '', snapshot = {}) {
  const checks = [
    [/whitaker/i, 'mara-whitaker'],
    [/\bbronn\b/i, 'hadrik-bronn'],
    [/\bcross\b/i, 'imani-cross'],
    [/\bsato\b/i, 'miriam-sato'],
    [/\bsaye\b/i, 'rowan-saye']
  ];
  const ids = [];
  for (const [pattern, fallbackId] of checks) {
    if (!pattern.test(segment)) continue;
    ids.push(resolverCrewId(snapshot, pattern) || fallbackId);
  }
  return [...new Set(ids)].slice(0, 8);
}

function assignedByActorId(snapshot = {}) {
  const text = taskCueText(snapshot);
  if (!/\b(whitaker|captain)\b/i.test(text)) return null;
  return resolverCrewId(snapshot, /whitaker|captain/i) || 'mara-whitaker';
}

function dueWindowForSegment(segment = '', snapshot = {}) {
  const source = `${taskCueText(snapshot)} ${segment}`;
  if (/\btoday\b/i.test(segment) && /\balpha shift\b/i.test(segment)) return 'Today during alpha shift.';
  if (/\bsenior[-\s]?staff\b/i.test(source) || /\bbriefing\b/i.test(segment)) return 'Before the senior-staff briefing.';
  if (/\bneed-to-know\b/i.test(segment)) return 'Until Captain Whitaker briefs the senior staff.';
  if (/\btwelve hours?\b/i.test(source)) return 'Within the current twelve-hour command window.';
  if (/\bbefore\b.+\bReach\b/i.test(source) || /\bten days out\b/i.test(source)) return 'Before arrival at the Reach.';
  if (/\balpha shift\b/i.test(segment)) return 'During alpha shift.';
  return null;
}

function assignmentTitleForSegment(segment = '') {
  if (/\bassessment\b/i.test(segment) && /\b(senior staff|desk|tools|readiness)\b/i.test(segment)) {
    return 'Prepare XO readiness assessment';
  }
  if (/\bneed-to-know\b/i.test(segment)) return 'Keep mission details need-to-know';
  if (/\bcommand-network\b/i.test(segment) || (/\bcross\b/i.test(segment) && /\bhandoff\b/i.test(segment))) {
    return 'Review the command-network handoff';
  }
  if (/\bmeet\b.+\bbronn\b/i.test(segment) || /\bbronn\b/i.test(segment)) {
    return /\balpha shift\b/i.test(segment) ? 'Meet Bronn on alpha shift' : 'Meet Bronn';
  }
  if (/\bwalk the ship\b/i.test(segment) || /\bdepartment heads?\b/i.test(segment)) return 'Walk the ship';
  if (/\bengineering\b/i.test(segment)) return 'Follow up in Engineering';
  if (/\bmedical\b/i.test(segment)) return 'Follow up with Medical';
  if (/\bscience\b/i.test(segment)) return 'Follow up with Science';
  const firstSentence = cleanTaskSegment(segment.split(/[.!?]/)[0] || segment);
  return compact(firstSentence, 90) || 'Follow up on accepted order';
}

function assignmentSummaryForSegment(segment = '', title = '') {
  if (/Prepare XO readiness assessment/i.test(title)) {
    return 'Assess actual post-refit ship readiness before the senior-staff briefing.';
  }
  if (/Keep mission details need-to-know/i.test(title)) {
    return 'Tell crew the Reach mission remains need-to-know until Captain Whitaker briefs them.';
  }
  if (/Review the command-network handoff/i.test(title)) {
    return 'Meet Commander Cross in Engineering and review the command-network handoff risk.';
  }
  if (/Meet Bronn/i.test(title)) {
    return 'Introduce yourself to Bronn professionally while he is on duty.';
  }
  if (/Walk the ship/i.test(title)) {
    return 'Meet department heads and identify post-refit issues before arrival.';
  }
  return compact(cleanTaskSegment(segment), MAX_ASSIGNMENT_SUMMARY_LENGTH);
}

function linkedShipSystemIdsForSegment(segment = '', campaignState = {}) {
  const existing = asArray(campaignState.ship?.technicalDebt);
  const ids = [];
  if (/\bcommand-network\b/i.test(segment)) {
    const match = existing.find((entry) => /\bcommand-network\b/i.test(`${entry?.id || ''} ${entry?.label || ''} ${entry?.playerSafeSummary || ''}`));
    ids.push(match?.id || 'ship.command-network-certificate-compatibility');
  }
  if (/\bsensor\b/i.test(segment)) ids.push('ship.sensor-array-calibration');
  if (/\bpower feeds?\b|\bsurgical bay\b/i.test(segment)) ids.push('ship.medical-power-feed-mismatch');
  return [...new Set(ids)].slice(0, 5);
}

function shipReadinessFromSegment(segment = '', snapshot = {}, campaignState = {}) {
  if (!/\b(command-network|handoff issue|operational risk|power feeds?|sensor array|calibration|refit broke|yard did not catch|not quite right)\b/i.test(segment)) {
    return null;
  }
  const existingDebt = asArray(campaignState.ship?.technicalDebt);
  if (/\bcommand-network\b/i.test(segment)) {
    const match = existingDebt.find((entry) => /\bcommand-network\b/i.test(`${entry?.id || ''} ${entry?.label || ''} ${entry?.playerSafeSummary || ''}`));
    return {
      id: match?.id || 'ship.command-network-certificate-compatibility',
      kind: 'technicalDebt',
      label: match?.label || 'Command-network handoff issue',
      detail: segment,
      owner: /\bcross\b/i.test(segment) ? 'Commander Cross' : null,
      status: 'under-review'
    };
  }
  if (/\bsensor array|calibration\b/i.test(segment)) {
    return {
      kind: 'technicalDebt',
      label: 'Sensor array calibration concern',
      detail: segment,
      owner: /\bsaye\b/i.test(segment) ? 'Saye in Science' : null,
      status: 'under-review'
    };
  }
  if (/\bpower feeds?|surgical bay|Medical\b/i.test(segment)) {
    return {
      kind: 'technicalDebt',
      label: 'Medical bay power-feed mismatch',
      detail: segment,
      owner: /\bsato\b/i.test(segment) ? 'Sato in Medical' : null,
      status: 'under-review'
    };
  }
  return {
    kind: 'technicalDebt',
    label: assignmentTitleForSegment(segment),
    detail: segment,
    status: 'under-review'
  };
}

function sourceShipReadinessSegments(snapshot = {}) {
  const text = taskCueText(snapshot);
  if (!text) return [];
  const segments = [];
  if (/\bcommand-network\b|\bhandoff issue\b|\boperational risk\b/i.test(text)) {
    segments.push('Commander Cross has a command-network handoff issue that may hide an operational risk.');
  }
  if (/\bsato\b|\bsurgical bay\b|\bpower feeds?\b/i.test(text)) {
    segments.push('Sato in Medical had surgical bay power-feed refit problems that may still need review.');
  }
  if (/\bsaye\b|\bsensor array\b|\bcalibration\b/i.test(text)) {
    segments.push('Saye in Science has been quiet about sensor array calibration after the refit.');
  }
  return segments.slice(0, MAX_SHIP_READINESS_PROPOSALS);
}

function deterministicAcceptedProposals({ settlement, snapshot, campaignState } = {}) {
  if (!settlement?.acceptedPreviousResponse || settlement.disposition !== 'autoCommit') {
    return {
      explicitTaskCount: 0,
      openAssignmentProposals: [],
      commandLogProposals: [],
      shipReadinessProposals: [],
      threadSignals: []
    };
  }
  const sourceSegments = explicitTaskSegments(snapshot);
  const assignmentSegments = asArray(settlement.openAssignmentProposals)
    .map((proposal) => compact(`${proposal?.title || ''}. ${proposal?.summary || ''}`, 1000))
    .filter(Boolean);
  const segments = sourceSegments.length ? sourceSegments : assignmentSegments;
  const readinessSegments = sourceShipReadinessSegments(snapshot);
  if (!segments.length && !readinessSegments.length) {
    return {
      explicitTaskCount: 0,
      openAssignmentProposals: [],
      commandLogProposals: [],
      shipReadinessProposals: [],
      threadSignals: []
    };
  }

  const assigner = assignedByActorId(snapshot);
  const playerId = snapshot.referenceResolver?.player?.id || 'player-commander';
  const openAssignmentProposals = sourceSegments.length ? segments.map((segment) => {
    const title = assignmentTitleForSegment(segment);
    return {
      title,
      summary: assignmentSummaryForSegment(segment, title),
      assignmentScope: PLAYER_CURRENT_ORDER_SCOPE,
      assignedByActorId: assigner,
      assignedActorIds: [playerId],
      linkedCrewIds: fallbackCrewIdsForSegment(segment, snapshot),
      linkedShipSystemIds: linkedShipSystemIdsForSegment(segment, campaignState),
      dueWindow: dueWindowForSegment(segment, snapshot)
    };
  }) : [];
  const assignmentBasis = sourceSegments.length
    ? openAssignmentProposals
    : asArray(settlement.openAssignmentProposals).map((proposal, index) => {
      const segment = segments[index] || `${proposal?.title || ''}. ${proposal?.summary || ''}`;
      return {
        title: proposal?.title || assignmentTitleForSegment(segment),
        summary: proposal?.summary || assignmentSummaryForSegment(segment, proposal?.title || assignmentTitleForSegment(segment)),
        assignmentScope: proposal?.assignmentScope || PLAYER_CURRENT_ORDER_SCOPE,
        assignedByActorId: proposal?.assignedByActorId || assigner,
        assignedActorIds: asArray(proposal?.assignedActorIds || proposal?.assignees).length
          ? asArray(proposal.assignedActorIds || proposal.assignees)
          : [playerId],
        linkedCrewIds: asArray(proposal?.linkedCrewIds).length
          ? asArray(proposal.linkedCrewIds)
          : fallbackCrewIdsForSegment(segment, snapshot),
        linkedShipSystemIds: asArray(proposal?.linkedShipSystemIds).length
          ? asArray(proposal.linkedShipSystemIds)
          : linkedShipSystemIdsForSegment(segment, campaignState),
        dueWindow: proposal?.dueWindow || dueWindowForSegment(segment, snapshot)
      };
    });
  const shipReadinessProposals = mergeProposals(
    segments
      .map((segment) => shipReadinessFromSegment(segment, snapshot, campaignState))
      .filter(Boolean),
    readinessSegments
      .map((segment) => shipReadinessFromSegment(segment, snapshot, campaignState))
      .filter(Boolean),
    MAX_SHIP_READINESS_PROPOSALS
  );
  const threadSignals = assignmentBasis.map((assignment) => ({
    title: assignment.title,
    summary: assignment.summary,
    type: assignment.linkedShipSystemIds?.length ? 'shipboard_maintenance' : 'professional_dilemma',
    linkedCrewIds: assignment.linkedCrewIds,
    directCommitment: true
  }));
  const sourceActor = assigner === 'mara-whitaker' ? 'Whitaker' : 'The previous assistant response';
  const commandLogProposals = [{
    summaryInputs: [
      `${sourceActor} gave ${snapshot.referenceResolver?.player?.name || 'the player'} accepted current orders: ${assignmentBasis.map((entry) => entry.title).join('; ')}.`
    ],
    visibleConsequences: [
      `${snapshot.referenceResolver?.player?.name || 'The player'} accepted the assignments in the next reply.`
    ]
  }];
  return {
    explicitTaskCount: Math.max(sourceSegments.length, assignmentBasis.length),
    openAssignmentProposals,
    commandLogProposals,
    shipReadinessProposals,
    threadSignals
  };
}

function proposalKey(value = {}) {
  return slug(value.id || value.title || value.label || value.summary || value.detail || JSON.stringify(value));
}

function mergeProposals(primary = [], fallback = [], limit = MAX_LIST_ITEMS) {
  const merged = [];
  const seen = new Set();
  for (const item of [...asArray(primary), ...asArray(fallback)]) {
    const key = proposalKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= limit) break;
  }
  return merged;
}

function shipReadinessProposalLooksValid(raw = {}) {
  const kind = compact(raw.kind || raw.type || 'technicalDebt', 80);
  if (!LOW_RISK_SHIP_KINDS.has(kind)) return false;
  const label = compact(raw.label || raw.title || raw.summary, 180);
  const detail = compact(raw.detail || raw.summary || raw.description || label, 500);
  return Boolean(label && detail);
}

function threadSignalLooksValid(raw = {}) {
  const title = compact(raw.title || raw.label || raw.summary, 180);
  const summary = compact(raw.summary || raw.observableSeed || raw.detail || title, 500);
  return Boolean(title && summary && !proposalLooksLikeMenuOfframp(title, summary));
}

function menuOfframpText(value = '') {
  const text = compact(value, 500);
  if (!text) return false;
  const lower = text.toLowerCase();
  if (/^or\b/.test(lower)) return true;
  if (/\bor something else entirely\b/.test(lower)) return true;
  if (/\bor straight to\b/.test(lower)) return true;
  if (/\bstraight to\b[\s\S]{0,80}\bor\b/.test(lower)) return true;
  if (/\b(?:could|can|may)\s+(?:go|head|continue|proceed|choose|take|start)\b[\s\S]{0,120}\bor\b/.test(lower)) return true;
  if (/\b(?:either|whether)\b[\s\S]{0,120}\bor\b/.test(lower)) return true;
  if (/\b(?:if you prefer|alternatively|otherwise)\b[\s\S]{0,120}\b(?:go|head|continue|proceed|choose|take|start)\b/.test(lower)) return true;
  return false;
}

function proposalLooksLikeMenuOfframp(...values) {
  return values.map((value) => compact(value, 500)).filter(Boolean).some(menuOfframpText);
}

function knownCrewIdsForSnapshot(snapshot = {}, fallbackIds = []) {
  return new Set([
    ...asArray(snapshot.referenceResolver?.crew).map((entry) => compact(entry?.id, 160)).filter(Boolean),
    ...asArray(fallbackIds).map((entry) => compact(entry, 160)).filter(Boolean),
    'mara-whitaker',
    'hadrik-bronn',
    'imani-cross',
    'miriam-sato',
    'rowan-saye',
    'priya-nayar',
    'kieran-vale'
  ]);
}

function canonicalLinkedCrewIds(proposalIds = [], fallbackIds = [], snapshot = {}) {
  const known = knownCrewIdsForSnapshot(snapshot, fallbackIds);
  const result = [];
  for (const id of asArray(fallbackIds)) {
    const clean = compact(id, 160);
    if (clean && !result.includes(clean)) result.push(clean);
  }
  for (const id of asArray(proposalIds)) {
    const clean = compact(id, 160);
    if (!clean || result.includes(clean)) continue;
    if (known.has(clean)) result.push(clean);
  }
  return result.slice(0, 8);
}

function enrichAssignmentProposalWithFallback(proposal = {}, fallback = {}, snapshot = {}) {
  if (!fallback || !Object.keys(fallback).length) return proposal;
  const fallbackCrewIds = asArray(fallback.linkedCrewIds);
  const proposalCrewIds = asArray(proposal.linkedCrewIds);
  return {
    ...fallback,
    ...proposal,
    assignmentScope: proposal.assignmentScope || fallback.assignmentScope || PLAYER_CURRENT_ORDER_SCOPE,
    assignedByActorId: proposal.assignedByActorId || proposal.assignedBy || fallback.assignedByActorId || null,
    assignedActorIds: asArray(proposal.assignedActorIds || proposal.assignees).length
      ? asArray(proposal.assignedActorIds || proposal.assignees)
      : asArray(fallback.assignedActorIds),
    linkedCrewIds: canonicalLinkedCrewIds(proposalCrewIds, fallbackCrewIds, snapshot),
    linkedShipSystemIds: asArray(proposal.linkedShipSystemIds || proposal.linkedSystemIds).length
      ? (proposal.linkedShipSystemIds || proposal.linkedSystemIds)
      : asArray(fallback.linkedShipSystemIds),
    dueWindow: proposal.dueWindow || proposal.deadline || proposal.timeWindow || fallback.dueWindow || null
  };
}

function enrichSettlementWithDeterministicProposals(settlement, {
  snapshot,
  campaignState
} = {}) {
  const deterministic = deterministicAcceptedProposals({ settlement, snapshot, campaignState });
  if (!deterministic.explicitTaskCount) {
    return { settlement, explicitTaskCount: 0 };
  }
  const validShipReadinessCount = settlement.shipReadinessProposals.filter(shipReadinessProposalLooksValid).length;
  const validThreadSignalCount = settlement.threadSignals.filter(threadSignalLooksValid).length;
  const openAssignmentProposals = settlement.openAssignmentProposals.length >= deterministic.explicitTaskCount
    ? settlement.openAssignmentProposals
      .slice(0, MAX_ASSIGNMENT_PROPOSALS)
      .map((proposal, index) => enrichAssignmentProposalWithFallback(
        proposal,
        deterministic.openAssignmentProposals[index],
        snapshot
      ))
    : mergeProposals(settlement.openAssignmentProposals, deterministic.openAssignmentProposals, MAX_ASSIGNMENT_PROPOSALS);
  return {
    settlement: {
      ...settlement,
      openAssignmentProposals,
      commandLogProposals: settlement.commandLogProposals.length
        ? settlement.commandLogProposals
        : deterministic.commandLogProposals.slice(0, MAX_COMMAND_LOG_PROPOSALS),
      shipReadinessProposals: validShipReadinessCount >= deterministic.shipReadinessProposals.length
        ? settlement.shipReadinessProposals
        : mergeProposals(
          settlement.shipReadinessProposals,
          deterministic.shipReadinessProposals,
          MAX_SHIP_READINESS_PROPOSALS
        ),
      threadSignals: validThreadSignalCount >= deterministic.threadSignals.length
        ? settlement.threadSignals
        : mergeProposals(
          settlement.threadSignals,
          deterministic.threadSignals,
          MAX_THREAD_SIGNALS
        )
    },
    explicitTaskCount: deterministic.explicitTaskCount
  };
}

function sourceBundle(context) {
  const snapshot = context.snapshot;
  return {
    settlementId: context.settlementId,
    previousAssistantHostMessageId: snapshot.source.previousAssistant.hostMessageId,
    currentPlayerHostMessageId: snapshot.source.currentPlayer.hostMessageId,
    sourceMessageIds: [
      snapshot.source.previousAssistant.hostMessageId,
      snapshot.source.currentPlayer.hostMessageId
    ].filter(Boolean),
    sourceTextHashes: {
      previousAssistant: snapshot.source.previousAssistant.textHash,
      currentPlayer: snapshot.source.currentPlayer.textHash,
      range: snapshot.source.sourceRangeHash
    },
    sourceAnchorRange: {
      kind: 'sceneHandshakePair',
      previousAssistantHostMessageId: snapshot.source.previousAssistant.hostMessageId,
      currentPlayerHostMessageId: snapshot.source.currentPlayer.hostMessageId,
      rangeHash: snapshot.source.sourceRangeHash
    },
    createdAt: context.recordedAt
  };
}

function assignmentFingerprint(input = {}) {
  return sceneHandshakeHash([
    input.title,
    input.summary,
    input.dueWindow,
    ...(input.linkedCrewIds || []),
    ...(input.linkedShipSystemIds || [])
  ].join('\n'));
}

function proposalTargetIds(raw = {}) {
  const values = [];
  for (const key of ['assignedActorIds', 'assignedToActorIds', 'assignedToIds', 'assignees', 'assignedTo']) {
    const value = raw[key];
    if (Array.isArray(value)) values.push(...value);
    else if (value !== undefined && value !== null) values.push(value);
  }
  return uniqueStrings([
    ...values
  ]);
}

function assignmentProposalTargetsPlayer(raw = {}, context = {}) {
  const snapshot = context.snapshot || {};
  if (sourceLooksLikePlayerIssuedOrders(snapshot)) return false;
  const scope = compact(raw.assignmentScope || raw.scope || '', 120);
  if (actorValueMatchesPlayer(raw.assignedByActorId || raw.assignedBy || '', snapshot)) return false;
  if (/\b(delegated|crew|subordinate|department)\b/i.test(scope)) return false;
  if (scope === PLAYER_CURRENT_ORDER_SCOPE) return true;
  const targets = proposalTargetIds(raw);
  if (targets.length) {
    return targets.some((target) => actorValueMatchesPlayer(target, snapshot));
  }
  return sourceHasPlayerAssignmentAuthority(snapshot);
}

function conciseAssignmentSummary(raw = {}, title = '') {
  const source = cleanTaskSegment(raw.playerSafeSummary || raw.summary || raw.detail || raw.description || title);
  if (!source) return title;
  if (source.length <= MAX_ASSIGNMENT_SUMMARY_LENGTH) return source;
  const cueSentence = splitTaskSentences(source).find(playerOrderCue);
  return compact(cueSentence || splitTaskSentences(source)[0] || source, MAX_ASSIGNMENT_SUMMARY_LENGTH);
}

function normalizeAssignmentProposal(raw = {}, context) {
  const title = compact(raw.title || raw.label || raw.summary, 180);
  const summary = conciseAssignmentSummary(raw, title);
  if (!title || !summary) return null;
  if (proposalLooksLikeMenuOfframp(title, summary)) return null;
  if (!assignmentProposalTargetsPlayer(raw, context)) return null;
  const assignedActorIds = proposalTargetIds(raw).length
    ? proposalTargetIds(raw)
    : [context.snapshot?.referenceResolver?.player?.id || 'player-commander'];
  const fingerprint = assignmentFingerprint({
    title,
    summary,
    dueWindow: raw.dueWindow || raw.deadline,
    linkedCrewIds: raw.linkedCrewIds,
    linkedShipSystemIds: raw.linkedShipSystemIds
  });
  const source = sourceBundle(context);
  return {
    id: raw.id || `open-assignment:${slug(title)}:${fingerprint.slice(0, 8)}`,
    title,
    summary,
    assignmentScope: PLAYER_CURRENT_ORDER_SCOPE,
    status: compact(raw.status || 'open', 80) || 'open',
    priority: compact(raw.priority || 'current', 80) || 'current',
    assignedByActorId: compact(raw.assignedByActorId || raw.assignedBy || '', 160) || null,
    assignedActorIds: assignedActorIds.map((item) => compact(item, 160)).filter(Boolean).slice(0, 8),
    dueWindow: compact(raw.dueWindow || raw.deadline || raw.timeWindow || '', 160) || null,
    linkedCrewIds: asArray(raw.linkedCrewIds).map((item) => compact(item, 160)).filter(Boolean).slice(0, 8),
    linkedShipSystemIds: asArray(raw.linkedShipSystemIds || raw.linkedSystemIds).map((item) => compact(item, 160)).filter(Boolean).slice(0, 8),
    linkedThreadIds: asArray(raw.linkedThreadIds).map((item) => compact(item, 160)).filter(Boolean).slice(0, 8),
    linkedQuestIds: asArray(raw.linkedQuestIds).map((item) => compact(item, 160)).filter(Boolean).slice(0, 8),
    sourceMessageIds: source.sourceMessageIds,
    sourceTextHashes: source.sourceTextHashes,
    sourceAnchorRange: source.sourceAnchorRange,
    sourceSettlementId: source.settlementId,
    fingerprint,
    lastUpdatedAt: source.createdAt
  };
}

function normalizeCommandLogProposal(raw = {}, context, assignments = []) {
  const summaryInputs = cleanList(raw.summaryInputs || raw.summaries || [raw.summary || raw.title], 6);
  const visibleConsequences = cleanList(raw.visibleConsequences || raw.consequences || [], 6);
  if (!assignments.length && [...summaryInputs, ...visibleConsequences].some(menuOfframpText)) return null;
  if (!summaryInputs.length && !visibleConsequences.length && !assignments.length) return null;
  const source = sourceBundle(context);
  return {
    id: raw.id || `command-log:${context.settlementId}`,
    type: compact(raw.type || 'sceneHandshake', 80) || 'sceneHandshake',
    stardate: context.snapshot.timeAndLocation.currentStardate ?? null,
    sourceSettlementId: source.settlementId,
    sourceMessageIds: source.sourceMessageIds,
    sourceTextHashes: source.sourceTextHashes,
    sourceAnchorRange: source.sourceAnchorRange,
    summaryInputs: summaryInputs.length ? summaryInputs : assignments.map((item) => item.summary).slice(0, 4),
    visibleConsequences,
    linkedAssignmentIds: assignments.map((item) => item.id),
    linkedAssignmentTitles: assignments.map((item) => item.title),
    createdAt: source.createdAt
  };
}

function normalizeShipReadinessProposal(raw = {}, context) {
  const kind = compact(raw.kind || raw.type || 'technicalDebt', 80);
  if (!LOW_RISK_SHIP_KINDS.has(kind)) return null;
  const label = compact(raw.label || raw.title || raw.summary, 180);
  const detail = compact(raw.detail || raw.summary || raw.description || label, 500);
  if (!label || !detail) return null;
  const source = sourceBundle(context);
  const fingerprint = sceneHandshakeHash(`${kind}\n${label}\n${detail}\n${raw.owner || ''}`);
  return {
    id: raw.id || `technical-debt:${slug(label)}:${fingerprint.slice(0, 8)}`,
    kind: 'technicalDebt',
    label,
    title: label,
    detail,
    summary: detail,
    status: compact(raw.status || 'under-review', 80) || 'under-review',
    severity: compact(raw.severity || 'watch', 80) || 'watch',
    owner: compact(raw.owner || raw.ownerName || '', 180) || null,
    linkedAssignmentTitle: compact(raw.linkedAssignmentTitle || '', 180) || null,
    sourceSettlementId: source.settlementId,
    sourceMessageIds: source.sourceMessageIds,
    sourceTextHashes: source.sourceTextHashes,
    sourceAnchorRange: source.sourceAnchorRange,
    fingerprint,
    lastUpdatedAt: source.createdAt,
    playerVisible: true
  };
}

function threadType(value = '') {
  const normalized = compact(value, 100).replace(/-/g, '_');
  return THREAD_TYPES.includes(normalized) ? normalized : 'professional_dilemma';
}

function normalizeThreadSignal(raw = {}, context) {
  const title = compact(raw.title || raw.label || raw.summary, 180);
  const summary = compact(raw.summary || raw.observableSeed || raw.detail || title, 500);
  if (!title || !summary) return null;
  if (proposalLooksLikeMenuOfframp(title, summary)) return null;
  const source = sourceBundle(context);
  const participantIds = asArray(raw.participantIds || raw.participants || raw.linkedCrewIds)
    .map((item) => compact(item, 160))
    .filter(Boolean)
    .slice(0, 8);
  const recordInput = {
    id: raw.id || `thread:${slug(title)}:${sceneHandshakeHash(`${title}\n${summary}\n${participantIds.join('|')}`).slice(0, 8)}`,
    status: raw.directCommitment === true ? 'active' : (raw.status || 'engaged'),
    shape: raw.shape || 'side_assignment',
    type: threadType(raw.type || raw.kind),
    episodeFunction: 'setup',
    source: {
      id: source.settlementId,
      type: 'sceneHandshake',
      messageIds: source.sourceMessageIds,
      textHash: source.sourceTextHashes.range,
      rangeHash: source.sourceTextHashes.range,
      anchorRange: source.sourceAnchorRange
    },
    participantIds,
    linkedCrewIds: participantIds,
    title,
    playerSummary: compact(raw.playerSummary || summary, 320),
    summary,
    observableSeed: summary,
    storyQuestion: compact(raw.storyQuestion || 'Will this accepted obligation or concern receive attention, and what will that attention change?', 260),
    naturalTrigger: compact(raw.naturalTrigger || 'When the player follows up on the accepted assignment or concern.', 260),
    tags: asArray(raw.tags || ['scene-handshake']).map((item) => compact(item, 80)).filter(Boolean).slice(0, 8),
    supportingEvidence: [{
      id: `evidence:${source.settlementId}:${slug(title, 'thread')}`,
      type: threadType(raw.type || raw.kind),
      source: {
        id: source.settlementId,
        type: 'sceneHandshake',
        messageIds: source.sourceMessageIds,
        textHash: source.sourceTextHashes.range,
        rangeHash: source.sourceTextHashes.range,
        anchorRange: source.sourceAnchorRange
      },
      excerpt: compact(raw.excerpt || summary, 500),
      summary,
      visibility: 'player_safe',
      observable: true,
      actorIds: participantIds,
      sourceMessageIds: source.sourceMessageIds,
      anchorRange: source.sourceAnchorRange,
      tags: ['scene-handshake'],
      recordedAt: source.createdAt
    }],
    reinforcementCount: 1,
    playerInterest: raw.playerInterest ?? 1,
    salience: Math.max(0.4, Math.min(1, Number(raw.confidence || context.settlement.confidence || 0.65))),
    firstObservedAt: source.createdAt,
    lastReinforcedAt: source.createdAt,
    semanticFingerprint: raw.semanticFingerprint || threadSemanticFingerprint({ type: threadType(raw.type || raw.kind), title, summary, participantIds }),
    metadata: {
      sourceSettlementId: source.settlementId,
      topicKey: raw.topicKey || null,
      semanticKey: raw.semanticKey || null,
      stale: false
    }
  };
  try {
    return normalizeThreadRecord(recordInput);
  } catch {
    return null;
  }
}

function existingFingerprintSet(values = []) {
  return new Set(asArray(values).map((item) => item?.fingerprint || sceneHandshakeHash(`${item?.title || item?.label || ''}\n${item?.summary || item?.detail || ''}`)));
}

function uniqueStrings(values = []) {
  return [...new Set(asArray(values).map((item) => compact(item, 180)).filter(Boolean))];
}

function matchingShipReadinessRecord(record = {}, campaignState = {}) {
  const records = asArray(campaignState?.ship?.technicalDebt);
  const id = compact(record.id || '');
  if (id) {
    const byId = records.find((entry) => compact(entry?.id || '') === id);
    if (byId) return byId;
  }
  const text = `${record.label || ''} ${record.title || ''} ${record.detail || ''} ${record.summary || ''}`;
  const wantsCommandNetwork = /\bcommand-network\b|\bhandoff\b/i.test(text);
  const wantsSensor = /\bsensor\b|\bcalibration\b/i.test(text);
  const wantsMedicalPower = /\bmedical\b|\bsurgical bay\b|\bpower feeds?\b/i.test(text);
  return records.find((entry) => {
    const existing = `${entry?.id || ''} ${entry?.label || ''} ${entry?.title || ''} ${entry?.playerSafeSummary || ''} ${entry?.summary || ''} ${entry?.detail || ''}`;
    if (wantsCommandNetwork && /\bcommand-network\b|\bcertificate\b|\bhandoff\b/i.test(existing)) return true;
    if (wantsSensor && /\bsensor\b|\bcalibration\b/i.test(existing)) return true;
    if (wantsMedicalPower && /\bmedical\b|\bsurgical bay\b|\bpower feeds?\b/i.test(existing)) return true;
    return false;
  }) || null;
}

function reinforceExistingShipReadinessRecord(record = null, campaignState = {}) {
  if (!record) return null;
  const existing = matchingShipReadinessRecord(record, campaignState);
  if (!existing) return record;
  const sourceSettlementIds = uniqueStrings([
    existing.sourceSettlementId,
    ...(existing.sourceSettlementIds || []),
    record.sourceSettlementId
  ]);
  const sourceMessageIds = uniqueStrings([
    ...(existing.sourceMessageIds || []),
    ...(record.sourceMessageIds || [])
  ]);
  return {
    ...record,
    id: existing.id || record.id,
    label: existing.label || record.label,
    title: existing.title || existing.label || record.title,
    playerSafeSummary: existing.playerSafeSummary || record.summary || record.detail,
    status: existing.status || record.status,
    department: existing.department || record.department || null,
    sourceSettlementIds,
    sourceMessageIds,
    sourceSettlementId: record.sourceSettlementId,
    sourceReinforcedAt: record.lastUpdatedAt,
    handshakeReinforced: true
  };
}

function threadTitleKey(record = {}) {
  return slug(record.title || record.playerSummary || record.observableSeed || record.summary || '', 'thread');
}

function threadParticipantIds(record = {}) {
  return uniqueStrings([
    ...(record.participantIds || []),
    ...(record.participants || []),
    ...(record.linkedCrewIds || [])
  ]).sort();
}

function setsOverlap(left = [], right = []) {
  if (!left.length && !right.length) return true;
  const rightSet = new Set(right);
  return left.some((item) => rightSet.has(item));
}

function matchingThreadRecord(record = {}, campaignState = {}) {
  const records = asArray(campaignState?.threadLedger?.records);
  const id = compact(record.id || '', 180);
  if (id) {
    const byId = records.find((entry) => compact(entry?.id || '', 180) === id);
    if (byId) return byId;
  }

  const titleKey = threadTitleKey(record);
  const participants = threadParticipantIds(record);
  const semanticKey = compact(record.metadata?.semanticKey || record.metadata?.topicKey || '', 180);
  const fingerprint = compact(record.semanticFingerprint || '', 500);
  return records.find((entry) => {
    const status = compact(entry?.status || '', 80).toLowerCase();
    if (entry?.metadata?.stale === true || CLOSED_THREAD_STATUSES.has(status)) return false;
    const entrySemanticKey = compact(entry?.metadata?.semanticKey || entry?.metadata?.topicKey || '', 180);
    if (semanticKey && entrySemanticKey && semanticKey === entrySemanticKey) return true;
    if (fingerprint && entry?.semanticFingerprint === fingerprint) return true;
    if (threadTitleKey(entry) !== titleKey) return false;
    return setsOverlap(participants, threadParticipantIds(entry));
  }) || null;
}

function reinforceExistingThreadRecord(record = null, campaignState = {}) {
  if (!record) return null;
  const existing = matchingThreadRecord(record, campaignState);
  if (!existing) return record;

  const existingEvidence = asArray(existing.supportingEvidence || existing.evidence);
  const incomingEvidence = asArray(record.supportingEvidence || record.evidence);
  const evidenceById = new Map(existingEvidence.map((item) => [item.id, item]));
  for (const item of incomingEvidence) {
    if (item?.id) evidenceById.set(item.id, item);
  }
  const newEvidenceCount = [...evidenceById.keys()]
    .filter((id) => !existingEvidence.some((item) => item.id === id))
    .length;
  const participantIds = uniqueStrings([
    ...threadParticipantIds(existing),
    ...threadParticipantIds(record)
  ]);
  const sourceSettlementIds = uniqueStrings([
    existing.metadata?.sourceSettlementId,
    ...(existing.metadata?.sourceSettlementIds || []),
    record.metadata?.sourceSettlementId,
    ...(record.metadata?.sourceSettlementIds || [])
  ]);
  const lastReinforcedAt = record.lastReinforcedAt || timestamp();
  return normalizeThreadRecord({
    ...existing,
    id: existing.id || record.id,
    status: OPEN_THREAD_STATUSES.has(compact(existing.status || '', 80).toLowerCase())
      ? existing.status
      : (record.status || existing.status),
    participantIds,
    participants: participantIds,
    linkedCrewIds: participantIds,
    supportingEvidence: [...evidenceById.values()],
    evidence: [...evidenceById.values()],
    reinforcementCount: Math.max(
      Number(existing.reinforcementCount || 0) + newEvidenceCount,
      [...evidenceById.values()].length,
      Number(record.reinforcementCount || 0)
    ),
    playerInterest: Math.max(Number(existing.playerInterest || 0), Number(record.playerInterest || 0)),
    salience: Math.max(Number(existing.salience || 0), Number(record.salience || 0)),
    firstObservedAt: existing.firstObservedAt || record.firstObservedAt || null,
    lastReinforcedAt,
    metadata: {
      ...(existing.metadata || {}),
      sourceSettlementIds,
      latestSourceSettlementId: record.metadata?.sourceSettlementId || null,
      lastReinforcedBy: 'sceneHandshake',
      handshakeReinforced: true,
      stale: false
    },
    history: [
      ...asArray(existing.history),
      {
        at: lastReinforcedAt,
        type: 'scene-handshake-reinforcement',
        sourceSettlementId: record.metadata?.sourceSettlementId || null,
        sourceThreadId: record.id || null
      }
    ]
  });
}

function validateRetiredSceneHandshakeSettlement(rawSettlement, {
  campaignState,
  snapshot,
  settlementId,
  recordedAt = null
} = {}) {
  const normalizedSettlement = normalizeSettlement(rawSettlement);
  const reasons = [];
  if (normalizedSettlement.kind !== KIND) reasons.push('kind-mismatch');
  if (!normalizedSettlement.acceptedPreviousResponse) {
    return {
      ok: true,
      settlement: normalizedSettlement,
      disposition: normalizedSettlement.playerReplyRelation === 'corrects' ? 'internalReview' : 'defer',
      reasons: reasons.length ? reasons : [normalizedSettlement.playerReplyRelation || 'not-accepted'],
      operations: [],
      committedRoots: [],
      promptDirty: false
    };
  }
  const {
    settlement,
    explicitTaskCount
  } = enrichSettlementWithDeterministicProposals(normalizedSettlement, {
    snapshot,
    campaignState
  });
  if (!ACCEPTED_RELATIONS.has(settlement.playerReplyRelation)) reasons.push('relation-not-accepted');
  if (settlement.confidence < 0.62) reasons.push('confidence-below-threshold');
  if (settlement.disposition !== 'autoCommit') reasons.push(`disposition:${settlement.disposition}`);
  if (settlement.needsInternalReview) reasons.push('needs-internal-review');
  if (explicitTaskCount > 0 && !settlement.openAssignmentProposals.length) {
    reasons.push('explicit-accepted-source-produced-no-assignments');
  }

  const context = {
    settlement,
    snapshot,
    settlementId,
    recordedAt: recordedAt || timestamp()
  };
  const existingAssignments = existingFingerprintSet(campaignState?.mission?.openAssignments || []);
  const assignments = settlement.openAssignmentProposals
    .map((proposal) => normalizeAssignmentProposal(proposal, context))
    .filter((record) => record && !existingAssignments.has(record.fingerprint));
  const commandLogs = settlement.commandLogProposals
    .map((proposal) => normalizeCommandLogProposal(proposal, context, assignments))
    .filter(Boolean);
  const shipReadiness = settlement.shipReadinessProposals
    .map((proposal) => normalizeShipReadinessProposal(proposal, context))
    .map((record) => reinforceExistingShipReadinessRecord(record, campaignState))
    .filter(Boolean);
  const threads = settlement.threadSignals
    .map((proposal) => normalizeThreadSignal(proposal, context))
    .map((record) => reinforceExistingThreadRecord(record, campaignState))
    .filter(Boolean);

  if (reasons.length) {
    return {
      ok: true,
      settlement,
      disposition: settlement.disposition === 'operatorRecovery' ? 'operatorRecovery' : 'internalReview',
      reasons,
      operations: [],
      committedRoots: [],
      promptDirty: false
    };
  }

  const operations = [];
  if (assignments.length) {
    for (const assignment of assignments) {
      operations.push({ op: 'upsert', path: 'mission.openAssignments', identityKey: 'id', value: assignment });
    }
  }
  if (commandLogs.length) {
    for (const entry of commandLogs) {
      operations.push({ op: 'upsert', path: 'commandLog.entries', identityKey: 'id', value: entry });
    }
  }
  if (shipReadiness.length) {
    for (const note of shipReadiness) {
      operations.push({ op: 'upsert', path: 'ship.technicalDebt', identityKey: 'id', value: note });
    }
  }
  if (threads.length) {
    for (const thread of threads) {
      operations.push({ op: 'upsert', path: 'threadLedger.records', identityKey: 'id', value: thread });
    }
  }

  return {
    ok: true,
    settlement,
    disposition: 'autoCommit',
    reasons: [],
    operations,
    committedRoots: [...new Set(operations.map((operation) => operation.path.split('.')[0]))],
    promptDirty: operations.some((operation) => !['runtimeTracking', 'sceneHandshake'].includes(operation.path.split('.')[0]))
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

function sceneHandshakeLedgerRecord({
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

export function createLatestPairSreSettlementProvider({
  generationRouter = null,
  now = null
} = {}) {
  return createLatestPairSourceSettlementProviderRuntime({
    generationRouter,
    now,
    validateLatestPairSettlement
  });
}

function ledgerPathFor(disposition, status) {
  if (status === 'settled') return 'sceneHandshake.settled';
  if (disposition === 'operatorRecovery') return 'sceneHandshake.operatorRecovery';
  if (disposition === 'internalReview') return 'sceneHandshake.pendingInternalReview';
  if (status === 'rejected') return 'sceneHandshake.rejected';
  return 'sceneHandshake.deferred';
}

function sceneHandshakeResultOperations(record) {
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

function idempotencyKeyFor(snapshot) {
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

async function runTerminalLatestPairSourceSettlement({
  campaignState,
  snapshot,
  idempotencyKey,
  settlementId,
  stateDeltaGateway,
  runLatestPairSettlementProvider,
  validateLatestPairSettlementBeforeApply = null,
  latestPairSourceFrame = null,
  packageData = null,
  generationRouter = null,
  coreStore = null,
  ingressId = null,
  now = null
} = {}) {
  return settleLatestPairSceneHandshakeSource({
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
    createSceneHandshakeLedgerRecord: sceneHandshakeLedgerRecord,
    sceneHandshakeResultOperations,
    commitAcceptedSceneTimeAdvance
  });
}

async function recordOnly({
  stateDeltaGateway,
  campaignState,
  snapshot,
  record,
  now = null
}) {
  if (!stateDeltaGateway?.applyOperations) return { campaignState, applied: null };
  const result = await stateDeltaGateway.applyOperations({
    id: `${record.id}:record`,
    source: 'sceneHandshake',
    reason: 'Recorded Scene Handshake settlement result.',
    summary: 'Recorded Scene Handshake settlement result.',
    baseRevision: activeRuntimeRevisionState(campaignState).runtime,
    operations: sceneHandshakeResultOperations(record),
    domains: ['runtimeTracking'],
    metadata: {
      settlementId: record.id,
      idempotencyKey: record.idempotencyKey,
      sourceAnchorRange: snapshot.source.sourceRangeHash,
      selectedAssistantVariant: selectedAssistantVariantLedgerRecord(snapshot.source.previousAssistant.selectedVariant),
      recordedAt: timestamp(now)
    }
  }, { allowedRoots: ['sceneHandshake'] });
  return { campaignState: result.campaignState, applied: result };
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
  const existingBoundary = findTimeBoundaryForPlayerMessage(campaignState, currentPlayerHostMessageId);
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

export async function runSceneHandshakeSettlement({
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

  const snapshot = buildSceneHandshakeSnapshot({
    campaignState,
    previousAssistantMessage: resolved.message,
    currentPlayerMessage,
    chatId,
    ingressId,
    recentMessages
  });
  const idempotencyKey = idempotencyKeyFor(snapshot);
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
  const recordedAt = timestamp(now);
  const terminalSourceSettlement = await runTerminalLatestPairSourceSettlement({
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
    now
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

export async function runLatestPairSourceSettlement(options = {}) {
  return runSceneHandshakeSettlement(options);
}

export const __sceneHandshakeSettlerTestHooks = Object.freeze({
  ROLE_ID: SOURCE_SETTLEMENT_LATEST_PAIR_ROLE_ID,
  KIND,
  createPrompt,
  idempotencyKeyFor,
  normalizeAssignmentProposal,
  normalizeCommandLogProposal,
  normalizeShipReadinessProposal,
  normalizeThreadSignal,
  sceneHandshakeLedgerRecord
});
