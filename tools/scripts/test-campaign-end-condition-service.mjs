import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createCampaignEndConditionService } from '../../src/runtime/campaign-end-condition-service.mjs';
import { hashStableJson } from '../../src/runtime/architecture-redesign-contracts.mjs';
import { initializeCampaignRuntimeTracking } from '../../src/runtime/state-delta-gateway.mjs';

const root = process.cwd();
const readJson = (filePath) => JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
const cloneJson = (value) => JSON.parse(JSON.stringify(value));
const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');

function terminalState() {
  const snapshotBefore = initializeCampaignRuntimeTracking(cloneJson(projection.initialState));
  snapshotBefore.campaign = {
    ...(snapshotBefore.campaign || {}),
    id: 'campaign-end-condition-service-test',
    status: 'active',
    checkpointMarker: 'before-terminal-outcome'
  };
  snapshotBefore.ship = {
    ...(snapshotBefore.ship || {}),
    status: 'operational'
  };

  const state = initializeCampaignRuntimeTracking(cloneJson(snapshotBefore));
  state.campaignChatBinding = {
    hostId: 'fake',
    chatId: 'terminal-chat',
    campaignId: state.campaign.id,
    saveId: 'save-terminal-test',
    promptContextRevision: 1
  };
  state.flags = {
    ...(state.flags || {}),
    'campaign-objective': 'saved'
  };
  state.ship = {
    ...(state.ship || {}),
    status: 'destroyed'
  };
  state.turnLedger = {
    entries: [
      {
        turnId: 'turn-terminal',
        outcomeId: 'outcome-terminal',
        resultBand: 'Failure',
        tags: ['ship-loss'],
        snapshotBefore
      }
    ],
    lastCommittedOutcomeId: 'outcome-terminal',
    swipeRerollForbidden: true
  };
  return state;
}

function createHarness(initial = terminalState(), overrides = {}) {
  let state = cloneJson(initial);
  const persisted = [];
  const promptSyncs = [];
  const postedMessages = [];
  const savedBranches = [];
  const conclusions = [];
  const terminalSettlements = [];
  const repairCalls = [];
  const checkpointLoads = [];
  const checkpointWrites = [];
  let nowIndex = 0;
  const now = () => `2026-06-23T10:00:${String(nowIndex++).padStart(2, '0')}.000Z`;
  const host = overrides.host === undefined
    ? {
        chat: {
          async postAssistantMessage(options) {
            const message = {
              hostMessageId: `terminal-message-${postedMessages.length + 1}`,
              ...cloneJson(options)
            };
            postedMessages.push(message);
            return message;
          }
        }
      }
    : overrides.host;
  const saveTerminalBranch = overrides.saveTerminalBranch === undefined
    ? async (options) => {
        const branch = {
          id: `terminal-branch-${savedBranches.length + 1}`,
          current: false,
          metadata: {
            branch: {
              kind: 'terminalTimeline',
              terminalOutcomeId: options.terminalOutcomeId,
              terminalDecisionId: options.terminalDecisionId,
              terminalConditionId: options.terminalConditionId
            }
          },
          payload: {
            campaignState: cloneJson(options.campaignState)
          }
        };
        savedBranches.push({ options: cloneJson(options), branch });
        return branch;
      }
    : overrides.saveTerminalBranch;
  const concludeCampaign = overrides.concludeCampaign === undefined
    ? async (options) => {
        const next = cloneJson(state);
        next.campaign = {
          ...(next.campaign || {}),
          status: 'complete',
          finalCampaignBand: options.terminalOutcome?.finalCampaignBand || null
        };
        next.conclusion = {
          ...(next.conclusion || {}),
          recapStatus: 'complete',
          terminalOutcome: cloneJson(options.terminalOutcome || null)
        };
        state = cloneJson(next);
        const result = { ok: true, options: cloneJson(options), campaignState: cloneJson(next) };
        conclusions.push(result);
        return result;
    }
    : overrides.concludeCampaign;
  const repairRuntime = overrides.repairRuntime === undefined
    ? {
        authorizeTerminalCheckpointReplay(input = {}) {
          repairCalls.push(cloneJson(input));
          return {
            kind: 'directive.repairTerminalCheckpointReplayActuationDecision.v1',
            eventType: 'terminalCheckpointReplayRequested',
            authorized: true,
            action: 'restoreTerminalCheckpointSnapshot',
            reason: 'terminal-checkpoint-replay-authorized',
            decisionId: input.decisionId || null,
            interactionId: input.interactionId || null,
            conditionId: input.conditionId || null,
            turnId: input.turnId || null,
            outcomeId: input.outcomeId || null,
            snapshotSourceKind: input.snapshotSourceKind || null,
            snapshotPresent: input.snapshotPresent === true,
            snapshotHash: input.snapshotHash || null,
            runtimeRevision: input.runtimeRevision ?? null,
            ledgerRevision: input.ledgerRevision ?? null,
            normalTurnAllowed: false,
            observedAt: '2026-06-23T10:00:repair.000Z'
          };
        }
      }
    : overrides.repairRuntime;
  const loadTerminalCheckpoint = overrides.loadTerminalCheckpoint === undefined
    ? null
    : async (input = {}) => {
        checkpointLoads.push(cloneJson(input));
        return overrides.loadTerminalCheckpoint(input);
      };
  const writeTerminalCheckpoint = overrides.writeTerminalCheckpoint === undefined
    ? null
    : async (input = {}) => {
        checkpointWrites.push(cloneJson(input));
        return overrides.writeTerminalCheckpoint(input);
      };
  const service = createCampaignEndConditionService({
    host,
    getCampaignState: () => state,
    setCampaignState: (next) => { state = cloneJson(next); },
    getPackageContext: () => packageData,
    persist: async (next, summary) => {
      persisted.push({ state: cloneJson(next), summary });
    },
    syncPrompt: async (next, reason) => {
      const synced = cloneJson(next);
      synced.campaignChatBinding = {
        ...(synced.campaignChatBinding || {}),
        promptContextRevision: Number(synced.campaignChatBinding?.promptContextRevision || 0) + 1
      };
      promptSyncs.push({ state: cloneJson(synced), reason });
      state = cloneJson(synced);
      return synced;
    },
    recordTerminalCheckpointSettlement: async (event) => {
      terminalSettlements.push(cloneJson(event));
      return {
        kind: 'directive.terminalCheckpointSettlementScheduled',
        scheduled: true,
        settlementKind: event.kind,
        interactionId: event.interactionId || null,
        ingressId: event.ingressId || null,
        resolutionIngressId: event.resolutionIngressId || null,
        outcomeId: event.outcomeId || null,
        status: event.status || null
      };
    },
    saveTerminalBranch,
    concludeCampaign,
    repairRuntime,
    loadTerminalCheckpoint,
    writeTerminalCheckpoint,
    now
  });
  return {
    service,
    get state() { return state; },
    setState(next) { state = cloneJson(next); },
    persisted,
    promptSyncs,
    postedMessages,
    savedBranches,
    conclusions,
    terminalSettlements,
    repairCalls,
    checkpointLoads,
    checkpointWrites
  };
}

