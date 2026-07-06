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
  createRuntimeLedgerView,
  readRuntimeCoreProjections
} from '../../src/runtime/runtime-ledger-view.mjs';
import {
  terminalDecisionLedgerView
} from '../../src/runtime/terminal-decision-ledger-view.mjs';
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

function assertEverySourceCallHas(source, callPattern, requiredPattern, message) {
  const matches = [...source.matchAll(callPattern)];
  assert(matches.length > 0, `${message} No calls found.`);
  for (const match of matches) {
    const window = source.slice(match.index, match.index + 2400);
    assert.match(window, requiredPattern, `${message} Missing near offset ${match.index}.`);
  }
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
assert.equal(
  /createRuntimeLedgerViewAsync/.test(repairCommandBoundarySource),
  false,
  'REPAIR rollback restore must not read the merged runtime ledger view to repopulate old runtimeTracking ledger arrays.'
);
assert.match(
  repairCommandBoundarySource,
  /function\s+emptyRuntimeLedgerRowsForRollbackRestore\(\)[\s\S]*?ingressLedger:\s*\[\][\s\S]*?responseLedger:\s*\[\][\s\S]*?recoveryJournal:\s*\[\][\s\S]*?const\s+runtimeTrackingLedgers\s*=\s*emptyRuntimeLedgerRowsForRollbackRestore\(\)[\s\S]*?ingressLedger:\s*runtimeTrackingLedgers\.ingressLedger[\s\S]*?responseLedger:\s*runtimeTrackingLedgers\.responseLedger[\s\S]*?recoveryJournal:\s*runtimeTrackingLedgers\.recoveryJournal/,
  'REPAIR rollback restore must keep old runtimeTracking ledger arrays empty after CORE checkpoint restore.'
);
assert.equal(
  /ingressLedger:\s*cloneJson\(currentLedgerView\.ingressLedger\s*\|\|\s*\[\]\)|responseLedger:\s*cloneJson\(currentLedgerView\.responseLedger\s*\|\|\s*\[\]\)|recoveryJournal:\s*cloneJson\(currentLedgerView\.recoveryJournal\s*\|\|\s*\[\]\)/.test(repairCommandBoundarySource),
  false,
  'REPAIR rollback restore must not mirror CORE ledger view rows wholesale into old runtimeTracking arrays.'
);
assert.equal(
  /ingressLedger:\s*cloneJson\(current\.runtimeTracking\.ingressLedger\)|responseLedger:\s*cloneJson\(current\.runtimeTracking\.responseLedger\)|recoveryJournal:\s*cloneJson\(current\.runtimeTracking\.recoveryJournal\)/.test(repairCommandBoundarySource),
  false,
  'REPAIR rollback restore must not copy raw current old ledgers wholesale.'
);
assert.match(
  repairCommandBoundarySource,
  /sidecarJournal:\s*\[\]/,
  'REPAIR rollback restore must not carry old runtimeTracking.sidecarJournal rows forward.'
);
assert.match(
  repairCommandBoundarySource,
  /function\s+modelCallJournalForRollbackRestore\(\)\s*\{\s*return\s+\[\];\s*\}[\s\S]*?modelCallJournal:\s*modelCallJournalForRollbackRestore\(\)/,
  'REPAIR rollback restore must not carry old modelCallJournal telemetry, even when CORE model-call diagnostics are absent.'
);
assert.match(
  repairCommandBoundarySource,
  /function\s+responseLedgerRevisionForRollbackRestore[\s\S]*?projections\.responseLedgerRevision[\s\S]*?responseLedgerRevision:\s*responseLedgerRevisionForRollbackRestore\(runtimeProjections\)/,
  'REPAIR rollback restore must derive responseLedgerRevision from CORE projections, not old runtimeTracking.'
);
assert.match(
  repairCommandBoundarySource,
  /endConditionLedger:\s*\{[\s\S]*?schemaVersion:\s*1[\s\S]*?activeDecisionId:\s*null[\s\S]*?detections:\s*\[\][\s\S]*?decisions:\s*\[\][\s\S]*?branchRecords:\s*\[\][\s\S]*?continuationFrames:\s*\[\]/,
  'REPAIR rollback restore must keep old runtimeTracking.endConditionLedger empty; CORE terminal projections carry terminal decision state.'
);
assert.equal(
  /terminalDecisionLedgerView[\s\S]*?from\s+['"]\.\/terminal-decision-ledger-view\.mjs['"]|endConditionLedger:\s*terminalDecisionLedgerView\(current\)|current\.runtimeTracking\.endConditionLedger/.test(repairCommandBoundarySource),
  false,
  'REPAIR rollback restore must not rebuild terminal decisions from old runtimeTracking.endConditionLedger.'
);
assert.match(
  repairCommandBoundarySource,
  /pendingInteractions:\s*\[\]/,
  'REPAIR rollback restore must keep old runtimeTracking.pendingInteractions empty; CORE projections carry pending state.'
);
assert.equal(
  /pendingInteractions:\s*cloneJson\(current\.runtimeTracking\.pendingInteractions|pendingInteractions:\s*current\.runtimeTracking\.pendingInteractions|endConditionLedger:\s*cloneJson\(current\.runtimeTracking\.endConditionLedger\)/.test(repairCommandBoundarySource),
  false,
  'REPAIR rollback restore must not copy raw old pendingInteractions or terminal end-condition ledger rows.'
);
assert.equal(
  /responseLedgerRevision:\s*Math\.max\(0,\s*Number\(current\.runtimeTracking\.responseLedgerRevision\)/.test(repairCommandBoundarySource),
  false,
  'REPAIR rollback restore must not carry old runtimeTracking.responseLedgerRevision.'
);
assert.equal(
  /runtimeTracking\?\.history(?!Limit)|runtimeTracking\.history(?!Limit)/.test(repairCommandBoundarySource),
  false,
  'REPAIR rollback execution must not inspect old runtimeTracking.history to classify missing CORE checkpoint state.'
);
assert.match(
  repairCommandBoundarySource,
  /function\s+hasCompactCoreCheckpointRef[\s\S]*?checkpointId[\s\S]*?executeRollbackActuation[\s\S]*?DIRECTIVE_REPAIR_ROLLBACK_CORE_CHECKPOINT_REF_REQUIRED/,
  'REPAIR rollback execution must require a compact CORE checkpoint ref before accepting any checkpoint restore state.'
);
assert.equal(
  /executeRollbackActuation[\s\S]*?recordRollbackActuation\(input\)[\s\S]*?DIRECTIVE_REPAIR_ROLLBACK_CORE_CHECKPOINT_REF_REQUIRED/.test(repairCommandBoundarySource),
  false,
  'REPAIR rollback execution must block missing checkpoint refs before recording rollback actuation.'
);

const stateDeltaGatewaySource = readFileSync(
  new URL('../../src/runtime/state-delta-gateway.mjs', import.meta.url),
  'utf8'
);
const terminalDecisionLedgerViewSource = readFileSync(
  new URL('../../src/runtime/terminal-decision-ledger-view.mjs', import.meta.url),
  'utf8'
);
const activeSaveFacadeSource = readFileSync(
  new URL('../../src/storage/active-save-facade-v2.mjs', import.meta.url),
  'utf8'
);
const coreStoreV2Source = readFileSync(
  new URL('../../src/storage/core-store-v2.mjs', import.meta.url),
  'utf8'
);
const transactionStoreV2Source = readFileSync(
  new URL('../../src/storage/transaction-store-v2.mjs', import.meta.url),
  'utf8'
);
const directiveStorageRepositorySource = readFileSync(
  new URL('../../src/storage/directive-storage-repository.mjs', import.meta.url),
  'utf8'
);
const runtimeLedgerViewSource = readFileSync(
  new URL('../../src/runtime/runtime-ledger-view.mjs', import.meta.url),
  'utf8'
);
const turnCommitCoordinatorSource = readFileSync(
  new URL('../../src/runtime/turn-commit-coordinator.mjs', import.meta.url),
  'utf8'
);
const continuityDiagnosticsSource = readFileSync(
  new URL('../../src/continuity/diagnostics.mjs', import.meta.url),
  'utf8'
);
const sceneHandshakeSettlerSource = readFileSync(
  new URL('../../src/runtime/scene-handshake-settler.mjs', import.meta.url),
  'utf8'
);
const sourceSettlementLatestPairSource = readFileSync(
  new URL('../../src/runtime/source-settlement-latest-pair.mjs', import.meta.url),
  'utf8'
);
const sourceSettlementLatestPairContractSource = readFileSync(
  new URL('../../src/runtime/source-settlement-latest-pair-contract.mjs', import.meta.url),
  'utf8'
);
const sourceSettlementLatestPairOwnerSource = readFileSync(
  new URL('../../src/runtime/source-settlement-latest-pair-owner.mjs', import.meta.url),
  'utf8'
);
const sourceSettlementLatestPairProviderSource = readFileSync(
  new URL('../../src/runtime/source-settlement-latest-pair-provider.mjs', import.meta.url),
  'utf8'
);
const sourceSettlementLatestPairSceneAdapterSource = readFileSync(
  new URL('../../src/runtime/source-settlement-latest-pair-scene-adapter.mjs', import.meta.url),
  'utf8'
);
const sourceSettlementLatestPairValidationSource = readFileSync(
  new URL('../../src/runtime/source-settlement-latest-pair-validation.mjs', import.meta.url),
  'utf8'
);
const continuityFactIndexSource = readFileSync(
  new URL('../../src/continuity/fact-index.mjs', import.meta.url),
  'utf8'
);
const continuityDirectorPacketsSource = readFileSync(
  new URL('../../src/continuity/director-packets.mjs', import.meta.url),
  'utf8'
);
const contextOrchestratorSource = readFileSync(
  new URL('../../src/context/context-orchestrator.mjs', import.meta.url),
  'utf8'
);
const playerSafePromptContextBuilderSource = readFileSync(
  new URL('../../src/generation/player-safe-prompt-context-builder.mjs', import.meta.url),
  'utf8'
);
const lensPromptRevisionRecordSource = readFileSync(
  new URL('../../src/runtime/lens-prompt-revision-record.mjs', import.meta.url),
  'utf8'
);
const continuitySourceFrameSource = readFileSync(
  new URL('../../src/continuity/source-frame.mjs', import.meta.url),
  'utf8'
);
const continuityProjectionHintsSource = readFileSync(
  new URL('../../src/continuity/projection-hints.mjs', import.meta.url),
  'utf8'
);
const continuityProjectionMatrixSource = readFileSync(
  new URL('../../src/continuity/projection-matrix.mjs', import.meta.url),
  'utf8'
);
const directorCoordinatorSource = readFileSync(
  new URL('../../src/directors/director-coordinator.mjs', import.meta.url),
  'utf8'
);
const reactionEngineSource = readFileSync(
  new URL('../../src/world/reaction-engine.mjs', import.meta.url),
  'utf8'
);
const campaignTimeStateSource = readFileSync(
  new URL('../../src/time/campaign-time-state.mjs', import.meta.url),
  'utf8'
);
const openWorldEventReducersSource = readFileSync(
  new URL('../../src/directors/open-world-event-reducers.mjs', import.meta.url),
  'utf8'
);
const directiveContractsSource = readFileSync(
  new URL('./lib/directive-contracts.mjs', import.meta.url),
  'utf8'
);
const campaignProjectionSchemaSource = readFileSync(
  new URL('../../schemas/campaign/campaign-state-projection.schema.json', import.meta.url),
  'utf8'
);
const campaignProjectionValidatorSource = readFileSync(
  new URL('./validate-campaign-projection.mjs', import.meta.url),
  'utf8'
);
const restoreTrackedCampaignRevisionStart = stateDeltaGatewaySource.indexOf('export function restoreTrackedCampaignRevision');
const restoreTrackedCampaignRevisionEnd = stateDeltaGatewaySource.indexOf('function lifecycleEvidenceStatus', restoreTrackedCampaignRevisionStart);
assert.ok(restoreTrackedCampaignRevisionStart >= 0 && restoreTrackedCampaignRevisionEnd > restoreTrackedCampaignRevisionStart, 'State delta gateway must expose restoreTrackedCampaignRevision before lifecycle evidence helpers.');
const restoreTrackedCampaignRevisionSource = stateDeltaGatewaySource.slice(restoreTrackedCampaignRevisionStart, restoreTrackedCampaignRevisionEnd);
assert.equal(
  /type\s*:\s*['"]restoreRevision['"]/.test(stateDeltaGatewaySource),
  false,
  'Generic state restore must not append old runtimeTracking.recoveryJournal restoreRevision rows.'
);
assert.match(
  restoreTrackedCampaignRevisionSource,
  /DIRECTIVE_CORE_CHECKPOINT_REQUIRED[\s\S]*?retiredAuthority:\s*['"]runtimeTracking\.history\.snapshot['"][\s\S]*?requiredAuthority:\s*['"]coreStoreV2\.checkpoint['"]/,
  'Generic state restore must fail closed and require CORE checkpoint authority.'
);
assert.match(
  stateDeltaGatewaySource,
  /readRuntimeCoreProjections[\s\S]*?from\s+['"]\.\/runtime-ledger-view\.mjs['"]/,
  'Generic state commit/restore must import CORE projection readers without rebuilding old ledger overlays.'
);
assert.match(
  stateDeltaGatewaySource,
  /function\s+createCampaignStateSnapshot[\s\S]*?delete\s+snapshot\.directiveRuntimeEvidence[\s\S]*?delete\s+snapshot\.runtimeResume/,
  'State history snapshots must strip transient CORE read-projection evidence and runtime resume cursors.'
);
assert.match(
  stateDeltaGatewaySource,
  /function\s+compactSceneReconciliationSnapshot[\s\S]*?normalizedSceneReconciliationLedger\(input,\s*defaults\)[\s\S]*?sanitizeRuntimeLedgerPayload\(ledger\)[\s\S]*?runs:\s*\[\][\s\S]*?pending:\s*\[\][\s\S]*?chunkCache:\s*\[\][\s\S]*?invalidations:\s*\[\][\s\S]*?function\s+createCampaignStateSnapshot[\s\S]*?snapshot\.sceneReconciliation\s*=\s*compactSceneReconciliationSnapshot\(sceneReconciliationInput,\s*sceneReconciliationDefaults\(\)\)/,
  'State history snapshots must compact top-level Scene Reconciliation ledgers instead of carrying raw SRE payload arrays.'
);
assert.match(
  stateDeltaGatewaySource,
  /function\s+commitTrackedCampaignState[\s\S]*?history:\s*\[\][\s\S]*?historyIndex:\s*-1/,
  'Tracked commits must not store hot runtimeTracking.history rows.'
);
assert.equal(
  /function\s+trackedHistoryRecord|history\.push\(trackedHistoryRecord|snapshot:\s*createCampaignStateSnapshot\(base\)/.test(stateDeltaGatewaySource),
  false,
  'Tracked history record helpers and embedded campaign snapshots must stay retired.'
);
assert.equal(
  /entry\.snapshot|initializeCampaignRuntimeTracking\(entry\.snapshot|createRuntimeLedgerView\(current|runtimeTrackingLedgersFromView\(current|stateRevisionRestored|pendingInteractions:|endConditionLedger:|sidecarJournal:|recoveryJournal:/.test(restoreTrackedCampaignRevisionSource),
  false,
  'Generic state restore must not rebuild campaign state, runtime mirrors, pending interactions, terminal ledgers, or lifecycle restore evidence from old history.'
);
assert.equal(
  /function\s+restoreTrackedCampaignRevision[\s\S]*?pendingInteractions:\s*cloneJson\(current\.runtimeTracking\.pendingInteractions\)|function\s+restoreTrackedCampaignRevision[\s\S]*?endConditionLedger:\s*cloneJson\(current\.runtimeTracking\.endConditionLedger\)/.test(stateDeltaGatewaySource),
  false,
  'Generic state restore must not raw-copy old pendingInteractions or terminal endConditionLedger mirrors.'
);
assert.match(
  stateDeltaGatewaySource,
  /function\s+commitTrackedCampaignState[\s\S]*?const\s+runtimeTrackingLedgers\s*=\s*\{[\s\S]*?ingressLedger:\s*\[\][\s\S]*?responseLedger:\s*\[\][\s\S]*?recoveryJournal:\s*\[\][\s\S]*?\}[\s\S]*?ingressLedger:\s*runtimeTrackingLedgers\.ingressLedger[\s\S]*?responseLedger:\s*runtimeTrackingLedgers\.responseLedger[\s\S]*?recoveryJournal:\s*runtimeTrackingLedgers\.recoveryJournal/,
  'State commits must not rebuild old runtimeTracking ledger mirrors from runtime overlay rows.'
);
assert.equal(
  /runtimeOverlayRowsNotCoveredByCore|runtimeTrackingLedgersFromView|createRuntimeLedgerView\(base\)/.test(stateDeltaGatewaySource),
  false,
  'State commits must not preserve overlay fallback rows when CORE projections are absent.'
);
assert.match(
  stateDeltaGatewaySource,
  /function\s+oldRuntimeModelCallJournal\(\)\s*\{\s*return\s+\[\];\s*\}[\s\S]*?function\s+commitTrackedCampaignState[\s\S]*?modelCallJournal:\s*oldRuntimeModelCallJournal\(\)/,
  'Generic state commit must not carry old modelCallJournal telemetry, even when CORE model-call diagnostics are absent.'
);
assert.equal(
  /modelCallJournal/.test(restoreTrackedCampaignRevisionSource),
  false,
  'Generic state restore is fail-closed and must not rebuild modelCallJournal telemetry.'
);
assert.equal(
  /modelCallJournalFromCoreProjections|modelCallJournalForRollbackRestore[\s\S]*?runtimeTracking\?\.modelCallJournal/.test(
    `${stateDeltaGatewaySource}\n${repairCommandBoundarySource}`
  ),
  false,
  'Runtime commit/restore paths must not fall back to old runtimeTracking.modelCallJournal.'
);
assert.match(
  stateDeltaGatewaySource,
  /function\s+normalizedTracking[\s\S]*?modelCallJournal:\s*\[\]/,
  'Runtime tracking initialization must drop old modelCallJournal telemetry; CORE diagnostics are authoritative.'
);
assert.equal(
  /function\s+compactModelCallTelemetryRows|modelCallJournal:\s*compactModelCallTelemetryRows\(input\.modelCallJournal\)/.test(stateDeltaGatewaySource),
  false,
  'Runtime tracking initialization must not compact or preserve old modelCallJournal rows.'
);
assert.match(
  stateDeltaGatewaySource,
  /function\s+normalizedTracking[\s\S]*?ingressLedger:\s*\[\][\s\S]*?responseLedger:\s*\[\][\s\S]*?responseLedgerRevision:\s*0/,
  'Runtime tracking initialization must drop old ingress/response ledgers; CORE projections are authoritative.'
);
assert.equal(
  /function\s+compactRuntimeLedgerRows|function\s+isRuntimeLedgerProjectionRow|ingressLedger:\s*compactRuntimeLedgerRows\(input\.ingressLedger\)|responseLedger:\s*compactRuntimeLedgerRows\(input\.responseLedger\)/.test(stateDeltaGatewaySource),
  false,
  'Runtime tracking initialization must not compact or preserve old ingress/response ledger rows.'
);
assert.match(
  stateDeltaGatewaySource,
  /function\s+compactRuntimeHistory[\s\S]*?return\s+\[\];[\s\S]*?function\s+normalizedTracking[\s\S]*?const\s+historyLimit\s*=\s*defaults\.historyLimit[\s\S]*?const\s+history\s*=\s*compactRuntimeHistory\(input\.history\)[\s\S]*?const\s+historyIndex\s*=\s*-1[\s\S]*?historyLimit,[\s\S]*?historyIndex,[\s\S]*?history,/,
  'Runtime tracking initialization must drop imported old history rows.'
);
assert.match(
  stateDeltaGatewaySource,
  /function\s+normalizeLastCommittedTurnProjection[\s\S]*?directive\.lastCommittedTurnCompatibilityMirror\.v1[\s\S]*?directive\.coreLastCommittedTurnProjectionRef\.v1[\s\S]*?function\s+normalizedTracking[\s\S]*?const\s+lastCommittedTurn\s*=\s*normalizeLastCommittedTurnProjection\(input\.lastCommittedTurn\)[\s\S]*?delete\s+normalized\.lastCommittedTurn/,
  'Runtime tracking initialization must keep lastCommittedTurn only as a tagged projection mirror.'
);
assert.match(
  turnCommitCoordinatorSource,
  /function\s+lastCommittedTurnProjectionFields[\s\S]*?directive\.lastCommittedTurnCompatibilityMirror\.v1[\s\S]*?directive\.coreLastCommittedTurnProjectionRef\.v1[\s\S]*?after\.runtimeTracking\.lastCommittedTurn[\s\S]*?lastCommittedTurnProjectionFields[\s\S]*?function\s+annotateCoreMechanicsLedgerEntry|function\s+lastCommittedTurnProjectionFields[\s\S]*?directive\.lastCommittedTurnCompatibilityMirror\.v1[\s\S]*?directive\.coreLastCommittedTurnProjectionRef\.v1[\s\S]*?function\s+annotateCoreMechanicsLedgerEntry[\s\S]*?lastCommittedTurnProjectionFields[\s\S]*?after\.runtimeTracking\.lastCommittedTurn[\s\S]*?lastCommittedTurnProjectionFields/,
  'Turn commit coordinator must write lastCommittedTurn as a compact projection mirror, not silent old runtime authority.'
);
assert.match(
  turnCommitCoordinatorSource,
  /createRuntimeLedgerViewAsync[\s\S]*?from\s+['"]\.\/runtime-ledger-view\.mjs['"][\s\S]*?async\s+function\s+findIngressById\(campaignState,\s*ingressId,\s*\{\s*coreTurnStore\s*=\s*null\s*\}\s*=\s*\{\}\)[\s\S]*?createRuntimeLedgerViewAsync\(campaignState\s*\|\|\s*\{\},\s*\{\s*coreTurnStore\s*\}\)[\s\S]*?const\s+ingress\s*=\s*await\s+findIngressById\(after,\s*ingressId,\s*\{\s*coreTurnStore\s*\}\)/,
  'Turn commit coordinator mechanics transaction binding must use async CORE-only ingress projections.'
);
assert.equal(
  /function\s+findIngressById[\s\S]*?runtimeOverlay:\s*true|function\s+findIngressById[\s\S]*?runtimeTracking\?\.ingressLedger/.test(turnCommitCoordinatorSource),
  false,
  'Turn commit coordinator must not bind mechanics checkpoints to runtimeOverlay or raw hot ingress rows.'
);
assert.equal(
  /function\s+hasCoreRuntimeHistoryAuthority|directive\.coreRuntimeHistorySnapshotRef\.v1|core-authoritative-runtime-history|embedded-runtime-history-retired/.test(stateDeltaGatewaySource),
  false,
  'Runtime history ref authority helpers must stay retired after hot history rows are removed.'
);
assert.equal(
  /historyLimit:\s*Math\.max\(2,\s*Number\(input\.historyLimit/.test(stateDeltaGatewaySource),
  false,
  'Runtime tracking initialization must not preserve old runtimeTracking.historyLimit as active retention policy.'
);
assert.equal(
  /ingressLedger:\s*Array\.isArray\(input\.ingressLedger\)\s*\?\s*cloneJson\(input\.ingressLedger\)|responseLedger:\s*Array\.isArray\(input\.responseLedger\)\s*\?\s*cloneJson\(input\.responseLedger\)/.test(stateDeltaGatewaySource),
  false,
  'Runtime tracking initialization must not clone raw ingress/response ledgers.'
);
assert.equal(
  /history:\s*Array\.isArray\(input\.history\)\s*\?\s*cloneJson\(input\.history\)/.test(stateDeltaGatewaySource),
  false,
  'Runtime tracking initialization must not clone raw old history entries.'
);
assert.match(
  stateDeltaGatewaySource,
  /function\s+createCampaignStateSnapshot[\s\S]*?delete\s+snapshot\.runtimeTracking\.sceneReconciliation[\s\S]*?delete\s+snapshot\.runtimeTracking\.sceneHandshake/,
  'State history snapshots must remove nested SRE runtime shells instead of preserving empty compatibility roots.'
);
assert.match(
  stateDeltaGatewaySource,
  /DIRECTIVE_MUTABLE_STATE_DOMAINS[\s\S]*['"]sceneReconciliation['"][\s\S]*['"]sceneHandshake['"][\s\S]*function\s+initializeCampaignRuntimeTracking[\s\S]*delete\s+runtimeTracking\.sceneReconciliation[\s\S]*delete\s+runtimeTracking\.sceneHandshake[\s\S]*sceneReconciliation:\s*normalizedSceneReconciliationLedger\(sceneReconciliationInput,\s*sceneReconciliationDefaults\(\)\)[\s\S]*sceneHandshake:\s*normalizedSceneHandshakeLedger\(sceneHandshakeInput,\s*sceneHandshakeDefaults\(\)\)/,
  'State gateway must treat sceneReconciliation and sceneHandshake as top-level mutable SRE ledgers and remove old runtimeTracking shells.'
);
assert.match(
  stateDeltaGatewaySource,
  /const\s+materialChange\s*=\s*descriptor\.domains\.some\(\(domain\)\s*=>\s*!\[['"]runtimeTracking['"],\s*['"]sceneReconciliation['"],\s*['"]sceneHandshake['"]\]\.includes\(domain\)\)/,
  'Scene Reconciliation and Scene Handshake ledger writes must not advance mechanics revisions.'
);
assert.match(
  stateDeltaGatewaySource,
  /emptyTerminalDecisionLedger[\s\S]*?from\s+['"]\.\/terminal-decision-ledger-view\.mjs['"][\s\S]*?function\s+normalizedEndConditionLedger[\s\S]*?void\s+input[\s\S]*?emptyTerminalDecisionLedger\(\)[\s\S]*?endConditionLedger:\s*emptyTerminalDecisionLedger\(\)/,
  'Runtime tracking initialization must keep old terminal decision hot root empty.'
);
assert.match(
  terminalDecisionLedgerViewSource,
  /readRuntimeCoreProjections[\s\S]*?from\s+['"]\.\/runtime-ledger-view\.mjs['"][\s\S]*?function\s+normalizeTerminalDecisionLedger[\s\S]*?detections\.filter\(\(entry\)\s*=>\s*isTerminalDecisionProjectionRow\(entry,\s*['"]detection['"]\)\)[\s\S]*?function\s+terminalDecisionLedgerView[\s\S]*?projections\?\.terminalDecisionLedger/,
  'Shared terminal decision ledger view must read CORE terminal projections and drop untagged terminal rows.'
);
assert.match(
  terminalDecisionLedgerViewSource,
  /function\s+withTerminalDecisionLedgerProjection[\s\S]*?coreStoreReadProjections:[\s\S]*?runtimeAuthority:\s*['"]coreStoreV2['"][\s\S]*?terminalDecisionLedger:\s*normalized[\s\S]*?endConditionLedger:\s*emptyTerminalDecisionLedger\(\)/,
  'Terminal decision projection writer must write CORE read projections and clear old runtimeTracking.endConditionLedger.'
);
assert.match(
  stateDeltaGatewaySource,
  /function\s+isSceneReconciliationProjectionLedger[\s\S]*?sreSceneReconciliationProjection[\s\S]*?directive\.sceneReconciliationLedgerProjectionRef\.v1[\s\S]*?function\s+normalizedSceneReconciliationLedger[\s\S]*?if\s*\(\s*!isSceneReconciliationProjectionLedger\(input\)\s*\)\s*return\s+cloneJson\(defaults\)/,
  'Runtime tracking initialization must drop untagged Scene Reconciliation ledgers.'
);
assert.match(
  directiveContractsSource,
  /campaignProjectionStateDomains[\s\S]*['"]sceneReconciliation['"][\s\S]*['"]runtimeTracking['"]/,
  'Campaign projection domains must expose sceneReconciliation as a top-level state domain before runtimeTracking.'
);
assert.match(
  campaignProjectionSchemaSource,
  /"required":\s*\[[^\]]*"sceneReconciliation"[^\]]*"runtimeTracking"[\s\S]*"sceneReconciliation":\s*\{[\s\S]*"required":\s*\[[^\]]*"markers"[^\]]*"invalidations"/,
  'Campaign projection schema must require top-level sceneReconciliation.'
);
assert.equal(
  /"runtimeTracking"\s*:\s*\{[\s\S]*?"required"\s*:\s*\[[^\]]*"sceneReconciliation"/.test(campaignProjectionSchemaSource),
  false,
  'Campaign projection schema must not require sceneReconciliation under runtimeTracking.'
);
assert.match(
  campaignProjectionValidatorSource,
  /if\s*\(\s*['"]sceneReconciliation['"]\s+in\s+\(state\.runtimeTracking\s*\|\|\s*\{\}\)\)\s*at\(['"]\$\.initialState\.runtimeTracking\.sceneReconciliation['"]/,
  'Campaign projection validator must reject runtimeTracking.sceneReconciliation in bundled projections.'
);
assert.equal(
  /sceneReconciliation\s*\|\|\s*(?:state|current|next)?\.?runtimeTracking\??\.sceneReconciliation|runtimeTracking\??\.sceneReconciliation/.test(
    `${directorCoordinatorSource}\n${reactionEngineSource}`
  ),
  false,
  'Open-world director/reaction paths must not promote nested runtimeTracking.sceneReconciliation into top-level SRE authority.'
);
const openWorldInvalidationBody = /export\s+function\s+invalidateOpenWorldCausalityForReconciliation[\s\S]*?\n\}\n\nexport\s+function\s+coordinatorSnapshot/.exec(directorCoordinatorSource)?.[0] || '';
assert.equal(
  /for\s*\(\s*const\s+collectionName\s+of\s+\[['"]responseLedger['"],\s*['"]sidecarJournal['"],\s*['"]modelCallJournal['"]\]/.test(openWorldInvalidationBody),
  false,
  'Open-world invalidation must not loop over old runtime ledger collections to mark rows stale.'
);
assert.equal(
  /runtimeTracking\?\.\[collectionName\]|runtimeTracking\?\.(responseLedger|sidecarJournal|modelCallJournal)[\s\S]*?staleReason/.test(openWorldInvalidationBody),
  false,
  'Open-world invalidation evidence must stay in top-level SRE/event/thread/quest ledgers, not old runtime ledgers.'
);
assert.match(
  stateDeltaGatewaySource,
  /function\s+isSceneHandshakeProjectionRow[\s\S]*?sreSceneHandshakeProjection[\s\S]*?directive\.sceneHandshakeLedgerProjectionRef\.v1[\s\S]*?function\s+isSceneHandshakeLedgerRow\(entry\s*=\s*\{\}\)\s*\{[\s\S]*?return\s+isSceneHandshakeProjectionRow\(entry\);[\s\S]*?function\s+normalizedSceneHandshakeLedger[\s\S]*?settled\.filter\(isSceneHandshakeLedgerRow\)[\s\S]*?pendingInternalReview\.filter\(isSceneHandshakeLedgerRow\)[\s\S]*?lastResult:\s*isSceneHandshakeLedgerRow\(source\.lastResult\)/,
  'Runtime tracking initialization must preserve only valid top-level SRE Scene Handshake projection rows while dropping untagged, legacy, or forged rows.'
);
const recordModelCallEventBody = /export\s+function\s+recordModelCallEvent[\s\S]*?\n\}\n\nexport\s+function\s+recordPendingInteraction/.exec(stateDeltaGatewaySource)?.[0] || '';
assert.equal(
  /metadata:\s*cloneJson|prompt:\s*compact\(event\.prompt\)|response:\s*compact\(event\.response\)|providerPayload/.test(recordModelCallEventBody),
  false,
  'Old model-call fallback rows must not persist arbitrary metadata, raw prompts, raw responses, or provider payloads.'
);
const recordPendingInteractionBody = /export\s+function\s+recordPendingInteraction[\s\S]*?\n\}\n\nexport\s+function\s+resolvePendingInteraction/.exec(stateDeltaGatewaySource)?.[0] || '';
const resolvePendingInteractionBody = /export\s+function\s+resolvePendingInteraction[\s\S]*?\n\}\n\nexport\s+function\s+createStateDeltaGateway/.exec(stateDeltaGatewaySource)?.[0] || '';
assert.equal(
  /PENDING_INTERACTION_AUTHORITIES|legacyPendingInteractionTelemetry|pendingInteractionEvidenceStatus|pendingInteractionMirror|pendingInteractionAuthorityFields/.test(stateDeltaGatewaySource),
  false,
  'State delta gateway must not retain old pending-interaction compatibility authority helpers.'
);
assert.match(
  coreStoreV2Source,
  /function\s+buildPendingInteractionProjections[\s\S]*?pendingInteractionRecorded[\s\S]*?pendingInteractionResolved/,
  'CORE Store must own pending interaction recorded/resolved projections.'
);
assert.match(
  coreStoreV2Source,
  /pendingInteractions\s*=\s*buildPendingInteractionProjections\(state\.events\s*\|\|\s*\[\],\s*transactionMap\)/,
  'CORE Store read projections must expose pending interaction rows.'
);
assert.match(
  coreStoreV2Source,
  /async\s+recordPendingInteraction\(transactionId,\s*interaction\s*=\s*\{\}\)[\s\S]*?appendEvent\(['"]pendingInteractionRecorded['"][\s\S]*?async\s+resolvePendingInteraction\(transactionId,\s*interactionId,\s*resolution\s*=\s*\{\}\)[\s\S]*?appendEvent\(['"]pendingInteractionResolved['"]/,
  'CORE Store must expose append-only pending interaction record/resolve writers.'
);
assert.match(
  recordPendingInteractionBody,
  /DIRECTIVE_CORE_PENDING_INTERACTION_PROJECTION_REQUIRED[\s\S]*?corePendingInteractionProjectionRequired[\s\S]*?coreStoreV2/,
  'Legacy pending interaction helper must fail closed; CORE projections own live pending state.'
);
assert.match(
  resolvePendingInteractionBody,
  /DIRECTIVE_CORE_PENDING_INTERACTION_PROJECTION_REQUIRED[\s\S]*?corePendingInteractionResolutionRequired[\s\S]*?coreStoreV2/,
  'Legacy pending interaction resolution helper must fail closed; CORE projections own resolved pending state.'
);
assert.match(
  stateDeltaGatewaySource,
  /function\s+isPendingInteractionProjectionRow[\s\S]*?authority\s*===\s*['"]corePendingInteractionProjection['"][\s\S]*?authority\s*===\s*['"]repairPendingInteractionProjection['"][\s\S]*?directive\.pendingInteractionCompatibilityMirror\.v1[\s\S]*?pendingInteractions:\s*\[\]/,
  'Runtime tracking initialization must drop imported pendingInteractions rows; CORE/REPAIR projections own live non-terminal pending state.'
);
assert.equal(
  /function\s+isPendingInteractionProjectionRow[\s\S]*?terminalDecisionProjection/.test(stateDeltaGatewaySource),
  false,
  'Terminal decisions must not pass the pending-interaction projection predicate; terminal ledger owns them.'
);
assert.match(
  stateDeltaGatewaySource,
  /export\s+function\s+isPendingInteractionProjectionRow/,
  'Pending interaction projection predicate must be shared by runtime consumers, not only initialization.'
);
const recordLifecycleEventBody = /export\s+function\s+recordLifecycleEvent[\s\S]*?\n\}\n\nexport\s+function\s+recordModelCallEvent/.exec(stateDeltaGatewaySource)?.[0] || '';
assert.match(
  stateDeltaGatewaySource,
  /const\s+LIFECYCLE_AUTHORITIES\s*=\s*new\s+Set\(\[[\s\S]*?runtimeLifecycleProjection[\s\S]*?repairLifecycleProjection/,
  'State delta gateway must define explicit lifecycle authority owners.'
);
assert.match(
  stateDeltaGatewaySource,
  /function\s+normalizedTracking[\s\S]*?lifecycleJournal:\s*\[\]/,
  'Runtime tracking initialization must drop all hot lifecycleJournal rows; CORE/v2 projections own lifecycle evidence.'
);
assert.equal(
  /function\s+isLifecycleProjectionRow|lifecycleJournal:\s*Array\.isArray\(input\.lifecycleJournal\)|input\.lifecycleJournal\.filter\(isLifecycleProjectionRow\)/.test(stateDeltaGatewaySource),
  false,
  'Runtime tracking initialization must not preserve tagged old lifecycleJournal rows.'
);
assert.match(
  stateDeltaGatewaySource,
  /function\s+isOpenWorldBoundaryProjection[\s\S]*?openWorldBoundaryProjection[\s\S]*?directorCoordinator[\s\S]*?directive\.openWorldBoundaryProjectionRef\.v1[\s\S]*?function\s+isTimeNormalizationProjection[\s\S]*?timeNormalizationProjection[\s\S]*?campaignTimeState[\s\S]*?directive\.timeNormalizationProjectionRef\.v1[\s\S]*?function\s+normalizedTracking[\s\S]*?isOpenWorldBoundaryProjection\(input\.lastWorldBoundary\)[\s\S]*?isTimeNormalizationProjection\(input\.timeNormalization\)/,
  'Runtime tracking initialization must drop unowned lastWorldBoundary/timeNormalization metadata.'
);
assert.match(
  directorCoordinatorSource,
  /lastWorldBoundary\s*=\s*\{[\s\S]*?authority:\s*['"]openWorldBoundaryProjection['"][\s\S]*?projectionSource:\s*['"]directorCoordinator['"][\s\S]*?directive\.openWorldBoundaryProjectionRef\.v1/,
  'Director coordinator must tag runtimeTracking.lastWorldBoundary with open-world owner evidence.'
);
assert.match(
  campaignTimeStateSource,
  /timeNormalization\s*=\s*\{[\s\S]*?authority:\s*['"]timeNormalizationProjection['"][\s\S]*?projectionSource:\s*['"]campaignTimeState['"][\s\S]*?directive\.timeNormalizationProjectionRef\.v1/,
  'Campaign time normalization must tag runtimeTracking.timeNormalization with owner evidence.'
);
assert.match(
  openWorldEventReducersSource,
  /lastWorldBoundary[\s\S]*?openWorldBoundaryProjection[\s\S]*?timeNormalization[\s\S]*?timeNormalizationProjection/,
  'Open-world reducer validation must reject unowned runtimeTracking boundary/time metadata.'
);
assert.match(
  recordLifecycleEventBody,
  /lifecycleAuthorityFields\(event[\s\S]*?authority:\s*authority\.authority[\s\S]*?projectionSource:\s*authority\.projectionSource[\s\S]*?compatibilityMirror:\s*authority\.compatibilityMirror[\s\S]*?writeRuntimeCoreProjectionEnvelope\(tracked,\s*\{[\s\S]*?lifecycleJournal:\s*bounded\([\s\S]*?lifecycleJournal:\s*\[\]/,
  'Lifecycle writes must require owner authority and store projection metadata in CORE read projections, not old runtimeTracking.'
);
assert.match(
  stateDeltaGatewaySource,
  /function\s+lifecycleAuthorityFields[\s\S]*?DIRECTIVE_LIFECYCLE_AUTHORITY_REQUIRED/,
  'Lifecycle authority helper must fail closed without runtime or REPAIR evidence.'
);
assert.equal(
  /lifecycleJournal:\s*cloneJson\(current\.runtimeTracking\.lifecycleJournal\)/.test(repairCommandBoundarySource),
  false,
  'REPAIR rollback restore must not carry old lifecycleJournal rows forward.'
);
assert.match(
  repairCommandBoundarySource,
  /async\s+function\s+restoreFromCheckpointSnapshot[\s\S]*?lifecycleJournal:\s*\[\]/,
  'REPAIR rollback restore must clear old lifecycleJournal hot root.'
);
assert.equal(
  /legacyLifecycleTelemetry|allowLegacyLifecycleTelemetry|lifecycle old-ledger/.test(stateDeltaGatewaySource),
  false,
  'Lifecycle projection writes must not keep legacyLifecycleTelemetry compatibility mode.'
);
assert.match(
  activeSaveFacadeSource,
  /function\s+projectedLifecycleRows\(campaignState\s*=\s*\{\}\)[\s\S]*?projectedCoreArray\(campaignState,\s*['"]lifecycleJournal['"]\)/,
  'Active-save v2 runtime events must source lifecycle rows from CORE projections, not old runtimeTracking.'
);
assert.equal(
  /runtimeCollection\(campaignState,\s*['"]lifecycleJournal['"]\)|lifecycleJournal:\s*runtimeLifecycleLedgerFromEvents\(eventSegments/.test(activeSaveFacadeSource),
  false,
  'Active-save v2 load/projection must not rehydrate lifecycle rows into old runtimeTracking.lifecycleJournal.'
);
assert.match(
  activeSaveFacadeSource,
  /function\s+coreStoreReadProjectionsFromLoadedArtifacts[\s\S]*?lifecycleJournal:\s*projectionArray\(runtimeProjections\.lifecycleJournal\)/,
  'Active-save v2 loaded lifecycle events must become CORE read projections.'
);
assert.match(
  stateDeltaGatewaySource,
  /function\s+responseLedgerRevisionFromCoreProjections[\s\S]*?readRuntimeCoreProjections\(campaignState\)[\s\S]*?projections\.responseLedgerRevision[\s\S]*?responseLedgerRevision:\s*responseLedgerRevisionFromCoreProjections\(base\)/,
  'Generic state commit must derive responseLedgerRevision from CORE projections, not old runtimeTracking.'
);
assert.equal(
  /responseLedgerRevision:\s*Math\.max\(0,\s*Number\((?:current\.runtimeTracking|tracking)\.responseLedgerRevision\)/.test(stateDeltaGatewaySource),
  false,
  'Generic state commit/restore must not carry old runtimeTracking.responseLedgerRevision.'
);
const updateDirectiveResponseBody = /export\s+function\s+updateDirectiveResponse[\s\S]*?\n\}\n\nexport\s+function\s+restoreTrackedCampaignRevision/.exec(stateDeltaGatewaySource)?.[0] || '';
assert.match(
  updateDirectiveResponseBody,
  /const\s+responseLedgerRevision\s*=\s*responseLedgerRevisionFromCoreProjections\(campaignState\)[\s\S]*?responseLedgerRevision/,
  'Directive response updates must derive responseLedgerRevision from CORE projections only.'
);
assert.equal(
  /tracking\.responseLedgerRevision|responseLedgerRevision:\s*updated/.test(updateDirectiveResponseBody),
  false,
  'Directive response updates must not increment or preserve old runtimeTracking.responseLedgerRevision.'
);
assert.equal(
  /ingressLedger:\s*cloneJson\((runtimeLedgerView|currentLedgerView)\.ingressLedger\s*\|\|\s*\[\]\)|responseLedger:\s*cloneJson\((runtimeLedgerView|currentLedgerView)\.responseLedger\s*\|\|\s*\[\]\)|recoveryJournal:\s*cloneJson\((runtimeLedgerView|currentLedgerView)\.recoveryJournal\s*\|\|\s*\[\]\)/.test(stateDeltaGatewaySource),
  false,
  'State commit/restore must not mirror CORE ledger view rows wholesale into old runtimeTracking arrays.'
);
assert.equal(
  /ingressLedger:\s*cloneJson\((current\.runtimeTracking|tracking)\.ingressLedger\)|responseLedger:\s*cloneJson\((current\.runtimeTracking|tracking)\.responseLedger\)|recoveryJournal:\s*cloneJson\((current\.runtimeTracking|tracking)\.recoveryJournal\)/.test(stateDeltaGatewaySource),
  false,
  'State commit/restore must not copy raw current old ledgers wholesale.'
);
assert.equal(
  /export\s+function\s+recordRecoveryEvent/.test(stateDeltaGatewaySource),
  false,
  'State delta gateway must not export old recoveryJournal writer API.'
);
assert.equal(
  /export\s+function\s+recordSidecarEvent/.test(stateDeltaGatewaySource),
  false,
  'State delta gateway must not export old sidecarJournal writer API.'
);
assert.match(
  stateDeltaGatewaySource,
  /function\s+normalizedTracking[\s\S]*?sidecarJournal:\s*\[\]/,
  'Runtime tracking initialization must drop old sidecarJournal rows; CORE diagnostics own sidecar evidence.'
);
assert.match(
  stateDeltaGatewaySource,
  /function\s+commitTrackedCampaignState[\s\S]*?sidecarJournal:\s*\[\]/,
  'State commits must not carry old sidecarJournal rows forward.'
);
assert.match(
  stateDeltaGatewaySource,
  /export function restoreTrackedCampaignRevision[\s\S]*?DIRECTIVE_CORE_CHECKPOINT_REQUIRED/,
  'Generic state restore must be a fail-closed CORE-checkpoint-only boundary.'
);
assert.equal(
  /sidecarJournal:\s*Array\.isArray\(input\.sidecarJournal\)|sidecarJournal:\s*cloneJson\((current\.runtimeTracking|tracking)\.sidecarJournal\)|sidecarJournal:\s*bounded\(/.test(stateDeltaGatewaySource),
  false,
  'State delta gateway must not copy or append old sidecarJournal rows.'
);
assert.match(
  stateDeltaGatewaySource,
  /function\s+normalizedTracking[\s\S]*?recoveryJournal:\s*\[\]/,
  'Runtime tracking initialization must drop all hot recoveryJournal rows; CORE projections own recovery evidence.'
);
assert.equal(
  /recoveryJournal:\s*bounded\(entries,\s*limit\)/.test(stateDeltaGatewaySource),
  false,
  'State delta gateway must not append old recoveryJournal rows.'
);
assert.equal(
  /recoveryJournal:\s*Array\.isArray\(input\.recoveryJournal\)\s*\?\s*cloneJson\(input\.recoveryJournal\)/.test(stateDeltaGatewaySource),
  false,
  'Runtime tracking initialization must not copy raw old recoveryJournal rows.'
);
assert.equal(
  /export\s+function\s+resolveRecoveryEvent|function\s+resolveRecoveryEvent/.test(stateDeltaGatewaySource),
  false,
  'Old recovery resolver API must be absent; CORE/REPAIR projections own recovery closure.'
);
assert.match(
  stateDeltaGatewaySource,
  /function\s+assertMissingCoreWriteAllowed[\s\S]*?DIRECTIVE_CORE_PROJECTION_REQUIRED_FOR_OLD_LEDGER_WRITE[\s\S]*?function\s+oldLedgerAuthorityFieldsForUpdate/,
  'State delta gateway old-ledger writers must reject missing CORE evidence.'
);
assert.equal(
  /function\s+assertMissingCoreWriteAllowed[\s\S]*?explicitAuthority\s*&&\s*explicitAuthority\s*!==\s*['"]compatibilityProjectionUnavailable['"][\s\S]*?return[\s\S]*?function\s+oldLedgerAuthorityFieldsForUpdate/.test(stateDeltaGatewaySource),
  false,
  'Explicit old-ledger authority strings must not bypass CORE projection evidence.'
);
assert.equal(
  /missingCoreWriteMode\s*===\s*['"]quarantine['"]/.test(stateDeltaGatewaySource),
  false,
  'State delta gateway old-ledger writers must not retain a quarantine escape hatch for missing CORE writes.'
);
assert.match(
  stateDeltaGatewaySource,
  /function\s+oldLedgerAuthorityFieldsForUpdate[\s\S]*?patchEvidence[\s\S]*?authority:\s*null[\s\S]*?function\s+recordTurnIngress[\s\S]*?function\s+updateTurnIngress[\s\S]*?const\s+authority\s*=\s*oldLedgerAuthorityFieldsForUpdate\(['"]ingress['"],\s*entry,\s*sanitizedPatch,\s*merged,\s*\{\s*missingCoreWriteMode\s*\}\)[\s\S]*?compatibilityMirror:\s*authority\.compatibilityMirror[\s\S]*?projectionSource:\s*authority\.projectionSource[\s\S]*?authority:\s*authority\.authority/,
  'Ingress update writer must normalize old-ledger authority metadata on touched rows.'
);
assert.match(
  stateDeltaGatewaySource,
  /function\s+updateDirectiveResponse[\s\S]*?const\s+authority\s*=\s*oldLedgerAuthorityFieldsForUpdate\(['"]response['"],\s*entry,\s*sanitizedPatch,\s*merged,\s*\{\s*missingCoreWriteMode\s*\}\)[\s\S]*?compatibilityMirror:\s*authority\.compatibilityMirror[\s\S]*?projectionSource:\s*authority\.projectionSource[\s\S]*?authority:\s*authority\.authority/,
  'Response update writer must normalize old-ledger authority metadata on touched rows.'
);
assert.match(
  stateDeltaGatewaySource,
  /function\s+updateDirectiveResponse\(campaignState,\s*responseId,\s*patch\s*=\s*\{\},\s*\{[\s\S]*?allowHostMessageIdMatch\s*=\s*false[\s\S]*?findIndex\(\(entry\)\s*=>\s*compact\(entry\.id\)\s*===\s*id\s*\|\|\s*compact\(entry\.responseId\)\s*===\s*id\)/,
  'Response update writer must prefer CORE response ids over positional SillyTavern hostMessageId.'
);
assert.match(
  stateDeltaGatewaySource,
  /function\s+updateDirectiveResponse\(campaignState,\s*responseId,\s*patch\s*=\s*\{\},\s*\{[\s\S]*?allowHostMessageIdMatch\s*===\s*true[\s\S]*?hostMatches[\s\S]*?compact\(entry\.hostMessageId\)\s*===\s*id[\s\S]*?hostMatches\.length\s*>\s*1\)\s*return\s+campaignState/,
  'Response update writer must fail closed when an opted-in hostMessageId is reused.'
);
assert.equal(
  /function\s+resolveRecoveryEvent[\s\S]*?recoveryJournal:\s*tracking\.recoveryJournal\.map/.test(stateDeltaGatewaySource),
  false,
  'Old recovery resolver must not map and patch runtimeTracking.recoveryJournal.'
);
assert.match(
  activeSaveFacadeSource,
  /function\s+projectedRecoveryRows\s*\([\s\S]*?const\s+coreRows\s*=\s*projectedCoreArray\(campaignState,\s*['"]recoveryJournal['"]\)[\s\S]*?return\s+Array\.isArray\(coreRows\)\s*\?\s*coreRows\s*:\s*\[\]/,
  'Active-save v2 recovery resume must be CORE-only and must not merge legacy runtimeTracking.recoveryJournal rows.'
);
assert.match(
  activeSaveFacadeSource,
  /function\s+isTaggedCompatibilityProjectionRow[\s\S]*?authority\s*===\s*['"]compatibilityProjectionUnavailable['"][\s\S]*?return\s+false[\s\S]*?compatibilityMirror[\s\S]*?projectionSource/,
  'Active-save v2 runtime projection fallback must not persist missing-CORE compatibility mirrors.'
);
assert.match(
  activeSaveFacadeSource,
  /function\s+runtimeBridgeAuthorityFields[\s\S]*?compatibilityProjectionUnavailable[\s\S]*?compatibilityMirror/,
  'Active-save v2 loaded runtime bridge rows must carry explicit compatibility authority metadata.'
);
assert.match(
  activeSaveFacadeSource,
  /function\s+runtimeProjectionsFromEventSegments[\s\S]*?runtimeBridgeAuthorityFields\(['"]ingress['"],\s*entry\)[\s\S]*?runtimeBridgeAuthorityFields\(['"]response['"],\s*entry\)[\s\S]*?function\s+runtimeTrackingFromEventSegments[\s\S]*?ingressLedger:\s*\[\][\s\S]*?responseLedger:\s*\[\][\s\S]*?recoveryJournal:\s*\[\]/,
  'Active-save v2 event-segment load must expose CORE rows as read projections while keeping old runtimeTracking ledgers empty.'
);
assert.match(
  activeSaveFacadeSource,
  /function\s+runtimeRecoveryLedgerFromEvents[\s\S]*?runtimeBridgeAuthorityFields\(['"]recovery['"],\s*entry\)/,
  'Active-save v2 event-segment load must not materialize silent old recovery rows.'
);
assert.match(
  activeSaveFacadeSource,
  /function\s+coreStoreProjectionRows[\s\S]*?projectionSource[\s\S]*?coreStoreV2[\s\S]*?compatibilityProjectionUnavailable[\s\S]*?function\s+coreStoreReadProjectionsFromLoadedArtifacts[\s\S]*?runtimeAuthority:\s*['"]coreStoreV2['"][\s\S]*?ingressLedger:\s*projectionArray\(coreStoreProjectionRows\(runtimeProjections\.ingressLedger\)\)[\s\S]*?responses:\s*projectionArray\(coreStoreProjectionRows\(runtimeProjections\.responses\s*\|\|\s*runtimeProjections\.responseLedger\)\)[\s\S]*?recoveryJournal:\s*projectionArray\(coreStoreProjectionRows\(runtimeProjections\.recoveryJournal\)\)/,
  'Active-save v2 loaded CORE read projections must come from filtered v2 event projections, not old runtimeTracking rows or missing-CORE mirrors.'
);
assert.equal(
  /recoveryJournal:\s*projectionArray\(runtimeTracking\.recoveryJournal\)/.test(activeSaveFacadeSource),
  false,
  'Active-save v2 loaded CORE read projections must not copy raw runtimeTracking.recoveryJournal.'
);
assert.equal(
  /ingressLedger:\s*projectionArray\(runtimeTracking\.ingressLedger\)/.test(activeSaveFacadeSource),
  false,
  'Active-save v2 loaded CORE read projections must not copy raw runtimeTracking.ingressLedger.'
);
assert.equal(
  /responseLedger:\s*projectionArray\(runtimeTracking\.responseLedger\)/.test(activeSaveFacadeSource),
  false,
  'Active-save v2 loaded CORE read projections must not copy raw runtimeTracking.responseLedger.'
);
assert.match(
  activeSaveFacadeSource,
  /function\s+projectedIngressRows[\s\S]*?const\s+coreRows\s*=\s*projectedCoreArray\(campaignState,\s*['"]ingressLedger['"]\)[\s\S]*?return\s+Array\.isArray\(coreRows\)\s*\?\s*cloneJson\(coreRows\)\s*:\s*\[\]/,
  'Active-save v2 ingress projection must be CORE-only and must not merge legacy runtimeTracking ingress rows.'
);
assert.match(
  activeSaveFacadeSource,
  /function\s+projectedResponseRows[\s\S]*?const\s+coreRows\s*=\s*projectedCoreArray\(campaignState,\s*['"]responseLedger['"]\)[\s\S]*?return\s+Array\.isArray\(coreRows\)\s*\?\s*cloneJson\(coreRows\)\s*:\s*\[\]/,
  'Active-save v2 response projection must be CORE-only and must not merge legacy runtimeTracking response rows.'
);
const projectedIngressRowsBody = /function\s+projectedIngressRows\s*\([\s\S]*?\n\}/.exec(activeSaveFacadeSource)?.[0] || '';
const projectedResponseRowsBody = /function\s+projectedResponseRows\s*\([\s\S]*?\n\}/.exec(activeSaveFacadeSource)?.[0] || '';
assert.equal(
  /runtimeTracking\.ingressLedger|hostMessageId|corePreferredRows/.test(projectedIngressRowsBody),
  false,
  'Active-save v2 ingress projection must not read old runtimeTracking ingress rows or match by hostMessageId.'
);
assert.equal(
  /runtimeTracking\.responseLedger|hostMessageId|corePreferredRows/.test(projectedResponseRowsBody),
  false,
  'Active-save v2 response projection must not read old runtimeTracking response rows or match by hostMessageId.'
);
const activeSaveResponseProjectionKeysBody = /function\s+responseProjectionKeys\s*\([\s\S]*?\n\}/.exec(activeSaveFacadeSource)?.[0] || '';
assert.equal(
  /hostMessageId/.test(activeSaveResponseProjectionKeysBody),
  false,
  'Active-save v2 loaded response projection coalescing must not match by SillyTavern hostMessageId.'
);
const projectedRecoveryRowsBody = /function\s+projectedRecoveryRows\s*\([\s\S]*?\n\}[\s\S]*?\n\nfunction\s+projectedTurnLedger/.exec(activeSaveFacadeSource)?.[0] || '';
assert.equal(
  /runtimeTracking\.recoveryJournal/.test(projectedRecoveryRowsBody),
  false,
  'Active-save v2 recovery projection must not read old runtimeTracking.recoveryJournal as resume authority.'
);
const projectedOutcomeReplacementRowsBody = /function\s+projectedOutcomeReplacementRows\s*\([\s\S]*?\n\}/.exec(activeSaveFacadeSource)?.[0] || '';
assert.match(
  projectedOutcomeReplacementRowsBody,
  /const\s+coreRows\s*=\s*Array\.isArray\(coreTurnLedger\?\.replacementHistory\)\s*\?\s*coreTurnLedger\.replacementHistory\s*:\s*\[\][\s\S]*?return\s+cloneJson\(coreRows\)/,
  'Active-save v2 replacement-history projection must be CORE-only and omit unmatched legacy replacements.'
);
assert.equal(
  /campaignState\.turnLedger\?\.replacementHistory|corePreferredRows/.test(projectedOutcomeReplacementRowsBody),
  false,
  'Active-save v2 replacement-history projection must not merge old turnLedger replacementHistory rows.'
);
const projectedTurnRowsBody = /function\s+projectedTurnRows\s*\([\s\S]*?\n\}/.exec(activeSaveFacadeSource)?.[0] || '';
assert.match(
  projectedTurnRowsBody,
  /if\s*\(Array\.isArray\(coreTurnLedger\?\.entries\)\)\s*\{[\s\S]*?return\s+cloneJson\(coreTurnLedger\.entries\)[\s\S]*?return\s+\[\]/,
  'Active-save v2 turn projection must return CORE turn rows only and fail closed to no replay rows.'
);
assert.equal(
  /campaignState\.turnLedger\?\.entries|corePreferredRows/.test(projectedTurnRowsBody),
  false,
  'Active-save v2 turn projection must not merge old turnLedger entries as replay authority.'
);
assert.match(
  activeSaveFacadeSource,
  /function\s+modelCallRows\s*\([\s\S]*?const\s+coreRows\s*=\s*projectedCoreArray\(campaignState,\s*['"]modelCallDiagnostics['"]\)[\s\S]*?if\s*\(Array\.isArray\(coreRows\)\)\s*return\s+coreRows[\s\S]*?return\s+\[\]/,
  'Active-save v2 model-call summaries and diagnostics must use CORE modelCallDiagnostics only.'
);
const activeSaveModelCallRowsBody = /function\s+modelCallRows\s*\([\s\S]*?\n\}/.exec(activeSaveFacadeSource)?.[0] || '';
assert.equal(
  /runtimeCollection\(campaignState,\s*['"]modelCallJournal['"]\)|runtimeTracking\?\.modelCallJournal/.test(activeSaveModelCallRowsBody),
  false,
  'Active-save v2 must not synthesize model-call diagnostics from old runtimeTracking.modelCallJournal.'
);
assert.match(
  activeSaveFacadeSource,
  /function\s+maxModelCallEventSequence\s*\([\s\S]*?runtimeResume\?\.modelCallEventSequence[\s\S]*?modelCallRows\(campaignState\)\.reduce/,
  'Active-save v2 may preserve compact runtimeResume model-call cursor without reading old modelCallJournal rows.'
);
const loadActiveCampaignStateV2Body = /export\s+async\s+function\s+loadActiveCampaignStateV2[\s\S]*$/.exec(activeSaveFacadeSource)?.[0] || '';
assert.match(
  loadActiveCampaignStateV2Body,
  /catch\s*\(error\)\s*\{[\s\S]*?found:\s*false[\s\S]*?campaignState:\s*null/,
  'Active-save v2 load must fail closed instead of returning stale fallback campaign state on v2 read failure.'
);
assert.equal(
  /campaignState:\s*cloneJson\(fallbackCampaignState\)/.test(loadActiveCampaignStateV2Body),
  false,
  'Active-save v2 load must not expose fallbackCampaignState as a loaded campaign state.'
);
assert.equal(
  /runtimeTracking\.modelCallJournal\s*=\s*modelCallJournalFromDiagnosticsSegments/.test(loadActiveCampaignStateV2Body),
  false,
  'Active-save v2 load must not mirror CORE modelCallDiagnostics into old runtimeTracking.modelCallJournal.'
);
assert.equal(
  /projection\?\.responseLedgerRevision\s*\?\?\s*runtimeTracking\.responseLedgerRevision/.test(activeSaveFacadeSource),
  false,
  'Active-save v2 runtime summary/resume must not use old runtimeTracking.responseLedgerRevision as CORE revision fallback.'
);
assert.match(
  activeSaveFacadeSource,
  /function\s+activeRuntimeRevisionState[\s\S]*?coreRuntimeProjection\(campaignState\)[\s\S]*?projection\?\.revisions[\s\S]*?authority:\s*['"]coreStoreV2['"][\s\S]*?runtimeTracking\.revision/,
  'Active-save v2 resume cursor must check CORE revision vectors before old runtimeTracking counters.'
);
assert.match(
  activeSaveFacadeSource,
  /function\s+runtimeResumeCursor[\s\S]*?const\s+revisionState\s*=\s*activeRuntimeRevisionState\(campaignState\)[\s\S]*?runtimeRevision:\s*revisionState\.runtime[\s\S]*?coreRevisions:/,
  'Active-save v2 resume cursor must persist CORE revision authority instead of old runtime revision authority.'
);
const activeSaveSidecarResumeCountBody = /function\s+sidecarResumeCount\s*\([\s\S]*?\n\}/.exec(activeSaveFacadeSource)?.[0] || '';
assert.equal(
  /runtimeCollection\(campaignState,\s*['"]sidecarJournal['"]\)|sidecars\.length/.test(activeSaveSidecarResumeCountBody),
  false,
  'Active-save v2 runtime summary/resume must not count old sidecarJournal rows as sidecar freshness.'
);
const activeSaveSidecarDiagnosticRowsBody = /function\s+sidecarDiagnosticRows\s*\([\s\S]*?\n\}/.exec(activeSaveFacadeSource)?.[0] || '';
assert.equal(
  /runtimeCollection\(campaignState,\s*['"]sidecarJournal['"]\)/.test(activeSaveSidecarDiagnosticRowsBody),
  false,
  'Active-save v2 diagnostics must not serialize old sidecarJournal rows as sidecar projections.'
);
const activeSaveBackgroundBatchRowsBody = /function\s+backgroundBatchRows\s*\([\s\S]*?\n\}/.exec(activeSaveFacadeSource)?.[0] || '';
assert.equal(
  /runtimeCollection\(campaignState,\s*['"]sidecarJournal['"]\)/.test(activeSaveBackgroundBatchRowsBody),
  false,
  'Active-save v2 diagnostics must not serialize old sidecarJournal rows as background-batch projections.'
);
const loadCampaignSaveFromStorageBody = /export\s+async\s+function\s+loadCampaignSaveFromStorage[\s\S]*?\n\}\n\nexport\s+async\s+function\s+loadCampaignSaveRecordFromStorage/.exec(directiveStorageRepositorySource)?.[0] || '';
assert.match(
  directiveStorageRepositorySource,
  /function\s+isV2AuthoritySaveEntry[\s\S]*?entry\.runtimeStorageFormat\s*===\s*['"]v2['"][\s\S]*?isRuntimeV2BridgeEntry\(entry\)[\s\S]*?isV2SaveIndexEntry\(entry\)/,
  'Storage repository must treat runtimeStorageFormat v2 alone as v2-owned authority.'
);
assert.match(
  loadCampaignSaveFromStorageBody,
  /const\s+v2Authority\s*=\s*isV2AuthoritySaveEntry\(entry,\s*record\)[\s\S]*?if\s*\(v2Authority\)\s*\{[\s\S]*?throw\s+createV2SaveStateUnavailableError/,
  'Storage repository load must fail closed for v2-owned saves before raw v1 payload fallback.'
);
const recoverActiveCampaignSaveBody = /export\s+async\s+function\s+recoverActiveCampaignSave[\s\S]*?\n\}\n/.exec(directiveStorageRepositorySource)?.[0] || '';
assert.match(
  recoverActiveCampaignSaveBody,
  /const\s+v2Authority\s*=\s*isV2AuthoritySaveEntry\(entry,\s*result\.value\)[\s\S]*?if\s*\(v2Authority\)\s*\{[\s\S]*?active-save-v2-state-unavailable[\s\S]*?continue;/,
  'Active save recovery must skip broken v2-owned entries instead of reviving stale v1 checkpoint payloads.'
);
assert.equal(
  /export\s+async\s+function\s+importCampaignSaveRecordToV2|function\s+summarizeLegacyRuntime|function\s+legacyHeadState|function\s+legacyHostRows|function\s+legacyEvents|function\s+legacyDiagnostics|function\s+legacyImportCheckpoints/.test(transactionStoreV2Source),
  false,
  'Transaction-store v2 must not keep old-save compatibility importer helpers after CORE/v2 save authority cut.'
);
assert.equal(
  /legacy(ModelCall|Sidecar|Ingress|Response)Imported|legacy-import|legacyImportCheckpoint|importedFromLegacySave/.test(transactionStoreV2Source),
  false,
  'Transaction-store v2 must not emit legacy-import event/diagnostic/checkpoint artifacts as an active migration lane.'
);
assert.match(
  directiveStorageRepositorySource,
  /function\s+runtimeBridgeProjectionSource[\s\S]*?coreStoreV2[\s\S]*?function\s+runtimeBridgeAuthorityFields[\s\S]*?compatibilityProjection[\s\S]*?compatibilityMirror/,
  'Directive storage repository pure-v2 loads must tag materialized runtime rows as CORE projection mirrors.'
);
assert.match(
  directiveStorageRepositorySource,
  /const\s+ingressLedger\s*=\s*eventEntries[\s\S]*?runtimeBridgeAuthorityFields\(['"]ingress['"],\s*entry\)[\s\S]*?const\s+responseLedger\s*=\s*eventEntries[\s\S]*?runtimeBridgeAuthorityFields\(['"]response['"],\s*entry\)/,
  'Directive storage repository v2 bridge load must not materialize silent old ingress/response rows.'
);
assert.match(
  directiveStorageRepositorySource,
  /function\s+coreStoreReadProjectionsFromLoadedV2[\s\S]*?runtimeAuthority:\s*['"]coreStoreV2['"][\s\S]*?ingressLedger[\s\S]*?responseLedger[\s\S]*?turnLedger/,
  'Directive storage repository pure-v2 loads must expose transient CORE read projections instead of only old-ledger-shaped rows.'
);
assert.equal(
  /function\s+legacyProjectionFallbackRows[\s\S]*?!coreProjectionAvailable[\s\S]*?return\s+legacy/.test(runtimeLedgerViewSource),
  false,
  'Runtime ledger view must not expose no-CORE silent old rows as fallback authority.'
);
assert.equal(
  /function\s+isTaggedCompatibilityProjection/.test(runtimeLedgerViewSource),
  false,
  'Runtime ledger view must not keep retired compatibility-projection quarantine helpers.'
);
assert.match(
  runtimeLedgerViewSource,
  /parts\.every\(Boolean\)\s*\?\s*parts\.join\(['"]\|['"]\)\s*:\s*['"]['"]/,
  'Runtime ledger view composite merge keys must require complete tuples so responseKind alone cannot merge unrelated rows.'
);
assert.match(
  runtimeLedgerViewSource,
  /recoveryJournal:\s*cloneJson\(coreRecovery\)/,
  'Runtime ledger view recovery rows must come only from CORE recovery projections.'
);
assert.equal(
  /function\s+createRuntimeLedgerViewFromProjections[\s\S]*?runtimeTracking\.recoveryJournal/.test(runtimeLedgerViewSource),
  false,
  'Runtime ledger view must not expose old runtimeTracking.recoveryJournal rows as fallback authority.'
);
assert.equal(
  /campaignState\?\.runtimeTracking\?\.directiveRuntimeEvidence\?\.coreStoreReadProjections/.test(runtimeLedgerViewSource),
  false,
  'Runtime ledger view must reject runtimeTracking-nested CORE projection evidence as old-root authority.'
);
assert.equal(
  /runtimeOverlay|legacyFallback|legacyProjectionFallbackRows|runtimeTracking\.(ingressLedger|responseLedger|recoveryJournal)/.test(runtimeLedgerViewSource),
  false,
  'Runtime ledger view must be CORE/v2-only and expose no old runtimeTracking fallback knobs.'
);
assert.match(
  runtimeLedgerViewSource,
  /export\s+async\s+function\s+createRuntimeLedgerViewAsync\b[\s\S]*?await\s+readRuntimeCoreProjectionsAsync/,
  'Runtime ledger view must provide an async CORE projection path for runtime-app CORE facades.'
);
assert.match(
  turnCommitCoordinatorSource,
  /createRuntimeLedgerViewAsync[\s\S]*?from\s+['"]\.\/runtime-ledger-view\.mjs['"]/,
  'Turn commit coordinator must import the shared async CORE-first runtime ledger view.'
);
assert.match(
  turnCommitCoordinatorSource,
  /async\s+function\s+findIngressById\(campaignState,\s*ingressId,\s*\{\s*coreTurnStore\s*=\s*null\s*\}\s*=\s*\{\}\)[\s\S]*?createRuntimeLedgerViewAsync\(campaignState\s*\|\|\s*\{\},\s*\{\s*coreTurnStore\s*\}\)[\s\S]*?await\s+findIngressById\(after,\s*ingressId,\s*\{\s*coreTurnStore\s*\}\)/,
  'Turn commit coordinator mechanics transaction lookup must use async CORE-only runtime ledger view.'
);
assert.equal(
  /function\s+findIngressById[\s\S]*?runtimeOverlay:\s*true|function\s+findIngressById[\s\S]*?runtimeTracking\?\.ingressLedger/.test(turnCommitCoordinatorSource),
  false,
  'Turn commit coordinator must not merge hot runtimeTracking ingress rows into mechanics transaction binding.'
);
assert.match(
  continuityDiagnosticsSource,
  /createRuntimeLedgerView[\s\S]*?from\s+['"]\.\.\/runtime\/runtime-ledger-view\.mjs['"]/,
  'Continuity diagnostics must import the shared CORE-first runtime ledger view.'
);
assert.match(
  continuityDiagnosticsSource,
  /function\s+latestContinuityReview[\s\S]*?const\s+runtimeLedgerView\s*=\s*createRuntimeLedgerView\(campaignState\s*\|\|\s*\{\}\)[\s\S]*?runtimeLedgerView\.recoveryJournal[\s\S]*?runtimeLedgerView\.responseLedger/,
  'Continuity diagnostics latest review must read response/recovery rows through CORE-only projections.'
);
const latestContinuityReviewBody = /function\s+latestContinuityReview[\s\S]*?\n\}[\s\S]*?\n\nfunction\s+promptKeyStatus/.exec(continuityDiagnosticsSource)?.[0] || '';
assert.equal(
  /runtimeOverlay:\s*true/.test(latestContinuityReviewBody),
  false,
  'Continuity diagnostics latest review must not use runtimeOverlay fallback as proof authority.'
);
assert.equal(
  /runtimeTracking\.(responseLedger|recoveryJournal)/.test(latestContinuityReviewBody),
  false,
  'Continuity diagnostics latest review must not read raw old response/recovery ledgers.'
);
assert.match(
  continuityFactIndexSource,
  /isFactAllowedForSourceFrame[\s\S]*?sourceFrame\s*=\s*null[\s\S]*?hasExplicitKnowledgeScope\(fact\)[\s\S]*?source-frame-knowledge-gate/,
  'Continuity fact index must gate explicit witness-scoped facts through the current source Frame.'
);
assert.match(
  continuityDirectorPacketsSource,
  /const\s+sourceFrame\s*=\s*buildContinuitySourceFrame[\s\S]*?buildContinuityFactIndex\([\s\S]*?sourceFrame/,
  'Continuity Director packets must pass their source Frame into fact-index witness gating.'
);
assert.match(
  playerSafePromptContextBuilderSource,
  /const\s+sourceFrame\s*=\s*buildContinuitySourceFrame[\s\S]*?buildContinuityFactIndex\([\s\S]*?sourceFrame/,
  'Player-safe continuity planner must pass its source Frame into fact-index witness gating.'
);
assert.match(
  continuityProjectionMatrixSource,
  /const\s+sourceFrame\s*=\s*buildContinuitySourceFrame[\s\S]*?buildContinuityFactIndex\([\s\S]*?sourceFrame/,
  'Continuity projection matrix must pass its source Frame into fact-index witness gating.'
);
assert.match(
  contextOrchestratorSource,
  /function\s+coreRuntimeRevision[\s\S]*?runtimeAuthority\s*!==\s*['"]coreStoreV2['"][\s\S]*?function\s+sourceRevision[\s\S]*?coreRuntimeRevision\(state\)[\s\S]*?runtimeTracking\?\.revision/,
  'Context plan source revisions must prefer CORE/v2 read-projection revisions before old runtimeTracking.revision.'
);
assert.match(
  playerSafePromptContextBuilderSource,
  /function\s+coreRuntimeRevision[\s\S]*?runtimeAuthority\s*!==\s*['"]coreStoreV2['"][\s\S]*?function\s+stateRevision[\s\S]*?coreRuntimeRevision\(campaignState\)[\s\S]*?runtimeTracking\?\.revision/,
  'Player-safe prompt source revisions must prefer CORE/v2 read-projection revisions before old runtimeTracking.revision.'
);
assert.match(
  continuitySourceFrameSource,
  /function\s+coreRevisions[\s\S]*?runtimeAuthority\s*!==\s*['"]coreStoreV2['"][\s\S]*?revisions\?\.runtime[\s\S]*?revisions\?\.mechanics[\s\S]*?function\s+revisionOf[\s\S]*?revisions\?\.runtime[\s\S]*?function\s+mechanicsRevisionOf[\s\S]*?revisions\?\.mechanics/,
  'Frame source evidence must prefer CORE/v2 runtime and mechanics revisions before old runtimeTracking counters.'
);
assert.match(
  continuityProjectionHintsSource,
  /function\s+coreRuntimeRevision[\s\S]*?runtimeAuthority\s*!==\s*['"]coreStoreV2['"][\s\S]*?function\s+revisionOf[\s\S]*?coreRuntimeRevision\(campaignState\)[\s\S]*?export\s+function\s+activeContinuityProjectionHints[\s\S]*?revision\s*!==\s*null[\s\S]*?revisionOf\(campaignState\)/,
  'Continuity projection hints must age against CORE/v2 runtime revision by default, not a null revision coerced to zero.'
);
assert.match(
  continuityProjectionMatrixSource,
  /function\s+coreRuntimeRevision[\s\S]*?runtimeAuthority\s*!==\s*['"]coreStoreV2['"][\s\S]*?function\s+revisionOf[\s\S]*?coreRuntimeRevision\(campaignState\)[\s\S]*?runtimeTracking\?\.revision/,
  'Continuity projection matrix source revisions must prefer CORE/v2 read-projection revisions before old runtimeTracking.revision.'
);
assert.match(
  sceneHandshakeSettlerSource,
  /createRuntimeLedgerView[\s\S]*?from\s+['"]\.\/runtime-ledger-view\.mjs['"]/,
  'Scene Handshake snapshot safety must import the shared CORE-first runtime ledger view.'
);
assert.match(
  sceneHandshakeSettlerSource,
  /function\s+buildSceneHandshakeSnapshot[\s\S]*?const\s+runtimeLedgerView\s*=\s*createRuntimeLedgerView\(state\)[\s\S]*?pendingRecoveryCount:\s*asArray\(runtimeLedgerView\.recoveryJournal\)/,
  'Scene Handshake pending recovery safety must read CORE recovery projections instead of raw old recoveryJournal rows.'
);
assert.equal(
  /pendingRecoveryCount:\s*asArray\(state\.runtimeTracking\?\.recoveryJournal\)/.test(sceneHandshakeSettlerSource),
  false,
  'Scene Handshake snapshot safety must not count raw old runtimeTracking.recoveryJournal rows.'
);
assert.match(
  sourceSettlementLatestPairSceneAdapterSource,
  /function\s+buildLatestPairSceneSnapshot[\s\S]*?const\s+runtimeLedgerView\s*=\s*createRuntimeLedgerView\(state\)[\s\S]*?pendingRecoveryCount:\s*asArray\(runtimeLedgerView\.recoveryJournal\)/,
  'Latest-pair scene snapshot pending recovery safety must read CORE recovery projections only.'
);
assert.equal(
  /pendingRecoveryCount:\s*asArray\(state\.runtimeTracking\?\.recoveryJournal\)/.test(sourceSettlementLatestPairSceneAdapterSource),
  false,
  'Latest-pair scene snapshot safety must not count raw old runtimeTracking.recoveryJournal rows.'
);
assert.match(
  sceneHandshakeSettlerSource,
  /source-settlement-latest-pair-contract\.mjs[\s\S]*?function\s+sceneHandshakeLedgerAuthority[\s\S]*?latestPairSourceSettlementAuthority[\s\S]*?function\s+sceneHandshakeLedgerRecord[\s\S]*?latestPairSourceSettlementMetadata\(metadata\s*\|\|\s*\{\}\)[\s\S]*?metadata:\s*cloneJson\(sourceMetadata\)/,
  'Scene Handshake ledger rows must use SRE latest-pair authority evidence from the Source Settlement contract instead of legacy telemetry.'
);
assert.match(
  sourceSettlementLatestPairContractSource,
  /SOURCE_SETTLEMENT_LATEST_PAIR_ROLE_ID[\s\S]*?sourceSettlementLatestPair[\s\S]*?SOURCE_SETTLEMENT_LATEST_PAIR_AUTHORITY[\s\S]*?sreSceneHandshakeProjection[\s\S]*?SOURCE_SETTLEMENT_LATEST_PAIR_MIRROR_KIND[\s\S]*?directive\.sceneHandshakeLedgerProjectionRef\.v1[\s\S]*?function\s+latestPairSourceSettlementMetadata[\s\S]*?function\s+isLatestPairSourceSettlementAuthority[\s\S]*?function\s+latestPairSourceSettlementAuthority/,
  'Latest-pair Source Settlement must own role, owner-mode, authority, and compatibility-mirror contract constants outside Scene Handshake.'
);
assert.match(
  sceneHandshakeSettlerSource,
  /settleLatestPairSceneHandshakeSource[\s\S]*?from\s+['"]\.\/source-settlement-latest-pair-owner\.mjs['"][\s\S]*?async\s+function\s+runTerminalLatestPairSourceSettlement[\s\S]*?return\s+settleLatestPairSceneHandshakeSource\(\{[\s\S]*?createSceneHandshakeLedgerRecord:\s*sceneHandshakeLedgerRecord[\s\S]*?sceneHandshakeResultOperations[\s\S]*?commitAcceptedSceneTimeAdvance/,
  'Scene Handshake terminal latest-pair path must delegate SRE apply orchestration to the latest-pair owner and pass only domain hooks.'
);
assert.match(
  sceneHandshakeSettlerSource,
  /readRuntimeCoreProjections[\s\S]*?from\s+['"]\.\/runtime-ledger-view\.mjs['"][\s\S]*?function\s+activeRuntimeRevisionState[\s\S]*?runtimeAuthority\s*===\s*['"]coreStoreV2['"][\s\S]*?revisions\?\.runtime[\s\S]*?revisions\?\.mechanics[\s\S]*?baseRevision:\s*activeRuntimeRevisionState\(campaignState\)\.runtime[\s\S]*?baseRevision:\s*revisionState\.runtime/,
  'Legacy Scene Handshake fallback must use CORE/v2 revision vectors for record-only and accepted apply base revisions.'
);
assert.equal(
  /baseRevision:\s*campaignState\.runtimeTracking\?\.revision|baseRevision:\s*campaignState\.runtimeTracking\.revision/.test(sceneHandshakeSettlerSource),
  false,
  'Legacy Scene Handshake fallback must not pass old runtimeTracking revision directly as apply base.'
);
assert.equal(
  /createSourceSettlementService|function\s+sourceSettlementFrameFor|function\s+sourceSettlementProviderSource/.test(sceneHandshakeSettlerSource),
  false,
  'Scene Handshake must not own latest-pair SRE service/frame/source orchestration.'
);
assert.match(
  sourceSettlementLatestPairOwnerSource,
  /createSourceSettlementService[\s\S]*?function\s+sourceSettlementFrameFor[\s\S]*?function\s+sourceSettlementProviderSource[\s\S]*?export\s+async\s+function\s+settleLatestPairSceneHandshakeSource[\s\S]*?stateDeltaGateway\.applyOperations[\s\S]*?allowedRoots:\s*\[['"]mission['"],\s*['"]commandLog['"],\s*['"]ship['"],\s*['"]threadLedger['"],\s*['"]runtimeTracking['"],\s*['"]sceneHandshake['"]\]/,
  'Latest-pair owner must own SRE service composition, source-frame projection, apply-owner guard, and allowed roots.'
);
assert.equal(
  /campaignState\.runtimeTracking\?\.revision|campaignState\.runtimeTracking\?\.mechanicsRevision|baseRevision:\s*campaignState\.runtimeTracking/.test(sourceSettlementLatestPairOwnerSource),
  false,
  'Latest-pair SRE owner must not derive settlement authority or baseRevision from old runtimeTracking counters.'
);
assert.equal(
  /runtimeRevision:\s*state\.runtimeTracking\?\.revision|mechanicsRevision:\s*state\.runtimeTracking\?\.mechanicsRevision/.test(sourceSettlementLatestPairSceneAdapterSource),
  false,
  'Latest-pair SRE scene snapshots must not derive evidence revisions from old runtimeTracking counters.'
);
assert.match(
  sceneHandshakeSettlerSource,
  /export\s+async\s+function\s+runLatestPairSourceSettlement[\s\S]*?allowLegacySceneHandshakeFallback:\s*false/,
  'Latest-pair source-settlement owner must disable legacy Scene Handshake fallback.'
);
assert.equal(
  /from\s+['"]\.\/scene-handshake-settler\.mjs['"]/.test(sourceSettlementLatestPairSource),
  false,
  'Source-settlement latest-pair facade must not statically import the legacy Scene Handshake settler.'
);
assert.match(
  sourceSettlementLatestPairSource,
  /source-settlement-latest-pair-provider\.mjs[\s\S]*?source-settlement-latest-pair-scene-adapter\.mjs[\s\S]*?source-settlement-latest-pair-validation\.mjs[\s\S]*?createLatestPairSourceSettlementProviderRuntime\(\{[\s\S]*?validateLatestPairSettlement[\s\S]*?settleLatestPairSource[\s\S]*?settleLatestPairSceneHandshakeSource[\s\S]*?runLatestPairSceneHandshakeSettlement/,
  'Source-settlement latest-pair facade must own the public boundary and use native provider, validation, and strict scene-adapter runtimes.'
);
assert.equal(
  /sceneHandshakeMigrationAdapter|scene-handshake-settler\.mjs|validateSceneHandshakeSettlement:\s*module|validateLatestPairSettlement:\s*module/.test(sourceSettlementLatestPairSource),
  false,
  'Source-settlement latest-pair facade must not lazy-load or statically import Scene Handshake for provider validation or strict settlement fallback.'
);
assert.match(
  sourceSettlementLatestPairProviderSource,
  /getDefaultGenerationRoleDefinitions[\s\S]*?LATEST_PAIR_SOURCE_SETTLEMENT_TIMEOUT_MS\s*=\s*getDefaultGenerationRoleDefinitions\(\)\[SOURCE_SETTLEMENT_LATEST_PAIR_ROLE_ID\]\?\.timeoutMs[\s\S]*?createLatestPairSourceSettlementPrompt[\s\S]*?parseLatestPairSourceSettlementOutput[\s\S]*?createLatestPairSourceSettlementProvider[\s\S]*?generationRouter\.generate\([\s\S]*?SOURCE_SETTLEMENT_LATEST_PAIR_ROLE_ID[\s\S]*?timeoutMs:\s*LATEST_PAIR_SOURCE_SETTLEMENT_TIMEOUT_MS[\s\S]*?DIRECTIVE_SOURCE_SETTLEMENT_LATEST_PAIR_PROVIDER_TIMEOUT[\s\S]*?validateLatestPairSettlement/,
  'Latest-pair provider module must own prompt, parse, role call, timeout, and validator hook orchestration outside Scene Handshake.'
);
assert.match(
  sourceSettlementLatestPairValidationSource,
  /enrichSettlementWithDeterministicProposals[\s\S]*?normalizeAssignmentProposal[\s\S]*?normalizeCommandLogProposal[\s\S]*?normalizeShipReadinessProposal[\s\S]*?normalizeThreadSignal[\s\S]*?export\s+function\s+validateLatestPairSettlement[\s\S]*?operations\.push/,
  'Latest-pair validation module must own validation-to-operation projection outside Scene Handshake.'
);
assert.match(
  sourceSettlementLatestPairSceneAdapterSource,
  /buildLatestPairSceneSnapshot[\s\S]*?createLatestPairSceneHandshakeLedgerRecord[\s\S]*?latestPairSceneHandshakeResultOperations[\s\S]*?latestPairSceneIdempotencyKey[\s\S]*?commitAcceptedSceneTimeAdvance[\s\S]*?export\s+async\s+function\s+runLatestPairSceneHandshakeSettlement[\s\S]*?settleLatestPairSceneHandshakeSource/,
  'Latest-pair scene adapter must own strict snapshot/idempotency/ledger/time hooks before entering the owner.'
);
assert.equal(
  /scene-handshake-settler\.mjs/.test(sourceSettlementLatestPairSceneAdapterSource),
  false,
  'Latest-pair scene adapter must not import the legacy Scene Handshake settler.'
);
assert.equal(
  /SRE latest-pair provider timed out|SOURCE_SETTLEMENT_LATEST_PAIR_PROVIDER_TIMEOUT|DIRECTIVE_SOURCE_SETTLEMENT_LATEST_PAIR_PROVIDER_TIMEOUT|LATEST_PAIR_SOURCE_SETTLEMENT_TIMEOUT_MS|createLatestPairSourceSettlementPrompt|generationRouter\.generate\([\s\S]{0,500}?SOURCE_SETTLEMENT_LATEST_PAIR_ROLE_ID/.test(sceneHandshakeSettlerSource),
  false,
  'Scene Handshake must not own latest-pair provider prompt/timeout orchestration.'
);
assert.match(
  sceneHandshakeSettlerSource,
  /source-settlement-latest-pair-validation\.mjs[\s\S]*?createLatestPairSreSettlementProvider[\s\S]*?validateLatestPairSettlement/,
  'Scene Handshake latest-pair provider bridge must use Source Settlement validation instead of local Scene Handshake validation.'
);
assert.equal(
  /providerFailureFallbackSettlement|providerFailureFallback:\s*true|provider-failed-deterministic-fallback|deterministicReplyAcceptsExplicitOrders/.test(sceneHandshakeSettlerSource),
  false,
  'Scene Handshake provider failures must fail closed through SRE/REPAIR evidence instead of deterministic auto-commit fallback.'
);

const chatTurnOrchestratorSource = readFileSync(
  new URL('../../src/runtime/chat-turn-orchestrator.mjs', import.meta.url),
  'utf8'
);
const preflightSceneHandshakeSourceBody = /async\s+function\s+preflightSceneHandshakeSource[\s\S]*?\n  \}/.exec(chatTurnOrchestratorSource)?.[0] || '';
assert.match(
  preflightSceneHandshakeSourceBody,
  /findIngressFresh\(tracked,\s*ingressId\)[\s\S]*?scene-handshake-source-core-ingress-missing/,
  'ChatTurnOrchestrator Scene Handshake SRE preflight must require CORE-only ingress evidence.'
);
assert.equal(
  /runtimeOverlay:\s*true/.test(preflightSceneHandshakeSourceBody),
  false,
  'ChatTurnOrchestrator Scene Handshake SRE preflight must not use runtimeOverlay fallback.'
);
const settleSceneHandshakeBody = /async\s+function\s+settleSceneHandshake[\s\S]*?\n  \}/.exec(chatTurnOrchestratorSource)?.[0] || '';
assert.match(
  settleSceneHandshakeBody,
  /findIngressFresh\(tracked,\s*ingressId\)[\s\S]*?findIngressFresh\(latestState,\s*ingressId\)[\s\S]*?scene-handshake-source-core-ingress-missing/,
  'ChatTurnOrchestrator Scene Handshake latest-pair settlement must validate CORE-only ingress before provider apply.'
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
assert.match(
  chatTurnOrchestratorSource,
  /createSourceToken[\s\S]*?from\s+['"]\.\/frame-contracts\.mjs['"]/,
  'Production chat-turn-orchestrator must import the Frame-owned source-token helper.'
);
assert.equal(
  /sourceToken:\s*compact\(sourceFrame\?\.sourceToken\s*\|\|\s*`turnSourceFrame:\$\{/.test(chatTurnOrchestratorSource),
  false,
  'Production chat-turn background jobs must not hand-build turnSourceFrame source tokens.'
);
assert.equal(
  countSourceMatches(chatTurnOrchestratorSource, /sourceToken:\s*compact\(sourceFrame\?\.sourceToken\s*\|\|\s*createSourceToken\(/g),
  3,
  'Scene seal, pressure digest, and open-world boundary jobs must use canonical Frame source tokens.'
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
  /async\s+function\s+appendPostCommitConversationFailureDiagnostic\b[\s\S]*?findIngressFresh\(tracked,\s*ingressId\)/,
  'Blocking postCommitConversation failure diagnostics must use CORE-only ingress authority.'
);
assert.match(
  chatTurnOrchestratorSource,
  /const\s+postCommitConversationDiagnostic\s*=\s*await\s+appendPostCommitConversationFailureDiagnostic/,
  'Blocking postCommitConversation failures must attempt diagnostics without old recovery fallback.'
);
for (const [fnName, label] of [
  ['scenePhaseSealPayloadForCommittedTurn', 'scene/phase seal'],
  ['pressureArcDigestPayloadForCommittedTurn', 'pressure/arc digest'],
  ['openWorldBoundaryPayloadForCommittedTurn', 'open-world boundary']
]) {
  assert.match(
    chatTurnOrchestratorSource,
    new RegExp(`async\\s+function\\s+${fnName}[\\s\\S]*?findIngressFresh\\(tracked,\\s*ingressId\\)`),
    `FORGE ${label} payload must use CORE-only ingress authority.`
  );
}
assert.equal(
  /async\s+function\s+scenePhaseSealPayloadForCommittedTurn[\s\S]*?findIngressFresh\(tracked,\s*ingressId\)|async\s+function\s+pressureArcDigestPayloadForCommittedTurn[\s\S]*?findIngressFresh\(tracked,\s*ingressId\)|async\s+function\s+openWorldBoundaryPayloadForCommittedTurn[\s\S]*?findIngressFresh\(tracked,\s*ingressId\)/.test(chatTurnOrchestratorSource),
  true,
  'FORGE committed-turn payload builders must not use runtimeOverlay fallback.'
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
  /createChatTurnOrchestrator\(\{[\s\S]*?enableDefaultLatestPairSettlementProvider:\s*true[\s\S]*?\}\)/,
  'Production runtime-app chat-turn wiring must enable the source-settlement latest-pair provider so Scene Handshake can produce SRE owner evidence.'
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
assert.match(
  runtimeAppSource,
  /function\s+syncCurrentChatScopeCampaignState[\s\S]*?shouldPreferInMemoryCampaignState\(currentChatScope\.campaignState,\s*state[\s\S]*?campaignState:\s*cloneJson\(state\)/,
  'Runtime-app must sync bound current-chat scope from fresher CORE/v2 in-memory state after chat-native commits.'
);
assert.match(
  runtimeAppSource,
  /const\s+setCampaignState\s*=\s*\(state\)\s*=>\s*\{[\s\S]*?campaignState\s*=\s*cloneJson\(state\);[\s\S]*?syncCurrentChatScopeCampaignState\(campaignState\);[\s\S]*?\}/,
  'Chat-native runtime services must update current-chat scope when they update campaignState.'
);
const stateFreshnessCountersBody = /function\s+stateFreshnessCounters[\s\S]*?\n\}/.exec(runtimeAppSource)?.[0] || '';
assert.match(
  stateFreshnessCountersBody,
  /responseLedgerRevision:\s*Math\.max\(0,\s*Number\(coreProjection\?\.responseLedgerRevision\)\s*\|\|\s*0\)/,
  'Runtime-app freshness counters must use CORE responseLedgerRevision.'
);
assert.equal(
  /tracking\.responseLedgerRevision/.test(stateFreshnessCountersBody),
  false,
  'Runtime-app freshness counters must not read old runtimeTracking.responseLedgerRevision.'
);
assert.equal(
  /countArray\(tracking\.sidecarJournal\)/.test(stateFreshnessCountersBody),
  false,
  'Runtime-app freshness counters must not treat old sidecarJournal rows as sidecar freshness.'
);
const shouldPreferInMemoryCampaignStateBody = /function\s+shouldPreferInMemoryCampaignState[\s\S]*?\n\}/.exec(runtimeAppSource)?.[0] || '';
assert.match(
  runtimeAppSource,
  /const\s+hasCoreV2RuntimeAuthority\s*=\s*stateHasCoreV2RuntimeAuthority\(candidateState\)[\s\S]*?\|\|\s*stateHasCoreV2RuntimeAuthority\(inMemoryState\)[\s\S]*?if\s*\(\s*!hasCoreV2RuntimeAuthority\s*\)\s*\{[\s\S]*?inMemory\.revision\s*>\s*candidate\.revision[\s\S]*?inMemory\.mechanicsRevision\s*>\s*candidate\.mechanicsRevision[\s\S]*?\}/,
  'Runtime-app freshness arbitration must ignore old runtimeTracking revision/mechanics counters whenever either side has CORE/v2 runtime authority.'
);
assert.equal(
  /modelCallJournalEntries\s*>\s*candidate\.modelCallJournalEntries|candidate\.modelCallJournalEntries\s*>\s*inMemory\.modelCallJournalEntries/.test(shouldPreferInMemoryCampaignStateBody),
  false,
  'Runtime-app freshness arbitration must not prefer state based only on old modelCallJournal growth.'
);
assert.match(
  lensPromptRevisionRecordSource,
  /kind:\s*['"]directive\.lensPromptRevisionRecord\.v1['"]/,
  'LENS prompt revision records must have an explicit LENS-owned compact projection kind.'
);
assert.match(
  contextOrchestratorSource,
  /function\s+promptRevisionAuthority[\s\S]*?lensPromptRevisionRecord[\s\S]*?campaignChatBinding\?\.promptContextRevision[\s\S]*?runtimeResume\?\.promptContextRevision[\s\S]*?const\s+priorRevision\s*=\s*promptRevisionAuthority\(campaignState\)/,
  'Context plan revision authority must come from LENS prompt revision records and lightweight binding/resume refs.'
);
assert.match(
  continuityDiagnosticsSource,
  /function\s+promptRevisionRecord[\s\S]*?lensPromptRevisionRecord[\s\S]*?campaignChatBinding\?\.promptContextHash[\s\S]*?runtimeResume\?\.promptContextHash[\s\S]*?promptRevision:\s*promptRecord\.revision[\s\S]*?promptHash:\s*promptRecord\.hash/,
  'Continuity diagnostics must read LENS prompt revision records instead of old promptContext bodies.'
);
assert.match(
  continuityDiagnosticsSource,
  /function\s+promptKeyStatus\(promptInspection\s*=\s*null\)[\s\S]*?if\s*\(!inspectedBlocks\.length\)[\s\S]*?status:\s*['"]not-inspected['"][\s\S]*?const\s+installedKeys\s*=\s*new\s+Set\(inspectedBlocks\.map/,
  'Continuity diagnostics static-key evidence must come from explicit prompt inspection, not saved promptContext blocks.'
);
assert.match(
  runtimeAppSource,
  /const\s+binding\s*=\s*cloneJson\(state\.campaignChatBinding\s*\|\|\s*null\)[\s\S]*?delete\s+binding\.promptContext[\s\S]*?const\s+lensPromptRecord\s*=\s*state\.directiveRuntimeEvidence\?\.lensPromptRevisionRecord[\s\S]*?prompt:\s*\{[\s\S]*?revision:\s*promptRevision[\s\S]*?hash:\s*promptHash/,
  'Runtime chat-native view must expose compact LENS prompt metadata and scrub old binding promptContext bodies.'
);
for (const [name, source] of [
  ['player-safe-prompt-context-builder', playerSafePromptContextBuilderSource],
  ['context-orchestrator', contextOrchestratorSource],
  ['runtime-app', runtimeAppSource],
  ['continuity-diagnostics', continuityDiagnosticsSource]
]) {
  assert.equal(
    /runtimeTracking\.promptContext\s*=|runtimeTracking\?\.promptContext(?!Revision|Hash)|runtimeTracking\.promptContext(?!Revision|Hash)|campaignChatBinding\?\.promptContext(?!Revision|Hash)|campaignChatBinding\.promptContext(?!Revision|Hash)|promptContext:\s*cloneJson\(.*runtimeTracking\?\.promptContext|promptContext:\s*state\.runtimeTracking\?\.promptContext/.test(source),
    false,
    `${name} must not read, write, or copy old promptContext bodies as prompt revision authority.`
  );
}
const flushChatSidecarsBody = /async\s+flushChatSidecars\(\)[\s\S]*?async\s+flushRuntimeDiagnostics\(\)/.exec(runtimeAppSource)?.[0] || '';
assert.match(
  flushChatSidecarsBody,
  /const\s+sidecarCountBefore\s*=\s*Number\.isFinite\(coreSidecarResumeCountBefore\)[\s\S]*?const\s+sidecarCountAfter\s*=\s*Number\.isFinite\(coreSidecarResumeCountAfter\)/,
  'Runtime-app sidecar flush primary counters must use CORE resume counts, not old sidecarJournal rows.'
);
assert.match(
  flushChatSidecarsBody,
  /sidecarDelta:\s*Math\.max\(sidecarCountDelta,\s*coreSidecarDiagnosticDelta\s*\?\?\s*0,\s*resultCount\)/,
  'Runtime-app sidecar flush delta must ignore old sidecarJournal growth.'
);
assert.equal(
  /(?<!legacy)sidecarJournalCount/.test(flushChatSidecarsBody),
  false,
  'Runtime-app sidecar flush must expose old sidecarJournal counters only as legacy telemetry.'
);
assert.match(
  runtimeAppSource,
  /function\s+runtimeIngressForContext[\s\S]*?const\s+ledger\s*=\s*createRuntimeLedgerView\(campaignState\s*\|\|\s*\{\}\)\.ingressLedger\s*\|\|\s*\[\]/,
  'Runtime-app ingress context lookup must use CORE-only runtime ledger view.'
);
assert.match(
  runtimeAppSource,
  /function\s+runtimeResponseForContext[\s\S]*?const\s+ledger\s*=\s*createRuntimeLedgerView\(campaignState\s*\|\|\s*\{\}\)\.responseLedger\s*\|\|\s*\[\]/,
  'Runtime-app response context lookup must use CORE-only runtime ledger view.'
);
assert.match(
  runtimeAppSource,
  /function\s+responseRowsForFresherMerge[\s\S]*?const\s+projections\s*=\s*readRuntimeCoreProjections\(state\s*\|\|\s*\{\}\)[\s\S]*?coreResponseProjectionRows\(projections\)/,
  'Runtime-app fresher response merge must source rows from CORE read projections, not old runtimeTracking response ledgers.'
);
assert.match(
  runtimeAppSource,
  /function\s+mergeFresherResponseLedgerProjection[\s\S]*?coreStoreReadProjections[\s\S]*?responses/,
  'Runtime-app fresher response merge must write fresher response rows into transient CORE read projections.'
);
assert.match(
  runtimeAppSource,
  /async\s+function\s+refreshViewCoreProjectionEvidence\(\)[\s\S]*?stateWithCoreProjectionFreshnessEvidence\(modelCallJournal\.applyPending\(campaignState\)\)[\s\S]*?currentChatScope\s*=\s*\{[\s\S]*?campaignState:\s*await\s+stateWithCoreProjectionFreshnessEvidence\(currentChatScope\.campaignState\)/,
  'Runtime-app view reads must attach live CORE projection freshness before exposing campaign/chat state to proof tooling.'
);
assert.match(
  runtimeAppSource,
  /async\s+getCurrentView\(\{ tabId = 'campaign' \} = \{\}\)[\s\S]*?await\s+refreshCurrentChatCampaignScope\(\);[\s\S]*?await\s+refreshViewCoreProjectionEvidence\(\);[\s\S]*?return\s+viewEnvelope\(tabId\);/,
  'Runtime-app getCurrentView must refresh CORE projection evidence before returning the runtime view.'
);
const mergeFresherResponseLedgerProjectionBody = /function\s+mergeFresherResponseLedgerProjection[\s\S]*?\n\}/.exec(runtimeAppSource)?.[0] || '';
assert.match(
  mergeFresherResponseLedgerProjectionBody,
  /responseLedgerRevision\s*=\s*Math\.max\([\s\S]*?candidateEvidence\.responseLedgerRevision[\s\S]*?memoryEvidence\.responseLedgerRevision[\s\S]*?coreStoreReadProjections:[\s\S]*?responseLedgerRevision,[\s\S]*?responses/,
  'Runtime-app fresher response merge must carry responseLedgerRevision through CORE projection evidence.'
);
assert.equal(
  /memoryTracking\.responseLedgerRevision|responseLedgerRevision:\s*Math\.max\([\s\S]*?candidateTracking\.responseLedgerRevision/.test(mergeFresherResponseLedgerProjectionBody),
  false,
  'Runtime-app fresher response merge must not promote old responseLedgerRevision into runtimeTracking.'
);
assert.equal(
  /function\s+mergeFresherResponseLedgerProjection[\s\S]*?Array\.isArray\(memoryTracking\.responseLedger\)|function\s+mergeFresherResponseLedgerProjection[\s\S]*?responseLedger:\s*cloneJson\(memoryLedger\)|function\s+mergeFresherResponseLedgerProjection[\s\S]*?responseLedger:\s*responseLedger/.test(runtimeAppSource),
  false,
  'Runtime-app fresher response merge must not copy raw in-memory responseLedger rows or write merged rows into old runtimeTracking.responseLedger.'
);
assert.equal(
  /memoryByKey/.test(runtimeAppSource),
  false,
  'Runtime-app fresher response merge must not use a hostMessageId-keyed memory map.'
);
const mergeCoreTurnLedgerProjectionBody = /function\s+mergeCoreTurnLedgerProjection[\s\S]*?\n\}[\s\S]*?\n\nconst\s+RERUN_PREVIEW_RAW_INPUT_KEYS/.exec(runtimeAppSource)?.[0] || '';
assert.match(
  mergeCoreTurnLedgerProjectionBody,
  /const\s+hasCoreEntries\s*=\s*Array\.isArray\(coreTurnLedger\?\.entries\)[\s\S]*?const\s+coreEntries\s*=\s*hasCoreEntries\s*\?\s*coreTurnLedger\.entries\s*:\s*\[\][\s\S]*?const\s+entries\s*=\s*hasCoreEntries[\s\S]*?coreEntries\.map[\s\S]*?replacementHistory:\s*hasCoreReplacementHistory\s*\?\s*cloneJson\(coreTurnLedger\.replacementHistory\)\s*:\s*undefined/,
  'Runtime-app CORE turn merge must build active turn/replacement rows from CORE projections only.'
);
assert.equal(
  /if\s*\(!projected\)\s*return\s+cloneJson\(entry\)|turnLedger\.entries\.map/.test(mergeCoreTurnLedgerProjectionBody),
  false,
  'Runtime-app CORE turn merge must not preserve unmatched old turnLedger entries.'
);
assert.equal(
  /Array\.isArray\(turnLedger\.replacementHistory\)|cloneJson\(turnLedger\.replacementHistory\)/.test(mergeCoreTurnLedgerProjectionBody),
  false,
  'Runtime-app CORE turn merge must not preserve old replacementHistory.'
);
const responseProjectionMergeKeysBody = /function\s+responseProjectionMergeKeys[\s\S]*?\n\}/.exec(runtimeAppSource)?.[0] || '';
assert.equal(
  /hostMessageId/.test(responseProjectionMergeKeysBody),
  false,
  'Runtime-app fresher response merge must not match response projections solely by hostMessageId.'
);
assert.match(
  runtimeAppSource,
  /async\s+function\s+forgeSourceCurrentForRuntime[\s\S]*?runtimeCoreTurnStore\?\.readProjections[\s\S]*?projections\?\.ingressLedger[\s\S]*?const\s+ledger\s*=\s*projections\.ingressLedger/,
  'Runtime-app FORGE source-current checks must use live CORE projections as the only source-current authority.'
);
const forgeSourceCurrentForRuntimeBody = /function\s+forgeSourceCurrentForRuntime[\s\S]*?\n  \}/.exec(runtimeAppSource)?.[0] || '';
assert.equal(
  /runtimeTracking\?\.ingressLedger|createRuntimeLedgerView/.test(forgeSourceCurrentForRuntimeBody),
  false,
  'Runtime-app FORGE source-current checks must not fall back to raw or materialized old ingress ledgers.'
);
assert.match(
  runtimeAppSource,
  /function\s+coreDiagnosticTargetForModelCall[\s\S]*?createRuntimeLedgerView\(tracked\s*\|\|\s*\{\}\)\.ingressLedger\s*\|\|\s*\[\]/,
  'Runtime-app model-call CORE diagnostic target lookup must use CORE-only runtime ledger view.'
);
const coreDiagnosticTargetForModelCallBody = /function\s+coreDiagnosticTargetForModelCall[\s\S]*?\n  \}/.exec(runtimeAppSource)?.[0] || '';
assert.equal(
  /runtimeTracking\?\.ingressLedger|hotIngress/.test(coreDiagnosticTargetForModelCallBody),
  false,
  'Runtime-app model-call diagnostics must not read raw runtimeTracking.ingressLedger for CORE diagnostic target authority.'
);
const runtimeIngressForContextBody = /function\s+runtimeIngressForContext[\s\S]*?\n  \}/.exec(runtimeAppSource)?.[0] || '';
assert.equal(
  /hotById|hotByOutcome|hotByTurn|runtimeTracking\?\.ingressLedger/.test(runtimeIngressForContextBody),
  false,
  'Runtime-app transient ingress lookup must not let raw runtimeTracking rows win by id, outcomeId, or turnId.'
);
const runtimeResponseForContextBody = /function\s+runtimeResponseForContext[\s\S]*?\n  \}/.exec(runtimeAppSource)?.[0] || '';
assert.equal(
  /hotById|hotByHost|hotByOutcome|hotByTurn|runtimeTracking\?\.responseLedger|\[\.\.\.\(campaignState\?\.runtimeTracking\?\.responseLedger/.test(runtimeResponseForContextBody),
  false,
  'Runtime-app transient response lookup must not let raw runtimeTracking rows win by id, hostMessageId, outcomeId, turnId, or ingressId.'
);
const modelCallJournalSource = readFileSync(
  new URL('../../src/runtime/model-call-journal.mjs', import.meta.url),
  'utf8'
);
const lensPromptSchedulerSource = readFileSync(
  new URL('../../src/runtime/lens-prompt-scheduler.mjs', import.meta.url),
  'utf8'
);
assert.match(
  modelCallJournalSource,
  /function\s+recordResumeCursor[\s\S]*?runtimeResume[\s\S]*?modelCallEventSequence[\s\S]*?function\s+synchronize/,
  'Model-call journal must keep a compact runtimeResume cursor for CORE-targeted model calls.'
);
assert.match(
  modelCallJournalSource,
  /for\s*\(const\s+event\s+of\s+pendingModelCallEvents\)\s*\{[\s\S]*?next\s*=\s*recordResumeCursor\(next,\s*event\)[\s\S]*?seen\.add\(event\.id\)[\s\S]*?\}/,
  'Model-call journal applyPending must keep only compact resume cursors for pending events.'
);
assert.equal(
  /recordModelCallEvent/.test(modelCallJournalSource),
  false,
  'Model-call journal must not append runtime events into old runtimeTracking.modelCallJournal.'
);
assert.match(
  modelCallJournalSource,
  /readRuntimeCoreProjections[\s\S]*?function\s+modelCallDiagnosticsFromCoreProjections[\s\S]*?projections\.modelCallDiagnostics[\s\S]*?function\s+modelCallIdsForDedupe[\s\S]*?modelCallDiagnosticsFromCoreProjections\(state\)[\s\S]*?const\s+seen\s*=\s*modelCallIdsForDedupe\(next\)/,
  'Model-call journal must dedupe pending rows against CORE model-call diagnostics only.'
);
assert.match(
  recordModelCallEventBody,
  /DIRECTIVE_CORE_PROJECTION_REQUIRED_FOR_OLD_LEDGER_WRITE[\s\S]*?coreDiagnosticProjectionRequired/,
  'Direct model-call old-ledger writes must fail closed and require CORE diagnostic projections.'
);
assert.match(
  modelCallJournalSource,
  /const\s+coreDiagnosticTarget\s*=\s*coreDiagnosticTargetForEvent\(modelCallEvent\)[\s\S]*?modelCallEvent\.coreDiagnosticPrimary\s*=\s*true[\s\S]*?enqueueCoreDiagnostic\(modelCallEvent,\s*coreDiagnosticTarget\)/,
  'Model-call journal must classify CORE-targeted calls before enqueueing diagnostics.'
);
assert.match(
  runtimeAppSource,
  /observeExternalPromptEnvironment:\s*async\s*\(input\s*=\s*\{\}\)\s*=>\s*promptExternalEnvironmentForSync\(input\?\.promptFrame\s*\|\|\s*null\)/,
  'Runtime-app LENS scheduler must use the production prompt-adapter external-context observer, not a null observer.'
);
assert.match(
  runtimeAppSource,
  /function\s+promptExternalEnvironmentForSync[\s\S]*?runtimeHost\?\.prompt\?\.inspect\?\.\(\{\s*includeText:\s*false\s*\}\)[\s\S]*?externalPromptEnvironmentTargets[\s\S]*?knownExternalPromptKeys/,
  'Runtime-app external prompt observation must inspect redacted prompt metadata and carry target summaries/keys.'
);
assert.match(
  runtimeAppSource,
  /function\s+promptExternalEnvironmentForSync[\s\S]*?const\s+inspectedRef[\s\S]*?const\s+ref\s*=\s*inspectedRef\s*\|\|\s*frameRef/,
  'Runtime-app external prompt observation must prefer fresh prompt-adapter refs over stale source-frame refs for LENS cache identity.'
);
assert.match(
  runtimeAppSource,
  /const\s+externalPromptEnvironment\s*=\s*promptExternalEnvironmentForSync\(lensPromptFrame\)[\s\S]*?lens\.flush\(\{[\s\S]*?externalPromptEnvironment,[\s\S]*?externalPromptEnvironmentRef/,
  'Runtime-app prompt sync must pass the compact external environment bundle into LENS flush.'
);
assert.match(
  lensPromptSchedulerSource,
  /function\s+externalPromptInspectionBundle[\s\S]*?externalPromptEnvironmentRef[\s\S]*?prompt-adapter-inspection[\s\S]*?externalPromptEnvironmentTargets/,
  'LENS scheduler must preserve prompt-adapter inspection refs and target summaries.'
);
assert.match(
  runtimeAppSource,
  /function\s+chatNativeViewForState[\s\S]*?const\s+runtimeLedgerView\s*=\s*createRuntimeLedgerView\(state\s*\|\|\s*\{\}\)[\s\S]*?const\s+runtimeResponseLedger\s*=\s*runtimeLedgerView\.responseLedger\s*\|\|\s*\[\][\s\S]*?const\s+runtimeRecoveryJournal\s*=\s*runtimeLedgerView\.recoveryJournal\s*\|\|\s*\[\]/,
  'Runtime-app chatNative view must derive runtime counters/recovery from CORE-first runtime ledger view.'
);
assert.match(
  runtimeAppSource,
  /function\s+stateFreshnessCounters[\s\S]*?pendingInteractions:\s*countArray\(pendingInteractionProjectionRows\(state\)\)/,
  'Runtime-app freshness counters must count only owner-tagged pending interaction projections.'
);
assert.match(
  runtimeAppSource,
  /function\s+pendingInteractionProjectionRows[\s\S]*?readRuntimeCoreProjections\(state\s*\|\|\s*\{\}\)[\s\S]*?projections\.pendingInteractions[\s\S]*?filter\(isPendingInteractionProjectionRow\)[\s\S]*?function\s+chatNativeViewForState[\s\S]*?pendingInteractions:\s*cloneJson\(pendingInteractionProjectionRows\(state\)\)/,
  'Runtime-app chatNative view must expose CORE pending interaction projections, not legacy mirror rows.'
);
assert.match(
  runtimeAppSource,
  /function\s+mergeablePendingInteractionProjectionRows[\s\S]*?pendingInteractionProjectionRows\(state\)[\s\S]*?kind\s*!==\s*['"]terminalOutcomeDecision['"][\s\S]*?function\s+modelCallDiagnosticsForState/,
  'Runtime-app runtime-persist pending merge must exclude terminal decisions now owned by the terminal decision ledger.'
);
assert.match(
  runtimeAppSource,
  /function\s+mergeRuntimePersistPendingStates[\s\S]*?const\s+priorPendingRows\s*=\s*mergeablePendingInteractionProjectionRows\(priorState\)[\s\S]*?const\s+nextPendingRows\s*=\s*mergeablePendingInteractionProjectionRows\(nextState\)[\s\S]*?coreStoreReadProjections:[\s\S]*?pendingInteractions:\s*cloneJson\(priorPendingRows\)/,
  'Runtime-app runtime-persist pending merge must preserve pending state as CORE read-projection evidence, not runtimeTracking rows.'
);
assert.equal(
  /function\s+mergeRuntimePersistPendingStates[\s\S]*?mergedTracking\.pendingInteractions\s*=|function\s+mergeRuntimePersistPendingStates[\s\S]*?pendingInteractions\s*=\s*cloneJson\(priorState\.runtimeTracking\.pendingInteractions\)/.test(runtimeAppSource),
  false,
  'Runtime-app runtime-persist pending merge must not write stale pendingInteractions back into runtimeTracking.'
);
assert.equal(
  /function\s+mergeRuntimePersistPendingStates[\s\S]*?mergedTracking\.(ingressLedger|responseLedger|recoveryJournal)\s*=\s*cloneJson\(priorState\.runtimeTracking\.(ingressLedger|responseLedger|recoveryJournal)\)/.test(runtimeAppSource),
  false,
  'Runtime-app runtime-persist pending merge must not raw-copy old ingress/response/recovery ledgers; CORE projections carry freshness evidence.'
);
assert.match(
  runtimeAppSource,
  /function\s+mergeRuntimePersistCoreProjections[\s\S]*?const\s+nextHasRuntimeAuthority[\s\S]*?nextProjection\.runtimeAuthority\s*===\s*['"]coreStoreV2['"][\s\S]*?entries:\s*nextTurnLedgerAuthority\s*&&\s*Array\.isArray\(nextTurnLedger\?\.entries\)[\s\S]*?cloneJson\(nextTurnLedger\.entries\)[\s\S]*?['"]responses['"][\s\S]*?merged\[key\]\s*=\s*nextHasRuntimeAuthority\s*&&\s*Array\.isArray\(nextNormalized\[key\]\)[\s\S]*?cloneJson\(nextNormalized\[key\]\)/,
  'Runtime-app runtime-persist CORE projection merge must replace explicit authoritative next arrays instead of unioning stale prior rows.'
);
assert.match(
  runtimeAppSource,
  /function\s+mergeRuntimePersistPendingStates[\s\S]*?const\s+nextHasAuthoritativeTurnProjection[\s\S]*?!nextHasAuthoritativeTurnProjection\s*&&\s*prior\.turnLedgerEntries\s*>\s*next\.turnLedgerEntries[\s\S]*?const\s+nextHasAuthoritativePendingProjection[\s\S]*?!nextHasAuthoritativePendingProjection\s*&&\s*priorPendingRows\.length\s*>\s*nextPendingRows\.length/,
  'Runtime-app pending-state merge must not restore stale prior turn/pending rows over explicit authoritative CORE projections.'
);
const chatNativeViewForStateBody = /function\s+chatNativeViewForState[\s\S]*?\n  \}/.exec(runtimeAppSource)?.[0] || '';
assert.equal(
  /state\.runtimeTracking\.(ingressLedger|responseLedger|recoveryJournal)(?![A-Za-z0-9_])/.test(chatNativeViewForStateBody),
  false,
  'Runtime-app chatNative view must not expose raw old ingress/response/recovery ledger rows.'
);
assert.match(
  runtimeAppSource,
  /function\s+chatNativeViewForState[\s\S]*?sceneReconciliation:\s*cloneJson\(state\.sceneReconciliation\s*\|\|\s*null\)/,
  'Runtime-app chatNative view must expose only top-level Scene Reconciliation state.'
);
assert.equal(
  /chatNativeViewForState[\s\S]*?runtimeTracking\?\.sceneReconciliation|chatNativeViewForState[\s\S]*?runtimeTracking\.sceneReconciliation/.test(runtimeAppSource),
  false,
  'Runtime-app chatNative view must not fall back to nested runtimeTracking.sceneReconciliation.'
);
assert.equal(
  /function\s+compatibilityRowsThatCanBlockCoreAuthority/.test(runtimeAppSource),
  false,
  'Runtime-app CORE authority marker must remove the old compatibility-row veto helper entirely.'
);
assert.match(
  runtimeAppSource,
  /function\s+coreProjectionHasRuntimeAuthority[\s\S]*?const\s+hasCoreRuntimeProjection\s*=[\s\S]*?Array\.isArray\(projections\.turnLedger\?\.entries\)[\s\S]*?Array\.isArray\(projections\.ingressLedger\)[\s\S]*?if\s*\(hasCoreRuntimeProjection\)\s*return\s+true/,
  'Runtime-app CORE authority coverage must let CORE runtime projection shape mark authority without old-ledger veto.'
);
const coreProjectionHasRuntimeAuthorityBody = /function\s+coreProjectionHasRuntimeAuthority[\s\S]*?\n\}/.exec(runtimeAppSource)?.[0] || '';
assert.equal(
  /runtimeTracking\.(?:ingressLedger|responseLedger)|runtimeTracking\?\.(?:ingressLedger|responseLedger)/.test(coreProjectionHasRuntimeAuthorityBody),
  false,
  'Runtime-app CORE authority coverage must not inspect old runtimeTracking ingress/response ledgers.'
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
const selectedSwipeActuationLiveSource = readFileSync(
  new URL('./run-sillytavern-selected-swipe-actuation-live.mjs', import.meta.url),
  'utf8'
);
const messageMutationActuationRunnerSource = readFileSync(
  new URL('./run-sillytavern-message-mutation-actuation-live.mjs', import.meta.url),
  'utf8'
);
const smokeSceneHandshakeLiveSource = readFileSync(
  new URL('./smoke-scene-handshake-live.mjs', import.meta.url),
  'utf8'
);
const transactionStateSource = readFileSync(
  new URL('../../src/campaign/transaction-state.mjs', import.meta.url),
  'utf8'
);
assert.equal(
  /\bquarantineGeneratedClaims\b|\baddContinuityProjectionHints\b|\brecordContinuityFactUseStats\b/.test(transactionStateSource),
  false,
  'Transaction-state narration commit must not write old continuity candidate/rejected/hint/fact-use roots.'
);
const settingsPanelSource = readFileSync(
  new URL('../../src/ui/settings-panel.js', import.meta.url),
  'utf8'
);
const missionPanelSource = readFileSync(
  new URL('../../src/ui/mission-panel.js', import.meta.url),
  'utf8'
);
assert.match(
  missionPanelSource,
  /function\s+pendingSceneReconciliationItems[\s\S]*?view\?\.chatNative\?\.sceneReconciliation\s*\|\|\s*state\?\.sceneReconciliation\s*\|\|\s*null/,
  'Mission panel Scene Reconciliation review must use chatNative/top-level SRE state only.'
);
assert.equal(
  /pendingSceneReconciliationItems[\s\S]*?runtimeTracking\?\.sceneReconciliation|pendingSceneReconciliationItems[\s\S]*?runtimeTracking\.sceneReconciliation/.test(missionPanelSource),
  false,
  'Mission panel Scene Reconciliation review must not render nested runtimeTracking.sceneReconciliation.'
);
assert.match(
  smokeSceneHandshakeLiveSource,
  /wait-scene-handshake-settlement[\s\S]*?snapshot\.promptContextRevision\s*>\s*before\.promptContextRevision[\s\S]*?last\.status\s*===\s*['"]settled['"]/,
  'Scene Handshake live smoke must wait for prompt sync completion, not only the intermediate settlement row.'
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
  'State delta gateway must retain the settings default while hot runtimeTracking.history rows stay empty.'
);
assert.equal(
  /value\s*\?\?\s*campaignState\.settings\?\.maxTurnSaveHistory\s*\?\?\s*campaignState\.runtimeTracking\?\.historyLimit/.test(runtimeAppSource),
  false,
  'Runtime settings defaulting must not preserve old runtimeTracking.historyLimit as an implicit user setting.'
);
assert.equal(
  /maxTurnSaveHistory\s*\?\?\s*historyLimit\s*\?\?\s*campaignState\.settings\?\.maxTurnSaveHistory\s*\?\?\s*campaignState\.runtimeTracking\?\.historyLimit/.test(runtimeAppSource),
  false,
  'Runtime settings defaulting must not preserve old runtimeTracking.historyLimit after the explicit historyLimit parameter.'
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
  selectedSwipeActuationLiveSource,
  /assert\(args\.has\(['"]--live['"]\)[\s\S]*?actuationMode:\s*['"]native-host-swipe-control['"][\s\S]*?nativeHostControlMoved:\s*actuation\.nativeHostControlMoved\s*===\s*true/,
  'Selected-swipe release proof must require live native host control actuation.'
);
assert.match(
  selectedSwipeActuationLiveSource,
  /proposeCorrectAsSwipeCandidate[\s\S]*?clickNativeSwipeControl[\s\S]*?nativeHostControls/,
  'Selected-swipe runner must prepare an unselected candidate and then click a native SillyTavern swipe control.'
);
assert.match(
  messageMutationActuationRunnerSource,
  /id:\s*['"]selected-swipe['"][\s\S]*?script:\s*['"]tools\/scripts\/run-sillytavern-selected-swipe-actuation-live\.mjs['"]/,
  'Message mutation actuation runner must use the native selected-swipe actuation runner, not staged Scene Handshake proof.'
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
  /async\s+function\s+appendPostCommitConversationCoreDiagnostic\b[\s\S]*?flushPostCommitConversationCoreDiagnostics/,
  'Runtime-app scheduled postCommitConversation failures must have an awaited CORE diagnostic path.'
);
assert.match(
  runtimeAppSource,
  /async\s+function\s+appendRuntimeCoreDiagnosticsBatch\b[\s\S]*?appendDiagnosticsBatch/,
  'Runtime-app local sidecar diagnostics must use the CORE batch append path when available.'
);
assert.match(
  runtimeAppSource,
  /function\s+flushCommandLogSummaryCoreDiagnostics\b[\s\S]*?appendRuntimeCoreDiagnosticsBatch/,
  'Runtime-app command-log sidecar lifecycle diagnostics must flush as a local CORE batch.'
);
assert.match(
  runtimeAppSource,
  /function\s+flushPostCommitConversationCoreDiagnostics\b[\s\S]*?appendRuntimeCoreDiagnosticsBatch/,
  'Runtime-app post-commit sidecar lifecycle diagnostics must flush as a local CORE batch.'
);
assert.match(
  runtimeAppSource,
  /function\s+flushAdvisoryEnrichmentCoreDiagnostics\b[\s\S]*?appendRuntimeCoreDiagnosticsBatch/,
  'Runtime-app advisory sidecar lifecycle diagnostics must flush as a local CORE batch.'
);
assert.match(
  runtimeAppSource,
  /function\s+flushTerminalCheckpointCoreDiagnostics\b[\s\S]*?appendRuntimeCoreDiagnosticsBatch/,
  'Runtime-app terminal checkpoint diagnostics must flush as a local CORE batch.'
);
assert.equal(
  /function\s+queueCommandLogSummaryCoreDiagnostic\b[\s\S]*?runtimeCoreTurnStore\.appendDiagnostics[\s\S]*?function\s+commandLogSummaryCoreBackgroundBundle/.test(runtimeAppSource),
  false,
  'Runtime-app command-log diagnostic queue must not append one CORE diagnostic per lifecycle event.'
);
assert.equal(
  /function\s+queuePostCommitConversationCoreDiagnostic\b[\s\S]*?runtimeCoreTurnStore\.appendDiagnostics[\s\S]*?function\s+postCommitConversationCoreBackgroundBundle/.test(runtimeAppSource),
  false,
  'Runtime-app post-commit diagnostic queue must not append one CORE diagnostic per lifecycle event.'
);
assert.equal(
  /function\s+queueAdvisoryEnrichmentCoreDiagnostic\b[\s\S]*?runtimeCoreTurnStore\.appendDiagnostics[\s\S]*?function\s+advisoryEnrichmentCoreBackgroundBundle/.test(runtimeAppSource),
  false,
  'Runtime-app advisory diagnostic queue must not append one CORE diagnostic per lifecycle event.'
);
assert.equal(
  /function\s+queueTerminalCheckpointSettlement\b[\s\S]*?runtimeCoreTurnStore\.appendDiagnostics[\s\S]*?function\s+sidecarCoreDiagnosticTargetForEvent/.test(runtimeAppSource),
  false,
  'Runtime-app terminal checkpoint settlement must not append one CORE diagnostic per lifecycle event.'
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
const campaignEndConditionServiceSource = readFileSync(
  new URL('../../src/runtime/campaign-end-condition-service.mjs', import.meta.url),
  'utf8'
);
const endConditionsSource = readFileSync(
  new URL('../../src/campaign/end-conditions.mjs', import.meta.url),
  'utf8'
);
const sceneReconciliationSource = readFileSync(
  new URL('../../src/runtime/scene-reconciliation.mjs', import.meta.url),
  'utf8'
);
const campaignSidecarSchedulerSource = readFileSync(
  new URL('../../src/jobs/campaign-sidecar-scheduler.mjs', import.meta.url),
  'utf8'
);
assert.equal(
  /runtimeTracking\.promptContext\s*=|prompt\.runtimeTracking\?\.promptContext/.test(campaignSidecarSchedulerSource),
  false,
  'Campaign sidecar prompt-only state merge must carry LENS prompt revision records instead of old runtimeTracking.promptContext.'
);
const forgeCoordinatorSource = readFileSync(
  new URL('../../src/jobs/forge-coordinator.mjs', import.meta.url),
  'utf8'
);
assert.equal(
  /function\s+retainedTerminalSnapshotRecord/.test(campaignEndConditionServiceSource),
  false,
  'End-condition service must not promote old retained snapshots into terminal replay authority.'
);
assert.equal(
  /sourceKind:\s*['"]turnLedger\.snapshotBefore['"]/.test(campaignEndConditionServiceSource),
  false,
  'End-condition service must not write terminal CORE checkpoints from old turnLedger.snapshotBefore.'
);
assert.equal(
  /sourceKind:\s*['"]runtimeTracking\.history\.outcomeSnapshot['"]/.test(campaignEndConditionServiceSource),
  false,
  'End-condition service must not write terminal CORE checkpoints from old runtimeTracking.history snapshots.'
);
assert.equal(
  /lastCommittedTurn\?\.coreCheckpointRef|lastCommittedTurn\.coreCheckpointRef/.test(`${campaignEndConditionServiceSource}\n${endConditionsSource}`),
  false,
  'Terminal checkpoint authority must come from turnLedger CORE checkpoint refs, not runtimeTracking.lastCommittedTurn.'
);
assert.match(
  campaignEndConditionServiceSource,
  /function\s+terminalLedgerAuthority[\s\S]*?directive\.terminalEndConditionLedgerProjectionRef\.v1[\s\S]*?function\s+detectionRecord[\s\S]*?terminalLedgerAuthority\(detection,\s*\{\s*rowKind:\s*['"]detection['"][\s\S]*?function\s+decisionRecord[\s\S]*?terminalLedgerAuthority\(detection,\s*\{\s*rowKind:\s*['"]decision['"]/,
  'End-condition service must tag detection and decision ledger rows with terminal owner projection evidence.'
);
assert.match(
  campaignEndConditionServiceSource,
  /branchRecords:\s*\[[\s\S]*?terminalLedgerAuthority\([\s\S]*?rowKind:\s*['"]branchRecord['"][\s\S]*?action:\s*['"]saveTerminalBranch['"]/,
  'End-condition service must tag terminal branch ledger rows with terminal owner projection evidence.'
);
assert.match(
  campaignEndConditionServiceSource,
  /import\s+\{[\s\S]*?terminalDecisionLedgerView[\s\S]*?withTerminalDecisionLedgerProjection[\s\S]*?\}\s+from\s+['"]\.\/terminal-decision-ledger-view\.mjs['"]/,
  'End-condition service must use shared terminal ledger projection accessors.'
);
assert.equal(
  /runtimeTracking\.pendingInteractions\s*=/.test(campaignEndConditionServiceSource),
  false,
  'End-condition service must not store terminal outcome decisions as durable runtimeTracking pendingInteractions rows.'
);
assert.match(
  campaignEndConditionServiceSource,
  /isPendingInteractionProjectionRow[\s\S]*?function\s+pendingInteractionProjectionRows[\s\S]*?function\s+activeTerminalInteraction[\s\S]*?pendingInteractionProjectionRows\(state\)/,
  'End-condition service terminal pending authority must use CORE pending-interaction projections.'
);
assert.match(
  campaignEndConditionServiceSource,
  /async\s+function\s+recordCoreTerminalPendingInteraction[\s\S]*?coreTurnStore\?\.recordPendingInteraction[\s\S]*?async\s+function\s+resolveCoreTerminalPendingInteraction[\s\S]*?coreTurnStore\?\.resolvePendingInteraction/,
  'End-condition service terminal decisions must record and resolve pending authority through CORE.'
);
assert.match(
  runtimeAppSource,
  /terminalDecisionLedgerView[\s\S]*?from\s+['"]\.\/terminal-decision-ledger-view\.mjs['"][\s\S]*?function\s+terminalCheckpointCoreTargetForEvent[\s\S]*?terminalDecisionLedgerView\(campaignState\s*\|\|\s*\{\}\)[\s\S]*?function\s+pendingTerminalDecisionId[\s\S]*?terminalDecisionLedgerView\(state\s*\|\|\s*\{\}\)[\s\S]*?function\s+terminalDecisionStillPending[\s\S]*?terminalDecisionLedgerView\(state\s*\|\|\s*\{\}\)/,
  'Runtime-app terminal decision reads must use the shared terminal ledger projection view.'
);
assert.match(
  runtimeAppSource,
  /isPendingInteractionProjectionRow[\s\S]*?from\s+['"]\.\/state-delta-gateway\.mjs['"]/,
  'Runtime-app terminal settlement must import the shared pending-interaction projection predicate.'
);
assert.match(
  runtimeAppSource,
  /function\s+terminalCheckpointCoreTargetForEvent[\s\S]*?pendingInteractionProjectionRows\(campaignState\)[\s\S]*?runtimeIngressForContext/,
  'Runtime-app terminal checkpoint settlement must not derive CORE targets from unowned pendingInteraction rows.'
);
assert.equal(
  /function\s+pendingTerminalDecisionId[\s\S]*?pendingInteractions\s*\|\|\s*\[\]|function\s+terminalDecisionStillPending[\s\S]*?pendingInteractions\s*\|\|\s*\[\]/.test(runtimeAppSource),
  false,
  'Runtime-app terminal freshness preservation must not derive pending decisions from pendingInteraction mirror rows.'
);
assert.match(
  chatTurnOrchestratorSource,
  /terminalDecisionLedgerView[\s\S]*?from\s+['"]\.\/terminal-decision-ledger-view\.mjs['"][\s\S]*?function\s+ledgerTerminalInteraction[\s\S]*?terminalDecisionLedgerView\(state\s*\|\|\s*\{\}\)/,
  'Chat-turn terminal display helpers must use the shared terminal ledger projection view.'
);
assert.equal(
  /function\s+activePendingInteraction[\s\S]*?\|\|\s*ledgerTerminalInteraction/.test(chatTurnOrchestratorSource),
  false,
  'Chat-turn active pending interaction authority must not fall back to terminal ledger projections.'
);
assert.equal(
  /function\s+activeTerminalInteractionId[\s\S]*?\|\|\s*ledgerTerminalInteraction/.test(chatTurnOrchestratorSource),
  false,
  'Chat-turn active terminal decision ids must come from CORE pending projections, not terminal ledger projections.'
);
assert.match(
  chatTurnOrchestratorSource,
  /function\s+pendingInteractionRows[\s\S]*?return\s+cloneJson\(corePendingInteractionRows\(state\)\)[\s\S]*?function\s+activePendingInteraction[\s\S]*?pendingInteractionRows\(state\)[\s\S]*?function\s+activeTerminalInteractionId[\s\S]*?pendingInteractionRows\(state\)[\s\S]*?async\s+function\s+resolveInteraction[\s\S]*?pendingInteractionRows\(state\)/,
  'Chat-turn pending-interaction reads must use CORE pending projections before resolving interactions.'
);
assert.match(
  chatTurnOrchestratorSource,
  /async\s+function\s+recordCorePendingInteraction[\s\S]*?coreTurnStore\?\.recordPendingInteraction[\s\S]*?async\s+function\s+resolveCorePendingInteraction[\s\S]*?coreTurnStore\?\.resolvePendingInteraction/,
  'Chat-turn pause and resolution paths must write pending interactions through CORE, not runtimeTracking.'
);
assert.equal(
  /recordPendingInteraction\(state|resolvePendingInteraction\(state/.test(chatTurnOrchestratorSource),
  false,
  'Chat-turn production flow must not call old runtimeTracking pending interaction writers.'
);
assert.match(
  chatTurnOrchestratorSource,
  /async\s+function\s+updateIngressState\b[\s\S]*?existing\?\.transactionId[\s\S]*?DIRECTIVE_CORE_INGRESS_UPDATE_REQUIRED/,
  'Chat-turn ingress updates must accept CORE projection rows that expose transactionId without old coreTransactionId aliases.'
);
assert.equal(
  /runtimeTracking\?\.endConditionLedger|runtimeTracking\.endConditionLedger|tracking\.endConditionLedger/.test(
    [
      /function\s+terminalCheckpointCoreTargetForEvent[\s\S]*?\n  \}/.exec(runtimeAppSource)?.[0] || '',
      /function\s+pendingTerminalDecisionId[\s\S]*?\n  \}/.exec(runtimeAppSource)?.[0] || '',
      /function\s+terminalDecisionStillPending[\s\S]*?\n  \}/.exec(runtimeAppSource)?.[0] || '',
      /function\s+ledgerTerminalInteraction[\s\S]*?\n  \}/.exec(chatTurnOrchestratorSource)?.[0] || ''
    ].join('\n')
  ),
  false,
  'Terminal decision read paths must not inspect raw runtimeTracking.endConditionLedger.'
);
assert.match(
  missionPanelSource,
  /terminalDecisionLedgerView[\s\S]*?from\s+['"]\.\.\/runtime\/terminal-decision-ledger-view\.mjs['"]/,
  'Mission panel terminal controls must import the shared terminal decision projection view.'
);
assert.match(
  missionPanelSource,
  /function\s+terminalDecisionRecord[\s\S]*?const\s+ledger\s*=\s*terminalDecisionLedgerView\(view\?\.campaignState\s*\|\|\s*\{\}\)[\s\S]*?function\s+terminalBranchCount[\s\S]*?const\s+ledger\s*=\s*terminalDecisionLedgerView\(view\?\.campaignState\s*\|\|\s*\{\}\)/,
  'Mission panel terminal controls must read filtered terminal projection rows.'
);
assert.equal(
  /function\s+terminal(?:DecisionRecord|BranchCount)[\s\S]*?runtimeTracking\?\.endConditionLedger/.test(missionPanelSource),
  false,
  'Mission panel terminal controls must not render unowned raw terminal ledger rows.'
);
assert.match(
  sceneReconciliationSource,
  /loadCoreCheckpointState/,
  'Scene recalculation must load CORE checkpoint state instead of old inline snapshots.'
);
assert.match(
  sceneReconciliationSource,
  /createRuntimeLedgerView[\s\S]*?from\s+['"]\.\/runtime-ledger-view\.mjs['"]/,
  'Scene Reconciliation source/outcome lookup must import the shared CORE-first runtime ledger view.'
);
assert.match(
  sceneReconciliationSource,
  /function\s+findIngressForMessage[\s\S]*?createRuntimeLedgerView\(state\s*\|\|\s*\{\}\)\.ingressLedger/,
  'Scene Reconciliation message anchors must find ingress rows through CORE-only runtime ledger view.'
);
assert.match(
  sceneReconciliationSource,
  /function\s+outcomeIdsForRange[\s\S]*?const\s+runtimeLedgerView\s*=\s*createRuntimeLedgerView\(state\s*\|\|\s*\{\}\)[\s\S]*?runtimeLedgerView\.ingressLedger[\s\S]*?runtimeLedgerView\.responseLedger/,
  'Scene Reconciliation range outcome lookup must use CORE-only runtime ledger view.'
);
assert.match(
  sceneReconciliationSource,
  /function\s+coreTransactionIdForMessage[\s\S]*?createRuntimeLedgerView\(state\s*\|\|\s*\{\}\)\.ingressLedger/,
  'Scene Reconciliation SRE transaction lookup must use CORE-only runtime ledger view.'
);
const sceneReconciliationCoreTransactionBody = /function\s+coreTransactionIdForMessage[\s\S]*?\n\}/.exec(sceneReconciliationSource)?.[0] || '';
assert.equal(
  /runtimeOverlay:\s*true|findIngressForMessage/.test(sceneReconciliationCoreTransactionBody),
  false,
  'Scene Reconciliation SRE transaction lookup must not use runtimeOverlay fallback or generic ingress lookup.'
);
const sceneReconciliationFindOutcomeBody = /function\s+findOutcomeForAnchor[\s\S]*?\n\}/.exec(sceneReconciliationSource)?.[0] || '';
assert.equal(
  /runtimeOverlay:\s*true/.test(sceneReconciliationFindOutcomeBody),
  false,
  'Scene Reconciliation recalculate outcome lookup must not use runtimeOverlay fallback.'
);
assert.equal(
  /runtimeTracking\?\.(ingressLedger|responseLedger)|runtimeTracking\.(ingressLedger|responseLedger)/.test(sceneReconciliationSource),
  false,
  'Scene Reconciliation must not read raw runtimeTracking ingress/response ledgers for source authority.'
);
const sceneReconciliationStateBody = /export\s+function\s+sceneReconciliationState[\s\S]*?\n\}/.exec(sceneReconciliationSource)?.[0] || '';
assert.match(
  sceneReconciliationStateBody,
  /normalizeSceneReconciliationState\(campaignState\?\.sceneReconciliation\)/,
  'Scene Reconciliation state helper must read only top-level SRE state.'
);
assert.equal(
  /runtimeTracking\?\.sceneReconciliation|runtimeTracking\.sceneReconciliation/.test(sceneReconciliationStateBody),
  false,
  'Scene Reconciliation state helper must not fall back to nested runtimeTracking.sceneReconciliation.'
);
assert.match(
  sceneReconciliationSource,
  /function\s+sceneReconciliationLedgerAuthority[\s\S]*?sreSceneReconciliationProjection[\s\S]*?directive\.sceneReconciliationLedgerProjectionRef\.v1[\s\S]*?async\s+function\s+writeLedger[\s\S]*?path:\s*['"]sceneReconciliation['"][\s\S]*?authority:\s*authority\.authority[\s\S]*?projectionSource:\s*authority\.projectionSource[\s\S]*?compatibilityMirror:\s*authority\.compatibilityMirror/,
  'Scene Reconciliation ledger writes must carry compact SRE owner projection evidence.'
);
assert.equal(
  /path:\s*['"]runtimeTracking\.sceneReconciliation['"]/.test(sceneReconciliationSource),
  false,
  'Scene Reconciliation service must not write authoritative ledger state under runtimeTracking.'
);
assert.match(
  sceneHandshakeSettlerSource,
  /pendingSceneReconciliationCount:\s*asArray\(state\.sceneReconciliation\?\.pending\)\.length/,
  'Scene Handshake safety snapshot must count top-level Scene Reconciliation pending rows only.'
);
assert.equal(
  /runtimeTracking\?\.sceneReconciliation|runtimeTracking\.sceneReconciliation/.test(sceneHandshakeSettlerSource),
  false,
  'Scene Handshake safety snapshot must not count nested runtimeTracking.sceneReconciliation rows.'
);
assert.match(
  campaignSidecarSchedulerSource,
  /function\s+ingressById[\s\S]*?createRuntimeLedgerView\(campaignState\s*\|\|\s*\{\}\)\.ingressLedger/,
  'Campaign sidecar scheduler source snapshots must use CORE-only runtime ledger projections.'
);
assert.match(
  campaignSidecarSchedulerSource,
  /createRuntimeLedgerView[\s\S]*?from\s+['"]\.\.\/runtime\/runtime-ledger-view\.mjs['"]/,
  'Campaign sidecar scheduler source ingress lookup must import the shared CORE-first runtime ledger view.'
);
assert.equal(
  /function\s+sourceIngressSnapshot\(campaignState,\s*ingressId,\s*turnContext\s*=\s*\{\}\)[\s\S]*?const\s+ingress\s*=\s+ingressById\(campaignState,\s*ingressId\)[\s\S]*?turnContext\.sourceFrameId[\s\S]*?turnContext\.coreTransactionId/.test(campaignSidecarSchedulerSource),
  false,
  'Campaign sidecar scheduler must not synthesize source authority from turnContext when CORE/SRE projection is missing.'
);
assert.equal(
  /function\s+ingressById[\s\S]*?runtimeOverlay:\s*true|function\s+ingressById[\s\S]*?runtimeTracking\?\.ingressLedger/.test(campaignSidecarSchedulerSource),
  false,
  'Campaign sidecar scheduler must not validate source identity from runtimeOverlay or raw hot ingress rows.'
);
assert.match(
  forgeCoordinatorSource,
  /async\s+function\s+settleAcceptedBatch\(input\s*=\s*\{\}\)[\s\S]*?const\s+appendDiagnostic\s*=\s*typeof\s+input\.appendDiagnostic[\s\S]*?status:\s*hasEffects\s*\?\s*['"]settled['"]\s*:\s*['"]noChange['"][\s\S]*?\},\s*appendDiagnostic\)/,
  'FORGE accepted-batch success diagnostics must allow caller-owned batching for non-recovery settlement evidence.'
);
assert.match(
  forgeCoordinatorSource,
  /async\s+function\s+settleInternalBackgroundBatch\(input\s*=\s*\{\}\)[\s\S]*?const\s+appendDiagnostic\s*=\s*typeof\s+input\.appendDiagnostic[\s\S]*?status:\s*hasEffects\s*\?\s*['"]internalSettled['"]\s*:\s*['"]internalNoChange['"][\s\S]*?\},\s*appendDiagnostic\)/,
  'FORGE internal background success diagnostics must allow caller-owned batching for non-recovery settlement evidence.'
);
assert.match(
  campaignSidecarSchedulerSource,
  /const\s+canBatchSettlementDiagnostics\s*=\s*typeof\s+appendCoreDiagnostic\s*===\s*['"]function['"]\s*\|\|\s*typeof\s+appendCoreDiagnosticsBatch\s*===\s*['"]function['"][\s\S]*?appendDiagnostic:\s*\(transactionId,\s*diagnostic\)\s*=>\s*queueCoreDiagnosticEvent\(\{[\s\S]*?coreTransactionId:\s*transactionId[\s\S]*?\}\)[\s\S]*?forgeCoordinator\.settleAcceptedBatch\(settlementInput\)/,
  'Campaign sidecar scheduler must route FORGE accepted-batch success diagnostics into the active scheduler diagnostics batch only when a diagnostics writer exists.'
);
assert.match(
  runtimeAppSource,
  /function\s+queueForgeInternalCoreDiagnostic[\s\S]*?type:\s*['"]forge['"][\s\S]*?source:\s*['"]forgeCoordinator['"][\s\S]*?queueRuntimeCoreDiagnosticEntry/,
  'Runtime-app must queue internal FORGE success diagnostics as FORGE-owned entries in lane-owned diagnostic batches.'
);
assert.match(
  runtimeAppSource,
  /settleInternalForgeBackgroundBatch\(prepared,[\s\S]*?internalOwner:\s*['"]commandLogSummary['"][\s\S]*?appendDiagnostic:\s*\(transactionId,\s*diagnostic\)\s*=>\s*queueForgeInternalCoreDiagnostic\([\s\S]*?commandLogSummaryDiagnosticBatch/,
  'Runtime-app command-log internal FORGE settlement diagnostics must use the command-log diagnostics batch.'
);
assert.match(
  runtimeAppSource,
  /settleInternalForgeBackgroundBatch\(prepared,[\s\S]*?internalOwner:\s*['"]narrativeThreadDirector['"][\s\S]*?appendDiagnostic:\s*\(transactionId,\s*diagnostic\)\s*=>\s*queueForgeInternalCoreDiagnostic\([\s\S]*?postCommitConversationDiagnosticBatch/,
  'Runtime-app Narrative Thread internal FORGE settlement diagnostics must use the post-commit diagnostics batch.'
);
assert.match(
  runtimeAppSource,
  /settleInternalForgeBackgroundBatch\(prepared,[\s\S]*?internalOwner:\s*['"]missionDirectorAdvisor['"][\s\S]*?appendDiagnostic:\s*\(transactionId,\s*diagnostic\)\s*=>\s*queueForgeInternalCoreDiagnostic\([\s\S]*?advisoryEnrichmentDiagnosticBatch/,
  'Runtime-app advisory internal FORGE settlement diagnostics must use the advisory diagnostics batch.'
);
assert.match(
  runtimeAppSource,
  /settleInternalForgeBackgroundBatch\(prepared,[\s\S]*?internalOwner:\s*['"]terminalOutcomeCheckpoint['"][\s\S]*?appendDiagnostic:\s*\(transactionId,\s*diagnostic\)\s*=>\s*queueForgeInternalCoreDiagnostic\([\s\S]*?terminalCheckpointDiagnosticBatch/,
  'Runtime-app terminal checkpoint internal FORGE settlement diagnostics must use the terminal checkpoint diagnostics batch.'
);
assert.equal(
  /replayDirector\s*\(\s*\{\s*snapshotBefore:\s*cloneJson\(ledgerEntry\.snapshotBefore\)/.test(sceneReconciliationSource),
  false,
  'Scene recalculation must not replay directly from turnLedger.snapshotBefore.'
);
assert.match(
  runtimeAppSource,
  /function\s+assertOutcomeReplacementCheckpointBase/,
  'Runtime-app outcome replacement commit must guard the cached rerun base against missing CORE checkpoint evidence.'
);
assert.equal(
  /const\s+baseCampaignState\s*=\s*replacement\?\.snapshotBefore\s*\|\|\s*campaignState/.test(runtimeAppSource),
  false,
  'Runtime-app replacement commit must not silently fall back from missing replacement snapshot to current campaign state.'
);
assert.equal(
  /function\s+restoreCommittedOutcomeState[\s\S]*?checkpointTracking\.history/.test(runtimeAppSource),
  false,
  'Runtime-app committed-outcome restore must not import old checkpoint runtimeTracking.history snapshots.'
);
assert.match(
  runtimeAppSource,
  /async\s+deleteCommittedOutcome\(\{ outcomeId \} = \{\}\)[\s\S]*?runtimeCoreTurnStore\?\.readProjections[\s\S]*?mergeCoreTurnLedgerProjection\(campaignState\.turnLedger,\s*projections\.turnLedger\)[\s\S]*?const\s+ledgerEntry\s*=\s*\(campaignState\.turnLedger\?\.entries\s*\|\|\s*\[\]\)\.find/,
  'Runtime-app committed-outcome delete must hydrate CORE turn-ledger projections before validating checkpoint refs.'
);
assert.match(
  runtimeAppSource,
  /const\s+restoreRevision\s*=\s*Number\([\s\S]*?restoreSnapshot\?\.runtimeTracking\?\.revision[\s\S]*?checkpointSnapshot\?\.sourceRevision[\s\S]*?ledgerCoreCheckpointRef\?\.sourceRevision/,
  'Runtime-app committed-outcome delete must accept compact CORE checkpoint sourceRevision when restored snapshot omits runtimeTracking.'
);
assert.equal(
  /authorizeDeleteRollback\.call\(repair,[\s\S]*?ledgerEntry:\s*\{[\s\S]*?snapshotBefore:\s*\{[\s\S]*?runtimeTracking/.test(runtimeAppSource),
  false,
  'Runtime-app committed-outcome delete must not pass a synthetic old snapshotBefore.runtimeTracking revision to REPAIR authorization.'
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
const proposeCorrectAsSwipeCandidateBody = /async\s+function\s+proposeCorrectAsSwipeCandidate\(payload\s*=\s*\{\}\)[\s\S]*?\n\s*\}\n\s*\n\s*async\s+function\s+settleCorrectAsSwipeCase/.exec(runtimeAppSource)?.[0] || '';
assert.match(
  proposeCorrectAsSwipeCandidateBody,
  /const\s+evidenceVerdict\s*=\s*await\s+sourceReview\.reviewCorrectAsSwipeEvidence\(/,
  'Runtime-app Correct-as-Swipe proposal must always ask SRE/Source Review for the selected-text verdict.'
);
assert.equal(
  /payload\.(?:evidenceVerdict|verdict)|suppliedEvidenceVerdict/.test(proposeCorrectAsSwipeCandidateBody),
  false,
  'Runtime-app Correct-as-Swipe proposal must not accept caller-supplied evidence verdict authority.'
);
assert.match(
  runtimeAppSource,
  /const\s+proposedText\s*=\s*payload\.proposedText\s*\?\?\s*payload\.candidateText\s*\?\?\s*payload\.rewriteText\s*\?\?\s*payload\.text/,
  'Runtime-app Correct-as-Swipe action must treat generic payload.text as candidate text, not selected evidence text.'
);
assert.match(
  runtimeAppSource,
  /async\s+function\s+outcomeIntegrityNativeEditDecision\(payload\s*=\s*\{\}\)[\s\S]*?outcomeIntegrityStatusForMessageAsync\(\{[\s\S]*?coreTurnStore:\s*runtimeCoreTurnStore/,
  'Runtime-app native edit protection must use async CORE/v2 Outcome Integrity reads against the live CORE store.'
);
assert.equal(
  /outcomeIntegrityNativeEditDecision\(payload[\s\S]*?outcomeIntegrityStatusForMessage\(\{/.test(runtimeAppSource),
  false,
  'Runtime-app native edit protection must not use the sync Outcome Integrity status path with the live async CORE store.'
);
assert.match(
  runtimeAppSource,
  /proposeCorrectAsSwipeCandidate[\s\S]*?const\s+recordedResponse\s*=\s*await\s+findOutcomeIntegrityResponseAsync\(state,\s*hostMessageId,\s*\{\s*coreTurnStore:\s*runtimeCoreTurnStore\s*\}\)[\s\S]*?updateResponse:\s*\(latest,\s*responseUpdateId,\s*correctionCase\)\s*=>\s*\{[\s\S]*?const\s+currentResponse\s*=\s*prevalidatedCoreResponseForUpdate\(recordedResponse,\s*responseUpdateId\)\s*\|\|\s*response[\s\S]*?const\s+hasCompatibilityResponseRow\s*=\s*Boolean\(prevalidatedCoreResponseForUpdate\(recordedResponse,\s*responseUpdateId\)\)/,
  'Runtime-app Correct-as-Swipe candidate append must decide record/update from prevalidated async CORE response evidence.'
);
assert.equal(
  /proposeCorrectAsSwipeCandidate[\s\S]*?recordedResponse\s*\|\|\s*payload\.response/.test(runtimeAppSource),
  false,
  'Runtime-app Correct-as-Swipe proposal must not use caller payload response as authority before appending a host swipe.'
);
assert.equal(
  /proposeCorrectAsSwipeCandidate[\s\S]*?createRuntimeLedgerView\(tracked,\s*\{\s*coreTurnStore:\s*runtimeCoreTurnStore\s*\}\)/.test(runtimeAppSource),
  false,
  'Runtime-app Correct-as-Swipe candidate append must not use sync CORE ledger views against the live async CORE store.'
);
assert.equal(
  /proposeCorrectAsSwipeCandidate[\s\S]*?findOutcomeIntegrityResponse\(tracked,\s*responseUpdateId,\s*\{\s*coreTurnStore:\s*runtimeCoreTurnStore\s*\}\)/.test(runtimeAppSource),
  false,
  'Runtime-app Correct-as-Swipe candidate append must not use sync Outcome Integrity response reads against the live async CORE store.'
);
assert.match(
  runtimeAppSource,
  /proposeCorrectAsSwipeCandidate[\s\S]*?const\s+stableResponseId\s*=\s*compactString\(currentResponse\.id\s*\|\|\s*currentResponse\.responseId[\s\S]*?if\s*\(!hasCompatibilityResponseRow\)[\s\S]*?DIRECTIVE_CORRECT_AS_SWIPE_RESPONSE_PROJECTION_REQUIRED[\s\S]*?action:\s*['"]candidateAppended['"][\s\S]*?stableResponseId\s*\?\s*updateDirectiveResponse\(tracked,\s*stableResponseId,[\s\S]*?\},\s*\{\s*missingCoreWriteMode:\s*['"]reject['"]\s*\}\)\s*:\s*tracked/,
  'Runtime-app Correct-as-Swipe candidate append must fail closed instead of recreating responseLedger authority when no CORE response projection exists.'
);
assert.equal(
  /proposeCorrectAsSwipeCandidate[\s\S]*?recordDirectiveResponse\(tracked,[\s\S]*?candidateAppended/.test(runtimeAppSource),
  false,
  'Runtime-app Correct-as-Swipe candidate append must not backfill response rows from app payloads.'
);
assert.equal(
  /const\s+hotResponse\s*=\s*\(tracked\.runtimeTracking\?\.responseLedger/.test(runtimeAppSource),
  false,
  'Runtime-app Correct-as-Swipe candidate append must not consult raw runtimeTracking.responseLedger.'
);
assert.match(
  runtimeAppSource,
  /settleCorrectAsSwipeCase\(payload[\s\S]*?const\s+recordedResponse\s*=\s*await\s+findOutcomeIntegrityResponseAsync\(state,\s*hostMessageId,\s*\{\s*coreTurnStore:\s*runtimeCoreTurnStore\s*\}\)[\s\S]*?updateResponse:\s*\(latest,\s*responseUpdateId,\s*correctionCase\)\s*=>\s*\{[\s\S]*?const\s+currentResponse\s*=\s*prevalidatedCoreResponseForUpdate\(recordedResponse,\s*responseUpdateId\)\s*\|\|\s*response[\s\S]*?const\s+hasCompatibilityResponseRow\s*=\s*Boolean\(prevalidatedCoreResponseForUpdate\(recordedResponse,\s*responseUpdateId\)\)[\s\S]*?action:\s*['"]caseLifecycleUpdated['"]/,
  'Runtime-app Correct-as-Swipe lifecycle must decide record/update from prevalidated async CORE response evidence.'
);
assert.equal(
  /settleCorrectAsSwipeCase\(payload[\s\S]*?recordedResponse\s*\|\|\s*payload\.response/.test(runtimeAppSource),
  false,
  'Runtime-app Correct-as-Swipe lifecycle must not use caller payload response as authority.'
);
assert.equal(
  /settleCorrectAsSwipeCase\(payload[\s\S]*?createRuntimeLedgerView\(tracked,\s*\{\s*coreTurnStore:\s*runtimeCoreTurnStore\s*\}\)/.test(runtimeAppSource),
  false,
  'Runtime-app Correct-as-Swipe lifecycle must not use sync CORE ledger views against the live async CORE store.'
);
assert.equal(
  /settleCorrectAsSwipeCase\(payload[\s\S]*?findOutcomeIntegrityResponse\(tracked,\s*responseUpdateId,\s*\{\s*coreTurnStore:\s*runtimeCoreTurnStore\s*\}\)/.test(runtimeAppSource),
  false,
  'Runtime-app Correct-as-Swipe lifecycle must not use sync Outcome Integrity response reads against the live async CORE store.'
);
assert.match(
  runtimeAppSource,
  /settleCorrectAsSwipeCase\(payload[\s\S]*?const\s+stableResponseId\s*=\s*compactString\(currentResponse\.id\s*\|\|\s*currentResponse\.responseId[\s\S]*?if\s*\(!hasCompatibilityResponseRow\)[\s\S]*?DIRECTIVE_CORRECT_AS_SWIPE_RESPONSE_PROJECTION_REQUIRED[\s\S]*?action:\s*['"]caseLifecycleUpdated['"][\s\S]*?stableResponseId\s*\?\s*updateDirectiveResponse\(tracked,\s*stableResponseId,[\s\S]*?\},\s*\{\s*missingCoreWriteMode:\s*['"]reject['"]\s*\}\)\s*:\s*tracked/,
  'Runtime-app Correct-as-Swipe lifecycle must fail closed instead of recreating responseLedger authority when no CORE response projection exists.'
);
assert.equal(
  /settleCorrectAsSwipeCase\(payload[\s\S]*?recordDirectiveResponse\(tracked,[\s\S]*?caseLifecycleUpdated/.test(runtimeAppSource),
  false,
  'Runtime-app Correct-as-Swipe lifecycle must not backfill response rows from app payloads.'
);
assert.match(
  runtimeAppSource,
  /submitOutcomeIntegrityEdit[\s\S]*?responseCompatibilityProjectionPatch\(response,[\s\S]*?directive\.coreResponseOutcomeIntegrityProjectionRef\.v1[\s\S]*?const\s+projectionPatch[\s\S]*?updateDirectiveResponse\(latest,\s*responseUpdateId,[\s\S]*?missingCoreWriteMode:\s*['"]reject['"][\s\S]*?runtimeCoreTurnStore\.repairVisibleResponseRef\(projectionPatch\.coreProjection\.transactionId,[\s\S]*?outcomeIntegrity:\s*nextOutcomeIntegrity[\s\S]*?outcome-integrity-edit-accepted/,
  'Runtime-app Outcome Integrity accepted edits must reject missing-CORE old response writes and persist compact CORE response evidence.'
);
assert.match(
  runtimeAppSource,
  /function\s+responseCompatibilityProjectionPatch[\s\S]*?const\s+transactionId\s*=\s*compactString\([\s\S]*?response\.coreTransactionId[\s\S]*?response\.transactionId[\s\S]*?response\.coreProjection\?\.transactionId[\s\S]*?response\.compatibilityMirror\?\.transactionId[\s\S]*?if\s*\(!transactionId\)[\s\S]*?DIRECTIVE_CORE_RESPONSE_PROJECTION_TRANSACTION_REQUIRED[\s\S]*?transactionId,/,
  'Runtime-app response lifecycle CORE projection refs must fail closed unless they carry transaction evidence.'
);
assert.match(
  runtimeAppSource,
  /function\s+modelCallDiagnosticsForState[\s\S]*?readRuntimeCoreProjections\(state\s*\|\|\s*\{\}\)[\s\S]*?projections\.modelCallDiagnostics[\s\S]*?return\s+cloneJson\(projected\)/,
  'Runtime-app chat-native model-call view must read CORE diagnostics only.'
);
assert.match(
  runtimeAppSource,
  /function\s+coreModelCallDiagnosticsForState[\s\S]*?return\s+Array\.isArray\(projections\.modelCallDiagnostics\)\s*\?\s*cloneJson\(projections\.modelCallDiagnostics\)\s*:\s*\[\]/,
  'Runtime-app must expose a CORE-only model-call diagnostics helper for proof-facing views.'
);
assert.match(
  runtimeAppSource,
  /function\s+legacyModelCallTelemetryForState[\s\S]*?return\s+\[\]/,
  'Runtime-app must not expose old runtimeTracking.modelCallJournal telemetry through proof views.'
);
assert.match(
  runtimeAppSource,
  /function\s+chatNativeViewForState[\s\S]*?const\s+modelCallDiagnostics\s*=\s*coreModelCallDiagnosticsForState\(state\)[\s\S]*?const\s+legacyModelCallTelemetry\s*=\s*legacyModelCallTelemetryForState\(state\)[\s\S]*?modelCallCount:\s*modelCallDiagnostics\.length[\s\S]*?legacyModelCallCount:\s*legacyModelCallTelemetry\.length[\s\S]*?modelCalls:\s*cloneJson\(modelCallDiagnostics\)[\s\S]*?legacyModelCallTelemetry:\s*cloneJson\(legacyModelCallTelemetry\)/,
  'Runtime-app chat-native proof-facing modelCalls/count must be CORE-only while legacy telemetry remains empty.'
);
assert.match(
  runtimeAppSource,
  /runFactualGroundingReview[\s\S]*?const\s+modelCallCountBefore\s*=\s*coreModelCallDiagnosticsForState\(campaignState\)\.length[\s\S]*?const\s+modelCalls\s*=\s*coreModelCallDiagnosticsForState\(campaignState\)[\s\S]*?modelCallResultFromGeneration\(generated,\s*FACTUAL_GROUNDING_REVIEW_ROLE_ID\)[\s\S]*?modelCallDelta:\s*Math\.max\(0,\s*modelCalls\.length\s*-\s*modelCallCountBefore\)/,
  'Runtime-app factual review-only path must count only CORE model-call diagnostics while exposing compact non-durable generation proof.'
);
assert.match(
  runtimeAppSource,
  /runStoryQualityReview[\s\S]*?const\s+modelCallCountBefore\s*=\s*coreModelCallDiagnosticsForState\(campaignState\)\.length[\s\S]*?const\s+modelCalls\s*=\s*coreModelCallDiagnosticsForState\(campaignState\)[\s\S]*?modelCallResultFromGeneration\(generated,\s*STORY_QUALITY_REVIEW_ROLE_ID\)[\s\S]*?modelCallDelta:\s*Math\.max\(0,\s*modelCalls\.length\s*-\s*modelCallCountBefore\)/,
  'Runtime-app story-quality review-only path must count only CORE model-call diagnostics while exposing compact non-durable generation proof.'
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
const repairRuntimeSource = readFileSync(
  new URL('../../src/runtime/repair-runtime.mjs', import.meta.url),
  'utf8'
);
assert.equal(
  /buildCommittedOutcomeDeleteRollbackActuationDecision[\s\S]*?ledgerEntry\?\.snapshotBefore\?\.runtimeTracking/.test(repairRuntimeSource),
  false,
  'REPAIR committed-outcome delete rollback must not fall back to old ledger snapshotBefore.runtimeTracking revision authority.'
);
assert.match(
  repairRuntimeSource,
  /function\s+buildRollbackActuationDecision[\s\S]*?coreCheckpointRefFromEvidence[\s\S]*?hasCoreCheckpointAuthority[\s\S]*?repair-rollback-core-checkpoint-ref-missing/,
  'REPAIR rollback authorization must require compact CORE checkpoint ref authority, not restoreRevision alone.'
);
assert.match(
  repairRuntimeSource,
  /function\s+buildCommittedOutcomeDeleteRollbackActuationDecision[\s\S]*?coreCheckpointRefFromEvidence[\s\S]*?ledgerEntry\?\.coreCheckpointRef[\s\S]*?buildRollbackActuationDecision/,
  'Committed-outcome delete rollback must pass compact CORE checkpoint refs into REPAIR rollback authorization.'
);
assert.match(
  repairRuntimeSource,
  /function\s+recoveryStatusForSourceMutation[\s\S]*?hasCoreCheckpointAuthority\(sourceMutation\?\.coreCheckpointRef/,
  'REPAIR source-mutation recovery must not mark rollbackPending from preOutcomeRevision without CORE checkpoint authority.'
);
assert.equal(
  /runtimeTracking\??\.sceneHandshake|runtimeTracking\.sceneHandshake/.test(
    `${messageReconcilerSource}\n${repairRuntimeSource}\n${sceneHandshakeSettlerSource}`
  ),
  false,
  'Scene Handshake recovery, repair, and idempotency helpers must not fall back to nested runtimeTracking.sceneHandshake.'
);
assert.equal(
  /legacyProjection|repairLegacyProjection|directive\.repairLegacyProjection/.test(
    `${messageReconcilerSource}\n${repairRuntimeSource}`
  ),
  false,
  'REPAIR source-mutation and response-recovery policy must expose repairProjection, not stale legacyProjection authority.'
);
assert.match(
  responseDispatcherSource,
  /createRuntimeLedgerViewAsync[\s\S]*?findLedgerIngressAsync[\s\S]*?findLedgerRecoveryAsync[\s\S]*?findLedgerResponseAsync[\s\S]*?from\s+['"]\.\/runtime-ledger-view\.mjs['"]/,
  'ResponseDispatcher must use the shared async CORE-first runtime ledger view for ingress/response/recovery lookup.'
);
assert.match(
  responseDispatcherSource,
  /readRuntimeCoreProjections[\s\S]*?from\s+['"]\.\/runtime-ledger-view\.mjs['"][\s\S]*?function\s+coreRuntimeRevision[\s\S]*?runtimeAuthority\s*!==\s*['"]coreStoreV2['"][\s\S]*?revisions\?\.runtime[\s\S]*?lastViolationRevision:\s*currentRevision/,
  'ResponseDispatcher host-native continuity compatibility projections must stamp fact-use revisions from CORE/v2 read projections before old runtimeTracking counters.'
);
assert.match(
  repairRuntimeSource,
  /readRuntimeCoreProjections[\s\S]*?from\s+['"]\.\/runtime-ledger-view\.mjs['"][\s\S]*?function\s+coreRuntimeRevision[\s\S]*?runtimeAuthority\s*!==\s*['"]coreStoreV2['"][\s\S]*?revisions\?\.runtime[\s\S]*?lastViolationRevision:\s*currentRevision/,
  'REPAIR host-native continuity projections must stamp fact-use revisions from CORE/v2 read projections before old runtimeTracking counters.'
);
assert.match(
  chatTurnOrchestratorSource,
  /createRuntimeLedgerView[\s\S]*?createRuntimeLedgerViewAsync[\s\S]*?from\s+['"]\.\/runtime-ledger-view\.mjs['"]/,
  'ChatTurnOrchestrator response retry lookup must use the shared async CORE-first runtime ledger view.'
);
assert.match(
  chatTurnOrchestratorSource,
  /function\s+responseEntryForMessage[\s\S]*?const\s+responseRows\s*=\s*createRuntimeLedgerView\(state\s*\|\|\s*\{\}\)\.responseLedger\s*\|\|\s*\[\]/,
  'ChatTurnOrchestrator assistant-swipe response lookup must use CORE-only response projections.'
);
assert.match(
  responseDispatcherSource,
  /async\s+function\s+findExisting\(campaignState,\s*idempotencyKey,\s*options\s*=\s*\{\}\)[\s\S]*?createRuntimeLedgerViewAsync\(campaignState,\s*\{\s*coreTurnStore\s*\}\)[\s\S]*?responseLedger/,
  'ResponseDispatcher existing-response duplicate lookup must use CORE-only response projections.'
);
assert.match(
  responseDispatcherSource,
  /async\s+function\s+findIngress\(campaignState,\s*ingressId\)[\s\S]*?findLedgerIngressAsync\(campaignState,\s*\{\s*id:\s*ingressId\s*\},\s*\{\s*coreTurnStore\s*\}\)/,
  'ResponseDispatcher ingress authority lookup must use CORE-only projections.'
);
assert.match(
  responseDispatcherSource,
  /async\s+function\s+findResponse\(campaignState,\s*responseId\)[\s\S]*?findLedgerResponseAsync\(campaignState,\s*\{\s*id:\s*responseId\s*\},\s*\{\s*coreTurnStore\s*\}\)/,
  'ResponseDispatcher response authority lookup must use CORE-only projections.'
);
assert.match(
  chatTurnOrchestratorSource,
  /async\s+function\s+runtimeLedgerViewFresh\(state,\s*options\s*=\s*\{\}\)[\s\S]*?createRuntimeLedgerViewAsync\(state\s*\|\|\s*\{\},\s*\{\s*coreTurnStore,\s*\.\.\.options\s*\}\)[\s\S]*?async\s+function\s+findIngressFresh\(state,\s*ingressId,\s*options\s*=\s*\{\}\)[\s\S]*?await\s+runtimeLedgerViewFresh\(state,\s*options\)[\s\S]*?\.ingressLedger/,
  'ChatTurnOrchestrator fresh ingress lookup must await async CORE-first runtime ledger view.'
);
assert.equal(
  /function\s+findIngress\(state,\s*ingressId\)[\s\S]*?createRuntimeLedgerView\(state\s*\|\|\s*\{\},\s*\{\s*coreTurnStore\s*\}\)/.test(chatTurnOrchestratorSource),
  false,
  'ChatTurnOrchestrator sync ingress lookup must not pass coreTurnStore because live CORE projections are async.'
);
assert.match(
  chatTurnOrchestratorSource,
  /async\s+function\s+findIngressAlias[\s\S]*?await\s+runtimeLedgerViewFresh\(\{\s*\.\.\.state,\s*runtimeTracking:\s*tracking\s*\}\)[\s\S]*?\.ingressLedger/,
  'ChatTurnOrchestrator ingress alias lookup must use CORE-only runtime ledger view.'
);
assert.match(
  chatTurnOrchestratorSource,
  /async\s+function\s+findIngressByHostMessageId[\s\S]*?await\s+runtimeLedgerViewFresh\(\{\s*\.\.\.state,\s*runtimeTracking:\s*tracking\s*\}\)[\s\S]*?\.ingressLedger/,
  'ChatTurnOrchestrator host-message duplicate lookup must use CORE-only runtime ledger view.'
);
assert.match(
  chatTurnOrchestratorSource,
  /async\s+function\s+staleIngressResult\(state,\s*ingressId,\s*message,\s*stage\)[\s\S]*?findIngressFresh\(initializeCampaignRuntimeTracking\(state\),\s*ingressId\)/,
  'ChatTurnOrchestrator stale-source review must not classify from runtimeOverlay fallback ingress rows.'
);
assert.match(
  chatTurnOrchestratorSource,
  /async\s+function\s+pendingSourceStaleResult\(state,\s*pending\s*=\s*null,[\s\S]*?findIngressFresh\(state,\s*pending\.ingressId\)/,
  'ChatTurnOrchestrator pending-source stale review must not hydrate source text from runtimeOverlay fallback rows.'
);
assert.match(
  chatTurnOrchestratorSource,
  /async\s+function\s+stateWithIngressFromFallback[\s\S]*?await\s+findIngressFresh\(next,\s*ingressId\)[\s\S]*?await\s+findIngressFresh\(fallback,\s*ingressId\)[\s\S]*?fallbackHasCoreEvidence[\s\S]*?authority\s*===\s*['"]compatibilityProjection['"][\s\S]*?projectionSource\s*===\s*['"]coreStoreV2['"][\s\S]*?if\s*\(\s*!fallbackHasCoreEvidence\)\s*return\s+next[\s\S]*?recordTurnIngress\(next,\s*fallbackIngress,\s*\{[\s\S]*?missingCoreWriteMode:\s*['"]reject['"]/,
  'ChatTurnOrchestrator fallback ingress recreation must use CORE-only fallback lookup, require CORE projection evidence, and reject missing-CORE old-ledger writes.'
);
assert.match(
  chatTurnOrchestratorSource,
  /async\s+function\s+stateForIngressCheck\(ingressId,\s*fallbackState\s*=\s*null\)[\s\S]*?findIngressFresh\(initializeCampaignRuntimeTracking\(current\),\s*ingressId\)[\s\S]*?findIngressFresh\(initializeCampaignRuntimeTracking\(fallbackState\),\s*ingressId\)/,
  'ChatTurnOrchestrator stateForIngressCheck must not select states by runtimeOverlay fallback rows.'
);
assert.match(
  chatTurnOrchestratorSource,
  /async\s+function\s+pendingInteractionAuthorityForIngress\(state,\s*ingressId,\s*interactionId\)[\s\S]*?const\s+authorityState\s*=\s*await\s+stateWithIngressFromFallback\(state,\s*state,\s*ingressId\)[\s\S]*?runtimeLedgerViewFresh\(authorityState\)[\s\S]*?await\s+findIngressFresh\(authorityState,\s*ingressId\)[\s\S]*?ingress\.coreTransactionId[\s\S]*?ingress\.transactionId[\s\S]*?authority:\s*['"]corePendingInteractionProjection['"]/,
  'ChatTurnOrchestrator pending-interaction authority must use CORE-only ingress, accept transactionId aliases, then hydrated fallback before writing pause/review compatibility rows.'
);
assert.match(
  chatTurnOrchestratorSource,
  /async\s+function\s+updateIngressState[\s\S]*?existingHasCoreMirror[\s\S]*?existing\?\.authority\s*===\s*['"]compatibilityProjection['"][\s\S]*?existing\?\.projectionSource\s*===\s*['"]coreStoreV2['"][\s\S]*?existing\?\.authority\s*===\s*['"]coreIngressProjection['"][\s\S]*?!existingHasCoreMirror[\s\S]*?DIRECTIVE_CORE_INGRESS_UPDATE_REQUIRED[\s\S]*?updateTurnIngress\(base,\s*ingressId,\s*patch,\s*\{[\s\S]*?missingCoreWriteMode:\s*['"]reject['"]/,
  'ChatTurnOrchestrator ingress updates must require CORE evidence or qualified CORE mirror evidence, and reject missing-CORE old-ledger writes.'
);
assertEverySourceCallHas(
  chatTurnOrchestratorSource,
  /\bupdateTurnIngress\s*\(/g,
  /missingCoreWriteMode:\s*['"]reject['"]/,
  'ChatTurnOrchestrator ingress compatibility updates must fail closed when CORE projection evidence is missing.'
);
assert.match(
  chatTurnOrchestratorSource,
  /async\s+function\s+ingressHasDependentResponse[\s\S]*?await\s+runtimeLedgerViewFresh\(state\s*\|\|\s*\{\}\)[\s\S]*?\.responseLedger/,
  'ChatTurnOrchestrator dependent-response lookup must await async CORE-first runtime ledger view.'
);
assert.match(
  chatTurnOrchestratorSource,
  /const\s+providerFallbackResponseTargets\s*=\s*responseRows\.filter[\s\S]*?authority\)\s*===\s*['"]compatibilityProjection['"][\s\S]*?projectionSource\)\s*===\s*['"]coreStoreV2['"][\s\S]*?providerFallback[\s\S]*?responseRetryRequired[\s\S]*?coreClosureFailed/,
  'ChatTurnOrchestrator provider-fallback retry targets must come from CORE response projections.'
);
assert.match(
  chatTurnOrchestratorSource,
  /function\s+responseEntryForMessage[\s\S]*?createRuntimeLedgerView\(state\s*\|\|\s*\{\}\)\.responseLedger/,
  'ChatTurnOrchestrator response swipe/retry lookup must use CORE-only response projections.'
);
assert.match(
  chatTurnOrchestratorSource,
  /async\s+function\s+markCoreResponseRetryRequired\(state,[\s\S]*?findIngressFresh\(initializeCampaignRuntimeTracking\(state\),\s*ingressId\)/,
  'ChatTurnOrchestrator response retry recovery must use CORE-only ingress authority.'
);
assert.match(
  chatTurnOrchestratorSource,
  /async\s+function\s+markCoreResponseRetryRequiredForBridge\(state,\s*payload\s*=\s*\{\}\)[\s\S]*?findIngressFresh\(tracked,\s*payload\.ingressId\)/,
  'ChatTurnOrchestrator bridge response retry recovery must use CORE-only ingress authority.'
);
assert.match(
  chatTurnOrchestratorSource,
  /const\s+runtimeLedgerView\s*=\s*await\s+runtimeLedgerViewFresh\(state\s*\|\|\s*\{\}\)[\s\S]*?const\s+responseRows\s*=\s*runtimeLedgerView\.responseLedger/,
  'ChatTurnOrchestrator provider-failure response retry must use CORE-only response rows.'
);
const responseRetryRecoveryFromCoreProjectionBody = /async\s+function\s+responseRetryRecoveryFromCoreProjection[\s\S]*?\n  \}/.exec(chatTurnOrchestratorSource)?.[0] || '';
assert.equal(
  /runtimeTracking\?\.responseLedger|runtimeOverlay:\s*true/.test(responseRetryRecoveryFromCoreProjectionBody),
  false,
  'ChatTurnOrchestrator response-retry recovery lookup must not use raw responseLedger or runtime overlay fallback.'
);
assert.equal(
  /runtimeTracking\?\.ingressLedger|runtimeTracking\.ingressLedger/.test(chatTurnOrchestratorSource),
  false,
  'ChatTurnOrchestrator must not read raw runtimeTracking.ingressLedger in hot turn/retry paths.'
);
assert.match(
  chatTurnOrchestratorSource,
  /directive\.coreIngressRecoveryProjectionRef\.v1/,
  'ChatTurnOrchestrator turn-processing failure mirrors must carry CORE ingress recovery projection refs.'
);
assert.match(
  chatTurnOrchestratorSource,
  /directive\.coreIngressSourceRestartProjectionRef\.v1/,
  'ChatTurnOrchestrator source-restart mirrors must carry CORE ingress source-restart projection refs.'
);
assert.match(
  chatTurnOrchestratorSource,
  /updateTurnIngress\(next,\s*recoverySourceIngress\.id[\s\S]*?authority:\s*['"]compatibilityProjection['"][\s\S]*?coreProjection:\s*ingressSourceRestartCompatibilityProjection/,
  'ChatTurnOrchestrator restartSuperseded ingress mirrors must be CORE compatibility projections.'
);
assert.match(
  chatTurnOrchestratorSource,
  /updateTurnIngress\(next,\s*ingressId[\s\S]*?authority:\s*['"]compatibilityProjection['"][\s\S]*?coreProjection:\s*ingressRecoveryCompatibilityProjection/,
  'ChatTurnOrchestrator chatTurnProcessingFailure ingress mirrors must be CORE compatibility projections.'
);
assert.match(
  messageReconcilerSource,
  /findLedgerIngressAsync[\s\S]*?findLedgerResponseAsync[\s\S]*?from\s+['"]\.\/runtime-ledger-view\.mjs['"]/,
  'MessageReconciler source mutation lookup must use the shared async CORE-first runtime ledger view.'
);
assert.match(
  messageReconcilerSource,
  /const\s+sourceLookupOptions\s*=\s*\{\s*coreTurnStore\s*\}[\s\S]*?findLedgerResponseAsync\(state,\s*\{\s*id:\s*responseId\s*\},\s*sourceLookupOptions\)[\s\S]*?findLedgerIngressAsync\(state,\s*\{\s*id:\s*ingressId\s*\},\s*sourceLookupOptions\)[\s\S]*?findLedgerIngressAsync\(state,\s*\{\s*hostMessageId\s*\},\s*sourceLookupOptions\)[\s\S]*?findLedgerResponseAsync\(state,\s*\{\s*hostMessageId\s*\},\s*sourceLookupOptions\)/,
  'MessageReconciler source mutation lookup must be CORE-only and must not use runtimeOverlay fallback.'
);
assert.match(
  messageReconcilerSource,
  /async\s+function\s+reconcileVisibilityChanged[\s\S]*?const\s+sourceLookupOptions\s*=\s*\{\s*coreTurnStore\s*\}[\s\S]*?findLedgerIngressAsync\(state,\s*\{\s*hostMessageId\s*\},\s*sourceLookupOptions\)[\s\S]*?findLedgerResponseAsync\(state,\s*\{\s*hostMessageId\s*\},\s*sourceLookupOptions\)/,
  'MessageReconciler visibility source lookup must be CORE-only and must not use runtimeOverlay fallback.'
);
assert.equal(
  /function\s+preOutcomeRevision[\s\S]*?runtimeTracking\?\.history|function\s+preOutcomeRevision[\s\S]*?runtimeTracking\.history/.test(messageReconcilerSource),
  false,
  'MessageReconciler rollback revision lookup must not use old runtimeTracking.history snapshots as rollback authority.'
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
assertEverySourceCallHas(
  messageReconcilerSource,
  /\bupdateTurnIngress\s*\(/g,
  /missingCoreWriteMode:\s*['"]reject['"]/,
  'MessageReconciler ingress compatibility updates must fail closed when CORE projection evidence is missing.'
);
assert.match(
  messageReconcilerSource,
  /loadCoreCheckpointState[\s\S]*?coreCheckpointRestoreState[\s\S]*?executeRepairRollbackActuation/,
  'Message recovery rollback must load CORE checkpoint state and pass it to REPAIR rollback execution.'
);
assert.equal(
  /function\s+sourceMutationCoreCheckpointRef[\s\S]*?runtimeTracking\?\.history|function\s+sourceMutationCoreCheckpointRef[\s\S]*?runtimeTracking\.history/.test(messageReconcilerSource),
  false,
  'Message recovery rollback must not use old runtimeTracking.history snapshots as CORE checkpoint-ref authority.'
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
assert.match(
  stateDeltaGatewaySource,
  /function\s+replacementTextProjectionFields/,
  'State delta gateway must centrally sanitize raw replacement text for old ledger mirrors.'
);
assert.match(
  stateDeltaGatewaySource,
  /function\s+oldLedgerAuthorityFields/,
  'State delta gateway old-ledger writers must classify authority/projection ownership centrally.'
);
assert.match(
  stateDeltaGatewaySource,
  /compatibilityProjectionUnavailable/,
  'State delta gateway old-ledger writers must mark missing CORE evidence fail-closed instead of silent authority.'
);
assert.equal(
  /replacementText\s*:\s*(ingress|response)\.replacementText\s*\|\|\s*null/.test(stateDeltaGatewaySource),
  false,
  'State delta gateway must not record raw replacementText directly on old ingress/response ledgers.'
);
assert.equal(
  /replacementText\s*:\s*compact\s*\(\s*replacementText\s*\)/.test(messageReconcilerSource),
  false,
  'MessageReconciler source-mutation mirrors must not persist raw replacement text into old ingress/response rows.'
);
assert.match(
  messageReconcilerSource,
  /compactReplacementTextRef/,
  'MessageReconciler source-mutation mirrors must preserve replacement text only as hash/presence/length refs.'
);
assert.match(
  messageReconcilerSource,
  /directive\.coreIngressMutationProjectionRef\.v1/,
  'MessageReconciler player-source mutation mirrors must carry CORE ingress projection refs.'
);
assert.equal(
  /findRaw(Ingress|Response)|findRawLatestByHostId/.test(messageReconcilerSource),
  false,
  'MessageReconciler source-mutation matching must use runtime-ledger-view so silent old rows cannot bypass CORE projection demotion.'
);
assert.match(
  messageReconcilerSource,
  /updateTurnIngress[\s\S]*?authority:\s*['"]compatibilityProjection['"][\s\S]*?projectionSource:\s*['"]coreStoreV2['"][\s\S]*?coreProjection:\s*compactIngressMutationProjection/,
  'MessageReconciler player-source mutation mirrors must be tagged as CORE compatibility projections.'
);
assert.match(
  messageReconcilerSource,
  /acceptCorrectAsSwipeSelection[\s\S]*?const\s+coreProjection\s*=\s*compactResponseMutationProjection\(\{[\s\S]*?eventType[\s\S]*?updateDirectiveResponse\(latest,\s*responseUpdateId,[\s\S]*?authority:\s*['"]compatibilityProjection['"][\s\S]*?projectionSource:\s*['"]coreStoreV2['"][\s\S]*?coreProjection/,
  'MessageReconciler Correct-as-Swipe selected-swipe acceptance must keep old response rows as CORE-tagged compatibility projections.'
);
assertEverySourceCallHas(
  messageReconcilerSource,
  /\bupdateDirectiveResponse\s*\(/g,
  /missingCoreWriteMode:\s*['"]reject['"]/,
  'MessageReconciler response compatibility writes must fail closed when CORE projection evidence is missing.'
);
assert.match(
  stateDeltaGatewaySource,
  /coreProjection:\s*cloneJson\(ingress\.coreProjection\s*\|\|\s*null\)/,
  'State delta gateway ingress records must preserve CORE projection metadata.'
);
assert.match(
  stateDeltaGatewaySource,
  /oldLedgerAuthorityFields\(\s*['"]ingress['"]/,
  'State delta gateway ingress records must preserve compatibility authority metadata.'
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
  /return\s+recordDirectiveResponse\s*\(\s*campaignState\s*,\s*entry\s*\)/.test(responseDispatcherSource),
  false,
  'ResponseDispatcher compatibility helper must not fall back to a raw old responseLedger row when CORE projection evidence is missing.'
);
assert.equal(
  /findRuntimeResponseRow/.test(responseDispatcherSource),
  false,
  'ResponseDispatcher compatibility updates must not read raw runtimeTracking.responseLedger rows before CORE-first ledger view.'
);
assert.match(
  responseDispatcherSource,
  /const\s+existing\s*=\s*await\s+findResponse\(campaignState,\s*responseId\)\s*\|\|\s*\{\}/,
  'ResponseDispatcher compatibility updates must merge existing response metadata through runtime-ledger-view.'
);
assert.match(
  responseDispatcherSource,
  /function\s+reobserveHostGenerationCompletions[\s\S]*?const\s+coreRuntimeLedgerView\s*=\s*await\s+createRuntimeLedgerViewAsync\(state,\s*\{\s*coreTurnStore\s*\}\)[\s\S]*?const\s+responseLedger\s*=\s*coreRuntimeLedgerView\.responseLedger\s*\|\|\s*\[\]/,
  'ResponseDispatcher host-generation reobserve must scan responses through the CORE-only runtime ledger view.'
);
assert.match(
  responseDispatcherSource,
  /async\s+function\s+findExisting[\s\S]*?const\s+projections\s*=\s*await\s+coreTurnStore\.readProjections\(\)\s*\|\|\s*\{\}/,
  'ResponseDispatcher duplicate detection must await async CORE projections before reading recovery diagnostics.'
);
assert.match(
  responseDispatcherSource,
  /async\s+function\s+projectedCoreRecoveryForResponse[\s\S]*?const\s+projections\s*=\s*await\s+coreTurnStore\.readProjections\(\)\s*\|\|\s*\{\}/,
  'ResponseDispatcher projected recovery lookup must await async CORE projections after runtime reload.'
);
assert.match(
  responseDispatcherSource,
  /async\s+function\s+projectedCoreDiagnosticForResponse[\s\S]*?const\s+projections\s*=\s*await\s+coreTurnStore\.readProjections\(\)\s*\|\|\s*\{\}/,
  'ResponseDispatcher projected diagnostic lookup must await async CORE projections after runtime reload.'
);
assert.match(
  responseDispatcherSource,
  /async\s+function\s+existingResponseDispatchResult[\s\S]*?await\s+projectedCoreRecoveryForResponse\(existing\)[\s\S]*?await\s+projectedCoreDiagnosticForResponse\(existing\)/,
  'ResponseDispatcher duplicate results must classify async CORE recovery/diagnostic projections before retrying work.'
);
assert.equal(
  /function\s+isTaggedResponseCompatibilityMirror/.test(responseDispatcherSource),
  false,
  'ResponseDispatcher reobserve must rely on runtime-ledger-view tagged mirrors instead of scanning raw response rows.'
);
assert.match(
  responseDispatcherSource,
  /const\s+coreRuntimeLedgerView\s*=\s*await\s+createRuntimeLedgerViewAsync\(state,\s*\{\s*coreTurnStore\s*\}\)[\s\S]*?const\s+responseLedger\s*=\s*coreRuntimeLedgerView\.responseLedger\s*\|\|\s*\[\][\s\S]*?const\s+runtimeHostObservationClaims\s*=\s*responseLedger\.filter/,
  'ResponseDispatcher reobserve host-observation claims must come from CORE-only ledger view, not raw runtimeTracking.responseLedger.'
);
assert.equal(
  /runtimeHostObservationClaims\s*=\s*\(state\.runtimeTracking\?\.responseLedger|state\.runtimeTracking\?\.responseLedger[\s\S]*?hostObservation/.test(responseDispatcherSource),
  false,
  'ResponseDispatcher reobserve must not scan raw runtimeTracking.responseLedger for host-observation claims.'
);
assert.match(
  responseDispatcherSource,
  /runtimeHostObservationClaimTransactions[\s\S]*?responseNeedsHostReobserve[\s\S]*?!runtimeHostObservationClaimTransactions\.has\(responseTransactionId\(entry\)\)/,
  'ResponseDispatcher regular reobserve scan must skip transactions with hot runtime host-observation claims.'
);
assert.match(
  responseDispatcherSource,
  /sameResponseClaim[\s\S]*?usedAssistantIds\.has\(id\)\s*&&\s*!\s*sameResponseClaim/,
  'ResponseDispatcher reobserve must allow same-response CORE claims while blocking assistant ids claimed by other responses.'
);
assert.equal(
  /missingCoreResponseProjectionPatch|directive\.coreResponseProjectionUnavailable\.v1/.test(responseDispatcherSource),
  false,
  'ResponseDispatcher compatibility helper must not synthesize missing-CORE response projection fallback rows.'
);
assert.equal(
  /diagnosticCompatibilityProjection|directive\.coreResponseDiagnosticProjectionRef\.v1/.test(responseDispatcherSource),
  false,
  'ResponseDispatcher CORE-diagnostic failures must not mint diagnostic-only old responseLedger rows.'
);
assert.match(
  responseDispatcherSource,
  /if\s*\(\s*!\s*projection\s*&&\s*coreDiagnostic\s*\)\s*return\s+campaignState;/,
  'ResponseDispatcher diagnostic-only compatibility paths must leave old responseLedger state unchanged unless a live CORE response projection exists.'
);
assert.match(
  responseDispatcherSource,
  /function\s+requireCoreResponseProjection[\s\S]*?DIRECTIVE_CORE_RESPONSE_PROJECTION_REQUIRED[\s\S]*?recordDirectiveResponseCompatibility[\s\S]*?requireCoreResponseProjection\(entry,\s*\{\s*mirroredOperation\s*\}\)[\s\S]*?updateDirectiveResponseCompatibility[\s\S]*?requireCoreResponseProjection\(entry,\s*\{\s*mirroredOperation\s*\}\)/,
  'ResponseDispatcher compatibility helper must fail closed when CORE response projection evidence is missing.'
);
assert.equal(
  /function\s+readCoreResponseProjectionFor[\s\S]*?entry\.coreRecovery\?\.status[\s\S]*?entry\.coreRecovery\?\.transactionId[\s\S]*?recoveryStatus/.test(responseDispatcherSource),
  false,
  'ResponseDispatcher readCoreResponseProjectionFor must read CORE response projections only, not synthesize response authority from entry recovery fields.'
);
assertEverySourceCallHas(
  responseDispatcherSource,
  /\b(?:recordDirectiveResponse|updateDirectiveResponse)\s*\(/g,
  /missingCoreWriteMode:\s*['"]reject['"]/,
  'ResponseDispatcher response compatibility writes must fail closed when CORE projection evidence is missing.'
);
assert.equal(
  /pendingCoreStoreV2|compatibilityProjectionUnavailable/.test(responseDispatcherSource),
  false,
  'ResponseDispatcher must not write pending-CORE or unavailable response compatibility rows.'
);
assert.match(
  responseDispatcherSource,
  /function\s+ingressHostNativeContinuityProjection[\s\S]*?directive\.coreIngressHostNativeContinuityProjectionRef\.v1[\s\S]*?ingressPatch:[\s\S]*?coreProjection:\s*ingressProjection[\s\S]*?updateTurnIngress\(next,\s*ingressId,\s*projection\.ingressPatch,\s*\{[\s\S]*?missingCoreWriteMode:\s*['"]reject['"]/,
  'ResponseDispatcher host-native continuity ingress patches must carry CORE continuity projection evidence and reject missing-CORE old-ledger writes.'
);
assert.match(
  responseDispatcherSource,
  /compatibilityMirror/,
  'ResponseDispatcher compatibility rows must carry explicit CORE mirror metadata.'
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
assertEverySourceCallHas(
  chatTurnOrchestratorSource,
  /\bupdateDirectiveResponse\s*\(/g,
  /missingCoreWriteMode:\s*['"]reject['"]/,
  'ChatTurnOrchestrator response compatibility writes must fail closed when CORE projection evidence is missing.'
);
const findOpenNoOutcomeRecoveryBody = /async\s+function\s+findOpenNoOutcomeRecovery[\s\S]*?\n  \}/.exec(chatTurnOrchestratorSource)?.[0] || '';
assert.equal(
  /resolveRecoveryEvent\(|for\s*\(\s*const\s+recovery\s+of\s+\(await\s+runtimeLedgerViewFresh\(next\)\)\.recoveryJournal\s*\|\|\s*\[\]\s*\)[\s\S]*?shouldResolveNoOutcomeRecoveryOnReobserve/.test(chatTurnOrchestratorSource),
  false,
  'ChatTurnOrchestrator must not run old recovery resolver loops after source reobserve.'
);
assert.match(
  findOpenNoOutcomeRecoveryBody,
  /const\s+recoveryRows\s*=\s*\(await\s+runtimeLedgerViewFresh\(state\)\)\.recoveryJournal\s*\|\|\s*\[\]/,
  'ChatTurnOrchestrator latest-source restart recovery candidate must await CORE recovery projections, not old recovery rows.'
);
assert.equal(
  /runtimeTracking(?:\?|\.)?\.?recoveryJournal/.test(findOpenNoOutcomeRecoveryBody),
  false,
  'ChatTurnOrchestrator latest-source restart recovery candidate must not scan raw runtimeTracking.recoveryJournal.'
);
assert.match(
  chatTurnOrchestratorSource,
  /function\s+responseRetryRecoveryFromCoreProjection[\s\S]*?const\s+recoveryView\s*=\s*await\s+runtimeLedgerViewFresh\(state\)[\s\S]*?const\s+recoveryRows\s*=\s*recoveryView\.recoveryJournal[\s\S]*?const\s+responseRows\s*=\s*recoveryView\.responseLedger[\s\S]*?const\s+ingressRows\s*=\s*recoveryView\.ingressLedger/,
  'ChatTurnOrchestrator response-retry recovery lookup must read CORE projections without old recovery fallback.'
);
assert.equal(
  /runtimeTracking\?\.recoveryJournal\s*\|\|\s*\[\]\s*\)\.some\s*\(\s*\(entry\)\s*=>\s*entry\.id\s*===\s*recovery\.id/.test(chatTurnOrchestratorSource),
  false,
  'ChatTurnOrchestrator retry recovery resolution must not gate from raw runtimeTracking.recoveryJournal.'
);
assert.equal(
  /createRuntimeLedgerView\(state\)\.recoveryJournal|createRuntimeLedgerView\(next\)\.recoveryJournal/.test(chatTurnOrchestratorSource),
  false,
  'ChatTurnOrchestrator retry recovery resolution must not gate from sync CORE projection reads.'
);
assert.equal(
  /async\s+function\s+retryCommittedResponse[\s\S]*?resolveRecoveryEvent\(state,\s*recovery\.id/.test(chatTurnOrchestratorSource),
  false,
  'Committed response retry must not call the retired old recovery resolver.'
);
assert.equal(
  /async\s+function\s+retryProviderFailureResponse[\s\S]*?resolveRecoveryEvent\(next,\s*recovery\.id/.test(chatTurnOrchestratorSource),
  false,
  'Provider-failure response retry must not call the retired old recovery resolver.'
);
assert.equal(
  /function\s+findOpenResponseRetryRecovery[\s\S]*?runtimeTracking\?\.recoveryJournal/.test(chatTurnOrchestratorSource),
  false,
  'ChatTurnOrchestrator response-retry recovery discovery must not scan raw runtimeTracking.recoveryJournal.'
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
assert.match(
  chatTurnOrchestratorSource,
  /function\s+ingressResponseRetryCompatibilityProjection[\s\S]*?directive\.coreIngressResponseRetryProjectionRef\.v1[\s\S]*?const\s+coreProjection\s*=\s*ingressResponseRetryCompatibilityProjection[\s\S]*?updateTurnIngress\(failed,\s*ingressId[\s\S]*?coreProjection[\s\S]*?missingCoreWriteMode:\s*['"]reject['"]/,
  'Host response post failure ingress updates must carry CORE retry projection evidence and reject missing-CORE old-ledger writes.'
);
assert.match(
  chatTurnOrchestratorSource,
  /providerFailureCoreRecovery[\s\S]*?updateTurnIngress\(state,\s*interaction\.ingressId[\s\S]*?authority:\s*['"]compatibilityProjection['"][\s\S]*?projectionSource:\s*['"]coreStoreV2['"][\s\S]*?coreProjection:\s*ingressResponseRetryCompatibilityProjection\([\s\S]*?eventType:\s*['"]providerFailureAfterMechanicsCommit['"][\s\S]*?missingCoreWriteMode:\s*['"]reject['"]/,
  'Provider-failure-after-mechanics ingress retry updates must carry CORE retry projection evidence and reject missing-CORE old-ledger writes.'
);
assert.match(
  chatTurnOrchestratorSource,
  /pending\.kind\s*===\s*['"]terminalOutcomeDecision['"][\s\S]*?terminal-resolution-ingress-core-projection-required/,
  'Terminal outcome resolution must fail closed instead of synthesizing no-CORE ingress rows.'
);
assert.equal(
  /pending\.kind\s*===\s*['"]terminalOutcomeDecision['"][\s\S]*?recordTurnIngress\(next,/.test(chatTurnOrchestratorSource),
  false,
  'Terminal outcome resolution must not call recordTurnIngress for missing no-CORE ingress rows.'
);
assert.match(
  chatTurnOrchestratorSource,
  /async\s+function\s+beginCoreTurnForIngress[\s\S]*?DIRECTIVE_CORE_INGRESS_REQUIRED[\s\S]*?DIRECTIVE_CORE_INGRESS_TRANSACTION_REQUIRED/,
  'ChatTurnOrchestrator must require CORE source observation before recording player ingress.'
);
assert.match(
  chatTurnOrchestratorSource,
  /async\s+function\s+createIngress[\s\S]*?recordTurnIngress\(state,\s*ingressRecord,\s*\{[\s\S]*?missingCoreWriteMode:\s*['"]reject['"]/,
  'ChatTurnOrchestrator primary ingress writes must reject missing CORE projection evidence.'
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
assertEverySourceCallHas(
  runtimeAppSource,
  /\b(?:recordDirectiveResponse|updateDirectiveResponse)\s*\(/g,
  /missingCoreWriteMode:\s*['"]reject['"]/,
  'Runtime-app auxiliary response compatibility writes must fail closed when CORE projection evidence is missing.'
);
assertEverySourceCallHas(
  runtimeAppSource,
  /\brecordTurnIngress\s*\(/g,
  /missingCoreWriteMode:\s*['"]reject['"]/,
  'Runtime-app auxiliary ingress compatibility writes must fail closed when CORE projection evidence is missing.'
);
assert.match(
  runtimeAppSource,
  /function\s+outcomeRerunIngressProjection[\s\S]*?directive\.coreIngressOutcomeRerunProjectionRef\.v1[\s\S]*?replacementIngress:\s*\{[\s\S]*?authority:\s*['"]compatibilityProjection['"][\s\S]*?projectionSource:\s*['"]coreStoreV2['"][\s\S]*?coreProjection:\s*outcomeRerunIngressProjection/,
  'Runtime-app outcome-rerun replacement ingress must be tagged as a CORE compatibility projection.'
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
assert.equal(lensFlush.promptBudgetTrace.kind, 'directive.lensPromptBudgetTrace.v1');
assert.equal(lensFlush.promptBudgetTraceRef.kind, 'directive.lensPromptBudgetTraceRef.v1');
assert.equal(lensFlush.promptBudgetTraceRef.hash, lensFlush.promptBudgetTrace.hash);
assert.deepEqual(
  lensFlush.promptBudgetTrace.lanes.map((lane) => lane.id),
  [
    'stableRules',
    'protectedContinuity',
    'activeScene',
    'activeCast',
    'missionPressure',
    'recentTranscript',
    'recall',
    'volatileTurn',
    'externalEnvironment'
  ]
);
assert.equal(lensFlush.promptBudgetTrace.lanes.find((lane) => lane.id === 'externalEnvironment').diagnosticOnly, true);
assert.equal(lensFlush.installed.promptBudgetTraceRef.hash, lensFlush.promptBudgetTrace.hash);
assert.equal(lensFlush.packet.lensPromptBudgetTrace.hash, lensFlush.promptBudgetTrace.hash);
assert.equal(installedPackets.length, 1);
assert.equal(lensBuildCalls.length, 1);
assert.equal(lensBuildCalls[0].externalPromptEnvironmentRef.hash, frame.externalPromptEnvironmentRef.hash);
assert.equal(lensCore.calls.some((call) => call.diagnostic?.externalPromptEnvironmentRef?.hash === frame.externalPromptEnvironmentRef.hash), true);
assert.equal(lensCore.calls.some((call) => Object.hasOwn(call.diagnostic || {}, 'cacheRecord')), false);
assert.equal(lensCore.calls.some((call) => call.diagnostic?.promptBudgetTraceRef?.hash === lensFlush.promptBudgetTrace.hash), true);
assert.equal(lensCore.calls.some((call) => call.diagnostic?.promptBudgetTraceSummary?.hash === lensFlush.promptBudgetTrace.hash), true);
assert.equal(lensCore.calls.some((call) => Object.hasOwn(call.diagnostic || {}, 'promptBudgetTrace')), false);
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
assert.equal(revisionFlush.promptBudgetTrace.cacheInputs.recallIndexRevision, 'recall-revision-from-core');
assert.equal(revisionFlush.promptBudgetTrace.cacheInputs.sceneSealRevision, 'scene-seal-revision-from-core');
assert.equal(revisionFlush.promptBudgetTrace.cacheInputs.pressureArcDigestRevision, 'pressure-arc-revision-from-core');
assert.equal(revisionFlush.promptBudgetTrace.lanes.find((lane) => lane.id === 'recall').includedRefs[0].hash, 'recall-revision-from-core');
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
assert.equal(
  findForgePathConflict([
    { workerId: 'relationship', operations: [
      { op: 'append', path: 'relationships.memoryLedger' },
      { op: 'append', path: 'relationships.memoryLedger' }
    ] }
  ]),
  null,
  'FORGE must allow one worker to append multiple ordered records to the same array path.'
);
assert.equal(
  findForgePathConflict([
    { workerId: 'relationship', operations: [
      { op: 'append', path: 'relationships.memoryLedger' },
      { op: 'set', path: 'relationships.memoryLedger' }
    ] }
  ])?.path,
  'relationships.memoryLedger',
  'FORGE must still reject same-worker overwrite-style conflicts on a repeated path.'
);

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
const forgeRunDiagnostic = forgeCore.calls.find((call) => call.method === 'appendDiagnostics' && call.transactionId === 'txn-forge' && call.diagnostic.status === 'applied');
assert.equal(forgeRunDiagnostic.diagnostic.workerResults, undefined);
assert.equal(forgeRunDiagnostic.diagnostic.workerResultSummary.kind, 'directive.forgeWorkerResultSummary.v1');
assert.equal(forgeRunDiagnostic.diagnostic.workerResultSummary.workerCount, 1);
assert.equal(forgeRunDiagnostic.diagnostic.workerResultSummary.operationCount, 1);
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
    rawPromptBody: 'RAW SIDECAR TOP LEVEL PROMPT MUST NOT PERSIST',
    providerOutput: 'RAW SIDECAR TOP LEVEL OUTPUT MUST NOT PERSIST',
    vectorPayload: ['RAW SIDECAR TOP LEVEL VECTOR MUST NOT PERSIST'],
    secret: 'SECRET SIDECAR TOP LEVEL MUST NOT PERSIST',
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
assert.equal(JSON.stringify(sidecarExecution).includes('RAW SIDECAR TOP LEVEL PROMPT MUST NOT PERSIST'), false);
assert.equal(JSON.stringify(sidecarExecution).includes('RAW SIDECAR TOP LEVEL OUTPUT MUST NOT PERSIST'), false);
assert.equal(JSON.stringify(sidecarExecution).includes('RAW SIDECAR TOP LEVEL VECTOR MUST NOT PERSIST'), false);
assert.equal(JSON.stringify(sidecarExecution).includes('SECRET SIDECAR TOP LEVEL MUST NOT PERSIST'), false);
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
assert.equal(JSON.stringify(sidecarExecutionReplay).includes('RAW SIDECAR TOP LEVEL PROMPT MUST NOT PERSIST'), false);
assert.equal(JSON.stringify(sidecarExecutionReplay).includes('RAW SIDECAR TOP LEVEL OUTPUT MUST NOT PERSIST'), false);
assert.equal(JSON.stringify(sidecarExecutionReplay).includes('RAW SIDECAR TOP LEVEL VECTOR MUST NOT PERSIST'), false);
assert.equal(JSON.stringify(sidecarExecutionReplay).includes('SECRET SIDECAR TOP LEVEL MUST NOT PERSIST'), false);
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
const settledAcceptedDiagnostic = forgeCore.calls.find((call) => call.method === 'appendDiagnostics' && call.transactionId === 'txn-forge-sidecar' && call.diagnostic.status === 'settled');
assert.equal(settledAcceptedDiagnostic.diagnostic.workerResults, undefined);
assert.equal(settledAcceptedDiagnostic.diagnostic.workerResultSummary.kind, 'directive.forgeWorkerResultSummary.v1');
assert.equal(settledAcceptedDiagnostic.diagnostic.workerResultSummary.workerCount, 1);
assert.equal(settledAcceptedDiagnostic.diagnostic.workerResultSummary.operationCount, 1);
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
    restoreRevision: 999,
    coreCheckpointRef: {
      checkpointId: 'checkpoint-rollback-prevalidation',
      sourceKind: 'coreStoreV2.checkpoint'
    }
  },
  repairProjection: {
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
assert.equal(rollbackPrevalidation.reason, 'rollback-core-checkpoint-required');
assert.equal(rollbackPrevalidation.errorCode, 'DIRECTIVE_REPAIR_ROLLBACK_CORE_CHECKPOINT_REQUIRED');
assert.equal(rollbackPrevalidationCalls.length, 0, 'CORE rollback actuation must not be recorded before a restore candidate exists.');

const rollbackLedgerDemotion = await rollbackPrevalidationBoundary.executeRollbackActuation({
  coreRecovery: {
    transactionId: 'txn-rollback-ledger-demotion',
    recoveryCaseId: 'recovery-rollback-ledger-demotion',
    decision: { transactionId: 'txn-rollback-ledger-demotion' },
    sourceMutation: { eventType: 'playerMessageDeleted' }
  },
  rollbackActuation: {
    kind: 'directive.repairRollbackActuationDecision.v1',
    authorized: true,
    action: 'restorePreOutcomeRevision',
    transactionId: 'txn-rollback-ledger-demotion',
    restoreRevision: 12,
    coreCheckpointRef: {
      checkpointId: 'checkpoint-rollback-ledger-demotion',
      sourceKind: 'coreStoreV2.checkpoint',
      sourceRevision: 12
    }
  },
  repairProjection: {
    shouldRestoreRevision: true,
    restoreRevision: 12
  },
  eventType: 'playerMessageDeleted',
  campaignState: {
    campaign: { id: 'campaign-rollback-ledger-demotion' },
    mission: { activePhaseId: 'after-rollback-ledger-demotion' },
    directiveRuntimeEvidence: {
      coreStoreReadProjections: {
        responseLedgerRevision: 31,
        ingressLedger: [{
          id: 'core-ingress-rollback-demotion',
          hostMessageId: 'core-player-rollback-demotion',
          transactionId: 'txn-rollback-ledger-demotion',
          status: 'classified'
        }],
        responseLedger: [{
          id: 'core-response-rollback-demotion',
          hostMessageId: 'core-assistant-rollback-demotion',
          transactionId: 'txn-rollback-ledger-demotion',
          responseKind: 'hostContinue',
          status: 'posted'
        }],
        recoveryJournal: [{
          id: 'core-recovery-rollback-demotion',
          transactionId: 'txn-rollback-ledger-demotion',
          status: 'resolved'
        }],
        modelCallDiagnostics: [{
          id: 'core-model-call-rollback-demotion',
          roleId: 'utilityTurnClassifier',
          status: 'ok',
          requestHash: 'core-model-call-hash-rollback-demotion'
        }],
        terminalDecisionLedger: {
          schemaVersion: 1,
          activeDecisionId: 'terminal-decision-rollback-demotion',
          detections: [{
            id: 'terminal-detection-rollback-demotion',
            authority: 'terminalDecisionProjection',
            projectionSource: 'coreStoreV2',
            coreProjection: {
              kind: 'directive.terminalEndConditionLedgerProjectionRef.v1',
              rowKind: 'detection',
              status: 'pending'
            }
          }],
          decisions: [{
            id: 'terminal-decision-rollback-demotion',
            status: 'pending',
            authority: 'terminalDecisionProjection',
            projectionSource: 'coreStoreV2',
            coreProjection: {
              kind: 'directive.terminalEndConditionLedgerProjectionRef.v1',
              rowKind: 'decision',
              status: 'pending'
            }
          }],
          branchRecords: [{
            id: 'terminal-branch-rollback-demotion',
            decisionId: 'terminal-decision-rollback-demotion',
            authority: 'terminalDecisionProjection',
            projectionSource: 'coreStoreV2',
            coreProjection: {
              kind: 'directive.terminalEndConditionLedgerProjectionRef.v1',
              rowKind: 'branchRecord',
              status: 'saved'
            }
          }],
          continuationFrames: []
        }
      }
    },
    runtimeTracking: {
      revision: 13,
      history: [],
      ingressLedger: [
        { id: 'silent-ingress-rollback-demotion', hostMessageId: 'silent-player-rollback-demotion', status: 'classified' },
        {
          id: 'tagged-ingress-rollback-demotion',
          hostMessageId: 'tagged-player-rollback-demotion',
          status: 'classified',
          authority: 'compatibilityProjectionUnavailable',
          projectionSource: 'runtimeTrackingLegacy',
          compatibilityMirror: { kind: 'directive.coreIngressCompatibilityMirror.v1', status: 'missingCoreProjection' }
        }
      ],
      responseLedger: [
        { id: 'silent-response-rollback-demotion', hostMessageId: 'silent-assistant-rollback-demotion', responseKind: 'hostContinue', status: 'posted' },
        {
          id: 'tagged-response-rollback-demotion',
          hostMessageId: 'tagged-assistant-rollback-demotion',
          responseKind: 'hostContinue',
          status: 'posted',
          authority: 'compatibilityProjectionUnavailable',
          projectionSource: 'runtimeTrackingLegacy',
          compatibilityMirror: { kind: 'directive.coreResponseCompatibilityMirror.v1', status: 'missingCoreProjection' }
        }
      ],
      recoveryJournal: [{ id: 'silent-recovery-rollback-demotion', status: 'reviewRequired' }],
      responseLedgerRevision: 3131,
      modelCallJournal: [{
        id: 'silent-model-call-rollback-demotion',
        roleId: 'legacyReviewer',
        status: 'ok',
        prompt: 'SILENT_OLD_ROLLBACK_MODEL_CALL_PROMPT_SHOULD_NOT_SURVIVE'
      }],
      pendingInteractions: [{
        id: 'silent-pending-rollback-demotion',
        kind: 'terminalOutcomeDecision',
        status: 'pending'
      }, {
        id: 'terminal-pending-rollback-demotion',
        kind: 'terminalOutcomeDecision',
        status: 'pending',
        authority: 'terminalDecisionProjection',
        projectionSource: 'terminalOutcomeDecision',
        compatibilityMirror: {
          kind: 'directive.pendingInteractionCompatibilityMirror.v1',
          status: 'terminalDecisionProjection',
          interactionId: 'terminal-pending-rollback-demotion',
          checkpointId: 'checkpoint-rollback-demotion'
        }
      }],
      endConditionLedger: {
        schemaVersion: 1,
        activeDecisionId: 'terminal-decision-rollback-demotion',
        detections: [{
          id: 'terminal-detection-rollback-demotion',
          authority: 'terminalDecisionProjection',
          coreProjection: {
            kind: 'directive.terminalEndConditionLedgerProjectionRef.v1',
            rowKind: 'detection',
            status: 'pending'
          }
        }, {
          id: 'silent-terminal-detection-rollback-demotion',
          status: 'pending'
        }],
        decisions: [{
          id: 'terminal-decision-rollback-demotion',
          status: 'pending',
          authority: 'terminalDecisionProjection',
          coreProjection: {
            kind: 'directive.terminalEndConditionLedgerProjectionRef.v1',
            rowKind: 'decision',
            status: 'pending'
          }
        }, {
          id: 'silent-terminal-decision-rollback-demotion',
          status: 'pending'
        }],
        branchRecords: [{
          id: 'terminal-branch-rollback-demotion',
          decisionId: 'terminal-decision-rollback-demotion',
          authority: 'terminalDecisionProjection',
          coreProjection: {
            kind: 'directive.terminalEndConditionLedgerProjectionRef.v1',
            rowKind: 'branchRecord',
            status: 'saved'
          }
        }, {
          id: 'silent-terminal-branch-rollback-demotion',
          decisionId: 'terminal-decision-rollback-demotion'
        }],
        continuationFrames: []
      }
    }
  },
  coreCheckpointRestoreState: {
    campaign: { id: 'campaign-rollback-ledger-demotion' },
    mission: { activePhaseId: 'before-rollback-ledger-demotion' }
  }
});
assert.equal(rollbackLedgerDemotion.status, 'applied', 'REPAIR rollback execution should restore from CORE checkpoint state when available.');
assert.equal(rollbackLedgerDemotion.campaignState.mission.activePhaseId, 'before-rollback-ledger-demotion');
assert.deepEqual(
  rollbackLedgerDemotion.campaignState.runtimeTracking.ingressLedger.map((entry) => entry.id),
  [],
  'REPAIR rollback restore must not mirror CORE ingress rows into old runtimeTracking ledgers.'
);
assert.deepEqual(
  rollbackLedgerDemotion.campaignState.runtimeTracking.responseLedger.map((entry) => entry.id),
  [],
  'REPAIR rollback restore must not mirror CORE response rows into old runtimeTracking ledgers.'
);
assert.deepEqual(
  rollbackLedgerDemotion.campaignState.runtimeTracking.recoveryJournal.map((entry) => entry.id),
  [],
  'REPAIR rollback restore must not mirror CORE recovery rows into old runtimeTracking ledgers.'
);
assert.deepEqual(
  rollbackLedgerDemotion.campaignState.runtimeTracking.modelCallJournal.map((entry) => entry.id),
  [],
  'REPAIR rollback restore must keep CORE model-call diagnostics out of old runtimeTracking.modelCallJournal.'
);
assert.equal(
  rollbackLedgerDemotion.campaignState.runtimeTracking.responseLedgerRevision,
  31,
  'REPAIR rollback restore must preserve CORE response revision instead of stale old responseLedgerRevision.'
);
assert.equal(
  JSON.stringify(rollbackLedgerDemotion.campaignState.runtimeTracking.modelCallJournal).includes('SILENT_OLD_ROLLBACK_MODEL_CALL_PROMPT_SHOULD_NOT_SURVIVE'),
  false,
  'REPAIR rollback restore must not carry raw old model-call prompt text.'
);
assert.deepEqual(
  readRuntimeCoreProjections(rollbackLedgerDemotion.campaignState).modelCallDiagnostics.map((entry) => entry.id),
  ['core-model-call-rollback-demotion'],
  'REPAIR rollback restore must preserve embedded compact CORE model-call diagnostics under CORE projections.'
);
assert.deepEqual(
  terminalDecisionLedgerView(rollbackLedgerDemotion.campaignState).detections.map((entry) => entry.id),
  ['terminal-detection-rollback-demotion'],
  'REPAIR rollback restore must preserve only terminal projection detection rows.'
);
assert.deepEqual(
  terminalDecisionLedgerView(rollbackLedgerDemotion.campaignState).decisions.map((entry) => entry.id),
  ['terminal-decision-rollback-demotion'],
  'REPAIR rollback restore must drop unowned terminal decision rows.'
);
assert.deepEqual(
  terminalDecisionLedgerView(rollbackLedgerDemotion.campaignState).branchRecords.map((entry) => entry.id),
  ['terminal-branch-rollback-demotion'],
  'REPAIR rollback restore must drop unowned terminal branch rows.'
);
assert.deepEqual(
  rollbackLedgerDemotion.campaignState.runtimeTracking.pendingInteractions.map((entry) => entry.id),
  [],
  'REPAIR rollback restore must keep pending interactions out of old runtimeTracking rows; CORE projections own live pending state.'
);
assert.equal(
  JSON.stringify(rollbackLedgerDemotion.campaignState.runtimeTracking).includes('silent-pending-rollback-demotion'),
  false,
  'REPAIR rollback restore must not carry raw unowned pending interactions.'
);
assert.equal(
  JSON.stringify(rollbackLedgerDemotion.campaignState.runtimeTracking.endConditionLedger).includes('silent-terminal-'),
  false,
  'REPAIR rollback restore must not carry raw unowned terminal ledger rows.'
);
assert.deepEqual(
  createRuntimeLedgerView(rollbackLedgerDemotion.campaignState).ingressLedger.map((entry) => entry.id),
  ['core-ingress-rollback-demotion'],
  'REPAIR rollback ledger view must still expose embedded CORE ingress projection rows.'
);
assert.deepEqual(
  createRuntimeLedgerView(rollbackLedgerDemotion.campaignState).responseLedger.map((entry) => entry.id),
  ['core-response-rollback-demotion'],
  'REPAIR rollback ledger view must still expose embedded CORE response projection rows.'
);
assert.deepEqual(
  createRuntimeLedgerView(rollbackLedgerDemotion.campaignState).recoveryJournal.map((entry) => entry.id),
  ['core-recovery-rollback-demotion'],
  'REPAIR rollback ledger view must still expose embedded CORE recovery projection rows.'
);
const rollbackPrevalidationCallsAfterDemotion = rollbackPrevalidationCalls.length;

const rollbackExternalProjectionBoundary = createRepairCommandBoundary({
  now: () => '2026-06-28T15:03:00.000Z',
  coreTurnStore: {
    async readProjections() {
      return {
        ingressLedger: [{
          id: 'core-ingress-rollback-external',
          hostMessageId: 'core-player-rollback-external',
          transactionId: 'txn-rollback-external-projection',
          status: 'classified'
        }],
        responseLedger: [{
          id: 'core-response-rollback-external',
          hostMessageId: 'core-assistant-rollback-external',
          transactionId: 'txn-rollback-external-projection',
          responseKind: 'hostContinue',
          status: 'posted'
        }],
        recoveryJournal: [{
          id: 'core-recovery-rollback-external',
          transactionId: 'txn-rollback-external-projection',
          status: 'resolved'
        }],
        responseLedgerRevision: 41,
        modelCallDiagnostics: [{
          id: 'core-model-call-rollback-external',
          roleId: 'storyQualityReviewer',
          status: 'ok',
          requestHash: 'core-model-call-hash-rollback-external'
        }]
      };
    }
  },
  repairRuntime: {
    async recordRollbackActuation(input = {}) {
      return { status: 'recorded', rollback: { id: 'rollback-external-projection', input: cloneJson(input) } };
    }
  }
});
const rollbackExternalProjection = await rollbackExternalProjectionBoundary.executeRollbackActuation({
  coreRecovery: {
    transactionId: 'txn-rollback-external-projection',
    recoveryCaseId: 'recovery-rollback-external-projection',
    decision: { transactionId: 'txn-rollback-external-projection' },
    sourceMutation: { eventType: 'playerMessageDeleted' }
  },
  rollbackActuation: {
    kind: 'directive.repairRollbackActuationDecision.v1',
    authorized: true,
    action: 'restorePreOutcomeRevision',
    transactionId: 'txn-rollback-external-projection',
    restoreRevision: 12,
    coreCheckpointRef: {
      checkpointId: 'checkpoint-rollback-external-projection',
      sourceKind: 'coreStoreV2.checkpoint',
      sourceRevision: 12
    }
  },
  eventType: 'playerMessageDeleted',
  campaignState: {
    campaign: { id: 'campaign-rollback-external-projection' },
    runtimeTracking: {
      revision: 13,
      history: [],
      ingressLedger: [{ id: 'silent-ingress-rollback-external', hostMessageId: 'silent-player-rollback-external', status: 'classified' }],
      responseLedger: [{ id: 'silent-response-rollback-external', hostMessageId: 'silent-assistant-rollback-external', responseKind: 'hostContinue', status: 'posted' }],
      recoveryJournal: [{ id: 'silent-recovery-rollback-external', status: 'reviewRequired' }],
      responseLedgerRevision: 4141,
      modelCallJournal: [{
        id: 'silent-model-call-rollback-external',
        roleId: 'legacyReviewer',
        status: 'ok',
        response: 'SILENT_OLD_ROLLBACK_MODEL_CALL_RESPONSE_SHOULD_NOT_SURVIVE'
      }]
    }
  },
  coreCheckpointRestoreState: {
    campaign: { id: 'campaign-rollback-external-projection' },
    mission: { activePhaseId: 'before-rollback-external-projection' }
  }
});
assert.equal(rollbackExternalProjection.status, 'applied', 'REPAIR rollback restore should read external CORE projections when embedded evidence is absent.');
assert.deepEqual(
  rollbackExternalProjection.campaignState.runtimeTracking.ingressLedger.map((entry) => entry.id),
  [],
  'REPAIR rollback restore must not mirror external CORE ingress rows into old runtimeTracking ledgers.'
);
assert.deepEqual(
  rollbackExternalProjection.campaignState.runtimeTracking.responseLedger.map((entry) => entry.id),
  [],
  'REPAIR rollback restore must not mirror external CORE response rows into old runtimeTracking ledgers.'
);
assert.deepEqual(
  rollbackExternalProjection.campaignState.runtimeTracking.recoveryJournal.map((entry) => entry.id),
  [],
  'REPAIR rollback restore must not mirror external CORE recovery rows into old runtimeTracking ledgers.'
);
assert.deepEqual(
  rollbackExternalProjection.campaignState.runtimeTracking.modelCallJournal.map((entry) => entry.id),
  [],
  'REPAIR rollback restore must keep external CORE model-call diagnostics out of old runtimeTracking.modelCallJournal.'
);
assert.equal(
  rollbackExternalProjection.campaignState.runtimeTracking.responseLedgerRevision,
  41,
  'REPAIR rollback restore must preserve external CORE response revision instead of stale old responseLedgerRevision.'
);
assert.equal(
  JSON.stringify(rollbackExternalProjection.campaignState.runtimeTracking.modelCallJournal).includes('SILENT_OLD_ROLLBACK_MODEL_CALL_RESPONSE_SHOULD_NOT_SURVIVE'),
  false,
  'REPAIR rollback restore must not carry raw old model-call response text.'
);
assert.deepEqual(
  readRuntimeCoreProjections(rollbackExternalProjection.campaignState).modelCallDiagnostics.map((entry) => entry.id),
  ['core-model-call-rollback-external'],
  'REPAIR rollback restore must preserve external compact CORE model-call diagnostics under CORE projections.'
);
assert.deepEqual(
  createRuntimeLedgerView(rollbackExternalProjection.campaignState).ingressLedger.map((entry) => entry.id),
  ['core-ingress-rollback-external'],
  'REPAIR rollback ledger view must expose external CORE ingress projections through transient evidence.'
);
assert.deepEqual(
  createRuntimeLedgerView(rollbackExternalProjection.campaignState).responseLedger.map((entry) => entry.id),
  ['core-response-rollback-external'],
  'REPAIR rollback ledger view must expose external CORE response projections through transient evidence.'
);
assert.deepEqual(
  createRuntimeLedgerView(rollbackExternalProjection.campaignState).recoveryJournal.map((entry) => entry.id),
  ['core-recovery-rollback-external'],
  'REPAIR rollback ledger view must expose external CORE recovery projections through transient evidence.'
);

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
    restoreRevision: 7,
    coreCheckpointRef: {
      checkpointId: 'checkpoint-rollback-history-only',
      sourceKind: 'coreStoreV2.checkpoint',
      sourceRevision: 7
    }
  },
  repairProjection: {
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
assert.equal(rollbackPrevalidationCalls.length, rollbackPrevalidationCallsAfterDemotion, 'CORE rollback actuation must not be recorded for history-only rollback.');

const productionRuntimeLedgerFallbackCallers = [
  ['runtime-app', runtimeAppSource],
  ['chat-turn-orchestrator', chatTurnOrchestratorSource],
  ['message-reconciler', messageReconcilerSource],
  ['response-dispatcher', responseDispatcherSource],
  ['turn-commit-coordinator', turnCommitCoordinatorSource],
  ['scene-reconciliation', sceneReconciliationSource],
  ['scene-handshake-settler', sceneHandshakeSettlerSource],
  ['source-settlement-latest-pair-scene-adapter', sourceSettlementLatestPairSceneAdapterSource],
  ['campaign-sidecar-scheduler', campaignSidecarSchedulerSource],
  ['continuity-diagnostics', continuityDiagnosticsSource],
  ['transaction-store-v2', transactionStoreV2Source]
];
for (const [name, source] of productionRuntimeLedgerFallbackCallers) {
  assert.equal(
    /legacyFallback\s*:|runtimeOverlay\s*:/.test(source),
    false,
    `${name} must not pass retired runtime-ledger fallback options.`
  );
}

console.log('Architecture redesign system skeleton contract tests passed');
