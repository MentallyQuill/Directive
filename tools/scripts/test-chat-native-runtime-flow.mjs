import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createFakeDirectiveHost } from '../../src/hosts/fake/fake-host.mjs';
import { createDirectiveRuntimeApp } from '../../src/runtime/runtime-app.mjs';
import {
  DIRECTIVE_STORAGE_PATHS,
  listCampaignSaves
} from '../../src/storage/directive-storage-repository.mjs';
import {
  loadCoreStoreStateV2,
  readCoreStoreProjectionsV2
} from '../../src/storage/core-store-v2.mjs';
import { loadV2MaterializedHead } from '../../src/storage/transaction-store-v2.mjs';

const root = process.cwd();
const readJson = (filePath) => JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const crewDataset = readJson('packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json');
const graphPaths = [
  'packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json',
  'packages/bundled/breckenridge/chapter-1-the-empty-convoy.mission-graph.json',
  'packages/bundled/breckenridge/chapter-2-false-colors.mission-graph.json'
];
const missionGraphs = graphPaths.map((filePath) => ({ path: filePath, graph: readJson(filePath) }));
const cloneJson = (value) => JSON.parse(JSON.stringify(value));

const noChangeProposal = { text: JSON.stringify({ id: 'no-change', operations: [], summary: 'No durable sidecar change.' }) };
let campaignIntroGenerationCount = 0;
let holdNextCampaignIntro = false;
let heldCampaignIntroAbortObserved = false;
let heldCampaignIntroStarted = null;
let heldCampaignIntroResolve = null;
let heldAdvisoryStarted = null;
let heldAdvisoryResolve = null;
async function loadChatNativeAssets() {
  return {
    packages: [packageData],
    projections: [projection],
    crewDatasets: [{
      path: 'packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json',
      dataset: crewDataset
    }],
    missionGraphs
  };
}

const host = createFakeDirectiveHost({
  chatNative: true,
  chatOptions: { chatId: 'pre-campaign-chat', entityName: 'Captain Whitaker' },
  generationOptions: {
    responses: {
      campaignIntro: ({ request, rawRequest }) => {
        campaignIntroGenerationCount += 1;
        if (holdNextCampaignIntro) {
          holdNextCampaignIntro = false;
          heldCampaignIntroStarted?.();
          return new Promise((resolve, reject) => {
            const signal = rawRequest?.signal;
            let fallbackTimer = null;
            heldCampaignIntroResolve = () => {
              if (fallbackTimer) globalThis.clearTimeout?.(fallbackTimer);
              heldCampaignIntroResolve = null;
              resolve({
                providerId: 'fake-reasoning',
                text: 'The held campaign intro now posts after the player asks Directive to build the opening scene.'
              });
            };
            const abortHeldIntro = () => {
              heldCampaignIntroAbortObserved = true;
              if (fallbackTimer) globalThis.clearTimeout?.(fallbackTimer);
              heldCampaignIntroResolve = null;
              const error = new Error('Held campaign intro canceled by test.');
              error.code = 'DIRECTIVE_GENERATION_ABORTED';
              reject(error);
            };
            if (signal?.aborted) {
              abortHeldIntro();
              return;
            }
            signal?.addEventListener?.('abort', abortHeldIntro, { once: true });
            fallbackTimer = globalThis.setTimeout?.(() => heldCampaignIntroResolve?.(), 5000);
          });
        }
        return {
          providerId: 'fake-reasoning',
          text: campaignIntroGenerationCount === 1
            ? 'The U.S.S. Breckenridge holds steady at the edge of the assignment zone. Captain Whitaker yields the deck to Commander Serrin as the first operational report reaches the bridge.'
            : `The U.S.S. Breckenridge holds steady for alternate intro ${campaignIntroGenerationCount}. Captain Whitaker keeps the same handoff in view while the seeded variant changes only the prose.`
        };
      },
      narration: {
        providerId: 'fake-reasoning',
        text: 'The bridge answers in practiced sequence. Helm adjusts the Breckenridge posture while Operations records the command and the senior staff waits for the next decision.'
      },
      campaignConclusion: {
        providerId: 'fake-reasoning',
        text: 'The Breckenridge closes the final watch with her crew intact and the campaign entered into Starfleet record.'
      },
      utilityTurnClassifier: {
        providerId: 'fake-utility',
        text: JSON.stringify({
          classification: 'consequentialCommand',
          responseStrategy: 'directivePosted',
          confidence: 0.86,
          ambiguity: 'low',
          speechAct: 'order',
          action: 'change course and pursue',
          target: 'freighter',
          targetConfidence: 0.84,
          domainSignals: ['mission', 'ship'],
          riskSignals: [],
          reasons: ['Runtime fixture utility response routes the player order to the Mission Director.'],
          workerPlan: {
            missionDirector: true,
            ship: true,
            commandBearing: true,
            sideMission: true,
            continuity: true,
            promptUpdate: true,
            narrator: true
          }
        })
      },
      continuityTracker: noChangeProposal,
      relationshipEvaluator: noChangeProposal,
      crewDirector: noChangeProposal,
      shipDirector: noChangeProposal,
      commandBearingEvaluator: noChangeProposal,
      sideMissionSignalDetector: noChangeProposal,
      outcomeIntegrityReview: {
        providerId: 'fake-utility',
        text: JSON.stringify({
          schema: 'directive.outcomeIntegrityReview.v1',
          verdict: 'accept',
          categories: [],
          reason: 'The edit shortens the prose while preserving the same committed pursuit outcome.',
          safeSummary: 'Prose-only trim.'
        })
      },
      commandLogSummarizer: ({ request }) => {
        const sourceOutcomeId = String(request?.prompt || '').match(/"outcome":\s*\{[\s\S]*?"id":\s*"([^"]+)"/)?.[1] || 'unknown-outcome';
        return {
          providerId: 'fake-utility',
          text: JSON.stringify({
            sourceOutcomeId,
            title: 'Command logged',
            summary: 'The bridge committed the commander\'s order.',
            visibleConsequences: ['Operational posture changed.']
          })
        };
      },
      missionDirectorAdvisor: ({ request }) => new Promise((resolve) => {
        heldAdvisoryStarted?.(cloneJson(request?.metadata || null));
        heldAdvisoryResolve = () => {
          heldAdvisoryResolve = null;
          resolve({
            providerId: 'fake-utility',
            text: JSON.stringify({
              kind: 'directive.playerSafeAdvisory',
              subject: 'Bridge arrival options',
              missionBrief: 'Serrin asked for decision support before committing the next bridge action.',
              logSummary: 'Serrin requested options before choosing the next command action.',
              involvedCrewIds: ['mara-whitaker'],
              crewNotes: [
                {
                  crewId: 'mara-whitaker',
                  summary: 'The request may shape the first command handoff with Captain Whitaker.'
                }
              ],
              considerations: ['The Captain remains a relevant authority boundary.'],
              options: [
                'Ask the duty officer for the latest operations picture.',
                'Proceed to the bridge and request a concise readiness report.'
              ]
            })
          });
        };
      }),
      continuityProjectionPlanner: {
        providerId: 'fake-utility',
        text: JSON.stringify({
          kind: 'directive.continuityProjectionPlan.v1',
          operations: [],
          omitted: []
        })
      }
    }
  }
});
const hostGenerationContinuations = [];
host.chat.continueHostGeneration = async (payload = {}) => {
  hostGenerationContinuations.push(cloneJson(payload));
  const releasedAt = new Date(clock).toISOString();
  clock += 1000;
  return {
    ok: true,
    skipped: false,
    released: true,
    waitForCompletion: payload.waitForCompletion,
    reason: payload.reason || null,
    generationStartedAt: releasedAt,
    hostGenerationReleasedAt: releasedAt
  };
};

let idSequence = 0;
let clock = Date.parse('2026-06-22T04:00:00.000Z');
const app = createDirectiveRuntimeApp({
  host,
  packageLoader: loadChatNativeAssets,
  idFactory(prefix) {
    idSequence += 1;
    return `${prefix}-chat-native-${idSequence}`;
  },
  now() {
    const value = new Date(clock).toISOString();
    clock += 1000;
    return value;
  }
});
assert.equal(typeof app.reobserveHostGenerationCompletions, 'function', 'Runtime app exposes host-native completion reobserve bridge for live proof.');
const generationRoleCount = (roleId) => host.generation.calls().filter((entry) => entry.role === roleId).length;

function assertRuntimeViewBoundToSave(runtimeView, saveId, label) {
  assert.equal(runtimeView.activeSaveId, saveId, `${label}: active save id`);
  assert.equal(runtimeView.loadedSave.saveId, saveId, `${label}: loaded save id`);
  assert.equal(runtimeView.loadedChatNative.binding.saveId, saveId, `${label}: loaded chat binding save id`);
  assert.equal(runtimeView.chatNative.binding.saveId, saveId, `${label}: rendered chat binding save id`);
  assert.equal(runtimeView.currentChat.status, 'matching-campaign', `${label}: current chat status`);
  assert.equal(runtimeView.currentChatCampaignGuard.ok, true, `${label}: current chat save guard`);
}

function assertCoreHostContinueBridge({ projections, state, hostMessageId, chatId, label }) {
  const ingress = state.runtimeTracking.ingressLedger.find((entry) => entry.hostMessageId === hostMessageId);
  assert.ok(ingress, `${label}: old ingress exists`);
  assert.ok(ingress.sourceFrameId, `${label}: old ingress carries sourceFrameId`);
  assert.ok(ingress.coreTransactionId, `${label}: old ingress carries coreTransactionId`);
  const coreIngress = projections.ingressLedger.find((entry) => entry.hostMessageId === hostMessageId);
  assert.ok(coreIngress, `${label}: CORE ingress projection exists`);
  assert.equal(coreIngress.transactionId, ingress.coreTransactionId, `${label}: CORE transaction id matches old ingress`);
  assert.equal(coreIngress.sourceFrameId, ingress.sourceFrameId, `${label}: CORE source frame id matches old ingress`);
  assert.equal(coreIngress.chatId, chatId, `${label}: CORE projection uses active chat id`);
  assert.equal(coreIngress.status, 'hostContinueReleased', `${label}: CORE projection reached hostContinueReleased`);
  assert.equal(coreIngress.route, 'hostContinue', `${label}: CORE projection route`);
  const response = state.runtimeTracking.responseLedger.find((entry) => entry.ingressId === ingress.id);
  assert.ok(response, `${label}: old response ledger exists`);
  assert.equal(response.coreTransactionId, ingress.coreTransactionId, `${label}: response ledger carries matching CORE transaction id`);
  assert.equal(response.coreRelease?.phase, 'hostContinueReleased', `${label}: response ledger records CORE release phase`);
  assert.equal(response.coreRelease?.route, 'hostContinue', `${label}: response ledger records CORE release route`);
  assert.equal(response.hostGenerationReleaseMode, 'nonblocking', `${label}: response ledger records nonblocking release mode`);
  assert.equal(response.turnLatency?.architectureWithin60s, true, `${label}: response ledger records under-60s architecture timing`);
  const coreTiming = projections.turnTiming.find((entry) => entry.transactionId === ingress.coreTransactionId);
  assert.ok(coreTiming, `${label}: CORE timing projection exists`);
  assert.equal(coreTiming.route, 'hostContinue', `${label}: CORE timing projection records hostContinue route`);
  assert.equal(coreTiming.turnTiming.hostGenerationReleasedAt, response.turnLatency.hostGenerationReleasedAt, `${label}: CORE timing projection records host release timestamp`);
  assert.equal(coreTiming.turnTiming.directiveGenerationStartedAt, null, `${label}: CORE timing projection keeps Directive narration empty for hostContinue`);
  assert.equal(coreTiming.turnTiming.architectureWithin60s, true, `${label}: CORE timing projection records under-60s host release`);
}

function assertCoreDirectivePostedBridge({ projections, state, hostMessageId, chatId, label }) {
  const ingress = state.runtimeTracking.ingressLedger.find((entry) => entry.hostMessageId === hostMessageId);
  assert.ok(ingress, `${label}: old ingress exists`);
  assert.ok(ingress.sourceFrameId, `${label}: old ingress carries sourceFrameId`);
  assert.ok(ingress.coreTransactionId, `${label}: old ingress carries coreTransactionId`);
  const coreIngress = projections.ingressLedger.find((entry) => entry.hostMessageId === hostMessageId);
  assert.ok(coreIngress, `${label}: CORE ingress projection exists`);
  assert.equal(coreIngress.transactionId, ingress.coreTransactionId, `${label}: CORE transaction id matches old ingress`);
  assert.equal(coreIngress.sourceFrameId, ingress.sourceFrameId, `${label}: CORE source frame id matches old ingress`);
  assert.equal(coreIngress.chatId, chatId, `${label}: CORE projection uses active chat id`);
  assert.equal(coreIngress.status, 'complete', `${label}: CORE projection reached visibleResponsePosted`);
  assert.equal(coreIngress.route, 'directivePosted', `${label}: CORE projection route`);
  const response = state.runtimeTracking.responseLedger.find((entry) => entry.ingressId === ingress.id);
  assert.ok(response, `${label}: old response ledger exists`);
  assert.equal(response.coreTransactionId, ingress.coreTransactionId, `${label}: response ledger carries matching CORE transaction id`);
  assert.equal(response.coreRelease?.phase, 'visibleResponsePosted', `${label}: response ledger records CORE visible-response phase`);
  assert.equal(response.coreRelease?.route, 'directivePosted', `${label}: response ledger records CORE route`);
  assert.ok(response.directiveGenerationStartedAt, `${label}: response ledger records Directive narration start`);
  assert.equal(response.generationStartedAt, response.directiveGenerationStartedAt, `${label}: generic generation start mirrors Directive narration start`);
  assert.equal(response.turnLatency?.directiveGenerationStartedAt, Date.parse(response.directiveGenerationStartedAt), `${label}: latency records Directive narration start`);
  assert.equal(response.turnLatency?.architectureWithin60s, true, `${label}: latency records under-60s Directive start`);
  const coreResponse = projections.responseLedger.find((entry) => entry.transactionId === ingress.coreTransactionId);
  assert.ok(coreResponse, `${label}: CORE response projection exists`);
  assert.equal(coreResponse.generationStartedAt, response.directiveGenerationStartedAt, `${label}: CORE response projection records generation start`);
  assert.equal(coreResponse.turnTiming?.architectureWithin60s, true, `${label}: CORE response projection carries response timing`);
  const coreTiming = projections.turnTiming.find((entry) => entry.transactionId === ingress.coreTransactionId);
  assert.ok(coreTiming, `${label}: CORE timing projection exists`);
  assert.equal(coreTiming.route, 'directivePosted', `${label}: CORE timing projection records Directive-posted route`);
  assert.equal(coreTiming.turnTiming.directiveGenerationStartedAt, response.turnLatency.directiveGenerationStartedAt, `${label}: CORE timing projection records Directive narration start`);
  assert.equal(coreTiming.turnTiming.generationStartLatencyMs, response.turnLatency.generationStartLatencyMs, `${label}: CORE timing projection records submit-to-generation-start latency`);
  assert.equal(coreTiming.turnTiming.architectureWithin60s, true, `${label}: CORE timing projection records under-60s Directive start`);
}

