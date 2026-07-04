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
  recordTurnIngress,
  updateTurnIngress
} from '../../src/runtime/state-delta-gateway.mjs';

const root = process.cwd();
const readJson = (filePath) => JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
const cloneJson = (value) => JSON.parse(JSON.stringify(value));
const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');

function recordLegacyRecoveryFixture(campaignState, event, { limit = 100 } = {}) {
  const state = initializeCampaignRuntimeTracking(cloneJson(campaignState));
  const id = String(event.id || `recovery-${state.runtimeTracking.recoveryJournal.length + 1}`).trim();
  const entries = state.runtimeTracking.recoveryJournal.filter((entry) => entry.id !== id);
  entries.push({
    id,
    type: event.type || 'recovery',
    status: event.status || 'recorded',
    hostMessageId: event.hostMessageId || null,
    ingressId: event.ingressId || null,
    outcomeId: event.outcomeId || null,
    recordedAt: event.recordedAt || new Date().toISOString(),
    details: cloneJson(event.details || {})
  });
  state.runtimeTracking.recoveryJournal = entries.slice(-limit);
  return state;
}

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
const coreVisibleResponseCalls = [];
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
      route: phasePatch.route || null,
      responseId: phasePatch.responseId || existing.responseId || null,
      responseKind: phasePatch.responseKind || existing.responseKind || null,
      outcomeId: phasePatch.outcomeId || existing.outcomeId || null,
      timing: cloneJson(phasePatch.timing || existing.timing || null)
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
  async recordVisibleResponse(transactionId, responseRef = {}) {
    coreVisibleResponseCalls.push({ transactionId, responseRef: cloneJson(responseRef) });
    const prior = coreTransactions.get(transactionId) || { id: transactionId };
    const repairDecision = responseRef.repairDecision || null;
    const closesRecovery = repairDecision?.authorized === true && repairDecision?.recoveryResolved === true;
    const transaction = {
      ...prior,
      id: transactionId,
      phase: 'visibleResponsePosted',
      visibleResponseRef: cloneJson(responseRef),
      visibleResponseIdempotencyKey: responseRef.idempotencyKey || null,
      recoveryCaseId: closesRecovery ? null : prior.recoveryCaseId || null
    };
    coreTransactions.set(transactionId, cloneJson(transaction));
    return transaction;
  },
  async getTransaction(transactionId) {
    return cloneJson(coreTransactions.get(transactionId) || null);
  },
  readProjections() {
    const responseLedger = [...coreTransactions.values()]
      .filter((transaction) => transaction.visibleResponseRef || transaction.responseId || ['hostContinueReleased', 'visibleResponsePosted'].includes(transaction.phase))
      .map((transaction) => ({
        id: transaction.visibleResponseRef?.responseId || transaction.responseId || null,
        responseId: transaction.visibleResponseRef?.responseId || transaction.responseId || null,
        transactionId: transaction.id,
        hostMessageId: transaction.visibleResponseRef?.hostMessageId || null,
        outcomeId: transaction.visibleResponseRef?.outcomeId || transaction.outcomeId || null,
        responseKind: transaction.visibleResponseRef?.responseKind || transaction.responseKind || null,
        status: transaction.phase,
        generationStartedAt: transaction.timing?.hostGenerationReleasedAt || transaction.visibleResponseRef?.visibleResponsePostedAt || null,
        turnTiming: cloneJson(transaction.timing || null)
      }))
      .filter((entry) => entry.responseId || entry.transactionId);
    return {
      responseLedger,
      recoveryJournal: coreRecoveryCalls.map(({ transactionId, recoveryBundle }) => {
        const transaction = coreTransactions.get(transactionId) || {};
        return {
          id: recoveryBundle.id || transaction.recoveryCaseId || `recovery:${transactionId}`,
          transactionId,
          status: transaction.recoveryCaseId ? 'required' : 'resolved',
          phase: transaction.phase || null,
          reason: recoveryBundle.reason || null,
          repairDecision: cloneJson(recoveryBundle.repairDecision || null),
          dependentOutcomeId: recoveryBundle.dependentOutcomeId || null,
          dependentResponseId: recoveryBundle.dependentResponseId || null,
          allowedActions: cloneJson(recoveryBundle.allowedActions || [])
        };
      })
    };
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
      if (roleId === 'sceneHandshakeSettler' || roleId === 'sourceSettlementLatestPair') {
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
  entry.roleId === 'sourceSettlementLatestPair'
  && entry.request.metadata.previousAssistantHostMessageId === 'assistant-host-handshake'
));
assert(handshakeRequest, 'Scene Handshake request should be captured for the selected-swipe acceptance test.');
assert.equal(
  responseSwipeGenerationCalls.some((entry) => (
    entry.roleId === 'sceneHandshakeSettler'
    && entry.request.metadata?.previousAssistantHostMessageId === 'assistant-host-handshake'
  )),
  false,
  'Production default Scene Handshake latest-pair settlement must not call the legacy role.'
);
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

chat.pushAssistantMessage({
  hostMessageId: 'assistant-terminal-sre-handshake',
  text: 'Whitaker gives Sam one concrete next step: brief Commander Cross before lunch about the command-network handoff.'
});
const terminalSreProviderCalls = [];
const terminalSreLegacyCalls = [];
const terminalSrePromptFramesBefore = promptFrames.length;
const terminalSreOrchestrator = createChatTurnOrchestrator({
  host: { chat, prompt },
  classify: ({ text, context }) => classifyChatTurn({ text, context }),
  responseDispatcher,
  generationRouter: {
    async generate(roleId, request) {
      terminalSreLegacyCalls.push({ roleId, request: cloneJson(request) });
      if (roleId === 'sceneHandshakeSettler') {
        throw new Error('terminal SRE latest-pair settlement must replace legacy Scene Handshake provider in orchestrator path');
      }
      return {
        ok: true,
        response: {
          providerId: 'fake-terminal-sre-unexpected-provider',
          text: '{}'
        },
        diagnostics: { providerId: 'fake-terminal-sre-unexpected-provider' }
      };
    }
  },
  runLatestPairSettlementProvider: async (payload) => {
    terminalSreProviderCalls.push(cloneJson(payload));
    return {
      settlement: {
        acceptedPreviousResponse: true,
        playerReplyRelation: 'acts-on',
        confidence: 0.9,
        disposition: 'autoCommit'
      },
      operations: [{
        op: 'upsert',
        path: 'commandLog.entries',
        identityKey: 'id',
        value: {
          id: 'command-log:terminal-sre-orchestrator',
          type: 'scene',
          summaryInputs: ['Whitaker assigned Sam to brief Cross before lunch.'],
          visibleConsequences: ['Sam accepted the Cross briefing as the next concrete command step.']
        }
      }]
    };
  },
  stateDeltaGateway,
  coreTurnStore,
  getCampaignState,
  setCampaignState,
  persistCampaignState,
  syncPromptContext: async (state, promptFrame = null, options = {}) => {
    promptFrames.push(cloneJson(promptFrame || null));
    return {
      ...cloneJson(state),
      campaignChatBinding: {
        ...state.campaignChatBinding,
        promptContextRevision: (state.campaignChatBinding?.promptContextRevision || 0) + 1
      }
    };
  },
  previewDirectorTurn: async () => {
    throw new Error('terminal SRE orchestrator fixture must stay on Scene Handshake path');
  },
  commitProvisionalDirectorTurn: async () => {
    throw new Error('terminal SRE orchestrator fixture must not commit a Director turn');
  },
  discardProvisionalDirectorTurn: async () => {},
  now
});
const terminalSreActivity = [];
const terminalSreMessage = chat.pushPlayerMessage({
  text: '*Sam accepts Whitaker\'s priority and says he will brief Cross before lunch.*',
  hostMessageId: 'player-terminal-sre-handshake'
});
const terminalSre = await terminalSreOrchestrator.observePlayerMessage({
  chatId: 'campaign-chat',
  message: terminalSreMessage,
  turnActivityReporter: (event) => terminalSreActivity.push(cloneJson(event))
});
assert.equal(terminalSre.handled, true);
assert.equal(terminalSreProviderCalls.length, 1);
assert.equal(terminalSreLegacyCalls.some((entry) => entry.roleId === 'sceneHandshakeSettler'), false);
assert.equal(campaignState.commandLog.entries.some((entry) => entry.id === 'command-log:terminal-sre-orchestrator'), true);
assert.equal(campaignState.runtimeTracking.sceneHandshake.lastResult.metadata?.sourceOwner, 'sre');
assert.ok(terminalSreActivity.some((event) => event.phase === 'sceneHandshakeSettled'));
assert.equal(promptFrames.length > terminalSrePromptFramesBefore, true);

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

