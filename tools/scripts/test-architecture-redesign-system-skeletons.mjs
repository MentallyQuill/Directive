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
assert.match(
  repairCommandBoundarySource,
  /createRuntimeLedgerViewAsync[\s\S]*?from\s+['"]\.\/runtime-ledger-view\.mjs['"]/,
  'REPAIR rollback restore must import the shared async CORE-first runtime ledger view.'
);
assert.match(
  repairCommandBoundarySource,
  /function\s+runtimeTrackingLedgersFromView\([\s\S]*?if\s*\(hasCoreProjections\(projections\)\)\s*\{[\s\S]*?ingressLedger:\s*\[\][\s\S]*?responseLedger:\s*\[\][\s\S]*?recoveryJournal:\s*\[\][\s\S]*?const\s+currentLedgerView\s*=\s*await\s+createRuntimeLedgerViewAsync\(current,\s*\{\s*coreTurnStore\s*\}\)[\s\S]*?const\s+runtimeProjections\s*=\s*await\s+readRuntimeCoreProjectionsAsync\(current,\s*\{\s*coreTurnStore\s*\}\)[\s\S]*?const\s+runtimeTrackingLedgers\s*=\s*runtimeTrackingLedgersFromView\(currentLedgerView,\s*runtimeProjections\)[\s\S]*?ingressLedger:\s*runtimeTrackingLedgers\.ingressLedger[\s\S]*?responseLedger:\s*runtimeTrackingLedgers\.responseLedger[\s\S]*?recoveryJournal:\s*runtimeTrackingLedgers\.recoveryJournal/,
  'REPAIR rollback restore must drop old runtimeTracking ledger mirrors when CORE projections exist.'
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
  /terminalDecisionLedgerView[\s\S]*?from\s+['"]\.\/terminal-decision-ledger-view\.mjs['"][\s\S]*?endConditionLedger:\s*terminalDecisionLedgerView\(current\)/,
  'REPAIR rollback restore must filter terminal decision ledger rows through the shared projection view.'
);
assert.match(
  repairCommandBoundarySource,
  /isPendingInteractionProjectionRow[\s\S]*?from\s+['"]\.\/state-delta-gateway\.mjs['"][\s\S]*?pendingInteractions:\s*cloneJson\(current\.runtimeTracking\.pendingInteractions\.filter\(isPendingInteractionProjectionRow\)\)/,
  'REPAIR rollback restore must filter pending interactions through the shared owner projection view.'
);
assert.equal(
  /pendingInteractions:\s*cloneJson\(current\.runtimeTracking\.pendingInteractions\)|endConditionLedger:\s*cloneJson\(current\.runtimeTracking\.endConditionLedger\)/.test(repairCommandBoundarySource),
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
const continuityFactIndexSource = readFileSync(
  new URL('../../src/continuity/fact-index.mjs', import.meta.url),
  'utf8'
);
const continuityDirectorPacketsSource = readFileSync(
  new URL('../../src/continuity/director-packets.mjs', import.meta.url),
  'utf8'
);
const playerSafePromptContextBuilderSource = readFileSync(
  new URL('../../src/generation/player-safe-prompt-context-builder.mjs', import.meta.url),
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
  /createRuntimeLedgerView[\s\S]*?from\s+['"]\.\/runtime-ledger-view\.mjs['"]/,
  'Generic state restore must import the shared CORE-first runtime ledger view.'
);
assert.match(
  stateDeltaGatewaySource,
  /function\s+createCampaignStateSnapshot[\s\S]*?delete\s+snapshot\.directiveRuntimeEvidence[\s\S]*?delete\s+snapshot\.runtimeResume/,
  'State history snapshots must strip transient CORE read-projection evidence and runtime resume cursors.'
);
assert.match(
  stateDeltaGatewaySource,
  /function\s+compactSceneReconciliationSnapshot[\s\S]*?normalizedSceneReconciliationLedger\(input,\s*defaults\)[\s\S]*?sanitizeRuntimeLedgerPayload\(ledger\)[\s\S]*?runs:\s*\[\][\s\S]*?pending:\s*\[\][\s\S]*?chunkCache:\s*\[\][\s\S]*?invalidations:\s*\[\][\s\S]*?function\s+createCampaignStateSnapshot[\s\S]*?snapshot\.sceneReconciliation\s*=\s*compactSceneReconciliationSnapshot\(sceneReconciliationInput,\s*defaults\.sceneReconciliation\)/,
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
  /function\s+commitTrackedCampaignState[\s\S]*?const\s+runtimeLedgerView\s*=\s*createRuntimeLedgerView\(base,\s*\{\s*runtimeOverlay:\s*true\s*\}\)[\s\S]*?const\s+runtimeTrackingLedgers\s*=\s*runtimeTrackingLedgersFromView\(base,\s*runtimeLedgerView,\s*\{[\s\S]*?dropWhenCoreProjectionExists:\s*true[\s\S]*?\}\)[\s\S]*?ingressLedger:\s*runtimeTrackingLedgers\.ingressLedger[\s\S]*?responseLedger:\s*runtimeTrackingLedgers\.responseLedger[\s\S]*?recoveryJournal:\s*runtimeTrackingLedgers\.recoveryJournal/,
  'State commits must drop old runtimeTracking ledger mirrors when CORE projections exist.'
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
  /const\s+RAW_RUNTIME_LEDGER_PAYLOAD_KEYS[\s\S]*?providerPayload[\s\S]*?replacementTextProjectionFields[\s\S]*?function\s+compactRuntimeLedgerRows[\s\S]*?sanitizeRuntimeLedgerPayload[\s\S]*?replacementTextProjectionFields\(entry\)[\s\S]*?ingressLedger:\s*compactRuntimeLedgerRows\(input\.ingressLedger\)[\s\S]*?responseLedger:\s*compactRuntimeLedgerRows\(input\.responseLedger\)/,
  'Runtime tracking initialization must compact ingress/response ledgers instead of cloning raw bridge payloads.'
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
  /function\s+createCampaignStateSnapshot[\s\S]*?lifecycleJournal:\s*\[\][\s\S]*?sceneReconciliation:\s*cloneJson\(defaults\.sceneReconciliation\)[\s\S]*?sceneHandshake:\s*cloneJson\(defaults\.sceneHandshake\)/,
  'State history snapshots must strip scene/lifecycle ledgers so old runtimeTracking does not carry large SRE payloads.'
);
assert.match(
  stateDeltaGatewaySource,
  /DIRECTIVE_MUTABLE_STATE_DOMAINS[\s\S]*['"]sceneReconciliation['"][\s\S]*function\s+initializeCampaignRuntimeTracking[\s\S]*sceneReconciliation:\s*normalizedSceneReconciliationLedger\(sceneReconciliationInput,\s*runtimeTracking\.sceneReconciliation\)/,
  'State gateway must treat sceneReconciliation as a top-level mutable SRE ledger with old runtimeTracking import migration.'
);
assert.match(
  stateDeltaGatewaySource,
  /const\s+materialChange\s*=\s*descriptor\.domains\.some\(\(domain\)\s*=>\s*!\[['"]runtimeTracking['"],\s*['"]sceneReconciliation['"]\]\.includes\(domain\)\)/,
  'Scene Reconciliation ledger writes must not advance mechanics revisions.'
);
assert.match(
  stateDeltaGatewaySource,
  /terminalDecisionLedgerView[\s\S]*?from\s+['"]\.\/terminal-decision-ledger-view\.mjs['"][\s\S]*?function\s+normalizedEndConditionLedger[\s\S]*?terminalDecisionLedgerView\(\s*\{[\s\S]*?endConditionLedger:\s*input/,
  'Runtime tracking initialization must use the shared terminal decision ledger projection view.'
);
assert.match(
  terminalDecisionLedgerViewSource,
  /function\s+isTerminalDecisionProjectionRow[\s\S]*?terminalDecisionProjection[\s\S]*?directive\.terminalEndConditionLedgerProjectionRef\.v1[\s\S]*?rowKind[\s\S]*?terminalDecisionLedgerView[\s\S]*?detections\.filter\(\(entry\)\s*=>\s*isTerminalDecisionProjectionRow\(entry,\s*['"]detection['"]\)\)[\s\S]*?decisions\.filter\(\(entry\)\s*=>\s*isTerminalDecisionProjectionRow\(entry,\s*['"]decision['"]\)\)[\s\S]*?branchRecords\.filter\(\(entry\)\s*=>\s*isTerminalDecisionProjectionRow\(entry,\s*['"]branchRecord['"]\)\)[\s\S]*?continuationFrames\.filter\(\(entry\)\s*=>\s*isTerminalDecisionProjectionRow\(entry,\s*['"]continuationFrame['"]\)\)/,
  'Shared terminal decision ledger view must drop untagged terminal end-condition ledger rows.'
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
  /function\s+isSceneHandshakeProjectionRow[\s\S]*?sreSceneHandshakeProjection[\s\S]*?directive\.sceneHandshakeLedgerProjectionRef\.v1[\s\S]*?function\s+normalizedSceneHandshakeLedger[\s\S]*?settled\.filter\(isSceneHandshakeProjectionRow\)[\s\S]*?pendingInternalReview\.filter\(isSceneHandshakeProjectionRow\)[\s\S]*?lastResult:\s*isSceneHandshakeProjectionRow\(source\.lastResult\)/,
  'Runtime tracking initialization must drop untagged Scene Handshake rows and lastResult.'
);
const recordModelCallEventBody = /export\s+function\s+recordModelCallEvent[\s\S]*?\n\}\n\nexport\s+function\s+recordPendingInteraction/.exec(stateDeltaGatewaySource)?.[0] || '';
assert.equal(
  /metadata:\s*cloneJson|prompt:\s*compact\(event\.prompt\)|response:\s*compact\(event\.response\)|providerPayload/.test(recordModelCallEventBody),
  false,
  'Old model-call fallback rows must not persist arbitrary metadata, raw prompts, raw responses, or provider payloads.'
);
const recordPendingInteractionBody = /export\s+function\s+recordPendingInteraction[\s\S]*?\n\}\n\nfunction\s+pendingInteractionEvidenceStatus/.exec(stateDeltaGatewaySource)?.[0] || '';
const resolvePendingInteractionBody = /export\s+function\s+resolvePendingInteraction[\s\S]*?\n\}\n\nexport\s+function\s+createStateDeltaGateway/.exec(stateDeltaGatewaySource)?.[0] || '';
assert.match(
  stateDeltaGatewaySource,
  /const\s+PENDING_INTERACTION_AUTHORITIES\s*=\s*new\s+Set\(\[[\s\S]*?corePendingInteractionProjection[\s\S]*?terminalDecisionProjection[\s\S]*?repairPendingInteractionProjection/,
  'State delta gateway must define explicit pending-interaction authority owners.'
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
  /function\s+isPendingInteractionProjectionRow[\s\S]*?authority\s*===\s*['"]corePendingInteractionProjection['"][\s\S]*?authority\s*===\s*['"]terminalDecisionProjection['"][\s\S]*?authority\s*===\s*['"]repairPendingInteractionProjection['"][\s\S]*?directive\.pendingInteractionCompatibilityMirror\.v1[\s\S]*?pendingInteractions:\s*\[\]/,
  'Runtime tracking initialization must drop imported pendingInteractions rows; CORE projections own live pending state.'
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
  /function\s+isLifecycleProjectionRow[\s\S]*?authority\s*===\s*['"]runtimeLifecycleProjection['"][\s\S]*?authority\s*===\s*['"]repairLifecycleProjection['"][\s\S]*?directive\.lifecycleCompatibilityMirror\.v1[\s\S]*?lifecycleJournal:\s*Array\.isArray\(input\.lifecycleJournal\)[\s\S]*?input\.lifecycleJournal\.filter\(isLifecycleProjectionRow\)/,
  'Runtime tracking initialization must drop untagged lifecycleJournal rows.'
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
  /lifecycleAuthorityFields\(event[\s\S]*?authority:\s*authority\.authority[\s\S]*?projectionSource:\s*authority\.projectionSource[\s\S]*?compatibilityMirror:\s*authority\.compatibilityMirror/,
  'Lifecycle writes must require owner authority and store projection metadata.'
);
assert.match(
  stateDeltaGatewaySource,
  /function\s+lifecycleAuthorityFields[\s\S]*?DIRECTIVE_LIFECYCLE_AUTHORITY_REQUIRED/,
  'Lifecycle authority helper must fail closed without runtime or REPAIR evidence.'
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
const updateDirectiveResponseBody = /export\s+function\s+updateDirectiveResponse[\s\S]*?\n\}\n\nexport\s+function\s+resolveRecoveryEvent/.exec(stateDeltaGatewaySource)?.[0] || '';
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
  /function\s+isCoreRecoveryProjectionRow[\s\S]*?projectionSource[\s\S]*?coreStoreV2[\s\S]*?directive\.coreRecoveryCompatibilityMirror\.v1/,
  'Runtime tracking initialization must keep only explicit CORE recovery projection rows.'
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
assert.match(
  stateDeltaGatewaySource,
  /function\s+resolveRecoveryEvent[\s\S]*?if\s*\(\s*!id\s*\)\s*return\s+campaignState[\s\S]*?return\s+campaignState/,
  'Old recovery resolver must not mutate any runtimeTracking.recoveryJournal rows.'
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
  /function\s+updateDirectiveResponse\(campaignState,\s*responseId,\s*patch\s*=\s*\{\},\s*\{[\s\S]*?allowHostMessageIdMatch\s*=\s*false[\s\S]*?compact\(entry\.responseId\)\s*!==\s*id[\s\S]*?!\(allowHostMessageIdMatch\s*===\s*true\s*&&\s*compact\(entry\.hostMessageId\)\s*===\s*id\)/,
  'Response update writer must not match positional SillyTavern hostMessageId unless the caller explicitly opts in.'
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
  /function\s+coreStoreProjectionRows[\s\S]*?projectionSource[\s\S]*?coreStoreV2[\s\S]*?compatibilityProjectionUnavailable[\s\S]*?function\s+coreStoreReadProjectionsFromLoadedArtifacts[\s\S]*?runtimeAuthority:\s*['"]coreStoreV2['"][\s\S]*?ingressLedger:\s*projectionArray\(coreStoreProjectionRows\(runtimeProjections\.ingressLedger\)\)[\s\S]*?responseLedger:\s*projectionArray\(coreStoreProjectionRows\(runtimeProjections\.responseLedger\)\)[\s\S]*?recoveryJournal:\s*projectionArray\(coreStoreProjectionRows\(runtimeProjections\.recoveryJournal\)\)/,
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
const loadActiveCampaignStateV2Body = /export\s+async\s+function\s+loadActiveCampaignStateV2[\s\S]*?\n\}\n\nexport\s+async\s+function\s+recoverActiveCampaignStateV2/.exec(activeSaveFacadeSource)?.[0] || '';
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
assert.match(
  transactionStoreV2Source,
  /createRuntimeLedgerView[\s\S]*?from\s+['"]\.\.\/runtime\/runtime-ledger-view\.mjs['"]/,
  'Transaction-store v2 legacy import must use the shared CORE-first runtime ledger view.'
);
assert.match(
  transactionStoreV2Source,
  /function\s+legacyHostRows[\s\S]*?const\s+runtimeLedgerView\s*=\s*createRuntimeLedgerView\(campaignState\)[\s\S]*?const\s+ingressRows\s*=\s*Array\.isArray\(runtimeLedgerView\.ingressLedger\)[\s\S]*?const\s+responseRows\s*=\s*Array\.isArray\(runtimeLedgerView\.responseLedger\)/,
  'Transaction-store v2 host-map import must not build rows from raw old runtimeTracking ledgers.'
);
assert.match(
  transactionStoreV2Source,
  /function\s+legacyEvents[\s\S]*?const\s+runtimeLedgerView\s*=\s*createRuntimeLedgerView\(campaignState\)[\s\S]*?const\s+ingressRows\s*=\s*Array\.isArray\(runtimeLedgerView\.ingressLedger\)[\s\S]*?const\s+responseRows\s*=\s*Array\.isArray\(runtimeLedgerView\.responseLedger\)/,
  'Transaction-store v2 event import must not segment raw old runtimeTracking ledgers.'
);
assert.match(
  transactionStoreV2Source,
  /function\s+legacyRuntimeModelCallRows[\s\S]*?readRuntimeCoreProjections\(campaignState\)[\s\S]*?modelCallDiagnostics[\s\S]*?runtimeModelCallProjected/,
  'Transaction-store v2 model-call import must use CORE modelCallDiagnostics projections.'
);
const legacyRuntimeModelCallRowsBody = /function\s+legacyRuntimeModelCallRows[\s\S]*?\n\}/.exec(transactionStoreV2Source)?.[0] || '';
assert.equal(
  /modelCallJournal|legacyModelCallImported/.test(legacyRuntimeModelCallRowsBody),
  false,
  'Transaction-store v2 model-call import must fail closed instead of importing old modelCallJournal rows.'
);
assert.match(
  transactionStoreV2Source,
  /function\s+legacyRuntimeSidecarRows[\s\S]*?readRuntimeCoreProjections\(campaignState\)[\s\S]*?sidecarDiagnostics[\s\S]*?backgroundBatches[\s\S]*?runtimeSidecarDiagnosticProjected[\s\S]*?runtimeBackgroundBatchProjected/,
  'Transaction-store v2 sidecar import must prefer CORE sidecar/background projections over old sidecarJournal rows.'
);
const legacyRuntimeSidecarRowsBody = /function\s+legacyRuntimeSidecarRows[\s\S]*?\n\}/.exec(transactionStoreV2Source)?.[0] || '';
assert.equal(
  /sidecarJournal|legacySidecarImported/.test(legacyRuntimeSidecarRowsBody),
  false,
  'Transaction-store v2 sidecar import must fail closed instead of importing old sidecarJournal rows.'
);
const legacyHostRowsBody = /function\s+legacyHostRows[\s\S]*?\n\}[\s\S]*?\n\nfunction\s+legacyEvents/.exec(transactionStoreV2Source)?.[0] || '';
const legacyEventsBody = /function\s+legacyEvents[\s\S]*?\n\}[\s\S]*?\n\nfunction\s+legacyTurnEntries/.exec(transactionStoreV2Source)?.[0] || '';
const legacyDiagnosticsBody = /function\s+legacyDiagnostics[\s\S]*?\n\}[\s\S]*?\n\nfunction\s+legacyImportCheckpoints/.exec(transactionStoreV2Source)?.[0] || '';
assert.equal(
  /runtimeTracking\.(ingressLedger|responseLedger)/.test(`${legacyHostRowsBody}\n${legacyEventsBody}`),
  false,
  'Transaction-store v2 legacy import host/events must not read raw old runtimeTracking ingress/response rows.'
);
assert.equal(
  /runtimeTracking\.sidecarJournal/.test(legacyDiagnosticsBody),
  false,
  'Transaction-store v2 diagnostics import must not read old sidecarJournal directly; use legacyRuntimeSidecarRows CORE-first selector.'
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
assert.match(
  runtimeLedgerViewSource,
  /function\s+legacyProjectionFallbackRows\s*\(rows\s*=\s*\[\]\)[\s\S]*?return\s+legacy\.filter\(\(row\)\s*=>\s*isTaggedCompatibilityProjection\(row\)\)/,
  'Runtime ledger view must suppress silent old ingress/response rows even when no CORE projections exist.'
);
assert.equal(
  /function\s+legacyProjectionFallbackRows[\s\S]*?!coreProjectionAvailable[\s\S]*?return\s+legacy/.test(runtimeLedgerViewSource),
  false,
  'Runtime ledger view must not expose no-CORE silent old rows as fallback authority.'
);
assert.match(
  runtimeLedgerViewSource,
  /function\s+isTaggedCompatibilityProjection[\s\S]*?authority\s*===\s*['"]compatibilityProjectionUnavailable['"][\s\S]*?return\s+false/,
  'Runtime ledger view must quarantine missing-CORE compatibility projection rows instead of surfacing them as fallback authority.'
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
assert.match(
  runtimeLedgerViewSource,
  /campaignState\?\.directiveRuntimeEvidence\?\.coreStoreReadProjections[\s\S]*?campaignState\?\.runtimeTracking\?\.directiveRuntimeEvidence\?\.coreStoreReadProjections/,
  'Runtime ledger view must accept top-level and runtimeTracking-nested CORE projection evidence.'
);
assert.match(
  runtimeLedgerViewSource,
  /runtimeOverlay\s*=\s*false[\s\S]*?const\s+allowRuntimeOverlay\s*=\s*authoritative\s*&&\s*runtimeOverlay\s*===\s*true[\s\S]*?authoritative:\s*authoritative\s*&&\s*!allowRuntimeOverlay/,
  'Runtime ledger view must keep authoritative CORE strict by default while allowing explicit hot runtime overlays.'
);
assert.match(
  runtimeLedgerViewSource,
  /legacyFallback\s*=\s*false[\s\S]*?const\s+useLegacyFallback\s*=\s*legacyFallback\s*===\s*true\s*\|\|\s*runtimeOverlay\s*===\s*true[\s\S]*?const\s+legacyIngress\s*=\s*useLegacyFallback[\s\S]*?const\s+legacyResponse\s*=\s*useLegacyFallback/,
  'Runtime ledger view must default to no legacy ingress/response fallback and require explicit legacyFallback/runtimeOverlay opt-in.'
);
assert.match(
  runtimeLedgerViewSource,
  /export\s+async\s+function\s+createRuntimeLedgerViewAsync\b[\s\S]*?await\s+readRuntimeCoreProjectionsAsync/,
  'Runtime ledger view must provide an async CORE projection path for runtime-app CORE facades.'
);
assert.match(
  turnCommitCoordinatorSource,
  /createRuntimeLedgerView[\s\S]*?from\s+['"]\.\/runtime-ledger-view\.mjs['"]/,
  'Turn commit coordinator must import the shared CORE-first runtime ledger view.'
);
assert.match(
  turnCommitCoordinatorSource,
  /function\s+findIngressById[\s\S]*?createRuntimeLedgerView\(campaignState\s*\|\|\s*\{\},\s*\{\s*runtimeOverlay:\s*true\s*\}\)\.ingressLedger\s*\|\|\s*\[\]/,
  'Turn commit coordinator mechanics transaction lookup must use CORE-first runtime ledger view with hot overlay.'
);
assert.equal(
  /function\s+findIngressById[\s\S]*?runtimeTracking\?\.ingressLedger/.test(turnCommitCoordinatorSource),
  false,
  'Turn commit coordinator mechanics transaction lookup must not read raw runtimeTracking.ingressLedger.'
);
assert.match(
  continuityDiagnosticsSource,
  /createRuntimeLedgerView[\s\S]*?from\s+['"]\.\.\/runtime\/runtime-ledger-view\.mjs['"]/,
  'Continuity diagnostics must import the shared CORE-first runtime ledger view.'
);
assert.match(
  continuityDiagnosticsSource,
  /function\s+latestContinuityReview[\s\S]*?const\s+runtimeLedgerView\s*=\s*createRuntimeLedgerView\(campaignState\s*\|\|\s*\{\}\)[\s\S]*?runtimeLedgerView\.recoveryJournal[\s\S]*?runtimeLedgerView\.responseLedger/,
  'Continuity diagnostics latest review must read response/recovery rows through CORE-first runtime ledger view.'
);
const latestContinuityReviewBody = /function\s+latestContinuityReview[\s\S]*?\n\}[\s\S]*?\n\nfunction\s+promptKeyStatus/.exec(continuityDiagnosticsSource)?.[0] || '';
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
  sceneHandshakeSettlerSource,
  /createRuntimeLedgerView[\s\S]*?from\s+['"]\.\/runtime-ledger-view\.mjs['"]/,
  'Scene Handshake snapshot safety must import the shared CORE-first runtime ledger view.'
);
assert.match(
  sceneHandshakeSettlerSource,
  /function\s+buildSceneHandshakeSnapshot[\s\S]*?const\s+runtimeLedgerView\s*=\s*createRuntimeLedgerView\(state,\s*\{\s*runtimeOverlay:\s*true\s*\}\)[\s\S]*?pendingRecoveryCount:\s*asArray\(runtimeLedgerView\.recoveryJournal\)/,
  'Scene Handshake pending recovery safety must read CORE recovery projections instead of raw old recoveryJournal rows.'
);
assert.equal(
  /pendingRecoveryCount:\s*asArray\(state\.runtimeTracking\?\.recoveryJournal\)/.test(sceneHandshakeSettlerSource),
  false,
  'Scene Handshake snapshot safety must not count raw old runtimeTracking.recoveryJournal rows.'
);
assert.match(
  sceneHandshakeSettlerSource,
  /function\s+sceneHandshakeLedgerAuthority[\s\S]*?sreSceneHandshakeProjection[\s\S]*?directive\.sceneHandshakeLedgerProjectionRef\.v1[\s\S]*?function\s+sceneHandshakeLedgerRecord[\s\S]*?authority:\s*authority\.authority[\s\S]*?projectionSource:\s*authority\.projectionSource[\s\S]*?compatibilityMirror:\s*authority\.compatibilityMirror/,
  'Scene Handshake settlement ledger rows must carry compact SRE owner projection evidence.'
);
assert.match(
  sceneHandshakeSettlerSource,
  /export\s+async\s+function\s+runLatestPairSourceSettlement[\s\S]*?allowLegacySceneHandshakeFallback:\s*false/,
  'Latest-pair source-settlement owner must disable legacy Scene Handshake fallback.'
);
assert.equal(
  /\brunSceneHandshakeSettlement\b/.test(sourceSettlementLatestPairSource),
  false,
  'Source-settlement latest-pair owner module must not call the legacy runSceneHandshakeSettlement entrypoint.'
);
assert.match(
  sourceSettlementLatestPairSource,
  /\brunLatestPairSourceSettlement\b/,
  'Source-settlement latest-pair owner module must use the strict latest-pair settlement entrypoint.'
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
  /createChatTurnOrchestrator\(\{[\s\S]*?enableDefaultLatestPairSettlementProvider:\s*false[\s\S]*?\}\)/,
  'Production runtime-app chat-turn wiring must keep the optional source-settlement latest-pair provider behind an explicit live-stability gate.'
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
assert.equal(
  /modelCallJournalEntries\s*>\s*candidate\.modelCallJournalEntries|candidate\.modelCallJournalEntries\s*>\s*inMemory\.modelCallJournalEntries/.test(shouldPreferInMemoryCampaignStateBody),
  false,
  'Runtime-app freshness arbitration must not prefer state based only on old modelCallJournal growth.'
);
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
  /function\s+runtimeIngressForContext[\s\S]*?const\s+ledger\s*=\s*createRuntimeLedgerView\(campaignState\s*\|\|\s*\{\},\s*\{\s*runtimeOverlay:\s*true\s*\}\)\.ingressLedger\s*\|\|\s*\[\]/,
  'Runtime-app ingress context lookup must use the shared CORE-first runtime ledger view with explicit hot runtime overlay.'
);
assert.match(
  runtimeAppSource,
  /function\s+runtimeResponseForContext[\s\S]*?const\s+ledger\s*=\s*createRuntimeLedgerView\(campaignState\s*\|\|\s*\{\},\s*\{\s*runtimeOverlay:\s*true\s*\}\)\.responseLedger\s*\|\|\s*\[\]/,
  'Runtime-app response context lookup must use the shared CORE-first runtime ledger view with explicit hot runtime overlay.'
);
assert.match(
  runtimeAppSource,
  /function\s+responseRowsForFresherMerge[\s\S]*?const\s+projections\s*=\s*readRuntimeCoreProjections\(state\s*\|\|\s*\{\}\)[\s\S]*?Array\.isArray\(projections\.responseLedger\)/,
  'Runtime-app fresher response merge must source rows from CORE read projections, not old runtimeTracking response ledgers.'
);
assert.match(
  runtimeAppSource,
  /function\s+mergeFresherResponseLedgerProjection[\s\S]*?coreStoreReadProjections[\s\S]*?responseLedger/,
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
  /responseLedgerRevision\s*=\s*Math\.max\([\s\S]*?candidateEvidence\.responseLedgerRevision[\s\S]*?memoryEvidence\.responseLedgerRevision[\s\S]*?coreStoreReadProjections:[\s\S]*?responseLedgerRevision,[\s\S]*?responseLedger/,
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
const responseProjectionMergeKeysBody = /function\s+responseProjectionMergeKeys[\s\S]*?\n\}/.exec(runtimeAppSource)?.[0] || '';
assert.equal(
  /hostMessageId/.test(responseProjectionMergeKeysBody),
  false,
  'Runtime-app fresher response merge must not match response projections solely by hostMessageId.'
);
assert.match(
  runtimeAppSource,
  /async\s+function\s+forgeSourceCurrentForRuntime[\s\S]*?let\s+ledger\s*=\s*createRuntimeLedgerView\(tracked\s*\|\|\s*\{\},\s*\{\s*runtimeOverlay:\s*true\s*\}\)\.ingressLedger\s*\|\|\s*\[\][\s\S]*?runtimeCoreTurnStore\?\.readProjections[\s\S]*?projections\?\.ingressLedger[\s\S]*?ledger\s*=\s*projections\.ingressLedger/,
  'Runtime-app FORGE source-current checks must use the shared CORE-first runtime ledger view plus live CORE projections with explicit hot runtime overlay.'
);
const forgeSourceCurrentForRuntimeBody = /function\s+forgeSourceCurrentForRuntime[\s\S]*?\n  \}/.exec(runtimeAppSource)?.[0] || '';
assert.equal(
  /runtimeTracking\?\.ingressLedger/.test(forgeSourceCurrentForRuntimeBody),
  false,
  'Runtime-app FORGE source-current checks must not read raw runtimeTracking.ingressLedger.'
);
assert.match(
  runtimeAppSource,
  /function\s+coreDiagnosticTargetForModelCall[\s\S]*?createRuntimeLedgerView\(tracked\s*\|\|\s*\{\},\s*\{\s*runtimeOverlay:\s*true\s*\}\)\.ingressLedger\s*\|\|\s*\[\]/,
  'Runtime-app model-call CORE diagnostic target lookup must use the shared CORE-first runtime ledger view with explicit hot runtime overlay.'
);
const coreDiagnosticTargetForModelCallBody = /function\s+coreDiagnosticTargetForModelCall[\s\S]*?\n  \}/.exec(runtimeAppSource)?.[0] || '';
assert.equal(
  /runtimeTracking\?\.ingressLedger/.test(coreDiagnosticTargetForModelCallBody),
  false,
  'Runtime-app model-call CORE diagnostic target lookup must not read raw runtimeTracking.ingressLedger.'
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
  /function\s+pendingInteractionProjectionRows[\s\S]*?readRuntimeCoreProjections\(state\s*\|\|\s*\{\}\)[\s\S]*?projections\.pendingInteractions[\s\S]*?runtimeTracking\?\.pendingInteractions[\s\S]*?function\s+chatNativeViewForState[\s\S]*?pendingInteractions:\s*cloneJson\(pendingInteractionProjectionRows\(state\)\)/,
  'Runtime-app chatNative view must expose CORE pending interaction projections before any legacy mirror rows.'
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
assert.match(
  runtimeAppSource,
  /function\s+compatibilityRowsThatCanBlockCoreAuthority[\s\S]*?coreRows[\s\S]*?authority\s*===\s*['"]compatibilityProjectionUnavailable['"]\)\s*return\s+false[\s\S]*?row\?\.compatibilityMirror[\s\S]*?projectionSource/,
  'Runtime-app CORE authority marker must ignore silent old rows and missing-CORE quarantine mirrors once CORE projections exist, while keeping real tagged compatibility blockers.'
);
assert.match(
  runtimeAppSource,
  /function\s+coreProjectionHasRuntimeAuthority[\s\S]*?const\s+ingressRows\s*=\s*Array\.isArray\(projections\.ingressLedger\)[\s\S]*?const\s+responseRows\s*=\s*Array\.isArray\(projections\.responseLedger\)[\s\S]*?compatibilityRowsThatCanBlockCoreAuthority\(runtimeTracking\.ingressLedger,\s*ingressRows\)[\s\S]*?compatibilityRowsThatCanBlockCoreAuthority\(runtimeTracking\.responseLedger,\s*responseRows\)/,
  'Runtime-app CORE authority coverage must check only tagged compatibility blocker rows for ingress/response coverage.'
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
const transactionStateSource = readFileSync(
  new URL('../../src/campaign/transaction-state.mjs', import.meta.url),
  'utf8'
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
  /recordPendingInteraction|resolvePendingInteraction|runtimeTracking\.pendingInteractions\s*=/.test(campaignEndConditionServiceSource),
  false,
  'End-condition service must not store terminal outcome decisions as durable pendingInteractions rows.'
);
assert.match(
  campaignEndConditionServiceSource,
  /isPendingInteractionProjectionRow[\s\S]*?from\s+['"]\.\/state-delta-gateway\.mjs['"][\s\S]*?function\s+activeTerminalInteraction[\s\S]*?pendingInteractions\s*\|\|\s*\[\]\)\.filter\(isPendingInteractionProjectionRow\)/,
  'End-condition service terminal pending reads must filter through shared owner projection predicate.'
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
assert.match(
  runtimeAppSource,
  /function\s+pendingTerminalDecisionId[\s\S]*?pendingInteractions\s*\|\|\s*\[\]\)\.filter\(isPendingInteractionProjectionRow\)[\s\S]*?function\s+terminalDecisionStillPending[\s\S]*?pendingInteractions\s*\|\|\s*\[\]\)\.filter\(isPendingInteractionProjectionRow\)/,
  'Runtime-app terminal freshness preservation must not derive pending decisions from unowned pendingInteraction rows.'
);
assert.match(
  chatTurnOrchestratorSource,
  /terminalDecisionLedgerView[\s\S]*?from\s+['"]\.\/terminal-decision-ledger-view\.mjs['"][\s\S]*?function\s+ledgerTerminalInteraction[\s\S]*?terminalDecisionLedgerView\(state\s*\|\|\s*\{\}\)/,
  'Chat-turn terminal decision fallback must use the shared terminal ledger projection view.'
);
assert.match(
  chatTurnOrchestratorSource,
  /function\s+pendingInteractionRows[\s\S]*?corePendingInteractionRows\(state\)[\s\S]*?runtimeTracking\?\.pendingInteractions[\s\S]*?function\s+activePendingInteraction[\s\S]*?pendingInteractionRows\(state\)[\s\S]*?function\s+activeTerminalInteractionId[\s\S]*?pendingInteractionRows\(state\)[\s\S]*?async\s+function\s+resolveInteraction[\s\S]*?pendingInteractionRows\(state\)/,
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
  'Scene Reconciliation message anchors must find ingress rows through CORE-first runtime ledger view.'
);
assert.match(
  sceneReconciliationSource,
  /function\s+outcomeIdsForRange[\s\S]*?const\s+runtimeLedgerView\s*=\s*createRuntimeLedgerView\(state\s*\|\|\s*\{\}\)[\s\S]*?runtimeLedgerView\.ingressLedger[\s\S]*?runtimeLedgerView\.responseLedger/,
  'Scene Reconciliation range outcome lookup must use CORE-first runtime ledger view.'
);
assert.match(
  sceneReconciliationSource,
  /function\s+coreTransactionIdForMessage[\s\S]*?createRuntimeLedgerView\(state\s*\|\|\s*\{\}\)\.ingressLedger/,
  'Scene Reconciliation SRE transaction lookup must use CORE-first runtime ledger view.'
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
  /function\s+ingressById[\s\S]*?createRuntimeLedgerView\(campaignState\s*\|\|\s*\{\},\s*\{\s*runtimeOverlay:\s*true\s*\}\)\.ingressLedger/,
  'Campaign sidecar scheduler source snapshots must use the CORE-first runtime ledger view with hot runtime overlay.'
);
assert.match(
  campaignSidecarSchedulerSource,
  /createRuntimeLedgerView[\s\S]*?from\s+['"]\.\.\/runtime\/runtime-ledger-view\.mjs['"]/,
  'Campaign sidecar scheduler source ingress lookup must import the shared CORE-first runtime ledger view.'
);
assert.match(
  campaignSidecarSchedulerSource,
  /function\s+ingressById\(campaignState,\s*ingressId\)[\s\S]*?createRuntimeLedgerView\(campaignState\s*\|\|\s*\{\},\s*\{\s*runtimeOverlay:\s*true\s*\}\)\.ingressLedger/,
  'Campaign sidecar scheduler source ingress lookup must use CORE-first runtime ledger view with hot overlay.'
);
assert.equal(
  /runtimeTracking\?\.ingressLedger/.test(campaignSidecarSchedulerSource),
  false,
  'Campaign sidecar scheduler must not read raw runtimeTracking.ingressLedger for source snapshots.'
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
assert.match(
  runtimeAppSource,
  /proposeCorrectAsSwipeCandidate[\s\S]*?updateResponse:\s*\(latest,\s*responseUpdateId,\s*correctionCase\)\s*=>\s*\{[\s\S]*?const\s+projectedResponse\s*=\s*\(createRuntimeLedgerView\(tracked\)\.responseLedger\s*\|\|\s*\[\]\)\.find[\s\S]*?const\s+hasCompatibilityResponseRow\s*=\s*Boolean\(projectedResponse[\s\S]*?projectedResponse\.authority[\s\S]*?projectedResponse\.compatibilityMirror[\s\S]*?projectedResponse\.projectionSource[\s\S]*?const\s+currentResponse\s*=\s*projectedResponse\s*\|\|\s*findOutcomeIntegrityResponse\(tracked,\s*responseUpdateId\)\s*\|\|\s*response/,
  'Runtime-app Correct-as-Swipe candidate append must decide record/update from CORE-first projection metadata instead of raw responseLedger rows.'
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
  /settleCorrectAsSwipeCase\(payload[\s\S]*?updateResponse:\s*\(latest,\s*responseUpdateId,\s*correctionCase\)\s*=>\s*\{[\s\S]*?const\s+projectedResponse\s*=\s*\(createRuntimeLedgerView\(tracked\)\.responseLedger\s*\|\|\s*\[\]\)\.find[\s\S]*?const\s+hasCompatibilityResponseRow\s*=\s*Boolean\(projectedResponse[\s\S]*?projectedResponse\.authority[\s\S]*?projectedResponse\.compatibilityMirror[\s\S]*?projectedResponse\.projectionSource[\s\S]*?const\s+currentResponse\s*=\s*projectedResponse\s*\|\|\s*findOutcomeIntegrityResponse\(tracked,\s*responseUpdateId\)\s*\|\|\s*response[\s\S]*?action:\s*['"]caseLifecycleUpdated['"]/,
  'Runtime-app Correct-as-Swipe lifecycle must decide record/update from CORE-first projection metadata instead of raw responseLedger rows.'
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
assert.match(
  responseDispatcherSource,
  /createRuntimeLedgerViewAsync[\s\S]*?findLedgerIngressAsync[\s\S]*?findLedgerRecoveryAsync[\s\S]*?findLedgerResponseAsync[\s\S]*?from\s+['"]\.\/runtime-ledger-view\.mjs['"]/,
  'ResponseDispatcher must use the shared async CORE-first runtime ledger view for ingress/response/recovery lookup.'
);
assert.match(
  chatTurnOrchestratorSource,
  /createRuntimeLedgerView[\s\S]*?createRuntimeLedgerViewAsync[\s\S]*?from\s+['"]\.\/runtime-ledger-view\.mjs['"]/,
  'ChatTurnOrchestrator response retry lookup must use the shared async CORE-first runtime ledger view.'
);
assert.match(
  chatTurnOrchestratorSource,
  /function\s+responseEntryForMessage[\s\S]*?const\s+responseRows\s*=\s*createRuntimeLedgerView\(state\s*\|\|\s*\{\},\s*\{\s*runtimeOverlay:\s*true\s*\}\)\.responseLedger\s*\|\|\s*\[\]/,
  'ChatTurnOrchestrator assistant-swipe response lookup must use the shared CORE-first runtime ledger view.'
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
  /async\s+function\s+findIngressAlias[\s\S]*?await\s+runtimeLedgerViewFresh\(\{\s*\.\.\.state,\s*runtimeTracking:\s*tracking\s*\},\s*\{\s*runtimeOverlay:\s*true\s*\}\)[\s\S]*?\.ingressLedger/,
  'ChatTurnOrchestrator ingress alias lookup must use async CORE-first runtime ledger view.'
);
assert.match(
  chatTurnOrchestratorSource,
  /async\s+function\s+findIngressByHostMessageId[\s\S]*?await\s+runtimeLedgerViewFresh\(\{\s*\.\.\.state,\s*runtimeTracking:\s*tracking\s*\},\s*\{\s*runtimeOverlay:\s*true\s*\}\)[\s\S]*?\.ingressLedger/,
  'ChatTurnOrchestrator host-message duplicate lookup must use async CORE-first runtime ledger view.'
);
assert.match(
  chatTurnOrchestratorSource,
  /async\s+function\s+stateWithIngressFromFallback[\s\S]*?await\s+findIngressFresh\(next,\s*ingressId,\s*\{\s*runtimeOverlay:\s*true\s*\}\)[\s\S]*?fallbackHasCoreEvidence[\s\S]*?authority\s*===\s*['"]compatibilityProjection['"][\s\S]*?projectionSource\s*===\s*['"]coreStoreV2['"][\s\S]*?if\s*\(\s*!fallbackHasCoreEvidence\)\s*return\s+next[\s\S]*?recordTurnIngress\(next,\s*fallbackIngress,\s*\{[\s\S]*?missingCoreWriteMode:\s*['"]reject['"]/,
  'ChatTurnOrchestrator fallback ingress recreation must await CORE projection evidence and reject missing-CORE old-ledger writes.'
);
assert.match(
  chatTurnOrchestratorSource,
  /async\s+function\s+pendingInteractionAuthorityForIngress\(state,\s*ingressId,\s*interactionId\)[\s\S]*?const\s+authorityState\s*=\s*await\s+stateWithIngressFromFallback\(state,\s*state,\s*ingressId\)[\s\S]*?runtimeLedgerViewFresh\(authorityState,\s*\{\s*runtimeOverlay:\s*true\s*\}\)[\s\S]*?await\s+findIngressFresh\(authorityState,\s*ingressId,\s*\{\s*runtimeOverlay:\s*true\s*\}\)[\s\S]*?ingress\.coreTransactionId[\s\S]*?ingress\.transactionId[\s\S]*?authority:\s*['"]corePendingInteractionProjection['"]/,
  'ChatTurnOrchestrator pending-interaction authority must prefer authoritative async CORE ingress, accept transactionId aliases, then hydrated fallback before writing pause/review compatibility rows.'
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
assert.equal(
  /runtimeTracking\?\.(ingressLedger|responseLedger)|runtimeTracking\.(ingressLedger|responseLedger)/.test(chatTurnOrchestratorSource),
  false,
  'ChatTurnOrchestrator must not read raw runtimeTracking ingress/response ledgers in hot turn/retry paths.'
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
  /function\s+reobserveHostGenerationCompletions[\s\S]*?const\s+runtimeLedgerView\s*=\s*await\s+createRuntimeLedgerViewAsync\(state,\s*\{\s*coreTurnStore,\s*runtimeOverlay:\s*true\s*\}\)[\s\S]*?const\s+responseLedger\s*=\s*runtimeLedgerView\.responseLedger\s*\|\|\s*\[\]/,
  'ResponseDispatcher host-generation reobserve must scan responses through the CORE-first runtime ledger view.'
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
assert.equal(
  /tracking\.responseLedger|runtimeTracking\?\.responseLedger|runtimeTracking\.responseLedger/.test(responseDispatcherSource),
  false,
  'ResponseDispatcher reobserve must not scan raw runtimeTracking.responseLedger rows.'
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
  /if\s*\(\s*coreDiagnostic\s*\)\s*return\s+campaignState;/,
  'ResponseDispatcher diagnostic-only compatibility paths must leave old responseLedger state unchanged.'
);
assert.match(
  responseDispatcherSource,
  /function\s+requireCoreResponseProjection[\s\S]*?DIRECTIVE_CORE_RESPONSE_PROJECTION_REQUIRED[\s\S]*?recordDirectiveResponseCompatibility[\s\S]*?requireCoreResponseProjection\(entry,\s*\{\s*mirroredOperation\s*\}\)[\s\S]*?updateDirectiveResponseCompatibility[\s\S]*?requireCoreResponseProjection\(entry,\s*\{\s*mirroredOperation\s*\}\)/,
  'ResponseDispatcher compatibility helper must fail closed when CORE response projection evidence is missing.'
);
assert.match(
  responseDispatcherSource,
  /function\s+readCoreResponseProjectionFor[\s\S]*?entry\.coreRecovery\?\.status[\s\S]*?entry\.coreRecovery\?\.transactionId[\s\S]*?recoveryStatus/,
  'ResponseDispatcher provider-failure response retry rows must be allowed from CORE recovery projection evidence, not synthetic missing-projection fallback.'
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
assert.match(
  chatTurnOrchestratorSource,
  /for\s*\(\s*const\s+recovery\s+of\s+\(await\s+runtimeLedgerViewFresh\(next\)\)\.recoveryJournal\s*\|\|\s*\[\]\s*\)[\s\S]*?shouldResolveNoOutcomeRecoveryOnReobserve/,
  'ChatTurnOrchestrator no-outcome reobserve recovery resolution must await CORE-first recovery projections.'
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
  /function\s+responseRetryRecoveryFromCoreProjection[\s\S]*?const\s+recoveryView\s*=\s*await\s+runtimeLedgerViewFresh\(state,\s*\{\s*legacyFallback:\s*false\s*\}\)[\s\S]*?const\s+compatibilityView\s*=\s*await\s+runtimeLedgerViewFresh\(state,\s*\{\s*runtimeOverlay:\s*true\s*\}\)[\s\S]*?const\s+recoveryRows\s*=\s*recoveryView\.recoveryJournal/,
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
assert.match(
  chatTurnOrchestratorSource,
  /async\s+function\s+retryCommittedResponse[\s\S]*?await\s+runtimeLedgerViewFresh\(state\)[\s\S]*?\.recoveryJournal[\s\S]*?entry\.id\s*===\s*recovery\.id[\s\S]*?resolveRecoveryEvent\(state,\s*recovery\.id/,
  'Committed response retry resolution must await fresh CORE recovery projections before closing recovery.'
);
assert.match(
  chatTurnOrchestratorSource,
  /async\s+function\s+retryProviderFailureResponse[\s\S]*?await\s+runtimeLedgerViewFresh\(next\)[\s\S]*?\.recoveryJournal[\s\S]*?entry\.id\s*===\s*recovery\.id[\s\S]*?resolveRecoveryEvent\(next,\s*recovery\.id/,
  'Provider-failure response retry resolution must await fresh CORE recovery projections before closing recovery.'
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
    restoreRevision: 12
  },
  legacyProjection: {
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
        }]
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
    restoreRevision: 12
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
assert.equal(rollbackPrevalidationCalls.length, rollbackPrevalidationCallsAfterDemotion, 'CORE rollback actuation must not be recorded for history-only rollback.');

console.log('Architecture redesign system skeleton contract tests passed');
