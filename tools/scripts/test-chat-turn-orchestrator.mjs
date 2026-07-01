import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  classifyChatTurn,
  shouldPreemptHostGenerationForTurn
} from '../../src/adjudication/utility-turn-classifier.mjs';
import { createFakeChatAdapter, createFakePromptAdapter } from '../../src/hosts/fake/fake-host.mjs';
import {
  migrateCommandBearingState,
  readyCommandBearingPoint
} from '../../src/command/command-bearing.mjs';
import { createChatTurnOrchestrator } from '../../src/runtime/chat-turn-orchestrator.mjs';
import { createResponseDispatcher } from '../../src/runtime/response-dispatcher.mjs';
import { buildContinuityProjectionMatrix } from '../../src/continuity/index.mjs';
import {
  createStateDeltaGateway,
  initializeCampaignRuntimeTracking,
  recordDirectiveResponse,
  recordRecoveryEvent,
  recordTurnIngress,
  updateTurnIngress
} from '../../src/runtime/state-delta-gateway.mjs';

const root = process.cwd();
const readJson = (filePath) => JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
const cloneJson = (value) => JSON.parse(JSON.stringify(value));
const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (const char of String(text || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

const chat = createFakeChatAdapter({ chatId: 'campaign-chat' });
const hostGenerationContinuations = [];
chat.continueHostGeneration = async (payload = {}) => {
  hostGenerationContinuations.push(cloneJson(payload));
  return {
    ok: true,
    skipped: false,
    released: true,
    waitForCompletion: payload.waitForCompletion,
    reason: payload.reason || null,
    generationStartedAt: now(),
    hostGenerationReleasedAt: now()
  };
};
const prompt = createFakePromptAdapter();
let campaignState = initializeCampaignRuntimeTracking(cloneJson(projection.initialState));
campaignState.campaign = {
  ...campaignState.campaign,
  id: 'campaign-orchestration-test',
  title: 'Ashes of Peace',
  status: 'active'
};
campaignState.campaignChatBinding = {
  hostId: 'fake',
  chatId: 'campaign-chat',
  campaignId: campaignState.campaign.id,
  saveId: 'save-orchestration-test',
  promptContextRevision: 1
};

const persisted = [];
const sidecarCalls = [];
const previewCalls = [];
const commitCalls = [];
const responseSwipeGenerationCalls = [];
const postCommitConversationCalls = [];
const advisoryEnrichmentCalls = [];
const forgeSceneSealCalls = [];
const forgePressureArcDigestCalls = [];
const forgeOpenWorldBoundaryCalls = [];
const promptFrames = [];
const coreBeginCalls = [];
const coreAdvanceCalls = [];
const coreSupersedeCalls = [];
const coreDiagnosticCalls = [];
const coreRecoveryCalls = [];
const coreTransactions = new Map();
let pendingTurn = null;
let nextCommandBearingPrompt = null;
let nextPreviewOutcomeBand = null;
let nextNarrationResult = null;
let sequence = 0;
const now = () => `2026-06-22T01:00:${String(sequence++).padStart(2, '0')}.000Z`;
const getCampaignState = () => campaignState;
const setCampaignState = (next) => { campaignState = cloneJson(next); };
const persistCampaignState = async (next, summary) => {
  campaignState = cloneJson(next);
  persisted.push({ summary: cloneJson(summary), revision: next.runtimeTracking?.revision || 0 });
  return { ok: true };
};

const stateDeltaGateway = createStateDeltaGateway({
  getState: getCampaignState,
  setState: setCampaignState,
  persist: persistCampaignState,
  now
});
const coreTurnStore = {
  async beginTurn(sourceFrame, options = {}) {
    coreBeginCalls.push({ sourceFrame: cloneJson(sourceFrame), options: cloneJson(options) });
    const transaction = {
      id: options.transactionId || `txn:${sourceFrame.id}`,
      phase: 'observed',
      sourceFrameId: sourceFrame.id
    };
    coreTransactions.set(transaction.id, cloneJson(transaction));
    return transaction;
  },
  async advanceTurn(transactionId, phasePatch = {}) {
    coreAdvanceCalls.push({ transactionId, phasePatch: cloneJson(phasePatch) });
    const existing = coreTransactions.get(transactionId) || { id: transactionId };
    const transaction = {
      ...existing,
      id: transactionId,
      phase: phasePatch.phase || 'observed',
      route: phasePatch.route || null
    };
    coreTransactions.set(transactionId, cloneJson(transaction));
    return transaction;
  },
  async supersedeLatestSourceTransaction(priorTransactionId, replacementTransactionId, options = {}) {
    coreSupersedeCalls.push({
      priorTransactionId,
      replacementTransactionId,
      options: cloneJson(options)
    });
    coreTransactions.set(priorTransactionId, {
      ...(coreTransactions.get(priorTransactionId) || { id: priorTransactionId }),
      phase: 'restartSuperseded'
    });
    coreTransactions.set(replacementTransactionId, {
      ...(coreTransactions.get(replacementTransactionId) || { id: replacementTransactionId }),
      phase: 'observed'
    });
    return {
      status: 'recorded',
      transaction: {
        id: replacementTransactionId,
        phase: 'observed'
      },
      priorTransaction: {
        id: priorTransactionId,
        phase: 'restartSuperseded'
      },
      sourceRestart: {
        priorTransactionId,
        newTransactionId: replacementTransactionId,
        reason: options.reason || 'latest-source-reobserved',
        recoveryId: options.priorRecoveryId || null
      }
    };
  },
  async markRecoveryRequired(transactionId, recoveryBundle = {}) {
    coreRecoveryCalls.push({ transactionId, recoveryBundle: cloneJson(recoveryBundle) });
    const recoveryCase = {
      id: recoveryBundle.id || `recovery:${transactionId}`,
      phase: recoveryBundle.phaseAfter || 'recoveryRequired',
      reason: recoveryBundle.reason || null,
      allowedActions: cloneJson(recoveryBundle.allowedActions || [])
    };
    coreTransactions.set(transactionId, {
      ...(coreTransactions.get(transactionId) || { id: transactionId }),
      phase: recoveryCase.phase,
      recoveryCaseId: recoveryCase.id
    });
    return recoveryCase;
  },
  async getTransaction(transactionId) {
    return cloneJson(coreTransactions.get(transactionId) || null);
  },
  async appendDiagnostics(transactionId, diagnostic = {}) {
    coreDiagnosticCalls.push({ transactionId, diagnostic: cloneJson(diagnostic) });
    return {
      id: `diagnostic:${coreDiagnosticCalls.length}`,
      transactionId,
      diagnostic: cloneJson(diagnostic)
    };
  }
};
const responseDispatcher = createResponseDispatcher({
  host: { chat },
  coreTurnStore,
  getCampaignState,
  setCampaignState,
  persist: persistCampaignState,
  now
});

const orchestrator = createChatTurnOrchestrator({
  host: { chat, prompt },
  classify: ({ text, context }) => classifyChatTurn({ text, context }),
  responseDispatcher,
  generationRouter: {
    async generate(roleId, request) {
      responseSwipeGenerationCalls.push({ roleId, request: cloneJson(request) });
      if (roleId === 'commandBearingSpendValidator') {
        return {
          ok: true,
          response: {
            providerId: 'fake-command-bearing-validator',
            text: JSON.stringify({
              kind: 'directive.commandBearingFitCheck',
              track: 'resolve',
              fit: 'strong',
              valid: true,
              summary: 'Resolve fits because the player gives a lawful order and accepts responsibility for the cost.',
              whatWorks: ['The message states an order, accepts exposure, and preserves the convoy.'],
              missing: [],
              suggestions: [],
              causalBasis: ['lawful order', 'accepted responsibility', 'credible cost']
            })
          },
          diagnostics: { providerId: 'fake-command-bearing-validator' }
        };
      }
      if (roleId === 'missionDirectorAdvisor') {
        return {
          ok: true,
          response: {
            providerId: 'fake-counsel-provider',
            text: JSON.stringify({
              kind: 'directive.playerSafeAdvisory',
              subject: 'Bridge arrival options',
              missionBrief: 'Sam asked for decision support before choosing how to use the remaining arrival window.',
              logSummary: 'Sam requested options for using the remaining time before reporting to the bridge.',
              involvedCrewIds: ['mara-whitaker'],
              crewNotes: [
                {
                  crewId: 'mara-whitaker',
                  summary: 'The arrival timing question is relevant to Whitaker because it shapes the first ready-room handoff.'
                }
              ],
              considerations: ['Captain availability is not yet established in the player-visible scene.'],
              options: [
                'Settle quarters, then proceed directly to the bridge.',
                'Check in with the duty officer en route.'
              ]
            })
          },
          diagnostics: { providerId: 'fake-counsel-provider' }
        };
      }
      if (roleId === 'sceneHandshakeSettler') {
        if (request.metadata?.previousAssistantHostMessageId === 'assistant-host-handshake') {
          return {
            ok: true,
            response: {
              providerId: 'fake-scene-handshake-provider',
              text: JSON.stringify({
                kind: 'directive.sceneHandshakeSettlement.v1',
                acceptedPreviousResponse: true,
                playerReplyRelation: 'acts-on',
                confidence: 0.91,
                disposition: 'autoCommit',
                needsInternalReview: false,
                internalReviewReasons: [],
                deferReason: null,
                operatorRecoveryOnly: false,
                openAssignmentProposals: [
                  {
                    title: 'Review Cross handoff memo',
                    summary: 'Meet Commander Cross in Engineering and inspect the command-network handoff memo.',
                    assignedByActorId: 'mara-whitaker',
                    linkedCrewIds: ['commander-cross'],
                    linkedShipSystemIds: ['command-network'],
                    dueWindow: 'Before arrival at the Reach.'
                  }
                ],
                commandLogProposals: [
                  {
                    summaryInputs: ['Whitaker assigned Sam to review Cross, meet Bronn, and walk the ship.'],
                    visibleConsequences: ['Sam accepted the captain-issued first-day priorities.']
                  }
                ],
                shipReadinessProposals: [
                  {
                    kind: 'technicalDebt',
                    label: 'Command-network handoff memo',
                    detail: 'Cross has an unresolved command-network handoff issue for Sam to inspect.',
                    owner: 'Commander Cross'
                  }
                ],
                threadSignals: [
                  {
                    title: 'Cross handoff review',
                    summary: 'The command-network handoff memo may reveal an operational risk.',
                    type: 'shipboard_maintenance',
                    linkedCrewIds: ['commander-cross'],
                    directCommitment: true
                  }
                ]
              })
            },
            diagnostics: { providerId: 'fake-scene-handshake-provider' }
          };
        }
        return {
          ok: true,
          response: {
            providerId: 'fake-scene-handshake-provider',
            text: JSON.stringify({
              kind: 'directive.sceneHandshakeSettlement.v1',
              acceptedPreviousResponse: false,
              playerReplyRelation: 'unrelated',
              confidence: 0.2,
              disposition: 'defer',
              needsInternalReview: false,
              internalReviewReasons: [],
              deferReason: 'No host assistant briefing was accepted.'
            })
          },
          diagnostics: { providerId: 'fake-scene-handshake-provider' }
        };
      }
      return {
        ok: true,
        response: {
          providerId: 'fake-response-swipe-provider',
          text: `Alternate Directive response ${responseSwipeGenerationCalls.length}.`
        },
        diagnostics: { providerId: 'fake-response-swipe-provider' }
      };
    }
  },
  stateDeltaGateway,
  coreTurnStore,
  getCampaignState,
  setCampaignState,
  persistCampaignState,
  getPackageData: () => packageData,
  syncPromptContext: async (state, promptFrame = null, options = {}) => {
    promptFrames.push(cloneJson(promptFrame || null));
    options.activityReporter?.({
      phase: 'continuityProjectionBuilding',
      source: options.activitySource || 'testPromptSync',
      mode: 'blocking',
      planner: false,
      ...(options.activityContext || {})
    });
    const next = cloneJson(state);
    next.campaignChatBinding.promptContextRevision += 1;
    await prompt.install({
      binding: next.campaignChatBinding,
      packet: {
        revision: next.campaignChatBinding.promptContextRevision,
        blocks: [{ id: 'active-scene', text: 'Player-safe scene context.', depth: 4, role: 'system' }]
      }
    });
    options.activityReporter?.({
      phase: 'continuityProjectionInstalled',
      source: options.activitySource || 'testPromptSync',
      mode: 'blocking',
      planner: false,
      status: 'complete',
      revision: next.campaignChatBinding.promptContextRevision,
      blockCount: 1,
      ...(options.activityContext || {})
    });
    return next;
  },
  previewDirectorTurn: async ({ turnId, playerInput }) => {
    const outcomeId = `outcome-${previewCalls.length + 1}`;
    const commandBearingPrompt = nextCommandBearingPrompt || { eligible: false };
    nextCommandBearingPrompt = null;
    pendingTurn = {
      turnId,
      sceneSnapshot: {
        sceneId: 'scene-bridge-intercept',
        activePhaseId: 'phase-bridge-intercept',
        locationId: 'breckenridge-bridge',
        presentCharacters: ['sam-vickers', 'mara-whitaker']
      },
      outcomePacket: {
        id: outcomeId,
        resultBand: nextPreviewOutcomeBand || commandBearingPrompt.actions?.[0]?.from || 'success',
        visibleConsequences: ['The order changes the tactical posture.']
      },
      stateDelta: {
        mission: {
          phaseAdvance: {
            from: 'phase-bridge-watch',
            to: 'phase-bridge-intercept',
            availableDecisionPointIds: ['decision.bridge-intercept-followup']
          }
        },
        openWorld: {
          reducerBundle: {
            kind: 'directive.openWorldReducerBundle.v1',
            sourceOutcomeId: outcomeId,
            sourceEventIds: [`event-${outcomeId}-1`],
            sourceAnchorRange: {
              rangeHash: `range-hash-${outcomeId}`,
              hostMessageIds: ['RAW_OPEN_WORLD_HOST_MESSAGE_RANGE']
            },
            operations: [{
              type: 'value.set',
              path: ['worldState', 'currentLocationId'],
              value: 'RAW_OPEN_WORLD_OPERATION_VALUE'
            }, {
              type: 'collection.mergeById',
              path: ['questLedger', 'instances'],
              upsert: [{
                id: `quest-${outcomeId}`,
                title: 'RAW_OPEN_WORLD_QUEST_TITLE'
              }],
              remove: []
            }],
            diagnostics: {
              operationCount: 2,
              changedRoots: ['worldState', 'questLedger'],
              boundaryType: 'locationTransition',
              eventCount: 1,
              reactionCount: 0,
              checkpointRequired: true
            }
          }
        }
      },
      commandLogPacket: {
        visibleConsequences: ['The order changes the tactical posture.']
      }
    };
    nextPreviewOutcomeBand = null;
    previewCalls.push({ turnId, playerInput, outcomeId });
    return {
      turnPacket: cloneJson(pendingTurn),
      commandBearingPrompt: cloneJson(commandBearingPrompt),
      warningConfirmation: { required: false }
    };
  },
  commitProvisionalDirectorTurn: async ({ confirmWarnings = false, readiedCommandBearing = null } = {}) => {
    assert.ok(pendingTurn, 'A provisional Director turn must exist before commit.');
    const turnPacket = cloneJson(pendingTurn);
    pendingTurn = null;
    const next = initializeCampaignRuntimeTracking(campaignState);
    if (readiedCommandBearing) {
      next.commandBearing = cloneJson(next.commandBearing || next.commandBearing || {});
      next.commandBearing.readied = null;
      next.commandBearing.spendLedger = next.commandBearing.spendLedger || {};
      next.commandBearing.spendLedger[turnPacket.outcomePacket.id] = {
        outcomeId: turnPacket.outcomePacket.id,
        readiedId: readiedCommandBearing.id || readiedCommandBearing.readiedId || '',
        ingressId: readiedCommandBearing.ingressId || '',
        hostMessageId: readiedCommandBearing.hostMessageId || '',
        track: readiedCommandBearing.track,
        from: turnPacket.outcomePacket.resultBand,
        to: readiedCommandBearing.track === 'resolve' ? 'Partial Success' : 'Success',
        rationale: readiedCommandBearing.rationale || ''
      };
      next.commandBearing = cloneJson(next.commandBearing);
    }
    next.commandLog = next.commandLog || { entries: [] };
    next.commandLog.entries = next.commandLog.entries || [];
    next.commandLog.entries.push({
      id: `command-log-${turnPacket.outcomePacket.id}`,
      type: 'consequentialCommand',
      outcomeId: turnPacket.outcomePacket.id,
      visibleConsequences: cloneJson(turnPacket.commandLogPacket.visibleConsequences)
    });
    next.runtimeTracking.lastCommittedTurn = {
      turnId: turnPacket.turnId,
      outcomeId: turnPacket.outcomePacket.id,
      resultBand: turnPacket.outcomePacket.resultBand,
      narrationStatus: 'complete',
      responseStatus: 'pending',
      committedAt: now()
    };
    setCampaignState(next);
    await persistCampaignState(next, 'Stub mechanics committed before narration.');
    commitCalls.push({
      confirmWarnings,
      outcomeId: turnPacket.outcomePacket.id,
      readiedCommandBearing: cloneJson(readiedCommandBearing)
    });
    const directiveGenerationStartedAt = `2026-06-22T01:30:${String(commitCalls.length).padStart(2, '0')}.000Z`;
    const narrationResult = nextNarrationResult || {
      ok: true,
      directiveGenerationStartedAt,
      narration: {
        text: `Committed narration for ${turnPacket.outcomePacket.id}.`,
        generatedAt: directiveGenerationStartedAt,
        directiveGenerationStartedAt
      }
    };
    nextNarrationResult = null;
    return {
      campaignState: cloneJson(next),
      turnPacket,
      narrationResult
    };
  },
  discardProvisionalDirectorTurn: async () => { pendingTurn = null; },
  turnCommitCoordinator: {
    async markResponse({ campaignState: state, outcomeId, status, hostMessageId }) {
      const next = initializeCampaignRuntimeTracking(state);
      assert.equal(next.runtimeTracking.lastCommittedTurn.outcomeId, outcomeId);
      next.runtimeTracking.lastCommittedTurn.responseStatus = status;
      next.runtimeTracking.lastCommittedTurn.hostMessageId = hostMessageId;
      setCampaignState(next);
      await persistCampaignState(next, 'Response checkpoint updated.');
      return { campaignState: next };
    }
  },
  sidecarScheduler: {
    schedule(payload) {
      sidecarCalls.push(cloneJson(payload));
      if (typeof payload.activityReporter === 'function') {
        const requested = Object.keys(payload.workerPlan || {}).filter((key) => payload.workerPlan[key] === true);
        payload.activityReporter({
          phase: 'sidecarsQueued',
          mode: 'background',
          requested,
          classification: payload.turnContext?.classification || null
        });
      }
      return Promise.resolve({ ok: true });
    }
  },
  forgeCoordinator: {
    settleScenePhaseSeal(payload) {
      forgeSceneSealCalls.push(cloneJson(payload));
      return Promise.resolve({
        status: 'settled',
        applied: true,
        batch: {
          recallRevisions: {
            recallIndexRevision: 'recall-revision-orchestrator',
            sceneSealRevision: 'scene-seal-revision-orchestrator'
          }
        }
      });
    },
    settlePressureArcDigest(payload) {
      forgePressureArcDigestCalls.push(cloneJson(payload));
      return Promise.resolve({
        status: 'settled',
        applied: true,
        batch: {
          recallRevisions: {
            recallIndexRevision: 'recall-revision-orchestrator',
            pressureArcDigestRevision: 'pressure-arc-revision-orchestrator'
          }
        }
      });
    },
    settleOpenWorldBoundary(payload) {
      forgeOpenWorldBoundaryCalls.push(cloneJson(payload));
      return Promise.resolve({
        status: 'settled',
        applied: true,
        batch: {
          backgroundEffectRefs: [{
            kind: 'directive.openWorldBoundarySettlementRef.v1',
            id: `open-world-boundary:${payload.outcomeId}`,
            status: 'accepted'
          }]
        }
      });
    }
  },
  schedulePostCommitConversationProcessor: (conversation) => {
    postCommitConversationCalls.push(cloneJson(conversation));
    return {
      kind: 'directive.postCommitConversationScheduled',
      scheduled: true,
      status: 'queued',
      outcomeId: conversation.outcomeId || null
    };
  },
  scheduleAdvisoryEnrichmentProcessor: (payload) => {
    advisoryEnrichmentCalls.push({
      payload: {
        ingressId: payload.ingressId || null,
        advisoryId: payload.advisoryId || null,
        sourceMessageId: payload.sourceMessageId || null,
        playerTextHash: payload.playerTextHash || null,
        fallbackAdvisoryHash: payload.fallbackAdvisoryHash || null
      },
      hasRun: typeof payload.run === 'function',
      hostGenerationContinuationCount: hostGenerationContinuations.length,
      missionDirectorAdvisorCallCount: responseSwipeGenerationCalls.filter((call) => call.roleId === 'missionDirectorAdvisor').length
    });
    return {
      kind: 'directive.advisoryEnrichmentScheduled',
      scheduled: true,
      status: 'queued',
      ingressId: payload.ingressId || null,
      advisoryId: payload.advisoryId || null
    };
  },
  now
});

async function send(text, hostMessageId, options = {}) {
  const message = chat.pushPlayerMessage({ text, hostMessageId });
  return orchestrator.observePlayerMessage({
    chatId: 'campaign-chat',
    message,
    turnActivityReporter: options.activityReporter
  });
}

const wrongSaveIngressCount = campaignState.runtimeTracking.ingressLedger.length;
await chat.bindCurrentChat({
  campaignId: campaignState.campaign.id,
  saveId: 'save-other-branch'
});
const wrongSaveBranch = await send('This post belongs to a different save branch.', 'player-wrong-save-branch');
assert.equal(wrongSaveBranch.handled, false);
assert.equal(wrongSaveBranch.reason, 'inactive-or-unbound');
assert.equal(campaignState.runtimeTracking.ingressLedger.length, wrongSaveIngressCount);
await chat.bindCurrentChat({
  campaignId: campaignState.campaign.id,
  saveId: campaignState.campaignChatBinding.saveId
});

chat.pushAssistantMessage({
  hostMessageId: 'assistant-host-handshake',
  text: [
    'Whitaker gave Sam three clear priorities.',
    'First, review Commander Cross and the command-network handoff memo in Engineering.',
    'Second, meet Bronn on alpha shift.',
    'Third, walk the ship and talk to department heads before arrival.'
  ].join('\n'),
  swipes: [
    'Discarded draft: Whitaker tells Sam to ignore Commander Cross and cancel the handoff memo.',
    'Discarded draft: Bronn, a human male in his early forties, gives Sam a contradictory handoff.',
    [
      'Whitaker gave Sam three clear priorities.',
      'First, review Commander Cross and the command-network handoff memo in Engineering.',
      'Second, meet Bronn on alpha shift.',
      'Third, walk the ship and talk to department heads before arrival.'
    ].join('\n')
  ],
  swipeId: 2
});
const formalObjectiveCountBeforeHandshake = campaignState.mission.formalObjectives.length;
const elapsedMinutesBeforeHandshake = campaignState.worldState?.elapsedMinutes ?? 0;
const timeLedgerEntriesBeforeHandshake = campaignState.timeLedger?.entries?.length || 0;
const handshakeActivity = [];
const handshake = await send(
  '*Sam spends 10 minutes reviewing Whitaker\'s three priorities, then nods once before he leaves the ready room.*',
  'player-scene-handshake',
  { activityReporter: (event) => handshakeActivity.push(cloneJson(event)) }
);
assert.equal(handshake.handled, true);
assert.equal(handshakeActivity.some((event) => event.phase === 'settlingSceneHandshake' && event.source === 'sceneHandshake'), true);
const sreHandshakePreflight = handshakeActivity.find((event) => event.phase === 'sreSceneHandshakePreflight');
assert(sreHandshakePreflight, 'Scene Handshake should run an SRE diagnostic preflight before provider settlement.');
assert.equal(sreHandshakePreflight.source, 'sre');
assert.equal(sreHandshakePreflight.mode, 'diagnostic');
assert.equal(sreHandshakePreflight.status, 'preflightClean');
assert.equal(sreHandshakePreflight.providerCalled, false);
assert.equal(sreHandshakePreflight.applied, false);
const handshakeSettledActivity = handshakeActivity.find((event) => event.phase === 'sceneHandshakeSettled');
assert.equal(handshakeSettledActivity.source, 'sceneHandshake');
assert.equal(handshakeSettledActivity.disposition, 'autoCommit');
assert(handshakeSettledActivity.committedRoots.includes('mission'));
assert(handshakeSettledActivity.operationCount > 0);
assert.ok(handshakeActivity.some((event) => (
  event.phase === 'continuityProjectionBuilding'
  && event.source === 'sceneHandshake'
  && String(event.ingressId || '').includes('player-scene-handshake')
)));
assert.ok(handshakeActivity.some((event) => (
  event.phase === 'continuityProjectionInstalled'
  && event.source === 'sceneHandshake'
  && event.status === 'complete'
)));
assert.equal(campaignState.mission.openAssignments.some((entry) => entry.title === 'Review Cross handoff memo'), true);
assert.equal(campaignState.commandLog.entries.some((entry) => entry.type === 'sceneHandshake'), true);
const handshakeShipDebt = campaignState.ship.technicalDebt.find((entry) => /command-network/i.test(`${entry.label || ''} ${entry.detail || ''} ${entry.playerSafeSummary || ''}`));
assert.equal(handshakeShipDebt.handshakeReinforced, true);
assert.equal(Array.isArray(handshakeShipDebt.sourceSettlementIds), true);
assert.equal(campaignState.threadLedger.records.some((entry) => entry.title === 'Cross handoff review'), true);
assert.equal(campaignState.runtimeTracking.sceneHandshake.settled.length, 1);
assert.equal(campaignState.mission.formalObjectives.length, formalObjectiveCountBeforeHandshake);
assert.equal(campaignState.worldState.elapsedMinutes, elapsedMinutesBeforeHandshake + 10);
assert.equal(campaignState.timeLedger.elapsedMinutes, elapsedMinutesBeforeHandshake + 10);
assert.equal(campaignState.timeLedger.entries.length, timeLedgerEntriesBeforeHandshake + 1);
assert.equal(campaignState.timeLedger.entries.at(-1).sourceAnchorRange.kind, 'sceneHandshakePair');
assert.ok(handshakeActivity.some((event) => event.phase === 'timeBoundaryAlreadyCommitted' && event.existingSource === 'sceneHandshakePair'));
const handshakeIngress = campaignState.runtimeTracking.ingressLedger.find((entry) => entry.hostMessageId === 'player-scene-handshake');
const handshakeSreDiagnostic = coreDiagnosticCalls.find((entry) => (
  entry.transactionId === handshakeIngress.coreTransactionId
  && entry.diagnostic.type === 'sourceSettlement'
  && entry.diagnostic.diagnosticOnly === true
));
assert(handshakeSreDiagnostic, 'SRE preflight should append a diagnostic to the ingress CORE transaction.');
assert.equal(handshakeSreDiagnostic.diagnostic.status, 'preflightClean');
assert.equal(handshakeSreDiagnostic.diagnostic.decision.providerCalled, false);
assert.equal(handshakeSreDiagnostic.diagnostic.decision.applied, false);
assert.equal(handshakeSreDiagnostic.diagnostic.decision.sourceFrameId, handshakeIngress.sourceFrameId);
assert.equal(JSON.stringify(handshakeSreDiagnostic).includes('Sam spends 10 minutes'), false);
const handshakeRequest = responseSwipeGenerationCalls.find((entry) => (
  entry.roleId === 'sceneHandshakeSettler'
  && entry.request.metadata.previousAssistantHostMessageId === 'assistant-host-handshake'
));
assert(handshakeRequest, 'Scene Handshake request should be captured for the selected-swipe acceptance test.');
assert.equal(handshakeRequest.request.metadata.selectedAssistantVariant.selectedSwipeIndex, 2);
assert.equal(handshakeRequest.request.metadata.selectedAssistantVariant.swipeCount, 3);
assert.equal(
  handshakeRequest.request.metadata.selectedAssistantVariant.selectedTextHash,
  handshakeRequest.request.metadata.sourceTextHashes.previousAssistant
);
assert.match(handshakeRequest.request.prompt, /Whitaker gave Sam three clear priorities/);
assert.doesNotMatch(handshakeRequest.request.prompt, /ignore Commander Cross/i);
assert.doesNotMatch(handshakeRequest.request.prompt, /human male in his early forties/i);
const settledHandshake = campaignState.runtimeTracking.sceneHandshake.settled.at(-1);
assert.equal(settledHandshake.selectedAssistantVariant.selectedSwipeIndex, 2);
assert.equal(settledHandshake.selectedAssistantVariant.swipeCount, 3);
assert.equal(settledHandshake.selectedAssistantVariant.sourceIntegrity, 'clean');
assert.equal(
  settledHandshake.selectedAssistantVariant.selectedTextHash,
  settledHandshake.sourceTextHashes.previousAssistant
);
const handshakePromptFrame = promptFrames.find((frame) => frame?.acceptedAssistantVariant?.hostMessageId === 'assistant-host-handshake');
assert(handshakePromptFrame, 'Prompt sync after Scene Handshake should carry the accepted selected assistant variant.');
assert.equal(handshakePromptFrame.acceptedAssistantVariant.selectedSwipeIndex, 2);
assert.equal(handshakePromptFrame.acceptedAssistantVariant.swipeCount, 3);
assert.equal(handshakePromptFrame.acceptedAssistantVariant.selectedTextHash, settledHandshake.selectedAssistantVariant.selectedTextHash);

const color = await send('*I nod once to the helmsman.*', 'player-color');
assert.equal(color.decision.classification, 'sceneColor');
assert.equal(color.abortDefaultGeneration, false);
assert.equal(chat.messages().filter((entry) => entry.isDirectiveOwned).length, 0);
const colorIngress = campaignState.runtimeTracking.ingressLedger.find((entry) => entry.hostMessageId === 'player-color');
const colorResponse = campaignState.runtimeTracking.responseLedger.at(-1);
const colorCoreBegin = coreBeginCalls.find((entry) => entry.options.ingressId === colorIngress.id);
assert(colorCoreBegin, 'CORE ingress bridge should begin a transaction before old ingress projection.');
const colorCoreAdvances = coreAdvanceCalls.filter((entry) => entry.transactionId === colorIngress.coreTransactionId);
assert.equal(colorResponse.strategy, 'injectAndContinue');
assert.equal(hostGenerationContinuations.at(-1).waitForCompletion, false);
assert.equal(colorResponse.status, 'released');
assert.equal(colorResponse.hostGenerationReleaseMode, 'nonblocking');
assert.equal(colorResponse.sourceFrameId, colorIngress.sourceFrameId);
assert.equal(colorIngress.coreTransactionId, colorCoreBegin.options.transactionId);
assert.equal(colorCoreBegin.sourceFrame.id, colorIngress.sourceFrameId);
assert.deepEqual(
  colorCoreAdvances.map((entry) => entry.phasePatch.phase),
  ['routePending', 'hostContinueReleased'],
  'CORE bridge should advance observed ingress through routePending to hostContinueReleased.'
);
assert.equal(colorCoreAdvances[1].phasePatch.route, 'hostContinue');
assert.equal(colorCoreAdvances[1].phasePatch.timing.hostGenerationReleasedAt, colorResponse.hostGenerationReleasedAt);
assert.equal(colorCoreAdvances[1].phasePatch.timing.architectureWithin60s, true);
assert.match(colorIngress.sourceFrameId, /^frame:ingress:/);
assert.equal(colorIngress.sourceFrame.kind, 'directive.turnSourceFrame.v1');
assert.equal(colorIngress.sourceFrame.externalPromptEnvironmentRef.status, 'unknown');
assert.equal(colorResponse.turnLatency.architectureWithin60s, true);

const coreBeginCountBeforeColorDuplicate = coreBeginCalls.length;
const coreAdvanceCountBeforeColorDuplicate = coreAdvanceCalls.length;
const colorDuplicate = await orchestrator.observePlayerMessage({
  chatId: 'campaign-chat',
  message: chat.getMessage('player-color')
});
assert.equal(colorDuplicate.deduplicated, true);
assert.equal(colorDuplicate.abortDefaultGeneration, false);
assert.equal(coreBeginCalls.length, coreBeginCountBeforeColorDuplicate, 'Duplicate observation must not begin another CORE transaction.');
assert.equal(coreAdvanceCalls.length, coreAdvanceCountBeforeColorDuplicate, 'Duplicate observation must not advance CORE release again.');
assert.equal(campaignState.runtimeTracking.responseLedger.filter((entry) => entry.ingressId?.includes('player-color')).length, 1);

const ingressCountBeforeCoreFailure = campaignState.runtimeTracking.ingressLedger.length;
const persistedCountBeforeCoreFailure = persisted.length;
const failingCoreOrchestrator = createChatTurnOrchestrator({
  host: { chat, prompt },
  classify: async () => {
    throw new Error('CORE ingress failure fixture must not classify after CORE begin fails.');
  },
  responseDispatcher,
  stateDeltaGateway,
  coreTurnStore: {
    async beginTurn() {
      const error = new Error('Synthetic CORE begin failure.');
      error.code = 'DIRECTIVE_CORE_BEGIN_FAILED';
      throw error;
    }
  },
  getCampaignState,
  setCampaignState,
  persistCampaignState,
  syncPromptContext: async (state) => state,
  previewDirectorTurn: async () => {
    throw new Error('CORE ingress failure fixture must not preview a Director turn.');
  },
  commitProvisionalDirectorTurn: async () => {
    throw new Error('CORE ingress failure fixture must not commit a Director turn.');
  },
  discardProvisionalDirectorTurn: async () => {},
  now
});
const coreFailureMessage = chat.pushPlayerMessage({
  text: '*Sam glances once toward ops and waits for the board to settle.*',
  hostMessageId: 'player-core-ingress-failure'
});
await assert.rejects(
  () => failingCoreOrchestrator.observePlayerMessage({
    chatId: 'campaign-chat',
    message: coreFailureMessage
  }),
  /Synthetic CORE begin failure/
);
assert.equal(campaignState.runtimeTracking.ingressLedger.length, ingressCountBeforeCoreFailure);
assert.equal(
  campaignState.runtimeTracking.ingressLedger.some((entry) => entry.hostMessageId === 'player-core-ingress-failure'),
  false,
  'A CORE begin failure must not leave an old-ledger-only ingress projection.'
);
assert.equal(persisted.length, persistedCountBeforeCoreFailure, 'A CORE begin failure must not persist campaign state.');

const missingCoreRecoveryWriterOrchestrator = createChatTurnOrchestrator({
  host: { chat, prompt },
  classify: async () => ({
    kind: 'directive.validatedTurnDecision',
    classification: 'locationTransition',
    confidence: 0.92,
    ambiguity: 'low',
    speechAct: 'movement',
    action: 'walk to engineering',
    target: 'engineering',
    targetConfidence: 0.85,
    domainSignals: ['location-transition'],
    riskSignals: [],
    missingInformation: [],
    pendingInteractionResolution: null,
    mixedIntent: false,
    reasons: ['Fixture should reach Directive response dispatch.'],
    workerPlan: {},
    responseStrategy: 'directivePosted',
    source: 'utility-provider'
  }),
  responseDispatcher: {
    async dispatch() {
      const error = new Error('Synthetic response post failure with missing CORE recovery writer.');
      error.code = 'DIRECTIVE_TEST_RESPONSE_POST_FAILED';
      throw error;
    }
  },
  stateDeltaGateway,
  coreTurnStore: {
    async beginTurn(sourceFrame, options = {}) {
      return {
        id: options.transactionId || `txn:${sourceFrame.id}`,
        phase: 'observed',
        sourceFrameId: sourceFrame.id
      };
    },
    async advanceTurn(transactionId, phasePatch = {}) {
      return {
        id: transactionId,
        phase: phasePatch.phase || 'observed',
        route: phasePatch.route || null
      };
    }
  },
  getCampaignState,
  setCampaignState,
  persistCampaignState,
  syncPromptContext: async (state) => state,
  previewDirectorTurn: async () => {
    throw new Error('Missing CORE recovery writer fixture must not preview a Director turn.');
  },
  commitProvisionalDirectorTurn: async () => {
    throw new Error('Missing CORE recovery writer fixture must not commit a Director turn.');
  },
  discardProvisionalDirectorTurn: async () => {},
  sidecarScheduler: {
    schedule() {
      return Promise.resolve({ ok: true });
    }
  },
  now
});
const missingCoreRecoveryMessage = chat.pushPlayerMessage({
  text: 'I head to Engineering while the channel clears.',
  hostMessageId: 'player-core-recovery-writer-missing'
});
const missingCoreRecoveryResult = await missingCoreRecoveryWriterOrchestrator.observePlayerMessage({
  chatId: 'campaign-chat',
  message: missingCoreRecoveryMessage
});
assert.equal(missingCoreRecoveryResult.recoveryRequired, true);
assert.equal(missingCoreRecoveryResult.error.code, 'DIRECTIVE_CORE_RESPONSE_RECOVERY_NOT_RECORDED');
assert.match(missingCoreRecoveryResult.error.message, /CORE response recovery was not recorded/);
const missingCoreRecoveryIngress = campaignState.runtimeTracking.ingressLedger.find(
  (entry) => entry.hostMessageId === 'player-core-recovery-writer-missing'
);
assert.ok(missingCoreRecoveryIngress?.coreTransactionId, 'Fixture must prove this was a CORE-backed turn.');
assert.equal(
  campaignState.runtimeTracking.recoveryJournal.some((entry) => (
    entry.type === 'hostResponsePostFailure'
    && entry.ingressId === missingCoreRecoveryIngress.id
  )),
  false,
  'A CORE-backed response failure must not fall back to an old-ledger-only recovery.'
);

const oldLedgerRetryBaselineState = cloneJson(campaignState);
const oldLedgerRetryPersistedBefore = persisted.length;
const oldLedgerRetryIngressId = 'ingress-old-ledger-response-retry';
const oldLedgerRetryRecoveryId = 'recovery-old-ledger-response-retry';
let oldLedgerRetryFixtureState = recordTurnIngress(campaignState, {
  id: oldLedgerRetryIngressId,
  hostMessageId: 'player-old-ledger-response-retry',
  chatId: 'campaign-chat',
  campaignId: campaignState.campaign?.id,
  textHash: fnv1a('Retry should be owned by REPAIR, not old ledgers.'),
  textPreview: 'Retry should be owned by REPAIR, not old ledgers.',
  sourceFrameId: 'source-old-ledger-response-retry',
  status: 'recoveryRequired',
  responseStrategy: 'directivePosted',
  turnId: 'turn-old-ledger-response-retry',
  outcomeId: 'outcome-old-ledger-response-retry',
  coreTransactionId: null
});
oldLedgerRetryFixtureState = recordRecoveryEvent(oldLedgerRetryFixtureState, {
  id: oldLedgerRetryRecoveryId,
  type: 'hostResponsePostFailure',
  status: 'open',
  ingressId: oldLedgerRetryIngressId,
  outcomeId: 'outcome-old-ledger-response-retry',
  recordedAt: now(),
  details: {
    strategy: 'directivePosted',
    text: 'This retry must not dispatch without REPAIR authority.',
    turnId: 'turn-old-ledger-response-retry',
    responseKind: 'committedOutcome',
    responseIdempotencyKey: 'directive-response-retry:old-ledger-only',
    classification: 'directorResponseNeeded',
    workerPlan: {},
    repairDecision: {
      authorized: false,
      reason: 'missing-core-transaction'
    }
  }
});
setCampaignState(oldLedgerRetryFixtureState);
const oldLedgerRetryDispatchCalls = [];
const oldLedgerRetryRepairDecisions = [];
const oldLedgerRetryOrchestrator = createChatTurnOrchestrator({
  host: { chat, prompt },
  classify: async () => {
    throw new Error('Old-ledger response retry fixture must not classify.');
  },
  responseDispatcher: {
    async dispatch(payload) {
      oldLedgerRetryDispatchCalls.push(cloneJson(payload));
      return {
        campaignState: payload.campaignState,
        response: {
          hostMessageId: 'assistant-old-ledger-response-retry',
          text: 'Unauthorized retry should not post.'
        }
      };
    }
  },
  repairRuntime: {
    authorizeRetry(input) {
      oldLedgerRetryRepairDecisions.push(cloneJson(input));
      return {
        authorized: false,
        reason: 'missing-core-transaction',
        transactionId: input.transactionId || null
      };
    }
  },
  stateDeltaGateway,
  getCampaignState,
  setCampaignState,
  persistCampaignState,
  syncPromptContext: async (state) => state,
  previewDirectorTurn: async () => {
    throw new Error('Old-ledger response retry fixture must not preview a Director turn.');
  },
  commitProvisionalDirectorTurn: async () => {
    throw new Error('Old-ledger response retry fixture must not commit a Director turn.');
  },
  discardProvisionalDirectorTurn: async () => {},
  now
});
try {
  const oldLedgerRetry = await oldLedgerRetryOrchestrator.retryCommittedResponse({
    recoveryId: oldLedgerRetryRecoveryId
  });
  assert.equal(oldLedgerRetry.ok, false);
  assert.equal(oldLedgerRetry.reason, 'response-retry-not-authorized');
  assert.equal(oldLedgerRetry.decision.authorized, false);
  assert.equal(oldLedgerRetry.decision.reason, 'missing-core-transaction');
  assert.equal(oldLedgerRetryRepairDecisions.length, 1);
  assert.equal(oldLedgerRetryRepairDecisions[0].transactionId, null);
  assert.equal(oldLedgerRetryDispatchCalls.length, 0, 'Unauthorized old-ledger retry must not dispatch a response.');
  assert.equal(persisted.length, oldLedgerRetryPersistedBefore, 'Unauthorized old-ledger retry must not persist campaign state.');
  assert.equal(
    getCampaignState().runtimeTracking.recoveryJournal.find((entry) => entry.id === oldLedgerRetryRecoveryId)?.status,
    'open',
    'Unauthorized old-ledger retry must not resolve recovery.'
  );
} finally {
  setCampaignState(oldLedgerRetryBaselineState);
  persisted.splice(oldLedgerRetryPersistedBefore);
}

const commandLogBeforeSceneNavigation = campaignState.commandLog?.entries?.length || 0;
const elapsedMinutesBeforeSceneNavigation = campaignState.worldState?.elapsedMinutes ?? 0;
const timeLedgerEntriesBeforeSceneNavigation = campaignState.timeLedger?.entries?.length || 0;
const sceneNavigationActivity = [];
const sceneNavigation = await send('Cut ahead ten minutes while Sam reviews Bronn\'s notes at the desk.', 'player-scene-navigation', {
  activityReporter: (event) => sceneNavigationActivity.push(cloneJson(event))
});
assert.equal(sceneNavigation.decision.classification, 'sceneNavigation');
assert.equal(sceneNavigation.abortDefaultGeneration, false);
assert.equal(chat.messages().filter((entry) => entry.metadata?.responseKind === 'routineCommand').length, 0);
assert.equal(campaignState.commandLog?.entries?.length || 0, commandLogBeforeSceneNavigation);
assert.equal(campaignState.worldState.elapsedMinutes, elapsedMinutesBeforeSceneNavigation + 10);
assert.equal(campaignState.timeLedger.elapsedMinutes, elapsedMinutesBeforeSceneNavigation + 10);
assert.equal(campaignState.timeLedger.entries.length, timeLedgerEntriesBeforeSceneNavigation + 1);
assert.equal(campaignState.timeLedger.entries.at(-1).sourceAnchorRange.kind, 'sceneContinuation');
assert.equal(campaignState.runtimeTracking.responseLedger.at(-1).strategy, 'injectAndContinue');
assert.ok(sceneNavigationActivity.some((event) => event.phase === 'classifying'));
assert.ok(sceneNavigationActivity.some((event) => event.phase === 'classified' && event.classification === 'sceneNavigation'));
assert.ok(sceneNavigationActivity.some((event) => event.phase === 'scene' && event.classification === 'sceneNavigation'));
assert.ok(sceneNavigationActivity.some((event) => event.phase === 'committingTimeBoundary' && event.elapsedMinutes === 10));
assert.ok(sceneNavigationActivity.some((event) => event.phase === 'syncingPrompt' && event.timeChanged === true));
assert.ok(sceneNavigationActivity.some((event) => event.phase === 'delegatingHostGeneration'));
assert.ok(sceneNavigationActivity.some((event) => event.phase === 'sidecarsQueued' && event.mode === 'background'));
const bronnPromptFrame = promptFrames.find((frame) => /Bronn/i.test(frame?.playerText || ''));
assert(bronnPromptFrame, 'Prompt sync should receive the current player turn frame.');
assert.equal(bronnPromptFrame.scene.relevantCrewIds.includes('hadrik-bronn'), true);
assert.equal(bronnPromptFrame.recentChatMessages.some((entry) => entry.hostMessageId === 'player-scene-navigation' || entry.id === 'player-scene-navigation'), true);

const hostGenerationContinuationsBeforeLocationTransition = hostGenerationContinuations.length;
const elapsedMinutesBeforeLocationTransition = campaignState.worldState?.elapsedMinutes ?? 0;
const timeLedgerEntriesBeforeLocationTransition = campaignState.timeLedger?.entries?.length || 0;
const locationTransitionActivity = [];
const locationTransition = await send('I head to Engineering.', 'player-location-transition', {
  activityReporter: (event) => locationTransitionActivity.push(cloneJson(event))
});
assert.equal(locationTransition.decision.classification, 'locationTransition');
assert.equal(locationTransition.responseStrategy, 'directivePosted');
assert.equal(locationTransition.abortDefaultGeneration, true);
assert.equal(hostGenerationContinuations.length, hostGenerationContinuationsBeforeLocationTransition);
assert.equal(campaignState.worldState.elapsedMinutes, elapsedMinutesBeforeLocationTransition + 2);
assert.equal(campaignState.timeLedger.entries.length, timeLedgerEntriesBeforeLocationTransition + 1);
assert.equal(campaignState.timeLedger.entries.at(-1).sourceAnchorRange.kind, 'locationTransition');
assert.equal(campaignState.runtimeTracking.responseLedger.at(-1).strategy, 'directivePosted');
assert.equal(campaignState.runtimeTracking.responseLedger.at(-1).responseKind, 'locationTransition');
const locationTransitionResponse = chat.messages().find((entry) => entry.metadata?.responseKind === 'locationTransition');
assert(locationTransitionResponse, 'Location transition should post a Directive-owned pacing response.');
assert.match(locationTransitionResponse.text, /Engineering/i);
assert.match(locationTransitionResponse.text, /threshold/i);
assert.doesNotMatch(locationTransitionResponse.text, /bridge/i);
assert.doesNotMatch(locationTransitionResponse.text, /breckenridge-in-transit|intrepid\./i);
assert.match(locationTransitionResponse.text, /previous stretch of corridor/i);
assert.ok(locationTransitionActivity.some((event) => event.phase === 'classified' && event.classification === 'locationTransition'));
assert.ok(locationTransitionActivity.some((event) => event.phase === 'locationTransition'));
assert.ok(locationTransitionActivity.some((event) => event.phase === 'writingResponse' && event.responseStrategy === 'directivePosted'));
assert.equal(shouldPreemptHostGenerationForTurn('I head to Engineering.'), true);
assert.equal(shouldPreemptHostGenerationForTurn('Continue the scene.'), false);

const aliasLocationText = 'I take the turbolift to Engineering.';
const elapsedMinutesBeforeAliasLocation = campaignState.worldState?.elapsedMinutes ?? 0;
const locationTransitionResponsesBeforeAlias = chat.messages().filter((entry) => entry.metadata?.responseKind === 'locationTransition').length;
const aliasFirst = await orchestrator.observePlayerMessage({
  chatId: 'campaign-chat',
  message: {
    text: aliasLocationText,
    isUser: true
  }
});
const aliasSecond = await orchestrator.observePlayerMessage({
  chatId: 'campaign-chat',
  message: {
    text: aliasLocationText,
    hostMessageId: 'player-location-transition-alias',
    isUser: true
  }
});
const aliasIngress = campaignState.runtimeTracking.ingressLedger.find((entry) => entry.textPreview === aliasLocationText);
assert.equal(aliasFirst.decision.classification, 'locationTransition');
assert.equal(aliasSecond.deduplicated, true);
assert.equal(aliasSecond.record.hostMessageId, 'player-location-transition-alias');
assert.equal(aliasIngress.hostMessageId, 'player-location-transition-alias');
assert.equal(campaignState.worldState.elapsedMinutes, elapsedMinutesBeforeAliasLocation + 2);
assert.equal(
  chat.messages().filter((entry) => entry.metadata?.responseKind === 'locationTransition').length,
  locationTransitionResponsesBeforeAlias + 1
);

const concurrentAliasLocationText = 'I follow Bronn toward Engineering.';
const elapsedMinutesBeforeConcurrentAlias = campaignState.worldState?.elapsedMinutes ?? 0;
const locationTransitionResponsesBeforeConcurrentAlias = chat.messages().filter((entry) => entry.metadata?.responseKind === 'locationTransition').length;
const concurrentAliasFirst = orchestrator.observePlayerMessage({
  chatId: 'campaign-chat',
  message: {
    text: concurrentAliasLocationText,
    isUser: true
  }
});
const concurrentAliasSecond = orchestrator.observePlayerMessage({
  chatId: 'campaign-chat',
  message: {
    text: concurrentAliasLocationText,
    hostMessageId: 'player-location-transition-concurrent-alias',
    isUser: true
  }
});
const [concurrentAliasFirstResult, concurrentAliasSecondResult] = await Promise.all([concurrentAliasFirst, concurrentAliasSecond]);
const concurrentAliasIngress = campaignState.runtimeTracking.ingressLedger.find((entry) => entry.textPreview === concurrentAliasLocationText);
assert.equal(concurrentAliasFirstResult.decision.classification, 'locationTransition');
assert.equal(concurrentAliasSecondResult.record.hostMessageId, 'player-location-transition-concurrent-alias');
assert.equal(concurrentAliasIngress.hostMessageId, 'player-location-transition-concurrent-alias');
assert.equal(campaignState.worldState.elapsedMinutes, elapsedMinutesBeforeConcurrentAlias + 2);
assert.equal(
  chat.messages().filter((entry) => entry.metadata?.responseKind === 'locationTransition').length,
  locationTransitionResponsesBeforeConcurrentAlias + 1
);

let droppedIngressDelegationSourceIngress = null;
const droppedIngressDelegationDispatcher = {
  async dispatch({ campaignState: sourceState, ingressId, responseKind }) {
    const state = initializeCampaignRuntimeTracking(sourceState);
    droppedIngressDelegationSourceIngress = cloneJson(
      (state.runtimeTracking.ingressLedger || []).find((entry) => entry.id === ingressId) || null
    );
    const entry = {
      id: `delegate-dropped-ingress:${ingressId}`,
      ingressId,
      strategy: 'injectAndContinue',
      responseKind: responseKind || 'hostGeneration',
      postedAt: now(),
      status: 'delegated'
    };
    const missingIngressState = initializeCampaignRuntimeTracking({
      ...cloneJson(state),
      runtimeTracking: {
        ...cloneJson(state.runtimeTracking),
        ingressLedger: []
      }
    });
    const next = recordDirectiveResponse(missingIngressState, entry);
    setCampaignState(next);
    await persistCampaignState(next, 'Fixture persisted delegated response without ingress.');
    return {
      ok: true,
      duplicate: false,
      entry: cloneJson(entry),
      campaignState: cloneJson(next)
    };
  }
};
const droppedIngressDelegationOrchestrator = createChatTurnOrchestrator({
  host: { chat, prompt },
  classify: async () => ({
    kind: 'directive.validatedTurnDecision',
    classification: 'sceneColor',
    confidence: 0.88,
    ambiguity: 'low',
    speechAct: 'color',
    action: 'hold bridge posture',
    target: 'bridge',
    targetConfidence: 0.81,
    domainSignals: ['scene-continuity'],
    riskSignals: [],
    missingInformation: [],
    pendingInteractionResolution: null,
    mixedIntent: false,
    reasons: ['Regression fixture delegates host generation from a partial dispatcher state.'],
    workerPlan: {},
    responseStrategy: 'injectAndContinue',
    source: 'utility-provider'
  }),
  responseDispatcher: droppedIngressDelegationDispatcher,
  stateDeltaGateway,
  getCampaignState,
  setCampaignState,
  persistCampaignState,
  syncPromptContext: async (state) => state,
  previewDirectorTurn: async () => {
    throw new Error('Dropped-ingress delegation fixture must not preview a Director turn.');
  },
  commitProvisionalDirectorTurn: async () => {
    throw new Error('Dropped-ingress delegation fixture must not commit a Director turn.');
  },
  discardProvisionalDirectorTurn: async () => {},
  sidecarScheduler: {
    schedule(payload) {
      sidecarCalls.push(cloneJson(payload));
      return Promise.resolve({ ok: true });
    }
  },
  now
});
const droppedIngressMessage = chat.pushPlayerMessage({
  text: '*Sam holds his place at the command rail and waits for the bridge to answer.*',
  hostMessageId: 'player-dropped-ingress-delegation'
});
const droppedIngressDelegation = await droppedIngressDelegationOrchestrator.observePlayerMessage({
  chatId: 'campaign-chat',
  message: droppedIngressMessage
});
const preservedDelegatedIngress = campaignState.runtimeTracking.ingressLedger.find((entry) => entry.hostMessageId === 'player-dropped-ingress-delegation');
assert.equal(droppedIngressDelegation.handled, true);
assert.equal(droppedIngressDelegation.responseStrategy, 'injectAndContinue');
assert.equal(droppedIngressDelegationSourceIngress?.id, preservedDelegatedIngress.id);
assert.equal(Boolean(droppedIngressDelegationSourceIngress?.playerSubmittedAt), true);
assert.equal(preservedDelegatedIngress.status, 'complete');
assert.equal(preservedDelegatedIngress.responseStrategy, 'injectAndContinue');
assert.equal(
  campaignState.runtimeTracking.responseLedger.some((entry) => entry.id === `delegate-dropped-ingress:${preservedDelegatedIngress.id}`),
  true,
  'Delegated host-generation response ledger should survive while the ingress is restored.'
);

const droppedIngressPromptSyncOrchestrator = createChatTurnOrchestrator({
  host: { chat, prompt },
  classify: async () => ({
    kind: 'directive.validatedTurnDecision',
    classification: 'routineCommand',
    confidence: 0.9,
    ambiguity: 'low',
    speechAct: 'order',
    action: 'route telemetry',
    target: 'operations',
    targetConfidence: 0.86,
    domainSignals: ['routine-competence'],
    riskSignals: [],
    missingInformation: [],
    pendingInteractionResolution: null,
    mixedIntent: false,
    reasons: ['Regression fixture drops ingress during prompt sync before host delegation.'],
    workerPlan: {},
    responseStrategy: 'injectAndContinue',
    source: 'utility-provider'
  }),
  responseDispatcher,
  stateDeltaGateway,
  getCampaignState,
  setCampaignState,
  persistCampaignState,
  syncPromptContext: async (state) => {
    const missingIngressState = initializeCampaignRuntimeTracking({
      ...cloneJson(state),
      runtimeTracking: {
        ...cloneJson(state.runtimeTracking),
        ingressLedger: []
      }
    });
    setCampaignState(missingIngressState);
    return missingIngressState;
  },
  previewDirectorTurn: async () => {
    throw new Error('Dropped-ingress prompt-sync fixture must not preview a Director turn.');
  },
  commitProvisionalDirectorTurn: async () => {
    throw new Error('Dropped-ingress prompt-sync fixture must not commit a Director turn.');
  },
  discardProvisionalDirectorTurn: async () => {},
  sidecarScheduler: {
    schedule(payload) {
      sidecarCalls.push(cloneJson(payload));
      return Promise.resolve({ ok: true });
    }
  },
  now
});
const droppedPromptSyncMessage = chat.pushPlayerMessage({
  text: '*Sam orders operations to route telemetry and notify the captain while the bridge holds yellow alert.*',
  hostMessageId: 'player-dropped-ingress-prompt-sync'
});
const droppedPromptSync = await droppedIngressPromptSyncOrchestrator.observePlayerMessage({
  chatId: 'campaign-chat',
  message: droppedPromptSyncMessage
});
const preservedPromptSyncIngress = campaignState.runtimeTracking.ingressLedger.find((entry) => entry.hostMessageId === 'player-dropped-ingress-prompt-sync');
assert.equal(droppedPromptSync.handled, true);
assert.equal(droppedPromptSync.responseStrategy, 'injectAndContinue');
assert.equal(preservedPromptSyncIngress.status, 'committed');
assert.equal(preservedPromptSyncIngress.responseStrategy, 'injectAndContinue');
assert.equal(
  campaignState.runtimeTracking.responseLedger.some((entry) => entry.ingressId === preservedPromptSyncIngress.id && entry.responseKind === 'hostGeneration'),
  true,
  'Host-generation response ledger should survive a prompt sync that dropped the active ingress.'
);

const previewCallsBeforeStaleClassifier = previewCalls.length;
const responseLedgerBeforeStaleClassifier = campaignState.runtimeTracking.responseLedger.length;
const sidecarCallsBeforeStaleClassifier = sidecarCalls.length;
const staleClassifierOrchestrator = createChatTurnOrchestrator({
  host: { chat, prompt },
  classify: async () => {
    const current = initializeCampaignRuntimeTracking(getCampaignState());
    const ingress = current.runtimeTracking.ingressLedger.find((entry) => entry.hostMessageId === 'player-stale-classifier');
    assert.ok(ingress, 'The stale-classifier ingress should exist before classifier return.');
    setCampaignState(updateTurnIngress(current, ingress.id, {
      status: 'invalidated',
      invalidatedAt: '2026-06-22T01:00:09.000Z',
      invalidationType: 'playerMessageEdited',
      replacementText: 'I order helm to proceed.',
      textHash: 'edited-message-hash'
    }));
    return {
      kind: 'directive.validatedTurnDecision',
      classification: 'consequentialCommand',
      confidence: 0.92,
      ambiguity: 'low',
      speechAct: 'order',
      action: 'proceed',
      target: 'helm',
      targetConfidence: 0.9,
      domainSignals: ['mission'],
      riskSignals: [],
      missingInformation: [],
      mixedIntent: false,
      workerPlan: {
        missionDirector: true,
        continuity: true,
        narrator: true
      },
      responseStrategy: 'directivePosted',
      reasons: ['This stale result should never commit.']
    };
  },
  responseDispatcher,
  generationRouter: {
    async generate(roleId, request) {
      responseSwipeGenerationCalls.push({ roleId, request: cloneJson(request) });
      return {
        ok: true,
        response: {
          providerId: 'fake-response-swipe-provider',
          text: `Alternate Directive response ${responseSwipeGenerationCalls.length}.`
        },
        diagnostics: { providerId: 'fake-response-swipe-provider' }
      };
    }
  },
  stateDeltaGateway,
  getCampaignState,
  setCampaignState,
  persistCampaignState,
  syncPromptContext: async (state) => state,
  previewDirectorTurn: async () => {
    throw new Error('Stale classifier output must not preview a Director turn.');
  },
  commitProvisionalDirectorTurn: async () => {
    throw new Error('Stale classifier output must not commit a Director turn.');
  },
  discardProvisionalDirectorTurn: async () => {},
  sidecarScheduler: {
    schedule(payload) {
      sidecarCalls.push(cloneJson(payload));
      return Promise.resolve({ ok: true });
    }
  },
  now
});
const staleClassifierMessage = chat.pushPlayerMessage({
  text: 'I order helm to proceedd.',
  hostMessageId: 'player-stale-classifier'
});
const staleClassifier = await staleClassifierOrchestrator.observePlayerMessage({
  chatId: 'campaign-chat',
  message: staleClassifierMessage
});
assert.equal(staleClassifier.stale, true);
assert.equal(staleClassifier.reason, 'source-ingress-stale');
assert.equal(staleClassifier.abortDefaultGeneration, true);
assert.equal(previewCalls.length, previewCallsBeforeStaleClassifier);
assert.equal(campaignState.runtimeTracking.responseLedger.length, responseLedgerBeforeStaleClassifier);
assert.equal(sidecarCalls.length, sidecarCallsBeforeStaleClassifier);

const dependentEditPreviewCallsBefore = previewCalls.length;
const dependentEditCommitCallsBefore = commitCalls.length;
const dependentEditSidecarCallsBefore = sidecarCalls.length;
const dependentEditPersistedBefore = persisted.length;
campaignState = initializeCampaignRuntimeTracking(campaignState);
const dependentEditIngress = {
  id: 'ingress:dependent-edit-original',
  hostMessageId: 'player-dependent-edit',
  chatId: 'campaign-chat',
  campaignId: campaignState.campaign.id,
  textHash: 'pre-edit-text-hash',
  textPreview: 'Sam considered the silence.',
  status: 'recoveryRequired',
  responseStrategy: 'directivePosted',
  outcomeId: 'outcome-dependent-edit',
  invalidatedAt: '2026-06-22T01:00:10.000Z',
  invalidationType: 'playerMessageEdited',
  replacementText: 'Sam considered the silence. Sam waited for her reply.',
  editedAt: '2026-06-22T01:00:10.000Z'
};
campaignState.runtimeTracking.ingressLedger.push(dependentEditIngress);
campaignState.runtimeTracking.responseLedger.push({
  id: 'response-dependent-edit',
  ingressId: dependentEditIngress.id,
  hostMessageId: 'assistant-dependent-edit',
  outcomeId: dependentEditIngress.outcomeId,
  responseKind: 'committedOutcome',
  status: 'posted'
});
setCampaignState(campaignState);
const dependentEditGuardOrchestrator = createChatTurnOrchestrator({
  host: { chat, prompt },
  classify: async () => {
    throw new Error('Dependent edited source must not re-enter classification.');
  },
  responseDispatcher,
  generationRouter: {
    async generate() {
      throw new Error('Dependent edited source must not enter generation.');
    }
  },
  stateDeltaGateway,
  getCampaignState,
  setCampaignState,
  persistCampaignState,
  syncPromptContext: async () => {
    throw new Error('Dependent edited source must not sync prompt.');
  },
  previewDirectorTurn: async () => {
    throw new Error('Dependent edited source must not preview a Director turn.');
  },
  commitProvisionalDirectorTurn: async () => {
    throw new Error('Dependent edited source must not commit a Director turn.');
  },
  discardProvisionalDirectorTurn: async () => {},
  sidecarScheduler: {
    schedule() {
      throw new Error('Dependent edited source must not schedule sidecars.');
    }
  },
  now
});
const dependentEditMessage = chat.pushPlayerMessage({
  text: 'Sam considered the silence. Sam waited for her reply.',
  hostMessageId: 'player-dependent-edit'
});
const dependentEdit = await dependentEditGuardOrchestrator.observePlayerMessage({
  chatId: 'campaign-chat',
  message: dependentEditMessage
});
const dependentEditCurrent = initializeCampaignRuntimeTracking(campaignState);
const dependentEditCurrentIngress = dependentEditCurrent.runtimeTracking.ingressLedger.find((entry) => entry.id === dependentEditIngress.id);
assert.equal(dependentEdit.handled, true);
assert.equal(dependentEdit.stale, true);
assert.equal(dependentEdit.responseStrategy, 'staleSource');
assert.equal(dependentEdit.abortDefaultGeneration, true);
assert.equal(dependentEdit.reason, 'source-ingress-stale');
assert.equal(dependentEdit.repairDecision.kind, 'directive.repairSourceReobserveDecision.v1');
assert.equal(dependentEdit.repairDecision.action, 'blockDependentSourceReobserve');
assert.equal(dependentEdit.repairDecision.normalTurnAllowed, false);
assert.equal(dependentEdit.repairDecision.recoveryRequired, true);
assert.equal(dependentEdit.repairDecision.isLatestActionablePlayerRow, true);
assert.equal(dependentEdit.repairDecision.hasDependentAssistant, true);
assert.equal(dependentEdit.repairDecision.hasCommittedOutcome, true);
assert.ok(dependentEdit.staleReasons.includes('dependent-response'));
assert.ok(dependentEdit.staleReasons.includes('status:recoveryRequired'));
assert.ok(dependentEdit.staleReasons.includes('text-hash-changed'));
assert.equal(dependentEditCurrentIngress.status, 'recoveryRequired');
assert.equal(dependentEditCurrentIngress.outcomeId, 'outcome-dependent-edit');
assert.equal(
  dependentEditCurrent.runtimeTracking.ingressLedger.filter((entry) => entry.hostMessageId === 'player-dependent-edit').length,
  1,
  'Dependent edit reobserve must not create a replacement ingress.'
);
assert.equal(
  dependentEditCurrent.runtimeTracking.responseLedger.filter((entry) => entry.ingressId === dependentEditIngress.id).length,
  1,
  'Dependent edit reobserve must preserve the existing response ledger.'
);
assert.equal(previewCalls.length, dependentEditPreviewCallsBefore);
assert.equal(commitCalls.length, dependentEditCommitCallsBefore);
assert.equal(sidecarCalls.length, dependentEditSidecarCallsBefore);
assert.equal(persisted.length, dependentEditPersistedBefore);

chat.pushAssistantMessage({
  hostMessageId: 'assistant-selected-swipe-orchestrator',
  text: 'Accepted selected response.',
  swipes: [
    'Discarded selected-swipe orchestrator draft.',
    'Accepted selected response.',
    'Unused selected-swipe orchestrator draft.'
  ],
  swipeId: 1
});
const selectedSwipeReconcilerCalls = [];
const selectedSwipeOrchestrator = createChatTurnOrchestrator({
  host: { chat, prompt },
  classify: async () => {
    throw new Error('Selected-swipe source mutation must not classify a normal turn.');
  },
  responseDispatcher: {
    dispatch: async () => {
      throw new Error('Selected-swipe source mutation must not dispatch a response.');
    }
  },
  generationRouter: {
    async generate() {
      throw new Error('Selected-swipe source mutation must not generate.');
    }
  },
  messageReconciler: {
    async reconcileSelectedSwipeChanged(payload) {
      selectedSwipeReconcilerCalls.push(cloneJson(payload));
      return {
        matched: true,
        action: 'reviewRequired',
        repairDecision: {
          kind: 'directive.repairSourceMutationDecision.v1',
          normalTurnAllowed: false
        }
      };
    }
  },
  stateDeltaGateway,
  getCampaignState,
  setCampaignState,
  persistCampaignState,
  syncPromptContext: async () => {
    throw new Error('Selected-swipe source mutation must not sync prompt directly.');
  },
  previewDirectorTurn: async () => {
    throw new Error('Selected-swipe source mutation must not preview a Director turn.');
  },
  commitProvisionalDirectorTurn: async () => {
    throw new Error('Selected-swipe source mutation must not commit a Director turn.');
  },
  now
});
const selectedSwipeResult = await selectedSwipeOrchestrator.handleMessageSelectedSwipeChanged({
  hostMessageId: 'assistant-selected-swipe-orchestrator',
  selectedSwipeIndex: '1',
  swipeCount: '3',
  index: 17,
  chatMetadata: { chatId: 'campaign-chat', source: 'MESSAGE_SWIPED' },
  visibility_map: { 'assistant-selected-swipe-orchestrator': { visible: true } }
});
assert.equal(selectedSwipeResult.handled, true);
assert.equal(selectedSwipeResult.action, 'reviewRequired');
assert.equal(selectedSwipeResult.repairDecision.normalTurnAllowed, false);
assert.equal(selectedSwipeReconcilerCalls.length, 1);
assert.equal(selectedSwipeReconcilerCalls[0].hostMessageId, 'assistant-selected-swipe-orchestrator');
assert.deepEqual(selectedSwipeReconcilerCalls[0].selectedSwipe, {
  selectedSwipeIndex: 1,
  swipeCount: 3,
  selectedAssistantVariantHash: null
});
assert.equal(selectedSwipeReconcilerCalls[0].index, 17);
assert.deepEqual(selectedSwipeReconcilerCalls[0].chatMetadata, { chatId: 'campaign-chat', source: 'MESSAGE_SWIPED' });
assert.deepEqual(selectedSwipeReconcilerCalls[0].visibilityMap, { 'assistant-selected-swipe-orchestrator': { visible: true } });
assert.equal(selectedSwipeReconcilerCalls[0].message.hostMessageId, 'assistant-selected-swipe-orchestrator');
assert.equal(selectedSwipeReconcilerCalls[0].message.text, 'Accepted selected response.');
assert.deepEqual(selectedSwipeReconcilerCalls[0].message.swipes, [
  'Discarded selected-swipe orchestrator draft.',
  'Accepted selected response.',
  'Unused selected-swipe orchestrator draft.'
]);
const invalidSelectedSwipeResult = await selectedSwipeOrchestrator.handleMessageSelectedSwipeChanged({
  id: 'assistant-selected-swipe-orchestrator',
  selectedSwipeIndex: 'not-a-number',
  swipeCount: ''
});
assert.equal(invalidSelectedSwipeResult.handled, true);
assert.equal(selectedSwipeReconcilerCalls.length, 2);
assert.deepEqual(selectedSwipeReconcilerCalls[1].selectedSwipe, {
  selectedSwipeIndex: null,
  swipeCount: null,
  selectedAssistantVariantHash: null
});

const latestRestartOldText = 'Sam listened to the carrier wave and waited.';
const latestRestartEditedText = 'Sam listened to the carrier wave and waited. She did not ask the room to hurry.';
const latestRestartHostMessageId = 'player-latest-restart-orchestrator';
const latestRestartOldIngressId = `ingress:${campaignState.campaign.id}:campaign-chat:${latestRestartHostMessageId}:${fnv1a(latestRestartOldText)}`;
const latestRestartOldTransactionId = 'txn:frame:latest-restart-old';
campaignState = initializeCampaignRuntimeTracking(campaignState);
campaignState.runtimeTracking.ingressLedger.push({
  id: latestRestartOldIngressId,
  hostMessageId: latestRestartHostMessageId,
  chatId: 'campaign-chat',
  campaignId: campaignState.campaign.id,
  textHash: fnv1a(latestRestartOldText),
  textPreview: latestRestartOldText,
  status: 'recoveryRequired',
  sourceFrameId: 'frame:latest-restart-old',
  coreTransactionId: latestRestartOldTransactionId,
  invalidatedAt: '2026-06-22T01:00:40.000Z',
  invalidationType: 'playerMessageEdited',
  replacementText: latestRestartEditedText,
  editedAt: '2026-06-22T01:00:40.000Z'
});
campaignState = recordRecoveryEvent(campaignState, {
  id: 'recovery-latest-restart-orchestrator',
  type: 'playerMessageEdited',
  status: 'invalidated',
  hostMessageId: latestRestartHostMessageId,
  ingressId: latestRestartOldIngressId,
  recordedAt: '2026-06-22T01:00:40.000Z',
  details: {
    replacementText: latestRestartEditedText
  }
});
setCampaignState(campaignState);
const latestRestartClassifyCalls = [];
const latestRestartCoreBeginBefore = coreBeginCalls.length;
const latestRestartCoreSupersedeBefore = coreSupersedeCalls.length;
const latestRestartPersistedBefore = persisted.length;
const latestRestartOrchestrator = createChatTurnOrchestrator({
  host: { chat, prompt },
  classify: async ({ text }) => {
    latestRestartClassifyCalls.push(text);
    return {
      kind: 'directive.validatedTurnDecision',
      classification: 'sceneColor',
      confidence: 0.91,
      ambiguity: 'low',
      speechAct: 'color',
      action: 'hold the room in patient silence',
      target: 'bridge',
      targetConfidence: 0.86,
      domainSignals: ['scene-continuity'],
      riskSignals: [],
      missingInformation: [],
      pendingInteractionResolution: null,
      mixedIntent: false,
      reasons: ['Latest no-outcome edited row should restart through REPAIR.'],
      workerPlan: {},
      responseStrategy: 'injectAndContinue',
      source: 'utility-provider'
    };
  },
  responseDispatcher,
  stateDeltaGateway,
  coreTurnStore,
  getCampaignState,
  setCampaignState,
  persistCampaignState,
  syncPromptContext: async (state) => state,
  previewDirectorTurn: async () => {
    throw new Error('Latest restart scene-color turn must not preview a Director turn.');
  },
  commitProvisionalDirectorTurn: async () => {
    throw new Error('Latest restart scene-color turn must not commit a Director turn.');
  },
  discardProvisionalDirectorTurn: async () => {},
  sidecarScheduler: {
    schedule() {
      return Promise.resolve({ ok: true });
    }
  },
  now
});
const latestRestartMessage = chat.pushPlayerMessage({
  text: latestRestartEditedText,
  hostMessageId: latestRestartHostMessageId
});
const latestRestart = await latestRestartOrchestrator.observePlayerMessage({
  chatId: 'campaign-chat',
  message: latestRestartMessage
});
const latestRestartState = initializeCampaignRuntimeTracking(campaignState);
const latestRestartNewIngress = latestRestartState.runtimeTracking.ingressLedger.find((entry) => (
  entry.hostMessageId === latestRestartHostMessageId
  && entry.textHash === fnv1a(latestRestartEditedText)
  && entry.sourceRestart?.priorIngressId === latestRestartOldIngressId
));
const latestRestartOldIngress = latestRestartState.runtimeTracking.ingressLedger.find((entry) => entry.id === latestRestartOldIngressId);
const latestRestartRecovery = latestRestartState.runtimeTracking.recoveryJournal.find((entry) => entry.id === 'recovery-latest-restart-orchestrator');
assert.equal(latestRestart.handled, true);
assert.notEqual(latestRestart.reason, 'source-ingress-stale');
assert.equal(latestRestart.decision.classification, 'sceneColor');
assert.deepEqual(latestRestartClassifyCalls, [latestRestartEditedText]);
assert.ok(latestRestartNewIngress, 'Latest edited no-outcome source must create a restarted ingress.');
assert.notEqual(latestRestartNewIngress.id, latestRestartOldIngressId);
assert.match(latestRestartNewIngress.id, /:restart:/);
assert.equal(latestRestartNewIngress.status, 'complete');
assert.equal(latestRestartNewIngress.repairDecision.action, 'restartLatestSource');
assert.equal(latestRestartNewIngress.repairDecision.recoveryResolution.reason, 'latest-source-reobserved');
assert.equal(latestRestartNewIngress.sourceRestart.priorTransactionId, latestRestartOldTransactionId);
assert.equal(latestRestartNewIngress.sourceRestart.priorSourceFrameId, 'frame:latest-restart-old');
assert.equal(latestRestartNewIngress.sourceRestart.priorRecoveryId, 'recovery-latest-restart-orchestrator');
assert.notEqual(latestRestartNewIngress.coreTransactionId, latestRestartOldTransactionId);
assert.notEqual(latestRestartNewIngress.sourceFrameId, 'frame:latest-restart-old');
assert.equal(latestRestartOldIngress.status, 'restartSuperseded');
assert.equal(latestRestartOldIngress.restartedByIngressId, latestRestartNewIngress.id);
assert.equal(latestRestartOldIngress.restartCoreTransactionId, latestRestartNewIngress.coreTransactionId);
assert.equal(latestRestartOldIngress.restartRepairDecision.action, 'restartLatestSource');
assert.equal(latestRestartRecovery.status, 'resolved');
assert.equal(latestRestartRecovery.resolution.reason, 'latest-source-reobserved');
assert.equal(latestRestartRecovery.resolution.restartIngressId, latestRestartNewIngress.id);
assert.equal(coreBeginCalls.length, latestRestartCoreBeginBefore + 1);
assert.equal(coreBeginCalls.at(-1).options.ingressId, latestRestartNewIngress.id);
assert.equal(coreBeginCalls.at(-1).options.transactionId, latestRestartNewIngress.coreTransactionId);
assert.notEqual(coreBeginCalls.at(-1).options.idempotencyKey, `begin:${latestRestartOldIngressId}`);
assert.equal(JSON.stringify(coreBeginCalls.at(-1)).includes(latestRestartEditedText), false, 'CORE begin refs must not store raw edited player text.');
assert.equal(coreSupersedeCalls.length, latestRestartCoreSupersedeBefore + 1);
assert.equal(coreSupersedeCalls.at(-1).priorTransactionId, latestRestartOldTransactionId);
assert.equal(coreSupersedeCalls.at(-1).replacementTransactionId, latestRestartNewIngress.coreTransactionId);
assert.equal(coreSupersedeCalls.at(-1).options.priorRecoveryId, 'recovery-latest-restart-orchestrator');
assert.equal(coreSupersedeCalls.at(-1).options.sourceMutation.replacementSourceFrameId, latestRestartNewIngress.sourceFrameId);
assert.equal(JSON.stringify(coreSupersedeCalls.at(-1)).includes(latestRestartEditedText), false, 'CORE supersede refs must not store raw edited player text.');
assert.ok(persisted.length > latestRestartPersistedBefore);

const latestRestartDuplicateBeginBefore = coreBeginCalls.length;
const latestRestartDuplicateSupersedeBefore = coreSupersedeCalls.length;
const latestRestartDuplicatePersistedBefore = persisted.length;
const latestRestartDuplicateClassifyBefore = latestRestartClassifyCalls.length;
const latestRestartDuplicate = await latestRestartOrchestrator.observePlayerMessage({
  chatId: 'campaign-chat',
  message: latestRestartMessage
});
const latestRestartDuplicateState = initializeCampaignRuntimeTracking(campaignState);
assert.equal(latestRestartDuplicate.handled, true);
assert.equal(latestRestartDuplicate.deduplicated, true);
assert.equal(coreBeginCalls.length, latestRestartDuplicateBeginBefore);
assert.equal(coreSupersedeCalls.length, latestRestartDuplicateSupersedeBefore);
assert.equal(persisted.length, latestRestartDuplicatePersistedBefore);
assert.equal(latestRestartClassifyCalls.length, latestRestartDuplicateClassifyBefore);
assert.equal(
  latestRestartDuplicateState.runtimeTracking.ingressLedger.filter((entry) => entry.sourceRestart?.priorIngressId === latestRestartOldIngressId).length,
  1,
  'Duplicate latest restart observation must not create another restart ingress.'
);
assert.equal(
  latestRestartDuplicateState.runtimeTracking.recoveryJournal.filter((entry) => entry.id === 'recovery-latest-restart-orchestrator' && entry.status === 'resolved').length,
  1,
  'Duplicate latest restart observation must not resolve the same recovery twice.'
);

const failingClassifierOrchestrator = createChatTurnOrchestrator({
  host: { chat, prompt },
  classify: async () => {
    const error = new Error('Classifier unavailable for retry regression.');
    error.code = 'DIRECTIVE_TEST_CLASSIFIER_FAILED';
    throw error;
  },
  responseDispatcher,
  coreTurnStore,
  generationRouter: {
    async generate(roleId, request) {
      responseSwipeGenerationCalls.push({ roleId, request: cloneJson(request) });
      return {
        ok: true,
        response: {
          providerId: 'fake-response-swipe-provider',
          text: `Alternate Directive response ${responseSwipeGenerationCalls.length}.`
        },
        diagnostics: { providerId: 'fake-response-swipe-provider' }
      };
    }
  },
  stateDeltaGateway,
  getCampaignState,
  setCampaignState,
  persistCampaignState,
  syncPromptContext: async (state) => state,
  previewDirectorTurn: async () => {
    throw new Error('Classifier failure must not preview a Director turn.');
  },
  commitProvisionalDirectorTurn: async () => {
    throw new Error('Classifier failure must not commit a Director turn.');
  },
  discardProvisionalDirectorTurn: async () => {},
  sidecarScheduler: {
    schedule(payload) {
      sidecarCalls.push(cloneJson(payload));
      return Promise.resolve({ ok: true });
    }
  },
  now
});
const classifierFailureMessage = chat.pushPlayerMessage({
  text: 'Log the retry check, preserve the watch handoff, and keep the Captain informed.',
  hostMessageId: 'player-classifier-failure'
});
const coreRecoveryCountBeforeClassifierFailure = coreRecoveryCalls.length;
const classifierFailure = await failingClassifierOrchestrator.observePlayerMessage({
  chatId: 'campaign-chat',
  message: classifierFailureMessage
});
const failedIngress = campaignState.runtimeTracking.ingressLedger.find((entry) => entry.hostMessageId === 'player-classifier-failure');
const failedRecovery = campaignState.runtimeTracking.recoveryJournal.find((entry) => entry.ingressId === failedIngress.id && entry.type === 'chatTurnProcessingFailure');
assert.equal(classifierFailure.recoveryRequired, true);
assert.equal(failedIngress.status, 'recoveryRequired');
assert.equal(failedIngress.error.code, 'DIRECTIVE_TEST_CLASSIFIER_FAILED');
assert.equal(failedRecovery.status, 'open');
assert.equal(failedRecovery.details.stage, 'classification');
assert.equal(coreRecoveryCalls.length, coreRecoveryCountBeforeClassifierFailure + 1, 'CORE-backed classifier failure must record CORE recovery before old recovery projection.');
assert.equal(coreRecoveryCalls.at(-1).transactionId, failedIngress.coreTransactionId);
assert.equal(coreRecoveryCalls.at(-1).recoveryBundle.id, failedRecovery.id);
assert.equal(coreRecoveryCalls.at(-1).recoveryBundle.reason, 'chatTurnProcessingFailure');
assert.equal(coreRecoveryCalls.at(-1).recoveryBundle.sourceMutation.eventType, 'chatTurnProcessingFailure');
assert.equal(failedRecovery.details.coreRecovery.transactionId, failedIngress.coreTransactionId);

const coreRecoveryFailurePersistedBefore = persisted.length;
const coreRecoveryFailureHostMessageId = 'player-classifier-core-recovery-failure';
const failingCoreRecoveryOrchestrator = createChatTurnOrchestrator({
  host: { chat, prompt },
  classify: async () => {
    const error = new Error('Classifier failure should require CORE recovery.');
    error.code = 'DIRECTIVE_TEST_CLASSIFIER_CORE_RECOVERY_FAILED';
    throw error;
  },
  responseDispatcher,
  coreTurnStore: {
    async beginTurn(sourceFrame, options = {}) {
      return {
        id: options.transactionId || `txn:${sourceFrame.id}`,
        phase: 'observed',
        sourceFrameId: sourceFrame.id
      };
    },
    async markRecoveryRequired() {
      const error = new Error('Synthetic CORE processing recovery failure.');
      error.code = 'DIRECTIVE_CORE_PROCESSING_RECOVERY_FAILED';
      throw error;
    }
  },
  generationRouter: {
    async generate() {
      throw new Error('CORE processing recovery failure fixture must not generate.');
    }
  },
  stateDeltaGateway,
  getCampaignState,
  setCampaignState,
  persistCampaignState,
  syncPromptContext: async (state) => state,
  previewDirectorTurn: async () => {
    throw new Error('CORE processing recovery failure fixture must not preview a Director turn.');
  },
  commitProvisionalDirectorTurn: async () => {
    throw new Error('CORE processing recovery failure fixture must not commit a Director turn.');
  },
  discardProvisionalDirectorTurn: async () => {},
  now
});
const coreRecoveryFailureMessage = chat.pushPlayerMessage({
  text: 'Record the failed recovery attempt without treating old ledgers as settled authority.',
  hostMessageId: coreRecoveryFailureHostMessageId
});
await assert.rejects(
  () => failingCoreRecoveryOrchestrator.observePlayerMessage({
    chatId: 'campaign-chat',
    message: coreRecoveryFailureMessage
  }),
  /Synthetic CORE processing recovery failure/
);
assert.equal(
  campaignState.runtimeTracking.recoveryJournal.some((entry) => entry.hostMessageId === coreRecoveryFailureHostMessageId),
  false,
  'CORE recovery failure must not persist old chatTurnProcessingFailure recovery.'
);
assert.equal(
  campaignState.runtimeTracking.ingressLedger.some((entry) => (
    entry.hostMessageId === coreRecoveryFailureHostMessageId && entry.status === 'recoveryRequired'
  )),
  false,
  'CORE recovery failure must not mark old ingress projection recoveryRequired.'
);
assert.equal(persisted.length, coreRecoveryFailurePersistedBefore + 1, 'CORE recovery failure may persist the initial ingress only, not old recovery projection.');

const retriedClassifierFailure = await orchestrator.observePlayerMessage({
  chatId: 'campaign-chat',
  message: classifierFailureMessage
});
const retriedIngress = campaignState.runtimeTracking.ingressLedger.find((entry) => entry.hostMessageId === 'player-classifier-failure');
const resolvedFailureRecovery = campaignState.runtimeTracking.recoveryJournal.find((entry) => entry.id === failedRecovery.id);
assert.equal(retriedClassifierFailure.handled, true);
assert.notEqual(retriedClassifierFailure.deduplicated, true);
assert.notEqual(retriedIngress.status, 'recoveryRequired');
assert.equal(resolvedFailureRecovery.status, 'resolved');
assert.equal(resolvedFailureRecovery.resolution.reason, 'latest-source-reobserved');

const missingCurrentIngressOrchestrator = createChatTurnOrchestrator({
  host: { chat, prompt },
  classify: async () => {
    const current = initializeCampaignRuntimeTracking(getCampaignState());
    const ingress = current.runtimeTracking.ingressLedger.find((entry) => entry.hostMessageId === 'player-current-missing-ingress');
    assert.ok(ingress, 'The missing-current-ingress fixture should create ingress before classification.');
    const missingCurrent = cloneJson(current);
    missingCurrent.runtimeTracking.ingressLedger = missingCurrent.runtimeTracking.ingressLedger.filter((entry) => entry.id !== ingress.id);
    setCampaignState(missingCurrent);
    return {
      kind: 'directive.validatedTurnDecision',
      classification: 'sceneColor',
      confidence: 0.86,
      ambiguity: 'low',
      speechAct: 'color',
      action: 'acknowledge the bridge posture',
      target: 'bridge',
      targetConfidence: 0.82,
      domainSignals: ['scene-continuity'],
      riskSignals: [],
      missingInformation: [],
      pendingInteractionResolution: null,
      mixedIntent: false,
      reasons: ['Regression fixture preserves the just-created ingress even if current state is missing it.'],
      workerPlan: {},
      responseStrategy: 'injectAndContinue',
      source: 'utility-provider'
    };
  },
  responseDispatcher,
  stateDeltaGateway,
  getCampaignState,
  setCampaignState,
  persistCampaignState,
  syncPromptContext: async (state) => state,
  previewDirectorTurn: async () => {
    throw new Error('False missing-ingress regression must not preview a Director turn.');
  },
  commitProvisionalDirectorTurn: async () => {
    throw new Error('False missing-ingress regression must not commit a Director turn.');
  },
  discardProvisionalDirectorTurn: async () => {},
  sidecarScheduler: {
    schedule(payload) {
      sidecarCalls.push(cloneJson(payload));
      return Promise.resolve({ ok: true });
    }
  },
  now
});
const missingCurrentIngressMessage = chat.pushPlayerMessage({
  text: '*Sam studies the bridge posture without issuing a new command.*',
  hostMessageId: 'player-current-missing-ingress'
});
const missingCurrentIngress = await missingCurrentIngressOrchestrator.observePlayerMessage({
  chatId: 'campaign-chat',
  message: missingCurrentIngressMessage
});
const preservedMissingCurrentIngress = campaignState.runtimeTracking.ingressLedger.find((entry) => entry.hostMessageId === 'player-current-missing-ingress');
assert.equal(missingCurrentIngress.handled, true);
assert.notEqual(missingCurrentIngress.reason, 'source-ingress-stale');
assert.equal(missingCurrentIngress.decision.classification, 'sceneColor');
assert.equal(preservedMissingCurrentIngress.status, 'complete');

const routine = await send('Log the distress call, preserve the telemetry, and keep the Captain informed.', 'player-routine');
assert.equal(routine.decision.classification, 'routineCommand');
assert.equal(routine.abortDefaultGeneration, false);
assert.equal(campaignState.commandCompetence.assumedActionsLedger.some((entry) => entry.sourceMessageId === 'player-routine'), true);
assert.equal(campaignState.commandLog.entries.some((entry) => entry.type === 'routineCommand'), true);

const directiveRoutineOrchestrator = createChatTurnOrchestrator({
  host: { chat, prompt },
  classify: async () => ({
    kind: 'directive.validatedTurnDecision',
    classification: 'routineCommand',
    confidence: 0.88,
    ambiguity: 'low',
    speechAct: 'order',
    action: 'direct routine handoff procedure',
    target: 'Whitaker, Bronn, Ops',
    targetConfidence: 0.9,
    domainSignals: ['command-rhythm', 'crew-coordination'],
    riskSignals: [],
    missingInformation: [],
    pendingInteractionResolution: null,
    mixedIntent: true,
    reasons: ['Provider requested a Directive-owned routine response.'],
    workerPlan: {
      relationship: true,
      crew: true,
      commandBearing: true,
      continuity: true,
      promptUpdate: true
    },
    responseStrategy: 'directivePosted',
    source: 'utility-provider'
  }),
  responseDispatcher,
  generationRouter: {
    async generate(roleId, request) {
      responseSwipeGenerationCalls.push({ roleId, request: cloneJson(request) });
      return {
        ok: true,
        response: {
          providerId: 'fake-response-swipe-provider',
          text: `Alternate Directive response ${responseSwipeGenerationCalls.length}.`
        },
        diagnostics: { providerId: 'fake-response-swipe-provider' }
      };
    }
  },
  stateDeltaGateway,
  getCampaignState,
  setCampaignState,
  persistCampaignState,
  syncPromptContext: async (state) => state,
  previewDirectorTurn: async () => {
    throw new Error('Directive-owned routine test must not preview a Director turn.');
  },
  commitProvisionalDirectorTurn: async () => {
    throw new Error('Directive-owned routine test must not commit a Director turn.');
  },
  discardProvisionalDirectorTurn: async () => {},
  sidecarScheduler: {
    schedule(payload) {
      sidecarCalls.push(cloneJson(payload));
      return Promise.resolve({ ok: true });
    }
  },
  now
});
const directiveRoutineMessage = chat.pushPlayerMessage({
  text: 'I tell Whitaker to keep the handoff public but brief.',
  hostMessageId: 'player-routine-directive'
});
const directiveRoutine = await directiveRoutineOrchestrator.observePlayerMessage({
  chatId: 'campaign-chat',
  message: directiveRoutineMessage
});
assert.equal(directiveRoutine.decision.classification, 'routineCommand');
assert.equal(directiveRoutine.responseStrategy, 'directivePosted');
assert.equal(directiveRoutine.abortDefaultGeneration, true);
assert.equal(campaignState.runtimeTracking.responseLedger.at(-1).strategy, 'directivePosted');
assert.equal(campaignState.runtimeTracking.responseLedger.at(-1).responseKind, 'routineCommand');
assert.equal(chat.messages().filter((entry) => entry.metadata?.responseKind === 'routineCommand').length, 1);

const responseLedgerBeforeSwipe = cloneJson(campaignState.runtimeTracking.responseLedger);
const generationCallsBeforeSwipe = responseSwipeGenerationCalls.length;
let directiveSwipeAbort = false;
const directiveSwipe = await directiveRoutineOrchestrator.interceptGeneration({
  chat: chat.messages(),
  abort: () => { directiveSwipeAbort = true; },
  type: 'swipe'
});
assert.equal(directiveSwipe.handled, true);
assert.equal(directiveSwipe.responseStrategy, 'directiveSwipe');
assert.equal(directiveSwipe.abortDefaultGeneration, true);
assert.equal(directiveSwipeAbort, true);
assert.equal(responseSwipeGenerationCalls.length, generationCallsBeforeSwipe + 1);
assert.equal(responseSwipeGenerationCalls.at(-1).roleId, 'narration');
assert.equal(responseSwipeGenerationCalls.at(-1).request.prompt.includes('*Stardate'), false);
assert.match(responseSwipeGenerationCalls.at(-1).request.metadata.responseVariantSeed, /:swipe:1$/);
const swipeGenerationOrdinal = responseSwipeGenerationCalls.length;
const directiveRoutineResponse = chat.messages().find((entry) => entry.metadata?.responseKind === 'routineCommand');
assert.equal(directiveRoutineResponse.swipes.length, 2);
assert.match(directiveRoutineResponse.swipes[0], /^\*Stardate \d+(?:\.\d+)? \| \d{4} hours\*\n\n/);
assert.equal(
  directiveRoutineResponse.swipes[0].endsWith('The order is acknowledged and folded into the working rhythm. The relevant officers carry it forward while the log records the procedure.'),
  true
);
assert.match(directiveRoutineResponse.swipes[1], /^\*Stardate \d+(?:\.\d+)? \| \d{4} hours\*\n\n/);
assert.equal(directiveRoutineResponse.swipes[1].endsWith(`Alternate Directive response ${swipeGenerationOrdinal}.`), true);
assert.equal(directiveRoutineResponse.swipe_id, 1);
assert.equal(directiveRoutineResponse.metadata.responseSwipeReason, 'native-swipe-reroll');
assert.deepEqual(campaignState.runtimeTracking.responseLedger, responseLedgerBeforeSwipe, 'Response swipes are chat transcript variants, not campaign-state entries.');

const observedContinuationChat = createFakeChatAdapter({ chatId: 'observed-host-native-chat' });
observedContinuationChat.continueHostGeneration = async () => ({
  ok: true,
  skipped: false,
  reason: 'directive-inject-and-continue',
  observedMessage: {
    hostMessageId: 'host-native-bad-1',
    index: 9,
    text: 'Bronn, a human male in his early forties, grumbled that the ship had been at impulse for six days since leaving Utopia Planitia.'
  }
});
let observedState = initializeCampaignRuntimeTracking(cloneJson(campaignState));
const observedDispatcher = createResponseDispatcher({
  host: { chat: observedContinuationChat },
  getCampaignState: () => observedState,
  setCampaignState: (next) => { observedState = initializeCampaignRuntimeTracking(next); },
  persist: async (next) => { observedState = initializeCampaignRuntimeTracking(next); },
  now
});
const observedDispatch = await observedDispatcher.dispatch({
  campaignState: observedState,
  ingressId: 'ingress-host-native-observed',
  strategy: 'injectAndContinue',
  responseKind: 'hostGeneration',
  packageData
});
assert.equal(observedDispatch.ok, false);
assert.equal(observedDispatch.recoveryRequired, true);
assert.equal(observedState.runtimeTracking.responseLedger.at(-1).status, 'recoveryRequired');
assert.match(observedState.runtimeTracking.responseLedger.at(-1).recoveryId, /^recovery:continuity:/);
assert.equal(observedState.runtimeTracking.responseLedger.at(-1).continuityReview.ok, false);
assert.equal(observedState.continuity.rejectedClaims.length > 0, true);
assert.equal(observedState.continuity.projectionHints.length > 0, true);
assert.equal(Object.values(observedState.continuity.factUseStats).some((stats) => stats.violationCount > 0), true);
assert.equal(observedState.continuity.rejectedClaims.at(-1).findingFactIds.includes('crew.hadrik-bronn.species'), true);
const observedMatrix = buildContinuityProjectionMatrix({
  campaignState: observedState,
  packageData,
  campaignProjection: projection
});
assert.equal(observedMatrix.plan.laneFactIds['directive.continuity.invariants'].some((id) => id.startsWith('rejected-claim.')), true);
assert.match(
  observedMatrix.blocks.find((block) => block.promptKey === 'directive.continuity.invariants').content,
  /rejected by continuity review/
);
assert.equal(
  observedState.runtimeTracking.recoveryJournal.some((entry) => entry.type === 'hostNativeContinuityContradiction'),
  true
);

const introChat = createFakeChatAdapter({ chatId: 'intro-chat' });
let introCampaignState = initializeCampaignRuntimeTracking(cloneJson(projection.initialState));
introCampaignState.campaign = {
  ...introCampaignState.campaign,
  id: 'campaign-intro-native-swipe-test',
  title: 'Ashes of Peace',
  status: 'active'
};
introCampaignState.campaignChatBinding = {
  hostId: 'fake',
  chatId: 'intro-chat',
  campaignId: introCampaignState.campaign.id,
  saveId: 'save-intro-native-swipe-test',
  introMessageId: 'intro-message',
  promptContextRevision: 1
};
await introChat.bindCurrentChat({
  campaignId: introCampaignState.campaign.id,
  saveId: introCampaignState.campaignChatBinding.saveId
});
introChat.pushAssistantMessage({
  hostMessageId: 'intro-message',
  text: '*Stardate 53049.2 | 0830 hours*\n\n# Ashes of Peace\n\nInitial campaign intro.',
  directiveOwned: true,
  metadata: {
    campaignId: introCampaignState.campaign.id,
    responseKind: 'campaignIntro',
    idempotencyKey: 'activation:campaign-intro-native-swipe-test:intro'
  }
});
const introRewriteCalls = [];
const introStateDeltaGateway = createStateDeltaGateway({
  getState: () => introCampaignState,
  setState: (next) => { introCampaignState = cloneJson(next); },
  persist: async (next) => {
    introCampaignState = cloneJson(next);
    return { ok: true };
  },
  now
});
const introResponseDispatcher = createResponseDispatcher({
  host: { chat: introChat },
  getCampaignState: () => introCampaignState,
  setCampaignState: (next) => { introCampaignState = cloneJson(next); },
  persist: async (next) => {
    introCampaignState = cloneJson(next);
    return { ok: true };
  },
  now
});
const introSwipeOrchestrator = createChatTurnOrchestrator({
  host: { chat: introChat, prompt },
  classify: async () => {
    throw new Error('Native intro swipe must not classify a player turn.');
  },
  responseDispatcher: introResponseDispatcher,
  generationRouter: null,
  stateDeltaGateway: introStateDeltaGateway,
  getCampaignState: () => introCampaignState,
  setCampaignState: (next) => { introCampaignState = cloneJson(next); },
  persistCampaignState: async (next) => {
    introCampaignState = cloneJson(next);
    return { ok: true };
  },
  syncPromptContext: async (state) => state,
  previewDirectorTurn: async () => {
    throw new Error('Native intro swipe must not preview a Director turn.');
  },
  commitProvisionalDirectorTurn: async () => {
    throw new Error('Native intro swipe must not commit a Director turn.');
  },
  rewriteCampaignIntro: async (payload = {}) => {
    introRewriteCalls.push(cloneJson(payload));
    const swipe = await introChat.appendAssistantMessageSwipe({
      hostMessageId: payload.hostMessageId,
      text: '*Stardate 53049.2 | 0830 hours*\n\n# Ashes of Peace\n\nAlternate campaign intro generated by Directive.',
      campaignId: introCampaignState.campaign.id,
      responseKind: 'campaignIntro',
      extra: {
        directive: {
          responseKind: 'campaignIntro',
          introRevisionId: 'activation:campaign-intro-native-swipe-test:intro:1',
          selectedIntroRevisionId: 'activation:campaign-intro-native-swipe-test:intro:1',
          introRevisionReason: payload.reason
        }
      }
    });
    return {
      ok: true,
      summary: 'Campaign intro rewritten.',
      campaignState: cloneJson(introCampaignState),
      introRevision: {
        id: 'activation:campaign-intro-native-swipe-test:intro:1',
        reason: payload.reason,
        hostMessageId: payload.hostMessageId,
        swipeIndex: swipe.swipeIndex
      },
      swipe
    };
  },
  now
});
let introSwipeAbort = false;
const introSwipe = await introSwipeOrchestrator.interceptGeneration({
  chat: introChat.messages(),
  abort: () => { introSwipeAbort = true; },
  type: 'swipe'
});
assert.equal(introSwipe.handled, true);
assert.equal(introSwipe.responseStrategy, 'campaignIntroRewrite');
assert.equal(introSwipe.abortDefaultGeneration, true);
assert.equal(introSwipeAbort, true);
assert.equal(introRewriteCalls.length, 1);
assert.equal(introRewriteCalls[0].hostMessageId, 'intro-message');
assert.equal(introRewriteCalls[0].reason, 'native-swipe-reroll');
assert.equal(introRewriteCalls[0].campaignState.campaign.id, introCampaignState.campaign.id);
const introResponse = introChat.messages().find((entry) => entry.metadata?.responseKind === 'campaignIntro');
assert.equal(introResponse.swipes.length, 2);
assert.equal(introResponse.swipe_id, 1);
assert.match(introResponse.swipes[1], /# Ashes of Peace/);
assert.equal(introResponse.metadata.introRevisionReason, 'native-swipe-reroll');
assert.equal(introSwipe.rewrite.introRevision.reason, 'native-swipe-reroll');

const continuationsBeforeCounsel = hostGenerationContinuations.length;
const advisorCallsBeforeCounsel = responseSwipeGenerationCalls.filter((call) => call.roleId === 'missionDirectorAdvisor').length;
const counsel = await send('What are our options here?', 'player-counsel-format');
assert.equal(counsel.decision.classification, 'counselRequest');
assert.equal(counsel.responseStrategy, 'injectAndContinue');
assert.equal(counsel.abortDefaultGeneration, false);
assert.equal(chat.messages().filter((entry) => entry.metadata?.responseKind === 'counsel').length, 0);
assert.equal(counsel.advisory.subject, 'Decision support advisory');
assert.equal(counsel.advisory.involvedCrewIds.length, 0);
assert.equal(campaignState.commandCompetence.counselRequestLedger.at(-1).id, counsel.advisory.id);
assert.equal(campaignState.commandCompetence.counselRequestLedger.at(-1).options.length, 0);
assert.equal(campaignState.runtimeTracking.responseLedger.at(-1).strategy, 'injectAndContinue');
assert.equal(campaignState.runtimeTracking.responseLedger.at(-1).responseKind, 'hostGeneration');
assert.equal(hostGenerationContinuations.length, continuationsBeforeCounsel + 1);
assert.equal(hostGenerationContinuations.at(-1).reason, 'directive-inject-and-continue');
assert.equal(campaignState.runtimeTracking.responseLedger.at(-1).hostContinuation?.ok, true);
assert.equal(responseSwipeGenerationCalls.filter((call) => call.roleId === 'missionDirectorAdvisor').length, advisorCallsBeforeCounsel);
assert.equal(counsel.advisoryEnrichment.status, 'queued');
assert.equal(counsel.advisoryEnrichment.advisoryId, counsel.advisory.id);
assert.equal(advisoryEnrichmentCalls.length, 1);
assert.equal(advisoryEnrichmentCalls[0].hasRun, true);
assert.equal(advisoryEnrichmentCalls[0].payload.advisoryId, counsel.advisory.id);
assert.equal(advisoryEnrichmentCalls[0].hostGenerationContinuationCount, continuationsBeforeCounsel + 1);
assert.equal(advisoryEnrichmentCalls[0].missionDirectorAdvisorCallCount, advisorCallsBeforeCounsel);

const consequential = await send('I order helm to change course and pursue the freighter.', 'player-consequential');
assert.equal(consequential.decision.classification, 'consequentialCommand');
assert.equal(consequential.abortDefaultGeneration, true);
assert.equal(previewCalls.length, 1);
assert.equal(commitCalls.length, 1);
assert.equal(chat.messages().filter((entry) => entry.metadata?.responseKind === 'committedOutcome').length, 1);
assert.equal(campaignState.runtimeTracking.lastCommittedTurn.responseStatus, 'complete');
const consequentialResponse = campaignState.runtimeTracking.responseLedger.at(-1);
assert.equal(consequentialResponse.strategy, 'directivePosted');
assert.equal(consequentialResponse.responseKind, 'committedOutcome');
assert.ok(consequentialResponse.directiveGenerationStartedAt);
assert.equal(consequentialResponse.directiveGenerationStartedAt, consequentialResponse.generationStartedAt);
assert.equal(consequentialResponse.turnLatency.directiveGenerationStartedAt, Date.parse(consequentialResponse.directiveGenerationStartedAt));
assert.equal(campaignState.runtimeTracking.activeIngressId.includes('player-consequential'), true);
assert.equal(postCommitConversationCalls.length, 1);
assert.equal(postCommitConversationCalls[0].outcomeId, 'outcome-1');
assert.equal(postCommitConversationCalls[0].messages.map((entry) => entry.role).join(','), 'user,assistant');
assert.equal(consequential.postCommitConversation.scheduled, true);
assert.equal(consequential.postCommitConversation.status, 'queued');
assert.equal(consequential.postCommitConversation.outcomeId, 'outcome-1');
assert.equal(forgeSceneSealCalls.length, 1);
const consequentialIngress = campaignState.runtimeTracking.ingressLedger.find((entry) => entry.hostMessageId === 'player-consequential');
const consequentialSeal = forgeSceneSealCalls[0];
assert.equal(consequentialSeal.transactionId, consequentialIngress.coreTransactionId);
assert.equal(consequentialSeal.outcomeId, 'outcome-1');
assert.equal(consequentialSeal.flushLens, true);
assert.equal(consequentialSeal.sourceFrameRef.id, consequentialIngress.sourceFrameId);
assert.equal(consequentialSeal.seal.phaseId, 'phase-bridge-intercept');
assert.equal(consequentialSeal.seal.sceneId, 'scene-bridge-intercept');
assert.equal(consequentialSeal.seal.locationId, 'breckenridge-bridge');
assert.deepEqual(consequentialSeal.seal.actorIds, ['sam-vickers', 'mara-whitaker']);
assert.equal(consequentialSeal.seal.eventRefs[0].assistantHostMessageId, consequentialResponse.hostMessageId);
assert.equal(JSON.stringify(consequentialSeal).includes('I order helm to change course'), false);
assert.equal(JSON.stringify(consequentialSeal).includes('Committed narration for outcome-1'), false);
assert.equal(forgePressureArcDigestCalls.length, 1);
const consequentialDigest = forgePressureArcDigestCalls[0];
assert.equal(consequentialDigest.transactionId, consequentialIngress.coreTransactionId);
assert.equal(consequentialDigest.outcomeId, 'outcome-1');
assert.equal(consequentialDigest.flushLens, true);
assert.equal(consequentialDigest.sourceFrameRef.id, consequentialIngress.sourceFrameId);
assert.equal(consequentialDigest.digest.phaseId, 'phase-bridge-intercept');
assert.equal(consequentialDigest.digest.sceneId, 'scene-bridge-intercept');
assert.equal(consequentialDigest.digest.locationId, 'breckenridge-bridge');
assert.deepEqual(consequentialDigest.digest.actorIds, ['sam-vickers', 'mara-whitaker']);
assert.equal(consequentialDigest.digest.callbackRefs[0].assistantHostMessageId, consequentialResponse.hostMessageId);
assert.equal(consequentialDigest.digest.tags.includes('pressure-arc-digest'), true);
assert.equal(consequentialDigest.digest.summaryDigest.hash.startsWith('fnv1a:'), true);
assert.equal(JSON.stringify(consequentialDigest).includes('I order helm to change course'), false);
assert.equal(JSON.stringify(consequentialDigest).includes('Committed narration for outcome-1'), false);
assert.equal(forgeOpenWorldBoundaryCalls.length, 1);
const consequentialBoundary = forgeOpenWorldBoundaryCalls[0];
assert.equal(consequentialBoundary.transactionId, consequentialIngress.coreTransactionId);
assert.equal(consequentialBoundary.outcomeId, 'outcome-1');
assert.equal(consequentialBoundary.flushLens, true);
assert.equal(consequentialBoundary.sourceFrameRef.id, consequentialIngress.sourceFrameId);
assert.equal(consequentialBoundary.reducerRef.sourceKind, 'directive.openWorldReducerBundle.v1');
assert.equal(consequentialBoundary.reducerRef.sourceOutcomeId, 'outcome-1');
assert.deepEqual(consequentialBoundary.reducerRef.changedRoots, ['questLedger', 'worldState']);
assert.equal(consequentialBoundary.reducerRef.operationCount, 2);
assert.equal(consequentialBoundary.reducerRef.diagnostics.boundaryType, 'locationTransition');
assert.equal(consequentialBoundary.reducerRef.sourceAnchorRangeHash, 'range-hash-outcome-1');
assert.equal(consequentialBoundary.boundaryType, 'locationTransition');
assert.equal(consequentialBoundary.phaseId, 'phase-bridge-intercept');
assert.equal(consequentialBoundary.sceneId, 'scene-bridge-intercept');
assert.equal(consequentialBoundary.locationId, 'breckenridge-bridge');
assert.equal(JSON.stringify(consequentialBoundary).includes('I order helm to change course'), false);
assert.equal(JSON.stringify(consequentialBoundary).includes('Committed narration for outcome-1'), false);
assert.equal(JSON.stringify(consequentialBoundary).includes('RAW_OPEN_WORLD'), false);
assert.equal(JSON.stringify(consequentialBoundary).includes('hostMessageIds'), false);

const consequenceDuplicate = await orchestrator.observePlayerMessage({
  chatId: 'campaign-chat',
  message: chat.getMessage('player-consequential')
});
assert.equal(consequenceDuplicate.deduplicated, true);
assert.equal(consequenceDuplicate.abortDefaultGeneration, true);
assert.equal(commitCalls.length, 1);
assert.equal(chat.messages().filter((entry) => entry.metadata?.responseKind === 'committedOutcome').length, 1);
assert.equal(forgeSceneSealCalls.length, 1);
assert.equal(forgePressureArcDigestCalls.length, 1);
assert.equal(forgeOpenWorldBoundaryCalls.length, 1);

const indexedMessageText = 'I order helm to intercept the armed raider and tactical to disable its weapons before it reaches the convoy.';
const indexedMessage = await orchestrator.observePlayerMessage({
  chatId: 'campaign-chat',
  hostMessageId: '42',
  index: 42,
  text: indexedMessageText,
  isUser: true
});
assert.equal(indexedMessage.abortDefaultGeneration, true);
assert.equal(commitCalls.length, 2);
let indexedAbort = false;
const indexedPromptIntercept = await orchestrator.interceptGeneration({
  chat: [
    { mes: 'Older prompt context.', is_user: false, index: 38 },
    { mes: indexedMessageText, is_user: true, index: 42 }
  ],
  abort: () => { indexedAbort = true; },
  type: 'normal'
});
assert.equal(indexedPromptIntercept.deduplicated, true);
assert.equal(indexedPromptIntercept.abortDefaultGeneration, true);
assert.equal(indexedAbort, true);
assert.equal(commitCalls.length, 2, 'Interceptor prompt-array indices must dedupe against MESSAGE_SENT host indices.');

let ownedDepthAbort = false;
globalThis.__directiveOwnedGenerationDepth = 1;
try {
  const ownedDepthPromptIntercept = await orchestrator.interceptGeneration({
    chat: [{ mes: indexedMessageText, is_user: true, index: 42 }],
    abort: () => { ownedDepthAbort = true; },
    type: 'normal'
  });
  assert.equal(ownedDepthPromptIntercept.deduplicated, true);
  assert.equal(ownedDepthPromptIntercept.abortDefaultGeneration, true);
  assert.equal(ownedDepthAbort, true);
  assert.equal(commitCalls.length, 2, 'Normal host generation must still abort while a Directive provider call is in flight.');
} finally {
  delete globalThis.__directiveOwnedGenerationDepth;
}

let regenerateAborted = false;
const regenerate = await orchestrator.interceptGeneration({
  chat: chat.messages(),
  abort: () => { regenerateAborted = true; },
  type: 'regenerate'
});
assert.equal(regenerate.deduplicated, true);
assert.equal(regenerate.abortDefaultGeneration, true, 'Regeneration must not bypass a committed Directive outcome.');
assert.equal(regenerateAborted, true);
assert.equal(commitCalls.length, 2, 'Regeneration must reuse, not reroll, committed mechanics.');

const risk = await send('Fire phasers and disable their life support.', 'player-risk');
assert.equal(risk.decision.classification, 'riskConfirmationNeeded');
assert.equal(risk.abortDefaultGeneration, true);
assert.equal(previewCalls.length, 3, 'Risk classification must still create a provisional Director turn.');
assert.equal(commitCalls.length, 2, 'Risk mechanics must remain uncommitted until confirmation.');
const riskInteraction = campaignState.runtimeTracking.pendingInteractions.find((entry) => entry.ingressId?.includes('player-risk') && entry.status === 'pending');
assert.ok(riskInteraction);
assert.ok(riskInteraction.turnId);
assert.ok(riskInteraction.outcomeId);
assert.deepEqual(riskInteraction.options.map((entry) => entry.id), ['confirm', 'revise']);

const postCommitConversationCallsBeforeRiskResolution = postCommitConversationCalls.length;
const riskResolution = await send('Confirm the order.', 'player-risk-confirm');
assert.equal(riskResolution.resolvedPendingInteraction, true);
assert.equal(riskResolution.abortDefaultGeneration, true);
assert.equal(commitCalls.length, 3);
assert.equal(commitCalls.at(-1).confirmWarnings, true);
assert.equal(previewCalls.length, 3, 'Chat confirmation must resolve the pending turn, not preview a new one.');
assert.equal(campaignState.runtimeTracking.pendingInteractions.find((entry) => entry.id === riskInteraction.id).status, 'resolved');
assert.equal(chat.messages().filter((entry) => entry.metadata?.responseKind === 'committedOutcome').length, 3);
assert.equal(postCommitConversationCalls.length, postCommitConversationCallsBeforeRiskResolution + 1);
assert.equal(riskResolution.postCommitConversation.scheduled, true);
assert.equal(riskResolution.postCommitConversation.status, 'queued');
const riskResolutionPostCommit = postCommitConversationCalls.at(-1);
assert.equal(riskResolutionPostCommit.ingressId, riskInteraction.ingressId);
assert.equal(riskResolutionPostCommit.pendingInteractionId, riskInteraction.id);
assert.equal(riskResolutionPostCommit.resolutionIngressId, `${riskInteraction.ingressId}:resolution:${riskInteraction.id}`);
assert.equal(riskResolutionPostCommit.resolutionMessageId, 'player-risk-confirm');
assert.equal(riskResolutionPostCommit.messages.map((entry) => entry.role).join(','), 'user,assistant');
assert.equal(riskResolutionPostCommit.messages[0].id, 'player-risk');
assert.equal(riskResolutionPostCommit.messages[0].text, 'Fire phasers and disable their life support.');
assert.equal(riskResolutionPostCommit.messages[1].id, riskResolution.response.hostMessageId);

const clarification = await send('Proceed.', 'player-clarification');
assert.equal(clarification.decision.classification, 'clarificationNeeded');
assert.equal(clarification.abortDefaultGeneration, true);
assert.equal(previewCalls.length, 3, 'Clarification should pause before invoking the Director.');
const clarificationInteraction = campaignState.runtimeTracking.pendingInteractions.find((entry) => entry.ingressId?.includes('player-clarification') && entry.status === 'pending');
assert.ok(clarificationInteraction);
assert.equal(clarificationInteraction.options.length, 0);
const postCommitConversationCallsBeforeCancel = postCommitConversationCalls.length;
const canceled = await orchestrator.resolveInteraction({ interactionId: clarificationInteraction.id, action: 'cancel' });
assert.equal(canceled.ok, true);
assert.equal(commitCalls.length, 3);
assert.equal(campaignState.runtimeTracking.pendingInteractions.find((entry) => entry.id === clarificationInteraction.id).status, 'canceled');
assert.equal(postCommitConversationCalls.length, postCommitConversationCallsBeforeCancel, 'Canceling a pending interaction must not queue Narrative Thread settlement.');

const samClarification = await send('Proceed.', 'player-clarification-sam');
assert.equal(samClarification.decision.classification, 'clarificationNeeded');
const samClarificationInteraction = campaignState.runtimeTracking.pendingInteractions.find((entry) => (
  entry.ingressId?.includes('player-clarification-sam') && entry.status === 'pending'
));
assert.ok(samClarificationInteraction);
const commitCallsBeforeSamAnswer = commitCalls.length;
const routineResponsesBeforeSamAnswer = chat.messages().filter((entry) => entry.metadata?.responseKind === 'routineCommand').length;
const clarificationAnswerOrchestrator = createChatTurnOrchestrator({
  host: { chat, prompt },
  classify: ({ text, context }) => classifyChatTurn({
    text,
    context,
    generationRouter: {
      async generate(roleId) {
        assert.equal(roleId, 'utilityTurnClassifier');
        return {
          ok: true,
          roleId,
          response: {
            providerId: 'fixture-utility',
            text: JSON.stringify({
              kind: 'directive.turnIntentClassification',
              classification: 'routineCommand',
              responseStrategy: 'directivePosted',
              confidence: 0.78,
              ambiguity: 'medium',
              speechAct: 'order',
              action: 'engage autopilot for final docking approach',
              target: 'shuttle Tannhauser docking sequence',
              targetConfidence: 0.75,
              domainSignals: ['flight-operations', 'docking'],
              riskSignals: [],
              missingInformation: [],
              pendingInteractionResolution: samClarificationInteraction.id,
              mixedIntent: false,
              workerPlan: {
                narrator: true,
                ship: true
              },
              reasons: ['The player gives the answer to the pending autopilot/manual clarification.']
            })
          },
          diagnostics: { providerId: 'fixture-utility' }
        };
      }
    }
  }),
  responseDispatcher,
  generationRouter: {
    async generate(roleId, request) {
      responseSwipeGenerationCalls.push({ roleId, request: cloneJson(request) });
      return {
        ok: true,
        response: {
          providerId: 'fake-response-swipe-provider',
          text: `Alternate Directive response ${responseSwipeGenerationCalls.length}.`
        },
        diagnostics: { providerId: 'fake-response-swipe-provider' }
      };
    }
  },
  stateDeltaGateway,
  getCampaignState,
  setCampaignState,
  persistCampaignState,
  syncPromptContext: async (state) => state,
  previewDirectorTurn: async () => {
    throw new Error('Clarification answer routine test must not preview a Director turn.');
  },
  commitProvisionalDirectorTurn: async () => {
    throw new Error('Clarification answer routine test must not commit a provisional Director turn.');
  },
  discardProvisionalDirectorTurn: async () => {},
  sidecarScheduler: {
    schedule(payload) {
      sidecarCalls.push(cloneJson(payload));
      return Promise.resolve({ ok: true });
    }
  },
  now
});
const samAnswerMessage = chat.pushPlayerMessage({
  text: 'Sam trusts systems. The autopilot would be far better than any human piloting the final docking approach.',
  hostMessageId: 'player-clarification-sam-answer'
});
const samAnswer = await clarificationAnswerOrchestrator.observePlayerMessage({
  chatId: 'campaign-chat',
  message: samAnswerMessage
});
assert.equal(samAnswer.decision.classification, 'routineCommand');
assert.equal(samAnswer.responseStrategy, 'directivePosted');
assert.equal(samAnswer.abortDefaultGeneration, true);
assert.equal(commitCalls.length, commitCallsBeforeSamAnswer, 'Clarification answers without provisional turns must not call commitProvisionalDirectorTurn.');
assert.equal(campaignState.runtimeTracking.pendingInteractions.find((entry) => entry.id === samClarificationInteraction.id).status, 'resolved');
assert.equal(chat.messages().filter((entry) => entry.metadata?.responseKind === 'routineCommand').length, routineResponsesBeforeSamAnswer + 1);

const samAnswerIngress = campaignState.runtimeTracking.ingressLedger.find((entry) => entry.hostMessageId === 'player-clarification-sam-answer');
campaignState = updateTurnIngress(campaignState, samAnswerIngress.id, {
  status: 'invalidated',
  invalidatedAt: '2026-06-22T01:00:55.000Z',
  invalidationType: 'playerMessageDeleted',
  replacementText: null
});
campaignState = recordRecoveryEvent(campaignState, {
  id: 'recovery-sam-answer-delete',
  type: 'playerMessageDeleted',
  status: 'invalidated',
  hostMessageId: 'player-clarification-sam-answer',
  ingressId: samAnswerIngress.id,
  outcomeId: null,
  recordedAt: '2026-06-22T01:00:55.000Z'
});
const samAnswerReobserved = await clarificationAnswerOrchestrator.observePlayerMessage({
  chatId: 'campaign-chat',
  message: samAnswerMessage
});
const reobservedIngress = campaignState.runtimeTracking.ingressLedger.find((entry) => entry.id === samAnswerIngress.id);
const resolvedDeleteRecovery = campaignState.runtimeTracking.recoveryJournal.find((entry) => entry.id === 'recovery-sam-answer-delete');
assert.equal(samAnswerReobserved.handled, true);
assert.notEqual(reobservedIngress.status, 'invalidated');
assert.equal(reobservedIngress.invalidationType, null);
assert.equal(reobservedIngress.invalidatedAt, null);
assert.equal(resolvedDeleteRecovery.status, 'resolved');
assert.equal(resolvedDeleteRecovery.resolution.reason, 'message-reobserved');

const readiedSeed = migrateCommandBearingState(campaignState);
readiedSeed.tracks.resolve.points = 1;
const readiedResolve = readyCommandBearingPoint(readiedSeed, {
  readiedId: 'readied-orchestrator-resolve',
  track: 'resolve',
  chatId: 'campaign-chat',
  saveId: campaignState.campaignChatBinding.saveId,
  createdAt: '2026-06-22T01:00:57.000Z'
});
assert.equal(readiedResolve.applied, true);
campaignState = {
  ...cloneJson(campaignState),
  commandBearing: cloneJson(readiedResolve.commandBearing),
  commandBearing: cloneJson(readiedResolve.commandBearing)
};
nextCommandBearingPrompt = {
  eligible: true,
  actions: [{
    track: 'resolve',
    label: 'Use Resolve',
    from: 'Failure',
    to: 'Partial Success',
    rationale: 'Resolve fits because the player accepts responsibility and gives a lawful, specific command under pressure.'
  }]
};
const readiedCommitted = await send(
  'I order the bridge to hold formation, accept the exposure, and keep the convoy covered until the last transport clears.',
  'player-readied-resolve'
);
assert.equal(readiedCommitted.abortDefaultGeneration, true);
assert.equal(readiedCommitted.responseStrategy, 'directivePosted');
assert.equal(commitCalls.at(-1).readiedCommandBearing.track, 'resolve');
assert.equal(commitCalls.at(-1).readiedCommandBearing.id, 'readied-orchestrator-resolve');
assert.equal(commitCalls.at(-1).readiedCommandBearing.ingressId.includes('player-readied-resolve'), true);
assert.equal(commitCalls.at(-1).readiedCommandBearing.hostMessageId, 'player-readied-resolve');
assert.equal(commitCalls.at(-1).readiedCommandBearing.fit, 'strong');
assert.equal(
  responseSwipeGenerationCalls.some((entry) => entry.roleId === 'commandBearingSpendValidator'),
  true,
  'Readied Command Bearing spend must call the provider-routable spend validator.'
);
assert.equal(campaignState.commandBearing.readied, null);
assert.equal(
  campaignState.runtimeTracking.pendingInteractions.some((entry) => entry.kind === 'commandBearing' && entry.ingressId?.includes('player-readied-resolve')),
  false,
  'Readied Command Bearing spend must not use the old pause-first pending interaction.'
);

nextPreviewOutcomeBand = 'Partial Failure';
const fallbackGenerationStartedAt = '2026-06-22T01:31:00.000Z';
nextNarrationResult = {
  ok: false,
  directiveGenerationStartedAt: fallbackGenerationStartedAt,
  error: {
    code: 'fixture_narration_timeout',
    directiveGenerationStartedAt: fallbackGenerationStartedAt,
    generationStartedAt: fallbackGenerationStartedAt
  }
};
const fallbackNarration = await send(
  'I order tactical to accept that Bronn already deleted the private trace and to proceed as if the cleanup was authorized.',
  'player-fallback-narration'
);
assert.equal(fallbackNarration.abortDefaultGeneration, true);
assert.equal(fallbackNarration.responseStrategy, 'directivePosted');
const fallbackResponse = chat.messages().filter((entry) => entry.metadata?.responseKind === 'committedOutcome').at(-1);
assert.ok(fallbackResponse);
assert.match(fallbackResponse.text, /^\*Stardate \d+(?:\.\d+)? \| \d{4} hours\*\n\n/);
assert.doesNotMatch(fallbackResponse.text, /The attempt resolves as/i);
assert.match(fallbackResponse.text, /The bridge absorbs the setback and keeps the next decision in view\./);
assert.equal(
  fallbackResponse.text.includes('The order is carried out'),
  false,
  'Local committed-outcome fallback must not imply a contested player-authored order succeeded.'
);
const fallbackResponseLedger = campaignState.runtimeTracking.responseLedger.at(-1);
assert.equal(fallbackResponseLedger.responseKind, 'committedOutcome');
assert.equal(fallbackResponseLedger.directiveGenerationStartedAt, fallbackGenerationStartedAt);
assert.equal(fallbackResponseLedger.generationStartedAt, fallbackGenerationStartedAt);
assert.equal(fallbackResponseLedger.turnLatency.directiveGenerationStartedAt, Date.parse(fallbackGenerationStartedAt));
const fallbackRecovery = campaignState.runtimeTracking.recoveryJournal.find(
  (entry) => entry.type === 'providerFailureAfterMechanicsCommit' && entry.outcomeId === commitCalls.at(-1).outcomeId
);
assert.equal(
  Boolean(fallbackRecovery),
  true,
  'Narration fallback should still record provider-failure recovery after mechanics commit.'
);
assert.equal(fallbackRecovery.details.repairDecision.eventType, 'providerFailureAfterMechanicsCommit');
assert.equal(fallbackRecovery.details.repairDecision.retryDirectiveResponse, true);
assert.equal(fallbackRecovery.details.coreRecovery.status, 'recorded');
assert.equal(fallbackRecovery.details.coreRecovery.transactionId, fallbackRecovery.details.repairDecision.transactionId);
assert.equal(coreRecoveryCalls.at(-1).recoveryBundle.repairDecision.eventType, 'providerFailureAfterMechanicsCommit');

const assistantCountBeforeIntercept = chat.messages().filter((entry) => entry.isDirectiveOwned).length;
const lastPlayer = chat.pushPlayerMessage({ text: 'I smile and wait.', hostMessageId: 'player-interceptor' });
let aborted = false;
const intercept = await orchestrator.interceptGeneration({
  chat: [...chat.messages(), lastPlayer.raw].filter(Boolean),
  abort: () => { aborted = true; },
  type: 'normal'
});
assert.equal(intercept.abortDefaultGeneration, false);
assert.equal(aborted, false);
assert.equal(chat.messages().filter((entry) => entry.isDirectiveOwned).length, assistantCountBeforeIntercept);

const providerPreemptMismatchText = 'I order tactical to accept that Bronn already deleted the private trace and to proceed as if the cleanup was authorized.';
assert.equal(
  shouldPreemptHostGenerationForTurn(providerPreemptMismatchText, {
    activeMissionId: campaignState.mission?.activeMissionId,
    activePhaseId: campaignState.mission?.activePhaseId,
    activeDecisionPointCount: (
      campaignState.mission?.activeDecisionPoints
      || campaignState.mission?.availableDecisionPointIds
      || []
    ).length,
    commandAuthority: campaignState.player?.authority || campaignState.player?.billet
  }),
  true,
  'The provider override fixture should reproduce the old deterministic preemption path.'
);
const providerOverrideOrchestrator = createChatTurnOrchestrator({
  host: { chat, prompt },
  classify: async () => ({
    kind: 'directive.validatedTurnDecision',
    classification: 'sceneColor',
    confidence: 0.95,
    ambiguity: 'low',
    speechAct: 'question',
    action: 'ask dismissal',
    target: 'Captain Whitaker',
    targetConfidence: 0.95,
    domainSignals: [],
    riskSignals: [],
    missingInformation: [],
    pendingInteractionResolution: null,
    closureSignals: {
      possibleClosure: false,
      confidence: 'low',
      closureTypes: [],
      playerFacingReason: ''
    },
    mixedIntent: false,
    reasons: ['Provider correctly routes the in-scene question back to host generation.'],
    workerPlan: {
      relationship: true,
      continuity: false,
      promptUpdate: false,
      narrator: true
    },
    responseStrategy: 'injectAndContinue'
  }),
  responseDispatcher,
  generationRouter: null,
  stateDeltaGateway,
  getCampaignState,
  setCampaignState,
  persistCampaignState,
  syncPromptContext: async (state) => state,
  previewDirectorTurn: async () => {
    throw new Error('Scene-color provider override must not preview a Director turn.');
  },
  commitProvisionalDirectorTurn: async () => {
    throw new Error('Scene-color provider override must not commit a Director turn.');
  },
  sidecarScheduler: {
    schedule(payload) {
      sidecarCalls.push(cloneJson(payload));
      return Promise.resolve({ ok: true });
    }
  },
  now
});
const providerPreemptMismatchMessage = chat.pushPlayerMessage({
  text: providerPreemptMismatchText,
  hostMessageId: 'player-provider-preempt-mismatch'
});
let providerPreemptMismatchAborted = false;
const providerPreemptMismatch = await providerOverrideOrchestrator.interceptGeneration({
  chat: [...chat.messages(), providerPreemptMismatchMessage.raw].filter(Boolean),
  abort: () => { providerPreemptMismatchAborted = true; },
  type: 'normal'
});
assert.equal(providerPreemptMismatch.decision.classification, 'sceneColor');
assert.equal(providerPreemptMismatch.responseStrategy, 'injectAndContinue');
assert.equal(providerPreemptMismatch.abortDefaultGeneration, false);
assert.equal(providerPreemptMismatch.preemptedHostGeneration, false);
assert.equal(providerPreemptMismatch.abortedHostGeneration, false);
assert.equal(
  providerPreemptMismatchAborted,
  false,
  'Provider-overridden host-continuation turns must not leave SillyTavern generation aborted.'
);

const staleRisk = await send('Fire phasers and disable their life support again.', 'player-risk-stale');
assert.equal(staleRisk.decision.classification, 'riskConfirmationNeeded');
const staleRiskInteraction = campaignState.runtimeTracking.pendingInteractions.find((entry) => (
  entry.ingressId?.includes('player-risk-stale') && entry.status === 'pending'
));
assert.ok(staleRiskInteraction);
const commitsBeforeStaleRiskConfirmation = commitCalls.length;
const postCommitBeforeStaleRiskConfirmation = postCommitConversationCalls.length;
campaignState = updateTurnIngress(campaignState, staleRiskInteraction.ingressId, {
  status: 'invalidated',
  invalidatedAt: '2026-06-22T01:03:00.000Z',
  invalidationType: 'playerMessageEdited',
  replacementText: 'The invalidated source command should not be committed.'
});
const staleRiskConfirmation = await orchestrator.resolveInteraction({
  interactionId: staleRiskInteraction.id,
  action: 'confirm'
});
assert.equal(staleRiskConfirmation.ok, false);
assert.equal(staleRiskConfirmation.stale, true);
assert.equal(staleRiskConfirmation.reason, 'source-ingress-stale');
assert.equal(
  staleRiskConfirmation.staleResult.staleReasons.includes('status:invalidated')
    || staleRiskConfirmation.staleResult.staleReasons.includes('invalidated'),
  true
);
assert.equal(commitCalls.length, commitsBeforeStaleRiskConfirmation, 'Invalidated pending source must not commit mechanics on confirmation.');
assert.equal(postCommitConversationCalls.length, postCommitBeforeStaleRiskConfirmation, 'Invalidated pending source must not queue Narrative Thread settlement.');

const noActivePrompt = createFakePromptAdapter();
const noActivePromptClearRequests = [];
const noActiveCampaignOrchestrator = createChatTurnOrchestrator({
  host: {
    chat: createFakeChatAdapter({ chatId: 'no-active-campaign-chat' }),
    prompt: noActivePrompt
  },
  classify: async () => {
    throw new Error('No-active-campaign chat change must not classify a turn.');
  },
  responseDispatcher: {
    dispatch: async () => {
      throw new Error('No-active-campaign chat change must not dispatch a response.');
    }
  },
  stateDeltaGateway,
  getCampaignState: () => null,
  setCampaignState: () => {},
  persistCampaignState: async () => ({ ok: true }),
  syncPromptContext: async (state) => state,
  previewDirectorTurn: async () => {
    throw new Error('No-active-campaign chat change must not preview a Director turn.');
  },
  commitProvisionalDirectorTurn: async () => {
    throw new Error('No-active-campaign chat change must not commit a Director turn.');
  },
  clearDirectivePrompt: async (options = {}) => {
    noActivePromptClearRequests.push(cloneJson(options));
    const result = await noActivePrompt.clear({
      reason: options.reason || 'no-active-campaign',
      lane: 'all'
    });
    return { status: 'cleared', lane: 'all', result };
  },
  now
});
const noActiveChatChange = await noActiveCampaignOrchestrator.handleChatChanged();
assert.equal(noActiveChatChange.active, false);
assert.equal(noActiveChatChange.promptClear.status, 'cleared');
assert.deepEqual(noActivePromptClearRequests, [{ reason: 'no-active-campaign' }]);
const noActivePromptClearCall = noActivePrompt.calls().filter((entry) => entry.type === 'clear').at(-1);
assert.equal(noActivePromptClearCall.options.reason, 'no-active-campaign');
assert.equal(noActivePromptClearCall.options.lane, 'all');
assert.equal(noActivePromptClearCall.options.preservePacket, undefined);

const unboundPrompt = createFakePromptAdapter();
const unboundLensClearRequests = [];
const unboundLensSuspendRequests = [];
const unboundState = initializeCampaignRuntimeTracking(cloneJson(projection.initialState));
unboundState.campaign = {
  ...unboundState.campaign,
  id: 'unbound-campaign',
  status: 'active'
};
unboundState.campaignChatBinding = {
  hostId: 'fake',
  chatId: 'bound-chat',
  campaignId: 'unbound-campaign',
  saveId: 'unbound-save'
};
const unboundChatOrchestrator = createChatTurnOrchestrator({
  host: {
    chat: createFakeChatAdapter({ chatId: 'other-chat' }),
    prompt: unboundPrompt
  },
  classify: async () => {
    throw new Error('Unbound-chat change must not classify a turn.');
  },
  responseDispatcher: {
    dispatch: async () => {
      throw new Error('Unbound-chat change must not dispatch a response.');
    }
  },
  stateDeltaGateway,
  getCampaignState: () => unboundState,
  setCampaignState: () => {},
  persistCampaignState: async () => ({ ok: true }),
  syncPromptContext: async (state) => state,
  previewDirectorTurn: async () => {
    throw new Error('Unbound-chat change must not preview a Director turn.');
  },
  commitProvisionalDirectorTurn: async () => {
    throw new Error('Unbound-chat change must not commit a Director turn.');
  },
  clearDirectivePrompt: async (options = {}) => {
    unboundLensClearRequests.push(cloneJson(options));
    throw new Error('Unbound-chat preserve-packet suspension must not route through LENS global clear.');
  },
  suspendDirectivePrompt: async (options = {}) => {
    unboundLensSuspendRequests.push(cloneJson(options));
    const result = await unboundPrompt.clear({
      reason: options.reason || 'unbound-chat',
      lane: 'all',
      preservePacket: true
    });
    return { status: 'suspended', lane: 'all', result };
  },
  now
});
const unboundChatChange = await unboundChatOrchestrator.handleChatChanged();
assert.equal(unboundChatChange.active, false);
assert.equal(unboundChatChange.suspended, true);
assert.deepEqual(unboundLensClearRequests, []);
assert.deepEqual(unboundLensSuspendRequests, [{ reason: 'unbound-chat' }]);
assert.equal(unboundChatChange.promptSuspension.status, 'suspended');
const unboundPromptClearCall = unboundPrompt.calls().filter((entry) => entry.type === 'clear').at(-1);
assert.equal(unboundPromptClearCall.options.reason, 'unbound-chat');
assert.equal(unboundPromptClearCall.options.preservePacket, true);
assert.equal(unboundPromptClearCall.options.lane, 'all');

assert.equal(sidecarCalls.length >= 4, true);
assert.equal(persisted.length > 0, true);
console.log('Chat-turn orchestrator tests passed: utility routing, deduplication, exactly-one response, Readied Command Bearing spend, risk pause/confirm, and clarification cancellation');
