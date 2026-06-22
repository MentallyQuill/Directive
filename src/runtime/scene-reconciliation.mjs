export const SCENE_RECONCILIATION_ACTION_IDS = Object.freeze({
  reconcileMessage: 'reconciliation.reconcileMessage',
  setStart: 'reconciliation.setStart',
  setEnd: 'reconciliation.setEnd',
  reconcileFromHere: 'reconciliation.reconcileFromHere',
  recalculateFromHere: 'reconciliation.recalculateFromHere',
  reconcileMarked: 'reconciliation.reconcileMarked',
  openPending: 'reconciliation.openPending',
  applyPending: 'reconciliation.applyPending',
  rejectPending: 'reconciliation.rejectPending'
});

export const SCENE_RECONCILIATION_TOOLTIPS = Object.freeze({
  reconcileMessage: 'Scan this message for Directive state changes. Safe updates may apply automatically; consequential changes need review. Does not replay later outcomes.',
  setStart: 'Mark this message as the start of a passage to reconcile.',
  setEnd: 'Mark this message as the end of a passage to reconcile.',
  reconcileFromHere: 'Scan from this message through the latest chat and reconcile Directive state to the changed passage. Does not rerun Mission Director outcomes.',
  recalculateFromHere: "Preview a replay from this point's pre-outcome snapshot. May replace or drop later outcomes, logs, sidecars, and state changes.",
  reconcileMarked: 'Reconcile the marked start and end passage. Missing markers will be reported without changing state.',
  openPending: 'Review consequential or conflicting reconciliation items that were not applied automatically.'
});

export const SCENE_RECONCILIATION_MESSAGE_ACTIONS = Object.freeze([
  {
    id: 'reconcileMessage',
    runtimeActionId: SCENE_RECONCILIATION_ACTION_IDS.reconcileMessage,
    label: 'Reconcile This Message',
    tooltip: SCENE_RECONCILIATION_TOOLTIPS.reconcileMessage,
    icon: 'fa-solid fa-magnifying-glass'
  },
  {
    id: 'setStart',
    runtimeActionId: SCENE_RECONCILIATION_ACTION_IDS.setStart,
    label: 'Set Reconciliation Start',
    tooltip: SCENE_RECONCILIATION_TOOLTIPS.setStart,
    icon: 'fa-solid fa-play'
  },
  {
    id: 'setEnd',
    runtimeActionId: SCENE_RECONCILIATION_ACTION_IDS.setEnd,
    label: 'Set Reconciliation End',
    tooltip: SCENE_RECONCILIATION_TOOLTIPS.setEnd,
    icon: 'fa-solid fa-stop'
  },
  {
    id: 'reconcileFromHere',
    runtimeActionId: SCENE_RECONCILIATION_ACTION_IDS.reconcileFromHere,
    label: 'Reconcile From Here',
    tooltip: SCENE_RECONCILIATION_TOOLTIPS.reconcileFromHere,
    icon: 'fa-solid fa-arrows-rotate'
  },
  {
    id: 'recalculateFromHere',
    runtimeActionId: SCENE_RECONCILIATION_ACTION_IDS.recalculateFromHere,
    label: 'Recalculate From Here',
    tooltip: SCENE_RECONCILIATION_TOOLTIPS.recalculateFromHere,
    icon: 'fa-solid fa-code-branch'
  }
]);

