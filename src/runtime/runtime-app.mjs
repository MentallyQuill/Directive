import {
  deleteCommittedOutcome as restoreBeforeCommittedOutcome,
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
import { createCampaignStartController } from './campaign-start-controller.mjs';
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
import { createSourceSettlementService } from './source-settlement-service.mjs';
import {
  createLensPromptScheduler,
  normalizePromptDirtyDomains
} from './lens-prompt-scheduler.mjs';
import {
  buildLensPromptPacket,
  createLensPromptInput,
  lensPromptPacketProjectionSummary
} from './lens-prompt-packet-builder.mjs';
import { createCoreTurnRuntime } from './core-turn-runtime.mjs';
import { campaignOpeningSceneStatus } from './opening-scene-status.mjs';
import {
  createStateDeltaGateway,
  initializeCampaignRuntimeTracking,
  recordRecoveryEvent,
  updateDirectiveResponse
} from './state-delta-gateway.mjs';
import {
  indexRuntimeAssets,
  loadBundledCampaignPackageRecords,
  mergeImportedPackageRecords,
  summarizeRuntimeAssets,
  unwrapProjectionRecord
} from './package-library.mjs';
import {
  createRuntimeModelCallJournal,
  gameplayStateFingerprint
} from './model-call-journal.mjs';
import { createActiveSaveGuard } from './active-save-guard.mjs';
import {
  createCoreStoreV2,
  loadCoreStoreStateV2
} from '../storage/core-store-v2.mjs';
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
import { createCreatorRuntimeService } from './creator-runtime-service.mjs';
import {
  applyOutcomeIntegritySettings,
  buildOutcomeIntegrityEditContext,
  createOutcomeIntegrityRevisionRecord,
  normalizeOutcomeIntegrityMode,
  normalizeOutcomeIntegrityReviewProviderKind,
  normalizeOutcomeIntegritySettings,
  outcomeIntegrityFailureSummary,
  outcomeIntegrityStatusForMessage,
  reviewOutcomeIntegrityEdit,
  validateOutcomeIntegrityProposedEdit
} from './outcome-integrity.mjs';
import { createSceneReconciliationService } from './scene-reconciliation.mjs';
import { createTurnCommitCoordinator } from './turn-commit-coordinator.mjs';
import {
  commitProvisionalDirectorTurnRuntime,
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

const DEFAULT_TURN_SAVE_HISTORY_LIMIT = 20;
const MIN_TURN_SAVE_HISTORY_LIMIT = 2;
const MAX_TURN_SAVE_HISTORY_LIMIT = 60;
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
    value ?? campaignState.settings?.maxTurnSaveHistory ?? campaignState.runtimeTracking?.historyLimit
  );
  const next = initializeCampaignRuntimeTracking(campaignState, { historyLimit: limit });
  const history = Array.isArray(next.runtimeTracking.history)
    ? next.runtimeTracking.history.slice(Math.max(0, next.runtimeTracking.history.length - limit))
    : [];
  next.settings = {
    ...(next.settings || {}),
    maxTurnSaveHistory: limit
  };
  next.runtimeTracking = {
    ...next.runtimeTracking,
    historyLimit: limit,
    history,
    historyIndex: history.length - 1
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
  const runtimeCount = campaignState?.runtimeTracking?.lastCommittedTurn?.sequence;
  if (Number.isFinite(Number(runtimeCount)) && Number(runtimeCount) > 0) return Number(runtimeCount);
  const turnCount = campaignState?.turnLedger?.entries?.length;
  return Number.isFinite(Number(turnCount)) ? Number(turnCount) : 0;
}

function shouldAutosaveStableTurn(campaignState) {
  const interval = normalizeAutosaveEveryMessages(campaignState?.settings?.autosaveEveryMessages);
  const count = committedMessageCount(campaignState);
  return count > 0 && count % interval === 0;
}

function compactString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
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

function stateFreshnessCounters(state = null) {
  const tracking = state?.runtimeTracking || {};
  const ledger = tracking.endConditionLedger || {};
  const responseLedger = Array.isArray(tracking.responseLedger) ? tracking.responseLedger : [];
  const coreProjection = state?.directiveRuntimeEvidence?.coreStoreReadProjections
    || tracking?.directiveRuntimeEvidence?.coreStoreReadProjections
    || null;
  const coreTurnLedgerEntries = Array.isArray(coreProjection?.turnLedger?.entries)
    ? coreProjection.turnLedger.entries.length
    : null;
  const coreIngressLedgerEntries = Array.isArray(coreProjection?.ingressLedger)
    ? coreProjection.ingressLedger.length
    : null;
  const coreResponseLedger = Array.isArray(coreProjection?.responseLedger)
    ? coreProjection.responseLedger
    : null;
  const coreRecoveryJournalEntries = Array.isArray(coreProjection?.recoveryJournal)
    ? coreProjection.recoveryJournal.length
    : null;
  const coreSidecarDiagnostics = Array.isArray(coreProjection?.sidecarDiagnostics)
    ? coreProjection.sidecarDiagnostics.length
    : null;
  const coreAcceptedBackgroundWorkers = Array.isArray(coreProjection?.backgroundBatches)
    ? acceptedBackgroundBatchWorkerCount(coreProjection.backgroundBatches)
    : null;
  return {
    revision: Math.max(0, Number(tracking.revision) || 0),
    mechanicsRevision: Math.max(0, Number(tracking.mechanicsRevision) || 0),
    promptContextRevision: Math.max(0, Number(state?.campaignChatBinding?.promptContextRevision) || 0),
    commandLogEntries: commandLogEntryCount(state),
    turnLedgerEntries: Math.max(countArray(state?.turnLedger?.entries), coreTurnLedgerEntries ?? 0),
    ingressLedgerEntries: Math.max(countArray(tracking.ingressLedger), coreIngressLedgerEntries ?? 0),
    responseLedgerEntries: Math.max(responseLedger.length, coreResponseLedger?.length ?? 0),
    responseLedgerRevision: Math.max(0, Number(tracking.responseLedgerRevision) || 0),
    responseLedgerIntegritySelections: Math.max(
      responseLedger.filter((entry) => entry?.outcomeIntegrity?.selectedRevisionId).length,
      (coreResponseLedger || []).filter((entry) => entry?.outcomeIntegrity?.selectedRevisionId).length
    ),
    recoveryJournalEntries: Math.max(countArray(tracking.recoveryJournal), coreRecoveryJournalEntries ?? 0),
    sidecarJournalEntries: Math.max(
      countArray(tracking.sidecarJournal),
      Number(state?.runtimeResume?.sidecarCount) || 0,
      coreSidecarDiagnostics ?? 0,
      coreAcceptedBackgroundWorkers ?? 0
    ),
    pendingInteractions: countArray(tracking.pendingInteractions),
    endConditionDetections: countArray(ledger.detections),
    endConditionDecisions: countArray(ledger.decisions),
    endConditionBranchRecords: countArray(ledger.branchRecords),
    endConditionContinuationFrames: countArray(ledger.continuationFrames),
    modelCallJournalEntries: countArray(tracking.modelCallJournal)
  };
}

function responseLedgerIntegrityRank(entry = null) {
  return entry?.outcomeIntegrity?.selectedRevisionId ? 1 : 0;
}

function mergeFresherResponseLedgerProjection(candidateState = null, inMemoryState = null) {
  if (!candidateState || !inMemoryState) return candidateState;
  const candidateTracking = candidateState.runtimeTracking || {};
  const memoryTracking = inMemoryState.runtimeTracking || {};
  const candidateLedger = Array.isArray(candidateTracking.responseLedger) ? candidateTracking.responseLedger : [];
  const memoryLedger = Array.isArray(memoryTracking.responseLedger) ? memoryTracking.responseLedger : [];
  if (!memoryLedger.length) return candidateState;
  if (!candidateLedger.length) {
    return {
      ...cloneJson(candidateState),
      runtimeTracking: {
        ...cloneJson(candidateTracking),
        responseLedger: cloneJson(memoryLedger),
        responseLedgerRevision: Math.max(
          Number(candidateTracking.responseLedgerRevision) || 0,
          Number(memoryTracking.responseLedgerRevision) || 0
        )
      }
    };
  }
  const memoryByKey = new Map();
  for (const entry of memoryLedger) {
    const keys = [compactString(entry?.id), compactString(entry?.hostMessageId)].filter(Boolean);
    for (const key of keys) memoryByKey.set(key, entry);
  }
  let changed = false;
  const responseLedger = candidateLedger.map((entry) => {
    const memory = memoryByKey.get(compactString(entry?.id)) || memoryByKey.get(compactString(entry?.hostMessageId));
    if (!memory) return entry;
    if (responseLedgerIntegrityRank(memory) <= responseLedgerIntegrityRank(entry)) return entry;
    changed = true;
    return {
      ...entry,
      editedAt: memory.editedAt || entry.editedAt || null,
      replacementText: memory.replacementText ?? entry.replacementText ?? null,
      outcomeIntegrity: cloneJson(memory.outcomeIntegrity || null)
    };
  });
  if (!changed) return candidateState;
  return {
    ...cloneJson(candidateState),
    runtimeTracking: {
      ...cloneJson(candidateTracking),
      responseLedger,
      responseLedgerRevision: Math.max(
        Number(candidateTracking.responseLedgerRevision) || 0,
        Number(memoryTracking.responseLedgerRevision) || 0
      )
    }
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
  if (inMemory.turnLedgerEntries > candidate.turnLedgerEntries) return true;
  if (candidate.turnLedgerEntries > inMemory.turnLedgerEntries) return false;
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

  if (inMemory.revision > candidate.revision) return true;
  if (inMemory.revision < candidate.revision) return false;
  if (inMemory.mechanicsRevision > candidate.mechanicsRevision) return true;
  if (inMemory.mechanicsRevision < candidate.mechanicsRevision) return false;

  return inMemory.modelCallJournalEntries > candidate.modelCallJournalEntries && !hasMaterialRegression;
}

function hasTurnLedgerOutcome(state = null, outcomeId = null) {
  const id = compactString(outcomeId);
  if (!id) return false;
  return (state?.turnLedger?.entries || []).some((entry) => entry?.outcomeId === id);
}

function commandLogEntryOutcomeId(entry = null) {
  return compactString(entry?.sourceOutcomeId || entry?.outcomeId || entry?.id);
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

  const checkpointTracking = checkpointState.runtimeTracking || {};
  if (checkpointTracking.lastCommittedTurn?.outcomeId === id) {
    next.runtimeTracking = {
      ...(next.runtimeTracking || {}),
      lastCommittedTurn: cloneJson(checkpointTracking.lastCommittedTurn)
    };
  }
  const currentHistory = Array.isArray(next.runtimeTracking?.history) ? cloneJson(next.runtimeTracking.history) : [];
  const currentOutcomeSources = new Set(currentHistory
    .filter((entry) => compactString(entry?.outcomeId) === id)
    .map((entry) => compactString(entry?.source)));
  const checkpointHistory = Array.isArray(checkpointTracking.history) ? checkpointTracking.history : [];
  const missingHistory = checkpointHistory.filter((entry) => (
    compactString(entry?.outcomeId) === id
    && !currentOutcomeSources.has(compactString(entry?.source))
  ));
  if (missingHistory.length) {
    next.runtimeTracking = {
      ...(next.runtimeTracking || {}),
      history: [
        ...currentHistory,
        ...missingHistory.map(cloneJson)
      ]
    };
  }
  return next;
}

export const __directiveRuntimeAppTestHooks = Object.freeze({
  createPlayerCharacterView,
  findMissionComponentSourceMessageMatch,
  stateFreshnessCounters,
  restoreCommittedOutcomeState,
  shouldPreferInMemoryCampaignState
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
  now = null
} = {}) {
  const runtimeHost = host ? assertDirectiveHost(host) : null;
  const storageAdapter = adapter || runtimeHost?.storage;
  let campaignState = null;
  function forgeSourceCurrentForRuntime(payload = {}) {
    const tracked = campaignState ? initializeCampaignRuntimeTracking(campaignState) : null;
    const ledger = tracked?.runtimeTracking?.ingressLedger || [];
    const sourceFrameId = compactString(payload.sourceFrameRef?.id || payload.sourceFrameRef?.sourceFrameId);
    const sourceToken = compactString(payload.sourceToken);
    const ingress = [...ledger].reverse().find((entry) => (
      (payload.transactionId && entry.coreTransactionId === payload.transactionId)
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
    if (payload.transactionId && ingress.coreTransactionId && ingress.coreTransactionId !== payload.transactionId) {
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
    const ingress = (tracked.runtimeTracking?.ingressLedger || [])
      .find((entry) => entry?.id === targetIngressId) || null;
    if (!ingress?.coreTransactionId) return null;
    const explicitBackgroundTarget = metadata.coreDiagnosticTarget === 'advisoryEnrichment'
      || (event?.roleId === 'missionDirectorAdvisor' && requestedIngressId);
    if (!explicitBackgroundTarget && !['classifying', 'classified'].includes(compactString(ingress.status))) return null;
    return {
      transactionId: ingress.coreTransactionId,
      ingressId: ingress.id || null,
      sourceFrameId: ingress.sourceFrameId || ingress.sourceFrame?.id || null,
      hostMessageId: ingress.hostMessageId || null
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
  let runtimeSettingsOverlay = null;
  let programmaticChatOpenSuppression = null;
  let lastError = null;
  let chatNativeServices = null;
  let durabilityCoordinator = null;
  let lensPromptScheduler = null;
  let runtimeForgeCoordinator = null;
  let publicApi = null;
  let runtimePersistQueue = Promise.resolve();
  let commandLogSummaryQueue = Promise.resolve();
  let commandLogSummaryDiagnosticQueue = Promise.resolve();
  let commandLogSummaryPendingCount = 0;
  let deferredCommandLogSummaryRequest = null;
  let postCommitConversationQueue = Promise.resolve();
  let postCommitConversationDiagnosticQueue = Promise.resolve();
  let postCommitConversationPendingCount = 0;
  let lastPostCommitConversationResult = null;
  let advisoryEnrichmentQueue = Promise.resolve();
  let advisoryEnrichmentDiagnosticQueue = Promise.resolve();
  let advisoryEnrichmentPendingCount = 0;
  let lastAdvisoryEnrichmentResult = null;
  let terminalCheckpointSettlementQueue = Promise.resolve();
  let terminalCheckpointDiagnosticQueue = Promise.resolve();
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
  }

  async function ensureInitialized() {
    if (initialized) return;
    await rebuildPackageLibrary();
    initialized = true;
  }

  async function refreshCampaignView() {
    await ensureInitialized();
    campaignView = await controller.getCampaignView();
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

  function retargetChatScopedIds(value, sourceChatId = null, targetChatId = null) {
    const source = compactString(sourceChatId);
    const target = compactString(targetChatId);
    if (!source || !target || source === target) return cloneJson(value);
    if (Array.isArray(value)) return value.map((entry) => retargetChatScopedIds(entry, source, target));
    if (!value || typeof value !== 'object') return cloneJson(value);
    const next = {};
    for (const [key, entry] of Object.entries(value)) {
      if ((key === 'chatId' || key === 'currentChatId' || key === 'chat_id') && compactString(entry) === source) {
        next[key] = target;
      } else {
        next[key] = retargetChatScopedIds(entry, source, target);
      }
    }
    return next;
  }

  function stateWithSaveBranchChatBinding(state = null, branchBinding = null, sourceBinding = null) {
    if (!state || !branchBinding?.chatId || !branchBinding?.saveId) return state;
    const sourceChatId = sourceBinding?.chatId || state.campaignChatBinding?.chatId || null;
    let next = retargetChatScopedIds(state, sourceChatId, branchBinding.chatId);
    next = {
      ...next,
      campaignChatBinding: {
        ...(next.campaignChatBinding || {}),
        ...cloneJson(branchBinding),
        campaignId: compactString(branchBinding.campaignId) || compactString(next.campaign?.id) || null,
        saveId: compactString(branchBinding.saveId),
        chatId: compactString(branchBinding.chatId),
        status: compactString(branchBinding.status) || 'bound'
      }
    };
    return normalizeCampaignTimeForRuntime(next, {
      reason: 'save-as-branch-chat-binding'
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
    async readProjections() {
      const store = await ensureActiveCoreTurnStore();
      return typeof store?.readProjections === 'function' ? store.readProjections() : null;
    },
    async loadHead() {
      const store = await ensureActiveCoreTurnStore();
      return typeof store?.loadHead === 'function' ? store.loadHead() : null;
    }
  };

  async function settleInternalForgeBackgroundBatch(prepared = null, {
    sourceFrameId = null,
    internalOwner = null,
    providerOwner = 'forge-internal',
    flushLens = false
  } = {}) {
    if (!prepared?.transactionId || !prepared?.bundle) return null;
    if (typeof runtimeForgeCoordinator?.settleInternalBackgroundBatch === 'function') {
      return runtimeForgeCoordinator.settleInternalBackgroundBatch({
        transactionId: prepared.transactionId,
        bundle: prepared.bundle,
        sourceFrameRef: sourceFrameId ? { id: sourceFrameId } : prepared.bundle.sourceFrameRef,
        internalOwner,
        providerOwner,
        flushLens
      });
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
      observeExternalPromptEnvironment: async () => null
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
    if (promptFrame?.externalPromptEnvironmentRef?.hash) return cloneJson(promptFrame.externalPromptEnvironmentRef);
    try {
      const inspected = runtimeHost?.prompt?.inspect?.() || null;
      if (inspected?.externalPromptEnvironmentRef?.hash) {
        return cloneJson(inspected.externalPromptEnvironmentRef);
      }
    } catch {
      return null;
    }
    return null;
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
    const domainVersionVector = {
      revision: freshness.revision,
      mechanicsRevision: freshness.mechanicsRevision,
      commandLogEntries: freshness.commandLogEntries,
      turnLedgerEntries: freshness.turnLedgerEntries,
      ingressLedgerEntries: freshness.ingressLedgerEntries,
      responseLedgerEntries: freshness.responseLedgerEntries,
      responseLedgerRevision: freshness.responseLedgerRevision,
      responseLedgerIntegritySelections: freshness.responseLedgerIntegritySelections,
      recoveryJournalEntries: freshness.recoveryJournalEntries,
      sidecarJournalEntries: freshness.sidecarJournalEntries,
      pendingInteractions: freshness.pendingInteractions,
      endConditionDetections: freshness.endConditionDetections,
      endConditionDecisions: freshness.endConditionDecisions,
      endConditionBranchRecords: freshness.endConditionBranchRecords,
      endConditionContinuationFrames: freshness.endConditionContinuationFrames
    };
    return {
      campaignId: compactString(state?.campaign?.id || binding?.campaignId),
      saveId: compactString(binding?.saveId || controller?.activeSaveId),
      chatId: compactString(binding?.chatId),
      branchId: compactString(binding?.branchId) || 'main',
      mechanicsRevision: freshness.mechanicsRevision,
      runtimeRevision: freshness.revision,
      domainVersionVector,
      policyHash: hashStableJson({
        simulationMode: state?.settings?.simulationMode || null,
        campaignStatus: state?.campaign?.status || null,
        promptContract: 'directive-lens-runtime-v1'
      }),
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
      return {
        ...(recallIndexRevision ? { recallIndexRevision } : {}),
        ...(sceneSealRevision ? { sceneSealRevision } : {}),
        ...(pressureArcDigestRevision ? { pressureArcDigestRevision } : {})
      };
    } catch (error) {
      console.warn('[Directive] Failed to read CORE prompt cache inputs:', error);
      return {};
    }
  }

  function coreProjectionFreshnessEvidence(projections = null) {
    if (!projections || typeof projections !== 'object') return null;
    return {
      kind: 'directive.coreStoreReadProjections.v1',
      turnLedger: {
        entries: cloneJson(Array.isArray(projections.turnLedger?.entries) ? projections.turnLedger.entries : [])
      },
      ingressLedger: cloneJson(Array.isArray(projections.ingressLedger) ? projections.ingressLedger : []),
      responseLedger: cloneJson(Array.isArray(projections.responseLedger) ? projections.responseLedger : []),
      recoveryJournal: cloneJson(Array.isArray(projections.recoveryJournal) ? projections.recoveryJournal : []),
      sidecarDiagnostics: cloneJson(Array.isArray(projections.sidecarDiagnostics) ? projections.sidecarDiagnostics : []),
      backgroundBatches: cloneJson(Array.isArray(projections.backgroundBatches) ? projections.backgroundBatches : [])
    };
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
      const evidence = coreProjectionFreshnessEvidence(await runtimeCoreTurnStore.readProjections());
      if (!evidence) return state;
      return {
        ...cloneJson(state),
        directiveRuntimeEvidence: {
          ...cloneJson(state.directiveRuntimeEvidence || {}),
          coreStoreReadProjections: evidence
        }
      };
    } catch (error) {
      console.warn('[Directive] Failed to read CORE freshness projections:', error);
      return state;
    }
  }

  async function refreshRuntimePersistenceAfterCoreDiagnostics(reason = 'Runtime CORE diagnostics refreshed.') {
    if (!campaignState) return null;
    const coreCount = await coreSidecarResumeCount();
    if (!Number.isFinite(coreCount) || coreCount <= 0) return null;
    const currentCount = stateFreshnessCounters(campaignState).sidecarJournalEntries;
    if (coreCount <= currentCount) return null;
    campaignState = {
      ...cloneJson(campaignState),
      runtimeResume: {
        ...cloneJson(campaignState.runtimeResume || {}),
        sidecarCount: coreCount
      }
    };
    return persistRuntimeCampaignState(campaignState, reason);
  }

  async function loadCampaignStateForSessionSave(saveId = null, binding = null) {
    const id = compactString(saveId);
    if (!id) return null;
    await settleRuntimePersistenceQueue();
    const loadedBinding = bindingFromState(campaignState);
    const activeSaveId = compactString(controller?.activeSaveId);
    if (campaignState && loadedBinding?.saveId === id && (!activeSaveId || activeSaveId === id)) {
      return campaignState;
    }
    campaignState = stateWithLoadedSaveBinding(
      applyRuntimeSettings(await controller.loadGame({ saveId: id })),
      id,
      binding
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
    return {
      binding: cloneJson(state.campaignChatBinding || null),
      activation: cloneJson(state.activationJournal || null),
      openingScene: campaignOpeningSceneStatus(state),
      tracking: state.runtimeTracking ? {
        revision: state.runtimeTracking.revision || 0,
        lastStableRevision: state.runtimeTracking.lastStableRevision || 0,
        historyDepth: state.runtimeTracking.history?.length || 0,
        ingressCount: state.runtimeTracking.ingressLedger?.length || 0,
        responseCount: state.runtimeTracking.responseLedger?.length || 0,
        responseLedgerRevision: state.runtimeTracking.responseLedgerRevision || 0,
        responseLedgerIntegritySelections: (state.runtimeTracking.responseLedger || [])
          .filter((entry) => entry?.outcomeIntegrity?.selectedRevisionId).length,
        sidecarCount: freshness.sidecarJournalEntries,
        modelCallCount: state.runtimeTracking.modelCallJournal?.length || 0,
        lastDelta: cloneJson(state.runtimeTracking.lastDelta || null),
        lastCommittedTurn: cloneJson(state.runtimeTracking.lastCommittedTurn || null),
        latestModelCall: cloneJson((state.runtimeTracking.modelCallJournal || []).at(-1) || null)
      } : null,
      prompt: cloneJson(state.campaignChatBinding?.promptContext || null),
      manualSaveGuard: cloneJson(saveGuard || null),
      pendingInteractions: cloneJson(state.runtimeTracking?.pendingInteractions || []),
      recovery: cloneJson(state.runtimeTracking?.recoveryJournal || []),
      modelCalls: cloneJson(state.runtimeTracking?.modelCallJournal || []),
      sceneReconciliation: cloneJson(state.runtimeTracking?.sceneReconciliation || null)
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
    const sessions = buildCampaignSessions();
    return {
      sessions,
      visibleSessions: sessions.filter((session) => !session.hidden),
      hiddenSessionKeys: uiPreferences.hiddenSessionKeys(),
      counts: {
        sessions: sessions.length,
        visible: sessions.filter((session) => !session.hidden).length,
        hidden: sessions.filter((session) => session.hidden).length
      }
    };
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
        resolvedState = await loadCampaignStateForSessionSave(save.id, bindingFromSave(save) || normalizedBinding(metadata || null));
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
      playerSafeCampaign: createPlayerSafeCampaignProjection({
        campaignState: renderedCampaignState,
        packageData: renderedAssets?.packageData || null,
        crewDataset: renderedAssets?.crewDataset || null
      }),
      loadedPlayerSafeCampaign: createPlayerSafeCampaignProjection({
        campaignState,
        packageData: loadedAssets?.packageData || null,
        crewDataset: loadedAssets?.crewDataset || null
      }),
      commandBearingPlayerView: cloneJson(commandBearingPlayerView),
      loadedCommandBearingPlayerView: cloneJson(loadedCommandBearingPlayerView),
      playerCharacterView: cloneJson(playerCharacterView),
      loadedPlayerCharacterView: cloneJson(loadedPlayerCharacterView),
      chatNative: chatNativeViewForState(renderedCampaignState, renderedSaveGuard),
      loadedChatNative: chatNativeViewForState(campaignState, lastManualSaveGuard),
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
      pendingDirectorTurn: cloneJson(pendingDirectorTurn),
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
        campaignState = recordRecoveryEvent(initializeCampaignRuntimeTracking(campaignState), {
          id: `recovery:narration-missing-outcome:${outcomeId || 'unknown'}`,
          type: 'narrationBookkeepingMissingOutcome',
          status: 'open',
          outcomeId: outcomeId || null,
          recordedAt: timestampFromNow(now),
          details: {
            turnId: lastDirectorTurn?.turnId || lastDirectorTurn?.id || null,
            error: cloneJson(failure),
            fallbackResponseAvailable: true
          }
        });
          await persistRuntimeCampaignState(campaignState, `Recorded narration bookkeeping recovery for ${outcomeId || 'unknown outcome'}.`);
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
    const ledger = Array.isArray(campaignState?.runtimeTracking?.ingressLedger)
      ? campaignState.runtimeTracking.ingressLedger
      : [];
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

  function runtimeResponseForContext(context = {}) {
    const ledger = Array.isArray(campaignState?.runtimeTracking?.responseLedger)
      ? campaignState.runtimeTracking.responseLedger
      : [];
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
    const append = commandLogSummaryDiagnosticQueue
      .catch(() => null)
      .then(() => runtimeCoreTurnStore.appendDiagnostics(target.transactionId, event))
      .catch(() => null);
    commandLogSummaryDiagnosticQueue = append.then(() => null, () => null);
    return cloneJson(event);
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
        internalOwner: 'commandLogSummary'
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
    if (guard.responseHostMessageId && !response) return false;
    if (response && staleStatuses.has(compactString(response.status))) return false;
    if (response?.invalidatedAt || response?.deletedAt || response?.editedAt || response?.invalidationType) return false;
    if (guard.responseId && compactString(response?.id) !== guard.responseId) return false;
    if (guard.responseHostMessageId && compactString(response?.hostMessageId) !== guard.responseHostMessageId) return false;
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

  function queuePostCommitConversationCoreDiagnostic(guard = null, status = 'queued', details = {}) {
    const event = postCommitConversationDiagnosticEvent(guard, status, details);
    if (!event) return null;
    const target = postCommitConversationCoreTargetForGuard(guard);
    if (!target) return null;
    const append = postCommitConversationDiagnosticQueue
      .catch(() => null)
      .then(() => runtimeCoreTurnStore.appendDiagnostics(target.transactionId, event))
      .catch(() => null);
    postCommitConversationDiagnosticQueue = append.then(() => null, () => null);
    return cloneJson(event);
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
        internalOwner: 'narrativeThreadDirector'
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
          await postCommitConversationDiagnosticQueue;
          backgroundBatchCommitted = await commitPostCommitConversationCoreBackgroundBatch(sourceGuard, final);
        }
        if (!backgroundBatchCommitted) {
          queuePostCommitConversationCoreDiagnostic(sourceGuard, final.ok === false ? 'failed' : 'applied', {
            reason,
            result: final
          });
        }
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
        if (!stale) {
          campaignState = recordRecoveryEvent(initializeCampaignRuntimeTracking(campaignState), {
            id: `recovery:post-commit-conversation:${sourceGuard.outcomeId || sourceGuard.turnId || sourceGuard.ingressId || 'unknown'}`,
            type: 'postCommitConversationFailed',
            status: 'open',
            ingressId: sourceGuard.ingressId || null,
            outcomeId: sourceGuard.outcomeId || null,
            recordedAt: timestampFromNow(now),
            details: {
              turnId: sourceGuard.turnId || null,
              error: { message: error?.message || String(error), code: error?.code || null }
            }
          });
          await persistRuntimeCampaignState(campaignState, `Recorded post-commit conversation recovery issue for ${sourceGuard.outcomeId || 'unknown outcome'}.`);
        }
        queuePostCommitConversationCoreDiagnostic(sourceGuard, stale ? 'stale' : 'failed', {
          reason,
          result: lastPostCommitConversationResult,
          error
        });
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
      sourceFrameId: compactString(ingress?.sourceFrameId || ingress?.sourceFrame?.id),
      coreTransactionId: compactString(ingress?.coreTransactionId),
      playerTextHash: compactString(payload.playerTextHash),
      ingressTextHash: compactString(ingress?.textHash),
      fallbackAdvisoryHash: compactString(payload.fallbackAdvisoryHash),
      scheduledAt: timestampFromNow(now)
    };
  }

  function advisoryEnrichmentGuardCurrent(guard = null) {
    if (!guard) return true;
    if (guard.campaignId && compactString(campaignState?.campaign?.id) !== guard.campaignId) return false;
    const binding = bindingFromState(campaignState);
    if (guard.saveId && compactString(binding?.saveId) !== guard.saveId) return false;
    if (guard.chatId && compactString(binding?.chatId) !== guard.chatId) return false;
    const ingress = runtimeIngressForContext({ ingressId: guard.ingressId });
    if (guard.ingressId && !ingress) return false;
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
    const transactionId = compactString(guard.coreTransactionId || ingress?.coreTransactionId);
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
    const append = advisoryEnrichmentDiagnosticQueue
      .catch(() => null)
      .then(() => runtimeCoreTurnStore.appendDiagnostics(target.transactionId, event))
      .catch(() => null);
    advisoryEnrichmentDiagnosticQueue = append.then(() => null, () => null);
    return cloneJson(event);
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
        internalOwner: 'missionDirectorAdvisor'
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
        if (!advisoryEnrichmentGuardCurrent(sourceGuard)) {
          lastAdvisoryEnrichmentResult = staleAdvisoryEnrichmentResult(sourceGuard, 'source-stale-before-provider');
          queueAdvisoryEnrichmentCoreDiagnostic(sourceGuard, 'stale', {
            reason: 'source-stale-before-provider',
            result: lastAdvisoryEnrichmentResult
          });
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
          await advisoryEnrichmentDiagnosticQueue;
          backgroundBatchCommitted = await commitAdvisoryEnrichmentCoreBackgroundBatch(sourceGuard, lastAdvisoryEnrichmentResult);
        }
        if (!backgroundBatchCommitted) {
          queueAdvisoryEnrichmentCoreDiagnostic(
            sourceGuard,
            advisoryEnrichmentDiagnosticStatusForResult(lastAdvisoryEnrichmentResult),
            { reason: 'postHostContinueRelease', result: lastAdvisoryEnrichmentResult }
          );
        }
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
    const ledger = campaignState?.runtimeTracking?.endConditionLedger || {};
    const decision = (Array.isArray(ledger.decisions) ? ledger.decisions : [])
      .find((entry) => compactString(entry?.id) === interactionId) || null;
    const interaction = (Array.isArray(campaignState?.runtimeTracking?.pendingInteractions)
      ? campaignState.runtimeTracking.pendingInteractions
      : []
    ).find((entry) => compactString(entry?.id) === interactionId) || null;
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
              internalOwner: 'terminalOutcomeCheckpoint'
            });
          } catch (error) {
            const diagnostic = terminalCheckpointDiagnosticEvent(target, event, 'backgroundBridgeFailed', {
              reason: 'core-background-bridge-failed',
              error
            });
            if (diagnostic) {
              const append = terminalCheckpointDiagnosticQueue
                .catch(() => null)
                .then(() => runtimeCoreTurnStore.appendDiagnostics(target.transactionId, diagnostic))
                .catch(() => null);
              terminalCheckpointDiagnosticQueue = append.then(() => null, () => null);
            }
          }
        }
        if (!backgroundBatchCommitted || event.kind === 'terminalOutcomeCheckpointResolved') {
          const diagnostic = terminalCheckpointDiagnosticEvent(target, event, event.status || 'settled', {});
          if (diagnostic) {
            const append = terminalCheckpointDiagnosticQueue
              .catch(() => null)
              .then(() => runtimeCoreTurnStore.appendDiagnostics(target.transactionId, diagnostic))
              .catch(() => null);
            terminalCheckpointDiagnosticQueue = append.then(() => null, () => null);
          }
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
          return cloneJson(lastCommandLogSummarySidecarResult);
        }
        const result = await updateCommandLogSummaryForTurnNow({
          turnPacket: queuedTurnPacket,
          enabled: true,
          sourceGuard
        });
        let backgroundBatchCommitted = null;
        if (result?.applied === true && result?.assistedSummary?.status === 'complete') {
          await commandLogSummaryDiagnosticQueue;
          backgroundBatchCommitted = await commitCommandLogSummaryCoreBackgroundBatch(sourceGuard, result);
        }
        if (!backgroundBatchCommitted) {
          queueCommandLogSummaryCoreDiagnostic(sourceGuard, commandLogSummaryDiagnosticStatusForResult(result), {
            reason,
            result
          });
        }
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

  function pendingTerminalDecisionId(state = null) {
    const ledger = state?.runtimeTracking?.endConditionLedger || {};
    const activeDecisionId = compactString(ledger.activeDecisionId);
    const decisions = Array.isArray(ledger.decisions) ? ledger.decisions : [];
    const activeDecision = activeDecisionId
      ? decisions.find((entry) => entry?.id === activeDecisionId && entry?.status === 'pending')
      : null;
    if (activeDecision) return activeDecision.id;
    const pendingInteraction = (state?.runtimeTracking?.pendingInteractions || []).find((entry) => (
      entry?.status === 'pending'
      && entry?.kind === 'terminalOutcomeDecision'
    ));
    return pendingInteraction?.id || null;
  }

  function terminalDecisionStillPending(state = null, decisionId = null) {
    const id = compactString(decisionId);
    if (!id) return false;
    const ledger = state?.runtimeTracking?.endConditionLedger || {};
    const decision = (Array.isArray(ledger.decisions) ? ledger.decisions : []).find((entry) => entry?.id === id);
    if (decision?.status === 'pending') return true;
    return (state?.runtimeTracking?.pendingInteractions || []).some((entry) => (
      entry?.id === id
      && entry?.status === 'pending'
      && entry?.kind === 'terminalOutcomeDecision'
    ));
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

  async function persistRuntimeCampaignStateNow(state, summary = 'Directive campaign state updated.') {
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
        markActive: false
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
      campaignState = modelCallJournal.applyPending(campaignState);
      const stateForPersistence = await stateWithCoreProjectionFreshnessEvidence(campaignState);
      const save = await controller.persistRuntimeCampaignState({
        saveId: targetSaveId,
        campaignState: stateForPersistence,
        summary: `Preserved fresher runtime state over stale write: ${summary}`,
        reason: 'runtimePersist:fresher-state',
        markActive: false
      });
      await refreshCampaignView();
      return cloneJson(save);
    }
    if (shouldPreserveFresherTerminalState(campaignState, nextState, summary)) {
      campaignState = modelCallJournal.applyPending(campaignState);
      const stateForPersistence = await stateWithCoreProjectionFreshnessEvidence(campaignState);
      const save = await controller.persistRuntimeCampaignState({
        saveId: targetSaveId,
        campaignState: stateForPersistence,
        summary: 'Preserved pending terminal outcome state over stale runtime write.',
        reason: 'runtimePersist:preserve-terminal',
        markActive: false
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
      markActive: false
    });
    campaignState = mergeFresherResponseLedgerProjection(campaignState, nextState);
    await refreshCampaignView();
    return cloneJson(save);
  }

  function persistRuntimeCampaignState(state, summary = 'Directive campaign state updated.') {
    const requestedState = cloneJson(state);
    const requestedSummary = summary;
    const persist = () => persistRuntimeCampaignStateNow(requestedState, requestedSummary);
    const queued = runtimePersistQueue.then(persist, persist);
    runtimePersistQueue = queued.catch(() => null);
    return queued;
  }

  async function settleRuntimePersistenceQueue() {
    await runtimePersistQueue;
  }

  async function settleCommandLogSummaryQueue() {
    await commandLogSummaryQueue;
    await settleRuntimePersistenceQueue();
    await commandLogSummaryDiagnosticQueue;
    return cloneJson(lastCommandLogSummarySidecarResult);
  }

  async function settlePostCommitConversationQueue() {
    await postCommitConversationQueue;
    await settleRuntimePersistenceQueue();
    await postCommitConversationDiagnosticQueue;
    return cloneJson(lastPostCommitConversationResult);
  }

  async function settleAdvisoryEnrichmentQueue() {
    await advisoryEnrichmentQueue;
    await settleRuntimePersistenceQueue();
    await advisoryEnrichmentDiagnosticQueue;
    return cloneJson(lastAdvisoryEnrichmentResult);
  }

  async function settleTerminalCheckpointSettlementQueue() {
    await terminalCheckpointSettlementQueue;
    await settleRuntimePersistenceQueue();
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
    commitRuntimeState = true
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
    const currentChatId = runtimeHost.chat?.getCurrentChatId?.() || runtimeHost.chat?.getCurrentBinding?.()?.chatId || null;
    if (currentChatId && String(currentChatId) !== String(state.campaignChatBinding.chatId)) {
      const promptSuspension = await suspendDirectivePromptThroughLens({
        reason: 'unbound-chat',
        binding: state.campaignChatBinding,
        activeChatId: currentChatId,
        boundChatId: state.campaignChatBinding.chatId,
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
    const promptInput = createLensPromptInput({
      campaignState: state,
      assets,
      promptFrame: frame,
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
    const externalPromptEnvironmentRef = promptExternalEnvironmentRefForSync(lensPromptFrame);
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
        externalPromptEnvironmentRef,
        reason,
        installMethod: method,
        idempotencyKey: lensIdempotencyKey,
        beforeInstallPrompt,
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
      packet = lensResult?.packet || null;
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
          status: 'active'
        })
      : cloneJson(state);
    if (commitRuntimeState !== false && !promptInstallSkipped) {
      campaignState = next;
      await runtimeHost.chat?.updateBindingMetadata?.(next.campaignChatBinding);
      if (persist) await persistRuntimeCampaignState(next, reason);
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
        externalPromptEnvironmentRef: cloneJson(lensResult?.externalPromptEnvironmentRef || externalPromptEnvironmentRef || null)
      },
      promptInstallSkipped,
      campaignState: cloneJson(next)
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
    const externalPromptEnvironmentRef = promptExternalEnvironmentRefForSync(lensPromptFrame);
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
    const setCampaignState = (state) => { campaignState = cloneJson(state); };
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
    const repairRuntime = createRepairCommandBoundary({
      coreTurnStore: runtimeCoreTurnStore,
      now
    });
    const responseDispatcher = createResponseDispatcher({
      host: runtimeHost,
      coreTurnStore: runtimeCoreTurnStore,
      repairRuntime,
      getCampaignState,
      setCampaignState,
      persist: persistCampaignState,
      now
    });
    const messageReconciler = createMessageReconciler({
      getCampaignState,
      setCampaignState,
      coreTurnStore: runtimeCoreTurnStore,
      repairRuntime,
      persist: persistCampaignState,
      syncPrompt: async (state) => (await synchronizeActivePrompt(state, {
        persist: false,
        useContinuityPlanner: false,
        reason: 'Prompt context rebuilt after message recovery.'
      })).campaignState,
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
        const promptFrame = {
          ...(input.promptFrame && typeof input.promptFrame === 'object' ? cloneJson(input.promptFrame) : {}),
          workerKey: 'commandBearing',
          promptDirtyDomains,
          commandBearingReview: true,
          sourceFrameRef: cloneJson(input.sourceFrameRef || input.promptFrame?.sourceFrameRef || null),
          sourceToken: input.sourceToken || input.promptFrame?.sourceToken || null,
          cacheInputs: cloneJson(input.cacheInputs || input.promptFrame?.cacheInputs || {})
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
    const endConditionService = createCampaignEndConditionService({
      host: runtimeHost,
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
      saveTerminalBranch: (options) => controller.saveTerminalBranch(options),
      concludeCampaign: (options) => conclusionService.conclude(options),
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
      generationRouter: defaultGenerationRouter,
      responseDispatcher,
      turnCommitCoordinator,
      sidecarScheduler,
      forgeCoordinator,
      messageReconciler,
      repairRuntime,
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

  function outcomeIntegrityNativeEditDecision(payload = {}) {
    try {
      const state = outcomeIntegrityCampaignState();
      const message = hostMessageForOutcomeIntegrity(payload);
      return outcomeIntegrityStatusForMessage({
        campaignState: state,
        message,
        hostMessageId: hostMessageIdFromPayload(payload)
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
    return buildOutcomeIntegrityEditContext({
      campaignState: state,
      message,
      hostMessageId: hostMessageIdFromPayload(payload)
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
      : buildOutcomeIntegrityEditContext({
          campaignState: state,
          message,
          hostMessageId: hostMessageIdFromPayload(payload)
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
      const responseUpdateId = context.hostMessageId || response.hostMessageId || response.id;
      const next = responseUpdateId
        ? updateDirectiveResponse(latest, responseUpdateId, {
            outcomeIntegrity: appendOutcomeIntegrityReview(response, reviewPatch)
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
    const responseUpdateId = context.hostMessageId || response.hostMessageId || response.id;
    const next = responseUpdateId
      ? updateDirectiveResponse(latest, responseUpdateId, {
          editedAt: revision.editedAt,
          replacementText: null,
          outcomeIntegrity: {
            ...currentIntegrity,
            reviewCount: Math.max(0, Number(currentIntegrity.reviewCount) || 0) + 1,
            revisions: [...revisions, revision],
            selectedRevisionId: revision.id,
            lastReview: reviewPatch
          }
        })
      : latest;
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
        return services.orchestrator.observePlayerMessage(payload);
      });
    },

    getOutcomeIntegrityNativeEditDecision(payload = {}) {
      return outcomeIntegrityNativeEditDecision(payload);
    },

    async prepareOutcomeIntegrityEdit(payload = {}) {
      return run(async () => prepareOutcomeIntegrityEdit(payload));
    },

    async submitOutcomeIntegrityEdit(payload = {}) {
      return run(async () => submitOutcomeIntegrityEdit(payload));
    },

    async flushChatSidecars() {
      return run(async () => {
        await ensureInitialized();
        const services = ensureChatNativeServices();
        const commandLogSummaryResult = await settleCommandLogSummaryQueue();
        const postCommitConversationResult = await settlePostCommitConversationQueue();
        const advisoryEnrichmentResult = await settleAdvisoryEnrichmentQueue();
        const terminalCheckpointSettlementResult = await settleTerminalCheckpointSettlementQueue();
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
              || terminalCheckpointSettlementResult?.ok === true,
            reason: 'sidecar-scheduler-unavailable',
            commandLogSummaryResult: cloneJson(commandLogSummaryResult),
            postCommitConversationResult: cloneJson(postCommitConversationResult),
            advisoryEnrichmentResult: cloneJson(advisoryEnrichmentResult),
            terminalCheckpointSettlementResult: cloneJson(terminalCheckpointSettlementResult),
            view: viewEnvelope('mission')
          };
        }
        const sidecarJournalCountBefore = campaignState?.runtimeTracking?.sidecarJournal?.length || 0;
        const coreSidecarDiagnosticsBefore = await coreSidecarDiagnosticCount();
        const coreSidecarResumeCountBefore = await coreSidecarResumeCount();
        const results = await services.sidecarScheduler.pending();
        await refreshCampaignView();
        await refreshCurrentChatCampaignScope();
        const sidecarJournalCountAfter = campaignState?.runtimeTracking?.sidecarJournal?.length || 0;
        const coreSidecarDiagnosticsAfter = await coreSidecarDiagnosticCount();
        const coreSidecarResumeCountAfter = await coreSidecarResumeCount();
        const sidecarCountBefore = Math.max(sidecarJournalCountBefore, coreSidecarResumeCountBefore ?? 0);
        const sidecarCountAfter = Math.max(sidecarJournalCountAfter, coreSidecarResumeCountAfter ?? 0);
        const sidecarJournalDelta = Math.max(0, sidecarJournalCountAfter - sidecarJournalCountBefore);
        const coreSidecarDiagnosticDelta = Number.isFinite(coreSidecarDiagnosticsBefore) && Number.isFinite(coreSidecarDiagnosticsAfter)
          ? Math.max(0, coreSidecarDiagnosticsAfter - coreSidecarDiagnosticsBefore)
          : null;
        const sidecarCountDelta = Math.max(0, sidecarCountAfter - sidecarCountBefore);
        const resultCount = Array.isArray(results) ? results.length : 0;
        return {
          ok: true,
          sidecarCountBefore,
          sidecarCountAfter,
          sidecarJournalCountBefore,
          sidecarJournalCountAfter,
          sidecarJournalDelta,
          coreSidecarDiagnosticsBefore,
          coreSidecarDiagnosticsAfter,
          coreSidecarDiagnosticDelta,
          coreSidecarResumeCountBefore,
          coreSidecarResumeCountAfter,
          sidecarDelta: Math.max(sidecarCountDelta, sidecarJournalDelta, coreSidecarDiagnosticDelta ?? 0, resultCount),
          results: cloneJson(results || []),
          commandLogSummaryResult: cloneJson(commandLogSummaryResult),
          postCommitConversationResult: cloneJson(postCommitConversationResult),
          advisoryEnrichmentResult: cloneJson(advisoryEnrichmentResult),
          terminalCheckpointSettlementResult: cloneJson(terminalCheckpointSettlementResult),
          view: viewEnvelope('mission')
        };
      });
    },

    async flushRuntimeDiagnostics() {
      return run(async () => {
        await ensureInitialized();
        await commandLogSummaryDiagnosticQueue;
        await postCommitConversationDiagnosticQueue;
        await advisoryEnrichmentDiagnosticQueue;
        await terminalCheckpointSettlementQueue;
        await terminalCheckpointDiagnosticQueue;
        await modelCallJournal.flushCoreDiagnostics();
        await refreshRuntimePersistenceAfterCoreDiagnostics('Runtime CORE diagnostics metadata refreshed.');
        await settleRuntimePersistenceQueue();
        await refreshCampaignView();
        await refreshCurrentChatCampaignScope();
        return {
          ok: true,
          view: viewEnvelope('mission')
        };
      });
    },

    async reobserveHostGenerationCompletions() {
      return run(async () => {
        await ensureInitialized();
        await refreshCurrentChatCampaignScope();
        const services = ensureChatNativeServices();
        if (!services?.responseDispatcher?.reobserveHostGenerationCompletions) {
          return { ok: false, skipped: true, reason: 'response-dispatcher-reobserve-unavailable' };
        }
        const assets = activeRuntimeAssets();
        const result = await services.responseDispatcher.reobserveHostGenerationCompletions({
          campaignState: liveCampaignStateForView() || campaignState,
          packageData: assets?.packageData || null,
          crewDataset: assets?.crewDataset || null,
          shipDataset: assets?.shipDataset || null,
          campaignProjection: assets?.projection || null
        });
        await refreshCampaignView();
        await refreshCurrentChatCampaignScope();
        return {
          ...cloneJson(result),
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
        const decision = outcomeIntegrityNativeEditDecision(payload);
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
            const context = buildOutcomeIntegrityEditContext({
              campaignState: outcomeIntegrityCampaignState(),
              message: {
                ...message,
                text: priorText
              },
              hostMessageId: hostMessageIdFromPayload(payload)
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

    async hideCampaignSession({ key } = {}) {
      return run(async () => {
        await ensureInitialized();
        const sessionKey = compactString(key);
        if (!sessionKey) throw new Error('Campaign session key is required.');
        uiPreferences.hideSessionKey(sessionKey);
        await persistUiPreferences();
        await refreshCampaignView();
        await refreshCurrentChatCampaignScope();
        return viewEnvelope('campaign');
      });
    },

    async showCampaignSession({ key } = {}) {
      return run(async () => {
        await ensureInitialized();
        const sessionKey = compactString(key);
        if (!sessionKey) throw new Error('Campaign session key is required.');
        uiPreferences.showSessionKey(sessionKey);
        await persistUiPreferences();
        await refreshCampaignView();
        await refreshCurrentChatCampaignScope();
        return viewEnvelope('campaign');
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

    async rebuildPromptContext() {
      return run(async () => {
        await ensureInitialized();
        const result = await synchronizeActivePrompt(campaignState, {
          persist: true,
          rebuild: true,
          reason: 'Player-safe campaign prompt context rebuilt manually.'
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
        campaignState = recordRecoveryEvent({
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
          recordedAt: changedAt,
          details: {
            previousMode,
            nextMode,
            reason: compactString(reason) || 'player-campaign-difficulty-change',
            appliesTo: 'future-outcomes-only'
          }
        });

        let prompt = null;
        let save = null;
        try {
          prompt = await synchronizeActivePrompt(campaignState, {
            persist: true,
            rebuild: true,
            reason: `Campaign difficulty changed to ${nextMode}.`
          });
          if (prompt?.campaignState) {
            campaignState = applyRuntimeSettings(prompt.campaignState);
          }
        } catch (error) {
          campaignState = applyRuntimeSettings(campaignState);
          throw error;
        }
        if (prompt?.skipped || prompt?.active === false) {
          save = await persistRuntimeCampaignState(campaignState, `Campaign difficulty changed to ${nextMode}.`);
        }
        await refreshCampaignView();
        await refreshManualSaveGuard();
        await refreshCurrentChatCampaignScope();
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
          maxTurnSaveHistory ?? historyLimit ?? campaignState.settings?.maxTurnSaveHistory ?? campaignState.runtimeTracking?.historyLimit
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
        const modelCallCountBefore = campaignState?.runtimeTracking?.modelCallJournal?.length || 0;
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
        const modelCalls = campaignState?.runtimeTracking?.modelCallJournal || [];
        const latestModelCall = modelCalls.at(-1) || null;
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
        const modelCallCountBefore = campaignState?.runtimeTracking?.modelCallJournal?.length || 0;
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
        const modelCalls = campaignState?.runtimeTracking?.modelCallJournal || [];
        const latestModelCall = modelCalls.at(-1) || null;
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
        campaignState = recordRecoveryEvent(campaignState, {
          id: `rebind:${campaignState.campaign?.id || 'campaign'}:${reboundAt}`,
          type: 'chatRebind',
          status: 'applied',
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
        await persistRuntimeCampaignState(campaignState, 'Campaign chat rebound and recovery journal updated.');
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

    async archiveCompletedCampaign() {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        if (!['complete', 'archived'].includes(campaignState.campaign?.status)) {
          throw new Error('Only a completed campaign can be archived.');
        }
        campaignState = {
          ...campaignState,
          campaign: {
            ...campaignState.campaign,
            status: 'archived',
            archivedAt: timestampFromNow(now)
          }
        };
        await clearDirectivePromptThroughLens({ reason: 'campaign-archived' });
        const save = await persistRuntimeCampaignState(campaignState, 'Completed campaign archived.');
        return {
          save: cloneJson(save),
          campaignState: cloneJson(campaignState),
          view: viewEnvelope('campaign')
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

    async loadGame({ saveId }) {
      return run(async () => {
        await ensureInitialized();
        const requestedSaveId = requireNonEmptyString(saveId, 'saveId');
        await settleRuntimePersistenceQueue();
        const loadedState = applyRuntimeSettings(await controller.loadGame({ saveId: requestedSaveId }));
        const shouldPersistTimeRepair = campaignTimeNeedsRuntimeNormalization(loadedState);
        campaignState = stateWithLoadedSaveBinding(loadedState, requestedSaveId);
        resetActiveCoreTurnStore('game-loaded');
        if (shouldPersistTimeRepair) {
          await persistRuntimeCampaignState(campaignState, 'Campaign time state normalized after loading save.');
        }
        pendingDirectorTurn = null;
        pendingOutcomeReplacement = null;
        lastDirectorTurn = null;
        lastNarrationResult = null;
        lastCommandLogSummarySidecarResult = null;
        lastDirectiveAssistResult = null;
        lastConclusionResult = null;
        activeScreen = 'campaign';
        const services = ensureChatNativeServices();
        if (services && ['activating', 'activationFailed'].includes(campaignState.campaign?.status)) {
          lastActivationResult = {
            ok: false,
            deferred: true,
            reason: 'opening-scene-required',
            summary: 'Campaign setup is loaded and waiting for the player to build the opening scene.',
            campaignState: cloneJson(campaignState),
            activationJournal: cloneJson(campaignState.activationJournal || null)
          };
        } else if (services && campaignState.campaign?.status === 'active') {
          await openAndRetargetCampaignChat(campaignState, {
            persistPrompt: true,
            rebuildPrompt: true,
            reason: 'Campaign prompt context rebuilt after loading the save.'
          });
        } else if (campaignState.campaign?.status === 'complete') {
          await clearDirectivePromptThroughLens({ reason: 'completed-campaign' });
        }
        await refreshCampaignView();
        await refreshManualSaveGuard();
        await refreshCurrentChatCampaignScope();
        return viewEnvelope('mission');
      });
    },

    async deleteCampaignSave({ saveId }) {
      return run(async () => {
        await ensureInitialized();
        const result = await controller.deleteCampaignSave({
          saveId: requireNonEmptyString(saveId, 'saveId')
        });
        if (result.deletedActive === true) {
          campaignState = null;
          resetActiveCoreTurnStore('active-save-deleted');
          pendingDirectorTurn = null;
          pendingOutcomeReplacement = null;
          lastDirectorTurn = null;
          lastNarrationResult = null;
          lastCommandLogSummarySidecarResult = null;
          lastOpenWorldActionResult = null;
          lastDirectiveAssistResult = null;
          lastSceneReconciliationResult = null;
          lastActivationResult = null;
          lastConclusionResult = null;
          await clearDirectivePromptThroughLens({ reason: 'active-save-deleted' });
        }
        activeScreen = 'campaign';
        await refreshCampaignView();
        return {
          deleteResult: cloneJson(result),
          view: viewEnvelope('campaign')
        };
      });
    },

    async saveCurrentGame({ summary = null } = {}) {
      return run(async () => {
        await ensureInitialized();
        const guard = await refreshManualSaveGuard(campaignState);
        if (!guard.ok) {
          await refreshCampaignView();
          return {
            ok: false,
            blocked: true,
            saveGuard: cloneJson(guard),
            view: viewEnvelope('campaign')
          };
        }
        const save = await controller.saveCurrentGame({
          campaignState,
          summary
        });
        await runtimeHost?.chat?.updateBindingMetadata?.(campaignState.campaignChatBinding);
        await refreshManualSaveGuard(campaignState, { expectedSaveId: save.id });
        await refreshCampaignView();
        await refreshCurrentChatCampaignScope();
        return {
          ok: true,
          saveGuard: cloneJson(lastManualSaveGuard),
          save: cloneJson(save),
          view: viewEnvelope('mission')
        };
      });
    },

    async saveCurrentGameAs({ name = null, branchFrom = null } = {}) {
      return run(async () => {
        await ensureInitialized();
        const guard = await refreshManualSaveGuard(campaignState);
        if (!guard.ok) {
          await refreshCampaignView();
          return {
            ok: false,
            blocked: true,
            saveGuard: cloneJson(guard),
            view: viewEnvelope('campaign')
          };
        }
        if (typeof runtimeHost?.chat?.cloneCurrentChatForSaveBranch !== 'function') {
          await refreshCampaignView();
          return {
            ok: false,
            blocked: true,
            reason: 'chat-clone-unavailable',
            summary: 'Save Game As requires host support for cloning the active campaign chat.',
            saveGuard: cloneJson(guard),
            view: viewEnvelope('campaign')
          };
        }
        const newSaveId = controller.createSaveId('save');
        const sourceBinding = cloneJson(campaignState.campaignChatBinding || null);
        const branchPoint = branchFrom || {
          divergenceOutcomeId: campaignState?.turnLedger?.lastCommittedOutcomeId || null
        };
        const clonedBinding = await runtimeHost.chat.cloneCurrentChatForSaveBranch({
          name,
          campaignId: campaignState?.campaign?.id || sourceBinding?.campaignId || null,
          saveId: newSaveId,
          sourceBinding,
          branchFrom: branchPoint
        });
        if (!clonedBinding?.chatId) {
          const error = new Error('Host chat clone did not return a branch chat id.');
          error.code = 'DIRECTIVE_SAVE_AS_CHAT_CLONE_INVALID';
          error.details = { saveId: newSaveId, clonedBinding };
          throw error;
        }
        const branchBinding = {
          ...(sourceBinding || {}),
          ...cloneJson(clonedBinding || {}),
          campaignId: campaignState?.campaign?.id || clonedBinding?.campaignId || sourceBinding?.campaignId || null,
          saveId: newSaveId,
          chatId: clonedBinding?.chatId || null,
          chatName: clonedBinding?.chatName || name || sourceBinding?.chatName || null,
          status: clonedBinding?.status || sourceBinding?.status || 'bound'
        };
        campaignState = applyRuntimeSettings(stateWithSaveBranchChatBinding(
          campaignState,
          branchBinding,
          sourceBinding
        ));
        resetActiveCoreTurnStore('save-as-branch-created');
        const branchSave = await controller.saveCurrentGameAs({
          newSaveId,
          name,
          campaignState,
          branchFrom: branchPoint
        });
        await runtimeHost.chat.updateBindingMetadata?.(campaignState.campaignChatBinding);
        const promptResult = await synchronizeActivePrompt(campaignState, {
          persist: false,
          rebuild: true,
          reason: 'Prompt context rebuilt after Save Game As cloned-chat branch creation.'
        });
        campaignState = stateWithSaveBranchChatBinding(
          promptResult?.campaignState
            ? applyRuntimeSettings(promptResult.campaignState)
            : applyRuntimeSettings(campaignState),
          branchBinding,
          sourceBinding
        );
        const save = await controller.saveCurrentGame({
          saveId: branchSave.id,
          campaignState,
          summary: 'Save branch created with a cloned campaign chat.'
        });
        await refreshManualSaveGuard(campaignState, { expectedSaveId: save.id });
        await refreshCampaignView();
        await refreshCurrentChatCampaignScope();
        return {
          ok: true,
          saveGuard: cloneJson(lastManualSaveGuard),
          save: cloneJson(save),
          branchSave: cloneJson(branchSave),
          branchChat: {
            sourceChatId: clonedBinding?.sourceChatId || sourceBinding?.chatId || null,
            chatId: campaignState.campaignChatBinding?.chatId || null,
            messageCount: Number.isFinite(Number(clonedBinding?.messageCount))
              ? Number(clonedBinding.messageCount)
              : null
          },
          view: viewEnvelope('mission')
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
      generateCommandLogSummary = true
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const assets = activeRuntimeAssets();
        const graphRecord = activeMissionGraphRecord(assets, sceneSnapshotOverrides);
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
          sceneSnapshotOverrides
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
      turnId = null
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const assets = activeRuntimeAssets();
        const graphRecord = activeMissionGraphRecord(assets, sceneSnapshotOverrides);
        const result = createProvisionalDirectorTurnRuntime({
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
          sceneSnapshotOverrides
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
      provider = defaultNarrationProvider
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        requireObject(pendingDirectorTurn, 'pendingDirectorTurn');
        if (spendTrack) {
          throw new Error('Command Bearing points must be readied before the player message; post-outcome spendTrack commits are disabled.');
        }
        const replacement = pendingOutcomeReplacement ? cloneJson(pendingOutcomeReplacement) : null;
        const baseCampaignState = replacement?.snapshotBefore || campaignState;
        const beforeCampaignState = cloneJson(baseCampaignState);
        const result = commitProvisionalDirectorTurnRuntime({
          campaignState: baseCampaignState,
          turnPacket: pendingDirectorTurn,
          spendTrack,
          readiedCommandBearing,
          confirmWarnings,
          confirmedWarningIds
        });
        let committedCandidateState = result.campaignState;
        if (replacement) {
          committedCandidateState.turnLedger = committedCandidateState.turnLedger || { entries: [], swipeRerollForbidden: true };
          committedCandidateState.turnLedger.replacementHistory = [
            ...(committedCandidateState.turnLedger.replacementHistory || []),
            {
              type: replacement.type || 'rerunOutcome',
              replacedOutcomeId: replacement.outcomeId,
              replacementOutcomeId: result.turnPacket.outcomePacket.id,
              replacedTurnId: replacement.turnId || null,
              acceptedAt: timestampFromNow(now)
            }
          ];
          committedCandidateState.turnLedger.lastReplacedOutcomeId = replacement.outcomeId;
        }
        const mechanicsCheckpoint = await ensureTurnCommitCoordinator().checkpointMechanics({
          beforeCampaignState,
          campaignState: committedCandidateState,
          turnPacket: result.turnPacket,
          ingressId: committedCandidateState.runtimeTracking?.activeIngressId || null
        });
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
      type = 'rerunOutcome'
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const id = requireNonEmptyString(outcomeId, 'outcomeId');
        const ledgerEntry = (campaignState.turnLedger?.entries || []).find((entry) => entry.outcomeId === id);
        if (!ledgerEntry) {
          throw new Error(`Cannot rerun unknown outcome "${id}"`);
        }
        const snapshotBefore = cloneJson(ledgerEntry.snapshotBefore);
        const assets = activeRuntimeAssets();
        const graphRecord = activeMissionGraphRecord(assets, {
          activeMissionGraphId: snapshotBefore?.mission?.activeMissionGraphId
        });
        const result = createProvisionalDirectorTurnRuntime({
          campaignState: snapshotBefore,
          packageData: assets.packageData,
          graph: graphRecord.graph,
          projection: assets.projection,
          crewDataset: assets.crewDataset,
          shipDataset: assets.shipDataset,
          graphPath: graphRecord.path || snapshotBefore.mission?.activeMissionGraphPath,
          projectionPath: assets.projectionPath,
          turnId: turnId || idFactory('turn-rerun'),
          playerInput
        });
        pendingOutcomeReplacement = {
          type,
          outcomeId: id,
          turnId: ledgerEntry.turnId || null,
          snapshotBefore,
          previewCreatedAt: timestampFromNow(now)
        };
        pendingDirectorTurn = {
          ...result.turnPacket,
          replacementForOutcomeId: id,
          replacementType: type
        };
        lastCommandLogSummarySidecarResult = null;
        activeScreen = 'campaign';
        return {
          turnPacket: cloneJson(pendingDirectorTurn),
          provisionalOutcome: cloneJson(result.provisionalOutcome),
          commandBearingPrompt: cloneJson(result.commandBearingPrompt),
          narratorPacket: cloneJson(result.narratorPacket),
          commandLogPacket: cloneJson(result.commandLogPacket),
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
        campaignState = restoreBeforeCommittedOutcome(campaignState, id);
        pendingDirectorTurn = null;
        pendingOutcomeReplacement = null;
        lastDirectorTurn = null;
        lastNarrationResult = null;
        lastCommandLogSummarySidecarResult = null;
        activeScreen = 'campaign';
        return {
          deletedOutcomeId: id,
          campaignState: cloneJson(campaignState),
          view: viewEnvelope('mission')
        };
      });
    },

    async resolveTerminalOutcomeDecision({
      interactionId = null,
      action = 'replayFromCheckpoint',
      frameId = null,
      playerArgument = null
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
          playerArgument
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