function checkpointStoreOverrides() {
  const checkpoints = new Map();
  return {
    async writeTerminalCheckpoint(input = {}) {
      checkpoints.set(input.checkpointId, cloneJson(input.checkpoint));
      return {
        ref: {
          kind: 'directive.checkpoint.v2',
          logicalKey: `campaigns/${input.campaignId}/saves/${input.saveId}/core/checkpoints/${input.checkpointId}.v2.json`,
          hash: hashStableJson(input.checkpoint)
        },
        sourceKind: 'coreStoreV2.checkpoint',
        sourceRevision: input.checkpoint?.sourceRevision ?? null
      };
    },
    async loadTerminalCheckpoint(input = {}) {
      const checkpoint = checkpoints.get(input.checkpointId);
      return checkpoint
        ? {
            checkpoint: cloneJson(checkpoint),
            sourceKind: 'coreStoreV2.checkpoint',
            sourceRevision: checkpoint.sourceRevision ?? null
          }
        : null;
    }
  };
}

function terminalStateWithCoreCheckpointRef({
  checkpointId = 'core-terminal-outcome-terminal',
  sourceRevision = 42,
  removeRawSnapshot = false
} = {}) {
  const state = terminalState();
  state.turnLedger.entries[0].coreCheckpointRef = {
    kind: 'directive.coreMechanicsCheckpointRef.v1',
    campaignId: 'campaign-end-condition-service-test',
    saveId: 'save-terminal-test',
    checkpointId,
    layout: 'core',
    sourceKind: 'coreStoreV2.checkpoint',
    sourceRevision
  };
  if (removeRawSnapshot) delete state.turnLedger.entries[0].snapshotBefore;
  return state;
}

