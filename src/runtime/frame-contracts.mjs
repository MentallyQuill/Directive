import {
  createExternalPromptEnvironmentRef,
  createTurnSourceFrameContract,
  createTurnSourceFrameRef,
  hashStableJson,
  normalizeHostMessageVisibility
} from './architecture-redesign-contracts.mjs';

export { createTurnSourceFrameRef };

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compactObject(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function asString(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function asInteger(value, fallback = null) {
  const number = Number(value);
  return Number.isInteger(number) ? number : fallback;
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const out = [];
  for (const value of Array.isArray(values) ? values : [values]) {
    const text = asString(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function textHashFor(value = {}) {
  if (value.textHash) return asString(value.textHash);
  if (value.selectedTextHash) return asString(value.selectedTextHash);
  if (value.messageTextHash) return asString(value.messageTextHash);
  const text = value.text ?? value.mes ?? value.messageText ?? value.rawText;
  return text === undefined ? null : hashStableJson({ text: String(text) });
}

function roleFor(value = {}) {
  if (value.role) return asString(value.role);
  if (value.is_user === true) return 'player';
  if (value.is_system === true) return 'system';
  return 'assistant';
}

function hostMessageIdFor(value = {}) {
  return asString(value.hostMessageId || value.mesid || value.messageId || value.id);
}

function sourceRefFor(value = {}, fallback = {}) {
  if (!value || typeof value !== 'object') return null;
  const ref = compactObject({
    kind: asString(value.kind, fallback.kind || 'directive.frameSourceRef.v1'),
    hostMessageId: hostMessageIdFor(value),
    chatId: asString(value.chatId || fallback.chatId),
    role: roleFor(value),
    ordinal: asInteger(value.ordinal ?? value.index ?? value.mesIndex),
    textHash: textHashFor(value),
    selectedAssistantVariantHash: asString(value.selectedAssistantVariantHash || value.selectedTextHash),
    responseId: asString(value.responseId),
    outcomeId: asString(value.outcomeId),
    turnId: asString(value.turnId),
    sourceFrameId: asString(value.sourceFrameId)
  });
  return ref.hostMessageId || ref.textHash || ref.responseId || ref.outcomeId || ref.turnId || ref.sourceFrameId
    ? ref
    : null;
}

function selectedAssistantRef(value = {}, fallback = {}) {
  const ref = sourceRefFor(value, {
    ...fallback,
    kind: 'directive.selectedAssistantVariantRef.v1'
  });
  if (!ref) return null;
  return compactObject({
    ...ref,
    selectedVariantId: asString(value.selectedVariantId || value.selectedSwipeId || value.variantId),
    selectedSwipeIndex: asInteger(value.selectedSwipeIndex ?? value.swipeIndex),
    swipeCount: asInteger(value.swipeCount),
    sourceIntegrity: asString(value.sourceIntegrity, 'clean'),
    directiveOwned: value.directiveOwned === true || value.isDirectiveOwned === true
  });
}

function normalizeVisibility(input = {}) {
  if (input.visibility && typeof input.visibility === 'object') return cloneJson(input.visibility);
  if (input.hostMessage || input.message) {
    return normalizeHostMessageVisibility(input.hostMessage || input.message, {
      index: input.index,
      chatMetadata: input.chatMetadata,
      visibilityMap: input.visibilityMap
    });
  }
  return undefined;
}

function frameHashPayload(frame = {}) {
  const copy = cloneJson(frame) || {};
  delete copy.id;
  delete copy.sourceHash;
  delete copy.createdAt;
  return copy;
}

export function createSourceToken(frame = {}) {
  const id = asString(frame.id || frame.sourceFrameId);
  if (id) return `turnSourceFrame:${id}`;
  const hash = asString(frame.sourceHash) || hashStableJson(frameHashPayload(frame));
  return `turnSourceFrame:${hash.slice(0, 16)}`;
}

export function createTurnSourceFrame(input = {}) {
  const externalPromptEnvironmentRef = input.externalPromptEnvironmentRef
    || (input.externalPromptEnvironment ? createExternalPromptEnvironmentRef(input.externalPromptEnvironment) : null);
  const visibility = normalizeVisibility(input);
  const base = createTurnSourceFrameContract({
    ...input,
    externalPromptEnvironmentRef,
    visibility
  });
  const frame = compactObject({
    ...base,
    sourceKind: asString(input.sourceKind || input.kindHint, 'playerMessage'),
    branchId: asString(input.branchId),
    hostId: asString(input.hostId),
    sourceIntegrity: asString(input.sourceIntegrity, visibility?.sourceMutation === true ? 'sourceMutation' : 'clean'),
    currentPlayer: sourceRefFor(input.currentPlayer || input.playerMessage || input.hostMessage || input.message, {
      chatId: base.chatId,
      kind: 'directive.currentPlayerSourceRef.v1'
    }),
    previousAssistant: selectedAssistantRef(input.previousAssistant || {}, { chatId: base.chatId }),
    responseRef: sourceRefFor(input.responseRef || input.response || {}, { chatId: base.chatId }),
    outcomeRef: sourceRefFor(input.outcomeRef || input.outcome || {}, { chatId: base.chatId }),
    turnRef: sourceRefFor(input.turnRef || input.turn || {}, { chatId: base.chatId })
  });
  frame.sourceHash = asString(input.sourceHash) || hashStableJson(frameHashPayload(frame));
  frame.id = frame.id || `frame:${frame.sourceHash.slice(0, 16)}`;
  frame.sourceToken = asString(input.sourceToken) || createSourceToken(frame);
  return frame;
}

export function createRangeSourceFrame(messages = [], input = {}) {
  const messageRefs = (Array.isArray(messages) ? messages : [])
    .map((message, index) => sourceRefFor(message, {
      chatId: input.chatId,
      kind: 'directive.rangeMessageRef.v1',
      ordinal: index
    }))
    .filter(Boolean);
  const rangeHash = hashStableJson(messageRefs.map((ref) => [
    ref.chatId || input.chatId || null,
    ref.hostMessageId || null,
    ref.ordinal ?? null,
    ref.role || null,
    ref.textHash || null,
    ref.selectedAssistantVariantHash || null
  ]));
  return compactObject({
    kind: 'directive.rangeSourceFrame.v1',
    schemaVersion: 1,
    id: asString(input.id) || `range:${rangeHash.slice(0, 16)}`,
    mode: asString(input.mode, 'explicitRange'),
    campaignId: asString(input.campaignId),
    saveId: asString(input.saveId),
    chatId: asString(input.chatId || messageRefs.find((ref) => ref.chatId)?.chatId),
    branchId: asString(input.branchId),
    hostId: asString(input.hostId),
    sourceFrameIds: uniqueStrings(input.sourceFrameIds),
    start: messageRefs[0] || null,
    end: messageRefs.at(-1) || null,
    messageCount: messageRefs.length,
    rangeHash,
    messageRefs
  });
}

export function derivePromptFrame(frame = {}) {
  const ref = createTurnSourceFrameRef(frame);
  return compactObject({
    kind: 'directive.promptFrame.v1',
    schemaVersion: 1,
    sourceFrameId: ref?.id || asString(frame.id),
    sourceToken: asString(frame.sourceToken) || createSourceToken(frame),
    sourceHash: asString(frame.sourceHash) || hashStableJson(frameHashPayload(frame)),
    textHash: asString(frame.textHash),
    selectedAssistantVariantHash: asString(frame.selectedAssistantVariantHash),
    sourceIntegrity: asString(frame.sourceIntegrity, 'clean'),
    externalPromptEnvironmentRef: frame.externalPromptEnvironmentRef ? cloneJson(frame.externalPromptEnvironmentRef) : undefined
  });
}

export function assertFrameCleanForSettlement(frame = {}, expected = {}) {
  const reasons = uniqueStrings([
    expected.campaignId && frame.campaignId && expected.campaignId !== frame.campaignId ? 'wrong-campaign' : null,
    expected.saveId && frame.saveId && expected.saveId !== frame.saveId ? 'wrong-save' : null,
    expected.chatId && frame.chatId && expected.chatId !== frame.chatId ? 'wrong-chat' : null,
    expected.selectedAssistantVariantHash
      && frame.selectedAssistantVariantHash
      && expected.selectedAssistantVariantHash !== frame.selectedAssistantVariantHash
      ? 'selected-variant-hash-mismatch'
      : null,
    frame.sourceIntegrity && frame.sourceIntegrity !== 'clean' ? frame.sourceIntegrity : null,
    frame.visibility?.sourceMutation === true ? 'source-mutation-owned-by-repair' : null
  ]);
  if (!reasons.length) {
    return {
      ok: true,
      status: 'clean',
      sourceFrameId: frame.id || null,
      sourceToken: frame.sourceToken || createSourceToken(frame)
    };
  }
  const error = new Error(`Frame is not clean for settlement: ${reasons.join(', ')}`);
  error.code = 'DIRECTIVE_FRAME_SOURCE_NOT_CLEAN';
  error.reasons = reasons;
  error.sourceFrameId = frame.id || null;
  throw error;
}

export const FRAME_CONTRACTS = Object.freeze({
  turn: 'directive.turnSourceFrame.v1',
  range: 'directive.rangeSourceFrame.v1',
  prompt: 'directive.promptFrame.v1',
  sourceTokenPrefix: 'turnSourceFrame:'
});
