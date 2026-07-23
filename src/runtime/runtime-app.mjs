import {
  pruneTurnSaveHistory,
  recordNarrationFailure,
  recordNarrationSuccess
} from '../campaign/transaction-state.mjs';
import {
  cancelReadiedCommandBearingPoint,
  migrateCommandBearingState,
  projectCommandBearingForPlayer,
  readyCommandBearingPoint,
  recoverCommandBearing
} from '../command/command-bearing.mjs';
import { generateNarrationFromTurn } from '../generation/narration.mjs';
import { createGenerationRouter } from '../generation/generation-router.mjs';
import {
  createPlayerSafeCampaignProjection,
  recordPromptContextRevision
} from '../generation/player-safe-prompt-context-builder.mjs';
import { resolveDirectiveNarrationContext } from '../generation/narration-context.mjs';
import { prefixCampaignReplyHeader } from '../time/campaign-time-header.mjs';
import { normalizeCampaignTimeState } from '../time/campaign-time-state.mjs';
import { classifyChatTurn } from '../adjudication/utility-turn-classifier.mjs';
import { arbitrateChatTurn } from '../adjudication/utility-turn-arbiter.mjs';
import {
  addMissionComponent,
  archiveMissionComponent as archiveMissionComponentRecord,
  findMissionComponent,
  matchMissionComponentSourceText,
  missionComponentsState,
  prepareMissionComponentSelection,
  updateMissionComponent as updateMissionComponentRecord
} from './mission-components.mjs';
import { prepareDefineSelection } from './define-selection.mjs';
import { createCampaignSidecarScheduler } from '../jobs/campaign-sidecar-scheduler.mjs';
import { createForgeCoordinator } from '../jobs/forge-coordinator.mjs';
import { assertDirectiveHost } from '../hosts/host-contract.mjs';
import { runDirectiveAssist as runDirectiveAssistService } from '../assist/directive-assist.mjs';
import { createPlayerPortraitUpload } from '../media/player-portrait-assets.mjs';
import { runCommandLogSummarySidecar } from '../jobs/command-log-summary-sidecar.mjs';
import { createRuntimePersistCoordinator } from './runtime-persist-coordinator.mjs';
import { normalizeCampaignPackageZip } from '../packages/campaign-package-importer.mjs';
import {
  abandonQuest,
  acceptQuest,
  delegateQuest,
  offerQuest,
  openWorldQuestView,
  pauseForegroundQuest,
  rankQuestOpportunities,
  refreshQuestAvailability
} from '../quests/quest-director.mjs';
import {
  chooseForegroundQuest,
  timeAdvanceBoundary,
  travelBoundary
} from '../directors/director-coordinator.mjs';
import {
  listImportedCampaignPackageRecords,
  deletePlayerPortraitAsset,
  storePlayerPortraitAsset,
  storeImportedCampaignPackageRecord,
  loadDirectiveUiPreferences,
  saveDirectiveUiPreferences
} from '../storage/directive-storage-repository.mjs';
import { listManualCheckpoints } from '../storage/manual-checkpoint-records.mjs';
import { createCampaignStartController } from './campaign-start-controller.mjs';
import { createManualCheckpointService } from './manual-checkpoint-service.mjs';
import { createCampaignActivationCoordinator } from './campaign-activation-coordinator.mjs';
import { createCampaignConclusionService } from './campaign-conclusion-service.mjs';
import { createCampaignEndConditionService } from './campaign-end-condition-service.mjs';
import { createChatTurnOrchestrator } from './chat-turn-orchestrator.mjs';
import { createNarrativeThreadDirector } from '../directors/narrative-thread-director.mjs';
import {
  buildContinuityProjectionDiagnostics,
  buildContinuityTelemetry
} from '../continuity/diagnostics.mjs';
import { createMessageReconciler } from './message-reconciler.mjs';
import { createResponseDispatcher } from './response-dispatcher.mjs';
import { createRepairCommandBoundary } from './repair-command-boundary.mjs';
import { createSourceReviewWorker } from './source-review-worker.mjs';
import { createSourceSettlementService } from './source-settlement-service.mjs';
import {
  createLensPromptScheduler,
  REQUIRED_HOST_CONTINUE_PROMPT_KEYS,
  missingRequiredPromptKeys,
  normalizePromptDirtyDomains
} from './lens-prompt-scheduler.mjs';
import {
  buildLensPromptPacket,
  createLensPromptInput,
  lensPromptPacketProjectionSummary
} from './lens-prompt-packet-builder.mjs';
import { createCoreTurnRuntime } from './core-turn-runtime.mjs';
import {
  createRuntimeLedgerViewAsync,
  createRuntimeLedgerView,
  findLedgerIngressAsync,
  readRuntimeCoreProjections
} from './runtime-ledger-view.mjs';
import { terminalDecisionLedgerView } from './terminal-decision-ledger-view.mjs';
import { campaignOpeningSceneStatus } from './opening-scene-status.mjs';
import {
  createStateDeltaGateway,
  initializeCampaignRuntimeTracking,
  isPendingInteractionProjectionRow,
  recordLifecycleEvent,
  recordDirectiveResponse,
  recordTurnIngress,
  updateDirectiveResponse
} from './state-delta-gateway.mjs';
import { createTurnSourceFrame } from './frame-contracts.mjs';
import {
  indexRuntimeAssets,
  loadBundledCampaignPackageRecords,
  mergeImportedPackageRecords,
  summarizeRuntimeAssets,
  unwrapProjectionRecord
} from './package-library.mjs';
import {
  createRuntimeModelCallJournal,
  gameplayStateFingerprint,
  maxModelCallEventSequence
} from './model-call-journal.mjs';
import { createActiveSaveGuard } from './active-save-guard.mjs';
import {
  createCoreStoreV2,
  forkCoreStoreStateV2ForCheckpoint,
  loadCoreStoreStateV2,
  readCoreRecallIndexAuxiliaryEntries
} from '../storage/core-store-v2.mjs';
import {
  commitV2SaveLayout,
  deleteV2SaveLayout,
  loadV2Checkpoint,
  writeV2Checkpoint
} from '../storage/transaction-store-v2.mjs';
import { hashStableJson } from './architecture-redesign-contracts.mjs';
import {
  runtimePackageIdForState,
  selectActiveCreatorRuntimeAssets,
  selectActiveMissionGraphRecord,
  selectActiveRuntimeAssets,
  selectOptionalActiveMissionGraph,
  selectOptionalActiveRuntimeAssets,
  selectOptionalRuntimeAssetsForState,
  selectPackageContextForState
} from './mission-asset-selector.mjs';
import { createRuntimeUiPreferences } from './ui-preferences.mjs';
import {
  buildPlayerFacingInformation,
  resolveSelectedQuestId
} from '../ui/player-facing-information.mjs';
import { buildCampaignView } from '../ui/view-models/campaign-view.mjs';
import { createCreatorRuntimeService } from './creator-runtime-service.mjs';
import {
  applyOutcomeIntegritySettings,
  buildOutcomeIntegrityEditContextAsync,
  createOutcomeIntegrityRevisionRecord,
  findOutcomeIntegrityResponseAsync,
  normalizeOutcomeIntegrityMode,
  normalizeOutcomeIntegrityReviewProviderKind,
  normalizeOutcomeIntegritySettings,
  outcomeIntegrityFailureSummary,
  outcomeIntegrityStatusForMessageAsync,
  reviewOutcomeIntegrityEdit,
  validateOutcomeIntegrityProposedEdit
} from './outcome-integrity.mjs';
import {
  proposeCorrectAsSwipe,
  settleCorrectAsSwipeCaseLifecycle
} from './correct-as-swipe.mjs';
import { createSceneReconciliationService } from './scene-reconciliation.mjs';
import { createTurnCommitCoordinator } from './turn-commit-coordinator.mjs';
import {
  commitProvisionalDirectorTurnRuntime,
  createProvisionalDirectorTurnRuntimeAsync,
  createProvisionalDirectorTurnRuntime,
  runDirectorTurnRuntime
} from './director-turn-runtime.mjs';
import { normalizeSimulationMode } from '../simulation/simulation-mode-policy.mjs';
import { BUNDLED_CAMPAIGN_PACKAGE_REFS } from '../packages/bundled-package-registry.mjs';

export { BUNDLED_CAMPAIGN_PACKAGE_REFS };
export {
  fetchJsonAsset,
  loadBundledCampaignPackageRecords
} from './package-library.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireObject(value, label) {
  if (!isObject(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function mergeObjects(base, patch) {
  if (!isObject(patch)) {
    return cloneJson(base || {});
  }
  const next = cloneJson(base || {});
  for (const [key, value] of Object.entries(patch)) {
    if (isObject(value) && isObject(next[key])) {
      next[key] = mergeObjects(next[key], value);
    } else {
      next[key] = cloneJson(value);
    }
  }
  return next;
}

const DEFAULT_TURN_SAVE_HISTORY_LIMIT = 8;
const MIN_TURN_SAVE_HISTORY_LIMIT = 2;
const MAX_TURN_SAVE_HISTORY_LIMIT = 20;
const REPLACEMENT_HISTORY_LIMIT = 32;
const DEFAULT_AUTOSAVE_EVERY_MESSAGES = 20;
const MIN_AUTOSAVE_EVERY_MESSAGES = 1;
const MAX_AUTOSAVE_EVERY_MESSAGES = 200;
const FACTUAL_GROUNDING_REVIEW_ROLE_ID = 'factualGroundingReviewer';
const FACTUAL_GROUNDING_REVIEW_REQUEST_KIND = 'directive.liveCampaignSoak.factualModelReviewRequest';
const STORY_QUALITY_REVIEW_ROLE_ID = 'storyQualityReviewer';
const STORY_QUALITY_REVIEW_REQUEST_KIND = 'directive.liveCampaignSoak.storyQualityModelReviewRequest';
const FACTUAL_GROUNDING_REVIEW_FORBIDDEN_KEYS = Object.freeze([
  'apiKey',
  'api_key',
  'cookie',
  'csrf',
  'csrfToken',
  'csrf_token',
  'directorOnlyData',
  'hiddenClock',
  'hiddenClocks',
  'hiddenPressure',
  'hiddenPressures',
  'hiddenRelationship',
  'hiddenRelationships',
  'hiddenState',
  'hiddenTruth',
  'promptBlocks',
  'promptContent',
  'promptText',
  'providerReasoning',
  'rawPrompt',
  'rawPromptBodies',
  'rawPromptBody',
  'rawRelationship',
  'rawRelationships'
]);

function normalizeTurnSaveHistoryLimit(value, fallback = DEFAULT_TURN_SAVE_HISTORY_LIMIT) {
  const numeric = Math.round(Number(value));
  const fallbackNumeric = Math.round(Number(fallback));
  const candidate = Number.isFinite(numeric)
    ? numeric
    : (Number.isFinite(fallbackNumeric) ? fallbackNumeric : DEFAULT_TURN_SAVE_HISTORY_LIMIT);
  return Math.max(
    MIN_TURN_SAVE_HISTORY_LIMIT,
    Math.min(MAX_TURN_SAVE_HISTORY_LIMIT, candidate)
  );
}

function normalizeAutosaveEveryMessages(value, fallback = DEFAULT_AUTOSAVE_EVERY_MESSAGES) {
  const numeric = Math.round(Number(value));
  const fallbackNumeric = Math.round(Number(fallback));
  const candidate = Number.isFinite(numeric)
    ? numeric
    : (Number.isFinite(fallbackNumeric) ? fallbackNumeric : DEFAULT_AUTOSAVE_EVERY_MESSAGES);
  return Math.max(
    MIN_AUTOSAVE_EVERY_MESSAGES,
    Math.min(MAX_AUTOSAVE_EVERY_MESSAGES, candidate)
  );
}

function applyTurnSaveHistoryLimit(campaignState, value = null) {
  if (!campaignState) return campaignState;
  const limit = normalizeTurnSaveHistoryLimit(
    value ?? campaignState.settings?.maxTurnSaveHistory
  );
  const next = initializeCampaignRuntimeTracking(campaignState, { historyLimit: limit });
  next.settings = {
    ...(next.settings || {}),
    maxTurnSaveHistory: limit
  };
  next.runtimeTracking = {
    ...next.runtimeTracking,
    historyLimit: limit,
    history: [],
    historyIndex: -1
  };
  return pruneTurnSaveHistory(next, limit);
}

function applyAutosaveEveryMessages(campaignState, value = null) {
  if (!campaignState) return campaignState;
  const interval = normalizeAutosaveEveryMessages(
    value ?? campaignState.settings?.autosaveEveryMessages
  );
  return {
    ...campaignState,
    settings: {
      ...(campaignState.settings || {}),
      autosaveEveryMessages: interval
    }
  };
}

function applyRuntimeSettings(campaignState, {
  maxTurnSaveHistory = null,
  autosaveEveryMessages = null,
  outcomeIntegrity = null,
  outcomeIntegrityMode = null,
  outcomeIntegrityReviewProviderKind = null
} = {}) {
  if (!campaignState) return campaignState;
  const next = applyTurnSaveHistoryLimit(campaignState, maxTurnSaveHistory);
  const autosaved = applyAutosaveEveryMessages(next, autosaveEveryMessages);
  const currentOutcomeIntegrity = normalizeOutcomeIntegritySettings(autosaved.settings || {});
  return applyOutcomeIntegritySettings(autosaved, {
    mode: outcomeIntegrity?.mode ?? outcomeIntegrityMode ?? currentOutcomeIntegrity.mode,
    reviewProviderKind: outcomeIntegrity?.reviewProviderKind
      ?? outcomeIntegrityReviewProviderKind
      ?? currentOutcomeIntegrity.reviewProviderKind
  });
}

function committedMessageCount(campaignState) {
  const turnCount = campaignState?.turnLedger?.entries?.length;
  if (Number.isFinite(Number(turnCount)) && Number(turnCount) > 0) return Number(turnCount);
  const runtimeCount = campaignState?.runtimeTracking?.lastCommittedTurn?.sequence;
  return Number.isFinite(Number(runtimeCount)) ? Number(runtimeCount) : 0;
}

function shouldAutosaveStableTurn(campaignState) {
  const interval = normalizeAutosaveEveryMessages(campaignState?.settings?.autosaveEveryMessages);
  const count = committedMessageCount(campaignState);
  return count > 0 && count % interval === 0;
}

function compactString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (const char of String(text || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function compactRuntimeErrorEvidence(error = null, fallbackCode = 'DIRECTIVE_RUNTIME_ERROR') {
  const rawMessage = compactString(error?.message || error || '');
  const message = rawMessage.slice(0, 900);
  return {
    code: compactString(error?.code) || fallbackCode,
    messageLength: rawMessage.length,
    messageHash: message ? hashStableJson({ message }) : null
  };
}

function missionComponentMessageTextCandidates(message = {}) {
  if (!message || typeof message !== 'object') return [];
  return [
    message.text,
    message.mes,
    message.content,
    message.raw?.mes,
    message.raw?.content,
    message.raw?.text
  ].map((item) => String(item || '')).filter(Boolean);
}

function matchMissionComponentTextInMessage(text = '', message = {}) {
  return matchMissionComponentSourceText(text, missionComponentMessageTextCandidates(message));
}

function sourceMessageId(value = {}) {
  return compactString(value?.hostMessageId || value?.id || value?.messageId);
}

function findMissionComponentSourceMessageMatch({
  selectedText = '',
  fallbackMessage = null,
  messages = [],
  preferredMessageId = ''
} = {}) {
  const selected = compactString(selectedText);
  if (!selected) return { ok: false, reason: 'missing-selection' };
  const fallbackFullText = compactString(
    fallbackMessage?.text
    || fallbackMessage?.mes
    || fallbackMessage?.content
    || fallbackMessage?.messageText
  );
  const preferredId = compactString(preferredMessageId);
  const scored = [];
  for (const [index, message] of (Array.isArray(messages) ? messages : []).entries()) {
    if (!message || typeof message !== 'object') continue;
    const selectedMatch = matchMissionComponentTextInMessage(selected, message);
    if (!selectedMatch.ok) continue;
    const fullMatch = fallbackFullText
      ? matchMissionComponentTextInMessage(fallbackFullText, message)
      : { ok: false };
    scored.push({
      message,
      sourceMatch: fullMatch.ok ? fullMatch : selectedMatch,
      score: [
        fullMatch.ok ? 100 : 0,
        sourceMessageId(message) && sourceMessageId(message) === preferredId ? 20 : 0,
        Number.isInteger(message.index) ? Math.max(0, 10 - Math.abs(Number(message.index) - Number(preferredId || message.index))) : 0,
        -index
      ].reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0),
      matchedFullMessage: fullMatch.ok
    });
  }
  scored.sort((left, right) => right.score - left.score);
  const winner = scored[0];
  if (!winner) return { ok: false, reason: 'source-message-not-found' };
  return {
    ok: true,
    message: cloneJson(winner.message),
    sourceMatch: winner.sourceMatch,
    matchedFullMessage: winner.matchedFullMessage
  };
}

function findForbiddenFactualReviewKey(value, path = '$', depth = 0) {
  if (depth > 10 || value == null || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const match = findForbiddenFactualReviewKey(value[index], `${path}[${index}]`, depth + 1);
      if (match) return match;
    }
    return null;
  }
  const forbidden = new Set(FACTUAL_GROUNDING_REVIEW_FORBIDDEN_KEYS.map((key) => key.toLowerCase()));
  for (const [key, child] of Object.entries(value)) {
    const keyPath = `${path}.${key}`;
    if (forbidden.has(String(key).toLowerCase())) return keyPath;
    const match = findForbiddenFactualReviewKey(child, keyPath, depth + 1);
    if (match) return match;
  }
  return null;
}

function validateFactualGroundingReviewRequest(request = {}) {
  requireObject(request, 'reviewRequest');
  if (request.kind !== FACTUAL_GROUNDING_REVIEW_REQUEST_KIND) {
    throw new Error(`reviewRequest.kind must be ${FACTUAL_GROUNDING_REVIEW_REQUEST_KIND}.`);
  }
  const forbiddenKeyPath = findForbiddenFactualReviewKey(request);
  if (forbiddenKeyPath) {
    throw new Error(`Factual grounding review request contains forbidden field ${forbiddenKeyPath}.`);
  }
  const canaries = Array.isArray(request.canaries) ? request.canaries : [];
  const unsafeCanary = canaries.find((canary) => canary?.hiddenStateSafe !== true);
  if (unsafeCanary) {
    throw new Error(`Factual grounding canary ${unsafeCanary.id || '(unknown)'} is not marked player-safe.`);
  }
}

function validateStoryQualityReviewRequest(request = {}) {
  requireObject(request, 'reviewRequest');
  if (request.kind !== STORY_QUALITY_REVIEW_REQUEST_KIND) {
    throw new Error(`reviewRequest.kind must be ${STORY_QUALITY_REVIEW_REQUEST_KIND}.`);
  }
  const forbiddenKeyPath = findForbiddenFactualReviewKey(request);
  if (forbiddenKeyPath) {
    throw new Error(`Story quality review request contains forbidden field ${forbiddenKeyPath}.`);
  }
}

function factualGroundingReviewSystemPrompt() {
  return [
    'You are Directive\'s factual grounding reviewer for a live campaign soak test.',
    'Use only the provided player-safe canary facts, source pointers, deterministic summaries, and visible transcript excerpts.',
    'Do not infer from hidden truth, raw prompt bodies, provider reasoning, raw relationship values, hidden pressure values, hidden clocks, cookies, CSRF tokens, or API keys.',
    'Report only material factual problems as findings. Do not enumerate clean, respected, not-applicable, or harmless omitted facts.',
    'If there are no material factual problems, return status "pass", a concise overallAssessment, and an empty findings array.',
    'Return strict JSON matching the supplied responseSchema. Do not include markdown or commentary.'
  ].join('\n');
}

function factualGroundingReviewProviderRequest(reviewRequest = {}) {
  const safeRequest = cloneJson(reviewRequest);
  const systemPrompt = factualGroundingReviewSystemPrompt();
  const prompt = [
    'Review this visible transcript for campaign factual grounding.',
    'Return only strict JSON matching responseSchema.',
    '',
    JSON.stringify(safeRequest, null, 2)
  ].join('\n');
  return {
    systemPrompt,
    prompt,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ],
    structuredOutput: true,
    jsonSchema: safeRequest.responseSchema || null,
    metadata: {
      requestId: safeRequest.requestId || null,
      packageId: safeRequest.packageId || null,
      packId: safeRequest.packId || null,
      inputHash: safeRequest.inputHash || null,
      source: 'live-campaign-soak'
    },
    parameters: {
      temperature: 0.1,
      top_p: 0.9,
      max_tokens: 1800
    }
  };
}

function storyQualityReviewSystemPrompt() {
  return [
    'You are Directive\'s story quality reviewer for a live campaign soak test.',
    'Use only visible transcript excerpts, deterministic score summaries, score definitions, and player-safe artifact pointers.',
    'Review prose quality, tense and point of view, player agency, NPC agency, continuity, mission pressure, crew reaction, and hidden-state safety.',
    'Do not infer from hidden truth, raw prompt bodies, provider reasoning, raw relationship values, hidden pressure values, hidden clocks, cookies, CSRF tokens, or API keys.',
    'Return strict JSON matching the supplied responseSchema. Do not include markdown or commentary.'
  ].join('\n');
}

function storyQualityReviewProviderRequest(reviewRequest = {}) {
  const safeRequest = cloneJson(reviewRequest);
  const systemPrompt = storyQualityReviewSystemPrompt();
  const prompt = [
    'Review this visible transcript for story quality.',
    'Return only strict JSON matching responseSchema.',
    '',
    JSON.stringify(safeRequest, null, 2)
  ].join('\n');
  return {
    systemPrompt,
    prompt,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ],
    structuredOutput: true,
    jsonSchema: safeRequest.responseSchema || null,
    metadata: {
      requestId: safeRequest.requestId || null,
      inputHash: safeRequest.inputHash || null,
      source: 'live-campaign-soak'
    },
    parameters: {
      temperature: 0.15,
      top_p: 0.9,
      max_tokens: 2200
    }
  };
}

function countArray(value) {
  return Array.isArray(value) ? value.length : 0;
}

function acceptedBackgroundBatchWorkerCount(backgroundBatches = []) {
  return (Array.isArray(backgroundBatches) ? backgroundBatches : []).reduce((sum, batch) => {
    if (!batch?.acceptedBatchHash && !batch?.forgeBatchRef?.acceptedBatchHash) return sum;
    const workerCount = Number(batch.workerCount ?? batch.forgeBatchRef?.workerCount);
    return sum + (Number.isFinite(workerCount) && workerCount > 0 ? workerCount : 1);
  }, 0);
}

function commandLogEntryCount(state = null) {
  if (Array.isArray(state?.commandLog)) return state.commandLog.length;
  return countArray(state?.commandLog?.entries);
}

function arrayItems(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function compactLabel(value, maxLength = 320) {
  const text = cleanLabel(value);
  if (!text) return '';
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function cleanLabel(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function cleanBlockLabel(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .split(/\n+/)
    .map((paragraph) => cleanLabel(paragraph))
    .filter(Boolean)
    .join('\n\n');
}

function statusLabel(value) {
  const text = compactLabel(value, 80);
  if (!text) return '';
  return text
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function crewNameById(packageData = null, crewDataset = null) {
  const map = new Map();
  for (const officer of [
    ...arrayItems(packageData?.crew?.senior),
    ...arrayItems(crewDataset?.officers),
    ...arrayItems(crewDataset?.crew)
  ]) {
    if (officer?.id) {
      map.set(officer.id, compactLabel(officer.name || officer.id, 120));
    }
  }
  return map;
}

function playerSafeRelationshipPerceptions(state = null, crewNames = new Map()) {
  return arrayItems(state?.relationships?.perceptionLedger)
    .filter((entry) => entry?.visibility !== 'hidden' && entry?.playerVisible !== false)
    .map((entry) => {
      const perceived = entry.perceivedByCharacter || {};
      return {
        id: compactLabel(entry.id || `${entry.sourceOutcomeId || 'relationship'}:${entry.crewId || 'crew'}`, 180),
        crewId: compactLabel(entry.crewId, 120),
        crewName: crewNames.get(entry.crewId) || compactLabel(entry.crewName || entry.crewId || 'Senior officer', 120),
        impact: statusLabel(entry.playerFacingImpact || entry.impact || entry.degree || entry.change || 'perceived shift'),
        cue: compactLabel(entry.playerPerceivedCue || entry.cue || perceived.cue || entry.playerFacingSummary, 360),
        summary: compactLabel(perceived.summary || entry.summary || entry.playerFacingSummary || entry.cue, 420),
        sourceOutcomeId: compactLabel(entry.sourceOutcomeId, 160)
      };
    })
    .filter((entry) => entry.cue || entry.impact)
    .slice(-12);
}

function playerSafeCrewInteractionLog(state = null, crewNames = new Map()) {
  return arrayItems(state?.relationships?.memoryLedger)
    .filter((entry) => entry?.visibility !== 'hidden' && entry?.playerVisible !== false)
    .map((entry) => ({
      id: compactLabel(entry.id || `${entry.sourceOutcomeId || 'memory'}:${entry.crewId || 'crew'}`, 180),
      crewId: compactLabel(entry.crewId, 120),
      crewName: crewNames.get(entry.crewId) || compactLabel(entry.crewName || entry.crewId || 'Senior officer', 120),
      title: compactLabel(entry.event || entry.title || 'Crew interaction', 160),
      summary: compactLabel(entry.playerFacingSummary || entry.summary || entry.interpretation || entry.event, 360),
      sourceOutcomeId: compactLabel(entry.sourceOutcomeId, 160)
    }))
    .filter((entry) => entry.summary || entry.title)
    .slice(-12);
}

function currentStandingSummary(state = null, crewNames = new Map()) {
  return arrayItems(state?.relationships?.seniorCrew)
    .filter((entry) => entry?.playerVisible === true || Boolean(compactLabel(entry?.visibleDescriptor || entry?.currentStance)))
    .map((entry) => ({
      crewId: compactLabel(entry.crewId, 120),
      crewName: crewNames.get(entry.crewId) || compactLabel(entry.crewName || entry.crewId || 'Senior officer', 120),
      posture: compactLabel(entry.visibleDescriptor || statusLabel(entry.currentStance) || 'Professional posture not yet established.', 260)
    }))
    .slice(0, 12);
}

function choiceLabel(choice, fallback = '') {
  return compactLabel(choice?.selectedLabel || choice?.label || choice?.summary || fallback, 260);
}

function playerServiceRecord(player = {}, dossier = {}) {
  const traits = player.personality?.traits || {};
  const traitLabels = [
    choiceLabel(traits.insight),
    choiceLabel(traits.connection),
    choiceLabel(traits.execution)
  ].filter(Boolean);
  const flaw = choiceLabel(player.personality?.flaw);
  const values = arrayItems(player.personalValues)
    .map((value) => compactLabel(value?.label || value?.text || value?.summary || value, 180))
    .filter(Boolean);
  return [
    {
      title: 'Posting',
      summary: compactLabel([player.rank, player.billet, player.shipName].filter(Boolean).join(' / '), 320)
    },
    {
      title: 'Service Summary',
      summary: cleanLabel(dossier.serviceSummary)
    },
    {
      title: 'Career Background',
      summary: choiceLabel(player.service?.careerBackground || player.careerBackground)
    },
    {
      title: 'Formative Experience',
      summary: choiceLabel(player.service?.formativeExperience || player.formativeExperience)
    },
    {
      title: 'Assignment Reason',
      summary: choiceLabel(player.service?.assignmentReason || player.assignmentReason)
    },
    {
      title: 'Command Style',
      summary: cleanLabel(dossier.traits || [
        traitLabels.length ? traitLabels.join(', ') : '',
        flaw ? `pressure point: ${flaw}` : ''
      ].filter(Boolean).join('; '))
    },
    {
      title: 'Personal Values',
      summary: values.join('; ')
    }
  ].filter((item) => item.summary);
}

function createPlayerCharacterView({
  campaignState = null,
  packageData = null,
  crewDataset = null,
  commandBearingPlayerView = null
} = {}) {
  if (!campaignState) return null;
  const player = campaignState.player || {};
  const dossier = player.dossier || {};
  const crewNames = crewNameById(packageData, crewDataset);
  return {
    schemaVersion: 1,
    identity: {
      id: compactLabel(player.id || 'player-commander', 120),
      name: compactLabel(player.name || 'Player Character', 160),
      rank: compactLabel(player.rank || 'Commander', 120),
      billet: compactLabel(player.billet || 'Executive Officer', 160),
      role: compactLabel(player.role || player.packageRole || 'Player command character', 220),
      species: compactLabel(player.species?.label || player.species || '', 120),
      pronounsOrAddress: compactLabel(player.pronounsOrAddress || player.pronouns || '', 80)
    },
    portrait: cloneJson(player.portrait || null),
    dossier: {
      briefBiography: cleanBlockLabel(dossier.briefBiography),
      publicReputation: cleanBlockLabel(dossier.publicReputation),
      detailLevel: compactLabel(dossier.detailLevel, 80)
    },
    serviceRecord: playerServiceRecord(player, dossier),
    commandBearing: cloneJson(commandBearingPlayerView || null),
    commandBearingSummary: cloneJson(commandBearingPlayerView ? {
      tracks: commandBearingPlayerView.tracks,
      reserve: commandBearingPlayerView.reserve,
      readied: commandBearingPlayerView.readied
    } : null),
    commandBearingEvidence: cloneJson(commandBearingPlayerView?.evidence || []),
    commandBearingReviews: cloneJson(commandBearingPlayerView?.reviews || []),
    commandBearingHistory: cloneJson([
      ...arrayItems(commandBearingPlayerView?.spendHistory).map((entry) => ({ ...entry, type: 'spend' })),
      ...arrayItems(commandBearingPlayerView?.recoveryHistory).map((entry) => ({ ...entry, type: 'recovery' }))
    ].slice(-12)),
    currentStandingSummary: currentStandingSummary(campaignState, crewNames),
    crewInteractionLog: playerSafeCrewInteractionLog(campaignState, crewNames),
    relationshipPerceptions: playerSafeRelationshipPerceptions(campaignState, crewNames),
    guards: {
      rawRelationshipValuesHidden: true,
      hiddenMemoriesHidden: true,
      modelDiagnosticsHidden: true
    }
  };
}

function stateBindingForFreshness(state = null, {
  fallbackHostId = null,
  fallbackChatId = null,
  fallbackSaveId = null
} = {}) {
  if (!state || typeof state !== 'object') return null;
  const binding = state.campaignChatBinding && typeof state.campaignChatBinding === 'object'
    ? state.campaignChatBinding
    : {};
  return {
    hostId: compactString(binding.hostId) || compactString(fallbackHostId) || null,
    chatId: compactString(binding.chatId) || compactString(fallbackChatId) || null,
    campaignId: compactString(binding.campaignId) || compactString(state.campaign?.id) || null,
    saveId: compactString(binding.saveId) || compactString(fallbackSaveId) || null
  };
}

function sameCampaignSaveBinding(left = null, right = null) {
  const leftCampaignId = compactString(left?.campaignId);
  const rightCampaignId = compactString(right?.campaignId);
  const leftSaveId = compactString(left?.saveId);
  const rightSaveId = compactString(right?.saveId);
  return Boolean(
    leftCampaignId
    && rightCampaignId
    && leftCampaignId === rightCampaignId
    && leftSaveId
    && rightSaveId
    && leftSaveId === rightSaveId
  );
}

function stateFreshnessCounters(state = null) {
  const tracking = state?.runtimeTracking || {};
  const ledger = terminalDecisionLedgerView(state || {});
  const runtimeLedgerView = createRuntimeLedgerView(state || {});
  const responseLedger = runtimeLedgerView.responseLedger || [];
  const coreProjection = state?.directiveRuntimeEvidence?.coreStoreReadProjections || null;
  const coreTurnLedgerEntries = Array.isArray(coreProjection?.turnLedger?.entries)
    ? coreProjection.turnLedger.entries.length
    : null;
  const coreResponseLedger = Array.isArray(coreProjection?.responses)
    ? coreProjection.responses
    : Array.isArray(coreProjection?.responseLedger)
      ? coreProjection.responseLedger
    : null;
  const coreSidecarDiagnostics = Array.isArray(coreProjection?.sidecarDiagnostics)
    ? coreProjection.sidecarDiagnostics.length
    : null;
  const coreAcceptedBackgroundWorkers = Array.isArray(coreProjection?.backgroundBatches)
    ? acceptedBackgroundBatchWorkerCount(coreProjection.backgroundBatches)
    : null;
  const modelCallDiagnostics = modelCallDiagnosticsForState(state);
  return {
    revision: Math.max(0, Number(tracking.revision) || 0),
    mechanicsRevision: Math.max(0, Number(tracking.mechanicsRevision) || 0),
    promptContextRevision: Math.max(0, Number(state?.campaignChatBinding?.promptContextRevision) || 0),
    commandLogEntries: commandLogEntryCount(state),
    sceneHandshakeSettlements: Math.max(
      countArray(state?.sceneHandshake?.settled),
      state?.sceneHandshake?.lastResult ? 1 : 0
    ),
    sceneHandshakeReviews: countArray(state?.sceneHandshake?.pendingInternalReview)
      + countArray(state?.sceneHandshake?.deferred)
      + countArray(state?.sceneHandshake?.operatorRecovery)
      + countArray(state?.sceneHandshake?.rejected),
    missionOpenAssignments: countArray(state?.mission?.openAssignments),
    shipTechnicalDebt: countArray(state?.ship?.technicalDebt),
    threadLedgerRecords: countArray(state?.threadLedger?.records),
    turnLedgerEntries: Math.max(countArray(state?.turnLedger?.entries), coreTurnLedgerEntries ?? 0),
    ingressLedgerEntries: countArray(runtimeLedgerView.ingressLedger),
    responseLedgerEntries: responseLedger.length,
    responseLedgerRevision: Math.max(0, Number(coreProjection?.responseLedgerRevision) || 0),
    responseLedgerIntegritySelections: Math.max(
      responseLedger.filter((entry) => entry?.outcomeIntegrity?.selectedRevisionId).length,
      (coreResponseLedger || []).filter((entry) => entry?.outcomeIntegrity?.selectedRevisionId).length
    ),
    recoveryJournalEntries: countArray(runtimeLedgerView.recoveryJournal),
    sidecarJournalEntries: Math.max(
      Number(state?.runtimeResume?.sidecarCount) || 0,
      coreSidecarDiagnostics ?? 0,
      coreAcceptedBackgroundWorkers ?? 0
    ),
    pendingInteractions: countArray(pendingInteractionProjectionRows(state)),
    endConditionDetections: countArray(ledger.detections),
    endConditionDecisions: countArray(ledger.decisions),
    endConditionBranchRecords: countArray(ledger.branchRecords),
    endConditionContinuationFrames: countArray(ledger.continuationFrames),
    modelCallJournalEntries: modelCallDiagnostics.length
  };
}

function timestampMs(value = null) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function saveRecordFreshnessEvidence(saveRecord = null, {
  saveId = null
} = {}) {
  const manifestRef = saveRecord?.manifestRef || saveRecord?.v2ManifestRef || saveRecord?.runtimeV2ManifestRef || null;
  return Object.fromEntries(Object.entries({
    kind: 'directive.loadedSaveHeadEvidence.v1',
    saveId: compactString(saveId || saveRecord?.id) || null,
    campaignId: compactString(saveRecord?.metadata?.campaignId || saveRecord?.campaignId) || null,
    saveUpdatedAt: saveRecord?.updatedAt || saveRecord?.metadata?.lastUpdatedAt || null,
    manifestHash: compactString(manifestRef?.hash) || null,
    manifestLogicalKey: compactString(manifestRef?.logicalKey) || null,
    manifestKind: compactString(manifestRef?.kind) || null
  }).filter(([, value]) => value !== null && value !== undefined && value !== ''));
}

function stateWithLoadedSaveHeadEvidence(state = null, {
  saveRecord = null,
  saveId = null
} = {}) {
  if (!state || !saveRecord) return state;
  const loadedSaveHead = saveRecordFreshnessEvidence(saveRecord, { saveId });
  if (!loadedSaveHead?.saveUpdatedAt && !loadedSaveHead?.manifestHash && !loadedSaveHead?.manifestLogicalKey) return state;
  return {
    ...cloneJson(state),
    directiveRuntimeEvidence: {
      ...cloneJson(state.directiveRuntimeEvidence || {}),
      loadedSaveHead
    }
  };
}

function stateWithLifecycleProjectionEvidence(candidateState = null, evidenceState = null) {
  if (!candidateState || !evidenceState) return candidateState;
  const evidenceRows = readRuntimeCoreProjections(evidenceState).lifecycleJournal || [];
  if (!Array.isArray(evidenceRows) || !evidenceRows.length) return candidateState;
  const next = cloneJson(candidateState);
  const candidateProjection = next.directiveRuntimeEvidence?.coreStoreReadProjections || {};
  const currentRows = Array.isArray(candidateProjection.lifecycleJournal) ? candidateProjection.lifecycleJournal : [];
  const rowKey = (row = {}) => [
    compactString(row.id || row.lifecycleId),
    compactString(row.coreTransactionId || row.transactionId),
    compactString(row.type || row.lifecycleType),
    compactString(row.recordedAt)
  ].filter(Boolean).join('|');
  const seen = new Set(currentRows.map(rowKey).filter(Boolean));
  const mergedRows = [...cloneJson(currentRows)];
  for (const row of evidenceRows) {
    const key = rowKey(row);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    mergedRows.push(cloneJson(row));
  }
  next.directiveRuntimeEvidence = {
    ...cloneJson(next.directiveRuntimeEvidence || {}),
    coreStoreReadProjections: {
      ...cloneJson(candidateProjection),
      kind: candidateProjection.kind || 'directive.coreStoreReadProjections.v1',
      runtimeAuthority: candidateProjection.runtimeAuthority || 'coreStoreV2',
      lifecycleJournal: mergedRows
    }
  };
  next.runtimeTracking = {
    ...cloneJson(next.runtimeTracking || {}),
    lifecycleJournal: []
  };
  return next;
}

function activeSessionCacheCurrentForSave(state = null, {
  saveId = null,
  activeSaveId = null,
  saveRecord = null
} = {}) {
  const requestedSaveId = compactString(saveId);
  const stateSaveId = compactString(state?.campaignChatBinding?.saveId);
  const currentActiveSaveId = compactString(activeSaveId);
  if (!state || !requestedSaveId || stateSaveId !== requestedSaveId) return false;
  if (currentActiveSaveId && currentActiveSaveId !== requestedSaveId) return false;
  if (!saveRecord) return true;
  const loadedSaveHead = state?.directiveRuntimeEvidence?.loadedSaveHead || {};
  const saveFreshness = saveRecordFreshnessEvidence(saveRecord, { saveId: requestedSaveId });
  const saveUpdatedMs = timestampMs(saveFreshness.saveUpdatedAt);
  const loadedUpdatedMs = timestampMs(loadedSaveHead.saveUpdatedAt);
  if (saveUpdatedMs > 0) return loadedUpdatedMs >= saveUpdatedMs;
  if (saveFreshness.manifestHash) return loadedSaveHead.manifestHash === saveFreshness.manifestHash;
  if (saveFreshness.manifestLogicalKey) return loadedSaveHead.manifestLogicalKey === saveFreshness.manifestLogicalKey;
  return true;
}

function promptPacketFromLensFlushResult(lensResult = null) {
  if (lensResult?.packet && Array.isArray(lensResult.packet.blocks)) return lensResult.packet;
  const installed = lensResult?.installed || null;
  const revision = Number(lensResult?.directiveOwnedRevision || installed?.directiveOwnedRevision || installed?.revision || 0);
  if (!Number.isFinite(revision) || revision <= 0) return null;
  const promptKeys = Array.isArray(installed?.promptKeys) ? installed.promptKeys.filter(Boolean) : [];
  return {
    kind: 'directive.lensPromptRevisionEvidence.v1',
    revision,
    hash: installed?.promptHash || installed?.packetHash || lensResult?.packetHash || null,
    blocks: promptKeys.map((promptKey, index) => ({
      id: promptKey,
      title: promptKey,
      promptKey,
      priority: 0,
      placement: 'inChat',
      depth: 4,
      source: {
        kind: 'directive.lensInstalledPromptKey',
        revision,
        index
      }
    }))
  };
}

function pendingInteractionProjectionRows(state = null) {
  const projections = readRuntimeCoreProjections(state || {});
  return Array.isArray(projections.pendingInteractions)
    ? projections.pendingInteractions.filter(isPendingInteractionProjectionRow)
    : [];
}

function stateHasCoreV2RuntimeAuthority(state = null) {
  const projections = readRuntimeCoreProjections(state || {});
  return projections.runtimeAuthority === 'coreStoreV2'
    || projections.turnLedger?.runtimeAuthority === 'coreStoreV2';
}

function mergeablePendingInteractionProjectionRows(state = null) {
  return pendingInteractionProjectionRows(state)
    .filter((entry) => entry?.kind !== 'terminalOutcomeDecision');
}

function modelCallDiagnosticsForState(state = null) {
  const projections = readRuntimeCoreProjections(state || {});
  const projected = Array.isArray(projections.modelCallDiagnostics) ? projections.modelCallDiagnostics : [];
  return cloneJson(projected);
}

function coreModelCallDiagnosticsForState(state = null) {
  const projections = readRuntimeCoreProjections(state || {});
  return Array.isArray(projections.modelCallDiagnostics) ? cloneJson(projections.modelCallDiagnostics) : [];
}

function legacyModelCallTelemetryForState(state = null) {
  void state;
  return [];
}

function modelCallResultFromGeneration(generated = null, fallbackRoleId = null) {
  if (!generated) return null;
  return {
    roleId: generated.roleId || fallbackRoleId || null,
    providerKind: generated.role?.providerKind || generated.response?.providerKind || null,
    providerId: generated.diagnostics?.providerId || generated.response?.providerId || null,
    model: generated.diagnostics?.model || generated.response?.model || null,
    status: generated.ok === true ? 'ok' : (generated.error ? 'failed' : null),
    ok: generated.ok === true,
    latencyMs: generated.diagnostics?.latencyMs ?? null,
    requestHash: generated.diagnostics?.requestHash || null,
    errorCode: generated.error?.code || null
  };
}

function responseLedgerIntegrityRank(entry = null) {
  return entry?.outcomeIntegrity?.selectedRevisionId ? 1 : 0;
}

function responseProjectionCompatibilityFields(entry = {}, operation = 'fresherResponseLedgerMerge') {
  const responseId = compactString(entry?.id || entry?.responseId);
  const transactionId = compactString(entry?.transactionId || entry?.coreTransactionId || entry?.coreRelease?.transactionId);
  const status = compactString(entry?.status);
  return {
    authority: entry?.authority || 'compatibilityProjection',
    projectionSource: entry?.projectionSource || 'coreStoreV2',
    compatibilityMirror: cloneJson(entry?.compatibilityMirror || {
      kind: 'directive.coreResponseCompatibilityMirror.v1',
      source: 'coreStoreV2',
      mirroredOperation: operation,
      responseId: responseId || null,
      transactionId: transactionId || null,
      status: status || null
    }),
    coreProjection: cloneJson(entry?.coreProjection || {
      kind: 'directive.coreResponseProjectionRef.v1',
      id: responseId || null,
      responseId: responseId || null,
      transactionId: transactionId || null,
      status: status || null
    })
  };
}

function responseRowsForFresherMerge(state = null) {
  const projections = readRuntimeCoreProjections(state || {});
  const rows = coreResponseProjectionRows(projections);
  return rows.map((entry) => ({
    ...cloneJson(entry),
    ...responseProjectionCompatibilityFields(entry)
  }));
}

function responseProjectionMergeKeys(entry = {}) {
  return [
    compactString(entry?.id),
    compactString(entry?.responseId),
    compactString(entry?.transactionId),
    compactString(entry?.coreTransactionId),
    rowKey(entry, ['turnId', 'outcomeId', 'responseKind'])
  ].filter(Boolean);
}

function mergeResponseProjectionRows(candidateRows = [], memoryRows = []) {
  const output = Array.isArray(candidateRows) ? cloneJson(candidateRows) : [];
  const indexByKey = new Map();
  for (const [index, entry] of output.entries()) {
    for (const key of responseProjectionMergeKeys(entry)) indexByKey.set(key, index);
  }
  for (const memory of Array.isArray(memoryRows) ? memoryRows : []) {
    const keys = responseProjectionMergeKeys(memory);
    const existingIndex = keys.map((key) => indexByKey.get(key)).find((index) => Number.isInteger(index));
    if (!Number.isInteger(existingIndex)) {
      const nextIndex = output.length;
      output.push(cloneJson(memory));
      for (const key of keys) indexByKey.set(key, nextIndex);
      continue;
    }
    const existing = output[existingIndex];
    if (responseLedgerIntegrityRank(memory) <= responseLedgerIntegrityRank(existing)) continue;
    output[existingIndex] = {
      ...cloneJson(existing),
      authority: memory.authority || existing.authority || null,
      projectionSource: memory.projectionSource || existing.projectionSource || null,
      compatibilityMirror: cloneJson(memory.compatibilityMirror || existing.compatibilityMirror || null),
      coreProjection: cloneJson(memory.coreProjection || existing.coreProjection || null),
      editedAt: memory.editedAt || existing.editedAt || null,
      replacementText: memory.replacementText ?? existing.replacementText ?? null,
      outcomeIntegrity: cloneJson(memory.outcomeIntegrity || null)
    };
  }
  return output;
}

function coreResponseProjectionRows(projection = {}) {
  const rows = Array.isArray(projection?.responses) ? projection.responses : projection?.responseLedger;
  return Array.isArray(rows) ? rows : [];
}

function coreProjectionWithoutResponseLedgerAlias(projection = {}) {
  const next = cloneJson(projection || {});
  if (!Array.isArray(next.responses) && Array.isArray(next.responseLedger)) {
    next.responses = cloneJson(next.responseLedger);
  }
  delete next.responseLedger;
  return next;
}

function mergeFresherSourceSettlementRoots(candidateState = null, inMemoryState = null) {
  if (!candidateState || !inMemoryState) return cloneJson(candidateState || null);
  const candidate = stateFreshnessCounters(candidateState);
  const inMemory = stateFreshnessCounters(inMemoryState);
  const next = cloneJson(candidateState);
  const sameSave = sameCampaignSaveBinding(
    stateBindingForFreshness(candidateState),
    stateBindingForFreshness(inMemoryState)
  );
  const copyIfFresher = (root, keys = []) => {
    if (!keys.some((key) => inMemory[key] > candidate[key])) return;
    next[root] = cloneJson(inMemoryState[root] || null);
  };
  copyIfFresher('sceneHandshake', ['sceneHandshakeSettlements', 'sceneHandshakeReviews']);
  copyIfFresher('mission', ['missionOpenAssignments']);
  copyIfFresher('ship', ['shipTechnicalDebt']);
  copyIfFresher('threadLedger', ['threadLedgerRecords']);
  if (
    inMemory.commandLogEntries > candidate.commandLogEntries
    && (
      inMemory.sceneHandshakeSettlements > candidate.sceneHandshakeSettlements
      || inMemory.missionOpenAssignments > candidate.missionOpenAssignments
      || inMemory.shipTechnicalDebt > candidate.shipTechnicalDebt
      || inMemory.threadLedgerRecords > candidate.threadLedgerRecords
    )
  ) {
    next.commandLog = cloneJson(inMemoryState.commandLog || null);
  }
  if (sameSave && inMemory.promptContextRevision > candidate.promptContextRevision) {
    next.campaignChatBinding = {
      ...cloneJson(next.campaignChatBinding || {}),
      promptContextRevision: inMemoryState.campaignChatBinding?.promptContextRevision || inMemory.promptContextRevision,
      promptContextHash: inMemoryState.campaignChatBinding?.promptContextHash || next.campaignChatBinding?.promptContextHash || null
    };
    if (inMemoryState.directiveRuntimeEvidence?.lensPromptRevisionRecord) {
      next.directiveRuntimeEvidence = {
        ...cloneJson(next.directiveRuntimeEvidence || {}),
        lensPromptRevisionRecord: cloneJson(inMemoryState.directiveRuntimeEvidence.lensPromptRevisionRecord)
      };
    }
    if (inMemoryState.runtimeResume?.promptContextRevision) {
      next.runtimeResume = {
        ...cloneJson(next.runtimeResume || {}),
        promptContextRevision: inMemoryState.runtimeResume.promptContextRevision,
        externalPromptEnvironmentRef: cloneJson(inMemoryState.runtimeResume.externalPromptEnvironmentRef || next.runtimeResume?.externalPromptEnvironmentRef || null)
      };
    }
  }
  return next;
}

function mergeFresherResponseLedgerProjection(candidateState = null, inMemoryState = null) {
  if (!candidateState || !inMemoryState) return candidateState;
  const candidateTracking = candidateState.runtimeTracking || {};
  const mergedCandidate = mergeFresherSourceSettlementRoots(candidateState, inMemoryState);
  const candidateEvidence = mergedCandidate.directiveRuntimeEvidence?.coreStoreReadProjections || {};
  const memoryEvidence = readRuntimeCoreProjections(inMemoryState || {});
  const memoryLedger = responseRowsForFresherMerge(inMemoryState);
  if (!memoryLedger.length) return mergedCandidate;
  const responses = mergeResponseProjectionRows(coreResponseProjectionRows(candidateEvidence), memoryLedger);
  const responseLedgerRevision = Math.max(
    Number(candidateEvidence.responseLedgerRevision) || 0,
    Number(memoryEvidence.responseLedgerRevision) || 0
  );
  const baseEvidence = coreProjectionWithoutResponseLedgerAlias(candidateEvidence);
  return {
    ...cloneJson(mergedCandidate),
    directiveRuntimeEvidence: {
      ...cloneJson(mergedCandidate.directiveRuntimeEvidence || {}),
      coreStoreReadProjections: {
        ...baseEvidence,
        kind: candidateEvidence.kind || memoryEvidence.kind || 'directive.coreStoreReadProjections.v1',
        runtimeAuthority: candidateEvidence.runtimeAuthority || memoryEvidence.runtimeAuthority,
        responseLedgerRevision,
        responses
      }
    },
    runtimeTracking: cloneJson(candidateTracking)
  };
}

function shouldPreferInMemoryCampaignState(candidateState = null, inMemoryState = null, {
  chatId = null,
  fallbackHostId = null,
  fallbackSaveId = null
} = {}) {
  if (!candidateState || !inMemoryState) return false;
  const requestedChatId = compactString(chatId);
  const candidateBinding = stateBindingForFreshness(candidateState, {
    fallbackHostId,
    fallbackChatId: requestedChatId,
    fallbackSaveId
  });
  const inMemoryBinding = stateBindingForFreshness(inMemoryState, {
    fallbackHostId,
    fallbackChatId: requestedChatId,
    fallbackSaveId
  });
  const sameChat = Boolean(
    candidateBinding?.chatId
    && inMemoryBinding?.chatId
    && candidateBinding.chatId === inMemoryBinding.chatId
    && (!requestedChatId || inMemoryBinding.chatId === requestedChatId)
  );
  const sameCampaign = Boolean(
    candidateBinding?.campaignId
    && inMemoryBinding?.campaignId
    && candidateBinding.campaignId === inMemoryBinding.campaignId
  );
  const sameSave = candidateBinding?.saveId && inMemoryBinding?.saveId
    ? candidateBinding.saveId === inMemoryBinding.saveId
    : true;
  if (!sameChat || !sameCampaign || !sameSave) return false;

  const candidate = stateFreshnessCounters(candidateState);
  const inMemory = stateFreshnessCounters(inMemoryState);
  const hasCoreV2RuntimeAuthority = stateHasCoreV2RuntimeAuthority(candidateState)
    || stateHasCoreV2RuntimeAuthority(inMemoryState);
  const sourceSettlementKeys = [
    'sceneHandshakeSettlements',
    'sceneHandshakeReviews',
    'missionOpenAssignments',
    'shipTechnicalDebt',
    'threadLedgerRecords'
  ];
  const candidateHasSourceSettlementGrowth = sourceSettlementKeys.some((key) => candidate[key] > inMemory[key]);
  const inMemoryHasSourceSettlementGrowth = sourceSettlementKeys.some((key) => inMemory[key] > candidate[key]);
  if (!candidateHasSourceSettlementGrowth && inMemory.turnLedgerEntries > candidate.turnLedgerEntries) return true;
  if (!inMemoryHasSourceSettlementGrowth && candidate.turnLedgerEntries > inMemory.turnLedgerEntries) return false;
  if (
    inMemory.responseLedgerEntries >= candidate.responseLedgerEntries
    && inMemory.responseLedgerIntegritySelections > candidate.responseLedgerIntegritySelections
  ) return true;
  if (
    candidate.responseLedgerEntries >= inMemory.responseLedgerEntries
    && candidate.responseLedgerIntegritySelections > inMemory.responseLedgerIntegritySelections
  ) return false;

  const materialKeys = [
    'promptContextRevision',
    'commandLogEntries',
    'sceneHandshakeSettlements',
    'sceneHandshakeReviews',
    'missionOpenAssignments',
    'shipTechnicalDebt',
    'threadLedgerRecords',
    'turnLedgerEntries',
    'ingressLedgerEntries',
    'responseLedgerEntries',
    'responseLedgerRevision',
    'responseLedgerIntegritySelections',
    'recoveryJournalEntries',
    'sidecarJournalEntries',
    'pendingInteractions',
    'endConditionDetections',
    'endConditionDecisions',
    'endConditionBranchRecords',
    'endConditionContinuationFrames'
  ];
  const criticalMaterialKeys = materialKeys.filter((key) => key !== 'promptContextRevision');
  const candidateHasCriticalGrowth = criticalMaterialKeys.some((key) => candidate[key] > inMemory[key]);
  const inMemoryHasCriticalGrowth = criticalMaterialKeys.some((key) => inMemory[key] > candidate[key]);
  if (inMemoryHasCriticalGrowth && !candidateHasCriticalGrowth) return true;
  if (candidateHasCriticalGrowth && !inMemoryHasCriticalGrowth) return false;

  const hasMaterialRegression = materialKeys.some((key) => inMemory[key] < candidate[key]);
  const hasMaterialGrowth = materialKeys.some((key) => inMemory[key] > candidate[key]);
  if (hasMaterialGrowth && !hasMaterialRegression) return true;
  if (hasMaterialRegression && !hasMaterialGrowth) return false;

  if (!hasCoreV2RuntimeAuthority) {
    if (inMemory.revision > candidate.revision) return true;
    if (inMemory.revision < candidate.revision) return false;
    if (inMemory.mechanicsRevision > candidate.mechanicsRevision) return true;
    if (inMemory.mechanicsRevision < candidate.mechanicsRevision) return false;
  }

  return false;
}

function runtimePersistProjectionRowKey(row = null) {
  if (!isObject(row)) return hashStableJson(row);
  return [
    row.id,
    row.turnId,
    row.transactionId,
    row.coreTransactionId,
    row.hostMessageId,
    row.outcomeId,
    row.checkpointId,
    row.worker,
    row.role,
    row.type
  ].map(compactString).find(Boolean) || hashStableJson(row);
}

function mergeRuntimePersistProjectionRows(priorRows = [], nextRows = []) {
  const byKey = new Map();
  for (const row of arrayItems(priorRows)) byKey.set(runtimePersistProjectionRowKey(row), cloneJson(row));
  for (const row of arrayItems(nextRows)) {
    const key = runtimePersistProjectionRowKey(row);
    const prior = byKey.get(key);
    if (!isObject(prior)) {
      byKey.set(key, cloneJson(row));
      continue;
    }
    const merged = cloneJson(prior);
    for (const [field, value] of Object.entries(row || {})) {
      if (value === undefined || value === null || value === '') continue;
      if (isObject(value) && isObject(merged[field])) {
        merged[field] = {
          ...cloneJson(merged[field]),
          ...cloneJson(value)
        };
      } else {
        merged[field] = cloneJson(value);
      }
    }
    byKey.set(key, merged);
  }
  return [...byKey.values()];
}

function mergeRuntimePersistCoreProjections(priorProjection = null, nextProjection = null) {
  if (!isObject(priorProjection)) return isObject(nextProjection) ? coreProjectionWithoutResponseLedgerAlias(nextProjection) : cloneJson(nextProjection || null);
  if (!isObject(nextProjection)) return coreProjectionWithoutResponseLedgerAlias(priorProjection);
  const priorNormalized = coreProjectionWithoutResponseLedgerAlias(priorProjection);
  const nextNormalized = coreProjectionWithoutResponseLedgerAlias(nextProjection);
  const nextHasRuntimeAuthority = nextProjection.runtimeAuthority === 'coreStoreV2'
    || nextProjection.turnLedger?.runtimeAuthority === 'coreStoreV2';
  const merged = {
    ...priorNormalized,
    ...nextNormalized,
    kind: nextProjection.kind || priorProjection.kind || 'directive.coreStoreReadProjections.v1',
    runtimeAuthority: nextProjection.runtimeAuthority || priorProjection.runtimeAuthority || null,
    responseLedgerRevision: Math.max(
      Number(priorProjection.responseLedgerRevision) || 0,
      Number(nextProjection.responseLedgerRevision) || 0
    )
  };
  if (isObject(priorProjection.turnLedger) || isObject(nextProjection.turnLedger)) {
    const nextTurnLedger = isObject(nextProjection.turnLedger) ? nextProjection.turnLedger : null;
    const nextTurnLedgerAuthority = nextHasRuntimeAuthority || nextTurnLedger?.runtimeAuthority === 'coreStoreV2';
    merged.turnLedger = {
      ...cloneJson(priorProjection.turnLedger || {}),
      ...cloneJson(nextProjection.turnLedger || {}),
      entries: nextTurnLedgerAuthority && Array.isArray(nextTurnLedger?.entries)
        ? cloneJson(nextTurnLedger.entries)
        : mergeRuntimePersistProjectionRows(
          priorProjection.turnLedger?.entries,
          nextProjection.turnLedger?.entries
        ),
      replacementHistory: nextTurnLedgerAuthority && Array.isArray(nextTurnLedger?.replacementHistory)
        ? cloneJson(nextTurnLedger.replacementHistory)
        : mergeRuntimePersistProjectionRows(
          priorProjection.turnLedger?.replacementHistory,
          nextProjection.turnLedger?.replacementHistory
        )
    };
  }
  for (const key of [
    'ingressLedger',
    'responses',
    'recoveryJournal',
    'sidecarDiagnostics',
    'backgroundBatches',
    'modelCallDiagnostics'
  ]) {
    if (Array.isArray(priorNormalized[key]) || Array.isArray(nextNormalized[key])) {
      merged[key] = nextHasRuntimeAuthority && Array.isArray(nextNormalized[key])
        ? cloneJson(nextNormalized[key])
        : mergeRuntimePersistProjectionRows(priorNormalized[key], nextNormalized[key]);
    }
  }
  if (Array.isArray(priorProjection.pendingInteractions) || Array.isArray(nextProjection.pendingInteractions)) {
    merged.pendingInteractions = (
      nextHasRuntimeAuthority && Array.isArray(nextProjection.pendingInteractions)
        ? cloneJson(nextProjection.pendingInteractions)
        : mergeRuntimePersistProjectionRows(
          priorProjection.pendingInteractions,
          nextProjection.pendingInteractions
        )
    ).filter((entry) => entry?.kind !== 'terminalOutcomeDecision');
  }
  return merged;
}

function mergeRuntimePersistPendingStates(priorState = null, nextState = null, {
  chatId = null,
  fallbackHostId = null,
  fallbackSaveId = null
} = {}) {
  if (!isObject(priorState)) return cloneJson(nextState || null);
  if (!isObject(nextState)) return cloneJson(priorState || null);
  const requestedChatId = compactString(chatId);
  const priorBinding = stateBindingForFreshness(priorState, {
    fallbackHostId,
    fallbackChatId: requestedChatId,
    fallbackSaveId
  });
  const nextBinding = stateBindingForFreshness(nextState, {
    fallbackHostId,
    fallbackChatId: requestedChatId,
    fallbackSaveId
  });
  const sameChat = Boolean(priorBinding?.chatId && nextBinding?.chatId && priorBinding.chatId === nextBinding.chatId);
  const sameCampaign = Boolean(
    priorBinding?.campaignId
    && nextBinding?.campaignId
    && priorBinding.campaignId === nextBinding.campaignId
  );
  const sameSave = priorBinding?.saveId && nextBinding?.saveId
    ? priorBinding.saveId === nextBinding.saveId
    : true;
  if (!sameChat || !sameCampaign || !sameSave) return cloneJson(nextState);

  const prior = stateFreshnessCounters(priorState);
  const next = stateFreshnessCounters(nextState);
  const merged = cloneJson(nextState);
  const mergedTracking = {
    ...cloneJson(nextState.runtimeTracking || {})
  };
  if (prior.promptContextRevision > next.promptContextRevision) {
    merged.campaignChatBinding = {
      ...cloneJson(nextState.campaignChatBinding || {}),
      promptContextRevision: prior.promptContextRevision
    };
  }
  if (prior.commandLogEntries > next.commandLogEntries) merged.commandLog = cloneJson(priorState.commandLog || null);
  const nextCoreProjectionForFreshness = readRuntimeCoreProjections(nextState || {});
  const nextHasAuthoritativeTurnProjection = (
    nextCoreProjectionForFreshness.runtimeAuthority === 'coreStoreV2'
    || nextCoreProjectionForFreshness.turnLedger?.runtimeAuthority === 'coreStoreV2'
  ) && Array.isArray(nextCoreProjectionForFreshness.turnLedger?.entries);
  if (!nextHasAuthoritativeTurnProjection && prior.turnLedgerEntries > next.turnLedgerEntries) {
    merged.turnLedger = cloneJson(priorState.turnLedger || null);
  }
  const priorPendingRows = mergeablePendingInteractionProjectionRows(priorState);
  const nextPendingRows = mergeablePendingInteractionProjectionRows(nextState);
  const nextHasAuthoritativePendingProjection = nextCoreProjectionForFreshness.runtimeAuthority === 'coreStoreV2'
    && Array.isArray(nextCoreProjectionForFreshness.pendingInteractions);
  if (!nextHasAuthoritativePendingProjection && priorPendingRows.length > nextPendingRows.length) {
    merged.directiveRuntimeEvidence = {
      ...cloneJson(nextState.directiveRuntimeEvidence || {}),
      coreStoreReadProjections: {
        ...cloneJson(nextState.directiveRuntimeEvidence?.coreStoreReadProjections || {}),
        pendingInteractions: cloneJson(priorPendingRows)
      }
    };
  }
  if (
    (
      prior.endConditionDetections > next.endConditionDetections
      || prior.endConditionDecisions > next.endConditionDecisions
      || prior.endConditionBranchRecords > next.endConditionBranchRecords
      || prior.endConditionContinuationFrames > next.endConditionContinuationFrames
    )
    && isObject(priorState.directiveRuntimeEvidence?.coreStoreReadProjections?.terminalDecisionLedger)
  ) {
    merged.directiveRuntimeEvidence = {
      ...cloneJson(merged.directiveRuntimeEvidence || nextState.directiveRuntimeEvidence || {}),
      coreStoreReadProjections: {
        ...cloneJson(merged.directiveRuntimeEvidence?.coreStoreReadProjections || nextState.directiveRuntimeEvidence?.coreStoreReadProjections || {}),
        terminalDecisionLedger: cloneJson(priorState.directiveRuntimeEvidence.coreStoreReadProjections.terminalDecisionLedger)
      }
    };
  }
  if (Object.keys(mergedTracking).length) merged.runtimeTracking = mergedTracking;

  const priorResumeCount = Number(priorState.runtimeResume?.sidecarCount) || 0;
  const nextResumeCount = Number(nextState.runtimeResume?.sidecarCount) || 0;
  if (priorResumeCount > nextResumeCount) {
    merged.runtimeResume = {
      ...cloneJson(nextState.runtimeResume || {}),
      sidecarCount: priorResumeCount
    };
  }

  const priorProjection = priorState.directiveRuntimeEvidence?.coreStoreReadProjections || null;
  const nextProjection = nextState.directiveRuntimeEvidence?.coreStoreReadProjections || null;
  const mergedProjection = mergeRuntimePersistCoreProjections(priorProjection, nextProjection);
  if (mergedProjection) {
    merged.directiveRuntimeEvidence = {
      ...cloneJson(merged.directiveRuntimeEvidence || {}),
      coreStoreReadProjections: mergedProjection
    };
  }
  return merged;
}

function mergeRuntimePersistPendingRequest(priorRequest = null, nextRequest = null, options = {}) {
  if (!priorRequest) return nextRequest ? cloneJson(nextRequest) : null;
  if (!nextRequest) return cloneJson(priorRequest);
  return {
    ...cloneJson(nextRequest),
    state: mergeRuntimePersistPendingStates(priorRequest.state, nextRequest.state, options)
  };
}

function hasTurnLedgerOutcome(state = null, outcomeId = null) {
  const id = compactString(outcomeId);
  if (!id) return false;
  return (state?.turnLedger?.entries || []).some((entry) => entry?.outcomeId === id);
}

function checkpointSnapshotFromRecord(record = null) {
  if (!isObject(record)) return null;
  return record.campaignState
    || record.snapshot
    || record.state
    || record.checkpoint?.campaignState
    || record.checkpoint?.snapshot
    || record.checkpoint?.state
    || record.record?.checkpoint?.campaignState
    || record.record?.checkpoint?.snapshot
    || record.record?.checkpoint?.state
    || record.payload?.campaignState
    || null;
}

function compactCheckpointRef(ref = null) {
  if (!isObject(ref)) return null;
  const checkpointId = compactString(ref.checkpointId || ref.id);
  if (!checkpointId) return null;
  return {
    kind: compactString(ref.kind) || 'directive.coreMechanicsCheckpointRef.v1',
    campaignId: compactString(ref.campaignId) || null,
    saveId: compactString(ref.saveId) || null,
    checkpointId,
    layout: compactString(ref.layout) || 'core',
    sourceKind: compactString(ref.sourceKind) || null,
    sourceRevision: Number.isFinite(Number(ref.sourceRevision)) ? Number(ref.sourceRevision) : null,
    logicalKey: compactString(ref.logicalKey) || null,
    hash: compactString(ref.hash) || null
  };
}

function coreCheckpointRefFromLedgerEntry(entry = null) {
  return compactCheckpointRef(
    entry?.coreCheckpointRef
    || entry?.checkpointRef
    || entry?.v2CheckpointRef
    || null
  );
}

function compactOutcomeRerunLedgerRef(entry = null, {
  snapshotPresent = undefined,
  snapshotSourceKind = null,
  coreCheckpointRef = null
} = {}) {
  if (!entry || typeof entry !== 'object') return null;
  const compactRef = compactCheckpointRef(coreCheckpointRef) || coreCheckpointRefFromLedgerEntry(entry);
  return {
    replacedTransactionId: compactString(entry.coreTransactionId || entry.transactionId),
    coreTransactionId: compactString(entry.coreTransactionId || entry.transactionId),
    outcomeId: compactString(entry.outcomeId),
    turnId: compactString(entry.turnId),
    resultBand: compactString(entry.resultBand),
    snapshotBeforeRetained: entry.snapshotBeforeRetained === true,
    snapshotPresent: snapshotPresent === undefined ? isObject(entry.snapshotBefore) : snapshotPresent === true,
    snapshotSourceKind: compactString(snapshotSourceKind) || (compactRef ? 'coreStoreV2.checkpoint' : undefined),
    coreCheckpointRef: compactRef || undefined,
    narrationStatus: compactString(entry.narrationStatus),
    responseStatus: compactString(entry.responseStatus),
    hasCommandBearingSpend: Boolean(entry.commandBearingSpend)
  };
}

function latestCommittedTurnLedgerEntry(state = null, outcomeId = null) {
  const entries = Array.isArray(state?.turnLedger?.entries) ? state.turnLedger.entries : [];
  const targetOutcomeId = compactString(outcomeId || state?.turnLedger?.lastCommittedOutcomeId);
  if (targetOutcomeId) {
    return [...entries].reverse().find((entry) => entry?.outcomeId === targetOutcomeId) || null;
  }
  return entries.length ? entries[entries.length - 1] : null;
}

function lastCommittedTurnPresentationFromEntry(entry = null, {
  mirror = null,
  source = 'runtimeApp'
} = {}) {
  if (!isObject(entry)) return null;
  const taggedMirror = isLastCommittedTurnProjection(mirror) ? mirror : null;
  const transactionId = compactString(entry.coreTransactionId || entry.transactionId || taggedMirror?.coreTransactionId || taggedMirror?.coreProjection?.transactionId);
  const turnId = compactString(entry.turnId || taggedMirror?.turnId);
  const outcomeId = compactString(entry.outcomeId || taggedMirror?.outcomeId);
  const status = compactString(taggedMirror?.compatibilityMirror?.status || taggedMirror?.coreProjection?.status || entry.responseStatus || entry.narrationStatus || 'mirrored') || 'mirrored';
  return {
    turnId: turnId || null,
    outcomeId: outcomeId || null,
    resultBand: compactString(entry.resultBand || taggedMirror?.resultBand) || null,
    narrationStatus: compactString(entry.narrationStatus || taggedMirror?.narrationStatus) || null,
    responseStatus: compactString(entry.responseStatus || taggedMirror?.responseStatus) || null,
    directiveGenerationStartedAt: taggedMirror?.directiveGenerationStartedAt || entry.narration?.directiveGenerationStartedAt || entry.narration?.generatedAt || null,
    hostMessageId: taggedMirror?.hostMessageId || null,
    coreTransactionId: transactionId || null,
    coreTurnId: compactString(entry.coreTurnId || taggedMirror?.coreTurnId) || null,
    coreOperationHash: compactString(entry.coreOperationHash || entry.operationHash || taggedMirror?.coreOperationHash) || null,
    authority: 'compatibilityProjection',
    projectionSource: transactionId ? 'coreStoreV2' : 'turnLedger',
    compatibilityMirror: {
      kind: 'directive.lastCommittedTurnCompatibilityMirror.v1',
      status,
      outcomeId: outcomeId || null,
      turnId: turnId || null,
      transactionId: transactionId || null,
      source
    },
    coreProjection: {
      kind: 'directive.coreLastCommittedTurnProjectionRef.v1',
      outcomeId: outcomeId || null,
      turnId: turnId || null,
      transactionId: transactionId || null,
      status
    }
  };
}

function lastCommittedTurnPresentationForState(state = null, outcomeId = null) {
  const entry = latestCommittedTurnLedgerEntry(state, outcomeId);
  return lastCommittedTurnPresentationFromEntry(entry, {
    mirror: state?.runtimeTracking?.lastCommittedTurn || null,
    source: 'runtimeApp.chatNativeView'
  });
}

async function loadOutcomeRerunCheckpointSnapshot({
  storageAdapter = null,
  state = null,
  controller = null,
  ledgerEntry = null
} = {}) {
  const ref = coreCheckpointRefFromLedgerEntry(ledgerEntry);
  if (!ref || !storageAdapter) return null;
  const binding = state?.campaignChatBinding || {};
  const campaignId = compactString(ref.campaignId || binding.campaignId || state?.campaign?.id);
  const saveId = compactString(ref.saveId || binding.saveId || controller?.activeSaveId);
  const checkpointId = compactString(ref.checkpointId);
  if (!campaignId || !saveId || !checkpointId) return null;
  try {
    const record = await loadV2Checkpoint(storageAdapter, {
      campaignId,
      saveId,
      checkpointId,
      layout: compactString(ref.layout) || 'core'
    });
    const snapshot = checkpointSnapshotFromRecord(record);
    if (!isObject(snapshot)) return null;
    return {
      snapshot: cloneJson(snapshot),
      sourceKind: record?.sourceKind || record?.checkpoint?.sourceKind || ref.sourceKind || 'coreStoreV2.checkpoint',
      sourceRevision: Number.isFinite(Number(
        record?.sourceRevision
        ?? record?.revision
        ?? record?.checkpoint?.sourceRevision
        ?? record?.checkpoint?.revision
        ?? ref.sourceRevision
      ))
        ? Number(record?.sourceRevision ?? record?.revision ?? record?.checkpoint?.sourceRevision ?? record?.checkpoint?.revision ?? ref.sourceRevision)
        : null,
      coreCheckpointRef: {
        ...ref,
        campaignId,
        saveId,
        checkpointId,
        layout: compactString(ref.layout) || 'core'
      }
    };
  } catch {
    return null;
  }
}

function buildOutcomeRerunSourceFrame({
  state = null,
  binding = null,
  ledgerEntry = null,
  outcomeId = null,
  replacementTurnId = null,
  replacementCandidateId = null,
  replacementType = 'rerunOutcome',
  playerInput = '',
  replacementInputHash = null,
  eventTime = null,
  fallbackHostId = null
} = {}) {
  const replacedOutcomeId = compactString(outcomeId || ledgerEntry?.outcomeId);
  const replacedTurnId = compactString(ledgerEntry?.turnId);
  const replacedTransactionId = compactString(ledgerEntry?.coreTransactionId || ledgerEntry?.transactionId);
  const replacementTurn = compactString(replacementTurnId);
  const candidateId = compactString(replacementCandidateId);
  const textHash = compactString(replacementInputHash) || hashStableJson({
    replacementInput: String(playerInput || ''),
    replacedOutcomeId,
    replacementTurnId: replacementTurn,
    replacementType
  });
  const sourceHash = hashStableJson({
    sourceKind: 'committedOutcomeRerun',
    candidateId,
    replacedOutcomeId,
    replacedTurnId,
    replacedTransactionId,
    replacementTurnId: replacementTurn,
    replacementType,
    textHash
  });
  const frameId = candidateId ? `frame:${candidateId}` : `frame:outcome-rerun:${sourceHash.slice(0, 16)}`;
  return createTurnSourceFrame({
    id: frameId,
    sourceKind: 'committedOutcomeRerun',
    campaignId: binding?.campaignId || state?.campaign?.id || null,
    saveId: binding?.saveId || null,
    chatId: binding?.chatId || null,
    hostId: binding?.hostId || fallbackHostId || null,
    hostMessageId: `outcome-rerun:${replacedOutcomeId}`,
    textHash,
    sourceHash,
    sourceRevision: state?.runtimeTracking?.revision || 0,
    outcomeRef: {
      kind: 'directive.rerunOutcomeSourceRef.v1',
      outcomeId: replacedOutcomeId,
      turnId: replacedTurnId,
      sourceFrameId: ledgerEntry?.sourceFrameId || null
    },
    turnRef: {
      kind: 'directive.rerunReplacementTurnRef.v1',
      turnId: replacementTurn,
      outcomeId: replacedOutcomeId
    },
    visibility: {
      sourceMutation: false,
      reason: 'committed-outcome-rerun-preview'
    },
    createdAt: eventTime || null
  });
}

function outcomeRerunIngressProjection({
  replacementTransactionId = null,
  replacedTransactionId = null,
  replacementIngressId = null,
  outcomeId = null,
  replacementOutcomeId = null,
  replacementTurnId = null,
  sourceFrame = null,
  repairDecision = null
} = {}) {
  const transactionId = compactString(replacementTransactionId || repairDecision?.transactionId);
  if (!transactionId) return null;
  return {
    kind: 'directive.coreIngressOutcomeRerunProjectionRef.v1',
    transactionId,
    replacedTransactionId: compactString(replacedTransactionId || repairDecision?.replacedTransactionId) || null,
    ingressId: compactString(replacementIngressId) || null,
    replacedOutcomeId: compactString(outcomeId || repairDecision?.outcomeId) || null,
    replacementOutcomeId: compactString(replacementOutcomeId) || null,
    replacementTurnId: compactString(replacementTurnId) || null,
    sourceFrameId: compactString(sourceFrame?.id) || null,
    sourceKind: 'committedOutcomeRerun',
    status: 'committed'
  };
}

function boundedReplacementHistory(entries = [], nextEntry = null, limit = REPLACEMENT_HISTORY_LIMIT) {
  const source = Array.isArray(entries) ? entries : [];
  const combined = nextEntry ? [...source, nextEntry] : [...source];
  const numericLimit = Math.max(1, Number.isInteger(limit) ? limit : REPLACEMENT_HISTORY_LIMIT);
  return combined.slice(Math.max(0, combined.length - numericLimit)).map(cloneJson);
}

function rowKey(row = {}, keySpec) {
  if (Array.isArray(keySpec)) {
    const values = keySpec.map((key) => compactString(row?.[key]));
    return values.every(Boolean) ? values.join('\u0001') : '';
  }
  return compactString(row?.[keySpec]);
}

function rowKeySet(rows = [], keySpecs = []) {
  const keys = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    for (const spec of keySpecs) {
      const key = rowKey(row, spec);
      if (key) keys.add(key);
    }
  }
  return keys;
}

function rowsCoveredByCoreProjection(coreRows = [], legacyRows = [], keySpecs = []) {
  const legacy = Array.isArray(legacyRows) ? legacyRows : [];
  if (legacy.length === 0) return true;
  const coreKeys = rowKeySet(coreRows, keySpecs);
  if (coreKeys.size === 0) return false;
  return legacy.every((row) => {
    for (const spec of keySpecs) {
      const key = rowKey(row, spec);
      if (key && coreKeys.has(key)) return true;
    }
    return false;
  });
}

function coreProjectionHasRuntimeAuthority(projections = {}, existingState = null) {
  if (!existingState || typeof existingState !== 'object') return true;
  const hasCoreRuntimeProjection = projections.runtimeAuthority === 'coreStoreV2'
    || projections.turnLedger?.runtimeAuthority === 'coreStoreV2'
    || (Array.isArray(projections.turnLedger?.entries) && projections.turnLedger.entries.length > 0)
    || (Array.isArray(projections.turnLedger?.replacementHistory) && projections.turnLedger.replacementHistory.length > 0)
    || (Array.isArray(projections.ingressLedger) && projections.ingressLedger.length > 0)
    || coreResponseProjectionRows(projections).length > 0;
  if (hasCoreRuntimeProjection) return true;
  const coreTurnLedger = projections.turnLedger || {};
  return rowsCoveredByCoreProjection(coreTurnLedger.entries, existingState.turnLedger?.entries, [
      'id',
      'turnId',
      'transactionId',
      'coreTransactionId',
      'outcomeId'
    ])
    && rowsCoveredByCoreProjection(coreTurnLedger.replacementHistory, existingState.turnLedger?.replacementHistory, [
      'id',
      'eventId',
      'transactionId',
      'coreTransactionId',
      'replacedTransactionId',
      'replacementTransactionId',
      ['replacedOutcomeId', 'replacementOutcomeId'],
      ['replacedTurnId', 'replacementTurnId']
    ]);
}

function coreProjectionFreshnessEvidence(projections = null, existingState = null) {
  if (!projections || typeof projections !== 'object') return null;
  const hasRuntimeAuthority = coreProjectionHasRuntimeAuthority(projections, existingState);
  const evidence = {
    kind: 'directive.coreStoreReadProjections.v1',
    turnLedger: {
      entries: cloneJson(Array.isArray(projections.turnLedger?.entries) ? projections.turnLedger.entries : []),
      replacementHistory: cloneJson(Array.isArray(projections.turnLedger?.replacementHistory) ? projections.turnLedger.replacementHistory : []),
      lastCommittedOutcomeId: projections.turnLedger?.lastCommittedOutcomeId || null,
      lastReplacedOutcomeId: projections.turnLedger?.lastReplacedOutcomeId || null,
      runtimeAuthority: hasRuntimeAuthority ? 'coreStoreV2' : null
    },
    ingressLedger: cloneJson(Array.isArray(projections.ingressLedger) ? projections.ingressLedger : []),
    responses: cloneJson(coreResponseProjectionRows(projections)),
    recoveryJournal: cloneJson(Array.isArray(projections.recoveryJournal) ? projections.recoveryJournal : []),
    sidecarDiagnostics: cloneJson(Array.isArray(projections.sidecarDiagnostics) ? projections.sidecarDiagnostics : []),
    backgroundBatches: cloneJson(Array.isArray(projections.backgroundBatches) ? projections.backgroundBatches : []),
    commandBearingEvidence: cloneJson(Array.isArray(projections.commandBearingEvidence) ? projections.commandBearingEvidence : []),
    revisions: cloneJson(isObject(projections.revisions) ? projections.revisions : {})
  };
  if (hasRuntimeAuthority) {
    evidence.runtimeAuthority = 'coreStoreV2';
  }
  return evidence;
}

function turnProjectionMatchKey(entry = null) {
  if (!isObject(entry)) return null;
  return compactString(entry.coreTransactionId || entry.transactionId)
    || compactString(entry.outcomeId)
    || compactString(entry.turnId)
    || compactString(entry.id);
}

function mergeCoreTurnLedgerProjection(turnLedger = null, coreTurnLedger = null) {
  const hasCoreEntries = Array.isArray(coreTurnLedger?.entries);
  const hasCoreReplacementHistory = Array.isArray(coreTurnLedger?.replacementHistory);
  if (!hasCoreEntries && !hasCoreReplacementHistory) {
    return turnLedger;
  }
  const existingEntries = Array.isArray(turnLedger?.entries) ? turnLedger.entries : [];
  const coreEntries = hasCoreEntries ? coreTurnLedger.entries : [];
  if (
    hasCoreEntries
    && coreEntries.length === 0
    && existingEntries.length > 0
    && coreTurnLedger?.runtimeAuthority !== 'coreStoreV2'
  ) {
    return turnLedger;
  }
  const entries = hasCoreEntries
    ? coreEntries.map((projected) => {
      const checkpointRef = compactCheckpointRef(
        projected.coreCheckpointRef
        || projected.checkpointRef
        || projected.v2CheckpointRef
      );
      return {
        ...cloneJson(projected),
        coreTransactionId: compactString(projected.coreTransactionId || projected.transactionId) || projected.coreTransactionId,
        transactionId: compactString(projected.transactionId || projected.coreTransactionId) || projected.transactionId,
        snapshotBeforeRetained: projected.snapshotBeforeRetained === true || undefined,
        coreCheckpointRef: checkpointRef || undefined
      };
    })
    : [];
  const lastCommittedOutcomeId = Object.prototype.hasOwnProperty.call(coreTurnLedger || {}, 'lastCommittedOutcomeId')
    ? (coreTurnLedger.lastCommittedOutcomeId || null)
    : (entries.at(-1)?.outcomeId || null);
  return {
    ...(isObject(turnLedger) ? cloneJson(turnLedger) : {}),
    entries,
    lastCommittedOutcomeId: lastCommittedOutcomeId || undefined,
    replacementHistory: hasCoreReplacementHistory ? cloneJson(coreTurnLedger.replacementHistory) : undefined,
    lastReplacedOutcomeId: coreTurnLedger?.lastReplacedOutcomeId || undefined
  };
}

const RERUN_PREVIEW_RAW_INPUT_KEYS = new Set([
  'playerInput',
  'playerText',
  'declaredMethod'
]);

function collectRerunPreviewRawInputCandidates(value, out = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectRerunPreviewRawInputCandidates(item, out);
    return out;
  }
  if (!value || typeof value !== 'object') return out;
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string' && RERUN_PREVIEW_RAW_INPUT_KEYS.has(key) && item.trim()) {
      out.add(item.trim());
    }
    collectRerunPreviewRawInputCandidates(item, out);
  }
  return out;
}

function redactedRerunInputMarker(inputHash = null) {
  const hash = compactString(inputHash);
  return hash ? `[redacted-rerun-player-input:${hash.slice(0, 16)}]` : '[redacted-rerun-player-input]';
}

function redactRerunPreviewProjection(value, {
  rawInput = null,
  inputHash = null,
  rawCandidates = null,
  currentKey = null
} = {}) {
  const candidates = rawCandidates || collectRerunPreviewRawInputCandidates(value);
  if (compactString(rawInput)) candidates.add(compactString(rawInput));
  const marker = redactedRerunInputMarker(inputHash);
  if (Array.isArray(value)) {
    return value.map((item) => redactRerunPreviewProjection(item, {
      inputHash,
      rawCandidates: candidates,
      currentKey
    }));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = redactRerunPreviewProjection(item, {
        inputHash,
        rawCandidates: candidates,
        currentKey: key
      });
    }
    return out;
  }
  if (typeof value !== 'string') return value;
  if (RERUN_PREVIEW_RAW_INPUT_KEYS.has(currentKey)) return marker;
  if (currentKey === 'summaryInputs' && value.trim()) return marker;
  let text = value;
  for (const candidate of candidates) {
    if (!candidate || !text.includes(candidate)) continue;
    text = text.split(candidate).join(marker);
  }
  return text;
}

function publicPendingDirectorTurnProjection(turnPacket = null, replacement = null) {
  if (!turnPacket) return null;
  if (!replacement) return cloneJson(turnPacket);
  return redactRerunPreviewProjection(turnPacket, {
    inputHash: replacement.replacementInputHash || replacement.repairDecision?.replacementInputHash || null
  });
}

function assertFreshOutcomeRerunReplacementTarget({
  replacement = null,
  ledgerEntry = null
} = {}) {
  if (!replacement) return null;
  const expectedOutcomeId = compactString(replacement.outcomeId);
  const expectedTransactionId = compactString(
    replacement.repairDecision?.replacedTransactionId
    || replacement.replacedTransactionId
  );
  if (!expectedOutcomeId) return ledgerEntry || null;
  if (!ledgerEntry || compactString(ledgerEntry.outcomeId) !== expectedOutcomeId) {
    const error = new Error(`CORE outcome rerun rejected stale rerun target "${expectedOutcomeId}".`);
    error.code = 'DIRECTIVE_CORE_OUTCOME_RERUN_STALE_TARGET';
    error.details = {
      outcomeId: expectedOutcomeId,
      reason: 'rerun-target-missing'
    };
    throw error;
  }
  if (expectedTransactionId) {
    const currentTransactionId = compactString(ledgerEntry.coreTransactionId || ledgerEntry.transactionId);
    if (currentTransactionId !== expectedTransactionId) {
      const error = new Error(`CORE outcome rerun rejected stale rerun target "${expectedOutcomeId}".`);
      error.code = 'DIRECTIVE_CORE_OUTCOME_RERUN_STALE_TARGET';
      error.details = {
        outcomeId: expectedOutcomeId,
        expectedTransactionId,
        currentTransactionId: currentTransactionId || null,
        reason: 'replaced-transaction-mismatch'
      };
      throw error;
    }
  }
  if (replacement.repairDecision?.snapshotBeforeRetained === true && ledgerEntry.snapshotBeforeRetained !== true) {
    const error = new Error(`CORE outcome rerun rejected stale rerun target "${expectedOutcomeId}".`);
    error.code = 'DIRECTIVE_CORE_OUTCOME_RERUN_STALE_TARGET';
    error.details = {
      outcomeId: expectedOutcomeId,
      reason: 'retained-snapshot-missing'
    };
    throw error;
  }
  return ledgerEntry;
}

function assertOutcomeReplacementCheckpointBase({
  replacement = null,
  ledgerEntry = null
} = {}) {
  if (!replacement) return null;
  const coreCheckpointRef = compactCheckpointRef(
    replacement.coreCheckpointRef
    || replacement.repairDecision?.coreCheckpointRef
    || coreCheckpointRefFromLedgerEntry(ledgerEntry)
  );
  if (!coreCheckpointRef || !isObject(replacement.snapshotBefore)) {
    const outcomeId = compactString(replacement.outcomeId || ledgerEntry?.outcomeId || 'unknown');
    const error = new Error(`CORE checkpoint snapshot is required before committing rerun of outcome "${outcomeId}".`);
    error.code = 'DIRECTIVE_CORE_OUTCOME_RERUN_CHECKPOINT_REQUIRED';
    error.details = {
      outcomeId,
      reason: !coreCheckpointRef ? 'core-checkpoint-ref-missing' : 'core-checkpoint-snapshot-missing',
      coreCheckpointRef: coreCheckpointRef || null,
      snapshotPresent: isObject(replacement.snapshotBefore)
    };
    throw error;
  }
  return coreCheckpointRef;
}

function commandLogEntryOutcomeId(entry = null) {
  return compactString(entry?.sourceOutcomeId || entry?.outcomeId || entry?.id);
}

const mutateCampaignStateForTest = Symbol.for('directive.runtimeApp.mutateCampaignStateForTest');
const mutateCoreStoreStateForTest = Symbol.for('directive.runtimeApp.mutateCoreStoreStateForTest');

function buildCoreStoreHeadSnapshot(state = {}) {
  const transactions = Object.fromEntries(Object.values(state.transactions || {}).map((transaction) => [
    transaction.id,
    Object.fromEntries(Object.entries({
      id: transaction.id,
      phase: transaction.phase,
      route: transaction.route || null,
      sourceFrameId: transaction.sourceFrameId,
      chatId: transaction.chatId,
      updatedAt: transaction.updatedAt || transaction.createdAt,
      revisions: cloneJson(transaction.revisions)
    }).filter(([, value]) => value !== undefined))
  ]));
  return {
    coreStore: {
      kind: 'directive.coreStoreHead.v2',
      schemaVersion: 1,
      campaignId: state.campaignId,
      saveId: state.saveId,
      branchId: state.branchId || 'main',
      updatedAt: state.updatedAt,
      revisions: cloneJson(state.revisions || {}),
      counters: cloneJson(state.counters || {}),
      activeTransactionIds: Object.values(state.transactions || {})
        .filter((transaction) => !['settled', 'canceled', 'restartSuperseded'].includes(transaction.phase))
        .map((transaction) => transaction.id),
      transactions,
      promptDirtyDomains: [...new Set(state.promptDirtyDomains || [])]
    }
  };
}

function restoreCommittedOutcomeState(state = null, checkpointState = null, outcomeId = null) {
  const id = compactString(outcomeId);
  if (!state || !checkpointState || !id) return state;
  if (hasTurnLedgerOutcome(state, id) || !hasTurnLedgerOutcome(checkpointState, id)) return state;
  const next = cloneJson(state);
  next.turnLedger = cloneJson(checkpointState.turnLedger);

  const checkpointEntries = Array.isArray(checkpointState.commandLog?.entries)
    ? checkpointState.commandLog.entries.filter((entry) => commandLogEntryOutcomeId(entry) === id)
    : [];
  if (checkpointEntries.length) {
    next.commandLog = {
      ...(next.commandLog || {}),
      entries: Array.isArray(next.commandLog?.entries) ? cloneJson(next.commandLog.entries) : []
    };
    const existing = new Set(next.commandLog.entries.map(commandLogEntryOutcomeId));
    for (const entry of checkpointEntries) {
      if (!existing.has(commandLogEntryOutcomeId(entry))) next.commandLog.entries.push(cloneJson(entry));
    }
    next.commandLog.summariesGeneratedFromCommittedStateOnly = checkpointState.commandLog?.summariesGeneratedFromCommittedStateOnly !== false;
  }

  const lastCommittedTurnMirror = lastCommittedTurnPresentationFromEntry(
    latestCommittedTurnLedgerEntry(next, id),
    {
      mirror: checkpointState.runtimeTracking?.lastCommittedTurn || null,
      source: 'runtimeApp.restoreCommittedOutcomeState'
    }
  );
  if (lastCommittedTurnMirror) {
    next.runtimeTracking = {
      ...(next.runtimeTracking || {}),
      history: [],
      historyIndex: -1,
      lastCommittedTurn: lastCommittedTurnMirror
    };
  } else if (next.runtimeTracking) {
    next.runtimeTracking.history = [];
    next.runtimeTracking.historyIndex = -1;
  }
  return next;
}

function isLastCommittedTurnProjection(input = null) {
  if (!isObject(input)) return false;
  const authority = compactString(input.authority);
  const projectionSource = compactString(input.projectionSource);
  return (
    input.compatibilityMirror?.kind === 'directive.lastCommittedTurnCompatibilityMirror.v1'
    || input.coreProjection?.kind === 'directive.coreLastCommittedTurnProjectionRef.v1'
    || (
      authority === 'compatibilityProjection'
      && ['coreStoreV2', 'turnLedger'].includes(projectionSource)
    )
  );
}

export const __directiveRuntimeAppTestHooks = Object.freeze({
  createPlayerCharacterView,
  boundedReplacementHistory,
  coreProjectionFreshnessEvidence,
  mergeCoreTurnLedgerProjection,
  assertFreshOutcomeRerunReplacementTarget,
  assertOutcomeReplacementCheckpointBase,
  findMissionComponentSourceMessageMatch,
  stateFreshnessCounters,
  activeSessionCacheCurrentForSave,
  promptPacketFromLensFlushResult,
  mergeFresherResponseLedgerProjection,
  mergeRuntimePersistPendingRequest,
  restoreCommittedOutcomeState,
  shouldPreferInMemoryCampaignState,
  mutateCampaignStateForTest,
  mutateCoreStoreStateForTest
});

function defaultIdFactory() {
  let sequence = 0;
  return (prefix) => {
    sequence += 1;
    const randomPart = typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
    return `${prefix}-${Date.now()}-${sequence}-${randomPart}`;
  };
}

function timestampFromNow(now) {
  if (typeof now === 'function') return now();
  if (typeof now === 'string' && now.trim()) return now;
  return new Date().toISOString();
}

function reportContinuityProjectionActivity(activityReporter, event = {}) {
  if (typeof activityReporter !== 'function') return;
  try {
    activityReporter({
      kind: 'directive.turnActivity',
      ...event
    });
  } catch (error) {
    console.warn('[Directive] Failed to report continuity projection activity:', error);
  }
}

export function createDirectiveRuntimeApp({
  host = null,
  adapter = null,
  packageLoader = loadBundledCampaignPackageRecords,
  idFactory = defaultIdFactory(),
  narrationProvider = null,
  repairRuntime = null,
  repairRuntimeFactory = null,
  now = null
} = {}) {
  const runtimeHost = host ? assertDirectiveHost(host) : null;
  const storageAdapter = adapter || runtimeHost?.storage;
  let campaignState = null;
  async function forgeSourceCurrentForRuntime(payload = {}) {
    let projections = null;
    try {
      projections = typeof runtimeCoreTurnStore?.readProjections === 'function'
        ? await runtimeCoreTurnStore.readProjections()
        : null;
    } catch {
      return { ok: false, reason: 'source-core-projection-unavailable' };
    }
    if (!Array.isArray(projections?.ingressLedger) || projections.ingressLedger.length === 0) {
      return { ok: false, reason: 'source-core-projection-missing' };
    }
    const ledger = projections.ingressLedger;
    const sourceFrameId = compactString(payload.sourceFrameRef?.id || payload.sourceFrameRef?.sourceFrameId);
    const sourceToken = compactString(payload.sourceToken);
    const transactionId = compactString(payload.transactionId);
    const ingress = [...ledger].reverse().find((entry) => (
      (transactionId && (entry.coreTransactionId === transactionId || entry.transactionId === transactionId))
      || (sourceFrameId && (entry.sourceFrameId === sourceFrameId || entry.sourceFrame?.id === sourceFrameId))
      || (sourceToken && entry.sourceFrame?.sourceToken === sourceToken)
    )) || null;
    if (!ingress) return { ok: false, reason: 'source-ingress-missing' };
    if (ingress.invalidatedAt || ingress.deletedAt || ingress.editedAt) {
      return { ok: false, reason: 'source-ingress-mutated' };
    }
    if (['restartSuperseded', 'superseded', 'invalidated', 'source-stale', 'deleted'].includes(compactString(ingress.status))) {
      return { ok: false, reason: `source-ingress-${compactString(ingress.status)}` };
    }
    const ingressTransactionId = compactString(ingress.coreTransactionId || ingress.transactionId);
    if (transactionId && ingressTransactionId && ingressTransactionId !== transactionId) {
      return { ok: false, reason: 'source-transaction-mismatch' };
    }
    if (sourceFrameId && ingress.sourceFrameId && ingress.sourceFrameId !== sourceFrameId) {
      return { ok: false, reason: 'source-frame-mismatch' };
    }
    if (sourceToken && ingress.sourceFrame?.sourceToken && ingress.sourceFrame.sourceToken !== sourceToken) {
      return { ok: false, reason: 'source-token-mismatch' };
    }
    return { ok: true };
  }

  function coreDiagnosticTargetForModelCall(event = {}) {
    if (!campaignState) return null;
    const tracked = initializeCampaignRuntimeTracking(campaignState);
    const activeIngressId = compactString(tracked.runtimeTracking?.activeIngressId);
    const metadata = event?.metadata || {};
    const requestedIngressId = compactString(metadata.ingressId || metadata.sourceIngressId);
    const targetIngressId = requestedIngressId || activeIngressId;
    if (!targetIngressId) return null;
    const ingress = (createRuntimeLedgerView(tracked || {}).ingressLedger || [])
      .find((entry) => entry?.id === targetIngressId) || null;
    const transactionId = compactString(
      ingress?.coreTransactionId
      || ingress?.transactionId
      || metadata.coreTransactionId
      || metadata.transactionId
    );
    if (!transactionId) return null;
    const explicitBackgroundTarget = metadata.coreDiagnosticTarget === 'advisoryEnrichment'
      || (event?.roleId === 'missionDirectorAdvisor' && requestedIngressId);
    const targetStatus = compactString(ingress?.status);
    if (!explicitBackgroundTarget && !['classifying', 'classified'].includes(targetStatus)) return null;
    return {
      transactionId,
      ingressId: ingress?.id || requestedIngressId || null,
      sourceFrameId: ingress?.sourceFrameId || ingress?.sourceFrame?.id || metadata.sourceFrameId || null,
      hostMessageId: ingress?.hostMessageId || metadata.sourceMessageId || metadata.hostMessageId || null
    };
  }
  const modelCallJournal = createRuntimeModelCallJournal({
    now,
    getCampaignState: () => campaignState,
    setCampaignState: (state) => {
      campaignState = state;
    },
    resolveCoreDiagnosticTarget: coreDiagnosticTargetForModelCall,
    appendCoreDiagnostic: (transactionId, event) => runtimeCoreTurnStore.appendDiagnostic(transactionId, event)
  });
  const activeSaveGuard = createActiveSaveGuard({ runtimeHost });

  const defaultGenerationRouter = runtimeHost
    ? createGenerationRouter({
        generationClient: runtimeHost.generation,
        now,
        onModelCall: modelCallJournal.record
      })
    : null;
  const defaultNarrationProvider = narrationProvider || defaultGenerationRouter?.providerForRole('narration') || null;
  requireObject(storageAdapter, 'adapter');
  if (typeof packageLoader !== 'function') {
    throw new Error('packageLoader must be a function');
  }

  let initialized = false;
  let controller = null;
  let campaignView = null;
  let checkpointService = null;
  let creatorView = null;
  let activeCreatorDraftId = null;
  let activeScreen = 'campaign';
  let runtimeAssetsByPackageId = new Map();
  let importedPackageRecords = [];
  let lastPackageImportResult = null;
  let lastDirectorTurn = null;
  let lastNarrationResult = null;
  let lastMechanicsCheckpointState = null;
  let pendingDirectorTurn = null;
  let pendingOutcomeReplacement = null;
  let lastCommandLogSummarySidecarResult = null;
  let lastOpenWorldActionResult = null;
  let lastDirectiveAssistResult = null;
  let lastSceneReconciliationResult = null;
  let lastCharacterCreatorSectionDraftResult = null;
  let lastStateSafetyResult = null;
  let lastActivationResult = null;
  let lastConclusionResult = null;
  let lastDirectivePresetStatus = null;
  let lastDirectivePresetInstallResult = null;
  let lastManualSaveGuard = null;
  let currentChatScope = null;
  let latestChatTurnStatus = null;
  let runtimeSettingsOverlay = null;
  let programmaticChatOpenSuppression = null;
  let lastError = null;
  let chatNativeServices = null;
  let durabilityCoordinator = null;
  let lensPromptScheduler = null;
  let runtimeForgeCoordinator = null;
  let publicApi = null;
  let runtimePersistCoordinator = null;
  let commandLogSummaryQueue = Promise.resolve();
  let commandLogSummaryDiagnosticQueue = Promise.resolve();
  let commandLogSummaryDiagnosticBatch = [];
  let commandLogSummaryPendingCount = 0;
  let deferredCommandLogSummaryRequest = null;
  let postCommitConversationQueue = Promise.resolve();
  let postCommitConversationDiagnosticQueue = Promise.resolve();
  let postCommitConversationDiagnosticBatch = [];
  let postCommitConversationPendingCount = 0;
  let lastPostCommitConversationResult = null;
  let advisoryEnrichmentQueue = Promise.resolve();
  let advisoryEnrichmentDiagnosticQueue = Promise.resolve();
  let advisoryEnrichmentDiagnosticBatch = [];
  let advisoryEnrichmentPendingCount = 0;
  let lastAdvisoryEnrichmentResult = null;
  let terminalCheckpointSettlementQueue = Promise.resolve();
  let terminalCheckpointDiagnosticQueue = Promise.resolve();
  let terminalCheckpointDiagnosticBatch = [];
  let lastTerminalCheckpointSettlementResult = null;
  let activeCoreTurnStoreRecord = null;
  let activeCoreTurnStorePending = null;
  const activeHostGenerationControllers = new Map();
  const uiPreferences = createRuntimeUiPreferences({
    storageAdapter,
    loadPreferences: loadDirectiveUiPreferences,
    savePreferences: saveDirectiveUiPreferences,
    now
  });
  const creatorRuntime = createCreatorRuntimeService({
    getCreatorView: () => creatorView,
    activeCreatorRuntimeAssets,
    setLastSectionDraftResult: (result) => {
      lastCharacterCreatorSectionDraftResult = result;
    }
  });

  function directiveGenerationAbortError(reason = 'host-generation-stopped') {
    const error = new Error(reason === 'host-generation-stopped'
      ? 'Directive generation canceled by SillyTavern Stop.'
      : 'Directive generation canceled.');
    error.code = 'DIRECTIVE_GENERATION_ABORTED';
    error.reason = reason;
    return error;
  }

  function trackHostCancelableGeneration(kind, metadata = {}) {
    if (typeof AbortController !== 'function') {
      return {
        id: null,
        signal: null,
        done() {}
      };
    }
    const id = `${kind || 'generation'}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const controller = new AbortController();
    activeHostGenerationControllers.set(id, {
      id,
      kind: kind || 'generation',
      metadata: cloneJson(metadata),
      controller
    });
    return {
      id,
      signal: controller.signal,
      done() {
        activeHostGenerationControllers.delete(id);
      }
    };
  }

  function abortHostCancelableGenerations({ reason = 'host-generation-stopped' } = {}) {
    const active = [...activeHostGenerationControllers.values()];
    const error = directiveGenerationAbortError(reason);
    let canceledCount = 0;
    for (const entry of active) {
      if (!entry.controller?.signal?.aborted) {
        entry.controller.abort(error);
        canceledCount += 1;
      }
    }
    return {
      ok: true,
      reason,
      canceledCount,
      activeCount: activeHostGenerationControllers.size
    };
  }

  async function loadUiPreferences() {
    return uiPreferences.load();
  }

  async function persistUiPreferences() {
    return uiPreferences.persist();
  }

  function buildCheckpointService() {
    if (!runtimeHost?.chat?.cloneCampaignChat || !runtimeHost?.chat?.openCampaignChat) {
      return null;
    }
    return createManualCheckpointService({
      storage: storageAdapter,
      chat: runtimeHost.chat,
      now: () => timestampFromNow(now),
      createId: (prefix) => controller.createSaveId(prefix),
      getActiveContext: async () => ({
        campaignId: campaignState?.campaign?.id || null,
        saveId: controller?.activeSaveId || campaignState?.campaignChatBinding?.saveId || null,
        chatId: campaignState?.campaignChatBinding?.chatId || null,
        chatBinding: cloneJson(campaignState?.campaignChatBinding || {}),
        summary: {
          chapter: campaignState?.story?.currentChapter?.title
            || campaignState?.campaign?.currentChapter
            || campaignState?.mission?.title
            || null,
          stardate: campaignState?.time?.stardate
            || campaignState?.campaignTime?.stardate
            || null,
          location: campaignState?.navigation?.currentLocation?.name
            || campaignState?.navigation?.currentLocationId
            || null
        }
      }),
      guardSource: async () => refreshManualSaveGuard(campaignState),
      core: {
        createCheckpointAuthority: async ({
          campaignId,
          sourceSaveId,
          sourceChatId,
          checkpointId,
          preservedChatId
        }) => {
          const authority = await controller.createCheckpointAuthoritySnapshot({
            checkpointId,
            campaignState
          });
          const coreClone = await forkCoreStoreStateV2ForCheckpoint(storageAdapter, {
            campaignId,
            sourceSaveId,
            targetSaveId: authority.saveId,
            branchId: authority.saveId,
            sourceChatId,
            targetChatId: preservedChatId,
            now: () => timestampFromNow(now)
          });
          return {
            ...cloneJson(authority),
            coreSaveManifestRef: cloneJson(coreClone?.saveManifestRef || null)
          };
        },
        forkCheckpoint: async ({ checkpoint, targetSaveId, targetChatId }) => {
          const authorityState = await controller.loadCheckpointAuthorityState({
            campaignId: checkpoint.campaignId,
            authoritySaveId: checkpoint.coreAuthority.saveId
          });
          const coreClone = await forkCoreStoreStateV2ForCheckpoint(storageAdapter, {
            campaignId: checkpoint.campaignId,
            sourceSaveId: checkpoint.coreAuthority.saveId,
            targetSaveId,
            branchId: targetSaveId,
            sourceChatId: checkpoint.preservedChatBinding.chatId,
            targetChatId,
            now: () => timestampFromNow(now),
            campaignState: authorityState,
            campaignStateSourceSaveId: checkpoint.sourceSaveId,
            campaignStateSourceChatId: checkpoint.sourceChatId
          });
          return {
            campaignState: cloneJson(coreClone?.campaignState || authorityState),
            coreClone: {
              checkpointCount: coreClone?.checkpointCount ?? null,
              skipped: coreClone?.skipped === true,
              reason: coreClone?.reason || null,
              saveManifestRef: cloneJson(coreClone?.saveManifestRef || null)
            }
          };
        },
        deleteCheckpointAuthority: async ({ checkpoint }) => {
          const campaignId = requireNonEmptyString(checkpoint?.campaignId, 'campaignId');
          const saveId = requireNonEmptyString(checkpoint?.coreAuthority?.saveId, 'authoritySaveId');
          const coreDeletion = await deleteV2SaveLayout(storageAdapter, {
            campaignId,
            saveId,
            layout: 'core'
          });
          const activeDeletion = await deleteV2SaveLayout(storageAdapter, {
            campaignId,
            saveId,
            layout: 'active'
          });
          return {
            deleted: true,
            campaignId,
            saveId,
            layouts: [
              cloneJson(coreDeletion),
              cloneJson(activeDeletion)
            ]
          };
        }
      },
      activateTimeline: async ({
        checkpoint,
        targetSaveId,
        chatBinding,
        coreResult
      }) => {
        const nextBinding = {
          ...cloneJson(chatBinding || {}),
          campaignId: checkpoint.campaignId,
          saveId: targetSaveId,
          status: chatBinding?.status || 'bound'
        };
        const loadedState = stateWithLoadedSaveBinding(
          applyRuntimeSettings(coreResult.campaignState),
          targetSaveId,
          nextBinding
        );
        campaignState = loadedState;
        await controller.createCheckpointTimeline({
          saveId: targetSaveId,
          name: `${checkpoint.name} - Continue`,
          campaignState,
          checkpointId: checkpoint.id
        });
        await runtimeHost.chat.updateBindingMetadata?.(nextBinding);
        resetActiveCoreTurnStore('checkpoint-loaded');
        return {
          campaignState: cloneJson(campaignState),
          chatBinding: cloneJson(nextBinding)
        };
      },
      rebuildPrompt: async ({ activated }) => {
        const pendingBinding = activated?.chatBinding || activated?.campaignState?.campaignChatBinding || null;
        const suppressionToken = beginProgrammaticChatOpenSuppression(
          pendingBinding,
          'Immutable checkpoint continuation pending host chat open.'
        );
        let promptResult;
        try {
          promptResult = await synchronizeActivePrompt(activated.campaignState, {
            persist: false,
            rebuild: true,
            reason: 'Prompt context rebuilt after loading an immutable checkpoint.'
          });
        } finally {
          finishProgrammaticChatOpenSuppression(suppressionToken, { opened: false });
        }
        campaignState = promptResult?.campaignState
          ? applyRuntimeSettings(promptResult.campaignState)
          : applyRuntimeSettings(activated.campaignState);
        return {
          rebuilt: true,
          campaignState: cloneJson(campaignState)
        };
      }
    });
  }

  async function rebuildPackageLibrary({ recoverActiveSave = true } = {}) {
    const loaded = await packageLoader();
    importedPackageRecords = await listImportedCampaignPackageRecords(storageAdapter);
    await loadUiPreferences();
    const merged = mergeImportedPackageRecords(loaded, importedPackageRecords);
    const projectionRecords = merged.projections;
    const projections = projectionRecords.map(unwrapProjectionRecord);
    runtimeAssetsByPackageId = indexRuntimeAssets({
      packages: merged.packages,
      projections: projectionRecords,
      crewDatasets: merged.crewDatasets,
      shipDatasets: merged.shipDatasets,
      missionGraphs: merged.missionGraphs
    });
    controller = createCampaignStartController({
      adapter: storageAdapter,
      packages: merged.packages,
      projections,
      runtimeAssetSummaries: summarizeRuntimeAssets(runtimeAssetsByPackageId, merged.sources),
      idFactory,
      now
    });
    campaignView = await controller.initialize({ recoverActiveSave });
    campaignState = controller.activeCampaignState
      ? applyRuntimeSettings(controller.activeCampaignState)
      : null;
    if (campaignState) {
      campaignState = normalizeCampaignTimeForRuntime(campaignState, {
        reason: 'active-save-runtime-start'
      }).campaignState;
    }
    if (campaignState) {
      activeScreen = 'campaign';
    } else if (activeScreen !== 'creator') {
      activeScreen = 'campaign';
    }
    checkpointService = buildCheckpointService();
    const initialCampaignIds = new Set([
      campaignState?.campaign?.id,
      ...(Array.isArray(campaignView?.saves)
        ? campaignView.saves.map((save) => save?.metadata?.campaignId)
        : [])
    ].filter(Boolean));
    const initialCheckpoints = [];
    for (const campaignId of initialCampaignIds) {
      initialCheckpoints.push(...await listManualCheckpoints(storageAdapter, { campaignId }));
    }
    campaignView = {
      ...campaignView,
      checkpoints: initialCheckpoints
    };
  }

  async function ensureInitialized() {
    if (initialized) return;
    await rebuildPackageLibrary();
    initialized = true;
  }

  async function refreshCampaignView() {
    await ensureInitialized();
    const baseView = await controller.getCampaignView();
    const campaignIds = new Set([
      campaignState?.campaign?.id,
      ...(Array.isArray(baseView?.saves)
        ? baseView.saves.map((save) => save?.metadata?.campaignId)
        : [])
    ].filter(Boolean));
    const checkpoints = [];
    for (const campaignId of campaignIds) {
      checkpoints.push(...await listManualCheckpoints(storageAdapter, { campaignId }));
    }
    campaignView = {
      ...baseView,
      checkpoints
    };
    return cloneJson(campaignView);
  }

  function activeRuntimeAssets() {
    return selectActiveRuntimeAssets({ campaignState, controller, runtimeAssetsByPackageId });
  }

  function optionalActiveRuntimeAssets() {
    return selectOptionalActiveRuntimeAssets({ campaignState, controller, runtimeAssetsByPackageId });
  }

  function activeCreatorRuntimeAssets() {
    return selectActiveCreatorRuntimeAssets({ creatorView, controller, campaignView, runtimeAssetsByPackageId });
  }

  function canStorePlayerPortraits() {
    return typeof storageAdapter?.writeBase64File === 'function';
  }

  function assertPlayerPortraitStorageSupported() {
    if (!canStorePlayerPortraits()) {
      const error = new Error('This Directive host does not support player portrait uploads.');
      error.code = 'DIRECTIVE_PLAYER_PORTRAIT_UNSUPPORTED';
      throw error;
    }
  }

  async function appendReviewFallbackIfNeeded(patch = {}) {
    return creatorRuntime.appendReviewFallbackIfNeeded(patch);
  }

  function activeMissionGraphRecord(assets, sceneSnapshotOverrides = {}) {
    return selectActiveMissionGraphRecord({ assets, campaignState, sceneSnapshotOverrides });
  }

  function optionalActiveMissionGraph(assets) {
    return selectOptionalActiveMissionGraph({ assets, campaignState });
  }

  function campaignViewEnvelope() {
    const campaign = cloneJson(campaignView);
    if (!campaign) return campaign;
    campaign.imports = importedPackageRecords.map((record) => ({
      id: record.id,
      packageId: record.packageId,
      packageVersion: record.packageVersion,
      packageTitle: record.packageData?.manifest?.title || record.packageId,
      shipName: record.packageData?.ship?.name || null,
      sourceFileName: record.sourceFileName || null,
      importedAt: record.importedAt || null,
      diagnostics: cloneJson(record.diagnostics || null)
    }));
    campaign.lastImportResult = cloneJson(lastPackageImportResult);
    return campaign;
  }

  async function currentHostChatForSaveGuard() {
    return activeSaveGuard.currentHostChat();
  }

  async function currentHostChatMetadataForSaveGuard() {
    return activeSaveGuard.currentHostChatMetadata();
  }

  async function evaluateActiveChatSaveGuard(state = campaignState, {
    expectedSaveId = null
  } = {}) {
    return activeSaveGuard.evaluate(state, { expectedSaveId });
  }

  async function refreshManualSaveGuard(state = campaignState, options = {}) {
    lastManualSaveGuard = await evaluateActiveChatSaveGuard(state, {
      expectedSaveId: options.expectedSaveId ?? controller?.activeSaveId ?? state?.campaignChatBinding?.saveId ?? null
    });
    return lastManualSaveGuard;
  }

  function campaignPackageIdForState(state = null) {
    return runtimePackageIdForState({ state, controller, campaignView });
  }

  function optionalRuntimeAssetsForState(state = null) {
    return selectOptionalRuntimeAssetsForState({ state, controller, campaignView, runtimeAssetsByPackageId });
  }

  function normalizeCampaignTimeForRuntime(state = null, {
    reason = 'runtime-campaign-time-normalization'
  } = {}) {
    const assets = optionalRuntimeAssetsForState(state);
    return normalizeCampaignTimeState(state, {
      projection: assets?.projection || null,
      now: timestampFromNow(now),
      reason
    });
  }

  function campaignTimeNeedsRuntimeNormalization(state = null) {
    return Boolean(
      state
      && (
        state.campaign?.openingMinuteOfDay === undefined
        || state.campaign?.openingMinuteOfDay === null
        || state.worldState?.openingMinuteOfDay === undefined
        || state.worldState?.openingMinuteOfDay === null
        || !state.timeLedger
      )
    );
  }

  function packageContextForState(state = null) {
    return selectPackageContextForState({ state, controller, campaignView });
  }

  function allowedSimulationModesForState(state = null) {
    const rawModes = Array.isArray(state?.settings?.allowedSimulationModes) && state.settings.allowedSimulationModes.length
      ? state.settings.allowedSimulationModes
      : packageContextForState(state)?.simulationModes;
    const seen = new Set();
    const modes = (Array.isArray(rawModes) && rawModes.length ? rawModes : ['Exploration', 'Command'])
      .map(normalizeSimulationMode)
      .filter((mode) => {
        if (seen.has(mode)) return false;
        seen.add(mode);
        return true;
      });
    return modes.length ? modes : ['Exploration', 'Command'];
  }

  function normalizedBinding(binding = null) {
    if (!binding || typeof binding !== 'object') return null;
    return {
      hostId: compactString(binding.hostId) || runtimeHost?.id || null,
      chatId: compactString(binding.chatId) || null,
      chatName: compactString(binding.chatName || binding.name) || null,
      campaignId: compactString(binding.campaignId) || null,
      saveId: compactString(binding.saveId) || null,
      entityType: compactString(binding.entityType) || null,
      entityId: compactString(binding.entityId) || null,
      entityName: compactString(binding.entityName) || null,
      status: compactString(binding.status) || null
    };
  }

  function bindingFromSave(save = null) {
    return normalizedBinding(save?.metadata?.campaignChatBinding || null);
  }

  function bindingFromState(state = null) {
    const binding = normalizedBinding(state?.campaignChatBinding || null);
    if (!binding) return null;
    return {
      ...binding,
      campaignId: binding.campaignId || compactString(state?.campaign?.id) || null,
      saveId: binding.saveId || compactString(controller?.activeSaveId) || null
    };
  }

  function stateWithLoadedSaveBinding(state = null, saveId = null, binding = null) {
    const id = compactString(saveId);
    const sourceBinding = normalizedBinding(binding) || normalizedBinding(state?.campaignChatBinding || null);
    if (!state || !id || !sourceBinding) return state;
    const bound = {
      ...state,
      campaignChatBinding: {
        ...(state.campaignChatBinding || {}),
        ...cloneJson(sourceBinding),
        campaignId: compactString(sourceBinding.campaignId) || compactString(state.campaign?.id) || null,
        saveId: id,
        status: compactString(sourceBinding.status) || compactString(state.campaignChatBinding?.status) || 'bound'
      }
    };
    return normalizeCampaignTimeForRuntime(bound, {
      reason: 'loaded-save-binding'
    }).campaignState;
  }

  function campaignSessionKeyFromParts({ hostId = null, campaignId = null, saveId = null, chatId = null } = {}) {
    return [
      compactString(hostId) || runtimeHost?.id || 'host',
      compactString(campaignId) || 'campaign',
      compactString(saveId) || 'save',
      compactString(chatId) || 'chat'
    ].join(':');
  }

  function campaignSessionKeyForSave(save = null) {
    const binding = bindingFromSave(save);
    const metadata = save?.metadata || {};
    return campaignSessionKeyFromParts({
      hostId: binding?.hostId || runtimeHost?.id || 'host',
      campaignId: binding?.campaignId || metadata.campaignId,
      saveId: binding?.saveId || save?.id,
      chatId: binding?.chatId || metadata.chatId
    });
  }

  function campaignCommandKeyForSave(save = null) {
    const binding = bindingFromSave(save);
    const metadata = save?.metadata || {};
    const campaignId = compactString(binding?.campaignId || metadata.campaignId);
    if (campaignId) {
      return [
        compactString(binding?.hostId) || runtimeHost?.id || 'host',
        campaignId
      ].join(':');
    }
    return campaignSessionKeyForSave(save);
  }

  function campaignSessionKeyForState(state = null, fallbackSaveId = null) {
    const binding = bindingFromState(state);
    return campaignSessionKeyFromParts({
      hostId: binding?.hostId || runtimeHost?.id || 'host',
      campaignId: binding?.campaignId || state?.campaign?.id,
      saveId: binding?.saveId || fallbackSaveId,
      chatId: binding?.chatId
    });
  }

  function coreStoreDescriptorForState(state = campaignState) {
    if (!state || state.campaign?.status !== 'active') return null;
    const binding = bindingFromState(state);
    const campaignId = compactString(binding?.campaignId || state?.campaign?.id);
    const saveId = compactString(binding?.saveId || controller?.activeSaveId);
    if (!campaignId || !saveId) return null;
    return {
      key: [
        compactString(binding?.hostId) || runtimeHost?.id || 'host',
        campaignId,
        saveId
      ].join(':'),
      campaignId,
      saveId,
      branchId: compactString(state?.metadata?.branch?.branchId || state?.branchId) || 'main'
    };
  }

  function resetActiveCoreTurnStore(reason = 'runtime-core-store-reset') {
    activeCoreTurnStoreRecord = null;
    activeCoreTurnStorePending = null;
    return reason;
  }

  async function ensureActiveCoreTurnStore() {
    const descriptor = coreStoreDescriptorForState(campaignState);
    if (!descriptor) return null;
    if (activeCoreTurnStoreRecord?.key === descriptor.key) return activeCoreTurnStoreRecord.store;
    if (activeCoreTurnStorePending?.key === descriptor.key) return activeCoreTurnStorePending.promise;
    const promise = (async () => {
      const initialState = await loadCoreStoreStateV2(storageAdapter, {
        campaignId: descriptor.campaignId,
        saveId: descriptor.saveId,
        branchId: descriptor.branchId,
        now,
        missingOk: true
      });
      const store = createCoreStoreV2({
        adapter: storageAdapter,
        campaignId: descriptor.campaignId,
        saveId: descriptor.saveId,
        branchId: descriptor.branchId,
        now,
        initialState
      });
      activeCoreTurnStoreRecord = {
        ...descriptor,
        store
      };
      return store;
    })();
    activeCoreTurnStorePending = { key: descriptor.key, promise };
    try {
      return await promise;
    } finally {
      if (activeCoreTurnStorePending?.key === descriptor.key) activeCoreTurnStorePending = null;
    }
  }

  const runtimeCoreTurnStore = {
    async observeSource(...args) {
      const store = await ensureActiveCoreTurnStore();
      return createCoreTurnRuntime({ coreStore: store }).observeSource(...args);
    },
    async releaseHostContinue(...args) {
      const store = await ensureActiveCoreTurnStore();
      return createCoreTurnRuntime({ coreStore: store }).releaseHostContinue(...args);
    },
    async routePending(...args) {
      const store = await ensureActiveCoreTurnStore();
      return createCoreTurnRuntime({ coreStore: store }).routePending(...args);
    },
    async recordPendingInteraction(...args) {
      const store = await ensureActiveCoreTurnStore();
      return createCoreTurnRuntime({ coreStore: store }).recordPendingInteraction(...args);
    },
    async resolvePendingInteraction(...args) {
      const store = await ensureActiveCoreTurnStore();
      return createCoreTurnRuntime({ coreStore: store }).resolvePendingInteraction(...args);
    },
    async commitDirectiveMechanics(...args) {
      const store = await ensureActiveCoreTurnStore();
      return createCoreTurnRuntime({ coreStore: store }).commitDirectiveMechanics(...args);
    },
    async openRecovery(...args) {
      const store = await ensureActiveCoreTurnStore();
      return createCoreTurnRuntime({ coreStore: store }).openRecovery(...args);
    },
    async settleBackgroundBatch(...args) {
      const store = await ensureActiveCoreTurnStore();
      return createCoreTurnRuntime({ coreStore: store }).settleBackgroundBatch(...args);
    },
    async appendDiagnostic(...args) {
      const store = await ensureActiveCoreTurnStore();
      return createCoreTurnRuntime({ coreStore: store }).appendDiagnostic(...args);
    },
    async beginTurn(...args) {
      const store = await ensureActiveCoreTurnStore();
      if (typeof store?.beginTurn !== 'function') return null;
      return store.beginTurn(...args);
    },
    async advanceTurn(...args) {
      const store = await ensureActiveCoreTurnStore();
      if (typeof store?.advanceTurn !== 'function') return null;
      return store.advanceTurn(...args);
    },
    async recordCorePendingInteraction(...args) {
      const store = await ensureActiveCoreTurnStore();
      if (typeof store?.recordPendingInteraction !== 'function') return null;
      return store.recordPendingInteraction(...args);
    },
    async resolveCorePendingInteraction(...args) {
      const store = await ensureActiveCoreTurnStore();
      if (typeof store?.resolvePendingInteraction !== 'function') return null;
      return store.resolvePendingInteraction(...args);
    },
    async supersedeLatestSourceTransaction(...args) {
      const store = await ensureActiveCoreTurnStore();
      if (typeof store?.supersedeLatestSourceTransaction !== 'function') return null;
      return store.supersedeLatestSourceTransaction(...args);
    },
    async recordVisibleResponse(...args) {
      const store = await ensureActiveCoreTurnStore();
      if (typeof store?.recordVisibleResponse !== 'function') return null;
      return store.recordVisibleResponse(...args);
    },
    async repairVisibleResponseRef(...args) {
      const store = await ensureActiveCoreTurnStore();
      if (typeof store?.repairVisibleResponseRef !== 'function') return null;
      return store.repairVisibleResponseRef(...args);
    },
    async recordOutcomeReplacement(...args) {
      const store = await ensureActiveCoreTurnStore();
      if (typeof store?.recordOutcomeReplacement !== 'function') return null;
      return store.recordOutcomeReplacement(...args);
    },
    async recordRollbackActuation(...args) {
      const store = await ensureActiveCoreTurnStore();
      if (typeof store?.recordRollbackActuation !== 'function') {
        return {
          status: 'notRecorded',
          reason: 'core-rollback-writer-unavailable',
          transactionId: args[0] || null
        };
      }
      return store.recordRollbackActuation(...args);
    },
    async markRecoveryRequired(...args) {
      const store = await ensureActiveCoreTurnStore();
      if (typeof store?.markRecoveryRequired !== 'function') return null;
      return store.markRecoveryRequired(...args);
    },
    async getTransaction(...args) {
      const store = await ensureActiveCoreTurnStore();
      if (typeof store?.getTransaction !== 'function') return null;
      return store.getTransaction(...args);
    },
    async getRevisions(...args) {
      const store = await ensureActiveCoreTurnStore();
      if (typeof store?.getRevisions !== 'function') return null;
      return store.getRevisions(...args);
    },
    async commitMechanics(...args) {
      const store = await ensureActiveCoreTurnStore();
      if (typeof store?.commitMechanics !== 'function') return null;
      return store.commitMechanics(...args);
    },
    async commitBackgroundBatch(...args) {
      const store = await ensureActiveCoreTurnStore();
      if (typeof store?.commitBackgroundBatch !== 'function') return null;
      return store.commitBackgroundBatch(...args);
    },
    async appendDiagnostics(...args) {
      const store = await ensureActiveCoreTurnStore();
      if (typeof store?.appendDiagnostics !== 'function') return null;
      return store.appendDiagnostics(...args);
    },
    async appendDiagnosticsBatch(...args) {
      const store = await ensureActiveCoreTurnStore();
      if (typeof store?.appendDiagnosticsBatch === 'function') return store.appendDiagnosticsBatch(...args);
      if (typeof store?.appendDiagnostics !== 'function') return null;
      const [transactionId, diagnostics] = args;
      return Promise.all((Array.isArray(diagnostics) ? diagnostics : [diagnostics])
        .map((diagnostic) => store.appendDiagnostics(transactionId, diagnostic)));
    },
    async readProjections() {
      const store = await ensureActiveCoreTurnStore();
      return typeof store?.readProjections === 'function' ? store.readProjections() : null;
    },
    async readRecallIndexAuxiliaryEntries(refs = null) {
      const projections = refs
        ? null
        : (typeof this.readProjections === 'function' ? await this.readProjections() : null);
      const targetRefs = Array.isArray(refs)
        ? refs
        : (Array.isArray(projections?.recallIndex?.auxiliaryRefs) ? projections.recallIndex.auxiliaryRefs : []);
      return readCoreRecallIndexAuxiliaryEntries(storageAdapter, targetRefs);
    },
    async loadHead() {
      const store = await ensureActiveCoreTurnStore();
      return typeof store?.loadHead === 'function' ? store.loadHead() : null;
    }
  };

  function unknownDirectRuntimeExternalPromptEnvironment(observedAt) {
    return {
      kind: 'directive.externalPromptEnvironment.v1',
      schemaVersion: 1,
      host: runtimeHost?.id || 'direct-runtime',
      status: 'unknown',
      observedAt,
      worldInfo: {},
      memoryBooks: {},
      summaryception: {},
      vectFox: {},
      knownExternalPromptKeys: [],
      unknownSignals: ['direct-runtime-source-frame'],
      redactions: []
    };
  }

  function directRuntimeSourceFrame({ state, playerInput, turnPacket, observedAt }) {
    const binding = bindingFromState(state);
    const turnId = compactString(turnPacket?.turnId || turnPacket?.id || '');
    const textHash = fnv1a(playerInput);
    const ingressId = `ingress:direct-runtime:${state?.campaign?.id || 'campaign'}:${turnId || 'turn'}:${textHash}`;
    const chatId = binding?.chatId || state?.campaignChatBinding?.chatId || 'direct-runtime';
    return {
      ingressId,
      sourceFrame: createTurnSourceFrame({
        id: `frame:${ingressId}`,
        campaignId: state?.campaign?.id || null,
        saveId: state?.campaignChatBinding?.saveId || null,
        chatId,
        hostMessageId: ingressId,
        textHash,
        sourceRevision: state?.runtimeTracking?.revision || 0,
        externalPromptEnvironment: unknownDirectRuntimeExternalPromptEnvironment(observedAt),
        visibility: 'direct-runtime',
        currentPlayer: {
          hostMessageId: ingressId,
          role: 'player',
          textHash
        },
        createdAt: observedAt
      })
    };
  }

  async function ensureDirectRuntimeCoreIngress({
    state,
    turnPacket,
    playerInput,
    observedAt
  } = {}) {
    const tracked = initializeCampaignRuntimeTracking(state);
    const input = compactString(playerInput || turnPacket?.sceneSnapshot?.playerInput || '');
    if (!input) {
      const error = new Error('Direct runtime Director turn requires player input before CORE mechanics persistence.');
      error.code = 'DIRECTIVE_CORE_DIRECT_RUNTIME_SOURCE_REQUIRED';
      throw error;
    }
    const inputHash = fnv1a(input);
    const turnId = compactString(turnPacket?.turnId || turnPacket?.id || '');
    const activeIngressId = compactString(tracked.runtimeTracking?.activeIngressId);
    if (activeIngressId) {
      const existing = await findLedgerIngressAsync(tracked, { id: activeIngressId }, { coreTurnStore: runtimeCoreTurnStore });
      const existingTransactionId = compactString(existing?.coreTransactionId);
      const matchesInput = compactString(existing?.textHash) === inputHash;
      const matchesTurn = turnId && turnId.includes(activeIngressId);
      if (existingTransactionId && (matchesInput || matchesTurn)) return tracked;
    }
    const { ingressId, sourceFrame } = directRuntimeSourceFrame({
      state: tracked,
      playerInput: input,
      turnPacket,
      observedAt
    });
    const transactionId = `txn:${sourceFrame.id}`;
    const transaction = await runtimeCoreTurnStore.beginTurn(sourceFrame, {
      transactionId,
      ingressId,
      chatId: sourceFrame.chatId,
      idempotencyKey: `direct-runtime:${ingressId}`
    });
    const coreTransactionId = compactString(transaction?.id || transactionId);
    if (!coreTransactionId) {
      const error = new Error('CORE turn source observation is required before direct runtime mechanics persistence.');
      error.code = 'DIRECTIVE_CORE_INGRESS_REQUIRED';
      error.ingressId = ingressId;
      error.sourceFrameId = sourceFrame.id;
      throw error;
    }
    return recordTurnIngress(tracked, {
      id: ingressId,
      hostMessageId: ingressId,
      chatId: sourceFrame.chatId || null,
      campaignId: sourceFrame.campaignId || null,
      textHash: sourceFrame.textHash || null,
      receivedAt: observedAt,
      stateRevision: tracked.runtimeTracking?.revision || 0,
      sourceFrameId: sourceFrame.id,
      sourceFrame,
      coreTransactionId,
      authority: 'compatibilityProjection',
      projectionSource: 'coreStoreV2',
      status: 'received',
      turnId: turnPacket?.turnId || turnPacket?.id || null,
      outcomeId: turnPacket?.outcomePacket?.id || turnPacket?.finalOutcome?.id || null,
      coreProjection: {
        kind: 'directive.coreIngressDirectRuntimeProjectionRef.v1',
        ingressId,
        transactionId: coreTransactionId,
        sourceFrameId: sourceFrame.id,
        status: 'sourceObserved'
      },
      compatibilityMirror: {
        kind: 'directive.coreIngressCompatibilityMirror.v1',
        status: 'sourceObserved',
        transactionId: coreTransactionId,
        sourceFrameId: sourceFrame.id
      }
    }, {
      missingCoreWriteMode: 'reject'
    });
  }

  async function beginOutcomeRerunReplacementTransaction({
    ledgerEntry = null,
    outcomeId = null,
    replacementTurnId = null,
    replacementOutcomeId = null,
    replacementCandidateId = null,
    replacementInputHash = null,
    replacementType = 'rerunOutcome',
    playerInput = '',
    repairDecision = null,
    eventTime = null
  } = {}) {
    if (!repairDecision?.coreTransactionRequired && !repairDecision?.replacementTransactionRequired) {
      const error = new Error(`CORE outcome replacement transaction missing for rerun of outcome "${outcomeId || ledgerEntry?.outcomeId || 'unknown'}".`);
      error.code = 'DIRECTIVE_CORE_OUTCOME_REPLACEMENT_TRANSACTION_REQUIRED';
      error.details = {
        outcomeId: outcomeId || ledgerEntry?.outcomeId || null,
        repairDecision: cloneJson(repairDecision || null)
      };
      throw error;
    }
    const binding = bindingFromState(campaignState);
    const sourceFrame = buildOutcomeRerunSourceFrame({
      state: campaignState,
      binding,
      ledgerEntry,
      outcomeId,
      replacementTurnId,
      replacementCandidateId,
      replacementType,
      playerInput,
      replacementInputHash,
      eventTime,
      fallbackHostId: runtimeHost?.id || null
    });
    const transactionId = `txn:${sourceFrame.id}`;
    const replacementIngressId = `ingress:outcome-rerun:${compactString(replacementCandidateId) || sourceFrame.sourceHash?.slice(0, 16) || compactString(outcomeId || ledgerEntry?.outcomeId)}`;
    const transaction = await runtimeCoreTurnStore.beginTurn(sourceFrame, {
      transactionId,
      chatId: sourceFrame.chatId,
      ingressId: replacementIngressId,
      idempotencyKey: [
        'outcome-rerun',
        compactString(replacementCandidateId),
        compactString(repairDecision?.replacedTransactionId || ledgerEntry?.coreTransactionId || ledgerEntry?.transactionId),
        compactString(outcomeId || ledgerEntry?.outcomeId),
        compactString(replacementTurnId),
        sourceFrame.textHash || sourceFrame.sourceHash || 'source'
      ].join(':')
    });
    const replacementTransactionId = compactString(transaction?.id);
    if (!replacementTransactionId) {
      const error = new Error(`CORE outcome replacement transaction missing for rerun of outcome "${outcomeId || ledgerEntry?.outcomeId || 'unknown'}".`);
      error.code = 'DIRECTIVE_CORE_OUTCOME_REPLACEMENT_TRANSACTION_REQUIRED';
      error.details = {
        outcomeId: outcomeId || ledgerEntry?.outcomeId || null,
        repairDecision: cloneJson(repairDecision || null)
      };
      throw error;
    }
    return {
      repairDecision: {
        ...cloneJson(repairDecision || {}),
        transactionId: replacementTransactionId,
        replacementTransactionRequired: false
      },
      replacementTransactionId,
      replacementIngressId,
      replacementSourceFrame: sourceFrame,
      replacementIngress: {
        id: replacementIngressId,
        hostMessageId: sourceFrame.hostMessageId || null,
        chatId: sourceFrame.chatId || null,
        campaignId: sourceFrame.campaignId || null,
        textHash: sourceFrame.textHash || null,
        receivedAt: eventTime || timestampFromNow(now),
        stateRevision: campaignState?.runtimeTracking?.revision || 0,
        sourceFrameId: sourceFrame.id || null,
        sourceFrame,
        coreTransactionId: replacementTransactionId,
        authority: 'compatibilityProjection',
        projectionSource: 'coreStoreV2',
        coreProjection: outcomeRerunIngressProjection({
          replacementTransactionId,
          replacedTransactionId: repairDecision?.replacedTransactionId || ledgerEntry?.coreTransactionId || ledgerEntry?.transactionId || null,
          replacementIngressId,
          outcomeId: outcomeId || ledgerEntry?.outcomeId || null,
          replacementOutcomeId,
          replacementTurnId,
          sourceFrame,
          repairDecision
        }),
        repairDecision: {
          ...cloneJson(repairDecision || {}),
          transactionId: replacementTransactionId,
          replacementTransactionRequired: false
        },
        status: 'committed',
        classification: {
          classification: 'outcomeRerun',
          sourceKind: 'committedOutcome'
        },
        responseStrategy: 'directivePosted',
        turnId: compactString(replacementTurnId) || null,
        outcomeId: compactString(replacementOutcomeId) || null
      },
      coreTransaction: cloneJson(transaction || { id: replacementTransactionId })
    };
  }

  async function settleInternalForgeBackgroundBatch(prepared = null, {
    sourceFrameId = null,
    internalOwner = null,
    providerOwner = 'forge-internal',
    flushLens = false,
    appendDiagnostic = null
  } = {}) {
    if (!prepared?.transactionId || !prepared?.bundle) return null;
    if (typeof runtimeForgeCoordinator?.settleInternalBackgroundBatch === 'function') {
      const input = {
        transactionId: prepared.transactionId,
        bundle: prepared.bundle,
        sourceFrameRef: sourceFrameId ? { id: sourceFrameId } : prepared.bundle.sourceFrameRef,
        internalOwner,
        providerOwner,
        flushLens
      };
      if (typeof appendDiagnostic === 'function') input.appendDiagnostic = appendDiagnostic;
      return runtimeForgeCoordinator.settleInternalBackgroundBatch(input);
    }
    return runtimeCoreTurnStore.commitBackgroundBatch(prepared.transactionId, prepared.bundle);
  }

  const DEFAULT_LENS_PROMPT_DIRTY_DOMAINS = Object.freeze([
    'identity',
    'sceneTime',
    'missionQuestThread',
    'crewShipRelationship',
    'command',
    'continuity',
    'sourceBinding',
    'terminalRecovery'
  ]);

  function ensureLensPromptScheduler() {
    if (lensPromptScheduler) return lensPromptScheduler;
    lensPromptScheduler = createLensPromptScheduler({
      coreStore: runtimeCoreTurnStore,
      clock: () => timestampFromNow(now),
      installPromptPacket: async ({
        method = 'install',
        binding = {},
        packet = null,
        lane = 'visible',
        reason = 'lens-prompt-install',
        cacheKey = null,
        cacheInputs = {}
      } = {}) => {
        const requestedMethod = method === 'rebuild' && typeof runtimeHost?.prompt?.rebuild === 'function'
          ? 'rebuild'
          : 'install';
        if (typeof runtimeHost?.prompt?.[requestedMethod] !== 'function') {
          const error = new Error('Directive prompt installation is unavailable.');
          error.code = 'DIRECTIVE_PROMPT_API_UNAVAILABLE';
          throw error;
        }
        return runtimeHost.prompt[requestedMethod]({
          binding,
          packet,
          lane,
          reason,
          cacheKey,
          cacheInputs
        });
      },
      clearPromptPacket: async (options = {}) => runtimeHost?.prompt?.clear?.(options) || { ok: true },
      observeExternalPromptEnvironment: async (input = {}) => promptExternalEnvironmentForSync(input?.promptFrame || null)
    });
    return lensPromptScheduler;
  }

  async function clearDirectivePromptThroughLens({ transactionId = null, reason = 'runtime-clear' } = {}) {
    if (typeof runtimeHost?.prompt?.clear !== 'function') {
      return { ok: false, reason: 'prompt-adapter-unavailable' };
    }
    return ensureLensPromptScheduler().clearDirectivePrompt({
      transactionId,
      lane: 'all',
      allLanes: true,
      reason
    });
  }

  async function suspendDirectivePromptThroughLens({
    transactionId = null,
    reason = 'runtime-suspend',
    binding = null,
    activeChatId = null,
    boundChatId = null,
    source = null
  } = {}) {
    if (typeof runtimeHost?.prompt?.clear !== 'function') {
      return { ok: false, reason: 'prompt-adapter-unavailable' };
    }
    return ensureLensPromptScheduler().suspendDirectivePrompt({
      transactionId,
      lane: 'all',
      allLanes: true,
      reason,
      binding,
      activeChatId,
      boundChatId,
      source
    });
  }

  function promptMessageRefForLens(message = {}, index = 0) {
    const text = message?.text ?? message?.content ?? message?.mes ?? '';
    return {
      id: compactString(message?.id || message?.hostMessageId || message?.messageId || index),
      role: compactString(message?.role || message?.authorRole || (message?.is_user === true ? 'player' : 'assistant')),
      textHash: message?.textHash || hashStableJson({ text: String(text || '') })
    };
  }

  function promptFrameForLensCache(promptFrame = null) {
    const frame = promptFrame && typeof promptFrame === 'object' ? cloneJson(promptFrame) : {};
    const recentMessageRefs = Array.isArray(frame.recentChatMessages)
      ? frame.recentChatMessages.slice(-12).map(promptMessageRefForLens)
      : [];
    const acceptedAssistantVariant = frame.acceptedAssistantVariant || null;
    const acceptedAssistantVariantHash = acceptedAssistantVariant
      ? hashStableJson({
          id: acceptedAssistantVariant.id || acceptedAssistantVariant.hostMessageId || null,
          selectedSwipeIndex: acceptedAssistantVariant.selectedSwipeIndex ?? acceptedAssistantVariant.swipeIndex ?? null,
          textHash: acceptedAssistantVariant.textHash || hashStableJson({ text: String(acceptedAssistantVariant.text || acceptedAssistantVariant.mes || '') })
        })
      : null;
    const sourceHash = compactString(frame.turnSourceHash || frame.sourceHash)
      || hashStableJson({
        playerTextHash: frame.playerText ? hashStableJson({ text: String(frame.playerText) }) : null,
        recentMessageRefs,
        acceptedAssistantVariantHash,
        scene: frame.scene || null,
        activity: frame.activity || null
      });
    return {
      ...frame,
      turnSourceHash: sourceHash,
      sourceHash,
      recentMessageRefs,
      acceptedAssistantVariantHash,
      recentChatMessages: frame.recentChatMessages
    };
  }

  function promptExternalEnvironmentRefForSync(promptFrame = null) {
    const environment = promptExternalEnvironmentForSync(promptFrame);
    return environment?.externalPromptEnvironmentRef?.hash
      ? cloneJson(environment.externalPromptEnvironmentRef)
      : null;
  }

  function promptExternalEnvironmentForSync(promptFrame = null) {
    const frameRef = promptFrame?.externalPromptEnvironmentRef?.hash
      ? cloneJson(promptFrame.externalPromptEnvironmentRef)
      : null;
    const frameTargets = promptFrame?.externalPromptEnvironmentTargets || promptFrame?.externalPromptEnvironmentRef?.externalPromptEnvironmentTargets || null;
    const frameEnvironment = frameRef ? {
      host: 'sillytavern',
      status: frameRef.status || 'observed',
      chatId: compactString(promptFrame.chatId || promptFrame.binding?.chatId || campaignState?.campaignChatBinding?.chatId),
      saveId: compactString(promptFrame.saveId || promptFrame.binding?.saveId || campaignState?.campaignChatBinding?.saveId || controller?.activeSaveId),
      campaignId: compactString(promptFrame.campaignId || promptFrame.binding?.campaignId || campaignState?.campaign?.id),
      externalPromptEnvironmentRef: frameRef,
      knownExternalPromptKeys: cloneJson(frameRef.knownExternalPromptKeys || []),
      externalPromptEnvironmentTargets: cloneJson(frameTargets)
    } : null;
    try {
      const inspected = runtimeHost?.prompt?.inspect?.({ includeText: false }) || null;
      const inspectedRef = inspected?.externalPromptEnvironmentRef?.hash ? inspected.externalPromptEnvironmentRef : null;
      const ref = inspectedRef || frameRef;
      const knownExternalPromptKeys = [
        ...(Array.isArray(frameRef?.knownExternalPromptKeys) ? frameRef.knownExternalPromptKeys : []),
        ...(Array.isArray(inspected?.knownExternalPromptKeys)
        ? inspected.knownExternalPromptKeys
        : (Array.isArray(inspectedRef?.knownExternalPromptKeys) ? inspectedRef.knownExternalPromptKeys : []))
      ];
      if (!ref && !knownExternalPromptKeys.length && !inspected?.externalPromptEnvironmentTargets) return null;
      return {
        host: 'sillytavern',
        status: ref?.status || inspected?.status || 'observed',
        chatId: compactString(inspected?.binding?.chatId || campaignState?.campaignChatBinding?.chatId),
        saveId: compactString(inspected?.binding?.saveId || campaignState?.campaignChatBinding?.saveId || controller?.activeSaveId),
        campaignId: compactString(inspected?.binding?.campaignId || campaignState?.campaign?.id),
        externalPromptEnvironmentRef: ref ? cloneJson(ref) : null,
        knownExternalPromptKeys: cloneJson(knownExternalPromptKeys),
        finalHostPromptMayIncludeExternal: inspected?.finalHostPromptMayIncludeExternal ?? null,
        externalPromptEnvironmentTargets: cloneJson(inspected?.externalPromptEnvironmentTargets || frameTargets || null),
        unavailableSignals: cloneJson(inspected?.unavailableSignals || []),
        redactions: cloneJson(inspected?.redactions || [])
      };
    } catch {
      return frameEnvironment;
    }
  }

  function promptDirtyDomainsForSync({ promptFrame = null, activityContext = null } = {}) {
    const requested = [
      ...(Array.isArray(activityContext?.promptDirtyDomains) ? activityContext.promptDirtyDomains : []),
      ...(Array.isArray(promptFrame?.promptDirtyDomains) ? promptFrame.promptDirtyDomains : [])
    ];
    const normalized = normalizePromptDirtyDomains(requested.length ? requested : DEFAULT_LENS_PROMPT_DIRTY_DOMAINS);
    return normalized.length ? normalized : [...DEFAULT_LENS_PROMPT_DIRTY_DOMAINS];
  }

  function lensTransactionIdForPromptSync(activityContext = null) {
    const explicit = compactString(activityContext?.coreTransactionId || activityContext?.transactionId);
    if (explicit) return explicit;
    const ingress = runtimeIngressForContext(activityContext || {});
    return compactString(ingress?.coreTransactionId);
  }

  function lensCampaignContextForPromptSync(state = null, assets = null) {
    const binding = bindingFromState(state);
    const freshness = stateFreshnessCounters(state);
    const coreRevisions = isObject(state?.directiveRuntimeEvidence?.coreStoreReadProjections?.revisions)
      ? state.directiveRuntimeEvidence.coreStoreReadProjections.revisions
      : {};
    const coreMechanicsRevision = Math.max(0, Number(coreRevisions.mechanics) || 0);
    const coreRuntimeRevision = Math.max(0, Number(coreRevisions.runtime) || 0);
    const promptContextRevision = freshness.promptContextRevision;
    const domainVersionVector = {
      mechanicsRevision: coreMechanicsRevision || null,
      responseLedgerRevision: freshness.responseLedgerRevision,
      responseLedgerIntegritySelections: freshness.responseLedgerIntegritySelections
    };
    return {
      campaignId: compactString(state?.campaign?.id || binding?.campaignId),
      saveId: compactString(binding?.saveId || controller?.activeSaveId),
      chatId: compactString(binding?.chatId),
      branchId: compactString(binding?.branchId) || 'main',
      promptContextRevision,
      mechanicsRevision: coreMechanicsRevision || null,
      runtimeRevision: coreRuntimeRevision || null,
      domainVersionVector,
      policyHash: hashStableJson({
        simulationMode: state?.settings?.simulationMode || null,
        campaignStatus: state?.campaign?.status || null,
        promptContract: 'directive-lens-runtime-v1',
        lensPromptBudgetLanes: assets?.packageData?.contextPolicy?.lensPromptBudgetLanes || null
      }),
      promptBudgetLaneOverrides: cloneJson(assets?.packageData?.contextPolicy?.lensPromptBudgetLanes || null),
      packageVersion: compactString(assets?.packageData?.metadata?.version || assets?.packageData?.version || assets?.packageData?.id),
      crewDatasetHash: assets?.crewDataset ? hashStableJson({
        id: assets.crewDataset.id || null,
        version: assets.crewDataset.version || assets.crewDataset.metadata?.version || null
      }) : null,
      shipDatasetHash: assets?.shipDataset ? hashStableJson({
        id: assets.shipDataset.id || null,
        version: assets.shipDataset.version || assets.shipDataset.metadata?.version || null
      }) : null,
      projectionHash: assets?.projection ? hashStableJson({
        id: assets.projection.id || null,
        version: assets.projection.version || assets.projection.metadata?.version || null
      }) : null
    };
  }

  async function lensCacheInputsForPromptSync() {
    if (typeof runtimeCoreTurnStore?.readProjections !== 'function') return {};
    try {
      const projections = await runtimeCoreTurnStore.readProjections() || {};
      const recallIndexRevision = compactString(projections.recallIndex?.revision);
      const sceneSealRevision = compactString(projections.sceneSealRevision);
      const pressureArcDigestRevision = compactString(projections.pressureArcDigestRevision);
      const commandBearingEvidenceRevision = Array.isArray(projections.commandBearingEvidence) && projections.commandBearingEvidence.length
        ? hashStableJson(projections.commandBearingEvidence.map((entry) => ({
          evidenceId: entry.evidenceId || entry.id || null,
          evidenceHash: entry.evidenceHash || entry.hash || null,
          transactionId: entry.transactionId || null,
          batchId: entry.batchId || null,
          sourceFrameId: entry.sourceFrameId || null
        })))
        : null;
      return {
        ...(recallIndexRevision ? { recallIndexRevision } : {}),
        ...(sceneSealRevision ? { sceneSealRevision } : {}),
        ...(pressureArcDigestRevision ? { pressureArcDigestRevision } : {}),
        ...(commandBearingEvidenceRevision ? { commandBearingEvidenceRevision } : {})
      };
    } catch (error) {
      console.warn('[Directive] Failed to read CORE prompt cache inputs:', error);
      return {};
    }
  }

  async function coreRecallEntriesForPromptSync() {
    if (typeof runtimeCoreTurnStore?.readRecallIndexAuxiliaryEntries !== 'function') return [];
    try {
      return await runtimeCoreTurnStore.readRecallIndexAuxiliaryEntries() || [];
    } catch (error) {
      console.warn('[Directive] Failed to read CORE Recall auxiliary entries:', error);
      return [];
    }
  }

  async function coreSidecarDiagnosticCount() {
    if (typeof runtimeCoreTurnStore?.readProjections !== 'function') return null;
    try {
      const projections = await runtimeCoreTurnStore.readProjections() || {};
      return Array.isArray(projections.sidecarDiagnostics) ? projections.sidecarDiagnostics.length : 0;
    } catch (error) {
      console.warn('[Directive] Failed to read CORE sidecar diagnostics:', error);
      return null;
    }
  }

  async function coreSidecarResumeCount() {
    if (typeof runtimeCoreTurnStore?.readProjections !== 'function') return null;
    try {
      const projections = await runtimeCoreTurnStore.readProjections() || {};
      const diagnosticCount = Array.isArray(projections.sidecarDiagnostics) ? projections.sidecarDiagnostics.length : 0;
      const acceptedBackgroundWorkers = acceptedBackgroundBatchWorkerCount(projections.backgroundBatches);
      return Math.max(diagnosticCount, acceptedBackgroundWorkers);
    } catch (error) {
      console.warn('[Directive] Failed to read CORE sidecar resume count:', error);
      return null;
    }
  }

  async function stateWithCoreProjectionFreshnessEvidence(state = null) {
    if (!state || typeof runtimeCoreTurnStore?.readProjections !== 'function') return state;
    const stateDescriptor = coreStoreDescriptorForState(state);
    const activeDescriptor = coreStoreDescriptorForState(campaignState);
    if (
      !stateDescriptor
      || !activeDescriptor
      || stateDescriptor.key !== activeDescriptor.key
    ) {
      return state;
    }
    try {
      const evidence = coreProjectionFreshnessEvidence(await runtimeCoreTurnStore.readProjections(), state);
      if (!evidence) return state;
      const nextState = cloneJson(state);
      nextState.turnLedger = mergeCoreTurnLedgerProjection(nextState.turnLedger, evidence.turnLedger);
      return {
        ...nextState,
        directiveRuntimeEvidence: {
          ...cloneJson(nextState.directiveRuntimeEvidence || {}),
          coreStoreReadProjections: evidence
        }
      };
    } catch (error) {
      console.warn('[Directive] Failed to read CORE freshness projections:', error);
      return state;
    }
  }

  async function refreshViewCoreProjectionEvidence() {
    if (campaignState) {
      campaignState = await stateWithCoreProjectionFreshnessEvidence(modelCallJournal.applyPending(campaignState));
    }
    if (currentChatScope?.campaignState) {
      currentChatScope = {
        ...currentChatScope,
        campaignState: await stateWithCoreProjectionFreshnessEvidence(currentChatScope.campaignState)
      };
    }
  }

  async function refreshRuntimePersistenceAfterCoreDiagnostics(reason = 'Runtime CORE diagnostics refreshed.') {
    if (!campaignState) return null;
    const coreCount = await coreSidecarResumeCount();
    if (!Number.isFinite(coreCount) || coreCount <= 0) return null;
    const currentCount = stateFreshnessCounters(campaignState).sidecarJournalEntries;
    const persistedCount = Math.max(0, Number(campaignState.runtimeResume?.coreDiagnosticsPersistedSidecarCount) || 0);
    if (coreCount <= currentCount && persistedCount >= coreCount) return null;
    const stateWithFreshCoreEvidence = await stateWithCoreProjectionFreshnessEvidence(campaignState);
    campaignState = {
      ...cloneJson(stateWithFreshCoreEvidence || campaignState),
      runtimeResume: {
        ...cloneJson((stateWithFreshCoreEvidence || campaignState).runtimeResume || {}),
        sidecarCount: coreCount,
        coreDiagnosticsPersistedSidecarCount: coreCount
      }
    };
    return persistRuntimeCampaignState(campaignState, reason);
  }

  async function loadCampaignStateForSessionSave(saveId = null, binding = null, {
    saveRecord = null
  } = {}) {
    const id = compactString(saveId);
    if (!id) return null;
    await settleRuntimePersistenceQueue();
    const loadedBinding = bindingFromState(campaignState);
    const activeSaveId = compactString(controller?.activeSaveId);
    if (loadedBinding?.saveId === id && activeSessionCacheCurrentForSave(campaignState, {
      saveId: id,
      activeSaveId,
      saveRecord
    })) {
      return campaignState;
    }
    campaignState = stateWithLoadedSaveHeadEvidence(
      stateWithLoadedSaveBinding(
        applyRuntimeSettings(await controller.loadGame({ saveId: id })),
        id,
        binding
      ),
      { saveRecord, saveId: id }
    );
    resetActiveCoreTurnStore('session-save-loaded');
    pendingDirectorTurn = null;
    pendingOutcomeReplacement = null;
    await refreshCampaignView();
    return campaignState;
  }

  function saveMatchesChat(save, chatId, metadata = null) {
    const id = compactString(chatId);
    if (!id) return false;
    const metaCampaignId = compactString(metadata?.campaignId);
    const metaSaveId = compactString(metadata?.saveId);
    if (metaSaveId) {
      return Boolean(
        save?.id === metaSaveId
        && (!metaCampaignId || save?.metadata?.campaignId === metaCampaignId)
      );
    }
    const binding = bindingFromSave(save);
    if (binding?.chatId !== id) return false;
    if (metaCampaignId) {
      const saveCampaignId = compactString(binding.campaignId) || compactString(save?.metadata?.campaignId);
      return saveCampaignId === metaCampaignId;
    }
    return true;
  }

  function currentChatStatus({ activeChatId = '', metadata = null, save = null, state = null } = {}) {
    const loadedCampaignId = compactString(campaignState?.campaign?.id);
    const loadedSaveId = compactString(controller?.activeSaveId || campaignState?.campaignChatBinding?.saveId);
    const activeCampaignId = compactString(metadata?.campaignId || save?.metadata?.campaignId || state?.campaign?.id);
    const activeSaveId = compactString(metadata?.saveId || save?.id || state?.campaignChatBinding?.saveId);
    if (!activeChatId) return 'none-selected';
    if (!activeCampaignId && !activeSaveId && !state) return 'non-directive';
    if (loadedCampaignId && activeCampaignId && activeCampaignId !== loadedCampaignId) return 'different-campaign';
    if (loadedSaveId && activeSaveId && activeSaveId !== loadedSaveId) return 'different-save';
    return 'matching-campaign';
  }

  function runtimeRevisionOf(state = null) {
    const revisions = isObject(state?.directiveRuntimeEvidence?.coreStoreReadProjections?.revisions)
      ? state.directiveRuntimeEvidence.coreStoreReadProjections.revisions
      : {};
    if (Number.isFinite(Number(revisions.runtime))) return Math.max(0, Number(revisions.runtime) || 0);
    return Number(state?.runtimeTracking?.revision || 0);
  }

  async function preferFresherInMemoryChatState(candidateState = null, inMemoryState = null, chatId = null) {
    const mergedCandidate = mergeFresherResponseLedgerProjection(candidateState, inMemoryState);
    const inMemoryForComparison = await stateWithCoreProjectionFreshnessEvidence(inMemoryState);
    if (!shouldPreferInMemoryCampaignState(candidateState, inMemoryForComparison, {
      chatId,
      fallbackHostId: runtimeHost?.id || null,
      fallbackSaveId: controller?.activeSaveId || null
    })) {
      return mergedCandidate;
    }
    campaignState = cloneJson(inMemoryState);
    return campaignState;
  }

  function chatNativeViewForState(state = null, saveGuard = null) {
    if (!state) return null;
    const freshness = stateFreshnessCounters(state);
    const runtimeLedgerView = createRuntimeLedgerView(state || {});
    const runtimeResponseLedger = runtimeLedgerView.responseLedger || [];
    const runtimeRecoveryJournal = runtimeLedgerView.recoveryJournal || [];
    const modelCallDiagnostics = coreModelCallDiagnosticsForState(state);
    const legacyModelCallTelemetry = legacyModelCallTelemetryForState(state);
    const binding = cloneJson(state.campaignChatBinding || null);
    if (binding) delete binding.promptContext;
    const lensPromptRecord = state.directiveRuntimeEvidence?.lensPromptRevisionRecord || {};
    const promptHash = compactString(
      lensPromptRecord.hash
      || lensPromptRecord.packetHash
      || lensPromptRecord.contentHash
      || state.campaignChatBinding?.promptContextHash
      || state.runtimeResume?.promptContextHash
    );
    const promptRevision = Math.max(
      0,
      Number(lensPromptRecord.revision) || 0,
      Number(state.campaignChatBinding?.promptContextRevision) || 0,
      Number(state.runtimeResume?.promptContextRevision) || 0
    );
    return {
      binding,
      activation: cloneJson(state.activationJournal || null),
      openingScene: campaignOpeningSceneStatus(state),
      tracking: state.runtimeTracking ? {
        revision: state.runtimeTracking.revision || 0,
        lastStableRevision: state.runtimeTracking.lastStableRevision || 0,
        historyDepth: state.runtimeTracking.history?.length || 0,
        ingressCount: runtimeLedgerView.ingressLedger?.length || 0,
        responseCount: runtimeResponseLedger.length,
        responseLedgerRevision: freshness.responseLedgerRevision,
        responseLedgerIntegritySelections: runtimeResponseLedger
          .filter((entry) => entry?.outcomeIntegrity?.selectedRevisionId).length,
        sidecarCount: freshness.sidecarJournalEntries,
        modelCallCount: modelCallDiagnostics.length,
        modelCallEventSequence: maxModelCallEventSequence(state),
        lastDelta: cloneJson(state.runtimeTracking.lastDelta || null),
        lastCommittedTurn: cloneJson(lastCommittedTurnPresentationForState(state) || null),
        latestModelCall: cloneJson(modelCallDiagnostics.at(-1) || null),
        legacyModelCallCount: legacyModelCallTelemetry.length,
        latestLegacyModelCall: cloneJson(legacyModelCallTelemetry.at(-1) || null)
      } : null,
      prompt: {
        kind: compactString(lensPromptRecord.kind) || 'directive.lensPromptRevisionRecord.v1',
        revision: promptRevision,
        hash: promptHash || null,
        status: compactString(lensPromptRecord.status) || null,
        installedAt: compactString(lensPromptRecord.installedAt) || null,
        blockCount: Number(lensPromptRecord.blockCount) || 0,
        directiveOwnedPromptKeyCount: Number(lensPromptRecord.directiveOwnedPromptKeyCount) || 0,
        active: Boolean(promptRevision || promptHash)
      },
      manualSaveGuard: cloneJson(saveGuard || null),
      pendingInteractions: cloneJson(pendingInteractionProjectionRows(state)),
      recovery: cloneJson(runtimeRecoveryJournal),
      modelCalls: cloneJson(modelCallDiagnostics),
      legacyModelCallTelemetry: cloneJson(legacyModelCallTelemetry),
      turnStatus: chatTurnStatusForState(state),
      sceneReconciliation: cloneJson(state.sceneReconciliation || null)
    };
  }

  function chatTurnStatusForState(state = null) {
    if (!latestChatTurnStatus || !state) return null;
    const binding = state.campaignChatBinding || {};
    if (latestChatTurnStatus.campaignId && latestChatTurnStatus.campaignId !== state.campaign?.id) return null;
    if (latestChatTurnStatus.saveId && latestChatTurnStatus.saveId !== binding.saveId) return null;
    if (latestChatTurnStatus.chatId && latestChatTurnStatus.chatId !== binding.chatId) return null;
    return cloneJson(latestChatTurnStatus);
  }

  function turnStatusLabelForActivity(event = {}) {
    const phase = compactString(event.phase);
    if (['reading', 'sceneHandshakeSkipped', 'settlingSceneHandshake', 'sceneHandshakeSettled'].includes(phase)) {
      return { label: 'Directive is reading', tone: 'running' };
    }
    if (['classifying', 'classified', 'routing'].includes(phase)) {
      return { label: 'Arbitrating response owner', tone: 'running' };
    }
    if (phase === 'delegatingHostGeneration' || event.responseStrategy === 'injectAndContinue') {
      return { label: 'Host will continue', tone: 'success' };
    }
    if (phase === 'committingOutcome' || event.responseStrategy === 'directivePosted') {
      return { label: 'Directive will resolve', tone: 'success' };
    }
    if (phase === 'recovery' || event.responseStrategy === 'pause') {
      return { label: 'Needs review', tone: 'warning' };
    }
    return null;
  }

  function turnStatusFromResult(result = {}, fallback = {}) {
    if (result?.responseStrategy === 'pause') {
      return { label: 'Needs review', tone: 'warning' };
    }
    if (result?.responseStrategy === 'directivePosted') {
      return { label: 'Directive will resolve', tone: 'success' };
    }
    if (result?.responseStrategy === 'injectAndContinue') {
      return { label: 'Host will continue', tone: 'success' };
    }
    return turnStatusLabelForActivity(fallback) || { label: 'Directive is reading', tone: 'running' };
  }

  function recordChatTurnStatus({ status, event = {}, result = null, chatId = null } = {}) {
    if (!status?.label) return;
    const binding = campaignState?.campaignChatBinding || {};
    latestChatTurnStatus = {
      kind: 'directive.chatTurnStatus.v1',
      label: status.label,
      tone: status.tone || 'running',
      phase: compactString(event.phase) || null,
      route: result?.responseStrategy || event.responseStrategy || null,
      classification: result?.decision?.classification || event.classification || null,
      ingressId: result?.record?.id || result?.decision?.ingressId || event.ingressId || null,
      chatId: compactString(chatId || event.chatId || binding.chatId),
      campaignId: compactString(campaignState?.campaign?.id),
      saveId: compactString(binding.saveId),
      updatedAt: timestampFromNow(now)
    };
  }

  function liveCampaignStateForView() {
    const scoped = currentChatScope?.campaignState || null;
    if (shouldPreferInMemoryCampaignState(scoped, campaignState, {
      chatId: currentChatScope?.currentChat?.chatId || null,
      fallbackHostId: runtimeHost?.id || null,
      fallbackSaveId: controller?.activeSaveId || null
    })) {
      return campaignState;
    }
    if (scoped) return scoped;
    return null;
  }

  function shouldRenderLoadedCampaignState(tabId, currentChatCampaignState = null) {
    if (currentChatCampaignState || !campaignState) return false;
    if (!['campaign', 'mission'].includes(tabId)) return false;
    const campaignStatus = compactString(campaignState.campaign?.status);
    if (['activating', 'activationFailed'].includes(campaignStatus)) return true;
    if (currentChatScope?.error) return false;
    if (['metadata-conflict', 'different-save', 'different-campaign'].includes(currentChatScope?.currentChat?.status)) return false;
    const loadedBinding = bindingFromState(campaignState);
    const activeChatId = compactString(currentChatScope?.currentChat?.chatId);
    return Boolean(
      campaignStatus === 'active'
      && activeChatId
      && loadedBinding?.chatId
      && loadedBinding.chatId === activeChatId
    );
  }

  async function refreshBlockedManualSaveGuard() {
    if (!campaignState) return null;
    const binding = bindingFromState(campaignState);
    const guard = await evaluateActiveChatSaveGuard(campaignState, {
      expectedSaveId: binding?.saveId || controller?.activeSaveId || null
    });
    lastManualSaveGuard = cloneJson(guard);
    return guard;
  }

  function campaignSessionStatus(save = null, binding = null) {
    if (save?.metadata?.campaignStatus) return save.metadata.campaignStatus;
    if (!binding?.chatId) return 'needs-chat';
    if (save?.current === true) return 'current';
    return save?.slotType === 'autosave' ? 'autosave' : 'stored';
  }

  function saveUpdatedAtValue(save = null) {
    const parsed = Date.parse(save?.updatedAt || save?.metadata?.lastUpdatedAt || '');
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function compareSavesByLatest(left = null, right = null) {
    const time = saveUpdatedAtValue(right) - saveUpdatedAtValue(left);
    if (time !== 0) return time;
    const updated = String(right?.updatedAt || right?.metadata?.lastUpdatedAt || '')
      .localeCompare(String(left?.updatedAt || left?.metadata?.lastUpdatedAt || ''));
    if (updated !== 0) return updated;
    return String(right?.id || '').localeCompare(String(left?.id || ''));
  }

  function buildCampaignSessions() {
    const saves = Array.isArray(campaignView?.saves) ? campaignView.saves : [];
    const currentChat = currentChatScope?.currentChat || null;
    const groups = new Map();
    for (const save of saves) {
      if (!save?.id) continue;
      const key = campaignCommandKeyForSave(save);
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          saves: []
        });
      }
      groups.get(key).saves.push(save);
    }
    return [...groups.values()].map((group) => {
      const sortedSaves = group.saves.slice().sort(compareSavesByLatest);
      const save = sortedSaves[0];
      const binding = bindingFromSave(save);
      const currentSave = sortedSaves.find((entry) => entry?.current === true) || null;
      const currentChatSave = currentChat?.chatId
        ? sortedSaves.find((entry) => saveMatchesChat(entry, currentChat.chatId, currentChat.metadata))
        : null;
      const currentChatMatch = Boolean(currentChatSave);
      const saveCount = sortedSaves.length;
      const autosaveCount = sortedSaves.filter((entry) => entry?.slotType === 'autosave').length;
      const branchCount = sortedSaves.filter((entry) => entry?.metadata?.branch).length;
      return {
        key: group.key,
        saveId: save.id,
        latestSaveId: save.id,
        latestSaveName: save.name || save.id,
        currentSaveId: currentSave?.id || null,
        currentSaveName: currentSave?.name || null,
        currentChatSaveId: currentChatSave?.id || null,
        currentChatSaveName: currentChatSave?.name || null,
        campaignId: save.metadata?.campaignId || binding?.campaignId || null,
        campaignTitle: save.metadata?.campaignTitle || 'Campaign',
        packageId: save.metadata?.packageId || null,
        packageTitle: save.metadata?.packageTitle || null,
        playerName: save.metadata?.playerName || 'Player Commander',
        shipName: save.metadata?.shipName || null,
        saveName: save.name || save.id,
        slotType: save.slotType || 'manual',
        current: save.current === true,
        updatedAt: save.updatedAt || save.metadata?.lastUpdatedAt || null,
        stardate: save.metadata?.stardate || null,
        activeMissionId: save.metadata?.activeMissionId || null,
        activePhaseId: save.metadata?.activePhaseId || null,
        simulationMode: save.metadata?.simulationMode || null,
        summary: save.metadata?.summary || null,
        binding: cloneJson(binding),
        status: campaignSessionStatus(save, binding),
        hidden: uiPreferences.hasHiddenSessionKey(group.key),
        currentChat: currentChatMatch,
        currentChatBinding: cloneJson(currentChatSave ? bindingFromSave(currentChatSave) : null),
        saveCount,
        autosaveCount,
        userSaveCount: saveCount - autosaveCount,
        branchCount,
        attention: !binding?.chatId ? 'missing-chat' : (currentChatMatch ? 'current-chat' : null)
      };
    }).sort((left, right) => {
      if (left.hidden !== right.hidden) return left.hidden ? 1 : -1;
      const time = saveUpdatedAtValue({ updatedAt: right.updatedAt }) - saveUpdatedAtValue({ updatedAt: left.updatedAt });
      if (time !== 0) return time;
      return String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''));
    });
  }

  function campaignIndexView() {
    const packages = (campaignView?.packages || []).map((summary) => {
      const packageId = summary?.packageId || summary?.id || '';
      if (!packageId || !controller?.getPackageContext) return summary;
      try {
        const context = controller.getPackageContext({ packageId });
        return {
          ...summary,
          campaign: {
            title: context?.campaign?.title || summary?.title || '',
            premise: context?.campaign?.premise || summary?.premise || ''
          },
          ship: cloneJson(context?.ship || null),
          assets: cloneJson(context?.assets || {})
        };
      } catch (_) {
        return summary;
      }
    });
    return buildCampaignView({
      saves: campaignView?.saves || [],
      packages,
      checkpoints: campaignView?.checkpoints || [],
      selectedCampaignId: uiPreferences.selectedCampaignId?.() || ''
    });
  }

  async function refreshCurrentChatCampaignScope() {
    const inMemoryStateBeforeRefresh = campaignState ? cloneJson(campaignState) : null;
    const current = await currentHostChatForSaveGuard();
    const base = {
      currentChat: {
        capability: current.capability === true,
        chatId: current.activeChatId || null,
        identity: cloneJson(current.activeIdentity || null),
        metadata: null,
        status: current.capability ? 'none-selected' : 'missing-capability'
      },
      campaignState: null,
      saveId: null,
      campaignId: null,
      guard: null,
      error: null
    };
    const suppressedOpen = activeProgrammaticChatOpenSuppression();
    if (suppressedOpen) {
      const binding = bindingFromState(campaignState);
      const guard = await refreshBlockedManualSaveGuard();
      const status = current.activeChatId && binding?.chatId && current.activeChatId === binding.chatId
        ? 'matching-campaign'
        : 'programmatic-open-pending';
      currentChatScope = {
        ...base,
        currentChat: {
          ...base.currentChat,
          chatId: current.activeChatId || null,
          identity: cloneJson(current.activeIdentity || null),
          status
        },
        campaignState: cloneJson(campaignState || null),
        saveId: binding?.saveId || controller?.activeSaveId || null,
        campaignId: binding?.campaignId || campaignState?.campaign?.id || null,
        guard: cloneJson(guard || null)
      };
      return currentChatScope;
    }
    if (!current.capability) {
      const guard = await refreshBlockedManualSaveGuard();
      currentChatScope = {
        ...base,
        guard: cloneJson(guard || null)
      };
      return currentChatScope;
    }
    if (!current.activeChatId) {
      const guard = await refreshBlockedManualSaveGuard();
      currentChatScope = {
        ...base,
        guard: cloneJson(guard || null)
      };
      return currentChatScope;
    }

    const { metadata, error } = await currentHostChatMetadataForSaveGuard();
    base.currentChat.metadata = cloneJson(metadata || null);
    if (error) {
      currentChatScope = {
        ...base,
        currentChat: {
          ...base.currentChat,
          status: 'metadata-conflict'
        },
        error: { message: error?.message || String(error) }
      };
      return currentChatScope;
    }

    const saves = Array.isArray(campaignView?.saves) ? campaignView.saves : [];
    const save = saves.find((entry) => saveMatchesChat(entry, current.activeChatId, metadata)) || null;
    let resolvedState = null;
    let status = 'non-directive';
    let guard = null;
    if (save) {
      try {
        resolvedState = await loadCampaignStateForSessionSave(save.id, bindingFromSave(save) || normalizedBinding(metadata || null), {
          saveRecord: save
        });
        resolvedState = await preferFresherInMemoryChatState(resolvedState, inMemoryStateBeforeRefresh, current.activeChatId);
        const binding = bindingFromState(resolvedState);
        if (binding?.chatId && binding.chatId !== current.activeChatId) {
          status = 'metadata-conflict';
        } else {
          status = currentChatStatus({
            activeChatId: current.activeChatId,
            metadata,
            save,
            state: resolvedState
          });
          guard = await evaluateActiveChatSaveGuard(resolvedState, { expectedSaveId: save.id });
        }
      } catch (loadError) {
        status = 'missing-save';
        base.error = { message: loadError?.message || String(loadError) };
      }
    } else if (metadata?.saveId || metadata?.campaignId) {
      status = 'missing-save';
    } else {
      const loadedBinding = bindingFromState(campaignState);
      if (loadedBinding?.chatId && loadedBinding.chatId === current.activeChatId) {
        resolvedState = campaignState;
        status = currentChatStatus({
          activeChatId: current.activeChatId,
          metadata,
          state: resolvedState
        });
        guard = await evaluateActiveChatSaveGuard(resolvedState, { expectedSaveId: loadedBinding.saveId || controller?.activeSaveId || null });
      }
    }

    if (!guard && campaignState) {
      const loadedBinding = bindingFromState(campaignState);
      guard = await evaluateActiveChatSaveGuard(campaignState, {
        expectedSaveId: loadedBinding?.saveId || controller?.activeSaveId || null
      });
    }

    if (guard) {
      lastManualSaveGuard = cloneJson(guard);
    }

    currentChatScope = {
      ...base,
      currentChat: {
        ...base.currentChat,
        status
      },
      campaignState: cloneJson(resolvedState),
      saveId: save?.id || bindingFromState(resolvedState)?.saveId || null,
      campaignId: save?.metadata?.campaignId || resolvedState?.campaign?.id || null,
      guard: cloneJson(guard || null)
    };
    return currentChatScope;
  }

  function providerViewData() {
    if (!runtimeHost?.providers) return null;
    try {
      return {
        settings: cloneJson(runtimeHost.providers.getSettings?.() || runtimeHost.providers.settings?.getAll?.() || null),
        validation: cloneJson(runtimeHost.providers.validate?.() || null),
        status: {
          utility: cloneJson(runtimeHost.providers.status?.('utility') || null),
          reasoning: cloneJson(runtimeHost.providers.status?.('reasoning') || null)
        },
        roleRouting: cloneJson(runtimeHost.providers.listRoleRouting?.() || []),
        profiles: cloneJson(runtimeHost.providers.listProfiles?.() || [])
      };
    } catch (error) {
      return {
        error: { message: error?.message || String(error) }
      };
    }
  }

  function directivePresetViewData() {
    if (!runtimeHost?.presets) return null;
    try {
      const status = runtimeHost.presets.latestStatus?.() || runtimeHost.presets.getStatus?.() || null;
      lastDirectivePresetStatus = cloneJson(status);
      return {
        status: cloneJson(status),
        autoCheck: cloneJson(runtimeHost.presets.getAutoCheckPreference?.() || null),
        lastInstallResult: cloneJson(lastDirectivePresetInstallResult)
      };
    } catch (error) {
      return {
        status: {
          state: 'error',
          pill: 'Error',
          message: error?.message || String(error),
          canInstall: false
        },
        autoCheck: null,
        lastInstallResult: cloneJson(lastDirectivePresetInstallResult)
      };
    }
  }

  function missionSelectionScope(renderedState = liveCampaignStateForView()) {
    const campaignId = compactString(renderedState?.campaign?.id);
    const chatId = compactString(
      currentChatScope?.currentChat?.chatId
      || renderedState?.campaignChatBinding?.chatId
    );
    return campaignId && chatId ? `campaign:${campaignId}::chat:${chatId}` : null;
  }

  function playerFacingInformationForState(renderedState = liveCampaignStateForView()) {
    const renderedAssets = optionalRuntimeAssetsForState(renderedState);
    const openWorld = renderedState && renderedAssets?.packageData
      ? openWorldQuestView(renderedState, renderedAssets.packageData)
      : null;
    const playerSafeCampaign = createPlayerSafeCampaignProjection({
      campaignState: renderedState,
      packageData: renderedAssets?.packageData || null,
      crewDataset: renderedAssets?.crewDataset || null
    });
    const commandBearingPlayerView = renderedState
      ? projectCommandBearingForPlayer(migrateCommandBearingState(renderedState))
      : null;
    const information = buildPlayerFacingInformation({
      campaignState: renderedState,
      coreProjections: {
        playerSafeCampaign,
        commandBearingPlayerView,
        packageData: renderedAssets?.packageData || null,
        crewDataset: renderedAssets?.crewDataset || null
      },
      runtimeView: {
        openWorld,
        pendingDirectorTurn: publicPendingDirectorTurnProjection(pendingDirectorTurn, pendingOutcomeReplacement),
        pendingOutcomeReplacement,
        lastError,
        lastStateSafetyResult
      }
    });
    const scopeKey = missionSelectionScope(renderedState);
    const activeMissionId = compactString(
      renderedState?.mission?.id
      || renderedState?.activeMissionId
      || renderedState?.mission?.activeMissionId
    );
    const selectedQuestId = resolveSelectedQuestId({
      quests: information.quests,
      selectedQuestId: scopeKey ? uiPreferences.selectedQuestId(scopeKey) : null,
      activeMissionId
    });
    return {
      ...information,
      selectionScopeKey: scopeKey,
      selectedQuestId
    };
  }

  function viewEnvelope(tabId) {
    if (campaignState) campaignState = modelCallJournal.applyPending(campaignState);
    const currentChatCampaignState = liveCampaignStateForView();
    const renderLoadedCampaignState = shouldRenderLoadedCampaignState(tabId, currentChatCampaignState);
    const renderedCampaignState = currentChatCampaignState || (renderLoadedCampaignState ? campaignState : null);
    const activePackage = controller?.activePackageId
      ? controller.getPackageContext({ packageId: controller.activePackageId })
      : null;
    const currentChatActivePackage = packageContextForState(renderedCampaignState);
    const renderedAssets = optionalRuntimeAssetsForState(renderedCampaignState);
    const loadedAssets = optionalRuntimeAssetsForState(campaignState);
    const renderedSaveGuard = renderLoadedCampaignState ? lastManualSaveGuard : (currentChatScope?.guard || null);
    let openWorld = null;
    if (renderedCampaignState) {
      if (renderedAssets?.packageData) {
        openWorld = openWorldQuestView(renderedCampaignState, renderedAssets.packageData);
      }
    }
    const commandBearingPlayerView = renderedCampaignState
      ? projectCommandBearingForPlayer(migrateCommandBearingState(renderedCampaignState))
      : null;
    const loadedCommandBearingPlayerView = campaignState
      ? projectCommandBearingForPlayer(migrateCommandBearingState(campaignState))
      : null;
    const playerCharacterView = renderedCampaignState
      ? createPlayerCharacterView({
          campaignState: renderedCampaignState,
          packageData: renderedAssets?.packageData || null,
          crewDataset: renderedAssets?.crewDataset || null,
          commandBearingPlayerView
        })
      : null;
    const loadedPlayerCharacterView = campaignState
      ? createPlayerCharacterView({
          campaignState,
          packageData: loadedAssets?.packageData || null,
          crewDataset: loadedAssets?.crewDataset || null,
          commandBearingPlayerView: loadedCommandBearingPlayerView
        })
      : null;
    const promptInspection = (() => {
      try {
        return runtimeHost?.prompt?.inspect?.() || null;
      } catch (_) {
        return null;
      }
    })();
    const continuityProjectionDiagnostics = renderedCampaignState
      ? buildContinuityProjectionDiagnostics({ campaignState: renderedCampaignState, promptInspection })
      : null;
    const continuityTelemetry = renderedCampaignState
      ? buildContinuityTelemetry({ campaignState: renderedCampaignState, promptInspection })
      : null;
    const playerSafeCampaign = createPlayerSafeCampaignProjection({
      campaignState: renderedCampaignState,
      packageData: renderedAssets?.packageData || null,
      crewDataset: renderedAssets?.crewDataset || null
    });
    const chatNative = chatNativeViewForState(renderedCampaignState, renderedSaveGuard);
    const playerFacingInformation = playerFacingInformationForState(renderedCampaignState);
    return {
      kind: 'directive.runtimeView',
      activeTab: tabId,
      activeScreen,
      activePackageId: controller?.activePackageId || campaignView?.activePackageId || null,
      activeSaveId: controller?.activeSaveId || campaignView?.activeSaveId || null,
      activePackage: cloneJson(activePackage),
      currentChatActivePackage: cloneJson(currentChatActivePackage),
      campaign: campaignViewEnvelope(),
      campaignIndex: campaignIndexView(),
      creator: cloneJson(creatorView),
      campaignState: cloneJson(renderedCampaignState),
      currentChatCampaignState: cloneJson(currentChatCampaignState),
      loadedCampaignState: cloneJson(campaignState),
      continuityProjectionDiagnostics: cloneJson(continuityProjectionDiagnostics),
      continuityTelemetry: cloneJson(continuityTelemetry),
      promptInspection: cloneJson(promptInspection),
      loadedSave: {
        saveId: controller?.activeSaveId || campaignState?.campaignChatBinding?.saveId || null,
        campaignId: campaignState?.campaign?.id || null,
        status: campaignState ? (currentChatCampaignState || renderLoadedCampaignState ? 'loaded' : 'loaded-not-current-chat') : 'none'
      },
      playerSafeCampaign,
      loadedPlayerSafeCampaign: createPlayerSafeCampaignProjection({
        campaignState,
        packageData: loadedAssets?.packageData || null,
        crewDataset: loadedAssets?.crewDataset || null
      }),
      commandBearingPlayerView: cloneJson(commandBearingPlayerView),
      loadedCommandBearingPlayerView: cloneJson(loadedCommandBearingPlayerView),
      playerCharacterView: cloneJson(playerCharacterView),
      loadedPlayerCharacterView: cloneJson(loadedPlayerCharacterView),
      chatNative,
      loadedChatNative: chatNativeViewForState(campaignState, lastManualSaveGuard),
      playerFacingInformation: cloneJson(playerFacingInformation),
      currentChat: cloneJson(currentChatScope?.currentChat || null),
      currentChatCampaignGuard: cloneJson(currentChatScope?.guard || null),
      providerConfiguration: providerViewData(),
      directivePreset: directivePresetViewData(),
      host: runtimeHost ? {
        id: runtimeHost.id,
        displayName: runtimeHost.displayName,
        capabilities: cloneJson(runtimeHost.capabilities)
      } : null,
      media: {
        playerPortraitImportSupported: canStorePlayerPortraits()
      },
      storageDiagnostics: cloneJson(controller?.storageDiagnostics || null),
      lastDirectorTurn: cloneJson(lastDirectorTurn),
      lastNarrationResult: cloneJson(lastNarrationResult),
      lastCommandLogSummarySidecarResult: cloneJson(lastCommandLogSummarySidecarResult),
      lastOpenWorldActionResult: cloneJson(lastOpenWorldActionResult),
      lastDirectiveAssistResult: cloneJson(lastDirectiveAssistResult),
      lastSceneReconciliationResult: cloneJson(lastSceneReconciliationResult),
      lastCharacterCreatorSectionDraftResult: cloneJson(lastCharacterCreatorSectionDraftResult),
      lastStateSafetyResult: cloneJson(lastStateSafetyResult),
      lastActivationResult: cloneJson(lastActivationResult),
      lastConclusionResult: cloneJson(lastConclusionResult),
      lastDirectivePresetInstallResult: cloneJson(lastDirectivePresetInstallResult),
      pendingDirectorTurn: publicPendingDirectorTurnProjection(pendingDirectorTurn, pendingOutcomeReplacement),
      pendingOutcomeReplacement: cloneJson(pendingOutcomeReplacement),
      openWorld: cloneJson(openWorld),
      lastError: lastError ? {
        message: lastError.message || String(lastError)
      } : null
    };
  }

  async function autosaveStableTurn(outcomeId) {
    const interval = normalizeAutosaveEveryMessages(campaignState?.settings?.autosaveEveryMessages);
    const messageCount = committedMessageCount(campaignState);
    if (!shouldAutosaveStableTurn(campaignState)) {
      return {
        ok: true,
        skipped: true,
        reason: 'autosave-interval',
        outcomeId: outcomeId || null,
        messageCount,
        autosaveEveryMessages: interval,
        nextAutosaveIn: messageCount > 0 ? interval - (messageCount % interval) : interval
      };
    }
    try {
      const result = await controller.autosaveCurrentGame({
        campaignState,
        summary: `Autosave after ${messageCount} committed message${messageCount === 1 ? '' : 's'}.`,
        keep: 3
      });
      await refreshCampaignView();
      return {
        ok: true,
        skipped: false,
        outcomeId: outcomeId || null,
        messageCount,
        autosaveEveryMessages: interval,
        ...cloneJson(result)
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          message: error?.message || String(error)
        }
      };
    }
  }

  const OPEN_WORLD_MUTATION_DOMAINS = Object.freeze([
    'campaign',
    'mission',
    'worldState',
    'storyArcLedger',
    'questLedger',
    'dynamicQuestCatalog',
    'knowledgeLedger',
    'threadLedger',
    'eventLedger',
    'attentionState',
    'pressureLedger',
    'relationships',
    'crew',
    'ship',
    'campaignTracks',
    'campaignAssets',
    'turnLedger',
    'commandLog',
    'runtimeTracking'
  ]);

  async function commitOpenWorldMutation(nextState, {
    source = 'openWorldRuntime',
    reason = 'Open-world campaign state updated.',
    summary = reason,
    eventId = null,
    stable = true
  } = {}) {
    requireObject(nextState, 'nextState');
    const gateway = createStateDeltaGateway({
      getState: () => campaignState,
      setState: (state) => { campaignState = cloneJson(state); },
      persist: (state, delta) => persistRuntimeCampaignState(state, delta?.summary || delta?.reason || summary),
      now
    });
    const tracked = await gateway.commit(nextState, {
      source,
      reason,
      summary,
      domains: OPEN_WORLD_MUTATION_DOMAINS,
      outcomeId: eventId,
      stable
    });
    campaignState = tracked;
    await refreshCampaignView();
    return tracked;
  }

  async function commitMissionComponentsMutation(nextState, {
    source = 'missionComponents',
    reason = 'Mission Components updated.',
    summary = reason,
    stable = true
  } = {}) {
    requireObject(nextState, 'nextState');
    const gateway = createStateDeltaGateway({
      getState: () => campaignState,
      setState: (state) => { campaignState = cloneJson(state); },
      persist: (state, delta) => persistRuntimeCampaignState(state, delta?.summary || delta?.reason || summary),
      now
    });
    const tracked = await gateway.commit(nextState, {
      source,
      reason,
      summary,
      domains: ['knowledgeLedger'],
      stable
    });
    campaignState = tracked;
    await refreshCampaignView();
    await refreshCurrentChatCampaignScope();
    return tracked;
  }

  async function ensureMissionComponentCaptureContext(selection = {}) {
    await ensureInitialized();
    await refreshCurrentChatCampaignScope();
    const scopedState = liveCampaignStateForView();
    if (!scopedState) {
      return {
        ok: false,
        reason: 'no-active-campaign-chat',
        summary: currentChatScope?.error?.message || 'Open an active Directive campaign chat before adding Mission Components.'
      };
    }
    if (scopedState !== campaignState) {
      const scopedSaveId = compactString(currentChatScope?.saveId || scopedState?.campaignChatBinding?.saveId);
      if (scopedSaveId) {
        await loadCampaignStateForSessionSave(scopedSaveId);
      } else {
        campaignState = cloneJson(scopedState);
      }
    }
    const guard = currentChatScope?.guard || null;
    if (guard && guard.ok !== true) {
      return {
        ok: false,
        reason: guard.reason || 'active-chat-save-guard',
        summary: guard.summary || 'Open the bound campaign chat before adding Mission Components.',
        guard: cloneJson(guard)
      };
    }
    const selectionChatId = compactString(selection?.chatId || selection?.currentChatId);
    const activeChatId = compactString(currentChatScope?.currentChat?.chatId || campaignState?.campaignChatBinding?.chatId);
    if (!activeChatId) {
      return {
        ok: false,
        reason: 'active-chat-unknown',
        summary: 'Directive could not verify the active campaign chat for this Mission Component.'
      };
    }
    if (!selectionChatId) {
      return {
        ok: false,
        reason: 'selection-chat-unknown',
        summary: 'Directive could not verify which chat the selected text came from.'
      };
    }
    if (selectionChatId !== activeChatId) {
      return {
        ok: false,
        reason: 'wrong-chat',
        summary: 'The selected text is not in the active campaign chat.'
      };
    }
    return {
      ok: true,
      campaignState,
      chatId: activeChatId || selectionChatId || null,
      guard: cloneJson(guard || null)
    };
  }

  async function sourceMessageForMissionComponent(selection = {}) {
    const messageId = compactString(
      selection?.message?.hostMessageId
      || selection?.message?.id
      || selection?.hostMessageId
      || selection?.messageId
    );
    if (!messageId) {
      return { ok: false, reason: 'missing-message-id', summary: 'Mission Component source message id is missing.' };
    }
    const fallbackMessage = selection?.message && typeof selection.message === 'object'
      ? selection.message
      : null;
    const canReadHostMessage = typeof runtimeHost?.chat?.getMessage === 'function';
    const message = canReadHostMessage
      ? await runtimeHost.chat.getMessage(messageId)
      : fallbackMessage;
    if (!message) {
      return { ok: false, reason: 'source-message-not-found', summary: 'Directive could not re-read the selected source message.' };
    }
    if (message.isSystem === true || message.is_system === true || message.role === 'system') {
      return { ok: false, reason: 'system-message', summary: 'System messages cannot be saved as Mission Components.' };
    }
    const selectedText = compactString(selection?.selectedText || selection?.selectionText || selection?.text || selection?.verbatim);
    const hostCandidates = missionComponentMessageTextCandidates(message);
    const fallbackCandidates = canReadHostMessage
      ? []
      : [
        fallbackMessage?.text,
        fallbackMessage?.mes,
        fallbackMessage?.content,
        selection?.messageText,
        selection?.fullText
      ];
    const sourceMatch = matchMissionComponentSourceText(selectedText, [
      ...hostCandidates,
      ...fallbackCandidates
    ]);
    if (!sourceMatch.ok && canReadHostMessage && typeof runtimeHost?.chat?.getRecentMessages === 'function') {
      const recentMessages = await runtimeHost.chat.getRecentMessages({
        limit: 500,
        playerSafeOnly: false
      });
      const resolved = findMissionComponentSourceMessageMatch({
        selectedText,
        fallbackMessage,
        messages: recentMessages,
        preferredMessageId: messageId
      });
      if (resolved.ok) {
        return {
          ok: true,
          message: {
            ...cloneJson(resolved.message),
            hostMessageId: compactString(resolved.message.hostMessageId || resolved.message.id || messageId),
            text: resolved.sourceMatch?.text || String(resolved.message.text || '')
          },
          sourceResolvedByText: true,
          sourceResolution: {
            preferredMessageId: messageId,
            resolvedMessageId: compactString(resolved.message.hostMessageId || resolved.message.id),
            matchedFullMessage: resolved.matchedFullMessage === true,
            match: resolved.sourceMatch?.match || null
          }
        };
      }
    }
    if (!sourceMatch.ok) {
      return {
        ok: false,
        reason: 'selection-stale',
        summary: 'The selected text no longer matches the source message. Select the text again.'
      };
    }
    return {
      ok: true,
      message: {
        ...cloneJson(message),
        hostMessageId: compactString(message.hostMessageId || message.id || messageId),
        text: sourceMatch.text || String(message.text || '')
      }
    };
  }

  function componentInputFromCapture(payload = {}, prepared = null) {
    const proposal = payload.proposal || payload.component || prepared?.proposal || {};
    const source = payload.source || payload.component?.source || prepared?.source || {};
    const selectedText = String(payload.verbatim || payload.selectedText || payload.component?.verbatim || prepared?.selectedText || '').trim();
    const component = payload.component || {};
    return {
      title: proposal.title || component.title,
      type: proposal.type || component.type,
      status: proposal.status || component.status,
      summary: proposal.summary || component.summary,
      verbatim: selectedText,
      sourceAuthority: proposal.sourceAuthority || component.sourceAuthority,
      tags: proposal.tags || component.tags || [],
      links: proposal.links || component.links || {},
      source,
      derived: {
        ...(component.derived || {}),
        ...(prepared?.diagnostics?.providerUsed
          ? { utilityModelCallId: prepared?.diagnostics?.providerId || prepared?.diagnostics?.model || 'utilityJson' }
          : {}),
        warnings: proposal.warnings || component.derived?.warnings || []
      }
    };
  }

  async function generateNarrationForLastTurnNow({
    provider = defaultNarrationProvider,
    scheduleDeferredCommandLogSummary = true
  } = {}) {
    requireObject(campaignState, 'campaignState');
    requireObject(lastDirectorTurn, 'lastDirectorTurn');
    const outcomeId = lastDirectorTurn.outcomePacket?.id;
    campaignState = restoreCommittedOutcomeState(campaignState, lastMechanicsCheckpointState, outcomeId);
    let directiveGenerationStartedAt = null;
    try {
      const narrationContext = await resolveDirectiveNarrationContext(runtimeHost, {
        roleId: 'narration'
      });
      const assets = optionalActiveRuntimeAssets();
      const narration = await generateNarrationFromTurn({
        campaignState,
        turnPacket: lastDirectorTurn,
        provider,
        narrationContext,
        packageData: assets?.packageData || null,
        crewDataset: assets?.crewDataset || null,
        now: () => timestampFromNow(now),
        onGenerationStart: (event) => {
          directiveGenerationStartedAt = event?.directiveGenerationStartedAt || event?.generatedAt || null;
        }
      });
      directiveGenerationStartedAt = narration.directiveGenerationStartedAt
        || directiveGenerationStartedAt
        || narration.generatedAt
        || null;
      campaignState = restoreCommittedOutcomeState(campaignState, lastMechanicsCheckpointState, outcomeId);
      campaignState = recordNarrationSuccess(campaignState, outcomeId, narration);
      const narrationCheckpoint = await ensureTurnCommitCoordinator().markNarration({
        campaignState,
        outcomeId,
        status: 'complete',
        directiveGenerationStartedAt
      });
      campaignState = narrationCheckpoint.campaignState;
      const autosave = await autosaveStableTurn(outcomeId);
      const commandLogSummaryResult = scheduleDeferredCommandLogSummary
        ? scheduleDeferredCommandLogSummaryQueue('afterDirectiveNarration')
        : cloneJson(lastCommandLogSummarySidecarResult);
      lastNarrationResult = {
        ok: true,
        narration,
        directiveGenerationStartedAt,
        commandLogSummaryResult,
        autosave
      };
      return {
        ok: true,
        narration: cloneJson(narration),
        directiveGenerationStartedAt,
        commandLogSummaryResult: cloneJson(commandLogSummaryResult),
        autosave: cloneJson(autosave),
        campaignState: cloneJson(campaignState),
        view: viewEnvelope('mission')
      };
    } catch (error) {
      const failure = {
        code: error?.code || 'DIRECTIVE_NARRATION_GENERATION_FAILED',
        failedAt: timestampFromNow(now),
        providerId: provider?.id || null,
        directiveGenerationStartedAt,
        generationStartedAt: directiveGenerationStartedAt,
        message: error?.message || String(error),
        retryable: true
      };
      let narrationCheckpointSave = null;
      if (hasTurnLedgerOutcome(campaignState, outcomeId)) {
        campaignState = recordNarrationFailure(campaignState, outcomeId, failure);
        const narrationCheckpoint = await ensureTurnCommitCoordinator().markNarration({
          campaignState,
          outcomeId,
          status: 'failed',
          error: failure,
          directiveGenerationStartedAt
        });
        campaignState = narrationCheckpoint.campaignState;
        narrationCheckpointSave = narrationCheckpoint.save || null;
      } else {
        const turnId = lastDirectorTurn?.turnId || lastDirectorTurn?.id || null;
        const coreDiagnostic = await appendNarrationBookkeepingMissingOutcomeDiagnostic({
          outcomeId: outcomeId || null,
          turnId,
          failure
        });
        if (coreDiagnostic) {
          await persistRuntimeCampaignState(campaignState, `Recorded narration bookkeeping diagnostic for ${outcomeId || 'unknown outcome'}.`);
        }
      }
      const commandLogSummaryResult = scheduleDeferredCommandLogSummary
        ? scheduleDeferredCommandLogSummaryQueue('afterDirectiveNarrationFailure')
        : cloneJson(lastCommandLogSummarySidecarResult);
      lastNarrationResult = {
        ok: false,
        error: cloneJson(failure),
        directiveGenerationStartedAt,
        commandLogSummaryResult,
        checkpoint: cloneJson(narrationCheckpointSave)
      };
      return {
        ok: false,
        error: cloneJson(failure),
        directiveGenerationStartedAt,
        commandLogSummaryResult: cloneJson(commandLogSummaryResult),
        campaignState: cloneJson(campaignState),
        view: viewEnvelope('mission')
      };
    }
  }

  async function updateCommandLogSummaryForTurnNow({
    turnPacket,
    enabled = true,
    sourceGuard = null
  } = {}) {
    if (!enabled || !runtimeHost) {
      lastCommandLogSummarySidecarResult = null;
      return null;
    }
    requireObject(campaignState, 'campaignState');
    requireObject(turnPacket, 'turnPacket');
    if (!commandLogSummaryGuardCurrent(sourceGuard)) {
      lastCommandLogSummarySidecarResult = staleCommandLogSummaryResult(sourceGuard, 'source-stale-before-provider');
      return cloneJson(lastCommandLogSummarySidecarResult);
    }
    try {
      const result = await runCommandLogSummarySidecar({
        host: runtimeHost,
        campaignState,
        turnPacket,
        saveId: controller?.activeSaveId || null,
        revision: campaignState.turnLedger?.entries?.length || 0,
        now: () => timestampFromNow(now)
      });
      if (!commandLogSummaryGuardCurrent(sourceGuard)) {
        lastCommandLogSummarySidecarResult = staleCommandLogSummaryResult(sourceGuard, 'source-stale-after-provider');
        return cloneJson(lastCommandLogSummarySidecarResult);
      }
      if (result.applied && result.assistedSummary) {
        const outcomeId = compactString(result.assistedSummary.sourceOutcomeId || turnPacket?.outcomePacket?.id);
        const next = cloneJson(campaignState);
        const entries = Array.isArray(next.commandLog?.entries) ? next.commandLog.entries : [];
        const index = entries.findIndex((entry) => commandLogEntryOutcomeId(entry) === outcomeId);
        if (index >= 0) {
          entries[index] = {
            ...entries[index],
            assistedSummary: cloneJson(result.assistedSummary)
          };
          next.commandLog = {
            ...(next.commandLog || {}),
            entries,
            summariesGeneratedFromCommittedStateOnly: true
          };
          campaignState = next;
        }
      }
      lastCommandLogSummarySidecarResult = {
        ok: result.featureOk === true,
        ...cloneJson(result)
      };
      return cloneJson(lastCommandLogSummarySidecarResult);
    } catch (error) {
      lastCommandLogSummarySidecarResult = {
        ok: false,
        error: {
          code: error?.code || 'DIRECTIVE_COMMAND_LOG_SUMMARY_SIDECAR_FAILED',
          message: error?.message || String(error)
        }
      };
      return cloneJson(lastCommandLogSummarySidecarResult);
    }
  }

  function commandLogSummaryOutcomeId(turnPacket = null) {
    return compactString(turnPacket?.outcomePacket?.id || turnPacket?.finalOutcome?.id || turnPacket?.turnId || turnPacket?.id);
  }

  function commandLogEntryForOutcome(state = null, outcomeId = null) {
    const id = compactString(outcomeId);
    if (!id) return null;
    return (Array.isArray(state?.commandLog?.entries) ? state.commandLog.entries : [])
      .find((entry) => commandLogEntryOutcomeId(entry) === id) || null;
  }

  function commandLogSummaryInputSignatureBundle(state = null, outcomeId = null) {
    const entry = commandLogEntryForOutcome(state, outcomeId);
    if (!entry) return null;
    return {
      sourceOutcomeId: commandLogEntryOutcomeId(entry),
      summaryInputs: cloneJson(entry.summaryInputs || []),
      visibleConsequences: cloneJson(entry.visibleConsequences || [])
    };
  }

  function commandLogSummaryInputSignature(state = null, outcomeId = null) {
    const bundle = commandLogSummaryInputSignatureBundle(state, outcomeId);
    return bundle ? JSON.stringify(bundle) : null;
  }

  function commandLogSummaryInputSignatureHash(state = null, outcomeId = null) {
    const bundle = commandLogSummaryInputSignatureBundle(state, outcomeId);
    return bundle ? hashStableJson(bundle) : null;
  }

  function runtimeIngressForContext(context = {}) {
    const ledger = createRuntimeLedgerView(campaignState || {}).ingressLedger || [];
    const ingressId = compactString(context.ingressId);
    if (ingressId) {
      const byId = ledger.find((entry) => entry?.id === ingressId);
      if (byId) return byId;
    }
    const outcomeId = compactString(context.outcomeId);
    if (outcomeId) {
      const byOutcome = [...ledger].reverse().find((entry) => compactString(entry?.outcomeId) === outcomeId);
      if (byOutcome) return byOutcome;
    }
    const turnId = compactString(context.turnId);
    if (turnId) {
      return [...ledger].reverse().find((entry) => compactString(entry?.turnId) === turnId) || null;
    }
    return null;
  }

  function narrationBookkeepingCoreTargetForContext(context = {}) {
    const ingress = runtimeIngressForContext(context);
    const transactionId = compactString(context.coreTransactionId || ingress?.coreTransactionId);
    if (!transactionId) return null;
    return {
      transactionId,
      ingressId: compactString(ingress?.id || context.ingressId),
      turnId: compactString(ingress?.turnId || context.turnId),
      outcomeId: compactString(ingress?.outcomeId || context.outcomeId),
      hostMessageId: compactString(ingress?.hostMessageId || context.hostMessageId),
      sourceFrameId: compactString(ingress?.sourceFrameId || ingress?.sourceFrame?.id || context.sourceFrameId)
    };
  }

  async function appendNarrationBookkeepingMissingOutcomeDiagnostic(context = {}) {
    const target = narrationBookkeepingCoreTargetForContext(context);
    if (!target) return null;
    const failure = context.failure || null;
    const event = {
      type: 'runtimeDiagnostic',
      worker: 'directiveNarration',
      eventType: 'narrationBookkeepingMissingOutcome',
      status: 'failed',
      severity: 'warning',
      reason: 'missing-turn-ledger-outcome',
      outcomeId: target.outcomeId || context.outcomeId || null,
      turnId: target.turnId || context.turnId || null,
      ingressId: target.ingressId || context.ingressId || null,
      hostMessageId: target.hostMessageId || context.hostMessageId || null,
      sourceFrameId: target.sourceFrameId || context.sourceFrameId || null,
      coreTransactionId: target.transactionId,
      providerId: compactString(failure?.providerId || context.providerId),
      directiveGenerationStartedAt: failure?.directiveGenerationStartedAt || context.directiveGenerationStartedAt || null,
      generationStartedAt: failure?.generationStartedAt || context.generationStartedAt || null,
      fallbackResponseAvailable: true,
      error: compactRuntimeErrorEvidence(failure, 'DIRECTIVE_NARRATION_BOOKKEEPING_MISSING_OUTCOME'),
      observedAt: timestampFromNow(now)
    };
    try {
      await runtimeCoreTurnStore.appendDiagnostics(target.transactionId, event);
      return cloneJson(event);
    } catch {
      return null;
    }
  }

  function runtimeResponseForContext(context = {}) {
    const ledger = createRuntimeLedgerView(campaignState || {}).responseLedger || [];
    const responseId = compactString(context.responseId);
    if (responseId) {
      const byId = ledger.find((entry) => compactString(entry?.id) === responseId);
      if (byId) return byId;
    }
    const hostMessageId = compactString(context.hostMessageId);
    if (hostMessageId) {
      const byHost = [...ledger].reverse().find((entry) => compactString(entry?.hostMessageId) === hostMessageId);
      if (byHost) return byHost;
    }
    const outcomeId = compactString(context.outcomeId);
    if (outcomeId) {
      const byOutcome = [...ledger].reverse().find((entry) => compactString(entry?.outcomeId) === outcomeId);
      if (byOutcome) return byOutcome;
    }
    const turnId = compactString(context.turnId);
    if (turnId) {
      const byTurn = [...ledger].reverse().find((entry) => compactString(entry?.turnId) === turnId);
      if (byTurn) return byTurn;
    }
    const ingressId = compactString(context.ingressId);
    if (ingressId) {
      return [...ledger].reverse().find((entry) => compactString(entry?.ingressId) === ingressId) || null;
    }
    return null;
  }

  function commandLogSummaryIngressForContext(context = {}) {
    return runtimeIngressForContext(context);
  }

  function commandLogSummarySourceGuardForTurn(turnPacket = null, context = {}) {
    const outcomeId = compactString(context.outcomeId) || commandLogSummaryOutcomeId(turnPacket);
    const turnId = compactString(context.turnId || turnPacket?.turnId || turnPacket?.id);
    const binding = bindingFromState(campaignState);
    const ingress = commandLogSummaryIngressForContext({
      ingressId: context.ingressId,
      outcomeId,
      turnId
    });
    return {
      campaignId: compactString(campaignState?.campaign?.id),
      saveId: compactString(binding?.saveId),
      chatId: compactString(binding?.chatId),
      ingressId: compactString(context.ingressId || ingress?.id),
      turnId,
      outcomeId,
      hostMessageId: compactString(ingress?.hostMessageId),
      sourceFrameId: compactString(ingress?.sourceFrameId || ingress?.sourceFrame?.id),
      coreTransactionId: compactString(ingress?.coreTransactionId),
      inputSignature: commandLogSummaryInputSignature(campaignState, outcomeId),
      inputSignatureHash: commandLogSummaryInputSignatureHash(campaignState, outcomeId)
    };
  }

  function commandLogSummaryGuardCurrent(guard = null) {
    if (!guard) return true;
    if (guard.campaignId && compactString(campaignState?.campaign?.id) !== guard.campaignId) return false;
    const binding = bindingFromState(campaignState);
    if (guard.saveId && compactString(binding?.saveId) !== guard.saveId) return false;
    if (guard.chatId && compactString(binding?.chatId) !== guard.chatId) return false;
    if (guard.outcomeId && !commandLogEntryForOutcome(campaignState, guard.outcomeId)) return false;
    if (guard.inputSignature && commandLogSummaryInputSignature(campaignState, guard.outcomeId) !== guard.inputSignature) return false;
    return true;
  }

  function commandLogSummaryCoreTargetForGuard(guard = null) {
    if (!guard) return null;
    const binding = bindingFromState(campaignState);
    if (guard.campaignId && compactString(campaignState?.campaign?.id) !== guard.campaignId) return null;
    if (guard.saveId && compactString(binding?.saveId) !== guard.saveId) return null;
    if (guard.chatId && compactString(binding?.chatId) !== guard.chatId) return null;
    const ingress = commandLogSummaryIngressForContext({
      ingressId: guard.ingressId,
      outcomeId: guard.outcomeId,
      turnId: guard.turnId
    });
    const transactionId = compactString(guard.coreTransactionId || ingress?.coreTransactionId);
    if (!transactionId) return null;
    return {
      transactionId,
      ingressId: compactString(ingress?.id || guard.ingressId),
      turnId: compactString(ingress?.turnId || guard.turnId),
      outcomeId: compactString(ingress?.outcomeId || guard.outcomeId),
      hostMessageId: compactString(ingress?.hostMessageId || guard.hostMessageId),
      sourceFrameId: compactString(ingress?.sourceFrameId || ingress?.sourceFrame?.id || guard.sourceFrameId)
    };
  }

  function commandLogSummaryDiagnosticStatusForResult(result = null) {
    if (result?.status === 'stale') return 'stale';
    if (result?.applied === true) return 'applied';
    if (result?.ok === false || result?.status === 'failed' || result?.error) return 'failed';
    return result?.status || 'settled';
  }

  function commandLogSummaryDiagnosticEvent(guard = null, status = 'queued', details = {}) {
    const target = commandLogSummaryCoreTargetForGuard(guard);
    if (!target) return null;
    const result = details.result || null;
    const error = details.error || result?.error || null;
    return {
      type: 'sidecar',
      worker: 'commandLogSummary',
      sidecarType: 'commandLogSummary',
      roleId: 'commandLogSummarizer',
      status,
      severity: status === 'failed' ? 'warning' : 'info',
      reason: compactString(details.reason || result?.reason),
      resultStatus: compactString(result?.status),
      applied: result?.applied === true,
      scheduled: result?.scheduled === true || status === 'queued',
      outcomeId: target.outcomeId || guard?.outcomeId || null,
      turnId: target.turnId || guard?.turnId || null,
      ingressId: target.ingressId || guard?.ingressId || null,
      hostMessageId: target.hostMessageId || guard?.hostMessageId || null,
      sourceFrameId: target.sourceFrameId || guard?.sourceFrameId || null,
      inputSignatureHash: guard?.inputSignatureHash || null,
      hasAssistedSummary: Boolean(result?.assistedSummary),
      assistedSummaryHash: result?.assistedSummary ? hashStableJson(result.assistedSummary) : null,
      errorCode: compactString(error?.code),
      errorMessageHash: error?.message ? hashStableJson({ message: error.message }) : null,
      observedAt: timestampFromNow(now)
    };
  }

  function queueCommandLogSummaryCoreDiagnostic(guard = null, status = 'queued', details = {}) {
    const event = commandLogSummaryDiagnosticEvent(guard, status, details);
    if (!event) return null;
    const target = commandLogSummaryCoreTargetForGuard(guard);
    if (!target) return null;
    return queueRuntimeCoreDiagnosticEntry(commandLogSummaryDiagnosticBatch, target, event);
  }

  function commandLogSummaryCoreBackgroundBundle(guard = null, result = null) {
    const target = commandLogSummaryCoreTargetForGuard(guard);
    const assistedSummary = result?.assistedSummary || null;
    if (!target || result?.applied !== true || assistedSummary?.status !== 'complete') return null;
    const outcomeId = compactString(assistedSummary.sourceOutcomeId || target.outcomeId || guard?.outcomeId);
    const assistedSummaryHash = hashStableJson(assistedSummary);
    const batchSourceId = outcomeId || target.ingressId || target.transactionId;
    const batchId = `command-log-summary:${target.transactionId}:${batchSourceId}`;
    return {
      transactionId: target.transactionId,
      bundle: {
        idempotencyKey: batchId,
        batchId,
        phaseAfter: 'backgroundSettling',
        outcomeId: outcomeId || null,
        promptDirtyDomains: [],
        backgroundEffectRefs: [
          {
            effect: 'commandLogAssistedSummary',
            status: 'applied',
            outcomeId: outcomeId || null,
            ingressId: target.ingressId || guard?.ingressId || null,
            turnId: target.turnId || guard?.turnId || null,
            hostMessageId: target.hostMessageId || guard?.hostMessageId || null,
            sourceFrameId: target.sourceFrameId || guard?.sourceFrameId || null,
            inputSignatureHash: guard?.inputSignatureHash || null,
            assistedSummaryHash
          }
        ],
        workers: [
          {
            worker: 'commandLogSummary',
            workerId: 'commandLogSummary',
            sidecarType: 'commandLogSummary',
            roleId: 'commandLogSummarizer',
            status: 'applied',
            outcomeId: outcomeId || null,
            ingressId: target.ingressId || guard?.ingressId || null,
            turnId: target.turnId || guard?.turnId || null,
            hostMessageId: target.hostMessageId || guard?.hostMessageId || null,
            sourceFrameId: target.sourceFrameId || guard?.sourceFrameId || null,
            inputSignatureHash: guard?.inputSignatureHash || null,
            assistedSummaryHash
          }
        ]
      }
    };
  }

  async function commitCommandLogSummaryCoreBackgroundBatch(guard = null, result = null) {
    const prepared = commandLogSummaryCoreBackgroundBundle(guard, result);
    if (!prepared) return null;
    try {
      return await settleInternalForgeBackgroundBatch(prepared, {
        sourceFrameId: guard?.sourceFrameId,
        internalOwner: 'commandLogSummary',
        appendDiagnostic: (transactionId, diagnostic) => queueForgeInternalCoreDiagnostic(
          commandLogSummaryDiagnosticBatch,
          commandLogSummaryCoreTargetForGuard(guard),
          transactionId,
          diagnostic
        )
      });
    } catch (error) {
      queueCommandLogSummaryCoreDiagnostic(guard, 'backgroundBridgeFailed', {
        reason: 'core-background-bridge-failed',
        result,
        error
      });
      return null;
    }
  }

  function postCommitConversationInputSignatureBundle(conversation = {}) {
    const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
    return {
      pendingInteractionId: compactString(conversation.pendingInteractionId),
      resolutionIngressId: compactString(conversation.resolutionIngressId),
      resolutionMessageId: compactString(conversation.resolutionMessageId),
      resolutionTextHash: compactString(conversation.resolutionTextHash),
      turnId: compactString(conversation.turnId),
      outcomeId: compactString(conversation.outcomeId || conversation.outcomePacket?.id),
      resultBand: compactString(conversation.resultBand || conversation.outcomePacket?.resultBand),
      sourceAnchorRangeHash: conversation.sourceAnchorRange ? hashStableJson(conversation.sourceAnchorRange) : null,
      commandLogPacketHash: conversation.commandLogPacket ? hashStableJson(conversation.commandLogPacket) : null,
      continuityProjectionHash: conversation.continuityProjection ? hashStableJson(conversation.continuityProjection) : null,
      messageRefs: messages.map((message, index) => ({
        id: compactString(message?.id || message?.hostMessageId || message?.messageId || index),
        role: compactString(message?.role || message?.authorRole),
        textHash: message?.textHash || hashStableJson({ text: String(message?.text || message?.content || message?.mes || '') })
      }))
    };
  }

  function postCommitConversationResultSummary(result = {}) {
    return {
      ok: result?.ok === true,
      status: compactString(result?.status) || (result?.ok === false ? 'failed' : 'applied'),
      extractionFallback: result?.extractionFallback === true,
      createdThreadCount: Array.isArray(result?.createdThreadIds) ? result.createdThreadIds.length : 0,
      createdThreadIds: Array.isArray(result?.createdThreadIds) ? result.createdThreadIds.slice(0, 12) : [],
      mergedThreadCount: Array.isArray(result?.mergedThreads) ? result.mergedThreads.length : 0,
      surfacedThreadCount: Array.isArray(result?.surfacedThreadIds) ? result.surfacedThreadIds.length : 0,
      surfacedThreadIds: Array.isArray(result?.surfacedThreadIds) ? result.surfacedThreadIds.slice(0, 12) : [],
      decayChangeCount: Array.isArray(result?.decayChanges) ? result.decayChanges.length : 0,
      commandBearingReviewStatus: compactString(result?.commandBearingReview?.status),
      commandBearingReviewCount: Array.isArray(result?.commandBearingReview?.records) ? result.commandBearingReview.records.length : 0,
      promotionThreadId: compactString(result?.promotion?.threadId),
      promotionQuestId: compactString(result?.promotion?.questId),
      eligibleThreadCount: Array.isArray(result?.eligibleThreadIds) ? result.eligibleThreadIds.length : 0
    };
  }

  function postCommitConversationGuardForContext(conversation = {}) {
    const outcomeId = compactString(conversation.outcomeId || conversation.outcomePacket?.id);
    const turnId = compactString(conversation.turnId);
    const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
    const assistantMessage = messages.find((entry) => compactString(entry?.role || entry?.authorRole) === 'assistant') || null;
    const responseHostMessageId = compactString(assistantMessage?.id || assistantMessage?.hostMessageId || assistantMessage?.messageId);
    const binding = bindingFromState(campaignState);
    const ingress = runtimeIngressForContext({
      ingressId: conversation.ingressId,
      outcomeId,
      turnId
    });
    const response = runtimeResponseForContext({
      ingressId: conversation.resolutionIngressId || conversation.ingressId,
      outcomeId,
      turnId,
      hostMessageId: responseHostMessageId
    });
    const signatureBundle = postCommitConversationInputSignatureBundle(conversation);
    return {
      campaignId: compactString(campaignState?.campaign?.id),
      saveId: compactString(binding?.saveId),
      chatId: compactString(binding?.chatId),
      ingressId: compactString(conversation.ingressId || ingress?.id),
      pendingInteractionId: compactString(conversation.pendingInteractionId),
      resolutionIngressId: compactString(conversation.resolutionIngressId),
      resolutionMessageId: compactString(conversation.resolutionMessageId),
      resolutionTextHash: compactString(conversation.resolutionTextHash),
      turnId,
      outcomeId,
      hostMessageId: compactString(ingress?.hostMessageId),
      responseId: compactString(response?.id),
      responseHostMessageId: compactString(response?.hostMessageId || responseHostMessageId),
      sourceFrameId: compactString(ingress?.sourceFrameId || ingress?.sourceFrame?.id),
      coreTransactionId: compactString(ingress?.coreTransactionId),
      inputSignatureHash: hashStableJson(signatureBundle)
    };
  }

  function postCommitConversationGuardCurrent(guard = null) {
    if (!guard) return true;
    if (guard.campaignId && compactString(campaignState?.campaign?.id) !== guard.campaignId) return false;
    const binding = bindingFromState(campaignState);
    if (guard.saveId && compactString(binding?.saveId) !== guard.saveId) return false;
    if (guard.chatId && compactString(binding?.chatId) !== guard.chatId) return false;
    const ingress = runtimeIngressForContext({
      ingressId: guard.ingressId,
      outcomeId: guard.outcomeId,
      turnId: guard.turnId
    });
    if (guard.ingressId && !ingress) return false;
    const staleStatuses = new Set(['invalidated', 'edited', 'deleted', 'recoveryRequired', 'canceled', 'awaitingRevision']);
    if (ingress && staleStatuses.has(compactString(ingress.status))) return false;
    if (ingress?.invalidatedAt || ingress?.deletedAt || ingress?.invalidationType) return false;
    if (guard.hostMessageId && compactString(ingress?.hostMessageId) !== guard.hostMessageId) return false;
    if (guard.sourceFrameId && compactString(ingress?.sourceFrameId || ingress?.sourceFrame?.id) !== guard.sourceFrameId) return false;
    if (guard.outcomeId && compactString(ingress?.outcomeId) && compactString(ingress.outcomeId) !== guard.outcomeId) return false;
    const response = runtimeResponseForContext({
      responseId: guard.responseId,
      hostMessageId: guard.responseHostMessageId,
      outcomeId: guard.outcomeId,
      turnId: guard.turnId,
      ingressId: guard.resolutionIngressId || guard.ingressId
    });
    if (guard.responseId && !response) return false;
    if (response && staleStatuses.has(compactString(response.status))) return false;
    if (response?.invalidatedAt || response?.deletedAt || response?.editedAt || response?.invalidationType) return false;
    if (guard.responseId && compactString(response?.id) !== guard.responseId) return false;
    if (response && guard.responseHostMessageId && compactString(response.hostMessageId) !== guard.responseHostMessageId) return false;
    if (guard.outcomeId && !hasTurnLedgerOutcome(campaignState, guard.outcomeId) && !commandLogEntryForOutcome(campaignState, guard.outcomeId)) return false;
    return true;
  }

  function postCommitConversationCoreTargetForGuard(guard = null) {
    if (!guard) return null;
    const binding = bindingFromState(campaignState);
    if (guard.campaignId && compactString(campaignState?.campaign?.id) !== guard.campaignId) return null;
    if (guard.saveId && compactString(binding?.saveId) !== guard.saveId) return null;
    if (guard.chatId && compactString(binding?.chatId) !== guard.chatId) return null;
    const ingress = runtimeIngressForContext({
      ingressId: guard.ingressId,
      outcomeId: guard.outcomeId,
      turnId: guard.turnId
    });
    const transactionId = compactString(guard.coreTransactionId || ingress?.coreTransactionId);
    if (!transactionId) return null;
    return {
      transactionId,
      ingressId: compactString(ingress?.id || guard.ingressId),
      turnId: compactString(ingress?.turnId || guard.turnId),
      outcomeId: compactString(ingress?.outcomeId || guard.outcomeId),
      hostMessageId: compactString(ingress?.hostMessageId || guard.hostMessageId),
      sourceFrameId: compactString(ingress?.sourceFrameId || ingress?.sourceFrame?.id || guard.sourceFrameId)
    };
  }

  function postCommitConversationDiagnosticEvent(guard = null, status = 'queued', details = {}) {
    const target = postCommitConversationCoreTargetForGuard(guard);
    if (!target) return null;
    const result = details.result || null;
    const summary = result ? postCommitConversationResultSummary(result) : null;
    const error = details.error || result?.error || null;
    return {
      type: 'sidecar',
      worker: 'narrativeThreadDirector',
      sidecarType: 'narrativeThreadExtraction',
      eventType: status === 'failed' ? 'postCommitConversationFailed' : 'postCommitConversation',
      roleId: 'narrativeThreadDirector',
      status,
      severity: ['failed', 'backgroundBridgeFailed'].includes(status) ? 'warning' : 'info',
      reason: compactString(details.reason || result?.reason),
      resultStatus: compactString(result?.status),
      outcomeId: target.outcomeId || guard?.outcomeId || null,
      turnId: target.turnId || guard?.turnId || null,
      ingressId: target.ingressId || guard?.ingressId || null,
      hostMessageId: target.hostMessageId || guard?.hostMessageId || null,
      sourceFrameId: target.sourceFrameId || guard?.sourceFrameId || null,
      inputSignatureHash: guard?.inputSignatureHash || null,
      resultHash: summary ? hashStableJson(summary) : null,
      createdThreadCount: summary?.createdThreadCount ?? null,
      surfacedThreadCount: summary?.surfacedThreadCount ?? null,
      promotedQuest: Boolean(summary?.promotionQuestId),
      errorCode: compactString(error?.code),
      errorMessageHash: error?.message ? hashStableJson({ message: error.message }) : null,
      observedAt: timestampFromNow(now)
    };
  }

  async function appendPostCommitConversationCoreDiagnostic(guard = null, status = 'queued', details = {}) {
    const event = postCommitConversationDiagnosticEvent(guard, status, details);
    if (!event) return null;
    const target = postCommitConversationCoreTargetForGuard(guard);
    if (!target) return null;
    const queued = queueRuntimeCoreDiagnosticEntry(postCommitConversationDiagnosticBatch, target, event);
    try {
      await flushPostCommitConversationCoreDiagnostics();
      return queued;
    } catch {
      return null;
    }
  }

  function queuePostCommitConversationCoreDiagnostic(guard = null, status = 'queued', details = {}) {
    const event = postCommitConversationDiagnosticEvent(guard, status, details);
    if (!event) return null;
    const target = postCommitConversationCoreTargetForGuard(guard);
    if (!target) return null;
    return queueRuntimeCoreDiagnosticEntry(postCommitConversationDiagnosticBatch, target, event);
  }

  function postCommitConversationCoreBackgroundBundle(guard = null, result = null) {
    const target = postCommitConversationCoreTargetForGuard(guard);
    if (!target || result?.ok !== true) return null;
    const summary = postCommitConversationResultSummary(result);
    const batchSourceId = target.outcomeId || target.ingressId || target.transactionId;
    const batchId = `narrative-thread:${target.transactionId}:${batchSourceId}`;
    return {
      transactionId: target.transactionId,
      bundle: {
        idempotencyKey: batchId,
        batchId,
        phaseAfter: 'backgroundSettling',
        outcomeId: target.outcomeId || guard?.outcomeId || null,
        promptDirtyDomains: normalizePromptDirtyDomains(['threadLedger', 'questLedger', 'commandBearing']),
        backgroundEffectRefs: [
          {
            effect: 'narrativeThreadExtraction',
            status: 'applied',
            outcomeId: target.outcomeId || guard?.outcomeId || null,
            ingressId: target.ingressId || guard?.ingressId || null,
            turnId: target.turnId || guard?.turnId || null,
            hostMessageId: target.hostMessageId || guard?.hostMessageId || null,
            sourceFrameId: target.sourceFrameId || guard?.sourceFrameId || null,
            inputSignatureHash: guard?.inputSignatureHash || null,
            resultHash: hashStableJson(summary),
            createdThreadCount: summary.createdThreadCount,
            surfacedThreadCount: summary.surfacedThreadCount,
            commandBearingReviewCount: summary.commandBearingReviewCount,
            promotionQuestId: summary.promotionQuestId || null
          }
        ],
        workers: [
          {
            worker: 'narrativeThreadDirector',
            workerId: 'narrativeThreadDirector',
            sidecarType: 'narrativeThreadExtraction',
            roleId: 'narrativeThreadDirector',
            status: 'applied',
            outcomeId: target.outcomeId || guard?.outcomeId || null,
            ingressId: target.ingressId || guard?.ingressId || null,
            turnId: target.turnId || guard?.turnId || null,
            hostMessageId: target.hostMessageId || guard?.hostMessageId || null,
            sourceFrameId: target.sourceFrameId || guard?.sourceFrameId || null,
            inputSignatureHash: guard?.inputSignatureHash || null,
            resultHash: hashStableJson(summary),
            createdThreadCount: summary.createdThreadCount,
            surfacedThreadCount: summary.surfacedThreadCount,
            commandBearingReviewCount: summary.commandBearingReviewCount,
            promotionQuestId: summary.promotionQuestId || null
          }
        ]
      }
    };
  }

  async function commitPostCommitConversationCoreBackgroundBatch(guard = null, result = null) {
    const prepared = postCommitConversationCoreBackgroundBundle(guard, result);
    if (!prepared) return null;
    try {
      return await settleInternalForgeBackgroundBatch(prepared, {
        sourceFrameId: guard?.sourceFrameId,
        internalOwner: 'narrativeThreadDirector',
        appendDiagnostic: (transactionId, diagnostic) => queueForgeInternalCoreDiagnostic(
          postCommitConversationDiagnosticBatch,
          postCommitConversationCoreTargetForGuard(guard),
          transactionId,
          diagnostic
        )
      });
    } catch (error) {
      queuePostCommitConversationCoreDiagnostic(guard, 'backgroundBridgeFailed', {
        reason: 'core-background-bridge-failed',
        result,
        error
      });
      return null;
    }
  }

  function stalePostCommitConversationResult(guard = null, reason = 'source-stale') {
    return {
      kind: 'directive.postCommitConversationResult',
      ok: false,
      scheduled: true,
      status: 'stale',
      applied: false,
      reason,
      outcomeId: guard?.outcomeId || null,
      error: {
        code: 'DIRECTIVE_POST_COMMIT_CONVERSATION_SOURCE_STALE',
        message: 'Post-commit conversation processing skipped because the scheduled source is no longer current.'
      }
    };
  }

  function schedulePostCommitConversationForCommittedTurn({
    conversation,
    processor,
    reason = 'postVisibleResponse'
  } = {}) {
    if (typeof processor !== 'function') {
      lastPostCommitConversationResult = null;
      return null;
    }
    const queuedConversation = cloneJson(conversation || {});
    const sourceGuard = postCommitConversationGuardForContext(queuedConversation);
    const scheduled = {
      kind: 'directive.postCommitConversationScheduled',
      ok: null,
      scheduled: true,
      status: 'queued',
      reason,
      outcomeId: sourceGuard.outcomeId || null,
      turnId: sourceGuard.turnId || null,
      scheduledAt: timestampFromNow(now)
    };
    lastPostCommitConversationResult = cloneJson(scheduled);
    const runTask = async () => {
      postCommitConversationPendingCount += 1;
      try {
        await settleCommandLogSummaryQueue();
        queuePostCommitConversationCoreDiagnostic(sourceGuard, 'queued', { reason, result: scheduled });
        if (!postCommitConversationGuardCurrent(sourceGuard)) {
          lastPostCommitConversationResult = stalePostCommitConversationResult(sourceGuard, 'source-stale-before-provider');
          queuePostCommitConversationCoreDiagnostic(sourceGuard, 'stale', {
            reason: 'source-stale-before-provider',
            result: lastPostCommitConversationResult
          });
          await flushPostCommitConversationCoreDiagnostics();
          return cloneJson(lastPostCommitConversationResult);
        }
        const result = await processor(queuedConversation, {
          isSourceCurrent: () => (postCommitConversationGuardCurrent(sourceGuard)
            ? { ok: true }
            : { ok: false, reason: 'source-stale' })
        });
        if (!postCommitConversationGuardCurrent(sourceGuard)) {
          lastPostCommitConversationResult = stalePostCommitConversationResult(sourceGuard, 'source-stale-after-provider');
          queuePostCommitConversationCoreDiagnostic(sourceGuard, 'stale', {
            reason: 'source-stale-after-provider',
            result: lastPostCommitConversationResult
          });
          await flushPostCommitConversationCoreDiagnostics();
          return cloneJson(lastPostCommitConversationResult);
        }
        if (result?.campaignState) {
          campaignState = mergeFresherResponseLedgerProjection(
            applyRuntimeSettings(result.campaignState),
            campaignState
          );
          const synchronized = await synchronizeActivePrompt(campaignState, {
            persist: false,
            useContinuityPlanner: false,
            reason: 'Prompt context synchronized after narrative thread background settlement.',
            activitySource: 'narrativeThreadBackgroundPromptSync',
            activityMode: 'background',
            activityContext: {
              source: 'narrativeThreadDirector',
              ingressId: sourceGuard.ingressId || null,
              turnId: sourceGuard.turnId || null,
              outcomeId: sourceGuard.outcomeId || null
            }
          });
          campaignState = mergeFresherResponseLedgerProjection(
            applyRuntimeSettings(synchronized.campaignState || campaignState),
            campaignState
          );
          await persistRuntimeCampaignState(
            campaignState,
            'Narrative thread background settlement synchronized prompt context.'
          );
        }
        const summary = postCommitConversationResultSummary(result || {});
        const final = {
          kind: 'directive.postCommitConversationResult',
          ok: result?.ok !== false,
          scheduled: true,
          status: result?.status || 'applied',
          applied: result?.ok !== false,
          reason,
          outcomeId: sourceGuard.outcomeId || null,
          extractionFallback: summary.extractionFallback,
          createdThreadCount: summary.createdThreadCount,
          createdThreadIds: cloneJson(summary.createdThreadIds),
          mergedThreadCount: summary.mergedThreadCount,
          surfacedThreadCount: summary.surfacedThreadCount,
          surfacedThreadIds: cloneJson(summary.surfacedThreadIds),
          decayChangeCount: summary.decayChangeCount,
          commandBearingReviewStatus: summary.commandBearingReviewStatus || null,
          commandBearingReviewCount: summary.commandBearingReviewCount,
          promotionThreadId: summary.promotionThreadId || null,
          promotionQuestId: summary.promotionQuestId || null,
          eligibleThreadCount: summary.eligibleThreadCount
        };
        lastPostCommitConversationResult = cloneJson(final);
        let backgroundBatchCommitted = null;
        if (final.ok === true) {
          backgroundBatchCommitted = await commitPostCommitConversationCoreBackgroundBatch(sourceGuard, final);
        }
        if (!backgroundBatchCommitted) {
          queuePostCommitConversationCoreDiagnostic(sourceGuard, final.ok === false ? 'failed' : 'applied', {
            reason,
            result: final
          });
        }
        await flushPostCommitConversationCoreDiagnostics();
        return cloneJson(lastPostCommitConversationResult);
      } catch (error) {
        const stale = error?.code === 'DIRECTIVE_NARRATIVE_THREAD_SOURCE_STALE';
        lastPostCommitConversationResult = stale
          ? stalePostCommitConversationResult(sourceGuard, error.phase || 'source-stale')
          : {
              kind: 'directive.postCommitConversationResult',
              ok: false,
              scheduled: true,
              status: 'failed',
              reason,
              outcomeId: sourceGuard.outcomeId || null,
              error: {
                code: error?.code || 'DIRECTIVE_POST_COMMIT_CONVERSATION_BACKGROUND_FAILED',
                message: error?.message || String(error)
              }
            };
        let failureDiagnostic = null;
        if (!stale) {
          failureDiagnostic = await appendPostCommitConversationCoreDiagnostic(sourceGuard, 'failed', {
            reason,
            result: lastPostCommitConversationResult,
            error
          });
        }
        if (stale) {
          queuePostCommitConversationCoreDiagnostic(sourceGuard, 'stale', {
            reason,
            result: lastPostCommitConversationResult,
            error
          });
          await flushPostCommitConversationCoreDiagnostics();
        }
        return cloneJson(lastPostCommitConversationResult);
      } finally {
        postCommitConversationPendingCount = Math.max(0, postCommitConversationPendingCount - 1);
      }
    };
    const task = postCommitConversationQueue.then(runTask, runTask);
    postCommitConversationQueue = task.catch(() => null);
    return cloneJson(scheduled);
  }

  function advisoryEnrichmentGuardForContext(payload = {}) {
    const binding = bindingFromState(campaignState);
    const ingress = runtimeIngressForContext({
      ingressId: payload.ingressId
    });
    return {
      campaignId: compactString(campaignState?.campaign?.id),
      saveId: compactString(binding?.saveId),
      chatId: compactString(binding?.chatId),
      ingressId: compactString(payload.ingressId || ingress?.id),
      advisoryId: compactString(payload.advisoryId),
      sourceMessageId: compactString(payload.sourceMessageId || ingress?.hostMessageId),
      hostMessageId: compactString(ingress?.hostMessageId || payload.sourceMessageId),
      sourceFrameId: compactString(ingress?.sourceFrameId || ingress?.sourceFrame?.id || payload.sourceFrameId),
      coreTransactionId: compactString(ingress?.coreTransactionId || ingress?.transactionId || payload.coreTransactionId || payload.transactionId),
      playerTextHash: compactString(payload.playerTextHash),
      ingressTextHash: compactString(ingress?.textHash),
      fallbackAdvisoryHash: compactString(payload.fallbackAdvisoryHash),
      scheduledAt: timestampFromNow(now)
    };
  }

  function hostSourceMessageMatchesGuard(guard = null) {
    const hostMessageId = compactString(guard?.hostMessageId || guard?.sourceMessageId);
    if (!hostMessageId || typeof runtimeHost?.chat?.getMessage !== 'function') return false;
    const message = runtimeHost.chat.getMessage(hostMessageId);
    if (!message) return false;
    if (guard?.playerTextHash && fnv1a(message.text || message.mes || message.content || '') !== guard.playerTextHash) {
      return false;
    }
    return true;
  }

  function advisoryEnrichmentGuardCurrent(guard = null) {
    if (!guard) return true;
    if (guard.campaignId && compactString(campaignState?.campaign?.id) !== guard.campaignId) return false;
    const binding = bindingFromState(campaignState);
    if (guard.saveId && compactString(binding?.saveId) !== guard.saveId) return false;
    if (guard.chatId && compactString(binding?.chatId) !== guard.chatId) return false;
    const ingress = runtimeIngressForContext({ ingressId: guard.ingressId });
    if (guard.ingressId && !ingress) return hostSourceMessageMatchesGuard(guard);
    const staleStatuses = new Set(['invalidated', 'edited', 'deleted', 'recoveryRequired', 'canceled', 'awaitingRevision']);
    if (ingress && staleStatuses.has(compactString(ingress.status))) return false;
    if (ingress?.invalidatedAt || ingress?.deletedAt || ingress?.invalidationType) return false;
    if (guard.hostMessageId && compactString(ingress?.hostMessageId) !== guard.hostMessageId) return false;
    if (guard.sourceFrameId && compactString(ingress?.sourceFrameId || ingress?.sourceFrame?.id) !== guard.sourceFrameId) return false;
    if (guard.playerTextHash && compactString(ingress?.textHash) !== guard.playerTextHash) return false;
    return true;
  }

  function advisoryEnrichmentCoreTargetForGuard(guard = null) {
    if (!guard) return null;
    const binding = bindingFromState(campaignState);
    if (guard.campaignId && compactString(campaignState?.campaign?.id) !== guard.campaignId) return null;
    if (guard.saveId && compactString(binding?.saveId) !== guard.saveId) return null;
    if (guard.chatId && compactString(binding?.chatId) !== guard.chatId) return null;
    const ingress = runtimeIngressForContext({ ingressId: guard.ingressId });
    const transactionId = compactString(guard.coreTransactionId || ingress?.coreTransactionId || ingress?.transactionId);
    if (!transactionId) return null;
    return {
      transactionId,
      ingressId: compactString(ingress?.id || guard.ingressId),
      hostMessageId: compactString(ingress?.hostMessageId || guard.hostMessageId),
      sourceFrameId: compactString(ingress?.sourceFrameId || ingress?.sourceFrame?.id || guard.sourceFrameId)
    };
  }

  function advisoryEnrichmentDiagnosticEvent(guard = null, status = 'queued', details = {}) {
    const target = advisoryEnrichmentCoreTargetForGuard(guard);
    if (!target) return null;
    const result = details.result || null;
    const error = details.error || result?.error || null;
    return {
      type: 'sidecar',
      worker: 'missionDirectorAdvisor',
      sidecarType: 'advisoryEnrichment',
      roleId: 'missionDirectorAdvisor',
      status,
      severity: ['failed', 'backgroundBridgeFailed'].includes(status) ? 'warning' : 'info',
      reason: compactString(details.reason || result?.reason),
      resultStatus: compactString(result?.status),
      applied: result?.applied === true,
      scheduled: result?.scheduled === true || status === 'queued',
      advisoryId: guard?.advisoryId || null,
      ingressId: target.ingressId || guard?.ingressId || null,
      hostMessageId: target.hostMessageId || guard?.hostMessageId || null,
      sourceFrameId: target.sourceFrameId || guard?.sourceFrameId || null,
      playerTextHash: guard?.playerTextHash || null,
      fallbackAdvisoryHash: guard?.fallbackAdvisoryHash || null,
      advisoryHash: result?.advisoryHash || null,
      errorCode: compactString(error?.code),
      errorMessageHash: error?.message ? hashStableJson({ message: error.message }) : null,
      observedAt: timestampFromNow(now)
    };
  }

  function queueAdvisoryEnrichmentCoreDiagnostic(guard = null, status = 'queued', details = {}) {
    const event = advisoryEnrichmentDiagnosticEvent(guard, status, details);
    if (!event) return null;
    const target = advisoryEnrichmentCoreTargetForGuard(guard);
    if (!target) return null;
    return queueRuntimeCoreDiagnosticEntry(advisoryEnrichmentDiagnosticBatch, target, event);
  }

  function advisoryEnrichmentCoreBackgroundBundle(guard = null, result = null) {
    const target = advisoryEnrichmentCoreTargetForGuard(guard);
    if (!target || result?.applied !== true) return null;
    const batchSourceId = guard?.advisoryId || target.ingressId || target.transactionId;
    const batchId = `advisory-enrichment:${target.transactionId}:${batchSourceId}`;
    return {
      transactionId: target.transactionId,
      bundle: {
        idempotencyKey: batchId,
        batchId,
        phaseAfter: 'backgroundSettling',
        promptDirtyDomains: normalizePromptDirtyDomains(['commandCompetence']),
        backgroundEffectRefs: [
          {
            effect: 'advisoryEnrichment',
            status: 'applied',
            advisoryId: guard?.advisoryId || null,
            ingressId: target.ingressId || guard?.ingressId || null,
            hostMessageId: target.hostMessageId || guard?.hostMessageId || null,
            sourceFrameId: target.sourceFrameId || guard?.sourceFrameId || null,
            playerTextHash: guard?.playerTextHash || null,
            fallbackAdvisoryHash: guard?.fallbackAdvisoryHash || null,
            advisoryHash: result?.advisoryHash || null
          }
        ],
        workers: [
          {
            worker: 'missionDirectorAdvisor',
            workerId: 'missionDirectorAdvisor',
            sidecarType: 'advisoryEnrichment',
            roleId: 'missionDirectorAdvisor',
            status: 'applied',
            advisoryId: guard?.advisoryId || null,
            ingressId: target.ingressId || guard?.ingressId || null,
            hostMessageId: target.hostMessageId || guard?.hostMessageId || null,
            sourceFrameId: target.sourceFrameId || guard?.sourceFrameId || null,
            playerTextHash: guard?.playerTextHash || null,
            fallbackAdvisoryHash: guard?.fallbackAdvisoryHash || null,
            advisoryHash: result?.advisoryHash || null
          }
        ]
      }
    };
  }

  async function commitAdvisoryEnrichmentCoreBackgroundBatch(guard = null, result = null) {
    const prepared = advisoryEnrichmentCoreBackgroundBundle(guard, result);
    if (!prepared) return null;
    try {
      return await settleInternalForgeBackgroundBatch(prepared, {
        sourceFrameId: guard?.sourceFrameId,
        internalOwner: 'missionDirectorAdvisor',
        appendDiagnostic: (transactionId, diagnostic) => queueForgeInternalCoreDiagnostic(
          advisoryEnrichmentDiagnosticBatch,
          advisoryEnrichmentCoreTargetForGuard(guard),
          transactionId,
          diagnostic
        )
      });
    } catch (error) {
      queueAdvisoryEnrichmentCoreDiagnostic(guard, 'backgroundBridgeFailed', {
        reason: 'core-background-bridge-failed',
        result,
        error
      });
      return null;
    }
  }

  function staleAdvisoryEnrichmentResult(guard = null, reason = 'source-stale') {
    return {
      kind: 'directive.advisoryEnrichmentResult',
      ok: false,
      scheduled: true,
      status: 'stale',
      applied: false,
      reason,
      advisoryId: guard?.advisoryId || null,
      ingressId: guard?.ingressId || null,
      error: {
        code: 'DIRECTIVE_ADVISORY_ENRICHMENT_SOURCE_STALE',
        message: 'Advisory enrichment skipped because the scheduled source is no longer current.'
      }
    };
  }

  function advisoryEnrichmentDiagnosticStatusForResult(result = null) {
    if (result?.status === 'stale') return 'stale';
    if (result?.applied === true) return 'applied';
    if (result?.ok === false || result?.status === 'failed' || result?.error) return 'failed';
    return result?.status || 'settled';
  }

  function scheduleAdvisoryEnrichmentForHostContinue(payload = {}) {
    if (typeof payload.run !== 'function') {
      lastAdvisoryEnrichmentResult = null;
      return null;
    }
    const run = payload.run;
    const sourceGuard = advisoryEnrichmentGuardForContext(payload);
    const scheduled = {
      kind: 'directive.advisoryEnrichmentScheduled',
      ok: null,
      scheduled: true,
      status: 'queued',
      advisoryId: sourceGuard.advisoryId || null,
      ingressId: sourceGuard.ingressId || null,
      scheduledAt: sourceGuard.scheduledAt || timestampFromNow(now)
    };
    lastAdvisoryEnrichmentResult = cloneJson(scheduled);
    queueAdvisoryEnrichmentCoreDiagnostic(sourceGuard, 'queued', { reason: 'postHostContinueRelease', result: scheduled });
    const runTask = async () => {
      advisoryEnrichmentPendingCount += 1;
      try {
        await Promise.resolve();
        if (!advisoryEnrichmentGuardCurrent(sourceGuard)) {
          lastAdvisoryEnrichmentResult = staleAdvisoryEnrichmentResult(sourceGuard, 'source-stale-before-provider');
          queueAdvisoryEnrichmentCoreDiagnostic(sourceGuard, 'stale', {
            reason: 'source-stale-before-provider',
            result: lastAdvisoryEnrichmentResult
          });
          await flushAdvisoryEnrichmentCoreDiagnostics();
          return cloneJson(lastAdvisoryEnrichmentResult);
        }
        const result = await run({
          isSourceCurrent: () => advisoryEnrichmentGuardCurrent(sourceGuard)
        });
        if (!advisoryEnrichmentGuardCurrent(sourceGuard)) {
          lastAdvisoryEnrichmentResult = staleAdvisoryEnrichmentResult(sourceGuard, 'source-stale-after-provider');
          queueAdvisoryEnrichmentCoreDiagnostic(sourceGuard, 'stale', {
            reason: 'source-stale-after-provider',
            result: lastAdvisoryEnrichmentResult
          });
          await flushAdvisoryEnrichmentCoreDiagnostics();
          return cloneJson(lastAdvisoryEnrichmentResult);
        }
        if (result?.campaignState) {
          campaignState = mergeFresherResponseLedgerProjection(
            applyRuntimeSettings(result.campaignState),
            campaignState
          );
          await settleRuntimePersistenceQueue();
        }
        lastAdvisoryEnrichmentResult = {
          kind: 'directive.advisoryEnrichmentResult',
          ok: result?.ok !== false,
          scheduled: true,
          status: result?.status || (result?.applied === true ? 'applied' : 'settled'),
          applied: result?.applied === true,
          reason: result?.reason || 'postHostContinueRelease',
          advisoryId: sourceGuard.advisoryId || result?.advisoryId || null,
          ingressId: sourceGuard.ingressId || result?.ingressId || null,
          advisoryHash: result?.advisoryHash || null
        };
        let backgroundBatchCommitted = null;
        if (lastAdvisoryEnrichmentResult.applied === true) {
          backgroundBatchCommitted = await commitAdvisoryEnrichmentCoreBackgroundBatch(sourceGuard, lastAdvisoryEnrichmentResult);
        }
        if (!backgroundBatchCommitted) {
          queueAdvisoryEnrichmentCoreDiagnostic(
            sourceGuard,
            advisoryEnrichmentDiagnosticStatusForResult(lastAdvisoryEnrichmentResult),
            { reason: 'postHostContinueRelease', result: lastAdvisoryEnrichmentResult }
          );
        }
        await flushAdvisoryEnrichmentCoreDiagnostics();
        return cloneJson(lastAdvisoryEnrichmentResult);
      } catch (error) {
        lastAdvisoryEnrichmentResult = {
          kind: 'directive.advisoryEnrichmentResult',
          ok: false,
          scheduled: true,
          status: 'failed',
          applied: false,
          reason: 'postHostContinueRelease',
          advisoryId: sourceGuard.advisoryId || null,
          ingressId: sourceGuard.ingressId || null,
          error: {
            code: error?.code || 'DIRECTIVE_ADVISORY_ENRICHMENT_BACKGROUND_FAILED',
            message: error?.message || String(error)
          }
        };
        queueAdvisoryEnrichmentCoreDiagnostic(sourceGuard, 'failed', {
          reason: 'postHostContinueRelease',
          result: lastAdvisoryEnrichmentResult,
          error
        });
        await flushAdvisoryEnrichmentCoreDiagnostics();
        return cloneJson(lastAdvisoryEnrichmentResult);
      } finally {
        advisoryEnrichmentPendingCount = Math.max(0, advisoryEnrichmentPendingCount - 1);
      }
    };
    const task = advisoryEnrichmentQueue.then(runTask, runTask);
    advisoryEnrichmentQueue = task.catch(() => null);
    return cloneJson(scheduled);
  }

  function terminalCheckpointCoreTargetForEvent(event = {}) {
    const binding = bindingFromState(campaignState);
    const interactionId = compactString(event.interactionId || event.pendingInteractionId);
    const ledger = terminalDecisionLedgerView(campaignState || {});
    const decision = (Array.isArray(ledger.decisions) ? ledger.decisions : [])
      .find((entry) => compactString(entry?.id) === interactionId) || null;
    const interaction = pendingInteractionProjectionRows(campaignState)
      .find((entry) => compactString(entry?.id) === interactionId) || null;
    const ingress = runtimeIngressForContext({
      ingressId: event.ingressId || interaction?.ingressId,
      outcomeId: event.outcomeId || interaction?.outcomeId || decision?.outcomeId,
      turnId: event.turnId || interaction?.turnId || decision?.turnId
    });
    const transactionId = compactString(event.coreTransactionId || ingress?.coreTransactionId);
    if (!transactionId) return null;
    return {
      transactionId,
      campaignId: compactString(campaignState?.campaign?.id),
      saveId: compactString(binding?.saveId),
      chatId: compactString(binding?.chatId),
      ingressId: compactString(ingress?.id || event.ingressId || interaction?.ingressId),
      resolutionIngressId: compactString(event.resolutionIngressId),
      interactionId,
      pendingInteractionId: compactString(event.pendingInteractionId),
      turnId: compactString(event.turnId || ingress?.turnId || interaction?.turnId || decision?.turnId),
      outcomeId: compactString(event.outcomeId || ingress?.outcomeId || interaction?.outcomeId || decision?.outcomeId),
      hostMessageId: compactString(ingress?.hostMessageId),
      sourceFrameId: compactString(ingress?.sourceFrameId || ingress?.sourceFrame?.id),
      checkpointHostMessageId: compactString(event.checkpointHostMessageId || decision?.checkpointMessageId),
      resolutionHostMessageId: compactString(event.resolutionHostMessageId),
      action: compactString(event.action || decision?.resolution?.action),
      status: compactString(event.status) || 'settled',
      reason: compactString(event.reason)
    };
  }

  function terminalCheckpointDiagnosticEvent(target = null, event = {}, status = null, details = {}) {
    if (!target) return null;
    const resolvedStatus = compactString(status || event.status) || 'settled';
    const error = details.error || null;
    return {
      type: 'terminalCheckpoint',
      worker: 'terminalOutcomeCheckpoint',
      sidecarType: 'terminalOutcomeCheckpoint',
      status: resolvedStatus,
      severity: ['failed', 'backgroundBridgeFailed'].includes(resolvedStatus) ? 'warning' : 'info',
      settlementKind: compactString(event.kind),
      reason: compactString(details.reason || event.reason),
      interactionId: target.interactionId || null,
      pendingInteractionId: target.pendingInteractionId || null,
      action: target.action || null,
      outcomeId: target.outcomeId || null,
      turnId: target.turnId || null,
      ingressId: target.ingressId || null,
      resolutionIngressId: target.resolutionIngressId || null,
      hostMessageId: target.hostMessageId || null,
      checkpointHostMessageId: target.checkpointHostMessageId || null,
      resolutionHostMessageId: target.resolutionHostMessageId || null,
      sourceFrameId: target.sourceFrameId || null,
      errorCode: compactString(error?.code),
      errorMessageHash: error?.message ? hashStableJson({ message: error.message }) : null,
      observedAt: timestampFromNow(now)
    };
  }

  function terminalCheckpointCoreBackgroundBundle(target = null, event = {}) {
    if (!target || event.status === 'failed') return null;
    const settlementKind = compactString(event.kind) || 'terminalOutcomeCheckpoint';
    const batchSourceId = target.interactionId || target.outcomeId || target.ingressId || target.transactionId;
    const batchId = `terminal-checkpoint:${target.transactionId}:${settlementKind}:${batchSourceId}`;
    return {
      transactionId: target.transactionId,
      bundle: {
        idempotencyKey: batchId,
        batchId,
        phaseAfter: event.kind === 'terminalOutcomeCheckpointPosted' ? 'backgroundSettling' : 'settled',
        outcomeId: target.outcomeId || null,
        promptDirtyDomains: [],
        backgroundEffectRefs: [
          {
            effect: settlementKind,
            status: target.status || 'posted',
            interactionId: target.interactionId || null,
            pendingInteractionId: target.pendingInteractionId || null,
            action: target.action || null,
            outcomeId: target.outcomeId || null,
            turnId: target.turnId || null,
            ingressId: target.ingressId || null,
            resolutionIngressId: target.resolutionIngressId || null,
            hostMessageId: target.hostMessageId || null,
            checkpointHostMessageId: target.checkpointHostMessageId || null,
            resolutionHostMessageId: target.resolutionHostMessageId || null,
            sourceFrameId: target.sourceFrameId || null
          }
        ],
        workers: [
          {
            worker: 'terminalOutcomeCheckpoint',
            workerId: 'terminalOutcomeCheckpoint',
            sidecarType: 'terminalOutcomeCheckpoint',
            status: target.status || 'posted',
            interactionId: target.interactionId || null,
            pendingInteractionId: target.pendingInteractionId || null,
            action: target.action || null,
            outcomeId: target.outcomeId || null,
            turnId: target.turnId || null,
            ingressId: target.ingressId || null,
            resolutionIngressId: target.resolutionIngressId || null,
            hostMessageId: target.hostMessageId || null,
            checkpointHostMessageId: target.checkpointHostMessageId || null,
            resolutionHostMessageId: target.resolutionHostMessageId || null,
            sourceFrameId: target.sourceFrameId || null
          }
        ]
      }
    };
  }

  function queueTerminalCheckpointSettlement(event = {}) {
    const target = terminalCheckpointCoreTargetForEvent(event);
    const scheduled = {
      kind: 'directive.terminalCheckpointSettlementScheduled',
      ok: null,
      scheduled: Boolean(target),
      status: target ? 'queued' : 'skipped',
      reason: target ? compactString(event.reason) || 'terminal-checkpoint-settlement' : 'core-target-unavailable',
      settlementKind: compactString(event.kind),
      interactionId: compactString(event.interactionId || event.pendingInteractionId),
      ingressId: compactString(event.ingressId),
      resolutionIngressId: compactString(event.resolutionIngressId),
      outcomeId: compactString(event.outcomeId),
      turnId: compactString(event.turnId),
      scheduledAt: timestampFromNow(now)
    };
    lastTerminalCheckpointSettlementResult = cloneJson(scheduled);
    if (!target) return cloneJson(scheduled);
    const runTask = async () => {
      try {
        let backgroundBatchCommitted = null;
        const prepared = terminalCheckpointCoreBackgroundBundle(target, event);
        if (prepared) {
          try {
            if (event.kind !== 'terminalOutcomeCheckpointPosted' && target.resolutionIngressId && target.ingressId === target.resolutionIngressId) {
              await runtimeCoreTurnStore.advanceTurn(target.transactionId, {
                phase: 'routePending',
                route: 'terminalCheckpointResolution',
                reason: 'terminal-checkpoint-resolution',
                idempotencyKey: `terminal-checkpoint-resolution-route:${target.transactionId}:${target.interactionId || target.ingressId || 'decision'}`
              });
            }
            backgroundBatchCommitted = await settleInternalForgeBackgroundBatch(prepared, {
              sourceFrameId: target.sourceFrameId,
              internalOwner: 'terminalOutcomeCheckpoint',
              appendDiagnostic: (transactionId, diagnostic) => queueForgeInternalCoreDiagnostic(
                terminalCheckpointDiagnosticBatch,
                target,
                transactionId,
                diagnostic
              )
            });
          } catch (error) {
            const diagnostic = terminalCheckpointDiagnosticEvent(target, event, 'backgroundBridgeFailed', {
              reason: 'core-background-bridge-failed',
              error
            });
            queueTerminalCheckpointCoreDiagnostic(target, diagnostic);
          }
        }
        if (!backgroundBatchCommitted || event.kind === 'terminalOutcomeCheckpointResolved') {
          const diagnostic = terminalCheckpointDiagnosticEvent(target, event, event.status || 'settled', {});
          queueTerminalCheckpointCoreDiagnostic(target, diagnostic);
        }
        lastTerminalCheckpointSettlementResult = {
          kind: 'directive.terminalCheckpointSettlementResult',
          ok: true,
          scheduled: true,
          status: event.status || 'settled',
          settlementKind: compactString(event.kind),
          interactionId: target.interactionId || null,
          ingressId: target.ingressId || null,
          resolutionIngressId: target.resolutionIngressId || null,
          outcomeId: target.outcomeId || null,
          backgroundBatchCommitted: Boolean(backgroundBatchCommitted)
        };
        return cloneJson(lastTerminalCheckpointSettlementResult);
      } catch (error) {
        lastTerminalCheckpointSettlementResult = {
          kind: 'directive.terminalCheckpointSettlementResult',
          ok: false,
          scheduled: true,
          status: 'failed',
          settlementKind: compactString(event.kind),
          interactionId: target.interactionId || null,
          error: {
            code: error?.code || 'DIRECTIVE_TERMINAL_CHECKPOINT_SETTLEMENT_FAILED',
            message: error?.message || String(error)
          }
        };
        return cloneJson(lastTerminalCheckpointSettlementResult);
      }
    };
    const task = terminalCheckpointSettlementQueue.then(runTask, runTask);
    terminalCheckpointSettlementQueue = task.catch(() => null);
    return cloneJson(scheduled);
  }

  function sidecarCoreDiagnosticTargetForEvent(event = {}) {
    const ingress = runtimeIngressForContext({
      ingressId: event.ingressId,
      outcomeId: event.outcomeId,
      turnId: event.turnId
    });
    const transactionId = compactString(event.coreTransactionId || ingress?.coreTransactionId);
    if (!transactionId) return null;
    const binding = bindingFromState(campaignState);
    const campaignId = compactString(event.campaignId);
    const saveId = compactString(event.saveId);
    const chatId = compactString(event.chatId);
    if (campaignId && compactString(campaignState?.campaign?.id) !== campaignId) return null;
    if (saveId && compactString(binding?.saveId) !== saveId) return null;
    if (chatId && compactString(binding?.chatId) !== chatId) return null;
    return {
      transactionId,
      campaignId: campaignId || compactString(campaignState?.campaign?.id),
      saveId: saveId || compactString(binding?.saveId),
      chatId: chatId || compactString(binding?.chatId),
      ingressId: compactString(ingress?.id || event.ingressId),
      turnId: compactString(ingress?.turnId || event.turnId),
      outcomeId: compactString(ingress?.outcomeId || event.outcomeId),
      hostMessageId: compactString(ingress?.hostMessageId || event.hostMessageId),
      sourceFrameId: compactString(ingress?.sourceFrameId || ingress?.sourceFrame?.id || event.sourceFrameId)
    };
  }

  async function appendSidecarCoreDiagnostic(event = {}) {
    const target = sidecarCoreDiagnosticTargetForEvent(event);
    if (!target) return null;
    return runtimeCoreTurnStore.appendDiagnostic(target.transactionId, {
      ...cloneJson(event),
      type: 'sidecar',
      source: event.source || 'campaignSidecarScheduler',
      campaignId: target.campaignId || null,
      saveId: target.saveId || null,
      chatId: target.chatId || null,
      ingressId: target.ingressId || null,
      turnId: target.turnId || null,
      outcomeId: target.outcomeId || null,
      hostMessageId: target.hostMessageId || null,
      sourceFrameId: target.sourceFrameId || null,
      coreTransactionId: target.transactionId
    });
  }

  async function appendSidecarCoreDiagnosticsBatch(events = []) {
    const groups = new Map();
    for (const event of Array.isArray(events) ? events : [events]) {
      const target = sidecarCoreDiagnosticTargetForEvent(event);
      if (!target) continue;
      const diagnostic = {
        ...cloneJson(event),
        type: event.type || 'sidecar',
        source: event.source || (event.type === 'forge' ? 'forgeCoordinator' : 'campaignSidecarScheduler'),
        campaignId: target.campaignId || null,
        saveId: target.saveId || null,
        chatId: target.chatId || null,
        ingressId: target.ingressId || null,
        turnId: target.turnId || null,
        outcomeId: target.outcomeId || null,
        hostMessageId: target.hostMessageId || null,
        sourceFrameId: target.sourceFrameId || null,
        coreTransactionId: target.transactionId
      };
      const group = groups.get(target.transactionId) || [];
      group.push(diagnostic);
      groups.set(target.transactionId, group);
    }
    const results = [];
    for (const [transactionId, diagnostics] of groups.entries()) {
      if (typeof runtimeCoreTurnStore.appendDiagnosticsBatch === 'function') {
        results.push(await runtimeCoreTurnStore.appendDiagnosticsBatch(transactionId, diagnostics));
      } else {
        for (const diagnostic of diagnostics) {
          results.push(await runtimeCoreTurnStore.appendDiagnostic(transactionId, diagnostic));
        }
      }
    }
    return results.flat();
  }

  function queueRuntimeCoreDiagnosticEntry(batch = [], target = null, event = null) {
    if (!target?.transactionId || !event) return null;
    batch.push({
      transactionId: target.transactionId,
      diagnostic: cloneJson(event)
    });
    return cloneJson(event);
  }

  function queueForgeInternalCoreDiagnostic(batch = [], target = null, transactionId = null, diagnostic = null) {
    const resolvedTransactionId = compactString(transactionId || target?.transactionId);
    if (!resolvedTransactionId || !target || !diagnostic) return null;
    const binding = bindingFromState(campaignState);
    return queueRuntimeCoreDiagnosticEntry(batch, { ...target, transactionId: resolvedTransactionId }, {
      ...cloneJson(diagnostic),
      type: 'forge',
      source: 'forgeCoordinator',
      campaignId: compactString(target.campaignId || campaignState?.campaign?.id),
      saveId: compactString(target.saveId || binding?.saveId),
      chatId: compactString(target.chatId || binding?.chatId),
      ingressId: compactString(target.ingressId),
      turnId: compactString(target.turnId),
      outcomeId: compactString(target.outcomeId),
      hostMessageId: compactString(target.hostMessageId),
      sourceFrameId: compactString(target.sourceFrameId),
      coreTransactionId: resolvedTransactionId
    });
  }

  function queueTerminalCheckpointCoreDiagnostic(target = null, event = null) {
    return queueRuntimeCoreDiagnosticEntry(terminalCheckpointDiagnosticBatch, target, event);
  }

  async function appendRuntimeCoreDiagnosticsBatch(entries = []) {
    const groups = new Map();
    for (const entry of Array.isArray(entries) ? entries : [entries]) {
      const transactionId = compactString(entry?.transactionId);
      if (!transactionId || !entry?.diagnostic) continue;
      const group = groups.get(transactionId) || [];
      group.push(cloneJson(entry.diagnostic));
      groups.set(transactionId, group);
    }
    const results = [];
    for (const [transactionId, diagnostics] of groups.entries()) {
      results.push(await runtimeCoreTurnStore.appendDiagnosticsBatch(transactionId, diagnostics));
    }
    return results.flat();
  }

  function flushCommandLogSummaryCoreDiagnostics() {
    const pending = commandLogSummaryDiagnosticBatch.splice(0);
    if (!pending.length) return commandLogSummaryDiagnosticQueue;
    const append = commandLogSummaryDiagnosticQueue
      .catch(() => null)
      .then(() => appendRuntimeCoreDiagnosticsBatch(pending))
      .catch(() => null);
    commandLogSummaryDiagnosticQueue = append.then(() => null, () => null);
    return append;
  }

  function flushPostCommitConversationCoreDiagnostics() {
    const pending = postCommitConversationDiagnosticBatch.splice(0);
    if (!pending.length) return postCommitConversationDiagnosticQueue;
    const append = postCommitConversationDiagnosticQueue
      .catch(() => null)
      .then(() => appendRuntimeCoreDiagnosticsBatch(pending))
      .catch(() => null);
    postCommitConversationDiagnosticQueue = append.then(() => null, () => null);
    return append;
  }

  function flushAdvisoryEnrichmentCoreDiagnostics() {
    const pending = advisoryEnrichmentDiagnosticBatch.splice(0);
    if (!pending.length) return advisoryEnrichmentDiagnosticQueue;
    const append = advisoryEnrichmentDiagnosticQueue
      .catch(() => null)
      .then(() => appendRuntimeCoreDiagnosticsBatch(pending))
      .catch(() => null);
    advisoryEnrichmentDiagnosticQueue = append.then(() => null, () => null);
    return append;
  }

  function flushTerminalCheckpointCoreDiagnostics() {
    const pending = terminalCheckpointDiagnosticBatch.splice(0);
    if (!pending.length) return terminalCheckpointDiagnosticQueue;
    const append = terminalCheckpointDiagnosticQueue
      .catch(() => null)
      .then(() => appendRuntimeCoreDiagnosticsBatch(pending))
      .catch(() => null);
    terminalCheckpointDiagnosticQueue = append.then(() => null, () => null);
    return append;
  }

  function staleCommandLogSummaryResult(guard = null, reason = 'source-stale') {
    return {
      kind: 'directive.commandLogSummarySidecarResult',
      ok: false,
      scheduled: true,
      status: 'stale',
      applied: false,
      reason,
      outcomeId: guard?.outcomeId || null,
      error: {
        code: 'DIRECTIVE_COMMAND_LOG_SUMMARY_SOURCE_STALE',
        message: 'Command Log summary skipped because the scheduled source is no longer current.'
      }
    };
  }

  function deferredCommandLogSummaryResult(turnPacket = null, reason = 'afterDirectiveNarration') {
    const outcomeId = commandLogSummaryOutcomeId(turnPacket);
    return {
      kind: 'directive.commandLogSummarySidecarScheduled',
      ok: null,
      scheduled: false,
      status: 'deferred',
      deferredUntil: reason,
      outcomeId: outcomeId || null,
      turnId: turnPacket?.turnId || turnPacket?.id || null,
      recordedAt: timestampFromNow(now)
    };
  }

  function deferCommandLogSummaryForTurn({
    turnPacket,
    enabled = true,
    reason = 'afterDirectiveNarration'
  } = {}) {
    if (!enabled || !runtimeHost) {
      deferredCommandLogSummaryRequest = null;
      lastCommandLogSummarySidecarResult = null;
      return null;
    }
    requireObject(turnPacket, 'turnPacket');
    deferredCommandLogSummaryRequest = {
      turnPacket: cloneJson(turnPacket),
      reason
    };
    lastCommandLogSummarySidecarResult = deferredCommandLogSummaryResult(turnPacket, reason);
    return cloneJson(lastCommandLogSummarySidecarResult);
  }

  function scheduleCommandLogSummaryForTurnNow({
    turnPacket,
    enabled = true,
    reason = 'postVisibleResponse',
    ingressId = null,
    turnId = null,
    outcomeId = null
  } = {}) {
    if (!enabled || !runtimeHost) {
      lastCommandLogSummarySidecarResult = null;
      return null;
    }
    requireObject(turnPacket, 'turnPacket');
    const queuedTurnPacket = cloneJson(turnPacket);
    const resolvedOutcomeId = compactString(outcomeId) || commandLogSummaryOutcomeId(queuedTurnPacket);
    const sourceGuard = commandLogSummarySourceGuardForTurn(queuedTurnPacket, {
      ingressId,
      turnId,
      outcomeId: resolvedOutcomeId
    });
    const scheduled = {
      kind: 'directive.commandLogSummarySidecarScheduled',
      ok: null,
      scheduled: true,
      status: 'queued',
      reason,
      outcomeId: resolvedOutcomeId || null,
      turnId: sourceGuard.turnId || queuedTurnPacket?.turnId || queuedTurnPacket?.id || null,
      scheduledAt: timestampFromNow(now)
    };
    lastCommandLogSummarySidecarResult = cloneJson(scheduled);
    queueCommandLogSummaryCoreDiagnostic(sourceGuard, 'queued', { reason, result: scheduled });
    const runTask = async () => {
      commandLogSummaryPendingCount += 1;
      try {
        if (!commandLogSummaryGuardCurrent(sourceGuard)) {
          lastCommandLogSummarySidecarResult = staleCommandLogSummaryResult(sourceGuard, 'source-stale-before-provider');
          queueCommandLogSummaryCoreDiagnostic(sourceGuard, 'stale', {
            reason: 'source-stale-before-provider',
            result: lastCommandLogSummarySidecarResult
          });
          await flushCommandLogSummaryCoreDiagnostics();
          return cloneJson(lastCommandLogSummarySidecarResult);
        }
        const result = await updateCommandLogSummaryForTurnNow({
          turnPacket: queuedTurnPacket,
          enabled: true,
          sourceGuard
        });
        let backgroundBatchCommitted = null;
        if (result?.applied === true && result?.assistedSummary?.status === 'complete') {
          backgroundBatchCommitted = await commitCommandLogSummaryCoreBackgroundBatch(sourceGuard, result);
        }
        if (!backgroundBatchCommitted) {
          queueCommandLogSummaryCoreDiagnostic(sourceGuard, commandLogSummaryDiagnosticStatusForResult(result), {
            reason,
            result
          });
        }
        await flushCommandLogSummaryCoreDiagnostics();
        if (result?.applied) {
          await persistRuntimeCampaignState(
            campaignState,
            'Command Log assisted summary settled for the latest committed turn.'
          );
        }
        return result;
      } catch (error) {
        lastCommandLogSummarySidecarResult = {
          ok: false,
          scheduled: true,
          status: 'failed',
          reason,
          outcomeId: resolvedOutcomeId || null,
          error: {
            code: error?.code || 'DIRECTIVE_COMMAND_LOG_SUMMARY_BACKGROUND_FAILED',
            message: error?.message || String(error)
          }
        };
        queueCommandLogSummaryCoreDiagnostic(sourceGuard, 'failed', {
          reason,
          result: lastCommandLogSummarySidecarResult,
          error
        });
        await flushCommandLogSummaryCoreDiagnostics();
        return cloneJson(lastCommandLogSummarySidecarResult);
      } finally {
        commandLogSummaryPendingCount = Math.max(0, commandLogSummaryPendingCount - 1);
      }
    };
    const task = commandLogSummaryQueue.then(runTask, runTask);
    commandLogSummaryQueue = task.catch(() => null);
    return cloneJson(scheduled);
  }

  function scheduleDeferredCommandLogSummaryQueue(reason = 'afterDirectiveNarration') {
    if (!deferredCommandLogSummaryRequest) return null;
    const request = deferredCommandLogSummaryRequest;
    deferredCommandLogSummaryRequest = null;
    return scheduleCommandLogSummaryForTurnNow({
      turnPacket: request.turnPacket,
      enabled: true,
      reason: request.reason || reason
    });
  }

  function sameBoundCampaignState(left = null, right = null) {
    if (!left || !right) return false;
    const leftBinding = bindingFromState(left);
    const rightBinding = bindingFromState(right);
    return Boolean(
      left.campaign?.id
      && right.campaign?.id
      && left.campaign.id === right.campaign.id
      && (!leftBinding?.chatId || !rightBinding?.chatId || leftBinding.chatId === rightBinding.chatId)
      && (!leftBinding?.saveId || !rightBinding?.saveId || leftBinding.saveId === rightBinding.saveId)
    );
  }

  function syncCurrentChatScopeCampaignState(state = null) {
    if (!isObject(currentChatScope) || !isObject(state)) return;
    if (
      sameBoundCampaignState(currentChatScope.campaignState, state)
      || shouldPreferInMemoryCampaignState(currentChatScope.campaignState, state, {
        chatId: currentChatScope?.currentChat?.chatId || currentChatScope?.currentChat?.id || null,
        fallbackHostId: runtimeHost?.id || null,
        fallbackSaveId: controller?.activeSaveId || null
      })
    ) {
      currentChatScope = {
        ...currentChatScope,
        campaignState: cloneJson(state)
      };
    }
  }

  function pendingTerminalDecisionId(state = null) {
    const ledger = terminalDecisionLedgerView(state || {});
    const activeDecisionId = compactString(ledger.activeDecisionId);
    const decisions = Array.isArray(ledger.decisions) ? ledger.decisions : [];
    const activeDecision = activeDecisionId
      ? decisions.find((entry) => entry?.id === activeDecisionId && entry?.status === 'pending')
      : null;
    if (activeDecision) return activeDecision.id;
    return null;
  }

  function terminalDecisionStillPending(state = null, decisionId = null) {
    const id = compactString(decisionId);
    if (!id) return false;
    const ledger = terminalDecisionLedgerView(state || {});
    const decision = (Array.isArray(ledger.decisions) ? ledger.decisions : []).find((entry) => entry?.id === id);
    return decision?.status === 'pending';
  }

  function isExplicitTerminalResolutionSummary(summary = '') {
    return /\b(?:replayed from terminal|accepted terminal|saved terminal|resolved terminal outcome|terminal outcome decision)\b/i.test(String(summary || ''));
  }

  function shouldPreserveFresherTerminalState(current = null, incoming = null, summary = '') {
    if (!sameBoundCampaignState(current, incoming)) return false;
    if (runtimeRevisionOf(incoming) > runtimeRevisionOf(current)) return false;
    const decisionId = pendingTerminalDecisionId(current);
    if (!decisionId) return false;
    if (terminalDecisionStillPending(incoming, decisionId)) return false;
    if (isExplicitTerminalResolutionSummary(summary)) return false;
    return true;
  }

  function preserveCurrentRuntimeSettingsForBoundState(nextState = null, currentState = null, targetSaveId = null) {
    if (!nextState || !currentState) return nextState;
    if (!isObject(currentState?.settings)) return nextState;
    const nextBinding = bindingFromState(nextState);
    const currentBinding = bindingFromState(currentState);
    const nextCampaignId = compactString(nextState?.campaign?.id || nextBinding?.campaignId);
    const currentCampaignId = compactString(currentState?.campaign?.id || currentBinding?.campaignId);
    const saveId = compactString(targetSaveId);
    const nextSaveId = compactString(nextBinding?.saveId || saveId);
    const currentSaveId = compactString(currentBinding?.saveId || controller?.activeSaveId);
    if (!nextCampaignId || !currentCampaignId || nextCampaignId !== currentCampaignId) return nextState;
    if (saveId && nextSaveId && nextSaveId !== saveId) return nextState;
    if (saveId && currentSaveId && currentSaveId !== saveId) return nextState;
    if (hashStableJson(nextState?.settings || {}) === hashStableJson(currentState.settings || {})) return nextState;
    return {
      ...cloneJson(nextState),
      settings: cloneJson(currentState.settings)
    };
  }

  function runtimeSettingsOverlayApplies(state = null, targetSaveId = null) {
    if (!runtimeSettingsOverlay?.settings) return false;
    const binding = bindingFromState(state);
    const stateCampaignId = compactString(state?.campaign?.id || binding?.campaignId);
    const stateSaveId = compactString(binding?.saveId || targetSaveId);
    return Boolean(
      stateCampaignId
      && stateCampaignId === runtimeSettingsOverlay.campaignId
      && stateSaveId
      && stateSaveId === runtimeSettingsOverlay.saveId
    );
  }

  function applyRuntimeSettingsOverlay(state = null, targetSaveId = null) {
    if (!runtimeSettingsOverlayApplies(state, targetSaveId)) return state;
    if (hashStableJson(state?.settings || {}) === hashStableJson(runtimeSettingsOverlay.settings || {})) return state;
    return {
      ...cloneJson(state),
      settings: cloneJson(runtimeSettingsOverlay.settings)
    };
  }

  function rememberRuntimeSettingsOverlay(state = null) {
    const binding = bindingFromState(state);
    const campaignId = compactString(state?.campaign?.id || binding?.campaignId);
    const saveId = compactString(binding?.saveId || controller?.activeSaveId);
    if (!campaignId || !saveId || !isObject(state?.settings)) return;
    runtimeSettingsOverlay = {
      campaignId,
      saveId,
      settings: cloneJson(state.settings)
    };
  }

  async function persistRuntimeCampaignStateNow(state, summary = 'Directive campaign state updated.', {
    forceSaveIndexUpdate = false
  } = {}) {
    let nextState = modelCallJournal.applyPending(cloneJson(state));
    nextState = mergeFresherResponseLedgerProjection(nextState, campaignState);
    const targetSaveId = compactString(nextState?.campaignChatBinding?.saveId || controller?.activeSaveId);
    nextState = preserveCurrentRuntimeSettingsForBoundState(nextState, campaignState, targetSaveId);
    nextState = applyRuntimeSettingsOverlay(nextState, targetSaveId);
    const activeSaveId = compactString(controller?.activeSaveId);
    if (!targetSaveId) return null;
    const isActiveSaveWrite = !activeSaveId || activeSaveId === targetSaveId;
    if (!isActiveSaveWrite) {
      const stateForPersistence = await stateWithCoreProjectionFreshnessEvidence(nextState);
      const save = await controller.persistRuntimeCampaignState({
        saveId: targetSaveId,
        campaignState: stateForPersistence,
        summary,
        reason: 'runtimePersist:background-save',
        markActive: false,
        updateSaveIndex: forceSaveIndexUpdate ? true : undefined
      });
      await refreshCampaignView();
      return cloneJson(save);
    }
    const campaignStateForFreshness = await stateWithCoreProjectionFreshnessEvidence(campaignState);
    if (shouldPreferInMemoryCampaignState(nextState, campaignStateForFreshness, {
      chatId: nextState?.campaignChatBinding?.chatId || campaignState?.campaignChatBinding?.chatId || null,
      fallbackHostId: runtimeHost?.id || null,
      fallbackSaveId: targetSaveId
    })) {
      campaignState = applyRuntimeSettingsOverlay(modelCallJournal.applyPending(campaignState), targetSaveId);
      const stateForPersistence = await stateWithCoreProjectionFreshnessEvidence(campaignState);
      const save = await controller.persistRuntimeCampaignState({
        saveId: targetSaveId,
        campaignState: stateForPersistence,
        summary: `Preserved fresher runtime state over stale write: ${summary}`,
        reason: 'runtimePersist:fresher-state',
        markActive: false,
        updateSaveIndex: forceSaveIndexUpdate ? true : undefined
      });
      await refreshCampaignView();
      return cloneJson(save);
    }
    if (shouldPreserveFresherTerminalState(campaignState, nextState, summary)) {
      campaignState = applyRuntimeSettingsOverlay(modelCallJournal.applyPending(campaignState), targetSaveId);
      const stateForPersistence = await stateWithCoreProjectionFreshnessEvidence(campaignState);
      const save = await controller.persistRuntimeCampaignState({
        saveId: targetSaveId,
        campaignState: stateForPersistence,
        summary: 'Preserved pending terminal outcome state over stale runtime write.',
        reason: 'runtimePersist:preserve-terminal',
        markActive: false,
        updateSaveIndex: forceSaveIndexUpdate ? true : undefined
      });
      await refreshCampaignView();
      return cloneJson(save);
    }
    campaignState = nextState;
    const stateForPersistence = await stateWithCoreProjectionFreshnessEvidence(nextState);
    const save = await controller.persistRuntimeCampaignState({
      saveId: targetSaveId,
      campaignState: stateForPersistence,
      summary,
      reason: 'runtimePersist',
      markActive: false,
      updateSaveIndex: forceSaveIndexUpdate ? true : undefined
    });
    campaignState = mergeFresherResponseLedgerProjection(campaignState, nextState);
    await refreshCampaignView();
    return cloneJson(save);
  }

  function ensureRuntimePersistCoordinator() {
    if (!runtimePersistCoordinator) {
      runtimePersistCoordinator = createRuntimePersistCoordinator({
        persistNow: persistRuntimeCampaignStateNow,
        mergePendingRequest: (priorRequest, nextRequest) => mergeRuntimePersistPendingRequest(priorRequest, nextRequest, {
          chatId: nextRequest?.state?.campaignChatBinding?.chatId
            || priorRequest?.state?.campaignChatBinding?.chatId
            || campaignState?.campaignChatBinding?.chatId
            || null,
          fallbackHostId: runtimeHost?.id || null,
          fallbackSaveId: nextRequest?.state?.campaignChatBinding?.saveId
            || priorRequest?.state?.campaignChatBinding?.saveId
            || controller?.activeSaveId
            || null
        })
      });
    }
    return runtimePersistCoordinator;
  }

  function persistRuntimeCampaignState(state, summary = 'Directive campaign state updated.', {
    forceSaveIndexUpdate = false
  } = {}) {
    return ensureRuntimePersistCoordinator().persist(state, summary, {
      fallbackHostId: runtimeHost?.id || null,
      fallbackSaveId: controller?.activeSaveId || null,
      forceSaveIndexUpdate
    });
  }

  async function settleRuntimePersistenceQueue() {
    await ensureRuntimePersistCoordinator().settle();
  }

  async function settleCommandLogSummaryQueue() {
    await commandLogSummaryQueue;
    await settleRuntimePersistenceQueue();
    await flushCommandLogSummaryCoreDiagnostics();
    return cloneJson(lastCommandLogSummarySidecarResult);
  }

  async function settlePostCommitConversationQueue() {
    await postCommitConversationQueue;
    await settleRuntimePersistenceQueue();
    await flushPostCommitConversationCoreDiagnostics();
    return cloneJson(lastPostCommitConversationResult);
  }

  async function settleAdvisoryEnrichmentQueue() {
    await advisoryEnrichmentQueue;
    await settleRuntimePersistenceQueue();
    await flushAdvisoryEnrichmentCoreDiagnostics();
    return cloneJson(lastAdvisoryEnrichmentResult);
  }

  async function settleTerminalCheckpointSettlementQueue() {
    await terminalCheckpointSettlementQueue;
    await settleRuntimePersistenceQueue();
    await flushTerminalCheckpointCoreDiagnostics();
    await terminalCheckpointDiagnosticQueue;
    return cloneJson(lastTerminalCheckpointSettlementResult);
  }

  function ensureTurnCommitCoordinator() {
    if (!durabilityCoordinator) {
      durabilityCoordinator = createTurnCommitCoordinator({
        persist: persistRuntimeCampaignState,
        coreTurnStore: runtimeCoreTurnStore,
        now
      });
    }
    return durabilityCoordinator;
  }

  async function synchronizeActivePrompt(state = campaignState, {
    persist = true,
    rebuild = false,
    reason = 'Campaign prompt context synchronized.',
    promptFrame = null,
    useContinuityPlanner = null,
    activityReporter = null,
    activitySource = 'promptSync',
    activityMode = 'blocking',
    activityContext = null,
    idempotencyKey = null,
    promptSyncIdempotencyKey = null,
    beforeInstallPrompt = null,
    commitRuntimeState = true,
    forceSaveIndexUpdate = false,
    forceRebuild = false
  } = {}) {
    if (!runtimeHost?.prompt?.install || !state?.campaignChatBinding?.chatId || state.campaign?.status !== 'active') {
      return { ok: false, skipped: true, reason: 'inactive-or-unbound', campaignState: cloneJson(state) };
    }
    const normalizedTime = normalizeCampaignTimeForRuntime(state, {
      reason: 'prompt-sync'
    });
    state = normalizedTime.campaignState || state;
    if (commitRuntimeState !== false && normalizedTime.changed && campaignState?.campaign?.id === state?.campaign?.id) {
      campaignState = state;
    }
    const currentChatId = compactString(await runtimeHost.chat?.getCurrentChatId?.());
    const currentBindingMetadata = await runtimeHost.chat?.getBindingMetadata?.();
    const boundChatId = compactString(state.campaignChatBinding.chatId);
    const pendingProgrammaticOpen = activeProgrammaticChatOpenSuppression();
    const pendingBindingMatches = Boolean(
      pendingProgrammaticOpen
      && compactString(pendingProgrammaticOpen.chatId) === boundChatId
      && (!pendingProgrammaticOpen.saveId
        || compactString(pendingProgrammaticOpen.saveId) === compactString(state.campaignChatBinding.saveId))
      && (!pendingProgrammaticOpen.campaignId
        || compactString(pendingProgrammaticOpen.campaignId) === compactString(state.campaignChatBinding.campaignId))
    );
    const currentChatMatchesBinding = Boolean(
      !currentChatId
      || !boundChatId
      || currentChatId === boundChatId
      || sameCampaignSaveBinding(currentBindingMetadata, state.campaignChatBinding)
      || pendingBindingMatches
    );
    if (!currentChatMatchesBinding) {
      const promptSuspension = await suspendDirectivePromptThroughLens({
        reason: 'unbound-chat',
        binding: state.campaignChatBinding,
        activeChatId: currentChatId,
        boundChatId,
        source: 'runtime-app.synchronizeActivePrompt'
      });
      return {
        ok: true,
        active: false,
        suspended: true,
        promptSuspension: cloneJson(promptSuspension),
        campaignState: cloneJson(state)
      };
    }
    const assets = optionalActiveRuntimeAssets();
    const frame = promptFrame && typeof promptFrame === 'object' ? promptFrame : {};
    const coreRecallEntries = await coreRecallEntriesForPromptSync();
    const promptInput = createLensPromptInput({
      campaignState: state,
      assets,
      promptFrame: {
        ...frame,
        coreRecallEntries
      },
      createdAt: timestampFromNow(now)
    });
    const shouldUseContinuityPlanner = useContinuityPlanner === true
      || (useContinuityPlanner !== false && rebuild === true && !promptFrame);
    const method = rebuild && runtimeHost.prompt.rebuild ? 'rebuild' : 'install';
    const baseActivity = {
      mode: activityMode,
      source: activitySource,
      promptSyncReason: reason,
      method,
      planner: shouldUseContinuityPlanner,
      chatId: state.campaignChatBinding?.chatId || null,
      campaignId: state.campaign?.id || null,
      ...(activityContext && typeof activityContext === 'object' ? cloneJson(activityContext) : {})
    };
    reportContinuityProjectionActivity(activityReporter, {
      ...baseActivity,
      phase: shouldUseContinuityPlanner ? 'continuityProjectionPlanning' : 'continuityProjectionBuilding'
    });
    if (shouldUseContinuityPlanner) {
      reportContinuityProjectionActivity(activityReporter, {
        ...baseActivity,
        phase: 'continuityProjectionBuilding'
      });
    }
    let packet = null;
    let lensResult = null;
    const lens = ensureLensPromptScheduler();
    const lensPromptFrame = promptFrameForLensCache(frame);
    const externalPromptEnvironment = promptExternalEnvironmentForSync(lensPromptFrame);
    const externalPromptEnvironmentRef = externalPromptEnvironment?.externalPromptEnvironmentRef || null;
    const dirtyDomains = promptDirtyDomainsForSync({ promptFrame: lensPromptFrame, activityContext });
    const lane = activityMode === 'background' ? 'background' : 'visible';
    const transactionId = lensTransactionIdForPromptSync(activityContext);
    const lensIdempotencyKey = compactString(promptSyncIdempotencyKey || idempotencyKey || activityContext?.promptSyncIdempotencyKey);
    const campaignContext = lensCampaignContextForPromptSync(state, assets);
    const lensCacheInputs = await lensCacheInputsForPromptSync();
    lens.markDirty({
      lane,
      dirtyDomains,
      source: activitySource || 'promptSync',
      idempotencyKey: lensIdempotencyKey ? `${lensIdempotencyKey}:dirty` : null
    });
    try {
      lensResult = await lens.flush({
        transactionId,
        lane,
        binding: state.campaignChatBinding,
        campaignContext,
        promptFrame: lensPromptFrame,
        cacheInputs: lensCacheInputs,
        externalPromptEnvironment,
        externalPromptEnvironmentRef,
        reason,
        installMethod: method,
        idempotencyKey: lensIdempotencyKey,
        beforeInstallPrompt,
        forceRebuild,
        buildDirectivePromptPacket: async ({
          revision,
          dirtyDomains: lensDirtyDomains,
          cacheKey,
          externalPromptEnvironmentRef: lensExternalPromptEnvironmentRef
        } = {}) => {
          const built = await buildLensPromptPacket({
            promptInput,
            useContinuityPlanner: shouldUseContinuityPlanner,
            generationRouter: defaultGenerationRouter,
            revision,
            dirtyDomains: lensDirtyDomains,
            cacheKey,
            externalPromptEnvironmentRef: lensExternalPromptEnvironmentRef
          });
          const projectionSummary = lensPromptPacketProjectionSummary(built);
          reportContinuityProjectionActivity(activityReporter, {
            ...baseActivity,
            ...projectionSummary,
            phase: 'continuityProjectionValidating'
          });
          reportContinuityProjectionActivity(activityReporter, {
            ...baseActivity,
            ...projectionSummary,
            phase: 'continuityProjectionInstalling'
          });
          return built;
        }
      });
      packet = promptPacketFromLensFlushResult(lensResult);
      const projectionSummary = packet
        ? lensPromptPacketProjectionSummary(packet)
        : {
            revision: lensResult?.directiveOwnedRevision || lensResult?.installed?.directiveOwnedRevision || null,
            blockCount: lensResult?.installed?.blockCount || 0,
            contentHash: lensResult?.packetHash || lensResult?.installed?.packetHash || lensResult?.installed?.promptHash || null
          };
      reportContinuityProjectionActivity(activityReporter, {
        ...baseActivity,
        ...projectionSummary,
        phase: 'continuityProjectionInstalled',
        status: 'complete',
        lensStatus: lensResult?.status || null,
        lensRebuilt: lensResult?.rebuilt === true,
        lensLane: lane
      });
    } catch (error) {
      reportContinuityProjectionActivity(activityReporter, {
        ...baseActivity,
        phase: 'continuityProjectionFailed',
        mode: 'review',
        status: 'failed',
        error: {
          code: error?.code || null,
          message: error?.message || String(error)
        }
      });
      throw error;
    }
    const promptInstallSkipped = lensResult?.status === 'installSkippedStale';
    const next = packet
      ? recordPromptContextRevision(state, packet, {
          installedAt: timestampFromNow(now),
          status: 'active',
          lane,
          cacheKey: lensResult?.cacheKey || lensResult?.installed?.cacheKey || null,
          dirtyDomains: lensResult?.dirtyDomains || [],
          externalPromptEnvironmentRef: lensResult?.externalPromptEnvironmentRef || externalPromptEnvironmentRef || null,
          promptBudgetTraceRef: lensResult?.promptBudgetTraceRef || lensResult?.installed?.promptBudgetTraceRef || null,
          promptBudgetEnforcement: lensResult?.promptBudgetEnforcement || lensResult?.installed?.promptBudgetEnforcement || null,
          installed: lensResult?.installed || null,
          lensPromptRevisionRecord: lensResult?.lensPromptRevisionRecord || lensResult?.installed?.lensPromptRevisionRecord || null
        })
      : cloneJson(state);
    if (commitRuntimeState !== false && !promptInstallSkipped) {
      campaignState = next;
      await runtimeHost.chat?.updateBindingMetadata?.(next.campaignChatBinding);
      if (persist) await persistRuntimeCampaignState(next, reason, { forceSaveIndexUpdate });
    }
    return {
      ok: true,
      active: true,
      packet: cloneJson(packet),
      lens: {
        status: lensResult?.status || null,
        rebuilt: lensResult?.rebuilt === true,
        lane,
        cacheKey: lensResult?.cacheKey || lensResult?.installed?.cacheKey || null,
        installed: cloneJson(lensResult?.installed || null),
        externalPromptEnvironmentRef: cloneJson(lensResult?.externalPromptEnvironmentRef || externalPromptEnvironmentRef || null)
      },
      promptInstallSkipped,
      campaignState: cloneJson(next)
    };
  }

  async function hostContinuePromptReadiness({
    campaignState: readinessState = campaignState,
    ingress = null,
    ingressId = null,
    responseId = null,
    reason = 'directive-inject-and-continue'
  } = {}) {
    const transactionId = compactString(
      ingress?.coreTransactionId
      || ingress?.transactionId
      || ingress?.coreProjection?.transactionId
      || ingress?.coreProjection?.coreTransactionId
      || ''
    );
    const promptSync = await synchronizeActivePrompt(readinessState, {
      persist: true,
      rebuild: true,
      forceRebuild: true,
      useContinuityPlanner: false,
      reason: 'Prompt context rebuilt before host continuation.',
      activitySource: 'hostContinuePromptReadiness',
      activityContext: {
        promptDirtyDomains: ['identity', 'sourceBinding'],
        promptSyncIdempotencyKey: compactString(`host-continue:${responseId || ingressId || transactionId || 'unknown'}`),
        transactionId,
        responseId,
        ingressId,
        releaseReason: reason
      }
    });
    const installed = promptSync?.lens?.installed
      || ensureLensPromptScheduler().inspect()?.installed?.visible
      || null;
    const promptKeys = Array.isArray(installed?.promptKeys) ? installed.promptKeys : [];
    const missingRequired = installed?.requiredPromptKeysPresent === true
      ? []
      : (Array.isArray(installed?.missingRequiredPromptKeys)
        ? installed.missingRequiredPromptKeys
        : missingRequiredPromptKeys(promptKeys));
    const requiredPromptKeysPresent = missingRequired.length === 0;
    return {
      ok: promptSync?.ok === true && promptSync?.active !== false && requiredPromptKeysPresent,
      reason: requiredPromptKeysPresent ? 'prompt-ready' : 'missing-required-prompt-keys',
      requiredPromptKeys: installed?.requiredPromptKeys || REQUIRED_HOST_CONTINUE_PROMPT_KEYS,
      requiredPromptKeysPresent,
      missingRequiredPromptKeys: missingRequired,
      promptKeys,
      directiveOwnedRevision: installed?.directiveOwnedRevision || null,
      promptHash: installed?.promptHash || installed?.packetHash || null,
      installed
    };
  }

  async function installActivationPromptThroughLens({
    campaignState: activationState = campaignState,
    packageData = null,
    crewDataset = null,
    shipDataset = null,
    campaignProjection = null,
    binding = null,
    promptContext = null,
    promptInput = null,
    useContinuityPlanner = true,
    generationRouter = defaultGenerationRouter,
    reason = 'Campaign prompt context installed during activation.',
    activityContext = null
  } = {}) {
    if (!runtimeHost?.prompt?.install || !activationState?.campaignChatBinding?.chatId) {
      return { ok: false, skipped: true, reason: 'inactive-or-unbound' };
    }
    const assets = {
      packageData,
      crewDataset,
      shipDataset,
      projection: campaignProjection
    };
    const resolvedPromptInput = promptInput && typeof promptInput === 'object'
      ? promptInput
      : (promptContext?.blocks ? null : createLensPromptInput({
          campaignState: activationState,
          assets,
          createdAt: timestampFromNow(now)
        }));
    if (!promptContext?.blocks && !resolvedPromptInput) {
      return { ok: false, reason: 'prompt-context-unavailable' };
    }
    const targetState = {
      ...cloneJson(activationState),
      campaignChatBinding: {
        ...(cloneJson(activationState.campaignChatBinding || {})),
        ...(binding ? cloneJson(binding) : {})
      }
    };
    const lens = ensureLensPromptScheduler();
    const lane = 'visible';
    const lensPromptFrame = promptFrameForLensCache({
      source: 'campaignActivation',
      activity: 'campaignActivationPromptInstall',
      activationId: compactString(activityContext?.activationId),
      promptDirtyDomains: DEFAULT_LENS_PROMPT_DIRTY_DOMAINS
    });
    const externalPromptEnvironment = promptExternalEnvironmentForSync(lensPromptFrame);
    const externalPromptEnvironmentRef = externalPromptEnvironment?.externalPromptEnvironmentRef || null;
    const dirtyDomains = promptDirtyDomainsForSync({
      promptFrame: lensPromptFrame,
      activityContext: {
        ...(activityContext && typeof activityContext === 'object' ? cloneJson(activityContext) : {}),
        promptDirtyDomains: DEFAULT_LENS_PROMPT_DIRTY_DOMAINS
      }
    });
    const campaignContext = lensCampaignContextForPromptSync(targetState, assets);
    lens.markDirty({
      lane,
      dirtyDomains,
      source: 'campaignActivation'
    });
    const lensResult = await lens.flush({
      transactionId: null,
      lane,
      binding: targetState.campaignChatBinding,
      campaignContext,
      promptFrame: lensPromptFrame,
      externalPromptEnvironment,
      externalPromptEnvironmentRef,
      reason,
      installMethod: 'install',
      forceRebuild: true,
      buildDirectivePromptPacket: async ({
        revision,
        dirtyDomains: lensDirtyDomains = [],
        cacheKey,
        externalPromptEnvironmentRef: lensExternalPromptEnvironmentRef = null
      } = {}) => {
        if (resolvedPromptInput) {
          return buildLensPromptPacket({
            promptInput: resolvedPromptInput,
            useContinuityPlanner,
            generationRouter,
            revision,
            dirtyDomains: lensDirtyDomains,
            cacheKey,
            externalPromptEnvironmentRef: lensExternalPromptEnvironmentRef
          });
        }
        return {
          ...cloneJson(promptContext),
          revision,
          cacheKey,
          externalPromptEnvironmentRef: cloneJson(lensExternalPromptEnvironmentRef || null),
          lensDirtyDomains: cloneJson(Array.isArray(lensDirtyDomains) ? lensDirtyDomains : [])
        };
      }
    });
    const packet = lensResult?.packet || null;
    return {
      ok: lensResult?.status !== 'failed',
      status: lensResult?.status || null,
      packet: cloneJson(packet || promptContext),
      lens: {
        status: lensResult?.status || null,
        rebuilt: lensResult?.rebuilt === true,
        lane,
        cacheKey: lensResult?.cacheKey || lensResult?.installed?.cacheKey || null,
        externalPromptEnvironmentRef: cloneJson(lensResult?.externalPromptEnvironmentRef || externalPromptEnvironmentRef || null)
      }
    };
  }

  function beginProgrammaticChatOpenSuppression(binding = null, reason = '') {
    const targetBinding = normalizedBinding(binding);
    if (!targetBinding?.chatId) return null;
    const startedAtMs = Date.now();
    const token = {
      chatId: targetBinding.chatId,
      saveId: targetBinding.saveId || null,
      campaignId: targetBinding.campaignId || null,
      reason: compactString(reason) || 'programmatic-campaign-chat-open',
      startedAtMs,
      suppressUntilMs: startedAtMs + 5000
    };
    programmaticChatOpenSuppression = token;
    return token;
  }

  function finishProgrammaticChatOpenSuppression(token = null, { opened = null } = {}) {
    if (!token || programmaticChatOpenSuppression !== token) return;
    const completedAtMs = Date.now();
    programmaticChatOpenSuppression = {
      ...token,
      opened: opened === true,
      completedAtMs,
      suppressUntilMs: completedAtMs + 1500
    };
  }

  function activeProgrammaticChatOpenSuppression() {
    if (!programmaticChatOpenSuppression) return null;
    if (Date.now() > Number(programmaticChatOpenSuppression.suppressUntilMs || 0)) {
      programmaticChatOpenSuppression = null;
      return null;
    }
    return programmaticChatOpenSuppression;
  }

  async function programmaticChatChangeSuppressionResult(payload = {}) {
    const suppression = activeProgrammaticChatOpenSuppression();
    if (!suppression) return null;
    const currentChatId = compactString(
      typeof runtimeHost?.chat?.getCurrentChatId === 'function'
        ? await runtimeHost.chat.getCurrentChatId()
        : null
    );
    return {
      active: false,
      suspended: true,
      suppressed: true,
      reason: 'programmatic-campaign-chat-open',
      eventReason: compactString(payload?.reason) || null,
      expectedChatId: suppression.chatId || null,
      expectedSaveId: suppression.saveId || null,
      currentChatId: currentChatId || null
    };
  }

  async function openAndRetargetCampaignChat(state = campaignState, {
    binding = null,
    persistPrompt = true,
    rebuildPrompt = true,
    reason = 'Campaign prompt context rebuilt after opening the save.'
  } = {}) {
    const targetBinding = normalizedBinding(binding) || bindingFromState(state);
    if (!targetBinding?.chatId) {
      return {
        opened: false,
        metadataUpdated: false,
        prompt: null,
        reason: 'campaign-chat-unbound'
      };
    }

    const suppressionToken = beginProgrammaticChatOpenSuppression(targetBinding, reason);
    let opened = false;
    try {
      opened = await runtimeHost?.chat?.open?.(targetBinding);
    } finally {
      finishProgrammaticChatOpenSuppression(suppressionToken, { opened: opened !== false });
    }
    if (opened === false) {
      return {
        opened: false,
        metadataUpdated: false,
        prompt: null,
        reason: 'host-open-failed',
        binding: cloneJson(targetBinding)
      };
    }

    const metadataUpdated = await runtimeHost?.chat?.updateBindingMetadata?.(targetBinding);
    if (state && targetBinding.saveId) {
      campaignState = stateWithLoadedSaveBinding(state, targetBinding.saveId);
    }

    let prompt = null;
    if (campaignState?.campaign?.status === 'active') {
      prompt = await synchronizeActivePrompt({
        ...campaignState,
        campaignChatBinding: {
          ...(campaignState.campaignChatBinding || {}),
          ...targetBinding
        }
      }, {
        persist: persistPrompt,
        rebuild: rebuildPrompt,
        reason
      });
      campaignState = prompt?.campaignState
        ? stateWithLoadedSaveBinding(applyRuntimeSettings(prompt.campaignState), targetBinding.saveId)
        : stateWithLoadedSaveBinding(applyRuntimeSettings(campaignState), targetBinding.saveId);
    }

    return {
      opened: true,
      metadataUpdated: metadataUpdated !== false,
      prompt: cloneJson(prompt || null),
      binding: cloneJson(targetBinding)
    };
  }

  function ensureChatNativeServices() {
    if (chatNativeServices) return chatNativeServices;
    if (
      runtimeHost?.capabilities?.chat?.create !== true
      || runtimeHost?.capabilities?.chat?.postAssistantMessage !== true
      || runtimeHost?.capabilities?.prompt?.install !== true
      || !runtimeHost?.chat?.postAssistantMessage
      || !runtimeHost?.chat?.createOrBindCampaignChat
      || !runtimeHost?.prompt?.install
    ) {
      return null;
    }

    const getCampaignState = () => campaignState;
    const setCampaignState = (state) => {
      campaignState = cloneJson(state);
      syncCurrentChatScopeCampaignState(campaignState);
    };
    const persistCampaignState = (state, summary) => persistRuntimeCampaignState(
      state,
      typeof summary === 'string'
        ? summary
        : (summary?.summary || summary?.reason || 'Directive campaign state updated.')
    );
    const stateDeltaGateway = createStateDeltaGateway({
      getState: getCampaignState,
      setState: setCampaignState,
      persist: persistCampaignState,
      now
    });
    const injectedRepairRuntime = typeof repairRuntimeFactory === 'function'
      ? repairRuntimeFactory({
          coreTurnStore: runtimeCoreTurnStore,
          now
        })
      : repairRuntime;
    const repairRuntimeBoundary = createRepairCommandBoundary({
      ...(injectedRepairRuntime ? { repairRuntime: injectedRepairRuntime } : {}),
      coreTurnStore: runtimeCoreTurnStore,
      now
    });
    const responseDispatcher = createResponseDispatcher({
      host: runtimeHost,
      coreTurnStore: runtimeCoreTurnStore,
      repairRuntime: repairRuntimeBoundary,
      getCampaignState,
      setCampaignState,
      persist: persistCampaignState,
      promptReadiness: hostContinuePromptReadiness,
      now
    });
    const messageReconciler = createMessageReconciler({
      getCampaignState,
      setCampaignState,
      coreTurnStore: runtimeCoreTurnStore,
      repairRuntime: repairRuntimeBoundary,
      persist: persistCampaignState,
      syncPrompt: async (state) => (await synchronizeActivePrompt(state, {
        persist: false,
        useContinuityPlanner: false,
        reason: 'Prompt context rebuilt after message recovery.'
      })).campaignState,
      loadCoreCheckpointState: async ({ coreCheckpointRef, state } = {}) => {
        const loaded = await loadOutcomeRerunCheckpointSnapshot({
          storageAdapter,
          state: state || getCampaignState(),
          controller,
          ledgerEntry: { coreCheckpointRef }
        });
        return loaded?.snapshot || null;
      },
      now
    });
    const sourceSettlementService = createSourceSettlementService({
      coreStore: runtimeCoreTurnStore,
      clock: () => timestampFromNow(now)
    });
    const sceneReconciliation = createSceneReconciliationService({
      getCampaignState,
      stateDeltaGateway,
      host: runtimeHost,
      sourceSettlementService,
      now,
      idFactory
    });
    runtimeForgeCoordinator = createForgeCoordinator({
      coreStore: {
        commitBackgroundBatch: (transactionId, bundle) => runtimeCoreTurnStore.settleBackgroundBatch(transactionId, bundle),
        appendDiagnostics: (transactionId, event) => runtimeCoreTurnStore.appendDiagnostic(transactionId, event)
      },
      lens: ensureLensPromptScheduler(),
      acceptedBatchPromptFlusher: async (input = {}) => {
        const promptDirtyDomains = normalizePromptDirtyDomains(input.promptDirtyDomains || input.promptFrame?.promptDirtyDomains || []);
        const promptSyncIdempotencyKey = compactString(input.promptSyncIdempotencyKey || input.idempotencyKey);
        const workerKey = input.workerKey || input.promptFrame?.workerKey || 'campaignSidecarBatch';
        const workerKeys = Array.isArray(input.workerKeys)
          ? cloneJson(input.workerKeys)
          : (Array.isArray(input.promptFrame?.workerKeys) ? cloneJson(input.promptFrame.workerKeys) : []);
        const promptFrame = {
          ...(input.promptFrame && typeof input.promptFrame === 'object' ? cloneJson(input.promptFrame) : {}),
          workerKey,
          workerKeys,
          promptDirtyDomains,
          aggregateBatch: input.aggregateBatch === true || input.promptFrame?.aggregateBatch === true,
          sourceFrameRef: cloneJson(input.sourceFrameRef || input.promptFrame?.sourceFrameRef || null),
          sourceToken: input.sourceToken || input.promptFrame?.sourceToken || null,
          coreAcceptedBatchProjection: cloneJson(
            input.coreAcceptedBatchProjection
            || input.promptFrame?.coreAcceptedBatchProjection
            || null
          ),
          cacheInputs: cloneJson(input.cacheInputs || input.promptFrame?.cacheInputs || {})
        };
        const activityContext = input.activityContext && typeof input.activityContext === 'object'
          ? cloneJson(input.activityContext)
          : {
              workerKey,
              workerKeys,
              aggregateBatch: promptFrame.aggregateBatch === true,
              promptDirtyDomains,
              transactionId: input.transactionId || null,
              coreTransactionId: input.transactionId || null,
              source: 'campaignSidecarScheduler'
            };
        const result = await synchronizeActivePrompt(input.campaignState || campaignState, {
          persist: false,
          commitRuntimeState: input.commitRuntimeState !== false,
          promptFrame,
          useContinuityPlanner: false,
          reason: 'Prompt context synchronized after accepted sidecar state delta.',
          activityReporter: input.activityReporter || null,
          activitySource: input.activitySource || 'sidecarPromptSync',
          activityMode: input.activityMode || 'background',
          promptSyncIdempotencyKey,
          beforeInstallPrompt: input.beforeInstallPrompt,
          activityContext
        });
        return {
          ...cloneJson(result || {}),
          campaignState: cloneJson(result?.campaignState || input.campaignState || campaignState)
        };
      },
      commandBearingReviewPromptFlusher: async (input = {}) => {
        const promptDirtyDomains = ['commandBearing'];
        const promptSyncIdempotencyKey = compactString(input.promptSyncIdempotencyKey || input.idempotencyKey);
        const coreCommandBearingReviewProjection = cloneJson(
          input.coreCommandBearingReviewProjection
          || input.promptFrame?.coreCommandBearingReviewProjection
          || input.cacheInputs?.coreCommandBearingReviewProjection
          || null
        );
        const cacheInputs = cloneJson(input.cacheInputs || input.promptFrame?.cacheInputs || {});
        if (coreCommandBearingReviewProjection) {
          cacheInputs.coreCommandBearingReviewProjection = cloneJson(coreCommandBearingReviewProjection);
        }
        const promptFrame = {
          ...(input.promptFrame && typeof input.promptFrame === 'object' ? cloneJson(input.promptFrame) : {}),
          workerKey: 'commandBearing',
          promptDirtyDomains,
          commandBearingReview: true,
          sourceFrameRef: cloneJson(input.sourceFrameRef || input.promptFrame?.sourceFrameRef || null),
          sourceToken: input.sourceToken || input.promptFrame?.sourceToken || null,
          coreCommandBearingReviewProjection,
          cacheInputs
        };
        const activityContext = input.activityContext && typeof input.activityContext === 'object'
          ? cloneJson(input.activityContext)
          : {
              workerKey: 'commandBearing',
              commandBearingReview: true,
              promptDirtyDomains,
              transactionId: input.transactionId || null,
              coreTransactionId: input.transactionId || null,
              source: 'campaignSidecarScheduler'
            };
        const result = await synchronizeActivePrompt(input.campaignState || campaignState, {
          persist: false,
          commitRuntimeState: input.commitRuntimeState !== false,
          promptFrame,
          useContinuityPlanner: false,
          reason: 'Prompt context synchronized after Command Bearing closure review.',
          activityReporter: input.activityReporter || null,
          activitySource: input.activitySource || 'sidecarPromptSync',
          activityMode: input.activityMode || 'background',
          promptSyncIdempotencyKey,
          beforeInstallPrompt: input.beforeInstallPrompt,
          activityContext
        });
        return {
          ...cloneJson(result || {}),
          campaignState: cloneJson(result?.campaignState || input.campaignState || campaignState)
        };
      },
      isSourceCurrent: forgeSourceCurrentForRuntime,
      clock: () => timestampFromNow(now)
    });
    const forgeCoordinator = runtimeForgeCoordinator;
    const sidecarScheduler = createCampaignSidecarScheduler({
      generationRouter: defaultGenerationRouter,
      stateDeltaGateway,
      getCampaignState,
      setCampaignState,
      persistCampaignState,
      getPackageData: () => activeRuntimeAssets().packageData,
      syncPromptContext: async (state, promptFrame = null, options = {}) => {
        const result = await synchronizeActivePrompt(state, {
          persist: false,
          promptFrame,
          useContinuityPlanner: false,
          reason: 'Prompt context synchronized after accepted sidecar state delta.',
          activityReporter: options.activityReporter || null,
          activitySource: options.activitySource || 'sidecarPromptSync',
          activityMode: options.activityMode || 'background',
          promptSyncIdempotencyKey: options.promptSyncIdempotencyKey || options.activityContext?.promptSyncIdempotencyKey || null,
          activityContext: options.activityContext || {
            workerKey: promptFrame?.workerKey || null,
            commandBearingReview: promptFrame?.commandBearingReview === true
          }
        });
        return result.campaignState || state;
      },
      appendCoreDiagnostic: appendSidecarCoreDiagnostic,
      appendCoreDiagnosticsBatch: appendSidecarCoreDiagnosticsBatch,
      forgeCoordinator,
      commitCoreBackgroundBatch: (transactionId, bundle) => runtimeCoreTurnStore.settleBackgroundBatch(transactionId, bundle),
      now
    });
    const narrativeThreadDirector = createNarrativeThreadDirector({
      getCampaignState,
      getPackageData: () => activeRuntimeAssets().packageData,
      stateDeltaGateway,
      generationRouter: defaultGenerationRouter,
      now
    });
    const classify = ({ text, context = {} } = {}) => classifyChatTurn({
      text,
      context: {
        ...cloneJson(context),
        campaignRevision: campaignState?.runtimeTracking?.revision || 0,
        simulationMode: campaignState?.settings?.simulationMode || 'Command'
      },
      generationRouter: defaultGenerationRouter
    });
    const arbitrate = ({ message, context = {} } = {}) => arbitrateChatTurn({
      message,
      context: {
        ...cloneJson(context),
        campaignRevision: campaignState?.runtimeTracking?.revision || 0,
        simulationMode: campaignState?.settings?.simulationMode || 'Command'
      },
      generationRouter: defaultGenerationRouter
    });
    const activationCoordinator = createCampaignActivationCoordinator({
      host: runtimeHost,
      generationRouter: defaultGenerationRouter,
      persist: persistCampaignState,
      installPromptContext: installActivationPromptThroughLens,
      suspendPromptContext: ({
        campaignState: activationState = null,
        binding = null,
        reason = 'activation-failed',
        source = 'campaignActivation'
      } = {}) => suspendDirectivePromptThroughLens({
        reason,
        binding: binding || activationState?.campaignChatBinding || null,
        activeChatId: runtimeHost.chat?.getCurrentChatId?.() || runtimeHost.chat?.getCurrentBinding?.()?.chatId || null,
        boundChatId: binding?.chatId || activationState?.campaignChatBinding?.chatId || null,
        source
      }),
      now
    });
    const conclusionService = createCampaignConclusionService({
      host: runtimeHost,
      generationRouter: defaultGenerationRouter,
      getCampaignState,
      setCampaignState,
      clearDirectivePrompt: ({ reason = 'campaign-complete' } = {}) => clearDirectivePromptThroughLens({ reason }),
      persist: persistCampaignState,
      now
    });
    async function loadTerminalCheckpointFromCore(input = {}) {
      const state = getCampaignState() || {};
      const binding = state.campaignChatBinding || {};
      const campaignId = compactString(input.campaignId || binding.campaignId || state.campaign?.id);
      const saveId = compactString(input.saveId || binding.saveId || controller?.activeSaveId);
      const checkpointId = compactString(input.checkpointId || input.id);
      if (!storageAdapter || !campaignId || !saveId || !checkpointId) return null;
      try {
        const record = await loadV2Checkpoint(storageAdapter, {
          campaignId,
          saveId,
          checkpointId,
          layout: compactString(input.layout) || 'core'
        });
        return record
          ? {
              ...record,
              sourceKind: 'coreStoreV2.checkpoint',
              sourceRevision: record.checkpoint?.revision ?? record.checkpoint?.runtimeRevision ?? record.revision ?? null
            }
          : null;
      } catch {
        return null;
      }
    }
    async function writeTerminalCheckpointToCore(input = {}) {
      const state = getCampaignState() || {};
      const binding = state.campaignChatBinding || {};
      const campaignId = compactString(input.campaignId || binding.campaignId || state.campaign?.id);
      const saveId = compactString(input.saveId || binding.saveId || controller?.activeSaveId);
      const checkpointId = compactString(input.checkpointId || input.id);
      if (!storageAdapter || !campaignId || !saveId || !checkpointId || !isObject(input.checkpoint)) return null;
      try {
        const result = await writeV2Checkpoint(storageAdapter, {
          campaignId,
          saveId,
          checkpointId,
          checkpoint: input.checkpoint,
          createdAt: timestampFromNow(now),
          layout: compactString(input.layout) || 'core'
        });
        return {
          ...cloneJson(result),
          sourceKind: 'coreStoreV2.checkpoint',
          sourceRevision: input.checkpoint?.sourceRevision ?? input.checkpoint?.runtimeRevision ?? null
        };
      } catch {
        return null;
      }
    }
    const endConditionService = createCampaignEndConditionService({
      host: runtimeHost,
      coreTurnStore: runtimeCoreTurnStore,
      getCampaignState,
      setCampaignState,
      getPackageContext: () => activeRuntimeAssets().packageData,
      persist: persistCampaignState,
      syncPrompt: async (state, reason) => synchronizeActivePrompt(state, {
        persist: false,
        useContinuityPlanner: false,
        reason: reason || 'Prompt context synchronized after terminal outcome decision.'
      }),
      recordTerminalCheckpointSettlement: (event) => queueTerminalCheckpointSettlement(event),
      concludeCampaign: (options) => conclusionService.conclude(options),
      repairRuntime: repairRuntimeBoundary,
      loadTerminalCheckpoint: loadTerminalCheckpointFromCore,
      writeTerminalCheckpoint: writeTerminalCheckpointToCore,
      now
    });
    async function rewriteCampaignIntroFromNativeSwipe({
      campaignState: sourceCampaignState = null,
      hostMessageId = null,
      reason = 'native-swipe-reroll'
    } = {}) {
      const assets = activeRuntimeAssets();
      const cancelable = trackHostCancelableGeneration('campaignIntroRewrite', {
        hostMessageId,
        reason
      });
      const result = await activationCoordinator.rewriteIntro({
        campaignState: sourceCampaignState || campaignState,
        packageData: assets.packageData,
        shipDataset: assets.shipDataset,
        saveId: controller.activeSaveId,
        hostMessageId,
        reason,
        signal: cancelable.signal
      }).finally(() => cancelable.done());
      if (result?.campaignState) {
        campaignState = applyRuntimeSettings(result.campaignState);
        lastActivationResult = cloneJson(result);
      }
      await refreshCampaignView();
      await refreshCurrentChatCampaignScope();
      return result;
    }
    const turnCommitCoordinator = ensureTurnCommitCoordinator();
    const orchestrator = createChatTurnOrchestrator({
      host: runtimeHost,
      classify,
      arbitrate,
      generationRouter: defaultGenerationRouter,
      responseDispatcher,
      turnCommitCoordinator,
      sidecarScheduler,
      forgeCoordinator,
      messageReconciler,
      enableDefaultLatestPairSettlementProvider: true,
      repairRuntime: repairRuntimeBoundary,
      coreTurnStore: runtimeCoreTurnStore,
      stateDeltaGateway,
      getCampaignState,
      setCampaignState,
      persistCampaignState,
      getPackageData: () => activeRuntimeAssets().packageData,
      getCrewDataset: () => activeRuntimeAssets().crewDataset,
      getShipDataset: () => activeRuntimeAssets().shipDataset,
      syncPromptContext: async (state, promptFrame = null, options = {}) => {
        const result = await synchronizeActivePrompt(state, {
          persist: false,
          promptFrame,
          useContinuityPlanner: false,
          forceRebuild: options.forceRebuild === true,
          reason: 'Chat-native prompt context synchronized.',
          activityReporter: options.activityReporter || null,
          activitySource: options.activitySource || 'chatTurnPromptSync',
          activityMode: options.activityMode || 'blocking',
          activityContext: options.activityContext || null
        });
        return result.campaignState || state;
      },
      previewDirectorTurn: (options) => publicApi.previewDirectorTurn(options),
      commitProvisionalDirectorTurn: (options) => publicApi.commitProvisionalDirectorTurn(options),
      scheduleCommandLogSummaryForCommittedTurn: ({ turnPacket, reason, ingressId, turnId, outcomeId } = {}) => scheduleCommandLogSummaryForTurnNow({
        turnPacket,
        enabled: true,
        reason: reason || 'postVisibleResponse',
        ingressId,
        turnId,
        outcomeId
      }),
      schedulePostCommitConversationProcessor: (conversation) => schedulePostCommitConversationForCommittedTurn({
        conversation,
        reason: 'postVisibleResponse',
        processor: (queuedConversation, options = {}) => narrativeThreadDirector.processConversation(queuedConversation, options)
      }),
      scheduleAdvisoryEnrichmentProcessor: (payload) => scheduleAdvisoryEnrichmentForHostContinue(payload),
      recordTerminalCheckpointSettlement: (event) => queueTerminalCheckpointSettlement(event),
      postTerminalOutcomeCheckpoint: (options) => publicApi.postTerminalOutcomeCheckpoint(options),
      resolveTerminalOutcomeDecision: (options) => publicApi.resolveTerminalOutcomeDecision(options),
      discardProvisionalDirectorTurn: () => publicApi.discardProvisionalDirectorTurn(),
      rewriteCampaignIntro: rewriteCampaignIntroFromNativeSwipe,
      clearDirectivePrompt: ({ reason = 'no-active-campaign' } = {}) => clearDirectivePromptThroughLens({ reason }),
      suspendDirectivePrompt: ({ reason = 'unbound-chat' } = {}) => suspendDirectivePromptThroughLens({
        reason,
        binding: campaignState?.campaignChatBinding || null,
        activeChatId: runtimeHost.chat?.getCurrentChatId?.() || runtimeHost.chat?.getCurrentBinding?.()?.chatId || null,
        boundChatId: campaignState?.campaignChatBinding?.chatId || null,
        source: 'chat-turn-orchestrator.handleChatChanged'
      }),
      now
    });
    chatNativeServices = {
      activationCoordinator,
      conclusionService,
      endConditionService,
      turnCommitCoordinator,
      stateDeltaGateway,
      responseDispatcher,
      messageReconciler,
      repairRuntime: repairRuntimeBoundary,
      sceneReconciliation,
      coreTurnStore: runtimeCoreTurnStore,
      sidecarScheduler,
      narrativeThreadDirector,
      classify,
      orchestrator
    };
    return chatNativeServices;
  }

  function outcomeIntegrityCampaignState() {
    return liveCampaignStateForView() || campaignState;
  }

  function hostMessageIdFromPayload(payload = {}) {
    return compactString(
      payload?.hostMessageId
      || payload?.message?.hostMessageId
      || payload?.message?.id
      || payload?.messageId
      || payload?.id
      || payload?.index
    );
  }

  function hostMessageForOutcomeIntegrity(payload = {}) {
    const hostMessageId = hostMessageIdFromPayload(payload);
    const fromHost = hostMessageId && typeof runtimeHost?.chat?.getMessage === 'function'
      ? runtimeHost.chat.getMessage(hostMessageId)
      : null;
    if (fromHost) return fromHost;
    if (payload?.message && typeof payload.message === 'object') {
      return {
        ...cloneJson(payload.message),
        hostMessageId: hostMessageId || payload.message.hostMessageId || payload.message.id || null
      };
    }
    return null;
  }

  async function outcomeIntegrityNativeEditDecision(payload = {}) {
    try {
      const state = outcomeIntegrityCampaignState();
      const message = hostMessageForOutcomeIntegrity(payload);
      return await outcomeIntegrityStatusForMessageAsync({
        campaignState: state,
        message,
        hostMessageId: hostMessageIdFromPayload(payload),
        coreTurnStore: runtimeCoreTurnStore
      });
    } catch (error) {
      return {
        protected: false,
        nativeEdit: 'allow',
        reason: 'decision-error',
        error: { message: error?.message || String(error) }
      };
    }
  }

  async function prepareOutcomeIntegrityEdit(payload = {}) {
    await ensureInitialized();
    await refreshCurrentChatCampaignScope();
    const state = outcomeIntegrityCampaignState();
    const message = hostMessageForOutcomeIntegrity(payload);
    return buildOutcomeIntegrityEditContextAsync({
      campaignState: state,
      message,
      hostMessageId: hostMessageIdFromPayload(payload),
      coreTurnStore: runtimeCoreTurnStore
    });
  }

  function appendOutcomeIntegrityReview(response = {}, reviewPatch = {}) {
    const current = isObject(response.outcomeIntegrity) ? response.outcomeIntegrity : {};
    return {
      ...current,
      reviewCount: Math.max(0, Number(current.reviewCount) || 0) + 1,
      lastReview: cloneJson(reviewPatch)
    };
  }

  function responseCompatibilityProjectionPatch(response = {}, {
    kind,
    action = null,
    revision = null,
    correctionCase = null,
    reviewPatch = null
  } = {}) {
    const responseId = compactString(response.id || response.responseId || '');
    const transactionId = compactString(
      response.coreTransactionId
      || response.transactionId
      || response.coreProjection?.transactionId
      || response.coreProjection?.coreTransactionId
      || response.compatibilityMirror?.transactionId
      || response.coreRecovery?.transactionId
      || response.coreRelease?.transactionId
      || response.coreCompletion?.transactionId
      || ''
    );
    if (!transactionId) {
      const error = new Error('Response lifecycle CORE projection requires transaction evidence.');
      error.code = 'DIRECTIVE_CORE_RESPONSE_PROJECTION_TRANSACTION_REQUIRED';
      error.details = {
        kind: kind || null,
        responseId: responseId || null,
        hostMessageId: compactString(response.hostMessageId || '') || null
      };
      throw error;
    }
    return {
      authority: 'compatibilityProjection',
      projectionSource: 'coreStoreV2',
      coreProjection: {
        kind,
        responseId: responseId || null,
        hostMessageId: compactString(response.hostMessageId || '') || null,
        outcomeId: compactString(response.outcomeId || '') || null,
        turnId: compactString(response.turnId || '') || null,
        transactionId,
        action: action || null,
        revisionId: revision?.id || null,
        revisionTextHash: revision?.textHash || null,
        correctionCaseId: correctionCase?.id || null,
        correctionStatus: correctionCase?.status || null,
        candidateTextHash: correctionCase?.candidate?.textHash || correctionCase?.candidateSwipe?.textHash || null,
        selectedSwipeIndex: Number.isInteger(correctionCase?.candidateSwipe?.swipeIndex)
          ? correctionCase.candidateSwipe.swipeIndex
          : null,
        reviewVerdict: reviewPatch?.verdict || revision?.reviewVerdict || null,
        projectedAt: timestampFromNow(now)
      }
    };
  }

  function responseMatchesUpdateId(response = {}, responseUpdateId = '') {
    const target = compactString(responseUpdateId);
    if (!target) return false;
    return [
      response.id,
      response.responseId,
      response.hostMessageId
    ].some((value) => compactString(value) === target);
  }

  function responseCarriesCoreProjectionEvidence(response = {}) {
    return Boolean(response && (
      response.authority
      || response.compatibilityMirror
      || response.projectionSource
      || response.coreProjection
      || response.coreTransactionId
      || response.transactionId
    ));
  }

  function prevalidatedCoreResponseForUpdate(response = null, responseUpdateId = '') {
    if (!responseMatchesUpdateId(response, responseUpdateId)) return null;
    if (!responseCarriesCoreProjectionEvidence(response)) return null;
    return response;
  }

  function adoptResponseLedgerProjection(projectedState = null) {
    if (!projectedState) return;
    campaignState = mergeFresherResponseLedgerProjection(campaignState, projectedState);
    if (currentChatScope?.campaignState) {
      currentChatScope = {
        ...currentChatScope,
        campaignState: mergeFresherResponseLedgerProjection(currentChatScope.campaignState, projectedState)
      };
    }
  }

  function priorSwipeTextForRelaxedEdit(message = null) {
    const current = compactString(message?.text || message?.raw?.mes);
    const swipes = Array.isArray(message?.raw?.swipes)
      ? message.raw.swipes
      : (Array.isArray(message?.swipes) ? message.swipes : []);
    return swipes
      .map((entry) => String(entry || '').trim())
      .find((entry) => entry && entry !== current) || '';
  }

  async function submitOutcomeIntegrityEdit(payload = {}) {
    await ensureInitialized();
    await refreshCurrentChatCampaignScope();
    if (typeof runtimeHost?.chat?.appendAssistantMessageSwipe !== 'function') {
      return {
        ok: false,
        accepted: false,
        reason: 'assistant-swipes-unavailable',
        summary: 'This host cannot preserve accepted prose edits as assistant swipes.'
      };
    }
    const state = outcomeIntegrityCampaignState();
    const message = hostMessageForOutcomeIntegrity(payload);
    const context = payload.context?.ok
      ? cloneJson(payload.context)
      : await buildOutcomeIntegrityEditContextAsync({
          campaignState: state,
          message,
          hostMessageId: hostMessageIdFromPayload(payload),
          coreTurnStore: runtimeCoreTurnStore
        });
    const validation = validateOutcomeIntegrityProposedEdit({
      context,
      proposedText: payload.proposedText ?? payload.text,
      currentText: payload.currentText ?? message?.text ?? context.currentText,
      baseTextHash: payload.baseTextHash || context.baseTextHash
    });
    if (!validation.ok) {
      return {
        ok: false,
        accepted: false,
        reason: validation.reason,
        summary: validation.message,
        context: cloneJson(context)
      };
    }
    const providerKind = normalizeOutcomeIntegrityReviewProviderKind(
      payload.reviewProviderKind || context.reviewProviderKind
    );
    const review = await reviewOutcomeIntegrityEdit({
      generationRouter: defaultGenerationRouter,
      context: {
        ...context,
        reviewProviderKind: providerKind
      },
      proposedText: validation.proposedText,
      providerKind
    });
    const reviewPatch = {
      verdict: review.verdict || 'reject',
      accepted: review.accepted === true,
      categories: cloneJson(review.categories || []),
      reason: review.reason || null,
      providerKind,
      reviewedAt: timestampFromNow(now)
    };
    if (review.accepted !== true) {
      const latest = outcomeIntegrityCampaignState() || state;
      const response = context.response || {};
      const responseUpdateId = response.id || response.responseId || context.responseId || context.sourceResponseId || response.hostMessageId || context.hostMessageId;
      const next = responseUpdateId
        ? updateDirectiveResponse(latest, responseUpdateId, {
            ...responseCompatibilityProjectionPatch(response, {
              kind: 'directive.coreResponseOutcomeIntegrityProjectionRef.v1',
              action: 'reviewRejected',
              reviewPatch
            }),
            outcomeIntegrity: appendOutcomeIntegrityReview(response, reviewPatch)
          }, {
            missingCoreWriteMode: 'reject'
          })
        : latest;
      campaignState = next;
      await persistRuntimeCampaignState(next, 'Outcome Integrity prose edit rejected.');
      adoptResponseLedgerProjection(next);
      await refreshCampaignView();
      return {
        ok: false,
        accepted: false,
        reason: 'integrity-review-rejected',
        summary: outcomeIntegrityFailureSummary(review),
        detail: review.reason || null,
        review: cloneJson(review),
        context: cloneJson(context),
        view: viewEnvelope('settings')
      };
    }
    const revision = createOutcomeIntegrityRevisionRecord({
      context: {
        ...context,
        reviewProviderKind: providerKind
      },
      proposedText: validation.proposedText,
      review,
      now
    });
    const swipe = await runtimeHost.chat.appendAssistantMessageSwipe({
      hostMessageId: context.hostMessageId,
      text: prefixCampaignReplyHeader(validation.proposedText, state),
      campaignId: state?.campaign?.id || null,
      responseKind: context.responseKind || 'narration',
      extra: {
        runtimeMetadata: {
          outcomeIntegrity: {
            playerEdit: true,
            revisionId: revision.id,
            sourceResponseId: revision.sourceResponseId,
            reviewProviderKind: providerKind
          }
        },
        directive: {
          outcomeIntegrityRevisionId: revision.id,
          selectedOutcomeIntegrityRevisionId: revision.id,
          selectedResponseRevisionId: revision.id,
          playerEdit: true,
          sourceResponseId: revision.sourceResponseId
        }
      }
    });
    const latest = outcomeIntegrityCampaignState() || state;
    const response = context.response || {};
    const currentIntegrity = isObject(response.outcomeIntegrity) ? response.outcomeIntegrity : {};
    const revisions = Array.isArray(currentIntegrity.revisions) ? currentIntegrity.revisions : [];
    const responseUpdateId = response.id || response.responseId || context.responseId || context.sourceResponseId || response.hostMessageId || context.hostMessageId;
    const nextOutcomeIntegrity = {
      ...currentIntegrity,
      reviewCount: Math.max(0, Number(currentIntegrity.reviewCount) || 0) + 1,
      revisions: [...revisions, revision],
      selectedRevisionId: revision.id,
      lastReview: reviewPatch
    };
    const projectionPatch = responseCompatibilityProjectionPatch(response, {
      kind: 'directive.coreResponseOutcomeIntegrityProjectionRef.v1',
      action: 'editAccepted',
      revision,
      reviewPatch
    });
    const next = responseUpdateId
      ? updateDirectiveResponse(latest, responseUpdateId, {
          ...projectionPatch,
          editedAt: revision.editedAt,
          replacementText: null,
          outcomeIntegrity: nextOutcomeIntegrity
        }, {
          missingCoreWriteMode: 'reject'
        })
      : latest;
    if (projectionPatch.coreProjection?.transactionId && typeof runtimeCoreTurnStore?.repairVisibleResponseRef === 'function') {
      await runtimeCoreTurnStore.repairVisibleResponseRef(projectionPatch.coreProjection.transactionId, {
        hostMessageId: response.hostMessageId || context.hostMessageId || null,
        textHash: response.textHash || null,
        outcomeIntegrity: nextOutcomeIntegrity,
        reason: 'outcome-integrity-edit-accepted',
        idempotencyKey: `outcome-integrity-edit:${revision.id}`
      });
    }
    campaignState = next;
    await persistRuntimeCampaignState(next, 'Outcome Integrity prose edit accepted.');
    adoptResponseLedgerProjection(next);
    await refreshCampaignView();
    return {
      ok: true,
      accepted: true,
      summary: 'Prose edit accepted.',
      revision: cloneJson(revision),
      swipe: cloneJson(swipe),
      review: cloneJson(review),
      context: cloneJson(context),
      view: viewEnvelope('settings')
    };
  }

  async function proposeCorrectAsSwipeCandidate(payload = {}) {
    await ensureInitialized();
    await refreshCurrentChatCampaignScope();
    const state = outcomeIntegrityCampaignState();
    const message = hostMessageForOutcomeIntegrity(payload);
    const hostMessageId = hostMessageIdFromPayload(payload);
    const recordedResponse = await findOutcomeIntegrityResponseAsync(state, hostMessageId, { coreTurnStore: runtimeCoreTurnStore })
      || await findOutcomeIntegrityResponseAsync(state, message?.hostMessageId || message?.id, { coreTurnStore: runtimeCoreTurnStore })
      || null;
    const response = recordedResponse || null;
    if (!response) {
      return {
        ok: false,
        accepted: false,
        reason: 'response-not-recorded',
        summary: 'Correct-as-Swipe requires a recorded Directive response.'
      };
    }
    const sourceReview = createSourceReviewWorker({ now });
    const assets = optionalActiveRuntimeAssets();
    const selectedText = compactString(
      payload.selection?.selectedText
      || payload.selectedText
      || payload.selection?.text
      || ''
    );
    const proposedText = payload.proposedText ?? payload.candidateText ?? payload.rewriteText ?? payload.text;
    const evidenceVerdict = await sourceReview.reviewCorrectAsSwipeEvidence({
      text: selectedText,
      campaignState: state,
      packageData: assets?.packageData || null,
      crewDataset: assets?.crewDataset || null,
      shipDataset: assets?.shipDataset || null,
      campaignProjection: assets?.projection || null,
      responseId: response.id || null,
      outcomeId: response.outcomeId || null,
      turnId: response.turnId || null,
      hostMessageId: hostMessageId || response.hostMessageId || null,
      selectedTextHash: payload.selection?.selectedTextHash || payload.selectedTextHash || null,
      evidenceRefIds: payload.evidenceRefIds || payload.selection?.evidenceRefIds || [],
      externalContextOnly: payload.externalContextOnly === true || payload.selection?.externalContextOnly === true
    });
    const beforeContinuity = cloneJson(state?.continuity || null);
    const result = await proposeCorrectAsSwipe({
      campaignState: state,
      host: runtimeHost,
      coreTurnStore: runtimeCoreTurnStore,
      response,
      selection: {
        ...(payload.selection || payload),
        hostMessageId: hostMessageId || response.hostMessageId || null,
        responseId: response.id || null,
        outcomeId: response.outcomeId || null,
        turnId: response.turnId || null,
        coreTransactionId: response.coreTransactionId || null
      },
      proposedText,
      evidenceVerdict,
      idFactory,
      now,
      updateResponse: (latest, responseUpdateId, correctionCase) => {
        const tracked = initializeCampaignRuntimeTracking(latest);
        const currentResponse = prevalidatedCoreResponseForUpdate(recordedResponse, responseUpdateId) || response;
        const hasCompatibilityResponseRow = Boolean(prevalidatedCoreResponseForUpdate(recordedResponse, responseUpdateId));
        const stableResponseId = compactString(currentResponse.id || currentResponse.responseId || response.id || response.responseId);
        const currentCorrectAsSwipe = isObject(currentResponse.correctAsSwipe) ? currentResponse.correctAsSwipe : {};
        const cases = Array.isArray(currentCorrectAsSwipe.cases) ? currentCorrectAsSwipe.cases : [];
        const patch = {
          correctAsSwipe: {
            ...currentCorrectAsSwipe,
            cases: [
              ...cases.filter((entry) => entry?.id !== correctionCase.id),
              correctionCase
            ],
            lastCaseId: correctionCase.id,
            lastCandidateSwipe: cloneJson(correctionCase.candidateSwipe || null)
          }
        };
        if (!hasCompatibilityResponseRow) {
          const error = new Error('Correct-as-Swipe requires a CORE response projection before candidate lifecycle update.');
          error.code = 'DIRECTIVE_CORRECT_AS_SWIPE_RESPONSE_PROJECTION_REQUIRED';
          error.details = {
            action: 'candidateAppended',
            responseId: stableResponseId || compactString(responseUpdateId) || null,
            hostMessageId: compactString(currentResponse?.hostMessageId || correctionCase.source?.hostMessageId || '') || null
          };
          throw error;
        }
        return stableResponseId ? updateDirectiveResponse(tracked, stableResponseId, {
          ...responseCompatibilityProjectionPatch(currentResponse, {
            kind: 'directive.coreResponseCorrectAsSwipeProjectionRef.v1',
            action: 'candidateAppended',
            correctionCase
          }),
          ...patch
        }, {
          missingCoreWriteMode: 'reject'
        }) : tracked;
      },
      persist: async (next, summary) => {
        campaignState = next;
        await persistRuntimeCampaignState(next, summary);
      }
    });
    if (result.campaignState) {
      campaignState = result.campaignState;
      adoptResponseLedgerProjection(result.campaignState);
    }
    await refreshCampaignView();
    const afterState = outcomeIntegrityCampaignState();
    return {
      ...cloneJson(result),
      accepted: false,
      continuityUnchanged: JSON.stringify(beforeContinuity) === JSON.stringify(afterState?.continuity || null),
      view: viewEnvelope('settings')
    };
  }

  async function settleCorrectAsSwipeCase(payload = {}) {
    await ensureInitialized();
    await refreshCurrentChatCampaignScope();
    const state = outcomeIntegrityCampaignState();
    const caseId = compactString(payload.caseId || payload.id || payload.correctionCaseId || '');
    const message = hostMessageForOutcomeIntegrity(payload);
    const hostMessageId = hostMessageIdFromPayload(payload);
    const responses = (await createRuntimeLedgerViewAsync(state || {}, { coreTurnStore: runtimeCoreTurnStore })).responseLedger || [];
    const recordedResponse = await findOutcomeIntegrityResponseAsync(state, hostMessageId, { coreTurnStore: runtimeCoreTurnStore })
      || await findOutcomeIntegrityResponseAsync(state, message?.hostMessageId || message?.id, { coreTurnStore: runtimeCoreTurnStore })
      || responses.find((entry) => (
        Array.isArray(entry?.correctAsSwipe?.cases)
        && entry.correctAsSwipe.cases.some((correctionCase) => compactString(correctionCase?.id) === caseId)
      ))
      || null;
    const response = recordedResponse || null;
    if (!response) {
      return {
        ok: false,
        accepted: false,
        reason: 'response-not-recorded',
        summary: 'Correct-as-Swipe case lifecycle requires a recorded Directive response.'
      };
    }
    const beforeContinuity = cloneJson(state?.continuity || null);
    const result = await settleCorrectAsSwipeCaseLifecycle({
      campaignState: state,
      coreTurnStore: runtimeCoreTurnStore,
      response,
      caseId,
      action: payload.action,
      reason: payload.reason,
      now,
      updateResponse: (latest, responseUpdateId, correctionCase) => {
        const tracked = initializeCampaignRuntimeTracking(latest);
        const currentResponse = prevalidatedCoreResponseForUpdate(recordedResponse, responseUpdateId) || response;
        const hasCompatibilityResponseRow = Boolean(prevalidatedCoreResponseForUpdate(recordedResponse, responseUpdateId));
        const stableResponseId = compactString(currentResponse.id || currentResponse.responseId || response.id || response.responseId);
        const currentCorrectAsSwipe = isObject(currentResponse.correctAsSwipe) ? currentResponse.correctAsSwipe : {};
        const cases = Array.isArray(currentCorrectAsSwipe.cases) ? currentCorrectAsSwipe.cases : [];
        const patch = {
          correctAsSwipe: {
            ...currentCorrectAsSwipe,
            cases: [
              ...cases.filter((entry) => entry?.id !== correctionCase.id),
              correctionCase
            ],
            lastCaseId: correctionCase.id,
            lastLifecycleDecision: cloneJson(correctionCase.repairDecision || null),
            lastCandidateSwipe: cloneJson(correctionCase.candidateSwipe || currentCorrectAsSwipe.lastCandidateSwipe || null)
          }
        };
        if (!hasCompatibilityResponseRow) {
          const error = new Error('Correct-as-Swipe requires a CORE response projection before case lifecycle update.');
          error.code = 'DIRECTIVE_CORRECT_AS_SWIPE_RESPONSE_PROJECTION_REQUIRED';
          error.details = {
            action: 'caseLifecycleUpdated',
            responseId: stableResponseId || compactString(responseUpdateId) || null,
            hostMessageId: compactString(currentResponse?.hostMessageId || correctionCase.source?.hostMessageId || '') || null
          };
          throw error;
        }
        return stableResponseId ? updateDirectiveResponse(tracked, stableResponseId, {
          ...responseCompatibilityProjectionPatch(currentResponse, {
            kind: 'directive.coreResponseCorrectAsSwipeProjectionRef.v1',
            action: 'caseLifecycleUpdated',
            correctionCase
          }),
          ...patch
        }, {
          missingCoreWriteMode: 'reject'
        }) : tracked;
      },
      persist: async (next, summary) => {
        campaignState = next;
        await persistRuntimeCampaignState(next, summary);
      }
    });
    if (result.campaignState) {
      campaignState = result.campaignState;
      adoptResponseLedgerProjection(result.campaignState);
    }
    await refreshCampaignView();
    const afterState = outcomeIntegrityCampaignState();
    return {
      ...cloneJson(result),
      accepted: false,
      continuityUnchanged: JSON.stringify(beforeContinuity) === JSON.stringify(afterState?.continuity || null),
      view: viewEnvelope('settings')
    };
  }

  async function run(operation) {
    try {
      lastError = null;
      return await operation();
    } catch (error) {
      lastError = error;
      throw error;
    }
  }

  publicApi = {
    [mutateCampaignStateForTest](mutator) {
      return run(async () => {
        await ensureInitialized();
        if (typeof mutator !== 'function') {
          throw new Error('mutateCampaignStateForTest requires a mutator function.');
        }
        const nextState = mutator(cloneJson(campaignState));
        if (nextState !== undefined) {
          campaignState = cloneJson(nextState);
          await refreshCampaignView();
        }
        return viewEnvelope('mission');
      });
    },

    [mutateCoreStoreStateForTest](mutator) {
      return run(async () => {
        await ensureInitialized();
        if (typeof mutator !== 'function') {
          throw new Error('mutateCoreStoreStateForTest requires a mutator function.');
        }
        const descriptor = coreStoreDescriptorForState(campaignState);
        if (!descriptor) {
          throw new Error('mutateCoreStoreStateForTest requires an active CORE store descriptor.');
        }
        const currentStore = await ensureActiveCoreTurnStore();
        const nextState = mutator(cloneJson(currentStore?.state || {}));
        if (nextState !== undefined) {
          const persistedState = {
            ...cloneJson(nextState),
            campaignId: nextState.campaignId || descriptor.campaignId,
            saveId: nextState.saveId || descriptor.saveId,
            branchId: nextState.branchId || descriptor.branchId,
            updatedAt: nextState.updatedAt || timestampFromNow(now)
          };
          await commitV2SaveLayout(storageAdapter, {
            campaignId: persistedState.campaignId,
            saveId: persistedState.saveId,
            branchId: persistedState.branchId,
            head: buildCoreStoreHeadSnapshot(persistedState),
            hostMap: {
              excludesRawChatText: true,
              rows: cloneJson(persistedState.hostMapRows || [])
            },
            promptCache: {
              directiveOwnedRevision: Number(persistedState.revisions?.prompt || 0),
              dirtyDomains: [...new Set(persistedState.promptDirtyDomains || [])],
              blocks: []
            },
            eventSegments: [cloneJson(persistedState.events || [])],
            turnSegments: [cloneJson(persistedState.turns || [])],
            diagnosticsSegments: [cloneJson(persistedState.diagnostics || [])],
            metadata: {
              source: 'runtime-app-test-core-store-mutation',
              eventCount: Array.isArray(persistedState.events) ? persistedState.events.length : 0,
              turnCount: Array.isArray(persistedState.turns) ? persistedState.turns.length : 0,
              diagnosticCount: Array.isArray(persistedState.diagnostics) ? persistedState.diagnostics.length : 0
            },
            now: persistedState.updatedAt,
            layout: 'core'
          });
          activeCoreTurnStoreRecord = {
            ...descriptor,
            store: createCoreStoreV2({
              adapter: storageAdapter,
              campaignId: persistedState.campaignId,
              saveId: persistedState.saveId,
              branchId: persistedState.branchId,
              now,
              initialState: persistedState
            })
          };
          activeCoreTurnStorePending = null;
          await refreshCampaignView();
        }
        return viewEnvelope('mission');
      });
    },

    async initialize() {
      return run(async () => {
        await ensureInitialized();
        await refreshManualSaveGuard();
        await refreshCurrentChatCampaignScope();
        return viewEnvelope('campaign');
      });
    },

    async handleHostGenerationStopped(payload = {}) {
      return run(async () => {
        return abortHostCancelableGenerations({
          reason: compactString(payload?.reason) || 'host-generation-stopped'
        });
      });
    },

    async getCurrentView({ tabId = 'campaign' } = {}) {
      return run(async () => {
        await ensureInitialized();
        if (tabId === 'campaign' && activeScreen !== 'creator') {
          await refreshCampaignView();
        }
        await refreshManualSaveGuard();
        await refreshCurrentChatCampaignScope();
        await refreshViewCoreProjectionEvidence();
        return viewEnvelope(tabId);
      });
    },

    getChatTurnOrchestrator() {
      return ensureChatNativeServices()?.orchestrator || null;
    },

    async observeHostPlayerMessage(payload = {}) {
      return run(async () => {
        await ensureInitialized();
        await refreshCurrentChatCampaignScope();
        const openingScene = campaignState ? campaignOpeningSceneStatus(campaignState) : null;
        if (openingScene?.blocked) {
          await refreshCampaignView();
          return {
            handled: true,
            blocked: true,
            reason: openingScene.reason,
            summary: openingScene.summary,
            openingScene: cloneJson(openingScene),
            responseStrategy: 'pause',
            abortDefaultGeneration: true,
            view: viewEnvelope('campaign')
          };
        }
        const services = ensureChatNativeServices();
        if (!services) return { handled: false, reason: 'chat-native-host-unavailable' };
        const callerReporter = typeof payload.turnActivityReporter === 'function'
          ? payload.turnActivityReporter
          : null;
        const chatId = payload.chatId || payload.message?.chatId || runtimeHost.chat?.getCurrentChatId?.() || null;
        const wrappedPayload = {
          ...payload,
          turnActivityReporter: (event = {}) => {
            const status = turnStatusLabelForActivity(event);
            if (status) recordChatTurnStatus({ status, event, chatId });
            callerReporter?.(event);
          }
        };
        const result = await services.orchestrator.observePlayerMessage(wrappedPayload);
        recordChatTurnStatus({
          status: turnStatusFromResult(result),
          result,
          chatId
        });
        return result;
      });
    },

    async reobserveHostGenerationCompletions(options = {}) {
      return run(async () => {
        await ensureInitialized();
        await refreshCurrentChatCampaignScope();
        const services = ensureChatNativeServices();
        if (typeof services?.responseDispatcher?.reobserveHostGenerationCompletions !== 'function') {
          return {
            ok: false,
            skipped: true,
            reason: 'response-dispatcher-reobserve-unavailable'
          };
        }
        const state = liveCampaignStateForView() || campaignState;
        const assets = optionalRuntimeAssetsForState(state);
        const result = await services.responseDispatcher.reobserveHostGenerationCompletions({
          campaignState: state,
          limit: options.limit,
          packageData: assets?.packageData || null,
          crewDataset: assets?.crewDataset || null,
          shipDataset: assets?.shipDataset || null,
          campaignProjection: assets?.projection || null
        });
        await refreshCampaignView();
        await refreshCurrentChatCampaignScope();
        return {
          ...cloneJson(result || {}),
          view: viewEnvelope('mission')
        };
      });
    },

    async getOutcomeIntegrityNativeEditDecision(payload = {}) {
      return outcomeIntegrityNativeEditDecision(payload);
    },

    async prepareOutcomeIntegrityEdit(payload = {}) {
      return run(async () => prepareOutcomeIntegrityEdit(payload));
    },

    async submitOutcomeIntegrityEdit(payload = {}) {
      return run(async () => submitOutcomeIntegrityEdit(payload));
    },

    async proposeCorrectAsSwipeCandidate(payload = {}) {
      return run(async () => proposeCorrectAsSwipeCandidate(payload));
    },

    async settleCorrectAsSwipeCase(payload = {}) {
      return run(async () => settleCorrectAsSwipeCase(payload));
    },

    async flushChatSidecars() {
      return run(async () => {
        await ensureInitialized();
        const services = ensureChatNativeServices();
        const commandLogSummaryResult = await settleCommandLogSummaryQueue();
        const postCommitConversationResult = await settlePostCommitConversationQueue();
        const advisoryEnrichmentResult = await settleAdvisoryEnrichmentQueue();
        const terminalCheckpointSettlementResult = await settleTerminalCheckpointSettlementQueue();
        const reobserveState = liveCampaignStateForView() || campaignState;
        const reobserveAssets = optionalRuntimeAssetsForState(reobserveState);
        const hostGenerationReobserveResult = typeof services?.responseDispatcher?.reobserveHostGenerationCompletions === 'function'
          ? await services.responseDispatcher.reobserveHostGenerationCompletions({
            campaignState: reobserveState,
            packageData: reobserveAssets?.packageData || null,
            crewDataset: reobserveAssets?.crewDataset || null,
            shipDataset: reobserveAssets?.shipDataset || null,
            campaignProjection: reobserveAssets?.projection || null
          })
          : {
            ok: false,
            skipped: true,
            reason: 'response-dispatcher-reobserve-unavailable'
          };
        if (!services?.sidecarScheduler?.pending) {
          await refreshCampaignView();
          await refreshCurrentChatCampaignScope();
          return {
            ok: commandLogSummaryResult?.scheduled === true
              || commandLogSummaryResult?.ok === true
              || postCommitConversationResult?.scheduled === true
              || postCommitConversationResult?.ok === true
              || advisoryEnrichmentResult?.scheduled === true
              || advisoryEnrichmentResult?.ok === true
              || terminalCheckpointSettlementResult?.scheduled === true
              || terminalCheckpointSettlementResult?.ok === true
              || hostGenerationReobserveResult?.ok === true,
            reason: 'sidecar-scheduler-unavailable',
            commandLogSummaryResult: cloneJson(commandLogSummaryResult),
            postCommitConversationResult: cloneJson(postCommitConversationResult),
            advisoryEnrichmentResult: cloneJson(advisoryEnrichmentResult),
            terminalCheckpointSettlementResult: cloneJson(terminalCheckpointSettlementResult),
            hostGenerationReobserveResult: cloneJson(hostGenerationReobserveResult),
            view: viewEnvelope('mission')
          };
        }
        const legacySidecarJournalCountBefore = campaignState?.runtimeTracking?.sidecarJournal?.length || 0;
        const coreSidecarDiagnosticsBefore = await coreSidecarDiagnosticCount();
        const coreSidecarResumeCountBefore = await coreSidecarResumeCount();
        const results = await services.sidecarScheduler.pending();
        await refreshCampaignView();
        await refreshCurrentChatCampaignScope();
        const legacySidecarJournalCountAfter = campaignState?.runtimeTracking?.sidecarJournal?.length || 0;
        const coreSidecarDiagnosticsAfter = await coreSidecarDiagnosticCount();
        const coreSidecarResumeCountAfter = await coreSidecarResumeCount();
        const sidecarCountBefore = Number.isFinite(coreSidecarResumeCountBefore)
          ? Math.max(0, coreSidecarResumeCountBefore)
          : 0;
        const sidecarCountAfter = Number.isFinite(coreSidecarResumeCountAfter)
          ? Math.max(0, coreSidecarResumeCountAfter)
          : 0;
        const legacySidecarJournalDelta = Math.max(0, legacySidecarJournalCountAfter - legacySidecarJournalCountBefore);
        const coreSidecarDiagnosticDelta = Number.isFinite(coreSidecarDiagnosticsBefore) && Number.isFinite(coreSidecarDiagnosticsAfter)
          ? Math.max(0, coreSidecarDiagnosticsAfter - coreSidecarDiagnosticsBefore)
          : null;
        const sidecarCountDelta = Math.max(0, sidecarCountAfter - sidecarCountBefore);
        const resultCount = Array.isArray(results) ? results.length : 0;
        return {
          ok: true,
          sidecarCountBefore,
          sidecarCountAfter,
          legacySidecarJournalCountBefore,
          legacySidecarJournalCountAfter,
          legacySidecarJournalDelta,
          coreSidecarDiagnosticsBefore,
          coreSidecarDiagnosticsAfter,
          coreSidecarDiagnosticDelta,
          coreSidecarResumeCountBefore,
          coreSidecarResumeCountAfter,
          sidecarDelta: Math.max(sidecarCountDelta, coreSidecarDiagnosticDelta ?? 0, resultCount),
          results: cloneJson(results || []),
          commandLogSummaryResult: cloneJson(commandLogSummaryResult),
          postCommitConversationResult: cloneJson(postCommitConversationResult),
          advisoryEnrichmentResult: cloneJson(advisoryEnrichmentResult),
          terminalCheckpointSettlementResult: cloneJson(terminalCheckpointSettlementResult),
          hostGenerationReobserveResult: cloneJson(hostGenerationReobserveResult),
          view: viewEnvelope('mission')
        };
      });
    },

    async flushRuntimeDiagnostics() {
      return run(async () => {
        await ensureInitialized();
        await flushCommandLogSummaryCoreDiagnostics();
        await flushPostCommitConversationCoreDiagnostics();
        await flushAdvisoryEnrichmentCoreDiagnostics();
        await terminalCheckpointSettlementQueue;
        await flushTerminalCheckpointCoreDiagnostics();
        await terminalCheckpointDiagnosticQueue;
        await modelCallJournal.flushCoreDiagnostics();
        const runtimePersistenceResult = await refreshRuntimePersistenceAfterCoreDiagnostics('Runtime CORE diagnostics metadata refreshed.');
        await settleRuntimePersistenceQueue();
        await refreshCampaignView();
        await refreshCurrentChatCampaignScope();
        return {
          ok: true,
          runtimePersistenceResult: cloneJson(runtimePersistenceResult || null),
          view: viewEnvelope('mission')
        };
      });
    },

    async captureMissionComponentSelection(payload = {}) {
      return run(async () => {
        const selection = payload.selection || payload;
        const context = await ensureMissionComponentCaptureContext(selection);
        if (!context.ok) {
          return {
            ok: false,
            reason: context.reason,
            summary: context.summary,
            guard: cloneJson(context.guard || null),
            view: viewEnvelope('mission')
          };
        }
        const sourceMessage = await sourceMessageForMissionComponent(selection);
        if (!sourceMessage.ok) {
          return {
            ok: false,
            reason: sourceMessage.reason,
            summary: sourceMessage.summary,
            view: viewEnvelope('mission')
          };
        }
        const assets = optionalActiveRuntimeAssets();
        const prepared = await prepareMissionComponentSelection({
          selection: {
            ...cloneJson(selection),
            chatId: context.chatId || selection.chatId || null,
            message: sourceMessage.message
          },
          campaignState,
          packageData: assets?.packageData || null,
          crewDataset: assets?.crewDataset || null,
          generationRouter: payload.useProvider === false ? null : defaultGenerationRouter,
          useProvider: payload.useProvider !== false
        });
        return {
          ...cloneJson(prepared),
          ok: true,
          campaignState: cloneJson(campaignState),
          view: viewEnvelope('mission')
        };
      });
    },

    async defineSelectionLookup(payload = {}) {
      return run(async () => {
        const selection = payload.selection || payload;
        const context = await ensureMissionComponentCaptureContext(selection);
        if (!context.ok) {
          return {
            ok: false,
            reason: context.reason,
            summary: context.summary,
            guard: cloneJson(context.guard || null),
            view: viewEnvelope('mission')
          };
        }
        const sourceMessage = await sourceMessageForMissionComponent(selection);
        if (!sourceMessage.ok) {
          return {
            ok: false,
            reason: sourceMessage.reason,
            summary: sourceMessage.summary,
            view: viewEnvelope('mission')
          };
        }
        const assets = optionalActiveRuntimeAssets();
        const recentMessages = typeof runtimeHost?.chat?.getRecentMessages === 'function'
          ? await runtimeHost.chat.getRecentMessages({ limit: 80, playerSafeOnly: true })
          : [];
        const sourceMessageId = compactString(sourceMessage.message?.hostMessageId || sourceMessage.message?.id);
        const hasSourceMessage = recentMessages.some((message) => compactString(message?.hostMessageId || message?.id) === sourceMessageId);
        const contextMessages = hasSourceMessage
          ? recentMessages
          : [...recentMessages, sourceMessage.message].filter(Boolean);
        const playerSafeProjection = createPlayerSafeCampaignProjection({
          campaignState,
          packageData: assets?.packageData || null,
          crewDataset: assets?.crewDataset || null,
          scene: campaignState?.attentionState?.scene || null
        });
        const prepared = await prepareDefineSelection({
          selection: {
            ...cloneJson(selection),
            chatId: context.chatId || selection.chatId || null,
            message: sourceMessage.message
          },
          campaignState,
          packageData: assets?.packageData || null,
          crewDataset: assets?.crewDataset || null,
          shipDataset: assets?.shipDataset || null,
          playerSafeProjection,
          recentMessages: contextMessages,
          currentSceneMessages: recentMessages.slice(-12),
          scene: campaignState?.attentionState?.scene || null,
          generationRouter: payload.useProvider === false ? null : defaultGenerationRouter,
          useProvider: payload.useProvider !== false
        });
        return {
          ...cloneJson(prepared),
          ok: true,
          view: viewEnvelope('mission')
        };
      });
    },

    async saveMissionComponent(payload = {}) {
      return run(async () => {
        const componentPayload = payload.component || payload;
        const source = componentPayload.source || payload.source || {};
        const selection = payload.selection || {
          selectedText: componentPayload.verbatim || payload.selectedText,
          chatId: source.chatId,
          hostMessageId: source.hostMessageId,
          message: {
            hostMessageId: source.hostMessageId,
            role: source.messageRole,
            name: source.messageName
          }
        };
        const context = await ensureMissionComponentCaptureContext(selection);
        if (!context.ok) {
          return {
            ok: false,
            reason: context.reason,
            summary: context.summary,
            guard: cloneJson(context.guard || null),
            view: viewEnvelope('mission')
          };
        }
        const sourceMessage = await sourceMessageForMissionComponent(selection);
        if (!sourceMessage.ok) {
          return {
            ok: false,
            reason: sourceMessage.reason,
            summary: sourceMessage.summary,
            view: viewEnvelope('mission')
          };
        }
        const componentInput = componentInputFromCapture({
          ...payload,
          component: {
            ...componentPayload,
            source: {
              ...source,
              host: source.host || runtimeHost?.id || 'sillytavern',
              chatId: context.chatId || source.chatId || null,
              hostMessageId: source.hostMessageId || sourceMessage.message.hostMessageId,
              messageRole: source.messageRole || sourceMessage.message.role,
              messageName: source.messageName || sourceMessage.message.name,
              outcomeId: source.outcomeId || sourceMessage.message.outcomeId || sourceMessage.message.metadata?.outcomeId,
              ingressId: source.ingressId || sourceMessage.message.ingressId || sourceMessage.message.metadata?.ingressId,
              messageText: sourceMessage.message.text
            }
          }
        });
        const result = addMissionComponent(campaignState, componentInput, {
          idFactory,
          now
        });
        const tracked = await commitMissionComponentsMutation(result.campaignState, {
          source: 'missionComponents.save',
          reason: `Mission Component saved: ${result.component.title}`,
          summary: `Mission Component saved: ${result.component.title}`
        });
        return {
          kind: 'directive.missionComponents.save',
          ok: true,
          component: cloneJson(result.component),
          components: cloneJson(missionComponentsState(tracked)),
          campaignState: cloneJson(tracked),
          view: viewEnvelope('mission')
        };
      });
    },

    async updateMissionComponent(payload = {}) {
      return run(async () => {
        await ensureInitialized();
        const id = requireNonEmptyString(payload.componentId || payload.id, 'componentId');
        const patch = payload.patch || payload.component || {};
        const result = updateMissionComponentRecord(campaignState, id, patch, { now });
        const tracked = await commitMissionComponentsMutation(result.campaignState, {
          source: 'missionComponents.update',
          reason: `Mission Component updated: ${result.component.title}`,
          summary: `Mission Component updated: ${result.component.title}`
        });
        return {
          kind: 'directive.missionComponents.update',
          ok: true,
          component: cloneJson(result.component),
          components: cloneJson(missionComponentsState(tracked)),
          campaignState: cloneJson(tracked),
          view: viewEnvelope('mission')
        };
      });
    },

    async archiveMissionComponent(payload = {}) {
      return run(async () => {
        await ensureInitialized();
        const id = requireNonEmptyString(payload.componentId || payload.id, 'componentId');
        const result = archiveMissionComponentRecord(campaignState, id, { now });
        const tracked = await commitMissionComponentsMutation(result.campaignState, {
          source: 'missionComponents.archive',
          reason: `Mission Component archived: ${result.component.title}`,
          summary: `Mission Component archived: ${result.component.title}`
        });
        return {
          kind: 'directive.missionComponents.archive',
          ok: true,
          component: cloneJson(result.component),
          components: cloneJson(missionComponentsState(tracked)),
          campaignState: cloneJson(tracked),
          view: viewEnvelope('mission')
        };
      });
    },

    async openMissionComponentSource(payload = {}) {
      return run(async () => {
        await ensureInitialized();
        const id = requireNonEmptyString(payload.componentId || payload.id, 'componentId');
        const component = findMissionComponent(liveCampaignStateForView() || campaignState, id);
        if (!component) {
          return {
            ok: false,
            reason: 'component-not-found',
            summary: `Mission Component "${id}" was not found.`,
            view: viewEnvelope('mission')
          };
        }
        const sourceChatId = compactString(component.source?.chatId);
        const currentChatId = compactString(
          currentChatScope?.currentChat?.chatId
          || (typeof runtimeHost?.chat?.getCurrentChatId === 'function' ? runtimeHost.chat.getCurrentChatId() : null)
          || campaignState?.campaignChatBinding?.chatId
        );
        if (sourceChatId && currentChatId && sourceChatId !== currentChatId) {
          return {
            ok: false,
            reason: 'source-chat-not-open',
            summary: 'Open the source campaign chat before jumping to this Mission Component source.',
            component: cloneJson(component),
            source: cloneJson(component.source || null),
            view: viewEnvelope('mission')
          };
        }
        return {
          kind: 'directive.missionComponents.openSource',
          ok: true,
          component: cloneJson(component),
          source: cloneJson(component.source || null),
          summary: `Source: Msg ${component.source?.hostMessageId || 'unknown'}`,
          view: viewEnvelope('mission')
        };
      });
    },

    async interceptHostGeneration(payload = {}) {
      return run(async () => {
        await ensureInitialized();
        await refreshCurrentChatCampaignScope();
        const services = ensureChatNativeServices();
        if (!services) return { handled: false, reason: 'chat-native-host-unavailable' };
        return services.orchestrator.interceptGeneration(payload);
      });
    },

    async handleHostMessageEdited(payload = {}) {
      return run(async () => {
        await ensureInitialized();
        await refreshCurrentChatCampaignScope();
        const decision = await outcomeIntegrityNativeEditDecision(payload);
        if (decision.protected && decision.mode === 'relaxed') {
          const message = hostMessageForOutcomeIntegrity(payload);
          const priorText = priorSwipeTextForRelaxedEdit(message);
          if (priorText) {
            const proposedText = String(
              payload?.text
              || payload?.message?.text
              || message?.text
              || ''
            ).trim();
            const context = await buildOutcomeIntegrityEditContextAsync({
              campaignState: outcomeIntegrityCampaignState(),
              message: {
                ...message,
                text: priorText
              },
              hostMessageId: hostMessageIdFromPayload(payload),
              coreTurnStore: runtimeCoreTurnStore
            });
            const result = await submitOutcomeIntegrityEdit({
              hostMessageId: context.hostMessageId,
              proposedText,
              context,
              currentText: priorText,
              baseTextHash: context.baseTextHash,
              reviewProviderKind: context.reviewProviderKind
            });
            return {
              handled: true,
              relaxedNativeEdit: true,
              ...result
            };
          }
        }
        const services = ensureChatNativeServices();
        return services
          ? services.orchestrator.handleMessageEdited(payload)
          : { handled: false, reason: 'chat-native-host-unavailable' };
      });
    },

    async handleHostMessageDeleted(payload = {}) {
      return run(async () => {
        await ensureInitialized();
        await refreshCurrentChatCampaignScope();
        const services = ensureChatNativeServices();
        return services
          ? services.orchestrator.handleMessageDeleted(payload)
          : { handled: false, reason: 'chat-native-host-unavailable' };
      });
    },

    async handleHostMessageVisibilityChanged(payload = {}) {
      return run(async () => {
        await ensureInitialized();
        await refreshCurrentChatCampaignScope();
        const services = ensureChatNativeServices();
        return services?.orchestrator?.handleMessageVisibilityChanged
          ? services.orchestrator.handleMessageVisibilityChanged(payload)
          : { handled: false, reason: 'chat-native-host-unavailable' };
      });
    },

    async handleHostMessageSelectedSwipeChanged(payload = {}) {
      return run(async () => {
        await ensureInitialized();
        await refreshCurrentChatCampaignScope();
        const services = ensureChatNativeServices();
        return services?.orchestrator?.handleMessageSelectedSwipeChanged
          ? services.orchestrator.handleMessageSelectedSwipeChanged(payload)
          : { handled: false, reason: 'chat-native-host-unavailable' };
      });
    },

    async handleHostChatChanged(payload = {}) {
      return run(async () => {
        await ensureInitialized();
        const suppressed = await programmaticChatChangeSuppressionResult(payload);
        if (suppressed) return suppressed;
        await refreshCampaignView();
        await refreshCurrentChatCampaignScope();
        const services = ensureChatNativeServices();
        const result = services
          ? await services.orchestrator.handleChatChanged(payload)
          : { active: false, reason: 'chat-native-host-unavailable' };
        await refreshCampaignView();
        await refreshCurrentChatCampaignScope();
        return result;
      });
    },

    async openCampaignChat({ saveId = null, binding = null } = {}) {
      return run(async () => {
        await ensureInitialized();
        const requestedSaveId = compactString(saveId);
        if (requestedSaveId) {
          await loadCampaignStateForSessionSave(requestedSaveId, binding);
        }
        let targetBinding = normalizedBinding(binding)
          || bindingFromState(campaignState)
          || null;
        if (requestedSaveId && targetBinding) {
          targetBinding = {
            ...targetBinding,
            saveId: requestedSaveId
          };
        }
        if (!targetBinding?.chatId) return { ok: false, reason: 'campaign-chat-unbound' };
        const openSync = await openAndRetargetCampaignChat(campaignState, {
          binding: targetBinding,
          persistPrompt: true,
          rebuildPrompt: true,
          reason: 'Campaign prompt context rebuilt after opening the save.'
        });
        await refreshManualSaveGuard(campaignState, {
          expectedSaveId: targetBinding.saveId || requestedSaveId || controller?.activeSaveId || null
        });
        await refreshCampaignView();
        await refreshCurrentChatCampaignScope();
        const chatChange = {
          skipped: true,
          reason: 'programmatic-open-syncs-prompt'
        };
        return {
          ok: openSync.opened !== false,
          binding: cloneJson(targetBinding),
          openSync: cloneJson(openSync),
          chatChange: cloneJson(chatChange || null),
          view: viewEnvelope('mission')
        };
      });
    },

    async selectCampaign({ campaignId = '' } = {}) {
      return run(async () => {
        await ensureInitialized();
        const id = compactString(campaignId);
        const view = campaignIndexView();
        if (!id || !view.campaigns.some((campaign) => campaign.id === id)) {
          throw new Error('Selected campaign is not available.');
        }
        uiPreferences.selectCampaign(id);
        await persistUiPreferences();
        return viewEnvelope('campaign');
      });
    },

    async selectMissionQuest({ questId = '' } = {}) {
      return run(async () => {
        await ensureInitialized();
        const scopeKey = missionSelectionScope();
        const information = playerFacingInformationForState();
        const normalizedQuestId = compactString(questId);
        if (!scopeKey || !normalizedQuestId || !information.quests.some((quest) => quest.id === normalizedQuestId)) {
          throw new Error('Selected quest is not available in the current campaign chat.');
        }
        uiPreferences.selectQuest(scopeKey, normalizedQuestId);
        await persistUiPreferences();
        return viewEnvelope('mission');
      });
    },

    async resolvePendingChatInteraction({ interactionId = null, action = 'accept' } = {}) {
      return run(async () => {
        await ensureInitialized();
        const orchestrator = ensureChatNativeServices()?.orchestrator;
        if (!orchestrator?.resolveInteraction) {
          throw new Error('Chat interaction resolution is unavailable for this host.');
        }
        const result = await orchestrator.resolveInteraction({ interactionId, action });
        if (result?.campaignState) campaignState = result.campaignState;
        return {
          result: cloneJson(result),
          view: viewEnvelope('mission')
        };
      });
    },

    async retryCommittedChatResponse({ recoveryId = null } = {}) {
      return run(async () => {
        await ensureInitialized();
        const orchestrator = ensureChatNativeServices()?.orchestrator;
        if (!orchestrator?.retryCommittedResponse) {
          throw new Error('Committed chat response recovery is unavailable for this host.');
        }
        const result = await orchestrator.retryCommittedResponse({ recoveryId });
        if (result?.campaignState) campaignState = result.campaignState;
        await refreshCampaignView();
        return { result: cloneJson(result), view: viewEnvelope('mission') };
      });
    },

    async setReconciliationStart(payload = {}) {
      return run(async () => {
        await ensureInitialized();
        const service = ensureChatNativeServices()?.sceneReconciliation;
        if (!service) throw new Error('Scene reconciliation is unavailable for this host.');
        const result = await service.setStart(payload);
        lastSceneReconciliationResult = cloneJson(result);
        await refreshCampaignView();
        return { result: cloneJson(result), view: viewEnvelope('mission') };
      });
    },

    async setReconciliationEnd(payload = {}) {
      return run(async () => {
        await ensureInitialized();
        const service = ensureChatNativeServices()?.sceneReconciliation;
        if (!service) throw new Error('Scene reconciliation is unavailable for this host.');
        const result = await service.setEnd(payload);
        lastSceneReconciliationResult = cloneJson(result);
        await refreshCampaignView();
        return { result: cloneJson(result), view: viewEnvelope('mission') };
      });
    },

    async clearReconciliationMarkers(payload = {}) {
      return run(async () => {
        await ensureInitialized();
        const service = ensureChatNativeServices()?.sceneReconciliation;
        if (!service) throw new Error('Scene reconciliation is unavailable for this host.');
        const result = await service.clearMarkers(payload);
        lastSceneReconciliationResult = cloneJson(result);
        await refreshCampaignView();
        return { result: cloneJson(result), view: viewEnvelope('mission') };
      });
    },

    async reconcileMessage(payload = {}) {
      return run(async () => {
        await ensureInitialized();
        const service = ensureChatNativeServices()?.sceneReconciliation;
        if (!service) throw new Error('Scene reconciliation is unavailable for this host.');
        const result = await service.reconcileMessage(payload);
        lastSceneReconciliationResult = cloneJson(result);
        if (Array.isArray(result?.applied) && result.applied.length > 0) {
          await synchronizeActivePrompt(campaignState, {
            persist: true,
            rebuild: true,
            reason: 'Prompt context rebuilt after scene reconciliation.'
          });
        }
        await refreshCampaignView();
        return { result: cloneJson(result), view: viewEnvelope('mission') };
      });
    },

    async reconcileFromHere(payload = {}) {
      return run(async () => {
        await ensureInitialized();
        const service = ensureChatNativeServices()?.sceneReconciliation;
        if (!service) throw new Error('Scene reconciliation is unavailable for this host.');
        const result = await service.reconcileFromHere(payload);
        lastSceneReconciliationResult = cloneJson(result);
        if (Array.isArray(result?.applied) && result.applied.length > 0) {
          await synchronizeActivePrompt(campaignState, {
            persist: true,
            rebuild: true,
            reason: 'Prompt context rebuilt after scene reconciliation.'
          });
        }
        await refreshCampaignView();
        return { result: cloneJson(result), view: viewEnvelope('mission') };
      });
    },

    async reconcileMarkedPassage(payload = {}) {
      return run(async () => {
        await ensureInitialized();
        const service = ensureChatNativeServices()?.sceneReconciliation;
        if (!service) throw new Error('Scene reconciliation is unavailable for this host.');
        const result = await service.reconcileMarked(payload);
        lastSceneReconciliationResult = cloneJson(result);
        if (Array.isArray(result?.applied) && result.applied.length > 0) {
          await synchronizeActivePrompt(campaignState, {
            persist: true,
            rebuild: true,
            reason: 'Prompt context rebuilt after marked scene reconciliation.'
          });
        }
        await refreshCampaignView();
        return { result: cloneJson(result), view: viewEnvelope('mission') };
      });
    },

    async recalculateFromHere(payload = {}) {
      return run(async () => {
        await ensureInitialized();
        const service = ensureChatNativeServices()?.sceneReconciliation;
        if (!service) throw new Error('Scene reconciliation is unavailable for this host.');
        const result = await service.recalculateFromHere(payload);
        let preview = null;
        if (result?.ok && result.outcomeId && payload.preview !== false) {
          const playerInput = String(
            payload.playerInput
            || payload.message?.text
            || payload.text
            || result.anchor?.textPreview
            || 'Recalculate from selected chat passage.'
          ).trim();
          try {
            preview = await publicApi.previewOutcomeReplacement({
              outcomeId: result.outcomeId,
              playerInput,
              type: 'recalculateFromHere'
            });
          } catch (error) {
            preview = {
              ok: false,
              error: {
                code: error?.code || null,
                message: error?.message || String(error)
              }
            };
          }
        }
        lastSceneReconciliationResult = {
          ...cloneJson(result),
          preview: cloneJson(preview)
        };
        await refreshCampaignView();
        return {
          result: cloneJson(result),
          preview: cloneJson(preview),
          view: viewEnvelope('mission')
        };
      });
    },

    async openPendingReconciliation() {
      return run(async () => {
        await ensureInitialized();
        const service = ensureChatNativeServices()?.sceneReconciliation;
        if (!service) throw new Error('Scene reconciliation is unavailable for this host.');
        const result = await service.openPending();
        lastSceneReconciliationResult = cloneJson(result);
        await refreshCampaignView();
        return { result: cloneJson(result), view: viewEnvelope('mission') };
      });
    },

    async applyPendingReconciliation({ proposalId = null } = {}) {
      return run(async () => {
        await ensureInitialized();
        const service = ensureChatNativeServices()?.sceneReconciliation;
        if (!service) throw new Error('Scene reconciliation is unavailable for this host.');
        const result = await service.applyPending({ proposalId });
        lastSceneReconciliationResult = cloneJson(result);
        if (result?.ok) {
          await synchronizeActivePrompt(campaignState, {
            persist: true,
            rebuild: true,
            reason: 'Prompt context rebuilt after accepted reconciliation proposal.'
          });
        }
        await refreshCampaignView();
        return { result: cloneJson(result), view: viewEnvelope('mission') };
      });
    },

    async rejectPendingReconciliation({ proposalId = null } = {}) {
      return run(async () => {
        await ensureInitialized();
        const service = ensureChatNativeServices()?.sceneReconciliation;
        if (!service) throw new Error('Scene reconciliation is unavailable for this host.');
        const result = await service.rejectPending({ proposalId });
        lastSceneReconciliationResult = cloneJson(result);
        await refreshCampaignView();
        return { result: cloneJson(result), view: viewEnvelope('mission') };
      });
    },

    async retryCampaignActivation() {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const services = ensureChatNativeServices();
        if (!services) throw new Error('The active host does not expose Directive chat activation capabilities.');
        const assets = activeRuntimeAssets();
        const existingChatId = campaignState.campaignChatBinding?.chatId || null;
        lastActivationResult = await services.activationCoordinator.activate({
          campaignState,
          packageData: assets.packageData,
          crewDataset: assets.crewDataset,
          shipDataset: assets.shipDataset,
          campaignProjection: assets.projection,
          saveId: controller.activeSaveId,
          existingChatId,
          createNewChat: !existingChatId
        });
        campaignState = applyRuntimeSettings(lastActivationResult.campaignState);
        await refreshCampaignView();
        return { ...cloneJson(lastActivationResult), view: viewEnvelope('campaign') };
      });
    },

    async buildCampaignOpeningScene() {
      return publicApi.retryCampaignActivation();
    },

    async rewriteCampaignIntro(payload = {}) {
      return run(async () => {
        await ensureInitialized();
        await refreshCurrentChatCampaignScope();
        requireObject(campaignState, 'campaignState');
        const services = ensureChatNativeServices();
        if (!services?.activationCoordinator?.rewriteIntro) {
          throw new Error('Campaign intro rewrite is unavailable for this host.');
        }
        const assets = activeRuntimeAssets();
        const hostMessageId = compactString(
          payload.hostMessageId
          || payload.message?.hostMessageId
          || payload.message?.id
        ) || null;
        const result = await services.activationCoordinator.rewriteIntro({
          campaignState,
          packageData: assets.packageData,
          shipDataset: assets.shipDataset,
          saveId: controller.activeSaveId,
          hostMessageId,
          reason: compactString(payload.reason) || 'player-intro-reroll'
        });
        if (result?.campaignState) {
          campaignState = applyRuntimeSettings(result.campaignState);
          lastActivationResult = cloneJson(result);
        }
        await refreshCampaignView();
        await refreshCurrentChatCampaignScope();
        return {
          ok: result?.ok !== false,
          reason: result?.ok === false ? (result.summary || result.reason || 'Campaign intro could not be rewritten.') : undefined,
          result: cloneJson(result),
          view: viewEnvelope('mission')
        };
      });
    },

    async rebuildPromptContext({
      promptFrame = null,
      persist = true,
      reason = 'Player-safe campaign prompt context rebuilt manually.'
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        const result = await synchronizeActivePrompt(campaignState, {
          persist,
          rebuild: true,
          promptFrame,
          reason
        });
        await refreshCampaignView();
        return { ...cloneJson(result), view: viewEnvelope('settings') };
      });
    },

    async updateCampaignDifficulty({
      simulationMode,
      reason = 'player-campaign-difficulty-change'
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        if (pendingDirectorTurn || pendingOutcomeReplacement) {
          const error = new Error('Resolve or discard the pending outcome before changing campaign difficulty.');
          error.code = 'DIRECTIVE_CAMPAIGN_DIFFICULTY_PENDING_OUTCOME';
          throw error;
        }
        const allowedModes = allowedSimulationModesForState(campaignState);
        const requestedMode = String(simulationMode || '').trim();
        const nextMode = normalizeSimulationMode(requestedMode);
        if (requestedMode !== nextMode) {
          throw new Error(`Campaign difficulty must be one of: ${allowedModes.join(', ')}`);
        }
        if (!allowedModes.includes(nextMode)) {
          throw new Error(`Campaign difficulty must be one of: ${allowedModes.join(', ')}`);
        }
        const previousMode = normalizeSimulationMode(campaignState.settings?.simulationMode);
        if (previousMode === nextMode) {
          return {
            kind: 'directive.campaignDifficultyUpdated',
            changed: false,
            simulationMode: nextMode,
            previousMode,
            campaignState: cloneJson(campaignState),
            view: viewEnvelope('campaign')
          };
        }

        const changedAt = timestampFromNow(now);
        campaignState = recordLifecycleEvent({
          ...cloneJson(campaignState),
          settings: {
            ...cloneJson(campaignState.settings || {}),
            simulationMode: nextMode,
            allowedSimulationModes: cloneJson(allowedModes)
          }
        }, {
          id: idFactory('campaign-difficulty'),
          type: 'campaignDifficultyChange',
          status: 'applied',
          authority: 'runtimeLifecycleProjection',
          projectionSource: 'runtimeApp',
          coreProjection: {
            kind: 'directive.runtimeLifecycleProjectionRef.v1',
            lifecycleType: 'campaignDifficultyChange',
            campaignId: campaignState.campaign?.id || null,
            status: 'applied'
          },
          recordedAt: changedAt,
          details: {
            previousMode,
            nextMode,
            reason: compactString(reason) || 'player-campaign-difficulty-change',
            appliesTo: 'future-outcomes-only'
          }
        });
        const lifecycleProjectionState = campaignState;

        let prompt = null;
        let save = null;
        try {
          prompt = await synchronizeActivePrompt(campaignState, {
            persist: true,
            rebuild: true,
            reason: `Campaign difficulty changed to ${nextMode}.`,
            forceSaveIndexUpdate: true
          });
          if (prompt?.campaignState) {
            campaignState = applyRuntimeSettings(stateWithLifecycleProjectionEvidence(prompt.campaignState, lifecycleProjectionState));
          }
        } catch (error) {
          campaignState = applyRuntimeSettings(campaignState);
          throw error;
        }
        if (prompt?.skipped || prompt?.active === false) {
          save = await persistRuntimeCampaignState(campaignState, `Campaign difficulty changed to ${nextMode}.`, {
            forceSaveIndexUpdate: true
          });
        }
        campaignState = stateWithLifecycleProjectionEvidence(campaignState, prompt?.campaignState || lifecycleProjectionState);
        await refreshCampaignView();
        await refreshManualSaveGuard();
        await refreshCurrentChatCampaignScope();
        campaignState = stateWithLifecycleProjectionEvidence(campaignState, prompt?.campaignState || lifecycleProjectionState);
        return {
          kind: 'directive.campaignDifficultyUpdated',
          changed: true,
          simulationMode: nextMode,
          previousMode,
          prompt: cloneJson(prompt || null),
          save: cloneJson(save || null),
          campaignState: cloneJson(campaignState),
          view: viewEnvelope('campaign')
        };
      });
    },

    async updateRuntimeHistoryLimit({ maxTurnSaveHistory = null, historyLimit = null } = {}) {
      return run(async () => {
        await ensureInitialized();
        await settleRuntimePersistenceQueue();
        requireObject(campaignState, 'campaignState');
        const limit = normalizeTurnSaveHistoryLimit(maxTurnSaveHistory ?? historyLimit);
        campaignState = applyRuntimeSettings(campaignState, { maxTurnSaveHistory: limit });
        rememberRuntimeSettingsOverlay(campaignState);
        if (sameBoundCampaignState(currentChatScope?.campaignState, campaignState)) {
          currentChatScope = {
            ...currentChatScope,
            campaignState: cloneJson(campaignState)
          };
        }
        const save = await persistRuntimeCampaignState(
          campaignState,
          `Runtime turn save history limited to ${limit} turn(s).`
        );
        campaignState = applyRuntimeSettingsOverlay(campaignState, controller?.activeSaveId);
        await refreshCampaignView();
        return {
          kind: 'directive.runtimeHistoryLimitUpdated',
          maxTurnSaveHistory: limit,
          historyLimit: limit,
          save: cloneJson(save),
          view: viewEnvelope('settings')
        };
      });
    },

    async updateRuntimeSettings({
      maxTurnSaveHistory = null,
      historyLimit = null,
      autosaveEveryMessages = null,
      outcomeIntegrityMode = null,
      outcomeIntegrityReviewProviderKind = null,
      outcomeIntegrity = null
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        await settleRuntimePersistenceQueue();
        requireObject(campaignState, 'campaignState');
        const limit = normalizeTurnSaveHistoryLimit(
          maxTurnSaveHistory ?? historyLimit ?? campaignState.settings?.maxTurnSaveHistory
        );
        const autosaveInterval = normalizeAutosaveEveryMessages(
          autosaveEveryMessages ?? campaignState.settings?.autosaveEveryMessages
        );
        const currentOutcomeIntegrity = normalizeOutcomeIntegritySettings(campaignState.settings || {});
        const nextOutcomeIntegrity = {
          mode: normalizeOutcomeIntegrityMode(
            outcomeIntegrity?.mode ?? outcomeIntegrityMode ?? currentOutcomeIntegrity.mode,
            currentOutcomeIntegrity.mode
          ),
          reviewProviderKind: normalizeOutcomeIntegrityReviewProviderKind(
            outcomeIntegrity?.reviewProviderKind
              ?? outcomeIntegrityReviewProviderKind
              ?? currentOutcomeIntegrity.reviewProviderKind,
            currentOutcomeIntegrity.reviewProviderKind
          )
        };
        campaignState = applyRuntimeSettings(campaignState, {
          maxTurnSaveHistory: limit,
          autosaveEveryMessages: autosaveInterval,
          outcomeIntegrity: nextOutcomeIntegrity
        });
        rememberRuntimeSettingsOverlay(campaignState);
        if (sameBoundCampaignState(currentChatScope?.campaignState, campaignState)) {
          currentChatScope = {
            ...currentChatScope,
            campaignState: cloneJson(campaignState)
          };
        }
        const save = await persistRuntimeCampaignState(
          campaignState,
          `Runtime settings updated: ${limit} turn history, autosave every ${autosaveInterval} message(s), Outcome Integrity ${nextOutcomeIntegrity.mode}.`
        );
        campaignState = applyRuntimeSettingsOverlay(campaignState, controller?.activeSaveId);
        await refreshCampaignView();
        return {
          kind: 'directive.runtimeSettingsUpdated',
          maxTurnSaveHistory: limit,
          historyLimit: limit,
          autosaveEveryMessages: autosaveInterval,
          outcomeIntegrity: cloneJson(nextOutcomeIntegrity),
          save: cloneJson(save),
          view: viewEnvelope('settings')
        };
      });
    },

    async updateProviderSettings({ kind, patch = {} } = {}) {
      return run(async () => {
        await ensureInitialized();
        const providerKind = requireNonEmptyString(kind, 'kind');
        requireObject(patch, 'patch');
        if (!runtimeHost?.providers?.updateSettings) throw new Error('Provider settings are unavailable on this host.');
        const settings = runtimeHost.providers.updateSettings(providerKind, patch);
        await refreshCampaignView();
        return { kind: providerKind, settings: cloneJson(settings), providerConfiguration: providerViewData(), view: viewEnvelope('settings') };
      });
    },

    async updateProviderRoleRouting({ roleId, providerKind } = {}) {
      return run(async () => {
        await ensureInitialized();
        const role = requireNonEmptyString(roleId, 'roleId');
        const kind = requireNonEmptyString(providerKind, 'providerKind');
        if (!runtimeHost?.providers?.updateRoleProviderKind) throw new Error('Provider role routing is unavailable on this host.');
        const route = runtimeHost.providers.updateRoleProviderKind(role, kind);
        await refreshCampaignView();
        return { roleId: role, providerKind: kind, route: cloneJson(route), providerConfiguration: providerViewData(), view: viewEnvelope('settings') };
      });
    },

    async resetProviderRoleRouting({ roleId } = {}) {
      return run(async () => {
        await ensureInitialized();
        const role = requireNonEmptyString(roleId, 'roleId');
        if (!runtimeHost?.providers?.resetRoleProviderKind) throw new Error('Provider role routing is unavailable on this host.');
        const route = runtimeHost.providers.resetRoleProviderKind(role);
        await refreshCampaignView();
        return { roleId: role, route: cloneJson(route), providerConfiguration: providerViewData(), view: viewEnvelope('settings') };
      });
    },

    async testProvider({ kind } = {}) {
      return run(async () => {
        await ensureInitialized();
        const providerKind = requireNonEmptyString(kind, 'kind');
        if (!runtimeHost?.providers?.test) throw new Error('Provider testing is unavailable on this host.');
        const result = await runtimeHost.providers.test(providerKind);
        return { ...cloneJson(result), providerConfiguration: providerViewData(), view: viewEnvelope('settings') };
      });
    },

    async runFactualGroundingReview({
      reviewRequest,
      generationRouter = defaultGenerationRouter
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        if (!generationRouter?.generate) {
          throw new Error('Factual grounding review requires a generation router.');
        }
        validateFactualGroundingReviewRequest(reviewRequest);
        const stateBefore = campaignState ? gameplayStateFingerprint(campaignState) : null;
        const modelCallCountBefore = coreModelCallDiagnosticsForState(campaignState).length;
        const generated = await generationRouter.generate(
          FACTUAL_GROUNDING_REVIEW_ROLE_ID,
          factualGroundingReviewProviderRequest(reviewRequest)
        );
        const text = compactString(
          generated?.response?.text
          || generated?.response?.content
          || generated?.text
          || generated?.content
          || ''
        );
        const stateAfter = campaignState ? gameplayStateFingerprint(campaignState) : null;
        const modelCalls = coreModelCallDiagnosticsForState(campaignState);
        const latestModelCall = modelCalls.at(-1) || modelCallResultFromGeneration(generated, FACTUAL_GROUNDING_REVIEW_ROLE_ID);
        return {
          kind: 'directive.factualGroundingReviewProviderResult',
          ok: generated?.ok === true && Boolean(text),
          requestId: reviewRequest.requestId || null,
          packageId: reviewRequest.packageId || null,
          packId: reviewRequest.packId || null,
          inputHash: reviewRequest.inputHash || null,
          text,
          generation: {
            ok: generated?.ok === true,
            roleId: generated?.roleId || FACTUAL_GROUNDING_REVIEW_ROLE_ID,
            providerKind: generated?.role?.providerKind || generated?.response?.providerKind || null,
            providerId: generated?.diagnostics?.providerId || generated?.response?.providerId || null,
            model: generated?.diagnostics?.model || generated?.response?.model || null,
            latencyMs: generated?.diagnostics?.latencyMs ?? null,
            requestHash: generated?.diagnostics?.requestHash || null,
            error: cloneJson(generated?.error || null)
          },
          modelCall: cloneJson(latestModelCall || null),
          modelCallDelta: Math.max(0, modelCalls.length - modelCallCountBefore),
          campaignStateMutated: stateBefore !== stateAfter,
          view: viewEnvelope(campaignState ? 'mission' : 'settings')
        };
      });
    },

    async runStoryQualityReview({
      reviewRequest,
      generationRouter = defaultGenerationRouter
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        if (!generationRouter?.generate) {
          throw new Error('Story quality review requires a generation router.');
        }
        validateStoryQualityReviewRequest(reviewRequest);
        const stateBefore = campaignState ? gameplayStateFingerprint(campaignState) : null;
        const modelCallCountBefore = coreModelCallDiagnosticsForState(campaignState).length;
        const generated = await generationRouter.generate(
          STORY_QUALITY_REVIEW_ROLE_ID,
          storyQualityReviewProviderRequest(reviewRequest)
        );
        const text = compactString(
          generated?.response?.text
          || generated?.response?.content
          || generated?.text
          || generated?.content
          || ''
        );
        const stateAfter = campaignState ? gameplayStateFingerprint(campaignState) : null;
        const modelCalls = coreModelCallDiagnosticsForState(campaignState);
        const latestModelCall = modelCalls.at(-1) || modelCallResultFromGeneration(generated, STORY_QUALITY_REVIEW_ROLE_ID);
        return {
          kind: 'directive.storyQualityReviewProviderResult',
          ok: generated?.ok === true && Boolean(text),
          requestId: reviewRequest.requestId || null,
          inputHash: reviewRequest.inputHash || null,
          text,
          generation: {
            ok: generated?.ok === true,
            roleId: generated?.roleId || STORY_QUALITY_REVIEW_ROLE_ID,
            providerKind: generated?.role?.providerKind || generated?.response?.providerKind || null,
            providerId: generated?.diagnostics?.providerId || generated?.response?.providerId || null,
            model: generated?.diagnostics?.model || generated?.response?.model || null,
            latencyMs: generated?.diagnostics?.latencyMs ?? null,
            requestHash: generated?.diagnostics?.requestHash || null,
            error: cloneJson(generated?.error || null)
          },
          modelCall: cloneJson(latestModelCall || null),
          modelCallDelta: Math.max(0, modelCalls.length - modelCallCountBefore),
          campaignStateMutated: stateBefore !== stateAfter,
          view: viewEnvelope(campaignState ? 'mission' : 'settings')
        };
      });
    },

    async refreshDirectivePresetStatus() {
      return run(async () => {
        await ensureInitialized();
        if (!runtimeHost?.presets?.getStatus) throw new Error('Directive preset status is unavailable on this host.');
        lastDirectivePresetStatus = runtimeHost.presets.getStatus();
        return {
          directivePreset: {
            status: cloneJson(lastDirectivePresetStatus),
            autoCheck: cloneJson(runtimeHost.presets.getAutoCheckPreference?.() || null),
            lastInstallResult: cloneJson(lastDirectivePresetInstallResult)
          },
          view: viewEnvelope('settings')
        };
      });
    },

    async updateDirectivePresetAutoCheck({ enabled } = {}) {
      return run(async () => {
        await ensureInitialized();
        if (!runtimeHost?.presets?.setAutoCheckPreference) {
          throw new Error('Directive preset auto-check settings are unavailable on this host.');
        }
        const autoCheck = runtimeHost.presets.setAutoCheckPreference(enabled);
        lastDirectivePresetStatus = runtimeHost.presets.latestStatus?.() || runtimeHost.presets.getStatus?.() || null;
        return {
          directivePreset: {
            status: cloneJson(lastDirectivePresetStatus),
            autoCheck: cloneJson(autoCheck),
            lastInstallResult: cloneJson(lastDirectivePresetInstallResult)
          },
          view: viewEnvelope('settings')
        };
      });
    },

    async getDirectivePresetStartupReminder() {
      return run(async () => {
        await ensureInitialized();
        if (!runtimeHost?.presets?.getStartupCheck) {
          return {
            enabled: false,
            shouldPrompt: false,
            actionable: false,
            status: cloneJson(lastDirectivePresetStatus)
          };
        }
        const reminder = runtimeHost.presets.getStartupCheck();
        lastDirectivePresetStatus = reminder?.status || runtimeHost.presets.latestStatus?.() || lastDirectivePresetStatus;
        return cloneJson(reminder);
      });
    },

    async dismissDirectivePresetStartupReminder({ disable = false, bundledVersion = '' } = {}) {
      return run(async () => {
        await ensureInitialized();
        if (!runtimeHost?.presets) throw new Error('Directive preset settings are unavailable on this host.');
        if (disable) {
          if (!runtimeHost.presets.setAutoCheckPreference) throw new Error('Directive preset auto-check settings are unavailable on this host.');
          runtimeHost.presets.setAutoCheckPreference(false);
        } else {
          if (!runtimeHost.presets.dismissAutoCheckForVersion) throw new Error('Directive preset reminder dismissal is unavailable on this host.');
          runtimeHost.presets.dismissAutoCheckForVersion(bundledVersion || lastDirectivePresetStatus?.bundledVersion || '');
        }
        const reminder = runtimeHost.presets.getStartupCheck?.() || null;
        lastDirectivePresetStatus = reminder?.status || runtimeHost.presets.latestStatus?.() || lastDirectivePresetStatus;
        return {
          reminder: cloneJson(reminder),
          directivePreset: directivePresetViewData(),
          view: viewEnvelope('settings')
        };
      });
    },

    async installDirectivePreset() {
      return run(async () => {
        await ensureInitialized();
        if (!runtimeHost?.presets?.installBundledPreset) throw new Error('Directive preset installation is unavailable on this host.');
        lastDirectivePresetInstallResult = await runtimeHost.presets.installBundledPreset();
        lastDirectivePresetStatus = lastDirectivePresetInstallResult?.status || runtimeHost.presets.getStatus?.() || null;
        return {
          ...cloneJson(lastDirectivePresetInstallResult),
          directivePreset: {
            status: cloneJson(lastDirectivePresetStatus),
            autoCheck: cloneJson(runtimeHost.presets.getAutoCheckPreference?.() || null),
            lastInstallResult: cloneJson(lastDirectivePresetInstallResult)
          },
          view: viewEnvelope('settings')
        };
      });
    },

    async concludeCampaign(options = {}) {
      return run(async () => {
        await ensureInitialized();
        const services = ensureChatNativeServices();
        if (!services) throw new Error('Campaign conclusion requires a chat-capable host adapter.');
        lastConclusionResult = await services.conclusionService.conclude(options);
        campaignState = lastConclusionResult.campaignState;
        await refreshCampaignView();
        return { ...cloneJson(lastConclusionResult), view: viewEnvelope('campaign') };
      });
    },

    async handleHostMessageSent(payload = {}) {
      return publicApi.observeHostPlayerMessage(payload);
    },

    async rebindCampaignChat({ existingChatId = null } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        if (!runtimeHost?.chat?.createOrBindCampaignChat) throw new Error('Host chat binding is unavailable.');
        const previousBinding = cloneJson(campaignState.campaignChatBinding || null);
        const reboundAt = timestampFromNow(now);
        const binding = await runtimeHost.chat.createOrBindCampaignChat({
          campaignId: campaignState.campaign?.id,
          saveId: controller.activeSaveId,
          existingChatId,
          createNew: false
        });
        campaignState = {
          ...campaignState,
          campaignChatBinding: {
            ...cloneJson(binding),
            status: 'bound',
            reboundAt,
            introMessageId: campaignState.campaignChatBinding?.introMessageId || null,
            promptContextRevision: 0
          }
        };
        const opened = await runtimeHost.chat.open?.(campaignState.campaignChatBinding);
        if (opened === false) {
          const error = new Error('Directive rebound the campaign chat but the host could not open it.');
          error.code = 'DIRECTIVE_CAMPAIGN_REBIND_OPEN_FAILED';
          throw error;
        }
        const prompt = await synchronizeActivePrompt(campaignState, {
          persist: true,
          rebuild: true,
          reason: 'Prompt context rebuilt after campaign chat rebinding.'
        });
        const recentMessages = typeof runtimeHost.chat.getRecentMessages === 'function'
          ? await runtimeHost.chat.getRecentMessages({ limit: 1, playerSafeOnly: true })
          : null;
        campaignState = recordLifecycleEvent(campaignState, {
          id: `rebind:${campaignState.campaign?.id || 'campaign'}:${reboundAt}`,
          type: 'chatRebind',
          status: 'applied',
          authority: 'runtimeLifecycleProjection',
          projectionSource: 'runtimeApp',
          coreProjection: {
            kind: 'directive.runtimeLifecycleProjectionRef.v1',
            lifecycleType: 'chatRebind',
            campaignId: campaignState.campaign?.id || null,
            saveId: controller.activeSaveId || null,
            chatId: campaignState.campaignChatBinding?.chatId || null,
            status: 'applied'
          },
          recordedAt: reboundAt,
          details: {
            previousChatId: previousBinding?.chatId || null,
            nextChatId: campaignState.campaignChatBinding?.chatId || null,
            previousBinding,
            binding: cloneJson(campaignState.campaignChatBinding),
            promptContextRevision: campaignState.campaignChatBinding?.promptContextRevision || null,
            chatSyncCheck: recentMessages
              ? {
                  checked: true,
                  recentMessageCount: recentMessages.length,
                  mode: 'metadata-only',
                  historyImported: false
                }
              : {
                  checked: false,
                  reason: 'recent-message-adapter-unavailable',
                  historyImported: false
                }
          }
        });
        await persistRuntimeCampaignState(campaignState, 'Campaign chat rebound and lifecycle journal updated.');
        await refreshManualSaveGuard();
        await refreshCampaignView();
        await refreshCurrentChatCampaignScope();
        return {
          binding: cloneJson(campaignState.campaignChatBinding),
          prompt: cloneJson(prompt),
          view: viewEnvelope('campaign')
        };
      });
    },

    async clearDirectivePrompt({ reason = 'runtime-clear' } = {}) {
      return run(async () => {
        await ensureInitialized();
        return cloneJson(await clearDirectivePromptThroughLens({ reason }));
      });
    },

    async clearPromptContext({ reason = 'manual-clear' } = {}) {
      return run(async () => {
        await ensureInitialized();
        const result = await clearDirectivePromptThroughLens({ reason });
        return {
          result: cloneJson(result),
          view: viewEnvelope('settings')
        };
      });
    },

    async importCampaignPackageArchive({ fileName, bytes } = {}) {
      return run(async () => {
        await ensureInitialized();
        const importedAt = timestampFromNow(now);
        const normalized = normalizeCampaignPackageZip({
          fileName: requireNonEmptyString(fileName, 'fileName'),
          bytes,
          importedAt
        });
        if (!normalized.ok || !normalized.packageRecord) {
          lastPackageImportResult = {
            ok: false,
            importedAt,
            diagnostics: cloneJson(normalized.diagnostics)
          };
          await refreshCampaignView();
          return viewEnvelope('campaign');
        }

        const importId = idFactory('package-import');
        const stored = await storeImportedCampaignPackageRecord(storageAdapter, {
          ...cloneJson(normalized.packageRecord),
          id: importId,
          importedAt,
          updatedAt: importedAt
        }, { now: importedAt });
        await rebuildPackageLibrary();
        initialized = true;
        await refreshCampaignView();
        lastPackageImportResult = {
          ok: true,
          importId,
          packageId: stored.packageId,
          packageVersion: stored.packageVersion,
          importedAt,
          diagnostics: cloneJson(stored.diagnostics)
        };
        return viewEnvelope('campaign');
      });
    },

    async startCreatorDraft({ packageId = null } = {}) {
      return run(async () => {
        await ensureInitialized();
        const result = await controller.startCreatorDraft({
          packageId: packageId || controller.activePackageId
        });
        activeCreatorDraftId = result.draft.id;
        creatorView = result.view;
        activeScreen = 'creator';
        await refreshCampaignView();
        return viewEnvelope('campaign');
      });
    },

    async resumeCreatorDraft({ draftId }) {
      return run(async () => {
        await ensureInitialized();
        const result = await controller.resumeCreatorDraft({
          draftId: requireNonEmptyString(draftId, 'draftId')
        });
        activeCreatorDraftId = result.draft.id;
        creatorView = result.view;
        activeScreen = 'creator';
        return viewEnvelope('campaign');
      });
    },

    async saveCreatorDraft({ patch, reason = 'manualSave' }) {
      return run(async () => {
        await ensureInitialized();
        requireObject(patch, 'patch');
        const draftPatch = await appendReviewFallbackIfNeeded(patch);
        const result = await controller.saveCreatorDraft({
          draftId: requireNonEmptyString(activeCreatorDraftId, 'activeCreatorDraftId'),
          patch: draftPatch,
          reason
        });
        creatorView = result.view;
        activeScreen = 'creator';
        await refreshCampaignView();
        return viewEnvelope('campaign');
      });
    },

    async generateCreatorSectionDraft({
      sectionId,
      input = {},
      generationRouter = defaultGenerationRouter,
      useProvider = true,
      signal = null,
      onProgress = null
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireNonEmptyString(activeCreatorDraftId, 'activeCreatorDraftId');
        const assistResult = await creatorRuntime.generateSectionDraft({
          sectionId,
          input,
          generationRouter,
          useProvider,
          signal,
          onProgress
        });
        activeScreen = 'creator';
        return {
          assistResult: cloneJson(assistResult),
          view: viewEnvelope('campaign')
        };
      });
    },

    async importCreatorPortrait({
      file = null,
      bytes = null,
      arrayBuffer = null,
      base64 = '',
      mimeType = '',
      fileName = '',
      input = null,
      activeStep = null
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        assertPlayerPortraitStorageSupported();
        const draftId = requireNonEmptyString(activeCreatorDraftId, 'activeCreatorDraftId');
        const mergedInput = mergeObjects(creatorView?.input || {}, isObject(input) ? input : {});
        const previousPortrait = mergedInput.identity?.portrait || null;
        const upload = await createPlayerPortraitUpload({
          file,
          bytes,
          arrayBuffer,
          base64,
          mimeType,
          fileName,
          ownerKind: 'creatorDraft',
          ownerId: draftId,
          now: () => timestampFromNow(now)
        });
        const portrait = await storePlayerPortraitAsset(storageAdapter, upload, {
          ownerKind: 'creatorDraft',
          ownerId: draftId,
          now: timestampFromNow(now)
        });
        const result = await controller.saveCreatorDraft({
          draftId,
          patch: {
            activeStep: activeStep || creatorView?.activeStep || 'identity',
            input: mergeObjects(mergedInput, {
              identity: {
                portrait
              }
            })
          },
          reason: 'portraitImport'
        });
        creatorView = result.view;
        activeScreen = 'creator';
        if (previousPortrait?.asset?.path && previousPortrait.asset.path !== portrait.asset.path) {
          await deletePlayerPortraitAsset(storageAdapter, previousPortrait, {
            now: timestampFromNow(now)
          });
        }
        await refreshCampaignView();
        return {
          portrait: cloneJson(portrait),
          view: viewEnvelope('campaign')
        };
      });
    },

    async removeCreatorPortrait({
      input = null,
      activeStep = null
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        const draftId = requireNonEmptyString(activeCreatorDraftId, 'activeCreatorDraftId');
        const mergedInput = mergeObjects(creatorView?.input || {}, isObject(input) ? input : {});
        const previousPortrait = mergedInput.identity?.portrait || null;
        const result = await controller.saveCreatorDraft({
          draftId,
          patch: {
            activeStep: activeStep || creatorView?.activeStep || 'identity',
            input: mergeObjects(mergedInput, {
              identity: {
                portrait: null
              }
            })
          },
          reason: 'portraitRemove'
        });
        creatorView = result.view;
        activeScreen = 'creator';
        const deleteResult = previousPortrait
          ? await deletePlayerPortraitAsset(storageAdapter, previousPortrait, {
              now: timestampFromNow(now)
            })
          : null;
        await refreshCampaignView();
        return {
          portrait: null,
          deleteResult: cloneJson(deleteResult),
          view: viewEnvelope('campaign')
        };
      });
    },

    async cancelCreatorDraft() {
      return run(async () => {
        activeScreen = 'campaign';
        creatorView = null;
        activeCreatorDraftId = null;
        await refreshCampaignView();
        return viewEnvelope('campaign');
      });
    },

    async returnCreatorToCampaignLibrary({ patch = null } = {}) {
      return run(async () => {
        await ensureInitialized();
        if (activeCreatorDraftId && patch) {
          requireObject(patch, 'patch');
          const result = await controller.saveCreatorDraft({
            draftId: activeCreatorDraftId,
            patch,
            reason: 'libraryExit'
          });
          creatorView = result.view;
        }
        if (activeCreatorDraftId && creatorView?.progress?.hasMeaningfulInput !== true) {
          await controller.discardCreatorDraft({ draftId: activeCreatorDraftId });
        }
        activeScreen = 'campaign';
        creatorView = null;
        activeCreatorDraftId = null;
        await refreshCampaignView();
        return viewEnvelope('campaign');
      });
    },

    async discardCreatorDraft({ draftId = null } = {}) {
      return run(async () => {
        await ensureInitialized();
        const targetDraftId = requireNonEmptyString(draftId || activeCreatorDraftId, 'draftId');
        const result = await controller.discardCreatorDraft({ draftId: targetDraftId });
        if (!activeCreatorDraftId || activeCreatorDraftId === targetDraftId) {
          activeScreen = 'campaign';
          creatorView = null;
          activeCreatorDraftId = null;
        }
        await refreshCampaignView();
        return {
          result: cloneJson(result),
          view: viewEnvelope('campaign')
        };
      });
    },

    async resetRuntimeUiState() {
      return run(async () => {
        await ensureInitialized();
        creatorView = null;
        activeCreatorDraftId = null;
        activeScreen = campaignState ? 'campaign' : 'campaign';
        lastPackageImportResult = null;
        lastDirectiveAssistResult = null;
        lastCharacterCreatorSectionDraftResult = null;
        lastError = null;
        await refreshCampaignView();
        return viewEnvelope('campaign');
      });
    },

    async acceptCreatorDraftAndStartCampaign({ simulationMode = 'Command' } = {}) {
      return run(async () => {
        await ensureInitialized();
        const result = await controller.acceptCreatorDraftAndStartCampaign({
          draftId: requireNonEmptyString(activeCreatorDraftId, 'activeCreatorDraftId'),
          simulationMode
        });
        campaignState = applyRuntimeSettings(result.campaignState);
        resetActiveCoreTurnStore('campaign-started');
        activeCreatorDraftId = null;
        creatorView = null;
        pendingDirectorTurn = null;
        pendingOutcomeReplacement = null;
        lastDirectorTurn = null;
        lastNarrationResult = null;
        lastCommandLogSummarySidecarResult = null;
        lastDirectiveAssistResult = null;
        lastCharacterCreatorSectionDraftResult = null;
        lastConclusionResult = null;
        activeScreen = 'campaign';

        const services = ensureChatNativeServices();
        if (services) {
          const assets = activeRuntimeAssets();
          lastActivationResult = await services.activationCoordinator.activate({
            campaignState,
            packageData: assets.packageData,
            crewDataset: assets.crewDataset,
            shipDataset: assets.shipDataset,
            campaignProjection: assets.projection,
            saveId: controller.activeSaveId,
            createNewChat: true
          });
          campaignState = applyRuntimeSettings(lastActivationResult.campaignState);
        } else {
          campaignState = {
            ...campaignState,
            campaign: {
              ...campaignState.campaign,
              status: 'active',
              activatedAt: timestampFromNow(now)
            },
            activationJournal: {
              kind: 'directive.campaignActivationJournal',
              status: 'hostUnavailableFallback',
              completedAt: timestampFromNow(now),
              steps: {}
            }
          };
          await persistRuntimeCampaignState(campaignState, 'Campaign activated without a chat-capable host adapter.');
          lastActivationResult = {
            ok: true,
            fallback: true,
            campaignState: cloneJson(campaignState)
          };
        }
        await refreshCampaignView();
        await refreshManualSaveGuard();
        await refreshCurrentChatCampaignScope();
        return viewEnvelope('mission');
      });
    },

    async importPlayerPortrait({
      file = null,
      bytes = null,
      arrayBuffer = null,
      base64 = '',
      mimeType = '',
      fileName = ''
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        assertPlayerPortraitStorageSupported();
        requireObject(campaignState, 'campaignState');
        const campaignId = requireNonEmptyString(campaignState.campaign?.id, 'campaignState.campaign.id');
        const previousPortrait = campaignState.player?.portrait || null;
        const upload = await createPlayerPortraitUpload({
          file,
          bytes,
          arrayBuffer,
          base64,
          mimeType,
          fileName,
          ownerKind: 'campaign',
          ownerId: campaignId,
          now: () => timestampFromNow(now)
        });
        const portrait = await storePlayerPortraitAsset(storageAdapter, upload, {
          ownerKind: 'campaign',
          ownerId: campaignId,
          now: timestampFromNow(now)
        });
        campaignState = {
          ...cloneJson(campaignState),
          player: {
            ...(campaignState.player || {}),
            portrait: {
              ...portrait,
              owner: {
                kind: 'campaign',
                id: campaignId,
                subjectId: 'player-commander'
              }
            }
          }
        };
        const save = await persistRuntimeCampaignState(campaignState, 'Updated player character portrait.');
        if (previousPortrait?.asset?.path && previousPortrait.asset.path !== portrait.asset.path) {
          await deletePlayerPortraitAsset(storageAdapter, previousPortrait, {
            now: timestampFromNow(now)
          });
        }
        return {
          portrait: cloneJson(campaignState.player.portrait),
          save,
          view: viewEnvelope('crew')
        };
      });
    },

    async removePlayerPortrait() {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const previousPortrait = campaignState.player?.portrait || null;
        campaignState = {
          ...cloneJson(campaignState),
          player: {
            ...(campaignState.player || {}),
            portrait: null
          }
        };
        const save = await persistRuntimeCampaignState(campaignState, 'Removed player character portrait.');
        const deleteResult = previousPortrait
          ? await deletePlayerPortraitAsset(storageAdapter, previousPortrait, {
              now: timestampFromNow(now)
            })
          : null;
        return {
          portrait: null,
          deleteResult: cloneJson(deleteResult),
          save,
          view: viewEnvelope('crew')
        };
      });
    },

    async saveGame({ name = null } = {}) {
      return run(async () => {
        await ensureInitialized();
        if (!checkpointService) {
          throw new Error('The active host does not support immutable checkpoint chats.');
        }
        let result;
        try {
          result = await checkpointService.saveGame({
            name: requireNonEmptyString(name, 'name')
          });
        } catch (error) {
          if (error?.code !== 'DIRECTIVE_CHECKPOINT_SOURCE_GUARD_FAILED') throw error;
          await refreshCampaignView();
          return {
            ok: false,
            blocked: true,
            saveGuard: cloneJson(error.details || null),
            view: viewEnvelope('campaign')
          };
        }
        await refreshCampaignView();
        await refreshCurrentChatCampaignScope();
        return {
          ok: true,
          ...cloneJson(result),
          view: viewEnvelope('campaign')
        };
      });
    },

    async loadCheckpoint({ campaignId, checkpointId }) {
      return run(async () => {
        await ensureInitialized();
        if (!checkpointService) {
          throw new Error('The active host does not support immutable checkpoint chats.');
        }
        await settleRuntimePersistenceQueue();
        const result = await checkpointService.loadGame({
          campaignId: requireNonEmptyString(campaignId, 'campaignId'),
          checkpointId: requireNonEmptyString(checkpointId, 'checkpointId')
        });
        campaignState = applyRuntimeSettings(result.campaignState || campaignState);
        pendingDirectorTurn = null;
        pendingOutcomeReplacement = null;
        lastDirectorTurn = null;
        lastNarrationResult = null;
        lastCommandLogSummarySidecarResult = null;
        lastDirectiveAssistResult = null;
        lastConclusionResult = null;
        activeScreen = 'campaign';
        await refreshCampaignView();
        await refreshManualSaveGuard();
        await refreshCurrentChatCampaignScope();
        return {
          ok: true,
          ...cloneJson(result),
          view: viewEnvelope('campaign')
        };
      });
    },

    async deleteSave({ campaignId, checkpointId }) {
      return run(async () => {
        await ensureInitialized();
        if (!checkpointService) {
          throw new Error('The active host does not support immutable checkpoint chats.');
        }
        const result = await checkpointService.deleteGame({
          campaignId: requireNonEmptyString(campaignId, 'campaignId'),
          checkpointId: requireNonEmptyString(checkpointId, 'checkpointId')
        });
        await refreshCampaignView();
        return {
          ok: true,
          ...cloneJson(result),
          view: viewEnvelope('campaign')
        };
      });
    },

    async refreshStorageDiagnostics() {
      return run(async () => {
        await ensureInitialized();
        const diagnostics = await controller.diagnoseStorage();
        lastStateSafetyResult = {
          kind: 'directive.stateSafetyAction',
          action: 'refreshDiagnostics',
          status: diagnostics.status || 'unknown',
          ok: diagnostics.ok === true,
          checkedAt: diagnostics.checkedAt || null,
          summary: `Storage diagnostics refreshed with ${Array.isArray(diagnostics.issues) ? diagnostics.issues.length : 0} issue(s).`
        };
        await refreshCampaignView();
        return {
          storageDiagnostics: cloneJson(diagnostics),
          stateSafety: cloneJson(lastStateSafetyResult),
          view: viewEnvelope('settings')
        };
      });
    },

    async verifyActiveSave() {
      return run(async () => {
        await ensureInitialized();
        const result = await controller.verifyActiveSave();
        lastStateSafetyResult = {
          ...cloneJson(result),
          action: 'verifyActiveSave',
          summary: result.ok
            ? `Active save ${result.saveId} verified at revision ${result.revision ?? 'unknown'}.`
            : `Active save ${result.saveId} could not be verified.`
        };
        await refreshCampaignView();
        return {
          result: cloneJson(result),
          view: viewEnvelope('settings')
        };
      });
    },

    async settleActiveState() {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        await settleRuntimePersistenceQueue();
        const save = await controller.saveCurrentGame({
          campaignState,
          summary: 'State Safety settled the active campaign state.',
          forceCheckpoint: true
        });
        lastStateSafetyResult = {
          kind: 'directive.stateSafetyAction',
          action: 'settleActiveState',
          status: 'ok',
          ok: true,
          saveId: save.id,
          revision: save.revision,
          updatedAt: save.updatedAt,
          summary: `Active state settled into ${save.id} at revision ${save.revision}.`
        };
        await refreshCampaignView();
        return {
          save: cloneJson(save),
          view: viewEnvelope('settings')
        };
      });
    },

    async exportActiveSave() {
      return run(async () => {
        await ensureInitialized();
        const result = await controller.exportActiveSave();
        lastStateSafetyResult = {
          kind: 'directive.stateSafetyAction',
          action: 'exportActiveSave',
          status: 'ok',
          ok: true,
          saveId: result.saveId,
          exportedAt: result.exportedAt,
          fileName: result.fileName,
          summary: `Prepared ${result.fileName} for export.`
        };
        return {
          ...cloneJson(result),
          jsonText: JSON.stringify(result.saveRecord, null, 2),
          view: viewEnvelope('settings')
        };
      });
    },

    async cleanMissingStorageRecords() {
      return run(async () => {
        await ensureInitialized();
        const cleanup = await controller.cleanMissingStorageRecords();
        lastStateSafetyResult = {
          ...cloneJson(cleanup),
          action: 'cleanMissingStorageRecords',
          summary: cleanup.removed?.length > 0
            ? `Removed ${cleanup.removed.length} missing index reference(s).`
            : 'No missing index records needed cleanup.'
        };
        await refreshCampaignView();
        return {
          cleanup: cloneJson(cleanup),
          view: viewEnvelope('settings')
        };
      });
    },

    async runDirectorTurn({
      playerInput,
      sceneSnapshotOverrides = {},
      turnId = null,
      generateCommandLogSummary = true,
      coreRecallEntries = null
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const assets = activeRuntimeAssets();
        const graphRecord = activeMissionGraphRecord(assets, sceneSnapshotOverrides);
        const resolvedCoreRecallEntries = Array.isArray(coreRecallEntries)
          ? coreRecallEntries
          : await coreRecallEntriesForPromptSync();
        const result = runDirectorTurnRuntime({
          campaignState,
          packageData: assets.packageData,
          graph: graphRecord.graph,
          projection: assets.projection,
          crewDataset: assets.crewDataset,
          shipDataset: assets.shipDataset,
          graphPath: graphRecord.path || campaignState.mission?.activeMissionGraphPath,
          projectionPath: assets.projectionPath,
          turnId: turnId || idFactory('turn'),
          playerInput,
          sceneSnapshotOverrides,
          coreRecallEntries: resolvedCoreRecallEntries
        });
        campaignState = result.campaignState;
        lastDirectorTurn = result.turnPacket;
        lastNarrationResult = null;
        pendingDirectorTurn = null;
        pendingOutcomeReplacement = null;
        const commandLogSummaryResult = deferCommandLogSummaryForTurn({
          turnPacket: result.turnPacket,
          enabled: generateCommandLogSummary,
          reason: 'afterDirectiveNarration'
        });
        activeScreen = 'campaign';
        return {
          coordinatorDiagnostics: cloneJson(result.coordinatorDiagnostics || null),
          turnPacket: cloneJson(result.turnPacket),
          narratorPacket: cloneJson(result.narratorPacket),
          commandLogPacket: cloneJson(result.commandLogPacket),
          commandLogSummaryResult: cloneJson(commandLogSummaryResult),
          campaignState: cloneJson(campaignState),
          view: viewEnvelope('mission')
        };
      });
    },

    async previewDirectorTurn({
      playerInput,
      sceneSnapshotOverrides = {},
      turnId = null,
      arbiterPlan = null,
      coreRecallEntries = null,
      generationRouter = defaultGenerationRouter,
      message = null,
      recentTranscript = [],
      sourceFrameRef = null
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const assets = activeRuntimeAssets();
        const graphRecord = activeMissionGraphRecord(assets, sceneSnapshotOverrides);
        const resolvedCoreRecallEntries = Array.isArray(coreRecallEntries)
          ? coreRecallEntries
          : await coreRecallEntriesForPromptSync();
        const result = await createProvisionalDirectorTurnRuntimeAsync({
          campaignState,
          packageData: assets.packageData,
          graph: graphRecord.graph,
          projection: assets.projection,
          crewDataset: assets.crewDataset,
          shipDataset: assets.shipDataset,
          graphPath: graphRecord.path || campaignState.mission?.activeMissionGraphPath,
          projectionPath: assets.projectionPath,
          turnId: turnId || idFactory('turn'),
          playerInput,
          sceneSnapshotOverrides,
          arbiterPlan,
          coreRecallEntries: resolvedCoreRecallEntries,
          generationRouter,
          message,
          recentTranscript,
          sourceFrameRef
        });
        pendingDirectorTurn = result.turnPacket;
        pendingOutcomeReplacement = null;
        lastNarrationResult = null;
        lastCommandLogSummarySidecarResult = null;
        activeScreen = 'campaign';
        return {
          coordinatorDiagnostics: cloneJson(result.coordinatorDiagnostics || null),
          turnPacket: cloneJson(result.turnPacket),
          provisionalOutcome: cloneJson(result.provisionalOutcome),
          commandBearingPrompt: cloneJson(result.commandBearingPrompt),
          narratorPacket: cloneJson(result.narratorPacket),
          commandLogPacket: cloneJson(result.commandLogPacket),
          campaignState: cloneJson(campaignState),
          view: viewEnvelope('mission')
        };
      });
    },

    async commitProvisionalDirectorTurn({
      spendTrack = null,
      readiedCommandBearing = null,
      confirmWarnings = false,
      confirmedWarningIds = [],
      generateNarration = true,
      generateCommandLogSummary = true,
      deferCommandLogSummary = false,
      arbiterPlan = null,
      provider = defaultNarrationProvider
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        requireObject(pendingDirectorTurn, 'pendingDirectorTurn');
        if (spendTrack) {
          throw new Error('Command Bearing points must be readied before the player message; post-outcome spendTrack commits are disabled.');
        }
        let replacement = pendingOutcomeReplacement ? cloneJson(pendingOutcomeReplacement) : null;
        let replacementLedgerEntry = replacement
          ? (campaignState.turnLedger?.entries || []).find((entry) => entry.outcomeId === replacement.outcomeId) || null
          : null;
        replacementLedgerEntry = assertFreshOutcomeRerunReplacementTarget({ replacement, ledgerEntry: replacementLedgerEntry });
        const replacementCoreCheckpointRef = assertOutcomeReplacementCheckpointBase({ replacement, ledgerEntry: replacementLedgerEntry });
        const baseCampaignState = replacement ? replacement.snapshotBefore : campaignState;
        const beforeCampaignState = cloneJson(baseCampaignState);
        const turnPacketForCommit = arbiterPlan
          ? {
              ...pendingDirectorTurn,
              arbiterPlan: cloneJson(arbiterPlan)
            }
          : pendingDirectorTurn;
        const result = commitProvisionalDirectorTurnRuntime({
          campaignState: baseCampaignState,
          turnPacket: turnPacketForCommit,
          spendTrack,
          readiedCommandBearing,
          confirmWarnings,
          confirmedWarningIds
        });
        let committedCandidateState = result.campaignState;
        const replacementAcceptedAt = replacement ? timestampFromNow(now) : null;
        if (replacement) {
          const replacementTransaction = await beginOutcomeRerunReplacementTransaction({
            ledgerEntry: replacementLedgerEntry,
            outcomeId: replacement.outcomeId,
            replacementTurnId: result.turnPacket?.turnId || result.turnPacket?.id || null,
            replacementOutcomeId: result.turnPacket?.outcomePacket?.id || result.turnPacket?.finalOutcome?.id || null,
            replacementCandidateId: replacement.replacementCandidateId,
            replacementInputHash: replacement.replacementInputHash,
            replacementType: replacement.type || 'rerunOutcome',
            repairDecision: replacement.repairDecision,
            eventTime: replacementAcceptedAt
          });
          replacement = {
            ...replacement,
            replacementTransactionId: replacementTransaction.replacementTransactionId || replacement.replacementTransactionId || null,
            replacementIngressId: replacementTransaction.replacementIngressId || replacement.replacementIngressId || null,
            replacementIngress: replacementTransaction.replacementIngress || replacement.replacementIngress || null,
            replacementSourceFrame: replacementTransaction.replacementSourceFrame || replacement.replacementSourceFrame || null,
            coreTransaction: replacementTransaction.coreTransaction || replacement.coreTransaction || null,
            coreCheckpointRef: replacementCoreCheckpointRef || replacement.coreCheckpointRef || null,
            repairDecision: replacementTransaction.repairDecision || replacement.repairDecision
          };
        }
        const replacementTransactionId = compactString(
          replacement?.replacementTransactionId
          || replacement?.repairDecision?.transactionId
          || replacement?.transactionId
        );
        const replacedTransactionId = compactString(
          replacement?.repairDecision?.replacedTransactionId
          || replacement?.replacedTransactionId
        );
        const coreOutcomeReplacement = replacement && replacementTransactionId
          ? {
              transactionId: replacementTransactionId,
              replacedTransactionId,
              replacementTransactionId,
              idempotencyKey: `outcome-replacement:${replacementTransactionId}:${replacement.outcomeId}:${result.turnPacket.outcomePacket.id}`,
              type: replacement.type || 'rerunOutcome',
              replacedOutcomeId: replacement.outcomeId,
              replacementOutcomeId: result.turnPacket.outcomePacket.id,
              replacedTurnId: replacement.turnId || null,
              replacementTurnId: result.turnPacket.turnId || result.turnPacket.id || null,
              acceptedAt: replacementAcceptedAt,
              repairDecision: cloneJson(replacement.repairDecision || null)
            }
          : null;
        if (replacement && !coreOutcomeReplacement) {
          const error = new Error(`CORE outcome replacement transaction missing for rerun of outcome "${replacement.outcomeId || 'unknown'}".`);
          error.code = 'DIRECTIVE_CORE_OUTCOME_REPLACEMENT_TRANSACTION_REQUIRED';
          error.details = {
            outcomeId: replacement.outcomeId || null,
            repairDecision: cloneJson(replacement.repairDecision || null)
          };
          throw error;
        }
        if (replacement?.replacementIngress) {
          committedCandidateState = recordTurnIngress(committedCandidateState, replacement.replacementIngress, {
            missingCoreWriteMode: 'reject'
          });
        } else {
          committedCandidateState = await ensureDirectRuntimeCoreIngress({
            state: committedCandidateState,
            turnPacket: result.turnPacket,
            playerInput: pendingDirectorTurn?.sceneSnapshot?.playerInput,
            observedAt: timestampFromNow(now)
          });
        }
        const mechanicsIngressId = replacement?.replacementIngressId
          || committedCandidateState.runtimeTracking?.activeIngressId
          || null;
        let mechanicsCheckpoint = null;
        try {
          mechanicsCheckpoint = await ensureTurnCommitCoordinator().checkpointMechanics({
            beforeCampaignState,
            campaignState: committedCandidateState,
            turnPacket: result.turnPacket,
            ingressId: mechanicsIngressId,
            outcomeReplacement: coreOutcomeReplacement
          });
        } catch (error) {
          if (replacement && replacementTransactionId && typeof runtimeCoreTurnStore?.markRecoveryRequired === 'function') {
            try {
              await runtimeCoreTurnStore.markRecoveryRequired(replacementTransactionId, {
                id: `recovery:outcome-rerun:${replacementTransactionId}`,
                status: 'required',
                reason: 'outcome-rerun-checkpoint-failed',
                dependentOutcomeId: result.turnPacket?.outcomePacket?.id || result.turnPacket?.finalOutcome?.id || null,
                allowedActions: ['discardRerunCandidate', 'retryOutcomeRerunCommit'],
                repairDecision: cloneJson(replacement.repairDecision || null),
                sourceMutation: {
                  kind: 'directive.sourceMutation.v1',
                  sourceKind: 'committedOutcomeRerun',
                  eventType: 'outcomeRerunCommitFailed',
                  sourceFrameId: replacement.replacementSourceFrame?.id || replacement.replacementIngress?.sourceFrameId || null,
                  replacementSourceFrameId: replacement.replacementSourceFrame?.id || replacement.replacementIngress?.sourceFrameId || null,
                  observedTextHash: replacement.replacementInputHash || replacement.replacementSourceFrame?.textHash || null,
                  replacementTextPresent: Boolean(replacement.replacementInputHash || replacement.replacementSourceFrame?.textHash)
                },
                idempotencyKey: `outcome-rerun-checkpoint-failed:${replacementTransactionId}:${result.turnPacket?.outcomePacket?.id || 'outcome'}`
              });
            } catch (recoveryError) {
              error.coreRecoveryError = {
                code: recoveryError?.code || null,
                message: recoveryError?.message || String(recoveryError)
              };
            }
          }
          throw error;
        }
        campaignState = mechanicsCheckpoint.campaignState;
        lastMechanicsCheckpointState = cloneJson(mechanicsCheckpoint.campaignState);
        const terminalDecision = await ensureChatNativeServices()?.endConditionService?.evaluateCommittedTurn?.({
          turnPacket: result.turnPacket,
          ingressId: campaignState.runtimeTracking?.activeIngressId || null
        });
        if (terminalDecision?.campaignState) campaignState = terminalDecision.campaignState;
        campaignState = restoreCommittedOutcomeState(
          campaignState,
          lastMechanicsCheckpointState,
          result.turnPacket?.outcomePacket?.id
        );
        lastDirectorTurn = result.turnPacket;
        pendingDirectorTurn = null;
        pendingOutcomeReplacement = null;
        lastNarrationResult = null;
        const commandLogSummaryResult = deferCommandLogSummaryForTurn({
          turnPacket: result.turnPacket,
          enabled: generateCommandLogSummary,
          reason: deferCommandLogSummary ? 'postVisibleResponse' : 'afterDirectiveNarration'
        });
        activeScreen = 'campaign';
        const narrationResult = generateNarration
          ? await generateNarrationForLastTurnNow({
              provider,
              scheduleDeferredCommandLogSummary: !deferCommandLogSummary
            })
          : null;
        return {
          coordinatorDiagnostics: {
            continuityProjection: cloneJson(result.turnPacket?.provenance?.continuityProjection || null)
          },
          turnPacket: cloneJson(result.turnPacket),
          commandBearingSpend: cloneJson(result.commandBearingSpend),
          narratorPacket: cloneJson(result.narratorPacket),
          commandLogPacket: cloneJson(result.commandLogPacket),
          commandLogSummaryResult: cloneJson(commandLogSummaryResult),
          mechanicsCheckpoint: cloneJson(mechanicsCheckpoint),
          terminalDecision: cloneJson(terminalDecision || null),
          narrationResult: cloneJson(narrationResult),
          autosave: cloneJson(narrationResult?.autosave || null),
          campaignState: cloneJson(campaignState),
          view: viewEnvelope('mission')
        };
      });
    },

    async discardProvisionalDirectorTurn() {
      return run(async () => {
        await ensureInitialized();
        pendingDirectorTurn = null;
        pendingOutcomeReplacement = null;
        lastCommandLogSummarySidecarResult = null;
        return viewEnvelope('mission');
      });
    },

    async previewOutcomeReplacement({
      outcomeId,
      playerInput,
      turnId = null,
      arbiterPlan = null,
      type = 'rerunOutcome',
      generationRouter = defaultGenerationRouter
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const id = requireNonEmptyString(outcomeId, 'outcomeId');
        campaignState = await stateWithCoreProjectionFreshnessEvidence(campaignState);
        const ledgerEntry = (campaignState.turnLedger?.entries || []).find((entry) => entry.outcomeId === id);
        if (!ledgerEntry) {
          throw new Error(`Cannot rerun unknown outcome "${id}"`);
        }
        const checkpointSnapshot = await loadOutcomeRerunCheckpointSnapshot({
          storageAdapter,
          state: campaignState,
          controller,
          ledgerEntry
        });
        const repair = ensureChatNativeServices()?.repairRuntime || null;
        const authorizeRerun = repair?.authorizeRerunBranch || repair?.evaluateOutcomeRerunActuation;
        let rerunDecision = typeof authorizeRerun === 'function'
          ? authorizeRerun.call(repair, {
            outcomeId: id,
            requestedType: type,
            ledgerEntry: compactOutcomeRerunLedgerRef(ledgerEntry, {
              snapshotPresent: Boolean(checkpointSnapshot?.snapshot),
              snapshotSourceKind: checkpointSnapshot?.sourceKind || null,
              coreCheckpointRef: checkpointSnapshot?.coreCheckpointRef || null
            }),
            eventTime: timestampFromNow(now)
          })
          : {
              kind: 'directive.repairOutcomeRerunActuationDecision.v1',
              eventType: 'outcomeRerunRequested',
              sourceKind: 'committedOutcome',
              authorized: false,
              action: 'blockOutcomeRerun',
              reason: 'repair-rerun-authority-unavailable',
              deniedReason: 'repair-rerun-authority-unavailable',
              outcomeId: id,
              replacementType: type,
              mechanicsRerunAuthorized: false,
              normalTurnAllowed: false
          };
        if (rerunDecision.authorized !== true) {
          const error = new Error(`REPAIR did not authorize rerun for outcome "${id}".`);
          error.code = 'DIRECTIVE_REPAIR_RERUN_NOT_AUTHORIZED';
          error.details = {
            outcomeId: id,
            decision: cloneJson(rerunDecision)
          };
          throw error;
        }
        const snapshotBefore = cloneJson(checkpointSnapshot?.snapshot);
        const assets = activeRuntimeAssets();
        const graphRecord = activeMissionGraphRecord(assets, {
          activeMissionGraphId: snapshotBefore?.mission?.activeMissionGraphId
        });
        const replacementTurnId = turnId || idFactory('turn-rerun');
        const replacementCandidateId = idFactory('rerun-candidate');
        const replacementInputHash = hashStableJson({
          replacementInput: String(playerInput || ''),
          outcomeId: id,
          replacementTurnId,
          type
        });
        const coreRecallEntries = await coreRecallEntriesForPromptSync();
        const result = await createProvisionalDirectorTurnRuntimeAsync({
          campaignState: snapshotBefore,
          packageData: assets.packageData,
          graph: graphRecord.graph,
          projection: assets.projection,
          crewDataset: assets.crewDataset,
          shipDataset: assets.shipDataset,
          graphPath: graphRecord.path || snapshotBefore.mission?.activeMissionGraphPath,
          projectionPath: assets.projectionPath,
          turnId: replacementTurnId,
          playerInput,
          arbiterPlan,
          coreRecallEntries,
          generationRouter,
          message: { text: playerInput },
          recentTranscript: []
        });
        pendingOutcomeReplacement = {
          type,
          outcomeId: id,
          turnId: ledgerEntry.turnId || null,
          replacementCandidateId,
          replacementInputHash,
          replacedTransactionId: rerunDecision.replacedTransactionId || null,
          snapshotBefore,
          coreCheckpointRef: cloneJson(checkpointSnapshot?.coreCheckpointRef || null),
          snapshotSourceKind: checkpointSnapshot?.sourceKind || null,
          repairDecision: cloneJson(rerunDecision),
          previewCreatedAt: timestampFromNow(now)
        };
        pendingDirectorTurn = redactRerunPreviewProjection({
          ...result.turnPacket,
          replacementForOutcomeId: id,
          replacementType: type,
          replacementRepairDecision: cloneJson(rerunDecision)
        }, {
          rawInput: playerInput,
          inputHash: replacementInputHash
        });
        lastCommandLogSummarySidecarResult = null;
        activeScreen = 'campaign';
        return {
          turnPacket: cloneJson(pendingDirectorTurn),
          provisionalOutcome: redactRerunPreviewProjection(result.provisionalOutcome, {
            rawInput: playerInput,
            inputHash: replacementInputHash
          }),
          commandBearingPrompt: redactRerunPreviewProjection(result.commandBearingPrompt, {
            rawInput: playerInput,
            inputHash: replacementInputHash
          }),
          narratorPacket: redactRerunPreviewProjection(result.narratorPacket, {
            rawInput: playerInput,
            inputHash: replacementInputHash
          }),
          commandLogPacket: redactRerunPreviewProjection(result.commandLogPacket, {
            rawInput: playerInput,
            inputHash: replacementInputHash
          }),
          pendingOutcomeReplacement: cloneJson(pendingOutcomeReplacement),
          campaignState: cloneJson(campaignState),
          view: viewEnvelope('mission')
        };
      });
    },

    async deleteCommittedOutcome({ outcomeId } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const id = requireNonEmptyString(outcomeId, 'outcomeId');
        if (typeof runtimeCoreTurnStore?.readProjections === 'function') {
          try {
            const projections = await runtimeCoreTurnStore.readProjections();
            if (isObject(projections?.turnLedger)) {
              campaignState = {
                ...campaignState,
                turnLedger: mergeCoreTurnLedgerProjection(campaignState.turnLedger, projections.turnLedger),
                directiveRuntimeEvidence: {
                  ...cloneJson(campaignState.directiveRuntimeEvidence || {}),
                  coreStoreReadProjections: coreProjectionFreshnessEvidence(projections, campaignState)
                    || cloneJson(campaignState.directiveRuntimeEvidence?.coreStoreReadProjections || null)
                }
              };
            }
          } catch {
            // Delete validation below still fails closed if CORE projection hydration is unavailable.
          }
        }
        const ledgerEntry = (campaignState.turnLedger?.entries || []).find((entry) => entry.outcomeId === id);
        if (!ledgerEntry) {
          const error = new Error(`Cannot delete unknown outcome "${id}"`);
          error.code = 'DIRECTIVE_DELETE_OUTCOME_NOT_FOUND';
          error.details = { outcomeId: id };
          throw error;
        }
        const transactionId = compactString(ledgerEntry.coreTransactionId || ledgerEntry.transactionId);
        if (!transactionId) {
          const error = new Error(`CORE transaction is required before deleting committed outcome "${id}".`);
          error.code = 'DIRECTIVE_CORE_DELETE_OUTCOME_TRANSACTION_REQUIRED';
          error.details = { outcomeId: id };
          throw error;
        }
        try {
          if (typeof runtimeCoreTurnStore?.getTransaction !== 'function') {
            throw new Error('CORE transaction reader is unavailable.');
          }
          await runtimeCoreTurnStore.getTransaction(transactionId);
        } catch (cause) {
          const error = new Error(`CORE transaction is required before deleting committed outcome "${id}".`);
          error.code = 'DIRECTIVE_CORE_DELETE_OUTCOME_TRANSACTION_REQUIRED';
          error.details = {
            outcomeId: id,
            transactionId,
            reason: 'core-transaction-not-found'
          };
          error.cause = cause;
          throw error;
        }
        const ledgerCoreCheckpointRef = coreCheckpointRefFromLedgerEntry(ledgerEntry);
        if (!ledgerCoreCheckpointRef) {
          const error = new Error(`CORE checkpoint ref is required before deleting committed outcome "${id}".`);
          error.code = 'DIRECTIVE_REPAIR_DELETE_OUTCOME_CORE_CHECKPOINT_REQUIRED';
          error.details = { outcomeId: id, transactionId };
          throw error;
        }
        const checkpointSnapshot = await loadOutcomeRerunCheckpointSnapshot({
          storageAdapter,
          state: campaignState,
          controller,
          ledgerEntry
        });
        const restoreSnapshot = checkpointSnapshot?.snapshot;
        if (ledgerEntry.snapshotBeforeRetained !== true || !isObject(restoreSnapshot)) {
          const error = new Error(`A retained turn save history snapshot or CORE checkpoint artifact is required before deleting committed outcome "${id}".`);
          error.code = 'DIRECTIVE_REPAIR_DELETE_OUTCOME_RETAINED_SNAPSHOT_REQUIRED';
          error.details = { outcomeId: id, transactionId };
          throw error;
        }
        const restoreRevision = Number(
          restoreSnapshot?.runtimeTracking?.revision
          ?? restoreSnapshot?.runtimeTracking?.stateRevision
          ?? checkpointSnapshot?.sourceRevision
          ?? ledgerCoreCheckpointRef?.sourceRevision
        );
        if (!Number.isFinite(restoreRevision)) {
          const error = new Error(`REPAIR restore revision is required before deleting committed outcome "${id}".`);
          error.code = 'DIRECTIVE_REPAIR_DELETE_OUTCOME_RESTORE_REVISION_REQUIRED';
          error.details = { outcomeId: id, transactionId };
          throw error;
        }
        const repair = ensureChatNativeServices()?.repairRuntime || null;
        const authorizeDeleteRollback = repair?.evaluateCommittedOutcomeDeleteRollbackActuation
          || repair?.evaluateRollbackActuation;
        if (typeof authorizeDeleteRollback !== 'function' || typeof repair?.recordRollbackActuation !== 'function') {
          const error = new Error(`REPAIR rollback authority is required before deleting committed outcome "${id}".`);
          error.code = 'DIRECTIVE_REPAIR_DELETE_OUTCOME_ROLLBACK_UNAVAILABLE';
          error.details = { outcomeId: id, transactionId };
          throw error;
        }
        const eventTime = timestampFromNow(now);
        const recoveryCaseId = `recovery:committed-outcome-delete:${transactionId}:${id}`;
        const sourceMutation = {
          kind: 'directive.sourceMutation.v1',
          sourceKind: 'committedOutcome',
          eventType: 'committedOutcomeDeleted',
          transactionId,
          outcomeId: id,
          turnId: ledgerEntry.turnId || null,
          sourceFrameId: ledgerEntry.sourceFrameId || null,
          preOutcomeRevision: restoreRevision
        };
        const repairDecision = {
          kind: 'directive.repairDecision.v1',
          eventType: 'committedOutcomeDeleted',
          sourceKind: 'committedOutcome',
          action: 'rollbackPending',
          reason: 'committed-outcome-delete-rollback-required',
          transactionId,
          outcomeId: id,
          turnId: ledgerEntry.turnId || null,
          sourceFrameId: ledgerEntry.sourceFrameId || null,
          sourceMutation,
          allowedActions: ['rollbackToPreOutcomeRevision', 'reviewCommittedOutcomeDelete'],
          normalTurnAllowed: false,
          observedAt: eventTime
        };
        let coreRecovery = {
          status: 'planned',
          transactionId,
          recoveryCaseId,
          phase: 'recoveryRequired',
          reason: 'committedOutcomeDeleted',
          decision: repairDecision,
          repairDecision,
          sourceMutation
        };
        const repairProjection = {
          shouldRestoreRevision: true,
          restoreRevision,
          recoveryJournalStatus: 'recoveryRequired'
        };
        const rollbackDecision = authorizeDeleteRollback.call(repair, {
          coreRecovery,
          decision: repairDecision,
          ledgerEntry: {
            coreTransactionId: transactionId,
            transactionId,
            outcomeId: id,
            turnId: ledgerEntry.turnId || null,
            sourceFrameId: ledgerEntry.sourceFrameId || null,
            snapshotBeforeRetained: ledgerEntry.snapshotBeforeRetained === true,
            snapshotSourceKind: checkpointSnapshot?.sourceKind || 'coreStoreV2.checkpoint',
            coreCheckpointRef: checkpointSnapshot?.coreCheckpointRef || ledgerCoreCheckpointRef
          },
          repairProjection,
          sourceMutation,
          eventTime
        });
        if (rollbackDecision?.authorized !== true) {
          const error = new Error(`REPAIR did not authorize rollback before deleting committed outcome "${id}".`);
          error.code = 'DIRECTIVE_REPAIR_DELETE_OUTCOME_ROLLBACK_NOT_AUTHORIZED';
          error.details = {
            outcomeId: id,
            transactionId,
            repairDecision: cloneJson(rollbackDecision || null)
          };
          throw error;
        }
        const recoveryCase = await runtimeCoreTurnStore.markRecoveryRequired(transactionId, {
          id: recoveryCaseId,
          status: 'required',
          phaseAfter: 'recoveryRequired',
          reason: 'committedOutcomeDeleted',
          dependentOutcomeId: id,
          allowedActions: ['rollbackToPreOutcomeRevision', 'reviewCommittedOutcomeDelete'],
          repairDecision,
          sourceMutation,
          observedAt: eventTime,
          idempotencyKey: `committed-outcome-delete:${transactionId}:${id}`
        });
        if ((recoveryCase?.id || recoveryCaseId) !== recoveryCaseId) {
          const error = new Error(`CORE recovery id mismatch before deleting committed outcome "${id}".`);
          error.code = 'DIRECTIVE_CORE_DELETE_OUTCOME_RECOVERY_MISMATCH';
          error.details = {
            outcomeId: id,
            transactionId,
            expectedRecoveryCaseId: recoveryCaseId,
            recoveryCase: cloneJson(recoveryCase || null)
          };
          throw error;
        }
        coreRecovery = {
          ...coreRecovery,
          status: 'recorded',
          recoveryCaseId: recoveryCase?.id || recoveryCaseId,
          phase: recoveryCase?.phase || 'recoveryRequired',
          reason: recoveryCase?.reason || 'committedOutcomeDeleted'
        };
        const rollbackActuation = await repair.recordRollbackActuation({
          coreRecovery,
          rollbackActuation: rollbackDecision,
          repairProjection,
          eventType: 'committedOutcomeDeleted',
          eventTime
        });
        if (rollbackActuation?.status !== 'recorded') {
          const error = new Error(`CORE rollback actuation was not recorded before deleting committed outcome "${id}".`);
          error.code = 'DIRECTIVE_CORE_DELETE_OUTCOME_ROLLBACK_RECORD_REQUIRED';
          error.details = {
            outcomeId: id,
            transactionId,
            rollbackActuation: cloneJson(rollbackActuation || null)
          };
          throw error;
        }
        campaignState = cloneJson(restoreSnapshot);
        pendingDirectorTurn = null;
        pendingOutcomeReplacement = null;
        lastDirectorTurn = null;
        lastNarrationResult = null;
        lastCommandLogSummarySidecarResult = null;
        activeScreen = 'campaign';
        return {
          deletedOutcomeId: id,
          coreRecovery: cloneJson(coreRecovery),
          repairDecision: cloneJson(rollbackDecision),
          rollbackActuation: cloneJson(rollbackActuation),
          campaignState: cloneJson(campaignState),
          view: viewEnvelope('mission')
        };
      });
    },

    async resolveTerminalOutcomeDecision({
      interactionId = null,
      action = 'replayFromCheckpoint',
      frameId = null,
      playerArgument = null,
      resolutionIngressId = null,
      resolutionHostMessageId = null
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        const services = ensureChatNativeServices();
        if (!services?.endConditionService) {
          await refreshCampaignView();
          return {
            ok: false,
            reason: 'chat-native-host-unavailable',
            view: viewEnvelope('mission')
          };
        }
        const result = await services.endConditionService.resolveDecision({
          interactionId,
          action,
          frameId,
          playerArgument,
          resolutionIngressId: compactString(resolutionIngressId),
          resolutionHostMessageId: compactString(resolutionHostMessageId)
        });
        if (result?.campaignState) campaignState = result.campaignState;
        await refreshCampaignView();
        return { ...cloneJson(result), view: viewEnvelope('mission') };
      });
    },

    async postTerminalOutcomeCheckpoint({ interactionId = null } = {}) {
      return run(async () => {
        await ensureInitialized();
        const services = ensureChatNativeServices();
        if (!services?.endConditionService) {
          await refreshCampaignView();
          return {
            ok: false,
            reason: 'chat-native-host-unavailable',
            view: viewEnvelope('mission')
          };
        }
        const result = await services.endConditionService.postCheckpointDecision({ interactionId });
        if (result?.campaignState) campaignState = result.campaignState;
        await refreshCampaignView();
        return { ...cloneJson(result), view: viewEnvelope('mission') };
      });
    },

    async getQuestOpportunities({
      playerIntent = null,
      statuses = ['available', 'offered', 'accepted', 'active', 'delegated'],
      limit = 8
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const assets = activeRuntimeAssets();
        const availability = refreshQuestAvailability(campaignState, assets.packageData, {
          now: () => timestampFromNow(now)
        });
        const stateForView = availability.state;
        return {
          kind: 'directive.openWorldQuestOpportunities',
          changes: cloneJson(availability.changes),
          opportunities: rankQuestOpportunities({
            state: stateForView,
            packageData: assets.packageData,
            playerIntent,
            statuses,
            limit
          }),
          openWorld: openWorldQuestView(stateForView, assets.packageData, { limit }),
          campaignState: cloneJson(campaignState),
          view: viewEnvelope('mission')
        };
      });
    },

    async offerOpenWorldQuest({ questId, reason = 'runtime-quest-offered' } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const assets = activeRuntimeAssets();
        const id = requireNonEmptyString(questId, 'questId');
        const next = offerQuest(campaignState, assets.packageData, id, {
          now: () => timestampFromNow(now),
          reason
        });
        const tracked = await commitOpenWorldMutation(next, {
          source: 'openWorldQuest',
          reason: `Offered open-world quest ${id}.`,
          summary: 'Open-world quest offered.'
        });
        lastOpenWorldActionResult = { kind: 'directive.openWorldQuestOffered', questId: id };
        activeScreen = 'campaign';
        return { ...cloneJson(lastOpenWorldActionResult), campaignState: cloneJson(tracked), view: viewEnvelope('mission') };
      });
    },

    async acceptOpenWorldQuest({ questId, makeForeground = false, reason = 'runtime-quest-accepted' } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const assets = activeRuntimeAssets();
        const id = requireNonEmptyString(questId, 'questId');
        const next = acceptQuest(campaignState, assets.packageData, id, {
          now: () => timestampFromNow(now),
          makeForeground: makeForeground === true,
          reason
        });
        const tracked = await commitOpenWorldMutation(next, {
          source: 'openWorldQuest',
          reason: `Accepted open-world quest ${id}.`,
          summary: 'Open-world quest accepted.'
        });
        lastOpenWorldActionResult = { kind: 'directive.openWorldQuestAccepted', questId: id, foreground: makeForeground === true };
        activeScreen = 'campaign';
        return { ...cloneJson(lastOpenWorldActionResult), campaignState: cloneJson(tracked), view: viewEnvelope('mission') };
      });
    },

    async activateOpenWorldQuest({ questId, reason = 'runtime-quest-activated' } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const assets = activeRuntimeAssets();
        const id = requireNonEmptyString(questId, 'questId');
        const result = chooseForegroundQuest({
          state: campaignState,
          packageData: assets.packageData,
          questId: id,
          now: () => timestampFromNow(now)
        });
        const tracked = await commitOpenWorldMutation(result.state, {
          source: 'openWorldQuest',
          reason: reason || `Activated open-world quest ${id}.`,
          summary: 'Open-world quest activated.',
          eventId: result.event?.id || null
        });
        lastOpenWorldActionResult = { kind: 'directive.openWorldQuestActivated', questId: id, boundary: cloneJson(result.diagnostics || null) };
        activeScreen = 'campaign';
        return { ...cloneJson(lastOpenWorldActionResult), campaignState: cloneJson(tracked), view: viewEnvelope('mission') };
      });
    },

    async pauseOpenWorldQuest({ reason = 'runtime-quest-paused' } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const next = pauseForegroundQuest(campaignState, {
          now: () => timestampFromNow(now),
          reason
        });
        const tracked = await commitOpenWorldMutation(next, {
          source: 'openWorldQuest',
          reason: 'Paused foreground open-world quest.',
          summary: 'Foreground quest paused.'
        });
        lastOpenWorldActionResult = { kind: 'directive.openWorldQuestPaused' };
        activeScreen = 'campaign';
        return { ...cloneJson(lastOpenWorldActionResult), campaignState: cloneJson(tracked), view: viewEnvelope('mission') };
      });
    },

    async runDirectiveAssist({
      action,
      inputText = '',
      generationRouter = defaultGenerationRouter,
      useProvider = true
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        const assets = optionalActiveRuntimeAssets();
        const assistCampaignState = liveCampaignStateForView() || campaignState;
        if (assistCampaignState && assistCampaignState !== campaignState) {
          campaignState = cloneJson(assistCampaignState);
        }
        const stateBefore = gameplayStateFingerprint(campaignState);
        const narrationContext = await resolveDirectiveNarrationContext(runtimeHost, {
          roleId: 'directiveAssist'
        });
        const assistResult = await runDirectiveAssistService({
          action,
          inputText,
          campaignState,
          packageData: assets?.packageData || null,
          crewDataset: assets?.crewDataset || null,
          missionGraph: optionalActiveMissionGraph(assets),
          narrationContext,
          generationRouter,
          useProvider
        });
        const campaignStateMutated = stateBefore !== gameplayStateFingerprint(campaignState);
        lastDirectiveAssistResult = {
          ...cloneJson(assistResult),
          campaignStateMutated,
          committed: false
        };
        return {
          assistResult: cloneJson(lastDirectiveAssistResult),
          campaignStateMutated,
          committed: false,
          campaignState: cloneJson(campaignState),
          view: viewEnvelope(campaignState ? 'mission' : 'campaign')
        };
      });
    },

    async delegateOpenWorldQuest({ questId, actorIds = [], delegatedTo = [], reason = 'runtime-quest-delegated' } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const assets = activeRuntimeAssets();
        const id = requireNonEmptyString(questId, 'questId');
        const assignees = Array.isArray(actorIds) && actorIds.length ? actorIds : delegatedTo;
        const next = delegateQuest(campaignState, assets.packageData, id, assignees, {
          now: () => timestampFromNow(now),
          reason
        });
        const tracked = await commitOpenWorldMutation(next, {
          source: 'openWorldQuest',
          reason: `Delegated open-world quest ${id}.`,
          summary: 'Open-world quest delegated.'
        });
        lastOpenWorldActionResult = { kind: 'directive.openWorldQuestDelegated', questId: id, assignedActorIds: cloneJson(assignees) };
        activeScreen = 'campaign';
        return { ...cloneJson(lastOpenWorldActionResult), campaignState: cloneJson(tracked), view: viewEnvelope('mission') };
      });
    },

    async abandonOpenWorldQuest({ questId, reason = 'runtime-quest-abandoned' } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const assets = activeRuntimeAssets();
        const id = requireNonEmptyString(questId, 'questId');
        const result = abandonQuest(campaignState, assets.packageData, id, {
          now: () => timestampFromNow(now),
          reason
        });
        const tracked = await commitOpenWorldMutation(result.state, {
          source: 'openWorldQuest',
          reason: `Abandoned open-world quest ${id}.`,
          summary: 'Open-world quest abandoned.',
          eventId: result.events?.[0]?.id || null
        });
        lastOpenWorldActionResult = { kind: 'directive.openWorldQuestAbandoned', questId: id, events: cloneJson(result.events || []) };
        activeScreen = 'campaign';
        return { ...cloneJson(lastOpenWorldActionResult), campaignState: cloneJson(tracked), view: viewEnvelope('mission') };
      });
    },

    async travelOpenWorld({ destinationId, reason = 'runtime-travel' } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const assets = activeRuntimeAssets();
        const id = requireNonEmptyString(destinationId, 'destinationId');
        const result = travelBoundary({
          state: campaignState,
          packageData: assets.packageData,
          destinationId: id,
          now: () => timestampFromNow(now)
        });
        const tracked = await commitOpenWorldMutation(result.state, {
          source: 'openWorldTravel',
          reason: reason || `Travelled to ${id}.`,
          summary: 'Open-world travel completed.',
          eventId: result.event?.id || null
        });
        lastOpenWorldActionResult = { kind: 'directive.openWorldTravel', destinationId: id, boundary: cloneJson(result.diagnostics || null) };
        activeScreen = 'campaign';
        return { ...cloneJson(lastOpenWorldActionResult), campaignState: cloneJson(tracked), view: viewEnvelope('mission') };
      });
    },

    async advanceOpenWorldTime({ hours = 1, reason = 'downtime' } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const assets = activeRuntimeAssets();
        const amount = Math.max(0.25, Number(hours) || 1);
        const result = timeAdvanceBoundary({
          state: campaignState,
          packageData: assets.packageData,
          hours: amount,
          reason,
          now: () => timestampFromNow(now)
        });
        const tracked = await commitOpenWorldMutation(result.state, {
          source: 'openWorldTime',
          reason: `Advanced open-world time by ${amount} hour(s).`,
          summary: 'Open-world time advanced.',
          eventId: result.event?.id || null
        });
        lastOpenWorldActionResult = { kind: 'directive.openWorldTimeAdvanced', hours: amount, boundary: cloneJson(result.diagnostics || null) };
        activeScreen = 'campaign';
        return { ...cloneJson(lastOpenWorldActionResult), campaignState: cloneJson(tracked), view: viewEnvelope('mission') };
      });
    },

    async recoverCommandBearingPoint({ recoveryId = null, track } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const recovery = recoverCommandBearing(campaignState.commandBearing || {}, {
          recoveryId: recoveryId || idFactory('command-recovery'),
          track
        });
        campaignState = {
          ...cloneJson(campaignState),
          commandBearing: recovery.commandBearing
        };
        if (sameBoundCampaignState(currentChatScope?.campaignState, campaignState)) {
          currentChatScope = {
            ...currentChatScope,
            campaignState: cloneJson(campaignState)
          };
        }
        return {
          applied: recovery.applied,
          reason: recovery.reason,
          commandBearing: cloneJson(campaignState.commandBearing),
          campaignState: cloneJson(campaignState),
          view: viewEnvelope('settings')
        };
      });
    },

    async readyCommandBearingPoint({ readiedId = null, track } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const result = readyCommandBearingPoint(campaignState.commandBearing || {}, {
          readiedId: readiedId || idFactory('command-bearing-readied'),
          track,
          saveId: campaignState.campaignChatBinding?.saveId || controller?.activeSaveId || '',
          chatId: campaignState.campaignChatBinding?.chatId || currentChatScope?.currentChat?.id || '',
          createdAt: timestampFromNow(now)
        });
        if (result.applied) {
          campaignState = {
            ...cloneJson(campaignState),
            commandBearing: result.commandBearing
          };
          if (sameBoundCampaignState(currentChatScope?.campaignState, campaignState)) {
            currentChatScope = {
              ...currentChatScope,
              campaignState: cloneJson(campaignState)
            };
          }
          await refreshCampaignView();
        }
        return {
          applied: result.applied,
          reason: result.reason,
          commandBearing: cloneJson(campaignState.commandBearing || result.commandBearing),
          campaignState: cloneJson(campaignState),
          view: viewEnvelope('mission')
        };
      });
    },

    async cancelReadiedCommandBearingPoint({ readiedId = null } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const result = cancelReadiedCommandBearingPoint(campaignState.commandBearing || {}, {
          readiedId
        });
        if (result.applied) {
          campaignState = {
            ...cloneJson(campaignState),
            commandBearing: result.commandBearing
          };
          if (sameBoundCampaignState(currentChatScope?.campaignState, campaignState)) {
            currentChatScope = {
              ...currentChatScope,
              campaignState: cloneJson(campaignState)
            };
          }
          await refreshCampaignView();
        }
        return {
          applied: result.applied,
          reason: result.reason,
          commandBearing: cloneJson(campaignState.commandBearing || result.commandBearing),
          campaignState: cloneJson(campaignState),
          view: viewEnvelope('mission')
        };
      });
    },

    async generateNarrationForLastTurn({ provider = defaultNarrationProvider } = {}) {
      return run(async () => {
        await ensureInitialized();
        return generateNarrationForLastTurnNow({ provider });
      });
    },

    async retryNarrationForLastTurn({ provider = defaultNarrationProvider } = {}) {
      return run(async () => {
        await ensureInitialized();
        return generateNarrationForLastTurnNow({ provider });
      });
    }
  };
  return publicApi;
}