const RUN_LIMIT = 80;
const PENDING_LIMIT = 40;
const APPLIED_LIMIT = 120;
const MESSAGE_SCAN_LIMIT = 500;
const SAFE_AUTO_ROOTS = Object.freeze(['commandLog']);

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function compact(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function bounded(values, limit) {
  const source = Array.isArray(values) ? values : [];
  return source.slice(Math.max(0, source.length - Math.max(1, limit)));
}

function timestamp(now) {
  return typeof now === 'function' ? now() : new Date().toISOString();
}

export function stableTextHash(value) {
  const text = String(value || '');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `h${(hash >>> 0).toString(36)}`;
}

function textPreview(value, limit = 180) {
  const text = compact(value);
  return text.length > limit ? `${text.slice(0, limit - 1)}...` : text;
}

function normalizeMessage(message = {}) {
  if (!isObject(message)) return null;
  const text = String(message.text ?? message.mes ?? message.content ?? '');
  const hostMessageId = compact(message.hostMessageId || message.id || message.messageId || message.message_id);
  const index = Number.isInteger(message.index)
    ? message.index
    : (Number.isInteger(Number(message.index)) ? Number(message.index) : null);
  return {
    hostMessageId: hostMessageId || (index !== null ? String(index) : null),
    id: hostMessageId || (index !== null ? String(index) : null),
    index,
    chatId: compact(message.chatId || message.chat_id) || null,
    text,
    textHash: stableTextHash(text),
    textPreview: textPreview(text),
    isUser: message.isUser === true || message.is_user === true || message.role === 'user',
    isSystem: message.isSystem === true || message.is_system === true || message.role === 'system',
    isDirectiveOwned: message.isDirectiveOwned === true || message.directiveOwned === true,
    metadata: cloneJson(message.metadata || null)
  };
}

function normalizeAnchor(anchor = null) {
  if (!isObject(anchor)) return null;
  return {
    hostMessageId: compact(anchor.hostMessageId) || null,
    chatId: compact(anchor.chatId) || null,
    index: Number.isInteger(anchor.index) ? anchor.index : null,
    textHash: compact(anchor.textHash) || null,
    textPreview: compact(anchor.textPreview).slice(0, 240),
    capturedAt: anchor.capturedAt || null,
    ingressId: compact(anchor.ingressId) || null,
    turnId: compact(anchor.turnId) || null,
    outcomeId: compact(anchor.outcomeId) || null
  };
}

function anchorFromMessage(message, state, now) {
  const normalized = normalizeMessage(message);
  if (!normalized) return null;
  const ingress = findIngressForMessage(state, normalized);
  return normalizeAnchor({
    hostMessageId: normalized.hostMessageId,
    chatId: normalized.chatId || ingress?.chatId || state?.campaignChatBinding?.chatId || null,
    index: normalized.index,
    textHash: normalized.textHash,
    textPreview: normalized.textPreview,
    capturedAt: timestamp(now),
    ingressId: ingress?.id || null,
    turnId: ingress?.turnId || null,
    outcomeId: ingress?.outcomeId || null
  });
}

function normalizeSceneReconciliationState(value = {}) {
  const input = isObject(value) ? value : {};
  return {
    schemaVersion: 1,
    markers: {
      start: normalizeAnchor(input.markers?.start),
      end: normalizeAnchor(input.markers?.end)
    },
    runs: bounded(input.runs, RUN_LIMIT).map((run) => cloneJson(run)),
    pending: bounded(input.pending, PENDING_LIMIT).map((item) => cloneJson(item)),
    applied: bounded(input.applied, APPLIED_LIMIT).map((item) => cloneJson(item)),
    lastRunId: compact(input.lastRunId) || null,
    lastResult: cloneJson(input.lastResult || null)
  };
}

export function sceneReconciliationState(campaignState) {
  return normalizeSceneReconciliationState(campaignState?.runtimeTracking?.sceneReconciliation);
}

function findIngressForMessage(state, message) {
  const ledger = Array.isArray(state?.runtimeTracking?.ingressLedger)
    ? state.runtimeTracking.ingressLedger
    : [];
  const hostMessageId = compact(message?.hostMessageId || message?.id);
  const textHash = compact(message?.textHash);
  return ledger.find((entry) => (
    hostMessageId
    && String(entry.hostMessageId || '') === hostMessageId
  )) || ledger.find((entry) => (
    textHash
    && String(entry.textHash || '') === textHash
  )) || null;
}

function proposalRoots(proposal = {}) {
  const operations = Array.isArray(proposal.operations) ? proposal.operations : [];
  return [...new Set(operations
    .map((operation) => String(operation?.path || '').split('.')[0].trim())
    .filter(Boolean))];
}

function classifyProposalRisk(proposal = {}) {
  if (proposal.risk === 'conflict' || proposal.conflict === true) return 'review';
  const roots = proposalRoots(proposal);
  if (!roots.length) return 'safe';
  if (proposal.risk !== 'safe') return 'review';
  if (Number(proposal.confidence || 0) < 0.8) return 'review';
  return roots.every((root) => SAFE_AUTO_ROOTS.includes(root)) ? 'safe' : 'review';
}

function sanitizeId(value, fallback = 'phase') {
  const id = compact(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return id || fallback;
}

function stripTrailingSentenceNoise(value) {
  return compact(value).replace(/[.?!]+$/g, '').trim();
}

function extractAfterLabel(text, labelPattern) {
  const match = String(text || '').match(labelPattern);
  if (!match) return '';
  return stripTrailingSentenceNoise(match[1] || '');
}

function commandLogProposal({ message, runId, proposalId, baseRevision, now }) {
  const summary = extractAfterLabel(message.text, /(?:^|\n)\s*(?:command\s+log|log)\s*:\s*([^\n]+)/i);
  if (!summary) return null;
  return {
    id: proposalId,
    runId,
    source: 'sceneReconciliation',
    workerId: 'scene-reconciliation-local',
    risk: 'safe',
    confidence: 0.9,
    summary: `Record chat passage in the command log: ${summary}`,
    baseRevision,
    allowedRoots: ['commandLog'],
    operations: [
      {
        op: 'append',
        path: 'commandLog.entries',
        value: {
          sourceOutcomeId: null,
          source: 'sceneReconciliation',
          sourceMessageId: message.hostMessageId,
          recordedAt: timestamp(now),
          summaryInputs: [summary],
          visibleConsequences: [summary]
        }
      }
    ],
    anchor: anchorFromMessage(message, null, now)
  };
}

function shipStatusProposal({ message, runId, proposalId, baseRevision, now }) {
  const condition = extractAfterLabel(message.text, /(?:^|\n)\s*(?:ship\s+(?:status|condition))\s*:\s*([^\n]+)/i);
  if (!condition) return null;
  return {
    id: proposalId,
    runId,
    source: 'sceneReconciliation',
    workerId: 'scene-reconciliation-local',
    risk: 'consequential',
    confidence: 0.82,
    summary: `Update ship condition from changed chat passage: ${condition}`,
    baseRevision,
    allowedRoots: ['ship'],
    operations: [
      {
        op: 'set',
        path: 'ship.condition',
        value: condition
      }
    ],
    anchor: anchorFromMessage(message, null, now)
  };
}

function missionPhaseProposal({ message, runId, proposalId, baseRevision, now }) {
  const phase = extractAfterLabel(message.text, /(?:^|\n)\s*(?:mission\s+(?:phase|status))\s*:\s*([^\n]+)/i);
  if (!phase) return null;
  return {
    id: proposalId,
    runId,
    source: 'sceneReconciliation',
    workerId: 'scene-reconciliation-local',
    risk: 'consequential',
    confidence: 0.8,
    summary: `Update mission phase from changed chat passage: ${phase}`,
    baseRevision,
    allowedRoots: ['mission'],
    operations: [
      {
        op: 'set',
        path: 'mission.activePhaseId',
        value: sanitizeId(phase)
      },
      {
        op: 'set',
        path: 'mission.phase',
        value: phase
      }
    ],
    anchor: anchorFromMessage(message, null, now)
  };
}

function buildProposals({ messages, runId, baseRevision, idFactory, now }) {
  const proposals = [];
  for (const message of messages) {
    const normalized = normalizeMessage(message);
    if (!normalized || !compact(normalized.text) || normalized.isSystem) continue;
    const context = {
      message: normalized,
      runId,
      baseRevision,
      now,
      proposalId: idFactory('recon-proposal')
    };
    for (const factory of [commandLogProposal, shipStatusProposal, missionPhaseProposal]) {
      const proposal = factory(context);
      if (proposal) proposals.push(proposal);
    }
  }
  return proposals;
}

function actionSummary(action) {
  if (action === 'recalculateFromHere') return 'Recalculate From Here preview prepared.';
  if (action === 'reconcileFromHere') return 'Reconciled chat passage from selected message.';
  if (action === 'reconcileMarked') return 'Reconciled marked chat passage.';
  if (action === 'reconcileMessage') return 'Reconciled selected message.';
  return 'Scene reconciliation updated.';
}

function indexedRange(messages, startAnchor = null, endAnchor = null) {
  const source = Array.isArray(messages) ? messages.map(normalizeMessage).filter(Boolean) : [];
  if (!source.length) return [];
  const startId = compact(startAnchor?.hostMessageId);
  const endId = compact(endAnchor?.hostMessageId);
  let startIndex = source.findIndex((message) => startId && message.hostMessageId === startId);
  let endIndex = source.findIndex((message) => endId && message.hostMessageId === endId);
  if (startIndex < 0 && Number.isInteger(startAnchor?.index)) {
    startIndex = source.findIndex((message) => Number(message.index) >= Number(startAnchor.index));
  }
  if (endIndex < 0 && Number.isInteger(endAnchor?.index)) {
    endIndex = source.findIndex((message) => Number(message.index) >= Number(endAnchor.index));
  }
  if (startIndex < 0) startIndex = 0;
  if (endIndex < 0) endIndex = source.length - 1;
  if (endIndex < startIndex) [startIndex, endIndex] = [endIndex, startIndex];
  return source.slice(startIndex, endIndex + 1);
}

function rangeHash(messages = []) {
  return stableTextHash(messages.map((message) => `${message.hostMessageId || ''}:${message.textHash || stableTextHash(message.text)}`).join('|'));
}

function anchorRangeFor(messages, startAnchor = null, endAnchor = null) {
  const normalized = messages.map(normalizeMessage).filter(Boolean);
  return {
    start: normalizeAnchor(startAnchor) || anchorFromMessage(normalized[0], null, null),
    end: normalizeAnchor(endAnchor) || anchorFromMessage(normalized.at(-1), null, null),
    messageCount: normalized.length,
    rangeHash: rangeHash(normalized)
  };
}

function findOutcomeForAnchor(state, anchor) {
  const normalized = normalizeAnchor(anchor);
  if (normalized?.outcomeId) return normalized.outcomeId;
  const ingress = findIngressForMessage(state, normalized);
  if (ingress?.outcomeId) return ingress.outcomeId;
  const responses = Array.isArray(state?.runtimeTracking?.responseLedger)
    ? state.runtimeTracking.responseLedger
    : [];
  const response = responses.find((entry) => (
    normalized?.hostMessageId
    && String(entry.hostMessageId || '') === String(normalized.hostMessageId)
  ));
  if (response?.outcomeId) return response.outcomeId;
  return null;
}

export function createSceneReconciliationService({
  getCampaignState,
  stateDeltaGateway,
  host = null,
  now = null,
  idFactory = null
} = {}) {
  if (typeof getCampaignState !== 'function') throw new Error('getCampaignState must be a function');
  if (!stateDeltaGateway?.applyOperations) throw new Error('stateDeltaGateway.applyOperations is required');
  const makeId = typeof idFactory === 'function'
    ? idFactory
    : (prefix = 'recon') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  async function applyTrackingOperations(operations, summary) {
    const proposal = {
      id: makeId('recon-tracking'),
      source: 'sceneReconciliation',
      workerId: 'scene-reconciliation-ledger',
      summary,
      baseRevision: stateDeltaGateway.revision(),
      allowedRoots: ['runtimeTracking'],
      operations
    };
    return stateDeltaGateway.applyOperations(proposal, { allowedRoots: ['runtimeTracking'] });
  }

  async function setSceneReconciliationState(nextState, summary) {
    return applyTrackingOperations([
      {
        op: 'set',
        path: 'runtimeTracking.sceneReconciliation',
        value: normalizeSceneReconciliationState(nextState)
      }
    ], summary);
  }

  function currentSceneState() {
    return sceneReconciliationState(getCampaignState());
  }

  function resolveMessage(payload = {}) {
    const input = isObject(payload?.message) ? payload.message : payload;
    const hostMessageId = compact(input?.hostMessageId || input?.id || input?.messageId || input?.message_id);
    const byId = hostMessageId && typeof host?.chat?.getMessage === 'function'
      ? host.chat.getMessage(hostMessageId)
      : null;
    if (byId) return normalizeMessage(byId);
    if (typeof host?.chat?.normalizeMessagePayload === 'function') {
      const normalized = host.chat.normalizeMessagePayload(input);
      if (normalized) return normalizeMessage(normalized);
    }
    return normalizeMessage(input);
  }

  function recentMessages() {
    if (typeof host?.chat?.getRecentMessages === 'function') {
      return host.chat.getRecentMessages({
        limit: MESSAGE_SCAN_LIMIT,
        playerSafeOnly: true
      }).map(normalizeMessage).filter(Boolean);
    }
    return [];
  }

  async function setMarker(kind, payload = {}) {
    const markerKind = kind === 'end' ? 'end' : 'start';
    const state = getCampaignState();
    const message = resolveMessage(payload);
    if (!message) return { ok: false, reason: 'message-unavailable' };
    const anchor = anchorFromMessage(message, state, now);
    const next = currentSceneState();
    next.markers[markerKind] = anchor;
    next.lastResult = {
      ok: true,
      action: markerKind === 'start' ? 'setStart' : 'setEnd',
      summary: markerKind === 'start'
        ? 'Reconciliation start marker set.'
        : 'Reconciliation end marker set.',
      anchor
    };
    await setSceneReconciliationState(next, next.lastResult.summary);
    return {
      ok: true,
      marker: markerKind,
      anchor: cloneJson(anchor),
      sceneReconciliation: currentSceneState()
    };
  }

  async function executeReconciliation({ action, messages, anchorRange }) {
    const normalizedMessages = (Array.isArray(messages) ? messages : []).map(normalizeMessage).filter(Boolean);
    const sceneState = currentSceneState();
    const runId = makeId('recon-run');
    const run = {
      id: runId,
      action,
      status: 'running',
      startedAt: timestamp(now),
      anchorRange: cloneJson(anchorRange),
      messageCount: normalizedMessages.length
    };
    sceneState.runs = bounded([...sceneState.runs, run], RUN_LIMIT);
    sceneState.lastRunId = runId;
    sceneState.lastResult = {
      ok: true,
      action,
      status: 'running',
      summary: actionSummary(action),
      messageCount: normalizedMessages.length
    };
    await setSceneReconciliationState(sceneState, `Scene reconciliation started: ${action}.`);

    const proposals = buildProposals({
      messages: normalizedMessages,
      runId,
      baseRevision: stateDeltaGateway.revision(),
      idFactory: makeId,
      now
    });
    const applied = [];
    const pending = [];
    const errors = [];

    for (const proposal of proposals) {
      proposal.baseRevision = stateDeltaGateway.revision();
      const risk = classifyProposalRisk(proposal);
      if (risk === 'safe') {
        try {
          const result = await stateDeltaGateway.applyOperations(proposal, {
            allowedRoots: proposal.allowedRoots || proposalRoots(proposal)
          });
          applied.push({
            id: proposal.id,
            runId,
            status: 'autoApplied',
            summary: proposal.summary,
            appliedAt: timestamp(now),
            appliedRevision: result.revision || null,
            operationCount: Array.isArray(proposal.operations) ? proposal.operations.length : 0,
            roots: proposalRoots(proposal)
          });
        } catch (error) {
          pending.push({
            ...cloneJson(proposal),
            status: 'pending',
            reviewReason: error?.code === 'DIRECTIVE_STATE_REVISION_CONFLICT'
              ? 'stale'
              : 'autoApplyFailed',
            error: {
              code: error?.code || null,
              message: error?.message || String(error)
            },
            createdAt: timestamp(now)
          });
        }
      } else {
        pending.push({
          ...cloneJson(proposal),
          status: 'pending',
          reviewReason: proposal.risk === 'consequential' ? 'consequential' : 'needsReview',
          createdAt: timestamp(now)
        });
      }
    }

    const after = currentSceneState();
    const completedRun = {
      ...run,
      status: errors.length ? 'completedWithErrors' : 'completed',
      completedAt: timestamp(now),
      proposalCount: proposals.length,
      autoAppliedCount: applied.length,
      pendingCount: pending.length,
      errorCount: errors.length
    };
    after.runs = bounded([
      ...after.runs.filter((entry) => entry.id !== runId),
      completedRun
    ], RUN_LIMIT);
    after.applied = bounded([...after.applied, ...applied], APPLIED_LIMIT);
    after.pending = bounded([
      ...after.pending.filter((entry) => !pending.some((item) => item.id === entry.id)),
      ...pending
    ], PENDING_LIMIT);
    after.lastRunId = runId;
    after.lastResult = {
      ok: errors.length === 0,
      action,
      runId,
      status: completedRun.status,
      summary: proposals.length
        ? `${applied.length} safe update${applied.length === 1 ? '' : 's'} applied; ${pending.length} item${pending.length === 1 ? '' : 's'} pending review.`
        : 'No Directive state changes were detected in the selected chat passage.',
      messageCount: normalizedMessages.length,
      proposalCount: proposals.length,
      autoAppliedCount: applied.length,
      pendingCount: pending.length,
      errors
    };
    await setSceneReconciliationState(after, `Scene reconciliation completed: ${action}.`);
    return {
      ok: errors.length === 0,
      run: cloneJson(completedRun),
      applied: cloneJson(applied),
      pending: cloneJson(pending),
      summary: after.lastResult.summary,
      sceneReconciliation: currentSceneState()
    };
  }

  async function reconcileMessage(payload = {}) {
    const message = resolveMessage(payload);
    if (!message) return { ok: false, reason: 'message-unavailable' };
    return executeReconciliation({
      action: 'reconcileMessage',
      messages: [message],
      anchorRange: anchorRangeFor([message], anchorFromMessage(message, getCampaignState(), now))
    });
  }

  async function reconcileFromHere(payload = {}) {
    const message = resolveMessage(payload);
    if (!message) return { ok: false, reason: 'message-unavailable' };
    const start = anchorFromMessage(message, getCampaignState(), now);
    const messages = indexedRange(recentMessages(), start, null);
    return executeReconciliation({
      action: 'reconcileFromHere',
      messages: messages.length ? messages : [message],
      anchorRange: anchorRangeFor(messages.length ? messages : [message], start, null)
    });
  }

  async function reconcileMarked() {
    const sceneState = currentSceneState();
    const start = normalizeAnchor(sceneState.markers.start);
    const end = normalizeAnchor(sceneState.markers.end);
    if (!start || !end) {
      const next = currentSceneState();
      next.lastResult = {
        ok: false,
        action: 'reconcileMarked',
        status: 'missingMarkers',
        summary: 'Set both a reconciliation start and end before reconciling the marked passage.'
      };
      await setSceneReconciliationState(next, 'Marked reconciliation could not start.');
      return {
        ok: false,
        reason: 'missing-markers',
        sceneReconciliation: currentSceneState()
      };
    }
    const messages = indexedRange(recentMessages(), start, end);
    return executeReconciliation({
      action: 'reconcileMarked',
      messages,
      anchorRange: anchorRangeFor(messages, start, end)
    });
  }

  async function recalculateFromHere(payload = {}) {
    const state = getCampaignState();
    const message = resolveMessage(payload);
    if (!message) return { ok: false, reason: 'message-unavailable' };
    const anchor = anchorFromMessage(message, state, now);
    const outcomeId = findOutcomeForAnchor(state, anchor);
    const ledgerEntry = outcomeId
      ? (state?.turnLedger?.entries || []).find((entry) => entry.outcomeId === outcomeId)
      : null;
    const next = currentSceneState();
    next.lastResult = {
      ok: Boolean(outcomeId && ledgerEntry?.snapshotBefore),
      action: 'recalculateFromHere',
      status: outcomeId && ledgerEntry?.snapshotBefore ? 'previewAvailable' : 'stop',
      summary: outcomeId && ledgerEntry?.snapshotBefore
        ? 'A pre-outcome snapshot is available for recalculation preview.'
        : 'Directive could not find a pre-outcome snapshot for this message.',
      anchor,
      outcomeId: outcomeId || null,
      destructive: true
    };
    await setSceneReconciliationState(next, 'Recalculate From Here inspected selected anchor.');
    return {
      ok: next.lastResult.ok,
      action: 'recalculateFromHere',
      status: next.lastResult.status,
      anchor: cloneJson(anchor),
      outcomeId: outcomeId || null,
      hasSnapshotBefore: Boolean(ledgerEntry?.snapshotBefore),
      sceneReconciliation: currentSceneState()
    };
  }

  async function openPending() {
    return {
      ok: true,
      pending: currentSceneState().pending.filter((item) => item.status === 'pending'),
      sceneReconciliation: currentSceneState()
    };
  }

  async function applyPending({ proposalId = null } = {}) {
    const id = compact(proposalId);
    if (!id) return { ok: false, reason: 'missing-proposal-id' };
    const sceneState = currentSceneState();
    const proposal = sceneState.pending.find((item) => item.id === id && item.status === 'pending');
    if (!proposal) return { ok: false, reason: 'proposal-not-pending' };
    proposal.baseRevision = stateDeltaGateway.revision();
    const result = await stateDeltaGateway.applyOperations(proposal, {
      allowedRoots: proposal.allowedRoots || proposalRoots(proposal)
    });
    const next = currentSceneState();
    next.pending = next.pending.map((item) => item.id === id
      ? {
          ...item,
          status: 'applied',
          resolvedAt: timestamp(now),
          appliedRevision: result.revision || null
        }
      : item);
    next.applied = bounded([
      ...next.applied,
      {
        id,
        runId: proposal.runId || null,
        status: 'reviewApplied',
        summary: proposal.summary,
        appliedAt: timestamp(now),
        appliedRevision: result.revision || null,
        operationCount: Array.isArray(proposal.operations) ? proposal.operations.length : 0,
        roots: proposalRoots(proposal)
      }
    ], APPLIED_LIMIT);
    next.lastResult = {
      ok: true,
      action: 'applyPending',
      proposalId: id,
      summary: 'Pending reconciliation item applied.'
    };
    await setSceneReconciliationState(next, 'Pending reconciliation item applied.');
    return {
      ok: true,
      proposalId: id,
      appliedRevision: result.revision || null,
      sceneReconciliation: currentSceneState()
    };
  }

  async function rejectPending({ proposalId = null } = {}) {
    const id = compact(proposalId);
    if (!id) return { ok: false, reason: 'missing-proposal-id' };
    const next = currentSceneState();
    let found = false;
    next.pending = next.pending.map((item) => {
      if (item.id !== id || item.status !== 'pending') return item;
      found = true;
      return {
        ...item,
        status: 'rejected',
        resolvedAt: timestamp(now)
      };
    });
    if (!found) return { ok: false, reason: 'proposal-not-pending' };
    next.lastResult = {
      ok: true,
      action: 'rejectPending',
      proposalId: id,
      summary: 'Pending reconciliation item rejected.'
    };
    await setSceneReconciliationState(next, 'Pending reconciliation item rejected.');
    return {
      ok: true,
      proposalId: id,
      sceneReconciliation: currentSceneState()
    };
  }

  return {
    setStart: (payload) => setMarker('start', payload),
    setEnd: (payload) => setMarker('end', payload),
    reconcileMessage,
    reconcileFromHere,
    reconcileMarked,
    recalculateFromHere,
    openPending,
    applyPending,
    rejectPending
  };
}
