import { parseDutyReportManifestEnvelope } from '../mission/v1/duty-report-delivery.mjs';
import { extractShipTimeFooter } from '../time/ship-time.mjs';

const LEGACY_CAMPAIGN_REPLY_HEADER = /^\s*\*?Stardate\s+\d{4,6}(?:\.\d+)?\s*\|\s*\d{4}\s+hours\*?(?:\s*(?:\r?\n)+|\s*$)/i;

function stripLegacyCampaignReplyHeader(text = '') {
  return String(text ?? '').replace(LEGACY_CAMPAIGN_REPLY_HEADER, '').trimStart();
}

const MAX_ASSISTANT_CHARS = 7000;
const MAX_PLAYER_CHARS = 2500;

function compact(value, maximum = 300) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length <= maximum ? text : text.slice(0, maximum);
}

function sourceText(message = {}, maximum = MAX_ASSISTANT_CHARS) {
  return stripLegacyCampaignReplyHeader(message?.text || message?.mes || message?.content || '')
    .trim()
    .slice(0, maximum);
}

function assistantSource(message = {}) {
  const fullText = sourceText(message);
  const extracted = extractShipTimeFooter(fullText);
  return {
    fullText,
    text: extracted.narrativeText.slice(0, MAX_ASSISTANT_CHARS),
    timeFooter: extracted.footer
  };
}

function stableHash(value = '') {
  let hash = 0x811c9dc5;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function messageId(message = {}) {
  return compact(message?.hostMessageId || message?.id || String(message?.index ?? ''), 180) || null;
}

function isUser(message = {}) {
  return message?.isUser === true || message?.is_user === true || message?.role === 'user';
}

function isSystem(message = {}) {
  return message?.isSystem === true || message?.is_system === true || message?.role === 'system';
}

function directiveMetadata(message = {}) {
  return message?.metadata
    || message?.raw?.extra?.directive
    || message?.raw?.metadata?.directive
    || {};
}

function selectedSwipeIndex(message = {}) {
  const raw = message?.raw || message;
  const metadata = directiveMetadata(message);
  const candidate = raw?.swipe_id ?? raw?.swipeId ?? raw?.swipeIndex
    ?? metadata?.selectedSwipeIndex ?? metadata?.swipeId;
  const index = Number(candidate);
  return Number.isInteger(index) && index >= 0 ? index : null;
}

function selectedSwipeRuntimeMetadata(message = {}, index = null, swipeCount = 0) {
  const raw = message?.raw || message;
  if (Number.isInteger(index)) {
    const selected = raw?.swipe_info?.[index]?.extra?.runtimeMetadata;
    if (selected && typeof selected === 'object' && !Array.isArray(selected)) return selected;
  }
  if (swipeCount <= 1 && (index === null || index === 0)) {
    const root = raw?.extra?.runtimeMetadata || message?.extra?.runtimeMetadata;
    if (root && typeof root === 'object' && !Array.isArray(root)) return root;
  }
  return null;
}

function selectedAssistantVariant(message = {}) {
  const raw = message?.raw || message;
  const swipes = Array.isArray(raw?.swipes) ? raw.swipes.map(String) : [];
  const index = selectedSwipeIndex(message);
  if (swipes.length > 0 && (!Number.isInteger(index) || index >= swipes.length)) {
    return { ok: false, reason: 'previous-assistant-selected-swipe-invalid' };
  }
  const visible = assistantSource(message);
  const selected = assistantSource({ text: swipes.length > 0 ? swipes[index] : visible.fullText });
  const visibleText = visible.text;
  const selectedText = selected.text;
  if (!selectedText) return { ok: false, reason: 'previous-assistant-empty' };
  const selectedTextHash = stableHash(selectedText);
  const visibleTextHash = stableHash(visibleText);
  const selectedResponseHash = stableHash(selected.fullText);
  const visibleResponseHash = stableHash(visible.fullText);
  if (visible.fullText && selectedResponseHash !== visibleResponseHash) {
    return { ok: false, reason: 'previous-assistant-selected-swipe-mismatch' };
  }
  const metadata = directiveMetadata(message);
  const report = parseDutyReportManifestEnvelope(
    selectedSwipeRuntimeMetadata(message, index, swipes.length)?.dutyReportManifest
  );
  const directiveOwned = Boolean(
    message?.isDirectiveOwned === true
    || message?.directiveOwned === true
    || metadata?.idempotencyKey
    || message?.raw?.extra?.directive
    || message?.raw?.metadata?.directive
  );
  return {
    ok: true,
    value: {
      kind: 'directive.selectedAssistantVariant.v1',
      hostMessageId: messageId(message),
      selectedVariantId: Number.isInteger(index) ? String(index) : null,
      selectedSwipeIndex: Number.isInteger(index) ? index : null,
      swipeCount: swipes.length,
      selectedTextHash,
      visibleTextHash,
      selectedResponseHash,
      visibleResponseHash,
      sourceIntegrity: 'clean',
      directiveOwned,
      responseId: compact(metadata?.responseId || metadata?.sourceResponseId || metadata?.idempotencyKey, 180) || null,
      outcomeId: compact(metadata?.outcomeId, 180) || null,
      responseKind: compact(metadata?.responseKind, 80) || null,
      dutyReportManifest: report.ok ? report.value : null,
      dutyReportCustodyOwned: report.ok === true,
      timeFooter: selected.timeFooter,
      text: selectedText
    }
  };
}

function previousAssistantFromRecent(recentMessages = [], currentPlayerMessage = {}) {
  const messages = Array.isArray(recentMessages) ? recentMessages : [];
  const currentId = messageId(currentPlayerMessage);
  let currentIndex = currentId
    ? messages.findIndex((message) => messageId(message) === currentId)
    : -1;
  if (currentIndex < 0) currentIndex = messages.length;
  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || isSystem(message)) continue;
    if (isUser(message)) return { ok: false, reason: 'previous-message-not-assistant' };
    return { ok: true, message };
  }
  return { ok: false, reason: 'no-previous-assistant' };
}