function coreCheckpointLoadOverrides({
  snapshot = terminalState().turnLedger.entries[0].snapshotBefore,
  sourceRevision = 42
} = {}) {
  return {
    async loadTerminalCheckpoint(input = {}) {
      return input?.checkpointId
        ? {
            checkpoint: {
              campaignState: cloneJson(snapshot)
            },
            sourceKind: 'coreStoreV2.checkpoint',
            sourceRevision
          }
        : null;
    }
  };
}

async function detect(harness) {
  const detected = await harness.service.evaluateCommittedTurn({
    turnPacket: {
      turnId: 'turn-terminal',
      outcomePacket: {
        id: 'outcome-terminal',
        resultBand: 'Failure'
      }
    },
    ingressId: 'ingress-terminal'
  });
  assert.equal(detected.ok, true);
  assert.equal(detected.detection.conditionId, 'terminal.ashes.breck-destroyed-objective-saved');
  assert.equal(detected.pendingInteraction.kind, 'terminalOutcomeDecision');
  assert.equal(harness.state.runtimeTracking.pendingInteractions.length, 1);
  assert.equal(harness.state.runtimeTracking.endConditionLedger.decisions.length, 1);
  return detected.pendingInteraction.id;
}

const postHarness = createHarness();
const postInteractionId = await detect(postHarness);
const posted = await postHarness.service.postCheckpointDecision({ interactionId: postInteractionId });
assert.equal(posted.ok, true);
assert.equal(postHarness.postedMessages.length, 1);
assert.equal(postHarness.postedMessages[0].responseKind, 'terminalOutcomeCheckpoint');
assert.equal(postHarness.postedMessages[0].text.startsWith('*Stardate 53049.2 | 0830 hours*\n\n'), true);
assert.match(postHarness.postedMessages[0].text, /Directive Checkpoint/);
assert.match(postHarness.postedMessages[0].text, /Replay from checkpoint/);
assert.equal(postHarness.state.runtimeTracking.endConditionLedger.decisions[0].postedAt !== null, true);
assert.equal(postHarness.terminalSettlements.length, 1);
assert.equal(postHarness.terminalSettlements[0].kind, 'terminalOutcomeCheckpointPosted');
assert.equal(postHarness.terminalSettlements[0].interactionId, postInteractionId);
assert.equal(postHarness.terminalSettlements[0].outcomeId, 'outcome-terminal');
assert.equal(postHarness.terminalSettlements[0].checkpointHostMessageId, 'terminal-message-1');
assert.equal(JSON.stringify(postHarness.terminalSettlements).includes('Directive Checkpoint'), false);
assert.equal(posted.terminalCheckpointSettlement.status, 'posted');
const duplicatePost = await postHarness.service.postCheckpointDecision({ interactionId: postInteractionId });
assert.equal(duplicatePost.duplicate, true);
assert.equal(postHarness.postedMessages.length, 1);
assert.equal(postHarness.terminalSettlements.length, 1, 'Duplicate terminal checkpoint posts must not duplicate settlement records.');

const noHostHarness = createHarness(terminalState(), { host: {} });
const noHostInteractionId = await detect(noHostHarness);
const noHostPost = await noHostHarness.service.postCheckpointDecision({ interactionId: noHostInteractionId });
assert.equal(noHostPost.ok, false);
assert.equal(noHostPost.reason, 'host-chat-post-unavailable');

const checkpointProducerHarness = createHarness(terminalState(), {
  writeTerminalCheckpoint: async (input = {}) => ({
    ref: {
      kind: 'directive.checkpoint.v2',
      logicalKey: `campaigns/${input.campaignId}/saves/${input.saveId}/core/checkpoints/${input.checkpointId}.v2.json`,
      hash: hashStableJson(input.checkpoint)
    },
    record: {
      checkpoint: cloneJson(input.checkpoint)
    },
    sourceKind: 'coreStoreV2.checkpoint',
    sourceRevision: 11
  })
});
const checkpointProducerInteractionId = await detect(checkpointProducerHarness);
assert.equal(checkpointProducerHarness.checkpointWrites.length, 0, 'terminal detection must not promote old snapshotBefore into a new CORE checkpoint.');
const checkpointProducerDecision = checkpointProducerHarness.state.runtimeTracking.endConditionLedger.decisions[0];
assert.equal(checkpointProducerDecision.id, checkpointProducerInteractionId);
assert.equal(
  Object.prototype.hasOwnProperty.call(checkpointProducerDecision.checkpoint, 'coreCheckpointRef'),
  false,
  'Terminal decision must require an existing CORE checkpoint ref instead of creating one from old snapshotBefore.'
);
assert.equal(
  Object.prototype.hasOwnProperty.call(checkpointProducerHarness.state.runtimeTracking.pendingInteractions[0].metadata.checkpoint, 'coreCheckpointRef'),
  false,
  'Pending terminal interaction must not carry a checkpoint ref created from old snapshotBefore.'
);

