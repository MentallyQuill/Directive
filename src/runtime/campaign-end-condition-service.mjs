import {
  applyPushOnContinuationFrame,
  createConclusionMetadataFromDetection,
  detectCampaignEndCondition
} from '../campaign/end-conditions.mjs';
import { hashStableJson } from './architecture-redesign-contracts.mjs';
import {
  initializeCampaignRuntimeTracking,
  recordPendingInteraction,
  resolvePendingInteraction
} from './state-delta-gateway.mjs';
import { prefixCampaignReplyHeader } from '../time/campaign-time-header.mjs';

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

function checkpointRefFromDecision(decision = {}) {
  const checkpoint = decision?.checkpoint || {};
  return checkpoint.coreCheckpointRef
    || checkpoint.v2CheckpointRef
    || checkpoint.checkpointRef
    || decision?.coreCheckpointRef
    || decision?.v2CheckpointRef
    || null;
}

function snapshotFromLoadedCheckpoint(loaded) {
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

function safeCheckpointSegment(value, fallback = 'terminal-checkpoint') {
  const safe = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
  return safe || fallback;
}

function terminalCheckpointId(detection = {}) {
  return safeCheckpointSegment([
    'terminal',
    detection.conditionId,
    detection.outcomeId || detection.turnId || detection.decisionId
  ].filter(Boolean).join('-'));
}

function normalizeExistingCoreCheckpointRef(ref = {}, { campaignId = null, saveId = null } = {}) {
  if (!isObject(ref)) return null;
  const checkpointId = compact(ref.checkpointId || ref.id);
  if (!checkpointId) return null;
  return {
    kind: 'directive.coreTerminalReplayCheckpointRef.v1',
    campaignId: ref.campaignId || campaignId || null,
    saveId: ref.saveId || saveId || null,
    checkpointId,
    layout: ref.layout || 'core',
    sourceKind: 'coreStoreV2.checkpoint',
    sourceRevision: numericRevision(ref.sourceRevision),
    logicalKey: ref.logicalKey || null,
    hash: ref.hash || null,
    artifactKind: ref.artifactKind || ref.kind || null
  };
}

function normalizeCoreCheckpointRef(writeResult, {
  campaignId,
  saveId,
  checkpointId,
  sourceRevision = null
} = {}) {
  if (!isObject(writeResult)) return null;
  const ref = writeResult.coreCheckpointRef || writeResult.checkpointRef || writeResult.ref || {};
  return {
    kind: 'directive.coreTerminalReplayCheckpointRef.v1',
    campaignId,
    saveId,
    checkpointId,
    layout: 'core',
    sourceKind: writeResult.sourceKind || ref.sourceKind || 'coreStoreV2.checkpoint',
    sourceRevision: numericRevision(
      writeResult.sourceRevision
      ?? ref.sourceRevision
      ?? writeResult.record?.checkpoint?.sourceRevision
      ?? sourceRevision
    ),
    logicalKey: ref.logicalKey || writeResult.logicalKey || null,
    hash: ref.hash || writeResult.hash || writeResult.record?.hash || null,
    artifactKind: ref.kind || ref.artifactKind || writeResult.record?.kind || null
  };
}

async function checkpointSnapshotRecord(state, decision, { loadTerminalCheckpoint = null } = {}) {
  const outcomeId = decision?.checkpoint?.outcomeId || decision?.outcomeId || null;
  if (!outcomeId) return null;
  const checkpointRef = checkpointRefFromDecision(decision);
  if (checkpointRef) {
    if (typeof loadTerminalCheckpoint !== 'function') return null;
    const binding = state.campaignChatBinding || {};
    const loaded = await loadTerminalCheckpoint({
      ...cloneJson(checkpointRef),
      campaignId: checkpointRef.campaignId || binding.campaignId || state.campaign?.id || null,
      saveId: checkpointRef.saveId || binding.saveId || null,
      checkpointId: checkpointRef.checkpointId || checkpointRef.id || null,
      layout: checkpointRef.layout || 'core',
      decisionId: decision?.id || null,
      conditionId: decision?.conditionId || null,
      turnId: decision?.turnId || null,
      outcomeId
    });
    const snapshot = snapshotFromLoadedCheckpoint(loaded);
    return snapshot
      ? {
          snapshot: cloneJson(snapshot),
          sourceKind: loaded?.sourceKind || loaded?.checkpoint?.sourceKind || 'coreStoreV2.checkpoint',
          sourceRevision: numericRevision(
            loaded?.sourceRevision
            ?? loaded?.revision
            ?? loaded?.checkpoint?.sourceRevision
            ?? loaded?.checkpoint?.revision
          )
        }
      : null;
  }
  return null;
}

function coreCheckpointRefFromTurnLedger(state, detection = {}, { campaignId = null, saveId = null } = {}) {
  const outcomeId = detection?.checkpoint?.outcomeId || detection?.outcomeId || null;
  if (!outcomeId) return null;
  const entry = (state.turnLedger?.entries || []).find((item) => item?.outcomeId === outcomeId);
  const ref = entry?.coreCheckpointRef
    || (
      state.runtimeTracking?.lastCommittedTurn?.outcomeId === outcomeId
        ? state.runtimeTracking.lastCommittedTurn.coreCheckpointRef
        : null
    );
  return normalizeExistingCoreCheckpointRef(ref, { campaignId, saveId });
}

function retainedTerminalSnapshotRecord(state, decision) {
  const outcomeId = decision?.checkpoint?.outcomeId || decision?.outcomeId || null;
  if (!outcomeId) return null;
  const entry = (state.turnLedger?.entries || []).find((item) => item?.outcomeId === outcomeId);
  if (entry?.snapshotBefore) {
    return {
      snapshot: cloneJson(entry.snapshotBefore),
      sourceKind: 'turnLedger.snapshotBefore',
      sourceRevision: Number.isFinite(Number(entry.revision)) ? Number(entry.revision) : null
    };
  }
  const history = Array.isArray(state.runtimeTracking?.history) ? state.runtimeTracking.history : [];
  const outcomeEntry = [...history].reverse().find((item) => item?.outcomeId === outcomeId && item?.snapshot);
  if (outcomeEntry?.snapshot) {
    return {
      snapshot: cloneJson(outcomeEntry.snapshot),
      sourceKind: 'runtimeTracking.history.outcomeSnapshot',
      sourceRevision: Number.isFinite(Number(outcomeEntry.revision)) ? Number(outcomeEntry.revision) : null
    };
  }
  return null;
}

async function writeTerminalReplayCheckpointRecord(state, detection, { writeTerminalCheckpoint = null } = {}) {
  const binding = state.campaignChatBinding || {};
  const campaignId = detection?.checkpoint?.campaignId || binding.campaignId || state.campaign?.id || null;
  const saveId = detection?.checkpoint?.saveId || binding.saveId || null;
  const existingCoreCheckpointRef = coreCheckpointRefFromTurnLedger(state, detection, { campaignId, saveId });
  if (existingCoreCheckpointRef) return existingCoreCheckpointRef;
  if (typeof writeTerminalCheckpoint !== 'function') return null;
  if (!campaignId || !saveId) return null;
  const snapshotRecord = retainedTerminalSnapshotRecord(state, {
    id: detection.decisionId || null,
    conditionId: detection.conditionId || null,
    turnId: detection.turnId || null,
    outcomeId: detection.outcomeId || null,
    checkpoint: detection.checkpoint || null
  });
  const snapshot = snapshotRecord?.snapshot || null;
  if (!snapshot) return null;
  const checkpointId = terminalCheckpointId(detection);
  const checkpoint = {
    kind: 'directive.coreTerminalReplayCheckpoint.v1',
    type: 'terminalOutcomeReplay',
    campaignId,
    saveId,
    checkpointId,
    decisionId: detection.decisionId || null,
    conditionId: detection.conditionId || null,
    turnId: detection.turnId || null,
    outcomeId: detection.outcomeId || null,
    sourceKind: snapshotRecord.sourceKind || null,
    sourceRevision: numericRevision(snapshotRecord.sourceRevision),
    snapshotHash: hashStableJson(snapshot),
    campaignState: cloneJson(snapshot)
  };
  const writeResult = await writeTerminalCheckpoint({
    campaignId,
    saveId,
    checkpointId,
    layout: 'core',
    checkpoint
  });
  return normalizeCoreCheckpointRef(writeResult, {
    campaignId,
    saveId,
    checkpointId,
    sourceRevision: snapshotRecord.sourceRevision
  });
}

function numericRevision(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function terminalReplayRepairEvidence({ state, interaction, decision, snapshotRecord }) {
  const snapshot = snapshotRecord?.snapshot || null;
  const decisionId = decision?.id || interaction?.metadata?.decisionId || interaction?.id || null;
  const interactionId = interaction?.id || decision?.id || null;
  const conditionId = decision?.conditionId || interaction?.metadata?.terminalOutcomeId || null;
  const turnId = decision?.turnId || interaction?.turnId || null;
  const outcomeId = decision?.checkpoint?.outcomeId || decision?.outcomeId || interaction?.outcomeId || null;
  const runtimeRevision = numericRevision(state.runtimeTracking?.revision);
  const ledgerRevision = numericRevision(snapshotRecord?.sourceRevision ?? state.runtimeTracking?.lastStableRevision);
  const snapshotPresent = Boolean(snapshot);
  const snapshotSourceKind = snapshotRecord?.sourceKind || null;
  const snapshotHash = hashStableJson({
    kind: 'directive.terminalCheckpointReplayEvidence.v1',
    decisionId,
    interactionId,
    conditionId,
    turnId,
    outcomeId,
    snapshotSourceKind,
    snapshotPresent,
    runtimeRevision,
    ledgerRevision
  });
  return {
    decisionId,
    interactionId,
    conditionId,
    turnId,
    outcomeId,
    action: 'restoreTerminalCheckpointSnapshot',
    snapshotSourceKind,
    snapshotPresent,
    snapshotHash: snapshotPresent ? snapshotHash : null,
    runtimeRevision,
    ledgerRevision
  };
}

function compactRepairDecisionEvidence(decision = null) {
  if (!isObject(decision)) return null;
  return {
    kind: decision.kind || null,
    eventType: decision.eventType || null,
    sourceKind: decision.sourceKind || null,
    authorized: decision.authorized === true,
    action: decision.action || null,
    requestedAction: decision.requestedAction || null,
    reason: decision.reason || null,
    deniedReason: decision.deniedReason || null,
    decisionId: decision.decisionId || null,
    interactionId: decision.interactionId || null,
    conditionId: decision.conditionId || null,
    turnId: decision.turnId || null,
    outcomeId: decision.outcomeId || null,
    snapshotSourceKind: decision.snapshotSourceKind || null,
    snapshotPresent: decision.snapshotPresent === true,
    snapshotHash: decision.snapshotHash || null,
    runtimeRevision: numericRevision(decision.runtimeRevision),
    ledgerRevision: numericRevision(decision.ledgerRevision),
    allowedActions: Array.isArray(decision.allowedActions) ? cloneJson(decision.allowedActions) : [],
    normalTurnAllowed: decision.normalTurnAllowed === true,
    observedAt: decision.observedAt || null
  };
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
  recordTerminalCheckpointSettlement = null,
  saveTerminalBranch = null,
  concludeCampaign = null,
  repairRuntime = null,
  loadTerminalCheckpoint = null,
  writeTerminalCheckpoint = null,
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

  async function recordSettlement(event = {}) {
    if (typeof recordTerminalCheckpointSettlement !== 'function') return null;
    try {
      return cloneJson(await recordTerminalCheckpointSettlement(cloneJson(event)));
    } catch {
      return null;
    }
  }

  async function authorizeTerminalCheckpointReplay(input = {}) {
    const authorize = repairRuntime?.authorizeTerminalCheckpointReplay
      || repairRuntime?.evaluateTerminalCheckpointReplayActuation;
    if (typeof authorize !== 'function') {
      return {
        kind: 'directive.repairTerminalCheckpointReplayActuationDecision.v1',
        eventType: 'terminalCheckpointReplayRequested',
        sourceKind: 'terminalOutcomeCheckpoint',
        authorized: false,
        action: 'blockTerminalCheckpointReplay',
        requestedAction: input.action || 'restoreTerminalCheckpointSnapshot',
        reason: 'repair-terminal-checkpoint-replay-authority-unavailable',
        deniedReason: 'repair-terminal-checkpoint-replay-authority-unavailable',
        decisionId: input.decisionId || input.interactionId || null,
        interactionId: input.interactionId || input.decisionId || null,
        conditionId: input.conditionId || null,
        turnId: input.turnId || null,
        outcomeId: input.outcomeId || null,
        snapshotSourceKind: input.snapshotSourceKind || null,
        snapshotPresent: input.snapshotPresent === true,
        snapshotHash: input.snapshotHash || null,
        runtimeRevision: input.runtimeRevision ?? null,
        ledgerRevision: input.ledgerRevision ?? null,
        allowedActions: ['reviewTerminalCheckpointReplayRequest'],
        normalTurnAllowed: false
      };
    }
    return authorize.call(repairRuntime, cloneJson(input));
  }

  async function evaluateCommittedTurn({ turnPacket = null, ingressId = null } = {}) {
    let state = initializeCampaignRuntimeTracking(getCampaignState());
    const outcomeId = turnPacket?.outcomePacket?.id || state.turnLedger?.lastCommittedOutcomeId || null;
    const turnId = turnPacket?.turnId || turnPacket?.id || null;
    let detection = detectCampaignEndCondition({
      campaignState: state,
      packageContext: getPackageContext(),
      outcomeId,
      turnId,
      ingressId,
      now
    });
    if (!detection?.matched) return { ok: true, detection: cloneJson(detection || null), campaignState: cloneJson(state) };
    const coreCheckpointRef = await writeTerminalReplayCheckpointRecord(state, detection, { writeTerminalCheckpoint });
    if (coreCheckpointRef) {
      detection = {
        ...detection,
        checkpoint: {
          ...(detection.checkpoint || {}),
          coreCheckpointRef
        },
        pendingInteraction: {
          ...(detection.pendingInteraction || {}),
          metadata: {
            ...(detection.pendingInteraction?.metadata || {}),
            checkpoint: {
              ...(detection.checkpoint || {}),
              coreCheckpointRef
            }
          }
        }
      };
    }

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
      text: prefixCampaignReplyHeader(checkpointText(interaction), state),
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
    const terminalCheckpointSettlement = await recordSettlement({
      kind: 'terminalOutcomeCheckpointPosted',
      ingressId: interaction.ingressId || null,
      turnId: interaction.turnId || null,
      outcomeId: interaction.outcomeId || decision?.outcomeId || null,
      interactionId: interaction.id,
      checkpointHostMessageId: posted?.hostMessageId || posted?.id || null,
      status: 'posted'
    });
    return {
      ok: true,
      posted: cloneJson(posted || null),
      interaction: cloneJson(interaction),
      terminalCheckpointSettlement,
      campaignState: cloneJson(state)
    };
  }

  async function replayFromCheckpoint({ interaction, decision }) {
    const current = initializeCampaignRuntimeTracking(getCampaignState());
    const snapshotRecord = await checkpointSnapshotRecord(current, decision, { loadTerminalCheckpoint });
    const snapshot = snapshotRecord?.snapshot || null;
    if (!snapshot) return { ok: false, reason: 'checkpoint-snapshot-not-retained' };
    const repairDecision = compactRepairDecisionEvidence(await authorizeTerminalCheckpointReplay(
      terminalReplayRepairEvidence({
        state: current,
        interaction,
        decision,
        snapshotRecord
      })
    ));
    if (repairDecision?.authorized !== true || repairDecision.action !== 'restoreTerminalCheckpointSnapshot') {
      return {
        ok: false,
        reason: repairDecision?.deniedReason || repairDecision?.reason || 'terminal-checkpoint-replay-not-authorized',
        repairDecision
      };
    }
    const currentLedger = endConditionLedger(current);
    const restoredLedger = {
      ...currentLedger,
      activeDecisionId: null,
      decisions: currentLedger.decisions.map((item) => item.id === decision.id
        ? {
            ...item,
            status: 'replayed',
            resolvedAt: timestamp(now),
            resolution: {
              action: 'replayFromCheckpoint',
              repairDecision
            }
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
    if (typeof concludeCampaign !== 'function') {
      return {
        ok: false,
        reason: 'conclusion-service-unavailable',
        campaignState: cloneJson(initializeCampaignRuntimeTracking(getCampaignState()))
      };
    }
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

  async function resolveDecision({
    interactionId = null,
    action = 'replayFromCheckpoint',
    frameId = null,
    playerArgument = null,
    resolutionIngressId = null,
    resolutionHostMessageId = null
  } = {}) {
    const state = initializeCampaignRuntimeTracking(getCampaignState());
    const interaction = activeTerminalInteraction(state, interactionId);
    if (!interaction) return { ok: false, reason: 'terminal-decision-not-pending' };
    const decision = decisionForInteraction(state, interaction);
    if (!decision) return { ok: false, reason: 'terminal-decision-record-not-found' };
    const normalizedAction = compact(action || 'replayFromCheckpoint');
    let result = null;
    switch (normalizedAction) {
      case 'replay':
      case 'replayFromCheckpoint':
        result = await replayFromCheckpoint({ interaction, decision });
        break;
      case 'pushOn':
      case 'push-on':
        result = await pushOn({ interaction, decision, frameId, playerArgument });
        break;
      case 'keepEnding':
      case 'keep':
        result = await keepEnding({ interaction, decision });
        break;
      case 'saveTerminalBranch':
      case 'saveBranch':
        result = await saveBranch({ interaction, decision });
        break;
      default:
        return { ok: false, reason: 'terminal-decision-action-unsupported', action: normalizedAction };
    }
    const settlementKind = ['saveTerminalBranch', 'saveBranch'].includes(normalizedAction)
      ? 'terminalOutcomeCheckpointBranchSaved'
      : 'terminalOutcomeCheckpointResolved';
    const terminalCheckpointSettlement = await recordSettlement({
      kind: settlementKind,
      ingressId: resolutionIngressId || interaction.ingressId || null,
      resolutionIngressId: resolutionIngressId || null,
      resolutionHostMessageId: resolutionHostMessageId || null,
      turnId: interaction.turnId || decision.turnId || null,
      outcomeId: interaction.outcomeId || decision.outcomeId || null,
      interactionId: interaction.id,
      action: result?.action || normalizedAction,
      status: result?.ok === false ? 'failed' : (settlementKind === 'terminalOutcomeCheckpointBranchSaved' ? 'branchSaved' : 'resolved'),
      reason: result?.reason || null
    });
    return {
      ...cloneJson(result || {}),
      terminalCheckpointSettlement
    };
  }

  return {
    evaluateCommittedTurn,
    postCheckpointDecision,
    resolveDecision,
    checkpointText
  };
}
