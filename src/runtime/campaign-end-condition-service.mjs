import {
  applyPushOnContinuationFrame,
  createConclusionMetadataFromDetection,
  detectCampaignEndCondition
} from '../campaign/end-conditions.mjs';
import {
  initializeCampaignRuntimeTracking,
  recordPendingInteraction,
  resolvePendingInteraction
} from './state-delta-gateway.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function compact(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function timestamp(now) {
  return typeof now === 'function' ? now() : (now || new Date().toISOString());
}

function endConditionLedger(state) {
  const tracking = state.runtimeTracking || {};
  const input = isObject(tracking.endConditionLedger) ? tracking.endConditionLedger : {};
  return {
    schemaVersion: 1,
    activeDecisionId: input.activeDecisionId || null,
    detections: Array.isArray(input.detections) ? cloneJson(input.detections) : [],
    decisions: Array.isArray(input.decisions) ? cloneJson(input.decisions) : [],
    branchRecords: Array.isArray(input.branchRecords) ? cloneJson(input.branchRecords) : [],
    continuationFrames: Array.isArray(input.continuationFrames) ? cloneJson(input.continuationFrames) : []
  };
}

function withLedger(state, ledger) {
  return {
    ...cloneJson(state),
    runtimeTracking: {
      ...(state.runtimeTracking || {}),
      endConditionLedger: cloneJson(ledger)
    }
  };
}

function detectionRecord(detection) {
  return {
    id: detection.id,
    decisionId: detection.decisionId,
    conditionId: detection.conditionId,
    family: detection.family,
    severity: detection.severity,
    simulationMode: detection.simulationMode,
    detectedAt: detection.detectedAt,
    turnId: detection.turnId || null,
    outcomeId: detection.outcomeId || null,
    terminalOutcomeBand: detection.terminalOutcomeBand,
    finalCampaignBand: detection.finalCampaignBand,
    checkpoint: cloneJson(detection.checkpoint || null)
  };
}

function decisionRecord(detection) {
  return {
    id: detection.decisionId,
    detectionId: detection.id,
    conditionId: detection.conditionId,
    status: 'pending',
    createdAt: detection.detectedAt,
    turnId: detection.turnId || null,
    outcomeId: detection.outcomeId || null,
    terminalOutcomeBand: detection.terminalOutcomeBand,
    finalCampaignBand: detection.finalCampaignBand,
    finalCampaignBandSummary: detection.finalCampaignBandSummary,
    checkpoint: cloneJson(detection.checkpoint || null),
    playerFacingSummary: detection.condition?.playerFacingSummary || null,
    condition: cloneJson(detection.condition || null),
    postedAt: null,
    resolvedAt: null,
    resolution: null,
    savedBranchIds: []
  };
}

function upsertDecision(ledger, decisionId, patch = {}) {
  const decisions = ledger.decisions.map((decision) => (
    decision.id === decisionId ? { ...decision, ...cloneJson(patch) } : decision
  ));
  return {
    ...ledger,
    decisions
  };
}

const TERMINAL_OUTCOME_ACTION_LABELS = Object.freeze({
  replayFromCheckpoint: 'Replay from checkpoint',
  pushOn: 'Push On',
  keepEnding: 'Keep this ending',
  saveTerminalBranch: 'Save as branch'
});

const DEFAULT_TERMINAL_OUTCOME_ACTIONS = Object.freeze([
  'replayFromCheckpoint',
  'pushOn',
  'keepEnding',
  'saveTerminalBranch'
]);

function terminalOptionsFromDecision(decision = {}) {
  const actions = Array.isArray(decision?.condition?.resolutionPolicy?.actions)
    && decision.condition.resolutionPolicy.actions.length
    ? decision.condition.resolutionPolicy.actions
    : DEFAULT_TERMINAL_OUTCOME_ACTIONS;
  return actions.map((action) => ({
    id: action,
    action,
    label: TERMINAL_OUTCOME_ACTION_LABELS[action] || action
  }));
}

function interactionFromDecision(decision = {}) {
  if (!decision?.id) return null;
  return {
    id: decision.id,
    kind: 'terminalOutcomeDecision',
    status: 'pending',
    ingressId: decision.ingressId || null,
    turnId: decision.turnId || null,
    outcomeId: decision.outcomeId || null,
    prompt: 'Directive Checkpoint',
    options: terminalOptionsFromDecision(decision),
    metadata: {
      decisionId: decision.id,
      terminalOutcomeId: decision.conditionId || decision.condition?.id || null,
      terminalOutcomeBand: decision.terminalOutcomeBand || null,
      finalCampaignBandCandidate: decision.finalCampaignBand || null,
      reason: decision.playerFacingSummary || decision.finalCampaignBandSummary || null
    }
  };
}