chat.pushAssistantMessage({
  hostMessageId: 'assistant-production-default-sre-handshake',
  text: 'Whitaker notes that the bridge watch is ready and leaves the next answer to Sam.'
});
const productionDefaultLatestPairSreProviderReplacesLegacySceneHandshake = {
  roleCalls: [],
  promptFramesBefore: promptFrames.length,
  commandLogBefore: campaignState.commandLog.entries.length,
  elapsedMinutesBefore: campaignState.worldState?.elapsedMinutes ?? 0,
  timeLedgerBefore: campaignState.timeLedger?.entries?.length || 0,
  sceneHandshakeSettledBefore: campaignState.runtimeTracking.sceneHandshake.settled.length
};
const productionDefaultOrchestrator = createChatTurnOrchestrator({
  host: { chat, prompt },
  classify: ({ text, context }) => classifyChatTurn({ text, context }),
  responseDispatcher,
  generationRouter: {
    async generate(roleId, request) {
      productionDefaultLatestPairSreProviderReplacesLegacySceneHandshake.roleCalls.push({
        roleId,
        request: cloneJson(request)
      });
      if (roleId === 'sceneHandshakeSettler') {
        throw new Error('production-default latest-pair SRE provider must replace legacy Scene Handshake provider');
      }
      assert.equal(roleId, 'sourceSettlementLatestPair');
      return {
        ok: true,
        response: {
          providerId: 'fake-source-settlement-latest-pair',
          text: JSON.stringify({
            kind: 'directive.sceneHandshakeSettlement.v1',
            acceptedPreviousResponse: true,
            playerReplyRelation: 'acts-on',
            confidence: 0.9,
            disposition: 'autoCommit',
            needsInternalReview: false,
            internalReviewReasons: [],
            deferReason: null,
            operatorRecoveryOnly: false,
            openAssignmentProposals: [],
            commandLogProposals: [
              {
                summaryInputs: ['Whitaker left the bridge watch answer to Sam.'],
                visibleConsequences: ['Sam accepted the bridge watch as ready after five minutes of review.']
              }
            ],
            shipReadinessProposals: [],
            threadSignals: []
          })
        },
        diagnostics: { providerId: 'fake-source-settlement-latest-pair' }
      };
    }
  },
  stateDeltaGateway,
  coreTurnStore,
  getCampaignState,
  setCampaignState,
  persistCampaignState,
  getPackageData: () => packageData,
  syncPromptContext: async (state, promptFrame = null) => {
    promptFrames.push(cloneJson(promptFrame || null));
    return {
      ...cloneJson(state),
      campaignChatBinding: {
        ...state.campaignChatBinding,
        promptContextRevision: (state.campaignChatBinding?.promptContextRevision || 0) + 1
      }
    };
  },
  previewDirectorTurn: async () => {
    throw new Error('production-default latest-pair fixture must stay on Scene Handshake path');
  },
  commitProvisionalDirectorTurn: async () => {
    throw new Error('production-default latest-pair fixture must not commit a Director turn');
  },
  discardProvisionalDirectorTurn: async () => {},
  now
});
const productionDefaultActivity = [];
const productionDefaultMessage = chat.pushPlayerMessage({
  text: '*Sam spends 5 minutes reviewing the bridge watch, then accepts that Whitaker left the next answer to him.*',
  hostMessageId: 'player-production-default-sre-handshake'
});
const productionDefaultSre = await productionDefaultOrchestrator.observePlayerMessage({
  chatId: 'campaign-chat',
  message: productionDefaultMessage,
  turnActivityReporter: (event) => productionDefaultActivity.push(cloneJson(event))
});
assert.equal(productionDefaultSre.handled, true);
assert.equal(
  productionDefaultLatestPairSreProviderReplacesLegacySceneHandshake.roleCalls.filter((entry) => entry.roleId === 'sourceSettlementLatestPair').length,
  1
);
assert.equal(
  productionDefaultLatestPairSreProviderReplacesLegacySceneHandshake.roleCalls.some((entry) => entry.roleId === 'sceneHandshakeSettler'),
  false
);
assert.equal(
  campaignState.commandLog.entries.filter((entry) => (
    entry.type === 'sceneHandshake'
    && entry.visibleConsequences?.includes('Sam accepted the bridge watch as ready after five minutes of review.')
  )).length,
  1
);
assert.equal(campaignState.commandLog.entries.length, productionDefaultLatestPairSreProviderReplacesLegacySceneHandshake.commandLogBefore + 1);
assert.equal(campaignState.runtimeTracking.sceneHandshake.settled.length, productionDefaultLatestPairSreProviderReplacesLegacySceneHandshake.sceneHandshakeSettledBefore + 1);
assert.equal(campaignState.runtimeTracking.sceneHandshake.lastResult.metadata?.sourceOwner, 'sre');
assert.equal(campaignState.runtimeTracking.sceneHandshake.lastResult.metadata?.sourceSettlementMode, 'latestPair');
assert.equal(campaignState.runtimeTracking.sceneHandshake.lastResult.operationCount, 1);
assert.equal(campaignState.runtimeTracking.sceneHandshake.lastResult.modelRoleId, 'sourceSettlementLatestPair');
assert.equal(campaignState.worldState.elapsedMinutes, productionDefaultLatestPairSreProviderReplacesLegacySceneHandshake.elapsedMinutesBefore + 5);
assert.equal(campaignState.timeLedger.entries.length, productionDefaultLatestPairSreProviderReplacesLegacySceneHandshake.timeLedgerBefore + 1);
assert.equal(campaignState.timeLedger.entries.at(-1).sourceAnchorRange.currentPlayerHostMessageId, 'player-production-default-sre-handshake');
assert.ok(productionDefaultActivity.some((event) => event.phase === 'sceneHandshakeSettled'));
assert.equal(promptFrames.length > productionDefaultLatestPairSreProviderReplacesLegacySceneHandshake.promptFramesBefore, true);
assert.equal(
  JSON.stringify(coreDiagnosticCalls.at(-1)).includes('Sam spends 5 minutes'),
  false,
  'SRE diagnostics must not persist raw player text.'
);

chat.pushAssistantMessage({
  hostMessageId: 'assistant-production-default-sre-prompt-sync-fails',
  text: 'Whitaker gives Sam a bridge-watch source that needs settlement before the prompt install fails.'
});
const promptSyncFailureRestoreCalls = [];
const promptSyncFailureCoreRecoveryBefore = coreRecoveryCalls.length;
const promptSyncFailureCommandLogBefore = campaignState.commandLog.entries.length;
const promptSyncFailureGateway = {
  ...stateDeltaGateway,
  async restore(revision, options = {}) {
    promptSyncFailureRestoreCalls.push({ revision, options: cloneJson(options) });
    return cloneJson(getCampaignState());
  }
};
const promptSyncFailureOrchestrator = createChatTurnOrchestrator({
  host: { chat, prompt },
  classify: () => {
    throw new Error('Prompt-sync failure fixture must not classify after Scene Handshake prompt failure.');
  },
  responseDispatcher,
  generationRouter: {
    async generate(roleId, request) {
      if (roleId === 'sceneHandshakeSettler') {
        throw new Error('prompt-sync failure default SRE path must not call legacy Scene Handshake role');
      }
      assert.equal(roleId, 'sourceSettlementLatestPair');
      return {
        ok: true,
        response: {
          providerId: 'fake-source-settlement-prompt-sync-failure',
          text: JSON.stringify({
            kind: 'directive.sceneHandshakeSettlement.v1',
            acceptedPreviousResponse: true,
            playerReplyRelation: 'acts-on',
            confidence: 0.9,
            disposition: 'autoCommit',
            needsInternalReview: false,
            internalReviewReasons: [],
            deferReason: null,
            operatorRecoveryOnly: false,
            openAssignmentProposals: [],
            commandLogProposals: [
              {
                summaryInputs: ['Prompt-sync failure settlement should enter recovery instead of old restore.'],
                visibleConsequences: ['Sam accepted the bridge-watch settlement before prompt synchronization failed.']
              }
            ],
            shipReadinessProposals: [],
            threadSignals: []
          })
        },
        diagnostics: { providerId: 'fake-source-settlement-prompt-sync-failure' }
      };
    }
  },
  stateDeltaGateway: promptSyncFailureGateway,
  coreTurnStore,
  getCampaignState,
  setCampaignState,
  persistCampaignState,
  getPackageData: () => packageData,
  syncPromptContext: async () => {
    const error = new Error('Synthetic Scene Handshake prompt synchronization failure.');
    error.code = 'DIRECTIVE_TEST_SCENE_HANDSHAKE_PROMPT_SYNC_FAILED';
    throw error;
  },
  previewDirectorTurn: async () => {
    throw new Error('Prompt-sync failure fixture must not preview a Director turn.');
  },
  commitProvisionalDirectorTurn: async () => {
    throw new Error('Prompt-sync failure fixture must not commit a Director turn.');
  },
  discardProvisionalDirectorTurn: async () => {},
  now
});
const promptSyncFailureActivity = [];
const promptSyncFailureMessage = chat.pushPlayerMessage({
  text: '*Sam accepts Whitaker\'s bridge-watch source before the prompt install fails.*',
  hostMessageId: 'player-production-default-sre-prompt-sync-fails'
});
const promptSyncFailure = await promptSyncFailureOrchestrator.observePlayerMessage({
  chatId: 'campaign-chat',
  message: promptSyncFailureMessage,
  turnActivityReporter: (event) => promptSyncFailureActivity.push(cloneJson(event))
});
assert.equal(promptSyncFailure.handled, true);
assert.equal(promptSyncFailure.recoveryRequired, true);
assert.equal(promptSyncFailure.error.code, 'DIRECTIVE_TEST_SCENE_HANDSHAKE_PROMPT_SYNC_FAILED');
assert.equal(promptSyncFailureRestoreCalls.length, 0, 'Scene Handshake prompt-sync failure must not use old revision restore.');
const promptSyncFailureIngress = campaignState.runtimeTracking.ingressLedger.find((entry) => entry.hostMessageId === 'player-production-default-sre-prompt-sync-fails');
assert.equal(promptSyncFailureIngress.status, 'recoveryRequired');
assert.equal(promptSyncFailureIngress.error.code, 'DIRECTIVE_TEST_SCENE_HANDSHAKE_PROMPT_SYNC_FAILED');
assert.equal(promptSyncFailureIngress.coreRecovery.reason, 'chatTurnProcessingFailure');
assert.equal(
  coreRecoveryCalls.slice(promptSyncFailureCoreRecoveryBefore).some((entry) => (
    entry.transactionId === promptSyncFailureIngress.coreTransactionId
    && entry.recoveryBundle.reason === 'chatTurnProcessingFailure'
    && entry.recoveryBundle.repairDecision?.stage === 'sceneHandshake'
    && entry.recoveryBundle.repairDecision?.normalTurnAllowed === false
  )),
  true,
  'Scene Handshake prompt-sync failure should enter CORE/REPAIR turn-processing recovery.'
);
assert.equal(
  campaignState.runtimeTracking.recoveryJournal.some((entry) => (
    entry.ingressId === promptSyncFailureIngress.id
    && entry.type === 'chatTurnProcessingFailure'
    && entry.details?.stage === 'sceneHandshake'
    && entry.details?.coreRecovery?.reason === 'chatTurnProcessingFailure'
  )),
  false,
  'CORE-backed Scene Handshake prompt-sync failure must not write old recoveryJournal rows.'
);
assert.equal(campaignState.commandLog.entries.length, promptSyncFailureCommandLogBefore + 1);
assert.ok(promptSyncFailureActivity.some((event) => event.phase === 'recovery' && event.mode === 'review'));

