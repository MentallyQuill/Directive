import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import {
  assertFrameCleanForSettlement,
  createRangeSourceFrame,
  createSourceToken,
  createTurnSourceFrame,
  derivePromptFrame
} from '../../src/runtime/frame-contracts.mjs';
import {
  createLensPromptScheduler,
  normalizePromptDirtyDomains
} from '../../src/runtime/lens-prompt-scheduler.mjs';
import {
  buildLensPromptPacket,
  createLensPromptInput,
  lensPromptPacketProjectionSummary
} from '../../src/runtime/lens-prompt-packet-builder.mjs';
import {
  createCoreTurnRuntime
} from '../../src/runtime/core-turn-runtime.mjs';
import {
  createRepairCommandBoundary
} from '../../src/runtime/repair-command-boundary.mjs';
import {
  createSourceSettlementService
} from '../../src/runtime/source-settlement-service.mjs';
import {
  createForgeBatchCommit,
  findForgePathConflict,
  normalizeForgeWorkerResult
} from '../../src/jobs/forge-contracts.mjs';
import {
  createForgeCoordinator
} from '../../src/jobs/forge-coordinator.mjs';

import {
  hashStableJson
} from '../../src/runtime/architecture-redesign-contracts.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function countSourceMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

const repairCommandBoundarySource = readFileSync(
  new URL('../../src/runtime/repair-command-boundary.mjs', import.meta.url),
  'utf8'
);
assert.equal(
  /type\s*:\s*['"]restoreRevision['"]/.test(repairCommandBoundarySource),
  false,
  'REPAIR rollback execution must not append old runtimeTracking.recoveryJournal restoreRevision rows.'
);

const stateDeltaGatewaySource = readFileSync(
  new URL('../../src/runtime/state-delta-gateway.mjs', import.meta.url),
  'utf8'
);
const activeSaveFacadeSource = readFileSync(
  new URL('../../src/storage/active-save-facade-v2.mjs', import.meta.url),
  'utf8'
);
const runtimeLedgerViewSource = readFileSync(
  new URL('../../src/runtime/runtime-ledger-view.mjs', import.meta.url),
  'utf8'
);
assert.equal(
  /type\s*:\s*['"]restoreRevision['"]/.test(stateDeltaGatewaySource),
  false,
  'Generic state restore must not append old runtimeTracking.recoveryJournal restoreRevision rows.'
);
assert.match(
  stateDeltaGatewaySource,
  /type\s*:\s*['"]stateRevisionRestored['"]/,
  'Generic state restore should record compact lifecycle audit evidence instead of recovery authority.'
);
assert.match(
  activeSaveFacadeSource,
  /function\s+projectedRecoveryRows\s*\([\s\S]*?const\s+coreRows\s*=\s*projectedCoreArray\(campaignState,\s*['"]recoveryJournal['"]\)[\s\S]*?return\s+Array\.isArray\(coreRows\)\s*\?\s*coreRows\s*:\s*\[\]/,
  'Active-save v2 recovery resume must be CORE-only and must not merge legacy runtimeTracking.recoveryJournal rows.'
);
const projectedRecoveryRowsBody = /function\s+projectedRecoveryRows\s*\([\s\S]*?\n\}[\s\S]*?\n\nfunction\s+projectedTurnLedger/.exec(activeSaveFacadeSource)?.[0] || '';
assert.equal(
  /runtimeTracking\.recoveryJournal/.test(projectedRecoveryRowsBody),
  false,
  'Active-save v2 recovery projection must not read old runtimeTracking.recoveryJournal as resume authority.'
);
assert.match(
  runtimeLedgerViewSource,
  /export\s+function\s+createRuntimeLedgerView\b[\s\S]*?recoveryJournal\s*=\s*coreRecovery\.length\s*\?[\s\S]*?:\s*\(authoritative\s*\?\s*\[\]\s*:\s*cloneJson\(legacyRecovery\)\)/,
  'Runtime ledger view must keep recovery rows CORE-first and suppress legacy recovery rows whenever CORE recovery projection exists.'
);
assert.match(
  runtimeLedgerViewSource,
  /export\s+async\s+function\s+createRuntimeLedgerViewAsync\b[\s\S]*?await\s+readRuntimeCoreProjectionsAsync/,
  'Runtime ledger view must provide an async CORE projection path for runtime-app CORE facades.'
);

const chatTurnOrchestratorSource = readFileSync(
  new URL('../../src/runtime/chat-turn-orchestrator.mjs', import.meta.url),
  'utf8'
);
assert.equal(
  /from\s+['"]\.\/scene-handshake-settler\.mjs['"]/.test(chatTurnOrchestratorSource),
  false,
  'Production chat-turn-orchestrator must depend on the source-settlement latest-pair owner instead of importing the legacy Scene Handshake settler directly.'
);
assert.equal(
  /\brunSceneHandshakeSettlement\b/.test(chatTurnOrchestratorSource),
  false,
  'Production chat-turn-orchestrator must not reference runSceneHandshakeSettlement directly.'
);
assert.match(
  chatTurnOrchestratorSource,
  /from\s+['"]\.\/source-settlement-latest-pair\.mjs['"]/,
  'Production chat-turn-orchestrator must route latest-pair settlement through the source-settlement latest-pair owner module.'
);
assert.equal(
  chatTurnOrchestratorSource.includes("type: 'hostResponsePostFailure'")
    || chatTurnOrchestratorSource.includes('type: "hostResponsePostFailure"'),
  false,
  'hostResponsePostFailure must not write old recoveryJournal rows.'
);
assert.equal(
  chatTurnOrchestratorSource.includes('error: { message: error?.message || String(error) }'),
  false,
  'postCommitConversationFailed fallback must not persist raw error messages in old recoveryJournal details.'
);
assert.match(
  chatTurnOrchestratorSource,
  /function\s+compactPostCommitConversationError\b[\s\S]*?messageLength[\s\S]*?messageHash/,
  'postCommitConversationFailed fallback must keep only compact error evidence.'
);
assert.match(
  chatTurnOrchestratorSource,
  /async\s+function\s+appendPostCommitConversationFailureDiagnostic\b[\s\S]*?coreTurnStore\?\.(?:appendDiagnostics|appendDiagnostic)/,
  'Blocking postCommitConversation failures must attempt CORE diagnostics.'
);
assert.match(
  chatTurnOrchestratorSource,
  /const\s+postCommitConversationDiagnostic\s*=\s*await\s+appendPostCommitConversationFailureDiagnostic/,
  'Blocking postCommitConversation failures must attempt diagnostics without old recovery fallback.'
);

const sourceSettlementLatestPairModuleUrl = new URL('../../src/runtime/source-settlement-latest-pair.mjs', import.meta.url);
assert.equal(
  existsSync(sourceSettlementLatestPairModuleUrl),
  true,
  'Source-settlement latest-pair owner module must exist.'
);
const sourceSettlementLatestPair = await import(sourceSettlementLatestPairModuleUrl.href);
assert.equal(typeof sourceSettlementLatestPair.createLatestPairSourceSettlementProvider, 'function');
assert.equal(typeof sourceSettlementLatestPair.settleLatestPairSource, 'function');

const runtimeAppSource = readFileSync(
  new URL('../../src/runtime/runtime-app.mjs', import.meta.url),
  'utf8'
);
assert.match(
  runtimeAppSource,
  /createRuntimeLedgerView[\s\S]*?from\s+['"]\.\/runtime-ledger-view\.mjs['"]/,
  'Runtime-app freshness arbitration must use the shared CORE-first runtime ledger view.'
);
assert.match(
  runtimeAppSource,
  /const\s+runtimeLedgerView\s*=\s*createRuntimeLedgerView\(state\s*\|\|\s*\{\}\)/,
  'Runtime-app freshness counters must be derived from the shared runtime ledger view.'
);
assert.equal(
  /rowsCoveredByCoreProjection\(projections\.recoveryJournal,\s*runtimeTracking\.recoveryJournal/.test(runtimeAppSource),
  false,
  'Runtime-app CORE authority must not require CORE recovery projections to cover legacy recoveryJournal rows.'
);
const correctAsSwipeSource = readFileSync(
  new URL('../../src/runtime/correct-as-swipe.mjs', import.meta.url),
  'utf8'
);
const sourceReviewWorkerSource = readFileSync(
  new URL('../../src/runtime/source-review-worker.mjs', import.meta.url),
  'utf8'
);
const sourceReconciliationEngineSource = readFileSync(
  new URL('../../src/runtime/source-reconciliation-engine.mjs', import.meta.url),
  'utf8'
);
const sillyTavernChatAdapterSource = readFileSync(
  new URL('../../src/hosts/sillytavern/chat-adapter.mjs', import.meta.url),
  'utf8'
);
const fakeHostSource = readFileSync(
  new URL('../../src/hosts/fake/fake-host.mjs', import.meta.url),
  'utf8'
);
const missionComponentsCaptureSource = readFileSync(
  new URL('../../src/hosts/sillytavern/mission-components-capture.js', import.meta.url),
  'utf8'
);
const correctAsSwipeLiveSource = readFileSync(
  new URL('./test-correct-as-swipe-live.mjs', import.meta.url),
  'utf8'
);
const transactionStateSource = readFileSync(
  new URL('../../src/campaign/transaction-state.mjs', import.meta.url),
  'utf8'
);
const settingsPanelSource = readFileSync(
  new URL('../../src/ui/settings-panel.js', import.meta.url),
  'utf8'
);
const ashesProjectionSource = readFileSync(
  new URL('../../packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json', import.meta.url),
  'utf8'
);
for (const [label, source] of [
  ['runtime-app', runtimeAppSource],
  ['transaction-state', transactionStateSource]
]) {
  assert.match(
    source,
    /const\s+DEFAULT_TURN_SAVE_HISTORY_LIMIT\s*=\s*8\s*;/,
    `${label} must default retained old turn-save history to 8 for 5000-message scale.`
  );
  assert.match(
    source,
    /const\s+MAX_TURN_SAVE_HISTORY_LIMIT\s*=\s*20\s*;/,
    `${label} must cap retained old turn-save history at 20 while CORE checkpoints own durable replay.`
  );
}
assert.match(
  stateDeltaGatewaySource,
  /const\s+DEFAULT_HISTORY_LIMIT\s*=\s*8\s*;/,
  'State delta gateway must default runtimeTracking.history to 8 compact snapshots.'
);
assert.equal(
  /value\s*\?\?\s*campaignState\.settings\?\.maxTurnSaveHistory\s*\?\?\s*campaignState\.runtimeTracking\?\.historyLimit/.test(runtimeAppSource),
  false,
  'Runtime settings defaulting must not preserve old runtimeTracking.historyLimit as an implicit user setting.'
);
assert.match(
  settingsPanelSource,
  /historyLimitValue[\s\S]*\|\|\s*8[\s\S]*return\s+Number\.isFinite\(value\)\s*\?\s*value\s*:\s*8/,
  'Settings UI must display the scale-oriented turn history default.'
);
assert.equal(
  /historyLimitValue[\s\S]*runtimeTracking\?\.historyLimit/.test(settingsPanelSource),
  false,
  'Settings UI must not preserve old runtimeTracking.historyLimit as the visible default.'
);
assert.match(
  settingsPanelSource,
  /historyField\.control\.max\s*=\s*['"]20['"]/,
  'Settings UI must cap the old turn history input at 20.'
);
assert.match(
  ashesProjectionSource,
  /"maxTurnSaveHistory"\s*:\s*8/,
  'Bundled Ashes campaign must seed the scale-oriented turn history default.'
);
assert.match(
  correctAsSwipeSource,
  /CORRECT_AS_SWIPE_ACTION_ID\s*=\s*['"]correctAsSwipe\.propose['"]/,
  'Correct-as-Swipe must expose a stable runtime action id.'
);
assert.match(
  correctAsSwipeSource,
  /CORRECT_AS_SWIPE_SETTLE_ACTION_ID\s*=\s*['"]correctAsSwipe\.settleCase['"]/,
  'Correct-as-Swipe must expose a stable runtime action id for REPAIR lifecycle decisions.'
);
assert.match(
  correctAsSwipeSource,
  /acceptanceBoundary:\s*['"]selectedSwipeChanged['"][\s\S]*?continuityMutation:\s*['"]none-until-selected['"]/,
  'Correct-as-Swipe correction cases must keep selected-swipe acceptance as the continuity boundary.'
);
assert.match(
  correctAsSwipeSource,
  /settleCorrectAsSwipeCaseLifecycle[\s\S]*?buildCorrectAsSwipeLifecycleDecision[\s\S]*?type:\s*['"]correctAsSwipeCaseLifecycle['"]/,
  'Correct-as-Swipe lifecycle actions must go through REPAIR decisions and compact CORE diagnostics.'
);
assert.match(
  correctAsSwipeSource,
  /acceptCorrectAsSwipeSelection[\s\S]*?selectedTextHash[\s\S]*?candidateSwipe:[\s\S]*?selected:\s*true/,
  'Correct-as-Swipe selected-swipe acceptance must require selected text hash evidence and mark only compact case refs.'
);
assert.match(
  correctAsSwipeSource,
  /appendAssistantMessageSwipe\s*\([\s\S]*?select:\s*false/,
  'Correct-as-Swipe candidate swipes must append without auto-selecting the candidate.'
);
assert.match(
  sillyTavernChatAdapterSource,
  /select\s*=\s*true[\s\S]*?const\s+selected\s*=\s*select\s*!==\s*false[\s\S]*?if\s*\(\s*selected\s*\)\s*\{[\s\S]*?message\.swipe_id\s*=\s*swipeIndex[\s\S]*?\}\s*else\s*\{/,
  'SillyTavern chat adapter must support unselected candidate swipe append while preserving default selected append behavior.'
);
assert.match(
  fakeHostSource,
  /const\s+selected\s*=\s*options\.select\s*!==\s*false[\s\S]*?if\s*\(\s*selected\s*\)\s*\{[\s\S]*?message\.swipe_id\s*=\s*swipeIndex[\s\S]*?\}\s*else\s*\{/,
  'Fake host must model unselected candidate swipe append for Correct-as-Swipe tests.'
);
assert.match(
  missionComponentsCaptureSource,
  /DIRECTIVE_CORRECT_AS_SWIPE_BUTTON_CLASS[\s\S]*?correctAsSwipe\.propose[\s\S]*?proposedText:\s*candidate\.value/s,
  'Highlighted assistant selections must expose a Correct-as-Swipe affordance that submits candidate prose through the runtime action.'
);
assert.match(
  missionComponentsCaptureSource,
  /correct\.hidden\s*=\s*state\.message\?\.role\s*!==\s*['"]assistant['"]/,
  'Correct-as-Swipe selection affordance must stay assistant-message scoped.'
);
assert.match(
  correctAsSwipeLiveSource,
  /compareServedExtension[\s\S]*?SERVED_EXTENSION_FILES[\s\S]*?assert\.equal\(servedExtension\.ok,\s*true/,
  'Correct-as-Swipe live proof must fail closed on served-extension mismatch.'
);
assert.match(
  correctAsSwipeLiveSource,
  /assert\.notEqual\(SILLYTAVERN_USER,\s*['"]default-user['"]/,
  'Correct-as-Swipe live proof must not run against the human default-user lane.'
);
assert.match(
  correctAsSwipeLiveSource,
  /assert\(SILLYTAVERN_USER,\s*['"]Correct-as-Swipe live smoke requires DIRECTIVE_SILLYTAVERN_USER/,
  'Correct-as-Swipe live proof must require an explicit non-human soak user.'
);
assert.match(
  correctAsSwipeLiveSource,
  /directive-correct-as-swipe-button[\s\S]*?directive-correct-as-swipe-popover[\s\S]*?selectedUnchanged/,
  'Correct-as-Swipe live proof must exercise browser selection, UI append, and unselected candidate evidence.'
);
assert.match(
  runtimeAppSource,
  /from\s+['"]\.\.\/storage\/transaction-store-v2\.mjs['"][\s\S]*?\bloadV2Checkpoint\b[\s\S]*?\bwriteV2Checkpoint\b|(?:loadV2Checkpoint|writeV2Checkpoint)[\s\S]*?(?:loadV2Checkpoint|writeV2Checkpoint)[\s\S]*?from\s+['"]\.\.\/storage\/transaction-store-v2\.mjs['"]/,
  'Runtime-app must import the v2 checkpoint loader/writer for CORE-backed terminal replay.'
);
assert.match(
  runtimeAppSource,
  /createCampaignEndConditionService\s*\(\s*\{[\s\S]*?\bloadTerminalCheckpoint\s*:/,
  'Runtime-app must pass a CORE/v2 terminal checkpoint loader into the end-condition service.'
);
assert.equal(
  runtimeAppSource.includes('error: { message: error?.message || String(error), code: error?.code || null }'),
  false,
  'Runtime-app postCommitConversationFailed fallback must not persist raw error messages in old recoveryJournal details.'
);
assert.match(
  runtimeAppSource,
  /function\s+compactRuntimeErrorEvidence\b[\s\S]*?messageLength[\s\S]*?messageHash/,
  'Runtime-app postCommitConversationFailed fallback must keep only compact error evidence.'
);
assert.match(
  runtimeAppSource,
  /async\s+function\s+appendPostCommitConversationCoreDiagnostic\b[\s\S]*?runtimeCoreTurnStore\.appendDiagnostics/,
  'Runtime-app scheduled postCommitConversation failures must have an awaited CORE diagnostic path.'
);
assert.match(
  runtimeAppSource,
  /failureDiagnostic\s*=\s*await\s+appendPostCommitConversationCoreDiagnostic/,
  'Runtime-app scheduled postCommitConversation failures must attempt a CORE diagnostic.'
);
assert.match(
  runtimeAppSource,
  /eventType\s*:\s*status\s*===\s*['"]failed['"]\s*\?\s*['"]postCommitConversationFailed['"]\s*:\s*['"]postCommitConversation['"]/,
  'Runtime-app postCommitConversation CORE diagnostics must name failed extraction events.'
);
assert.equal(
  runtimeAppSource.includes('campaignState = recordRecoveryEvent({')
    && runtimeAppSource.includes("type: 'campaignDifficultyChange'"),
  false,
  'Campaign difficulty lifecycle changes must not use runtimeTracking.recoveryJournal as an administrative event log.'
);
assert.equal(
  runtimeAppSource.includes('campaignState = recordRecoveryEvent(campaignState, {')
    && runtimeAppSource.includes("type: 'chatRebind'"),
  false,
  'Chat rebinding lifecycle changes must not use runtimeTracking.recoveryJournal as an administrative event log.'
);
assert.match(
  runtimeAppSource,
  /recordLifecycleEvent\s*\([\s\S]*?type\s*:\s*['"]campaignDifficultyChange['"][\s\S]*?recordLifecycleEvent\s*\([\s\S]*?type\s*:\s*['"]chatRebind['"]/,
  'Runtime-app administrative lifecycle changes must use the compact lifecycle journal.'
);
assert.match(
  runtimeAppSource,
  /function\s+appendNarrationBookkeepingMissingOutcomeDiagnostic\b[\s\S]*?runtimeCoreTurnStore\.appendDiagnostics/,
  'Narration missing-outcome bookkeeping must attempt a CORE diagnostic.'
);
assert.match(
  runtimeAppSource,
  /const\s+coreDiagnostic\s*=\s*await\s+appendNarrationBookkeepingMissingOutcomeDiagnostic[\s\S]*?if\s*\(\s*coreDiagnostic\s*\)\s*\{/,
  'Narration missing-outcome bookkeeping must persist only after CORE diagnostic evidence exists.'
);
assert.match(
  runtimeAppSource,
  /createCampaignEndConditionService\s*\(\s*\{[\s\S]*?\bwriteTerminalCheckpoint\s*:/,
  'Runtime-app must pass a CORE/v2 terminal checkpoint writer into the end-condition service.'
);
assert.match(
  runtimeAppSource,
  /async\s+resolveTerminalOutcomeDecision\s*\(\s*\{[\s\S]*?resolutionIngressId\s*=\s*null[\s\S]*?resolutionHostMessageId\s*=\s*null[\s\S]*?\}\s*=\s*\{\s*\}\s*\)\s*\{[\s\S]*?endConditionService\.resolveDecision\s*\(\s*\{[\s\S]*?\bresolutionIngressId\b[\s\S]*?\bresolutionHostMessageId\b[\s\S]*?\}\s*\)/,
  'Runtime-app public resolveTerminalOutcomeDecision must accept and forward terminal resolution ingress/message ids.'
);
assert.match(
  runtimeAppSource,
  /createMessageReconciler\s*\(\s*\{[\s\S]*?\bloadCoreCheckpointState\s*:/,
  'Runtime-app must pass a CORE checkpoint loader into message recovery rollback execution.'
);

const sourceReviewWorkerModuleUrl = new URL('../../src/runtime/source-review-worker.mjs', import.meta.url);
assert.equal(
  existsSync(sourceReviewWorkerModuleUrl),
  true,
  'Source-review worker module must exist.'
);
const sourceReviewWorker = await import(sourceReviewWorkerModuleUrl.href);
assert.equal(typeof sourceReviewWorker.createSourceReviewWorker, 'function');
assert.equal(typeof sourceReviewWorker.__sourceReviewWorkerTestHooks?.providedHostNativeReviewMatchesSource, 'function');
assert.match(
  runtimeAppSource,
  /createSourceReviewWorker[\s\S]*?reviewCorrectAsSwipeEvidence[\s\S]*?proposeCorrectAsSwipe\(/,
  'Runtime-app Correct-as-Swipe action must derive SRE evidence verdicts before appending candidate swipes.'
);
assert.match(
  runtimeAppSource,
  /const\s+proposedText\s*=\s*payload\.proposedText\s*\?\?\s*payload\.candidateText\s*\?\?\s*payload\.rewriteText\s*\?\?\s*payload\.text/,
  'Runtime-app Correct-as-Swipe action must treat generic payload.text as candidate text, not selected evidence text.'
);
assert.equal(
  sourceReviewWorkerSource.includes('directive.sreCorrectAsSwipeEvidenceVerdict.v1'),
  true,
  'Source-review worker must expose the Correct-as-Swipe evidence-verdict contract.'
);
for (const verdict of ['supported', 'contradicted', 'unsupported', 'ambiguous', 'external-only']) {
  assert.equal(
    sourceReviewWorkerSource.includes(`'${verdict}'`),
    true,
    `Source-review worker must keep Correct-as-Swipe verdict '${verdict}'.`
  );
}
assert.match(
  sourceReconciliationEngineSource,
  /function\s+reviewCorrectAsSwipeEvidence[\s\S]*?reviewContinuityContradictions[\s\S]*?directive\.sreCorrectAsSwipeEvidenceVerdict\.v1/,
  'SRE must own Correct-as-Swipe selected-text evidence verdict production.'
);
const rawSreFindingSummaryCanary = 'RAW_SRE_FINDING_SUMMARY_MUST_NOT_PERSIST';
const summarySanitizingWorker = sourceReviewWorker.createSourceReviewWorker({
  sourceReconciliationEngine: {
    async reviewHostNativeContinuity() {
      return {
        kind: 'directive.sreHostNativeContinuityReview.v1',
        ok: false,
        findings: [{
          kind: 'protected-fact-contradiction',
          factId: 'crew.hadrik-bronn.species',
          severity: 'blocker',
          summary: rawSreFindingSummaryCanary,
          reason: `${rawSreFindingSummaryCanary} reason`
        }],
        checkedFactCount: 1,
        reviewer: 'test-sre'
      };
    }
  },
  now: () => '2026-06-30T02:00:00.000Z'
});
const sanitizedSourceReview = await summarySanitizingWorker.reviewHostNativeContinuity({
  mode: 'hostNativeCompletion',
  text: 'The assistant row is reviewed by the worker.',
  responseId: 'response-source-review-summary-sanitized',
  ingressId: 'ingress-source-review-summary-sanitized',
  observedMessage: {
    hostMessageId: 'assistant-source-review-summary-sanitized',
    text: 'The assistant row is reviewed by the worker.'
  }
});
assert.equal(
  JSON.stringify(sanitizedSourceReview).includes(rawSreFindingSummaryCanary),
  false,
  'Source-review worker must not persist or return raw SRE finding summaries.'
);
assert.equal(
  Object.prototype.hasOwnProperty.call(sanitizedSourceReview.findings[0], 'summary'),
  false,
  'Source-review worker findings must expose structured/hash-only summary evidence.'
);
assert.equal(sanitizedSourceReview.findings[0].summaryLength, rawSreFindingSummaryCanary.length);
assert.equal(
  sanitizedSourceReview.findings[0].summaryHash,
  hashStableJson({ summary: rawSreFindingSummaryCanary })
);
const unavailableReviewWorker = sourceReviewWorker.createSourceReviewWorker({
  sourceReconciliationEngine: {
    async reviewHostNativeContinuity() {
      throw new Error('SRE unavailable for summary shape test.');
    }
  },
  now: () => '2026-06-30T02:00:01.000Z'
});
const unavailableSourceReview = await unavailableReviewWorker.reviewHostNativeContinuity({
  mode: 'hostNativeCompletion',
  text: 'The assistant row cannot be reviewed.',
  responseId: 'response-source-review-unavailable-summary-sanitized',
  ingressId: 'ingress-source-review-unavailable-summary-sanitized',
  observedMessage: {
    hostMessageId: 'assistant-source-review-unavailable-summary-sanitized',
    text: 'The assistant row cannot be reviewed.'
  }
});
assert.equal(
  Object.prototype.hasOwnProperty.call(unavailableSourceReview.findings[0], 'summary'),
  false,
  'Source-review worker failure findings must also avoid summary text.'
);

const responseDispatcherSource = readFileSync(
  new URL('../../src/runtime/response-dispatcher.mjs', import.meta.url),
  'utf8'
);
assert.equal(
  /from\s+['"]\.\/source-reconciliation-engine\.mjs['"]/.test(responseDispatcherSource),
  false,
  'Production response-dispatcher must depend on source-review-worker instead of importing source-reconciliation-engine directly.'
);
assert.match(
  responseDispatcherSource,
  /from\s+['"]\.\/source-review-worker\.mjs['"]/,
  'Production response-dispatcher must route host-native source review through the source-review-worker owner module.'
);
assert.equal(
  /claim-quarantine\.mjs/.test(responseDispatcherSource),
  false,
  'Production response-dispatcher must not import old generated-claim quarantine as a host-native recovery authority.'
);
assert.equal(
  /\bquarantineGeneratedClaims\b/.test(responseDispatcherSource),
  false,
  'Production response-dispatcher must not write old continuity candidate/rejected claim roots.'
);

const messageReconcilerSource = readFileSync(
  new URL('../../src/runtime/message-reconciler.mjs', import.meta.url),
  'utf8'
);
assert.match(
  responseDispatcherSource,
  /createRuntimeLedgerViewAsync[\s\S]*?findLedgerIngressAsync[\s\S]*?findLedgerRecoveryAsync[\s\S]*?findLedgerResponseAsync[\s\S]*?from\s+['"]\.\/runtime-ledger-view\.mjs['"]/,
  'ResponseDispatcher must use the shared async CORE-first runtime ledger view for ingress/response/recovery lookup.'
);
assert.match(
  chatTurnOrchestratorSource,
  /createRuntimeLedgerViewAsync[\s\S]*?from\s+['"]\.\/runtime-ledger-view\.mjs['"]/,
  'ChatTurnOrchestrator response retry lookup must use the shared async CORE-first runtime ledger view.'
);
assert.match(
  messageReconcilerSource,
  /findLedgerIngressAsync[\s\S]*?findLedgerResponseAsync[\s\S]*?from\s+['"]\.\/runtime-ledger-view\.mjs['"]/,
  'MessageReconciler source mutation lookup must use the shared async CORE-first runtime ledger view.'
);
assert.match(
  messageReconcilerSource,
  /acceptCorrectAsSwipeSelection[\s\S]*?if\s*\(\s*acceptedCorrection\.matched\s*===\s*true\s*\)[\s\S]*?recordRepairSourceMutationRecovery/,
  'MessageReconciler must accept known Correct-as-Swipe candidate selections before generic selected-swipe REPAIR recovery.'
);
assert.equal(
  countSourceMatches(messageReconcilerSource, /recordRecoveryEvent\s*\(/g),
  0,
  'MessageReconciler must not write old recoveryJournal rows for source mutations.'
);
assert.match(
  messageReconcilerSource,
  /loadCoreCheckpointState[\s\S]*?coreCheckpointRestoreState[\s\S]*?executeRepairRollbackActuation/,
  'Message recovery rollback must load CORE checkpoint state and pass it to REPAIR rollback execution.'
);
assert.match(
  messageReconcilerSource,
  /if\s*\(\s*!coreRecoveryRecorded\(coreRecovery\)\s*\)\s*\{[\s\S]*?action:\s*['"]coreRecoveryRequired['"][\s\S]*?reason:\s*['"]source-mutation-core-recovery-required['"]/,
  'Message recovery must fail closed when source mutation CORE recovery cannot be recorded.'
);
assert.equal(
  countSourceMatches(messageReconcilerSource, /if\s*\(\s*!coreRecoveryRecorded\(coreRecovery\)\s*\)\s*\{[\s\S]*?recordRecoveryEvent/g),
  0,
  'Message recovery must not retain no-CORE old recovery fallback writers.'
);
assert.equal(
  messageReconcilerSource.includes('replacementTextEvidence'),
  false,
  'Message recovery must not keep old fallback replacement-text evidence helpers after no-CORE fallback removal.'
);
for (const oldDependentRecoveryType of [
  'sceneHandshakeSourceInvalidated',
  'missionComponentSourceEdited',
  'missionComponentSourceDeleted'
]) {
  assert.equal(
    messageReconcilerSource.includes(oldDependentRecoveryType),
    false,
    `REPAIR dependent invalidation must not write old recoveryJournal row ${oldDependentRecoveryType}.`
  );
}
for (const localReviewFunction of [
  'providedHostNativeReviewMatchesSource',
  'sanitizeHostNativeContinuityReview',
  'failedHostNativeContinuityReview'
]) {
  assert.equal(
    new RegExp(`function\\s+${localReviewFunction}\\b`).test(responseDispatcherSource),
    false,
    `Production response-dispatcher must not locally implement ${localReviewFunction}.`
  );
}
assert.equal(
  countSourceMatches(responseDispatcherSource, /recordRecoveryEvent\s*\(/g),
  0,
  'ResponseDispatcher must not write old recoveryJournal rows.'
);
assert.equal(
  /import\s*\{[\s\S]*?\brecordRecoveryEvent\b[\s\S]*?\}\s*from\s*['"]\.\/state-delta-gateway\.mjs['"]/.test(responseDispatcherSource),
  false,
  'ResponseDispatcher must not import old recoveryJournal writer authority.'
);
assert.equal(
  /coreCompletionError\s*&&\s*!coreCompletionDiagnosticRecorded[\s\S]*?recordRecoveryEvent/.test(responseDispatcherSource),
  false,
  'Host-native completion record failures must not write old recovery rows when CORE diagnostics cannot record.'
);
assert.equal(
  /!\s*coreBackedRecoveryRecorded[\s\S]*?recordRecoveryEvent/.test(responseDispatcherSource),
  false,
  'Host-native failed/unavailable failures must not fall back to old recovery rows.'
);
assert.equal(
  /coreReleaseError\s*&&\s*!\s*coreReleaseDiagnosticRecorded[\s\S]*?recordRecoveryEvent/.test(responseDispatcherSource),
  false,
  'HostContinue and visible response CORE failures must not write old recovery rows when CORE diagnostics cannot record.'
);
assert.match(
  responseDispatcherSource,
  /eventType\s*:\s*['"]coreHostNativeCompletionFailure['"]/,
  'Host-native completion record failures must still have compact CORE diagnostic event evidence.'
);
assert.match(
  responseDispatcherSource,
  /eventType\s*:\s*status\s*===\s*['"]failed['"]\s*\?\s*['"]hostNativeGenerationFailed['"]\s*:\s*['"]hostNativeAssistantUnavailable['"]/,
  'Host-native failed/unavailable failures must still have compact CORE recovery event evidence.'
);
assert.match(
  responseDispatcherSource,
  /eventType\s*:\s*['"]coreHostContinueReleaseFailure['"]/,
  'HostContinue release record failures must still have compact CORE diagnostic event evidence.'
);
assert.match(
  responseDispatcherSource,
  /eventType\s*:\s*['"]coreVisibleResponseRecordFailure['"]/,
  'Visible response record failures must still have compact CORE diagnostic event evidence.'
);
assert.equal(
  countSourceMatches(chatTurnOrchestratorSource, /recordRecoveryEvent\s*\(/g),
  0,
  'ChatTurnOrchestrator must not write old recoveryJournal rows.'
);
assert.match(
  chatTurnOrchestratorSource,
  /const\s+coreRecovery\s*=\s*await\s+markCoreTurnProcessingFailureForBridge/,
  'Chat-turn processing failures must attempt CORE recovery without old recovery fallback.'
);
assert.match(
  chatTurnOrchestratorSource,
  /const\s+coreResponseRecovery\s*=\s*await\s+markCoreResponseRetryRequiredForBridge/,
  'Host response post failures must attempt CORE response retry recovery without old recovery fallback.'
);
assert.equal(
  countSourceMatches(chatTurnOrchestratorSource, /if\s*\(\s*coreResponseRecovery\?\.status\s*!==\s*['"]recorded['"]\s*\)\s*\{[\s\S]*?type\s*:\s*['"]providerFailureAfterMechanicsCommit['"]/g),
  0,
  'Provider failure after mechanics commit must not write old recovery fallback rows.'
);
assert.equal(
  countSourceMatches(chatTurnOrchestratorSource, /if\s*\(\s*!postCommitConversationDiagnostic\s*\)\s*\{[\s\S]*?type\s*:\s*['"]postCommitConversationFailed['"]/g),
  0,
  'Blocking post-commit conversation failures must not write old recovery fallback rows.'
);
assert.equal(
  countSourceMatches(runtimeAppSource, /recordRecoveryEvent\s*\(/g),
  0,
  'Runtime-app must not write old recoveryJournal rows.'
);
assert.match(
  runtimeAppSource,
  /const\s+coreDiagnostic\s*=\s*await\s+appendNarrationBookkeepingMissingOutcomeDiagnostic[\s\S]*?if\s*\(\s*coreDiagnostic\s*\)\s*\{/,
  'Narration missing-outcome must not persist without CORE diagnostic evidence.'
);
assert.match(
  runtimeAppSource,
  /failureDiagnostic\s*=\s*await\s+appendPostCommitConversationCoreDiagnostic/,
  'Scheduled post-commit conversation failures must attempt CORE diagnostics without old recovery fallback.'
);

function createFakeCoreStore() {
  const calls = [];
  return {
    calls,
    async beginTurn(sourceFrame, options = {}) {
      calls.push({ method: 'beginTurn', sourceFrame: cloneJson(sourceFrame), options: cloneJson(options) });
      return { id: options.transactionId || 'txn-skeleton', sourceFrameId: sourceFrame.id };
    },
    async advanceTurn(transactionId, phasePatch = {}) {
      calls.push({ method: 'advanceTurn', transactionId, phasePatch: cloneJson(phasePatch) });
      return { id: transactionId, phase: phasePatch.phase || null };
    },
    async commitMechanics(transactionId, bundle = {}) {
      calls.push({ method: 'commitMechanics', transactionId, bundle: cloneJson(bundle) });
      return { id: transactionId, phase: 'mechanicsCommitted' };
    },
    async recordVisibleResponse(transactionId, responseRef = {}) {
      calls.push({ method: 'recordVisibleResponse', transactionId, responseRef: cloneJson(responseRef) });
      return { id: transactionId, phase: 'visibleResponsePosted' };
    },
    async repairVisibleResponseRef(transactionId, responseRef = {}) {
      calls.push({ method: 'repairVisibleResponseRef', transactionId, responseRef: cloneJson(responseRef) });
      return { id: transactionId, phase: 'visibleResponsePosted' };
    },
    async markRecoveryRequired(transactionId, recoveryBundle = {}) {
      calls.push({ method: 'markRecoveryRequired', transactionId, recoveryBundle: cloneJson(recoveryBundle) });
      return { id: recoveryBundle.id || `recovery:${transactionId}`, phase: recoveryBundle.phaseAfter || 'recoveryRequired' };
    },
    async commitBackgroundBatch(transactionId, operationBundle = {}) {
      calls.push({ method: 'commitBackgroundBatch', transactionId, operationBundle: cloneJson(operationBundle) });
      return { id: transactionId, backgroundBatchId: operationBundle.batchId };
    },
    async appendDiagnostics(transactionId, diagnostic = {}) {
      calls.push({ method: 'appendDiagnostics', transactionId, diagnostic: cloneJson(diagnostic) });
      return { id: `diag-${calls.length}`, transactionId, diagnostic: cloneJson(diagnostic) };
    },
    readProjections() {
      calls.push({ method: 'readProjections' });
      return { transactions: [] };
    },
    estimateSize() {
      calls.push({ method: 'estimateSize' });
      return 42;
    }
  };
}

const frame = createTurnSourceFrame({
  campaignId: 'campaign-ashes',
  saveId: 'save-1',
  chatId: 'chat-1',
  hostId: 'sillytavern',
  branchId: 'main',
  hostMessageId: '29',
  text: 'RAW PLAYER TEXT MUST NOT SURFACE',
  textHash: hashStableJson({ text: 'player source' }),
  currentPlayer: {
    hostMessageId: '29',
    role: 'player',
    text: 'RAW PLAYER TEXT MUST NOT SURFACE'
  },
  previousAssistant: {
    hostMessageId: '28',
    selectedSwipeIndex: 1,
    swipeCount: 3,
    selectedTextHash: hashStableJson({ text: 'accepted assistant variant' }),
    text: 'RAW ASSISTANT TEXT MUST NOT SURFACE'
  },
  externalPromptEnvironment: {
    host: 'sillytavern',
    promptKeys: ['summaryception', '3_vectfox'],
    summaryception: {
      installed: true,
      enabled: true,
      promptKeyActive: true,
      rawSummary: 'RAW SUMMARY MUST NOT SURFACE'
    },
    vectFox: {
      installed: true,
      enabled: true,
      promptKeys: ['3_vectfox'],
      vectorPayload: ['RAW VECTOR MUST NOT SURFACE']
    }
  }
});

assert.equal(frame.kind, 'directive.turnSourceFrame.v1');
assert.match(frame.id, /^frame:/);
assert.match(frame.sourceHash, /^[a-f0-9]{64}$/);
assert.equal(createSourceToken(frame), frame.sourceToken);
assert.equal(JSON.stringify(frame).includes('RAW PLAYER TEXT MUST NOT SURFACE'), false);
assert.equal(JSON.stringify(frame).includes('RAW ASSISTANT TEXT MUST NOT SURFACE'), false);
assert.equal(JSON.stringify(frame).includes('RAW SUMMARY MUST NOT SURFACE'), false);
assert.equal(JSON.stringify(frame).includes('RAW VECTOR MUST NOT SURFACE'), false);
const promptFrame = derivePromptFrame(frame);
assert.equal(promptFrame.sourceFrameId, frame.id);
assert.equal(promptFrame.externalPromptEnvironmentRef.hash, frame.externalPromptEnvironmentRef.hash);
assert.equal(assertFrameCleanForSettlement(frame, { campaignId: 'campaign-ashes' }).ok, true);
assert.throws(
  () => assertFrameCleanForSettlement({ ...frame, sourceIntegrity: 'selected-variant-hash-mismatch' }),
  (error) => error?.code === 'DIRECTIVE_FRAME_SOURCE_NOT_CLEAN'
);

const rangeFrame = createRangeSourceFrame([
  { hostMessageId: '1', role: 'player', text: 'range text 1' },
  { hostMessageId: '2', role: 'assistant', textHash: hashStableJson({ text: 'range text 2' }) }
], {
  campaignId: 'campaign-ashes',
  saveId: 'save-1',
  chatId: 'chat-1'
});
const rangeFrameAgain = createRangeSourceFrame([
  { hostMessageId: '1', role: 'player', text: 'range text 1' },
  { hostMessageId: '2', role: 'assistant', textHash: hashStableJson({ text: 'range text 2' }) }
], {
  campaignId: 'campaign-ashes',
  saveId: 'save-1',
  chatId: 'chat-1'
});
assert.equal(rangeFrame.kind, 'directive.rangeSourceFrame.v1');
assert.equal(rangeFrame.rangeHash, rangeFrameAgain.rangeHash);
assert.equal(JSON.stringify(rangeFrame).includes('range text 1'), false);

assert.deepEqual(
  normalizePromptDirtyDomains(['threadLedger', 'questLedger', 'commandBearing', 'factIndex', 'unknownRoot']),
  ['missionQuestThread', 'command', 'continuity']
);
assert.deepEqual(
  normalizePromptDirtyDomains(['relationships', 'crew', 'ship', 'mission', 'commandCulture']),
  ['crewShipRelationship', 'missionQuestThread', 'command']
);

const lensPromptInput = createLensPromptInput({
  campaignState: {
    campaign: { id: 'campaign-ashes', title: 'Ashes of Peace', status: 'active' },
    campaignChatBinding: { chatId: 'chat-1', promptContextRevision: 1 },
    runtimeTracking: { revision: 1 },
    mission: { knownFacts: ['The Breckenridge is underway.'] },
    commandLog: { entries: [] }
  },
  assets: {
    packageData: { id: 'ashes-package', crew: { senior: [] } },
    crewDataset: { officers: [] },
    shipDataset: { id: 'breckenridge' },
    projection: { id: 'ashes-projection' }
  },
  promptFrame: {
    playerText: 'Hold position and ask for a report.',
    recentChatMessages: [{ id: '1', role: 'player', text: 'Hold position.' }],
    scene: { activePhaseId: 'phase-1' }
  },
  createdAt: '2026-06-30T02:00:00.000Z'
});
const lensPacket = await buildLensPromptPacket({
  promptInput: lensPromptInput,
  revision: 7,
  cacheKey: 'cache-key-7',
  dirtyDomains: ['missionQuestThread'],
  externalPromptEnvironmentRef: frame.externalPromptEnvironmentRef
});
assert.equal(lensPacket.kind, 'directive.playerSafePromptContext');
assert.equal(lensPacket.revision, 7);
assert.equal(lensPacket.cacheKey, 'cache-key-7');
assert.deepEqual(lensPacket.lensDirtyDomains, ['missionQuestThread']);
assert.equal(lensPacket.externalPromptEnvironmentRef.hash, frame.externalPromptEnvironmentRef.hash);
const lensPacketSummary = lensPromptPacketProjectionSummary(lensPacket);
assert.equal(lensPacketSummary.revision, 7);
assert.equal(lensPacketSummary.blockCount > 0, true);

const lensCore = createFakeCoreStore();
const installedPackets = [];
const clearedPackets = [];
const lensBuildCalls = [];
const lens = createLensPromptScheduler({
  coreStore: lensCore,
  clock: () => '2026-06-30T02:00:00.000Z',
  buildDirectivePromptPacket: async ({ revision, dirtyDomains, cacheKey, cacheInputs, externalPromptEnvironmentRef }) => {
    lensBuildCalls.push({ revision, dirtyDomains, cacheKey, cacheInputs, externalPromptEnvironmentRef });
    return {
      kind: 'directive.playerSafePromptContext',
      revision,
      cacheKey,
      rawPromptBody: 'RAW LENS PACKET PROMPT MUST NOT PERSIST',
      rawResponse: 'RAW LENS PACKET RESPONSE MUST NOT PERSIST',
      blocks: [{
        id: 'macro-skeleton',
        promptKey: 'not.directive.key',
        text: `Dirty: ${dirtyDomains.join(',')}`
      }]
    };
  },
  installPromptPacket: async (packet) => {
    installedPackets.push(cloneJson(packet));
    return { ok: true };
  },
  clearPromptPacket: async (options = {}) => {
    clearedPackets.push(cloneJson(options));
    return { ok: true, status: 'cleared' };
  },
  observeExternalPromptEnvironment: async () => ({
    host: 'sillytavern',
    status: 'observed',
    promptKeys: ['summaryception', '3_vectfox'],
    summaryception: {
      installed: true,
      enabled: true,
      promptKeyActive: true,
      rawSummary: 'RAW SUMMARY FROM LENS OBSERVER MUST NOT PERSIST'
    },
    vectFox: {
      installed: true,
      enabled: true,
      promptKeys: ['3_vectfox'],
      vectorPayload: ['RAW VECTOR FROM LENS OBSERVER MUST NOT PERSIST']
    }
  })
});
lens.markDirty({
  lane: 'visible',
  dirtyDomains: ['threadLedger', 'commandBearing'],
  idempotencyKey: 'dirty-1'
});
const lensFlush = await lens.flushVisible({
  transactionId: 'txn-lens',
  binding: { campaignId: 'campaign-ashes' },
  campaignContext: { mechanicsRevision: 1 },
  promptFrame,
  externalPromptEnvironmentRef: frame.externalPromptEnvironmentRef,
  idempotencyKey: 'flush-1'
});
assert.equal(lensFlush.status, 'installed');
assert.equal(lensFlush.rebuilt, true);
assert.equal(lensFlush.appliesTo, 'currentOrNextDirectiveGeneration');
assert.deepEqual(lensFlush.dirtyDomains, ['missionQuestThread', 'command']);
assert.equal(lensFlush.packet.blocks[0].promptKey.startsWith('directive.'), true);
assert.equal(installedPackets.length, 1);
assert.equal(lensBuildCalls.length, 1);
assert.equal(lensBuildCalls[0].externalPromptEnvironmentRef.hash, frame.externalPromptEnvironmentRef.hash);
assert.equal(lensCore.calls.some((call) => call.diagnostic?.cacheRecord?.externalPromptEnvironmentRef?.hash === frame.externalPromptEnvironmentRef.hash), true);
assert.equal(JSON.stringify(lensCore.calls).includes('RAW LENS PACKET PROMPT MUST NOT PERSIST'), false);
assert.equal(JSON.stringify(lensCore.calls).includes('RAW LENS PACKET RESPONSE MUST NOT PERSIST'), false);

lens.markDirty({
  lane: 'visible',
  dirtyDomains: ['threadLedger', 'commandBearing'],
  idempotencyKey: 'dirty-1-repeat'
});
const reusedFlush = await lens.flushVisible({
  transactionId: 'txn-lens',
  binding: { campaignId: 'campaign-ashes' },
  campaignContext: { mechanicsRevision: 1 },
  promptFrame,
  externalPromptEnvironmentRef: frame.externalPromptEnvironmentRef,
  idempotencyKey: 'flush-1-repeat'
});
assert.equal(reusedFlush.status, 'reused');
assert.equal(reusedFlush.rebuilt, false);
assert.equal(installedPackets.length, 1);
assert.equal(lensBuildCalls.length, 1);

lens.markDirty({
  lane: 'visible',
  dirtyDomains: ['factIndex'],
  idempotencyKey: 'dirty-recall-revision'
});
const revisionFlush = await lens.flushVisible({
  transactionId: 'txn-lens-revision',
  binding: { campaignId: 'campaign-ashes' },
  campaignContext: {
    mechanicsRevision: 1,
    recallIndexRevision: 'recall-revision-from-core',
    sceneSealRevision: 'scene-seal-revision-from-core',
    pressureArcDigestRevision: 'pressure-arc-revision-from-core'
  },
  promptFrame,
  externalPromptEnvironmentRef: frame.externalPromptEnvironmentRef,
  idempotencyKey: 'flush-recall-revision'
});
assert.equal(revisionFlush.status, 'installed');
assert.equal(revisionFlush.rebuilt, true);
assert.equal(revisionFlush.cacheInputs.recallIndexRevision, 'recall-revision-from-core');
assert.equal(revisionFlush.cacheInputs.sceneSealRevision, 'scene-seal-revision-from-core');
assert.equal(revisionFlush.cacheInputs.pressureArcDigestRevision, 'pressure-arc-revision-from-core');
assert.equal(installedPackets.length, 2);
assert.equal(lensBuildCalls.length, 2);
assert.equal(lensBuildCalls[1].cacheInputs.recallIndexRevision, 'recall-revision-from-core');
assert.equal(installedPackets[1].cacheInputs.sceneSealRevision, 'scene-seal-revision-from-core');
assert.equal(installedPackets[1].cacheInputs.pressureArcDigestRevision, 'pressure-arc-revision-from-core');
assert.equal(lens.inspect().installed.visible.cacheInputs.sceneSealRevision, 'scene-seal-revision-from-core');
assert.equal(lens.inspect().installed.visible.cacheInputs.pressureArcDigestRevision, 'pressure-arc-revision-from-core');
assert.equal(lensCore.calls.some((call) => call.diagnostic?.cacheInputs?.recallIndexRevision === 'recall-revision-from-core'), true);

lens.markDirty({
  lane: 'visible',
  dirtyDomains: ['factIndex'],
  idempotencyKey: 'dirty-recall-revision-repeat'
});
const sameRevisionFlush = await lens.flushVisible({
  transactionId: 'txn-lens-revision-repeat',
  binding: { campaignId: 'campaign-ashes' },
  campaignContext: {
    mechanicsRevision: 1,
    recallIndexRevision: 'recall-revision-from-core',
    sceneSealRevision: 'scene-seal-revision-from-core',
    pressureArcDigestRevision: 'pressure-arc-revision-from-core'
  },
  promptFrame,
  externalPromptEnvironmentRef: frame.externalPromptEnvironmentRef,
  idempotencyKey: 'flush-recall-revision-repeat'
});
assert.equal(sameRevisionFlush.status, 'reused');
assert.equal(sameRevisionFlush.rebuilt, false);
assert.equal(installedPackets.length, 2);
assert.equal(lensBuildCalls.length, 2);

lens.markDirty({
  lane: 'visible',
  dirtyDomains: ['factIndex'],
  idempotencyKey: 'dirty-scene-seal-revision-change'
});
const changedSceneSealFlush = await lens.flushVisible({
  transactionId: 'txn-lens-scene-seal-change',
  binding: { campaignId: 'campaign-ashes' },
  campaignContext: {
    mechanicsRevision: 1,
    recallIndexRevision: 'recall-revision-from-core',
    sceneSealRevision: 'scene-seal-revision-changed',
    pressureArcDigestRevision: 'pressure-arc-revision-from-core'
  },
  promptFrame,
  externalPromptEnvironmentRef: frame.externalPromptEnvironmentRef,
  idempotencyKey: 'flush-scene-seal-revision-change'
});
assert.equal(changedSceneSealFlush.status, 'installed');
assert.equal(changedSceneSealFlush.cacheInputs.sceneSealRevision, 'scene-seal-revision-changed');
assert.equal(installedPackets.length, 3);
assert.equal(lensBuildCalls.length, 3);

lens.markDirty({
  lane: 'visible',
  dirtyDomains: ['factIndex'],
  idempotencyKey: 'dirty-pressure-arc-revision-change'
});
const changedPressureArcFlush = await lens.flushVisible({
  transactionId: 'txn-lens-pressure-arc-change',
  binding: { campaignId: 'campaign-ashes' },
  campaignContext: {
    mechanicsRevision: 1,
    recallIndexRevision: 'recall-revision-from-core',
    sceneSealRevision: 'scene-seal-revision-changed',
    pressureArcDigestRevision: 'pressure-arc-revision-changed'
  },
  promptFrame,
  externalPromptEnvironmentRef: frame.externalPromptEnvironmentRef,
  idempotencyKey: 'flush-pressure-arc-revision-change'
});
assert.equal(changedPressureArcFlush.status, 'installed');
assert.equal(changedPressureArcFlush.cacheInputs.pressureArcDigestRevision, 'pressure-arc-revision-changed');
assert.equal(installedPackets.length, 4);
assert.equal(lensBuildCalls.length, 4);

lens.markDirty({
  lane: 'visible',
  dirtyDomains: ['factIndex'],
  idempotencyKey: 'dirty-observe-external'
});
const observedFlush = await lens.flushVisible({
  transactionId: 'txn-lens-observe',
  binding: { campaignId: 'campaign-ashes' },
  campaignContext: { mechanicsRevision: 2 },
  promptFrame,
  idempotencyKey: 'flush-observe-external'
});
assert.equal(observedFlush.status, 'installed');
assert.equal(observedFlush.externalPromptEnvironmentRef.knownExternalPromptKeys.includes('summaryception'), true);
assert.equal(observedFlush.externalPromptEnvironmentRef.knownExternalPromptKeys.includes('3_vectfox'), true);
assert.equal(installedPackets.length, 5);
assert.equal(lensBuildCalls.length, 5);
assert.equal(JSON.stringify(lensCore.calls).includes('RAW SUMMARY FROM LENS OBSERVER MUST NOT PERSIST'), false);
assert.equal(JSON.stringify(lensCore.calls).includes('RAW VECTOR FROM LENS OBSERVER MUST NOT PERSIST'), false);
lens.markDirty({
  lane: 'background',
  dirtyDomains: ['continuity'],
  idempotencyKey: 'dirty-background-before-clear'
});
const backgroundBeforeClear = await lens.flushBackground({
  transactionId: 'txn-lens-background-clear',
  binding: { campaignId: 'campaign-ashes' },
  campaignContext: { mechanicsRevision: 3 },
  promptFrame,
  externalPromptEnvironmentRef: frame.externalPromptEnvironmentRef,
  idempotencyKey: 'flush-background-before-clear'
});
assert.equal(backgroundBeforeClear.status, 'installed');
assert.equal(lens.inspect().installed.background.directiveOwnedRevision > 0, true);
const lensSuspend = await lens.suspendDirectivePrompt({
  transactionId: 'txn-lens-suspend',
  lane: 'visible',
  allLanes: true,
  reason: 'unbound-chat'
});
assert.equal(lensSuspend.status, 'suspended');
assert.equal(lensSuspend.lane, 'all');
assert.deepEqual(clearedPackets, [{ lane: 'all', reason: 'unbound-chat', preservePacket: true }]);
assert.equal(lens.inspect().installed.visible.directiveOwnedRevision > 0, true);
assert.equal(lens.inspect().installed.background.directiveOwnedRevision > 0, true);
assert.equal(lens.inspect().suspended.visible.preservePacket, true);
assert.equal(lens.inspect().suspended.background.preservePacket, true);
const lensBuildCallsBeforeResume = lensBuildCalls.length;
const installedPacketsBeforeResume = installedPackets.length;
lens.markDirty({
  lane: 'visible',
  dirtyDomains: ['factIndex'],
  idempotencyKey: 'dirty-resume-suspended'
});
const resumedAfterSuspend = await lens.flushVisible({
  transactionId: 'txn-lens-resume-suspended',
  binding: { campaignId: 'campaign-ashes' },
  campaignContext: { mechanicsRevision: 2 },
  promptFrame,
  externalPromptEnvironmentRef: observedFlush.externalPromptEnvironmentRef,
  idempotencyKey: 'flush-resume-suspended'
});
assert.equal(resumedAfterSuspend.status, 'installed', 'Suspended LENS lanes must reinstall instead of returning a false cache reuse.');
assert.equal(resumedAfterSuspend.rebuilt, true);
assert.equal(lensBuildCalls.length, lensBuildCallsBeforeResume + 1);
assert.equal(installedPackets.length, installedPacketsBeforeResume + 1);
assert.equal(lens.inspect().suspended.visible, undefined);
assert.equal(lens.inspect().suspended.background.preservePacket, true);
assert.equal(lensCore.calls.some((call) => call.diagnostic?.status === 'suspendedDirectivePrompt'), true);
assert.equal(lensCore.calls.some((call) => call.diagnostic?.resumedFromSuspension === true), true);
const lensClear = await lens.clearDirectivePrompt({
  transactionId: 'txn-lens-clear',
  lane: 'visible',
  allLanes: true,
  reason: 'manual-clear'
});
assert.equal(lensClear.status, 'cleared');
assert.equal(lensClear.lane, 'all');
assert.deepEqual(clearedPackets, [
  { lane: 'all', reason: 'unbound-chat', preservePacket: true },
  { lane: 'all', reason: 'manual-clear' }
]);
assert.deepEqual(lens.inspect().installed, {});
assert.deepEqual(lens.inspect().suspended, {});
assert.equal(lensCore.calls.some((call) => call.diagnostic?.status === 'clearedDirectivePrompt'), true);
const failingClearCore = createFakeCoreStore();
const failingClearLens = createLensPromptScheduler({
  coreStore: failingClearCore,
  clock: () => '2026-06-30T02:00:01.000Z',
  clearPromptPacket: async () => ({ ok: false, status: 'failed', reason: 'host-clear-failed' })
});
failingClearLens.markDirty({
  lane: 'visible',
  dirtyDomains: ['command'],
  idempotencyKey: 'dirty-before-failed-clear'
});
const beforeFailedClear = await failingClearLens.flushVisible({
  transactionId: 'txn-lens-clear-failure',
  binding: { campaignId: 'campaign-ashes' },
  campaignContext: { mechanicsRevision: 4 },
  promptFrame,
  idempotencyKey: 'flush-before-failed-clear'
});
assert.equal(beforeFailedClear.status, 'installed');
const failedLensClear = await failingClearLens.clearDirectivePrompt({
  transactionId: 'txn-lens-clear-failure',
  reason: 'manual-clear'
});
assert.equal(failedLensClear.status, 'failed');
assert.equal(failingClearLens.inspect().installed.visible.directiveOwnedRevision, beforeFailedClear.directiveOwnedRevision);
assert.equal(failingClearCore.calls.some((call) => call.diagnostic?.status === 'clearDirectivePromptFailed'), true);
const failingSuspendCore = createFakeCoreStore();
const failedSuspendPackets = [];
const failingSuspendLens = createLensPromptScheduler({
  coreStore: failingSuspendCore,
  clock: () => '2026-06-30T02:00:02.000Z',
  clearPromptPacket: async (options = {}) => {
    failedSuspendPackets.push(cloneJson(options));
    return { ok: false, status: 'failed', reason: 'host-suspend-failed' };
  }
});
failingSuspendLens.markDirty({
  lane: 'visible',
  dirtyDomains: ['command'],
  idempotencyKey: 'dirty-before-failed-suspend'
});
const beforeFailedSuspend = await failingSuspendLens.flushVisible({
  transactionId: 'txn-lens-suspend-failure',
  binding: { campaignId: 'campaign-ashes' },
  campaignContext: { mechanicsRevision: 5 },
  promptFrame,
  idempotencyKey: 'flush-before-failed-suspend'
});
const failedLensSuspend = await failingSuspendLens.suspendDirectivePrompt({
  transactionId: 'txn-lens-suspend-failure',
  reason: 'unbound-chat'
});
assert.equal(failedLensSuspend.status, 'failed');
assert.deepEqual(failedSuspendPackets, [{ lane: 'visible', reason: 'unbound-chat', preservePacket: true }]);
assert.equal(failingSuspendLens.inspect().installed.visible.directiveOwnedRevision, beforeFailedSuspend.directiveOwnedRevision);
assert.deepEqual(failingSuspendLens.inspect().suspended, {});
assert.equal(failingSuspendCore.calls.some((call) => call.diagnostic?.status === 'suspendDirectivePromptFailed'), true);
const diagnosticOnly = await lens.recordDiagnosticOnly({
  transactionId: 'txn-lens',
  payload: {
    rawPrompt: 'RAW PROMPT MUST BE REDACTED',
    apiKey: 'SECRET'
  }
});
assert.equal(diagnosticOnly.dirtyPrompt, false);
assert.equal(JSON.stringify(lensCore.calls).includes('RAW PROMPT MUST BE REDACTED'), false);
assert.equal(JSON.stringify(lensCore.calls).includes('SECRET'), false);

const sourceCore = createFakeCoreStore();
let providerCalled = false;
const sourceSettlement = createSourceSettlementService({
  coreStore: sourceCore,
  runLatestPairProvider: async () => {
    providerCalled = true;
    return { operations: [] };
  }
});
const cleanPreflight = await sourceSettlement.preflightLatestPair({
  transactionId: 'txn-sre-preflight',
  sourceFrame: frame,
  expected: {
    campaignId: 'campaign-ashes',
    saveId: 'save-1',
    chatId: 'chat-1'
  }
});
assert.equal(cleanPreflight.status, 'preflightClean');
assert.equal(cleanPreflight.providerCalled, false);
assert.equal(cleanPreflight.applied, false);
assert.equal(providerCalled, false);
const rangePreflight = await sourceSettlement.preflightRange({
  transactionId: 'txn-sre-range-preflight',
  messages: [{
    hostMessageId: 'range-message-1',
    chatId: 'chat-1',
    role: 'player',
    text: 'RAW RANGE PREFLIGHT TEXT MUST NOT PERSIST'
  }],
  expected: {
    campaignId: 'campaign-ashes',
    saveId: 'save-1',
    chatId: 'other-chat'
  },
  reasons: ['range-preflight-contract']
});
assert.equal(rangePreflight.status, 'hardSkipped');
assert.equal(rangePreflight.providerCalled, false);
assert.equal(rangePreflight.applied, false);
assert.equal(rangePreflight.reasons.includes('wrong-chat'), true);
assert.equal(providerCalled, false);
assert.equal(JSON.stringify(sourceCore.calls).includes('RAW RANGE PREFLIGHT TEXT MUST NOT PERSIST'), false);
const hardSkipped = await sourceSettlement.settleLatestPair({
  transactionId: 'txn-sre',
  sourceFrame: {
    ...frame,
    selectedAssistantVariantHash: 'hash-a'
  },
  expected: {
    selectedAssistantVariantHash: 'hash-b'
  }
});
assert.equal(hardSkipped.status, 'hardSkipped');
assert.equal(hardSkipped.providerCalled, false);
assert.equal(providerCalled, false);
assert.equal(sourceCore.calls.some((call) => call.method === 'appendDiagnostics'), true);

const normalizedWorker = normalizeForgeWorkerResult({
  id: 'continuity',
  roleId: 'continuityProjectionPlanner',
  allowedRoots: ['continuity']
}, {
  rawPrompt: 'RAW FORGE PROMPT',
  rawResponse: 'RAW FORGE RESPONSE',
  operations: [{
    domain: 'continuity',
    op: 'upsertFactHash',
    path: 'continuity.factIndex',
    value: { rawText: 'RAW FACT' }
  }],
  promptDirtyDomains: ['continuity']
});
assert.equal(normalizedWorker.operations.length, 1);
assert.match(normalizedWorker.operations[0].valueHash, /^[a-f0-9]{64}$/);
assert.equal(JSON.stringify(normalizedWorker).includes('RAW FORGE PROMPT'), false);
assert.equal(JSON.stringify(normalizedWorker).includes('RAW FORGE RESPONSE'), false);
assert.equal(JSON.stringify(normalizedWorker).includes('RAW FACT'), false);

const conflict = findForgePathConflict([
  { workerId: 'a', operations: [{ path: 'continuity.factIndex' }] },
  { workerId: 'b', operations: [{ path: 'continuity.factIndex' }] }
]);
assert.equal(conflict.path, 'continuity.factIndex');

const batch = createForgeBatchCommit({
  transactionId: 'txn-forge',
  sourceFrame: frame,
  workerResults: [normalizedWorker],
  idempotencyKey: 'forge-1'
});
assert.equal(batch.kind, 'directive.forgeBatchCommit.v1');
assert.equal(batch.operations.length, 1);
assert.equal(batch.acceptedBatchHash, hashStableJson([normalizedWorker]));
assert.deepEqual(batch.promptDirtyDomains, ['continuity']);
assert.throws(
  () => createForgeBatchCommit({
    transactionId: 'txn-forge-spoof',
    sourceFrame: frame,
    workerResults: [normalizedWorker],
    acceptedBatchHash: 'spoofed-accepted-batch-hash',
    idempotencyKey: 'forge-spoof-1'
  }),
  (error) => error?.code === 'DIRECTIVE_FORGE_ACCEPTED_BATCH_HASH_MISMATCH'
);

const forgeCore = createFakeCoreStore();
const forgeLens = createLensPromptScheduler({
  clock: () => '2026-06-30T02:01:00.000Z',
  installPromptPacket: async () => ({ ok: true })
});
const forge = createForgeCoordinator({
  coreStore: forgeCore,
  lens: forgeLens,
  isSourceCurrent: async () => ({ ok: true })
});
const forgeResult = await forge.run({
  transactionId: 'txn-forge',
  sourceFrame: frame,
  sourceToken: frame.sourceToken,
  idempotencyKey: 'forge-run-1',
  workers: [{
    id: 'continuity',
    allowedRoots: ['continuity'],
    async run() {
      return {
        operations: [{
          domain: 'continuity',
          op: 'upsertFactHash',
          path: 'continuity.factIndex',
          value: { rawText: 'RAW FORGE VALUE' }
        }],
        promptDirtyDomains: ['continuity'],
        rawPrompt: 'RAW FORGE RUN PROMPT'
      };
    }
  }]
});
assert.equal(forgeResult.status, 'applied');
assert.equal(forgeCore.calls.some((call) => call.method === 'commitBackgroundBatch'), true);
const forgeRunBackgroundCommit = forgeCore.calls.find((call) => call.method === 'commitBackgroundBatch' && call.transactionId === 'txn-forge');
assert.equal(forgeRunBackgroundCommit.operationBundle.forgeBatchRef.acceptedBatchHash, forgeResult.acceptedBatchHash);
assert.equal(forgeRunBackgroundCommit.operationBundle.forgeBatchRef.operationBundleHash, forgeResult.batch.operationBundleHash);
assert.equal(JSON.stringify(forgeCore.calls).includes('RAW FORGE VALUE'), false);
assert.equal(JSON.stringify(forgeCore.calls).includes('RAW FORGE RUN PROMPT'), false);
const forgeReplay = await forge.run({
  transactionId: 'txn-forge',
  sourceFrame: frame,
  sourceToken: frame.sourceToken,
  idempotencyKey: 'forge-run-1',
  workers: [{
    id: 'continuity',
    async run() {
      throw new Error('replay must not run worker');
    }
  }]
});
assert.equal(forgeReplay.status, 'replayed');
const forgeRunAcceptedReplayMismatch = await forge.settleAcceptedBatch({
  transactionId: 'txn-forge',
  sourceFrame: frame,
  sourceToken: frame.sourceToken,
  idempotencyKey: 'forge-run-1',
  workerResults: [{
    kind: 'directive.forgeWorkerResult.v1',
    workerId: 'continuity',
    status: 'accepted',
    operations: [{
      domain: 'continuity',
      op: 'upsertFactHash',
      path: 'continuity.factIndex',
      valueHash: hashStableJson({ different: true }),
      workerId: 'continuity'
    }],
    promptDirtyDomains: ['continuity']
  }]
});
assert.equal(forgeRunAcceptedReplayMismatch.status, 'rejected');
assert.equal(forgeRunAcceptedReplayMismatch.reason, 'accepted-batch-replay-mismatch');
let sidecarProviderCalls = 0;
const sidecarExecution = await forge.runProviderBatch({
  transactionId: 'txn-forge-sidecar-provider',
  idempotencyKey: 'forge-sidecar-provider-1',
  sourceToken: frame.sourceToken,
  sourceFrameRef: { id: frame.id, sourceToken: frame.sourceToken },
  upstreamOwner: 'campaignSidecarScheduler',
  jobs: [{
    id: 'sidecar-provider-job-1',
    type: 'continuity',
    roleId: 'continuityTracker',
    source: { campaignId: 'campaign-ashes', saveId: 'save-1', chatId: 'chat-1' },
    snapshot: { campaignState: {}, turnContext: {} },
    request: {
      systemPrompt: 'RAW SIDECAR SYSTEM PROMPT',
      prompt: 'RAW SIDECAR PROVIDER PROMPT',
      maxTokens: 128
    },
    policy: { timeoutMs: 1000, mayProposeState: true }
  }],
  runProviderBatch: async ({ jobs }) => ({
    concurrent: false,
    results: jobs.map((job) => {
      sidecarProviderCalls += 1;
      return {
        id: job.id,
        type: job.type,
        roleId: job.roleId,
        status: 'complete',
        completedAt: '2026-06-29T12:00:00.000Z',
        packet: 'RAW SIDECAR PROVIDER OUTPUT',
        diagnostics: { providerId: 'fake-sidecar-provider', latencyMs: 12 }
      };
    })
  })
});
assert.equal(sidecarExecution.status, 'complete');
assert.equal(sidecarExecution.providerOwner, 'forge');
assert.equal(sidecarExecution.upstreamOwner, 'campaignSidecarScheduler');
assert.equal(sidecarExecution.batch.results[0].packet, 'RAW SIDECAR PROVIDER OUTPUT');
assert.equal(sidecarProviderCalls, 1);
assert.equal(JSON.stringify(forgeCore.calls).includes('RAW SIDECAR PROVIDER PROMPT'), false);
assert.equal(JSON.stringify(forgeCore.calls).includes('RAW SIDECAR PROVIDER OUTPUT'), false);
const sidecarExecutionReplay = await forge.runProviderBatch({
  transactionId: 'txn-forge-sidecar-provider',
  idempotencyKey: 'forge-sidecar-provider-1',
  jobs: [],
  runProviderBatch: async () => {
    throw new Error('sidecar provider replay must not rerun generation');
  }
});
assert.equal(sidecarExecutionReplay.status, 'replayed');
assert.equal(sidecarProviderCalls, 1);
let sidecarFailureCalls = 0;
await assert.rejects(
  forge.runProviderBatch({
    transactionId: 'txn-forge-sidecar-provider-failure',
    idempotencyKey: 'forge-sidecar-provider-failure-1',
    jobs: [],
    runProviderBatch: async () => {
      sidecarFailureCalls += 1;
      const error = new Error('provider failed before packet');
      error.code = 'DIRECTIVE_TEST_PROVIDER_FAILED';
      throw error;
    }
  }),
  (error) => error?.code === 'DIRECTIVE_TEST_PROVIDER_FAILED'
    && /FORGE provider batch failed/.test(error.message)
    && !/provider failed before packet/.test(error.message)
);
const sidecarFailureReplay = await forge.runProviderBatch({
  transactionId: 'txn-forge-sidecar-provider-failure',
  idempotencyKey: 'forge-sidecar-provider-failure-1',
  jobs: [],
  runProviderBatch: async () => {
    throw new Error('failed provider replay must not rerun generation');
  }
});
assert.equal(sidecarFailureReplay.status, 'replayed');
assert.equal(sidecarFailureReplay.originalStatus, 'failed');
assert.equal(sidecarFailureReplay.error.code, 'DIRECTIVE_TEST_PROVIDER_FAILED');
assert.equal(sidecarFailureCalls, 1);
const settledAccepted = await forge.settleAcceptedBatch({
  transactionId: 'txn-forge-sidecar',
  sourceFrame: frame,
  sourceToken: frame.sourceToken,
  idempotencyKey: 'forge-sidecar-settle-1',
  providerOwner: 'campaignSidecarScheduler',
  promptDirtyDomains: ['crew'],
  workerResults: [{
    kind: 'directive.forgeWorkerResult.v1',
    workerId: 'crew',
    status: 'accepted',
    operations: [{
      domain: 'crew',
      op: 'append',
      path: 'crew.casualties',
      valueHash: hashStableJson({ rawText: 'RAW SIDECAR VALUE' }),
      workerId: 'crew'
    }],
    promptDirtyDomains: ['crewShipRelationship']
  }]
});
assert.equal(settledAccepted.status, 'settled');
assert.equal(settledAccepted.providerCallAttempted, false);
assert.equal(settledAccepted.providerOwner, 'campaignSidecarScheduler');
assert.equal(forgeCore.calls.filter((call) => call.method === 'commitBackgroundBatch').length, 2);
assert.equal(JSON.stringify(forgeCore.calls).includes('RAW SIDECAR VALUE'), false);
const settledReplayWithoutEvidence = await forge.settleAcceptedBatch({
  transactionId: 'txn-forge-sidecar',
  sourceFrame: frame,
  sourceToken: frame.sourceToken,
  idempotencyKey: 'forge-sidecar-settle-1',
  workerResults: []
});
assert.equal(settledReplayWithoutEvidence.status, 'rejected');
assert.equal(settledReplayWithoutEvidence.reason, 'accepted-batch-replay-mismatch');
const settledReplay = await forge.settleAcceptedBatch({
  transactionId: 'txn-forge-sidecar',
  sourceFrame: frame,
  sourceToken: frame.sourceToken,
  idempotencyKey: 'forge-sidecar-settle-1',
  acceptedBatchHash: settledAccepted.acceptedBatchHash,
  workerResults: []
});
assert.equal(settledReplay.status, 'replayed');
assert.equal(forgeCore.calls.filter((call) => call.method === 'commitBackgroundBatch').length, 2);

const coreStore = createFakeCoreStore();
const coreRuntime = createCoreTurnRuntime({ coreStore });
await coreRuntime.observeSource(frame, { transactionId: 'txn-core' });
await coreRuntime.routePending('txn-core', { route: 'directiveCommit' });
await coreRuntime.releaseHostContinue('txn-core', { strategy: 'injectAndContinue' });
await coreRuntime.commitDirectiveMechanics('txn-core', { operations: [] });
await coreRuntime.recordVisibleResponse('txn-core', { responseKind: 'directivePosted' });
await coreRuntime.openRecovery('txn-core', { reason: 'test' });
await coreRuntime.settleBackgroundBatch('txn-core', { batchId: 'background:test' });
await coreRuntime.appendDiagnostic('txn-core', { type: 'test' });
assert.deepEqual(coreStore.calls.map((call) => call.method), [
  'beginTurn',
  'advanceTurn',
  'advanceTurn',
  'commitMechanics',
  'recordVisibleResponse',
  'markRecoveryRequired',
  'commitBackgroundBatch',
  'appendDiagnostics'
]);
assert.equal(coreStore.calls[1].phasePatch.phase, 'routePending');
assert.equal(coreStore.calls[1].phasePatch.route, 'directiveCommit');
assert.equal(coreStore.calls[2].phasePatch.phase, 'hostContinueReleased');
assert.equal(coreStore.calls[2].phasePatch.strategy, 'injectAndContinue');

const repairCalls = [];
const repairBoundary = createRepairCommandBoundary({
  repairRuntime: {
    recordSourceMutationRecovery(input) {
      repairCalls.push(['source', input]);
      return { status: 'recorded' };
    },
    recordVisibilityMutation(input) {
      repairCalls.push(['visibility', input]);
      return { status: 'diagnosticOnly' };
    },
    recordResponseRecovery(input) {
      repairCalls.push(['response', input]);
      return { status: 'recorded' };
    },
    evaluateResponseRetryActuation(input) {
      repairCalls.push(['retry', input]);
      return { authorized: true };
    },
    evaluateRollbackActuation(input) {
      repairCalls.push(['rollback', input]);
      return { authorized: true };
    },
    evaluateSourceReobserve(input) {
      repairCalls.push(['reobserve', input]);
      return { authorized: true };
    },
    evaluateOutcomeRerunActuation(input) {
      repairCalls.push(['rerun', input]);
      return { authorized: true };
    },
    evaluateTerminalCheckpointReplayActuation(input) {
      repairCalls.push(['terminalReplay', input]);
      return { authorized: true };
    },
    evaluateResponseReobserveClosure(input) {
      repairCalls.push(['closure', input]);
      return { authorized: true };
    }
  }
});
assert.equal(repairBoundary.handleSourceMutation({ eventType: 'messageUpdated' }).status, 'recorded');
assert.equal(repairBoundary.handleVisibilityMutation({ eventType: 'messageUpdated' }).status, 'diagnosticOnly');
assert.equal(repairBoundary.handleResponseFailure({ eventType: 'hostResponsePostFailure' }).status, 'recorded');
assert.equal(repairBoundary.authorizeRetry({ transactionId: 'txn' }).authorized, true);
assert.equal(repairBoundary.authorizeRollback({ transactionId: 'txn' }).authorized, true);
assert.equal(repairBoundary.authorizeRerunBranch({ transactionId: 'txn' }).authorized, true);
assert.equal(repairBoundary.authorizeTerminalCheckpointReplay({ decisionId: 'decision' }).authorized, true);
assert.equal(repairBoundary.authorizeReobserveClosure({ transactionId: 'txn' }).authorized, true);
assert.equal(repairBoundary.recordResponseRecovery({ eventType: 'hostResponsePostFailure' }).status, 'recorded');
assert.equal(repairBoundary.evaluateResponseRetryActuation({ transactionId: 'txn' }).authorized, true);
assert.equal(repairBoundary.evaluateRollbackActuation({ transactionId: 'txn' }).authorized, true);
assert.equal(repairBoundary.evaluateTerminalCheckpointReplayActuation({ decisionId: 'decision' }).authorized, true);
assert.equal(repairBoundary.evaluateResponseReobserveClosure({ transactionId: 'txn' }).authorized, true);
assert.deepEqual(repairCalls.map(([name]) => name), [
  'source',
  'visibility',
  'response',
  'retry',
  'rollback',
  'rerun',
  'terminalReplay',
  'closure',
  'response',
  'retry',
  'rollback',
  'terminalReplay',
  'closure'
]);

const rollbackPrevalidationCalls = [];
const rollbackPrevalidationBoundary = createRepairCommandBoundary({
  now: () => '2026-06-28T15:03:00.000Z',
  repairRuntime: {
    async recordRollbackActuation(input = {}) {
      rollbackPrevalidationCalls.push(cloneJson(input));
      return { status: 'recorded', rollback: { id: 'rollback-prevalidation' } };
    }
  }
});
const rollbackPrevalidation = await rollbackPrevalidationBoundary.executeRollbackActuation({
  coreRecovery: {
    transactionId: 'txn-rollback-prevalidation',
    recoveryCaseId: 'recovery-rollback-prevalidation',
    decision: { transactionId: 'txn-rollback-prevalidation' },
    sourceMutation: { eventType: 'playerMessageDeleted' }
  },
  rollbackActuation: {
    kind: 'directive.repairRollbackActuationDecision.v1',
    authorized: true,
    action: 'restorePreOutcomeRevision',
    transactionId: 'txn-rollback-prevalidation',
    restoreRevision: 999
  },
  legacyProjection: {
    shouldRestoreRevision: true,
    restoreRevision: 999
  },
  eventType: 'playerMessageDeleted',
  campaignState: {
    campaign: { id: 'campaign-rollback-prevalidation' },
    runtimeTracking: {
      history: [],
      recoveryJournal: []
    }
  }
});
assert.equal(rollbackPrevalidation.status, 'blocked', 'REPAIR rollback execution should block when restore candidate cannot be computed.');
assert.equal(rollbackPrevalidation.reason, 'rollback-restore-unavailable');
assert.equal(rollbackPrevalidationCalls.length, 0, 'CORE rollback actuation must not be recorded before a restore candidate exists.');

const rollbackHistoryOnly = await rollbackPrevalidationBoundary.executeRollbackActuation({
  coreRecovery: {
    transactionId: 'txn-rollback-history-only',
    recoveryCaseId: 'recovery-rollback-history-only',
    decision: { transactionId: 'txn-rollback-history-only' },
    sourceMutation: { eventType: 'playerMessageDeleted' }
  },
  rollbackActuation: {
    kind: 'directive.repairRollbackActuationDecision.v1',
    authorized: true,
    action: 'restorePreOutcomeRevision',
    transactionId: 'txn-rollback-history-only',
    restoreRevision: 7
  },
  legacyProjection: {
    shouldRestoreRevision: true,
    restoreRevision: 7
  },
  eventType: 'playerMessageDeleted',
  campaignState: {
    campaign: { id: 'campaign-rollback-history-only' },
    mission: { activePhaseId: 'after-history-only' },
    runtimeTracking: {
      revision: 8,
      history: [{
        revision: 7,
        snapshot: {
          campaign: { id: 'campaign-rollback-history-only' },
          mission: { activePhaseId: 'before-history-only' }
        }
      }],
      recoveryJournal: []
    }
  }
});
assert.equal(rollbackHistoryOnly.status, 'blocked', 'REPAIR rollback execution must not restore old runtimeTracking.history snapshots.');
assert.equal(rollbackHistoryOnly.reason, 'rollback-core-checkpoint-required');
assert.equal(rollbackPrevalidationCalls.length, 0, 'CORE rollback actuation must not be recorded for history-only rollback.');

console.log('Architecture redesign system skeleton contract tests passed');
