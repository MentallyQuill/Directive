import { invalidateOpenWorldCausalityForReconciliation, processWorldBoundary } from '../directors/director-coordinator.mjs';
import { stripCampaignReplyHeader } from '../time/campaign-time-header.mjs';
import { createRuntimeLedgerView } from './runtime-ledger-view.mjs';

export const SCENE_RECONCILIATION_ACTION_IDS = Object.freeze({
  reconcileMessage: 'reconciliation.reconcileMessage',
  setStart: 'reconciliation.setStart',
  setEnd: 'reconciliation.setEnd',
  reconcileFromHere: 'reconciliation.reconcileFromHere',
  recalculateFromHere: 'reconciliation.recalculateFromHere',
  reconcileMarked: 'reconciliation.reconcileMarked',
  clearMarkers: 'reconciliation.clearMarkers',
  openPending: 'reconciliation.openPending',
  applyPending: 'reconciliation.applyPending',
  rejectPending: 'reconciliation.rejectPending',
  acceptRecalculation: 'reconciliation.acceptRecalculation',
  cancelRecalculation: 'reconciliation.cancelRecalculation'
});

export const SCENE_RECONCILIATION_TOOLTIPS = Object.freeze({
  reconcileMessage: 'Scan this message for Directive state changes. Safe updates may apply automatically; consequential changes need review. Does not replay later outcomes.',
  setStart: 'Mark this message as the start of a passage to reconcile.',
  setEnd: 'Mark this message as the end of a passage to reconcile.',
  reconcileFromHere: 'Scan from this message through the latest chat and reconcile Directive state to the changed passage. Does not rerun Mission Director outcomes.',
  recalculateFromHere: "Preview a replay from this point's pre-outcome snapshot. May replace or drop later outcomes, logs, sidecars, and state changes.",
  reconcileMarked: 'Reconcile the marked start and end passage. Missing markers will be reported without changing state.',
  clearMarkers: 'Clear the active reconciliation start and end markers without scanning chat.',
  openPending: 'Review consequential or conflicting reconciliation items that were not applied automatically.'
});

export const SCENE_RECONCILIATION_MESSAGE_ACTIONS = Object.freeze([
  action('reconcileMessage', 'Reconcile This Message', 'fa-solid fa-magnifying-glass'),
  action('setStart', 'Set Reconciliation Start', 'fa-solid fa-play'),
  action('setEnd', 'Set Reconciliation End', 'fa-solid fa-stop'),
  action('reconcileFromHere', 'Reconcile From Here', 'fa-solid fa-arrows-rotate'),
  action('recalculateFromHere', 'Recalculate From Here', 'fa-solid fa-code-branch')
]);

const LIMITS = Object.freeze({ runs: 80, pending: 80, applied: 160, rejected: 120, previews: 20, cache: 200, messages: 500 });
const AUTO_ROOTS = Object.freeze(['commandLog']);
const ALLOWED_ROOTS = Object.freeze([
  'commandLog', 'ship', 'mission', 'worldState', 'knowledgeLedger', 'questLedger',
  'dynamicQuestCatalog', 'threadLedger', 'relationships', 'crew', 'campaignTracks',
  'campaignAssets', 'eventLedger', 'attentionState', 'storyArcLedger'
]);
const ALLOWED_OPS = new Set(['set', 'merge', 'append', 'remove', 'increment', 'upsert', 'supersede', 'noop']);
const ALLOWED_PATH_PREFIXES = Object.freeze([
  'commandLog.entries', 'ship.condition', 'ship.systems', 'mission.phase', 'mission.activePhaseId',
  'worldState.currentLocationId', 'worldState.locations', 'knowledgeLedger.facts', 'knowledgeLedger.rumors',
  'questLedger.instances', 'questLedger.foregroundQuestId', 'dynamicQuestCatalog.templates',
  'threadLedger.records', 'relationships', 'crew', 'campaignTracks', 'campaignAssets',
  'attentionState', 'storyArcLedger'
]);

