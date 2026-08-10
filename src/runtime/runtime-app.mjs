import {
  pruneTurnSaveHistory,
  recordNarrationFailure,
  recordNarrationSuccess
} from '../campaign/transaction-state.mjs';
import {
  migrateCommandBearingState,
  projectCommandBearingForPlayer
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
import { assertDirectiveHost } from '../hosts/host-contract.mjs';
import { createPlayerPortraitUpload } from '../media/player-portrait-assets.mjs';
import { createRuntimePersistCoordinator } from './runtime-persist-coordinator.mjs';
import { normalizeCampaignPackageZip } from '../packages/campaign-package-importer.mjs';
import { openWorldQuestView } from '../quests/quest-director.mjs';
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
import { createChatTurnOrchestrator } from './chat-turn-orchestrator.mjs';
import { buildV1RuntimePlayerProjection, createV1MissionRuntime } from './v1-mission-runtime.mjs';
import { resolveV1SemanticAuthority as resolveV1SemanticAuthorityContract } from './v1-semantic-authority.mjs';
import {
  buildContinuityProjectionDiagnostics,
  buildContinuityTelemetry
} from '../continuity/diagnostics.mjs';
import { createResponseDispatcher } from './response-dispatcher.mjs';
import { createRepairCommandBoundary } from './repair-command-boundary.mjs';
import { createSourceReviewWorker } from './source-review-worker.mjs';
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
import { buildSupportDiagnosticsExport } from './support-diagnostics-export.mjs';
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
  deleteV2SaveLayout
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
  autosaveEveryMessages = null
} = {}) {
  if (!campaignState) return campaignState;
  const next = applyTurnSaveHistoryLimit(campaignState, maxTurnSaveHistory);
  return applyAutosaveEveryMessages(next, autosaveEveryMessages);
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
  const runtimeLedgerView = createRuntimeLedgerView(state || {});
  const coreProjection = state?.directiveRuntimeEvidence?.coreStoreReadProjections || {};
  return {
    revision: Math.max(0, Number(tracking.revision) || 0),
    mechanicsRevision: Math.max(0, Number(tracking.mechanicsRevision) || 0),
    promptContextRevision: Math.max(0, Number(state?.campaignChatBinding?.promptContextRevision) || 0),
    storyRevision: Math.max(0, Number(state?.storySettlement?.revision) || 0),
    missionRevision: Math.max(0, Number(state?.mission?.v1?.revision) || 0),
    settlementReceipts: countArray(state?.storySettlement?.receipts),
    settledEpisodes: countArray(state?.storySettlement?.episodes),
    timeLedgerEntries: countArray(state?.timeLedger?.entries),
    turnLedgerEntries: Math.max(
      countArray(state?.turnLedger?.entries),
      countArray(coreProjection?.turnLedger?.entries)
    ),
    ingressLedgerEntries: countArray(runtimeLedgerView.ingressLedger),
    responseLedgerEntries: countArray(runtimeLedgerView.responseLedger),
    recoveryJournalEntries: countArray(runtimeLedgerView.recoveryJournal),
    pendingInteractions: countArray(pendingInteractionProjectionRows(state)),
    modelCallJournalEntries: countArray(coreProjection?.modelCallDiagnostics)
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

function coreModelCallDiagnosticsForState(state = null) {
  const projections = readRuntimeCoreProjections(state || {});
  return Array.isArray(projections.modelCallDiagnostics) ? cloneJson(projections.modelCallDiagnostics) : [];
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
  const memory = stateFreshnessCounters(inMemoryState);
  const materialKeys = [
    'storyRevision',
    'missionRevision',
    'settlementReceipts',
    'settledEpisodes',
    'timeLedgerEntries',
    'turnLedgerEntries',
    'ingressLedgerEntries',
    'responseLedgerEntries',
    'recoveryJournalEntries',
    'pendingInteractions',
    'modelCallJournalEntries',
    'promptContextRevision'
  ];
  const memoryGrowth = materialKeys.some((key) => memory[key] > candidate[key]);
  const candidateGrowth = materialKeys.some((key) => candidate[key] > memory[key]);
  if (memoryGrowth && !candidateGrowth) return true;
  if (candidateGrowth && !memoryGrowth) return false;
  if (memory.revision !== candidate.revision) return memory.revision > candidate.revision;
  if (memory.mechanicsRevision !== candidate.mechanicsRevision) {
    return memory.mechanicsRevision > candidate.mechanicsRevision;
  }
  if (memory.storyRevision !== candidate.storyRevision) return memory.storyRevision > candidate.storyRevision;
  if (memory.missionRevision !== candidate.missionRevision) return memory.missionRevision > candidate.missionRevision;
  return false;
}

function mergeRuntimePersistPendingRequest(priorRequest = null, nextRequest = null, options = {}) {
  if (!priorRequest) return nextRequest ? cloneJson(nextRequest) : null;
  if (!nextRequest) return cloneJson(priorRequest);
  const usePriorState = shouldPreferInMemoryCampaignState(nextRequest.state, priorRequest.state, options);
  const state = cloneJson(usePriorState ? priorRequest.state : nextRequest.state);
  if (isObject(nextRequest.state?.settings)) state.settings = cloneJson(nextRequest.state.settings);
  return {
    ...cloneJson(nextRequest),
    state
  };
}

function hasTurnLedgerOutcome(state = null, outcomeId = null) {
  const id = compactString(outcomeId);
  if (!id) return false;
  return (state?.turnLedger?.entries || []).some((entry) => entry?.outcomeId === id);
}

function coreProjectionFreshnessEvidence(projections = null) {
  if (!isObject(projections)) return null;
  return {
    kind: 'directive.coreStoreReadProjections.v1',
    runtimeAuthority: 'coreStoreV2',
    turnLedger: cloneJson(isObject(projections.turnLedger) ? projections.turnLedger : {}),
    ingressLedger: cloneJson(arrayItems(projections.ingressLedger)),
    responses: cloneJson(arrayItems(projections.responses)),
    recoveryJournal: cloneJson(arrayItems(projections.recoveryJournal)),
    pendingInteractions: cloneJson(arrayItems(projections.pendingInteractions)),
    modelCallDiagnostics: cloneJson(arrayItems(projections.modelCallDiagnostics)),
    revisions: cloneJson(isObject(projections.revisions) ? projections.revisions : {})
  };
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
  if (next.runtimeTracking) {
    next.runtimeTracking.history = [];
    next.runtimeTracking.historyIndex = -1;
  }
  return next;
}

export const __directiveRuntimeAppTestHooks = Object.freeze({
  createPlayerCharacterView,
  coreProjectionFreshnessEvidence,
  stateFreshnessCounters,
  activeSessionCacheCurrentForSave,
  promptPacketFromLensFlushResult,
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
    const targetStatus = compactString(ingress?.status);
    if (!['classifying', 'classified'].includes(targetStatus)) return null;
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
  let runtimeStateDeltaGateway = null;
  let v1MissionRuntime = null;
  let durabilityCoordinator = null;
  let lensPromptScheduler = null;
  let publicApi = null;
  let runtimePersistCoordinator = null;
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
      missionGraphs: merged.missionGraphs,
      missionDefinitions: merged.missionDefinitions
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
    const stateWithFreshCoreEvidence = await stateWithCoreProjectionFreshnessEvidence(campaignState);
    if (hashStableJson(stateWithFreshCoreEvidence) === hashStableJson(campaignState)) return null;
    campaignState = stateWithFreshCoreEvidence;
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
    const inMemoryForComparison = await stateWithCoreProjectionFreshnessEvidence(inMemoryState);
    if (!shouldPreferInMemoryCampaignState(candidateState, inMemoryForComparison, {
      chatId,
      fallbackHostId: runtimeHost?.id || null,
      fallbackSaveId: controller?.activeSaveId || null
    })) {
      return candidateState;
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
        storyRevision: freshness.storyRevision,
        missionRevision: freshness.missionRevision,
        settlementReceiptCount: freshness.settlementReceipts,
        modelCallCount: modelCallDiagnostics.length,
        modelCallEventSequence: maxModelCallEventSequence(state),
        lastDelta: cloneJson(state.runtimeTracking.lastDelta || null),
        latestModelCall: cloneJson(modelCallDiagnostics.at(-1) || null)
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
      turnStatus: chatTurnStatusForState(state)
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
    if (['reading', 'acceptedPairSettlement', 'v1AcceptedPairTimeCustody', 'v1MissionAcceptedPair'].includes(phase)) {
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
            highConcept: context?.campaign?.highConcept || summary?.campaign?.highConcept || '',
            premise: context?.campaign?.highConcept || context?.campaign?.premise || summary?.premise || '',
            theater: context?.campaign?.theater || summary?.campaign?.theater || '',
            eraLabel: context?.campaign?.eraLabel || summary?.campaign?.eraLabel || '',
            structure: cloneJson(context?.campaign?.structure || summary?.campaign?.structure || {}),
            quests: cloneJson(context?.campaign?.quests || summary?.campaign?.quests || []),
            openingHook: context?.campaign?.openingHook || summary?.campaign?.openingHook || ''
          },
          theater: context?.campaign?.theater || summary?.theater || '',
          eraLabel: context?.campaign?.eraLabel || summary?.eraLabel || '',
          structure: cloneJson(context?.campaign?.structure || summary?.structure || {}),
          playerRole: cloneJson(context?.playerRole || summary?.playerRole || null),
          ship: cloneJson(context?.ship || null),
          assets: cloneJson(context?.assets || summary?.assets || {})
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
        pendingDirectorTurn: cloneJson(pendingDirectorTurn),
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
    const v1ProjectionResult = renderedCampaignState && renderedAssets
      ? buildV1RuntimePlayerProjection({
          campaignState: renderedCampaignState,
          runtimeAssets: renderedAssets
        })
      : null;
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
      v1PlayerProjection: cloneJson(v1ProjectionResult?.ok ? v1ProjectionResult.projection : null),
      v1ProjectionStatus: cloneJson(v1ProjectionResult),
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
      lastCharacterCreatorSectionDraftResult: cloneJson(lastCharacterCreatorSectionDraftResult),
      lastStateSafetyResult: cloneJson(lastStateSafetyResult),
      lastActivationResult: cloneJson(lastActivationResult),
      lastConclusionResult: cloneJson(lastConclusionResult),
      lastDirectivePresetInstallResult: cloneJson(lastDirectivePresetInstallResult),
      pendingDirectorTurn: cloneJson(pendingDirectorTurn),
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

  async function generateNarrationForLastTurnNow({
    provider = defaultNarrationProvider
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
      lastNarrationResult = {
        ok: true,
        narration,
        directiveGenerationStartedAt,
        autosave
      };
      return {
        ok: true,
        narration: cloneJson(narration),
        directiveGenerationStartedAt,
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
      }
      lastNarrationResult = {
        ok: false,
        error: cloneJson(failure),
        directiveGenerationStartedAt,
        checkpoint: cloneJson(narrationCheckpointSave)
      };
      return {
        ok: false,
        error: cloneJson(failure),
        directiveGenerationStartedAt,
        campaignState: cloneJson(campaignState),
        view: viewEnvelope('mission')
      };
    }
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

  function runtimeCampaignState() {
    return campaignState;
  }

  function setRuntimeCampaignState(state) {
    campaignState = cloneJson(state);
    syncCurrentChatScopeCampaignState(campaignState);
  }

  function persistCampaignStateDelta(state, summary) {
    return persistRuntimeCampaignState(
      state,
      typeof summary === 'string'
        ? summary
        : (summary?.summary || summary?.reason || 'Directive campaign state updated.')
    );
  }

  function ensureRuntimeStateDeltaGateway() {
    if (!runtimeStateDeltaGateway) {
      runtimeStateDeltaGateway = createStateDeltaGateway({
        getState: runtimeCampaignState,
        setState: setRuntimeCampaignState,
        persist: persistCampaignStateDelta,
        now
      });
    }
    return runtimeStateDeltaGateway;
  }

  function ensureV1MissionRuntime() {
    if (!v1MissionRuntime) {
      v1MissionRuntime = createV1MissionRuntime({
        getState: runtimeCampaignState,
        stateDeltaGateway: ensureRuntimeStateDeltaGateway(),
        generationRouter: defaultGenerationRouter,
        now,
        timeoutMs: 8000,
        episodeReviewTimeoutMs: 8000
      });
    }
    return v1MissionRuntime;
  }

  function resolveRuntimeSemanticAuthority(state = campaignState) {
    const runtimeAssets = activeRuntimeAssets();
    return resolveV1SemanticAuthorityContract({
      campaignState: state,
      runtimeAssets,
      definitionResolution: ensureV1MissionRuntime().resolveActiveDefinition(runtimeAssets)
    });
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

    const getCampaignState = runtimeCampaignState;
    const setCampaignState = setRuntimeCampaignState;
    const persistCampaignState = persistCampaignStateDelta;
    const stateDeltaGateway = ensureRuntimeStateDeltaGateway();
    const v1MissionRuntime = ensureV1MissionRuntime();
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
      settleV1MissionAcceptedPair: (input) => v1MissionRuntime.settleAcceptedPair(input),
      resolveV1SemanticAuthority: ({ campaignState: authorityState, runtimeAssets }) => (
        resolveV1SemanticAuthorityContract({
          campaignState: authorityState,
          runtimeAssets,
          definitionResolution: v1MissionRuntime.resolveActiveDefinition(runtimeAssets)
        })
      ),
      getRuntimeAssets: () => activeRuntimeAssets(),
      v1MissionSettlementTimeoutMs: 8000,
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
      turnCommitCoordinator,
      stateDeltaGateway,
      responseDispatcher,
      repairRuntime: repairRuntimeBoundary,
      coreTurnStore: runtimeCoreTurnStore,
      classify,
      orchestrator
    };
    return chatNativeServices;
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

  async function invalidateAcceptedV1Source(payload = {}, eventType = 'sourceChanged') {
    const hostMessageId = hostMessageIdFromPayload(payload);
    if (!hostMessageId) return { handled: false, reason: 'source-message-id-unavailable' };
    const authority = resolveRuntimeSemanticAuthority(campaignState);
    if (authority.mode !== 'authoritative') {
      return {
        handled: false,
        reason: authority.reasonCode || 'v1-authority-unavailable'
      };
    }
    const result = await ensureV1MissionRuntime().invalidateSourceMutation({
      runtimeAssets: activeRuntimeAssets(),
      hostMessageId,
      eventType
    });
    campaignState = applyRuntimeSettings(getCampaignState() || campaignState);
    if (result?.committedRoots?.length) {
      const prompt = await synchronizeActivePrompt(campaignState, {
        persist: false,
        forceRebuild: true,
        reason: 'Accepted source changed; rebuilt V1 projections.'
      });
      campaignState = prompt.campaignState || campaignState;
    }
    return {
      handled: result?.status === 'invalidated' || result?.status === 'no-change',
      sourceMutation: cloneJson(result),
      campaignState: cloneJson(campaignState)
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

    async buildV1PlayerProjection() {
      return run(async () => {
        await ensureInitialized();
        return cloneJson(buildV1RuntimePlayerProjection({
          campaignState,
          runtimeAssets: optionalActiveRuntimeAssets() || {}
        }));
      });
    },

    async prepareV1DutyReportDelivery(input = {}) {
      return run(async () => {
        await ensureInitialized();
        return cloneJson(ensureV1MissionRuntime().preparePendingDutyReport({
          ...input,
          runtimeAssets: optionalActiveRuntimeAssets() || {}
        }));
      });
    },

    async inspectV1PendingMissionTransition() {
      return run(async () => {
        await ensureInitialized();
        return cloneJson(ensureV1MissionRuntime().inspectPendingTransition({
          runtimeAssets: optionalActiveRuntimeAssets() || {}
        }));
      });
    },

    async activateV1PendingMissionTransition() {
      return run(async () => {
        await ensureInitialized();
        return cloneJson(await ensureV1MissionRuntime().activatePendingTransition({
          runtimeAssets: optionalActiveRuntimeAssets() || {}
        }));
      });
    },

    async prepareV1MissionTransitionNarration() {
      return run(async () => {
        await ensureInitialized();
        return cloneJson(ensureV1MissionRuntime().prepareTransitionNarration({
          runtimeAssets: optionalActiveRuntimeAssets() || {}
        }));
      });
    },

    async reviewV1PendingEpisodeNow() {
      return run(async () => {
        await ensureInitialized();
        return cloneJson(await ensureV1MissionRuntime().reviewPendingEpisode({
          runtimeAssets: optionalActiveRuntimeAssets() || {}
        }));
      });
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

    async flushRuntimeDiagnostics() {
      return run(async () => {
        await ensureInitialized();
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
        return invalidateAcceptedV1Source(payload, 'playerMessageEdited');
      });
    },

    async handleHostMessageDeleted(payload = {}) {
      return run(async () => {
        await ensureInitialized();
        await refreshCurrentChatCampaignScope();
        return invalidateAcceptedV1Source(payload, 'messageDeleted');
      });
    },

    async handleHostMessageVisibilityChanged(payload = {}) {
      return run(async () => {
        await ensureInitialized();
        await refreshCurrentChatCampaignScope();
        return invalidateAcceptedV1Source(payload, 'messageVisibilityChanged');
      });
    },

    async handleHostMessageSelectedSwipeChanged(payload = {}) {
      return run(async () => {
        await ensureInitialized();
        await refreshCurrentChatCampaignScope();
        return invalidateAcceptedV1Source(payload, 'assistantSwipeChanged');
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
        if (pendingDirectorTurn) {
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
      autosaveEveryMessages = null
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
        campaignState = applyRuntimeSettings(campaignState, {
          maxTurnSaveHistory: limit,
          autosaveEveryMessages: autosaveInterval
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
          `Runtime settings updated: ${limit} turn history, autosave every ${autosaveInterval} message(s).`
        );
        campaignState = applyRuntimeSettingsOverlay(campaignState, controller?.activeSaveId);
        await refreshCampaignView();
        return {
          kind: 'directive.runtimeSettingsUpdated',
          maxTurnSaveHistory: limit,
          historyLimit: limit,
          autosaveEveryMessages: autosaveInterval,
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
        lastDirectorTurn = null;
        lastNarrationResult = null;
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
        lastDirectorTurn = null;
        lastNarrationResult = null;
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

    async exportSupportDiagnostics({ includeStoryTranscript = false } = {}) {
      return run(async () => {
        await ensureInitialized();
        const view = viewEnvelope('settings');
        const messages = includeStoryTranscript && typeof runtimeHost?.chat?.getRecentMessages === 'function'
          ? await runtimeHost.chat.getRecentMessages({ limit: 100000, playerSafeOnly: true })
          : [];
        const exportedAt = new Date().toISOString();
        const diagnostics = buildSupportDiagnosticsExport({
          exportedAt,
          extensionVersion: view.directivePreset?.status?.bundledVersion || view.directivePreset?.bundledVersion || '',
          activeCampaignId: view.loadedSave?.campaignId || view.playerSafeCampaign?.campaign?.id || '',
          activeSaveId: view.activeSaveId || '',
          host: view.host || {},
          storageDiagnostics: view.storageDiagnostics || {},
          providerConfiguration: view.providerConfiguration || {},
          tracking: view.chatNative?.tracking || {},
          messages,
          includeStoryTranscript
        });
        return {
          kind: diagnostics.kind,
          fileName: `directive-support-diagnostics-${exportedAt.replace(/[:.]/g, '-')}.json`,
          exportedAt,
          jsonText: JSON.stringify(diagnostics, null, 2)
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
        activeScreen = 'campaign';
        return {
          coordinatorDiagnostics: cloneJson(result.coordinatorDiagnostics || null),
          turnPacket: cloneJson(result.turnPacket),
          narratorPacket: cloneJson(result.narratorPacket),
          commandLogPacket: cloneJson(result.commandLogPacket),
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
        lastNarrationResult = null;
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
      generateNarration = true,
      arbiterPlan = null,
      provider = defaultNarrationProvider
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        requireObject(pendingDirectorTurn, 'pendingDirectorTurn');
        const semanticAuthority = resolveRuntimeSemanticAuthority(campaignState);
        if (semanticAuthority.mode !== 'authoritative') {
          const error = new Error('Directive V1 authority is required before a Director turn can commit.');
          error.code = 'DIRECTIVE_V1_AUTHORITY_REQUIRED';
          error.details = { reasonCode: semanticAuthority.reasonCode || 'authority-unavailable' };
          throw error;
        }
        const turnPacketForCommit = arbiterPlan
          ? { ...pendingDirectorTurn, arbiterPlan: cloneJson(arbiterPlan) }
          : pendingDirectorTurn;
        const beforeCampaignState = cloneJson(campaignState);
        const result = commitProvisionalDirectorTurnRuntime({
          campaignState,
          turnPacket: turnPacketForCommit
        });
        const committedCandidateState = await ensureDirectRuntimeCoreIngress({
          state: result.campaignState,
          turnPacket: result.mechanicsTurnPacket || result.turnPacket,
          playerInput: pendingDirectorTurn?.sceneSnapshot?.playerInput,
          observedAt: timestampFromNow(now)
        });
        const mechanicsIngressId = committedCandidateState.runtimeTracking?.activeIngressId || null;
        const mechanicsCheckpoint = await ensureTurnCommitCoordinator().checkpointMechanics({
          beforeCampaignState,
          campaignState: committedCandidateState,
          turnPacket: result.turnPacket,
          ingressId: mechanicsIngressId
        });
        campaignState = mechanicsCheckpoint.campaignState;
        lastMechanicsCheckpointState = cloneJson(campaignState);
        lastDirectorTurn = result.turnPacket;
        pendingDirectorTurn = null;
        lastNarrationResult = null;
        activeScreen = 'campaign';
        const narrationResult = generateNarration
          ? await generateNarrationForLastTurnNow({
              provider,
              scheduleDeferredCommandLogSummary: false
            })
          : null;
        return {
          coordinatorDiagnostics: {
            continuityProjection: cloneJson(result.turnPacket?.provenance?.continuityProjection || null)
          },
          turnPacket: cloneJson(result.turnPacket),
          narratorPacket: cloneJson(result.narratorPacket),
          mechanicsCheckpoint: cloneJson(mechanicsCheckpoint),
          semanticAuthority: cloneJson(semanticAuthority),
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
        return viewEnvelope('mission');
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