chat.pushAssistantMessage({
  hostMessageId: 'assistant-production-default-sre-no-apply-owner',
  text: 'Whitaker gives Sam a clean bridge-watch source that needs a latest-pair settlement.'
});
const {
  applyOperations: omittedApplyOperationsForLatestPair,
  ...stateDeltaGatewayWithoutApplyOperations
} = stateDeltaGateway;
assert.equal(typeof omittedApplyOperationsForLatestPair, 'function');
const noApplyLatestPairCalls = [];
const noApplyCommandLogBefore = campaignState.commandLog.entries.length;
const noApplySettledBefore = campaignState.runtimeTracking.sceneHandshake.settled.length;
const noApplyDiagnosticsBefore = coreDiagnosticCalls.length;
const noApplyLatestPairOrchestrator = createChatTurnOrchestrator({
  host: { chat, prompt },
  classify: ({ text, context }) => classifyChatTurn({ text, context }),
  responseDispatcher,
  generationRouter: {
    async generate(roleId, request) {
      noApplyLatestPairCalls.push({ roleId, request: cloneJson(request) });
      if (roleId === 'sceneHandshakeSettler') {
        throw new Error('missing-apply-owner default SRE path must not call legacy Scene Handshake role');
      }
      assert.equal(roleId, 'sourceSettlementLatestPair');
      return {
        ok: true,
        response: {
          providerId: 'fake-source-settlement-no-apply-owner',
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
            openAssignmentProposals: [],
            commandLogProposals: [
              {
                summaryInputs: ['No-apply owner settlement must not mutate command log.'],
                visibleConsequences: ['This command log entry must never commit without an apply owner.']
              }
            ],
            shipReadinessProposals: [],
            threadSignals: []
          })
        },
        diagnostics: { providerId: 'fake-source-settlement-no-apply-owner' }
      };
    }
  },
  stateDeltaGateway: stateDeltaGatewayWithoutApplyOperations,
  coreTurnStore,
  getCampaignState,
  setCampaignState,
  persistCampaignState,
  getPackageData: () => packageData,
  syncPromptContext: async () => {
    throw new Error('Missing apply owner must fail closed before prompt sync.');
  },
  previewDirectorTurn: async () => {
    throw new Error('Missing apply owner fixture must stay on Scene Handshake path.');
  },
  commitProvisionalDirectorTurn: async () => {
    throw new Error('Missing apply owner fixture must not commit Director mechanics.');
  },
  discardProvisionalDirectorTurn: async () => {},
  now
});
const noApplyActivity = [];
const noApplyMessage = chat.pushPlayerMessage({
  text: '*Sam accepts the clean bridge-watch source without changing the command log directly.*',
  hostMessageId: 'player-production-default-sre-no-apply-owner'
});
const noApplyResult = await noApplyLatestPairOrchestrator.observePlayerMessage({
  chatId: 'campaign-chat',
  message: noApplyMessage,
  turnActivityReporter: (event) => noApplyActivity.push(cloneJson(event))
});
assert.equal(noApplyResult.handled, true);
assert.equal(noApplyLatestPairCalls.filter((entry) => entry.roleId === 'sourceSettlementLatestPair').length, 1);
assert.equal(noApplyLatestPairCalls.some((entry) => entry.roleId === 'sceneHandshakeSettler'), false);
assert.equal(campaignState.commandLog.entries.length, noApplyCommandLogBefore);
assert.equal(campaignState.runtimeTracking.sceneHandshake.settled.length, noApplySettledBefore);
const noApplySettlementActivity = noApplyActivity.find((event) => event.phase === 'sceneHandshakeSettled');
assert.equal(noApplySettlementActivity?.disposition, 'repairRequired');
assert.equal(noApplySettlementActivity?.reasons?.includes('source-settlement-apply-owner-missing'), true);
const noApplyDiagnostic = coreDiagnosticCalls.slice(noApplyDiagnosticsBefore).find((entry) => (
  entry.diagnostic?.type === 'sourceSettlement'
  && entry.diagnostic?.status === 'repairRequired'
));
assert(noApplyDiagnostic, 'Missing apply owner should leave an SRE repairRequired diagnostic.');
assert.equal(noApplyDiagnostic.diagnostic.decision.providerCalled, true);
assert.equal(noApplyDiagnostic.diagnostic.decision.applied, false);
assert.equal(noApplyDiagnostic.diagnostic.decision.reasons.includes('source-settlement-apply-owner-missing'), true);

chat.pushAssistantMessage({
  hostMessageId: 'assistant-production-default-sre-provider-throw',
  text: 'Whitaker gives Sam a clean source before the latest-pair provider throws.'
});
const rawProviderThrowCanary = 'RAW_LATEST_PAIR_PROVIDER_THROW_CANARY';
const providerThrowLatestPairCalls = [];
const providerThrowDiagnosticsBefore = coreDiagnosticCalls.length;
const providerThrowCommandLogBefore = campaignState.commandLog.entries.length;
const providerThrowOrchestrator = createChatTurnOrchestrator({
  host: { chat, prompt },
  classify: ({ text, context }) => classifyChatTurn({ text, context }),
  responseDispatcher,
  generationRouter: {
    async generate(roleId, request) {
      providerThrowLatestPairCalls.push({ roleId, request: cloneJson(request) });
      if (roleId === 'sceneHandshakeSettler') {
        throw new Error('provider-throw default SRE path must not call legacy Scene Handshake role');
      }
      assert.equal(roleId, 'sourceSettlementLatestPair');
      throw new Error(`${rawProviderThrowCanary}: ${request.prompt}`);
    }
  },
  stateDeltaGateway,
  coreTurnStore,
  getCampaignState,
  setCampaignState,
  persistCampaignState,
  getPackageData: () => packageData,
  syncPromptContext: async () => {
    throw new Error('Provider throw must fail closed before prompt sync.');
  },
  previewDirectorTurn: async () => {
    throw new Error('Provider throw fixture must stay on Scene Handshake path.');
  },
  commitProvisionalDirectorTurn: async () => {
    throw new Error('Provider throw fixture must not commit Director mechanics.');
  },
  discardProvisionalDirectorTurn: async () => {},
  now
});
const providerThrowActivity = [];
const providerThrowMessage = chat.pushPlayerMessage({
  text: '*Sam accepts the clean source before the latest-pair provider throws.*',
  hostMessageId: 'player-production-default-sre-provider-throw'
});
const providerThrowResult = await providerThrowOrchestrator.observePlayerMessage({
  chatId: 'campaign-chat',
  message: providerThrowMessage,
  turnActivityReporter: (event) => providerThrowActivity.push(cloneJson(event))
});
assert.equal(providerThrowResult.handled, true);
assert.equal(providerThrowLatestPairCalls.filter((entry) => entry.roleId === 'sourceSettlementLatestPair').length, 1);
assert.equal(providerThrowLatestPairCalls.some((entry) => entry.roleId === 'sceneHandshakeSettler'), false);
assert.equal(campaignState.commandLog.entries.length, providerThrowCommandLogBefore);
const providerThrowSettlementActivity = providerThrowActivity.find((event) => event.phase === 'sceneHandshakeSettled');
assert.equal(providerThrowSettlementActivity?.disposition, 'repairRequired');
assert.equal(providerThrowSettlementActivity?.reasons?.includes('source-settlement-provider-threw'), true);
const providerThrowDiagnostic = coreDiagnosticCalls.slice(providerThrowDiagnosticsBefore).find((entry) => (
  entry.diagnostic?.type === 'sourceSettlement'
  && entry.diagnostic?.status === 'repairRequired'
));
assert(providerThrowDiagnostic, 'Provider throw should leave an SRE repairRequired diagnostic.');
assert.equal(providerThrowDiagnostic.diagnostic.decision.providerCalled, true);
assert.equal(providerThrowDiagnostic.diagnostic.decision.applied, false);
assert.equal(providerThrowDiagnostic.diagnostic.decision.reasons.includes('source-settlement-provider-threw'), true);
assert.equal(JSON.stringify(providerThrowResult).includes(rawProviderThrowCanary), false);
assert.equal(JSON.stringify(providerThrowActivity).includes(rawProviderThrowCanary), false);
assert.equal(JSON.stringify(providerThrowDiagnostic).includes(rawProviderThrowCanary), false);
assert.equal(JSON.stringify(campaignState).includes(rawProviderThrowCanary), false);

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

chat.pushAssistantMessage({
  hostMessageId: 'assistant-host-handshake-trimmed',
  text: 'Selected source with harmless trailing whitespace.',
  swipes: [
    'Selected source with harmless trailing whitespace.   '
  ]
});
const trimActivity = [];
const trimHandshake = await send(
  '*Sam accepts the selected source with a quiet nod.*',
  'player-scene-handshake-trimmed',
  { activityReporter: (event) => trimActivity.push(cloneJson(event)) }
);
assert.equal(trimHandshake.handled, true);
const trimPreflight = trimActivity.find((event) => event.phase === 'sreSceneHandshakePreflight');
assert(trimPreflight, 'Scene Handshake should preflight harmless selected-swipe whitespace.');
assert.equal(trimPreflight.status, 'preflightClean');
assert.equal(trimActivity.some((event) => event.phase === 'sceneHandshakeSourceBlocked'), false);

chat.pushAssistantMessage({
  hostMessageId: 'assistant-host-handshake-hash-drift',
  text: 'Stable selected source text.',
  swipes: ['Stable selected source text.']
});
const originalBeginTurn = coreTurnStore.beginTurn;
coreTurnStore.beginTurn = async (sourceFrame, options = {}) => {
  if (String(options.ingressId || '').includes('player-scene-handshake-hash-drift')) {
    sourceFrame.selectedAssistantVariantHash = 'stale-selected-hash';
  }
  return originalBeginTurn.call(coreTurnStore, sourceFrame, options);
};
const hashDriftCallsBefore = responseSwipeGenerationCalls.length;
const hashDriftActivity = [];
const hashDriftHandshake = await send(
  '*Sam accepts the selected source before the hash drift check completes.*',
  'player-scene-handshake-hash-drift',
  { activityReporter: (event) => hashDriftActivity.push(cloneJson(event)) }
);
coreTurnStore.beginTurn = originalBeginTurn;
assert.equal(hashDriftHandshake.handled, true);
const hashDriftPreflight = hashDriftActivity.find((event) => event.phase === 'sreSceneHandshakePreflight');
assert(hashDriftPreflight, 'Scene Handshake should preflight freshly observed selected-swipe hash.');
assert.equal(hashDriftPreflight.status, 'hardSkipped');
assert.equal(hashDriftPreflight.reasons.includes('selected-variant-hash-mismatch'), true);
assert.equal(
  responseSwipeGenerationCalls
    .slice(hashDriftCallsBefore)
    .some((entry) => ['sceneHandshakeSettler', 'sourceSettlementLatestPair'].includes(entry.roleId) && entry.request.metadata?.previousAssistantHostMessageId === 'assistant-host-handshake-hash-drift'),
  false,
  'Fresh selected-swipe hash mismatch must stop before Scene Handshake provider call.'
);

chat.pushAssistantMessage({
  hostMessageId: 'assistant-host-handshake-mismatch',
  text: 'Visible assistant text diverged from the selected native swipe.',
  swipes: [
    'Selected native swipe with different accepted source text.',
    'Another unselected draft.'
  ]
});
chat.pushAssistantMessage({
  hostMessageId: 'system-row-before-mismatch',
  text: 'System rows must not become the latest-pair previous assistant.',
  isSystem: true
});
const mismatchSceneHandshakeCallsBefore = responseSwipeGenerationCalls.length;
const mismatchSettledBefore = campaignState.runtimeTracking.sceneHandshake.settled.length;
const mismatchCommandLogBefore = campaignState.commandLog.entries.length;
const mismatchActivity = [];
const mismatchHandshake = await send(
  '*Sam starts to accept the mismatched assistant source, then pauses.*',
  'player-scene-handshake-mismatch',
  { activityReporter: (event) => mismatchActivity.push(cloneJson(event)) }
);
assert.equal(mismatchHandshake.handled, true);
const mismatchPreflight = mismatchActivity.find((event) => event.phase === 'sreSceneHandshakePreflight');
assert(mismatchPreflight, 'Scene Handshake must ask SRE before provider work for latest-pair source integrity.');
assert.equal(mismatchPreflight.status, 'hardSkipped');
assert.equal(mismatchPreflight.providerCalled, false);
assert.equal(mismatchPreflight.applied, false);
assert.equal(mismatchActivity.some((event) => event.phase === 'sceneHandshakeSourceBlocked'), true);
assert.equal(
  responseSwipeGenerationCalls
    .slice(mismatchSceneHandshakeCallsBefore)
    .some((entry) => ['sceneHandshakeSettler', 'sourceSettlementLatestPair'].includes(entry.roleId) && entry.request.metadata?.previousAssistantHostMessageId === 'assistant-host-handshake-mismatch'),
  false,
  'SRE hardSkipped latest-pair source must stop before Scene Handshake provider call.'
);
assert.equal(campaignState.runtimeTracking.sceneHandshake.settled.length, mismatchSettledBefore);
assert.equal(campaignState.commandLog.entries.length, mismatchCommandLogBefore);
assert.equal(JSON.stringify(mismatchPreflight).includes('Visible assistant text diverged'), false);

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