const unsupportedHarness = createHarness();
const unsupportedInteractionId = await detect(unsupportedHarness);
const unsupported = await unsupportedHarness.service.resolveDecision({
  interactionId: unsupportedInteractionId,
  action: 'invent-fifth-ending-button'
});
assert.equal(unsupported.ok, false);
assert.equal(unsupported.reason, 'terminal-decision-action-unsupported');
assert.equal(unsupported.action, 'invent-fifth-ending-button');

const coreLedgerCheckpointState = terminalState();
coreLedgerCheckpointState.turnLedger.entries[0].coreCheckpointRef = {
  kind: 'directive.coreMechanicsCheckpointRef.v1',
  campaignId: 'campaign-end-condition-service-test',
  saveId: 'save-terminal-test',
  checkpointId: 'core-mechanics-outcome-terminal',
  layout: 'core',
  sourceKind: 'turnCommitCoordinator.beforeCampaignState',
  sourceRevision: 12
};
delete coreLedgerCheckpointState.turnLedger.entries[0].snapshotBefore;
const coreLedgerCheckpointHarness = createHarness(coreLedgerCheckpointState, {
  writeTerminalCheckpoint: async () => {
    throw new Error('terminal detection must reuse CORE mechanics checkpoint ref');
  }
});
const coreLedgerCheckpointInteractionId = await detect(coreLedgerCheckpointHarness);
assert.equal(coreLedgerCheckpointHarness.checkpointWrites.length, 0, 'terminal detection must not duplicate existing CORE mechanics checkpoint artifacts');
const coreLedgerCheckpointDecision = coreLedgerCheckpointHarness.state.runtimeTracking.endConditionLedger.decisions[0];
assert.equal(coreLedgerCheckpointDecision.id, coreLedgerCheckpointInteractionId);
assert.equal(coreLedgerCheckpointDecision.checkpoint.coreCheckpointRef.kind, 'directive.coreTerminalReplayCheckpointRef.v1');
assert.equal(coreLedgerCheckpointDecision.checkpoint.coreCheckpointRef.checkpointId, 'core-mechanics-outcome-terminal');
assert.equal(coreLedgerCheckpointDecision.checkpoint.coreCheckpointRef.sourceKind, 'coreStoreV2.checkpoint');
assert.equal(coreLedgerCheckpointDecision.checkpoint.coreCheckpointRef.sourceRevision, 12);
assert.equal(
  Object.prototype.hasOwnProperty.call(coreLedgerCheckpointDecision.checkpoint.coreCheckpointRef, 'campaignState'),
  false,
  'Terminal decision must keep reused CORE checkpoint refs compact.'
);

const branchHarness = createHarness();
const branchInteractionId = await detect(branchHarness);
const branch = await branchHarness.service.resolveDecision({
  interactionId: branchInteractionId,
  action: 'saveTerminalBranch'
});
assert.equal(branch.ok, true);
assert.equal(branch.branch.current, false);
assert.equal(branchHarness.savedBranches[0].options.terminalOutcomeId, 'terminal.ashes.breck-destroyed-objective-saved');
assert.equal(branchHarness.state.runtimeTracking.pendingInteractions[0].status, 'pending');
assert.equal(branchHarness.state.runtimeTracking.endConditionLedger.branchRecords.length, 1);
assert.deepEqual(branchHarness.state.runtimeTracking.endConditionLedger.decisions[0].savedBranchIds, ['terminal-branch-1']);
assert.equal(branchHarness.terminalSettlements.length, 1);
assert.equal(branchHarness.terminalSettlements[0].kind, 'terminalOutcomeCheckpointBranchSaved');
assert.equal(branchHarness.terminalSettlements[0].status, 'branchSaved');
assert.equal(branchHarness.terminalSettlements[0].interactionId, branchInteractionId);

const noBranchHarness = createHarness(terminalState(), { saveTerminalBranch: null });
const noBranchInteractionId = await detect(noBranchHarness);
const noBranch = await noBranchHarness.service.resolveDecision({
  interactionId: noBranchInteractionId,
  action: 'saveTerminalBranch'
});
assert.equal(noBranch.ok, false);
assert.equal(noBranch.reason, 'terminal-branch-save-unavailable');