function assertCoreMechanicsProjection({ projections, state, hostMessageId, label }) {
  const ingress = state.runtimeTracking.ingressLedger.find((entry) => entry.hostMessageId === hostMessageId);
  assert.ok(ingress?.coreTransactionId, `${label}: old ingress carries CORE transaction id`);
  const turn = projections.turnLedger.entries.find((entry) => entry.transactionId === ingress.coreTransactionId);
  assert.ok(turn, `${label}: CORE turn projection exists`);
  assert.equal(turn.status, 'committed', `${label}: CORE turn projection is committed`);
  assert.ok(turn.outcomeId, `${label}: CORE turn projection carries outcome id`);
  assert.ok(turn.operationHash, `${label}: CORE turn projection carries operation hash`);
  assert.equal(Array.isArray(turn.committedRoots), true, `${label}: CORE turn projection carries committed root names`);
  assert.equal(turn.committedRoots.length > 0, true, `${label}: CORE turn projection records at least one changed mechanics root`);
  const projectionText = JSON.stringify(turn);
  for (const forbidden of [
    'change course and pursue the freighter',
    'Serrin keeps the ship at measured readiness',
    'The bridge answers in practiced sequence',
    'Return one strict JSON state-delta proposal',
    '"snapshotBefore"',
    '"runtimeTracking"',
    '"rootsSet"'
  ]) {
    assert.equal(projectionText.includes(forbidden), false, `${label}: CORE mechanics projection must not include ${forbidden}.`);
  }
}

let view = await app.initialize();
assert.equal(view.campaign.packages[0].actions.startNewCampaign, true);
assert.equal(host.prompt.inspect().blockCount, 0, 'Install and package browsing must not inject campaign context.');
assert.equal(host.chat.calls().length, 0, 'Install and package browsing must not create a campaign chat.');

view = await app.startCreatorDraft({ packageId: packageData.manifest.id });
assert.equal(view.activeScreen, 'creator');
view = await app.saveCreatorDraft({
  reason: 'testCompleteDraft',
  patch: {
    activeStep: 'review',
    input: {
      identity: {
        name: 'Talia Serrin',
        pronounsOrAddress: 'she/her',
        speciesId: 'human',
        ageBandId: 'mid-career',
        appearance: 'A composed officer who watches the room before speaking.'
      },
      service: {
        careerBackgroundId: 'tactical-security',
        formativeExperienceId: 'dominion-war-fleet-service',
        assignmentReasonId: 'experienced-outsider-transfer'
      },
      personality: {
        traits: { insight: 'perceptive', connection: 'candid', execution: 'decisive' },
        flawId: 'impatient'
      },
      dossier: {
        detailLevel: 'Standard',
        briefBiography: 'Talia Serrin is a tactical-minded Starfleet Commander whose war service taught her to make timely decisions without treating lives as expendable. Her transfer gives the Breckenridge a disciplined executive officer with a measured command presence.',
        publicReputation: 'A decisive and observant officer known for increasingly measured restraint.'
      }
    }
  }
});
assert.equal(view.creator.canBeginCampaign, true);

holdNextCampaignIntro = true;
heldCampaignIntroAbortObserved = false;
const initialCampaignIntroStartedPromise = new Promise((resolve) => { heldCampaignIntroStarted = resolve; });
const initialActivationPromise = app.acceptCreatorDraftAndStartCampaign({ simulationMode: 'Command' });
await initialCampaignIntroStartedPromise;
heldCampaignIntroStarted = null;
let activatingView = await app.getCurrentView({ tabId: 'campaign' });
assert.equal(activatingView.campaignState.campaign.status, 'activating');
assert.equal(activatingView.chatNative.openingScene.ready, false);
assert.equal(activatingView.chatNative.openingScene.blocked, true);
assert.equal(activatingView.chatNative.manualSaveGuard.ok, false);
assert.equal(activatingView.chatNative.manualSaveGuard.reason, 'campaign-opening-scene-required');
const blockedEarlyBranch = await app.saveCurrentGameAs({ name: 'Too Early Branch' });
assert.equal(blockedEarlyBranch.ok, false);
assert.equal(blockedEarlyBranch.blocked, true);
assert.equal(blockedEarlyBranch.saveGuard.reason, 'campaign-opening-scene-required');
const blockedEarlyPlayerMessage = await app.observeHostPlayerMessage({
  chatId: host.chat.getCurrentChatId(),
  message: {
    hostMessageId: 'pre-intro-player-message',
    text: 'Status report.',
    isUser: true
  }
});
assert.equal(blockedEarlyPlayerMessage.blocked, true);
assert.equal(blockedEarlyPlayerMessage.responseStrategy, 'pause');
assert.equal(blockedEarlyPlayerMessage.abortDefaultGeneration, true);
assert.equal(blockedEarlyPlayerMessage.openingScene.ready, false);
assert.equal(typeof heldCampaignIntroResolve, 'function');
heldCampaignIntroResolve();
view = await initialActivationPromise;
assert.equal(view.campaignState.campaign.status, 'active');
assert.equal(view.chatNative.activation.status, 'complete');
assert.equal(view.chatNative.openingScene.ready, true);
assert.equal(view.chatNative.openingScene.blocked, false);
assert.ok(view.chatNative.binding.chatId);
assert.equal(host.chat.getCurrentChatId(), view.chatNative.binding.chatId);
assert.equal(host.chat.calls().filter((entry) => entry.type === 'createOrBindCampaignChat').length, 1);
assert.equal(host.chat.messages().filter((entry) => entry.metadata?.responseKind === 'campaignIntro').length, 1);
assert.equal(host.prompt.inspect().status, 'installed');
assert(host.prompt.inspect().blockCount > 0);
assert(host.prompt.inspect().blockCount <= 13);
assert.equal(view.promptInspection.blockCount, host.prompt.inspect().blockCount);
assert.equal(view.chatNative.binding.promptContextRevision > 0, true);
assert.equal(generationRoleCount('continuityProjectionPlanner'), 1, 'Activation prompt installation should use the continuity planner once.');
const promptSyncCallsAfterActivation = host.prompt.calls().filter((entry) => entry.type === 'sync').length;
const activationPromptInstallCall = host.prompt.calls().find((entry) => entry.type === 'sync');
assert.equal(activationPromptInstallCall?.options.reason, 'Campaign prompt context installed during activation.', 'Activation prompt install should route through the runtime LENS lifecycle.');
assert.equal(activationPromptInstallCall?.options.lane, 'visible', 'Activation prompt install should carry the LENS visible lane.');
assert.match(activationPromptInstallCall?.options.cacheKey, /^[a-f0-9]{64}$/, 'Activation prompt install should carry a LENS cache key.');
assert.equal(activationPromptInstallCall?.options.packet?.cacheKey, activationPromptInstallCall?.options.cacheKey, 'Activation prompt packet cache key should align with the LENS install request.');
assert.equal(activationPromptInstallCall?.options.packet?.lensPromptBudgetTrace?.kind, 'directive.lensPromptBudgetTrace.v1', 'Activation prompt packet should carry a LENS prompt budget trace.');
assert.equal(activationPromptInstallCall?.options.packet?.lensPromptBudgetTraceRef?.hash, activationPromptInstallCall?.options.packet?.lensPromptBudgetTrace?.hash, 'Activation prompt packet should carry a compact prompt budget trace ref.');
assert.equal(activationPromptInstallCall?.options.packet?.lensPromptBudgetTrace?.cacheInputs?.promptBudgetLaneOverrides?.protectedContinuity?.budgetTokens, 2800, 'Activation prompt trace should carry Ashes package LENS lane budget overrides.');
assert.equal(activationPromptInstallCall?.options.packet?.lensPromptBudgetTrace?.lanes?.find((lane) => lane.id === 'protectedContinuity')?.budgetTokens, 2800, 'Activation prompt trace should apply Ashes protected-continuity budget override.');
const lensPromptRebuild = await app.rebuildPromptContext();
assert.equal(['installed', 'reused'].includes(lensPromptRebuild.lens.status), true, 'Runtime prompt synchronization should route cache decisions through LENS.');
assert.match(lensPromptRebuild.lens.cacheKey, /^[a-f0-9]{64}$/);
assert.equal(host.prompt.calls().filter((entry) => entry.type === 'sync').length >= promptSyncCallsAfterActivation, true);
const promptSyncCallsAfterLensRebuild = host.prompt.calls().filter((entry) => entry.type === 'sync').length;
const continuityPlannerCallsAfterLensRebuild = generationRoleCount('continuityProjectionPlanner');
const cachedPromptRebuild = await app.rebuildPromptContext();
assert.equal(cachedPromptRebuild.lens.status, 'reused', 'Unchanged prompt context should reuse the LENS cache.');
assert.equal(cachedPromptRebuild.lens.rebuilt, false, 'Unchanged prompt context should not reinstall through the host prompt adapter.');
assert.equal(host.prompt.calls().filter((entry) => entry.type === 'sync').length, promptSyncCallsAfterLensRebuild);
assert.equal(
  generationRoleCount('continuityProjectionPlanner'),
  continuityPlannerCallsAfterLensRebuild,
  'LENS cache reuse should not invoke the blocking continuity planner when the prompt source is unchanged.'
);
const promptClearCallsBeforeManualClear = host.prompt.calls().filter((entry) => entry.type === 'clear').length;
const manualPromptClear = await app.clearPromptContext({ reason: 'test-manual-lens-clear' });
assert.equal(manualPromptClear.result.status, 'cleared', 'Manual prompt clear should route through LENS clear.');
assert.equal(manualPromptClear.result.lane, 'all', 'Manual prompt clear should clear all LENS-installed prompt lanes.');
assert.equal(manualPromptClear.result.result.ok, true, 'Manual prompt clear should preserve host clear success evidence.');
assert.equal(host.prompt.inspect().blockCount, 0, 'Manual prompt clear should remove Directive prompt blocks from the host.');
assert.equal(host.prompt.calls().filter((entry) => entry.type === 'clear').length, promptClearCallsBeforeManualClear + 1);
const manualPromptClearCall = host.prompt.calls().filter((entry) => entry.type === 'clear').at(-1);
assert.equal(manualPromptClearCall.options.reason, 'test-manual-lens-clear');
assert.equal(manualPromptClearCall.options.lane, 'all');
assert.equal(manualPromptClearCall.options.preservePacket, undefined);
const rebuildAfterManualClear = await app.rebuildPromptContext();
assert.equal(rebuildAfterManualClear.lens.status, 'installed', 'Prompt rebuild after LENS clear should install a fresh packet.');
assert.equal(rebuildAfterManualClear.lens.rebuilt, true, 'Prompt rebuild after LENS clear must not reuse stale installed-lane state.');
assert.equal(host.prompt.inspect().status, 'installed');
assert.equal(host.prompt.inspect().blockCount > 0, true);

