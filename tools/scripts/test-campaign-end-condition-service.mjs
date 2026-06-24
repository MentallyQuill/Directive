import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createCampaignEndConditionService } from '../../src/runtime/campaign-end-condition-service.mjs';
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

function createHarness(initial = terminalState()) {
  let state = cloneJson(initial);
  const persisted = [];
  const promptSyncs = [];
  const postedMessages = [];
  const savedBranches = [];
  const conclusions = [];
  let nowIndex = 0;
  const now = () => `2026-06-23T10:00:${String(nowIndex++).padStart(2, '0')}.000Z`;
  const service = createCampaignEndConditionService({
    host: {
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
    },
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
    saveTerminalBranch: async (options) => {
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
    },
    concludeCampaign: async (options) => {
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
    },
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
    conclusions
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
assert.match(postHarness.postedMessages[0].text, /Directive Checkpoint/);
assert.match(postHarness.postedMessages[0].text, /Replay from checkpoint/);
assert.equal(postHarness.state.runtimeTracking.endConditionLedger.decisions[0].postedAt !== null, true);
const duplicatePost = await postHarness.service.postCheckpointDecision({ interactionId: postInteractionId });
assert.equal(duplicatePost.duplicate, true);
assert.equal(postHarness.postedMessages.length, 1);

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

const replayHarness = createHarness();
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

const ledgerOnlyReplayHarness = createHarness();
const ledgerOnlyReplayInteractionId = await detect(ledgerOnlyReplayHarness);
const ledgerOnlyState = cloneJson(ledgerOnlyReplayHarness.state);
ledgerOnlyState.runtimeTracking.pendingInteractions = [];
ledgerOnlyReplayHarness.setState(ledgerOnlyState);
const ledgerOnlyReplayed = await ledgerOnlyReplayHarness.service.resolveDecision({
  interactionId: ledgerOnlyReplayInteractionId,
  action: 'replayFromCheckpoint'
});
assert.equal(ledgerOnlyReplayed.ok, true);
assert.equal(ledgerOnlyReplayHarness.state.campaign.checkpointMarker, 'before-terminal-outcome');
assert.equal(ledgerOnlyReplayHarness.state.runtimeTracking.endConditionLedger.decisions[0].status, 'replayed');

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

console.log('Campaign end-condition service tests passed: checkpoint post, branch save, Push On, replay, and keep-ending conclusion');