const pushHarness = createHarness();
const pushInteractionId = await detect(pushHarness);
const pushed = await pushHarness.service.resolveDecision({
  interactionId: pushInteractionId,
  action: 'pushOn',
  frameId: 'survivors-after-breck-loss',
  playerArgument: 'We can still protect the evidence.'
});
assert.equal(pushed.ok, true);
assert.equal(pushHarness.state.ship.status, 'lost');
assert.equal(pushHarness.state.flags['push-on.frame'], 'survivors-after-breck-loss');
assert.equal(pushHarness.state.runtimeTracking.pendingInteractions[0].status, 'resolved');
assert.equal(pushHarness.state.runtimeTracking.endConditionLedger.activeDecisionId, null);
assert.equal(pushHarness.state.runtimeTracking.endConditionLedger.decisions[0].status, 'pushedOn');
assert.equal(pushHarness.state.runtimeTracking.endConditionLedger.continuationFrames[0].frameId, 'survivors-after-breck-loss');
assert.equal(pushHarness.promptSyncs.length, 1);
assert.equal(pushHarness.terminalSettlements.length, 1);
assert.equal(pushHarness.terminalSettlements[0].kind, 'terminalOutcomeCheckpointResolved');
assert.equal(pushHarness.terminalSettlements[0].status, 'resolved');
assert.equal(pushHarness.terminalSettlements[0].action, 'pushOn');

const missingRepairHarness = createHarness(terminalStateWithCoreCheckpointRef(), {
  ...coreCheckpointLoadOverrides(),
  repairRuntime: null
});
const missingRepairInteractionId = await detect(missingRepairHarness);
const missingRepairPersistCount = missingRepairHarness.persisted.length;
const missingRepairPromptSyncCount = missingRepairHarness.promptSyncs.length;
const missingRepairReplay = await missingRepairHarness.service.resolveDecision({
  interactionId: missingRepairInteractionId,
  action: 'replayFromCheckpoint'
});
assert.equal(missingRepairReplay.ok, false);
assert.equal(missingRepairReplay.reason, 'repair-terminal-checkpoint-replay-authority-unavailable');
assert.equal(missingRepairHarness.state.ship.status, 'destroyed');
assert.equal(missingRepairHarness.state.runtimeTracking.endConditionLedger.decisions[0].status, 'pending');
assert.equal(missingRepairHarness.persisted.length, missingRepairPersistCount);
assert.equal(missingRepairHarness.promptSyncs.length, missingRepairPromptSyncCount);

const deniedRepairHarness = createHarness(terminalStateWithCoreCheckpointRef(), {
  ...coreCheckpointLoadOverrides(),
  repairRuntime: {
    authorizeTerminalCheckpointReplay(input = {}) {
      return {
        kind: 'directive.repairTerminalCheckpointReplayActuationDecision.v1',
        authorized: false,
        action: 'blockTerminalCheckpointReplay',
        reason: 'terminal-checkpoint-replay-policy-denied',
        deniedReason: 'terminal-checkpoint-replay-policy-denied',
        decisionId: input.decisionId || null,
        interactionId: input.interactionId || null,
        conditionId: input.conditionId || null,
        turnId: input.turnId || null,
        outcomeId: input.outcomeId || null,
        snapshotSourceKind: input.snapshotSourceKind || null,
        snapshotPresent: input.snapshotPresent === true,
        snapshotHash: input.snapshotHash || null
      };
    }
  }
});
const deniedRepairInteractionId = await detect(deniedRepairHarness);
const deniedRepairPersistCount = deniedRepairHarness.persisted.length;
const deniedRepairPromptSyncCount = deniedRepairHarness.promptSyncs.length;
const deniedRepairReplay = await deniedRepairHarness.service.resolveDecision({
  interactionId: deniedRepairInteractionId,
  action: 'replayFromCheckpoint'
});
assert.equal(deniedRepairReplay.ok, false);
assert.equal(deniedRepairReplay.reason, 'terminal-checkpoint-replay-policy-denied');
assert.equal(deniedRepairHarness.state.ship.status, 'destroyed');
assert.equal(deniedRepairHarness.state.runtimeTracking.endConditionLedger.decisions[0].status, 'pending');
assert.equal(deniedRepairHarness.persisted.length, deniedRepairPersistCount);
assert.equal(deniedRepairHarness.promptSyncs.length, deniedRepairPromptSyncCount);