const ingressCountBeforeMissingCoreWriter = campaignState.runtimeTracking.ingressLedger.length;
const persistedCountBeforeMissingCoreWriter = persisted.length;
const missingCoreWriterOrchestrator = createChatTurnOrchestrator({
  host: { chat, prompt },
  classify: async () => {
    throw new Error('Missing CORE ingress writer fixture must not classify.');
  },
  responseDispatcher,
  stateDeltaGateway,
  getCampaignState,
  setCampaignState,
  persistCampaignState,
  syncPromptContext: async (state) => state,
  previewDirectorTurn: async () => {
    throw new Error('Missing CORE ingress writer fixture must not preview a Director turn.');
  },
  commitProvisionalDirectorTurn: async () => {
    throw new Error('Missing CORE ingress writer fixture must not commit a Director turn.');
  },
  discardProvisionalDirectorTurn: async () => {},
  now
});
const missingCoreWriterMessage = chat.pushPlayerMessage({
  text: '*Sam waits for CORE ingress ownership before moving the turn forward.*',
  hostMessageId: 'player-core-ingress-writer-missing'
});
await assert.rejects(
  () => missingCoreWriterOrchestrator.observePlayerMessage({
    chatId: 'campaign-chat',
    message: missingCoreWriterMessage
  }),
  /CORE turn source observation is required/
);
assert.equal(campaignState.runtimeTracking.ingressLedger.length, ingressCountBeforeMissingCoreWriter);
assert.equal(
  campaignState.runtimeTracking.ingressLedger.some((entry) => entry.hostMessageId === 'player-core-ingress-writer-missing'),
  false,
  'Missing CORE ingress writer must not create a quarantined old-ledger ingress.'
);
assert.equal(persisted.length, persistedCountBeforeMissingCoreWriter, 'Missing CORE ingress writer must not persist campaign state.');

const ingressCountBeforeNullCoreTransaction = campaignState.runtimeTracking.ingressLedger.length;
const persistedCountBeforeNullCoreTransaction = persisted.length;
const nullCoreTransactionOrchestrator = createChatTurnOrchestrator({
  host: { chat, prompt },
  classify: async () => {
    throw new Error('Null CORE transaction fixture must not classify.');
  },
  responseDispatcher,
  stateDeltaGateway,
  coreTurnStore: {
    async beginTurn() {
      return null;
    }
  },
  getCampaignState,
  setCampaignState,
  persistCampaignState,
  syncPromptContext: async (state) => state,
  previewDirectorTurn: async () => {
    throw new Error('Null CORE transaction fixture must not preview a Director turn.');
  },
  commitProvisionalDirectorTurn: async () => {
    throw new Error('Null CORE transaction fixture must not commit a Director turn.');
  },
  discardProvisionalDirectorTurn: async () => {},
  now
});
const nullCoreTransactionMessage = chat.pushPlayerMessage({
  text: '*Sam waits for a concrete CORE transaction id before continuing.*',
  hostMessageId: 'player-core-ingress-transaction-missing'
});
await assert.rejects(
  () => nullCoreTransactionOrchestrator.observePlayerMessage({
    chatId: 'campaign-chat',
    message: nullCoreTransactionMessage
  }),
  /did not return a transaction id/
);
assert.equal(campaignState.runtimeTracking.ingressLedger.length, ingressCountBeforeNullCoreTransaction);
assert.equal(
  campaignState.runtimeTracking.ingressLedger.some((entry) => entry.hostMessageId === 'player-core-ingress-transaction-missing'),
  false,
  'Missing CORE transaction id must not create a quarantined old-ledger ingress.'
);
assert.equal(persisted.length, persistedCountBeforeNullCoreTransaction, 'Missing CORE transaction id must not persist campaign state.');

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

const coreBackedPostFailureBaselineState = cloneJson(campaignState);
const coreBackedPostFailurePersistedBefore = persisted.length;
const coreBackedPostFailureTransactions = new Map();
const coreBackedPostFailureRecoveries = [];
const coreBackedPostFailureDispatches = [];
let coreBackedPostFailureDispatchMode = 'fail';
const coreBackedPostFailureCoreStore = {
  async beginTurn(sourceFrame, options = {}) {
    const transaction = {
      id: options.transactionId || `txn:${sourceFrame.id}`,
      phase: 'observed',
      sourceFrameId: sourceFrame.id
    };
    coreBackedPostFailureTransactions.set(transaction.id, cloneJson(transaction));
    return cloneJson(transaction);
  },
  async advanceTurn(transactionId, phasePatch = {}) {
    const transaction = {
      ...(coreBackedPostFailureTransactions.get(transactionId) || { id: transactionId }),
      phase: phasePatch.phase || 'observed',
      route: phasePatch.route || null
    };
    coreBackedPostFailureTransactions.set(transactionId, cloneJson(transaction));
    return cloneJson(transaction);
  },
  async markRecoveryRequired(transactionId, recoveryBundle = {}) {
    coreBackedPostFailureRecoveries.push({ transactionId, recoveryBundle: cloneJson(recoveryBundle) });
    const recoveryCase = {
      id: recoveryBundle.id || `recovery:${transactionId}`,
      phase: recoveryBundle.phaseAfter || 'recoveryRequired',
      reason: recoveryBundle.reason || null
    };
    coreBackedPostFailureTransactions.set(transactionId, {
      ...(coreBackedPostFailureTransactions.get(transactionId) || { id: transactionId }),
      phase: recoveryCase.phase,
      recoveryCaseId: recoveryCase.id
    });
    return cloneJson(recoveryCase);
  },
  async getTransaction(transactionId) {
    return cloneJson(coreBackedPostFailureTransactions.get(transactionId) || null);
  },
  readProjections() {
    return {
      recoveryJournal: coreBackedPostFailureRecoveries.map(({ transactionId, recoveryBundle }) => ({
        id: recoveryBundle.id || `recovery:${transactionId}`,
        transactionId,
        status: coreBackedPostFailureTransactions.get(transactionId)?.recoveryCaseId ? 'required' : 'resolved',
        phase: coreBackedPostFailureTransactions.get(transactionId)?.phase || null,
        reason: recoveryBundle.reason || null,
        repairDecision: cloneJson(recoveryBundle.repairDecision || null),
        responseRetryPlan: cloneJson(recoveryBundle.responseRetryPlan || null),
        dependentOutcomeId: recoveryBundle.dependentOutcomeId || null,
        dependentResponseId: recoveryBundle.dependentResponseId || null,
        allowedActions: cloneJson(recoveryBundle.allowedActions || [])
      }))
    };
  }
};
const coreBackedPostFailureOrchestrator = createChatTurnOrchestrator({
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
    reasons: ['Fixture should reach Directive response dispatch with CORE recovery.'],
    workerPlan: {},
    responseStrategy: 'directivePosted',
    source: 'utility-provider'
  }),
  responseDispatcher: {
    async dispatch(payload = {}) {
      coreBackedPostFailureDispatches.push(cloneJson({
        strategy: payload.strategy,
        text: payload.text,
        responseKind: payload.responseKind,
        metadata: payload.metadata
      }));
      if (coreBackedPostFailureDispatchMode === 'retry') {
        const response = {
          id: 'response-core-backed-post-failure-retry',
          hostMessageId: 'assistant-core-backed-post-failure-retry',
          text: payload.text,
          responseKind: payload.responseKind
        };
        return {
          campaignState: recordDirectiveResponse(payload.campaignState, {
            id: response.id,
            ingressId: payload.ingressId,
            hostMessageId: response.hostMessageId,
            coreTransactionId: 'txn-response-core-backed-post-failure-retry',
            coreProjection: {
              kind: 'directive.coreResponseProjectionRef.v1',
              responseId: response.id,
              transactionId: 'txn-response-core-backed-post-failure-retry',
              status: 'complete'
            },
            status: 'complete',
            responseKind: payload.responseKind,
            strategy: payload.strategy
          }),
          response
        };
      }
      const error = new Error('RAW_HOST_RESPONSE_POST_FAILURE_TEXT_SHOULD_NOT_PERSIST');
      error.code = 'DIRECTIVE_TEST_RESPONSE_POST_FAILED';
      throw error;
    }
  },
  stateDeltaGateway,
  coreTurnStore: coreBackedPostFailureCoreStore,
  getCampaignState,
  setCampaignState,
  persistCampaignState,
  syncPromptContext: async (state) => state,
  previewDirectorTurn: async () => {
    throw new Error('CORE-backed response post failure fixture must not preview a Director turn.');
  },
  commitProvisionalDirectorTurn: async () => {
    throw new Error('CORE-backed response post failure fixture must not commit a Director turn.');
  },
  discardProvisionalDirectorTurn: async () => {},
  sidecarScheduler: {
    schedule() {
      return Promise.resolve({ ok: true });
    }
  },
  now
});
const coreBackedPostFailureMessage = chat.pushPlayerMessage({
  text: 'I head to Engineering and wait for the hatch to answer.',
  hostMessageId: 'player-core-backed-post-failure'
});
const coreBackedPostFailureResult = await coreBackedPostFailureOrchestrator.observePlayerMessage({
  chatId: 'campaign-chat',
  message: coreBackedPostFailureMessage
});
assert.equal(coreBackedPostFailureResult.recoveryRequired, true);
const coreBackedPostFailureIngress = campaignState.runtimeTracking.ingressLedger.find(
  (entry) => entry.hostMessageId === 'player-core-backed-post-failure'
);
assert.ok(coreBackedPostFailureIngress?.coreTransactionId);
const coreBackedPostFailureRecovery = coreBackedPostFailureCoreStore.readProjections().recoveryJournal.find((entry) => (
  entry.transactionId === coreBackedPostFailureIngress.coreTransactionId
));
assert.equal(coreBackedPostFailureRecovery.repairDecision.eventType, 'hostResponsePostFailure');
assert.equal(coreBackedPostFailureRecovery.responseRetryPlan.kind, 'directive.responseRetryGenerationPlan.v1');
assert.equal(coreBackedPostFailureRecovery.responseRetryPlan.responseKind, 'locationTransition');
assert.equal(
  campaignState.runtimeTracking.recoveryJournal.some((entry) => (
    entry.type === 'hostResponsePostFailure'
    && entry.ingressId === coreBackedPostFailureIngress.id
  )),
  false,
  'CORE-backed response post failures must not write old hostResponsePostFailure rows.'
);
assert.equal(JSON.stringify(campaignState.runtimeTracking.recoveryJournal).includes('RAW_HOST_RESPONSE_POST_FAILURE_TEXT_SHOULD_NOT_PERSIST'), false);
coreBackedPostFailureDispatchMode = 'retry';
const coreBackedPostFailureRetry = await coreBackedPostFailureOrchestrator.retryCommittedResponse({
  recoveryId: coreBackedPostFailureRecovery.id
});
assert.equal(coreBackedPostFailureRetry.ok, true);
const coreBackedPostFailureRetryDispatch = coreBackedPostFailureDispatches.at(-1);
assert.equal(coreBackedPostFailureRetryDispatch.responseKind, 'locationTransition');
assert.match(coreBackedPostFailureRetryDispatch.text, /Engineering/i);
assert.match(coreBackedPostFailureRetryDispatch.text, /threshold/i);
assert.doesNotMatch(coreBackedPostFailureRetryDispatch.text, /RAW_HOST_RESPONSE_POST_FAILURE_TEXT_SHOULD_NOT_PERSIST/);
assert.equal(coreBackedPostFailureRetry.response.text, coreBackedPostFailureRetryDispatch.text);
setCampaignState(coreBackedPostFailureBaselineState);
persisted.splice(coreBackedPostFailurePersistedBefore);