function activeTerminalInteraction(state, interactionId = null) {
  const pending = (state.runtimeTracking?.pendingInteractions || []).find((entry) => (
    entry.status === 'pending'
    && entry.kind === 'terminalOutcomeDecision'
    && (!interactionId || entry.id === interactionId)
  )) || null;
  if (pending) return pending;
  const ledger = endConditionLedger(state);
  const decision = ledger.decisions.find((entry) => (
    entry?.status === 'pending'
    && (
      (interactionId && entry.id === interactionId)
      || (!interactionId && entry.id === ledger.activeDecisionId)
    )
  )) || ledger.decisions.find((entry) => entry?.status === 'pending' && !interactionId);
  return interactionFromDecision(decision);
}

function decisionForInteraction(state, interaction) {
  const decisionId = interaction?.id || interaction?.metadata?.decisionId || null;
  const ledger = endConditionLedger(state);
  return ledger.decisions.find((decision) => decision.id === decisionId)
    || ledger.decisions.find((decision) => decision.id === ledger.activeDecisionId)
    || null;
}

function checkpointSnapshot(state, decision) {
  const outcomeId = decision?.checkpoint?.outcomeId || decision?.outcomeId || null;
  const entry = (state.turnLedger?.entries || []).find((item) => item?.outcomeId === outcomeId);
  if (entry?.snapshotBefore) return cloneJson(entry.snapshotBefore);
  const history = Array.isArray(state.runtimeTracking?.history) ? state.runtimeTracking.history : [];
  const outcomeEntry = outcomeId
    ? [...history].reverse().find((item) => item?.outcomeId === outcomeId && item?.snapshot)
    : null;
  if (outcomeEntry?.snapshot) return cloneJson(outcomeEntry.snapshot);
  const lastStableRevision = Number(state.runtimeTracking?.lastStableRevision);
  const stableEntry = Number.isFinite(lastStableRevision)
    ? [...history].reverse().find((item) => Number(item?.revision) < lastStableRevision && item?.snapshot)
    : null;
  if (stableEntry?.snapshot) return cloneJson(stableEntry.snapshot);
  return cloneJson([...history].reverse().find((item) => item?.snapshot)?.snapshot || null);
}

function checkpointText(interaction) {
  const metadata = interaction?.metadata || {};
  const lines = [
    'Directive Checkpoint',
    '',
    `This is a terminal outcome: ${metadata.terminalOutcomeBand || 'Unknown'}.`,
    metadata.reason ? `Reason: ${metadata.reason}` : null,
    '',
    ...(interaction.options || []).map((option) => option.label || option.action || option.id).filter(Boolean)
  ];
  return lines.filter((line) => line !== null && line !== undefined).join('\n').trim();
}