const oldSnapshotFallbackHarness = createHarness();
const oldSnapshotFallbackInteractionId = await detect(oldSnapshotFallbackHarness);
const oldSnapshotFallbackReplay = await oldSnapshotFallbackHarness.service.resolveDecision({
  interactionId: oldSnapshotFallbackInteractionId,
  action: 'replayFromCheckpoint'
});
assert.equal(oldSnapshotFallbackReplay.ok, false);
assert.equal(oldSnapshotFallbackReplay.reason, 'checkpoint-snapshot-not-retained');
assert.equal(oldSnapshotFallbackHarness.state.ship.status, 'destroyed');
assert.equal(oldSnapshotFallbackHarness.state.runtimeTracking.endConditionLedger.decisions[0].status, 'pending');

const compactReplayState = terminalStateWithCoreCheckpointRef();
compactReplayState.turnLedger.entries[0].snapshotBefore.rawCanary = 'RAW_TERMINAL_SNAPSHOT_MUST_NOT_REACH_REPAIR';
const compactReplayRawSnapshotHash = hashStableJson(compactReplayState.turnLedger.entries[0].snapshotBefore);
compactReplayState.turnLedger.entries[0].snapshotBeforeHash = compactReplayRawSnapshotHash;
const compactReplayHarness = createHarness(compactReplayState, coreCheckpointLoadOverrides({
  snapshot: compactReplayState.turnLedger.entries[0].snapshotBefore
}));
const compactReplayInteractionId = await detect(compactReplayHarness);
const compactReplay = await compactReplayHarness.service.resolveDecision({
  interactionId: compactReplayInteractionId,
  action: 'replayFromCheckpoint'
});
assert.equal(compactReplay.ok, true);
assert.equal(compactReplayHarness.repairCalls.length, 1);
const compactReplayRepairCall = compactReplayHarness.repairCalls[0];
assert.equal(compactReplayRepairCall.action, 'restoreTerminalCheckpointSnapshot');
assert.equal(compactReplayRepairCall.decisionId, compactReplayInteractionId);
assert.equal(compactReplayRepairCall.interactionId, compactReplayInteractionId);
assert.equal(compactReplayRepairCall.conditionId, 'terminal.ashes.breck-destroyed-objective-saved');
assert.equal(compactReplayRepairCall.turnId, 'turn-terminal');
assert.equal(compactReplayRepairCall.outcomeId, 'outcome-terminal');
assert.equal(compactReplayRepairCall.snapshotPresent, true);
assert.equal(typeof compactReplayRepairCall.snapshotHash, 'string');
assert.notEqual(compactReplayRepairCall.snapshotHash, '');
assert.notEqual(
  compactReplayRepairCall.snapshotHash,
  compactReplayRawSnapshotHash,
  'Terminal replay REPAIR evidence must hash bounded checkpoint metadata instead of the full retained campaign snapshot.'
);
assert.equal(Object.prototype.hasOwnProperty.call(compactReplayRepairCall, 'snapshot'), false);
assert.equal(JSON.stringify(compactReplayRepairCall).includes('RAW_TERMINAL_SNAPSHOT_MUST_NOT_REACH_REPAIR'), false);
const compactReplayResolution = compactReplayHarness.state.runtimeTracking.endConditionLedger.decisions[0].resolution;
assert.equal(compactReplayResolution.action, 'replayFromCheckpoint');
assert.equal(compactReplayResolution.repairDecision.kind, 'directive.repairTerminalCheckpointReplayActuationDecision.v1');
assert.equal(compactReplayResolution.repairDecision.authorized, true);
assert.equal(compactReplayResolution.repairDecision.action, 'restoreTerminalCheckpointSnapshot');
assert.equal(compactReplayResolution.repairDecision.snapshotHash, compactReplayRepairCall.snapshotHash);
assert.equal(JSON.stringify(compactReplayResolution).includes('RAW_TERMINAL_SNAPSHOT_MUST_NOT_REACH_REPAIR'), false);

const replayHarness = createHarness(terminalStateWithCoreCheckpointRef(), coreCheckpointLoadOverrides());
const replayInteractionId = await detect(replayHarness);
const replayed = await replayHarness.service.resolveDecision({
  interactionId: replayInteractionId,
  action: 'replayFromCheckpoint'
});
assert.equal(replayed.ok, true);
assert.equal(replayHarness.state.campaign.checkpointMarker, 'before-terminal-outcome');
assert.equal(replayHarness.state.ship.status, 'operational');
assert.equal(replayHarness.state.runtimeTracking.endConditionLedger.decisions[0].status, 'replayed');
assert.equal(replayHarness.state.runtimeTracking.pendingInteractions.some((entry) => entry.id === replayInteractionId), false);
assert.equal(replayHarness.promptSyncs.length, 1);