const modelBackedRetryBaselineState = cloneJson(campaignState);
const modelBackedRetryPersistedBefore = persisted.length;
const modelBackedRetryIngressId = 'ingress-model-backed-response-retry';
const modelBackedRetryRecoveryId = 'recovery-model-backed-response-retry';
let modelBackedRetryState = recordTurnIngress(campaignState, {
  id: modelBackedRetryIngressId,
  hostMessageId: 'player-model-backed-response-retry',
  chatId: 'campaign-chat',
  campaignId: campaignState.campaign?.id,
  textHash: fnv1a('Give the dockmaster room to answer.'),
  textPreview: 'Give the dockmaster room to answer.',
  sourceFrameId: 'source-model-backed-response-retry',
  status: 'recoveryRequired',
  responseStrategy: 'directivePosted',
  turnId: 'turn-model-backed-response-retry',
  outcomeId: 'outcome-model-backed-response-retry',
  coreTransactionId: 'core-tx-model-backed-response-retry'
});
modelBackedRetryState.turnLedger = {
  ...(modelBackedRetryState.turnLedger || {}),
  entries: [
    ...(modelBackedRetryState.turnLedger?.entries || []),
    {
      turnId: 'turn-model-backed-response-retry',
      outcomeId: 'outcome-model-backed-response-retry',
      resultBand: 'success-with-cost',
      narrationStatus: 'pending'
    }
  ]
};
modelBackedRetryState.commandLog = {
  ...(modelBackedRetryState.commandLog || {}),
  entries: [
    ...(modelBackedRetryState.commandLog?.entries || []),
    {
      sourceOutcomeId: 'outcome-model-backed-response-retry',
      summaryInputs: ['The captain waited for the dockmaster instead of forcing the hatch.'],
      visibleConsequences: ['The dockmaster acknowledged the pause and opened a calmer channel.']
    }
  ]
};
setCampaignState(modelBackedRetryState);
const modelBackedRetryGenerations = [];
const modelBackedRetryDispatches = [];
const modelBackedRetryCoreStore = {
  async getTransaction(transactionId) {
    return transactionId === 'core-tx-model-backed-response-retry'
      ? { id: transactionId, phase: 'recoveryRequired' }
      : null;
  },
  readProjections() {
    return {
      recoveryJournal: [{
        id: modelBackedRetryRecoveryId,
        transactionId: 'core-tx-model-backed-response-retry',
        status: 'required',
        phase: 'recoveryRequired',
        reason: 'hostResponsePostFailure',
        dependentOutcomeId: 'outcome-model-backed-response-retry',
        repairDecision: {
          kind: 'directive.repairResponseRetryActuationDecision.v1',
          authorized: true,
          eventType: 'hostResponsePostFailure',
          action: 'retryResponse',
          transactionId: 'core-tx-model-backed-response-retry',
          ingressId: modelBackedRetryIngressId,
          outcomeId: 'outcome-model-backed-response-retry',
          turnId: 'turn-model-backed-response-retry'
        },
        responseRetryPlan: {
          kind: 'directive.responseRetryGenerationPlan.v1',
          schemaVersion: 1,
          strategy: 'directivePosted',
          responseKind: 'committedOutcome',
          classification: 'consequentialCommand',
          modelBacked: {
            role: 'narration',
            mechanics: 'alreadyCommitted',
            rerunMechanics: false
          }
        }
      }]
    };
  }
};
const modelBackedRetryOrchestrator = createChatTurnOrchestrator({
  host: { chat, prompt },
  classify: async () => {
    throw new Error('Model-backed retry fixture must not classify or rerun mechanics.');
  },
  generationRouter: {
    async generate(role, request) {
      modelBackedRetryGenerations.push(cloneJson({ role, request }));
      return {
        ok: true,
        response: {
          text: 'The dockmaster answers with a careful breath, and the same committed choice settles into the room without changing course.'
        }
      };
    }
  },
  responseDispatcher: {
    async dispatch(payload = {}) {
      modelBackedRetryDispatches.push(cloneJson(payload));
      return {
        campaignState: recordDirectiveResponse(payload.campaignState, {
          id: 'response-model-backed-retry',
          ingressId: payload.ingressId,
          hostMessageId: 'assistant-model-backed-response-retry',
          coreTransactionId: 'txn-response-model-backed-retry',
          coreProjection: {
            kind: 'directive.coreResponseProjectionRef.v1',
            responseId: 'response-model-backed-retry',
            transactionId: 'txn-response-model-backed-retry',
            status: 'complete'
          },
          status: 'complete',
          responseKind: payload.responseKind,
          strategy: payload.strategy
        }),
        response: {
          id: 'response-model-backed-retry',
          hostMessageId: 'assistant-model-backed-response-retry',
          text: payload.text,
          responseKind: payload.responseKind
        }
      };
    }
  },
  repairRuntime: {
    authorizeRetry(input = {}) {
      return {
        authorized: true,
        eventType: 'hostResponsePostFailure',
        action: 'retryResponse',
        transactionId: input.transactionId || null
      };
    }
  },
  stateDeltaGateway,
  coreTurnStore: modelBackedRetryCoreStore,
  getCampaignState,
  setCampaignState,
  persistCampaignState,
  syncPromptContext: async (state) => state,
  previewDirectorTurn: async () => {
    throw new Error('Model-backed retry fixture must not preview a Director turn.');
  },
  commitProvisionalDirectorTurn: async () => {
    throw new Error('Model-backed retry fixture must not commit a Director turn.');
  },
  discardProvisionalDirectorTurn: async () => {},
  now
});
try {
  const modelBackedRetry = await modelBackedRetryOrchestrator.retryCommittedResponse({
    recoveryId: modelBackedRetryRecoveryId
  });
  assert.equal(modelBackedRetry.ok, true);
  assert.equal(modelBackedRetryGenerations.length, 1);
  assert.equal(modelBackedRetryGenerations[0].role, 'narration');
  assert.equal(modelBackedRetryGenerations[0].request.metadata.rerunMechanics, false);
  assert.equal(
    modelBackedRetryGenerations[0].request.prompt.includes('RAW_HOST_RESPONSE_POST_FAILURE_TEXT_SHOULD_NOT_PERSIST'),
    false,
    'Model-backed retry prompt must not use the failed raw response text.'
  );
  assert.equal(modelBackedRetryDispatches.length, 1);
  assert.equal(modelBackedRetryDispatches[0].responseKind, 'committedOutcome');
  assert.match(modelBackedRetryDispatches[0].text, /dockmaster answers/i);
  assert.equal(modelBackedRetry.response.text, modelBackedRetryDispatches[0].text);
} finally {
  setCampaignState(modelBackedRetryBaselineState);
  persisted.splice(modelBackedRetryPersistedBefore);
}