function action(id, label, icon) {
  return Object.freeze({ id, runtimeActionId: SCENE_RECONCILIATION_ACTION_IDS[id], label, tooltip: SCENE_RECONCILIATION_TOOLTIPS[id], icon });
}
function cloneJson(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function compact(value) { return String(value ?? '').trim().replace(/\s+/g, ' '); }
function bounded(values, limit) { return asArray(values).slice(Math.max(0, asArray(values).length - Math.max(1, limit))); }
function timestamp(now) { return typeof now === 'function' ? now() : (now || new Date().toISOString()); }
function unique(values) { return [...new Set(asArray(values).filter(Boolean))]; }
function rootOf(path) { return compact(path).split('.')[0] || null; }
function sceneReconciliationLedgerAuthority(state = {}, next = {}, { summary = null, baseRevision = 0 } = {}) {
  const run = asArray(next?.runs).at(-1) || {};
  return {
    authority: 'sreSceneReconciliationProjection',
    projectionSource: 'sceneReconciliation',
    compatibilityMirror: {
      kind: 'directive.sceneReconciliationLedgerProjectionRef.v1',
      campaignId: compact(state?.campaign?.id) || null,
      saveId: compact(state?.save?.id || state?.campaignChatBinding?.saveId || state?.saveId) || null,
      chatId: compact(state?.campaignChatBinding?.chatId || state?.chatId) || null,
      runId: compact(run?.id || next?.lastRunId) || null,
      status: compact(next?.lastResult?.status || run?.status) || null,
      action: compact(next?.lastResult?.action || run?.actionId || run?.action) || null,
      summaryHash: summary ? stableTextHash(summary) : null,
      baseRevision: Math.max(0, Number(baseRevision) || 0)
    }
  };
}
function compactCoreCheckpointRef(ref = null) {
  if (!isObject(ref)) return null;
  const checkpointId = compact(ref.checkpointId || ref.id);
  if (!checkpointId) return null;
  return {
    kind: compact(ref.kind) || 'directive.coreMechanicsCheckpointRef.v1',
    campaignId: compact(ref.campaignId) || null,
    saveId: compact(ref.saveId) || null,
    checkpointId,
    layout: compact(ref.layout) || 'core',
    sourceKind: compact(ref.sourceKind) || null,
    sourceRevision: Number.isFinite(Number(ref.sourceRevision)) ? Number(ref.sourceRevision) : null,
    logicalKey: compact(ref.logicalKey) || null,
    hash: compact(ref.hash) || null
  };
}

function coreCheckpointRefFromLedgerEntry(entry = null) {
  return compactCoreCheckpointRef(entry?.coreCheckpointRef || entry?.checkpointRef || entry?.v2CheckpointRef || null);
}

function snapshotFromLoadedCoreCheckpoint(loaded = null) {
  if (!isObject(loaded)) return null;
  return loaded.campaignState
    || loaded.snapshot
    || loaded.state
    || loaded.checkpoint?.campaignState
    || loaded.checkpoint?.snapshot
    || loaded.checkpoint?.state
    || loaded.record?.checkpoint?.campaignState
    || loaded.record?.checkpoint?.snapshot
    || loaded.record?.checkpoint?.state
    || loaded.payload?.campaignState
    || null;
}

export function stableTextHash(value) {
  let hash = 2166136261;
  for (const character of String(value ?? '')) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `h${(hash >>> 0).toString(36)}`;
}

function previewText(value, limit = 220) {
  const text = compact(value);
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

export function normalizeReconciliationMessage(message = {}, ordinal = null) {
  if (!isObject(message)) return null;
  const text = stripCampaignReplyHeader(String(message.text ?? message.mes ?? message.content ?? ''));
  const id = compact(message.hostMessageId || message.id || message.messageId || message.message_id) || (Number.isInteger(ordinal) ? String(ordinal) : null);
  const index = Number.isInteger(message.index) ? message.index : (Number.isFinite(Number(message.index)) ? Number(message.index) : ordinal);
  const role = message.role || (message.isUser || message.is_user ? 'user' : message.isSystem || message.is_system ? 'system' : 'assistant');
  return {
    hostMessageId: id,
    id,
    index: Number.isInteger(index) ? index : null,
    ordinal: Number.isInteger(message.ordinal) ? message.ordinal : (Number.isInteger(index) ? index : ordinal),
    chatId: compact(message.chatId || message.chat_id) || null,
    role,
    name: compact(message.name || message.characterName) || null,
    text,
    textHash: stableTextHash(text),
    textPreview: previewText(text),
    previousHash: compact(message.previousHash) || null,
    nextHash: compact(message.nextHash) || null,
    isUser: role === 'user',
    isSystem: role === 'system',
    isDirectiveOwned: message.isDirectiveOwned === true || message.directiveOwned === true,
    metadata: cloneJson(message.metadata || null)
  };
}

export function normalizeReconciliationMessages(messages = []) {
  const normalized = asArray(messages).map((item, index) => normalizeReconciliationMessage(item, index)).filter(Boolean);
  for (let index = 0; index < normalized.length; index += 1) {
    normalized[index].previousHash ||= normalized[index - 1]?.textHash || null;
    normalized[index].nextHash ||= normalized[index + 1]?.textHash || null;
  }
  return normalized;
}

function normalizeAnchor(anchor = null) {
  if (!isObject(anchor)) return null;
  return {
    host: compact(anchor.host) || 'sillytavern',
    hostMessageId: compact(anchor.hostMessageId || anchor.messageId || anchor.id) || null,
    chatId: compact(anchor.chatId) || null,
    index: Number.isInteger(anchor.index) ? anchor.index : null,
    ordinal: Number.isInteger(anchor.ordinal) ? anchor.ordinal : (Number.isInteger(anchor.index) ? anchor.index : null),
    role: compact(anchor.role) || null,
    name: compact(anchor.name) || null,
    textHash: compact(anchor.textHash) || null,
    previousHash: compact(anchor.previousHash) || null,
    nextHash: compact(anchor.nextHash) || null,
    textPreview: previewText(anchor.textPreview),
    capturedAt: anchor.capturedAt || null,
    ingressId: compact(anchor.ingressId) || null,
    turnId: compact(anchor.turnId) || null,
    outcomeId: compact(anchor.outcomeId) || null
  };
}

function findIngressForMessage(state, message) {
  const ledger = asArray(createRuntimeLedgerView(state || {}).ingressLedger);
  return ledger.find((entry) => message?.hostMessageId && String(entry.hostMessageId || '') === String(message.hostMessageId))
    || ledger.find((entry) => message?.textHash && String(entry.textHash || '') === String(message.textHash))
    || null;
}

export function anchorFromReconciliationMessage(message, state = null, now = null) {
  const normalized = normalizeReconciliationMessage(message);
  if (!normalized) return null;
  const ingress = findIngressForMessage(state, normalized);
  return normalizeAnchor({
    host: 'sillytavern', hostMessageId: normalized.hostMessageId,
    chatId: normalized.chatId || ingress?.chatId || state?.campaignChatBinding?.chatId || null,
    index: normalized.index, ordinal: normalized.ordinal, role: normalized.role, name: normalized.name,
    textHash: normalized.textHash, previousHash: normalized.previousHash, nextHash: normalized.nextHash,
    textPreview: normalized.textPreview, capturedAt: timestamp(now),
    ingressId: ingress?.id || null, turnId: ingress?.turnId || null, outcomeId: ingress?.outcomeId || null
  });
}

export function anchorRangeForMessages(messages = [], { state = null, startAnchor = null, endAnchor = null, now = null } = {}) {
  const normalized = normalizeReconciliationMessages(messages);
  const start = normalizeAnchor(startAnchor) || anchorFromReconciliationMessage(normalized[0], state, now);
  const end = normalizeAnchor(endAnchor) || anchorFromReconciliationMessage(normalized.at(-1), state, now);
  const rangeHash = stableTextHash(normalized.map((item) => [item.chatId, item.hostMessageId, item.ordinal, item.role, item.name, item.textHash].join(':')).join('|'));
  return { host: 'sillytavern', chatId: start?.chatId || end?.chatId || state?.campaignChatBinding?.chatId || null, start, end, messageCount: normalized.length, rangeHash };
}

function resolveAnchorIndex(messages, anchor, fallback) {
  const normalized = normalizeAnchor(anchor);
  if (!normalized) return fallback;
  let index = messages.findIndex((item) => normalized.hostMessageId && item.hostMessageId === normalized.hostMessageId);
  if (index < 0 && normalized.ingressId) index = messages.findIndex((item) => item.metadata?.ingressId === normalized.ingressId);
  if (index < 0 && Number.isInteger(normalized.ordinal)) index = messages.findIndex((item) => item.ordinal === normalized.ordinal);
  if (index < 0 && normalized.textHash) {
    const candidates = messages.map((item, candidateIndex) => ({ item, candidateIndex })).filter(({ item }) => item.textHash === normalized.textHash);
    const neighbor = candidates.find(({ item }) => (!normalized.previousHash || item.previousHash === normalized.previousHash) && (!normalized.nextHash || item.nextHash === normalized.nextHash));
    index = neighbor?.candidateIndex ?? candidates[0]?.candidateIndex ?? -1;
  }
  return index < 0 ? fallback : index;
}

export function resolveAnchorRange(messages = [], anchorRange = null) {
  const normalized = normalizeReconciliationMessages(messages);
  if (!normalized.length) return { messages: [], anchorRange: anchorRangeForMessages([]), stale: true, reasons: ['empty-chat'] };
  let startIndex = resolveAnchorIndex(normalized, anchorRange?.start, 0);
  let endIndex = resolveAnchorIndex(normalized, anchorRange?.end, normalized.length - 1);
  if (endIndex < startIndex) [startIndex, endIndex] = [endIndex, startIndex];
  const selected = normalized.slice(startIndex, endIndex + 1);
  const resolvedRange = anchorRangeForMessages(selected, { startAnchor: anchorFromReconciliationMessage(selected[0]), endAnchor: anchorFromReconciliationMessage(selected.at(-1)) });
  const reasons = [];
  if (anchorRange?.rangeHash && resolvedRange.rangeHash !== anchorRange.rangeHash) reasons.push('range-hash-changed');
  if (anchorRange?.chatId && resolvedRange.chatId && anchorRange.chatId !== resolvedRange.chatId) reasons.push('chat-changed');
  return { messages: selected, anchorRange: resolvedRange, stale: reasons.length > 0, reasons };
}

export function normalizeSceneReconciliationState(value = {}) {
  const input = isObject(value) ? value : {};
  return {
    schemaVersion: 2,
    authority: compact(input.authority) || null,
    projectionSource: compact(input.projectionSource) || null,
    compatibilityMirror: isObject(input.compatibilityMirror) ? cloneJson(input.compatibilityMirror) : null,
    markers: { start: normalizeAnchor(input.markers?.start), end: normalizeAnchor(input.markers?.end) },
    runs: bounded(input.runs, LIMITS.runs).map(cloneJson),
    pending: bounded(input.pending, LIMITS.pending).map(cloneJson),
    applied: bounded(input.applied, LIMITS.applied).map(cloneJson),
    rejected: bounded(input.rejected, LIMITS.rejected).map(cloneJson),
    recalculationPreviews: bounded(input.recalculationPreviews, LIMITS.previews).map(cloneJson),
    chunkCache: bounded(input.chunkCache, LIMITS.cache).map(cloneJson),
    invalidations: bounded(input.invalidations, LIMITS.applied).map(cloneJson),
    lastRunId: compact(input.lastRunId) || null,
    lastResult: cloneJson(input.lastResult || null)
  };
}

export function sceneReconciliationState(campaignState) {
  return normalizeSceneReconciliationState(campaignState?.sceneReconciliation);
}

function passageChunks(messages, size = 12, overlap = 2) {
  const source = normalizeReconciliationMessages(messages);
  if (source.length <= size) return [source];
  const chunks = [];
  const step = Math.max(1, size - overlap);
  for (let index = 0; index < source.length; index += step) {
    const chunk = source.slice(index, index + size);
    if (chunk.length) chunks.push(chunk);
    if (index + size >= source.length) break;
  }
  return chunks;
}

function extractLabel(text, pattern) {
  const match = String(text || '').match(pattern);
  return compact(match?.[1]).replace(/[.?!]+$/g, '');
}

function deterministicObservations(messages) {
  const observations = [];
  for (const message of messages) {
    if (message.isSystem || !compact(message.text)) continue;
    const commandLog = extractLabel(message.text, /(?:^|\n)\s*(?:command\s+log|log)\s*:\s*([^\n]+)/i);
    const shipCondition = extractLabel(message.text, /(?:^|\n)\s*ship\s+(?:status|condition)\s*:\s*([^\n]+)/i);
    const missionPhase = extractLabel(message.text, /(?:^|\n)\s*mission\s+(?:phase|status)\s*:\s*([^\n]+)/i);
    const location = extractLabel(message.text, /(?:^|\n)\s*(?:location|current\s+location)\s*:\s*([^\n]+)/i);
    if (commandLog) observations.push({ kind: 'command-log', domain: 'commandLog', summary: commandLog, confidence: 0.96, evidenceMessageIds: [message.hostMessageId] });
    if (shipCondition) observations.push({ kind: 'ship-condition', domain: 'ship', summary: shipCondition, value: shipCondition, confidence: 0.88, evidenceMessageIds: [message.hostMessageId] });
    if (missionPhase) observations.push({ kind: 'mission-phase', domain: 'mission', summary: missionPhase, value: missionPhase, confidence: 0.84, evidenceMessageIds: [message.hostMessageId] });
    if (location) observations.push({ kind: 'location', domain: 'worldState', summary: location, value: location, confidence: 0.78, evidenceMessageIds: [message.hostMessageId] });
  }
  return observations;
}

function responsePayload(result) {
  const response = result?.response ?? result;
  return response?.data ?? response?.parsed ?? response?.output ?? response?.value ?? response?.content ?? response;
}

async function modelObservations({ generationRouter, messages, state, anchorRange }) {
  if (!generationRouter?.generate) return { observations: [], modelCall: null };
  const request = {
    contract: 'directive.sceneReconciliationObservations.v2',
    instruction: 'Extract only explicit, player-observable state differences from this changed chat passage. Chat is evidence, not authority. Do not reveal hidden facts. Return observations, not prose and not executable code.',
    passage: messages.map((item) => ({ id: item.hostMessageId, role: item.role, name: item.name, text: item.text })),
    visibleState: {
      currentLocationId: state?.worldState?.currentLocationId || null,
      foregroundQuestId: state?.questLedger?.foregroundQuestId || null,
      missionPhase: state?.mission?.phase || state?.mission?.activePhaseId || null,
      shipCondition: state?.ship?.condition || null
    },
    allowedDomains: [...ALLOWED_ROOTS],
    anchorRange
  };
  const result = await generationRouter.generate('sceneReconciliationExtractor', { prompt: JSON.stringify(request), structuredOutput: true, metadata: { anchorRange } });
  const payload = responsePayload(result);
  const raw = asArray(payload?.observations || payload?.items);
  const messageIds = new Set(messages.map((item) => item.hostMessageId));
  const observations = raw.slice(0, 20).map((item) => ({
    kind: compact(item.kind || item.operation || 'observation'),
    domain: ALLOWED_ROOTS.includes(item.domain) ? item.domain : null,
    summary: previewText(item.summary || item.reason || item.evidence),
    value: cloneJson(item.value),
    targetPath: compact(item.targetPath || item.path) || null,
    operation: compact(item.operation || item.op).toLowerCase() || null,
    confidence: Math.max(0, Math.min(1, Number(item.confidence || 0.5))),
    conflict: item.conflict === true,
    evidenceMessageIds: unique(item.evidenceMessageIds).filter((id) => messageIds.has(id))
  })).filter((item) => item.domain && item.summary && item.evidenceMessageIds.length);
  return { observations, modelCall: cloneJson(result) };
}

function operationAllowed(operation) {
  if (!isObject(operation) || !ALLOWED_OPS.has(compact(operation.op).toLowerCase())) return false;
  const path = compact(operation.path);
  const root = rootOf(path);
  return ALLOWED_ROOTS.includes(root) && ALLOWED_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}.`));
}

function observationToProposal(observation, context) {
  let operations = [];
  let risk = 'consequential';
  if (observation.kind === 'command-log') {
    operations = [{ op: 'append', path: 'commandLog.entries', value: {
      source: 'sceneReconciliation', sourceOutcomeId: null, sourceMessageIds: observation.evidenceMessageIds,
      recordedAt: timestamp(context.now), summaryInputs: [observation.summary], visibleConsequences: [observation.summary],
      sourceAnchorRange: cloneJson(context.anchorRange)
    } }];
    risk = 'safe';
  } else if (observation.kind === 'ship-condition') {
    operations = [{ op: 'set', path: 'ship.condition', value: compact(observation.value || observation.summary) }];
  } else if (observation.kind === 'mission-phase') {
    operations = [
      { op: 'set', path: 'mission.activePhaseId', value: compact(observation.value || observation.summary).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'reconciled-phase' },
      { op: 'set', path: 'mission.phase', value: compact(observation.value || observation.summary) }
    ];
  } else if (observation.kind === 'location') {
    operations = [{ op: 'set', path: 'worldState.currentLocationId', value: compact(observation.value || observation.summary) }];
  } else if (observation.targetPath && observation.operation) {
    const operation = { op: observation.operation, path: observation.targetPath, value: cloneJson(observation.value) };
    if (operationAllowed(operation)) operations = [operation];
  }
  if (!operations.length || !operations.every(operationAllowed)) return null;
  const roots = unique(operations.map((item) => rootOf(item.path)));
  return {
    id: context.idFactory('recon-proposal'), runId: context.runId,
    source: 'sceneReconciliation', workerId: context.workerId || 'scene-reconciliation-extractor',
    risk: observation.conflict ? 'conflict' : risk,
    confidence: observation.confidence,
    summary: previewText(observation.summary),
    baseRevision: context.baseRevision,
    baseMechanicsRevision: context.baseMechanicsRevision,
    campaignId: context.campaignId,
    saveId: context.saveId,
    chatId: context.anchorRange?.chatId || null,
    anchorRangeHash: context.anchorRange?.rangeHash || null,
    sourceAnchorRange: cloneJson(context.anchorRange),
    evidenceMessageIds: unique(observation.evidenceMessageIds),
    allowedRoots: roots,
    operations,
    staleCheck: {
      campaignId: context.campaignId, saveId: context.saveId,
      chatId: context.anchorRange?.chatId || null, anchorRangeHash: context.anchorRange?.rangeHash || null,
      baseMechanicsRevision: context.baseMechanicsRevision
    }
  };
}

function proposalRisk(proposal) {
  const roots = unique(asArray(proposal.operations).map((item) => rootOf(item.path)));
  if (proposal.risk === 'conflict' || proposal.conflict === true) return 'review';
  if (proposal.risk !== 'safe' || Number(proposal.confidence || 0) < 0.8) return 'review';
  return roots.length && roots.every((root) => AUTO_ROOTS.includes(root)) ? 'safe' : 'review';
}

function dedupeProposals(proposals) {
  const seen = new Set();
  return proposals.filter((proposal) => {
    const key = stableTextHash(JSON.stringify({ operations: proposal.operations, range: proposal.anchorRangeHash }));
    if (seen.has(key)) return false;
    seen.add(key);
    proposal.semanticHash = key;
    return true;
  });
}

function outcomeIdsForRange(state, range) {
  const ids = new Set();
  const messageIds = new Set([range?.start?.hostMessageId, range?.end?.hostMessageId].filter(Boolean));
  const runtimeLedgerView = createRuntimeLedgerView(state || {});
  for (const ingress of asArray(runtimeLedgerView.ingressLedger)) {
    if (messageIds.has(ingress.hostMessageId) && ingress.outcomeId) ids.add(ingress.outcomeId);
  }
  for (const response of asArray(runtimeLedgerView.responseLedger)) {
    if (messageIds.has(response.hostMessageId) && response.outcomeId) ids.add(response.outcomeId);
  }
  return [...ids];
}

function findOutcomeForAnchor(state, anchor) {
  if (anchor?.outcomeId) return anchor.outcomeId;
  const ingress = findIngressForMessage(state, anchor);
  if (ingress?.outcomeId) return ingress.outcomeId;
  return asArray(createRuntimeLedgerView(state || {}).responseLedger).find((entry) => anchor?.hostMessageId && entry.hostMessageId === anchor.hostMessageId)?.outcomeId || null;
}

function campaignIdForState(state = null) {
  return compact(state?.campaign?.id || state?.campaign?.templateCampaignId) || null;
}

function saveIdForState(state = null) {
  return compact(state?.campaign?.saveId || state?.saveId) || null;
}

function coreTransactionIdForMessage(state, message) {
  const ingressId = compact(message?.ingressId || message?.metadata?.ingressId) || null;
  const ingressRows = asArray(createRuntimeLedgerView(state || {}).ingressLedger);
  const directIngress = ingressId
    ? ingressRows.find((entry) => entry?.id === ingressId)
    : null;
  const ingress = findIngressForMessage(state, message);
  return compact(message?.coreTransactionId || message?.metadata?.coreTransactionId || directIngress?.coreTransactionId || ingress?.coreTransactionId) || null;
}

function coreTransactionIdForRange(state, messages = [], anchorRange = null) {
  const candidates = [anchorRange?.start, anchorRange?.end, ...asArray(messages)];
  for (const candidate of candidates) {
    const transactionId = coreTransactionIdForMessage(state, candidate);
    if (transactionId) return transactionId;
  }
  return null;
}

function expectedSourceForRange(state, anchorRange = null) {
  return {
    campaignId: campaignIdForState(state),
    saveId: saveIdForState(state),
    chatId: compact(anchorRange?.chatId || state?.campaignChatBinding?.chatId) || null,
    branchId: compact(state?.campaignChatBinding?.branchId || state?.branchId) || null
  };
}

function compactSourcePreflightDecision(decision = null) {
  if (!isObject(decision)) return null;
  return {
    kind: 'directive.sceneReconciliationSourcePreflight.v1',
    status: compact(decision.status) || 'unknown',
    mode: compact(decision.mode) || 'explicitRange',
    transactionId: compact(decision.transactionId) || null,
    rangeFrameId: compact(decision.rangeFrameId) || null,
    rangeHash: compact(decision.rangeHash) || null,
    providerCalled: decision.providerCalled === true,
    applied: decision.applied === true,
    reasons: unique(asArray(decision.reasons).map(compact)),
    diagnosticId: compact(decision.diagnostic?.id || decision.diagnosticId) || null,
    errorCode: compact(decision.errorCode) || null,
    observedAt: compact(decision.observedAt) || null
  };
}

function compactSourceSettlementDecision(decision = null) {
  if (!isObject(decision)) return null;
  const operations = Array.isArray(decision.operations) ? decision.operations : [];
  return {
    kind: 'directive.sceneReconciliationSourceSettlement.v1',
    status: compact(decision.status) || 'unknown',
    mode: compact(decision.mode) || 'explicitRange',
    transactionId: compact(decision.transactionId) || null,
    rangeFrameId: compact(decision.rangeFrameId || decision.source?.rangeFrameId || decision.source?.id) || null,
    rangeHash: compact(decision.rangeHash || decision.source?.rangeHash) || null,
    providerCalled: decision.providerCalled === true,
    applied: decision.applied === true,
    reasons: unique(asArray(decision.reasons).map(compact)),
    diagnosticId: compact(decision.diagnostic?.id || decision.diagnosticId) || null,
    operationCount: operations.length,
    operationBundleHash: compact(decision.operationBundleHash) || (operations.length ? stableTextHash(JSON.stringify(operations)) : null),
    promptDirtyDomains: unique(asArray(decision.promptDirtyDomains).map(compact)),
    errorCode: compact(decision.errorCode) || null,
    observedAt: compact(decision.observedAt) || null
  };
}

function sourcePreflightMessageRefs(messages = []) {
  return normalizeReconciliationMessages(messages).map((message) => ({
    hostMessageId: message.hostMessageId || null,
    chatId: message.chatId || null,
    role: message.role || null,
    ordinal: Number.isInteger(message.ordinal) ? message.ordinal : null,
    index: Number.isInteger(message.index) ? message.index : null,
    textHash: message.textHash || null,
    selectedAssistantVariantHash: message.selectedAssistantVariantHash || null,
    ingressId: message.metadata?.ingressId || null,
    turnId: message.metadata?.turnId || null,
    outcomeId: message.metadata?.outcomeId || null
  }));
}

function sourceSettlementAnchor(anchor = null) {
  if (!isObject(anchor)) return null;
  return {
    host: compact(anchor.host) || 'sillytavern',
    hostMessageId: compact(anchor.hostMessageId) || null,
    chatId: compact(anchor.chatId) || null,
    index: Number.isInteger(anchor.index) ? anchor.index : null,
    ordinal: Number.isInteger(anchor.ordinal) ? anchor.ordinal : null,
    role: compact(anchor.role) || null,
    name: compact(anchor.name) || null,
    textHash: compact(anchor.textHash) || null,
    previousHash: compact(anchor.previousHash) || null,
    nextHash: compact(anchor.nextHash) || null,
    capturedAt: anchor.capturedAt || null,
    ingressId: compact(anchor.ingressId) || null,
    turnId: compact(anchor.turnId) || null,
    outcomeId: compact(anchor.outcomeId) || null
  };
}

function sourceSettlementAnchorRange(anchorRange = null) {
  if (!isObject(anchorRange)) return null;
  return {
    host: compact(anchorRange.host) || 'sillytavern',
    chatId: compact(anchorRange.chatId) || null,
    start: sourceSettlementAnchor(anchorRange.start),
    end: sourceSettlementAnchor(anchorRange.end),
    messageCount: Number.isInteger(anchorRange.messageCount) ? anchorRange.messageCount : null,
    rangeHash: compact(anchorRange.rangeHash) || null
  };
}

export function createSceneReconciliationService({
  getCampaignState,
  stateDeltaGateway,
  host = null,
  generationRouter = null,
  getPackageData = null,
  processReconciledConversation = null,
  replayDirector = null,
  loadCoreCheckpointState = null,
  sourceSettlementService = null,
  now = null,
  idFactory = null
} = {}) {
  if (typeof getCampaignState !== 'function') throw new Error('getCampaignState must be a function');
  if (!stateDeltaGateway?.applyOperations || !stateDeltaGateway?.commit) throw new Error('stateDeltaGateway is required');
  const makeId = typeof idFactory === 'function' ? idFactory : (prefix = 'recon') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  function current() { return sceneReconciliationState(getCampaignState()); }
  function recentMessages() {
    return normalizeReconciliationMessages(typeof host?.chat?.getRecentMessages === 'function'
      ? host.chat.getRecentMessages({ limit: LIMITS.messages, playerSafeOnly: true })
      : []);
  }
  function resolveMessage(payload = {}) {
    const input = isObject(payload?.message) ? payload.message : payload;
    const id = compact(input?.hostMessageId || input?.id || input?.messageId || input?.message_id);
    const fetched = id && typeof host?.chat?.getMessage === 'function' ? host.chat.getMessage(id) : null;
    const normalizedHost = !fetched && typeof host?.chat?.normalizeMessagePayload === 'function' ? host.chat.normalizeMessagePayload(input) : null;
    return normalizeReconciliationMessage(fetched || normalizedHost || input);
  }
  async function writeLedger(next, summary) {
    const baseRevision = stateDeltaGateway.revision();
    const normalized = normalizeSceneReconciliationState(next);
    const authority = sceneReconciliationLedgerAuthority(getCampaignState(), normalized, { summary, baseRevision });
    return stateDeltaGateway.applyOperations({
      id: makeId('recon-ledger'), source: 'sceneReconciliation', workerId: 'scene-reconciliation-ledger',
      summary, baseRevision, allowedRoots: ['sceneReconciliation'],
      operations: [{
        op: 'set',
        path: 'sceneReconciliation',
        value: {
          ...normalized,
          authority: authority.authority,
          projectionSource: authority.projectionSource,
          compatibilityMirror: authority.compatibilityMirror
        }
      }]
    }, { allowedRoots: ['sceneReconciliation'] });
  }
  async function interruptRunningRuns(ledger, { actionId, nextRunId } = {}) {
    const running = asArray(ledger?.runs).filter((run) => run?.status === 'running');
    if (!running.length) return ledger;
    const completedAt = timestamp(now);
    const next = {
      ...ledger,
      runs: bounded(asArray(ledger.runs).map((run) => run?.status === 'running'
        ? {
            ...run,
            status: 'interrupted',
            completedAt,
            interruptionReason: 'superseded-by-new-reconciliation-run',
            interruptedByAction: actionId || null,
            interruptedByRunId: nextRunId || null
          }
        : run), LIMITS.runs),
      lastResult: {
        ok: false,
        action: actionId || 'reconciliation',
        status: 'interruptedPreviousRun',
        summary: `${running.length} previous reconciliation run${running.length === 1 ? '' : 's'} marked interrupted before starting a new scan.`,
        interruptedRunIds: running.map((run) => run.id).filter(Boolean),
        nextRunId: nextRunId || null
      }
    };
    await writeLedger(next, next.lastResult.summary);
    return current();
  }
  function rangeFrom(start, end = null) {
    const all = recentMessages();
    if (!all.length) return { messages: [], anchorRange: anchorRangeForMessages([]) };
    let startIndex = resolveAnchorIndex(all, start, 0);
    let endIndex = resolveAnchorIndex(all, end, all.length - 1);
    if (endIndex < startIndex) [startIndex, endIndex] = [endIndex, startIndex];
    const messages = all.slice(startIndex, endIndex + 1);
    return { messages, anchorRange: anchorRangeForMessages(messages, { state: getCampaignState(), now }) };
  }

  async function setMarker(kind, payload = {}) {
    const message = resolveMessage(payload);
    if (!message) return { ok: false, reason: 'message-unavailable' };
    const ledger = current();
    ledger.markers[kind === 'end' ? 'end' : 'start'] = anchorFromReconciliationMessage(message, getCampaignState(), now);
    ledger.lastResult = { ok: true, action: kind === 'end' ? 'setEnd' : 'setStart', summary: `Reconciliation ${kind === 'end' ? 'end' : 'start'} marker set.` };
    await writeLedger(ledger, ledger.lastResult.summary);
    return { ok: true, anchor: cloneJson(ledger.markers[kind === 'end' ? 'end' : 'start']), sceneReconciliation: current() };
  }

  async function invalidateChangedRange(anchorRange) {
    const before = getCampaignState();
    const outcomeIds = outcomeIdsForRange(before, anchorRange);
    const invalidation = invalidateOpenWorldCausalityForReconciliation(before, { anchorRange, outcomeIds, now });
    const material = invalidation.invalidatedEventIds.length || invalidation.affectedThreadIds.length || invalidation.staleQuestIds.length || invalidation.affectedOutcomeIds.length;
    const domains = material
      ? ['eventLedger', 'threadLedger', 'questLedger', 'dynamicQuestCatalog', 'attentionState', 'mission', 'runtimeTracking']
      : ['runtimeTracking'];
    await stateDeltaGateway.commit(invalidation.state, {
      source: 'sceneReconciliation', reason: 'Changed chat passage invalidated anchor-dependent derived state.',
      summary: 'Anchor-dependent outputs marked stale for reconciliation.', domains,
      reconciliationRunId: current().lastRunId, sourceAnchorRange: anchorRange,
      metadata: { invalidation: true, outcomeIds, sourceAnchorRange: anchorRange }
    });
    return invalidation;
  }

  async function runWorldBoundary(anchorRange, proposalId) {
    const packageData = typeof getPackageData === 'function' ? getPackageData() : null;
    if (!packageData?.world || !packageData?.questTemplates) return null;
    const result = processWorldBoundary({
      state: getCampaignState(), packageData,
      event: {
        id: `event.reconciliation.accepted.${stableTextHash(`${proposalId}|${anchorRange?.rangeHash}`)}`,
        type: 'reconciliation.accepted', sourceAnchorRange: anchorRange,
        payload: { proposalId }, playerFacingSummary: 'The campaign state was reconciled to the accepted chat passage.'
      },
      boundaryType: 'reconciliation-accepted', now
    });
    await stateDeltaGateway.commit(result.state, {
      source: 'sceneReconciliation', reason: 'World systems processed an accepted reconciliation.',
      summary: 'Open-world consequences refreshed after reconciliation.',
      domains: ['worldState', 'storyArcLedger', 'questLedger', 'eventLedger', 'attentionState', 'mission', 'runtimeTracking'],
      sourceAnchorRange: anchorRange, metadata: { proposalId, worldBoundary: true }
    });
    return result;
  }

  async function preflightSourceRange({ state, actionId, messages, anchorRange, runId }) {
    if (typeof sourceSettlementService?.preflightRange !== 'function') return null;
    const transactionId = coreTransactionIdForRange(state, messages, anchorRange);
    const expected = expectedSourceForRange(state, anchorRange);
    const rangeMessageRefs = sourcePreflightMessageRefs(messages);
    if (!transactionId) {
      return compactSourcePreflightDecision({
        status: 'skippedMissingCoreTransaction',
        mode: 'explicitRange',
        rangeHash: anchorRange?.rangeHash || null,
        providerCalled: false,
        applied: false,
        reasons: ['scene-reconciliation-source-preflight-missing-core-transaction'],
        observedAt: timestamp(now)
      });
    }
    try {
      const decision = await sourceSettlementService.preflightRange({
        transactionId,
        messages: rangeMessageRefs,
        campaignId: expected.campaignId,
        saveId: expected.saveId,
        chatId: expected.chatId,
        branchId: expected.branchId,
        expected,
        idempotencyKey: `sre:scene-reconciliation-preflight:${transactionId || 'no-core-transaction'}:${actionId}:${anchorRange?.rangeHash || stableTextHash(JSON.stringify(anchorRange || {}))}`,
        reasons: ['scene-reconciliation-range-diagnostic-preflight'],
        source: 'sceneReconciliation',
        action: actionId,
        reconciliationRunId: runId,
        anchorRangeHash: anchorRange?.rangeHash || null
      });
      return compactSourcePreflightDecision(decision);
    } catch (error) {
      return compactSourcePreflightDecision({
        status: 'preflightFailed',
        mode: 'explicitRange',
        transactionId,
        rangeHash: anchorRange?.rangeHash || null,
        providerCalled: false,
        applied: false,
        reasons: ['scene-reconciliation-source-preflight-error'],
        errorCode: error?.code || 'source-preflight-error',
        observedAt: timestamp(now)
      });
    }
  }

  async function settleSourceRange({ state, actionId, messages, anchorRange, runId }) {
    if (typeof sourceSettlementService?.reconcileRange !== 'function') return null;
    const transactionId = coreTransactionIdForRange(state, messages, anchorRange);
    const expected = expectedSourceForRange(state, anchorRange);
    const rangeMessageRefs = sourcePreflightMessageRefs(messages);
    if (!transactionId) {
      return compactSourceSettlementDecision({
        status: 'hardSkipped',
        mode: 'explicitRange',
        rangeHash: anchorRange?.rangeHash || null,
        providerCalled: false,
        applied: false,
        reasons: ['scene-reconciliation-source-settlement-missing-core-transaction'],
        observedAt: timestamp(now)
      });
    }
    try {
      const decision = await sourceSettlementService.reconcileRange({
        transactionId,
        messages: rangeMessageRefs,
        campaignId: expected.campaignId,
        saveId: expected.saveId,
        chatId: expected.chatId,
        branchId: expected.branchId,
        expected,
        idempotencyKey: `sre:scene-reconciliation-settlement:${transactionId || 'no-core-transaction'}:${actionId}:${anchorRange?.rangeHash || stableTextHash(JSON.stringify(anchorRange || {}))}`,
        settlementId: `scene-reconciliation:${runId}`,
        reasons: ['scene-reconciliation-range-terminal-settlement'],
        source: 'sceneReconciliation',
        action: actionId,
        reconciliationRunId: runId,
        anchorRangeHash: anchorRange?.rangeHash || null,
        anchorRange: sourceSettlementAnchorRange(anchorRange)
      });
      return compactSourceSettlementDecision(decision);
    } catch (error) {
      return compactSourceSettlementDecision({
        status: 'repairRequired',
        mode: 'explicitRange',
        transactionId,
        rangeHash: anchorRange?.rangeHash || null,
        providerCalled: false,
        applied: false,
        reasons: ['scene-reconciliation-source-settlement-error'],
        errorCode: error?.code || 'source-settlement-error',
        observedAt: timestamp(now)
      });
    }
  }

  async function completeWithSourceSettlementStop({ run, actionId, runId, normalized, skipped, sourcePreflight, sourceSettlement }) {
    const done = current();
    const completed = {
      ...run,
      status: sourceSettlement.status || 'sourceSettlementStopped',
      completedAt: timestamp(now),
      chunkCount: passageChunks(normalized).length,
      skippedChunkCount: skipped.length,
      proposalCount: 0,
      autoAppliedCount: 0,
      pendingCount: 0,
      sourceSettlement
    };
    done.runs = bounded([...done.runs.filter((item) => item.id !== runId), completed], LIMITS.runs);
    done.lastResult = {
      ok: sourceSettlement.status === 'noChange',
      action: actionId,
      runId,
      status: sourceSettlement.status,
      summary: sourceSettlement.status === 'noChange'
        ? 'Source range was already settled by SRE.'
        : 'Source range settlement blocked scene reconciliation.',
      messageCount: normalized.length,
      proposalCount: 0,
      autoAppliedCount: 0,
      pendingCount: 0,
      skippedChunkCount: skipped.length,
      sourcePreflight,
      sourceSettlement
    };
    await writeLedger(done, done.lastResult.summary);
    return {
      ok: sourceSettlement.status === 'noChange',
      status: sourceSettlement.status,
      reason: sourceSettlement.reasons[0] || 'source-settlement-stopped',
      run: completed,
      applied: [],
      pending: [],
      summary: done.lastResult.summary,
      sourcePreflight,
      sourceSettlement,
      sceneReconciliation: current()
    };
  }

  async function execute({ action: actionId, messages, anchorRange }) {
    const normalized = normalizeReconciliationMessages(messages);
    if (!normalized.length) return { ok: false, reason: 'empty-range' };
    const stateAtStart = getCampaignState();
    const runId = makeId('recon-run');
    const run = {
      id: runId, action: actionId, status: 'running', campaignId: stateAtStart?.campaign?.id || stateAtStart?.campaign?.templateCampaignId || null,
      saveId: stateAtStart?.campaign?.saveId || stateAtStart?.saveId || null,
      chatId: anchorRange?.chatId || stateAtStart?.campaignChatBinding?.chatId || null,
      baseRevision: stateDeltaGateway.revision(), baseMechanicsRevision: stateDeltaGateway.mechanicsRevision?.() ?? 0,
      anchorRange: sourceSettlementAnchorRange(anchorRange), affectedOutcomeIds: outcomeIdsForRange(stateAtStart, anchorRange),
      startedAt: timestamp(now), completedAt: null
    };
    const sourcePreflight = await preflightSourceRange({ state: stateAtStart, actionId, messages: normalized, anchorRange, runId });
    if (sourcePreflight) run.sourcePreflight = sourcePreflight;

    const cache = current().chunkCache;
    const chunks = passageChunks(normalized);
    const changed = [];
    const skipped = [];
    for (const chunk of chunks) {
      const range = anchorRangeForMessages(chunk, { state: getCampaignState(), now });
      const cached = cache.find((item) => item.rangeHash === range.rangeHash && item.status === 'completed');
      (cached ? skipped : changed).push({ messages: chunk, range, cached });
    }
    if (!changed.length) {
      const ledger = await interruptRunningRuns(current(), { actionId, nextRunId: runId });
      const done = current();
      const completed = { ...run, status: 'completed', completedAt: timestamp(now), chunkCount: chunks.length, skippedChunkCount: skipped.length, proposalCount: 0, autoAppliedCount: 0, pendingCount: 0 };
      done.runs = bounded([...ledger.runs.filter((item) => item.id !== runId), completed], LIMITS.runs);
      done.lastResult = { ok: true, action: actionId, runId, status: 'completed', summary: 'No changed chat chunks required reconciliation.', skippedChunkCount: skipped.length, sourcePreflight };
      await writeLedger(done, done.lastResult.summary);
      return { ok: true, run: completed, applied: [], pending: [], skippedUnchanged: skipped.length, summary: done.lastResult.summary, sourcePreflight, sceneReconciliation: current() };
    }

    const sourceSettlement = await settleSourceRange({ state: stateAtStart, actionId, messages: normalized, anchorRange, runId });
    if (sourceSettlement) {
      run.sourceSettlement = sourceSettlement;
    }

    const ledger = await interruptRunningRuns(current(), { actionId, nextRunId: runId });
    if (sourceSettlement) {
      if (sourceSettlement.status !== 'accepted') {
        return completeWithSourceSettlementStop({
          run,
          actionId,
          runId,
          normalized,
          skipped,
          sourcePreflight,
          sourceSettlement
        });
      }
    }
    ledger.runs = bounded([...ledger.runs, run], LIMITS.runs);
    ledger.lastRunId = runId;
    ledger.lastResult = { ok: true, action: actionId, status: 'running', runId, summary: 'Scene reconciliation started.', sourcePreflight, sourceSettlement };
    await writeLedger(ledger, `Scene reconciliation started: ${actionId}.`);

    const invalidation = await invalidateChangedRange(anchorRange);
    const allObservations = [];
    const modelCalls = [];
    const newCache = [];
    for (const chunk of changed) {
      const deterministic = deterministicObservations(chunk.messages);
      let assisted = { observations: [], modelCall: null };
      try { assisted = await modelObservations({ generationRouter, messages: chunk.messages, state: getCampaignState(), anchorRange: chunk.range }); }
      catch (error) { assisted = { observations: [], modelCall: { ok: false, error: { message: error?.message || String(error) } } }; }
      allObservations.push(...deterministic, ...assisted.observations);
      if (assisted.modelCall) modelCalls.push(assisted.modelCall);
      newCache.push({ id: makeId('recon-chunk'), rangeHash: chunk.range.rangeHash, anchorRange: chunk.range, status: 'completed', observationCount: deterministic.length + assisted.observations.length, completedAt: timestamp(now), runId });
    }

    const context = {
      runId, idFactory: makeId, now,
      baseRevision: stateDeltaGateway.revision(), baseMechanicsRevision: stateDeltaGateway.mechanicsRevision?.() ?? 0,
      campaignId: run.campaignId, saveId: run.saveId, anchorRange
    };
    const proposals = dedupeProposals(allObservations.map((item) => observationToProposal(item, context)).filter(Boolean));
    const safe = proposals.filter((item) => proposalRisk(item) === 'safe');
    const review = proposals.filter((item) => proposalRisk(item) !== 'safe');
    const applied = [];
    if (safe.length) {
      const operations = safe.flatMap((item) => item.operations);
      const result = await stateDeltaGateway.applyOperations({
        id: makeId('recon-safe-batch'), runId, source: 'sceneReconciliation', workerId: 'scene-reconciliation-safe-batch',
        summary: `Apply ${safe.length} safe reconciliation update${safe.length === 1 ? '' : 's'}.`,
        baseRevision: stateDeltaGateway.revision(), allowedRoots: unique(safe.flatMap((item) => item.allowedRoots)),
        sourceAnchorRange: anchorRange, evidenceMessageIds: unique(safe.flatMap((item) => item.evidenceMessageIds)), operations
      }, { allowedRoots: unique(safe.flatMap((item) => item.allowedRoots)) });
      for (const proposal of safe) applied.push({ id: proposal.id, runId, status: 'autoApplied', summary: proposal.summary, appliedAt: timestamp(now), appliedRevision: result.revision, roots: proposal.allowedRoots, sourceAnchorRange: anchorRange });
    }
    const baseRevision = stateDeltaGateway.revision();
    const baseMechanicsRevision = stateDeltaGateway.mechanicsRevision?.() ?? 0;
    const pending = review.map((proposal) => ({
      ...proposal, baseRevision, baseMechanicsRevision,
      staleCheck: { ...proposal.staleCheck, baseMechanicsRevision },
      status: 'pending', reviewReason: proposal.risk === 'conflict' ? 'conflict' : proposal.confidence < 0.8 ? 'lowConfidence' : 'consequential', createdAt: timestamp(now)
    }));

    if (typeof processReconciledConversation === 'function') {
      try { await processReconciledConversation({ messages: normalized, anchorRange, runId, reconciliation: true }); }
      catch (error) { modelCalls.push({ ok: false, roleId: 'sceneDeltaExtractor', error: { message: error?.message || String(error) } }); }
    }

    const done = current();
    const completed = {
      ...run, status: 'completed', completedAt: timestamp(now), chunkCount: chunks.length,
      changedChunkCount: changed.length, skippedChunkCount: skipped.length,
      proposalCount: proposals.length, autoAppliedCount: applied.length, pendingCount: pending.length,
      invalidation: { eventIds: invalidation.invalidatedEventIds, threadIds: invalidation.affectedThreadIds, questIds: invalidation.staleQuestIds, outcomeIds: invalidation.affectedOutcomeIds },
      modelCallCount: modelCalls.length,
      sourceSettlement
    };
    const knownRuns = [...ledger.runs];
    const knownRunIds = new Set(knownRuns.map((item) => item?.id).filter(Boolean));
    for (const item of done.runs) {
      if (item?.id && !knownRunIds.has(item.id)) knownRuns.push(item);
    }
    done.runs = bounded([...knownRuns.filter((item) => item.id !== runId), completed], LIMITS.runs);
    done.applied = bounded([...done.applied, ...applied], LIMITS.applied);
    done.pending = bounded([...done.pending.filter((item) => !pending.some((next) => next.id === item.id)), ...pending], LIMITS.pending);
    done.chunkCache = bounded([...done.chunkCache.filter((item) => !newCache.some((next) => next.rangeHash === item.rangeHash)), ...newCache], LIMITS.cache);
    done.lastRunId = runId;
    done.lastResult = { ok: true, action: actionId, runId, status: 'completed', summary: `${applied.length} safe update${applied.length === 1 ? '' : 's'} applied; ${pending.length} item${pending.length === 1 ? '' : 's'} pending review.`, messageCount: normalized.length, proposalCount: proposals.length, autoAppliedCount: applied.length, pendingCount: pending.length, skippedChunkCount: skipped.length, sourcePreflight, sourceSettlement };
    await writeLedger(done, `Scene reconciliation completed: ${actionId}.`);
    return { ok: true, run: completed, applied, pending, summary: done.lastResult.summary, sourcePreflight, sourceSettlement, sceneReconciliation: current() };
  }

  async function reconcileMessage(payload = {}) {
    const message = resolveMessage(payload);
    if (!message) return { ok: false, reason: 'message-unavailable' };
    const messages = normalizeReconciliationMessages([message]);
    return execute({ action: 'reconcileMessage', messages, anchorRange: anchorRangeForMessages(messages, { state: getCampaignState(), now }) });
  }
  async function reconcileFromHere(payload = {}) {
    const message = resolveMessage(payload);
    if (!message) return { ok: false, reason: 'message-unavailable' };
    const start = anchorFromReconciliationMessage(message, getCampaignState(), now);
    const range = rangeFrom(start, null);
    return execute({ action: 'reconcileFromHere', ...range });
  }
  async function reconcileMarked() {
    const ledger = current();
    if (!ledger.markers.start || !ledger.markers.end) {
      ledger.lastResult = { ok: false, action: 'reconcileMarked', status: 'missingMarkers', summary: 'Set both reconciliation markers before scanning the passage.' };
      await writeLedger(ledger, ledger.lastResult.summary);
      return { ok: false, reason: 'missing-markers', sceneReconciliation: current() };
    }
    const result = await execute({ action: 'reconcileMarked', ...rangeFrom(ledger.markers.start, ledger.markers.end) });
    if (!result?.ok) return result;
    const cleared = current();
    cleared.markers = { start: null, end: null };
    cleared.lastResult = { ...cleared.lastResult, markersCleared: true };
    await writeLedger(cleared, 'Reconciliation markers cleared after marked passage reconciliation.');
    return { ...result, sceneReconciliation: current() };
  }

  async function clearMarkers() {
    const ledger = current();
    const hadMarkers = Boolean(ledger.markers.start || ledger.markers.end);
    ledger.markers = { start: null, end: null };
    ledger.lastResult = {
      ok: true,
      action: 'clearMarkers',
      status: hadMarkers ? 'cleared' : 'empty',
      summary: hadMarkers ? 'Reconciliation markers cleared.' : 'No reconciliation markers were set.'
    };
    await writeLedger(ledger, ledger.lastResult.summary);
    return {
      ok: true,
      action: 'clearMarkers',
      status: ledger.lastResult.status,
      summary: ledger.lastResult.summary,
      sceneReconciliation: current()
    };
  }

  async function recalculateFromHere(payload = {}) {
    const state = getCampaignState();
    const message = resolveMessage(payload);
    if (!message) return { ok: false, reason: 'message-unavailable' };
    const anchor = anchorFromReconciliationMessage(message, state, now);
    const outcomeId = findOutcomeForAnchor(state, anchor);
    const entries = asArray(state?.turnLedger?.entries);
    const index = entries.findIndex((item) => item.outcomeId === outcomeId);
    const ledgerEntry = index >= 0 ? entries[index] : null;
    const previewId = makeId('recalc-preview');
    let replayPreview = null;
    let checkpointSnapshot = null;
    let checkpointRef = coreCheckpointRefFromLedgerEntry(ledgerEntry);
    let checkpointSourceKind = null;
    if (checkpointRef && typeof loadCoreCheckpointState === 'function') {
      const binding = state.campaignChatBinding || {};
      const loaded = await loadCoreCheckpointState({
        coreCheckpointRef: checkpointRef,
        state,
        ledgerEntry: cloneJson(ledgerEntry),
        outcomeId,
        purpose: 'sceneReconciliationRecalculateFromHere'
      });
      checkpointSnapshot = snapshotFromLoadedCoreCheckpoint(loaded);
      checkpointSourceKind = compact(
        loaded?.sourceKind
        || loaded?.checkpoint?.sourceKind
        || checkpointRef.sourceKind
        || ''
      ) || (checkpointSnapshot ? 'coreStoreV2.checkpoint' : null);
      checkpointRef = {
        ...checkpointRef,
        campaignId: checkpointRef.campaignId || binding.campaignId || state.campaign?.id || null,
        saveId: checkpointRef.saveId || binding.saveId || null
      };
    }
    if (checkpointSnapshot && typeof replayDirector === 'function') {
      replayPreview = await replayDirector({ snapshotBefore: cloneJson(checkpointSnapshot), coreCheckpointRef: cloneJson(checkpointRef), snapshotSourceKind: checkpointSourceKind, ledgerEntry: cloneJson(ledgerEntry), anchor, payload: cloneJson(payload), maxTurns: Math.max(1, Math.min(8, Number(payload.maxTurns || 4))) });
    }
    const previewAvailable = Boolean(checkpointSnapshot);
    const preview = {
      id: previewId, status: previewAvailable ? 'previewAvailable' : 'stopped',
      createdAt: timestamp(now), baseRevision: stateDeltaGateway.revision(), baseMechanicsRevision: stateDeltaGateway.mechanicsRevision?.() ?? 0,
      anchor, anchorRange: anchorRangeForMessages([message], { state, now }), outcomeId: outcomeId || null,
      hasSnapshotBefore: previewAvailable,
      coreCheckpointRef: previewAvailable ? cloneJson(checkpointRef) : null,
      snapshotSourceKind: previewAvailable ? checkpointSourceKind : null,
      droppedOutcomeIds: index >= 0 ? entries.slice(index + 1).map((item) => item.outcomeId).filter(Boolean) : [],
      replayPreview: cloneJson(replayPreview),
      summary: previewAvailable ? 'Scratch replay preview is available from CORE checkpoint; live state has not changed.' : 'No CORE checkpoint snapshot was found.'
    };
    const ledger = current();
    ledger.recalculationPreviews = bounded([...ledger.recalculationPreviews, preview], LIMITS.previews);
    ledger.lastResult = { ok: preview.status === 'previewAvailable', action: 'recalculateFromHere', status: preview.status, previewId, outcomeId, destructive: true, summary: preview.summary };
    await writeLedger(ledger, 'Recalculate From Here preview recorded.');
    return { ok: preview.status === 'previewAvailable', action: 'recalculateFromHere', status: preview.status, previewId, anchor, outcomeId, hasSnapshotBefore: preview.hasSnapshotBefore, droppedOutcomeIds: preview.droppedOutcomeIds, replayPreview: cloneJson(replayPreview), sceneReconciliation: current() };
  }

  async function recordRecalculationPreview({ previewId, preview } = {}) {
    const ledger = current();
    const index = ledger.recalculationPreviews.findIndex((item) => item.id === previewId);
    if (index < 0) return { ok: false, reason: 'preview-not-found' };
    ledger.recalculationPreviews[index] = { ...ledger.recalculationPreviews[index], replayPreview: cloneJson(preview), updatedAt: timestamp(now) };
    await writeLedger(ledger, 'Recalculation preview enriched with Mission Director output.');
    return { ok: true, preview: cloneJson(ledger.recalculationPreviews[index]) };
  }

  /**
   * Records acceptance after the runtime has committed a replacement turn from
   * snapshotBefore. The replacement transaction owns mechanics; this method
   * restores the reconciliation audit record into the rebuilt state and marks
   * all later outcomes as deliberately superseded rather than silently lost.
   */
  async function acceptRecalculationPreview({
    previewId,
    previewRecord = null,
    replacedOutcomeId = null,
    replacementOutcomeId = null,
    droppedOutcomeIds = [],
    sourceAnchorRange = null,
    replacementHistoryEntry = null
  } = {}) {
    const id = compact(previewId);
    if (!id) return { ok: false, reason: 'preview-id-required' };
    const ledger = current();
    const existingIndex = ledger.recalculationPreviews.findIndex((item) => item.id === id);
    const existing = existingIndex >= 0 ? ledger.recalculationPreviews[existingIndex] : cloneJson(previewRecord || {});
    const acceptedAt = timestamp(now);
    const accepted = {
      ...existing,
      id,
      status: 'accepted',
      acceptedAt,
      replacedOutcomeId: compact(replacedOutcomeId || existing?.outcomeId) || null,
      replacementOutcomeId: compact(replacementOutcomeId) || null,
      droppedOutcomeIds: unique([...asArray(existing?.droppedOutcomeIds), ...asArray(droppedOutcomeIds)]),
      anchorRange: cloneJson(sourceAnchorRange || existing?.anchorRange || null),
      replacementHistoryEntry: cloneJson(replacementHistoryEntry || null),
      summary: 'Recalculation accepted. The selected outcome was replaced and later dependent outcomes were dropped from the rebuilt branch.'
    };
    if (existingIndex >= 0) ledger.recalculationPreviews[existingIndex] = accepted;
    else ledger.recalculationPreviews = bounded([...ledger.recalculationPreviews, accepted], LIMITS.previews);
    const invalidation = {
      id: makeId('recalc-invalidation'),
      type: 'recalculation-accepted',
      previewId: id,
      replacedOutcomeId: accepted.replacedOutcomeId,
      replacementOutcomeId: accepted.replacementOutcomeId,
      droppedOutcomeIds: cloneJson(accepted.droppedOutcomeIds),
      sourceAnchorRange: cloneJson(accepted.anchorRange),
      recordedAt: acceptedAt
    };
    ledger.invalidations = bounded([...ledger.invalidations, invalidation], LIMITS.applied);
    ledger.lastResult = {
      ok: true,
      action: 'acceptRecalculation',
      status: 'accepted',
      previewId: id,
      replacedOutcomeId: accepted.replacedOutcomeId,
      replacementOutcomeId: accepted.replacementOutcomeId,
      droppedOutcomeCount: accepted.droppedOutcomeIds.length,
      summary: accepted.summary
    };
    await writeLedger(ledger, accepted.summary);
    return { ok: true, preview: cloneJson(accepted), invalidation: cloneJson(invalidation), sceneReconciliation: current() };
  }

  async function cancelRecalculationPreview({ previewId, reason = 'preview-discarded' } = {}) {
    const id = compact(previewId);
    if (!id) return { ok: false, reason: 'preview-id-required' };
    const ledger = current();
    const index = ledger.recalculationPreviews.findIndex((item) => item.id === id);
    if (index < 0) return { ok: false, reason: 'preview-not-found' };
    if (ledger.recalculationPreviews[index].status === 'accepted') return { ok: false, reason: 'preview-already-accepted' };
    ledger.recalculationPreviews[index] = {
      ...ledger.recalculationPreviews[index],
      status: 'cancelled',
      cancelledAt: timestamp(now),
      cancellationReason: compact(reason) || 'preview-discarded'
    };
    ledger.lastResult = { ok: true, action: 'cancelRecalculation', status: 'cancelled', previewId: id, summary: 'Recalculation preview discarded without changing live mechanics.' };
    await writeLedger(ledger, ledger.lastResult.summary);
    return { ok: true, preview: cloneJson(ledger.recalculationPreviews[index]), sceneReconciliation: current() };
  }

  function staleReasons(proposal) {
    const state = getCampaignState();
    const reasons = [];
    const campaignId = state?.campaign?.id || state?.campaign?.templateCampaignId || null;
    const saveId = state?.campaign?.saveId || state?.saveId || null;
    if (proposal.campaignId && campaignId && proposal.campaignId !== campaignId) reasons.push('campaign-changed');
    if (proposal.saveId && saveId && proposal.saveId !== saveId) reasons.push('save-changed');
    const mechanics = stateDeltaGateway.mechanicsRevision?.() ?? 0;
    if (Number(proposal.baseMechanicsRevision) !== Number(mechanics)) reasons.push('mechanics-revision-changed');
    const all = recentMessages();
    if (all.length && proposal.sourceAnchorRange) {
      const resolved = resolveAnchorRange(all, proposal.sourceAnchorRange);
      if (resolved.stale) reasons.push(...resolved.reasons);
    }
    for (const outcomeId of asArray(proposal.outcomeIds)) {
      if (!asArray(state?.turnLedger?.entries).some((entry) => entry.outcomeId === outcomeId)) reasons.push(`outcome-missing:${outcomeId}`);
    }
    return unique(reasons);
  }

  async function applyPending({ proposalId = null } = {}) {
    const id = compact(proposalId);
    const ledger = current();
    const proposal = ledger.pending.find((item) => item.id === id && item.status === 'pending');
    if (!proposal) return { ok: false, reason: 'proposal-not-pending' };
    const reasons = staleReasons(proposal);
    if (reasons.length) {
      ledger.pending = ledger.pending.map((item) => item.id === id ? { ...item, status: 'stale', staleAt: timestamp(now), staleReasons: reasons } : item);
      ledger.lastResult = { ok: false, action: 'applyPending', proposalId: id, status: 'stale', summary: 'This proposal targets an older campaign or chat passage. Rerun reconciliation.' };
      await writeLedger(ledger, ledger.lastResult.summary);
      return { ok: false, reason: 'stale-proposal', staleReasons: reasons, sceneReconciliation: current() };
    }
    const rebased = { ...cloneJson(proposal), baseRevision: stateDeltaGateway.revision(), metadata: { ...(proposal.metadata || {}), explicitReviewAcceptance: true, rebasedFromRevision: proposal.baseRevision, rebaseReason: 'tracking-only-revision-drift' } };
    const result = await stateDeltaGateway.applyOperations(rebased, { allowedRoots: proposal.allowedRoots });
    const materialRoots = proposal.allowedRoots.filter((root) => root !== 'commandLog');
    let boundary = null;
    if (materialRoots.length) boundary = await runWorldBoundary(proposal.sourceAnchorRange, proposal.id);
    const next = current();
    next.pending = next.pending.map((item) => item.id === id ? { ...item, status: 'applied', resolvedAt: timestamp(now), appliedRevision: result.revision } : item);
    next.applied = bounded([...next.applied, { id, runId: proposal.runId, status: 'reviewApplied', summary: proposal.summary, appliedAt: timestamp(now), appliedRevision: result.revision, roots: proposal.allowedRoots, sourceAnchorRange: proposal.sourceAnchorRange }], LIMITS.applied);
    next.lastResult = { ok: true, action: 'applyPending', proposalId: id, summary: 'Pending reconciliation item applied.' };
    await writeLedger(next, next.lastResult.summary);
    return { ok: true, proposalId: id, appliedRevision: result.revision, worldBoundary: cloneJson(boundary?.diagnostics || null), sceneReconciliation: current() };
  }

  async function rejectPending({ proposalId = null } = {}) {
    const id = compact(proposalId);
    const ledger = current();
    const proposal = ledger.pending.find((item) => item.id === id && item.status === 'pending');
    if (!proposal) return { ok: false, reason: 'proposal-not-pending' };
    ledger.pending = ledger.pending.map((item) => item.id === id ? { ...item, status: 'rejected', resolvedAt: timestamp(now) } : item);
    ledger.rejected = bounded([...ledger.rejected, { id, runId: proposal.runId, summary: proposal.summary, rejectedAt: timestamp(now), sourceAnchorRange: proposal.sourceAnchorRange }], LIMITS.rejected);
    ledger.lastResult = { ok: true, action: 'rejectPending', proposalId: id, summary: 'Pending reconciliation item rejected.' };
    await writeLedger(ledger, ledger.lastResult.summary);
    return { ok: true, proposalId: id, sceneReconciliation: current() };
  }

  return {
    setStart: (payload) => setMarker('start', payload),
    setEnd: (payload) => setMarker('end', payload),
    reconcileMessage, reconcileFromHere, reconcileMarked, clearMarkers, recalculateFromHere,
    recordRecalculationPreview, acceptRecalculationPreview, cancelRecalculationPreview,
    openPending: async () => ({ ok: true, pending: current().pending.filter((item) => item.status === 'pending'), sceneReconciliation: current() }),
    applyPending, rejectPending
  };
}

export const __sceneReconciliationTestHooks = Object.freeze({
  normalizeAnchor, passageChunks, deterministicObservations, observationToProposal,
  operationAllowed, proposalRisk, dedupeProposals, resolveAnchorIndex
});