const historyReplayHarness = createHarness();
const historyReplayInteractionId = await detect(historyReplayHarness);
const historyReplayState = cloneJson(historyReplayHarness.state);
const retainedSnapshot = cloneJson(historyReplayState.turnLedger.entries[0].snapshotBefore);
delete historyReplayState.turnLedger.entries[0].snapshotBefore;
historyReplayState.runtimeTracking.history = [{
  revision: 7,
  committedAt: '2026-06-23T10:00:07.000Z',
  source: 'directorTurn',
  reason: 'Fixture terminal turn retained pre-outcome snapshot in runtime history.',
  outcomeId: 'outcome-terminal',
  snapshot: retainedSnapshot
}];
historyReplayState.runtimeTracking.revision = 8;
historyReplayState.runtimeTracking.lastStableRevision = 8;
historyReplayHarness.setState(historyReplayState);
const historyReplayed = await historyReplayHarness.service.resolveDecision({
  interactionId: historyReplayInteractionId,
  action: 'replayFromCheckpoint'
});
assert.equal(historyReplayed.ok, false);
assert.equal(historyReplayed.reason, 'checkpoint-snapshot-not-retained');
assert.equal(historyReplayHarness.state.ship.status, 'destroyed');
assert.equal(historyReplayHarness.state.runtimeTracking.endConditionLedger.decisions[0].status, 'pending');

const coreCheckpointSnapshot = cloneJson(terminalState().turnLedger.entries[0].snapshotBefore);
const coreCheckpointHarness = createHarness(terminalState(), {
  loadTerminalCheckpoint: async (input = {}) => ({
    kind: 'directive.coreTerminalReplayCheckpoint.v1',
    checkpoint: {
      campaignState: cloneJson(coreCheckpointSnapshot)
    },
    sourceKind: 'coreStoreV2.checkpoint',
    sourceRevision: 42,
    input: cloneJson(input)
  })
});
const coreCheckpointInteractionId = await detect(coreCheckpointHarness);
const coreCheckpointReplayState = cloneJson(coreCheckpointHarness.state);
delete coreCheckpointReplayState.turnLedger.entries[0].snapshotBefore;
coreCheckpointReplayState.runtimeTracking.history = [];
coreCheckpointReplayState.runtimeTracking.lastStableRevision = 0;
coreCheckpointReplayState.runtimeTracking.endConditionLedger.decisions[0].checkpoint = {
  ...(coreCheckpointReplayState.runtimeTracking.endConditionLedger.decisions[0].checkpoint || {}),
  coreCheckpointRef: {
    kind: 'directive.coreTerminalReplayCheckpointRef.v1',
    campaignId: 'campaign-end-condition-service-test',
    saveId: 'save-terminal-test',
    checkpointId: 'core-terminal-outcome-terminal',
    layout: 'core'
  }
};
coreCheckpointHarness.setState(coreCheckpointReplayState);
const coreCheckpointReplay = await coreCheckpointHarness.service.resolveDecision({
  interactionId: coreCheckpointInteractionId,
  action: 'replayFromCheckpoint'
});
assert.equal(coreCheckpointReplay.ok, true);
assert.equal(coreCheckpointHarness.checkpointLoads.length, 1);
assert.equal(coreCheckpointHarness.checkpointLoads[0].campaignId, 'campaign-end-condition-service-test');
assert.equal(coreCheckpointHarness.checkpointLoads[0].saveId, 'save-terminal-test');
assert.equal(coreCheckpointHarness.checkpointLoads[0].checkpointId, 'core-terminal-outcome-terminal');
assert.equal(coreCheckpointHarness.repairCalls.length, 1);
assert.equal(coreCheckpointHarness.repairCalls[0].snapshotSourceKind, 'coreStoreV2.checkpoint');
assert.equal(coreCheckpointHarness.repairCalls[0].ledgerRevision, 42);
assert.equal(coreCheckpointHarness.state.campaign.checkpointMarker, 'before-terminal-outcome');
assert.equal(coreCheckpointHarness.state.ship.status, 'operational');
assert.equal(coreCheckpointHarness.state.runtimeTracking.endConditionLedger.decisions[0].status, 'replayed');