export function createCampaignEndConditionService({
  host = null,
  getCampaignState,
  setCampaignState,
  getPackageContext,
  persist = null,
  syncPrompt = null,
  saveTerminalBranch = null,
  concludeCampaign = null,
  now = null
} = {}) {
  if (typeof getCampaignState !== 'function') throw new Error('getCampaignState must be a function');
  if (typeof setCampaignState !== 'function') throw new Error('setCampaignState must be a function');
  if (typeof getPackageContext !== 'function') throw new Error('getPackageContext must be a function');

  async function persistState(state, summary) {
    setCampaignState(state);
    if (typeof persist === 'function') await persist(state, summary);
    return state;
  }

  async function syncStatePrompt(state, reason) {
    if (typeof syncPrompt !== 'function') return state;
    const result = await syncPrompt(state, reason);
    return result?.campaignState || result || state;
  }

  async function evaluateCommittedTurn({ turnPacket = null, ingressId = null } = {}) {
    let state = initializeCampaignRuntimeTracking(getCampaignState());
    const outcomeId = turnPacket?.outcomePacket?.id || state.turnLedger?.lastCommittedOutcomeId || null;
    const turnId = turnPacket?.turnId || turnPacket?.id || null;
    const detection = detectCampaignEndCondition({
      campaignState: state,
      packageContext: getPackageContext(),
      outcomeId,
      turnId,
      ingressId,
      now
    });
    if (!detection?.matched) return { ok: true, detection: cloneJson(detection || null), campaignState: cloneJson(state) };

    let ledger = endConditionLedger(state);
    if (ledger.decisions.some((decision) => decision.id === detection.decisionId && decision.status === 'pending')) {
      return { ok: true, duplicate: true, detection: cloneJson(detection), campaignState: cloneJson(state) };
    }
    ledger = {
      ...ledger,
      activeDecisionId: detection.decisionId,
      detections: [...ledger.detections, detectionRecord(detection)],
      decisions: [...ledger.decisions, decisionRecord(detection)]
    };
    state = withLedger(state, ledger);
    state = recordPendingInteraction(state, {
      ...detection.pendingInteraction,
      metadata: {
        ...detection.pendingInteraction.metadata,
        decisionId: detection.decisionId
      },
      details: {
        detectionId: detection.id,
        conditionId: detection.conditionId
      }
    });
    await persistState(state, `Recorded terminal outcome decision ${detection.conditionId}.`);
    return {
      ok: true,
      detection: cloneJson(detection),
      pendingInteraction: cloneJson(detection.pendingInteraction),
      campaignState: cloneJson(state)
    };
  }

  async function postCheckpointDecision({ interactionId = null } = {}) {
    let state = initializeCampaignRuntimeTracking(getCampaignState());
    const interaction = activeTerminalInteraction(state, interactionId);
    if (!interaction) return { ok: false, reason: 'terminal-decision-not-pending' };
    const decision = decisionForInteraction(state, interaction);
    if (decision?.postedAt) return { ok: true, duplicate: true, interaction: cloneJson(interaction), campaignState: cloneJson(state) };
    if (typeof host?.chat?.postAssistantMessage !== 'function') {
      return { ok: false, reason: 'host-chat-post-unavailable' };
    }
    const posted = await host.chat.postAssistantMessage({
      text: checkpointText(interaction),
      campaignId: state.campaign?.id,
      responseKind: 'terminalOutcomeCheckpoint',
      idempotencyKey: `${interaction.id}:checkpoint`
    });
    const ledger = upsertDecision(endConditionLedger(state), interaction.id, {
      postedAt: timestamp(now),
      checkpointMessageId: posted?.hostMessageId || null
    });
    state = withLedger(state, ledger);
    await persistState(state, `Posted terminal outcome checkpoint ${interaction.id}.`);
    return { ok: true, posted: cloneJson(posted || null), interaction: cloneJson(interaction), campaignState: cloneJson(state) };
  }

  async function replayFromCheckpoint({ interaction, decision }) {
    const current = initializeCampaignRuntimeTracking(getCampaignState());
    const snapshot = checkpointSnapshot(current, decision);
    if (!snapshot) return { ok: false, reason: 'checkpoint-snapshot-not-retained' };
    const currentLedger = endConditionLedger(current);
    const restoredLedger = {
      ...currentLedger,
      activeDecisionId: null,
      decisions: currentLedger.decisions.map((item) => item.id === decision.id
        ? {
            ...item,
            status: 'replayed',
            resolvedAt: timestamp(now),
            resolution: { action: 'replayFromCheckpoint' }
          }
        : item)
    };
    let restored = initializeCampaignRuntimeTracking(snapshot);
    restored.runtimeTracking = {
      ...(restored.runtimeTracking || {}),
      endConditionLedger: restoredLedger,
      pendingInteractions: (restored.runtimeTracking?.pendingInteractions || []).filter((entry) => entry.id !== interaction.id)
    };
    restored = await persistState(restored, `Replayed from terminal outcome checkpoint ${decision.id}.`);
    restored = await syncStatePrompt(restored, 'Prompt context rebuilt after terminal checkpoint replay.');
    return { ok: true, action: 'replayFromCheckpoint', campaignState: cloneJson(restored) };
  }

  async function pushOn({ interaction, decision, frameId = null, playerArgument = null }) {
    const selectedFrameId = frameId || decision.condition?.continuationFrameIds?.[0] || null;
    if (!selectedFrameId) return { ok: false, reason: 'continuation-frame-not-available' };
    const applied = applyPushOnContinuationFrame({
      campaignState: getCampaignState(),
      packageContext: getPackageContext(),
      frameId: selectedFrameId,
      decisionId: decision.id,
      conditionId: decision.conditionId,
      now
    });
    let state = initializeCampaignRuntimeTracking(applied.campaignState);
    let ledger = endConditionLedger(state);
    ledger = {
      ...ledger,
      activeDecisionId: null,
      decisions: ledger.decisions.map((item) => item.id === decision.id
        ? {
            ...item,
            status: 'pushedOn',
            resolvedAt: timestamp(now),
            resolution: { action: 'pushOn', frameId: selectedFrameId, playerArgument: compact(playerArgument) || null }
          }
        : item)
    };
    state = withLedger(state, ledger);
    state = resolvePendingInteraction(state, interaction.id, {
      status: 'resolved',
      action: 'pushOn',
      frameId: selectedFrameId,
      resolvedAt: timestamp(now)
    });
    await persistState(state, `Accepted terminal Push On frame ${selectedFrameId}.`);
    state = await syncStatePrompt(state, 'Prompt context rebuilt after terminal Push On.');
    return { ok: true, action: 'pushOn', frame: cloneJson(applied.frame), campaignState: cloneJson(state) };
  }

  async function keepEnding({ interaction, decision }) {
    let state = initializeCampaignRuntimeTracking(getCampaignState());
    const detection = {
      conditionId: decision.conditionId,
      condition: decision.condition,
      terminalOutcomeBand: decision.terminalOutcomeBand,
      finalCampaignBand: decision.finalCampaignBand,
      finalCampaignBandSummary: decision.finalCampaignBandSummary,
      outcomeId: decision.outcomeId
    };
    const terminalMetadata = createConclusionMetadataFromDetection(detection, { action: 'keepEnding' });
    let ledger = endConditionLedger(state);
    ledger = {
      ...ledger,
      activeDecisionId: null,
      decisions: ledger.decisions.map((item) => item.id === decision.id
        ? {
            ...item,
            status: 'keptEnding',
            resolvedAt: timestamp(now),
            resolution: { action: 'keepEnding' }
          }
        : item)
    };
    state = withLedger(state, ledger);
    state = resolvePendingInteraction(state, interaction.id, {
      status: 'resolved',
      action: 'keepEnding',
      resolvedAt: timestamp(now)
    });
    state.conclusion = {
      ...(state.conclusion || {}),
      terminalOutcome: cloneJson(terminalMetadata)
    };
    state.campaign = {
      ...(state.campaign || {}),
      finalCampaignBand: terminalMetadata.finalCampaignBand
    };
    await persistState(state, `Accepted terminal ending ${decision.conditionId}.`);
    if (typeof concludeCampaign !== 'function') return { ok: false, reason: 'conclusion-service-unavailable', campaignState: cloneJson(state) };
    const concluded = await concludeCampaign({
      reason: decision.playerFacingSummary || 'The player accepted a terminal campaign ending.',
      type: 'terminalOutcome',
      terminalOutcome: terminalMetadata
    });
    return { ok: true, action: 'keepEnding', conclusion: cloneJson(concluded), campaignState: cloneJson(concluded.campaignState || getCampaignState()) };
  }

  async function saveBranch({ interaction, decision }) {
    if (typeof saveTerminalBranch !== 'function') return { ok: false, reason: 'terminal-branch-save-unavailable' };
    const state = initializeCampaignRuntimeTracking(getCampaignState());
    const branch = await saveTerminalBranch({
      name: `Terminal Timeline - ${decision.condition?.title || decision.conditionId}`,
      branchFrom: {
        divergenceOutcomeId: decision.outcomeId || null
      },
      campaignState: state,
      summary: decision.playerFacingSummary || 'Terminal timeline preserved.',
      terminalOutcomeId: decision.conditionId,
      terminalDecisionId: decision.id,
      terminalConditionId: decision.conditionId
    });
    let ledger = endConditionLedger(state);
    ledger = {
      ...ledger,
      branchRecords: [
        ...ledger.branchRecords,
        {
          id: `terminal-branch:${branch.id}`,
          saveId: branch.id,
          decisionId: decision.id,
          conditionId: decision.conditionId,
          outcomeId: decision.outcomeId || null,
          createdAt: timestamp(now)
        }
      ],
      decisions: ledger.decisions.map((item) => item.id === decision.id
        ? {
            ...item,
            savedBranchIds: [...(item.savedBranchIds || []), branch.id]
          }
        : item)
    };
    const next = withLedger(state, ledger);
    await persistState(next, `Saved terminal timeline branch ${branch.id}.`);
    return { ok: true, action: 'saveTerminalBranch', branch: cloneJson(branch), campaignState: cloneJson(next) };
  }

  async function resolveDecision({ interactionId = null, action = 'replayFromCheckpoint', frameId = null, playerArgument = null } = {}) {
    const state = initializeCampaignRuntimeTracking(getCampaignState());
    const interaction = activeTerminalInteraction(state, interactionId);
    if (!interaction) return { ok: false, reason: 'terminal-decision-not-pending' };
    const decision = decisionForInteraction(state, interaction);
    if (!decision) return { ok: false, reason: 'terminal-decision-record-not-found' };
    const normalizedAction = compact(action || 'replayFromCheckpoint');
    switch (normalizedAction) {
      case 'replay':
      case 'replayFromCheckpoint':
        return replayFromCheckpoint({ interaction, decision });
      case 'pushOn':
      case 'push-on':
        return pushOn({ interaction, decision, frameId, playerArgument });
      case 'keepEnding':
      case 'keep':
        return keepEnding({ interaction, decision });
      case 'saveTerminalBranch':
      case 'saveBranch':
        return saveBranch({ interaction, decision });
      default:
        return { ok: false, reason: 'terminal-decision-action-unsupported', action: normalizedAction };
    }
  }

  return {
    evaluateCommittedTurn,
    postCheckpointDecision,
    resolveDecision,
    checkpointText
  };
}