const introBeforeNativeSwipe = host.chat.messages().find((entry) => entry.metadata?.responseKind === 'campaignIntro');
assert.equal(introBeforeNativeSwipe.swipes.length, 1);
let introNativeSwipeAborted = false;
const introNativeSwipe = await app.interceptHostGeneration({
  chat: host.chat.messages(),
  type: 'swipe',
  abort: () => { introNativeSwipeAborted = true; }
});
assert.equal(introNativeSwipe.handled, true);
assert.equal(introNativeSwipe.responseStrategy, 'campaignIntroRewrite');
assert.equal(introNativeSwipe.abortDefaultGeneration, true);
assert.equal(introNativeSwipeAborted, true);
assert.equal(campaignIntroGenerationCount, 2);
const campaignIntroRequests = host.generation.calls().filter((entry) => entry.role === 'campaignIntro');
assert.equal(campaignIntroRequests.length, 2);
assert.equal(campaignIntroRequests[1].request.metadata.introVariantReason, 'native-swipe-reroll');
assert.match(campaignIntroRequests[1].request.metadata.introVariantSeed, /:intro:1:/);
assert.match(campaignIntroRequests[1].request.prompt, /Do not invent a distress call, beacon, anomaly, attack, or new external mission hook/);
const introAfterNativeSwipe = host.chat.messages().find((entry) => entry.metadata?.responseKind === 'campaignIntro');
assert.equal(introAfterNativeSwipe.swipes.length, 2);
assert.equal(introAfterNativeSwipe.swipe_id, 1);
assert.match(introAfterNativeSwipe.swipes[1], /# Ashes of Peace/);
assert.match(introAfterNativeSwipe.swipes[1], /alternate intro 2/);
assert.equal(introAfterNativeSwipe.metadata.introRevisionReason, 'native-swipe-reroll');
assert.equal(introNativeSwipe.rewrite.introRevision.reason, 'native-swipe-reroll');
assert.match(introNativeSwipe.rewrite.introRevision.variantSeed, /:intro:1:/);

const introSwipeCountBeforeCanceledSwipe = introAfterNativeSwipe.swipes.length;
holdNextCampaignIntro = true;
heldCampaignIntroAbortObserved = false;
const heldCampaignIntroStartedPromise = new Promise((resolve) => { heldCampaignIntroStarted = resolve; });
let canceledIntroNativeSwipeAborted = false;
const canceledIntroSwipePromise = app.interceptHostGeneration({
  chat: host.chat.messages(),
  type: 'swipe',
  abort: () => { canceledIntroNativeSwipeAborted = true; }
});
await heldCampaignIntroStartedPromise;
const hostStopResult = await app.handleHostGenerationStopped({ reason: 'host-generation-stopped', source: 'test-stop-button' });
const canceledIntroSwipe = await canceledIntroSwipePromise;
heldCampaignIntroStarted = null;
assert.equal(hostStopResult.canceledCount, 1);
assert.equal(heldCampaignIntroAbortObserved, true);
assert.equal(canceledIntroSwipe.handled, true);
assert.equal(canceledIntroSwipe.responseStrategy, 'campaignIntroRewrite');
assert.equal(canceledIntroSwipe.abortDefaultGeneration, true);
assert.equal(canceledIntroNativeSwipeAborted, true);
assert.equal(canceledIntroSwipe.rewrite.canceled, true);
assert.equal(canceledIntroSwipe.rewrite.reason, 'generation-canceled');
const introAfterCanceledSwipe = host.chat.messages().find((entry) => entry.metadata?.responseKind === 'campaignIntro');
assert.equal(introAfterCanceledSwipe.swipes.length, introSwipeCountBeforeCanceledSwipe);
assert.equal(campaignIntroGenerationCount, 3);

host.chat.setMessagesForChat('duplicated-campaign-chat', host.chat.messages());
await host.chat.open({ chatId: 'duplicated-campaign-chat' });
const rebound = await app.rebindCampaignChat();
view = rebound.view;
assert.equal(rebound.binding.chatId, 'duplicated-campaign-chat');
assert.equal(host.chat.getCurrentChatId(), 'duplicated-campaign-chat');
const rebindCall = host.chat.calls().filter((entry) => entry.type === 'createOrBindCampaignChat').at(-1);
assert.equal(rebindCall.options.createNew, false);
assert.equal(rebindCall.options.existingChatId, null);
assert.equal(host.chat.messages().filter((entry) => entry.metadata?.responseKind === 'campaignIntro').length, 1);
assert.equal(view.campaignState.runtimeTracking.recoveryJournal.some((entry) => entry.type === 'chatRebind'), false);
assert.equal(view.campaignState.runtimeTracking.lifecycleJournal.some((entry) => entry.type === 'chatRebind' && entry.status === 'applied'), true);
assert.equal(host.prompt.inspect().status, 'installed');

view = await app.getCurrentView({ tabId: 'campaign' });
assert.equal(view.chatNative.manualSaveGuard.ok, true);
assert.equal(view.chatNative.manualSaveGuard.reason, 'ok');
const promptClearCallsBeforeUnboundSuspend = host.prompt.calls().filter((entry) => entry.type === 'clear').length;
host.chat.setCurrentChatId('unbound-chat-for-prompt-suspend');
const unboundPromptSync = await app.rebuildPromptContext();
assert.equal(unboundPromptSync.suspended, true);
assert.equal(unboundPromptSync.active, false);
assert.equal(unboundPromptSync.promptSuspension.status, 'suspended');
assert.equal(unboundPromptSync.promptSuspension.lane, 'all');
assert.equal(unboundPromptSync.promptSuspension.preservePacket, true);
assert.equal(unboundPromptSync.promptSuspension.activeChatId, 'unbound-chat-for-prompt-suspend');
assert.equal(unboundPromptSync.promptSuspension.boundChatId, 'duplicated-campaign-chat');
assert.equal(unboundPromptSync.promptSuspension.result.ok, true);
assert.equal(host.prompt.inspect().blockCount, 0, 'Unbound chat prompt suspension should remove Directive blocks from the current host prompt.');
const unboundPromptSuspendCall = host.prompt.calls().filter((entry) => entry.type === 'clear').at(-1);
assert.equal(host.prompt.calls().filter((entry) => entry.type === 'clear').length, promptClearCallsBeforeUnboundSuspend + 1);
assert.equal(unboundPromptSuspendCall.options.reason, 'unbound-chat');
assert.equal(unboundPromptSuspendCall.options.lane, 'all');
assert.equal(unboundPromptSuspendCall.options.preservePacket, true);
host.chat.setCurrentChatId('duplicated-campaign-chat');
const resumedPromptSync = await app.rebuildPromptContext();
assert.equal(resumedPromptSync.lens.status, 'installed', 'Returning to the bound chat should reinstall after LENS suspension instead of falsely reusing cache.');
assert.equal(resumedPromptSync.lens.rebuilt, true);
assert.equal(host.prompt.inspect().status, 'installed');
assert.equal(host.prompt.inspect().blockCount > 0, true);
const manualSave = await app.saveCurrentGame({ summary: 'Manual guard pass test.' });
assert.equal(manualSave.ok, true);
assert.equal(manualSave.saveGuard.ok, true);

host.chat.setCurrentChatId('unbound-chat-for-save-guard');
let blockedSave = await app.saveCurrentGame({ summary: 'Wrong chat should not save.' });
assert.equal(blockedSave.ok, false);
assert.equal(blockedSave.blocked, true);
assert.equal(blockedSave.saveGuard.reason, 'unbound-chat');
assert.match(blockedSave.saveGuard.summary, /not linked to this save/);

host.chat.setCurrentChatId('same-campaign-other-save-chat', {
  hostId: 'fake',
  chatId: 'same-campaign-other-save-chat',
  campaignId: view.chatNative.binding.campaignId,
  saveId: 'other-save-branch'
});
blockedSave = await app.saveCurrentGame({ summary: 'Different branch should not save.' });
assert.equal(blockedSave.ok, false);
assert.equal(blockedSave.saveGuard.reason, 'different-directive-save');
assert.match(blockedSave.saveGuard.summary, /different save branch/);

host.chat.setCurrentChatId('other-campaign-chat', {
  hostId: 'fake',
  chatId: 'other-campaign-chat',
  campaignId: 'different-campaign',
  saveId: 'different-save'
});
blockedSave = await app.saveCurrentGame({ summary: 'Different campaign should not save.' });
assert.equal(blockedSave.ok, false);
assert.equal(blockedSave.saveGuard.reason, 'different-directive-campaign');
assert.match(blockedSave.saveGuard.summary, /different Directive campaign/);

host.chat.setCurrentChatId('');
blockedSave = await app.saveCurrentGame({ summary: 'No active chat should not save.' });
assert.equal(blockedSave.ok, false);
assert.equal(blockedSave.saveGuard.reason, 'no-active-chat-selected');
assert.match(blockedSave.saveGuard.summary, /Choose the campaign chat/);

await host.chat.open(view.chatNative.binding);
const sourceSaveId = view.chatNative.binding.saveId;
const sourceChatId = view.chatNative.binding.chatId;
const sourceMessageCountBeforeBranch = host.chat.messagesForChat(sourceChatId).length;
const branch = await app.saveCurrentGameAs({ name: 'Guarded Branch' });
assert.equal(branch.ok, true);
assert.notEqual(branch.save.id, view.chatNative.binding.saveId);
assert.equal(branch.save.kind, 'directive.activeCampaignStatePersist.v2');
assert.equal(branch.save.storageFormat, 'v2');
assert.equal(branch.save.wroteV1Payload, false);
assert.equal(branch.coreBranchClone?.recallSourceMutation?.kind, 'directive.recallSourceMutation.v1');
assert.equal(branch.coreBranchClone.recallSourceMutation.action, 'save-as');
assert.equal(branch.coreBranchClone.recallSourceMutation.saveId, sourceSaveId);
assert.equal(branch.coreBranchClone.recallSourceMutation.targetSaveId, branch.save.id);
assert.equal(branch.coreBranchClone.recallSourceMutation.targetBranchId, branch.save.id);
assert.equal(JSON.stringify(branch.coreBranchClone).includes('Raw'), false);
assert.equal(branch.view.chatNative.binding.saveId, branch.save.id);
assert.notEqual(branch.view.chatNative.binding.chatId, sourceChatId);
assert.equal(branch.branchChat.sourceChatId, sourceChatId);
assert.equal(branch.branchChat.chatId, branch.view.chatNative.binding.chatId);
assert.equal(branch.view.campaignState.campaignChatBinding.chatId, branch.view.chatNative.binding.chatId);
assert.equal(host.chat.getBindingMetadata().saveId, branch.save.id);
assert.equal(host.prompt.inspect().binding.saveId, branch.save.id);
assert.equal(branch.view.campaignState.campaignChatBinding.saveId, branch.save.id);
assert.equal(host.chat.messagesForChat(sourceChatId).length, sourceMessageCountBeforeBranch);
assert.equal(host.chat.messagesForChat(branch.view.chatNative.binding.chatId).length, sourceMessageCountBeforeBranch);

const openedSource = await app.openCampaignChat({ saveId: sourceSaveId });
assert.equal(openedSource.ok, true);
assertRuntimeViewBoundToSave(openedSource.view, sourceSaveId, 'open source save after Save Game As');
assert.equal(host.chat.getBindingMetadata().saveId, sourceSaveId);
assert.equal(host.prompt.inspect().binding.saveId, sourceSaveId);
assert.equal(host.chat.getCurrentChatId(), sourceChatId);

const loadedBranch = await app.loadGame({ saveId: branch.save.id });
assertRuntimeViewBoundToSave(loadedBranch, branch.save.id, 'load branch save after reopening source');
assert.equal(host.chat.getBindingMetadata().saveId, branch.save.id);
assert.equal(host.prompt.inspect().binding.saveId, branch.save.id);

host.chat.setCurrentChatId(sourceChatId, {
  hostId: 'fake',
  chatId: sourceChatId,
  campaignId: branch.view.chatNative.binding.campaignId,
  saveId: sourceSaveId,
  entityType: 'character',
  entityId: 'fake-character',
  entityName: 'Directive - Ashes of Peace',
  status: 'bound'
});
const staleSourceChatChange = await app.handleHostChatChanged({ reason: 'stale-source-open-during-branch-load' });
assert.equal(staleSourceChatChange.suppressed, true, 'stale source chat change should be ignored during programmatic branch open');
assert.equal(staleSourceChatChange.expectedSaveId, branch.save.id);
const exportedBranchAfterStaleChange = await app.exportActiveSave();
const exportedBranchState = exportedBranchAfterStaleChange.campaignState
  || exportedBranchAfterStaleChange.saveRecord?.payload?.campaignState
  || null;
assert.equal(exportedBranchState.campaignChatBinding.saveId, branch.save.id);
assert.equal(exportedBranchState.campaignChatBinding.chatId, branch.view.chatNative.binding.chatId);

const reopenedBranch = await app.openCampaignChat({ saveId: branch.save.id });
assert.equal(reopenedBranch.ok, true);
assertRuntimeViewBoundToSave(reopenedBranch.view, branch.save.id, 'reopen branch after stale source chat change');
assert.equal(host.chat.getCurrentChatId(), branch.view.chatNative.binding.chatId);
const branchColorMessage = host.chat.pushPlayerMessage({
  hostMessageId: 'runtime-player-branch-color',
  text: '*Serrin watches the branch crew settle into the cloned watch rotation.*'
});
const branchColorResult = await app.observeHostPlayerMessage({
  chatId: host.chat.getCurrentChatId(),
  message: branchColorMessage
});
assert.equal(branchColorResult.decision.classification, 'sceneColor');
assert.equal(branchColorResult.abortDefaultGeneration, false);
const branchCoreProjections = await readCoreStoreProjectionsV2(host.storage, {
  campaignId: branch.view.chatNative.binding.campaignId,
  saveId: branch.save.id
});
assertCoreHostContinueBridge({
  projections: branchCoreProjections,
  state: branchColorResult.campaignState,
  hostMessageId: 'runtime-player-branch-color',
  chatId: branch.view.chatNative.binding.chatId,
  label: 'branch scene-color turn'
});

const loadedSource = await app.loadGame({ saveId: sourceSaveId });
assertRuntimeViewBoundToSave(loadedSource, sourceSaveId, 'load source save after branch');
assert.equal(host.chat.getBindingMetadata().saveId, sourceSaveId);
assert.equal(host.prompt.inspect().binding.saveId, sourceSaveId);
assert.equal(branch.view.campaignState.campaignChatBinding.saveId, branch.save.id);
view = loadedSource;
const sourceStorageBeforeRuntimeTurns = host.storage.snapshot();
const sourceSaveIndexBeforeRuntimeTurns = sourceStorageBeforeRuntimeTurns[DIRECTIVE_STORAGE_PATHS.saveIndex].saves[sourceSaveId];
const sourceV1PayloadPath = sourceSaveIndexBeforeRuntimeTurns.path;
const sourceV1PayloadBeforeRuntimeTurns = cloneJson(sourceStorageBeforeRuntimeTurns[sourceV1PayloadPath]);
const continuityPlannerCallsBeforePlayerTurns = generationRoleCount('continuityProjectionPlanner');
await assert.rejects(
  () => readCoreStoreProjectionsV2(host.storage, {
    campaignId: view.campaignState.campaign.id,
    saveId: sourceSaveId
  }),
  /not found/,
  'fresh active campaign should not rely on preexisting CORE/v2 projections before the first source-save player turn'
);

const colorMessage = host.chat.pushPlayerMessage({
  hostMessageId: 'runtime-player-color',
  text: '*I nod once to the operations officer.*'
});
const colorResult = await app.observeHostPlayerMessage({
  chatId: host.chat.getCurrentChatId(),
  message: colorMessage
});
assert.equal(colorResult.decision.classification, 'sceneColor');
assert.equal(colorResult.abortDefaultGeneration, false);
assert.equal(host.chat.messages().filter((entry) => entry.metadata?.responseKind === 'committedOutcome').length, 0);
const firstTurnCoreProjections = await readCoreStoreProjectionsV2(host.storage, {
  campaignId: view.campaignState.campaign.id,
  saveId: sourceSaveId
});
const firstTurnIngress = colorResult.campaignState.runtimeTracking.ingressLedger.find((entry) => entry.hostMessageId === 'runtime-player-color');
assert.ok(firstTurnIngress?.sourceFrameId, 'first source-save player turn must create old ingress with sourceFrameId compatibility projection');
assert.ok(firstTurnIngress?.coreTransactionId, 'first source-save player turn must create old ingress with CORE transaction id');
const firstTurnCoreIngress = firstTurnCoreProjections.ingressLedger.find((entry) => entry.hostMessageId === 'runtime-player-color');
assert.ok(firstTurnCoreIngress, 'first source-save player turn must bootstrap readable CORE/v2 ingress projection');
assert.equal(firstTurnCoreIngress.transactionId, firstTurnIngress.coreTransactionId, 'first source-save CORE transaction id must match old ingress projection');
assert.equal(firstTurnCoreIngress.sourceFrameId, firstTurnIngress.sourceFrameId, 'first source-save CORE source frame id must match old ingress projection');
assert.equal(firstTurnCoreIngress.chatId, view.chatNative.binding.chatId, 'first source-save CORE projection must use active chat id');
const firstTurnSourceStorage = host.storage.snapshot();
const firstTurnSourceSaveIndex = firstTurnSourceStorage[DIRECTIVE_STORAGE_PATHS.saveIndex].saves[sourceSaveId];
assert.equal(firstTurnSourceSaveIndex.runtimeStorageFormat, 'v2', 'first source-save player turn must mark runtime-current state as v2');
assert.equal(Boolean(firstTurnSourceSaveIndex.v2ManifestRef?.logicalKey), true, 'first source-save player turn must attach a v2 runtime manifest ref');
assert.deepEqual(
  firstTurnSourceStorage[sourceV1PayloadPath],
  sourceV1PayloadBeforeRuntimeTurns,
  'first source-save player turn must not rewrite the original v1 checkpoint payload'
);

const sceneNavigationMessage = host.chat.pushPlayerMessage({
  hostMessageId: 'runtime-player-scene-navigation',
  text: 'Continue the scene.'
});
const sceneNavigationResult = await app.observeHostPlayerMessage({
  chatId: host.chat.getCurrentChatId(),
  message: sceneNavigationMessage
});
assert.equal(sceneNavigationResult.decision.classification, 'sceneNavigation');
assert.equal(sceneNavigationResult.abortDefaultGeneration, false);
assert.equal(host.chat.messages().filter((entry) => entry.metadata?.responseKind === 'committedOutcome').length, 0);

view = await app.getCurrentView({ tabId: 'mission' });
const elapsedMinutesBeforeLocationTransition = view.campaignState.worldState?.elapsedMinutes ?? 0;
const locationTransitionMessage = host.chat.pushPlayerMessage({
  hostMessageId: 'runtime-player-location-transition',
  text: 'I head to Engineering.'
});
const locationTransitionResult = await app.observeHostPlayerMessage({
  chatId: host.chat.getCurrentChatId(),
  message: locationTransitionMessage
});
assert.equal(locationTransitionResult.decision.classification, 'locationTransition');
assert.equal(locationTransitionResult.responseStrategy, 'directivePosted');
assert.equal(locationTransitionResult.abortDefaultGeneration, true);
assert.equal(host.chat.messages().filter((entry) => entry.metadata?.responseKind === 'locationTransition').length, 1);
const locationTransitionResponse = host.chat.messages().find((entry) => entry.metadata?.responseKind === 'locationTransition');
assert.match(locationTransitionResponse.text, /Engineering/i);
assert.match(locationTransitionResponse.text, /threshold/i);
view = await app.getCurrentView({ tabId: 'mission' });
assert.equal(view.campaignState.worldState.elapsedMinutes, elapsedMinutesBeforeLocationTransition + 2);

view = await app.getCurrentView({ tabId: 'mission' });
const elapsedMinutesBeforeTimedScene = view.campaignState.worldState?.elapsedMinutes ?? 0;
const timeLedgerEntriesBeforeTimedScene = view.campaignState.timeLedger?.entries?.length || 0;
const timedSceneMessage = host.chat.pushPlayerMessage({
  hostMessageId: 'runtime-player-timed-scene',
  text: '*Serrin spends 10 minutes quietly scanning the bridge status board.*'
});
const timedSceneResult = await app.observeHostPlayerMessage({
  chatId: host.chat.getCurrentChatId(),
  message: timedSceneMessage
});
assert.equal(timedSceneResult.abortDefaultGeneration, false);
view = await app.getCurrentView({ tabId: 'mission' });
assert.equal(view.campaignState.worldState.elapsedMinutes, elapsedMinutesBeforeTimedScene + 10);
assert.equal(view.campaignState.timeLedger.elapsedMinutes, elapsedMinutesBeforeTimedScene + 10);
assert.equal(view.campaignState.timeLedger.entries.length, timeLedgerEntriesBeforeTimedScene + 1);
assert.equal(view.campaignState.timeLedger.entries.at(-1).sourceAnchorRange.kind, 'sceneContinuation');

const routineMessage = host.chat.pushPlayerMessage({
  hostMessageId: 'runtime-player-routine',
  text: 'Log the distress call, preserve the telemetry, and keep the Captain informed.'
});
const routineResult = await app.observeHostPlayerMessage({
  chatId: host.chat.getCurrentChatId(),
  message: routineMessage
});
assert.equal(routineResult.decision.classification, 'routineCommand');
assert.equal(routineResult.abortDefaultGeneration, false);

const consequentialMessage = host.chat.pushPlayerMessage({
  hostMessageId: 'runtime-player-consequential',
  text: 'I order helm to change course and pursue the freighter.'
});
let consequentialResult = await app.observeHostPlayerMessage({
  chatId: host.chat.getCurrentChatId(),
  message: consequentialMessage
});
assert.equal(['consequentialCommand', 'riskConfirmationNeeded', 'directorResponseNeeded'].includes(consequentialResult.decision.classification), true);
assert.equal(consequentialResult.abortDefaultGeneration, true);
if (consequentialResult.responseStrategy === 'pause') {
  view = await app.getCurrentView({ tabId: 'mission' });
  const pending = view.chatNative.pendingInteractions.find((entry) => entry.status === 'pending');
  assert.ok(pending, 'A paused consequential turn must expose a resolvable interaction.');
  consequentialResult = (await app.resolvePendingChatInteraction({
    interactionId: pending.id,
    action: pending.kind === 'riskConfirmationNeeded' ? 'confirm' : 'accept'
  })).result;
  assert.equal(consequentialResult.ok, true);
}

view = await app.getCurrentView({ tabId: 'mission' });
assert.equal(view.chatNative.tracking.ingressCount, 6);
assert.equal(view.chatNative.tracking.responseCount >= 6, true);
assert.equal(view.chatNative.tracking.modelCallCount > 0, true);
assert.equal(view.chatNative.modelCalls.some((entry) => entry.roleId === 'utilityTurnClassifier'), true);
assert.equal(JSON.stringify(view.chatNative.modelCalls).includes('change course and pursue'), false, 'Model-call journal must not store raw player text.');
assert.ok(view.chatNative.tracking.lastCommittedTurn?.outcomeId);
assert.equal(view.chatNative.tracking.lastCommittedTurn.narrationStatus, 'complete');
assert.equal(view.chatNative.tracking.lastCommittedTurn.responseStatus, 'complete');
assert.equal(host.chat.messages().filter((entry) => entry.metadata?.responseKind === 'committedOutcome').length, 1);
assert.equal(view.campaignState.commandLog.entries.some((entry) => entry.type === 'routineCommand'), true);
assert.equal(view.campaignState.turnLedger.entries.length >= 1, true);
assert.equal(view.chatNative.binding.promptContextRevision > 1, true);
assert.equal(
  generationRoleCount('continuityProjectionPlanner'),
  continuityPlannerCallsBeforePlayerTurns,
  'Player-turn prompt synchronization must not invoke the blocking continuity planner.'
);
view = (await app.flushRuntimeDiagnostics()).view;
const sourceStorageAfterRuntimeTurns = host.storage.snapshot();
const sourceSaveIndexAfterRuntimeTurns = sourceStorageAfterRuntimeTurns[DIRECTIVE_STORAGE_PATHS.saveIndex].saves[sourceSaveId];
assert.equal(sourceSaveIndexAfterRuntimeTurns.path, sourceV1PayloadPath, 'Queued runtime persistence must preserve the v1 checkpoint payload path.');
assert.equal(sourceSaveIndexAfterRuntimeTurns.runtimeStorageFormat, 'v2', 'Queued runtime persistence must mark runtime-current state as v2.');
assert.equal(Boolean(sourceSaveIndexAfterRuntimeTurns.v2ManifestRef?.logicalKey), true, 'Queued runtime persistence must attach a v2 runtime manifest ref.');
assert.equal(Boolean(sourceSaveIndexAfterRuntimeTurns.v2RuntimePersistedAt), true, 'Queued runtime persistence must attach a v2 runtime persistence timestamp.');
assert.deepEqual(
  sourceStorageAfterRuntimeTurns[sourceV1PayloadPath],
  sourceV1PayloadBeforeRuntimeTurns,
  'Queued runtime persistence must not rewrite the v1 manual checkpoint payload.'
);
const activeRuntimeHeadBeforeReload = await loadV2MaterializedHead(host.storage, {
  campaignId: view.campaignState.campaign.id,
  saveId: sourceSaveId
});
assert.equal(activeRuntimeHeadBeforeReload.source, 'active-save-facade-v2', 'Queued runtime persistence must write the active-save v2 head.');
assert.equal(activeRuntimeHeadBeforeReload.state.runtimeTracking, undefined, 'Active-save v2 head must omit heavyweight runtimeTracking journals.');
assert.equal(activeRuntimeHeadBeforeReload.state.turnLedger, undefined, 'Active-save v2 head must omit heavyweight turn ledger entries.');
assert.equal(activeRuntimeHeadBeforeReload.runtimeSummary.ingressCount, view.chatNative.tracking.ingressCount, 'Active-save v2 head must keep compact runtime ingress counts.');
assert.equal(activeRuntimeHeadBeforeReload.runtimeSummary.responseCount, view.chatNative.tracking.responseCount, 'Active-save v2 head must keep compact runtime response counts.');
assert.equal(activeRuntimeHeadBeforeReload.state.campaign.currentStardate, view.campaignState.campaign.currentStardate, 'Active-save v2 head must reflect runtime-current campaign state.');

const runtimeHistoryLimitUpdate = await app.updateRuntimeHistoryLimit({ historyLimit: 3 });
assert.equal(runtimeHistoryLimitUpdate.kind, 'directive.runtimeHistoryLimitUpdated');
assert.equal(runtimeHistoryLimitUpdate.historyLimit, 3);
assert.equal(runtimeHistoryLimitUpdate.save.kind, 'directive.activeCampaignStatePersist.v2', 'Runtime history setting updates must use v2 runtime persistence.');
assert.equal(runtimeHistoryLimitUpdate.save.storageFormat, 'v2');
assert.equal(runtimeHistoryLimitUpdate.save.wroteV1Payload, false, 'Runtime history setting updates must not rewrite the v1 checkpoint payload.');
let sourceStorageAfterRuntimeSettings = host.storage.snapshot();
let sourceSaveIndexAfterRuntimeSettings = sourceStorageAfterRuntimeSettings[DIRECTIVE_STORAGE_PATHS.saveIndex].saves[sourceSaveId];
assert.equal(sourceSaveIndexAfterRuntimeSettings.path, sourceV1PayloadPath, 'Runtime history setting update must preserve the v1 checkpoint payload path.');
assert.equal(sourceSaveIndexAfterRuntimeSettings.runtimeStorageFormat, 'v2', 'Runtime history setting update must keep the runtime-current v2 marker.');
assert.equal(Boolean(sourceSaveIndexAfterRuntimeSettings.v2ManifestRef?.logicalKey), true, 'Runtime history setting update must attach a v2 runtime manifest ref.');
assert.equal(Boolean(sourceSaveIndexAfterRuntimeSettings.v2RuntimePersistedAt), true, 'Runtime history setting update must keep the v2 runtime persistence timestamp.');
assert.deepEqual(
  sourceStorageAfterRuntimeSettings[sourceV1PayloadPath],
  sourceV1PayloadBeforeRuntimeTurns,
  'Runtime history setting update must not rewrite the v1 manual checkpoint payload.'
);
view = await app.getCurrentView({ tabId: 'settings' });
assert.equal(view.campaignState.settings.maxTurnSaveHistory, 3);

const runtimeSettingsUpdate = await app.updateRuntimeSettings({
  historyLimit: 4,
  autosaveEveryMessages: 7,
  outcomeIntegrity: {
    mode: 'strict',
    reviewProviderKind: 'utility'
  }
});
assert.equal(runtimeSettingsUpdate.kind, 'directive.runtimeSettingsUpdated');
assert.equal(runtimeSettingsUpdate.historyLimit, 4);
assert.equal(runtimeSettingsUpdate.autosaveEveryMessages, 7);
assert.equal(runtimeSettingsUpdate.outcomeIntegrity.mode, 'strict');
assert.equal(runtimeSettingsUpdate.save.kind, 'directive.activeCampaignStatePersist.v2', 'Runtime settings update must use v2 runtime persistence.');
assert.equal(runtimeSettingsUpdate.save.storageFormat, 'v2');
assert.equal(runtimeSettingsUpdate.save.wroteV1Payload, false, 'Runtime settings update must not rewrite the v1 checkpoint payload.');
sourceStorageAfterRuntimeSettings = host.storage.snapshot();
sourceSaveIndexAfterRuntimeSettings = sourceStorageAfterRuntimeSettings[DIRECTIVE_STORAGE_PATHS.saveIndex].saves[sourceSaveId];
assert.equal(sourceSaveIndexAfterRuntimeSettings.path, sourceV1PayloadPath, 'Runtime settings update must preserve the v1 checkpoint payload path.');
assert.equal(sourceSaveIndexAfterRuntimeSettings.runtimeStorageFormat, 'v2', 'Runtime settings update must keep the runtime-current v2 marker.');
assert.equal(Boolean(sourceSaveIndexAfterRuntimeSettings.v2ManifestRef?.logicalKey), true, 'Runtime settings update must attach a v2 runtime manifest ref.');
assert.equal(Boolean(sourceSaveIndexAfterRuntimeSettings.v2RuntimePersistedAt), true, 'Runtime settings update must keep the v2 runtime persistence timestamp.');
assert.deepEqual(
  sourceStorageAfterRuntimeSettings[sourceV1PayloadPath],
  sourceV1PayloadBeforeRuntimeTurns,
  'Runtime settings update must not rewrite the v1 manual checkpoint payload.'
);
view = await app.getCurrentView({ tabId: 'mission' });
assert.equal(view.campaignState.settings.maxTurnSaveHistory, 4);
assert.equal(view.campaignState.settings.autosaveEveryMessages, 7);
assert.equal(view.campaignState.settings.outcomeIntegrity.mode, 'strict');
const activeRuntimeHeadAfterSettings = await loadV2MaterializedHead(host.storage, {
  campaignId: view.campaignState.campaign.id,
  saveId: sourceSaveId
});
assert.equal(activeRuntimeHeadAfterSettings.state.settings.maxTurnSaveHistory, 4, 'Active-save v2 head must reflect runtime-current settings.');
assert.equal(activeRuntimeHeadAfterSettings.state.settings.autosaveEveryMessages, 7, 'Active-save v2 head must reflect runtime-current autosave settings.');
assert.equal(activeRuntimeHeadAfterSettings.state.settings.outcomeIntegrity.mode, 'strict', 'Active-save v2 head must reflect runtime-current Outcome Integrity settings.');
const coreProjectionsBeforeReload = await readCoreStoreProjectionsV2(host.storage, {
  campaignId: view.campaignState.campaign.id,
  saveId: view.activeSaveId
});
assert.equal(coreProjectionsBeforeReload.ingressLedger.length, view.chatNative.tracking.ingressCount, 'Production chat turns should persist CORE ingress projections for the active save.');
assert.equal(coreProjectionsBeforeReload.ingressLedger.some((entry) => entry.hostMessageId === 'runtime-player-consequential'), true);
assert.equal(coreProjectionsBeforeReload.ingressLedger.some((entry) => entry.hostMessageId === 'runtime-player-branch-color'), false, 'Source save CORE projections must not include branch-save turns.');
assert.equal(Boolean(coreProjectionsBeforeReload.sceneSealRevision), true, 'Production CORE projections must expose scene-seal revision evidence before reload.');
assert.equal(Boolean(coreProjectionsBeforeReload.pressureArcDigestRevision), true, 'Production CORE projections must expose pressure/arc digest revision evidence before reload.');
const promptRebuildWithCoreRevisions = await app.rebuildPromptContext();
const latestPromptSyncBeforeReload = host.prompt.calls().filter((entry) => entry.type === 'sync').at(-1);
const latestPromptCacheInputsBeforeReload = latestPromptSyncBeforeReload?.options?.packet?.cacheInputs || latestPromptSyncBeforeReload?.options?.cacheInputs || {};
assert.equal(promptRebuildWithCoreRevisions.ok, true);
assert.equal(
  latestPromptCacheInputsBeforeReload.sceneSealRevision,
  coreProjectionsBeforeReload.sceneSealRevision,
  'Runtime prompt sync must await CORE projections and include scene-seal revision cache input.'
);
assert.equal(
  latestPromptCacheInputsBeforeReload.pressureArcDigestRevision,
  coreProjectionsBeforeReload.pressureArcDigestRevision,
  'Runtime prompt sync must await CORE projections and include pressure/arc digest revision cache input.'
);
assert.ok(
  coreProjectionsBeforeReload.modelCallDiagnostics.some((entry) => (
    entry.roleId === 'utilityTurnClassifier'
    && entry.hostMessageId === 'runtime-player-consequential'
    && entry.requestHash
  )),
  'Production chat turns should mirror redacted model-call diagnostics into CORE diagnostics.'
);
assertCoreHostContinueBridge({
  projections: coreProjectionsBeforeReload,
  state: view.campaignState,
  hostMessageId: 'runtime-player-color',
  chatId: sourceChatId,
  label: 'source scene-color turn'
});
assertCoreHostContinueBridge({
  projections: coreProjectionsBeforeReload,
  state: view.campaignState,
  hostMessageId: 'runtime-player-scene-navigation',
  chatId: sourceChatId,
  label: 'source scene-navigation turn'
});
assertCoreDirectivePostedBridge({
  projections: coreProjectionsBeforeReload,
  state: view.campaignState,
  hostMessageId: 'runtime-player-consequential',
  chatId: sourceChatId,
  label: 'source consequential turn'
});
assertCoreMechanicsProjection({
  projections: coreProjectionsBeforeReload,
  state: view.campaignState,
  hostMessageId: 'runtime-player-consequential',
  label: 'source consequential turn'
});
const coreHeadBeforeReload = await loadV2MaterializedHead(host.storage, {
  campaignId: view.campaignState.campaign.id,
  saveId: view.activeSaveId,
  layout: 'core'
});
const coreStateBeforeReload = await loadCoreStoreStateV2(host.storage, {
  campaignId: view.campaignState.campaign.id,
  saveId: view.activeSaveId
});
assert.equal(coreStateBeforeReload.counters.transactions >= view.chatNative.tracking.ingressCount, true);
assert.equal(
  coreHeadBeforeReload.coreStore.counters.transactions <= coreStateBeforeReload.counters.transactions,
  true,
  'CORE materialized head may lag append-only event authority before reload'
);

const committedResponse = host.chat.messages().find((entry) => entry.metadata?.responseKind === 'committedOutcome');
const editContext = await app.prepareOutcomeIntegrityEdit({
  message: { hostMessageId: committedResponse.hostMessageId }
});
assert.equal(editContext.ok, true);
assert.equal(editContext.mode, 'strict');
assert.equal(editContext.reviewProviderKind, 'utility');
const editedText = 'The bridge answers in sequence. Helm changes course to pursue the freighter while Operations records the command.';
const editResult = await app.submitOutcomeIntegrityEdit({
  hostMessageId: committedResponse.hostMessageId,
  baseTextHash: editContext.baseTextHash,
  proposedText: editedText
});
assert.equal(editResult.accepted, true);
assert.equal(editResult.revision.reviewProviderKind, 'utility');
const editedResponse = host.chat.getMessage(committedResponse.hostMessageId);
assert.equal(editedResponse.text.endsWith(editedText), true);
assert.equal(editedResponse.swipes.length, 2);
assert.equal(editedResponse.metadata.selectedOutcomeIntegrityRevisionId, editResult.revision.id);
view = await app.getCurrentView({ tabId: 'mission' });
const editedResponseEntry = view.campaignState.runtimeTracking.responseLedger.find((entry) => entry.hostMessageId === committedResponse.hostMessageId);
assert.equal(editedResponseEntry.outcomeId, editContext.lockedContext.outcomeId);
assert.equal(editedResponseEntry.outcomeIntegrity.selectedRevisionId, editResult.revision.id);

const duplicate = await app.observeHostPlayerMessage({
  chatId: host.chat.getCurrentChatId(),
  message: consequentialMessage
});
assert.equal(duplicate.deduplicated, true);
assert.equal(host.chat.messages().filter((entry) => entry.metadata?.responseKind === 'committedOutcome').length, 1);

const coreBackedOutcomeId = view.chatNative.tracking.lastCommittedTurn.outcomeId;
const coreBackedLedgerEntry = view.campaignState.turnLedger.entries.find((entry) => entry.outcomeId === coreBackedOutcomeId);
assert.ok(coreBackedLedgerEntry?.coreTransactionId, 'CORE-backed committed outcome must carry original transaction id before rerun preview.');
const coreBackedRerunPreview = await app.previewOutcomeReplacement({
  outcomeId: coreBackedOutcomeId,
  turnId: 'turn.chat-native.core-rerun-preview',
  playerInput: 'I countermand the pursuit and order the Breckenridge to hold position until we have corroborating sensor evidence.'
});
assert.equal(
  JSON.stringify(coreBackedRerunPreview).includes('countermand the pursuit'),
  false,
  'CORE-backed rerun preview payload must not expose raw replacement player prose.'
);
assert.equal(
  JSON.stringify(coreBackedRerunPreview.view.pendingDirectorTurn || {}).includes('countermand the pursuit'),
  false,
  'CORE-backed rerun preview view must not expose raw replacement player prose in pendingDirectorTurn.'
);
const pendingCoreBackedReplacement = coreBackedRerunPreview.pendingOutcomeReplacement;
assert.equal(pendingCoreBackedReplacement.repairDecision.action, 'createRerunBranchCandidate');
assert.equal(pendingCoreBackedReplacement.repairDecision.replacedTransactionId, coreBackedLedgerEntry.coreTransactionId);
assert.ok(pendingCoreBackedReplacement.replacementCandidateId, 'CORE-backed rerun preview must allocate a compact replacement candidate id.');
assert.ok(pendingCoreBackedReplacement.replacementInputHash, 'CORE-backed rerun preview must retain only a replacement input hash.');
assert.equal(pendingCoreBackedReplacement.replacementTransactionId, undefined, 'CORE-backed rerun preview must not durably begin a replacement transaction before commit.');
assert.equal(pendingCoreBackedReplacement.repairDecision.transactionId, null);
assert.equal(pendingCoreBackedReplacement.repairDecision.replacementTransactionRequired, true);
const coreProjectionsAfterRerunPreview = await readCoreStoreProjectionsV2(host.storage, {
  campaignId: view.campaignState.campaign.id,
  saveId: view.activeSaveId
});
assert.equal(
  JSON.stringify(coreProjectionsAfterRerunPreview).includes('countermand the pursuit'),
  false,
  'CORE-backed rerun preview must not leak raw replacement player prose into CORE projections.'
);
assert.equal(
  coreProjectionsAfterRerunPreview.ingressLedger.length,
  coreProjectionsBeforeReload.ingressLedger.length,
  'CORE-backed rerun preview must not add durable CORE ingress before commit.'
);
const coreBackedRerunCommit = await app.commitProvisionalDirectorTurn({
  generateNarration: false,
  generateCommandLogSummary: false
});
const replacementTransactionId = coreBackedRerunCommit.mechanicsCheckpoint.coreMechanics.transactionId;
assert.ok(replacementTransactionId, 'CORE-backed rerun commit must create a fresh replacement transaction.');
assert.notEqual(replacementTransactionId, coreBackedLedgerEntry.coreTransactionId);
assert.equal(coreBackedRerunCommit.mechanicsCheckpoint.coreOutcomeReplacement.replacedTransactionId, coreBackedLedgerEntry.coreTransactionId);
assert.equal(coreBackedRerunCommit.mechanicsCheckpoint.coreOutcomeReplacement.replacementTransactionId, replacementTransactionId);
const coreProjectionsAfterRerunCommit = await readCoreStoreProjectionsV2(host.storage, {
  campaignId: view.campaignState.campaign.id,
  saveId: view.activeSaveId
});
assert.ok(
  coreProjectionsAfterRerunCommit.ingressLedger.some((entry) => entry.transactionId === replacementTransactionId),
  'CORE-backed rerun commit must persist the fresh replacement transaction projection.'
);
const coreReplacementHistory = coreProjectionsAfterRerunCommit.turnLedger.replacementHistory.at(-1);
assert.equal(coreReplacementHistory.replacedTransactionId, coreBackedLedgerEntry.coreTransactionId);
assert.equal(coreReplacementHistory.replacementTransactionId, replacementTransactionId);
assert.equal(
  JSON.stringify(coreBackedRerunCommit).includes('countermand the pursuit'),
  false,
  'CORE-backed rerun commit result must not expose raw replacement player prose.'
);
assert.equal(
  JSON.stringify(coreProjectionsAfterRerunCommit).includes('countermand the pursuit'),
  false,
  'CORE-backed rerun commit must not leak raw replacement player prose into CORE projections.'
);

const failedRerunPreview = await app.previewOutcomeReplacement({
  outcomeId: coreBackedRerunCommit.turnPacket.outcomePacket.id,
  turnId: 'turn.chat-native.core-rerun-failure',
  playerInput: 'I revise the replacement order and force a storage failure after the replacement transaction opens.'
});
const failedReplacementTransactionId = `txn:frame:${failedRerunPreview.pendingOutcomeReplacement.replacementCandidateId}`;
const originalWriteJson = host.storage.writeJson.bind(host.storage);
let injectedCoreEventWrites = 0;
host.storage.writeJson = async (filePath, value) => {
  if (String(filePath).includes('/core/events/')) {
    injectedCoreEventWrites += 1;
    if (injectedCoreEventWrites === 2) {
      throw new Error('Injected rerun mechanics append failure');
    }
  }
  return originalWriteJson(filePath, value);
};
try {
  await assert.rejects(
    () => app.commitProvisionalDirectorTurn({
      generateNarration: false,
      generateCommandLogSummary: false
    }),
    /Injected rerun mechanics append failure/
  );
} finally {
  host.storage.writeJson = originalWriteJson;
}
const failedRerunProjections = await readCoreStoreProjectionsV2(host.storage, {
  campaignId: view.campaignState.campaign.id,
  saveId: view.activeSaveId
});
const failedRerunRecovery = failedRerunProjections.recoveryJournal.find((entry) => entry.transactionId === failedReplacementTransactionId);
assert.equal(failedRerunRecovery?.reason, 'outcome-rerun-checkpoint-failed');
assert.equal(
  JSON.stringify(failedRerunProjections).includes('I revise the replacement order'),
  false,
  'Failed CORE-backed rerun recovery projection must not leak raw replacement player prose.'
);
await app.discardProvisionalDirectorTurn();

const reloadedApp = createDirectiveRuntimeApp({
  host,
  packageLoader: loadChatNativeAssets,
  idFactory(prefix) {
    idSequence += 1;
    return `${prefix}-chat-native-reloaded-${idSequence}`;
  },
  now() {
    const value = new Date(clock).toISOString();
    clock += 1000;
    return value;
  }
});
await reloadedApp.initialize();
await reloadedApp.openCampaignChat({ saveId: view.activeSaveId });
const continuityPlannerCallsBeforeReloadedTurn = generationRoleCount('continuityProjectionPlanner');
const generationCallCountBeforeReloadedTurn = host.generation.calls().length;
const reloadedMessage = host.chat.pushPlayerMessage({
  hostMessageId: 'runtime-player-after-reload',
  text: 'Serrin keeps the ship at measured readiness and orders the relay margin logged before the next step.'
});
const reloadedResult = await reloadedApp.observeHostPlayerMessage({
  chatId: host.chat.getCurrentChatId(),
  message: reloadedMessage
});
assert.equal(reloadedResult.abortDefaultGeneration, true);
const reloadedRolesBeforeFlush = host.generation.calls()
  .slice(generationCallCountBeforeReloadedTurn)
  .map((entry) => entry.role);
const narrationIndexBeforeFlush = reloadedRolesBeforeFlush.indexOf('narration');
const commandLogIndexBeforeFlush = reloadedRolesBeforeFlush.indexOf('commandLogSummarizer');
assert.equal(narrationIndexBeforeFlush >= 0, true, 'Directive committed turn must start narration before returning from observeHostPlayerMessage.');
if (commandLogIndexBeforeFlush >= 0) {
  assert.equal(narrationIndexBeforeFlush < commandLogIndexBeforeFlush, true, 'Command Log summary must not start before narration.');
}
const reloadedCounselStartedPromise = new Promise((resolve) => {
  heldAdvisoryStarted = (metadata) => resolve(cloneJson(metadata || null));
});
const reloadedCounselContinuationsBefore = hostGenerationContinuations.length;
const reloadedCounselAdvisorCallsBefore = generationRoleCount('missionDirectorAdvisor');
const reloadedCounselMessage = host.chat.pushPlayerMessage({
  hostMessageId: 'runtime-player-advisory-after-reload',
  text: 'What are our options here?'
});
const reloadedCounselResult = await reloadedApp.observeHostPlayerMessage({
  chatId: host.chat.getCurrentChatId(),
  message: reloadedCounselMessage
});
assert.equal(reloadedCounselResult.decision.classification, 'counselRequest');
assert.equal(reloadedCounselResult.responseStrategy, 'injectAndContinue');
assert.equal(reloadedCounselResult.abortDefaultGeneration, false);
assert.equal(hostGenerationContinuations.length, reloadedCounselContinuationsBefore + 1, 'Counsel should release host generation before advisory enrichment completes.');
assert.equal(reloadedCounselResult.advisory.subject, 'Decision support advisory');
assert.equal(reloadedCounselResult.advisory.options.length, 0);
assert.equal(reloadedCounselResult.advisoryEnrichment.status, 'queued');
assert.equal(reloadedCounselResult.advisoryEnrichment.advisoryId, reloadedCounselResult.advisory.id);
const reloadedCounselMetadata = await reloadedCounselStartedPromise;
heldAdvisoryStarted = null;
assert.equal(generationRoleCount('missionDirectorAdvisor'), reloadedCounselAdvisorCallsBefore + 1);
assert.equal(reloadedCounselMetadata.coreDiagnosticTarget, 'advisoryEnrichment');
assert.equal(reloadedCounselMetadata.ingressId, reloadedCounselResult.advisory.sourceIngressId);
assert.equal(reloadedCounselMetadata.advisoryId, reloadedCounselResult.advisory.id);
assert.equal(Boolean(reloadedCounselMetadata.playerTextHash), true);
assert.equal(Boolean(reloadedCounselMetadata.fallbackAdvisoryHash), true);
assert.equal(JSON.stringify(reloadedCounselMetadata).includes('What are our options here'), false, 'Advisory model-call metadata must not store raw player text.');
assert.equal(typeof heldAdvisoryResolve, 'function', 'Advisory provider should remain unresolved until the test releases it.');
heldAdvisoryResolve();
const flushedSidecars = await reloadedApp.flushChatSidecars();
assert.equal(flushedSidecars.ok, true);
assert.equal(typeof flushedSidecars.hostGenerationReobserveResult?.skipped, 'boolean', 'Sidecar flush reports host-generation reobserve status for live CORE completion proof.');
assert.equal(flushedSidecars.commandLogSummaryResult.ok, true);
assert.equal(flushedSidecars.postCommitConversationResult.ok, true);
assert.equal(flushedSidecars.postCommitConversationResult.scheduled, true);
assert.equal(flushedSidecars.postCommitConversationResult.status, 'applied');
assert.equal(flushedSidecars.advisoryEnrichmentResult.ok, true);
assert.equal(flushedSidecars.advisoryEnrichmentResult.applied, true);
assert.equal(flushedSidecars.advisoryEnrichmentResult.advisoryId, reloadedCounselResult.advisory.id);
assert.equal(Number.isFinite(flushedSidecars.sidecarCountAfter), true);
assert.equal(Number.isFinite(flushedSidecars.coreSidecarDiagnosticDelta), true, 'Sidecar flush reporting should include CORE diagnostic delta.');
assert.equal(
  flushedSidecars.coreSidecarDiagnosticsAfter >= (flushedSidecars.results || []).length,
  true,
  'Sidecar flush reporting must expose CORE diagnostics instead of old sidecarJournal growth.'
);
assert.equal(
  flushedSidecars.sidecarJournalCountAfter < flushedSidecars.coreSidecarDiagnosticsAfter,
  true,
  'This fixture must keep old sidecarJournal growth below CORE sidecar progress so chat-native tracking cannot pass through the legacy count alone.'
);
assert.equal(
  flushedSidecars.sidecarCountAfter >= flushedSidecars.coreSidecarDiagnosticsAfter,
  true,
  'Sidecar flush sidecarCountAfter must report compact CORE sidecar progress, not the legacy sidecarJournal count.'
);
assert.equal(
  flushedSidecars.sidecarDelta >= (flushedSidecars.results || []).length,
  true,
  'Sidecar flush delta should remain meaningful after accepted sidecars stop writing old v1 journals.'
);
await reloadedApp.flushRuntimeDiagnostics();
const activeRuntimeHeadAfterSidecarFlush = await loadV2MaterializedHead(host.storage, {
  campaignId: view.campaignState.campaign.id,
  saveId: sourceSaveId
});
assert.equal(
  activeRuntimeHeadAfterSidecarFlush.state.directiveRuntimeEvidence,
  undefined,
  'Active-save v2 head must not persist transient CORE read-projection evidence after sidecar flush.'
);
assert.equal(
  activeRuntimeHeadAfterSidecarFlush.runtimeSummary.sidecarCount >= flushedSidecars.coreSidecarDiagnosticsAfter,
  true,
  'Active-save v2 runtime summary must count CORE sidecar diagnostics, not only old sidecarJournal rows.'
);
assert.equal(
  activeRuntimeHeadAfterSidecarFlush.state.runtimeResume.sidecarCount >= flushedSidecars.coreSidecarDiagnosticsAfter,
  true,
  'Active-save v2 runtime resume cursor must count CORE sidecar diagnostics for reload metadata.'
);
view = await reloadedApp.getCurrentView({ tabId: 'mission' });
assert.equal(
  view.chatNative.tracking.sidecarCount >= flushedSidecars.coreSidecarDiagnosticsAfter,
  true,
  'Chat-native tracking sidecarCount must use CORE sidecar progress after flush, not only old sidecarJournal rows.'
);
const reloadedRolesAfterFlush = host.generation.calls()
  .slice(generationCallCountBeforeReloadedTurn)
  .map((entry) => entry.role);
const narrationIndexAfterFlush = reloadedRolesAfterFlush.indexOf('narration');
const commandLogIndexAfterFlush = reloadedRolesAfterFlush.indexOf('commandLogSummarizer');
assert.equal(commandLogIndexAfterFlush >= 0, true, 'Flushing sidecars must settle the queued Command Log summary.');
assert.equal(narrationIndexAfterFlush < commandLogIndexAfterFlush, true, 'Queued Command Log summary must run after narration starts.');
assert.equal(
  view.campaignState.commandLog.entries.some((entry) => entry.assistedSummary?.status === 'complete'),
  true,
  'Queued Command Log summary should apply to the current Command Log entry after flush.'
);
const enrichedAdvisory = view.campaignState.commandCompetence.counselRequestLedger.find((entry) => entry.id === reloadedCounselResult.advisory.id);
assert.ok(enrichedAdvisory, 'Advisory enrichment should keep the deterministic advisory id.');
assert.equal(enrichedAdvisory.subject, 'Bridge arrival options');
assert.equal(enrichedAdvisory.options.length, 2);
assert.equal(
  generationRoleCount('continuityProjectionPlanner'),
  continuityPlannerCallsBeforeReloadedTurn,
  'Reloaded player-turn prompt synchronization must not invoke the blocking continuity planner.'
);
assert.equal(host.chat.messages().filter((entry) => entry.metadata?.responseKind === 'committedOutcome').length, 2);
const coreProjectionsAfterReload = await readCoreStoreProjectionsV2(host.storage, {
  campaignId: view.campaignState.campaign.id,
  saveId: view.activeSaveId
});
assert.equal(coreProjectionsAfterReload.ingressLedger.length > coreProjectionsBeforeReload.ingressLedger.length, true, 'Reloaded runtime must hydrate CORE Store instead of overwriting prior CORE projections.');
assert.equal(coreProjectionsAfterReload.ingressLedger.some((entry) => entry.hostMessageId === 'runtime-player-after-reload'), true);
assert.equal(coreProjectionsAfterReload.ingressLedger.some((entry) => entry.hostMessageId === 'runtime-player-consequential'), true);
const reloadedIngressAfterFlush = view.campaignState.runtimeTracking.ingressLedger.find((entry) => entry.hostMessageId === 'runtime-player-after-reload');
assert.ok(reloadedIngressAfterFlush?.coreTransactionId, 'Reloaded committed turn must retain CORE transaction id for sidecar diagnostics.');
const reloadedCounselIngressAfterFlush = view.campaignState.runtimeTracking.ingressLedger.find((entry) => entry.hostMessageId === 'runtime-player-advisory-after-reload');
assert.ok(reloadedCounselIngressAfterFlush?.coreTransactionId, 'Reloaded counsel turn must retain CORE transaction id for advisory diagnostics.');
const reloadedCounselCoreIngress = coreProjectionsAfterReload.ingressLedger.find((entry) => entry.hostMessageId === 'runtime-player-advisory-after-reload');
assert.ok(reloadedCounselCoreIngress, 'Reloaded counsel advisory turn: CORE ingress projection exists.');
assert.equal(reloadedCounselCoreIngress.transactionId, reloadedCounselIngressAfterFlush.coreTransactionId, 'Reloaded counsel advisory turn: CORE transaction id matches old ingress.');
assert.equal(reloadedCounselCoreIngress.sourceFrameId, reloadedCounselIngressAfterFlush.sourceFrameId, 'Reloaded counsel advisory turn: CORE source frame id matches old ingress.');
assert.equal(reloadedCounselCoreIngress.chatId, sourceChatId, 'Reloaded counsel advisory turn: CORE projection uses active chat id.');
assert.equal(reloadedCounselCoreIngress.route, 'hostContinue', 'Reloaded counsel advisory turn: CORE projection route stays hostContinue.');
assert.equal(reloadedCounselCoreIngress.status, 'complete', 'Reloaded counsel advisory turn: background advisory settlement completes the CORE projection after host release.');
const reloadedCounselResponse = view.campaignState.runtimeTracking.responseLedger.find((entry) => entry.ingressId === reloadedCounselIngressAfterFlush.id);
assert.ok(reloadedCounselResponse, 'Reloaded counsel advisory turn: old response ledger exists.');
assert.equal(reloadedCounselResponse.responseKind, 'hostGeneration', 'Reloaded counsel advisory turn: response kind is host generation.');
assert.equal(reloadedCounselResponse.hostGenerationReleaseMode, 'nonblocking', 'Reloaded counsel advisory turn: response ledger records nonblocking release mode.');
assert.equal(reloadedCounselResponse.coreRelease?.phase, 'hostContinueReleased', 'Reloaded counsel advisory turn: response ledger preserves hostContinue release evidence.');
const advisoryModelCallDiagnostics = coreProjectionsAfterReload.modelCallDiagnostics.filter((entry) => (
  entry.roleId === 'missionDirectorAdvisor'
  && entry.ingressId === reloadedCounselIngressAfterFlush.id
));
assert.equal(advisoryModelCallDiagnostics.length >= 1, true, 'Delayed advisory model-call diagnostics must attach to the original CORE transaction.');
assert.equal(advisoryModelCallDiagnostics.every((entry) => entry.hostMessageId === 'runtime-player-advisory-after-reload'), true, 'Advisory model-call diagnostics must stay attached to the counsel source row.');
assert.equal(advisoryModelCallDiagnostics.every((entry) => entry.sourceFrameId === reloadedCounselIngressAfterFlush.sourceFrameId), true, 'Advisory model-call diagnostics must retain source frame id.');
assert.equal(advisoryModelCallDiagnostics.every((entry) => entry.requestHash), true, 'Advisory model-call diagnostics must store request hash only.');
assert.equal(JSON.stringify(advisoryModelCallDiagnostics).includes('What are our options here'), false, 'Advisory model-call diagnostics must not store raw player text.');
assert.equal(JSON.stringify(advisoryModelCallDiagnostics).includes('Bridge arrival options'), false, 'Advisory model-call diagnostics must not store raw provider output.');
const advisoryCoreDiagnostics = coreProjectionsAfterReload.sidecarDiagnostics.filter((entry) => (
  entry.worker === 'missionDirectorAdvisor'
  && entry.ingressId === reloadedCounselIngressAfterFlush.id
));
assert.equal(advisoryCoreDiagnostics.length >= 2, true, 'CORE diagnostics must include queued/applied advisory enrichment entries.');
assert.equal(advisoryCoreDiagnostics.every((entry) => entry.sidecarType === 'advisoryEnrichment'), true, 'Advisory diagnostics must use the advisoryEnrichment sidecar type.');
assert.equal(advisoryCoreDiagnostics.every((entry) => entry.hostMessageId === 'runtime-player-advisory-after-reload'), true, 'Advisory diagnostics must stay attached to the counsel host row.');
assert.equal(advisoryCoreDiagnostics.some((entry) => entry.status === 'queued'), true, 'CORE diagnostics must record queued advisory enrichment work.');
assert.equal(advisoryCoreDiagnostics.some((entry) => entry.status === 'applied'), true, 'CORE diagnostics must record applied advisory enrichment work.');
assert.equal(advisoryCoreDiagnostics.every((entry) => entry.playerTextHash), true, 'Advisory diagnostics must store player text hashes, not text.');
assert.equal(advisoryCoreDiagnostics.every((entry) => entry.fallbackAdvisoryHash), true, 'Advisory diagnostics must store fallback advisory hashes.');
assert.equal(JSON.stringify(advisoryCoreDiagnostics).includes('What are our options here'), false, 'Advisory CORE diagnostics must not store raw player text.');
assert.equal(JSON.stringify(advisoryCoreDiagnostics).includes('Bridge arrival options'), false, 'Advisory CORE diagnostics must not store raw enriched advisory text.');
const advisoryBackgroundBatches = coreProjectionsAfterReload.backgroundBatches.filter((entry) => (
  entry.transactionId === reloadedCounselIngressAfterFlush.coreTransactionId
  && String(entry.batchId || '').startsWith('advisory-enrichment:')
));
assert.equal(advisoryBackgroundBatches.length, 1, 'Advisory enrichment must settle through a CORE background batch.');
assert.equal(advisoryBackgroundBatches[0].operationCount, 0, 'Advisory enrichment records effect refs, not mechanics operations.');
assert.equal(advisoryBackgroundBatches[0].workerCount, 1, 'Advisory enrichment background settlement must identify one worker.');
const commandLogSummaryCoreDiagnostics = coreProjectionsAfterReload.sidecarDiagnostics.filter((entry) => (
  entry.worker === 'commandLogSummary'
  && entry.ingressId === reloadedIngressAfterFlush.id
));
assert.equal(commandLogSummaryCoreDiagnostics.length >= 2, true, 'CORE diagnostics must include queued and final Command Log summary entries.');
assert.equal(commandLogSummaryCoreDiagnostics.every((entry) => entry.sidecarType === 'commandLogSummary'), true, 'Command Log summary diagnostics must use the commandLogSummary sidecar type.');
assert.equal(commandLogSummaryCoreDiagnostics.every((entry) => entry.hostMessageId === 'runtime-player-after-reload'), true, 'Command Log summary diagnostics must stay attached to the committed host row.');
assert.equal(commandLogSummaryCoreDiagnostics.some((entry) => entry.status === 'queued'), true, 'CORE diagnostics must record queued Command Log summary work.');
assert.equal(commandLogSummaryCoreDiagnostics.some((entry) => entry.status === 'applied'), true, 'CORE diagnostics must record applied Command Log summary work.');
assert.equal(commandLogSummaryCoreDiagnostics.every((entry) => entry.inputSignatureHash), true, 'Command Log summary CORE diagnostics must store only the input signature hash.');
const appliedCommandLogSummaryDiagnostic = commandLogSummaryCoreDiagnostics.find((entry) => entry.status === 'applied');
assert.ok(appliedCommandLogSummaryDiagnostic?.assistedSummaryHash, 'Applied Command Log summary diagnostics must store a summary hash.');
assert.equal('assistedSummary' in appliedCommandLogSummaryDiagnostic, false, 'Applied Command Log summary diagnostics must not store the raw assisted summary.');
const appliedCommandLogSummaryText = view.campaignState.commandLog.entries.find((entry) => entry.assistedSummary?.status === 'complete')?.assistedSummary?.summary || '';
assert.equal(
  appliedCommandLogSummaryText && JSON.stringify(commandLogSummaryCoreDiagnostics).includes(appliedCommandLogSummaryText),
  false,
  'Command Log summary CORE diagnostics must not store raw assisted summary text.'
);
const commandLogSummaryBackgroundBatches = coreProjectionsAfterReload.backgroundBatches.filter((entry) => (
  entry.transactionId === reloadedIngressAfterFlush.coreTransactionId
  && String(entry.batchId || '').startsWith('command-log-summary:')
));
assert.equal(commandLogSummaryBackgroundBatches.length, 1, 'Command Log summary must settle through a CORE background batch.');
assert.equal(commandLogSummaryBackgroundBatches[0].operationCount, 0, 'Command Log summary background settlement is a presentation effect, not a mechanics operation.');
assert.equal(commandLogSummaryBackgroundBatches[0].workerCount, 1, 'Command Log summary background settlement must identify one worker.');
const narrativeThreadCoreDiagnostics = coreProjectionsAfterReload.sidecarDiagnostics.filter((entry) => (
  entry.worker === 'narrativeThreadDirector'
  && entry.ingressId === reloadedIngressAfterFlush.id
));
assert.equal(narrativeThreadCoreDiagnostics.length >= 2, true, 'CORE diagnostics must include queued/applied Narrative Thread settlement entries.');
assert.equal(narrativeThreadCoreDiagnostics.every((entry) => entry.sidecarType === 'narrativeThreadExtraction'), true, 'Narrative Thread diagnostics must use the narrativeThreadExtraction sidecar type.');
assert.equal(narrativeThreadCoreDiagnostics.every((entry) => entry.hostMessageId === 'runtime-player-after-reload'), true, 'Narrative Thread diagnostics must stay attached to the committed host row.');
assert.equal(narrativeThreadCoreDiagnostics.some((entry) => entry.status === 'queued'), true, 'CORE diagnostics must record queued Narrative Thread settlement work.');
assert.equal(narrativeThreadCoreDiagnostics.some((entry) => entry.status === 'applied'), true, 'CORE diagnostics must record applied Narrative Thread settlement work.');
assert.equal(narrativeThreadCoreDiagnostics.every((entry) => entry.inputSignatureHash), true, 'Narrative Thread CORE diagnostics must store only the input signature hash.');
const narrativeThreadBackgroundBatches = coreProjectionsAfterReload.backgroundBatches.filter((entry) => (
  entry.transactionId === reloadedIngressAfterFlush.coreTransactionId
  && String(entry.batchId || '').startsWith('narrative-thread:')
));
assert.equal(narrativeThreadBackgroundBatches.length, 1, 'Narrative Thread settlement must settle through a CORE background batch.');
assert.equal(narrativeThreadBackgroundBatches[0].operationCount, 0, 'Narrative Thread background settlement records effect refs, not raw operation payloads.');
assert.equal(narrativeThreadBackgroundBatches[0].workerCount, 1, 'Narrative Thread background settlement must identify one worker.');
const narrativeThreadDiagnosticsText = JSON.stringify(narrativeThreadCoreDiagnostics);
assert.equal(narrativeThreadDiagnosticsText.includes('Serrin keeps the ship at measured readiness'), false, 'Narrative Thread diagnostics must not store raw player text.');
assert.equal(narrativeThreadDiagnosticsText.includes('Committed narration for'), false, 'Narrative Thread diagnostics must not store raw assistant text.');
const continuitySidecarCoreDiagnostics = coreProjectionsAfterReload.sidecarDiagnostics.filter((entry) => (
  entry.worker === 'continuity'
  && entry.ingressId === reloadedIngressAfterFlush.id
));
assert.equal(continuitySidecarCoreDiagnostics.length >= 3, true, 'CORE diagnostics must include regular sidecar lifecycle entries.');
assert.equal(continuitySidecarCoreDiagnostics.every((entry) => entry.sidecarType === 'continuity'), true, 'Regular sidecar diagnostics must preserve worker type.');
assert.equal(continuitySidecarCoreDiagnostics.every((entry) => entry.roleId === 'continuityTracker'), true, 'Regular sidecar diagnostics must preserve model role.');
assert.equal(continuitySidecarCoreDiagnostics.every((entry) => entry.sourceFrameId === reloadedIngressAfterFlush.sourceFrameId), true, 'Regular sidecar diagnostics must attach to the committed source frame.');
assert.equal(continuitySidecarCoreDiagnostics.some((entry) => entry.status === 'queued'), true, 'CORE diagnostics must record queued regular sidecar work.');
assert.equal(continuitySidecarCoreDiagnostics.some((entry) => entry.status === 'running'), true, 'CORE diagnostics must record running regular sidecar work.');
assert.equal(continuitySidecarCoreDiagnostics.some((entry) => entry.status === 'noChange'), true, 'CORE diagnostics must record no-change regular sidecar work.');
assert.equal(JSON.stringify(continuitySidecarCoreDiagnostics).includes('Return one strict JSON state-delta proposal'), false, 'Regular sidecar CORE diagnostics must not store raw sidecar prompts.');
for (const result of flushedSidecars.results || []) {
  const workerDiagnostics = coreProjectionsAfterReload.sidecarDiagnostics.filter((entry) => (
    entry.worker === result.workerKey
    && entry.ingressId === reloadedIngressAfterFlush.id
  ));
  assert.equal(workerDiagnostics.some((entry) => entry.status === 'queued'), true, `${result.workerKey} CORE diagnostics must include queued status after flush.`);
  assert.equal(workerDiagnostics.some((entry) => entry.status === 'running'), true, `${result.workerKey} CORE diagnostics must include running status after flush.`);
  assert.equal(workerDiagnostics.some((entry) => entry.status === result.status), true, `${result.workerKey} CORE diagnostics must include final status after flush.`);
}
const regularSidecarDiagnosticsText = JSON.stringify(coreProjectionsAfterReload.sidecarDiagnostics.filter((entry) => (
  entry.source === 'campaignSidecarScheduler'
  && entry.ingressId === reloadedIngressAfterFlush.id
)));
for (const forbiddenMarker of [
  'No durable sidecar change.',
  'Serrin keeps the ship at measured readiness',
  'Return one strict JSON state-delta proposal',
  '"prompt"',
  '"request"',
  '"response"',
  '"proposal"'
]) {
  assert.equal(regularSidecarDiagnosticsText.includes(forbiddenMarker), false, `Regular sidecar CORE diagnostics must not include ${forbiddenMarker}.`);
}
assertCoreDirectivePostedBridge({
  projections: coreProjectionsAfterReload,
  state: view.campaignState,
  hostMessageId: 'runtime-player-after-reload',
  chatId: sourceChatId,
  label: 'reloaded source turn'
});
assertCoreMechanicsProjection({
  projections: coreProjectionsAfterReload,
  state: view.campaignState,
  hostMessageId: 'runtime-player-after-reload',
  label: 'reloaded source turn'
});

const editResponseSourceMessage = host.chat.pushPlayerMessage({
  hostMessageId: 'runtime-player-response-edit',
  text: 'Serrin orders Helm to keep the pursuit vector warm while Operations watches for any civilian transponder change.'
});
const editResponseTurn = await reloadedApp.observeHostPlayerMessage({
  chatId: host.chat.getCurrentChatId(),
  message: editResponseSourceMessage
});
assert.equal(editResponseTurn.handled, true, 'Runtime fixture should commit a turn for response-edit recovery coverage.');
await reloadedApp.flushChatSidecars();
await reloadedApp.flushRuntimeDiagnostics();
view = await reloadedApp.getCurrentView({ tabId: 'mission' });
const editResponseIngress = view.campaignState.runtimeTracking.ingressLedger.find((entry) => entry.hostMessageId === 'runtime-player-response-edit');
assert.ok(editResponseIngress?.coreTransactionId, 'Response-edit fixture turn should carry a CORE transaction.');
const editFixtureResponseEntry = view.campaignState.runtimeTracking.responseLedger.find((entry) => (
  entry.ingressId === editResponseIngress.id
  && entry.hostMessageId
));
assert.ok(editFixtureResponseEntry?.hostMessageId, 'Response-edit fixture turn should have a Directive assistant response.');
const runtimeResponseEditText = 'The bridge answers in a revised cadence while Helm holds the pursuit vector and Operations keeps the command logged.';
const runtimeResponseEdit = await reloadedApp.handleHostMessageEdited({
  hostMessageId: editFixtureResponseEntry.hostMessageId,
  text: runtimeResponseEditText
});
assert.equal(runtimeResponseEdit.handled, true, `Runtime assistant edit should be handled by chat-native recovery: ${JSON.stringify(runtimeResponseEdit)}`);
assert.equal(runtimeResponseEdit.action, 'reviewRequired', 'Committed Directive response edit should enter recovery review.');
view = await reloadedApp.getCurrentView({ tabId: 'mission' });
const runtimeEditedResponseEntry = view.campaignState.runtimeTracking.responseLedger.find((entry) => entry.id === editFixtureResponseEntry.id);
assert.equal(runtimeEditedResponseEntry.status, 'recoveryRequired', 'Old response projection should mirror CORE recovery-required state.');
const runtimeEditedResponseRecovery = view.campaignState.runtimeTracking.recoveryJournal.find((entry) => (
  entry.type === 'directiveResponseEdited'
  && entry.details?.responseId === runtimeEditedResponseEntry.id
));
assert.equal(runtimeEditedResponseRecovery, undefined, 'CORE-recorded response edits must not write old recoveryJournal rows.');
const coreProjectionsAfterResponseEdit = await readCoreStoreProjectionsV2(host.storage, {
  campaignId: view.campaignState.campaign.id,
  saveId: view.activeSaveId
});
const responseEditRecoveryProjection = coreProjectionsAfterResponseEdit.recoveryJournal.find((entry) => (
  entry.transactionId === runtimeEditedResponseEntry.coreTransactionId
  && entry.reason === 'directiveResponseEdited'
));
assert.ok(responseEditRecoveryProjection, 'Runtime assistant edit should persist a CORE recovery projection.');
assert.equal(responseEditRecoveryProjection.sourceMutation.sourceKind, 'directiveResponse');
assert.equal(responseEditRecoveryProjection.sourceMutation.hostMessageId, editFixtureResponseEntry.hostMessageId);
assert.equal(responseEditRecoveryProjection.sourceMutation.responseId, runtimeEditedResponseEntry.id);
assert.equal(responseEditRecoveryProjection.sourceMutation.sourceFrameId, runtimeEditedResponseEntry.sourceFrameId);
assert.equal(responseEditRecoveryProjection.sourceMutation.replacementTextHash.length, 64);
assert.equal(responseEditRecoveryProjection.repairDecision.kind, 'directive.repairDecision.v1');
assert.equal(responseEditRecoveryProjection.repairDecision.sourceKind, 'directiveResponse');
assert.equal(responseEditRecoveryProjection.repairDecision.normalTurnAllowed, false);
assert.deepEqual(responseEditRecoveryProjection.allowedActions, ['reviewResponseMutation', 'retryResponse']);
assert.equal(JSON.stringify(responseEditRecoveryProjection).includes(runtimeResponseEditText), false, 'CORE response-edit projection must not store raw replacement text.');

const deleteResponseSourceMessage = host.chat.pushPlayerMessage({
  hostMessageId: 'runtime-player-response-delete',
  text: 'Serrin asks Tactical to hold the contact on passive sensors while the bridge keeps the civilian channel clear.'
});
const deleteResponseTurn = await reloadedApp.observeHostPlayerMessage({
  chatId: host.chat.getCurrentChatId(),
  message: deleteResponseSourceMessage
});
assert.equal(deleteResponseTurn.handled, true, 'Runtime fixture should commit a turn for response-delete recovery coverage.');
await reloadedApp.flushChatSidecars();
await reloadedApp.flushRuntimeDiagnostics();
view = await reloadedApp.getCurrentView({ tabId: 'mission' });
const deleteResponseIngress = view.campaignState.runtimeTracking.ingressLedger.find((entry) => entry.hostMessageId === 'runtime-player-response-delete');
assert.ok(deleteResponseIngress?.coreTransactionId, 'Response-delete fixture turn should carry a CORE transaction.');
const runtimeDeleteResponseEntry = view.campaignState.runtimeTracking.responseLedger.find((entry) => entry.ingressId === deleteResponseIngress.id);
assert.ok(runtimeDeleteResponseEntry?.hostMessageId, 'Response-delete fixture turn should have a Directive assistant response.');
const runtimeResponseDelete = await reloadedApp.handleHostMessageDeleted({
  hostMessageId: runtimeDeleteResponseEntry.hostMessageId
});
assert.equal(runtimeResponseDelete.handled, true, 'Runtime assistant delete should be handled by chat-native recovery.');
assert.equal(runtimeResponseDelete.action, 'reviewRequired', 'Committed Directive response delete should enter recovery review.');
view = await reloadedApp.getCurrentView({ tabId: 'mission' });
const deletedRuntimeResponseEntry = view.campaignState.runtimeTracking.responseLedger.find((entry) => entry.id === runtimeDeleteResponseEntry.id);
assert.equal(deletedRuntimeResponseEntry.status, 'recoveryRequired', 'Old deleted-response projection should mirror CORE recovery-required state.');
assert.equal(deletedRuntimeResponseEntry.invalidationType, 'directiveResponseDeleted');
const runtimeDeletedResponseRecovery = view.campaignState.runtimeTracking.recoveryJournal.find((entry) => (
  entry.type === 'directiveResponseDeleted'
  && entry.details?.responseId === deletedRuntimeResponseEntry.id
));
assert.equal(runtimeDeletedResponseRecovery, undefined, 'CORE-recorded response deletes must not write old recoveryJournal rows.');
const coreProjectionsAfterResponseDelete = await readCoreStoreProjectionsV2(host.storage, {
  campaignId: view.campaignState.campaign.id,
  saveId: view.activeSaveId
});
const responseDeleteRecoveryProjection = coreProjectionsAfterResponseDelete.recoveryJournal.find((entry) => (
  entry.transactionId === deletedRuntimeResponseEntry.coreTransactionId
  && entry.reason === 'directiveResponseDeleted'
));
assert.ok(responseDeleteRecoveryProjection, 'Runtime assistant delete should persist a CORE recovery projection.');
assert.equal(responseDeleteRecoveryProjection.sourceMutation.sourceKind, 'directiveResponse');
assert.equal(responseDeleteRecoveryProjection.sourceMutation.hostMessageId, deletedRuntimeResponseEntry.hostMessageId);
assert.equal(responseDeleteRecoveryProjection.sourceMutation.responseId, deletedRuntimeResponseEntry.id);
assert.equal(responseDeleteRecoveryProjection.sourceMutation.replacementTextHash, null);
assert.equal(responseDeleteRecoveryProjection.sourceMutation.replacementTextPresent, false);
assert.equal(responseDeleteRecoveryProjection.repairDecision.kind, 'directive.repairDecision.v1');
assert.equal(responseDeleteRecoveryProjection.repairDecision.sourceKind, 'directiveResponse');
assert.deepEqual(responseDeleteRecoveryProjection.allowedActions, ['reviewResponseMutation', 'retryResponse']);

const reloadedSourceRecovery = await reloadedApp.handleHostMessageEdited({
  hostMessageId: 'runtime-player-after-reload',
  text: 'Serrin revises the readiness order after the committed response, keeping the relay margin logged.'
});
assert.equal(reloadedSourceRecovery.handled, true, 'Runtime host edit should be handled by chat-native recovery.');
assert.equal(reloadedSourceRecovery.action, 'reviewRequired', 'Committed source edit should enter recovery review.');
view = await reloadedApp.getCurrentView({ tabId: 'mission' });
const editedReloadedIngress = view.campaignState.runtimeTracking.ingressLedger.find((entry) => entry.hostMessageId === 'runtime-player-after-reload');
assert.equal(editedReloadedIngress.status, 'recoveryRequired', 'Old ingress projection should mirror CORE recovery-required state.');
const editedReloadedRecovery = view.campaignState.runtimeTracking.recoveryJournal.find((entry) => (
  entry.type === 'playerMessageEdited'
  && entry.ingressId === editedReloadedIngress.id
));
assert.equal(editedReloadedRecovery, undefined, 'CORE-recorded player source edits must not write old recoveryJournal rows.');
const coreProjectionsAfterSourceEdit = await readCoreStoreProjectionsV2(host.storage, {
  campaignId: view.campaignState.campaign.id,
  saveId: view.activeSaveId
});
const sourceMutationRecoveryProjection = coreProjectionsAfterSourceEdit.recoveryJournal.find((entry) => (
  entry.transactionId === editedReloadedIngress.coreTransactionId
  && entry.reason === 'playerMessageEdited'
));
assert.ok(sourceMutationRecoveryProjection, 'Runtime source edit should persist a CORE recovery projection.');
assert.equal(sourceMutationRecoveryProjection.sourceMutation.sourceKind, 'playerIngress');
assert.equal(sourceMutationRecoveryProjection.sourceMutation.hostMessageId, 'runtime-player-after-reload');
assert.equal(sourceMutationRecoveryProjection.sourceMutation.ingressId, editedReloadedIngress.id);
assert.equal(sourceMutationRecoveryProjection.sourceMutation.sourceFrameId, editedReloadedIngress.sourceFrameId);
assert.equal(sourceMutationRecoveryProjection.sourceMutation.recallSourceMutation.kind, 'directive.recallSourceMutation.v1');
assert.equal(sourceMutationRecoveryProjection.sourceMutation.recallSourceMutation.action, 'source-edit');
assert.equal(sourceMutationRecoveryProjection.sourceMutation.recallSourceMutation.sourceFrameIds.includes(editedReloadedIngress.sourceFrameId), true);
assert.equal(sourceMutationRecoveryProjection.sourceMutation.recallSourceMutation.hostMessageIds.includes('runtime-player-after-reload'), true);
assert.equal(sourceMutationRecoveryProjection.recallAuxiliaryRewrite?.kind, 'directive.recallAuxiliaryRewrite.v1');
assert.equal(sourceMutationRecoveryProjection.recallAuxiliaryRewrite.mode, 'snapshot');
assert.equal(Number.isFinite(Number(sourceMutationRecoveryProjection.recallAuxiliaryRewrite.trace?.inputCount)), true);
assert.equal(sourceMutationRecoveryProjection.sourceMutation.replacementTextHash.length, 64);
assert.equal(sourceMutationRecoveryProjection.repairDecision.kind, 'directive.repairDecision.v1');
assert.equal(sourceMutationRecoveryProjection.repairDecision.action, 'reviewRequired');
assert.equal(sourceMutationRecoveryProjection.repairDecision.normalTurnAllowed, false);
assert.equal(sourceMutationRecoveryProjection.repairDecision.legacyProjection.sourceProjectionStatus, 'recoveryRequired');
assert.deepEqual(sourceMutationRecoveryProjection.allowedActions, [
  'reviewSourceMutation',
  'rerunFromSource',
  'branchFromPriorRevision'
]);
assert.equal(JSON.stringify(sourceMutationRecoveryProjection).includes('Serrin revises the readiness order'), false, 'CORE recovery projection must not store raw replacement text.');

const saves = await listCampaignSaves(host.storage);
const activeSave = saves.find((entry) => entry.id === view.activeSaveId);
assert.ok(activeSave);
assert.equal(activeSave.storageFormat === 'v2' || activeSave.runtimeStorageFormat === 'v2', true, 'Active save should retain v2 authority after runtime turns and manual save paths.');
assert.equal(Boolean(activeSave.manifestRef?.logicalKey || activeSave.v2ManifestRef?.logicalKey), true, 'Active save should expose a v2 manifest ref instead of relying on v1 revision churn.');

const promptClearCallsBeforeConclusion = host.prompt.calls().filter((entry) => entry.type === 'clear').length;
const completed = await reloadedApp.concludeCampaign({ reason: 'Runtime target-flow test completed.', type: 'playerChoice' });
assert.equal(completed.campaignState.campaign.status, 'complete');
assert.equal(completed.campaignState.conclusion.recapStatus, 'complete');
assert.equal(host.chat.messages().filter((entry) => entry.metadata?.responseKind === 'campaignConclusion').length, 1);
assert.equal(host.prompt.inspect().blockCount, 0);
const promptClearCallsAfterConclusion = host.prompt.calls().filter((entry) => entry.type === 'clear');
assert.equal(
  promptClearCallsAfterConclusion.length,
  promptClearCallsBeforeConclusion + 1,
  'Campaign conclusion should clear Directive prompt state through LENS.'
);
const conclusionPromptClearCall = promptClearCallsAfterConclusion.at(-1);
assert.equal(conclusionPromptClearCall.options.reason, 'campaign-complete');
assert.equal(conclusionPromptClearCall.options.lane, 'all');
assert.equal(conclusionPromptClearCall.options.preservePacket, undefined);

const promptClearCallsBeforeArchive = host.prompt.calls().filter((entry) => entry.type === 'clear').length;
const archived = await reloadedApp.archiveCompletedCampaign();
assert.equal(archived.campaignState.campaign.status, 'archived');
assert.ok(archived.campaignState.campaign.archivedAt);
assert.equal(host.prompt.inspect().blockCount, 0);
const promptClearCallsAfterArchive = host.prompt.calls().filter((entry) => entry.type === 'clear');
assert.equal(
  promptClearCallsAfterArchive.length,
  promptClearCallsBeforeArchive + 1,
  'Archiving a completed campaign should clear Directive prompt state through LENS even when conclusion already cleared host blocks.'
);
const archivePromptClearCall = promptClearCallsAfterArchive.at(-1);
assert.equal(archivePromptClearCall.options.reason, 'campaign-archived');
assert.equal(archivePromptClearCall.options.lane, 'all');
assert.equal(archivePromptClearCall.options.preservePacket, undefined);

const promptClearCallsBeforeActiveDelete = host.prompt.calls().filter((entry) => entry.type === 'clear').length;
const deletedActiveSave = await reloadedApp.deleteCampaignSave({ saveId: activeSave.id });
assert.equal(deletedActiveSave.deleteResult.deletedActive, true);
assert.equal(host.prompt.inspect().blockCount, 0);
const promptClearCallsAfterActiveDelete = host.prompt.calls().filter((entry) => entry.type === 'clear');
assert.equal(
  promptClearCallsAfterActiveDelete.length,
  promptClearCallsBeforeActiveDelete + 1,
  'Deleting the active save should clear all LENS-installed Directive prompt lanes.'
);
const activeDeletePromptClearCall = promptClearCallsAfterActiveDelete.at(-1);
assert.equal(activeDeletePromptClearCall.options.reason, 'active-save-deleted');
assert.equal(activeDeletePromptClearCall.options.lane, 'all');
assert.equal(activeDeletePromptClearCall.options.preservePacket, undefined);

console.log('Chat-native runtime flow tests passed: no pre-activation injection, creator activation, automatic chat/intro, utility loop, committed outcome, REPAIR source/response recovery, autosave, conclusion, archive, and active-save delete prompt cleanup');