const missingSnapshotHarness = createHarness();
const missingSnapshotInteractionId = await detect(missingSnapshotHarness);
const missingSnapshotState = cloneJson(missingSnapshotHarness.state);
delete missingSnapshotState.turnLedger.entries[0].snapshotBefore;
missingSnapshotState.runtimeTracking.history = [];
missingSnapshotState.runtimeTracking.lastStableRevision = 0;
missingSnapshotHarness.setState(missingSnapshotState);
const missingSnapshotReplay = await missingSnapshotHarness.service.resolveDecision({
  interactionId: missingSnapshotInteractionId,
  action: 'replayFromCheckpoint'
});
assert.equal(missingSnapshotReplay.ok, false);
assert.equal(missingSnapshotReplay.reason, 'checkpoint-snapshot-not-retained');

const genericHistoryReplayHarness = createHarness();
const genericHistoryReplayInteractionId = await detect(genericHistoryReplayHarness);
const genericHistoryReplayState = cloneJson(genericHistoryReplayHarness.state);
const genericHistorySnapshot = cloneJson(genericHistoryReplayState.turnLedger.entries[0].snapshotBefore);
delete genericHistoryReplayState.turnLedger.entries[0].snapshotBefore;
genericHistoryReplayState.runtimeTracking.pendingInteractions = [];
genericHistoryReplayState.runtimeTracking.history = [{
  revision: 3,
  committedAt: '2026-06-23T10:00:03.000Z',
  source: 'directorTurn',
  reason: 'Generic stable history snapshot must not authorize terminal checkpoint replay.',
  outcomeId: 'different-outcome',
  snapshot: genericHistorySnapshot
}];
genericHistoryReplayState.runtimeTracking.revision = 4;
genericHistoryReplayState.runtimeTracking.lastStableRevision = 4;
genericHistoryReplayHarness.setState(genericHistoryReplayState);
const genericHistoryReplay = await genericHistoryReplayHarness.service.resolveDecision({
  interactionId: genericHistoryReplayInteractionId,
  action: 'replayFromCheckpoint'
});
assert.equal(genericHistoryReplay.ok, false);
assert.equal(genericHistoryReplay.reason, 'checkpoint-snapshot-not-retained');
assert.equal(genericHistoryReplayHarness.state.ship.status, 'destroyed');
assert.equal(genericHistoryReplayHarness.state.runtimeTracking.endConditionLedger.decisions[0].status, 'pending');

const keepHarness = createHarness();
const keepInteractionId = await detect(keepHarness);
const kept = await keepHarness.service.resolveDecision({
  interactionId: keepInteractionId,
  action: 'keepEnding'
});
assert.equal(kept.ok, true);
assert.equal(keepHarness.state.campaign.status, 'complete');
assert.equal(keepHarness.state.campaign.finalCampaignBand, 'Partial Success');
assert.equal(keepHarness.state.conclusion.terminalOutcome.terminalOutcomeId, 'terminal.ashes.breck-destroyed-objective-saved');
assert.equal(keepHarness.state.runtimeTracking.pendingInteractions[0].status, 'resolved');
assert.equal(keepHarness.state.runtimeTracking.endConditionLedger.decisions[0].status, 'keptEnding');
assert.equal(keepHarness.conclusions[0].options.type, 'terminalOutcome');
assert.equal(keepHarness.conclusions[0].options.terminalOutcome.acceptedResolution, 'keepEnding');

const noConclusionHarness = createHarness(terminalState(), { concludeCampaign: null });
const noConclusionInteractionId = await detect(noConclusionHarness);
const noConclusionPersistCount = noConclusionHarness.persisted.length;
const noConclusionStateBefore = cloneJson(noConclusionHarness.state);
const noConclusion = await noConclusionHarness.service.resolveDecision({
  interactionId: noConclusionInteractionId,
  action: 'keepEnding'
});
assert.equal(noConclusion.ok, false);
assert.equal(noConclusion.reason, 'conclusion-service-unavailable');
assert.deepEqual(noConclusionHarness.state, noConclusionStateBefore);
assert.equal(noConclusionHarness.persisted.length, noConclusionPersistCount);
assert.equal(noConclusionHarness.conclusions.length, 0);
assert.equal(noConclusionHarness.state.campaign.status, 'active');
assert.equal(noConclusionHarness.state.conclusion?.terminalOutcome, undefined);
assert.equal(noConclusionHarness.state.runtimeTracking.pendingInteractions[0].status, 'pending');
assert.equal(noConclusionHarness.state.runtimeTracking.endConditionLedger.decisions[0].status, 'pending');

console.log('Campaign end-condition service tests passed: checkpoint post, branch save, Push On, replay, and keep-ending conclusion');