function promptingPlayerBeforeAssistant(recentMessages = [], assistantMessage = {}) {
  const messages = Array.isArray(recentMessages) ? recentMessages : [];
  const assistantId = messageId(assistantMessage);
  const assistantIndex = assistantId
    ? messages.findIndex((message) => messageId(message) === assistantId)
    : messages.indexOf(assistantMessage);
  if (assistantIndex < 0) return null;
  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || isSystem(message)) continue;
    return isUser(message) ? messageId(message) : null;
  }
  return null;
}

function unsafeAssistantReason(message = {}) {
  const status = compact(message?.status || message?.raw?.status || message?.metadata?.status, 80).toLowerCase();
  if (new Set(['deleted', 'invalidated', 'superseded', 'interrupted', 'streaming', 'control']).has(status)) {
    return `previous-assistant-${status}`;
  }
  if (message?.deletedAt || message?.raw?.deletedAt || message?.raw?.deleted_at) return 'previous-assistant-deleted';
  if (message?.invalidatedAt || message?.raw?.invalidatedAt) return 'previous-assistant-invalidated';
  if (message?.supersededAt || message?.raw?.supersededAt) return 'previous-assistant-superseded';
  if (message?.interrupted === true || message?.raw?.interrupted === true) return 'previous-assistant-interrupted';
  if (message?.streaming === true || message?.raw?.streaming === true || message?.raw?.is_streaming === true) {
    return 'previous-assistant-streaming';
  }
  return null;
}

export function prepareV1AcceptedPairSnapshot({
  campaignState,
  currentPlayerMessage,
  previousAssistantMessage = null,
  recentMessages = [],
  chatId = null,
  ingressId = null
} = {}) {
  if (!campaignState || !sourceText(currentPlayerMessage, MAX_PLAYER_CHARS)) {
    return { ok: false, reason: 'missing-state-or-player-message', snapshot: null };
  }
  const boundChatId = compact(campaignState?.campaignChatBinding?.chatId);
  const observedChatId = compact(chatId || currentPlayerMessage?.chatId);
  if (boundChatId && observedChatId && boundChatId !== observedChatId) {
    return { ok: false, reason: 'wrong-chat', snapshot: null, boundChatId, chatId: observedChatId };
  }
  const boundSaveId = compact(campaignState?.campaignChatBinding?.saveId);
  const observedSaveId = compact(currentPlayerMessage?.saveId);
  if (boundSaveId && observedSaveId && boundSaveId !== observedSaveId) {
    return { ok: false, reason: 'wrong-save', snapshot: null, boundSaveId, saveId: observedSaveId };
  }
  const resolved = previousAssistantMessage
    ? { ok: true, message: previousAssistantMessage }
    : previousAssistantFromRecent(recentMessages, currentPlayerMessage);
  if (!resolved.ok) return { ok: false, reason: resolved.reason, snapshot: null };
  const unsafeReason = unsafeAssistantReason(resolved.message);
  if (unsafeReason) return { ok: false, reason: unsafeReason, snapshot: null };
  const selected = selectedAssistantVariant(resolved.message);
  if (!selected.ok) return { ok: false, reason: selected.reason, snapshot: null };

  const previousText = selected.value.text;
  const playerText = sourceText(currentPlayerMessage, MAX_PLAYER_CHARS);
  const previousId = messageId(resolved.message);
  const playerId = messageId(currentPlayerMessage);
  const previousTextHash = stableHash(previousText);
  const previousResponseHash = compact(selected.value.selectedResponseHash) || previousTextHash;
  const playerTextHash = stableHash(playerText);
  const sourceRangeHash = stableHash(`${previousId || ''}:${previousResponseHash}:${playerId || ''}:${playerTextHash}`);
  const promptingPlayerHostMessageId = promptingPlayerBeforeAssistant(recentMessages, resolved.message);
  return {
    ok: true,
    reason: null,
    snapshot: {
      kind: 'directive.acceptedPairSnapshot.v1',
      envelope: {
        campaignId: campaignState?.campaign?.id || null,
        saveId: boundSaveId || null,
        chatId: observedChatId || boundChatId || null,
        packageId: campaignState?.activeCampaignPackage?.packageId || null,
        packageVersion: campaignState?.activeCampaignPackage?.packageVersion || null,
        activeMissionId: campaignState?.mission?.activeMissionId || null,
        ingressId: ingressId || null
      },
      source: {
        previousAssistant: {
          hostMessageId: previousId,
          promptingPlayerHostMessageId,
          selectedVariantId: selected.value.selectedVariantId,
          selectedSwipeIndex: selected.value.selectedSwipeIndex,
          sourceIntegrity: 'clean',
          textHash: previousTextHash,
          text: previousText,
          timeFooter: selected.value.timeFooter ? { ...selected.value.timeFooter } : null,
          selectedVariant: selected.value
        },
        currentPlayer: {
          hostMessageId: playerId,
          sourceIntegrity: 'clean',
          textHash: playerTextHash,
          text: playerText
        },
        sourceRangeHash
      }
    }
  };
}

export const __v1AcceptedPairSourceTestHooks = Object.freeze({
  stableHash,
  selectedAssistantVariant,
  previousAssistantFromRecent,
  promptingPlayerBeforeAssistant
});