const oldLedgerRetryBaselineState = cloneJson(campaignState);
const oldLedgerRetryPersistedBefore = persisted.length;
const oldLedgerRetryIngressId = 'ingress-old-ledger-response-retry';
const oldLedgerRetryRecoveryId = 'recovery-old-ledger-response-retry';
let oldLedgerRetryFixtureState = initializeCampaignRuntimeTracking({
  ...cloneJson(campaignState),
  runtimeTracking: {
    ...cloneJson(campaignState.runtimeTracking || {}),
    ingressLedger: [
      ...(campaignState.runtimeTracking?.ingressLedger || []),
      {
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
      }
    ]
  }
});
oldLedgerRetryFixtureState = recordLegacyRecoveryFixture(oldLedgerRetryFixtureState, {
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
  coreTurnStore,
  getCampaignState,
  setCampaignState,
  persistCampaignState: async () => {
    throw new Error('Visibility payload test must not persist campaign state.');
  },
  syncPromptContext: async () => {
    throw new Error('Visibility payload test must not sync prompt context.');
  },
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
  assert.equal(oldLedgerRetry.reason, 'response-recovery-not-found');
  assert.equal(oldLedgerRetryRepairDecisions.length, 0);
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

const rawVisibilityPayloadCalls = [];
const rawVisibilityPayloadOrchestrator = createChatTurnOrchestrator({
  host: {
    chat: {
      getCurrentChatId: () => 'campaign-chat',
      getCurrentBinding: () => ({ chatId: 'campaign-chat' })
    }
  },
  classify: async () => {
    throw new Error('Visibility payload test must not classify.');
  },
  responseDispatcher: {
    dispatch: async () => {
      throw new Error('Visibility payload test must not dispatch.');
    }
  },
  messageReconciler: {
    async reconcileVisibilityChanged(input = {}) {
      rawVisibilityPayloadCalls.push(input);
      return {
        matched: true,
        action: 'visibilityOnlySourceRow'
      };
    }
  },
  stateDeltaGateway,
  coreTurnStore,
  getCampaignState,
  setCampaignState,
  persistCampaignState: async () => {
    throw new Error('Visibility host lookup payload test must not persist campaign state.');
  },
  syncPromptContext: async () => {
    throw new Error('Visibility host lookup payload test must not sync prompt context.');
  },
  previewDirectorTurn: async () => {
    throw new Error('Visibility payload test must not preview.');
  },
  commitProvisionalDirectorTurn: async () => {
    throw new Error('Visibility payload test must not commit.');
  },
  now
});
const rawVisibilityPayloadResult = await rawVisibilityPayloadOrchestrator.handleMessageVisibilityChanged({
  id: 'player-runtime-raw-visibility',
  index: 44,
  is_user: true,
  extra: {
    sc_ghosted: true,
    vectfox_prompt_ghosted: true
  }
});
assert.equal(rawVisibilityPayloadResult.handled, true);
assert.equal(rawVisibilityPayloadCalls.length, 1);
assert.equal(rawVisibilityPayloadCalls[0].hostMessageId, 'player-runtime-raw-visibility');
assert.equal(rawVisibilityPayloadCalls[0].message.extra.sc_ghosted, true);
assert.equal(rawVisibilityPayloadCalls[0].message.extra.vectfox_prompt_ghosted, true);

const rawVisibilityPayloadWithHostLookupCalls = [];
const rawVisibilityPayloadWithHostLookupOrchestrator = createChatTurnOrchestrator({
  host: {
    chat: {
      getCurrentChatId: () => 'campaign-chat',
      getCurrentBinding: () => ({ chatId: 'campaign-chat' }),
      getMessage: (hostMessageId) => ({
        id: hostMessageId,
        index: 46,
        is_user: true,
        extra: {}
      })
    }
  },
  classify: async () => {
    throw new Error('Visibility host lookup payload test must not classify.');
  },
  responseDispatcher: {
    dispatch: async () => {
      throw new Error('Visibility host lookup payload test must not dispatch.');
    }
  },
  messageReconciler: {
    async reconcileVisibilityChanged(input = {}) {
      rawVisibilityPayloadWithHostLookupCalls.push(input);
      return {
        matched: true,
        action: 'visibilityOnlySourceRow'
      };
    }
  },
  stateDeltaGateway,
  coreTurnStore,
  getCampaignState,
  setCampaignState,
  persistCampaignState,
  syncPromptContext: async (state) => state,
  previewDirectorTurn: async () => {
    throw new Error('Visibility host lookup payload test must not preview.');
  },
  commitProvisionalDirectorTurn: async () => {
    throw new Error('Visibility host lookup payload test must not commit.');
  },
  now
});
const rawVisibilityPayloadWithHostLookupResult = await rawVisibilityPayloadWithHostLookupOrchestrator.handleMessageVisibilityChanged({
  id: 'player-runtime-raw-host-visibility',
  index: 47,
  is_user: true,
  extra: {
    sc_ghosted: true,
    stmb_hidden: true,
    vectfox_prompt_ghosted: true
  }
});
assert.equal(rawVisibilityPayloadWithHostLookupResult.handled, true);
assert.equal(rawVisibilityPayloadWithHostLookupCalls.length, 1);
assert.equal(rawVisibilityPayloadWithHostLookupCalls[0].hostMessageId, 'player-runtime-raw-host-visibility');
assert.equal(rawVisibilityPayloadWithHostLookupCalls[0].message.extra.sc_ghosted, true);
assert.equal(rawVisibilityPayloadWithHostLookupCalls[0].message.extra.stmb_hidden, true);
assert.equal(rawVisibilityPayloadWithHostLookupCalls[0].message.extra.vectfox_prompt_ghosted, true);
assert.equal(rawVisibilityPayloadWithHostLookupCalls[0].index, 47);

const nestedVisibilityPayloadCalls = [];
const nestedVisibilityPayloadOrchestrator = createChatTurnOrchestrator({
  host: {
    chat: {
      getCurrentChatId: () => 'campaign-chat',
      getCurrentBinding: () => ({ chatId: 'campaign-chat' }),
      getMessage: (hostMessageId) => ({
        id: hostMessageId,
        index: 48,
        is_user: true,
        extra: {}
      })
    }
  },
  classify: async () => {
    throw new Error('Nested visibility payload test must not classify.');
  },
  responseDispatcher: {
    dispatch: async () => {
      throw new Error('Nested visibility payload test must not dispatch.');
    }
  },
  messageReconciler: {
    async reconcileVisibilityChanged(input = {}) {
      nestedVisibilityPayloadCalls.push(input);
      return {
        matched: true,
        action: 'visibilityOnlySourceRow'
      };
    }
  },
  stateDeltaGateway,
  getCampaignState,
  setCampaignState,
  persistCampaignState: async () => {
    throw new Error('Nested visibility payload test must not persist campaign state.');
  },
  syncPromptContext: async () => {
    throw new Error('Nested visibility payload test must not sync prompt context.');
  },
  previewDirectorTurn: async () => {
    throw new Error('Nested visibility payload test must not preview.');
  },
  commitProvisionalDirectorTurn: async () => {
    throw new Error('Nested visibility payload test must not commit.');
  },
  now
});
const nestedVisibilityPayloadResult = await nestedVisibilityPayloadOrchestrator.handleMessageVisibilityChanged({
  id: 'player-runtime-nested-host-visibility',
  index: 48,
  message: {
    id: 'player-runtime-nested-host-visibility',
    index: 48,
    is_user: true,
    extra: {
      sc_ghosted: true,
      stmb_hidden: true,
      vectfox_prompt_ghosted: true
    }
  }
});
assert.equal(nestedVisibilityPayloadResult.handled, true);
assert.equal(nestedVisibilityPayloadCalls.length, 1);
assert.equal(nestedVisibilityPayloadCalls[0].hostMessageId, 'player-runtime-nested-host-visibility');
assert.equal(nestedVisibilityPayloadCalls[0].message.extra.sc_ghosted, true);
assert.equal(nestedVisibilityPayloadCalls[0].message.extra.stmb_hidden, true);
assert.equal(nestedVisibilityPayloadCalls[0].message.extra.vectfox_prompt_ghosted, true);
assert.equal(nestedVisibilityPayloadCalls[0].index, 48);

const wrapperVisibilityPayloadCalls = [];
const wrapperVisibilityPayloadOrchestrator = createChatTurnOrchestrator({
  host: {
    chat: {
      getCurrentChatId: () => 'campaign-chat',
      getCurrentBinding: () => ({ chatId: 'campaign-chat' }),
      getMessage: (hostMessageId) => ({
        id: hostMessageId,
        index: 49,
        is_user: true,
        extra: {}
      })
    }
  },
  classify: async () => {
    throw new Error('Wrapper visibility payload test must not classify.');
  },
  responseDispatcher: {
    dispatch: async () => {
      throw new Error('Wrapper visibility payload test must not dispatch.');
    }
  },
  messageReconciler: {
    async reconcileVisibilityChanged(input = {}) {
      wrapperVisibilityPayloadCalls.push(input);
      return {
        matched: true,
        action: 'visibilityOnlySourceRow'
      };
    }
  },
  stateDeltaGateway,
  getCampaignState,
  setCampaignState,
  persistCampaignState: async () => {
    throw new Error('Wrapper visibility payload test must not persist campaign state.');
  },
  syncPromptContext: async () => {
    throw new Error('Wrapper visibility payload test must not sync prompt context.');
  },
  previewDirectorTurn: async () => {
    throw new Error('Wrapper visibility payload test must not preview.');
  },
  commitProvisionalDirectorTurn: async () => {
    throw new Error('Wrapper visibility payload test must not commit.');
  },
  now
});
const wrapperVisibilityPayloadResult = await wrapperVisibilityPayloadOrchestrator.handleMessageVisibilityChanged({
  id: 'player-runtime-wrapper-host-visibility',
  index: 49,
  extra: {
    sc_ghosted: true,
    stmb_hidden: true,
    vectfox_prompt_ghosted: true
  },
  message: {
    id: 'player-runtime-wrapper-host-visibility',
    index: 49,
    is_user: true,
    extra: {}
  }
});
assert.equal(wrapperVisibilityPayloadResult.handled, true);
assert.equal(wrapperVisibilityPayloadCalls.length, 1);
assert.equal(wrapperVisibilityPayloadCalls[0].hostMessageId, 'player-runtime-wrapper-host-visibility');
assert.equal(wrapperVisibilityPayloadCalls[0].message.id, 'player-runtime-wrapper-host-visibility');
assert.equal(wrapperVisibilityPayloadCalls[0].message.extra.sc_ghosted, true);
assert.equal(wrapperVisibilityPayloadCalls[0].message.extra.stmb_hidden, true);
assert.equal(wrapperVisibilityPayloadCalls[0].message.extra.vectfox_prompt_ghosted, true);
assert.equal(wrapperVisibilityPayloadCalls[0].index, 49);

const zeroIndexVisibilityMapCalls = [];
const zeroIndexVisibilityMapOrchestrator = createChatTurnOrchestrator({
  host: {
    chat: {
      getCurrentChatId: () => 'campaign-chat',
      getCurrentBinding: () => ({ chatId: 'campaign-chat' }),
      getMessage: (hostMessageId) => ({
        id: hostMessageId,
        index: 0,
        is_user: true,
        extra: {}
      })
    }
  },
  classify: async () => {
    throw new Error('Zero-index visibility map test must not classify.');
  },
  responseDispatcher: {
    dispatch: async () => {
      throw new Error('Zero-index visibility map test must not dispatch.');
    }
  },
  messageReconciler: {
    async reconcileVisibilityChanged(input = {}) {
      zeroIndexVisibilityMapCalls.push(input);
      return {
        matched: true,
        action: 'visibilityOnlySourceRow'
      };
    }
  },
  stateDeltaGateway,
  getCampaignState,
  setCampaignState,
  persistCampaignState: async () => {
    throw new Error('Zero-index visibility map test must not persist campaign state.');
  },
  syncPromptContext: async () => {
    throw new Error('Zero-index visibility map test must not sync prompt context.');
  },
  previewDirectorTurn: async () => {
    throw new Error('Zero-index visibility map test must not preview.');
  },
  commitProvisionalDirectorTurn: async () => {
    throw new Error('Zero-index visibility map test must not commit.');
  },
  now
});
const zeroIndexVisibilityMapResult = await zeroIndexVisibilityMapOrchestrator.handleMessageVisibilityChanged({
  id: 'player-runtime-zero-index-visibility',
  index: 0,
  visibilityMap: {
    nativeHiddenIndices: [0]
  }
});
assert.equal(zeroIndexVisibilityMapResult.handled, true);
assert.equal(zeroIndexVisibilityMapCalls.length, 1);
assert.equal(zeroIndexVisibilityMapCalls[0].hostMessageId, 'player-runtime-zero-index-visibility');
assert.equal(zeroIndexVisibilityMapCalls[0].index, 0);
assert.deepEqual(zeroIndexVisibilityMapCalls[0].visibilityMap.nativeHiddenIndices, [0]);

const asyncVisibilityMessageCalls = [];
const asyncVisibilityMessageOrchestrator = createChatTurnOrchestrator({
  host: {
    chat: {
      getCurrentChatId: () => 'campaign-chat',
      getCurrentBinding: () => ({ chatId: 'campaign-chat' }),
      getMessage: async (hostMessageId) => ({
        id: hostMessageId,
        index: 45,
        is_user: true,
        extra: {
          stmb_hidden: true
        }
      })
    }
  },
  classify: async () => {
    throw new Error('Async visibility message test must not classify.');
  },
  responseDispatcher: {
    dispatch: async () => {
      throw new Error('Async visibility message test must not dispatch.');
    }
  },
  messageReconciler: {
    async reconcileVisibilityChanged(input = {}) {
      asyncVisibilityMessageCalls.push(input);
      return {
        matched: true,
        action: 'visibilityOnlySourceRow'
      };
    }
  },
  stateDeltaGateway,
  getCampaignState,
  setCampaignState,
  persistCampaignState: async () => {
    throw new Error('Async visibility message test must not persist campaign state.');
  },
  syncPromptContext: async () => {
    throw new Error('Async visibility message test must not sync prompt context.');
  },
  previewDirectorTurn: async () => {
    throw new Error('Async visibility message test must not preview.');
  },
  commitProvisionalDirectorTurn: async () => {
    throw new Error('Async visibility message test must not commit.');
  },
  now
});
const asyncVisibilityMessageResult = await asyncVisibilityMessageOrchestrator.handleMessageVisibilityChanged({
  id: 'player-runtime-async-visibility',
  index: 45
});
assert.equal(asyncVisibilityMessageResult.handled, true);
assert.equal(asyncVisibilityMessageCalls.length, 1);
assert.equal(typeof asyncVisibilityMessageCalls[0].message?.then, 'undefined', 'Visibility handler must await async host.chat.getMessage before REPAIR receives the message.');
assert.equal(asyncVisibilityMessageCalls[0].message.extra.stmb_hidden, true);

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
      status: 'delegated',
      coreTransactionId: `txn-delegate-dropped-ingress:${ingressId}`,
      coreProjection: {
        kind: 'directive.coreResponseProjectionRef.v1',
        responseId: `delegate-dropped-ingress:${ingressId}`,
        transactionId: `txn-delegate-dropped-ingress:${ingressId}`,
        status: 'delegated'
      }
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
  coreTurnStore,
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
  coreTurnStore,
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
  coreTurnStore,
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
campaignState = recordTurnIngress(campaignState, {
  ...dependentEditIngress,
  coreTransactionId: 'txn-dependent-edit-original',
  sourceFrameId: 'frame-dependent-edit-original'
}, {
  missingCoreWriteMode: 'reject'
});
campaignState = recordDirectiveResponse(campaignState, {
  id: 'response-dependent-edit',
  ingressId: dependentEditIngress.id,
  hostMessageId: 'assistant-dependent-edit',
  outcomeId: dependentEditIngress.outcomeId,
  responseKind: 'committedOutcome',
  status: 'posted',
  coreTransactionId: 'txn-dependent-edit-original',
  coreProjection: {
    kind: 'directive.coreResponseProjectionRef.v1',
    responseId: 'response-dependent-edit',
    transactionId: 'txn-dependent-edit-original',
    status: 'posted'
  }
}, {
  missingCoreWriteMode: 'reject'
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
  authority: 'compatibilityProjection',
  projectionSource: 'coreStoreV2',
  compatibilityMirror: {
    kind: 'directive.coreIngressCompatibilityMirror.v1',
    status: 'coreProjected'
  },
  invalidatedAt: '2026-06-22T01:00:40.000Z',
  invalidationType: 'playerMessageEdited',
  replacementText: latestRestartEditedText,
  editedAt: '2026-06-22T01:00:40.000Z'
});
campaignState = recordLegacyRecoveryFixture(campaignState, {
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
assert.equal(latestRestartNewIngress.sourceRestart.priorRecoveryId, null);
assert.notEqual(latestRestartNewIngress.coreTransactionId, latestRestartOldTransactionId);
assert.notEqual(latestRestartNewIngress.sourceFrameId, 'frame:latest-restart-old');
assert.equal(latestRestartOldIngress.status, 'restartSuperseded');
assert.equal(latestRestartOldIngress.restartedByIngressId, latestRestartNewIngress.id);
assert.equal(latestRestartOldIngress.restartCoreTransactionId, latestRestartNewIngress.coreTransactionId);
assert.equal(latestRestartOldIngress.restartRepairDecision.action, 'restartLatestSource');
assert.equal(latestRestartOldIngress.authority, 'compatibilityProjection');
assert.equal(latestRestartOldIngress.projectionSource, 'coreStoreV2');
assert.equal(latestRestartOldIngress.coreProjection.kind, 'directive.coreIngressSourceRestartProjectionRef.v1');
assert.equal(latestRestartOldIngress.coreProjection.priorTransactionId, latestRestartOldTransactionId);
assert.equal(latestRestartOldIngress.coreProjection.replacementTransactionId, latestRestartNewIngress.coreTransactionId);
assert.equal(latestRestartOldIngress.coreProjection.priorIngressId, latestRestartOldIngressId);
assert.equal(latestRestartOldIngress.coreProjection.replacementIngressId, latestRestartNewIngress.id);
assert.equal(latestRestartOldIngress.coreProjection.eventType, 'playerMessageReobserved');
assert.equal(latestRestartOldIngress.coreProjection.status, 'restartSuperseded');
assert.equal(latestRestartRecovery, undefined);
assert.equal(coreBeginCalls.length, latestRestartCoreBeginBefore + 1);
assert.equal(coreBeginCalls.at(-1).options.ingressId, latestRestartNewIngress.id);
assert.equal(coreBeginCalls.at(-1).options.transactionId, latestRestartNewIngress.coreTransactionId);
assert.notEqual(coreBeginCalls.at(-1).options.idempotencyKey, `begin:${latestRestartOldIngressId}`);
assert.equal(JSON.stringify(coreBeginCalls.at(-1)).includes(latestRestartEditedText), false, 'CORE begin refs must not store raw edited player text.');
assert.equal(coreSupersedeCalls.length, latestRestartCoreSupersedeBefore + 1);
assert.equal(coreSupersedeCalls.at(-1).priorTransactionId, latestRestartOldTransactionId);
assert.equal(coreSupersedeCalls.at(-1).replacementTransactionId, latestRestartNewIngress.coreTransactionId);
assert.equal(coreSupersedeCalls.at(-1).options.priorRecoveryId, null);
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
  latestRestartDuplicateState.runtimeTracking.recoveryJournal.filter((entry) => entry.id === 'recovery-latest-restart-orchestrator').length,
  0,
  'Duplicate latest restart observation must not revive the old recovery row.'
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
assert.equal(failedRecovery, undefined, 'CORE-backed classifier failure must not write old recoveryJournal rows.');
assert.equal(coreRecoveryCalls.length, coreRecoveryCountBeforeClassifierFailure + 1, 'CORE-backed classifier failure must record CORE recovery before old recovery projection.');
assert.equal(coreRecoveryCalls.at(-1).transactionId, failedIngress.coreTransactionId);
assert.equal(coreRecoveryCalls.at(-1).recoveryBundle.id, failedIngress.recoveryId);
assert.equal(coreRecoveryCalls.at(-1).recoveryBundle.reason, 'chatTurnProcessingFailure');
assert.equal(coreRecoveryCalls.at(-1).recoveryBundle.sourceMutation.eventType, 'chatTurnProcessingFailure');
assert.equal(failedIngress.coreRecovery.transactionId, failedIngress.coreTransactionId);
assert.equal(failedIngress.authority, 'compatibilityProjection');
assert.equal(failedIngress.projectionSource, 'coreStoreV2');
assert.equal(failedIngress.coreProjection.kind, 'directive.coreIngressRecoveryProjectionRef.v1');
assert.equal(failedIngress.coreProjection.transactionId, failedIngress.coreTransactionId);
assert.equal(failedIngress.coreProjection.ingressId, failedIngress.id);
assert.equal(failedIngress.coreProjection.recoveryCaseId, failedIngress.recoveryId);
assert.equal(failedIngress.coreProjection.eventType, 'chatTurnProcessingFailure');
assert.equal(failedIngress.coreProjection.status, 'recoveryRequired');

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

const coreSupersedeBeforeClassifierRetry = coreSupersedeCalls.length;
const retriedClassifierFailure = await orchestrator.observePlayerMessage({
  chatId: 'campaign-chat',
  message: classifierFailureMessage
});
const retriedIngress = campaignState.runtimeTracking.ingressLedger.find((entry) => entry.hostMessageId === 'player-classifier-failure');
assert.equal(retriedClassifierFailure.handled, true);
assert.notEqual(retriedClassifierFailure.deduplicated, true);
assert.notEqual(retriedIngress.status, 'recoveryRequired');
assert.equal(
  campaignState.runtimeTracking.recoveryJournal.some((entry) => entry.ingressId === failedIngress.id && entry.type === 'chatTurnProcessingFailure'),
  false,
  'Classifier retry must not recreate old recoveryJournal rows.'
);
assert.equal(coreSupersedeCalls.length, coreSupersedeBeforeClassifierRetry + 1, 'Classifier retry should resolve CORE recovery through source restart.');
assert.equal(coreSupersedeCalls.at(-1).priorTransactionId, failedIngress.coreTransactionId);
assert.equal(coreSupersedeCalls.at(-1).options.priorRecoveryId, failedIngress.recoveryId);

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
  coreTurnStore,
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
  coreTurnStore,
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
  released: true,
  skipped: false,
  reason: 'directive-inject-and-continue',
  waitForCompletion: false,
  generationStartedAt: '2026-06-28T17:05:00.000Z',
  hostGenerationReleasedAt: '2026-06-28T17:05:00.000Z',
  observedMessage: {
    hostMessageId: 'host-native-bad-1',
    index: 9,
    text: 'Bronn, a human male in his early forties, grumbled that the ship had been at impulse for six days since leaving Utopia Planitia.'
  }
});
let observedState = initializeCampaignRuntimeTracking(cloneJson(campaignState));
observedState = recordTurnIngress(observedState, {
  id: 'ingress-host-native-observed',
  hostMessageId: 'player-host-native-observed',
  chatId: 'observed-host-native-chat',
  campaignId: observedState.campaign?.id || 'campaign-orchestration-test',
  sourceFrame: {
    id: 'frame-host-native-observed',
    sourceKind: 'playerMessage',
    campaignId: observedState.campaign?.id || 'campaign-orchestration-test',
    saveId: observedState.campaignChatBinding?.saveId || null,
    chatId: 'observed-host-native-chat',
    hostMessageId: 'player-host-native-observed',
    textHash: 'hash-host-native-observed',
    sourceRevision: observedState.runtimeTracking?.revision || 0
  },
  coreTransactionId: 'txn-host-native-observed'
}, {
  missingCoreWriteMode: 'reject'
});
const observedCoreResponseProjections = [];
const observedDispatcher = createResponseDispatcher({
  host: { chat: observedContinuationChat },
  coreTurnStore: {
    async advanceTurn(transactionId, patch = {}) {
      if (patch.phase === 'hostContinueReleased' && patch.responseId) {
        observedCoreResponseProjections.push({
          id: patch.responseId,
          responseId: patch.responseId,
          transactionId,
          status: 'hostContinueReleased',
          responseKind: patch.responseKind || 'hostContinue'
        });
      }
      return {
        id: transactionId,
        phase: patch.phase || 'hostContinueReleased',
        route: patch.route || 'hostContinue'
      };
    },
    async readProjections() {
      return {
        responseLedger: cloneJson(observedCoreResponseProjections),
        recoveryJournal: []
      };
    }
  },
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
  false,
  'Host-native continuity contradiction must not write old recoveryJournal rows after response-dispatcher cutover.'
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
  coreTurnStore,
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
campaignState = recordLegacyRecoveryFixture(campaignState, {
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
assert.equal(resolvedDeleteRecovery, undefined);

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
const fallbackProviderRawCanary = 'RAW_PROVIDER_FAILURE_TEXT_SHOULD_NOT_PERSIST';
nextNarrationResult = {
  ok: false,
  directiveGenerationStartedAt: fallbackGenerationStartedAt,
  error: {
    code: 'fixture_narration_timeout',
    message: fallbackProviderRawCanary,
    providerOutput: `Provider wrote ${fallbackProviderRawCanary} in an error payload.`,
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
const fallbackResponseLedger = [...campaignState.runtimeTracking.responseLedger].reverse().find((entry) => (
  entry.responseKind === 'committedOutcome'
  && entry.status === 'responseRetryRequired'
  && entry.providerFallback?.reason === 'provider-failure-after-mechanics-commit'
));
assert.ok(fallbackResponseLedger, 'Provider-failure fallback response ledger row must be recorded.');
assert.equal(fallbackResponseLedger.responseKind, 'committedOutcome');
assert.equal(fallbackResponseLedger.directiveGenerationStartedAt, fallbackGenerationStartedAt);
assert.equal(fallbackResponseLedger.generationStartedAt, fallbackGenerationStartedAt);
assert.equal(fallbackResponseLedger.turnLatency.directiveGenerationStartedAt, Date.parse(fallbackGenerationStartedAt));
const fallbackOldRecovery = campaignState.runtimeTracking.recoveryJournal.find(
  (entry) => entry.type === 'providerFailureAfterMechanicsCommit' && entry.outcomeId === commitCalls.at(-1).outcomeId
);
assert.equal(
  fallbackOldRecovery,
  undefined,
  'CORE-backed narration fallback must not write old provider-failure recovery rows.'
);
assert.equal(coreRecoveryCalls.at(-1).recoveryBundle.repairDecision.eventType, 'providerFailureAfterMechanicsCommit');
const fallbackRecovery = coreTurnStore.readProjections().recoveryJournal.find((entry) => (
  entry.id === coreRecoveryCalls.at(-1).recoveryBundle.id
));
assert.equal(fallbackRecovery.repairDecision.eventType, 'providerFailureAfterMechanicsCommit');
assert.equal(fallbackRecovery.repairDecision.retryDirectiveResponse, true);
assert.equal(fallbackRecovery.status, 'required');
assert.equal(fallbackRecovery.transactionId, fallbackRecovery.repairDecision.transactionId);
assert.equal(fallbackResponseLedger.coreRelease, null, 'Provider-failure fallback must not consume CORE visible response before retry.');
assert.equal(fallbackResponseLedger.status, 'responseRetryRequired');
assert.equal(fallbackResponseLedger.authority, 'compatibilityProjection');
assert.equal(fallbackResponseLedger.projectionSource, 'coreStoreV2');
assert.equal(fallbackResponseLedger.coreProjection.kind, 'directive.coreResponseRetryProjectionRef.v1');
assert.equal(fallbackResponseLedger.coreProjection.transactionId, fallbackRecovery.transactionId);
assert.equal(fallbackResponseLedger.coreProjection.recoveryCaseId, fallbackRecovery.id);
assert.equal(fallbackResponseLedger.coreProjection.status, 'responseRetryRequired');
const fallbackIngressBeforeRetry = campaignState.runtimeTracking.ingressLedger.find(
  (entry) => entry.outcomeId === fallbackRecovery.dependentOutcomeId
);
assert.equal(fallbackIngressBeforeRetry.status, 'responseRetryRequired');
assert.equal(fallbackIngressBeforeRetry.recoveryId, fallbackRecovery.id);
assert.equal(
  coreVisibleResponseCalls.some((entry) => entry.transactionId === fallbackRecovery.transactionId),
  false,
  'Provider-failure fallback must leave CORE responseRetryRequired open for the real retry.'
);
assert.equal(JSON.stringify(fallbackRecovery).includes(fallbackProviderRawCanary), false);
assert.equal(JSON.stringify(coreRecoveryCalls.at(-1)).includes(fallbackProviderRawCanary), false);
const providerFailureRetryResponseCallsBefore = responseSwipeGenerationCalls.length;
const providerFailureRetryCommitCallsBefore = commitCalls.length;
const originalRecordVisibleResponse = coreTurnStore.recordVisibleResponse;
let forceProviderFailureCoreClosureFailure = true;
coreTurnStore.recordVisibleResponse = async (...args) => {
  if (forceProviderFailureCoreClosureFailure) {
    const error = new Error('Synthetic CORE retry closure failure.');
    error.code = 'SYNTHETIC_CORE_RETRY_CLOSURE_FAILURE';
    throw error;
  }
  return originalRecordVisibleResponse.apply(coreTurnStore, args);
};
const failedProviderFailureRetry = await orchestrator.retryCommittedResponse({
  recoveryId: fallbackRecovery.id
});
assert.equal(failedProviderFailureRetry.ok, false);
assert.equal(failedProviderFailureRetry.reason, 'core-response-retry-closure-failed');
const providerFailureResponseAfterFailedRetry = campaignState.runtimeTracking.responseLedger.find(
  (entry) => entry.id === fallbackResponseLedger.id
);
assert.equal(providerFailureResponseAfterFailedRetry.authority, 'compatibilityProjection');
assert.equal(providerFailureResponseAfterFailedRetry.projectionSource, 'coreStoreV2');
assert.equal(providerFailureResponseAfterFailedRetry.coreProjection.status, 'coreClosureFailed');
assert.equal(providerFailureResponseAfterFailedRetry.coreProjection.recoveryCaseId, fallbackRecovery.id);
const fallbackMessageAfterFailedRetry = chat.getMessage(fallbackResponse.hostMessageId);
assert.equal(fallbackMessageAfterFailedRetry.swipes.length, 2);
assert.equal(fallbackMessageAfterFailedRetry.swipe_id, 1);
const providerFailureRetryResponseCallsAfterFailedRetry = responseSwipeGenerationCalls.length;
const failedProviderFailureRetryAgain = await orchestrator.retryCommittedResponse({
  recoveryId: fallbackRecovery.id
});
assert.equal(failedProviderFailureRetryAgain.ok, false);
assert.equal(failedProviderFailureRetryAgain.reason, 'core-response-retry-closure-failed');
const fallbackMessageAfterSecondFailedRetry = chat.getMessage(fallbackResponse.hostMessageId);
assert.equal(fallbackMessageAfterSecondFailedRetry.swipes.length, 2);
assert.equal(
  responseSwipeGenerationCalls.length,
  providerFailureRetryResponseCallsAfterFailedRetry,
  'Repeated provider-failure retry after CORE closure failure must reuse the existing retry swipe.'
);
const switchedAwayMessages = chat.messages();
const switchedAwayIndex = switchedAwayMessages.findIndex((entry) => entry.hostMessageId === fallbackResponse.hostMessageId);
switchedAwayMessages[switchedAwayIndex].text = switchedAwayMessages[switchedAwayIndex].swipes[0];
switchedAwayMessages[switchedAwayIndex].swipe_id = 0;
switchedAwayMessages[switchedAwayIndex].metadata.selectedSwipeIndex = 0;
chat.setMessagesForChat('campaign-chat', switchedAwayMessages);
const switchedAwayRetry = await orchestrator.retryCommittedResponse({
  recoveryId: fallbackRecovery.id
});
assert.equal(switchedAwayRetry.ok, false);
assert.equal(switchedAwayRetry.reason, 'provider-failure-response-retry-not-selected');
assert.equal(chat.getMessage(fallbackResponse.hostMessageId).swipes.length, 2);
assert.equal(
  responseSwipeGenerationCalls.length,
  providerFailureRetryResponseCallsAfterFailedRetry,
  'Provider-failure retry must not append a new swipe when the prior retry swipe is no longer selected.'
);
const hostInterloper = chat.pushAssistantMessage({
  text: 'A host-native answer arrived after the fallback row.',
  hostMessageId: 'assistant-provider-failure-interloper',
  directiveOwned: false
});
const interloperRetry = await orchestrator.retryCommittedResponse({
  recoveryId: fallbackRecovery.id
});
assert.equal(interloperRetry.ok, false);
assert.equal(interloperRetry.reason, 'provider-failure-response-target-not-latest');
const retrySelectedMessages = chat.messages().filter((entry) => entry.hostMessageId !== hostInterloper.hostMessageId);
const retrySelectedIndex = retrySelectedMessages.findIndex((entry) => entry.hostMessageId === fallbackResponse.hostMessageId);
retrySelectedMessages[retrySelectedIndex].text = retrySelectedMessages[retrySelectedIndex].swipes[1];
retrySelectedMessages[retrySelectedIndex].swipe_id = 1;
retrySelectedMessages[retrySelectedIndex].metadata.selectedSwipeIndex = 1;
chat.setMessagesForChat('campaign-chat', retrySelectedMessages);
forceProviderFailureCoreClosureFailure = false;
const providerFailureRetry = await orchestrator.retryCommittedResponse({
  recoveryId: fallbackRecovery.id
});
coreTurnStore.recordVisibleResponse = originalRecordVisibleResponse;
assert.equal(providerFailureRetry.ok, true);
assert.equal(providerFailureRetry.responseStrategy, 'directiveSwipe');
assert.equal(
  commitCalls.length,
  providerFailureRetryCommitCallsBefore,
  'Provider-failure response retry must not rerun mechanics or recommit the outcome.'
);
assert.equal(
  responseSwipeGenerationCalls.length,
  providerFailureRetryResponseCallsBefore + 1,
  'Provider-failure retry should regenerate visible response text once, then reuse the same retry swipe for CORE closure replay.'
);
assert.equal(responseSwipeGenerationCalls.at(-1).roleId, 'narration');
const fallbackMessageAfterRetry = chat.getMessage(fallbackResponse.hostMessageId);
assert.equal(fallbackMessageAfterRetry.swipes.length, 2);
assert.equal(fallbackMessageAfterRetry.swipe_id, 1);
assert.equal(fallbackMessageAfterRetry.hostMessageId, fallbackResponse.hostMessageId);
const providerFailureRecoveryAfterRetry = campaignState.runtimeTracking.recoveryJournal.find(
  (entry) => entry.id === fallbackRecovery.id
);
assert.equal(providerFailureRecoveryAfterRetry, undefined, 'Provider-failure retry must not recreate old recovery rows.');
const providerFailureCoreRecoveryAfterRetry = coreTurnStore.readProjections().recoveryJournal.find((entry) => (
  entry.id === fallbackRecovery.id
));
assert.equal(providerFailureCoreRecoveryAfterRetry.status, 'resolved');
const providerFailureResponseAfterRetry = campaignState.runtimeTracking.responseLedger.find(
  (entry) => entry.id === fallbackResponseLedger.id
);
assert.equal(providerFailureResponseAfterRetry.responseRetry.recoveryId, fallbackRecovery.id);
assert.equal(providerFailureResponseAfterRetry.authority, 'compatibilityProjection');
assert.equal(providerFailureResponseAfterRetry.projectionSource, 'coreStoreV2');
assert.equal(providerFailureResponseAfterRetry.coreProjection.kind, 'directive.coreResponseRetryProjectionRef.v1');
assert.equal(providerFailureResponseAfterRetry.coreProjection.status, 'posted');
assert.equal(providerFailureResponseAfterRetry.coreProjection.recoveryCaseId, fallbackRecovery.id);
assert.equal(providerFailureResponseAfterRetry.responseRetry.swipeIndex, 1);
assert.equal(providerFailureResponseAfterRetry.responseRetry.hostMessageId, fallbackResponse.hostMessageId);
const providerFailureRetryCoreCall = coreVisibleResponseCalls.find((entry) => (
  entry.transactionId === fallbackRecovery.transactionId
  && entry.responseRef?.repairDecision?.eventType === 'providerFailureAfterMechanicsCommit'
));
assert.ok(providerFailureRetryCoreCall, 'Provider-failure retry should close CORE recovery through REPAIR retry actuation.');
assert.equal(providerFailureRetryCoreCall.responseRef.hostMessageId, fallbackResponse.hostMessageId);
assert.equal(providerFailureRetryCoreCall.responseRef.outcomeId, fallbackRecovery.dependentOutcomeId);
assert.equal(
  coreTransactions.get(fallbackRecovery.transactionId).recoveryCaseId,
  null,
  'Provider-failure retry should resolve the CORE recovery case.'
);

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
  coreTurnStore,
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
